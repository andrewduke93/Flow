import React, { useEffect, useState, useRef, useMemo, useLayoutEffect, useCallback, memo } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface RSVPTeleprompterProps {
  onTap?: () => void;
  onLongPressExit?: () => void;
}

/**
 * RSVPTeleprompter - Minimal Word Stream
 * 
 * SIMPLIFIED UX:
 * - Tap anywhere to pause/play
 * - Clean, focused reading experience
 * - All controls via MiniPlayerPill
 */
export const RSVPTeleprompter: React.FC<RSVPTeleprompterProps> = memo(({
  onTap,
  onLongPressExit
}) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Refs
  const lastIndexRef = useRef(-1);
  const tokensRef = useRef<RSVPToken[]>([]);
  
  // Constants - Reedy-style simplicity
  const FOCUS_COLOR = '#E25822';
  // Dynamic font size based on user settings
  const baseFontSize = settings.fontSize || 18;
  const FONT_SIZE = `clamp(${baseFontSize * 2}px, 10vw, ${baseFontSize * 3.5}px)`;

  // Sync with heartbeat - optimized with RAF batching
  useEffect(() => {
    setTokens(heartbeat.tokens);
    tokensRef.current = heartbeat.tokens;
    lastIndexRef.current = heartbeat.currentIndex;
    setCurrentIndex(heartbeat.currentIndex);
    setIsPlaying(conductor.state === RSVPState.PLAYING);

    let rafId: number | null = null;
    let pendingUpdate = false;
    
    const sync = () => {
      if (pendingUpdate) return;
      pendingUpdate = true;
      
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        pendingUpdate = false;
        const idx = heartbeat.currentIndex;
        const playing = conductor.state === RSVPState.PLAYING;
        const hbTokens = heartbeat.tokens;
        
        setIsPlaying(playing);
        
        if (hbTokens !== tokensRef.current) {
          setTokens(hbTokens);
          tokensRef.current = hbTokens;
        }
        
        if (idx !== lastIndexRef.current) {
          lastIndexRef.current = idx;
          setCurrentIndex(idx);
        }
      });
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    sync();
    
    return () => { 
      unsubC(); 
      unsubH();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Focus token
  const focusToken = useMemo(() => tokens[currentIndex] || null, [tokens, currentIndex]);

  // Show context when paused - Reedy shows upcoming words when paused
  const showContext = !isPlaying || settings.showGhostPreview;
  const contextCount = showContext ? 3 : 0; // Show fewer words for cleaner look

  // Get upcoming words for preview
  const upcomingWords = useMemo(() => {
    if (!showContext || tokens.length === 0) return [];
    const start = currentIndex + 1;
    const end = Math.min(tokens.length, currentIndex + 1 + contextCount);
    return tokens.slice(start, end);
  }, [tokens, currentIndex, showContext, contextCount]);

  // ORP calculation - Optimal Recognition Point (~30% into word)
  const getORP = (text: string) => {
    const len = Math.max(1, text.length);
    if (len <= 3) return 0;
    return Math.min(len - 1, Math.max(0, Math.floor(len * 0.3)));
  };

  // No complex positioning needed - Reedy-style centered display

  // Simple tap handler - toggle play/pause (memoized)
  const handleTap = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onTap?.();
  }, [onTap]);

  if (!focusToken) return null;

  const orpIdx = getORP(focusToken.originalText);
  const leftPart = focusToken.originalText.slice(0, orpIdx);
  const orpChar = focusToken.originalText[orpIdx] || '';
  const rightPart = focusToken.originalText.slice(orpIdx + 1);

  return (
    <div 
      ref={containerRef}
      role="application"
      aria-label="Speed reading view. Tap to pause/play."
      className="absolute inset-0 select-none overflow-hidden"
      style={{ backgroundColor: theme.background }}
      onClick={handleTap}
    >
      {/* CENTERED WORD - Reedy style: ORP locked in exact center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Main focus word - ORP character locked in center */}
        <div 
          className="relative"
          style={{ 
            fontSize: FONT_SIZE,
            fontFamily: settings.fontFamily === 'New York' ? 'Georgia, serif' : 'system-ui, sans-serif',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Left part - positioned to the left of center */}
          <span 
            style={{ 
              color: theme.primaryText,
              position: 'absolute',
              right: '50%',
              textAlign: 'right',
            }}
          >
            {leftPart}
          </span>
          {/* ORP character - anchored exactly at center */}
          <span style={{ 
            color: FOCUS_COLOR, 
            fontWeight: 700,
            textShadow: `0 0 20px ${FOCUS_COLOR}25`,
            display: 'inline-block',
            textAlign: 'center',
          }}>{orpChar}</span>
          {/* Right part - positioned to the right of center */}
          <span 
            style={{ 
              color: theme.primaryText,
              position: 'absolute',
              left: '50%',
            }}
          >
            {rightPart}
            {focusToken.punctuation && (
              <span style={{ color: theme.secondaryText, opacity: 0.7 }}>
                {focusToken.punctuation}
              </span>
            )}
          </span>
        </div>

        {/* Upcoming words preview - Reedy shows next words when paused */}
        {showContext && upcomingWords.length > 0 && (
          <div 
            className="mt-8 text-center"
            style={{
              fontSize: `calc(${FONT_SIZE} * 0.35)`,
              fontFamily: settings.fontFamily === 'New York' ? 'Georgia, serif' : 'system-ui, sans-serif',
              color: theme.secondaryText,
              opacity: 0.4,
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}
          >
            {upcomingWords.map((token, i) => (
              <span key={token.id}>
                {token.originalText}{token.punctuation || ''}{i < upcomingWords.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Progress indicator - subtle bottom line */}
      <div className="absolute bottom-8 left-8 right-8 h-[2px] rounded-full overflow-hidden opacity-20">
        <div 
          className="h-full rounded-full transition-all duration-100"
          style={{ 
            width: `${tokens.length > 0 ? (currentIndex / tokens.length) * 100 : 0}%`,
            backgroundColor: FOCUS_COLOR 
          }}
        />
      </div>
    </div>
  );
});
