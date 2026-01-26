/**
 * RSVPGrammarEngine
 * 
 * Intelligent pacing system that respects written grammar patterns.
 * Based on reading comprehension research and natural language processing.
 * 
 * Philosophy: RSVP should feel like hearing a skilled narrator read aloud.
 * Great narrators pause at punctuation, slow for emphasis, and speed through
 * connecting words—creating rhythm that aids comprehension.
 * 
 * @author Flow Team
 * @version 1.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACING CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Function Words (Grammatical Glue)
 * These can be displayed faster—readers process them almost subconsciously.
 * Research shows function words take ~20% less time to recognize.
 */
const FUNCTION_WORDS = new Set([
  // Articles
  'a', 'an', 'the',
  // Pronouns
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  // Prepositions
  'at', 'by', 'for', 'from', 'in', 'of', 'on', 'to', 'with',
  'about', 'after', 'before', 'between', 'into', 'through', 'during',
  'above', 'below', 'under', 'over', 'behind', 'beside', 'beyond',
  // Auxiliaries
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  // Conjunctions (handled separately for clause detection)
  'and', 'or', 'but', 'nor', 'so', 'yet',
  // Others
  'as', 'if', 'then', 'than', 'when', 'while', 'where', 'there', 'here',
  'not', "n't", 'no', 'yes',
  'very', 'just', 'only', 'also', 'even', 'still', 'too',
]);

/**
 * Clause-Starting Words
 * These often begin subordinate clauses and benefit from a slight pre-pause.
 */
const CLAUSE_STARTERS = new Set([
  'although', 'because', 'before', 'after', 'unless', 'until', 'while',
  'whereas', 'whenever', 'wherever', 'whether', 'though', 'since',
  'if', 'when', 'where', 'as', 'that', 'which', 'who', 'whom', 'whose',
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'meanwhile', 'otherwise', 'consequently', 'accordingly',
]);

/**
 * Coordinating Conjunctions (FANBOYS)
 * When these join independent clauses, they deserve a pause.
 */
const COORD_CONJUNCTIONS = new Set(['for', 'and', 'nor', 'but', 'or', 'yet', 'so']);

/**
 * High-Attention Words
 * Words that often carry semantic weight and deserve full attention.
 */
const EMPHASIS_WORDS = new Set([
  'never', 'always', 'absolutely', 'definitely', 'certainly', 'surely',
  'suddenly', 'finally', 'immediately', 'instantly',
  'important', 'critical', 'crucial', 'essential', 'significant',
  'amazing', 'incredible', 'extraordinary', 'remarkable', 'astonishing',
  'terrible', 'horrible', 'devastating', 'catastrophic',
  'beautiful', 'gorgeous', 'magnificent', 'stunning',
  'however', 'therefore', 'nevertheless', 'furthermore',
  'first', 'second', 'third', 'finally', 'lastly',
  'must', 'should', 'cannot', "can't", "won't", "don't",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// PUNCTUATION TIMING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Punctuation pause multipliers (additive, applied after word duration).
 * 
 * Based on natural reading pause durations:
 * - Period: ~250-300ms pause in natural speech
 * - Comma: ~100-150ms pause
 * - Semicolon: ~200ms pause (stronger than comma, weaker than period)
 */
const PUNCTUATION_PAUSES: Record<string, number> = {
  // Sentence terminators (full stop)
  '.': 1.4,
  '?': 1.5,  // Questions deserve slightly more (processing time)
  '!': 1.3,  // Exclamations flow slightly faster (energy)
  
  // Clause separators (half stop)
  ';': 0.9,
  ':': 0.8,
  
  // Soft pauses
  ',': 0.35,
  
  // Dashes and parentheticals
  '\u2014': 0.6,  // Em-dash (dramatic pause)
  '\u2013': 0.4,  // En-dash
  '-': 0.1,  // Hyphen (compound words, minimal pause)
  
  // Quotation handling
  '"': 0.25, // Opening/closing quotes
  "'": 0.15, // Apostrophes/single quotes
  '\u201C': 0.25, // Smart quotes (left double)
  '\u201D': 0.25, // Smart quotes (right double)
  '\u2018': 0.15, // Smart single left
  '\u2019': 0.15, // Smart single right
  '\u00AB': 0.25, // Guillemets left
  '\u00BB': 0.25, // Guillemets right
  
  // Parenthetical asides
  '(': 0.2,
  ')': 0.3,
  '[': 0.2,
  ']': 0.3,
  
  // Ellipsis (dramatic pause / trailing off)
  '\u2026': 1.8,  // Single ellipsis character
  '...': 1.8,
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAMMAR-AWARE DURATION CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface GrammarContext {
  prevWord?: string;
  prevPunctuation?: string;
  nextWord?: string;
  isDialogue: boolean;
  sentencePosition: number;  // 0 = start, increasing as we progress
  clauseDepth: number;       // Nested clause tracking
}

/**
 * Calculate intelligent duration multiplier for a word.
 * 
 * Returns a multiplier where 1.0 = base WPM timing.
 * Values < 1.0 mean faster, > 1.0 mean slower.
 */
export function calculateGrammarDuration(
  word: string,
  punctuation: string | undefined,
  context: GrammarContext,
  wpm: number = 200
): number {
  const lowerWord = word.toLowerCase();
  let duration = 1.0;
  
  // WPM-adaptive pause scale (slower WPM -> relatively larger pauses)
  const pauseScale = Math.max(0.75, Math.min(1.6, 1 + (200 - Math.max(50, Math.min(1200, wpm))) / 600));

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 1: Base Word Complexity
  // ─────────────────────────────────────────────────────────────────────────────
  
  const len = word.length;
  
  // Character count affects recognition time (logarithmic, not linear)
  // Words over 8 chars need more time; under 4 can be faster
  if (len >= 14) {
    duration *= 1.35;
  } else if (len >= 9) {
    duration *= 1.18;
  } else if (len <= 2) {
    duration *= 0.72;
  } else if (len <= 4) {
    duration *= 0.88;
  }

  // Gentle content-word boost (helps important nouns/verbs breathe)
  if (len >= 8 && !FUNCTION_WORDS.has(lowerWord)) {
    duration *= 1 + Math.min(0.25, (len - 7) * 0.03);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 2: Word Category
  // ─────────────────────────────────────────────────────────────────────────────
  
  if (FUNCTION_WORDS.has(lowerWord)) {
    // Function words are grammatical glue - speed through them
    duration *= 0.78;
  }
  
  if (EMPHASIS_WORDS.has(lowerWord)) {
    // Emphasis words deserve attention
    duration *= 1.25;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 3: Clause & Sentence Structure
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Sentence-initial words need a moment (topic establishment)
  if (context.sentencePosition === 0) {
    duration *= 1.18;
  }
  
  // Clause starters create natural break points
  if (CLAUSE_STARTERS.has(lowerWord)) {
    duration *= 1.12;
  }
  
  // After a coordinating conjunction following punctuation = new clause
  // Example: "..., and" or "...; but"
  if (context.prevPunctuation && COORD_CONJUNCTIONS.has(lowerWord)) {
    duration *= 1.06;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 4: Punctuation Pauses
  // ─────────────────────────────────────────────────────────────────────────────
  
  if (punctuation) {
    // Sum pauses for all punctuation characters
    let punctPause = 0;
    for (const char of punctuation) {
      punctPause += (PUNCTUATION_PAUSES[char] ?? 0) * pauseScale;
    }
    
    // Ellipsis detection (sequence of dots)
    if (punctuation.includes('...') || punctuation.includes('\u2026')) {
      punctPause = Math.max(punctPause, 3.0 * pauseScale);
    }
    
    // Cap the maximum punctuation pause to prevent excessive delays
    punctPause = Math.min(punctPause, 4.0);
    
    duration += punctPause;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 5: Dialogue Awareness
  // ─────────────────────────────────────────────────────────────────────────────
  
  if (context.isDialogue) {
    // Dialogue often flows more naturally/quickly (conversational pacing)
    duration *= 0.94;
    
    // But dialogue tags need a slight pause for attribution
    if (lowerWord === 'said' || lowerWord === 'asked' || lowerWord === 'replied' ||
        lowerWord === 'whispered' || lowerWord === 'shouted' || lowerWord === 'muttered') {
      duration *= 1.12;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 6: Special Patterns
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Numbers need more processing time
  if (/\d/.test(word)) {
    duration *= 1.35;
  }
  
  // ALL CAPS words (shouting/emphasis in text)
  if (word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word)) {
    duration *= 1.2;
  }
  
  // Hyphenated compounds are visually complex
  if (word.includes('-') && word.length > 5) {
    duration *= 1.12;
  }
  
  // Contractions are familiar and quick
  if (word.includes("'") && len < 8) {
    duration *= 0.88;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // FINAL: Clamp to reasonable bounds
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Minimum 0.45x (never too fast to read)
  // Maximum 6.0x (allow longer breathing pauses for sentences/paragraphs)
  return Math.max(0.45, Math.min(6.0, duration));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIALOGUE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Track whether we're inside quoted dialogue.
 * Handles nested quotes and various quote styles.
 */
export class DialogueTracker {
  private quoteStack: string[] = [];
  private readonly OPEN_QUOTES = new Set(['"', '\u201C', '\u2018', '\u00AB', '\u2039']);
  private readonly CLOSE_QUOTES: Record<string, string> = {
    '"': '"',
    '\u201C': '\u201D',
    '\u2018': '\u2019',
    '\u00AB': '\u00BB',
    '\u2039': '\u203A',
  };
  
  /**
   * Process punctuation and update dialogue state.
   * Returns true if we're currently inside dialogue.
   */
  update(punctuation: string | undefined): boolean {
    if (!punctuation) return this.quoteStack.length > 0;
    
    for (const char of punctuation) {
      if (this.OPEN_QUOTES.has(char)) {
        this.quoteStack.push(char);
      } else if (Object.values(this.CLOSE_QUOTES).includes(char)) {
        // Find matching open quote
        for (let i = this.quoteStack.length - 1; i >= 0; i--) {
          if (this.CLOSE_QUOTES[this.quoteStack[i]] === char) {
            this.quoteStack.splice(i, 1);
            break;
          }
        }
      }
      // Handle ambiguous straight quotes
      else if (char === '"' || char === "'") {
        // Simple toggle for straight quotes
        const lastQuote = this.quoteStack[this.quoteStack.length - 1];
        if (lastQuote === char) {
          this.quoteStack.pop();
        } else {
          this.quoteStack.push(char);
        }
      }
    }
    
    return this.quoteStack.length > 0;
  }
  
  reset() {
    this.quoteStack = [];
  }
  
  get isInDialogue(): boolean {
    return this.quoteStack.length > 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTENCE POSITION TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const SENTENCE_ENDERS = new Set(['.', '?', '!', '\u2026']);

export class SentenceTracker {
  private position = 0;
  
  /**
   * Get current position and advance.
   * Returns 0 for sentence-initial words.
   */
  advance(punctuation: string | undefined): number {
    const currentPosition = this.position;
    this.position++;
    
    // Check if this word ends a sentence
    if (punctuation) {
      for (const char of punctuation) {
        if (SENTENCE_ENDERS.has(char)) {
          this.position = 0; // Next word is sentence-initial
          break;
        }
      }
    }
    
    return currentPosition;
  }
  
  reset() {
    this.position = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create duration multipliers for a full token stream.
 * This is the main entry point for the grammar engine.
 */
export function processTokensWithGrammar(
  tokens: Array<{ word: string; punctuation?: string }>,
  wpm: number = 200
): number[] {
  const dialogueTracker = new DialogueTracker();
  const sentenceTracker = new SentenceTracker();
  const durations: number[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prevToken = tokens[i - 1];
    const nextToken = tokens[i + 1];
    
    const isDialogue = dialogueTracker.update(token.punctuation);
    const sentencePosition = sentenceTracker.advance(token.punctuation);
    
    const context: GrammarContext = {
      prevWord: prevToken?.word,
      prevPunctuation: prevToken?.punctuation,
      nextWord: nextToken?.word,
      isDialogue,
      sentencePosition,
      clauseDepth: 0, // TODO: Full clause parsing
    };
    
    const duration = calculateGrammarDuration(
      token.word,
      token.punctuation,
      context,
      wpm
    );
    
    durations.push(duration);
  }
  
  return durations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERIALIZABLE WORKER CODE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the enhanced worker code with grammar awareness.
 * This replaces the existing WORKER_CODE in rsvpProcessor.ts
 */
export const GRAMMAR_AWARE_WORKER_CODE = `
self.onmessage = function(e) {
    const { text, startingIndex, wpm = 200 } = e.data;
    const pauseScale = Math.max(0.75, Math.min(1.6, 1 + (200 - Math.max(50, Math.min(1200, wpm))) / 600));
    const tokens = [];
    let currentTokenIndex = startingIndex;
    
    // ═════════════════════════════════════════════════════════════════════════
    // WORD SETS (Inlined for worker)
    // ═════════════════════════════════════════════════════════════════════════
    
    const FUNCTION_WORDS = new Set([
      'a', 'an', 'the', 'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
      'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
      'it', 'its', 'they', 'them', 'their', 'theirs', 'this', 'that', 'these', 'those',
      'who', 'whom', 'whose', 'which', 'what', 'at', 'by', 'for', 'from', 'in', 'of',
      'on', 'to', 'with', 'about', 'after', 'before', 'between', 'into', 'through',
      'during', 'above', 'below', 'under', 'over', 'behind', 'beside', 'beyond',
      'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
      'must', 'can', 'could', 'and', 'or', 'but', 'nor', 'so', 'yet', 'as', 'if',
      'then', 'than', 'when', 'while', 'where', 'there', 'here', 'not', "n't", 'no',
      'yes', 'very', 'just', 'only', 'also', 'even', 'still', 'too'
    ]);
    
    const CLAUSE_STARTERS = new Set([
      'although', 'because', 'before', 'after', 'unless', 'until', 'while',
      'whereas', 'whenever', 'wherever', 'whether', 'though', 'since',
      'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
      'meanwhile', 'otherwise', 'consequently', 'accordingly'
    ]);
    
    const EMPHASIS_WORDS = new Set([
      'never', 'always', 'absolutely', 'definitely', 'certainly', 'surely',
      'suddenly', 'finally', 'immediately', 'instantly', 'important', 'critical',
      'crucial', 'essential', 'significant', 'amazing', 'incredible', 'extraordinary',
      'remarkable', 'astonishing', 'terrible', 'horrible', 'devastating',
      'catastrophic', 'beautiful', 'gorgeous', 'magnificent', 'stunning',
      'first', 'second', 'third', 'lastly'
    ]);
    
    const PUNCT_PAUSES = {
      '.': 2.2, '?': 2.3, '!': 2.0, ';': 1.2, ':': 1.0, ',': 0.65,
      '\\u2014': 1.1, '\\u2013': 0.7, '-': 0.12, '"': 0.45, "'": 0.25, '\\u201C': 0.45,
      '\\u201D': 0.45, '\\u2018': 0.25, '\\u2019': 0.25, '(': 0.35, ')': 0.5, '\\u2026': 3.0,
      '...': 3.0
    };
    
    // ═════════════════════════════════════════════════════════════════════════
    // STATE TRACKING
    // ═════════════════════════════════════════════════════════════════════════
    
    let sentencePosition = 0;
    let quoteDepth = 0;
    let prevPunctuation = '';
    
    // ═════════════════════════════════════════════════════════════════════════
    // DURATION CALCULATOR (Inlined)
    // ═════════════════════════════════════════════════════════════════════════
    
    function calcDuration(word, punct, prevPunct, sentPos, isDialogue) {
        const lowerWord = word.toLowerCase();
        const len = word.length;
        let dur = 1.0;
        
        // Syllable estimate for robustness
        const syllables = estimateSyllables(word);
        if (syllables <= 1) dur *= 0.82;
        else if (syllables === 2) dur *= 1.0;
        else if (syllables >= 3) dur *= (1.0 + (syllables - 2) * 0.22);
        
        // Function vs content words
        if (FUNCTION_WORDS.has(lowerWord)) dur *= 0.8;
        else if (len >= 8) dur *= 1 + Math.min(0.25, (len - 7) * 0.03);
        if (EMPHASIS_WORDS.has(lowerWord)) dur *= 1.2;
        if (sentPos === 0) dur *= 1.12;
        if (CLAUSE_STARTERS.has(lowerWord)) dur *= 1.08;
        
        // Punctuation (now WPM-adaptive via pauseScale)
        if (punct) {
            let pPause = 0;
            for (let c of punct) {
                pPause += (PUNCT_PAUSES[c] || 0) * pauseScale;
            }
            if (punct.includes('...') || punct.includes('\u2026')) pPause = Math.max(pPause, 3.0 * pauseScale);
            dur += Math.min(pPause, 4.0);
        }
        
        // Dialogue
        if (isDialogue) dur *= 0.93;
        
        // Special patterns
        if (/\d/.test(word)) dur *= 1.3;
        if (word === word.toUpperCase() && len > 1 && /[A-Z]/.test(word)) dur *= 1.15;
        if (word.includes('-') && len > 5) dur *= 1.08;
        if (word.includes("'") && len < 8) dur *= 0.88;
        
        // Clamp (allow longer breathing pauses)
        return Math.max(0.45, Math.min(6.0, dur));
    }
    
    // Syllable counter using proven linguistics algorithm
    // Accuracy ~82% on English text (good enough for timing)
    function estimateSyllables(word) {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!word) return 1;
        if (word.length <= 3) return 1;
        
        let count = 0;
        let prevWasVowel = false;
        const vowels = 'aeiouy';
        
        for (let i = 0; i < word.length; i++) {
            const isVowel = vowels.includes(word[i]);
            if (isVowel && !prevWasVowel) {
                count++;
            }
            prevWasVowel = isVowel;
        }
        
        // Adjustments for silent 'e' and other patterns
        if (word.endsWith('e')) count--;
        if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++;
        if (count === 0) count = 1;
        
        return Math.max(1, count);
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // PROCESSING LOOP
    // ═════════════════════════════════════════════════════════════════════════
    
    const CHUNK_SIZE = 400;
    let match;
    const regex = /([^\\s]+)(\\s*)/g;
    const punctuationRegex = /^(.+?)([.,;:!?"')\\]}\\u201C\\u201D\\u2018\\u2019\\u00BB\\u203A\\u2026\\u2014\\u2013-]+)?$/;
    const sentenceEndRegex = /[.?!\\u2026]/;
    const quoteChars = new Set(['"', '\\u201C', '\\u201D', '\\u2018', '\\u2019', "'", '\\u00AB', '\\u00BB']);
    
    function calculateORP(len) {
        if (len <= 1) return 0;
        if (len >= 2 && len <= 5) return 1;
        if (len >= 6 && len <= 10) return 2;
        return 3;
    }
    
    function processChunk() {
        let count = 0;
        
        while (count < CHUNK_SIZE) {
            match = regex.exec(text);
            if (!match) break;
            
            const fullChunk = match[1];
            const trailingSpace = match[2];
            const matchIndex = match.index;
            
            const separationMatch = fullChunk.match(punctuationRegex);
            let wordContent = fullChunk;
            let punctuationStr = "";
            
            if (separationMatch) {
                wordContent = separationMatch[1];
                punctuationStr = separationMatch[2] || "";
            }
            
            const len = wordContent.length;
            const orpIndex = (len <= 10) ? calculateORP(len) : 3;
            const leftSegment = wordContent.slice(0, orpIndex);
            const centerCharacter = wordContent[orpIndex] || "";
            const rightSegment = wordContent.slice(orpIndex + 1);
            
            // Update quote depth for dialogue tracking
            let isDialogue = quoteDepth > 0;
            for (let c of fullChunk) {
                if (c === '"' || c === '\\u201C' || c === '\\u00AB') quoteDepth++;
                else if (c === '"' || c === '\\u201D' || c === '\\u00BB') quoteDepth = Math.max(0, quoteDepth - 1);
            }
            
            // Calculate grammar-aware duration
            const duration = calcDuration(
                wordContent, 
                punctuationStr, 
                prevPunctuation,
                sentencePosition,
                isDialogue
            );
            
            // Track sentence position
            const isSentenceEnd = sentenceEndRegex.test(punctuationStr);
            if (isSentenceEnd) {
                sentencePosition = 0;
            } else {
                sentencePosition++;
            }
            prevPunctuation = punctuationStr;
            
            const isParagraphEnd = trailingSpace.indexOf('\\n') !== -1;
            
            // Add paragraph pause (scaled by WPM-aware pauseScale)
            let finalDuration = duration;
            if (isParagraphEnd) finalDuration += 2.4 * pauseScale;
            
            tokens.push({
                id: 't-' + currentTokenIndex,
                originalText: fullChunk,
                leftSegment,
                centerCharacter,
                rightSegment,
                punctuation: punctuationStr || undefined,
                durationMultiplier: finalDuration,
                isSentenceEnd,
                isParagraphEnd,
                globalIndex: currentTokenIndex,
                startOffset: matchIndex
            });

            // Insert a short explicit silent 'breath' after sentence-ending punctuation
            if (isSentenceEnd) {
                tokens.push({
                    id: 't-' + (currentTokenIndex + 1),
                    originalText: '\u200B',
                    leftSegment: '',
                    centerCharacter: '\u200B',
                    rightSegment: '',
                    punctuation: undefined,
                    durationMultiplier: 1.2 * pauseScale,
                    isSentenceEnd: false,
                    isParagraphEnd: false,
                    globalIndex: currentTokenIndex + 1,
                    startOffset: matchIndex + fullChunk.length
                });
                currentTokenIndex++;
            }
            
            currentTokenIndex++;
            count++;
        }
        
        if (!match) {
            self.postMessage(tokens);
        } else {
            setTimeout(processChunk, 0);
        }
    }
    
    processChunk();
};
`;
