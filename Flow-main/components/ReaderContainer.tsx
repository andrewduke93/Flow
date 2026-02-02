import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { StreamReader } from './StreamReader';
import { StreamEngine } from '../services/streamEngine';
import { ChevronLeft, Play, Pause, Settings, Minus, Plus } from 'lucide-react';
import { useTitanTheme } from '../services/titanTheme';
import { SettingsSheet } from './SettingsSheet';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { TitanStorage } from '../services/titanStorage';

interface ReaderContainerProps {
  book: Book;
  onClose: (bookId: string, lastTokenIndex: number, progress: number) => void;
}

/**
 * ReaderContainer - Unified Fast Reader
 * 
 * PHILOSOPHY: One position, one engine, one experience.
 * Scroll and RSVP are the same thing at different speeds.
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [closingSettings, setClosingSettings] = useState(false);
  const [wpm, setWpm] = useState(settings.rsvpSpeed || 300);

  const chromeTimeout = useRef<ReturnType<typeof setTimeout>>();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ============================================
  // ENGINE SYNC
  // ============================================
  useEffect(() => {
    // Set WPM from settings
    engine.wpm = settings.rsvpSpeed || 300;
    setWpm(engine.wpm);
    
    const unsubPos = engine.onPosition((pos) => {
      setProgress(engine.progress);
      
      // Debounced save
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const updatedBook = {
          ...book,
          lastTokenIndex: pos,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        };
        TitanStorage.getInstance().saveBook(updatedBook);
      }, 500);
    });
    
    const unsubPlay = engine.onPlayState((playing) => {
      setIsPlaying(playing);
      
      // Auto-hide chrome when playing
      if (playing) {
        chromeTimeout.current = setTimeout(() => setIsChromeVisible(false), 2000);
      }
    });
    
    return () => {
      unsubPos();
      unsubPlay();
      if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [book.id]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      engine.stop();
    };
  }, []);

  // Pause on settings
  useEffect(() => {
    if (showSettings && engine.isPlaying) {
      engine.stop();
    }
  }, [showSettings]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleExit = useCallback(() => {
    engine.stop();
    onClose(book.id, engine.position, engine.progress);
  }, [book.id, onClose]);

  const handlePlayPause = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    engine.toggle();
  }, []);

  const handleSpeedDown = useCallback(() => {
    RSVPHapticEngine.impactLight();
    const newWpm = Math.max(50, wpm - 50);
    engine.wpm = newWpm;
    setWpm(newWpm);
    updateSettings({ rsvpSpeed: newWpm, hasCustomSpeed: true });
  }, [wpm, updateSettings]);

  const handleSpeedUp = useCallback(() => {
    RSVPHapticEngine.impactLight();
    const newWpm = Math.min(1000, wpm + 50);
    engine.wpm = newWpm;
    setWpm(newWpm);
    updateSettings({ rsvpSpeed: newWpm, hasCustomSpeed: true });
  }, [wpm, updateSettings]);

  const handleToggleChrome = useCallback(() => {
    if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
    setIsChromeVisible(v => !v);
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    engine.progress = val;
  }, []);

  const handleSettingsClick = useCallback(() => {
    window.history.pushState({ modal: 'settings' }, '', window.location.href);
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setClosingSettings(true);
    setTimeout(() => {
      setShowSettings(false);
      setClosingSettings(false);
    }, 350);
  }, []);

  // Back button
  useEffect(() => {
    const handlePopState = () => {
      if (showSettings || closingSettings) {
        handleCloseSettings();
      } else if (isPlaying) {
        engine.stop();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSettings, closingSettings, isPlaying, handleCloseSettings]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden animate-fadeIn"
      style={{ backgroundColor: theme.background }}
    >
      {/* READER */}
      <StreamReader 
        book={book}
        onToggleChrome={handleToggleChrome}
        isActive={true}
      />

      {/* CONTROL BAR - Always visible at bottom */}
      <div 
        className={`fixed left-0 right-0 z-[60] transition-all duration-300 ${
          isChromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
        style={{ 
          bottom: 'env(safe-area-inset-bottom, 0px)',
          padding: '0 16px 16px 16px'
        }}
      >
        <div 
          className="rounded-2xl backdrop-blur-xl border shadow-2xl overflow-hidden"
          style={{ 
            backgroundColor: `${theme.dimmer}f0`,
            borderColor: theme.borderColor
          }}
        >
          {/* Progress bar */}
          <div className="px-4 pt-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progress}
              onChange={handleScrub}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ 
                background: `linear-gradient(to right, ${theme.accent} ${progress * 100}%, ${theme.borderColor} ${progress * 100}%)`
              }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-3 py-3">
            {/* Speed down */}
            <button
              onClick={handleSpeedDown}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
            >
              <Minus size={18} />
            </button>

            {/* WPM display */}
            <span 
              className="text-xs font-mono opacity-50 w-16 text-center"
              style={{ color: theme.secondaryText }}
            >
              {wpm} wpm
            </span>

            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg"
              style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
            </button>

            {/* Speed up */}
            <button
              onClick={handleSpeedUp}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
            >
              <Plus size={18} />
            </button>

            {/* Settings */}
            <button
              onClick={handleSettingsClick}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* TOP BAR */}
      <div 
        className={`fixed top-0 left-0 right-0 z-[60] transition-all duration-300 ${
          isChromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div 
          className="backdrop-blur-xl border-b pt-safe-top py-3 px-4 flex items-center justify-between"
          style={{ backgroundColor: `${theme.dimmer}f0`, borderColor: theme.borderColor }}
        >
          <button 
            onClick={handleExit}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 mx-4 truncate text-center">
            <span className="text-sm font-medium" style={{ color: theme.primaryText }}>{book.title}</span>
          </div>

          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* SETTINGS SHEET */}
      {(showSettings || closingSettings) && (
        <>
          <div 
            className="fixed inset-0 z-[100]"
            style={{ 
              backgroundColor: 'rgba(0,0,0,0.5)', 
              backdropFilter: 'blur(2px)',
              animation: closingSettings ? 'fadeOut 0.35s ease-out' : 'fadeIn 0.4s ease-out'
            }}
            onClick={handleCloseSettings}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-[28px] h-[70vh] shadow-2xl overflow-hidden"
            style={{ 
              backgroundColor: theme.background,
              animation: closingSettings ? 'slideDown 0.35s ease-in' : 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
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
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${theme.accent};
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
