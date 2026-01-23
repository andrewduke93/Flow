/**
 * CoverService
 * Interfaces with Open Library to retrieve book covers for items that lack them.
 * This is the "Universal" fallback for Imported and Searched books.
 */
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
}