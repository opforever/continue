import { chromium } from '../repo/node_modules/playwright/index.mjs';
const t0 = Date.now();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 60000 });
console.log('boot ms', Date.now() - t0);
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const g = window.breachline.game;
  return { state: g.state, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures, programs: g.renderer.info.programs.length, colliders: g.world.colliders.length, dpr: g.renderer.getPixelRatio(), gl: g.renderer.getContext().getParameter(g.renderer.getContext().VERSION) };
});
console.log('INFO', JSON.stringify(info));
// measure rAF fps
const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t = performance.now(); const tick = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(tick); else res(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(tick); }));
console.log('MENU FPS', fps.toFixed(2));
const ts = Date.now();
try { await page.screenshot({ path: 'scratch/diag-menu.png', timeout: 120000 }); console.log('screenshot ms', Date.now() - ts); }
catch (e) { console.log('screenshot FAILED', e.message.split('\n')[0], Date.now() - ts); }
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
