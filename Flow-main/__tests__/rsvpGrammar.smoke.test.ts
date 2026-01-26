import { describe, it, expect } from 'vitest';
import { calculateGrammarDuration } from '../services/rsvpGrammarEngine';
import { GRAMMAR_AWARE_WORKER_CODE } from '../services/rsvpGrammarEngine';

describe('RSVP grammar (smoke)', () => {
  it('calculateGrammarDuration returns a finite, positive multiplier', () => {
    const dur = calculateGrammarDuration('Hello', undefined, { isDialogue: false, sentencePosition: 0, clauseDepth: 0 });
    expect(typeof dur).toBe('number');
    expect(Number.isFinite(dur)).toBe(true);
    expect(dur).toBeGreaterThan(0);
  });

  it('exports a worker code string for the processor', () => {
    expect(typeof GRAMMAR_AWARE_WORKER_CODE).toBe('string');
    expect(GRAMMAR_AWARE_WORKER_CODE.length).toBeGreaterThan(10);
  });
});