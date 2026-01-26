const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// Provide browser-like globals for Reedy scripts
global.window = global;
global.self = global;

async function loadReedy() {
  const base = path.resolve(__dirname, '../public/packages/reedy-core/js/content');
  const files = ['content.js','Parser.js','Sequencer.js','Reader.js','View.js','ContentSelector.js'];
  for (const f of files) {
    const p = path.join(base, f);
    if (!fs.existsSync(p)) throw new Error('Missing reedy file: ' + p);
    const code = fs.readFileSync(p, 'utf8');
    // Evaluate in global context
    (0, eval)(code);
  }
  if (!global.reedy) throw new Error('reedy not found after eval');
}

function computeDurationFromToken(token, wpm) {
  const baseMs = Math.round(60000 / Math.max(1, wpm));
  let duration = baseMs;
  try {
    if (typeof token.getComplexity === 'function') {
      const complexity = token.getComplexity();
      duration = Math.round(baseMs * Math.max(0.7, Math.min(3, complexity)));
    } else {
      const txt = (token.toString && token.toString()) || String(token);
      duration = Math.round(baseMs * Math.min(2, 1 + Math.max(0, txt.length - 6) * 0.08));
    }
  } catch (e) {
    // fallback
  }
  return duration;
}

(async () => {
  try {
    await loadReedy();
    parentPort.postMessage({ type: 'reedy-loaded' });
  } catch (e) {
    parentPort.postMessage({ type: 'reedy-load-error', message: String(e) });
    return;
  }

  // Keep worker alive to accept messages from the parent thread
  setInterval(() => {}, 1000);

  parentPort.on('message', (msg) => {
    if (!msg || msg.type !== 'prepare') return;
    const { content = '', wpm = 300 } = msg;
    try {
      const parser = (global.reedy && (global.reedy.simpleParser || global.reedy.parse1 || global.reedy.parse3));
      if (!parser) throw new Error('no parser');
      const parsed = parser(content || '');
      const tokens = (parsed || []).map((t, i) => ({ index: i, text: (t.toString && t.toString()) || String(t), duration: computeDurationFromToken(t, wpm) }));
      parentPort.postMessage({ type: 'prepared', tokens });
    } catch (e) {
      parentPort.postMessage({ type: 'error', message: String(e) });
    }
  });
})();
