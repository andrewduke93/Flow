import { describe, test, expect, vi } from 'vitest';

// This test ensures the engine's main-thread fallback does not emit stderr-level
// console output (console.error / console.warn) in environments where
// Worker / worker_threads are unavailable — prevents noisy CI logs.

describe('newRsvpEngine fallback logging', () => {
  test('does not call console.error or console.warn when Worker is unavailable', async () => {
    // Ensure a clean module cache so the module will instantiate under our spies
    vi.resetModules();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Simulate an environment without Worker
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const savedWorker = globalThis.Worker;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete globalThis.Worker;

    try {
      // Import the module after spies are in place so constructor runs under test
      const mod = await import('../services/newRsvpEngine');
      const engine = mod.newRsvpEngine;

      // Use the main-thread fallback path
      await engine.prepare('this is a short test', 300);

      // No stderr-level calls
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      // Debug may be used for non-ERR visibility; allow either called or not
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      // restore
      if (typeof savedWorker !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        globalThis.Worker = savedWorker;
      }
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
      vi.resetModules();
    }
  });
});
