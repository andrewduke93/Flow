/* eslint-disable no-console */
const puppeteer = require('puppeteer');

// Lightweight smoke test that verifies:
// - reader loads
// - tokens exist with data-idx
// - clicking a token highlights it
// - Start Flow enters RSVP (large word appears)

const URL = process.env.SMOKE_URL || 'http://localhost:3000/Flow/';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  console.log('Visiting', URL);
  await page.goto(URL, { waitUntil: 'networkidle2' });

  // Wait for book
  await page.waitForSelector('h3', { timeout: 15000 });
  const books = await page.$$('h3');
  let clicked = false;
  for (const book of books) {
      const text = await book.evaluate(el => el.textContent);
      if (text.includes("welcome to flow")) {
          await book.click();
          clicked = true;
          break;
      }
  }
  if (!clicked) {
    throw new Error('Could not find book');
  }

  // Wait for reader to render token spans
  await page.waitForSelector('[data-idx]', { timeout: 25000 });
  const tokenCount = await page.$$eval('[data-idx]', els => els.length);
  console.log('Found tokens:', tokenCount);
  if (tokenCount < 5) throw new Error('Insufficient tokens rendered');

  // Click the 3rd token and assert it becomes active
  const third = (await page.$$('[data-idx]'))[2];
  await third.click();
  await new Promise(r => setTimeout(r, 300));
  const isActive = await third.evaluate(el => el.className.includes('font-bold'));
  if (!isActive) throw new Error('Token click did not produce active highlight');
  console.log('Token click → highlight OK');

  // Click Start Flow and assert RSVP display appears
  const buttons = await page.$$('button');
  let startBtn = null;
  for (const btn of buttons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text.includes("flow~")) {
          startBtn = btn;
          break;
      }
  }
  if (!startBtn) throw new Error('Start Flow button not found');
  await startBtn.click();

  // Wait for large RSVP word to appear
  // Get text-4xl from RSVPWord.tsx? No, let's just wait for a span with text.
  await new Promise(r => setTimeout(r, 2000));
  const rsvpWordSpan = await page.$eval('span[style*="font-size"]', el => el.textContent.trim());
  console.log('RSVP started, sample word:', rsvpWordSpan.slice(0, 40));

  await browser.close();
  console.log('SMOKE TEST PASSED');
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(2);
});
