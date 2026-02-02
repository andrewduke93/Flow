/**
 * RSVPNarrator - Synchronized Text-to-Speech Engine
 * 
 * A narrator for RSVP mode that stays LOCKED IN SYNC with the visual display.
 * Uses the Web Speech API with word boundary events to advance the visual
 * word display exactly as each word is spoken.
 * 
 * Features:
 * - Word-level synchronization with RSVP display
 * - Automatic voice quality ranking
 * - Natural speech rate
 * - Pause/resume support with position sync
 */

import { RSVPHeartbeat } from './rsvpHeartbeat';

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  isNeural: boolean;
  quality: number; // 0-100 quality score
};

type NarratorState = 'idle' | 'speaking' | 'paused' | 'buffering';

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  
  // State
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.0;
  private _pitch: number = 1.0;
  private _volume: number = 1.0;
  
  // Word-level sync tracking
  private tokens: string[] = [];
  private currentWordIndex: number = 0;
  private textToSpeak: string = '';
  private charToWordMap: number[] = []; // Maps character position to word index
  
  // Callbacks
  private listeners: Set<() => void> = new Set();
  private onWordCallback: ((wordIndex: number) => void) | null = null;

  private constructor() {
    this.synth = window.speechSynthesis;
    this.loadVoices();
    
    // Voices may load asynchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  public static getInstance(): RSVPNarrator {
    if (!RSVPNarrator.instance) {
      RSVPNarrator.instance = new RSVPNarrator();
    }
    return RSVPNarrator.instance;
  }

  // -- Voice Management --

  private loadVoices() {
    this.voices = this.synth.getVoices();
    
    // Auto-select best voice
    if (this.voices.length > 0 && !this.selectedVoice) {
      const ranked = this.rankVoices();
      if (ranked.length > 0) {
        this.selectedVoice = this.voices.find(v => v.name === ranked[0].name) || null;
      }
    }
    
    this.notify();
  }

  /**
   * Rank voices by quality - prefers neural/AI voices
   */
  private rankVoices(): NarratorVoice[] {
    const userLang = navigator.language.split('-')[0];
    
    return this.voices
      .filter(v => v.lang.startsWith(userLang) || v.lang.startsWith('en'))
      .map(voice => {
        let quality = 50;
        const name = voice.name.toLowerCase();
        
        // Neural/AI voices get high scores
        if (name.includes('neural') || name.includes('wavenet') || name.includes('natural')) {
          quality += 40;
        }
        
        // Premium voices
        if (name.includes('premium') || name.includes('enhanced')) {
          quality += 30;
        }
        
        // Samantha (macOS) and similar high-quality voices
        if (name.includes('samantha') || name.includes('alex') || name.includes('daniel')) {
          quality += 25;
        }
        
        // Google voices are generally good
        if (name.includes('google')) {
          quality += 20;
        }
        
        // Prefer local voices (lower latency)
        if (voice.localService) {
          quality += 10;
        }
        
        // Prefer user's language
        if (voice.lang.startsWith(userLang)) {
          quality += 15;
        }
        
        // Penalize generic/system voices
        if (name.includes('microsoft') && !name.includes('neural')) {
          quality -= 10;
        }
        
        const isNeural = name.includes('neural') || name.includes('wavenet') || name.includes('natural');
        
        return {
          id: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          isNeural,
          quality: Math.max(0, Math.min(100, quality))
        };
      })
      .sort((a, b) => b.quality - a.quality);
  }

  public getAvailableVoices(): NarratorVoice[] {
    return this.rankVoices();
  }

  public setVoice(voiceName: string) {
    this.selectedVoice = this.voices.find(v => v.name === voiceName) || null;
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    if (!this.selectedVoice) return null;
    const name = this.selectedVoice.name.toLowerCase();
    const isNeural = name.includes('neural') || name.includes('wavenet') || name.includes('natural');
    return {
      id: this.selectedVoice.voiceURI,
      name: this.selectedVoice.name,
      lang: this.selectedVoice.lang,
      isNeural,
      quality: 50
    };
  }

  // -- Playback Controls --

  public get isEnabled(): boolean {
    return this._isEnabled;
  }

  public get state(): NarratorState {
    return this._state;
  }

  public get rate(): number {
    return this._rate;
  }

  public setEnabled(enabled: boolean) {
    this._isEnabled = enabled;
    if (!enabled) {
      this.stop();
    }
    this.notify();
  }

  public toggleEnabled() {
    this.setEnabled(!this._isEnabled);
  }

  /**
   * Set speech rate. 
   * Range: 0.7 (relaxed) to 1.3 (brisk)
   * Default: 1.0 (natural speaking pace)
   */
  public setRate(rate: number) {
    this._rate = Math.max(0.7, Math.min(1.3, rate));
    this.notify();
  }

  /**
   * Sync rate with RSVP WPM setting
   * Maps WPM to a gentle speech rate adjustment
   */
  public syncWithWPM(wpm: number) {
    // Keep speech rate natural - don't try to match RSVP speed exactly
    // Just slightly adjust based on user preference
    if (wpm <= 150) {
      this.setRate(0.9);  // Relaxed
    } else if (wpm <= 250) {
      this.setRate(1.0);  // Normal
    } else if (wpm <= 350) {
      this.setRate(1.1);  // Slightly faster
    } else {
      this.setRate(1.2);  // Brisk but still natural
    }
  }

  public setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
    this.notify();
  }

  /**
   * Set callback for word boundary events - used to sync visual display
   */
  public onWord(callback: (wordIndex: number) => void) {
    this.onWordCallback = callback;
  }

  /**
   * Load tokens and build character-to-word mapping for sync
   */
  public loadContent(tokens: string[]) {
    this.tokens = tokens;
    this.textToSpeak = tokens.join(' ');
    this.currentWordIndex = 0;
    
    // Build character position to word index mapping
    this.charToWordMap = [];
    let charPos = 0;
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      // Map each character in this word to its word index
      for (let j = 0; j < word.length; j++) {
        this.charToWordMap[charPos + j] = i;
      }
      charPos += word.length;
      // Account for space after word
      if (i < tokens.length - 1) {
        this.charToWordMap[charPos] = i;
        charPos++;
      }
    }
  }

  /**
   * Start speaking from a specific word index
   */
  public startFromIndex(startIndex: number) {
    if (!this._isEnabled || !this.selectedVoice || this.tokens.length === 0) return;
    
    this.stop(); // Clear any ongoing speech
    
    // Build text from startIndex onwards
    this.currentWordIndex = Math.max(0, Math.min(startIndex, this.tokens.length - 1));
    const textFromHere = this.tokens.slice(this.currentWordIndex).join(' ');
    
    // Rebuild char map for the substring
    this.charToWordMap = [];
    let charPos = 0;
    for (let i = this.currentWordIndex; i < this.tokens.length; i++) {
      const word = this.tokens[i];
      for (let j = 0; j < word.length; j++) {
        this.charToWordMap[charPos + j] = i;
      }
      charPos += word.length;
      if (i < this.tokens.length - 1) {
        this.charToWordMap[charPos] = i;
        charPos++;
      }
    }
    
    this._state = 'speaking';
    
    const utterance = new SpeechSynthesisUtterance(textFromHere);
    utterance.voice = this.selectedVoice;
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
    utterance.volume = this._volume;
    
    // CRITICAL: Word boundary event for sync
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // Map character index to word index
        const wordIdx = this.charToWordMap[event.charIndex];
        if (wordIdx !== undefined && wordIdx !== this.currentWordIndex) {
          this.currentWordIndex = wordIdx;
          // Notify visual display to update
          if (this.onWordCallback) {
            this.onWordCallback(this.currentWordIndex);
          }
          this.notify();
        }
      }
    };
    
    utterance.onend = () => {
      this._state = 'idle';
      this.notify();
    };
    
    utterance.onerror = (e) => {
      // Ignore 'interrupted' errors from pause/stop
      if (e.error !== 'interrupted') {
        console.warn('Narrator error:', e.error);
      }
      this._state = 'idle';
      this.notify();
    };
    
    this.utterance = utterance;
    this.synth.speak(utterance);
    this.notify();
  }

  /**
   * Seek to a word index (will restart speech from there)
   */
  public seekToWordIndex(wordIndex: number) {
    const wasPlaying = this._state === 'speaking';
    this.stop();
    this.currentWordIndex = Math.max(0, Math.min(wordIndex, this.tokens.length - 1));
    if (wasPlaying) {
      this.startFromIndex(this.currentWordIndex);
    }
  }

  public pause() {
    if (this.synth.speaking) {
      this.synth.pause();
      this._state = 'paused';
      this.notify();
    }
  }

  public resume() {
    if (this.synth.paused) {
      this.synth.resume();
      this._state = 'speaking';
      this.notify();
    } else if (this._state === 'idle' && this.tokens.length > 0) {
      this.startFromIndex(this.currentWordIndex);
    }
  }

  public stop() {
    this.synth.cancel();
    this._state = 'idle';
    this.notify();
  }

  /**
   * Reset for a new book/chapter
   */
  public reset() {
    this.stop();
    this.tokens = [];
    this.charToWordMap = [];
    this.currentWordIndex = 0;
    this.textToSpeak = '';
  }

  public get currentIndex(): number {
    return this.currentWordIndex;
  }

  // -- Subscriptions --

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  // -- Static helpers --

  public static isSupported(): boolean {
    return 'speechSynthesis' in window;
  }
}
