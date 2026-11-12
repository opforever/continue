import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './style.css';
import { Game } from './game.js';
import { WEAPONS } from './models.js';

const $ = id => document.getElementById(id);
const show = (id, yes) => $(id).classList.toggle('hidden', !yes);
let game, selectedWeapon = 0, manualOpen = false, boardOpen = false, toastTimer, hitTimer, killTimer, lastFeedKey = '', lastHud;
const coarse = matchMedia('(pointer: coarse)').matches;
const refs = {};
// Persisted operator preferences (survive reloads; never block boot if storage is unavailable).
const STORE_KEY = 'breachline.settings.v1';
const settings = { sensitivity: 1, muted: false, quality: 'auto', difficulty: 'operator', weapon: 0 };
function loadSettings() { try { const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); for (const k of Object.keys(settings)) if (raw[k] !== undefined && typeof raw[k] === typeof settings[k]) settings[k] = raw[k]; } catch { /* private mode */ } settings.sensitivity = Math.min(2, Math.max(.4, settings.sensitivity || 1)); settings.weapon = [0, 1, 2].includes(settings.weapon) ? settings.weapon : 0; if (!['auto', 'high', 'balanced', 'performance'].includes(settings.quality)) settings.quality = 'auto'; if (!['recruit', 'operator', 'veteran'].includes(settings.difficulty)) settings.difficulty = 'operator'; }
function saveSettings() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* private mode */ } }
let perfTimer = null;
function updatePerf() {
  if (!game) return; const q = game.quality.stats(), info = game.renderer.info.render, el = $('perfReadout');
  el.classList.toggle('warn', q.fps < 40);
  el.innerHTML = `<i></i><b>${q.fps} FPS</b> ${q.label} · ${q.ratio.toFixed(2)}× RES · ${info.calls} DRAWS · ${Math.round(info.triangles / 1000)}K TRIS${q.mode === 'auto' ? ` · AUTO (${q.reason})` : ''}`;
}
function updateQuality(q) {
  document.querySelectorAll('[data-quality]').forEach(b => { const on = b.dataset.quality === q.mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  updatePerf();
}
for (const id of ['blueScore', 'orangeScore', 'blueBar', 'orangeBar', 'clock', 'overtime', 'hp', 'shield', 'hpBar', 'shieldBar', 'mag', 'reserve', 'weaponName', 'weaponType', 'fireMode', 'grenades', 'squadList', 'squadCount', 'stanceText', 'stanceIcon', 'reloadIndicator', 'reloadBar', 'interactPrompt', 'promptText', 'spawnShield', 'crosshair', 'bearing', 'respawnCount', 'damageVignette', 'damageArrow']) refs[id] = $(id);
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
function setState(state) {
  document.body.classList.remove('menu', 'playing', 'dead', 'paused', 'over'); document.body.classList.add(state);
  show('menu', state === 'menu'); show('hud', ['playing', 'dead', 'paused'].includes(state)); show('death', state === 'dead'); show('pause', state === 'paused'); show('results', state === 'over'); show('touch', coarse && state === 'playing');
  if (state !== 'playing') { show('scoreboard', false); boardOpen = false; }
  if (state === 'menu') { show('manual', false); manualOpen = false; }
  clearInterval(perfTimer); perfTimer = null;
  if (state === 'paused') { updatePerf(); perfTimer = setInterval(updatePerf, 500); }
}
function feedHTML(feed) { return feed.map(f => `<div class="feed-row"><span class="${f.team ? 'orange' : 'blue'}">${f.killer}</span><span class="weapon">${f.weapon}</span>${f.head ? '<span class="head">⌖</span>' : '<span class="dim">›</span>'}<span class="${f.team ? 'blue' : 'orange'}">${f.victim}</span></div>`).join(''); }
function boardHTML(actors, scores, live = false) {
  return [0, 1].map(team => `<div class="board-team"><h3 class="${team ? 'orange' : 'blue'}"><span>${team ? 'EMBER' : 'SPECTRE'}</span><span>${scores[team]} / 30</span></h3><table class="board-table"><thead><tr><th>OPERATOR</th><th>KILLS</th><th>DEATHS</th><th>DAMAGE</th></tr></thead><tbody>${actors.filter(a => a.team === team).map(a => `<tr class="${a.id === 0 ? 'you' : ''} ${live && !a.alive ? 'down' : ''}"><td>${a.name}${a.id === 0 ? ' <span class="blue">/ YOU</span>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${Math.round(a.damage)}</td></tr>`).join('')}</tbody></table></div>`).join('');
}
function drawMap() {
  const c = $('minimap'), x = c.getContext('2d'), w = c.width, h = c.height, data = game.minimap(), s = Math.min((w - 14) / 66, (h - 14) / 56), ox = w / 2, oy = h / 2;
  x.clearRect(0, 0, w, h); x.fillStyle = '#102a30'; x.fillRect(0, 0, w, h); x.strokeStyle = '#23444a'; x.lineWidth = .5;
  for (let i = -30; i <= 30; i += 5) { x.beginPath(); x.moveTo(ox + i * s, oy - 28 * s); x.lineTo(ox + i * s, oy + 28 * s); x.stroke(); x.beginPath(); x.moveTo(ox - 33 * s, oy + i * s); x.lineTo(ox + 33 * s, oy + i * s); x.stroke(); }
  x.strokeStyle = '#63827f'; x.strokeRect(ox - 33 * s, oy - 28 * s, 66 * s, 56 * s);
  for (const b of game.world.colliders) { if (!b.active || b.min.y > 3) continue; x.fillStyle = b.max.y > 2 ? '#426467' : '#2e5055'; x.fillRect(ox + b.min.x * s, oy + b.min.z * s, (b.max.x - b.min.x) * s, (b.max.z - b.min.z) * s); }
  for (const p of data.pickups) { x.fillStyle = p.ready ? p.type === 'health' ? '#70e4d7' : '#e9c170' : '#36565b'; x.fillRect(ox + p.x * s - 2, oy + p.z * s - 2, 4, 4); }
  for (const a of data.actors) { if (a.id === 0 || !a.visible) continue; x.fillStyle = a.team ? '#ff8756' : '#70e4d7'; x.beginPath(); x.arc(ox + a.x * s, oy + a.z * s, 2.5, 0, Math.PI * 2); x.fill(); }
  const p = data.player; x.save(); x.translate(ox + p.x * s, oy + p.z * s); x.rotate(-p.yaw); x.fillStyle = 'rgba(112,228,215,.12)'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 24, -Math.PI / 2 - .5, -Math.PI / 2 + .5); x.closePath(); x.fill(); x.fillStyle = '#eafff4'; x.beginPath(); x.moveTo(0, -5); x.lineTo(3.5, 4); x.lineTo(0, 2); x.lineTo(-3.5, 4); x.closePath(); x.fill(); x.restore();
}
function updateHUD(d) {
  if (!game) return;
  lastHud = d; refs.blueScore.textContent = String(d.scores[0]).padStart(2, '0'); refs.orangeScore.textContent = String(d.scores[1]).padStart(2, '0'); refs.blueBar.style.width = d.scores[0] / 30 * 100 + '%'; refs.orangeBar.style.width = d.scores[1] / 30 * 100 + '%';
  refs.clock.textContent = d.overtime ? 'OT' : `${Math.floor(d.time / 60)}:${String(Math.floor(d.time % 60)).padStart(2, '0')}`; show('overtime', d.overtime);
  refs.hp.textContent = d.hp; refs.shield.textContent = d.shield; refs.hpBar.style.width = d.hp + '%'; refs.shieldBar.style.width = d.shield * 2 + '%'; refs.hp.style.color = d.hp < 30 ? 'var(--orange)' : '';
  refs.mag.textContent = String(d.mag).padStart(2, '0'); refs.mag.classList.toggle('low', d.mag <= d.weapon.mag * .25); refs.reserve.textContent = d.reserve; refs.weaponName.textContent = d.weapon.name; refs.weaponType.textContent = d.weapon.label; refs.fireMode.textContent = `${d.weapon.auto ? 'AUTO' : d.weapon.id === 'm12' ? 'PUMP' : 'SEMI'} · ${d.weapon.rpm} RPM`; refs.grenades.textContent = d.grenades;
  document.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('active', +b.dataset.slot === d.weaponIndex));
  refs.squadList.innerHTML = d.teammates.map(a => `<div class="squad-row ${a.alive ? '' : 'down'}"><b>${a.name}</b><span class="sbar"><i style="width:${a.hp}%"></i></span><small>${a.alive ? a.state.toUpperCase() : 'REDEPLOY'}</small></div>`).join(''); refs.squadCount.textContent = d.teammates.filter(a => a.alive).length + (d.alive ? 1 : 0) + '/4';
  refs.stanceText.textContent = d.sprint ? 'SPRINTING' : d.ads ? 'SIGHTS UP' : d.crouch ? 'CROUCHED' : 'OPERATOR ONLINE'; refs.stanceIcon.textContent = d.crouch ? '▰' : d.sprint ? '»' : '◆';
  show('reloadIndicator', d.reload > 0); refs.reloadBar.style.width = d.reload * 100 + '%'; show('interactPrompt', !!d.prompt && d.alive); if (d.prompt) refs.promptText.textContent = d.prompt.text; show('spawnShield', d.protection > 0 && d.alive);
  refs.crosshair.classList.toggle('ads', d.ads); refs.crosshair.style.setProperty('--gap', (d.ads ? 3 : d.weapon.id === 'm12' ? 15 : 7) + d.moving * 1.3 + game.player.recoil * 70 + 'px'); refs.crosshair.style.opacity = d.alive ? d.sprint ? .25 : 1 : 0;
  const deg = ((-d.yaw * 180 / Math.PI) % 360 + 360) % 360; refs.bearing.textContent = `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]} ${String(Math.round(deg)).padStart(3, '0')}`;
  refs.respawnCount.textContent = Math.ceil(d.respawn); refs.damageVignette.style.opacity = game.hitFlash; refs.damageArrow.style.opacity = game.hitFlash > .1 ? Math.min(1, game.hitFlash * 2) : 0; refs.damageArrow.style.transform = `rotate(${game.damageAngle}rad) translateY(-110px)`;
  const feed = game.feed.filter(f => game.elapsed - f.time < 6), key = feed.map(f => f.time).join(','); if (key !== lastFeedKey) { $('killfeed').innerHTML = feedHTML(feed); lastFeedKey = key; }
  if (boardOpen) $('boardTeams').innerHTML = boardHTML(game.actors, d.scores, true);
  drawMap();
}
function emit(type, data) {
  if (type === 'hud') updateHUD(data);
  else if (type === 'state') setState(data);
  else if (type === 'toast') toast(data);
  else if (type === 'hit') { const h = $('hitmarker'); h.className = 'show' + (data.kill ? ' kill' : '') + (data.head ? ' head' : ''); clearTimeout(hitTimer); hitTimer = setTimeout(() => h.className = '', 140); }
  else if (type === 'kill') { $('killBanner').querySelector('b').textContent = data.text; $('killBanner').querySelector('span').textContent = data.sub; $('killBanner').classList.add('show'); clearTimeout(killTimer); killTimer = setTimeout(() => $('killBanner').classList.remove('show'), 1800); }
  else if (type === 'death') { $('killerName').textContent = data.killer; $('killerWeapon').textContent = data.weapon; $('hitmarker').className = ''; $('killBanner').classList.remove('show'); }
  else if (type === 'respawn') { toast('REDEPLOYED · Spawn shield active.'); $('killBanner').classList.remove('show'); }
  else if (type === 'scoreboard') { boardOpen = data; show('scoreboard', data); if (data) $('boardTeams').innerHTML = boardHTML(game.actors, game.scores, true); }
  else if (type === 'mute') updateAudio(data);
  else if (type === 'quality') updateQuality(data);
  else if (type === 'feed') { lastFeedKey = ''; $('killfeed').innerHTML = ''; }
  else if (type === 'end') {
    show('results', true); show('hud', false); show('death', false); show('touch', false); document.body.classList.remove('menu', 'playing', 'dead', 'paused'); document.body.classList.add('over');
    $('results').querySelector('.results-card').classList.toggle('defeat', !data.win); $('resultTitle').textContent = data.win ? 'VICTORY' : 'DEFEAT'; $('resultEyebrow').textContent = data.win ? 'SPECTRE ACTUAL / OPERATION COMPLETE' : 'SPECTRE ACTUAL / OPERATION LOST'; $('resultScore').textContent = `${data.scores[0]} — ${data.scores[1]}`;
    const p = game.player; $('resultStats').innerHTML = `<div><b>${p.kills}</b><span>ELIMINATIONS</span></div><div><b>${p.deaths}</b><span>DEATHS</span></div><div><b>${data.accuracy}%</b><span>ACCURACY</span></div><div><b>${data.headshots}</b><span>HEADSHOTS</span></div>`;
    $('resultBoard').innerHTML = boardHTML(data.actors, data.scores); $('scoreboard').classList.add('hidden'); boardOpen = false;
  }
}
function updateAudio(muted) { $('audioLabel').textContent = muted ? 'AUDIO OFF' : 'AUDIO ON'; $('pauseAudio').textContent = muted ? 'AUDIO OFF' : 'AUDIO ON'; $('audioBtn').classList.toggle('muted', muted); $('audioBtn').setAttribute('aria-pressed', String(!muted)); }
function deploy() { game.deploy(); if (selectedWeapon) game.switchWeapon(selectedWeapon); }
function openManual() { manualOpen = true; show('manual', true); game.audio.click(); }
function closeManual() { manualOpen = false; show('manual', false); }
function bindUI() {
  $('deployBtn').onclick = deploy; $('resumeBtn').onclick = () => game.resume(); $('restartBtn').onclick = deploy; $('rematchBtn').onclick = deploy; $('quitBtn').onclick = () => game.toMenu(); $('resultMenuBtn').onclick = () => game.toMenu(); $('pauseBtn').onclick = () => game.pause();
  $('manualBtn').onclick = openManual; $('pauseManual').onclick = openManual; $('closeManual').onclick = closeManual;
  $('audioBtn').onclick = () => { game.audio.init(); settings.muted = game.audio.toggle(); saveSettings(); updateAudio(settings.muted); }; $('pauseAudio').onclick = () => { settings.muted = game.audio.toggle(); saveSettings(); updateAudio(settings.muted); };
  $('sensitivity').oninput = e => { game.sensitivity = +e.target.value; settings.sensitivity = game.sensitivity; saveSettings(); };
  document.querySelectorAll('[data-quality]').forEach(b => b.onclick = () => { settings.quality = game.setQuality(b.dataset.quality); saveSettings(); game.audio.click(); });
  document.querySelectorAll('[data-weapon]').forEach(b => b.onclick = () => { selectedWeapon = +b.dataset.weapon; settings.weapon = selectedWeapon; saveSettings(); document.querySelectorAll('[data-weapon]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); $('loadoutDesc').textContent = WEAPONS[selectedWeapon].desc; game.audio.click(); });
  document.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { game.setDifficulty(b.dataset.diff); settings.difficulty = b.dataset.diff; saveSettings(); document.querySelectorAll('[data-diff]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); $('diffDesc').textContent = { recruit: 'Slower reactions. Room to learn.', operator: 'Balanced reactions. Tactical pressure.', veteran: 'Fast reactions. Lethal accuracy.' }[b.dataset.diff]; game.audio.click(); });
  document.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => game.switchWeapon(+b.dataset.slot));
  document.addEventListener('keydown', e => { if (e.key === '?' && ['menu', 'paused'].includes(game.state)) openManual(); if (e.code === 'Escape' && manualOpen) closeManual(); });
  // Touch look is independent of the movement stick and action buttons.
  let lookId = null, lx = 0, ly = 0; const canvas = $('game');
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && game.state === 'playing') { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => { if (e.pointerId === lookId) { game.look((e.clientX - lx) * 1.7, (e.clientY - ly) * 1.7); lx = e.clientX; ly = e.clientY; } });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; }; canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);
  const stick = $('stick'), knob = stick.querySelector('i'); let stickId = null;
  const moveStick = e => { const r = stick.getBoundingClientRect(), max = r.width * .34; let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; const l = Math.hypot(dx, dy); if (l > max) { dx *= max / l; dy *= max / l; } game.touchMove = { x: dx / max, y: dy / max }; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  stick.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); }); stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = e => { if (e.pointerId === stickId) { stickId = null; game.touchMove = { x: 0, y: 0 }; knob.style.transform = ''; } }; stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  document.querySelectorAll('[data-touch]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); const a = b.dataset.touch; if (a === 'fire') { game.touchFire = true; game.firePressed = true; b.classList.add('on'); } else if (a === 'ads') { game.touchAds = !game.touchAds; b.classList.toggle('on', game.touchAds); } else if (a === 'reload') game.reload(game.player); else if (a === 'jump') { if (game.player.grounded && !game.player.crouch) { game.player.vy = 7.2; game.player.grounded = false; } } else if (a === 'grenade') game.throwGrenade(game.player); else if (a === 'sprint') { game.touchSprint = !game.touchSprint; b.classList.toggle('on', game.touchSprint); } else if (a === 'crouch') { game.crouchToggle = !game.crouchToggle; b.classList.toggle('on', game.crouchToggle); } else if (a === 'switch') game.switchWeapon((game.player.weaponIndex + 1) % 3); else if (a === 'use') game.interact(); });
    const up = () => { if (b.dataset.touch === 'fire') { game.touchFire = false; b.classList.remove('on'); } }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
}
async function boot() {
  try {
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
    loadSettings();
    game = new Game($('game'), emit); bindUI();
    game.sensitivity = settings.sensitivity; $('sensitivity').value = String(settings.sensitivity);
    game.audio.muted = settings.muted; updateAudio(settings.muted);
    game.setDifficulty(settings.difficulty);
    document.querySelectorAll('[data-diff]').forEach(x => { const on = x.dataset.diff === settings.difficulty; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    $('diffDesc').textContent = { recruit: 'Slower reactions. Room to learn.', operator: 'Balanced reactions. Tactical pressure.', veteran: 'Fast reactions. Lethal accuracy.' }[settings.difficulty];
    selectedWeapon = settings.weapon;
    document.querySelectorAll('[data-weapon]').forEach(x => { const on = +x.dataset.weapon === selectedWeapon; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    $('loadoutDesc').textContent = WEAPONS[selectedWeapon].desc;
    updateQuality(game.quality.stats()); if (settings.quality !== 'auto') game.setQuality(settings.quality);
    setState('menu'); window.breachline = { game, settings };
    setTimeout(() => show('loading', false), 350);
  } catch (err) { console.error('BREACHLINE initialization failed:', err); show('loading', false); show('webglError', true); }
}
boot();
// Dev hot-reload must not leave a second animation loop or input listeners behind.
if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(perfTimer); game?.dispose(); });
