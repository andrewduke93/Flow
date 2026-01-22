import JSZip from 'jszip';
import { IngestionError, IngestionErrorType, Book, Chapter } from '../types';
import { calculateWordCount } from '../utils';
import { CoverService } from './coverService';
import { TitanStorage } from './titanStorage';

interface OpfData {
  metadata: {
    title: string;
    author: string;
    description?: string;
  };
  spine: string[]; 
  coverPath?: string;
}

/**
 * IngestionService
 * Handles parsing of EPUBs and Text files.
 * 
 * OPTIMIZATIONS:
 * - Centralized logic for text cleaning.
 * - Heuristic chapter detection extracted for clarity.
 * - Consistent saving of source buffers.
 */
export class IngestionService {
  private static instance: IngestionService;

  private constructor() {}

  public static getInstance(): IngestionService {
    if (!IngestionService.instance) {
      IngestionService.instance = new IngestionService();
    }
    return IngestionService.instance;
  }

  // MARK: - Public API

  public async ingest(file: File): Promise<Book> {
    try {
      this.validateFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const zip = await this.unzip(file);
      
      const opfPath = await this.parseContainer(zip);
      const opfData = await this.parseOPF(zip, opfPath);

      const book = await this.constructBookFromZip(zip, opfData);
      
      // Universal Cover Fallback
      if (!book.coverUrl) {
          book.coverUrl = await CoverService.findCover(book.title, book.author);
      }

      book.sourceType = 'epub';
      
      await this.persistBook(book, arrayBuffer);
      return book;

    } catch (error) {
      console.error(error);
      if (error instanceof IngestionError) throw error;
      throw new IngestionError(IngestionErrorType.UNKNOWN, (error as Error).message);
    }
  }

  public async ingestFromText(title: string, author: string, rawText: string, tintColor?: string, coverUrl?: string): Promise<Book> {
      const bookId = crypto.randomUUID();
      const chapters = this.heuristicChaptering(rawText);

      const book: Book = {
          id: bookId,
          title: title,
          author: author,
          coverUrl: coverUrl, 
          tintColorHex: tintColor, 
          lastOpened: new Date(),
          isFinished: false,
          bookmarkProgress: 0,
          chapters: chapters,
          sourceType: 'text'
      };

      if (!book.coverUrl) {
          book.coverUrl = await CoverService.findCover(title, author);
      }

      const encoder = new TextEncoder();
      const buffer = encoder.encode(rawText).buffer;
      
      await this.persistBook(book, buffer);
      return book;
  }

  // MARK: - Internal Helpers

  private async persistBook(book: Book, sourceBuffer: ArrayBuffer) {
      const storage = TitanStorage.getInstance();
      await storage.saveBook(book);
      await storage.saveSource(book.id, sourceBuffer);
  }

  private heuristicChaptering(rawText: string): Chapter[] {
      // 1. Gutenberg Header/Footer Strip
      let cleanText = rawText;
      const startMarker = cleanText.indexOf("*** START OF");
      const endMarker = cleanText.indexOf("*** END OF");
      
      if (startMarker !== -1) cleanText = cleanText.substring(cleanText.indexOf("\n", startMarker));
      if (endMarker !== -1) cleanText = cleanText.substring(0, endMarker);
      
      // 2. Segmentation
      const paragraphs = cleanText.split(/\n\s*\n/);
      const chapters: Chapter[] = [];
      let currentChapterContent: string[] = [];
      let chapterCount = 1;
      const PARAGRAPHS_PER_CHAPTER = 60; // Slightly increased

      for (const rawP of paragraphs) {
          const p = rawP.replace(/\s+/g, ' ').trim(); 
          if (!p) continue;

          // Detection: "Chapter X", "Book I", "Part Two"
          const isExplicitChapter = /^(chapter|book|part|prologue|epilogue)\s+\w+/i.test(p) && p.length < 50;
          
          if (isExplicitChapter && currentChapterContent.length > 15) {
              this.flushChapter(chapters, currentChapterContent, chapterCount++);
              currentChapterContent = [];
          }
          
          currentChapterContent.push(p);

          // Fallback splitting for massive text blocks without explicit chapters
          if (currentChapterContent.length >= PARAGRAPHS_PER_CHAPTER && !isExplicitChapter) {
               this.flushChapter(chapters, currentChapterContent, chapterCount++);
               currentChapterContent = [];
          }
      }

      if (currentChapterContent.length > 0) {
          this.flushChapter(chapters, currentChapterContent, chapterCount++);
      }

      return chapters;
  }

  private flushChapter(chapters: Chapter[], content: string[], index: number) {
      const contentStr = content.map(para => `<p>${para}</p>`).join("\n");
      const wc = calculateWordCount(contentStr);
      chapters.push({
          id: crypto.randomUUID(),
          title: `Part ${index}`,
          content: contentStr,
          sortOrder: index - 1,
          wordCount: wc,
          estimatedReadTime: Math.ceil(wc / 250)
      });
  }

  private async constructBookFromZip(zip: JSZip, data: OpfData): Promise<Book> {
    const bookId = crypto.randomUUID();
    let coverUrl: string | undefined;
    
    if (data.coverPath) {
      const coverFile = zip.file(data.coverPath);
      if (coverFile) {
        const coverBlob = await coverFile.async('blob');
        coverUrl = URL.createObjectURL(coverBlob);
      }
    }

    const chapters: Chapter[] = [];
    const BATCH_SIZE = 20; 

    // Optimized parallel processing
    for (let i = 0; i < data.spine.length; i += BATCH_SIZE) {
        const batchPaths = data.spine.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batchPaths.map((path, offset) => this.processEpubChapter(zip, path, i + offset))
        );
        results.forEach(res => { if (res) chapters.push(res); });
        
        // Yield to main thread
        if (i + BATCH_SIZE < data.spine.length) await new Promise(r => setTimeout(r, 0));
    }

    return {
      id: bookId,
      title: data.metadata.title,
      author: data.metadata.author,
      coverUrl: coverUrl,
      lastOpened: new Date(),
      isFinished: false,
      bookmarkProgress: 0,
      chapters: chapters
    };
  }

  private async processEpubChapter(zip: JSZip, path: string, index: number): Promise<Chapter | null> {
      const file = zip.file(path);
      if (!file) return null;

      const rawBytes = await file.async('uint8array');
      const cleanHtml = this.cleanTextAggressive(rawBytes);
      const plainText = cleanHtml.replace(/<[^>]+>/g, ' ').trim();
      const wordCount = calculateWordCount(plainText);
      
      if (wordCount < 10) return null;
      if (index < 10 && this.isLikelyFrontMatter(plainText, wordCount)) return null;

      return {
          id: crypto.randomUUID(),
          title: `Chapter ${index + 1}`, // Can be improved by parsing h1 tags
          content: cleanHtml,
          sortOrder: index,
          wordCount,
          estimatedReadTime: Math.ceil(wordCount / 250)
      };
  }

  private cleanTextAggressive(bytes: Uint8Array): string {
    let text = "";
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }

    // Structure Preservation Strategy
    // 1. Nuke scripts/styles
    text = text.replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // 2. Protect blocks
    text = text.replace(/<br\s*\/?>/gi, '___BR___');
    text = text.replace(/<\/(p|div|h\d|li|blockquote)>/gi, '___P___');
    
    // 3. Strip tags
    text = text.replace(/<[^>]+>/g, '');
    text = this.decodeEntities(text);
    
    // 4. Flatten source whitespace
    text = text.replace(/\s+/g, ' ');

    // 5. Restore structure
    text = text.replace(/___BR___/g, '\n');
    text = text.replace(/___P___/g, '\n\n');

    // 6. Wrap in paragraphs
    return text.split('\n\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !/^\d+$/.test(line)) // Filter empty or page numbers
        .map(line => `<p>${line}</p>`)
        .join('\n');
  }

  private isLikelyFrontMatter(text: string, wordCount: number): boolean {
      if (wordCount > 600) return false;
      const lower = text.toLowerCase().slice(0, 1000);
      return (wordCount < 200 && /copyright|rights reserved|isbn|published by|table of contents|acknowledgments/.test(lower));
  }

  private decodeEntities(str: string): string {
      const txt = document.createElement("textarea");
      txt.innerHTML = str;
      return txt.value;
  }

  // MARK: - ZIP Helpers

  private validateFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.epub') || file.size === 0) {
      throw new IngestionError(IngestionErrorType.INVALID_FILE, "Invalid EPUB file.");
    }
  }

  private async unzip(file: File): Promise<JSZip> {
    try {
      const zip = new JSZip();
      return await zip.loadAsync(file);
    } catch {
      throw new IngestionError(IngestionErrorType.CORRUPTION, "Corrupted archive.");
    }
  }

  private async parseContainer(zip: JSZip): Promise<string> {
    const file = zip.file("META-INF/container.xml");
    if (!file) throw new IngestionError(IngestionErrorType.MISSING_MANIFEST, "Missing container.xml");
    const text = await file.async("string");
    const match = text.match(/full-path=["']([^"']+)["']/i);
    if (!match) throw new IngestionError(IngestionErrorType.MISSING_MANIFEST, "Invalid container.xml");
    return match[1];
  }

  private async parseOPF(zip: JSZip, opfPath: string): Promise<OpfData> {
    const file = zip.file(opfPath);
    if (!file) throw new IngestionError(IngestionErrorType.MISSING_MANIFEST, "Missing OPF");
    const text = await file.async("string");
    
    const title = text.match(/<dc:title[^>]*>(.*?)<\/dc:title>/i)?.[1]?.trim() || "Unknown";
    const author = text.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/i)?.[1]?.trim() || "Unknown";
    
    // Manifest parsing
    const manifestMap = new Map<string, string>();
    const manifestRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["']/gi;
    let match;
    while ((match = manifestRegex.exec(text)) !== null) {
        manifestMap.set(match[1], match[2]);
    }

    // Spine parsing
    const spineHrefs: string[] = [];
    const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["']/gi;
    while ((match = spineRegex.exec(text)) !== null) {
        const href = manifestMap.get(match[1]);
        if (href) spineHrefs.push(this.resolvePath(opfPath, href));
    }

    // Cover
    const coverId = text.match(/<meta\s+name=["']cover["']\s+content=["']([^"']+)["']/i)?.[1];
    let coverPath = coverId ? manifestMap.get(coverId) : undefined;
    if (coverPath) coverPath = this.resolvePath(opfPath, coverPath);

    return { metadata: { title, author }, spine: spineHrefs, coverPath };
  }

  private resolvePath(base: string, relative: string): string {
    const folder = base.substring(0, base.lastIndexOf('/') + 1);
    return (folder + relative).replace(/\/+/g, '/'); // Normalize slashes
  }
}