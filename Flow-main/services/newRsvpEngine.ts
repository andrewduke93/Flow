import { RSVPToken } from '../types';

type Subscriber = (state: { index: number; token: RSVPToken | null; isPlaying: boolean }) => void;

export class NewRSVPEngine {
  private worker: Worker | null = null;
  private tokens: RSVPToken[] = [];
  private rawTokens: { index: number; text: string; duration: number; }[] = [];
  private currentIndex = 0;
  private timer: number | null = null;
  private playing = false;
  private subscribers: Set<Subscriber> = new Set();
  private wpm = 300;

  constructor() {
    // Create worker using Vite-compatible URL import
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.worker = new Worker(new URL('./newRsvpWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data) return;
          if (data.type === 'chunk') {
            const incoming = (data.tokens || []).map((t: any) => ({ index: t.index, text: t.text, duration: t.duration }));
            // Append chunk in-order to rawTokens then map to RSVPTokens
            this.rawTokens = this.rawTokens.concat(incoming);
            this.tokens = mapRawToRSVPTokens(this.rawTokens, this.wpm);
            this.notify();
        } else if (data.type === 'progress') {
          // Could surface progress if needed; ignore for now
        } else if (data.type === 'prepared') {
          this.rawTokens = (data.tokens || []).map((t: any) => ({ index: t.index, text: t.text, duration: t.duration }));
          this.tokens = mapRawToRSVPTokens(this.rawTokens, this.wpm);
          this.currentIndex = 0;
          this.playing = false;
          this.notify();
        } else if (data.type === 'error') {
          console.error('newRsvpWorker error:', data.message);
        }
      };
    } catch (e) {
      console.warn('Failed to create RSVP worker', e);
      this.worker = null;
    }
  }

  public async prepare(content: string, wpm = 300, chunkSize = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      // store requested wpm for mapping and scheduling
      this.wpm = wpm;
      if (!this.worker) {
        // Fallback: simple main-thread tokenization
        const words = content.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
          this.rawTokens = words.map((w, i) => ({ index: i, text: w, duration: Math.round(60000 / Math.max(1, wpm)) }));
          this.tokens = mapRawToRSVPTokens(this.rawTokens, this.wpm);
        this.currentIndex = 0;
        this.notify();
        resolve();
        return;
      }

      // Reset tokens and post prepare; resolve when final 'prepared' arrives
      let finished = false;
      const onPrepared = (ev: MessageEvent) => {
        const d = ev.data;
        if (!d) return;
        if (d.type === 'prepared') {
          finished = true;
          this.worker!.removeEventListener('message', onPrepared);
          this.tokens = (d.tokens || []).map((t: any) => ({ index: t.index, text: t.text, duration: t.duration }));
          this.currentIndex = 0;
          this.notify();
          resolve();
        } else if (d.type === 'error') {
          finished = true;
          this.worker!.removeEventListener('message', onPrepared);
          reject(new Error(d.message || 'Worker error'));
        }
      };

      // Clear any staging tokens
      this.tokens = [];
      this.worker.addEventListener('message', onPrepared);
      this.worker.postMessage({ type: 'prepare', content, wpm, chunkSize });
    });
  }

  public play() {
    if (this.playing) return;
    if (this.tokens.length === 0) return;
    this.playing = true;
    this.scheduleNext();
    this.notify();
  }

  public pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.notify();
  }

  public togglePlay() {
    if (this.playing) this.pause(); else this.play();
  }

  public seek(index: number) {
    this.currentIndex = Math.max(0, Math.min(index, this.tokens.length - 1));
    if (this.playing) {
      if (this.timer) window.clearTimeout(this.timer);
      this.scheduleNext();
    }
    this.notify();
  }

  public getCurrent() {
    return this.tokens[this.currentIndex] || null;
  }

  private scheduleNext() {
    const token = this.tokens[this.currentIndex];
    if (!token) {
      this.playing = false;
      this.notify();
      return;
    }
    this.notify();
    const baseMs = Math.round(60000 / Math.max(1, this.wpm || 300));
    const duration = (token as any).durationMultiplier ? Math.round(baseMs * (token as any).durationMultiplier) : baseMs;
    this.timer = window.setTimeout(() => {
      this.currentIndex = Math.min(this.tokens.length - 1, this.currentIndex + 1);
      if (this.currentIndex >= this.tokens.length - 1) {
        this.playing = false;
        this.notify();
        this.timer = null;
        return;
      }
      this.scheduleNext();
    }, duration);
  }

  public subscribe(cb: Subscriber) {
    this.subscribers.add(cb);
    // Emit initial state
    cb({ index: this.currentIndex, token: this.getCurrent(), isPlaying: this.playing });
    return () => this.subscribers.delete(cb);
  }

  // Allow external consumers to update WPM and remap durations
  public updateWPM(wpm: number) {
    this.wpm = Math.max(1, Math.floor(wpm || 300));
    // Recompute mapped tokens from raw tokens
    this.tokens = mapRawToRSVPTokens(this.rawTokens, this.wpm);
    this.notify();
  }

  // Synchronous helpers for migration — provide safe, read-only accessors so callers
  // don't need to rely on the legacy `RSVPHeartbeat`.
  public getIndex(): number {
    return this.currentIndex;
  }

  public getTokens(): RSVPToken[] {
    return this.tokens.slice();
  }

  // Expose raw token data for migration purposes
  public getTokensRaw(): { index: number; text: string; duration: number }[] {
    return this.rawTokens.map(t => ({ index: t.index ?? 0, text: t.text ?? '', duration: t.duration ?? 0 }));
  }

  private notify() {
    const token = this.getCurrent();
    this.subscribers.forEach((s) => s({ index: this.currentIndex, token, isPlaying: this.playing }));
  }
}

// Export a shared instance for simple integration
export const newRsvpEngine = new NewRSVPEngine();

// Helper: Map raw engine tokens into RSVPToken shape for UI migration
export function mapRawToRSVPTokens(raw: { index: number; text: string; duration: number }[], wpm: number): RSVPToken[] {
  const baseDuration = 60000 / Math.max(1, wpm);
  return (raw || []).map(r => {
    const txt = (r.text || '').trim();
    const len = txt.length;
    const orpIdx = Math.max(0, Math.floor(len / 2));
    const left = txt.slice(0, orpIdx);
    const center = txt.charAt(orpIdx) || '';
    const right = txt.slice(orpIdx + 1);
    const punctMatch = txt.match(/[.!?,;:]+$/);
    const durationMultiplier = r.duration ? (r.duration / baseDuration) : 1.0;
    return {
      id: `e-${r.index}`,
      originalText: txt,
      leftSegment: left,
      centerCharacter: center,
      rightSegment: right,
      punctuation: punctMatch ? punctMatch[0] : undefined,
      durationMultiplier,
      isSentenceEnd: !!punctMatch && /[.!?]/.test(punctMatch[0]),
      isParagraphEnd: false,
      globalIndex: r.index,
      startOffset: -1
    } as RSVPToken;
  });
}
