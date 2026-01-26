import React, { useEffect, useState, useRef, useMemo } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { TitanCore } from '../services/titanCore';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface ChapterMarker {
  index: number;
  percentage: number;
  title: string;
}

/**
 * RSVPProgressHUD (Phase 10-C: Semantic Timeline)
 * Identity: Minimalist UX Architect.
 * Mission: A non-distracting progress indicator with Semantic Timeline Segmentation.
 * Update: Theme Unification.
 */
export const RSVPProgressHUD: React.FC = () => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const core = TitanCore.getInstance();
  const theme = useTitanTheme();

  // State
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  
  // Scrubber State
  const [isScrubbing, setIsScrubbing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // WPM & Estimates
  const [wpm, setWpm] = useState(heartbeat.wpm);
  const [showToast, setShowToast] = useState(false);
  const prevWpmRef = useRef(heartbeat.wpm);

  // 1. DATA SYNC
  useEffect(() => {
    const sync = () => {
      setTotalTokens(heartbeat.tokens.length);
      setCurrentIndex(heartbeat.currentIndex);
      
      const pct = heartbeat.tokens.length > 0 ? heartbeat.currentIndex / heartbeat.tokens.length : 0;
      setProgress(pct);
      
      setIsPlaying(conductor.state === RSVPState.PLAYING);

      if (heartbeat.wpm !== prevWpmRef.current) {
        setWpm(heartbeat.wpm);
        prevWpmRef.current = heartbeat.wpm;
        setShowToast(true);
      }
    };

    const unsubConductor = conductor.subscribe(sync);
    const unsubHeartbeat = heartbeat.subscribe(sync); 
    sync();

    return () => {
      unsubConductor();
      unsubHeartbeat();
    };
  }, []);

  // 2. TIMELINE MARKERS (Semantic Segmentation)
  // Use TitanCore's pre-calculated token offsets for accuracy
  const markers = useMemo<ChapterMarker[]>(() => {
    const book = core.currentBook;
    const tokens = heartbeat.tokens;
    if (!book || !book.chapters || tokens.length === 0) return [];

    // Use TitanCore's accurate chapter token offsets
    const chapterOffsets = core.chapterTokenOffsets;
    
    const result: ChapterMarker[] = [];
    book.chapters.forEach((chapter, i) => {
      const tokenIndex = chapterOffsets[i] ?? 0;
      // Only add if within bounds
      if (tokenIndex < tokens.length) {
        result.push({
          index: tokenIndex,
          percentage: tokenIndex / tokens.length,
          title: chapter.title
        });
      }
    });

    return result;
  }, [core.currentBook, core.chapterTokenOffsets, totalTokens]);

  // 3. CURRENT CHAPTER & TIME REMAINING
  const currentChapterInfo = useMemo(() => {
     let currentMarker = markers[0];
     let nextMarkerIndex = totalTokens;

     for (let i = 0; i < markers.length; i++) {
        if (markers[i].index <= currentIndex) {
           currentMarker = markers[i];
           nextMarkerIndex = (i + 1 < markers.length) ? markers[i + 1].index : totalTokens;
        } else {
           break;
        }
     }

     if (!currentMarker) return null;

     const wordsLeftInChapter = nextMarkerIndex - currentIndex;
     const minutesLeft = Math.ceil(wordsLeftInChapter / wpm);

     return {
       title: currentMarker.title,
       timeLeft: `${minutesLeft}m left`
     };
  }, [currentIndex, markers, wpm, totalTokens]);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast, wpm]);

  // 4. SCRUBBER LOGIC
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsScrubbing(true);
    conductor.pause();
    updateScrub(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) updateScrub(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsScrubbing(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const updateScrub = (e: React.PointerEvent) => {
    if (!containerRef.current || totalTokens === 0) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const rawPct = x / rect.width;
    let targetIndex = Math.floor(rawPct * totalTokens);

    const SNAP_THRESHOLD = totalTokens * 0.03;
    let didSnap = false;

    for (const marker of markers) {
       if (Math.abs(marker.index - targetIndex) < SNAP_THRESHOLD) {
          if (currentIndex !== marker.index) didSnap = true;
          targetIndex = marker.index;
          break;
       }
    }

    if (didSnap) RSVPHapticEngine.impactMedium();
    try { newRsvpEngine.seek(targetIndex); } catch (e) { heartbeat.seek(targetIndex); }
  };

  const opacity = (isPlaying && !isScrubbing) ? 0.1 : 0.9;

  return (
    <div 
       ref={containerRef}
       className="absolute inset-x-0 bottom-8 h-12 z-50 flex items-end cursor-pointer group touch-none"
       onPointerDown={handlePointerDown}
       onPointerMove={handlePointerMove}
       onPointerUp={handlePointerUp}
       onPointerCancel={handlePointerUp}
    >
      
      {/* Dynamic HUD Labels (Chapter & Time) */}
      <div 
        className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-6 transition-opacity duration-300 ease-out"
        style={{ opacity: (isScrubbing || showToast || !isPlaying) ? 1 : 0 }}
      >
         {/* Left: Chapter Info */}
         {currentChapterInfo && (
            <div className="flex flex-col items-start">
               <span 
                 className="text-[10px] font-bold uppercase tracking-widest mb-0.5 lowercase"
                 style={{ color: theme.accent }}
               >
                 {currentChapterInfo.title}
               </span>
               <span className="text-xs font-medium lowercase" style={{ color: theme.secondaryText }}>
                 {currentChapterInfo.timeLeft}
               </span>
            </div>
         )}

         {/* Right: WPM (Inverted Pill) */}
         <div 
            className="backdrop-blur-md font-sans text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border border-transparent lowercase"
            style={{ 
                backgroundColor: theme.primaryText, 
                color: theme.background
            }}
         >
            {wpm} wpm
         </div>
      </div>

      {/* Progress Track */}
      <div className="w-full h-[4px] relative group-hover:h-[6px] transition-all duration-300" style={{ backgroundColor: theme.secondaryText + '33' }}>
        
        {/* Timeline Markers (Dividers) */}
        {markers.map((m, i) => (
           <div 
              key={i}
              className="absolute top-0 bottom-0 w-[2px] z-10 pointer-events-none"
              style={{ 
                 left: `${m.percentage * 100}%`,
                 backgroundColor: theme.background, // Create a "cut" effect
                 opacity: 0.5
              }}
           />
        ))}

        {/* Filled Bar */}
        <div 
          className="h-full rounded-r-full transition-all duration-100 ease-out relative"
          style={{ 
            width: `${progress * 100}%`,
            backgroundColor: theme.accent,
            opacity: opacity
          }}
        >
           {/* Scrubber Knob (Visible on interaction) */}
           <div 
              className={`absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md transform scale-0 transition-transform duration-200 ${
                  isScrubbing ? 'scale-100' : 'group-hover:scale-100'
              }`} 
              style={{ backgroundColor: theme.primaryText }}
           />
        </div>
      </div>
    </div>
  );
};