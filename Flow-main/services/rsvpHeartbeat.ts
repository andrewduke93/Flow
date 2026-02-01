import { RSVPToken } from '../types';

/**
 * RSVPHeartbeat (Phase 7-D)
 * The High-Precision Refresh Engine.
 * Manages the "Game Loop" for word playback using requestAnimationFrame (web equivalent of CADisplayLink) 
 * to ensure zero-latency updates and precise WPM timing.
 * 
 * Update Phase 9-F: Velocity Ramp & Re-Entry Logic.
 * Update Phase 10: Sentence Chunking for natural rhythm.
 * Performance Optimized: Batched React notifications, RAF-based timing, microtask batching.
 * 
 * Identity: Game Engine Engineer / Systems Architect.
 */

// Sentence-ending punctuation for natural rhythm detection
const SENTENCE_ENDERS = new Set(['.', '!', '?', '…', '‽']);
const CLAUSE_PAUSERS = new Set([';', ':', '—', '–']);

export class RSVPHeartbeat {
  private static instance: RSVPHeartbeat;
  
  // -- State --
  public tokens: RSVPToken[] = [];
  public currentIndex: number = 0;
  public wpm: number = 150; // Cold Start Default
  
  // Phase 9-F: Velocity Ramp State
  // Tracks how many words have been shown since 'Play' started.
  // 0 = 1st word (2.0x slow), 1 = 2nd word (1.5x slow), 2 = 3rd word (1.2x slow), 3+ = Normal.
  public rampStep: number = 3; 

  // Phase 10: Sentence Chunking
  // Natural reading rhythm - boost pauses at sentence boundaries
  private sentenceBoostEnabled: boolean = true;
  private wordsInCurrentSentence: number = 0;

  // Internal Engine State
  private _isPlaying: boolean = false;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private accumulatedTime: number = 0; // Time spent on current token in seconds

  // Observability
  private listeners: Set<() => void> = new Set();
  private completionListeners: Set<() => void> = new Set();
  
  // PERFORMANCE: Batched notification
  private notifyScheduled: boolean = false;

  private constructor() {}

  public static getInstance(): RSVPHeartbeat {
    if (!RSVPHeartbeat.instance) {
      RSVPHeartbeat.instance = new RSVPHeartbeat();
    }
    return RSVPHeartbeat.instance;
  }

  // -- Public Getters --

  public get currentToken(): RSVPToken | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.tokens.length) {
      return this.tokens[this.currentIndex];
    }
    return null;
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  // -- Controls --

  /**
   * Loads a new playlist of tokens into the engine.
   */
  public setTokens(tokens: RSVPToken[]) {
    this.tokens = tokens;
    // Do not reset index here automatically; allow seeking logic to handle it.
    // However, if index is out of bounds, reset it.
    if (this.currentIndex >= tokens.length) {
      this.currentIndex = 0;
    }
    this.notify();
  }

  public clear() {
      this.pause(); // Just pause, don't stop/rewind
      this.tokens = [];
      this.currentIndex = 0;
      this.notify();
  }

  public play() {
    if (this._isPlaying) return;
    if (this.tokens.length === 0) return;
    if (this.currentIndex >= this.tokens.length - 1) {
        // Restart if at end
        this.currentIndex = 0;
    }

    this._isPlaying = true;
    this.lastFrameTime = 0; // Reset frame timer
    this.accumulatedTime = 0; // Reset token timer
    
    // Phase 9-F: Velocity Ramp
    // Only reset ramp on COLD start (index 0), not on resume
    // This prevents the slow start feel when pausing and resuming
    if (this.currentIndex === 0) {
      this.rampStep = 0; 
    }
    
    // Start the Game Loop
    this.loop(performance.now());
    this.notify();
  }

  public pause() {
    if (!this._isPlaying) return;

    this._isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.notify();
  }

  /**
   * Hard Stop (Clean Exit Protocol)
   * Resets ephemeral animation state but PRESERVES currentIndex.
   */
  public stop() {
    this.pause();
    // CRITICAL FIX: Do NOT reset currentIndex to 0. 
    // We want to remember where we left off when the component unmounts.
    // this.currentIndex = 0; <--- DELETED
    
    this.accumulatedTime = 0;
    this.rampStep = 3;
    
    // Force cleanup if something leaked
    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }
    this.notify();
  }

  public toggle() {
    if (this._isPlaying) this.pause();
    else this.play();
  }

  public seek(index: number) {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.pause();

    // Clamp index
    this.currentIndex = Math.max(0, Math.min(index, this.tokens.length - 1));
    this.accumulatedTime = 0;

    this.notify();
    
    if (wasPlaying) this.play();
  }

  public updateWPM(wpm: number) {
    this.wpm = Math.max(50, Math.min(2000, wpm)); // Clamp safety
    this.notify(); // CRITICAL: Notify UI of speed change
  }

  // -- The Engine Loop --

  /**
   * The Tick Logic (High-Performance Game Loop).
   * Called every screen refresh (approx 60Hz or 120Hz).
   * Optimized for zero jank and precise WPM timing.
   */
  private loop = (timestamp: number) => {
    if (!this._isPlaying) return;

    // 1. Initialize Frame Time
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
      this.animationFrameId = requestAnimationFrame(this.loop);
      return;
    }

    // 2. Calculate Delta Time (in Seconds)
    const deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    // Safety: Cap deltaTime to 0.1s to prevent huge jumps if tab was backgrounded
    const safeDelta = Math.min(deltaTime, 0.1);

    // 3. Accumulate Time
    this.accumulatedTime += safeDelta;

    // 4. Determine Required Duration for Current Token
    const token = this.currentToken;
    if (!token) {
      this.finish();
      return;
    }

    // WPM Math: 60 seconds / WPM = seconds per base word
    const baseDuration = 60.0 / this.wpm;
    
    // Phase 9-F: Velocity Ramp Multiplier
    let rampMultiplier = 1.0;
    if (this.rampStep === 0) rampMultiplier = 2.0;       // Slow start
    else if (this.rampStep === 1) rampMultiplier = 1.5;  // Picking up
    else if (this.rampStep === 2) rampMultiplier = 1.2;  // Almost there

    // Phase 10: Sentence Chunking - Natural Rhythm Boost
    // At higher WPM, the token's durationMultiplier might not create enough
    // perceptual pause. Add an extra sentence-boundary boost.
    let sentenceBoost = 1.0;
    if (this.sentenceBoostEnabled && token.originalText) {
      const word = token.originalText;
      const lastChar = word.length > 0 ? word.charAt(word.length - 1) : '';
      const secondLastChar = word.length > 1 ? word.charAt(word.length - 2) : '';
      
      // Check for sentence-ending punctuation (including inside quotes)
      const endsWithSentence = SENTENCE_ENDERS.has(lastChar) || 
        (lastChar === '"' && SENTENCE_ENDERS.has(secondLastChar)) ||
        (lastChar === "'" && SENTENCE_ENDERS.has(secondLastChar)) ||
        (lastChar === '\u201D' && SENTENCE_ENDERS.has(secondLastChar)) ||
        (lastChar === '\u2019' && SENTENCE_ENDERS.has(secondLastChar));
      
      const endsWithClause = CLAUSE_PAUSERS.has(lastChar);
      
      if (endsWithSentence) {
        // Sentence boundary: add perceptual pause that scales with WPM
        // At higher speeds, we need MORE relative pause to notice it
        const speedFactor = Math.max(1.0, this.wpm / 200);
        sentenceBoost = 1.0 + (0.3 * speedFactor);
        this.wordsInCurrentSentence = 0;
      } else if (endsWithClause) {
        // Clause boundary: smaller pause
        sentenceBoost = 1.15;
      } else {
        this.wordsInCurrentSentence++;
      }
    }

    const requiredDuration = baseDuration * token.durationMultiplier * rampMultiplier * sentenceBoost;

    // 5. Check Threshold
    if (this.accumulatedTime >= requiredDuration) {
      // Advance to next token
      this.advance();
      
      // Preserve the overflow time (Jitter reduction)
      this.accumulatedTime -= requiredDuration; 
    }

    // 6. Schedule Next Frame
    if (this._isPlaying) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };

  private advance() {
    if (this.currentIndex < this.tokens.length - 1) {
      this.currentIndex++;
      // Increment Ramp Step until capped at 3
      if (this.rampStep < 3) this.rampStep++;
      
      this.notify();
    } else {
      this.finish();
    }
  }

  private finish() {
    this.pause();
    this.currentIndex = this.tokens.length - 1; // Ensure sat at end
    this.notify();
    this.completionListeners.forEach(cb => cb());
  }

  // -- React Observability --

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public onComplete(callback: () => void): () => void {
    this.completionListeners.add(callback);
    return () => this.completionListeners.delete(callback);
  }

  /**
   * Batched notification system for React optimization.
   * Prevents excessive React re-renders during rapid heartbeat updates.
   */
  notify() {
    // During playback, batch notifications to prevent excessive React renders
    if (this._isPlaying && !this.notifyScheduled) {
      this.notifyScheduled = true;
      // Use microtask for immediate batching within same frame
      queueMicrotask(() => {
        this.notifyScheduled = false;
        this.listeners.forEach(cb => cb());
      });
    } else if (!this._isPlaying) {
      // When paused/stopped, notify immediately for responsive UI
      this.listeners.forEach(cb => cb());
    }
  }
}