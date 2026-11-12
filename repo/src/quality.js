import * as THREE from 'three';

// Render quality tiers. The simulation is identical in every tier — only the
// cost of shading a frame changes (resolution, shadow filtering, particle budget).
export const TIERS = {
  high: { key: 'high', label: 'HIGH', pixelRatio: 1.75, shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, effects: 1, minScale: .6 },
  balanced: { key: 'balanced', label: 'BALANCED', pixelRatio: 1.35, shadowSize: 1024, shadowType: THREE.PCFShadowMap, effects: .8, minScale: .55 },
  performance: { key: 'performance', label: 'PERFORMANCE', pixelRatio: 1, shadowSize: 1024, shadowType: THREE.BasicShadowMap, effects: .55, minScale: .5 },
};
export const QUALITY_MODES = ['auto', 'high', 'balanced', 'performance'];
const SOFTWARE = /swiftshader|software|llvmpipe|basic render|mesa offscreen|angle \(google, vulkan.*swiftshader/i;

// Picks a starting tier from device hints, then (in AUTO) trims render resolution
// against measured frame time so weak GPUs stay responsive instead of stuttering.
export class Quality {
  constructor(renderer, scenes, sun, effects) {
    this.renderer = renderer; this.scenes = scenes; this.sun = sun; this.effects = effects;
    this.mode = 'auto'; this.scale = 1; this.ema = 1 / 60; this.cooldown = 1.5; this.fps = 60; this.frames = 0; this.acc = 0;
    this.software = false; this.reason = '';
    this.tier = TIERS.high;
    this.detect(); this.apply();
  }
  detect() {
    let name = '';
    try { const gl = this.renderer.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info'); if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''); } catch { /* extension blocked */ }
    this.gpu = name;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 8;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (SOFTWARE.test(name)) { this.software = true; this.tier = TIERS.performance; this.scale = .6; this.reason = 'software renderer'; }
    else if (coarse || cores <= 4 || mem <= 4) { this.tier = TIERS.balanced; this.reason = coarse ? 'touch device' : 'limited hardware'; }
    else { this.tier = TIERS.high; this.reason = 'desktop GPU'; }
    return this.tier;
  }
  setMode(mode) {
    if (!QUALITY_MODES.includes(mode)) return this.mode;
    this.mode = mode;
    if (mode === 'auto') { this.scale = 1; this.detect(); } else { this.tier = TIERS[mode]; this.scale = 1; this.reason = 'manual'; }
    this.ema = 1 / 60; this.cooldown = 1.5; this.apply();
    return this.mode;
  }
  pixelRatio() { return Math.max(.4, Math.min(this.tier.pixelRatio, window.devicePixelRatio || 1) * this.scale); }
  apply() {
    const t = this.tier, r = this.renderer;
    r.setPixelRatio(this.pixelRatio());
    if (this.sun) {
      if (this.sun.shadow.mapSize.width !== t.shadowSize) { this.sun.shadow.mapSize.set(t.shadowSize, t.shadowSize); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
      if (r.shadowMap.type !== t.shadowType) { r.shadowMap.type = t.shadowType; for (const s of this.scenes) s.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; for (const x of m) x.needsUpdate = true; } }); }
      r.shadowMap.needsUpdate = true;
    }
    if (this.effects) this.effects.budget = t.effects;
    // Full-screen grain is a compositor cost on weak devices; drop it in the cheap tier.
    if (typeof document !== 'undefined') document.body.classList.toggle('q-performance', t.key === 'performance');
    this.applied = { tier: t.key, ratio: +this.pixelRatio().toFixed(2), shadow: t.shadowSize };
  }
  // Called once per animation frame with the *unclamped* frame time.
  sample(raw) {
    if (!(raw > 0) || raw > 1) return; // ignore tab-switch stalls
    this.ema += (raw - this.ema) * .12;
    this.acc += raw; this.frames++;
    if (this.acc >= .5) { this.fps = this.frames / this.acc; this.acc = 0; this.frames = 0; }
    this.cooldown -= raw;
    if (this.mode !== 'auto' || this.cooldown > 0) return;
    const t = this.tier; let next = this.scale;
    if (this.ema > 1 / 42) next = Math.max(t.minScale, this.scale * .86);
    else if (this.ema < 1 / 58) next = Math.min(1, this.scale * 1.06);
    if (Math.abs(next - this.scale) > .03) { this.scale = next; this.cooldown = .9; this.apply(); this.onScale?.(this.pixelRatio()); }
    else this.cooldown = .35;
  }
  stats() { return { mode: this.mode, tier: this.tier.key, label: this.tier.label, fps: Math.round(this.fps), scale: +this.scale.toFixed(2), ratio: +this.pixelRatio().toFixed(2), reason: this.reason, software: this.software }; }
}
