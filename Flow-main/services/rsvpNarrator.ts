/**
 * RSVPNarrator - Simple Word-by-Word Speech
 * 
 * Dead simple: speaks ONE word at a time, perfectly synced with RSVP display.
 * The heartbeat controls timing, narrator just voices each word.
 */

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  isNeural: boolean;
  quality: number;
};

type NarratorState = 'idle' | 'speaking';

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.0;
  private _volume: number = 1.0;
  
  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.synth = window.speechSynthesis;
    this.loadVoices();
    
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

  private loadVoices() {
    this.voices = this.synth.getVoices();
    
    if (this.voices.length > 0 && !this.selectedVoice) {
      // Pick best voice
      const userLang = navigator.language.split('-')[0];
      const englishVoices = this.voices.filter(v => 
        v.lang.startsWith(userLang) || v.lang.startsWith('en')
      );
      
      // Prefer neural/natural voices
      const neural = englishVoices.find(v => 
        v.name.toLowerCase().includes('neural') || 
        v.name.toLowerCase().includes('natural') ||
        v.name.toLowerCase().includes('samantha')
      );
      
      this.selectedVoice = neural || englishVoices[0] || this.voices[0];
    }
    
    this.notify();
  }

  public getAvailableVoices(): NarratorVoice[] {
    return this.voices.map(v => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      isNeural: v.name.toLowerCase().includes('neural'),
      quality: 50
    }));
  }

  public setVoice(voiceName: string) {
    this.selectedVoice = this.voices.find(v => v.name === voiceName) || null;
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    if (!this.selectedVoice) return null;
    return {
      id: this.selectedVoice.voiceURI,
      name: this.selectedVoice.name,
      lang: this.selectedVoice.lang,
      isNeural: this.selectedVoice.name.toLowerCase().includes('neural'),
      quality: 50
    };
  }

  // -- Simple Controls --

  public get isEnabled(): boolean {
    return this._isEnabled;
  }

  public get state(): NarratorState {
    return this._state;
  }

  public setEnabled(enabled: boolean) {
    this._isEnabled = enabled;
    if (!enabled) {
      this.synth.cancel();
    }
    this.notify();
  }

  public toggleEnabled() {
    this.setEnabled(!this._isEnabled);
  }

  public setRate(rate: number) {
    this._rate = Math.max(0.5, Math.min(2.0, rate));
  }

  public setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Speak a single word - call this for each RSVP word
   */
  public speakWord(word: string) {
    if (!this._isEnabled) return;
    if (!word || word.trim().length === 0) return;
    
    // Ensure voice is loaded
    if (!this.selectedVoice) {
      const voices = this.synth.getVoices();
      if (voices.length > 0) {
        this.selectedVoice = voices[0];
      } else {
        return;
      }
    }
    
    // Cancel previous (don't let words queue up)
    this.synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.voice = this.selectedVoice;
    utterance.rate = this._rate;
    utterance.volume = this._volume;
    
    this._state = 'speaking';
    this.synth.speak(utterance);
    
    utterance.onend = () => {
      this._state = 'idle';
    };
  }

  public stop() {
    this.synth.cancel();
    this._state = 'idle';
  }

  public pause() {
    this.synth.pause();
  }

  public resume() {
    this.synth.resume();
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
