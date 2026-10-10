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
- **Ordning** (0-100, starts 50): drains 0.022/s per open violation (one > 150 m from Ove counts
  half; ×0.4 while an avbrott or a call is on; ×0.5 for a minute after KAOS); +7 report, +12 TAGEN,
  +10 / −10 errand done / failed, −12 a pedestrian hit by Ove's car, −3 a neighbour or child shoved
  by it, −2…−4 and 5-20 kr per prop Ove breaks
  (car or kick), −1/s driving inside a car-free zone (Anders shouts, once a minute), −8 for "lånar"
  a car with a driver, −8 and up to 100 kr självrisk for wrecking someone's car. At 0: **KAOS I
  OMRÅDET** (−50 kr, back to 35, Anders calls a föreningsmöte); at 100: **ORDNING OCH REDA** (+100 kr,
  once per free-roam stretch, i.e. until a mission ends). The KAOS banner leaves out the kronor when
  Ove had less than 5.
- **Avbrott**: a neighbour calls ~45 s into free roam, then 70-110 s after each errand: the old
  landline rings, the call card, Ove answers ("Ja?"), two lines, Ove's grumble, then an errand with a
  patience timer in the Avbrott panel. Done: +10 Ordning, +30-60 kr, thanks on the radio, an Ove
  "Hmpf.". Too late: −10 Ordning. The nine templates (`TEMPLATES` in interruptions.js): element
  (Anita, hold E 3 s at runeHouse), forskolan (Parvaneh: Nasanin from the preschool home), mobilen
  (Jimmy's phone on the centrum torg, back to Jimmy), punktering (Adrian, hold E 4 s at the bike
  shed), nyckeln (Patrick: the spare key from Ove's door, hold E at Parvaneh's), rune (Anita: find
  Rune on a sidewalk 45-80 m away, push him home), skotta (Anita: three snow heaps in front of
  their door), katten (Sara: catch the cat by the bike shed, carry it to her), skjuts (Jimmy waits at
  the Solrosvägen bus stop, needs a car, and must *ride* to centrum: walking him there doesn't count).
- **Neighbours** at their homes (`HOMES` in main.js): Parvaneh, Patrick, Sara and Nasanin by
  parvanehHouse; Jimmy; Adrian at adrianSpot; Anita with Rune (wheelchair) at runeHouse; Anders;
  Vita skjortan outside Kommunhuset. They turn to Ove, greet him one at a time (CHATTER), E =
  "Hälsa på X" (a line and an Ove grunt), name tags within 9 m, teal dots on the minimap. The
  current mission giver stands at the mission's spot with the amber marker and waves.
- **On foot**: walk 3.2, rask gång (Shift) 5.5, pushing Rune 3.0 (3.6 with Shift), one jump (apex
  0.55 m, no double jump), J/click kicks: a tyre (thunk, the car rocks, an opinion by make: "Bra
  däck." / "Japansk skit." / "Plast och elektronik."), the nearest prop (breaks, Ove pays; one
  per kick), a person (they object; nobody is knocked over by Ove's boot). Footsteps from the walk
  cycle (`audio.step` with the world's `surfaceAt`). Poses: `carry` with the cat (at
  `carryPoint`), `work` (+ `workKind`) while holding E in a job, `push` with Rune, `write`, `phone`.
- **Pickups**: pantburkar at `litterSpots` (1 kr, collected on foot within 1.25 m or by car within
  1.8 m, back after 4-7 min out of sight), 7 Saab-emblem and 7 of Sonja's photographs at
  `collectibleSpots` (a faint shaft of light; each plays a note/memory in Ove's handwriting; all
  emblems +150 kr). Saved in `localStorage['saab-and-run-v1']` with kr, mission index and the patrol
  (Ordning, reports, log).
- **Cars**: every parked car from the world (`snow` on unnamed, not on named/indoor ones, engines
  off), the named ones in `game.named` (`saab`, `patrickCar` with its trailer, `runeVolvo`,
  `andersAudi`), 22 traffic cars of the new types (one bus, one sopbil at most) with seated busts,
  headlights on whenever an engine runs. **Ove's Saab always has the plate `SAB 900`.** People vs
  cars: only a car that itself drives into someone at > 4.5 m/s knocks them over (Ove's own
  walking speed doesn't count); children, Rune and **all the neighbours** are shoved aside
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
  (`hideNearCamera`). On foot it swings in behind Ove after ~2.5 s without the mouse while he walks
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
| `g.patrol`, `g.interrupts`, `g.missions`, `g.stages` | |
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
| `holdAt` | `{ at \| spots: [places], secs = 3, label, radius = 1.8, text, mounds, work, pose }` — hold E on foot; Ove takes the people area's `work` pose of kind `work` ('bend' \| 'low' \| 'shovel' \| 'wall'; without it guessed from the label: lufta/element/lås → wall, skott → shovel, punkter/däck/blomm/grav → low, else bend); `pose: 'write'` keeps the notebook instead; `mounds` puts a snow heap on each spot (Ove stands at its edge, not in it) |
| `fetch` | `{ at, item: 'key' \| 'phone' \| 'wrench' \| 'papers' \| 'flowers', label, text, rMin, rMax, exact, got }` → `m.data.carrying = label` |
| `pickup` | `{ who, at, needCar, text, carText, hello }` — on foot: walk up, they follow; in a car: stop within 9 m |
| `dropoff` | `{ who, at, radius = 8, text, bye, needCar, carText }` — `needCar`: they must arrive in Ove's car (walking beside him doesn't count; `carText` says so) |
| `escort` | `{ who, at \| (none: a sidewalk 45-110 m from `to`), to, push, radius, findText, bringText, hello, min, max }` |
| `catchCat` | `{ near, timer, text, rMin, rMax, failText }` — `buildCat()` wanders, bolts within 7 m at 4.3 m/s (faster than a walk, slower than rask gång), caught within 1.15 m on foot; then carried (`m.data.cat`) until `disposeCtx` |
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
`interrupts.abort()`, `interrupts.active { tpl, ctx, stages, i, stage, timer }`, `.call`,
`.onPhone`, `.auto`, `.nextT`, `.done`, `.failed`, `TEMPLATES`.

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
integer >= 0, clock 0-1439 (else the default), emblems / photos integer ids 0-6, unlocked strings, the
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
("Bilfritt område · −1 Ordning/s · Kliv ur och gå", `.pr-warn`). Neighbours' name tags only within
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
