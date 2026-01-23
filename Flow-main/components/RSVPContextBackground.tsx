import React, { useEffect, useState } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { motion } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';

interface RSVPContextBackgroundProps {
  children: React.ReactNode;
  active: boolean; // Whether we are in RSVP mode
}

/**
 * RSVPContextBackground (Phase 9-H: Rack Focus - Optimized)
 * Identity: Immersive Design Specialist.
 * Mission: Dim the background without expensive filter repaints.
 * Performance: REMOVED BLUR FILTER. Opacity only.
 */
export const RSVPContextBackground: React.FC<RSVPContextBackgroundProps> = ({ children, active }) => {
  const conductor = RSVPConductor.getInstance();
  const [isPaused, setIsPaused] = useState(true);
  const theme = useTitanTheme();

  useEffect(() => {
    const sync = () => {
      setIsPaused(
        conductor.state === RSVPState.IDLE || 
        conductor.state === RSVPState.PAUSED || 
        conductor.state === RSVPState.FINISHED
      );
    };

    const unsubscribe = conductor.subscribe(sync);
    sync();
    return unsubscribe;
  }, []);

  // Optimization: Just use opacity. Blur is too expensive for 60fps text rendering on some devices.
  const opacity = active ? (isPaused ? 0.3 : 0.05) : 1.0;

  return (
    <motion.div 
      className="absolute inset-0 origin-center will-change-transform"
      animate={{
        scale: active ? 0.98 : 1.0, 
        opacity: opacity,
      }}
      transition={{
        type: "spring",
        stiffness: 200, 
        damping: 30
      }}
      style={{
        pointerEvents: 'auto', 
        backgroundColor: theme.background,
        // Force hardware acceleration
        transform: 'translateZ(0)'
      }}
    >
      {children}
    </motion.div>
  );
};