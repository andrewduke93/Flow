// Minimal adapter: try to use `reedy` parser if present (injected via importScripts or global),
// otherwise fall back to a simple tokenizer. This file is TypeScript so it can be imported
// by the worker entry `services/newRsvpWorker.ts` and bundled by Vite.

export interface Token {
  index: number;
  text: string;
  duration: number;
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

const simpleTokenize = (content: string, wpm: number, chunkSize = 1): Token[] => {
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

export const tokenizeWithReedy = (
  content: string,
  wpm: number,
  chunkSize = 1
): Token[] => {
  try {
    const reedy = (globalThis as any).reedy;
    if (reedy && (reedy.simpleParser || reedy.parse1 || reedy.parse3)) {
      // Prefer simpleParser when available
      const parser = reedy.simpleParser || reedy.parse1 || reedy.parse3;
      // Parser returns Token objects with methods; map to strings
      const parsed = parser(content || '');
      if (!parsed || !parsed.length) return [];
      const texts = parsed.map((t: any) => {
        try {
          return typeof t === 'string' ? t : (t.toString ? t.toString() : String(t));
        } catch (e) {
          return String(t);
        }
      });
      // If parser exposes complexity, use it to influence duration; otherwise fallback to heuristics
      return texts.map((text: string, i: number) => {
        const rawToken = parsed[i];
        let duration = computeDuration(wpm, text);
        if (rawToken && typeof rawToken.getComplexity === 'function') {
          try {
            const complexity = rawToken.getComplexity();
            // Map complexity to multiplier in a conservative way
            duration = Math.round(duration * Math.max(0.7, Math.min(3, complexity)));
          } catch (e) {
            // ignore
          }
        }
        return { index: i, text, duration } as Token;
      });
    }
  } catch (e) {
    // fallthrough to simple tokenize
  }
  return simpleTokenize(content, wpm, chunkSize);
};

export default tokenizeWithReedy;
