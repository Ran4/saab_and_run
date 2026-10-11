// The hoppbacke (feature snöhög): what a flight off a snow hill does in the game. The flying is the
// car's (car.js HOPP: car.flight while it is in the air, car.landed after) and the trailer's
// (trailer.js); this is everything around it.
//   - Off the edge: fine snow sprays from the rear wheels, a soft whumpf (audio.hoppTakeoff), the air
//     rushes past for as long as it is likely to fly (audio.hoppWind); main.js lets the engine rev
//     with the wheels free and silences the tyres; the camera opens up (camera.js).
//   - Down again, judged by the speed into the snow (car.landed.impact, along the slope's normal):
//     soft < SOFT, good < GOOD, hard < HARD, else a crash. Powder round the wheels, the springs
//     bottoming out (audio.hoppLand), the camera shakes with it. A trailer bounces after it
//     (game.onTrailerBounce: a clank and a puff).
//   - A real jump (REAL s in the air or more): Ove writes it down (a toast in his hand: the air time
//     and the length; the longest is his record, kept in the save), and after a big one (BIG s) says
//     what he thinks of it (script.js OVE_HOPP, SLID, TYRE: at most every 25 s), his passengers too.
//     People who saw it (within SEE m of where it took off or came down) react through horn.js'
//     reactions: children cheer, pensioners shake their fists, the rest flinch and have an opinion
//     (lines they already say about a car: HONK_KID, HONK_OLD, HONK_TEEN, HONK_SCARED, PANIC,
//     HONK_CARFREE), and a neighbour within NEIGHBOUR m says one of theirs (WATCH below).
// API: hopp.takeoff(car), hopp.land(car, f), hopp.trailerBounce(tr, impact) (main.js' onCar* hooks),
// hopp.update(dt) every frame (what is said a moment later: game time, nothing while paused),
// hopp.best (m, the record), hopp.stats and hopp.log (the scenarios), hopp.rand (they make chance
// come true).

import { audio } from '../audio.js';
import { hud } from './hud.js';
import { fx as FX } from './fx.js';
import { CHARS } from '../actors/models.js';
import {
  OVE_HOPP, SLID, TYRE, OVE_REPLY, HONK_KID, HONK_OLD, HONK_TEEN, HONK_SCARED, PANIC, HONK_CARFREE, HONK_PASSENGER,
  RUNE_HORN, HONK_NEIGHBOUR, CHATTER, STORY, KICKED_NEIGHBOUR,
} from './script.js';
import { clamp, dist, pick } from '../util.js';

const SOFT = 5, GOOD = 8.5, HARD = 12.5;
const REAL = 0.55, BIG = 0.85;
const SEE = 38, NEIGHBOUR = 60;

// What a neighbour who saw it says (lines of theirs from elsewhere in script.js, all voiced).
const WATCH = {
  anders: HONK_NEIGHBOUR.anders[1],                  // 'Jag tar upp det på årsmötet, Ove!'
  patrick: STORY.slapet.backing[4][1],               // 'Wow. Det ser ut som i reklamen.'
  parvaneh: CHATTER.parvaneh[1],                     // 'Ove, du ser nästan glad ut i dag.'
  jimmy: CHATTER.jimmy[1],                           // 'Ove! Mannen själv!'
  anita: CHATTER.anita[0],                           // 'Hej, Ove.'
  sara: HONK_NEIGHBOUR.sara[1],                      // 'Igen! Igen!'
  nasanin: HONK_NEIGHBOUR.nasanin[1],                // 'Igen!'
  vitskjorta: HONK_NEIGHBOUR.vitskjorta[0],          // 'Det där noteras.'
};
const GESTURE = { anders: 'fist', vitskjorta: null, patrick: 'wave', jimmy: 'wave', adrian: 'wave', sara: 'cheer', nasanin: 'cheer', parvaneh: null, anita: null, rune: null };
// ... and one riding with Ove
const RIDE = {
  patrick: HONK_PASSENGER.patrick[0],                // 'Oj! Jag hoppade till.'
  parvaneh: HONK_PASSENGER.parvaneh[1],              // 'Måste du, Ove?'
  anita: HONK_PASSENGER.anita[0],                    // 'Ove, Rune blir rädd.'
  jimmy: CHATTER.jimmy[1],
  sara: HONK_PASSENGER.sara[0],                      // 'Igen!'
  nasanin: HONK_NEIGHBOUR.nasanin[1],
  anders: HONK_NEIGHBOUR.anders[1],
  vitskjorta: HONK_NEIGHBOUR.vitskjorta[0],
};

const isKid = (c) => c.def.kind === 'kid' || (c.def.age ?? 30) < 13;
const isTeen = (c) => !isKid(c) && (c.def.age ?? 30) < 19;
const isOld = (c) => (c.def.age ?? 30) >= 65;
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

export class Hoppbacke {
  constructor(game) {
    this.g = game;
    this.best = 0;                 // the longest jump (m), from the save
    this.rand = Math.random;
    this.oveT = -1e9; this.rideT = -1e9; this.watchT = -1e9; this.seenT = -1e9;
    this.flewSaab = false;         // (his aeroplane line: the first good one in the Saab always)
    this.later = [];               // [{ t, fn }]: due in game time
    this.stats = { takeoffs: 0, flights: 0, real: 0, soft: 0, good: 0, hard: 0, crash: 0, records: 0, ove: 0, rides: 0, watchers: 0, neighbours: 0, trailer: 0 };
    this.log = [];
  }

  chance(p) { return this.rand() < p; }
  after(t, fn) { this.later.push({ t, fn }); }
  update(dt) {
    if (!this.later.length) return;
    const due = [];
    this.later = this.later.filter((l) => { l.t -= dt; if (l.t > 0) return true; due.push(l); return false; });
    for (const l of due) l.fn();
  }
  // How near (0..1) to the one listening.
  near(x, z) { const f = this.g.focus(); return clamp(1.25 - dist(x, z, f.x, f.z) / 50, 0, 1); }

  // The car has left the snow.
  takeoff(car) {
    this.stats.takeoffs++;
    const k = this.near(car.x, car.z);
    if (k <= 0) return;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx, s = car.spec;
    const bz = -s.len / 2 + s.wheelR + 0.4, bx = s.wid / 2 - 0.14, v = car.speed;
    for (const side of [-1, 1]) {
      FX.powder(car.x + fx * bz + rx * bx * side, car.y + 0.1, car.z + fz * bz + rz * bx * side, fx * v * 0.15, 1.2 + v * 0.08, fz * v * 0.15, 9, 0.9);
    }
    if (car === this.g.playerCar) {
      audio.hoppTakeoff(k);
      // how long it is likely to be up: to the height it took off from, and a bit
      const F = car.flight, t = F ? (Math.max(0, F.vy0) * 2) / 15 + 0.35 : 0.6;
      if (t > 0.45) audio.hoppWind(Math.min(2.2, t), clamp(v / 18, 0.4, 1));
    } else audio.hoppTakeoff(k * 0.6);
  }

  // The car is down again. f: car.landed ({ t (s in the air), dist (m), apex, y0, impact, onHill, x0, z0, v0 }).
  land(car, f) {
    const g = this.g, pc = car === g.playerCar;
    this.stats.flights++;
    const i = f.impact, cls = i < SOFT ? 'soft' : i < GOOD ? 'good' : i < HARD ? 'hard' : 'crash';
    this.stats[cls]++;
    const real = f.t >= REAL, big = f.t >= BIG;
    this.log.push({ kind: car.kind, player: pc, trailer: !!car.trailer, v0: +f.v0.toFixed(1), air: +f.t.toFixed(2), dist: +f.dist.toFixed(1), apex: +(f.apex - f.y0).toFixed(2), impact: +i.toFixed(1), onHill: f.onHill, cls });
    if (this.log.length > 40) this.log.shift();
    // the show: powder round the wheels, the sound, the camera
    const k = this.near(car.x, car.z);
    if (k > 0) {
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx, s = car.spec;
      const n = Math.round(clamp(5 + i * 1.1, 6, 18)), sz = clamp(0.8 + i * 0.05, 0.8, 1.4);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const wz = a * (s.wb / 2), wx = b * (s.wid / 2 - 0.1);
        FX.powder(car.x + fx * wz + rx * wx, car.y + 0.05, car.z + fz * wz + rz * wx, car.vx * 0.45 + rx * b * i * 0.2, 0.8 + i * 0.25, car.vz * 0.45 + rz * b * i * 0.2, n, sz);
      }
      audio.hoppLand(Math.max(2, i), k * (pc ? 1 : 0.6));
    }
    if (pc) {
      g.cam.shake = Math.min(1, g.cam.shake + clamp((i - 2) * 0.05, 0, 0.7));
      if (cls === 'crash') hud.flashColor('rgba(255,255,255,0.18)', 300);
    }
    if (!pc || !real || g.inDialog || g.cold?.busy) return;
    this.stats.real++;
    // Ove writes it down
    // (a record: longer than the longest so far, saved; "Rekord!" once there was one to beat)
    const prev = this.best, rec = f.dist > prev + 0.05 && f.t >= 0.7;
    if (rec) { this.best = f.dist; this.stats.records++; g.save?.(); }
    const how = cls === 'soft' ? 'Mjuk landning' : cls === 'good' ? 'Bra landning' : cls === 'hard' ? 'Hård landning' : 'Ojdå';
    hud.toast(`<div><span class="t-who">Ove antecknar</span><span class="memory">Lufttid ${fmt(f.t, 2)} s · ${fmt(f.dist)} m</span> · ${how}${rec && prev > 0 ? ' · <b>Rekord!</b>' : ''}</div>`, cls === 'soft' || cls === 'good' ? 'good' : cls === 'crash' ? 'bad' : '', 3400);
    // and they all have something to say
    const busy = this.passenger(car, cls, big);
    this.watchers(car, f, cls);
    if (big) this.oveSays(car, cls, busy);
  }

  // What Ove thinks (after a big one, at most every 25 s; later if a passenger spoke first).
  oveSays(car, cls, busy) {
    const g = this.g;
    if (g.time - this.oveT < 25) return;
    this.oveT = g.time;
    const mine = car.name === 'saab', saab = car.kind === 'saab900', ok = cls === 'soft' || cls === 'good';
    let line;
    if (mine && saab && ok && (!this.flewSaab || this.chance(0.4))) { line = OVE_HOPP.saab; this.flewSaab = true; }
    else if (!mine && (cls === 'hard' || cls === 'crash' || this.chance(0.45))) line = OVE_HOPP.notMine;
    else if (car.trailer) line = pick([OVE_REPLY[0], SLID.default[2]], this.rand);                // 'Hmpf.' / 'Det var meningen.'
    else if (!ok) line = pick([SLID.default[2], SLID.default[0]], this.rand);       // 'Det var meningen.' / 'Det där såg ingen.'
    else if (saab) line = pick(TYRE.saab900, this.rand);                            // 'Bra däck.' / 'Så ska en bil se ut.' / 'Ordentligt.'
    else line = pick([TYRE.saab900[0], OVE_REPLY[0], OVE_REPLY[3]], this.rand);    // 'Bra däck.' / 'Hmpf.' / 'Jaså.'
    this.after(busy ? 2.6 : 0.9, () => {
      if (g.inDialog) return;
      if (!g.say(g.player, line, 2.4)) audio.talk(CHARS.ove.voice);
      this.stats.ove++;
    });
  }

  // A passenger has something to say about it (returns true if one will).
  passenger(car, cls, big) {
    const g = this.g;
    if (g.time - this.rideT < 12) return false;
    const ps = car.passengers.filter((p) => p.key && (RIDE[p.key] || p.key === 'rune' || p.key === 'adrian'));
    if (!ps.length || !(big || cls === 'hard' || cls === 'crash')) return false;
    const p = pick(ps, this.rand);
    const line = p.key === 'rune' ? RUNE_HORN[car.kind] || RUNE_HORN.default : RIDE[p.key] || KICKED_NEIGHBOUR[0];
    this.rideT = g.time;
    this.stats.rides++;
    const at = { get x() { return car.x; }, get y() { return car.y; }, get z() { return car.z; }, height: car.height + 0.75 };
    this.after(0.45, () => { if (!g.inDialog && !g.say(at, line, 2.2)) audio.talk(p.def.voice || 300); });
    return true;
  }

  // People who saw it: passers-by and the neighbours.
  watchers(car, f, cls) {
    const g = this.g, horn = g.horn;
    if (g.time - this.seenT < 6) return;
    const seen = [];
    const consider = (c, ped) => {
      if (!c || c.state !== 'normal' || c.car || c === g.player || !c.root?.visible) return;
      const d = Math.min(dist(c.x, c.z, f.x0, f.z0), dist(c.x, c.z, car.x, car.z));
      if (d < (c.key ? NEIGHBOUR : SEE)) seen.push({ c, ped, d });
    };
    for (const p of g.peds) consider(p.char, p);
    for (const k in g.npcs) consider(g.npcs[k], null);
    if (!seen.length) return;
    this.seenT = g.time;
    seen.sort((a, b) => a.d - b.d);
    let talk = 2, neighbourSaid = g.time - this.watchT < 30;
    for (const { c, ped, d } of seen) {
      const key = c.key;
      let line = null, gesture, kind;
      if (key) {
        gesture = GESTURE[key] ?? null;
        kind = key === 'sara' || key === 'nasanin' ? 'cheer' : 'flinch';
        if (!neighbourSaid) {
          line = key === 'rune' ? RUNE_HORN[car.kind] || RUNE_HORN.default : WATCH[key] || null;
          if (line) { neighbourSaid = true; this.watchT = g.time; this.stats.neighbours++; }
        }
      } else {
        const kid = isKid(c), old = isOld(c), teen = isTeen(c);
        kind = kid ? 'cheer' : d < 7 ? 'leap' : 'flinch';
        gesture = kid ? 'cheer' : old ? (this.chance(0.7) ? 'fist' : null) : this.chance(0.25) ? 'fist' : null;
        if (talk > 0 && this.chance(kid ? 0.8 : 0.6)) {
          talk--;
          if (kid) line = pick([HONK_KID[0], HONK_KID[3]], this.rand);                                       // 'Igen!' / 'Häftigt!'
          else if (old) line = pick([HONK_OLD[0], HONK_OLD[2], PANIC[4]], this.rand);                        // 'Ungdomen nu för tiden!' / 'Mitt hjärta!' / 'Men herregud!'
          else if (teen) line = pick([HONK_TEEN[1], HONK_TEEN[2]], this.rand);                               // 'Lugna dig, gubbe!' / 'Chilla!'
          else line = pick([HONK_SCARED[0], HONK_SCARED[3], PANIC[4], HONK_CARFREE[0]], this.rand);          // 'Jösses!' / 'Jag fick nästan hjärtstopp!' / 'Men herregud!' / 'Det är bilfritt här!'
        }
      }
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), dx = c.x - car.x, dz = c.z - car.z;
      const p = { c, ped, along: dx * fx + dz * fz, lat: dx * -fz + dz * fx, d, front: false };
      if (horn.react(p, car, true, { kind, gesture, line, delay: 0.15 })) this.stats.watchers++;
    }
  }

  // A trailer coming down behind (trailer.js): impact = the speed into the ground.
  trailerBounce(tr, impact) {
    this.stats.trailer++;
    const k = this.near(tr.x, tr.z);
    if (k <= 0) return;
    FX.powder(tr.x, tr.y + 0.05, tr.z, 0, 0.6 + impact * 0.2, 0, Math.round(clamp(2 + impact * 0.5, 2, 7)), 0.8);
    audio.trailerClank(impact, k);
  }
}
