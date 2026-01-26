import React, { useEffect, useState } from 'react';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { newRsvpEngine, mapRawToRSVPTokens } from '../services/newRsvpEngine';
import { RSVPTokenView } from './RSVPTokenView';
import { RSVPToken } from '../types';

interface RSVPGhostRibbonProps {
  screenCenter: number;
}

/**
 * RSVPGhostRibbon (Phase 8-C)
 * Identity: Cognitive Load UX Designer.
 * Mission: Render the "Ghost" tokens (previous and next) to provide parafoveal context.
 */
export const RSVPGhostRibbon: React.FC<RSVPGhostRibbonProps> = ({ screenCenter }) => {
  const heartbeat = RSVPHeartbeat.getInstance();
  
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);

  // 2. DATA LOGIC: Sync with Heartbeat (prefer engine tokens when heartbeat empty)
  useEffect(() => {
    // Sync initial state
    if (heartbeat.tokens && heartbeat.tokens.length > 0) {
      setTokens(heartbeat.tokens);
    } else {
      const raw = newRsvpEngine.getTokensRaw();
      if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, heartbeat.wpm));
    }
    setCurrentIndex(heartbeat.currentIndex);

    const unsubscribe = heartbeat.subscribe(() => {
        // High-frequency update
        setCurrentIndex(heartbeat.currentIndex);
        // Handle playlist changes (e.g., chapter swap)
        if (heartbeat.tokens && heartbeat.tokens.length > 0) {
            setTokens(heartbeat.tokens);
        }
    });

    const unsubNew = newRsvpEngine.subscribe(({ index, token }) => {
      if (typeof index === 'number') setCurrentIndex(index);
      if ((!heartbeat.tokens || heartbeat.tokens.length === 0)) {
        const raw = newRsvpEngine.getTokensRaw();
        if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, heartbeat.wpm));
        else if (token) setTokens([token as RSVPToken]);
      }
    });

    return () => { unsubscribe(); unsubNew(); };
  }, []); // stable subscription

  // Safe fetch (The Past, Present, Future)
  const currentToken = tokens[currentIndex] || null;
  const prevToken = tokens[currentIndex - 1] || null;
  const nextToken = tokens[currentIndex + 1] || null;

  // 4. MOTION PHYSICS:
  // We use a fixed spacing for the ribbon effect.
  // 42px font -> ~200px word width on average. 
  // 350px offset ensures no overlap while keeping it in peripheral vision.
  const RIBBON_SPACING = 350;

  return (
    <div className="absolute inset-0 pointer-events-none">
      
      {/* LEFT GHOST: The Past */}
      {/* Render previousToken at 15% opacity, blur(1px), offset left. */}
      {prevToken && (
        <div 
            className="absolute top-1/2 left-0 w-full -translate-y-1/2 opacity-[0.15] blur-[1px] will-change-transform"
        >
             <RSVPTokenView 
                token={prevToken} 
                screenCenter={screenCenter - RIBBON_SPACING} 
             />
        </div>
      )}

      {/* CENTER: The Present (Focus) */}
      {/* Center the current RSVPTokenView. */}
      {currentToken && (
        <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 z-10 will-change-transform">
            <RSVPTokenView 
                token={currentToken} 
                screenCenter={screenCenter} 
            />
        </div>
      )}

      {/* RIGHT GHOST: The Future */}
      {/* Render nextToken at 15% opacity, blur(1px), offset right. */}
      {nextToken && (
        <div 
            className="absolute top-1/2 left-0 w-full -translate-y-1/2 opacity-[0.15] blur-[1px] will-change-transform"
        >
             <RSVPTokenView 
                token={nextToken} 
                screenCenter={screenCenter + RIBBON_SPACING} 
             />
        </div>
      )}
    </div>
  );
};