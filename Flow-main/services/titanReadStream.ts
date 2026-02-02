import { RSVPToken } from '../types';
import { RSVPProcessor } from './rsvpProcessor';
import { TitanSettingsService } from './configService';

/**
 * TitanReadStream - The Unified Reading Engine
 * 
 * Philosophy: There's only ONE position in a book at any time.
 * Scroll view and RSVP are just different PRESENTATIONS of the same stream.
 * 
 * The stream is always "playing" conceptually - either:
 * - Auto-advancing (RSVP mode) 
 * - User-driven (scroll mode, where "speed" = user's scroll velocity)
 * 
 * This unification means:
 * - Seamless mode switching (no position recalculation)
 * - Single source of truth for progress
 * - Canvas can render either mode efficiently
 */

// Sentence-ending punctuation for natural rhythm
const SENTENCE_ENDERS = new Set(['.', '!', '?', '…', '‽']);
const CLAUSE_PAUSERS = new Set([';', ':', '—', '–']);

export type StreamMode = 'scroll' | 'rsvp';
export type PlayState = 'idle' | 'playing' | 'paused';

export interface StreamPosition {
  tokenIndex: number;
  progress: number; // 0-1
  characterOffset: number;
}

export class TitanReadStream {
  private static instance: TitanReadStream;
  
  // Core state
  private _tokens: RSVPToken[] = [];
  private _currentIndex: number = 0;
  private _mode: StreamMode = 'scroll';
  private _playState: PlayState = 'idle';
  private _wpm: number = 250;
  
  // Animation engine
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private accumulatedTime: number = 0;
  
  // Velocity ramp (soft start)
  private rampStep: number = 3;
  private wordsInSentence: number = 0;
  
  // Observers
  private listeners: Set<() => void> = new Set();
  private positionListeners: Set<(pos: StreamPosition) => void> = new Set();
  private completionListeners: Set<() => void> = new Set();
  
  // Batched notifications
  private notifyScheduled: boolean = false;
  
  // Content cache
  private lastContentRef: string | null = null;
  private preparationPromise: Promise<void> | null = null;

  // Wake lock
  private wakeLock: WakeLockSentinel | null = null;

  private constructor() {
    const settings = TitanSettingsService.getInstance();
    this._wpm = settings.getSettings().rsvpSpeed || 250;
    
    settings.subscribe(() => {
      const newWpm = settings.getSettings().rsvpSpeed;
      if (newWpm !== this._wpm) {
        this._wpm = newWpm;
        this.notify();
      }
    });

    // Re-acquire wake lock on visibility change
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this._playState === 'playing') {
        await this.requestWakeLock();
      }
    });
  }

  static getInstance(): TitanReadStream {
    if (!TitanReadStream.instance) {
      TitanReadStream.instance = new TitanReadStream();
    }
    return TitanReadStream.instance;
  }

  // === Public Getters ===
  
  get tokens(): RSVPToken[] { return this._tokens; }
  get currentIndex(): number { return this._currentIndex; }
  get mode(): StreamMode { return this._mode; }
  get playState(): PlayState { return this._playState; }
  get wpm(): number { return this._wpm; }
  get isPlaying(): boolean { return this._playState === 'playing'; }
  
  get currentToken(): RSVPToken | null {
    return this._tokens[this._currentIndex] || null;
  }
  
  get progress(): number {
    if (this._tokens.length === 0) return 0;
    return this._currentIndex / this._tokens.length;
  }

  get position(): StreamPosition {
    const token = this.currentToken;
    return {
      tokenIndex: this._currentIndex,
      progress: this.progress,
      characterOffset: token?.startOffset ?? 0
    };
  }

  // === Content Loading ===

  async loadContent(content: string, startPosition?: Partial<StreamPosition>): Promise<void> {
    // Fast path: cache hit
    if (this.lastContentRef === content && this._tokens.length > 0) {
      if (startPosition) this.seek(startPosition);
      return;
    }

    // Dedupe in-flight requests
    if (this.preparationPromise) {
      await this.preparationPromise;
      if (this.lastContentRef === content) {
        if (startPosition) this.seek(startPosition);
        return;
      }
    }

    // Process content
    this.preparationPromise = (async () => {
      try {
        const tokens = await RSVPProcessor.process(content);
        this._tokens = tokens;
        this.lastContentRef = content;
      } finally {
        this.preparationPromise = null;
      }
    })();

    await this.preparationPromise;
    if (startPosition) this.seek(startPosition);
    this.notify();
  }

  clear() {
    this.pause();
    this._tokens = [];
    this._currentIndex = 0;
    this.lastContentRef = null;
    this.notify();
  }

  // === Mode Control ===

  setMode(mode: StreamMode) {
    if (this._mode === mode) return;
    
    const wasPlaying = this._playState === 'playing';
    if (wasPlaying) this.pause();
    
    this._mode = mode;
    
    // In scroll mode, we're always "paused" from auto-advance perspective
    if (mode === 'scroll') {
      this._playState = 'idle';
    }
    
    this.notify();
    this.emitPosition();
  }

  // === Playback Control ===

  play() {
    if (this._playState === 'playing') return;
    if (this._tokens.length === 0) return;
    if (this._mode !== 'rsvp') {
      // Automatically switch to RSVP when play is requested
      this._mode = 'rsvp';
    }

    // Restart if at end
    if (this._currentIndex >= this._tokens.length - 1) {
      this._currentIndex = 0;
    }

    this._playState = 'playing';
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;

    // Velocity ramp only on cold start
    if (this._currentIndex === 0) {
      this.rampStep = 0;
    }

    this.requestWakeLock();
    this.loop(performance.now());
    this.notify();
  }

  pause() {
    if (this._playState !== 'playing') return;
    
    this._playState = 'paused';
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.releaseWakeLock();
    this.notify();
    this.emitPosition();
  }

  toggle() {
    if (this._playState === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  // === Seeking ===

  seek(position: Partial<StreamPosition>) {
    const wasPlaying = this._playState === 'playing';
    if (wasPlaying) this.pause();

    if (position.tokenIndex !== undefined) {
      this._currentIndex = Math.max(0, Math.min(position.tokenIndex, this._tokens.length - 1));
    } else if (position.progress !== undefined) {
      this._currentIndex = Math.floor(position.progress * this._tokens.length);
    } else if (position.characterOffset !== undefined) {
      const idx = this._tokens.findIndex(t => t.startOffset >= position.characterOffset!);
      this._currentIndex = idx >= 0 ? idx : this._tokens.length - 1;
    }

    this.accumulatedTime = 0;
    this.notify();
    this.emitPosition();

    if (wasPlaying) this.play();
  }

  seekByTokens(delta: number) {
    const newIndex = Math.max(0, Math.min(this._currentIndex + delta, this._tokens.length - 1));
    if (newIndex !== this._currentIndex) {
      this._currentIndex = newIndex;
      this.accumulatedTime = 0;
      this.notify();
      this.emitPosition();
    }
  }

  // === The Engine Loop ===

  private loop = (timestamp: number) => {
    if (this._playState !== 'playing') return;

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
      this.animationFrameId = requestAnimationFrame(this.loop);
      return;
    }

    const deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    // Cap to prevent huge jumps when tab was backgrounded
    const safeDelta = Math.min(deltaTime, 0.1);
    this.accumulatedTime += safeDelta;

    const token = this.currentToken;
    if (!token) {
      this.finish();
      return;
    }

    // Calculate required duration
    const baseDuration = 60.0 / this._wpm;
    
    // Velocity ramp
    let rampMult = 1.0;
    if (this.rampStep === 0) rampMult = 2.0;
    else if (this.rampStep === 1) rampMult = 1.5;
    else if (this.rampStep === 2) rampMult = 1.2;

    // Sentence rhythm boost
    let sentenceBoost = 1.0;
    const word = token.originalText;
    const lastChar = word.charAt(word.length - 1);
    const secondLast = word.charAt(word.length - 2);
    
    const endsWithSentence = SENTENCE_ENDERS.has(lastChar) ||
      (lastChar === '"' && SENTENCE_ENDERS.has(secondLast)) ||
      (lastChar === '\u201D' && SENTENCE_ENDERS.has(secondLast));
    
    if (endsWithSentence) {
      const speedFactor = Math.max(1.0, this._wpm / 200);
      sentenceBoost = 1.0 + (0.3 * speedFactor);
      this.wordsInSentence = 0;
    } else if (CLAUSE_PAUSERS.has(lastChar)) {
      sentenceBoost = 1.15;
    } else {
      this.wordsInSentence++;
    }

    const requiredDuration = baseDuration * token.durationMultiplier * rampMult * sentenceBoost;

    if (this.accumulatedTime >= requiredDuration) {
      this.advance();
      this.accumulatedTime -= requiredDuration;
    }

    if (this._playState === 'playing') {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };

  private advance() {
    if (this._currentIndex < this._tokens.length - 1) {
      this._currentIndex++;
      if (this.rampStep < 3) this.rampStep++;
      this.notify();
    } else {
      this.finish();
    }
  }

  private finish() {
    this.pause();
    this._currentIndex = this._tokens.length - 1;
    this._playState = 'idle';
    this.notify();
    this.completionListeners.forEach(cb => cb());
  }

  // === Wake Lock ===

  private async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      // Silently fail - not critical
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  // === Observability ===

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onPositionChange(callback: (pos: StreamPosition) => void): () => void {
    this.positionListeners.add(callback);
    return () => this.positionListeners.delete(callback);
  }

  onComplete(callback: () => void): () => void {
    this.completionListeners.add(callback);
    return () => this.completionListeners.delete(callback);
  }

  private notify() {
    if (this._playState === 'playing' && !this.notifyScheduled) {
      this.notifyScheduled = true;
      queueMicrotask(() => {
        this.notifyScheduled = false;
        this.listeners.forEach(cb => cb());
      });
    } else if (this._playState !== 'playing') {
      this.listeners.forEach(cb => cb());
    }
  }

  private emitPosition() {
    const pos = this.position;
    this.positionListeners.forEach(cb => cb(pos));
  }

  // === Time Calculations ===

  getTimeRemaining(): number {
    const remaining = this._tokens.length - this._currentIndex;
    return Math.ceil(remaining / this._wpm);
  }

  getTimeRemainingFormatted(): string {
    const mins = this.getTimeRemaining();
    if (mins < 1) return '<1m';
    if (mins >= 60) return `${Math.floor(mins / 60)}h`;
    return `${mins}m`;
  }
}
