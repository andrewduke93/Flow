import React, { useState, useEffect, useCallback, memo } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { Play, Pause, X } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';

interface MiniPlayerPillProps {
  book: Book;
  isRSVPActive: boolean;
  onBack: () => void;
  onToggleRSVP: () => void;
}

// Speed presets - tap to cycle
const SPEED_PRESETS = [150, 200, 250, 300, 400, 500, 700];

/**
 * MiniPlayerPill - Ultra-Minimal Control
 * 
 * Design: Everything visible, nothing hidden
 * - Play/Pause button
 * - Speed (tap to cycle)
 * - Close button
 * - That's it.
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

  // Sync state
  useEffect(() => {
    const sync = () => {
      setIsPlaying(conductor.state === RSVPState.PLAYING);
      if (isRSVPActive && heartbeat.tokens.length > 0) {
        setProgress(heartbeat.currentIndex / heartbeat.tokens.length);
      } else {
        setProgress(core.currentProgress);
      }
    };

    const unsub1 = conductor.subscribe(sync);
    const unsub2 = heartbeat.subscribe(sync);
    const unsub3 = core.subscribe(sync);
    sync();
    
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [isRSVPActive]);

  // Play/pause
  const handlePlayPause = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onToggleRSVP();
  }, [onToggleRSVP]);

  // Cycle speed
  const cycleSpeed = useCallback(() => {
    RSVPHapticEngine.selectionChanged();
    const currentIdx = SPEED_PRESETS.findIndex(s => s >= settings.rsvpSpeed);
    const nextIdx = (currentIdx + 1) % SPEED_PRESETS.length;
    updateSettings({ rsvpSpeed: SPEED_PRESETS[nextIdx], hasCustomSpeed: true });
  }, [settings.rsvpSpeed, updateSettings]);

  // Time remaining
  const getTimeLeft = () => {
    const total = Math.max(1, heartbeat.tokens.length || core.totalTokens);
    const idx = isRSVPActive ? heartbeat.currentIndex : Math.floor(progress * total);
    const left = total - idx;
    const mins = Math.ceil(left / settings.rsvpSpeed);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h`;
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Progress line - full width, ultra thin */}
      <div 
        className="w-full h-0.5 rounded-full overflow-hidden"
        style={{ backgroundColor: `${theme.primaryText}10` }}
      >
        <div 
          className="h-full rounded-full transition-all duration-150"
          style={{ 
            width: `${progress * 100}%`,
            backgroundColor: theme.accent 
          }}
        />
      </div>

      {/* Control row - everything visible */}
      <div className="flex items-center gap-4">
        {/* Close */}
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ 
            backgroundColor: `${theme.primaryText}08`,
            color: theme.secondaryText 
          }}
        >
          <X size={18} />
        </button>

        {/* Speed - tap to cycle */}
        <button
          onClick={cycleSpeed}
          className="min-w-[64px] h-10 px-3 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ 
            backgroundColor: `${theme.primaryText}08`,
            color: theme.primaryText 
          }}
        >
          <span className="text-sm font-semibold tabular-nums">{settings.rsvpSpeed}</span>
          <span className="text-[10px] ml-1 opacity-50">wpm</span>
        </button>

        {/* Play/Pause - primary action */}
        <button
          onClick={handlePlayPause}
          className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-lg"
          style={{ 
            backgroundColor: theme.accent,
            color: '#fff'
          }}
        >
          {isRSVPActive && isPlaying ? (
            <Pause size={22} className="fill-white" />
          ) : (
            <Play size={22} className="fill-white ml-0.5" />
          )}
        </button>

        {/* Time left */}
        <div 
          className="min-w-[48px] h-10 px-3 rounded-full flex items-center justify-center"
          style={{ 
            backgroundColor: `${theme.primaryText}08`,
            color: theme.secondaryText 
          }}
        >
          <span className="text-sm font-medium tabular-nums">{getTimeLeft()}</span>
        </div>

        {/* Spacer to balance close button */}
        <div className="w-10" />
      </div>
    </div>
  );
});
