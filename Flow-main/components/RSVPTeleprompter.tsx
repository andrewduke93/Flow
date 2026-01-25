import React, { useEffect, useState, useRef, useMemo, useLayoutEffect } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface RSVPTeleprompterProps {
  /** Callback when user taps (play/pause) */
  onTap?: () => void;
  /** Callback when scrub gesture ends */
  onScrubEnd?: (finalIndex: number) => void;
}

/**
 * RSVPTeleprompter (Unified Focus + Cursor Scrubbing)
 * 
 * Single unified component with one gesture model:
 * - TAP: Play/Pause toggle
 * - PRESS+HOLD: Reveal surrounding words inline (cursor mode)
 * - HOLD+SWIPE: Scrub through words like mobile text cursor
 * - RELEASE: Commit to selected position
 * 
 * Philosophy: The focus word is always center stage. Context words
 * materialize around it only when the user actively requests them
 * via press-and-hold gesture.
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
  
  // Core state
  const [currentToken, setCurrentToken] = useState<RSVPToken | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Cursor/Scrub state
  const [isCursorActive, setIsCursorActive] = useState(false); // Press-and-hold active
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [ribbonOffset, setRibbonOffset] = useState(0);
  
  // Gesture tracking
  const pointerStart = useRef({ x: 0, y: 0, time: 0, index: 0, offset: 0 });
  const lastHapticIndex = useRef(-1);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const isDragging = useRef(false);
  
  // Configuration
  const HOLD_THRESHOLD_MS = 180; // Time to trigger cursor mode
  const TAP_THRESHOLD_PX = 10; // Movement threshold for tap vs drag
  const VISIBLE_WORDS = 12; // Words before/after in cursor mode
  
  // Word position cache for cursor mode
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());

  // Constants
  const FOCUS_COLOR = '#E25822';
  const RETICLE_POSITION = 35.5; // % from left - ORP alignment

  // Sync with conductor/heartbeat
  useEffect(() => {
    const sync = () => {
      const playing = conductor.state === RSVPState.PLAYING;
      setIsPlaying(playing);
      setTokens(heartbeat.tokens);
      setCurrentToken(heartbeat.currentToken);
      
      if (!isCursorActive) {
        setCurrentIndex(heartbeat.currentIndex);
        setScrubIndex(null);
      }
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    sync();

    return () => {
      unsubC();
      unsubH();
    };
  }, [isCursorActive]);

  // Active token (current or scrubbed)
  const activeToken = useMemo(() => {
    if (scrubIndex !== null && tokens[scrubIndex]) {
      return tokens[scrubIndex];
    }
    return currentToken;
  }, [currentToken, tokens, scrubIndex]);

  const activeIndex = scrubIndex ?? currentIndex;

  // Context tokens for cursor mode (surrounding words)
  const cursorTokens = useMemo(() => {
    if (!isCursorActive || tokens.length === 0) return { tokens: [], startIdx: 0 };
    const start = Math.max(0, activeIndex - VISIBLE_WORDS);
    const end = Math.min(tokens.length - 1, activeIndex + VISIBLE_WORDS);
    return { 
      tokens: tokens.slice(start, end + 1),
      startIdx: start
    };
  }, [tokens, activeIndex, isCursorActive]);

  // Scale factor for long words
  const focusScale = useMemo(() => {
    if (!activeToken) return 1;
    const len = activeToken.originalText.length;
    if (len <= 10) return 1;
    return Math.max(0.6, 10 / len);
  }, [activeToken]);

  // Center ribbon on active word in cursor mode
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // GESTURE HANDLERS - Unified tap/hold/swipe
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
    wasPlayingRef.current = conductor.state === RSVPState.PLAYING;
    
    // Start hold timer for cursor mode
    holdTimerRef.current = setTimeout(() => {
      // Activate cursor mode
      setIsCursorActive(true);
      setScrubIndex(currentIndex);
      RSVPHapticEngine.impactMedium();
      
      // Pause playback when entering cursor mode
      if (conductor.state === RSVPState.PLAYING) {
        conductor.pause(true);
      }
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - pointerStart.current.x;
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    
    // Cancel hold timer if user moves too much before threshold
    if (!isCursorActive && (Math.abs(dx) > TAP_THRESHOLD_PX || dy > 30)) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
    
    // If cursor mode is active, handle scrubbing
    if (isCursorActive) {
      isDragging.current = true;
      
      // Update ribbon offset based on drag
      const newOffset = pointerStart.current.offset + dx;
      setRibbonOffset(newOffset);
      
      // Find word under reticle
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
    
    // Clear hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const elapsed = Date.now() - pointerStart.current.time;
    
    if (isCursorActive) {
      // Commit scrub position
      const finalIndex = scrubIndex ?? currentIndex;
      heartbeat.seek(finalIndex);
      setCurrentIndex(finalIndex);
      onScrubEnd?.(finalIndex);
      RSVPHapticEngine.impactMedium();
      
      // Snap ribbon to final position
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const reticleX = containerWidth * (RETICLE_POSITION / 100);
      const activePos = wordPositions.current.get(finalIndex);
      if (activePos) {
        setRibbonOffset(reticleX - activePos.center);
      }
      
      // Exit cursor mode
      setIsCursorActive(false);
      setScrubIndex(null);
      isDragging.current = false;
      
      // Resume if was playing (optional - could leave paused for review)
      // Leaving paused feels better for precision scrubbing
    } else if (dx < TAP_THRESHOLD_PX && elapsed < HOLD_THRESHOLD_MS) {
      // TAP - toggle play/pause
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
      // Revert to original position
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

  if (!activeToken) return null;

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
      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 1: SOFT VIGNETTE (Focus tunnel)
          ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ 
          background: `radial-gradient(ellipse 80% 60% at ${RETICLE_POSITION}% 42%, transparent 0%, ${theme.background}dd 70%, ${theme.background} 100%)` 
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 2: RETICLE (Optical axis marker)
          ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className="absolute top-0 bottom-0 w-[1px] z-0 pointer-events-none" 
        style={{ 
          left: `${RETICLE_POSITION}%`,
          backgroundColor: FOCUS_COLOR, 
          opacity: isCursorActive ? 0.4 : 0.15 
        }}
      >
        <div 
          className="absolute top-[20%] bottom-[20%] w-[1px]" 
          style={{ backgroundColor: FOCUS_COLOR, opacity: 0.3 }} 
        />
        <div 
          className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[30px] rounded-full transition-all duration-200" 
          style={{ 
            backgroundColor: FOCUS_COLOR, 
            opacity: isCursorActive ? 0.8 : 0.5,
            height: isCursorActive ? 50 : 30
          }} 
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 3: CURSOR MODE - Context words ribbon (inline with focus)
          Shows surrounding words when press-and-hold is active
          ═══════════════════════════════════════════════════════════════════ */}
      {isCursorActive && cursorTokens.tokens.length > 0 && (
        <div 
          className="absolute inset-x-0 top-[42%] -translate-y-1/2 h-20 flex items-center overflow-hidden z-15 pointer-events-none"
          style={{
            opacity: 1,
            animation: 'cursorFadeIn 0.15s ease-out'
          }}
        >
          {/* Gradient fade edges */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to right, ${theme.background}, transparent)` }}
          />
          <div 
            className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to left, ${theme.background}, transparent)` }}
          />

          {/* Words ribbon */}
          <div
            ref={ribbonRef}
            className="flex items-center gap-3 whitespace-nowrap"
            style={{
              transform: `translateX(${ribbonOffset}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)'
            }}
          >
            {cursorTokens.tokens.map((token, i) => {
              const globalIdx = cursorTokens.startIdx + i;
              const isActive = globalIdx === activeIndex;
              const distance = Math.abs(globalIdx - activeIndex);
              
              // Active word is invisible here (shown as main focus word)
              // Nearby words are more visible, far words fade out
              const opacity = isActive ? 0 : Math.max(0.12, 0.7 - (distance * 0.06));
              const scale = isActive ? 0 : Math.max(0.85, 1 - (distance * 0.015));
              
              return (
                <span
                  key={token.id}
                  data-idx={globalIdx}
                  className="font-sans inline-block transition-opacity duration-75"
                  style={{
                    fontSize: `calc(${fluidFontSize} * 0.45)`,
                    fontWeight: 400,
                    color: theme.primaryText,
                    opacity,
                    transform: `scale(${scale})`
                  }}
                >
                  {token.originalText}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 4: FOCUS WORD (ORP-aligned, always visible)
          The star of the show - center character aligned to reticle
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="absolute top-[42%] z-20 pointer-events-none"
        style={{ 
          left: `${RETICLE_POSITION}%`,
          transform: `translateY(-50%) scale(${focusScale})`,
          willChange: 'transform',
        }}
      >
        <span 
          className="relative inline-block font-sans font-semibold leading-none whitespace-nowrap transform -translate-x-1/2"
          style={{ 
            fontSize: fluidFontSize,
            color: FOCUS_COLOR,
            textShadow: isCursorActive ? `0 0 20px ${FOCUS_COLOR}40` : `0 0 10px ${FOCUS_COLOR}15`
          }}
        >
          {/* ORP Character (center pivot) */}
          {activeToken.centerCharacter}
          
          {/* Left segment */}
          <span 
            className="absolute right-[100%] top-0 h-full flex items-center justify-end font-normal pr-[2px]"
            style={{ color: theme.primaryText }} 
          >
            {activeToken.leftSegment}
          </span>

          {/* Right segment + punctuation */}
          <span 
            className="absolute left-[100%] top-0 h-full flex items-center justify-start font-normal pl-[2px]"
            style={{ color: theme.primaryText }}
          >
            {activeToken.rightSegment}
            {activeToken.punctuation && (
              <span className="font-light opacity-60 ml-[2px]" style={{ color: theme.secondaryText }}>
                {activeToken.punctuation}
              </span>
            )}
          </span>
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 5: CURSOR MODE HUD (Position indicator)
          ═══════════════════════════════════════════════════════════════════ */}
      {isCursorActive && (
        <div 
          className="absolute bottom-[35%] left-0 right-0 flex justify-center z-30 pointer-events-none"
          style={{ animation: 'cursorFadeIn 0.2s ease-out' }}
        >
          <div 
            className="px-4 py-1.5 rounded-full backdrop-blur-md border"
            style={{ 
              backgroundColor: `${theme.surface}cc`,
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

      {/* Animations */}
      <style>{`
        @keyframes cursorFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
