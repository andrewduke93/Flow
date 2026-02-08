import React, { useRef, useEffect, useCallback, memo } from 'react';
import { TitanReadStream } from '../services/titanReadStream';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { RSVPRenderWorker } from '../services/rsvpRenderWorker';

interface FlowCanvasProps {
  onTap?: () => void;
}

/**
 * FlowCanvas - Near-Native Performance Word Display
 * 
 * Uses OffscreenCanvas in a Web Worker for zero-main-thread rendering.
 * Falls back to main thread Canvas if OffscreenCanvas is unsupported.
 * 
 * Performance advantages:
 * - OffscreenCanvas: Rendering happens entirely off main thread
 * - Zero GC impact on rendering (worker has separate heap)
 * - No React reconciliation per word
 * - GPU-accelerated with will-change hints
 * - Consistent 60fps+ even during main thread activity
 */
export const FlowCanvas: React.FC<FlowCanvasProps> = memo(({ onTap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stream = TitanReadStream.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  // Worker and fallback state
  const workerRef = useRef<RSVPRenderWorker | null>(null);
  const useWorkerRef = useRef(false);
  
  // Animation state refs (for fallback mode)
  const rafRef = useRef<number | null>(null);
  const lastIndexRef = useRef(-1);
  const dprRef = useRef(1);
  
  // ORP calculation (~30% into word) - for fallback mode
  const getORP = useCallback((text: string): number => {
    const len = text.length;
    if (len <= 1) return 0;
    if (len <= 3) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * 0.3);
  }, []);

  // Font setup
  const getFontFamily = useCallback(() => {
    if (settings.fontFamily === 'New York') return 'Georgia, serif';
    if (settings.fontFamily === 'OpenDyslexic') return '"OpenDyslexic", sans-serif';
    return 'system-ui, -apple-system, sans-serif';
  }, [settings.fontFamily]);

  // Fallback render function (main thread)
  const renderFallback = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const token = stream.currentToken;
    const container = containerRef.current;
    if (!container) return;

    const dpr = dprRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear with background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!token) return;

    const text = token.originalText;
    const orpIdx = getORP(text);
    
    // Dynamic font size
    const baseFontSize = settings.fontSize || 18;
    const fontSize = Math.max(baseFontSize * 2.5, 40);
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
    
    // ORP locked at center
    const centerX = (width * dpr) / 2;
    const centerY = (height * dpr) / 2;
    const orpCenterX = centerX - orpWidth / 2;
    const startX = orpCenterX - leftWidth;
    
    // Draw left part
    ctx.fillStyle = theme.primaryText;
    ctx.fillText(leftPart, startX, centerY);
    
    // Draw ORP character
    ctx.fillStyle = '#E25822';
    ctx.shadowColor = '#E2582240';
    ctx.shadowBlur = 20 * dpr;
    ctx.fillText(orpChar, orpCenterX, centerY);
    ctx.shadowBlur = 0;
    
    // Draw right part
    ctx.fillStyle = theme.primaryText;
    ctx.fillText(rightPart, orpCenterX + orpWidth, centerY);
    
    // Punctuation
    if (punct) {
      ctx.fillStyle = theme.secondaryText;
      ctx.globalAlpha = 0.6;
      ctx.fillText(punct, orpCenterX + orpWidth + rightWidth, centerY);
      ctx.globalAlpha = 1;
    }

    // Subtle guide line
    ctx.fillStyle = '#E25822';
    ctx.globalAlpha = 0.08;
    const lineTop = height * 0.35 * dpr;
    const lineBottom = height * 0.65 * dpr;
    ctx.fillRect(centerX - dpr, lineTop, 2 * dpr, lineBottom - lineTop);
    ctx.globalAlpha = 1;

    // Preview when paused
    if (!stream.isPlaying) {
      const tokens = stream.tokens;
      const currentIdx = stream.currentIndex;
      
      ctx.font = `400 ${fontSize * 0.35 * dpr}px ${fontFamily}`;
      ctx.fillStyle = theme.secondaryText;
      ctx.globalAlpha = 0.35;
      
      const upcomingWords: string[] = [];
      for (let i = currentIdx + 1; i <= Math.min(tokens.length - 1, currentIdx + 3); i++) {
        const nextToken = tokens[i];
        if (nextToken) upcomingWords.push(nextToken.originalText + (nextToken.punctuation || ''));
      }
      
      if (upcomingWords.length > 0) {
        const previewText = upcomingWords.join('  ');
        const previewWidth = ctx.measureText(previewText).width;
        ctx.fillText(previewText, centerX - previewWidth / 2, centerY + fontSize * dpr * 0.8);
      }
      ctx.globalAlpha = 1;
    }

    // Progress bar
    const progress = stream.progress;
    const barY = height * 0.92 * dpr;
    const barHeight = 2 * dpr;
    const barMargin = 32 * dpr;
    const barWidth = (width * dpr) - (barMargin * 2);
    
    ctx.fillStyle = theme.borderColor;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.roundRect(barMargin, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    
    ctx.fillStyle = '#E25822';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.roundRect(barMargin, barY, barWidth * progress, barHeight, barHeight / 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Paused indicator
    if (!stream.isPlaying) {
      ctx.font = `500 ${12 * dpr}px ${fontFamily}`;
      ctx.fillStyle = theme.secondaryText;
      ctx.globalAlpha = 0.5;
      const pausedText = 'PAUSED';
      const pausedWidth = ctx.measureText(pausedText).width;
      ctx.fillText(pausedText, centerX - pausedWidth / 2, 24 * dpr);
      ctx.globalAlpha = 1;
    }
  }, [theme, settings, getORP, getFontFamily]);

  // Animation loop for fallback mode
  const animationLoop = useCallback(() => {
    renderFallback();
    if (stream.isPlaying) {
      rafRef.current = requestAnimationFrame(animationLoop);
    }
  }, [renderFallback]);

  // Setup canvas and worker
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    // Try to initialize OffscreenCanvas worker
    const worker = RSVPRenderWorker.getInstance();
    const usingWorker = worker.init(canvas);
    useWorkerRef.current = usingWorker;
    workerRef.current = worker;

    if (usingWorker) {
      console.log('[FlowCanvas] Using OffscreenCanvas worker for rendering');
      
      // Send initial settings
      worker.setTheme({
        background: theme.background,
        primaryText: theme.primaryText,
        secondaryText: theme.secondaryText,
        borderColor: theme.borderColor
      });
      worker.setSettings({
        fontSize: Math.max((settings.fontSize || 18) * 2.5, 40),
        fontFamily: getFontFamily(),
        showPreview: true
      });
      worker.setTokens(stream.tokens);
    } else {
      console.log('[FlowCanvas] Falling back to main thread rendering');
      // Setup fallback canvas
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    // Resize handler
    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (usingWorker && workerRef.current) {
        workerRef.current.resize(width, height);
      } else {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        renderFallback();
      }
    };

    window.addEventListener('resize', resize);

    // Subscribe to stream updates
    const unsubscribe = stream.subscribe(() => {
      const idx = stream.currentIndex;
      const token = stream.currentToken;
      const isPlaying = stream.isPlaying;
      
      if (usingWorker && workerRef.current) {
        // Send to worker
        workerRef.current.setToken(token, idx, isPlaying);
      } else {
        // Fallback rendering
        if (idx !== lastIndexRef.current || !isPlaying) {
          lastIndexRef.current = idx;
          
          if (isPlaying && !rafRef.current) {
            animationLoop();
          } else if (!isPlaying) {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            renderFallback();
          }
        }
      }
    });

    // Initial render
    if (usingWorker && workerRef.current) {
      workerRef.current.setToken(stream.currentToken, stream.currentIndex, stream.isPlaying);
    } else {
      renderFallback();
    }

    return () => {
      window.removeEventListener('resize', resize);
      unsubscribe();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      // Don't terminate worker - it's a singleton
    };
  }, [renderFallback, animationLoop, getFontFamily]);

  // Update worker when theme/settings change
  useEffect(() => {
    if (useWorkerRef.current && workerRef.current) {
      workerRef.current.setTheme({
        background: theme.background,
        primaryText: theme.primaryText,
        secondaryText: theme.secondaryText,
        borderColor: theme.borderColor
      });
      workerRef.current.setSettings({
        fontSize: Math.max((settings.fontSize || 18) * 2.5, 40),
        fontFamily: getFontFamily(),
        showPreview: true
      });
    } else {
      renderFallback();
    }
  }, [theme, settings, renderFallback, getFontFamily]);

  // Update tokens when they change
  useEffect(() => {
    if (useWorkerRef.current && workerRef.current) {
      workerRef.current.setTokens(stream.tokens);
    }
  }, [stream.tokens]);

  // Tap handler
  const handleClick = useCallback(() => {
    RSVPHapticEngine.impactLight();
    onTap?.();
  }, [onTap]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 select-none"
      style={{ 
        backgroundColor: theme.background,
        // GPU compositor hints
        willChange: 'contents',
        contain: 'strict',
      }}
      onClick={handleClick}
    >
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ 
          touchAction: 'none',
          // GPU layer promotion
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />
    </div>
  );
});
