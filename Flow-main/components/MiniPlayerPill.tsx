import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, ChevronLeft } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';

interface MiniPlayerPillProps {
  book: Book;
  isRSVPActive: boolean;
  onBack: () => void;
  onToggleRSVP: () => void;
}

/**
 * MiniPlayerPill - Minimal Control Surface
 * 
 * Design Principles (UX Psychology):
 * 
 * 1. HICK'S LAW: Minimize choices. One primary action per mode.
 * 2. FITTS'S LAW: Primary action is largest, centered.
 * 3. PROGRESSIVE DISCLOSURE: Speed only visible during Flow.
 * 4. AESTHETIC-USABILITY: Clean = feels easier to use.
 * 5. MILLER'S LAW: Never more than 4 visible elements.
 * 
 * READ MODE:  ←  ════════●═══════════  12m  [▶]
 *             back     progress      time  flow
 * 
 * FLOW MODE:  ←  ════════●═══════════  5m  300  [▶]
 *            exit    progress       time  wpm  play
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
  
  // Scrubbing
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

  // Primary action - always the same: toggle
  const handlePrimaryAction = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    onToggleRSVP();
  }, [onToggleRSVP]);

  // Back
  const handleBack = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onBack();
  }, [onBack]);

  // Speed cycling
  const cycleSpeed = useCallback(() => {
    RSVPHapticEngine.selectionChanged();
    const presets = [150, 200, 250, 300, 400, 500, 700];
    const currentIdx = presets.findIndex(s => s >= settings.rsvpSpeed);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % presets.length;
    updateSettings({ rsvpSpeed: presets[nextIdx], hasCustomSpeed: true });
  }, [settings.rsvpSpeed, updateSettings]);

  // Progress scrubbing
  const handleScrub = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setProgress(pct);
    return pct;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsScrubbing(true);
    handleScrub(e.clientX);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [handleScrub]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing) return;
    handleScrub(e.clientX);
  }, [isScrubbing, handleScrub]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing) return;
    const pct = handleScrub(e.clientX);
    setIsScrubbing(false);
    
    if (pct !== undefined) {
      if (isRSVPActive) {
        const total = Math.max(1, heartbeat.tokens.length);
        heartbeat.seek(Math.floor(pct * total));
      } else {
        core.jump(pct);
      }
      RSVPHapticEngine.impactMedium();
    }
  }, [isScrubbing, isRSVPActive, handleScrub]);

  // Time remaining
  const getTimeLeft = () => {
    const total = Math.max(1, heartbeat.tokens.length || core.totalTokens);
    const idx = isRSVPActive ? heartbeat.currentIndex : Math.floor(progress * total);
    const left = total - idx;
    const speed = isRSVPActive ? settings.rsvpSpeed : 250;
    const mins = Math.ceil(left / speed);
    if (mins < 1) return "<1";
    if (mins >= 60) return `${Math.floor(mins/60)}h`;
    return `${mins}`;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // UNIFIED LAYOUT - Same structure, contextual content
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div 
      className="flex items-center gap-3 w-full px-1"
      style={{ height: '56px' }}
    >
      {/* BACK BUTTON */}
      <button
        onClick={handleBack}
        className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
        style={{ 
          backgroundColor: `${theme.primaryText}06`,
          color: theme.secondaryText 
        }}
        aria-label={isRSVPActive ? "Exit flow mode" : "Back to library"}
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>

      {/* PROGRESS BAR */}
      <div 
        ref={trackRef}
        className="flex-1 h-12 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="w-full relative">
          <div 
            className="w-full h-1 rounded-full"
            style={{ backgroundColor: `${theme.primaryText}10` }}
          />
          <div 
            className={`absolute top-0 left-0 h-1 rounded-full ${isScrubbing ? '' : 'transition-all duration-200'}`}
            style={{ 
              width: `${progress * 100}%`,
              backgroundColor: theme.accent 
            }}
          />
          {isScrubbing && (
            <div 
              className="absolute top-1/2 w-4 h-4 rounded-full shadow-lg"
              style={{ 
                left: `${progress * 100}%`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: theme.accent,
                border: '2px solid white'
              }}
            />
          )}
        </div>
      </div>

      {/* TIME */}
      <div 
        className="text-xs font-medium tabular-nums shrink-0 w-7 text-right"
        style={{ color: theme.secondaryText }}
      >
        {getTimeLeft()}m
      </div>

      {/* SPEED - Only in Flow mode */}
      {isRSVPActive && (
        <button
          onClick={cycleSpeed}
          className="text-xs font-bold tabular-nums shrink-0 px-2 py-1.5 rounded-lg active:scale-95 transition-transform"
          style={{ 
            color: theme.primaryText,
            backgroundColor: `${theme.primaryText}08`
          }}
        >
          {settings.rsvpSpeed}
        </button>
      )}

      {/* PRIMARY ACTION */}
      <button
        onClick={handlePrimaryAction}
        className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-md shrink-0"
        style={{ 
          backgroundColor: theme.accent,
          color: '#fff'
        }}
      >
        {isRSVPActive && isPlaying ? (
          <Pause size={20} className="fill-white" />
        ) : (
          <Play size={20} className="fill-white ml-0.5" />
        )}
      </button>
    </div>
  );
});
