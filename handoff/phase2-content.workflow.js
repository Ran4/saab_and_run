export const meta = {
  name: 'saab-phase2-content',
  description: 'Saab & Run phase 2: world, cars, people and UI/audio built in parallel private copies, each with critic loops',
  phases: [
    { title: 'Build', detail: 'four builders in private copies' },
    { title: 'Critique', detail: 'one critic per area' },
    { title: 'Fix', detail: 'address critique, copy owned files back' },
  ],
}

// Run with: Workflow({ scriptPath: '<this file>', args: { work: '<your scratchpad dir>/saab_work' } })
// args.work = a directory for the four private copies of the game (any writable path).

const GAME = '/home/ran/src/html/everything_and_run/saab_and_run__en_man_som_heter_ove'
const WORKROOT = (args && args.work) || '/tmp/saab_work'
// Two-slot machine-wide lock around every headless browser run (made by the orchestrator).
const SLOT = `${WORKROOT}/browserslot`
const ROUNDS = 3 // reviews; a fix follows each one except the last, which only scores

const PRE = (w, port) => `You are working on "Saab & Run — En man som heter Ove", a browser game in ${GAME} (GAME): a reversed Simpsons Hit & Run where you are Ove, patrolling his Swedish row-house area in his Saab and reporting illegally parked cars while the neighbours keep interrupting him. Plain three.js ES modules (r186, node_modules), no build step. It started as a copy of an older cel-shaded game; phase 1 replaced the rendering with a REALISTIC physically based look. The user's explicit wish: "ingen cellshadad stil den här gången utan realistiskt ska det vara."

Read first: GAME/DESIGN.md (design bible + module contracts — section 2 = the target look, section 10 = the rendering API you MUST use: surfaces via g.use('wood') etc., realMesh, lights, glass, snow) and GAME/CLAUDE.md (engine conventions).

PRIVATE COPY: three other agents are working in parallel on other parts of the game, so you work in your own copy: ${w}. If it doesn't exist yet, create it:
  mkdir -p ${w} && rsync -a --exclude node_modules --exclude out --exclude assets --exclude handoff ${GAME}/ ${w}/ && ln -sfn ${GAME}/node_modules ${w}/node_modules && ln -sfn ${GAME}/assets ${w}/assets
(If it exists, keep working in it — an earlier agent of your area left work there.) Do all edits and tests in your copy. You MAY make throwaway edits to files you don't own in your copy (e.g. hack main.js to boot with your new content, add car-type aliases, add test scenarios to tools/shot.mjs) — those never leave your copy. When you finish, copy back ONLY the files you own into GAME (exact commands given below) and nothing else.

Testing: never open a visible window. Verify headlessly only: \`cd ${w} && PORT=${port} ${SLOT} node tools/shot.mjs <scenarios>\` (game, ?test=1), \`PORT=${port} ${SLOT} node tools/look.mjs ...\` (camera look-dev, see CLAUDE.md), \`PORT=${port} ${SLOT} node tools/pageshot.mjs <page.html> [prefix]\` (standalone test pages; the page sets window.__ready, optional window.__views + window.__setView(name)). Always use PORT=${port}. RAM on this machine is tight (~5 GB free), so EVERY headless-browser run must go through ${SLOT} (a wrapper that lets at most 2 browsers run machine-wide; it may wait a while for a slot — that is normal, don't bypass it), never run two browser commands at once yourself, and never leave a browser or server running in the background. Read the PNGs (in ${w}/out/) yourself and judge them critically against DESIGN.md section 2. Keep fps ~60 at 1280x720 and the console free of errors. Use uv (not pip) if you need Python.
All player-facing text is Swedish. No real brand logos (car make names as words are fine). Write your API notes / contract additions / deviations to notes/<area>.md in your copy (it is one of your owned files) — later agents read it.`

const AREAS = [
  {
    key: 'world', port: 8802,
    own: 'src/world/ (every file in it, including new ones you create) and notes/world.md',
    copyBack: (w) => `rsync -a ${w}/src/world/ ${GAME}/src/world/ && mkdir -p ${GAME}/notes && cp ${w}/notes/world.md ${GAME}/notes/`,
    task: `YOUR AREA: THE WORLD. Rebuild the whole town (src/world/town.js, layout.js MAP and helpers, props.js, collision.js if needed; split town.js into several files under src/world/ if it helps) as a Swedish suburb on an early-winter morning, implementing DESIGN.md section 6 (the world contract) exactly — every landmark, box, named parked car, violationSpots, carFreeZones + isCarFree, collectibleSpots, litterSpots, pedLoops.
- Keep the engine's grid (7x7 blocks, pitch 80 m, roads between all blocks, right-hand traffic) and choose a believable MAP: Ove's radhusområde (block type 'ove') near the centre, the other required block types around it (radhus, villa, apartments, centrum, hospital, church, cemetery, dealer, preschool, kommun, gas, park, field, forest at the edges).
- The 'ove' block is the heart of the game, so make it rich and believable: a 1970s Swedish radhusområde. Rows (längor) of 5-6 one-and-a-half or two-storey row houses in stående träpanel (falu red, ochre, off-white, grey-green, dark brown), white window frames and corner boards, black concrete-tile or sheet-metal roofs, a small fenced or hedged front garden per unit, front doors with house numbers, kicksleds and bins by the doors, förråd. A car-capable but car-free central walkway (gångväg, about 6 m wide; signs "Förbud mot trafik med motordrivet fordon" and "Gångfart" at its entrances; wide enough for Patrick's car + trailer to stand on 'parvanehDrive'), a parking lot off the street with painted bays, a blue P sign, guest bays signed "Gästparkering max 24 tim", a handicap bay with sign and painted symbol, a garagelänga of ~10 garages with Ove's door OPEN (interior with workbench and shelves, 'oveGarageSpot' inside), a soprum/återvinning building with containers, a cykelförråd, rows of mailboxes on stands, lamp posts, birches, spruces, hedges, snow piles. Ove's, Parvaneh & Patrick's, Rune & Anita's, Jimmy's and Anders' units must be distinguishable (nameplates, curtains, details: e.g. Ove's tidy, Rune's ramp for the wheelchair, Anders' expensive outdoor heater).
- Other blocks: generic Swedish names only (e.g. "Livs", "Pizzeria Roma", "Frisör", "Blommor" — a flower shop near the cemetery for the finale — "Bilhallen – Begagnade bilar", "Sjukhuset" with "Akutmottagning" and a paid car park with parking meter, a white church with a tower, "Förskolan Solrosen" with fenced playground, "Kommunhuset", "Bensin & Service"), 3-4-storey brick/plaster lamellhus with balconies, villas with gardens, a park with a frozen pond, a snowy football field, spruce/birch forest at the edges and beyond the map.
- Streets: Swedish markings (white dashed centre lines, edge lines, zebra crossings with the blue crossing sign), bus stops with a busskur and yellow zigzag marking, lamp posts, low plowed snow banks at the kerbs (never in a driving lane), road signs as textured sign meshes (blue P, P-förbud, gångfart, förbud mot motordrivna fordon, busshållplats, 30/50 speed signs).
- props.js: Swedish breakables keeping the TYPES structure (mailbox on post, green wheelie bin, papperskorg, sparkstötting, parked bicycle, bench, flower box, snowman, fence segment...), all PBR via the section-10 API. Keep 'coins' in prop defs (later reinterpreted as kronor).
- Phase 1 already tweaked the OLD town.js for rendering (spruce/hedge/hillside surfaces, asphalt colours, no glint bars) — you replace that file, so carry those lessons over: read DESIGN.md 10.2 and 10.10 (look notes from the art review: spruces as many narrow cone tiers in 'spruce', hedges as boxes in 'hedge', outskirts hills in 'hillside' with spruce silhouettes, snow banks and kerbs on big flat areas, no glint boxes, no perfectly smooth sphere hills).
- Use surfaces everywhere (wood, brick, tile, metalroof, asphalt, marking, paving, snow, grass, gravel, bark, birch, foliage, glass for building windows, painted for frames/doors, light for lamps). No window 'glint' boxes (real reflections do that). Realistic, slightly muted Scandinavian colours.
- Validate the contract in code before you finish: write a throwaway check (e.g. a test scenario in your copy's shot.mjs that evaluates in the page) proving that every violation spot fits a 4.8x1.9 m car with no solid inside it and lies >= 5.5 m from any road centre line when on a street, every landmark/box is at a free ground-level spot (not inside a footprint), collectible spots are reachable on foot (ground + 0.45 step + ~0.5 jump), and traffic still flows (the 'traffic' scenario: few or no stuck cars).
- Performance budget for the whole town: ~60 fps at 1280x720; keep main-pass draw calls reasonable (merge per block; instance repeated props) and report __stats().
- To boot in your copy, patch your copy's main.js (player start at 'oveHouse', NPC HOMES to your new landmarks or disabled, records/mosquito spots from collectibleSpots, named cars) and add car-type aliases in your copy's car.js if the new type names don't exist yet. Make a 'views' scenario covering all landmarks plus an 'aerial' shot, and look at them all.`,
    critic: `Judge THE WORLD: does it read as a believable Swedish suburb (radhusområde, villas, lamellhus, centrum, church, hospital) on an early-winter morning, rendered realistically? Architecture proportions and vernacular, materials and colours, density and clutter (lived-in vs empty), signs and road markings (correct Swedish conventions), snow, trees, the 'ove' block's richness and the distinguishability of the NPC houses. ALSO check the DESIGN.md section 6 contract in the code and by evaluating in the page: all landmarks/boxes/named cars exist and are at free spots, violationSpots count (>= 40) / kinds / no solids inside / not in lanes, carFreeZones + isCarFree, collectibleSpots reachable, litterSpots, pedLoops; traffic still flows; fps.`,
  },
  {
    key: 'cars', port: 8803,
    own: 'src/actors/car.js, src/actors/carmodels.js (new), src/actors/trailer.js (new), src/actors/drivers.js, tools/cars.html (new), notes/cars.md',
    copyBack: (w) => `for f in src/actors/car.js src/actors/carmodels.js src/actors/trailer.js src/actors/drivers.js tools/cars.html; do [ -f ${w}/$f ] && cp ${w}/$f ${GAME}/$f; done; mkdir -p ${GAME}/notes && cp ${w}/notes/cars.md ${GAME}/notes/`,
    task: `YOUR AREA: THE CARS. Implement DESIGN.md section 7 (the car contract) with realistic car models and keep the arcade physics fun.
- Models (src/actors/carmodels.js): realistic proportions and silhouettes — build bodies from extruded side profiles (THREE.Shape -> ExtrudeGeometry with bevel) and/or lofted cross-sections, not stacks of boxes: wheel arches, wheels with tyres and rims (or steel wheels with hubcaps), inset tinted glass (own mesh, 'tinted', see section 10.4), headlights/tail-lights (lenses 'lamp' + driven 'light' meshes), mirrors, bumpers, grille, door shut lines where cheap, licence plates front and rear. Types: saab900 (the hero: Ove's Saab 900 classic, 3-door 'kombikupé' hatchback — long sloping bonnet, wraparound windscreen, steep rear hatch, black bumpers; get this silhouette right, it is on screen all the time; a small "SAAB" text badge is fine), volvo240 (boxy saloon or estate), volvo740, audi (A6-like saloon), bmw (E34-like saloon), skoda (Octavia-like estate; white for Vita skjortan), golf (VW-like hatch), kombi (generic estate), taxi (with roof sign "TAXI"), van (delivery van), bus (red low-floor city bus), garbage (sopbil). Keep the old keys (sedan, hatch, wagon, pickup, hearse, muscle, icecream) as aliases of sensible new types so old code keeps running.
- Paint: the 'paint'/'paintsolid' surfaces fake body curvature assuming the car mesh is centred on its origin at ground level (DESIGN.md 10.2 / 10.10) — build car meshes that way, and still give them real bevels/curved panels.
- Performance: there can be 100+ cars in the scene. Share geometry per car type (paint colour via realMesh tint, section 10.4), keep each car to a handful of draw calls (merge wheel parts; body+trim in one multi-surface mesh, glass separate, light meshes small) and roughly <= 15k triangles per car. Report __stats() before/after in the game.
- Swedish licence plates: car.plate ('ABC 123' or 'ABC 12A'; letters exclude I, Q, V, Å, Ä, Ö; unique; opts.plate overrides), rendered front and rear (white plate, blue EU band with "S", black characters; use a shared plate atlas or tiny canvases — your call), car.platePos(side, out).
- Lights: all cars drive with low beams on (Swedish law; also looks great in the low sun), brake lights from ctrl.brake, reversing light, indicators; car.hazard = true blinks hazards (pulled-over smitare); car.setHeadlights(on).
- Trailer (src/actors/trailer.js): car.attachTrailer() -> car.trailer, a kinematic single-axle trailer hitched at the rear bumper whose yaw follows omega = v / L * sin(carYaw - trailerYaw) so reversing jackknifes realistically; visual model with wheels and a plate; its own OBB pushed out of static solids; exposes x, z, yaw, len, wid; detach.
- Physics (car.js): keep the arcade model (it's fun) but make it feel heavier and more real: reduce the player boost (~140 km/h top for the Saab), proper body roll/pitch/squat/dive visuals, soft suspension bob, tyre squeal only when actually sliding. Lower grip on snow-covered (non-asphalt) ground is a nice touch if cheap (ground is snow when !isRoad). Wrecked cars: charred material + smoke as before (MAT.burnt).
- drivers.js: retune AI for the new physics (traffic ~30-50 km/h, keeps lanes, brakes behind obstacles); make 'flee' convincing for a fleeing smitare (fast, takes corners, doesn't get stuck), keep 'chase', 'route', 'traffic'; add a 'pullover' mode (signal right, slow to the kerb, stop with hazards on) and document it in notes/cars.md. Moving drivers are still the bust from models.js (another agent is redoing people; seat busts where seats are).
- tools/cars.html: a standalone page (imports src/gfx.js + your car code; window.__ready; window.__views / __setView) with views such as: lineup of all types on snowy asphalt, Saab front 3/4, Saab rear 3/4, Saab side, Saab interior-through-glass with a seated bust, each other type 3/4, plate close-up, trailer attached, hazard lights. Shoot it with tools/pageshot.mjs and iterate until each car is recognisable and realistic.
- Also verify in-game in your copy (old town + old main.js still use old type names via your aliases): drive, smash, chaos, traffic, race, flee, cruise scenarios; and run 'story' at the end (must end '#7 idle' and 'no errors').`,
    critic: `Judge THE CARS: realism of models (silhouette, proportions, details, materials: paint, chrome, rubber, tinted glass, lights), recognisability (is the Saab 900 unmistakably a classic Saab 900? Volvo 240 unmistakably a 240?), licence plates (correct Swedish format and look), lights (low beams, brake, hazard), trailer behaviour (reversing jackknife), physics feel from the scenario logs and screenshots, AI (traffic flow, flee/pullover), performance (draw calls/triangles per car, fps with 100+ cars). Use tools/cars.html via pageshot and in-game scenarios (drive, chaos, traffic, cruise, flee). Check DESIGN.md section 7 API in the code.`,
  },
  {
    key: 'people', port: 8804,
    own: 'src/actors/models.js, src/actors/character.js, tools/people.html (new), notes/people.md',
    copyBack: (w) => `for f in src/actors/models.js src/actors/character.js tools/people.html; do [ -f ${w}/$f ] && cp ${w}/$f ${GAME}/$f; done; mkdir -p ${GAME}/notes && cp ${w}/notes/people.md ${GAME}/notes/`,
    task: `YOUR AREA: THE PEOPLE. Implement DESIGN.md sections 3 and 8: realistic human characters (no big heads, no big flapping mouths, no monsters) — the cast (ove, parvaneh, patrick (+ a cast-arm variant), sara, nasanin, jimmy, adrian, anita, rune in a wheelchair, anders, vitskjorta), Swedish winter pedestrians from randomPed (all ages; parkas, puffer jackets, wool coats, beanies, scarves, gloves; some elderly with a rollator or walking stick, kids in snowsuits; muted Scandinavian palette), buildBust for seated drivers, and buildCat() for the stray tabby cat.
- Realistic proportions (head ~1/7.5 of height; kids' proportions for kids), shaped torsos (chest/waist/hips, not a single capsule), two-segment arms and legs with elbows/knees, hands with a thumb, proper shoes/boots, a human head (jaw, chin, nose, ears, brows, simple eyes) with hair masses and beards, and layered winter clothing (collars, hoods, zips, cuffs, coat hems, scarves, caps). Use section-10 surfaces: fabric, leather, skin, hair, rubber, metal; characters use realMesh(..., { snow: false }).
- Performance: ~35 pedestrians + ~12 NPCs + busts in traffic. Strongly consider ONE rigidly skinned SkinnedMesh per person (every vertex weighted 1.0 to its body part's bone; one draw call per surface) instead of a mesh per limb — keep m.arms / m.legs / m.neck / m.head / m.hips as the bones or pivots other code rotates (main.js sets m.arms[0].rotation for drivers). Target <= ~250 main-pass draw calls for all people together and report it.
- Animation (animateCharacter): a believable walk cycle (heel strike, knee bend, arm swing, slight counter-rotation), brisk walk, idle breathing/weight shift, talking via head nods and hand gestures (the mouth barely moves), wave, st.write (notebook + pencil appear in Ove's hands), st.phone (phone to the ear), st.push (pushing a wheelchair), seated/driving (hands on the wheel), flung/down (a fall and lying, then getting up — not cartoon spinning), cheer (mild), kick (a tyre kick). Rune: kind 'wheelchair' — the chair is part of his model and its wheels turn when he moves.
- character.js: keep the API and physics; adapt radius/height to the new bodies, keep the old kinds working, tone down the cartoon tumble (fewer spins).
- Keep the OLD CHARS keys (nick, andrew, jessi, jay, steve, maurice, connie, duke, shame) as aliases to new cast members so the old main.js still boots (e.g. nick->ove, maurice->jimmy, shame->vitskjorta ...).
- Portraits: the HUD makes dialogue portraits with renderPortrait (src/game/hud.js — not yours) by rendering the model with renderer.render into a render target; make sure your models look good there (check by evaluating it in your copy) and note anything the UI agent must know in notes/people.md.
- tools/people.html: a standalone page (imports src/gfx.js + models.js; window.__ready; __views/__setView): full cast lineup front and side, a crowd of 12 random pedestrians, Ove close-up (face), Rune + wheelchair, cat, walk-cycle poses at 4 phases, write/phone/seated/down poses. Shoot with tools/pageshot.mjs and iterate until they look like real (if simplified) people under the realistic lighting.
- Also verify in-game in your copy: start, walk, talk, smash (a pedestrian gets hit), and 'story' at the end (must end '#7 idle' and 'no errors').`,
    critic: `Judge THE PEOPLE: realism (proportions, anatomy, faces, hands, clothing layers, winter-appropriate, materials), cast recognisability vs DESIGN.md section 3 (stocky grumpy grey-haired Ove in a dark jacket; pregnant Parvaneh; tall lanky Patrick; round Jimmy; Rune in a wheelchair; slick Anders; Vita skjortan in white shirt and tie), pedestrian variety, the cat, animation quality (walk cycle, idle, talk, write, phone, seated, fall), absence of cartoon features (big heads/mouths, monsters), performance (draw calls). Use tools/people.html via pageshot and in-game scenarios (start, walk, talk, smash). Check the DESIGN.md section 8 API in the code.`,
  },
  {
    key: 'ui', port: 8805,
    own: 'src/game/hud.js, style.css, index.html, src/audio.js, notes/ui.md',
    copyBack: (w) => `for f in src/game/hud.js style.css index.html src/audio.js; do cp ${w}/$f ${GAME}/$f; done; mkdir -p ${GAME}/notes && cp ${w}/notes/ui.md ${GAME}/notes/`,
    task: `YOUR AREA: UI AND SOUND. Implement DESIGN.md section 9 (HUD & audio contract) and the UI look of section 2, all text in Swedish.
- Restyle every HUD element, the title screen and the pause menu in a clean Scandinavian design: Barlow / Barlow Condensed (road-sign feel) from Google Fonts, Caveat for Ove's handwriting; muted colours, thin rules, subtle translucent panels, no comic-book bursts or cartoon fonts. Title: "SAAB & RUN" with "En man som heter Ove" and a dry tagline (e.g. "Det är förbjudet att köra bil inom området."); controls listed per DESIGN.md 4.6. Pause: Fortsätt, Musik/Ljud toggles, Grafik: Hög/Låg (gfx setQuality — see DESIGN.md 10.1), Oves anteckningsbok (hud.renderLog), Radera sparat spel.
- Implement every new hud.* API in section 9 (setMeter + setShame alias, setPursuit, setReports, notebook.show/progress/done/cancel with a paper page, ruled lines, handwritten plate/fields filling in and a red rotated ANMÄLD stamp, incomingCall/endCall card with portrait and ringing pulse, setErrand panel separate from the mission objective, tags (world-anchored labels projected with the camera every frame), setClock, renderLog, new minimap marker types). Keep every existing hud.* function working (old main.js still calls them).
- Minimap and big map in a winter palette (white/pale-grey snow, dark asphalt roads, grey buildings), north-up indicator, clean markers.
- Speedometer in km/h styled after a Saab 900 instrument (green-lit needle and numerals on black).
- Portraits (renderPortrait): realistic lighting for PBR models (the scene's environment map / a small RoomEnvironment PMREM, soft key light), framed head-and-shoulders, works for the new human models (another agent is rebuilding them; test with whatever models.js exports in your copy).
- Banners and toasts: understated ("UPPDRAG KLART", "ANMÄLD", "TAGEN!", "SMET!", "KAOS I OMRÅDET", "ORDNING OCH REDA"), radio/phone toasts with portrait.
- audio.js (everything synthesized, no samples): keep every existing function (old code calls them) and add audio.ring(on) (old landline double ring), audio.pen(on) (pencil scratching on paper), audio.stamp(), audio.doorbell(), audio.catMeow(), audio.alarm() (alias of shameBell), audio.step(surface) (footstep crunch on snow / scrape on asphalt). Re-voice the engine as a Saab four-cylinder with fake gear changes; Saab-like dual-tone horn; car door clunk; snow-crunch tyre sound when sliding on snow. Replace the walking-bass music with sparse, melancholic synthesized piano and a soft string pad in a minor key (think a Scandinavian film score), not repetitive or grating; music toggles still work.
- Test in your copy: index.html?test=1 with the old main.js; add a throwaway 'hudtest' scenario to your copy's tools/shot.mjs that calls every hud API with sample data (notebook mid-write and stamped, incoming call, errand panel, pursuit bar, tags, clock, big map, pause menu with log) and screenshot each state; also 'title', 'talk', 'start', 'drive'. Audio can't be heard headlessly: check it by reading the code carefully and evaluating that every audio function runs without errors (and log the node graph if useful).`,
    critic: `Judge UI AND SOUND: visual design quality of every HUD state, title and pause screens (clean, Scandinavian, readable, consistent, not cartoony, fits a realistic game), correct and natural Swedish (spelling, grammar, tone — Ove-like dry humour), the DESIGN.md section 9 API completeness (read hud.js and audio.js; evaluate each function in the page), minimap readability, portraits with the new lighting, speedometer. For audio (can't be heard): read audio.js and judge whether each sound is plausibly designed (envelopes, frequencies, filtering) and the music is non-grating; check no errors are thrown. Run the copy's hudtest/title/talk/start/drive scenarios (or make your own) and Read the PNGs.`,
  },
]

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '1-10 (10 = convincingly realistic / production quality for a procedural three.js game)' },
    verdict: { type: 'string' },
    contractOk: { type: 'boolean', description: 'whether the DESIGN.md contract for this area is fully implemented' },
    strengths: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          area: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'area', 'problem', 'fix'],
      },
    },
  },
  required: ['score', 'verdict', 'contractOk', 'issues', 'strengths'],
}

const finish = (a, w) => `\nWHEN DONE: make sure notes/${a.key}.md in your copy is up to date (API, contract additions/deviations, known weaknesses), then copy back your owned files (${a.own}) with exactly:\n  ${a.copyBack(w)}\nYour final message: what you built/changed, numbers (fps, draw calls, triangles), what still looks weak.`

async function chain(a) {
  const w = `${WORKROOT}/${a.key}`
  const pre = PRE(w, a.port)
  const out = { area: a.key, steps: [] }
  const b = await agent(`${pre}\n\nYou own: ${a.own}.\n\n${a.task}\n${finish(a, w)}`, { label: `${a.key}: build`, phase: 'Build', effort: 'xhigh' })
  out.steps.push({ step: 'build', report: b })
  for (let round = 1; round <= ROUNDS; round++) {
    const cport = a.port + 10 * round
    const c = await agent(`${PRE(w, cport)}\n\nYou are a demanding reviewer (art director / senior engineer) for the "${a.key}" area. The builder's private copy is ${w} — review THAT copy (you own nothing: don't edit any files and don't copy anything back; use PORT=${cport} for your own runs; screenshots you take land in its out/ folder, which is fine). This is review round ${round}.\n${a.critic}\nReturn a score and a prioritised list of concrete, actionable issues, each with a specific fix (file, what to change). Be strict: the user asked for a realistic look and a polished game.`, { label: `${a.key}: review r${round}`, phase: 'Critique', schema: CRIT_SCHEMA, effort: 'high' })
    if (!c) break
    out.steps.push({ step: `review ${round}`, score: c.score, contractOk: c.contractOk, verdict: c.verdict, issues: c.issues })
    log(`${a.key} r${round}: ${c.score}/10, contract ${c.contractOk ? 'ok' : 'INCOMPLETE'}, ${c.issues.filter((i) => i.severity !== 'minor').length} blocking/major`)
    if (c.score >= 8 && c.contractOk && !c.issues.some((i) => i.severity !== 'minor')) break
    if (round === ROUNDS) break // final review only scores; its issues go to phase 3/4
    const f = await agent(`${pre}\n\nYou own: ${a.own}.\n\nYOUR AREA: ${a.key}. The builder's work is in your private copy. A reviewer (round ${round}) scored it ${c.score}/10 (contract ${c.contractOk ? 'complete' : 'INCOMPLETE'}): "${c.verdict}".\nIssues (most important first):\n${c.issues.map((i, k) => `${k + 1}. [${i.severity}] (${i.area}) ${i.problem}\n   Suggested fix: ${i.fix}`).join('\n')}\nStrengths to keep: ${(c.strengths || []).join('; ')}\n\nFix all blocking and major issues and as many minor ones as sensible (fix the real underlying problem if a suggestion is wrong). The original brief for this area, for reference:\n${a.task}\n${finish(a, w)}`, { label: `${a.key}: fix r${round}`, phase: 'Fix', effort: 'xhigh' })
    out.steps.push({ step: `fix ${round}`, report: f })
  }
  return out
}

const results = await parallel(AREAS.map((a) => () => chain(a)))
return results.filter(Boolean).map((r) => {
  const reviews = r.steps.filter((s) => s.score != null)
  const reports = r.steps.filter((s) => s.report != null)
  return {
    area: r.area,
    scores: reviews.map((s) => s.score),
    finalReview: reviews[reviews.length - 1] || null,
    lastReport: reports.length ? reports[reports.length - 1].report : null,
  }
})
