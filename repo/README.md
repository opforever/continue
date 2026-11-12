# BREACHLINE — Drydock 07

A self-contained, browser-playable 3D team deathmatch: you and three allied bots against four enemy bots, fought in a procedural drydock arena. No downloads, no runtime CDN dependency, no server — the whole match simulates locally in WebGL.

## Run

```bash
npm install
npm run dev -- --port 5173      # dev server on 0.0.0.0
npm run build                   # production bundle in dist/
npm run preview -- --port 4173  # serve the production bundle
npm test                        # headless Playwright smoke + match verification
```

`npm test` expects the dev server on port 5173. First run only: `npx playwright install --with-deps chromium`.

## Controls

WASD move · mouse look/fire · right mouse aim · Shift sprint · Space jump · C/Ctrl crouch · R reload · 1/2/3 weapons · G grenade · E resupply · Tab scoreboard · Esc pause · M mute · ? field manual. Touch controls (stick, drag-look, action buttons) appear automatically on coarse-pointer devices.

## Match rules

4v4 · first team to 30 eliminations, or the higher score at 5:00 · a tie at the buzzer triggers sudden death, where the next elimination wins. Friendly fire is off; respawns carry a short spawn shield.

## Project layout

| Path | Role |
| --- | --- |
| `src/world.js` | Procedural arena, materials/instancing, collision AABBs, navigation grid + A*, supply stations |
| `src/models.js` | Weapon and bot meshes, pooled combat effects, weapon stat table |
| `src/audio.js` | WebAudio synthesis (no audio files) |
| `src/game.js` | Fixed-step simulation, player controller, bot AI, rendering |
| `src/main.js` | HUD/screens, input wiring, minimap, touch controls |
| `src/style.css`, `index.html` | Interface markup and visual system |
| `tests/smoke.mjs` | Headless browser verification, writes `tests/artifacts/` |

---

## Implementation log

### 1 — Project foundation
- Created the Vite/Three.js project with locally bundled fonts and assets; no runtime CDN dependency.
- Chosen architecture: procedural Three.js arena, separate FPS simulation/UI modules, analytic collision/hitscan, grid-pathfinding bots, synthesized audio.
- Match rules: 4v4, first to 30 kills or best score after five minutes; tied matches enter sudden death. Three switchable detailed weapons, ADS, reload, sprint, crouch, jump, grenades, resupply, respawns.
- Next: build the arena, shared geometry/material batches, collision data, and navigation grid.

### 2 — Arena and collision/navigation foundation
- Implemented `src/world.js`: a complete, symmetrical drydock arena with an open turbine hall, ribbed shipping containers, stacked crates, striped barriers, explosive fuel drums, forklifts, gantry crane, perimeter fencing, utility cabinets, floodlights, distant port skyline, and marked team spawns.
- Added procedural asphalt/sign textures, cached directional shadows, instanced static geometry, four animated health/ammo stations, and analytic AABB/sphere ray intersections.
- Added sub-stepped circle/box movement, an inflated 1 m navigation grid, and eight-direction A* with corner-cut prevention.
- Next: detailed weapons, articulated bot models, pooled combat effects, and synthesized audio.

### 3 — Weapons, characters, effects, audio
- `src/models.js` now builds three distinct, high-detail weapons (VX-4 carbine, M12 shotgun, Kestrel precision rifle), including rails, fasteners, chambers, magazines, grips, stock assemblies, optics, muzzle brakes, and animated muzzle flashes.
- Added articulated armored bots with team colors, helmets/visors, tactical rigs, backpacks, weapons, nameplates, and contact shadows.
- Added pooled tracers, sparks, shell-like debris, explosion flashes, and smoke; no unbounded effect allocation.
- `src/audio.js` synthesizes weapon reports, impacts, reloads, footsteps, pickup cues, explosions, and match results with WebAudio. Audio starts only after a user gesture.
- Next: match simulation, player movement, shooting, AI, respawns, and complete game UI.

### 4 — Playable simulation core
- Implemented `src/game.js`: fixed-step 4v4 match loop, player movement with acceleration, sprint/ADS/crouch/jump, vertical support and ceiling collision, three working weapons with per-weapon ammo/recoil/spread/reload timing, headshots, shields/regeneration, grenades, explosive barrels, supply stations, kill feed, respawns, score limit, timer, and sudden-death overtime.
- Bots use line-of-sight target acquisition, reaction delays, burst fire, strafing, cover/reload behavior, shared short-lived squad intel, A* pursuit, health-station recovery, separation, stuck recovery, and occasional grenades. Friendly fire is disabled; spawn protection prevents instant respawn deaths.
- Added a separate depth-cleared first-person weapon pass so the detailed gun does not clip into walls; animated ADS, reload, weapon switching, recoil, bob, and muzzle light.
- Added pointer-lock controls with a drag-to-look fallback, pause on focus loss, and touch-input hooks.
- Next: complete the HUD, deployment/pause/manual/scoreboard/results screens, touch controls, then browser verification and fixes.

### 5 — Complete interface and input layer
- Added `index.html`, `src/style.css`, and `src/main.js`: live 3D deployment screen, selectable loadouts and threat levels, squad roster, tactical minimap, score/timer HUD, health/shields, ammo/weapon slots, reload/interaction prompts, kill feed, hit/kill/headshot feedback, damage direction indicator, death/respawn overlay, pause menu, field manual, hold-Tab scoreboard, and full end-of-match results/rematch.
- Added mouse, keyboard, pointer-lock fallback, sensitivity control, audio mute, and mobile touch stick/look/action buttons.
- Fonts are bundled locally; the visual system uses a drydock-derived teal/orange palette with warm/cool neutrals and custom scrollbars.
- Next: production build, headless-browser runtime checks, full match/interaction verification, responsive screenshots, and repair pass.

### 6 — Build configuration and first runtime measurements
- Added `vite.config.js`: dev/preview bind to `0.0.0.0` and accept proxied preview hostnames (`allowedHosts`), so the game can be opened from another device or a sandbox preview URL instead of only `localhost`.
- Split the production bundle with `manualChunks`: engine `three` chunk (497 kB / 125 kB gzip) is cached separately from game code (78 kB / 28 kB gzip). The previous single 575 kB chunk warning is gone; `npm run build` is clean.
- Reorganized this README: run/controls/rules/layout first, then the chronological implementation log.
- Installed the headless verification toolchain (Chromium + system libraries) and took the first real measurements in software-rendered WebGL (SwiftShader, 1440×900): **456 draw calls, 203 k triangles, 193 geometries, 12 programs, 73 colliders, 0 runtime errors** — but only ~0.6–1 fps, because 1.3 M pixels of PBR + soft-shadow shading is far beyond a CPU rasterizer. Screenshot capture in `tests/smoke.mjs` timed out at its 30 s default for the same reason.
- Diagnosis: the scene is draw-call and compositing bound, not simulation bound; 378 of the 477 scene meshes belong to the seven articulated bots, and the full-screen SVG-turbulence grain overlay alone cost roughly half the frame rate. Real GPUs are unaffected, but low-end/mobile devices and headless CI need a cheaper path.
- Next: adaptive quality/render-scale system, then the repair pass and a verification run that completes end to end.

### 7 — Adaptive render quality, persisted settings, cheaper grain
- Added `src/quality.js`: three render tiers (HIGH / BALANCED / PERFORMANCE) that change only shading cost — pixel-ratio cap, shadow-map size and filter (PCFSoft → PCF → Basic), and particle budget. The simulation, weapon stats and AI are identical in every tier.
- AUTO mode picks a starting tier from device hints (software rasterizer, coarse pointer, `hardwareConcurrency`, `deviceMemory`) and then trims render resolution against a rolling frame-time average with hysteresis (0.5×–1× of the tier cap, re-evaluated at most every ~0.9 s). Manual tiers pin the scale at 1×.
- Wired into the single animation loop: `Quality.sample()` receives the *unclamped* frame time (the simulation `dt` stays clamped at 50 ms), and resolution changes reuse `Game.resize()`. Static shadow maps stay frozen; changing tier re-allocates the shadow map once and marks materials for a single recompile.
- Pause menu now has a RENDER QUALITY segmented control (AUTO / HIGH / BALANCED / PERF) plus a live readout: `FPS · tier · render scale · draw calls · triangles`, refreshed twice a second while paused. `renderer.info.autoReset` is off and the frame is reset explicitly, so the readout counts both the world pass and the first-person weapon pass instead of only the last one.
- Replaced the full-screen `feTurbulence` SVG grain with a 64×64 tiled PNG noise texture (5.9 kB, embedded as a data URI): same look, far cheaper to composite. Measured in software WebGL: **1.2 → 2.3 fps** from that change alone. The grain is dropped entirely in the PERFORMANCE tier and under `prefers-reduced-motion`, which also disables the pulsing/blinking UI animations.
- Added persisted operator preferences (`localStorage`, versioned key, validated on load, silently skipped in private mode): mouse sensitivity, mute, render quality, threat level and last loadout are restored on boot.
- Next: repair pass on the issues found while instrumenting, then the full headless verification run with screenshots.

### 8 — Repair pass: touch input dead-lock and verification harness
Resumed from step 7 and ran the existing suite end to end for the first time. It had never completed; four distinct defects surfaced, three in the harness and one in the shipped game.

- **Real game bug — touch controls could go completely dead.** `setPointerCapture()` was called unguarded at the top of the stick, look and action-button `pointerdown` handlers. When capture fails (pointer already released, older Android/iOS WebViews, synthetic events) it throws, and the exception aborted the rest of the handler — so `moveStick()` never ran and FIRE/RELOAD/JUMP never fired. Every touch control silently stopped working. Added a `capture()` helper that swallows the failure; capture is now best-effort and input always proceeds. This was caught by the mobile check reporting `moved:false, firing:false` alongside two `No active pointer with the given id` page errors.
- **Harness — flow check assumed a live hostile.** After 75 s of accelerated combat all four enemies can be mid-respawn simultaneously, so `actors.find(a => a.team === 1 && a.alive)` returned `undefined` and the script crashed on `enemy.spawnProtection`. Added a `liveEnemy()` helper that redeloys a hostile via the real `spawn()` when none is standing.
- **Harness — racy rematch assertion.** `g.time === 300` can never hold reliably: the fixed-step loop advances the clock the instant the match resumes (measured `299.933` immediately after the click). Now asserts a fresh clock (`time > 299 && elapsed < 1`). Verified by probe that the rematch itself was already correct — scores 0–0, kills 0, state `playing`.
- **Harness — resource starvation and leaked browsers.** The mobile page could not boot inside the 30 s default because the finished desktop page was still rendering a second SwiftShader WebGL context. The desktop page is now closed before the mobile run, boot waits are 90 s and screenshot waits 120 s. Wrapped the run in `try/catch` so collected page errors are always printed and the browser always closes — previously a failed assertion leaked Chromium and hid the error list.
- Confirmed working end to end in software WebGL: deploy + loadout selection, movement, fire/reload/switch, grenade throw and detonation, ammo and health stations, 75 s of unscripted bot combat (all seven bots navigating, both teams scoring, bounded grenade pool), player death → respawn, score-limit win, and no desktop runtime errors.
- Next: first-person viewmodel framing, bot draw-call reduction, then the full green run with responsive screenshots.

## Handoff notes

The README is updated after each implementation step. Source files live in `src/`; tests live in `tests/`. Do not replace the working simulation with a mock or static demo. Keep rendering to one animation loop, cap pixel ratio, and keep static shadow maps frozen.
