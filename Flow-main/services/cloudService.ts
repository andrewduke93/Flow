import { Book } from "../types";
import { IngestionService } from "./ingestionService";
import { CoverService } from "./coverService";

export interface CloudBook {
  title: string;
  author: string;
  summary: string;
  moodColor: string; // Hex
  genre?: string;
  tags?: string[];
  coverUrl?: string; // Enhanced Metadata
  gutenbergId?: string; // The Key to the Vault
  isCopyrightedReplacement?: boolean; // UI feedback
}

/**
 * STATIC CATALOG (The Vault)
 * Curated classics with verified IDs.
 */
const FEATURED_BOOKS: CloudBook[] = [
    { 
        title: "Frankenstein", 
        author: "Mary Shelley", 
        summary: "A scientist creates a sentient creature in a unorthodox scientific experiment. Gothic sci-fi vibes.", 
        moodColor: "#56494E",
        genre: "Gothic Fiction",
        tags: ["Sci-Fi", "Classic", "Horror"],
        gutenbergId: "84"
    },
    { 
        title: "Pride and Prejudice", 
        author: "Jane Austen", 
        summary: "The turbulent relationship between Elizabeth Bennet and Fitzwilliam Darcy. Witty and romantic.", 
        moodColor: "#D8A49B",
        genre: "Romance",
        tags: ["Social Commentary", "Classic"],
        gutenbergId: "1342"
    },
    { 
        title: "Dracula", 
        author: "Bram Stoker", 
        summary: "Count Dracula's attempt to move from Transylvania to England. The ultimate vampire horror.", 
        moodColor: "#740001",
        genre: "Horror",
        tags: ["Epistolary", "Classic", "Vampires"],
        gutenbergId: "345"
    },
    { 
        title: "The Great Gatsby", 
        author: "F. Scott Fitzgerald", 
        summary: "A portrait of the Jazz Age in all its decadence and excess. Tragic glamour.", 
        moodColor: "#E3C565",
        genre: "Modernist Fiction",
        tags: ["Jazz Age", "American Classic"],
        gutenbergId: "64317"
    },
    { 
        title: "Moby Dick", 
        author: "Herman Melville", 
        summary: "The narrative of the sailor Ishmael and the obsessive quest of Ahab. Deep ocean madness.", 
        moodColor: "#476C9B",
        genre: "Adventure",
        tags: ["Nautical", "Classic"],
        gutenbergId: "2701"
    },
    { 
        title: "Alice's Adventures in Wonderland", 
        author: "Lewis Carroll", 
        summary: "A young girl named Alice falls through a rabbit hole into a fantasy world. Surreal and trippy.", 
        moodColor: "#6D9DC5",
        genre: "Fantasy",
        tags: ["Surrealism", "Classic", "Children"],
        gutenbergId: "11"
    },
    { 
        title: "The Picture of Dorian Gray", 
        author: "Oscar Wilde", 
        summary: "A philosophical novel about a man whose portrait ages while he stays young. Aesthetic hedonism.", 
        moodColor: "#2E4052",
        genre: "Philosophical Fiction",
        tags: ["Aestheticism", "Classic"],
        gutenbergId: "174"
    },
    { 
        title: "The Adventures of Sherlock Holmes", 
        author: "Arthur Conan Doyle", 
        summary: "A consulting detective known for his proficiency with observation and deduction. Foggy London mystery.", 
        moodColor: "#5C5C5C",
        genre: "Mystery",
        tags: ["Detective", "Classic"],
        gutenbergId: "1661"
    },
    { 
        title: "The Metamorphosis", 
        author: "Franz Kafka", 
        summary: "Salesman Gregor Samsa wakes one morning to find himself inexplicably transformed. Existential dread.", 
        moodColor: "#556B2F",
        genre: "Existentialism",
        tags: ["Absurdist", "Classic"],
        gutenbergId: "5200"
    },
    { 
        title: "Wuthering Heights", 
        author: "Emily Brontë", 
        summary: "A tale of the all-encompassing and passionate, yet thwarted, love. Windy moors and ghosts.", 
        moodColor: "#483C46",
        genre: "Gothic Romance",
        tags: ["Moors", "Classic"],
        gutenbergId: "768"
    }
];

// Helper to generate a consistent mood color from a string
const generateColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

interface GutendexBook {
    id: number;
    title: string;
    authors: { name: string }[];
    subjects: string[];
    formats: Record<string, string>;
    summaries?: string[];
}

/**
 * CloudService
 * The Librarian.
 */
export class CloudService {
  private static instance: CloudService;

  private constructor() {}

  public static getInstance(): CloudService {
    if (!CloudService.instance) {
      CloudService.instance = new CloudService();
    }
    return CloudService.instance;
  }

  public getFeaturedBooks(): CloudBook[] {
      // Hydrate featured books with Covers if needed (though UI handles fallback)
      return FEATURED_BOOKS.map(b => ({
          ...b,
          // If no cover explicitly set, try to use standard Gutenberg pattern
          coverUrl: b.coverUrl || `https://www.gutenberg.org/cache/epub/${b.gutenbergId}/pg${b.gutenbergId}.cover.medium.jpg`
      }));
  }

  /**
   * 1. THE BRAIN (Gutendex Search)
   * Queries the Gutendex API for reliable, downloadable books.
   * Now intelligently handles multi-dimensional queries (title, author, genre).
   */
  public async searchCuratedBooks(query: string): Promise<CloudBook[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return this.getFeaturedBooks();

    // Strategy: We perform two searches in parallel to broaden the "discovery" reach
    // 1. Text Search (Titles/Authors)
    // 2. Topic Search (Genres/Subjects)
    const textUrl = `https://gutendex.com/books/?search=${encodeURIComponent(cleanQuery)}`;
    const topicUrl = `https://gutendex.com/books/?topic=${encodeURIComponent(cleanQuery)}`;

    try {
        const [textRes, topicRes] = await Promise.all([
            fetch(textUrl).then(r => r.json()),
            fetch(topicUrl).then(r => r.json())
        ]);

        const textResults: GutendexBook[] = textRes.results || [];
        const topicResults: GutendexBook[] = topicRes.results || [];

        // Merge and De-duplicate
        const seenIds = new Set<number>();
        const merged: GutendexBook[] = [];

        [...textResults, ...topicResults].forEach(book => {
            if (!seenIds.has(book.id)) {
                seenIds.add(book.id);
                merged.push(book);
            }
        });

        // Filter for quality and downloadability
        return merged
            .filter(b => b.formats["text/plain"] || b.formats["text/plain; charset=utf-8"])
            .slice(0, 20) // Slightly more results for discovery
            .map(b => {
                const authorName = b.authors.length > 0 ? b.authors[0].name.replace(/,/, "") : "Unknown Author";
                const cover = b.formats["image/jpeg"] || b.formats["image/png"] || `https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.cover.medium.jpg`;

                // Extract Metadata
                const genre = b.subjects.length > 0 ? b.subjects[0].split(" -- ")[0] : "Classic";
                const tags = b.subjects.map(s => s.split(" -- ")[0]).slice(0, 3);
                
                return {
                    title: b.title,
                    author: authorName,
                    summary: b.summaries && b.summaries.length > 0 ? b.summaries[0] : `A ${genre} masterpiece by ${authorName}.`,
                    genre,
                    tags,
                    moodColor: generateColor(b.title),
                    gutenbergId: b.id.toString(),
                    coverUrl: cover
                };
            });

    } catch (e) {
        console.error("Discovery search failed", e);
        return [];
    }
  }

  /**
   * 2. THE HANDS (GITenberg Download)
   * Uses GitHub API to find the exact repo in the GITenberg project,
   * then fetches the raw text content. Reliable, CORS-friendly, no proxies.
   */
  public async downloadBook(cloudBook: CloudBook): Promise<Book> {
    console.log(`[CloudService] Initiating acquisition for: ${cloudBook.title} (ID: ${cloudBook.gutenbergId})`);

    if (!cloudBook.gutenbergId) {
        throw new Error("Cannot download book without Gutenberg ID");
    }

    try {
        const id = cloudBook.gutenbergId;

        // Step 1: Find the GITenberg Repo via GitHub API
        const searchUrl = `https://api.github.com/search/repositories?q=${id}+in:name+user:GITenberg`;
        console.log(`[CloudService] Locating repo: ${searchUrl}`);
        
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error("Could not locate book repository.");
        
        const searchData = await searchRes.json();
        if (!searchData.items || searchData.items.length === 0) {
             throw new Error("Book not found in GITenberg archives.");
        }

        // Take the first match
        const repo = searchData.items[0];
        const defaultBranch = repo.default_branch || 'master';
        const repoName = repo.name;

        // Step 2: Try multiple possible file locations
        // Pattern variations: [ID].txt, [ID]_utf8.txt, maybe in a cache folder
        const possiblePaths = [
            `${id}.txt`,
            `${id}_utf8.txt`,
            `${id}_utf-8.txt`,
            `cache/epub/${id}/${id}-0.txt`,
            `cache/epub/${id}/pg${id}.txt`,
            `pg${id}.txt`
        ];

        let textContent = "";
        let successPath = "";

        for (const path of possiblePaths) {
            const rawUrl = `https://raw.githubusercontent.com/GITenberg/${repoName}/${defaultBranch}/${path}`;
            try {
                const textResponse = await fetch(rawUrl);
                if (textResponse.ok) {
                    const content = await textResponse.text();
                    // Accept if not an HTML error page and has reasonable content
                    if (!content.trim().startsWith("<!DOCTYPE html>") && !content.trim().startsWith("<") && content.length > 1000) {
                        textContent = content;
                        successPath = path;
                        console.log(`[CloudService] Successfully fetched from: ${rawUrl}`);
                        break;
                    }
                }
            } catch (e) {
                // Continue to next path
                continue;
            }
        }

        if (!textContent) {
            throw new Error("Could not retrieve text content from any known location in the archive.");
        }

        // Step 4: Ingest
        return IngestionService.getInstance().ingestFromText(
            cloudBook.title,
            cloudBook.author,
            textContent,
            cloudBook.moodColor,
            cloudBook.coverUrl
        );

    } catch (e) {
        console.error("[CloudService] Download failed", e);
        throw new Error("Could not download book. Please try another title.");
    }
  }
}
