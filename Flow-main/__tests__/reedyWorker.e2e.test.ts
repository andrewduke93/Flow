import { test, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
let Worker: any;
try { Worker = require('worker_threads').Worker; } catch (e) { Worker = null; }

function waitForMessage(worker: any, predicate: (m: any) => boolean, timeout = 5000) {
  return new Promise<any>((resolve, reject) => {
    const onmsg = (m: any) => {
      try {
        if (predicate(m)) {
          clearTimeout(t);
          cleanup();
          resolve(m);
        }
      } catch (err) {
        clearTimeout(t);
        cleanup();
        reject(err);
      }
    };
    const onerr = (err: any) => {
      clearTimeout(t);
      cleanup();
      reject(err);
    };
    const onexit = (code: number) => {
      clearTimeout(t);
      cleanup();
      reject(new Error('worker exited with code ' + code));
    };
    const cleanup = () => {
      try { worker.removeListener('message', onmsg); } catch {};
      try { worker.removeListener('error', onerr); } catch {};
      try { worker.removeListener('exit', onexit); } catch {};
    };
    const t = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for message'));
    }, timeout);
    worker.on('message', onmsg);
    worker.once('error', onerr);
    worker.once('exit', onexit);
  });
}

// Run the test only when Node worker_threads are available and the vendored Reedy files exist.
const reedyBase = path.resolve(process.cwd(), 'public/packages/reedy-core/js/content');
const requiredFiles = ['content.js','Parser.js','Sequencer.js','Reader.js','View.js','ContentSelector.js'];
const reedyAvailable = Worker && requiredFiles.every(f => fs.existsSync(path.join(reedyBase, f)));
const runner = reedyAvailable ? test : test.skip;

runner('reedy worker loads and prepares tokens', async () => {
  const workerPath = path.resolve(process.cwd(), 'test-workers/reedyIntegrationWorker.cjs');
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
