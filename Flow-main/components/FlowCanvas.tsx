import React, { useRef, useEffect, useCallback, memo } from 'react';
import { TitanReadStream } from '../services/titanReadStream';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface FlowCanvasProps {
  onTap?: () => void;
}

/**
 * FlowCanvas - High-Performance Word Display
 * 
 * Uses HTML5 Canvas for zero-DOM-update rendering.
 * Renders the current word with ORP (Optimal Recognition Point) highlighting.
 * 
 * Performance advantages:
 * - No React reconciliation per word
 * - No layout/reflow calculations
 * - Direct GPU compositing
 * - 60fps+ guaranteed
 */
export const FlowCanvas: React.FC<FlowCanvasProps> = memo(({ onTap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stream = TitanReadStream.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  // Animation state refs (avoid re-renders)
  const rafRef = useRef<number | null>(null);
  const lastIndexRef = useRef(-1);
  const dprRef = useRef(1);
  
  // ORP calculation (~30% into word)
  const getORP = useCallback((text: string): number => {
    const len = Math.max(1, text.length);
    if (len <= 3) return 0;
    return Math.min(len - 1, Math.max(0, Math.floor(len * 0.3)));
  }, []);

  // Font setup
  const getFontFamily = useCallback(() => {
    if (settings.fontFamily === 'New York') return 'Georgia, serif';
    if (settings.fontFamily === 'OpenDyslexic') return '"OpenDyslexic", sans-serif';
    return 'system-ui, -apple-system, sans-serif';
  }, [settings.fontFamily]);

  // Render function - called every frame when playing, on demand when paused
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const token = stream.currentToken;
    const container = containerRef.current;
    if (!container) return;

    const dpr = dprRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!token) return;

    const text = token.originalText;
    const orpIdx = getORP(text);
    
    // Dynamic font size
    const baseFontSize = settings.fontSize || 18;
    const fontSize = Math.min(baseFontSize * 3, Math.max(baseFontSize * 1.8, width * 0.08));
    const fontFamily = getFontFamily();
    
    ctx.font = `600 ${fontSize * dpr}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    
    // Measure parts
    const leftPart = text.slice(0, orpIdx);
    const orpChar = text[orpIdx] || '';
    const rightPart = text.slice(orpIdx + 1);
    const punct = token.punctuation || '';
    
    const leftWidth = ctx.measureText(leftPart).width;
    const orpWidth = ctx.measureText(orpChar).width;
    const rightWidth = ctx.measureText(rightPart).width;
    const punctWidth = punct ? ctx.measureText(punct).width : 0;
    
    // Position: ORP character at 35.5% from left (reticle position)
    const reticleX = width * 0.355 * dpr;
    const centerY = height * 0.42 * dpr; // Slightly above center
    
    // Calculate start position so ORP is at reticle
    const orpCenterOffset = leftWidth + orpWidth / 2;
    const startX = reticleX - orpCenterOffset;
    
    // Draw reticle line (subtle)
    ctx.strokeStyle = '#E25822';
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(reticleX, height * 0.25 * dpr);
    ctx.lineTo(reticleX, height * 0.75 * dpr);
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    // Draw left part
    ctx.fillStyle = theme.primaryText;
    ctx.fillText(leftPart, startX, centerY);
    
    // Draw ORP character (highlighted)
    ctx.fillStyle = '#E25822';
    ctx.shadowColor = '#E2582230';
    ctx.shadowBlur = 24 * dpr;
    ctx.fillText(orpChar, startX + leftWidth, centerY);
    ctx.shadowBlur = 0;
    
    // Draw right part
    ctx.fillStyle = theme.primaryText;
    ctx.fillText(rightPart, startX + leftWidth + orpWidth, centerY);
    
    // Draw punctuation (more visible for natural reading flow)
    if (punct) {
      ctx.fillStyle = theme.secondaryText;
      ctx.globalAlpha = 0.6;
      ctx.fillText(punct, startX + leftWidth + orpWidth + rightWidth, centerY);
      ctx.globalAlpha = 1;
    }

    // Context words when paused or ghost preview enabled
    if (!stream.isPlaying || settings.showGhostPreview) {
      const contextCount = 8; // More words for natural reading flow
      const tokens = stream.tokens;
      const currentIdx = stream.currentIndex;
      
      ctx.font = `400 ${fontSize * 0.9 * dpr}px ${fontFamily}`;
      
      // Natural word spacing (0.35em) for reading flow
      const wordGap = fontSize * 0.35 * dpr;
      
      // Previous words (fade left)
      let prevX = startX - wordGap;
      for (let i = currentIdx - 1; i >= Math.max(0, currentIdx - contextCount); i--) {
        const prevToken = tokens[i];
        if (!prevToken) break;
        
        const prevText = prevToken.originalText + (prevToken.punctuation || '');
        const prevWidth = ctx.measureText(prevText).width;
        prevX -= prevWidth;
        
        const distance = currentIdx - i;
        // Smoother opacity gradient for natural reading
        const opacity = Math.max(0.15, 0.6 - distance * 0.06);
        
        ctx.fillStyle = theme.primaryText;
        ctx.globalAlpha = opacity;
        ctx.fillText(prevText, prevX, centerY);
        
        prevX -= wordGap;
      }
      
      // Next words (fade right)
      let nextX = startX + leftWidth + orpWidth + rightWidth + punctWidth + wordGap;
      for (let i = currentIdx + 1; i <= Math.min(tokens.length - 1, currentIdx + contextCount); i++) {
        const nextToken = tokens[i];
        if (!nextToken) break;
        
        const nextText = nextToken.originalText + (nextToken.punctuation || '');
        const nextWidth = ctx.measureText(nextText).width;
        
        const distance = i - currentIdx;
        // Smoother opacity gradient for natural reading
        const opacity = Math.max(0.15, 0.6 - distance * 0.06);
        
        ctx.fillStyle = theme.primaryText;
        ctx.globalAlpha = opacity;
        ctx.fillText(nextText, nextX, centerY);
        
        nextX += nextWidth + wordGap;
      }
      
      ctx.globalAlpha = 1;
    }

    // Progress bar at bottom
    const progress = stream.progress;
    const barY = height * 0.92 * dpr;
    const barHeight = 2 * dpr;
    const barMargin = 32 * dpr;
    const barWidth = (width * dpr) - (barMargin * 2);
    
    // Background
    ctx.fillStyle = theme.primaryText;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.roundRect(barMargin, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    
    // Progress
    ctx.fillStyle = '#E25822';
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.roundRect(barMargin, barY, barWidth * progress, barHeight, barHeight / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
  }, [theme, settings, getORP, getFontFamily]);

  // Animation loop
  const animationLoop = useCallback(() => {
    render();
    
    if (stream.isPlaying) {
      rafRef.current = requestAnimationFrame(animationLoop);
    }
  }, [render]);

  // Setup canvas and subscriptions
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // High DPI setup
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    
    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      render();
    };

    resize();
    window.addEventListener('resize', resize);

    // Subscribe to stream
    const unsubscribe = stream.subscribe(() => {
      const idx = stream.currentIndex;
      
      // Only render on index change or play state change
      if (idx !== lastIndexRef.current || !stream.isPlaying) {
        lastIndexRef.current = idx;
        
        if (stream.isPlaying && !rafRef.current) {
          animationLoop();
        } else if (!stream.isPlaying) {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          render();
        }
      }
    });

    // Initial render
    render();

    return () => {
      window.removeEventListener('resize', resize);
      unsubscribe();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [render, animationLoop]);

  // Re-render on theme/settings change
  useEffect(() => {
    render();
  }, [theme, settings, render]);

  // Tap handler
  const handleClick = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onTap?.();
  }, [onTap]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 select-none"
      style={{ backgroundColor: theme.background }}
      onClick={handleClick}
    >
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
});
