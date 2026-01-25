import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, Plus, Minus, Type, ListMusic } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';
import { SmartChapterSelector } from './SmartChapterSelector';

interface MediaCommandCenterProps {
  book: Book;
  onToggleRSVP: (startOffset?: number) => void;
  isRSVPActive: boolean; 
  onSettingsClick: () => void;
}

/**
 * MediaCommandCenter (Symmetric Control Deck)
 * Identity: Industrial Design.
 * Mission: Perfect center-weighted balance.
 */
export const MediaCommandCenter: React.FC<MediaCommandCenterProps> = ({ book, onToggleRSVP, isRSVPActive, onSettingsClick }) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const { settings, updateSettings } = useTitanSettings();
  const theme = useTitanTheme();

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPreviewPct, setScrubPreviewPct] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [showChapterSelector, setShowChapterSelector] = useState(false);
  const showChapterSelectorRef = useRef(false); // Ref to avoid re-renders during selector open
  
  // Refs
  const progressBarRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartPct = useRef(0);
  const wasPlayingRef = useRef(false);
  const lastActionTime = useRef(0); // Debounce guard
  const lastSpeedAdjustTime = useRef(0); // Speed debounce

  const activeColor = theme.accent; 

  // PRECISE THRESHOLDS FROM CORE
  const preciseThresholds = useMemo(() => {
      if (core.chapterTokenOffsets.length > 0 && core.totalTokens > 0) {
          return core.chapterTokenOffsets.map(offset => offset / core.totalTokens);
      }
      
      if (!book.chapters || book.chapters.length === 0) return [];
      const totalWords = book.chapters.reduce((acc, c) => acc + c.wordCount, 0);
      if (totalWords === 0) return book.chapters.map((_, i) => i / book.chapters!.length);
      
      let accum = 0;
      return book.chapters.map(c => {
          const t = accum / totalWords;
          accum += c.wordCount;
          return t;
      });
  }, [book, core.chapterTokenOffsets, core.totalTokens]);

  // -- Helpers --

  const getEstTime = useCallback((pct: number) => {
    const total = Math.max(1, heartbeat.tokens.length || core.totalTokens);
    const idx = Math.floor(pct * total);
    const left = total - idx;
    const speed = settings.rsvpSpeed || 250; // Fallback if settings corrupted
    const mins = Math.ceil(left / speed);
    
    if (mins < 1) return "< 1m";
    if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    }
    return `${mins}m`;
  }, [settings.rsvpSpeed, heartbeat.tokens.length, core.totalTokens]);

  const getCurrentChapterTitle = useCallback((pct: number) => {
      if (!book.chapters || book.chapters.length === 0) return "";
      
      // Use a binary search or at least don't re-search every frame if possible
      let idx = 0;
      // Reverse find is often faster for current progress
      for (let i = preciseThresholds.length - 1; i >= 0; i--) {
          if (pct >= preciseThresholds[i] - 0.0001) {
              idx = i;
              break;
          }
      }
      
      const chapter = book.chapters[idx];
      if (!chapter) return "";
      
      const rawTitle = chapter.title.trim();
      
      const verboseMatch = rawTitle.match(/^(?:chapter|part|book|letter|section)\s+(?:[\divxlcdm]+)\s*[:.-]\s+(.+)$/i);
      const numberMatch = rawTitle.match(/^\d+\.\s+(.+)$/i);

      if (verboseMatch && verboseMatch[1]) return verboseMatch[1];
      if (numberMatch && numberMatch[1]) return numberMatch[1];
      
      return rawTitle;

  }, [book.chapters, preciseThresholds]);

  const lastRenderedPct = useRef(0);

  // -- Visual Sync --
  const updateVisuals = useCallback((pct: number) => {
      const safePct = Math.max(0, Math.min(1, pct));
      if (progressBarRef.current) {
          progressBarRef.current.style.width = `${safePct * 100}%`;
      }
      if (knobRef.current) {
          knobRef.current.style.left = `${safePct * 100}%`;
          knobRef.current.style.transform = `translateX(-50%)`;
      }
      
      // OPTIMIZATION: Skip React state updates when chapter selector is open
      // This prevents re-renders that cause the selector to re-animate
      if (showChapterSelectorRef.current) return;
      
      // OPTIMIZATION: Heavy throttling for React state updates.
      // Direct DOM updates above handle the smoothness.
      // We only rerender labels (time/chapter) every 0.5% or at boundaries.
      const diff = Math.abs(safePct - lastRenderedPct.current);
      if (diff > 0.005 || safePct === 0 || safePct === 1) {
          lastRenderedPct.current = safePct;
          setCurrentProgress(safePct);
      }
  }, []); // Remove dependency on currentProgress

  useEffect(() => {
    const syncState = () => {
      setIsPlaying(conductor.state === RSVPState.PLAYING);
      // Note: We no longer auto-close chapter selector here.
      // The selector pauses RSVP when opened, and closes itself on selection.
    };

    const syncProgress = (pct: number) => {
      if (!isScrubbingRef.current) updateVisuals(pct);
    };

    // HIGH-FREQUENCY SYNC (Direct DOM)
    const syncSmoothProgress = () => {
        if (!isScrubbingRef.current && core.isRSVPMode && heartbeat.tokens.length > 0) {
            const pct = heartbeat.currentIndex / heartbeat.tokens.length;
            updateVisuals(pct);
        }
    };

    syncState();
    
    // Initial position
    const initialPct = (core.isRSVPMode && heartbeat.tokens.length > 0) 
        ? heartbeat.currentIndex / heartbeat.tokens.length 
        : core.currentProgress;
    
    lastRenderedPct.current = initialPct;
    setCurrentProgress(initialPct);
    updateVisuals(initialPct);

    const unsubCore = core.subscribe(syncState);
    const unsubCond = conductor.subscribe(syncState);
    const unsubProgress = core.onProgress(syncProgress);
    const unsubHeartbeat = heartbeat.subscribe(syncSmoothProgress);

    return () => { 
        unsubCore(); 
        unsubCond(); 
        unsubProgress(); 
        unsubHeartbeat();
    };
  }, [updateVisuals]); // updateVisuals now has no dependencies, so this effect runs once.

  // -- Interaction Logic --
  const handlePointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsScrubbing(true);
      isScrubbingRef.current = true;
      dragStartY.current = e.clientY;
      
      if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        dragStartPct.current = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      }

      wasPlayingRef.current = conductor.state === RSVPState.PLAYING;
      if (wasPlayingRef.current) conductor.pause();

      updateScrubLogic(e.clientX, e.clientY, false);
      (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isScrubbingRef.current) return;
      e.preventDefault();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
          updateScrubLogic(e.clientX, e.clientY, true);
      });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (!isScrubbingRef.current) return;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      
      setIsScrubbing(false);
      isScrubbingRef.current = false;
      (e.target as Element).releasePointerCapture(e.pointerId);

      if (trackRef.current) {
          const rect = trackRef.current.getBoundingClientRect();
          const finalPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          commitScrub(finalPct);
      }

      if (wasPlayingRef.current) conductor.play();
  };

  const updateScrubLogic = (clientX: number, clientY: number, useFriction: boolean) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let rawPct = (clientX - rect.left) / rect.width;

      if (useFriction) {
          const verticalDist = Math.abs(clientY - dragStartY.current);
          let frictionFactor = 1.0;
          if (verticalDist > 200) frictionFactor = 0.1;
          else if (verticalDist > 100) frictionFactor = 0.3;
          else if (verticalDist > 50) frictionFactor = 0.6;

          if (frictionFactor < 1.0) {
              rawPct = dragStartPct.current + (rawPct - dragStartPct.current) * frictionFactor;
          }
      }

      const clampedPct = Math.max(0, Math.min(1, rawPct));
      
      setScrubPreviewPct(prev => {
          const crossed = preciseThresholds.some(thresh => 
              (prev < thresh && clampedPct >= thresh) || (prev > thresh && clampedPct <= thresh)
          );
          if (crossed) RSVPHapticEngine.impactLight();
          return clampedPct;
      });

      updateVisuals(clampedPct);
      
      if (core.isRSVPMode) {
           const total = Math.max(1, heartbeat.tokens.length);
           heartbeat.seek(Math.floor(clampedPct * total));
      } else {
           core.jump(clampedPct);
      }
  };

  const commitScrub = (pct: number) => {
      if (core.isRSVPMode) {
          const total = Math.max(1, heartbeat.tokens.length);
          heartbeat.seek(Math.floor(pct * total));
      } else {
          core.jump(pct);
      }
  };

  const handleMainAction = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    // Debounce rapid taps (300ms)
    const now = Date.now();
    if (now - lastActionTime.current < 300) return;
    lastActionTime.current = now;
    
    if (navigator.vibrate) navigator.vibrate(10);
    onToggleRSVP();
  };

  const adjustSpeed = (delta: number) => {
      // Debounce rapid adjustments (80ms - allows holding but prevents spam)
      const now = Date.now();
      if (now - lastSpeedAdjustTime.current < 80) return;
      lastSpeedAdjustTime.current = now;
      
      RSVPHapticEngine.impactLight();
      const current = settings.rsvpSpeed || 250; // Fallback for safety
      const next = Math.max(50, Math.min(2000, current + delta));
      updateSettings({ rsvpSpeed: next, hasCustomSpeed: true });
  };

  const handleChapterSelect = (chapterIndex: number) => {
      RSVPHapticEngine.impactMedium(); // Confirm navigation
      
      if (core.isRSVPMode) {
          if (chapterIndex < core.chapterTokenOffsets.length) {
              const tokenIdx = core.chapterTokenOffsets[chapterIndex];
              heartbeat.seek(tokenIdx);
              // Use jumpToChapter to ensure all listeners are notified
              // This triggers both jumpListeners and notify() for proper background sync
              core.jumpToChapter(chapterIndex);
          }
      } else {
          // Scroll Mode
          core.jumpToChapter(chapterIndex);
      }
  };

  return (
    <div 
        className="w-full relative pointer-events-auto"
    >
          {/* SMART CHAPTER SELECTOR POPUP */}
          {showChapterSelector && (
                <SmartChapterSelector 
                    book={book}
                    currentProgress={currentProgress}
                    readSpeed={settings.rsvpSpeed}
                    preciseThresholds={preciseThresholds}
                    onSelectChapter={(idx) => handleChapterSelect(idx)}
                    onClose={() => {
                        showChapterSelectorRef.current = false;
                        setShowChapterSelector(false);
                    }}
                />
            )}

          {/* SCRUB PREVIEW TOOLTIP */}
          {isScrubbing && !showChapterSelector && (
                <div 
                    className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none z-50"
                    style={{animation: 'fadeIn 300ms cubic-bezier(0.16, 1, 0.3, 1)'}}
                >
                    <div 
                        className="px-4 py-1.5 rounded-full shadow-xl border backdrop-blur-md text-xs font-bold font-variant-numeric tabular-nums flex items-center gap-2"
                        style={{ 
                            backgroundColor: theme.surface, 
                            borderColor: theme.borderColor, 
                            color: theme.primaryText 
                        }}
                    >
                        <span>{(scrubPreviewPct * 100).toFixed(0)}%</span>
                        <span className="opacity-30">|</span>
                        <span className="lowercase">{getEstTime(scrubPreviewPct)}</span>
                    </div>
                </div>
            )}

          {/* MAIN FLOATING DECK */}
          <div 
            className="w-full backdrop-blur-2xl rounded-3xl shadow-2xl border overflow-hidden"
            style={{
                backgroundColor: `${theme.surface}f5`,
                borderColor: theme.borderColor
            }}
          >
              {/* 0. INFO ROW (Smart Trigger) */}
              <button 
                onClick={() => {
                    RSVPHapticEngine.impactLight();
                    // Pause RSVP when opening chapter selector
                    if (!showChapterSelector && conductor.state === RSVPState.PLAYING) {
                        conductor.pause();
                    }
                    const nextState = !showChapterSelector;
                    showChapterSelectorRef.current = nextState;
                    setShowChapterSelector(nextState);
                }}
                className="w-full flex justify-between items-center px-5 pt-2.5 pb-0 text-[10px] font-medium select-none hover:opacity-100 transition-opacity active:scale-[0.99]" 
                style={{ 
                    color: theme.primaryText,
                    opacity: showChapterSelector ? 0.8 : 0.4
                }}
              >
                 <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                     <ListMusic size={10} className="opacity-60" />
                     <span className="truncate lowercase">{getCurrentChapterTitle(currentProgress)}</span>
                 </div>
                 <span className="tabular-nums opacity-60 text-[9px]">{getEstTime(currentProgress)}</span>
              </button>

              {/* 1. TIMELINE GROOVE (Full Width) */}
              <div 
                 className="relative h-4 w-full cursor-pointer group touch-none z-20"
                 onPointerDown={handlePointerDown}
                 onPointerMove={handlePointerMove}
                 onPointerUp={handlePointerUp}
                 onPointerCancel={handlePointerUp}
              >
                  <div ref={trackRef} className="absolute inset-x-6 inset-y-0 flex items-center">
                      {/* Groove Track */}
                      <div 
                        className="w-full h-[1.5px] rounded-full overflow-hidden relative"
                        style={{ backgroundColor: theme.primaryText + '08' }}
                      >
                          {/* Progress Fill */}
                          <div 
                            ref={progressBarRef}
                            className="absolute top-0 left-0 bottom-0 h-full will-change-transform rounded-full"
                            style={{ width: '0%', backgroundColor: activeColor }}
                          />
                          {/* Chapter Ticks */}
                          {useMemo(() => preciseThresholds.map((t, i) => (
                              <div 
                                key={i}
                                className="absolute top-0 bottom-0 w-[1px] bg-white/10"
                                style={{ left: `${t * 100}%` }}
                              />
                          )), [preciseThresholds])}
                      </div>

                      {/* Knob */}
                      <div 
                        ref={knobRef}
                        className={`absolute top-1/2 w-3.5 h-3.5 -mt-[7px] rounded-full shadow-lg border-2 border-white transition-all duration-200 will-change-transform ${
                            isScrubbing ? 'scale-125' : 'scale-0 group-hover:scale-75'
                        }`}
                        style={{ 
                            left: '0%', 
                            backgroundColor: theme.accent,
                            boxShadow: `0 0 10px ${theme.accent}33`
                        }}
                      />
                  </div>
              </div>

              {/* 2. CONTROL CLUSTER */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center px-5 pb-4 pt-0.5">
                  
                  {/* SPEED SPOT */}
                  <div 
                    className="flex items-center h-11 rounded-xl overflow-hidden border"
                    style={{ borderColor: theme.borderColor, backgroundColor: `${theme.primaryText}05` }}
                  >
                      <button 
                        onClick={() => adjustSpeed(-25)}
                        className="w-11 h-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition-all outline-none"
                        style={{ color: theme.secondaryText }}
                      >
                        <Minus size={16} />
                      </button>
                      
                      <div className="w-px h-5" style={{ backgroundColor: theme.borderColor }} />
                      
                      <div className="px-2 text-center flex items-center justify-center min-w-[44px]">
                        <span className="font-variant-numeric tabular-nums text-xs font-semibold" style={{ color: theme.primaryText }}>
                            {settings.rsvpSpeed}
                        </span>
                      </div>
                      
                      <div className="w-px h-5" style={{ backgroundColor: theme.borderColor }} />

                      <button 
                        onClick={() => adjustSpeed(25)}
                        className="w-11 h-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition-all outline-none"
                        style={{ color: theme.secondaryText }}
                      >
                        <Plus size={16} />
                      </button>
                  </div>

                  {/* MASTER PLAY SPOT (Fixed Center) */}
                  <div className="flex items-center justify-center px-4">
                      <button
                          onClick={handleMainAction}
                          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg relative text-white border border-white/10 hover:scale-105 active:scale-95 transition-all outline-none"
                          style={{ 
                              backgroundColor: activeColor,
                              boxShadow: `0 6px 24px -4px ${activeColor}66`
                          }}
                      >
                          {(isRSVPActive && isPlaying) ? (
                              <Pause size={20} className="fill-white" />
                          ) : (
                              <Play size={20} className="fill-white ml-0.5" />
                          )}
                      </button>
                  </div>

                  {/* TYPE SPOT (Settings Button) */}
                  <button 
                    className="flex items-center justify-center h-11 gap-2 rounded-xl border hover:bg-white/5 active:scale-95 transition-all outline-none px-3"
                    style={{ borderColor: theme.borderColor, backgroundColor: `${theme.primaryText}05` }}
                    onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
                  >
                     <Type size={16} style={{ color: theme.secondaryText }} />
                     <div className="w-px h-4" style={{ backgroundColor: theme.borderColor }} />
                     <div className="flex items-baseline gap-0.5 opacity-60">
                         <Type size={14} style={{ color: theme.secondaryText }} />
                         <Type size={10} style={{ color: theme.secondaryText }} />
                     </div>
                  </button>
              </div>
          </div>
    </div>
  );
}