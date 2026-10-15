# World (phase 2) — notes for later agents

Owner: world agent. Files: `src/world/*` (all of them). This is the actual API of the town as
built; DESIGN.md §6 is the contract it implements. Everything is PBR via the §10 surfaces.

## Files

| file | what |
|---|---|
| `layout.js` | grid (unchanged: 7×7, pitch 80, RHW 5.5, SW 3.5, CURB 0.15, right-hand traffic), road graph, routing, `landmarks`/`lm()`, **new `MAP`**, **`carFreeZones` + `isCarFree(x, z)`**, **`KR` = 5 (kerb radius at junction corners; `isRoad`/`baseGround` treat the rounded-off corner squares as road)** |
| `collision.js` | unchanged |
| `town.js` | orchestrator: `buildTown(scene)`, `tickTown(t)`, re-exports all data (below), `townStats`; sets `fx.surfaceAt`; per block an `S` (casting), `F` (ground, no shadow) and (round 5) `S.fineG` builder (`twigs##` meshes: thin tree branches, no shadow, no AO pre-pass) |
| `data.js` | the shared output arrays (parkedCars, pedLoops, violationSpots, litterSpots, collectibleSpots, keepClear, **camBlocks**, **roadNames**, …) and `shared.glassG` (one see-through 'tinted' glass builder for the whole town: shop windows, the showroom, shelters, entrance vestibules, greenhouses, grave lantern; town.js turns it into the `glass` mesh) |
| `surface.js` | **(round 3)** ground-surface registry: `addGround(surface, x, z, w, d, yaw, y)`, `addGroundCircle`, `surfaceAt(x, z)` → `'snow' \| 'asphalt' \| 'paving' \| 'gravel'` |
| `kit.js` | building kit: `Frame` (local frames; also `.roof .bank .pile .fringe .cam`), `flatQuad` (round 4: a horizontal ground quad, no risers), **tree templates** (`tree()` kinds `birch spruce pine lime`(=`bare`) `small thuja`, lite / small LODs), `hedge` (kinds evergreen / bare / square), `granris`, `shrub`, `streetLamp`, `pathLamp`, `signPost`, `snowBank`, `snowPile`, **`snowFringe`**, **`chunks`**, `metalRoof` (low roofs), **roof furniture `snowGuard roofLadder ventStack downpipe slopeAt`**, `win`/`winLite`/`door`/`canopy`/`lampBox`, **`glow(hex, L)`** (round 6: a 'light' colour capped at emission luminance L, under the bloom threshold), `quads` (flat paint), `fineTex`, `shadeLast`, `camBlock`, noise `vnoise vnoise2 vnoise3 hash`, palette `C`, `WALLS`, `DOORS`, `HEDGE_GREEN`, `HEDGE_BARE`, debug `treeStats`, `snowStats` |
| `signs.js` | **sign atlas**: every printed sign / plate / painted ground symbol in town is a quad on one of 8 atlas page kinds (plain, glow, cutout, decal, **twig**, **leaf** (round 5: evergreen hedges), **conifer**, **crown**; the four card pages are split into a 3 × 3 grid of meshes for culling). `picto(name)`, `textFace(text, w, h, opts)`, `decal(name)`, `twigFace(kind, v)`, `addSign`, `addDecal`, `addCard`, `addQuad` (round 4: a card of any orientation), `finalizeSigns(scene)`; debug `rebuildSigns(scene)`, `signPages()` |
| `rowhouse.js` | 1970s radhus: `radhusRow`, `garageRow` (`moving`: the open garage gets door tracks instead of a door tipped up under the ceiling), `garageInterior`, `radhusArea` (whole area: lot, garages, soprum, 4 rows, walkways, bike shed, playground; `movingGarage`) |
| `ove.js` | Ove's block = `radhusArea` + named units, his garage and its door (`GarageDoor`, into `doors`), signs, landmarks, violation spots |
| `garagedoor.js` | **(feature oppna_garaget)** `GarageDoor`: Ove's up-and-over garage door, the one world mesh that moves (see *Ove's garage door* below) |
| `interior.js` | **(feature luftning_borde_vara_en_scen)** `buildKitchen(info)`: Anita and Rune's kitchen, the set of day 3's radiator scene, built inside their real house only while the scene runs (see *Rooms inside the houses* below); **(feature avgrunden)** `buildBedroom(info, { photo, clock })`: Ove's bedroom, where he wakes after freezing to death |
| `buildings.js` | `gableHouse`, `flatBuilding`, `lamellhus`, `hipGeo`, `flagpole`; blocks `villaBlock`, `apartmentsBlock`, `radhusBlock` |
| `places.js` | blocks `centrumBlock hospitalBlock churchBlock cemeteryBlock dealerBlock preschoolBlock kommunBlock gasBlock parkBlock fieldBlock forestBlock`, `mound` (sledding hill) |
| `streets.js` | slabs, kerbs, sidewalks, markings, zebras (`CROSSINGS`), bus stops (`BUS_STOPS`), lamps, road signs, snow banks, street violation spots, ped loops |
| `outskirts.js` | forest belt (every trunk solid), noise heightfield hills (`hillHeight(x, z)`; `layout.terrain.at` = the mesh's own height), the forest tracks' gaps, the near hills' spruces and boulders (`tickWild`), silhouettes beyond 740 m. **(feature avgrunden)** no walls, no barn, cottage or fence |
| `props.js` | Swedish breakables (same API as before); phase 4 r2: baked into one run-culled static batch per surface (`props:<surface>`, batch.js `StaticBatch`), `?nobatch` / `&propinst` = round 5's instanced meshes per type and 200 m cell (`props:<type>:<cell>`) |

## MAP (j = 0 is −z, i = 0 is −x; block (3,3) is centred on the origin. Since phase 4 the maps draw north = +z, so j = 0 is the SOUTH row and i = 0 the EAST column)

```
j0  forest    villa       villa      field       radhus      villa       forest
j1  villa     apartments  preschool  radhus      apartments  hospital    villa
j2  radhus    villa       centrum    apartments  kommun      apartments  villa
j3  gas       radhus      radhus     ove         park        radhus      villa
j4  villa     apartments  villa      radhus      villa       villa       dealer
j5  church    villa       radhus     villa       apartments  radhus      forest
j6  cemetery  forest      villa      radhus      villa       forest      forest
```
**hud.js minimap colours**: `hud.buildBaseMap()` colours blocks by `MAP` type; the new types
(`ove radhus villa apartments centrum hospital church cemetery dealer preschool kommun gas park
field forest`) all fall back to the default green until the UI agent adds them. Buildings already
appear (solid kinds `building`, `garage`).

## Exports (`town.js`)

`buildTown(scene)`, `tickTown(t)`, `parkedCars`, `pedLoops`, `animated` (empty), `doors` (Ove's garage door), `lamps`
(`{x,z}`), `bouncers` (empty — no trampolines that bounce), `violationSpots`, `litterSpots`,
`collectibleSpots`, `carFreeZones`, `isCarFree`, `mapLabels` (`[label, landmarkKey]`, Swedish),
`townStats` (`buildMs, meshes, landmarks, violationSpots, litter, parkedCars`), and (round 3)
`surfaceAt(x, z)`, `camBlocks`, `roadNames` (see "For main.js").
Build takes ~1.9–2.3 s. Call `finalizeProps(scene)` after `buildTown` as before.

## Landmarks (`lm(name)` → `{x, z, yaw}`; boxes add `w`, `l`)

Yaw convention: **houses** (`oveHouse` …) = standing on the path 1.3 m in front of the door,
**facing out** (an NPC greeting you). **Places** (preschool, centrum, kommun, church, hospital,
gas, dealer, park, field, cemetery) = a visitor's spot **facing the entrance/thing**. Bus stops
face the road. Boxes: yaw = heading of a correctly parked car.

| name | x, z | yaw | notes |
|---|---|---|---|
| **oveStart** | −5.9, 4.2 | π/2 | **player spawn (new)**: on the main walkway, facing east along it, ≥ 8 m free walkway behind (a follow camera starts outside the houses) |
| oveHouse | −5.9, 8.1 | π | Ove's front door (S1a unit 5, falu red, 1½-storey), door faces north onto the walkway. *Don't spawn here with a follow camera: behind it is the house.* |
| parvanehHouse | −5.9, −0.5 | 0 | N1a unit 1 (ochre), directly across the walkway from Ove |
| runeHouse | 5.9, 5.7 | π | S1b unit 1 (grey-green), next to Ove across the cross walkway; at the **foot** of the wheelchair ramp, out on the walkway (round 3: was on the ramp landing) |
| jimmyHouse | 11.3, −0.5 | 0 | N1b unit 4 (off-white) |
| andersHouse | −27.5, −0.5 | 0 | N1a west end; outdoor heater; his Audi is in the reserved bay behind |
| oveGarage | 4.7, −20.3 | 0 | in front of garage 1 (open, "OVE" plate) |
| **oveGarageSpot** | 5.33, −16.95 | 0 | box **2.3** × 5.0 inside garage 1 (nose in, workbench ahead), clear of the shelf on the left wall (round 3) |
| **saabSpot** | 6.8, −23.1 | 0 | box 2.6 × 5.2, in the aisle in front of garages 1–2, nose to the garages |
| **parvanehDrive** | −8.0, 3.8 | π/2 | box 3.2 × 9.5 on the main walkway in front of Parvaneh's (car faces east, trailer west) |
| garbageRoom | −4.2, −20.5 | 0 | aisle in front of the soprum doors |
| bikeShed | −24.5, 25.4 | 0 | gravel path in front of the cykelförråd |
| parking | 12.0, −22.8 | π | lot aisle |
| guestParking | −22.7, −21.2 | 0 | in front of the 4 guest bays |
| adrianSpot | −26.6, −22.2 | −0.4 | lot aisle near Anders' Audi |
| **adrianBay** | −22.95, −28.4 | π | **(round 5)** box 2.5 × 5.0: north bay 3 of Ove's lot (bays index 2), kept **empty** (no parked car) for Adrian's Saab after day 5; a "Reserverad" plate on a post at its head, behind the low kerb; 6.4 m from adrianSpot |
| mailboxes, playground, torg | 0,−26.4 / 14,25 / 1.8,3.8 | | extras |
| hospital | 143.4, −166.6 | −π/2 | under the Akutmottagning drive-in canopy (drop-off), a person's spot facing the Akut door |
| **hospitalDrop** | 142.7, −171.0 | π | **(round 5)** box 2.6 × 5.2: where a car stops to let someone off, in the canopy's drive lane beside the Akut door (driver's side to the door), heading north; its tail is 1.8 m short of `hospital`. Reached by the new **Akut driveway** from the west street (x = 120) at z ≈ −158.7 (a dropped kerb just south of the Akut wing, signposted "↑ Akutmottagning / Avlämning"), across a paved apron and north into the lane; also from the car park. Validate sweeps both (`hospitalDrop`, `hospitalDrop2`) |
| hospitalEntrance | 166.0, −166.5 | π | Huvudentré |
| **hospitalSpot** | 171.3, −157.5 | π | box 2.6 × 5.0, a bay in the paid car park (reach it from the west street, middle aisle) |
| preschool | −74.0, −136.6 | π | front door of Förskolan Solrosen (pick-up spot); `preschoolGate` −93.6, −150.4 |
| centrum | −82.0, −94.8 | π | torg in front of the Livs; `pizzeria` −76.6, −96.4 |
| dealer | 232.8, 81.0 | π/2 | Bilhallen forecourt in front of the showroom door (car-reachable); `dealerLot` (214, 80) |
| **dealerFinish** | 202.75, 80.0 | π | **(round 5)** the race's finish line: on the street (x = 200) in front of Bilhallen's driveway, in the northbound lane centre (the race comes up from junction (6,5) at z = 120), heading along the road |
| church | −259.1, 158.0 | π/2 | in front of the tower door |
| cemetery | −240.0, 211.4 | 0 | just inside the north gate (gate faces the church across the street) |
| **sonjaGrave** | −233.8, 217.3 | 0 | standing spot 1.55 m in front of Sonja's stone (dark granite, gilded "SONJA", lit lantern), facing it |
| **graveFlowers** | −233.92, 218.65 (y 0.27) | 0 | **(round 5)** `{x, y, z, yaw}`: where the story lays the flowers, on the plinth's front ledge between the stone's face and the plinth edge (13 cm deep), left of the lantern (seen from the standing spot: right of it); y = the plinth top. Not a standing spot (it is inside the grave's collider) |
| flowerShop | −247.5, 208.2 | 0 | "BLOMMOR" kiosk by the cemetery gate |
| kommun | 80.0, −64.5 | π | in front of Kommunhuset's entrance |
| gas | −249.6, −21.5 | −π/2 | at the Bensin & Service shop door |
| park, pond, pulkabacke | 91,−5.6 / 93,−6.6 / 65,6.5 | | by the frozen pond; the sledding hill |
| field | 0, −222.5 | π | south side of the snowy pitch |
| busStop | 12.0, −32.9 | π | Solrosvägen, north street of Ove's area (bus heading east) |
| busStopCentrum, busStopSjukhuset, busStopKyrkan, busStopForskolan, busStopBilhallen | | | the other five stops (round 3: Förskolan moved from x −92 to −64, out of the drop-off lot entrance) |
| forest… | | | one per forest block (`forest-240_-240` etc.) |

## Named parked cars (`parkedCars`, `name` set)

| name | type | where |
|---|---|---|
| saab | `saab900`, colour 0x2c5596 (phase 4 r2b: mid-blue metallic; r2 0x34506e, before 0x1c2a44) | at `saabSpot` |
| patrickCar | `kombi`, `trailer: true`, colour 0x5a6670 | crooked on the main walkway at (−17.2, 3.55), yaw π/2 + 0.2 — trailer will extend west (~to x −24), walkway is clear to x −31 |
| runeVolvo | `volvo240`, 0x7a1e1e | in front of garage 4 |
| andersAudi | `audi`, 0xd8d8d4 | Anders' reserved bay ("Reserverad – Ordförande") at (−29.2, −16.9) |

Other parked cars (~125; round 3 filled the centrum / hospital car parks to ~40-45 %, generic radhus
lots 10-16 %, a 'Veckans bil' bmw on a podium at Bilhallen, a golf at the pumps) use types
`volvo740 golf kombi volvo240 skoda bmw audi saab900 van`. 131 parked cars in all.
Two cars stand **inside Bilhallen's showroom** and carry `indoor: true`: build them with `snow: false`
(my copy's main.js: `snow: !pc.name && !pc.indoor`).
The world agent's copy aliased these to old types in `car.js`; the cars agent must provide them.
`main.js` should construct unnamed parked cars with `snow: true` (snow on roofs) — my copy did.

## violationSpots (135; round 2 had 140 — the new kerbed islands and keep-clears removed a few street ones)

`{ x, z, yaw, kind, where }` — `yaw` = heading of the badly parked car (on streets it faces the
traffic direction of its kerb), `where` ∈ `ove | street | radhus | villa | apartments | centrum |
hospital | park | kommun | preschool`. Counts: carfree 6, firelane 11, lawn 11, garbage 4,
guest24 4, handicap 3, loading 2, crosswalk 12, busstop 6, corner 34, sidewalk 42.
All verified: a 1.9 × 4.8 box fits with no solid (or parked car) inside, ground level, and every
street spot has its centre 5.85 m from the road centre line (half up on the kerb; lanes clear,
right-turning traffic clear: zebras sit 10.6 m from the junction centre for that reason).
In Ove's block: carfree on the main walkway (3), firelane on the cross walkway/räddningsväg (4) and
in front of the garages (1), lawn on the green, garbage in front of the soprum, guest24 (4 guest
bays), handicap bay. Street spots concentrate on Ove's and the 11 neighbouring blocks.

## carFreeZones / isCarFree

**Every radhusområde is car-free inside** (Ove's and the 10 generic `radhus` blocks): `radhusArea`
adds two rectangles per area — the interior `{-31,-13.5 → 31,31}` (everything but the lot) and the
walkway entrance between the soprum and the garages `{-3.6,-19.5 → 3.5,-13.5}` (area-local,
rotated with the block) — 22 rectangles in all, and puts the C2 "Förbud mot trafik med motordrivet
fordon" + E9 gångfartsområde signs at all four entrances (Räddningsväg plates on the cross walkway).
So every `carfree` violation spot satisfies `isCarFree` (the validate scenario asserts it). The
lots, garages and streets are not car-free. `isCarFree(x, z)` lives in `layout.js`.

## collectibleSpots (`[x, y, z, where, hint]`, y = item centre)

`where` and `hint` (Swedish) are what the pause menu's album says: where it was found ("På bänken
vid dammen i parken") and, while it is not, roughly where it might be ("i parken": "Någonstans i
parken."). The array order is the ids (the save and the photographs' pictures go by id).

emblems: Ove's workbench (5, 1.45, −14.55); Bilhallen lot; top of the park's sledding hill
(65, 4.25, 17); behind the car wash; Ove's bike shed; top row of the football stand; hospital car
park by a meter. photos: bench by the pond; church steps; minneslund; under the centrum
Christmas tree; in the Solrosvägen bus shelter; on the forest jogging track (block 0,0); preschool
sandbox (inside the fenced playground, enter by `preschoolGate`). Each is within pickup range of a
floor at ground level or reachable in ≤ 0.4 m steps (the hill and the stand are stepped colliders).

## litterSpots

163 `[x, y, z]` (y = CURB + 0.05): sidewalks (denser around Ove's), parking lots, bus stops (3 each),
the park, centrum, gårdar, the petrol station forecourt.

## pedLoops

Unchanged format: one rectangle per block at 7.67 m from the road centres (on the sidewalk's
asphalt walkway), `{ i, j, pts: [[x,z]×4] }` (peds.js assumes exactly 4 points). Nothing taller than
a step stands within 0.35 m of any loop line (validated every 0.5 m): bus shelters have an open front
(roof cantilevered from the back posts), all posts/lamps/trees stand at ≤ 6.6 m or ≥ 8.5 m from the
road centre. The corners (7.67, 7.67) stay on the sidewalk despite the rounded kerbs.

## Props (`props.js`)

Types: `mailbox` (villa, on a post), `mailrow` (stand with 6 boxes; Ove's lot puts name plates on
them: Ove, Parvaneh & Patrick, Rune & Anita, Jimmy, Anders, …), `trashcan` (= `bin`, green
wheelie bin), `papperskorg`, `kicksled` (sparkstötting), `bike`, `bench`, `planter` (round 6:
spruce boughs over the rim, snow drifts on top), `snowman` (round 6: lumpy packed snow, a dirty
foot), `pulka`, `box` (moving box), `fence` (white spjälstaket), `woodfence` (plank fence), `cone`,
`cart` (round 3: a wire basket of thin bars on a frame, castors), `pump`, `meter` (p-automat), `gnome` (tomte), `crate`, `tombstone`, legacy `hydrant
newsbox barrel` (not placed). `coins` kept (kronor). New: `placeProp(type, x, z, yaw, baseY)` (baseY
optional), `PROP_TYPES`. Gravestones in the cemetery are static, not props.

## Signs (`signs.js`) — use these instead of `signMesh` for anything static

`picto(name)`: `p pforbud stoppforbud motorfordon speed30 speed50 gangfart crossing bus barn hcp
recycle flagSE flagKommun clock` (`.shape` = rect/disc/tri for the backing plate; `motorfordon` is
the real C2: car over a motorcycle);
`textFace(text, w, h, { bg, fg, border, ppm, scale, weight, glow, cutout, radius })` (pass a real
`bg` on glow faces — `bg: null` shows the atlas' grey);
`decal('hcp' | 'p' | 'buss' | 'last' | 'ambulans')`; `kit.signPost(G, x, z, yaw, [{ f, w, h }, …], { top })`
builds a pole + plates.
**See-through cards**: `twigFace(kind, v)` (kinds `birch lime pine crowntop` → page `crown`;
`sprucebranch sprucetuft sprucefrond` → page `conifer`; `hedgegreen hedgegreenlow hedgegreentop
thujagreen thujagreenlow` → page `leaf` (round 5; phase 4 r2: `sprig` too); `hedgeside fringe mesh net
birchhang limespray` → page `twig`; v = 0..3 variants, procedurally drawn; `thujagreen` v 2-3 are bronze,
`sprucebranch`/`sprucetuft`/`sprucefrond` v 2-3 carry snow, `sprig` v 3 is snow-dusted; round 6:
`hedgesprig` / `thujasprig` → page `leaf`, a loose shoot proud of a clipped face, its base at the
card's left edge) and `addCard(face, x, y, z, w, h, yaw, up)` (two
back-to-back quads), `addQuad(face, c, r, u)` (any orientation: centre, half-extent vectors; the back
face is mirrored like a real flat thing; phase 4 r2: optional `nrm`, `tint`, `both`), `addGrid(face,
cols, rows, P, N, A, B, tint)` (phase 4 r2: a curved card, front face only; `tint` = [r, g, b, indirect
factor] on the leaf page); a horizontal card is `addDecal(face, x, y, z, w, d, yaw)`. The
card materials (`cardMaterial`, round 4; per-kind parameters in `CARD_P`, round 5): `twig` and
`leaf` = alpha-to-coverage, alphaTest 0.3, writes depth (`leaf`: the card's own normal, foliage
colours kept, see Round 5);
`conifer` and `crown` = alpha-blended, no depth write (no coverage dots at any distance), drawn after
the twig cards (renderOrder 0.5 / 1). All: camera-facing shading normals, little specular, the sky
light partly desaturated (a twig mass is lit by the snow too: no navy), premultiplied atlas, alpha
compounded with the mip level and towards the sun, less haze in front of them towards the sun plus
a thin forward-scatter rim, fade-out when a card turns edge-on and (crown) where its texture is
magnified; the horizontal crown-top cards (normal straight up) only show from well above; left out
of the shadow / AO pre-pass (`noAO`); their own program cache keys. All quads are drawn by `finalizeSigns(scene)` (called
by `buildTown`): ~8 draw calls for every sign, twig and crown card in town. If the UI font loads
late the atlas redraws. `rebuildSigns(scene)` re-finalizes after adding faces (look-dev only).

## Deviations / additions to DESIGN §6

- Ove's area has **4 rows of 5** units (20 houses) + a 9-garage länga, not "~5 rows / ~10 garages":
  62 m blocks don't fit more with real gardens. The neighbouring radhus blocks (2,3) and (3,4)
  continue the area (their walkways line up with Ove's across zebra crossings).
- Landmarks added: `oveStart` (spawn), `mailboxes playground torg pond pulkabacke hospitalEntrance preschoolGate
  pizzeria dealerLot flowerShop` + 5 extra bus stops + forest spots.
- `trailer: true` on `patrickCar` is data only; the cars agent attaches the trailer.
- No `bouncers` (Swedish villas' trampolines are snow-covered solids).
- Snow banks are visual only (no collision): you wade through them; cars too.

## Performance (1280×720, RTX 4070, headless, my copy with the current cars/people)

`wperf` (camera poses in tools/scenarios/world.mjs), round 3 (re-measured at the start of round 4)
→ round 4. All passes (shadow cascades + AO pre-pass + main):

| pose | fps | draw calls | triangles drawn | renderFrame CPU |
|---|---|---|---|---|
| start (Ove's walkway) | 60 → 60 | 1202 → 1235 | 10.75 M → 6.72 M | 7.8 → 9.8 ms |
| lot_e (Ove's lot) | 60 → 60 | 1398 → 1426 | 11.52 M → 7.19 M | 8.5 → 9.1 ms |
| centrum | 61 → 60 | 562 → 640 | 6.35 M → 4.20 M | 4.9 → 7.2 ms |
| hospital | 60 → 60 | 414 → 442 | 4.72 M → 3.00 M | 5.2 → 6.2 ms |
| street_trees | 61 → 60 | 1282 → 1347 | 10.43 M → 6.33 M | 9.6 → 8.4 ms |
| drone_nw | 60 → 61 | 1420 → 1442 | 13.16 M → 7.91 M | 7.3 → 9.0 ms |
| aerial | 60 → 60 | 1837 → 1935 | 12.70 M → 5.91 M | 8.3 → 10.7 ms |

(CPU ms is noisy, ±2 ms between runs; the extra draw calls are the split card pages / forest
sectors, which are culled most of the time.) Town build 2.1 → 2.3 s. `wtris` (new scenario) hides
one mesh category at a time; at drone_nw: blocks 4.03 M, cars 1.29 M (cars agent), props 0.89 M,
people 0.76 M, signs/cards 0.23 M, ground 0.22 M, silhouettes 0.18 M, forest belt 0.17 M. Scene
triangles: blocks 2.32 M (3.48 M), forest belt 0.46 M (0.90 M), conifer cards 0.41 M (new), twig
cards 0.11 M, crown cards 0.04 M. Per tree kind (count / template tris each): full spruce 345 /
~800 + cards, small spruce 120 / ~380, lite spruce 1032 / ~330, birch 392 / ~810, lite birch 223 /
~140, pine 65, lime 60. Snow geometry ~0.58 M (street banks 0.24 M, banks 0.08, chunks 0.07,
hedge caps 0.08, fringes 0.05, piles 0.03, rubble 0.02).
Further levers: the props (`props.js`: 0.9 M drawn, mostly bikes / snowmen / mailrows /
woodfence instances — LOD or shadow-off for small ones), cast: false on more small block parts,
`wtris` to see what a pose costs.

**Round 5** (`wtris`, millions of triangles drawn, all passes; start of round 5 → end; "world" =
all minus cars minus people, which belong to the cars / people agents):

| pose | all | world | blocks | props | signs/cards | cars | people |
|---|---|---|---|---|---|---|---|
| start | 7.88 → 7.37 | 4.82 → 4.36 | 3.09 → 2.68 | 0.91 → 0.56 | 0.31 → 0.47 | 1.30 → 1.25 | 1.76 → 1.76 |
| lot_e | 8.15 → 7.78 | 4.93 → 4.55 | 3.16 → 2.82 | 0.90 → 0.56 | 0.29 → 0.44 | 1.71 → 1.72 | 1.51 → 1.51 |
| drone_nw | 8.98 → 8.48 | 5.86 → 5.55 | 4.05 → 3.66 | 0.93 → 0.64 | 0.27 → 0.36 | 1.56 → 1.41 | 1.56 → 1.52 |

**drone_nw is 8.48 M, over the round-4 budget of 8 M**: the world's share is down from 5.86 M (round 4
and start of round 5) to 5.55 M despite the new content (leaf walls, spruce fronds, the tractor),
but people went from 0.76 M (round 4) to ~1.5 M and cars from 1.29 to ~1.4-1.6 M since round 4.
Levers used this round: thin tree branches / twigs (r < 3.5 cm in the templates: most of a birch's,
lime's or garden tree's triangles) moved to per-block `twigs##` meshes with no shadow and no AO
pre-pass (blocks −0.45 M at drone_nw); props instanced per 200 m cell (3 × 3 grid) for the common
types, so the main / AO / shadow passes only draw nearby cells (−0.27 to −0.35 M); lite spruce
masses back to 8 spokes. wperf (end of round 5): start 60 fps, 1405 calls, 7.8 ms; lot_e 60, 1626,
8.4 ms; centrum 60, 721, 5.8 ms; hospital 61, 455, 5.0 ms; street_trees 60, 1523, 7.8 ms; drone_nw
60, 1730, 9.8 ms; aerial 61, 2295, 10.6 ms (calls up from round 4's 1235-1935: the per-cell props,
the twigs meshes, the leaf page, plus the other agents' cars/people). Town build ~2.5 s (the hedge
and frond textures are painted at load). Scene: conifer cards 0.72 M triangles (fronds), leaf
cards 0.04 M, twig cards 0.09 M. Next levers if the budget must hold with the current cast: street
snow banks (0.24 M scene, in the casting builder) coarser or non-casting, full-spruce mass spokes
16 → 12, people / cars LODs.

## Validation (`tools/scenarios/world.mjs`: `validate`, `wperf`, `wviews`, `meshstats`, `atlas`)

Checks: every violation spot (1.9 × 4.8 OBB vs solids with top > ground + 0.6 and vs parked cars;
ground level; ≥ 5.5 m from road centre lines), every `carfree` spot inside `carFreeZones`, every
landmark (not inside a solid, ground level), boxes (free of solids), collectibles (a free standing
point within 1.2 m whose floor is ground or a step/stand/mound and within pickup height), pedLoops
(sampled every 0.5 m, a 0.35 m circle hits nothing taller than a step), and car sweeps along routes
(Saab out of the lot to the street, into Ove's garage, Patrick's route lot → cross walkway → torg →
parvanehDrive incl. a 9.5 m tail, hospital approach to `hospitalSpot`, dealer approach).
Since round 3 the routes also run against parked cars (the car that drives them excepted), boxes are
checked against parked cars, spots against each other by OBB overlap, and verge trees within 20 m
of a junction (at < 7.5 m from a road centre line) are reported. Routes: saabOut, garageIn,
patrick (lot → cross walkway → torg → walkway), hospital (west entrance → hospitalSpot),
hospitalCanopy, dealer, preschool (×2), gas (east entrance → shop door), gasNorth.
Result (round 3): 0 problems, all routes clear, 0 pedLoop hits, 0 verge trees near junctions.
`traffic` (base shot.mjs): 22 cars, 0-1 stuck over three runs (the AI's; one ended up circling on a
sidewalk corner), avg 10.3-11.0 m/s. `wviews` renders ~60 named camera poses (`WVIEWS=a,b` for a
subset) to `out/w_*.png`; `wperf` measures fps + `__stats()` at 7 poses; `wtris` (round 4) the
triangles drawn per mesh category at 6 poses (`WPOSES=a,b`); `meshstats` lists triangles per mesh
kind, `treeStats` (per tree kind: count and triangles) and `snowStats`; `atlas` dumps every sign
atlas page to `out/atlas_*.png`.
Round 4: validate 0 problems (135 spots, 22 zones, 67 landmarks, all 10 routes clear, 0 pedLoop
hits, 0 verge trees near junctions); traffic 22 cars, 0 stuck, avg 12.4 m/s; story ends `#7 idle`,
no errors.
Round 5: new checks — `dealerFinish`, `graveFlowers` required (graveFlowers 1.0-1.7 m ahead of
sonjaGrave at plinth height; dealerFinish in a lane of the street in front of `dealerLot`), boxes
`adrianBay` and `hospitalDrop` (free of solids and parked cars), routes `hospitalDrop` (west street →
Akut driveway → apron → the drop spot), `hospitalDrop2` (from the car park), `adrianBay` (lot
entrance → aisle → into the bay), `dealerFinish` (northbound lane from z 114 through the finish to
z 46); every colliding tree has a sane crown (`trees`/`treeCrowns`), every camBlock is a box.
Result: 0 problems (135 spots, 22 zones, 53 landmarks, all 14 routes clear, 0 pedLoop hits, 1467
trees with crowns, 809 camBlocks); traffic 22 cars, 0 stuck, avg 12.1 m/s; story ends `#7 idle`,
no errors; 60 fps at every pose. New scenario **`wcam`**: the follow camera swept round at three
spots by Rune's ramp (`WYAWS=` to choose yaws, `WNOSHOT=1` for numbers only) plus three dialogue
framings (`cam.frame`) there; prints where the boom ended, shots `wcam_*.png`.

## Round 2 (review fixes) — what changed

- **Hedges** (`kit.hedge`): lofted bodies (bulging sides, rounded top edges, a top that wavers a
  few cm, rounded ends) with an overhanging, broken snow cap. `fineTex` now re-centres and turns the
  procedural coordinates (far from the origin, ×10 world coordinates ran out of GPU float precision
  and the foliage noise became blocky "pixel camo"). Kinds: evergreen (`HEDGE_GREEN`, fine 9),
  `bare` (oxbär/hagtorn in November: a dark core wrapped in twig cards along the sides, fringe cards
  across the top, a few 3D twigs) and `square` (Ove's). Radhus fronts mix green / bare / picket.
- **Trees**: birches have a crown from 0.3 H of 14–20 thin arching, drooping limbs (3 segments) with
  hanging twigs plus 4–5 crossed twig-haze cards; lime/maple (`bare` = `lime`) forks into secondary
  branches and twigs with dome cards; pines have 10–13 limbs with a dark lumpy core per clump wrapped
  in needle-tuft cards, an asymmetric crown, darker colour (pines stay at the forest edges);
  garden trees get two cards.
- **Snow**: piles are one welded, noise-displaced icosphere shaped into lumps with a flattened top
  and grit at the foot (vertex colour); banks have a 9-point profile with a skirt that sinks into the
  ground, 0.5 m steps, short ramped ends and lumps. Walkway banks in radhus areas are continuous low
  ridges against the garden hedges (gaps only at paths; Ove's path is swept wide), also along the
  cross walkway; street banks run continuously on both verges (gaps at driveways, crossings, bus
  stops, spots); plowed piles at most junction corners.
- **Low roofs** (`kit.metalRoof`, `Frame.roof`): thin felt slab with painted fascia/verge boards and a
  gutter (garages, soprum, sheds, bike shed, shelters, vagnhall, carports, verandas, plant room);
  gable metal roofs are 6 cm with painted ridge flashing; no ribbed edges anywhere.
- **Streets**: rounded kerb corners (KR 5 m, slab + granite stone arcs, `isRoad` agrees), avenue
  trees in the verges (birch or lime per road, one every ~13 m alternating sides), drain grates and
  manhole covers, crossing-sign posts kept out of the kerb arcs, open-front bus shelters.
- **Places**: shop fronts are recessed with see-through glass, a lit interior (glowing back wall,
  shelves with goods, light strips), posters and ÖPPET signs (centrum, gas); newspaper stand, ad
  pillar, piles on the torg. Gas: service corner (air & water, vacuum station), lighting mast, tyre
  rack, flags, a car at a pump, banks. Bilhallen: see-through showroom with two cars inside, six more
  cars with price boards. Hospital: stair towers, plant room, big canopy with "Sjukhuset ·
  Huvudentré", blue wayfinding posts, smoking shelter, bike racks, AMBULANS bay. Church: granite
  plinth, round-arched windows with glazing bars, panelled oak door in a granite surround, lychgate,
  lanterns along a shovelled path, fieldstone wall (rounded boulders, board roof). Cemetery graves
  and the planters have granris sprigs. Preschool fence is see-through welded mesh. Lamellhus have no
  ground-floor doors on the back; balconies have sheet-metal fronts with rails. Pond and forest
  rocks are rounded boulders.
- **Ove's area**: spawn landmark `oveStart`; 12 residents' cars + the association's snow tractor in
  the lot (a drivable car since feature snotraktor: `parkedCars` 'tractor', nose out in the last north
  bay at the aisle's dead end, the bay beside it free), a sandlåda, a kicksled; named mailboxes. Cues per house: Ove — square hedge, swept path,
  home-made PARKERING FÖRBJUDEN board on his shed, thermometer, broom; Parvaneh — lit window star,
  snow racer, toys, snowman, moving boxes; Jimmy — coloured light strings on the shed and round the
  door; Anders — anthracite door, glass canopy, glowing LED number, dark stone paving, patio heater.
- **Signs**: soprum labels white on colour, Bensin & Service / shop names on their band colour,
  KOMMUNHUSET on a dark band, Förskolan Solrosen above the windows, C2 shows a motorcycle,
  "Saknas: grå randig katt" (was English).

## Round 3 (review fixes) — what changed

Review r2 (7/10) asked for trees, snow, hedges, spruces, a hill slot, roof/facade vernacular and less
empty asphalt, plus 10 minors. What was done:

- **Trees are templates** (kit.js `templateOf` / `placeTemplate`): every kind is built a few times
  (birch 8, spruce 8, small spruce 5, lite spruce 5, pine 6, lime 6, small 6, thuja 5, lite birch 4,
  lite pine 3, lite lime 3) with its own seeded randomness, in its own frame; a placed tree merges a
  rotated, scaled, slightly leaning copy (positions / normals transformed, colour + triplanar
  attributes and the index shared) into the block builder, and its cards are placed in world space.
  Same draw calls as before, a fraction of the build time. `tree()` returns `{ meta, s, sy }`
  (a spruce's meta: `H, R0, base, top, R(t)`; the centrum Christmas tree hangs its light string
  from it). Spruces under scale 0.6 use the `spruceS` template (fewer, wider-spaced whorls).
- **Far crowns** (signs.js twig/crown material): the pale-blue glitter was (a) an up-leaning card
  normal seen edge-on mirroring the sky at grazing Fresnel and (b) mip-averaged thin strokes
  leaving the bright sky / snow / haze showing through sparse A2C samples. Now: the shading
  normal faces the camera (leaning up 0.25), specular is mostly removed and direct diffuse halved (a
  twig mass shades itself); the atlas pages are uploaded premultiplied and un-premultiplied in the
  shader (colour clamped: 8-bit low-alpha texels are noise); the alpha is compounded as if
  `1 + 2.0 · mip level` layers overlapped (0.9 for the twig page), and up to 2.5× more when looking
  towards the sun (backlit crowns read as dark silhouettes); crown faces carry a faint fine-twig
  fill (density in the mips); a horizontal `crowntop` card per birch / lime keeps the mass in drone
  and aerial views where the upright cards turn edge-on; crown cards fade where their texture is
  magnified (< ~10 m) instead of at a fixed distance. **Bug fixed**: gfx.js gives every
  MeshStandardMaterial the same program cache key, so the twig and crown materials silently shared
  one program; they now have their own `customProgramCacheKey`. Crown colour is a warmer
  purple-brown (`rgb(78, 57, 52)`).
- **Near trees**: birches have side branches, thin real hanging twigs (r ≤ 6 mm) and curtains of
  fine hanging twigs as small `birchhang` cards along the outer half of every limb (crisp close up,
  ~5 mm/texel); limes and garden trees get `limespray` cards at the branch ends; main birch limbs
  are 5-sided.
- **Spruces**: each whorl is a closed, lobed skirt (`skirtGeo`): per spoke a profile from the stem
  over a slightly arched top to a drooping tip and back underneath; 4-10 main branches make deep
  lobes (the long ones droop most), so the outline is star-shaped and the lower edges jagged; whorls
  every ~0.68 m (×s), random rotation, a fuller side, a leader; 'foliage' in a dark blue-black green
  (`0x26342a` …) darkened inside and underneath; snow as short lumps on the upper side of some
  branches (more low down), plus the foliage shader's own cap. Lite ones (forest belt beyond 13 m
  from the outer sidewalk): 8 spokes, 4 lobes, deeper overlapping whorls every ~1 m.
- **Snow**: piles are low and wide (h ≤ 0.42 r), broken into Voronoi chunks, one or two plough-cut
  faces on their `face` side (the street / aisle they were pushed from: junction piles face the
  junction, lot piles the aisle), grit-grey at the foot and on that side, mottled, studded with
  slab-like chunks and with loose chunks around. Banks change height ±40 % over 1-2 m, have a steeper
  dirty side (`o.dirty`, the asphalt they were plowed from), mottling, half-sunk rubble on the crest
  (`o.rubble` per metre), broken chunks at the ends instead of a smooth taper; the long street banks
  are `coarse` (fewer points) and lower (0.26-0.36 m). `snowFringe` lays a ragged rim of trodden
  snow (5-45 cm, jagged) where lawns meet the walkways and the garden paths in radhus areas and along
  lot kerbs, so no boundary is a ruled line. Ground `flat()`s are horizontal quads now (their 1-2 cm
  side faces read as black lines across the snow, e.g. in the park).
- **Hedges** (evergreen): rows of plants (one every 0.62-0.78 m, each bulging, with its own height,
  grooves between); a dark body (the shadowed inside) covered by full-height `hedgegreen` sprig cards
  on both faces whose top fringe pokes over the clipped line, `hedgegreentop` cards across the top;
  winter bronze-olive patches (`o.bronze`; cemetery thuja 0.85); `Frame.hedge` now always lofts along
  the long side (the cemetery's and the radhus areas' north-south hedges were 0.9 m long lofts 61 m
  wide: flat painted walls). Ove's square hedge keeps its spirit-level look with the sprigs.
- **Hill slot**: outskirts.js `Math.sign(0)` dropped the cells centred on x = 0 / z = 0; fixed.
- **Roof / facade vernacular** (kit `snowGuard roofLadder ventStack downpipe`): radhus rows get a
  snow guard over the walkway eave, a roof ladder on every second house, a vent stack per house on
  the back slope, downpipes front and back on every second house; villas (`gableHouse` `vern`) a
  snow guard, a ladder, a vent, four downpipes; lamellhus snow guards on both eaves, ladders at the
  stairwells, vents, downpipes beside the entrances and between balcony bays. Eave fascias are tall
  enough to cover the roof slab's cut edge (no tile / rib barcode).
- **Paved places**: the petrol station forecourt shrank to ~43 × 44 m with snowy verges round it,
  kerbs, two kerbed islands with shrubs and lamps, a car wash queue lane with its sign, trailers for
  hire on a gravel pad (`trailer`), pallets of washer fluid and firewood, gas bottles, slush, piles
  pushed off the forecourt; centrum got a trolley shelter, a grill kiosk (`korvkiosk`), bike racks,
  benches, planters, kerbed islands with trees at the row ends and mid-row, ~45 % of the bays taken,
  slush in empty bays and along the edges; the hospital car park islands with trees / a lamp, ~40 %
  taken, slush, piles; Bilhallen kerbed planting along the street, a 'Veckans bil' podium, slush, the
  approach to the showroom door kept clear (a car for sale stood in it). Kit: `island`, `trailer`,
  `slush` (exported from places.js).
- **Minors**: glazed see-through entrance vestibules (aluminium frames, ≤ 1.15 m panes, sliding door
  leaves a little open, sensor, mat, a lit lobby with a desk and a plant) at the hospital and
  kommunhus; Jimmy: a light string along his whole eave, a light-tube reindeer, energy-drink crates;
  Anders: the glass canopy on chrome brackets and tie rods, box balls in planters; Ove's board
  1.4 × 0.8 m at eye height; back gardens: 1-3 of compost / covered furniture / covered grill / bird
  table / small greenhouse / dryer / playhouse / garden tree / sled / snowman, S rows' back fence a
  plank fence, a low picket fence or a hedge; BLOMMOR under the kiosk eave, the Kyrkogården plaque on
  the gate pillar, Förskolan Solrosen white on green; mailbox-stand and notice-board roofs painted
  (no barcode); manholes and grates dull dark cast iron ('rubber'); football goals with see-through
  net cards (`net`); shopping trolleys as wire baskets; the park's slab risers gone (flat quads);
  church wall of three irregular courses of grey / pink / dark stones of mixed sizes over a dark core,
  lichen; Sonja's stone with "1966 – 2025" under the name, a gravlykta (black frame, glass, a burning
  candle), granris as needled sprig cards (`sprig`) over a dark bed, a red rose.
- **Contract nits**: runeHouse at the ramp foot; oveGarageSpot 2.3 m wide and clear of the shelf;
  no verge trees within 20 m of a junction (one stuck traffic car in r2 was against one); Ove's
  lot lamps stand on the bay lines (they were inside bays and clipped parked cars); the Förskolan
  bus stop out of the drop-off entrance.
- **New for main.js**: `surfaceAt`, `fx.surfaceAt`, `roadNames` (+ street-name signs), `camBlocks`.

## Round 4 (review fixes) — what changed

Review r3 (7/10: "architecture an 8, vegetation a 5") asked for crowns, spruces, near birches, the
flat-roof bug, snow piles/banks, performance and nine minors. What was done (files: kit.js, signs.js,
buildings.js, streets.js, places.js, ove.js, outskirts.js, town.js, props.js):

- **Deciduous crowns** (signs.js `cardMaterial`): crown cards are now **alpha-blended** (no
  alpha-to-coverage dots, no sky dots through them at 25-80 m; no depth write, drawn after the
  depth-writing twig cards); the mip compounding is gentler (1 + 0.6 · lod) and towards the sun up
  to 2.6× denser; **less of the sun-tinted haze in front of cards that are looked at towards the
  sun** (a backlit crown stays a dark purple-grey mass) and a faint forward-scatter rim where it
  thins out; the skylight on cards is 75 % desaturated (no navy balls from the drone). The
  **crown-top card** has no underside any more and fades in only when looked at from well above
  (`-dot(view, up) > 0.42..0.75`): no tan plank from the street; it is a soft, warm twig-brown mass
  (≈ 40 % cover) so drone views read brown-grey.
- **Spruces** (kit.js `spruce`, all templates): a **tiered inner mass** in `'spruce'` (per whorl a
  lobed ring wide at the foot of the tier with jagged drooping points, narrow at the branch base; it
  casts the shadow, and no pole or sky shows through anywhere) plus **branch cards** on a new
  blended `conifer` page: per whorl 3-8 branches, each a side-view card skewed to the branch's droop
  (`sprucebranch`: pendulous needled combs hanging from the branch, the Norway spruce's curtains)
  and on near trees one across the tip (`sprucetuft`); half the cards carry thin lumpy snow caps on
  the branch (white above, blue-grey below). Needle textures are drawn needle by needle (no
  foliage-noise camouflage). Lite (forest belt beyond 13 m from the outer sidewalk, and the inside
  of the forest blocks) uses the same build with fewer whorls / branches. The old skirt plates
  (`skirtGeo`) are still in kit.js but unused by spruces.
- **Near birches**: limbs arch and droop in 4 segments (droop accelerating), taper to ~5 mm, white
  birch bark only on the first segment, purple-brown twig bark beyond; the top of the stem is
  grey-brown; `birchhang` cards are short (0.35-0.6 × 0.5-0.9 m), placed every ~0.6 m along the
  outer half of each limb, alternately along / across, drawn as sparse warm purple-brown strands
  (≈ 1/3 cover); one side branch per limb, a real hanging twig on every other limb.
- **Flat roofs** (buildings.js `flatBuilding`): no steel cap slab; a 0.3 m painted coping round the
  parapet (in `capC`) and inside it an even field of snow (`'snow'` box) with 1-4 roof hatches, vent
  pairs or fan units (seeded by position). Same for the Bilhallen showroom and the office floor over
  the centrum Livs.
- **Snow** (kit.js): plough lumps are rounded, half-sunk, grey icospheres (no slabs / ice cubes),
  1-3 per pile; piles have a third noise octave (lumps at ~0.3 m); grit is now clearly visible
  (`gritShade`: towards ≈ 0x8f8a82 on the lower third and a spray band on the plough side, `GRIT`
  much darker); banks have lumps at 0.3-0.6 m in height and sideways, taper over 0.45 m with a
  ragged outline in plan (no vertical ends), coarse street banks are long runs between driveways
  (gaps now and then) whose height steps by ±50 % in 3-8 m pushes (`o.pushes`), with a grey-brown
  spray band on the road side and a third of the rubble; fringes taper to zero at their ends.
- **Performance**: see the table. Levers used: lite spruce templates inside the forest blocks; the
  forest belt in 24 sectors and the card pages in 3 × 3 meshes (frustum culling works); far meshes
  (> 240 m from their bounding sphere: blocks, ground, forest belt, roads; always: hills,
  silhouettes) leave the AO / shadow pre-pass (`town.js tickTown`, `farMeshes`); windows (`win`,
  `winLite`) and snow fringes go into the non-casting ground builder (`F`; `onF`); coarser street
  banks (0.48 m rings, 6-point profile), hedge loft rings 0.3 m, fringe 0.24 m, fewer birch twigs.
- **Minors**: the verge strip and walkway in streets.js are horizontal quads (`flatQuad`; the
  yellow-green kerb line is gone) and the straight kerb's top is raised to the strip's level (no dark
  slot); evergreen hedges: dense small sprays (`hedgegreen`, `hedgegreenlow` rows on tall hedges),
  thuja (bronze > 0.6) gets flat scale-leaf fans (`thujagreen`), fineTex 8, the clipped top steps
  ±8 cm every 2-4 m; the cemetery's north hedge stops 0.25 m short of the gate pillars (plaque
  readable); granris: a small mid spruce-green (0x2f4a2c) base, outer sprigs snow-dusted; Jimmy: a
  pair of light-tube reindeer drawn as outlines (body with rump and chest, neck, head and muzzle,
  ear, branched antlers, jointed legs, tail; one grazing), warm white; gable tile ridges (kiosk and
  all villas) in `'painted'` (no tile barcode); centrum / kommun plazas lighter paving with snow 0.4
  (no navy speckle), slush tracks (grey blobs along walking lines), benches, bike racks with bikes,
  planters, an A-board; park paths are bands of trodden snow with ragged rims (`trodPath`); petrol
  station: a wash entry door (slatted roll-up in a blue frame, red / green lights, pay post), a blue
  band, high windows and a price sign on the wash, a car queuing for the wash, A-boards, bins and
  paper-towel stands at the pump islands.
- New kit: `flatQuad(G, color, x, y, z, w, d, yaw)` (kit.js), `addQuad` (signs.js), places.js
  `aBoard`, `slushTrack`, `trodPath`.

## Round 5 (story / systems requests, in-game look) — what changed

Files: places.js, ove.js, kit.js, signs.js, props.js, town.js; tools/scenarios/world.mjs.

- **Landmarks for the story**: `dealerFinish`, `adrianBay` (+ "Reserverad" plate, the bay kept
  free), `graveFlowers`, `hospitalDrop` — see the table and "For main.js". The hospital got an
  **Akut driveway**: the Akut wing stands between the west street and the canopy (a car heading
  straight for the canopy from the x = 120 road ran into the wing's wall at x 129, its centre at
  x ≈ 126.6), so a dropped kerb now crosses the sidewalk just south of the wing (z −162..−155.5,
  kept clear of banks), a paved apron joins the car park to the canopy (it was a lawn strip), and a
  blue post at the entrance says "↑ Akutmottagning / Avlämning".
- **Camera data**: tree colliders carry `crownR / crownBottom / crownTop / species`; camBlocks for
  Rune's ramp handrails, every path lamp, and roof boxes that include the gutter. Rune's handrails
  are round tubes now and their posts meet them (the posts were sloped the wrong way: tall at the
  low end, short of the rail at the top).
- **Evergreen hedges** (the black speckle of reviews/errand_katten_0.png): a new card page **`leaf`**
  (alpha-to-coverage like `twig`, but lit by the card's own up-leaning normal so the sunny side is
  brighter, little desaturation of the sky light, 0.6 of the direct light, no colour clamp, fades
  only when almost edge-on). The faces `hedgegreen(low)` / `thujagreen(low)` (256 × 320, ~3 mm/px)
  are drawn by `leafWall`: an opaque wall of small leaf clusters (shadowed hollows, lit tops, a few
  light shoot tips, sprays or thuja fans for the near detail) below a clipped line at 16 % from the
  top, a sparse low fringe above it; thuja variants 2-3 with bronze-olive patches. `kit.hedge`
  places one card per ~0.75 m on each face just outside the body's widest point under it
  (alternately 1 cm proud, turned a hair), a lower row on hedges over 1.25 m, a card across each end;
  the evergreen body's ends hardly round off any more and it is lighter (it shows only on top).
  Sparse sprays over the dark body had mip-mapped into black-and-white dither at 5-15 m.
  Bare hedges: a haze of fine twigs and more stems in `hedgeside`, a lighter core (`HEDGE_BARE`).
- **The snow tractor**: was static scenery here (ove.js `tractor()`, merged into the block with a
  'vehicle' solid); since feature snotraktor (2026-10-15) it is a car Ove can drive, built in
  actors/carmodels.js (`tractorDetails`, after this one's design: lugged tyres on orange rims,
  mudguards, a bonnet with grille, louvres and headlamps, a glazed cab with seat, wheel and dash, the
  beacon and work lamps, exhaust stack, mirrors, step, the curved mouldboard on its push frame with
  rams, marker sticks, the sand spreader) and placed by `bf.car('tractor', ..., { name: 'tractor' })`
  (notes/cars.md, *The snow tractor*).
- **Spruces**: a new `sprucefrond` conifer face (a branch seen from above: axis, forward-angled side
  shoots, needles, light new growth, snow lumps on v 2-3) laid on every branch of every spruce (lite
  too); the tier mass is slimmer (near 0.44 R at a tier's foot, lite 0.66 R), darker (a shadowed
  core) with less shader snow on near trees, and its wide rings are star-shaped (every other spoke a
  long low branch tip; near 16 spokes, small 12, lite 8), so tiers are pleated with zig-zag rims;
  only a quarter of the side cards carry snow (half made dashed white lines along every tier).
- **Performance**: thin tree branches out of the shadow / AO passes (`twigs##` meshes), props per
  cell; see Performance.

## Round 6 (final whole-game review fixes) — what changed

Files: kit.js, signs.js, ove.js, rowhouse.js, buildings.js, places.js, props.js;
tools/scenarios/world.mjs. (town.js and the new batch.js belong to the rendering fixer this round.)

- **The black notch on the first frame's hedge** (Ove's square hedge at x −5.2..−3.2, z 7: its west
  end faces the spawn camera): `loft()`'s end caps fanned over the ring's consecutive points without
  the closing triangle, so an open profile (a hedge's: its bottom edge is not in the ring) left a
  V-shaped hole in each cap, and the cap bulged 4 cm out through the end card (1.2 cm out) as a dark
  patch. All caps are closed now, and evergreen bodies have no cap bulge.
- **Evergreen hedges** (`kit.hedge`): ends rounded in plan, a half-ellipse up to 0.45 m long
  (`eL` = min(0.45, w/4, max(0.24, 1.05 × half-width)); Ove's square hedge 0.14 m, only its corners)
  and 13 % lower at the tip, with the rings refined there. Four leaf cards tangent to that ellipse
  (each 1.3× its 45° arc) close each end instead of one flat card; the side cards cover the straight
  part only; the body's sides are no longer jittered (they poked through the cards as dark seams).
  **Sprigs proud of the face**: ~1.3 per metre of hedge (Ove's 0.5, shorter) leaning out of a face at
  25-55° and 12-37° up, at mid height or near the top (faces `hedgesprig` / `thujasprig`), so a
  hedge's silhouette is broken. Ove's hedge has no shoots over its clipped line (the `…low` faces,
  flush with its top). `hedgegreentop` sprays across the top: one card per 1.6-2.4 m (was 0.75-1.05),
  40 sprays (was 130), lighter.
- **Leaf texture** (signs.js `leafWall`, `leafRGB`): every colour of the leaf walls, their sprays and
  fans and the top sprays goes through `leafRGB`: pulled towards the mid green in linear light (×0.62:
  the darkest hollows are ~0.6 of the mid-tone instead of ~0.3) and 20 % less saturated; cluster
  brightness varies less, and the frayed fringe over the clipped line is less than half as dense
  and lighter (dark leaves over the white cap read as speckle). From 3-8 m a hedge is a soft leaf mass,
  in the shade a muted dark green.
- **Bare hedges** (oxbär): lighter grey-brown twigs (`TWIG` rgb(110, 98, 88), core `HEDGE_BARE`
  0x66584d, 3D twigs 0x5a4c42), a `hedgeside` card across each end (the bare core showed), 48 twigs
  per fringe card (was 70).
- **Lamps under the bloom threshold**: `kit.glow(hex, L)` scales a 'light' colour so that its emission
  luminance (vertex colour × 4, linear) is at most L; the bloom pass starts at 2.6 and a lit face in
  the sun adds its diffuse light on top. Parvaneh's paper star 0.75 with a 0.1 m heart at 1.25 (it
  was 2.55: a white starburst behind every dialogue at her door); Jimmy's star and the balcony stars
  0.8; porch lamps (`lampBox`) 0.55 behind a black glazing cross (a lantern, not a white slab); Ove's
  garage tube 1.5 (it smeared across the ceiling); the garage rows' door lamps 0.8; apartment entrance,
  stairwell and window lights 1.0-1.4; the hospital and petrol station canopy lights 1.4, the kiosk
  1.0; Anders' ground spots 1.5; light strings 1.8; Advent candles 2.0.
- **Cemetery gate** (`cemeteryBlock`): both leaves open inwards by 1.25 rad, and every part of a leaf
  lies on one line from its hinge (bars at (gx − s·cos(ga)·t, −30.5 + sin(ga)·t), rails turned to
  `atan2(−sin ga, −s·cos ga)`, centred at t = 1.1). A leaf has hinge and latch stiles, nine bars with
  spear tips, top / middle / bottom rails and hinge straps. The Kyrkogården plaque (street face of
  the west pillar) is clear.
- **Planters** (`props.planter`: centrum, Kommunhuset): a dark needle bed, 18 spruce boughs
  (`boughGeo`: a stem with pairs of needled side shoots, single-sided, facing up) radiating from the
  middle and 3-8 cm over the rim, 11 shorter ones on top, four flat drifts of snow; no shader snow on
  the boughs (flat ones turned white). The nine dark snow-capped capsules read as someone lying on
  the block.
- **Snowman** (`props.snowman`): three lumpy balls of packed snow (`snowBall`: a welded icosphere,
  ±8 % noise, no two alike), flattened where they rest, not quite stacked straight; a packed-snow
  tint, the bottom ball grey with dirt and grit at its foot (`tintLast`); forked stick arms. Same
  footprint and height.
- **Twig-card crumbs against the sky** (signs.js): the fine-twig cards of tree crowns (`birchhang`,
  `limespray`) carry a per-vertex `cardFar` flag and fade out from 9 to 20 m (the blended crown haze
  carries a crown beyond that); at a distance their sub-pixel strokes were alpha-to-coverage crumbs.
  Card program cache key `:6`.
- **Text**: the notice board's cat note reads "Upphittad: grå randig katt. Ring Jimmy!" (day 4: "Den
  är ingens katt"); the petrol station's washer-fluid sign has a real minus sign (−18°). The notice
  board's three notices now face south (towards the mailbox fronts and the walkway entrance): they
  stood on the board's south side facing north, into the board, and could not be seen at all.
- **Tools**: `wviews` has `r6_*` poses (the first frame's hedge end, hedges in sun / shade / at 8 m,
  the thuja hedge and its end, Parvaneh's star and snowman, a porch lamp, Ove's garage, the garage
  row, the cemetery gate from both sides, a centrum planter, limes against the sky). New scenario
  **`wprobe`**: `WEVAL='<js>'` evaluates an expression in the page (async allowed) and prints its
  JSON; `WSHOTS='[{"name", "at", "look", "fov"?, "eval"?}]'` takes camera shots (`out/wp_<name>.png`).
- **Checks** (end of round 6): validate 0 problems (135 spots, 22 zones, 53 landmarks, all 14 routes
  clear, 0 pedLoop hits, 1467 trees with crowns, 809 camBlocks); story ends `#7 idle`, no errors;
  60 fps at every wperf pose (start 60, lot_e 59-60, centrum 60, hospital 60, street_trees 61,
  drone_nw 60, aerial 61). Draw calls unchanged (the sprigs are on the leaf page; the gate, planter
  and snowman parts merge into existing meshes). Triangles drawn (wtris, all passes) against the
  start of the round: blocks +0.08 M at start (2.68 → 2.76), +0.11 M at drone_nw (3.66 → 3.77; the
  hedges' rounded ends and closed caps), props +0.06-0.09 M (the planters' boughs, ~2 k each);
  signs/cards unchanged. Also smoke-tested against the rendering fixer's in-progress town.js /
  batch.js / gfx.js (start + views: renders, no errors).

## Phase 4, round 2 (last whole-game review) — what changed

Files: signs.js, kit.js, props.js, places.js, ove.js; tools/scenarios/world.mjs; DESIGN.md (the Saab's
colour). town.js / batch.js are the rendering fixer's (props.js uses `StaticBatch` as it is).

- **Granris** (`kit.granris`, signs.js `sprig`): the sprigs were flat decals in a 3-8 % albedo green
  over a dark box, black paper combs in the finale. Now: needles q 95-150 (half of them with a lighter
  tip), stem rgb(110, 86, 62); the face is on the **`leaf` page** (lit by its own normal); no box,
  two layers of sprigs instead (a jittered fan from the middle outwards plus a few at odd angles, then
  the round-6 random top layer), each lifted 1-5 cm and tilted (pitch ±0.12, roll ±0.18 rad), its
  normal leaning ~20° towards the low sun, and 1.7 × the indirect light (the snow under it; in a
  stone's shadow they were black). The shared `rnd` stream is used exactly as before (the new parts
  draw from their own generator), so everything built after a grave is placed as in round 6.
- **Planter** (props.js): needle bed 0x3a5236 with a little snow (was 0x26301f, a black void), boughs
  0x4a6a42 / 0x52734a / 0x43623c (were 0x2f4a2c…), six thin ragged drifts (`snowPatch`) instead of four
  3-4 cm white pillows.
- **Evergreen hedges** (`kit.hedge`, signs.js `addGrid`): the leaf walls are now **one cushion per
  plant and face** (`addGrid`, 4 × 3 cells on the leaf page): it stands just outside the body (never
  inside its lofted rings, which do not resolve the grooves) and bulges up to 4.5 cm × (0.6-1.2 per
  plant) at its own height, with ±1 cm lumps, its normals bent with the surface (×1.6 along, ×1.4 up),
  so the low sun rakes across a row of lumps (the normals from the grid's own neighbours). Plants are
  not all the same width (the plant coordinate
  `uOf(lx)` wanders by up to a third of a plant). Each plant has a **tone** (`cardTint`, leaf page
  only: ±12 % value, a little more or less bronze); the cemetery's thuja base tint is (0.68, 0.66,
  0.56) and its leaf textures are drawn 38 % desaturated (`THUJA_RGB`), hc 0x384432, bronze 1.0.
  Tall hedges get two stacked cushions per plant. The rounded ends: 4 grids whose normals follow the
  ellipse. All faces are the fringe-less `…low` walls; the `hedgegreentop` sprays are gone (their
  random numbers are still drawn); the sprigs stay below 0.72 of the height and are shaded like the
  face from both sides (`addQuad(…, nrm, tint, both)`: they were black arrowheads on the shaded side).
  **Snow cap**: a separate, finer loft (a ring every ~0.15 m), a third thinner (1.3-5.1 cm), its rim
  just outside the cushions' top edge, hanging 2-6.5 cm down and reaching out by a ragged 0-3 cm; the
  body's top now stays under the clipped line (it poked through as dark blotches). Leaf page lighting:
  **indirect × (1 + 0.5 (1 − |n·up|))** (the snow lights a hedge face from below; shaded hedges were a
  dark mass) × the card's own factor (`cardTint.a`). Card program key `:7`.
- **Sign / card atlas VRAM** (signs.js): each page is drawn on a 2048² work canvas while the town is
  built; `finalizeSigns` copies its used rows (`page.texH`, rounded up to 256 px, so mip levels 0-8 are
  the same as before) into the texture's canvas, releases the work canvas at once and the texture's
  canvas after its upload (`tex.onUpdate`). UVs use texH; the card shader's texel size comes from a
  uniform (`cardTexSize`). A page drawn into later gets its work canvas back with every face repainted
  (`work()`); the late-font path repaints into a fresh canvas of the texture's size; `rebuildSigns`
  disposes the old textures. `signPageImage(page)` (new) repaints a page for the `atlas` dump.
  **213 MB → 107 MB of texture memory, 160 MB → 0 of canvases** with the crop alone (10 pages:
  2048 × 2048, 1280, 1792, 512, 256, 256, 1024, 1024, 512, 1536); **101 MB** at the end of the round
  (the hedge faces with a fringe are no longer used: twig and leaf pages 768 high). Image: the same
  (`wsame` pixel diff, crop alone, within run-to-run noise at 12 of 13 poses; in the aerial view 295 px
  of 922 k differ by > 3 %: mip levels ≥ 9, texels of 512 px, on signs a fraction of a pixel wide).
  Also checked: `rebuildSigns` (look-dev) re-crops and the signs render; `atlas` dumps the pages.
- **Props baked** (props.js `bakeProps`): every prop's geometry moved to its place in one
  `StaticBatch` per surface (`props:<surface>`, ~14), each 80 m block's props one contiguous run with
  its own bounds; the batch draws the runs in view with one multi-draw per pass. Compact attributes
  as batch.js (Int16 normals, Uint16 colours, Int8 `trin`); the index stays on the CPU, the vertex
  arrays are dropped once uploaded. **Breaking** a prop rewrites its index ranges (`prop.ranges`:
  `[batch entry, first index, count]`) to its first index (zero-area triangles) with `addUpdateRange`;
  **respawn** restores the saved indices. `tickProps` walks only the broken ones. `?nobatch` or
  `&propinst` = round 5's instanced meshes (A/B). The procedural noise of surfaces that use the
  object-space position (snow edges, foliage) now sees world positions, so a prop's snow pattern
  differs a little from the instanced one (the planter's bed); nothing else changes.
  Measured (`wcalls`, EXCLUSIVE, two interleaved A/B pairs, `&propinst` → baked; calls of all passes):
  the props' own calls (shown − hidden) start 171 → 46, Ove's lot 172 → 41, Solrosvägen 154 → 41,
  centrum 129 → 39, drone_nw 198 → 35, aerial 222 → 14; whole frame (main/AO/shadow) start 570 →
  456, lot 681 → 558, street 460 → 349, centrum 381 → 287, drone_nw 701 → 539, aerial 518 → 310; the
  props' triangles (all passes, finer culling) start 0.40 → 0.19 M, street 0.36 → 0.16 M, drone_nw
  0.46 → 0.23 M. Render CPU (median of 160 frames; ±0.5 ms run to run): the props' share fell from
  ~0.5 to ~0.2 ms. `wprops`: kick → broken, ranges degenerate, respawn restores them; `smash` as
  before. ?nobatch / &propinst give the old path.
- **Spruces** (kit.js `spruce`, signs.js): snow on the branch / frond / tuft cards of near trees by the
  tree's own snowiness (0.35-1) and the tier's height (p = snowiness × (0.18 + 0.5 t)), not a quarter /
  half of all cards; the snowy variants carry 2-4 irregular clumps (fronds) or 2-3 lumps (branches,
  tufts) instead of rows of short dashes (the "stitching"). Near trees' wide rings droop a third
  further (jy 0.25 → 0.33 s), are wider up the crown (0.44 + 0.14 t) and the waists widen too
  (0.26 + 0.3 t²); the upper half's branches rise instead of drooping (dl − 0.85 smoothstep(0.5, 1,
  t)); three crossed `sprucetuft` cards at the stem under every whorl hang over the notch between
  tiers (conifer quads 357 k → 398 k). Against the light the top third still shows its tiers (less
  than before): the inner mass is a narrow column there. The forest belt (lite) is unchanged except
  for the clump textures.
- **Reindeer** (ove.js): an unlit white wire ('plastic' 0xe8e4dc, r 1.1 cm) with 14 warm bulbs
  (`glow(0xffe2b0, 0.5)`) along it, instead of a glowing light tube (white chalk scribbles by day).
- **Cemetery paths** (places.js): the main path and the entrance are shovelled gravel (`snow: 0`, a
  ragged trodden-snow rim); the cross and perimeter paths are trodden snow (`trodPath`). The half
  covered gravel was brown smudges between the graves in the finale.
- **Text**: "1966–2025" (unspaced en dash), "Bio / fredag 19.30", "REA / −30 %" (U+2212, NBSP), Ove's
  name plate "Ove & Sonja" on his door above the letter slot (beside the door it stood half inside his
  shed's wall).
- **Ove's Saab**: 0x34506e, a mid slate-blue metallic (0x1c2a44 was a black silhouette in shade).
- **Build time**: an evergreen hedge takes ~2.5 × as long to build (20 × 30 m thuja: 31 → 80 ms;
  green 23 → 51 ms), about +0.2 s for the town (townStats.buildMs 3.0 s → 3.4-3.8 s, noisy on the
  shared machine).
- **Checks** (end of the round, after pulling GAME): validate 0 problems (135 spots, 22 zones, 53
  landmarks, all 14 routes clear, 0 pedLoop hits, 1467 trees with crowns, 809 camBlocks); story ends
  `#7 idle`, no errors; `wprops ok`; `smash` breaks its prop; `wvram` 101 MB, canvases 0; 60 fps at
  every wperf pose; wviews (81 shots) no errors.
- **Tools** (world.mjs): `wsame` (the static world only, paused, cars and people hidden, frozen camera:
  for pixel diffs), `wcalls` (calls / triangles per pass and render CPU at six poses, with an
  interleaved props shown / hidden A/B), `wvram` (atlas pages: size, memory, canvases), `wprops` (a
  prop kicked with J must break, its ranges degenerate, and respawn with its indices restored; prints
  `wprops ok`); `cam()` also hides the title card; wviews has `p4_*` poses (kneel at Sonja's grave,
  the thuja, Parvaneh's hedge, a garden spruce at eye level / against the light, the reindeer, Ove's
  door plate, the Saab in the shade).

## Phase 4, round 2b (final verification polish) — what changed

- **Ove's Saab** (ove.js): 0x2c5596, a bluer, more saturated mid-blue metallic (r2's 0x34506e, HSL
  209/36/32, still read near-black navy from the chase camera). Cause: the 13° sun throws long shadows
  over most streets, so from behind the car is usually in shade or driving into the sun, and a dark,
  greyish blue lands in the grade's soft black point and shadow desaturation (gfx.js `black`,
  `sdesat`): the rear panel measured 18,27,49 (sRGB) in a building's shadow. Now 25,35,75 there,
  31,44,83 driving into the sun; the sunlit flank 99,157,213 (HSL L 0.61 S 0.58: a clear mid blue, not
  pastel; r2's colour was a greyish 107,147,176 there). Solid (non-metallic) paint of the same colour
  measured almost the same, so it stays metallic. The car's sun / shade contrast itself is the
  lighting's (sun 6.0 vs sky 0.62) and car.js's metallic base (its tinted sheen near the
  retro-reflection direction is what makes any blue light in full sun from behind); not changed.
- **Bilhallen's welcome sign** (places.js dealerBlock): it was 7.6 m wide on the showroom's back wall,
  7.5 m behind the glass front's 3.25 m mullion grid, so from anywhere on the forecourt one or two
  mullions crossed its text ("Välkom|men till Bil..." in the day-5 outro). It now hangs from the ceiling
  on two rods 0.3 m inside the glass, two lines "Välkommen till / Bilhallen" on a 2.6 × 0.95 m board
  centred in one 3.1 m pane (local x = sx0 + 4.5 × 3.25): no mullion reaches its text from up to 45°
  off the glass's normal. The back-wall band is gone (plain plaster behind the cars).
- **Spruce tops** (kit.js `spruce`, near trees only; the forest belt's lite trees are unchanged): the
  wide (foot) ring's droop was a fixed 0.33 s, so up the crown, where a tier is ~0.3 m across, its
  pleated rim hung like a pagoda's eaves; it now shrinks to 0.3 × that towards the top
  (1 − 0.7 sstep(0.45, 0.95, t)). Up the crown (sstep(0.45, 0.9, t)) the branches reach up to 35 %
  further past the inner mass and their side cards hang up to 60 % longer, so the top third's outline
  is hanging combs rather than the mass's tiers. No new cards, no extra r() draws (every tree,
  car and prop placed after a spruce is where it was). Better against the light, not gone: from 5 m
  the top metre is still the dark inner column, and a young spruce still reads tiered (as real ones do).
  Tried and dropped: widening the upper inner mass (+0.3 R) — a smooth, faceted black obelisk.
- **Tools** (world.mjs): `wsaab` (the Saab from the chase camera with Ove at the wheel: sun behind,
  into the sun, sun from the side, in a building's shadow — spots found by marching the collision
  footprints and tree crowns towards the sun — plus its sunlit flank and its bay; WSAAB_COLS=hex,...
  swaps the paint live for A/B, a trailing `s` = solid paint; checks out of the sun the rear panel
  reads blue (B ≥ 62, B − R ≥ 35) and the sunlit flank is not pastel (S ≥ 0.4, L ≤ 0.65), measured from
  the screenshot in the page; '[t] wsaab ok'); `wsign` (raycasts from 15 forecourt / street
  viewpoints to the sign's text against the glass front's triangles; the old back-wall sign fails 4 of
  them; '[t] wsign ok'); views `r2b_spruce_top`, `r2b_spruce_sun`, `r2b_sign`.
- **Checks** (GAME b96422f + these files): story ends `#7 idle`, no errors (the day-5 outro's first
  shot shows the sign whole); start 60 fps, no errors; validate 0 problems (135 spots, 22 zones, 53
  landmarks, 1467 trees); title no errors; `wsaab ok` (rear panel in the shade 25,35,75, into the sun
  31,44,83, flank in sun L 0.61 S 0.58); `wsign ok`; wviews (r2b, p4 spruce, start, dealer) no errors.

## For main.js / camera.js / the systems agent

- Spawn the player at **`oveStart`** (my copy: `lm('oveStart')` with a fallback to `oveHouse`).
- Parked cars with `indoor: true` (showroom) want `snow: false`; `podium: true` (Bilhallen's car of
  the week) stands on a 0.2 m podium (`car.place` uses `groundAt`, so it sits on it).
- **`surfaceAt(x, z)`** (town.js / surface.js) → `'snow' | 'asphalt' | 'paving' | 'gravel'`: the
  highest registered ground piece at the point (every `Frame.flat`, the sidewalk strips, park paths;
  snow banks and plowed piles on top as 'snow'); roads 'asphalt', off the grid 'snow', anything
  else inside the grid 'paving'. `buildTown` sets **`fx.surfaceAt = surfaceAt`**, so car grip
  (`car.js` `onSnow`) and skid marks use it now; main.js's own `Game.surfaceAt` (footsteps) can just
  call it. ~0.5 µs per call (8 m grid of footprints).
- **`roadNames`** (data.js, re-exported by town.js): `{ ns: [8], ew: [8], at(x, z) }` — exactly the
  lists patrol.js uses (ns[i] = the road along z at x = rc(i), ew[j] = the road along x at
  z = rc(j); ew[3] = 'Solrosvägen' = the bus stop's name). Every junction now has a street-name
  sign (white on blue, both plates, 12.5 m from the junction beside the north-south road), so the
  notebook's Plats matches what is on the posts. patrol.js can import `roadNames` instead of its
  own copy.
- **`camBlocks`** (data.js, re-exported): ~620 world AABBs `{ x0, z0, x1, z1, bottom, top }` of
  overhangs with no collision: every `metalRoof` (shed / garage / soprum / bike shed / bus shelter /
  carport / veranda / vagnhall / kiosk roofs), every door `canopy`, the petrol station canopy, the
  hospital's entrance and Akut canopies, the kommunhus canopy. A camera ray / boom can test them as
  boxes (y between bottom and top). Snow banks are not in it (they are ≤ 0.45 m).
  **Round 5** (809 now): Rune's wheelchair-ramp handrails (one box per side, 0.12 × 2.5 m, from
  the ground to 1.6 m above the kerb: the rail and the space just over it, so no boom ends right
  behind the rail; a boom passing ≥ ~0.7 m over it is left alone), every walkway / park lamp post
  (`pathLamp`: 0.16 × 0.16 m, up to the lamp head — the grey column filling half of
  reviews/errand_rune_push.png), and the low-roof boxes now take in the gutter (they were 5 cm
  bigger than the slab, the gutter hung 15 cm out: w + 0.3, l + 0.4 now). camera.js keeps its own
  minimum boom (0.9 m): standing right at the railing with the camera across it, the boom collapses
  to Ove's back (rather than a shot from behind the rail); `cam.frame` dialogue shots at the ramp now
  pick the open side (`wcam` scenario).
- **Tree crowns (round 5)**: every tree collider (`kind: 'tree'`, a CIRCLE of the trunk radius,
  `top` 99) also carries **`crownR`** (m, the crown's radius round the stem: outermost branch tips /
  twig cards, already scaled), **`crownBottom`** and **`crownTop`** (world heights of its lowest
  hanging twigs or branch tips and of the top), and **`species`** (`'spruce' | 'thuja'` dense,
  `'birch' | 'lime' | 'pine' | 'small'` see-through). Measured (10th-90th percentile, 1467 trees):
  birch crownR 3.0-5.1 m, bottom 2.3-4.2 m, top 9.7-16 m; spruce 2.8-4.7 m from 0.1 m (the lowest
  branches sweep the snow) to 10-19 m; pine 4.6-6.5 m from 7-11 m; lime 2.8-6.3 m from 2.3-5.5 m;
  garden tree 2.0-3.0 m from 1.3-1.9 m; thuja 0.33-0.36 m (columns) from the ground.
  In camera.js `thinReach(b)` can use them instead of guessing from the trunk, e.g.
  `if (b.kind === 'tree' && b.crownR && ey > b.crownBottom - 0.3 && ey < b.crownTop) reach =
  Math.max(reach, b.crownR * (b.species === 'spruce' || b.species === 'thuja' ? 0.9 : 0.55));`
  (spruces are opaque to the tips; a birch crown is a see-through haze you can sit just inside).
  Trees in the forest belt (outskirts) have no colliders. (Since feature avgrunden they all do.)
- **New landmarks (round 5)** for the story (all in `landmarks`, see the table): `dealerFinish`
  (race finish, street in front of Bilhallen), `adrianBay` (box; empty bay for Adrian's Saab: put the
  named car there with `yaw` = the box yaw, nose to the kerb), `graveFlowers` (`{x, y, z, yaw}` on
  Sonja's plinth), `hospitalDrop` (box; the car's drop-off stop under the Akut canopy, reached by
  the new Akut driveway; the passenger walks round the tail to `hospital`).

## Known weaknesses

- Deciduous crowns are still cards: from ~5-10 m they hand over from limbs + small twig cards to
  the crown haze and the hand-over can be seen; there is no opaque core inside far crowns (the
  blended cards made the coverage dots go away without one). Looking straight into the low sun, far
  crowns and houses are still washed pale by the haze and bloom close to the sun disc.
- (round 5: improved, still the weakest tree) Spruces up close: fronds now lie on every branch and the
  tiers are pleated star shapes with zig-zag rims, but at 2-4 m the inner mass still shows big flat
  facets between the cards, and the lite forest-belt spruces at 13-25 m are clearly stacked cones.
  (Round 4 text:) Spruces up close (2-6 m) still read as stacked tiers (the inner mass is a lofted, lobed solid; the
  branch cards hang over its rim but do not hide its smooth upper faces); from 10 m on they read as
  ragged, layered spruces. The blended conifer cards are sorted per mesh, not per card: at a few
  spots two crowns overlapping can show the far one's cards over the near one's (rare, faint).
- Snow banks are lumpy and taper, but at 2-3 m the street banks still show their 6-point profile as
  soft facets; plowed piles are lumpier but remain one welded shape with a few lumps.
- The park's trodden paths are faint from eye level (snow on snow).
- Evergreen hedges (round 6): soft, low-contrast leaf walls with rounded ends and a few sprigs proud
  of the faces; the faces are still flat planes of cards (the body's per-plant bulges only show in
  the snow-capped top line), the sprigs are subtle (same green as the face; they show mostly in the
  silhouette), and a shaded hedge is a muted dark green (the grade desaturates deep tones). Bare
  (oxbär) hedges are lighter grey-brown twig masses with frayed ends but still boxy.
- The foliage/spruce shader (gfx.js, not mine) is sharpened value noise; anything in 'foliage'
  seen close and large can read as camouflage — keep `fineTex` ≥ 6 on clipped foliage.
- Gable-ended rows, villas and lamellhus are boxes with trim (no bay windows); windows on far
  facades are `winLite`. No interiors except Ove's garage, the shop fronts, the showroom and the
  entrance vestibules.
- Corner piles are visual only (you wade through them, as through banks); lot piles are solid.
- `animated` is empty (flags and the Christmas tree lights are static).
- Lamps (street, path, porch) are dim emissive (daylight) — no real lights. Round 6: every lamp a
  dialogue can frame stays under the bloom threshold (`kit.glow`); use `glow(hex, L)` for new
  'light' parts (L ≈ 0.5-1.5).
- Triangles drawn: 3.0-7.9 M per frame (all passes) at the wperf poses; the props (0.9 M) and the
  cars (up to 1.5 M, cars agent) are now a large share; see the levers under Performance.
- Old missions/NPC homes in `main.js` still reference the Bigmouth landmarks; my copy aliased
  them (`birch → oveHouse` …). Phase 3 must switch to the new names.

## Rooms inside the houses (feature luftning_borde_vara_en_scen, 2026-10-11)

Day 3's radiator scene (game/luftning.js) is played inside Anita and Rune's real row house (row
S1b, unit 0), so its kitchen window looks out on the real walkway. What makes that work:

- Every house is closed boxes in the batches. From inside one, all their faces point away from the
  camera and are culled: the house is invisible from inside. Only what sits *on* the facade faces
  inwards too: the window frame, the mullion and the pane (an opaque 'glass' box). The frame and
  mullion stay (they are the window, seen from inside); the pane would be a slab.
- So that one window's panes are built into a builder of their own: radhusRow's per-unit
  `pre(k).kitchenGlass` (ove.js passes it for Rune's unit) goes to `win(..., { glassG })` (kit.js:
  the panes go into that builder instead of the frame's). ove.js puts it in data.js `interiors.rune`
  (`pane`), with the row's frame and the unit (`ox, oz, yaw, a0, y0`); town.js makes it a mesh of its
  own (`pane:rune`, no shadow like every window, static) and stores it as `paneMesh`. From outside
  it looks as before (only its curtains' random pick differs). The town's `rnd` sequence is
  unchanged.
- `interior.js` `buildKitchen(info)` -> `{ root, at(lx, ly, lz) (unit-local, ly above the floor ->
  world [x, y, z]), yaw(local), FY, dispose() }`, with `ROOM`, `WIN` (the window's opening),
  `RAD`, `VENT` (the radiator and its bleed valve) exported for the scene. A closed room (floor,
  ceiling, four walls with the window opening and a door) 0.12 m inside the house's walls, all
  section-10 surfaces in one GeoBuilder (`realMesh(..., { snow: false, cast: false })`: no snow
  indoors; nothing casts, the sun cannot get in through the house anyway) plus one `signMesh` (the
  bonad). No lights: the room is lit by the sky like any shade, the lamps only glow (`glow()`).
  It is built when the scene's first black falls (~150 ms with the puppets, behind the curtain) and
  removed at its last, so it costs nothing in play. Being inside someone's house, the camera
  cannot film it from outside: from outside the house's front face is opaque, window or not.

## Ove's garage door (feature oppna_garaget, 2026-10-11)

`garagedoor.js` `GarageDoor(f, cx, { name, w, color, open })`: built by ove.js into the garage row's
frame (`area.garageFrame`, doors face local −z) for garage 1 (`name: 'oveGarage'`, 2.73 × 2.16 m,
the row's door colour), listed in data.js `doors` (re-exported by town.js). town.js adds its mesh
(`d.build()`: 'painted' panel with the row's five ribs and handle, the ribs take snow like the
other doors' do, a steel frame, lock bar and inner handle on the inside) after `makeStatic`, so it
is the only world mesh that is not static. The garage row builds Ove's garage as before (shell,
interior, light) but, with `moving`, two tracks under the ceiling (rising 9 cm inwards, hung from
the roof) instead of the door tipped up; no `rnd` is drawn for any of it (the town after it is
unchanged).

- **Motion**: `p` 0 (shut) .. 1 (open). The panel's top edge runs in the tracks (2.16 → 2.25 m up,
  2.25 m in); the panel tips to 6° short of level, its front edge 2.02 m up and 0.08 m inside the
  frame; on the way the top edge is held back (`SWING` 0.45) so the bottom swings out ~0.3 m at
  knee height. Opening is a smoothstep over 1.5 s, closing `1 − s²` over 1.15 s (it falls shut).
  The sweep inside the frame stays above ~1.1 m from 0.12 m in: the Saab parked in
  `oveGarageSpot` (its tail 0.17 m behind the shut panel) is never touched (checked against every
  vertex of the Saab's meshes over the whole sweep). `kin(p)` gives the top edge and tilt,
  `pointUp(u)` a point u m up the panel from its bottom edge in door coordinates.
- **API**: `open()`, `close()` (false if moving or there), `set(open)` (at once: save, tests),
  `update(dt)` → `'opened' | 'closed' | null` (main.js plays the sounds), `bump(a)` (a rattle in
  the frame: a tug, a car into it), `isOpen` (the state it is in or going to), `moving`,
  `local(x, z)` → [across, out] (out > 0 outside), `world(a, o)`, `band(out, inn)` (an oriented box
  across the doorway, collision.js RAMP shape, for obbVsBlock / circleVsBlock), `between(ax, az, bx,
  bz)` (the shut door is between two points).
- **Collider**: one block (`kind: 'garageDoor'`, top 99, `ref` = the door) across the doorway,
  overlapping both walls; alive while shut, closing, or < 85 % open. hud.js's base map ignores the
  kind. The camera's boom treats it as a wall.
- **camBlocks**: the open panel is an overhang box (2.15-2.45 m) while it is fully open, so the
  camera stays under it (the old static door was not one); far below the ground otherwise.

## Beyond the town and Ove's bedroom (feature avgrunden, 2026-10-11)

The invisible walls are gone (Ove goes on past BOUND; main.js stops everyone else there) and the
cold kills him further out (game/cold.js). What the world does for it:
- **Ground**: `layout.terrain = { at, from: 330 }`; outskirts.js sets `at(x, z)` to the hills' mesh's
  height, triangle by triangle (the cell's two triangles a c b / b c d, the coords' binary search),
  and `baseGround` returns max(CURB, it) beyond 330 m (the flat snow at CURB reaches 420 m; the
  smooth `hillHeight` differs from the mesh by up to ~0.3 m between vertices). So characters, cars,
  the camera and `groundAt` follow the hills.
- **Forest tracks** (`layout.TRACKS`, `onTrack(x, z, w)`): x = -120 north, x = 120 south, z = 120
  west, z = -120 east, from the outer road out: no belt tree within 6 m (a tree there is still made,
  into a scrap builder with `noCards` - kit.js placeTemplate places no cards for it - so the rest of
  the belt and the street dressing come out as before), no verge birch (streets.js), the plowed bank
  open at the mouth, no wild tree within 8 m. Every belt tree has its trunk collider now.
- **The near hills** (350-760 m, `buildWilderness`, its own random stream): ~900 spruces in stands
  (an fbm mask, denser by the belt so the forest frays out) as instances of one ~200-triangle spruce
  (ten narrow, offset tiers in 'spruce'; no twig cards: those live in the sign pages and can't be
  instanced), four quadrant meshes, a trunk collider and crown each; plus the same places as the far
  silhouette (76 triangles), shown instead while the camera is in the town (`tickWild(cx, cz, cy)`,
  main.js every frame and on the title: detail beyond 268 m and below 70 m altitude, then in the AO
  pre-pass; shadows beyond 285 m, the boulders' too). ~70 snow-capped faceted boulders (one mesh,
  'concrete', rock colliders). The far silhouettes start at 740 m (1920 of them now).
- **No buildings out there**: the red barn, the cottage and the roundpole fence are gone.
- **'hillside'** (gfx.js): its painted spruce stands and bare patches fade in from 70-170 m away, so
  under Ove's boots it is plain snow.
- **Cost** (cold.mjs `coldperf`: cars and people hidden, 90 frames a pose, RTX 4070, high) against
  HEAD before: draw calls the same ±2 everywhere in town, main-pass triangles +1-3 % (start 1.97 →
  2.00 M, drone_nw 2.29 → 2.35 M, aerial 4.89 → 4.93 M), AO and shadow passes unchanged in town; at
  the outer road looking out (ring_out) +0.16 M shadow and +0.1 M main triangles (the detailed spruces
  and their shadows). renderFrame CPU unchanged within the noise. rperf `start`: 390 vs 490 calls
  (traffic differs per run), 60 fps.
- **Ove's bedroom** (`buildBedroom(info, { photo, clock })`, interior.js): as the kitchen, inside his
  real house (S1a unit 4: `interiors.ove`, ove.js) in the back half of the ground floor (x 0.12-3.35,
  z 4.55-8.26): its window is the house's back window (rowhouse.js `pre.backGlass`: those panes are
  `pane:ove`, hidden by the scene; outside: his back garden and bird table). Pale grey-green paper
  with a thin stripe, a pine floor, a double bed (pine, his half rumpled, hers made up flat with the
  sheet folded back and her pillow plumped), her nightstand (her photograph: pickups.js
  `sonjaPhotoTexture`, framed; her reading glasses on her book; her lamp), his (a red twin-bell alarm
  clock showing the game's time, a glass of water, his watch), his clothes folded on the chair under
  the window with the jacket over its back, a white wardrobe, a rag rug, a Saab calendar by the door
  with November crossed out up to the 23rd, the door to the hall, a globe lamp (off). One GeoBuilder
  + three textured planes (photo, calendar); ~25 ms to build, behind the curtain.

## The hoppbacke: snow hills to drive and walk on (feature snöhög, 2026-10-12)

**Why the old pile bounced cars.** The park's pulkabacke was `mound()`: eight stacked 0.4 m circle
floors (r 9 m, 3.2 m high). A car's ground point could step 0.4 m up, but its 4.5 m body overlapped
the circle two steps higher (0.8 m above it, over the car's 0.6 m step), and `collideStatic` took that
for a wall: the car was pushed back with a bounce, every time.

**collision.js `HILL`** (shape 3): `hill(x, z, r, top, at, kind = 'mound', base = CURB)`, a smooth
heightfield: `at(x, z)` its top there (-Infinity off it), `top` its highest point, within a circle of
radius `r`. It is never a wall (`circleVsBlock` / `obbVsBlock` return false: whoever runs into it is
lifted onto it) and always a floor whatever the step (`groundAt` takes it however far above `y + step`
it is: nothing goes under a snow hill). `topAt` gives its surface, `contains` = in the circle and
above `base`, `segmentBlocked` only where the surface is above the line, `hillSlope(b, x, z, out)` its
gradient over ±0.25 m (`out.gx`, `out.gz`). camera.js `near()` counts it wherever the boom is below
its surface.

**world/snowhill.js `jumpHill(f, lx, lz, ly)`**: the park's hoppbacke, park-local (-13.5, 18.5),
its axis along +x (world centre (66.5, 18.5); feet at x 52.2 and 80.8), on the one lane of open lawn
in the park: z 16.5-21.5 is clear from x 49 (Parkvägen's sidewalk) to 111 (the far street), north of
the lime alley. A two-way tabletop, symmetric; the long profile is Hermite knots `JUMP` (s from the
centre: table 0-3.5 m dipping 7 cm in the middle, the edge at 3.4 m, a 0.6 m rounding to the face's
24° (0.45) for 3.6 m, 1.6 m easing to 16°, 2.6 m of that, a parabola to the ground at 14.3 m; every
segment's drop is its mean slope × length, so there is no bump in it: one there gave a 0.05 s hop
at 18 m/s). Designed with a flight simulation (snohogsim, and a stand-alone copy of it): up to
~11 m/s at the edge a car lands on the table and rolls off the far edge, 12-14 on the far face,
15-18 overshoot to the flat (impact ~12), 22 m/s flies 33 m. Plan view: an oval (half width 10.2 m)
round a flat crown (2.8 m half width, narrower towards the feet) with flanks that fill the rest at
no more than ~36°; the crown's edge and the outline wander with low-frequency noise (in the
collider too). The mesh is a 0.4 × 0.36 m grid of that same function (~5 k vertices) plus up to
2 cm of lumps on the drive line and 14 cm on the flanks (drawn only), vertex colours for a packed
lane, two wheel ruts, seven pulka runs down the faces, grit at the foot; 22 lumps of packed snow
round the foot (kit.js `chunks`). `JUMP_HILLS` (snowhill.js) holds it for the game: x, z, the axis
(fx, fz, rx, rz), table, edge, end, top, `at`, `along(x, z)`, `across(x, z)`.
Moved for it: the two pulkas (to the foot), the emblem on the hill (now on the table, from
`JUMP_HILLS[0]`). New: the kommun's sign at the west foot ("Pulkaåkning sker på egen risk" /
"Motortrafik förbjuden"). The `pulkabacke` landmark stays (65, 6.5), off the hill.

**`mound()`** (places.js: the preschool's sledding mound, still round) keeps its cap and gets a
collider of the same shape (`domeHill`) instead of the stepped circles.
