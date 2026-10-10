# Saab & Run — En man som heter Ove

A reversed Simpsons Hit & Run in plain three.js ES modules (r186, no build step): Ove patrols his
Swedish row-house area in his Saab, reports illegally parked cars, chases the ones who flee, and
the neighbours keep interrupting him. Realistic PBR look, not cel-shaded. DESIGN.md is the design
bible and holds every module contract; README.md (Swedish) is the player-facing overview and code
map; `notes/*.md` are the per-area notes (world, cars, people, ui, integration = systems, story).

## Running and checking changes

- `make run` (or `npm start`) serves on :8790. Don't open a browser window for the user; verify
  headlessly: `PORT=88xx node tools/shot.mjs <scenarios>` (headless Chrome, real GPU, screenshots
  in `out/`, `OUT=dir` redirects). Always use a private PORT. Read the PNGs yourself.
  `montage a.png b.png -tile 2x2 -geometry 640x360+4+4 sheet.png` makes contact sheets.
- Scenarios: `start views aerial drive tow walk talk smash traffic cruise title` (shot.mjs) plus
  every `tools/scenarios/<area>.mjs` (same name overrides): gameplay.mjs `report pursuit interrupt
  errands collect patrol freeroam stages` and phase 4's `gperf carcycle gamepad corruptsave tabhide
  titlecheck quality recycle smalltalk tagmerge companion p4ui titlecam` and round 2's `dilation errandprog
  r2checks reloadday titlekeys collcull titlepose bouquet` (notes/integration.md), story.mjs `story m1..m7 gate aftermath` plus the no-warp
  checks `m5race m7chase m4cat lotwalk hospdrive retry` and round 2's `giveup outrosmet flowercalls
  dusk camwall`, ui.mjs `uiportraits uitoasts uiabort uifavicon`, render.mjs `rperf rload rprog rgpu
  rautosim`, cars.mjs (round 2: `wheelfaces trailersleep`), people.mjs (round 2: `pplanim pplcine`),
  world.mjs (round 2: `wsame wcalls wvram wprops`).
- **`story` plays all seven days via debug warps and must end with `#7 idle` and `no errors`**
  (`FROM=n` starts at day n+1); every outro is checked (each speaker within 4 m of Ove, nothing
  taller than 0.6 m between them). Run it after touching missions, stages, drivers, seating or the
  car/character physics. `m1` backs Patrick's car + trailer into its box with real key presses
  (a feedback controller on W/A/S/D/B): run it after touching car or trailer physics. The warps in
  `story` hide AI and balance problems: after touching drivers.js, the race or the chase, also run
  `m5race` (a key-driven bot must win; `RACE_VMAX=22` = a careful driver) and `m7chase` (the day-7
  Škoda must close to < 40 m by itself; `CHASER_AWAY=1` = spawned facing away). Failed checks are
  pushed to the run's errors ('N errors').
- Test mode is `?test=1` (no title, no pointer lock, dialogue auto-advances, no automatic phone
  calls unless `&calls`, no wait between story days unless `&gate`). `&fresh` ignores the save,
  `&mission=n` starts at day n+1. `window.__game`, `__lm(name)`, `__props`, `__stats()`,
  `__patrol`, `__interrupt`, `__stages` are exposed for scenarios.

## Conventions that bite

- All player-facing text is Swedish; code, comments and this file are English.
- Yaw: forward = (sin yaw, cos yaw), matching three's `rotation.y` on +Z-facing models.
  Right = (-cos yaw, sin yaw) = local -X. Positive steer turns right, which *decreases* yaw (and
  *increases* it while reversing). Drivers sit on the car's left (+X local). +z is north on the map (the minimap and big map draw N = +z since phase 4, so the low sun reads as south-west); +x is west.
- Everything off the asphalt is at `CURB` (0.15). Solids are footprints with a top height:
  a wall if `top > y + step`, a floor otherwise (characters step 0.45, cars 0.6). Ramps are
  oriented boxes whose top rises along their yaw. Snow banks have no collision.
- Rendering is physically based (no toon shading, no outlines). Static geometry goes through
  `GeoBuilder` (vertex colours, merged per block) and says what it is made of with
  `g.use('wood')` etc. (the surfaces table, DESIGN.md 10.2); `realMesh(geo)` (alias `toonMesh`)
  makes the mesh. Call `renderFrame()`, not `renderer.render()`. Don't add lights (the HDRI and the
  sun do it). Keep new materials to a minimum: use surfaces. Full contract: DESIGN.md section 10.
- Look-dev without gameplay: `PORT=88xx node tools/look.mjs <name> '<json camera shots>'`.
- `teleport`/`place` snap to ground-level floors only (`groundAt(x, z, 0.2, 0.6)`), never
  roofs; landmarks must not sit inside a building footprint. `car.place()` resets a trailer.
- The module `fx` (particles) is easy to shadow with a local `const fx = Math.sin(...)`.
  car.js and stages.js import it as `FX` for that reason.
- The frame dt is clamped to two fixed steps (2/60 s): below 30 fps the whole game slows down with
  the physics, so timers, `g.time` and the clock always match the cars and people they time.
- One-shot inputs (jump, kick, E) are handled once per frame in `handleOneShots`, continuous
  ones in `fixedStep` (60 Hz, at most 2 steps per frame). `input.pressed` stays true for the whole
  frame. A stage whose `prompt()` returns `takesE` owns the E key. Giving up: after a failed
  mission the `giveUp` action (Q, pad B); a running day by holding the Q key 1 s or the pause menu's
  "Avbryt dagens uppdrag", both only while `missions.canGiveUp` (never in a scene).
- `game.removeCar(car)` disposes the car (`car.dispose()`): never add a removed car again. Move cars
  only with `place()` or x/z/yaw + `sync()`. "Cars near x" in per-step code: `g.byX()` / `g.firstX()`
  (the cars sorted by their west edge), not a loop over all ~160. Traffic AI and pedestrians beyond
  120 m from Ove step at 30 Hz; pedestrians beyond 190 m are out of the scene graph.

## Gameplay systems (details in notes/integration.md and notes/story.md)

- **Patrol** (`game.patrol`, patrol.js): violations at the world's `violationSpots`, hold F to
  report, smitare pursuits, the Ordning meter. `forceSpawn(n, near, { smitare, radius })`,
  `reportsSince(t)`, `onReport(cb)`, `addOrdning(d)`, `cancelWriting()`, `remove(car)`.
  `patrol.suspended` is set by main.js while a story mission runs (no drain, no new random ones).
- **Avbrott** (`game.interrupts`, interruptions.js): free-roam phone calls + errands built from
  stages; paused during missions. `radioOnly(who, text, reply)` is a call with no errand (missions'
  "INTE NU!"), `force(id, { quick })`, `abort()`.
- **Stages** (stages.js) are the building blocks of errands and missions: `getInCar goto holdAt
  fetch pickup dropoff escort catchCat parkIn report wait race destroy grab talk cut`, each a factory
  returning `{ kind, init, update -> 'done' | { fail }, cleanup, text/sub, target, markers, obj,
  prompt, tags, onImpact }`. A context from `newCtx(def)`; `disposeCtx(g, m)` removes its cars,
  runs its cleanups and releases borrowed NPCs: call it on complete, fail and abort.
- **Story** (missions.js): `MISSIONS` (seven days: giver, at, extra, away, elsewhere, reward, intro,
  retryIntro, setup, stages, retry, outro, outroAt, outroSetup) and `MissionRunner` (`offered`,
  `begin`, `retry`, `abort`, the between-days gate, `placeCast` for the outro). `hud.curtain(on,
  caption)` is the cut to black (time skips, the race grid, "Ove går in och luftar elementen").
  `game.storyWorld()` applies what the story changed (Patrick's cast after day 2, the cat by Ove's
  door after day 4, Adrian's Saab in the lot after day 5) at load and after each day.
- Save: `localStorage['saab-and-run-v1']` (kr, day, clock, collectibles, patrol incl. `reda`), every
  field sanitised on load. Settings separately in `saab-and-run-settings` (`music`, `sound`, `quality`).
