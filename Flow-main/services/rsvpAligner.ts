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
  public static calculateOffset(token: RSVPToken, config: RSVPLayoutConfig): number {
    const cacheKey = `${token.id}-${config.fontFamily}-${config.fontSize}-${config.leftWeight}-${config.centerWeight}-${config.letterSpacing}-${config.screenCenter}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const ctx = this.getContext();
    
    // Set base styles
    const baseFont = `${config.leftWeight} ${config.fontSize}px ${config.fontFamily}`;
    const focusFont = `${config.centerWeight} ${config.fontSize}px ${config.fontFamily}`;

    // 1. Measure the width of the left segment
    ctx.font = baseFont;
    const leftWidth = this.measureAccurate(ctx, token.leftSegment, config.letterSpacing);

    // 2. Measure the width of the center character (ORP)
    ctx.font = focusFont;
    const centerWidth = this.measureAccurate(ctx, token.centerCharacter, config.letterSpacing);

    // 3. Spacing between segments
    // CSS tracking-tight adds a negative margin between the spans.
    const gap = (token.leftSegment.length > 0 && token.centerCharacter.length > 0) ? config.letterSpacing : 0;

    // 4. Center of the ORP character relative to the start of the word container
    const orpCenterOffset = leftWidth + gap + (centerWidth / 2);

    // The shift should bring the orpCenterOffset to 0
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