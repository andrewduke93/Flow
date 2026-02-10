/* eslint-disable no-console */
const puppeteer = require('puppeteer');

// Lightweight smoke test that verifies:
// - reader loads
// - tokens exist with data-idx
// - clicking a token highlights it
// - Start Flow enters RSVP (large word appears)

const URL = process.env.SMOKE_URL || 'https://andrewduke93.github.io/Flow/';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  console.log('Visiting', URL);
  await page.goto(URL, { waitUntil: 'networkidle2' });

  // Open the first book (welcome guide should exist)
  await page.waitForSelector('[data-test-id="book-cell"] , .titan-shelf-item, [data-testid="book-cell"]', { timeout: 15000 }).catch(() => {});

  // If a bookshelf is visible, click the first open button; otherwise, try to click a sample 'Open' control
  const openButtons = await page.$$('button[aria-label="Open"]');
  if (openButtons.length) {
    await openButtons[0].click();
  } else {
    // fallback: click first book cell
    const bookCell = await page.$('[data-test-id="book-cell"]') || await page.$('.titan-shelf-item');
    if (bookCell) await bookCell.click();
  }

  // Wait for reader to render token spans
  await page.waitForSelector('[data-idx]', { timeout: 15000 });
  const tokenCount = await page.$$eval('[data-idx]', els => els.length);
  console.log('Found tokens:', tokenCount);
  if (tokenCount < 5) throw new Error('Insufficient tokens rendered');

  // Click the 3rd token and assert it becomes active
  const third = (await page.$$('[data-idx]'))[2];
  await third.click();
  await page.waitForTimeout(300);
  const isActive = await third.evaluate(el => el.className.includes('bg-gradient-to-r') || el.className.includes('font-bold'));
  if (!isActive) throw new Error('Token click did not produce active highlight');
  console.log('Token click → highlight OK');

  // Click Start Flow and assert RSVP display appears
  const startBtn = await page.$x("//button[contains(., 'Start Flow')]");
  if (!startBtn.length) throw new Error('Start Flow button not found');
  await startBtn[0].click();

  // Wait for large RSVP word to appear
  await page.waitForSelector('.text-4xl, .rsvp-display, .flow-current-word', { timeout: 8000 });
  const largeWord = await page.$eval('.text-4xl, .rsvp-display, .flow-current-word', el => el.textContent.trim());
  console.log('RSVP started, sample word:', largeWord.slice(0, 40));

  await browser.close();
  console.log('SMOKE TEST PASSED');
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(2);
});
