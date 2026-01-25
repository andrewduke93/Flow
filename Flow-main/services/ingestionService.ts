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
      console.log(`[Ingestion] Starting import of: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      
      this.validateFile(file);
      
      // Read file as ArrayBuffer once for better mobile compatibility
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
        console.log(`[Ingestion] File loaded into memory: ${arrayBuffer.byteLength} bytes`);
      } catch (e) {
        console.error('[Ingestion] Failed to read file:', e);
        throw new IngestionError(IngestionErrorType.UNKNOWN, `Failed to read file: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
      
      const zip = await this.unzipFromBuffer(arrayBuffer);
      console.log(`[Ingestion] ZIP extracted, files:`, Object.keys(zip.files).length);
      
      const opfPath = await this.parseContainer(zip);
      console.log(`[Ingestion] OPF path: ${opfPath}`);
      
      const opfData = await this.parseOPF(zip, opfPath);
      console.log(`[Ingestion] OPF parsed - Title: "${opfData.metadata.title}", Spine items: ${opfData.spine.length}`);

      const book = await this.constructBookFromZip(zip, opfData);
      console.log(`[Ingestion] Book constructed with ${book.chapters.length} chapters`);
      
      // Universal Cover Fallback
      if (!book.coverUrl) {
          book.coverUrl = await CoverService.findCover(book.title, book.author);
      }

      book.sourceType = 'epub';
      
      await this.persistBook(book, arrayBuffer);
      console.log(`[Ingestion] Book persisted to storage`);
      return book;

    } catch (error) {
      console.error('[Ingestion] Import failed:', error);
      if (error instanceof IngestionError) throw error;
      throw new IngestionError(IngestionErrorType.UNKNOWN, (error as Error).message || 'Unknown import error');
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
      
      if (startMarker !== -1) {
          const contentPastMarker = cleanText.substring(startMarker);
          const firstRealLine = contentPastMarker.indexOf("\n", contentPastMarker.indexOf("\n") + 1);
          cleanText = contentPastMarker.substring(firstRealLine);
      }
      if (endMarker !== -1) {
          cleanText = cleanText.substring(0, endMarker);
      }
      
      // 2. Segmentation
      const paragraphs = cleanText.split(/\n\s*\n/);
      const chapters: Chapter[] = [];
      let currentChapterContent: string[] = [];
      let currentChapterTitle: string = "Preface";
      let chapterCount = 1;
      
      // FALLBACK CONSTANTS
      const MAX_PARAGRAPHS_WITHOUT_CHAPTER = 400; // Force break if no chapter found for too long

      for (let i = 0; i < paragraphs.length; i++) {
          const rawP = paragraphs[i];
          const p = rawP.replace(/\s+/g, ' ').trim(); 
          if (!p) continue;

          // Detection Logic: 
          // 1. Explicit labels: "Chapter 1", "CHAPTER I", "Letter 1", "Book One"
          // 2. Short, capitalized lines: "I.", "V.", "PROLOGUE"
          // 3. We exclude common false positives from Gutenberg headers
          const isExplicitChapterLabel = /^(chapter|book|part|letter|prologue|epilogue|foreword|preface|stave|volume|vol\.)\s*([ivxlcdm\d]+|the\s+\w+)?/i.test(p);
          const isShortRomanNumeral = /^[IVXLCDM]+\.?$/.test(p);
          const isSimpleNumeral = /^\d+\.?$/.test(p);
          const looksLikeTitle = isExplicitChapterLabel || (isShortRomanNumeral && p.length < 10) || (isSimpleNumeral && p.length < 5);
          
          const isExplicitChapter = looksLikeTitle && p.length < 100;
          
          // SMART CHAPTER DETECTOR: If we find a chapter marker, flush previous content
          // We also check if the content we're flushing is substantial (not just a TOC entry)
          // or if we've already accumulated enough text.
          if (isExplicitChapter) {
              const currentWC = calculateWordCount(currentChapterContent.join(" "));
              
              // If we have content (more than 50 words), flush it.
              // If we have very little content, it might be a TOC or a Preface.
              if (currentWC > 50 || chapters.length === 0) {
                  this.flushChapter(chapters, currentChapterContent, currentChapterTitle, chapterCount++);
                  currentChapterContent = [];
                  currentChapterTitle = p;
                  continue; 
              } else {
                  // If we had < 50 words, just update the title to the latest one we found.
                  // This naturally "eats" Table of Contents entries.
                  currentChapterTitle = p;
                  continue;
              }
          }
          
          currentChapterContent.push(p);

          // Fallback splitting for massive text blocks without explicit chapters
          if (currentChapterContent.length >= MAX_PARAGRAPHS_WITHOUT_CHAPTER) {
               this.flushChapter(chapters, currentChapterContent, currentChapterTitle, chapterCount++);
               currentChapterContent = [];
               currentChapterTitle = `Part ${chapterCount}`;
          }
      }

      if (currentChapterContent.length > 0) {
          this.flushChapter(chapters, currentChapterContent, currentChapterTitle, chapterCount++);
      }

      return chapters;
  }

  private flushChapter(chapters: Chapter[], content: string[], title: string, index: number) {
      const contentStr = content.map(para => `<p>${para}</p>`).join("\n");
      const wc = calculateWordCount(contentStr);
      
      // Polish Title
      let displayTitle = title.trim();
      // If it's just "I", make it "Chapter I" or similar? No, keep it auth-faithful.
      // But if it's some generic Part stuff, we can keep it.

      chapters.push({
          id: crypto.randomUUID(),
          title: displayTitle,
          content: contentStr,
          sortOrder: chapters.length,
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

    console.log(`[Ingestion] Processing ${data.spine.length} spine items for "${data.metadata.title}"`);

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

    console.log(`[Ingestion] Extracted ${chapters.length} chapters from "${data.metadata.title}"`);
    
    // FALLBACK: If no chapters extracted, try less aggressive filtering
    if (chapters.length === 0 && data.spine.length > 0) {
        console.warn(`[Ingestion] No chapters extracted, trying without front-matter filter...`);
        for (let i = 0; i < data.spine.length; i++) {
            const chapter = await this.processEpubChapterPermissive(zip, data.spine[i], i);
            if (chapter) chapters.push(chapter);
        }
        console.log(`[Ingestion] Permissive mode extracted ${chapters.length} chapters`);
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

  // Permissive chapter processor - less aggressive filtering
  private async processEpubChapterPermissive(zip: JSZip, path: string, index: number): Promise<Chapter | null> {
      const file = zip.file(path);
      if (!file) {
          console.warn(`[Ingestion] File not found: ${path}`);
          return null;
      }

      const rawBytes = await file.async('uint8array');
      const cleanHtml = this.cleanTextAggressive(rawBytes);
      const plainText = cleanHtml.replace(/<[^>]+>/g, ' ').trim();
      const wordCount = calculateWordCount(plainText);
      
      // Only skip truly empty content
      if (wordCount < 3) return null;

      return {
          id: crypto.randomUUID(),
          title: `Section ${index + 1}`,
          content: cleanHtml,
          sortOrder: index,
          wordCount,
          estimatedReadTime: Math.ceil(wordCount / 250)
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

  private async unzipFromBuffer(buffer: ArrayBuffer): Promise<JSZip> {
    try {
      const zip = new JSZip();
      console.log(`[Ingestion] Loading ZIP from ArrayBuffer (${buffer.byteLength} bytes)...`);
      const result = await zip.loadAsync(buffer);
      console.log(`[Ingestion] ZIP loaded successfully`);
      return result;
    } catch (e) {
      console.error('[Ingestion] ZIP extraction failed:', e);
      throw new IngestionError(IngestionErrorType.CORRUPTION, `Corrupted archive: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  // Keep old method for compatibility
  private async unzip(file: File): Promise<JSZip> {
    const buffer = await file.arrayBuffer();
    return this.unzipFromBuffer(buffer);
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
    
    const title = text.match(/<dc:title[^>]*>(.*?)<\/dc:title>/is)?.[1]?.trim() || "Unknown";
    const author = text.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/is)?.[1]?.trim() || "Unknown";
    
    // Manifest parsing - handle both single and double quotes, and various attribute orders
    const manifestMap = new Map<string, string>();
    // Match items with id and href in any order - handle self-closing tags with />
    const manifestRegex = /<item\s+([^>]+?)\s*\/?>/gi;
    let match;
    while ((match = manifestRegex.exec(text)) !== null) {
        const attrs = match[1];
        const idMatch = attrs.match(/id=["']([^"']+)["']/i);
        const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
        if (idMatch && hrefMatch) {
            manifestMap.set(idMatch[1], hrefMatch[1]);
        }
    }
    
    console.log(`[Ingestion] Manifest has ${manifestMap.size} items`);

    // Spine parsing - handle self-closing tags
    const spineHrefs: string[] = [];
    const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi;
    let spineMatch;
    while ((spineMatch = spineRegex.exec(text)) !== null) {
        const idref = spineMatch[1];
        const href = manifestMap.get(idref);
        if (href) {
            spineHrefs.push(this.resolvePath(opfPath, href));
        }
    }
    
    console.log(`[Ingestion] Spine has ${spineHrefs.length} items`);
    
    // FALLBACK: If spine is empty, try to find HTML/XHTML files from manifest
    if (spineHrefs.length === 0) {
        console.warn(`[Ingestion] Empty spine, falling back to manifest HTML files`);
        for (const [id, href] of manifestMap) {
            if (/\.(x?html?|htm)$/i.test(href)) {
                spineHrefs.push(this.resolvePath(opfPath, href));
            }
        }
        // Sort by filename to maintain some order
        spineHrefs.sort();
        console.log(`[Ingestion] Fallback found ${spineHrefs.length} HTML files`);
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