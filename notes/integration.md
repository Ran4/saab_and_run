# Systems integration (phase 3a) — notes for the story agent (3b) and everyone after

Owner: systems agent. Files: `src/main.js`, `src/input.js`, `src/game/patrol.js` (new),
`src/game/interruptions.js` (new), `src/game/stages.js` (new), `src/actors/pickups.js`,
`src/actors/peds.js`, `src/game/camera.js`, `tools/shot.mjs`, `tools/scenarios/gameplay.mjs`,
this file; for integration only `src/game/hud.js`, `style.css`, `index.html`, `src/audio.js`.
`src/game/shame.js` is gone (the patrol replaces it). `src/game/missions.js` is still the old
Bigmouth story with the Shame calls removed — **3b rewrites it** on top of `stages.js`.

## What the game is now (free roam)

- Ove starts at `oveStart` on the main walkway, 10:30 (phase 4; the clock is saved). The clock runs
  at 15x (an in-game hour every four minutes; `game.clockText()`, `game.setClock(h, m)`).
- **Patrol**: ~8 felparkeringar at the world's `violationSpots` (random type, colour and plate,
  `car.violation`), P-förbud markers on the minimap, tags over the cars within 35 m, hold **F**
  within 4 m on foot / 7 m in a car below 3 m/s: the notebook writes for 1.8 s (pencil sound),
  ANMÄLD stamp, +1 anmälan, +7 Ordning, +10 kr. Releasing F, walking away, the car rolling or a
  phone call cancels it. Reported cars vanish when out of sight 22-40 s later. Up to **6** are open;
  a report holds the next one off for 25-45 s (only 9-16 s while fewer than 3 are open), so
  cleaning up actually thins them out (fix round 1).
- **Smitare**: a driver sits in the car **with the engine idling** (headlights on, exhaust vapour),
  and within 22 m the tag says "… · förare i bilen"; on foot the prompt warns "(föraren sitter
  kvar – ta bilen först?)". When Ove starts writing, it
  flees (AI `flee`, 18-22 m/s); SMITARE panel with the "Ork" bar; ramming (impact > 3) takes
  impact x 4, staying within 12 m drains 6/s; at 0: `pullOver` + hazards + **TAGEN!** (+12 Ordning,
  +50 kr, auto-anmäld); more than 110 m away for 5 s: **SMET!** (−8 Ordning, struck through in the
  log). One pursuit at a time.
- **Ordning** (0-100, starts 50): drains 0.014/s per open violation (one > 150 m from Ove counts a
  quarter; ×0.4 while an avbrott or a call is on; ×0.5 for a minute after KAOS; phase 4 round 2 - it
  was 0.022 and a half); +7 report, +12 TAGEN,
  +10 / −10 errand done / failed, −12 a pedestrian hit by Ove's car, −3 a neighbour or child shoved
  by it, −2…−4 and 5-20 kr per prop Ove breaks
  (car or kick), −1/s driving inside a car-free zone (Anders shouts, once a minute; not in the snow
  tractor, `spec.service`: it clears the walkways), −8 for "lånar"
  a car with a driver, −8 and up to 100 kr självrisk for wrecking someone's car. At 0: **KAOS I
  OMRÅDET** (−50 kr, back to 35, Anders calls a föreningsmöte); at 100: **ORDNING OCH REDA** (+100 kr,
  once per free-roam stretch, i.e. until a mission ends). The KAOS banner leaves out the kronor when
  Ove had less than 5.
- **Avbrott**: a neighbour calls ~90 s into a new game (~45 s into a continued one), then 70-110 s
  after each errand (day gates: element after day 3, forskolan and nyckeln after day 1, katten after
  day 4): the old
  landline rings, the call card, Ove answers ("Ja?"), two lines, Ove's grumble, then an errand with a
  patience timer in the Avbrott panel. Done: +10 Ordning, +30-60 kr, thanks on the radio, an Ove
  "Hmpf.". Too late: −10 Ordning. The nine templates (`TEMPLATES` in interruptions.js): element
  (Anita, hold E 3 s at runeHouse), forskolan (Parvaneh: Nasanin from the preschool home), mobilen
  (Jimmy's phone on the centrum torg, back to Jimmy), punktering (Adrian, hold E 4 s at the bike
  shed), nyckeln (Patrick: the spare key from Ove's door, hold E at Parvaneh's), rune (Anita: find
  Rune on a sidewalk 45-80 m away, push him home; no timer but his cold, and he can die: *Feature
  roligare_runeuppdrag* below), skotta (Anita: three snow heaps in front of
  their door), katten (Sara: catch the cat by the bike shed, carry it to her), skjuts (Jimmy waits at
  the Solrosvägen bus stop, needs a car, and must *ride* to centrum: walking him there doesn't count).
- **Neighbours** at their homes (`HOMES` in main.js): Parvaneh, Patrick, Sara and Nasanin by
  parvanehHouse; Jimmy; Adrian at adrianSpot; Anita with Rune (wheelchair) at runeHouse; Anders;
  Vita skjortan outside Kommunhuset. They turn to Ove, greet him one at a time (CHATTER), E =
  "Småprata med X" (a line and Ove's answer to it: see *Small talk answered* at the end), name tags within 9 m, teal dots on the minimap. The
  current mission giver stands at the mission's spot with the amber marker and waves.
- **On foot**: walk 3.2, spring (run, Shift) 5.5, pushing Rune 3.0 (3.6 with Shift), one jump (apex
  0.55 m, no double jump; half a second's wind-up standing, the grunt at the push, a press never
  lost: a tap jumps, one in the air is kept 0.25 s and acted on at the landing, a dialogue or a car
  ends the wind-up; no kick while winding up; features/implemented/fixa_hoppet.md, scenario `hopp`
  in gameplay.mjs: 11 checks with real key presses), J/click kicks: a tyre (thunk, the car rocks, an opinion by make: "Bra
  däck." / "Plast och elektronik." / "Sommardäck. I november."), the nearest prop (breaks, Ove pays; one
  per kick), a person (they object; nobody is knocked over by Ove's boot). Footsteps from the walk
  cycle (`audio.step` with the world's `surfaceAt`). Poses: `carry` with the cat (at
  `carryPoint`), `work` (+ `workKind`) while holding E in a job, `push` with Rune, `write`, `phone`.
- **Pickups**: pantburkar at `litterSpots` (1 kr, collected on foot within 1.25 m or by car within
  1.8 m, back after 4-7 min out of sight), 7 Saab-emblem and 7 of Sonja's photographs at
  `collectibleSpots` (a faint shaft of light; each plays a note/memory in Ove's handwriting; all
  emblems +150 kr). Saved in `localStorage['saab-and-run-v1']` with kr, mission index and the patrol
  (Ordning, reports, log). The notes are game/collection.js's (`EMBLEM_NOTES` by the order found:
  `game.got.emblems` is a Set and keeps it, saved as an array; `PHOTO_NOTES` by id, each with its
  own picture). Cans picked up ever: `game.cans`, saved as `pant` (with the 30 s autosave, as their
  kronor). **Samlingen** in the pause menu (feature se_pa_trinkets): `game.albumData()` ->
  `hud.renderAlbum(data)` whenever the menu opens; `game.lastFound` (not saved) is what it opens on.
  The pickup note says "Samlingen: Esc".
- **Cars**: every parked car from the world (`snow` on unnamed, not on named/indoor ones, engines
  off), the named ones in `game.named` (`saab`, `patrickCar` with its trailer, `runeVolvo`,
  `andersAudi`), 22 traffic cars of the new types (one bus, one sopbil at most) with seated busts,
  headlights on whenever an engine runs. **Ove's Saab always has the plate `SAB 900`.** People vs
  cars: only a car that itself drives into someone at > 4.5 m/s knocks them over (Ove's own
  walking speed doesn't count); children, Rune (except on his errand: it kills him, game/rune.js)
  and **all the neighbours** are shoved aside
  sideways instead; nobody lying down or in the air is pushed along a bumper (shoved sideways, the
  car slowed as by something soft); traffic brakes for people lying on the road (and for the
  neighbours).
- **Camera**: on foot pivot 1.6 m, boom 4.6 m, pitch ~0.16-0.2; in a car pivot = roof + 0.42, boom
  4.4 + 0.8 x length (+ trailer length + drawbar when towing), pitch 0.15. The boom is cast against
  every collision block taller than the segment, **tree trunks included**, and the world's
  `camBlocks` (roofs, canopies, shelters: overhangs without collision); thin poles are looked past,
  but the camera never ends inside one, nor inside a tree's crown (~1-1.5 m round the trunk). It
  snaps in at once and eases out; pulled in close it stays low, steps over the right shoulder (on
  foot ~0.5 m) and **looks ahead past Ove / over the car's roof** instead of down at his back or the
  roof (garages). People the camera ends up inside are hidden for that frame
  (`hideNearCamera`), except those a scene has taken off the stage (`offstage(ch, true)`: day 3's
  kitchen; `offstage(ch, false)` puts them back as their state says). On foot it swings in behind Ove after ~2.5 s without the mouse while he walks
  forward-ish. `cam.frame(a, b)` (dialogue) tries both sides square on and turned ±17°/±34°, pulls
  each candidate in to its clear part and takes the longest clear one.
- **Title** (phase 4): Ove beside his Saab, rolled 4.1 m out of its bay in front of his garage
  (`titlePose`, `titleShot`), in the low sun; a slow 40 s arc in from the lot puts the two of them in
  the right half of the picture. `start()` puts the Saab back. See "Phase 4" below.

## Game API that stages and missions use (main.js)

| call | what |
|---|---|
| `g.npc(key)` | Character by CHARS key; old Bigmouth keys work as aliases (`maurice` → jimmy …, `nick` → Ove) |
| `g.charDef(key)` | CHARS def |
| `g.player`, `g.playerCar`, `g.focus()`, `g.focusTarget()` | Ove / his car / where the camera's subject is |
| `g.seat(ch, car, side)`, `g.unseat(ch, x?, z?)` | sides: 1 driver, −1 front passenger, ±2 rear (uses `car.seatLocal`) |
| `g.addBust(def, car)` | a cheap seated driver |
| `g.addCompanion(ch, { push })`, `g.removeCompanion(ch, { walkTo })`, `g.isWithOve(ch)`, `g.boardCompanion(ch, car)`, `g.releaseNpc(ch)` | people walking with Ove: they follow him on foot (1.4 m behind when close, else along his trail `g.crumbs`), get in when he gets in (or when he stops within 9 m), get out with him; `isWithOve` holds while they are within 20 m, or beyond it for less than 2 s (never beyond 35 m: they stop following); `push` = Rune, rolled 0.78 m in front of Ove (Ove's `anim.push`, walks at 2.2 m/s, can't jump or take a car); `walkTo` sends them off on foot (then they go home when nobody is looking) |
| `g.setCarrying(obj)` | something with a `.root` in Ove's arms (the cat); hidden while he drives |
| `g.posePlayer('push' \| 'write' \| 'work', workKind)` | hold a pose for this frame (holdAt calls `('work', 'bend' \| 'low' \| 'shovel' \| 'wall')` while E is held) |
| `g.spawnMissionCar(m, type, x, z, yaw, opts)`, `g.ensureNamedCar(name)`, `g.respawnNamed(name)`, `g.homeNamedCar(name)`, `g.addCar`, `g.removeCar` | `removeCar` ends with `car.dispose()` (phase 4): never re-add a removed car. `respawnNamed` puts a new named car at home (wrecks; also Adrian's Saab, which isn't in parkedCars); `homeNamedCar` does it for a dead / missing one |
| `g.byX()`, `g.firstX(x)` | the cars sorted by their west edge (`x - radius`), re-sorted every fixed step: `for (let i = g.firstX(x0 - 2 * g._rmax); i < a.length && a[i].x - a[i].radius <= x1; i++)` = every car whose centre can be in [x0, x1] |
| `g.freeSpot(x, z, rMin, rMax)`, `g.spotFree(x, z)`, `g.groundAt(x, z)`, `g.exitSpot(car, side)` | |
| `g.say(target, text, secs)`, `g.radio(who, text)`, `g.shout(who, text)` | bubble / portrait toast with murmur / bubble if near + toast |
| `g.dialog(lines)`, `g.cinematic(a, b)`, `g.endCinematic()`, `g.onFrame(fn)`, `g.offFrame(fn)`, `g.wait(s)` | unchanged |
| `g.addCoins(n)` (n may be negative, never below 0), `g.coins` | kronor |
| `g.setClock(h, m)`, `g.clockText()` | the in-game clock |
| `g.patrol`, `g.interrupts`, `g.missions`, `g.stages`, `g.horn` | `g.horn.last` = { t, x, z, car }: the latest honk (see *Feature tuta_med_bilen*) |
| `g.freezeCar`, `g.inDialog`, `g.autoDialog`, `g.unlock(what)`, `g.save()` | |

While `missions.state !== 'idle'` main.js sets `patrol.suspended` (no new random violations, no
drain, no car-free penalty, no KAOS/ORDNING events; reporting and `forceSpawn` still work) and the
avbrott scheduler stops (an errand in progress is dropped without blame).

## stages.js (for missions.js)

Same stage interface as the old missions.js (init / update → 'done' | { fail } / cleanup / text /
sub / target / altTarget / markers / obj), plus `prompt(g)` → `{ text, hold, takesE }` (main.js
shows it and doesn't use E for cars while `takesE`) and `tags(g)`. Context `m` = `newCtx(def)` =
`{ def, cars, items, data: { npcs: Set } }`; `disposeCtx(g, m)` removes `m.cars`, runs `m.items`
cleanups and releases every NPC the stages borrowed (`m.data.npcs`). **The MissionRunner should
call `disposeCtx` on complete / fail / abort** (or do the same by hand). Each stage has `kind`.

| kind | options |
|---|---|
| `getInCar` | `{ car: 'patrickCar', any: false, text }` |
| `goto` | `{ to \| who, radius = 7, text, timer, failText, inCar, onFoot, stop, with: [npc keys], radio: [[who, text]], chaser: { type, color, name, who, cruise, catchFails, catchText } }` (chaser = a car in AI `chase` that hunts Ove; `catchFails` fails the stage after 2.5 s within 6 m) |
| `holdAt` | `{ at \| spots: [places], secs = 3, label, radius = 1.8, text, mounds, work, pose, ready }` — hold E on foot (`ready(g)` → null or a text: while there is a text the job can't be done yet, the text is the objective within 8 m and E is left to the rest, e.g. day 3's "Öppna garageporten"); Ove takes the people area's `work` pose of kind `work` ('bend' \| 'low' \| 'shovel' \| 'wall'; without it guessed from the label: lufta/element/lås → wall, skott → shovel, punkter/däck/blomm/grav → low, else bend); `pose: 'write'` keeps the notebook instead; `mounds` puts a snow heap on each spot (Ove stands at its edge, not in it) |
| `fetch` | `{ at, item: 'key' \| 'phone' \| 'wrench' \| 'papers' \| 'flowers', label, text, rMin, rMax, exact, got }` → `m.data.carrying = label` |
| `pickup` | `{ who, at, needCar, text, carText, hello }` — on foot: walk up, they follow; in a car: stop within 9 m |
| `dropoff` | `{ who, at, radius = 8, text, bye, needCar, carText }` — `needCar`: they must arrive in Ove's car (walking beside him doesn't count; `carText` says so) |
| `escort` | `{ who, at \| (none: a sidewalk 45-110 m from `to`), to, push, radius, findText, bringText, hello, min, max, mortal, cold }` — `push`: E takes hold of the wheelchair and E lets go (game/rune.js: it rolls on); home pushed or rolled there. `mortal`: a car at speed or the cold (`cold` s from nothing to dead, quicker beyond COLD) kills him → `{ fail, dead: true }`; `obj()` → `{ cold, temp, note, danger }` (the errand panel shows it instead of a timer) |
| `catchCat` | `{ near, timer, text, rMin, rMax, failText }` — `buildCat()` wanders, bolts within 7 m at 4.3 m/s (faster than a walk, slower than a run), caught within 1.15 m on foot; then carried (`m.data.cat`) until `disposeCtx` |
| `parkIn` | `{ box, car, tol = 0.3, either, trailer, reverse, still = 0.8, text }` — all four corners (and the trailer's) inside the box, heading within `tol`, stopped for `still` s; `reverse`: must have entered the box backwards ("Backa in!" otherwise). Draws an amber outline + chevron on the ground (green when right). |
| `report` | `{ n, near, radius = 70, smitare = false, spawn = true, text }` — force-spawns n violations near `near` and counts every report from the stage's start |
| `wait` | `{ secs, text }` |

Places are a landmark name, `{ x, z, yaw }` or `(g) => place`.

## patrol.js API

`patrol.forceSpawn(n, near, { smitare: false | true | undefined, radius = 70, kinds })` → cars
(nearest free spots to the landmark/point, up to 2.5 x radius; `smitare: true` = every one that is a
street spot outside Ove's area flees, `false` = none, undefined = the usual 40 % of eligible
spots); `patrol.onReport(cb)` → unsubscribe, `cb(car, { caught })`; `patrol.reportsSince(t)` (t =
`g.time`); `patrol.pause(bool)`; `patrol.addOrdning(d)`; `patrol.cancelWriting(reason)`;
`patrol.startWriting(car)` (test hook: starts a report / a smitare's flight); fields `ordning,
reports, log, active, open, pursuit { car, mot, farT }, writing { car, p }, smitareChance, paused,
suspended`. `placeName(spot)` gives the notebook's "Plats" (street names are invented in
patrol.js: `ROAD_NS`/`ROAD_EW`; Solrosvägen is the street north of Ove's area, as the world's bus
stop says).

## interruptions.js API

`interrupts.radioOnly(who, text, reply?)` → Promise (a short call for flavour: ring, one line,
optional Ove reply; missions 7's "INTE NU!"), `interrupts.force(id, { quick })` (quick = no call),
`interrupts.abort()`, `interrupts.active { tpl, ctx, stages, i, stage, timer }` (timer null: none,
`tpl.patience: null`), `.call`, `.onPhone`, `.auto`, `.nextT`, `.done`, `.failed`, `TEMPLATES`,
`.retry { tpl, t, reason }` (a failed errand waiting for E / Q: `tpl.retry`, Rune's once he has died;
`tryAgain()`, `giveUp()`, `tpl.onRetry`, `tpl.onGiveUp`).

## Debug hooks and test URL params

`window.__game`, `__lm(name)`, `__props`, `__stats()`, `__patrol`, `__interrupt`, `__stages` (the
stages module), `__titleCam = { pos, look, fov }` (title look-dev). URL: `?test=1` (no title, no
pointer lock, auto dialogue, **no automatic calls** unless `&calls`), `&fresh` (ignore the save),
`&mission=n`.

Scenarios (`PORT=88xx ../browserslot node tools/shot.mjs <names>`), all print `[t]` lines:
`start views aerial drive tow walk talk story smash traffic cruise title` (shot.mjs) and
`stages report pursuit interrupt errands collect patrol freeroam` (scenarios/gameplay.mjs), plus
fix round 1's `bump plough shove camtight drain pausemenu uicheck portraitlight audiolevels` (see
below). `story`
now starts missions robustly: it re-reads the giver's position every attempt (the old flakiness
was a race: right after a mission ends the next giver is re-placed one frame later, so the single E
tap landed 7 m away), retries E up to five times and falls back to `missions.begin()`; the follow
mission trails the van along its own breadcrumbs instead of warping onto its bumper (which blocked
it at a corner).

## Fix round 1 (QA r1, 6/10) — what changed

Majors:
- **Brisk walk into a parked car knocked Ove over**: `carsVsPeople` judges a hit by the *car's* own
  speed into the person (`car.v · n > 4.5` and `car.speed > 3`), not the closing speed. `bump`:
  4 s of Shift+W into the Saab's side: 0 knock-downs, Ove stops at the door.
- **Traffic ploughed bodies along**: `obstacleAhead` sees people who are down or flung (and the
  neighbours, which it didn't test at all); a person who isn't on their feet is shoved out sideways
  (the side they are on, ≤ 0.22 m per step, only 35 % of the push along the bumper) and the car
  loses 20 % speed per contact step (`shoveAside`). `plough`: a traffic car at 12 m/s stops 6.6 m
  short of a body; Ove's Saab at 40 km/h into one moves it 1.1 m sideways, 0.3 m along.
- **Kids and Rune stuck to the bumper**: the same sideways shove (+ 2.5-4.5 m/s sideways velocity)
  for every invulnerable person, the car slowed 14 % per contact step, −3 Ordning and a line
  ("Akta!", "Ove! Titta dig för!") when Ove's car does it. All HOMES neighbours are invulnerable
  now. `shove`: a child / Parvaneh in the lane, W held from 0 → 49 km/h: carried 0.4 / 0.2 m, moved
  1.2 m sideways, never flung.
- **Camera in trees and heads**: see Camera above (trunks block the boom, crown reach at the end,
  `camBlocks`, `hideNearCamera`). `camtight`: the Saab with a birch behind it → boom 3.6 m in front
  of the trunk; Anita teleported onto the camera → hidden; Ove's garage nose out → over the roof to
  the lot (the day-7 shot had the roof filling half the screen); garbage room / bike shed with the
  wall behind → over-the-shoulder.
- **Ordning drain was a countdown**: see Patrol / Ordning above. `drain`: 0.133/s with 6 open (was
  0.199 with 8), 0.05/s during an errand, 3 reports keep the open count at 3 for 20 s+.

Minors: pause menu (pointer released on pause, Esc / P / gamepad Start resume after 300 ms, N
toggles sound while paused; hint "Esc P fortsätt · N ljud"; `pausemenu` checks P, Esc and the
button); speech bubbles kept whole on screen and below the status strip, wrapped at 340 px, the
tail still pointing at the speaker (`--tail-dx`); snow footsteps (crunch buffer RMS-normalised +
soft-clipped; steps play a spike-squashed copy from slices within ±1 dB through their band-pass,
with a soft tail: `audiolevels` → five sessions' median peaks −19.7…−20.7 dBFS, was −27 with
outliers to −15); skjuts needs the car to the end; smitare cues (engine idling, tag, prompt); Rune
(push 3.0 / 3.6 with Shift, found 45-80 m out, "Rulla hem Rune till Anita"); overlapping world
tags (nearest stays, farther ones step up, at most three labels); camera vs Ove's back + autoTurn;
one kick breaks one prop; neighbours shoved, not flung; a quiet "Patrullera" objective in free roam
(open count, nearest distance, who wants something); "Ove betalar för det han förstört"; no "−1 kr";
snow heaps (bigger, smooth, snow surface); the cat in the `carry` pose at `carryPoint` (calls
`cat.hold(on)` when the people area adds it); `work` poses for hold-E jobs.

UI review leftovers: the countdown digit has no band (a text shadow instead); bad/chaos bands a
cooler red-black, softer vertical fade (45 px); "anm." after the report count; letterbox bars equal
in dialogue (both max(9vh, 118 px), compact 760 px subtitle block, 84x100 portrait); round portrait
crops by a clipped circle + scaled image (no `object-view-box`); a hand-drawn SVG tick in the pause
log; the stamp says "KL. 06.42" and the notebook / log write times 06.42; the engine at full
throttle −26 dB RMS / ~1 kHz centroid (was −22.7: drive 0.8 + 1.0 × load, low-pass load term 800,
valvetrain saw 0.04, louder only by 0.03 × load), ~4.5 dB over the music; portraits lit with
keyPos [-1.4, 0.8, 1.3], fill 0.55, env 0.5 (compared with the people area's [-1.3, 0.7, 1.5] /
0.7 in `portraitlight`: a little more shape in pale faces). Ove's Saab's plate is fixed (`SAB 900`).

Also: `cam.frame` no longer puts the dialogue camera behind a wall (day 1's intro at Parvaneh's
door framed a shed wall after the tree change; day 7's did before); footsteps use the world's
`surfaceAt`; `input.lock()` never leaves an unhandled rejection.

## Deviations from DESIGN.md (contract changes)

- 4.1: about **6** violations (not 8); smitare only on **street spots outside Ove's own area** (40 %
  of those); a smitare sits with the **engine idling** (headlights, exhaust) and its tag says so.
- 4.2: the drain is **0.022/s** per open violation (a far one, > 150 m, counts half; ×0.4 while an
  avbrott or call is on; ×0.5 for 60 s after KAOS), not 0.08; −3 when Ove's car shoves a neighbour
  or a child.
- 4.3: skjuts: Jimmy waits at the bus stop and must ride (dropoff `needCar`); the rune errand finds
  him 45-80 m out.
- 4.4: children **and the neighbours** are never knocked over by cars (shoved aside); pushing Rune
  3.0 m/s, 3.6 with Shift; a kick breaks only the nearest prop.
- 4.6 / 9: Esc and P both pause *and* resume (gamepad Start too); the pause menu frees the mouse.
- 8 (main.js side): `anim.carry` + `carryPoint` for the cat, `anim.work` + `workKind` for hold-E jobs.
- 9: `hud.setObjective(o)` takes `o.quiet` (the small free-roam line); bubbles wrap at 340 px;
  `PORTRAIT` = env 0.5, fill 0.55, keyPos [-1.4, 0.8, 1.3].

## Requests to other areas

- **Story** (`missions.js`): day 3's radiator `holdAt` → `work: 'wall'` (drop `pose: 'push'`; it is
  guessed from the label meanwhile, so it already works), day 7's grave `holdAt` → `work: 'low'`
  (guessed from "blommorna" meanwhile).
- **Cars** (`drivers.js`): `pullOver` can stop a caught smitare on a kerb island near a junction,
  tilted with a wheel in the air (QA qa_chase_pulled.png): pick the stop point on the lane's outer
  edge (lateral ≤ RHW − 1.1 from the road centre) and keep braking in the lane if the projected stop
  point is on a kerb (`groundAt > 0.1`). Also: the freeze (dialogue, failed state, `freezeCar`)
  sets `ctrl.handbrake = true` (and throttle 0, brake 1) — please key the reversing lights off that.
- **People** (`models.js`): `cat.hold(on)` (curled, carried) — main.js already calls it when it
  exists; a shovel / wrench prop for the `work` poses would sell them.
- **World**: thanks for `camBlocks`, `surfaceAt`, `roadNames` (all used now except `roadNames`:
  patrol.js's lists are identical). If tree blocks could carry their crown (radius, bottom height)
  the camera wouldn't have to guess it from the trunk radius.

## Known gaps

- NPCs walk in straight lines when walking home or off after a drop-off and slide along walls
  (companions follow Ove's trail since phase 4); errand NPCs are teleported to where the errand needs
  them (Nasanin to the preschool, Jimmy to the bus stop) when it starts.
- Reported cars just vanish out of sight (no tow truck, no owner walking up).
- The clock does not move the sun.
- The camera hides people it ends up inside rather than avoiding them; crowns are guessed from the
  trunk (~1-1.5 m), so a wide spruce can still brush the view.
- The cat's legs hang through Ove's forearm until `cat.hold()` exists.
- Resuming the pause menu with Esc can't re-lock the pointer (Esc is not a user gesture): the next
  click does.

## Phase 4 (fixer A: robustness, input, save, UI, small talk, the loop's cost) — what changed

The list was reviews/p4_gameplay_A.json; fixer B's story/cinematics list is in notes/story.md "Phase 4".

**Input (input.js).** The pad: the first connected one with `mapping === 'standard'`, else a
non-standard one only once one of its buttons has been pressed (an accelerometer has none, and its
resting tilt would steer Ove and spin the camera for ever); every
axis and button is read with a default of 0 and through `Number.isFinite` (a 3-axis "pad", e.g. a
laptop accelerometer on Linux, made `look().y` NaN: a NaN camera, black screen; 0-1 axes made Ove's
position NaN and "collected" every can). Buttons go into fixed Float32Arrays (no garbage per frame).
`throttle()` / `brake()`: the triggers (RT / LT) once they have been seen moving; until then (a pad
without analogue triggers) the left stick drives: forward = gas, back = brake. New action **`giveUp`**
(KeyQ, pad B) - missions.js's `updateFailed` uses it. camera.js ignores a non-finite look and repairs a
non-finite yaw / pitch / boom.

**Pause.** `pause(on)` also on `visibilitychange` (hidden) and window `blur` (pointer lock isn't
always on: a resume by Esc can't re-lock), only once the game has started. A hidden tab suspends the
AudioContext (`audio.suspend(on)`; music, engine and ring are all scheduled on its clock, so they
wait). Pausing stops the landline bell (`audio.ring(false)`); resuming rings it again while the call
is unanswered (`interrupts.ringing` = `call.k === 0`; the call script waits anyway) and restarts the
pencil if a report is being written.

**Save (main.js `load`, patrol.js `fromSave`).** Every field is checked: mission an integer 0-7, kr an
integer >= 0, clock 0-1439 (else the default), emblems / photos integer ids 0-6 (in the order found),
`pant` an integer >= 0, unlocked strings, the
gate only between days 1-6; Ordning a finite number 0-100 (else 50), reports an integer, the log only
objects with string fields. `reda` (ORDNING OCH REDA paid) is saved and restored (and taken as paid if
the meter is full): it paid +100 kr on every reload with a full meter. `game.isNewGame` (no day done,
no report) decides the title's button and the start toasts.

**Cars.** `removeCar` ends with `car.dispose()` (plate, lamps, trailer, bust; 60 spawn/remove cycles:
+90 geometries / +14 textures / +7 programs before, +21 / +2 / 0 now, flattening out: lazily built
shared things; a control run without cars: 0). `addBust` gives the bust fixed matrices. Named cars are
never gone: a wreck (> 20 s, > 60 m from Ove, home out of sight too, free roam) is replaced at home
(`respawnNamed`), and `homeNamedCar` replaces a dead or missing one (the wrecked Saab used to be gone
until a reload). A borrowed traffic car (`wasTraffic`, set in `enterCar`) is removed once Ove left it
30 s ago and is 120 m away (free roam only; every carjack used to add a car for good). `warmCars`
(cars) is called during loading, and car.js now compiles it with the composer's scene target bound
(gfx's precompile does the same); the first Saab entry compiles no program.

**Loading.** At "Tar porträtt…": `uploadGeometry()`, `precompile()` and `warmCars()` start, and the
loop waits for them: first frame ~0.4 s (rload: 415 ms, 141 programs; was ~1 s).

**The loop's cost.** At most 2 fixed steps per frame (`MAX_STEPS`; a 4-step catch-up made slow
machines slower). The cars are kept sorted by their west edge (`byX`, insertion sort once per step)
and every "cars near here" query in the step uses it: car-car contacts are a sweep along x that skips
pairs where both cars sleep (12,720 pair tests -> a few hundred), and `carsVsPeople`, `carRoofAt`
(every character, every step), `obstacleAhead` (AI) and `carThreat` (pedestrians) look only at cars
in their x band. Traffic AI more than 120 m from Ove and pedestrians that far away update at 30 Hz
(half on even, half on odd steps; car physics stays at 60 Hz; chases, smitare and mission drivers are
never throttled). Pedestrians beyond 190 m (not drawn) are taken out of the scene graph: their ~45
bones each were 742 of the scene's 1,887 auto-updating nodes. Fewer per-frame allocations: scratch
lists for tags, minimap markers, the prompt; `patrol.tags(out)` / `markers(all, out)`; the route is
planned every 4th frame; no object spread for the camera; `input.look()` returns one object; hud.tags
pools everything.
gperf (1280x720, RTX 4070, other agents on the machine; mean/p95 ms): stepWorld 1.46/2.50 -> 0.5-0.6/
0.8-0.9 per step, update 2.59/4.20 -> 1.7-2.0/2.3-3.3, minor GCs 6.7/s (2.7 ms/s) -> 3.2/s (1.4 ms/s);
at 3x CPU throttle update was 4.5 ms with up to 3 steps per frame.

**Companions.** `isWithOve` with hysteresis (see the API table): the forskolan objective flipped
between "Du glömde Nasanin!" and the drop-off ~35 times in 70 s. Companions follow Ove's trail
(`g.crumbs`: a point every 0.6 m, the last 48) when more than 3.2 m behind; one pressed against
something for 2.5 s while he walks on is put on the trail ~2 m behind him once neither spot is on
screen (`onScreen`). `companion` scenario: 120 s walked by a route-following bot, 0 flips, never more
than 3.7 m behind.

**While Ove drives** player.x/z/y follow the car every step (they stayed where he got in: neighbours
were sent home in plain view); `placeNpcs` and `syncAll` use Ove's car when he drives.

**Calls.** A call cut off because a mission began (Ove walked up to the giver while it rang) is
retried 45 s or more later (B already keeps calls 14 m from the giver and 40 s after a mission).

**HUD.** Car-free chip in the prompt line while Ove's car is in the car-free area in free roam
("Bilfritt område · −1 Ordning/s · Kliv ur och gå", `.pr-warn`; in the snow tractor a plain
"Snöröjning · traktorn får köra på gångvägarna" instead).

**The snow tractor** (feature snotraktor; notes/cars.md has the car): a named parked car
(`named.tractor`, home = its bay: a wreck is replaced there like any named car's, one left beyond
`BOUND` goes home). One seat (`freeSeat` returns null for `model.seats === 1`: companions don't board,
errands that need someone along say "Det finns ingen plats i bilen."). The first time Ove gets in each
session a toast says whose it is ("Föreningens snöröjningstraktor. Ove har nyckel, förstås. Den får
köra på gångvägarna."). A mission that wants the Saab (`getInCar({ car: 'saab' })`) says "Fel bil." in
it, as in any other car. Neighbours' name tags only within
5 m, or for the one an E would greet and the day's giver within 12 m; identical overlapping tags merge
("2 × Bil i bilfritt område", hud.js). The cat by Ove's door is hidden during Sara's 'katten' errand.

**Title** (main.js `titlePose`, `setupTitle`, `idleTitle`; index.html, style.css, hud.js). See notes/ui.md.

**Words** (p4_lang via the review): small talk by day (`CHATTER` is day-blind; `CHATTER_AFTER[key] =
[missions done, lines, replace]`, `replace` retires the base lines: Adrian after day 5), the cat lines
from day 4, no "god morgon", "i dag / i går / i kväll", ”Saab”, "övningskörningsskylt", "Elementet
klickar", the 'katten' errand only after day 4 (`after: 4`) and as Ove's cat, "Lås upp", "Hämta Jimmy
med bil vid busshållplatsen", "närmaste här intill / 20 m bort", "Kliv in", "För lite luft. Som
vanligt.", "Jaså. Här ska vi stå, minsann.", one wording per violation (`KINDS` -> `hud.kinds`, non-
breaking spaces in "24 timmar" / "10 m").

**New scenarios** (gameplay.mjs): `gperf` (update / stepWorld / syncAll / hud, steps per frame, minor
GCs with `GPERF_GC=1`, `GPERF_THROTTLE=n`), `carcycle` (spawn/remove through removeCar, renderer.info,
with a control phase; `CC_N`), `gamepad` (standard pads with 0 / 1 / 3 axes and NaN axes, an ignored
accelerometer, a non-standard pad woken by a button, stick throttle), `corruptsave`
(nine seeds), `tabhide` (hidden tab, blur, the bell behind the pause menu), `titlecheck` (new game,
saved game, Kontroller, Nytt spel, start toasts, the rolled-out Saab shoves nobody), `quality` (Auto ->
Hög -> Låg, persistence, old keys, URL), `recycle` (wrecked Saab back, borrowed car gone, player x/z
while driving), `smalltalk` (forbidden lines per day, katten by day), `tagmerge`, `companion`, `p4ui`
(banner bands, toasts under the letterbox), `titlecam` (title look-dev: `TC`, `TCJS`, `TCRAW`).

## Phase 4, round 2 (whole-game review: reviews/p4r2_owner_gameplay_systems.json) — what changed

**Game time = physics below 30 fps** (main.js `loop`). The frame dt handed to everything (timers,
hooks, dialogue, the clock, the Ordning drain, idleTitle) is clamped to `MAX_STEPS * STEP` (2/60 s)
and at 0 below (a rAF time a little before `last` could give a negative dt). Below 30 fps the whole
game slows down uniformly instead of the missions' and errands' timers running up to 1.5x faster than
the cars and people they time. `dilation` (a frame hook busy-waits 48 ms, ~17-19 fps, 4 s): g.time /
(stepN / 60) **1.502 -> 1.000** (g.time 3.80 s vs physics 2.53 s before; 2.27 / 2.27 now); at 60 fps
4.00 / 4.00 both.

**Small talk by story time** (main.js `CHATTER`, `CHATTER_FIRST`, `CHATTER_AFTER`, `chatterFor`). A
base or later line is a string or `[line, when(m)]` (m = the MissionRunner); helpers `met` (index >= 1),
`eveningOfDay1` (index 1, gate closed: Patrick hasn't fallen yet), `onDay(d)` with `storyDay(m)` = the
day it is (the evening after day n is still day n). Before day 1 (index 0) Parvaneh, Patrick, Sara and
Nasanin say only `CHATTER_FIRST` (they moved in yesterday: no line names Ove; no dinner, saffransris or
IT-konsult; "Han har backat i en kvart nu. Minst." sets up "Tjugo minuter."). Saffransris / middag /
IT-konsult from day 1 on, "stege igen" and Patrick's new "Släpet står helt rakt. Jag har tagit en bild på
det." only on the evening of day 1, Anita's "Tack för i går" only on day 4. `smalltalk` checks every day
with the gate open and closed (0 forbidden lines; it pushes an error otherwise), prints the day-0 lines
and every errand's availability by day. The chat prompt is "**E** Småprata med X" (was "Hälsa på").

**Errand day gates** (interruptions.js `TEMPLATES[].after`): element after day 3 (the elementnyckel is in
Rune's Volvo until then), forskolan and nyckeln after day 1 (the new neighbours phone Ove once they have
met him), katten after day 4 as before. Availability by day 0..7: element `...xxxxx`, forskolan and
nyckeln `.xxxxxxx`, katten `....xxxx`, the rest always. `force()` still bypasses `after` (the `errands`
scenario forces all nine at day 0: 9/9 ok). A new game's first call comes at **90 s** (`isNewGame`; 45 s
on a continued one). New lines: forskolan "Kan du hämta Nasanin på förskolan? Jag hinner inte, och
Patrick... ja. Du vet." (fits before and after his cast), katten "Bär katten till Sara" / "Han hittade
hem själv till slut. Men han var jättekall.", skjuts hello "Tjena! Vilken service!" (he may be picked up
in a borrowed car).

**An answered errand dropped by a day's start** says so: `tpl.busy` per template ("Du är upptagen? Okej,
jag ringer Jimmy."), radioed 1.6 s after the intro is over (`interrupts.dropNote`; only when the abort
happens with `missions.state !== 'idle'`: tests and `force()` drop silently). No Ordning penalty.

**Patrick on a continued day-2 morning** (main.js `syncAll`, `start`): on the title `away` NPCs stay
hidden (`away = npcAway(k) && (title || ...)`: the title un-hid them every frame and Patrick, in hospital,
stood at his door after Fortsätt), and `start()` runs `placeNpcs(true)` once. `titlekeys`: Patrick
`hidden` on the title, 1.5 s later, 6 s after Fortsätt and at Parvaneh's door.

**The title starts with keys and the pad** (main.js `titleKeys`, input.js action `begin`): Enter,
NumpadEnter, Space, E; pad A, Y, Start. Not while `#title.ctl` (Kontroller) or `#newgame.confirm` is up,
and the keys not while another title button has the focus (its own Enter / Space). Never Mouse0 (the
'skip' action has it). input.js: `input.playing` (set by `start()`): Space, Tab and the arrows are
preventDefault'ed only in the game, so Tab walks the title's buttons. New `input.keyPressedAction(a)` /
`input.padPressedAction(a)` (`pressed(a)` is their or). No `play.focus()`: Tab reaches it first anyway,
and a programmatic focus would draw the focus ring on the title. A pad press can't lock the pointer (no
user activation): the next click does, as after an Esc resume.

**Clock** (main.js `clockCap`, `tickClock`): it stops at 14:30 (`DAY_END_MIN`, missions.js's DAY_END)
before day 1, between days and while a day waits or runs (days 1-6), runs free while day 7 runs (its cut
sets 15:40), stops at 16:30 after the story; it never goes backwards by itself, wraps at midnight and is
saved `% 1440`. (It used to reach 15:20 in the gate and 1440+ after ~33 min post-game, which a reload
threw away.)

**Saves.** `save()` writes `begun` (the index of a day under way or given up and waiting); `load()` adds
that day to `missions.gaveUp`, so after a reload its giver says only the `retryIntro` (`reloadday`: day 4,
6 lines -> 2). Day 3 has no `retryIntro` (missions.js): it still plays its whole intro. More autosaves:
interruptions `complete()` / `fail()`, patrol `escaped()`, KAOS, ORDNING OCH REDA (a report, a TAGEN! and
a collectible saved already).

**KAOS hold, pursuit guard, the meter during missions** (patrol.js). `newStretch()` (main.js, when a
mission has ended) sets `eventHold = 12`: KAOS / ORDNING OCH REDA wait 12 s (counted outside dialogue)
- KAOS fired the moment day 6's outro ended. While `suspended` (a mission runs) losses stop at 1 (or
where the meter already was). `updatePursuit` returns without touching `mot` / `farT` while `g.inDialog`
or a day's intro / outro runs. `r2checks`: meter 1 after −100 in a mission, KAOS 11.9 s after the end.

**Ordning balance**: DRAIN 0.022 -> **0.014**/s per open violation, a far one (> 150 m) counts a
**quarter** (was half). `drain`: 6 open, nobody reporting **0.133 -> 0.083/s** (5 a minute), during an
errand 0.05 -> 0.035/s; three reports in a row hold the open count at 3 for 20 s+ (the meter 67.3 ->
66.7 over those 20 s). About one report a minute now holds the meter (+7 against ~4-5 a minute with
4-5 open), two a minute fill it. The reviewer's slow player (21 reports and 8 errands in 75 min) loses
~42 instead of ~83 in his first 11 minutes by this estimate, i.e. ends them at ~63 instead of 22.

**Cars and people.** Trailers are solid for people (`carsVsPeople`: every car with a trailer, its
`trailer.obb` within `len/2 + 1` and below `trailer.y + 1`: pushed out standing, `shoveAside(ch, car,
hit, carIn, trailer.obb)` when towed); `r2checks`: Ove walking into Patrick's trailer stops 1.06 m from
its centre line (half width 0.75 + his radius 0.31; he ended at -0.71 inside it before). `kickTyre` wakes
a sleeping car (`car.wake()`): roll 0 -> 0.026 rad (the impulse used to sit in `_sus.rv` until something
else woke it; the cars round 2 also wakes a sleeping car on any push on its springs - both stay). A carjacked driver is re-homed (peds.js `Ped.rehome()`: the nearest point of the nearest
sidewalk loop, briskly, then on round that loop; it walked at its old loop's next corner, across town),
and is let out on the car's side that faces that sidewalk (`nearestSidewalk(x, z)`, peds.js; on the
driver's side the car itself stood in the way: a first version stood against its flank, 0.4 m in 14 s):
`r2checks` the driver walks 11.8 m in 14 s.
Tyre opinions by make (`TYRE`; Rune's own Volvo by name): no "Japansk skit." (there is no Japanese car),
no more "Typiskt" there.

**Story leftovers.** `storyWorld()` lays Sonja's flowers after the story when none lie there
(`flowersOnGrave`, missions.js; the finale's own stay). The title says "Fortsätt · Fri patrull" after
day 7.

**Perf.** `prewarmItems()` (init): one Collectible of each fetch item (key, phone, wrench, papers,
flowers) and a cat, 30 m under Ove while `precompile()` runs, disposed after: `errandprog` (each template
forced, Ove at its target with the item in view, E held): programs added mobilen 1, nyckeln 1, katten 1
-> 0 for all nine (146 programs at start). Collectibles (pickups.js `tick(t, cam)`): the item itself is
not drawn beyond 60 m from the camera (the beam is), the holders of emblems / photos (`opts.static`),
the beams and the photo's planes have fixed matrices. `collcull` (main-pass draw calls, culled vs every
item drawn as before): start 560 vs 567, street 428 vs 439, aerial 490 vs 516.

**Loading.** main.js imports town.js as a namespace too (`TOWN`) and awaits
`TOWN.buildTownAsync(scene, onProgress)` when town.js exports it (rendering's chunked build; the
loading line reads "Plogar gatorna… 40 %"), else runs `TOWN.buildTown(scene)` in one task as before.
Nothing after it runs before it has resolved. With rendering's build landed, `rload` (RLOADN=3, min /
median): the town 2.80 / 2.85 s in chunks, the loading line updated every ~0.1-0.2 s through it (it
was one 2.4-2.7 s task), longest task 710 / 714 ms (after the town), ready 5.68 / 5.78 s, first frame
9.1 / 9.4 ms with no new programs; `errandprog` still 0.

**Art.** The finale bouquet (pickups.js `bouquet()`): eight roses (bud + three nested five-lobed petal
cups, outer ones darker pink), stems, leaves, a two-sided kraft-cream paper cone with a crumpled rim cut
low at the front (-z: up when it lies on the grave or tips forward in Ove's hands), a ribbon, cut stems
out of the bottom; ~7k triangles (`bouquet` look-dev scenario). Title pose (`TITLE_POSE`, `titlePose(o)`):
Ove's hands in his jacket pockets (`model.style.pockets`, reset in `start()`), body three-quarters,
head turned to his Saab (`anim.look` -0.6). Turning the Saab so the sun rakes its camera-side flank was
tried (`titlepose` scenario, TP=...): the lot's other row and the bus shelter leave only the south-east
camera side, from which the flank only catches the sun broadside with the nose into the title card;
it stays straight out. With the world's slate-blue Saab (round 2) the car reads on the title now
(bonnet and grille catch the light).

**API changes others should know (round 2).**
- input.js: `input.playing` (main.js `start()` sets it), `input.keyPressedAction(a)`,
  `input.padPressedAction(a)`; action `begin` (Enter, NumpadEnter, Space, E; pad A, Y, Start).
- main.js: `clockCap()`, `tickClock(dt)` (the clock no longer just adds dt), `titlePose(o)` (look-dev
  options), `prewarmItems()`; `chatterFor(key)` returns a reused array (read it at once). The save has
  `begun`. `shoveAside(ch, car, hit, carIn, obb = car.obb)`.
- patrol.js: `eventHold` (s; `newStretch()` sets 12); `addOrdning` stops losses at 1 while `suspended`;
  `updatePursuit` freezes during dialogue / intro / outro.
- interruptions.js: `TEMPLATES[].busy`, `interrupts.dropNote`; `after` on element (3), forskolan (1),
  nyckeln (1), katten (4).
- peds.js: `Ped.rehome()`, `nearestSidewalk(x, z)`.
- pickups.js: `Collectible.tick(t, cam)` (cam optional: culls the item beyond 60 m), opts `static`; the
  'flowers' geometry's open front is -z (see above).

**Requests.**
- Story (missions.js): day 3 ('elementet') has no `retryIntro`, so after a reload mid-day 3 or a give-up
  Anita says her whole 6-line intro again (every other day gets its 2 lines). Something like
  `[['anita', 'Ove... elementen klickar fortfarande.'], ['ove', 'Jag hämtar nyckeln.']]`. Exporting
  `DAY_END` would let main.js drop its literal 14:30 (`DAY_END_MIN`).

### Phase 4, round 2: integration (after all seven landings)

Closed the cross-owner requests above and from the other handbacks:
- Day 3 got its `retryIntro` (Anita: "Ove... det klickar fortfarande i elementen." / "Jag hämtar
  nyckeln."); `reloadday` with `RD_INDEX=2`: 2 lines. missions.js exports `DAY_START`/`DAY_END`;
  main.js's `DAY_END_MIN` is computed from it.
- `hideNearCamera` restores everyone it hid, seated or not (people's day-5 "Adrian invisible" flake).
- The pause menu's "Avbryt dagens uppdrag" shows and acts only while `missions.canGiveUp` (story's
  request: `state === 'running'` let the day-6 talk be aborted mid-dialogue).
- CLAUDE.md (round-2 scenarios of every area, the give-up rules), README (hold Q / the pause menu,
  weak GPUs on auto, a test line), DESIGN §9 and notes/ui.md follow.

## Phase 4, round 2b (final verification's player-visible leftovers) — what changed

- **The title "ghost"** (pursuit_0 in out/final and out/final2): not the photo collectible. In ?test
  `start()` runs the moment the game is ready and the title faded for 0.8 s like after Spela, so a
  scenario's first shot (pursuit_0: 10 frames after the load) caught the card at ~35 % over the
  chase cam; the Sonja note in the same shot was the Saab placed on the bus stop's photo. Players
  saw only the designed 0.8 s fade after Spela / Fortsätt (most of it hidden by the ~0.3-0.5 s the
  first gameplay frames take here), never on a pickup. Fixed at the root: ?test has no title, so it
  goes at once (`#title.gone.now`); after the fade the card is `visibility: hidden` (its buttons
  leave the tab order, the blurred shade the compositor). Check: ui.mjs `titlegone` (?test at the
  load and after a photo pickup; a real Spela, its fade frame by frame, gone by ~0.9 s, a photo
  after it; a saved game's Fortsätt with Kontroller open: the table hides with the card) - computed
  opacity 0, visibility hidden, nothing of `#title` under its heading's spot; shots
  `titlegone_test/_play/_fortsatt`.
- **The HUD over the curtain** (Ove luftar elementen, Senare samma dag): `hud.curtain(on)` also sets
  `#hud.curtain`, which fades the clock/kr strip, the left column, the meter, the pursuit card, the
  objective, the minimap, the speedometer and the prompt out with the picture (0.6 s). The caption,
  a banner (the race retry's) and the dialogue stay over the black.
- **The objective under the letterbox** (BLOMMORNA at the grave): it hides with the letterbox like
  the rest of the HUD (`body:has(#letterbox.on) #objective`). The kneel's progress bar went with it.
- **Offer toasts during a day**: the dawn's "X vill dig något ◆ Leta efter markeringen." was a bare
  2.2 s timer: a day begun within it got the toast queued behind its intro, and it slid in over the
  day-7 chase. It now fires only while that day is still on offer, and every offer-type toast (it,
  the new game's 7 s one, the give-up "väntar fortfarande") has class `offer`, which
  `missions.begin()` clears next to 'phone' (on screen and queued). The patrol card's "X vill dig
  något" never showed during a day (patrolObjective is null unless idle; 0 of 2723 samples in the
  watch below, before and after): in pursuit_0 it is free roam with day 1 on offer, as designed.
- **story's HUD watch** (story.mjs `watchHud`, the whole run, every 0.1 s): no offer toast (shown or
  queued) or offer text in the objective once a day has begun or a scene is up, no toast over an
  intro, nothing of the HUD showing over the curtain 0.8 s after it is down, no objective under the
  letterbox after 0.6 s. Leaks are errors. On the old files (FROM=5) it reports 9: the curtain HUD,
  the grave and a day-6 objective under the letterbox, and the day-7 offer toast in the intro's
  queue and over the chase; now 0.
- **The chase camera under low roofs** (camera.js): a car under a camBlocks overhang whose underside
  is 0.3 m clear of its roof and below the pivot + 2.5 m (a bus shelter, a carport, a garage, the
  Akut and entrance canopies) - or within the shortest boom of one, or with the camera itself under
  one - gets a level boom under the roof: the pivot at most 0.4 m under it (never lower than the car
  roof + 0.2), the camera at most 0.4 m under it and with up to 1.6 m headroom when there is room
  (a high canopy). It is used when it gives the boom more than 4.5 m and is at least as free as the
  usual rising boom (which ran into the roof and was pulled in to 0.9 m, the camera just under the
  roof's edge: the top third all roof); walled in all the same (nose out in Ove's garage) the old
  pull-in over the roof stays, looking out of the door. The boom eases back out faster under a
  roof (5/s, not 1.6/s), so a camera that has to pass under one does not linger there; the look
  point follows the lowered pivot smoothly (`roofDrop`). Cost: ~0.01 ms a frame (809 camBlocks), one
  more boomFree only under a roof. Check: gameplay.mjs `camroof` - the Saab under the Solrosvägen
  shelter both ways and driving out, the Centrum shelter driven into from the street, backed out
  and backed into, the Akut canopy (standing, driving in), Ove's garage both ways and the road past
  the shelter (unchanged); per view the share of the picture that is roof, of the top third within
  4 m of the lens, and the headroom over the camera: under a roof >= 0.9 m headroom and <= 20 % of
  the top third close roof. Old camera: 6 bad views (headroom 0.11 m under the shelter and backing
  into the Centrum one, the Akut canopy's edge filling the top); now none.
- Seen in passing (rendering's): the first gameplay frames after Spela still take ~0.3-0.5 s in
  headless Chrome here (the title's fade jumps from 0.99 to 0.29 over it, ui.mjs `titlegone`).

## Feature oppna_garaget: Ove's garage door (2026-10-11) — what changed

- **main.js** drives the door (world: notes/world.md, *Ove's garage door*). `game.garage` is the
  `GarageDoor` named 'oveGarage'. `nearestInteractable()` offers `{ type: 'garage', open }` when
  `garageReach()` says Ove can work it (on foot, on the ground, not carrying the cat or pushing
  Rune, within 1.5 m of it on either side and across it, the door still) and he faces it (> 0.5),
  or nothing else is in reach and he isn't turned away (< 1.1 m): so a car right behind him, or the
  Saab beside him in the garage, doesn't take E from the door. Cars on the other side of the shut
  door are never offered (`garage.between`). Prompt "E Öppna / Stäng garageporten".
- **useGarage → doorOp** (`stepDoorOp`, from `tickGarage` in `update`): `garageBlocked(open)` first
  (a car's OBB in the band from 0.45 m outside to 0.12 m inside: "Saaben står i vägen." / "Det står
  en bil i vägen."; to shut it, anyone within 0.2 m of the panel: "Flytta på dig."). Phases:
  `reach` (he walks to his spot - the handle in the middle, or the open door's edge where he stands,
  0.38-0.55 m out - and reaches; the door starts once he is there, ≥ 0.35 s, or after 1.2 s),
  `pull` (hands on the handle until p 0.25 / on the edge until p 0.75), `back` (hands off, he backs
  to 0.82 m outside / 0.95 m inside, clear of the swing), `tug` (outside, shut: back at the handle,
  three tugs 0.34 s apart, a rattle and a `bump` each; 35 %: "Så." / "Stängt." / "Ordning och
  reda."). `op.lock` (reach, pull): no input moves him (fixedStep takes `op.wx/wz`), no jump, kick
  or E, no prompts. After that, a step, a jump, a kick or E of his own ends the op (E then does its
  usual thing). `p.faceWish` is off during the op; his yaw is damped towards the door. Ends at
  once in a car, knocked over, in a scene or a failed mission (the door goes on by itself).
- **Pose**: `posePlayer('work', 'door')` with `poseReach` = the grip point in his body space
  (`doorReach`) and `poseTug`; syncAll passes them as `anim.reach` / `anim.tug` and keeps the
  'door' kind while the pose fades (it used to fall back to 'bend' during any fade-out).
- **Sounds** (`audio.garage(kind, k, dur)`, by distance): `latch`, `roll` (rollers and springs over
  the move), `up`, `shut` (a clang with a ring; also a car into the door, louder with the impact),
  `tug`.
- **In a car** at the shut door (within 4 m of it nose or tail first, < 6 m/s): "Garageporten är
  stängd · kliv ur (E) och öppna den". A car into the door: `onCarImpact`'s 6th argument (the
  block) → `garageHit` (a bump, a boom; Ove: "Porten!" / "Min garageport!" / "Den var stängd,
  Ove.", at most every 10 s).
- **Save**: `garage` (0 = shut; anything else, or none, = open as at the start), applied in `load`.
- **Missions**: day 3's first `holdAt` (the empty hook, at `oveGarage`) has `ready: garageShut`:
  with the door shut the objective is "Öppna garageporten" and E opens it; then the search. Day 1's
  `parkIn` needs nothing new (the car hint).
- **Check**: gameplay.mjs `garage` (15 checks, real key presses): shut from outside (phases reach
  pull back tug, three tugs), Ove stops at the shut door, no "Kliv in" through it, open with the
  Saab inside, "Kliv in" once open, refused with the Saab in the doorway, shut and open from inside
  (no tugs), the in-car hint, a drive into it (the Saab stops, the door holds), the save round trip
  (shut kept; no field = open), day 3 with the door shut (door first, then the search). Shots
  out/garage_*.png.


## Feature roligare_bilkorning: winter roads and slides (2026-10-11) — what changed

The physics is car.js's (notes/cars.md, Physics: *Winter roads at speed*, *Slides*); main.js only
reads `car.drift`, `car.slip` and `car.pivot`:
- **Spray**: in `updateAudio`'s skid-mark block, a real slide or a donut (`drift` or `pivot` > 0.5,
  `skidAmt` > 0.6) throws a puff of `FX.dust` from a rear wheel every 4th frame, alternating sides
  (2 puffs on snow).
- **Ove's comment** (`slideTalk`, from `update`): 1.6 s of slide (drift > 0.5, slip > 17°, > 4 m/s)
  or 2 s of donut in the player's car; once it is over, a bubble from `SLID` (by make half the time:
  the Saab "Framhjulsdrift. Saaben vet vart den ska.", the Volvos "Volvo. Den kan inte ens köra
  rakt."; else "Det där såg ingen." / "Kommunen har inte sandat här." / "Det var meningen."; a donut
  "Kollar bara mönsterdjupet." / "Det där såg ingen."). At most every 40 s, never in a dialogue or
  with the car frozen. These are new Ove lines for the voicing feature.
- Nothing else in main.js changed: the scenes still hold the car with brake + handbrake (the
  handbrake only starts a slide above 2 m/s, so a car held at a stop never slides), and AI drivers
  never pull the handbrake.
- Scenarios (cars.mjs): `handling` and `drift` (off-screen numbers per type), `driftshot` (a 240 -
  `TYPE=` another - through the junction at (40, -40) with real keys, a donut there, Ove's comments;
  pushes 'driftshot: ...' errors).

## Feature tuta_med_bilen: the horn (2026-10-11) — what changed

The horn was a sound (H, while held). Now it is `src/game/horn.js` (`Horn`, `g.horn`, `window.__horn`):
- **Input**: `horn` is T or H (input.js), a pad's L3 or RB. `g.horn.update(dt)` runs every frame in
  `update`, right after `handleOneShots` (before the fixed steps): it is on while Ove is in a car that
  isn't wrecked and no scene plays (`inDialog`). `updateAudio` plays `audio.horn(g.horn.down,
  car.kind)`: every make has its own horn (audio.js `HORNS`), also the AI's `onHonk`.
- **A press** looks round (`blast`): people (pedestrians and neighbours: not Ove, nobody seated,
  hidden, walking with Ove or waiting for his car in a pickup) in a cone from the front bumper
  (16-34 m by speed, half-width car + 1 m widening 6 %) or within 15 m; then the cars within 45 m.
  While it is held it looks round again every 0.7 s (people only, one new bubble at most); after 1.6 s
  the reach grows (cone × 1.25, 24 m all round).
- **People** (`react` -> `ch.honk`, played out by `horn.drive(ch, dt, ped)`, which `Ped.update` and
  `stepNpcs` call first: true while it steers them): after a reaction time (0.06-0.6 s) a yelp
  (`audio.yelp`), `anim.fright` and either a leap (`ch.jump(3.4-4.0)` with 5-6 m/s sideways off the
  car's line, to the side they are on, until 1.4 m clear of the car's flank; old people and Parvaneh
  hurry aside at 2.6-3.2 m/s without leaping), a flinch (a 2.1 m/s hop, hands up for 0.45 s) or a
  child's hop. Then they stand facing the car for 1.3-2 s with a line (`speak`: bubble + murmur) and a
  gesture: `anim.fist`, `anim.cheer` (children), a wave (Jimmy, Adrian: `ch.honk.wave`, which
  `syncAll` ORs into `anim.wave`). A pedestrian who leapt goes back to the pavement (`Ped.rehome`); a
  neighbour shuffles home as before. `syncAll` doesn't turn a neighbour to his home yaw meanwhile.
  At most 3 bubbles per press; a person can react again 1.5 s after the last reaction ended.
- **Cars** (`carReact`, traffic with an AI only, once per 2.5 s each): ahead in either lane (34 m),
  within 14 m, or `ai.byPlayerT` (it sat honking behind Ove). Saab to Saab: two toots and "Tjena,
  Saab!" / Ove's "Saab-folk. Vi hälsar.". Ahead the same way: `ai.hurryT = 3` (drivers.js: traffic
  cruise × 1.35). Honk back by `TEMPER[kind]` (always when blocked: a 0.9 s lean on it).
- **Patrol**: a smitare still sitting in its violation within 25 m (or ahead) is spooked:
  `patrol.startPursuit` (not while `patrol.suspended`). In a pursuit within 30 m: −5 motstånd a press
  (at most every 0.8 s; not the press that spooked it), −3/s held after 0.4 s, and the flee AI's
  `wobble` at 0.14 for 1.1 s.
- **Ordning**: `annoy` +1 per press with nothing warranted (no one in front, no car ahead, not
  blocked, no smitare), +0.55/s held after 0.8 s, −0.25/s. At 5 (a press is judged 0.6 s later, so
  the rhythm's fifth tap is spared): `complain` (at most every 30 s): −2 Ordning, toast "Onödig
  tutning · −2 Ordning", Anders `shout`s the law if he is within 70 m, else a window (`nearHouse`: the
  nearest box collider over 4.5 m tall within 32 m, a bubble 3.6 m up its wall); Ove answers. A 2.2 s
  honk shouts from a window by itself (every 25 s).
- **Ove** (`oveSays`, at most every 8 s unless forced) after a press, by what he honked at; passengers
  in his car (`passengers`, every 10 s) say theirs over the car first, then Ove 2.4 s later.
- **Pickup** (stages.js): while it waits for Ove's car it keeps `n.pickupT` fresh (horn.js leaves them
  be); a honk from that car stopped (< 4 m/s) 10-25 m off walks them to `g.exitSpot(car, -1)`
  ("Jag kommer!"), and they get in from 13 m (from 22 m if the walk stalls for 2 s).
- **The cat** by Ove's door: a 0.34 m hop and a turn of ±2.4 rad over 0.42 s (its root, `tickCat`),
  `sit(false)`, `audio.hiss`; Ove: "Förlåt, katten." (every 40 s).
- **Shave-and-a-haircut** (`rhythm`, at a release): the last five presses short (< 0.4 s) over
  0.8-3.2 s, the middle two gaps < 0.8 × the outer ones, not part of longer drumming: the nearest
  traffic car (90 m) toots twice, two and three beats after the fifth tap; `annoy` −5.
- Delayed reactions go through `horn.after(t, fn)` (game time: frozen behind the pause menu).
  `horn.rand` is every chance (scenarios set it to 0: all come true, the first line of each list);
  `horn.stats` counts everything. The first time behind a wheel each session (not `?test`) a toast:
  "T tutar. Folk märker det."
- Scenarios (gameplay.mjs): `horn` (19 checks with real key presses: an adult, a child and an old
  person in front, a BMW, a Saab, a smitare spooked and pressed, needless honking, the rhythm, a
  pickup at the bus stop, Rune and Anita, a passenger, H, no horn in a scene, the cat after day 4)
  and `hornlook` (a frozen side camera on a honk at someone in front: `WHO=adult|kid|old|patrick|
  parvaneh|anders`).

## Feature fixa_bilen: the tail lets go at speed (2026-10-11) — what changed

roligare_bilkorning's point 1 was written the wrong way round (the cars understeered at speed, they
did not oversteer); its calmer winter roads are gone and `WINTER` in car.js now makes the player's
car loose at speed (notes/cars.md, Physics: *Winter roads at speed*). main.js is unchanged: a slide
the tail starts by itself is an ordinary `car.drift` slide (`car.loose` tells them apart), so the
spray and Ove's `slideTalk` comment come with it. AI drivers are untouched (no AI car's `drift`
ever leaves 0 in `speedslide`).
- Scenarios: `handling` (cars.mjs) is rewritten for the new behaviour (keyboard style: when the tail
  lets go per type, speed and pedal; taps; a 90° turn; the flick; a catch). New `speedslide`
  (cars.mjs, real keys, the Saab or `TYPE=`): an evasive swerve at ~95 km/h on the northern ring road
  (must stay on the road, keep 40 km/h, be straight within 2 s) and a lift-off slide through the
  junction at (40, -40) from ~60 km/h without the handbrake, held and caught (must slide, must leave
  down the cross street); pushes 'speedslide: ...' errors; shots `out/speedslide_*.png`. `m5race`
  takes `RACE_VC` (the corner speeds ×, a hasty driver).

## Fix fixa_outro_anita: nobody left invisible after day 3's kitchen (2026-10-11) — what changed

vcut (TO=7) found Anita invisible through day 3's and day 6's outro (`shown=false`, state
`normal`). The radiator scene (luftning.js) snapshotted the real Ove's, Anita's and Rune's
`root.visible` when it built its set (0.65 s after E) and put that back at the end; in the frames
before, the on-foot camera at the door could be pulled in by the house within a neighbour's reach,
and `hideNearCamera` had hidden them for that frame, so the snapshot said 'hidden'. Its own restore
then showed the real one outside during the scene, and the scene's restore hid them for good (no
one shows a `normal` NPC again). Which side the camera was on depended on Ove's yaw from the step
before: with a human reader in vcut, one run in two.
- main.js `offstage(ch, off)`: off = hidden and `ch.offstage` set (`hideNearCamera` neither restores
  nor hides them); on = `root.visible = ch.state !== 'hidden'`. luftning.js takes Ove, Anita and
  Rune off with it and puts them back with it; the window's pane keeps its snapshot.
- story.mjs `luftcam`: the scene started with the camera at Anita, then at Rune (a yaw found that
  makes `hideNearCamera` hide them at the door): the real ones hidden throughout the scene, all
  three shown after. Without the fix: 6 checks fail (both of them, never shown again).
- voice.mjs `vcut`: `LUFTSKIP=s` makes the reader skip the radiator scene with Enter s s into it.
- story.mjs `reverseInto` (day 1's trailer) checks the stage in the same call it reads `stage.b` in:
  the box could be reached in a frame between two calls (vstory under load: "reading 'yaw'").

## Feature avgrunden: the cold beyond the town (2026-10-11) — what changed

No invisible walls (features/implemented/avgrunden.md). Ove walks and drives out past `BOUND`; the
cold (game/cold.js) kills him further out, and he wakes up in his bed (game/waking.js).
- **Who still stops at BOUND**: main.js `keepCarsInside()` (after `collideAll`, every fixed step:
  every car with an AI, a driver or a driver bust except Ove's; pushed back to BOUND - min(radius,
  2.6), its outward speed × -0.2, as the old wall boxes did) and `keepPeopleInside()` (pedestrians and
  the neighbours, not seated or hidden). So the traffic, chases, the race, smitare and anyone walking
  with Ove stay in; a parked car Ove shoves out goes out. A named car left beyond BOUND is `rehome`d
  (recycleTraffic, once nobody sees it).
- **The cold** (`game.cold`, created after the MissionRunner): `update(dt)` once per frame after
  `syncAll` (before the camera: its death crane is a `cam.cine`); `busy` while Ove dies and wakes:
  then `missions.update/updateFailed`, `tickGarage`, `interrupts.update` and `patrol.update` are
  skipped (nothing completes, fails, rings or drains behind the death). The meter holds during
  `inDialog`, `freezeCar`, intro/outro/failed and a hidden player. `beforeRender()` /
  `afterRender()` wrap `renderFrame()` in `loop` (the blizzard: fog, sky, sun for the frame only).
  `musicDuck` multiplies the music's duck in `updateAudio`; `engineOff` (dying at the wheel) keeps
  `audio.engine` off.
- **The death** (`die()`, `updateDeath`): `inDialog` on, prompts / bubbles / toasts / voices cleared;
  0.9 s: on foot `player.state = 'frozen'` (character.js: no physics, no new pose, `topple` rolls the
  root about his feet), 1.5-2.1 s the topple, a 'poff' and snow; at the wheel the engine stalls
  (main.js brakes the car while `inDialog`); 0.8 s on the camera rises over him (`cam.cine`, following
  a car still rolling), the HUD chrome fades (`hud.deathHud`); 2.2 s the banner; skip keys from 2.4 s
  go to 5.4 s: the curtain. 6.1 s `aftermath()` behind the black: `missions.fail('Ove frös ihjäl.',
  { later: true })` if running (missions.js: `failHeld` keeps `updateFailed` and its banner until
  `showFailed()`), `interrupts.abort()`, `patrol.dropPursuit()` / `cancelWriting()`, every companion
  `sendHome`, `setCarrying(null)`, `exitCar(true, true)` (quiet: no door) and `homeNamedCar(name)` for a named car, the player
  thawed and unfrozen, `spawnPlayer()`; then `wakeScene(g)` until it returns true; `woken()`: `inDialog`
  off, the held fail banner shown, `save()`.
- **Fairness**: nothing is charged (no kr, no Ordning; an errand dropped by a death costs nothing, as
  `abort()` always did). A day failed by it is retried as any failure (E: from its retry point; a
  `def.retry` day gets into the named car, which is at home by then).
- Tests (tools/scenarios/cold.mjs): `coldwalk` (W + Shift out the north track: dies at ~430 m after
  ~15 s in the cold, wakes at the door; ~485 m and ~26 s since avgrunden2), `colddrive` (the Saab at
  ~100 km/h: dies at ~545 m, ~650 m and ~11 s since avgrunden2, the Saab back in its bay), `coldback`,
  `coldrate` (44.4 / 11.2 / 5.0 s at 0 / 70 / 140 m; 110.9 / 27.9 / 12.4 s since avgrunden2),
  `coldmission` (day 2 under way: failed after waking, E retries), `coldwall` (a car at full
  throttle, a pedestrian and Anders stop at BOUND, Ove walks on), `coldbed`, `coldbedskip`, `coldsound`, `coldperf`, `coldlook`.
  story (#7 idle, no errors), m5race (won) and m7chase (5 m in 12 s) unchanged.

## Feature avgrunden2: the cold 2.5 times slower (2026-10-12)

`COLDK` in game/cold.js only (features/implemented/avgrunden2.md): `edgeSecs` 45 -> 112.5 (2.5 times as
long at every spot: 112.5 / 28 / 12.5 s at 0 / 70 / 140 m), `thaw` / `thawCar` 18 / 9 -> 24 / 12 s,
`whiteout` COLD + 170 -> COLD + 255 (the blizzard as thick at death as before: Ove gets further out
now), and the Sonja toast from `warn` 0.45 (was 0.62: a way straight back costs as much cold as the
way out, so past half it came too late). The effects on v (frost, shiver, pockets, chatter, breath,
heart, the notes, the music duck) follow by themselves. coldwalk / colddrive record every
`cold.update` in the page (`c.update` wrapped on the instance) and read the rate off frame by frame;
the old pace is integrated over the same frames for the before / after (on foot 16.1 -> 25.7 s in
the cold, the Saab 7.6 -> 10.8 s).

## Feature snöhög: the hoppbacke (2026-10-12) — what changed

The park's snow pile is a jump now (world: notes/world.md *The hoppbacke*; the flying: notes/cars.md
*Snow hills and flights*). `src/game/hoppbacke.js` (`Hoppbacke`, `g.hopp`) is what the game makes
of a flight:
- **Hooks** (main.js): `onCarTakeoff(car)` → `hopp.takeoff`, `onCarFlight(car, landed)` → `hopp.land`,
  `onTrailerBounce(tr, impact)` → `hopp.trailerBounce`; `onCarLanded` returns at once for a car with a
  `flight` (the bump, the thud and the dust were the old landing's). `hopp.update(dt)` every frame
  after the horn: what is said a moment later goes through `hopp.after(t, fn)` (game time).
- **Takeoff**: powder (`fx.powder`: many small wisps, spread and slowed fast; a few big puffs read as
  cotton balls) from the rear wheels, `audio.hoppTakeoff` (the tyres letting go of packed snow, the
  springs unloading), for the player's car `audio.hoppWind(t)` for the likely air time.
  `updateAudio`: in the air the engine revs on the throttle (the speed it is given × 1 + 0.45 ×
  throttle) and the tyres are silent (`audio.engine(…, 'air')`), no tracks are drawn on a hill
  (`!c.hill`: they lie at the ground's height).
- **Landing**, by the speed into the snow: soft < 5 m/s, good < 8.5, hard < 12.5, else a crash.
  Powder from all four wheels (more and bigger with the impact, thrown along with the car),
  `audio.hoppLand(impact)` (a deep crunch, the springs bottoming out; past 8 a clatter and the exhaust
  against the body; past 12 a bang; it cuts the wind), the camera shakes with it, a crash flashes
  white. `hopp.log` keeps the last 40 flights (kind, v0, air, dist, apex, impact, onHill, cls).
- **A real jump** (the player's, ≥ 0.55 s, no scene, not dying of cold): a toast in Ove's hand ("Ove
  antecknar · Lufttid 1,07 s · 14,1 m · Bra landning"); a flight of ≥ 0.7 s longer than `hopp.best`
  is his record ("Rekord!" once there was one to beat, a saved one too) and saves (`save.hopp`: dm,
  0-2000, sanitised).
- **Ove** (≥ 0.85 s, at most every 25 s, 0.9 s after, 2.6 s if a passenger spoke): in his own Saab,
  landed soft or good: "Saab byggde flygplan först. Det märks." (the first time always, then 40 %);
  in a car that isn't his after a hard one (or 45 % of the rest): "Det är inte min bil."; towing:
  "Hmpf." / "Det var meningen."; a hard one: "Det var meningen." / "Det där såg ingen."; a Saab:
  TYRE.saab900; else "Bra däck." / "Hmpf." / "Jaså." (script.js `OVE_HOPP`: the two new lines,
  voiced; the rest his own lines from elsewhere).
- **A passenger** (every 12 s, after a big one or a hard landing): Patrick "Oj! Jag hoppade till.",
  Parvaneh "Måste du, Ove?", Anita "Ove, Rune blir rädd.", Rune by the make ("...Saab."), Jimmy "Ove!
  Mannen själv!", the girls "Igen!", Anders, Vita skjortan; Adrian "Ove!".
- **People who saw it** (within 38 m of where it took off or came down; neighbours 60 m; at most
  every 6 s): `horn.react(p, car, true, { kind, gesture, line, delay })` (horn.js takes a spectator's
  own reaction now and doesn't count it in its stats) plays it out as a honk's reaction: children
  cheer ("Igen!", "Häftigt!"), pensioners shake a fist ("Ungdomen nu för tiden!", "Mitt hjärta!",
  "Men herregud!"), teenagers "Lugna dig, gubbe!" / "Chilla!", the rest flinch, or leap if it came
  down within 7 m ("Jösses!", "Jag fick nästan hjärtstopp!", "Men herregud!", "Det är bilfritt
  här!"); two lines at most. One neighbour has an opinion (every 30 s): Anders "Jag tar upp det på
  årsmötet, Ove!" (fist), Patrick "Wow. Det ser ut som i reklamen.", Parvaneh "Ove, du ser nästan
  glad ut i dag.", Jimmy "Ove! Mannen själv!", Anita "Hej, Ove.", Rune "...Saab.", the girls "Igen!
  Igen!" / "Igen!", Vita skjortan "Det där noteras."; Adrian waves. All lines are the pool voices' and
  the neighbours' own (already voiced for them). It costs no Ordning.
- **Trailer bounce**: powder at the axle, `audio.trailerClank`.
- **Camera** (camera.js): in the air (`car.flight`, from 0.08 s) `airK` eases to 1 (5/s; back at
  1.6/s): the boom 0.7 m longer, the fov 4° wider, and the camera rises after the car at 0.4 × its
  rate, so the car climbs in the picture against the sky (it comes down with it at the usual pace).
- `hopp.rand` is every chance (scenarios: 0 = all come true), `hopp.stats` counts everything.
- Scenarios (tools/scenarios/snohog.mjs): `snohog` (real keys, six runs: Saab 13.5 m/s and flat out
  from the street, Volvo 240 12, Audi flat out, van 14, Volvo 740 with a trailer 12.5; `RUNS=`,
  `FILM=1`), `snohogsim` (deterministic, 64 runs), `snohogwalk`, `snohogsound`.

## Fix ljudbugg_vid_kold: a roar over the waking scene, in Firefox (2026-10-14)

features/implemented/ljudbugg_vid_kold.md. game/cold.js `sounds()` made the wind (`zone > 0.01 ||
this.dying`) before it stopped it (`dying.t > 5.6`), so from the black on, through the whole bedroom,
a new wind was made and stopped every frame (~580 a death). Its `stop()` was
`cancelScheduledValues(now)` + a fall: silent in Chrome, a full-gain burst in Firefox (the param back
to its default 1; notes/ui.md *audio API*), 60 a second: −14 dB RMS of noise over the scene.
- `sounds()`: the stop first; nothing made after 5.6 s into the death.
- `SOUNDS.wind.stop()`: the fall scheduled at now, nothing cancelled.
- main.js `exitCar(force, quiet)`: `aftermath()` takes Ove out of the car he died in without the
  door's clunk (it came under the black, just before the bedroom).
- cold.mjs `coldwind`: a death on foot and in the Saab (winds made from the death on: 0, were
  576 / 571; none left; no door; the effects bus ≤ −36 dB in the bedroom before the line) and
  offline (the wind never cancels; stopped as made: silent; played then stopped: fades out).


## Feature roligare_runeuppdrag: Rune's errand as a sandbox (2026-10-14) — what changed

features/implemented/roligare_runeuppdrag.md. game/rune.js (new, `game.rune`), stages.js `escort`
(`push`, `mortal`, `cold`), interruptions.js (no timer, `retry`), main.js, missions.js, luftning.js,
script.js (`WIDOW`, `RUNE_DIES`, the days' `*Widow` lines, `ERRANDS.rune.dead`).
- **The wheelchair**: E takes hold of it (it used to be taken at 2.2 m by itself) and E lets go
  (`rune.letGo`): in Ove's stride (Shift) it keeps max(his speed, 3.2) × 1.4 and rolls on ~15 m;
  walking × 0.3 (under a metre). A kick (J) rolls it too, any time (also at home): 3.6 m/s along its
  own heading, forwards from behind, backwards from in front, less and a little turned from the side
  (~8 m). Rolling (`n.roll`, `anim.coast`: hands in the lap) it slows at 0.85 m/s², stops against
  walls and cars (a knock when fast); `rune.step` runs it from `stepNpcs`. On his errand Rune no
  longer turns his chair to face Ove (`n.mortal`): a boot from behind sends him on forwards.
  `keepPeopleInside` never stops Rune at BOUND: only Ove takes him out there.
- **His cold** (escort `cold: 300`): 1/300 a second wherever he is, from the call (find or bring),
  plus 3 × the cold's own rate (cold.js `coldRate`) beyond COLD: ~25 s from nothing at COLD + 12. The
  errand card shows it instead of a timer (`#errand.cold`: a body temperature 36,6° → 27,0°, the
  bar, a note; pulsing over 0.75 or out there); he shivers (`shiverPose` now also in a wheelchair).
- **Death** (`rune.kill(n, cause)`, causes `cold`, `coldOut`, `car`, `ove`): on his errand
  (`n.mortal`) a car coming at him at > 4.5 m/s and itself > 3 m/s (what flings a passer-by) kills
  him, pushed or not (`rune.hit` from `carsVsPeople`): the chair tips onto its side (`toppleW`, the
  pivot at its edge) and slides to a stop; cold: he slumps (`anim.slump`: head on his chest, eyes
  shut, an arm off his lap; posed though `frozen`). Ove: "Rune?". The errand fails into
  `interrupts.retry`: banner RUNE ÄR DÖD + the cause ("Rune blev påkörd." / "Ove körde över
  Rune." / "Rune frös ihjäl." / "... bortom skogen."), E / Q held like a failed day (`game.failWait`:
  Ove still, his car braking, no prompts, his own cold held). E: `rune.revive`, the errand from the
  start. Q (or a story day / Ove's frost death taking it over): given up.
- **Dead for good**: `game.runeDead` is set the moment he dies (saved, `rune: 0`; a reload during
  E / Q keeps him dead), cleared by E. The body stays until Ove is > 30 m off or it is out of view
  (`rune.bury`), then Rune is hidden for good (`npcAway('rune')`). Errands `rune`, `skotta` and
  `element` (now `needs: ['rune']`) are never offered. Anita (`rune.grief`): `anim.grief` (head bowed,
  right hand at her eyes, the left across her waist; `sob` heaves the shoulders) whenever nobody is
  talking to her; within 14 m of Ove a line from `WIDOW.sobs` every 22-38 s (voiced crying); small
  talk `WIDOW.chatter`; the horn `WIDOW.honk`; the ORDNING OCH REDA radio `WIDOW.reda`; on giving up
  a toast and her call (`ERRANDS.rune.dead`). The story: `MissionRunner.scene(def, key)` takes
  `def.widow` (days 3, 6, 7: intros, outros, taglines without him: day 6's kommun wants to move
  Anita), day 3's kitchen has nobody at his place (no snort), day 6's folder is "Anitas papper", day 7's
  call back from Anita is `callsBackWidow`.
- Tests: scenarios/rune.mjs `runeroll runekick runecar runecold runewidow` (+ `runelook`: close-ups,
  no checks); `?runedead` (tests) starts with him dead: `QUERY='&runedead' node tools/shot.mjs story`.
  gameplay.mjs `errands` takes hold with E.

## Tracks in the snow (feature snöspår, features/implemented/snöspår.md)

- **game/tracks.js** (`game.tracks`, `window.__tracks`): `init(scene)` after `fx.init`;
  `update(game, dt)` every frame of `Game.update` right after `syncAll` (the people are posed, the cars
  synced; not on the title); `clear()` from `MissionRunner.updateGate` at the dawn ("Ny dag"), the one
  place a new day begins. Not saved: a reload starts clean.
- **People** (Ove on foot: ring 0; peds and neighbours within 70 m of the camera: ring 1): a print as
  each leg's phase (`model.phase`, leg 0 at u, leg 1 at u + 0.5; `STAMP_U` 0.22 into the stance) is
  passed, at the foot bone (`foot.updateWorldMatrix(true, false)`: the sole's centre 0.26 L ahead of the
  ankle, turned out 0.1 rad like the shoe mesh), both feet when `onGround` comes back (a jump, getting
  out of a car). Only `state === 'normal'`, not `offstage`, not floating, moving > 0.2 m/s. Size and
  sole from `model.D` and `model.d.shoes.type`.
- **Wheels** (`car.wheels` at the car's yaw; a trailer's two at ±0.83 m; Rune's chair: rear ±0.3 m,
  casters ±0.21 m ahead): a `Trail` per wheel on the object (`_trkW`), ring 0 for `game.playerCar` and
  its trailer, ring 1 for everything else (a car changing hands starts a new trail). A trail ends where
  the wheel leaves the snow, in the air (`car.air` / `flight`, `trailer.air`), after a jump of > 3 m
  (placed) and at a new day. Cars asleep or beyond 100 m are skipped; one standing still costs nothing.
- **What is snow**: `surfaceAt` 'snow' but not raw 'ice', on the ground or a snow hill (`HILL`), not
  on another block, the decal at `surfaceHit.y` when that is the ground's visible top (lawns), else at
  `groundAt` (+1.2 cm on a hill, whose mesh is coarser than its function; the ground's normal from
  four samples off the flat town).
- **main.js `updateAudio`**: the skid decal (`fx.skid`) is laid per mark where `surfaceAt` is not snow
  (on snow the ruts show the slide, wider as the tyres go sideways); with `&notracks` as before.
- Cost: `update` ~3 µs a frame with nothing moving on snow; a car on snow ~4 snow lookups a frame per
  wheel (more off the flat town, for the ground's height across the rut).
- Tests: scenarios/snospar.mjs `snospar` (real keys: prints per step, under his feet, left / right,
  the way he walks, running, a jump, none on asphalt; Parvaneh's across a lawn; the Saab's four ruts
  under the wheels, a slide's wider ones, none on a road; a new day clears all), `sposmore` (the
  hoppbacke: ruts up it, none across the flight; Patrick's trailer; the snow tractor; Rune's chair let
  go of; Ove beyond the town: prints on the hills' ground, filling in), `sposlook` (close-ups in shade
  and in the sun, the chase cameras), `sposperf` (QUERY='&gputime': every ring full, on / off).

## Small talk answered (feature smaprat, features/implemented/smaprat.md)

- **The answers** are data: script.js `CHATTER_REPLY[who][line]` = a pool of answers, each `text`,
  `[text, tag]` or `[text, tag | null, [LINE...]]` (the exchange goes on, in turn), `''` = Ove says
  nothing. Every line of `CHATTER`, `CHATTER_FIRST`, `CHATTER_AFTER` and `WIDOW.chatter` has one; some
  thaw with the days (Sara's snowman Nej. / Sen. / ...En liten då.; Parvaneh's dinner and saffransris;
  Anita's "Rune sov dåligt" sets up day 3 until it). `CHATTER_ENOUGH` ("Nu har vi pratat."),
  `CHATTER_SPARE` (OVE_REPLY without the rising "Jaha.": a line with no answer, i.e. only
  `CHATTER_FALLBACK` from anyone but Anita). `OVE_REPLY` itself is unchanged (luftning.js and
  hoppbacke.js pick from it by position).
- **main.js**: `pickChatter(n)` = the neighbour's line, not among the last ⌊k/2⌋ said of the k they
  may say now (`n.chatSaid`) and never the last one (else one from both lists: `chatterFor(key, true)`).
  `chatReply(key, line)` = `{ text, then }`. `chat(n)` (E) starts `game.chatX = { n, u, steps, i, due,
  ms, self }`; `tickChat()` (every frame, after `slideTalk`) says the next step once the last has been
  said: with the voices 0.45 s after its clip (none if it was dropped or cut > 0.25 s), without them 2 s
  after the neighbour's line, then 1.6 s a line. It breaks off (`chatX = null`) when Ove is > 6 m off,
  in a car, not `normal`, a dialogue is up, `missions.state` changed, the neighbour is not `normal`, or
  `cold.busy`. A silence is `oveGesture(CHAT_SILENT[key])` (Rune a nod, Vita skjortan a shake, Anita in
  grief a nod, Parvaneh's "Andas." nothing); `CHAT_GESTURE` nods / shakes with a few short answers.
- **Enough**: E counts per neighbour (`n.chatEs`, 60 s); the fourth: they say nothing, Ove says
  `CHATTER_ENOUGH`, `n.chatLock` = 20 s: `nearestInteractable` skips them (no E prompt) and their own
  small talk is hushed. It also skips the neighbour `chatX` is talking with (the prompt is back when the
  exchange is over).
- **Their own small talk** (syncAll) goes through `pickChatter` too, is hushed while `chatX` runs, and
  is answered 35 % of the time when Ove is within 4 m on foot, `normal`, no dialogue: a one-step
  `chatX` (`self`: no turning to them, no exchange after it, a silence is nothing).
- **Bubbles** stack (hud.js `tickBubbles`): the answer stays by Ove, the line it answers moves up.
- Tests: scenarios/smaprat.mjs `smaprat` (real E presses: every neighbour out on days 0/2/4/6, the
  exchanges, the silences and their gestures, "Nu har vi pratat." and 20 s without them, 40 E on Rune,
  their own small talk answered at 3 m and never at 5 m, broken off by walking off / the Saab;
  close-ups) and `smapratvoice` (&voice: clips, none cut, never two voices at once, each line ≥ 0.4 s
  after the last); gameplay.mjs `smalltalk` (every line has an answer each day, the forbidden lines
  checked on the answers too, the thaw by day).

## Stumbling and tumbling (feature snubbla_vid_hopp, features/implemented/snubbla_vid_hopp.md)

- **main.js** `STUMBLE = { chance: 1/40 (0 in tests without &stumble), exit: 4 }`. `player.ragdoll =
  true`: every `fling` of Ove's is a ragdoll (actors/ragdoll.js; notes/people.md *The ragdoll*): a car
  into him (`carsVsPeople`: his fling gets a spin about the axis across its way, the legs swept first,
  `why: 'hit'`), his car wrecked under him, and:
- **The trip**: `onJumpLand` -> `stumbleNext || Math.random() < chance` -> `stumble(p)` (not on a car
  roof, carrying the cat, in a dialogue, at the garage door, while he freezes, at a failed day's
  screen, pushing Rune). On the move (> 1.2 m/s) a foot caught (the feet's speed x 0.1, a push along his
  way growing up the body to 0.9 + 0.12 v m/s at the head); standing, over backwards or to a side (the
  push about a quarter up his legs, which give way); 20 % on the move, 40 % standing, the feet go from
  under him (forward, he falls back). Tone 0.25-0.5 s, hands out, lying 0.4-0.8 s. His 'uff', a little
  snow. Character.step returns right after `onJumpLand` if he is no longer `normal`.
- **Out of a moving car**: `exitCar` above `STUMBLE.exit` (was a fling above 7 m/s) -> `jumpOut(car)`: a
  standing body at the exit spot at the car's height, turned 0.6 rad out of the driver's door, with 0.9
  of the car's speed, 1.8 m/s out of the door, 2 m/s up, pitching forward (1.5 + 0.12 v rad/s) and
  rolling to a side (1 + 0.08 v); his grunt. 3 / 5 / 9 / 13 m of tumbling at 15 / 35 / 60 / 90 km/h. The
  car rolls on without him (park). At 10 km/h he steps out as before.
- `carsVsPeople` skips a ragdoll in the air or tumbling (`ch.rag && state 'flung'`: the points meet the
  cars themselves); lying still he is shoved like anyone down. `isPerson` etc. unchanged (flung, down).
- `onGetUp(ch, why)`: Ove up after a fall of his own says one of `OVE_STUMBLE[why]` (script.js: 'stumble'
  'car' 'hit', lines he already has: no new clips) 4 times in 5, not in a dialogue.
- `teleport` ends a ragdoll (on his feet there): the warps, `resetToRoad`, the cold's waking.
- Tests: scenarios/snubbla.mjs `snubbla hoppaur snubblaperf snubblalook snubbladbg`.

## The p-skiva and the lapplisa (feature p-skiva, features/implemented/p-skiva.md)

- **game/pskiva.js** `Parking` (`game.parking`, `window.__parking`; constructed after the cold with
  `{ wardens: !TEST || &lapp }`; `update(dt)` with the patrol, inside `!cold.busy`): `recs` = car ->
  parking `{ car, bay, rule, lot, arrive, next, discSet, ticket, mesh, awayT, readOnce }`. The player's
  car slower than `PSK.slow` in a bay with a rule (`bayAt`: a 24 m grid of `parkingBays`, the car's
  centre in the bay with slack, its heading within ~33° either way) begins one (`arrive` = the minute);
  leaving the bay ends it (not with a ticket on it). Every 0.25 s: a record whose car is disposed / dead
  / out of its bay is dropped; `round(r)` = the attendant (due at `r.next`, Ove > `PSK.away` m and not in
  the car for `PSK.awaySecs` s); `spot()` (Ove sees a ticket within `PSK.seen` m on foot); `phone()`
  (a wrong ticket's call once the phone is free). Absolute time = `day * 1440 + clockMin`; `dawn()`
  (missions.updateGate) adds a day.
- **The rule**: `offence(r, t)`: permit (within its hours) -> its kind; disc: outside its hours
  nothing; no disc in the window -> `nodisc`; the disc (`car.pskiva = { dial: 0..719, on }`, its 12-hour
  dial read nearest the arrival, `discAt`) later than `ceil30(t)` -> `ahead`; regulated minutes from it
  (`regMin`: only inside the hours, over nights too) over the limit -> `overtime`. `check(car, o)` runs a
  round now (tests: `o.err` a mistake of hers or `null`, `o.misread`). `issue` builds the ticket
  `{ no, t, arrive, why, what, plate, make, place, bay, disc, fine, err, warden, day, saab }`; 20 %
  (`PSK.wrong`) get `mistake(tk, kind)`: plate (a look-alike character), make (Saab <-> Volvo), time
  (before the arrival), place (another p-skiva lot), disc (two hours early or before it would run out);
  a right disc read wrong at a parking's first round 5 % (`PSK.misread`, always an error).
- **The envelope**: `attach(r)` adds a small realMesh (plastic + painted, no snow, no AO) to `car.tilt`,
  on the glass above the driver's wiper (carmodels.js `P.wiperZ`, `P._fn.topY`); without a loft profile
  (the tractor) on the bonnet where a ray from above meets the body.
- **main.js**: `g.overlay` ('pskiva' | 'lapp' | null): `handleOneShots(dt)` hands the keys to
  `parking.overlay(dt)` and returns (before pause, so Esc is the disc's); `fixedStep` brakes the car /
  stops Ove; `updateHud` shows no prompt; `missions.canGiveUp` is false. In a car `input.pressed('pskiva')`
  (G, pad 12) -> `parking.openDisc()` (only stopped in a p-skiva bay). `nearestInteractable` returns
  `{ type: 'ticket', car }` for a car with a ticket (no 'car' for it: E takes the ticket, `parking.take`);
  the prompt "E Ta lappen". `parking.prompt()` joins the prompt line in a car. Seated in a ticketed car
  any other way (a scene, the race's grid), he takes it as soon as the car stands and the missions are
  idle (`update`); till then it rides along.
- **interruptions.js** `outCall(who, name, lines, sub)`: Ove phones somebody (the card "Ove ringer",
  `hud.incomingCall(..., { out: true })`, the 425 Hz ringback twice, then `phoneLine` in turn); `abort()`
  (a story day) leaves it, `hangUp()` (radio calls only) too, `force()` cuts it (resolves false).
  `EXTRA` names for `nameOf` ('kundtjanst': P-Ordning AB). The refund is on its promise.
- **input.js**: `KEYS.pskiva` ['KeyG'], `PAD.pskiva` [12] (d-pad up), `padPressed(b)` / `padDown(b)`
  (the disc's own pad buttons).
- Tests: scenarios/pskiva.mjs `pskiva pskivarules pskivalook pskivavoice`.
