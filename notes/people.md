# People (phase 2) — `src/actors/models.js`, `src/actors/character.js`, `tools/people.html`

Realistic, PBR-lit winter people for DESIGN.md §3 and §8. No cartoon heads, no flapping mouths,
no monsters. Look-dev page: `PORT=88xx ../browserslot node tools/pageshot.mjs tools/people.html`
(views below); in-game checks: `PORT=88xx ../browserslot node tools/shot.mjs people pplsmash peopledrive`
(`tools/scenarios/people.mjs`; also `pplperf`, `pplkneel`, and since p4r2 `pplanim` (the animation LOD,
A/B + checks) and `pplcine` (dialogue shots stay at level 0)).

Phase 4, round 2 (the whole-game review's last fix round): see "Phase 4, round 2" below — close-up
clothing and hair (scarves rebuilt as a knit band wound twice round the neck with folds, a knot and a
fringe; alpha-tested strand cards along the hair shells' outlines, fins that break the helmet
silhouette; fur tufts on Patrick's parka trim; Jimmy's hoodie band hugging the neck with a rolled hem;
rounder lapels), an animation level of detail in `Character.sync` (far people posed every 2nd/4th
frame, their matrices skipped while they stand still) and a mid level of detail for the cast from
6 m (screen-size distances, so dialogue shots stay at level 0).

Round 4 (final polish, after the p4 reviews): see "Round 4" below — runtime level of detail (every
person is a `PersonLOD` with a far level on the same skeleton: the cast beyond 15 m, pedestrians beyond
40 m, no shadow beyond 60 m; people cost 1.2–1.75 M → 0.23–1.08 M triangles a frame), faces that are no
longer vinyl (an oil map driving specular, roughness and relief: pores, creases, the T-zone; cold-flushed
nose, cheeks and ears; deeper sockets and nasolabial folds), the three young men apart, Jimmy's hood
outside his jacket, and `st.kneel` for Sonja's grave.

Fix round 3 (after review r3, "high 6"): see "Round 3 (review fixes)" below — the cat redesigned with a
`hold(on)` pose, a shovel and a spanner for the work poses, sunk eyes with the lid over the iris,
painted brows, ears with relief, a per-texel specular mask, kids' faces, real sunglasses, hair that
cannot Fresnel to white, curtains with a back, a lock of strands, run foot slip, idle, talk + listen,
a lazy face bake.

Fix round 2 (after review r2, 6/10): see "Round 2 (review fixes)" below — baked per-character face
textures on dense lod-0 heads, real female faces, a wider spread of faces, hair that isn't a helmet,
a cat that is a cat, hands that hold the pencil and the clipboard, a shirt and tie, Anita's
cardigan, shorter necks, blinking, `carry` and `work` poses.

Fix round 1 (after review r1, 5/10): new hands (palm, fingers, thumb on their own bones; grip,
fist, phone, pen poses), a re-sculpted head (anatomical landmarks, nose, eyelids, ears, lips,
ageing, stubble, fat), hair that sits on a tinted scalp with soft hairlines and falls straight,
trousers kept inside coats + coat skirts that follow the thighs, a stockier Ove whose collar clears
his chin, the phone at the ear with a visible phone, Parvaneh's bump, Rune's draped plaid, a new
cat, rounder kids' snowsuits, real hands-in-pockets, planted feet, Patrick's cast, lod-1 busts.

## How a person is built

- **One `THREE.SkinnedMesh` per person and level of detail** (round 4: the levels hang under a
  `PersonLOD` = `model.lodNode`, see Round 4), one draw call per surface:
  - cast (lod 0): `skin`, `lamp` (glossy eyes; Ove's phone and pencil), `hair`, `fabric`, `leather`
    = **5 calls**; Rune +2 (`metal`, `rubber`: the wheelchair) = 7; Vita skjortan's shirt (and the
    clipboard clip) is `painted` (smooth cotton instead of wool): 6.
  - the cast's `skin` material is **their own instance** with the baked face texture as `map` and a
    per-texel specular mask in its alpha (same draw calls); `hair` is one shared instance for
    everybody (and the cat) whose specular follows the albedo; the cast's `lamp` (eyes, phone,
    pencil, Anders' sunglasses, the shovel blade, the spanner) is one shared instance with a thinner
    clear coat (round 3, see Materials).
  - pedestrians (lod 1): `skin`, `hair`, `fabric`, `leather` = **4 calls** (eyes are `skin` at lod 1–2);
    rollator users +1 (`metal`).
  - busts: **2 calls** (`fabric` + `skin`); the cat: 3 (`hair`, `skin`, `lamp` eyes).
  - Notebook paper and the plaster cast are `fabric` (matte), the phone and pencil `lamp` (lacquer /
    glass); `painted` only on the shirt (and the clipboard clip).
  Characters use `realMaterials(geo, { snow: false })` (shared cached materials).
- Geometry is generated procedurally in the rest pose, in model space (feet at the origin, facing
  +Z): lofted cross-sections (torso/coat, sleeves, trouser legs, palm and fingers, shoes, boots,
  scarf, collars, blanket, ears, nose), a sculpted head (sections from chin to crown placed on
  anatomical landmarks), offset shells for hair, brows, beards and hats. Vertex colours paint lips,
  contact shadow in the folds, cold flush, stubble, the scalp under short hair, age, quilting,
  reflectors, plaid, the cat's tabby.
- Skinning: blended weights at shoulder, elbow, wrist, waist, hip, knee, knuckles; **coat skirts are
  weighted to the skirt bones** (split at the centre line), which turn 0.52 × the thigh's angle
  standing (the same as round 1's thigh weights) and 0.95 × seated, drawn in and flattened onto the
  thigh (a seated long coat lies on the lap instead of standing out as a dome); **trouser vertices
  covered by a coat are clamped ≥ 1 cm inside the coat's surface**, so nothing clips at the hips
  standing, walking or seated (`hips_*` views).
- Proportions: adult head ≈ 1/7.5 of the height; kids have kids' proportions.

### Skeleton (28 core bones + lids / skirts / props / chair / aid)

`pelvis, spine, chest, neck, head, jaw, armR, foreR, handR, armL, foreL, handL, thighR, shinR, footR,
thighL, shinL, footL, fingR, tipR, thumbR, fingL, tipL, thumbL, idxR, idxTipR, idxL, idxTipL` (the pose
arrays address bones by this order: `buildCharacter` sorts the core bones first). `fing*`/`tip*`: the
middle, ring and little fingers at the knuckles / middle joints; **`idx*`/`idxTip*`: the index finger
on its own bones** (`m.idxs`, `m.idxTips`); `thumb*` the thumb at its base. Extra bones: `lidR`/`lidL`
(upper eyelids, lod 0: blinking; `m.lids`), `skirtR`/`skirtL` (coat skirts, see Clothes), props.
Fingers curl about the knuckle axis towards the palm; at lod 0 the four fingers are separate tubes,
at lod 1–2 and in mittens one block (on `fing`/`tip`).

### The head

- **lod 0 (the cast): a dense grid** (rings ~1.5 mm apart, 72 columns crowded towards the face,
  normals by central differences over the grid: no horizontal bands) with a cylindrical UV (u round
  the head, the face getting ~75 % of the width; v = h) into a **per-character baked face texture**
  (320 × 272 RGBA, linear, mipmapped, ~0.5–0.8 mm per texel on the face; cached per def object).
  The texture holds *all* of the face's colour: lips with a defined vermilion border, the mouth line,
  lid creases, tear troughs, nasolabial lines, frown lines, crow's feet, forehead lines, eye bags,
  age spots, freckles, moles, skin grain, stubble grain, the brows as single hairs (round 3: no strips
  over them) and single hairs thinning out at the hairline; its alpha is the specular mask (round 3).
  It stores multipliers / `TEXK` (1.5) and every `skin` part of a lod-0 character is TEXK brighter;
  the nose takes the face's texture under it, the other skin parts point at a neutral texel. Broad
  terms are baked on a coarse grid and interpolated, the sharp ones per texel: ~25–30 ms per
  character (once; cached; lazy since round 3, see API).
- lod 1 (peds): 32 columns, rings through the mouth, nose and eyes, analytic normals, the colour in
  vertex colours; the eyeballs (matte) get a painted upper lid and lash line, the sclera dimmer.
- Landmarks (head heights from the chin): mouth line 0.192, nose base 0.288, pupils 0.478, nasion
  0.51, brow 0.555, hairline ~0.75 (kids lower). Profile splines for width / front / back depth are
  placed on these; `headDelta` adds sockets, brow ridge, cheekbones, the muzzle, lips, philtrum,
  mentolabial fold, chin, nasolabial folds, and with age eye bags, jowls, marionette lines.
- Nose: a loft of bell-shaped sections interpolated between keys (no facets), a **soft, wide bridge**
  (a narrow sharp ridge rendered as a bright stripe), the top sunk into the face at the nasion, wings
  as lobes at the base, nostrils and alar crease in vertex colour. `face.nose` scales projection,
  `noseW` width, `hump` adds a dorsal hump, `tip` turns the tip up (+) / down (−).
- Lips (`lipAt`): a mouth line with corners (down with `frown`), an upper lip with a Cupid's bow and
  a soft ridge at its border, a fuller lower lip; shape and colour come from the same masks.
- **Women** (`sex: 'f'`): jaw 0.86, chin 0.9, brow ridge 0.2, nose and nose width 0.88, lips 1.3,
  eyes ~8 % larger and 0.008 higher, a narrower lower face, higher, more forward cheekbones, a rounder
  upright forehead, thin arched brows by default, darker lash lines, redder lips. The make-up-like
  terms (lips, lash lines, arched brows) scale with `femK = 1 - kid`: girls don't get them.
- **Kids** (round 3, by `kid` = (15 − age) / 12): a short philtrum, fuller round cheeks (buccal fat, a
  wider lower face rather than a narrow jaw), a small chin, a round prominent forehead, shallow eye
  sockets, more open lids, a short nose with a low flat bridge, a neutral mouth (corners not down, no
  corner shadow), soft or no lines (lid crease, tear trough, nasolabial, under-lip ×0.25–0.5), rosy
  1.2, fine pale brows, natural lips.
- Face sections are a little rounder than in round 2 (front superellipse exponent ≤ 2.3 instead of
  2.42: the face no longer splits into a lit and a dark plane). Warmth: redder round the nose and
  nostrils and at the inner eye corners, the lower lids a little darker.
- Eyes (round 3): the eyeball sits ~1.5 mm deeper (its front 0.0105 head heights behind the face
  surface) and **the upper lid covers the top ~1.5 mm of the iris** for everyone (more frowning or
  old: Ove's heavy lids), no sclera above the iris. lod 0: a sphere with its rings crowded round the
  iris (iris 0.48 of the eyeball, a crisp dark limbal ring, a lighter collarette, radial fibres; dark
  irises lifted to a value of ~0.11 so they stay brown), the upper lid's shadow painted on the ball,
  reddish corners, the **caruncle** (pink, at the inner corner), a pinkish **wet line** on the lower
  lid's margin; arched upper and lower lids that meet at the corners, a lid margin with thickness and
  a dark lash line (women only, not girls). **Blinking** (lod 0): every 2–6 s, ~0.2 s, now and then
  twice; the lids drop when writing (looking down), close when lying down.
- Brows (round 3): at lod 0 **no strips**: single hairs painted in the face texture, growing up at
  the inner end, outwards along the body and down at the tail, a ragged edge, sparser to the tail;
  Ove's darker salt-and-pepper (0x5e5a54), Rune's grey-white hairs with the skin between them, kids'
  fine and pale. lod 1–2 keep thin strips (0.8 mm-ish, mixed 40 % towards the skin).
- Ears (round 3): lofted plate (24 columns at lod 0) with real relief on the outer face: the helix
  rolled out round the back and top edge (~2.5 mm), the scapha groove inside it, the antihelix
  ridge, a deep concha that bends the whole plate, the tragus, a thick lobe; vertex-colour AO (dark
  in the concha and groove and on the face towards the head) and slightly redder thin parts, so
  they neither glow nor read as cardboard.
- Specular mask (round 3): the face texture's alpha is a specular scale (0–1.6) read by the cast's
  skin material: the forehead and nose tip a little oilier, wet lips, drier cheeks and **matte flanks
  of the nose bridge** (the lit flank was the brightest thing in every portrait), stubble and the
  hair-tinted scalp matte. Round 4: the alpha is the skin's oil and also drives roughness and relief
  (pores, creases): see Round 4 / Faces.
- Colour: lips, mouth line and corners, contact shadow (sockets, lid crease, nose base, nasolabial
  folds, under the lower lip), cold flush, a little unevenness in every face; age (> 45) makes the
  skin sallower and blotchier, adds eye-bag shadow, crow's feet, marionette lines, hollow cheeks and
  (lod 0) three forehead lines; `beard: { style: 'stubble' }` turns the beard area blue-grey (every
  adult man gets a faint shadow).
- `face.fat` widens cheeks and jaw, adds jowls and a double chin; `frown` lowers the brows' inner
  ends, the lids and the mouth corners and adds frown lines.

### Hair

- The scalp under the hair takes the hair colour, fading out ~1 cm below a noisy hairline, so every
  hairline is soft (at lod 0 painted as single hairs in the face texture; the shells start ~4 mm
  above it with a ~1.5 cm thickness ramp, no polygon zigzag). Short cuts: `crew` ≤ 3 mm on top,
  ~0.5 mm at the sides; `buzz` (lod 0) is paint only. Women have a rounded temple hairline.
- `bob`: a side parting, a soft side-swept fringe lying on the forehead, the hair falling from the
  widest part of the skull to the jaw (longer in front), ~1 cm off the cheeks, the ends turned under.
- `long` (unchanged for `pony`/`bun`): falls over the ears down the sides of the face to the jaw
  (curtains, not a tight cap), on down the back (`longHair`), and **one lock forward over the right
  shoulder, in front of the scarf, to the chest** (`frontLock`, a swept tube).
- Under hats the hair is pressed flat (≤ 2 mm) and the hanging parts start behind the cheek and hug
  the head (no flaps beside the face).
- Beards stop round the lips (a gap, the mouth shows), follow the cheek line up to the sideburns,
  ragged lower edge.
- Round 3: the shared hair material's specular follows the albedo (`TRI_SPECK` = 0.2 + 0.7 × the
  albedo's brightness): **dark hair cannot Fresnel to white** in a backlight or the portraits' rim
  light, grey and fair hair keep a soft sheen (roughness 0.52). Hanging curtains (`bob`, `long`) are
  slabs: `shellMesh({ inner })` adds a dark inner layer joined to the outer one along the lower edge
  and the sides, and `ao` darkens the last few cm of the edges; they hang closer to the cheeks, with
  clumps of strands as ridges, ragged ends and a thin front edge. The bob's ends step by ~1 cm from
  lock to lock (layered, not one panel). Long hair's front lock is four flattened strands that fan
  out and taper, of different lengths (lod 0). Parvaneh's hair is a little lighter (0x2a1c14).
- Strand streaks along the meridians, darker roots, ragged edges; `messy` = tufts and a ragged fringe,
  `curly` = springy lumps; `bob` falls straight down from the widest part of the skull (not hugging
  the jaw); `long` is tucked behind the ears (no side flaps), falls as a curtain behind the ears and
  down the back in loose locks with a ragged end, and women get a side-swept fringe.

## API (unchanged names, extended)

```js
import { CHARS, buildCharacter, animateCharacter, randomPed, buildBust, buildCat, carryPoint } from './actors/models.js';
const m = buildCharacter(def, { lod, bust, remap, headLod, faceTex, lazyFace, far, mid, lazyFar, cards });   // lod 0 (cast), 1 (peds, default for name 'ped'), 2
animateCharacter(m, st, dt);                             // st: see below; call every frame (Character.sync does)
carryPoint(m, outVec3);                                  // world point for the carried cat's ROOT (carry pose)
kneelPoint(m, outVec3);                                  // world point between the hands in the kneel (the bouquet)
LOD_DIST                                                 // { cast: 15, mid: 6, ped: 40, shadow: 60, hyst: 0.1 } (metres, screen size: see Phase 4, round 2)
buildFarLevels();                                        // build every mid / far level still waiting (tests)
faceTuning({ pore, crease, relief });                    // look-dev: the faces' micro-detail (before building)
```
`far: metres` gives the model a far level (lod-2 body, lod-1 head for the cast / lod-2 head for
pedestrians, surfaces folded into fabric + skin) beyond that distance, built in idle time (`lazyFar:
false`: at once). `Character` passes `far: LOD_DIST.cast` (15) or, for `name: 'ped'`, `LOD_DIST.ped`
(40). Nothing to call per frame: three.js picks the level in every render from that render's camera.
`faceTex: false` skips the baked face texture (lod-0 head without it). `m.faceTex` is the texture
(dispose it if you ever throw a cast member away; they are built once). **Lazy face bake (round 3):**
the texture is baked a few columns at a time in idle time (`requestIdleCallback`); whatever is left
is finished synchronously in the mesh's first `onBeforeRender`, so no frame and no portrait ever
shows a half-baked face, and cast members out of view at load cost nothing then
(`lazyFace: false` bakes at once).

Model fields: `root` (Group; position/yaw it), `body`, `mesh` (the level-0 SkinnedMesh), `meshes` ([mesh,
midMesh, farMesh once built]), `lodNode` (the `PersonLOD`), `midMesh`, `farMesh`, `cardMesh` (level 0's
hair / fur cards, a child of `mesh`; p4r2),
`bones`, `hips` (= `pelvis` bone), `spine`, `chest`, `neck` (bone; `rotation.y` = look),
`headBone`, **`head` (an Object3D marker at eye level in the middle of the face — portraits and
look-at code aim here)**, `mouth` (= `jaw` bone; rotation.x 0..0.16), `arms[0|1]` (upper-arm
bones; **index 0 = right arm (−X), 1 = left arm (+X)**), `fores`, `hands`, **`fings`, `thumbs`**,
`legs[0|1]` (thigh bones), `shins`, `feet`, `props` ({ note, pencil, phone } bones, scaled 0/1),
`height` (top of the head/hat; Rune: seated height ≈ 1.43), `headTop`, `legLen` (hip-joint height:
the seat code puts the hips `0.12` above the seat with `root.y = seatY + 0.12 - legLen`), `armLen`,
`radius` (collision radius: adults 0.28–0.4, kids ~0.2–0.25, Rune 0.45), `kind`, `D` (body
measurements), **`headP`** (head parameters), `d` (normalised def), `squash`, `phase`.

`animateCharacter` overwrites every core bone each call, so drive poses through `st`. Also exported:
`GAIT` (`{ walk: 1, run: 1, k: {} }`: a stride-scale hook and locomotion's tuning knobs for look-dev,
`tools/gait.html` sets them live; leave them alone, the feet are planted).

### Animation flags (`st` = `Character.anim`)

| flag | effect |
|---|---|
| `speed` (m/s) | idle (breathing, weight shift, glances; pregnant characters now and then rest a hand on the bump) → walk → brisk walk → run. Walk or run is a **switch with hysteresis** (a run from 4.1 m/s, a walk again below 3.6, cross-faded over ~0.2 s), not a blend. **Feet are planted** (see *Gait* below). |
| `air`, `vy` | a fall or a bounce: a mild air pose |
| `jumpWind`, `jumping`, `landT`, `jumpV` | a jump (Character sets them, see *Gait*): the wind-up (0..1: knees bend, trunk folds, arms back, lids squint, jaw clenched), the flight (`vy / jumpV`: stretched on the way up, a small tuck and the arms out over the top, legs reaching for the ground; on the move a leap, the left leg leading), the landing (s since: the knees take it in ~70 ms, up again by ~0.4 s) |
| `kick` (1 → 0) | tyre kick with the right foot |
| `talk` | head nods and slow tilts; both hands up in front of the waist, the leading one making continuous small beats (the palm turning up and over), the other lower and quieter, swapping every few seconds; jaw moves a few mm |
| `wave` | left hand raised, open, waving |
| `cheer` | a 'yes!': the right fist pulled down to chest height, the elbow driven back, pumping |
| `write` | an 8 mm notebook open on the left palm (the thumb on its edge), the pencil pinched between the right thumb and index (it rides on the index's last joint), its point on the page, head and lids down |
| **`carry`** | the cat in the arms: the right forearm across the front under it, palm up, the left forearm over its back, looking down at it. Put the cat's **root at `carryPoint(m)`** (no offset), yaw = carrier's yaw + 90°, and call `cat.hold(true)` |
| **`work`** (+ `workKind`) | hold-E jobs, whole body: `'bend'` (default: bent over, hands working at knee height), `'low'` (crouched, hands near the ground: a tyre; Ove holds a **spanner**), `'shovel'` (bent, knees deep, **a snow shovel**: the left hand on its T-grip by the hip, the right 0.57 m down the shaft, the blade flat on the snow ~1 m ahead, push and lift), `'wall'` (standing, hands at waist/chest height: a radiator). Props `'shovel'` / `'wrench'` (Ove has both) show only in their pose |
| **`listen`** (round 3) | someone else is talking: attentive, a small nod every few seconds, the head a little tilted (main.js may set it on the listener in a dialogue) |
| **`kneel`** (+ `kneelReach`) (round 4) | down on one knee (Sonja's grave): the right knee on the ground, its shin and foot lying behind, the left foot planted forward, the torso upright, the head bowed, the eyes down (a small nod while `talk`). Without `kneelReach` an automatic sequence from the moment `kneel` is set: going down holding the flowers at the waist (~0.5 s), leaning in and laying them on the ground ~0.42 m (× height/1.78) ahead of the root, ~0.27 m above it (0.6–2.3 s), straightening up with the hands resting on the forward knee (from ~2.9 s). `kneelReach` (0..1) drives the reach by hand (0 = resting, 1 = laying). `kneelPoint(m)` = the bouquet (between the hands). Whole body; blends in/out over ~0.5 s |
| `phone` | the phone at the right ear: its top at the ear canal, the fingers up its back, the palm towards the cheek (cast with `'phone'` in `props` show the phone) |
| `push` | both hands grip the wheelchair's push handles (0.75 m ahead of the root, ~0.95 m up) |
| `seated` + `driving` | seated; `driving` = hands gripping the car's wheel rim at ten to two, palms towards the rim (the wheel of carmodels' `interior()`: 0.5 m above / ahead of the seat point, radius 0.19, tilted 0.45 rad); else hands relaxed on the thighs |
| `flung` + `flungT` | knocked over backwards, limbs loose |
| `down` + `downLeft` | lying on the back; in the last 1.3 s gets up: sit up → one knee → stand |
| `look`, `spin`, `yell` | neck yaw / old air spin / jaw open |

`style.pockets`: hands in the coat's side pockets (hand slides in out of sight) or, under short
jackets/bombers, the jeans' front pockets with the thumbs out; hands come out for any other pose.
Rollator users grip the handles, stick users the crook. Smoothing: every flag blends in/out over
~0.15–0.4 s (`animateCharacter(m, st, 0)` snaps).

Hand shapes (internal, `handShape`): relax, grip, fist (round 3: the tips folded into the palm, the
thumb across the fingers), open, talk, phone, pen (index + thumb pinch,
the other three curled), note, pocket, board (a clipboard pinched by its top edge: fingers along its
outer face, the thumb over the edge), carry, limp — set by the poses above. A shape is
`[knuckles, middle joints, thumb flex, thumb opposition, thumb lift, index knuckle, index middle]`.

### `kind: 'wheelchair'` (Rune)

The chair (frame, seat, push handles, spoked wheels with hand rims, casters, footrests) is part of
his mesh. When `speed > 0` the wheels and casters roll and his hands grip and push the hand rims;
idle hands rest in his lap. The plaid blanket lies flat over his thighs, folds over the knees and
hangs in front of the shins with soft folds (two-colour check with light lines). In a car the chair
is hidden. **He cannot be flung** (`Character.invulnerable = true`).

### Character.js

API and physics unchanged from phase 2 (radius/height from the model, toned-down fling, longer down
time with the get-up animation, `game.onGetUp` when standing again). Round 4: the constructor builds
the model with its far level (`far: LOD_DIST.cast`, or `LOD_DIST.ped` for `name: 'ped'`;
`new Character(def, { model: { ...buildCharacter opts } })` overrides), `anim.kneel` / `anim.kneelReach`.
Phase 4, round 2: the cast also gets `mid: LOD_DIST.mid`; `sync(dt)` has an animation level of detail
(`export const ANIM_LOD = { on, near: 30, off: 12 }`; per character `animLod` (false for Ove: set it
false on anyone who must be posed every frame), `lodEvery` (1 / 2 / 4, this frame's), `animStride(dt)`);
see "Phase 4, round 2".

## The cast (`CHARS`)

`ove, parvaneh, patrick, patrickCast, sara, nasanin, jimmy, adrian, anita, rune, anders,
vitskjorta` — DESIGN.md §3. Each has their own face now (round 2): Ove square-jawed, long nose with
a hump, thin lips, small deep-set eyes, heavy salt-and-pepper brows, grey stubble, aged a little
(`face.old`); Parvaneh an oval face, full lips, big dark eyes, thin arched brows; Patrick long and
narrow, freckled; Jimmy round and soft (round 4: a wide jaw, a short upturned nose, raised brows over a
soft brow ridge, a small chin, a smile, ruddy, oily skin, freckles); Adrian lean and angular (a narrow
face, high cheekbones, a square prominent chin, a long straight nose with a hump, low straight heavy
dark brows); Anita soft and old (wrinkles, upper-lip lines, age spots); Rune a big hooked nose, big
ears, hollow cheeks, jowls; Anders a square chin and high cheekbones, a hint of a smug smile; Vita
skjortan narrow and long (a narrow jaw, a weak chin, a long thin nose with a drooping tip, high thin
arched brows, a receding hairline, close-set eyes, a thin tight mouth, pink cheeks). Ove is stocky (1.75 m, build 1.3, belly), frowning,
grey crew cut, stubble. Parvaneh: visible bump (≈ 16 cm, the coat drapes from it
and its front hem lifts), leans back a little, long dark hair with a swept fringe. Patrick's cast:
white plaster from the knuckles to the elbow, a pale sling round the forearm (on the forearm only),
its strap built where it hangs in the cast pose and carried by the chest (no stretching), fingers
curled. Vita skjortan: a white cotton-look shirt (band collar over most of the neck, a turned-down
collar with points, placket and buttons, cuffs with a button, soft folds, bloused over the belt), a
tie with a trapezoid knot and a blade widening to ~8 cm with a pointed tip, standing off the chest; a
clipboard pinched at his side. Anita: a red cardigan inside her coat's V (its own V-neck with a
blouse, ribbed button bands, buttons). Rune: a scarf tucked in (no pillar neck). Old keys are aliases (same objects):
`nick→ove, andrew→patrick, jessi→parvaneh, jay→adrian, steve→anders, maurice→jimmy,
connie→anita, duke→rune, shame→vitskjorta`.

Def fields (all optional): `kind`, `sex`, `age`, `height`, `build`, `belly`, `pregnant`, `skin`,
`eyes`, `face: { jaw, chin, nose, noseW, hump, tip, cheek, cheekY, brow, browArch, browY, width, lips, mouthW, mouthY, noseY, eye, eyeX, eyeY, ear, fat, rosy, old, freckles, moles, smile, cold, oil, rough }`
(`old` adds to the age terms; `eye` scales the eye, `eyeX` moves the eyes apart; round 4: `browY` moves
the brows up/down (head units, ±0.015), `smile` lifts (−: drops) the mouth corners, `cold` the winter
flush of nose, cheeks and ears (default 1, kids 1.2, scaled down on darker skin), `oil` the T-zone's
sheen (default by age: young 1.1 → old 0.7, kids 0.6), `rough` the skin's base roughness (default by
age 0.52–0.62)),
`hair: { style: crew|buzz|short|side|slick|messy|curly|balding|bald|long|bob|pony|bun, color, recede }`,
`beard: { style: stubble|short|full|moustache, color }`, `brows`, `browStyle` (heavy|thin), `frown`,
`sleepy`, `glasses`, `sunglassesOnHead`, `hat: { type: beanie|pom|flatcap|cap, color, color2 }`,
`coat: { type: parka|puffer|pufferLong|wool|jacket|bomber|quilted|shirt|cardigan|snowsuit, color, len, open, under, collar, fur, zipColor, buttonColor, cuffs, hem, hoodColor, belt, reflect }`,
`under` (with a lapel coat and no scarf: a cardigan with a `blouse` colour in its V), `scarf: { color, color2, long, bulk, style: end|two|tucked|loop }`, `tie`, `trousers: { type: jeans|slacks|joggers|snow, color }`,
`shoes: { type: shoes|sneakers|boots|winter|tall, color, sole, trim }`, `gloves`, `mittens`,
`props: ['note','pencil','phone']`, `clipboard`, `bag`, `cast: 'R'|'L'`, `slingColor`,
`aid: 'rollator'|'stick'`, `aidColor`, `blanket: { color, color2 }`,
`style: { swing, stride, stoop, lean, sway, bounce, pockets, stiff, old }` (`old` 0..1: an older,
heavier gait: toes further out, a wider and more rocking step, stiffer swing knees, trunk and head a
little forward, elbows out on a run; Ove 0.6). Small kids in snowsuits are
made rounder automatically (build 1.1–1.3, thicker suit).

`randomPed(rng)`: (faces spread wider: jaw, nose, nose width, hump, tip, chin, cheek, width, lips,
eye size all vary; scarves in four styles) Swedes in November, all ages (~12 % kids, ~25 % pensioners, some with rollator or
stick), parkas, puffers, wool coats, jackets, bombers, quilted jackets; hats, scarves, gloves;
muted palette; varied skin, hair, beards, glasses, faces, builds, gaits. Peds use lod 1.

## Busts — `buildBust(def)`

The character with a **lod-2 body and a lod-1 head** (`buildCharacter(def, { lod: 2, headLod: 1 })`,
rounder heads than round 0) in the driving pose (fingers gripping the wheel), skinning baked into a
plain `Mesh`, 2 draw calls (`fabric` + `skin`), ~5.6 k triangles, ~3.6–4 ms to build. Origin = seat surface, hips 0.12 above and 0.12
forward (unchanged placement for `addBust`). No legs below the knee.

## The cat — `buildCat()`

`{ root, mesh, body, head, height, animate(dt, speed), sit(on), hold(on) }`. Rebuilt in round 3 so it
reads as a cat, not a meerkat: a scruffy warm brown-grey mackerel tabby (0x86705a, warmer browns
between wavy dark stripes broken into bars, a dorsal line, ringed tail with a dark tip, pale belly,
chin and muzzle), ~0.45 m nose to tail base, 0.24 m at the shoulder; **a broad round head** (HS 1.28:
~11 cm across the cheek ruff, a short muzzle with whisker pads and a small chin, the M on the
forehead, dark lines from the eye corners) **on a short thick neck** (a ruff of fur, no column);
**wide-set 5 cm ears** with 4.5 cm bases, cupped, pale cream fur inside; amber eyes with slit pupils
and a dark rim; **thick legs** (forearm ~1.8 cm, round 2 cm paws), **round haunches** blended into the
flank (the thigh's mass sits inside the body's silhouette), a wrist and a hock joint; **a ragged fur
outline** (a few mm of jitter and tufts on the back, cheeks, legs and tail). ~9.3 k triangles, 3 draw
calls (`hair` = the shared hair material, `skin` nose, `lamp` eyes).
- `animate` walks (lateral sequence, trots above ~1.3 m/s); standing still for 2.5 s it sits down:
  **the body pitched ~40°** (rump on the ground), the haunches folded beside it with the thigh along
  the ground, the shin back under it and the hind paws flat, the front legs straight in front of the
  chest, the head low between the shoulders, the tail on the ground round the paws. `sit(true)` sits
  at once, `sit(false)` resets the idle timer.
- **`hold(true)`**: curled in someone's arms: the belly on the forearm (its underside at the root),
  the body slightly curled (chest raised), the front legs folded against the chest, the hind legs
  hanging a little apart, the tail hanging, the head up and looking round. `hold(false)` puts it back
  on its feet (blends over ~0.3 s). Root at `carryPoint(carrier)`, yaw = carrier's yaw + 90°.

## Numbers (RTX 4070, 1280×720)

Round 4: see "Round 4" below (`pplperf`).

Round 3:
- Look-dev `perf` view (35 peds + 13 cast + 22 busts): **493 calls/frame** (unchanged), 4.03 M
  triangles over all passes (round 2: 3.68 M: the lod-0 eyes, ears, curtain inner layers, the lock's
  strands), `renderFrame` 5.4 ms (empty scene 2.9 ms), **`animateCharacter` 0.61 ms/frame for 48
  people**.
- In game (`people`): 60 fps, 1120 calls, 11.37 M triangles all passes (review: ~1128, 11.1 M),
  `cpuMs` 7.1, programs 101 (+1–2: the hair / eye / cast-skin `TRI_SPECK` variants).
- Triangles: cast 33–45 k (Ove 36.5 k, Parvaneh 44.4 k, Rune 45.3 k with his chair; round 2:
  30–40.5 k), peds ~9.1–10.8 k, busts ~6.9 k, the cat 9.3 k (was 5.3 k).
- Face bake ~25–30 ms per cast member (first build 27–40 ms, cached 10–14 ms), now lazy: idle-time
  chunks, the rest on first draw. Builds: ped ~4.7 ms, bust ~4.7 ms, cast ~13 ms cached.
- Foot slip (`slip` view): walking unchanged (0.06–0.14 m/s at 0.6–3.2 m/s); **running 0.13–0.24 m/s
  at 4.5–5.5 m/s** (was 0.60–0.71).
- No console errors in people, pplsmash, peopledrive, start, talk, walk, interrupt, errands (all 9
  ok), story (ends `#7 idle`, no errors), the look-dev page — run with a mirror of the systems
  agent's carry/work wiring in main.js / stages.js (root at `carryPoint`, no offset).

Round 2:
- Look-dev `perf` view (35 peds + 13 cast + 22 busts, everything in view): **493 calls/frame total**
  vs 37 for the empty scene (round 1: 494), ~3.68 M triangles over all passes (round 1: 2.68 M:
  the dense lod-0 heads), **`animateCharacter` 0.70 ms/frame for 48 people** (round 1: 0.65).
- In game (`people` / `start`, same spot): 1042–1071 calls, 7.9–8.1 M triangles all passes (the same
  build with round 1's models: 1068 calls, 7.31 M), `cpuMs` 6.2–8.8, 60 fps; textures +11 (the cast's
  face textures), programs +3–4 (skin with a map, the matte hair instance).
- Face textures: 320 × 272 RGBA8 + mipmaps ≈ **0.46 MB each, ~6 MB for the 13 cast**; baked in
  ~30–35 ms each, once per def (cached; the game builds 12 neighbours + Ove at load: ~0.45 s).
- Build times: ped ~4.5–6.6 ms, bust ~4–6.5 ms, cast ~40–70 ms the first time (texture), ~12–18 ms
  after. Triangles: cast 30–38 k (Rune with chair 40.5 k; the head alone ~15 k), peds ~9–10.5 k,
  busts ~6.5 k, cat 5.3 k.
- No console errors in people, peopledrive, pplsmash, start, walk, talk, report, interrupt, errands
  (all 9 errands complete), the look-dev page.
- Foot slip unchanged (the locomotion was not touched).

## tools/people.html

`PORT=88xx ../browserslot node tools/pageshot.mjs tools/people.html [prefix]`, optionally
`QUERY='?views=f_ove,hands_drive'`. Views:
- `cast_a`, `cast_b`, `cast_side`, `parv_side`, `kids_side`; `crowd`, `crowd_l`, `crowd_r` (24 random
  peds, `&seed=N`, default 21 — a typical mix); `street`.
- heads at eye height 1.6 m: `hf_a|b|c` (front), `hp_a|b|c` (true profile), `h3_a|b|c` (3/4), four
  heads each; per character `f_<key>` and `f34_<key>` (ove, parvaneh, patrick, jimmy, adrian, anita,
  rune, anders, vitskjorta, sara, nasanin, ped); `ove_face`, `ove_side`, `ove_34`.
- hands close up: `hand_relax|glove|mitt|cast|ped|drive|fist|phone|write|push|wave|stick|board|wheel|talk`.
- hips (coat over trousers, every coat type at 0.8 m): `hips_a`, `hips_b`, `hips_walk`, `hips_seat`.
- new: `poses_c` + `p_carry`, `p_work`, `p_worklow`, `p_shovel`, `p_wall`, `p_cheer2` (a cat in Ove's
  arms for the carry), `hand_writer` (the pencil hand), `portraits_soft` (the portraits with the
  suggested softer key light).
- `walk`, `poses_a`, `poses_b`, `p_<pose>`, `rune`, `cat`, `busts`, `perf` / `empty` (logs
  `[t] perf {calls, aoCalls, tris, ms, animMsPerFrame}`), `slip` (logs foot slip per speed; add
  `&sweep=1` for a stride-scale sweep), `portraits` (renderPortrait from hud.js for the cast).
- round 4: `lods_15`, `lods_40` (the cast and peds at level 0 left, the far level right, forced, from
  the switch distances), `lods_l`, `lods_r` (the same from 6 m), `kneel_a|b|c` (the kneel: holding,
  reaching, laying, resting; red balls at `kneelPoint`, a plinth 0.62 m ahead), `hood_a|b|c` (Jimmy's
  hood over his open jacket: front, 3/4, back); `&far=1` gives everybody the game's far level (the
  `perf` view then measures it); `&pore=&crease=&relief=` tune the faces (`faceTuning`).
- p4r2: `c_<key>`, `c34_<key>`, `cb_<key>` (head and shoulders at dialogue range, ~1 m, alone: front,
  three-quarter, from behind: scarves, collars, the hood, the fur trim, the hair's outline);
  `lods_6`, `lods_m` (the mid level), `lods_f0` / `lods_fm` (level 0 vs mid from 6 m, 30-degree lens);
  the `lods_*` views now show level 0 / mid / far side by side. The `[t] cast` log gives each cast
  member's level-0 and card triangles.
- round 3: `e_<key>` (eyes and brows at ~0.1 mm per pixel), `b_<key>` (the head from behind),
  `portraits_big1|2` (the portraits 1:1 at 300 px), `cat_side`, `cat_face`, `cat_held`, `cat_held2`
  (Ove carrying the cat exactly as main.js does: root at `carryPoint`, yaw + 90°, `hold(true)`),
  `p_shovel2`, `p_worklow2` (the work poses from the side), `hand_fist2`.
- Seated drivers in the look-dev page get the car interior's steering wheel for reference.

## For the UI agent (`renderPortrait` in hud.js)

- Portraits work unchanged; `model.head` is the eye-level marker. The cast is lod 0 (face texture,
  glossy eyes). Round 3 was checked with the softer light the systems agent is putting in
  (`PORTRAIT.keyPos = [-1.4, 0.8, 1.3]`, `fill: 0.55`, `env: 0.5`): with it and the face's specular
  mask the nose flank is no longer the brightest thing in the face (`portraits_big1|2` views).
- A lazily baked face is finished the first time the model is drawn, a portrait included: nothing to
  call. Round 4: a portrait is always level 0 (the LOD is picked per render camera), wherever the
  character stands. The review's warm rim light for the portraits is hud.js' own; the faces now have
  colour zones (cold flush, sockets, folds) and an oil map that a rim light would catch.
- Call `animateCharacter(model, { t: 1, speed: 0 }, 0)` first if the model has not been animated (a
  dt of 0 never starts a blink, so portraits never catch closed eyes).

## For the systems agent (main.js)

- **Carry** (the cat): `anim.carry = true` while carrying (not `push`); after `p.sync(dt)` and
  `p.root.updateMatrixWorld(true)`: **`carryPoint(p.model, cat.root.position)` with no offset**
  (round 3: `cat.hold(true)` lays its belly on the forearm relative to its root; the `- 0.14` in the
  systems copy compensated for the old standing cat and now puts it 14 cm into Ove's arm),
  `cat.root.rotation.y = p.yaw + PI / 2`, `cat.hold(true)` while carried, `hold(false)` when put down
  (or when Ove gets into the car).
- **Work** (hold-E jobs): `anim.work = true` with `anim.workKind` `'shovel'` (skotta), `'low'`
  (punktering), `'wall'` (lufta elementet, låsa upp), or the default `'bend'`; Ove's shovel and spanner
  appear by themselves in their poses. For the snow heaps Ove stands ~0.7 m from the heap's centre:
  the blade lands ~1 m ahead of him, on the heap.
- **Listen** (optional): `anim.listen = true` on whoever is listening in a dialogue (small nods).
- **Kneel** (round 4, for the gameplay fixer: Sonja's grave on day 7): `p.anim.kneel = true` in the
  flowers' `holdAt` (instead of `work: 'low'`) and through the outro, `false` afterwards (main.js does
  not reset it). The automatic sequence fits the 3 s hold: down (0.5 s), laying the flowers (0.6–2.3 s),
  resting (from 2.9 s). Put Ove's root 0.42 × (height / 1.78) m (Ove: 0.41 m) behind where the flowers
  should land, facing it: they land ~0.27 m above his root (the plinth ledge is out of reach from in
  front of the spruce bed; the twigs ~0.6 m in front of the stone's face work: `pplkneel` puts the root
  at sonjaGrave + 0.21 m towards the stone). To carry the bouquet, put it at `kneelPoint(p.model)` each
  frame (after `p.root.updateMatrixWorld(true)`) until ~2.2 s, then leave it where it is (or call
  `flowersOnGrave` there). `anim.kneelReach` (0..1) drives the reach by hand if wanted.
- **Level of detail**: nothing to call. `Character` builds the far level itself (idle time) and three.js
  picks the level per render camera, so `renderPortrait` always gets level 0.
- `anim.write` while Ove reports (main.js drives it; scenarios use `game.pose = 'write'` +
  `poseT`), `anim.phone` during calls, `anim.push` when pushing Rune (stand 0.75 m behind his root,
  same yaw; the hands land on his push handles).
- **Seating rule** (main.js already does this): root = `car.seatLocal(side)` + (0, 0.12 − legLen,
  0.12) in the car's frame, rotation 0; busts at `car.seatLocal(1)`. In the Saab Ove's hands are on
  the wheel (`peopledrive`).
- The cat: `cat.sit(true)` for a cat that waits (mission 4); `animate(dt, speed)` otherwise.
- Pocket style, rollator/stick, pregnant idle hand, blinking — all automatic.
- NPC strolls look best at 1.2–2.2 m/s (planted feet; 3.2 m/s is a power walk, 5.5 a run).

## For the rendering agent (gfx.js) — requests, not done here

- **Skin**: wrap lighting with a red-shifted terminator, e.g. a vec3 wrap ~(0.4, 0.24, 0.18) (the
  existing `TRI_WRAP` is a scalar and adds 0.2 of back light, which suits foliage, not skin), and/or
  MeshPhysical `sheen` ~0.2 with `sheenColor` ~0xc05040. Shade on faces is still grey-beige; this is
  the biggest remaining step towards real skin. The cast's skin is its own material instance per
  character (roughness 0.6, a `map`), so a per-material switch reaches it.
- **Normal maps on mapped surfaces**: the surface shader replaces `<normal_fragment_maps>`; if a
  `map`ped surface could also take a `normalMap` (in the same UV), the face bake would add the lines,
  lid creases and lip edges as relief (they are colour only now).
- **Round 4: the cast's skin leans on more of the surface shader** (models.js `faceSkinMat`): its
  `TRI_SPECK` expression also sets `material.roughness` (from `roughnessFactor`, the oil in the face
  texture's alpha and `geometryRoughness`) and tilts `normal` with `gBump( gVx, gVy, normal, dH )`, dH
  from the alpha's screen differences (`texture2D( map, vMapUv + dFdx( vMapUv ) )`) scaled to a metric
  slope by `length( gVx )`. So please keep: TRI_SPECK expanded after `<lights_physical_fragment>` and
  before `<lights_fragment_begin>` (it may be expanded once or twice: the bump is halved for the two
  expansions of today's SURF_SPEC; one expansion just halves the relief), and the names `gBump`, `gVx`,
  `gVy`, `geometryRoughness`, `sampledDiffuseColor`, `vMapUv`. If that changes, the cast's skin fails
  to compile (black faces, console errors): `pplkneel`/`people` show it at once. A real per-material
  roughness/normal hook would let this go.
- **Keep `TRI_SPECK`'s semantics** (SURF_SPEC: `material.specularColor *= TRI_SPECK;
  material.specularF90 *= TRI_SPECK;` after `<lights_physical_fragment>`, so after `<map_fragment>`):
  round 3 sets it to GLSL *expressions* on three own material instances (models.js `hairMat`,
  `eyeMat`, the cast's skin): the hair's and eyes' specular follow the albedo, the skin's comes from
  the face texture's alpha (`( ( diffuseColor.a = 1.0 ), sampledDiffuseColor.a * 1.60 )` - the alpha
  is put back to 1 because the portraits composite by it). A proper per-material specular/roughness
  map hook would be cleaner.
- **Hair**: an anisotropic (Kajiya-Kay-like) highlight for `hair` along the strand direction (the
  meridians) would end the "shell" look far more than geometry can; alpha-tested strand cards along
  the silhouettes need a surface with `alphaTest` and a UV strand texture (none exists; the cast's
  mesh already has a `uv` attribute).
- Eyes in portraits: `renderPortrait` renders without the AO pass, so nothing occludes the cornea's
  sky reflection; a little specular occlusion under the brow would help dark eyes.

## Round 2 (review fixes)

| review issue | status |
|---|---|
| faces / HUD portraits (blocking) | fixed: dense lod-0 head with grid normals (no bands), baked face texture (lips, lines, stubble grain, pores-scale grain, painted brows and hairline), a soft wide nose bridge, real lip shapes, far wider spread of face parameters; the portrait light itself is the UI owner's (suggestion above) |
| female faces | fixed: `fem` changes jaw, chin, brow ridge, nose, lips, eyes, brows, forehead, cheeks |
| hair as helmets/wigs | mostly: thin crew cut over painted hair, soft edges, matte hair, jaw-length turned-under bob with a parting and fringe, long hair over the ears with a front lock, hair flat under hats; hair is still shells, not cards |
| the cat | mostly: shorter, haunches, bigger head and ears, broken stripes, dorsal line, M; sits with folded haunches and the tail on the ground (the tail wraps only part of the way round) |
| hands / grips / write | fixed: rounder palm with a slanted knuckle line, tapered fingers, the thumb from the thenar pad along the index, the index on its own bones, a real pen pinch with the pencil on the index tip, an 8 mm notebook, the clipboard pinched at the side |
| shirt + tie, cardigan | fixed: see the cast |
| necks | fixed: shorter for the old/stooped, shaped (Adam's apple, SCM ridges, narrower behind the jaw); the shirt collar covers most of the neck; Rune has a scarf |
| kids' collars | fixed: snowsuit collars stop at the chin |
| ped faces (lod 1) | fixed: 32 columns, more rings, analytic normals, painted lids, dimmer sclera |
| Patrick details | fixed: the beard clears the lips, thin round glasses, the sling strap no longer stretches |
| animation | fixed: blinking, a 'yes!' cheer, seated long coats lie on the thighs (skirt bones) |
| scarves, Ove | fixed: four scarf styles with ends following the chest and a fringe; Ove's salt-and-pepper brows, older face |
| seated drivers (integration) | skipped as instructed: main.js now seats with `car.seatLocal`; checked in `peopledrive` |
| new: `carry`, `work` poses | added (above) |

Also fixed on the way: the lid and index bones had shifted the core bone order (the pose arrays index
bones by CORE position); `buildCharacter` now sorts the core bones first. Bald men can have beards.

## Round 3 (review fixes)

| review issue | status |
|---|---|
| carry / work never used (blocking; integration is the systems agent's) | people side done: `cat.hold(on)` (curled in the arms), `carryPoint` = the cat's root on the right forearm, a carry pose that holds it (one forearm under, the other over its back), `'shovel'` (snow shovel, both hands on its shaft and T-grip, blade flat on the snow) and `'wrench'` props on Ove for `workKind` `'shovel'` / `'low'`; checked in game through a mirror of the systems wiring (`people` scenario: `ppl_ove_carry`, `ppl_ove_work_*`; `errands` all 9 ok). **main.js must drop its `- 0.14` on the cat's height** |
| faces at close range | mostly: eyes sunk ~1.5 mm with the upper lid over the top of the iris (no doll stare), iris 0.48 of the ball with a limbal ring, collarette and fibres, lid shadow, wet line, caruncle, brown irises stay brown (albedo floor + an eye material whose specular follows the albedo); brows painted as hairs (no strips), Rune's grey-white; ears with relief and AO; finer, lower-contrast stubble; a specular mask (matte nose flanks, wet lips); rounder face sections; warmth round the nose and eyes. Wrap lighting / sheen = requests above |
| HUD portrait light (UI owner) | not mine; verified with the systems agent's softer light |
| hair | partly: dark hair cannot Fresnel to white, curtains are slabs with a dark inside and edge AO, closer to the cheeks with clumps and ragged ends, the front lock is 4 tapered strands, the bob's ends are layered (choppy), its back has strand ridges; still shells (no strand cards, no anisotropic highlight: requests) |
| the cat | done: rebuilt (broad head, short thick neck, 5 cm wide-set ears, thick legs, round haunches inside the silhouette, warm scruffy mackerel tabby, ragged fur outline, 40° sit with flat hind paws, `hold`) |
| kids' faces | done: no make-up terms for girls, fuller cheeks, short philtrum, round forehead, shallow sockets, open lids, short flat nose, neutral mouth, rosy, soft lines |
| Anders' sunglasses | done: two glossy dark wayfarer lenses in rims, a bridge, temple arms over the hair to above the ears, lying on the hair at the crown's front |
| clothing geometry | mostly: sleeves 24 columns at lod 0 with elbow compression folds and a shoulder seam, a smaller sleeve cap (less of a shoulder blob), padded sleeves gather into an elastic cuff (kids' snowsuits), the hood lies folded on the back with a rolled rim (fur on parkas), scarf ends gathered at the wrap with soft lengthwise folds |
| fist | improved: tips folded into the palm, the thumb tucked across |
| lod-1 ped faces | done: rings on the lip borders (sharp lip edge, less saturated), brows thinner and 40 % towards the skin, the palest ped skins warmed (nothing paler than ~0xdcb39a) |
| performance | partly: lazy, idle-time face bake (finished on first draw); no lod-1 head switch (see Known weaknesses) |
| run slip, idle, talk | done: running the landing foot is planted before touchdown (slip 0.62–0.71 → 0.13–0.24 m/s at 4.5–5.5 m/s), idle arms closer in with soft elbows and slow drift, continuous talk beats with both hands, `listen` nodding |

## Round 4 (final polish, after the p4 reviews)

| review issue | status |
|---|---|
| no runtime LOD for people (perf, major) | fixed: `PersonLOD` levels on one skeleton (below); people 1.2–1.75 M → 0.22–0.98 M triangles a frame at the busy poses, 490 → 282 draw calls over the six poses |
| faces read as vinyl mannequins (art, major) | mostly: an oil map (spec, roughness, relief: pores, creases, lip border, T-zone), cold-flushed nose tip, cheeks and ears, deeper sockets and nasolabial folds, men's lash lines; per-character oil / roughness / cold. The portraits' flat studio light (and the warm rim light the review asks for) is hud.js' (UI) |
| Jimmy, Adrian, Vita skjortan one template | fixed: jaw width, nose length, brow height (new `face.browY`), chin, brow ridge, mouth (`face.smile`), colour apart (see The cast) |
| Jimmy's hood pokes through his jacket as grey shards | fixed: the shards were the flat hood's top corners standing out over the sloping shoulders and the rim's ends sunk in the chest. The hood is now never wider than the back under it, the rim and hood are pushed out of the torso along its normal (`outsideTorso`), and a hoodie under an open coat (`hoodUnder`) gets a flat band over the shoulders whose ends run down into the opening in a V, with the drawstrings hanging from them; the coat's collar is lower and spread at the front (`hood_a|b|c`) |
| kneel at the grave (minor) | added: `st.kneel` (+ `kneelReach`), `kneelPoint`; the day-7 wiring is the gameplay fixer's (see "For the systems agent") |

### Level of detail

- `buildCharacter(def, { far })` hangs the meshes under `model.lodNode`, a `PersonLOD` (a `THREE.LOD`):
  three.js calls its `update(camera)` in every render with that render's camera, so the game camera,
  `renderPortrait`'s camera (always level 0) and look-dev cameras each get the right level, and the
  shadow and AO pre-pass draw what the main camera chose (the pre-pass renders with it). Hysteresis
  10 %. Beyond `LOD_DIST.shadow` (60 m) the person casts no shadow (toggled in the same update).
- The far level is a second `SkinnedMesh` bound to the same `Skeleton` with the same bind matrix
  (`far.bind(mesh.skeleton, mesh.bindMatrix)`): animation, seating, `carryPoint`, `kneelPoint`, the
  props, blinking lids (the cast's far lids ride the lid bones) all work whichever level is drawn.
  It is built by the same builders (`personGeo`, a fresh `dims`/`headParams`, the model as a prototype
  so fit values like `armOut` stay the near level's; Patrick's sling strap is worked out once at build
  time and reused, `m._strap`): lod-2 body, a lod-1 head (cast) or lod-2 head (peds), surfaces folded
  into fabric + skin (`FAR_REMAP`; 'metal' stays for wheelchairs and rollators): 2 draw calls (3 with
  metal) instead of 4–7.
- Built in idle time (`requestIdleCallback`, timeout 1.5 s: at most one ~5 ms build in a busy frame),
  ~5 ms each: the 47 people of the game cost ~0.25 s of idle time after loading, nothing at load.
  Until a person's far level exists it stays at level 0/1.
- Distances: the cast 15 m (`LOD_DIST.cast`; the review said 15–20: the far level is hard to tell from
  lod 0 even at 6 m, `lods_l` vs `lods_r`), pedestrians 40 m.
- Triangles: cast 33–45 k → far 7–10.6 k (Ove 36.5 → 7.0 k, Parvaneh 44.4 → 9.0 k, Rune 45.3 → 10.6 k);
  peds 9.1–10.8 k → far 4.9–6.3 k.

### Faces (the cast's lod-0 faces)

- The face texture's alpha is now the skin's **oil** (`faceSpec`): base 0.52 + 0.08 × `oil`, the
  T-zone (forehead, the nose's ridge and tip, the chin) + `oil` × 0.1–0.28, cheeks and nose flanks
  drier, wet lips, stubble and the scalp matte, **pores** (small matte pits at texel scale, densest on
  the nose and cheeks: `PORE` 0.16) and **creases** (every line term of `faceDetail` — mouth line and
  corners, lid crease, tear trough, nose base, nasolabial fold, frown lines, eye bags, marionette
  lines, forehead lines, crow's feet, upper-lip lines — now goes through `ln()`, which also adds to
  `crease`; `CREASE` 0.55).
- `faceSkinMat`: the oil scales the specular (as before), sets the roughness round the character's base
  (`roughnessFactor × (1.34 − 0.9 × oil)`: ×0.75 on the lips, ×0.83 in the T-zone, ×1.1–1.17 on the
  cheeks and in creases; base 0.52 young / 0.56 / 0.62 old / 0.6 kids, `face.rough`), and its screen
  differences tilt the normal (`FACE_RELIEF` 1.6 mm of height per unit of oil, as a metric slope:
  pores ~0.1 mm deep, creases ~0.2–0.4 mm, the lip border a 0.3 mm step). Same draw calls, one shader
  variant for the whole cast, 2 extra texture reads per skin pixel.
- Colour: the sockets darker (the bowl, the inner corner by the nose bridge, under the brow ridge),
  the nasolabial fold deeper with the cheek's fullness lighter above it, the lid crease and tear
  trough stronger; **cold** (`face.cold`, default 1, kids 1.2, × skin lightness): blotchy flushed
  cheek apples, a red nose tip, the chin a little, and red ears (most on the rim and lobe).
- Men's upper lids get a dark lash line too (thinner and lighter than women's), so eyes read in the
  portraits.

### Numbers (RTX 4070, 1280×720; `pplperf`: people = the drop in `__stats()` with everybody removed)

| pose | people tris before → after (M/frame, all passes) | people calls before → after | levels after |
|---|---|---|---|
| start | 1.75 → 0.98 | 118 → 81 | 5 lod 0, 7 far, 12 far without shadow |
| lot_e | 1.53 → 0.44 | 99 → 59 | 1 lod 0, 9 far, 11 far without shadow |
| street_trees | 1.21 → 0.22 | 50 → 31 | 2 lod 1, 10 far, 12 far without shadow |
| centrum | 0.11 → 0.02 | 15 → 6 | 16 far without shadow |
| drone_nw | 1.49 → 0.27 | 113 → 57 | 2 far, 18 far without shadow |
| aerial | 0.96 → 0.22 | 95 → 48 | 17 far without shadow |
| sum | 7.05 → 2.14 | 490 → 282 | |

- Whole frame at those poses: 7.36 / 7.95 / 6.80 / 3.82 / 8.60 / 6.70 M → 6.75 / 6.95 / 5.82 / 3.85 /
  7.42 / 5.93 M triangles (other areas' changes are in there too), 60 fps throughout.
- Look-dev `perf` view (48 people + 22 busts at 20–30 m): 493 calls / 4.03 M tris → `&far=1` 450 / 2.39 M.
- Programs: 107–108 in game (the cast's skin variant replaces round 3's; the far levels use the shared
  pedestrian materials).
- `animateCharacter` unchanged (0.74–0.79 ms for 48 people in look-dev; the far level costs nothing on
  the CPU: same skeleton).
- No console errors in pplperf, people, pplsmash, peopledrive, pplkneel, start, talk, errands (all 9
  ok), story (ends `#7 idle`), the look-dev page (all views).

## Phase 4, round 2 (the whole-game review's last fix round)

| review item | status |
|---|---|
| close-up clothing and hair (art, major) | mostly: scarves rebuilt, hair and fur cards, Jimmy's hood band, lapels; long hair's back panel and the cat are still shells |
| animation and matrices every frame for every person (perf, major) | fixed: animation LOD in `Character.sync` + skipped matrix updates |
| no mid LOD for the cast (perf, minor) | fixed: a mid level from 6 m (screen size), each level casting its own shadow |

### Scarves (`buildScarf`, rebuilt)

- **The wrap** is the band wound twice round the neck: one `sweep` along a helix starting at the end
  that hangs out in front, the lower turn bigger and lying on the collar, the upper one closer round
  the neck and dipping under the chin, so a crease runs between the turns and the band climbs
  across one side. Its section is an ellipse (height ~0.31 H, depth 1.7–2.8 cm with `bulk`) rippling
  three or four times a turn in radius and height, with creases drifting round it; 14 × 110 at lod 0
  (10 × 48, 7 × 24). A second colour shows only as bands near the ends (stripes across the wound
  band read as blotches).
- **The ends** are sweeps of 14 sides with lengthwise folds, thicker and gathered where they leave
  the wrap, two-colour bands near the end (one colour: a darker ribbed band), and **a fringe**: 11
  short strands (6 at lod 1) of 4.5–6.5 cm across the end.
- **'loop'** (Parvaneh): a soft roll across the front of the wrap (the folded loop) with both ends
  pulled through it, instead of the old sphere. **'tucked'** (Rune) is the wrap alone.
- The knit is 3× finer: `SkinBuilder.triK` scales a part's triplanar coordinates (the `fabric`
  texture's scale) — 3 for every scarf part.
- A lapel coat's V is no longer filled with the scarf's colour (that read as a flat bib behind the
  ends): a dark knit (`under`, default 0x2c2a2a) unless the scarf is tucked.
- Triangles: Parvaneh 44.4 → 48.3 k, Rune 45.3 → 47.9 k, peds with a scarf ~+0.8 k.

### Hair and fur cards (level 0 of the cast)

- Alpha-tested strips with a strand atlas (`cardTexture()`: 256 × 384, three bands: long fine
  strands, sparse wisps, dense fur dark at the root; the root at the top of each band; mipmaps built
  by hand so each band keeps its coverage above the test as it shrinks), `cardMat()`: a unique
  instance of the `hair` surface (specular following the albedo, roughness 0.55) with the atlas as
  map, `alphaTest` 0.3 and **alpha to coverage** (soft strands under MSAA, a cut-out without).
  Double-sided by duplicated triangles, so both sides shade with the normal of the surface they grow
  from (a flipped back-face normal made them dark).
- They are **one more `SkinnedMesh` per cast member on the same skeleton, a child of level 0** (shown
  only with it), `castShadow` false and `userData.noAO` (left out of the shadow and AO pre-passes): one
  extra draw call in the main pass only, nothing at the mid / far levels or for pedestrians.
  `buildCharacter(def, { cards: false })` builds none. Built with the near level (D.cards, a second
  `SkinBuilder` with real UVs; `shellMesh` now records its grid in `geo.userData.grid`).
- `shellCards(D, shellGeo, { edge, fins })`: **edge cards** start a row or two up the shell and hang
  past its lower edge (1–3 cm, two staggered layers, a little curl towards the head) — the nape and
  behind the ears for short cuts (not the temples), the fringe shells of the bob and long hair, the
  ends of the bob and long curtains, Jimmy's whole messy rim, a beard's lower edge; **fins** stand up
  along the hair's flow on the upper shell (0.4–1.6 cm, leaning back along the flow): edge-on seen
  face on, they break the outline where the head turns away. Not under hats, not under Anders'
  sunglasses. `loftEndCards` breaks long hair's back panel into strands at its end; `tubeFurCards`
  puts three layers of 2.5–5.5 cm tufts (fins along the trim, turned a little) round a parka's fur
  trim, over the trim tube darkened to 0.8 as their root.
- Per head: Patrick 7.5 k card triangles (fur and beard), Parvaneh 4.1 k, Anita 3.6 k, Jimmy 2.6 k,
  Adrian 0.4 k, Nasanin 0.3 k; Ove's crew cut and Sara (hat) none.
- Portraits (hud.js renders the model in its own MSAA target) pick them up; the composite by alpha
  is fine (checked `portraits_big1|2`).

### Jimmy's hood, the lapels

- A hoodie under an open coat: the hood's opening is a band standing up behind the neck and hugging
  its base (radius nR + 4 cm instead of + 5–6), bunched in soft folds, narrowing towards the front
  where its two ends meet in the neckline 5 cm lower (was 10: the ends ran down the chest and read
  as a sling, in the portraits too), its lining darker on the inner face, a rolled hem along its
  upper edge (a second sweep). Drawstrings unchanged.
- Lapels (lod 0): 12 sides instead of 6, rounder edges, the outer edge rolled forward 4 mm, the
  underside darker.

### Animation level of detail (`character.js`)

- `Character.sync(dt)` poses (`animateCharacter`) every k-th frame with the accumulated dt:
  k = 1 within `ANIM_LOD.off` (12 m) of the camera or when dt is 0 (a snap) or on the frame after a
  level-of-detail switch, k = 4 off screen (a sphere test against the last rendered frustum) or
  hidden beyond 12 m, k = 2 on screen beyond `ANIM_LOD.near` (30 m), 4 for seated people in cars
  beyond 30 m. Who skips which frame is staggered. Never Ove (`animLod` false).
- On a frame without a new pose the root's whole matrix update is skipped as well:
  `buildCharacter` gives every root an `updateMatrixWorld` that returns early while `root._skipFrom`
  is its parent and its world matrix still sits within 25 cm of its position (a portrait reparents
  the root, a teleport moves it: both update as usual). `sync` sets `_skipFrom` only while the root
  is within 2 cm × max(1, distance / 30 m) (twice that off screen) and 0.01 of its yaw of where its
  matrices were last computed, and only for roots directly in the scene (seated people in a car
  always update). Walking people beyond 30 m therefore update their matrices on the posed frames.
  (`matrixWorldAutoUpdate = false` would not have helped: r186 still traverses the children.)
- Measured (`pplanim`, A/B interleaved, see Numbers below).

### Mid level of detail (`models.js`)

- The cast has three levels: level 0 to `LOD_DIST.mid` (6 m), the **mid level** (a lod-1 body and a
  lod-1 head, its `hair` and `leather` kept apart: 4–5 draw calls, Ove 8.8 k, Parvaneh 12.0 k, Rune
  14.8 k triangles) to `LOD_DIST.cast` (15 m), then the far level. Built in idle time with the far
  levels (`LOD_JOBS`, mid first). Each level casts its own shadow, so the shadow pass draws level 0
  only for the one or two people within 6 m.
- `PersonLOD.update` now measures **screen size**: the distance over the camera's zoom times
  tan(fov / 2) / tan(27.5°), i.e. as seen through the game's 55-degree lens. A 42-degree dialogue
  shot from 6.8 m sees its speakers as from 5 m: level 0 (`pplcine` checks it: every subject within
  8 m of the lens at level 0, the speakers posed every frame). The portrait camera (24°) is always
  level 0. Shadows stop at 60 m of the same measure.
- `lods_6`, `lods_m`, `lods_f0` / `lods_fm` (Ove, Parvaneh, Patrick at level 0 vs mid from 6 m
  through a 30-degree lens: the worst case) in the look-dev page.

### Numbers (RTX 4070, 1280×720; the machine shared with other agents)

- `pplperf` with `QUERY='&farevery=1'` (the far shadow cascade every frame, so the shadow numbers
  hold still), people's triangles a frame, all passes, before → after:
  start 0.90 → 0.33 M (shadow 0.46 → 0.18, AO 0.22 → 0.08, main 0.23 → 0.08; 5 cast at level 0 →
  5 at mid), lot_e 0.36 → 0.39 (one person at level 0 + cards, the scarves), street_trees 0.19 →
  0.23, drone_nw 0.20 → 0.19, aerial 0.09 → 0.09; sum 1.75 → 1.23 M; people's calls 190 → 190.
- `pplanim` (EXCLUSIVE, 3 interleaved 90-frame windows per side, median; ms per frame off → on):
  | pose | Character.sync (all people) | scene matrices | game.update | posed every 1 / 2 / 4 frames | roots skipping |
  |---|---|---|---|---|---|
  | start | 0.95 → 0.59 | 1.28 → 0.98 | 2.24 → 1.90 | 8 / 7 / 9 | 16 |
  | lot_e | 0.73 → 0.43 | 1.01 → 0.96 | 1.95 → 1.64 | 2 / 12 / 7 | 7 |
  | street_trees | 0.78 → 0.36 | 1.19 → 1.01 | 1.95 → 1.58 | 1 / 4 / 20 | 24 |
  | drone_nw | 0.56 → 0.36 | 1.02 → 0.94 | 1.67 → 1.47 | 1 / 13 / 4 | 17 |
  | in the Saab | 0.77 → 0.45 | 1.07 → 1.02 | 2.10 → 1.85 | 1 / 10 / 12 | 12 |
  i.e. -0.2 to -0.4 ms of `Character.sync` and -0.2 to -0.4 ms of `game.update` a frame; the matrix
  update saves -0.02 to -0.25 ms (most far people walk or turn, and those update on their posed
  frames). Nobody is drawn more than 10 cm from where they are (the check fails at 25 cm); Ove is
  posed every frame (checked).
- Programs +1 (the card material). Build: cast ~14 ms cached (was 13), ped ~5 ms.
- No console errors in start, talk, walk, people, pplcine, pplkneel, peopledrive, pplsmash, pplperf,
  pplanim, the look-dev page; `story` ended `#7 idle`, no errors, in 2 of 3 runs (one full run and
  `FROM=4`); the third failed the day-5 outro check (Adrian `shown=false`: his root invisible, not
  his level of detail - see "For the other owners").
- Also checked through screenshots: the cast's portraits (`portraits_big1|2`: Jimmy's hood no longer
  reads as a sling), dialogue shots (`talk`, `pplcine`), the kneel, the smash, the driver in the Saab.

### For the other owners

- Nothing to call. A scene that must pose someone every frame although they are far from the camera
  can set `ch.animLod = false` (Ove already is). Code that reads a far NPC's bone matrices on a frame
  where they were skipped gets them as of the last posed frame (≤ 3 frames old, within the 2 cm-scaled
  tolerance); `getWorldPosition` and the portraits are unaffected.
- Rendering: the cards rely on the `hair` surface material taking a `map` with `alphaTest` and
  `alphaToCoverage` (the twig cards' recipe), on `userData.noAO` keeping a mesh out of both
  pre-passes, and on `TRI_SPECK` as before.
- The `people` scenario's close-ups now switch off main.js' `hideNearCamera` (it hid the neighbour
  0.9 m from the lens).
- Systems / story (seen once in three story runs, not caused here): Adrian stood invisible through
  the day-5 outro. `hideNearCamera` hides someone near the lens and restores them next frame only if
  `!ch.car`; if they are seated in a car in between (the race grid), they drop off its list and stay
  invisible (`unseat` and `placeCast` do not set `root.visible`). Restoring regardless of `ch.car`
  (or `placeCast` setting `n.root.visible = true`) closes it.

## Known weaknesses

- Faces read as well-made CG, not photographs, inside ~1 m: the skin has no subsurface scattering or
  wrap (grey-beige shade, a hard terminator: rendering request), the wrinkles and lid creases are
  colour only (no normal map: rendering request), expressions stop at frown/blink/jaw/nod.
- Hair is shells with strand cards along their outlines (p4r2): long hair's back panel is still a
  slab with strands only at its end, the bob's top reads a little fluffy on grey hair, alpha-tested
  strands alias without MSAA (the low tier), and there is no anisotropic highlight.
- The cat's fur is a jittered shell (no fur cards); its face is good at gameplay and carry distance,
  a little toy-like at 30 cm.
- Level of detail: three levels for the cast since p4r2 (0–6 m, mid to 15 m, far). The switch at
  6 m is a level-0 → mid change of the face (texture → vertex colours, lod-0 → lod-1 eyes, the hair
  cards gone) at ~20 px of face through the game's lens; checked in stills (`lods_f0` / `lods_fm`),
  not judged in motion.
- The relief from the oil map is texel-sized (~0.9 mm): at ~0.1 mm per pixel (the `e_` views) pores
  are blocky and slightly stretched across; at dialogue and portrait distances it reads as skin grain.
  Portraits are still lit by hud.js' flat studio light (a warm rim light there is the UI's).
- The fist's thumb is a single tube; the back of the hand is a smooth slab close up. `'bend'` and
  `'wall'` work have no tool; the spanner is small.
- Coat skirts follow the thighs by bones only: long coats still flare a little when seated and shear
  slightly in a long stride.
- lod-0 heads cost ~15 k triangles each and the lod-0 eyes ~1.4 k each (fine for the 13 cast; don't
  make peds lod 0).

## Gait (2026-10, Ove's walk, run and jump)

Feature `features/implemented/oves_ganganimation.md`: Ove's walk and run looked bad and his jump was
too quick. The speeds stay (walk 3.2 m/s, Shift 5.5 m/s), which is a power walk and a hard run; the
motion was rebuilt around them. `locomotion()` in models.js, for everybody:

- **Feet on two lines, not one.** The pelvis turns and tilts; the thighs used to inherit that, so a
  planted foot slid ~13 cm sideways per step at 3.2 m/s and landed on the centre line. `thighRot()`
  takes the pelvis' yaw/roll back out of each thigh, and a small abduction puts each foot on its own
  line (step width ~0.10 m × height/1.78, +0.04 for `old`; ~0.06 running; under the hips standing).
  Toes out 5° (+7° × `old`). The hip joints' fore/aft motion from the pelvis' turn is in the stride.
- **Pelvis.** Turn ±3.4–5.7° (walk, more at speed), drop on the swing side, sway over the standing
  foot (± 1.2–2 cm, more for `old`), all from the phase (no longer from the leg angles). Walking
  height: a smooth double bump from the stride's geometry: highest at mid-stance, lowest at the heel
  strike, as low as the leading heel and the trailing toes can both reach, held below each loaded
  foot's reach.
- **Two-bone IK while walking**: every planted heel/toe reaches its point exactly (the trailing leg
  bends its knee to push off instead of lifting the body off the leading heel), and at the end of the
  swing the heel follows a path that arrives on its landing point with no speed over the ground,
  kept ≥ 1.4 cm (3.5 cm late in the swing) above the ground.
- **Walk curves**: the hip extends further behind (thigh to vertical ~+22/−16 at 1.4 m/s, more at
  speed), the stance knee yields more at speed (`load`), a harder push-off (`push`). **Run curves**: a
  jogger's swing knee (~95°, not a sprinter's 112°), toe-off at 29 %.
- **Arms** swing from the shoulder (±10–27° walking, with the elbows bending more at speed), a little
  behind the legs, the hands coming in on the forward swing; running bent ~85°, the upper arm swinging
  mostly behind the body. Thorax counter-rotates against the pelvis (0.7 of it). Jaw a little open
  running.
- **Jump** (Character.jump, `JUMP` in character.js): a wind-up (0.22 s standing, 0.1 s on the move),
  then off the ground (`game.onJump`: `audio.grunt`, a strained 'hnngh'), a flight under 14 m/s²
  (0.55 m, ~0.56 s, was 0.45 s under 24), a landing (`game.onJumpLand`: footstep, thud, `audio.oof`
  seven times out of ten, a little snow) after which his speed is capped at 45 % rising back over
  0.42 s. Presses during the wind-up are ignored (still no double jump).
- Numbers (`tools/gait.mjs metrics`, Ove): cadence 112 / 160 / 211 / 209 steps per minute at 1.4 /
  2.2 / 3.2 / 5.5 m/s, step 0.75 / 0.83 / 0.91 / 1.58 m, pelvis bob 6 / 8 / 10 / 9 cm (3.2 m/s with a
  0.9 m step: the leg's arc, not a choice), foot slip on the ground 0.04–0.18 m/s (was 0.37–0.95 by
  the same measure), no foot below the ground, step width 0.11 m, toes out 9°. The people page's
  `slip` view: walking 0.02–0.13, running 0.08–0.11 m/s (was 0.06–0.14 / 0.13–0.24).
- Cost: ~+0.7–1 µs per posed person (speed-only values are cached per person: `m.gc`).
- Look-dev: `PORT=88xx node tools/gait.mjs [walk run walkback runback walkfront jump walkjump runjump
  clip metrics sound]` films a real Character on `tools/gait.html` (fixed 60 Hz steps, a tape mark
  every 0.5 m) into `out/gait_<take>.png` contact sheets (`VIDEO=1`/`clip`: an mp4, `CAM=back`),
  `metrics` prints the numbers above, `sound` renders the jump's voice next to `ouch` / `talk` into
  `out/gait_sounds.wav` + a spectrogram, `eval <file.js>` runs a script in the page.
