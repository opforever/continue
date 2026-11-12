import { chromium } from '../repo/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => ({
  body: document.body.className,
  grain: getComputedStyle(document.getElementById('grain')).display,
  grainImg: getComputedStyle(document.getElementById('grain')).backgroundImage.slice(0, 40),
  card: getComputedStyle(document.querySelector('.intel-card')).backdropFilter,
  tier: window.breachline.game.quality.tier.key,
}))));
await page.evaluate(() => window.breachline.game.setQuality('high'));
await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(() => ({ body: document.body.className, grain: getComputedStyle(document.getElementById('grain')).display, card: getComputedStyle(document.querySelector('.intel-card')).backdropFilter }))));
await browser.close();
