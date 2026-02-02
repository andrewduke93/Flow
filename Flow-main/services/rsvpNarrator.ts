/**
 * RSVPNarrator - Google Cloud TTS Integration
 * 
 * Uses Google Cloud Text-to-Speech API for high-quality, natural narration.
 * Speaks in sentence chunks for natural flow, syncs visual to audio.
 * 
 * User provides their own API key (stored in localStorage).
 * Free tier: 4M chars/month (Standard), 1M chars/month (WaveNet/Neural2)
 */

const STORAGE_KEY = 'flow_google_tts_api_key';
const VOICE_STORAGE_KEY = 'flow_google_tts_voice';

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  isNeural: boolean;
  quality: number;
};

type NarratorState = 'idle' | 'speaking' | 'loading';

// Google TTS voice options (Neural2 are highest quality)
const GOOGLE_VOICES = [
  { name: 'en-US-Neural2-A', label: 'Neural2 A (Female)', isNeural: true },
  { name: 'en-US-Neural2-C', label: 'Neural2 C (Female)', isNeural: true },
  { name: 'en-US-Neural2-D', label: 'Neural2 D (Male)', isNeural: true },
  { name: 'en-US-Neural2-F', label: 'Neural2 F (Female)', isNeural: true },
  { name: 'en-US-Neural2-J', label: 'Neural2 J (Male)', isNeural: true },
  { name: 'en-US-Wavenet-A', label: 'WaveNet A (Male)', isNeural: true },
  { name: 'en-US-Wavenet-B', label: 'WaveNet B (Male)', isNeural: true },
  { name: 'en-US-Wavenet-C', label: 'WaveNet C (Female)', isNeural: true },
  { name: 'en-US-Wavenet-D', label: 'WaveNet D (Male)', isNeural: true },
  { name: 'en-US-Wavenet-F', label: 'WaveNet F (Female)', isNeural: true },
  { name: 'en-US-Standard-A', label: 'Standard A (Male)', isNeural: false },
  { name: 'en-US-Standard-B', label: 'Standard B (Male)', isNeural: false },
  { name: 'en-US-Standard-C', label: 'Standard C (Female)', isNeural: false },
  { name: 'en-US-Standard-D', label: 'Standard D (Male)', isNeural: false },
];

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private _apiKey: string | null = null;
  private _selectedVoice: string = 'en-US-Neural2-D';
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.0;
  private _volume: number = 1.0;
  
  private audioElement: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  
  // Sentence queue for continuous reading
  private sentences: string[] = [];
  private currentSentenceIndex: number = 0;
  private isAutoPlaying: boolean = false;
  
  // Word sync callback
  private onWordCallback: ((wordIndex: number) => void) | null = null;
  private baseWordIndex: number = 0;
  
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Load saved API key
    this._apiKey = localStorage.getItem(STORAGE_KEY);
    this._selectedVoice = localStorage.getItem(VOICE_STORAGE_KEY) || 'en-US-Neural2-D';
    
    // Create audio element
    this.audioElement = new Audio();
    this.audioElement.addEventListener('ended', () => this.onAudioEnded());
    this.audioElement.addEventListener('error', (e) => this.onAudioError(e));
  }

  public static getInstance(): RSVPNarrator {
    if (!RSVPNarrator.instance) {
      RSVPNarrator.instance = new RSVPNarrator();
    }
    return RSVPNarrator.instance;
  }

  // -- API Key Management --

  public get hasApiKey(): boolean {
    return !!this._apiKey && this._apiKey.length > 0;
  }

  public setApiKey(key: string) {
    this._apiKey = key;
    localStorage.setItem(STORAGE_KEY, key);
    this.notify();
  }

  public clearApiKey() {
    this._apiKey = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  // -- Voice Selection --

  public getAvailableVoices(): NarratorVoice[] {
    return GOOGLE_VOICES.map(v => ({
      id: v.name,
      name: v.label,
      lang: 'en-US',
      isNeural: v.isNeural,
      quality: v.isNeural ? 90 : 70
    }));
  }

  public setVoice(voiceName: string) {
    this._selectedVoice = voiceName;
    localStorage.setItem(VOICE_STORAGE_KEY, voiceName);
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    const voice = GOOGLE_VOICES.find(v => v.name === this._selectedVoice);
    if (!voice) return null;
    return {
      id: voice.name,
      name: voice.label,
      lang: 'en-US',
      isNeural: voice.isNeural,
      quality: voice.isNeural ? 90 : 70
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
  }

  public setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.audioElement) {
      this.audioElement.volume = this._volume;
    }
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
    // Split into sentences
    this.sentences = text
      .replace(/([.!?])\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    this.currentSentenceIndex = 0;
    this.baseWordIndex = startWordIndex;
  }

  /**
   * Start reading from current position
   */
  public async startReading() {
    if (!this._isEnabled || !this._apiKey || this.sentences.length === 0) {
      console.warn('[Narrator] Cannot start: enabled=', this._isEnabled, 'hasKey=', !!this._apiKey, 'sentences=', this.sentences.length);
      return;
    }
    
    this.isAutoPlaying = true;
    await this.speakCurrentSentence();
  }

  /**
   * Speak the current sentence using Google TTS
   */
  private async speakCurrentSentence() {
    if (!this.isAutoPlaying || this.currentSentenceIndex >= this.sentences.length) {
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];
    this._state = 'loading';
    this.notify();

    try {
      const audioContent = await this.synthesizeSpeech(sentence);
      
      if (!this.isAutoPlaying) return; // Stopped while loading
      
      // Clean up previous audio
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
      }
      
      // Create audio blob and play
      const audioBlob = this.base64ToBlob(audioContent, 'audio/mp3');
      this.currentAudioUrl = URL.createObjectURL(audioBlob);
      
      if (this.audioElement) {
        this.audioElement.src = this.currentAudioUrl;
        this.audioElement.playbackRate = this._rate;
        this.audioElement.volume = this._volume;
        this._state = 'speaking';
        this.notify();
        
        // Start word sync timer
        this.startWordSync(sentence);
        
        await this.audioElement.play();
      }
    } catch (error) {
      console.error('[Narrator] TTS Error:', error);
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
    }
  }

  /**
   * Estimate word timing and sync visual display
   */
  private startWordSync(sentence: string) {
    const words = sentence.split(/\s+/);
    if (words.length === 0 || !this.audioElement) return;
    
    // Estimate duration per word (Google TTS speaks ~150 WPM at 1.0x)
    const estimatedDuration = this.audioElement.duration || (words.length / 2.5); // ~150 WPM
    const msPerWord = (estimatedDuration * 1000) / words.length / this._rate;
    
    let wordIndex = 0;
    const syncInterval = setInterval(() => {
      if (!this.isAutoPlaying || !this.audioElement || this.audioElement.paused) {
        clearInterval(syncInterval);
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
        clearInterval(syncInterval);
      }
    }, msPerWord);
  }

  /**
   * Call Google Cloud TTS API
   */
  private async synthesizeSpeech(text: string): Promise<string> {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this._apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: this._selectedVoice,
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.0, // We control rate via playbackRate for instant changes
            pitch: 0,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.audioContent;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  private onAudioEnded() {
    // Update base word index for next sentence
    const currentSentence = this.sentences[this.currentSentenceIndex];
    if (currentSentence) {
      this.baseWordIndex += currentSentence.split(/\s+/).length;
    }
    
    // Move to next sentence
    this.currentSentenceIndex++;
    
    if (this.isAutoPlaying && this.currentSentenceIndex < this.sentences.length) {
      // Small pause between sentences
      setTimeout(() => this.speakCurrentSentence(), 100);
    } else {
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
    }
  }

  private onAudioError(e: Event) {
    console.error('[Narrator] Audio error:', e);
    this._state = 'idle';
    this.isAutoPlaying = false;
    this.notify();
  }

  public pause() {
    this.isAutoPlaying = false;
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
    this._state = 'idle';
    this.notify();
  }

  public resume() {
    if (this.audioElement && this.audioElement.paused && this.currentAudioUrl) {
      this.isAutoPlaying = true;
      this._state = 'speaking';
      this.audioElement.play();
      this.notify();
    } else {
      this.startReading();
    }
  }

  public stop() {
    this.isAutoPlaying = false;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
    this._state = 'idle';
    this.notify();
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
    return true; // Google TTS is always available (with API key)
  }
}
