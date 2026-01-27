


import { newRsvpEngine, mapRawToRSVPTokens } from './newRsvpEngine';
import { RSVPToken } from '../types';

// Lightweight compatibility shim that exposes a legacy RSVPHeartbeat-like API
// while delegating to `newRsvpEngine`. This allows an aggressive migration
// while keeping existing components functional without large simultaneous edits.
export class RSVPHeartbeat {
  private static instance: RSVPHeartbeat;
  public tokens: RSVPToken[] = [];
  public currentIndex: number = 0;
  public wpm: number = 300;
  private listeners: Set<() => void> = new Set();

  private constructor() {
    try {
      newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
        const raw = newRsvpEngine.getTokensRaw();
        this.tokens = mapRawToRSVPTokens(raw, this.wpm);
        this.currentIndex = typeof index === 'number' ? index : this.currentIndex;
        this.notify();
      });
    } catch (e) {
      // ignore
    }
  }

  public static getInstance(): RSVPHeartbeat {
    if (!RSVPHeartbeat.instance) RSVPHeartbeat.instance = new RSVPHeartbeat();
    return RSVPHeartbeat.instance;
  }

  public get currentToken(): RSVPToken | null {
    return this.tokens[this.currentIndex] || null;
  }

  public get isPlaying(): boolean {
    // We don't mirror playing state here; consumers should rely on newRsvpEngine
    return false;
  }

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public setTokens(tokens: RSVPToken[]) {
    this.tokens = tokens;
    this.notify();
  }

  public clear() {
    this.tokens = [];
    this.currentIndex = 0;
    this.notify();
  }

  public play() { try { newRsvpEngine.play(); } catch (e) {} }
  public pause() { try { newRsvpEngine.pause(); } catch (e) {} }
  public seek(i: number) { try { newRsvpEngine.seek(i); } catch (e) {} }
  public stop() { try { newRsvpEngine.pause(); } catch (e) {} }
  public updateWPM(w: number) { this.wpm = w; try { newRsvpEngine.updateWPM(w); } catch (e) {} }

  private notify() {
    this.listeners.forEach(cb => cb());
  }
}