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
 * RSVPTeleprompter - Unified Word Stream
 * 
 * Display modes:
 * - PLAYING + toggle OFF: Only focus word visible
 * - PLAYING + toggle ON: Focus word + context words before/after
 * - PAUSED: Focus word + context words always visible
 * 
 * Gestures:
 * - TAP on word: Jump to that word
 * - SWIPE LEFT/RIGHT: Move through words (natural scrubbing)
 * - LONG PRESS: Exit to scroll view
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
  const [isRewinding, setIsRewinding] = useState(false);
  
  // Refs
  const lastIndexRef = useRef(-1);
  const tokensRef = useRef<RSVPToken[]>([]);
  const pointerStart = useRef({ x: 0, y: 0, time: 0 });
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewindIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rewindIndexRef = useRef(0);
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());
  
  // Constants
  const HOLD_THRESHOLD_MS = 300;
  const TAP_THRESHOLD_PX = 10;
  const FOCUS_COLOR = '#E25822';
  const RETICLE_POSITION = 35.5;
  const FONT_SIZE = "clamp(2.5rem, 10vw, 4rem)";

  // Sync with heartbeat
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
      
      const tokensChanged = hbTokens !== tokensRef.current;
      const indexChanged = idx !== lastIndexRef.current;
      
      if (tokensChanged) {
        setTokens(hbTokens);
        tokensRef.current = hbTokens;
      }
      
      if (indexChanged) {
        lastIndexRef.current = idx;
        setCurrentIndex(idx);
      }
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    sync();
    
    return () => { unsubC(); unsubH(); };
  }, []);

  // Focus token - always use current index
  const focusToken = useMemo(() => tokens[currentIndex] || null, [tokens, currentIndex]);

  // Determine what to show:
  // - Paused: always show context
  // - Playing + toggle ON: show context
  // - Playing + toggle OFF: only focus
  const showContext = !isPlaying || settings.showGhostPreview;
  const contextCount = 5;

  // Build token window
  const streamTokens = useMemo(() => {
    if (tokens.length === 0) return [];
    if (!showContext) {
      // Only focus word
      return focusToken ? [{ token: focusToken, globalIdx: currentIndex }] : [];
    }
    
    const start = Math.max(0, currentIndex - contextCount);
    const end = Math.min(tokens.length - 1, currentIndex + contextCount);
    
    return tokens.slice(start, end + 1).map((token, i) => ({
      token,
      globalIdx: start + i
    }));
  }, [tokens, currentIndex, showContext, contextCount, focusToken]);

  // Position ribbon - align focus letter precisely with reticle
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
      
      // If this is the focus word, measure the exact pixel position of the middle character
      if (idx === currentIndex && focusToken) {
        const text = focusToken.originalText;
        const middleCharIdx = Math.floor(text.length / 2);
        
        // Measure text up to middle char (inclusive)
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'nowrap';
        tempSpan.style.font = window.getComputedStyle(child).font;
        
        // Measure chars 0 to middle
        tempSpan.textContent = text.substring(0, middleCharIdx + 1);
        child.appendChild(tempSpan);
        const widthToMiddleInclusive = tempSpan.getBoundingClientRect().width;
        child.removeChild(tempSpan);
        
        // Measure chars 0 to middle-1
        tempSpan.textContent = text.substring(0, middleCharIdx);
        child.appendChild(tempSpan);
        const widthToMiddleExclusive = tempSpan.getBoundingClientRect().width;
        child.removeChild(tempSpan);
        
        const middleCharWidth = widthToMiddleInclusive - widthToMiddleExclusive;
        const focusLetterCenter = widthToMiddleExclusive + middleCharWidth / 2;
        
        focusLetterPos = left + focusLetterCenter;
      }
      
      wordPositions.current.set(idx, { left, width: rect.width, center: focusLetterPos });
    });
    
    const activePos = wordPositions.current.get(currentIndex);
    if (activePos) {
      // Align the focus letter position with the reticle
      setRibbonOffset(reticleX - activePos.center);
    }
  }, [streamTokens, currentIndex, focusToken]);

  // Cleanup
  useEffect(() => {
    return () => { 
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (rewindIntervalRef.current) clearInterval(rewindIntervalRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // PRESS & HOLD TO REWIND (nice and slow)
  // ═══════════════════════════════════════════════════════════════════

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    
    const target = e.target as HTMLElement;
    const clickedWordIdx = target.dataset.idx ? parseInt(target.dataset.idx) : null;
    
    // If clicked directly on a word - jump to it
    if (clickedWordIdx !== null) {
      heartbeat.seek(clickedWordIdx);
      setCurrentIndex(clickedWordIdx);
      RSVPHapticEngine.impactMedium();
      return;
    }
    
    // If paused and tapped empty area - exit to scroll view
    if (!isPlaying) {
      onLongPressExit?.();
      return;
    }
    
    // Otherwise start hold timer for rewind
    pointerStart.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    };
    
    holdTimerRef.current = setTimeout(() => {
      setIsRewinding(true);
      RSVPHapticEngine.impactLight();
      rewindIndexRef.current = currentIndex;
      
      // Pause the conductor to prevent it from advancing while rewinding
      conductor.pause();
      
      // Start slow rewind - 1 word every 300ms (nice and slow)
      rewindIntervalRef.current = setInterval(() => {
        rewindIndexRef.current = Math.max(0, rewindIndexRef.current - 1);
        setCurrentIndex(rewindIndexRef.current);
        RSVPHapticEngine.selectionChanged();
      }, 300);
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Cancel rewind if pointer moves significantly away
    if (isRewinding) {
      const dx = Math.abs(e.clientX - pointerStart.current.x);
      const dy = Math.abs(e.clientY - pointerStart.current.y);
      if (dx > 50 || dy > 50) {
        stopRewind();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    stopRewind();
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    stopRewind();
  };

  const stopRewind = () => {
    if (isRewinding) {
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
        rewindIntervalRef.current = null;
      }
      setIsRewinding(false);
      
      // Seek without auto-playing (seek will resume if was playing, but we'll handle that)
      heartbeat.pause(); // Explicitly pause first
      heartbeat.currentIndex = Math.max(0, Math.min(rewindIndexRef.current, heartbeat.tokens.length - 1));
      heartbeat.notify();
      
      // Resume via conductor (handles state machine correctly)
      conductor.play();
      RSVPHapticEngine.impactMedium();
    }
  };

  // When rewinding state changes, ensure we update from heartbeat
  useEffect(() => {
    if (!isRewinding && currentIndex !== heartbeat.currentIndex) {
      setCurrentIndex(heartbeat.currentIndex);
    }
  }, [isRewinding]);

  // Notify parent when rewind state changes so UI can update
  useEffect(() => {
    onRewindStateChange?.(isRewinding);
  }, [isRewinding, onRewindStateChange]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  if (!focusToken) return null;

  // ORP calculation - Center of word for natural focal point
  // Centers each word on the reticle line, eye-friendly positioning
  const getORP = (text: string) => {
    return Math.floor(text.length / 2);  // Center letter of word
  };

  const orpIdx = getORP(focusToken.originalText);
  const leftPart = focusToken.originalText.slice(0, orpIdx);
  const orpChar = focusToken.originalText[orpIdx] || '';
  const rightPart = focusToken.originalText.slice(orpIdx + 1);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden touch-none"
      style={{ backgroundColor: theme.background }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      {/* Dark overlay for separation from scroll view */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: theme.background, opacity: 0.95 }}
      />

      {/* Vignette */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ 
          background: `radial-gradient(ellipse 80% 50% at ${RETICLE_POSITION}% 42%, transparent 0%, ${theme.background} 100%)`
        }}
      />

      {/* Reticle - Glows during rewind */}
      <div 
        className="absolute top-[20%] bottom-[20%] w-[2px] z-0 pointer-events-none transition-all duration-200"
        style={{ 
          left: `${RETICLE_POSITION}%`, 
          backgroundColor: FOCUS_COLOR, 
          opacity: isRewinding ? 0.6 : 0.15,
          boxShadow: isRewinding ? `0 0 30px ${FOCUS_COLOR}80` : 'none'
        }}
      />

      {/* WORD STREAM */}
      <div className="absolute inset-x-0 top-[42%] -translate-y-1/2 flex items-center justify-start overflow-visible z-20">
        {/* Edge fades - only when showing context */}
        {showContext && (
          <>
            <div 
              className="absolute left-0 top-[-50%] bottom-[-50%] w-32 z-30 pointer-events-none"
              style={{ background: `linear-gradient(to right, ${theme.background}, transparent)` }}
            />
            <div 
              className="absolute right-0 top-[-50%] bottom-[-50%] w-32 z-30 pointer-events-none"
              style={{ background: `linear-gradient(to left, ${theme.background}, transparent)` }}
            />
          </>
        )}

        {/* Word Ribbon */}
        <div
          ref={ribbonRef}
          className="flex items-baseline gap-5 whitespace-nowrap"
          style={{
            transform: `translateX(${ribbonOffset}px)`,
            transition: isRewinding ? 'transform 0.05s linear' : 'none',
            opacity: isRewinding ? 0.85 : 1
          }}
        >
          {streamTokens.map(({ token, globalIdx }) => {
            const isFocus = globalIdx === currentIndex;
            const distance = Math.abs(globalIdx - currentIndex);
            
            // Context word opacity
            const contextOpacity = Math.max(0.12, 0.55 - (distance * 0.1));
            
            if (isFocus) {
              return (
                <span
                  key={token.id}
                  data-idx={globalIdx}
                  className="inline-flex items-baseline font-sans font-semibold cursor-pointer transition-opacity hover:opacity-100"
                  style={{ fontSize: FONT_SIZE }}
                >
                  <span style={{ color: theme.primaryText }}>{leftPart}</span>
                  <span style={{ color: FOCUS_COLOR, textShadow: isRewinding ? `0 0 10px ${FOCUS_COLOR}60` : `0 0 20px ${FOCUS_COLOR}40` }}>{orpChar}</span>
                  <span style={{ color: theme.primaryText }}>{rightPart}</span>
                  {token.punctuation && (
                    <span style={{ color: theme.secondaryText, opacity: 0.5, marginLeft: '1px' }}>
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
                className="font-sans cursor-pointer transition-opacity hover:opacity-100"
                style={{
                  fontSize: FONT_SIZE,
                  fontWeight: 400,
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
    </div>
  );
};
