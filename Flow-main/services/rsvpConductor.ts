import { RSVPHeartbeat } from './rsvpHeartbeat';
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
  
  private heartbeat: RSVPHeartbeat;
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
    this.heartbeat = RSVPHeartbeat.getInstance();
    this.core = TitanCore.getInstance();
    
    this.heartbeat.subscribe(() => this.handleHeartbeatUpdate());
    this.heartbeat.onComplete(() => {
        this.state = RSVPState.FINISHED;
        this.releaseWakeLock(); // Release lock on finish
        this.notify();
    });

    const settingsService = TitanSettingsService.getInstance();
    const initialWPM = settingsService.getSettings().rsvpSpeed;
    this.updateWPM(initialWPM);

    settingsService.subscribe(() => {
        const newWPM = settingsService.getSettings().rsvpSpeed;
        if (this.heartbeat.wpm !== newWPM) {
            this.updateWPM(newWPM);
        }
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
    if (this.lastContentRef === content && this.heartbeat.tokens.length > 0) {
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
            // Generate Tokens (Async) — forward current WPM so worker can scale punctuation pauses
            const tokens = await RSVPProcessor.process(content, 0, this.heartbeat.wpm);
            this.heartbeat.setTokens(tokens);
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
      const tokens = this.heartbeat.tokens;
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

      this.heartbeat.seek(startIndex);
      
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
        this.heartbeat.seek(0);
        this.state = RSVPState.PAUSED;
        RSVPHapticEngine.impactMedium(); // Haptic feedback for restart
    }
    
    if (this.heartbeat.tokens.length === 0) {
        return; 
    }

    this.state = RSVPState.PLAYING;
    this.heartbeat.play();
    this.requestWakeLock(); // Lock screen
    this.notify();
  }

  public pause(skipContextRewind: boolean = false) {
    this.state = RSVPState.PAUSED;
    this.heartbeat.pause();
    this.releaseWakeLock(); // Release lock
    
    // Context Rewind: Move back slightly to give context upon resume
    // This provides a better "re-entry" experience into the text
    if (!skipContextRewind) {
        const currentIndex = this.heartbeat.currentIndex;
        const rewindAmount = 1; 
        const targetIndex = Math.max(0, currentIndex - rewindAmount);
        
        if (targetIndex !== currentIndex) {
            this.heartbeat.seek(targetIndex);
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
      const current = this.heartbeat.currentIndex;
      const target = current + delta;
      
      // Only seek if changed
      if (target !== current) {
          if (this.state === RSVPState.PLAYING) {
             this.pause(true); // Don't do context rewind when manually seeking
          }
          this.heartbeat.seek(target);
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
    this.heartbeat.stop();
    this.state = RSVPState.IDLE;
    this.releaseWakeLock();
    
    // 3. CLEAR CACHE
    // We clear cache on shutdown to prevent memory leaks or stale state between books
    this.lastContentRef = null;
    this.heartbeat.clear(); 
    
    this.notify();
  }

  public updateWPM(wpm: number) {
      this.heartbeat.updateWPM(wpm);
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

  private handleHeartbeatUpdate() {
      if (!this.heartbeat.isPlaying && this.state === RSVPState.PLAYING) {
          this.state = RSVPState.PAUSED;
          this.releaseWakeLock();
      }

      // Haptics removed for playback as requested.
      /*
      const token = this.heartbeat.currentToken;
      if (token && this.state === RSVPState.PLAYING) {
         RSVPHapticEngine.pulse(token);
      }
      */

      // Sync less frequently during playback to save resources, but sync often enough for scrubbing
      const currentIndex = this.heartbeat.currentIndex;
      if (Math.abs(currentIndex - this.lastSavedIndex) >= 100) {
          this.syncProgressToCore();
          this.lastSavedIndex = currentIndex;
      }
      this.notify();
  }

  private syncProgressToCore(forceSave: boolean = false) {
      const totalTokens = this.heartbeat.tokens.length;
      if (totalTokens === 0) return;

      const currentToken = this.heartbeat.currentToken;
      const currentIndex = this.heartbeat.currentIndex;
      
      if (currentToken) {
        this.core.syncFromRSVP(currentToken.startOffset, currentIndex);
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