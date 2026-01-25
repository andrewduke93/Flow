const puppeteer = require('puppeteer');
(async () => {
  try {
    const exe = '/usr/bin/chromium-browser';
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    console.log('launched with', exe, 'version:', await browser.version());
    await browser.close();
  } catch (e) {
    console.error('launch error:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
