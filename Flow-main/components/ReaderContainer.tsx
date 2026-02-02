import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { FlowReader } from './FlowReader';
import { TitanCore } from '../services/titanCore';
import { TitanReadStream } from '../services/titanReadStream';
import { ChevronLeft } from 'lucide-react';
import { MediaCommandCenter } from './MediaCommandCenter';
import { useTitanTheme } from '../services/titanTheme';
import { SettingsSheet } from './SettingsSheet';

interface ReaderContainerProps {
  book: Book;
  onClose: (bookId: string, lastTokenIndex: number, progress: number) => void;
}

/**
 * ReaderContainer - Unified Reading Orchestrator
 * 
 * The secret: There's only ONE reader (FlowReader).
 * Scroll and RSVP are the same thing, just different presentations.
 * TitanReadStream manages the unified position.
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const core = TitanCore.getInstance();
  const stream = TitanReadStream.getInstance();
  const theme = useTitanTheme();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isRSVP, setIsRSVP] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [closingSettings, setClosingSettings] = useState(false);

  const isHandlingPopState = useRef(false);

  // Sync with stream
  useEffect(() => {
    const sync = () => {
      const rsvpActive = stream.mode === 'rsvp';
      const playing = stream.isPlaying;
      
      setIsRSVP(rsvpActive);
      setIsPlaying(playing);
      
      // Sync core state for backward compatibility
      core.isRSVPMode = rsvpActive;
    };

    sync();
    const unsub = stream.subscribe(sync);
    return () => unsub();
  }, []);

  // Save progress on stream position change
  useEffect(() => {
    const unsub = stream.onPositionChange((pos) => {
      core.saveProgress(pos.tokenIndex);
    });
    return () => unsub();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stream.pause();
      if (stream.mode === 'rsvp') {
        core.saveProgress(stream.currentIndex);
      }
      stream.setMode('scroll');
      stream.clear();
    };
  }, []);

  // Browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (isHandlingPopState.current) return;
      isHandlingPopState.current = true;
      
      if (showSettings || closingSettings) {
        handleCloseSettings();
      } else if (isRSVP) {
        stream.pause();
        stream.setMode('scroll');
        setIsChromeVisible(true);
      }
      
      isHandlingPopState.current = false;
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSettings, closingSettings, isRSVP]);

  // Auto-hide chrome in RSVP
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isChromeVisible && isRSVP && isPlaying) {
      timeout = setTimeout(() => setIsChromeVisible(false), 2500);
    }
    return () => clearTimeout(timeout);
  }, [isChromeVisible, isRSVP, isPlaying]);

  // Pause on settings open
  useEffect(() => {
    if (showSettings && stream.isPlaying) {
      stream.pause();
    }
  }, [showSettings]);

  // Close settings with animation
  const handleCloseSettings = useCallback(() => {
    setClosingSettings(true);
    setTimeout(() => {
      setShowSettings(false);
      setClosingSettings(false);
    }, 400);
  }, []);

  // Exit reader
  const handleExit = useCallback(() => {
    const finalIndex = stream.currentIndex;
    const finalProgress = stream.progress;
    
    stream.pause();
    core.saveProgress(finalIndex);
    stream.setMode('scroll');
    
    onClose(book.id, finalIndex, finalProgress);
  }, [book.id, onClose]);

  // Toggle RSVP mode
  const handleToggleRSVP = useCallback(() => {
    if (isRSVP) {
      // Toggle play/pause
      stream.toggle();
    } else {
      // Enter RSVP and play
      stream.setMode('rsvp');
      if (!isHandlingPopState.current) {
        window.history.pushState({ rsvpMode: true }, '', window.location.href);
      }
      stream.play();
      setIsChromeVisible(false);
    }
  }, [isRSVP]);

  // Request play from word click
  const handleRequestPlay = useCallback((tokenIndex: number) => {
    stream.seek({ tokenIndex });
    stream.setMode('rsvp');
    if (!isHandlingPopState.current) {
      window.history.pushState({ rsvpMode: true }, '', window.location.href);
    }
    stream.play();
    setIsChromeVisible(false);
  }, []);

  // Settings
  const handleSettingsClick = useCallback(() => {
    if (!isHandlingPopState.current) {
      window.history.pushState({ modal: 'settings' }, '', window.location.href);
    }
    setShowSettings(true);
  }, []);

  // Toggle chrome visibility
  const handleToggleChrome = useCallback(() => {
    setIsChromeVisible(p => !p);
  }, []);

  // Exit RSVP mode
  const handleExitRSVP = useCallback(() => {
    stream.pause();
    stream.setMode('scroll');
    setIsChromeVisible(true);
  }, []);

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0 animate-fadeIn"
      style={{ backgroundColor: theme.background }}
    >
      {/* UNIFIED READER - Both scroll and RSVP in one */}
      <div className="absolute inset-0 z-10">
        <FlowReader 
          book={book}
          onToggleChrome={handleToggleChrome}
          onRequestPlay={handleRequestPlay}
          isRSVPActive={isRSVP}
        />
      </div>

      {/* CONTROL DOCK */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 w-[90%] max-w-[450px] z-50 pointer-events-auto"
        style={{ bottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <MediaCommandCenter 
          book={book}
          onToggleRSVP={handleToggleRSVP}
          isRSVPActive={isRSVP}
          onSettingsClick={handleSettingsClick}
        />
      </div>

      {/* TOP CHROME */}
      <div 
        className={`absolute top-0 left-0 right-0 z-[60] transition-transform duration-400 pointer-events-none ${
          (isChromeVisible || (isRSVP && !isPlaying)) ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div 
          className="backdrop-blur-2xl border-b pt-safe-top py-4 px-5 flex items-center justify-between pointer-events-auto"
          style={{ backgroundColor: theme.dimmer, borderColor: theme.borderColor }}
        >
          <button 
            onClick={isRSVP ? handleExitRSVP : handleExit}
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

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}
