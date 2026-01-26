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
      
      // Calculate the pixel position of the focus letter (center character).
      // Default to the visual center as a fallback.
      let focusLetterPos = left + rect.width / 2;

      // If this is the focus word, measure the exact substring widths in-DOM
      // to account for font kerning, ligatures and browser layout.
      if (idx === currentIndex && focusToken) {
        try {
          const text = focusToken.originalText || '';
          const focusCharIdx = Math.max(0, Math.min(text.length - 1, Math.floor(text.length / 2)));

          // Create a hidden measurement span that uses the same font as the word
          const measureSpan = document.createElement('span');
          measureSpan.style.visibility = 'hidden';
          measureSpan.style.position = 'absolute';
          measureSpan.style.whiteSpace = 'nowrap';
          // inherit computed font to match rendering exactly
          measureSpan.style.font = window.getComputedStyle(child).font || '';

          // Measure width up to (and including) the focus character, and up to the focus char (exclusive)
          // This yields the character width as difference, which works reliably for variable-width fonts.
          measureSpan.textContent = text.substring(0, focusCharIdx + 1);
          child.appendChild(measureSpan);
          const uptoInclusive = measureSpan.getBoundingClientRect().width;
          child.removeChild(measureSpan);

          measureSpan.textContent = text.substring(0, focusCharIdx);
          child.appendChild(measureSpan);
          const uptoExclusive = measureSpan.getBoundingClientRect().width;
          child.removeChild(measureSpan);

          const charWidth = Math.max(0, uptoInclusive - uptoExclusive);
          const centerOffset = uptoExclusive + charWidth / 2;

          // final position relative to ribbon left
          focusLetterPos = left + centerOffset;
        } catch (e) {
          // fallback to center if anything goes wrong
          focusLetterPos = left + rect.width / 2;
        }
      }

      wordPositions.current.set(idx, { left, width: rect.width, center: focusLetterPos });
    });
    
    const activePos = wordPositions.current.get(currentIndex);
    if (activePos) {
      // Align the focus letter position with the reticle
      const delta = reticleX - activePos.center;

      // Expose a CSS variable and dev-only debug output so we can fine-tune visually
      try {
        document.documentElement.style.setProperty('--rsvp-center-delta', `${delta.toFixed(2)}px`);
        // Only noisy in development
        // Debug output removed for production safety
      } catch (e) {
        /* ignore */
      }

      setRibbonOffset(delta);
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

  // Clean, unified tap/hold: tap toggles pause/play, hold rewinds, tap-through on pause exits RSVP
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);

    // If paused, any tap exits RSVP (return to scroll view)
    if (!isPlaying) {
      onLongPressExit?.();
      return;
    }

    // Hold to rewind
    pointerStart.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    };
    holdTimerRef.current = setTimeout(() => {
      setIsRewinding(true);
      RSVPHapticEngine.impactLight();
      rewindIndexRef.current = currentIndex;
      conductor.pause();
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
      // If pointer up before hold threshold, treat as tap: toggle pause/play
      if (isPlaying) {
        if (conductor.state === RSVPState.PLAYING) {
          conductor.pause(true);
        } else {
          conductor.play();
        }
      }
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
      // Use public method to trigger update if available
      if (typeof heartbeat['subscribe'] === 'function') {
        // Hack: force update by seeking to current index
        heartbeat.seek(heartbeat.currentIndex);
      }
      
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
      {/* Faded background text visible on pause, tap-through to exit RSVP */}
      {!isPlaying && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-auto" style={{ opacity: 0.18, fontSize: '2.5rem', color: theme.primaryText, userSelect: 'none' }}>
          <span>{tokens.slice(Math.max(0, currentIndex - 20), currentIndex + 20).map(t => t.originalText).join(' ')}</span>
        </div>
      )}
      {/* ...existing code for vignette, reticle, word stream... */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: theme.background, opacity: 0.95 }}
      />
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 50% at ${RETICLE_POSITION}% 42%, transparent 0%, ${theme.background} 100%)` }}
      />
      <div 
        className="absolute top-[20%] bottom-[20%] w-[2px] z-0 pointer-events-none transition-all duration-200"
        style={{ 
          left: `${RETICLE_POSITION}%`, 
          backgroundColor: FOCUS_COLOR, 
          opacity: isRewinding ? 0.6 : 0.15,
          boxShadow: isRewinding ? `0 0 30px ${FOCUS_COLOR}80` : 'none'
        }}
      />
      <div className="absolute inset-x-0 top-[42%] -translate-y-1/2 flex items-center justify-start overflow-visible z-20">
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
