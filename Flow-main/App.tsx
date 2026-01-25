import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { TitanLibrary } from './components/TitanLibrary';
import { ReaderContainer } from './components/ReaderContainer';
import { TitanCore } from './services/titanCore';
import { IngestionService } from './services/ingestionService';
import { TitanStorage } from './services/titanStorage';
import { SyncManager, SyncStatus } from './services/syncManager';
import { generateMockBooks } from './services/mockData';
import { Book } from './types';
import { useTitanTheme } from './services/titanTheme';
import { SyncToast } from './components/SyncToast';

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

  // Browser back button handling for closing books
  useEffect(() => {
    const handlePopState = () => {
      if (isHandlingPopState.current || !currentBookId) return;
      isHandlingPopState.current = true;
      
      const book = booksRef.current.find(b => b.id === currentBookId);
      if (book) {
        const engine = TitanCore.getInstance();
        handleCloseReader(currentBookId, engine.currentTokenIndex, engine.currentProgress);
      }
      
      isHandlingPopState.current = false;
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentBookId]);

  // 1. INITIAL LOAD
  useEffect(() => {
    // Init Singletons
    TitanCore.getInstance();
    IngestionService.getInstance();
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
            }

            const hydrated = loadedBooks.map(b => ({
                ...b,
                lastOpened: new Date(b.lastOpened)
            }));
            
            setBooks(hydrated);
            booksRef.current = hydrated;

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

  const handleBookSelect = async (book: Book) => {
    // If opening from library, ensure we have full content (IDB might only have metadata in list)
    // The list 'books' array *should* contain metadata mostly if we optimized, 
    // but current TitanStorage implementation splits it.
    // Let's ensure TitanCore gets the full book.
    
    // Push history state for back button support
    if (!isHandlingPopState.current) {
      window.history.pushState({ bookOpen: true, bookId: book.id }, '', window.location.href);
    }
    
    // Check if content is loaded
    if (!book.chapters || book.chapters.length === 0) {
        const fullBook = await TitanStorage.getInstance().getFullBook(book.id);
        if (fullBook) {
            // CRITICAL FIX: Use flushSync to ensure books state commits synchronously
            // before setting currentBookId. This prevents race condition where
            // activeBook is derived from stale books array without chapters.
            flushSync(() => {
                setBooks(prev => prev.map(b => b.id === book.id ? fullBook : b));
            });
            setCurrentBookId(fullBook.id);
        } else {
            console.error('[App] Failed to load full book from storage:', book.id);
            setCurrentBookId(book.id);
        }
    } else {
        setCurrentBookId(book.id);
    }
  };
  
  const handleCloseReader = async (bookId: string, lastTokenIndex: number, progress: number) => {
    
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
        
        // Trigger Cloud Sync Push (Immediate on Close)
        SyncManager.getInstance().syncNow(false);
    }
    
    setCurrentBookId(null);
  };
  
  const handleDeleteBooks = async (ids: string[]) => {
      setBooks(prev => prev.filter(b => !ids.includes(b.id)));
      for (const id of ids) {
          await TitanStorage.getInstance().deleteBook(id);
      }
  };

  const handleToggleReadStatus = async (ids: string[], isRead: boolean) => {
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
      // Request Sync
      SyncManager.getInstance().requestSync();
  };
  
  const handleToggleFavorite = async (bookId: string, isFavorite: boolean) => {
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
  };

  const handleBookImported = async (book: Book) => {
      setBooks(prev => [book, ...prev]);
      await TitanStorage.getInstance().saveBook(book);
      // Trigger Cloud Sync (New book detected - Background)
      SyncManager.getInstance().syncNow(false);
  };

  const activeBook = books.find(b => b.id === currentBookId);

  return (
    <div 
      className="fixed inset-0 overflow-hidden font-sans select-none antialiased transition-colors duration-500"
      style={{ 
        backgroundColor: theme.background, 
        color: theme.primaryText 
      }}
    >
      {/* LAYER 1: THE LIBRARY (Base) */}
      <div 
        className={`w-full h-full transition-all duration-500 ${activeBook ? 'scale-95 opacity-50 blur-[2px] pointer-events-none' : 'scale-100 opacity-100 blur-0'}`}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
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
      {activeBook && (
          <div
            key={activeBook.id}
            style={{
              animation: 'fadeIn 400ms cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <ReaderContainer 
              key={activeBook.id}
              book={activeBook} 
              onClose={handleCloseReader} 
            />
          </div>
      )}

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