// wordFrequency.ts
// Minimal English word frequency list for RSVP pacing (top 5000 words)
// For demo: only a small sample. In production, use a full list or a compressed trie.

export const COMMON_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us'
]);

// Returns a frequency rank (lower is more common, higher is rarer)
// For demo, returns 1 for common, 100 for rare
export function getWordFrequencyRank(word: string): number {
  return COMMON_WORDS.has(word.toLowerCase()) ? 1 : 100;
}
