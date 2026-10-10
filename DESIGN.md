# Saab & Run — En man som heter Ove

Design bible and the **contracts between modules**. Every agent working on this game reads this
first. If you change a contract, update this file in the same breath.

The game is a copy of `../bigmouth_and_run/` (Big Mouth × Simpsons Hit & Run, plain three.js ES
modules, no build step) being turned into a new game. The engine (fixed-step loop, collision,
car physics, AI drivers, mission runner, HUD, headless test driver) stays; the content, the look
and the core loop change.

---------------------------------------------------------------------------------------------------

## 1. Concept

**Omvänd Hit & Run, där du är polisen.** Ove, 59, nybliven änkling och självutnämnd ordningsvakt i
ett svenskt radhusområde, patrullerar området i sin Saab och rapporterar felparkeringar. Men
grannarna avbryter honom hela tiden för att de behöver hjälp — med släpkärran, elementet, katten,
cykeln, ungarna, sjukhuset.

Reversal of Hit & Run, point by point:

| Hit & Run | Saab & Run |
|---|---|
| You cause chaos; the Hit & Run meter fills; cops chase and ram you. | *Others* cause disorder (felparkeringar); the **Ordning** meter drains; *you* chase and ram the ones who flee (**smitare**). |
| Cops "bust" you and you pay coins. | You "ta" (catch) the smitare by ramming/staying on their bumper; they pull over and get **anmälda**. |
| Smash stuff for coins. | Ove picks up other people's litter (**pantburkar**, 1 kr each). Breaking things costs Ordning and kronor — Ove pays for himself. |
| Collect cards/wasps. | 7 **Saab-emblem** and 7 **Sonjas fotografier** hidden around town. |
| Missions from Simpsons characters. | 7 days ("dagar") of story missions from the neighbours, plus constant random **avbrott** (interruptions) in free roam. |

Tone: dry, warm, melancholic and funny — the book/film's tone. Ove is terse and grumpy, never
cruel. **No suicide content** (the book's attempts are replaced by "Ove just wanted to finish his
inspection round in peace").

Language: **all player-facing text is Swedish** (UI, dialogue, signs, README). Code, comments and
CLAUDE.md stay English.

## 2. Look: realistic, not cel-shaded

The user's explicit requirement: **"ingen cellshadad stil den här gången utan realistiskt ska det
vara."** No toon materials, no inverted-hull outlines, no cartoon proportions, no big mouths, no
bright candy colours.

- **Season & light:** a crisp morning in early winter (late November). First snow: a thin snow
  cover on lawns, roofs, car roofs and hedges; plowed, dark, slightly wet asphalt with low snow
  banks (snövallar) along the edges; bare birches, dark spruces. Low sun (~10–14° elevation),
  warm sunlight, cold blue skylight, long soft shadows, a little haze. Optional light snowfall
  (used in the finale).
- **Rendering:** physically based (MeshStandard/MeshPhysical), image-based lighting from an HDRI
  or a PMREM'd sky, soft shadows, ACES/AgX tone mapping, ambient occlusion and subtle bloom in
  post, exponential fog. Real CC0 textures (Poly Haven / ambientCG, downloaded once into
  `assets/`, licence noted in `assets/LICENSES.md`) sampled triplanar in world space, tinted by
  vertex colour, so the existing UV-less `GeoBuilder` primitives look like painted wood, brick,
  concrete tile roofs, asphalt, snow.
- **Swedish suburb vernacular:** radhus in stående träpanel (falu red, ochre yellow, off-white,
  grey-green, dark brown), white window frames and corner boards, black concrete tile or sheet
  metal roofs, small fenced front gardens, förråd, garage rows (garagelängor), lamp posts,
  rows of mailboxes on stands, green wheelie bins, kicksleds (sparkstöttingar), bike racks,
  återvinningsstation, 3–4-storey brick/plaster lamellhus with balconies, a white church,
  Swedish road signs (blue P, P-förbud, gångfart, förbud mot motordrivna fordon, busshållplats),
  Swedish road markings (white dashed centre lines, zebra crossings, yellow zigzag at bus stops).
- **People:** realistic adult proportions (head ≈ 1/7.5 of height), winter clothing (parkas,
  puffer jackets, beanies, scarves, gloves), muted Scandinavian palette. Faces simple but
  human-scaled. Mouths barely move when talking.
- **Cars:** realistic proportions and silhouettes (extruded side profiles with bevels), closed
  cabins with tinted reflective glass (drivers faintly visible), clearcoat paint, chrome, rubber,
  working headlights/brake lights, **Swedish licence plates** (white, blue EU band with "S",
  `ABC 123` or `ABC 12A`).
- **UI:** clean Scandinavian design — Barlow / Barlow Condensed (road-sign feel), Ove's notebook
  in a handwriting font (Caveat). Muted colours, thin rules, no comic-book bursts.

## 3. Cast (`CHARS` keys in `src/actors/models.js`)

| key | who | look | role |
|---|---|---|---|
| `ove` | Ove, 59 (player) | stocky, grey crew cut, heavy brows, dark navy winter jacket, grey trousers, sturdy brown shoes, flat cap optional | player; carries a notebook + pencil (shown when writing) and a phone (shown on calls) |
| `parvaneh` | Parvaneh, 30s, pregnant | dark long hair, warm-coloured coat, scarf, visible bump | neighbour, missions 2 & 7, errands |
| `patrick` | Patrick, her husband | very tall and lanky, glasses, beanie, light parka | can't back a trailer; mission 1 giver; later has a cast (mission 7) |
| `sara` | Sara, 7 | kid, pink snowsuit | passenger/errand |
| `nasanin` | Nasanin, 3 | tiny kid, red snowsuit | passenger/errand |
| `jimmy` | Jimmy, 25 | big and round, hoodie under open jacket, white sneakers | friendly neighbour; mission 4 giver |
| `adrian` | Adrian, 19 | slim, cap, bomber jacket | wants an Audi; mission 5 giver |
| `anita` | Anita, 70s | grey bob, cardigan under coat | Rune's wife; missions 3 & 6 giver |
| `rune` | Rune, 70s | in a **wheelchair**, blanket over knees, cap | Ove's old friend/rival (Volvo man, later BMW!) |
| `anders` | Anders, 40s | slick, long camel coat, sunglasses on head | Audi driver, new chairman of the association; race opponent |
| `vitskjorta` | "Vita skjortan" | white shirt and tie, no coat, clipboard | municipal official who wants Rune in a home; drives a white Škoda; the antagonist |
| cat (not in CHARS) | the stray cat | tabby, scruffy | `buildCat()` export; mission 4 and an errand |

Sonja (Ove's late wife) is never a character — only her grave (landmark `sonjaGrave`) and her
photographs (collectibles).

Ove's voice: short sentences. "Idioter." "Det står ju på skylten." "Det är förbjudet att köra bil
inom området." "Ingen kan någonting nu för tiden." "Japansk skit." "En man ska ha en ordentlig
bil." "Vem backar med släp så?" He secretly cares; he never says so.

## 4. Gameplay systems

### 4.1 Patrol and felparkeringar (`src/game/patrol.js`, replaces `shame.js`)
- The town exports `violationSpots` (see §6). The patrol system keeps ~6 **violations** active:
  a parked car (random type, colour, plate) at a random free spot, with `car.violation =
  { kind, text, spot, reported: false, smitare: bool }`.
- Violations show on the minimap (red "P-förbud" icon) and, within ~35 m, a world-anchored tag
  above the car with the violation text (`hud.tags`).
- **Reporting:** hold **F** within 4 m of the car on foot, or within 7 m in the Saab at
  < 3 m/s ("Ove vevar ner rutan"). 1.8 s of writing; `hud.notebook` shows the page filling in
  (Reg.nr, Plats, Tid, Överträdelse) with a pencil-scratch sound; then an **ANMÄLD** stamp.
  Moving away, speeding up or an incoming call cancels it.
- Reward: +1 anmälan, +7 Ordning, +10 kr. Reported cars leave after a while (driver walks out
  and drives off, or the car is towed away — just despawn when out of sight) and a new
  violation appears elsewhere after 25–45 s (9–16 s while fewer than 3 are open), so reporting
  really lowers the count.
- **Smitare:** ~25% of violations (0% during the mission-1 tutorial) have the driver inside. Only
  street spots outside Ove's own area can be smitare (a car on the walkway has no road to flee
  along): 40% of those, which is about a quarter of all violations. A smitare sits with the
  engine idling (headlights, exhaust); within 22 m its tag adds "· förare i bilen", and on foot
  the prompt warns that the driver is still in the car. When Ove starts writing, the engine starts and they flee (AI `flee` mode, cruise 18–22).
  **Pursuit:** HUD shows `SMITARE` with a "motstånd" bar (100). Ramming them (impact > 3)
  takes `impact × 4`; staying within 12 m drains 6/s (Ove reads the plate). At 0: they pull over
  with hazard lights, banner **TAGEN!**, auto-anmäld: +12 Ordning, +50 kr. If they get more than
  110 m away for 5 s: **SMET!**, −8 Ordning. One pursuit at a time.

### 4.2 Ordning meter (top right; replaces the Shame meter)
`ORDNING I OMRÅDET`, 0–100, starts at 50. Drains 0.022/s per active unreported violation; one
more than 150 m from Ove counts half; ×0.4 while an avbrott or call is active; ×0.5 for 60 s after
KAOS (0.08 was tried first: it emptied the meter in 78 s whatever Ove did).
+7 per report, +12 per caught smitare, +10 per completed avbrott, −10 per failed avbrott,
−12 per pedestrian hit, −3 when Ove's car shoves a neighbour or child aside, −2…−4 per broken prop, −1/s while Ove himself drives a car inside the
car-free zone (Anders shouts "Ove! Det är förbjudet att köra bil inom området!" — once per
minute). At 0: **KAOS I OMRÅDET** — Anders calls an extra föreningsmöte, −50 kr (amounts under
5 kr are not shown), meter resets to 35. Reaching 100: **ORDNING OCH REDA**, +100 kr (once per free-roam stretch).

### 4.3 Avbrott — neighbours interrupt (`src/game/interruptions.js`)
In free roam (not during story missions, which script their own), a neighbour calls every
70–110 s (first one ~45 s after free roam begins). Phone rings (`audio.ring`), `hud.incomingCall`
card with portrait ("Parvaneh ringer…"), two short lines as radio toasts, Ove answers grumpily
("Ja?" / "Vad är det nu då?"). If Ove was writing a report, **the call cancels it** (that's the
joke). Then a short errand with a patience timer (90–150 s) shown with `hud.setErrand`.
Complete: +10 Ordning, +30–60 kr, a reluctant Ove line ("Hmpf."). Time out: the neighbour is
disappointed, −10 Ordning. Errand templates (built from the same stage kinds as missions):
1. Anita: elementet piper igen → hold E at `runeHouse` 3 s ("Lufta elementet").
2. Parvaneh: hämta Nasanin på förskolan → pickup at `preschool` → drop at `parvanehHouse`.
3. Jimmy: glömt mobilen i centrum → fetch item at `centrum` → bring to `jimmyHouse`.
4. Adrian: punktering → hold E at `bikeShed` 4 s ("Laga punkteringen").
5. Patrick: låst sig ute → fetch spare key at `oveHouse` → hold E at `parvanehHouse` 1.5 s.
6. Anita: Rune har rullat iväg → find Rune (45–80 m away on a sidewalk), push him home.
7. Anita: skotta framför dörren → hold E at three spots by `runeHouse`.
8. Parvaneh's girls: katten har rymt igen → short cat chase.
9. Jimmy: skjuts till jobbet → pickup Jimmy at the Solrosvägen bus stop → drive him to `centrum`
   (he must arrive in the car: dropoff option `needCar`).

### 4.4 On foot
Walk 3.2 m/s, rask gång (Shift) 5.5 m/s, one small jump (no double jump, no stomp). Children
(cast and pedestrians) and the neighbours are never knocked over by cars; they are shoved aside,
like Rune. A knock-down depends only on the car's own speed into the person (> 4.5 m/s), so
walking into a parked car just stops Ove. Pushing Rune: 3.0 m/s (3.6 with Shift). **J/click:
"sparka på däcket"** — kicking a car's tyre plays a thunk and an Ove comment ("Bra däck." /
"Japansk skit."); kicking props still breaks them (−Ordning; one kick breaks the nearest prop only). E: talk / get in & out / hold to
interact. F: hold to write a report.

### 4.5 Money & collectibles
`kr` (kronor) replaces coins: pantburkar (cans) lying around (1 kr), rewards. 7 Saab-emblem and
7 Sonjas fotografier (each found plays a short memory toast, e.g. "Sonja, 1984. Hon skrattade åt
honom hela vägen till Göteborg."). All reachable without double jumps.

### 4.6 Controls
| key | till fots | i bil |
|---|---|---|
| WASD / pilar | gå | köra / styra |
| Mus | titta | titta |
| Shift | rask gång | |
| Space | hoppa | handbroms |
| E | prata, kliva i, interagera (håll) | kliva ur |
| F | anteckna felparkering (håll) | anteckna felparkering (håll) |
| J / klick | sparka (däck) | |
| H | | tuta |
| B | | titta bakåt |
| M / N / R | karta / ljud / tillbaka till vägen | |
| Esc / P (gamepad Start) | paus och fortsätt (pausmenyn släpper musen) | |

## 5. Story — seven days (`src/game/missions.js`)

Each day: a giver NPC at a landmark (amber marker over the head, E to talk), intro dialogue in the
letterbox, a banner (`Dag N · Veckodag`, the mission's name), stages, `UPPDRAG KLART` + reward in
kr, the outro, then free roam. The outro is staged: Ove stands at the day's `outroAt` (his garage
door on day 1, his front door on day 4, Bilhallen's forecourt on day 5) and **every** other speaker
is brought within 4 m of him, in plain view (nothing taller than 0.6 m between them); with two other
speakers the camera turns to whoever talks, and a line can carry its own camera beat ("Adrian. Den
där." frames the Saab for sale). World tags, the beacon and the arrow are hidden while the
letterbox is up; the `UPPDRAG KLART` banner is gone before the first outro line. Days 1-6 end at
17:30 ("Dagen är slut"); the next day is offered after **two more reports or 75 s of free roam** (a
`Dag N` / "Ny dag" banner, the clock jumps to 06:30, everyone goes where they spend the day, the
Saab is back at home unless Ove is in or near it; `?test` skips the wait unless `&gate`).
Fail: `UPPDRAG MISSLYCKADES` (it waits for the player: no time-out), E retries from the start of
the day (or from `def.retry.from`: day 5 restarts on the race grid with Adrian aboard), Q gives up
(the giver waits; taking the day up again plays the two-line `retryIntro`). Whoever rode with Ove
when it failed goes home (a taxi), nobody is left on the street. Titles are "Dag 1 – Släpkärran" etc.
During a mission the avbrott scheduler pauses; missions phone in their own calls
(`interrupts.radioOnly`, e.g. "INTE NU!"; radio lines and calls take turns, and a call still going
when Ove arrives is cut off: `interrupts.hangUp`) and shouts. Mission defs may list `extra` (more
neighbours in the scene), `away` (neighbours who are elsewhere that day: hidden at home) and
`elsewhere` (where someone spends the day instead: the girls at Jimmy's on day 2).
Stage kinds (`src/game/stages.js`): `getInCar`, `goto` (+ `calls`, `radio`, `with`, `via` (guide
points: the Akut driveway), timer, and a `chaser`: a car hunting Ove like the Hit & Run cops; it
can wait parked first; its cruise has a rubber band (×1.3 beyond 80 m); contact for ~1.2 s within
6.5 m = **STOPPAD**, the car held 2.5 s and −20 kr, the chaser backs off a few seconds; `catchFails`
/ the def's `bustFails` turn contact into a fail instead), `pickup` (+ `walk`: they walk there),
`dropoff` (+ `walk`), `escort`, `fetch`, `holdAt` (+ `cut`: one press of E, the job happens off
screen), `catchCat` (patience: it bolts from a stride or a close approach and outruns Ove, sits
again, and comes to a man who stands still), `parkIn` (box, heading tolerance, optional trailer and
reverse-only, on-screen guidance in the objective line, `clear` tows away felparkeringar in the
way), `report` (forced spawns near a landmark, smitare off), `race` (a cut to the grid, Ove in the
right-hand lane, countdown, opponent in a named car, rubber band on its cruise), `destroy`
(re-themed: stop a fleeing car by ramming it (≤ 30 Ork a hit) and staying on its bumper; an "Ork"
bar; it pulls over), `grab` (pick something up by the stopped car), `talk` (a mid-mission
conversation), `cut` (to black and back: a time skip, the clock), `wait`.

1. **Släpkärran** (Måndag, 100 kr) — giver `patrick` at `parvanehHouse` (Parvaneh beside him). The
   new neighbours have been backing car + trailer for twenty minutes and flattened Ove's mailbox.
   Get in `patrickCar` → drive past and **back car + trailer into `parvanehDrive`** (reverse-only,
   trailer in the box; Patrick shouts useless advice) → report 3 felparkeringar at the guest
   parking (tutorial: no smitare) → get in the `saab` → park it nose first in `oveGarageSpot`.
   Outro at Ove's garage door: Parvaneh brings saffransris; Ove pretends not to want it.
2. **Sjukhuset** (Tisdag, 150 kr) — giver `parvaneh`; Patrick fell off the ladder putting up an
   advent star and went in the ambulance (`away`), the girls are at Jimmy's (`elsewhere`), and
   Parvaneh has no driving licence. Get in the `saab` while she walks to the residents' lot (Ove
   won't drive into the area) → pick her up where they meet (by the lot entrance) → timed drive to
   the hospital with her riding along (she talks; Jimmy phones about ice cream for breakfast), the
   guide leading through the Akut driveway → drop her at the canopy (`hospitalDrop`; she walks in)
   → park in `hospitalSpot`. Outro: "Jag betalar inte för att stå still!" — and she decides he will
   teach her to drive. **From now on Patrick wears a cast.**
3. **Elementet** (Onsdag, 150 kr) — giver `anita` at `runeHouse`. Fetch the elementnyckel at
   `oveGarage` (brass, Ove's since 1991) → Anita phones: two cars block the soprum → report 2 at
   `garbageRoom` → at `runeHouse` "Gå in och lufta elementen": one press of E and a cut to black
   ("Ove går in och luftar elementen. Ett i taget."). Outro: Rune, lucid for a second: "...Saab." —
   "Ja, Rune. Saab."
4. **Katten** (Torsdag, 150 kr) — giver `jimmy` at `jimmyHouse`. The stray sits in the snow by the
   `bikeShed` (somewhere open) → `catchCat` (110 s): running after it never works; Jimmy first says
   "Spring efter den!", then "Nej, vänta! Stå still!"; standing still, the cat comes to Ove ("Kiss,
   kiss... Hmpf.") → carry it home to `oveHouse`, "in i värmen". Outro at his door: "Den får stanna.
   Tills vidare." **From now on the cat sits by Ove's door.**
5. **Saab, inte Audi** (Fredag, 200 kr) — giver `adrian` at `adrianSpot`, `anders` beside him.
   Adrian wants an Audi; Anders brags. Get in the `saab` → pick up Adrian → a cut to the grid on
   Solrosvägen (the first straight cleared of traffic): Ove in the right-hand lane, Anders' own
   `andersAudi` beside him, kept in the left lane along the straight → race via three checkpoints
   to `dealerFinish` in front of Bilhallen (Anders: cruise 19, careful in corners, eases off when he
   leads; a clean drive wins by ~3 s, a crash loses). Outro on Bilhallen's forecourt, a grey Saab
   900 for sale (35 000:-) beside them: Adrian buys a Saab. **From now on Adrian's Saab stands in
   `adrianBay` in the lot.**
6. **Vita skjortan** (Lördag, 250 kr) — giver `anita`; the municipality wants Rune in a home and
   took his papers. Get in the `saab` → `destroy`: stop Vita skjortan's white Škoda (rams take at
   most 30 Ork each, staying on its bumper drains 8/s; he pulls over) → `talk`: he steps out ("Det
   här är inte över, Ove. Vi har papper på allt." — "Det har jag också.") → `grab` the folder →
   bring it to `runeHouse`. Outro: a signature is missing; Rune stays.
7. **Värkarna** (Söndag, 500 kr, light snowfall) — giver `patrick` (arm in a cast) at
   `parvanehHouse`: Parvaneh's waters broke, and Vita skjortan's Škoda has waited by the entrance
   all morning (parked on the west street from the start of the day). Get in the `saab` while she
   walks to the lot → pick her up → timed drive to the hospital: the Škoda sets off after Ove
   (`chaser`, STOPPAD on contact) while every neighbour phones (Anita, Sara: "...Ja. Men INTE NU!",
   Jimmy, Adrian, Anders) → drop her off: "Gå nu, Ove. Det är söndag. Hälsa Sonja från mig." → cut:
   **Senare samma dag**, 15:40, the Saab in the hospital car park → on the way to the cemetery
   Patrick phones: a boy, he fainted (only a little) → buy flowers at the `flowerShop` kiosk → hold E
   3 s at `sonjaGrave` "Lägg blommorna på Sonjas grav" (the flowers stay on the plinth,
   `graveFlowers`). Outro: Ove alone, telling Sonja about the week. Final banner **OMRÅDET ÄR I
   ORDNING** (the Ordning meter is lifted to at least 90 to match); free roam (patrol, avbrott) goes
   on.

## 6. World contract (`src/world/*`)

Grid engine unchanged: `layout.js` 7×7 blocks, pitch 80 m, roads between all blocks, right-hand
traffic. `MAP` gets new block types. Ove's radhusområde (block type `ove`) is the heart of the
map, near the centre. Required block types: `ove` (car-free interior with walkways wide enough
for a car + trailer, garage row, parking lot with guest parking and a handicap bay, soprum /
återvinning, cykelförråd, ~5 rows of radhus; Ove's, Parvaneh & Patrick's, Rune & Anita's,
Jimmy's and Anders' houses are all here), `radhus` (other row-house areas), `villa`,
`apartments`, `centrum`, `hospital`, `church`, `cemetery`, `dealer` (bilhandlare), `preschool`,
`kommun`, `gas`, `park`, `field`, `forest` (edges).

`town.js` must export (in addition to the existing `parkedCars`, `pedLoops`, `animated`,
`lamps`, `bouncers`):

- **landmarks** (via `f.mark`; `{x, z, yaw}` — for people, `yaw` is the direction someone
  standing there faces). Spots must be free ground-level positions, never inside a footprint:
  `oveHouse` (player start, at Ove's front door), `oveGarage` (in front of Ove's garage door),
  `parvanehHouse`, `runeHouse`, `jimmyHouse`, `andersHouse`, `adrianSpot`, `bikeShed`,
  `garbageRoom`, `parking`, `guestParking`, `hospital` (entrance), `preschool`, `centrum`,
  `dealer`, `church`, `cemetery` (gate), `sonjaGrave` (standing spot in front of the stone,
  facing it), `kommun`, `gas`, `park`, `field`, `busStop`.
- **boxes** (landmarks with `w`, `l`; `yaw` = the heading a car parked correctly has):
  `oveGarageSpot` (inside Ove's open garage), `parvanehDrive` (on the walkway in front of their
  house, long enough for car + trailer ≈ 9.5 × 3.2 m), `hospitalSpot` (a bay in the hospital
  car park), `saabSpot` (where the Saab stands at start, outside the garage).
- **parkedCars names:** `saab` (type `saab900`, dark blue, at `saabSpot`), `patrickCar` (type
  `kombi` or `skoda`, with `trailer: true`, standing crooked on the walkway near
  `parvanehHouse`), `runeVolvo` (`volvo240`, in the garage row), `andersAudi` (`audi`, by
  `andersHouse`).
- `violationSpots`: ≥ 40 entries `{x, z, yaw, kind}` spread over the map, most in and around
  `ove` and the nearby blocks. `kind` ∈ `carfree` (inom området), `lawn` (på gräsmattan),
  `sidewalk` (uppe på trottoaren), `busstop`, `handicap`, `garbage` (framför soprummet),
  `guest24` (gästparkering > 24 h), `firelane` (räddningsväg), `loading` (lastzon), `corner`
  (inom 10 m från korsning), `crosswalk` (på övergångsstället). A spot must fit a 4.8 × 1.9 m car
  with no solid inside it and **must not intrude into a driving lane**: anything on a street sits
  with its centre ≥ 5.5 m from the road centre line (half up on the sidewalk).
- `carFreeZones`: array of `{x0, z0, x1, z1}` rectangles (the `ove` interior), and
  `isCarFree(x, z)` in `layout.js` or `town.js`.
- `collectibleSpots = { emblems: [[x,y,z] ×7], photos: [[x,y,z] ×7] }` — reachable on foot with
  one small jump (max ledge 0.45 m step + ~0.5 m jump).
- `litterSpots`: ~120 `[x, y, z]` for pantburkar along sidewalks, the parking lot, the park,
  bus stops.

## 7. Car contract (`src/actors/car.js`, `src/actors/carmodels.js`, `src/actors/trailer.js`)

`CAR_TYPES` keys: `saab900` (Ove's Saab 900 classic hatchback, the hero car), `volvo240`
(boxy saloon/estate), `volvo740`, `audi` (A6-ish saloon, Anders), `bmw` (saloon), `skoda`
(Octavia-ish estate, white for Vita skjortan), `golf` (VW-ish hatch), `kombi` (generic estate),
`taxi`, `van` (delivery van), `bus` (red city bus), `garbage` (sopbil). Old keys (`sedan`,
`hatch`, `wagon`, `pickup`, `hearse`, `muscle`, `icecream`) stay as aliases so nothing breaks.
Spec fields unchanged (`len, wid, bodyH, cabinH, wheelR, maxSpeed, accel, grip, steer, mass, hp,
tall`). Every `Car` gets:
- `car.plate` — Swedish plate string, `ABC 123` or `ABC 12A` (no I, Q, V, Å, Ä, Ö), unique,
  rendered on the front and rear plate; `opts.plate` overrides. `car.platePos(side='rear', out)`
  gives the plate's world position.
- lights: `car.setHeadlights(on)`, brake lights from `ctrl.brake`, `car.hazard = true` blinks
  the indicators (pulled-over smitare), reversing light when going backwards.
- `car.attachTrailer()` / `car.trailer` — a kinematic trailer (hitch at the rear bumper, yaw
  follows the classic `ω = v/L · sin(Δyaw)` law, so reversing jackknifes realistically) with its
  own OBB against static solids; `trailer.x/z/yaw/len/wid`.
- Player-car speed boost reduced to realistic arcade (≈ 140 km/h top). Speeds in m/s; the HUD
  shows km/h.
- Driver visibility: closed cabin, tinted glass; drivers/passengers seated inside are visible
  through it.

## 8. Character contract (`src/actors/models.js`, `src/actors/character.js`)

Keep the API: `CHARS`, `buildCharacter(def)` → `{ root, body, hips, neck, head, mouth, arms,
legs, height, legLen, armLen, ... }`, `animateCharacter(m, st, dt)`, `randomPed(r)` (Swedish
winter pedestrians), `buildBust(def)` (cheap seated driver). New: `buildCat()` (returns
`{ root, animate(dt, speed) }`), anim flags `st.write` (notebook + pencil in hands), `st.phone`
(phone at ear), `st.push` (pushing something), and `kind: 'wheelchair'` for Rune (sits in a
wheelchair model; the chair rolls with him). Characters must render well in `renderPortrait`.

Added in phase 2 (details and the bone order in `notes/people.md`):
- `st.carry` — forearms cradling something at chest height (the cat); put the carried thing at
  `carryPoint(model, outVec3)` (world space, after the model's matrices are updated). The cat has
  `sit(on)` (waiting) and `hold(on)` (curled while carried).
- `st.work` + `st.workKind` — hold-E jobs: `'bend'` (default), `'low'` (a tyre), `'shovel'`,
  `'wall'` (a radiator). Every `holdAt` stage passes its kind.
- `st.cheer` ("yes!"), `st.talk`, blinking (automatic at lod 0), finger/thumb bones and hand shapes
  (grip, fist, pen, phone, board, carry).
- `buildCharacter(def, { lod, headLod, faceTex })`: the cast is lod 0 with a per-character baked
  face texture; pedestrians lod 1; busts lod 2 body + lod 1 head.
- Seating: a seated character's root goes at `car.seatLocal(side)` + (0, 0.12 − legLen, 0.12)
  inside `car.tilt`; a bust's origin at `car.seatLocal(1)`. Then the hands land on the wheel.
- `st.kneel` (+ `st.kneelReach` 0..1) — down on one knee (Sonja's grave): the right knee on the
  ground, the left foot forward, torso upright, head bowed. By itself it goes down holding flowers,
  lays them ~0.42 m ahead of the root (~0.27 m above it) and rests the hands on the knee (~3 s);
  `kneelPoint(model, outVec3)` is the bouquet between the hands. The caller sets and clears it.
- Level of detail: a model's meshes hang under `model.lodNode` (a `THREE.LOD` picked per render
  camera, so `renderPortrait` always gets level 0); `Character` gives the cast a far level beyond
  15 m and pedestrians beyond 40 m on the same skeleton (`LOD_DIST`), no shadow beyond 60 m.
  Nothing to call.

## 9. HUD & audio contract (`src/game/hud.js`, `style.css`, `index.html`, `src/audio.js`)

Keep every existing `hud.*` function working (some re-styled/renamed in text only), plus:
- `hud.setMeter(v)` — the Ordning meter (0–100); `hud.setShame` stays as an alias.
- `hud.setPursuit(o | null)` — `{ label, bar (0–1), dist }` for an active smitare chase.
- `hud.setReports(n)` — anmälningar counter next to kr (`hud.setCoins` shows kronor).
- `hud.notebook.show({ plate, kind, text, place, time })`, `.progress(p)`, `.done()` (stamp
  ANMÄLD), `.cancel(reason)`.
- `hud.incomingCall(who, name)` → shows the ringing card; `hud.endCall()`.
- `hud.setErrand(o | null)` — the avbrott panel `{ title, text, timer, bar, barLabel }`, separate
  from the mission objective.
- `hud.tags(list)` — called every frame with `[{ x, y, z, text, cls }]`; draws world-anchored
  labels (projected with the camera), e.g. violation tags.
- `hud.setClock(text)` — in-game time ("06:42").
- `hud.renderLog(entries)` — Ove's notebook page in the pause menu, entries
  `{ plate, kind, text, time }`.
- Minimap marker types in addition to the old ones: `violation`, `smitare`, `errand`,
  `neighbour`, `collectible`.
- Audio, in addition to the existing calls (all keep working): `audio.ring(on)` (old landline
  phone), `audio.pen(on)` (pencil scratching), `audio.stamp()`, `audio.doorbell()`,
  `audio.catMeow()`, `audio.alarm()` (= old `shameBell`), engine re-voiced as a Saab four,
  melancholic synthesized piano/strings music instead of the walking bass.

## 10. Rendering contract (`src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`)

Built in phase 1. Everything below is the actual API; later agents rely only on this section.

### 10.1 What the renderer does (so you know what you get for free)
- **Pipeline:** `WebGLRenderer` -> `EffectComposer` (HalfFloat, 4x MSAA) -> `UnrealBloomPass`
  (threshold 2.6, only lights / sun glints / fire bloom) -> `OutputPass` (ACES Filmic, exposure
  1.45, then a display grade: a toe lift (display-linear ^ 0.8 - ACES alone crushes shade into
  navy-black), saturation 1.0 falling to 0.65 x in the deepest tones, a gentle S-curve on the upper
  half only, + sRGB).
  Call **`renderFrame()`** once per frame instead of `renderer.render(scene, camera)` (main.js
  does). It runs a pre-pass that renders the sun's shadow cascades and the normal/depth buffer for
  ambient occlusion (GTAO), then the main pass. `renderer.render()` still works for one-off
  renders to a render target (portraits), but gets no AO/bloom/tone mapping (output is linear).
- **Light:** one `SunLight` (`sun`, 13 deg elevation, azimuth 143 deg: it shines from +x/-z, so
  shadows fall towards -x/+z; intensity 6, warm low-sun colour (1, 0.80, 0.58)) with two cascaded
  shadow maps (crisp to 30 m, coarse to 210 m), and image-based light from a CC0 winter HDRI
  (`assets/sky/passendorf_snow_2k.hdr`, sun clamped out, saturation 0.62, tinted (0.94, 1, 1.05)
  so shade is cold blue rather than lilac, intensity 0.62). The environment's lower hemisphere is
  faded to the photo's mean ground colour (the photo's field has nothing to do with our town, and
  paint/glass would mirror it). Measured at 1280x720: sunlit snow ~226 sRGB, shaded snow ~(143, 158,
  181) (blue-grey, not violet), shaded asphalt ~(52, 57, 66), sunlit asphalt ~(180, 176, 172). The
  HDRI is also the sky, its sun warped onto `SUN_DIR`; the sky turns into the fog colour below ~2.5-7
  deg of the *photo's* elevation (a low photo sun stretches its treeline upwards, so the cut is made
  there), and below ~14 deg nothing in it may be darker than the haze, so the photo's own ground and
  treeline never show and **the 3D hills are the horizon** (keep something tall-ish out there).
  There is **no hemisphere/ambient light**; don't add one (the HDRI does that job).
- **Fog:** height fog (density 0.0022 at y <= 0, falling off with a 35 m scale height, integrated
  along the view ray: haze lies in the valley, aerial views stay clear) plus a thin exp2 far haze
  (`scene.fog` = FogExp2 0.0012, also thinning with altitude). Colour from the sky, tinted warm
  towards the sun. Applied by every built-in material through the fog chunk; custom shaders use
  `FOG_GLSL` (exported string defining `float gameFogAmount(vec3 camPos, vec3 rel, float exp2)`,
  `rel` = point - camera, pass `LIGHTING.fogExp2`), as fx.js does.
- **AO** (GTAO at half resolution, radius 0.9 m, thickness 0.5 m - contact occlusion, not metre-wide
  clouds on a wall behind a bin - raised to the power 1.3) darkens *indirect* light inside every
  MeshStandard/MeshPhysical material, and a quarter of it also darkens *direct* light on
  upward-facing receivers (contact cue under cars, at wall feet). Things that must not occlude
  (particles, glows, beams, see-through shells) set `obj.userData.noAO = true`; transparent
  single-material meshes, Points, Lines and Sprites are skipped automatically.
- **Glints:** direct (sun) specular is clamped to 3x before bloom (snow crystals to 14x), so
  wet or glossy surfaces glint without white smears. Snow sparkle is a sun-only glint (round,
  pixel-sized crystal facets at 1.4 cm and 4.5 cm, added to the sun's specular, so it never darkens
  the snow and vanishes in shade). Reflected skylight is boosted per surface (`env` in `SURFACES`:
  glass 1.8, tinted glass 1.6, chrome 1.4, car paint 1.3 + its clear coat 2.0 (`envCC`), default 1.2,
  asphalt 0.75 with its sky reflection half desaturated (`specDesat`), so damp shade reads grey).
- **Shadow pre-pass detail:** a mesh whose material is an array is drawn as **one** call in the
  shadow and AO passes (surfaces don't matter there). So every part of a multi-surface mesh casts
  a shadow, including any 'tinted' glass in it. Put see-through car glass in **its own** mesh
  (single 'tinted' material -> casts no shadow, no AO), as car.js does.
- **Draw calls:** one draw call per surface per mesh in the main pass. Merge static things per
  block with `GeoBuilder` (one mesh per block per builder); prefer `InstancedMesh` for repeated
  props. Old town as of phase 1 round 3: ~1550-1650 calls/frame (~780 of them in the shadow/AO
  pre-pass), ~2.85M triangles drawn (all passes; the scene itself is ~1.3M, the biggest being
  instanced fence boards, coins and lamp posts), `renderFrame` ~5-6.5 ms CPU at 1280x720 on the RTX
  4070, 60 fps. Cars are the biggest consumer of calls (body ~7 surfaces + glass + 4 wheels x 2
  each): merge wheel surfaces if you can.
- **Quality:** `?lowgfx` in the URL, or `setQuality('low' | 'high')` at runtime (`getQuality()`).
  High = pixel ratio capped at 1.5. Low = no AO, no bloom, no MSAA, 1024 shadow maps, pixel ratio 1.
- Look-dev URL overrides (for testing only): `&hdri=winter_river_2k` (hazier alternative sky),
  `&sunelev=13&sunaz=143`, `&exposure=1.45`, `&tm=aces|agx|neutral|none`, `&sunint=6`,
  `&suncol=1,0.8,0.58`, `&envint=0.62`, `&envsat=0.55`, `&envtint=0.97,1,1.02`, `&fog=0.0012`
  (exp2 haze), `&hfog=0.0022&hfogh=35` (height fog), `&sat=1&contrast=0.22&toe=0.8&sdesat=0.65`
  (grade), `&aostr=1.3&aorad=0.9&aoscale=1&aothick=0.5&aofall=1&aoexp=1.6`, `&aoview` (shows the AO
  term only), `&dbg=1|2|3|4` (albedo / indirect diffuse / indirect specular / direct light of every
  surface; use with `&tm=none&contrast=0&toe=1&sdesat=1&exposure=1` to read linear values off a
  screenshot), `&glintdbg` (snow crystal cells in green, their glints in red).

### 10.2 Surfaces: saying what things are made of
`GeoBuilder` keeps all its methods (`add, box, boxB, sphere, cyl, cone, ico, build, empty,
parts`) and gains a sticky **`use(surface, { snow })`**. Every part added after `use()` is made of
that surface until the next `use()`. `use()` returns the builder, so `g.use('wood').box(...)`
chains. `color` is the surface's *average* colour (the texture only adds variation); pass `null`
to get the surface's natural default colour. A new builder starts at `'plain'`.

Textures are sampled **triplanar in each part's own frame** (rotation removed, metres), so boards
stay vertical on a rotated house, roof-tile rows follow the ridge, and two parts with the same
rotation meet without a seam. They stay glued to the vertices when the geometry is later moved or
transformed (`geo.translate`, `applyMatrix4`, moving meshes), so cars and people can be textured.

| surface | looks like | default colour | snow |
|---|---|---|---|
| `plain` | fine painted plaster (the default) | `0xd6d2ca` | yes |
| `plaster` | rougher stucco / puts | `0xd6d2ca` | yes |
| `wood` (alias `panel`) | painted vertical board panel, *stående panel*, boards ~9 cm, each board a slightly different tone and sheen, darker joints | `0x8a2a1e` falu red | yes |
| `brick` | red brick with grey mortar, 1.8 m per tile (tint for yellow brick) | `0xa0735e` | yes |
| `tile` (alias `roof`) | wavy concrete pantiles (*betongpannor*), rows ~0.36 m along the part's X; in thin snow the crests show as broken dark lines down the slope, the cover varying smoothly from tile to tile and over the roof (some areas white, some barer) | `0x303034` | yes |
| `metalroof` | box-profile sheet metal, ribs along the part's Z (down the slope); ribs poke through thin snow | `0x3a3c3e` | yes |
| `asphalt` | aged coarse-aggregate asphalt, no snow (plowed). On the street grid (`setRoadGrid`): slightly damp all over, two paler dry wheel tracks per lane, a wetter grimy band along the kerbs, transverse cracks and a centre-joint crack; everywhere: sparse patch repairs, darker damp patches. Damp shade reads dark neutral grey | `0x6a6866` (pass `null`, or about this) | no |
| `marking` | road paint on asphalt grain (white lines, zebra) | `0xd8d8d2` | no |
| `concrete` | smooth cast concrete (plinths, kerbs, stairs, balconies) | `0xa8a8a4` | yes |
| `paving` | concrete sidewalk slabs ~0.4 m; its thin snow is compacted remnant snow lying in the joints and hollows (any textured surface with snow < 0.5 does this) | `0x9e9c98` | thin |
| `snow` | fresh snow with drifts and sparkle (lawns, fields, banks); large wind swells, and sastrugi on gentle slopes, that the low sun rakes on far fields | `0xf3f4f5` | - |
| `hillside` | `snow` for the distant hills: plus stands of snowy spruce forest (a dark, grainy tone with crisp frayed edges) and bare patches on steep sun-facing faces, so the hills read as land | `0xf3f4f5` | - |
| `grass` | dry winter grass; with default snow it is ~85 % covered | `0x6b6440` | yes |
| `gravel` | brown-grey gravel paths, *grus* | `0x8a8070` | partly |
| `bark` | rough pine/spruce bark, branches | `0x5a4a3c` | some |
| `birch` | procedural birch bark: chalk-white, black lenticels and patches (use on trunks; texture runs around the part's Y axis) | `0xdcd8cc` | some |
| `foliage` (alias `hedge`) | procedural leaf/needle clumps with shadowed gaps, band-limited (no shimmer); almost no specular (no glossy rim), light wraps round it; snow as a ragged cap on top | `0x41543a` | yes |
| `spruce` | `foliage` plus branch whorls on the sloped faces of cones every ~0.42 m (bright tip edge, shadowed gap, continuous across the period: no seam lines), with snow in thin broken bands on the upper side of each whorl | `0x34472f` | yes |
| `fabric` | woven wool cloth (coats, seats, awnings), 0.3 m tile | `0x3a4250` | no |
| `leather` | grained leather (shoes, gloves, bags) | `0x3a2618` | no |
| `skin` | skin: smooth, slightly rough | `0xd8a888` | no |
| `hair` | strand-like procedural detail (hair, fur, beards) | `0x4a3a2a` | no |
| `paint` | metallic car paint with a mirror clear coat (roughness 0.015, faint orange peel); a fake body curvature (normals bent outwards from the car's centre, in the mesh's own frame: assumes a car-sized mesh centred at x=z=0, y~0.85) slides the sky and horizon across flat panels | `0x2a3a5a` | yes (parked cars) |
| `paintsolid` | solid (non-metallic) car paint, same clear coat and curvature | `0xc8c8c4` | yes |
| `chrome` | polished chrome / bright metal | `0xd8dade` | no |
| `metal` | brushed / galvanised steel (poles, railings, rims) | `0x9a9da0` | some |
| `painted` | smooth painted surface (trim, window frames, doors, signs posts) | `0xe8e6e0` | yes |
| `rubber` | tyres, seals, matte black rubber | `0x1c1c1e` | no |
| `plastic` | semi-gloss plastic (bins, bumpers, toys) | `0x5a6a5a` | some |
| `glass` | *opaque* window pane (ior 1.52: Fresnel brightens grazing views): sharp reflections, dim room behind; per pane side curtains, a sheer curtain, half-lowered blinds or a lamp on (fitted to the pane: build each pane as its own box); panes wider than 3 m get softer reflections. Pass `null` (the room is procedural; a dark colour just makes navy slabs) | `0x8a9298` | no |
| `tinted` | *see-through* tinted glass (car windows, bus shelters): a dark filter (60 %) with almost no diffuse; reflections stay bright | `0x2a3036` | no |
| `light` | emissive lamp; **colour = light colour**, intensity 4 | `0xfff2d6` | no |
| `lamp` | unlit lamp lens / reflector (headlights or tail-lights when off) | `0xd8d8d0` | no |
| `water` | dark water with slow ripples | `0x0e1a1e` | no |
| `ice` | milky ice: thin pale cracks along some edges of two Voronoi layers (~1.3 m plates, ~0.35 m pieces near), trapped-bubble speckle, a dusting of snow | `0xb8c8d0` | 0.4 |

Unknown names fall back to `plain`. `SURFACES` (exported) holds the table (scale, roughness, ...).

### 10.3 Meshes and materials
- **`realMesh(geo, opts)`** -> `THREE.Mesh` with one material per surface group, shadows on.
  `opts`: `cast` (true), `receive` (true), `snow` (true; **false for characters, the player's
  car, signs, lights, anything that moves around a lot**), `unique` (`true` or a list of surface
  names: those get their own material instances you may change per mesh), `tint` (`{ paint:
  0x335577 }`: per-surface colour multiplier, implies unique), `material` (force one material for
  the whole mesh; legacy). `mesh.userData.surfaceMats[surface]` gives each surface's material.
- **`toonMesh`** is an alias of `realMesh` (the `outline` option is ignored; there are no outlines
  anywhere). `outlineMat()` / `outlineGeometry()` remain as harmless no-ops.
- **`realMaterials(geo, opts)`** -> the material (array) for an `InstancedMesh`:
  `new THREE.InstancedMesh(geo, realMaterials(geo), n)` (props.js, pickups.js do this).
- **`surfaceMaterial(name, { snow, unique, intensity })`** -> one surface material (shared and
  cached unless `unique`). Use it for non-GeoBuilder geometry after
  **`ensureSurfaceAttributes(geo)`** (adds white vertex colours and triplanar attributes).
- Geometry from `GeoBuilder.build()` has attributes `position, normal, color, tri (vec4), trin`
  and `geo.userData.surfaces` (surface name per group). If you push your own geometry into
  `g.parts`, it is accepted (missing attributes are added; built multi-surface geometry is split
  back into its surfaces).
- **Legacy `MAT.*`** (all PBR now): `MAT.toon` (= plain), `MAT.burnt` (charred, set as a single
  material on a wrecked car body; car.js restores `body.userData.baseMaterial` on repair),
  `MAT.ghost` (55 % transparent plain), `MAT.glass` (= tinted), `MAT.water`, `MAT.white`,
  `MAT.cloud`, `MAT.mouth`, `MAT.beam` (additive translucent amber).
- Any `MeshStandardMaterial`/`MeshPhysicalMaterial` you create yourself automatically gets AO
  and the fog tint (prototype hook). If you set your own `onBeforeCompile` on one, call
  `injectSceneShading(shader)` inside it.

### 10.4 Lights, glass, car paint, signs
- **Lit things:** `g.use('light').box(0xffe8c0, ...)` (street lamps, lit signs, headlights *on*).
  Emission = vertex colour x 4. To switch/dim per mesh: `const m = realMesh(geo, { unique:
  ['light'] }); setLight(m, on ? 4 : 0);` (intensity any value; ~1-2 = dim, 6+ = blooms hard).
  Unlit lenses: `'lamp'`. Typical car: lenses in `'lamp'` on the body, plus a small separate
  `'light'` mesh per lamp group (headlights, brake lights, indicators) built with
  `unique: ['light']` and driven by `setLight`. Real point lights are not used (daylight scene).
- **Windows on buildings:** `'glass'` (opaque; never see-through, so no need for interiors), colour
  `null`. Frame them with `'painted'` boxes. One box per pane (curtains/blinds are fitted to each
  glass part).
  **No 'glint' boxes or white bars on panes** (the old cartoon window glints): real reflections do
  that now. Delete them from any window builder you inherit. **Car / shelter glass:** `'tinted'` in its own mesh,
  `realMesh(glassGeo, { snow: false, cast: false })`, `renderOrder = 2`. Seated people inside are
  visible through it.
- **Per-car paint colour:** paint parts use `'paint'` (metallic) or `'paintsolid'`; either bake
  the colour into the vertex colour (each car builds its own geometry: `g.use('paint').box(color,
  ...)`, as car.js does now), or build one shared white-painted geometry per car type and give
  each car `realMesh(geo, { tint: { paint: carColor } })`. Parked cars may keep `snow: true`
  (snow on the roof and bonnet); the Saab and moving traffic should use `snow: false`. Flat box
  panels reflect one direction each and read as plastic: bevel / curve the body so the sky and
  the horizon slide across it. Rims in `'metal'` (or `'chrome'` for hubcaps), never chalky
  `'painted'` white; tyres `'rubber'`.
- **Signs:** `signMesh(text, w, h, { bg, fg, border, font, weight, scale, double, glow })` -> a
  plane with a printed-look `MeshStandardMaterial` (lit by the scene, roughness 0.55,
  polygonOffset so it can sit flush on a wall). `glow: 0..1` adds faint self-illumination (lit
  shop signs, scoreboard). `textCanvas(...)` makes the canvas only. Default font: Barlow
  Condensed 600 (falls back to Arial Narrow until the UI loads the font).

### 10.5 Snow, wetness, weather
- Snow settles automatically on upward-facing faces (roofs, ledges, sills, fence tops, hedges,
  car roofs, lawns) with noisy thin edges. Strength = **`setSnow(amount)`** (global, 0..1.5,
  default 1 = first snow) x the surface's susceptibility (table above) x the part's
  `use(surface, { snow: 0..1 })` (default 1) x the mesh's `realMesh(..., { snow })`.
  Snow is not occlusion-aware: a top face under a roof also gets snow, so give porch floors or
  carport floors `{ snow: 0 }`. Textured surfaces with susceptibility < 0.5 (paving) get compacted
  remnant snow in their joints rather than fresh patches; for real snow along a sidewalk, place
  `'snow'` strips/banks explicitly.
- `setWetness(0..1)` scales the dampness of asphalt (default 0.6; damp asphalt is ~0.72x as bright
  and moderately glossy, roughness ~0.42 - never a mirror; the kerb bands are wettest. Want a real
  puddle? Make a small explicit decal/mesh in `'water'`).
- `setRoadGrid({ pitch, offset, halfWidth, lane, extent })` tells asphalt where the streets are
  (centre lines along x and z at `offset + k * pitch`, asphalt half-width, lane-centre offset,
  grid covers |x|, |z| <= `extent`), for wheel tracks, damp kerbs and transverse cracks.
  Defaults match `world/layout.js` (80, 40, 5.5, 2.75, 285.5); call it if the grid changes.
- **Snowfall:** `fx.snowfall(on, intensity = 0.6)` - flakes in a 36 m box around the camera,
  eased in/out over a few seconds (finale).

### 10.6 Particles (`src/game/fx.js`)
Same API as before; all lit by the sun/sky, soft (fade where they touch geometry), fogged:
`fx.init(scene)`, `fx.tick(dt)`, `fx.spawn(x, y, z, color, { vx, vy, vz, s0, s1, life, drag,
grav })` (saturated bright colours become glowing additive particles, others soft lit smoke),
`fx.smoke(x, y, z, dark)` (engine smoke / pale steam), `fx.exhaust(x, y, z, vx, vz)` (cold-morning
tailpipe vapour; call every ~0.1 s from a running car's tailpipe), `fx.fire(x, y, z)`,
`fx.explosion(x, y, z)`, `fx.dust(x, z, n, y)` (= snow powder kicked up), `fx.sparkle(x, y, z,
color, n)` (small glints), `fx.sparks(x, y, z, n)` (hot streaks that bounce), `fx.shame(x, y, z,
n)` (neutral puff now), `fx.splash(x, z)` (slush), `fx.skid(x, z, yaw, w, kind)` (tyre track
decal; `kind` 'snow' = pale compressed rut, else dark rubber on asphalt; if `kind` is omitted
`fx.surfaceAt(x, z)` is asked when the world sets it), `fx.snowfall(on, intensity)`.
Puffs are procedural (no sprite texture): a ball whose edge is eaten by a per-particle noise field
that drifts and erodes with age (billows and wisps, rotated per particle), lit like a translucent
ball with self-shading towards the sun, softly faded where scene geometry cuts through its depth
(linear depth, no straight edges at kerbs), same height fog as the scene. Fire is a third mode: a
temperature ramp (white-yellow core ~15x, far over the bloom threshold, through orange to dark red)
cooling with age, with licking noise edges; `fx.fire` tongues are alpha-blended (twenty overlapping
ones converge on the flame colour, no white blob), the explosion's fireball is additive. The
explosion is a white-hot flash, a fireball of cooling lumps, glowing streaks, sparks and a column of
dark smoke; `fx.dust` a thin, frayed snow powder.

### 10.7 Markers (`src/game/markers.js`)
Unchanged API, new look (self-lit amber that dims what is behind it, with a Fresnel rim that
blooms a little - a light hologram, not a lit object): `new Bang(scene).set(x, y, z, t)` /
`.show(bool)` - small floating amber diamond with a soft glow and a faint thread of light down
(place `y` ~0.9 m above the head);
`new Beacon(scene).set(x, groundY, z, t, radius)` / `.hide()` - soft light column, ground ring
of `radius`, small chevron above; `new GuideArrow(scene).set(x, y, z, yaw, t)` / `.hide()` - slim
amber chevron above the player pointing along `yaw`. Amber is `0xffb347`; pass another colour
to the constructors if needed.

### 10.8 Other exports
`THREE, renderer, scene, camera, sun, composer, MAT, SUN_DIR` (unit vector towards the sun),
`LIGHTING` (`sunDir, sunColor` (x intensity), `sky, ground` (skylight as the materials get it:
desaturated, tinted, x env intensity), `fog` colour, `fogExp2` - for custom shaders), `FOG_GLSL`,
`setRoadGrid`,
`gfxReady` (promise: await it after `initGfx()` before building content; main.js does),
`renderFrame, setQuality, getQuality, setSnow, getSnow, setWetness, setLight, gfxStats`
(`ms, calls, tris, aoCalls`; also in `__stats()`), `sceneDepthTexture()`, `followSun()` and
`tickSky(t)` (kept for main.js; `tickSky` drives water/time uniforms), `mat, PRIM, makeWedge,
GeoBuilder, textCanvas, signMesh, toonGradient` (dummy).
Assets: `assets/tex/*` (made by `uv run tools/textures.py [keys...]`), `assets/sky/*.hdr`, licences in
`assets/LICENSES.md`. Look-dev without gameplay: `PORT=88xx node tools/look.mjs <name>
'[{"at":[x,y,z],"look":[x,y,z],"name":"a"}]' '&query'` (also `{"lm":"birch","d":8}` to frame a
landmark, `{"eval":"js"}` to run code first).

### 10.9 Example
```js
import { GeoBuilder, realMesh, setLight, PRIM, mat } from '../gfx.js';
// A falu-red radhus with white trim, black tile roof, window, lamp by the door.
const g = new GeoBuilder();
g.use('concrete').boxB(0x8a8884, x, 0.15, z, 9.2, 0.4, 7.2);            // plinth
g.use('wood').boxB(0x7e2a20, x, 0.55, z, 9, 2.7, 7);                    // walls
g.use('painted').boxB(0xebe7de, x + 1, 1.2, z - 3.53, 1.3, 1.4, 0.08);  // window frame
g.use('glass').boxB(null, x + 1, 1.28, z - 3.56, 1.12, 1.24, 0.06);     // pane
g.use('tile').add(PRIM.prism(), 0x2a2a2d, mat(x, 3.25, z, 0, 0, 0, 9.8, 2.6, 7.8)); // roof
g.use('painted', { snow: 0 }).boxB(0xebe7de, x - 2, 0.55, z - 4.2, 1.6, 0.12, 1.2); // porch floor under a roof
g.use('light').box(0xffd9a8, x - 2.9, 2.3, z - 3.6, 0.18, 0.25, 0.12);  // lamp, always on
scene.add(realMesh(g.build()));

// A car body whose brake lights switch: body + separately switchable light mesh.
const body = realMesh(bodyGeo, { snow: false });
const brake = realMesh(brakeGeo, { snow: false, cast: false, unique: ['light'] });
setLight(brake, braking ? 5 : 0.6);
```

### 10.10 Look notes for content (from the phase-1 art review)
- Old cartoon leftovers to delete when you rebuild things: chalky white wheel rims, dark-tinted
  window glass colours (pass `null`), perfectly smooth sphere hills. (The half-height white 'glint'
  bar in the old `window_()` is now a full-height centre post; don't add glint boxes anywhere.)
- The outskirts hills are the horizon now (the sky photo's ground is faded out near the horizon).
  Build them in `'hillside'` (forest stands and bare patches come for free) and still add instanced
  spruce silhouettes, a fence line or a barn on the near ones.
- Spruces: stacked cones in `'spruce'` (the shader adds branch whorls and snow bands on them); more,
  narrower tiers read better than a few fat ones. Hedges: boxes (not spheres) in `'hedge'`.
- Car bodies: the paint's fake curvature assumes the mesh origin is the car's centre on the ground;
  real bevels/curved panels from carmodels.js will still read better.
- Big flat surfaces need something on them: kerbs, snow banks along streets (`'snow'` boxes,
  ~0.4-0.6 m), tyre tracks, a few bins/posts. Asphalt does its own wheel tracks and cracks.

## 11. Files, phases, ownership

| phase | owner | files |
|---|---|---|
| 1 rendering | A | `src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`, `assets/` |
| 2 world | B | `src/world/*` (may split `town.js` into several files) |
| 2 cars | C | `src/actors/car.js`, `src/actors/carmodels.js`, `src/actors/trailer.js`, `src/actors/drivers.js`, `tools/cars.html` |
| 2 people | D | `src/actors/models.js`, `src/actors/character.js`, `tools/people.html` |
| 2 UI & sound | F | `src/game/hud.js`, `style.css`, `index.html`, `src/audio.js` |
| 3 systems | E1 | `src/main.js`, `src/input.js`, `src/game/patrol.js` (new; `shame.js` removed), `src/game/interruptions.js`, `src/game/stages.js` (shared stage kinds, see `notes/integration.md`), `src/actors/pickups.js`, `src/actors/peds.js`, `src/game/camera.js`, `tools/shot.mjs`, `tools/scenarios/gameplay.mjs` |
| 3 story | E2 | `src/game/missions.js`, `tools/shot.mjs` (story), README.md, CLAUDE.md |

Phase-2 agents work in **private copies** of the game folder (so everyone's tests boot), may
make throwaway edits to files they don't own *in their copy only* to get it running, and copy
back **only their owned files** when done.

## 12. Testing

- Never open a window. Verify with `node tools/shot.mjs <scenario>` (headless Chrome, real GPU,
  PNGs in `out/`) — **always set a private `PORT=88xx`** so parallel runs don't collide.
- Look at the screenshots yourself (Read the PNG). Judge them against §2.
- `?test=1` skips the title, no pointer lock, dialogue auto-advances; `window.__game`, `__lm`,
  `__props`, `__stats()` are exposed.
- The `story` scenario must play all seven missions and end with `#7 idle` and `no errors`.
