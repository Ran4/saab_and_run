# Rendering — notes (phase 4, round 2b on top of round 2 and round 6)

Owner of `src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`, `src/world/town.js` (build
orchestration) and `src/world/batch.js`. The contract is DESIGN.md section 10; this file says what
changed, why, and the numbers. Newest first: phase 4 round 2b, round 2, then round 6.

## Phase 4, round 2b (the final verification's polish)

### 1. 'auto' fell to low for good after one bad moment - fixed
- **Cause:** the first-seconds rule. After a 45-frame warm-up, the median of 4 windows of 0.7 s
  (about 3 s) of *mean rAF intervals* over 20 ms dropped 'auto' to low once and for good: nothing
  ever went back up. Whatever was slow in those 3 s decided the session: a busy machine, the day-1
  intro of a test run, a GC. Reproduced with `rautolive RBURST=0:2.5:4` (a 2.5 s 4x CPU-throttle
  burst at the start): 'slow (21.9 ms)', low for good while frames were back at 16.7 ms a second
  later (`out/r2b/r2b_burst_before_after.png`, left = before, right = now).
- **What it measures now** (autoQuality, gfx.js): per frame the CPU work (from the rAF timestamp,
  or from the end of the previous frame when that ran past it, to the end of renderFrame: the
  game's update + the render) and the GPU time (EXT_disjoint_timer_query_webgl2, a small query pool,
  results a few frames late; on 'auto' and 'low' only). A window's figure is the 75th percentile of
  max(CPU, GPU), capped by the mean frame interval, so a machine busy with something else (slow
  frames, cheap work) does not count as slow. Without the timer (Firefox, Safari; `&nogputimer`) it
  is the mean interval with the old thresholds. On this machine, high at 720p: 5.5-10 ms (CPU
  bound; GPU 2-7 ms). A first version measured from the rAF timestamp alone: when a frame ran over,
  the next one counted the overrun again, and the p75 of vsync-quantized intervals (16.7 / 33.3)
  flipped between the two values at 45-50 fps - both replaced (CPU work, mean interval).
- **Not counted** (held): the first 3 s; 1 s after a frame interval over 100 ms, a shader compile
  (`info.programs` changed), a camera cut (> 8 m or > 30 deg in a frame) or a resize; 0.2 s after an
  upload (`info.memory` textures / geometries up: cars' plates while driving, ~1 a second, so
  short); 2 s after the tab is shown again; and `holdAutoQuality(ms, why)` (new export).
- **Steps** (~0.75 s windows, as before): 4x -> 2x MSAA on high, then the render scale; a step that
  did not make frames >= 5 % faster is undone (CPU-bound) and held 20 s, now doubling to 160 s.
  Thresholds 15.5 ms down / 11.5 ms for a probe up on the cost (18.5 / 17.4 ms of interval without
  the timer).
- **Tier down** only when the steps are spent (2x and the scale at its floor, or a step found
  CPU-bound within its hold) and the last 8-10 s *at those settings* cost over **18.5 ms** (under
  ~54 fps). Not 20: with the new figure a 4x-throttled run measured 18.6-20 ms (53 fps in the
  intro), right on the old line; 18.5 keeps that guarantee and is the old step threshold.
- **Tier up** (new): only after such a drop (never on a GPU that starts low), after 30 s at full
  scale with high's predicted cost - low's CPU x 1.3 and GPU x 1.6, the measured tier ratios (4x
  throttle 17.4 vs 22.5 ms; fill-bound GPU 0.60-0.66x) - at most 15 ms; it comes back at 2x
  ('recovered') and the probe restores 4x. A drop within 2 minutes of that doubles the wait and
  lowers the bar by predicted / actual; after three it stays low. Without the timer only a
  CPU-bound drop can come back (CPU work x 1.3 while every frame comes at the display rate).
- **rautosim** (simulated frames, 15 cases, all as expected): a single 300 ms frame changes
  nothing; 2.5 s of 40 ms frames at the start or 5 s at 20 s: a 2x step tried and undone, stays
  high; sustained 25 fps (CPU 40 ms): low at 11 s (also without the timer); GPU 60 ms: 2x, scale
  0.9 / 0.8 / 0.7, low at 16 s; recovery: 40 ms for 20 s then 9 ms -> low at 11 s, high at 56 s,
  4x at 57 s (no timer: 59 s); CPU high 24 / low 18.5 and GPU high 70 / low 30 for 5 min: one drop,
  never back; CPU high 22 / low 10.5 (worst case for the prediction) for 10 min: one retry, then
  low; and the old ones (GPU 20.5 ms -> 2x; GPU 16 ms -> nothing; CPU 19.5 ms -> 2x undone, now low
  at 10 s since 19.5 > 18.5).
- **rautolive** (new, live, test mode on 'auto' with the dynamic scale, through day 1's intro;
  `RBURST`, `RTHROTTLE`, `RHITCH`, `RDRIVE`, `RWANT`, `RSHOT`): the 2.5 s burst at the start + a
  300 ms main-thread block at 20 s: high throughout; 4x throttle for the whole run: low at 17 s
  ('slow (23.4 ms)', earlier run 14 s) and stays (predicted high 23 ms); 4x for the first 20 s:
  low at 17 s, back to high at 60 s, 4x at 65 s; spoofed Iris Xe (`&gpu=`): low from the start
  and for 50 s; `&nogputimer`: the burst stays high, 4x throttle -> low at 20 s; 40 s of AI
  driving: high, 'upload' holds ~1 a second, the long window still full.

### 2. 'Tar porträtt' is one long task - not in my files; measured fix for main.js
- The step is one 685-1056 ms task (RPROD rload). Profile: renderPortrait 554 ms, nearly all the
  cast's faces baked on their first draw inside it (faceDetail, G2, vnoise, faceBake; readPixels +
  toDataURL ~35 ms); uploadGeometry ~40 and precompile's synchronous part ~70 ms are gfx.js',
  warmCars' synchronous part the rest. Nothing in gfx.js is worth splitting.
- **main.js (gameplay_ui):** yield between the portraits, with `nextTask` from gfx.js:
  `await nextTask();` after `const wc = warmCars(...)`, and
  `for (const key of Object.keys(HOMES)) { hud.portraits[key] = renderPortrait(renderer, this.npcs[key].model); await nextTask(); }`.
  Measured with that patch in my copy (then reverted), 3 loads each: the longest task in the step
  685-1056 -> 189-315 ms (each portrait is now its own < 50-80 ms task), the step's length the same
  within noise (1.01-1.40 s vs 1.06-1.42 s). Safe: renderPortrait restores the render target, clear
  colour, shadow flag and the model's parent and pose, so precompile's warm frame may run between
  two portraits.

### API changes others must know
- New export `holdAutoQuality(ms = 1500, why)`: frames until then do not count for 'auto'.
  Optional for main.js (gameplay_ui): `holdAutoQuality(2000, 'curtain')` when `hud.curtain` goes on
  or off and at a mission's begin / retry / outro (camera cuts, compiles and uploads are detected
  without it).
- `qualityInfo().reason` can be 'recovered'. `gfxStats.gpuMs` is filled on 'auto' / 'low' too (the
  timer runs there); `gfxStats.gpuHist` still only with `&gputime`. `&nogputimer` = no GPU timer.
- Tests: `gfxDebug.aqStep(now, { cpu, gpu })` (no cpu / gpu = intervals only), `aqSim(on)` (turns
  the dynamic scale on for the simulation), `aqReset()`, `aqState()`.

## Phase 4, round 2 (the whole-game review's rendering list)

Measured at 1280x720 on the RTX 4070 in headless Chrome (ANGLE-GL) while six other fixers and other
sessions shared the machine: CPU timings were 30-60 % slower and noisy all day (the town's world code
alone took 1.6-2.1 s per load instead of ~1.4), so timings are min / median of repeated runs and
interleaved A/B where it mattered; call counts and GPU timer A/Bs (exclusive slot) are reliable.

### 1. The frozen first title frame (precompile, uploadGeometry) - fixed
- Cause, measured: `precompile()` only compiled the scene's materials. The first frame then compiled
  the bloom (high-pass, 5 blurs, composite, blend), GTAO + denoiser and output programs itself, and -
  the bigger part - on ANGLE/desktop GL "parallel" compiles report complete at once: the real link
  happens at a program's first use (`getProgramParameter` 317-365 ms in the first frame), and the
  driver finishes each program on its first *draw* (another ~0.3-0.4 s of GPU-process time: with
  every program precompiled the first frame took 10 ms of CPU but the next frame still came 380 ms
  later).
- `precompile(root = scene, { warm = true })` now also compiles the renderer's own programs, each in
  the state its pass draws in (a throwaway rig: one 1-triangle Mesh / InstancedMesh / InstancedMesh
  with instanceColor / SkinnedMesh / BatchedMesh per kind with the DEPTH (back- and double-sided) and
  NORMAL materials, the shadow pre-pass' own mesh, fullscreen quads with the bloom, GTAO, denoise and
  output materials (geometry like three's FullScreenQuad: position + uv - with normals they were other
  programs), FXAA drawn to the screen; the output pass' defines are primed first). Then, without
  blocking the main thread: `gpuIdle()` (a fence polled between tasks), every program taken into use
  in 25 ms slices (uniform / attribute locations), and **one whole frame drawn behind the loading
  screen** (`warmDraw`; people's own `onBeforeRender` face hooks held off in it: nobody is placed yet,
  every LOD level is still on) followed by `gpuIdle()` again. buildTown's early call is
  `{ warm: false }`. The first `renderFrame` no longer re-issues a precompile when one was done.
- `uploadGeometry()` holds objects' own `onBeforeRender` hooks off while it draws everything into
  the 1x1 target (class hooks - the batches' culling - still run): it no longer bakes every face in
  town synchronously. (A version that hid every material for one render call drew nothing at all,
  but three uploads index buffers only when it binds them for a draw: the cards' 2.7 MB of indices
  stayed in JS and would have uploaded in some gameplay frame; reverted to drawing.)
- Numbers (production page, `RPROD=1 rload`, 2-3 loads each): **first title frame 0.40-0.69 s ->
  10-20 ms** (GAME as-is today: 693 ms; my baseline: 380-455 ms), `newPrograms` in it 10 -> 0, and no
  rAF gap after ready (was 380-570 ms). 'Tar porträtt': uploadGeometry 476-590 -> ~25-60 ms; the
  portraits now bake the cast's 9 faces themselves (renderPortrait 167-185 -> 500-680 ms) and the warm
  frame adds 0.3-0.45 s of GPU wait (main thread free, idle work - people's LOD jobs - runs in it), so
  'ready' is ~0.1-0.4 s later and the title is smooth from its first frame: about the same time to a
  smooth title, without the freeze. `warmStats` = { drawMs ~20-60, gpuWaitMs ~280-410 }.

### 2. High tier GPU: bloom blend and MSAA - fixed
- `GameBloomPass` (UnrealBloomPass without its last step: the additive full-screen blend into the 4x
  multisampled HDR scene target) + the output grade adds `texture(tBloom) * uBloom` before tone mapping
  (tBloom = `renderTargetsHorizontal[0]`, half resolution, bilinear as before; `uBloom` 0 on low). Same
  image: static-world shots base vs new differ in as many pixels (> 3 %) as base vs base (start 2077 vs
  2380, a lamp pose 2356 vs 2664, street 205 vs 192, aerial 3 vs 2). GPU timer at 18.66 MP (pr 4.5,
  exclusive, interleaved): **start 18.0-18.2 -> 16.3-16.5 ms, drone_nw 20.2-20.6 -> 18.7-19.0 ms**
  (-1.5 to -1.7 ms, more than the review's estimate).
- MSAA step: on 'auto' at the high tier, a window over 18.5 ms first tries 4x -> 2x MSAA (a trial like
  the render-scale steps: undone and held 20 s if frames did not get >= 5 % faster, i.e. CPU-bound),
  then the render scale; going back up, the scale first and 4x last. Laptop GPUs (renderer string
  'Laptop' / 'Max-Q' / 'Mobile') start at 2x. `qualityInfo().msaa`. `render.mjs rautosim` drives the
  logic with simulated frame times: GPU 20.5 ms -> x2 at 0.7 s and stays; GPU 24 ms -> x2, scale 0.9,
  then the first-seconds check moves it to low; CPU 19.5 ms -> x2 tried and undone at 1.7 s; 16 ms ->
  nothing moves.

### 3. Program re-evaluations - fixed (12-20 a frame -> 0)
- A fifth object kind 'instc' (InstancedMesh with instanceColor: far car bodies, debris) with its own
  pre-pass depth / normal materials and surface copies; an InstancedMesh that gets its colours later
  moves over at the next list rebuild (our DEPTH customDepthMaterial is re-assigned too).
- The last 2 a frame were 'surface:bark' shared between the silhouette forest (an InstancedMesh left
  out of the pre-pass, so never swept) and a plain mesh: `kindSweep` now runs for every mesh.
- `render.mjs rprog` (customProgramCacheKey counters for 30 frames): start / street_long / lot_e /
  drone_nw 0, 0.03, 0, 0 a frame (a marker ShaderMaterial once in 30 frames). Programs 149 after the
  load (GAME today 143-144: the new kind's depth / normal / upload variants), flat; the precompile
  covers the new kind (nothing compiles in the first frame).

### 4. Loading: buildTown - `buildTownAsync` added (main.js to switch), merge faster
- `buildTownAsync(scene, onProgress)` (town.js) runs exactly the same work in the same order as
  `buildTown(scene)` (both iterate one generator, `townSteps`; batch.js has `batchSteps`), yielding
  to the browser (`nextTask()`) every ~40 ms and calling `onProgress(f)`, f 0..1. Byte-identical world:
  `?townhash` hashes every batch's buffers and runs before they are dropped - base, sync and async all
  `a6d4a344` over 259,475,612 bytes. With it (throwaway main.js in my copy): the town's longest task
  ~0.2-0.34 s (was one 2.4-3.7 s task), the loading text updates ~30 times, +0.1-0.2 s wall time.
  The remaining long single steps are world code (a radhus block, buildStreets, buildOutskirts,
  finalizeSigns: 0.15-0.3 s each).
- `GeoBuilder.build()` merges in one pass into preallocated typed arrays (the same result as the two
  levels of `mergeGeometries`: `?checkmerge` ran both for all 232 multi-part builds of a load - no
  difference; falls back for unusual parts; `?oldmerge`). Load profile: mergeGeometries +
  mergeAttributes + its JS-array index (~0.35-0.43 s self over a load) -> mergeParts 0.18 s, and
  less garbage. batch.js' packing loop was rewritten (same numbers) but measured no faster
  (~0.25 s: 9 Math.round per vertex over ~4.5 M vertices). Town steps now (sync, noisy machine): blocks 1.7-2.1 s (world), streets 0.23-0.32,
  outskirts 0.16-0.22, merge 0.22-0.31, batch 0.29-0.38, signs 0.17-0.2, upload 0.1-0.19, precompile
  0.09-0.13 s. `townStats` = { buildMs (work time), wallMs, steps, ... }.

### 5. Minors
- **FXAA on low** - done: `FXAAPass` after the output grade on the low tier only (the grade then
  draws into the composer's second target and swaps; FXAA to the screen and swaps back; its texel size
  follows the composer's size and the dynamic scale). Eaves, gutters, string lights and lamp posts are
  smooth (rendering copy `out/p4r2/low_fxaa_base_new_high.png`: base low / new low / high); sub-pixel twigs soften a little.
- **Low tier sheds CPU** - done: the far cascade every 4th frame (was 3rd) and with only the static
  world in it (props, cans, cars, wheels, people - anything instanced, skinned or inside a group - cast
  no shadow beyond the near cascade's 30 m on low: their `castShadow` is off just while viewport 1 is
  drawn, `GameSunShadow.onFar`); prop cells (`props:*`, 200 m cells) more than 120 m away are out of
  every pass (`layers.mask` 0, restored when near or on high; `&leanprops=m`). Calls per frame on low:
  start 414 -> 329-341 (shadow 138-140 -> 84-85, main 320-322 -> 251-261), street_long 502-518 ->
  353-354 (shadow 106 -> 62, main 441-460 -> 296-299). The CPU A/B was lost in today's noise.
  Collectibles were not culled: their beams guide the player from afar (gameplay's call).
- **Weak 'discrete' GPUs start on low** - done: `classifyGpu(str)` (exported): GeForce MX + 3 digits
  and Quadro P/T + 3 digits are 'weak GPU' -> low under auto; laptop dGPUs -> high at 2x MSAA. 17
  sample strings checked (`render.mjs rgpu`: MX150/450/550, Quadro P620 low; RTX 3050 Laptop, GTX 1650
  Max-Q laptop; RTX 4070, Quadro T1000, RX 6600, M2 Pro high; Iris Xe, UHD 620, Radeon(TM) Graphics,
  680M, M1, Mali, SwiftShader low). `&gpu=<string>` pretends to be one. The first slow-check decision
  now takes 4 windows of 0.7 s (was 6).
- **Lit-snow lower hemisphere for car paint** - not done, the premise does not hold for this HDRI:
  its ground mean (`down`, below -17 deg) is (0.65, 0.69, 0.81) - brighter than the zenith sky (0.09,
  0.13, 0.26) - and the env already fades to it under the horizon. Look-dev (`render.mjs rsaab`,
  `&envdown=1.5&envband=0.04`: 1.5x brighter snow, reaching it 2 deg under the horizon; and AO off)
  moved the shaded Saab's lower door from sRGB (7, 10, 23) to (10, 14, 30) - invisible. Its
  darkness is the clear coat's Fresnel on a dark paint plus the grade's soft black point (x^2 / (x +
  0.03) crushes reflections below ~3 % display-linear), i.e. car paint (cars) or the grade (approved
  for its deep blacks), not the environment. `&envdown` / `&envband` stay as look-dev overrides.
- **Distance culling of the spruce / crown cards** - not done: signs.js puts them in a 3 x 3 grid of
  200 m cells (conifer: 266k of 358k quads in the four corner cells, whose nearest point is ~140 m
  from Ove's house), so a 150 m cell cull changes nothing in mid-town and pops whole 200 m blocks of
  spruce fringes near the edges; aerial / drone views must keep them. Needs finer cells in signs.js
  (world) first - then a per-cell distance check in tickTown is a few lines.

### API changes others must know
- **main.js (gameplay_systems):** replace `buildTown(scene);` (line ~193) with
  ``await buildTownAsync(scene, (f) => setLoading(`Plogar gatorna… ${Math.round(f * 100)} %`));``
  (import `buildTownAsync` from './world/town.js'; `setLoading` already exists). Keep `uploadGeometry();
  const pc = precompile();` at 'Tar porträtt…' and `await pc` before the loop: the promise now
  resolves later (after the warm frame, ~0.3-0.5 s) - that is the point.
- `precompile(root, { warm = true })`, `gpuIdle()`, `nextTask()`, `classifyGpu(str)`, `warmStats`,
  `gfxDebug` (tests) are new exports; `qualityInfo()` has `msaa` and `fxaa`; `gfxStats.first` has
  `newPrograms`. `townStats` has `wallMs` and `steps`. `uploadGeometry()` no longer runs objects'
  own `onBeforeRender` hooks (instance properties; class methods still run).
- **people / ui:** with uploadGeometry no longer baking every face, the portraits bake the cast's
  faces (renderPortrait 0.17 -> 0.5-0.68 s in 'Tar porträtt'); rendering portraits lazily (on first
  use) would take that out of the load.
- **world:** the low tier hides prop cells beyond 120 m with `layers.mask = 0` (props.js should not
  use layers itself); finer card cells in signs.js if the card cull is wanted.

### Tests
`render.mjs`: `rload` (now `RLOADN=n` loads with min / median, long tasks, loading phases, rAF gaps,
`RPROD=1` for the real page; errors if the first frame compiled anything), `rprof` (CPU profile of a
load; `RPROF_WITHIN=fn`), `rprog`, `rgpu`, `rautosim`, `rsaab`, new poses `sun_into`, `title_side`.

## Round 6

### What changed

### Quality tiers that work (`setQuality('auto' | 'high' | 'low')`, `getQuality()`, `qualityInfo()`)
- `getQuality()` returns the **setting** ('auto' | 'high' | 'low'); `qualityInfo()` what runs:
  `{ setting, tier: 'high' | 'low', scale, pixelRatio, gpu, integrated, reason }`.
  `setQuality(x)` returns `qualityInfo()`. No shader recompiles on a switch (PCF taps are a uniform).
- **high**: GTAO, bloom, 4x MSAA, 2048 shadow maps, 16-tap PCF, far cascade every 2nd frame.
  **low**: no AO and no bloom (shadow-only pre-pass), no MSAA, 1024 maps, 4-tap PCF, far cascade every
  3rd frame (4th since phase 4 round 2, and FXAA). Pixel ratio capped at 1 device pixel per CSS pixel on both (`&pr=x` forces x).
- **auto** (default outside tests): low on integrated GPUs (WEBGL_debug_renderer_info: Intel / Iris /
  UHD, AMD Radeon(TM) Graphics / 680M-780M / Vega APUs, plain Apple M-chips and "Apple GPU", Mali,
  Adreno, PowerVR, SwiftShader / llvmpipe), high otherwise; drops to low once if the median of the
  first ~4 s of frames (0.7 s windows after a 45-frame warm-up) is over 20 ms, or later if the render
  scale is at its floor and frames stay over 24 ms. Tested: CPU throttled 4x -> 'slow (36.7 ms)' ->
  low; `&pr=4.5` (GPU-bound) -> low after ~6 s.
- **Dynamic render scale** (auto and low; explicit high is always full resolution): 0.1 steps between
  0.7 (high) / 0.6 (low) and 1.0. A window over 18.5 ms steps down; if that step did not make frames
  >= 5 % faster the game is CPU-bound: undone, held 20 s. After 5 windows at full rate it probes a step
  up; a probe that makes frames slow is undone and held 10 s, doubling. Tested: `&q=low&pr=6`
  settles at 0.8 and re-probes 0.9 now and then.
- Tests (`?test`) default to 'high' without the dynamic scale (deterministic screenshots);
  `&q=auto|high|low`, `?lowgfx` (= low), `&dynscale` override.

**For the UI fixer (hud.js, the pause menu's Grafik button):** today hud toggles
`setQuality(getQuality() === 'low' ? 'high' : 'low')`, saves `gfx: getQuality()` and only restores
'low'. Please:
1. cycle **Auto -> Hög -> Låg**: `setQuality({ auto: 'high', high: 'low', low: 'auto' }[getQuality()])`;
2. label: `getQuality() === 'auto' ? 'Auto (' + (qualityInfo().tier === 'low' ? 'Låg' : 'Hög') + ')' : getQuality() === 'low' ? 'Låg' : 'Hög'` (re-read it when the menu opens: auto may have dropped to low
   meanwhile; `qualityInfo().reason` says why, e.g. 'integrated GPU', 'slow (24.1 ms)');
3. save it under a **new key** (e.g. `quality`) and on load `setQuality(saved)` unless the URL has
   `q` or `lowgfx`. The old `gfx: 'high'` was written by default whenever any setting changed, so it is
   no choice: ignore it, but map an old `gfx: 'low'` to 'low';
4. `index.html`'s `<b>Hög</b>` default label -> 'Auto'.

### Static world draw calls (batching, `src/world/batch.js`)
- buildTown still builds one GeoBuilder per block for solids (S), ground (F) and twigs (S.fineG), but
  instead of 3 x 49 multi-surface meshes (each drawing once per surface, ~15) it makes **one
  `StaticBatch` (a `THREE.BatchedMesh`) per category and surface**: block / ground (+ the streets) /
  twigs / the outskirts' forest belt (24 sector meshes re-batched in town.js). 41 batches in all.
- The batch buffers are written directly (no per-part geometries, no BatchedMesh copy loops) with
  packed attributes: position f32x3, normal int16x3, colour uint16x3 (float when a colour is > 1),
  tri f32x4, trin int8x3 = 43 instead of 64 bytes per vertex.
- Each block's part is a range with its own bounds (`runs`); `onBeforeRender` (and `onBeforeShadow`)
  frustum-culls the runs against the pass's camera and merges neighbouring visible runs, so a surface
  is 1-6 (multi-)draws per pass. All instances use the identity matrix (one instance, the indirect
  texture uploaded once).
- Coplanar overlaps (road markings on asphalt) are decided by draw order = material id: `touchSurfaces`
  makes the shared surface materials in the order the old per-block `realMesh` calls did, and
  `prepareKind('batch')` makes the batch copies in that order. 'marking' also has a polygon offset now
  (at 400+ m the 1.2 cm over the asphalt is below depth precision).
- A/B against `?nobatch` (the old meshes, same code otherwise), static world (cars and people hidden),
  pixels differing by > 6 %: start 193, lot 59, Solrosvägen 61, drone_nw 35, aerial 1,974 (markings
  winning their z-fight) of 921,600.
- Everything buildTown adds is `makeStatic` (matrixAutoUpdate false; CPU arrays dropped on upload) and
  its vertex buffers are uploaded right away (`uploadGeometry()`), not in the first frame.
- Static world main-pass calls: start ~450 -> 35, Solrosvägen ~1,000 -> 41, aerial ~1,160 -> ~40.
  Town build +0.25-0.3 s for the batching (`townStats.batchMs`).

### renderFrame overhead
- One `scene.updateMatrixWorld()` per frame (`scene.matrixWorldAutoUpdate = false`); ~0.55-0.9 ms now,
  nearly all of it the 1,731 auto-updating nodes under cars and people (see requests).
- Shadow-only pre-pass on both tiers: the cascades are rendered from inside a 1-triangle scene (three
  needs a render state for `shadowMap.render`); the old low tier drew the whole scene into a 1x1
  target for that. The near cascade every frame, the far one every 2nd (high) / 3rd (low) frame, and at
  once after a > 6 m jump or > 10 deg turn; a near-only update clears only its atlas tile (scissor).
- GTAO normal/depth pre-pass through a camera with far = 80 m (`&aofar`): culling removes everything
  beyond (the old code toggled `noAO` on blocks > 240 m in tickTown - gone). Twigs and cards stay out
  (noAO). Props are still in (contact AO at their feet; ~25 calls) - deliberate.
- Per-kind materials: the shadow pass uses a per-kind `customDepthMaterial` (Mesh / Instanced /
  Skinned / Batched), the AO pass swaps each object to a per-kind normal material (no
  `overrideMaterial`), and `kindSweep` gives instanced / skinned / batched users of a shared surface
  material that kind's own copy (same programs). The object lists are cached and rebuilt every 20
  frames.
- fx soft particles read the AO depth with its own near/far (`sceneDepthRange()`) and treat a cleared
  texel as "nothing near" (particles beyond 80 m no longer vanish).

### Load and memory
- **Bug found:** the EffectComposer swapped its buffers after the OutputPass every frame, so with
  `renderTarget2.samples = 0` (the review's suggestion) every other frame lost MSAA. Fixed: the
  OutputPass draws to the screen without a swap, the scene pass always uses the multisampled target,
  the second target is plain and never allocated.
- `renderer.debug.checkShaderErrors` only with `?test` or `?debug`.
- `precompile(root)` compiles with KHR_parallel_shader_compile **against the composer's scene target**
  (a compile while the screen is bound makes tone-mapped variants the game never draws). buildTown
  starts one for the world while cars and people are built; the first renderFrame issues the rest.
- Surface textures are uploaded (with mipmaps) when they load (`renderer.initTexture`).
- First frame 1.85 s / 101 programs -> ~1.0 s / 135 programs (0.56-0.70 s with the main.js step
  requested below). JS ArrayBuffer backing 473 -> 264 MB (233 MB at the landing; since the crash fix
  the world's batches keep positions + index for raycasts, ~78 MB, see below).
- Not done: bloom from a lower mip (a quarter-resolution bright pass misses pixel-size snow glints and
  makes them flicker; bloom is off on low anyway), KTX2 (needs an encoder / build step).

### Look
- **Grade, deep blacks:** toe 0.8 -> 0.86, a soft black point (x² / (x + 0.03), rescaled: no
  clipping), and the ground height fog 0.0022 -> 0.0016 (it put a milky floor on everything 10-30 m
  away). Darkest 1 % of frames: start 37-48 -> 25-31, lot 28-40 -> 16, street_trees 51 -> 30,
  snow_close 43 -> 24; shaded snow ~(115,129,154) -> (101,115,141) at the same spot (still
  blue-grey), shaded asphalt (75,81,92) -> (57,63,74). Overrides: `&toe`, `&black`, `&hfog`.
- **Exhaust:** thin bluish vapour: alpha 0.3 -> 0.1, size 0.08 -> 1.6 m, life 1.8 s, erode 0.85, more
  buoyancy and spread. `fx.exhaust(x, y, z, vx, vz, { alpha, size })` - **multipliers** of that
  default puff (car.js passes `{ alpha: 0.6, size: 0.8 }`).
- **Snowfall:** camera-facing streak quads instead of points: ~1 cm flakes (at least a pixel; smaller
  ones fade instead of shrinking), stretched along their projected fall over ~1/45 s, 22,000 in a
  40 m box + 18,000 in a 14 m box round the camera.
- **Pickup sparkles:** a new glint mode in the puff shader: a pinpoint and a thin four-point star that
  twinkles, small and slow, additive.
- **AO on snow:** AO took the blue skylight and left the warm sun: on snow the AO'd light keeps the
  unoccluded hue (a hint cooler), so contact shade no longer reads as a coffee stain. (If the stain on
  the yellow box by the handicap bay persists, it is partial snow cover over the yellow paint: world.)
- **Skin** (people's request): `TRI_SKIN` on the 'skin' surface: wrap lighting with a red-shifted
  vec3 wrap (0.42, 0.22, 0.15) round the terminator, and its indirect light keeps a little warmth
  (x (1.07, 0.985, 0.95)). The cast's own skin material gets it too (it is a 'skin' surface).

## Numbers (1280x720, RTX 4070, headless Chrome ANGLE-GL, other agents on the GPU: ±1-1.5 ms noise)

`tools/scenarios/render.mjs` (in the rendering copy `.wt/saab_work/render`, not in GAME): `rperf`
(per pose: calls and triangles per pass, loop / update / renderFrame CPU, GPU timer with
`QUERY='&gputime'`, `RQ=low`), `rload`, `rshots` (frozen A/B stills, `RSTATIC=1`), `rfx`, `rauto`,
`reval`. "After" includes the cars' and people's own round-6 LODs; the static-world rows are mine.

| pose (high) | calls before -> after [shadow / AO / main after] | M tris | renderFrame CPU ms | loop ms | GPU ms |
|---|---|---|---|---|---|
| start | 1375 -> 493 [160 / 84 / 322] | 7.52 -> 4.29 | 8.5 -> 5.8 | 11.7 -> 8.3 | 5.0 -> 4.2 |
| lot_e | 1583 -> 761 [169 / 106 / 406] | 8.09 -> 6.61 | 9.1 -> 6.3 | 12.2 -> 8.6 | 5.9 -> 4.4 |
| Solrosvägen | 2104 -> 747 [134 / 73 / 470] | 8.73 -> 7.12 | 9.6 -> 6.3 | 12.0 -> 8.9 | 6.5 -> 4.3 |
| centrum | 718 -> 428 | 3.86 -> 3.41 | 7.0 -> 4.9 | 10.1 -> 7.2 | -> 3.1 |
| hospital | 461 -> 328 | 2.59 -> 2.34 | 6.1 -> 4.7 | 9.0 -> 6.9 | -> 3.0 |
| drone_nw | 1667 -> 783 [169 / 121 / 406] | 8.79 -> 7.45 | 8.9 -> 6.6 | 11.4 -> 8.9 | -> 5.4 |
| aerial | 2211 -> 533 [21 / 11 / 488] | 6.79 -> 5.34 | 9.6 -> 5.4 | 11.9 -> 7.3 | -> 4.7 |

| pose (low) | calls before -> after | renderFrame CPU ms | GPU ms |
|---|---|---|---|
| start | 1312 -> 404 | 7.4 -> 5.9 | 4.8 -> 3.5 |
| Solrosvägen | 2071 -> 502 | 8.5 -> 5.8 | 6.2 -> 2.9 |
| drone_nw | 1611 -> 482 | 8.5 -> 5.5 | 5.6 -> 3.0 |
| aerial | 2160 -> 487 | 10.0 -> 5.1 | 6.4 -> 2.9 |

Per phase now (start / Solrosvägen, high): matrices 0.95 / 0.89 ms, shadow + AO pre-pass 1.9 / 1.4 ms,
main + post 2.1 / 2.3 ms. Programs 101 -> 135-140 (batch variants, per-kind depth / normal materials;
compiled in the background).

## Requests to other areas
- **main.js (gameplay fixer):** at 'Tar porträtt…' add `uploadGeometry(); const pc = precompile();`
  (both from gfx.js) and `await pc;` just before the loop starts: first frame ~1.0 -> ~0.6 s
  (measured with that patch). The remaining ~0.5 s is lazy work in the first frame (face bakes, plate /
  sign textures).
- **cars:** `warmCars` calls `renderer.compileAsync` while the screen is the bound target (between
  frames), which compiles tone-mapped variants the composer never uses: call gfx's `precompile(group)`
  instead (it binds the composer's target), or bind `composer.renderTarget1` around it. Parked /
  sleeping cars: `matrixAutoUpdate = false` on their subtrees while asleep (cars and people are 1,731
  of 1,863 auto-updating nodes; ~0.9 ms/frame of matrix updates). Far-car InstancedMeshes are treated
  as 'instanced' by the per-kind materials (their materials are car-owned, not swapped).
- **world:** twig-card speckle against the sky (signs.js `cardMaterial` 'twig': fade the cards out a
  mip earlier / raise the alpha-to-coverage threshold for tLod > 1); props are now the biggest static
  call count (~100-200 main-pass calls: one per type per cell per surface) - one BatchedMesh per cell and
  surface, or fewer surfaces per prop, would cut most of it; the brown stain on the snow-capped yellow
  box (if it persists) is snow cover over the yellow paint.
- **people:** the far-level SkinnedMeshes get the 'skin' copies of the shared materials automatically;
  keep `TRI_SPECK` / `gBump` / `gVx` hooks as they are (unchanged here).

## Fix after landing: `story` crashed the headless tab at a day transition
- **Cause (mine):** story.mjs (phase 4) raycasts every dialogue shot against the visible meshes within
  40 m. The world batches have town-sized bounds, so every ray went into BatchedMesh's own raycast,
  which walks *all* of the surface's triangles in the town (one instance) - over vertex arrays that
  makeStatic had already dropped. Each test read an empty array (undefined -> NaN) through three's
  slow paths: ~100 M boxed-number iterations per shot check, minutes per check, the renderer process
  at 185 % CPU and 3.2 GB RSS, and at some day transition (several checks in a row) it died ("Target
  closed"). It also meant walls could no longer block a line of sight.
- **Fix:** `StaticBatch.raycast` tests only the runs (blocks) the ray passes near, with real data:
  the batches keep positions + index (`userData.raycastable`); other static meshes keep them too
  unless they are `noAO` (cards, haze, far hills), which become non-raycastable (no-op) instead of
  NaN-looping. RSS during `FROM=4 story` now ~1.3 GB flat, each shot check a fraction of a second.
- Memory cost: positions + index of the world's batches stay in JS (78 MB; ArrayBuffers 233 -> 264 MB,
  still 473 before round 6). Verified: `FROM=4 story` and `story` twice end `#7 idle`, no errors.

## Known weaknesses
- Moving things beyond 30 m update their shadows at 30 Hz (high) / 20 Hz (low).
- The dynamic scale cannot tell GPU- from CPU-bound up front; it tries a step and undoes it.
- Props cast and take AO as before; on low they still cost ~40 shadow calls.
- GPU timings are from a desktop RTX 4070 shared with other agents; laptop numbers are estimates.

## Tracks in the snow (feature snöspår, 2026-10-15)

- game/tracks.js draws prints and ruts as two transparent meshes with a unique `surfaceMaterial('snow')`
  patched after `surfaceCompile` (DESIGN.md 10.5): the same snow texture, drifts and sparkle as the
  ground (its triplanar coordinates are world positions, like the static ground's; the ground's own
  parts are rotated back by their yaw, so the texture's phase differs a little at the rim, which the
  alpha hides), a per-fragment height function for the relief, the sky on a bent normal, the sun
  shadowed by a march over the same function.
- Look-dev that mattered: lit on the relief normal alone, every wall facing the bright horizon of the
  HDRI caught the sky and the prints read as white outlines in shade; with the sky on a normal bent 60 %
  back up and 15 % occlusion at the bottom they read as soft blue hollows. In the sun at 13° a 4 cm
  print is mostly in its own shade (~(113, 127, 154) sRGB, a little darker than a house's shade on the
  snow, ~(127, 142, 168)), its far wall lit. The tread and sole patterns are band-limited (gone by ~6 mm a pixel) and only partly
  pressed in (a noise mask): a full-strength pattern looked like a zip.
- Cost (sposperf, RTX 4070): +2 draw calls; every ring full in view from 25 m up +0.37 ms GPU, from a
  chase camera's height none measurable.

## The cold's blizzard (feature avgrunden, 2026-10-11)

- `fx.blizzard(amount, wx, wz, now)`: the snowfall's flakes (`uCount` = max(snowfall, blizzard)) on a
  wind: `uWind` (m/s, the streaks) and `uWindOff` (how far it has carried them, accumulated in JS and
  wrapped at 560 m, a multiple of both boxes, so a change of wind never makes the flakes jump).
- The whiteout is applied around the frame by game/cold.js (`beforeRender` / `afterRender` in
  main.js' loop): `scene.fog.density` × (1 + 11 zone²), its colour towards a cool white, the sky
  dome's `uFog` the same and its new `uWhite` (the sky mixed into the haze, the sun clamped to 1.5× the
  haze), `sun.intensity` × (1 - 0.6 zone); everything put back after `renderFrame`, so `dusk()` (day
  7) still reads and restores the real values. `zone` = how far out the camera / Ove is (0 inside
  BOUND - 26, 1 at COLD + 255; COLD + 170 until avgrunden2 slowed the meter 2.5 times).
- 'hillside': the spruce-stand and bare-patch terms × smoothstep(70, 170, gDist).
- The frost on the picture is HUD (a canvas under a CSS mask, notes/ui.md), not a pass.
