import React, { useMemo } from 'react';
import { RSVPToken } from '../types';
import { useTitanTheme } from '../services/titanTheme';

interface RSVPLensProps {
  token: RSVPToken | null;
  screenCenter?: number; // Deprecated
}

/**
 * RSVPLens (Optical Anchor)
 * Identity: Type Engineer.
 * Mission: The "Reedy" Pivot (Inter).
 * Axis: 35.5% Left.
 * Performance: ZERO-LAYOUT THRASHING. Pure heuristic scaling. Fully memoized.
 */
export const RSVPLens: React.FC<RSVPLensProps> = React.memo(({ token }) => {
  const theme = useTitanTheme();

  // CONSTANT: The Optical Focus Color (Titan Ember)
  const FOCUS_COLOR = '#E25822';

  // Performance Optimization: Heuristic Scaling
  // Instead of measuring DOM (which forces reflow), we estimate based on char count.
  const scale = useMemo(() => {
      if (!token) return 1;
      const len = token.originalText.length;
      // Heuristic: Start scaling down after 10 chars.
      // Standardizes performance regardless of device speed.
      if (len <= 10) return 1;
      return Math.max(0.6, 10 / len);
  }, [token]);

  // Soft Vignette: Memoized to theme only (never recalculates on token change)
  const vignette = useMemo(() => 
    `radial-gradient(circle at 35.5% 42%, transparent 20%, ${theme.background} 85%)`,
    [theme.background]
  );

  if (!token) return null;

  // Fluid Font Size: Fixed clamp to avoid JS calculation overhead
  const fluidFontSize = "clamp(3rem, 13vw, 5rem)";

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden box-border">
      
      {/* 0. VIGNETTE SHIELD (The Focus Tunnel) */}
      <div 
        className="absolute inset-0 z-10"
        style={{ background: vignette }}
      />

      {/* 1. GHOST MEASURE (REMOVED FOR PERFORMANCE) */}
      {/* We no longer render invisible text for measurement. */}

      {/* 2. THE RETICLE (35.5% Axis) */}
      <div className="absolute left-[35.5%] top-0 bottom-0 w-[1px] z-0" style={{ backgroundColor: FOCUS_COLOR, opacity: 0.15 }}>
         <div className="absolute top-[20%] bottom-[20%] w-[1px]" style={{ backgroundColor: FOCUS_COLOR, opacity: 0.3 }} />
         {/* Notch */}
         <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[30px] rounded-full" style={{ backgroundColor: FOCUS_COLOR, opacity: 0.5 }} />
      </div>

      {/* 3. THE WORD (Pivot Engine) */}
      {/* 
          OPTIMIZATION: Replaced motion.div and AnimatePresence with a stable div.
          No entry/exit animations allows for extremely high WPM without jitter.
      */}
      <div
          className="absolute top-[42%] left-[35.5%]"
          style={{ 
              transform: `scale(${scale})`, // Apply heuristic scale directly
              visibility: 'visible',
              opacity: 1,
              zIndex: 2147483647,
              // Force GPU layer promotion
              willChange: 'transform, opacity', 
          }}
      >
          {/* 
             THE SLIDE PIVOT
             Coordinate System: (0,0) is the CENTER of the ORP Character.
          */}
          <span 
              className="relative inline-block font-sans font-semibold leading-none whitespace-nowrap transform -translate-x-1/2 transition-none"
              style={{ 
                  fontSize: fluidFontSize,
                  color: FOCUS_COLOR,
                  textShadow: `0 0 10px ${FOCUS_COLOR}15`
              }}
          >
              {/* THE ORP CHARACTER (Focus) */}
              {token.centerCharacter}
              
              {/* Left Segment (Primary Text, Pushed Left) */}
              <span 
                  className="absolute right-[100%] top-0 h-full flex items-center justify-end font-normal pr-[2px]"
                  style={{ color: theme.primaryText }} 
              >
                  {token.leftSegment}
              </span>

              {/* Right Segment (Primary Text, Pushed Right) */}
              <span 
                  className="absolute left-[100%] top-0 h-full flex items-center justify-start font-normal pl-[2px]"
                  style={{ color: theme.primaryText }}
              >
                  {token.rightSegment}
                  {token.punctuation && (
                      <span className="font-light opacity-60 ml-[2px]" style={{ color: theme.secondaryText }}>{token.punctuation}</span>
                  )}
              </span>
          </span>
      </div>
    </div>
  );
});
