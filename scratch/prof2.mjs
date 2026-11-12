import { chromium } from '../repo/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 60000 });
await page.waitForTimeout(4000);
const fps = () => page.evaluate(() => new Promise(res => { let n = 0; const t = performance.now(); const tick = () => { n++; if (performance.now() - t < 4000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t) / 1000)).toFixed(2)); }; requestAnimationFrame(tick); }));
console.log('menu auto', await fps(), JSON.stringify(await page.evaluate(() => window.breachline.game.quality.stats())));
await page.addStyleTag({ content: '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
await page.waitForTimeout(1500);
console.log('menu no backdrop-filter', await fps());
await page.addStyleTag({ content: '#grain{display:none!important}' });
await page.waitForTimeout(1000);
console.log('menu no grain', await fps());
// stop rendering entirely to see compositor-only cost
await page.evaluate(() => { const g = window.breachline.game; g.__render = g.render; g.render = () => {}; });
console.log('menu render disabled', await fps());
await page.evaluate(() => { const g = window.breachline.game; g.render = g.__render; });
// gameplay
await page.evaluate(() => { const g = window.breachline.game; g.requestLock = () => {}; g.deploy(); });
await page.waitForTimeout(3000);
console.log('play no backdrop', await fps());
await page.evaluate(() => { const g = window.breachline.game; g.__render = g.render; g.render = () => {}; });
console.log('play render disabled', await fps());
await page.evaluate(() => { const g = window.breachline.game; g.render = g.__render; g.actors.forEach(a => a.model && (a.model.root.visible = false)); });
console.log('play bots hidden', await fps());
await browser.close();
