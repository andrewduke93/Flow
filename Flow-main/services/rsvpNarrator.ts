/**
 * RSVPNarrator - Web Speech API based narration
 * 
 * Uses the browser's built-in speech synthesis for instant, zero-download TTS.
 * Not as natural as Kokoro but works immediately without any loading.
 * 
 * Speaks in sentence chunks for natural flow, syncs visual to audio.
 */

type NarratorState = 'idle' | 'speaking';

const VOICE_STORAGE_KEY = 'flow_narrator_voice';
const RATE_STORAGE_KEY = 'flow_narrator_rate';

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  quality: string;
};

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private _selectedVoiceId: string = '';
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.2; // Slightly faster than default
  private _volume: number = 1.0;
  
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  
  // Sentence queue for continuous reading
  private sentences: string[] = [];
  private currentSentenceIndex: number = 0;
  private isAutoPlaying: boolean = false;
  
  // Word sync callback
  private onWordCallback: ((wordIndex: number) => void) | null = null;
  private baseWordIndex: number = 0;
  private wordSyncInterval: ReturnType<typeof setInterval> | null = null;
  
  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.synth = window.speechSynthesis;
    this._selectedVoiceId = localStorage.getItem(VOICE_STORAGE_KEY) || '';
    this._rate = parseFloat(localStorage.getItem(RATE_STORAGE_KEY) || '1.2');
    
    // Load voices
    this.loadVoices();
    
    // Voices may load async in some browsers
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    this.voices = this.synth.getVoices();
    
    // If no voice selected, pick best English voice
    if (!this._selectedVoiceId && this.voices.length > 0) {
      const preferred = this.voices.find(v => 
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha'))
      ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
      
      if (preferred) {
        this._selectedVoiceId = preferred.voiceURI;
      }
    }
    
    console.log(`[Narrator] Loaded ${this.voices.length} voices`);
  }

  public static getInstance(): RSVPNarrator {
    if (!RSVPNarrator.instance) {
      RSVPNarrator.instance = new RSVPNarrator();
    }
    return RSVPNarrator.instance;
  }

  public get hasApiKey(): boolean {
    // No API key needed for Web Speech API
    return true;
  }

  // -- Voice Selection --

  public getAvailableVoices(): NarratorVoice[] {
    return this.voices
      .filter(v => v.lang.startsWith('en'))
      .map(v => ({
        id: v.voiceURI,
        name: v.name,
        lang: v.lang,
        quality: v.name.includes('Google') || v.name.includes('Microsoft') ? 'A' : 
                 v.name.includes('Samantha') || v.name.includes('Daniel') ? 'B' : 'C'
      }));
  }

  public setVoice(voiceId: string) {
    this._selectedVoiceId = voiceId;
    localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    const voice = this.voices.find(v => v.voiceURI === this._selectedVoiceId);
    if (!voice) return null;
    return {
      id: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      quality: 'B'
    };
  }

  // -- Controls --

  public get isEnabled(): boolean {
    return this._isEnabled;
  }

  public get state(): NarratorState {
    return this._state;
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

  public setRate(rate: number) {
    this._rate = Math.max(0.5, Math.min(2.0, rate));
    localStorage.setItem(RATE_STORAGE_KEY, this._rate.toString());
  }

  public get rate(): number {
    return this._rate;
  }

  public setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set callback for word sync (called as words are spoken)
   */
  public onWord(callback: (wordIndex: number) => void) {
    this.onWordCallback = callback;
  }

  /**
   * Load text and split into sentences
   */
  public loadText(text: string, startWordIndex: number = 0) {
    // Split into sentences, keeping them reasonably short
    const MAX_CHARS = 150;
    
    let sentences = text
      .replace(/([.!?])\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Split long sentences at commas
    this.sentences = sentences.flatMap(s => {
      if (s.length <= MAX_CHARS) return [s];
      return s.split(/[,;]\s*/)
        .map(part => part.trim())
        .filter(part => part.length > 0);
    });
    
    this.currentSentenceIndex = 0;
    this.baseWordIndex = startWordIndex;
    console.log(`[Narrator] Loaded ${this.sentences.length} chunks`);
  }

  /**
   * Start reading from current position
   */
  public async startReading() {
    if (!this._isEnabled || this.sentences.length === 0) {
      return;
    }
    
    if (this.isAutoPlaying) {
      return;
    }
    
    // Cancel any existing speech
    this.synth.cancel();
    
    this.isAutoPlaying = true;
    this.speakCurrentSentence();
  }

  /**
   * Speak the current sentence using Web Speech API
   */
  private speakCurrentSentence() {
    if (!this.isAutoPlaying || this.currentSentenceIndex >= this.sentences.length) {
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];
    this._state = 'speaking';
    this.notify();

    // Create utterance
    this.currentUtterance = new SpeechSynthesisUtterance(sentence);
    
    // Set voice
    const voice = this.voices.find(v => v.voiceURI === this._selectedVoiceId);
    if (voice) {
      this.currentUtterance.voice = voice;
    }
    
    this.currentUtterance.rate = this._rate;
    this.currentUtterance.volume = this._volume;
    this.currentUtterance.pitch = 1.0;
    
    // Word sync - estimate timing
    const words = sentence.split(/\s+/);
    this.startWordSync(words);
    
    // Handle completion
    this.currentUtterance.onend = () => {
      this.stopWordSync();
      
      // Update base word index
      this.baseWordIndex += words.length;
      
      // Move to next sentence
      this.currentSentenceIndex++;
      
      if (this.isAutoPlaying && this.currentSentenceIndex < this.sentences.length) {
        // Continue to next sentence
        setTimeout(() => this.speakCurrentSentence(), 50);
      } else {
        this._state = 'idle';
        this.isAutoPlaying = false;
        this.notify();
      }
    };
    
    this.currentUtterance.onerror = (e) => {
      console.error('[Narrator] Speech error:', e);
      this.stopWordSync();
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
    };
    
    // Speak
    this.synth.speak(this.currentUtterance);
  }

  /**
   * Estimate word timing and sync visual display
   */
  private startWordSync(words: string[]) {
    if (words.length === 0) return;
    
    this.stopWordSync();
    
    // Estimate: ~150 WPM at rate 1.0, adjust for actual rate
    const wordsPerSecond = (150 / 60) * this._rate;
    const msPerWord = 1000 / wordsPerSecond;
    
    let wordIndex = 0;
    this.wordSyncInterval = setInterval(() => {
      if (!this.isAutoPlaying) {
        this.stopWordSync();
        return;
      }
      
      if (wordIndex < words.length) {
        const globalIndex = this.baseWordIndex + wordIndex;
        if (this.onWordCallback) {
          this.onWordCallback(globalIndex);
        }
        wordIndex++;
      }
      
      if (wordIndex >= words.length) {
        this.stopWordSync();
      }
    }, msPerWord);
  }

  private stopWordSync() {
    if (this.wordSyncInterval) {
      clearInterval(this.wordSyncInterval);
      this.wordSyncInterval = null;
    }
  }

  public pause() {
    this.isAutoPlaying = false;
    this.stopWordSync();
    this.synth.cancel();
    this._state = 'idle';
    this.notify();
  }

  public resume() {
    if (this.sentences.length > 0 && this.currentSentenceIndex < this.sentences.length) {
      this.startReading();
    }
  }

  public stop() {
    this.pause();
    this.currentSentenceIndex = 0;
    this.baseWordIndex = 0;
    this.sentences = [];
  }

  // Subscriptions
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public static isSupported(): boolean {
    return 'speechSynthesis' in window;
  }
}
