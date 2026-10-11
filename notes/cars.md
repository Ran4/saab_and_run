# Cars — notes for later agents (phase 2, area C; fix rounds 1, 2, 3 and 4 (perf) and phase 4 round 2 applied)

Files: `src/actors/car.js` (physics, `Car`, specs, materials, lights, plates, LOD, snow caps),
`src/actors/carmodels.js` (lofted models, wheel instancing, plate atlas, lamp + glow materials),
`src/actors/trailer.js` (släpkärra), `src/actors/drivers.js` (AI), `tools/cars.html` (look-dev
page), `tools/scenarios/cars.mjs` (test scenarios). DESIGN.md §7 holds; additions and deviations
are below.

## Seating, parked cars (done in GAME's main.js; keep it that way)

- **Seat busts and seated characters at the model's seat**, in the car's tilt frame:
  `car.tilt.add(bust); car.seatLocal(1, bust.position)` (side `1` driver, `-1` front passenger,
  `±2` rear). For a seated `Character`: `const p = car.seatLocal(side, ch.root.position);
  ch.root.position.set(p.x, p.y + 0.12 - ch.model.legLen, p.z + 0.12)`. The old main.js puts every
  bust at z = −0.05 (tall: `len/2 − 1.6`): right height, but in the Golf / Audi / Škoda the head
  ends up under the windscreen and pokes through the roof. With `seatLocal`, crowns clear the roof
  by 9–17 cm in all 12 types (checked with the realistic people; round 3's narrower Saab greenhouse
  keeps the driver's head clear of the side glass).
- Parked cars: `new Car(pc.type, { color: pc.color, name: pc.name, snow: !pc.name, trailer: pc.trailer })`
  (main.js does this: snow caps on unnamed parked cars, Patrik's släpkärra).

## Types

`CAR_TYPES` keys (spec `name` is Swedish, shown by the speedo): `saab900` (Saab 900),
`volvo240` (Volvo 240, 244 saloon), `volvo740` (Volvo 740 kombi), `audi` (Audi A6, C7-ish),
`bmw` (BMW 5-serie, E34), `skoda` (Škoda Octavia kombi), `golf` (Volkswagen Golf, mk6-ish 5-door),
`kombi` (late-90s estate, V70-like), `taxi` (the kombi with a lit TAXI roof sign), `van` (Skåpbil),
`bus` (Stadsbuss, red low-floor, doors on the kerb side), `garbage` (Sopbil, cab-over, compactor
body + rear-loader tailgate, 3 axles). Old keys are aliases (same spec object): `sedan→volvo240`,
`hatch→golf`, `wagon→kombi`, `pickup→van`, `hearse→skoda`, `muscle→bmw`, `icecream→van`
(`CAR_ALIASES`). `car.type` is the key you passed (may be an alias), `car.kind` the real model key.

Spec fields: `name, model, maxSpeed, accel, brake, grip, steer, mass, hp, tall, revMax, solid`,
plus filled in from the model: `len, wid, height, wheelR, wb` and the legacy `bodyH, cabinH`
(`wheelR*0.95 + bodyH` = seat height). Real dimensions (m): Saab 4.70 × 1.69 × 1.42, wb 2.517;
Golf 4.20 × 1.78 × 1.48; bus 12.0 × 2.55 × 3.12; sopbil 9.1 × 2.5 × 3.42 (`carModel(k)`).

**The Saab 900** (1987–93 combi coupé), side profile from a pure side-view photo (wheelbase as the
scale): long front overhang; a flat clamshell bonnet (crown ~2 cm, `crownZ`) falling to a crisp front
edge at 0.75 m (crease); under it the face is one tall band, 0.545–0.725 m: big rectangular fluted
reflector headlamps (lens 0.395 × 0.15 m) in a black surround that wraps round the corners
(`bandOn`), amber-over-clear corner lamps, a chrome-framed grille with three slats and the SAAB badge;
then a slim black bumper (0.30–0.535 m, a grey rubbing strip in a recessed band) over a 3 cm lip,
wrapping to the arches and joined by the black side moulding. Round 3: rounded 'bathtub' sides
(convex from the tuck-under to an 8.5 cm shoulder radius, no feature line), a narrower greenhouse
with tumblehome (glass from x 0.72 at the belt to 0.58 at the roof), the black triangular sail the
mirror stands on at the front of the door glass, drip rails over the doors, a deeply wrapped
windscreen with black A-pillars (phase 4 round 2: a glossy black frit band, `FRIT` = the LOD glass
colour, which the car shading renders as glass - see below), a long door, a smaller quarter window
whose rear edge leans back, a big body-coloured C-pillar with the slotted vent. The fastback hatch
glass (~19°) runs down to a crisp lip right at the tail (phase 4 round 2: z −2.222, the lip crease
at −2.232, 0.96 m; round 3 left a ~17 cm flat lid behind the glass that read as a saloon's boot side
on) and wraps round into the C-pillars (`gh.rwWrap`: the corner band is glass, its sides drop
~0.12-0.14 m), framed in black rubber along its sides and foot (`rwSealB` 0.035); a dark parcel shelf
under it, the body top under the glass flat and 2-3 cm below it. Then the near-vertical tail panel: the
hatch cut at 0.79 m, wide ribbed tail lamps (red over amber outer / clear reversing inner) in black surrounds either
side of the black plate panel, SAAB letters on the lid; the rear bumper like the front one; a short
tailpipe angled down from a silencer under the tail, a dark floor pan under the car.

## Car API (car.js)

`new Car(type, opts)` — opts: `color` (sRGB hex; else an everyday colour, bus/sopbil keep their
livery, taxis black/white/grey), `solid` (non-metallic paint; older types are solid 60 % of the
time when no colour is given), `name`, `snow` (parked under snow: a snow cap on roof/bonnet/boot +
the paint's frost), `plate` ('ABC 123' / 'ABC 12A'), `engineOn` (true/false; default null =
running whenever it has a driver, an AI or a `driverBust`), `headlights` (default true), `trailer`
(true or trailer opts), `spec` (overrides), `x, z, yaw`, **`grime`** (round 3, road grime 0..1.1;
default by name and state: Ove's `saab` 0.35, `andersAudi` 0.3, `adrianSaab` 0.5, bus and sopbil
0.85–1.1, snowed-in parked cars 0.7–1.1, everything else 0.45–1.0; `car.grime`, quantised to
`GRIME_LV` for the materials).

- Ove's Saab (`name: 'saab'`) gets the plate 'ORV 455' unless `opts.plate` gives one (it was random
  every session); main.js may pass its own.
- Seats: `car.seatLocal(side, out)` / `car.seatWorld(side, out)` (see MUST above). The point is the
  seat surface = a bust's origin (models.js busts put the hips 0.12 above and 0.12 forward of it).
  The steering wheel sits where the busts' hands are (vans and the sopbil: lower and flatter).
- `car.plate` (unique), `car.setPlate(text)`, `car.platePos('front'|'rear', out)` (world).
- Lights: low beams + tail lights whenever `car.running && car.headlights`
  (`car.setHeadlights(on)`); brake lights from braking (`ctrl.brake` while rolling, and AI holding
  the brake at a stop); reversing light from intent (brake held, no throttle, below walking pace —
  no flicker at the trailer's jackknife limit — and never while `ctrl.handbrake` or `ctrl.park` is
  set: main.js holds the player's car with brake + handbrake in dialogues and at the race start);
  `car.indicator = -1 | 0 | 1` (left/right; AI sets it before turns); `car.hazard = true` blinks
  both. Dead cars: all off.
- `car.attachTrailer(opts)` → `car.trailer`; `car.detachTrailer()` → the trailer (removed).
- `car.skidAmt` (0..1) is only > 0 when the tyres actually slide; `car.revs` / `car.gear` for audio.
- Body attitude: `car.pitch` (+ = nose down), `car.roll`, `car.heave`; `car.groundPitch`; `car.onSnow`.
- `car.lod` (far version active), `car.body` / `car.bodyLod` (both get `MAT.burnt` when wrecked;
  `repair()` restores), `car.glass`, `car.lights` (lamp mesh; hidden on a far car whose engine is
  off - its unlit lenses are baked into the LOD body), `car.glow` (lamp glow quads),
  `car.snowCap` / `car.snowCapLod` (snow:true only), `car.plateMesh` (shown out to 72 m).
- `carGlassMaterial(clear)` (exported) is the see-through car glass (`clear`: the bus's and the
  sopbil's windscreens and the bus doors - glass geometry groups in the `'glass'` surface).
- `carWheelMaterials(geo)` (exported, handed to carmodels' wheel pools): the wheels' own copies.
- `carMaterials(geo, grime)` (exported, round 3): the car shading for any car-like GeoBuilder
  geometry (the trailer uses it). `GRIME_LV`, `grimeLevel(a)` exported too.
- `car.beacon` channel: the sopbil's amber roof beacons flash (two flashes per turn) while its
  engine runs.
- Round 4: **`car.asleep`** (read-only), **`car.wake()`**, **`car.dispose()`**, **`warmCars(renderer,
  scene, camera)`**, `CAR_PERF` / `setCarPerf({ instLod, sleep, autoWarm })` (A/B switches),
  `car.syncView()` (the camera-dependent part of `sync`), `carStats(n)` (instanced far bodies /
  batches / sleeping cars / the warm-up's timings; `n` > 0 benches the instance rewrite). See "For
  main.js" below. `car.root.userData.isCar = true`; the car's meshes are named `car:body`,
  `car:bodyLod`, `car:glass`, `car:lights`, `car:glow`, `car:plate`, `car:snowCap(Lod)`.
  The car's root and tilt matrices are written by `sync()` (`matrixAutoUpdate = false`), the meshes in
  the tilt frame are static: move a car with `place()` / its `x, z, yaw` and `sync()`, never through
  `car.root.position`.

## Materials (deviations from DESIGN §10.4 — all inside car.js, gfx.js untouched)

Every car material (paint, plastic, chrome, rubber, metal, painted, fabric, glass, the wheel
pools) is a car-owned copy wrapped by `carShade(m, { spec, baseSpec, f90, road, cabin, grime,
grimeK, glass, lodGlass })` in car.js:

- **Sun glint cap** (`spec`): three's minimum roughness spreads a mirror's sun glint over a whole
  flat pane: glass 0.8, chrome 1.2, metal 1.0, painted 1.2, wheel rims 0.24, lamp lenses 0.45; paint
  2.2 for its clear coat with a separate **base-layer cap** (`baseSpec`) 0.2; black trim plastic
  0.035, rubber 0.15.
- **Paint (round 3):** the lofted panels are convex in section now (see Models), and the paint is
  two layers that behave like car paint: a rough base (metallic: metalness 0.3, roughness 0.45;
  solid: 0, 0.4) with no Fresnel rise of its own and a weak dielectric part (`f90` = [specularF90
  0.06, specularColor × 0.12]; it sits under the coat, which takes the grazing reflection) - so the
  broad sun lobe is a dim sheen in the paint's own colour - under the mirror clear coat
  (roughness 0.015, `uEnvCC` 0.72, its sun glint capped at 2.2), which carries the sky and the
  small sharp glint. `uEnvSpec` 0.6. Round 2's base (metalness 0.32, roughness 0.3, cap 1.9, full
  Fresnel) lit whole panels facing between the sun and the camera as uniform silver sheets.
  Everyday light colours are capped (white 0xd0d0cc, silver 0x8f9397).
- **Black trim** (`plastic`: bumpers, mirror housings, seals, lamp surrounds, grilles): matte
  textured plastic, roughness 0.6, sun cap 0.035, `f90` [0.3, 0.6], sky reflection 0.25. Glossy, it
  mirrored the bright sky at a glance and read pale grey (L160–180). Measured in town: mirrors L15–18,
  a sunlit bumper L74–91 (the display grade's toe lifts a black in sun to ~L80).
- **The road instead of the HDRI's snowfield** (`road`, round 2): in `ROAD_GLSL` (after
  `lights_fragment_maps`) reflections below the horizon fade to damp asphalt (`uCarGround` = the
  env's ground radiance × 0.16) by −0.32 rad; reflections up to ~40° above the horizon are the
  street's houses, trees and snow banks rather than the photo's bright haze (× 0.36 at the horizon,
  1 by 0.75 rad; round 2: 0.4 → 1 by 0.55 rad); the photo's glare halo round the clamped sun is
  dimmed up to 45 % (`uCarSun`); and 75 % of the lower hemisphere's share of the diffuse sky light
  is taken from the road instead of the snow.
- **Road grime** (round 3, `grime`): a Swedish November road is salted and wet. Where it lies is a
  per-vertex mask baked into every body (`cgrime`, carmodels `grimeMask`: the sills and lower doors
  below ~0.56 m, a fan of spray behind every wheel and round the arches, the rear panel up to ~0.7 ×
  height, a little spatter on the front; upward faces ×0.12, undersides 1); how much is the
  material's `uCarGrime` (`GRIME_LV` [0, 0.35, 0.6, 0.85, 1.1] - cars of one colour share a handful of
  materials). In the shader (before `clearcoat_normal_fragment_begin`): mostly the mask's gradient,
  modulated ±15 % by spray clouds along the car, fine horizontal streaks and droplet speckle (car-local
  `gP`); dried salt (pale grey-beige) higher up, the wet road film (dark grey-brown) at the bottom;
  the grime turns roughness to 0.82, metalness to 0 and takes the clear coat away. Paint
  `grimeK` 0.85, black plastic 0.45, `painted`/`metal` 0.85. Plates get a seeded film and droplets
  drawn into their atlas slot (`allocPlate(text, taxi, dirt)`), wheels a brown-grey tint per car
  (instance colour) on top of the rims' brake-dust colour. The trailer has its own mask.
- **Cabin occlusion** (`cabin` [indirect, direct] = [0.3, 0.62] on `fabric`): seats, dash,
  steering wheel, headliner, the parcel shelf and estate load covers.
- **Glass:** `tinted`, Fresnel opacity (round 3): 0.66 face on rising to 0.84 at a glance
  (`glass`), sky reflection `uEnvSpec` 1.9 (round 2: 1.35). From behind and in the chase camera a
  hatch or rear window reads as a pane reflecting the sky over a dark cabin, not an empty frame.
  Inside, the pillars are lined in dark trim (0x2a2a2c) and only the roof in the pale headliner;
  estates have a dark load cover, the Saab and the Golf a parcel shelf. Clear panes 0.34 → 0.5 / 1.2.
- **LOD glass** (`lodGlass`, round 3): the far body's opaque glass (plastic in 0x14181d) is
  recognised by its vertex colour in the plastic shader and shaded as glass (roughness 0.07, the
  sky ×8 of the trim's, a dark cabin): the switch at 40–46 m no longer turns tinted glass into slate.
- **Wheels:** dark dished alloy faces (geometry 0x6a6e72 / Saab 0x6e7276 × material (0.64, 0.61, 0.57)
  brake dust), metal roughness ~0.5–0.9, sun cap 0.24, sky 0.55; hubcaps 0x686c70–0x72767a.
- **Lamps** (`lightMaterial()`): MeshPhysical with clear coat, per-vertex lens colour and
  metalness, emission per vertex × a per-car channel level (10 channels, `CH`). Each lens carries
  face coordinates (`lq`) and a pattern (`lpat`): 1 = reflector headlamp (vertical flutes bumped
  into the normal, lit: a hot core round the bulb fading to dim edges), 2 = ribbed rear lamp
  (horizontal ribs, darker grooves, rougher with a thin clear coat), 3 = round projector. Lit
  coloured lenses fade their reflections out. Emission: tail/brake pure red 0xff0000, indicators
  0xff6000. Levels (car.js `updateLights`): head 2.0, tail 0.2 (+0.42 braking), indicators 0.85,
  reversing 1.6, third brake 0.7, sign 1.6, beacon 1.3 flashes. Measured (round 2): lit brake lens
  core (232,57,60) hue 359° / sat 0.76, indicator core (255,181,87) hue 33° / sat 0.66.
- **Glow** (`glowMaterial(ch)`): one extra mesh per car (`car.glow`, additive, shares the channel
  array) with a soft camera-facing disc per brake / indicator / reversing / beacon lamp. Visible
  only while one of those lamps is lit (no draw call otherwise).
- **Exhaust** (round 4): a faint puff every 0.45–0.6 s at idle (longer while creeping off), none
  above 3 m/s, none when the camera is within 9 m *behind* the tailpipe (the chase camera, a car ahead
  at a junction) or within 3 m from any side; `fx.exhaust(x, y, z, vx, vz, EXHAUST)` passes the
  rendering area's optional `{ alpha, size }` - `EXHAUST = { alpha: 0.6, size: 0.8 }` in car.js, meant as
  multipliers of fx's default puff (an fx.js without them ignores the argument; if fx defines them
  as absolute values, change EXHAUST). Measured (`exhaust`): idling Saab, 0 puffs in 3 s from the
  chase camera, 6 from the side at 5 m, 5 from 12 m behind.

## Physics (arcade, heavier)

Player car gets `PLAYER = { speed ×1.25, accel ×0.88, brake ×1.15, aLat 9.5 m/s² }`. Reversing tops
out at `revMax` 4.5 m/s (16 km/h) for every type, 2.2 m/s while towing.
Measured with the Saab (`physics` scenario, simulated off-screen at 60 Hz, unchanged in round 3):
0–100 km/h 7.6 s (17/33/48/62/74/85/95/103 km/h per second), top 140 km/h, 100→0 in 39 m. Full lock
at 60 km/h: no squeal, 0.57 rad/s (the player's lock at speed is limited to ~1.35× what the tyres
give); the squeal threshold is 1.6× the grip limit. Handbrake at 60 km/h still slides (skid 1.0).
Thrust `accel·(1 − (v/vmax)²)`, engine braking ~1 m/s², air drag when coasting. Off asphalt (snow)
grip ×0.62, brakes ×0.6, accel ×0.72. AI drivers get accel ×1.15.

## Models (carmodels.js)

`carModel(kind)` (cached) → `{ body, lod, glass, lights, glows, wheels, wheelStyle, wr, ww, len, wid,
height, wb, plates, badges, seat, rear, exhaust, hitch, P, tris, lodTris }`.
Each body is a loft along z: a closed lower body and an open greenhouse shell whose quads are
classified paint / black pillar / chrome / seal / glass by zone (window edges can be slanted
lines; quads are clipped exactly). Options: `gh.insetZ` (the greenhouse's ledge along the belt),
`gh.cornerAt(z)` (surface of the corner band, e.g. black A-pillars), slanted `gh.pillars` entries
`[zFront, zRear, surface, colour, slope]` (outside every window zone), side zones with slanted
front/rear edges (`fs`, `rs`), `gh.rwX` (the rear window ends at |x| = rwX), `P.crownZ`
([[z, crown], ...], the top's crown along the car); round 3: `gh.rwWrap` + `gh.rwSealB` (the rear
window wraps round into the pillars, framed in black rubber), `P.sideF` / `P.sideFLod` (the side
section's sample heights), `P.creaseHard`, and the helpers `ghPt(P, z, j)` (a greenhouse section
point), `ghRail` (drip rails), `bandOn` (a band of boxes following the body round a corner),
`underbody(g, P)` (floor pan, subframes, tank: the space under a car is not empty daylight).
Round 4: `wheelWells(g, P)` is a dark half-disc wall 5 cm inboard of each tyre following the arch
(radius `arch.r`, its flat edge at the arch centre ~ the axle; closed by a thin strip): round 3's box
reached 0.4 r below the axle and stuck out behind and below the tyre in close-ups. (The dark
crescent / "flap" under every tyre that round 1 and round 4 chased was **not** the liner: the tyres
were built inside out - see Phase 4, round 2.)

**Side sections (round 3):** every car's lower body is convex in section with continuous curvature
(default `side` [[0, −0.05], [0.2, −0.016], [0.45, −0.002], [0.6, 0], [0.75, −0.008], [0.88, −0.026],
[1, −0.05]], sampled at 11 heights instead of 7, the LOD at 5), so a highlight is a gradient that
slides down the door; feature lines (`creaseF`: the Audi's, the Škoda's tornado line, the Golf's
shoulder) are stations of their own but the normals are smoothed across them (round 2's hard normal
break drew a white shoulder band with a knife edge). Big shoulder radii (≥ 6 cm, the Saab's 8.5 cm)
get four arc points. `P._fn.sideX(z, y)` follows the shoulder's arc (handles and shut lines no
longer float above a rounded shoulder). The Saab's sides bow out ~1 cm at the doors in plan too.

**The Golf (round 3):** one dark band across the face (0.69–0.84 m): big clear headlamps tapering
round the corners (reflector body, a round projector, the indicator along the lower outer edge)
joined by a black grille bar of the same height with three slats and a chrome strip along its top;
a lower bonnet front edge; the body-coloured bumper with the plate on it and a wide trapezoid
intake (4 slats) with the fog lamps in corner pockets; convex sides with the shoulder line through
the handles; wide two-part tail lamps (outer on the body, inner on the tailgate across the shut
line), GOLF on the tailgate, a parcel shelf. **The Audi:** a wide trapezoid singleframe (0.54 m
across the top with chamfered corners, 0.71 at the bottom, 0.4 tall) with horizontal slats only and
a thin chrome frame, the plate on its lower half; headlamps 0.13 m tall tapering round the corners
with a dim LED strip along the lower edge; AUDI on the boot. **Make names, no logos** (the brief):
chrome lettering from the atlas - SAAB, VOLVO, AUDI, BMW, ŠKODA, GOLF; the Volvo 240/740 grilles carry
the plain diagonal bar (no circle-arrow). **Sopbil:** the cab face raked ~9° (greenhouse to z 4.27),
a black sun visor, a black lower front band round the grille and lamps, black steps under the doors,
mirrors on arms reaching forward. **Van:** the steering wheel lower and flatter. **Mirrors:** a
spline outline with smoothed normals (no sunlit facets), ~0.135 × 0.09 × 0.075 m (0.155 × 0.1 on the
Audi), mounted close to the glass; LOD mirrors are matte dark boxes. Estates (740, kombi, taxi,
Škoda) have a dark load cover at the belt.

The bus's front and rear faces are their own curved surfaces (`busFace`): two-piece clear windscreen
with a black frit band, wipers, the destination sign in a black housing under the white roof cap; a
white rear panel with a small window. The sopbil's cab is closed by `garbageFace`.
Geometry is shared per type; the paint colour is a per-colour (× grime level) shared material.
Origin at the middle of the car on the ground. Surfaces per body: paint, plastic, fabric, chrome
(+ painted on bus/sopbil, metal on the Škoda's roof rails and the sopbil); exhausts are dark
plastic (a `metal` tailpipe cost one more draw call per car).

Wheels are instanced (one `InstancedMesh` per style for the whole town): `saab3` (Saab 3-spoke),
`alloy5`, `alloy7`, `sport`, `steel` (hubcaps), `van`, `truck`, `lod`. Rims dark with dished spoke
faces, hubcaps domed; the instance colour is white × the car's grime tint (burnt cars dark). Pools
keep their own material (round 2's pool-growth bug). `wheelDebug()` lists the pools.

LOD: beyond 46 m (back under 40 m) a car shows `bodyLod` (coarse loft, glossy dark glass - see
Materials - no interior, arches with 8 segments, ~2.6–4.4k tris, the unlit lamp lenses baked in as
plastic 4 mm inside the lamp mesh's lenses) and LOD wheels, and hides the near glass. The plate
stays out to 72 m (still one call per car: the per-car plate mesh). A far car's lamp mesh draws only
while its engine runs; a seated bust (main.js's `driverBust`) is hidden behind the far body's opaque
glass. Cars beyond 95 m cast no shadow. There is no third LOD.

**Instanced far bodies (round 4):** every far car that isn't a wreck is one instance of an
`InstancedMesh` per model and snow state (`carlod:<kind>|0/1`, the LOD geometry's own buffers plus
per-instance `cari` = paint rgb (linear) + grime, `carm` = metallic 1 / solid 0; materials from
`instMaterial` = the car materials with `carShade({ inst })`), its snow cap in a second one
(`carlod:cap:...`). Its per-car `bodyLod` / `snowCapLod` stay hidden (`car._inst`); a wreck far away
draws its own burnt `bodyLod`. The instances are rewritten in the scene's render hook (carmodels
`addRenderHook`) only when the view or a car changed (`carsChanged()`), culled per car against the
camera (the sphere inflated 7 m so a low-sun shadow from just off-screen stays), casters (< 95 m)
first: the shadow pass draws only those, and none into the near cascade (~30 m) except the bus and
the sopbil (their 13-15 m shadows can reach it). The wheel instances use the same dedupe (they used to
be rewritten for the AO pre-pass and again for the main pass), and an empty wheel pool is hidden (it
set up its program in every pass; with programs still compiling that stalled a frame).

Snow caps (`snowCapGeometry(geo, glass)`, cached per body): the upward-facing paint lifted along its
normal by up to 4.5 cm, plus the upward-facing panes (~1.4 cm), in `'snow'`. One extra draw call
per snowy parked car.

Triangles per car (near / LOD, round 3; the denser side sections cost ~25 %): saab900 20.4k / 4.2k,
volvo240 15.5k / 2.6k, volvo740 15.7k / 3.1k, audi 16.7k / 3.5k, bmw 15.0k / 3.1k, skoda 16.4k /
3.5k, golf 18.4k / 3.9k, kombi 16.2k / 3.0k, taxi 16.3k / 3.1k, van 14.2k / 2.9k, bus 13.6k / 4.4k,
garbage 9.1k / 3.4k (+ wheels 600–900 each, instanced). Draw calls per near car: 7 (body 4
surfaces + glass + lamps + plate; Škoda 8, bus 9, sopbil 10) + glow while braking/indicating + snow
cap when parked under snow; a parked far car 2–3 (+ the plate within 72 m).

## Plates

Swedish format `ABC 123` or `ABC 12A` (letters without I, Q, V, Å, Ä, Ö; no O last; a few rude
combinations skipped), unique (`randomPlate()`, `claimPlate(s)`, `releasePlate(s)`). Drawn into
atlas pages (1024×512 canvas, 24 plates + 8 badges per page since round 3 - the last two rows hold
GOLF AUDI BMW ŠKODA / SAAB VOLVO TAXI LINJE; white plate, black border, blue EU band with stars and
'S', Barlow Condensed, a seeded road-grime film per slot). A car's plate mesh (front + rear quads +
badges) is one draw call; slots are freed when the car leaves the scene. **Taxis** carry the Swedish
taxi plate: yellow ground, black characters, a small T (`allocPlate(text, taxi)`; the slot key is
`'ABC 123|T'`; `car.plate` stays 'ABC 123').

## Trailer (trailer.js)

Box trailer 2.5 × 1.4 m (+1.05 m drawbar), single axle, its own plate and lamps (mirroring the
car's). Galvanised steel (0x868a8c; round 2's pale galv read as white paint), the car materials via
`carMaterials` (matte trim, its own grime mask). Kinematic: `ψ' = (v_hitch · trailer-left)/L`,
L = 2.3 m (= v/L·sin Δψ), so reversing jackknifes; Δψ limited to 75° (`trailer.jackknifed`). A tiny
constant drift (0.004 rad/m) stands for road camber, so even dead-straight reversing wanders off
(74.5° after 8 s at 2.2 m/s if nobody corrects); **a 0.4 s steering tap while backing reaches the
limit after 1.7 s or 2.9 s** - the measurement flips between the two from run to run with the same
code (phase 4 round 2: three runs in a row gave 2.9 / 1.7 / 1.7 s; nothing in the trailer or the
physics changed), so both earlier notes were right; driving forward straightens it (0.5° after 6 s). Box OBB pushed out of static solids by
swinging about the hitch, or by shoving the car. A burnt car's trailer is restored by `repair()`'s
material now too. Exposes `x, z, yaw, len, wid, hx, hz, axleL, drawbar, obb`; `reset()`, `detach()`.

## Drivers (drivers.js)

`new AIDriver(car, { mode, cruise, path, target, aggressive, avoid, wobble, rubber, onArrive,
onStopped })` — API unchanged (`rubber` optional everywhere):
- Speed planning: lane-path turn points carry `turn` and radius `r`; the driver brakes ahead so it
  takes each turn at √(aLat·r) (traffic aLat 5.2 m/s², flee/aggressive 7.0), planned braking 4.6
  (5.8) m/s². Round 3: the brake holds the deceleration the next turn asks for (feed-forward,
  `aReq`) - the proportional brake alone lagged the plan by ~2 m/s and long cars and chasers reached
  corners too fast and ran onto the kerb. Pure-pursuit steering; at turns the aim is clamped to the
  turn point (round 2).
- **Rubber band** (round 3): `rubber()` scales the cruising speed only; turns are never taken faster
  than the grip plan (× 1.3 into a right turn sent the chaser through the corner). Races and the
  story's chaser use it.
- Traffic keeps about a second + 4 m to the car ahead, honks at a player in the way, indicates
  ~30 m before turns. Typical traffic speed 30–50 km/h.
- **Off the asphalt** (round 3, all moving modes): a car that has left the street (a smitare starting
  in a bay or half on the pavement - after 0.15 s - others after 0.4 s) aims at the nearest street's
  right-hand lane 6 m on, heading the way its path goes, at ≤ 5–6 m/s (`laneAim`, exported), instead
  of cutting across lawns and car parks to a path point beyond them; with the lane point behind it (a
  nose-in bay, a driveway, a carport) it reverses towards it steering the tail round (`backT`). Back on
  the street a fleeing or chasing car plans afresh (the old path's next point is behind it by then).
- **Watchdog** (all moving modes): a car that wanted to move but went less than 2 m in 4 s (6 s in
  traffic; **flee: 1.5 m in 2 s**) backs out with the opposite lock and takes a new way — except
  while it waits behind the player. Repeats at the same spot back out longer with the other lock;
  on the second, if the player is far enough away (45 m; **flee 30 m**), it is put back on its lane.
- **Chase** (round 3): straight at the target only when the way there is drivable asphalt all along
  (streets and car parks, sampled through `fx.surfaceAt`) or for the last 8 m to a target that is on
  asphalt - round 2 went direct within 38 m and drove over kerbs into yards and along pavements; a
  target off the asphalt gets a path ending in the lane beside it. Re-plans when the target's nearest
  junction changes, the path runs out, or every 2 s within 38 m - never in a turn or with a U-turn
  coming up within 30 m (re-planning from the node the car faces pushed the U-turn one junction
  further each time and the day-7 Škoda drove off for good). Paths never U-turn at a junction
  (`pathTo(..., noUturn)`: round the block instead; the lanes are 5.5 m apart, tighter than any
  car's lock); a chaser slow on a street with the target well behind does a **three-point turn**
  (`kturn`: forward on full left lock until the nose nears the far kerb, back on right lock, forward
  until it faces the way back). `chasecheck`: a chaser ~150 m from Ove's parked Saab gets within
  40 m after 15 s (same street, facing away), 7 s (facing him), 23 s (parallel street, facing away).
- **Pullover** (`ai.pullOver(onStopped)` or `mode: 'pullover'`): right indicator, eases to the kerb
  line (the car's centre at most RHW − 1.1 from the road's centre line), stops, then `mode =
  'parked'`, `car.hazard = true`, `ctrl.park = true`, `onStopped(ai)` once. Round 3 (the systems
  agent's request): if the place it would stop - the stop point and the car's outer side there - is
  on a kerb (`groundAt` > 0.1 or off the asphalt: an island, a bus-stop kerb, a corner) it stays in
  its lane and just brakes (`po.inLane`, re-checked every 0.25 s on the way); a car shoved off the
  street comes back onto it at ≤ 4 m/s first; the hazards go on as soon as it is below 1 m/s; it
  parks wherever it is after 14 s at the latest. Measured: 4–6 s from 40 km/h (van 8.8 s).
- `flee` (smitare) re-plans a new destination when stuck three times; swerves only on straights onto
  asphalt (round 2). `route` arrival by dwell time near the end point (round 2).

## For main.js (round 4)

- **`removeCar(car)` should end with `car.dispose()`** (after `scene.remove(car.root)`; dispose also
  removes it if it is still in). It frees the plate's atlas slot and geometry, the plate string, the
  car's own lamp material and glow material, its trailer's lamp material and plate, the seated bust's
  geometry (buildBust bakes one per bust: the 60-car test leaked exactly one geometry per removed
  traffic car), and stops tracking its wheels. Shared model geometries, snow caps and paint/surface
  materials stay. A disposed car must not be re-added. (enterCar's carjack and seat() take the bust
  out with `car.tilt.remove(car.driverBust)` and drop it: dispose its geometry there too, or keep it.)
- **`await warmCars(renderer, scene, camera)`** once during loading, after the town and the cars
  exist (e.g. with the rendering area's compileAsync, before the first frame): one of every model
  with and without snow (near body, glass, lamps, glow, plate, snow caps, far body, a wreck, the
  trailer), every instanced far-body batch and wheel pool, compiled against the real scene into a
  render target like the composer's (so the program variants match the main pass), then drawn once
  into a 1x1 target with a plain material so every car geometry is on the GPU. A second call returns
  the first one's promise. **If main.js never calls it, the cars do it themselves 2 s after the first
  frame** (`CAR_PERF.autoWarm`; in the game that is the title screen): the shaders compile in the
  background; build 27-31 ms + compile 23 ms in one task, upload 12-14 ms; the worst game frame
  meanwhile 26 ms (the explicit call during loading costs no game frame). Measured: 8-10 programs,
  150-335 ms in all; Ove's first entry into the Saab straight from the start view then has its worst
  frame at 19-28 ms (was 37-42 ms) with no car program compiled and no car geometry uploaded but 7
  plates; what is left is the town's blocks / ground / twigs coming into view (world). Entering from
  beside the Saab: no car program (the three new ones are world blocks and markers).
- **`car.asleep`**: parked cars nobody drives fall asleep 0.5 s after coming to rest and stop
  stepping (no physics, ground or solid queries) until something wakes them (`car.wake()`):
  `collideCars` contact, a trailer shoving them, `place()`, `damage()`, a driver or an AI, or anything
  else that moves them or gives them a speed (checked in `step`). `collideCars(a, b)` returns at once
  when both sleep; a broadphase may leave sleeping cars out of the pair list entirely (a sleeping car
  can't start a contact; a moving one wakes it). A sleeping car with nothing lit (`!running`, no
  hazard, no indicator) skips `sync()` except `syncView()` (LOD, plate, shadow).

## Testing

- `node tools/pageshot.mjs tools/cars.html cars` (through `../browserslot` with your own `PORT`) —
  views: `lineup, lineup_b, lineup_c, saab_street, saab_front34(b), saab_rear34(b), saab_side,
  saab_side_ortho, saab_front_ortho, saab_rear_ortho, saab_front, saab_rear, saab_top,
  saab_interior, saab_lit_front, saab_chase` (the game's chase camera), `saab_chase_brake, brake,
  brake_far, plate, plate_front, hazard, hazard_far, trailer, trailer_side, parked_snow, lod_near,
  lod_far`, round 3: `saab_corner, saab_cornerL` (front corners close up), `saab_mirror`,
  `saab_hatch` (raised rear 3/4); per type `<kind>_34, _rear34, _front, _side, _plate, _hazard`, and
  on request `spin0..spin7`. `QUERY='?only=a,b'` shoots a subset; `&grimedbg` logs the Golf's grime
  mask by height. The hero Saab and the street Saab carry grime 0.35 (Ove's), the rest random.
- `tools/scenarios/cars.mjs`: `physics`, `trailer`, `carflee` (three fleeing cars, 30 s each),
  `carcost` (stats with all cars vs none, start view and aerial, triangles and draw calls per near
  car), `pullover`, `seating` (Ove's Saab on a street, chase cam), `saabtown` (Ove's Saab parked at
  a kerb in town from four fixed cameras, `cars_town_*.png`; prints screen points of an upper- and a
  lower-door point for sampling the paint), round 3: **`realpursuit`** (a smitare from a street
  violation spot on its own flee AI - the first at the hospital spot where round 2 wedged - chased by
  a Saab on the chase AI, no teleports; stuck windows, seconds off the asphalt, then TAGEN and how
  the pull-over ends; `RP`, `RPT`, `RPDBG=1`), **`chasecheck`** (see Drivers; `CCDBG=1`).
- Round 4: **`carperf`** (draw calls per pass split into cars / rest and main-pass car calls by part,
  car.sync / parked car.step / collideCars pair costs, stepWorld / syncAll per frame, renderFrame ms,
  fps; start view, Solrosvägen in the Saab, the big car park, aerial), **`carleak`** (60 cars spawned
  in view and removed + `dispose()`: renderer geometries / textures / programs; `CARLEAK=bust` seats a
  bust in each), **`carentry`** (Ove's first entry into the Saab straight from the start view: frame
  times and the programs / geometries created in that moment, listed with the objects using them;
  `WARM=1` runs `warmCars` first, `AUTO=1` waits for the automatic one and reports the frames meanwhile,
  `CE=near` walks up to the Saab first), **`exhaust`** (puffs in 3 s from the chase camera, the side,
  12 m behind), **`lodab`** (instanced far bodies vs per-car, same frame:
  `cars_lodab_<view>_inst / _single.png`). cars.html views `wheel_f, wheel_r, wheel_low, van_wheel,
  wheel_probe` (tyres and arches from low close; the probe hides the wheels: only the liner is left).
- Phase 4 round 2: **`wheelfaces`** (every wheel style's tyre must face outwards - the winding of each
  tread / outer-sidewall triangle against its position - and every rim's outer face must face +x by far
  more area than it faces back; failures go to the run's errors), **`trailersleep`** (Patrick's kombi +
  trailer left 2 s on an open street must stay awake, the Saab driven into the trailer from 6 m with W
  for 1.8 s must stop at contact, ~3.6 m centre to centre; then a kick on a sleeping parked car's tyre
  must rock it; failures go to the errors), **`grimegpu`** (gfxStats.gpuMs median / min over 120
  frames at the big car park and on Solrosvägen; run with `QUERY='&gputime'` and `EXCLUSIVE=1`).
  cars.html views `wheels_bare` / `wheels_bare_low` (every wheel style alone: front row the game's
  front-side materials, back row DoubleSide - the rows must match), `saab_tail_side`, `saab_lip`,
  `saab_hatch_close`, `saab_ws`, `saab_apillar(_shade)`, `hero_chase` / `hero_chase_sun` (the game's
  chase camera on the hero, away from / into the sun), `saab_lod` / `saab_lod_near`. The look-dev Saab
  is the world's round-2b blue metallic (0x2c5596); the studio row carries grime 0.85 (was random).
- Lamp colours: sample the lit lens cores in `brake` / `hazard`; the lighting terms: add `&dbg=1|2|3|4&tm=none&contrast=0&toe=1&sdesat=1&exposure=1`
  (QUERY for shot.mjs; note the clear coat is added on top of every dbg term).

## Round 3 (review fixes)

Reviewer round 3: 6/10 ("still a clean mid-poly set rather than real cars"). What changed (details
above):

1. **Paint and trim in the low sun** - convex side sections everywhere (11 sample heights), feature
   lines with smoothed normals, a rough dim base layer under a sharp clear coat, matte black trim,
   horizon/sun-halo dimming of the reflected sky. In town (`saabtown`, Ove's navy Saab at a kerb,
   grime 0.35), sampled at the scenario's door points: front 3/4 upper L154 / lower L78 (round 2:
   L220 / L90 as a uniform band with a hard edge; now a soft gradient, a blue sheen in the paint's
   colour, the shoulder brighter because it faces the sun), rear door 136 / 84 (1.6×), side 62 / 60,
   rear 3/4 54 / 66, rear 105 / 88; mirrors L15–18, a sunlit black bumper L74–91.
2. **Saab 900 from the chase cam and 3/4** - narrower greenhouse with tumblehome, rounded shoulders,
   the hatch glass longer (to z −2.12) and wrapping into the C-pillars in a black frame, a parcel
   shelf, glass more opaque and reflective at a glance, the black sail at the front of the door
   glass, drip rails, the face's surround wrapping round the corners. Reads as a hatchback with the
   900's rounded body from behind now; see weaknesses.
3. **Golf** - face band, bonnet edge, convex sides, wide intake, two-part tail lamps, GOLF lettering.
4. **Audi** - wide trapezoid singleframe with horizontal slats and the plate on it, taller lamps with
   a dim LED strip; make-name lettering on the Audi, BMW, Škoda, Golf (no logos, per the brief); the
   Volvo grilles' diagonal bar.
5. **Road grime** - per-vertex exposure mask × per-car amount, plates, wheels, trailer.
6. **AI** - rejoin the street (with reversing out), faster flee watchdog, chase only over asphalt,
   no U-turn re-planning, round-the-block paths, three-point turns, brake feed-forward for turns,
   rubber band on cruise only, pull-over kerb checks and early hazards.
7. Minors: reversing lights off while held; LOD (plate to 72 m, glass shaded as glass, baked lenses,
   matte mirrors, denser LOD sections); exhaust sparser and never in front of the lens; tailpipe 6 cm
   proud, angled, a silencer and a floor pan; smaller smooth mirrors; the Saab's front-corner facet
   (the surround wraps the corner) and corner lamps pulled in; darker rims with brake dust; Fresnel
   glass, load covers, parcel shelves; sopbil cab, van wheel, galvanised trailer; the jackknife note.
8. Ove's Saab: plate 'ORV 455' by default.

Measured in my copy (round 3; GAME's world and people, 161 cars, 1280×720, RTX 4070):
- carcost: start view 1072 calls / 11.36M tris / renderFrame CPU 8.4 ms with cars vs 749 / 10.19M /
  5.5 ms without (+323 calls, +1.17M tris, +2.9 ms; round 2 +397 calls, the reviewer measured +371
  and +3.9 ms); aerial 1753 vs 1377 (+376; was +491), +0.73M tris, 9.1 vs 6.5 ms; 60–61 fps.
- traffic: 22 cars, 0 stuck, average 10.1–10.7 m/s, 59–60 fps.
- physics: unchanged (0–100 7.6 s, top 140, 100→0 39 m, full lock at 60 no squeal, 0.57 rad/s).
- trailer: reversing 2.2 m/s, 0 light flips, 74.5° drift after 8 s, tap → jackknife 1.7 s; m1 passes.
- carflee: 0 stuck windows in all three runs (last pass; one window in some earlier passes).
- realpursuit (3 × 30 s, the AI chaser ramming, no teleports): smitare stuck windows 0 / 0 / 1,
  off-road 6 / 3 / 13 s (the reviewer's run 2: 4 windows, 29 s, 15 s wedged); chaser 0 / 2 / 0
  windows; every TAGEN ends parked with hazards (one on the pavement after the ramming).
- chasecheck 15 / 7 / 23 s to < 40 m; pursuit: TAGEN → pulls over with hazards, SMET works.
- story: `#7 idle`, no errors, day 7 STOPPAD (the Škoda catches Ove).

Requests for others: **fx** - `fx.exhaust` could take alpha and size (the puff shape is fx's; the
cars now emit sparsely). **systems** - stages.js's day-7 chaser: spawn it facing Ove and pass
`rubber` (the API honours it on cruise only).

## Round 4 (perf, the final reviews' cars issues)

1. **Draw calls** - far bodies instanced per model and snow state (above), busts hidden in far cars,
   the instance and wheel writes deduplicated per view/change, far casters kept out of the near
   cascade. Car calls per frame across passes (shadow / AO / main), 159 cars, 1280x720, RTX 4070, the
   same instrumentation (`carperf`) on GAME's round-3 cars and on these:
   - start view: 316 (71 / 89 / 156) -> 134 (41 / 29 / 63); all calls 1630 -> 1268
   - Solrosvägen in the Saab (chase camera): 582 (93 / 154 / 335) -> 287 (57 / 55 / 174); 2229 -> 1639
   - the big car park (fixed spot): 491 (82 / 127 / 283) -> 245 (48 / 45 / 151); 2128 -> 1636
   - aerial: 465 (2 / 176 / 287) -> 86 (5 / 27 / 54); 2707 -> 1942
   (the near-car share moves ~±8 % between runs with where the traffic happens to be)
   What is left in the main pass on Solrosvägen: near bodies 50, far batches 31 (60 cars in 15
   batches), plates 20, wheel pools 18, lamps 15, glass 12, snow caps 11 + far caps 9, busts 5.
   `lodab`: the instanced and the per-car far bodies are the same image (the only differences are a
   traffic car that moved between the shots and the speckle seed of the paint's snow).
2. **CPU** - 137 of 159 cars asleep half a second after load. car.sync over all visible cars 0.13-0.24
   -> 0.03-0.05 ms per frame, a parked car.step pass 0.11-0.13 -> 0.013-0.04 ms per step, the n²
   collideCars loop 0.47-0.79 -> 0.21-0.34 ms (pairs of sleepers return at once; the broadphase is
   gameplay's), the game's stepWorld 1.55-1.94 -> 1.08-1.16 ms and syncAll 0.68-1.04 -> 0.56-0.75 ms
   per frame; one instance rewrite 0.011-0.018 ms. renderFrame CPU (noisy, the GPU is shared) e.g.
   start 9.6 -> 7.9 ms, Solrosvägen 9.3 -> 7.7 ms. 60 fps everywhere.
3. **dispose()** - 60 cars spawned in view and removed with `dispose()`: renderer geometries +2..6 (the
   town and peds, not per car), textures and programs +0; with a seated bust in each +61 -> +0..2.
4. **First entry hitch** - `warmCars` (see For main.js).
5. **Wheel-well liners** - half-disc walls that follow the arch, nothing below the axle. (This did
   *not* remove the dark crescent under the tyres, as this note claimed: that was the inside-out tyre
   lathe, fixed in phase 4 round 2.)
6. **Exhaust** - see Materials.

## Known weaknesses

- The Saab: a hatchback with one fastback line now, but the hatch glass is still a dark pane from the
  chase camera (at ~55° the glass reflects ~5 % of the sky; under it the dark parcel shelf), no Turbo
  spoiler. Seen through the hatch glass at a grazing angle, the far C-pillar's inner lining shows a
  stair-step edge (the offset inner layer of the loft; round 3 already had it).
- The Golf: lower belt, rolled-in upper side, lower nose and a broader C-pillar (phase 4 round 2), but
  still upright and flat-sided from a long lens; the roof stays at the real 1.48 m. No VW roundel (the
  brief forbids logos), so the Golf, Audi and BMW lean on their shapes and lettering.
- Shaded lower doors mirror the road (`ROAD_GLSL`), not the snow banks: a dark car in shade stays
  dark below the shoulder (the round-2 choice against two-tone cars).
- In the sunlit front 3/4 the shoulder (facing the sun) is still ~2× the lower door's L - a soft
  gradient now, not a band; the rear door is at 1.6×.
- The AI: a smitare or chaser shoved off the asphalt by ramming can still spend 10+ s getting back
  (car parks count as off-road for flee/traffic); the three-point turn needs a clear street.
- Near bodies are drawn one by one (body 4-5 surfaces + glass + lamps + plate + snow cap); near
  bodies are ~25 % heavier in triangles than round 2. Plates of far cars (46-72 m) are still one call
  each. Snowed-in and clean far cars of one model are two batches (snow is a shader define).
- `warmCars` only helps once main.js calls it; until then the first car of a type / variant near the
  camera compiles and uploads in that frame.
- Lamps are boxes with a shader pattern, not modelled reflector bowls; wheels don't show suspension
  travel; the trailer is kinematic.

## Phase 4, round 2 (the whole-game review's cars list)

1. **Tyres were built inside out** (major) - `wheelGeometry()` lathed the tyre profile (and the far
   'lod' one) from the outer bead to the inner one, i.e. descending in the lathe's height: three's
   `LatheGeometry` faces outwards only for an ascending profile, so tread and sidewalls faced the axle.
   From outside the near tread was back-face culled and the inside of the far tread showed below and
   behind the tyre: the dark crescent / "flap" of round 1 and 4 (the liner fixes never touched it), and
   the tyres were lit from the wrong side. Both profiles are reversed now (a comment says why); the rim
   `ring()` lathes all run from the outer radius inwards and already faced +x (checked: `wheelfaces`,
   and `wheels_bare` FrontSide = DoubleSide for all eight styles). Nothing else changed: no DoubleSide,
   same triangle counts; `wheelCache` is per page load (nothing persistent to clear).
2. **The Saab 900** (major) - the hatch glass runs down to a crisp lip at the very tail (the ~17 cm flat
   lid behind it, which read as a saloon's boot side on and from the chase camera, is gone; the lip is
   the crease, the body top under the glass flat and 2-3 cm below it so nothing z-fights); the glass
   wraps ~2-3 cm further down into the C-pillars; the windscreen's wrapped corners and the strip beside
   them are a glossy black frit (`FRIT` = 0x14181d, the LOD glass colour: the `plastic` car shader's
   `lodGlass` path renders it as dark glass - roughness 0.07, the sky like glass) instead of round 3's
   matt black band; the rubbing strip is taller and prouder (0.392-0.476 m, 2 cm proud) with a brighter
   insert (0x8e9296, 0.427-0.438). The tail lamps already sat in a full-width black band. No
   hockey-stick C-pillar (that is a 9-3 / 9-5 detail). len / wid / height / axles / seat / hitch
   unchanged. Triangles 20,644 -> 21,336 near, 4,326 -> 4,390 LOD; draw calls unchanged (7).
   The paint colour is the world's (src/world/ove.js, phase 4 round 2: a slate-blue metallic, made bluer in round 2b: 0x2c5596);
   with it the title shot's bonnet reads (76, 93, 115) and the shaded door (21, 30, 50) sRGB (navy:
   (67, 79, 98) / (12, 16, 29)).
3. **Sleeping cars** (minor) - a car with a trailer never falls asleep (`sleepCheck`: `!this.trailer`;
   also a reason to wake): its trailer collides with other cars only inside the car's step, and a
   sleeping Patrick's trailer let the Saab drive into it (the review measured the Saab's centre 0.13 m
   from the trailer's; now it stops at 3.60 m, `trailersleep`). A sleeping car zeroes its spring
   velocities and wakes when anything pushes its springs (`_sus.pv / rv / hv` non-zero): main.js's
   `kickTyre` (`c._sus.rv += ...`) rocks a sleeping parked car again with no change in main.js (max roll
   0.026 rad on a Volvo 740; was 0). Anyone else who pokes a parked car's springs gets the same.
4. **The Golf** (minor, partly) - belt ~2.5 cm lower along the doors (0.965 / 0.948 at -0.4 / 0.4,
   still rising to 1.02 at the C-pillar), the cowl and the windscreen foot with it; the upper side rolls
   in 7 cm above the shoulder line (was 4.5) and the door below it leans in towards the sill; the bonnet
   front and the whole face band 2.6 cm lower (lamps / grille 0.66-0.81 m); the rear door glass ends 6 cm
   further forward (a broader C-pillar). The roof stays at the real Mk6's 1.48 m (the review suggested
   1.43; the physics height is 1.48 too). Triangles 18.4k -> 18.7k.
5. **Road grime** (minor) - `GRIME_FRAG` is directional spray now: streaks long along the car and a few
   cm tall on the sides (q.y x40, q.z x1.5) plus finer ones, soft drip runs on front / rear faces
   (`gTN.z` picks the face), round 3's broad blotchy cloud dropped, a crisp ragged top edge where the exposure
   mask falls below a threshold (0.42 at grime 0 -> 0.2 at 1: the mask rises round and behind every
   arch, so the spray line does too; soft on front / rear faces), the droplet speckle on a lattice turned
   37 deg and finer (61/m: the axis-aligned 31/m lattice read as square pixels), the salt / wet colour
   varied by the streaks, fine noise faded by `fwidth` (far cars). Salt and wet colours unchanged. The
   amount reaches the shader as `CAR_GRIME_AMT` (the material's `uCarGrime`, or per instance `vCarAmt` =
   `cari.w` on the instanced far bodies; it used to be folded into `vCarGrime`). Derivatives are taken
   before the branch, and a noise is only looked up where it has weight (at most three per pixel, as in
   round 3): `grimegpu` (EXCLUSIVE, `&gputime`, min of 120 frames, 3 alternating runs each) big car
   park 2.50 / 2.75 / 2.62 ms with round 3's grime vs 2.69 / 2.70 / 2.74 with this one, Solrosvägen
   2.67 / 2.88 / 2.25 vs 2.61 / 2.49 / 2.93 - no difference above the noise (medians 3.7-5.2 ms for
   both: the GPU is shared).

API: nothing new or removed. `car.asleep` semantics: never true for a car with a trailer; a push on
the springs wakes it.

Measured (my copy, 1280x720, RTX 4070 shared): physics unchanged (0-100 7.6 s, top 140, 100->0 39 m,
full lock at 60: no squeal, 0.57 rad/s); trailer reversing 2.2 m/s, 0 light flips, 74.5 deg drift;
carcost: start view 488 calls with cars vs 393 without, aerial 502 vs 462, 60-61 fps; draw calls per
near car unchanged.

