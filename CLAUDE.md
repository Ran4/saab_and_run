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
  r2checks reloadday titlekeys collcull titlepose bouquet` and round 2b's `camroof` (the chase cam
  under low roofs) and `garage` (Ove's garage door, E from both sides) and `horn` (the horn with real
  T presses: 19 checks; `hornlook` = close-ups, `WHO=adult|kid|old|patrick`) and `hopp` (the jump
  with real key presses: a tap, the wind-up, a kept press, a 0.85 m block climbed: 11 checks)
  (notes/integration.md),
  story.mjs `story m1..m7 gate aftermath` plus the no-warp checks `m5race m7chase m4cat lotwalk
  hospdrive retry` and round 2's `giveup outrosmet flowercalls dusk camwall` and `luft luftskip
  luftcam luftsound` (day 3's radiator scene: a shot per beat, the skip, started with the camera at
  Anita or Rune, its sounds offline), ui.mjs `uiportraits
  uitoasts uiabort uifavicon titlegone uipause` (the pause card at 15 window sizes: run it after
  touching the pause menu or its rows), render.mjs `rperf rload rprog rgpu rautosim`, cars.mjs
  (round 2: `wheelfaces trailersleep`; the slides: `handling drift driftshot speedslide`), people.mjs
  (round 2: `pplanim pplcine`; `seatlegs`: nothing of anyone seated in a car below the cushion in
  sight, every car model, the lower legs back on getting out: run it after touching seating, the
  seated pose or a car's seats), world.mjs (round 2: `wsame wcalls wvram wprops`), cold.mjs (the cold
  beyond the town, features/implemented/avgrunden.md: `coldwalk colddrive coldback` with real keys,
  `coldrate coldmission coldwall coldbed coldbedskip`, `coldlook coldsound coldperf` (an A/B of draw
  calls and triangles with the cars and people hidden; copy cold.mjs into an old checkout), `coldwind`
  (no wind made behind the black, a quiet bedroom, the wind's stop() offline: features/implemented/
  ljudbugg_vid_kold.md); run `coldwalk colddrive coldbed coldwind` after touching the cold, the death
  or the waking scene), snohog.mjs (the
  hoppbacke in the park, features/implemented/snöhög.md: `snohog` = six jumps with real keys, several
  cars and speeds, a trailer, `RUNS=`, `FILM=1` keeps the frames; `snohogsim` = 64 deterministic runs
  over the real hill; `snohogwalk snohogsound`); run `snohogsim snohog` after touching car or trailer
  physics, collision.js or the hill), rune.mjs (Rune's errand, features/implemented/
  roligare_runeuppdrag.md: `runeroll runekick` (the wheelchair let go of and kicked, real keys),
  `runecar runecold` (killed by a car / the cold, E tries again, Q gives up, a reload keeps him dead),
  `runewidow` (`?runedead`: Anita grieving, no errand of his), `runelook` (close-ups); run them after
  touching the escort stage, game/rune.js, the errands' retry or Anita, and `QUERY='&runedead' story`
  after touching days 3, 6 or 7).
- **`story` plays all seven days via debug warps and must end with `#7 idle` and `no errors`**
  (`FROM=n` starts at day n+1); every outro is checked (each speaker within 4 m of Ove, nothing
  taller than 0.6 m between them), and a HUD watch runs throughout (no offer toast once a day has
  begun, no HUD over the curtain, no objective under the letterbox). Run it after touching missions, stages, drivers, seating or the
  car/character physics. `m1` backs Patrick's car + trailer into its box with real key presses
  (a feedback controller on W/A/S/D/B): run it after touching car or trailer physics. The warps in
  `story` hide AI and balance problems: after touching drivers.js, the race or the chase, also run
  `m5race` (a key-driven bot must win; `RACE_VMAX=22` = a careful driver, `RACE_VC=1.6` = a hasty
  one, who loses even with the old physics) and `m7chase` (the day-7 Škoda must close to < 40 m by
  itself; `CHASER_AWAY=1` = spawned facing away). Failed checks are pushed to the run's errors ('N
  errors').
- **Voices and music** (features/implemented/a_fully_voiced_game.md and
  resten_av_replikerna_for_a_fully_voiced_game.md): every line said out loud is in
  `src/game/script.js` (pure data, `allLines()` = `[who, text, part]`); code never inlines voiced
  text (toasts, banners, objectives stay in code). Every role has a voice but the children (they
  murmur). A shared table's line (`ped`, `driver`, `window`, `cast`) is made once per voice its `//
  @voice` tag names: the neighbours and twelve pool voices (`tools/voice/cast.json` roles with
  `pool: { sex, age }`; the game picks one by the person's sex, age and seed, `voice.voiceFor`).
  A new shared table needs its `@voice` tag. After editing a line: `make voice DRY=1`, then
  `make voice` (only missing or changed clips cost; one clip per line and voice, retakes on a bad
  take), and `make voice-check` must pass. Never print or grep `.env`. Script budget ≲ 30 000 chars and ≲ 25
  words a line: `node -e "import('./src/game/script.js').then(m => { const l = m.allLines();
  console.log(l.length, l.reduce((s, [, t]) => s + t.length, 0)) })"` (522 lines, 16 665 chars on
  2026-10-14 with Anita's grief; with the pool 1 327 lines, 1 263 clips). `?test=1` turns the voices off (the old murmur, no queue); `&voice` on. Scenarios
  `voice` (made-up manifest: turns, mouths, ducking), `vcut` (days 1-4 at a human pace + a fail and
  retry: < 5 % cut off, no two voices at once; `TO=7` all seven days; `LUFTSKIP=s`: the
  reader skips day 3's radiator scene with Enter s s in), `vstory` (story with the voices), `vpool` (the passers-by's voices: sex, age, the same one each time, a clip for each line). Every headless tool
  starts Chrome with `--mute-audio`: never play sound on the speakers.
- Test mode is `?test=1` (no title, no pointer lock, dialogue auto-advances, no automatic phone
  calls unless `&calls`, no wait between story days unless `&gate`). `&fresh` ignores the save,
  `&mission=n` starts at day n+1. `window.__game`, `__lm(name)`, `__props`, `__stats()`,
  `__patrol`, `__interrupt`, `__stages`, `__voice` are exposed for scenarios.

## Conventions that bite

- All player-facing text is Swedish; code, comments and this file are English.
- Yaw: forward = (sin yaw, cos yaw), matching three's `rotation.y` on +Z-facing models.
  Right = (-cos yaw, sin yaw) = local -X. Positive steer turns right, which *decreases* yaw (and
  *increases* it while reversing). Drivers sit on the car's left (+X local). +z is north on the map (the minimap and big map draw N = +z since phase 4, so the low sun reads as south-west); +x is west.
- There are no invisible walls (features/implemented/avgrunden.md): Ove and his car go on past
  `BOUND` (where they stood); everyone else (traffic, chases, the race, pedestrians, neighbours)
  stops there (main.js `keepCarsInside` / `keepPeopleInside`), but Rune: he goes nowhere by himself,
  and Ove may push, let go of or kick his wheelchair out there (game/rune.js). Outside the grid the ground follows
  the hills' mesh (`layout.terrain.at`, used by `baseGround`); four forest tracks (`layout.TRACKS`)
  lead out; from `COLD` (BOUND + 30, square distance `edgeDist`) game/cold.js's meter rises and
  kills Ove (112 s at the edge, features/implemented/avgrunden2.md). Nothing may spawn or be placed
  beyond BOUND.
- Everything off the asphalt is at `CURB` (0.15). Solids are footprints with a top height:
  a wall if `top > y + step`, a floor otherwise (characters step 0.45, cars 0.6). Ramps are
  oriented boxes whose top rises along their yaw. Snow banks have no collision. Snow hills (`HILL`,
  world/snowhill.js: the park's hoppbacke, the preschool's mound) are smooth heightfields: never a
  wall, always a floor whatever the step; a car on one feels its slope and flies where it falls away
  (car.js `HOPP`, `car.flight`).
- Rendering is physically based (no toon shading, no outlines). Static geometry goes through
  `GeoBuilder` (vertex colours, merged per block) and says what it is made of with
  `g.use('wood')` etc. (the surfaces table, DESIGN.md 10.2); `realMesh(geo)` (alias `toonMesh`)
  makes the mesh. Call `renderFrame()`, not `renderer.render()`. Don't add lights (the HDRI and the
  sun do it). Keep new materials to a minimum: use surfaces. Full contract: DESIGN.md section 10.
- Look-dev without gameplay: `PORT=88xx node tools/look.mjs <name> '<json camera shots>'`.
  Gait (walk, run, jump, their numbers and the jump's sounds): `PORT=88xx node tools/gait.mjs
  [walk run jump clip metrics sound ...]` (notes/people.md, *Gait*). Run `metrics` after touching
  `locomotion()`: no foot below the ground, slip on the ground under ~0.2 m/s; `jump` after touching
  the jump (`jump feet`: no dip, no lift before the push). Ove's jump grunts are made by
  `tools/sfx/grunts.mjs` (not the voice tool; `ledger.json` = what they cost).
- A scene inside a house (day 3's kitchen, `world/interior.js`): the set is built inside the real
  house only while the scene runs (houses are closed boxes, invisible from inside), the window it
  looks out of has its pane as a mesh of its own (data.js `interiors`), the people are puppets
  (`buildCharacter` + `animateCharacter`), the real ones off the stage meanwhile (`g.offstage(ch, true)`,
  then `false`: back as their state says, never a snapshot of `root.visible`: `hideNearCamera` may hide anyone for
  a frame). notes/world.md, story.md.
- `teleport`/`place` snap to ground-level floors only (`groundAt(x, z, 0.2, 0.6)`), never
  roofs; landmarks must not sit inside a building footprint. `car.place()` resets a trailer.
- The module `fx` (particles) is easy to shadow with a local `const fx = Math.sin(...)`.
  car.js and stages.js import it as `FX` for that reason.
- The developer plays in Firefox (the desktop's default browser); every headless tool runs Chrome,
  and their Web Audio differs. In Firefox `param.cancelScheduledValues(t)` that leaves nothing
  scheduled before t throws the param back to its default (a gain to 1, even after `gain.value = x`
  in the same moment): a sound stopped the moment it was made blasts at full level. Stop by
  scheduling the fall at t (an event at the same time overrides a rise set there), not by cancelling
  (cold.js wind; features/implemented/ljudbugg_vid_kold.md, notes/ui.md *audio API*).
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
  caption)` is the cut to black (time skips, the race grid). Day 3's radiator is a cutscene in Anita
  and Rune's kitchen (game/luftning.js, holdAt's `scene`; notes/story.md).
  `game.storyWorld()` applies what the story changed (Patrick's cast after day 2, the cat by Ove's
  door after day 4, Adrian's Saab in the lot after day 5) at load and after each day.
- **Cold** (`game.cold`, cold.js): the meter (`v`), the blizzard (`zone`: fog, sky and sun changed
  around the frame only, `beforeRender` / `afterRender`), and the death by frost. While Ove dies and
  wakes (`cold.busy`) missions, errands, the patrol and the garage don't update; at the black the day's
  mission fails with its banner held (`missions.fail(reason, { later: true })`, `showFailed()` after
  he wakes), errands abort, companions go home, a named car goes home; then game/waking.js plays his
  bedroom (world/interior.js `buildBedroom`, the line from script.js `WAKE`) and lets him out at
  his door.
- **Rune** (`game.rune`, rune.js; features/implemented/roligare_runeuppdrag.md): E takes hold of and
  lets go of his wheelchair (escort `push`), let go of in a stride or kicked it rolls on (`n.roll`).
  His errand has no timer but his cold (escort `cold`), and he can die on it (`n.mortal`: a car at
  speed, the cold): `interrupts.retry` holds RUNE ÄR DÖD with E (`tryAgain`) / Q (`giveUp`), Ove
  frozen meanwhile (`game.failWait`, like a failed day). `game.runeDead` (set as he dies, saved
  `rune: 0`): Rune hidden (`npcAway`), the errands needing him gone, Anita grieving (`rune.grief`:
  `anim.grief`, sobs, script.js `WIDOW`), days 3, 6 and 7 without him (missions.js `widow`,
  `MissionRunner.scene(def, key)`). `?runedead` (tests) starts so.
- **Horn** (`game.horn`, horn.js): T / H (pad L3 / RB) in a car. People in front leap aside (`anim.fright`,
  then `anim.fist` / `cheer`), neighbours answer in character, drivers honk back with their make's
  horn (audio.js `HORNS`), smitare are spooked or pressed, needless honking costs Ordning. People's
  reactions run through `horn.drive(ch, dt, ped)` (called first by `Ped.update` and `stepNpcs`);
  `horn.last` is the latest honk (a pickup comes out to the car); `horn.rand` / `horn.stats` for tests.
- **Voices** (`voice.js`): `game.say` / `radio` / `shout`, the dialogue box and the phone calls go
  through `voice.play(who, text, { slot, mode, ... })`: two slots ('main', 'bubble'), a queue (a
  dialogue line breaks in; radio waits up to 6 s, a bubble 2.5 s; the same speaker waits for
  himself; nothing starts while the dialogue box is up). A line without a clip is mumbled but still
  takes its turn. With the voices off `play()` returns null and the caller murmurs as before.
  Timers that pace lines (stage radio, also()'s lines and calls, the calls' scripts) run only while
  `voice.quiet()`; the outro waits for quiet. `game.murmur(pitch)` is the old murmur, voices off only.
  Music: `audio.music(state)` from main.js `musicState()` (roam playlist, errand, pursuit, race,
  chase, hurry, finale); the generative piano is the fallback.
- Save: `localStorage['saab-and-run-v1']` (kr, day, clock, collectibles, patrol incl. `reda`, `garage`
  0 = Ove's garage door shut, `rune` 0 = Rune dead), every field sanitised on load. Settings separately in
  `saab-and-run-settings` (`music`, `sound`, `quality`, `voice`, `voiceLevel`).
