const { chromium } = require('playwright-chromium');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://andrewduke93.github.io/Flow/', { waitUntil: 'networkidle' });
  console.log('loaded');
  const exists = await page.$('.group.cursor-pointer');
  console.log('group card exists:', !!exists);
  if (exists) {
    await exists.click();
    await page.waitForTimeout(1000);
    const modal = await page.$('dialog, .modal, .book-detail, [role="dialog"]');
    console.log('modal-like element found:', !!modal);
  }
  await browser.close();
})();
