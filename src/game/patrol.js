// Ove's patrol (DESIGN.md 4.1, 4.2): felparkeringar appear at the town's violationSpots, Ove
// writes them up in his notebook (hold F), some drivers are still in the car and flee (smitare)
// and get chased down, and the Ordning meter keeps score of how orderly the area is.
//
// API for main.js and the story (missions.js):
//   patrol.update(dt)                    every frame (main.js)
//   patrol.forceSpawn(n, near, opts)     n violations at the free spots nearest `near` (landmark
//                                        name or {x,z}); opts { smitare: false | true, radius = 70,
//                                        kinds: [...] }. Returns the cars.
//   patrol.onReport(cb)                  cb(car, { caught }) after every report; returns unsubscribe
//   patrol.reportsSince(t)               reports (incl. caught smitare) since game time t (g.time)
//   patrol.pause(bool)                   stop the passive patrol: no new violations, no drain, no
//                                        car-free penalty, no KAOS / ORDNING events (reporting and
//                                        forceSpawn still work). main.js also suspends all that by
//                                        itself while a story mission runs (patrol.suspended).
//   patrol.addOrdning(d)                 change the meter (clamped 0-100)
//   patrol.cancelWriting(reason)         stop an unfinished report (an incoming call does this)
//   patrol.ordning, .reports, .log, .active (violation cars), .pursuit, .writing, .smitareChance

import { Car } from '../actors/car.js';
import { AIDriver } from '../actors/drivers.js';
import { randomPed } from '../actors/models.js';
import { violationSpots, roadNames } from '../world/town.js';
import { lm, rc, N, P, HALF, MAP, isCarFree, blockAt } from '../world/layout.js';
import { circleVsObb } from '../world/collision.js';
import { THREE, camera } from '../gfx.js';
import { audio } from '../audio.js';
import { hud } from './hud.js';
import { clamp, dist, pick } from '../util.js';

// [tag text, notebook sentence]
export const KINDS = {
  carfree: ['Bil i bilfritt område', 'Bil inom det bilfria området'],
  lawn: ['På gräsmattan', 'Parkerad på gräsmattan'],
  sidewalk: ['På trottoaren', 'Parkerad uppe på trottoaren'],
  busstop: ['Busshållplats', 'Parkerad på busshållplatsen'],
  handicap: ['Handikapplats', 'Handikapplats utan tillstånd'],
  garbage: ['Framför soprummet', 'Blockerar soprummet'],
  guest24: ['Gästplats > 24 h', 'Gästparkering över 24 timmar'],
  firelane: ['Räddningsväg', 'Står på räddningsvägen'],
  loading: ['Lastzon', 'Parkerad i lastzonen'],
  corner: ['Vid korsning', 'Inom 10 m från korsningen'],
  crosswalk: ['Övergångsställe', 'Står på övergångsstället'],
};
const TYPES = ['volvo740', 'golf', 'kombi', 'volvo240', 'skoda', 'bmw', 'audi', 'saab900', 'golf', 'kombi', 'volvo740', 'van'];

// Street names for Ove's notebook: roads along z (north-south) at x = rc(i), roads along x at z =
// rc(j). The world's own lists (the street-name signs) when it has them, so the two always agree.
const ROAD_NS = roadNames?.ns || ['Gärdesvägen', 'Lingonvägen', 'Torgvägen', 'Rönnvägen', 'Parkvägen', 'Sjukhusvägen', 'Hagvägen', 'Västra vägen'];
const ROAD_EW = roadNames?.ew || ['Skogsbrynet', 'Björkvägen', 'Skolvägen', 'Solrosvägen', 'Blåklintsvägen', 'Kyrkvägen', 'Ängsvägen', 'Granvägen'];
const AREA = { ove: 'Radhusområdet', radhus: 'Radhusen', villa: 'Villaområdet', apartments: 'Lamellhusen', centrum: 'Centrum', hospital: 'Sjukhuset', church: 'Kyrkan', cemetery: 'Kyrkogården', dealer: 'Bilhallen', preschool: 'Förskolan', kommun: 'Kommunhuset', gas: 'Macken', park: 'Parken', field: 'Fotbollsplanen', forest: 'Skogen' };

const _dir = new THREE.Vector3();
// The Ordning drain (notes/integration.md, "Fix round 1"): 0.022/s per open violation, a far one
// (> 150 m from Ove) counts half, and only 40 % while a neighbour has Ove on an errand or on the
// phone. Up to 6 are open; a report buys real quiet: the next one comes 25-45 s later (only
// 9-16 s while fewer than 3 are open). After KAOS the meter gets a minute's grace at half drain.
const DRAIN = 0.022, DRAIN_FAR = 150, DRAIN_ERRAND = 0.4;
const WRITE_SECS = 1.8;
const TARGET = 6, FEW = 3;
const OVE_START = ['Det står ju på skylten.', 'Idioter.', 'Typiskt.', 'Ingen kan läsa nu för tiden.', 'Hmpf.', 'Jaså. Här står vi.'];
const FLEE_LINES = ['Hej då, gubbe!', 'Skriv vad du vill!', 'Ha det, farbror!', 'Jag ska bara...!'];
const CAUGHT_LINES = ['Okej, okej! Jag flyttar den!', 'Förlåt! Jag skulle bara handla!', 'Det var bara fem minuter!', 'Snälla, inte en lapp till...'];

function roadInfo(x, z) {
  const i = clamp(Math.round((x + HALF) / P), 0, N), j = clamp(Math.round((z + HALF) / P), 0, N);
  return { i, j, dx: Math.abs(x - rc(i)), dz: Math.abs(z - rc(j)) };
}

// Where a spot is, as Ove would write it.
export function placeName(spot) {
  const { x, z, kind } = spot;
  const r = roadInfo(x, z);
  const onStreet = Math.min(r.dx, r.dz) < 9;
  if (onStreet) {
    const road = r.dx < r.dz ? ROAD_NS[r.i] : ROAD_EW[r.j];
    const cross = r.dx < r.dz ? ROAD_EW[r.j] : ROAD_NS[r.i];
    if (kind === 'corner') return `Hörnet ${road}/${cross}`;
    if (kind === 'crosswalk') return `Övergångsstället, ${road}`;
    if (kind === 'busstop') return `Hållplatsen, ${road}`;
    return road;
  }
  const b = blockAt(x, z);
  const area = b ? AREA[MAP[b.j][b.i]] || 'Området' : 'Området';
  if (kind === 'garbage') return `Soprummet, ${area.toLowerCase()}`;
  if (kind === 'guest24') return 'Gästparkeringen';
  if (kind === 'handicap') return 'Parkeringen, handikapplatsen';
  if (kind === 'carfree' || kind === 'firelane') return `Gångvägen, ${area.toLowerCase()}`;
  if (kind === 'lawn') return `Gräsmattan, ${area.toLowerCase()}`;
  return area;
}

// Distance from (x, z) to a car's footprint.
function obbDist(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const lz = dx * o.fx + dz * o.fz, lx = dx * -o.fz + dz * o.fx;
  return Math.hypot(Math.max(0, Math.abs(lx) - o.hx), Math.max(0, Math.abs(lz) - o.hz));
}

export class Patrol {
  constructor(game) {
    this.g = game;
    this.ordning = 50;
    this.reports = 0;
    this.log = [];              // { plate, kind, text, time, caught?, escaped? } for hud.renderLog
    this.active = [];           // violation cars (unreported, reported and leaving, fleeing)
    // Only street spots outside Ove's own area can flee (a car on the walkway has nowhere to go):
    // 40 % of those is about a quarter of all violations with the spawn weights below.
    this.smitareChance = 0.4;
    this.paused = false;
    this.suspended = false;     // set by main.js while a story mission runs
    this.writing = null;
    this.pursuit = null;
    this.listeners = [];
    this.reportTimes = [];
    this.redaGiven = false;     // ORDNING OCH REDA pays once per free-roam stretch
    this.kaosT = 0;
    this.spawnT = 3;
    this.cooldown = new Map();  // spot -> game time when it may be used again
    this.carFreeShoutT = -999;
    this.needRelease = false;   // F must be let go between two reports
    this.lastKaos = -999;
    this.spots = violationSpots.map((s) => ({ ...s, onStreet: Math.min(roadInfo(s.x, s.z).dx, roadInfo(s.x, s.z).dz) < 9 }));
  }

  get passive() { return !this.paused && !this.suspended; }
  pause(on) { this.paused = !!on; }
  onReport(cb) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((f) => f !== cb); }; }
  reportsSince(t) { let n = 0; for (const x of this.reportTimes) if (x >= t) n++; return n; }
  get open() { return this.active.filter((c) => !c.violation.reported && !c.violation.gone && !c.violation.fleeing); }

  addOrdning(d) {
    if (!d) return;
    this.ordning = clamp(this.ordning + d, 0, 100);
    // Remember touching the ends: the events fire on the next free-roam update.
    if (this.ordning >= 100) this.atTop = true;
    else if (this.ordning < 97) this.atTop = false;
    if (this.ordning <= 0) this.atBottom = true;
    else if (this.ordning > 5) this.atBottom = false;
  }
  newStretch() { this.redaGiven = false; }

  // ------------------------------------------------------------------------------------------
  // Spawning

  // Initial set at game start: one bil i bilfritt område near Ove's door, the rest weighted
  // towards his area and the neighbouring blocks.
  seed() {
    const st = this.g.player;
    const carfree = this.spots.filter((s) => s.kind === 'carfree' && dist(s.x, s.z, st.x, st.z) > 9 && dist(s.x, s.z, st.x, st.z) < 40);
    if (carfree.length) this.spawnAt(pick(carfree), { smitare: false });
    let guard = 0;
    while (this.open.length < TARGET && guard++ < 60) this.spawnOne(false);
  }

  spotFree(s, minPlayer = 6) {
    if ((this.cooldown.get(s) || 0) > this.g.time) return false;
    const f = this.g.focus();
    if (dist(s.x, s.z, f.x, f.z) < minPlayer) return false;
    for (const c of this.g.cars) {
      if (Math.abs(c.x - s.x) > 9 || Math.abs(c.z - s.z) > 9) continue;
      if (circleVsObb(s.x, s.z, 2.7, c.obb, {})) return false;
    }
    for (const c of this.active) if (dist(c.x, c.z, s.x, s.z) < 6) return false;
    return true;
  }
  // Could Ove be looking at (x, z)? Near: yes. Far: no. In between: if it is in front of the camera.
  visible(x, z) {
    const f = this.g.focus();
    const d = dist(x, z, f.x, f.z);
    if (d < 25) return true;
    if (d > 60) return false;
    camera.getWorldDirection(_dir);
    return (x - camera.position.x) * _dir.x + (z - camera.position.z) * _dir.z > 0;
  }

  spawnOne(hidden = true) {
    const f = this.g.focus();
    const cands = [], w = [];
    for (const s of this.spots) {
      if (!this.spotFree(s, 8)) continue;
      if (hidden && this.visible(s.x, s.z)) continue;
      const d = dist(s.x, s.z, f.x, f.z);
      let wt = s.where === 'ove' ? 4 : Math.abs(s.x) < 130 && Math.abs(s.z) < 130 ? 2 : 1;
      if (d > 260) wt *= 0.4;
      cands.push(s); w.push(wt);
    }
    if (!cands.length) return null;
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < cands.length; k++) { r -= w[k]; if (r <= 0) return this.spawnAt(cands[k]); }
    return this.spawnAt(cands[cands.length - 1]);
  }

  forceSpawn(n, near, opts = {}) {
    const p = typeof near === 'string' ? lm(near) : near || this.g.focus();
    const radius = opts.radius ?? 70;
    const list = this.spots
      .filter((s) => (!opts.kinds || opts.kinds.includes(s.kind)))
      .map((s) => [s, dist(s.x, s.z, p.x, p.z)])
      .sort((a, b) => a[1] - b[1]);
    const out = [];
    for (const [s, d] of list) {
      if (out.length >= n) break;
      if (d > radius * 2.5) break;
      if (!this.spotFree(s, 4)) continue;
      const car = this.spawnAt(s, { smitare: opts.smitare, forced: true });
      if (car) out.push(car);
    }
    return out;
  }

  // smitare: undefined = the usual chance, false = never, true = always (street spots only).
  spawnAt(s, opts = {}) {
    const g = this.g;
    const canFlee = s.onStreet && s.where !== 'ove';
    const smitare = canFlee && (opts.smitare === true || (opts.smitare === undefined && !this.suspended && Math.random() < this.smitareChance));
    // A smitare sits in the car with the engine idling: headlights on, exhaust in the cold air.
    const car = new Car(pick(TYPES), { snow: s.kind === 'guest24', engineOn: smitare ? null : false });
    car.place(s.x, s.z, s.yaw);
    const [short, text] = KINDS[s.kind] || [s.kind, s.kind];
    car.violation = { kind: s.kind, short, text, spot: s, place: placeName(s), reported: false, smitare, since: g.time, forced: !!opts.forced };
    car.locked = true;
    g.addCar(car);
    if (smitare) g.addBust(randomPed(), car);
    this.active.push(car);
    this.cooldown.set(s, g.time + 90);
    return car;
  }

  remove(car) {
    const i = this.active.indexOf(car);
    if (i >= 0) this.active.splice(i, 1);
    if (this.writing?.car === car) this.cancelWriting('');
    if (this.g.cars.includes(car)) this.g.removeCar(car);
  }

  // ------------------------------------------------------------------------------------------
  // Reporting

  // The violation Ove could write up right now (and why not, if he is too fast).
  reportable() {
    const g = this.g, f = g.focus(), car = g.playerCar;
    if (g.inDialog || (!car && g.player.state !== 'normal')) return null;
    const range = car ? 7 : 4;
    let best = null, bd = Infinity;
    for (const c of this.active) {
      const v = c.violation;
      if (v.reported || v.gone || v.fleeing) continue;
      if (Math.abs(c.x - f.x) > 14 || Math.abs(c.z - f.z) > 14) continue;
      const d = obbDist(c.obb, f.x, f.z);
      if (d < range && d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    return { car: best, tooFast: !!(car && car.speed > 3) };
  }

  startWriting(c) {
    const g = this.g, v = c.violation;
    if (v.smitare && !this.pursuit && !c.dead) { this.startPursuit(c); return; }
    this.writing = { car: c, p: 0 };
    hud.notebook.show({ plate: c.plate, kind: v.kind, text: v.text, place: v.place, time: g.clockText(), no: this.reports + 1 });
    audio.pen(true);
    if (!g.playerCar && Math.random() < 0.6) g.say(g.player, pick(OVE_START), 1.8);
  }

  cancelWriting(reason = '') {
    if (!this.writing) return;
    this.writing = null;
    audio.pen(false);
    hud.notebook.cancel(reason);
    this.needRelease = true;
  }

  finishWriting() {
    const c = this.writing.car;
    this.writing = null;
    audio.pen(false);
    audio.stamp();
    hud.notebook.done();
    this.needRelease = true;
    this.credit(c, false);
  }

  credit(c, caught) {
    const g = this.g, v = c.violation;
    v.reported = true;
    // Cleaning up pays off: no replacement for a while (unless the area has gone quiet).
    if (this.open.length >= FEW) this.spawnT = Math.max(this.spawnT, 25 + Math.random() * 20);
    v.leaveAt = g.time + (caught ? 45 : 22 + Math.random() * 18);
    this.reports++;
    this.reportTimes.push(g.time);
    this.addOrdning(caught ? 12 : 7);
    g.addCoins(caught ? 50 : 10);
    this.log.push({ plate: c.plate, kind: v.kind, text: v.text, time: g.clockText(), caught: caught || undefined });
    if (this.log.length > 80) this.log.shift();
    hud.setReports(this.reports);
    for (const f of this.listeners.slice()) { try { f(c, { caught }); } catch (e) { console.error(e); } }
    g.save();
  }

  updateWriting(dt) {
    const g = this.g, w = this.writing;
    if (!w) return;
    const c = w.car, f = g.focus();
    const range = g.playerCar ? 7.6 : 4.6;
    if (!g.input.down('report')) { this.cancelWriting(''); return; }
    if (c.dead || !this.active.includes(c)) { this.cancelWriting(''); return; }
    if (obbDist(c.obb, f.x, f.z) > range) { this.cancelWriting('för långt bort'); return; }
    if (g.playerCar && g.playerCar.speed > 3.5) { this.cancelWriting('bilen rullade'); return; }
    if (!g.playerCar && g.player.state !== 'normal') { this.cancelWriting(''); return; }
    w.p += dt / WRITE_SECS;
    hud.notebook.progress(Math.min(1, w.p));
    if (w.p >= 1) this.finishWriting();
  }

  // ------------------------------------------------------------------------------------------
  // Smitare

  startPursuit(c) {
    const g = this.g, v = c.violation;
    v.fleeing = true;
    c.engineOn = null;
    c.damageScale = 0.35;
    c.ai = new AIDriver(c, { mode: 'flee', target: () => g.focusTarget(), cruise: 18 + Math.random() * 4, avoid: true });
    this.pursuit = { car: c, mot: 100, farT: 0, t: 0 };
    audio.door();
    audio.honk(0.6, 0.25);
    g.say(c, pick(FLEE_LINES), 2);
    hud.showBanner('SMITARE!', `${c.plate} drar iväg`, 'bad', 1800);
    g.cam.shake = Math.max(g.cam.shake, 0.2);
    if (!this.toldPursuit) {
      this.toldPursuit = true;
      setTimeout(() => hud.toast(g.playerCar ? 'Håll dig tätt bakom smitaren eller knuffa till den tills den ger upp.' : 'Smitaren kör iväg. Ta en bil och hinn ikapp innan den är borta!', 'warn', 6000), 1900);
    }
  }

  updatePursuit(dt) {
    const g = this.g, P = this.pursuit;
    if (!P) { hud.setPursuit(null); return; }
    const c = P.car, f = g.focus();
    P.t += dt;
    if (c.dead) { this.caught(); return; }
    const d = dist(c.x, c.z, f.x, f.z);
    if (d < 12 && P.t > 1) P.mot -= 6 * dt;
    if (d > 110) P.farT += dt; else P.farT = Math.max(0, P.farT - dt * 0.5);
    if (P.mot <= 0) { this.caught(); return; }
    if (P.farT > 5) { this.escaped(); return; }
    hud.setPursuit({ label: `${c.plate} · ${c.spec.name}`, bar: P.mot / 100, dist: d, farAt: 80 });
  }

  // From main.js onCarImpact: ramming the smitare costs it motstånd (impact x 4).
  onImpact(a, b, impact) {
    const P = this.pursuit, pc = this.g.playerCar;
    if (!P || !pc || impact <= 3) return;
    if ((a === pc && b === P.car) || (b === pc && a === P.car)) {
      P.mot -= impact * 4;
      this.g.cam.shake = Math.min(1, this.g.cam.shake + impact * 0.03);
    }
  }

  caught() {
    const g = this.g, P = this.pursuit, c = P.car;
    this.pursuit = null;
    hud.setPursuit(null);
    c.violation.fleeing = false;
    c.violation.caughtAt = g.time;
    if (!c.dead && c.ai) c.ai.pullOver(() => { g.say(c, pick(CAUGHT_LINES), 2.6); });
    else c.hazard = !c.dead;
    hud.showBanner('TAGEN!', `${c.plate} · +12 Ordning · +50 kr`, 'stamp', 2600);
    audio.stamp();
    audio.jingle('complete');
    this.credit(c, true);
    setTimeout(() => { if (!g.playerCar && g.player.state === 'normal') g.say(g.player, 'Det står ju på skylten.', 2); }, 1400);
  }

  // A story mission begins in the middle of a chase: the smitare simply drives off, no SMET!, no
  // penalty, nothing in the log (the panel goes too).
  dropPursuit() {
    const P = this.pursuit;
    if (!P) return;
    this.pursuit = null;
    hud.setPursuit(null);
    const c = P.car, v = c.violation;
    if (v) { v.fleeing = false; v.gone = true; }
    if (!c.dead) c.ai = new AIDriver(c, { mode: 'traffic', cruise: 14 });
  }

  escaped() {
    const g = this.g, P = this.pursuit, c = P.car;
    this.pursuit = null;
    hud.setPursuit(null);
    const v = c.violation;
    v.fleeing = false; v.gone = true;
    c.ai = new AIDriver(c, { mode: 'traffic', cruise: 14 });
    this.addOrdning(-8);
    this.log.push({ plate: c.plate, kind: v.kind, text: v.text, time: g.clockText(), escaped: true });
    hud.showBanner('SMET!', `${c.plate} kom undan`, 'bad', 2400);
    audio.jingle('fail');
  }

  // ------------------------------------------------------------------------------------------

  update(dt) {
    const g = this.g;
    // Reporting: hold F near a violation.
    if (this.writing) this.updateWriting(dt);
    else {
      if (!g.input.down('report')) this.needRelease = false;
      const r = this.reportable();
      if (r && !r.tooFast && !this.needRelease && g.input.down('report') && !g.interrupts?.call) this.startWriting(r.car);
    }
    this.updatePursuit(dt);
    // Bookkeeping: reported cars leave when nobody is looking, escaped ones once far away,
    // wrecked ones after a while.
    for (const c of this.active.slice()) {
      const v = c.violation, f = g.focus();
      if (c.dead) { if (!v.deadAt) v.deadAt = g.time; if (g.time - v.deadAt > 25 && !this.visible(c.x, c.z)) this.remove(c); continue; }
      if (v.gone && dist(c.x, c.z, f.x, f.z) > 140) { this.remove(c); continue; }
      // A caught smitare that has come to a stop shows its hazards (even if the AI is still settling).
      if (v.caughtAt && !c.hazard && c.speed < 0.5 && g.time - v.caughtAt > 2) c.hazard = true;
      if (v.reported && this.pursuit?.car !== c && g.time > v.leaveAt && !this.visible(c.x, c.z)) { this.remove(c); continue; }
    }
    if (!this.passive) return;
    // Events first (a report that fills the meter must not be drained away before it counts).
    if ((this.atBottom || this.ordning <= 0) && g.time - this.lastKaos > 5) {
      this.atBottom = false;
      this.lastKaos = g.time;
      const lost = Math.min(g.coins, 50);
      g.addCoins(-lost);
      this.ordning = 35;
      // (A broke Ove's "−1 kr" isn't worth a mention.)
      hud.showBanner('KAOS I OMRÅDET', `Anders kallar till extra föreningsmöte${lost >= 5 ? ` · −${lost} kr` : ''}`, 'chaos', 3200);
      audio.alarm();
      setTimeout(() => g.radio('anders', 'Extra föreningsmöte ikväll, Ove. Klockan sju. Ordningen i området är under all kritik.'), 1800);
    } else if ((this.atTop || this.ordning >= 100) && !this.redaGiven) {
      this.redaGiven = true;
      g.addCoins(100);
      hud.showBanner('ORDNING OCH REDA', 'Området är som det ska · +100 kr', 'good', 3000);
      audio.jingle('complete');
      setTimeout(() => g.radio('anita', 'Det är så lugnt i området idag, Ove. Rune sover som en stock.'), 2200);
    }
    // Keep up to 6 open violations, a new one now and then, out of sight.
    const open = this.open;
    if (open.length < TARGET) {
      this.spawnT -= dt * (open.length < FEW ? 1.6 : 1);
      if (this.spawnT <= 0) { this.spawnT = open.length + 1 < FEW ? 9 + Math.random() * 7 : 18 + Math.random() * 14; this.spawnOne(true); }
    }
    // The meter: drains with every unreported violation (far ones count half), less while the
    // neighbours have Ove busy, and gently for a minute after a KAOS.
    const f = g.focus();
    let w = 0;
    for (const c of open) w += dist(c.x, c.z, f.x, f.z) > DRAIN_FAR ? 0.5 : 1;
    let k = DRAIN;
    if (g.interrupts?.active || g.interrupts?.call) k *= DRAIN_ERRAND;
    if (g.time - this.lastKaos < 60) k *= 0.5;
    this.addOrdning(-k * w * dt);
    // Ove himself driving inside the car-free area.
    const pc = g.playerCar;
    if (pc && pc.speed > 0.6 && isCarFree(pc.x, pc.z)) {
      this.addOrdning(-1 * dt);
      if (g.time - this.carFreeShoutT > 60) {
        this.carFreeShoutT = g.time;
        g.shout('anders', 'Ove! Det är förbjudet att köra bil inom området!');
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // HUD

  prompt() {
    if (this.writing) return null; // the notebook is up (it hides the prompt anyway)
    if (this.g.interrupts?.call) return null;
    const r = this.reportable();
    if (!r) return null;
    if (r.tooFast) return { text: 'Sakta ner för att anteckna' };
    // On foot next to a smitare: he'll drive off the moment Ove starts writing.
    if (r.car.violation.smitare && !this.g.playerCar) return { text: `<b>F</b> Anteckna <small>(föraren sitter kvar – ta bilen först?)</small>` };
    return { text: `<b>F</b> Anteckna felparkering <small>(håll)</small>` };
  }

  tags() {
    const f = this.g.focus(), out = [];
    for (const c of this.active) {
      const v = c.violation;
      if (v.gone || c.dead) continue;
      const d = dist(c.x, c.z, f.x, f.z);
      if (v.fleeing) { if (d < 140) out.push({ x: c.x, y: c.y + c.height + 0.6, z: c.z, text: `Smitare · ${c.plate}`, cls: 'smitare' }); continue; }
      if (d > 35) continue;
      const who = v.smitare && !v.reported && !v.caughtAt && d < 22 ? ' · förare i bilen' : '';
      out.push({ x: c.x, y: c.y + c.height + 0.5, z: c.z, text: v.reported ? 'Anmäld' : v.short + who, cls: v.reported ? 'reported' : 'violation' });
    }
    return out;
  }

  markers(all) {
    const out = [];
    for (const c of this.active) {
      const v = c.violation;
      if (v.gone || c.dead) continue;
      if (v.fleeing) out.push({ type: 'smitare', x: c.x, z: c.z, edge: true });
      else if (!v.reported) out.push({ type: 'violation', x: c.x, z: c.z, edge: false });
    }
    return out;
  }

  // Save / load (main.js).
  toSave() { return { ordning: Math.round(this.ordning), reports: this.reports, log: this.log.slice(-60) }; }
  fromSave(s) {
    if (!s) return;
    this.ordning = clamp(s.ordning ?? 50, 0, 100);
    this.reports = s.reports || 0;
    this.log = Array.isArray(s.log) ? s.log : [];
  }
}
