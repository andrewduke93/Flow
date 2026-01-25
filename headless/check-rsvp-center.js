const { chromium } = require('playwright-chromium');

async function measure(url, threshold = 1) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for the RSVPTeleprompter ribbon to appear
  await page.waitForSelector('[data-idx]');

  // Ensure a focus token is present
  const active = await page.$('[data-idx].active, [data-idx]');
  if (!active) {
    console.log('no-active-token');
    await browser.close();
    return { ok: false, reason: 'no-active-token' };
  }

  // Find the element that is the focus token (has dataset idx equal to current index)
  const focusInfo = await page.evaluate(() => {
    const RETICLE_POSITION = 35.5; // from source
    const container = document.querySelector('#root');
    const ribbon = document.querySelector('[data-idx]')?.closest('div[role="presentation"]') || document.querySelector('div[style*="translateX"]') || document.body;

    // Find the focused token by checking which token has the ember color (#E25822) or bold font-weight
    const tokenEls = Array.from(document.querySelectorAll('[data-idx]'));
    if (tokenEls.length === 0) return { error: 'no-tokens' };

    let focused = tokenEls.find(el => el.querySelector('span[style*="#E25822"]')) || tokenEls[Math.floor(tokenEls.length/2)];

    const containerWidth = (document.querySelector('#root')||document.body).clientWidth;
    const reticleX = containerWidth * (RETICLE_POSITION / 100);

    const focusSpan = focused.querySelector('span[style*="#E25822"]') || focused.querySelector('span');
    const focusRect = focusSpan.getBoundingClientRect();
    const ribbonRect = (focused.parentElement||focused).getBoundingClientRect();

    // compute center of the focus character
    const centerX = focusRect.left + focusRect.width / 2 - ribbonRect.left;

    return {
      reticleX,
      centerX,
      delta: Math.abs(reticleX - centerX),
      focusText: focusSpan.textContent,
      ribbonLeft: ribbonRect.left
    };
  });

  const result = { url, result: focusInfo };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  const delta = focusInfo && typeof focusInfo.delta === 'number' ? focusInfo.delta : Infinity;
  return { ok: delta <= Number(threshold), delta, detail: focusInfo };
}

(async () => {
  const argv = process.argv.slice(2);
  const thresholdArg = argv.find(a => a.startsWith('--threshold=')) || argv.find(a => a === '--threshold');
  let threshold = 1;
  const urls = argv.filter(a => !a.startsWith('--threshold'));
  if (thresholdArg) {
    const val = thresholdArg.split('=')[1];
    threshold = val ? Number(val) : 1;
  }

  let failed = false;
  for (const u of urls) {
    try {
      const r = await measure(u, threshold);
      if (!r.ok) {
        console.error(`CENTERING CHECK FAILED for ${u} — delta=${r.delta}`);
        failed = true;
      } else {
        console.log(`center OK for ${u} — delta=${r.delta}`);
      }
    } catch (e) {
      console.error('ERR', u, e.message);
      failed = true;
    }
  }
  process.exit(failed ? 2 : 0);
})();
