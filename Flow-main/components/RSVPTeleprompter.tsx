import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
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
 * RSVPTeleprompter - Reedy-Style RSVP Reader
 * 
 * Mimics Reedy's proven approach:
 * - Fixed focal point (ORP) at screen center
 * - Single word display, clean and minimal
 * - Tap to pause/play
 * - Optional preview of upcoming words when paused
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
  const wordRef = useRef<HTMLDivElement>(null);
  
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Refs
  const lastIndexRef = useRef(-1);
  const tokensRef = useRef<RSVPToken[]>([]);
  
  // Reedy-style constants
  const FOCUS_COLOR = '#E25822';
  const baseFontSize = settings.fontSize || 18;
  // Reedy uses large, clear text
  const fontSize = Math.max(baseFontSize * 2.5, 40);

  // Sync with heartbeat
  useEffect(() => {
    setTokens(heartbeat.tokens);
    tokensRef.current = heartbeat.tokens;
    lastIndexRef.current = heartbeat.currentIndex;
    setCurrentIndex(heartbeat.currentIndex);
    setIsPlaying(conductor.state === RSVPState.PLAYING);

    let rafId: number | null = null;
    
    const sync = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
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

  // Reedy-style ORP: ~30% into word for optimal recognition
  const getORP = useCallback((text: string): number => {
    const len = text.length;
    if (len <= 1) return 0;
    if (len <= 3) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * 0.3);
  }, []);

  // Show context only when paused (Reedy-style)
  const showContext = !isPlaying;

  // Get upcoming words
  const upcomingWords = useMemo(() => {
    if (!showContext || tokens.length === 0) return [];
    const start = currentIndex + 1;
    const end = Math.min(tokens.length, start + 3);
    return tokens.slice(start, end);
  }, [tokens, currentIndex, showContext]);

  // Tap handler
  const handleTap = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onTap?.();
  }, [onTap]);

  if (!focusToken) return null;

  const text = focusToken.originalText;
  const orpIdx = getORP(text);
  const beforeORP = text.slice(0, orpIdx);
  const orpChar = text[orpIdx] || '';
  const afterORP = text.slice(orpIdx + 1);
  const punct = focusToken.punctuation || '';

  const fontFamily = settings.fontFamily === 'New York' 
    ? 'Georgia, serif' 
    : 'system-ui, -apple-system, sans-serif';

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden"
      style={{ backgroundColor: theme.background }}
      onClick={handleTap}
    >
      {/* Reedy-style: Fixed focal point layout */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Word container - uses CSS Grid for precise ORP alignment */}
        <div 
          ref={wordRef}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'baseline',
            fontSize: `${fontSize}px`,
            fontFamily,
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Before ORP - right-aligned to push against center */}
          <span 
            style={{ 
              color: theme.primaryText,
              textAlign: 'right',
              paddingRight: '1px',
            }}
          >
            {beforeORP}
          </span>
          
          {/* ORP character - the focal point, always at center */}
          <span 
            style={{ 
              color: FOCUS_COLOR,
              fontWeight: 700,
            }}
          >
            {orpChar}
          </span>
          
          {/* After ORP - left-aligned */}
          <span 
            style={{ 
              color: theme.primaryText,
              textAlign: 'left',
              paddingLeft: '1px',
            }}
          >
            {afterORP}
            <span style={{ color: theme.secondaryText, opacity: 0.6 }}>{punct}</span>
          </span>
        </div>
      </div>

      {/* Subtle guide line at focal point (like Reedy's reticle) */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          top: '35%',
          bottom: '35%',
          width: '2px',
          backgroundColor: FOCUS_COLOR,
          opacity: 0.08,
        }}
      />

      {/* Preview of upcoming words when paused */}
      {showContext && upcomingWords.length > 0 && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 text-center"
          style={{
            top: '58%',
            fontSize: `${fontSize * 0.35}px`,
            fontFamily,
            color: theme.secondaryText,
            opacity: 0.35,
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
          }}
        >
          {upcomingWords.map((token, i) => (
            <span key={token.id}>
              {token.originalText}{token.punctuation || ''}{i < upcomingWords.length - 1 ? '  ' : ''}
            </span>
          ))}
        </div>
      )}

      {/* Progress bar - very subtle, Reedy-style */}
      <div 
        className="absolute left-8 right-8 bottom-6 h-[2px] rounded-full overflow-hidden"
        style={{ backgroundColor: theme.borderColor, opacity: 0.3 }}
      >
        <div 
          className="h-full rounded-full"
          style={{ 
            width: `${tokens.length > 0 ? ((currentIndex + 1) / tokens.length) * 100 : 0}%`,
            backgroundColor: FOCUS_COLOR,
            opacity: 0.6,
            transition: 'width 50ms linear',
          }}
        />
      </div>

      {/* Paused indicator */}
      {!isPlaying && (
        <div 
          className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full"
          style={{
            backgroundColor: `${theme.primaryText}10`,
            fontSize: '12px',
            fontWeight: 500,
            color: theme.secondaryText,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          paused
        </div>
      )}
    </div>
  );
});
