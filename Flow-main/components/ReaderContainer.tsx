
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPStageView } from './RSVPStageView'; 
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { ChevronLeft, Rewind, Zap } from 'lucide-react';
import { RSVPContextBackground } from './RSVPContextBackground'; 
import { MediaCommandCenter } from './MediaCommandCenter';
import { motion, AnimatePresence } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { SettingsSheet } from './SettingsSheet';
import { TitanSettingsService } from '../services/configService';

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
  const [showSettings, setShowSettings] = useState(false);

  // Rewind Gesture State
  const [isRewinding, setIsRewinding] = useState(false);
  const rewindInterval = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const wasPlayingRef = useRef(false);

  // Speed Gesture State
  const [isSpeedAdjusting, setIsSpeedAdjusting] = useState(false);
  const speedStartData = useRef({ y: 0, val: 0 });
  
  // WPM Display for HUD (Local state for smooth updates)
  const [liveWPM, setLiveWPM] = useState(0);

  // Guard against rapid toggling
  const isTransitioningRef = useRef(false);

  // Sync Logic
  useEffect(() => {
    setIsRSVP(engine.isRSVPMode);
    
    const sync = () => {
        setIsRSVP(engine.isRSVPMode);
        setIsPlaying(conductor.state === RSVPState.PLAYING);
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
    
    const nextState = shouldBeRSVP ?? !engine.isRSVPMode;
    if (nextState === engine.isRSVPMode && startOffset === undefined && tokenIndex === undefined) return;

    isTransitioningRef.current = true;

    try {
        if (nextState) {
          // ENTERING RSVP (PLAY)
          const fullText = engine.contentStorage.string;
          
          const prepareConfig = {
              offset: startOffset ?? engine.userSelectionOffset ?? undefined,
              // PRIORITY FIX: If tokenIndex is explicit (from tap), use it. 
              // Otherwise fallback to existing index logic.
              index: tokenIndex ?? (startOffset === undefined ? (engine.currentBook?.lastTokenIndex ?? undefined) : undefined),
              progress: startOffset === undefined && tokenIndex === undefined ? engine.currentProgress : undefined
          };

          // Prepare engine (Instant if cached)
          await conductor.prepare(fullText, prepareConfig);
          
          engine.isRSVPMode = true;
          engine.notify();
          
          conductor.play();
          setIsChromeVisible(false);
        } else {
          // EXITING RSVP (PAUSE)
          conductor.pause();
          
          engine.isRSVPMode = false;
          engine.notify();
          
          setIsChromeVisible(true);
      }
    } catch (e) {
        console.error("Toggle failed", e);
        engine.isRSVPMode = false;
        engine.notify();
    } finally {
        // Fast release lock
        setTimeout(() => {
            isTransitioningRef.current = false;
        }, 50);
    }
  };

  // MARK: - Gesture Handling (Rewind & Speed)

  const handlePointerDown = (e: React.PointerEvent) => {
      if (!isRSVP) return;
      
      // Capture start point to distinguish tap vs drag
      pointerStart.current = { x: e.clientX, y: e.clientY };
      
      // Capture playing state for resume logic
      wasPlayingRef.current = conductor.state === RSVPState.PLAYING;

      const screenW = window.innerWidth;

      if (holdTimer.current) clearTimeout(holdTimer.current);

      holdTimer.current = window.setTimeout(() => {
          // ZONE 1: REWIND (Left 45%)
          if (pointerStart.current.x < screenW * 0.45) {
              setIsRewinding(true);
              conductor.pause(); 
              
              rewindInterval.current = window.setInterval(() => {
                  conductor.seekRelative(-1);
                  if (navigator.vibrate) navigator.vibrate(2); 
              }, 80); 
          }
          // ZONE 2: SPEED (Right 45% -> > 55%)
          else if (pointerStart.current.x > screenW * 0.55) {
              setIsSpeedAdjusting(true);
              setLiveWPM(heartbeat.wpm);
              // Store initial conditions
              speedStartData.current = { y: pointerStart.current.y, val: heartbeat.wpm };
              
              if (navigator.vibrate) navigator.vibrate(15); 
          }
      }, 300); // 300ms threshold for hold
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      // 1. Cancel hold if moved too much before trigger (prevent accidental trigger while scrolling)
      if (holdTimer.current && !isRewinding && !isSpeedAdjusting) {
          const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
          if (dist > 20) {
              clearTimeout(holdTimer.current);
              holdTimer.current = null;
          }
      }

      // 2. Handle Speed Drag
      if (isSpeedAdjusting) {
          e.preventDefault(); // Prevent native scroll
          e.stopPropagation();

          // Drag Up (negative Y delta) = Increase Speed
          // Drag Down (positive Y delta) = Decrease Speed
          const deltaY = speedStartData.current.y - e.clientY; 
          
          // Sensitivity: 2 WPM per pixel
          const wpmDelta = Math.round(deltaY * 2);
          const newWPM = Math.max(50, Math.min(2000, speedStartData.current.val + wpmDelta));
          
          if (newWPM !== heartbeat.wpm) {
              conductor.updateWPM(newWPM);
              setLiveWPM(newWPM);
          }
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (!isRSVP) return;

      // Clean up Hold Timer
      if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
      }

      // CLEANUP: REWIND
      if (isRewinding) {
          setIsRewinding(false);
          if (rewindInterval.current) {
              clearInterval(rewindInterval.current);
              rewindInterval.current = null;
          }
          if (wasPlayingRef.current) setTimeout(() => { if (engine.isRSVPMode) conductor.play(); }, 300);
          e.stopPropagation();
          return;
      }

      // CLEANUP: SPEED
      if (isSpeedAdjusting) {
          setIsSpeedAdjusting(false);
          // Persist the new speed setting
          TitanSettingsService.getInstance().updateSettings({ rsvpSpeed: heartbeat.wpm, hasCustomSpeed: true });
          e.stopPropagation();
          return;
      }

      // HANDLE TAP (If not hold, not drag)
      const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
      if (dist < 10) {
          handleModeToggle(false);
      }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (rewindInterval.current) clearInterval(rewindInterval.current);
      setIsRewinding(false);
      setIsSpeedAdjusting(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0"
      style={{ 
          backgroundColor: theme.background 
      }}
    >
      {/* LAYER 0 (Z-10): TEXT ENGINE */}
      <div className="absolute inset-0 z-10 w-full h-full">
          <RSVPContextBackground active={isRSVP}>
            <TitanReaderView 
              book={book} 
              onToggleChrome={() => setIsChromeVisible(p => !p)} 
              onRequestRSVP={(offset, index) => handleModeToggle(true, offset, index)}
            />
          </RSVPContextBackground>
      </div>

      {/* LAYER 1 (Z-20): RSVP STAGE (The Lens) & GESTURE LAYER */}
      <div 
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-opacity duration-200 ${
            isRSVP ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
            pointerEvents: isRSVP ? 'auto' : 'none'
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
         
         {/* AMBIENT HINTS (Subtle Indicators) */}
         <AnimatePresence>
            {isRSVP && !isRewinding && !isSpeedAdjusting && !showSettings && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.5, duration: 1.0 }}
                    className="absolute inset-0 pointer-events-none z-25"
                >
                    {/* Left Hint: Rewind Handle */}
                    <div 
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full opacity-10 shadow-sm"
                        style={{ backgroundColor: theme.primaryText }}
                    />
                    
                    {/* Right Hint: Speed Slider Track */}
                    <div 
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-1 h-20 rounded-full opacity-10 flex flex-col items-center justify-between py-1 shadow-sm"
                        style={{ backgroundColor: theme.primaryText }}
                    >
                        {/* Ticks to suggest verticality */}
                        <div className="w-2 h-[1px] rounded-full opacity-50" style={{ backgroundColor: theme.primaryText }} />
                        <div className="w-2 h-[1px] rounded-full opacity-50" style={{ backgroundColor: theme.primaryText }} />
                    </div>
                </motion.div>
            )}
         </AnimatePresence>

         {/* LEFT: REWIND VISUAL FEEDBACK */}
         <AnimatePresence>
            {isRewinding && (
                <motion.div
                    initial={{ opacity: 0, x: -30, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -30, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute left-8 top-1/2 -translate-y-1/2 p-6 rounded-full backdrop-blur-md shadow-2xl flex items-center justify-center border border-white/10"
                    style={{ backgroundColor: theme.surface }}
                >
                    <Rewind size={48} className="animate-pulse" style={{ color: theme.accent }} fill="currentColor" />
                </motion.div>
            )}
         </AnimatePresence>

         {/* RIGHT: SPEED VISUAL FEEDBACK */}
         <AnimatePresence>
            {isSpeedAdjusting && (
                <motion.div
                    initial={{ opacity: 0, x: 30, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 30, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-6 rounded-[2rem] backdrop-blur-md shadow-2xl flex flex-col items-center justify-center border border-white/10 min-w-[120px]"
                    style={{ backgroundColor: theme.surface }}
                >
                    <Zap size={32} className="mb-2" style={{ color: theme.accent }} fill="currentColor" />
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black tabular-nums" style={{ color: theme.primaryText }}>{liveWPM}</span>
                        <span className="text-xs font-bold uppercase" style={{ color: theme.secondaryText }}>wpm</span>
                    </div>
                </motion.div>
            )}
         </AnimatePresence>
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
            onSettingsClick={() => setShowSettings(true)}
         />
      </div>

      {/* LAYER 3 (Z-60): TOP CHROME */}
      <div 
        className={`absolute top-0 left-0 right-0 z-[60] transition-transform duration-200 pointer-events-none ${
          isChromeVisible && !isRSVP ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div 
            className="backdrop-blur-xl border-b pt-safe-top pb-3 px-4 flex items-center justify-between shadow-sm pointer-events-auto"
            style={{ 
                backgroundColor: theme.dimmer,
                borderColor: theme.borderColor
            }}
        >
          <button onClick={handleExit} className="p-2 -ml-2 rounded-full hover:bg-black/5 flex items-center gap-1" style={{ color: theme.primaryText }}>
            <ChevronLeft size={24} />
            <span className="font-medium lowercase">back home</span>
          </button>
        </div>
      </div>

      {/* SETTINGS OVERLAY */}
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

    </motion.div>
  );
}
