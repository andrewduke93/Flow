import React, { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface RSVPTeleprompterProps {
  /** When true, show ghost preview words during playback */
  showGhostPreview?: boolean;
  /** Number of ghost words to show ahead */
  ghostWordCount?: number;
  /** Callback when user taps a word while paused */
  onWordSelect?: (index: number) => void;
  /** Callback when scrub gesture starts */
  onScrubStart?: () => void;
  /** Callback when scrub gesture ends */
  onScrubEnd?: (finalIndex: number) => void;
}

/**
 * RSVPTeleprompter (Unified Focus + Context View)
 * 
 * A single unified component that displays:
 * 1. The ORP-aligned focus word (always visible)
 * 2. Ghost preview words during playback (teleprompter mode)
 * 3. Full word ribbon when paused (tap/drag to navigate)
 * 
 * Philosophy: The focus word is the star; surrounding words are supporting cast
 * that fade in/out based on playback state.
 */
export const RSVPTeleprompter: React.FC<RSVPTeleprompterProps> = ({
  showGhostPreview = true,
  ghostWordCount = 4,
  onWordSelect,
  onScrubStart,
  onScrubEnd
}) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  
  // Core state
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Scrub state
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [ribbonOffset, setRibbonOffset] = useState(0);
  
  // Gesture tracking
  const pointerStart = useRef({ x: 0, y: 0, index: 0, offset: 0 });
  const lastHapticIndex = useRef(-1);
  const holdStartTime = useRef(0);
  
  // Configuration
  const VISIBLE_WORDS_PAUSED = 15; // Words before/after when paused
  const TAP_THRESHOLD_MS = 180;
  const TAP_THRESHOLD_PX = 8;
  
  // Word position cache
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());

  // Constants
  const FOCUS_COLOR = '#E25822';
  const RETICLE_POSITION = 35.5; // % from left

  // Sync with conductor/heartbeat
  useEffect(() => {
    const sync = () => {
      const playing = conductor.state === RSVPState.PLAYING;
      const paused = conductor.state === RSVPState.PAUSED && heartbeat.tokens.length > 0;
      
      setIsPlaying(playing);
      setIsPaused(paused);
      setTokens(heartbeat.tokens);
      
      if (!isScrubbing) {
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
  }, [isScrubbing]);

  // Current token
  const currentToken = useMemo(() => {
    const idx = scrubIndex ?? currentIndex;
    return tokens[idx] ?? null;
  }, [tokens, currentIndex, scrubIndex]);

  // Ghost preview tokens (next N words)
  const ghostTokens = useMemo(() => {
    if (!showGhostPreview || !isPlaying) return [];
    const startIdx = currentIndex + 1;
    const endIdx = Math.min(tokens.length, startIdx + ghostWordCount);
    return tokens.slice(startIdx, endIdx);
  }, [tokens, currentIndex, showGhostPreview, isPlaying, ghostWordCount]);

  // Paused context tokens (surrounding words for scrubbing)
  const pausedTokens = useMemo(() => {
    if (!isPaused) return [];
    const activeIdx = scrubIndex ?? currentIndex;
    const start = Math.max(0, activeIdx - VISIBLE_WORDS_PAUSED);
    const end = Math.min(tokens.length - 1, activeIdx + VISIBLE_WORDS_PAUSED);
    return { 
      tokens: tokens.slice(start, end + 1),
      startIdx: start,
      activeIdx 
    };
  }, [tokens, currentIndex, scrubIndex, isPaused]);

  // Scale factor for long words
  const focusScale = useMemo(() => {
    if (!currentToken) return 1;
    const len = currentToken.originalText.length;
    if (len <= 10) return 1;
    return Math.max(0.6, 10 / len);
  }, [currentToken]);

  // Center ribbon on active word when paused
  useLayoutEffect(() => {
    if (!ribbonRef.current || !isPaused || isScrubbing) return;
    
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
    
    const activeIdx = scrubIndex ?? currentIndex;
    const activePos = wordPositions.current.get(activeIdx);
    if (activePos) {
      setRibbonOffset(reticleX - activePos.center);
    }
  }, [pausedTokens, currentIndex, scrubIndex, isPaused, isScrubbing]);

  // Get word index at screen position
  const getIndexAtPosition = useCallback((clientX: number): number => {
    if (!containerRef.current || !ribbonRef.current) return currentIndex;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const localX = clientX - containerRect.left - ribbonOffset;
    
    let closestIdx = scrubIndex ?? currentIndex;
    let closestDist = Infinity;
    
    wordPositions.current.forEach((pos, idx) => {
      const dist = Math.abs(pos.center - localX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });
    
    return closestIdx;
  }, [currentIndex, scrubIndex, ribbonOffset]);

  // Pointer handlers for paused scrubbing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isPaused) return;
    
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    
    pointerStart.current = {
      x: e.clientX,
      y: e.clientY,
      index: getIndexAtPosition(e.clientX),
      offset: ribbonOffset
    };
    holdStartTime.current = Date.now();
    lastHapticIndex.current = -1;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPaused) return;
    
    const dx = e.clientX - pointerStart.current.x;
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    const elapsed = Date.now() - holdStartTime.current;
    
    if (dy > 30 && Math.abs(dx) < 20) {
      handlePointerCancel(e);
      return;
    }
    
    if (!isScrubbing && (Math.abs(dx) > TAP_THRESHOLD_PX || elapsed > TAP_THRESHOLD_MS)) {
      setIsScrubbing(true);
      onScrubStart?.();
    }
    
    if (isScrubbing) {
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
    if (!isPaused) return;
    
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const elapsed = Date.now() - holdStartTime.current;
    
    if (isScrubbing) {
      const finalIndex = scrubIndex ?? currentIndex;
      heartbeat.seek(finalIndex);
      setCurrentIndex(finalIndex);
      onScrubEnd?.(finalIndex);
      RSVPHapticEngine.impactMedium();
      
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const reticleX = containerWidth * (RETICLE_POSITION / 100);
      const activePos = wordPositions.current.get(finalIndex);
      if (activePos) {
        setRibbonOffset(reticleX - activePos.center);
      }
    } else if (dx < TAP_THRESHOLD_PX && elapsed < TAP_THRESHOLD_MS) {
      const tappedIndex = getIndexAtPosition(e.clientX);
      heartbeat.seek(tappedIndex);
      setCurrentIndex(tappedIndex);
      onWordSelect?.(tappedIndex);
      RSVPHapticEngine.impactMedium();
    }
    
    setIsScrubbing(false);
    setScrubIndex(null);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setIsScrubbing(false);
    setScrubIndex(null);
    
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const reticleX = containerWidth * (RETICLE_POSITION / 100);
    const activePos = wordPositions.current.get(currentIndex);
    if (activePos) {
      setRibbonOffset(reticleX - activePos.center);
    }
  };

  if (tokens.length === 0) return null;

  const activeIdx = scrubIndex ?? currentIndex;
  const fluidFontSize = "clamp(3rem, 13vw, 5rem)";

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
    >
      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 1: SOFT VIGNETTE (Focus tunnel)
          ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className="absolute inset-0 z-10"
        style={{ 
          background: `radial-gradient(circle at ${RETICLE_POSITION}% 42%, transparent 20%, ${theme.background} 85%)` 
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 2: RETICLE (Optical axis marker)
          ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className="absolute top-0 bottom-0 w-[1px] z-0" 
        style={{ 
          left: `${RETICLE_POSITION}%`,
          backgroundColor: FOCUS_COLOR, 
          opacity: 0.15 
        }}
      >
        <div 
          className="absolute top-[20%] bottom-[20%] w-[1px]" 
          style={{ backgroundColor: FOCUS_COLOR, opacity: 0.3 }} 
        />
        <div 
          className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[30px] rounded-full" 
          style={{ backgroundColor: FOCUS_COLOR, opacity: 0.5 }} 
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 3: GHOST PREVIEW (Teleprompter - during playback)
          Shows upcoming words faintly to the right
          ═══════════════════════════════════════════════════════════════════ */}
      {isPlaying && showGhostPreview && ghostTokens.length > 0 && (
        <div 
          className="absolute top-[42%] -translate-y-1/2 flex items-center gap-4 z-5"
          style={{ 
            left: `calc(${RETICLE_POSITION}% + 4rem)`,
            transform: 'translateY(-50%)'
          }}
        >
          {ghostTokens.map((token, i) => {
            const opacity = Math.max(0.08, 0.3 - (i * 0.06));
            const scale = Math.max(0.7, 0.9 - (i * 0.05));
            return (
              <span
                key={token.id}
                className="font-sans font-normal whitespace-nowrap"
                style={{
                  fontSize: `calc(${fluidFontSize} * 0.5)`,
                  color: theme.primaryText,
                  opacity,
                  transform: `scale(${scale})`,
                  transition: 'opacity 0.15s ease-out'
                }}
              >
                {token.originalText}
              </span>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 4: FOCUS WORD (ORP-aligned, always visible)
          ═══════════════════════════════════════════════════════════════════ */}
      {currentToken && (
        <div
          className="absolute top-[42%] z-20"
          style={{ 
            left: `${RETICLE_POSITION}%`,
            transform: `translateY(-50%) scale(${focusScale})`,
            willChange: 'transform, opacity',
          }}
        >
          <span 
            className="relative inline-block font-sans font-semibold leading-none whitespace-nowrap transform -translate-x-1/2"
            style={{ 
              fontSize: fluidFontSize,
              color: FOCUS_COLOR,
              textShadow: `0 0 10px ${FOCUS_COLOR}15`
            }}
          >
            {/* ORP Character (center pivot) */}
            {currentToken.centerCharacter}
            
            {/* Left segment */}
            <span 
              className="absolute right-[100%] top-0 h-full flex items-center justify-end font-normal pr-[2px]"
              style={{ color: theme.primaryText }} 
            >
              {currentToken.leftSegment}
            </span>

            {/* Right segment + punctuation */}
            <span 
              className="absolute left-[100%] top-0 h-full flex items-center justify-start font-normal pl-[2px]"
              style={{ color: theme.primaryText }}
            >
              {currentToken.rightSegment}
              {currentToken.punctuation && (
                <span className="font-light opacity-60 ml-[2px]" style={{ color: theme.secondaryText }}>
                  {currentToken.punctuation}
                </span>
              )}
            </span>
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LAYER 5: PAUSED CONTEXT RIBBON (Scrubbing interface)
          Surrounding words for navigation when paused
          ═══════════════════════════════════════════════════════════════════ */}
      {isPaused && pausedTokens.tokens.length > 0 && (
        <div 
          className="absolute inset-x-0 top-[58%] h-16 flex items-center overflow-hidden z-30 touch-none select-none pointer-events-auto"
          style={{
            opacity: 1,
            transition: 'opacity 0.3s ease-out'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
        >
          {/* Gradient fade edges */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to right, ${theme.background}, transparent)` }}
          />
          <div 
            className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to left, ${theme.background}, transparent)` }}
          />

          {/* Center indicator aligned with reticle */}
          <div 
            className="absolute top-0 bottom-0 w-[2px] z-5 pointer-events-none"
            style={{ 
              left: `${RETICLE_POSITION}%`,
              transform: 'translateX(-50%)',
              backgroundColor: FOCUS_COLOR,
              opacity: 0.25
            }}
          />

          {/* Words ribbon */}
          <div
            ref={ribbonRef}
            className="flex items-center gap-4 whitespace-nowrap"
            style={{
              transform: `translateX(${ribbonOffset}px)`,
              transition: isScrubbing ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
            }}
          >
            {pausedTokens.tokens.map((token, i) => {
              const globalIdx = pausedTokens.startIdx + i;
              const isActive = globalIdx === activeIdx;
              const distance = Math.abs(globalIdx - activeIdx);
              const opacity = isActive ? 0 : Math.max(0.15, 0.8 - (distance * 0.08));
              
              return (
                <span
                  key={token.id}
                  data-idx={globalIdx}
                  className="font-sans inline-block"
                  style={{
                    fontSize: isActive ? '0' : '1rem', // Active word is hidden (shown in focus above)
                    fontWeight: 400,
                    color: theme.primaryText,
                    opacity,
                    transition: isScrubbing 
                      ? 'opacity 0.05s' 
                      : 'all 0.15s cubic-bezier(0.2, 0, 0, 1)'
                  }}
                >
                  {token.originalText}
                </span>
              );
            })}
          </div>

          {/* Word position indicator */}
          <div 
            className="absolute bottom-0 text-[10px] font-mono"
            style={{ 
              left: `${RETICLE_POSITION}%`,
              transform: 'translateX(-50%)',
              color: theme.secondaryText, 
              opacity: 0.35 
            }}
          >
            {activeIdx + 1} / {tokens.length}
          </div>
        </div>
      )}
    </div>
  );
};
