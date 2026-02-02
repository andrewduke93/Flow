import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, ChevronLeft, Settings, ChevronUp } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';

interface MiniPlayerPillProps {
  book: Book;
  isRSVPActive: boolean;
  onBack: () => void;
  onToggleRSVP: () => void;
  onSettingsClick: () => void;
}

/**
 * MiniPlayerPill - Unified Minimal Control Surface
 * 
 * Design Philosophy:
 * - One control for both scroll and RSVP modes
 * - Progressive disclosure - tap to expand
 * - Gesture-first - swipe for speed adjustment
 * - Invisible until needed
 */
export const MiniPlayerPill: React.FC<MiniPlayerPillProps> = memo(({
  book,
  isRSVPActive,
  onBack,
  onToggleRSVP,
  onSettingsClick
}) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const { settings, updateSettings } = useTitanSettings();
  const theme = useTitanTheme();

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  // Swipe gesture state
  const speedRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef(0);
  const swipeStartSpeed = useRef(settings.rsvpSpeed);
  const isSwipingSpeed = useRef(false);
  
  // Progress bar refs
  const progressBarRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  
  // Auto-collapse timer
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeColor = theme.accent;

  // Time remaining calculation
  const getTimeRemaining = useCallback(() => {
    const total = Math.max(1, heartbeat.tokens.length || core.totalTokens);
    const idx = isRSVPActive ? heartbeat.currentIndex : Math.floor(currentProgress * total);
    const left = total - idx;
    const speed = settings.rsvpSpeed || 250;
    const mins = Math.ceil(left / speed);
    if (mins < 1) return "< 1m";
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }
    return `${mins}m`;
  }, [settings.rsvpSpeed, heartbeat.tokens.length, core.totalTokens, currentProgress, isRSVPActive]);

  // Sync state
  useEffect(() => {
    const sync = () => {
      setIsPlaying(conductor.state === RSVPState.PLAYING);
      
      if (isRSVPActive && heartbeat.tokens.length > 0) {
        setCurrentProgress(heartbeat.currentIndex / heartbeat.tokens.length);
      } else {
        setCurrentProgress(core.currentProgress);
      }
    };

    const unsubCond = conductor.subscribe(sync);
    const unsubHeart = heartbeat.subscribe(sync);
    const unsubCore = core.subscribe(sync);
    sync();
    
    return () => { unsubCond(); unsubHeart(); unsubCore(); };
  }, [isRSVPActive]);

  // Update progress bar visually
  useEffect(() => {
    if (progressBarRef.current && !isScrubbing) {
      progressBarRef.current.style.width = `${currentProgress * 100}%`;
    }
  }, [currentProgress, isScrubbing]);

  // Auto-collapse when playing
  useEffect(() => {
    if (isPlaying && isExpanded) {
      collapseTimer.current = setTimeout(() => {
        setIsExpanded(false);
      }, 2000);
    }
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [isPlaying, isExpanded]);

  // Main play/pause action
  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    RSVPHapticEngine.impactLight();
    onToggleRSVP();
  }, [onToggleRSVP]);

  // Speed swipe gesture handlers
  const handleSpeedTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartSpeed.current = settings.rsvpSpeed;
    isSwipingSpeed.current = true;
  }, [settings.rsvpSpeed]);

  const handleSpeedTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwipingSpeed.current) return;
    
    const deltaX = e.touches[0].clientX - swipeStartX.current;
    // Every 20px = 25 WPM change
    const speedDelta = Math.round(deltaX / 20) * 25;
    const newSpeed = Math.max(50, Math.min(1000, swipeStartSpeed.current + speedDelta));
    
    if (newSpeed !== settings.rsvpSpeed) {
      RSVPHapticEngine.selectionChanged();
      updateSettings({ rsvpSpeed: newSpeed, hasCustomSpeed: true });
    }
  }, [settings.rsvpSpeed, updateSettings]);

  const handleSpeedTouchEnd = useCallback(() => {
    isSwipingSpeed.current = false;
  }, []);

  // Progress scrubbing
  const handleProgressTouch = useCallback((e: React.TouchEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    
    setIsScrubbing(true);
    setCurrentProgress(pct);
    
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct * 100}%`;
    }
  }, []);

  const handleProgressTouchEnd = useCallback(() => {
    if (!isScrubbing) return;
    setIsScrubbing(false);
    
    // Commit the scrub
    if (isRSVPActive) {
      const total = Math.max(1, heartbeat.tokens.length);
      heartbeat.seek(Math.floor(currentProgress * total));
    } else {
      core.jump(currentProgress);
    }
    RSVPHapticEngine.impactMedium();
  }, [isScrubbing, currentProgress, isRSVPActive]);

  // Expand/collapse
  const toggleExpanded = useCallback(() => {
    RSVPHapticEngine.impactLight();
    setIsExpanded(prev => !prev);
  }, []);

  // Speed label
  const getSpeedLabel = (wpm: number): string => {
    if (wpm <= 150) return 'slow';
    if (wpm <= 250) return 'normal';
    if (wpm <= 400) return 'fast';
    return 'turbo';
  };

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Expanded: Progress Scrubber */}
      {isExpanded && (
        <div 
          ref={trackRef}
          className="w-full h-8 flex items-center px-1 touch-none"
          onTouchStart={handleProgressTouch}
          onTouchMove={handleProgressTouch}
          onTouchEnd={handleProgressTouchEnd}
        >
          <div 
            className="w-full h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: `${theme.primaryText}15` }}
          >
            <div 
              ref={progressBarRef}
              className="h-full rounded-full transition-none"
              style={{ 
                width: `${currentProgress * 100}%`,
                backgroundColor: activeColor 
              }}
            />
          </div>
        </div>
      )}

      {/* Main Pill */}
      <div 
        className="flex items-center gap-1 px-2 backdrop-blur-xl rounded-full shadow-lg transition-all duration-300"
        style={{
          backgroundColor: `${theme.surface}e8`,
          boxShadow: `0 4px 24px -2px rgba(0,0,0,0.12), 0 0 0 0.5px ${theme.borderColor}`,
          height: isExpanded ? '52px' : '48px',
        }}
        onClick={toggleExpanded}
      >
        {/* Back Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ color: theme.secondaryText }}
        >
          <ChevronLeft size={20} />
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ backgroundColor: `${theme.primaryText}10` }} />

        {/* Speed Control - Swipeable */}
        <div
          ref={speedRef}
          className="flex items-center justify-center min-w-[72px] h-10 px-2 select-none touch-pan-y"
          onTouchStart={handleSpeedTouchStart}
          onTouchMove={handleSpeedTouchMove}
          onTouchEnd={handleSpeedTouchEnd}
        >
          <div className="flex flex-col items-center">
            <span 
              className="text-sm font-semibold tabular-nums leading-tight"
              style={{ color: theme.primaryText }}
            >
              {settings.rsvpSpeed}
            </span>
            <span 
              className="text-[9px] uppercase tracking-wider opacity-50"
              style={{ color: theme.secondaryText }}
            >
              {getSpeedLabel(settings.rsvpSpeed)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-5" style={{ backgroundColor: `${theme.primaryText}10` }} />

        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ 
            backgroundColor: activeColor,
            color: '#fff'
          }}
        >
          {isRSVPActive && isPlaying ? (
            <Pause size={18} className="fill-white" />
          ) : (
            <Play size={18} className="fill-white ml-0.5" />
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ backgroundColor: `${theme.primaryText}10` }} />

        {/* Time Remaining */}
        <div className="flex items-center justify-center min-w-[48px] h-10 px-2">
          <span 
            className="text-xs font-medium tabular-nums"
            style={{ color: theme.secondaryText }}
          >
            {getTimeRemaining()}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5" style={{ backgroundColor: `${theme.primaryText}10` }} />

        {/* Settings Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ color: theme.secondaryText }}
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Expand hint - only show when collapsed and not in RSVP */}
      {!isExpanded && !isRSVPActive && (
        <div 
          className="flex items-center gap-1 text-[10px] opacity-40 animate-pulse"
          style={{ color: theme.secondaryText }}
        >
          <ChevronUp size={12} />
          <span>swipe up to speed read</span>
        </div>
      )}
    </div>
  );
});
