import React, { useMemo, useEffect, useRef } from 'react';
import { Book, Chapter } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';
import { Check, Clock, ChevronDown } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface SmartChapterSelectorProps {
  book: Book;
  currentProgress: number; // 0.0 to 1.0
  preciseThresholds: number[]; // Exact starting % for each chapter
  onSelectChapter: (index: number) => void;
  onSelect?: (progress: number) => void; // Deprecated but kept for compatibility
  onClose: () => void;
  readSpeed: number;
}

/**
 * SmartChapterSelector
 * Identity: Information Architect.
 * Mission: A "Playlist" for the book. Cleans dirty metadata and provides context.
 */
export const SmartChapterSelector: React.FC<SmartChapterSelectorProps> = ({ 
    book, 
    currentProgress, 
    preciseThresholds,
    onSelectChapter,
    onSelect,
    onClose,
    readSpeed 
}) => {
  const theme = useTitanTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. SMART DATA PREP
  const tracks = useMemo(() => {
    if (!book.chapters || book.chapters.length === 0) return [];
    
    return book.chapters.map((chapter, i) => {
        // Use precise threshold if available, otherwise 0
        const startProgress = preciseThresholds[i] ?? 0;
        
        // Smart Title Cleaning
        // Rules:
        // 1. "Chapter 1: The End" -> "The End"
        // 2. "1. The End" -> "The End"
        // 3. "Chapter 1" -> "Chapter 1" (Keep full if no subtitle)
        let cleanTitle = chapter.title.trim();
        
        // Match: Type + Number + Separator + Text
        const verboseMatch = cleanTitle.match(/^(?:chapter|part|book|letter|section)\s+(?:[\divxlcdm]+)\s*[:.-]\s+(.+)$/i);
        // Match: Number + Dot + Text
        const numberMatch = cleanTitle.match(/^\d+\.\s+(.+)$/i);

        if (verboseMatch && verboseMatch[1]) {
            cleanTitle = verboseMatch[1];
        } else if (numberMatch && numberMatch[1]) {
            cleanTitle = numberMatch[1];
        }

        // Duration Estimate
        const minutes = Math.ceil(chapter.wordCount / readSpeed);

        return {
            original: chapter,
            index: i,
            cleanTitle,
            startProgress,
            durationLabel: minutes < 1 ? "< 1m" : `${minutes}m`,
        };
    });
  }, [book, readSpeed, preciseThresholds]);

  // Determine active track
  const activeTrackIndex = useMemo(() => {
      // Find the last track where startProgress <= currentProgress
      let active = 0;
      for (let i = 0; i < tracks.length; i++) {
          // Use a slightly loose comparison
          if (currentProgress >= (tracks[i].startProgress - 0.0001)) {
              active = i;
          } else {
              break;
          }
      }
      return active;
  }, [tracks, currentProgress]);

  // Auto-scroll to active
  useEffect(() => {
      if (scrollRef.current) {
          const rowHeight = 64; // Approx
          const target = Math.max(0, (activeTrackIndex * rowHeight) - 100);
          scrollRef.current.scrollTo({ top: target, behavior: 'smooth' });
      }
  }, []); // Run once on mount

  const handleSelect = (index: number) => {
      RSVPHapticEngine.impactMedium();
      if (onSelectChapter) {
          onSelectChapter(index);
      } else if (onSelect) {
          // Fallback legacy
          onSelect(tracks[index].startProgress);
      }
      onClose();
  };

  return (
    <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute bottom-full mb-4 left-0 right-0 z-50 flex flex-col max-h-[60vh] rounded-[32px] overflow-hidden shadow-2xl border backdrop-blur-xl origin-bottom"
        style={{ 
            backgroundColor: theme.dimmer, 
            borderColor: theme.borderColor 
        }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: theme.borderColor }}>
            <span className="text-xs font-bold uppercase tracking-widest opacity-50" style={{ color: theme.primaryText }}>
                {tracks.length} Chapters
            </span>
            <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
                style={{ color: theme.secondaryText }}
            >
                <ChevronDown size={20} />
            </button>
        </div>

        {/* List */}
        <div 
            ref={scrollRef}
            className="overflow-y-auto custom-scrollbar p-2"
        >
            {tracks.map((track, i) => {
                const isActive = i === activeTrackIndex;
                
                return (
                    <button
                        key={track.original.id}
                        onClick={() => handleSelect(track.index)}
                        className={`w-full text-left flex items-center gap-4 p-3 rounded-2xl transition-all duration-200 group ${
                            isActive ? 'shadow-sm' : 'hover:bg-black/5'
                        }`}
                        style={{
                            backgroundColor: isActive ? theme.surface : 'transparent'
                        }}
                    >
                        {/* Status Icon */}
                        <div 
                            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                isActive ? 'bg-black/5' : 'bg-transparent'
                            }`}
                            style={{ 
                                color: isActive ? theme.accent : theme.secondaryText,
                                opacity: isActive ? 1 : 0.3
                            }}
                        >
                            {isActive ? (
                                <div className="relative">
                                     <div className="absolute inset-0 bg-current opacity-20 animate-ping rounded-full" />
                                     <div className="w-2.5 h-2.5 bg-current rounded-full" />
                                </div>
                            ) : (
                                <span className="text-xs font-bold tabular-nums">{i + 1}</span>
                            )}
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <h4 
                                className={`text-sm font-bold truncate leading-tight ${isActive ? '' : 'opacity-80'}`}
                                style={{ color: theme.primaryText }}
                            >
                                {track.cleanTitle}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 opacity-50">
                                {track.cleanTitle !== track.original.title && (
                                    <span className="text-[10px] uppercase tracking-wide truncate max-w-[120px]">
                                        {track.original.title}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Duration */}
                        <div className="flex items-center gap-1.5 opacity-40 shrink-0 text-xs font-medium">
                            <Clock size={12} />
                            <span>{track.durationLabel}</span>
                        </div>
                    </button>
                );
            })}
        </div>
    </motion.div>
  );
};