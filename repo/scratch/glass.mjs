import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.breachline.game; g.requestLock = () => {}; g.audio.muted = true; g.deploy(); g.audio.muted = true; });
await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.breachline.game; g.player.pos.set(-10, 0, 20); g.player.yaw = 0; g.player.pitch = 0; g.player.spawnProtection = 99; g.switchWeapon(2); g.adsHeld = true; });
// Wait for the switch dip and ADS lerp to actually settle instead of guessing a duration.
await page.waitForFunction(() => { const g = window.breachline.game; const w = g.viewWeapons[2]; return g.player.switchTimer === 0 && g.player.ads && Math.abs(w.position.y + 0.152) < 0.004 && Math.abs(g.camera.fov - 38) < 0.5; }, null, { timeout: 60000 });
console.log('SETTLED', JSON.stringify(await page.evaluate(() => { const g = window.breachline.game; const w = g.viewWeapons[2]; return { pos: w.position.toArray().map(n => +n.toFixed(3)), fov: +g.camera.fov.toFixed(1), ads: g.player.ads, sw: g.player.switchTimer }; })));
await page.screenshot({ path: 'scratch/vm-dmr-ads2.png', timeout: 120000 });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
