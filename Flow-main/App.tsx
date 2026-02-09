import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { TitanLibrary } from './components/TitanLibrary';
import { TitanCore } from './services/titanCore';
import { TitanStorage } from './services/titanStorage';
import { SyncManager, SyncStatus } from './services/syncManager';
import { generateMockBooks } from './services/mockData';
import { CoverService } from './services/coverService';
import { Book } from './types';
import { useTitanTheme } from './services/titanTheme';
import { SyncToast } from './components/SyncToast';

// Lazy load heavy components
const ReaderContainer = lazy(() => import('./components/ReaderContainer').then(m => ({ default: m.ReaderContainer })));

/**
 * App (The Canvas)
 * Identity: Systems UI Architect.
 * Mission: A pure Z-Stack. Library is the wallpaper. Reader is the window.
 */
const App: React.FC = () => {
  const theme = useTitanTheme();
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const isHandlingPopState = useRef(false);
  
  // Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [conflictBook, setConflictBook] = useState<{ book: Book, remote: number } | null>(null);

  // CRITICAL: Keep a ref to books for synchronous access during unload/autosave
  const booksRef = useRef<Book[]>([]);
  const currentBookIdRef = useRef<string | null>(null);
  
  // Keep ref in sync
  useEffect(() => {
    currentBookIdRef.current = currentBookId;
  }, [currentBookId]);

  // Browser back button handling - use ref to avoid re-registering listener
  useEffect(() => {
    const handlePopState = () => {
      const bookId = currentBookIdRef.current;
      if (isHandlingPopState.current || !bookId) return;
      isHandlingPopState.current = true;
      
      const book = booksRef.current.find(b => b.id === bookId);
      if (book) {
        const engine = TitanCore.getInstance();
        // Call close handler inline to avoid stale closure
        const safeProgress = (isNaN(engine.currentProgress) || !isFinite(engine.currentProgress)) ? 0 : engine.currentProgress;
        const updatedBook: Book = {
          ...book,
          lastTokenIndex: engine.currentBook?.lastTokenIndex ?? book.lastTokenIndex ?? 0,
          bookmarkProgress: safeProgress,
          isFinished: safeProgress >= 0.99 || engine.currentBook?.isFinished || false,
          lastOpened: new Date()
        };
        const newList = booksRef.current.map(b => b.id === bookId ? updatedBook : b);
        setBooks(newList);
        TitanStorage.getInstance().saveBook(updatedBook);
        SyncManager.getInstance().syncNow(false);
        setCurrentBookId(null);
      }
      
      isHandlingPopState.current = false;
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []); // Empty deps - uses refs

  // 1. INITIAL LOAD
  useEffect(() => {
    // Init Singletons
    TitanCore.getInstance();
    const storage = TitanStorage.getInstance();
    const syncer = SyncManager.getInstance();
    
    const boot = async () => {
        try {
            // Init Storage
            await storage.init();
            
            // Load Books (Metadata only for speed)
            let loadedBooks = await storage.getAllMetadata();
            
            // First Run Mock Data
            if (loadedBooks.length === 0) {
                const mocks = generateMockBooks();
                for (const b of mocks) {
                    await storage.saveBook(b);
                }
                loadedBooks = mocks;
            } else {
                // REPAIR: Ensure welcome book always exists with valid content
                // This handles: missing welcome book, corrupted content, or deleted by user
                const welcomeBookId = 'guide-book-v1';
                const welcomeBookMeta = loadedBooks.find(b => b.id === welcomeBookId);
                
                let needsRepair = false;
                let existingProgress = 0;
                let existingTokenIndex: number | undefined;
                let existingLastOpened: Date | undefined;
                
                if (!welcomeBookMeta) {
                    // Welcome book completely missing - restore it
                    console.warn('[App] Welcome book missing, restoring...');
                    needsRepair = true;
                } else {
                    // Welcome book metadata exists - check content integrity
                    const fullWelcome = await storage.getFullBook(welcomeBookId);
                    if (!fullWelcome || !fullWelcome.chapters || fullWelcome.chapters.length === 0) {
                        console.warn('[App] Welcome book content corrupted, repairing...');
                        needsRepair = true;
                        existingProgress = welcomeBookMeta.bookmarkProgress || 0;
                        existingTokenIndex = welcomeBookMeta.lastTokenIndex;
                        existingLastOpened = welcomeBookMeta.lastOpened;
                    }
                }
                
                if (needsRepair) {
                    const mocks = generateMockBooks();
                    const freshWelcome = mocks.find(b => b.id === welcomeBookId);
                    if (freshWelcome) {
                        // Preserve any existing progress
                        freshWelcome.bookmarkProgress = existingProgress;
                        freshWelcome.lastTokenIndex = existingTokenIndex;
                        freshWelcome.lastOpened = existingLastOpened || new Date();
                        await storage.saveBook(freshWelcome);
                        
                        // Update or append to loaded books list
                        if (welcomeBookMeta) {
                            loadedBooks = loadedBooks.map(b => b.id === welcomeBookId ? freshWelcome : b);
                        } else {
                            loadedBooks = [freshWelcome, ...loadedBooks];
                        }
                    }
                }
            }

            const hydrated = loadedBooks.map(b => ({
                ...b,
                lastOpened: new Date(b.lastOpened)
            }));
            
            setBooks(hydrated);
            booksRef.current = hydrated;

            // COVER RESTORATION: Restore blob URLs for cached covers
            // This runs in the background to avoid blocking initial render
            (async () => {
                const restoredBooks = await Promise.all(
                    hydrated.map(async (book) => {
                        if (book.coverUrl && !book.coverUrl.startsWith('blob:')) {
                            // Try to get cached cover blob
                            const cachedUrl = await CoverService.getCachedCover(book.id);
                            if (cachedUrl) {
                                return { ...book, coverUrl: cachedUrl };
                            }
                        }
                        return book;
                    })
                );
                
                // Only update if any covers were restored
                if (restoredBooks.some((b, i) => b.coverUrl !== hydrated[i].coverUrl)) {
                    setBooks(restoredBooks);
                    booksRef.current = restoredBooks;
                }
            })();

            // Init Sync Subscription
            syncer.subscribe({
                onStatusChange: (s) => setSyncStatus(s),
                onNewBook: (b) => {
                    setBooks(prev => {
                         // Check if exists to update or append
                         const exists = prev.find(existing => existing.id === b.id);
                         if (exists) return prev.map(p => p.id === b.id ? b : p);
                         return [b, ...prev];
                    });
                },
                onConflict: (local, remoteProg) => {
                    setConflictBook({ book: local, remote: remoteProg });
                }
            });
            
            // Attempt Background Sync (Non-Interactive)
            syncer.syncNow(false);
        } catch (error) {
            console.error('App boot failed:', error);
        }
    };

    boot();
  }, []);

  // 2. SYNC REF
  useEffect(() => {
      booksRef.current = books;
  }, [books]);

  // 3. AUTOSAVE HEARTBEAT & REFRESH GUARD
  useEffect(() => {
      if (!currentBookId) return;

      const engine = TitanCore.getInstance();
      let lastSyncedProgress = -1; // Deduplication guard

      const syncToLibrary = async (force: boolean = false) => {
          if (engine.isLoading) return;

          // Verify engine is tracking the same book
          if (engine.currentBook && engine.currentBook.id === currentBookId) {
              
              const safeProgress = (isNaN(engine.currentProgress) || !isFinite(engine.currentProgress)) 
                                   ? 0 
                                   : engine.currentProgress;

              // OPTIMIZATION: Skip if progress hasn't changed (unless forced)
              if (!force && Math.abs(safeProgress - lastSyncedProgress) < 0.001) {
                  return;
              }
              lastSyncedProgress = safeProgress;

              // Construct update
              const updatedBook: Book = {
                  ...engine.currentBook,
                  bookmarkProgress: safeProgress,
                  isFinished: engine.currentBook.isFinished,
                  lastTokenIndex: engine.currentBook.lastTokenIndex,
                  lastOpened: new Date()
              };

              // Update List (State)
              const currentList = booksRef.current;
              const newList = currentList.map(b => b.id === updatedBook.id ? updatedBook : b);
              setBooks(newList);
              
              // Persist to IDB
              await TitanStorage.getInstance().saveBook(updatedBook);
              
              // DEBOUNCED CLOUD SYNC
              // This queues a sync request instead of spamming it
              SyncManager.getInstance().requestSync();
          }
      };

      const intervalId = setInterval(() => syncToLibrary(false), 5000);
      
      const handleBeforeUnload = () => {
          syncToLibrary(true); // Force save on unload
          SyncManager.getInstance().syncNow(false);
      };
      
      // OPTIMIZATION: Save immediately when tab goes to background
      const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
              syncToLibrary(true); // Force save when backgrounded
          }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
          clearInterval(intervalId);
          window.removeEventListener('beforeunload', handleBeforeUnload);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          syncToLibrary(true); // Final save on cleanup
      };
  }, [currentBookId]); 

  const handleBookSelect = useCallback(async (book: Book) => {
    // Push history state for back button support
    if (!isHandlingPopState.current) {
      window.history.pushState({ bookOpen: true, bookId: book.id }, '', window.location.href);
    }
    
    // Check if content is loaded
    if (!book.chapters || book.chapters.length === 0) {
        let fullBook = await TitanStorage.getInstance().getFullBook(book.id);
        
        // REPAIR: If full book is missing or corrupted, try to regenerate welcome book
        if ((!fullBook || !fullBook.chapters || fullBook.chapters.length === 0) && book.id === 'guide-book-v1') {
            const mocks = generateMockBooks();
            const freshWelcome = mocks.find(b => b.id === 'guide-book-v1');
            if (freshWelcome) {
                freshWelcome.bookmarkProgress = book.bookmarkProgress || 0;
                freshWelcome.lastTokenIndex = book.lastTokenIndex;
                freshWelcome.lastOpened = book.lastOpened;
                await TitanStorage.getInstance().saveBook(freshWelcome);
                fullBook = freshWelcome;
            }
        }
        
        if (fullBook && fullBook.chapters && fullBook.chapters.length > 0) {
            // CRITICAL FIX: Use flushSync to ensure books state commits synchronously
            flushSync(() => {
                setBooks(prev => prev.map(b => b.id === book.id ? fullBook : b));
            });
            setCurrentBookId(fullBook.id);
        } else {
            setCurrentBookId(book.id);
        }
    } else {
        setCurrentBookId(book.id);
    }
  }, []);
  
  const handleCloseReader = useCallback(async (bookId: string, lastTokenIndex: number, progress: number) => {
    const originalBook = booksRef.current.find(b => b.id === bookId);
    
    if (originalBook) {
        const safeProgress = (isNaN(progress) || !isFinite(progress)) ? 0 : progress;

        const updatedBook: Book = {
            ...originalBook,
            lastTokenIndex: lastTokenIndex,
            bookmarkProgress: safeProgress,
            isFinished: safeProgress >= 0.99 || TitanCore.getInstance().currentBook?.isFinished || false,
            lastOpened: new Date()
        };

        const newList = booksRef.current.map(b => b.id === bookId ? updatedBook : b);
        setBooks(newList);

        // Commit to IDB
        await TitanStorage.getInstance().saveBook(updatedBook);
        
        // Trigger Cloud Sync Push
        SyncManager.getInstance().syncNow(false);
    }
    
    setCurrentBookId(null);
  }, []);
  
  const handleDeleteBooks = useCallback(async (ids: string[]) => {
      setBooks(prev => prev.filter(b => !ids.includes(b.id)));
      for (const id of ids) {
          await TitanStorage.getInstance().deleteBook(id);
      }
      // Trigger sync to remove from cloud if cloud-synced
      SyncManager.getInstance().requestSync();
  }, []);

  const handleToggleReadStatus = useCallback(async (ids: string[], isRead: boolean) => {
      const updates: Book[] = [];
      setBooks(prev => prev.map(b => {
          if (ids.includes(b.id)) {
              const updated = {
                  ...b,
                  isFinished: isRead,
                  bookmarkProgress: isRead ? 1.0 : (b.bookmarkProgress >= 0.99 ? 0 : b.bookmarkProgress),
                  lastTokenIndex: isRead ? b.lastTokenIndex : (b.bookmarkProgress >= 0.99 ? 0 : b.lastTokenIndex)
              };
              updates.push(updated);
              return updated;
          }
          return b;
      }));
      
      for (const b of updates) {
          await TitanStorage.getInstance().saveBook(b);
      }
      SyncManager.getInstance().requestSync();
  }, []);
  
  const handleToggleFavorite = useCallback(async (bookId: string, isFavorite: boolean) => {
      let target: Book | undefined;
      setBooks(prev => {
          const next = prev.map(b => {
              if (b.id === bookId) {
                  const updated = { ...b, isFavorite };
                  target = updated;
                  return updated;
              }
              return b;
          });
          return next;
      });
      if (target) {
          await TitanStorage.getInstance().saveBook(target);
          SyncManager.getInstance().requestSync();
      }
  }, []);

  const handleBookImported = useCallback(async (book: Book) => {
      setBooks(prev => [book, ...prev]);
      await TitanStorage.getInstance().saveBook(book);
      SyncManager.getInstance().syncNow(false);
  }, []);

  const activeBook = books.find(b => b.id === currentBookId);

  return (
    <div 
      className="fixed inset-0 overflow-hidden font-sans select-none antialiased"
      style={{ 
        backgroundColor: theme.background, 
        color: theme.primaryText 
      }}
    >
      {/* LAYER 1: THE LIBRARY (Base) - removed expensive blur, use opacity only */}
      <div 
        className={`w-full h-full will-change-transform ${activeBook ? 'pointer-events-none' : ''}`}
        style={{
          transform: activeBook ? 'scale(0.95)' : 'scale(1)',
          opacity: activeBook ? 0.4 : 1,
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out'
        }}
      >
          <TitanLibrary 
            books={books} 
            onBookSelect={handleBookSelect} 
            onBookImported={handleBookImported}
            onDeleteBooks={handleDeleteBooks}
            onToggleReadStatus={handleToggleReadStatus}
            onToggleFavorite={handleToggleFavorite}
          />
      </div>

      {/* LAYER 2: THE READER (Overlay) */}
      <Suspense fallback={null}>
        {activeBook && (
            <div
              key={activeBook.id}
              className="animate-fadeIn"
            >
              <ReaderContainer 
                key={activeBook.id}
                book={activeBook} 
                onClose={handleCloseReader} 
              />
            </div>
        )}
      </Suspense>

      {/* LAYER 3: SYNC TOASTS */}
      <AnimatePresence>
         {(syncStatus === 'syncing' || syncStatus === 'error' || syncStatus === 'success') && (
             <SyncToast status={syncStatus} />
         )}
         {conflictBook && (
             <SyncToast 
                status="idle" 
                message={`Cloud has different progress for "${conflictBook.book.title}"`}
                actionLabel={`Jump to ${Math.floor(conflictBook.remote * 100)}%`}
                onAction={() => {
                    SyncManager.getInstance().resolveConflict(conflictBook.book, conflictBook.remote);
                    setConflictBook(null);
                }}
             />
         )}
      </AnimatePresence>
    </div>
  );
};

export default App;