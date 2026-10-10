# UI & sound (phase 2, area F) — notes for later agents

Owned files: `src/game/hud.js`, `style.css`, `index.html`, `src/audio.js`, this file.
Everything here implements DESIGN.md section 9 and the UI part of section 2. All player-facing
text is Swedish. Every old `hud.*` / `audio.*` call still works (the old main.js boots and plays
with no errors; `story` was run against it).

## Look

- Fonts: **Barlow** 400/400i/500/600 (body), **Barlow Condensed** 500/600/700 (labels, numbers,
  road-sign feel), **Caveat** 400–700 variable (Ove's handwriting). **Embedded in `style.css`** as
  woff2 `data:` URIs (the `@font-face` block at the very end of the file, one long line per face;
  SIL OFL 1.1, copyright lines in the comment above it). No network request at all: the game is
  fully self-contained. Subset to Latin-1 + Š/š Ž/ž Œ/œ, dashes, quotes, …, €, arrows and − (≈160 KB
  of woff2); a character outside that (e.g. ✓) falls back to a system font. To add glyphs or
  weights: subset the TTFs from github.com/google/fonts (ofl/barlow, ofl/barlowcondensed,
  ofl/caveat) with `fontTools.subset --flavor=woff2 --no-hinting` and replace the block.
  **Licence note for assets/LICENSES.md** (whoever owns it): "Barlow, Barlow Condensed © 2017 The
  Barlow Project Authors; Caveat © 2014 The Caveat Project Authors — SIL Open Font License 1.1,
  embedded (subset) in style.css."
- **Resolution independence:** the HUD is laid out for 1280x720 and zoomed with CSS `zoom:
  var(--ui)`, `--ui = clamp(min(w/1280, h/720), 0.8, 2)` (set by an inline script in `index.html`
  and kept up to date by `hud.init()` on resize; `hud.ui` holds the value, `uiScale()` is
  exported). Zoomed: every HUD block, `.tag3d > span`, `.bubble`, the big map's title/legend, the
  title grid and the pause card. Inside a zoomed element `vw`/`vh` are zoomed too, so they are
  written `calc(100vw / var(--ui))`. The speedometer and minimap canvases render at
  devicePixelRatio × zoom. Checked at 1024x600, 1280x720 and 1920x1080: same layout, no overlaps.
- **Stacking inside `#hud`:** `#tags`/`#bubbles` are isolated stacking contexts at z 0 (a tag's
  inline z-index only orders tags), HUD chrome z 2, banner/notebook/letterbox/dialogue z 3, flash
  z 4, big map z 5. While the big map is open `body.bigmap-open` hides tags and bubbles.
- HUD panels: dark slate translucent cards (`.card`: `rgba(19,23,27,.58)` + backdrop blur, 1 px
  hairline, 3 px radius); small-caps condensed labels (`.kicker`); accent colours: amber
  `#f0b24a` (= the world markers), muted red `#c4483d`, sage `#8db487`, road-sign blue `#2f6096`.
  Paper (`.paper`): off-white with ruled blue lines every 30 px, a red margin, SVG paper grain.
- Layout at 1280x720: status strip top-left (clock | kr | anmälningar), left column under it
  (incoming call, avbrott panel, collectible note), Ordning meter top-right with the pursuit panel
  under it, toasts under those, objective top-centre, minimap bottom-left (round, 210 px), Saab
  speedometer bottom-right (196 px), prompt bottom-centre, notebook rises from the bottom edge
  right of centre, banners at 31 % height on a soft dark band.
- **Banners** sit on a flat dark band (`#banner::before`: `--band` colour, masked to fade out
  left/right/top/bottom, `backdrop-filter: blur(3px)`), so they read over white façades and snow.
  The headline is always white; `bad`/`chaos`/`shame` tint the band dark red and colour the rules
  and kicker, `good` sage, `mission` amber. **`stamp`** (ANMÄLD / TAGEN!) is different: a red
  rubber stamp inked on a slip of notebook paper (`.banner-main` is the slip, `.stamp-ink` the
  ink; showBanner builds that markup itself).
- Title (`#title`): left: road sign (red ring, car), "SAAB & RUN", "En man som heter Ove" in
  Caveat, tagline "Det är förbjudet att köra bil inom området.", **Spela**; right: the controls
  table from DESIGN 4.6 (one column, no table, under 980 px). Pause (`#pause`): Fortsätt, Musik /
  Ljud / Grafik toggles, **Kontroller** (Visa/Dölj: swaps the notebook page for a copy of the
  title's controls table, `#pause-controls`, cloned by hud.js), Radera sparat spel, and Oves
  anteckningsbok (a paper page, `hud.renderLog`). The card is a fixed grid (300 + 548 px); the
  log page and the controls share one cell (the hidden one is `visibility: hidden`), so the
  toggle never moves or resizes the card.
- Dialogue in letterbox (`hud.letterbox(true)` + `runDialog`): the bottom bar grows to hold the
  dialogue box, which loses its card background (film-subtitle look); without letterbox it is the
  usual card above the bottom edge.

## index.html contract (ids main.js uses)

`#app` (canvas container), `#hud` (filled by `hud.init()`), `#title`, `#play` (disabled until
ready), `#loading` (main.js writes loading text — **still English in old main.js**), `#pause`
(main.js toggles class `show`), `#resume`. `#pause-controls` and `#opt-controls` are hud.js's.
The visible toggles `#opt-music`, `#opt-sound`, `#opt-gfx`, `#opt-reset` are **wired by hud.js
itself** (no main.js code needed). `#music`, `#sound`, `#reset` still exist but are hidden — only
so the old main.js's `getElementById(...).addEventListener` doesn't crash; the new main.js should
not wire them (they can be deleted once main.js no longer references them).
Settings (music, sound, gfx) persist in `localStorage['saab-and-run-settings']` and are applied
in `hud.init()` (a stored 'low' gfx is not applied when the URL has `?lowgfx`).

## hud API

Init / plumbing
- `hud.init()` — builds the HUD DOM, wires the pause menu, starts loading the fonts.
- **`hud.fontsReady`** (promise, after init) — resolves when Barlow/Barlow Condensed/Caveat are
  loaded (or after 3 s). **main.js should `await hud.fontsReady` before `buildTown()`**, because
  `signMesh` draws Barlow Condensed into canvases (old main.js awaited "Luckiest Guy" instead).
- **`hud.onResetSave = () => game.resetSave()`** — called after the two-step "Radera sparat
  spel" confirm (falls back to `window.__game.resetSave()`).
- `hud.syncMenu()` — refresh the toggle labels (done automatically whenever `#pause` gets `show`).
- `hud.portraits[key] = dataURL` — main.js fills it with `renderPortrait`.

Counters / meter / clock
- `hud.setCoins(n)` (kronor, shows "124 kr"), `hud.bumpCoins()`.
- `hud.setReports(n)` — anmälningar counter (hidden until first call).
- `hud.setClock('06:42')` — hidden until first call.
- `hud.setMeter(v)` — **the** Ordning meter call: 0–100, high = orderly (colour red → amber →
  sage; label pulses under 20). Any jump of ≥ 1 in one call floats a "+7" / "−12" and flashes the
  bar; slow drains (0.08/s) don't. It shows 50 at boot, and the game's first call jumps straight to
  its value (no big delta).
- **`hud.setShame(v)` is LEGACY with the OLD polarity: v = shame, high = bad; it shows Ordning =
  100 − v** (the old shame.js calls `setShame(0)` when all is well, which now correctly reads
  100, not a red 0). New code (patrol.js) must call `setMeter(ordning)` and never `setShame`.
  (DESIGN 9 calls setShame "an alias": it is one, but of the old meter's meaning.)
- `hud.setPursuit({ label, bar, dist, note?, farAt?, barLabel? } | null)` — SMITARE panel under
  the meter (call it every frame; it only writes to the DOM when a shown value changes, same for
  setErrand and setObjective): `label` e.g. "KLM 45B · Volvo 740", `bar` = how much fight the
  smitare has left 0–1 (DESIGN 4.1's "motstånd"), labelled **"Ork"** (or `barLabel`), `dist`
  metres; beyond `farAt` (default 80 m) the distance pulses amber and the note says **"Tappar
  spåret"** (or your `note`). Adds `body.pursuit` (toasts move down).
- `hud.setObjective({ title, text, timer, bar, barLabel, barColor } | null)` — unchanged API, now
  cached (no DOM writes while nothing changes); `barColor` (missions pass candy hex colours) is
  muted automatically.
- `hud.setErrand({ title, text, timer, bar, barLabel, kicker? } | null)` — the avbrott panel,
  separate from the objective (kicker defaults to "Avbrott"; timer < 15 s pulses red).

Phone
- `hud.incomingCall(who, name, sub = '')` — ringing card: kicker "Telefonen ringer", the name,
  an optional line under it (e.g. "Radhus 12"; hidden when empty), portrait `hud.portraits[who]`,
  pulsing rings, shaking handset. Plays no sound: call `audio.ring(true)` yourself.
- `hud.answerCall()` (addition, optional) — stops the pulse, shows "I samtal" and a call timer.
- `hud.endCall()` — "Samtal avslutat", fades out.
- `hud.phone(who, name, text)` / `hud.radio(who, name, text)` (additions) — toast with portrait,
  name in amber small caps. (Old main.js builds its own `<img class="radio-face">` toast HTML;
  that is still styled.)

Notebook (reporting) — `hud.notebook`
- `.show({ plate, kind, text, place, time, no? })` — a ruled page slides up; fields Reg.nr, Plats,
  Tid, Överträdelse (from `text`, else a sentence from `kind`), signed "Ove"; `no` shows "Nr 8".
  **Every label and every line of handwriting rests on a ruled line** (measured: the rule is 1.0
  px under each baseline, at 1024x600, 1280x720 and 1920x1080). How: every row is one 30 px line
  box whose font (Caveat 28/30) is only a strut that fixes the baseline at 24.2 px; labels and
  values sit on it with line-height 1; the rules are a 30 px background tile at `--rule-off: 0`.
  Long values (`NB_FIT` in hud.js): Reg.nr/Tid shrink to 15 px on their line; **Plats** stays on
  one line down to 19 px (~25 characters, e.g. "Radhusområdet, Tegelvägen" at 22 px), then takes
  **two lines** (the page grows by one rule): a 39-character place is two lines at full size,
  ~70 characters fit two lines at 16 px; **Överträdelse** gets two lines down to 17 px, then
  three (~100 characters at 18 px). Anything longer is cut with "…" (never clipped mid-glyph).
- `.progress(p)` — 0..1, reveals the handwriting character by character with the red carpenter's
  pencil following the text (text done at ~0.97, signature last).
- `.done()` — red rotated **ANMÄLD** stamp (with "KL 06:42"), page leaves after 1.7 s.
- `.cancel(reason)` — scribbled cross + "Avbrutet – reason", leaves after 1.4 s.
- `.hide()`, `.open` (bool). While open, `body.nb-open` hides the prompt.
- **It plays no sounds.** Recommended: `audio.pen(true)` on show, `audio.pen(false)` +
  `audio.stamp()` on done (the stamp lands immediately), `audio.pen(false)` on cancel.

Prompt / toasts / banners / misc
- `hud.setPrompt(html, hold?)` — `<b>F</b>` renders as a key cap; optional `hold` 0..1 draws a
  small progress bar (for hold-E / hold-F).
- `hud.toast(html, cls = '', ms = auto)` — cls `radio` | `phone` | `good` | `bad` | `warn`;
  duration scales with text length (2.6–7 s); max 4 on screen.
- `hud.showBanner(main, sub, cls, ms = 2600, kicker = '')` — cls `good` | `bad` | `mission` |
  `count` | `stamp` | `chaos` | `final` | `shame`; **empty cls is guessed from the text**:
  ANMÄLD / TAGEN! → stamp (rubber-stamp look), SMET! → bad, KAOS I OMRÅDET → chaos, ORDNING OCH
  REDA / UPPDRAG KLART → good, OMRÅDET ÄR I ORDNING → final. `kicker` = small line above (e.g.
  "Dag 3" / "Måndag"). `hud.hideBanner()`.
- `hud.showCollect(html, ms)` — note in the left column. Icons: `<span class="emblem-icon">`,
  `<span class="photo-icon">` (old `.rec-icon`/`.mos-icon` still styled); wrap a Sonja memory in
  `<span class="memory">…</span>` to get Ove's handwriting.
- `hud.flashColor(css, ms = 700)` (fades out over `ms`), `hud.letterbox(on)` (the dialogue box darkens into the bottom bar),
  `hud.say(target, text, secs)` + `hud.tickBubbles()` (speech bubbles).
- `hud.runDialog(lines, game)` — unchanged contract (`game.charDef`, `setTalker`, `onFrame`,
  `offFrame`, `input.pressed('skip')`, `autoDialog`). The voice is one `audio.talk(voice)` per
  **word** (at a word start, at most one per 0.22 s): a soft murmur under the text, not a blip per
  letter (DESIGN 2: "mouths barely move").
- `hud.tags(list)` — call every frame with `[{ x, y, z, text, cls, opacity? }]`, `cls` ∈
  `violation` (blue P-förbud disc), `smitare` (red), `reported` (grey with a tick), `neighbour`,
  `errand`, `plain`. Projected with the game camera, hidden off-screen/behind, shrinking with
  distance; only the background classes fade (`TAG_FADE` in hud.js: [min opacity, min scale] =
  smitare [1, 0.9], violation [0.9, 0.8], errand [0.92, 0.82], neighbour [0.6, 0.75], reported /
  plain [0.35, 0.72]) — the things Ove hunts stay readable at any distance. The smitare tag is
  opaque red with a white hairline. Or pass `opacity`. Pass `[]`/`null` to clear. Put `y` ~0.5 m
  above the car roof. DOM nodes are pooled. Tags and bubbles always draw under the HUD panels.
- `hud.renderLog(entries)` — `[{ plate, kind, text, time, caught?, escaped? }]` oldest first;
  drawn on the pause menu's paper page (short kind names, e.g. "På gräsmattan", "Bil i bilfritt
  område", "Gästplats över ett dygn"). `caught: true` = a smitare who was caught: "(tagen)";
  `escaped: true` = one who got away: struck through, "(smet)", a dash instead of the tick, and not
  counted in "Anmälda felparkeringar". Lines too long for the page shrink to fit. Re-rendered
  automatically when the pause menu opens, with the last entries passed.

Maps
- `hud.buildBaseMap(opts?)` — winter palette (snow, dark asphalt, grey buildings, faint dashed
  centre lines). Block fill colours are keyed by `MAP` type (`ove`, `park`, `field`, `cemetery`,
  `forest`, `centrum`, `hospital`, …; unknown = snow). Buildings: collision BOXes of kind
  `building`/`house`/`church`/`marquee` (and `garage`/`shed`/`carport` lighter), or `solid` with
  `top ≥ 2.4`. Ove's car-free area: `opts.carFreeZones` or `layout.carFreeZones`
  (`{x0,z0,x1,z1}`), drawn as a dashed amber outline.
- `hud.drawMinimap(px, pz, camYaw, playerYaw, markers, route)` — unchanged; rotates with the
  camera, N badge orbits the rim. Marker types: `mission`, `objective` (pulsing), `enemy`,
  `friend`, `item`, `record`, `mosquito`, and new **`violation`** (tiny P-förbud sign),
  **`smitare`** (red diamond + ping), **`errand`** (amber ring, pulsing), **`neighbour`** (teal
  dot), **`emblem`** (silver badge with a red centre; old `record` too), **`photo`** (a small
  white-bordered print), **`collectible`** (white star, generic). `edge: true` pins to the rim.
  `markers` may be null.
  Violation and smitare markers are drawn 1.25x larger on the minimap. The disc has a white rim
  and a dark outer ring so it reads over snow.
- `hud.toggleBigMap(on, game)` — north-up, labels from `game.mapLabels()` (uppercased), north
  arrow, 100 m scale bar. Place names never overlap each other: each is tried above, below,
  right, left (then further out) of its place and goes where it covers nothing, else where it
  covers least (the player arrow weighs most); one that fits nowhere is left out. Names are drawn
  under the markers. The legend's symbols are drawn by the same `drawMarker` code (tiny canvases),
  so they always match the map. Legend counts: `game.got.emblems` / `game.got.photos` (Sets or arrays;
  falls back to `records` / `mosquitoes`), anmälningar from `game.reports` or
  `game.patrol.reports` (number or array) if present.

Speedometer
- `hud.setSpeedo(car | null)` — Saab 900-style dial, 0–200 km/h (`|forwardSpeed| * 3.6`),
  soft green-lit numerals and needle on black (a hint of glow, not neon; colours in `SPC`), digital
  km/h readout, a segmented condition arc labelled **SKICK** (`car.hp / car.spec.hp`). No brand
  word on the dial (it is used for every car). Name badge: `CAR_NAMES[car.name]` (saab → "Saab 900", patrickCar,
  runeVolvo, andersAudi), else `car.displayName`, else `car.spec.name` — the new car specs are
  already Swedish ("Volvo 240", "Skåpbil"); the old English ones are translated ("Family Wagon" →
  "Kombi", "Hatchback" → "Halvkombi", "Van" → "Skåpbil", …) or hidden. Redrawn only when the value
  changes.

Portraits
- `renderPortrait(renderer, model)` → JPEG data URL, 256x256. A close head-and-shoulders frame
  (~1.9 head heights, eye line 40 % from the top). Works with the **people agent's models**
  (tested with their `models.js`: all 11 cast members): `model.head` is an eye-level marker there,
  so it aims at it and uses `model.headTop` (top of hair/hat) and `model.D.headH`; for a `head`
  group with geometry (old models) it frames that group's bounding box. Cartoon heads are
  clamped. Lit by the world HDRI (`scene.environment`, intensity 0.4), a warm key (4.4) from
  camera-left **that casts a 1024 px shadow** (brows, noses, hat brims model the face), a cool rim
  (2.4) and a faint fill (0.2) — a ~2.5–3:1 key/shadow ratio, so pale faces and white hair (Anita,
  Rune) still separate — and a 3 % warm midtone lift after tone mapping (`PORTRAIT.warm`); rendered to a float MSAA target and tone mapped in JS with three's ACES, over a
  muted blue-grey studio backdrop with a vignette. ~10 ms each (the first ~100–400 ms: shader
  compile). Lighting constants: exported `PORTRAIT` object. Round crops (`.radio-face` 38 px, call
  card 58 px) zoom on the head via `object-view-box`. The people agent's note ("distance 0.9 ×
  scale") is not needed: framing is computed from the head.

## audio API

All old calls kept: `init, setMuted, setMusic, duckMusic, engine, skid, tone, noise, coin, jump,
kick, smash, crash, thud, boing, ouch, splash, door, pickup, squash, talk, checkpoint, tick, horn,
jingle(start|complete|fail|record), shameBell`, flags `muted`, `musicOn`, `ready`.
Re-voiced: everything is "realistic/understated" now (coin = pantburk clink, kick = boot on a
tyre, door = heavy car-door clunk, jingles = short piano motifs in the score's room, talk = a
muffled voiced syllable through a random vowel formant, old square-wave `tone()` calls are
softened to triangles).

New:
- `audio.engine(on, revs, load, speed?, surface?)` — Saab four (firing f = rpm/30) with five
  fake gears (hysteresis, a clutch dip and rpm drop on each upshift), a cold-start crank + flare
  when started after > 2.5 s off, a quiet turbo whistle and a blow-off when the throttle snaps
  shut at boost, tyre rolling noise. Pass **`speed` (m/s)** for real gearing and **`surface`
  ('snow' | 'asphalt')** for the rolling sound; without them the gear is derived from `revs`
  (old car.js formula). `audio.gear` = current fake gear (read-only).
- `audio.skid(amount, surface?)` — 'asphalt' (default) a quiet wobbling squeal, **'snow' a
  granular snow crunch**.
- `audio.horn(on)` — dual-tone (405/498 Hz) brassy horn. `audio.honk(vol = 1, dur = 0.3)` — short
  honk for other cars (scale `vol` by distance).
- `audio.ring(on)` — an old Swedish landline (Televerket/Ericsson Dialog): one long burr per
  cycle, two bells and a ~22 Hz clapper, 1.0 s on, 3.0 s off (the real pause is ~5 s; constants
  `RING_ON`/`RING_OFF` at `scheduleRing`), loops until `ring(false)`. Through a 4.5 kHz low-pass
  (`ringBus`) so it doesn't grate: spectral centroid 1.8 kHz (was 3.2), peak −13.7 dBFS.
- `audio.talk(pitch)` — a soft wordless murmur (~0.15 s: breathy voiced hum through two gliding
  Q-2 vowel formants, plus breath noise). hud.runDialog plays one per word.
- `audio.pen(on)` — pencil scratching (grainy strokes with gaps) until `pen(false)`.
- `audio.stamp()`, `audio.doorbell()` (ding-dong), `audio.catMeow()` (randomised),
  `audio.alarm()` (= `shameBell`: a church bell tolling twice, far off).
- `audio.step(surface = 'snow')` — one footstep: 'snow'/'grass'/'lawn' crunch, 'asphalt'/'paving'
  (default branch) heel + scrape + grit, 'gravel', 'wood', 'ice'. Call it from the walk cycle
  (≈ every 0.42 s walking, 0.3 s rask gång).
- Music: generative piano + string pad in A minor at 64 bpm: each 4-bar phrase picks one of 8
  progressions (Am–F–C–G, F–C–Dm–Am, Dm–Am–F–E, …), a texture (sparse / broken chords / melody
  developing a kept motif / "breath" = strings only every 5th phrase), humanised timing and
  velocity, in a synthesised 2.6 s room. `setMusic(false)` stops scheduling; `duckMusic(0..1)`
  (e.g. 0.5 during a pursuit or a call). Each chord has its own colour tone (add9 where diatonic,
  m7 on Em, none on the E major dominant) and the melody switches to harmonic minor (G#) over E:
  checked over 20 000 generated bars, no A#/B♭ anywhere and no G over E.
- Engine: a 35 Hz high-pass after the saturator (the idle firing fundamental is 26.7 Hz and the
  half order 13 Hz: inaudible on most speakers, they only pumped the compressor); the half-order
  gain is 0.2.
- Mix (offline-measured peaks, round 3): **every effect peaks between −24 and −12.9 dBFS** —
  engine −12.9 at full load (RMS −22), ring −13.7, crash −14.3, doorbell −15.0, horn −15.2, stamp
  −17.6, door −17.7, snow steps −17.8, smash −18, tick −18.6, kick −19.6, talk −19.9, ouch −21.1,
  jump −21.8, boing −22.3, pickup −22.6, squash −22.8, splash −23.0, thud −23.5, coin −23.6,
  checkpoint −23.7, asphalt steps −23.7, pen −23.8, cat −24.0; music RMS −29. (Round 2 had jump
  −43.7, ouch/talk −35, squash −32.6, tick −31.4: inaudible.) Master through a gentle compressor
  (−16 dB threshold).
- Test hook: `await audio._offline(secs, fn)` renders `fn(audio, offlineCtx, helpers)` into an
  OfflineAudioContext and returns the AudioBuffer (helpers: `scheduleMusic(t0, t1)`,
  `scheduleRing(t1)`, `schedulePen(t1)`; `await offlineCtx.suspend(t)` + `resume()` to drive the
  engine over time). Don't run it while the player is in a car (it swaps the live graph out).

## How it was tested (in the UI copy)

Round 3 (second review's fixes): `tools/uitest.html` (new, throwaway: every HUD state over a
clean game frame, `out/bg_*.png` from the `bg` scenario, without booting the game; it also probes
every notebook row's baseline against its rule) via `pageshot.mjs` at 1024x600, 1280x720 and
1920x1080; `tools/audiotest.mjs` for the levels above plus a spectral check of the ring and the
murmur; `tools/portraittest.html?set=people` before/after the lighting change; in the game:
`hudtest` (all states), `title`, `talk`, `start`, `drive`, `perf` with the old main.js — 60 fps
(rAF median 16.7 ms, p95 16.8 ms driving), 870–1650 draw calls and 2.4–2.9 M triangles (the
world, not the HUD), drawMinimap 0.03 ms, no console errors.

Round 2 (review fixes): `hudtest` extended with `busy` (every panel at once + tags + a bubble),
`nblong` (very long place/text), escaped/caught log entries and the pause Kontroller view, run at
1024x600, 1280x720 and 1920x1080 (`W`/`H`/`SFX` env vars); `net` scenario: no external requests,
all faces loaded from the embedded fonts; `title`, `talk`, `start`, `drive`, `perf`, `story`
with the old main.js; `tools/portraittest.html?set=people` renders the people agent's cast;
`tools/audiotest.html` + a node check of 20 000 generated music bars.

Round 1:

- `tools/shot.mjs` throwaway scenario `hudtest` (every hud API with sample data: status strip,
  errand, toasts, tags, prompt with hold bar, objective, notebook mid-write / stamped /
  cancelled, call ringing / live, pursuit near / far + TAGEN!, all banners, driving with the
  speedometer, big map with new marker types, pause menu with log and toggles), plus `title`,
  `start`, `drive`, `talk`, `story` with the old main.js: 60 fps (rAF median 16.7 ms, p95
  16.7 ms while driving), no console errors; `story` played missions 1–2 and 4–7 to `#7 idle`
  / `no errors` — mission 3's follow stage timed out twice when the test's `anyCar()` happened to
  grab the 10 m school bus, which then blocked the van (the known story-test flakiness; the
  baseline UI files pass/fail it at random too).
- `tools/portraittest.html` (realistic-proportion mannequins + old models) via `pageshot.mjs`.
- `tools/audiotest.html` + `tools/audiotest.mjs`: renders every sound offline to WAV, prints
  peak/RMS, then spectrograms (uv + scipy) to check the gear changes, ring cadence, music, meow;
  and calls every public audio function on a live context (no exceptions).
  (These tools stay in the UI copy; they are not part of the game.)

## Known weaknesses / for later

- The fonts live in `style.css` because this area owns no asset folder; if someone owns
  `assets/`, moving them to `assets/fonts/*.woff2` + `@font-face url(...)` is a 10-minute job.
  Don't `cat` the whole style.css: its last 8 lines are ~215 KB of base64.
- Below ~740 px wide the objective card and the side panels start to touch (the zoom bottoms out
  at 0.8); nobody plays there, but a phone layout would need its own arrangement.
- Old main.js/missions.js still produce English strings (loading text, "Back on the road!",
  "MISSION COMPLETE!", map labels, …) — phase 3 replaces them.
- Portraits now frame the people agent's models well, but those faces are simple and a little
  mannequin-like at 256 px; nothing in hud.js can fix that. Re-render after the final cast lands
  (main.js must render them after the models exist; Ove's portrait key is the player's).
- Synthesised audio was verified by measurement and spectrograms only — nobody has *listened* to
  it. The engine's character (exhaust harmonics, the crank) and the cat are the most likely to
  need ear-tuning: constants live at the top of `buildEngine` and in `catMeow`.
- `hud.tags` does no occlusion (labels show through buildings); keep the list to things within
  ~35 m (smitare/violation tags no longer fade, so a far one behind a house stays visible).
- The ANMÄLD stamp lands over the Plats/Tid lines of the notebook (as a real stamp would); the
  page leaves 1.7 s later, so nobody needs to read under it.
- Map labels are still the old English `MAP_LABELS` from main.js (phase 3).
- The title screen shows whatever the game camera sees behind it; a dedicated title camera shot
  (e.g. Ove's Saab outside the garage) would make it much nicer (main.js).
