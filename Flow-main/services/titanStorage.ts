import { Book } from '../types';

/**
 * TitanStorage
 * The persistent memory layer. Uses IndexedDB to store heavy book content.
 * Replaces the fragile localStorage implementation.
 * 
 * v2: Added 'covers' store for blob-based cover image persistence.
 */
export class TitanStorage {
  private static instance: TitanStorage;
  private dbName = 'FlowLibraryDB';
  private version = 3; // BUMP VERSION for 'covers' store
  private db: IDBDatabase | null = null;

  private constructor() {}

  public static getInstance(): TitanStorage {
    if (!TitanStorage.instance) {
      TitanStorage.instance = new TitanStorage();
    }
    return TitanStorage.instance;
  }

  public async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        
        // Store for full book objects (including content)
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }
        
        // Store for lightweight metadata (fast list loading)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'id' });
        }

        // Store for Raw EPUB Binaries (For Cloud Upload/Restore)
        if (!db.objectStoreNames.contains('sources')) {
          db.createObjectStore('sources'); // Key: Book ID, Value: ArrayBuffer
        }

        // Store for Cover Image Blobs (Persist across reloads)
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers'); // Key: Book ID, Value: Blob
        }

        // Store for tracking deleted books (prevent re-download from cloud)
        if (!db.objectStoreNames.contains('deletions')) {
          db.createObjectStore('deletions'); // Key: Book ID, Value: timestamp
        }
      };

      request.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };
    });
  }

  public async saveBook(book: Book): Promise<void> {
    await this.init();
    
    // Split book into heavy and light parts
    const { chapters, ...metadata } = book;
    
    // Save Content
    await this.put('books', book);
    // Save Metadata
    await this.put('metadata', metadata);
  }

  public async saveSource(id: string, buffer: ArrayBuffer): Promise<void> {
      await this.init();
      await this.put('sources', buffer, id);
  }

  public async getSource(id: string): Promise<ArrayBuffer | undefined> {
      await this.init();
      return this.get('sources', id);
  }

  public async deleteBook(id: string): Promise<void> {
    await this.init();
    await this.delete('books', id);
    await this.delete('metadata', id);
    await this.delete('sources', id);
    await this.delete('covers', id); // Also delete cached cover
    // Record deletion timestamp to prevent re-download from cloud
    await this.put('deletions', Date.now(), id);
    
    // Clean up localStorage backup
    try {
      localStorage.removeItem(`book_progress_${id}`);
    } catch (e) {
      // Non-fatal if localStorage is unavailable
    }
  }

  public async wasDeletionRecorded(id: string): Promise<boolean> {
    await this.init();
    const result = await this.get('deletions', id);
    return result !== undefined;
  }

  /**
   * Clean up localStorage backups for books that no longer exist.
   * Call this on app startup to prevent localStorage bloat.
   */
  public async cleanupOrphanedBackups(): Promise<void> {
    try {
      const allBooks = await this.getAllMetadata();
      const validBookIds = new Set(allBooks.map(b => b.id));
      
      // Scan localStorage for book progress backups
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('book_progress_')) {
          const bookId = key.replace('book_progress_', '');
          if (!validBookIds.has(bookId)) {
            keysToRemove.push(key);
          }
        }
      }
      
      // Remove orphaned entries
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      if (keysToRemove.length > 0) {
        console.log(`[TitanStorage] Cleaned up ${keysToRemove.length} orphaned localStorage backups`);
      }
    } catch (e) {
      console.warn('[TitanStorage] Failed to cleanup localStorage backups:', e);
    }
  }

  public async getAllMetadata(): Promise<Book[]> {
    await this.init();
    return this.getAll('metadata');
  }

  public async getFullBook(id: string): Promise<Book | undefined> {
    await this.init();
    return this.get('books', id);
  }

  // MARK: - Cover Blob Storage (v2)

  /**
   * Save a cover image blob for a book.
   * @param id Book ID
   * @param blob Cover image blob
   */
  public async saveCoverBlob(id: string, blob: Blob): Promise<void> {
    await this.init();
    await this.put('covers', blob, id);
  }

  /**
   * Get a cached cover blob for a book.
   * @param id Book ID
   * @returns The cover blob, or undefined if not cached
   */
  public async getCoverBlob(id: string): Promise<Blob | undefined> {
    await this.init();
    return this.get('covers', id);
  }

  /**
   * Delete a cached cover blob.
   * @param id Book ID
   */
  public async deleteCoverBlob(id: string): Promise<void> {
    await this.init();
    await this.delete('covers', id);
  }

  // Generic IDB Helpers

  private async put(storeName: string, value: any, key?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = key ? store.put(value, key) : store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async get(storeName: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async getAll(storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async delete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}