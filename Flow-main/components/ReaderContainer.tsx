
import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPTeleprompter } from './RSVPTeleprompter'; 
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { newRsvpEngine } from '../services/newRsvpEngine';
import { ChevronLeft } from 'lucide-react';
import { MediaCommandCenter } from './MediaCommandCenter';
import { useTitanTheme } from '../services/titanTheme';
import { TitanSettingsService } from '../services/configService';
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
  const settings = TitanSettingsService.getInstance().getSettings();
  const theme = useTitanTheme();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isRSVP, setIsRSVP] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [engineIndex, setEngineIndex] = useState(0);
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
    const unsubNew = newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
      setIsPlaying(isPlaying);
      if (typeof index === 'number') setEngineIndex(index);
      // Compute percentage and jump scroll view to match RSVP position
      const total = Math.max(1, engine.totalTokens);
      const pct = Math.min(1, Math.max(0, index / total));
      try {
        engine.jump(pct);
      } catch (e) {
        // Best effort; ignore if engine.jump not available
      }
    });

    sync();
    return () => { unsubEngine(); unsubConductor(); unsubNew(); };
  }, []);

  // Cleanup
  useEffect(() => {
      return () => {
          // Force save on unmount only if we were in RSVP mode.
          // Otherwise, rely on engine.currentBook state.
            conductor.shutdown(engine.isRSVPMode);
              engine.isRSVPMode = false;
              try { newRsvpEngine.pause(); } catch (e) {}
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
        newRsvpEngine.pause();
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
      finalIndex = engineIndex;
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
            conductor.pause(true); // Skip context rewind for UI-triggered pause
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

          // Prepare engine (new worker-based engine)
          try {
            await newRsvpEngine.prepare(fullText, settings.rsvpSpeed ?? 350, settings.rsvpChunkSize ?? 1);
          } catch (e) {
            // Fallback to legacy conductor if new engine fails
            await conductor.prepare(fullText, prepareConfig as any);
          }
          
          engine.isRSVPMode = true;
          engine.notify();
          
          // Push history state for back button support
          if (!isHandlingPopState.current) {
            window.history.pushState({ rsvpMode: true }, '', window.location.href);
          }
          
          // Start playback (prefer new engine)
          try { newRsvpEngine.play(); } catch (e) { conductor.play(); }
          setIsChromeVisible(false);
        } else {
          // EXITING RSVP (PAUSE)
          // Pause both engines to ensure state is stable
          try { newRsvpEngine.pause(); } catch (e) {}
          conductor.pause();
          
          const currentTokenIndex = engineIndex;
          
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

  // Handle tap from teleprompter - toggle play/pause
  const handleTeleprompterTap = () => {
    if (conductor.state === RSVPState.PLAYING) {
      conductor.pause(true); // Skip context rewind for quick tap-pause
    } else {
      conductor.play();
    }
  };

  // Handle long press exit from RSVP - exit to scroll view with word highlighted
  const handleLongPressExit = () => {
    if (!isRSVP) return;
    
    // Exit RSVP mode and scroll to current word
    handleModeToggle(false);
  };

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0 animate-fadeIn"
      style={{ 
          backgroundColor: theme.background 
      }}
    >
      {/* LAYER 0 (Z-10): TEXT ENGINE */}
      {/* When RSVP active: visible at 40% when paused, 0% when playing */}
      <div 
        className="absolute inset-0 z-10 w-full h-full will-change-transform transition-opacity duration-300"
        style={{ 
          opacity: isRSVP ? (isPlaying ? 0 : 0.4) : 1.0,
          pointerEvents: isRSVP ? 'none' : 'auto'
        }}
      >
          <TitanReaderView 
            book={book} 
            onToggleChrome={() => setIsChromeVisible(p => !p)} 
            onRequestRSVP={(offset, index) => handleModeToggle(true, offset, index)}
            isActive={!isRSVP} 
          />
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
             onLongPressExit={handleLongPressExit}
             onRewindStateChange={setIsRewinding}
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
            isRewinding={isRewinding}
            onSettingsClick={() => {
              if (!isHandlingPopState.current) {
                window.history.pushState({ modal: 'settings' }, '', window.location.href);
              }
              setShowSettings(true);
            }}
         />
      </div>

      {/* LAYER 3 (Z-60): TOP CHROME - Shows in scroll view AND RSVP (when paused or chrome visible) */}
      <div 
        className={`absolute top-0 left-0 right-0 z-[60] transition-transform duration-400 pointer-events-none ${
          (isChromeVisible || (isRSVP && !isPlaying)) ? 'translate-y-0' : '-translate-y-full'
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
            onClick={isRSVP ? handleLongPressExit : handleExit} 
            className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
          >
            <ChevronLeft size={20} />
          </button>
          {isRSVP && (
            <span className="text-xs font-medium" style={{ color: theme.secondaryText }}>
              Tap to exit RSVP
            </span>
          )}
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
