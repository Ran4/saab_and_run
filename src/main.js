// Saab & Run — glue: builds the town, runs the fixed-step simulation, routes input to Ove or his
// car, and wires up the patrol (felparkeringar, smitare, the Ordning meter), the avbrott (the
// neighbours' calls), the story missions, pickups, the neighbours and the HUD.

import { THREE, initGfx, renderer, scene, camera, followSun, tickSky, renderFrame, gfxReady, gfxStats } from './gfx.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { buildTown, parkedCars, tickTown, litterSpots, collectibleSpots, mapLabels as townLabels, surfaceAt as townSurfaceAt } from './world/town.js';
import { finalizeProps, tickProps, breakProp, propsNear, props as allProps } from './world/props.js';
import { lm, landmarks, routeAim, N, LANE, RHW, SW, nodeX, nodeZ, neighbors, BOUND, isRoad, isCarFree, HALF, P } from './world/layout.js';
import { groundAt, queryBlocks, contains, circleVsObb } from './world/collision.js';
import { Car, collideCars } from './actors/car.js';
import { Character } from './actors/character.js';
import { CHARS, buildBust, randomPed, buildCat, carryPoint } from './actors/models.js';
import { AIDriver } from './actors/drivers.js';
import { spawnPeds } from './actors/peds.js';
import { initCans, tickCans, Collectible } from './actors/pickups.js';
import { fx as FX } from './game/fx.js';
import { hud, renderPortrait } from './game/hud.js';
import { CamRig } from './game/camera.js';
import { Patrol } from './game/patrol.js';
import { Interruptions } from './game/interruptions.js';
import * as stages from './game/stages.js';
import { MissionRunner, MISSIONS } from './game/missions.js';
import { Bang, Beacon, GuideArrow } from './game/markers.js';
import { clamp, dist, yawTo, pick, dampAngle, angleDiff } from './util.js';

const STEP = 1 / 60;
const SAVE_KEY = 'saab-and-run-v1';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// On foot (DESIGN 4.4): walk, rask gång, one small jump, kick a tyre.
// Pushing Rune's wheelchair: 3.0, or 3.6 with Shift (2.2 made the errand a 50 s crawl).
const WALK = 3.2, BRISK = 5.5, PUSH = 3.0, PUSH_BRISK = 3.6, JUMP_V = 5.4;
const CLOCK_RATE = 0.25;   // in-game minutes per real second: an hour every four minutes

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

const CHATTER = {
  parvaneh: ['Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket.', 'Ove, du ser nästan glad ut idag.', 'Patrick har klättrat upp på en stege igen. Titta inte.', 'Tack för hjälpen med släpet. Igen.'],
  patrick: ['Hej Ove! Jag skulle bara... nej, det var inget.', 'Släpet står lite snett, va?', 'Jag är IT-konsult. Det är som ett jobb, fast...', 'Har du en insexnyckel? Jag ska bara montera en garderob. Tror jag.'],
  sara: ['Ove! Kom och bygg snögubbe!', 'Varför är du alltid så arg?', 'Mamma säger att du är snäll inuti.', 'Katten tycker om dig.'],
  nasanin: ['Ove! Ove! Ove!', 'Katten!', 'Snö!', 'Ove, titta!'],
  jimmy: ['Tjena Ove! Har du ätit frukost?', 'Ove, min man!', 'Jag kör nyttigt nu. Typ.', 'Fin morgon, va?'],
  adrian: ['Ove, vad tycker du om Audi?', 'Jag ska köpa bil snart. Vad köper man?', 'Kan du lära mig byta däck någon gång?'],
  anita: ['God morgon, Ove.', 'Rune sov dåligt i natt.', 'Tack för igår, Ove.', 'Han frågar efter dig ibland. På sitt sätt.'],
  rune: ['...', 'Hm.', '...Ove.', 'Volvo.'],
  anders: ['Ove! Har du sett min nya Audi?', 'Föreningen har nya regler, Ove. Jag mejlar.', 'Morsning, Ove. Fint väder för en promenad.', 'Vi borde ha en bom vid infarten, tycker du inte?'],
  vitskjorta: ['Vi har papper på allt.', 'Det här är en kommunal angelägenhet.', 'Ha en bra dag. Tills vidare.'],
};
// Later in the week some of them have news (from the day after the given day's mission on).
const CHATTER_AFTER = {
  patrick: [2, ['Armen kliar under gipset. Hela tiden.', 'Parvaneh säger att jag inte får gå upp på stegar mer. Någonsin.', 'Tack för att du körde Parvaneh. Jag var... upptagen.']],
  parvaneh: [2, ['Första körlektionen på måndag, Ove! Jag har köpt en L-skylt.', 'Patrick försöker knyta skorna med en hand. Det är som en film.']],
  anita: [3, ['Det är så varmt hos oss nu, Ove.', 'Rune sa "Saab" igen i morse. Bara så där.']],
  rune: [3, ['...Saab.']],
  jimmy: [4, ['Hur mår katten? Har den fått ett namn än?', 'Jag köpte kattmat. Jag köpte för mycket kattmat.']],
  adrian: [5, ['Saaben startade på första försöket i morse!', 'Jag har kollat trösklarna. Två gånger.']],
  anders: [5, ['Audin var på service. Det var inget fel på den. Alls.', 'Två Saabar i föreningen nu. Fantastiskt.']],
  vitskjorta: [6, ['Vi ses, Ove. Vi har tid.', 'Underskriften är på väg. Den är på väg.']],
};
const OVE_REPLY = ['Hmpf.', 'Jaha.', 'Mm.', 'Jaså.', 'Nej.', 'Det får vi se.'];
const OUCH = ['Aj!', 'Är du inte klok?!', 'Min höft!', 'Vad håller du på med?!', 'Jag ringer polisen!', 'Kör som folk!', 'Galning!', 'Hallå där!'];
const GETUP = ['Jag ska anmäla dig.', 'Pensionärer i bil, alltså.', 'Min rygg...', 'Det här var inte okej.', 'Jag mår bra. Jag mår BRA.'];
const CARJACK = ['Hallå! Min bil!', 'Den där gubben tog min bil!', 'Polis! Polis!', 'Men snälla! Jag ska till jobbet!'];
const KICKED = ['Hallå!', 'Vad gör du?', 'Akta dig!', 'Ove!'];
// Shoved aside by Ove's car (children and the neighbours are never knocked over).
const SHOVED = ['Akta!', 'Hallå!', 'Ove! Titta dig för!', 'Är du inte klok, Ove?!', 'Kör som folk, Ove!'];
const SHOVED_KID = ['Aj!', 'Akta!', 'Ove!', 'Hallå!'];
const TYRE = {
  saab900: ['Bra däck.', 'Så ska en bil se ut.', 'Ordentligt.'],
  volvo240: ['Volvo. Jaja.', 'Rune hade en sån. Typiskt.'],
  volvo740: ['Volvo. Jaja.', 'Lite luft i det här.'],
  audi: ['Plast och elektronik.', 'Tyskt krafs.', 'Anders har en sån. Det säger väl allt.'],
  bmw: ['Plast och elektronik.', 'BMW. Hmpf.'],
  bus: ['Hmpf.'],
  default: ['Japansk skit.', 'Slitna. Typiskt.', 'Hmpf.', 'Lite luft i det här.', 'Ingen kollar lufttrycket nu för tiden.'],
};
// Saab emblems: Ove's notes. Sonja's photographs: short memories (warm, a little sad, never more).
const EMBLEM_NOTES = [
  'Riktig plåt. Inte som nu för tiden.',
  'Från en 99:a. Någon hade slängt det. Idioter.',
  'Griphuvudet. Ove putsar det med tummen.',
  'Från en 96:a. Sonja sa att den lät som en symaskin. Hon hade fel.',
  'En man ska ha en ordentlig bil.',
  'Trollhättan, 1986. Han körde dit bara för att titta på fabriken.',
  'Det sista. Nu är samlingen hel. Ove säger ingenting.',
];
const PHOTO_NOTES = [
  'Sonja, 1984. Tåget till Göteborg. Hon skrattade åt honom hela vägen.',
  'Sonja i Saaben, 1988. Hon ville byta radiokanal. Han lät henne. En gång.',
  'Sonja på skolavslutningen. Hela klassen hade ritat henne.',
  'Sonja och Ove i Spanien. Hon i solen. Han i skuggan, med en karta.',
  'Bröllopsdagen. Hon sa ja innan han hunnit fråga ordentligt.',
  'Sonja i trädgården. Hon planterade blommor där han ville ha grus. Blommorna vann.',
  'Sonja, en vanlig tisdag. Han vet inte varför han tog bilden. Han är glad att han gjorde det.',
];
// Ove's Saab always wears the same plate (the player looks at it all game). Valid Swedish format:
// no I, Q, V, Å, Ä, Ö, and no O last.
const FIXED_PLATES = { saab: 'SAB 900' };
const TRAFFIC = ['volvo240', 'volvo740', 'volvo740', 'golf', 'golf', 'kombi', 'kombi', 'skoda', 'bmw', 'audi', 'saab900', 'taxi', 'van', 'volvo240', 'kombi', 'bus', 'garbage'];

const _v = new THREE.Vector3();

class Game {
  constructor() {
    this.cars = [];
    this.named = {};
    this.npcs = {};
    this.peds = [];
    this.coins = 0;
    this.time = 0;
    this.clockMin = 6 * 60;
    this.frame = 0;
    this.acc = 0;
    this.hooks = [];
    this.paused = false;
    this.started = false;
    this.playerCar = null;
    this.kickT = 0;
    this.kickHitT = -1;
    this.freezeCar = false;
    this.inDialog = false;
    this.talker = null;
    this.input = input;
    this.got = { emblems: new Set(), photos: new Set() };
    this.unlocked = new Set();
    this.autoDialog = TEST;
    this.companions = new Map();   // Character -> { push, left }
    this.carrying = null;           // the cat (or anything with a root) in Ove's arms
    this.poseT = 0; this.pose = null;
    this.tyreT = 0;
    this.penaltyKr = 0; this.penaltyT = 0;
    this.lastMissionState = 'idle';
    this.stages = stages;
  }

  async init() {
    initGfx(document.getElementById('app'));
    this.scene = scene;
    setLoading('Laddar texturer…');
    await gfxReady;
    input.init(renderer.domElement);
    input.onUnlock = () => { if (this.started && !TEST) this.pause(true); };
    hud.init();
    hud.onResetSave = () => this.resetSave();
    FX.init(scene);
    setLoading('Plogar gatorna…');
    await hud.fontsReady;
    await frame();
    buildTown(scene);
    finalizeProps(scene);
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
    scene.add(this.player.root);
    this.emblems = collectibleSpots.emblems.map(([x, y, z], i) => new Collectible(scene, 'emblem', i, x, y, z));
    this.photos = collectibleSpots.photos.map(([x, y, z], i) => new Collectible(scene, 'photo', i, x, y, z));
    this.bang = new Bang(scene);
    this.beacon = new Beacon(scene);
    this.arrow = new GuideArrow(scene);
    this.patrol = new Patrol(this);
    this.interrupts = new Interruptions(this);
    this.interrupts.auto = !TEST || params.has('calls');
    window.__patrol = this.patrol;
    window.__interrupt = this.interrupts;
    this.missions = new MissionRunner(this);
    this.missions.gating = !TEST || params.has('gate');
    this.cam = new CamRig(camera);
    this.load();
    this.storyWorld();
    this.placeNpcs(true);
    this.spawnPlayer();
    this.patrol.seed();
    setLoading('Tar porträtt…');
    await frame();
    for (const key of Object.keys(HOMES)) hud.portraits[key] = renderPortrait(renderer, this.npcs[key].model);
    hud.portraits.ove = renderPortrait(renderer, this.player.model);
    this.applySaveToWorld();
    hud.setCoins(this.coins);
    if (this.patrol.reports) hud.setReports(this.patrol.reports);
    hud.setMeter(this.patrol.ordning);
    hud.setClock(this.clockText());
    this.titlePose();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    window.__ready = true;
    setLoading(null);
    document.getElementById('play').disabled = false;
    if (TEST) this.start();
  }

  // Ove starts on the walkway outside his door, facing along it.
  spawnPlayer() {
    const s = landmarks.oveStart || lm('oveHouse');
    this.player.teleport(s.x, s.z, s.yaw);
    this.cam.yaw = s.yaw;
    this.cam.pitch = 0.16;
    this.cam.snapNext = true;
  }

  // Title screen: the main walkway of Ove's area, the new neighbours' car and trailer standing in
  // the car-free zone, and Ove writing it up in his notebook.
  titlePose() {
    const pc = this.named.patrickCar;
    const s = landmarks.oveStart || lm('oveHouse');
    const x = s.x - 2.6, z = s.z + 0.5;
    const yaw = pc ? yawTo(pc.x - x, pc.z - z) : s.yaw + Math.PI;
    this.player.teleport(x, z, yaw);
  }

  start() {
    if (this.started) return;
    this.started = true;
    document.getElementById('title').classList.add('gone');
    document.body.classList.add('playing');
    audio.init();
    this.spawnPlayer();
    if (!TEST) { input.wantLock = true; input.lock(); }
    if (!TEST) {
      setTimeout(() => hud.toast('Felparkerade bilar i området. Gå fram och håll <b>F</b> för att anteckna.'), 1500);
      // Whoever is offering the day's mission when the toast shows (not when Spela was clicked).
      setTimeout(() => { const giver = this.missions.offered?.giver; if (giver && this.missions.state === 'idle') hud.toast(`<b>${CHARS[giver].name}</b> vill dig något <span class="bang">!</span> Gå fram och tryck <b>E</b>.`); }, 7000);
    }
  }

  // The pause menu. Pausing lets go of the mouse (so Fortsätt can be clicked); Esc, P or the
  // gamepad's Start resume (see loop), as does the button. A resume by key re-locks the pointer
  // if the browser allows it (Esc never counts as a gesture: then the next click in the game does).
  pause(on) {
    if (TEST || this.paused === on) return;
    this.paused = on;
    this.pausedAt = performance.now();
    document.getElementById('pause').classList.toggle('show', on);
    if (on) hud.renderLog(this.patrol.log);
    audio.engine(false, 0, 0);
    audio.skid(0);
    audio.horn(false);
    audio.pen(false);
    if (on) { input.wantLock = true; input.unlock(); }
    else { input.wantLock = true; input.lock(); this.last = performance.now(); }
  }

  clockText() {
    const m = Math.floor(this.clockMin) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  setClock(h, m = 0) { this.clockMin = h * 60 + m; hud.setClock(this.clockText()); }

  // ------------------------------------------------------------------------------------------
  // World population

  addCar(car) { this.cars.push(car); scene.add(car.root); car.sync(0); return car; }
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (car === this.playerCar) this.exitCar(true);
    for (const p of [car.driver, ...car.passengers]) if (p && p.car === car) this.unseat(p);
    scene.remove(car.root);
  }

  // A cheap seated driver (busts: 2 draw calls) on the car's driver seat.
  addBust(def, car) {
    const obj = buildBust(def);
    car.seatLocal(1, obj.position);
    car.tilt.add(obj);
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
      if (car.driverBust) { car.tilt.remove(car.driverBust); car.driverBust = null; }
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

  // The first free passenger seat: front passenger, then the back seat.
  freeSeat(car) {
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
      car.tilt.remove(car.driverBust);
      car.driverBust = null;
      const ped = this.peds.reduce((best, p) => (!best || dist(p.char.x, p.char.z, this.player.x, this.player.z) > dist(best.char.x, best.char.z, this.player.x, this.player.z) ? p : best), null);
      if (ped && ped.char.state !== 'seated') {
        const e = this.exitSpot(car, 1);
        ped.char.teleport(e.x, e.z);
        ped.char.state = 'normal';
        ped.idleT = 3;
        this.say(ped.char, pick(CARJACK), 2.2);
      }
      this.patrol.addOrdning(-8);
    }
    car.ai = null;
    car.traffic = false;
    car.engineOn = null;
    this.seat(this.player, car, 1);
    this.playerCar = car;
    car.ctrl.park = false;
    audio.door();
    // Whoever is with Ove gets in too.
    for (const [ch] of this.companions) if (!ch.car && dist(ch.x, ch.z, car.x, car.z) < 10) this.boardCompanion(ch, car);
  }

  exitCar(force = false) {
    const car = this.playerCar;
    if (!car) return;
    const fast = car.speed > 7 && !force;
    const spot = this.exitSpot(car, 1);
    this.unseat(this.player, spot.x, spot.z);
    this.player.yaw = car.yaw;
    this.playerCar = null;
    car.ctrl.park = true;
    car.ctrl.throttle = 0;
    audio.door();
    audio.engine(false, 0, 0);
    audio.skid(0);
    audio.horn(false);
    if (fast) this.player.fling(car.vx * 0.55, 4, car.vz * 0.55);
    // Passengers who are with Ove get out and walk with him.
    for (const [ch] of this.companions) if (ch.car === car) { const e = this.exitSpot(car, ch.seatSide || -1); this.unseat(ch, e.x, e.z); }
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
  isWithOve(ch) {
    if (!ch || !this.companions.has(ch)) return false;
    if (this.playerCar) return ch.car === this.playerCar;
    return !ch.car && dist(ch.x, ch.z, this.player.x, this.player.z) < 14;
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

  obstacleAhead(car, range) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const halfW = car.spec.wid / 2 + 0.6;
    let best = null;
    const test = (x, z, r, isPlayer) => {
      const dx = x - car.x, dz = z - car.z;
      const along = dx * fx + dz * fz - car.spec.len / 2 - r;
      if (along < -1.5 || along > range) return;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > halfW + r) return;
      const d = Math.max(0, along);
      if (!best || d < best.dist) best = { dist: d, isPlayer };
    };
    const R = range + 8;
    for (const o of this.cars) {
      if (o === car || Math.abs(o.x - car.x) > R || Math.abs(o.z - car.z) > R) continue;
      const ov = o.vx * fx + o.vz * fz;
      if (ov > car.forwardSpeed + 1.5) continue;
      if (o.traffic && Math.cos(o.yaw - car.yaw) < -0.7) continue;
      test(o.x, o.z, Math.min(o.spec.wid, o.spec.len) / 2, o === this.playerCar);
      if (o.trailer) test(o.trailer.x, o.trailer.z, o.trailer.wid / 2, o === this.playerCar);
    }
    // People: standing, flying or lying on the road. A body on the road stops traffic (it used to
    // see only people on their feet and ploughed the rest along for hundreds of metres).
    const person = (c) => c.state === 'normal' || c.state === 'down' || c.state === 'flung';
    if (!this.playerCar && person(this.player)) test(this.player.x, this.player.z, 0.5, true);
    for (const p of this.peds) {
      const c = p.char;
      if (!person(c) || Math.abs(c.x - car.x) > R || Math.abs(c.z - car.z) > R) continue;
      test(c.x, c.z, 0.4, false);
    }
    for (const k in this.npcs) {
      const c = this.npcs[k];
      if (c.car || !person(c) || Math.abs(c.x - car.x) > R || Math.abs(c.z - car.z) > R) continue;
      test(c.x, c.z, c.r + 0.1, false);
    }
    return best;
  }

  carThreat(x, z) {
    for (const c of this.cars) {
      const sp = c.speed;
      if (sp < 7) continue;
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
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
    for (const c of this.cars) {
      if (Math.abs(c.x - x) > c.radius || Math.abs(c.z - z) > c.radius) continue;
      const dx = x - c.x, dz = z - c.z;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      if (Math.abs(dx * fx + dz * fz) > c.spec.len / 2 || Math.abs(dx * -fz + dz * fx) > c.spec.wid / 2) continue;
      const top = c.y + c.height;
      if (top <= ytop && (!best || top > best.top)) best = { top, car: c };
    }
    return best;
  }

  allChars() {
    const out = [];
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
    const kr = Math.min(this.coins, 5 + Math.round((p.def.coins || 2) * 3));
    if (kr > 0) { this.addCoins(-kr); this.penaltyKr += kr; this.penaltyT = 1.2; }
  }

  onCarImpact(a, b, impact, cx, cz) {
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
    if (car === this.playerCar) { audio.thud(); this.cam.shake = Math.min(1, this.cam.shake + impact * 0.03); }
    FX.dust(car.x, car.z, 6);
  }
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
      if (car.driverBust) { car.tilt.remove(car.driverBust); car.driverBust = null; }
      // Somebody's car, wrecked by Ove: that costs.
      if (this.playerCar && !car.violation?.fleeing && !car.isTarget && !car.isChaser && dist(car.x, car.z, this.playerCar.x, this.playerCar.z) < 12) {
        this.patrol.addOrdning(-8);
        const kr = Math.min(this.coins, 100);
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
  onGetUp(ch) {
    if (ch !== this.player && Math.random() < 0.4 && dist(ch.x, ch.z, this.player.x, this.player.z) < 30) this.say(ch, pick(GETUP), 2);
  }
  onBodyBounce(ch) { if (dist(ch.x, ch.z, this.focus().x, this.focus().z) < 40) audio.thud(); }
  onBounce() {}
  onLand(ch) { if (ch === this.player) FX.dust(ch.x, ch.z, 3, ch.y + 0.1); }
  onHonk(car) {
    const f = this.focus();
    const d = dist(car.x, car.z, f.x, f.z);
    if (d < 45) audio.honk(clamp(1.2 - d / 45, 0.2, 1), 0.3);
  }

  collectCan() {
    this.coins += 1;
    hud.setCoins(this.coins);
    hud.bumpCoins();
    audio.coin();
  }
  addCoins(n) { this.coins = Math.max(0, this.coins + n); hud.setCoins(this.coins); if (n > 0) hud.bumpCoins(); }

  say(target, text, secs = 2) { hud.say(target, text, secs); }
  radio(who, text) {
    const k = who;
    hud.radio(k, CHARS[k]?.name || who, text);
    const n = Math.min(8, Math.round(text.split(/\s+/).length * 0.7));
    for (let i = 0; i < n; i++) setTimeout(() => audio.talk(CHARS[k]?.voice || 300), i * 230);
  }
  // Someone calls out to Ove: a speech bubble if they are close, else a toast.
  shout(who, text) {
    const n = this.npc(who);
    if (n && !n.car && dist(n.x, n.z, this.focus().x, this.focus().z) < 45) this.say(n, text, 3.2);
    hud.radio(who, `${CHARS[who]?.name || who} ropar`, text);
  }

  setTalker(who) { this.talker = who || null; }

  async dialog(lines) {
    this.inDialog = true;
    await hud.runDialog(lines.map(([who, text, on]) => ({ who, text, on: typeof on === 'function' ? on : null })), this);
    this.inDialog = false;
  }
  cinematic(a, b) { this.cam.frame(a, b); hud.letterbox(true); this.inDialog = true; }
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
  // Ove's Saab back at its spot, if it is far from home and he isn't in it (a retried mission).
  homeNamedCar(name) {
    const car = this.named[name];
    if (!car || car === this.playerCar || car.dead || !car.home) return;
    if (dist(car.x, car.z, car.home.x, car.home.z) > 30) { car.place(car.home.x, car.home.z, car.home.yaw); car.ctrl.park = true; }
  }

  // ------------------------------------------------------------------------------------------
  // Save

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, mission: this.missions.index, kr: this.coins, emblems: [...this.got.emblems], photos: [...this.got.photos], unlocked: [...this.unlocked], patrol: this.patrol.toSave() }));
    } catch (e) { /* private mode: progress just won't persist */ }
  }
  load() {
    if (!params.has('fresh')) {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
        if (s) {
          this.missions.index = Math.min(MISSIONS.length, s.mission || 0);
          this.coins = s.kr || 0;
          this.got.emblems = new Set(s.emblems || []);
          this.got.photos = new Set(s.photos || []);
          this.unlocked = new Set(s.unlocked || []);
          this.patrol.fromSave(s.patrol);
        }
      } catch (e) { /* corrupt save: start fresh */ }
    }
    if (params.has('mission')) this.missions.index = +params.get('mission');
  }
  applySaveToWorld() {
    for (const e of this.emblems) if (this.got.emblems.has(e.id)) e.remove();
    for (const p of this.photos) if (this.got.photos.has(p.id)) p.remove();
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
    const ms = this.missions, def = ms.state === 'idle' ? ms.offered : ms.m?.def || ms.current;
    // (m.data.away: someone a stage has sent out of the story for the rest of the day, e.g.
    // Parvaneh, in the delivery room on day 7)
    if (ms.m?.data.away?.has(key)) return true;
    if (!def?.away?.includes(key)) return false;
    return !ms.m?.data.npcs.has(this.npcs[key]);
  }

  placeNpcs(force = false) {
    const cur = this.missions.offered;
    for (const key of Object.keys(HOMES)) {
      const n = this.npcs[key];
      if (n.busy || n.car || this.companions.has(n) || n.walkTo) continue;
      const h = this.homeSpot(key);
      const needed = cur && (cur.giver === key || cur.extra?.includes(key));
      const away = n.homeX === undefined || dist(n.x, n.z, n.homeX, n.homeZ) > 6;
      if (n.spot === h.id && !away && !force) continue;
      if (n.state !== 'normal' && !force) continue;
      // Don't pop people around in front of Ove unless a mission needs them there.
      if (!force && !needed && dist(n.x, n.z, this.player.x, this.player.z) < 50) continue;
      const p = lm(h.where);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      let x = p.x - fz * h.right + fx * h.ahead, z = p.z + fx * h.right + fz * h.ahead;
      if (!this.spotFree(x, z)) { const s = this.freeSpot(x, z, 0.4, 2.5); x = s.x; z = s.z; }
      n.homeX = x; n.homeZ = z; n.homeYaw = p.yaw;
      n.teleport(x, z, p.yaw);
      n.spot = h.id;
    }
  }

  // ------------------------------------------------------------------------------------------
  // The loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    input.poll();
    if (this.started && !this.paused) this.update(dt);
    else if (!this.started) this.idleTitle(dt);
    else if (this.paused) {
      // Nothing else reads keys while paused. (The Esc that released the pointer and opened the
      // menu may arrive a moment later: ignore keys for the first 300 ms.)
      if (input.pressed('mute')) { audio.setMuted(!audio.muted); hud.syncMenu(); }
      if (performance.now() - (this.pausedAt || 0) > 300 && input.pressed('pause')) this.pause(false);
    }
    renderFrame();
    input.endFrame();
    this.frame++;
    window.__frame = this.frame;
  }

  // Title: a slow drift down the walkway towards Ove, the town ticking over behind the cards.
  idleTitle(dt) {
    this.time += dt;
    const s = landmarks.oveStart || lm('oveHouse');
    const t = this.time;
    const a = (1 - Math.cos(Math.min(1, t / 40) * Math.PI)) / 2;   // eases from 0 to 1 over 40 s
    camera.position.set(s.x - 25 + a * 4, 3.1 - a * 0.5 + Math.sin(t * 0.21) * 0.05, s.z - 0.2 + Math.sin(t * 0.13) * 0.25);
    camera.lookAt(s.x + 14, 1.6, s.z);
    camera.fov = 44;
    const tc = window.__titleCam;   // look-dev override: { pos: [x,y,z], look: [x,y,z], fov }
    if (tc) { camera.position.set(...tc.pos); camera.lookAt(...tc.look); camera.fov = tc.fov || 44; }
    camera.updateProjectionMatrix();
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) { this.stepWorld(STEP); this.acc -= STEP; n++; }
    if (n === 4) this.acc = 0;
    followSun(s.x, s.z);
    tickSky(this.time, camera.position);
    this.syncAll(dt, true);
    FX.tick(dt);
  }

  update(dt) {
    this.time += dt;
    this.clockMin += dt * CLOCK_RATE;
    for (const h of this.hooks.slice()) h(dt);
    this.handleOneShots();
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) { this.fixedStep(STEP); this.acc -= STEP; n++; }
    if (n === 4) this.acc = 0;
    this.syncAll(dt, false);
    const ms = this.missions.state;
    this.patrol.suspended = ms !== 'idle';
    if (ms !== this.lastMissionState) {
      if (ms === 'idle') this.patrol.newStretch();
      this.lastMissionState = ms;
    }
    this.missions.update(dt);
    this.missions.updateFailed(dt);
    this.interrupts.update(dt);
    this.patrol.update(dt);
    this.tickPickups(dt);
    const f = this.focus();
    tickProps(dt, f.x, f.z);
    FX.tick(dt);
    tickTown(this.time);
    this.updateMarkers();
    // On foot the camera swings in behind Ove after a few seconds without the mouse (camera.js).
    this.cam.update(dt, { ...f, autoTurn: !this.playerCar, lookBack: input.down('lookBack') }, this.inDialog ? null : input.look(), this.cars);
    this.hideNearCamera();
    if (this.aerial) { camera.position.set(f.x, 420, f.z + 260); camera.lookAt(f.x, 0, f.z); camera.fov = 50; camera.updateProjectionMatrix(); }
    followSun(f.x, f.z);
    tickSky(this.time, camera.position);
    this.updateHud(dt);
    this.updateAudio(dt);
    this.recycleTraffic(dt);
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 30) { this.saveT = 0; this.save(); }
  }

  // The prompt-and-E owner of the moment: a mission stage or an errand stage.
  stagePrompt() {
    if (this.missions.state === 'running') { const p = this.missions.stage?.prompt?.(this); if (p) return p; }
    return this.interrupts.prompt();
  }

  handleOneShots() {
    if (input.pressed('mute')) { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Ljudet av' : 'Ljudet på'); }
    if (input.pressed('map')) { this.bigMap = !this.bigMap; hud.toggleBigMap(this.bigMap, this); }
    if (input.pressed('pause') && !TEST) { this.pause(true); return; }
    if (this.inDialog || this.missions.state === 'failed') return;
    if (input.pressed('reset')) { this.resetToRoad(); return; }
    const p = this.player;
    const sp = this.stagePrompt();
    if (this.playerCar) {
      if (input.pressed('interact') && !sp?.takesE) this.exitCar();
      return;
    }
    if (p.state !== 'normal') return;
    if (input.pressed('jump') && p.onGround && !this.pushedNpc()) { p.jump(JUMP_V); audio.jump(); }
    if (input.pressed('attack') && this.kickT <= 0 && p.onGround && !this.pushedNpc()) {
      p.anim.kick = 1; this.kickT = 0.5; this.kickHitT = 0.14;
    }
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
  }

  chatterFor(key) {
    const base = CHATTER[key] || ['Hej, Ove.'], later = CHATTER_AFTER[key];
    return later && this.missions.index >= later[0] && Math.random() < 0.6 ? later[1] : base;
  }

  // Small talk with a neighbour: a line from them, a grunt from Ove.
  chat(n) {
    if ((n.chatCD || 0) > this.time) return;
    n.chatCD = this.time + 3;
    n.yaw = yawTo(this.player.x - n.x, this.player.z - n.z);
    this.player.yaw = yawTo(n.x - this.player.x, n.z - this.player.z);
    const line = pick(this.chatterFor(n.key));
    this.say(n, line, 2.8);
    for (let k = 0; k < 3; k++) setTimeout(() => audio.talk(n.def.voice || 300), k * 230);
    setTimeout(() => { if (!this.playerCar) { const r = pick(OVE_REPLY); this.say(this.player, r, 1.6); audio.talk(CHARS.ove.voice); } }, 2000);
    n.chatT = 12 + Math.random() * 8;
  }

  nearestInteractable() {
    const p = this.player;
    if (this.missions.offered) {
      const g = this.npc(this.missions.offered.giver);
      if (g && !g.car && g.state === 'normal' && dist(g.x, g.z, p.x, p.z) < 3.4 && Math.abs(g.y - p.y) < 2) return { type: 'talk', who: g };
    }
    let best = null, bd = 2.2;
    for (const c of this.cars) {
      if (c.dead || c.locked || Math.abs(c.x - p.x) > 8 || Math.abs(c.z - p.z) > 8) continue;
      if (p.y > c.y + c.height - 0.3) continue;
      const h = {};
      if (circleVsObb(p.x, p.z, 2.2, c.obb, h)) {
        const d = 2.2 - h.depth;
        if (d < bd) { bd = d; best = { type: 'car', car: c }; }
      }
    }
    if (best) return best;
    let nb = null, nd = 2.6;
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.car || n.state !== 'normal' || this.companions.has(n)) continue;
      const d = dist(n.x, n.z, p.x, p.z);
      if (d < nd) { nd = d; nb = { type: 'chat', who: n }; }
    }
    return nb;
  }

  // Physics for everything but the player's input (the title screen runs this too).
  stepWorld(h) {
    for (const c of this.cars) if (c.ai) c.ai.update(h, this);
    for (const c of this.cars) c.step(h, this);
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) collideCars(cars[i], cars[j], this);
    for (const ped of this.peds) { ped.update(h, this); ped.char.step(h, this); }
    this.stepNpcs(h);
    if (!this.playerCar) this.player.step(h, this);
    this.carsVsPeople();
  }

  fixedStep(h) {
    const p = this.player;
    if (this.playerCar) {
      const c = this.playerCar.ctrl;
      if (this.inDialog || this.freezeCar || this.missions.state === 'failed') { c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = true; }
      else { c.throttle = input.throttle(); c.brake = input.brake(); c.steer = input.steer(); c.handbrake = input.down('handbrake'); }
      c.park = false;
    } else if (p.state === 'normal') {
      if (this.inDialog || this.missions.state === 'failed') { p.wishX = p.wishZ = 0; }
      else {
        const mx = input.moveX(), my = input.moveY();
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
  }

  // The neighbours: stand at home and face Ove when he comes by, walk with him when they are
  // his companions (Rune is pushed), walk off somewhere when asked to.
  stepNpcs(h) {
    const p = this.player;
    let idx = 0;
    for (const k in this.npcs) {
      const n = this.npcs[k];
      if (n.state === 'seated') continue;
      n.wishX = n.wishZ = 0;
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
          if (comp.left && d < 3) comp.left = false;
          if (d > 35) comp.left = true;
          if (!comp.left) {
            const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), side = idx % 2 ? 0.7 : -0.7;
            const tx = p.x - fx * 1.4 - fz * side, tz = p.z - fz * 1.4 + fx * side;
            const dd = dist(n.x, n.z, tx, tz);
            if (dd > 0.5) {
              const sp = dd > 6 ? (n.wheelchair ? 3 : 4.6) : dd > 2.5 ? Math.max(2.4, p.speed) : Math.min(2.4, p.speed + 0.6);
              n.wishX = ((tx - n.x) / dd) * sp; n.wishZ = ((tz - n.z) / dd) * sp;
            }
          }
          idx++;
        }
      } else if (n.walkTo) {
        const d = dist(n.x, n.z, n.walkTo.x, n.walkTo.z);
        if (d < 0.8 && n.walkPath?.length) n.walkTo = n.walkPath.shift();
        else if (d < 0.8) {
          n.walkTo = null;
          // A mission NPC who walked somewhere to wait (walkNpc with stay) stays put and busy.
          if (n.walkStay) { n.walkStay = false; n.yaw = n.walkYaw ?? n.yaw; }
          else { n.busy = false; n.homeX = undefined; }
          n.walkSpeed = null;
        } else { const sp = n.walkSpeed || (n.wheelchair ? 1.0 : 1.4); n.wishX = ((n.walkTo.x - n.x) / d) * sp; n.wishZ = ((n.walkTo.z - n.z) / d) * sp; }
      } else if (!n.busy && n.homeX !== undefined && n.state === 'normal') {
        // Pushed a little out of place: shuffle back.
        const d = dist(n.x, n.z, n.homeX, n.homeZ);
        if (d > 1.0 && d < 25) { n.wishX = ((n.homeX - n.x) / d) * 1.2; n.wishZ = ((n.homeZ - n.z) / d) * 1.2; }
      }
      n.step(h, this);
    }
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
      if (n.state === 'normal' && !n.car && dist(n.x, n.z, kx, kz) < 1.2) this.say(n, pick(['Ove!', 'Vad håller du på med?', 'Aj, Ove!']), 1.5);
    }
  }
  kickTyre(c, fx, fz) {
    audio.kick();
    audio.thud();
    // The car rocks on its springs a little.
    const cfx = Math.sin(c.yaw), cfz = Math.cos(c.yaw);
    const side = Math.sign(fx * cfz - fz * cfx) || 1;
    c._sus.rv += side * 0.45;
    c._sus.hv -= 0.12;
    fx_snowPuff(c, this.player);
    if (this.time - this.tyreT > 1.4) {
      this.tyreT = this.time;
      this.say(this.player, pick(TYRE[c.kind] || TYRE.default), 1.8);
    }
  }

  // Cars against people. Only a car that itself drives into someone knocks them over (Ove walking
  // briskly into a parked car just stops; it used to count his own speed and fling him). Children,
  // Rune and the neighbours are never knocked over, and nobody lying on the road is pushed along in
  // front of a bumper: they are shoved out sideways and the car slows as if it hit something soft.
  carsVsPeople() {
    const hit = {};
    const chars = this.allChars();
    for (const ch of chars) {
      if (ch.state === 'seated' || ch.state === 'hidden' || ch.solid === false) continue;
      const pushed = !!this.companions.get(ch)?.push && !this.playerCar;
      for (const car of this.cars) {
        if (Math.abs(car.x - ch.x) > car.radius + 1 || Math.abs(car.z - ch.z) > car.radius + 1) continue;
        if (ch.y > car.y + car.height - 0.3) continue;
        if (!circleVsObb(ch.x, ch.z, ch.r, car.obb, hit)) continue;
        // How fast the car itself comes at them (the person's own walking doesn't count).
        const carIn = car.vx * hit.nx + car.vz * hit.nz;
        if (ch.state === 'normal' && !ch.invulnerable && !pushed && carIn > 4.5 && car.speed > 3) {
          const sp = car.speed;
          ch.x += hit.nx * hit.depth; ch.z += hit.nz * hit.depth;
          if (ch.fling(car.vx * 0.9 + hit.nx * 2.5, 3.5 + sp * 0.18, car.vz * 0.9 + hit.nz * 2.5)) {
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
  // normal: a car can never carry anyone. The car loses speed on every contact frame.
  shoveAside(ch, car, hit, carIn) {
    const o = car.obb, rx = -o.fz, rz = o.fx;
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
    for (const ped of this.peds) {
      const c = ped.char;
      const d2 = (c.x - cx) ** 2 + (c.z - cz) ** 2;
      c.root.visible = d2 < 190 * 190;
      if (c.root.visible) c.sync(dt);
    }
    const p = this.player;
    const talker = this.talker;
    const running = this.missions.state === 'running';
    for (const k in this.npcs) {
      const n = this.npcs[k];
      const near = dist(n.x, n.z, p.x, p.z);
      n.anim.talk = talker === k;
      const giver = this.missions.offered?.giver === k;
      // Elsewhere today: hidden at home (see npcAway).
      const away = !title && this.npcAway(k) && (near > 25 || this.missions.state !== 'idle');
      if (away && n.state === 'normal' && !n.car && !this.companions.has(n)) { n.state = 'hidden'; n.root.visible = false; }
      else if (!away && n.state === 'hidden') { n.state = 'normal'; n.root.visible = true; }
      n.anim.wave = !title && giver && near < 9 && !this.inDialog && n.state === 'normal';
      const comp = this.companions.get(n);
      n.anim.push = false;
      if (!title && n.state === 'normal' && !comp && !n.walkTo && !this.inDialog) {
        if (near < 9 && !this.playerCar) n.yaw = dampAngle(n.yaw, yawTo(p.x - n.x, p.z - n.z), 3, dt);
        else if (n.homeYaw !== undefined && n.speed < 0.3) n.yaw = dampAngle(n.yaw, n.homeYaw, 1.5, dt);
        if (near < 7 && !this.playerCar && !running) {
          n.chatT = (n.chatT ?? 1.5 + Math.random() * 4) - dt;
          // One neighbour at a time: nobody talks over anybody else.
          if (n.chatT <= 0 && this.time > (this.chatGlobalT || 0)) { n.chatT = 16 + Math.random() * 10; this.chatGlobalT = this.time + 4.5; this.say(n, pick(this.chatterFor(k)), 2.8); }
        } else if (near > 14) n.chatT = undefined;
      }
      n.sync(dt);
    }
    // Ove: notebook, phone, pushing / carrying, footsteps.
    p.anim.talk = talker === 'ove';
    p.anim.write = title || (!this.playerCar && !!this.patrol.writing);
    p.anim.phone = !this.playerCar && this.interrupts.onPhone;
    this.poseT -= dt;
    const posing = this.poseT > 0 && !this.playerCar;
    p.anim.push = !this.playerCar && (!!this.pushedNpc() || (posing && this.pose === 'push'));
    p.anim.carry = !this.playerCar && !!this.carrying?.root && !p.anim.push;
    p.anim.work = posing && this.pose === 'work';
    p.anim.workKind = p.anim.work ? this.poseKind || 'bend' : null;
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
    if (this.homeCat && dist(this.homeCat.root.position.x, this.homeCat.root.position.z, camera.position.x, camera.position.z) < 60) this.homeCat.animate(dt, 0);
    if (!title && this.missions.state === 'idle') this.placeNpcs();
  }

  // Nobody's head fills the screen: anyone the camera has ended up inside (a neighbour standing
  // right behind Ove at a wall) is hidden for that frame. Ove himself never is.
  hideNearCamera() {
    const hidden = (this._camHidden ||= []);
    for (const ch of hidden) if (ch.state !== 'hidden' && !ch.car) ch.root.visible = true;
    hidden.length = 0;
    if (this.cam.cine || this.aerial) return;
    const cp = camera.position;
    const test = (ch) => {
      if (ch === this.player || ch.state === 'hidden' || ch.car || !ch.root.visible) return;
      if (Math.abs(ch.x - cp.x) > 1.2 || Math.abs(ch.z - cp.z) > 1.2) return;
      if (cp.y < ch.y - 0.3 || cp.y > ch.y + ch.height + 0.35) return;
      if (dist(ch.x, ch.z, cp.x, cp.z) < ch.r + 0.42) { ch.root.visible = false; hidden.push(ch); }
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
        c.tick(this.time, dt);
        const mp = c.mesh.position;
        if (dist(mp.x, mp.z, f.x, f.z) < (this.playerCar ? 2.6 : 1.4) && Math.abs(mp.y - (f.y + 1)) < 1.8) {
          c.remove();
          set.add(c.id);
          audio.jingle('record');
          FX.sparkle(mp.x, mp.y, mp.z, 0xfff1d0, 16);
          const n = set.size;
          const icon = kind === 'emblem' ? '<span class="emblem-icon"></span>' : '<span class="photo-icon"></span>';
          const title = kind === 'emblem' ? 'Saab-emblem' : 'Sonjas fotografi';
          hud.showCollect(`${icon} ${title} <b>${n}/7</b><br><span class="memory">${notes[(n - 1) % notes.length]}</span>`, 6500);
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
    const out = [];
    const ms = this.missions;
    const f = this.focus();
    if (ms.offered) {
      const g = this.npc(ms.offered.giver);
      if (g) out.push({ type: 'mission', x: g.x, z: g.z, edge: true });
    }
    const t = ms.target();
    if (t && !t.follow) out.push({ type: 'objective', x: t.x, z: t.z, edge: true });
    if (t && t.follow) out.push({ type: ms.stage?.car?.isTarget ? 'enemy' : 'friend', x: t.x, z: t.z, edge: true });
    out.push(...ms.markers());
    out.push(...this.interrupts.markers());
    out.push(...this.patrol.markers(all));
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
    this.route = null;
    if (target && !this.inDialog && dist(target.x, target.z, f.x, f.z) > 6) {
      const aim = routeAim(f.x, f.z, target.x, target.z);
      const top = this.playerCar ? f.y + this.playerCar.height + 1.5 : f.y + this.player.height + 0.9;
      this.arrow.set(f.x, top, f.z, yawTo(aim.x - f.x, aim.z - f.z), this.time);
      this.route = [...aim.nodes.map((n) => [nodeX(n), nodeZ(n)]), [target.x, target.z]];
    } else this.arrow.hide();
  }

  // Free roam with nothing else on: a quiet standing objective (what to do, and how far the
  // nearest felparkering is), so the screen never goes blank once the start toasts are gone.
  patrolObjective() {
    if (this.missions.state !== 'idle' || this.interrupts.active || this.interrupts.call || this.patrol.pursuit || this.inDialog) return null;
    const f = this.focus(), open = this.patrol.open;
    let d = Infinity;
    for (const c of open) d = Math.min(d, dist(c.x, c.z, f.x, f.z));
    const parts = [];
    if (open.length) parts.push(`${open.length} ${open.length === 1 ? 'felparkering' : 'felparkeringar'} · närmaste ${d < 15 ? 'här' : `${Math.round(d / 10) * 10} m`}`);
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
    if (this.missions.state !== 'failed') {
      let prompt = '', hold = null;
      if (!this.inDialog && (this.playerCar || this.player.state === 'normal')) {
        const parts = [];
        const sp = this.stagePrompt();
        if (sp) { parts.push(sp.text); if (sp.hold != null) hold = sp.hold; }
        const pp = this.patrol.prompt();
        if (pp) parts.push(pp.text);
        if (!this.playerCar && !sp?.takesE) {
          const it = this.nearestInteractable();
          if (it?.type === 'talk') parts.push(`<b>E</b> Prata med ${it.who.def.name}`);
          else if (it?.type === 'car') parts.push(it.car.driverBust ? '<b>E</b> Låna bilen' : '<b>E</b> Kliv i');
          else if (it?.type === 'chat') parts.push(`<b>E</b> Hälsa på ${it.who.def.name}`);
        }
        prompt = parts.join('<span class="pr-sep"> &nbsp;·&nbsp; </span>');
      }
      hud.setPrompt(prompt, hold);
    }
    // World tags: violations, the errand's people/cat, neighbours' names close by.
    const tags = [...this.patrol.tags(), ...this.interrupts.tags(), ...(this.missions.state === 'running' ? this.missions.stage?.tags?.(this) || [] : [])];
    if (!this.inDialog) {
      const f = this.focus();
      for (const k in this.npcs) {
        const n = this.npcs[k];
        if (n.car || n.state !== 'normal') continue;
        const d = dist(n.x, n.z, f.x, f.z);
        if (d < 9 && d > 1.2 && !tags.some((t) => t.text === n.def.name)) tags.push({ x: n.x, y: n.y + n.height + 0.3, z: n.z, text: n.def.name, cls: 'neighbour' });
      }
    }
    hud.tags(this.inDialog ? [] : tags);
    if (this.frame % 2 === 0) {
      const f = this.focus();
      hud.drawMinimap(f.x, f.z, this.cam.yaw, this.playerCar ? this.playerCar.yaw : this.player.yaw, this.mapMarkers(false), this.route);
    }
    if (this.bigMap && this.frame % 10 === 0) hud.toggleBigMap(true, this);
    hud.tickBubbles();
    if (this.penaltyT > 0) {
      this.penaltyT -= dt;
      if (this.penaltyT <= 0 && this.penaltyKr) { hud.toast(`Ove betalar för det han förstört: ${this.penaltyKr} kr`, 'bad'); this.penaltyKr = 0; }
    }
  }

  updateAudio() {
    const c = this.playerCar;
    if (c && !c.dead) {
      audio.engine(true, c.revs, c.ctrl.throttle, Math.abs(c.forwardSpeed), c.onSnow ? 'snow' : 'asphalt');
      audio.skid(c.air ? 0 : c.skidAmt, c.onSnow ? 'snow' : 'asphalt');
      audio.horn(input.down('horn'));
      if (c.skidAmt > 0.3 && !c.air) {
        this.skidT = (this.skidT || 0) - 1;
        if (this.skidT <= 0) {
          this.skidT = 2;
          const fx_ = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx_;
          const bz = -c.spec.len / 2 + c.spec.wheelR + 0.4, bx = c.spec.wid / 2 - 0.14;
          for (const s of [-1, 1]) FX.skid(c.x + fx_ * bz + rx * bx * s, c.z + fz * bz + rz * bx * s, c.yaw, undefined, c.onSnow ? 'snow' : undefined);
        }
      }
    } else {
      audio.engine(false, 0, 0);
      audio.skid(0);
      audio.horn(false);
    }
    audio.duckMusic(this.patrol.pursuit || this.interrupts.call ? 0.5 : 1);
  }

  // Replace traffic that has been wrecked or wandered off far away.
  recycleTraffic(dt) {
    this.recycleT = (this.recycleT || 0) - dt;
    if (this.recycleT > 0) return;
    this.recycleT = 2;
    const f = this.focus();
    for (const c of this.cars.slice()) {
      if (c === this.playerCar || c.locked) continue;
      if (c.dead) {
        c.deadT = (c.deadT || 0) + 2;
        if (c.deadT > 20 && dist(c.x, c.z, f.x, f.z) > 60) {
          this.removeCar(c);
          if (c.traffic) this.spawnTrafficCar(Math.random, f);
        }
      }
    }
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
