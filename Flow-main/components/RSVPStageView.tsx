import React, { useEffect, useState, useRef } from 'react';
import { RSVPConductor } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
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
  const heartbeat = RSVPHeartbeat.getInstance();
  
  const [currentToken, setCurrentToken] = useState<RSVPToken | null>(null);
  
  // Ref to track if we actually need to update (deduplication)
  const lastIndexRef = useRef<number>(-1);

  useEffect(() => {
    // Initial Sync
    setCurrentToken(heartbeat.currentToken);
    lastIndexRef.current = heartbeat.currentIndex;

    // Optimized Sync Loop with RAF batching
    let rafId: number | null = null;
    let pendingUpdate = false;
    
    const sync = () => {
        const idx = heartbeat.currentIndex;
        // Only trigger React render if the index has changed
        if (idx !== lastIndexRef.current) {
            if (!pendingUpdate) {
                pendingUpdate = true;
                // Batch state updates using RAF for smoother performance
                rafId = requestAnimationFrame(() => {
                    lastIndexRef.current = idx;
                    setCurrentToken(heartbeat.currentToken);
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