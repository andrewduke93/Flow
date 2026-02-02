import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';

interface MiniPlayerPillProps {
  book: Book;
  isRSVPActive: boolean;
  onBack: () => void;
  onToggleRSVP: () => void;
}

// Speed presets - full range with meaningful steps
const SPEED_PRESETS = [100, 150, 200, 250, 300, 350, 400, 500, 600, 750, 900];

/**
 * MiniPlayerPill - Intentional Control Surface
 * 
 * READ MODE:  ← library    [ ▶ flow ]    12m
 * FLOW MODE:  ← book       [ ▌▌ ]        300 · 8m
 * 
 * Every element has ONE clear purpose.
 * Labels tell you WHERE you're going, not just "back".
 */
export const MiniPlayerPill: React.FC<MiniPlayerPillProps> = memo(({
  book,
  isRSVPActive,
  onBack,
  onToggleRSVP
}) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const { settings, updateSettings } = useTitanSettings();
  const theme = useTitanTheme();

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Scrubbing state
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Sync state
  useEffect(() => {
    const sync = () => {
      setIsPlaying(conductor.state === RSVPState.PLAYING);
      if (!isScrubbing) {
        if (isRSVPActive && heartbeat.tokens.length > 0) {
          setProgress(heartbeat.currentIndex / heartbeat.tokens.length);
        } else {
          setProgress(core.currentProgress);
        }
      }
    };

    const unsub1 = conductor.subscribe(sync);
    const unsub2 = heartbeat.subscribe(sync);
    const unsub3 = core.subscribe(sync);
    sync();
    
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [isRSVPActive, isScrubbing]);

  // Primary action
  const handlePrimaryAction = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    onToggleRSVP();
  }, [onToggleRSVP]);

  // Cycle speed (only in Flow mode)
  const cycleSpeed = useCallback(() => {
    RSVPHapticEngine.selectionChanged();
    const currentIdx = SPEED_PRESETS.findIndex(s => s >= settings.rsvpSpeed);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % SPEED_PRESETS.length;
    updateSettings({ rsvpSpeed: SPEED_PRESETS[nextIdx], hasCustomSpeed: true });
  }, [settings.rsvpSpeed, updateSettings]);

  // Back action
  const handleBack = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onBack();
  }, [onBack]);

  // Back one sentence
  const handleBackSentence = useCallback(() => {
    RSVPHapticEngine.impactLight();
    const tokens = heartbeat.tokens;
    const currentIdx = heartbeat.currentIndex;
    
    // Find start of current or previous sentence
    // Look backwards for sentence-ending punctuation
    let targetIdx = Math.max(0, currentIdx - 1);
    
    // Skip back past any whitespace/short tokens
    while (targetIdx > 0 && tokens[targetIdx]?.length < 2) {
      targetIdx--;
    }
    
    // Now find the previous sentence boundary (. ! ?)
    while (targetIdx > 0) {
      const token = tokens[targetIdx - 1];
      if (token && /[.!?]$/.test(token)) {
        break;
      }
      targetIdx--;
    }
    
    heartbeat.seek(targetIdx);
  }, []);

  // Progress scrubbing
  const handleScrub = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setProgress(pct);
    return pct;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isRSVPActive) return;
    setIsScrubbing(true);
    handleScrub(e.clientX);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [isRSVPActive, handleScrub]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing) return;
    handleScrub(e.clientX);
  }, [isScrubbing, handleScrub]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing) return;
    const pct = handleScrub(e.clientX);
    setIsScrubbing(false);
    
    // Commit position
    if (isRSVPActive && pct !== undefined) {
      const total = Math.max(1, heartbeat.tokens.length);
      heartbeat.seek(Math.floor(pct * total));
      RSVPHapticEngine.impactMedium();
    }
  }, [isScrubbing, isRSVPActive, handleScrub]);

  // Time remaining
  const getTimeLeft = () => {
    const total = Math.max(1, heartbeat.tokens.length || core.totalTokens);
    const idx = isRSVPActive ? heartbeat.currentIndex : Math.floor(progress * total);
    const left = total - idx;
    const speed = isRSVPActive ? settings.rsvpSpeed : 250; // Assume 250 for read mode estimate
    const mins = Math.ceil(left / speed);
    if (mins < 1) return "<1m";
    if (mins >= 60) return `${Math.floor(mins/60)}h${mins%60 > 0 ? mins%60 + 'm' : ''}`;
    return `${mins}m`;
  };

  // ═══════════════════════════════════════════════════════════════
  // READ MODE: Calm, inviting - "Start your flow session"
  // ═══════════════════════════════════════════════════════════════
  if (!isRSVPActive) {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Simple row: Back | Flow button | Time */}
        <div className="flex items-center justify-between w-full px-2">
          {/* Left: Back to library */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full active:scale-95 transition-transform"
            style={{ color: theme.secondaryText }}
          >
            <span className="text-lg">←</span>
            <span className="text-sm font-medium">library</span>
          </button>

          {/* Center: Primary action - START FLOW */}
          <button
            onClick={handlePrimaryAction}
            className="flex items-center gap-2 px-6 py-3 rounded-full active:scale-95 transition-transform shadow-lg"
            style={{ 
              backgroundColor: theme.accent,
              color: '#fff'
            }}
          >
            <Play size={18} className="fill-white" />
            <span className="text-sm font-semibold tracking-wide">flow</span>
          </button>

          {/* Right: Time estimate */}
          <div 
            className="px-3 py-2"
            style={{ color: theme.secondaryText }}
          >
            <span className="text-sm font-medium tabular-nums">{getTimeLeft()}</span>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // FLOW MODE: Focused, functional - "You're in the zone"
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Progress bar - always visible, interactive */}
      <div 
        ref={trackRef}
        className="w-full h-8 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div 
          className="w-full h-1 rounded-full overflow-hidden relative"
          style={{ backgroundColor: `${theme.primaryText}12` }}
        >
          <div 
            className={`h-full rounded-full ${isScrubbing ? '' : 'transition-all duration-150'}`}
            style={{ 
              width: `${progress * 100}%`,
              backgroundColor: theme.accent 
            }}
          />
          {/* Scrub indicator */}
          {isScrubbing && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
              style={{ 
                left: `${progress * 100}%`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: theme.accent
              }}
            />
          )}
        </div>
      </div>

      {/* Control row */}
      <div className="flex items-center justify-between w-full px-2">
        {/* Left: Back to book */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full active:scale-95 transition-transform"
          style={{ color: theme.secondaryText }}
        >
          <span className="text-lg">←</span>
          <span className="text-sm font-medium">book</span>
        </button>

        {/* Center group: Back sentence + Play/Pause */}
        <div className="flex items-center gap-3">
          {/* Back sentence */}
          <button
            onClick={handleBackSentence}
            className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ 
              backgroundColor: `${theme.primaryText}10`,
              color: theme.secondaryText
            }}
          >
            <RotateCcw size={18} />
          </button>

          {/* Play/Pause - THE primary action */}
          <button
            onClick={handlePrimaryAction}
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-xl"
            style={{ 
              backgroundColor: theme.accent,
              color: '#fff'
            }}
          >
            {isPlaying ? (
              <Pause size={28} className="fill-white" />
            ) : (
              <Play size={28} className="fill-white ml-1" />
            )}
          </button>
        </div>

        {/* Right: Speed (tap to change) + Time */}
        <button
          onClick={cycleSpeed}
          className="flex items-center gap-2 px-3 py-2 rounded-full active:scale-95 transition-transform"
          style={{ color: theme.primaryText }}
        >
          <span className="text-sm font-bold tabular-nums">{settings.rsvpSpeed}</span>
          <span className="text-xs opacity-40">·</span>
          <span className="text-sm font-medium tabular-nums" style={{ color: theme.secondaryText }}>{getTimeLeft()}</span>
        </button>
      </div>
    </div>
  );
});
