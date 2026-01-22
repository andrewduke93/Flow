import React, { useId, useLayoutEffect, useRef } from 'react';

/**
 * KineticBlur (Phase 8-D)
 * Identity: Graphics Programmer.
 * Mission: High-performance horizontal motion blur shader and modifier.
 */

interface KineticBlurResult {
  /**
   * The SVG Filter definition to be embedded in the component.
   * Equivalent to the Metal shader library.
   */
  BlurFilter: React.FC;
  
  /**
   * The style object to apply to the target view.
   * Applies the filter URL.
   */
  blurStyle: React.CSSProperties;
}

/**
 * useKineticMotionEffect
 * The React equivalent of the SwiftUI `KineticMotionEffect` modifier.
 * 
 * Logic:
 * - Listens for changes in the `trigger` (currentIndex/tokenId).
 * - Spikes blur strength to `intensity` (default 15.0).
 * - Decays to 0.0 over `duration` (default 0.05s).
 * - Uses Direct DOM manipulation for 60/120Hz performance (bypassing React render cycle).
 */
export const useKineticMotionEffect = (
  trigger: string | number | null, 
  options: { intensity?: number; duration?: number } = {}
): KineticBlurResult => {
  const intensity = options.intensity ?? 15.0;
  const duration = options.duration ?? 0.15; // Slightly longer for web visibility
  
  const uniqueId = useId().replace(/:/g, ""); // Sanitize for DOM ID
  const filterId = `kinetic-blur-${uniqueId}`;
  
  // Ref to the SVG primitive for direct manipulation
  const filterRef = useRef<SVGFEGaussianBlurElement>(null);
  const animationRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    // Optimization (Phase 10-B): If intensity is 0, don't run loop.
    if (!trigger || !filterRef.current || intensity <= 0) {
        if (filterRef.current) filterRef.current.setAttribute("stdDeviation", "0 0");
        return;
    }

    const startTime = performance.now();
    const startVal = intensity;

    const tick = (now: number) => {
      const elapsed = (now - startTime) / 1000; // seconds
      const progress = Math.min(elapsed / duration, 1.0);
      
      // Linear decay (can be swapped for spring physics later)
      // float currentStrength = strength * (1.0 - progress);
      const currentStrength = startVal * (1.0 - progress);

      if (filterRef.current) {
        // Horizontal Blur Only: "X 0"
        filterRef.current.setAttribute("stdDeviation", `${currentStrength.toFixed(2)} 0`);
      }

      if (progress < 1.0) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        // Ensure clean finish
         if (filterRef.current) {
            filterRef.current.setAttribute("stdDeviation", "0 0");
         }
      }
    };

    // Cancel previous frame if rapid firing
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    // Start Spike
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [trigger, intensity, duration]);

  const BlurFilter: React.FC = () => (
    <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur 
            ref={filterRef} 
            in="SourceGraphic" 
            stdDeviation="0 0" 
          />
        </filter>
      </defs>
    </svg>
  );

  const blurStyle: React.CSSProperties = {
    filter: `url(#${filterId})`,
    // Optimize for GPU composition
    willChange: 'filter',
  };

  return { BlurFilter, blurStyle };
};