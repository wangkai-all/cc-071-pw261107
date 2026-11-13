/**
 * Renders the running app with headless Chromium and writes screenshots.
 * Usage: node scripts/screenshot.mjs <url> <outPrefix> [width] [height]
 */
import { chromium } from '/workspace/.tooling/node_modules/playwright-core/index.mjs';

const [url, out, width = '1440', height = '1000'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: '/workspace/.tooling/chrome/chrome-linux64/chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
// Full-page capture at a tall viewport so sticky headers/overlays stay put.
await page.setViewportSize({ width: Number(width), height: Number(height) });
await page.screenshot({ path: `${out}.png`, fullPage: true });
console.log('errors:', errors.length ? errors : 'none');
console.log('title:', await page.title());
await browser.close();
