# Rendering — notes (round 6, final polish after the p4 reviews)

Owner of `src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`, `src/world/town.js` (build
orchestration) and `src/world/batch.js`. The contract is DESIGN.md section 10; this file says what
changed in round 6, why, and the numbers.

## What changed

### Quality tiers that work (`setQuality('auto' | 'high' | 'low')`, `getQuality()`, `qualityInfo()`)
- `getQuality()` returns the **setting** ('auto' | 'high' | 'low'); `qualityInfo()` what runs:
  `{ setting, tier: 'high' | 'low', scale, pixelRatio, gpu, integrated, reason }`.
  `setQuality(x)` returns `qualityInfo()`. No shader recompiles on a switch (PCF taps are a uniform).
- **high**: GTAO, bloom, 4x MSAA, 2048 shadow maps, 16-tap PCF, far cascade every 2nd frame.
  **low**: no AO and no bloom (shadow-only pre-pass), no MSAA, 1024 maps, 4-tap PCF, far cascade every
  3rd frame. Pixel ratio capped at 1 device pixel per CSS pixel on both (`&pr=x` forces x).
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
