const { chromium } = require('playwright-chromium');

// Small smoke probe that measures token-to-token timings and asserts
// punctuation tokens incur a noticeably larger pause than baseline tokens.
// Usage: node check-rsvp-pacing.js <url>

async function measurePacing(url, options = {}) {
  const { minMultiplier = 1.6, samples = 6, timeout = 30000 } = options;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-idx]', { timeout });

  // wait until we observe a few token transitions
  const timings = [];
  let lastActive = null;
  const start = Date.now();

  // helper to read active token text and whether it contains punctuation
  const readActive = async () => {
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-idx].active') || document.querySelector('[data-idx]');
      if (!el) return null;
      const span = el.querySelector('span') || el;
      return { text: (span.textContent || '').trim(), idx: el.getAttribute('data-idx') };
    });
    return info;
  };

  // spin until we collect enough samples or timeout
  while (timings.length < samples && Date.now() - start < timeout) {
    const active = await readActive();
    if (!active) {
      await page.waitForTimeout(50);
      continue;
    }

    if (!lastActive || lastActive.idx !== active.idx) {
      const now = Date.now();
      if (lastActive) {
        timings.push({ prev: lastActive, next: active, dt: (now - lastActive.t) / 1000 });
      }
      lastActive = { ...active, t: now };
    }
    await page.waitForTimeout(20);
  }

  await browser.close();

  if (timings.length < 4) return { ok: false, reason: 'not-enough-transitions', timings };

  // classify transitions where `next.text` contains sentence-ending punctuation
  const punctTransitions = timings.filter(t => /[\.\?!,…]|\.{3}|\u2026/.test(t.next.text));
  const nonPunct = timings.filter(t => !/[\.\?!,…]|\.{3}|\u2026/.test(t.next.text));

  const avg = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
  const baseline = avg(nonPunct.map(t => t.dt));
  const punctAvg = punctTransitions.length ? avg(punctTransitions.map(t => t.dt)) : 0;

  return { ok: punctTransitions.length > 0 && punctAvg >= Math.max(0.15, baseline * minMultiplier),
           baseline, punctAvg, punctCount: punctTransitions.length, samples: timings.length, timings };
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node check-rsvp-pacing.js <url>');
    process.exit(2);
  }
  const url = argv[0];
  try {
    const r = await measurePacing(url, { minMultiplier: 1.5, samples: 8, timeout: 30000 });
    if (!r.ok) {
      console.error('PACING CHECK FAILED', JSON.stringify(r, null, 2));
      process.exit(3);
    }
    console.log('pacing OK', JSON.stringify(r, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.message || e);
    process.exit(4);
  }
})();
