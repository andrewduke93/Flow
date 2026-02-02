import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, Minus, Plus, Settings, RotateCcw, Sparkles } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';

interface MediaCommandCenterProps {
  book: Book;
  onToggleRSVP: (startOffset?: number) => void;
  isRSVPActive: boolean;
  onSettingsClick: () => void;
}

/**
 * MediaCommandCenter - Clean, Stable Control Deck
 * Uses original RSVPConductor and RSVPHeartbeat
 */
export const MediaCommandCenter: React.FC<MediaCommandCenterProps> = memo(({ 
  book, 
  onToggleRSVP, 
  isRSVPActive,
  onSettingsClick 
}) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const { settings, updateSettings } = useTitanSettings();
  const theme = useTitanTheme();

  // Core state
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  // Refs for performance
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const wasPlayingRef = useRef(false);
  const lastActionTime = useRef(0);
  const rewindIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rewindHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRewindHeld, setIsRewindHeld] = useState(false);
  const wasPlayingBeforeRewind = useRef(false);

  const REWIND_STEP = 10;

  // Sync with conductor/heartbeat
  useEffect(() => {
    const sync = () => {
      setIsPlaying(heartbeat.isPlaying);
      
      if (!isScrubbing) {
        const pct = core.totalTokens > 0 ? conductor.currentTokenIndex / core.totalTokens : 0;
        setProgress(pct);
        if (progressRef.current) {
          progressRef.current.style.width = `${pct * 100}%`;
        }
      }
    };

    sync();
    const unsubCore = core.subscribe(sync);
    const unsubHeartbeat = heartbeat.subscribe(sync);
    const unsubConductor = conductor.subscribe(sync);
    
    return () => {
      unsubCore();
      unsubHeartbeat();
      unsubConductor();
    };
  }, [isScrubbing]);

  // Time remaining
  const getTimeLeft = useCallback(() => {
    const tokensLeft = Math.max(0, core.totalTokens - conductor.currentTokenIndex);
    const wpm = settings.rsvpSpeed || 250;
    const minutesLeft = tokensLeft / wpm;
    
    if (minutesLeft < 1) return '<1m';
    if (minutesLeft < 60) return `${Math.round(minutesLeft)}m`;
    const hours = Math.floor(minutesLeft / 60);
    const mins = Math.round(minutesLeft % 60);
    return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
  }, [progress, settings.rsvpSpeed]);

  // Scrubbing
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    e.preventDefault();
    setIsScrubbing(true);
    wasPlayingRef.current = heartbeat.isPlaying;
    if (wasPlayingRef.current) heartbeat.stop();
    
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(pct);
    if (progressRef.current) progressRef.current.style.width = `${pct * 100}%`;
    
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(pct);
    if (progressRef.current) progressRef.current.style.width = `${pct * 100}%`;
  }, [isScrubbing]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    // Commit position
    const targetIndex = Math.floor(pct * core.totalTokens);
    conductor.seekToToken(targetIndex);
    
    setIsScrubbing(false);
    if (wasPlayingRef.current) heartbeat.start();
    RSVPHapticEngine.impactMedium();
  }, [isScrubbing]);

  // Play/Pause
  const handleMainAction = useCallback(() => {
    const now = Date.now();
    if (now - lastActionTime.current < 200) return;
    lastActionTime.current = now;
    RSVPHapticEngine.impactMedium();
    onToggleRSVP();
  }, [onToggleRSVP]);

  // Speed adjustment
  const adjustSpeed = useCallback((delta: number) => {
    RSVPHapticEngine.impactLight();
    const next = Math.max(50, Math.min(1000, (settings.rsvpSpeed || 250) + delta));
    updateSettings({ rsvpSpeed: next, hasCustomSpeed: true });
  }, [settings.rsvpSpeed, updateSettings]);

  // Rewind
  const handleRewindStart = useCallback(() => {
    if (!isRSVPActive) return;
    RSVPHapticEngine.impactLight();
    wasPlayingBeforeRewind.current = heartbeat.isPlaying;
    
    // Immediate step
    conductor.seekByTokens(-REWIND_STEP);
    
    // Hold for continuous
    rewindHoldTimerRef.current = setTimeout(() => {
      setIsRewindHeld(true);
      if (wasPlayingBeforeRewind.current) heartbeat.stop();
      
      rewindIntervalRef.current = setInterval(() => {
        conductor.seekByTokens(-REWIND_STEP);
        RSVPHapticEngine.selectionChanged();
        if (conductor.currentTokenIndex <= 0) stopRewind();
      }, 150);
    }, 300);
  }, [isRSVPActive]);

  const stopRewind = useCallback(() => {
    if (rewindHoldTimerRef.current) clearTimeout(rewindHoldTimerRef.current);
    if (rewindIntervalRef.current) clearInterval(rewindIntervalRef.current);
    rewindHoldTimerRef.current = null;
    rewindIntervalRef.current = null;
    
    if (isRewindHeld) {
      setIsRewindHeld(false);
      if (wasPlayingBeforeRewind.current) heartbeat.start();
      RSVPHapticEngine.impactMedium();
    }
  }, [isRewindHeld]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rewindIntervalRef.current) clearInterval(rewindIntervalRef.current);
      if (rewindHoldTimerRef.current) clearTimeout(rewindHoldTimerRef.current);
    };
  }, []);

  // Ghost toggle
  const toggleGhost = useCallback(() => {
    RSVPHapticEngine.impactLight();
    updateSettings({ showGhostPreview: !settings.showGhostPreview });
  }, [settings.showGhostPreview, updateSettings]);

  return (
    <div 
      className="w-full backdrop-blur-xl rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: `${theme.surface}f0`,
        borderColor: theme.borderColor
      }}
    >
      {/* Progress Bar */}
      <div 
        ref={trackRef}
        className="h-10 px-4 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div 
          className="w-full h-1 rounded-full relative"
          style={{ backgroundColor: `${theme.primaryText}10` }}
        >
          <div 
            ref={progressRef}
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ backgroundColor: theme.accent, width: `${progress * 100}%` }}
          />
          {/* Scrub knob */}
          {isScrubbing && (
            <div 
              className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
              style={{ 
                left: `${progress * 100}%`, 
                transform: 'translate(-50%, -50%)',
                backgroundColor: theme.accent 
              }}
            />
          )}
        </div>
      </div>

      {/* Controls Row - Symmetrical */}
      <div className="flex items-center justify-between px-4 pb-4 gap-3">
        
        {/* Left: Speed Control */}
        <div 
          className="flex items-center h-11 rounded-xl border shrink-0"
          style={{ borderColor: theme.borderColor, backgroundColor: `${theme.primaryText}05` }}
        >
          <button 
            onClick={() => adjustSpeed(-25)}
            className="w-10 h-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: theme.secondaryText }}
          >
            <Minus size={16} />
          </button>
          <div className="px-2 min-w-[48px] text-center">
            <span className="text-xs font-bold tabular-nums" style={{ color: theme.primaryText }}>
              {settings.rsvpSpeed || 250}
            </span>
          </div>
          <button 
            onClick={() => adjustSpeed(25)}
            className="w-10 h-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ color: theme.secondaryText }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Center: Rewind + Play/Pause + Ghost */}
        <div className="flex items-center gap-2">
          {/* Rewind - only in RSVP */}
          {isRSVPActive && (
            <button
              onPointerDown={handleRewindStart}
              onPointerUp={stopRewind}
              onPointerLeave={stopRewind}
              onPointerCancel={stopRewind}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                isRewindHeld ? 'scale-110' : 'active:scale-95'
              }`}
              style={{ 
                backgroundColor: isRewindHeld ? `${theme.accent}25` : `${theme.primaryText}08`,
                color: isRewindHeld ? theme.accent : theme.secondaryText
              }}
            >
              <RotateCcw size={18} className={isRewindHeld ? 'animate-spin' : ''} style={{ animationDirection: 'reverse', animationDuration: '1s' }} />
            </button>
          )}

          {/* Play/Pause */}
          <button
            onClick={handleMainAction}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            style={{ 
              backgroundColor: theme.accent,
              boxShadow: `0 4px 16px -2px ${theme.accent}50`
            }}
          >
            {isRSVPActive && isPlaying ? (
              <Pause size={22} className="text-white fill-white" />
            ) : (
              <Play size={22} className="text-white fill-white ml-0.5" />
            )}
          </button>

          {/* Ghost toggle - only in RSVP */}
          {isRSVPActive && (
            <button
              onClick={toggleGhost}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ 
                backgroundColor: settings.showGhostPreview ? `${theme.accent}25` : `${theme.primaryText}08`,
                color: settings.showGhostPreview ? theme.accent : theme.secondaryText
              }}
            >
              <Sparkles size={18} className={settings.showGhostPreview ? 'fill-current' : ''} />
            </button>
          )}
        </div>

        {/* Right: Settings + Time */}
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={onSettingsClick}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ 
              backgroundColor: `${theme.primaryText}08`,
              color: theme.secondaryText
            }}
          >
            <Settings size={18} />
          </button>
          <span 
            className="text-xs font-medium tabular-nums min-w-[32px] text-right"
            style={{ color: theme.secondaryText }}
          >
            {getTimeLeft()}
          </span>
        </div>
      </div>
    </div>
  );
});
