import React, { useEffect, useState, useRef } from 'react';
import { RSVPConductor } from '../services/rsvpConductor';
import { newRsvpEngine } from '../services/newRsvpEngine';
import { RSVPLens } from './RSVPLens';
import { RSVPToken } from '../types';

interface RSVPStageViewProps {
  onToggleHUD: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
}

/**
 * RSVPStageView (The Projection)
 * Identity: The Lens.
 * Mission: A pure function of heartbeat.currentToken.
 * Performance: Memoized to prevent unnecessary re-renders.
 */
export const RSVPStageView: React.FC<RSVPStageViewProps> = React.memo(({ onToggleHUD }) => {
  const conductor = RSVPConductor.getInstance();
  
  const [currentToken, setCurrentToken] = useState<RSVPToken | null>(null);
  
  // Ref to track if we actually need to update (deduplication)
  const lastIndexRef = useRef<number>(-1);

  useEffect(() => {
    // Prefer newRsvpEngine for updates
    let rafId: number | null = null;
    let pendingUpdate = false;

    // Initialize from engine if possible
    const raw = newRsvpEngine.getTokensRaw();
    if (raw && raw.length > 0) {
      lastIndexRef.current = 0;
      setCurrentToken(null);
    }

    const scheduleSet = (idx: number, token: RSVPToken | null) => {
      if (idx === lastIndexRef.current) return;
      if (!pendingUpdate) {
        pendingUpdate = true;
        rafId = requestAnimationFrame(() => {
          lastIndexRef.current = idx;
          setCurrentToken(token);
          pendingUpdate = false;
        });
      }
    };

    const unsubC = conductor.subscribe(() => {
      // conductor-driven sync will be handled by engine/heartbeat subscriptions
    });

    const unsubNew = newRsvpEngine.subscribe(({ index, token }) => {
      if (typeof index === 'number') scheduleSet(index, token as RSVPToken);
    });

    return () => { unsubC(); unsubNew(); if (rafId !== null) cancelAnimationFrame(rafId); };
  }, []);

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div className="relative w-full h-full flex items-center justify-center">
         <RSVPLens token={currentToken} />
      </div>
    </div>
  );
});