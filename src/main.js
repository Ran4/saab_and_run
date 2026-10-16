// Saab & Run — glue: builds the town, runs the fixed-step simulation, routes input to Ove or his
// car, and wires up the patrol (felparkeringar, smitare, the Ordning meter), the avbrott (the
// neighbours' calls), the story missions, pickups, the neighbours and the HUD.

import { THREE, initGfx, renderer, scene, camera, followSun, tickSky, renderFrame, gfxReady, gfxStats, precompile, uploadGeometry, nextTask } from './gfx.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { voice } from './voice.js';
import { parkedCars, tickTown, litterSpots, collectibleSpots, mapLabels as townLabels, surfaceAt as townSurfaceAt } from './world/town.js';
import * as TOWN from './world/town.js';
import { finalizeProps, tickProps, breakProp, propsNear, props as allProps } from './world/props.js';
import { lm, landmarks, routeAim, N, LANE, RHW, SW, nodeX, nodeZ, neighbors, BOUND, isRoad, isCarFree, HALF, P } from './world/layout.js';
import { tickWild } from './world/outskirts.js';
import { groundAt, queryBlocks, contains, circleVsObb, circleVsBlock, obbVsBlock } from './world/collision.js';
import { Car, collideCars, warmCars } from './actors/car.js';
import { tickCarSnow } from './actors/carsnow.js';
import { Character } from './actors/character.js';
import { CHARS, buildBust, randomPed, buildCat, carryPoint } from './actors/models.js';
import { AIDriver } from './actors/drivers.js';
import { spawnPeds, nearestSidewalk } from './actors/peds.js';
import { initCans, tickCans, Collectible } from './actors/pickups.js';
import { EMBLEM_NOTES, PHOTO_NOTES } from './game/collection.js';
import { fx as FX } from './game/fx.js';
import { tracks } from './game/tracks.js';
import { hud, renderPortrait } from './game/hud.js';
import { CamRig } from './game/camera.js';
import { Patrol } from './game/patrol.js';
import { Interruptions } from './game/interruptions.js';
import { Horn } from './game/horn.js';
import { Hoppbacke } from './game/hoppbacke.js';
import { Cold } from './game/cold.js';
import { RuneFate, KILL as RUNE_KILL } from './game/rune.js';
import { Parking } from './game/pskiva.js';
import * as stages from './game/stages.js';
import { MissionRunner, MISSIONS, DAYS, DAY_END, flowersOnGrave } from './game/missions.js';
import { Bang, Beacon, GuideArrow } from './game/markers.js';
import { clamp, dist, yawTo, pick, dampAngle, angleDiff } from './util.js';
import { HANDLE as DOOR_HANDLE } from './world/garagedoor.js';
import {
  CHATTER, CHATTER_FIRST, CHATTER_AFTER, CHATTER_FALLBACK, CHATTER_REPLY, CHATTER_ENOUGH, CHATTER_SPARE, whenOk, SLID, TYRE,
  GARAGE_DOOR, WIDOW, OVE_STUMBLE,
  OUCH, GETUP, CARJACK, KICKED, KICKED_NEIGHBOUR, SHOVED, SHOVED_KID,
} from './game/script.js';

const STEP = 1 / 60;
// Ove's head with his small talk (chat, features/implemented/smaprat.md): his silence by whom he isn't
// answering (Parvaneh's "Andas." is for Patrick: nothing), and a few short answers.
const CHAT_SILENT = { rune: 'nod', vitskjorta: 'shake', anita: 'nod' };
const CHAT_GESTURE = { 'Nej.': 'shake', 'Mm.': 'nod', 'Ja?': 'nod', 'Hej.': 'nod', 'Hej, Anita.': 'nod' };
// At most two fixed steps per frame: a slow frame is caught up once, never with a burst of four that
// makes the next frame slower still (on a laptop update grew 2.5 -> 4.6 -> 9.8 ms that way).
const MAX_STEPS = 2;
// Traffic AI and pedestrians further than this from Ove think at 30 Hz (half of them each step).
const FAR2 = 120 * 120;
const SAVE_KEY = 'saab-and-run-v1';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// On foot (DESIGN 4.4): walk, run (Shift, "spring"), one small jump, kick a tyre.
// Pushing Rune's wheelchair: 3.0, or 3.6 with Shift (2.2 made the errand a 50 s crawl).
// The jump: 3.95 m/s under character.js' JUMP.grav is 0.55 m up and ~0.56 s in the air, after a
// wind-up (half a second standing). A press he can't act on yet (still in the air, just landing) is
// kept JUMP_BUFFER s and acted on as soon as he can.
const WALK = 3.2, BRISK = 5.5, PUSH = 3.0, PUSH_BRISK = 3.6, JUMP_V = 3.95, JUMP_BUFFER = 0.25;
// Ove is an old man (feature snubbla_vid_hopp): one landing in forty he trips and goes down (a ragdoll,
// actors/ragdoll.js; never in tests without &stumble: __game.stumbleNext trips the next one), and out of
// a car moving faster than `exit` m/s (~14 km/h) he tumbles along the road. Every fling of his is a
// ragdoll (a car into him, his car wrecked under him).
const STUMBLE = { chance: TEST && !params.has('stumble') ? 0 : 1 / 40, exit: 4 };
const CLOCK_RATE = 0.25;   // in-game minutes per real second: an hour every four minutes
// The clock stops at the end of the day while nothing is going on: the days end at 14:30 ("Dagen är
// slut", missions.js DAY_END) and the light never changes, so before day 1, between two days and while
// a day waits for Ove it shows no later time than that. Day 7 runs on to dusk (its cut sets 15:40); after
// the whole story it stops at 16:30. It never goes backwards by itself.
const DAY_END_MIN = DAY_END[0] * 60 + DAY_END[1], AFTER_STORY_MIN = 16 * 60 + 30;

// The neighbours and where they spend the day: [landmark, metres to its right, metres ahead]
// (landmark yaw = the way someone standing there faces; houses: out of the door).
const HOMES = {
  parvaneh: ['parvanehHouse', 0, 0],
  patrick: ['parvanehHouse', 1.3, 0.7],
  sara: ['parvanehHouse', -2.2, 1.6],
  nasanin: ['parvanehHouse', -1.3, 2.4],
  jimmy: ['jimmyHouse', 0, 0],
  adrian: ['adrianSpot', 0, 0],
  anita: ['runeHouse', -0.9, 0.2],
  rune: ['runeHouse', 0.6, 0.9],
  anders: ['andersHouse', 0, 0],
  vitskjorta: ['kommun', 1.5, 0],
};

// Everything said out loud (the neighbours' small talk, Ove's reactions, people knocked over, kicked
// or shoved ...) is in game/script.js. The collectibles' notes (only read) are in game/collection.js.
// Ove's Saab always wears the same plate (the player looks at it all game). Valid Swedish format:
// no I, Q, V, Å, Ä, Ö, and no O last.
const FIXED_PLATES = { saab: 'SAB 900', tractor: 'BRF 076' };
// The title shot (Game.titlePose): the Saab rolled out of its bay, Ove beside it.
const TITLE_POSE = { out: 4.1, turn: 0, ove: [1.5, 0.9, 0.15], look: -0.6, arc: { th0: 0.70, th1: 0.52, d0: 7.6, d1: 6.6, off: 2.3 } };
const TRAFFIC = ['volvo240', 'volvo740', 'volvo740', 'golf', 'golf', 'kombi', 'kombi', 'skoda', 'bmw', 'audi', 'saab900', 'taxi', 'van', 'volvo240', 'kombi', 'bus', 'garbage'];

const _v = new THREE.Vector3();
const _hit = {}, _hit2 = {}, _obst = { dist: 0, isPlayer: false };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const isPerson = (c) => c.state === 'normal' || c.state === 'down' || c.state === 'flung';

class Game {
  constructor() {
    this.cars = [];
    this.named = {};
    this.npcs = {};
    this.peds = [];
    this.coins = 0;
    this.time = 0;
    // A late-November day in Sweden: light from about nine to three. The day starts at 10:30 and
    // ends at 14:30 ("Dagen är slut"); the clock is saved.
    this.clockMin = 10 * 60 + 30;
    this.frame = 0;
    this.acc = 0;
    this.hooks = [];
    this.paused = false;
    this.started = false;
    this.playerCar = null;
    this.kickT = 0;
    this.kickHitT = -1;
    this.jumpAsk = -9;    // when jump was last pressed (this.time) and not yet acted on
    this.freezeCar = false;
    this.inDialog = false;
    // Something in Ove's hands that takes the keys (game/pskiva.js): 'pskiva' (the disc), 'lapp' (a
    // parking ticket), else null.
    this.overlay = null;
    this.talker = null;
    this.input = input;
    // Ove's collection, in the order found (Sets: an emblem's note goes with its place in the order)
    this.got = { emblems: new Set(), photos: new Set() };
    this.lastFound = null;   // { kind, id }: what the album opens on (not saved)
    this.cans = 0;           // pantburkar picked up, ever (saved: `pant`)
    this.unlocked = new Set();
    // Rune died on his errand and Ove gave it up (game/rune.js; saved: `rune: 0`). True from the
    // moment he dies, also while E or Q is still to be chosen.
    this.runeDead = false;
    this.autoDialog = TEST;
    this.companions = new Map();   // Character -> { push, left }
    this.carrying = null;           // the cat (or anything with a root) in Ove's arms
    this.poseT = 0; this.pose = null;
    this.tyreT = 0;
    this.penaltyKr = 0; this.penaltyT = 0;
    this.lastMissionState = 'idle';
    this.stages = stages;
    this.carsVer = 0;               // bumped whenever this.cars changes (the sorted list follows)
    this._byX = [];                 // the cars sorted by their west edge (x - radius), see sortedCars
    this._rmax = 7;
    this.stepN = 0;
    this.crumbs = [];               // Ove's trail on foot, for the people walking with him
    this.isNewGame = true;
    this.garage = null;             // Ove's garage door (world/garagedoor.js)
    this.doorOp = null;             // Ove working it (useGarage / stepDoorOp)
  }

  async init() {
    initGfx(document.getElementById('app'));
    this.scene = scene;
    setLoading('Laddar texturer…');
    await gfxReady;
    input.init(renderer.domElement);
    input.onUnlock = () => { if (this.started && !TEST) this.pause(true); };
    // A hidden tab or a window that loses focus pauses the game too (the pointer isn't always locked:
    // a resume by Esc can't re-lock it), and a hidden tab's sound stops altogether (music, engine, a
    // ringing phone) until it is shown again.
    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden) this.pause(true);
    });
    window.addEventListener('blur', () => this.pause(true));
    hud.init();
    hud.onResetSave = () => this.resetSave();
    FX.init(scene);
    // Footprints and ruts in the snow (game/tracks.js, feature snöspår); cleared at every dawn.
    tracks.init(scene);
    this.tracks = tracks;
    window.__tracks = tracks;
    setLoading('Plogar gatorna…');
    await hud.fontsReady;
    await frame();
    // The town: in chunks that give the browser the thread back every ~40 ms when town.js has the
    // async build (the loading text moves; the build is 2.5-3 s), else in one task. Nothing below runs
    // before it is done.
    if (TOWN.buildTownAsync) await TOWN.buildTownAsync(scene, (f) => setLoading(`Plogar gatorna… ${Math.round(f * 100)} %`));
    else TOWN.buildTown(scene);
    finalizeProps(scene);
    // Ove's garage door (world/garagedoor.js; E at it, see useGarage)
    this.garage = TOWN.doors?.find((d) => d.name === 'oveGarage') || null;
    hud.buildBaseMap();
    initCans(scene, litterSpots);
    setLoading('Tankar bilarna…');
    await frame();
    for (const pc of parkedCars) {
      const car = new Car(pc.type, { color: pc.color, name: pc.name, snow: !pc.name && !pc.indoor, trailer: pc.trailer, engineOn: false, plate: FIXED_PLATES[pc.name] });
      car.place(pc.x, pc.z, pc.yaw);
      car.home = pc;
      this.addCar(car);
      if (pc.name) this.named[pc.name] = car;
    }
    this.spawnTraffic(22);
    setLoading('Väcker grannarna…');
    await frame();
    this.peds = spawnPeds(scene, 34);
    for (const key of Object.keys(HOMES)) {
      const c = new Character(CHARS[key]);
      c.key = key;
      scene.add(c.root);
      this.npcs[key] = c;
    }
    // Children are never knocked over by cars here, and neither are the neighbours (Ove is
    // never cruel; Parvaneh is pregnant): they are shoved aside, like Rune.
    for (const c of this.peds.map((p) => p.char)) if (c.def.kind === 'kid' || (c.def.age ?? 30) < 13) c.invulnerable = true;
    for (const c of Object.values(this.npcs)) c.invulnerable = true;
    this.player = new Character(CHARS.ove);
    this.player.key = 'ove';
    this.player.ragdoll = true;
    this.stumbleNext = false; this.stumbles = 0;
    scene.add(this.player.root);
    this.emblems = collectibleSpots.emblems.map(([x, y, z], i) => new Collectible(scene, 'emblem', i, x, y, z, { static: true }));
    this.photos = collectibleSpots.photos.map(([x, y, z], i) => new Collectible(scene, 'photo', i, x, y, z, { static: true }));
    this.bang = new Bang(scene);
    this.beacon = new Beacon(scene);
    this.arrow = new GuideArrow(scene);
    this.patrol = new Patrol(this);
    this.interrupts = new Interruptions(this);
    // The horn and what the town does about it (game/horn.js, feature tuta_med_bilen).
    this.horn = new Horn(this);
    window.__horn = this.horn;
    // Flights off the snow hill in the park and what everybody makes of them (game/hoppbacke.js,
    // feature snöhög; the flying is car.js HOPP).
    this.hopp = new Hoppbacke(this);
    // Rune's wheelchair rolling free, his death on the errand, Anita's grief (game/rune.js).
    this.rune = new RuneFate(this);
    this.interrupts.auto = !TEST || params.has('calls');
    window.__patrol = this.patrol;
    window.__interrupt = this.interrupts;
    this.missions = new MissionRunner(this);
    this.missions.gating = !TEST || params.has('gate');
    // The cold beyond the town, Ove freezing to death out there and waking up at home (game/cold.js).
    this.cold = new Cold(this);
    // The car parks' bays, the p-skiva and the lapplisa (game/pskiva.js, feature p-skiva): in tests the
    // attendant stays at home unless &lapp.
    this.parking = new Parking(this, { wardens: !TEST || params.has('lapp') });
    window.__parking = this.parking;
    // The voices (voice.js): clips for the lines that have one, turns for everybody.
    voice.init();
    voice.inCar = () => !!this.playerCar;
    voice.held = () => hud.dialogActive;
    window.__voice = voice;
    // The title's music: the first key or click there starts the sound (a browser won't before one).
    const wake = () => { if (!this.started) { audio.init(); audio.music('title'); } };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    this.cam = new CamRig(camera);
    // What dialogue shots must see past (camera.js judges shots by what the lens would see).
    this.cam.world = () => ({ cars: this.cars, people: this.allChars() });
    this.load();
    // A new game: the first call comes after a minute and a half (at 45 s it rang before Ove had even
    // met Patrick); a continued one keeps the usual 45 s.
    if (this.isNewGame) this.interrupts.nextT = 90;
    this.storyWorld();
    this.placeNpcs(true);
    this.spawnPlayer();
    this.patrol.seed();
    setLoading('Tar porträtt…');
    await frame();
    // While the portraits are taken: the world's vertex buffers go to the GPU now and its shaders
    // compile in the background (both used to land in the first frame: 1 s), and every car type and
    // variant is compiled and uploaded once (else the first Saab entry hitches).
    const unwarm = this.prewarmItems();
    uploadGeometry();
    const pc = precompile();
    const wc = warmCars(renderer, scene, camera).catch((e) => console.warn('warmCars', e));
    // One portrait per task (~60 ms each): taken in one go they were the longest task of the load
    // (0.7 s) and starved the compiles above. Every helper here restores its render target before
    // it yields, so they interleave safely.
    for (const key of Object.keys(HOMES)) { hud.portraits[key] = renderPortrait(renderer, this.npcs[key].model); await nextTask(); }
    hud.portraits.ove = renderPortrait(renderer, this.player.model);
    this.applySaveToWorld();
    hud.setCoins(this.coins);
    if (this.patrol.reports) hud.setReports(this.patrol.reports);
    hud.setMeter(this.patrol.ordning);
    hud.setClock(this.clockText());
    this.titlePose();
    this.setupTitle();
    await pc;
    unwarm();
    await wc;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    window.__ready = true;
    setLoading(null);
    document.getElementById('play').disabled = false;
    if (TEST) this.start();
  }

  // What errands and missions build the first time they run - a fetch item (the spare key, Jimmy's
  // phone, the elementnyckel, the papers, the flowers), the cat - compiled its shaders in game (a
  // 40 ms frame here, typically 100-300 ms on ANGLE/D3D). One of each now, under the town while the
  // world compiles; the returned function takes them away again.
  prewarmItems() {
    const p = this.player, y = p.y - 30;
    const items = ['key', 'phone', 'wrench', 'papers', 'flowers'].map((k, i) => new Collectible(scene, k, 'warm', p.x + i, y, p.z));
    const cat = buildCat();
    cat.root.position.set(p.x, y, p.z);
    scene.add(cat.root);
    return () => { for (const c of items) c.dispose(); scene.remove(cat.root); };
  }

  // Ove starts on the walkway outside his door, facing along it.
  spawnPlayer() {
    const s = landmarks.oveStart || lm('oveHouse');
    this.player.teleport(s.x, s.z, s.yaw);
    this.cam.yaw = s.yaw;
    this.cam.pitch = 0.16;
    this.cam.snapNext = true;
  }

  // Title screen: Ove beside his Saab, rolled out of its bay in front of his garage, in the low
  // afternoon sun. The camera drifts in slowly from the lot (south-east of them; the sun is low in the
  // south-west, from the left of the picture) with the two of them in the right half of the picture;
  // the title card covers the left. start() puts the Saab back in its bay.
  // o (look-dev: __game.titlePose({...})): out (m out of the bay), turn (rad the car has turned on its
  // way out, negative = to its right), ove [m to the car's left, m ahead of its centre, facing: rad
  // from the car's heading towards it], look (Ove's head, rad to his left), arc (the camera: th0, th1,
  // d0, d1, off as in titleShot).
  titlePose(o = {}) {
    const P = { ...TITLE_POSE, ...o };
    const car = this.named.saab, h = car?.home;
    if (!car || !h) {
      const s = landmarks.oveStart || lm('oveHouse');
      this.player.teleport(s.x - 2.6, s.z + 0.5, s.yaw + Math.PI);
      this.titleShot = null;
      return;
    }
    // Out of the bay, facing out (a man who reverses in leaves like that). (Round 2 tried turning it
    // so the low sun rakes along the flank the camera sees: from the only clear camera side - the
    // lot's other row and the bus shelter block the rest - that needs it broadside with its nose into
    // the title card, ~0.9 rad; worse. `turn` stays for look-dev: the titlepose scenario.)
    const out = h.yaw + Math.PI, ox = Math.sin(out), oz = Math.cos(out);
    const yaw = out + P.turn, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;   // forward, left
    const cx = h.x + ox * P.out, cz = h.z + oz * P.out;
    car.place(cx, cz, yaw);
    car.ctrl.park = true;
    car.sync(0);
    // Ove by the driver's door (the car's left), a little ahead of it, three-quarters to his car,
    // hands in his jacket pockets, looking at it (the people area's pocket pose: model.style.pockets).
    const [side, ahead, face] = P.ove, sg = Math.sign(side) || 1;
    const p = this.player;
    p.teleport(cx + lx * side + fx * ahead, cz + lz * side + fz * ahead, yaw - face * sg);
    if (p.model.style) p.model.style.pockets = true;
    p.anim.look = P.look;
    // The subject point between them, and the camera's slow arc: from th0 off the car's nose (towards
    // its left) at d0, in to th1 at d1 over 40 s.
    // (cam: the camera on the car's left, 1, or its right, -1; camOut: its arc is laid out from the
    // way out of the bay, not from the car's turned heading - the lot has room there)
    const cs = P.cam ?? 1;
    const bx = P.camOut ? ox : fx, bz = P.camOut ? oz : fz, blx = bz * cs, blz = -bx * cs;
    this.titleShot = { x: cx + lx * 0.6 * sg + fx * 0.6, z: cz + lz * 0.6 * sg + fz * 0.6, fx: bx, fz: bz, lx: blx, lz: blz, ...P.arc };
  }

  // The title's buttons: "Spela" for a new game; with a saved one, "Fortsätt" with the day it is at
  // and a small "Nytt spel" (two clicks: it erases the save).
  setupTitle() {
    const play = document.getElementById('play'), nw = document.getElementById('newgame');
    if (!play || this.isNewGame) return;
    const i = this.missions.index, n = MISSIONS.length;
    const pending = i > 0 && i < n && !this.missions.gateOpen;
    const day = clamp(i >= n ? n : pending ? i : i + 1, 1, DAYS.length);
    // (after the whole story: free patrol, not "Dag 7" as if it were still ahead)
    play.innerHTML = i >= n ? 'Fortsätt <small>Fri patrull</small>' : `Fortsätt <small>Dag ${day} · ${DAYS[day - 1]}</small>`;
    play.classList.add('cont');
    if (!nw) return;
    nw.hidden = false;
    nw.addEventListener('click', () => {
      if (!nw.classList.contains('confirm')) {
        nw.classList.add('confirm');
        nw.textContent = 'Säker? Klicka igen';
        clearTimeout(this._nwT);
        this._nwT = setTimeout(() => { nw.classList.remove('confirm'); nw.textContent = 'Nytt spel'; }, 3500);
        return;
      }
      this.resetSave();
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    // The title card fades off the first gameplay frames (0.8 s); ?test has no title: gone at once.
    document.getElementById('title').classList.add('gone', ...(TEST ? ['now'] : []));
    document.body.classList.add('playing');
    input.playing = true;
    audio.init();
    // The Saab back in its bay (the title had it rolled out), Ove out of his title pose.
    const saab = this.named.saab;
    if (saab?.home && !saab.dead && this.titleShot) { saab.place(saab.home.x, saab.home.z, saab.home.yaw); saab.ctrl.park = true; }
    if (this.player.model.style) this.player.model.style.pockets = false;
    this.player.anim.look = 0;
    this.spawnPlayer();
    // Everyone where they spend the day, once more (a neighbour who is elsewhere today - Patrick in
    // hospital on a continued day-2 morning - stays hidden; the title used to bring him back).
    this.placeNpcs(true);
    if (!TEST) { input.wantLock = true; input.lock(); }
    // The start toasts only on a new game (a continued one knows all that already).
    if (!TEST && this.isNewGame) {
      setTimeout(() => hud.toast('Felparkerade bilar i området. Gå fram och håll <b>F</b> för att anteckna.'), 1500);
      // Whoever is offering the day's mission when the toast shows (not when Spela was clicked).
      setTimeout(() => { const giver = this.missions.offered?.giver; if (giver && this.missions.state === 'idle') hud.toast(`<b>${CHARS[giver].name}</b> vill dig något <span class="bang">!</span> Gå fram och tryck <b>E</b>.`, 'offer'); }, 7000);
    }
  }

  // The pause menu. Pausing lets go of the mouse (so Fortsätt can be clicked); Esc, P or the
  // gamepad's Start resume (see loop), as does the button. A resume by key re-locks the pointer
  // if the browser allows it (Esc never counts as a gesture: then the next click in the game does).
  pause(on) {
    if (TEST || !this.started || this.paused === on) return;
    this.paused = on;
    voice.pause(on);
    this.pausedAt = performance.now();
    document.getElementById('pause').classList.toggle('show', on);
    if (on) { hud.renderLog(this.patrol.log); hud.renderAlbum(this.albumData()); }
    audio.engine(false, 0, 0);
    audio.skid(0);
    audio.horn(false);
    audio.pen(false);
    // The phone doesn't ring on behind the menu; it rings again after it while nobody has answered
    // (the call itself waits), and a report being written scratches on.
    if (on) audio.ring(false);
    else {
      if (this.interrupts.ringing) audio.ring(true);
      if (this.patrol.writing) audio.pen(true);
    }
    if (on) { input.wantLock = true; input.unlock(); }
    else { input.wantLock = true; input.lock(); this.last = performance.now(); }
  }

  clockText() {
    const m = Math.floor(this.clockMin) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  setClock(h, m = 0) { this.clockMin = h * 60 + m; hud.setClock(this.clockText()); }
  // The latest time the clock runs to now (see DAY_END_MIN), Infinity while day 7 runs on to dusk.
  clockCap() {
    const ms = this.missions, n = MISSIONS.length;
    if (ms.index >= n) return AFTER_STORY_MIN;
    if (ms.index === n - 1 && ms.state !== 'idle') return Infinity;
    return DAY_END_MIN;
  }
  tickClock(dt) {
    const cap = this.clockCap();
    if (this.clockMin < cap) this.clockMin = Math.min(cap, this.clockMin + dt * CLOCK_RATE);
    // (past midnight: it wraps; it was saved as 1440+ and a reload took it back to 10:30)
    if (this.clockMin >= 24 * 60) this.clockMin -= 24 * 60;
  }

  // ------------------------------------------------------------------------------------------
  // World population

  addCar(car) { this.cars.push(car); this.carsVer++; scene.add(car.root); car.sync(0); return car; }
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) { this.cars.splice(i, 1); this.carsVer++; }
    if (car === this.playerCar) this.exitCar(true);
    for (const p of [car.driver, ...car.passengers]) if (p && p.car === car) this.unseat(p);
    scene.remove(car.root);
    // A seated driver bust is a geometry of its own (its materials are the shared surfaces).
    this.dropBust(car);
    // The car's own GPU things (plate, lamps, its trailer's): freed. Never re-add a removed car.
    car.dispose();
  }
  // Take a seated driver bust out of a car for good (its geometry is its own; the materials are
  // the shared surfaces).
  dropBust(car) {
    const b = car.driverBust;
    if (!b) return;
    b.parent?.remove(b);
    b.traverse((o) => o.geometry?.dispose());
    car.driverBust = null;
  }

  // A cheap seated driver (busts: 2 draw calls) on the car's driver seat.
  addBust(def, car) {
    const obj = buildBust(def);
    car.seatLocal(1, obj.position);
    car.tilt.add(obj);
    // It never moves in the car's frame: fixed matrices, like the car's own meshes (cars.md, round 4).
    obj.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    car.driverBust = obj;
    return obj;
  }

  spawnTraffic(n) { for (let k = 0; k < n; k++) this.spawnTrafficCar(Math.random, null); }
  spawnTrafficCar(r = Math.random, awayFrom = null) {
    for (let tries = 0; tries < 30; tries++) {
      const a = (r() * (N + 1) * (N + 1)) | 0;
      const nb = neighbors(a);
      const b = nb[(r() * nb.length) | 0];
      const dx = nodeX(b) - nodeX(a), dz = nodeZ(b) - nodeZ(a), l = Math.hypot(dx, dz);
      const t = 14 + r() * (l - 28);
      const x = nodeX(a) + (dx / l) * t + (-dz / l) * LANE, z = nodeZ(a) + (dz / l) * t + (dx / l) * LANE;
      if (awayFrom && dist(x, z, awayFrom.x, awayFrom.z) < 120) continue;
      if (this.cars.some((c) => dist(c.x, c.z, x, z) < 14)) continue;
      const type = pick(TRAFFIC, r);
      if ((type === 'bus' || type === 'garbage') && this.cars.some((c) => c.kind === type && c.traffic)) continue;
      const car = new Car(type);
      car.place(x, z, yawTo(dx, dz));
      car.traffic = true;
      this.addBust(randomPed(r), car);
      car.ai = new AIDriver(car, { mode: 'traffic', cruise: type === 'bus' ? 9 : type === 'garbage' ? 8 : 10 + r() * 4 });
      return this.addCar(car);
    }
    return null;
  }

  ensureNamedCar(name) {
    let car = this.named[name];
    if (car && !car.dead && this.cars.includes(car)) return car;
    const pc = parkedCars.find((p) => p.name === name);
    if (!pc) return null;
    if (car) this.removeCar(car);
    car = new Car(pc.type, { color: pc.color, name: pc.name, trailer: pc.trailer, engineOn: false, plate: FIXED_PLATES[pc.name] });
    car.place(pc.x, pc.z, pc.yaw);
    car.home = pc;
    this.addCar(car);
    this.named[name] = car;
    return car;
  }

  spawnMissionCar(m, type, x, z, yaw, opts = {}) {
    const car = new Car(type, opts);
    car.place(x, z, yaw);
    this.addCar(car);
    m.cars.push(car);
    return car;
  }

  // ------------------------------------------------------------------------------------------
  // Seats

  seat(ch, car, side) {
    if (ch.car) this.unseat(ch);
    ch.state = 'seated';
    ch.car = car;
    ch.vx = ch.vz = ch.vy = 0;
    car.tilt.add(ch.root);
    car.seatLocal(side, _v);
    ch.root.position.set(_v.x, _v.y + 0.12 - ch.model.legLen, _v.z + 0.12);
    ch.root.rotation.set(0, 0, 0);
    if (side === 1) {
      car.driver = ch;
      this.dropBust(car);
    } else car.passengers.push(ch);
    ch.seatSide = side;
  }

  unseat(ch, x, z) {
    const car = ch.car;
    if (car) {
      if (car.driver === ch) car.driver = null;
      car.passengers = car.passengers.filter((p) => p !== ch);
      if (x === undefined) { const e = this.exitSpot(car, ch.seatSide || 1); x = e.x; z = e.z; }
    }
    ch.car = null;
    ch.root.scale.setScalar(1);
    scene.add(ch.root);
    ch.state = 'normal';
    if (x !== undefined) ch.teleport(x, z, car ? car.yaw : ch.yaw);
  }

  // The first free passenger seat: front passenger, then the back seat (the snow tractor has only
  // the driver's: model.seats).
  freeSeat(car) {
    if (car.model.seats === 1) return null;
    const used = new Set(car.passengers.map((p) => p.seatSide));
    for (const s of car.model.rear ? [-1, -2, 2] : [-1]) if (!used.has(s)) return s;
    return null;
  }

  // A clear spot beside a car to step out onto (side 1 = the driver's side, -1 = passenger's).
  exitSpot(car, side = 1) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const lx = fz, lz = -fx; // the car's left (+x local, the driver's side)
    const s = Math.sign(side) || 1;
    const w = car.spec.wid / 2 + 0.75, l = car.spec.len / 2 + 0.9;
    const rear = Math.abs(side) >= 2 ? -0.6 : 0.1;
    const tries = [[s * w, rear], [s * w, 0.9], [s * w, -1.1], [-s * w, 0], [0, -l], [0, l], [s * w, l * 0.7], [-s * w, -l * 0.7]];
    for (const [a, b] of tries) {
      const x = car.x + lx * a + fx * b, z = car.z + lz * a + fz * b;
      if (this.spotFree(x, z, car.y)) return { x, z };
    }
    return { x: car.x + lx * s * w, z: car.z + lz * s * w };
  }
  spotFree(x, z, y = 0.15) {
    const list = queryBlocks(x - 0.5, z - 0.5, x + 0.5, z + 0.5, []);
    for (const b of list) if (b.top > y + 0.5 && contains(b, x, z)) return false;
    for (const c of this.cars) if (Math.abs(c.x - x) < 8 && Math.abs(c.z - z) < 8 && circleVsObb(x, z, 0.4, c.obb, {})) return false;
    return true;
  }
  freeSpot(cx, cz, rMin, rMax) {
    if (rMin <= 0 && this.spotFree(cx, cz) && groundAt(cx, cz, 1, 0.5) < 0.5) return { x: cx, z: cz };
    for (let k = 0; k < 80; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin) * (1 + k / 40);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > BOUND - 5 || Math.abs(z) > BOUND - 5) continue;
      if (this.spotFree(x, z, 0.15) && groundAt(x, z, 1, 0.5) < 0.5) return { x, z };
    }
    return { x: cx, z: cz };
  }
  groundAt(x, z) { return groundAt(x, z, 0.2, 0.6); }

  // Test/debug helper: move whatever the player is controlling.
  debugWarp(x, z, yaw = 0) {
    if (this.playerCar) this.playerCar.place(x, z, yaw);
    else this.player.teleport(x, z, yaw);
    this.cam.yaw = yaw;
    this.cam.snapNext = true;
  }

  enterCar(car) {
    if (car.dead) return;
    if (car.locked) { hud.toast('Den där är inte din, Ove.'); return; }
    if (this.pushedNpc()) { hud.toast('Inte med Rune i rullstolen.'); return; }
    if (car.driverBust) {
      // "Lånar" a car with someone in it: they are not pleased.
      this.dropBust(car);
      const ped = this.peds.reduce((best, p) => (!best || dist(p.char.x, p.char.z, this.player.x, this.player.z) > dist(best.char.x, best.char.z, this.player.x, this.player.z) ? p : best), null);
      if (ped && ped.char.state !== 'seated') {
        // out of the door on the side that faces the nearest sidewalk (the far one if need be: the
        // car mustn't stand between them and where they walk on to)
        const w = nearestSidewalk(car.x, car.z);
        const e = this.exitSpot(car, !w || (w.x - car.x) * Math.cos(car.yaw) - (w.z - car.z) * Math.sin(car.yaw) >= 0 ? 1 : -1);
        ped.char.teleport(e.x, e.z);
        ped.char.state = 'normal';
        ped.idleT = 3;
        // ...and walks on from the nearest sidewalk, not towards its old loop across town
        ped.rehome?.();
        this.say(ped.char, pick(CARJACK), 2.2);
      }
      this.patrol.addOrdning(-8);
    }
    car.ai = null;
    // A borrowed traffic car stays where Ove leaves it, until nobody can see it (recycleTraffic).
    if (car.traffic) car.wasTraffic = true;
    car.traffic = false;
    car.engineOn = null;
    this.seat(this.player, car, 1);
    this.playerCar = car;
    car.ctrl.park = false;
    audio.door();
    // The first time behind a wheel (each session): the horn, and that it is more than a sound.
    if (!TEST && !this.toldHorn) { this.toldHorn = true; setTimeout(() => { if (this.playerCar && !this.inDialog) hud.toast('<b>T</b> tutar. Folk märker det.'); }, 2600); }
    // The association's snow tractor (feature snotraktor): the first time this session, whose it is.
    if (car.kind === 'tractor' && !this.toldTractor) { this.toldTractor = true; hud.toast('Föreningens snöröjningstraktor. Ove har nyckel, förstås. Den får köra på gångvägarna.'); }
    // Whoever is with Ove gets in too.
    for (const [ch] of this.companions) if (!ch.car && dist(ch.x, ch.z, car.x, car.z) < 10) this.boardCompanion(ch, car);
  }

  // (quiet: no door, for an exit nobody sees: the cold's tidying up behind the black)
  exitCar(force = false, quiet = false) {
    const car = this.playerCar;
    if (!car) return;
    const fast = car.speed > STUMBLE.exit && !force;
    const spot = this.exitSpot(car, 1);
    this.unseat(this.player, spot.x, spot.z);
    this.player.yaw = car.yaw;
    this.playerCar = null;
    car.leftAt = this.time;
    car.ctrl.park = true;
    car.ctrl.throttle = 0;
    if (!quiet) audio.door();
    audio.engine(false, 0, 0);
    audio.skid(0);
    audio.horn(false);
    if (fast) this.jumpOut(car);
    // Passengers who are with Ove get out and walk with him.
    for (const [ch] of this.companions) if (ch.car === car) { const e = this.exitSpot(car, ch.seatSide || -1); this.unseat(ch, e.x, e.z); }
  }

  // Out of the driver's door of a moving car (feature snubbla_vid_hopp): a body standing beside the
  // door, turned a little out of it, at the car's height (a car in the air), with the car's speed, a
  // push out of the door and a hop; the road does the rest (actors/ragdoll.js).
  jumpOut(car) {
    const p = this.player, lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw), sp = car.speed;
    // (pitching forward, the head going on faster than the feet, and rolling to one side or the other,
    // more the faster the car)
    const dx = car.vx / (sp || 1), dz = car.vz / (sp || 1), w = 1.5 + sp * 0.12, rl = (Math.random() < 0.5 ? -1 : 1) * (1 + sp * 0.08);
    p.tumble({
      pose: { x: p.x, y: Math.max(p.y, car.y) + 0.12, z: p.z, yaw: car.yaw + 0.6 },
      v: [car.vx * 0.9 + lx * 1.8, 2, car.vz * 0.9 + lz * 1.8], spin: [dz * w + dx * rl, 0, -dx * w + dz * rl], tone: 0.35,
      lie: 1.1 + Math.random() * 0.6, why: 'car',
    });
    audio.grunt(p.def.voice);
  }

  // He trips as he lands a jump (onJumpLand): on the move a foot caught and he pitches forward along
  // his way; standing, over backwards off his heels or to a side; now and then (more often standing)
  // his feet go from under him and he lands on his back. Not on a car's roof, with the cat in his
  // arms, in a dialogue, at the garage door, while he freezes, at a failed day's screen.
  stumble(p) {
    if (p.standingOn || this.carrying || this.inDialog || this.doorOp || this.cold.busy || this.failWait || this.pushedNpc()) return false;
    const sp = Math.hypot(p.vx, p.vz), r = Math.random, way = sp > 1.2 ? Math.atan2(p.vx, p.vz) : p.yaw;
    let a, k, feet = 0, pivot = 0, tone = 0.5;
    if (r() < (sp > 1.2 ? 0.2 : 0.4)) { a = way + Math.PI + (r() - 0.5) * 0.5; k = 3; feet = 1; pivot = 0.45; }
    else if (sp > 1.2) { a = way + (r() - 0.5) * 0.6; k = 0.9 + 0.12 * sp; feet = 0.1; tone = 0.35; }
    // (standing his legs give way under him: the feet a little the other way, not a plank going over)
    else { a = p.yaw + (r() < 0.5 ? Math.PI : (r() < 0.5 ? 1 : -1) * Math.PI / 2) + (r() - 0.5) * 0.5; k = 1.6; pivot = 0.25; tone = 0.25; }
    if (!p.tumble({ v: [p.vx, Math.min(0, p.vy), p.vz], trip: [Math.sin(a), Math.cos(a), k, pivot], feet, tone, brace: true, lie: 0.4 + r() * 0.4, why: 'stumble' })) return false;
    this.stumbleNext = false;
    this.stumbles++;
    audio.oof(p.def.voice);
    FX.dust(p.x, p.z, 2, p.y + 0.08);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // People walking with Ove (errands, missions): stages.js uses these.

  addCompanion(ch, opts = {}) {
    ch.busy = true;
    ch.walkTo = null; ch.walkPath = null;
    this.companions.set(ch, { push: !!opts.push, left: false });
  }
  removeCompanion(ch, opts = {}) {
    const had = this.companions.delete(ch);
    if (ch.car && (had || opts.walkTo)) { const e = this.exitSpot(ch.car, ch.seatSide || -1); this.unseat(ch, e.x, e.z); }
    if (opts.walkTo) this.walkNpc(ch, Array.isArray(opts.walkTo) ? opts.walkTo : [opts.walkTo]);
  }
  // Someone walking with Ove is still with him while they drop a little behind (round a fence or a
  // hedge): only 2 s beyond 20 m loses them (it used to flip at 14 m, and the errand's objective
  // flipped with it, 35 times in 70 s). Beyond 35 m they give up following (comp.left).
  isWithOve(ch) {
    if (!ch || !this.companions.has(ch)) return false;
    if (this.playerCar) return ch.car === this.playerCar;
    if (ch.car) return false;
    const o = this.companions.get(ch), d = dist(ch.x, ch.z, this.player.x, this.player.z);
    if (o.push) return d < 14;
    return !o.left && d < 35 && (d <= 20 || (o.farT || 0) < 2);
  }
  boardCompanion(ch, car) {
    const side = this.freeSeat(car);
    if (side == null) return false;
    if (!this.companions.has(ch)) this.addCompanion(ch);
    this.seat(ch, car, side);
    audio.door();
    return true;
  }
  // A mission/errand is over: let go of someone it borrowed (they go home in their own time).
  releaseNpc(ch) {
    this.companions.delete(ch);
    if (ch.car && (ch.car === this.playerCar || !this.cars.includes(ch.car))) { const e = this.exitSpot(ch.car, ch.seatSide || -1); this.unseat(ch, e.x, e.z); }
    ch.busy = false;
    ch.walkTo = null; ch.walkPath = null;
  }
  // Send someone walking along a list of points ({x, z}); opts: { speed (m/s, default 1.4), stay
  // (stay busy where the walk ends, facing opts.yaw: a mission NPC waiting for Ove) }.
  walkNpc(ch, pts, opts = {}) {
    if (!pts.length) return;
    if (ch.car) this.unseat(ch);
    ch.busy = true;
    ch.walkTo = { x: pts[0].x, z: pts[0].z };
    ch.walkPath = pts.slice(1).map((p) => ({ x: p.x, z: p.z }));
    ch.walkSpeed = opts.speed || null;
    ch.walkStay = !!opts.stay;
    ch.walkYaw = opts.yaw;
    ch.walkChk = null;
  }
  // Out of the story for now (a passenger after a failed drive took a taxi home): back at their
  // usual spot at once, free again.
  sendHome(ch) {
    if (!ch || ch === this.player) return;
    this.companions.delete(ch);
    if (ch.car) this.unseat(ch);
    ch.busy = false; ch.walkTo = null; ch.walkPath = null; ch.walkStay = false;
    const k = ch.key, h = HOMES[k];
    if (!h) return;
    const p = lm(h[0]), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let x = p.x - fz * h[1] + fx * h[2], z = p.z + fx * h[1] + fz * h[2];
    if (!this.spotFree(x, z)) { const s = this.freeSpot(x, z, 0.4, 2.5); x = s.x; z = s.z; }
    ch.teleport(x, z, p.yaw);
    ch.state = 'normal'; ch.root.visible = true;
    ch.homeX = x; ch.homeZ = z; ch.homeYaw = p.yaw; ch.spot = null;
  }
  pushedNpc() { for (const [ch, o] of this.companions) if (o.push && !ch.car) return ch; return null; }
  setCarrying(obj) {
    const old = this.carrying;
    if (old && old !== obj && old.root) {
      old.root.visible = true;
      if (old._held && typeof old.hold === 'function') old.hold(false);
      old._held = false;
    }
    this.carrying = obj;
  }
  // Hold a pose for this frame (stages call it every frame while it applies): 'push', 'write', or
  // 'work' with a kind ('bend' | 'low' | 'shovel' | 'wall', the people area's work poses).
  posePlayer(pose, kind = null) { this.pose = pose; this.poseKind = kind; this.poseT = 0.15; }

  // ------------------------------------------------------------------------------------------
  // Queries used by AI and physics

  focus() {
    if (this.playerCar) { const c = this.playerCar; return { x: c.x, y: c.y, z: c.z, yaw: c.yaw, car: c, speed: c.speed }; }
    const p = this.player;
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, car: null, speed: p.speed, height: p.height };
  }
  focusTarget() {
    const o = this.playerCar || this.player;
    return { x: o.x, z: o.z, vx: o.vx, vz: o.vz };
  }

  // The nearest thing in a car's lane ahead within `range`: { dist, isPlayer } or null (the result
  // object is reused: read it at once, as drivers.js does).
  obstacleAhead(car, range) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const halfW = car.spec.wid / 2 + 0.6, half = car.spec.len / 2, cx = car.x, cz = car.z;
    let bestD = Infinity, bestP = false;
    const test = (x, z, r, isPlayer) => {
      const dx = x - cx, dz = z - cz;
      const along = dx * fx + dz * fz - half - r;
      if (along < -1.5 || along > range) return;
      if (Math.abs(dx * -fz + dz * fx) > halfW + r) return;
      const d = Math.max(0, along);
      if (d < bestD) { bestD = d; bestP = isPlayer; }
    };
    const R = range + 8;
    const a = this.byX();
    for (let i = this.firstX(cx - R - 2 * this._rmax - 1); i < a.length; i++) {
      const o = a[i];
      if (o.x - o.radius > cx + R + 1) break;
      if (o === car || Math.abs(o.x - cx) > R || Math.abs(o.z - cz) > R) continue;
      const ov = o.vx * fx + o.vz * fz;
      if (ov > car.forwardSpeed + 1.5) continue;
      if (o.traffic && Math.cos(o.yaw - car.yaw) < -0.7) continue;
      test(o.x, o.z, Math.min(o.spec.wid, o.spec.len) / 2, o === this.playerCar);
      if (o.trailer) test(o.trailer.x, o.trailer.z, o.trailer.wid / 2, o === this.playerCar);
    }
    // People: standing, flying or lying on the road. A body on the road stops traffic (it used to
    // see only people on their feet and ploughed the rest along for hundreds of metres).
    const p0 = this.player;
    if (!this.playerCar && isPerson(p0)) test(p0.x, p0.z, 0.5, true);
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      const c = peds[i].char;
      if (Math.abs(c.x - cx) > R || Math.abs(c.z - cz) > R || !isPerson(c)) continue;
      test(c.x, c.z, 0.4, false);
    }
    for (const k in this.npcs) {
      const c = this.npcs[k];
      if (c.car || Math.abs(c.x - cx) > R || Math.abs(c.z - cz) > R || !isPerson(c)) continue;
      test(c.x, c.z, c.r + 0.1, false);
    }
    if (bestD === Infinity) return null;
    _obst.dist = bestD; _obst.isPlayer = bestP;
    return _obst;
  }

  carThreat(x, z) {
    const a = this.byX();
    for (let i = this.firstX(x - 31 - 2 * this._rmax); i < a.length; i++) {
      const c = a[i];
      if (c.x - c.radius > x + 31) break;
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      const sp = c.speed;
      if (sp < 7) continue;
      const vx = c.vx / sp, vz = c.vz / sp;
      const along = dx * vx + dz * vz, lat = dx * -vz + dz * vx;
      if (along > 0 && along < sp * 0.8 + 3 && Math.abs(lat) < 2.4) {
        const s = lat >= 0 ? 1 : -1;
        return { dx: -vz * s, dz: vx * s };
      }
    }
    return null;
  }

  carRoofAt(x, z, ytop) {
    let best = null;
    const a = this.byX();
    for (let i = this.firstX(x - 2 * this._rmax - 1); i < a.length; i++) {
      const c = a[i];
      if (c.x - c.radius > x + 1) break;
      if (Math.abs(c.x - x) > c.radius || Math.abs(c.z - z) > c.radius) continue;
      const dx = x - c.x, dz = z - c.z;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      if (Math.abs(dx * fx + dz * fz) > c.spec.len / 2 || Math.abs(dx * -fz + dz * fx) > c.spec.wid / 2) continue;
      const top = c.y + c.height;
      if (top <= ytop && (!best || top > best.top)) best = { top, car: c };
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------
  // The cars sorted by their west edge (x - radius): the broadphase for car-car contacts and for every
  // "cars near (x, z)" query in the fixed step (cars vs people, roofs, AI obstacles, panicking
  // pedestrians), which all used to loop over every one of the ~160 cars. Re-sorted once per step by
  // insertion (the order barely changes); rebuilt when cars come or go.
  byX() {
    const a = this._byX;
    if (this._byXVer !== this.carsVer) {
      a.length = 0;
      for (const c of this.cars) a.push(c);
      this._byXVer = this.carsVer;
      this.sortByX();
    }
    return a;
  }
  sortByX() {
    const a = this._byX;
    let rmax = 0;
    for (let i = 0; i < a.length; i++) {
      const c = a[i], k = c.x - c.radius;
      if (c.radius > rmax) rmax = c.radius;
      let j = i - 1;
      while (j >= 0 && a[j].x - a[j].radius > k) { a[j + 1] = a[j]; j--; }
      a[j + 1] = c;
    }
    this._rmax = rmax || 7;   // the widest car's half diagonal (the bus)
  }
  // Index of the first car whose west edge is at or east of x.
  firstX(x) {
    const a = this._byX;
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].x - a[m].radius < x) lo = m + 1; else hi = m; }
    return lo;
  }
  // Car-car contacts: swept along x; a pair where both cars sleep is never tested (two parked cars
  // can't start touching by themselves: a moving one wakes the other on contact).
  collideAll() {
    const a = this.byX();
    this.sortByX();
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const c = a[i], xmax = c.x + c.radius, cs = c.asleep;
      for (let j = i + 1; j < n; j++) {
        const o = a[j];
        if (o.x - o.radius > xmax) break;
        if (cs && o.asleep) continue;
        if (Math.abs(c.z - o.z) > c.radius + o.radius) continue;
        collideCars(c, o, this);
      }
    }
  }

  allChars(out = []) {
    out.length = 0;
    if (!this.playerCar) out.push(this.player);
    for (const p of this.peds) out.push(p.char);
    for (const k in this.npcs) out.push(this.npcs[k]);
    return out;
  }

  npc(key) { return key === 'ove' ? this.player : this.npcs[key]; }
  charDef(key) { return CHARS[key]; }

  // ------------------------------------------------------------------------------------------
  // Events

  breakProp(p, vx, vz, car) { this._breaker = car || null; breakProp(p, vx, vz, this); this._breaker = null; }
  onPropBroken(p) {
    audio.smash();
    if (p.type === 'pump') FX.explosion(p.x, 0.5, p.z);
    // Ove broke it: Ove pays for it.
    const byOve = this._breaker === 'kick' || (this._breaker && this._breaker === this.playerCar);
    if (!byOve) return;
    this.patrol.addOrdning(-(2 + Math.min(2, p.def.shame || 0)));
    // (25-205 kr: five times what it was, features/implemented/burkar_och_straff.md)
    const kr = Math.min(this.coins, 25 + Math.round((p.def.coins || 2) * 15));
    if (kr > 0) { this.addCoins(-kr); this.penaltyKr += kr; this.penaltyT = 1.2; }
  }

  onCarImpact(a, b, impact, cx, cz, blk = null) {
    if (blk?.kind === 'garageDoor') this.garageHit(a, impact);
    const pc = this.playerCar;
    const involved = a === pc || b === pc;
    const f = this.focus();
    const near = dist(cx, cz, f.x, f.z) < 60;
    if (near) audio.crash(Math.min(1, impact / 18) * (involved ? 1 : 0.5));
    if (impact > 6 && near) FX.sparks(cx, 0.8, cz, Math.min(14, impact | 0));
    if (involved) this.cam.shake = Math.min(1, this.cam.shake + impact * 0.04);
    this.patrol.onImpact(a, b, impact);
    this.missions.onImpact(a, b, impact);
  }
  onCarLanded(car, impact) {
    if (car.flight) return;   // (off the snow hill: onCarFlight has it)
    if (car === this.playerCar) { audio.thud(); this.cam.shake = Math.min(1, this.cam.shake + impact * 0.03); }
    FX.dust(car.x, car.z, 6);
  }
  onCarTakeoff(car) { this.hopp.takeoff(car); }
  onCarFlight(car, f) { this.hopp.land(car, f); }
  onTrailerBounce(tr, impact) { this.hopp.trailerBounce(tr, impact); }
  onCarDestroyed(car) {
    const f = this.focus();
    if (dist(car.x, car.z, f.x, f.z) < 80) audio.crash(1);
    if (car === this.playerCar) {
      const c = car;
      for (const p of car.passengers.slice()) { this.unseat(p); p.fling((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6); }
      this.exitCar(true);
      this.player.fling(-Math.sin(c.yaw) * 3 + (Math.random() - 0.5) * 4, 6, -Math.cos(c.yaw) * 3);
      hud.showBanner('KVADDAD', 'Bilen är förstörd', 'bad', 1800);
    } else {
      for (const p of [car.driver, ...car.passengers]) if (p) { this.unseat(p); p.fling((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6); }
      this.dropBust(car);
      // Somebody's car, wrecked by Ove: that costs.
      if (this.playerCar && !car.violation?.fleeing && !car.isTarget && !car.isChaser && dist(car.x, car.z, this.playerCar.x, this.playerCar.z) < 12) {
        this.patrol.addOrdning(-8);
        const kr = Math.min(this.coins, 500);
        if (kr) { this.addCoins(-kr); hud.toast(`Ove betalar självrisken: ${kr} kr`, 'bad'); }
      }
      car.ai = null;
    }
    car.deadT = 0;
  }
  onCharHit(ch, car) {
    audio.ouch();
    audio.thud();
    if (ch === this.player) { hud.flashColor('rgba(200,70,60,0.3)'); return; }
    if (car === this.playerCar) this.patrol.addOrdning(-12);
    if (Math.random() < 0.85) this.say(ch, pick(OUCH), 1.8);
  }
  // (why: what put a ragdoll down, Ragdoll's `why`: Ove up after a fall of his own says it was nothing)
  onGetUp(ch, why) {
    if (ch === this.player && OVE_STUMBLE[why] && !this.inDialog && Math.random() < 0.8) { this.say(ch, pick(OVE_STUMBLE[why]), 1.8); this.murmur(CHARS.ove.voice); }
    if (ch !== this.player && Math.random() < 0.4 && dist(ch.x, ch.z, this.player.x, this.player.z) < 30) this.say(ch, pick(GETUP), 2);
  }
  onBodyBounce(ch) { if (dist(ch.x, ch.z, this.focus().x, this.focus().z) < 40) audio.thud(); }
  onBounce() {}
  onLand(ch) { if (ch === this.player) FX.dust(ch.x, ch.z, 3, ch.y + 0.1); }
  // Ove's jump: he grunts as he pushes off (one of his four, in turn), his coat and boots as he leaves
  // the ground, an 'uff' as he lands (not every time) and a little snow kicked up.
  onJumpPush(ch) { if (ch === this.player) audio.grunt(ch.def.voice); }
  onJump(ch) { if (ch === this.player) audio.jump(); }
  onJumpLand(ch, v) {
    if (ch !== this.player) return;
    audio.step(this.surfaceAt(ch.x, ch.z)); audio.thud(0.6);
    if ((this.stumbleNext || Math.random() < STUMBLE.chance) && this.stumble(ch)) return;
    if (Math.random() < 0.7) audio.oof(ch.def.voice);
    FX.dust(ch.x, ch.z, 2, ch.y + 0.08);
  }
  onHonk(car) {
    const f = this.focus();
    const d = dist(car.x, car.z, f.x, f.z);
    if (d < 45) audio.honk(clamp(1.2 - d / 45, 0.2, 1), 0.3, car.kind);
  }

  collectCan() {
    this.cans++;
    this.coins += 1;
    hud.setCoins(this.coins);
    hud.bumpCoins();
    audio.coin();
    // Every second can (of all he has ever picked up) tidies the area: +1 Ordning.
    if (this.cans % 2 === 0) this.patrol.addOrdning(1);
  }
  addCoins(n) { this.coins = Math.max(0, this.coins + n); hud.setCoins(this.coins); if (n > 0) hud.bumpCoins(); }

  // A speech bubble, and the line said (voice.js: from where they stand; it waits its turn, up to
  // o.wait s, and the bubble stays up until it has been said). Returns the voice's handle, or null
  // with the voices off (the caller murmurs, as before). o.voice false: the bubble only (the line is
  // said elsewhere: a phone call's answer); o.who: the voice, if not the target's own.
  say(target, text, secs = 2, o = {}) {
    const it = hud.say(target, text, secs);
    if (o.voice === false) return null;
    const ch = target.root ? target : null;
    const u = voice.play(o.who || voice.voiceFor(target), text, {
      slot: 'bubble', mode: o.shout ? 'shout' : 'world', at: target, ch, wait: o.wait, tag: o.tag,
      start: (u) => { it.until = Math.max(it.until, performance.now() + (u.dur + 0.4) * 1000); },
    });
    it.u = u;
    return u;
  }
  // A murmur for a line said without the voices (with them, say() has it covered).
  murmur(pitch = 300) { if (!voice.enabled) audio.talk(pitch); }
  // A line over the radio / the phone, with the speaker's portrait. With the voices on it waits its
  // turn (o.wait s, 6; o.must: for ever) and its toast goes up when it is said, for as long as it
  // takes. Where it comes from: a passenger in Ove's car beside him, a neighbour close by from where
  // they stand, Ove himself dry, anyone else down the phone line.
  radio(who, text, o = {}) {
    const k = who, name = CHARS[k]?.name || who;
    const n = this.npc(k), f = this.focus();
    const passenger = n && n.car && n.car === this.playerCar;
    const near = n && !n.car && n.state === 'normal' && dist(n.x, n.z, f.x, f.z) < 30;
    const mode = k === 'ove' ? 'dialog' : passenger ? 'car' : near ? 'world' : 'phone';
    const u = voice.play(k, text, {
      slot: 'main', mode, at: near ? n : null, ch: n || (k === 'ove' ? this.player : null), wait: o.wait ?? 6, must: o.must, tag: o.tag,
      start: (u) => { hud.radio(k, name, text, o.cls || 'radio', Math.max(3500, (u.dur + 0.9) * 1000)); u.rec.toastEnd = voice.now() + Math.max(3.5, u.dur + 0.9); },
    });
    if (u) return u;
    hud.radio(k, name, text, o.cls || 'radio');
    const w = Math.min(8, Math.round(text.split(/\s+/).length * 0.7));
    for (let i = 0; i < w; i++) setTimeout(() => audio.talk(CHARS[k]?.voice || 300), i * 230);
    return null;
  }
  // Someone calls out to Ove: a speech bubble if they are close, else a toast. Said aloud once:
  // from where they stand when close, else a shout from their direction.
  shout(who, text) {
    const n = this.npc(who);
    const close = n && !n.car && dist(n.x, n.z, this.focus().x, this.focus().z) < 45;
    if (close) this.say(n, text, 3.2, { voice: false });
    const u = voice.play(who, text, {
      slot: 'bubble', mode: n && !n.car ? 'shout' : 'phone', at: n && !n.car ? n : null, ch: n, wait: 4, near: 22,
      start: (u) => { hud.radio(who, `${CHARS[who]?.name || who} ropar`, text, 'radio', Math.max(3500, (u.dur + 0.9) * 1000)); },
    });
    if (!u) hud.radio(who, `${CHARS[who]?.name || who} ropar`, text);
  }

  setTalker(who) { this.talker = who || null; }

  async dialog(lines) {
    this.inDialog = true;
    hud.clearBubbles?.();
    await hud.runDialog(lines.map(([who, text, on]) => ({ who, text, on: typeof on === 'function' ? on : null })), this);
    this.inDialog = false;
  }
  cinematic(a, b, opts) { this.cam.frame(a, b, opts); hud.letterbox(true); hud.clearBubbles?.(); this.inDialog = true; }
  endCinematic() { this.cam.release(); hud.letterbox(false); this.inDialog = false; this.cam.snapNext = false; }
  onFrame(fn) { this.hooks.push(fn); }
  offFrame(fn) { this.hooks = this.hooks.filter((h) => h !== fn); }
  wait(secs) {
    return new Promise((resolve) => {
      let t = 0;
      const fn = (dt) => { t += dt; if (t >= secs) { this.offFrame(fn); resolve(); } };
      this.onFrame(fn);
    });
  }

  unlock(what) { this.unlocked.add(what); }

  // ------------------------------------------------------------------------------------------
  // The story leaves marks on the world (called at load and after every day).

  storyWorld() {
    const i = this.missions.index;
    // Day 2: Patrick fell off the ladder. From then on his arm is in plaster.
    this.setNpcDef('patrick', i >= 2 ? CHARS.patrickCast : CHARS.patrick);
    // Day 4: the stray cat lives at Ove's now. Tills vidare. It sits by his door.
    if (i >= 4 && !this.homeCat) {
      // On the doorstep, beside Ove's door (the house landmark stands 1.3 m out from the door,
      // facing out: the step is about a metre behind it).
      const d = lm('oveHouse'), fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      const x = d.x - fx * 1.0 - fz * 0.4, z = d.z - fz * 1.0 + fx * 0.4;
      const cat = buildCat();
      cat.root.position.set(x, groundAt(x, z, 1.0, 0.6), z);
      cat.root.rotation.y = d.yaw + 0.5;
      cat.sit(true);
      cat.animate(0, 0);
      scene.add(cat.root);
      this.homeCat = cat;
    }
    // After day 7: Sonja's flowers lie on her grave (the finale lays them itself; after a reload they
    // were gone).
    if (i >= MISSIONS.length && !this.graveFlowers) flowersOnGrave(this);
    // Day 5: Adrian bought a Saab. It stands in the residents' lot, where a parked car stood.
    if (i >= 5 && !this.named.adrianSaab) {
      const a = lm('adrianSpot'), bay = landmarks.adrianBay;
      let spot = null, bd = bay ? -1 : 40;
      for (const c of this.cars) {
        if (!c.home || c.home.name || c.home.indoor || c.violation || c === this.playerCar) continue;
        const d = dist(c.x, c.z, a.x, a.z);
        if (d < bd) { bd = d; spot = c; }
      }
      const at = bay ? { x: bay.x, z: bay.z, yaw: bay.yaw } : spot ? { x: spot.x, z: spot.z, yaw: spot.yaw } : { ...this.freeSpot(a.x, a.z - 6, 0, 3), yaw: Math.PI };
      if (spot) this.removeCar(spot);
      const car = new Car('saab900', { color: 0x8a8e92, name: 'adrianSaab', engineOn: false });
      car.place(at.x, at.z, at.yaw);
      car.home = { ...at, name: 'adrianSaab', type: 'saab900' };
      car.displayName = 'Adrians Saab';
      this.addCar(car);
      this.named.adrianSaab = car;
    }
  }

  // Swap a neighbour's model (Patrick gets his cast). Only between missions.
  setNpcDef(key, def) {
    const old = this.npcs[key];
    if (!old || old.def === def) return;
    if (old.car) this.unseat(old);
    this.companions.delete(old);
    const c = new Character(def);
    c.key = key;
    c.teleport(old.x, old.z, old.yaw);
    for (const f of ['homeX', 'homeZ', 'homeYaw', 'spot', 'invulnerable']) c[f] = old[f];
    scene.remove(old.root);
    scene.add(c.root);
    this.npcs[key] = c;
    if (hud.portraits[key]) hud.portraits[key] = renderPortrait(renderer, c.model);
    if (old.state === 'hidden') { c.state = 'hidden'; c.root.visible = false; }
  }

  // A named car somewhere odd (Anders' Audi left at Bilhallen): put it back home once nobody sees.
  rehome(car) { (this.rehoming ??= new Set()).add(car); }
  // A named car (Ove's Saab, Patrick's car, Rune's Volvo, Anders' Audi, Adrian's Saab) is never gone
  // for good: a wreck, or one taken out of the world, is replaced by a new one at home.
  respawnNamed(name) {
    const old = this.named[name];
    if (!old || parkedCars.some((p) => p.name === name)) { if (old && this.cars.includes(old) && !old.dead) return old; if (old) this.removeCar(old); this.named[name] = null; return this.ensureNamedCar(name); }
    const h = old.home;
    if (!h) return null;
    this.removeCar(old);
    const car = new Car(h.type || old.type, { color: old.color, name, engineOn: false });
    car.place(h.x, h.z, h.yaw);
    car.home = h;
    car.displayName = old.displayName;
    this.addCar(car);
    this.named[name] = car;
    return car;
  }
  // Ove's Saab back at its spot, if it is far from home and he isn't in it (a retried mission, the
  // start of a day), or a new one if it was wrecked.
  homeNamedCar(name) {
    let car = this.named[name];
    if (car && car !== this.playerCar && (car.dead || !this.cars.includes(car))) car = this.respawnNamed(name);
    if (!car || car === this.playerCar || car.dead || !car.home) return;
    if (dist(car.x, car.z, car.home.x, car.home.z) > 30) { car.place(car.home.x, car.home.z, car.home.yaw); car.ctrl.park = true; }
  }

  // ------------------------------------------------------------------------------------------
  // Save

  save() {
    try {
      // (clock: the in-game time; gate: the day is over and the next one hasn't dawned yet)
      // (begun: the day under way, or given up and waiting: after a reload its giver says only the
      // short retry lines, not the whole scene again - the day's progress itself is not kept)
      const ms = this.missions, cur = ms.current;
      const begun = cur && (ms.state !== 'idle' || ms.gaveUp.has(cur.day)) ? ms.index : null;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, mission: ms.index, begun, clock: Math.round(this.clockMin) % (24 * 60), gate: !ms.gateOpen && ms.index < MISSIONS.length, kr: this.coins, emblems: [...this.got.emblems], photos: [...this.got.photos], pant: this.cans, unlocked: [...this.unlocked], patrol: this.patrol.toSave(), garage: this.garage && !this.garage.isOpen ? 0 : 1, hopp: Math.round(this.hopp.best * 10), rune: this.runeDead ? 0 : 1 }));
    } catch (e) { /* private mode: progress just won't persist */ }
  }
  // Every field is checked: a hand-edited or half-written save must not kill the story (mission -1
  // or 2.5 offered no day ever again) or turn the kronor and the meter into strings ('12' + 10 = 1210).
  load() {
    this.isNewGame = true;
    if (!params.has('fresh')) {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
          const ids = (a, n) => new Set((Array.isArray(a) ? a : []).filter((v) => typeof v === 'number' || typeof v === 'string').map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v < n));
          this.missions.index = int(s.mission, 0, MISSIONS.length, 0);
          this.coins = int(s.kr, 0, 9999999, 0);
          this.got.emblems = ids(s.emblems, this.emblems?.length || 7);
          this.got.photos = ids(s.photos, this.photos?.length || 7);
          this.cans = int(s.pant, 0, 9999999, 0);
          this.unlocked = new Set((Array.isArray(s.unlocked) ? s.unlocked : []).filter((v) => typeof v === 'string'));
          this.patrol.fromSave(s.patrol);
          // (the garage door: 0 = shut; anything else, or none, = open as at the start)
          if (this.garage && s.garage === 0) this.garage.set(false);
          // (Ove's longest jump off the hoppbacke, in dm)
          this.hopp.best = int(s.hopp, 0, 2000, 0) / 10;
          // (Rune: 0 = dead, game/rune.js; anything else, or none, = alive)
          this.runeDead = s.rune === 0;
          const clock = Number(s.clock);
          if (s.clock != null && clock >= 0 && clock < 24 * 60) this.clockMin = clock;
          // Saved between two days: the next one still waits for a little patrolling.
          if (s.gate === true && this.missions.index > 0 && this.missions.index < MISSIONS.length) { this.missions.gateOpen = false; this.missions.gate = { t: 0, idle: 0, reports: this.patrol.reports }; }
          // Saved in the middle of a day (or with it given up): the short retry intro next time.
          else if (s.begun != null && Number(s.begun) === this.missions.index && MISSIONS[this.missions.index]) this.missions.gaveUp.add(MISSIONS[this.missions.index].day);
          this.isNewGame = this.missions.index === 0 && !this.patrol.reports;
        }
      } catch (e) { /* corrupt save: start fresh */ }
    }
    if (params.has('mission')) { this.missions.index = clamp(Math.floor(+params.get('mission')) || 0, 0, MISSIONS.length); this.isNewGame = false; }
    // (tests: the game as it is after Rune died and Ove gave his errand up)
    if (TEST && params.has('runedead')) this.runeDead = true;
  }
  applySaveToWorld() {
    for (const e of this.emblems) if (this.got.emblems.has(e.id)) e.remove();
    for (const p of this.photos) if (this.got.photos.has(p.id)) p.remove();
  }
  // What the pause menu's "Samlingen" shows (hud.renderAlbum): every emblem and photograph, found or
  // not, where it was found (or roughly where it might be: world/town.js placeCollectibles), the note
  // it came with (an emblem's by the order found, a photograph's by its picture), and a few counts.
  albumData() {
    const list = (spots, got, kind, notes) => {
      const order = [...got];
      return spots.map(([, , , where, hint], id) => {
        const rank = order.indexOf(id);
        return { kind, id, got: rank >= 0, rank, where: where || '', hint: hint || '', note: rank < 0 ? '' : notes[(kind === 'emblem' ? rank : id) % notes.length] };
      });
    };
    return {
      emblems: list(collectibleSpots.emblems, this.got.emblems, 'emblem', EMBLEM_NOTES),
      photos: list(collectibleSpots.photos, this.got.photos, 'photo', PHOTO_NOTES),
      last: this.lastFound, cans: this.cans, jump: this.hopp?.best || 0,
    };
  }
  resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  }

  // ------------------------------------------------------------------------------------------
  // The neighbours stand at home, or wherever their mission is offered from.

  homeSpot(key) {
    const cur = this.missions.offered;
    let [where, right, ahead] = HOMES[key];
    // Elsewhere today (DESIGN 5: the girls are at Jimmy's while Parvaneh drives to the hospital).
    const ms = this.missions, today = ms.state === 'idle' ? ms.offered : ms.m?.def || ms.current;
    const el = today?.elsewhere?.[key];
    if (el) [where, right, ahead] = el;
    // The day's giver (and whoever else is in the scene) waits at the mission's landmark; someone
    // who lives there keeps their usual spot by the door.
    if (cur && (cur.giver === key || cur.extra?.includes(key)) && where !== cur.at) { where = cur.at; right = cur.giver === key ? 0 : 1.6; ahead = cur.giver === key ? 0 : 0.6; }
    return { where, right, ahead, id: `${where}:${right}:${ahead}` };
  }

  // Someone who is elsewhere today (DESIGN 5: Patrick is in hospital on day 2, Vita skjortan is
  // out in his Škoda on days 6 and 7) is hidden at home, unless a stage has borrowed them.
  npcAway(key) {
    // (Rune is dead: game/rune.js)
    if (key === 'rune' && this.runeDead) return true;
    const ms = this.missions, def = ms.state === 'idle' ? ms.offered : ms.m?.def || ms.current;
    // (m.data.away: someone a stage has sent out of the story for the rest of the day, e.g.
    // Parvaneh, in the delivery room on day 7)
    if (ms.m?.data.away?.has(key)) return true;
    if (!def?.away?.includes(key)) return false;
    return !ms.m?.data.npcs.has(this.npcs[key]);
  }

  placeNpcs(force = false) {
    const cur = this.missions.offered;
    // (where Ove is: in his car if he drives - player.x/z used to stay where he got in)
    const f = this.playerCar || this.player;
    for (const key of Object.keys(HOMES)) {
      const n = this.npcs[key];
      if (n.busy || n.car || this.companions.has(n) || n.walkTo || n.dead) continue;
      const h = this.homeSpot(key);
      const needed = cur && (cur.giver === key || cur.extra?.includes(key));
      const away = n.homeX === undefined || dist(n.x, n.z, n.homeX, n.homeZ) > 6;
      if (n.spot === h.id && !away && !force) continue;
      if (n.state !== 'normal' && !force) continue;
      // Don't pop people around in front of Ove unless a mission needs them there.
      if (!force && !needed && dist(n.x, n.z, f.x, f.z) < 50) continue;
      const p = lm(h.where);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      let x = p.x - fz * h.right + fx * h.ahead, z = p.z + fx * h.right + fz * h.ahead;
      if (!this.spotFree(x, z)) { const s = this.freeSpot(x, z, 0.4, 2.5); x = s.x; z = s.z; }
      n.homeX = x; n.homeZ = z; n.homeYaw = p.yaw;
      n.teleport(x, z, p.yaw);
      n.spot = h.id;
      // A new day (or the game loading): whoever is elsewhere today is gone at once, not standing
      // at their door until Ove walks off (Patrick on the morning he is in hospital).
      if (force && this.npcAway(key)) { n.state = 'hidden'; n.root.visible = false; }
      else if (force && n.state === 'hidden') { n.state = 'normal'; n.root.visible = true; }
    }
  }

  // ------------------------------------------------------------------------------------------
  // The loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    // Game time never runs ahead of the physics: below 30 fps the fixed steps can't keep up (at most
    // MAX_STEPS a frame), so everything else - timers, the clock, the Ordning drain, hooks, dialogue -
    // slows down with them. It used to get the frame time clamped at 0.05 s: at 20 fps the missions'
    // and errands' timers ran 1.5x faster than the cars and people they time.
    const dt = clamp((now - this.last) / 1000, 0, MAX_STEPS * STEP);
    this.last = now;
    input.poll();
    if (this.started && !this.paused) this.update(dt);
    else if (!this.started) { this.idleTitle(dt); this.titleKeys(); }
    else if (this.paused) {
      // Nothing else reads keys while paused. (The Esc that released the pointer and opened the
      // menu may arrive a moment later: ignore keys for the first 300 ms.)
      if (input.pressed('mute')) { audio.setMuted(!audio.muted); hud.syncMenu(); }
      if (performance.now() - (this.pausedAt || 0) > 300 && input.pressed('pause')) this.pause(false);
    }
    // (the cold's blizzard thickens the haze and dims the sun for the frame only: game/cold.js)
    this.cold?.beforeRender();
    renderFrame();
    this.cold?.afterRender();
    input.endFrame();
    this.frame++;
    window.__frame = this.frame;
  }

  // Title: a slow drift in towards Ove and his Saab (titlePose), the town ticking over around them.
  idleTitle(dt) {
    this.time += dt;
    const s = landmarks.oveStart || lm('oveHouse');
    const t = this.time;
    const a = (1 - Math.cos(Math.min(1, t / 40) * Math.PI)) / 2;   // eases from 0 to 1 over 40 s
    const T = this.titleShot;
    if (T) {
      const th = T.th0 + (T.th1 - T.th0) * a, d = T.d0 + (T.d1 - T.d0) * a;
      const ox = T.fx * Math.cos(th) + T.lx * Math.sin(th), oz = T.fz * Math.cos(th) + T.lz * Math.sin(th);
      camera.position.set(T.x + ox * d, 1.36 - a * 0.06 + Math.sin(t * 0.21) * 0.02, T.z + oz * d);
      // Aimed to the camera's left of them, so they stand in the right half of the picture.
      camera.lookAt(T.x - oz * T.off, 1.2, T.z + ox * T.off);
      camera.fov = 40;
    } else {
      camera.position.set(s.x - 25 + a * 4, 3.1 - a * 0.5 + Math.sin(t * 0.21) * 0.05, s.z - 0.2 + Math.sin(t * 0.13) * 0.25);
      camera.lookAt(s.x + 14, 1.6, s.z);
      camera.fov = 44;
    }
    const tc = window.__titleCam;   // look-dev override: { pos: [x,y,z], look: [x,y,z], fov }
    if (tc) { camera.position.set(...tc.pos); camera.lookAt(...tc.look); camera.fov = tc.fov || 44; }
    camera.updateProjectionMatrix();
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) { this.stepWorld(STEP); this.acc -= STEP; n++; }
    if (this.acc >= STEP) this.acc = 0;
    followSun(T ? T.x : s.x, T ? T.z : s.z);
    tickSky(this.time, camera.position);
    tickWild(camera.position.x, camera.position.z, camera.position.y);
    this.syncAll(dt, true);
    tickCarSnow(dt, this);
    FX.tick(dt);
  }

  // The title starts with the keyboard and the gamepad too (it took a mouse click only): Enter, Space
  // or E, the pad's A, Y or Start. Not while the controls card or the "Säker? Klicka igen" confirm is
  // up, and the keys not while another title button has the focus (Enter / Space are its own then).
  // Mouse0 never starts it ('skip' includes it: a click on Kontroller would have started the game).
  titleKeys() {
    const play = document.getElementById('play');
    if (!play || play.disabled) return;
    if (document.getElementById('title')?.classList.contains('ctl') || document.getElementById('newgame')?.classList.contains('confirm')) return;
    const ae = document.activeElement;
    const keysFree = !ae || ae === document.body || ae === play || ae === renderer.domElement;
    if ((keysFree && input.keyPressedAction('begin')) || input.padPressedAction('begin')) this.start();
  }

  update(dt) {
    this.time += dt;
    this.tickClock(dt);
    if (this.hooks.length) for (const h of this.hooks.slice()) h(dt);
    this.handleOneShots(dt);
    this.horn.update(dt);
    this.hopp.update(dt);
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) { this.fixedStep(STEP); this.acc -= STEP; n++; }
    if (this.acc >= STEP) this.acc = 0;
    this.syncAll(dt, false);
    tracks.update(this, dt);
    const ms = this.missions.state;
    this.patrol.suspended = ms !== 'idle';
    if (ms !== this.lastMissionState) {
      if (ms === 'idle') this.patrol.newStretch();
      this.lastMissionState = ms;
    }
    // (while Ove freezes to death and wakes up again, the day, the errands and the patrol hold)
    this.cold.update(dt);
    if (!this.cold.busy) {
      this.missions.update(dt);
      this.missions.updateFailed(dt);
      this.tickGarage(dt);
      this.interrupts.update(dt);
      this.patrol.update(dt);
      this.parking.update(dt);
    }
    this.tickPickups(dt);
    const f = this.focus();
    tickProps(dt, f.x, f.z);
    tickCarSnow(dt, this);
    FX.tick(dt);
    tickTown(this.time);
    this.updateMarkers();
    // On foot the camera swings in behind Ove after a few seconds without the mouse (camera.js).
    f.autoTurn = !this.playerCar; f.lookBack = input.down('lookBack');
    this.cam.update(dt, f, this.inDialog ? null : input.look(), this.cars);
    this.hideNearCamera();
    if (this.aerial) { camera.position.set(f.x, 420, f.z + 260); camera.lookAt(f.x, 0, f.z); camera.fov = 50; camera.updateProjectionMatrix(); }
    followSun(f.x, f.z);
    tickSky(this.time, camera.position);
    tickWild(camera.position.x, camera.position.z, camera.position.y);
    this.updateHud(dt);
    this.updateAudio(dt);
    this.slideTalk(dt);
    this.tickChat();
    this.recycleTraffic(dt);
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 30) { this.saveT = 0; this.save(); }
  }

  // A failed day (missions.js) or errand (interruptions.js retry: Rune's, once he has died) waiting
  // for E or Q: Ove stands still, his car brakes.
  get failWait() { return this.missions.state === 'failed' || !!this.interrupts.retry; }

  // The prompt-and-E owner of the moment: a mission stage or an errand stage.
  stagePrompt() {
    if (this.missions.state === 'running') { const p = this.missions.stage?.prompt?.(this); if (p) return p; }
    return this.interrupts.prompt();
  }

  handleOneShots(dt = 0) {
    if (input.pressed('mute')) { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Ljudet av' : 'Ljudet på'); }
    // The p-skiva or a parking ticket in his hands: its own keys, nothing else (game/pskiva.js).
    if (this.overlay) { this.parking.overlay(dt); return; }
    if (input.pressed('map')) { this.bigMap = !this.bigMap; hud.toggleBigMap(this.bigMap, this); }
    if (input.pressed('pause') && !TEST) { this.pause(true); return; }
    const p = this.player;
    if (input.pressed('jump') && !this.playerCar) this.jumpAsk = this.time;   // (in a car Space is the handbrake)
    if (this.inDialog || this.failWait) { p.cancelJump(); this.jumpAsk = -9; return; }
    if (input.pressed('reset')) { this.resetToRoad(); return; }
    const sp = this.stagePrompt();
    if (this.playerCar) {
      // G (the pad's d-pad up): the p-skiva, in a bay that wants one
      if (input.pressed('pskiva') && this.parking.openDisc()) return;
      if (input.pressed('interact') && !sp?.takesE) this.exitCar();
      return;
    }
    if (p.state !== 'normal' || this.doorOp?.lock) return;
    if (this.time - this.jumpAsk < JUMP_BUFFER && !this.pushedNpc() && p.jump(JUMP_V)) this.jumpAsk = -9;
    if (input.pressed('attack') && this.kickT <= 0 && p.onGround && p.windT < 0 && !this.pushedNpc()) {
      p.anim.kick = 1; this.kickT = 0.5; this.kickHitT = 0.14;
    }
    if (input.pressed('interact') && this.doorOp) this.endDoorOp();
    if (input.pressed('interact') && !sp?.takesE) this.interact();
  }

  // Stuck somewhere silly? R puts you (and your car) back on the nearest road.
  resetToRoad() {
    const f = this.focus();
    const i = Math.round((f.x + HALF) / P), j = Math.round((f.z + HALF) / P);
    const rx = clamp(i, 0, N) * P - HALF, rz = clamp(j, 0, N) * P - HALF;
    let x, z, yaw;
    // Right-hand lanes: heading +z keeps to -x, heading +x keeps to +z.
    if (Math.abs(f.x - rx) < Math.abs(f.z - rz)) { x = rx - LANE; z = clamp(f.z, -HALF, HALF); yaw = 0; }
    else { x = clamp(f.x, -HALF, HALF); z = rz + LANE; yaw = Math.PI / 2; }
    if (this.playerCar) this.playerCar.place(x, z, yaw);
    else {
      // On foot: the sidewalk beside that road.
      if (Math.abs(f.x - rx) < Math.abs(f.z - rz)) x = rx - RHW - 1.8; else z = rz + RHW + 1.8;
      this.player.teleport(x, z, yaw);
    }
    this.cam.yaw = yaw;
    this.cam.snapNext = true;
    hud.toast('Tillbaka på vägen.');
  }

  interact() {
    const it = this.nearestInteractable();
    if (!it) return;
    if (it.type === 'talk') this.missions.begin();
    else if (it.type === 'chat') this.chat(it.who);
    else if (it.type === 'car') this.enterCar(it.car);
    else if (it.type === 'ticket') this.parking.take(it.car);
    else if (it.type === 'garage') this.useGarage();
  }

  // The lines a neighbour may say now (see CHATTER, CHATTER_FIRST, CHATTER_AFTER): from the day in
  // CHATTER_AFTER on, its lines 60 % of the time; both: everything they may say now, from either list.
  // (A reused array: read it at once.)
  chatterFor(key, both = false) {
    const m = this.missions;
    // (Anita once Rune is dead: game/rune.js)
    if (key === 'anita' && this.runeDead) return WIDOW.chatter;
    if (m.index === 0 && CHATTER_FIRST[key]) return CHATTER_FIRST[key];
    const later = CHATTER_AFTER[key], base = CHATTER[key] || [];
    const lists = !(later && m.index >= later[0]) ? [base] : later[2] ? [later[1]] : both ? [later[1], base] : [Math.random() < 0.6 ? later[1] : base];
    const out = (this._chatter ||= []);
    out.length = 0;
    for (const list of lists) for (const l of list) if (typeof l === 'string') out.push(l); else if (whenOk(l[1], m)) out.push(l[0]);
    if (!out.length && !lists.includes(base)) for (const l of base) if (typeof l === 'string' || whenOk(l[1], m)) out.push(typeof l === 'string' ? l : l[0]);
    if (!out.length) out.push(CHATTER_FALLBACK);
    return out;
  }

  // A neighbour's next line, one they haven't said lately (n.chatSaid, the latest last): not among the
  // last ⌊k/2⌋ said of the k they may say now, and never the one they said last time (when the 60 %
  // list has nothing else, one from the other: Rune's only later line is "...Saab.").
  pickChatter(n) {
    const said = (n.chatSaid ||= []), last = said[said.length - 1];
    const list = this.chatterFor(n.key), k = Math.floor(list.length / 2), recent = k ? said.slice(-k) : [];
    let ok = list.filter((l) => l !== last && !recent.includes(l));
    if (!ok.length) ok = this.chatterFor(n.key, true).filter((l) => l !== last);
    const line = ok.length ? pick(ok) : last;
    said.push(line);
    if (said.length > 8) said.shift();
    return line;
  }

  // Ove's answer to a neighbour's line (script.js CHATTER_REPLY): { text ('' = he says nothing), then:
  // [LINE...] the exchange going on, or null }. A line with no answer gets a grunt (CHATTER_SPARE).
  chatReply(key, line) {
    const m = this.missions;
    const ok = (CHATTER_REPLY[key]?.[line] || []).filter((a) => typeof a === 'string' || !a[1] || whenOk(a[1], m));
    if (!ok.length) return { text: pick(CHATTER_SPARE), then: null };
    const a = pick(ok);
    return typeof a === 'string' ? { text: a, then: null } : { text: a[0], then: a[2] || null };
  }

  // Small talk with a neighbour (E; features/implemented/smaprat.md): a line from them, Ove's answer to
  // it, and the rest of the exchange if it goes on (tickChat). The fourth time within a minute they
  // say nothing and Ove has had enough: then they are left alone for 20 s (no E, none of their own
  // small talk).
  chat(n) {
    if ((n.chatCD || 0) > this.time) return;
    n.chatCD = this.time + 3;
    n.yaw = yawTo(this.player.x - n.x, this.player.z - n.z);
    this.player.yaw = yawTo(n.x - this.player.x, n.z - this.player.z);
    n.chatT = 12 + Math.random() * 8;
    this.chatX = null;
    const es = (n.chatEs ||= []);
    while (es.length && es[0] < this.time - 60) es.shift();
    if (es.length >= 3) {
      es.length = 0;
      n.chatLock = this.time + 20;
      this.say(this.player, CHATTER_ENOUGH, 1.8);
      this.murmur(CHARS.ove.voice);
      return;
    }
    es.push(this.time);
    const line = this.pickChatter(n), u = this.say(n, line, 2.8);
    if (!u) for (let k = 0; k < 3; k++) setTimeout(() => audio.talk(n.def.voice || 300), k * 230);
    const r = this.chatReply(n.key, line);
    this.chatX = { n, u, steps: [['ove', r.text], ...(r.then || [])], i: 0, due: u ? 0 : this.time + 2, ms: this.missions.state, self: false };
  }

  // Small talk going on (chat, or a neighbour's own that Ove answers): the next line once the last has
  // been said. With the voices 0.45 s after its clip (and none if it was cut off or dropped), without
  // them 2 s after the neighbour's line and 1.6 s after each one after that. It breaks off when Ove
  // walks off (6 m), gets into a car or is knocked over, a dialogue or a day begins, the neighbour is
  // taken up with something else, or the cold has him. A silence is a nod or a shake of the head.
  tickChat() {
    const x = this.chatX;
    if (!x) return;
    const n = x.n, p = this.player;
    if (this.playerCar || p.state !== 'normal' || this.inDialog || this.missions.state !== x.ms || n.state !== 'normal' || this.cold.busy || dist(n.x, n.z, p.x, p.z) > 6) { this.chatX = null; return; }
    if (x.u) {
      if (x.u.state === 'queued' || x.u.state === 'playing') return;
      if (x.u.state === 'dropped' || x.u.rec.cut > 0.25) { this.chatX = null; return; }
      x.u = null;
      x.due = this.time + 0.45;
    }
    if (this.time < x.due) return;
    if (x.i >= x.steps.length) { this.chatX = null; return; }
    const [who, text] = x.steps[x.i++];
    if (!text) { if (!x.self) this.oveGesture(CHAT_SILENT[n.key]); this.chatX = null; return; }
    const ove = who === 'ove', ch = ove ? p : this.npc(who) || n;
    x.u = this.say(ch, text, ove ? 1.6 : 2.8);
    if (ove) { this.murmur(CHARS.ove.voice); this.oveGesture(CHAT_GESTURE[text]); }
    else if (!x.u) for (let k = 0; k < 3; k++) setTimeout(() => audio.talk(ch.def.voice || 300), k * 230);
    x.due = this.time + 1.6;
  }
  // A nod or a shake of Ove's head (models.js st.gesture).
  oveGesture(kind) {
    if (!kind) return;
    const a = this.player.anim;
    a.gesture = kind; a.gestureAt = a.t;
  }

  nearestInteractable() {
    const p = this.player;
    // (nothing else while he is at the garage door: an E after his hands are off it ends that first)
    if (this.doorOp) return null;
    if (this.missions.offered) {
      const g = this.npc(this.missions.offered.giver);
      if (g && !g.car && g.state === 'normal' && dist(g.x, g.z, p.x, p.z) < 3.4 && Math.abs(g.y - p.y) < 2) return { type: 'talk', who: g };
    }
    let best = null, bd = 2.2;
    for (const c of this.cars) {
      if (c.dead || c.locked || Math.abs(c.x - p.x) > 8 || Math.abs(c.z - p.z) > 8) continue;
      if (p.y > c.y + c.height - 0.3) continue;
      // (not through the shut garage door: the Saab inside, Ove outside)
      if (this.garage?.between(p.x, p.z, c.x, c.z)) continue;
      const h = _hit2;
      if (circleVsObb(p.x, p.z, 2.2, c.obb, h)) {
        const d = 2.2 - h.depth;
        if (d < bd) { bd = d; best = { type: 'car', car: c }; }
      }
    }
    // The garage door, when Ove faces it (a car beside or behind him doesn't take E from it), or
    // when nothing else is in reach and he isn't turned away from it.
    const gr = this.garageReach();
    if (gr && (gr.facing > 0.5 || (!best && gr.facing > -0.2 && gr.d < 1.1))) return { type: 'garage', open: !this.garage.isOpen };
    // A parking ticket under its wiper: E takes that first, there is no getting in before (pskiva.js).
    if (best && this.parking?.ticketOn(best.car)) return { type: 'ticket', car: best.car };
    if (best) return best;
    let nb = null, nd = 2.6;
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.car || n.state !== 'normal' || this.companions.has(n)) continue;
      // (not while they are talking with Ove, nor for 20 s after he has had enough: chat)
      if (this.chatX?.n === n || (n.chatLock || 0) > this.time) continue;
      const d = dist(n.x, n.z, p.x, p.z);
      if (d < nd) { nd = d; nb = { type: 'chat', who: n }; }
    }
    return nb;
  }

  // ------------------------------------------------------------------------------------------
  // Ove's garage door (world/garagedoor.js). E at it, from outside or in, facing it: opening, he
  // takes the handle and lifts (the springs take it the rest of the way up) and steps back from the
  // bottom's swing; closing, he reaches up for the open door's edge, pulls it down, steps back as it
  // falls shut and then - from outside - tugs the handle three times to see that it is shut properly.
  // Not with a car or somebody in the doorway. While his hands are on it (op.lock) he stays put;
  // after that a step, a jump, a kick or E of his own ends it (the door goes on by itself).

  // Can Ove work the door from where he stands? { a, o (door coordinates), d, side (1 outside),
  // facing (1 = straight at it) } or null.
  garageReach() {
    const d = this.garage, p = this.player;
    if (!d || d.moving || this.doorOp || this.playerCar || p.state !== 'normal' || !p.onGround || p.y > 0.5 || this.carrying || this.pushedNpc()) return null;
    const [a, o] = d.local(p.x, p.z);
    if (Math.abs(a) > d.w / 2 + 0.25 || Math.abs(o) > 1.5) return null;
    const side = o >= 0 ? 1 : -1;
    return { a, o, d: Math.abs(o), side, facing: -side * (Math.sin(p.yaw) * d.ox + Math.cos(p.yaw) * d.oz) };
  }

  useGarage() {
    const d = this.garage, p = this.player, r = this.garageReach();
    if (!r) return;
    const open = !d.isOpen, why = this.garageBlocked(open);
    if (why) { this.say(p, why, 1.8); this.murmur(CHARS.ove.voice); return; }
    // (the handle is in the middle; the open door's edge he takes where he stands)
    this.doorOp = { open, side: r.side, phase: 'reach', t: 0, pt: 0, a: open ? 0 : clamp(r.a, -0.8, 0.8), lock: true, walk: true, wx: 0, wz: 0, at: false, tugs: 0 };
    p.faceWish = false;
  }

  // What is in the door's way (Ove's line for it), or null: a car in the doorway, under the bottom's
  // swing (0.3 m out) or less than 0.12 m in (the Saab parked nose in is 0.2 m in), or, to come down,
  // somebody standing in the doorway.
  garageBlocked(open) {
    const d = this.garage, h = _hit2;
    let band = d.band(0.45, 0.12);
    for (const c of this.cars) {
      if (Math.abs(c.x - d.x) > 9 || Math.abs(c.z - d.z) > 9) continue;
      if (obbVsBlock(c.obb, band, h)) return c === this.named.saab ? GARAGE_DOOR.saabInWay : GARAGE_DOOR.carInWay;
    }
    if (open) return null;
    band = d.band(0.2, 0.2);
    for (const ch of this.allChars(this._doorChs ||= [])) {
      if (ch === this.player || ch.state === 'hidden' || ch.state === 'seated' || Math.abs(ch.x - d.x) > 4 || Math.abs(ch.z - d.z) > 4) continue;
      if (circleVsBlock(ch.x, ch.z, ch.r, band, h)) return GARAGE_DOOR.inDoorway;
    }
    return null;
  }

  tickGarage(dt) {
    const d = this.garage;
    if (!d) return;
    if (this.doorOp) this.stepDoorOp(this.doorOp, dt);
    const ev = d.update(dt);
    if (ev) audio.garage(ev === 'opened' ? 'up' : 'shut', this.doorVol());
  }
  doorVol() { const f = this.focus(); return clamp(1.1 - dist(f.x, f.z, this.garage.x, this.garage.z) / 45, 0, 1); }

  stepDoorOp(op, dt) {
    const d = this.garage, p = this.player;
    // (into a car, knocked over, a scene: he lets go; the door goes on)
    if (this.playerCar || p.state !== 'normal' || this.inDialog || this.failWait) { this.endDoorOp(); return; }
    // After his hands are off it, a step (a jump, a kick) of his own is the end of it.
    if (!op.lock && (Math.abs(input.moveX() || 0) > 0.2 || Math.abs(input.moveY() || 0) > 0.2 || input.pressed('jump') || input.pressed('attack'))) { this.endDoorOp(); return; }
    op.t += dt; op.pt += dt;
    const out = op.side > 0, k = d.p;
    // How far from the door he stands (the bottom swings out ~0.3 m at knee height on the way).
    let dist0;
    if (op.phase === 'reach') dist0 = op.open ? 0.55 : out ? 0.38 : 0.5;
    else if (op.phase === 'pull') dist0 = op.open ? 0.55 + 0.27 * sstep(0.06, 0.25, k) : out ? 0.38 + 0.25 * sstep(1, 0.75, k) : 0.5;
    else if (op.phase === 'back') dist0 = out ? 0.82 : 0.95;
    else dist0 = 0.5;
    const [a, o] = d.local(p.x, p.z), ea = op.a - a, eo = op.side * dist0 - o;
    let wa = ea * 5, wo = eo * 5;
    const l = Math.hypot(wa, wo);
    if (l > 1.3) { wa *= 1.3 / l; wo *= 1.3 / l; }
    op.wx = d.ax * wa + d.ox * wo; op.wz = d.az * wa + d.oz * wo;
    op.at = Math.hypot(ea, eo) < 0.1;
    p.yaw = dampAngle(p.yaw, yawTo(-op.side * d.ox, -op.side * d.oz), 9, dt);
    this.poseTug = 0;
    if (op.phase === 'reach') {
      // the handle (opening), the open door's bottom edge overhead (closing)
      this.doorReach(op, op.open ? DOOR_HANDLE : 0, op.open ? 0.05 : 0);
      if ((op.at && op.pt > 0.35) || op.pt > 1.2) {
        if (op.open ? d.open() : d.close()) {
          const v = this.doorVol();
          if (op.open) audio.garage('latch', v);
          audio.garage('roll', v, op.open ? 1.3 : 1.05);
        }
        op.phase = 'pull'; op.pt = 0;
      }
    } else if (op.phase === 'pull') {
      this.doorReach(op, op.open ? DOOR_HANDLE : 0, op.open ? 0.05 : 0);
      if (op.open ? k >= 0.25 : k <= 0.75) { op.phase = 'back'; op.pt = 0; op.lock = false; }
    } else if (op.phase === 'back') {
      if (!d.moving) {
        if (op.open || !out) { this.endDoorOp(); return; }
        op.phase = 'tug'; op.pt = 0;
      }
    } else if (op.phase === 'tug') {
      // three tugs on the handle, a third of a second apart, once he is back at it
      this.doorReach(op, DOOR_HANDLE, 0.05);
      if (op.t0 == null) { if (op.at || op.pt > 0.7) op.t0 = op.pt + 0.15; return; }
      const tt = op.pt - op.t0, n = Math.floor(tt / 0.34), f = tt - n * 0.34;
      if (tt >= 0 && n < 3) {
        this.poseTug = f < 0.2 ? Math.sin(Math.PI * f / 0.2) : 0;
        if (n >= op.tugs && f >= 0.09) { op.tugs = n + 1; d.bump(0.012); audio.garage('tug', this.doorVol()); }
      }
      if (tt > 3 * 0.34 + 0.15) {
        if (Math.random() < 0.35) { this.say(p, pick(GARAGE_DOOR.shut), 1.4); this.murmur(CHARS.ove.voice); }
        this.endDoorOp();
      }
    }
  }
  // Hands on the door, u metres up the panel from its bottom edge (and `face` out from it, towards
  // Ove: the handle stands off the panel), at the grip's place across it.
  doorReach(op, u, face) {
    const d = this.garage, p = this.player, q = d.pointUp(u, this._dq ||= []);
    const [wx, wz] = d.world(op.a, q[1] + face * op.side);
    const dx = wx - p.x, dz = wz - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    this.poseReach = [q[0] - p.y, dx * s + dz * c, dx * c - dz * s];
    this.posePlayer('work', 'door');
  }
  endDoorOp() {
    this.doorOp = null;
    this.player.faceWish = true;
    this.poseTug = 0;
  }

  // The shut garage door right in front of (or behind) a car that is about to drive into it.
  garageAhead(c) {
    const d = this.garage;
    if (!d || d.block.dead || c.speed > 6) return false;
    const [a, o] = d.local(c.x, c.z);
    if (Math.abs(a) > 2.2 || Math.abs(o) > 7.5) return false;
    const toward = -Math.sign(o) * (Math.sin(c.yaw) * d.ox + Math.cos(c.yaw) * d.oz);
    return Math.abs(toward) > 0.75 && Math.abs(o) - c.obb.hz < 4;
  }
  // A car into the shut door: it booms and rattles in its frame (and Ove has something to say).
  garageHit(car, impact) {
    const d = this.garage;
    if (!d) return;
    d.bump(Math.min(0.05, 0.008 + impact * 0.003));
    audio.garage('shut', this.doorVol() * Math.min(1, 0.3 + impact / 12));
    if (car === this.playerCar && impact > 3 && this.time > (this._doorLineT || 0)) {
      this._doorLineT = this.time + 10;
      this.say(this.player, pick(GARAGE_DOOR.hit), 1.8);
      this.murmur(CHARS.ove.voice);
    }
  }

  // Physics for everything but the player's input (the title screen runs this too).
  stepWorld(h) {
    const cars = this.cars, fp = this.playerCar || this.player, fx = fp.x, fz = fp.z;
    const odd = (this.stepN = (this.stepN + 1) | 0) & 1;
    // Traffic far from Ove (> 120 m) thinks at 30 Hz, half of it on each step (its physics still
    // steps at 60); chases, smitare and mission drivers always at 60.
    this.byX();
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], ai = c.ai;
      if (!ai) continue;
      if (ai.mode === 'traffic' && (c.x - fx) ** 2 + (c.z - fz) ** 2 > FAR2) { if ((c.id & 1) === odd) ai.update(h * 2, this); }
      else ai.update(h, this);
    }
    for (let i = 0; i < cars.length; i++) cars[i].step(h, this);
    this.collideAll();
    this.keepCarsInside();
    // Pedestrians far away walk at 30 Hz too.
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i], c = ped.char;
      if (c.state === 'normal' && (c.x - fx) ** 2 + (c.z - fz) ** 2 > FAR2) { if ((i & 1) === odd) { ped.update(h * 2, this); c.step(h * 2, this); } }
      else { ped.update(h, this); c.step(h, this); }
    }
    this.stepNpcs(h);
    this.keepPeopleInside();
    if (!this.playerCar) this.player.step(h, this);
    this.carsVsPeople();
  }

  // Where the invisible walls stood (BOUND) everyone but Ove and his car still stops (features/
  // avgrunden.md): the traffic, the chases and the race, the pedestrians, the neighbours walking with
  // him. Like the old walls, a car is pushed back and loses its speed outwards.
  keepCarsInside() {
    const pc = this.playerCar;
    for (const c of this.cars) {
      if (c === pc || (!c.ai && !c.driver && !c.driverBust)) continue;
      const r = Math.min(c.radius, 2.6), lim = BOUND - r;
      if (c.x > lim || c.x < -lim) { const sg = Math.sign(c.x); c.x = sg * lim; if (c.vx * sg > 0) c.vx *= -0.2; }
      if (c.z > lim || c.z < -lim) { const sg = Math.sign(c.z); c.z = sg * lim; if (c.vz * sg > 0) c.vz *= -0.2; }
    }
  }
  keepPeopleInside() {
    const keep = (ch) => {
      if (ch.state === 'seated' || ch.state === 'hidden') return;
      // (Rune goes nowhere by himself: only Ove takes him out there - pushing, letting go, kicking)
      if (ch.wheelchair) return;
      const lim = BOUND - ch.r;
      if (ch.x > lim || ch.x < -lim) { const sg = Math.sign(ch.x); ch.x = sg * lim; if (ch.vx * sg > 0) ch.vx = 0; }
      if (ch.z > lim || ch.z < -lim) { const sg = Math.sign(ch.z); ch.z = sg * lim; if (ch.vz * sg > 0) ch.vz = 0; }
    };
    for (const p of this.peds) keep(p.char);
    for (const k in this.npcs) keep(this.npcs[k]);
  }

  fixedStep(h) {
    const p = this.player;
    if (this.playerCar) {
      const c = this.playerCar.ctrl;
      if (this.inDialog || this.freezeCar || this.failWait || this.overlay) { c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = true; }
      else { c.throttle = input.throttle(); c.brake = input.brake(); c.steer = input.steer(); c.handbrake = input.down('handbrake'); }
      c.park = false;
    } else if (p.state === 'normal') {
      if (this.inDialog || this.failWait || this.overlay) { p.wishX = p.wishZ = 0; }
      else if (this.doorOp?.walk) { p.wishX = this.doorOp.wx; p.wishZ = this.doorOp.wz; p.anim.sprint = false; }
      else {
        const mx = input.moveX() || 0, my = input.moveY() || 0;
        const fx = Math.sin(this.cam.yaw), fz = Math.cos(this.cam.yaw);
        let wx = fx * my + -fz * mx, wz = fz * my + fx * mx;
        const l = Math.hypot(wx, wz);
        if (l > 1) { wx /= l; wz /= l; }
        const brisk = input.down('sprint'), pushing = !!this.pushedNpc();
        const sp = pushing ? (brisk ? PUSH_BRISK : PUSH) : brisk ? BRISK : WALK;
        p.wishX = wx * sp; p.wishZ = wz * sp;
        p.anim.sprint = brisk && !pushing;
      }
    }
    if (this.kickHitT > 0) {
      this.kickHitT -= h;
      if (this.kickHitT <= 0) this.kickHit();
    }
    this.kickT -= h;
    this.stepWorld(h);
    // While Ove drives, he is where his car is (player.x/z used to stay where he got in: neighbours
    // were sent home in plain view, and the ones by the boarding spot never were).
    if (this.playerCar && p.car === this.playerCar) { p.x = this.playerCar.x; p.z = this.playerCar.z; p.y = this.playerCar.y; p.vx = p.vz = p.vy = 0; }
  }

  // The neighbours: stand at home and face Ove when he comes by, walk with him when they are
  // his companions (Rune is pushed), walk off somewhere when asked to.
  stepNpcs(h) {
    const p = this.player;
    // Ove's trail on foot (a point every 0.6 m, the last ~29 m): people walking with him follow it
    // round fences and hedges instead of walking straight at him into them.
    const crumbs = this.crumbs;
    if (this.playerCar) crumbs.length = 0;
    else if (p.state === 'normal') {
      const last = crumbs[crumbs.length - 1];
      if (!last || (p.x - last.x) ** 2 + (p.z - last.z) ** 2 > 0.36) {
        const c = crumbs.length >= 48 ? crumbs.shift() : { x: 0, z: 0 };
        c.x = p.x; c.z = p.z;
        crumbs.push(c);
      }
    }
    let idx = 0;
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.state === 'seated') continue;
      n.wishX = n.wishZ = 0;
      // Rune's chair rolling free, or his body (game/rune.js).
      if (n.wheelchair && this.rune.step(n, h)) continue;
      // Honked at (game/horn.js): the fright and its aftermath steer them for a moment.
      if (n.honk && this.horn.drive(n, h)) { n.step(h, this); continue; }
      const comp = this.companions.get(n);
      if (comp && comp.push && !this.playerCar && p.state === 'normal') {
        // Ove pushes the wheelchair: Rune rolls 0.78 m in front of him.
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        n.x = p.x + fx * 0.78; n.z = p.z + fz * 0.78;
        n.y = groundAt(n.x, n.z, n.y + 0.4, 0.45);
        n.yaw = p.yaw; n.vx = p.vx; n.vz = p.vz; n.vy = 0; n.onGround = true;
        continue;
      }
      if (comp && !n.car) {
        if (this.playerCar) {
          const c = this.playerCar;
          if (dist(n.x, n.z, c.x, c.z) < 9 && c.speed < 3) this.boardCompanion(n, c);
        } else {
          const d = dist(n.x, n.z, p.x, p.z);
          comp.farT = d > 20 ? (comp.farT || 0) + h : 0;
          if (comp.left && d < 3) comp.left = false;
          if (d > 35) comp.left = true;
          if (!comp.left) {
            let tx, tz;
            if (d < 3.2 || crumbs.length < 3) {
              // Close: 1.4 m behind him, side by side.
              const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), side = idx % 2 ? 0.7 : -0.7;
              tx = p.x - fx * 1.4 - fz * side; tz = p.z - fz * 1.4 + fx * side;
            } else {
              // Further back: along his trail, from the point of it nearest them on towards him.
              let bi = 0, bd = Infinity;
              for (let i = 0; i < crumbs.length; i++) { const c = crumbs[i], e = (c.x - n.x) ** 2 + (c.z - n.z) ** 2; if (e < bd) { bd = e; bi = i; } }
              const c = crumbs[Math.min(crumbs.length - 1, bd < 1.2 ? bi + 2 : bi)];
              tx = c.x; tz = c.z;
            }
            const dd = dist(n.x, n.z, tx, tz);
            if (dd > 0.5) {
              const sp = d > 6 ? (n.wheelchair ? 3 : 4.6) : d > 3.2 ? Math.max(2.4, p.speed + 0.4) : dd > 2.5 ? Math.max(2.4, p.speed) : Math.min(2.4, p.speed + 0.6);
              n.wishX = ((tx - n.x) / dd) * sp; n.wishZ = ((tz - n.z) / dd) * sp;
            }
            // Pressed against something for 2.5 s while Ove walks on: once he can't see them they
            // catch up by his trail (a point ~2 m behind him).
            const chk = (comp.chk ||= { t: 0, x: n.x, z: n.z });
            chk.t += h;
            if (chk.t > 2.5) {
              const stuck = d > 4 && dist(n.x, n.z, chk.x, chk.z) < 0.4;
              chk.t = 0; chk.x = n.x; chk.z = n.z;
              const c = crumbs[Math.max(0, crumbs.length - 4)];
              if (stuck && c && !this.onScreen(n.x, n.y + 1, n.z) && !this.onScreen(c.x, p.y + 1, c.z) && this.spotFree(c.x, c.z, p.y)) n.teleport(c.x, c.z, p.yaw);
            }
          }
          idx++;
        }
      } else if (n.walkTo) {
        // Walks are straight lines: someone pressed against a hedge or a wall makes no progress.
        // Then a mission NPC on the way to wait somewhere (walkStay) is put there once Ove can't
        // see it (or skips to the next point of the walk), and anyone else gives the walk up and is
        // free again (placeNpcs takes them home out of sight).
        const chk = (n.walkChk ||= { t: 0, x: n.x, z: n.z });
        chk.t += h;
        if (chk.t > 3) {
          const stuck = dist(n.x, n.z, chk.x, chk.z) < 0.3;
          chk.t = 0; chk.x = n.x; chk.z = n.z;
          if (stuck) {
            const end = n.walkPath?.length ? n.walkPath[n.walkPath.length - 1] : n.walkTo;
            if (n.walkStay && dist(n.x, n.z, p.x, p.z) > 25 && !this.inDialog) { n.teleport(end.x, end.z, n.walkYaw ?? n.yaw); n.walkPath = []; n.walkTo = { x: end.x, z: end.z }; }
            else if (n.walkStay && n.walkPath?.length) n.walkTo = n.walkPath.shift();
            else if (!n.walkStay) { n.walkTo = null; n.walkPath = null; n.busy = false; n.homeX = undefined; n.walkSpeed = null; n.walkChk = null; n.step(h, this); continue; }
          }
        }
        const d = dist(n.x, n.z, n.walkTo.x, n.walkTo.z);
        if (d < 0.8 && n.walkPath?.length) n.walkTo = n.walkPath.shift();
        else if (d < 0.8) {
          n.walkTo = null;
          // A mission NPC who walked somewhere to wait (walkNpc with stay) stays put and busy.
          if (n.walkStay) { n.walkStay = false; n.yaw = n.walkYaw ?? n.yaw; }
          else { n.busy = false; n.homeX = undefined; }
          n.walkSpeed = null; n.walkChk = null;
        } else { const sp = n.walkSpeed || (n.wheelchair ? 1.0 : 1.4); n.wishX = ((n.walkTo.x - n.x) / d) * sp; n.wishZ = ((n.walkTo.z - n.z) / d) * sp; }
      } else if (!n.busy && n.homeX !== undefined && n.state === 'normal') {
        // Pushed a little out of place: shuffle back.
        const d = dist(n.x, n.z, n.homeX, n.homeZ);
        if (d > 1.0 && d < 25) { n.wishX = ((n.homeX - n.x) / d) * 1.2; n.wishZ = ((n.homeZ - n.z) / d) * 1.2; }
      }
      n.step(h, this);
    }
  }

  // Could the camera see (x, y, z)? (in front of it and inside the picture, ignoring walls)
  onScreen(x, y, z) {
    _v.set(x, y, z).project(camera);
    return _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
  }

  // The kick lands: a car's tyre (thunk, an opinion), a prop (breaks; Ove pays), or a person
  // (who objects; nobody gets knocked over by Ove's boot).
  kickHit() {
    const p = this.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const kx = p.x + fx * 0.7, kz = p.z + fz * 0.7;
    for (const c of this.cars) {
      if (Math.abs(c.x - kx) > 6 || Math.abs(c.z - kz) > 6) continue;
      if (circleVsObb(kx, kz, 0.45, c.obb, {})) { this.kickTyre(c, fx, fz); return; }
    }
    // One boot, one prop: the nearest (a stack of boxes by the door used to go all at once).
    const ps = propsNear(kx, kz, 0.6);
    if (ps.length) {
      let pr = ps[0];
      for (const q of ps) if (dist(q.x, q.z, kx, kz) < dist(pr.x, pr.z, kx, kz)) pr = q;
      this.breakProp(pr, fx * 6, fz * 6, 'kick');
      return;
    }
    audio.kick();
    for (const ped of this.peds) {
      const c = ped.char;
      if (c.state === 'normal' && dist(c.x, c.z, kx, kz) < 1.1) { c.vx += fx * 2.5; c.vz += fz * 2.5; ped.idleT = 1.5; this.say(c, pick(KICKED), 1.5); }
    }
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.state !== 'normal' || n.car || dist(n.x, n.z, kx, kz) >= 1.2) continue;
      // Rune's wheelchair rolls off (game/rune.js); he says so, as anyone would.
      if (n.wheelchair) this.rune.kick(n, fx, fz);
      this.say(n, pick(KICKED_NEIGHBOUR), 1.5);
    }
  }
  kickTyre(c, fx, fz) {
    audio.kick();
    audio.thud();
    // The car rocks on its springs a little (a parked car asleep would only rock later, when
    // something else woke it: wake it now).
    c.wake?.();
    const cfx = Math.sin(c.yaw), cfz = Math.cos(c.yaw);
    const side = Math.sign(fx * cfz - fz * cfx) || 1;
    c._sus.rv += side * 0.45;
    c._sus.hv -= 0.12;
    fx_snowPuff(c, this.player);
    if (this.time - this.tyreT > 1.4) {
      this.tyreT = this.time;
      this.say(this.player, pick(TYRE[c.name] || TYRE[c.kind] || TYRE.default), 1.8);
    }
  }

  // Cars against people. Only a car that itself drives into someone knocks them over (Ove walking
  // briskly into a parked car just stops; it used to count his own speed and fling him). Children,
  // Rune and the neighbours are never knocked over, and nobody lying on the road is pushed along in
  // front of a bumper: they are shoved out sideways and the car slows as if it hit something soft.
  carsVsPeople() {
    const hit = _hit;
    const chars = this.allChars(this._chars ||= []);
    const a = this.byX(), R = 2 * this._rmax + 1.5;
    // Trailers (Patrick's) are solid too: nobody walks into one, and a towed one shoves people aside
    // like a car's flank (it was never tested: Ove could stand inside it, and it passed through
    // pedestrians). Few cars have one: a short list, not the x-sorted band (a trailer reaches ~5 m
    // behind its car's own extent).
    const trs = (this._trs ||= []);
    trs.length = 0;
    for (const c of this.cars) if (c.trailer && !c.dead) trs.push(c);
    for (const ch of chars) {
      // (a ragdoll in the air or tumbling meets the cars point by point: actors/ragdoll.js)
      if (ch.state === 'seated' || ch.state === 'hidden' || ch.solid === false || (ch.rag && ch.state === 'flung')) continue;
      const pushed = !!this.companions.get(ch)?.push && !this.playerCar;
      for (let i = this.firstX(ch.x - R); i < a.length; i++) {
        const car = a[i];
        if (car.x - car.radius > ch.x + 1.5) break;
        if (Math.abs(car.x - ch.x) > car.radius + 1 || Math.abs(car.z - ch.z) > car.radius + 1) continue;
        if (ch.y > car.y + car.height - 0.3) continue;
        if (!circleVsObb(ch.x, ch.z, ch.r, car.obb, hit)) continue;
        // How fast the car itself comes at them (the person's own walking doesn't count).
        const carIn = car.vx * hit.nx + car.vz * hit.nz;
        // Rune on his errand is mortal (game/rune.js): pushed or not, what knocks anyone else over
        // kills him.
        if (ch.mortal && !ch.dead && ch.state === 'normal' && carIn > RUNE_KILL.carIn && car.speed > RUNE_KILL.speed) { this.rune.hit(ch, car, hit); continue; }
        if (ch.state === 'normal' && !ch.invulnerable && !pushed && carIn > 4.5 && car.speed > 3) {
          const sp = car.speed;
          ch.x += hit.nx * hit.depth; ch.z += hit.nz * hit.depth;
          // (Ove: swept off his feet, the legs first)
          const vx = car.vx * 0.9 + hit.nx * 2.5, vz = car.vz * 0.9 + hit.nz * 2.5, vl = Math.hypot(vx, vz) || 1, w = 2 + sp * 0.15;
          if (ch.fling(vx, 3.5 + sp * 0.18, vz, ch === this.player ? { spin: [-vz / vl * w, 0, vx / vl * w], lie: 1.4, why: 'hit' } : undefined)) {
            car.vx *= 0.94; car.vz *= 0.94;
            this.onCharHit(ch, car, carIn);
          }
        } else if (carIn > 1 || ch.state !== 'normal') {
          this.shoveAside(ch, car, hit, carIn);
        } else {
          // Someone walks into a car that stands still (or barely creeps): they just stop.
          ch.x += hit.nx * hit.depth; ch.z += hit.nz * hit.depth;
          const vn = ch.vx * hit.nx + ch.vz * hit.nz;
          if (vn < 0) { ch.vx -= hit.nx * vn; ch.vz -= hit.nz * vn; }
        }
      }
      for (let i = 0; i < trs.length; i++) {
        const car = trs[i], t = car.trailer, reach = t.len / 2 + 1;
        if (Math.abs(t.x - ch.x) > reach || Math.abs(t.z - ch.z) > reach || ch.y > t.y + 1.0) continue;
        if (!circleVsObb(ch.x, ch.z, ch.r, t.obb, hit)) continue;
        const carIn = car.vx * hit.nx + car.vz * hit.nz;
        if (carIn > 1 || ch.state !== 'normal') this.shoveAside(ch, car, hit, carIn, t.obb);
        else {
          ch.x += hit.nx * hit.depth; ch.z += hit.nz * hit.depth;
          const vn = ch.vx * hit.nx + ch.vz * hit.nz;
          if (vn < 0) { ch.vx -= hit.nx * vn; ch.vz -= hit.nz * vn; }
        }
      }
    }
    // Keep the player from walking through people (and the one he pushes from pushing back).
    if (!this.playerCar) {
      const p = this.player, pushed = this.pushedNpc();
      for (const ch of chars) {
        if (ch === p || ch === pushed || ch.state !== 'normal') continue;
        const dx = p.x - ch.x, dz = p.z - ch.z, d = Math.hypot(dx, dz), R = p.r + ch.r;
        if (d < R && d > 0.001 && Math.abs(p.y - ch.y) < 1.2) {
          const push = (R - d) / 2;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
          ch.x -= (dx / d) * push; ch.z -= (dz / d) * push;
        }
      }
    }
  }

  // Out of the way sideways (the side of the car they are already on), not along the bumper's
  // normal: a car can never carry anyone. The car loses speed on every contact frame. (o: the box that
  // touched them - the car's, or its trailer's.)
  shoveAside(ch, car, hit, carIn, o = car.obb) {
    const rx = -o.fz, rz = o.fx;
    const lat = (ch.x - o.x) * rx + (ch.z - o.z) * rz;
    if (Math.abs(hit.nx * rx + hit.nz * rz) > 0.7) {
      // Against the car's flank: the plain push out is sideways already.
      ch.x += hit.nx * hit.depth; ch.z += hit.nz * hit.depth;
    } else {
      if (Math.abs(lat) > 0.05 || !ch.shoveSide) ch.shoveSide = Math.sign(lat) || (Math.random() < 0.5 ? -1 : 1);
      const side = ch.shoveSide;
      const need = o.hx + ch.r + 0.03 - Math.abs(lat);
      const mv = clamp(need, 0, 0.22);
      ch.x += rx * side * mv; ch.z += rz * side * mv;
      // A little of the push out along the bumper, so they don't sink into it meanwhile.
      ch.x += hit.nx * hit.depth * 0.35; ch.z += hit.nz * hit.depth * 0.35;
      if (ch.state === 'normal') { const v = Math.max(2.5, Math.min(4.5, carIn)); ch.vx = rx * side * v; ch.vz = rz * side * v; }
    }
    if (carIn > 0.5) {
      const k = ch.state === 'normal' ? 0.86 : 0.8;
      car.vx *= k; car.vz *= k;
    }
    // Ove's car shoved one of the neighbours or a child: they say so, and it costs a little.
    if (car === this.playerCar && ch.state === 'normal' && carIn > 2.5 && this.time > (ch.shovedT || 0)) {
      ch.shovedT = this.time + 3;
      this.patrol.addOrdning(-3);
      audio.thud();
      const kid = ch.def.kind === 'kid' || (ch.def.age ?? 30) < 13;
      if (ch.key !== 'rune') this.say(ch, pick(kid ? SHOVED_KID : SHOVED), 1.8);
    }
  }

  syncAll(dt, title) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const c of this.cars) {
      const d2 = (c.x - cx) ** 2 + (c.z - cz) ** 2;
      c.root.visible = d2 < 320 * 320;
      if (c.root.visible) c.sync(dt);
    }
    // Pedestrians beyond 190 m are not drawn, and are taken out of the scene graph altogether: their
    // ~45 bones each were a third of the scene's per-frame matrix updates (they walk on regardless).
    for (const ped of this.peds) {
      const c = ped.char;
      const d2 = (c.x - cx) ** 2 + (c.z - cz) ** 2, vis = d2 < 190 * 190;
      c.root.visible = vis;
      if (vis !== (c.root.parent === scene)) { if (vis) scene.add(c.root); else scene.remove(c.root); }
      if (vis) c.sync(dt);
    }
    const p = this.player, fp = this.playerCar || p;
    const talker = this.talker;
    const running = this.missions.state === 'running';
    for (const k in this.npcs) {
      const n = this.npcs[k];
      const near = dist(n.x, n.z, fp.x, fp.z);
      // (talking: in the dialogue box, or while their voice says a line; the jaw follows a clip)
      const vu = voice.talking(k);
      n.anim.talk = talker === k || !!vu;
      n.anim.mouth = vu ? vu.mouth() : null;
      const giver = this.missions.offered?.giver === k;
      // Elsewhere today: hidden at home (see npcAway). Nobody vanishes in front of Ove, and nobody
      // who is away comes back into view (a new day hides them at once: placeNpcs(true)). The title
      // keeps them as loading left them (it used to un-hide them every frame: Patrick stood at his
      // door on a continued day-2 morning, though Parvaneh's intro says the ambulance took him).
      const away = this.npcAway(k) && (title || near > 25 || this.missions.state !== 'idle' || n.state === 'hidden');
      if (away && n.state === 'normal' && !n.car && !this.companions.has(n)) { n.state = 'hidden'; n.root.visible = false; }
      else if (!away && n.state === 'hidden') { n.state = 'normal'; n.root.visible = true; }
      n.anim.wave = (!title && giver && near < 9 && !this.inDialog && n.state === 'normal') || !!n.honk?.wave;
      const comp = this.companions.get(n);
      n.anim.push = false;
      // Anita without Rune; Rune's body, gone once Ove has gone off (game/rune.js).
      if (k === 'anita') this.rune.grief(n, dt, near);
      else if (n.dead) this.rune.bury(n, near);
      // (Rune on his errand doesn't turn his chair to face Ove: he sits as he rolled, so a boot from
      // behind rolls him on forwards - game/rune.js)
      if (!title && n.state === 'normal' && !comp && !n.walkTo && !this.inDialog && !n.honk && !n.roll && !n.mortal) {
        if (near < 9 && !this.playerCar) n.yaw = dampAngle(n.yaw, yawTo(p.x - n.x, p.z - n.z), 3, dt);
        else if (n.homeYaw !== undefined && n.speed < 0.3) n.yaw = dampAngle(n.yaw, n.homeYaw, 1.5, dt);
        if (near < 7 && !this.playerCar && !running) {
          n.chatT = (n.chatT ?? 1.5 + Math.random() * 4) - dt;
          // One neighbour at a time: nobody talks over anybody else.
          // Not within 6 m of the day's giver either (the intro would cut it off), and not over anybody.
          const gv = this.missions.offered && this.npc(this.missions.offered.giver);
          // Nor while Ove is talking with somebody, nor for 20 s after he has had enough of them (chat).
          const hush = (gv && dist(gv.x, gv.z, p.x, p.z) < 6) || !voice.quiet() || !!this.chatX || (n.chatLock || 0) > this.time;
          if (n.chatT <= 0 && this.time > (this.chatGlobalT || 0) && !hush) {
            n.chatT = 16 + Math.random() * 10; this.chatGlobalT = this.time + 4.5;
            const line = this.pickChatter(n), u = this.say(n, line, 2.8);
            if (u) this.chatGlobalT = Math.max(this.chatGlobalT, this.time + u.dur + 1);
            // Now and then Ove, close by on foot, answers as he would to E (but not turning to them, and
            // no more after that); a silence is nothing at all.
            if (near < 4 && p.state === 'normal' && !this.inDialog && Math.random() < 0.35) {
              const r = this.chatReply(k, line);
              if (r.text) this.chatX = { n, u, steps: [['ove', r.text]], i: 0, due: u ? 0 : this.time + 2, ms: this.missions.state, self: true };
            }
          }
        } else if (near > 14) n.chatT = undefined;
      }
      n.sync(dt);
    }
    // Ove: notebook, phone, pushing / carrying, footsteps.
    const ou = voice.talking('ove');
    p.anim.talk = talker === 'ove' || !!ou;
    p.anim.mouth = ou ? ou.mouth() : null;
    p.anim.write = !title && !this.playerCar && !!this.patrol.writing;
    p.anim.phone = !this.playerCar && this.interrupts.onPhone;
    this.poseT -= dt;
    const posing = this.poseT > 0 && !this.playerCar;
    p.anim.push = !this.playerCar && (!!this.pushedNpc() || (posing && this.pose === 'push'));
    p.anim.carry = !this.playerCar && !!this.carrying?.root && !p.anim.push;
    p.anim.work = posing && this.pose === 'work';
    // (the garage door's pose keeps its kind while it fades out: it would bend over on the way)
    p.anim.workKind = p.anim.work ? this.poseKind || 'bend' : p.anim.workKind === 'door' ? 'door' : null;
    if (p.anim.work && this.poseKind === 'door') { p.anim.reach = this.poseReach; p.anim.tug = this.poseTug || 0; }
    if (posing && this.pose === 'write') p.anim.write = true;
    p.sync(dt);
    if (!title) {
      const ph = Math.floor((p.model.phase || 0) / Math.PI);
      if (ph !== this.stepPh && !this.playerCar && p.onGround && p.state === 'normal' && p.speed > 0.6) audio.step(this.surfaceAt(p.x, p.z));
      this.stepPh = ph;
    }
    // The cat in Ove's arms (the people area's carry pose: between his forearms, lying across
    // them; on the passenger seat, i.e. out of sight, when he drives).
    if (this.carrying?.root) {
      const c = this.carrying, r = c.root;
      r.visible = !this.playerCar;
      if (typeof c.hold === 'function' && c._held !== !this.playerCar) { c._held = !this.playerCar; c.hold(c._held); }
      if (!this.playerCar) {
        if (p.anim.carry) {
          p.root.updateMatrixWorld(true);
          // carryPoint is where the held cat's root goes: cat.hold(true) puts its belly on the forearm.
          carryPoint(p.model, _v);
          r.position.copy(_v);
        } else {
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          r.position.set(p.x + fx * 0.36, p.y + 0.86, p.z + fz * 0.36);
        }
        r.rotation.set(0, p.yaw + Math.PI / 2, 0);
        c.animate?.(dt, 0);
      }
    }
    if (this.homeCat) {
      // "Din katt har rymt!": not by the door while Sara's errand has Ove looking for it.
      const home = this.interrupts.active?.tpl.id !== 'katten';
      this.homeCat.root.visible = home;
      if (home && dist(this.homeCat.root.position.x, this.homeCat.root.position.z, camera.position.x, camera.position.z) < 60) this.homeCat.animate(dt, 0);
    }
    // (a few times a second is plenty: it only moves people Ove can't see; at once when the day's
    // offer changes, so the giver is at the mission's spot straight away)
    if (!title && this.missions.state === 'idle') {
      const off = this.missions.offered?.id || null;
      if (this.frame % 10 === 0 || off !== this._offId) { this._offId = off; this.placeNpcs(); }
    }
  }

  // A scene that plays someone with a puppet (day 3's kitchen, luftning.js) takes the real one off
  // the stage meanwhile, and puts them back after as their state says (shown unless 'hidden'), never
  // as they happened to be when it began: hideNearCamera may have hidden them for that one frame, and
  // putting that back kept Anita invisible for the rest of the game (fixa_outro_anita).
  offstage(ch, off) {
    if (!ch?.root) return;
    ch.offstage = !!off;
    ch.root.visible = !off && ch.state !== 'hidden';
  }

  // Nobody's head fills the screen: anyone the camera has ended up inside (a neighbour standing
  // right behind Ove at a wall) is hidden for that frame. Ove himself never is.
  hideNearCamera() {
    const hidden = (this._camHidden ||= []);
    // Restored whatever happened since (seated in a car included: a seat keeps the root's own
    // visibility, so someone hidden the frame before a scene seated them stayed invisible), except
    // whoever a scene has taken off the stage since (offstage: they come back when it ends).
    for (const ch of hidden) if (ch.state !== 'hidden' && !ch.offstage) ch.root.visible = true;
    hidden.length = 0;
    if (this.cam.cine || this.aerial) return;
    const cp = camera.position;
    camera.getWorldDirection(_v);
    const hl = Math.hypot(_v.x, _v.z) || 1, vx = _v.x / hl, vz = _v.z / hl;
    // Within arm's reach of the lens, or with the upper body across the first 1.2 m of the view (an
    // arm waving in front of the camera beside a shed).
    const test = (ch) => {
      if (ch === this.player || ch.state === 'hidden' || ch.car || !ch.root.visible) return;
      if (Math.abs(ch.x - cp.x) > 2 || Math.abs(ch.z - cp.z) > 2) return;
      if (cp.y < ch.y - 0.3 || cp.y > ch.y + ch.height + 0.35) return;
      const dx = ch.x - cp.x, dz = ch.z - cp.z, along = clamp(dx * vx + dz * vz, 0, 1.2);
      if (Math.hypot(dx, dz) < ch.r + 0.75 || Math.hypot(dx - vx * along, dz - vz * along) < ch.r + 0.25) { ch.root.visible = false; hidden.push(ch); }
    };
    for (const k in this.npcs) test(this.npcs[k]);
    for (const p of this.peds) test(p.char);
  }

  // What Ove's boots are on, for the footstep sound (the world's ground map; a rough guess from
  // the street grid if it isn't there).
  surfaceAt(x, z) {
    if (townSurfaceAt) return townSurfaceAt(x, z);
    if (isRoad(x, z)) return 'asphalt';
    const mx = (((x + HALF) % P) + P) % P, mz = (((z + HALF) % P) + P) % P;
    if (Math.min(mx, P - mx) < RHW + SW || Math.min(mz, P - mz) < RHW + SW) return 'paving';
    return 'snow';
  }

  tickPickups(dt) {
    const f = this.focus();
    tickCans(dt, { x: f.x, y: f.y, z: f.z, r: this.playerCar ? 1.8 : 1.25 }, this);
    const take = (list, set, kind, notes) => {
      for (const c of list) {
        if (!c.alive) continue;
        c.tick(this.time, camera.position);
        const mp = c.mesh.position;
        if (dist(mp.x, mp.z, f.x, f.z) < (this.playerCar ? 2.6 : 1.4) && Math.abs(mp.y - (f.y + 1)) < 1.8) {
          c.remove();
          set.add(c.id);
          audio.jingle('record');
          FX.sparkle(mp.x, mp.y, mp.z, 0xfff1d0, 16);
          const n = set.size;
          this.lastFound = { kind, id: c.id };
          const icon = kind === 'emblem' ? '<span class="emblem-icon"></span>' : '<span class="photo-icon"></span>';
          const title = kind === 'emblem' ? 'Saab-emblem' : 'Sonjas fotografi';
          // (an emblem's note goes with the order found, a photograph's memory with its picture)
          const note = kind === 'emblem' ? notes[(n - 1) % notes.length] : notes[c.id % notes.length];
          hud.showCollect(`${icon}<span>${title} <b>${n}/7</b><br><span class="memory">${note}</span><small class="col-hint">Samlingen: <kbd>Esc</kbd></small></span>`, 6500);
          if (n === 7 && kind === 'emblem') { this.addCoins(150); setTimeout(() => hud.toast('Alla sju Saab-emblem. Ove hänger upp dem i garaget. +150 kr', 'good'), 2500); }
          if (n === 7 && kind === 'photo') setTimeout(() => hud.toast('Alla sju fotografierna. Ove ställer dem på hyllan i hallen. Där hör de hemma.', 'good'), 2500);
          this.save();
        }
      }
    };
    take(this.emblems, this.got.emblems, 'emblem', EMBLEM_NOTES);
    take(this.photos, this.got.photos, 'photo', PHOTO_NOTES);
  }

  mapMarkers(all = false) {
    // (the minimap's list is reused every other frame; the big map gets its own)
    const out = all ? [] : (this._mm ||= []);
    out.length = 0;
    const ms = this.missions;
    const f = this.playerCar || this.player;
    if (ms.offered) {
      const g = this.npc(ms.offered.giver);
      if (g) out.push({ type: 'mission', x: g.x, z: g.z, edge: true });
    }
    const t = ms.target();
    if (t && !t.follow) out.push({ type: 'objective', x: t.x, z: t.z, edge: true });
    if (t && t.follow) out.push({ type: ms.stage?.car?.isTarget ? 'enemy' : 'friend', x: t.x, z: t.z, edge: true });
    for (const m of ms.markers()) out.push(m);
    for (const m of this.interrupts.markers()) out.push(m);
    this.patrol.markers(all, out);
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.car || n.state === 'hidden' || ms.offered?.giver === k) continue;
      if (all || dist(n.x, n.z, f.x, f.z) < 70) out.push({ type: 'neighbour', x: n.x, z: n.z });
    }
    if (!all) {
      for (const e of this.emblems) if (e.alive && dist(e.x, e.z, f.x, f.z) < 45) out.push({ type: 'emblem', x: e.x, z: e.z });
      for (const p of this.photos) if (p.alive && dist(p.x, p.z, f.x, f.z) < 45) out.push({ type: 'photo', x: p.x, z: p.z });
    }
    return out;
  }
  mapLabels() { return townLabels.filter(([, key]) => landmarks[key]).map(([name, key]) => [name, landmarks[key].x, landmarks[key].z]); }

  updateMarkers() {
    const ms = this.missions;
    const f = this.focus();
    let target = null;
    if (ms.offered) {
      const g = this.npc(ms.offered.giver);
      if (g && !g.car && g.state === 'normal') {
        this.bang.show(true);
        this.bang.set(g.x, g.y + g.height + 0.9, g.z, this.time);
      } else this.bang.show(false);
    } else this.bang.show(false);
    let t = ms.target();
    if (!t) t = this.interrupts.target();
    if (t) {
      target = t;
      const y = t.follow ? groundAt(t.x, t.z, 0.2, 0.6) + 2.5 : groundAt(t.x, t.z, 0.2, 0.6);
      if (t.follow || t.noBeacon || this.inDialog) this.beacon.hide();
      else this.beacon.set(t.x, y, t.z, this.time, t.r || 3.2);
    } else this.beacon.hide();
    if (target && !this.inDialog && dist(target.x, target.z, f.x, f.z) > 6) {
      // The way there (street nodes) is planned every 4th frame, not every frame.
      let aim = this._aim;
      if (!aim || this.frame - this._aimF >= 4 || Math.abs(this._aimX - target.x) + Math.abs(this._aimZ - target.z) > 1.5) {
        aim = this._aim = routeAim(f.x, f.z, target.x, target.z);
        this._aimF = this.frame; this._aimX = target.x; this._aimZ = target.z;
        const r = (this.route ||= []);
        r.length = 0;
        for (const n of aim.nodes) r.push([nodeX(n), nodeZ(n)]);
        r.push([target.x, target.z]);
      }
      const top = this.playerCar ? f.y + this.playerCar.height + 1.5 : f.y + this.player.height + 0.9;
      this.arrow.set(f.x, top, f.z, yawTo(aim.x - f.x, aim.z - f.z), this.time);
    } else { this.arrow.hide(); this._aim = null; if (this.route) this.route.length = 0; }
  }

  // Free roam with nothing else on: a quiet standing objective (what to do, and how far the
  // nearest felparkering is), so the screen never goes blank once the start toasts are gone.
  patrolObjective() {
    if (this.missions.state !== 'idle' || this.interrupts.active || this.interrupts.call || this.patrol.pursuit || this.inDialog) return null;
    // (worked out every 10th frame: it is a quiet line, not a stopwatch)
    if (this._po && this.frame - this._poF < 10) return this._po;
    this._poF = this.frame;
    return (this._po = this.patrolObjectiveNow());
  }
  patrolObjectiveNow() {
    const f = this.focus(), open = this.patrol.open;
    let d = Infinity;
    for (const c of open) d = Math.min(d, dist(c.x, c.z, f.x, f.z));
    const parts = [];
    if (open.length) parts.push(`${open.length} ${open.length === 1 ? 'felparkering' : 'felparkeringar'} · närmaste ${d < 15 ? 'här intill' : `${Math.round(d / 10) * 10} m bort`}`);
    else parts.push('Lugnt i området. Misstänkt lugnt.');
    const giver = this.missions.offered?.giver;
    if (giver && this.npc(giver)?.state === 'normal') parts.push(`${CHARS[giver].name} vill dig något`);
    return { title: 'Patrullera', text: parts.join(' · '), quiet: true };
  }

  updateHud(dt) {
    hud.setObjective(this.missions.objective() || this.patrolObjective());
    hud.setErrand(this.interrupts.panel());
    hud.setSpeedo(this.playerCar);
    hud.setMeter(this.patrol.ordning);
    hud.setClock(this.clockText());
    let it = null;
    if (!this.failWait) {
      let prompt = '', hold = null;
      if (!this.inDialog && !this.overlay && (this.playerCar || this.player.state === 'normal')) {
        const parts = this._parts ||= [];
        parts.length = 0;
        const sp = this.stagePrompt();
        if (sp) { parts.push(sp.text); if (sp.hold != null) hold = sp.hold; }
        const pp = this.patrol.prompt();
        if (pp) parts.push(pp.text);
        if (!this.playerCar && !sp?.takesE) {
          it = this.nearestInteractable();
          if (it?.type === 'talk') parts.push(`<b>E</b> Prata med ${it.who.def.name}`);
          else if (it?.type === 'car') parts.push(it.car.driverBust ? '<b>E</b> Låna bilen' : '<b>E</b> Kliv in');
          else if (it?.type === 'ticket') parts.push('<b>E</b> Ta lappen');
          else if (it?.type === 'chat') parts.push(`<b>E</b> Småprata med ${it.who.def.name}`);
          else if (it?.type === 'garage') parts.push(`<b>E</b> ${it.open ? 'Öppna' : 'Stäng'} garageporten`);
        }
        // Stopped in a bay of a car park: the p-skiva (G), or what the bay is (game/pskiva.js).
        const kp = this.playerCar ? this.parking.prompt() : null;
        if (kp) parts.push(kp);
        // Driving up to the shut garage door (or out at it from inside): it doesn't open by itself.
        if (this.playerCar && this.garageAhead(this.playerCar)) parts.push('Garageporten är stängd · kliv ur (<b>E</b>) och öppna den');
        // Ove driving inside the car-free area: what it costs, for as long as he is in there (one
        // Anders shout a minute was all the feedback, and the meter fell 53 -> 16 in three minutes).
        const pc = this.playerCar;
        // (the snow tractor may: it clears the walkways)
        if (pc && this.patrol.passive && isCarFree(pc.x, pc.z)) parts.push(pc.spec.service ? 'Snöröjning · traktorn får köra på gångvägarna' : '<span class="pr-warn">Bilfritt område · −1 Ordning/s · Kliv ur och gå</span>');
        prompt = parts.join('<span class="pr-sep"> &nbsp;·&nbsp; </span>');
      }
      hud.setPrompt(prompt, hold);
    }
    // World tags: violations, the errand's people/cat, and names over the neighbours - only close by
    // (5 m), or the one an E would greet, or the day's giver within 12 m.
    const tags = this._tags ||= [];
    tags.length = 0;
    if (!this.inDialog) {
      this.patrol.tags(tags);
      for (const t of this.interrupts.tags()) tags.push(t);
      if (this.missions.state === 'running') for (const t of this.missions.stage?.tags?.(this) || []) tags.push(t);
      const f = this.playerCar || this.player, giver = this.missions.offered?.giver;
      for (const k in this.npcs) {
        const n = this.npcs[k];
        if (n.car || n.state !== 'normal') continue;
        const d = dist(n.x, n.z, f.x, f.z);
        if (d < 1.2 || !(d < 5 || (d < 12 && (k === giver || it?.who === n)))) continue;
        let dup = false;
        for (const t of tags) if (t.text === n.def.name) { dup = true; break; }
        if (!dup) tags.push({ x: n.x, y: n.y + n.height + 0.3, z: n.z, text: n.def.name, cls: 'neighbour' });
      }
    }
    hud.tags(tags);
    if (this.frame % 2 === 0) {
      const f = this.playerCar || this.player;
      hud.drawMinimap(f.x, f.z, this.cam.yaw, f.yaw, this.mapMarkers(false), this.route);
    }
    if (this.bigMap && this.frame % 10 === 0) hud.toggleBigMap(true, this);
    // (the day's scenes loaded as soon as it is offered: no wait before each line of the intro)
    const off = this.missions.offered;
    if (off !== this._prefetched) { this._prefetched = off; if (off) voice.prefetch([...this.missions.scene(off, 'intro'), ...(off.retryIntro || []), ...this.missions.scene(off, 'outro')]); }
    voice.update(this);
    hud.tickBubbles();
    if (this.penaltyT > 0) {
      this.penaltyT -= dt;
      if (this.penaltyT <= 0 && this.penaltyKr) { hud.toast(`Ove betalar för det han förstört: ${this.penaltyKr} kr`, 'bad'); this.penaltyKr = 0; }
    }
  }

  // A slide of 1.6 s or more (or 2 s of donut) in the player's car: once it is over, Ove has
  // something to say about it (at most every 40 s, never in a scene).
  slideTalk(dt) {
    const c = this.playerCar;
    if (!c || c.dead || this.inDialog || this.freezeCar) { this.slideT = this.donutT = 0; return; }
    if (c.pivot > 0.5) this.donutT = (this.donutT || 0) + dt;
    else if (c.drift > 0.5 && Math.abs(c.slip) > 0.3 && c.speed > 4) this.slideT = (this.slideT || 0) + dt;
    else if (c.drift < 0.05 && c.pivot < 0.05 && (this.slideT || this.donutT)) {
      const donut = this.donutT >= 2, long = donut || this.slideT >= 1.6;
      this.slideT = this.donutT = 0;
      if (!long || this.time < (this.slideSaidAt ?? -1e9) + 40) return;
      this.slideSaidAt = this.time;
      const lines = donut ? SLID.donut : Math.random() < 0.5 && SLID[c.kind] ? SLID[c.kind] : SLID.default;
      this.say(this.player, pick(lines), 2.2);
      this.murmur(CHARS.ove.voice);
    }
  }

  updateAudio() {
    const c = this.playerCar;
    if (c && !c.dead && !this.cold.engineOff) {
      // (in the air off the snow hill the wheels spin free: the engine revs up on the throttle, the
      // tyres are silent)
      const fl = c.flight ? 1 + 0.45 * c.ctrl.throttle : 1;
      audio.engine(true, c.revs, c.ctrl.throttle, Math.abs(c.forwardSpeed) * fl, c.flight ? 'air' : c.onSnow ? 'snow' : 'asphalt', c.kind);
      audio.skid(c.air ? 0 : c.skidAmt, c.onSnow ? 'snow' : 'asphalt');
      audio.horn(this.horn.down, c.kind);
      // (no tracks drawn on the snow hill: they lie flat at the ground's height)
      if (c.skidAmt > 0.3 && !c.air && !c.hill) {
        this.skidT = (this.skidT || 0) - 1;
        if (this.skidT <= 0) {
          this.skidT = 2;
          const fx_ = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx_;
          const bz = -c.spec.len / 2 + c.spec.wheelR + 0.4, bx = c.spec.wid / 2 - 0.14;
          for (const s of [-1, 1]) {
            const x = c.x + fx_ * bz + rx * bx * s, z = c.z + fz * bz + rz * bx * s, k = this.surfaceAt(x, z);
            // (on snow the ruts show the slide: game/tracks.js widens them as the tyres go sideways)
            if (k === 'snow' && tracks.on) continue;
            FX.skid(x, z, c.yaw, undefined, k === 'snow' ? 'snow' : 'asphalt');
          }
          // a real slide or a donut throws up spray (powder off the snow, salty mist off the asphalt)
          if ((c.drift > 0.5 || c.pivot > 0.5) && c.skidAmt > 0.6 && (this.frame & 2)) {
            const s = this.frame & 4 ? 1 : -1, wz = -c.spec.len / 2 + c.spec.wheelR + 0.5;
            FX.dust(c.x + fx_ * wz + rx * bx * s, c.z + fz * wz + rz * bx * s, c.onSnow ? 2 : 1, 0.25);
          }
        }
      }
    } else {
      audio.engine(false, 0, 0);
      audio.skid(0);
      audio.horn(false);
    }
    // The score (audio.music): what is going on decides the cue. The old fixed duck stays for the
    // generative piano under a chase or a call; a composed cue is mixed for its moment.
    const ms = this.musicState();
    audio.music(ms, { day: this.storyDayNow() });
    // (a stage's own cutscene with its own sounds - day 3's radiator - wants the music well back)
    // (and out in the cold the music steps back too: game/cold.js musicDuck)
    audio.duckMusic((this.missions.stage?.hush ? 0.3 : audio.musicCue === 'piano' && (this.patrol.pursuit || this.interrupts.call) ? 0.5 : 1) * this.cold.musicDuck);
  }
  // What the music should be doing (audio.music's states): the day's race, Vita skjortan's Škoda
  // (day 6's chase, day 7's chaser), the drive to the hospital against the clock, Sonja's grave and
  // the last outro, a mission, a smitare, an errand or a call, else the patrol's playlist.
  musicState() {
    const m = this.missions, st = m.stage, def = m.m?.def;
    if (m.state === 'idle' || !def) {
      if (this.patrol.pursuit) return 'pursuit';
      if (this.interrupts.active || this.interrupts.call) return 'errand';
      return 'roam';
    }
    const last = def.stages && m.stageI >= def.stages.length - 1;
    if (def.id === 'varkarna' && (m.state === 'outro' || (m.state === 'running' && last))) return 'finale';
    if (m.state === 'intro' || m.state === 'outro') return 'roam';
    if (st?.kind === 'race') return 'race';
    if (st?.kind === 'destroy' || st?.chaser) return 'chase';
    if (def.id === 'sjukhuset' && st?.kind === 'goto' && st.t != null) return 'hurry';
    return 'mission';
  }
  storyDayNow() { const m = this.missions; return Math.max(1, m.index + (m.gateOpen && m.index < MISSIONS.length ? 1 : 0)); }

  // Replace traffic that has been wrecked or wandered off far away.
  recycleTraffic(dt) {
    this.recycleT = (this.recycleT || 0) - dt;
    if (this.recycleT > 0) return;
    this.recycleT = 2;
    const f = this.focus();
    const free = this.missions.state === 'idle' && !this.interrupts.active;
    for (const c of this.cars.slice()) {
      if (c === this.playerCar || c.locked) continue;
      if (c.dead) {
        c.deadT = (c.deadT || 0) + 2;
        if (c.deadT > 20 && dist(c.x, c.z, f.x, f.z) > 60) {
          // A named car is never gone for good (Ove's wrecked Saab used to vanish until a reload): a
          // new one stands at home once nobody sees either spot.
          if (c.name) {
            if (this.named[c.name] === c && free && (!c.home || dist(c.home.x, c.home.z, f.x, f.z) > 60)) this.respawnNamed(c.name);
            continue;
          }
          this.removeCar(c);
          if (c.traffic) this.spawnTrafficCar(Math.random, f);
        }
        continue;
      }
      // A borrowed traffic car left somewhere goes once it is far away and out of mind (each one
      // used to stay for good: every "lånad" car added one to the world, and to the physics).
      if (c.wasTraffic && free && !c.driver && !c.passengers.length && this.time - (c.leftAt ?? -1e9) > 30 && dist(c.x, c.z, f.x, f.z) > 120) this.removeCar(c);
    }
    // A named car Ove left out beyond where the walls stood goes home once nobody sees it.
    for (const c of this.cars) if (c.name && !c.dead && c !== this.playerCar && (Math.abs(c.x) > BOUND || Math.abs(c.z) > BOUND)) this.rehome(c);
    for (const c of this.rehoming || []) {
      if (c === this.playerCar || c.dead || !c.home) { this.rehoming.delete(c); continue; }
      if (dist(c.x, c.z, f.x, f.z) > 110 && dist(c.home.x, c.home.z, f.x, f.z) > 60) { c.place(c.home.x, c.home.z, c.home.yaw); c.ctrl.park = true; this.rehoming.delete(c); }
    }
    const traffic = this.cars.filter((c) => c.traffic && !c.dead).length;
    if (traffic < 20) this.spawnTrafficCar(Math.random, f);
  }
}

// A little snow knocked off the tyre.
function fx_snowPuff(c, p) {
  const fx2 = Math.sin(p.yaw), fz2 = Math.cos(p.yaw);
  FX.dust(p.x + fx2 * 0.8, p.z + fz2 * 0.8, 2, c.y + 0.3);
}

function frame() { return new Promise((r) => requestAnimationFrame(() => r())); }
function setLoading(text) {
  const el = document.getElementById('loading');
  if (!el) return;
  if (text) el.textContent = text;
  else el.classList.add('done');
}

const game = new Game();
window.__game = game;
window.__lm = lm;
window.__props = allProps;
window.__stages = stages;
window.__stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, aoCalls: gfxStats.aoCalls, cpuMs: +gfxStats.ms.toFixed(2), geos: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, cars: game.cars.length });
game.init().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Något gick sönder: ' + e.message;
});

// Title and pause screen buttons (the pause menu's toggles are wired by hud.js).
document.getElementById('play').addEventListener('click', () => game.start());
document.getElementById('resume').addEventListener('click', () => game.pause(false));
