import { chromium } from '../repo/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'load' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 60000 });
await page.evaluate(() => { const g = window.breachline.game; g.requestLock = () => {}; g.renderer.info.autoReset = false; g.deploy(); });
await page.waitForTimeout(4000);
const probe = async (label) => {
  const r = await page.evaluate(() => new Promise(res => {
    const g = window.breachline.game; const samples = []; let n = 0;
    const origRender = g.render.bind(g);
    g.render = dt => { const t = performance.now(); g.renderer.info.reset(); origRender(dt); samples.push(performance.now() - t); };
    const tick = () => { n++; if (n < 8) requestAnimationFrame(tick); else { g.render = origRender; res({ ms: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, ratio: g.quality.pixelRatio() }); } };
    requestAnimationFrame(tick);
  }));
  console.log(label, JSON.stringify(r));
};
await probe('gameplay baseline');
await page.evaluate(() => { const g = window.breachline.game; g.actors.forEach(a => a.model && (a.model.root.visible = false)); });
await probe('bots hidden');
await page.evaluate(() => { const g = window.breachline.game; g.actors.forEach(a => a.model && (a.model.root.visible = true)); g.world.staticGroup && (g.world.staticGroup.visible = false); });
await page.evaluate(() => { const g = window.breachline.game; g.scene.traverse(o => { if (o.isInstancedMesh) o.visible = false; }); });
await probe('instanced static hidden');
await page.evaluate(() => { const g = window.breachline.game; g.scene.traverse(o => { if (o.isInstancedMesh) o.visible = true; }); g.renderer.setPixelRatio(0.35); g.resize(); });
await probe('dpr 0.35');
const names = await page.evaluate(() => { const g = window.breachline.game; const list = []; g.scene.children.forEach(c => { let n = 0; c.traverse(o => { if (o.isMesh) n++; }); if (n) list.push([c.type + ':' + (c.name || ''), n]); }); return list; });
console.log('SCENE CHILDREN', JSON.stringify(names));
await browser.close();
