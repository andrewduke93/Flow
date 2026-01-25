import React, { useMemo, useEffect, useRef } from 'react';
import { Book, Chapter } from '../types';
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

  // Use a stable key to prevent animation re-triggering on re-renders
  const mountTimeRef = useRef(Date.now());

  return (
    <div
        key={mountTimeRef.current}
        className="absolute bottom-full mb-4 left-2 right-2 z-50 flex flex-col max-h-[60vh] rounded-3xl overflow-hidden shadow-2xl border backdrop-blur-3xl origin-bottom animate-slideUp"
        style={{ 
            backgroundColor: `${theme.dimmer}f5`, 
            borderColor: theme.borderColor
        }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: theme.borderColor }}>
            <div>
                <h3 className="text-base font-bold lowercase" style={{ color: theme.primaryText }}>chapters</h3>
                <span className="text-[10px] opacity-40" style={{ color: theme.secondaryText }}>
                    {tracks.length} {tracks.length !== 1 ? 'sections' : 'section'}
                </span>
            </div>
            <button 
                onClick={onClose}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
            >
                <ChevronDown size={20} />
            </button>
        </div>

        {/* List */}
        <div 
            ref={scrollRef}
            className="overflow-y-auto custom-scrollbar px-2 pb-4 pt-1"
        >
            {tracks.map((track, i) => {
                const isActive = i === activeTrackIndex;
                
                return (
                    <button
                        key={track.original.id}
                        onClick={() => handleSelect(track.index)}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 group ${
                            isActive ? 'shadow-md' : 'hover:bg-white/5 opacity-50'
                        }`}
                        style={{
                            backgroundColor: isActive ? theme.surface : 'transparent'
                        }}
                    >
                        {/* Status Icon */}
                        <div 
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                isActive ? 'bg-white/5' : 'bg-transparent'
                            }`}
                            style={{ 
                                color: isActive ? theme.accent : theme.secondaryText
                            }}
                        >
                            {isActive ? (
                                <div className="relative">
                                     <div className="absolute inset-0 bg-current opacity-30 animate-ping rounded-full" />
                                     <div className="w-2.5 h-2.5 bg-current rounded-full" />
                                </div>
                            ) : (
                                <span className="text-xs font-semibold opacity-40 tabular-nums">{i + 1}</span>
                            )}
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <h4 
                                className="text-sm font-semibold truncate lowercase"
                                style={{ color: theme.primaryText }}
                            >
                                {track.cleanTitle}
                            </h4>
                            {track.cleanTitle !== track.original.title && (
                                <span 
                                    className="text-[10px] opacity-30 truncate block"
                                    style={{ color: theme.primaryText }}
                                >
                                    {track.original.title}
                                </span>
                            )}
                        </div>

                        {/* Duration */}
                        <div 
                            className="flex items-center gap-1 opacity-40 shrink-0"
                            style={{ color: theme.primaryText }}
                        >
                            <span className="text-[11px] font-medium tabular-nums">{track.durationLabel}</span>
                        </div>
                    </button>
                );
            })}
        </div>
    </div>
  );
};