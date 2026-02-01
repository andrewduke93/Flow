import React, { useRef, useState, useEffect, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import { Book } from '../types';
import { TitanBookCell } from './TitanBookCell';
import { EmptyLibraryState } from './TitanLibraryExtras';
import { Plus, Trash2, X, Sparkles, CheckSquare, Settings, BookmarkCheck, ChevronDown, ChevronRight, BookMarked, Archive, CheckCircle, CloudDownload, LibraryBig, LayoutGrid, Heart, FileText, Scissors } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { IngestionService } from '../services/ingestionService';

// Lazy load modal components
const SettingsSheet = lazy(() => import('./SettingsSheet').then(m => ({ default: m.SettingsSheet })));
const TitanCloudLibrary = lazy(() => import('./TitanCloudLibrary').then(m => ({ default: m.TitanCloudLibrary })));
const BookDetailModal = lazy(() => import('./BookDetailModal').then(m => ({ default: m.BookDetailModal })));
const TitanShelfView = lazy(() => import('./TitanShelfView').then(m => ({ default: m.TitanShelfView })));
const TextImportModal = lazy(() => import('./TextImportModal').then(m => ({ default: m.TextImportModal })));

interface TitanLibraryProps {
  books: Book[];
  onBookSelect: (book: Book) => void;
  onBookImported: (book: Book) => void;
  onDeleteBooks: (bookIds: string[]) => void;
  onToggleReadStatus: (bookIds: string[], isRead: boolean) => void;
  onToggleFavorite: (bookId: string, isFavorite: boolean) => void;
}

/**
 * TitanLibrary
 * Unified Dashboard.
 */
export const TitanLibrary: React.FC<TitanLibraryProps> = memo(({ books, onBookSelect, onBookImported, onDeleteBooks, onToggleReadStatus, onToggleFavorite }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  const [isImporting, setIsImporting] = useState(false);
  const theme = useTitanTheme();

  // Management State
  const [viewMode, setViewMode] = useState<'grid' | 'shelf'>('grid');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasDeleted, setHasDeleted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCloudLibrary, setShowCloudLibrary] = useState(false);
  const isHandlingPopState = useRef(false);
  const [closingSettings, setClosingSettings] = useState(false);
  const [closingCloudLibrary, setClosingCloudLibrary] = useState(false);
  
  // Section States
  const [showFinished, setShowFinished] = useState(false); 
  const [showFavorites, setShowFavorites] = useState(false);
  const [showClippings, setShowClippings] = useState(false);
  const [showTextImport, setShowTextImport] = useState(false);

  // UNIFIED CONTEXT STATE
  // Used for both Shelf View Tap and Grid View Long Press
  const [inspectingBook, setInspectingBook] = useState<Book | null>(null);

  // Browser back button handling
  useEffect(() => {
    const handlePopState = () => {
      if (isHandlingPopState.current) return;
      isHandlingPopState.current = true;
      
      if (showTextImport) {
        setShowTextImport(false);
      } else if (inspectingBook) {
        setInspectingBook(null);
      } else if (showCloudLibrary || closingCloudLibrary) {
        handleCloseCloudLibrary();
      } else if (showSettings || closingSettings) {
        handleCloseSettings();
      }
      
      isHandlingPopState.current = false;
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [inspectingBook, showCloudLibrary, closingCloudLibrary, showSettings, closingSettings, showTextImport]);

  // Close Settings with animation
  const handleCloseSettings = () => {
      setClosingSettings(true);
      setTimeout(() => {
          setShowSettings(false);
          setClosingSettings(false);
      }, 400);
  };

  // Close Cloud Library with animation
  const handleCloseCloudLibrary = () => {
      setClosingCloudLibrary(true);
      setTimeout(() => {
          setShowCloudLibrary(false);
          setClosingCloudLibrary(false);
      }, 400);
  };

  // Delete Progress
  const [deleteProgress, setDeleteProgress] = useState(0);
  const deleteTimerRef = useRef<number | null>(null);
  const deleteStartTimeRef = useRef<number>(0);

  // OPTIMIZED SCROLL HANDLER
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
        if (!headerRef.current) return;
        const offset = container.scrollTop;
        const scale = Math.max(0.8, 1 - offset / 300);
        const opacity = Math.max(0, 1 - offset / 150);
        headerRef.current.style.transform = `scale(${scale})`;
        headerRef.current.style.opacity = opacity.toString();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // -- Splitting Active vs Finished vs Favorites vs Clippings --
  const { activeBooks, finishedBooks, favoriteBooks, clippings } = useMemo(() => {
      const sorted = [...books].sort((a, b) => 
        new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
      );
      
      return {
          favoriteBooks: sorted.filter(b => b.isFavorite),
          activeBooks: sorted.filter(b => !b.isFinished && b.sourceType !== 'pasted'),
          finishedBooks: sorted.filter(b => b.isFinished),
          clippings: sorted.filter(b => b.sourceType === 'pasted')
      };
  }, [books]);

  // Ensure sections stay open if they have books being added/removed
  useEffect(() => {
    if (favoriteBooks.length > 0 && !showFavorites && books.some(b => b.isFavorite && !b.isFinished)) {
        // We don't auto-open, but we ensure state is consistent
    }
  }, [favoriteBooks.length]);

  // -- Actions --

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const newBook = await IngestionService.getInstance().ingest(file);
      
      // Validate the book has chapters before accepting it
      if (!newBook.chapters || newBook.chapters.length === 0) {
        console.error('[TitanLibrary] Book imported but has 0 chapters:', {
          title: newBook.title,
          author: newBook.author,
          id: newBook.id
        });
                // Create a diagnostic payload so users without remote-debugging can share useful info
                const diag = [
                    `Date: ${new Date().toISOString()}`,
                    `UserAgent: ${navigator.userAgent}`,
                    `Platform: ${navigator.platform}`,
                    `File: ${file.name}`,
                    `BookTitle: ${newBook.title}`,
                    `BookAuthor: ${newBook.author}`,
                    `BookId: ${newBook.id}`,
                    `ChaptersLength: ${newBook.chapters ? newBook.chapters.length : 'undefined'}`,
                    '',
                    'Notes: Import produced zero chapters. Attach this file when reporting.'
                ].join('\n');

                const downloadDiagnostics = (content: string, filename = `flow-diagnostics-${Date.now()}.txt`) => {
                    try {
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 1500);
                    } catch (e) {
                        console.error('Failed to create diagnostics download', e);
                    }
                };

                downloadDiagnostics(diag);
                alert(`Import failed: "${newBook.title}" was processed but no readable content was found. A diagnostic file has been downloaded to help with reporting.`);
        return;
      }
      
      onBookImported(newBook);
    } catch (error) {
      console.error('[TitanLibrary] Import error:', error);
            // Save diagnostics for the user (useful on mobile where remote debugging isn't available)
            try {
                const diag = [
                    `Date: ${new Date().toISOString()}`,
                    `UserAgent: ${navigator.userAgent}`,
                    `Platform: ${navigator.platform}`,
                    `File: ${file ? file.name : 'unknown'}`,
                    `Error: ${error instanceof Error ? error.message : String(error)}`,
                    `Stack: ${error instanceof Error && error.stack ? error.stack : 'no-stack'}`,
                    '',
                    'Notes: Import threw an exception. Attach this file when reporting.'
                ].join('\n');

                const blob = new Blob([diag], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `flow-import-error-${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
            } catch (e) {
                console.error('Failed to create diagnostics download', e);
            }

            alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error. A diagnostic file has been downloaded.'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerImport = () => fileInputRef.current?.click();

  // Text Import Handler
  const handleTextImport = async (title: string, text: string) => {
    try {
      const newBook = await IngestionService.getInstance().ingestPastedText(title, text);
      onBookImported(newBook);
      setShowTextImport(false);
      RSVPHapticEngine.impactMedium();
    } catch (error) {
      console.error('[TitanLibrary] Text import error:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const toggleEditMode = () => {
      RSVPHapticEngine.impactMedium();
      setIsEditing(prev => {
          if (prev) {
              setSelectedIds(new Set());
              setDeleteProgress(0);
          }
          return !prev;
      });
  };

  const handleToggleSelect = (book: Book) => {
      RSVPHapticEngine.impactLight();
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(book.id)) next.delete(book.id);
          else next.add(book.id);
          return next;
      });
  };
  
  const handleToggleRead = () => {
      if (selectedIds.size === 0) return;
      
      const selectedBooks = books.filter(b => selectedIds.has(b.id));
      const allRead = selectedBooks.every(b => b.isFinished);
      const targetState = !allRead; 
      
      onToggleReadStatus(Array.from(selectedIds), targetState);
      
      RSVPHapticEngine.impactMedium();
      setIsEditing(false);
      setSelectedIds(new Set());
  };

  // MEMOIZED CALLBACK for TitanBookCell to prevent re-renders
  const handleLongPress = useCallback((book: Book) => {
      if (!isHandlingPopState.current) {
        window.history.pushState({ modal: 'detail' }, '', window.location.href);
      }
      setInspectingBook(book);
  }, []);

  // -- Hold-to-Delete (Superbar) --

  const handlePointerDownDelete = (e: React.PointerEvent) => {
      if (selectedIds.size === 0) return;
      e.preventDefault();
      deleteStartTimeRef.current = performance.now();
      (e.target as Element).setPointerCapture(e.pointerId);

      const animate = () => {
          const elapsed = performance.now() - deleteStartTimeRef.current;
          const progress = Math.min(elapsed / 600, 1.0);
          setDeleteProgress(progress);
          if (progress < 1.0) {
              deleteTimerRef.current = requestAnimationFrame(animate);
          } else {
              confirmDelete();
          }
      };
      deleteTimerRef.current = requestAnimationFrame(animate);
  };

  const cancelDelete = (e: React.PointerEvent) => {
      if (deleteTimerRef.current) {
          cancelAnimationFrame(deleteTimerRef.current);
          deleteTimerRef.current = null;
      }
      setDeleteProgress(0);
      (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const confirmDelete = () => {
      if (deleteTimerRef.current) cancelAnimationFrame(deleteTimerRef.current);
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      onDeleteBooks(Array.from(selectedIds));
      setSelectedIds(new Set());
      setDeleteProgress(0);
      setHasDeleted(true);
      setIsEditing(false); 
  };

  return (
    <div 
        className="relative h-full w-full overflow-hidden"
        style={{ backgroundColor: theme.background }}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".epub" className="hidden" />

      {/* TOP RIGHT SETTINGS BUTTON */}
      <button 
         onClick={() => {
           if (!isHandlingPopState.current) {
             window.history.pushState({ modal: 'settings' }, '', window.location.href);
           }
           setShowSettings(true);
         }}
         aria-label="Open settings"
         className="absolute top-6 right-6 z-40 p-3 rounded-full hover:bg-black/5 transition-colors"
         style={{ color: theme.secondaryText }}
      >
         <Settings size={24} />
      </button>

      {/* 1. SCROLLABLE CONTENT AREA */}
      <div 
        ref={containerRef}
        className="h-full w-full overflow-y-auto custom-scrollbar pt-24 pb-48 px-6 md:px-12"
      >
         {/* COMPACT HEADER */}
         <div 
            ref={headerRef}
            className="mb-8 origin-left will-change-transform flex items-end justify-between" 
            style={{ 
                transform: `scale(1)`, 
                opacity: 1,
            }}
         >
             <div>
                <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight lowercase leading-none" style={{ color: theme.primaryText }}>
                    bookshelf
                </h1>
                <p className="text-sm font-sans font-medium mt-2 lowercase opacity-50" style={{ color: theme.secondaryText }}>
                    {activeBooks.length} {activeBooks.length === 1 ? 'book' : 'books'} in progress
                </p>
             </div>

             {/* VIEW TOGGLE */}
             {books.length > 0 && (
                 <div className="flex p-0.5 rounded-xl border" role="group" aria-label="View mode" style={{ borderColor: theme.borderColor, backgroundColor: theme.surface }}>
                     <button
                        onClick={() => setViewMode('grid')}
                        aria-label="Grid view"
                        aria-pressed={viewMode === 'grid'}
                        className={`p-2 rounded-lg transition-all active:scale-90 ${viewMode === 'grid' ? 'shadow-sm' : 'opacity-40 hover:opacity-70'}`}
                        style={{ backgroundColor: viewMode === 'grid' ? theme.background : 'transparent', color: theme.primaryText }}
                     >
                         <LayoutGrid size={18} />
                     </button>
                     <button
                        onClick={() => setViewMode('shelf')}
                        aria-label="Shelf view"
                        aria-pressed={viewMode === 'shelf'}
                        className={`p-2 rounded-lg transition-all active:scale-90 ${viewMode === 'shelf' ? 'shadow-sm' : 'opacity-40 hover:opacity-70'}`}
                        style={{ backgroundColor: viewMode === 'shelf' ? theme.background : 'transparent', color: theme.primaryText }}
                     >
                         <LibraryBig size={18} />
                     </button>
                 </div>
             )}
         </div>

         {/* CONTENT RENDERER */}
         {books.length === 0 ? (
             <EmptyLibraryState onImport={triggerImport} hasDeleted={hasDeleted} />
         ) : viewMode === 'shelf' ? (
             // SHELF MODE
             <div className="transition-opacity duration-400" style={{transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'}}>
                 <TitanShelfView 
                    books={books} 
                    onBookSelect={onBookSelect}
                    onInspectBook={(b) => {
                      if (!isHandlingPopState.current) {
                        window.history.pushState({ modal: 'detail' }, '', window.location.href);
                      }
                      setInspectingBook(b);
                    }}
                 />
             </div>
         ) : (
             // GRID MODE (Classic)
             <div className="flex flex-col gap-12 transition-opacity duration-400" style={{transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'}}>
                 
                 {/* 1. Active Books Grid */}
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8">
                    <AnimatePresence mode='popLayout'>
                        {activeBooks.map((book) => (
                            <motion.div
                                key={book.id}
                                initial={false}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                            >
                                <TitanBookCell 
                                    book={book}
                                    onSelect={onBookSelect}
                                    isEditing={isEditing}
                                    isSelected={selectedIds.has(book.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onLongPress={handleLongPress}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                 </div>
                 
                 {/* 2. Favorites Section */}
                 {favoriteBooks.length > 0 && (
                     <div className="mt-6 border-t pt-6" style={{ borderColor: theme.borderColor }}>
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFavorites(p => !p);
                            }}
                            className="flex items-center gap-1.5 text-sm font-medium lowercase hover:opacity-80 transition-opacity mb-4"
                            style={{ color: theme.secondaryText, opacity: 0.6 }}
                         >
                            {showFavorites ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span>favorites ({favoriteBooks.length})</span>
                         </button>
                         
                         {showFavorites && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8 pb-6">
                                {favoriteBooks.map((book) => (
                                    <div key={`fav-${book.id}`}>
                                        <TitanBookCell 
                                            book={book}
                                            onSelect={onBookSelect}
                                            isEditing={isEditing}
                                            isSelected={selectedIds.has(book.id)}
                                            onToggleSelect={handleToggleSelect}
                                            onLongPress={handleLongPress}
                                        />
                                    </div>
                                ))}
                            </div>
                         )}
                     </div>
                 )}

                 {/* 3. Finished Books Section */}
                 {finishedBooks.length > 0 && (
                     <div className="mt-2 border-t pt-6" style={{ borderColor: theme.borderColor }}>
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFinished(p => !p);
                            }}
                            className="flex items-center gap-1.5 text-sm font-medium lowercase hover:opacity-80 transition-opacity mb-4"
                            style={{ color: theme.secondaryText, opacity: 0.6 }}
                         >
                            {showFinished ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span>finished ({finishedBooks.length})</span>
                         </button>
                         
                         {showFinished && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8 pb-6">
                                {finishedBooks.map((book) => (
                                    <div key={`fin-${book.id}`}>
                                        <TitanBookCell 
                                            book={book}
                                            onSelect={onBookSelect}
                                            isEditing={isEditing}
                                            isSelected={selectedIds.has(book.id)}
                                            onToggleSelect={handleToggleSelect}
                                            onLongPress={handleLongPress}
                                        />
                                    </div>
                                ))}
                            </div>
                         )}
                     </div>
                 )}

                 {/* 4. Clippings Section */}
                 {clippings.length > 0 && (
                     <div className="mt-2 border-t pt-6" style={{ borderColor: theme.borderColor }}>
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowClippings(p => !p);
                            }}
                            className="flex items-center gap-1.5 text-sm font-medium lowercase hover:opacity-80 transition-opacity mb-4"
                            style={{ color: theme.secondaryText, opacity: 0.6 }}
                         >
                            {showClippings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <Scissors size={14} className="opacity-60" />
                            <span>clippings ({clippings.length})</span>
                         </button>
                         
                         {showClippings && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8 pb-6">
                                {clippings.map((book) => (
                                    <div key={`clip-${book.id}`}>
                                        <TitanBookCell 
                                            book={book}
                                            onSelect={onBookSelect}
                                            isEditing={isEditing}
                                            isSelected={selectedIds.has(book.id)}
                                            onToggleSelect={handleToggleSelect}
                                            onLongPress={handleLongPress}
                                        />
                                    </div>
                                ))}
                            </div>
                         )}
                     </div>
                 )}

                 <div className="h-24" />
             </div>
         )}
      </div>

      {/* 2. THE SUPERBAR (Bottom Floating Dock) */}
      <div 
          className="absolute left-0 right-0 flex justify-center pointer-events-none z-30"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
          <motion.div 
             layout 
             initial={false}
             className="pointer-events-auto shadow-xl backdrop-blur-2xl border flex items-center p-1.5 rounded-2xl gap-1 relative overflow-hidden"
             style={{ 
                 backgroundColor: theme.surface + 'f0', 
                 borderColor: theme.borderColor,
                 minWidth: '180px'
             }}
          >
             <AnimatePresence mode='wait'>
                 {!isEditing ? (
                     <motion.div 
                        key="normal-dock"
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center w-full gap-2 px-1"
                     >
                        <button 
                            onClick={toggleEditMode}
                            disabled={books.length === 0}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 disabled:opacity-30 transition-colors"
                            style={{ color: theme.secondaryText }}
                        >
                            <CheckSquare size={18} />
                        </button>
                        <div className="w-px h-5 bg-black/10" />
                        <button 
                            onClick={() => {
                              if (!isHandlingPopState.current) {
                                window.history.pushState({ modal: 'cloud' }, '', window.location.href);
                              }
                              setShowCloudLibrary(true);
                            }}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors"
                            style={{ color: theme.accent }}
                            title="Browse Library"
                        >
                            <CloudDownload size={18} />
                        </button>
                        <button 
                            onClick={() => {
                              if (!isHandlingPopState.current) {
                                window.history.pushState({ modal: 'text-import' }, '', window.location.href);
                              }
                              setShowTextImport(true);
                            }}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors"
                            style={{ color: theme.secondaryText }}
                            title="Paste Text"
                        >
                            <FileText size={18} />
                        </button>
                        <div className="w-px h-5 bg-black/10" />
                        <button 
                            onClick={triggerImport}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl font-semibold text-white shadow-md active:scale-[0.98] transition-transform lowercase text-sm"
                            style={{ backgroundColor: theme.accent }}
                        >
                            {isImporting ? <Sparkles size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={3} />}
                            <span>import</span>
                        </button>
                     </motion.div>
                 ) : (
                     <motion.div 
                        key="edit-dock"
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center w-full gap-2 px-1"
                     >
                        <button 
                            onClick={toggleEditMode}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors"
                            style={{ color: theme.primaryText }}
                        >
                            <X size={18} />
                        </button>
                        <div className="w-px h-5 bg-black/10" />
                        <button
                           onClick={handleToggleRead}
                           disabled={selectedIds.size === 0}
                           className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors disabled:opacity-30"
                           style={{ color: theme.primaryText }}
                        >
                           <BookmarkCheck size={18} />
                        </button>
                        <div className="w-px h-5 bg-black/10" />
                        <button 
                            onPointerDown={handlePointerDownDelete}
                            onPointerUp={cancelDelete}
                            onPointerLeave={cancelDelete}
                            disabled={selectedIds.size === 0}
                            className="flex-1 relative flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl font-semibold text-white shadow-md active:scale-[0.98] transition-transform overflow-hidden disabled:opacity-50 disabled:active:scale-100 lowercase text-sm"
                            style={{ backgroundColor: theme.accent }}
                        >
                            <div 
                                className="absolute inset-0 bg-white mix-blend-overlay origin-left"
                                style={{ transform: `scaleX(${deleteProgress})`, transition: 'transform 0.05s linear' }}
                            />
                            <div className="relative z-10 flex items-center gap-1.5">
                                <Trash2 size={16} />
                                <span>{selectedIds.size > 0 ? `delete ${selectedIds.size}` : 'select'}</span>
                            </div>
                        </button>
                     </motion.div>
                 )}
             </AnimatePresence>
          </motion.div>
      </div>

      {/* UNIFIED BOOK DETAIL MODAL */}
      <AnimatePresence>
         {inspectingBook && (
             <BookDetailModal 
                // CRITICAL FIX: Always pass the freshest book object from the books array
                // to ensure state updates (like favorites) are reflected immediately.
                book={books.find(b => b.id === inspectingBook.id) || inspectingBook}
                onClose={() => setInspectingBook(null)}
                onOpen={(b) => {
                    setInspectingBook(null);
                    onBookSelect(b);
                }}
                onToggleFavorite={(id, val) => onToggleFavorite(id, val)}
                onToggleRead={(id, val) => onToggleReadStatus([id], val)}
                onDelete={(id) => {
                    onDeleteBooks([id]);
                    setInspectingBook(null);
                    if (books.length === 1) setHasDeleted(true);
                }}
             />
         )}
      </AnimatePresence>

      {/* CLOUD LIBRARY SHEET */}
      {(showCloudLibrary || closingCloudLibrary) && (
        <>
            <div 
                className="fixed inset-0 z-[100]"
                style={{ 
                  backgroundColor: 'rgba(0,0,0,0.5)', 
                  backdropFilter: 'blur(2px)',
                  animation: closingCloudLibrary ? 'fadeOut 0.4s ease-out' : 'fadeIn 0.6s ease-out'
                }}
                onClick={handleCloseCloudLibrary}
            />
            <div
                className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[32px] h-[90vh] shadow-2xl overflow-hidden"
                style={{ 
                  backgroundColor: theme.background,
                  animation: closingCloudLibrary ? 'slideDown 0.5s cubic-bezier(0.7, 0, 0.84, 0)' : 'slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
            >
                <TitanCloudLibrary 
                    existingBooks={books}
                    onClose={handleCloseCloudLibrary}
                    onImport={(book) => {
                        onBookImported(book);
                    }}
                    onOpen={(book) => {
                        setShowCloudLibrary(false);
                        onBookSelect(book);
                    }}
                />
            </div>
        </>
      )}

      {/* SETTINGS SHEET LAYER */}
      {(showSettings || closingSettings) && (
        <>
          <div 
              className="fixed inset-0 z-[100]"
              style={{ 
                backgroundColor: 'rgba(0,0,0,0.5)', 
                backdropFilter: 'blur(2px)',
                animation: closingSettings ? 'fadeOut 0.4s ease-out' : 'fadeIn 0.6s ease-out'
              }}
              onClick={handleCloseSettings}
          />
          <div
              className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[32px] h-[70vh] shadow-2xl overflow-hidden"
              style={{ 
                backgroundColor: theme.background,
                animation: closingSettings ? 'slideDown 0.5s cubic-bezier(0.7, 0, 0.84, 0)' : 'slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
          >
              <SettingsSheet onClose={handleCloseSettings} />
          </div>
        </>
      )}

      {/* TEXT IMPORT MODAL */}
      <AnimatePresence>
        {showTextImport && (
          <Suspense fallback={null}>
            <TextImportModal
              onClose={() => setShowTextImport(false)}
              onImport={handleTextImport}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
});