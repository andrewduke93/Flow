import { GoogleDriveService } from "./googleDriveService";
import { TitanStorage } from "./titanStorage";
import { IngestionService } from "./ingestionService";
import { TitanSettingsService } from "./configService";
import { Book, SyncState } from "../types";

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

interface SyncListener {
    onStatusChange?: (status: SyncStatus) => void;
    onConflict?: (local: Book, remoteProgress: number) => void;
    onNewBook?: (book: Book) => void;
}

/**
 * SyncManager (v2.0 - Robust)
 * 
 * ARCHITECTURE CHANGE:
 * 1. Two-Phase Sync: Sync State (Fast) -> Sync Content (Slow/Background).
 * 2. Fingerprinting: Matches books by Title/Author to prevent duplicates.
 * 3. Debouncing: Prevents network spamming during rapid progress updates.
 */
export class SyncManager {
  private static instance: SyncManager;
  private drive: GoogleDriveService;
  private storage: TitanStorage;
  private ingestion: IngestionService;
  private settings: TitanSettingsService;

  public status: SyncStatus = 'idle';
  private listeners: Set<SyncListener> = new Set();
  
  // Debounce & Queue Control
  private syncTimer: any; // Periodic background timer
  private debounceTimer: any; // For rapid updates
  private isSyncing: boolean = false;
  private pendingSync: boolean = false;

  private constructor() {
    this.drive = GoogleDriveService.getInstance();
    this.storage = TitanStorage.getInstance();
    this.ingestion = IngestionService.getInstance();
    this.settings = TitanSettingsService.getInstance();
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  public subscribe(listener: SyncListener): () => void {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
  }

  private notifyStatus(s: SyncStatus) {
      this.status = s;
      this.listeners.forEach(l => l.onStatusChange?.(s));
  }

  public async connect(): Promise<string> {
      try {
          await this.drive.signIn();
          const email = await this.drive.getUserInfo();
          
          this.settings.updateSettings({ 
              isSyncEnabled: true, 
              googleDriveEmail: email 
          });
          
          // Force immediate full sync on connect
          this.syncNow(true);
          
          // Start background heartbeat (every 5 mins is enough if we have triggers)
          if (this.syncTimer) clearInterval(this.syncTimer);
          this.syncTimer = setInterval(() => this.syncNow(false), 300000);

          return email;
      } catch (e) {
          console.error(e);
          throw new Error("Failed to connect Google Drive");
      }
  }

  /**
   * Request a sync.
   * This is now DEBOUNCED. It waits 2 seconds for things to settle before firing.
   */
  public requestSync() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
          this.syncNow(false);
      }, 2000);
  }

  public async syncNow(interactive: boolean = false) {
      if (!this.settings.getSettings().isSyncEnabled) return;
      
      // Guard: Background syncs require auth. Interactive syncs trigger auth.
      if (!interactive && !this.drive.isAuthenticated) return;

      if (this.isSyncing) {
          this.pendingSync = true;
          return;
      }

      this.isSyncing = true;
      this.notifyStatus('syncing');

      try {
          // PHASE 1: FAST SYNC (Metadata & Progress)
          // This ensures the user sees their progress update immediately across devices.
          await this.syncState();

          // PHASE 2: CONTENT SYNC (Upload/Download Files)
          // This handles the heavy lifting in the background.
          await this.syncBooks();

          this.notifyStatus('success');
          setTimeout(() => this.notifyStatus('idle'), 3000);

      } catch (e) {
          console.error("[SyncManager] Sync failed", e);
          this.notifyStatus('error');
      } finally {
          this.isSyncing = false;
          // If a request came in while we were working, go again.
          if (this.pendingSync) {
              this.pendingSync = false;
              this.syncNow(false);
          }
      }
  }

  /**
   * PHASE 1: SYNC STATE (JSON)
   * Handles progress, read status, and settings.
   */
  private async syncState() {
      const localMetadata = await this.storage.getAllMetadata();
      const remoteState = await this.drive.getSyncState();

      if (!remoteState) {
          // Init Remote
          const payload = this.buildSyncState(localMetadata);
          await this.drive.saveSyncState(payload);
          return;
      }

      // 1. Sync Preferences
      if (remoteState.preferences) {
          const current = this.settings.getSettings();
          // Only update if remote is different to avoid react churn
          if (JSON.stringify(current) !== JSON.stringify(remoteState.preferences)) {
              this.settings.updateSettings(remoteState.preferences);
          }
      }

      // 2. Sync Books (Smart Merge)
      let needsUpload = false;
      const remoteBooks = remoteState.books || {};

      for (const book of localMetadata) {
          // Fingerprint: Match by DriveID OR (Title + Author)
          const fingerprint = this.getFingerprint(book);
          
          // Find matching entry in remote state
          // We search keys (which might be random IDs) for matching driveId or fingerprint
          let remoteEntryKey = Object.keys(remoteBooks).find(k => {
              const rb = remoteBooks[k];
              // Match by DriveID
              if (book.driveId && rb.driveId === book.driveId) return true;
              // Match by Fingerprint (Legacy/Cross-device import match)
              return false; // Sync state usually relies on IDs.
          });

          // Special case: If we don't have a remote key, but we have a driveId on the book,
          // we might need to look deeper or just add it.
          
          if (remoteEntryKey) {
              const remoteData = remoteBooks[remoteEntryKey];
              
              // CONFLICT RESOLUTION: "Furthest Read" + "Newest Timestamp"
              // We prioritize the furthest progress unless the user explicitly reset (timestamp check).
              
              const localTime = new Date(book.lastOpened).getTime();
              const remoteTime = remoteData.lastOpened;
              
              // Is Remote Significantly Newer? (> 10 seconds difference)
              const isRemoteNewer = remoteTime > (localTime + 10000);
              const isLocalNewer = localTime > (remoteTime + 10000);

              if (isRemoteNewer) {
                  // Remote is newer, accept it
                  await this.applyRemoteUpdate(book, remoteData);
              } else if (isLocalNewer) {
                  // Local is newer, push it
                  remoteBooks[remoteEntryKey] = this.mapBookToSyncEntry(book);
                  needsUpload = true;
              } else {
                  // Timestamps are close. Merge strategy: Max Progress.
                  if ((remoteData.progress || 0) > (book.bookmarkProgress || 0)) {
                       await this.applyRemoteUpdate(book, remoteData);
                  } else if ((book.bookmarkProgress || 0) > (remoteData.progress || 0)) {
                       remoteBooks[remoteEntryKey] = this.mapBookToSyncEntry(book);
                       needsUpload = true;
                  }
              }
          } else {
              // Local book not in remote state. Add it.
              // Use book ID as key
              remoteBooks[book.id] = this.mapBookToSyncEntry(book);
              needsUpload = true;
          }
      }

      if (needsUpload) {
          remoteState.timestamp = Date.now();
          remoteState.books = remoteBooks;
          await this.drive.saveSyncState(remoteState);
      }
  }

  /**
   * PHASE 2: SYNC BOOKS (Binary Files)
   * Handles downloading missing books and uploading new ones.
   */
  private async syncBooks() {
      const remoteFiles = await this.drive.listBooks();
      const localMetadata = await this.storage.getAllMetadata();
      
      // Index Local Books for O(1) Lookup
      const mapByDriveId = new Map<string, Book>();
      const mapByFingerprint = new Map<string, Book>();

      localMetadata.forEach(b => {
          if (b.driveId) mapByDriveId.set(b.driveId, b);
          mapByFingerprint.set(this.getFingerprint(b), b);
      });

      // A. DOWNLOAD (Drive -> Local)
      for (const file of remoteFiles) {
          if (mapByDriveId.has(file.id)) continue;

          // DEDUPLICATION MAGIC
          // Check if we have a local book with same Title/Author but no Drive ID
          const parsed = this.parseFilename(file.name);
          const fingerprint = `${parsed.title}|${parsed.author}`;
          const existingLocal = mapByFingerprint.get(fingerprint);

          if (existingLocal) {
              // Found a match! Just link them. No download needed.
              console.log(`[Sync] Linking existing book "${existingLocal.title}" to Drive ID: ${file.id}`);
              existingLocal.driveId = file.id;
              await this.storage.saveBook(existingLocal);
              continue;
          }

          // Real Download
          try {
              console.log(`[Sync] Downloading new book: ${file.name}`);
              const buffer = await this.drive.downloadFile(file.id);
              
              let book: Book;
              const isText = file.name.toLowerCase().endsWith('.txt') || file.mimeType === 'text/plain';

              if (isText) {
                  const decoder = new TextDecoder();
                  const text = decoder.decode(buffer);
                  book = await this.ingestion.ingestFromText(parsed.title, parsed.author, text);
              } else {
                  // Wrap in fake file for IngestionService
                  const blob = new Blob([buffer], { type: 'application/epub+zip' });
                  const fakeFile = new File([blob], file.name, { type: 'application/epub+zip' });
                  book = await this.ingestion.ingest(fakeFile);
              }

              book.driveId = file.id;
              book.sourceType = isText ? 'text' : 'epub';

              await this.storage.saveBook(book);
              this.listeners.forEach(l => l.onNewBook?.(book));
          } catch (e) {
              console.error(`[Sync] Download failed for ${file.name}`, e);
          }
      }

      // B. UPLOAD (Local -> Drive)
      for (const book of localMetadata) {
          if (!book.driveId) {
              try {
                  const source = await this.storage.getSource(book.id);
                  if (source) {
                      console.log(`[Sync] Uploading: ${book.title}`);
                      
                      let blob: Blob;
                      let name: string;

                      if (book.sourceType === 'text') {
                          blob = new Blob([source], { type: 'text/plain' });
                          name = `${this.sanitizeFilename(book.title)} - ${this.sanitizeFilename(book.author)}.txt`;
                      } else {
                          blob = new Blob([source], { type: 'application/epub+zip' });
                          name = `${this.sanitizeFilename(book.title)}.epub`; 
                      }
                      
                      const driveId = await this.drive.uploadFile(name, blob);
                      book.driveId = driveId;
                      await this.storage.saveBook(book);
                  }
              } catch (e) {
                  console.error(`[Sync] Upload failed for ${book.title}`, e);
              }
          }
      }
  }

  // MARK: - Helpers

  private async applyRemoteUpdate(localBook: Book, remoteData: any) {
      // Only update if actually different
      if (localBook.bookmarkProgress !== remoteData.progress || localBook.isFinished !== remoteData.isFinished) {
          localBook.bookmarkProgress = remoteData.progress;
          localBook.lastTokenIndex = remoteData.lastTokenIndex;
          localBook.isFinished = remoteData.isFinished;
          localBook.lastOpened = new Date(remoteData.lastOpened);
          
          await this.storage.saveBook(localBook);
          // Notify UI to re-render list
          this.listeners.forEach(l => l.onNewBook?.(localBook)); 
      }
  }

  private buildSyncState(books: Book[]): SyncState {
      const state: SyncState = {
          version: 1,
          timestamp: Date.now(),
          books: {},
          preferences: this.settings.getSettings()
      };
      books.forEach(b => {
          state.books[b.id] = this.mapBookToSyncEntry(b);
      });
      return state;
  }

  private mapBookToSyncEntry(b: Book) {
      return {
          progress: b.bookmarkProgress,
          lastTokenIndex: b.lastTokenIndex,
          isFinished: b.isFinished,
          lastOpened: new Date(b.lastOpened).getTime(),
          driveId: b.driveId
      };
  }

  private getFingerprint(b: Book): string {
      return `${b.title.trim().toLowerCase()}|${b.author.trim().toLowerCase()}`;
  }

  private parseFilename(filename: string): { title: string, author: string } {
      const baseName = filename.replace(/\.(txt|epub)$/i, '');
      const parts = baseName.split(' - ');
      if (parts.length >= 2) {
          return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
      }
      return { title: baseName.trim(), author: "Unknown Author" };
  }

  private sanitizeFilename(str: string): string {
      return str.replace(/[^a-z0-9 \-_]/gi, '').trim();
  }

  public resolveConflict(book: Book, remoteProgress: number) {
      book.bookmarkProgress = remoteProgress;
      this.storage.saveBook(book);
      this.listeners.forEach(l => l.onNewBook?.(book));
  }
}