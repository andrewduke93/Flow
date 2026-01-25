const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-chromium');

(async () => {
  const outDir = path.resolve(__dirname, 'headless-output');
  fs.mkdirSync(outDir, { recursive: true });
  const url = 'https://andrewduke93.github.io/Flow/';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMsgs = [];
  page.on('console', msg => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));

  const network = [];
  page.on('request', req => network.push({ id: network.length, type: 'request', url: req.url(), method: req.method(), resourceType: req.resourceType() }));
  page.on('response', async res => network.push({ id: network.length, type: 'response', url: res.url(), status: res.status(), headers: res.headers() }));

  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle' , timeout: 60000});
    console.log('initial status', resp && resp.status());
    await page.waitForTimeout(1500);

    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'page.html'), html);
    await page.screenshot({ path: path.join(outDir, 'screenshot.png'), fullPage: true });

    // service worker registrations
    let swRegs = [];
    try {
      swRegs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.map(x => ({ scope: x.scope }))).catch(() => []));
    } catch (e) { swRegs = ['error']; }

    fs.writeFileSync(path.join(outDir, 'console.json'), JSON.stringify({ consoleMsgs, pageErrors }, null, 2));
    fs.writeFileSync(path.join(outDir, 'network.json'), JSON.stringify(network, null, 2));
    fs.writeFileSync(path.join(outDir, 'serviceWorkers.json'), JSON.stringify(swRegs, null, 2));

    console.log('Saved outputs to', outDir);
  } catch (err) {
    console.error('Error during capture:', err);
    fs.writeFileSync(path.join(outDir, 'error.txt'), String(err));
  } finally {
    await browser.close();
  }
})();
