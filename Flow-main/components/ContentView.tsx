import React, { useState, useEffect, useCallback } from 'react';
import { Book } from '../types';
import { TitanLibrary } from './TitanLibrary';
import { ReaderContainer } from './ReaderContainer';
import { generateMockBooks } from '../services/mockData';
import { AnimatePresence, motion } from 'framer-motion';
import RSVPLite from './RSVPLite';

/**
 * ContentView (Phase 5-B / 9-H)
 * The Root Navigation Coordinator.
 * Manages the "ZStack" transition between the Library (Base Layer) and Reader (Top Layer).
 * Uses Framer Motion's AnimatePresence for "Shrink-to-Shelf" physics.
 */
export const ContentView: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  // Quick RSVP demo toggle via query param ?rsvpDemo=1
  const [showRsvpDemo] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('rsvpDemo') === '1';
    } catch (e) {
      return false;
    }
  });

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      const data = generateMockBooks();
      setBooks(data);
    };
    loadData();
  }, []);

  // ARCHITECTURAL FIX: Memoize handlers to prevent prop instability in children
  const handleBookSelect = useCallback((book: Book) => {
    setSelectedBookId(book.id);
  }, []);

  const handleBookImported = useCallback((newBook: Book) => {
    setBooks(prev => [newBook, ...prev]);
  }, []);

  const handleCloseReader = useCallback(() => {
    setSelectedBookId(null);
  }, []);
  
  const handleDeleteBooks = useCallback((ids: string[]) => {
      setBooks(prev => prev.filter(b => !ids.includes(b.id)));
  }, []);

  const handleToggleReadStatus = useCallback((ids: string[], isRead: boolean) => {
      setBooks(prev => prev.map(b => {
          if (ids.includes(b.id)) {
              return {
                  ...b,
                  isFinished: isRead,
                  // Logic mirrored from App.tsx
                  bookmarkProgress: isRead ? 1.0 : (b.bookmarkProgress >= 0.99 ? 0 : b.bookmarkProgress),
                  lastTokenIndex: isRead ? b.lastTokenIndex : (b.bookmarkProgress >= 0.99 ? 0 : b.lastTokenIndex)
              };
          }
          return b;
      }));
  }, []);
  
  const handleToggleFavorite = useCallback((bookId: string, isFavorite: boolean) => {
      setBooks(prev => prev.map(b => b.id === bookId ? { ...b, isFavorite } : b));
  }, []);

  const selectedBook = books.find(b => b.id === selectedBookId);

  return (
    <div className="relative min-h-screen bg-[#f5f5f7]">
      {/* 
        LAYER 1: The Library 
        We keep this mounted. When reading, we scale it down slightly
        but DO NOT fade it out completely, so the "Shrink-to-Shelf" has a visual target.
      */}
      <div 
        className={`transition-all duration-700 cubic-bezier(0.32, 0.72, 0, 1) ${
          selectedBookId ? 'scale-[0.92] origin-center brightness-75 pointer-events-none' : 'scale-100 brightness-100'
        }`}
        aria-hidden={!!selectedBookId}
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

      {/* 
        LAYER 1.5: Backdrop 
        Dim the library when reading.
      */}
      <AnimatePresence>
        {selectedBookId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 bg-black/20 z-40 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* 
        LAYER 2: The Reader Container (Orchestrator)
        Uses AnimatePresence to handle the exit animation.
      */}
      <AnimatePresence>
        {selectedBook && !showRsvpDemo && (
          <ReaderContainer 
            key={selectedBook.id} // Critical for AnimatePresence
            book={selectedBook} 
            onClose={handleCloseReader} 
          />
        )}

        {selectedBook && showRsvpDemo && (
          <div key={`${selectedBook.id}-rsvp-demo`} className="p-6 z-50">
            <RSVPLite content={books[0]?.content ?? books.map(b=>b.title).join('\n\n') || 'Welcome to Flow — RSVP Demo.'} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};