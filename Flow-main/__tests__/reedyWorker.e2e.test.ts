import { test, expect } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';

function waitForMessage(worker: Worker, predicate: (m: any) => boolean, timeout = 5000) {
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => {
      worker.removeAllListeners('message');
      reject(new Error('timeout waiting for message'));
    }, timeout);
    worker.on('message', function onmsg(m) {
      if (predicate(m)) {
        clearTimeout(t);
        worker.removeListener('message', onmsg);
        resolve(m);
      }
    });
  });
}

test('reedy worker loads and prepares tokens', async () => {
  const workerPath = path.resolve(process.cwd(), 'test-workers/reedyIntegrationWorker.js');
  const w = new Worker(workerPath);
  try {
    const loaded = await waitForMessage(w, (m) => m && m.type === 'reedy-loaded', 5000);
    expect(loaded.type).toBe('reedy-loaded');

    const sample = 'This is a short test. It contains sentences, commas, and more.';
    w.postMessage({ type: 'prepare', content: sample, wpm: 300 });

    const prepared = await waitForMessage(w, (m) => m && (m.type === 'prepared' || m.type === 'error'), 5000);
    expect(prepared.type).toBe('prepared');
    expect(Array.isArray(prepared.tokens)).toBe(true);
    expect(prepared.tokens.length).toBeGreaterThan(0);
    const t = prepared.tokens[0];
    expect(t).toHaveProperty('text');
    expect(t).toHaveProperty('duration');
    expect(typeof t.duration).toBe('number');
    expect(t.duration).toBeGreaterThan(0);
  } finally {
    w.terminate();
  }
}, 20000);
