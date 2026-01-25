const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const outDir = path.resolve(__dirname, 'headless-output');
  fs.mkdirSync(outDir, { recursive: true });

  const url = 'https://andrewduke93.github.io/Flow/';
  console.log('Starting headless capture for', url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const consoleMsgs = [];
  page.on('console', msg => {
    try {
      consoleMsgs.push({ type: msg.type(), text: msg.text() });
    } catch (e) {}
  });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));

  const network = [];
  page.on('request', req => {
    network.push({ id: network.length, type: 'request', url: req.url(), method: req.method(), resourceType: req.resourceType(), headers: req.headers() });
  });
  page.on('response', async res => {
    try {
      const r = { url: res.url(), status: res.status(), headers: res.headers() };
      network.push({ id: network.length, type: 'response', ...r });
    } catch (e) {}
  });

  try {
    await page.setDefaultNavigationTimeout(60000);
    const resp = await page.goto(url, { waitUntil: 'networkidle2' });
    console.log('Initial response status:', resp && resp.status());
    await page.waitForTimeout(1500);

    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'page.html'), html);

    await page.screenshot({ path: path.join(outDir, 'screenshot.png'), fullPage: true });

    // try to get service worker registrations
    let swRegs = [];
    try {
      swRegs = await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        return regs.map(r => ({ scope: r.scope }));
      });
    } catch (e) { swRegs = ['error']; }

    fs.writeFileSync(path.join(outDir, 'console.json'), JSON.stringify({ consoleMsgs, pageErrors }, null, 2));
    fs.writeFileSync(path.join(outDir, 'network.json'), JSON.stringify(network, null, 2));
    fs.writeFileSync(path.join(outDir, 'serviceWorkers.json'), JSON.stringify(swRegs, null, 2));

    console.log('Saved outputs to', outDir);
    console.log('Console entries:', consoleMsgs.length, 'Network events:', network.length, 'SW regs:', swRegs.length);
  } catch (err) {
    console.error('Error during capture:', err);
    fs.writeFileSync(path.join(outDir, 'error.txt'), String(err));
  } finally {
    await browser.close();
  }
})();
