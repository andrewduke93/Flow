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

self.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as PrepareMsg;
  if (!msg || msg.type !== 'prepare') return;
  try {
    const tokens = tokenize(msg.content || '', msg.wpm || 300, msg.chunkSize || 1);
    // Post prepared tokens back to main thread
    (self as any).postMessage({ type: 'prepared', tokens });
  } catch (e) {
    (self as any).postMessage({ type: 'error', message: String(e) });
  }
});
