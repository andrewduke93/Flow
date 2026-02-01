/**
 * RSVPNarrator - AI-Style Text-to-Speech Engine
 * 
 * A natural-sounding narrator for RSVP mode.
 * Uses the Web Speech API with optimized settings for:
 * - Smooth, continuous speech (not rushed bursts)
 * - Natural voice selection (prefers neural/AI voices)
 * - Sentence-based buffering for natural flow
 * 
 * Features:
 * - Automatic voice quality ranking
 * - Sentence-based speaking for natural rhythm
 * - Moderate speech rate for clarity
 * - Pause/resume support
 */

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
  private _rate: number = 1.0; // Natural rate (1.0 = normal speech)
  private _pitch: number = 1.0;
  private _volume: number = 1.0;
  
  // Sentence-based reading
  private sentences: string[] = [];
  private currentSentenceIndex: number = 0;
  private isAutoAdvancing: boolean = false;
  
  // Callbacks
  private listeners: Set<() => void> = new Set();

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
   * Load text and split into sentences for smooth reading
   */
  public loadContent(text: string) {
    // Split into sentences, keeping punctuation
    this.sentences = text
      .replace(/([.!?])\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    this.currentSentenceIndex = 0;
  }

  /**
   * Start continuous reading from current position
   */
  public startReading() {
    if (!this._isEnabled || !this.selectedVoice || this.sentences.length === 0) return;
    
    this.isAutoAdvancing = true;
    this.speakNextSentence();
  }

  /**
   * Speak the next sentence and auto-advance
   */
  private speakNextSentence() {
    if (!this.isAutoAdvancing || this.currentSentenceIndex >= this.sentences.length) {
      this._state = 'idle';
      this.isAutoAdvancing = false;
      this.notify();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];
    this._state = 'speaking';
    
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.voice = this.selectedVoice;
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
    utterance.volume = this._volume;
    
    utterance.onend = () => {
      this.currentSentenceIndex++;
      // Small pause between sentences for natural rhythm
      setTimeout(() => {
        if (this.isAutoAdvancing) {
          this.speakNextSentence();
        }
      }, 150);
    };
    
    utterance.onerror = () => {
      this._state = 'idle';
      this.isAutoAdvancing = false;
      this.notify();
    };
    
    this.utterance = utterance;
    this.synth.speak(utterance);
    this.notify();
  }

  /**
   * Seek to approximate position based on word index
   */
  public seekToWordIndex(wordIndex: number, totalWords: number) {
    if (this.sentences.length === 0) return;
    
    // Estimate sentence position based on word ratio
    const ratio = wordIndex / Math.max(1, totalWords);
    this.currentSentenceIndex = Math.floor(ratio * this.sentences.length);
    this.currentSentenceIndex = Math.max(0, Math.min(this.currentSentenceIndex, this.sentences.length - 1));
  }

  public pause() {
    this.isAutoAdvancing = false;
    if (this.synth.speaking) {
      this.synth.pause();
      this._state = 'paused';
      this.notify();
    }
  }

  public resume() {
    if (this.synth.paused) {
      this.isAutoAdvancing = true;
      this.synth.resume();
      this._state = 'speaking';
      this.notify();
    } else if (this._state === 'idle' || this._state === 'paused') {
      this.startReading();
    }
  }

  public stop() {
    this.isAutoAdvancing = false;
    this.synth.cancel();
    this._state = 'idle';
    this.currentSentenceIndex = 0;
    this.notify();
  }

  /**
   * Reset for a new book/chapter
   */
  public reset() {
    this.stop();
    this.sentences = [];
    this.currentSentenceIndex = 0;
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
