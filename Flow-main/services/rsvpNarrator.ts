/**
 * RSVPNarrator - Kokoro TTS Integration
 * 
 * Uses Kokoro TTS (kokoro-js) for high-quality, browser-based narration.
 * Runs entirely client-side via WebAssembly/WebGPU - no API key needed!
 * 
 * Model is downloaded on first use (~80MB) and cached in browser.
 */

type NarratorState = 'idle' | 'loading-model' | 'generating' | 'speaking';

// Kokoro voice options
const KOKORO_VOICES = [
  { id: 'af_heart', name: 'Heart (Female)', lang: 'en-us', quality: 'A' },
  { id: 'af_bella', name: 'Bella (Female)', lang: 'en-us', quality: 'A-' },
  { id: 'af_nicole', name: 'Nicole (Female)', lang: 'en-us', quality: 'B+' },
  { id: 'af_sarah', name: 'Sarah (Female)', lang: 'en-us', quality: 'B' },
  { id: 'af_sky', name: 'Sky (Female)', lang: 'en-us', quality: 'C-' },
  { id: 'am_fenrir', name: 'Fenrir (Male)', lang: 'en-us', quality: 'C+' },
  { id: 'am_michael', name: 'Michael (Male)', lang: 'en-us', quality: 'B-' },
  { id: 'bf_emma', name: 'Emma (British F)', lang: 'en-gb', quality: 'B' },
  { id: 'bm_george', name: 'George (British M)', lang: 'en-gb', quality: 'C' },
  { id: 'bm_fable', name: 'Fable (British M)', lang: 'en-gb', quality: 'C' },
] as const;

export type NarratorVoice = {
  id: string;
  name: string;
  lang: string;
  quality: string;
};

const VOICE_STORAGE_KEY = 'flow_kokoro_voice';

export class RSVPNarrator {
  private static instance: RSVPNarrator;
  
  private _selectedVoice: string = 'af_heart';
  private _isEnabled: boolean = false;
  private _state: NarratorState = 'idle';
  private _rate: number = 1.0;
  private _volume: number = 1.0;
  private _modelLoadProgress: number = 0;
  
  // Kokoro TTS instance
  private tts: any = null;
  private isModelLoading: boolean = false;
  
  // Audio playback
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  
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
    this._selectedVoice = localStorage.getItem(VOICE_STORAGE_KEY) || 'af_heart';
  }

  public static getInstance(): RSVPNarrator {
    if (!RSVPNarrator.instance) {
      RSVPNarrator.instance = new RSVPNarrator();
    }
    return RSVPNarrator.instance;
  }

  // -- Model Loading --

  private async ensureModelLoaded(): Promise<boolean> {
    if (this.tts) return true;
    if (this.isModelLoading) {
      // Wait for current load to complete
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (this.tts) {
            clearInterval(checkLoaded);
            resolve(true);
          } else if (!this.isModelLoading) {
            clearInterval(checkLoaded);
            resolve(false);
          }
        }, 100);
      });
    }

    this.isModelLoading = true;
    this._state = 'loading-model';
    this._modelLoadProgress = 0;
    this.notify();

    try {
      console.log('[Narrator] Loading Kokoro TTS model...');
      
      // Dynamic import to enable code splitting
      const { KokoroTTS } = await import('kokoro-js');
      
      // Detect WebGPU support
      const hasWebGPU = typeof navigator !== 'undefined' && 
                        'gpu' in navigator && 
                        await (navigator as any).gpu?.requestAdapter?.() !== null;
      
      const device = hasWebGPU ? 'webgpu' : 'wasm';
      const dtype = device === 'webgpu' ? 'fp32' : 'q8'; // q8 for WASM is faster
      
      console.log(`[Narrator] Using device: ${device}, dtype: ${dtype}`);
      
      this.tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype,
        device,
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            this._modelLoadProgress = progress.progress;
            this.notify();
          }
        }
      });
      
      console.log('[Narrator] Model loaded successfully!');
      this._state = 'idle';
      this.isModelLoading = false;
      this.notify();
      return true;
    } catch (error) {
      console.error('[Narrator] Failed to load model:', error);
      this._state = 'idle';
      this.isModelLoading = false;
      this.notify();
      return false;
    }
  }

  public get modelLoadProgress(): number {
    return this._modelLoadProgress;
  }

  public get hasApiKey(): boolean {
    // No API key needed for Kokoro!
    return true;
  }

  // -- Voice Selection --

  public getAvailableVoices(): NarratorVoice[] {
    return KOKORO_VOICES.map(v => ({
      id: v.id,
      name: v.name,
      lang: v.lang,
      quality: v.quality
    }));
  }

  public setVoice(voiceId: string) {
    this._selectedVoice = voiceId;
    localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
    this.notify();
  }

  public get currentVoice(): NarratorVoice | null {
    const voice = KOKORO_VOICES.find(v => v.id === this._selectedVoice);
    if (!voice) return null;
    return {
      id: voice.id,
      name: voice.name,
      lang: voice.lang,
      quality: voice.quality
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
    if (!this._isEnabled || this.sentences.length === 0) {
      console.warn('[Narrator] Cannot start: enabled=', this._isEnabled, 'sentences=', this.sentences.length);
      return;
    }
    
    // Ensure model is loaded
    const loaded = await this.ensureModelLoaded();
    if (!loaded) {
      console.error('[Narrator] Model failed to load');
      return;
    }
    
    this.isAutoPlaying = true;
    await this.speakCurrentSentence();
  }

  /**
   * Speak the current sentence using Kokoro TTS
   */
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
      console.log(`[Narrator] Generating speech for: "${sentence.substring(0, 50)}..."`);
      
      // Generate audio with Kokoro
      const audio = await this.tts.generate(sentence, {
        voice: this._selectedVoice,
        speed: this._rate
      });
      
      if (!this.isAutoPlaying) return; // Stopped while generating
      
      this._state = 'speaking';
      this.notify();
      
      // Start word sync timer
      const words = sentence.split(/\s+/);
      this.startWordSync(words);
      
      // Play audio
      await this.playAudio(audio);
      
      // Audio finished playing
      this.stopWordSync();
      
      // Update base word index for next sentence
      this.baseWordIndex += words.length;
      
      // Move to next sentence
      this.currentSentenceIndex++;
      
      if (this.isAutoPlaying && this.currentSentenceIndex < this.sentences.length) {
        // Small pause between sentences
        setTimeout(() => this.speakCurrentSentence(), 50);
      } else {
        this._state = 'idle';
        this.isAutoPlaying = false;
        this.notify();
      }
    } catch (error) {
      console.error('[Narrator] TTS Error:', error);
      this._state = 'idle';
      this.isAutoPlaying = false;
      this.notify();
    }
  }

  /**
   * Play audio using Web Audio API
   */
  private async playAudio(audio: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create or resume audio context
        if (!this.audioContext) {
          this.audioContext = new AudioContext();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        
        // Get audio data - Kokoro returns { audio: Float32Array, sampling_rate: number }
        const audioData = audio.audio || audio.data || audio;
        const sampleRate = audio.sampling_rate || audio.sample_rate || 24000;
        
        // Create audio buffer
        const audioBuffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
        audioBuffer.copyToChannel(audioData, 0);
        
        // Create source node
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        
        // Create gain node for volume
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = this._volume;
        
        // Connect nodes
        this.currentSource.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Handle completion
        this.currentSource.onended = () => {
          this.currentSource = null;
          resolve();
        };
        
        // Start playback
        this.currentSource.start(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Estimate word timing and sync visual display
   */
  private startWordSync(words: string[]) {
    if (words.length === 0) return;
    
    this.stopWordSync();
    
    // Estimate duration (~150 WPM at 1.0x speed, adjusted for actual rate)
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
    
    // Stop current audio
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore - might already be stopped
      }
      this.currentSource = null;
    }
    
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
    // Kokoro works in any modern browser with WASM support
    return typeof WebAssembly !== 'undefined';
  }
}
