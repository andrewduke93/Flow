/**
 * RSVPNarrator - AI-Style Text-to-Speech Engine
 * 
 * A high-speed, natural-sounding narrator for RSVP mode.
 * Uses the Web Speech API with optimized settings for:
 * - Fast playback (2-3x normal speech rate)
 * - Natural voice selection (prefers neural/AI voices)
 * - Phrase-based buffering for natural flow
 * 
 * Features:
 * - Automatic voice quality ranking
 * - Phrase-based chunking for natural rhythm
 * - Speed sync with RSVP WPM setting
 * - Pause/resume support
 * - Intelligent word grouping for smoother audio
 */

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  isNeural: boolean;
  quality: number; // 0-100 quality score
};

type NarratorState = 'idle' | 'speaking' | 'paused' | 'buffering';

// Phrase chunk for natural-sounding speech
type PhraseChunk = {
  text: string;
  startIndex: number;  // Word index in token array
  endIndex: number;    // Word index in token array
};

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  
  // State
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 2.0; // Default fast rate (1.0 = normal)
  private _pitch: number = 1.0;
  private _volume: number = 1.0;
  
  // Phrase-based chunking
  private phrases: PhraseChunk[] = [];
  private currentPhraseIndex: number = 0;
  private phraseEndCallback: (() => void) | null = null;
  
  // Word tracking for sync
  private lastSpokenWordIndex: number = -1;
  
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
   * Set speech rate. Higher = faster.
   * Typical range: 0.5 (slow) to 3.0 (very fast)
   * Default for RSVP: 2.0-2.5
   */
  public setRate(rate: number) {
    this._rate = Math.max(0.5, Math.min(3.0, rate));
    this.notify();
  }

  /**
   * Sync rate with RSVP WPM setting
   * Converts WPM to speech rate
   */
  public syncWithWPM(wpm: number) {
    // Normal speaking rate is ~150 WPM at rate 1.0
    // Map WPM to speech rate, but cap it for intelligibility
    const baseWPM = 150;
    const rate = wpm / baseWPM;
    // Cap at 2.5x for reasonable intelligibility
    this.setRate(Math.max(1.5, Math.min(2.5, rate)));
  }

  public setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
    this.notify();
  }

  /**
   * Speak a single word
   */
  public speakWord(word: string) {
    if (!this._isEnabled || !this.selectedVoice) return;
    
    // Cancel any ongoing speech
    this.synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.voice = this.selectedVoice;
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
    utterance.volume = this._volume;
    
    this._state = 'speaking';
    this.synth.speak(utterance);
    
    utterance.onend = () => {
      this._state = 'idle';
    };
  }

  /**
   * Build phrase chunks from words for natural flow
   * Groups 3-8 words into natural phrases based on punctuation
   */
  public buildPhrases(words: string[]): PhraseChunk[] {
    const phrases: PhraseChunk[] = [];
    const PHRASE_SIZE = 5; // Target phrase size
    const MAX_PHRASE = 8;
    
    let currentPhrase: string[] = [];
    let startIndex = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentPhrase.push(word);
      
      // Check for natural break points
      const hasEndPunctuation = /[.!?;:,—]$/.test(word);
      const hitMaxSize = currentPhrase.length >= MAX_PHRASE;
      const hitTargetWithPause = currentPhrase.length >= PHRASE_SIZE && hasEndPunctuation;
      
      if (hitMaxSize || hitTargetWithPause || i === words.length - 1) {
        phrases.push({
          text: currentPhrase.join(' '),
          startIndex,
          endIndex: i
        });
        currentPhrase = [];
        startIndex = i + 1;
      }
    }
    
    this.phrases = phrases;
    this.currentPhraseIndex = 0;
    return phrases;
  }

  /**
   * Speak a phrase with callback when done
   */
  public speakPhrase(phrase: PhraseChunk, onEnd?: () => void) {
    if (!this._isEnabled || !this.selectedVoice) {
      onEnd?.();
      return;
    }
    
    this.synth.cancel();
    this._state = 'speaking';
    
    const utterance = new SpeechSynthesisUtterance(phrase.text);
    utterance.voice = this.selectedVoice;
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
    utterance.volume = this._volume;
    
    utterance.onend = () => {
      this._state = 'idle';
      this.notify();
      onEnd?.();
    };
    
    utterance.onerror = () => {
      this._state = 'idle';
      this.notify();
      onEnd?.();
    };
    
    this.utterance = utterance;
    this.synth.speak(utterance);
    this.notify();
  }

  /**
   * Get the current phrase for a word index
   */
  public getPhraseForIndex(wordIndex: number): PhraseChunk | null {
    return this.phrases.find(p => wordIndex >= p.startIndex && wordIndex <= p.endIndex) || null;
  }

  /**
   * Check if we should start speaking a new phrase
   */
  public shouldSpeakAtIndex(wordIndex: number): boolean {
    const phrase = this.getPhraseForIndex(wordIndex);
    if (!phrase) return false;
    
    // Speak when we hit the start of a new phrase
    return wordIndex === phrase.startIndex && this.lastSpokenWordIndex < phrase.startIndex;
  }

  /**
   * Speak the phrase containing the given word index
   */
  public speakAtIndex(wordIndex: number, onEnd?: () => void) {
    const phrase = this.getPhraseForIndex(wordIndex);
    if (!phrase) return;
    
    if (wordIndex === phrase.startIndex && this.lastSpokenWordIndex < phrase.startIndex) {
      this.lastSpokenWordIndex = phrase.endIndex;
      this.speakPhrase(phrase, onEnd);
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
    }
  }

  public stop() {
    this.synth.cancel();
    this._state = 'idle';
    this.lastSpokenWordIndex = -1;
    this.currentPhraseIndex = 0;
    this.notify();
  }

  /**
   * Reset tracking for a new reading session
   */
  public reset() {
    this.stop();
    this.phrases = [];
    this.lastSpokenWordIndex = -1;
    this.currentPhraseIndex = 0;
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
