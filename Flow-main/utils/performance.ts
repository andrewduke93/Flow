/**
 * Performance Utilities
 * Helpers for optimizing expensive operations
 */

/**
 * Throttle function execution to at most once per interval.
 * Use for: scroll handlers, resize handlers, frequent updates
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;

  return function executedFunction(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
  };
}

/**
 * Debounce function execution to only run after a delay of inactivity.
 * Use for: search inputs, save operations, API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Request idle callback wrapper with fallback.
 * Use for: non-critical background tasks
 */
export function runWhenIdle(callback: () => void, timeout = 2000): void {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, Math.min(50, timeout));
  }
}

/**
 * Batch multiple operations together using requestAnimationFrame.
 * Use for: DOM updates, animations
 */
export class RAFBatcher {
  private pending = false;
  private operations: Array<() => void> = [];

  add(operation: () => void): void {
    this.operations.push(operation);
    if (!this.pending) {
      this.pending = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    const ops = this.operations;
    this.operations = [];
    this.pending = false;
    ops.forEach(op => op());
  }

  clear(): void {
    this.operations = [];
    this.pending = false;
  }
}

/**
 * Simple LRU cache for expensive computations.
 * Use for: frequently accessed data with limited variations
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists (to re-insert at end)
    this.cache.delete(key);
    
    // Add new entry
    this.cache.set(key, value);
    
    // Evict oldest if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Memory-efficient chunked array processing.
 * Use for: processing large arrays without blocking UI
 */
export async function processChunked<T, R>(
  items: T[],
  processor: (item: T, index: number) => R,
  chunkSize: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += chunkSize) {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        const chunk = items.slice(i, i + chunkSize);
        chunk.forEach((item, idx) => {
          results.push(processor(item, i + idx));
        });
        resolve();
      });
    });
  }
  
  return results;
}
