import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, Plus, Minus, Type, ListMusic, ChevronUp } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  // Refs
  const progressBarRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartPct = useRef(0);
  const wasPlayingRef = useRef(false);

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
    
    const mins = Math.ceil(left / settings.rsvpSpeed);
    
    if (mins < 1) return "< 1m left";
    if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m left`;
    }
    return `${mins}m left`;
  }, [settings.rsvpSpeed, heartbeat.tokens.length, core.totalTokens]);

  const getCurrentChapterTitle = useCallback((pct: number) => {
      if (!book.chapters || book.chapters.length === 0) return "";
      
      let idx = 0;
      for (let i = 0; i < preciseThresholds.length; i++) {
          if (pct >= preciseThresholds[i]) {
              idx = i;
          } else {
              break;
          }
      }
      
      idx = Math.min(idx, book.chapters.length - 1);
      const rawTitle = book.chapters[idx].title.trim();
      
      const verboseMatch = rawTitle.match(/^(?:chapter|part|book|letter|section)\s+(?:[\divxlcdm]+)\s*[:.-]\s+(.+)$/i);
      const numberMatch = rawTitle.match(/^\d+\.\s+(.+)$/i);

      if (verboseMatch && verboseMatch[1]) return verboseMatch[1];
      if (numberMatch && numberMatch[1]) return numberMatch[1];
      
      return rawTitle;

  }, [book.chapters, preciseThresholds]);

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
      setCurrentProgress(safePct);
  }, []);

  useEffect(() => {
    const syncState = () => {
      setIsPlaying(conductor.state === RSVPState.PLAYING);
      if (conductor.state === RSVPState.PLAYING) setShowChapterSelector(false);
    };

    const syncProgress = (pct: number) => {
      if (!isScrubbingRef.current) updateVisuals(pct);
    };

    syncState();
    if (core.isRSVPMode && heartbeat.tokens.length > 0) {
        updateVisuals(heartbeat.currentIndex / heartbeat.tokens.length);
    } else {
        updateVisuals(core.currentProgress);
    }

    const unsubCore = core.subscribe(syncState);
    const unsubCond = conductor.subscribe(syncState);
    const unsubProgress = core.onProgress(syncProgress);

    return () => { unsubCore(); unsubCond(); unsubProgress(); };
  }, [updateVisuals]);

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
    if (navigator.vibrate) navigator.vibrate(10);
    onToggleRSVP();
  };

  const adjustSpeed = (delta: number) => {
      RSVPHapticEngine.impactLight();
      const current = settings.rsvpSpeed;
      const next = Math.max(50, Math.min(2000, current + delta));
      updateSettings({ rsvpSpeed: next, hasCustomSpeed: true });
  };

  const handleChapterSelect = (chapterIndex: number) => {
      if (core.isRSVPMode) {
          if (chapterIndex < core.chapterTokenOffsets.length) {
              const tokenIdx = core.chapterTokenOffsets[chapterIndex];
              heartbeat.seek(tokenIdx);
              // Force sync to core to update UI/Progress immediately
              // This triggers the progress listeners which updates the scrubber/time
              core.saveProgress(tokenIdx); 
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
          <AnimatePresence>
            {showChapterSelector && (
                <SmartChapterSelector 
                    book={book}
                    currentProgress={currentProgress}
                    readSpeed={settings.rsvpSpeed}
                    preciseThresholds={preciseThresholds}
                    onSelectChapter={(idx) => handleChapterSelect(idx)}
                    onClose={() => setShowChapterSelector(false)}
                />
            )}
          </AnimatePresence>

          {/* SCRUB PREVIEW TOOLTIP */}
          <AnimatePresence>
            {isScrubbing && !showChapterSelector && (
                <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: -16, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none z-50"
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
                </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN FLOATING DECK */}
          <div 
            className="w-full backdrop-blur-2xl rounded-[36px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden"
            style={{
                backgroundColor: theme.dimmer,
                borderColor: theme.borderColor
            }}
          >
              {/* 0. INFO ROW (Smart Trigger) */}
              <button 
                onClick={() => {
                    RSVPHapticEngine.impactLight();
                    setShowChapterSelector(p => !p);
                }}
                className="w-full flex justify-between items-center px-8 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider select-none hover:opacity-100 transition-opacity active:scale-[0.99]" 
                style={{ 
                    color: theme.primaryText,
                    opacity: showChapterSelector ? 1.0 : 0.6
                }}
              >
                 <div className="flex items-center gap-2 truncate max-w-[65%]">
                     {showChapterSelector ? <ChevronUp size={12} /> : <ListMusic size={12} />}
                     <span className="truncate">{getCurrentChapterTitle(currentProgress)}</span>
                 </div>
                 <span className="lowercase tabular-nums">{getEstTime(currentProgress)}</span>
              </button>

              {/* 1. TIMELINE GROOVE (Full Width) */}
              <div 
                 className="relative h-5 w-full cursor-pointer group touch-none z-20"
                 onPointerDown={handlePointerDown}
                 onPointerMove={handlePointerMove}
                 onPointerUp={handlePointerUp}
                 onPointerCancel={handlePointerUp}
              >
                  <div ref={trackRef} className="w-full h-full relative flex items-center px-6">
                      {/* Groove Track */}
                      <div 
                        className="w-full h-[3px] rounded-full overflow-hidden relative"
                        style={{ backgroundColor: theme.primaryText + '15' }}
                      >
                          {/* Progress Fill */}
                          <div 
                            ref={progressBarRef}
                            className="absolute top-0 left-0 bottom-0 h-full will-change-transform rounded-full"
                            style={{ width: '0%', backgroundColor: activeColor }}
                          />
                          {/* Chapter Ticks */}
                          {preciseThresholds.map((t, i) => (
                              <div 
                                key={i}
                                className="absolute top-0 bottom-0 w-[1px] bg-white/50 mix-blend-overlay"
                                style={{ left: `${t * 100}%` }}
                              />
                          ))}
                      </div>

                      {/* Knob */}
                      <div 
                        ref={knobRef}
                        className={`absolute top-1/2 w-3.5 h-3.5 -mt-[1.75px] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.3)] border border-black/5 transition-transform duration-75 will-change-transform ${
                            isScrubbing ? 'scale-125' : 'scale-0 group-hover:scale-100'
                        }`}
                        style={{ 
                            left: '0%', 
                            backgroundColor: theme.surface 
                        }}
                      />
                  </div>
              </div>

              {/* 2. CONTROL CLUSTER (Symmetrical 3-Column Grid) */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 pb-5 pt-1 gap-4">
                  {/* ... Same controls as before ... */}
                  <div className="justify-self-end w-full max-w-[140px]">
                      <div 
                        className="flex items-center h-12 rounded-full px-1 border border-white/5 bg-black/5 w-full"
                        style={{ borderColor: theme.borderColor }}
                      >
                          <button 
                            onClick={() => adjustSpeed(-25)}
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-90 transition-all"
                            style={{ color: theme.secondaryText }}
                          >
                            <Minus size={16} />
                          </button>
                          
                          <div className="flex-1 text-center border-l border-r border-black/5 h-4 flex items-center justify-center overflow-hidden">
                            <span className="font-variant-numeric tabular-nums text-sm font-bold tracking-tight" style={{ color: theme.primaryText }}>
                                {settings.rsvpSpeed}
                            </span>
                          </div>

                          <button 
                            onClick={() => adjustSpeed(25)}
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-90 transition-all"
                            style={{ color: theme.secondaryText }}
                          >
                            <Plus size={16} />
                          </button>
                      </div>
                  </div>

                  <motion.button
                     onPointerDown={handleMainAction}
                     whileTap={{ scale: 0.95 }}
                     className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg relative text-white border-2 border-transparent hover:border-white/20 transition-all"
                     style={{ 
                         backgroundColor: activeColor,
                         boxShadow: `0 8px 30px -8px ${activeColor}66`
                     }}
                  >
                      {isRSVPActive ? (
                          <Pause size={28} className="fill-current" />
                      ) : (
                          <Play size={28} className="fill-current ml-1" />
                      )}
                  </motion.button>

                  <div className="justify-self-start w-full max-w-[140px]">
                      <div 
                        className="flex items-center h-12 rounded-full px-1 border border-white/5 bg-black/5 w-full justify-center cursor-pointer active:scale-95 transition-transform"
                        style={{ borderColor: theme.borderColor }}
                        onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
                      >
                         <Type size={20} style={{ color: theme.secondaryText }} />
                         <span className="ml-2 text-sm font-bold lowercase" style={{ color: theme.primaryText }}>Aa</span>
                      </div>
                  </div>
              </div>
          </div>
    </div>
  );
}