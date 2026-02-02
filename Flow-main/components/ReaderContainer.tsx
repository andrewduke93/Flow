import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { TitanReaderView } from './TitanReaderView';
import { RSVPTeleprompter } from './RSVPTeleprompter';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { ChevronLeft } from 'lucide-react';
import { MediaCommandCenter } from './MediaCommandCenter';
import { useTitanTheme } from '../services/titanTheme';
import { SettingsSheet } from './SettingsSheet';

interface ReaderContainerProps {
  book: Book;
  onClose: (bookId: string, lastTokenIndex: number, progress: number) => void;
}

/**
 * ReaderContainer - Original Working Version
 * Uses TitanReaderView for scrolling and RSVPTeleprompter for speed reading.
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isRSVP, setIsRSVP] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [closingSettings, setClosingSettings] = useState(false);

  const isHandlingPopState = useRef(false);

  // Sync with conductor/heartbeat
  useEffect(() => {
    const syncState = () => {
      setIsRSVP(core.isRSVPMode);
      setIsPlaying(heartbeat.isPlaying);
    };

    syncState();
    const unsubCore = core.subscribe(syncState);
    const unsubHeartbeat = heartbeat.subscribe(syncState);
    
    return () => {
      unsubCore();
      unsubHeartbeat();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      heartbeat.stop();
      if (core.isRSVPMode) {
        core.saveProgress(conductor.currentTokenIndex);
      }
      core.isRSVPMode = false;
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
        heartbeat.stop();
        core.isRSVPMode = false;
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
    if (showSettings && heartbeat.isPlaying) {
      heartbeat.stop();
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
    const finalIndex = conductor.currentTokenIndex;
    const finalProgress = core.currentProgress;
    
    heartbeat.stop();
    core.saveProgress(finalIndex);
    core.isRSVPMode = false;
    
    onClose(book.id, finalIndex, finalProgress);
  }, [book.id, onClose]);

  // Toggle RSVP mode
  const handleToggleRSVP = useCallback(() => {
    if (isRSVP) {
      // Toggle play/pause
      if (heartbeat.isPlaying) {
        heartbeat.stop();
      } else {
        heartbeat.start();
      }
    } else {
      // Enter RSVP and play
      core.isRSVPMode = true;
      if (!isHandlingPopState.current) {
        window.history.pushState({ rsvpMode: true }, '', window.location.href);
      }
      heartbeat.start();
      setIsChromeVisible(false);
    }
  }, [isRSVP]);

  // Request RSVP from word click in reader
  const handleRequestRSVP = useCallback((startOffset: number, tokenIndex: number) => {
    conductor.seekToToken(tokenIndex);
    core.isRSVPMode = true;
    if (!isHandlingPopState.current) {
      window.history.pushState({ rsvpMode: true }, '', window.location.href);
    }
    heartbeat.start();
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
    heartbeat.stop();
    core.isRSVPMode = false;
    setIsChromeVisible(true);
  }, []);

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden m-0 p-0 animate-fadeIn"
      style={{ backgroundColor: theme.background }}
    >
      {/* SCROLL READER */}
      <div 
        className="absolute inset-0 z-10 transition-opacity duration-300"
        style={{ 
          opacity: isRSVP ? (isPlaying ? 0 : 0.4) : 1,
          pointerEvents: isRSVP ? 'none' : 'auto'
        }}
      >
        <TitanReaderView 
          book={book}
          onToggleChrome={handleToggleChrome}
          onRequestRSVP={handleRequestRSVP}
          isActive={!isRSVP}
        />
      </div>

      {/* RSVP OVERLAY */}
      {isRSVP && (
        <div 
          className="absolute inset-0 z-20"
          onClick={handleToggleChrome}
        >
          <RSVPTeleprompter onTap={() => {
            if (heartbeat.isPlaying) {
              heartbeat.stop();
            } else {
              heartbeat.start();
            }
          }} />
        </div>
      )}

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
