/**
 * BookstoreService
 * Unified interface for multiple free ebook sources:
 * - Standard Ebooks (high-quality, curated public domain)
 * - Open Library (massive catalog with borrowing)
 * - Feedbooks (OPDS public domain)
 * 
 * Each source has its own search and download mechanics but
 * presents a unified CloudBook interface.
 */

import { Book } from "../types";
import { IngestionService } from "./ingestionService";

export interface BookstoreBook {
  id: string;
  title: string;
  author: string;
  summary: string;
  moodColor: string;
  coverUrl?: string;
  source: 'standard-ebooks' | 'open-library' | 'feedbooks' | 'gutenberg';
  downloadUrl?: string;
  // Source-specific metadata
  openLibraryKey?: string;
  standardEbooksUrl?: string;
  feedbooksId?: string;
}

// CORS proxy for fetching from external domains
// Uses multiple fallback proxies for reliability
const CORS_PROXIES = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

async function fetchWithCORS(url: string): Promise<Response> {
  // Try each proxy in order
  const errors: string[] = [];
  
  for (const makeUrl of CORS_PROXIES) {
    try {
      const proxyUrl = makeUrl(url);
      console.log('[CORS] Trying:', proxyUrl);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        console.log('[CORS] Success with proxy');
        return res;
      }
      errors.push(`Status ${res.status}`);
    } catch (e) {
      errors.push(String(e));
      continue;
    }
  }
  
  console.error('[CORS] All proxies failed:', errors);
  throw new Error(`All CORS proxies failed: ${errors.join(', ')}`);
}

// Color generator from string hash
const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate muted, pleasant colors
  const h = Math.abs(hash % 360);
  const s = 35 + (Math.abs(hash >> 8) % 25); // 35-60% saturation
  const l = 35 + (Math.abs(hash >> 16) % 20); // 35-55% lightness
  return `hsl(${h}, ${s}%, ${l}%)`;
};

// Convert HSL to Hex for storage
const hslToHex = (hsl: string): string => {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return '#666666';
  
  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * ========================================
 * STANDARD EBOOKS
 * ========================================
 * High-quality, carefully formatted public domain books.
 * Uses their OPDS feed for discovery.
 */
class StandardEbooksProvider {
  private readonly OPDS_URL = 'https://standardebooks.org/feeds/opds/all';
  private cachedBooks: BookstoreBook[] | null = null;

  async getFeatured(): Promise<BookstoreBook[]> {
    // Hand-picked popular Standard Ebooks
    return [
      {
        id: 'se-pride-and-prejudice',
        title: 'Pride and Prejudice',
        author: 'Jane Austen',
        summary: 'The story of Elizabeth Bennet and Mr. Darcy. Witty social commentary and timeless romance.',
        moodColor: '#C9A86C',
        coverUrl: 'https://standardebooks.org/images/covers/jane-austen_pride-and-prejudice.jpg',
        source: 'standard-ebooks',
        standardEbooksUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice'
      },
      {
        id: 'se-1984',
        title: '1984',
        author: 'George Orwell',
        summary: 'A dystopian masterpiece about totalitarianism, surveillance, and the struggle for truth.',
        moodColor: '#4A4A4A',
        coverUrl: 'https://standardebooks.org/images/covers/george-orwell_1984.jpg',
        source: 'standard-ebooks',
        standardEbooksUrl: 'https://standardebooks.org/ebooks/george-orwell/1984'
      },
      {
        id: 'se-great-gatsby',
        title: 'The Great Gatsby',
        author: 'F. Scott Fitzgerald',
        summary: 'Jazz Age glamour, tragic love, and the dark side of the American Dream.',
        moodColor: '#C5A03F',
        coverUrl: 'https://standardebooks.org/images/covers/f-scott-fitzgerald_the-great-gatsby.jpg',
        source: 'standard-ebooks',
        standardEbooksUrl: 'https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby'
      },
      {
        id: 'se-metamorphosis',
        title: 'The Metamorphosis',
        author: 'Franz Kafka',
        summary: 'Gregor Samsa wakes to find himself transformed into a monstrous insect. Existential horror.',
        moodColor: '#5D5D3D',
        coverUrl: 'https://standardebooks.org/images/covers/franz-kafka_the-metamorphosis.jpg',
        source: 'standard-ebooks',
        standardEbooksUrl: 'https://standardebooks.org/ebooks/franz-kafka/the-metamorphosis/david-wyllie'
      },
      {
        id: 'se-heart-of-darkness',
        title: 'Heart of Darkness',
        author: 'Joseph Conrad',
        summary: 'A voyage into the African jungle becomes a journey into the depths of human nature.',
        moodColor: '#3D4A3D',
        coverUrl: 'https://standardebooks.org/images/covers/joseph-conrad_heart-of-darkness.jpg',
        source: 'standard-ebooks',
        standardEbooksUrl: 'https://standardebooks.org/ebooks/joseph-conrad/heart-of-darkness'
      }
    ];
  }

  async search(query: string): Promise<BookstoreBook[]> {
    try {
      // Standard Ebooks has a simple API endpoint
      const res = await fetch(`https://standardebooks.org/ebooks?query=${encodeURIComponent(query)}&view=grid`);
      const html = await res.text();
      
      // Parse the HTML response (they don't have a JSON API)
      const books: BookstoreBook[] = [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const articles = doc.querySelectorAll('article.ebook');
      articles.forEach((article, idx) => {
        if (idx >= 15) return; // Limit results
        
        const titleEl = article.querySelector('h2 a, p.title a');
        const authorEl = article.querySelector('p.author a, p.byline a');
        const imgEl = article.querySelector('img');
        const linkEl = article.querySelector('a[href*="/ebooks/"]');
        
        if (titleEl && linkEl) {
          const title = titleEl.textContent?.trim() || 'Unknown';
          const author = authorEl?.textContent?.trim() || 'Unknown Author';
          const href = linkEl.getAttribute('href') || '';
          const cover = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
          
          books.push({
            id: `se-${href.replace(/[^a-z0-9]/gi, '-')}`,
            title,
            author,
            summary: `A beautifully formatted edition from Standard Ebooks.`,
            moodColor: hslToHex(generateColor(title)),
            coverUrl: cover ? `https://standardebooks.org${cover}` : undefined,
            source: 'standard-ebooks',
            standardEbooksUrl: `https://standardebooks.org${href}`
          });
        }
      });
      
      return books;
    } catch (e) {
      console.error('[StandardEbooks] Search failed:', e);
      return [];
    }
  }

  async download(book: BookstoreBook): Promise<string> {
    if (!book.standardEbooksUrl) throw new Error('No Standard Ebooks URL');
    
    // Standard Ebooks provides .txt downloads at predictable URLs
    // Convert URL like /ebooks/jane-austen/pride-and-prejudice
    // to download URL like /ebooks/jane-austen/pride-and-prejudice/text/single-page
    
    const textUrl = `${book.standardEbooksUrl}/text/single-page`;
    
    try {
      const res = await fetchWithCORS(textUrl);
      if (!res.ok) throw new Error('Failed to fetch text');
      
      const html = await res.text();
      
      // Extract text content from the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove navigation, headers, etc.
      doc.querySelectorAll('nav, header, footer, .toc, #toc, .colophon, .titlepage, .imprint').forEach(el => el.remove());
      
      // Get the main content
      const content = doc.querySelector('main, article, body');
      const text = content?.textContent || '';
      
      if (text.length < 500) {
        throw new Error('Content too short');
      }
      
      return text;
      
    } catch (e) {
      console.error('[StandardEbooks] Download failed:', e);
      throw new Error('Could not download from Standard Ebooks');
    }
  }
}

/**
 * ========================================
 * OPEN LIBRARY
 * ========================================
 * Massive catalog from Internet Archive.
 * Supports borrowing with free account.
 */
class OpenLibraryProvider {
  async getFeatured(): Promise<BookstoreBook[]> {
    // Popular freely-readable books on Open Library
    return [
      {
        id: 'ol-little-women',
        title: 'Little Women',
        author: 'Louisa May Alcott',
        summary: 'Four sisters coming of age during the Civil War. Warmth, ambition, and sisterhood.',
        moodColor: '#8B7355',
        coverUrl: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
        source: 'open-library',
        openLibraryKey: '/works/OL18020W'
      },
      {
        id: 'ol-sherlock',
        title: 'The Adventures of Sherlock Holmes',
        author: 'Arthur Conan Doyle',
        summary: 'The legendary detective and his faithful companion solve impossible mysteries.',
        moodColor: '#5C5C5C',
        coverUrl: 'https://covers.openlibrary.org/b/id/12645114-L.jpg',
        source: 'open-library',
        openLibraryKey: '/works/OL262421W'
      },
      {
        id: 'ol-frankenstein',
        title: 'Frankenstein',
        author: 'Mary Shelley',
        summary: 'The original science fiction horror. A creature brought to life questions its existence.',
        moodColor: '#4A5D4A',
        coverUrl: 'https://covers.openlibrary.org/b/id/6788811-L.jpg',
        source: 'open-library',
        openLibraryKey: '/works/OL450016W'
      },
      {
        id: 'ol-count-monte-cristo',
        title: 'The Count of Monte Cristo',
        author: 'Alexandre Dumas',
        summary: 'An epic tale of betrayal, imprisonment, and elaborate revenge.',
        moodColor: '#4A4A6B',
        coverUrl: 'https://covers.openlibrary.org/b/id/8756146-L.jpg',
        source: 'open-library',
        openLibraryKey: '/works/OL118219W'
      },
      {
        id: 'ol-jane-eyre',
        title: 'Jane Eyre',
        author: 'Charlotte Brontë',
        summary: 'A governess falls for her brooding employer, but Thornfield Hall hides dark secrets.',
        moodColor: '#6B5B5B',
        coverUrl: 'https://covers.openlibrary.org/b/id/12818044-L.jpg',
        source: 'open-library',
        openLibraryKey: '/works/OL4343264W'
      }
    ];
  }

  async search(query: string): Promise<BookstoreBook[]> {
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,first_sentence,subject`
      );
      const data = await res.json();
      
      return (data.docs || [])
        .filter((doc: any) => doc.cover_i) // Only books with covers
        .slice(0, 15)
        .map((doc: any) => ({
          id: `ol-${doc.key.replace('/works/', '')}`,
          title: doc.title || 'Unknown',
          author: doc.author_name?.[0] || 'Unknown Author',
          summary: doc.first_sentence?.[0] || `Explore this title from Open Library.`,
          moodColor: hslToHex(generateColor(doc.title || '')),
          coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          source: 'open-library' as const,
          openLibraryKey: doc.key
        }));
    } catch (e) {
      console.error('[OpenLibrary] Search failed:', e);
      return [];
    }
  }

  async download(book: BookstoreBook): Promise<string> {
    if (!book.openLibraryKey) throw new Error('No Open Library key');
    
    try {
      // Get edition info to find an Internet Archive ID
      const workRes = await fetch(`https://openlibrary.org${book.openLibraryKey}.json`);
      const workData = await workRes.json();
      
      // Try to find a readable edition
      const editionsRes = await fetch(`https://openlibrary.org${book.openLibraryKey}/editions.json?limit=20`);
      const editionsData = await editionsRes.json();
      
      // Look for an edition with full text available (prioritize those with ocaid)
      const editionsWithOcaid = (editionsData.entries || []).filter((e: any) => e.ocaid);
      
      for (const edition of editionsWithOcaid) {
        try {
          // Try the plain text version from Internet Archive
          const textUrl = `https://archive.org/download/${edition.ocaid}/${edition.ocaid}_djvu.txt`;
          const textRes = await fetchWithCORS(textUrl);
          if (textRes.ok) {
            const text = await textRes.text();
            if (text.length > 1000) {
              return text;
            }
          }
        } catch {
          continue;
        }
      }
      
      // If no direct text, try to get readable online version
      throw new Error('No readable edition found. Some books require borrowing from Open Library.');
    } catch (e) {
      console.error('[OpenLibrary] Download failed:', e);
      throw new Error('Could not download. Try visiting openlibrary.org to borrow this book.');
    }
  }
}

/**
 * ========================================
 * FEEDBOOKS
 * ========================================
 * Public domain OPDS catalog.
 */
class FeedbooksProvider {
  async getFeatured(): Promise<BookstoreBook[]> {
    return [
      {
        id: 'fb-war-peace',
        title: 'War and Peace',
        author: 'Leo Tolstoy',
        summary: 'An epic of Russian society during the Napoleonic era. Love, war, and philosophy.',
        moodColor: '#5B4B3B',
        coverUrl: 'https://pictures.abebooks.com/isbn/9780140447934-us.jpg',
        source: 'feedbooks',
        feedbooksId: '37'
      },
      {
        id: 'fb-crime-punishment',
        title: 'Crime and Punishment',
        author: 'Fyodor Dostoevsky',
        summary: 'A young man commits murder and descends into psychological torment.',
        moodColor: '#4B3B3B',
        coverUrl: 'https://covers.openlibrary.org/b/id/8752120-L.jpg',
        source: 'feedbooks',
        feedbooksId: '44'
      },
      {
        id: 'fb-odyssey',
        title: 'The Odyssey',
        author: 'Homer',
        summary: 'The original adventure story. Odysseus journeys home from the Trojan War.',
        moodColor: '#3B4B6B',
        coverUrl: 'https://covers.openlibrary.org/b/id/8406786-L.jpg',
        source: 'feedbooks',
        feedbooksId: '1024'
      },
      {
        id: 'fb-paradise-lost',
        title: 'Paradise Lost',
        author: 'John Milton',
        summary: 'The fall of Man. Satan, Adam, Eve, and the battle between Heaven and Hell.',
        moodColor: '#2B2B3B',
        coverUrl: 'https://covers.openlibrary.org/b/id/8091016-L.jpg',
        source: 'feedbooks',
        feedbooksId: '20'
      },
      {
        id: 'fb-les-miserables',
        title: 'Les Misérables',
        author: 'Victor Hugo',
        summary: 'Jean Valjean seeks redemption in post-revolutionary France. Epic and heartbreaking.',
        moodColor: '#4B4B5B',
        coverUrl: 'https://covers.openlibrary.org/b/id/8231855-L.jpg',
        source: 'feedbooks',
        feedbooksId: '48'
      }
    ];
  }

  async search(query: string): Promise<BookstoreBook[]> {
    try {
      // Feedbooks OPDS search
      const res = await fetch(
        `https://feedbooks.com/books/search.atom?query=${encodeURIComponent(query)}`
      );
      const text = await res.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      
      const entries = doc.querySelectorAll('entry');
      const books: BookstoreBook[] = [];
      
      entries.forEach((entry, idx) => {
        if (idx >= 15) return;
        
        const title = entry.querySelector('title')?.textContent || 'Unknown';
        const authorEl = entry.querySelector('author name');
        const author = authorEl?.textContent || 'Unknown Author';
        const summary = entry.querySelector('summary, content')?.textContent || '';
        const coverLink = entry.querySelector('link[rel="http://opds-spec.org/image"]');
        const cover = coverLink?.getAttribute('href');
        const idEl = entry.querySelector('id');
        const id = idEl?.textContent?.split('/').pop() || String(idx);
        
        books.push({
          id: `fb-${id}`,
          title,
          author,
          summary: summary.slice(0, 200),
          moodColor: hslToHex(generateColor(title)),
          coverUrl: cover || undefined,
          source: 'feedbooks',
          feedbooksId: id
        });
      });
      
      return books;
    } catch (e) {
      console.error('[Feedbooks] Search failed:', e);
      return [];
    }
  }

  async download(book: BookstoreBook): Promise<string> {
    if (!book.feedbooksId) throw new Error('No Feedbooks ID');
    
    try {
      // Feedbooks provides txt downloads for public domain books
      const txtUrl = `https://www.feedbooks.com/book/${book.feedbooksId}.txt`;
      const res = await fetchWithCORS(txtUrl);
      
      if (!res.ok) {
        // Try epub endpoint and extract text
        const epubUrl = `https://www.feedbooks.com/book/${book.feedbooksId}.epub`;
        throw new Error('Text version not available, try epub');
      }
      
      const text = await res.text();
      
      if (text.length < 500) {
        throw new Error('Content too short');
      }
      
      return text;
    } catch (e) {
      console.error('[Feedbooks] Download failed:', e);
      throw new Error('Could not download from Feedbooks');
    }
  }
}

/**
 * ========================================
 * UNIFIED BOOKSTORE SERVICE
 * ========================================
 */
export class BookstoreService {
  private static instance: BookstoreService;
  
  private standardEbooks = new StandardEbooksProvider();
  private openLibrary = new OpenLibraryProvider();
  private feedbooks = new FeedbooksProvider();

  private constructor() {}

  public static getInstance(): BookstoreService {
    if (!BookstoreService.instance) {
      BookstoreService.instance = new BookstoreService();
    }
    return BookstoreService.instance;
  }

  /**
   * Get featured books from a specific source
   */
  async getFeatured(source: 'standard-ebooks' | 'open-library' | 'feedbooks'): Promise<BookstoreBook[]> {
    switch (source) {
      case 'standard-ebooks':
        return this.standardEbooks.getFeatured();
      case 'open-library':
        return this.openLibrary.getFeatured();
      case 'feedbooks':
        return this.feedbooks.getFeatured();
    }
  }

  /**
   * Search a specific source
   */
  async search(source: 'standard-ebooks' | 'open-library' | 'feedbooks', query: string): Promise<BookstoreBook[]> {
    switch (source) {
      case 'standard-ebooks':
        return this.standardEbooks.search(query);
      case 'open-library':
        return this.openLibrary.search(query);
      case 'feedbooks':
        return this.feedbooks.search(query);
    }
  }

  /**
   * Search all sources at once
   */
  async searchAll(query: string): Promise<BookstoreBook[]> {
    const [se, ol, fb] = await Promise.allSettled([
      this.standardEbooks.search(query),
      this.openLibrary.search(query),
      this.feedbooks.search(query)
    ]);

    const results: BookstoreBook[] = [];
    if (se.status === 'fulfilled') results.push(...se.value);
    if (ol.status === 'fulfilled') results.push(...ol.value);
    if (fb.status === 'fulfilled') results.push(...fb.value);

    return results;
  }

  /**
   * Download and ingest a book
   */
  async downloadBook(book: BookstoreBook): Promise<Book> {
    let text: string;

    switch (book.source) {
      case 'standard-ebooks':
        text = await this.standardEbooks.download(book);
        break;
      case 'open-library':
        text = await this.openLibrary.download(book);
        break;
      case 'feedbooks':
        text = await this.feedbooks.download(book);
        break;
      default:
        throw new Error('Unknown source');
    }

    if (!text || text.length < 500) {
      throw new Error('Downloaded content is too short or empty');
    }

    return IngestionService.getInstance().ingestFromText(
      book.title,
      book.author,
      text,
      book.moodColor,
      book.coverUrl
    );
  }
}
