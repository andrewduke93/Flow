
import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPStageView } from './RSVPStageView'; 
import { RSVPWordScrubber } from './RSVPWordScrubber';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { ChevronLeft, Rewind } from 'lucide-react';
import { MediaCommandCenter } from './MediaCommandCenter';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { SettingsSheet } from './SettingsSheet';

interface ReaderContainerProps {
  book: Book;
  onClose: (bookId: string, lastTokenIndex: number, progress: number) => void;
}

/**
 * ReaderContainer (The God Layer)
 * Identity: Systems Hacker.
 * Mission: Orchestrate Z-Index layering and Input Pass-through.
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const engine = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isRSVP, setIsRSVP] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [closingSettings, setClosingSettings] = useState(false);

  const isHandlingPopState = useRef(false);

  // Rewind Gesture State - Simplified
  const [isRewinding, setIsRewinding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0-1 for visual
  const rewindInterval = useRef<number | null>(null);
  const holdAnimationRef = useRef<number | null>(null);
  const holdStartTime = useRef<number>(0);
  const pointerStart = useRef({ x: 0, y: 0 });
  const wasPlayingRef = useRef(false);
  const isHolding = useRef(false);
  const isRewindingRef = useRef(false); // Ref mirror for gesture handlers

  // Guard against rapid toggling
  const isTransitioningRef = useRef(false);

  // Sync Logic
  useEffect(() => {
    setIsRSVP(engine.isRSVPMode);
    
    const sync = () => {
        setIsRSVP(engine.isRSVPMode);
        setIsPlaying(conductor.state === RSVPState.PLAYING);
        setCurrentProgress(engine.currentProgress);
    };

    const unsubEngine = engine.subscribe(sync);
    const unsubConductor = conductor.subscribe(sync);
    
    sync();
    return () => { unsubEngine(); unsubConductor(); };
  }, []);

  // Cleanup
  useEffect(() => {
      return () => {
          // Force save on unmount only if we were in RSVP mode.
          // Otherwise, rely on engine.currentBook state.
          conductor.shutdown(engine.isRSVPMode);
          engine.isRSVPMode = false;
          heartbeat.clear();
      };
  }, []);

  // Cleanup gesture state on unmount
  useEffect(() => {
      return () => {
          if (holdAnimationRef.current) cancelAnimationFrame(holdAnimationRef.current);
          if (rewindInterval.current) clearInterval(rewindInterval.current);
      };
  }, []);

  // Browser back button handling
  useEffect(() => {
    const handlePopState = () => {
      if (isHandlingPopState.current) return;
      isHandlingPopState.current = true;
      
      if (showSettings || closingSettings) {
        handleCloseSettings();
      } else if (isRSVP) {
        // Exit RSVP mode on back button - save position first
        const engine = TitanCore.getInstance();
        const conductor = RSVPConductor.getInstance();
        if (engine.isRSVPMode) {
          conductor.pause();
          conductor.shutdown(true);
          engine.isRSVPMode = false;
          engine.notify();
          setIsRSVP(false);
          setIsChromeVisible(true);
        }
      }
      
      isHandlingPopState.current = false;
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSettings, closingSettings, isRSVP]);

  // Auto-Hide Chrome
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isChromeVisible && isRSVP) {
      timeout = setTimeout(() => setIsChromeVisible(false), 2500);
    }
    return () => clearTimeout(timeout);
  }, [isChromeVisible, isRSVP]);

  // PAUSE ON SETTINGS OPEN
  useEffect(() => {
      if (showSettings && conductor.state === RSVPState.PLAYING) {
          conductor.pause();
      }
  }, [showSettings]);

  // Close Settings with animation
  const handleCloseSettings = () => {
      setClosingSettings(true);
      setTimeout(() => {
          setShowSettings(false);
          setClosingSettings(false);
      }, 400);
  };

  const handleExit = () => {
    let finalIndex = engine.currentBook?.lastTokenIndex ?? (book.lastTokenIndex || 0);
    
    if (engine.isRSVPMode) {
        finalIndex = heartbeat.currentIndex;
        engine.saveProgress(finalIndex);
    }

    const finalProgress = engine.currentProgress;
    
    // Only save conductor state if we were actually in RSVP mode.
    // Otherwise conductor state might be stale (e.g. at 0 from init) while core has correct scroll position.
    conductor.shutdown(engine.isRSVPMode);
    
    engine.isRSVPMode = false;
    
    onClose(book.id, finalIndex, finalProgress);
  };

  /**
   * Unified Toggle Logic (Optimized for Speed)
   */
  const handleModeToggle = async (shouldBeRSVP?: boolean, startOffset?: number, tokenIndex?: number) => {
    if (isTransitioningRef.current) return;
    
    // If we are ALREADY in RSVP mode and someone triggers a toggle without specific indices,
    // they probably just want to play/pause the conductor.
    if (isRSVP && shouldBeRSVP === undefined && startOffset === undefined && tokenIndex === undefined) {
        if (conductor.state === RSVPState.PLAYING) {
            conductor.pause();
        } else {
            conductor.play();
        }
        return;
    }

    const nextState = shouldBeRSVP ?? !engine.isRSVPMode;
    if (nextState === engine.isRSVPMode && startOffset === undefined && tokenIndex === undefined) return;

    isTransitioningRef.current = true;

    try {
        if (nextState) {
          // ENTERING RSVP (PLAY)
          const fullText = engine.contentStorage.string;
          
          const prepareConfig = {
              offset: startOffset ?? engine.userSelectionOffset ?? undefined,
              index: tokenIndex ?? (startOffset === undefined ? (engine.currentBook?.lastTokenIndex ?? undefined) : undefined),
              progress: startOffset === undefined && tokenIndex === undefined ? engine.currentProgress : undefined
          };

          // Prepare engine (Now Instant due to Interface optimization)
          await conductor.prepare(fullText, prepareConfig);
          
          engine.isRSVPMode = true;
          engine.notify();
          
          // Push history state for back button support
          if (!isHandlingPopState.current) {
            window.history.pushState({ rsvpMode: true }, '', window.location.href);
          }
          
          conductor.play();
          setIsChromeVisible(false);
        } else {
          // EXITING RSVP (PAUSE)
          conductor.pause();
          
          const currentTokenIndex = heartbeat.currentIndex;
          
          engine.isRSVPMode = false;
          // Sync core progress immediately so the reader view doesn't jump
          engine.saveProgress(currentTokenIndex, true); // Mark as user action
          
          // Force jump listeners to fire for scroll sync
          if (engine.totalTokens > 0) {
              const pct = currentTokenIndex / engine.totalTokens;
              // Trigger jump listeners directly to ensure scroll view syncs
              engine.jump(pct);
          }
          
          setIsChromeVisible(true);
      }
    } catch (e) {
        console.error("Toggle failed", e);
        engine.isRSVPMode = false;
        engine.notify();
    } finally {
        isTransitioningRef.current = false;
    }
  };

  // MARK: - Gesture Handling (Tap/Hold/Rewind) - Disambiguated

  const TAP_THRESHOLD = 150; // ms - anything shorter is a tap
  const HOLD_DURATION = 400; // ms to trigger rewind (slightly longer for safety)
  const DRAG_THRESHOLD = 15; // px movement to cancel gesture

  // Cleanup helper
  const cleanupGesture = () => {
      isHolding.current = false;
      if (holdAnimationRef.current) {
          cancelAnimationFrame(holdAnimationRef.current);
          holdAnimationRef.current = null;
      }
      if (rewindInterval.current) {
          clearInterval(rewindInterval.current);
          rewindInterval.current = null;
      }
  };

  // Animate progress (both up and down)
  const animateHoldProgress = (targetProgress: number, onComplete?: () => void) => {
      if (holdAnimationRef.current) {
          cancelAnimationFrame(holdAnimationRef.current);
      }
      
      const animate = () => {
          setHoldProgress(current => {
              const diff = targetProgress - current;
              const step = diff * 0.25; // Smooth easing
              const next = Math.abs(diff) < 0.01 ? targetProgress : current + step;
              
              if (Math.abs(next - targetProgress) < 0.01) {
                  if (onComplete) onComplete();
                  return targetProgress;
              }
              
              holdAnimationRef.current = requestAnimationFrame(animate);
              return next;
          });
      };
      
      holdAnimationRef.current = requestAnimationFrame(animate);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      if (!isRSVP) return;
      
      // Capture state
      pointerStart.current = { x: e.clientX, y: e.clientY };
      wasPlayingRef.current = conductor.state === RSVPState.PLAYING;
      isHolding.current = true;
      holdStartTime.current = Date.now();
      
      // Start progress animation loop (only after tap threshold)
      const updateProgress = () => {
          if (!isHolding.current) return;
          
          const elapsed = Date.now() - holdStartTime.current;
          
          // Don't show progress ring during tap window
          if (elapsed < TAP_THRESHOLD) {
              holdAnimationRef.current = requestAnimationFrame(updateProgress);
              return;
          }
          
          // Progress starts after tap threshold
          const holdElapsed = elapsed - TAP_THRESHOLD;
          const progress = Math.min(1, holdElapsed / (HOLD_DURATION - TAP_THRESHOLD));
          setHoldProgress(progress);
          
          if (progress >= 1 && !isRewindingRef.current) {
              // Trigger rewind
              isRewindingRef.current = true;
              setIsRewinding(true);
              setHoldProgress(0); // Clear the ring
              
              // Pause if playing
              if (conductor.state === RSVPState.PLAYING) {
                  conductor.pause(true);
              }
              
              // Start rewinding
              rewindInterval.current = window.setInterval(() => {
                  conductor.seekRelative(-1);
                  if (navigator.vibrate) navigator.vibrate(1);
              }, 60);
              
              if (navigator.vibrate) navigator.vibrate(15);
          } else if (progress < 1) {
              holdAnimationRef.current = requestAnimationFrame(updateProgress);
          }
      };
      
      holdAnimationRef.current = requestAnimationFrame(updateProgress);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isHolding.current || isRewindingRef.current) return;
      
      // Cancel if dragged too far (prevents accidental activation while scrolling)
      const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
      if (dist > DRAG_THRESHOLD) {
          cleanupGesture();
          animateHoldProgress(0); // Smoothly animate back to 0
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (!isRSVP) return;
      
      const wasRewinding = isRewindingRef.current;
      const elapsed = Date.now() - holdStartTime.current;
      const wasDragging = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > DRAG_THRESHOLD;
      
      // Stop everything
      cleanupGesture();
      
      if (wasRewinding) {
          // End rewind state
          isRewindingRef.current = false;
          setIsRewinding(false);
          
          // Resume if was playing before
          if (wasPlayingRef.current && engine.isRSVPMode) {
              setTimeout(() => conductor.play(), 200);
          }
          return;
      }
      
      // Animate progress back to 0 smoothly
      animateHoldProgress(0);
      
      // TAP BEHAVIOR:
      // - If PLAYING: Pause
      // - If PAUSED: Exit RSVP and return to scroll view (position already synced)
      if (!wasDragging && elapsed < TAP_THRESHOLD) {
          if (conductor.state === RSVPState.PLAYING) {
              conductor.pause();
          } else {
              // Exit to scroll view - position is already synced via conductor
              handleModeToggle(false);
          }
          return;
      }
      
      // ABORTED HOLD: Released after tap threshold but before rewind triggered
      // Just do nothing - the ring animates back to 0
  };

  const handlePointerCancel = () => {
      cleanupGesture();
      isRewindingRef.current = false;
      setIsRewinding(false);
      animateHoldProgress(0);
  };

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0 animate-fadeIn"
      style={{ 
          backgroundColor: theme.background 
      }}
    >
      {/* LAYER 0 (Z-10): TEXT ENGINE */}
      <div 
        className="absolute inset-0 z-10 w-full h-full will-change-transform transition-opacity duration-300"
        style={{ 
          // When RSVP is playing: completely hidden
          // When RSVP is paused: visible at 40% for reference
          // When not in RSVP: full visibility
          opacity: isRSVP ? (isPlaying ? 0 : 0.4) : 1.0,
          pointerEvents: isRSVP ? 'none' : 'auto'
        }}
      >
          <TitanReaderView 
            book={book} 
            onToggleChrome={() => setIsChromeVisible(p => !p)} 
            onRequestRSVP={(offset, index) => handleModeToggle(true, offset, index)}
            isActive={!isRSVP || !isPlaying} 
          />
      </div>

      {/* LAYER 1 (Z-20): RSVP STAGE (The Lens) & GESTURE LAYER */}
      <div 
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-all duration-300 will-change-[transform,opacity] ${
            isRSVP ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
            pointerEvents: isRSVP ? 'auto' : 'none',
            transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
      >
         <RSVPStageView 
             onToggleHUD={() => {}} 
             onExit={() => handleModeToggle(false)}
             onOpenSettings={() => setShowSettings(true)} 
         />
         
         {/* WORD SCRUBBER - Shows when paused, allows tap/drag word selection */}
         <RSVPWordScrubber 
           onWordSelect={(index) => {
             // Word selected via tap - could auto-play or just highlight
             console.log('[WordScrubber] Selected word:', index);
           }}
           onScrubStart={() => {
             // User started scrubbing - pause if needed
             if (conductor.state === RSVPState.PLAYING) {
               conductor.pause(true);
             }
           }}
           onScrubEnd={(finalIndex) => {
             // User finished scrubbing
             console.log('[WordScrubber] Scrub ended at:', finalIndex);
           }}
         />
         
      {/* LAYER 4 (Z-100): GLOBAL OVERLAYS (HUDs, Notifications) */}
      <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden font-sans">
         {/* HOLD PROGRESS INDICATOR - Simple expanding ring */}
         {isRSVP && holdProgress > 0 && !isRewinding && (
             <div className="absolute inset-0 flex items-center justify-center">
                 <div 
                     className="rounded-full border-2 flex items-center justify-center"
                     style={{ 
                         width: 48 + (holdProgress * 16),
                         height: 48 + (holdProgress * 16),
                         borderColor: theme.accent,
                         opacity: 0.3 + (holdProgress * 0.5),
                         transition: 'opacity 0.1s ease-out'
                     }}
                 >
                     <Rewind 
                         size={16} 
                         style={{ 
                             color: theme.accent,
                             opacity: holdProgress,
                             transform: `scale(${0.8 + holdProgress * 0.2})`
                         }} 
                     />
                 </div>
             </div>
         )}

         {/* REWIND ACTIVE HUD - Minimal pill at top */}
         {isRewinding && (
             <div
                 className="absolute top-10 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-3 py-1.5 rounded-full shadow-lg"
                 style={{ 
                     backgroundColor: `${theme.surface}dd`,
                     backdropFilter: 'blur(16px)',
                     WebkitBackdropFilter: 'blur(16px)',
                     animation: 'fadeSlideIn 0.2s ease-out'
                 }}
             >
                 <Rewind size={14} style={{ color: theme.accent }} fill="currentColor" />
                 <span className="text-xs font-medium tracking-wide" style={{ color: theme.secondaryText }}>
                     rewinding
                 </span>
             </div>
         )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeSlideIn { 
            from { opacity: 0; transform: translate(-50%, -8px); } 
            to { opacity: 1; transform: translate(-50%, 0); } 
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
      </div>

      {/* LAYER 2 (Z-50): UI DOCK (Absolute Bottom Injection) */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 w-[90%] max-w-[450px] z-50 pointer-events-auto"
        style={{
            bottom: 'calc(2rem + env(safe-area-inset-bottom))'
        }}
      >
         <MediaCommandCenter 
            book={book} 
            onToggleRSVP={(startOffset) => handleModeToggle(undefined, startOffset)}
            isRSVPActive={isRSVP} 
              onSettingsClick={() => {
                if (!isHandlingPopState.current) {
                  window.history.pushState({ modal: 'settings' }, '', window.location.href);
                }
                setShowSettings(true);
              }}
         />
      </div>

      {/* LAYER 3 (Z-60): TOP CHROME */}
      <div 
        className={`absolute top-0 left-0 right-0 z-[60] transition-transform duration-400 pointer-events-none ${
          isChromeVisible && !isRSVP ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'}}
      >
        <div 
            className="backdrop-blur-2xl border-b pt-safe-top py-4 px-5 flex items-center justify-between pointer-events-auto"
            style={{ 
                backgroundColor: theme.dimmer,
                borderColor: theme.borderColor
            }}
        >
          <button 
            onClick={handleExit} 
            className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </div>

      {/* SETTINGS OVERLAY */}
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

    </div>
  );
}
