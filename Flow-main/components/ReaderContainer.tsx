import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book } from '../types';
import { StreamReader } from './StreamReader';
import { StreamEngine } from '../services/streamEngine';
import { 
  ChevronLeft, Play, Pause, RotateCcw, Sun, Moon, 
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
 * ReaderContainer - Refined Reading Experience
 * 
 * DESIGN PRINCIPLES:
 * - All essential controls immediately accessible
 * - No buried settings during reading
 * - Tap anywhere to show/hide
 * - Clean, distraction-free RSVP
 */
export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onClose }) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wpm, setWpm] = useState(settings.rsvpSpeed || 300);
  const [showGhost, setShowGhost] = useState(settings.showGhostPreview ?? true);
  const [showQuickSettings, setShowQuickSettings] = useState(false);

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
      if (playing) {
        chromeTimeout.current = setTimeout(() => setIsChromeVisible(false), 2500);
      }
    });
    
    return () => {
      unsubPos();
      unsubPlay();
      if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
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
    engine.skipBack(50); // Rewind ~50 words
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
    const current = settings.themeMode;
    const next = current === 'Dark' ? 'Light' : current === 'Light' ? 'Sepia' : 'Dark';
    // Map settings themeMode to TitanTheme modes
    const themeMap: Record<string, string> = { 'Light': 'Modern', 'Dark': 'Night', 'Sepia': 'Sepia' };
    TitanThemeService.getInstance().setMode(themeMap[next] as any || 'Modern');
    updateSettings({ themeMode: next as any });
  }, [settings.themeMode, updateSettings]);

  const handleToggleChrome = useCallback(() => {
    if (chromeTimeout.current) clearTimeout(chromeTimeout.current);
    setIsChromeVisible(v => !v);
    setShowQuickSettings(false);
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

  const themeIcon = settings.themeMode === 'Dark' ? Moon : Sun;
  const ThemeIcon = themeIcon;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div 
      className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden"
      style={{ backgroundColor: theme.background }}
    >
      {/* READER */}
      <StreamReader 
        book={book}
        onToggleChrome={handleToggleChrome}
        isActive={true}
        showGhostWords={showGhost}
      />

      {/* ====== BOTTOM CONTROL DOCK ====== */}
      <div 
        className={`fixed left-0 right-0 z-[60] transition-all duration-300 ease-out ${
          isChromeVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ 
          bottom: 0,
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          paddingLeft: '12px',
          paddingRight: '12px'
        }}
      >
        <div 
          className="rounded-3xl overflow-hidden shadow-2xl border"
          style={{ 
            backgroundColor: theme.surface,
            borderColor: theme.borderColor,
            boxShadow: '0 -4px 30px rgba(0,0,0,0.15)'
          }}
        >
          {/* Progress Scrubber */}
          <div className="px-5 pt-4 pb-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.0001"
              value={progress}
              onChange={handleScrub}
              className="w-full h-2 rounded-full appearance-none cursor-pointer touch-pan-x"
              style={{ 
                background: `linear-gradient(to right, ${theme.accent} ${progress * 100}%, ${theme.borderColor} ${progress * 100}%)`
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] opacity-40" style={{ color: theme.secondaryText }}>
                {Math.round(progress * 100)}%
              </span>
              <span className="text-[10px] opacity-40" style={{ color: theme.secondaryText }}>
                {Math.round((1 - progress) * engine.total / (wpm || 300))}m left
              </span>
            </div>
          </div>

          {/* Main Controls Row */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Rewind */}
            <button
              onClick={handleRewind}
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${theme.primaryText}06` }}
              aria-label="Rewind"
            >
              <RotateCcw size={20} style={{ color: theme.primaryText }} />
            </button>

            {/* Speed Control */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSpeedChange(-25)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{ backgroundColor: `${theme.primaryText}06` }}
                aria-label="Slower"
              >
                <Minus size={16} style={{ color: theme.secondaryText }} />
              </button>
              <div 
                className="w-20 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.primaryText}06` }}
              >
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.primaryText }}>
                  {wpm}
                </span>
                <span className="text-[10px] ml-0.5 opacity-50" style={{ color: theme.secondaryText }}>
                  wpm
                </span>
              </div>
              <button
                onClick={() => handleSpeedChange(25)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{ backgroundColor: `${theme.primaryText}06` }}
                aria-label="Faster"
              >
                <Plus size={16} style={{ color: theme.secondaryText }} />
              </button>
            </div>

            {/* Play/Pause - Central */}
            <button
              onClick={handlePlayPause}
              className="w-16 h-16 -my-2 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg"
              style={{ backgroundColor: theme.accent }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying 
                ? <Pause size={28} color="#FFFFFF" /> 
                : <Play size={28} color="#FFFFFF" className="ml-1" />
              }
            </button>

            {/* Quick Settings Toggle */}
            <div className="flex items-center gap-1">
              {/* Ghost Words Toggle */}
              <button
                onClick={handleToggleGhost}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${showGhost ? '' : 'opacity-40'}`}
                style={{ backgroundColor: showGhost ? `${theme.accent}20` : `${theme.primaryText}06` }}
                aria-label="Toggle ghost words"
              >
                {showGhost 
                  ? <Eye size={16} style={{ color: theme.accent }} />
                  : <EyeOff size={16} style={{ color: theme.secondaryText }} />
                }
              </button>

              {/* Theme Toggle */}
              <button
                onClick={handleToggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{ backgroundColor: `${theme.primaryText}06` }}
                aria-label="Toggle theme"
              >
                <ThemeIcon size={16} style={{ color: theme.secondaryText }} />
              </button>

              {/* Font Size */}
              <button
                onClick={() => setShowQuickSettings(v => !v)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${showQuickSettings ? 'ring-2' : ''}`}
                style={{ 
                  backgroundColor: showQuickSettings ? `${theme.accent}20` : `${theme.primaryText}06`,
                  ringColor: theme.accent
                }}
                aria-label="Text size"
              >
                <Type size={16} style={{ color: showQuickSettings ? theme.accent : theme.secondaryText }} />
              </button>
            </div>
          </div>

          {/* Quick Settings Panel */}
          {showQuickSettings && (
            <div 
              className="px-4 pb-4 pt-1 border-t"
              style={{ borderColor: theme.borderColor }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs lowercase" style={{ color: theme.secondaryText }}>text size</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFontSize(-2)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
                    style={{ backgroundColor: `${theme.primaryText}06` }}
                  >
                    <span className="text-sm" style={{ color: theme.primaryText }}>A</span>
                  </button>
                  <span className="w-12 text-center text-sm font-semibold" style={{ color: theme.primaryText }}>
                    {settings.fontSize}
                  </span>
                  <button
                    onClick={() => handleFontSize(2)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
                    style={{ backgroundColor: `${theme.primaryText}06` }}
                  >
                    <span className="text-lg font-medium" style={{ color: theme.primaryText }}>A</span>
                  </button>
                </div>
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
              style={{ backgroundColor: `${theme.primaryText}08` }}
              aria-label="Back"
            >
              <ChevronLeft size={22} style={{ color: theme.primaryText }} />
            </button>

            <div className="flex-1 mx-3 text-center">
              <h1 className="text-sm font-semibold truncate" style={{ color: theme.primaryText }}>
                {book.title}
              </h1>
              <p className="text-[10px] opacity-50" style={{ color: theme.secondaryText }}>
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
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${theme.accent};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: 2px solid white;
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${theme.accent};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: 2px solid white;
        }
      `}</style>
    </div>
  );
}
