import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPStageView } from './RSVPStageView'; 
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { ChevronLeft } from 'lucide-react';
import { RSVPContextBackground } from './RSVPContextBackground'; 
import { MediaCommandCenter } from './MediaCommandCenter';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showSettings, setShowSettings] = useState(false);

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

      {/* LAYER 1 (Z-20): RSVP STAGE (The Lens) */}
      <div 
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-opacity duration-200 ${
            isRSVP ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
            pointerEvents: isRSVP ? 'auto' : 'none'
        }}
        onClick={() => {
            // TAP TO PAUSE/EXIT
            if (isRSVP) handleModeToggle(false);
        }}
      >
         <RSVPStageView 
             onToggleHUD={() => {}} 
             onExit={() => handleModeToggle(false)}
             onOpenSettings={() => setShowSettings(true)} 
         />
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