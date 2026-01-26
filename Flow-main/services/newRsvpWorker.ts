// Lightweight RSVP tokenization worker
import { tokenizeWithReedy, Token } from '../packages/reedy-core/reedyWrapper';

interface PrepareMsg {
  type: 'prepare';
  content: string;
  wpm: number;
  chunkSize?: number;
}

// Helper: extract visible text from HTML string (best-effort)
const extractTextFromHTML = (html: string): string => {
  try {
    // DOMParser is available in browser workers
    const dp = new DOMParser();
    const doc = dp.parseFromString(html, 'text/html');
    return doc.body ? doc.body.textContent || '' : '';
  } catch (e) {
    // Fallback: strip tags naively
    return html.replace(/<[^>]+>/g, ' ');
  }
};

self.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as PrepareMsg;
  if (!msg || msg.type !== 'prepare') return;
  try {
    let source = msg.content || '';
    // Detect HTML-ish content and extract visible text
    if (/</.test(source) && /[a-z][\s\S]*>/i.test(source)) {
      source = extractTextFromHTML(source);
    }

    const CHUNK_POST_SIZE = 500; // tokens per incremental post
    const allTokens = tokenizeWithReedy(source, msg.wpm || 300, msg.chunkSize || 1);

    if (allTokens.length === 0) {
      (self as any).postMessage({ type: 'prepared', tokens: [] });
      return;
    }

    // Post chunks incrementally for streaming UX
    for (let i = 0; i < allTokens.length; i += CHUNK_POST_SIZE) {
      const slice = allTokens.slice(i, i + CHUNK_POST_SIZE);
      // Progress as fraction
      const progress = Math.min(0.99, (i + slice.length) / allTokens.length);
      (self as any).postMessage({ type: 'chunk', tokens: slice, progress });
    }

    // Final prepared message (complete)
    (self as any).postMessage({ type: 'prepared', tokens: allTokens });
  } catch (e) {
    (self as any).postMessage({ type: 'error', message: String(e) });
  }
});

// Try to load Reedy scripts into worker global scope so `reedy` becomes available.
async function loadReedyIntoWorker(): Promise<boolean> {
  try {
    // Expose window alias for scripts that expect `window`
    try {
      (self as any).window = self;
    } catch (e) {
      // ignore
    }

    const base = (self as any).location && (self as any).location.origin
      ? (self as any).location.origin + '/packages/reedy-core/js/content/'
      : '/packages/reedy-core/js/content/';

    const files = [
      'content.js',
      'Parser.js',
      'Sequencer.js',
      'Reader.js',
      'View.js',
      'ContentSelector.js'
    ];

    for (const f of files) {
      const url = base + f;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const code = await res.text();
        // Evaluate in global scope
        (0, eval)(code);
      } catch (e) {
        // If any file fails, abort loading and return false
        (self as any).postMessage({ type: 'reedy-load-error', file: f, message: String(e) });
        return false;
      }
    }

    if ((globalThis as any).reedy) {
      (self as any).postMessage({ type: 'reedy-loaded' });
      return true;
    }

    (self as any).postMessage({ type: 'reedy-load-error', message: 'reedy global not found after load' });
    return false;
  } catch (e) {
    (self as any).postMessage({ type: 'reedy-load-error', message: String(e) });
    return false;
  }
}

// Start load but don't block worker message handling
loadReedyIntoWorker().catch(() => {});
