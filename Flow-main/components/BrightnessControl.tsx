import React, { useState, useRef, useEffect } from 'react';
import { Sun } from 'lucide-react';

/**
 * BrightnessControl (Phase 10-A)
 * Identity: Human Factors Engineer.
 * Mission: A simulated brightness overlay controlled by a vertical drag gesture on the edge.
 * 
 * Logic:
 * - Render an overlay with `pointer-events: none` that dims the screen.
 * - Render a `pointer-events: auto` hit zone on the right 15% of the screen.
 * - Drag Up -> Brightness Up (Opacity Down).
 * - Drag Down -> Brightness Down (Opacity Up).
 */
export const BrightnessControl: React.FC = () => {
  // Brightness: 1.0 (Full) -> 0.2 (Dim)
  // Overlay Opacity: 0.0 -> 0.8
  const [brightness, setBrightness] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [showHUD, setShowHUD] = useState(false);
  
  const startYRef = useRef(0);
  const startValRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Convert brightness (1..0) to Opacity (0..0.8)
  // Brightness 1.0 = Opacity 0
  // Brightness 0.0 = Opacity 0.9
  const opacity = (1.0 - brightness) * 0.9;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setShowHUD(true);
    startYRef.current = e.clientY;
    startValRef.current = brightness;
    (e.target as Element).setPointerCapture(e.pointerId);
    
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaY = startYRef.current - e.clientY; // Up is positive
    const screenHeight = window.innerHeight;
    
    // Sensitivity: Full screen height = 100% change
    const change = deltaY / (screenHeight * 0.6);
    
    const newVal = Math.max(0.1, Math.min(1.0, startValRef.current + change));
    setBrightness(newVal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
    
    // Fade out HUD
    timerRef.current = setTimeout(() => setShowHUD(false), 1500);
  };

  return (
    <>
      {/* 1. The Global Dimmer Overlay */}
      <div 
        className="fixed inset-0 z-[9998] pointer-events-none transition-opacity duration-75 ease-linear bg-black"
        style={{ opacity }}
      />

      {/* 2. The Gesture Hit Zone (Right 15%) */}
      <div 
        className="fixed top-0 right-0 bottom-0 w-[15%] z-[9999] touch-none cursor-ns-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ opacity: 0 }} // Invisible hit target
        aria-label="Brightness Control"
      />

      {/* 3. The Brightness HUD */}
      <div 
        className={`fixed right-6 top-1/2 -translate-y-1/2 z-[9999] pointer-events-none transition-opacity duration-300 ${
          showHUD ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="bg-white/20 backdrop-blur-xl border border-white/30 p-2 rounded-full shadow-2xl flex flex-col items-center gap-2 w-12">
           <Sun size={20} className="text-white fill-white" />
           <div className="w-1.5 h-32 bg-white/30 rounded-full relative overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-white rounded-full transition-all duration-75"
                style={{ height: `${brightness * 100}%` }}
              />
           </div>
        </div>
      </div>
    </>
  );
};
