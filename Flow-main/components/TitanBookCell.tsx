import React, { useRef, useMemo } from 'react';
import { Book } from '../types';
import { getDerivedColor } from '../utils';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Check, BookOpen, Star, CheckCircle } from 'lucide-react';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';

interface TitanBookCellProps {
  book: Book;
  onSelect: (book: Book) => void;
  // Manage Mode Props
  isEditing?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (book: Book) => void;
  onRequestManage?: (book: Book) => void;
  onLongPress?: (book: Book) => void; // New Prop
}

const ProceduralCover: React.FC<{ book: Book }> = React.memo(({ book }) => {
  const themeColor = getDerivedColor(book.tintColorHex);
  return (
    <div 
      className="w-full h-full flex items-center justify-center p-6 relative overflow-hidden"
      style={{ backgroundColor: themeColor }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
         {/* Soft, friendly circles instead of sharp geometry */}
         <div className="absolute w-32 h-32 bg-white rounded-full blur-2xl transform -translate-x-8 -translate-y-8 opacity-60" />
         <div className="absolute w-24 h-24 bg-white rounded-full blur-xl transform translate-x-6 translate-y-6 opacity-40" />
      </div>
      <div className="relative z-10 text-center text-black w-full break-words">
        <h3 className="font-serif font-bold text-lg leading-tight mb-2 line-clamp-3 lowercase">
          {book.title}
        </h3>
        <p className="font-sans text-[10px] md:text-xs font-semibold uppercase tracking-wider opacity-60">
          {book.author}
        </p>
      </div>
    </div>
  );
});

/**
 * TitanBookCell (Quirky Jiggle Edition)
 */
export const TitanBookCell: React.FC<TitanBookCellProps> = React.memo(({ book, onSelect, isEditing, isSelected, onToggleSelect, onLongPress }) => {
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  // Random Jiggle Offset
  const randomDelay = useRef(Math.random() * 0.2);
  const randomRotation = useRef(Math.random() > 0.5 ? 1 : -1);

  // Interaction Logic
  const timerRef = useRef<number | null>(null);
  const isLongPressTriggered = useRef(false);
  const hasMovedRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
      isLongPressTriggered.current = false;
      hasMovedRef.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      
      // Start Timer
      timerRef.current = window.setTimeout(() => {
          if (onLongPress) {
              isLongPressTriggered.current = true;
              if (navigator.vibrate) navigator.vibrate(20); // Haptic feedback
              onLongPress(book);
          }
      }, 500); // 500ms hold time
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      // Calculate distance to detect scroll intent vs tap
      // We check this regardless of timer state to prevent drag-after-timeout selection
      const dist = Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y);
      
      // 10px threshold usually filters out shaky fingers but catches scrolls
      if (dist > 10) {
          hasMovedRef.current = true;
          if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
          }
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
      }
      
      // Only trigger if:
      // 1. Long press didn't happen
      // 2. User didn't scroll (move > 10px)
      if (!isLongPressTriggered.current && !hasMovedRef.current) {
          // Normal Click
          if (isEditing) {
              onToggleSelect?.(book);
          } else {
              onSelect(book);
          }
      }
      // Reset flags
      isLongPressTriggered.current = false;
      hasMovedRef.current = false;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
      // If the browser cancels the event (e.g. native scroll takes over), abort everything
      if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
      }
      isLongPressTriggered.current = false;
      hasMovedRef.current = false;
  };

  const jiggle: Variants = {
      idle: { rotate: 0 },
      editing: { 
          rotate: [0, -1.5 * randomRotation.current, 1.5 * randomRotation.current, -1.5 * randomRotation.current, 0],
          transition: {
              duration: 0.35,
              repeat: Infinity,
              delay: randomDelay.current,
              ease: "linear"
          }
      }
  };

  const progressPercent = Math.floor((book.bookmarkProgress || 0) * 100);

  // LOGIC: Estimate Time Remaining
  const timeLeftLabel = useMemo(() => {
      // Show time left even if progress is 0, as long as we have data.
      if (!book.chapters || book.chapters.length === 0 || book.isFinished) return null;
      
      const totalWords = book.chapters.reduce((a, b) => a + b.wordCount, 0);
      const remainingWords = totalWords * (1 - (book.bookmarkProgress || 0));
      
      // Safety: default to 250 if settings failed
      const speed = settings.rsvpSpeed || 250; 
      const mins = Math.ceil(remainingWords / speed);
      
      if (mins <= 1) return "< 1m";
      if (mins < 60) return `${mins}m`;
      
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
  }, [book, settings.rsvpSpeed]);

  // Logic: Should we show the badge?
  // 1. Never show if finished.
  // 2. Show if we have a time estimate (even at 0%).
  // 3. Show if progress > 0% (fallback if time estimate fails).
  // 4. Hide if 0% AND no time estimate.
  const shouldShowBadge = !book.isFinished && (timeLeftLabel !== null || progressPercent > 0);

  return (
    <div 
      className="group cursor-pointer relative touch-pan-y"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => {
          e.preventDefault(); // Prevent native browser context menu
      }}
    >
      <motion.div 
        variants={jiggle}
        animate={isEditing ? "editing" : "idle"}
        className="relative aspect-[2/3] w-full rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300 z-10 will-change-transform"
        style={{ 
          backgroundColor: theme.surface,
          scale: isEditing ? 0.92 : 1.0,
        }}
        whileTap={{ scale: 0.96 }}
        whileHover={{ 
            scale: isEditing ? 0.92 : 1.03,
            y: isEditing ? 0 : -5 
        }}
      >
        {book.coverUrl ? (
          <img 
            src={book.coverUrl} 
            alt={`Cover of ${book.title}`}
            className={`w-full h-full object-cover transition-all duration-500 ${book.isFinished ? 'grayscale-[0.5] opacity-90' : ''}`}
            loading="lazy"
            decoding="async"
            style={{ backgroundColor: theme.borderColor }}
          />
        ) : (
          <ProceduralCover book={book} />
        )}

        {/* Hover Enter Prompt */}
        {!isEditing && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[1px] z-20">
                  <div 
                      className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-transform duration-200"
                      style={{ backgroundColor: theme.surface, color: theme.accent }}
                  >
                      {book.isFinished ? <CheckCircle size={24} fill="currentColor" stroke="none" /> : <BookOpen size={20} fill="currentColor" />}
                  </div>
             </div>
        )}
        
        {/* Dimmer when selected/editing */}
        {isEditing && (
            <div className={`absolute inset-0 bg-black/10 transition-opacity duration-200 z-30 ${isSelected ? 'opacity-40' : 'opacity-0'}`} />
        )}

        {/* COMPLETED BADGE */}
        {book.isFinished && (
           <div className="absolute top-2 right-2 z-50">
             <div 
                className="w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-white/20"
                style={{ backgroundColor: '#10b981', color: '#FFFFFF' }}
             >
                <Check size={14} strokeWidth={4} />
             </div>
           </div>
        )}

        {/* TIME / PERCENT BADGE - Only show if NOT finished and NOT 0% (unless time available) */}
        {shouldShowBadge && (
            <div className="absolute top-2 right-2 z-50">
                <div 
                    className="px-2 py-0.5 rounded-md flex items-center justify-center shadow-sm border border-white/20 backdrop-blur-sm"
                    style={{ 
                        backgroundColor: 'rgba(0,0,0,0.7)', 
                        color: '#FFFFFF'
                    }} 
                >
                    <span className="text-[10px] font-bold tabular-nums leading-none whitespace-nowrap">
                        {timeLeftLabel ? `${timeLeftLabel} left` : `${progressPercent}%`}
                    </span>
                </div>
            </div>
        )}

        {/* PROGRESS BAR OVERLAY */}
        {progressPercent > 0 && (
           <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40 z-40">
              <div 
                  className="h-full" 
                  style={{ 
                      width: `${Math.min(100, progressPercent)}%`, 
                      backgroundColor: book.isFinished ? '#10b981' : theme.accent 
                  }}
              />
           </div>
        )}
      </motion.div>
      
      {/* SELECTION BADGE */}
      <AnimatePresence>
        {isEditing && (
            <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -left-1 z-50"
            >
                <div 
                    className={`w-8 h-8 rounded-full border-[3px] shadow-sm flex items-center justify-center transition-all duration-200`}
                    style={{
                        backgroundColor: isSelected ? theme.accent : theme.surface,
                        borderColor: theme.background, 
                        color: isSelected ? '#FFFFFF' : 'transparent'
                    }}
                >
                    {isSelected && <Check size={16} strokeWidth={4} />}
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Metadata */}
      <div className="mt-3 space-y-0.5 px-0.5">
        <h3 
            className="font-serif font-bold text-base leading-tight line-clamp-2 transition-colors duration-200"
            style={{ color: theme.primaryText }}
        >
          {book.title}
        </h3>
        <p 
            className="font-sans text-sm font-medium transition-colors duration-200"
            style={{ color: theme.secondaryText }}
        >
          {book.author}
        </p>
      </div>
    </div>
  );
});