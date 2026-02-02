/**
 * RSVPNarrator - ElevenLabs TTS Integration
 * 
 * Uses ElevenLabs API for industry-leading neural text-to-speech.
 * Free tier: 10,000 characters/month with free account.
 * 
 * User provides their own API key (stored in localStorage).
 */

const API_KEY_STORAGE = 'flow_elevenlabs_api_key';
const VOICE_STORAGE = 'flow_elevenlabs_voice';

type NarratorState = 'idle' | 'generating' | 'speaking';

// ElevenLabs voice options (popular free-tier voices)
const ELEVENLABS_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)', style: 'Soft, warm' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Female)', style: 'Natural, clear' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (Female)', style: 'Confident' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Female)', style: 'Warm, British' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (Male)', style: 'Articulate' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male)', style: 'Deep, narration' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male)', style: 'Warm, friendly' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Male)', style: 'Crisp, American' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female)', style: 'Calm, American' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Female)', style: 'Strong, clear' },
] as const;

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  quality: string;
};

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private _apiKey: string | null = null;
  private _selectedVoice: string = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.0;
  private _volume: number = 1.0;
  
  // Audio playback
  private audioElement: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  
  // Sentence queue
  private sentences: string[] = [];
  private currentSentenceIndex: number = 0;
  private isAutoPlaying: boolean = false;
  
  // Word sync
  private onWordCallback: ((wordIndex: number) => void) | null = null;
  private baseWordIndex: number = 0;
  private wordSyncInterval: ReturnType<typeof setInterval> | null = null;
  
  private listeners: Set<() => void> = new Set();

  private constructor() {
    this._apiKey = localStorage.getItem(API_KEY_STORAGE);
    this._selectedVoice = localStorage.getItem(VOICE_STORAGE) || 'EXAVITQu4vr4xnSDxMaL';
    
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
    localStorage.setItem(API_KEY_STORAGE, key);
    this.notify();
  }

  public clearApiKey() {
    this._apiKey = null;
    localStorage.removeItem(API_KEY_STORAGE);
    this.notify();
  }

  // -- Voice Selection --

  public getAvailableVoices(): NarratorVoice[] {
    return ELEVENLABS_VOICES.map(v => ({
      id: v.id,
      name: v.name,
      lang: 'en-US',
      quality: v.style
    }));
  }

  public setVoice(voiceId: string) {
    this._selectedVoice = voiceId;
    localStorage.setItem(VOICE_STORAGE, voiceId);
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    const voice = ELEVENLABS_VOICES.find(v => v.id === this._selectedVoice);
    if (!voice) return null;
    return {
      id: voice.id,
      name: voice.name,
      lang: 'en-US',
      quality: voice.style
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

  public onWord(callback: (wordIndex: number) => void) {
    this.onWordCallback = callback;
  }

  public loadText(text: string, startWordIndex: number = 0) {
    // Split into sentences, keep under ~500 chars for API efficiency
    const MAX_CHARS = 500;
    
    let sentences = text
      .replace(/([.!?])\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Split long sentences
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

  public async startReading() {
    if (!this._isEnabled || !this._apiKey || this.sentences.length === 0) {
      console.warn('[Narrator] Cannot start:', { enabled: this._isEnabled, hasKey: !!this._apiKey, sentences: this.sentences.length });
      return;
    }
    
    if (this.isAutoPlaying) return;
    
    this.isAutoPlaying = true;
    await this.speakCurrentSentence();
  }

  private async speakCurrentSentence() {
    if (!this.isAutoPlaying || this.currentSentenceIndex >= this.sentences.length) {
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];
    this._state = 'generating';
    this.notify();

    try {
      console.log(`[Narrator] Generating: "${sentence.substring(0, 50)}..."`);
      
      // Call ElevenLabs API
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this._selectedVoice}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this._apiKey!
          },
          body: JSON.stringify({
            text: sentence,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API Error: ${response.status} - ${error}`);
      }

      if (!this.isAutoPlaying) return;

      // Create blob URL from audio response
      const audioBlob = await response.blob();
      
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
      }
      this.currentAudioUrl = URL.createObjectURL(audioBlob);

      if (this.audioElement) {
        this.audioElement.src = this.currentAudioUrl;
        this.audioElement.playbackRate = this._rate;
        this.audioElement.volume = this._volume;
        
        this._state = 'speaking';
        this.notify();
        
        // Start word sync
        const words = sentence.split(/\s+/);
        this.startWordSync(words);
        
        await this.audioElement.play();
      }
    } catch (error) {
      console.error('[Narrator] TTS Error:', error);
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
    }
  }

  private startWordSync(words: string[]) {
    if (words.length === 0) return;
    
    this.stopWordSync();
    
    // ElevenLabs speaks at roughly 150 WPM
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

  private onAudioEnded() {
    this.stopWordSync();
    
    // Update word index
    const sentence = this.sentences[this.currentSentenceIndex];
    if (sentence) {
      this.baseWordIndex += sentence.split(/\s+/).length;
    }
    
    this.currentSentenceIndex++;
    
    if (this.isAutoPlaying && this.currentSentenceIndex < this.sentences.length) {
      setTimeout(() => this.speakCurrentSentence(), 50);
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
    this.stopWordSync();
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
    this.pause();
    if (this.audioElement) {
      this.audioElement.currentTime = 0;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
    this.currentSentenceIndex = 0;
    this.baseWordIndex = 0;
    this.sentences = [];
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public static isSupported(): boolean {
    return true;
  }
}
