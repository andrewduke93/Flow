/**
 * RSVP Render Worker
 * 
 * High-performance OffscreenCanvas renderer running on a dedicated thread.
 * This eliminates main thread blocking during RSVP display, achieving
 * near-native rendering performance.
 * 
 * Benefits:
 * - Zero main thread blocking during render
 * - Consistent 60fps+ even during GC on main thread
 * - Direct GPU compositing
 * - No layout/reflow interference
 */

// Worker code as a string (will be blob-ified)
export const RSVP_RENDER_WORKER_CODE = `
// ═══════════════════════════════════════════════════════════════════════════════
// WORKER STATE
// ═══════════════════════════════════════════════════════════════════════════════

let canvas = null;
let ctx = null;
let dpr = 1;
let width = 0;
let height = 0;

// Rendering config
let theme = {
  background: '#000000',
  primaryText: '#FFFFFF',
  secondaryText: '#888888',
  borderColor: '#333333'
};
let fontSize = 48;
let fontFamily = 'system-ui, -apple-system, sans-serif';
const FOCUS_COLOR = '#E25822';

// Current state
let currentToken = null;
let tokens = [];
let currentIndex = 0;
let isPlaying = false;
let showPreview = true;

// Pre-rendered cache for upcoming words (ImageBitmap pool)
const wordCache = new Map();
const CACHE_SIZE = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// ORP CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

function getORP(text) {
  const len = text.length;
  if (len <= 1) return 0;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return Math.floor(len * 0.3);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

function render() {
  if (!ctx || !canvas) return;
  
  // Clear
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  if (!currentToken) return;
  
  const text = currentToken.originalText || '';
  const punct = currentToken.punctuation || '';
  const orpIdx = getORP(text);
  
  // Split word around ORP
  const leftPart = text.slice(0, orpIdx);
  const orpChar = text[orpIdx] || '';
  const rightPart = text.slice(orpIdx + 1);
  
  // Setup font
  const scaledFontSize = fontSize * dpr;
  ctx.font = '600 ' + scaledFontSize + 'px ' + fontFamily;
  ctx.textBaseline = 'middle';
  
  // Measure
  const leftWidth = ctx.measureText(leftPart).width;
  const orpWidth = ctx.measureText(orpChar).width;
  const rightWidth = ctx.measureText(rightPart).width;
  const punctWidth = punct ? ctx.measureText(punct).width : 0;
  
  // Position - ORP character locked at exact center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const orpCenterX = centerX - orpWidth / 2;
  const startX = orpCenterX - leftWidth;
  
  // Draw left part
  ctx.fillStyle = theme.primaryText;
  ctx.fillText(leftPart, startX, centerY);
  
  // Draw ORP character with glow
  ctx.fillStyle = FOCUS_COLOR;
  ctx.shadowColor = FOCUS_COLOR + '40';
  ctx.shadowBlur = 20 * dpr;
  ctx.fillText(orpChar, orpCenterX, centerY);
  ctx.shadowBlur = 0;
  
  // Draw right part
  ctx.fillStyle = theme.primaryText;
  ctx.fillText(rightPart, orpCenterX + orpWidth, centerY);
  
  // Draw punctuation
  if (punct) {
    ctx.fillStyle = theme.secondaryText;
    ctx.globalAlpha = 0.6;
    ctx.fillText(punct, orpCenterX + orpWidth + rightWidth, centerY);
    ctx.globalAlpha = 1;
  }
  
  // Subtle guide line
  ctx.fillStyle = FOCUS_COLOR;
  ctx.globalAlpha = 0.08;
  const lineTop = canvas.height * 0.35;
  const lineBottom = canvas.height * 0.65;
  ctx.fillRect(centerX - dpr, lineTop, 2 * dpr, lineBottom - lineTop);
  ctx.globalAlpha = 1;
  
  // Preview upcoming words when paused
  if (showPreview && !isPlaying && tokens.length > 0) {
    const previewFontSize = scaledFontSize * 0.35;
    ctx.font = '400 ' + previewFontSize + 'px ' + fontFamily;
    ctx.fillStyle = theme.secondaryText;
    ctx.globalAlpha = 0.35;
    
    const upcomingWords = [];
    for (let i = currentIndex + 1; i <= Math.min(tokens.length - 1, currentIndex + 3); i++) {
      const t = tokens[i];
      if (t) upcomingWords.push(t.originalText + (t.punctuation || ''));
    }
    
    if (upcomingWords.length > 0) {
      const previewText = upcomingWords.join('  ');
      const previewWidth = ctx.measureText(previewText).width;
      const previewY = centerY + scaledFontSize * 0.8;
      ctx.fillText(previewText, centerX - previewWidth / 2, previewY);
    }
    ctx.globalAlpha = 1;
  }
  
  // Progress bar
  const progress = tokens.length > 0 ? (currentIndex + 1) / tokens.length : 0;
  const barY = canvas.height * 0.92;
  const barHeight = 2 * dpr;
  const barMargin = 32 * dpr;
  const barWidth = canvas.width - (barMargin * 2);
  
  // Background track
  ctx.fillStyle = theme.borderColor;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.roundRect(barMargin, barY, barWidth, barHeight, barHeight / 2);
  ctx.fill();
  
  // Progress fill
  ctx.fillStyle = FOCUS_COLOR;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.roundRect(barMargin, barY, barWidth * progress, barHeight, barHeight / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Paused indicator
  if (!isPlaying) {
    const indicatorFontSize = 12 * dpr;
    ctx.font = '500 ' + indicatorFontSize + 'px ' + fontFamily;
    ctx.fillStyle = theme.secondaryText;
    ctx.globalAlpha = 0.5;
    const pausedText = 'PAUSED';
    const pausedWidth = ctx.measureText(pausedText).width;
    ctx.fillText(pausedText, centerX - pausedWidth / 2, 24 * dpr);
    ctx.globalAlpha = 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'init':
      // Transfer OffscreenCanvas
      canvas = data.canvas;
      ctx = canvas.getContext('2d', { 
        alpha: false,  // Opaque for performance
        desynchronized: true  // Reduce latency
      });
      dpr = data.dpr || 1;
      width = data.width;
      height = data.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      render();
      break;
      
    case 'resize':
      width = data.width;
      height = data.height;
      dpr = data.dpr || dpr;
      if (canvas) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      render();
      break;
      
    case 'theme':
      theme = data;
      render();
      break;
      
    case 'settings':
      fontSize = data.fontSize || fontSize;
      fontFamily = data.fontFamily || fontFamily;
      showPreview = data.showPreview !== false;
      render();
      break;
      
    case 'token':
      currentToken = data.token;
      currentIndex = data.index;
      isPlaying = data.isPlaying;
      render();
      break;
      
    case 'tokens':
      tokens = data;
      break;
      
    case 'state':
      isPlaying = data.isPlaying;
      render();
      break;
      
    case 'render':
      render();
      break;
  }
};
`;

/**
 * RSVPRenderWorker Manager
 * 
 * Singleton that manages the OffscreenCanvas render worker.
 */
export class RSVPRenderWorker {
  private static instance: RSVPRenderWorker | null = null;
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): RSVPRenderWorker {
    if (!RSVPRenderWorker.instance) {
      RSVPRenderWorker.instance = new RSVPRenderWorker();
    }
    return RSVPRenderWorker.instance;
  }

  /**
   * Initialize with a canvas element.
   * Transfers rendering to OffscreenCanvas worker.
   */
  init(canvas: HTMLCanvasElement): boolean {
    // Check for OffscreenCanvas support
    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('OffscreenCanvas not supported, falling back to main thread');
      return false;
    }

    try {
      this.canvas = canvas;
      
      // Create worker
      const blob = new Blob([RSVP_RENDER_WORKER_CODE], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerUrl);

      // Transfer canvas to worker
      const offscreen = canvas.transferControlToOffscreen();
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      this.worker.postMessage({
        type: 'init',
        data: {
          canvas: offscreen,
          dpr,
          width: rect.width,
          height: rect.height
        }
      }, [offscreen]);

      this.isInitialized = true;
      return true;
    } catch (e) {
      console.error('Failed to initialize OffscreenCanvas worker:', e);
      return false;
    }
  }

  /**
   * Check if worker is active
   */
  get active(): boolean {
    return this.isInitialized && this.worker !== null;
  }

  /**
   * Update canvas size
   */
  resize(width: number, height: number) {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'resize',
      data: { width, height, dpr: window.devicePixelRatio || 1 }
    });
  }

  /**
   * Update theme colors
   */
  setTheme(theme: { background: string; primaryText: string; secondaryText: string; borderColor: string }) {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'theme', data: theme });
  }

  /**
   * Update rendering settings
   */
  setSettings(settings: { fontSize?: number; fontFamily?: string; showPreview?: boolean }) {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'settings', data: settings });
  }

  /**
   * Update current token to display
   */
  setToken(token: any, index: number, isPlaying: boolean) {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'token',
      data: { token, index, isPlaying }
    });
  }

  /**
   * Set all tokens (for progress calculation)
   */
  setTokens(tokens: any[]) {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'tokens', data: tokens });
  }

  /**
   * Update play state
   */
  setPlayState(isPlaying: boolean) {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'state', data: { isPlaying } });
  }

  /**
   * Force a render
   */
  render() {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'render' });
  }

  /**
   * Clean up resources
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    this.isInitialized = false;
    this.canvas = null;
  }
}
