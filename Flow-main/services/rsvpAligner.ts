import { RSVPToken } from '../types';

export interface RSVPLayoutConfig {
  fontFamily: string;
  fontSize: number;
  leftWeight: number | string;
  centerWeight: number | string;
  letterSpacing: number; // In pixels
  screenCenter: number;
}

/**
 * RSVPAligner
 * The Layout Engineer for the Speed Reader.
 * Calculates the precise X-offset to align the Optimal Recognition Point (ORP) to the screen center.
 */
export class RSVPAligner {
  private static cache = new Map<string, number>();
  private static canvas: HTMLCanvasElement | null = null;
  private static context: CanvasRenderingContext2D | null = null;

  /**
   * Calculates the shift required to align the token's ORP (centerCharacter) to the center.
   * Uses a segmented measurement approach to better simulate browser text layout.
   */
  /**
   * Adaptive ORP: For each word, select the most visually stable character as the focus (not just the middle).
   * For short words, bias to the first consonant; for long, bias to a stable center.
   */
  public static getAdaptiveORP(text: string): number {
    if (text.length <= 1) return 0;
    if (text.length <= 4) {
      // For very short words, prefer the first consonant if possible
      const match = /[^aeiou]/i.exec(text);
      return match ? match.index! : 0;
    }
    // For longer words, bias to a visually stable center (avoid i/l/1 if possible)
    const center = Math.floor(text.length / 2);
    const stable = /[mwMWzZxXvVtTnN]/;
    if (stable.test(text[center])) return center;
    // Search left/right for a stable char
    for (let offset = 1; offset < text.length / 2; ++offset) {
      if (center - offset >= 0 && stable.test(text[center - offset])) return center - offset;
      if (center + offset < text.length && stable.test(text[center + offset])) return center + offset;
    }
    return center;
  }

  public static calculateOffset(token: RSVPToken, config: RSVPLayoutConfig): number {
    const cacheKey = `${token.id}-${config.fontFamily}-${config.fontSize}-${config.leftWeight}-${config.centerWeight}-${config.letterSpacing}-${config.screenCenter}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Use DOM measurement if available
    if (typeof document !== 'undefined' && document.body) {
      try {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.visibility = 'hidden';
        container.style.whiteSpace = 'nowrap';
        container.style.font = `${config.leftWeight} ${config.fontSize}px ${config.fontFamily}`;

        // Adaptive ORP
        const full = (token.leftSegment || '') + (token.centerCharacter || '') + (token.rightSegment || '');
        const orpIdx = RSVPAligner.getAdaptiveORP(full);

        // Build spans
        const leftSpan = document.createElement('span');
        leftSpan.textContent = full.slice(0, orpIdx);
        const centerSpan = document.createElement('span');
        centerSpan.style.font = `${config.centerWeight} ${config.fontSize}px ${config.fontFamily}`;
        centerSpan.textContent = full[orpIdx] || '';
        // Micro-kerning: add letterSpacing for focus char
        centerSpan.style.letterSpacing = '0.02em';
        const rightSpan = document.createElement('span');
        rightSpan.textContent = full.slice(orpIdx + 1);

        container.appendChild(leftSpan);
        container.appendChild(centerSpan);
        container.appendChild(rightSpan);
        document.body.appendChild(container);

        // Measure left width and center char width
        const measure = document.createElement('span');
        measure.style.visibility = 'hidden';
        measure.style.position = 'absolute';
        measure.style.whiteSpace = 'nowrap';
        measure.style.font = window.getComputedStyle(leftSpan).font || `${config.leftWeight} ${config.fontSize}px ${config.fontFamily}`;

        // up to inclusive
        measure.textContent = full.substring(0, orpIdx + 1);
        container.appendChild(measure);
        const uptoInclusive = measure.getBoundingClientRect().width;
        container.removeChild(measure);

        // up to exclusive
        measure.textContent = full.substring(0, orpIdx);
        container.appendChild(measure);
        const uptoExclusive = measure.getBoundingClientRect().width;
        container.removeChild(measure);

        const charWidth = Math.max(0, uptoInclusive - uptoExclusive);
        const leftWidth = uptoExclusive;
        const orpCenterOffset = leftWidth + charWidth / 2;

        document.body.removeChild(container);

        const shift = -orpCenterOffset;
        this.cache.set(cacheKey, shift);
        return shift;
      } catch (e) {
        // fallback to canvas
      }
    }

    // Canvas fallback
    const ctx = this.getContext();
    const full = (token.leftSegment || '') + (token.centerCharacter || '') + (token.rightSegment || '');
    const orpIdx = RSVPAligner.getAdaptiveORP(full);
    const baseFont = `${config.leftWeight} ${config.fontSize}px ${config.fontFamily}`;
    const focusFont = `${config.centerWeight} ${config.fontSize}px ${config.fontFamily}`;
    ctx.font = baseFont;
    const leftWidth = this.measureAccurate(ctx, full.slice(0, orpIdx), config.letterSpacing);
    ctx.font = focusFont;
    const centerWidth = this.measureAccurate(ctx, full[orpIdx] || '', config.letterSpacing);
    const gap = (orpIdx > 0 && full[orpIdx]) ? config.letterSpacing : 0;
    const orpCenterOffset = leftWidth + gap + (centerWidth / 2);
    const shift = -orpCenterOffset;
    this.cache.set(cacheKey, shift);
    return shift;
  }

  /**
   * Measures text width accounting for manual letter spacing (tracking).
   */
  private static measureAccurate(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
    if (!text) return 0;
    // measureText doesn't account for letter-spacing, so we sum character widths + spacing
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      width += ctx.measureText(text[i]).width;
      if (i < text.length - 1) {
        width += letterSpacing;
      }
    }
    return width;
  }

  private static getContext(): CanvasRenderingContext2D {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d', { alpha: false });
    }
    if (!this.context) {
      throw new Error("[RSVPAligner] Failed to initialize Canvas context.");
    }
    return this.context;
  }

  public static clearCache() {
    this.cache.clear();
  }
}