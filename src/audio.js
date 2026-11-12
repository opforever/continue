export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.master = null; this.noise = null; this.lastStep = 0; }
  init() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .38; this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const wind = this.ctx.createBufferSource(); wind.buffer = this.noise; wind.loop = true; const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 240; const gain = this.ctx.createGain(); gain.gain.value = .055; wind.connect(filter); filter.connect(gain); gain.connect(this.master); wind.start(); this.wind = wind;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .38, this.ctx.currentTime, .03); return this.muted; }
  tone(freq, duration, volume = .2, type = 'sine', end = freq, delay = 0) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .02); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  hiss(duration, volume, freq = 1800, pan = 0) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), p = this.ctx.createStereoPanner(); s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = freq; p.pan.value = Math.max(-1, Math.min(1, pan)); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration); s.connect(f); f.connect(g); g.connect(p); p.connect(this.master); s.start(t, Math.random()); s.stop(t + duration + .02); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); };
  }
  shot(type, distance = 0, pan = 0, enemy = false) { const v = 1 / (1 + distance * .09); this.hiss(type === 1 ? .24 : .13, v * (type === 2 ? .8 : .55), enemy ? 1500 : 2700, pan); this.tone(type === 1 ? 105 : 160, .13, v * .5, 'triangle', 38); if (!distance) this.hiss(.035, .22, 6500); }
  reload() { this.hiss(.08, .22, 3200); this.tone(450, .05, .09, 'square', 220); }
  hit(kill = false, head = false) { this.tone(kill ? 760 : head ? 1300 : 950, kill ? .18 : .065, .2, 'sine', kill ? 1400 : 650); if (kill) this.tone(1140, .2, .12, 'sine', 1600, .08); }
  hurt() { this.hiss(.15, .35, 600); this.tone(80, .16, .3, 'triangle', 35); }
  step(sprint = false) { this.hiss(.075, sprint ? .16 : .09, 750); this.tone(90, .055, .06, 'sine', 45); }
  explosion(distance = 0) { const v = 1 / (1 + distance * .05); this.hiss(.8, v * 1.2, 900); this.tone(90, .65, v, 'sine', 22); }
  pickup() { this.tone(550, .1, .15); this.tone(820, .16, .15, 'sine', 1100, .09); }
  click() { this.tone(650, .045, .1, 'triangle', 900); }
  empty() { this.tone(180, .04, .1, 'square', 100); }
  victory(win) { [0, 1, 2, 3].forEach(i => this.tone((win ? [440, 550, 660, 880] : [440, 370, 330, 220])[i], .4, .16, 'triangle', undefined, i * .15)); }
}
