import { chromium } from '../repo/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.breachline.game; g.requestLock = () => {}; g.audio.muted = true; g.deploy(); g.audio.muted = true; });
await page.waitForTimeout(2500);
// Park the player at a clean vantage point facing down the arena.
await page.evaluate(() => { const g = window.breachline.game; g.player.pos.set(-10, 0, 20); g.player.yaw = 0; g.player.pitch = 0; g.player.spawnProtection = 99; });
const shot = async (name) => { await page.waitForTimeout(2200); await page.screenshot({ path: `scratch/vm-${name}.png`, timeout: 120000 }); console.log('captured', name); };
for (const [i, label] of [[0, 'vx4'], [1, 'm12'], [2, 'dmr']]) {
  await page.evaluate((i) => { const g = window.breachline.game; g.switchWeapon(i); g.adsHeld = false; }, i);
  await shot(`${label}-hip`);
  await page.evaluate(() => { window.breachline.game.adsHeld = true; });
  await shot(`${label}-ads`);
  await page.evaluate(() => { window.breachline.game.adsHeld = false; });
}
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
