import { newRsvpEngine, mapRawToRSVPTokens } from './newRsvpEngine';
import { RSVPProcessor } from './rsvpProcessor';
import { TitanCore } from './titanCore';
import { RSVPHapticEngine } from './rsvpHaptics'; 
import { RSVPToken } from '../types';
import { TitanSettingsService } from './configService';

export enum RSVPState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED'
}

export interface RSVPStartConfig {
  progress?: number; // 0.0 to 1.0 (Fallback)
  offset?: number;   // Absolute character index (Precise)
  index?: number;    // Absolute token index (Most Precise - Source of Truth)
}

/**
 * RSVPConductor (Phase 15: Async Pipeline)
 * The Systems Logic Architect.
 * Orchestrates the RSVP session with async preparation.
 * Performance Optimized: Content caching, deduplication, batched notifications.
 */
export class RSVPConductor {
  private static instance: RSVPConductor;
  
    private engineIndex: number = 0;
  private core: TitanCore;

  public state: RSVPState = RSVPState.IDLE;
  private listeners: Set<() => void> = new Set();
  private lastSavedIndex: number = -1;

  // CACHING & DEDUPLICATION STATE
  private lastContentRef: string | null = null;
  private preparationPromise: Promise<void> | null = null;

  // Wake Lock Sentinel
  private wakeLock: WakeLockSentinel | null = null;
  
  // PERFORMANCE: Batched notification system
  private notifyScheduled: boolean = false;

  private constructor() {
        this.core = TitanCore.getInstance();

        // Subscribe to engine updates (newRsvpEngine is now the single source of truth)
        try {
            newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
                if (typeof index === 'number') this.engineIndex = index;

                if (!isPlaying && this.state === RSVPState.PLAYING) {
                    this.state = RSVPState.PAUSED;
                    this.releaseWakeLock();
                }

                if (typeof index === 'number' && Math.abs(index - this.lastSavedIndex) >= 100) {
                    this.syncProgressToCore(true, index, token);
                    this.lastSavedIndex = index;
                }

                // Detect finish
                const raw = newRsvpEngine.getTokensRaw();
                if (!isPlaying && raw && raw.length > 0 && index >= raw.length - 1) {
                    this.state = RSVPState.FINISHED;
                    this.releaseWakeLock();
                }

                this.notify();
            });
        } catch (e) {
            // ignore
        }

    const settingsService = TitanSettingsService.getInstance();
    const initialWPM = settingsService.getSettings().rsvpSpeed;
    this.updateWPM(initialWPM);

    settingsService.subscribe(() => {
      const newWPM = settingsService.getSettings().rsvpSpeed;
      this.updateWPM(newWPM);
    });

    // Re-acquire lock on visibility change if playing
    document.addEventListener('visibilitychange', async () => {
        if (this.wakeLock !== null && document.visibilityState === 'visible' && this.state === RSVPState.PLAYING) {
             await this.requestWakeLock();
        }
    });
  }

  public static getInstance(): RSVPConductor {
    if (!RSVPConductor.instance) {
      RSVPConductor.instance = new RSVPConductor();
    }
    return RSVPConductor.instance;
  }

  /**
   * Prepares the RSVP engine asynchronously via Web Worker.
   * OPTIMIZED: Uses caching to make repeated calls instant.
   */
  public async prepare(content: string, config: RSVPStartConfig = {}): Promise<void> {
    
    // 1. FAST PATH: Cache Hit
    // If the content string reference hasn't changed and we have tokens, skip processing.
    if (this.lastContentRef === content && newRsvpEngine.getTokensRaw().length > 0) {
        this.applyConfig(config);
        return;
    }

    // 2. IN-FLIGHT PATH: Deduplication
    // If a request is already running for this content (or any content), wait for it.
    // This prevents race conditions where ReaderView mount and User Play Click fight.
    if (this.preparationPromise) {
        try {
            await this.preparationPromise;
            // After waiting, check if we matched the content we wanted
            if (this.lastContentRef === content) {
                this.applyConfig(config);
                return;
            }
        } catch (e) {
            // If previous failed, fall through to fresh start
        }
    }

    // 3. SLOW PATH: Fresh Processing
    // We wrap this in an IIFE-style promise assignment to track it
    this.preparationPromise = (async () => {
        try {
            // Try new engine preparation first (worker-based)
            // Use new engine exclusively
            await newRsvpEngine.prepare(content, TitanSettingsService.getInstance().getSettings().rsvpSpeed);
            this.lastContentRef = content;
        } finally {
            this.preparationPromise = null;
        }
    })();

    await this.preparationPromise;
    this.applyConfig(config);
  }

  /**
   * Applies the seek/position logic after tokens are loaded.
   */
  private applyConfig(config: RSVPStartConfig) {
      const settings = TitanSettingsService.getInstance().getSettings();
      const raw = newRsvpEngine.getTokensRaw();
      const tokens = mapRawToRSVPTokens(raw, settings.rsvpSpeed);
      let startIndex = 0;

      if (config.index !== undefined) {
          // PRIORITY 1: Strict Token Index
          startIndex = Math.max(0, Math.min(config.index, tokens.length - 1));
      } 
      else if (config.offset !== undefined) {
        // PRIORITY 2: Character Offset
        const targetOffset = config.offset;
        const foundIndex = tokens.findIndex(t => t.startOffset >= targetOffset);
        
        if (foundIndex !== -1) {
            startIndex = foundIndex;
        } else {
            startIndex = Math.max(0, tokens.length - 1);
        }
      } 
      else {
        // PRIORITY 3: Percentage
        const progress = config.progress ?? 0;
        startIndex = Math.max(0, Math.min(Math.floor(tokens.length * progress), tokens.length - 1));
      }

    try { newRsvpEngine.seek(startIndex); } catch (e) { /* ignore */ }
      
      // Ensure state is ready but paused (unless we decide to auto-play elsewhere)
      this.state = RSVPState.PAUSED;
      this.lastSavedIndex = startIndex;
      
      this.notify();
  }

  public togglePlay() {
    if (this.state === RSVPState.PLAYING) {
        this.pause();
    } else {
        this.play();
    }
  }

  public play() {
    // If finished, restart from beginning
    if (this.state === RSVPState.FINISHED) {
        try { newRsvpEngine.seek(0); } catch (e) {}
        this.state = RSVPState.PAUSED;
        RSVPHapticEngine.impactMedium(); // Haptic feedback for restart
    }
    
    if (newRsvpEngine.getTokensRaw().length === 0) {
        return; 
    }

        this.state = RSVPState.PLAYING;
        newRsvpEngine.play();
        this.requestWakeLock(); // Lock screen
        this.notify();
  }

  public pause(skipContextRewind: boolean = false) {
    this.state = RSVPState.PAUSED;
                newRsvpEngine.pause();
    this.releaseWakeLock(); // Release lock
    
    // Context Rewind: Move back slightly to give context upon resume
    // This provides a better "re-entry" experience into the text
    if (!skipContextRewind) {
        const currentIndex = this.engineIndex;
        const rewindAmount = 1; 
        const targetIndex = Math.max(0, currentIndex - rewindAmount);
        
        if (targetIndex !== currentIndex) {
            try { newRsvpEngine.seek(targetIndex); } catch (e) {}
        }
    }
    
    // CRITICAL: Force sync to core so ReaderView can snap to this exact location
                this.syncProgressToCore(true);
    this.notify();
  }

  /**
   * Relative Seek (Scrubbing)
   */
  public seekRelative(delta: number) {
      const current = this.engineIndex;
      const target = current + delta;
      
      // Only seek if changed
      if (target !== current) {
          if (this.state === RSVPState.PLAYING) {
             this.pause(true); // Don't do context rewind when manually seeking
          }
          try { newRsvpEngine.seek(target); } catch (e) {}
          this.syncProgressToCore(true); // Ensure Core is updated so UI reflects change
      }
  }

  /**
   * Shutdown
   * @param shouldSave If true, forces a final sync to core. If false, discards heartbeat state.
   */
  public shutdown(shouldSave: boolean = true) {
    // 1. SYNC BEFORE STOPPING
    if (shouldSave) {
        this.syncProgressToCore(true);
    }
    
    // 2. STOP
    try { newRsvpEngine.pause(); } catch (e) { /* ignore */ }
    this.state = RSVPState.IDLE;
    this.releaseWakeLock();
    
    // 3. CLEAR CACHE
    // We clear cache on shutdown to prevent memory leaks or stale state between books
        this.lastContentRef = null;
    
    this.notify();
  }

  public updateWPM(wpm: number) {
            newRsvpEngine.updateWPM(wpm);
  }

  // MARK: - Internal Logic

  private async requestWakeLock() {
      if ('wakeLock' in navigator) {
          try {
              this.wakeLock = await navigator.wakeLock.request('screen');
          } catch (err) {
              console.warn('Wake Lock request failed:', err);
          }
      }
  }

  private releaseWakeLock() {
      if (this.wakeLock) {
          this.wakeLock.release()
              .then(() => { this.wakeLock = null; })
              .catch((e) => console.error(e));
      }
  }

    private syncProgressToCore(forceSave: boolean = false, index?: number, token?: RSVPToken) {
            // Prefer explicit index/token if provided (from new engine subscription)
            const currentIndex = typeof index === 'number' ? index : this.engineIndex;
            const settings = TitanSettingsService.getInstance().getSettings();
            const raw = newRsvpEngine.getTokensRaw();
            const mappedTokens = mapRawToRSVPTokens(raw, settings.rsvpSpeed);
            const currentToken = token ?? mappedTokens[currentIndex] ?? null;

            const totalTokens = (mappedTokens && mappedTokens.length) || (this.core.totalTokens || 0);
            if (totalTokens === 0) return;

            if (currentToken && (currentToken as any).startOffset !== undefined && (currentToken as any).startOffset >= 0) {
                this.core.syncFromRSVP((currentToken as any).startOffset, currentIndex);
            } else {
                if (currentIndex > 0) {
                        this.core.saveProgress(currentIndex);
                }
            }
    }

  // MARK: - React Observability

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Batched notification system for React optimization.
   * Multiple rapid notify() calls within same frame will batch into single update.
   */
  private notify() {
    if (this.notifyScheduled) return;
    
    this.notifyScheduled = true;
    // Use microtask queue for immediate-next-tick batching
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.listeners.forEach(cb => cb());
    });
  }
}