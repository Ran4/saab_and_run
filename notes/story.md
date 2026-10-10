# Story (phase 3b + fix round 1) — notes for later agents

Owner: story agent. Files: `src/game/missions.js`, `tools/scenarios/story.mjs`, this file,
`README.md`, `CLAUDE.md`, `Makefile`. Built on the phase-3a systems (notes/integration.md).
DESIGN.md section 5 describes the seven days as implemented.

## The seven days

| day | id | giver @ place | stages | reward |
|---|---|---|---|---|
| 1 Släpkärran | `slapet` | patrick (+parvaneh) @ parvanehHouse | getInCar patrickCar → parkIn parvanehDrive (trailer, reverse, tol 0.35, clear 14) → report 3 @ guestParking (no smitare) → getInCar saab → parkIn oveGarageSpot; outro at Ove's garage door | 100 |
| 2 Sjukhuset | `sjukhuset` | parvaneh @ parvanehHouse, away: patrick, elsewhere: sara + nasanin at jimmyHouse | getInCar saab (Parvaneh starts walking to the lot) → pickup parvaneh @ LOT_PICKUP (she walks; needCar) → goto hospitalDrop via the Akut driveway (95 s, radio every ~6 s, Jimmy's call) → dropoff (she walks to the Akut door) → parkIn hospitalSpot (either) | 150 |
| 3 Elementet | `elementet` | anita @ runeHouse | fetch wrench @ oveGarage → report 2 @ garbageRoom (Anita calls first) → holdAt runeHouse "Gå in och lufta elementen" (`cut`: one E, black, caption, work 'wall') | 150 |
| 4 Katten | `katten` | jimmy @ jimmyHouse | catchCat @ bikeShed (sit, 110 s, Jimmy: "Spring efter den!" → "Nej, vänta! Stå still!") → goto oveHouse on foot; outro at his door | 150 |
| 5 Saab, inte Audi | `saab` | adrian (+anders) @ adrianSpot | getInCar saab → pickup adrian (needCar) → race Anders (cut to the grid, Ove right lane, Anders left lane on the first straight, cruise 19, careful, rubber band) Solrosvägen → (5,3) → (5,5) → (6,5) → dealerFinish; retry from the grid with Adrian; outro on Bilhallen's forecourt with a grey Saab for sale | 200 |
| 6 Vita skjortan | `vitskjortan` | anita @ runeHouse, away: vitskjorta | getInCar saab → destroy (≤ 30 Ork a ram, drain 8/s, flees faster when far) → talk → grab the folder → goto runeHouse | 250 |
| 7 Värkarna | `varkarna` | patrick (cast, +parvaneh) @ parvanehHouse, away: vitskjorta, snow | setup: the Škoda parked on the west street (−37.25, −5) → getInCar saab (Parvaneh walks to the lot) → pickup → goto hospitalDrop via the driveway (120 s; chaser = that Škoda, sets off after 2.5 s; 5 calls Anita, Sara, Jimmy, Adrian, Anders; radio) → dropoff "Gå nu, Ove. Det är söndag. Hälsa Sonja från mig." → cut "Senare samma dag" (15:40, Saab to hospitalSpot, Parvaneh away) → fetch flowers @ flowerShop (Patrick phones: a boy, he fainted) → holdAt sonjaGrave 3 s (work 'low'; the flowers stay on `graveFlowers`) → outro: Ove alone at the grave | 500 |

After day 7: banner **OMRÅDET ÄR I ORDNING** (Ordning lifted to ≥ 90), free roam continues, the
snowfall stops 40 s later.

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
- **Between days**: the next day opens after `GATE.reports` (2) more reports or `GATE.secs` (75) of
  free roam: 06:30, `Dag N` / "Ny dag", `placeNpcs(true)` (everyone where they spend the new day,
  e.g. the girls at Jimmy's on day 2), the Saab home if Ove is > 60 m from it.
- `begin()` (intro, or `retryIntro` after a give-up), `startMission(from = 0, aboard = [])`
  (`def.setup(g, m)` first; `aboard`: npc keys put in Ove's car), `complete()`: cleanup, UPPDRAG
  KLART (hidden again before the outro), 17:30 on days 1-6, Ove to `def.outroAt`, `outroSetup`,
  `placeCast(keys)` (every non-Ove speaker within 4 m in front of Ove, fanning out, no wall /
  fence / hedge taller than 0.6 m between, kept where they stand if that already holds), the camera
  turns to whoever speaks when there are two others, a line's third element `(g) => {}` is a camera
  beat. `fail(reason)` (riders in Ove's car go home via `g.sendHome`), `updateFailed` (E = retry,
  Q = give up; **no time-out**), `retry()` (`def.retry = { from, car, with }`: straight back to that
  stage in that car with them aboard; else from the start, Ove by the giver), `abort()`.
- `also(factory, { say, toast, call, callAt, lines, first, every, start, done })`.

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
- `catchCat` (rewritten): modes sit | rest | wander | run | come. Starts somewhere open (most of 12
  directions free ≥ 4 m, never on the asphalt). Bolts when Ove strides (Shift, > 4 m/s) within 7 m,
  walks within 3.2 m or comes by car; runs 3-4.5 s at 6 m/s (7.2 with him within 4.5 m; rask gång is
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
- `style.css`: `#curtain` (z-index 1: over the world and its tags, under the HUD cards).
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

- The between-days gate is not saved (reloading opens the next day immediately).
- Mission NPCs walk in straight lines between waypoints (Parvaneh's walk to the lot is a fixed
  route from her door).
- Outro speakers who are far away are put next to Ove (behind the camera cut; it is a teleport).
- The race opponent can't overtake (see requests), so being ahead after the first corner nearly
  always wins; a crash or a stuck car loses.
- The facing-away chaser (tests only) needs up to ~30 s: round the block can be ~470 m.
- The flowers on Sonja's grave disappear on reload. The home cat has no collision.
- `m1`'s controller is tuned for this box and this trailer.
