import { describe, it, expect } from 'vitest';
import { newRsvpEngine } from '../services/newRsvpEngine';

describe('newRsvpEngine integration', () => {
  it('prepare resolves and exposes raw tokens (main-thread fallback)', async () => {
    const sample = 'Hello world. This is a quick integration test.';
    await newRsvpEngine.prepare(sample, 300, 1);
    const raw = newRsvpEngine.getTokensRaw();
    expect(raw.length).toBeGreaterThan(0);
    expect(raw[0].text.toLowerCase()).toContain('hello');
  });

  it('subscribe emits initial state and updates', async () => {
    let called = false;
    const unsub = newRsvpEngine.subscribe((s) => {
      if (typeof s.index === 'number') called = true;
    });
    // subscribe should synchronously call back with current state
    expect(called).toBe(true);
    unsub();
  });
});
