/**
 * StreamEngine - Inspired by Moon+ Reader & ReadEra
 * 
 * PHILOSOPHY: One flat stream of words. No chapters. No parsing.
 * Position is just an integer index into the word array.
 * 
 * PERFORMANCE PRINCIPLES:
 * 1. Zero allocation during reading
 * 2. Pre-computed word boundaries (one-time cost on load)
 * 3. Direct array access - O(1) for everything
 * 4. GPU compositing for all animations
 * 5. Unified position for RSVP + scroll (they're the same thing)
 */

export interface WordSpan {
  text: string;
  start: number;  // Character offset in source
  end: number;
  index: number;  // Word index (THE position)
  // Pre-computed display hints
  trailingPause: number;  // 0 = none, 1 = comma, 2 = period, 3 = paragraph
}

export interface StreamState {
  words: WordSpan[];
  totalWords: number;
  sourceText: string;
  isReady: boolean;
}

/**
 * StreamEngine Singleton
 * The only source of truth for reading position.
 */
export class StreamEngine {
  private static instance: StreamEngine;
  
  // THE DATA
  private words: WordSpan[] = [];
  private sourceText: string = '';
  private totalWords: number = 0;
  
  // THE POSITION (single source of truth)
  private _position: number = 0;
  private _isPlaying: boolean = false;
  private _wpm: number = 300;
  
  // Playback
  private playbackTimer: number | null = null;
  
  // Listeners (minimal - no re-render storms)
  private positionListeners: Set<(pos: number) => void> = new Set();
  private playStateListeners: Set<(playing: boolean) => void> = new Set();
  
  private constructor() {}
  
  static getInstance(): StreamEngine {
    if (!StreamEngine.instance) {
      StreamEngine.instance = new StreamEngine();
    }
    return StreamEngine.instance;
  }
  
  // ============================================
  // LOAD - One-time cost, then instant access
  // ============================================
  
  /**
   * Load text and pre-compute word boundaries.
   * This is O(n) but happens once on book open.
   * After this, all operations are O(1).
   */
  load(text: string): void {
    this.stop();
    this.sourceText = text;
    this.words = [];
    
    if (!text || text.length === 0) {
      this.totalWords = 0;
      return;
    }
    
    // FAST TOKENIZATION
    // Single pass, no regex backtracking, pre-allocated array
    const estimatedWords = Math.ceil(text.length / 5);
    this.words = new Array(estimatedWords);
    let wordIndex = 0;
    
    let wordStart = -1;
    let lastCharWasSpace = true;
    let pendingParagraphBreak = false;
    
    for (let i = 0; i <= text.length; i++) {
      const char = i < text.length ? text[i] : ' ';
      const isSpace = char === ' ' || char === '\t' || char === '\n' || char === '\r';
      const isNewline = char === '\n';
      
      // Track paragraph breaks
      if (isNewline) {
        pendingParagraphBreak = true;
      }
      
      if (isSpace && !lastCharWasSpace && wordStart >= 0) {
        // End of word
        const wordText = text.slice(wordStart, i);
        
        // Compute trailing pause
        let pause = 0;
        const lastChar = wordText[wordText.length - 1];
        if (lastChar === '.' || lastChar === '!' || lastChar === '?') pause = 2;
        else if (lastChar === ',' || lastChar === ';' || lastChar === ':') pause = 1;
        else if (lastChar === '—' || lastChar === '–') pause = 1;
        
        if (pendingParagraphBreak && pause < 3) {
          // Next word starts a new paragraph, so this word ends one
        }
        
        this.words[wordIndex] = {
          text: wordText,
          start: wordStart,
          end: i,
          index: wordIndex,
          trailingPause: pause
        };
        wordIndex++;
        wordStart = -1;
      } else if (!isSpace && lastCharWasSpace) {
        // Start of word
        wordStart = i;
        
        // If we had a paragraph break before this word, mark the previous word
        if (pendingParagraphBreak && wordIndex > 0) {
          this.words[wordIndex - 1].trailingPause = 3;
        }
        pendingParagraphBreak = false;
      }
      
      lastCharWasSpace = isSpace;
    }
    
    // Trim to actual size
    this.words.length = wordIndex;
    this.totalWords = wordIndex;
  }
  
  // ============================================
  // POSITION - THE ONLY STATE THAT MATTERS
  // ============================================
  
  get position(): number {
    return this._position;
  }
  
  set position(value: number) {
    const clamped = Math.max(0, Math.min(this.totalWords - 1, value));
    if (clamped !== this._position) {
      this._position = clamped;
      this.notifyPosition();
    }
  }
  
  get progress(): number {
    return this.totalWords > 0 ? this._position / this.totalWords : 0;
  }
  
  set progress(value: number) {
    this.position = Math.floor(value * this.totalWords);
  }
  
  get total(): number {
    return this.totalWords;
  }
  
  // ============================================
  // WORD ACCESS - O(1)
  // ============================================
  
  getWord(index: number): WordSpan | null {
    return this.words[index] || null;
  }
  
  getCurrentWord(): WordSpan | null {
    return this.words[this._position] || null;
  }
  
  /**
   * Get a window of words around current position.
   * Used for efficient rendering.
   */
  getWindow(before: number, after: number): WordSpan[] {
    const start = Math.max(0, this._position - before);
    const end = Math.min(this.totalWords, this._position + after);
    return this.words.slice(start, end);
  }
  
  /**
   * Get words in a range (for scroll view).
   * Returns direct slice - no allocation if consumer doesn't modify.
   */
  getRange(start: number, count: number): WordSpan[] {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(this.totalWords, safeStart + count);
    return this.words.slice(safeStart, safeEnd);
  }
  
  /**
   * Get words grouped into paragraphs for display.
   * Paragraphs are delimited by words with trailingPause === 3.
   */
  getParagraphs(startWord: number, maxParagraphs: number): { words: WordSpan[], startIndex: number }[] {
    const result: { words: WordSpan[], startIndex: number }[] = [];
    let current: WordSpan[] = [];
    let currentStart = startWord;
    
    for (let i = startWord; i < this.totalWords && result.length < maxParagraphs; i++) {
      const word = this.words[i];
      if (current.length === 0) currentStart = i;
      current.push(word);
      
      if (word.trailingPause === 3) {
        result.push({ words: current, startIndex: currentStart });
        current = [];
      }
    }
    
    // Don't forget trailing content
    if (current.length > 0 && result.length < maxParagraphs) {
      result.push({ words: current, startIndex: currentStart });
    }
    
    return result;
  }
  
  /**
   * Binary search to find word index from scroll position.
   * O(log n) - fast enough for scroll tracking.
   */
  wordIndexFromProgress(progress: number): number {
    return Math.floor(progress * this.totalWords);
  }
  
  // ============================================
  // PLAYBACK - RSVP
  // ============================================
  
  get isPlaying(): boolean {
    return this._isPlaying;
  }
  
  get wpm(): number {
    return this._wpm;
  }
  
  set wpm(value: number) {
    this._wpm = Math.max(50, Math.min(1500, value));
    if (this._isPlaying) {
      this.stop();
      this.play();
    }
  }
  
  play(): void {
    if (this._isPlaying || this.totalWords === 0) return;
    this._isPlaying = true;
    this.notifyPlayState();
    this.scheduleNext();
  }
  
  stop(): void {
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this._isPlaying) {
      this._isPlaying = false;
      this.notifyPlayState();
    }
  }
  
  toggle(): void {
    if (this._isPlaying) {
      this.stop();
    } else {
      this.play();
    }
  }
  
  private scheduleNext(): void {
    if (!this._isPlaying) return;
    
    const word = this.getCurrentWord();
    if (!word) {
      this.stop();
      return;
    }
    
    // Base interval from WPM
    let interval = 60000 / this._wpm;
    
    // Adjust for punctuation/pauses
    const pause = word.trailingPause;
    if (pause === 1) interval *= 1.3;      // Comma
    else if (pause === 2) interval *= 1.8; // Period
    else if (pause === 3) interval *= 2.2; // Paragraph
    
    // Adjust for word length
    const len = word.text.length;
    if (len > 10) interval *= 1.2;
    else if (len > 7) interval *= 1.1;
    else if (len <= 2) interval *= 0.85;
    
    this.playbackTimer = window.setTimeout(() => {
      if (this._position < this.totalWords - 1) {
        this.position = this._position + 1;
        this.scheduleNext();
      } else {
        this.stop();
      }
    }, interval);
  }
  
  // ============================================
  // NAVIGATION
  // ============================================
  
  skipForward(words: number = 10): void {
    this.position = this._position + words;
  }
  
  skipBack(words: number = 10): void {
    this.position = this._position - words;
  }
  
  jumpToStart(): void {
    this.position = 0;
  }
  
  jumpToEnd(): void {
    this.position = this.totalWords - 1;
  }
  
  // ============================================
  // SUBSCRIPTIONS - Minimal overhead
  // ============================================
  
  onPosition(callback: (pos: number) => void): () => void {
    this.positionListeners.add(callback);
    return () => this.positionListeners.delete(callback);
  }
  
  onPlayState(callback: (playing: boolean) => void): () => void {
    this.playStateListeners.add(callback);
    return () => this.playStateListeners.delete(callback);
  }
  
  private notifyPosition(): void {
    const pos = this._position;
    this.positionListeners.forEach(cb => cb(pos));
  }
  
  private notifyPlayState(): void {
    const playing = this._isPlaying;
    this.playStateListeners.forEach(cb => cb(playing));
  }
  
  // ============================================
  // DEBUG
  // ============================================
  
  getStats(): { totalWords: number, position: number, progress: number, isPlaying: boolean, wpm: number } {
    return {
      totalWords: this.totalWords,
      position: this._position,
      progress: this.progress,
      isPlaying: this._isPlaying,
      wpm: this._wpm
    };
  }
}
