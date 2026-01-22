import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Book } from '../types';
import { TitanBookCell } from './TitanBookCell';
import { EmptyLibraryState } from './TitanLibraryExtras';
import { IngestionService } from '../services/ingestionService';
import { Plus, Trash2, X, Sparkles, CheckSquare, Settings, BookmarkCheck, ChevronDown, ChevronRight, BookMarked, Archive, CheckCircle, CloudDownload, LibraryBig, LayoutGrid, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { SettingsSheet } from './SettingsSheet';
import { TitanCloudLibrary } from './TitanCloudLibrary';
import { TitanShelfView } from './TitanShelfView';
import { BookDetailModal } from './BookDetailModal';

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
export const TitanLibrary: React.FC<TitanLibraryProps> = ({ books, onBookSelect, onBookImported, onDeleteBooks, onToggleReadStatus, onToggleFavorite }) => {
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
  
  // Section States
  const [showFinished, setShowFinished] = useState(false); 
  const [showFavorites, setShowFavorites] = useState(false);

  // UNIFIED CONTEXT STATE
  // Used for both Shelf View Tap and Grid View Long Press
  const [inspectingBook, setInspectingBook] = useState<Book | null>(null);

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

  // -- Splitting Active vs Finished vs Favorites --
  const { activeBooks, finishedBooks, favoriteBooks } = useMemo(() => {
      const sorted = [...books].sort((a, b) => 
        new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
      );
      
      return {
          favoriteBooks: sorted.filter(b => b.isFavorite),
          activeBooks: sorted.filter(b => !b.isFinished && !b.isFavorite),
          finishedBooks: sorted.filter(b => b.isFinished && !b.isFavorite)
      };
  }, [books]);

  // -- Actions --

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const newBook = await IngestionService.getInstance().ingest(file);
      onBookImported(newBook);
    } catch (error) {
      alert("We couldn't read that file. Is it a valid EPUB?");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerImport = () => fileInputRef.current?.click();

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
         onClick={() => setShowSettings(true)}
         className="absolute top-6 right-6 z-40 p-3 rounded-full hover:bg-black/5 transition-colors"
         style={{ color: theme.secondaryText }}
      >
         <Settings size={24} />
      </button>

      {/* 1. SCROLLABLE CONTENT AREA */}
      <div 
        ref={containerRef}
        className="h-full w-full overflow-y-auto custom-scrollbar pt-24 pb-48 px-4 md:px-8"
      >
         {/* BIG EXPRESSIVE HEADER & TOGGLE */}
         <div 
            ref={headerRef}
            className="mb-12 origin-left will-change-transform flex items-end justify-between pr-4" 
            style={{ 
                transform: `scale(1)`, 
                opacity: 1,
            }}
         >
             <div>
                <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tighter lowercase leading-none" style={{ color: theme.primaryText }}>
                    bookshelf.
                </h1>
                <p className="text-lg md:text-xl font-sans font-medium mt-2 lowercase opacity-60 ml-1" style={{ color: theme.secondaryText }}>
                    {activeBooks.length} items flowing
                </p>
             </div>

             {/* VIEW TOGGLE */}
             {books.length > 0 && (
                 <div className="flex bg-black/5 p-1 rounded-full backdrop-blur-md mb-2">
                     <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-full transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-black/5'}`}
                        style={{ color: viewMode === 'grid' ? 'black' : theme.secondaryText }}
                     >
                         <LayoutGrid size={20} />
                     </button>
                     <button
                        onClick={() => setViewMode('shelf')}
                        className={`p-2 rounded-full transition-all ${viewMode === 'shelf' ? 'bg-white shadow-sm' : 'hover:bg-black/5'}`}
                        style={{ color: viewMode === 'shelf' ? 'black' : theme.secondaryText }}
                     >
                         <LibraryBig size={20} />
                     </button>
                 </div>
             )}
         </div>

         {/* CONTENT RENDERER */}
         {books.length === 0 ? (
             <EmptyLibraryState onImport={triggerImport} hasDeleted={hasDeleted} />
         ) : viewMode === 'shelf' ? (
             // SHELF MODE
             <TitanShelfView 
                books={books} 
                onBookSelect={onBookSelect}
                onInspectBook={(b) => setInspectingBook(b)}
             />
         ) : (
             // GRID MODE (Classic)
             <div className="flex flex-col gap-12">
                 
                 {/* 1. Active Books Grid */}
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-10 md:gap-x-8 md:gap-y-14">
                    <AnimatePresence mode='popLayout'>
                        {activeBooks.map((book) => (
                            <motion.div
                                key={book.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                            >
                                <TitanBookCell 
                                    book={book}
                                    onSelect={onBookSelect}
                                    isEditing={isEditing}
                                    isSelected={selectedIds.has(book.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onRequestManage={() => {
                                        setIsEditing(true);
                                        setSelectedIds(new Set([book.id]));
                                    }}
                                    onLongPress={(b) => setInspectingBook(b)} // Unified Long Press Action
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                 </div>
                 
                 {/* 2. Favorites Section */}
                 {favoriteBooks.length > 0 && (
                     <div className="mt-8 border-t pt-8" style={{ borderColor: theme.borderColor }}>
                         <button 
                            onClick={() => setShowFavorites(p => !p)}
                            className="flex items-center gap-2 text-lg font-serif font-bold lowercase hover:opacity-80 transition-opacity mb-6"
                            style={{ color: theme.secondaryText }}
                         >
                            {showFavorites ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            <span>hall of fame ({favoriteBooks.length})</span>
                         </button>
                         
                         <AnimatePresence>
                             {showFavorites && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-10 md:gap-x-8 md:gap-y-14 pb-8">
                                        {favoriteBooks.map((book) => (
                                            <motion.div
                                                key={book.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }} 
                                            >
                                                <TitanBookCell 
                                                    book={book}
                                                    onSelect={onBookSelect}
                                                    isEditing={isEditing}
                                                    isSelected={selectedIds.has(book.id)}
                                                    onToggleSelect={handleToggleSelect}
                                                    onLongPress={(b) => setInspectingBook(b)}
                                                />
                                            </motion.div>
                                        ))}
                                     </div>
                                </motion.div>
                             )}
                         </AnimatePresence>
                     </div>
                 )}

                 {/* 3. Finished Books Section */}
                 {finishedBooks.length > 0 && (
                     <div className="mt-2 border-t pt-8" style={{ borderColor: theme.borderColor }}>
                         <button 
                            onClick={() => setShowFinished(p => !p)}
                            className="flex items-center gap-2 text-lg font-serif font-bold lowercase hover:opacity-80 transition-opacity mb-6"
                            style={{ color: theme.secondaryText }}
                         >
                            {showFinished ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            <span>past adventures ({finishedBooks.length})</span>
                         </button>
                         
                         <AnimatePresence>
                             {showFinished && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-10 md:gap-x-8 md:gap-y-14 pb-8">
                                        {finishedBooks.map((book) => (
                                            <motion.div
                                                key={book.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 0.8 }} 
                                                whileHover={{ opacity: 1 }}
                                            >
                                                <TitanBookCell 
                                                    book={book}
                                                    onSelect={onBookSelect}
                                                    isEditing={isEditing}
                                                    isSelected={selectedIds.has(book.id)}
                                                    onToggleSelect={handleToggleSelect}
                                                    onLongPress={(b) => setInspectingBook(b)}
                                                />
                                            </motion.div>
                                        ))}
                                     </div>
                                </motion.div>
                             )}
                         </AnimatePresence>
                     </div>
                 )}

                 <div className="h-24" />
             </div>
         )}
      </div>

      {/* 2. THE SUPERBAR (Bottom Floating Dock) */}
      <div 
          className="absolute left-0 right-0 flex justify-center pointer-events-none z-30"
          style={{ bottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
          <motion.div 
             layout 
             initial={false}
             className="pointer-events-auto shadow-2xl backdrop-blur-xl border flex items-center p-2 rounded-full gap-2 relative overflow-hidden"
             style={{ 
                 backgroundColor: theme.surface + 'E6', 
                 borderColor: theme.borderColor,
                 minWidth: '200px'
             }}
          >
             <AnimatePresence mode='wait'>
                 {!isEditing ? (
                     <motion.div 
                        key="normal-dock"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center w-full gap-3 px-2"
                     >
                        <button 
                            onClick={toggleEditMode}
                            disabled={books.length === 0}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-30 transition-colors"
                            style={{ color: theme.secondaryText }}
                        >
                            <CheckSquare size={20} />
                        </button>
                        <div className="w-px h-6 bg-black/10" />
                        <button 
                            onClick={() => setShowCloudLibrary(true)}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
                            style={{ color: theme.accent }}
                        >
                            <CloudDownload size={20} />
                        </button>
                        <div className="w-px h-6 bg-black/10" />
                        <button 
                            onClick={triggerImport}
                            className="flex-1 flex items-center justify-center gap-2 px-6 h-10 rounded-full font-bold text-white shadow-lg active:scale-95 transition-transform lowercase"
                            style={{ backgroundColor: theme.accent }}
                        >
                            {isImporting ? <Sparkles size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={3} />}
                            <span>import</span>
                        </button>
                     </motion.div>
                 ) : (
                     <motion.div 
                        key="edit-dock"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center w-full gap-3 px-2"
                     >
                        <button 
                            onClick={toggleEditMode}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
                            style={{ color: theme.primaryText }}
                        >
                            <X size={20} />
                        </button>
                        <div className="w-px h-6 bg-black/10" />
                        <button
                           onClick={handleToggleRead}
                           disabled={selectedIds.size === 0}
                           className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors disabled:opacity-30"
                           style={{ color: theme.primaryText }}
                        >
                           <BookmarkCheck size={20} />
                        </button>
                        <div className="w-px h-6 bg-black/10" />
                        <button 
                            onPointerDown={handlePointerDownDelete}
                            onPointerUp={cancelDelete}
                            onPointerLeave={cancelDelete}
                            disabled={selectedIds.size === 0}
                            className="flex-1 relative flex items-center justify-center gap-2 px-6 h-10 rounded-full font-bold text-white shadow-lg active:scale-95 transition-transform overflow-hidden disabled:opacity-50 disabled:active:scale-100 lowercase"
                            style={{ backgroundColor: theme.accent }}
                        >
                            <div 
                                className="absolute inset-0 bg-white mix-blend-overlay origin-left"
                                style={{ transform: `scaleX(${deleteProgress})`, transition: 'transform 0.05s linear' }}
                            />
                            <div className="relative z-10 flex items-center gap-2">
                                <Trash2 size={18} />
                                <span>{selectedIds.size > 0 ? `toss ${selectedIds.size}` : 'select'}</span>
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
      <AnimatePresence>
        {showCloudLibrary && (
            <>
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100]"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
                    onClick={() => setShowCloudLibrary(false)}
                />
                <motion.div
                    initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[32px] h-[90vh] shadow-2xl overflow-hidden"
                    style={{ backgroundColor: theme.background }}
                >
                    <TitanCloudLibrary 
                        existingBooks={books}
                        onClose={() => setShowCloudLibrary(false)}
                        onImport={(book) => {
                            onBookImported(book);
                        }}
                        onOpen={(book) => {
                            setShowCloudLibrary(false);
                            onBookSelect(book);
                        }}
                    />
                </motion.div>
            </>
        )}
      </AnimatePresence>

      {/* SETTINGS SHEET LAYER */}
      <AnimatePresence>
        {showSettings && (
            <>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100]"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
                onClick={() => setShowSettings(false)}
            />
            <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[32px] h-[70vh] shadow-2xl overflow-hidden"
                style={{ backgroundColor: theme.background }}
            >
                <SettingsSheet onClose={() => setShowSettings(false)} />
            </motion.div>
            </>
        )}
      </AnimatePresence>
    </div>
  );
};