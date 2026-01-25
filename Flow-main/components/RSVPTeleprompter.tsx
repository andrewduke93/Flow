import React, { useEffect, useState, useRef, useMemo, useLayoutEffect } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { RSVPLens } from './RSVPLens';

interface RSVPTeleprompterProps {
  /** Callback when user taps (play/pause) */
  onTap?: () => void;
  /** Callback when scrub gesture ends */
  onScrubEnd?: (finalIndex: number) => void;
}

/**
 * RSVPTeleprompter (Unified Focus + Cursor Scrubbing)
 * 
 * Uses RSVPLens for the focus word display, adds cursor scrubbing overlay.
 * 
 * Gesture model:
 * - TAP: Play/Pause toggle
 * - PRESS+HOLD: Reveal surrounding words inline (cursor mode)
 * - HOLD+SWIPE: Scrub through words like mobile text cursor
 * - RELEASE: Commit to selected position
 */
export const RSVPTeleprompter: React.FC<RSVPTeleprompterProps> = ({
  onTap,
  onScrubEnd
}) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  
  // Core state - mirrors RSVPStageView approach
  const [currentToken, setCurrentToken] = useState<RSVPToken | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const lastIndexRef = useRef<number>(-1);
  
  // Cursor/Scrub state
  const [isCursorActive, setIsCursorActive] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [ribbonOffset, setRibbonOffset] = useState(0);
  
  // Gesture tracking
  const pointerStart = useRef({ x: 0, y: 0, time: 0, index: 0, offset: 0 });
  const lastHapticIndex = useRef(-1);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  
  // Configuration
  const HOLD_THRESHOLD_MS = 200;
  const TAP_THRESHOLD_PX = 12;
  const VISIBLE_WORDS = 12;
  
  // Word position cache
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());

  const FOCUS_COLOR = '#E25822';
  const RETICLE_POSITION = 35.5;

  // Sync with heartbeat - using same pattern as RSVPStageView
  useEffect(() => {
    setCurrentToken(heartbeat.currentToken);
    setTokens(heartbeat.tokens);
    lastIndexRef.current = heartbeat.currentIndex;
    setCurrentIndex(heartbeat.currentIndex);

    let rafId: number | null = null;
    let pendingUpdate = false;
    
    const sync = () => {
      const idx = heartbeat.currentIndex;
      if (idx !== lastIndexRef.current || heartbeat.tokens !== tokens) {
        if (!pendingUpdate) {
          pendingUpdate = true;
          rafId = requestAnimationFrame(() => {
            lastIndexRef.current = idx;
            setCurrentToken(heartbeat.currentToken);
            setTokens(heartbeat.tokens);
            if (!isCursorActive) {
              setCurrentIndex(idx);
            }
            pendingUpdate = false;
          });
        }
      }
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    
    return () => { 
      unsubC(); 
      unsubH();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isCursorActive]);

  // Display token - use scrubbed token if scrubbing, otherwise current
  const displayToken = useMemo(() => {
    if (scrubIndex !== null && tokens[scrubIndex]) {
      return tokens[scrubIndex];
    }
    return currentToken;
  }, [currentToken, tokens, scrubIndex]);

  const activeIndex = scrubIndex ?? currentIndex;

  // Context tokens for cursor mode
  const cursorTokens = useMemo(() => {
    if (!isCursorActive || tokens.length === 0) return { tokens: [], startIdx: 0 };
    const start = Math.max(0, activeIndex - VISIBLE_WORDS);
    const end = Math.min(tokens.length - 1, activeIndex + VISIBLE_WORDS);
    return { 
      tokens: tokens.slice(start, end + 1),
      startIdx: start
    };
  }, [tokens, activeIndex, isCursorActive]);

  // Center ribbon on active word
  useLayoutEffect(() => {
    if (!ribbonRef.current || !isCursorActive || isDragging.current) return;
    
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
      const width = rect.width;
      const center = left + width / 2;
      wordPositions.current.set(idx, { left, width, center });
    });
    
    const activePos = wordPositions.current.get(activeIndex);
    if (activePos) {
      setRibbonOffset(reticleX - activePos.center);
    }
  }, [cursorTokens, activeIndex, isCursorActive]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // GESTURE HANDLERS
  // ═══════════════════════════════════════════════════════════════════

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    
    pointerStart.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      index: currentIndex,
      offset: ribbonOffset
    };
    isDragging.current = false;
    
    // Start hold timer
    holdTimerRef.current = setTimeout(() => {
      setIsCursorActive(true);
      setScrubIndex(currentIndex);
      RSVPHapticEngine.impactMedium();
      
      if (conductor.state === RSVPState.PLAYING) {
        conductor.pause(true);
      }
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - pointerStart.current.x;
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    
    // Cancel hold if moved too much before threshold
    if (!isCursorActive && (Math.abs(dx) > TAP_THRESHOLD_PX || dy > 30)) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
    
    // Handle scrubbing in cursor mode
    if (isCursorActive) {
      isDragging.current = true;
      
      const newOffset = pointerStart.current.offset + dx;
      setRibbonOffset(newOffset);
      
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const reticleX = containerWidth * (RETICLE_POSITION / 100);
      
      let closestIdx = scrubIndex ?? currentIndex;
      let closestDist = Infinity;
      
      wordPositions.current.forEach((pos, idx) => {
        const wordScreenCenter = pos.center + newOffset;
        const dist = Math.abs(wordScreenCenter - reticleX);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });
      
      if (closestIdx !== scrubIndex) {
        setScrubIndex(closestIdx);
        if (closestIdx !== lastHapticIndex.current) {
          RSVPHapticEngine.impactLight();
          lastHapticIndex.current = closestIdx;
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const elapsed = Date.now() - pointerStart.current.time;
    
    if (isCursorActive) {
      // Commit position
      const finalIndex = scrubIndex ?? currentIndex;
      heartbeat.seek(finalIndex);
      setCurrentIndex(finalIndex);
      onScrubEnd?.(finalIndex);
      RSVPHapticEngine.impactMedium();
      
      // Snap ribbon
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const reticleX = containerWidth * (RETICLE_POSITION / 100);
      const activePos = wordPositions.current.get(finalIndex);
      if (activePos) {
        setRibbonOffset(reticleX - activePos.center);
      }
      
      setIsCursorActive(false);
      setScrubIndex(null);
      isDragging.current = false;
    } else if (dx < TAP_THRESHOLD_PX && elapsed < HOLD_THRESHOLD_MS) {
      // TAP
      onTap?.();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    if (isCursorActive) {
      heartbeat.seek(pointerStart.current.index);
      setCurrentIndex(pointerStart.current.index);
    }
    
    setIsCursorActive(false);
    setScrubIndex(null);
    isDragging.current = false;
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  const fluidFontSize = "clamp(3rem, 13vw, 5rem)";

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      {/* Use existing RSVPLens for the focus word - proven to work */}
      <RSVPLens token={displayToken} />

      {/* CURSOR MODE OVERLAY - Context words ribbon */}
      {isCursorActive && cursorTokens.tokens.length > 0 && (
        <div 
          className="absolute inset-x-0 top-[42%] -translate-y-1/2 h-20 flex items-center overflow-hidden z-[100] pointer-events-none"
          style={{ animation: 'cursorFadeIn 0.12s ease-out' }}
        >
          {/* Gradient fade edges */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-32 z-10"
            style={{ background: `linear-gradient(to right, ${theme.background}, transparent)` }}
          />
          <div 
            className="absolute right-0 top-0 bottom-0 w-32 z-10"
            style={{ background: `linear-gradient(to left, ${theme.background}, transparent)` }}
          />

          {/* Cursor indicator line */}
          <div 
            className="absolute top-0 bottom-0 w-[2px] z-20"
            style={{ 
              left: `${RETICLE_POSITION}%`,
              transform: 'translateX(-50%)',
              backgroundColor: FOCUS_COLOR,
              opacity: 0.6
            }}
          />

          {/* Words ribbon */}
          <div
            ref={ribbonRef}
            className="flex items-center gap-3 whitespace-nowrap"
            style={{
              transform: `translateX(${ribbonOffset}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0, 0, 1)'
            }}
          >
            {cursorTokens.tokens.map((token, i) => {
              const globalIdx = cursorTokens.startIdx + i;
              const isActive = globalIdx === activeIndex;
              const distance = Math.abs(globalIdx - activeIndex);
              
              // Active word faded (shown by RSVPLens above)
              const opacity = isActive ? 0.15 : Math.max(0.15, 0.7 - (distance * 0.06));
              const scale = Math.max(0.85, 1 - (distance * 0.02));
              
              return (
                <span
                  key={token.id}
                  data-idx={globalIdx}
                  className="font-sans inline-block"
                  style={{
                    fontSize: `calc(${fluidFontSize} * 0.42)`,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? FOCUS_COLOR : theme.primaryText,
                    opacity,
                    transform: `scale(${scale})`,
                    transition: 'opacity 0.05s'
                  }}
                >
                  {token.originalText}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Position indicator HUD */}
      {isCursorActive && (
        <div 
          className="absolute bottom-[32%] left-0 right-0 flex justify-center z-[101] pointer-events-none"
          style={{ animation: 'cursorFadeIn 0.15s ease-out' }}
        >
          <div 
            className="px-4 py-1.5 rounded-full backdrop-blur-md border"
            style={{ 
              backgroundColor: `${theme.surface}dd`,
              borderColor: theme.borderColor
            }}
          >
            <span 
              className="text-xs font-mono tabular-nums"
              style={{ color: theme.secondaryText }}
            >
              {activeIndex + 1} / {tokens.length}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes cursorFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
