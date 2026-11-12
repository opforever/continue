import * as THREE from 'three';
import { World, clamp, raySphere, TEAM } from './world.js';
import { Models, Effects, WEAPONS } from './models.js';
import { AudioEngine } from './audio.js';
const V = THREE.Vector3;
const UP = new V(0, 1, 0);
const DIFF = { recruit: { spread: .065, reaction: .55, damage: .72 }, operator: { spread: .038, reaction: .34, damage: 1 }, veteran: { spread: .025, reaction: .22, damage: 1.18 } };
const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export class Game {
  constructor(canvas, emit = () => {}) {
    this.canvas = canvas; this.emit = emit; this.state = 'menu'; this.difficulty = 'operator'; this.sensitivity = 1; this.audio = new AudioEngine();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene(); this.world = new World(this.scene); this.models = new Models(); this.effects = new Effects(this.scene);
    this.camera = new THREE.PerspectiveCamera(74, 1, .06, 300); this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene(); this.viewCamera = new THREE.PerspectiveCamera(55, 1, .01, 10); this.viewScene.add(new THREE.HemisphereLight(0xd5f1f2, 0x6b6250, 2.6)); const vl = new THREE.DirectionalLight(0xffe0b3, 3); vl.position.set(-3, 5, 2); this.viewScene.add(vl); const vf = new THREE.DirectionalLight(0x75d9e4, 1.2); vf.position.set(3, 1, -3); this.viewScene.add(vf);
    this.viewWeapons = WEAPONS.map((_, i) => { const g = this.models.weapon(i, 0); g.visible = i === 0; g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); this.viewScene.add(g); return g; });
    this.keys = new Set(); this.fireHeld = false; this.firePressed = false; this.adsHeld = false; this.touchMove = { x: 0, y: 0 }; this.touchFire = false; this.touchAds = false; this.fallbackLook = false; this.hadLock = false; this.dragging = false;
    this.actors = []; this.grenades = []; this.intel = [new Map(), new Map()]; this.time = 300; this.scores = [0, 0]; this.overtime = false; this.elapsed = 0; this.hudTimer = 0; this.feed = []; this.shake = 0; this.hitFlash = 0; this.damageAngle = 0; this.killBanner = null; this.prompt = null; this.lastFrame = 0; this.acc = 0; this.clock = 0; this.disposed = false;
    this.grenadeGeo = new THREE.SphereGeometry(.12, 10, 8); this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4d6452, metalness: .5, roughness: .5 });
    this.createActors(); this.bind(); this.resize(); this.resetMatch(); this.state = 'menu';
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }
  createActors() {
    const names = [['YOU', 'ROOK', 'NOVA', 'ATLAS'], ['WRAITH', 'CINDER', 'HEX', 'FANG']];
    for (let team = 0; team < 2; team++) for (let i = 0; i < 4; i++) {
      const id = team * 4 + i, a = { id, team, name: names[team][i], pos: new V(), yaw: team ? Math.PI : 0, pitch: 0, hp: 100, shield: team === 0 && i === 0 ? 50 : 0, alive: true, kills: 0, deaths: 0, damage: 0, shots: 0, hits: 0, headshots: 0, respawnTimer: 0, spawnProtection: 0, fireCooldown: 0, reload: null, weaponIndex: 0, grenades: 2, crouch: false, ads: false, sprint: false, moving: 0, vel: new V(), vy: 0, grounded: true, lastDamage: -99, recoil: 0, recoilReturn: 0, stepTimer: 0, bob: 0, flashTimer: 0, switchTimer: 0, ammo: WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve })) };
      if (id > 0) { a.model = this.models.bot(team, a.name); this.scene.add(a.model.root); Object.assign(a, { target: null, thinkTimer: Math.random() * .3, pathTimer: 0, path: [], goal: new V(), memory: null, memoryTime: 0, reaction: 0, burst: 3, burstPause: 0, strafe: Math.random() > .5 ? 1 : -1, strafeTimer: 1, state: 'advance', lane: (i - 1.5) * 9, grenadeTimer: 8 + Math.random() * 8, stuckTimer: 0, lastPos: new V(), anim: Math.random() * 6, deathTime: 0 }); }
      this.actors.push(a);
    }
    this.player = this.actors[0];
  }
  bind() {
    this.onResize = () => this.resize(); window.addEventListener('resize', this.onResize);
    this.onKeyDown = e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Escape') { if (this.state === 'playing' || this.state === 'dead') this.pause(); return; }
      if (e.code === 'KeyM') { this.emit('mute', this.audio.toggle()); return; }
      if (e.code === 'Tab' && ['playing', 'dead', 'paused'].includes(this.state)) { e.preventDefault(); this.emit('scoreboard', true); return; }
      if (!['playing', 'dead'].includes(this.state)) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyG', 'KeyE', 'KeyC', 'ControlLeft', 'ShiftLeft', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); if (e.repeat) return;
      if (this.state !== 'playing') return;
      if (e.code === 'KeyR') this.reload(this.player); if (e.code === 'KeyG') this.throwGrenade(this.player); if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyC') this.crouchToggle = !this.crouchToggle;
      if (e.code.startsWith('Digit')) this.switchWeapon(+e.code.slice(5) - 1);
      if (e.code === 'Space' && this.player.grounded && !this.player.crouch) { this.player.vy = 7.2; this.player.grounded = false; this.audio.step(true); }
    };
    this.onKeyUp = e => { this.keys.delete(e.code); if (e.code === 'Tab') this.emit('scoreboard', false); };
    this.onMouseMove = e => { if (this.state !== 'playing') return; if (document.pointerLockElement === this.canvas || (this.fallbackLook && this.dragging)) this.look(e.movementX || 0, e.movementY || 0); };
    this.onMouseDown = e => { if (this.state !== 'playing') return; if (document.pointerLockElement !== this.canvas && e.target !== this.canvas && !this.fallbackLook) return; this.dragging = true; if (e.button === 0) { this.fireHeld = true; this.firePressed = true; } if (e.button === 2) this.adsHeld = true; };
    this.onMouseUp = e => { if (e.button === 0) { this.fireHeld = false; this.dragging = false; } if (e.button === 2) this.adsHeld = false; };
    this.onLock = () => { if (document.pointerLockElement === this.canvas) { this.hadLock = true; this.fallbackLook = false; } else if (this.hadLock && ['playing', 'dead'].includes(this.state)) this.pause(); };
    this.onLockError = () => { this.fallbackLook = true; this.emit('toast', 'Pointer capture unavailable — drag to look, click to fire.'); };
    this.onBlur = () => { this.keys.clear(); this.fireHeld = this.adsHeld = false; if (['playing', 'dead'].includes(this.state)) this.pause(); };
    this.onContext = e => e.preventDefault();
    document.addEventListener('keydown', this.onKeyDown); document.addEventListener('keyup', this.onKeyUp); document.addEventListener('mousemove', this.onMouseMove); document.addEventListener('mousedown', this.onMouseDown); document.addEventListener('mouseup', this.onMouseUp); document.addEventListener('pointerlockchange', this.onLock); document.addEventListener('pointerlockerror', this.onLockError); document.addEventListener('visibilitychange', () => { if (document.hidden) this.onBlur(); }); window.addEventListener('blur', this.onBlur); this.canvas.addEventListener('contextmenu', this.onContext);
  }
  look(dx, dy) { const s = .0022 * this.sensitivity * (this.player.ads ? .58 : 1); this.player.yaw -= dx * s; this.player.pitch = clamp(this.player.pitch - dy * s, -1.42, 1.42); }
  resize() { const w = window.innerWidth, h = window.innerHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewCamera.aspect = w / h; this.viewCamera.updateProjectionMatrix(); }
  requestLock() { if (matchMedia('(pointer: coarse)').matches) return; try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => this.onLockError()); } catch { this.onLockError(); } }
  resetMatch() {
    this.time = 300; this.scores = [0, 0]; this.overtime = false; this.elapsed = 0; this.feed = []; this.killBanner = null; this.hitFlash = 0; this.shake = 0; this.prompt = null; this.intel = [new Map(), new Map()]; this.world.reset(); this.effects.clear();
    for (const g of this.grenades) this.scene.remove(g.mesh); this.grenades.length = 0;
    for (const a of this.actors) { a.kills = a.deaths = a.damage = a.shots = a.hits = a.headshots = 0; a.weaponIndex = 0; a.crouch = false; this.crouchToggle = false; a.ads = false; a.pitch = 0; a.yaw = a.team ? Math.PI : 0; a.vel.set(0, 0, 0); a.vy = 0; a.grenades = 2; a.ammo = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve })); this.spawn(a, true); }
    this.player.pos.set(-10, 0, 23); this.player.yaw = 0; this.switchTimer = 0; this.fireHeld = this.firePressed = this.adsHeld = false; this.keys.clear(); this.touchMove = { x: 0, y: 0 }; this.touchFire = false;
    this.viewWeapons.forEach((g, i) => g.visible = i === 0); this.emit('feed', this.feed); this.updateHUD();
  }
  deploy() { this.audio.init(); this.resetMatch(); this.state = 'playing'; this.emit('state', this.state); this.requestLock(); this.emit('toast', 'SQUAD LINKED · Advance with your team. First to 30.'); }
  resume() { if (!['paused', 'dead'].includes(this.state)) return; this.audio.init(); this.state = this.player.alive ? 'playing' : 'dead'; this.keys.clear(); this.fireHeld = this.adsHeld = false; this.emit('state', this.state); if (this.player.alive) this.requestLock(); }
  pause() { if (!['playing', 'dead'].includes(this.state)) return; this.state = 'paused'; this.keys.clear(); this.fireHeld = this.adsHeld = this.touchFire = false; this.touchMove = { x: 0, y: 0 }; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); this.emit('state', this.state); }
  toMenu() { this.state = 'menu'; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); this.keys.clear(); this.fireHeld = false; this.resetMatch(); this.emit('state', 'menu'); }
  setDifficulty(d) { if (DIFF[d]) this.difficulty = d; }
  spawn(a, initial = false) {
    const points = this.world.spawnPoints[a.team]; let best = points[0], bestScore = -Infinity;
    for (const p of points) { let nearest = 99; for (const e of this.actors) if (e.team !== a.team && e.alive) nearest = Math.min(nearest, p.distanceTo(e.pos)); let occupied = 0; for (const o of this.actors) if (o !== a && o.alive && o.pos.distanceTo(p) < 1.5) occupied++; const score = nearest - occupied * 12 + Math.random() * 5; if (score > bestScore) { bestScore = score; best = p; } }
    a.pos.copy(best); if (!this.world.free(a.pos.x, a.pos.z, .4)) { const i = this.world.nearestFree(a.pos.x, a.pos.z), p = this.world.point(i % this.world.nx, Math.floor(i / this.world.nx)); a.pos.set(p.x, 0, p.z); }
    a.hp = 100; a.shield = a.id === 0 ? 50 : 0; a.alive = true; a.respawnTimer = 0; a.spawnProtection = initial ? 2 : 1.5; a.reload = null; a.fireCooldown = .25; a.vy = 0; a.grounded = true; a.crouch = false; a.lastDamage = -99; a.grenades = 2; a.ammo = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve }));
    if (a.model) { a.model.root.visible = true; a.model.root.rotation.set(0, a.team ? Math.PI : 0, 0); a.model.root.position.copy(a.pos); a.target = null; a.path = []; a.pathTimer = 0; a.memory = null; a.memoryTime = 0; a.state = 'advance'; a.reaction = DIFF[this.difficulty].reaction; a.grenadeTimer = 8 + Math.random() * 8; a.model.marker.visible = true; a.deathTime = 0; }
    if (a.id === 0 && !initial) { a.yaw = a.team ? Math.PI : 0; a.pitch = 0; if (this.state === 'dead') { this.state = 'playing'; this.emit('state', 'playing'); } this.emit('respawn'); }
  }
  eye(a) { return a.pos.clone().add(new V(0, a.crouch ? 1.08 : 1.64, 0)); }
  direction(a) { return new V(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch)); }
  switchWeapon(i) { if (i < 0 || i > 2 || i === this.player.weaponIndex || !this.player.alive) return; this.player.weaponIndex = i; this.player.reload = null; this.player.switchTimer = .32; this.player.fireCooldown = .3; this.player.ads = false; this.viewWeapons.forEach((g, k) => { g.visible = k === i; g.userData.mag.position.y = g.userData.magY; }); this.audio.reload(); this.updateHUD(); }
  reload(a) { const w = WEAPONS[a.weaponIndex || 0], ammo = a.ammo[a.weaponIndex || 0]; if (!a.alive || a.reload || ammo.mag >= w.mag || ammo.reserve <= 0) return false; a.reload = { time: w.reload, total: w.reload, weapon: a.weaponIndex || 0 }; if (a.id === 0) { this.audio.reload(); this.emit('reload', w.reload); } return true; }
  finishReload(a) { const i = a.reload.weapon, w = WEAPONS[i], ammo = a.ammo[i], n = Math.min(w.mag - ammo.mag, ammo.reserve); ammo.mag += n; ammo.reserve -= n; a.reload = null; if (a.id === 0) this.audio.reload(); }
  interact() { const p = this.player; for (const s of this.world.pickups) if (s.cooldown <= 0 && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 2.2) { if (s.type === 'health') { if (p.hp >= 100 && p.shield >= 50) { this.emit('toast', 'Health and shields already full.'); return; } p.hp = 100; p.shield = 50; } else { p.ammo.forEach((a, i) => a.reserve = WEAPONS[i].reserve); p.grenades = 2; } s.cooldown = 20; this.audio.pickup(); this.emit('toast', s.type === 'health' ? 'FIELD MEDKIT · Health and shields restored.' : 'RESUPPLIED · All reserves and grenades restored.'); return; } this.emit('toast', 'Move within 2 m of a glowing supply station.'); }
  aimPoint(a, target) { const p = this.eye(target); p.y -= .32; return p; }
  hitActors(o, d, max, shooter) {
    let best = null;
    for (const a of this.actors) {
      if (!a.alive || a === shooter || a.team === shooter.team) continue;
      const headC = a.pos.clone().add(new V(0, a.crouch ? 1.05 : 1.65, 0)); const ht = raySphere(o, d, headC, .23);
      const body = { min: new V(a.pos.x - .29, a.pos.y + .18, a.pos.z - .27), max: new V(a.pos.x + .29, a.pos.y + (a.crouch ? .98 : 1.48), a.pos.z + .27) }; const bh = this.world.rayBox(o, d, body, max);
      let t = null, head = false; if (ht !== null && ht <= max && (!bh || ht < bh.t)) { t = ht; head = true; } else if (bh) { t = bh.t; }
      if (t !== null && t > .01 && (!best || t < best.t)) best = { t, actor: a, head, point: o.clone().addScaledVector(d, t) };
    }
    return best;
  }
  fire(a, bot = false) {
    const wi = a.weaponIndex || 0, w = WEAPONS[wi], ammo = a.ammo[wi]; if (!a.alive || a.reload || a.fireCooldown > 0 || a.spawnProtection > .9) return;
    if (ammo.mag <= 0) { if (a.id === 0) { this.audio.empty(); this.reload(a); } else this.reload(a); a.fireCooldown = .2; return; }
    ammo.mag--; a.shots++; a.fireCooldown = w.interval; a.flashTimer = .055; a.recoil = Math.min(.13, a.recoil + w.recoil);
    const origin = this.eye(a); let dir = this.direction(a);
    if (bot) { const target = a.target; if (!target) return; dir = this.aimPoint(a, target).sub(origin).normalize(); const diff = DIFF[this.difficulty]; const spread = diff.spread * (target.moving > 2 ? 1.25 : 1); dir.x += (Math.random() - .5) * spread * 2; dir.y += (Math.random() - .5) * spread * 2; dir.z += (Math.random() - .5) * spread * 2; dir.normalize(); }
    else { const spread = w.spread * (a.ads ? w.adsSpread / w.spread : 1) * (a.moving > 1 ? 1.6 : 1) * (a.crouch ? .7 : 1); dir.x += (Math.random() - .5) * spread; dir.y += (Math.random() - .5) * spread; dir.z += (Math.random() - .5) * spread; dir.normalize(); a.pitch = clamp(a.pitch + w.recoil * (a.ads ? .18 : .3), -1.42, 1.42); a.recoilReturn += w.recoil * (a.ads ? .18 : .3); this.shake = Math.max(this.shake, w.recoil * .6); }
    let anyHit = false, anyHead = false, anyKill = false;
    const muzzle = origin.clone().addScaledVector(dir, .55); if (!bot) muzzle.add(new V(Math.cos(a.yaw) * .18, -.16, -Math.sin(a.yaw) * .18));
    for (let p = 0; p < w.pellets; p++) {
      const pd = dir.clone(); if (w.pellets > 1) { const sp = a.ads ? w.adsSpread : w.spread; pd.x += (Math.random() - .5) * sp * 2; pd.y += (Math.random() - .5) * sp * 2; pd.z += (Math.random() - .5) * sp * 2; pd.normalize(); }
      const wh = this.world.rayWorld(origin, pd, w.range), ah = this.hitActors(origin, pd, wh ? wh.t : w.range, a); const end = ah ? ah.point : wh ? wh.point : origin.clone().addScaledVector(pd, w.range);
      this.effects.tracer(muzzle, end, a.team ? 0xffb17b : 0xb9fff0);
      if (ah) { const fall = wi === 1 ? clamp(1 - (ah.t - 7) / 30, .2, 1) : clamp(1 - (ah.t - 30) / 140, .65, 1); const dmg = w.damage * fall * (ah.head ? (wi === 1 ? 1.5 : 2) : 1) * (bot ? DIFF[this.difficulty].damage : 1); const killed = this.damage(ah.actor, dmg, a, ah.head, w.name); anyHit = true; anyHead ||= ah.head; anyKill ||= killed; this.effects.burst(ah.point, ah.actor.team ? 0xffb185 : 0x91f5e5, 5, 2.5, .3, .035); if (!bot) a.hits++; }
      else if (wh) { this.effects.burst(wh.point, 0xffd49b, w.pellets > 1 ? 2 : 5, 2.5, .3, .03); if (wh.collider?.barrel) { const b = wh.collider.barrel; b.hp -= w.damage * (bot ? DIFF[this.difficulty].damage : 1); if (b.hp <= 0) this.explodeBarrel(b, a); } }
    }
    if (anyHit && a.id === 0) { this.audio.hit(anyKill, anyHead); this.emit('hit', { head: anyHead, kill: anyKill }); }
    if (!bot) { const right = new V(Math.cos(a.yaw), 0, -Math.sin(a.yaw)), sp = origin.clone().addScaledVector(right, .28).add(new V(0, -.2, 0)); this.effects.burst(sp, 0xe8bd68, 1, 2.4, .7, .035); }
    const dist = a.id === 0 ? 0 : this.player.pos.distanceTo(a.pos); const pan = a.id === 0 ? 0 : clamp(new V(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw)).dot(a.pos.clone().sub(this.player.pos).normalize()), -1, 1); this.audio.shot(wi, dist, pan, a.team === 1);
    if (bot) { a.burst--; if (a.burst <= 0) { a.burstPause = .45 + Math.random() * .55; a.burst = 3 + Math.floor(Math.random() * 3); } if (ammo.mag === 0) this.reload(a); }
  }
  damage(target, amount, attacker, head = false, weapon = '') {
    if (!target.alive || target.spawnProtection > 0 || target.team === attacker.team) return false;
    let actual = amount; if (target.shield > 0) { const s = Math.min(target.shield, amount); target.shield -= s; actual -= s; } target.hp -= actual; target.lastDamage = this.elapsed; attacker.damage += amount;
    if (target.id > 0) { target.memory = attacker.pos.clone(); target.memoryTime = 5; if (!target.target || !target.target.alive) { target.target = attacker; target.reaction = DIFF[this.difficulty].reaction; } }
    if (target.id === 0) { this.hitFlash = .65; this.shake = .07; this.damageAngle = Math.atan2(attacker.pos.x - target.pos.x, -(attacker.pos.z - target.pos.z)) + target.yaw; this.audio.hurt(); this.emit('hurt'); }
    if (target.hp <= 0) { target.hp = 0; target.alive = false; target.deaths++; target.respawnTimer = target.id === 0 ? 3.2 : 3.8; target.reload = null; attacker.kills++; this.scores[attacker.team]++; if (head) attacker.headshots++;
      this.feed.unshift({ killer: attacker.name, victim: target.name, team: attacker.team, head, weapon, time: this.elapsed }); this.feed = this.feed.slice(0, 5); this.emit('feed', this.feed);
      if (attacker.id === 0) { this.killBanner = { text: head ? 'HEADSHOT ELIMINATION' : 'ENEMY ELIMINATED', sub: `${target.name}  ·  +1 SQUAD POINT`, time: 2 }; this.emit('kill', this.killBanner); }
      if (target.model) { target.deathTime = 0; target.model.marker.visible = false; }
      if (target.id === 0) { this.state = 'dead'; this.fireHeld = this.adsHeld = false; this.emit('death', { killer: attacker.name, weapon }); this.emit('state', 'dead'); }
      if (this.scores[attacker.team] >= 30 || (this.overtime && this.scores[0] !== this.scores[1])) this.endMatch();
      return true;
    }
    return false;
  }
  throwGrenade(a, targetPoint = null) {
    if (!a.alive || a.grenades <= 0 || this.grenades.length >= 12) return false;
    if (a.id === 0 && a.reload) return false;
    a.grenades--; const origin = this.eye(a); let vel;
    if (targetPoint) { const d = targetPoint.clone().sub(origin); const dist = Math.hypot(d.x, d.z), t = clamp(dist / 11, .6, 1.5); vel = new V(d.x / t, (d.y + .5 * 14 * t * t) / t, d.z / t); }
    else { const dir = this.direction(a); vel = dir.multiplyScalar(13).add(new V(0, 4.2, 0)); origin.addScaledVector(this.direction(a), .55); }
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat); mesh.position.copy(origin); mesh.castShadow = true; this.scene.add(mesh); this.grenades.push({ pos: origin, vel, mesh, life: 2.1, owner: a }); if (a.id === 0) { this.audio.reload(); this.player.switchTimer = .25; } return true;
  }
  explodeBarrel(b, owner) { if (!b.active) return; b.active = false; b.collider.active = false; b.mesh.visible = false; this.explode(new V(b.x, .7, b.z), owner, 5.2, 100); }
  explode(p, owner, radius = 6, power = 115) {
    this.effects.explosion(p, radius); this.audio.explosion(this.player.pos.distanceTo(p)); this.shake = Math.max(this.shake, .16 / (1 + this.player.pos.distanceTo(p) * .1));
    for (const a of this.actors) { if (!a.alive || a.team === owner.team && a !== owner) continue; const d = p.distanceTo(this.eye(a)); if (d < radius && this.world.visible(p, this.eye(a))) this.damage(a, power * (1 - d / radius * .8), owner, false, 'GRENADE'); }
    for (const b of this.world.barrels) if (b.active && Math.hypot(b.x - p.x, b.z - p.z) < radius * .8) this.explodeBarrel(b, owner);
  }
  updatePlayer(dt) {
    const p = this.player; if (!p.alive) return;
    p.ads = (this.adsHeld || this.touchAds) && !p.reload && !p.sprint; p.crouch = !!this.crouchToggle || this.keys.has('ControlLeft');
    let x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.touchMove.x, z = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) - this.touchMove.y;
    const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
    p.sprint = (this.keys.has('ShiftLeft') || this.touchSprint) && z > .1 && !p.ads && !p.crouch && !this.fireHeld;
    const speed = p.crouch ? 2.5 : p.sprint ? 7.3 : p.ads ? 3.1 : 4.7;
    const dx = (Math.cos(p.yaw) * x - Math.sin(p.yaw) * z) * speed, dz = (-Math.sin(p.yaw) * x - Math.cos(p.yaw) * z) * speed;
    p.vel.x = THREE.MathUtils.damp(p.vel.x, dx, 14, dt); p.vel.z = THREE.MathUtils.damp(p.vel.z, dz, 14, dt);
    const oldY = p.pos.y; this.world.move(p.pos, p.vel.x * dt, p.vel.z * dt, .38, p.crouch ? 1.2 : 1.8);
    p.vy -= 20 * dt; let ny = p.pos.y + p.vy * dt;
    if (p.vy <= 0) { const top = this.world.support(p.pos, oldY, ny); if (ny <= top) { if (!p.grounded && p.vy < -4) { this.shake = .035; this.audio.step(true); } ny = top; p.vy = 0; p.grounded = true; } else p.grounded = false; }
    else { for (const c of this.world.colliders) if (c.active && p.pos.x + .3 > c.min.x && p.pos.x - .3 < c.max.x && p.pos.z + .3 > c.min.z && p.pos.z - .3 < c.max.z && oldY + 1.7 <= c.min.y && ny + 1.7 > c.min.y) { ny = c.min.y - 1.7; p.vy = 0; } p.grounded = false; }
    p.pos.y = ny; p.moving = Math.hypot(p.vel.x, p.vel.z); p.bob += dt * p.moving * 1.9;
    if (p.moving > 1 && p.grounded) { p.stepTimer -= dt; if (p.stepTimer <= 0) { this.audio.step(p.sprint); p.stepTimer = p.sprint ? .28 : .4; } }
    if ((this.fireHeld || this.touchFire) && (WEAPONS[p.weaponIndex].auto || this.firePressed) && !p.sprint) this.fire(p); this.firePressed = false;
    if (p.reload) { p.reload.time -= dt; if (p.reload.time <= 0) this.finishReload(p); }
    if (this.elapsed - p.lastDamage > 6 && p.shield < 50) p.shield = Math.min(50, p.shield + 16 * dt);
    this.prompt = null; for (const s of this.world.pickups) if (s.cooldown <= 0 && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 2.2) this.prompt = { type: s.type, text: s.type === 'health' ? 'RESTORE HEALTH + SHIELDS' : 'RESUPPLY AMMO + GRENADES' };
  }
  chooseTarget(a) {
    let best = null, score = Infinity; const eye = this.eye(a);
    for (const e of this.actors) if (e.alive && e.team !== a.team && e.spawnProtection <= 0) { const d = a.pos.distanceTo(e.pos); if (d < 42 && this.world.visible(eye, this.eye(e))) { const s = d * (e === a.target ? .7 : 1) + (e.id === 0 ? 2 : 0); if (s < score) { score = s; best = e; } } }
    if (best !== a.target) { a.target = best; a.reaction = DIFF[this.difficulty].reaction + Math.random() * .15; }
    if (best) { a.memory = best.pos.clone(); a.memoryTime = 5; this.intel[a.team].set(best.id, { pos: best.pos.clone(), time: 5 }); }
  }
  coverPoint(a, threat) {
    let best = null, score = -Infinity; const eye = this.eye(a);
    for (let i = 0; i < 12; i++) { const ang = i / 12 * Math.PI * 2, x = a.pos.x + Math.cos(ang) * 4, z = a.pos.z + Math.sin(ang) * 4; if (!this.world.free(x, z, .5)) continue; const p = new V(x, 0, z), hidden = !this.world.visible(threat.clone().add(new V(0, 1.5, 0)), p.clone().add(new V(0, 1.5, 0))); const s = (hidden ? 10 : 0) - p.distanceTo(a.pos) * .3 + p.distanceTo(threat) * .15; if (s > score) { score = s; best = p; } }
    return best || a.pos.clone();
  }
  updateBot(a, dt) {
    if (!a.alive) { a.deathTime += dt; a.model.root.rotation.z = Math.min(1.45, a.deathTime * 3) * (a.id % 2 ? 1 : -1); a.model.root.position.y = -Math.max(0, a.deathTime - 1.2) * .5; if (a.deathTime > 2.5) a.model.root.visible = false; return; }
    const diff = DIFF[this.difficulty]; a.thinkTimer -= dt; a.pathTimer -= dt; a.memoryTime -= dt; a.strafeTimer -= dt; a.grenadeTimer -= dt; a.burstPause -= dt; a.reaction -= dt;
    if (a.thinkTimer <= 0) { this.chooseTarget(a); a.thinkTimer = .22 + Math.random() * .16; }
    if (a.strafeTimer <= 0) { a.strafe *= Math.random() > .3 ? -1 : 1; a.strafeTimer = .8 + Math.random() * 1.4; }
    if (a.reload) { a.reload.time -= dt; if (a.reload.time <= 0) this.finishReload(a); }
    const target = a.target && a.target.alive ? a.target : null; const eye = this.eye(a); let move = new V(), speed = 3.5;
    if (target) {
      const d = a.pos.distanceTo(target.pos), to = target.pos.clone().sub(a.pos).normalize(), side = new V(-to.z, 0, to.x); const see = this.world.visible(eye, this.eye(target));
      a.yaw = angleLerp(a.yaw, Math.atan2(-to.x, -to.z), Math.min(1, dt * 9)); a.pitch = Math.atan2(this.aimPoint(a, target).y - eye.y, d);
      if (see) {
        a.state = a.reload ? 'reload' : a.hp < 30 ? 'cover' : 'engage';
        if (a.reload || a.hp < 30) { if (a.pathTimer <= 0) { a.goal.copy(this.coverPoint(a, target.pos)); a.path = this.world.path(a.pos, a.goal); a.pathTimer = 1; } }
        else { if (d > 19) move.add(to); else if (d < 7) move.sub(to); move.addScaledVector(side, a.strafe * .7); speed = 2.5; }
        if (!a.reload && a.reaction <= 0 && a.burstPause <= 0 && a.fireCooldown <= 0) this.fire(a, true);
        if (a.ammo[0].mag < 8 && !a.reload && d > 22) this.reload(a);
      } else { a.target = null; a.memory = target.pos.clone(); a.memoryTime = 5; }
      if (a.grenadeTimer <= 0 && a.memoryTime > 0 && d > 8 && d < 22 && !see) { if (this.throwGrenade(a, a.memory)) a.grenadeTimer = 14 + Math.random() * 8; }
    } else {
      a.state = a.reload ? 'reload' : a.memoryTime > 0 ? 'hunt' : 'advance';
      if (a.hp < 45) { let med = null, md = 18; for (const s of this.world.pickups) if (s.type === 'health' && s.cooldown <= 0) { const d = Math.hypot(a.pos.x - s.x, a.pos.z - s.z); if (d < md) { md = d; med = s; } } if (med) { a.goal.set(med.x, 0, med.z); a.state = 'recover'; if (md < 1.7) { a.hp = 100; med.cooldown = 20; } } }
      if (a.state !== 'recover') {
        let intel = null, best = Infinity; for (const [id, info] of this.intel[a.team]) { const e = this.actors[id]; if (e.alive && info.time > 0) { const d = a.pos.distanceTo(info.pos); if (d < best) { best = d; intel = info; } } }
        if (a.memoryTime > 0 && a.memory) a.goal.copy(a.memory);
        else if (intel && best < 28) a.goal.copy(intel.pos);
        else if (a.pos.distanceTo(a.goal) < 2 || a.goal.length() === 0) { const phase = Math.floor(this.elapsed / 12); a.goal.set(clamp(a.lane + Math.sin(phase + a.id) * 6, -27, 27), 0, (a.team ? 1 : -1) * (8 + (phase % 3) * 5)); }
      }
      if (!a.reload && a.ammo[0].mag < 12) this.reload(a);
      const desiredYaw = Math.atan2(-(a.goal.x - a.pos.x), -(a.goal.z - a.pos.z)); a.yaw = angleLerp(a.yaw, desiredYaw, dt * 5); a.pitch = THREE.MathUtils.damp(a.pitch, 0, 5, dt);
    }
    if (a.state === 'recover' || a.state === 'hunt' || a.state === 'advance' || a.state === 'cover' || a.state === 'reload' && a.path.length) {
      if (a.pathTimer <= 0) { a.path = this.world.path(a.pos, a.goal); a.pathTimer = .8 + Math.random() * .5; }
      while (a.path.length && Math.hypot(a.path[0].x - a.pos.x, a.path[0].z - a.pos.z) < .48) a.path.shift();
      if (a.path.length) { const p = a.path[0]; move.set(p.x - a.pos.x, 0, p.z - a.pos.z).normalize(); }
    }
    for (const o of this.actors) if (o !== a && o.alive) { const d = a.pos.distanceTo(o.pos); if (d < .85 && d > .01) move.add(a.pos.clone().sub(o.pos).normalize().multiplyScalar((.85 - d) * 2)); }
    if (move.lengthSq() > 1) move.normalize();
    const before = a.pos.clone(); this.world.move(a.pos, move.x * speed * dt, move.z * speed * dt, .4, 1.8); a.moving = a.pos.distanceTo(before) / dt;
    a.stuckTimer += dt; if (a.stuckTimer > .7) { if (a.pos.distanceTo(a.lastPos) < .12 && move.lengthSq() > .1) { a.pathTimer = 0; a.goal.x += (Math.random() - .5) * 6; a.goal.z += (Math.random() - .5) * 6; a.strafe *= -1; } a.lastPos.copy(a.pos); a.stuckTimer = 0; }
    a.anim += dt * (a.moving * 2.2 + .5); const m = a.model; m.root.position.copy(a.pos); m.root.rotation.y = a.yaw; m.torso.position.y = 1.08 + Math.sin(a.anim * 2) * .018 * Math.min(1, a.moving); m.torso.rotation.x = a.moving > 1 ? .06 : 0;
    m.legs[0].rotation.x = Math.sin(a.anim) * .45 * Math.min(1, a.moving / 2); m.legs[1].rotation.x = -m.legs[0].rotation.x;
    m.arms[0].rotation.x = target ? a.pitch * .5 : .05; m.arms[1].rotation.x = target ? a.pitch * .5 : .12;
    m.gun.position.z = -.38 + a.recoil * .5; m.gun.rotation.x = a.pitch;
    m.marker.visible = a.team === 0 || this.world.visible(this.eye(this.player), this.eye(a)) && this.player.pos.distanceTo(a.pos) < 38;
    m.marker.rotation.y = -a.yaw; m.gun.userData.flash.visible = a.flashTimer > 0;
  }
  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) { const g = this.grenades[i]; g.life -= dt; g.vel.y -= 14 * dt; const old = g.pos.clone();
      const nx = g.pos.x + g.vel.x * dt, nz = g.pos.z + g.vel.z * dt;
      if (this.world.free(nx, g.pos.z, .13, g.pos.y - .12, .25)) g.pos.x = nx; else g.vel.x *= -.55;
      if (this.world.free(g.pos.x, nz, .13, g.pos.y - .12, .25)) g.pos.z = nz; else g.vel.z *= -.55;
      g.pos.y += g.vel.y * dt; const top = this.world.support(g.pos, old.y, g.pos.y, .13); if (g.pos.y < top + .12) { g.pos.y = top + .12; g.vel.y *= -.45; g.vel.x *= .75; g.vel.z *= .75; }
      g.mesh.position.copy(g.pos); g.mesh.rotation.x += dt * 6; g.mesh.rotation.z += dt * 4;
      if (g.life <= 0) { this.scene.remove(g.mesh); this.grenades.splice(i, 1); this.explode(g.pos.clone(), g.owner); }
    }
  }
  update(dt) {
    this.elapsed += dt; this.clock += dt; this.world.update(dt, this.elapsed);
    if (!this.overtime) { this.time -= dt; if (this.time <= 0) { this.time = 0; if (this.scores[0] === this.scores[1]) { this.overtime = true; this.emit('toast', 'OVERTIME · Next elimination wins.'); } else { this.endMatch(); return; } } }
    for (const team of this.intel) for (const [id, info] of team) { info.time -= dt; if (info.time <= 0) team.delete(id); }
    for (const a of this.actors) { a.fireCooldown = Math.max(0, a.fireCooldown - dt); a.spawnProtection = Math.max(0, a.spawnProtection - dt); a.flashTimer -= dt; a.recoil = THREE.MathUtils.damp(a.recoil, 0, 13, dt); if (!a.alive) { a.respawnTimer -= dt; if (a.respawnTimer <= 0 && this.state !== 'over') this.spawn(a); } }
    this.updatePlayer(dt); for (const a of this.actors) if (a.id > 0 && this.state !== 'over') this.updateBot(a, dt);
    if (this.state === 'over') return;
    this.updateGrenades(dt); this.effects.update(dt); this.shake = THREE.MathUtils.damp(this.shake, 0, 12, dt); this.hitFlash = Math.max(0, this.hitFlash - dt * 1.5);
    if (this.killBanner) { this.killBanner.time -= dt; if (this.killBanner.time <= 0) this.killBanner = null; }
    if (this.player.recoilReturn > 0 && this.player.fireCooldown < .03) { const r = Math.min(this.player.recoilReturn, dt * .045); this.player.pitch -= r; this.player.recoilReturn -= r; }
    this.hudTimer -= dt; if (this.hudTimer <= 0) { this.updateHUD(); this.hudTimer = .08; }
  }
  updateHUD() {
    const p = this.player, w = WEAPONS[p.weaponIndex], ammo = p.ammo[p.weaponIndex];
    this.emit('hud', { hp: Math.ceil(p.hp), shield: Math.ceil(p.shield), mag: ammo.mag, reserve: ammo.reserve, weapon: w, weaponIndex: p.weaponIndex, grenades: p.grenades, reload: p.reload ? 1 - p.reload.time / p.reload.total : 0, scores: [...this.scores], time: this.time, overtime: this.overtime, alive: p.alive, respawn: Math.max(0, p.respawnTimer), ads: p.ads, crouch: p.crouch, sprint: p.sprint, moving: p.moving, yaw: p.yaw, prompt: this.prompt, protection: p.spawnProtection, state: this.state, teammates: this.actors.filter(a => a.team === 0 && a.id > 0).map(a => ({ name: a.name, hp: Math.ceil(a.hp), alive: a.alive, state: a.state })), enemiesAlive: this.actors.filter(a => a.team === 1 && a.alive).length });
  }
  endMatch() { if (this.state === 'over') return; this.state = 'over'; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); this.fireHeld = this.adsHeld = false; this.audio.victory(this.scores[0] >= this.scores[1]); this.updateHUD(); this.emit('end', { win: this.scores[0] >= this.scores[1], scores: [...this.scores], actors: this.actors.map(a => ({ name: a.name, team: a.team, kills: a.kills, deaths: a.deaths, damage: Math.round(a.damage), id: a.id })), accuracy: this.player.shots ? Math.round(this.player.hits / this.player.shots * 100) : 0, headshots: this.player.headshots, duration: Math.round(this.elapsed) }); }
  updateView(dt) {
    const p = this.player, g = this.viewWeapons[p.weaponIndex], w = WEAPONS[p.weaponIndex];
    const ads = p.ads && p.alive, reload = p.reload, sw = p.switchTimer;
    p.switchTimer = Math.max(0, sw - dt); const bob = p.moving > .5 && p.grounded ? Math.sin(p.bob) * .012 * (ads ? .25 : 1) : Math.sin(this.clock * 1.5) * .002;
    const base = ads ? new V(0, w.id === 'dmr' ? -.245 : -.224, -.31) : new V(.29, -.3 + bob, -.43);
    if (p.sprint) { base.y -= .12; base.x -= .05; }
    let rz = 0, rx = 0;
    if (reload) { const t = 1 - reload.time / reload.total, s = Math.sin(t * Math.PI); rz = -.48 * s; rx = .22 * s; g.userData.mag.position.y = g.userData.magY - Math.sin(Math.min(1, t * 1.3) * Math.PI) * .32; g.userData.mag.rotation.x = -.3 * s; g.userData.bolt.position.z = g.userData.boltZ + (t > .78 ? Math.sin((t - .78) / .22 * Math.PI) * .08 : 0); }
    else { g.userData.mag.position.y = g.userData.magY; g.userData.mag.rotation.x = 0; g.userData.bolt.position.z = g.userData.boltZ; }
    if (sw > 0) base.y -= Math.sin(sw / .32 * Math.PI) * .3;
    base.z += p.recoil * .7; rx += p.recoil * 1.5; if (p.sprint) { rz -= .3; rx += .2; }
    g.position.lerp(base, Math.min(1, dt * 16)); g.rotation.set(rx, ads ? 0 : .035, rz); g.userData.flash.visible = p.flashTimer > 0 && p.alive; g.userData.flash.rotation.z = Math.random() * 6; if (g.userData.flash.userData.light) g.userData.flash.userData.light.intensity = p.flashTimer > 0 ? 3 : 0;
    const fov = ads ? (w.id === 'dmr' ? 38 : 53) : p.sprint ? 80 : 74; this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 12, dt); this.camera.updateProjectionMatrix();
  }
  render(dt) {
    if (this.state === 'menu') { const t = this.clock * .035; this.camera.position.set(31 + Math.sin(t) * 5, 23 + Math.sin(t * .7), 35 + Math.cos(t) * 4); this.camera.lookAt(-2, 1.2, -4); this.camera.fov = 57; this.camera.updateProjectionMatrix(); for (const a of this.actors) if (a.model) { a.model.root.position.copy(a.pos); a.model.root.rotation.y = a.team ? Math.PI : 0; a.model.marker.visible = false; a.anim += dt; a.model.torso.position.y = 1.08 + Math.sin(this.clock * 2 + a.id) * .015; } this.world.update(dt, this.clock); }
    else {
      const p = this.player; if (p.alive) { const eye = this.eye(p); const bob = p.moving > 1 && p.grounded ? Math.sin(p.bob * 2) * .018 : 0; this.camera.position.copy(eye); this.camera.position.y += bob; this.camera.rotation.set(p.pitch + (Math.random() - .5) * this.shake, p.yaw, (Math.random() - .5) * this.shake * .5); }
      else { this.camera.position.lerp(p.pos.clone().add(new V(0, .65, 0)), dt * 5); this.camera.rotation.set(-.12, p.yaw, .22); }
      this.updateView(dt);
    }
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'menu' && this.player.alive) { this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.viewScene, this.viewCamera); this.renderer.autoClear = true; }
  }
  loop(ts) {
    if (this.disposed) return; this.raf = requestAnimationFrame(this.loop); const dt = Math.min(.05, (ts - (this.lastFrame || ts)) / 1000); this.lastFrame = ts;
    if (this.state === 'playing' || this.state === 'dead') { this.acc += dt; let n = 0; while (this.acc >= 1 / 60 && n++ < 4) { this.update(1 / 60); this.acc -= 1 / 60; if (this.state === 'over') { this.acc = 0; break; } } }
    else { this.acc = 0; this.clock += this.state === 'menu' ? dt : 0; }
    this.render(dt);
  }
  minimap() { return { player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw, alive: this.player.alive }, actors: this.actors.filter(a => a.alive).map(a => ({ x: a.pos.x, z: a.pos.z, team: a.team, id: a.id, visible: a.team === 0 || a.model.marker.visible })), pickups: this.world.pickups.map(p => ({ x: p.x, z: p.z, type: p.type, ready: p.cooldown <= 0 })) }; }
}
