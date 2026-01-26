import React, { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { newRsvpEngine, mapRawToRSVPTokens } from '../services/newRsvpEngine';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPToken } from '../types';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface RSVPWordScrubberProps {
  onWordSelect?: (index: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (finalIndex: number) => void;
}

/**
 * RSVPWordScrubber (Phase 10: Contextual Word Navigation)
 * 
 * Identity: Interaction Designer / Kinetic Typography Specialist.
 * 
 * Mission: When RSVP is paused, display surrounding words in a scrollable ribbon.
 * - Tap a word → Jump to that word
 * - Hold + drag → Scrub through words like a cursor
 * 
 * The current/selected word is always centered and highlighted.
 */
export const RSVPWordScrubber: React.FC<RSVPWordScrubberProps> = ({
  onWordSelect,
  onScrubStart,
  onScrubEnd
}) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  
  // State
  const [isVisible, setIsVisible] = useState(false);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [ribbonOffset, setRibbonOffset] = useState(0);
  
  // Gesture tracking
  const pointerStart = useRef({ x: 0, y: 0, index: 0, offset: 0 });
  const lastHapticIndex = useRef(-1);
  
  // Configuration
  const VISIBLE_WORDS = 20; // Words before and after current
  const TAP_THRESHOLD_MS = 180;
  const TAP_THRESHOLD_PX = 8;
  const holdStartTime = useRef(0);

  // Measured word positions for accurate scrubbing
  const wordPositions = useRef<Map<number, { left: number, width: number, center: number }>>(new Map());

  // Sync with conductor/heartbeat
  useEffect(() => {
    const sync = () => {
      const isPaused = conductor.state === RSVPState.PAUSED;
      const hasTokens = heartbeat.tokens.length > 0;

      setIsVisible(isPaused && hasTokens);
      if (heartbeat.tokens.length > 0) setTokens(heartbeat.tokens);
      else {
        const raw = newRsvpEngine.getTokensRaw();
        if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, heartbeat.wpm));
      }

      // Only update currentIndex if not actively scrubbing
      if (!isScrubbing) {
        setCurrentIndex(heartbeat.currentIndex);
        setScrubIndex(null);
      }
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    const unsubNew = newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
      // Prefer new engine's playing state for visibility (paused => show scrubber)
      const isPausedFromEngine = !isPlaying;
      const hasTokens = heartbeat.tokens.length > 0 || !!token;
      setIsVisible(isPausedFromEngine && hasTokens);
      // Update tokens if heartbeat empty
      if (heartbeat.tokens.length === 0 && token) setTokens([token as any]);
      // Sync indices when not scrubbing
      if (!isScrubbing && typeof index === 'number') {
        setCurrentIndex(index);
        setScrubIndex(null);
      }
    });
    sync();

    return () => {
      unsubC();
      unsubH();
      unsubNew();
    };
  }, [isScrubbing]);

  // Compute visible word range
  const visibleRange = useMemo(() => {
    const activeIdx = scrubIndex ?? currentIndex;
    const start = Math.max(0, activeIdx - VISIBLE_WORDS);
    const end = Math.min(tokens.length - 1, activeIdx + VISIBLE_WORDS);
    return { start, end, activeIdx };
  }, [currentIndex, scrubIndex, tokens.length]);

  // Visible tokens slice
  const visibleTokens = useMemo(() => {
    if (tokens.length === 0) return [];
    return tokens.slice(visibleRange.start, visibleRange.end + 1);
  }, [tokens, visibleRange]);

  // Measure word positions after render
  useLayoutEffect(() => {
    if (!ribbonRef.current || !isVisible) return;
    
    const ribbon = ribbonRef.current;
    const children = Array.from(ribbon.children) as HTMLElement[];
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const containerCenter = containerWidth / 2;
    
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
    
    // Center the active word if not scrubbing
    if (!isScrubbing) {
      const activeIdx = scrubIndex ?? currentIndex;
      const activePos = wordPositions.current.get(activeIdx);
      if (activePos) {
        setRibbonOffset(containerCenter - activePos.center);
      }
    }
  }, [visibleTokens, currentIndex, scrubIndex, isVisible, isScrubbing]);

  // Calculate which word is under a given X position
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

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isVisible) return;
    
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
    if (!isVisible) return;
    
    const dx = e.clientX - pointerStart.current.x;
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    const elapsed = Date.now() - holdStartTime.current;
    
    // Cancel if vertical drag (user probably wants to scroll)
    if (dy > 30 && Math.abs(dx) < 20) {
      handlePointerCancel(e);
      return;
    }
    
    // Start scrubbing if dragged horizontally or held long enough
    if (!isScrubbing && (Math.abs(dx) > TAP_THRESHOLD_PX || elapsed > TAP_THRESHOLD_MS)) {
      setIsScrubbing(true);
      onScrubStart?.();
    }
    
    if (isScrubbing) {
      // Direct drag: move the ribbon with the finger
      const newOffset = pointerStart.current.offset + dx;
      setRibbonOffset(newOffset);
      
      // Find which word is now at center
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const containerCenter = containerWidth / 2;
      
      let closestIdx = scrubIndex ?? currentIndex;
      let closestDist = Infinity;
      
      wordPositions.current.forEach((pos, idx) => {
        const wordScreenCenter = pos.center + newOffset;
        const dist = Math.abs(wordScreenCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });
      
      if (closestIdx !== scrubIndex) {
        setScrubIndex(closestIdx);
        
        // Haptic feedback on word change
        if (closestIdx !== lastHapticIndex.current) {
          RSVPHapticEngine.impactLight();
          lastHapticIndex.current = closestIdx;
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isVisible) return;
    
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const elapsed = Date.now() - holdStartTime.current;
    
    if (isScrubbing) {
      // End scrub - commit the selection and snap to center
      const finalIndex = scrubIndex ?? currentIndex;
      try { newRsvpEngine.seek(finalIndex); } catch (e) { heartbeat.seek(finalIndex); }
      setCurrentIndex(finalIndex);
      onScrubEnd?.(finalIndex);
      RSVPHapticEngine.impactMedium();
      
      // Snap the selected word to center
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const containerCenter = containerWidth / 2;
      const activePos = wordPositions.current.get(finalIndex);
      if (activePos) {
        setRibbonOffset(containerCenter - activePos.center);
      }
    } else if (dx < TAP_THRESHOLD_PX && elapsed < TAP_THRESHOLD_MS) {
      // Tap - select the word under finger
      const tappedIndex = getIndexAtPosition(e.clientX);
      try { newRsvpEngine.seek(tappedIndex); } catch (e) { heartbeat.seek(tappedIndex); }
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
    
    // Reset to current position
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const containerCenter = containerWidth / 2;
    const activePos = wordPositions.current.get(currentIndex);
    if (activePos) {
      setRibbonOffset(containerCenter - activePos.center);
    }
  };

  // Don't render if not visible
  if (!isVisible || visibleTokens.length === 0) return null;

  const activeIdx = scrubIndex ?? currentIndex;
  const FOCUS_COLOR = '#E25822';

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 top-[58%] h-20 flex items-center overflow-hidden z-30 touch-none select-none"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      {/* Gradient fade edges */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
        style={{ 
          background: `linear-gradient(to right, ${theme.background}, transparent)` 
        }}
      />
      <div 
        className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
        style={{ 
          background: `linear-gradient(to left, ${theme.background}, transparent)` 
        }}
      />

      {/* Center reticle */}
      <div 
        className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 z-5 pointer-events-none"
        style={{ 
          backgroundColor: FOCUS_COLOR,
          opacity: 0.2
        }}
      />

      {/* Words ribbon */}
      <div
        ref={ribbonRef}
        className="flex items-center gap-5 whitespace-nowrap"
        style={{
          transform: `translateX(${ribbonOffset}px)`,
          transition: isScrubbing ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
        }}
      >
        {visibleTokens.map((token, i) => {
          const globalIdx = visibleRange.start + i;
          const isActive = globalIdx === activeIdx;
          const distance = Math.abs(globalIdx - activeIdx);
          
          // Opacity falloff based on distance from active
          const opacity = isActive ? 1 : Math.max(0.15, 1 - (distance * 0.1));
          
          return (
            <span
              key={token.id}
              data-idx={globalIdx}
              className="font-serif inline-block"
              style={{
                fontSize: isActive ? '1.5rem' : '1.1rem',
                fontWeight: isActive ? 700 : 400,
                color: isActive ? FOCUS_COLOR : theme.primaryText,
                opacity,
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                transition: isScrubbing 
                  ? 'color 0.05s, font-weight 0.05s, transform 0.05s' 
                  : 'all 0.15s cubic-bezier(0.2, 0, 0, 1)',
                textShadow: isActive ? `0 0 16px ${FOCUS_COLOR}40` : 'none'
              }}
            >
              {token.originalText}
            </span>
          );
        })}
      </div>

      {/* Word position indicator */}
      <div 
        className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono"
        style={{ color: theme.secondaryText, opacity: 0.35 }}
      >
        {activeIdx + 1} / {tokens.length}
      </div>
    </div>
  );
};
