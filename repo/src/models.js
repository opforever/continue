import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEAM, textTexture } from './world.js';

const geoCache = new Map();
function geo(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }
const boxGeo = (w, h, d, round = false) => geo(`b${w},${h},${d},${round}`, () => round ? new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .16) : new THREE.BoxGeometry(w, h, d));
const cylGeo = (r, l, r2 = r) => geo(`c${r},${l},${r2}`, () => new THREE.CylinderGeometry(r, r2, l, 12));
// Open-ended tube: a scope you can actually aim through. Solid cylinders capped both
// ends and gave the precision rifle a black disc instead of a sight picture.
const tubeGeo = (r, l) => geo(`t${r},${l}`, () => new THREE.CylinderGeometry(r, r, l, 20, 1, true));
export const WEAPONS = [
  { id: 'vx4', name: 'VX-4', label: 'ASSAULT CARBINE', mag: 30, reserve: 180, damage: 26, interval: .092, reload: 1.85, spread: .012, adsSpread: .0028, recoil: .018, pellets: 1, range: 95, auto: true, desc: 'Versatile. Reliable. Yours.', rpm: 650 },
  { id: 'm12', name: 'M12', label: 'PUMP SHOTGUN', mag: 8, reserve: 48, damage: 13, interval: .72, reload: 2.5, spread: .047, adsSpread: .031, recoil: .065, pellets: 8, range: 36, auto: false, desc: 'Eight pellets. Close quarters.', rpm: 83 },
  { id: 'dmr', name: 'KESTREL', label: 'PRECISION RIFLE', mag: 12, reserve: 72, damage: 57, interval: .36, reload: 2.15, spread: .007, adsSpread: .0007, recoil: .042, pellets: 1, range: 120, auto: false, desc: 'One angle. One clean shot.', rpm: 167 }
];
export class Models {
  constructor() {
    const standard = (color, metalness = .4, roughness = .5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.m = { gun: standard(0x35464a, .8, .32), edge: standard(0x738387, .8, .3), dark: standard(0x142227, .45, .5), poly: standard(0x263537, .1, .8), teal: standard(0x427c7b, .55, .42), tan: standard(0xa69c7c, .25, .65), brass: standard(0xd7ac5c, .8, .25), red: standard(0xa64736, .3, .5), glass: new THREE.MeshPhysicalMaterial({ color: 0x55cbd4, metalness: .6, roughness: .08, transparent: true, opacity: .65 }), white: standard(0xd6dfd5), armor: standard(0x4b5b58, .45, .55), cloth: standard(0x344744, .05, .95), visor: new THREE.MeshPhysicalMaterial({ color: 0x183e48, metalness: .9, roughness: .12 }), flash: new THREE.MeshBasicMaterial({ color: 0xffd48a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
    this.teamMats = TEAM.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .35, roughness: .5, metalness: .3 }));
    this.markerMats = TEAM.map(c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: .9 }));
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x102a2c, transparent: true, opacity: .25, depthWrite: false });
  }
  part(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  mergeStatic(group, preserve = new Set()) {
    const buckets = new Map();
    for (const child of [...group.children]) { if (!child.isMesh || preserve.has(child) || Array.isArray(child.material)) continue; child.updateMatrix(); const key = child.material.uuid; if (!buckets.has(key)) buckets.set(key, { mat: child.material, geos: [], meshes: [] }); const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone(); g.applyMatrix4(child.matrix); buckets.get(key).geos.push(g); buckets.get(key).meshes.push(child); }
    for (const { mat, geos, meshes } of buckets.values()) { if (geos.length < 2) { geos.forEach(g => g.dispose()); continue; } const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); if (!merged) continue; for (const m of meshes) group.remove(m); const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  }
  b(p, w, h, d, mat, x, y, z, round = false) { return this.part(p, boxGeo(w, h, d, round), mat, x, y, z); }
  c(p, r, l, mat, x, y, z, axis = 'z', r2 = r) { return this.part(p, cylGeo(r, l, r2), mat, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0); }
  weapon(type = 0, team = 0, detailed = true) {
    const g = new THREE.Group(), m = this.m, accent = this.teamMats[team]; const w = WEAPONS[type];
    const receiver = type === 1 ? m.tan : type === 2 ? m.teal : m.gun;
    this.b(g, .145, .15, .36, receiver, 0, 0, .02, true);
    this.b(g, .12, .09, .31, m.dark, 0, -.095, .045, true);
    this.b(g, .15, .035, .39, m.edge, 0, .08, -.015, true);
    this.b(g, .09, .055, .26, m.dark, 0, .115, -.025);
    // Ejection port, visible chamber, fasteners and controls on both sides.
    for (const s of [-1, 1]) {
      this.b(g, .008, .052, .15, m.dark, s * .075, .018, -.035, true);
      this.b(g, .01, .026, .105, m.brass, s * .08, .018, -.025);
      this.b(g, .017, .022, .065, m.edge, s * .082, -.042, .105, true);
      for (const z of [-.12, .12]) this.c(g, .012, .009, m.edge, s * .077, -.045, z, 'x');
      this.c(g, .018, .014, m.dark, s * .08, -.075, .12, 'x');
      this.b(g, .015, .012, .052, accent, s * .087, -.073, .12, true).rotation.x = -.35;
    }
    const bolt = this.b(g, .028, .03, .09, m.edge, .092, .025, .025, true);
    this.b(g, .06, .025, .035, m.dark, .09, .035, .13, true);
    // Skeletonized adjustable stock and recoil pad.
    this.c(g, .037, .23, m.edge, 0, -.005, .31);
    this.b(g, .11, .105, .21, m.poly, 0, -.025, .405, true);
    this.b(g, .12, .055, .22, m.tan, 0, .045, .4, true);
    this.b(g, .12, .17, .04, m.dark, 0, -.035, .515, true);
    this.b(g, .075, .055, .13, m.dark, 0, -.065, .395);
    for (let z = .49; z < .535; z += .012) this.b(g, .124, .006, .005, m.poly, 0, -.035, z);
    // Pistol grip, trigger guard and trigger.
    const grip = this.b(g, .085, .18, .095, m.poly, 0, -.18, .14, true); grip.rotation.x = -.28;
    for (let y = -.24; y < -.11; y += .022) this.b(g, .089, .007, .075, m.dark, 0, y, .14 + (y + .18) * .28);
    this.b(g, .07, .018, .14, m.edge, 0, -.18, .025);
    this.b(g, .018, .07, .018, m.edge, 0, -.145, -.04); this.b(g, .018, .065, .018, m.edge, 0, -.145, .09);
    this.b(g, .015, .055, .02, m.dark, 0, -.13, .035, true).rotation.x = -.3;
    const mag = new THREE.Group(); mag.position.set(0, -.13, -.075); g.add(mag);
    if (type !== 1) {
      const length = type === 2 ? .19 : .27;
      for (let i = 0; i < 3; i++) { const p = this.b(mag, .09, length / 3 + .012, .135, type === 2 ? m.gun : m.poly, 0, -i * length / 3 - length / 6, -i * .015, true); p.rotation.x = -.08 * i; }
      this.b(mag, .105, .025, .15, m.dark, 0, -length, -.035, true);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this.b(mag, .005, length * .7, .009, m.edge, s * .047, -length * .48, -.045 + i * .035);
      this.b(mag, .092, .025, .14, accent, 0, -.06, 0);
    } else this.b(mag, .07, .04, .08, m.dark, 0, -.015, 0);
    // Free-floating handguard, ventilation, full-length Picatinny rail.
    const handLength = type === 2 ? .42 : .34;
    if (type !== 1) {
      this.b(g, .125, .13, handLength, type === 2 ? m.teal : m.gun, 0, .005, -.2 - handLength / 2 + .04, true);
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { this.b(g, .006, .034, .039, m.dark, s * .065, .012, -.21 - i * .055, true); this.b(g, .007, .009, .032, m.edge, s * .068, -.035, -.21 - i * .055); }
      this.b(g, .065, .12, .075, m.poly, 0, -.13, -.34, true).rotation.x = .1;
    }
    for (let i = 0; i < 15; i++) this.b(g, .105, .018, .014, m.edge, 0, .14, .13 - i * .038);
    const barrelZ = type === 2 ? -.76 : type === 1 ? -.64 : -.65;
    this.c(g, .025, type === 2 ? .48 : .3, m.gun, 0, .015, barrelZ + .1);
    this.c(g, .037, .1, m.dark, 0, .015, barrelZ - .07);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this.b(g, .008, .025, .014, m.edge, s * .035, .015, barrelZ - .1 + i * .028);
    if (type === 1) {
      this.c(g, .032, .56, m.gun, 0, -.065, -.39);
      const pump = this.b(g, .14, .12, .23, m.poly, 0, -.055, -.37, true);
      for (let i = 0; i < 8; i++) this.b(g, .145, .125, .009, m.dark, 0, -.055, -.47 + i * .027);
      g.userData.pump = pump;
      for (let i = 0; i < 4; i++) { this.c(g, .021, .09, m.red, -.09, -.015, .02 + i * .047, 'y'); this.c(g, .023, .022, m.brass, -.09, -.065, .02 + i * .047, 'y'); }
    }
    if (type === 2) {
      // Precision optic: paired mounts, adjustment turrets, coated objective lens.
      for (const z of [-.2, .04]) { this.b(g, .075, .075, .045, m.dark, 0, .18, z); this.c(g, .055, .035, m.edge, 0, .245, z); }
      this.c(g, .044, .34, m.dark, 0, .245, -.075); this.c(g, .071, .12, m.gun, 0, .245, -.27); this.c(g, .061, .08, m.gun, 0, .245, .11);
      this.c(g, .06, .006, m.glass, 0, .245, -.333); this.c(g, .052, .006, m.glass, 0, .245, .153);
      this.c(g, .035, .05, m.edge, 0, .305, -.045, 'y'); this.c(g, .03, .04, m.edge, .06, .245, -.045, 'x');
      for (const s of [-1, 1]) { this.b(g, .018, .018, .23, m.dark, s * .11, -.1, -.43).rotation.x = s * .12; this.c(g, .022, .03, m.edge, s * .11, -.12, -.54, 'x'); }
    } else {
      // Open reflex sight with lens, front post and backup iron sights.
      this.b(g, .1, .035, .11, m.dark, 0, .17, .035, true);
      for (const s of [-1, 1]) this.b(g, .017, .09, .055, m.edge, s * .047, .22, .035, true);
      this.b(g, .11, .018, .055, m.edge, 0, .266, .035, true);
      this.b(g, .077, .069, .006, m.glass, 0, .224, .035);
      this.b(g, .008, .008, .008, accent, 0, .224, .039);
      this.b(g, .018, .075, .025, m.dark, 0, .15, -.51); this.b(g, .07, .018, .035, m.edge, 0, .115, -.51);
    }
    this.c(g, .029, .09, m.dark, .095, .015, -.38, 'x');
    this.b(g, .05, .055, .11, m.poly, .1, -.025, -.38, true); this.b(g, .008, .02, .025, accent, .128, -.025, -.415);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, .015, barrelZ - .135); g.add(muzzle);
    const flash = new THREE.Group(); muzzle.add(flash); flash.visible = false;
    const cone = this.part(flash, geo('flashcone', () => new THREE.ConeGeometry(.075, .25, 5)), m.flash, 0, 0, -.09, -Math.PI / 2);
    this.part(flash, geo('flashcone2', () => new THREE.ConeGeometry(.04, .34, 4)), m.flash, 0, 0, -.12, -Math.PI / 2, 0, Math.PI / 4);
    if (detailed) { const light = new THREE.PointLight(0xffbe65, 0, 3); flash.add(light); flash.userData.light = light; }
    g.userData = { ...g.userData, mag, bolt, muzzle, flash, type, magY: mag.position.y, boltZ: bolt.position.z, cone };
    this.mergeStatic(g, new Set([mag, bolt]));
    return g;
  }
  bot(team, name) {
    const root = new THREE.Group(), m = this.m, tm = this.teamMats[team];
    const torso = new THREE.Group(); torso.position.y = 1.08; root.add(torso);
    const armor = m.armor.clone();
    this.b(torso, .48, .54, .29, m.cloth, 0, .15, 0, true);
    this.b(torso, .46, .36, .12, armor, 0, .22, -.16, true);
    this.b(torso, .36, .12, .08, tm, 0, .38, -.225, true);
    this.b(torso, .38, .36, .09, m.poly, 0, .22, .17, true);
    this.b(torso, .28, .3, .16, m.tan, 0, .2, .27, true);
    this.b(torso, .035, .46, .035, m.dark, .17, .5, .24);
    this.b(torso, .06, .09, .06, tm, .17, .76, .24, true);
    for (const x of [-.15, 0, .15]) { this.b(torso, .12, .17, .095, m.tan, x, .04, -.235, true); this.b(torso, .105, .035, .1, m.poly, x, .11, -.242, true); }
    this.b(torso, .49, .075, .34, m.dark, 0, -.14, 0, true);
    this.b(torso, .09, .065, .035, m.edge, 0, -.14, -.19, true);
    this.c(torso, .075, .12, m.cloth, 0, .52, 0, 'y');
    const head = new THREE.Group(); head.position.set(0, .65, 0); torso.add(head);
    this.b(head, .29, .31, .29, m.cloth, 0, 0, 0, true);
    this.b(head, .34, .22, .34, armor, 0, .105, .005, true);
    this.b(head, .3, .105, .055, m.visor, 0, .035, -.17, true);
    this.b(head, .22, .11, .08, m.poly, 0, -.08, -.15, true);
    for (const s of [-1, 1]) { this.c(head, .065, .055, m.dark, s * .17, .01, 0, 'x'); this.b(head, .04, .055, .11, tm, s * .177, .1, .015, true); this.c(head, .035, .04, m.edge, s * .075, -.085, -.202); }
    this.b(head, .075, .055, .09, m.dark, 0, .23, -.075, true);
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * .145, .94, 0); root.add(leg); legs.push(leg);
      this.b(leg, .19, .39, .22, m.cloth, 0, -.19, 0, true); this.b(leg, .17, .23, .075, armor, 0, -.18, -.12, true);
      this.b(leg, .18, .13, .1, m.poly, 0, -.4, -.12, true);
      this.b(leg, .16, .34, .18, m.cloth, 0, -.59, .015, true); this.b(leg, .145, .22, .065, armor, 0, -.58, -.1, true);
      this.b(leg, .19, .15, .31, m.dark, 0, -.84, -.055, true); this.b(leg, .195, .045, .32, m.poly, 0, -.915, -.055, true);
      const arm = new THREE.Group(); arm.position.set(s * .3, .36, 0); torso.add(arm); arms.push(arm);
      this.b(arm, .2, .18, .23, armor, 0, -.025, 0, true); this.b(arm, .205, .07, .24, tm, 0, .025, 0, true);
      this.b(arm, .145, .26, .16, m.cloth, 0, -.2, -.035, true).rotation.x = -.65;
      this.b(arm, .14, .15, .27, m.cloth, 0, -.31, -.18, true);
      this.b(arm, .13, .12, .13, m.poly, 0, -.31, -.35, true);
    }
    const gun = this.weapon(0, team, false); gun.scale.setScalar(.82); gun.position.set(.16, 1.19, -.38); root.add(gun);
    const marker = new THREE.Group(); marker.position.y = 2.2; root.add(marker);
    const tri = this.part(marker, geo('marker', () => new THREE.ConeGeometry(.09, .14, 3)), this.markerMats[team], 0, 0, 0, 0, 0, Math.PI); tri.castShadow = false;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(name.toUpperCase(), '', team ? '#ffb494' : '#b1fff0', '#17343bdd', 256, 64), transparent: true, depthTest: false, depthWrite: false })); label.scale.set(1.15, .29, 1); label.position.y = .24; marker.add(label);
    const shadow = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(.55, 20)), this.shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .025; root.add(shadow);
    this.mergeStatic(torso); this.mergeStatic(head); for (const l of legs) this.mergeStatic(l); for (const a of arms) this.mergeStatic(a);
    return { root, torso, head, legs, arms, gun, marker, shadow, armor, team, name };
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene; this.budget = 1; this.tracers = Array.from({ length: 80 }, () => ({ life: 0, max: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), color: new THREE.Color() }));
    this.tgeo = new THREE.BufferGeometry(); this.tpos = new Float32Array(80 * 6); this.tcol = new Float32Array(80 * 6); this.tgeo.setAttribute('position', new THREE.BufferAttribute(this.tpos, 3)); this.tgeo.setAttribute('color', new THREE.BufferAttribute(this.tcol, 3));
    this.tmesh = new THREE.LineSegments(this.tgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.tmesh.frustumCulled = false; scene.add(this.tmesh); this.ti = 0;
    this.particles = Array.from({ length: 180 }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: .04, color: new THREE.Color(), gravity: 9 }));
    this.pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 180); this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pmesh.frustumCulled = false; scene.add(this.pmesh); this.pi = 0; this.dummy = new THREE.Object3D();
    this.flashes = Array.from({ length: 8 }, () => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc477, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); mesh.visible = false; scene.add(mesh); return { mesh, life: 0, size: 1 }; }); this.fi = 0;
    const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'), grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); grad.addColorStop(0, 'rgba(160,170,158,.55)'); grad.addColorStop(1, 'rgba(100,115,109,0)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    this.smoke = Array.from({ length: 24 }, () => { const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false })); mesh.visible = false; scene.add(mesh); return { mesh, life: 0 }; }); this.si = 0;
    this.update(0);
  }
  tracer(a, b, color = 0xffe1a0) { const t = this.tracers[this.ti++ % 80]; t.a.copy(a); t.b.copy(b); t.life = t.max = .075; t.color.set(color); }
  burst(p, color = 0xffc67d, count = 8, force = 3, life = .45, size = .045, gravity = 9) { count = Math.max(1, Math.round(count * this.budget)); for (let i = 0; i < count; i++) { const q = this.particles[this.pi++ % 180]; q.pos.copy(p); q.vel.set((Math.random() - .5) * force, Math.random() * force, (Math.random() - .5) * force); q.life = life * (.6 + Math.random() * .6); q.max = q.life; q.color.set(color); q.size = size * (.5 + Math.random()); q.gravity = gravity; } }
  explosion(p, size = 5) { const f = this.flashes[this.fi++ % 8]; f.mesh.position.copy(p); f.mesh.visible = true; f.life = .4; f.size = size; this.burst(p, 0xffb352, 45, 13, 1.1, .12); for (let i = 0, n = Math.max(2, Math.round(7 * this.budget)); i < n; i++) { const s = this.smoke[this.si++ % 24]; s.life = 1.8 + Math.random(); s.max = s.life; s.mesh.position.copy(p).add(new THREE.Vector3((Math.random() - .5) * 2, Math.random(), (Math.random() - .5) * 2)); s.mesh.visible = true; } }
  update(dt) {
    this.tracers.forEach((t, i) => { t.life -= dt; const k = Math.max(0, t.life / t.max); t.a.toArray(this.tpos, i * 6); (k ? t.b : t.a).toArray(this.tpos, i * 6 + 3); this.tcol.set([t.color.r * k * 2, t.color.g * k * 2, t.color.b * k * 2, t.color.r * k, t.color.g * k, t.color.b * k], i * 6); }); this.tgeo.attributes.position.needsUpdate = true; this.tgeo.attributes.color.needsUpdate = true;
    this.particles.forEach((p, i) => { p.life -= dt; if (p.life > 0) { p.vel.y -= p.gravity * dt; p.pos.addScaledVector(p.vel, dt); if (p.pos.y < .03) { p.pos.y = .03; p.vel.y *= -.35; p.vel.x *= .8; p.vel.z *= .8; } this.dummy.position.copy(p.pos); this.dummy.scale.setScalar(p.size * Math.min(1, p.life * 5)); this.dummy.rotation.set(p.life * 5, p.life * 3, 0); } else this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.pmesh.setMatrixAt(i, this.dummy.matrix); this.pmesh.setColorAt(i, p.color); }); this.pmesh.instanceMatrix.needsUpdate = true; if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;
    for (const f of this.flashes) { f.life -= dt; f.mesh.visible = f.life > 0; if (f.life > 0) { f.mesh.scale.setScalar(f.size * (1 - f.life / .4) * .7 + .2); f.mesh.material.opacity = f.life / .4 * .65; } }
    for (const s of this.smoke) { s.life -= dt; s.mesh.visible = s.life > 0; if (s.life > 0) { s.mesh.position.y += dt * .7; s.mesh.scale.setScalar(2 + (s.max - s.life) * 2); s.mesh.material.opacity = Math.min(.6, s.life / s.max); } }
  }
  clear() { for (const p of this.particles) p.life = 0; for (const t of this.tracers) t.life = 0; for (const f of this.flashes) f.life = 0; for (const s of this.smoke) s.life = 0; this.update(0); }
}
