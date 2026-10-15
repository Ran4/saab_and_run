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
  **Pursuit:** HUD shows `SMITARE` with an "Ork" bar (100). Ramming them (impact > 3)
  takes `impact × 4`; staying within 12 m drains 6/s (Ove reads the plate). At 0: they pull over
  with hazard lights, banner **TAGEN!**, auto-anmäld: +12 Ordning, +50 kr (day 6's Škoda, stopped,
  gets the same TAGEN! stamp). If they get more than 110 m away for 5 s: **SMET!**, −8 Ordning. One
  pursuit at a time.
- Ove's notebook and the pause log share one wording per violation (patrol.js `KINDS`: the tag / log
  form and the notebook sentence, e.g. "Gästplats > 24 tim" / "Gästparkering över 24 timmar"; hud.js
  reads them as `hud.kinds`).

### 4.2 Ordning meter (top right; replaces the Shame meter)
`ORDNING I OMRÅDET`, 0–100, starts at 50. Drains 0.014/s per active unreported violation; one
more than 150 m from Ove counts a quarter; ×0.4 while an avbrott or call is active; ×0.5 for 60 s after
KAOS (0.08 was tried first: it emptied the meter in 78 s whatever Ove did; 0.022 with far ones at half
kept a normal player at 6-55. About one report a minute holds the meter now, two a minute fill it).
+7 per report, +12 per caught smitare, +10 per completed avbrott, −10 per failed avbrott,
−12 per pedestrian hit, −3 when Ove's car shoves a neighbour or child aside, −2…−4 per broken prop, −1/s while Ove himself drives a car inside the
car-free zone (Anders shouts "Ove! Det är förbjudet att köra bil inom området!" — once per
minute — and as long as Ove's car is in there the prompt line says so: "Bilfritt område · −1
Ordning/s · Kliv ur och gå"). At 0: **KAOS I OMRÅDET** — Anders calls an extra föreningsmöte, −50 kr
(amounts under 5 kr are not shown), meter resets to 35. Reaching 100: **ORDNING OCH REDA**, +100 kr
(once per free-roam stretch; saved, so a reload with a full meter doesn't pay it again). While a story
mission runs the meter stops at 1 (KAOS would only wait for the outro), and both events wait 12 s
after a mission has ended (KAOS used to land on top of a day's last line and "Dagen är slut").

### 4.3 Avbrott — neighbours interrupt (`src/game/interruptions.js`)
In free roam (not during story missions, which script their own), a neighbour calls every
70–110 s (the first one ~90 s into a new game, ~45 s into a continued one; never while a story
mission runs, never within
40 s after one, and never as Ove walks up to the neighbour whose day it is: within 14 m of the
giver it waits; a call cut off because a mission began is tried again 45 s or more later). Pausing
stops the bell (it rings on after the menu while nobody has answered). Phone rings (`audio.ring`), `hud.incomingCall`
card with portrait ("Parvaneh ringer…"), two short lines as radio toasts, Ove answers grumpily
("Ja?" / "Vad är det nu då?"). If Ove was writing a report, **the call cancels it** (that's the
joke). Then a short errand with a patience timer (90–150 s) shown with `hud.setErrand`.
Complete: +10 Ordning, +30–60 kr, a reluctant Ove line ("Hmpf."). Time out: the neighbour is
disappointed, −10 Ordning. An answered errand that a story day takes Ove off ends without blame, and
once the day's intro is over its neighbour says on the radio that it's fine (template `busy`: "Du är
upptagen? Okej, jag ringer Jimmy."). Some only ring once the story allows (`after`: that many days
done): the new neighbours phone Ove once they have met him. Errand templates (built from the same
stage kinds as missions):
1. Anita: det klickar i elementet igen → hold E at `runeHouse` 3 s ("Lufta elementet"). After day 3
   (`after: 3`): until then Ove's elementnyckel is in Rune's Volvo.
2. Parvaneh: hämta Nasanin på förskolan → pickup at `preschool` → drop at `parvanehHouse`. After
   day 1.
3. Jimmy: glömt mobilen i centrum → fetch item at `centrum` → bring to `jimmyHouse`.
4. Adrian: punktering → hold E at `bikeShed` 4 s ("Laga punkteringen").
5. Patrick: låst sig ute → fetch spare key at `oveHouse` → hold E at `parvanehHouse` 1.5 s. After
   day 1.
6. Anita: Rune har rullat iväg → find Rune (45–80 m away on a sidewalk), push him home (E takes
   hold of the wheelchair and lets go of it: let go of in a stride, or kicked, it rolls on). No
   patience timer: Rune's cold instead (5 minutes from the call, much quicker out past the forest),
   and he can die (a car at speed, the cold): the errand fails with E (try again) or Q (give up:
   he stays dead for the rest of the game, Anita grieves, days 3, 6 and 7 go on without him).
   game/rune.js; features/implemented/roligare_runeuppdrag.md.
   Errands 1 and 7 need Rune too (they are not offered once he is dead).
7. Anita: skotta framför dörren → hold E at three spots by `runeHouse`.
8. Sara: Oves katt har rymt ("Det är inte min katt.") → short cat chase, carry it to Sara. Only once
   the cat lives at Ove's (after day 4: template `after: 4`); the cat by his door is gone meanwhile.
9. Jimmy: skjuts till jobbet → pickup Jimmy at the Solrosvägen bus stop → drive him to `centrum`
   (he must arrive in the car: dropoff option `needCar`).

### 4.4 On foot
Walk 3.2 m/s (a determined power walk), Shift 5.5 m/s (an older man running hard), one small jump
(no double jump, no stomp): a grown man's, with a wind-up (half a second standing: he sinks, gathers
himself and pushes off from his toes; shorter on the move), a grunt as he pushes off (one of four in
his own voice, in turn: assets/sfx), ~0.56 s in the air for 0.55 m, and a landing his knees take (an
'uff', his own too, a moment before he is up to speed again). A press is never lost: a tap is a jump,
one he can't act on yet is kept 0.25 s; see notes/people.md, *Gait*. People walking
with Ove (errands) follow his trail (a point every 0.6 m) round fences and hedges, and are still
"with him" until they have been more than 20 m behind for 2 s (beyond 35 m they give up). Children
(cast and pedestrians) and the neighbours are never knocked over by cars; they are shoved aside,
like Rune (but on his errand that kills him). A knock-down depends only on the car's own speed into the person (> 4.5 m/s), so
walking into a parked car just stops Ove. Pushing Rune: 3.0 m/s (3.6 with Shift). **J/click:
"sparka på däcket"** — kicking a car's tyre plays a thunk, rocks the car (a parked car asleep is
woken) and an Ove comment by make ("Bra däck." / "Plast och elektronik." / "Sommardäck. I november."); kicking props still breaks them (−Ordning; one kick breaks the nearest prop only). E: talk / get in & out / hold to
interact / Ove's garage door. F: hold to write a report.

**Ove's garage door** (`src/world/garagedoor.js`, driven by main.js `useGarage`): a steel
up-and-over door (vipport) that E opens or shuts from outside or inside, facing it within 1.5 m.
Ove takes the handle and lifts (the springs take it the rest of the way, ~1.5 s), stepping back
from the bottom's ~0.3 m swing; or reaches up for the open door's edge (2.02 m), pulls it down,
steps back as it falls shut (~1.15 s, a clang) and - from outside - tugs the handle three times.
While his hands are on it he can't walk off; then a step, jump, kick or E of his own ends it. Not
with a car in the doorway or within 0.45 m of it ("Saaben står i vägen.") or, to shut it, somebody
under it. A collider fills the doorway while it is shut, closing or < 85 % open: Ove and the Saab
stay out (or in), and no "Kliv in" reaches a car through it; a car driven into it booms and rattles
it ("Porten!"). In a car in front of the shut door: "Garageporten är stängd · kliv ur (E) och öppna
den". Open at the start; saved (`garage`: 0 = shut).

### 4.5 Money & collectibles
`kr` (kronor) replaces coins: pantburkar (cans) lying around (1 kr), rewards. 7 Saab-emblem and
7 Sonjas fotografier (each found plays a short memory toast, e.g. "Sonja, 1984. Tåget till
Göteborg. Hon skrattade åt honom hela vägen."). All reachable without double jumps.
**Samlingen** (pause menu, features/implemented/se_pa_trinkets.md): a dark photo-album page in the
notebook's place with all fourteen (found ones shown, the rest empty frames with a hint where they
might be), each photograph a picture of its own (the one in the world is the same print: game/
collection.js), its memory and where it was found, and the counts (found of 14, pantburkar ever,
the longest jump). An emblem's note goes with the order found (the seventh closes the collection), a
photograph's with its picture.

### 4.6 Controls
| key | till fots | i bil |
|---|---|---|
| WASD / pilar | gå | köra / styra |
| Mus | titta | titta |
| Shift | spring | |
| Space | hoppa | handbroms (sladd; + gas + ratt: snurra på stället) |
| E | prata, kliva in, garageporten, interagera (håll) | kliva ur |
| F | anteckna felparkering (håll) | anteckna felparkering (håll) |
| J / klick | sparka (däck) | |
| T / H (pad L3 / RB) | | tuta (4.7) |
| B | | titta bakåt |
| M / N / R | karta / ljud / tillbaka till vägen | |
| Esc / P (gamepad Start) | paus och fortsätt (pausmenyn släpper musen) | |
| Q (gamepad B) | ge upp efter ett misslyckat uppdrag; håll Q för att avbryta ett pågående | |

The title starts with Spela / Fortsätt, Enter, Space or E, or the pad's A, Y or Start (never with a
click on the scene; not while Kontroller or the "Nytt spel" confirm is open); Tab walks its buttons.
A hidden tab or a window that loses focus pauses the game too; a hidden tab's sound is suspended.
Below 30 fps the whole game slows down with the fixed steps (at most two a frame): timers, the clock
and the meter never run ahead of the cars and people they time.
Gamepad: the first connected pad with the standard mapping (else a non-standard one once a button
on it has been pressed), missing axes and buttons read 0; the triggers are the pedals, and a pad whose triggers have never moved drives with the left
stick (forward gas, back brake).

### 4.7 The horn (`src/game/horn.js`, feature tuta_med_bilen)
T or H (a pad's L3 or RB), in whatever car Ove drives; every make has its own horn (`audio.HORNS`:
the Saab's 405/498 Hz, a Golf's peep, the bus's air horn). It changes the world, not only the sound:
- **People in front of the car** (a cone from the bumper, 16-34 m by speed, 25 % further on a long
  honk) get a fright: hands thrown up (`anim.fright`), a yelp (`audio.yelp`), and a leap sideways off
  the car's line (old people and Parvaneh, who is pregnant, hurry aside without leaping); then they
  turn to face the car with a line, some shaking a fist (`anim.fist`). Children leap too and cheer
  ("Igen!"). Pedestrians go back to their pavement afterwards (`Ped.rehome`).
- **People close by** (15 m, 24 m on a long honk) flinch, look round and have an opinion. The
  neighbours answer in character: Patrick leaps out of the way even when he isn't in it, the girls
  cheer, Jimmy and Adrian wave, Anders and Parvaneh shake a fist, and Rune knows the car by its horn
  ("...Saab.", "...Volvo.", "...BMW."), which Anita explains. Nobody walking with Ove reacts, nor
  someone a pickup has waiting for his car: a honk from it, stopped within 25 m, brings them out to
  it ("Jag kommer!").
- **Drivers** honk back with their own horn (by temperament: BMW 90 %, Volvo 240 35 %) and a word
  over their car; the one ahead going the same way speeds up (`AIDriver.hurryT`: cruise × 1.35 for
  3 s); one that sat honking behind Ove leans on its horn ("Flytta på dig då!"). Another Saab, when
  Ove drives one, greets with two toots ("Saab-folk. Vi hälsar.").
- **Smitare**: one still in its felparkerad car is spooked and flees (the chase starts; not while a
  story day runs); one being chased swerves for a moment and loses 5 motstånd a toot (3/s held).
- **Ove** has opinions (at most every 8 s), by what he honked at; his passengers have theirs.
- **Needless honking** (nobody in front, no car ahead, no smitare; holding it counts too) adds up:
  past 5 it is "Onödig tutning" (−2 Ordning, at most every 30 s) and Anders shouts the law from his
  house, or someone from a window ("Tyst därute!"); Ove: "Det var fara." A long honk (2.2 s) among
  houses gets a window shout by itself.
- **Shave-and-a-haircut** (five short taps, the middle two gaps quicker) is answered by the nearest
  driver's two toots, and costs nothing. **The cat** by Ove's door (after day 4) jumps and hisses;
  Ove apologises to it.
None of it while a scene plays (`inDialog`). Reactions are timed in game time (nothing happens behind
the pause menu).

### 4.8 The cold beyond the town (`src/game/cold.js`, `src/game/waking.js`, feature avgrunden)
No invisible walls: Ove (on foot or in his car) can leave the town, through the forest belt (four
forest tracks, `layout.TRACKS`, carry streets out as snowy gaps) and onto the hills, where there is
nothing but nature (spruces in stands, boulders, snow). Everyone else still stops at `BOUND`, where
the walls stood (main.js `keepCarsInside` / `keepPeopleInside`): the traffic, chases, the race,
pedestrians, neighbours walking with Ove. From `COLD` = BOUND + 30 (square distance) a cold meter
(HUD, under the Ordning meter: a bar, the cold he feels in °C, a line: Kallt / Ove fryser / Ove
känner inte tårna / Vänd om, Ove; thawing: Det tinar) rises: 112.5 s from nothing to dead right at
the edge, the rate × (1 + d/70)² for d m further out (70 m: 28 s, 140 m: 12.5 s; avgrunden2 made it
2.5 times slower than the first 45 s); inside it thaws in 24 s (12 s in a car: the heater). At 45 %
Ove thinks of Sonja (a toast: she would have told him to turn), before half: the way straight back
costs as much cold as the way out. It holds while Ove isn't his own (a scene, a cut, a failure).
Shown and heard: frost creeping in from the picture's edges, Ove's breath, hands in his pockets and
a shiver (`anim.shiver`), chattering teeth, his heart at the end, the wind; out there a blizzard
(snow on the wind, the haze thicker and whiter, the sky white, the sun dimmed) - the town behind him
goes white, then everything does. At 100 %: he stiffens where he stands and topples over sideways
like a plank (at the wheel the engine dies and the car rolls to a stop), the camera rises over him,
"Ove dog av frost" (and a dry line under it), black. Then he wakes with a gasp in his own bed beside
Sonja's made-up, empty half, says one of five lines (script.js `WAKE`, voiced; never the same twice
running) and is let out on the walkway at his door. Fair and unbroken: a running mission has failed
("Ove frös ihjäl."; the banner, with E / Q, after he wakes), an errand or a call is dropped without
blame, a smitare chase dropped, companions and the cat he carried go home; a named car (the Saab, a
neighbour's, its trailer too) is back at home, a borrowed one stays out there (the traffic takes it
later); no kronor, no Ordning, the clock and the day unchanged. The skip keys go to the black from
the banner on, and through the bedroom.

### 4.9 The hoppbacke (`src/world/snowhill.js`, `src/game/hoppbacke.js`, feature snöhög)
The park's big pile of snow (west of Ove's area, across Parkvägen) is a jump: a 28.6 m long, 3.4 m
high plowed pile shaped as a two-way tabletop (a face at each end that steepens to 24° and kicks a car
off at its edge, a flat 7 m table between them, the far face the landing: 24° easing to 16°, then the
runout; steep lumpy flanks), along a 62 m lane of open lawn. Any car can drive up it and fly (a
trailer too), and Ove can walk all over it. The flight is the car's own physics (car.js `HOPP`: gentler
gravity in the air than off a ledge); up to ~11 m/s at the edge a car lands on the table and rolls off
the far edge, 12-14 m/s on the far face, faster ones overshoot to the flat with a hard thump (damage
only past ~20 m/s). What the town makes of it: snow powder off the edge and round the wheels at the
landing, a whumpf, the wind, the landing by how hard it was (the springs bottoming out, a clatter, a
bang), a trailer bouncing after with a clank; the camera opens up and rises after the car slowly. A
real jump (0.55 s in the air) Ove writes down (a toast in his hand: air time and length, the longest
his record, saved); after a big one (0.85 s) he says what he thinks (in his own Saab, landed well:
"Saab byggde flygplan först. Det märks."; in a car that isn't his: "Det är inte min bil."; else his
SLID / TYRE lines), a passenger says theirs, people within 38 m react as to a honk (children cheer,
pensioners shake their fists; lines they already say), and a neighbour within 60 m has an opinion
(Anders: "Jag tar upp det på årsmötet, Ove!", Patrick: "Wow. Det ser ut som i reklamen.", Anita:
"Hej, Ove."). It costs no Ordning. A sign at its foot: "Pulkaåkning sker på egen risk" / "Motortrafik
förbjuden".

### 4.10 Tracks in the snow (`src/game/tracks.js`, feature snöspår)
Whoever walks on snow leaves footprints, whatever rolls on it leaves ruts: Ove and the people near
the camera (70 m), every car near it (100 m) and the one Ove drives, a trailer, Rune's wheelchair (its
big wheels and its casters), the snow tractor (big chevron lugs). Snow is what `surfaceAt` calls snow
(lawns, the park, the snow hills, the fields and beyond the town), not ice; nothing on
asphalt, paving or gravel, on a bench or a car roof, nor in the air. A print per step, where the foot
stands as it is planted (the foot bone early in its stance), both feet on a landing; its size
and sole from the person's shoes (winter boots: lugs; sneakers: waves; shoes: a separate heel), ~4 cm
deep for an adult, shallower for a child, deeper running. A rut per wheel, the width of its tyre, ~5.5
cm deep, a segment every 0.45 m with mitred joints, the last one stretched to the wheel each frame; a
tyre sliding sideways smears a wider band (the old pale skid decal is no longer drawn on snow). They
stay until a new day dawns (`missions.updateGate` calls `game.tracks.clear()`), or until the ring they
are in comes round: Ove's prints and his car's ruts (~560 m walking, ~500 m driving on snow) apart
from everybody else's, the oldest fading out first. Not saved. Out in the cold's blizzard new ones
fill in with blown snow (`fx.blowAmount`: ~40 s at its height). API: `tracks.init(scene)`,
`tracks.update(game, dt)` (main.js, after `syncAll`), `tracks.clear()`, `tracks.on` (`&notracks`: none
made, the skid decal on snow back), for tests `tracks.stats()`, `feetList(ring)`, `rutList(ring)`,
`meshes()`, `debugFill(x, z, r)`; `window.__tracks`. Rendering: 10.5.

## 5. Story — seven days (`src/game/missions.js`)

Each day: a giver NPC at a landmark (amber marker over the head, E to talk), intro dialogue in the
letterbox, a banner (`Dag N · Veckodag`, the mission's name), stages, `UPPDRAG KLART` + reward in
kr, the outro, then free roam. For the intro Ove steps to a free spot ~2 m in front of the giver
(along the way their door faces, same level, nothing between them; he stays put if he already
stands so), a running smitare chase ends quietly (no SMET!) and small-talk bubbles are cleared.
The outro is staged: Ove stands at the day's `outroAt` (his garage door on day 1, the walkway in
front of Rune and Anita's door on day 3 (never on Rune's ramp), a step out from his own door on
day 4, Bilhallen's forecourt on day 5) and **every** other speaker is brought within 4 m of him, in
plain view (nothing taller than 0.6 m between them, never on a ramp); in intros and outros the
camera turns to whoever talks (a cut), and a line can carry its own camera beat ("Adrian. Den
där." frames the Saab for sale; the finale has its own shots). **Dialogue shots** (`cam.frame`,
camera.js) are judged by what the lens would see: both speakers' heads in the picture between
the letterbox bars and unblocked (walls, sheds, props over 0.5 m, tree trunks and crowns, the
world's camBlocks (railings, lamp posts, overhangs), parked cars, other people), nothing within
1.5 m of the lens and as little as possible within 3 m, no pole in the middle of the picture,
never closer than the distance at which the two fit; two-shots from both sides and up to ~70°
round, at eye height and a little above, then over-the-shoulder shots as the fallback. A scene
opens on the two-shot; when the speaker changes it cuts to a closer **single** of whoever speaks
(`cam.single`: from past the listener's shoulder, 14-22° off the line between them, a 36° lens,
the listener's back at the side of the picture and never nearer the lens than 1.9 m, on the side of
the line the camera is already on), every fourth cut the two-shot again; a single that can't be
had cleanly falls back to the two-shot (an NPC speaking) or keeps the shot (Ove).
`UPPDRAG KLART` is shown over a held shot of what was just done (`cam.showcase`: the Saab in its
garage, Ove at a door; the chase camera only when the car is still moving fast), nobody moving.
World tags, the beacon and the arrow are hidden while the letterbox is up; the `UPPDRAG KLART`
banner is gone before the first outro line. **Time of day** (late November: light from about nine
to three): a day starts at **10:30** and days 1-6 end at **14:30** ("Dagen är slut"); the clock
is saved (and so is a pending gate). The next day dawns after **three more reports (not before
60 s) or 90 s of free roam**, counting only time with no errand, call, chase or dialogue on (a day
never dawns in the middle of an errand): a `Dag N` / "Tisdagsmorgon" banner, the clock jumps to
10:30, everyone goes where they spend the day (whoever is away that day is gone at once, not left
standing at their door), the Saab is back at home unless Ove is in or near it, and no neighbour
phones for 75 s (the giver comes first); `?test` skips the wait unless `&gate`. After an outro the
camera is behind Ove (the cast in front of him) and the people in the scene leave him alone for a
while (no small talk for 25 s, nobody for 10 s); a smitare chase still going ends quietly when a
mission completes or fails, as at an intro. North on the minimap and the big map is **+z** (the low sun then stands in
the south-west, as it does in the early afternoon).
Fail: `UPPDRAG MISSLYCKADES` (it waits for the player: no time-out), E retries from the start of
the day (or from `def.retry.from`: day 5 restarts on the race grid with Adrian aboard; or from the
last of `def.retryAt` at or before the failed stage: a Saab wrecked late on day 1 doesn't mean
backing the trailer in again), Q (gamepad B) gives up (the giver waits, `def.waitToast` says how:
"Barnet väntar inte, Ove."; taking the day up again plays the two-line `retryIntro`, and a day
with `def.retry` goes straight to that stage: the race grid). A stage whose named car is wrecked
(`getInCar`, `parkIn`: Patrick's car with the trailer, the Saab) fails with "Bilen är kvaddad.", and
the retry brings a new one. A **running** day can be given up too: hold **Q** (the key, not pad B,
which is also the report button) for 1 s, or the pause menu's "Avbryt dagens uppdrag"; a dimmed
"Q (håll) Ge upp" joins the prompt line once a stage has gone on for a minute, and holding Q shows
its fill. Not during a scene (`missions.canGiveUp`). Whoever rode with Ove when it failed or was
given up goes home (a taxi), nobody is left on the street. Titles are "Dag 1 – Släpkärran" etc.
During a mission the avbrott scheduler pauses; missions phone in their own calls
(`interrupts.radioOnly`, e.g. "INTE NU!"; radio lines and calls take turns, and a call still going
when Ove arrives is cut off: `interrupts.hangUp`) and shouts. Mission defs may list `extra` (more
neighbours in the scene), `away` (neighbours who are elsewhere that day: hidden at home) and
`elsewhere` (where someone spends the day instead: the girls at Jimmy's on day 2).
Stage kinds (`src/game/stages.js`): `getInCar`, `goto` (+ `calls`, `radio`, `with`, `via` (guide
points: the Akut driveway), timer, and a `chaser`: a car hunting Ove like the Hit & Run cops; it
can wait parked first; its cruise has a rubber band (×1.3 beyond 80 m); contact for ~1.2 s within
6.5 m = **STOPPAD**, the car held 2.5 s and −20 kr, the chaser backs off a few seconds (3 s longer
after each stop; after three stops in one drive he gives up: "Jag skickar ett brev, Ove!
Rekommenderat!"); `catchFails`
/ the def's `bustFails` turn contact into a fail instead), `pickup` (+ `walk`: they walk there),
`dropoff` (+ `walk`), `escort`, `fetch`, `holdAt` (+ `cut`: one press of E, the job happens off
screen; + `ready(g)`: a text while the job can't be done yet, shown as the objective with E left
free - day 3's "Öppna garageporten"), `catchCat` (patience: it bolts from a stride or a close approach and outruns Ove, sits
again, and comes to a man who stands still), `parkIn` (box, heading tolerance, optional trailer and
reverse-only, on-screen guidance in the objective line, `clear` tows away felparkeringar in the
way), `report` (forced spawns near a landmark, smitare off), `race` (a cut to the grid, Ove in the
right-hand lane, countdown, opponent in a named car, rubber band on its cruise), `destroy`
(re-themed: stop a fleeing car by ramming it (≤ 30 Ork a hit) and staying on its bumper; an "Ork"
bar; it pulls over; it can wait parked first (`at`, `wait`, `wake`: it sets off when Ove's car comes
close), it only gets away (`escape` m for 6 s) after Ove has been within 60 m of it once and after a
`grace` period, and it eases off (×0.85) while Ove is far behind), `grab` (pick something up by the stopped car), `talk` (a mid-mission
conversation), `cut` (to black and back: a time skip, the clock), `wait`.

1. **Släpkärran** (Måndag, 100 kr) — giver `patrick` at `parvanehHouse` (Parvaneh beside him). The
   new neighbours have been backing car + trailer for twenty minutes and flattened Ove's mailbox.
   Get in `patrickCar` → drive past and **back car + trailer into `parvanehDrive`** (reverse-only,
   trailer in the box; Patrick shouts useless advice) → report 3 felparkeringar at the guest
   parking (tutorial: no smitare) → get in the `saab` (put back at the garages first if Ove left it
   far off in free roam and it can't be seen; else "Hämta Saaben") → park it nose first in
   `oveGarageSpot` (its door must be open: shut, the car hint says so). Driving forward through
   the trailer box on the way past it is never scolded, however slowly; only stopping in it nose
   first is ("Backa in!").
   Outro at Ove's garage door: Parvaneh brings saffransris; Ove pretends not to want it.
2. **Sjukhuset** (Tisdag, 150 kr) — giver `parvaneh`; Patrick fell off the ladder putting up an
   advent star and went in the ambulance (`away`), the girls are at Jimmy's (`elsewhere`), and
   Parvaneh has no driving licence. Get in the `saab` while she walks to the residents' lot (Ove
   won't drive into the area) → pick her up where they meet (by the lot entrance) → timed drive to
   the hospital with her riding along (she talks; Jimmy phones about ice cream for lunch), the
   guide leading through the Akut driveway → drop her at the canopy (`hospitalDrop`; she walks in)
   → park in `hospitalSpot`. Outro: "Jag betalar inte för att stå still!" — and she decides he will
   teach her to drive. **From now on Patrick wears a cast.**
3. **Elementet** (Onsdag, 150 kr) — giver `anita` at `runeHouse`. The elementnyckel's hook in
   `oveGarage` is empty (a shut garage door is opened first; hold E: "Tom krok. Rune lånade
   elementnyckeln 1998.") → it isn't in Rune's Volvo in the garage row either (`runeVolvo`, hold
   E at its door: a note in the glove box,
   "utlånad till Anders, 2015") → fetch it at Anders' door across the area ("Jaså, den. Den låg i
   Audin."; brass, Ove's since 1991, Rune's since 1998, Anders' since 2015) → Anita
   phones: two cars block the soprum → report 2 at
   `garbageRoom` → at `runeHouse` "Gå in och lufta elementen": one press of E and Ove is inside
   their kitchen (a ~14 s cutscene, skippable; feature luftning_borde_vara_en_scen,
   `game/luftning.js` on a set built inside their real house, `world/interior.js`): three knocks
   (hollow), an ear to the radiator (it gurgles), the brass key and Anita's good cup under the
   valve, a hiss that goes on and on (Ove looks into the camera; Rune nods off), a few drops of
   rust-brown water, one more knock (a dull thud: full), "Mm.", Rune wakes with a snort; on the
   sill outside a striped cat looks in (tomorrow's), eye to eye, "Hmpf." Black: "Sex element till.
   Ett i taget." Outro: Rune, lucid for a second: "...Saab." — "Ja, Rune. Saab."
4. **Katten** (Torsdag, 150 kr) — giver `jimmy` at `jimmyHouse`. The stray sits in the snow by the
   `bikeShed` (somewhere open) → `catchCat` (110 s): running after it never works; Jimmy first says
   "Spring efter den!", then "Nej, vänta! Stå still!"; standing still, the cat comes to Ove ("Kiss,
   kiss... Hmpf.") → carry it home to `oveHouse`, "in i värmen". Outro just outside his door: "Den får stanna.
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
   took his papers; he sits in his white Škoda by the lot entrance. The Saab stands along the aisle
   facing the entrance that morning. Get in the `saab` (Anita phones 8 s later) → `destroy`: the
   Škoda waits on the west street by the entrance until Ove's car comes within 30 m, then flees
   (cruise 19, ×0.85 while Ove is over 80 m behind; it gets away only beyond 250 m, after he has
   been on it, never in the first 20 s); rams take at most 30 Ork each, staying on its bumper drains
   8/s; he pulls over: **TAGEN!** → `talk`: he steps out and Ove steps up in front of him, on his
   side of the cars, before the scene is framed ("Det
   här är inte över, Ove. Vi har papper på allt." — "Det har jag också.") → `grab` the folder →
   bring it to `runeHouse`. Outro: a signature is missing; Rune stays.
7. **Värkarna** (Söndag, 500 kr, light snowfall) — giver `patrick` (arm in a cast) at
   `parvanehHouse`: Parvaneh's waters broke, and Vita skjortan's Škoda has waited by the entrance
   all morning (parked on the west street from the start of the day). Get in the `saab` while she
   walks to the lot → pick her up → timed drive to the hospital: the Škoda sets off after Ove
   (`chaser`, STOPPAD on contact) while every neighbour phones (Anita, Sara: "...Ja. Men INTE NU!",
   Jimmy, Adrian, Anders) → drop her off: "Gå nu, Ove. Det är söndag. Hälsa Sonja från mig." → cut:
   **Senare samma dag**, 15:40: the sun is down and it snows properly, an overcast blue hour
   (`dusk()`: the sun at 6 % and cooler, no hard shadows; the sky light ×0.9, the exposure ×1.15 so
   the snow stays a bright blue-grey, the haze ×2.5 and greyer, the sky dome dimmer), the Saab in
   the hospital car park → on the way to the cemetery the phone rings again, as in the morning, but
   now Ove answers: Patrick (a boy, he fainted, only a little), Anita (Rune said Ove's name today),
   Adrian (no rust, and he haggled) - no call once he is nearly there → buy flowers at the
   `flowerShop` kiosk → at `sonjaGrave` one press of
   E "Lägg blommorna på Sonjas grav": Ove goes down on one knee (`st.kneel`) and lays them on the
   spruce twigs in front of the stone (they stay). Outro: Ove alone on one knee, telling Sonja about
   the week, in the finale's own shots: over his shoulder to the stone (the gilded SONJA, the
   flowers, the lantern), the reverse from beside the stone, back to the stone. Final banner
   **OMRÅDET ÄR I ORDNING** over a wide shot of the grave in the snow (the Ordning meter is lifted to
   at least 90 to match); then Ove gets up and free roam (patrol, avbrott) goes on; the snowfall and
   the dusk end 40 s later.

## 6. World contract (`src/world/*`)

Grid engine unchanged: `layout.js` 7×7 blocks, pitch 80 m, roads between all blocks, right-hand
traffic. `MAP` gets new block types. Ove's radhusområde (block type `ove`) is the heart of the
map, near the centre. Required block types: `ove` (car-free interior with walkways wide enough
for a car + trailer, garage row, parking lot with guest parking and a handicap bay, soprum /
återvinning, cykelförråd, ~5 rows of radhus; Ove's, Parvaneh & Patrick's, Rune & Anita's,
Jimmy's and Anders' houses are all here), `radhus` (other row-house areas), `villa`,
`apartments`, `centrum`, `hospital`, `church`, `cemetery`, `dealer` (bilhandlare), `preschool`,
`kommun`, `gas`, `park`, `field`, `forest` (edges).

Beyond the grid (`outskirts.js`, feature avgrunden): the forest belt (every trunk solid), four forest
tracks out of it (`layout.TRACKS`, `onTrack`), the hills as ground (`layout.terrain.at` is the hills'
mesh, triangle by triangle; `baseGround` = max(CURB, it) beyond 330 m), spruces in stands and boulders
on the near hills (to ~760 m: instanced, a silhouette LOD and no AO / shadows while the camera is in
the town, `tickWild`), silhouettes beyond. No buildings out there. Nothing is spawned or placed
beyond `BOUND` (HALF + 34); `COLD` = BOUND + 30, `edgeDist(x, z)` = max(|x|, |z|).

Snow hills to drive and walk on (feature snöhög) are `HILL` floors (collision.js `hill(x, z, r, top,
at)`: `at(x, z)` the top there): never a wall, always a floor whatever the step (`groundAt`), and the
mesh is built from the same function (snowhill.js: `jumpHill` for the park's hoppbacke, `domeHill` for
`places.js mound`'s round sledding mounds, which were stepped circle floors).

`town.js` must export (in addition to the existing `parkedCars`, `pedLoops`, `animated`,
`lamps`, `bouncers`, and `doors`: the doors that move, Ove's garage door `name: 'oveGarage'`,
a `GarageDoor` from `garagedoor.js` whose mesh town.js adds after the static world):

- **landmarks** (via `f.mark`; `{x, z, yaw}` — for people, `yaw` is the direction someone
  standing there faces). Spots must be free ground-level positions, never inside a footprint:
  `oveHouse` (player start, at Ove's front door), `oveGarage` (in front of Ove's garage door),
  `parvanehHouse`, `runeHouse`, `jimmyHouse`, `andersHouse`, `adrianSpot`, `bikeShed`,
  `garbageRoom`, `parking`, `guestParking`, `hospital` (entrance), `preschool`, `centrum`,
  `dealer`, `church`, `cemetery` (gate), `sonjaGrave` (standing spot in front of the stone,
  facing it), `kommun`, `gas`, `park`, `field`, `busStop`.
- **boxes** (landmarks with `w`, `l`; `yaw` = the heading a car parked correctly has):
  `oveGarageSpot` (inside Ove's garage), `parvanehDrive` (on the walkway in front of their
  house, long enough for car + trailer ≈ 9.5 × 3.2 m), `hospitalSpot` (a bay in the hospital
  car park), `saabSpot` (where the Saab stands at start, outside the garage).
- **parkedCars names:** `saab` (type `saab900`, mid-blue metallic `0x2c5596`, at `saabSpot`), `patrickCar` (type
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
- `collectibleSpots = { emblems: [[x,y,z,where,hint] ×7], photos: [[x,y,z,where,hint] ×7] }` —
  reachable on foot with one small jump (max ledge 0.45 m step + ~0.5 m jump); `where` / `hint` are
  the Swedish place ("På kyrktrappan") and hint ("vid kyrkan") the album shows.
- `litterSpots`: ~120 `[x, y, z]` for pantburkar along sidewalks, the parking lot, the park,
  bus stops.

## 7. Car contract (`src/actors/car.js`, `src/actors/carmodels.js`, `src/actors/trailer.js`)

`CAR_TYPES` keys: `saab900` (Ove's Saab 900 classic hatchback, the hero car), `volvo240`
(boxy saloon/estate), `volvo740`, `audi` (A6-ish saloon, Anders), `bmw` (saloon), `skoda`
(Octavia-ish estate, white for Vita skjortan), `golf` (VW-ish hatch), `kombi` (generic estate),
`taxi`, `van` (delivery van), `bus` (red city bus), `garbage` (sopbil), `tractor` (the housing
association's snow tractor in Ove's lot, drivable: one seat, 40 km/h, plough blade; notes/cars.md). Old keys (`sedan`,
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
- Snow hills (`HILL` floors, feature snöhög): on one the car follows the surface and feels its
  slope, flies off where the surface falls away faster than gravity (`car.flight` while up, then
  `car.landed`; `game.onCarTakeoff` / `onCarFlight`), lands judged by the speed into the slope, the
  nose following the flight path. The trailer has a vertical speed of its own at the axle and pitches
  about the tow ball (`trailer.pitch`), bouncing on a hard landing (`game.onTrailerBounce`).
- Driver visibility: closed cabin, tinted glass; drivers/passengers seated inside are visible
  through it.
- Snow (feature sno_pa_bilar, `src/actors/carsnow.js`): a snowed-in car (`opts.snow`) that is driven
  away sheds its snow - slabs that the car's acceleration, the wind, a jolt or a jump break loose slide
  off and tumble to the road, powder blows off at speed, the wipers clear the windscreen, the paint's
  frost fades - until it is an ordinary clean car (`car.snowy` false). main.js calls
  `tickCarSnow(dt, game)` every frame. Details in notes/cars.md.

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
  `'wall'` (a radiator). Every `holdAt` stage passes its kind. `'door'` (Ove's garage door):
  both hands on `st.reach` = [height above the soles, ahead, to the left] (body space), leaning in
  low and stretching up high; `st.tug` 0..1 pulls back on it.
- `st.cheer` ("yes!"), `st.talk`, blinking (automatic at lod 0), finger/thumb bones and hand shapes
  (grip, fist, pen, phone, board, carry).
- `st.fright` — both hands thrown up in front of the face, palms out, a tremble, the trunk and head
  pulled back (fast on, slow off; it holds through a jump's poses: the horn's leap). `st.fist` — a
  fist raised in front of the shoulder, shaken (the left one for a cast on the right). An arm in a
  cast keeps its sling. The horn (`src/game/horn.js`) sets and clears both, with `st.yell`.
- `buildCharacter(def, { lod, headLod, faceTex })`: the cast is lod 0 with a per-character baked
  face texture; pedestrians lod 1; busts lod 2 body + lod 1 head.
- Seating: a seated character's root goes at `car.seatLocal(side)` + (0, 0.12 − legLen, 0.12)
  inside `car.tilt`; a bust's origin at `car.seatLocal(1)`. Then the hands land on the wheel.
  Seated (`st.seated`), the shins and feet are folded into the knees (bone scale 1e-4), as a bust
  has none: the cars have no footwells, the lower legs stood on the road under them.
- `st.kneel` (+ `st.kneelReach` 0..1) — down on one knee (Sonja's grave): the right knee on the
  ground, the left foot forward, torso upright, head bowed. By itself it goes down holding flowers,
  lays them ~0.42 m ahead of the root (~0.27 m above it) and rests the hands on the knee (~3 s);
  `kneelPoint(model, outVec3)` is the bouquet between the hands. The caller sets and clears it.
- Level of detail: a model's meshes hang under `model.lodNode` (a `THREE.LOD` picked per render
  camera, so `renderPortrait` always gets level 0); `Character` gives the cast a mid level beyond
  6 m and a far level beyond 15 m, pedestrians a far level beyond 40 m, all on the same skeleton
  (`LOD_DIST`), no shadow beyond 60 m. The distances are screen sizes (over the camera's zoom and
  relative to the game's 55-degree lens: a 42-degree dialogue shot keeps its speakers at level 0).
  Level 0 of the cast carries alpha-tested hair and fur cards (one extra skinned mesh, main pass
  only). Nothing to call.
- Animation level of detail (`character.js` `ANIM_LOD`): beyond 30 m visible people are posed every
  2nd frame, off-screen people beyond 12 m (and seated people in cars beyond 30 m) every 4th, with
  the dt accumulated, and their skeleton's matrices are skipped while they stand still. Never Ove,
  never within 12 m of the camera, never on `sync(0)`. A character can opt out with
  `ch.animLod = false`. Nothing to call.

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
  labels (projected with the camera), e.g. violation tags. Identical labels that would overlap on
  screen merge into one ("2 × Bil i bilfritt område"); main.js shows a neighbour's name only within
  5 m, or for the one an E would greet / the day's giver within 12 m.
- `hud.setClock(text)` — in-game time ("06:42").
- `hud.renderLog(entries)` — Ove's notebook page in the pause menu, entries
  `{ plate, kind, text, time }`.
- Minimap marker types in addition to the old ones: `violation`, `smitare`, `errand`,
  `neighbour`, `collectible`.
- Audio, in addition to the existing calls (all keep working): `audio.ring(on)` (old landline
  phone), `audio.pen(on)` (pencil scratching), `audio.stamp()`, `audio.doorbell()`,
  `audio.catMeow()`, `audio.alarm()` (= old `shameBell`), engine re-voiced as a Saab four,
  melancholic synthesized piano/strings music instead of the walking bass; `audio.suspend(on)` (the
  whole context, for a hidden tab), `audio.ringing` / `audio.state` (tests). The horn (feature
  tuta_med_bilen): `audio.horn(on, kind)` and `audio.honk(vol, dur, kind, delay)` take the car's model
  (`HORNS`: a horn per make), `audio.yelp(pitch, k)` (a fright's gasp and 'ah!'), `audio.hiss(k)`.
- Voices and music (feature a_fully_voiced_game, first version 2026-10-11): pre-made ElevenLabs clips
  (`assets/voice/`, made by `tools/voice/voice.mjs` from `src/game/script.js`, which holds every
  line said out loud) played by `src/voice.js` (`voice.play(who, text, { slot, mode, ... })`: two
  slots, a queue, a murmur with a guessed length when there is no clip; contract in its header).
  Every role has a voice since feature resten_av_replikerna (2026-10-11), the children too since
  feature barnroster (2026-10-15): Sara, Nasanin and four kid voices are adult Voice Library voices
  raised by tools/voice/voice.mjs (cast.json `shift: { pitch, formant }`: very squeaky, the length
  kept). Passers-by, drivers and window shouts speak with a pool of sixteen voices (index.json
  `_pool`: women and men, 13-34 / 35-64 / 65+, girls and boys under 13): `voice.voiceFor(ch)` gives
  a neighbour their own key, a person (or a car's seated bust) a pool voice of their sex and age
  band from their own seed, a window a mid or old one.
  `audio.voiceChain(mode)` ('dialog' | 'phone' | 'car' | 'world' | 'shout'), `audio.voiceDuck(on)`
  (music −8 dB, engine −4 dB under speech), `audio.setVoiceLevel(v)`, `audio.setListener(...)`,
  `audio.giggle(pitch)` (a child's line with no clip). The composed score: `audio.music(state, { day })`
  plays `assets/music/` cues (title, roam playlist with the generative piano, errand, pursuit,
  hurry, race, chase, finale), cross-faded; the piano is the fallback. Characters get
  `anim.mouth` (0..1) while a clip plays: the jaw follows it (models.js). Pause menu **Röster** and
  **Röstvolym** (`voice`, `voiceLevel` in `saab-and-run-settings`).
- Title (phase 4): the scene is the picture: Ove beside his Saab, rolled out of its bay in front of
  his garage, in the right half; the left holds the title card with **Spela** (or, with a save,
  **Fortsätt** + "Dag N · Veckodag" and a small two-click **Nytt spel**) and a **Kontroller** button
  (`#title-ctl`, toggles `#title.ctl`) that brings up the controls table. The start toasts only show
  on a new game.
- Pause menu **Grafik**: Auto → Hög → Låg (gfx `setQuality`); the label shows what Auto picked
  ("Auto (Hög)" / "Auto (Låg)"). Saved as `quality` in `saab-and-run-settings` once chosen (an old
  `gfx: 'low'` still counts, `gfx: 'high'` is ignored); the URL's `q` / `lowgfx` win.
- Banners sit on a light band (rgba 0.45, no blur, 70 px fades).
- Scenes hold the HUD's chatter back (phase 4 round 2): while the letterbox or the curtain is up, or the
  game holds a shot (`game.inDialog`: UPPDRAG KLART, the finale), the toast column and the report
  ticket are hidden (`#hud.cine`); toasts on screen when it starts are dropped, new ones queue and
  slide in one by one after it. `hud.clearToasts(cls?)` fades the toasts of a class ('phone', ...)
  or all, queued ones too (missions.begin() clears 'phone' and 'offer': "X vill dig något" /
  "väntar fortfarande", which also fire only while the day is still on offer).
- Under the curtain (a cut to black) the whole HUD fades out with the picture (round 2b); under the
  letterbox the objective goes too. The title card is hidden for good once faded (?test: at once).
- Pause menu **Avbryt dagens uppdrag** (`#opt-abort`, two clicks like Radera sparat spel): shown only
  while `missions.canGiveUp` (running, not in a mid-mission scene); calls `missions.abort()` and unpauses (the way out for a
  gamepad player and for a stuck stage).
- Portraits (`renderPortrait`, `PORTRAIT`): a window portrait, not studio light - a warm key well to
  camera-left casting a soft shadow, little fill and sky (~3.5-4:1 across the face), a cool rim from
  behind the other side; behind the sitter a blurred winter street (a row-house wall, window, snowy
  eave, spruce; one of three house colours picked from the character's name) with a vignette.

## 10. Rendering contract (`src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`)

Built in phase 1. Everything below is the actual API; later agents rely only on this section.

### 10.1 What the renderer does (so you know what you get for free)
- **Pipeline:** `WebGLRenderer` -> `EffectComposer` (HalfFloat; only the scene pass is
  multisampled (4x on high), the second target is plain: on high the OutputPass draws to the screen
  without a swap) -> bloom (`GameBloomPass`: UnrealBloomPass, threshold 2.6, only lights / sun glints
  / fire bloom, **without its final blend** into the multisampled scene target: the OutputPass adds
  the half-resolution bloom before tone mapping - the same image, ~1.5 ms less GPU at 18.7 MP) ->
  `OutputPass` (ACES Filmic, exposure 1.45, then a display grade: a toe lift (display-linear ^ 0.86 - ACES alone crushes
  shade into navy-black), a soft black point (x² / (x + 0.03), rescaled: the deepest tones go to
  black, mid tones barely move, nothing clips), saturation 1.0 falling to 0.65 x in the deepest
  tones, a gentle S-curve on the upper half only, + sRGB) -> on the low tier only, FXAA (the grade
  then draws into the second target and FXAA to the screen).
  Call **`renderFrame()`** once per frame instead of `renderer.render(scene, camera)` (main.js
  does). Per frame it: updates the scene's matrices **once** (`scene.matrixWorldAutoUpdate` is
  false; don't rely on a render call updating them); renders the sun's shadow cascades in a
  shadow-only pass (the near cascade every frame, the far one every 2nd frame on high / 4th on low and
  at once when the camera jumps > 6 m or turns > 10 deg - moving things beyond 30 m update their
  shadows at 30 Hz on high; on low they cast none beyond 30 m); on high renders the GTAO normal/depth pre-pass through a camera whose far plane
  is 80 m (AO is a 0.9 m contact term at half resolution: nothing further is drawn there); then the
  main pass. `renderer.render()` still works for one-off renders to a render target (portraits), but
  gets no AO/bloom/tone mapping (output is linear).
- **Light:** one `SunLight` (`sun`, 13 deg elevation, azimuth 143 deg: it shines from +x/-z, so
  shadows fall towards -x/+z; intensity 6, warm low-sun colour (1, 0.80, 0.58)) with two cascaded
  shadow maps (crisp to 30 m, coarse to 210 m), and image-based light from a CC0 winter HDRI
  (`assets/sky/passendorf_snow_2k.hdr`, sun clamped out, saturation 0.62, tinted (0.94, 1, 1.05)
  so shade is cold blue rather than lilac, intensity 0.62). The environment's lower hemisphere is
  faded to the photo's mean ground colour (the photo's field has nothing to do with our town, and
  paint/glass would mirror it). Measured at 1280x720 (round-6 grade): sunlit snow ~222 sRGB, shaded
  snow ~(129, 143, 167) (blue-grey, not violet), shaded asphalt ~(55, 58, 65), sunlit asphalt ~(161,
  150, 139); the darkest 1 % of a gameplay frame ~15-31 (was 36-51: a veiled, milky image). The
  HDRI is also the sky, its sun warped onto `SUN_DIR`; the sky turns into the fog colour below ~2.5-7
  deg of the *photo's* elevation (a low photo sun stretches its treeline upwards, so the cut is made
  there), and below ~14 deg nothing in it may be darker than the haze, so the photo's own ground and
  treeline never show and **the 3D hills are the horizon** (keep something tall-ish out there).
  There is **no hemisphere/ambient light**; don't add one (the HDRI does that job).
- **Fog:** height fog (density 0.0016 at y <= 0 - it was 0.0022, a milky floor on everything 10-30 m
  away - falling off with a 35 m scale height, integrated
  along the view ray: haze lies in the valley, aerial views stay clear) plus a thin exp2 far haze
  (`scene.fog` = FogExp2 0.0012, also thinning with altitude). Colour from the sky, tinted warm
  towards the sun. Applied by every built-in material through the fog chunk; custom shaders use
  `FOG_GLSL` (exported string defining `float gameFogAmount(vec3 camPos, vec3 rel, float exp2)`,
  `rel` = point - camera, pass `LIGHTING.fogExp2`), as fx.js does.
- **AO** (GTAO at half resolution, radius 0.9 m, thickness 0.5 m - contact occlusion, not metre-wide
  clouds on a wall behind a bin - raised to the power 1.3) darkens *indirect* light inside every
  MeshStandard/MeshPhysical material, and a quarter of it also darkens *direct* light on
  upward-facing receivers (contact cue under cars, at wall feet). On snow the AO darkens neutrally
  (a hint cooler), not towards the warm sun (it took the blue skylight and left a coffee stain).
  Things that must not occlude (particles, glows, beams, see-through shells, cards) set
  `obj.userData.noAO = true` - that also keeps them out of the shadow pass; transparent
  single-material meshes, Points, Lines and Sprites are skipped automatically. The pre-pass object
  lists are rebuilt every 20 frames (something added in between joins at the next rebuild).
  `sceneDepthTexture()` (AO's depth, for soft particles) only holds geometry within 80 m:
  `sceneDepthRange()` is its (near, far); a cleared texel (1.0) means "nothing near".
- **Glints:** direct (sun) specular is clamped to 3x before bloom (snow crystals to 14x), so
  wet or glossy surfaces glint without white smears. Snow sparkle is a sun-only glint (round,
  pixel-sized crystal facets at 1.4 cm and 4.5 cm, added to the sun's specular, so it never darkens
  the snow and vanishes in shade). Reflected skylight is boosted per surface (`env` in `SURFACES`:
  glass 1.8, tinted glass 1.6, chrome 1.4, car paint 1.3 + its clear coat 2.0 (`envCC`), default 1.2,
  asphalt 0.75 with its sky reflection half desaturated (`specDesat`), so damp shade reads grey).
- **Shadow pre-pass detail:** a mesh whose material is an array is drawn as **one** call in the
  shadow and AO passes (surfaces don't matter there). So every part of a multi-surface mesh casts
  a shadow, including any 'tinted' glass in it. Put see-through car glass in **its own** mesh
  (single 'tinted' material -> casts no shadow, no AO), as car.js does. Each object kind (Mesh,
  InstancedMesh without and with `instanceColor`, SkinnedMesh, BatchedMesh - five kinds) gets its
  own depth (`customDepthMaterial`, unless you set one or the material is alpha-tested) and AO-normal
  material, and instanced / skinned / batched users of a shared surface material are given that
  kind's own copy (`kindSweep`, every mesh, also the ones left out of the pre-pass): one material
  used by several kinds made three.js re-evaluate its program at every switch (12-20 times a frame
  before phase 4 round 2, ~0 now: `render.mjs rprog`). An InstancedMesh that gets its
  `instanceColor` later is moved to the other kind at the next list rebuild (every 20 frames).
- **Draw calls:** one draw call per surface per mesh in the main pass. Static world geometry is
  merged per block with `GeoBuilder` (buildTown: one builder per block for solids, ground and
  twigs) and then **batched by surface across the town** (`src/world/batch.js`, `StaticBatch`, a
  `THREE.BatchedMesh`): one batch per category (block / ground / twigs / forest belt) and surface,
  the block's part of it as a culled range; neighbouring visible ranges are merged, so a surface is a
  handful of draws per pass whatever the view (the streets join the ground batches). The surface
  shader handles `USE_BATCHING`. Everything buildTown adds is `makeStatic` (fixed matrices, CPU
  vertex arrays dropped after upload). `?nobatch` restores the per-block meshes (A/B: same image).
  Prefer `InstancedMesh` for repeated props. The static world went from ~450-1,200 main-pass calls
  to ~35-45; whole frames (round 6, 1280x720, RTX 4070, all passes, high, with the cars' and people's
  own round-6 LODs): start 493 calls (was 1375), lot 761 (1583), Solrosvagen 747 (2104), drone_nw 783
  (1667), aerial 533 (2211); `renderFrame` 4.7-6.6 ms CPU (was 8.5-9.6). See notes/rendering.md.
  Cars, props and people are now the biggest consumers of calls.
- **Quality:** `setQuality('auto' | 'high' | 'low')` (returns `qualityInfo()`), `getQuality()` ->
  the setting, `qualityInfo()` -> `{ setting, tier, scale, pixelRatio, gpu, integrated, reason }`
  (what actually runs: `tier` 'high' | 'low', `reason` e.g. 'integrated GPU', 'slow (24.1 ms)',
  'chosen', 'weak GPU', 'laptop GPU'; also `msaa` (samples) and `fxaa`). Two tiers: **high** =
  GTAO, bloom, 4x MSAA, 2048 shadow maps with 16-tap PCF, far cascade every 2nd frame; **low** = no
  AO pre-pass and no bloom (a shadow-only pre-pass), no MSAA but FXAA, 1024 maps with 4-tap PCF, and
  it sheds CPU too: the far cascade (30-210 m) every 4th frame and with only the static world in it
  (props, cans, cars, wheels and people - anything instanced, skinned or inside a group - cast no
  shadow beyond the near cascade's 30 m), and prop cells (`props:*`) more than 120 m away are left
  out of every pass (`&leanprops=m`). The pixel ratio is capped at 1 device pixel per CSS pixel
  (`&pr=x` forces x). **auto** (the default outside tests) = low on integrated GPUs
  (WEBGL_debug_renderer_info: Intel, AMD Radeon(TM) Graphics / Vega APUs, plain Apple M-chips,
  mobile, software) and on weak entry-level ones (GeForce MX, Quadro P/T + 3 digits), else high
  (laptop GPUs - 'Laptop', 'Max-Q', 'Mobile' - at 2x MSAA); `classifyGpu(str)` is exported for tests
  and `&gpu=<string>` pretends to be that GPU. The automatic quality judges each frame's **cost**:
  its CPU work (update + render, from the rAF timestamp) and its GPU time (EXT_disjoint_timer_query,
  on 'auto' and 'low'; `&nogputimer` = the intervals-only fallback of browsers without it), as the
  75th percentile of max(CPU, GPU) capped by the mean frame interval - a machine busy with something
  else (slow frames, cheap work) does not count as slow. Frames around known hitches are not counted
  (the first 3 s, 1 s after a > 100 ms frame, a shader compile, a camera cut or a resize, 0.2 s after
  an upload, 2 s after the tab is shown, and `holdAutoQuality(ms)`). **auto and low** scale the
  render resolution 0.6/0.7-1.0 in ~0.75 s windows (down a step when frames cost > 15.5 ms - > 18.5
  ms of interval without a GPU timer - undone if that did not help, i.e. CPU-bound, and probed back
  up after a few good windows); on the high tier **auto** first steps 4x MSAA down to 2x (and back up
  last). **auto** drops to low only when those steps are spent (2x and the scale at its floor, or
  found CPU-bound) and the last 8-10 s at those settings cost over 18.5 ms (reason 'slow (x ms)');
  it goes back to high ('recovered', at 2x) after 30 s at full scale with high's predicted cost (low's
  CPU x 1.3, GPU x 1.6) <= 15 ms, never on a GPU that starts low; a drop within 2 minutes of that
  doubles the wait and lowers the bar, and after three it stays low. `gfxDebug.aqStep` drives it
  with simulated frames (render.mjs `rautosim`). **high** is always full resolution, 4x. Tests
  (`?test`) default to high without the dynamic scale (deterministic shots); `&q=auto|high|low`,
  `?lowgfx` (= low) and `&dynscale` override. Tier switches need no shader recompiles.
- Look-dev URL overrides (for testing only): `&hdri=winter_river_2k` (hazier alternative sky),
  `&sunelev=13&sunaz=143`, `&exposure=1.45`, `&tm=aces|agx|neutral|none`, `&sunint=6`,
  `&suncol=1,0.8,0.58`, `&envint=0.62`, `&envsat=0.55`, `&envtint=0.97,1,1.02`, `&fog=0.0012`
  (exp2 haze), `&hfog=0.0022&hfogh=35` (height fog), `&sat=1&contrast=0.22&toe=0.8&sdesat=0.65`
  (grade), `&aostr=1.3&aorad=0.9&aoscale=1&aothick=0.5&aofall=1&aoexp=1.6`, `&aoview` (shows the AO
  term only), `&dbg=1|2|3|4` (albedo / indirect diffuse / indirect specular / direct light of every
  surface; use with `&tm=none&contrast=0&toe=1&sdesat=1&exposure=1` to read linear values off a
  screenshot), `&glintdbg` (snow crystal cells in green, their glints in red), `&black=0.03` (soft
  black point), `&aofar=80` (AO pre-pass far plane), `&farevery=n` (far cascade every n frames),
  `&gputime` (GPU timer -> `gfxStats.gpuMs` and `gpuHist`; 'auto' / 'low' fill `gpuMs` anyway),
  `&nogputimer` (no GPU timer), `&debug` (shader error checks, on in tests),
  `&nobatch`, `&nomultidraw` (BatchedMesh without WEBGL_multi_draw), `&nowarmdraw` (no warm frame
  while loading), `&gpu=<renderer string>`, `&leanprops=120`, `&envdown=1&envband=0.17` (the env's
  ground: brightness multiplier and the fade depth under the horizon, radians), `&townhash`,
  `&checkmerge`, `&oldmerge`.

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
| `marking` | road paint on asphalt grain (white lines, zebra); polygon offset, so it wins over coplanar asphalt at any distance | `0xd8d8d2` | no |
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
| `skin` | skin: smooth, slightly rough; light wraps round the terminator with a red shift (vec3 wrap 0.42 / 0.22 / 0.15) and its shade keeps a little warmth from the cold skylight | `0xd8a888` | no |
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
  **`ensureSurfaceAttributes(geo)`** (adds white vertex colours and triplanar attributes). Shared
  materials on an InstancedMesh / SkinnedMesh / BatchedMesh are swapped for that kind's own copy by
  the renderer (same shader and programs); don't compare `mesh.material` against the shared one.
- **`makeStatic(root, { freeArrays = true })`**: matrices fixed (`matrixAutoUpdate` false) and the
  geometry's CPU arrays dropped once uploaded (bounds computed first; no re-uploads afterwards).
  Positions and the index stay, so raycasts still hit it, unless the mesh is `userData.noAO` (cards,
  haze, far hills) or sets `userData.raycastable = false`: those become non-raycastable (`raycast` is a
  no-op). buildTown applies it to everything it adds. The world's batches raycast per block (only the
  blocks a ray passes near are tested).
- **`precompile(root = scene, { warm = true })`** -> promise: compiles every program `root` needs
  against the scene (lights, fog, environment) **as the composer's scene pass sees it** (linear HDR
  target, no tone mapping - a plain `renderer.compileAsync` while the screen is bound compiles
  tone-mapped variants the game never uses), with KHR_parallel_shader_compile, without blocking - and
  the renderer's own programs, each in the state its pass draws in: the five kinds' shadow-depth and
  AO-normal materials, the shadow pre-pass' own mesh, bloom, GTAO and its denoiser, the output grade
  and FXAA. With `warm` (the default) it then, still without blocking, waits for the GPU (`gpuIdle()`),
  takes every program into use (its first use waits for the driver's link: ~0.3 s for the scene's
  ~140, in 25 ms slices) and draws one whole frame behind the loading screen (the driver finishes each
  program on its first draw: another ~0.3 s of GPU work) and waits for the GPU again. People's
  first-draw face bakes are held off in that frame. main.js calls it at 'Tar porträtt…' and awaits it
  before the loop starts: the first title frame takes ~10-25 ms (was 0.4-0.47 s, frozen) and nothing
  compiles in it (`gfxStats.first.newPrograms`). buildTown starts one with `{ warm: false }` for the
  world. **`uploadGeometry(root = scene)`** draws everything under `root` once into a 1x1 target (no
  colour, no depth) so its vertex and index buffers are uploaded now rather than in the first frame;
  objects' own `onBeforeRender` hooks are held off meanwhile (faces keep baking lazily), class hooks
  run. buildTown does it for the world, main.js for the rest at 'Tar porträtt…'. **`gpuIdle()`** -> promise: resolves when the GPU has finished
  what was issued so far (a fence polled between tasks). **`nextTask()`** -> promise: a yield to the
  event loop (scheduler.yield / MessageChannel; not clamped like setTimeout).
- **Loading the town:** `buildTown(scene)` (world/town.js) builds it in one task (2.4-3 s on a
  desktop CPU). **`buildTownAsync(scene, onProgress)`** does exactly the same work in the same order -
  the same town byte for byte (`?townhash` hashes the batches) - but yields to the browser every
  ~40 ms (no task over ~0.35 s; the loading screen stays alive) and calls `onProgress(f)`, f = 0..1;
  ~0.1-0.2 s longer in all. `townStats` has `buildMs` (work time), `wallMs`, `steps` (per stage).
- Geometry from `GeoBuilder.build()` has attributes `position, normal, color, tri (vec4), trin`
  and `geo.userData.surfaces` (surface name per group). It is merged in one pass into preallocated
  arrays (the same result as two levels of `mergeGeometries`, which it falls back to for unusual
  parts; `?checkmerge` runs both and compares every build, `?oldmerge` the old one). If you push your own geometry into
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
- **Snowfall:** `fx.snowfall(on, intensity = 0.6)` - small flakes (~1 cm, at least a pixel; smaller
  ones fade rather than shrink) with a short motion streak along their fall, in a 40 m box around the
  camera plus a denser 14 m box close to it, eased in/out over a few seconds (finale).
  `fx.blizzard(amount, wx, wz, now)` (game/cold.js): the same flakes, as many as a snowfall of
  `amount` (whichever is more), carried on a wind of (wx, wz) m/s (their streaks along it).
- **Blizzard / whiteout** (game/cold.js `beforeRender` / `afterRender`, around `renderFrame`): the exp2
  haze up to 12× and whiter, the sky dome's haze colour the same white and its `uWhite` (0..1) mixing
  the whole sky into it (the sun no more than a pale brightness), the sun dimmed by up to 60 %; put
  back after the frame, so `dusk()` and the rest only ever see the real values. The 'hillside'
  surface's spruce stands and bare patches show only from beyond ~100 m (fading in 70-170 m): close
  by, where Ove can walk now, it is plain snow.

- **Tracks in the snow** (game/tracks.js, 4.10): two transparent meshes (prints: an
  InstancedBufferGeometry of quads; ruts: a ribbon of four-vertex segments) drawn with a unique copy of
  the `'snow'` surface material (its texture, drifts and sparkle in world coordinates like the ground
  under them, `vertexColors` off, colour = the surface's), patched in its `onBeforeCompile` after
  `surfaceCompile`: a height function per fragment (the sole's outline, walls, a crumbly rim, the
  pattern; a tyre's bottom, shoulders, berms, tread) bends the normal by its slope; the sky and its
  reflection see a normal bent most of the way back up (`geometryNormal` before
  `lights_fragment_maps`: a wall facing the bright horizon sees the opposite wall) with a little
  occlusion in the bottom; a 7-step march towards the sun over the same function shadows the sun's
  light only (`RE_Direct` wrapped: the low sun fills a 4 cm print with shade). Alpha fades over the
  rim / berm, the rings' oldest, a fill-in and 90-140 m away. `polygonOffset`, `renderOrder` 1.05 /
  1.1, `userData.noAO` (no shadow or AO pre-pass), receive shadows. If gfx.js renames the chunks it
  patches (`#define GAME_SURF 1`, `#define RE_Direct RE_Direct_Game\n#endif`), tracks.js logs
  'tracks: shader chunk not found'. Cost: +2 draw calls; with every ring full in view from above
  +0.4 ms GPU, from a chase camera nothing measurable (`snospar.mjs sposperf`).

### 10.6 Particles (`src/game/fx.js`)
Same API as before; all lit by the sun/sky, soft (fade where they touch geometry), fogged:
`fx.init(scene)`, `fx.tick(dt)`, `fx.spawn(x, y, z, color, { vx, vy, vz, s0, s1, life, drag,
grav })` (saturated bright colours become glowing additive particles, others soft lit smoke),
`fx.smoke(x, y, z, dark)` (engine smoke / pale steam), `fx.exhaust(x, y, z, vx, vz, { alpha, size })`
(cold-morning tailpipe vapour: thin, bluish, spreading and fraying away over 1.8 s; `alpha` and `size`
are multipliers of that default puff, e.g. `{ alpha: 0.6, size: 0.8 }` at idle), `fx.fire(x, y, z)`,
`fx.explosion(x, y, z)`, `fx.dust(x, z, n, y)` (= snow powder kicked up), `fx.sparkle(x, y, z,
color, n)` (pickups: tiny additive glints - a pinpoint with a thin four-point star that twinkles,
tinted by the colour), `fx.sparks(x, y, z, n)` (hot streaks that bounce), `fx.shame(x, y, z,
n)` (neutral puff now), `fx.splash(x, z)` (slush), `fx.skid(x, z, yaw, w, kind)` (tyre track
decal; `kind` 'snow' = pale compressed rut, else dark rubber on asphalt; if `kind` is omitted
`fx.surfaceAt(x, z)` is asked when the world sets it; main.js no longer lays it on snow, where the
ruts of game/tracks.js show a slide), `fx.snowfall(on, intensity)`.
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
`renderFrame, setQuality, getQuality, qualityInfo, classifyGpu, holdAutoQuality, precompile,
uploadGeometry, gpuIdle, nextTask, makeStatic, prepareKind, setSnow, getSnow, setWetness, setLight, gfxStats` (`ms` (renderFrame
CPU, smoothed), `calls, tris, aoCalls` (shadow + AO pre-pass calls); `pass.{shadow, ao, main}` =
[calls, tris] of the last frame, `cpu.{matrices, pre, main}` ms, `gpuMs` (`&gputime`, 'auto', 'low'), `first` =
{ ms, programs, newPrograms } of the first frame; also in `__stats()`), `warmStats` (the loading's
warm frame: drawMs, gpuWaitMs), `gfxDebug` (tests), `sceneDepthTexture()`, `sceneDepthRange()`, `followSun()` and
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
