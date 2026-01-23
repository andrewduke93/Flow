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
 */
export const RSVPStageView: React.FC<RSVPStageViewProps> = ({ onToggleHUD }) => {
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  
  const [currentToken, setCurrentToken] = useState<RSVPToken | null>(null);
  
  // Ref to track if we actually need to update (deduplication)
  const lastIndexRef = useRef<number>(-1);

  useEffect(() => {
    // Initial Sync
    setCurrentToken(heartbeat.currentToken);

    // Optimized Sync Loop
    const sync = () => {
        const idx = heartbeat.currentIndex;
        // Only trigger React render if the index has changed
        if (idx !== lastIndexRef.current) {
            lastIndexRef.current = idx;
            setCurrentToken(heartbeat.currentToken);
        }
    };

    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    return () => { unsubC(); unsubH(); };
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
};