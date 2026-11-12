import { chromium } from '../repo/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 60000 });
await page.evaluate(() => { const g = window.breachline.game; g.requestLock = () => {}; g.audio.muted = true; g.deploy(); g.audio.muted = true; });
// Force the match to end.
await page.evaluate(() => {
  const g = window.breachline.game; g.audio.muted = true; g.scores[0] = 29;
  let e = g.actors.find(a => a.team === 1 && a.alive); if (!e) { e = g.actors.find(a => a.team === 1); g.spawn(e); }
  e.spawnProtection = 0; g.player.spawnProtection = 0; g.damage(e, 500, g.player, true, 'KESTREL');
});
console.log('BEFORE', JSON.stringify(await page.evaluate(() => { const g = window.breachline.game; return { state: g.state, scores: g.scores, time: g.time }; })));
await page.locator('#rematchBtn').click();
console.log('IMMEDIATE', JSON.stringify(await page.evaluate(() => { const g = window.breachline.game; return { state: g.state, scores: g.scores, kills: g.player.kills, time: g.time, elapsed: g.elapsed }; })));
await page.waitForTimeout(150);
console.log('AFTER 150ms', JSON.stringify(await page.evaluate(() => { const g = window.breachline.game; return { state: g.state, scores: g.scores, kills: g.player.kills, time: g.time, elapsed: g.elapsed }; })));
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
