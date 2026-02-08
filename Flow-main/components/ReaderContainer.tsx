import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { FlowReader } from './FlowReader';
import { StreamEngine } from '../services/streamEngine';
import { 
  ChevronLeft, Play, Pause, RotateCcw, Sun, Moon, Sunset,
  Eye, EyeOff, Type, Minus, Plus 
} from 'lucide-react';
import { useTitanTheme, TitanThemeService } from '../services/titanTheme';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { TitanStorage } from '../services/titanStorage';

interface ReaderContainerProps {
  book: Book;
  onClose: (bookId: string, lastTokenIndex: number, progress: number) => void;
}

/**
 * ReaderContainer - Pill-style dock matching library UI
 * 
 * DESIGN: Dock is always visible unless actively reading RSVP
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  // Dock visible by default, only hidden during active RSVP playback
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wpm, setWpm] = useState(settings.rsvpSpeed || 300);
  const [showGhost, setShowGhost] = useState(settings.showGhostPreview ?? true);
  const [showFontPanel, setShowFontPanel] = useState(false);

  const chromeTimeout = useRef<ReturnType<typeof setTimeout>>();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ============================================
  // ENGINE SYNC
  // ============================================
  useEffect(() => {
    engine.wpm = settings.rsvpSpeed || 300;
    setWpm(engine.wpm);
    setShowGhost(settings.showGhostPreview ?? true);
    
    const unsubPos = engine.onPosition((pos) => {
      setProgress(engine.progress);
      
      // REDUCED DEBOUNCE: 200ms instead of 500ms for faster saves
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const updatedBook = {
          ...book,
          lastTokenIndex: pos,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        };
        // Save to IndexedDB (localStorage backup happens in TitanCore.saveProgress)
        TitanStorage.getInstance().saveBook(updatedBook);
      }, 200);
    });
    
    const unsubPlay = engine.onPlayState((playing) => {
      setIsPlaying(playing);
      // Only hide chrome after delay when playing
      if (playing) {
        chromeTimeout.current = setTimeout(() => setIsChromeVisible(false), 3000);
      } else {
        // Show chrome when paused
        setIsChromeVisible(true);
        // IMMEDIATE SAVE on pause - don't wait for debounce
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        const updatedBook = {
          ...book,
          lastTokenIndex: engine.position,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        };
        TitanStorage.getInstance().saveBook(updatedBook);
      }
    });
    
    return () => {
      unsubPos();
      unsubPlay();
      if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        // IMMEDIATE FINAL SAVE on unmount
        const updatedBook = {
          ...book,
          lastTokenIndex: engine.position,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        };
        TitanStorage.getInstance().saveBook(updatedBook);
      }
    };
  }, [book.id]);

  useEffect(() => () => engine.stop(), []);

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

  const handleRewind = useCallback(() => {
    RSVPHapticEngine.impactLight();
    engine.skipBack(50);
  }, []);

  const handleSpeedChange = useCallback((delta: number) => {
    RSVPHapticEngine.impactLight();
    const newWpm = Math.max(100, Math.min(800, wpm + delta));
    engine.wpm = newWpm;
    setWpm(newWpm);
    updateSettings({ rsvpSpeed: newWpm, hasCustomSpeed: true });
  }, [wpm, updateSettings]);

  const handleToggleGhost = useCallback(() => {
    RSVPHapticEngine.impactLight();
    const newValue = !showGhost;
    setShowGhost(newValue);
    updateSettings({ showGhostPreview: newValue });
  }, [showGhost, updateSettings]);

  const handleToggleTheme = useCallback(() => {
    RSVPHapticEngine.impactLight();
    const service = TitanThemeService.getInstance();
    const current = service.mode;
    const next = current === 'Night' ? 'Modern' : current === 'Modern' ? 'Sepia' : 'Night';
    service.setMode(next);
  }, []);

  const handleToggleChrome = useCallback(() => {
    if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
    setIsChromeVisible(v => !v);
    setShowFontPanel(false);
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    engine.progress = parseFloat(e.target.value);
  }, []);

  const handleFontSize = useCallback((delta: number) => {
    RSVPHapticEngine.impactLight();
    const newSize = Math.max(14, Math.min(32, settings.fontSize + delta));
    updateSettings({ fontSize: newSize });
  }, [settings.fontSize, updateSettings]);

  // Back button
  useEffect(() => {
    const handlePopState = () => {
      if (isPlaying) engine.stop();
      else handleExit();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPlaying, handleExit]);

  // Theme icon based on current theme
  const themeService = TitanThemeService.getInstance();
  const ThemeIcon = themeService.mode === 'Night' ? Moon : themeService.mode === 'Sepia' ? Sunset : Sun;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden"
      style={{ backgroundColor: theme.background }}
    >
      {/* READER */}
      <FlowReader 
        book={book}
        onToggleChrome={handleToggleChrome}
        isActive={true}
        showGhostWords={showGhost}
      />

      {/* ====== FLOATING PILL DOCK (matches library style) ====== */}
      <div 
        className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
        style={{ 
          bottom: 'max(20px, env(safe-area-inset-bottom))'
        }}
      >
        <div 
          className={`pointer-events-auto shadow-xl backdrop-blur-2xl border flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-out ${
            isChromeVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ 
            backgroundColor: theme.surface + 'f0', 
            borderColor: theme.borderColor,
            maxWidth: '420px',
            width: 'calc(100% - 24px)'
          }}
        >
          {/* Progress bar with soulful milestone messages */}
          <div className="px-4 pt-3 pb-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.0001"
              value={progress}
              onChange={handleScrub}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer touch-pan-x"
              style={{ 
                background: `linear-gradient(to right, ${theme.accent} ${progress * 100}%, ${theme.borderColor} ${progress * 100}%)`
              }}
            />
            <div className="flex justify-between mt-1.5 px-0.5">
              <span className="text-[10px] tabular-nums" style={{ color: theme.secondaryText, opacity: 0.6 }}>
                {progress < 0.1 ? '🌱 just starting' :
                 progress < 0.25 ? `${Math.round(progress * 100)}% 🌿` :
                 progress < 0.5 ? `${Math.round(progress * 100)}% 📖 nice pace` :
                 progress < 0.75 ? `${Math.round(progress * 100)}% ✨ halfway!` :
                 progress < 0.9 ? `${Math.round(progress * 100)}% 🔥 almost there` :
                 `${Math.round(progress * 100)}% 🎯 so close!`}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: theme.secondaryText, opacity: 0.6 }}>
                ~{Math.round((1 - progress) * engine.total / Math.max(1, wpm))}m left
              </span>
            </div>
          </div>

          {/* Main controls row */}
          <div className="flex items-center gap-1 px-1.5 pb-2">
            {/* Rewind */}
            <button
              onClick={handleRewind}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors active:scale-90"
              style={{ color: theme.secondaryText }}
              aria-label="Rewind"
            >
              <RotateCcw size={18} />
            </button>

            <div className="w-px h-5" style={{ backgroundColor: theme.borderColor }} />

            {/* Speed - */}
            <button
              onClick={() => handleSpeedChange(-25)}
              className="w-8 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors active:scale-90"
              style={{ color: theme.secondaryText }}
              aria-label="Slower"
            >
              <Minus size={16} />
            </button>

            {/* WPM Display */}
            <div 
              className="h-9 px-2 rounded-xl flex items-center justify-center gap-1 min-w-[70px]"
              style={{ backgroundColor: `${theme.primaryText}06` }}
            >
              <span className="text-sm font-bold tabular-nums" style={{ color: theme.primaryText }}>
                {wpm}
              </span>
              <span className="text-[10px] lowercase opacity-50" style={{ color: theme.secondaryText }}>wpm</span>
            </div>

            {/* Speed + */}
            <button
              onClick={() => handleSpeedChange(25)}
              className="w-8 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors active:scale-90"
              style={{ color: theme.secondaryText }}
              aria-label="Faster"
            >
              <Plus size={16} />
            </button>

            <div className="w-px h-5" style={{ backgroundColor: theme.borderColor }} />

            {/* Play/Pause - Main action */}
            <button
              onClick={handlePlayPause}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl font-semibold text-white shadow-md active:scale-[0.97] transition-all duration-150 text-sm hover:brightness-105"
              style={{ backgroundColor: theme.accent, minWidth: '80px' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying 
                ? <><Pause size={16} /> <span className="lowercase">pause</span></>
                : <><Play size={16} className="ml-0.5" /> <span className="lowercase">flow~</span></>
              }
            </button>

            <div className="w-px h-5" style={{ backgroundColor: theme.borderColor }} />

            {/* Ghost toggle */}
            <button
              onClick={handleToggleGhost}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-90 ${showGhost ? '' : 'opacity-40'}`}
              style={{ 
                backgroundColor: showGhost ? `${theme.accent}15` : 'transparent',
                color: showGhost ? theme.accent : theme.secondaryText
              }}
              aria-label="Toggle context"
            >
              {showGhost ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>

            {/* Theme */}
            <button
              onClick={handleToggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition-colors active:scale-90"
              style={{ color: theme.secondaryText }}
              aria-label="Toggle theme"
            >
              <ThemeIcon size={17} />
            </button>

            {/* Font size toggle */}
            <button
              onClick={() => setShowFontPanel(v => !v)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-90`}
              style={{ 
                backgroundColor: showFontPanel ? `${theme.accent}15` : 'transparent',
                color: showFontPanel ? theme.accent : theme.secondaryText
              }}
              aria-label="Text size"
            >
              <Type size={17} />
            </button>
          </div>

          {/* Font size panel (expandable) */}
          {showFontPanel && (
            <div 
              className="flex items-center justify-between px-4 py-2 border-t"
              style={{ borderColor: theme.borderColor }}
            >
              <span className="text-xs lowercase" style={{ color: theme.secondaryText }}>text size</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleFontSize(-2)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                  style={{ backgroundColor: `${theme.primaryText}06`, color: theme.primaryText }}
                >
                  <span className="text-sm">A</span>
                </button>
                <span className="text-sm font-semibold w-8 text-center tabular-nums" style={{ color: theme.primaryText }}>
                  {settings.fontSize}
                </span>
                <button
                  onClick={() => handleFontSize(2)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                  style={{ backgroundColor: `${theme.primaryText}06`, color: theme.primaryText }}
                >
                  <span className="text-lg">A</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== TOP BAR ====== */}
      <div 
        className={`fixed top-0 left-0 right-0 z-[60] transition-all duration-300 ease-out ${
          isChromeVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div 
          className="backdrop-blur-2xl border-b"
          style={{ 
            backgroundColor: `${theme.surface}e8`,
            borderColor: theme.borderColor,
            paddingTop: 'max(12px, env(safe-area-inset-top))'
          }}
        >
          <div className="flex items-center px-4 pb-3">
            <button 
              onClick={handleExit}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${theme.primaryText}08`, color: theme.primaryText }}
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>

            <div className="flex-1 mx-3 text-center">
              <h1 className="text-sm font-semibold truncate" style={{ color: theme.primaryText }}>
                {book.title}
              </h1>
              <p className="text-[10px] opacity-50 truncate" style={{ color: theme.secondaryText }}>
                {book.author}
              </p>
            </div>

            <div className="w-10" />
          </div>
        </div>
      </div>

      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${theme.accent};
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${theme.accent};
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          border: none;
        }
      `}</style>
    </div>
  );
}
