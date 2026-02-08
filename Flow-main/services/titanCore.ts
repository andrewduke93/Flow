import { Book } from '../types';
import { calculateWordCount } from '../utils';
import { TitanSettingsService } from './configService';
import { RSVPConductor } from './rsvpConductor';

/**
 * WebTextContentStorage
 */
export class WebTextContentStorage {
  private _content: string = "";
  public attributes: Record<string, string> = {};
  private layoutManagers: WebTextLayoutManager[] = [];

  get string(): string { return this._content; }
  set string(val: string) { this._content = val; }
  addLayoutManager(manager: WebTextLayoutManager) { this.layoutManagers.push(manager); }
}

/**
 * WebTextContainer
 */
export class WebTextContainer {
  public size: { width: number; height: number };
  public widthTracksTextView: boolean = false;
  public heightTracksTextView: boolean = false;
  public lineFragmentPadding: number = 5.0;
  constructor(size: { width: number; height: number }) { this.size = size; }
}

/**
 * WebTextLayoutManager
 */
export class WebTextLayoutManager {
  public id: string;
  public textContainers: WebTextContainer[] = [];
  constructor(id: string) { this.id = id; }
  public addTextContainer(container: WebTextContainer) { this.textContainers.push(container); }
  public enumerateTextSegments(
    range: { location: number; length: number },
    type: 'standard' | 'selection',
    block: (frame: { x: number; y: number; width: number; height: number }) => boolean
  ): void {
    const mockFrame = { x: 0, y: 0, width: 0, height: 0 }; 
    block(mockFrame);
  }
}

/**
 * TitanCore
 * The central nervous system of the reading engine.
 */
export class TitanCore {
  private static instance: TitanCore;
  private listeners: Set<() => void> = new Set();
  private jumpListeners: Set<(percentage: number) => void> = new Set();
  private offsetJumpListeners: Set<(offset: number) => void> = new Set();
  private progressListeners: Set<(progress: number) => void> = new Set();

  public contentStorage: WebTextContentStorage;
  public primaryLayout: WebTextLayoutManager;
  public ghostLayout: WebTextLayoutManager;

  public isLoading: boolean = false;
  public loadingProgress: number = 0; // 0.0 to 1.0

  public currentBook: Book | null = null;
  public currentProgress: number = 0;
  public isRSVPMode: boolean = false;
  
  public globalCharacterOffset: number = 0;
  public userSelectionOffset: number | null = null;

  // -- NUCLEAR OPTION STATE --
  public totalTokens: number = 1; // Default to 1 to avoid div/0
  // Accurate mapping of which token index starts each chapter
  public chapterTokenOffsets: number[] = []; 
  
  private _loadTimestamp: number = 0; // For Safe Guard
  private _lastSavedTokenIndex: number = -1; // Deduplication guard
  private _userIntentionalRewind: boolean = false; // Allow user rewinds to 0

  private constructor() {
    this.contentStorage = new WebTextContentStorage();
    this.primaryLayout = new WebTextLayoutManager('primary');
    this.ghostLayout = new WebTextLayoutManager('ghost');
    this.configurePipeline();
    TitanSettingsService.getInstance().subscribe(() => this.updateTypography());
  }

  public static getInstance(): TitanCore {
    if (!TitanCore.instance) TitanCore.instance = new TitanCore();
    return TitanCore.instance;
  }

  private configurePipeline() {
    this.contentStorage.addLayoutManager(this.primaryLayout);
    this.contentStorage.addLayoutManager(this.ghostLayout);
  }

  public async load(book: Book): Promise<void> {
    this._loadTimestamp = Date.now();
    this._lastSavedTokenIndex = -1;
    this._userIntentionalRewind = false;
    this.isLoading = true;
    this.loadingProgress = 0.1;
    this.notify();

    const mutableBook = { ...book };

    // CACHE HIT - Check localStorage backup for latest progress
    if (this.currentBook?.id === book.id && this.contentStorage.string.length > 0) {
        // Always check localStorage for most recent progress (survives crashes/reloads)
        let restoredIndex = mutableBook.lastTokenIndex;
        try {
            const backupKey = `book_progress_${book.id}`;
            const backup = localStorage.getItem(backupKey);
            if (backup) {
                const parsed = JSON.parse(backup);
                // Use backup if it's newer and valid
                if (parsed.lastTokenIndex !== undefined && 
                    (restoredIndex === undefined || parsed.lastTokenIndex > restoredIndex)) {
                    restoredIndex = parsed.lastTokenIndex;
                }
            }
        } catch (e) {
            console.warn('[TitanCore] Failed to restore from localStorage backup:', e);
        }
        
        if (restoredIndex !== undefined) {
             this.currentBook.lastTokenIndex = restoredIndex;
             if (this.totalTokens > 0) {
                 this.currentProgress = Math.min(1, restoredIndex / this.totalTokens);
             }
        }
        this.currentBook.bookmarkProgress = this.currentProgress;
        this._lastSavedTokenIndex = this.currentBook.lastTokenIndex || 0;
        this.isLoading = false;
        this.loadingProgress = 1.0;
        this.notify();
        return;
    }

    // FRESH LOAD - ULTRA FAST PATH
    this.unload();
    
    try {
        const chapters = mutableBook.chapters ? [...mutableBook.chapters] : [];
        chapters.sort((a, b) => a.sortOrder - b.sortOrder);
        
        const totalChapters = chapters.length;
        if (totalChapters === 0) {
            this.isLoading = false;
            this.loadingProgress = 1.0;
            this.notify();
            return;
        }

        // PHASE 1: INSTANT - Just extract text (no tokenization)
        // Single pass, no yields, no async breaks
        this.chapterTokenOffsets = [];
        const cleanChunks: string[] = new Array(totalChapters);
        let estimatedTokens = 0;
        
        for (let i = 0; i < totalChapters; i++) {
            const raw = chapters[i].content || "";
            // Fast regex strip - no DOM parsing
            const clean = raw
                .replace(/<[^>]*>/g, ' ')
                .replace(/&[a-z]+;/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            cleanChunks[i] = clean;
            
            // Estimate tokens (fast approximation: split by space)
            const wordCount = clean ? clean.split(/\s+/).length : 0;
            this.chapterTokenOffsets.push(estimatedTokens);
            estimatedTokens += wordCount;
        }
        
        this.totalTokens = Math.max(1, estimatedTokens);
        this.contentStorage.string = cleanChunks.join("\n\n");
        this.currentBook = mutableBook;
        
        // Hydrate progress - Check localStorage backup first (most recent)
        let restoredIndex = mutableBook.lastTokenIndex;
        try {
            const backupKey = `book_progress_${mutableBook.id}`;
            const backup = localStorage.getItem(backupKey);
            if (backup) {
                const parsed = JSON.parse(backup);
                // Use backup if it's newer and valid
                if (parsed.lastTokenIndex !== undefined && 
                    (restoredIndex === undefined || parsed.lastTokenIndex > restoredIndex)) {
                    restoredIndex = parsed.lastTokenIndex;
                    console.log('[TitanCore] Restored progress from localStorage backup');
                }
            }
        } catch (e) {
            console.warn('[TitanCore] Failed to restore from localStorage backup:', e);
        }
        
        if (restoredIndex !== undefined) {
            this.currentBook.lastTokenIndex = restoredIndex;
            this.currentProgress = Math.min(1, restoredIndex / this.totalTokens);
        } else {
            this.currentProgress = mutableBook.bookmarkProgress || 0;
            if (this.currentProgress > 0) {
                this.currentBook.lastTokenIndex = Math.floor(this.currentProgress * this.totalTokens);
            }
        }
        
        this.currentBook.bookmarkProgress = this.currentProgress;
        this._lastSavedTokenIndex = this.currentBook.lastTokenIndex || 0;
        this.updateTypography();
        
        // DONE - Reader can now render
        this.isLoading = false;
        this.loadingProgress = 1.0;
        this.notify();

        // PHASE 2: BACKGROUND - Tokenize for RSVP (non-blocking)
        // This happens AFTER the reader is already visible
        requestIdleCallback?.(() => {
            RSVPConductor.getInstance().prepare(this.contentStorage.string).catch(() => {});
        }) || setTimeout(() => {
            RSVPConductor.getInstance().prepare(this.contentStorage.string).catch(() => {});
        }, 100);

    } catch (error) {
        console.error("[TitanCore] Error:", error);
        this.isLoading = false;
        this.loadingProgress = 1.0;
        this.notify();
    }
  }

  public unload() {
      this.currentBook = null;
      this.contentStorage.string = "";
      this.userSelectionOffset = null;
      this.isRSVPMode = false;
      this.totalTokens = 1; 
      this.chapterTokenOffsets = [];
      this._lastSavedTokenIndex = -1;
      this._userIntentionalRewind = false;
  }

  public updateTypography() {
    const settings = TitanSettingsService.getInstance().getSettings();
    let fontFamily = '"New York Extra Large", "Times New Roman", serif';
    if (settings.fontFamily === 'SF Pro') fontFamily = '"SF Pro Rounded", -apple-system, sans-serif';
    if (settings.fontFamily === 'OpenDyslexic') fontFamily = '"OpenDyslexic", "Comic Sans MS", sans-serif';
    if (settings.fontFamily === 'Atkinson Hyperlegible') fontFamily = '"Atkinson Hyperlegible", sans-serif';

    const weight = settings.fontSize < 18 ? '500' : (settings.fontSize > 32 ? '300' : '400');
    this.contentStorage.attributes = {
      fontFamily: fontFamily,
      fontSize: `${settings.fontSize}px`,
      lineHeight: `${settings.lineHeight}`,
      paragraphSpacing: `${settings.paragraphSpacing}px`,
      letterSpacing: '0.2px',
      fontWeight: weight,
      color: 'inherit' 
    };
    this.notify();
  }

  public updateLayout(size: { width: number; height: number }): void {
    this.primaryLayout.textContainers = [];
    const container = new WebTextContainer(size);
    container.widthTracksTextView = true;
    this.primaryLayout.addTextContainer(container);
    this.notify();
  }

  /**
   * NUCLEAR SAVE FUNCTION (With Safe Guards & Deduplication)
   */
  public saveProgress(tokenIndex: number, isUserAction: boolean = false) {
    if (!this.currentBook) return;
    if (typeof tokenIndex !== 'number' || tokenIndex < 0) return;

    // DEDUPLICATION: Skip if same as last save (reduces IDB writes)
    if (tokenIndex === this._lastSavedTokenIndex && !isUserAction) {
        return;
    }

    // Track intentional rewinds to start
    if (isUserAction && tokenIndex === 0) {
        this._userIntentionalRewind = true;
    }

    // SAFE GUARD: Prevent accidental reset to 0 during load
    // Unless user explicitly requested it via chapter jump or scrub
    const timeSinceLoad = Date.now() - this._loadTimestamp;
    const existingIndex = this.currentBook.lastTokenIndex || 0;
    
    if (tokenIndex === 0 && existingIndex > 50 && timeSinceLoad < 3000 && !this._userIntentionalRewind) {
        return;
    }

    // Update deduplication guard
    this._lastSavedTokenIndex = tokenIndex;

    // 1. Save the hard integer (The Truth)
    this.currentBook.lastTokenIndex = tokenIndex;
    
    // 2. Derive the percentage
    let percent = 0;
    if (this.totalTokens > 0) {
        percent = tokenIndex / this.totalTokens;
    }
    
    if (isNaN(percent) || !isFinite(percent)) percent = 0;
    
    this.currentProgress = Math.min(1, Math.max(0, percent));
    this.currentBook.bookmarkProgress = this.currentProgress;
    this.currentBook.lastOpened = new Date();

    // 3. AUTO-COMPLETE LOGIC
    // If we are extremely close to the end, just mark it finished.
    if (this.currentProgress >= 0.99) {
        this.currentBook.isFinished = true;
    }
      
    this.progressListeners.forEach(cb => cb(this.currentProgress));
    
    // Notify general subscribers for UI sync (e.g., background scroll in RSVP mode)
    this.notify();
    
    // 4. IMMEDIATE BACKUP TO LOCALSTORAGE (Synchronous - Survives crashes)
    // This ensures we never lose more than a few seconds of reading progress
    try {
        const backupKey = `book_progress_${this.currentBook.id}`;
        localStorage.setItem(backupKey, JSON.stringify({
            lastTokenIndex: tokenIndex,
            bookmarkProgress: this.currentProgress,
            timestamp: Date.now()
        }));
    } catch (e) {
        // localStorage full or disabled - non-fatal
        console.warn('[TitanCore] localStorage backup failed:', e);
    }
  }

  public restorePosition(totalScrollHeight: number, clientHeight: number): number {
    return 0; 
  }

  public jump(percentage: number) {
    this.currentProgress = Math.max(0, Math.min(1, percentage));
    
    if (this.currentBook && this.totalTokens > 0) {
        const estimatedIndex = Math.floor(percentage * this.totalTokens);
        this.currentBook.lastTokenIndex = estimatedIndex;
        this.currentBook.bookmarkProgress = this.currentProgress;
        // Broadcast to ALL listeners to ensure UI/Scrubber sync
        this.jumpListeners.forEach(cb => cb(percentage)); 
        this.progressListeners.forEach(cb => cb(percentage)); 
    }
    this.notify();
  }

  /**
   * Jumps precisely to the start of a chapter.
   */
  public jumpToChapter(chapterIndex: number) {
      if (chapterIndex < 0 || chapterIndex >= this.chapterTokenOffsets.length) return;
      
      const tokenIndex = this.chapterTokenOffsets[chapterIndex];
      
      // Mark as intentional if jumping to chapter 0
      if (chapterIndex === 0) {
          this._userIntentionalRewind = true;
      }
      
      this.currentBook!.lastTokenIndex = tokenIndex;
      
      if (this.totalTokens > 0) {
          this.currentProgress = tokenIndex / this.totalTokens;
          this.currentBook!.bookmarkProgress = this.currentProgress;
      }
      
      // Broadcast to ALL listeners to ensure UI/Scrubber sync
      this.jumpListeners.forEach(cb => cb(this.currentProgress));
      this.progressListeners.forEach(cb => cb(this.currentProgress)); 
      
      this.notify();
  }
  
  public syncFromRSVP(charOffset: number, tokenIndex: number) {
      this.globalCharacterOffset = charOffset;
      this.saveProgress(tokenIndex);
      this.offsetJumpListeners.forEach(cb => cb(charOffset));
  }

  public selectText(offset: number) {
      this.userSelectionOffset = offset;
      this.notify();
  }

  public onJump(callback: (percentage: number) => void): () => void {
    this.jumpListeners.add(callback);
    return () => this.jumpListeners.delete(callback);
  }

  public onOffsetJump(callback: (offset: number) => void): () => void {
    this.offsetJumpListeners.add(callback);
    return () => this.offsetJumpListeners.delete(callback);
  }
  
  public onProgress(callback: (progress: number) => void): () => void {
      this.progressListeners.add(callback);
      return () => this.progressListeners.delete(callback);
  }

  public rectForRange(range: { location: number; length: number }): { x: number; y: number; width: number; height: number } | null {
    return null;
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public notify() {
    this.listeners.forEach(cb => cb());
  }
}