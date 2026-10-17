# Story (phase 3b, fix round 1, phase 4, phase 4 round 2) — notes for later agents

Owner: story agent. Files: `src/game/missions.js`, `src/game/stages.js`, `src/game/camera.js`,
`tools/scenarios/story.mjs`, this file (phase 4: also the story's parts of main.js, interruptions.js,
patrol.js, hud.js). Built on the phase-3a systems (notes/integration.md).
DESIGN.md section 5 describes the seven days as implemented.

## The seven days

| day | id | giver @ place | stages | reward |
|---|---|---|---|---|
| 1 Släpkärran | `slapet` | patrick (+parvaneh) @ parvanehHouse | getInCar patrickCar → parkIn parvanehDrive (trailer, reverse, tol 0.35, clear 14) → report 3 @ guestParking (no smitare) → getInCar saab (`homeSaab`: back at the garages if far off and unseen) → parkIn oveGarageSpot (`retryAt: [3]`); outro at Ove's garage door | 100 |
| 2 Sjukhuset | `sjukhuset` | parvaneh @ parvanehHouse, away: patrick, elsewhere: sara + nasanin at jimmyHouse | getInCar saab (Parvaneh starts walking to the lot) → pickup parvaneh @ LOT_PICKUP (she walks; needCar) → goto hospitalDrop via the Akut driveway (95 s, radio every ~6 s, Jimmy's call) → dropoff (she walks to the Akut door) → parkIn hospitalSpot (either) | 150 |
| 3 Elementet | `elementet` | anita @ runeHouse | holdAt oveGarage 1.4 s (the hook is empty: "Rune lånade elementnyckeln 1998") → holdAt 1.3 s at Rune's Volvo (`runeVolvo`: a note, "utlånad till Anders, 2015") → fetch wrench 1.1 m in front of Anders (`AT_ANDERS`, exact; "Jaså, den. Den låg i Audin.") → report 2 @ garbageRoom (Anita calls first) → holdAt runeHouse "Gå in och lufta elementen" (`cut`: one E, black, caption, work 'wall'); outro on the walkway 2.3 m out from their door | 150 |
| 4 Katten | `katten` | jimmy @ jimmyHouse | catchCat @ bikeShed (sit, 110 s, Jimmy: "Spring efter den!" → "Nej, vänta! Stå still!") → goto oveHouse on foot; outro at his door | 150 |
| 5 Saab, inte Audi | `saab` | adrian (+anders) @ adrianSpot | getInCar saab → pickup adrian (needCar) → race Anders (cut to the grid, Ove right lane, Anders left lane on the first straight, cruise 19, careful, rubber band) Solrosvägen → (5,3) → (5,5) → (6,5) → dealerFinish; retry from the grid with Adrian; outro on Bilhallen's forecourt with a grey Saab for sale | 200 |
| 6 Vita skjortan | `vitskjortan` | anita @ runeHouse, away: vitskjorta | setup: the Saab along the aisle facing the lot entrance → getInCar saab (Anita calls 8 s later) → destroy (waits at SKODA_DAY6 (−37.25, −9) by the lot entrance until Ove's car is within 30 m (35 s at most); ≤ 30 Ork a ram, drain 8/s; rubber 1 / 0.85 beyond 80 m; escape 250 m only after Ove was within 60 m and after 20 s; TAGEN!) → talk → grab the folder → goto runeHouse | 250 |
| 7 Värkarna | `varkarna` | patrick (cast, +parvaneh) @ parvanehHouse, away: vitskjorta, snow | setup: the Škoda parked on the west street (−37.25, −5) → getInCar saab (Parvaneh walks to the lot) → pickup → goto hospitalDrop via the driveway (120 s; chaser = that Škoda, sets off after 2.5 s; 5 calls Anita, Sara, Jimmy, Adrian, Anders; radio) → dropoff "Gå nu, Ove. Det är söndag. Hälsa Sonja från mig." → cut "Senare samma dag" (15:40, Saab to hospitalSpot, Parvaneh away, `dusk(true)`, snowfall 0.9) → fetch flowers @ flowerShop (Patrick phones: a boy, he fainted; then Anita and Adrian, answered calmly; none within 45 m of the kiosk) → `layFlowers` (one E: Ove kneels, the bouquet follows `kneelPoint` until ~2.2 s and stays on the twigs) → outro on one knee with the finale's shots (`graveShot`) | 500 |

After day 7: banner **OMRÅDET ÄR I ORDNING** (Ordning lifted to ≥ 90) over the wide grave shot for
6.5 s, then Ove gets up and free roam continues; the snowfall and the afternoon light end 40 s later.

### What the story leaves in the world (`game.storyWorld()`, main.js; at load and after each day)
- after day 2: Patrick is rebuilt from `CHARS.patrickCast` (arm in plaster) and his portrait re-rendered.
- after day 4: the stray cat (`buildCat`, sitting) on Ove's doorstep, beside the door.
- after day 5: `named.adrianSaab` (saab900, grey, "Adrians Saab") in the world's empty reserved
  bay `adrianBay` (fallback: replaces the unnamed parked car nearest `adrianSpot`).
- day-aware small talk: `CHATTER_AFTER` in main.js.

## MissionRunner (missions.js)

- `index`, `state` idle | intro | running | outro | failed, `m`, `stage`, `stageI`, `offered`,
  `gating`, `gateOpen`, `gate`, `gaveUp` (days given up with Q: their `retryIntro` next time),
  `outroCast` / `outroOn` (the outro's placed people; tests read them), `outroProps`.
- **Between days**: the next day opens after `GATE.reports` (3) more reports (not before
  `GATE.minSecs`, 60 s) or `GATE.secs` (90 s) of free roam (time with an errand, call, chase or
  dialogue on doesn't count): 10:30, `Dag N` / "Tisdagsmorgon", `placeNpcs(true)` (everyone where
  they spend the new day, e.g. the girls at Jimmy's on day 2), the Saab home if Ove is > 60 m from
  it, `interrupts.nextT` ≥ 75 (the giver first).
- `begin()` (intro, or `retryIntro` after a give-up), `startMission(from = 0, aboard = [])`
  (`def.setup(g, m)` first; `aboard`: npc keys put in Ove's car), `complete()`: cleanup, UPPDRAG
  KLART (hidden again before the outro), 14:30 on days 1-6, Ove to `def.outroAt`, `outroSetup`,
  `placeCast(keys)` (every non-Ove speaker within 4 m in front of Ove, fanning out, no wall /
  fence / hedge taller than 0.6 m between, kept where they stand if that already holds), the camera
  turns to whoever speaks when there are two others, a line's third element `(g) => {}` is a camera
  beat. `fail(reason)` (riders in Ove's car go home via `g.sendHome`), `updateFailed` (E = retry,
  Q = give up; **no time-out**), `retry()` (`def.retry = { from, car, with }`: straight back to that
  stage in that car with them aboard; else from the start (or the last `def.retryAt` at or before
  the failed stage), Ove by the giver), `abort()` (also for a running day: hold Q, the pause menu).
- `also(factory, { say, toast, call, callAt, calls, callEvery, quietR, lines, first, every, start,
  done })` (`start` is called with the stage as `this`).

## Stage changes (stages.js), fix round 1

- `goto`: radio `radioFirst` / `radioEvery` (default 6 / 7+0..2 s); radio lines and calls take
  turns (a line due during a call waits for it, nothing starts within ~2 s of the last line);
  `cleanup` hangs up a call still going (`interrupts.hangUp()`); `via: (g) => [points]` guide
  points (target/arrow/map lead through them; each dropped when Ove is within 8 m or nearer the next
  point than it is). Chaser: `car: (g, m) => car` (an existing mission car), `at` (a place), `wait`
  (parked for n s, `wake` m: sets off at once when Ove is that close), `goLine`, `rubber: d =>
  factor` (default 1.3 beyond 80 m, 1.15 beyond 50 m) passed as the driver's `rubber` (drivers.js
  scales the cruise only). The random fallback spawn now leaves the junction on the edge towards
  Ove (`window.__chaserAway` = the old facing-away spawn, for tests). The route planning is the
  cars area's (round 5): by Ove's junction, no U-turns.
- `pickup`: `walk: (g) => [points]` + `speed` — they walk to `at` (staying busy there) instead of
  being put there; Swedish `Stanna så kan ${namn} kliva in.`
- `dropoff`: `walk: (g) => [points]` (where they walk after getting out), `byeSecs`; `Du glömde X!`.
- `holdAt`: `cut: caption` — one press of E: black + caption, the bar fills by itself, back.
  `scene: (g, { open, close }) => scene` (feature luftning_borde_vara_en_scen) — the press of E
  plays a cutscene instead, `cut` its caption going in and `sceneEnd` coming out; the stage is done
  when `scene.update(dt)` says it is over, and `cleanup` calls `scene.dispose()` (a fail, an
  abort). While it runs the stage's `hush` is set (main.js steps the music back to 0.3). Day 3:
  `luftScene` (game/luftning.js), see *Day 3's radiator scene* below.
- `catchCat` (rewritten): modes sit | rest | wander | run | come. Starts somewhere open (most of 12
  directions free ≥ 4 m, never on the asphalt). Bolts when Ove strides (Shift, > 4 m/s) within 7 m,
  walks within 3.2 m or comes by car; runs 3-4.5 s at 6 m/s (7.2 with him within 4.5 m; the run (Shift) is
  5.5) along the best of 12 headings: free run (0.25 m steps with its own collision test, probes
  ±0.3 m so Ove can follow, props included) + away from Ove − leash (18 m) − passing him within
  2.6 m − ending on a road; then sits (rest). Ove standing still (< 0.5 m/s) 1.2 s within 9 m with a
  clear line → it comes to him at 1.1 m/s (round obstacles) and he has it at 1.15 m. Hints in the
  objective line after the first bolt; "Kiss, kiss... Hmpf." the first time it comes.
- `race` (rewritten init): `phase` cut → count → race; the cut (curtain) hides the jump to the
  grid; Ove in the right-hand lane, the opponent in the left one with its lane path shifted left
  until ~16-34 m before the first turn; traffic cleared within 20 m of the whole first straight (and
  45 m of the start); cruise 19, `aggressive` false by default; rubber (on cruise) gap > 30 ? 0.75 :
  gap > 8 ? 0.86 : gap < −40 ? 1.1 : 1; `stage.gap` exposed.
- `destroy`: a ram takes at most `ramMax` (30) Ork; drain 8/s within 12 m; the flee driver's
  rubber 1.2 while Ove is > 80 m off.
- New `cut({ delay, secs, caption, clock, banner, away, then })`: to black and back; `away` puts
  npc keys in `m.data.away` (hidden for the rest of the mission, `npcAway` honours it).
- `lmOr(name, fallback)`: a world landmark that may not exist yet.

## Tests (`tools/scenarios/story.mjs`)

- `story`: all seven days with warps; must end `#7 idle` and `no errors` (~6 min). `FROM=n`.
  Every outro is checked (`outroCheck`: each speaker < 4 m from Ove, nothing taller than 0.6 m
  between them, visible); `OUTRO_SHOTS=1` saves a screenshot per outro line (`out/outro<day>_<k>`).
- `m1`: day 1's trailer with real key presses (unchanged). `m2`..`m7`: one day each.
- No-warp checks (fix round 1), failures counted as errors:
  - `m7chase`: day 7, the Saab parked on Solrosvägen ~100 m from the waiting Škoda; it must come
    within 40 m by itself within 25 s (measured ~11 s). `CHASER_AWAY=1`: spawned 70-140 m off facing
    away, within 35 s (15-26 s: it goes round the block).
  - `m5race`: the race with keys only (a pure-pursuit bot on the right-hand lane, braking for the
    corners); must win. 9/9 won in the last runs, Anders ~55 m short of the line; `RACE_VMAX=22`
    (a careful ~80 km/h driver) also wins.
  - `m4cat`: walk up (it bolts at ~3.3 m), stride after it 6 s (must not be caught in < 5 s), then
    stand 6-7.5 m from it: it must come (6/6 runs: ~5 s). `CAT_TRACE=1` logs every 0.25 s.
  - `lotwalk`: Parvaneh walks from her door to the lot entrance by herself (~28 s).
  - `hospdrive`: from the x = 120 street, a key bot following `missions.target()` (the via points)
    reaches the drop-off under the Akut canopy (~9 s).
  - `retry`: a lost race retries on the grid with Adrian aboard; the failed state is still waiting
    after 16 s; Q then E at the giver plays the 2-line retry intro; a failed day 7 sends Parvaneh home.
- `gate`, `aftermath` as before.

## Fix round 1 (QA story r1, 6/10) — what changed

Majors:
1. **Day 7 chaser**: parked by the lot entrance from the start of the day (Patrick's line), sets off
   2.5 s into the drive (or when Ove comes within 14 m) with a radio line; cruise 24 with a rubber
   band; the driver plans by Ove's junction without U-turns (cars round 5). `m7chase` passes.
2. **Day 5 race**: winnable (see `m5race`); cut to the grid; Ove in the right-hand lane; traffic
   cleared along the first straight; retry from the grid with Adrian aboard.
3. **Day 1 outro**: Ove in front of his garage door facing the lot, Parvaneh 2.3 m in front of him
   (and the generic outro staging for every day).
4. **Day 7 finale**: the warmer bye, the time skip "Senare samma dag" (15:40), Patrick's call on the
   way to the cemetery, "Vilken vecka det har varit." instead of the anglicism.
5. **Day 4 cat**: patience instead of a 3 s catch in the bike shed (see catchCat above).
6. **Day 2**: the girls stand at Jimmy's (`elsewhere`).
7. **Calls and radio**: day 7 calls from 4 s every 8 s, Sara second; radio and calls take turns;
   leftover calls cut off when the stage ends; day 2's five radio lines fit a 36 s drive.

Minors: Parvaneh walks to the lot (no pop-in pickup next to the Saab); outro staging for all
speakers; the Saab for sale at Bilhallen (a mission car in the empty 35 000:- slot) framed on
"Adrian. Den där."; destroy balance; fail flow (no time-out, retry intros, riders sent home); the
review's Swedish lines; 17:30 at the end of days 1-6; no tags / beacon in cutscenes and no banner
over the first outro line; Ordning ≥ 90 with the final banner; the hospital via `hospitalDrop` and
the Akut driveway (guided); day 3's cut; Sonja's dates (photos 1984 / 1988, the wrench 1991, the
Trollhättan emblem 1986); the new tests.

## Changes in files owned by others (allowed list)

- `src/main.js`: PHOTO_NOTES / EMBLEM_NOTES dates; "vill dig något" (start toast, patrol line);
  `dialog()` passes a line's third element as `on`; `walkNpc(ch, pts, { speed, stay, yaw })` and
  `walkPath` / `walkSpeed` / `walkStay` in `stepNpcs` (removeCompanion's `walkTo` may be a list);
  `sendHome(ch)`; `homeSpot` honours `def.elsewhere`; `npcAway` honours `m.data.away`; world tags
  and the beacon hidden while `inDialog`; Adrian's Saab in `landmarks.adrianBay` when it exists.
- `src/game/stages.js`: see above.
- `src/game/interruptions.js`: `hangUp()`.
- `src/game/hud.js`: `runDialog` calls `line.on(game)` as a line starts; `hud.curtain(on, caption)`
  (+ `#curtain` in the HUD markup).
- `style.css`: `#curtain` (z-index 1: over the world and its tags, under the HUD cards; since phase 4
  round 2b the HUD cards fade out with it, `#hud.curtain`, and the objective hides under the
  letterbox; offer toasts are class `offer`, dropped by `begin()`: notes/integration.md).
- `tools/shot.mjs`: "scenario failed" also prints the first stack lines.
- `DESIGN.md`: section 5. (Section 4.5's example memory still says "Sonja, 1970" - not mine to
  edit; the game's photos are dated 1984 / 1988 now.)

## Requests to other areas

- **Cars** (`drivers.js`): thanks for round 5 (the chase works as it should now). A route driver
  with `avoid: true` never overtakes: a player who gets ahead in Anders' lane blocks him for good,
  so the race is mostly decided at the first corner. An `overtake` option for route mode (the flee
  swerve, on straights) would make the race livelier; the story would then raise Anders' cruise a
  little.
- **People** (`models.js`): a kneel pose would read better at the grave than `work 'low'`; a `hold`
  for Ove's phone during the mission calls is fine as is.
- **World**: none blocking. (The bike shed's surroundings have props the cat can't see past with
  `segmentBlocked`'s default; catchCat now probes with its own collision test.)

## Known gaps

- Mission NPCs walk in straight lines between waypoints (Parvaneh's walk to the lot is a fixed
  route from her door).
- Outro speakers who are far away are put next to Ove (behind the camera cut; it is a teleport).
- The race opponent can't overtake (see requests), so being ahead after the first corner nearly
  always wins; a crash or a stuck car loses.
- The facing-away chaser (tests only) needs up to ~30 s: round the block can be ~470 m.
- The flowers on Sonja's grave disappear on reload. The home cat has no collision.
- `m1`'s controller is tuned for this box and this trailer.

## Phase 4 (final polish: reviews/p4_gameplay_B.json) — what changed

### The dialogue camera (camera.js)
`cam.frame(a, b, { extras, side })` is rebuilt around a shot judge (`judge`): for a candidate camera
spot and look point it tests, against the world's collision blocks (walls, sheds, props over 0.65 m,
tree trunks and crowns: `crownR / crownBottom / crownTop`, spruce/thuja dense at 0.8 R, the others
at 0.4 R), the world's `camBlocks` (railings, lamp posts, overhangs), parked cars (OBB + trailer, up
to the roof) and people: (1) the camera spot itself is free (no wall within 0.35 m, no crown, no car,
nobody within 0.75 m, not under a floor); (2) sight lines to each subject's shins, waist, chest and
head (a point subject: two points) are clear and the head/chest land in the picture between the
letterbox bars (the other people in the shot hide each other too: Rune's wheelchair); (3) 15 rays
across the frame are empty for the first 1.5 m (`near`, must be 0) and preferably to 3 m (`fore`, a
soft penalty: a car's bonnet, a sign, a headstone in a corner); (4) thin poles in the middle 60 % of
the picture cost (`poles`). Candidates: both sides × 9 angles (0 … ±1.2 rad) × 3 distances (comfortable,
middle, the closest at which the two fit: never closer) × 2 heights (eye, +0.55 m), then
over-the-shoulder shots behind either speaker (raised ones as the last resort). `cam.cineInfo`
(kind, score, ok, vis, heads, near, poles) and `cam.cineSubjects` are exposed for tests. A new shot
is a **cut** (`cine.cut`), a small reframing (< 1.5 m) eases. `cam.showcase(carOrPerson)` (UPPDRAG
KLART: 16 directions round it, 3/4 front preferred, the subject low and to one side under the
banner) and `cam.pick([{ pos, look, fov }], subjects, { need, fallback })` (hand-placed shots, judged
the same way: the finale). main.js gives the camera `cam.world = () => ({ cars, people })`.
Cost: ~10-40 ms per `frame` call (once per shot, not per frame).
On foot, backed into a wall with the boom at its shortest, the camera swings to the open side
(`swingTo`, ±0.5…1.5 rad) unless the player is turning it.

### Scenes (missions.js)
- `begin()`: `standBefore(giver, def)` (the free spot ~2 m in front of the giver along their
  landmark's yaw, same level, not on a ramp, clear line, nearest to where Ove came from; he stays if
  he already stands 1.4-3 m in front within ±63°), `patrol.dropPursuit()`, `hud.clearBubbles()`,
  every other speaker of the intro is a `cast` member: `beats(lines, cast)` cuts to whoever speaks
  (intros and outros alike). `introOn` like `outroOn`.
- `complete()`: UPPDRAG KLART over `cam.showcase` (or `def.finale(g, 'klart')`), input frozen;
  14:30; `placeCast` rejects ramps and spots more than 0.2 m off Ove's level; day 3 `outroAt` on the
  walkway, day 4 1.4 m out from the door.
- `placeCast` is deterministic and keeps a margin (flake fix 2026-10-10: `story`'s day-6 outro check
  failed ~1 run in 7, `anita … wall=true`: the fan took spots whose sightline only just missed the
  house corner by Rune's ramp - `segmentBlocked` samples every 0.8 m - and the few cm physics shoves
  someone set down by a wall put a sample inside the corner; with no spot it fell back on a random,
  unchecked `freeSpot`). A spot must pass `castSpotOk` (module level): Ove's floor ±0.2 m, no ramp,
  `spotFree`, the body (`n.r` + `M.body`) clear of anything taller than a step, 1.2 m-`M.far` from
  Ove, `M.apart` from the others, the test's own `segmentBlocked` line clear and the line clear by
  `M.side` m to either side (every 0.1 m; cars count). Spots: fixed `CAST_SPOTS` (the old fan, then
  the angles between) with `CAST_STRICT`, then `CAST_LOOSE`, then 1.1 m round Ove, then 1.1 m in front
  (`console.warn`). Kept people must pass `CAST_STRICT` too; the cast's velocity is zeroed. Intros
  (`standBefore`) were never random (fixed list) and are unchanged.
- Day 7 `finale(g, phase)`: 'klart' / 'end' = `graveShot('wide')` (letterbox off for the end banner),
  'outro' = kneel + `graveShot('stone')` (over the shoulder: SONJA, the flowers, the lantern),
  line 4 = `graveShot('face')`, line 7 = 'stone' again, 'done' = stand up. `dusk(on)` scales
  `GFX.sun.intensity` ×0.42, `scene.environmentIntensity` ×0.72, fog ×1.8, exposure ×0.9 (restored on
  fail, abort and 40 s after the end). `kneelSpot(g)`: Ove's root 0.42·k m behind the landing point
  0.62 m from `sonjaGrave` towards `graveFlowers` (the people area's numbers).
- Gate: `GATE = { reports: 3, minSecs: 35, secs: 90 }`, `gate.idle` counts only time with no errand,
  call, chase or dialogue (`updateGate(dt)`); the new day: 10:30, "Tisdagsmorgon", `placeNpcs(true)`
  hides that day's `away` people at once, `g.save()`.
- Texts from the Swedish editor (p4_lang), Jimmy's "Min man!" gone everywhere ("Tjena Ove!",
  "Ove, du är kung!", "Ove! Mannen själv!").
- `updateFailed`: Q, `input.pressed('giveUp')` (if input.js gets it) or the gamepad's B (read
  directly, edge-detected).

### Stages (stages.js)
- `destroy`: `at`, `wait`, `wake`, `goLine`, `waitText`, `escape`, `grace`, `seenAt`, `rubber: [near, far]`.
- chaser: at most `maxCatches` (3) STOPPAD per drive, then he gives up (`giveUpLine`); the backoff
  grows by 3 s per stop.
- `parkIn`: driving forward through the box is not scolded unless the car stops in it nose first
  (> 0.4 s) or stays in it going forward for 3 s; Swedish subs from the editor.
- `catchCat`: never a null spot (fallback `freeSpot`); the cat's geometry and bone texture are
  disposed; `BoxMarker.dispose` frees its geometries and materials; `race.grid` takes the opponent's
  car out of `g.rehoming`; the race's default text "Kom först i mål!".

### Other files (allowed list)
- main.js: the clock starts at 10:30 and is saved (`clock`, and `gate` when a day is pending);
  `cam.world`; `cinematic(a, b, opts)` and `dialog()` clear bubbles; the chat reply skips dialogue;
  NPC walks give up when stuck (no progress of 0.3 m in 3 s: a waiting mission NPC is put at the
  end once Ove is > 25 m away, else skips a point; anyone else is freed and re-homed); `away` people
  never reappear while away and are hidden at dawn (`placeNpcs(true)`); `hideNearCamera` hides
  people within r + 0.75 m of the lens or with the body across the first 1.2 m of the view;
  `dropBust(car)` disposes a driver bust's geometry (removeCar, seat, carjack, wreck).
- interruptions.js: no call while a mission runs or within 40 s after it, none within 14 m of the
  day's giver; mobilen's thanks line.
- patrol.js: `dropPursuit()`; the notebook's street names come from the world's `roadNames`.
- hud.js: `clearBubbles()`; north is +z on the minimap's N marker and the big map (turned half a
  turn; the player arrow follows).

### Tests (story.mjs)
- Every intro / outro / UPPDRAG KLART shot in `story`, `m1`..`m7` is checked as rendered
  (`cineCheck`: raycasts against the real scene meshes; alpha-blended cards and light beams skipped):
  both speakers' heads in the picture and unblocked, nothing within 1.5 m of the lens; every shot is
  saved (`out/intro<day>_<k>`, `outro<day>_<k>`, `klart<day>`); the end banner too (`story_end`).
- `intros`: each day's intro walked up to (W, no teleport next to the giver) from straight out and
  along the walkway from either side (`FROM`/`TO` days); the first shot checked.
- `m6chase`: day 6 from the Saab by the garages with keys (a bot: out of the lot, a LanePath to the
  Škoda, straight at it on the same street): must stop it (3/3 in 29-85 s).
- `gate` (rewritten): an errand at once, three reports, 38 s: no new day; the errand done, near
  Parvaneh's door: day 2 dawns at 10:30 with Patrick gone.
- `smitintro`: a smitare chase going when the intro starts ends quietly; the next call ≥ 40 s off.
- `camtight2`: in front of the garage doors with the camera swung into them: it swings back out.

## Requests to other areas (phase 4)
- **World** (`data.js` roadNames / street signs): north is now +z on the maps, so the
  easternmost-looking street name `Östra vägen` (x = +280) is in the west: please rename it (e.g.
  `Västra vägen`); patrol.js reads the world's lists, so the notebook follows. notes/world.md's
  "Solrosvägen, the street north of Ove's area" is now south of it (z = −40). The sun (`sunaz` 143)
  then reads as SW, early afternoon; ~190 would be noon-south for a 10:30-14:30 day (rendering's call).
- **Input** (`input.js`, fixer A): a `giveUp` action (KeyQ, pad 1) — missions.js already asks for it.
- **Docs**: CLAUDE.md says "+z is south on the map": it is north now (DESIGN §5).

## Phase 4, round 2 (reviews/p4r2_owner_gameplay_story.json) — what changed

### No soft-locks, and a way out of a running day
- `getInCar` / `parkIn` (stages.js) fail with **"Bilen är kvaddad."** when the named car they need
  is dead (day 1: Patrick's car with the trailer wrecked in the box used to say "Kliv in i Patricks
  bil" for ever; the same for the Saab). E retries; `getInCar.init` → `ensureNamedCar` replaces the
  wreck. New def field `retryAt: [stage indices]`: a fail at or after one retries from it (day 1:
  `[3]`, a wrecked Saab doesn't mean backing the trailer in again). `fail()` records `failedAt`.
- **Hold Q for 1 s** gives a running day up (`GIVE_UP.hold`; `input.key('KeyQ')` only — the pad's B
  is also the report hold). `MissionRunner.canGiveUp` (running, a stage, not `inDialog`: no give-up
  in the middle of a talk, the flowers or a cut), `updateGiveUp(dt)`. `startStage()` wraps the
  stage's `prompt()` (`giveUpPrompt`): after `GIVE_UP.hint` (60 s) in one stage a dimmed
  "<b>Q</b> (håll) Ge upp" joins the prompt line; while Q is held the line is "Q Ge upp dagens
  uppdrag" with the fill. `stageT` = seconds in the current stage.
- `abort()` works for a running day too (hold Q, ui's pause-menu button): riders go home
  (`sendHome`, as after a fail), `dropPursuit`, the toast is `def.waitToast` if the day has one
  (day 2 "Hon har inget körkort, Ove.", day 7 "Barnet väntar inte, Ove.").
- Taking a given-up day up again: the `retryIntro`, then for a day with `def.retry` (day 5) a cut
  (curtain 0.65 s) straight to that stage in that car with them aboard (`enterNamed(name)`), as E
  after a fail does — not the drive to fetch the Saab and Adrian again.

### Continuity
- `complete()` and `fail()` call `patrol.dropPursuit()` (a smitare chase from before ended in
  SMET! −8 over the outro). Test: `outrosmet`.
- After every outro: `behindOve()` → `cam.behind(player)` (camera.js: his yaw, or the nearest yaw
  ±0.3…1.2 rad with the boom free — day 1 ends with his back to the garage door) and
  `quietCast(cast)`: `n.chatT = 25` for the cast, `chatGlobalT` ≥ now + 10 (Parvaneh offered the
  saffransris again straight after the scene). `endedAt` = game time the last day ended.
- `updateGate`: a dawn sets `interrupts.nextT` ≥ 75 (the giver first). `begin()` calls
  `hud.clearToasts?.('phone')` (ui adds it). `talk` and `layFlowers` hang up a mission call still
  going when their scene starts (Anita's day-6 call card over the talk with Vita skjortan).
- Day 6 `talk`: Ove is put ~2 m out from Vita skjortan on the open side (away from the Škoda;
  all round, up to 3.4 m; spot ≥ 0.7 m from every car, the line between them clear of cars by
  0.3 m and of anything taller than 0.6 m: `standFor`), then 0.15 s with input frozen before the
  cinematic so the shot is judged on the final positions. (The Saab pulled up alongside on his side
  used to put the Saab between them.) Test: the `story` day 6 pulls up alongside; d = 2.0 m, no
  Saab between, both heads in the shot.
- Day 1 `parkIn`: only a car that stops in the box nose first (> 0.4 s, < 0.5 m/s) is told "Backa
  in!"; a forward pass at 8.6 km/h through the 9.5 m box is not (`giveup` checks).
- Day 1 stage 3 (`homeSaab`, via `also({ start })`, now called with the stage as `this`): the Saab
  > 30 m from home is put back unless it is on screen within 160 m; then the text is "Hämta Saaben".

### Light: "Senare samma dag" (day 7)
`dusk(on)` is an overcast blue hour (`DUSK` levers, exported for look-dev): sun ×0.06 and cooler
(0.72, 0.8, 1.0), `environmentIntensity` ×0.9, exposure ×1.15, fog density ×2.5 and its colour a
grey-blue of the same brightness, the sky dome (`uGain` ×0.55, its horizon `uFog` = the new fog
colour). Everything saved and restored (sun colour too). No hard grave shadows; the snow a bright
blue-grey; SONJA readable; the lantern's flame still reads lit (no extra light needed).
Numbers (`dusk` scenario, inside the letterbox band, before → after): stone median 160 → 131
(p1 13 → 11), wide 152 → 139 (p1 20 → 18), face 94 → 81 (p1 7.6 → 8.2), hospital street 123 → 70;
blue−red 4.5 → 23 (stone). (Round 1's ×0.42 sun gave hard shadows under the snowfall.)

### Pacing and texts
- `GATE.minSecs` 35 → 60.
- Day 3: the key isn't in Rune's Volvo either: hold E at its door (1.3 s, a note in the glove box:
  "utlånad till Anders, 2015") → fetch it at Anders' door across the area (`AT_ANDERS`; Anders:
  "Elementnyckeln? Jaså, den. Den låg i Audin. Varsågod."; the toast adds "Anders sedan 2015") →
  the soprum cars → the radiators. Five stages now (were four; the test's D[3] follows).
- Day 7 flower drive: `also()` takes `calls: [...]` after `call` (`callEvery` s after the one
  before ends, none once within `quietR` m of the stage's target): Patrick (3.5 s), then Anita ("Rune
  sa ditt namn i dag. Två gånger." — "Bra. Det är bra, Anita.") and Adrian ("Ingen rost! Och jag
  prutade fyratusen!" — "Hmpf. Femtusen hade gått."): the morning's "INTE NU!" calls, answered
  this time; ~13 s apart, all three within ~38 s; none within 45 m of the kiosk (`flowercalls`).
- Lines: Vita skjortan's day-7 goLine uses "ni"; Jimmy's ice cream "till lunch"; "Ställ Saaben på
  sjukhusets parkering"; "Rune. Naturligtvis."; "Katten sprang till skogs."; day 7 outro line 5
  "Att jag behöver dem lika mycket som de behöver mig." (then "Hmpf.").

### Camera
- **Singles** (`cam.single(speaker, listener)`): from past the listener's shoulder, 14-22° off the
  line, 1.6-2.2 m behind the listener (never within 1.9 m of them), speaker's eye height (+0.2),
  a 36° lens, both heads judged in the picture (`judge` takes a `fov` now: the frame tests scale
  with it), on the side of the line the camera is on; used only if `ok` and score ≥ 1.45, else
  false. `beats()`: the scene opens on the two-shot, each speaker change cuts to a single (NPC past
  Ove's shoulder; Ove past the last NPC who spoke), every 4th cut a two-shot; a failed single falls
  back to the two-shot for an NPC and keeps the shot for Ove (`SINGLES = false` in missions.js turns
  it all off). In a `story` run ~37 singles and ~30 two-shots, every one passing `cineCheck`.
- On foot in a tight spot (k < 0.6) the camera steps over the shoulder on the **open** side
  (boomFree 1.6 m left/right at shoulder height, with hysteresis), and with the boom under 1.4 m
  the aim moves up to 0.45 m to that side (`lookSide`): Ove lower-left/right, the open space in the
  picture. The swing-away trigger stays at 1.3 m (1.6 m was tried: at his own door facing out it
  swung a good view 90° away). `camwall` measures it; `camtight2` still passes.

### Tests (story.mjs)
- New: `giveup`, `outrosmet`, `flowercalls`, `dusk` (look-dev), `camwall` (see the file header).
- `story`: day 3 follows the new stages; day 6 pulls the Saab up alongside the stopped Škoda and
  checks Ove's spot (d < 4 m, no car between) and the talk shot; after each outro (days 1-6) Ove is
  in front of the camera (< 0.7 rad off its axis), nobody from the cast within 1.8 m of the lens,
  and `chatGlobalT` ≥ the end + 9 s. `retry`: a given-up race day goes straight to the grid with
  Adrian. `gate`: the dawn waits ≥ 59 s of free roam and the next call is ≥ 70 s off (waits 95 s
  for the dawn now).
- `m5race` is flaky when it is not the first scenario in a shot.mjs process (the key bot clips the
  lamp post on the kerb at ~(140, 127) after the (117, 123) corner, stops dead and loses: 33.5 s,
  Anders 17 m) — with round 2's files and with the committed ones alike; run alone it wins
  (~27 s, Anders ~55-58 m short). Not a story change; the bot (or that kerb island) needs a look.

Verified in the private copy (after refreshing with the ui landing 5911916 and the cars landing
6694528): `story` ×4 with the singles (34-37 singles and ~30 two-shots per run, every `cineCheck`
passing) ending `#7 idle` / `no errors`; `m5race` alone (won, Anders 92 m short); `m1`, `m7chase` (under 40 m after 10.8 s), `retry`, `gate`, `giveup`, `outrosmet`,
`flowercalls`, `camtight2`, `camwall`, `walk`, `start` (~61 fps), `m4cat`, `m6chase`,
`hospdrive`, `lotwalk`, `smitintro` all clean; `m5race` see above.

### API changes others must know
- `missions.canGiveUp` (getter) — ui's pause-menu "Avbryt dagens uppdrag" should show/act only
  while it is true (not just `state === 'running'`: an abort in the middle of a talk leaves its
  dialogue running), then call `missions.abort()`.
- `missions.endedAt`, `missions.stageT`, `missions.failedAt`; mission defs: `waitToast`, `retryAt`;
  `also()`: `calls`, `callEvery`, `quietR`; `start` gets the stage as `this`.
- `cam.single(a, b, opts)`, `cam.behind(p)`, `cam.openSide`, `cam.lookSide`; exported from
  missions.js: `DUSK`, `graveShot` (tests).

### Requests to other areas (round 2)
- **UI**: `hud.clearToasts(cls)` (begin() calls it with 'phone'); the pause-menu "Avbryt dagens
  uppdrag" gated on `missions.canGiveUp`.
- **Gameplay systems**: README's Q row (and DESIGN §4.6's: "Q (gamepad B) | ge upp efter ett
  misslyckat uppdrag; håll Q 1 s: avbryt ett pågående"); Parvaneh's small talk still has "Vill du ha
  lite saffransris?" after day 1 (CHATTER_AFTER could drop it once she has brought it); the save's
  `begun` → `gaveUp` path now takes day 5 straight to the grid.

## Day 3's radiator scene (feature luftning_borde_vara_en_scen, 2026-10-11)

`game/luftning.js` `luftScene(g, { open, close })`, run by day 3's last `holdAt` (one press of E at
Anita and Rune's door). ~18 s from the press, ~14 s of it in their kitchen (world/interior.js),
beats in `T` (s from the press):

| s | beat |
|---|---|
| 0 | black, "Ove går in och luftar elementen.", a door; at 0.65 the set and the puppets are built |
| 1.25 | the kitchen (from its far end): Ove on one knee at the radiator under the window, Anita and Rune watching, the cat already on the outer sill. Three knocks: a hollow ring |
| 3.0 | his left side: the ear to the radiator, a hand on it. It gurgles |
| 4.6 | the valve: the brass key between his fingers, Anita's good cup (white, a blue band) in his other hand. 5.0 the key turns, 5.15 the hiss starts (and a thin wisp, fx.exhaust) |
| 6.7 | his face, Anita and Rune behind: the hiss goes on. 7.45 he looks into the camera and holds it; Rune nods off (chin on his chest) |
| 9.05 | a sputter; 9.5 the cup: three drops of rust-brown water, then a spurt (the water rises, each drop plinks higher); 11.1 the key back |
| 11.45 | from the kitchen end: one more knock, a dull thud (it is full). "Mm." and a nod; Anita nods; 12.8 Rune wakes with a snort |
| 13.45 | what Ove sees: the grey striped cat on the sill outside, looking in; it tilts its head |
| 14.25 | what it sees: Ove, eye to eye. "Hmpf." |
| 15.15 | the cat looks away. 16.0 black: "Sex element till. Ett i taget."; 16.7 everything goes; 17.55 the walkway; 18.15 done (UPPDRAG KLART) |

- **Skip**: the skip keys (Space, E, Enter, a click; the pad's A, Y) from 0.9 s on: straight to
  the closing black and out (~2.2 s). The E that started it doesn't count.
- **People**: puppets, not the NPCs: `buildCharacter` + `animateCharacter` with the scene's own
  state (no physics); the real Ove, Anita and Rune are taken off the stage meanwhile (main.js
  `offstage(ch, true)`: hidden, and `hideNearCamera` leaves them be) and put back after as their
  state says (`offstage(ch, false)`), never as they were at the first black: the camera at the door
  may have hidden one of them for that frame, and putting that back kept Anita invisible for the
  rest of the game (fixa_outro_anita). The kitchen window's pane mesh is hidden too (its own
  `visible` restored after). Indoors Anita wears a cardigan, Rune no cap
  or coat (`ANITA_IN`, `RUNE_IN`: made once, as models.js caches a face texture per def). Ove kneels
  (models.js `kneelPose`), his hands placed by the scene (`st.hands`, `st.lean`, `st.head`: see
  notes/people.md) along a keyframe track in his body space: resting on his knee, a fist off the
  radiator (each knock drives it in 6 cm), a palm on its top, the key pinched (its turn rolls the
  palm), the cup round its side. Rune's doze and jerk and Anita's lean and nod are added to their
  bones after `animateCharacter`. The cat is `buildCat()`, sitting, its head turned after `animate`.
- **Said**: only Ove's two grunts from script.js `OVE_REPLY` ("Mm.", "Hmpf."), already voiced:
  `g.say` on a point over his head (a bubble; the murmur with the voices off). Nothing new for the voice tool.
- **Sounds** (`RADIATOR`, made with `audio.synth`): knock (hollow steel), thud (full), gurgle,
  key (tick, squeak, tick), hiss (`stop()`-able: a fluttering band of noise and a thin whistle
  that sags with the pressure), sputter, drip (pitch by the water level), spurt, Rune's snort.
  Levels (story.mjs `luftsound`, offline): peaks 0.05-0.15 like the door's 0.13, the hiss RMS 0.028.
- **Camera**: `g.cam.cine` set directly per shot (`SHOTS`: unit-local camera, look, fov and a slow
  drift), a cut at each change; released at the last black with `cam.behind(g.player)`.
- Tests: story.mjs `luft` (held at each beat for a screenshot, `__luft.pauseAt`; then: back on the
  walkway, no set, pane, people and curtain as before), `luftskip`, `luftcam` (started with the
  camera at Anita, then at Rune: nobody hidden after), `luftsound`; `story` plays it; `vcut`
  with `LUFTSKIP=s` has the reader skip it with Enter.

## Dying of frost during a day (feature avgrunden, 2026-10-11)

If Ove freezes to death out beyond the forest while a day runs (game/cold.js), the day fails
("Ove frös ihjäl.") behind the black at the end of the death, with its banner held until he has woken
up in his bed (`fail(reason, { later: true })`, `showFailed()`): then E tries again and Q gives up,
as after any failure. Whoever rode or walked with him has gone home, the cat he carried is back where
it came from, the Saab (or Patrick's car with the trailer) is at home. Intro, outro and the day's
own scenes can't be interrupted by it (the meter holds while `inDialog`). The race and the chase
can't lead there by accident: the opponent and the Škoda stop where the walls stood.

**Waking up** (game/waking.js, ~12 s, skippable): his bedroom (world/interior.js `buildBedroom`, in
the back half of his real row house; its window is the house's back window, panes hidden: his back
garden and bird table outside), Ove asleep on his back on his half of the double bed, the duvet to
his chin, the alarm clock showing the game's time; her half made up and empty, her pillow plumped,
her photograph and reading glasses on her nightstand; from day 4 the cat sits at the foot of the bed.
2.9 s: a gasp, he sits bolt upright (models.js' downPose held: lying until `downLeft` 1.3, sitting at
0.845), the duvet thrown down to his waist, the cat starts; he looks across at her half; 4.6 s: one of
script.js `WAKE` in the dialogue box (said in his voice; `pickWake()` never repeats the last), a sigh,
black, out at his door. The real Ove is `offstage` meanwhile (the fixa_outro_anita lesson: back as his
state says, never a snapshot).

## Rune dead (feature roligare_runeuppdrag, 2026-10-14)

Rune can die on his errand, or under a car anywhere on any day (feature rune_ar_permadod), and then
he stays dead (`game.runeDead`, game/rune.js; no trying again). A death in the middle of a day
doesn't fail it: the day goes on, and its outro (chosen as it starts) is the widow's one. `story`
fails if a day kills him by itself (story.mjs `runeCheck`).
The days go on without him: `MissionRunner.scene(def, key)` takes the def's `widow` (intro, outro,
tagline) instead, from script.js's `introWidow` / `outroWidow` / `callsBackWidow`:
- day 3: Anita alone ("Har du luftat?", "Han tyckte om när du kom ..."); the outro without his
  "...Saab." ("Rune hade velat att det var du som gjorde det." / "Men elementen skötte han."); the
  kitchen has nobody at his place (no puppet, no snort); "Lufta elementen hos Anita";
- day 6: it is Anita the kommun wants to move ("Nu när Rune är borta säger de att jag inte klarar
  mig själv."), the folder is "Anitas papper", the outro "Så jag får bo kvar? I vårt hus?";
- day 7: at the grave "Rune är borta. Anita bor kvar." (the same beats), and Anita's call back on the
  way: "Jag tände ett ljus för Rune i dag."
Test: `QUERY='&runedead' node tools/shot.mjs story` (`?runedead`: tests only).
