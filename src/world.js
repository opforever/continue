import * as THREE from 'three';

const V = THREE.Vector3;
export const TEAM = [0x65e5df, 0xff8051];
export const clamp = THREE.MathUtils.clamp;
export function seeded(seed = 71) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
export function textTexture(text, sub = '', color = '#dce9e5', bg = '#16343b', w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = color; x.lineWidth = 5; x.strokeRect(14, 14, w - 28, h - 28);
  x.fillStyle = color; x.font = `800 ${sub ? 92 : 116}px "Barlow Condensed", sans-serif`; x.textAlign = 'center'; x.fillText(text, w / 2, sub ? 137 : 165);
  if (sub) { x.font = '500 25px "IBM Plex Sans", sans-serif'; x.fillText(sub, w / 2, 198); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function asphalt() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); const rand = seeded(8);
  x.fillStyle = '#65716e'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 36000; i++) { const v = 65 + rand() * 90; x.fillStyle = `rgba(${v},${v + 6},${v + 3},.24)`; x.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3); }
  x.strokeStyle = '#465451'; x.lineWidth = 2; x.strokeRect(1, 1, 510, 510);
  for (let i = 0; i < 7; i++) { let a = rand() * 512, b = rand() * 512; x.beginPath(); x.moveTo(a, b); for (let j = 0; j < 5; j++) { a += rand() * 24 - 12; b += rand() * 20; x.lineTo(a, b); } x.lineWidth = .7; x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export class World {
  constructor(scene) {
    this.scene = scene; this.colliders = []; this.barrels = []; this.pickups = []; this.rotors = []; this.rand = seeded();
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1); this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12); this.sphereGeo = new THREE.SphereGeometry(1, 12, 8);
    this.batches = new Map(); this.matrix = new THREE.Matrix4(); this.dummy = new THREE.Object3D();
    const mat = (color, roughness = .8, metalness = .1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.m = { concrete: mat(0x8b9690), dark: mat(0x263e43, .65, .5), steel: mat(0x617b7c, .48, .65), teal: mat(0x287b7c, .68, .35), orange: mat(0xc96537, .7, .3), yellow: mat(0xe5b858, .7, .3), black: mat(0x182a2d), white: mat(0xc4d0c4), rubber: mat(0x25302d), wood: mat(0x8a7958), red: mat(0xa74435, .65, .4), blue: mat(0x3c858b), glass: new THREE.MeshStandardMaterial({ color: 0x81c9cf, metalness: .65, roughness: .18 }), glow: new THREE.MeshStandardMaterial({ color: 0xbfffea, emissive: 0x69e8d2, emissiveIntensity: 2 }), amber: new THREE.MeshStandardMaterial({ color: 0xffd18a, emissive: 0xffa64d, emissiveIntensity: 2 }) };
    this.build(); this.batch(); this.buildNav();
  }
  box(x, y, z, w, h, d, mat = this.m.concrete, solid = false, ry = 0) {
    const key = 'b' + mat.uuid; if (!this.batches.has(key)) this.batches.set(key, { geo: this.boxGeo, mat, items: [] });
    this.batches.get(key).items.push([x, y, z, w, h, d, ry]);
    if (solid) this.addCollider(x, y, z, w, h, d);
    return this;
  }
  cyl(x, y, z, r, h, mat = this.m.steel, solid = false, rz = 0) {
    const key = 'c' + mat.uuid; if (!this.batches.has(key)) this.batches.set(key, { geo: this.cylGeo, mat, items: [] });
    this.batches.get(key).items.push([x, y, z, r, h, r, rz]);
    if (solid) this.addCollider(x, y, z, r * 2, h, r * 2);
  }
  addCollider(x, y, z, w, h, d, extra = {}) {
    const c = { min: new V(x - w / 2, y - h / 2, z - d / 2), max: new V(x + w / 2, y + h / 2, z + d / 2), active: true, ...extra }; this.colliders.push(c); return c;
  }
  mesh(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = this.scene) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  sign(text, sub, x, y, z, w, h, color, bg, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: textTexture(text, sub, color, bg), roughness: .85, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m;
  }
  container(x, z, w, d, mat, label) {
    const h = 3.15; this.box(x, h / 2, z, w, h, d, mat, true);
    this.box(x, h + .06, z, w + .12, .13, d + .12, this.m.steel);
    for (const s of [-1, 1]) {
      this.box(x + s * (w / 2 - .07), h / 2, z, .14, h + .1, d + .12, this.m.steel);
      for (let k = -d / 2 + .35; k < d / 2; k += .48) this.box(x + s * (w / 2 + .015), h / 2, z + k, .07, h - .25, .09, mat);
      this.box(x, h / 2, z + s * (d / 2 + .025), w - .2, h - .18, .06, mat);
      this.box(x, h / 2, z + s * (d / 2 + .07), .06, h - .15, .05, this.m.steel);
      for (const a of [-1, 1]) { this.cyl(x + a * w * .24, h / 2, z + s * (d / 2 + .1), .035, h - .3, this.m.steel); this.box(x + a * w * .24, 1.2, z + s * (d / 2 + .14), .25, .07, .08, this.m.black); }
    }
    for (let k = -w / 2 + .35; k < w / 2; k += .5) this.box(x + k, h + .14, z, .07, .05, d - .1, this.m.steel);
    this.sign(label, 'FREIGHT / 40 FT / MAX 30,480 KG', x, 1.85, z + d / 2 + .12, Math.min(w - .5, 3), 1.25, '#d7e5d8', mat === this.m.teal ? '#246267' : '#994d30');
  }
  crate(x, z, w = 2.5, d = 2.3, h = 1.5) {
    this.box(x, h / 2, z, w, h, d, this.m.wood, true);
    for (const s of [-1, 1]) { this.box(x + s * (w / 2 - .1), h / 2, z, .16, h + .06, d + .08, this.m.dark); this.box(x, h / 2, z + s * (d / 2 - .08), w + .08, h + .06, .16, this.m.dark); }
    this.box(x, h + .04, z, w + .08, .12, d + .08, this.m.wood);
    this.box(x, h * .65, z + d / 2 + .015, .65, .32, .025, this.m.white);
    for (let i = 0; i < 4; i++) this.box(x - .22 + i * .14, h * .65, z + d / 2 + .035, .045, .23, .012, this.m.black);
  }
  barrier(x, z, w = 4.5) {
    this.box(x, .2, z, w, .4, 1.15, this.m.concrete, true); this.box(x, .78, z, w - .25, .8, .65, this.m.concrete, true);
    for (let i = -w / 2 + .3; i < w / 2; i += .75) { const b = this.box(x + i, .83, z + .335, .35, .48, .025, this.m.yellow); this.batches.get('b' + this.m.yellow.uuid).items.at(-1)[6] = -.3; }
    for (const s of [-1, 1]) this.box(x + s * (w / 2 - .35), 1.23, z, .13, .16, .15, this.m.steel);
  }
  barrel(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    this.mesh(this.cylGeo, this.m.red, 0, .64, 0, .43, 1.28, .43, g);
    for (const y of [.12, .4, .91, 1.2]) this.mesh(this.cylGeo, this.m.dark, 0, y, 0, .455, .055, .455, g);
    this.mesh(this.boxGeo, this.m.yellow, 0, .7, .426, .32, .32, .015, g).rotation.z = Math.PI / 4;
    const c = this.addCollider(x, .64, z, .88, 1.28, .88, { kind: 'barrel' }); const b = { mesh: g, collider: c, hp: 48, x, z, active: true }; c.barrel = b; this.barrels.push(b);
  }
  forklift(x, z, flip = 1) {
    this.box(x, .65, z, 1.7, .8, 2.5, this.m.yellow, true); this.box(x, 1.05, z + .6 * flip, 1.65, .6, 1.1, this.m.orange);
    this.box(x, 1.2, z - .3 * flip, .75, .2, .65, this.m.rubber); this.box(x, 1.55, z, .7, .7, .16, this.m.rubber);
    for (const a of [-1, 1]) { for (const b of [-1, 1]) { this.cyl(x + a * .86, .4, z + b * .8, .4, .23, this.m.rubber, false, Math.PI / 2); this.box(x + a * .72, 1.65, z + b * .8, .09, 2, .09, this.m.dark); }
      this.box(x + a * .53, 1.4, z - 1.4 * flip, .14, 2.8, .16, this.m.dark); this.box(x + a * .53, .16, z - 1.95 * flip, .2, .12, 1.2, this.m.steel); }
    this.box(x, 2.7, z, 1.8, .16, 2, this.m.yellow); this.box(x, .75, z - 1.38 * flip, 1.3, .3, .2, this.m.dark);
    this.addCollider(x, 1.4, z, 1.8, 2.8, 2.8);
  }
  build() {
    const s = this.scene, m = this.m;
    s.background = new THREE.Color(0x9aafa9); s.fog = new THREE.FogExp2(0x9aafa9, .009);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(0x345b69) }, bottom: { value: new THREE.Color(0xe5c39c) } }, vertexShader: 'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vP;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(vP).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.08,.75,h)),1.);}' })); s.add(sky);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe1ad, fog: false })); sun.position.set(-100, 62, -150); s.add(sun);
    s.add(new THREE.HemisphereLight(0xc4e7ed, 0x74634b, 2.2));
    const light = new THREE.DirectionalLight(0xffdfb2, 3.3); light.position.set(-35, 55, -28); light.castShadow = true; light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -48, right: 48, top: 45, bottom: -45, near: 1, far: 140 }); light.shadow.bias = -.00035; light.shadow.normalBias = .04; light.shadow.radius = 3; s.add(light); this.sun = light;
    const fill = new THREE.DirectionalLight(0x79c9de, .7); fill.position.set(20, 15, 30); s.add(fill);
    const groundMat = new THREE.MeshStandardMaterial({ map: asphalt(), roughness: .96 }); this.box(0, -.25, 0, 68, .5, 58, groundMat);
    this.box(0, -.65, 0, 73, .8, 63, m.concrete);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3c737c, metalness: .55, roughness: .3 })); water.rotation.x = -Math.PI / 2; water.position.y = -1.3; s.add(water); this.water = water;
    for (const side of [-1, 1]) {
      this.box(side * 33, 1, 0, .6, 2, 56, m.concrete, true); this.box(0, 1, side * 28, 66, 2, .6, m.concrete, true);
      this.box(side * 33, 2.08, 0, .75, .15, 56, m.steel);
      for (let z = -27; z <= 27; z += 4) { this.box(side * 33, 2.8, z, .07, 1.5, .07, m.steel); this.box(0, 2.8, side * 28, .07, 1.5, .07, m.steel); }
      for (const y of [2.5, 3.4]) { this.box(side * 33, y, 0, .045, .045, 56, m.steel); this.box(0, y, side * 28, 66, .045, .045, m.steel); }
      for (let z = -24; z < 26; z += 4) { this.box(side * 16, .012, z, .12, .018, 2, m.yellow); this.box(side * 30.7, .014, z, .13, .02, 2.8, m.white); }
      for (let x = -30; x < 32; x += 4) this.box(x, 1, side * 27.67, .16, 2, .08, m.dark);
      for (const x of [-29, 29]) { this.box(x, .02, side * 22, 10, .025, 7, side > 0 ? m.blue : m.orange); this.box(x, .04, side * 18.5, 10, .025, .16, m.white); }
      this.sign(side > 0 ? 'SPECTRE' : 'EMBER', side > 0 ? 'INSERTION ZONE / 01' : 'INSERTION ZONE / 02', 0, 2.1, side * 27.64, 6, 1.5, side > 0 ? '#9ef9e7' : '#ffc19b', '#203d42', side > 0 ? Math.PI : 0);
    }
    // Open-ended turbine hall: four entrances, a solid central generator, and flanking cover.
    for (const side of [-1, 1]) for (const z of [-3.65, 3.65]) {
      this.box(side * 5.8, 2.25, z, .65, 4.5, 3.3, m.concrete, true);
      this.box(side * 5.8, .6, z, .76, 1.2, 3.35, m.dark);
      this.box(side * 5.8, 4.2, z, .78, .25, 3.4, m.orange);
    }
    for (const z of [-5.2, 5.2]) { this.box(0, 4.55, z, 12.8, .65, .8, m.dark, true); this.box(0, 4.12, z, 12, .13, .85, m.orange); }
    this.box(0, 4.95, 0, 13.1, .3, 11.3, m.teal); this.addCollider(0, 4.95, 0, 13.1, .3, 11.3);
    for (let x = -6; x <= 6; x += .55) this.box(x, 5.14, 0, .075, .1, 11.2, m.steel);
    this.box(0, 1.2, 0, 3.2, 2.4, 3.2, m.dark, true); this.box(0, 2.45, 0, 3.5, .2, 3.5, m.orange);
    this.cyl(0, 2.85, 0, 1.15, .7, m.steel); this.cyl(0, 3.25, 0, .75, .2, m.dark);
    for (const z of [-1.63, 1.63]) { for (let x = -1; x <= 1; x += .4) this.box(x, 1.3, z, .14, 1.35, .05, m.steel); this.box(0, 2.08, z, 1.6, .08, .06, m.glow); }
    this.sign('DRYDOCK 07', 'TURBINE HALL / RESTRICTED', 0, 4.52, 5.63, 7, .85, '#f1d4a1', '#20383c');
    this.sign('07', 'POWER SYSTEMS', 0, 4.52, -5.63, 7, .85, '#f1d4a1', '#20383c', Math.PI);
    for (const x of [-3.8, 3.8]) { this.cyl(x, 4.1, 0, .07, 9, m.steel); this.box(x, 3.95, 0, .3, .12, 8, m.dark); for (const z of [-3, 3]) this.box(x, 3.85, z, .7, .1, .3, m.glow); }
    this.container(-21, -9, 5, 10, m.teal, 'NORTH / 21'); this.container(21, 9, 5, 10, m.teal, 'SOUTH / 14');
    this.container(-23, 7, 7, 4, m.orange, 'CARGO'); this.container(23, -7, 7, 4, m.orange, 'CARGO');
    this.container(-12, -18, 8, 4, m.orange, 'E-09'); this.container(12, 18, 8, 4, m.teal, 'S-04');
    for (const [x, z] of [[-12, 1], [12, -1], [-8, 11], [8, -11], [16, -17], [-16, 17]]) { this.crate(x, z); this.crate(x + .25, z + .1, 1.5, 1.4, 2.45); }
    // The stacked small crate sits on the first; its footprint remains covered by navigation.
    for (const [x, z, w] of [[-12, -7, 5], [12, 7, 5], [-4, -14, 4], [4, 14, 4], [0, 22, 3.5], [0, -22, 3.5], [-27, -1, 3], [27, 1, 3]]) this.barrier(x, z, w);
    for (const [x, z] of [[-9, -12], [9, 12], [-26, 2], [26, -2]]) { this.barrel(x, z); this.barrel(x + .95, z + .15); }
    this.forklift(-27, 18); this.forklift(27, -18, -1);
    // Gantry crane, suspended hook, service pipes, electrical cabinets and utility details.
    for (const x of [-29, 29]) { this.box(x, 6, -16, .8, 12, .85, m.yellow, true); this.box(x, .4, -16, 2.2, .8, 2.4, m.dark, true); this.box(x, 11.2, -16, 2, .45, 1.5, m.dark); for (let y = 1; y < 11; y += .45) this.box(x - .45 * Math.sign(x), y, -15.5, .12, .06, .65, m.steel); }
    this.box(0, 12, -16, 60, 1.1, 1.1, m.yellow); this.box(0, 12.65, -16, 60, .15, 1.5, m.dark);
    for (let x = -28; x < 29; x += 4) this.box(x, 12, -15.42, .12, 1.2, .06, m.dark);
    this.box(8, 11.3, -16, 3, 1.1, 2, m.dark); this.cyl(8, 8.5, -16, .035, 5, m.black); this.box(8, 6, -16, .65, .8, .6, m.yellow);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.32, .08, 8, 14, Math.PI * 1.5), m.steel); hook.position.set(8, 5.5, -16); s.add(hook);
    for (let z = -22; z < 24; z += 7) { this.box(-31.6, .8, z, 1.2, 1.6, 1.4, m.dark, true); this.box(-30.97, 1, z, .035, .65, .8, m.steel); this.box(-30.94, 1.3, z + .2, .04, .09, .12, m.glow); }
    for (const y of [3.6, 4.1]) this.cyl(-31.5, y, 0, .14, 51, m.steel, false, Math.PI / 2);
    for (const [x, z] of [[-30, -25], [30, 25], [-30, 25], [30, -25]]) {
      this.cyl(x, 4.5, z, .11, 9, m.steel, true); this.box(x, 9, z, 2.7, .15, .5, m.dark);
      for (const a of [-.9, 0, .9]) { this.box(x + a, 8.85, z, .65, .45, .4, m.dark); this.box(x + a, 8.85, z + .22 * Math.sign(z), .52, .32, .04, m.amber); }
    }
    // Distant port silhouette, deliberately outside the playable collision boundary.
    for (let i = 0; i < 24; i++) { const x = -130 + i * 11, h = 5 + this.rand() * 19, z = -65 - this.rand() * 35; this.box(x, h / 2 - 1, z, 7 + this.rand() * 8, h, 12, i % 3 ? m.steel : m.dark); if (i % 3 === 0) this.cyl(x, h + 5, z, .7, 12, m.dark); }
    for (const x of [-62, 58]) { for (const z of [-40, 20]) this.box(x, 12, z, 1.4, 26, 1.4, m.dark); this.box(x, 25, -10, 1.6, 1.5, 65, m.dark); this.box(x - 8, 24.5, -10, 18, .7, 1.1, m.dark); this.cyl(x - 15, 16, -10, .04, 16, m.dark); }
    this.addPickup(-28, 0, 'health'); this.addPickup(28, 0, 'health'); this.addPickup(0, 18, 'ammo'); this.addPickup(0, -18, 'ammo');
    this.spawnPoints = [[new V(-10, 0, 23), new V(-3, 0, 24), new V(5, 0, 24), new V(13, 0, 23)], [new V(10, 0, -23), new V(3, 0, -24), new V(-5, 0, -24), new V(-13, 0, -23)]];
  }
  addPickup(x, z, type) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g); const mat = type === 'health' ? this.m.glow : this.m.amber;
    this.box(x, .12, z, 1.4, .24, 1.4, this.m.dark);
    const icon = new THREE.Group(); icon.position.y = .9; g.add(icon);
    if (type === 'health') { this.mesh(this.boxGeo, this.m.white, 0, 0, 0, .65, .5, .4, icon); this.mesh(this.boxGeo, mat, 0, 0, .21, .12, .34, .025, icon); this.mesh(this.boxGeo, mat, 0, 0, .22, .34, .12, .025, icon); }
    else { this.mesh(this.boxGeo, this.m.dark, 0, 0, 0, .65, .45, .4, icon); for (const a of [-.2, 0, .2]) this.mesh(this.cylGeo, mat, a, .03, .22, .055, .3, .055, icon); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.8, .025, 6, 32), mat); ring.rotation.x = Math.PI / 2; ring.position.y = .26; g.add(ring);
    this.pickups.push({ x, z, type, group: g, icon, ring, cooldown: 0 });
  }
  batch() {
    for (const { geo, mat, items } of this.batches.values()) { const inst = new THREE.InstancedMesh(geo, mat, items.length); items.forEach((a, i) => { this.dummy.position.set(a[0], a[1], a[2]); this.dummy.scale.set(a[3], a[4], a[5]); this.dummy.rotation.set(0, a[6] || 0, 0); if (geo === this.cylGeo) this.dummy.rotation.z = a[6] || 0; this.dummy.updateMatrix(); inst.setMatrixAt(i, this.dummy.matrix); }); inst.castShadow = true; inst.receiveShadow = true; inst.computeBoundingSphere(); this.scene.add(inst); }
    this.batches.clear();
  }
  buildNav() {
    this.cell = 1; this.nx = 65; this.nz = 55; this.ox = -32; this.oz = -27;
    this.nav = new Uint8Array(this.nx * this.nz);
    for (let z = 0; z < this.nz; z++) for (let x = 0; x < this.nx; x++) { const p = this.point(x, z); this.nav[z * this.nx + x] = this.free(p.x, p.z, .57, 0, 1.9) ? 1 : 0; }
  }
  point(i, z) { return { x: this.ox + i, z: this.oz + z }; }
  index(x, z) { return clamp(Math.round(z - this.oz), 0, this.nz - 1) * this.nx + clamp(Math.round(x - this.ox), 0, this.nx - 1); }
  free(x, z, r = .4, y = 0, h = 1.8) {
    if (x < -32.2 + r || x > 32.2 - r || z < -27.2 + r || z > 27.2 - r) return false;
    for (const c of this.colliders) if (c.active && c.min.y < y + h && c.max.y > y + .25 && x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return false;
    return true;
  }
  move(pos, dx, dz, r = .38, h = 1.8) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .22));
    for (let k = 0; k < steps; k++) {
      pos.x += dx / steps;
      for (const c of this.colliders) if (c.active && c.min.y < pos.y + h && c.max.y > pos.y + .25 && pos.z + r > c.min.z && pos.z - r < c.max.z && pos.x + r > c.min.x && pos.x - r < c.max.x) pos.x = dx > 0 ? c.min.x - r : c.max.x + r;
      pos.z += dz / steps;
      for (const c of this.colliders) if (c.active && c.min.y < pos.y + h && c.max.y > pos.y + .25 && pos.x + r > c.min.x && pos.x - r < c.max.x && pos.z + r > c.min.z && pos.z - r < c.max.z) pos.z = dz > 0 ? c.min.z - r : c.max.z + r;
      pos.x = clamp(pos.x, -32.2 + r, 32.2 - r); pos.z = clamp(pos.z, -27.2 + r, 27.2 - r);
    }
  }
  support(pos, oldY, newY, r = .38) {
    let top = 0;
    for (const c of this.colliders) if (c.active && c.max.y <= oldY + .28 && c.max.y >= newY && pos.x + r * .7 > c.min.x && pos.x - r * .7 < c.max.x && pos.z + r * .7 > c.min.z && pos.z - r * .7 < c.max.z) top = Math.max(top, c.max.y);
    return top;
  }
  nearestFree(x, z) {
    let i = this.index(x, z); if (this.nav[i]) return i;
    const cx = i % this.nx, cz = Math.floor(i / this.nx);
    for (let r = 1; r < 10; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const nx = cx + dx, nz = cz + dz; if (nx >= 0 && nz >= 0 && nx < this.nx && nz < this.nz && this.nav[nz * this.nx + nx]) return nz * this.nx + nx; }
    return i;
  }
  path(start, goal) {
    const a = this.nearestFree(start.x, start.z), b = this.nearestFree(goal.x, goal.z); if (a === b) return [this.point(b % this.nx, Math.floor(b / this.nx))];
    const n = this.nav.length, cost = new Float32Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), closed = new Uint8Array(n), open = [a]; cost[a] = 0;
    const gx = b % this.nx, gz = Math.floor(b / this.nx); const heuristic = i => Math.hypot(i % this.nx - gx, Math.floor(i / this.nx) - gz);
    let loops = 0;
    while (open.length && loops++ < 4000) {
      let best = 0; for (let j = 1; j < open.length; j++) if (cost[open[j]] + heuristic(open[j]) < cost[open[best]] + heuristic(open[best])) best = j;
      const cur = open.splice(best, 1)[0]; if (cur === b) { const result = []; let p = b; while (p !== a && p >= 0) { result.push(this.point(p % this.nx, Math.floor(p / this.nx))); p = parent[p]; } return result.reverse(); }
      closed[cur] = 1; const x = cur % this.nx, z = Math.floor(cur / this.nx);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= this.nx || nz >= this.nz) continue; const ni = nz * this.nx + nx;
        if (!this.nav[ni] || closed[ni] || (dx && dz && (!this.nav[z * this.nx + nx] || !this.nav[nz * this.nx + x]))) continue;
        const g = cost[cur] + (dx && dz ? 1.414 : 1); if (g < cost[ni]) { cost[ni] = g; parent[ni] = cur; if (!open.includes(ni)) open.push(ni); }
      }
    }
    return [];
  }
  rayBox(o, d, c, max) {
    let lo = 0, hi = max, axis = -1, sign = 0;
    for (const k of ['x', 'y', 'z']) {
      if (Math.abs(d[k]) < 1e-8) { if (o[k] < c.min[k] || o[k] > c.max[k]) return null; continue; }
      const s = d[k] > 0 ? 1 : -1; let a = (c.min[k] - o[k]) / d[k], b = (c.max[k] - o[k]) / d[k]; if (a > b) [a, b] = [b, a];
      if (a > lo) { lo = a; axis = k; sign = -s; } hi = Math.min(hi, b); if (lo > hi) return null;
    }
    if (axis === null || axis < 0 || lo < .001) return null;
    const normal = new V(); normal[axis] = sign; return { t: lo, point: o.clone().addScaledVector(d, lo), normal, collider: c };
  }
  rayWorld(o, d, max = 120) { let best = null; for (const c of this.colliders) { if (!c.active) continue; const h = this.rayBox(o, d, c, best ? best.t : max); if (h && (!best || h.t < best.t)) best = h; } if (o.y + d.y * max < 0 && d.y < 0) { const t = -o.y / d.y; if (t > 0 && (!best || t < best.t)) best = { t, point: o.clone().addScaledVector(d, t), normal: new V(0, 1, 0), collider: null }; } return best; }
  visible(a, b) { const d = b.clone().sub(a), dist = d.length(); if (dist < .01) return true; d.divideScalar(dist); const h = this.rayWorld(a, d, dist); return !h || h.t > dist - .12; }
  update(dt, t) { for (const p of this.pickups) { p.cooldown = Math.max(0, p.cooldown - dt); p.icon.visible = p.cooldown <= 0; p.icon.position.y = .95 + Math.sin(t * 2 + p.x) * .12; p.icon.rotation.y = t * .6; p.ring.scale.setScalar(p.cooldown > 0 ? .65 : 1 + Math.sin(t * 3) * .04); } }
  reset() { for (const b of this.barrels) { b.active = true; b.hp = 48; b.mesh.visible = true; b.collider.active = true; } for (const p of this.pickups) p.cooldown = 0; }
}

export function raySphere(o, d, center, radius) {
  const v = center.clone().sub(o), p = v.dot(d), q = v.lengthSq() - p * p, r = radius * radius; if (q > r) return null; const h = Math.sqrt(r - q), t = p - h; if (t > .001) return t; const back = p + h; return back > .001 ? back : null;
}
