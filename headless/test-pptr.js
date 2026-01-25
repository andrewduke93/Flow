const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    console.log('launched');
    console.log('browser version:', await browser.version());
    await browser.close();
  } catch (e) {
    console.error('launch error:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
