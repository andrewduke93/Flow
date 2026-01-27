import React, { useEffect, useState, useMemo, useRef } from 'react';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { newRsvpEngine, mapRawToRSVPTokens } from '../services/newRsvpEngine';
import { TitanSettingsService } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';
import { RSVPToken } from '../types';

interface ScrubberMarker {
  index: number; // The index of the token ending the segment
  startIndex: number; // The index where the next segment starts
  type: 'paragraph' | 'sentence';
}

/**
 * RSVPSemanticScrubber (Phase 9-C)
 * Identity: Navigation UX Architect.
 * Mission: A secondary scrubber that allows jumping between sentences and paragraphs.
 * Update: Theme Unification.
 */
export const RSVPSemanticScrubber: React.FC = () => {
  const conductor = RSVPConductor.getInstance();
  const settings = TitanSettingsService.getInstance().getSettings();
  const theme = useTitanTheme();
  
  const containerRef = useRef<HTMLDivElement>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Interaction State
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState(0);

  // 1. Sync Logic
  useEffect(() => {
    const sync = () => {
      setIsVisible(conductor.state === RSVPState.PAUSED || conductor.state === RSVPState.IDLE);
      const raw = newRsvpEngine.getTokensRaw();
      if (raw && raw.length > 0) setTokens(mapRawToRSVPTokens(raw, settings.rsvpSpeed));
      setCurrentIndex((raw && raw.length > 0) ? 0 : 0);
    };

    const unsubC = conductor.subscribe(sync);
    const unsubNew = newRsvpEngine.subscribe(() => sync());
    sync();

    return () => {
      unsubC();
      unsubH();
    };
  }, []);

  // 2. Compute Semantic Markers (Memoized)
  const markers = useMemo(() => {
    const m: ScrubberMarker[] = [];
    m.push({ index: -1, startIndex: 0, type: 'paragraph' });

    tokens.forEach((t, i) => {
      if (t.isParagraphEnd) {
        m.push({ index: i, startIndex: i + 1, type: 'paragraph' });
      } else if (t.isSentenceEnd) {
        m.push({ index: i, startIndex: i + 1, type: 'sentence' });
      }
    });
    return m;
  }, [tokens]);

  // 3. Scrubbing Logic
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsScrubbing(true);
    updateScrub(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) {
      updateScrub(e);
    }
  };

    const handlePointerUp = (e: React.PointerEvent) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      setPreviewIndex(null);
      (e.target as Element).releasePointerCapture(e.pointerId);
      
      if (previewIndex !== null) {
        try { newRsvpEngine.seek(previewIndex); } catch (e) { /* ignore */ }
        try { newRsvpEngine.pause(); } catch (e) { conductor.pause(); }
      }
    }
  };

  const updateScrub = (e: React.PointerEvent) => {
    if (!containerRef.current || tokens.length === 0) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    
    const roughIndex = Math.floor(pct * tokens.length);
    
    let bestMarker = markers[0];
    let minDist = Math.abs(bestMarker.startIndex - roughIndex);

    for (const marker of markers) {
      const dist = Math.abs(marker.startIndex - roughIndex);
      if (dist < minDist) {
        minDist = dist;
        bestMarker = marker;
      }
    }
    
    const targetIndex = Math.min(bestMarker.startIndex, tokens.length - 1);
    
    setPreviewIndex(targetIndex);
    setPreviewPosition(x); 
  };

  const previewText = useMemo(() => {
    if (previewIndex === null || tokens.length === 0) return "";
    return tokens.slice(previewIndex, previewIndex + 3)
      .map(t => t.originalText)
      .join(" ");
  }, [previewIndex, tokens]);

  if (!isVisible && !isScrubbing) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute bottom-12 left-6 right-6 h-12 flex items-center justify-center z-40 touch-none cursor-crosshair opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ animationName: isVisible ? 'fadeIn' : 'fadeOut' }}
    >
      {/* 4. THE MINI-MAP POPUP (Floating Bubble) */}
      {isScrubbing && previewIndex !== null && (
        <div 
          className="absolute bottom-full mb-4 px-3 py-2 rounded-xl shadow-xl backdrop-blur-md border text-xs font-bold font-serif whitespace-nowrap pointer-events-none transform -translate-x-1/2 transition-transform duration-75"
          style={{ 
            left: previewPosition,
            backgroundColor: theme.primaryText,
            color: theme.background,
            borderColor: theme.borderColor
          }}
        >
          {previewText}...
          {/* Little triangle arrow */}
          <div 
             className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent" 
             style={{ borderTopColor: theme.primaryText }}
          />
        </div>
      )}

      {/* Track Background */}
      <div className="absolute w-full h-[2px] rounded-full overflow-visible" style={{ backgroundColor: theme.secondaryText + '40' }}>
        
        {/* Progress Fill (Current Reading Position) */}
        <div 
          className="h-full"
          style={{ 
              width: `${(currentIndex / Math.max(1, tokens.length)) * 100}%`,
              backgroundColor: theme.secondaryText
          }}
        />

        {/* Visual Markers (Ticks) */}
        {markers.map((marker, i) => {
           if (marker.index < 0) return null; 
           const leftPct = (marker.index / tokens.length) * 100;
           const isPara = marker.type === 'paragraph';
           
           return (
             <div 
                key={i}
                className={`absolute top-1/2 -translate-y-1/2 bg-current transition-colors`}
                style={{
                  left: `${leftPct}%`,
                  height: isPara ? '12px' : '6px',
                  width: isPara ? '2px' : '1px',
                  color: theme.secondaryText,
                  opacity: isPara ? 0.6 : 0.3
                }}
             />
           );
        })}
      </div>

      {/* Hit Area (Invisible, larger for touch) */}
      <div className="absolute inset-0 -top-4 -bottom-4 bg-transparent" />
    </div>
  );
};