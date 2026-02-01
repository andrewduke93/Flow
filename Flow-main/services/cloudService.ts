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

    if (!cloudBook.gutenbergId) {
        throw new Error("Cannot download book without Gutenberg ID");
    }

    try {
        const id = cloudBook.gutenbergId;

        // Step 1: Find the GITenberg Repo via GitHub API
        // We search for repositories belonging to user 'GITenberg' with the ID in the name.
        const searchUrl = `https://api.github.com/search/repositories?q=${id}+in:name+user:GITenberg`;
        
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

        // Step 2: Construct Raw URL
        // Pattern: https://raw.githubusercontent.com/GITenberg/[RepoName]/[Branch]/[ID].txt
        const rawUrl = `https://raw.githubusercontent.com/GITenberg/${repoName}/${defaultBranch}/${id}.txt`;

        // Step 3: Fetch Content
        const textResponse = await fetch(rawUrl);
        if (!textResponse.ok) {
            // Fallback: Try with 'master' if main failed or vice versa, or try without extension?
            // Usually 404 means structure is slightly different (e.g. inside a folder), 
            // but 99% of GITenberg repos follow root structure.
            throw new Error("Failed to retrieve text content from archive.");
        }
        
        const textContent = await textResponse.text();

        // Validation: Ensure we didn't get a 404 HTML page or empty file
        if (textContent.trim().startsWith("<!DOCTYPE html>") || textContent.length < 500) {
             throw new Error("Downloaded content appears invalid.");
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
