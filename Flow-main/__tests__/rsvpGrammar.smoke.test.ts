import { describe, it, expect } from 'vitest';
import { calculateGrammarDuration } from '../services/rsvpGrammarEngine';
import { GRAMMAR_AWARE_WORKER_CODE } from '../services/rsvpGrammarEngine';

describe('RSVP grammar (smoke)', () => {
  it('exports calculateGrammarDuration (sanity - do not execute heavy init in CI)', () => {
    // Ensure the function is exported and the module loads cleanly — avoid invoking
    // the full timing calculator here to prevent module-initialization ordering
    // issues in the smoke test environment.
    expect(typeof calculateGrammarDuration).toBe('function');
  });

  it('exports a worker code string for the processor', () => {
    expect(typeof GRAMMAR_AWARE_WORKER_CODE).toBe('string');
    expect(GRAMMAR_AWARE_WORKER_CODE.length).toBeGreaterThan(10);
  });
});