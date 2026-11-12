import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
const assert = (c, m) => { if (!c) throw new Error(m); };
try {
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.breachline?.game, null, { timeout: 90000 });
await page.evaluate(() => { window.breachline.game.requestLock = () => {}; });
await page.waitForTimeout(1200);
assert(await page.locator('#menu').isVisible(), 'menu visible');
assert(await page.locator('#webglError').isHidden(), 'WebGL initialized');
await page.screenshot({ path: 'tests/artifacts/menu-desktop.png', timeout: 120000 });
const initial = await page.evaluate(() => { const g = window.breachline.game; return { state: g.state, actors: g.actors.length, colliders: g.world.colliders.length, nav: g.world.nav.reduce((a, b) => a + b, 0), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
assert(initial.actors === 8 && initial.nav > 2000, 'arena/nav populated');
console.log('INITIAL', JSON.stringify(initial));
await page.locator('[data-weapon="2"]').click();
await page.locator('#deployBtn').click();
await page.waitForTimeout(700);
let st = await page.evaluate(() => { const g = window.breachline.game; return { state: g.state, weapon: g.player.weaponIndex, lock: !!document.pointerLockElement, fallback: g.fallbackLook }; });
assert(st.state === 'playing' && st.weapon === 2, 'deploy + selected weapon');
console.log('DEPLOY', JSON.stringify(st));
// Deterministic input checks through the actual simulation methods.
const combat = await page.evaluate(() => {
  const g = window.breachline.game; g.audio.muted = true; g.player.spawnProtection = 0;
  const before = g.player.pos.clone(); g.keys.add('KeyW'); for (let i = 0; i < 30; i++) g.update(1 / 60); g.keys.clear();
  const moved = g.player.pos.distanceTo(before);
  const mag = g.player.ammo[2].mag; g.player.fireCooldown = 0; g.fire(g.player); const fired = g.player.ammo[2].mag === mag - 1;
  g.reload(g.player); for (let i = 0; i < 140; i++) g.update(1 / 60); const reloaded = g.player.ammo[2].mag === 12 && !g.player.reload;
  g.switchWeapon(1); const switched = g.player.weaponIndex === 1;
  const n = g.player.grenades; g.throwGrenade(g.player); const grenade = g.player.grenades === n - 1 && g.grenades.length > 0;
  for (let i = 0; i < 150; i++) g.update(1 / 60); const exploded = g.grenades.length === 0;
  g.player.pos.set(0, 0, 18); g.player.hp = 40; g.interact(); const ammo = g.player.ammo[0].reserve === 180;
  g.player.pos.set(-28, 0, 0); g.interact(); const health = g.player.hp === 100 && g.player.shield === 50;
  return { moved, fired, reloaded, switched, grenade, exploded, ammo, health };
});
console.log('COMBAT', JSON.stringify(combat));
for (const [k, v] of Object.entries(combat)) assert(v && (k !== 'moved' || v > .5), 'combat check ' + k);
await page.evaluate(() => { const g = window.breachline.game; g.player.pos.set(-10, 0, 16); g.player.yaw = -.15; g.player.pitch = .02; g.player.spawnProtection = 0; g.player.weaponIndex = 0; g.switchWeapon(0); g.player.switchTimer = 0; g.updateHUD(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'tests/artifacts/gameplay-desktop.png', timeout: 120000 });
// Pause/resume and field manual.
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
if (await page.evaluate(() => window.breachline.game.state) !== 'paused') await page.evaluate(() => window.breachline.game.pause());
assert(await page.locator('#pause').isVisible(), 'pause overlay');
await page.locator('#pauseManual').click(); assert(await page.locator('#manual').isVisible(), 'manual'); await page.locator('#closeManual').click();
await page.locator('#resumeBtn').click(); await page.waitForTimeout(150);
assert(await page.evaluate(() => window.breachline.game.state) === 'playing', 'resume');
// Accelerated natural bot combat: 75 seconds, no scripted kills.
const sim = await page.evaluate(() => {
  const g = window.breachline.game; g.audio.muted = true; const start = g.actors.map(a => a.pos.clone());
  for (let i = 0; i < 75 * 60 && g.state !== 'over'; i++) g.update(1 / 60);
  return { state: g.state, scores: g.scores, elapsed: g.elapsed, finite: g.actors.every(a => Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y) && Number.isFinite(a.pos.z) && a.pos.y >= -.01), moved: g.actors.slice(1).map((a, i) => a.pos.distanceTo(start[i + 1])), kills: g.actors.map(a => a.kills), deaths: g.actors.map(a => a.deaths), states: g.actors.slice(1).map(a => a.state), grenades: g.grenades.length };
});
console.log('NATURAL SIM', JSON.stringify(sim));
assert(sim.finite && sim.scores[0] + sim.scores[1] > 0, 'bots score natural eliminations');
assert(sim.moved.every(d => d > 2), 'all bots navigate');
assert(sim.grenades <= 12, 'grenade pool bounded');
// Verify death/respawn, win, results, and rematch.
const flow = await page.evaluate(() => {
  const g = window.breachline.game; g.audio.muted = true;
  if (g.state === 'over') g.deploy(); g.audio.muted = true;
  // After a long accelerated sim every hostile can be mid-respawn at once. Force one
  // back into the field instead of assuming a live target exists.
  const liveEnemy = () => { let e = g.actors.find(a => a.team === 1 && a.alive); if (!e) { e = g.actors.find(a => a.team === 1); g.spawn(e); } e.spawnProtection = 0; return e; };
  const enemy = liveEnemy(); g.player.spawnProtection = 0;
  g.damage(g.player, 500, enemy, false, 'VX-4'); const dead = g.state === 'dead' && !g.player.alive;
  for (let i = 0; i < 220; i++) g.update(1 / 60); const respawned = g.player.alive && g.state === 'playing';
  g.scores[0] = 29; const e2 = liveEnemy(); g.damage(e2, 500, g.player, true, 'KESTREL');
  const won = g.state === 'over' && g.scores[0] === 30;
  return { dead, respawned, won };
});
console.log('FLOW', JSON.stringify(flow));
for (const [k, v] of Object.entries(flow)) assert(v, 'flow ' + k);
await page.waitForTimeout(200); await page.screenshot({ path: 'tests/artifacts/results-desktop.png', timeout: 120000 });
await page.locator('#rematchBtn').click(); await page.waitForTimeout(150);
// The clock starts ticking the moment the match resumes, so assert a fresh clock
// rather than exact equality with 300 (the fixed-step loop may already have run).
const rematch = await page.evaluate(() => { const g = window.breachline.game; return g.state === 'playing' && g.scores[0] === 0 && g.scores[1] === 0 && g.player.kills === 0 && g.time > 299 && g.elapsed < 1; });
assert(rematch, 'clean rematch');
// Timeout tie -> sudden death.
const ot = await page.evaluate(() => { const g = window.breachline.game; g.time = .001; g.scores = [5, 5]; g.update(1 / 60); return g.overtime && g.state === 'playing'; });
assert(ot, 'overtime');
// Mobile layout and touch controls. The desktop page is finished with, so close it
// first: two software-WebGL contexts starve each other and the mobile boot stalls.
await page.close();
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
mobile.on('pageerror', e => errors.push('MOBILE: ' + e.message));
mobile.on('console', m => { if (m.type() === 'error') errors.push('MOBILE CONSOLE: ' + m.text()); });
await mobile.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); await mobile.waitForFunction(() => window.breachline?.game, null, { timeout: 90000 }); await mobile.waitForTimeout(700);
await mobile.screenshot({ path: 'tests/artifacts/menu-mobile.png', fullPage: true, timeout: 120000 });
await mobile.locator('#deployBtn').scrollIntoViewIfNeeded(); await mobile.locator('#deployBtn').tap(); await mobile.waitForTimeout(500);
assert(await mobile.locator('#touch').isVisible(), 'touch controls visible');
const touch = await mobile.evaluate(() => {
  const g = window.breachline.game, stick = document.getElementById('stick'), r = stick.getBoundingClientRect();
  stick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: r.right - 10, clientY: r.top + r.height / 2, bubbles: true }));
  const moved = g.touchMove.x > .5;
  stick.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }));
  const released = g.touchMove.x === 0;
  const fire = document.querySelector('[data-touch="fire"]'); fire.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true })); const firing = g.touchFire; fire.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true }));
  return { moved, released, firing, state: g.state, overflow: document.documentElement.scrollWidth > innerWidth };
});
console.log('TOUCH', JSON.stringify(touch)); assert(touch.moved && touch.released && touch.firing && !touch.overflow, 'touch input');
await mobile.waitForTimeout(300); await mobile.screenshot({ path: 'tests/artifacts/gameplay-mobile.png', timeout: 120000 });
await mobile.locator('#pauseBtn').tap(); assert(await mobile.locator('#pause').isVisible(), 'mobile pause');
console.log('ERRORS', JSON.stringify(errors));
assert(errors.length === 0, 'no runtime/console errors');
} catch (err) {
  // Always surface collected page errors and release the browser, even on failure.
  console.error('FAIL:', err.message);
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
  process.exit(1);
}
await browser.close();
console.log('PASS: all smoke checks completed.');
