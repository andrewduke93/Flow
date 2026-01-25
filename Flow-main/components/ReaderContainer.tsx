
import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPTeleprompter } from './RSVPTeleprompter'; 
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { ChevronLeft } from 'lucide-react';
import { MediaCommandCenter } from './MediaCommandCenter';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { SettingsSheet } from './SettingsSheet';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

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

  // MARK: - Gesture Handling moved to RSVPTeleprompter (unified tap/hold/swipe)

  // Handle tap from teleprompter - toggle play/pause or exit RSVP
  const handleTeleprompterTap = () => {
    if (conductor.state === RSVPState.PLAYING) {
      conductor.pause();
    } else {
      // When paused and tapped, exit to scroll view
      handleModeToggle(false);
    }
  };

  // State for scroll view word selection (press-and-hold when RSVP paused)
  const scrollViewHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewPointerStart = useRef({ x: 0, y: 0, time: 0 });
  const [isHoldingScrollView, setIsHoldingScrollView] = useState(false);
  
  const SCROLL_HOLD_THRESHOLD = 350; // ms to trigger word selection
  const SCROLL_MOVE_THRESHOLD = 15; // px movement to cancel

  const handleScrollViewPointerDown = (e: React.PointerEvent) => {
    if (!isRSVP || isPlaying) return; // Only active when RSVP is paused
    
    scrollViewPointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    
    scrollViewHoldTimer.current = setTimeout(() => {
      setIsHoldingScrollView(true);
      RSVPHapticEngine.impactMedium();
      
      // Exit RSVP mode - the user can then interact with the scroll view
      handleModeToggle(false);
    }, SCROLL_HOLD_THRESHOLD);
  };

  const handleScrollViewPointerMove = (e: React.PointerEvent) => {
    if (!scrollViewHoldTimer.current) return;
    
    const dx = Math.abs(e.clientX - scrollViewPointerStart.current.x);
    const dy = Math.abs(e.clientY - scrollViewPointerStart.current.y);
    
    if (dx > SCROLL_MOVE_THRESHOLD || dy > SCROLL_MOVE_THRESHOLD) {
      clearTimeout(scrollViewHoldTimer.current);
      scrollViewHoldTimer.current = null;
    }
  };

  const handleScrollViewPointerUp = () => {
    if (scrollViewHoldTimer.current) {
      clearTimeout(scrollViewHoldTimer.current);
      scrollViewHoldTimer.current = null;
    }
    setIsHoldingScrollView(false);
  };

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0 animate-fadeIn"
      style={{ 
          backgroundColor: theme.background 
      }}
    >
      {/* LAYER 0 (Z-10): TEXT ENGINE */}
      {/* When RSVP paused: visible at 40%, pointer events enabled for press-and-hold word selection */}
      <div 
        className="absolute inset-0 z-10 w-full h-full will-change-transform transition-opacity duration-300"
        style={{ 
          opacity: isRSVP ? (isPlaying ? 0 : 0.4) : 1.0,
          pointerEvents: 'auto' // Always allow interactions
        }}
        onPointerDown={handleScrollViewPointerDown}
        onPointerMove={handleScrollViewPointerMove}
        onPointerUp={handleScrollViewPointerUp}
        onPointerCancel={handleScrollViewPointerUp}
        onPointerLeave={handleScrollViewPointerUp}
      >
          <TitanReaderView 
            book={book} 
            onToggleChrome={() => setIsChromeVisible(p => !p)} 
            onRequestRSVP={(offset, index) => handleModeToggle(true, offset, index)}
            isActive={!isRSVP || !isPlaying} 
          />
          
          {/* Hold indicator overlay */}
          {isHoldingScrollView && (
            <div className="absolute inset-0 bg-black/10 pointer-events-none z-50" />
          )}
      </div>

      {/* LAYER 1 (Z-20): RSVP TELEPROMPTER (Unified Focus + Cursor) */}
      <div 
        className={`absolute inset-0 z-20 transition-all duration-300 will-change-[transform,opacity] ${
            isRSVP ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
            pointerEvents: isRSVP ? 'auto' : 'none',
            transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
        }}
      >
         <RSVPTeleprompter 
             onTap={handleTeleprompterTap}
             onScrubEnd={(finalIndex) => {
               console.log('[Teleprompter] Scrub ended at:', finalIndex);
             }}
         />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
