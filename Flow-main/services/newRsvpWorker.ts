// Lightweight RSVP tokenization worker
export {};

interface PrepareMsg {
  type: 'prepare';
  content: string;
  wpm: number;
  chunkSize?: number;
}

interface Token {
  index: number;
  text: string;
  duration: number; // ms
}

const punctuationFactor = (word: string) => {
  if (/[.!?]$/.test(word)) return 2.0;
  if (/[,;:]$/.test(word)) return 1.5;
  return 1.0;
};

const wordLengthFactor = (word: string) => {
  return Math.min(2.0, 1 + Math.max(0, word.length - 6) * 0.08);
};

const computeDuration = (wpm: number, word: string) => {
  const baseMs = 60000 / Math.max(1, wpm);
  const pf = punctuationFactor(word);
  const lf = wordLengthFactor(word);
  return Math.round(baseMs * pf * lf);
};

const tokenize = (content: string, wpm: number, chunkSize = 1): Token[] => {
  // Basic normalization
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return [];
  const words = cleaned.split(' ');
  const tokens: Token[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize);
    const text = slice.join(' ');
    const duration = computeDuration(wpm, slice[slice.length - 1] || text);
    tokens.push({ index: tokens.length, text, duration });
  }
  return tokens;
};

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
    const allTokens = tokenize(source, msg.wpm || 300, msg.chunkSize || 1);

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
