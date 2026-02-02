/**
 * TextFormatter - Intelligent Text Enhancement
 * 
 * Automatically detects and formats:
 * - Tables of Contents (with navigation hints)
 * - Chapter headings
 * - Scene breaks (*** or ---)
 * - Dialogue blocks (indentation + attribution)
 * - Letters/notes (different styling)
 * - Poetry/verse (preserved line breaks)
 * - Lists (numbered and bulleted)
 * - Block quotes
 * 
 * Philosophy: Enhance readability without altering content meaning.
 */

import type { CSSProperties } from 'react';

export interface FormattedBlock {
  type: BlockType;
  content: string;
  metadata?: BlockMetadata;
}

export type BlockType = 
  | 'paragraph'
  | 'chapter-heading'
  | 'scene-break'
  | 'dialogue'
  | 'dialogue-attribution'
  | 'toc-entry'
  | 'letter'
  | 'poetry'
  | 'blockquote'
  | 'list-item'
  | 'first-paragraph' // Drop cap candidate
  | 'epigraph';

export interface BlockMetadata {
  speaker?: string;        // For dialogue
  chapterNumber?: number;  // For headings
  indentLevel?: number;    // For nested content
  isFirstInChapter?: boolean;
  listStyle?: 'bullet' | 'number' | 'letter';
  listIndex?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

// Chapter heading patterns
const CHAPTER_PATTERNS = [
  /^chapter\s+(\d+|[ivxlc]+)\s*[:\-–—]?\s*(.*)$/i,
  /^(part|book|section|prologue|epilogue|interlude)\s*(\d*|[ivxlc]*)\s*[:\-–—]?\s*(.*)$/i,
  /^(\d+|[IVXLC]+)\.\s+(.+)$/,
  /^[★✦✧◆◇●○]\s+(.+)$/,  // Decorative chapter markers
];

// Scene break patterns
const SCENE_BREAK_PATTERNS = [
  /^[\*\#\-–—]{3,}$/,
  /^[●○◆◇★✦✧]{1,5}$/,
  /^~{3,}$/,
  /^\s*\*\s*\*\s*\*\s*$/,
];

// Table of Contents patterns
const TOC_PATTERNS = [
  /^(table of contents|contents|index)$/i,
  /^.{1,50}\s*\.{2,}\s*\d+$/,  // "Chapter One ... 1"
  /^.{1,50}\s+\d+$/,           // "Chapter One   1"
];

// Dialogue patterns
const DIALOGUE_START = /^[""\u201C\u00AB\u2039]/;
const DIALOGUE_END = /[""\u201D\u00BB\u203A][,.]?\s*$/;
const DIALOGUE_ATTRIBUTION = /^.{0,10}(said|asked|replied|whispered|shouted|murmured|exclaimed|cried|muttered|answered|continued|added|began|interrupted|called|demanded|insisted|suggested|warned|promised|admitted|agreed|announced|argued|begged|claimed|complained|confessed|declared|denied|doubted|explained|gasped|groaned|growled|grumbled|guessed|hinted|hissed|howled|huffed|hummed|inquired|joked|laughed|lied|mentioned|moaned|mumbled|mused|noted|observed|offered|ordered|pleaded|pointed out|prayed|pressed|proclaimed|proposed|protested|questioned|reasoned|recalled|remarked|reminded|repeated|reported|requested|responded|revealed|roared|sang|scolded|screamed|sighed|smiled|snapped|sneered|sobbed|spoke|stammered|stated|stormed|stuttered|swore|teased|threatened|told|urged|uttered|volunteered|vowed|wailed|warned|wept|wondered|yelled)\b/i;

// Letter/note patterns
const LETTER_PATTERNS = [
  /^dear\s+.+[,:]/i,
  /^to\s+(whom|my|the)/i,
  /^(sincerely|regards|yours|best|love|cheers|respectfully|warmly),?$/i,
];

// Poetry/verse detection (short lines with potential rhyme)
const POETRY_LINE_LENGTH = 60;

// Block quote patterns
const BLOCKQUOTE_PATTERNS = [
  /^\s{4,}.+/, // Indented text
  /^>\s+/,     // Markdown style
];

// List patterns
const LIST_PATTERNS = {
  bullet: /^[\•\-\*\◦\▪]\s+/,
  number: /^(\d+)[.)]\s+/,
  letter: /^([a-z])[.)]\s+/i,
};

// Epigraph patterns (usually short, often attributed)
const EPIGRAPH_PATTERNS = [
  /^[""\u201C].{10,200}[""\u201D]\s*—/,  // Quote with attribution
  /^[""\u201C].{10,200}[""\u201D]$/,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FORMATTER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class TextFormatter {
  
  /**
   * Process raw text into formatted blocks with semantic types
   */
  static formatText(rawText: string): FormattedBlock[] {
    const blocks: FormattedBlock[] = [];
    const paragraphs = this.splitIntoParagraphs(rawText);
    
    let isInTOC = false;
    let tocEndIndex = -1;
    let prevType: BlockType = 'paragraph';
    let isFirstAfterHeading = false;
    let dialogueContext = { inDialogue: false, speaker: '' };
    let consecutiveShortLines = 0;
    
    // First pass: detect TOC region
    for (let i = 0; i < Math.min(paragraphs.length, 50); i++) {
      const p = paragraphs[i].trim();
      if (TOC_PATTERNS[0].test(p)) {
        isInTOC = true;
        continue;
      }
      if (isInTOC) {
        // Look for end of TOC (usually a chapter heading or significant gap)
        if (CHAPTER_PATTERNS.some(pat => pat.test(p)) && i > 5) {
          tocEndIndex = i;
          break;
        }
      }
    }
    
    // Reset for main pass
    isInTOC = false;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const trimmed = para.trim();
      
      if (!trimmed) continue;
      
      // Skip or mark TOC entries
      if (i < tocEndIndex) {
        if (TOC_PATTERNS[0].test(trimmed)) {
          isInTOC = true;
          blocks.push({ type: 'chapter-heading', content: trimmed });
          continue;
        }
        if (isInTOC && (TOC_PATTERNS[1].test(trimmed) || TOC_PATTERNS[2].test(trimmed))) {
          blocks.push({ 
            type: 'toc-entry', 
            content: trimmed,
            metadata: { indentLevel: this.detectIndent(para) }
          });
          continue;
        }
      }
      isInTOC = false;
      
      // Scene breaks
      if (SCENE_BREAK_PATTERNS.some(pat => pat.test(trimmed))) {
        blocks.push({ type: 'scene-break', content: '* * *' });
        isFirstAfterHeading = true;
        consecutiveShortLines = 0;
        continue;
      }
      
      // Chapter headings
      const chapterMatch = this.matchChapterHeading(trimmed);
      if (chapterMatch) {
        blocks.push({ 
          type: 'chapter-heading', 
          content: trimmed,
          metadata: { chapterNumber: chapterMatch.number }
        });
        prevType = 'chapter-heading';
        isFirstAfterHeading = true;
        consecutiveShortLines = 0;
        continue;
      }
      
      // Epigraphs (usually after chapter heading, before first paragraph)
      if (isFirstAfterHeading && EPIGRAPH_PATTERNS.some(pat => pat.test(trimmed))) {
        blocks.push({ type: 'epigraph', content: trimmed });
        continue;
      }
      
      // Letters
      if (LETTER_PATTERNS.some(pat => pat.test(trimmed))) {
        blocks.push({ type: 'letter', content: trimmed });
        prevType = 'letter';
        isFirstAfterHeading = false;
        continue;
      }
      
      // Lists
      const listMatch = this.matchList(trimmed);
      if (listMatch) {
        blocks.push({
          type: 'list-item',
          content: listMatch.content,
          metadata: { listStyle: listMatch.style, listIndex: listMatch.index }
        });
        prevType = 'list-item';
        continue;
      }
      
      // Block quotes (indented)
      if (BLOCKQUOTE_PATTERNS.some(pat => pat.test(para))) {
        blocks.push({ 
          type: 'blockquote', 
          content: trimmed.replace(/^>\s*/, ''),
          metadata: { indentLevel: this.detectIndent(para) }
        });
        prevType = 'blockquote';
        continue;
      }
      
      // Poetry detection (multiple consecutive short lines)
      if (trimmed.length < POETRY_LINE_LENGTH && !trimmed.endsWith('.')) {
        consecutiveShortLines++;
      } else {
        consecutiveShortLines = 0;
      }
      
      if (consecutiveShortLines >= 3) {
        // Retroactively mark previous lines as poetry
        for (let j = blocks.length - 1; j >= 0 && j >= blocks.length - consecutiveShortLines; j--) {
          if (blocks[j].type === 'paragraph') {
            blocks[j].type = 'poetry';
          }
        }
        blocks.push({ type: 'poetry', content: trimmed });
        prevType = 'poetry';
        continue;
      }
      
      // Dialogue detection
      const dialogueResult = this.detectDialogue(trimmed, dialogueContext);
      if (dialogueResult.isDialogue) {
        dialogueContext = dialogueResult.context;
        
        if (dialogueResult.isAttribution) {
          blocks.push({ 
            type: 'dialogue-attribution', 
            content: trimmed,
            metadata: { speaker: dialogueResult.speaker }
          });
        } else {
          blocks.push({ 
            type: 'dialogue', 
            content: trimmed,
            metadata: { speaker: dialogueContext.speaker }
          });
        }
        prevType = 'dialogue';
        isFirstAfterHeading = false;
        continue;
      }
      
      // First paragraph after heading (drop cap candidate)
      if (isFirstAfterHeading && prevType === 'chapter-heading') {
        blocks.push({ 
          type: 'first-paragraph', 
          content: trimmed,
          metadata: { isFirstInChapter: true }
        });
        prevType = 'first-paragraph';
        isFirstAfterHeading = false;
        continue;
      }
      
      // Regular paragraph
      blocks.push({ type: 'paragraph', content: trimmed });
      prevType = 'paragraph';
      isFirstAfterHeading = false;
    }
    
    return blocks;
  }
  
  /**
   * Split text into paragraphs while preserving intentional line breaks
   */
  private static splitIntoParagraphs(text: string): string[] {
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split on double newlines (paragraph breaks)
    // But preserve single newlines within potential poetry/verse
    return normalized.split(/\n\n+/);
  }
  
  /**
   * Detect indentation level
   */
  private static detectIndent(text: string): number {
    const match = text.match(/^(\s*)/);
    if (!match) return 0;
    return Math.floor(match[1].length / 2);
  }
  
  /**
   * Match chapter heading patterns
   */
  private static matchChapterHeading(text: string): { number?: number } | null {
    for (const pattern of CHAPTER_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // Try to extract chapter number
        let num: number | undefined;
        const numStr = match[1];
        if (/^\d+$/.test(numStr)) {
          num = parseInt(numStr);
        } else if (/^[ivxlc]+$/i.test(numStr)) {
          num = this.romanToInt(numStr);
        }
        return { number: num };
      }
    }
    
    // Also detect ALL CAPS short lines as potential headings
    if (text === text.toUpperCase() && text.length < 50 && text.length > 2 && /[A-Z]/.test(text)) {
      return {};
    }
    
    return null;
  }
  
  /**
   * Convert Roman numerals to integer
   */
  private static romanToInt(roman: string): number {
    const values: Record<string, number> = {
      i: 1, v: 5, x: 10, l: 50, c: 100
    };
    let result = 0;
    const lower = roman.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const curr = values[lower[i]] || 0;
      const next = values[lower[i + 1]] || 0;
      if (curr < next) {
        result -= curr;
      } else {
        result += curr;
      }
    }
    return result;
  }
  
  /**
   * Match list patterns
   */
  private static matchList(text: string): { style: 'bullet' | 'number' | 'letter'; content: string; index?: number } | null {
    const bulletMatch = text.match(LIST_PATTERNS.bullet);
    if (bulletMatch) {
      return { style: 'bullet', content: text.replace(LIST_PATTERNS.bullet, '') };
    }
    
    const numberMatch = text.match(LIST_PATTERNS.number);
    if (numberMatch) {
      return { style: 'number', content: text.replace(LIST_PATTERNS.number, ''), index: parseInt(numberMatch[1]) };
    }
    
    const letterMatch = text.match(LIST_PATTERNS.letter);
    if (letterMatch) {
      return { style: 'letter', content: text.replace(LIST_PATTERNS.letter, ''), index: letterMatch[1].toLowerCase().charCodeAt(0) - 96 };
    }
    
    return null;
  }
  
  /**
   * Detect dialogue and track speaker
   */
  private static detectDialogue(
    text: string, 
    context: { inDialogue: boolean; speaker: string }
  ): { 
    isDialogue: boolean; 
    isAttribution: boolean;
    speaker?: string;
    context: { inDialogue: boolean; speaker: string };
  } {
    const startsWithQuote = DIALOGUE_START.test(text);
    const endsWithQuote = DIALOGUE_END.test(text);
    const hasAttribution = DIALOGUE_ATTRIBUTION.test(text);
    
    // Extract speaker from attribution
    let speaker = context.speaker;
    if (hasAttribution) {
      // Try to find name before or after the dialogue verb
      const attrMatch = text.match(/([A-Z][a-z]+)\s+(said|asked|replied)/i) 
        || text.match(/(said|asked|replied)\s+([A-Z][a-z]+)/i);
      if (attrMatch) {
        speaker = attrMatch[1] === attrMatch[1].toLowerCase() ? attrMatch[2] : attrMatch[1];
      }
    }
    
    // Dialogue with attribution on same line
    if (startsWithQuote && hasAttribution) {
      return {
        isDialogue: true,
        isAttribution: true,
        speaker,
        context: { inDialogue: false, speaker }
      };
    }
    
    // Pure dialogue (quote to quote)
    if (startsWithQuote && endsWithQuote) {
      return {
        isDialogue: true,
        isAttribution: false,
        context: { inDialogue: false, speaker }
      };
    }
    
    // Dialogue continues from previous (no opening quote but ends with quote)
    if (context.inDialogue && endsWithQuote) {
      return {
        isDialogue: true,
        isAttribution: false,
        context: { inDialogue: false, speaker: context.speaker }
      };
    }
    
    // Dialogue starts but doesn't end (multi-paragraph dialogue)
    if (startsWithQuote && !endsWithQuote) {
      return {
        isDialogue: true,
        isAttribution: false,
        context: { inDialogue: true, speaker }
      };
    }
    
    return {
      isDialogue: false,
      isAttribution: false,
      context: { inDialogue: false, speaker: '' }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS STYLES FOR BLOCK TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const BLOCK_STYLES: Record<BlockType, CSSProperties> = {
  'paragraph': {},
  
  'chapter-heading': {
    fontSize: '1.5em',
    fontWeight: 600,
    textAlign: 'center',
    marginTop: '2em',
    marginBottom: '1.5em',
    letterSpacing: '0.05em',
  },
  
  'scene-break': {
    textAlign: 'center',
    margin: '2em 0',
    fontSize: '1.2em',
    letterSpacing: '0.5em',
    color: 'inherit',
    opacity: 0.5,
  },
  
  'dialogue': {
    marginLeft: '1em',
    marginBottom: '0.5em',
  },
  
  'dialogue-attribution': {
    marginLeft: '1em',
    marginBottom: '0.75em',
    fontStyle: 'normal',
  },
  
  'toc-entry': {
    display: 'flex',
    justifyContent: 'space-between',
    borderBottom: '1px dotted currentColor',
    opacity: 0.8,
    padding: '0.25em 0',
  },
  
  'letter': {
    fontStyle: 'italic',
    marginLeft: '2em',
    marginRight: '2em',
    padding: '1em',
    borderLeft: '2px solid currentColor',
    opacity: 0.9,
  },
  
  'poetry': {
    fontStyle: 'italic',
    marginLeft: '2em',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.8,
  },
  
  'blockquote': {
    marginLeft: '1.5em',
    paddingLeft: '1em',
    borderLeft: '3px solid currentColor',
    opacity: 0.85,
    fontStyle: 'italic',
  },
  
  'list-item': {
    marginLeft: '1.5em',
    marginBottom: '0.25em',
  },
  
  'first-paragraph': {
    // First letter styling handled separately for drop cap
  },
  
  'epigraph': {
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: '2em',
    opacity: 0.8,
    fontSize: '0.95em',
  },
};
