import { Book } from '../types';
import { TitanSettingsService } from './configService';

/**
 * WebTextContentStorage
 */
export class WebTextContentStorage {
  private _content: string = "";
  public attributes: Record<string, string> = {};
  private layoutManagers: WebTextLayoutManager[] = [];

  get string(): string { return this._content; }
  set string(val: string) { this._content = val; }
  addLayoutManager(manager: WebTextLayoutManager) { this.layoutManagers.push(manager); }
}

/**
 * WebTextContainer
 */
export class WebTextContainer {
  public size: { width: number; height: number };
  public widthTracksTextView: boolean = false;
  public heightTracksTextView: boolean = false;
  public lineFragmentPadding: number = 5.0;
  constructor(size: { width: number; height: number }) { this.size = size; }
}

/**
 * WebTextLayoutManager
 */
export class WebTextLayoutManager {
  public id: string;
  public textContainers: WebTextContainer[] = [];
  constructor(id: string) { this.id = id; }
  public addTextContainer(container: WebTextContainer) { this.textContainers.push(container); }
  public enumerateTextSegments(
    range: { location: number; length: number },
    type: 'standard' | 'selection',
    block: (frame: { x: number; y: number; width: number; height: number }) => boolean
  ): void {
    const mockFrame = { x: 0, y: 0, width: 0, height: 0 }; 
    block(mockFrame);
  }
}

/**
 * TitanCore
 * The central nervous system of the reading engine.
 */
export class TitanCore {
  private static instance: TitanCore;
  private listeners: Set<() => void> = new Set();
  private jumpListeners: Set<(percentage: number) => void> = new Set();
  private offsetJumpListeners: Set<(offset: number) => void> = new Set();
  private progressListeners: Set<(progress: number) => void> = new Set();

  public contentStorage: WebTextContentStorage;
  public primaryLayout: WebTextLayoutManager;
  public ghostLayout: WebTextLayoutManager;

  public isLoading: boolean = false;
  public loadingProgress: number = 0; // 0.0 to 1.0

  public currentBook: Book | null = null;
  public currentProgress: number = 0;
  public isRSVPMode: boolean = false;
  
  public globalCharacterOffset: number = 0;
  public userSelectionOffset: number | null = null;

  // -- NUCLEAR OPTION STATE --
  public totalTokens: number = 1; // Default to 1 to avoid div/0
  // Accurate mapping of which token index starts each chapter
  public chapterTokenOffsets: number[] = []; 
  
  private _loadTimestamp: number = 0; // For Safe Guard

  private constructor() {
    this.contentStorage = new WebTextContentStorage();
    this.primaryLayout = new WebTextLayoutManager('primary');
    this.ghostLayout = new WebTextLayoutManager('ghost');
    this.configurePipeline();
    TitanSettingsService.getInstance().subscribe(() => this.updateTypography());
  }

  public static getInstance(): TitanCore {
    if (!TitanCore.instance) TitanCore.instance = new TitanCore();
    return TitanCore.instance;
  }

  private configurePipeline() {
    this.contentStorage.addLayoutManager(this.primaryLayout);
    this.contentStorage.addLayoutManager(this.ghostLayout);
  }

  public async load(book: Book): Promise<void> {
    this._loadTimestamp = Date.now();
    this.isLoading = true;
    this.loadingProgress = 0.1;
    this.notify();

    // MUTABLE COPY STRATEGY:
    const mutableBook = { ...book };

    // CACHE HIT LOGIC
    if (this.currentBook?.id === book.id && this.contentStorage.string.length > 0) {
        if (mutableBook.lastTokenIndex !== undefined) {
             this.currentBook.lastTokenIndex = mutableBook.lastTokenIndex;
             if (this.totalTokens > 0) {
                 this.currentProgress = Math.min(1, mutableBook.lastTokenIndex / this.totalTokens);
             }
        }
        this.currentBook.bookmarkProgress = mutableBook.bookmarkProgress || this.currentProgress;
        this.isLoading = false;
        this.loadingProgress = 1.0;
        this.notify();
        return;
    }

    // FRESH LOAD - ASYNC YIELDING
    this.unload();
    this.notify();

    // Small delay to allow UI to render the Loading state
    await new Promise(r => setTimeout(r, 50));

    try {
        const chapters = mutableBook.chapters ? [...mutableBook.chapters] : [];
        chapters.sort((a, b) => a.sortOrder - b.sortOrder);
        
        // 1. RAW TEXT EXTRACTION & TOKEN MAPPING
        // We calculate exact token offsets here to ensure 100% accuracy for chapter jumps.
        this.chapterTokenOffsets = [];
        let runningTokenCount = 0;
        
        // Parallel arrays for reconstruction
        const cleanHtmlChunks: string[] = [];
        const totalChapters = chapters.length;

        for (let i = 0; i < totalChapters; i++) {
             // Cooperative Multitasking
             if (i % 5 === 0) {
                 this.loadingProgress = 0.1 + (0.8 * (i / totalChapters));
                 this.notify();
                 await new Promise(r => setTimeout(r, 0));
             }

             // A. Token Counting (Plain Text)
             const rawContent = chapters[i].content.replace(/<[^>]+>/g, ' ').trim();
             const tokensInChapter = rawContent.length > 0 ? rawContent.split(/\s+/).length : 0;
             
             this.chapterTokenOffsets.push(runningTokenCount);
             runningTokenCount += tokensInChapter;

             // B. HTML Cleaning (For Render)
             let htmlText = chapters[i].content || "";
             htmlText = htmlText.replace(/<(br|p|div|h\d|li|blockquote)[^>]*>/gi, '\n');
             htmlText = htmlText.replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n');
             
             const parser = new DOMParser();
             const doc = parser.parseFromString(htmlText, 'text/html');
             const cleanBody = doc.body.textContent || "";
             // Normalize whitespace but keep paragraph breaks
             const finalClean = cleanBody.replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
             cleanHtmlChunks.push(finalClean);
        }
        
        this.totalTokens = Math.max(1, runningTokenCount);
        this.contentStorage.string = cleanHtmlChunks.join("\n\n");
        this.currentBook = mutableBook;
        
        // Hydrate state
        if (mutableBook.lastTokenIndex !== undefined) {
            this.currentBook.lastTokenIndex = mutableBook.lastTokenIndex;
            this.currentProgress = Math.min(1, mutableBook.lastTokenIndex / this.totalTokens);
        } else {
            this.currentProgress = mutableBook.bookmarkProgress || 0;
            if (this.currentProgress > 0) {
                this.currentBook.lastTokenIndex = Math.floor(this.currentProgress * this.totalTokens);
            }
        }
        
        this.currentBook.bookmarkProgress = this.currentProgress;
        this.updateTypography();

    } catch (error) {
        console.error("[TitanCore] Critical Error loading book:", error);
    } finally {
        this.isLoading = false;
        this.loadingProgress = 1.0;
        this.notify();
    }
  }

  public unload() {
      this.currentBook = null;
      this.contentStorage.string = "";
      this.userSelectionOffset = null;
      this.isRSVPMode = false;
      this.totalTokens = 1; 
      this.chapterTokenOffsets = [];
  }

  public updateTypography() {
    const settings = TitanSettingsService.getInstance().getSettings();
    let fontFamily = '"New York Extra Large", "Times New Roman", serif';
    if (settings.fontFamily === 'SF Pro') fontFamily = '"SF Pro Rounded", -apple-system, sans-serif';
    if (settings.fontFamily === 'OpenDyslexic') fontFamily = '"OpenDyslexic", "Comic Sans MS", sans-serif';
    if (settings.fontFamily === 'Atkinson Hyperlegible') fontFamily = '"Atkinson Hyperlegible", sans-serif';

    const weight = settings.fontSize < 18 ? '500' : (settings.fontSize > 32 ? '300' : '400');
    this.contentStorage.attributes = {
      fontFamily: fontFamily,
      fontSize: `${settings.fontSize}px`,
      lineHeight: `${settings.lineHeight}`,
      paragraphSpacing: `${settings.paragraphSpacing}px`,
      letterSpacing: '0.2px',
      fontWeight: weight,
      color: 'inherit' 
    };
    this.notify();
  }

  public updateLayout(size: { width: number; height: number }): void {
    this.primaryLayout.textContainers = [];
    const container = new WebTextContainer(size);
    container.widthTracksTextView = true;
    this.primaryLayout.addTextContainer(container);
    this.notify();
  }

  /**
   * NUCLEAR SAVE FUNCTION (With Safe Guards)
   */
  public saveProgress(tokenIndex: number) {
    if (!this.currentBook) return;
    if (typeof tokenIndex !== 'number' || tokenIndex < 0) return;

    // SAFE GUARD: Prevent accidental reset to 0 during load
    const timeSinceLoad = Date.now() - this._loadTimestamp;
    const existingIndex = this.currentBook.lastTokenIndex || 0;
    
    if (tokenIndex === 0 && existingIndex > 50 && timeSinceLoad < 3000) {
        return;
    }

    // 1. Save the hard integer (The Truth)
    this.currentBook.lastTokenIndex = tokenIndex;
    
    // 2. Derive the percentage
    let percent = 0;
    if (this.totalTokens > 0) {
        percent = tokenIndex / this.totalTokens;
    }
    
    if (isNaN(percent) || !isFinite(percent)) percent = 0;
    
    this.currentProgress = Math.min(1, Math.max(0, percent));
    this.currentBook.bookmarkProgress = this.currentProgress;
    this.currentBook.lastOpened = new Date();

    // 3. AUTO-COMPLETE LOGIC
    // If we are extremely close to the end, just mark it finished.
    if (this.currentProgress >= 0.99) {
        this.currentBook.isFinished = true;
    }
      
    this.progressListeners.forEach(cb => cb(this.currentProgress));
  }

  public restorePosition(totalScrollHeight: number, clientHeight: number): number {
    return 0; 
  }

  public jump(percentage: number) {
    this.currentProgress = Math.max(0, Math.min(1, percentage));
    
    if (this.currentBook && this.totalTokens > 0) {
        const estimatedIndex = Math.floor(percentage * this.totalTokens);
        this.currentBook.lastTokenIndex = estimatedIndex;
        this.currentBook.bookmarkProgress = this.currentProgress;
        // Broadcast to ALL listeners to ensure UI/Scrubber sync
        this.jumpListeners.forEach(cb => cb(percentage)); 
        this.progressListeners.forEach(cb => cb(percentage)); 
    }
    this.notify();
  }

  /**
   * Jumps precisely to the start of a chapter.
   */
  public jumpToChapter(chapterIndex: number) {
      if (chapterIndex < 0 || chapterIndex >= this.chapterTokenOffsets.length) return;
      
      const tokenIndex = this.chapterTokenOffsets[chapterIndex];
      this.currentBook!.lastTokenIndex = tokenIndex;
      
      if (this.totalTokens > 0) {
          this.currentProgress = tokenIndex / this.totalTokens;
          this.currentBook!.bookmarkProgress = this.currentProgress;
      }
      
      // Broadcast to ALL listeners to ensure UI/Scrubber sync
      this.jumpListeners.forEach(cb => cb(this.currentProgress));
      this.progressListeners.forEach(cb => cb(this.currentProgress)); 
      
      this.notify();
  }
  
  public syncFromRSVP(charOffset: number, tokenIndex: number) {
      this.globalCharacterOffset = charOffset;
      this.saveProgress(tokenIndex);
      this.offsetJumpListeners.forEach(cb => cb(charOffset));
  }

  public selectText(offset: number) {
      this.userSelectionOffset = offset;
      this.notify();
  }

  public onJump(callback: (percentage: number) => void): () => void {
    this.jumpListeners.add(callback);
    return () => this.jumpListeners.delete(callback);
  }

  public onOffsetJump(callback: (offset: number) => void): () => void {
    this.offsetJumpListeners.add(callback);
    return () => this.offsetJumpListeners.delete(callback);
  }
  
  public onProgress(callback: (progress: number) => void): () => void {
      this.progressListeners.add(callback);
      return () => this.progressListeners.delete(callback);
  }

  public rectForRange(range: { location: number; length: number }): { x: number; y: number; width: number; height: number } | null {
    return null;
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public notify() {
    this.listeners.forEach(cb => cb());
  }
}