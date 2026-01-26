import React, { useEffect, useState, useRef, useMemo } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { RSVPTokenView } from './RSVPTokenView';
import { RSVPToken } from '../types';
import { RSVPScrubberLogic } from '../services/rsvpScrubber';

/**
 * LiquidRibbonView (Phase 9-B)
 * Identity: Senior Motion Engineer & Sensory UX Engineer.
 * Mission: A fluid, interactive, haptic ribbon for scrubbing through time.
 */
export const LiquidRibbonView: React.FC<{ screenCenter: number }> = ({ screenCenter }) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStartIndex, setDragStartIndex] = useState(0);
  const startXRef = useRef<number>(0);

  // Constants
  const SPACING = 240; // The "Average Word Width" for the ribbon layout
  
  // Logic Engine
  const scrubber = useMemo(() => new RSVPScrubberLogic(SPACING), []);

  useEffect(() => {
    const sync = () => {
      // Only sync if not interacting to prevent fighting the user
      if (!isDragging) {
        if (heartbeat.tokens.length > 0) setTokens(heartbeat.tokens);
        else {
          const raw = newRsvpEngine.getTokensRaw();
          if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, heartbeat.wpm));
        }
        setCurrentIndex(heartbeat.currentIndex);
        setIsExpanded(conductor.state === RSVPState.PAUSED || conductor.state === RSVPState.IDLE);
      }
    };
    
    const unsubConductor = conductor.subscribe(sync);
    const unsubHeartbeat = heartbeat.subscribe(sync);
    const unsubNew = newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
      if (!isDragging) {
        if (typeof index === 'number') setCurrentIndex(index);
        if (heartbeat.tokens.length === 0) {
          const raw = newRsvpEngine.getTokensRaw();
          if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, heartbeat.wpm));
          else if (token) setTokens([token as RSVPToken]);
        }
        setIsExpanded(!isPlaying);
      }
    });
    
    sync();

    return () => {
        unsubConductor();
        unsubHeartbeat();
        unsubNew();
    };
  }, [isDragging]); // Re-subscribe when drag state changes

  // MARK: - Gesture Handling (Phase 9-B)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isExpanded) return;
    
    // Capture state
    setIsDragging(true);
    startXRef.current = e.clientX;
    setDragStartIndex(currentIndex);
    
    // Initialize Scrubber Logic
    scrubber.begin(currentIndex);
    
    // Capture pointer for smooth dragging even if mouse leaves div
    (e.target as Element).setPointerCapture(e.pointerId);

    // Pause playback while dragging (prefer new engine)
    try { newRsvpEngine.pause(); } catch (err) { conductor.pause(); }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const currentX = e.clientX;
    const deltaX = currentX - startXRef.current;
    
    // 1. Visual Update (Immediate)
    setDragOffset(deltaX);

    // 2. Haptic Logic (Calculate virtual index)
    // We don't commit this to the conductor yet, just trigger feedback
    scrubber.update(deltaX, dragStartIndex, tokens.length - 1);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);

    // 3. Magnetic Snapping (Phase 9-B Requirement 3)
    // Calculate final index
    const finalIndex = scrubber.update(dragOffset, dragStartIndex, tokens.length - 1);
    
    // Reset visual offset
    setDragOffset(0);
    setCurrentIndex(finalIndex); // Optimistic update

    // Commit to Engine (Seek)
    try { newRsvpEngine.seek(finalIndex); } catch (e) { heartbeat.seek(finalIndex); }
    // Ensure we stay paused (prefer new engine)
    try { newRsvpEngine.pause(); } catch (err) { conductor.pause(); }
  };

  // MARK: - Rendering Logic

  // Window Range: Render enough tokens to cover the scrub area
  const windowRange = 8; 
  // If dragging, we anchor around the start index, but ensure we render enough
  const anchorIndex = isDragging ? dragStartIndex : currentIndex;
  
  const start = Math.max(0, anchorIndex - windowRange);
  const end = Math.min(tokens.length - 1, anchorIndex + windowRange);
  
  const visibleTokens = tokens.slice(start, end + 1).map(t => ({
      token: t,
      offsetIndex: t.globalIndex - anchorIndex 
  }));

  return (
    <div 
      className={`absolute inset-0 touch-none ${isExpanded ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
       {visibleTokens.map(({ token, offsetIndex }) => {
           // Calculate Position
           // Base Position + Drag Offset
           // Standard spacing is used when expanded, condensed when collapsed (handled by isExpanded logic mostly via spacing var)
           
           // 3. "Explosion" Animation Params
           const effectiveSpacing = isExpanded ? SPACING : 10;
           
           // Position relative to the screen center
           // We add dragOffset to shift the whole ribbon
           const relativePosition = (offsetIndex * effectiveSpacing) + (isDragging ? dragOffset : 0);
           const targetCenter = screenCenter + relativePosition;

           // Dynamic Fluid Visuals
           // Calculate distance from center to determine scale/opacity
           const distanceFromCenter = Math.abs(relativePosition);
           
           // Normalized distance (0 at center, 1 at 1 item away)
           const normalizedDist = distanceFromCenter / effectiveSpacing;
           
           // Scale: 1.0 at center, decays to 0.6
           // If collapsed, everything is smaller except center
           let scale = isExpanded 
                ? Math.max(0.6, 1.0 - (normalizedDist * 0.4)) 
                : (offsetIndex === 0 ? 1.0 : 0.8);

           // Opacity: 1.0 at center, decays to 0.3
           // If collapsed, neighbors are 0
           let opacity = isExpanded
                ? Math.max(0.15, 1.0 - (normalizedDist * 0.8)) // Sharper falloff for focus
                : (offsetIndex === 0 ? 1.0 : 0);

           // Blur: 0 at center, increases with distance
           let blur = isExpanded
                ? Math.min(4, normalizedDist * 2) // 0px -> 2px -> 4px
                : (offsetIndex === 0 ? 0 : 8);

           return (
               <div 
                 key={token.id}
                 className="absolute top-1/2 w-full -translate-y-1/2 will-change-transform select-none"
                 style={{
                     // When dragging, we disable transition for 1:1 tracking
                     transition: isDragging ? 'none' : 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                     opacity,
                     transform: `scale(${scale})`,
                     filter: `blur(${blur}px)`,
                     zIndex: 100 - Math.min(Math.floor(distanceFromCenter / 10), 50), // Center always on top
                     pointerEvents: 'none' // Let the container handle events
                 }}
               >
                  <RSVPTokenView 
                    token={token} 
                    screenCenter={targetCenter}
                  />
               </div>
           );
       })}
    </div>
  );
};