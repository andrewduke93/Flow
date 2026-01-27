import { test, expect } from '@playwright/test';

test('vendored Reedy runs in-browser and produces tokens', async ({ page }) => {
  await page.goto('/e2e/reedy-smoke.html');
  await page.waitForSelector('#reedy-ready', { state: 'visible', timeout: 10000 });

  // Ensure the page parsed the sample and rendered results
  const resultText = await page.locator('#reedy-result').innerText();
  const result = JSON.parse(resultText || '{}');

  expect(result.tokens).toBeDefined();
  expect(Array.isArray(result.tokens)).toBe(true);
  expect(result.tokens.length).toBeGreaterThan(0);

  const first = result.tokens[0];
  expect(first).toHaveProperty('text');
  expect(first).toHaveProperty('duration');
  expect(typeof first.duration).toBe('number');

  // Sanity: ensure the simple UI hook is present (demonstrates integration with DOM)
  await expect(page.locator('#reedy-token-count')).toHaveText(String(result.tokens.length));
});
