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
