/**
 * CoverService
 * Interfaces with Open Library to retrieve book covers for items that lack them.
 * This is the "Universal" fallback for Imported and Searched books.
 * 
 * OPTIMIZATIONS (v2):
 * - Stores cover images as blobs in IndexedDB for offline persistence
 * - Survives hard reloads (no more disappearing covers)
 * - Falls back to URL if blob fetch fails
 */

import { TitanStorage } from './titanStorage';

export class CoverService {
  private static SEARCH_URL = "https://openlibrary.org/search.json";
  private static IMAGE_URL = "https://covers.openlibrary.org/b/id";

  /**
   * Attempts to find a cover image URL for a given title/author.
   * Returns undefined if not found or if request times out.
   */
  public static async findCover(title: string, author: string): Promise<string | undefined> {
    try {
      // Cleanup query
      const cleanTitle = title.replace(/\(.*\)/, "").trim();
      const cleanAuthor = author.replace(/\(.*\)/, "").trim();
      
      const q = encodeURIComponent(`${cleanTitle} ${cleanAuthor}`);
      
      // 2.5s Timeout to prevent hanging ingestion
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(`${this.SEARCH_URL}?q=${q}&limit=1&fields=cover_i`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) return undefined;
      
      const data = await response.json();
      const coverId = data.docs?.[0]?.cover_i;

      if (coverId) {
        // Return Large (L) cover for best quality on Retina displays
        return `${this.IMAGE_URL}/${coverId}-L.jpg`;
      }
    } catch (e) {
      // Silent fail - app will fallback to ProceduralCover
      // console.warn("Cover fetch failed:", e);
    }
    return undefined;
  }

  /**
   * Downloads a cover image and stores it as a blob in IndexedDB.
   * Returns a blob URL that persists across reloads.
   * 
   * @param bookId - The book's unique ID (used as storage key)
   * @param coverUrl - The external cover URL to download
   * @returns A blob URL for the cached image, or the original URL if caching fails
   */
  public static async cacheAndGetCover(bookId: string, coverUrl: string): Promise<string> {
    try {
      const storage = TitanStorage.getInstance();
      
      // 1. Check if we already have a cached blob
      const cachedBlob = await storage.getCoverBlob(bookId);
      if (cachedBlob) {
        return URL.createObjectURL(cachedBlob);
      }

      // 2. Download the image
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(coverUrl, {
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn('[CoverService] Failed to download cover:', response.status);
        return coverUrl; // Fallback to original URL
      }

      // 3. Store as blob
      const blob = await response.blob();
      await storage.saveCoverBlob(bookId, blob);
      
      // 4. Return blob URL
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[CoverService] Cache failed, using URL:', e);
      return coverUrl; // Fallback to original URL
    }
  }

  /**
   * Retrieves a cached cover blob URL for a book.
   * Returns undefined if no cached cover exists.
   */
  public static async getCachedCover(bookId: string): Promise<string | undefined> {
    try {
      const storage = TitanStorage.getInstance();
      const blob = await storage.getCoverBlob(bookId);
      if (blob) {
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      // Silent fail
    }
    return undefined;
  }

  /**
   * Clears a cached cover blob (call when deleting a book).
   */
  public static async clearCachedCover(bookId: string): Promise<void> {
    try {
      const storage = TitanStorage.getInstance();
      await storage.deleteCoverBlob(bookId);
    } catch (e) {
      // Silent fail
    }
  }
}