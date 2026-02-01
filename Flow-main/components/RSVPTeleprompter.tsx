import React, { useEffect, useState, useRef, useMemo, useLayoutEffect } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface RSVPTeleprompterProps {
  onTap?: () => void;
  onLongPressExit?: () => void;
  onRewindStateChange?: (isRewinding: boolean) => void;
}

/**
 * RSVPTeleprompter - Minimal Word Stream
 * 
 * SIMPLIFIED UX:
 * - No gestures on the teleprompter itself
 * - All controls via MediaCommandCenter pill
 * - Clean, focused reading experience
 * - Tap anywhere to pause/play
 */
export const RSVPTeleprompter: React.FC<RSVPTeleprompterProps> = ({
  onTap,
  onLongPressExit,
  onRewindStateChange
}) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ribbonOffset, setRibbonOffset] = useState(0);
  
  // Refs
  const lastIndexRef = useRef(-1);
  const tokensRef = useRef<RSVPToken[]>([]);
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());
  
  // Constants - Refined for polish
  const FOCUS_COLOR = '#E25822';
  const RETICLE_POSITION = 35.5;
  // Dynamic font size based on user settings - scales proportionally
  const baseFontSize = settings.fontSize || 18;
  const FONT_SIZE = `clamp(${baseFontSize * 1.8}px, 8vw, ${baseFontSize * 3}px)`;

  // Sync with heartbeat - simplified
  useEffect(() => {
    setTokens(heartbeat.tokens);
    tokensRef.current = heartbeat.tokens;
    lastIndexRef.current = heartbeat.currentIndex;
    setCurrentIndex(heartbeat.currentIndex);
    setIsPlaying(conductor.state === RSVPState.PLAYING);

    const sync = () => {
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
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    sync();
    
    return () => { unsubC(); unsubH(); };
  }, []);

  // Focus token
  const focusToken = useMemo(() => tokens[currentIndex] || null, [tokens, currentIndex]);

  // Show context when paused or when ghost preview is enabled
  const showContext = !isPlaying || settings.showGhostPreview;
  const contextCount = 4;

  // Build token window
  const streamTokens = useMemo(() => {
    if (tokens.length === 0) return [];
    if (!showContext) {
      return focusToken ? [{ token: focusToken, globalIdx: currentIndex }] : [];
    }
    
    const start = Math.max(0, currentIndex - contextCount);
    const end = Math.min(tokens.length - 1, currentIndex + contextCount);
    
    return tokens.slice(start, end + 1).map((token, i) => ({
      token,
      globalIdx: start + i
    }));
  }, [tokens, currentIndex, showContext, contextCount, focusToken]);

  // ORP calculation - Optimal Recognition Point (~30% into word)
  const getORP = (text: string) => {
    const len = Math.max(1, text.length);
    if (len <= 3) return 0;
    return Math.min(len - 1, Math.max(0, Math.floor(len * 0.3)));
  };

  // Position ribbon - align focus letter with reticle
  useLayoutEffect(() => {
    if (!ribbonRef.current) return;
    
    const ribbon = ribbonRef.current;
    const children = Array.from(ribbon.children) as HTMLElement[];
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const reticleX = containerWidth * (RETICLE_POSITION / 100);
    
    wordPositions.current.clear();
    
    children.forEach((child) => {
      const idx = parseInt(child.dataset.idx || '0');
      const rect = child.getBoundingClientRect();
      const ribbonRect = ribbon.getBoundingClientRect();
      const left = rect.left - ribbonRect.left;
      
      let focusLetterPos = left + rect.width / 2;
      
      if (idx === currentIndex && focusToken) {
        const text = focusToken.originalText;
        const focusCharIdx = getORP(text);

        try {
          const orpSpan = child.querySelector?.('span:nth-child(2)') as HTMLElement;
          if (orpSpan?.getBoundingClientRect) {
            const orpRect = orpSpan.getBoundingClientRect();
            focusLetterPos = (orpRect.left + orpRect.right) / 2 - ribbonRect.left;
          } else if (text.length > 0) {
            const estimatedCharWidth = rect.width / text.length;
            focusLetterPos = left + focusCharIdx * estimatedCharWidth + estimatedCharWidth / 2;
          }
        } catch {
          const estimatedCharWidth = rect.width / Math.max(1, text.length);
          focusLetterPos = left + focusCharIdx * estimatedCharWidth + estimatedCharWidth / 2;
        }
      }
      
      wordPositions.current.set(idx, { left, width: rect.width, center: focusLetterPos });
    });
    
    const activePos = wordPositions.current.get(currentIndex);
    if (activePos) {
      setRibbonOffset(reticleX - activePos.center);
    }
  }, [streamTokens, currentIndex, focusToken]);

  // Simple tap handler - toggle play/pause
  const handleTap = () => {
    RSVPHapticEngine.impactLight();
    onTap?.();
  };

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
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: `radial-gradient(ellipse 90% 60% at ${RETICLE_POSITION}% 42%, transparent 0%, ${theme.background}90 100%)`
        }}
      />

      {/* Minimal reticle line */}
      <div 
        className="absolute top-[25%] bottom-[25%] w-[1.5px] z-0 pointer-events-none"
        style={{ 
          left: `${RETICLE_POSITION}%`, 
          backgroundColor: FOCUS_COLOR, 
          opacity: 0.12
        }}
      />

      {/* WORD STREAM */}
      <div className="absolute inset-x-0 top-[42%] -translate-y-1/2 flex items-center justify-start overflow-visible z-20">
        {/* Edge fades */}
        {showContext && (
          <>
            <div 
              className="absolute left-0 top-[-50%] bottom-[-50%] w-24 z-30 pointer-events-none"
              style={{ background: `linear-gradient(to right, ${theme.background}, transparent)` }}
            />
            <div 
              className="absolute right-0 top-[-50%] bottom-[-50%] w-24 z-30 pointer-events-none"
              style={{ background: `linear-gradient(to left, ${theme.background}, transparent)` }}
            />
          </>
        )}

        {/* Word Ribbon - GPU accelerated */}
        <div
          ref={ribbonRef}
          className="flex items-baseline gap-4 whitespace-nowrap"
          style={{
            transform: `translate3d(${ribbonOffset}px, 0, 0)`,
            willChange: 'transform'
          }}
        >
          {streamTokens.map(({ token, globalIdx }) => {
            const isFocus = globalIdx === currentIndex;
            const distance = Math.abs(globalIdx - currentIndex);
            const contextOpacity = Math.max(0.08, 0.4 - (distance * 0.08));
            
            if (isFocus) {
              return (
                <span
                  key={token.id}
                  data-idx={globalIdx}
                  className="inline-flex items-baseline font-sans font-semibold"
                  style={{ 
                    fontSize: FONT_SIZE,
                    fontFamily: settings.fontFamily === 'New York' ? 'Georgia, serif' : 'system-ui, sans-serif'
                  }}
                >
                  <span style={{ color: theme.primaryText }}>{leftPart}</span>
                  <span style={{ 
                    color: FOCUS_COLOR, 
                    textShadow: `0 0 24px ${FOCUS_COLOR}30`
                  }}>{orpChar}</span>
                  <span style={{ color: theme.primaryText }}>{rightPart}</span>
                  {token.punctuation && (
                    <span style={{ color: theme.secondaryText, opacity: 0.4, marginLeft: '2px' }}>
                      {token.punctuation}
                    </span>
                  )}
                </span>
              );
            }
            
            return (
              <span
                key={token.id}
                data-idx={globalIdx}
                className="font-sans"
                style={{
                  fontSize: FONT_SIZE,
                  fontWeight: 400,
                  fontFamily: settings.fontFamily === 'New York' ? 'Georgia, serif' : 'system-ui, sans-serif',
                  color: theme.primaryText,
                  opacity: contextOpacity,
                }}
              >
                {token.originalText}
              </span>
            );
          })}
        </div>
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
};
