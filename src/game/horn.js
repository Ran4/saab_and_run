// The horn (feature tuta_med_bilen): T or H, a pad's L3 or RB, in whatever car Ove drives. It is not
// only a sound (main.js plays the car's own horn while it is held, audio.horn): the town reacts.
//   - People in front of the car get a fright: hands up, a yelp, and they leap out of its way (an
//     old one hurries aside, Parvaneh steps aside: she is pregnant), then turn round and say what
//     they think of it, some with a fist shaken at the car. Children leap too, and cheer: "Igen!".
//   - People close by flinch, look round and have an opinion. The neighbours answer in character:
//     Patrick leaps out of the way even when he isn't in it, the girls want more, Jimmy and Adrian
//     wave, Anders quotes the rules, and Rune, who hardly speaks, knows the car by its horn
//     ("...Saab.", "...Volvo."; Anita: "Han känner igen tutan, Ove.").
//   - Drivers honk back with their own car's horn (every make has its own: audio.js HORNS) and a
//     word or two; the one ahead going the same way speeds up; one that sat honking behind Ove leans
//     on its horn. Another Saab greets with two toots ("Saab-folk. Vi hälsar.").
//   - A smitare still sitting in a felparkerad car is spooked and flees (the chase is on); one being
//     chased gets nervous (it swerves) and loses motstånd: 5 a toot, 3/s while the horn is held.
//   - Ove has opinions (at most every 8 s). His passengers have theirs.
//   - Needless honking (nobody in front, no car ahead, or leaning on it) adds up: then it costs 2
//     Ordning ("Onödig tutning"), and Anders shouts the law at him from his house or someone shouts
//     from a window; Ove: "Det var fara." A long honk among houses gets a window shout by itself.
//   - Shave-and-a-haircut (five taps: long, short, short, long) is answered with two toots by the
//     nearest driver, and costs nothing.
//   - The cat by Ove's door jumps and hisses. Ove apologises: to the cat.
//   - A pickup (stages.js): someone waiting for Ove's car comes out to it when he honks.
// API: horn.update(dt) every frame (before the fixed steps), horn.drive(ch, dt, ped) from the
// people's own steps (true while a reaction steers them), horn.down (sounding: for audio.horn),
// horn.last ({ t, x, z, car }: the latest press), horn.stats (counts, for the scenarios).

import { audio } from '../audio.js';
import { hud } from './hud.js';
import { CHARS } from '../actors/models.js';
import { JUMP } from '../actors/character.js';
import { queryBlocks, BOX } from '../world/collision.js';
import { isCarFree } from '../world/layout.js';
import {
  HONK_SCARED, HONK_SIDEWALK, HONK_CARFREE, HONK_OLD, HONK_TEEN, HONK_KID, HONK_HEARD, HONK_BACK, SAAB_GREET, HONK_SMITARE,
  HONK_WINDOW, ANDERS_LAW, HONK_NEIGHBOUR, RUNE_HORN, ANITA_RUNE, HONK_PASSENGER, HONK_PASSENGER_ANY, OVE_HONK, whenOk,
} from './script.js';
import { clamp, dist, pick, yawTo, dampAngle } from '../util.js';

// The lines (script.js): HONK_* by who heard it, the neighbours' HONK_NEIGHBOUR (WHEN lines, like
// main.js' CHATTER), RUNE_HORN, ANITA_RUNE, HONK_PASSENGER, OVE_HONK.

// How likely a driver is to honk back, by make.
const TEMPER = { bmw: 0.9, audi: 0.85, taxi: 0.8, golf: 0.6, skoda: 0.5, kombi: 0.5, volvo240: 0.35, volvo740: 0.45, van: 0.6, bus: 0.75, garbage: 0.6 };

const FRONT_MIN = 16, FRONT_MAX = 34;   // m ahead of the bumper a honk reaches people (more at speed)
const NEAR = 15, NEAR_LONG = 24;        // m all round (a long honk: held over LONG s)
const LONG = 1.6;
const RESCAN = 0.7;                     // s between looks round while it is held
const CAR_REACH = 34;                   // m ahead for cars (either way)
const ANNOY = 5;                        // needless honking that brings a complaint

const isKid = (c) => c.def.kind === 'kid' || (c.def.age ?? 30) < 13;
const isTeen = (c) => !isKid(c) && (c.def.age ?? 30) < 19;
const isOld = (c) => (c.def.age ?? 30) >= 65;
function pickWhen(list, m, r) {
  const out = [];
  for (const l of list || []) if (typeof l === 'string') out.push(l); else if (whenOk(l[1], m)) out.push(l[0]);
  return out.length ? pick(out, r) : null;
}

export class Horn {
  constructor(game) {
    this.g = game;
    this.down = false;     // sounding this frame
    this.heldT = 0;        // how long the current honk has been held
    this.scanT = 0;
    this.longDone = false;
    this.taps = [];        // [{ t, len }]: the last presses (the rhythm)
    this.annoy = 0;        // needless honking, decaying (see complain)
    this.last = null;      // { t, x, z, car }: the latest press
    this.prevT = -1e9;     // the press before it
    this.later = [];       // [{ t, fn }]: reactions due, in game time (nothing happens while paused)
    this.saidT = -1e9; this.complainT = -1e9; this.windowT = -1e9; this.passT = -1e9; this.duetT = -1e9;
    this.saabT = -1e9; this.pursuitT = -1e9; this.smitT = -1e9; this.catT = -1e9; this.catLineT = -1e9; this.runeT = -1e9;
    this.cat = null;       // the home cat's fright in progress
    this.duetPending = null;
    this.rand = Math.random;   // (the scenarios make every chance come true)
    this.stats = { presses: 0, leaps: 0, flinches: 0, cheers: 0, lines: 0, ove: 0, honkBacks: 0, greets: 0, hurries: 0, spooked: 0, pressed: 0, complaints: 0, windows: 0, called: 0, cats: 0, duets: 0, passengers: 0 };
    this._r = { people: [], front: 0, frontAdults: 0, kids: 0, ahead: null, aheadAlong: 0, saab: false, empty: null, pursuit: false, warranted: false };
    this._blocks = [];
  }

  chance(p) { return this.rand() < p; }
  after(t, fn) { this.later.push({ t, fn }); }
  // Loudness of something at (x, z) for the one listening (Ove, or his car).
  vol(o) { const f = this.g.focus(); return clamp(1.25 - dist(o.x, o.z, f.x, f.z) / 45, 0.15, 1); }

  update(dt) {
    const g = this.g, car = g.playerCar;
    if (this.later.length) {
      const due = [];
      this.later = this.later.filter((l) => { l.t -= dt; if (l.t > 0) return true; due.push(l); return false; });
      for (const l of due) l.fn();
    }
    this.annoy = Math.max(0, this.annoy - dt * 0.25);
    const on = !!car && !car.dead && !g.inDialog && g.input.down('horn');
    if (on && !this.down) this.press(car);
    else if (on) this.hold(car, dt);
    else if (this.down) this.release();
    this.down = on;
    this.tickCat(dt);
  }

  press(car) {
    const g = this.g;
    this.heldT = 0; this.scanT = RESCAN; this.longDone = false;
    this.duetPending = null;
    this.stats.presses++;
    this.prevT = this.last ? this.last.t : -1e9;
    this.last = { t: g.time, x: car.x, z: car.z, car };
    this.taps.push({ t: g.time, len: -1 });
    if (this.taps.length > 6) this.taps.shift();
    const r = this.blast(car, false);
    const busy = this.passengers(car);
    this.opinion(car, r, busy);
    this.catFright(car);
    if (!r.warranted) this.annoy += 1;
    // (looked at a moment later: the fifth tap of a shave-and-a-haircut isn't needless)
    if (this.annoy >= ANNOY) this.after(0.6, () => { if (this.annoy >= ANNOY) this.complain(); });
  }

  hold(car, dt) {
    const g = this.g;
    this.heldT += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = RESCAN; this.blast(car, true); }
    // leaning on it is needless soon enough, whatever is in front
    if (this.heldT > 0.8) this.annoy += dt * 0.55;
    if (this.heldT > 2.2 && !this.longDone) { this.longDone = true; this.window(car); }
    const P = g.patrol.pursuit;
    if (P && !P.car.dead && this.heldT > 0.4 && dist(P.car.x, P.car.z, car.x, car.z) < 30) P.mot -= 3 * dt;
    // (a tap is judged a moment after it: see press)
    if (this.heldT > 0.5 && this.annoy >= ANNOY) this.complain();
  }

  release() {
    const tap = this.taps[this.taps.length - 1];
    if (tap && tap.len < 0) tap.len = this.g.time - tap.t;
    this.rhythm();
  }

  // ---------------------------------------------------------------------------------------------
  // A honk goes out: who hears it and what they do (held: a look round while it goes on - people
  // only, and fewer lines).

  blast(car, held) {
    const g = this.g;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -fz, rz = fx;
    const half = car.spec.len / 2, hw = car.spec.wid / 2;
    const long = held && this.heldT > LONG;
    const reach = clamp(FRONT_MIN + car.speed * 1.1, FRONT_MIN, FRONT_MAX) * (long ? 1.25 : 1);
    const near = long ? NEAR_LONG : NEAR;
    const ox = car.x + fx * half, oz = car.z + fz * half;   // the front bumper
    const r = this._r, people = r.people;
    people.length = 0;
    r.front = r.frontAdults = r.kids = 0; r.ahead = null; r.saab = false; r.empty = null; r.pursuit = false;
    const consider = (c, ped) => {
      if (c.state !== 'normal' || c.car || c === g.player) return;
      const dx = c.x - ox, dz = c.z - oz;
      if (Math.abs(dx) > reach + 3 || Math.abs(dz) > reach + 3) return;
      const along = dx * fx + dz * fz, lat = dx * rx + dz * rz;
      const front = along > -half && along < reach && Math.abs(lat) < hw + 1.0 + Math.max(0, along) * 0.06;
      const d = Math.hypot(c.x - car.x, c.z - car.z);
      if (!front && d > near) return;
      people.push({ c, ped, along, lat, d, front });
    };
    for (const p of g.peds) consider(p.char, p);
    for (const k in g.npcs) consider(g.npcs[k], null);
    people.sort((a, b) => a.d - b.d);
    let talk = held ? 1 : 3;   // bubbles one blast may start (the nearest first)
    for (const p of people) {
      const s = this.react(p, car, talk > 0);
      if (!s) continue;
      if (s.line) talk--;
      if (p.front) { r.front++; if (!isKid(p.c)) r.frontAdults++; }
      if (isKid(p.c)) r.kids++;
    }
    r.warranted = r.front > 0;
    if (held) return r;
    // The cars: ahead within reach (either lane, either way), close by all round, or sat honking
    // behind Ove.
    let spooked = false;
    for (const o of g.cars) {
      if (o === car || o.dead) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
      const along = dx * fx + dz * fz, lat = dx * rx + dz * rz, d = Math.hypot(dx, dz);
      const ahead = along > 0 && along < CAR_REACH + half && Math.abs(lat) < 6.5;
      const v = o.violation;
      if (v && v.smitare && !v.reported && !v.fleeing && !v.gone && (ahead || d < 25) && !g.patrol.pursuit && !g.patrol.suspended) {
        // a smitare sitting in its car: spooked, off it goes (the chase is on; not while a story
        // day runs, which has the patrol suspended)
        g.patrol.startPursuit(o);
        this.stats.spooked++;
        r.warranted = spooked = true;
        continue;
      }
      if (v && !v.reported && !o.driverBust && ahead && !r.empty) r.empty = o;
      if (!o.traffic || !o.ai) continue;
      const blocked = (o.ai.byPlayerT || 0) > 0 && d < 25;
      if (!(ahead || d < 14 || blocked)) continue;
      if (ahead || blocked) r.warranted = true;
      if (this.carReact(o, car, ahead, blocked) === 'saab') r.saab = true;
      if (ahead && (!r.ahead || along < r.aheadAlong)) { r.ahead = o; r.aheadAlong = along; }
    }
    // The smitare being chased (not the one this honk just set off): nervous (it swerves), and it
    // gives up sooner.
    const P = g.patrol.pursuit;
    if (P && !spooked && !P.car.dead && dist(P.car.x, P.car.z, car.x, car.z) < 30) {
      r.pursuit = true; r.warranted = true;
      if (g.time - this.pursuitT > 0.8) {
        this.pursuitT = g.time;
        P.mot -= 5;
        this.stats.pressed++;
        const ai = P.car.ai;
        if (ai && ai.mode === 'flee') {
          ai._w0 ??= ai.wobble;
          ai.wobble = 0.14;
          this.after(1.1, () => { if (P.car.ai === ai) ai.wobble = ai._w0; });
        }
        if (g.time - this.smitT > 4 && this.chance(0.6)) { this.smitT = g.time; this.after(0.5, () => this.speak(P.car, pick(HONK_SMITARE, this.rand), 1.8, 240)); }
      }
    }
    return r;
  }

  // Someone heard it: their reaction (c.honk, played out by drive()). p: { c, ped, along, lat, d, front }.
  // o: someone who saw something else (game/hoppbacke.js: a car flying off the snow hill), with
  // { kind ('leap' | 'cheer' | 'flinch'), gesture, line, delay } of their own; not counted in stats.
  react(p, car, mayTalk, o = null) {
    const g = this.g, c = p.c, key = c.key || null;
    // (not whoever is with Ove: they are on their way to his car)
    // (nor someone waiting for his car: stages.js pickup brings them out to it instead)
    if (c.honk || g.time < (c.honkCD || 0) || g.companions.has(c) || (c.pickupT || 0) > g.time) return null;
    const kid = isKid(c), old = isOld(c), teen = isTeen(c);
    const free = !c.wheelchair;
    // Patrick leaps out of the way whether or not he is in it.
    const jumpy = key === 'patrick' && p.d < 12;
    const kind = o?.kind ?? (free && (p.front || jumpy) ? 'leap' : kid ? 'cheer' : 'flinch');
    // sideways off the car's line, to the side they are on (never back along it: the camera is there)
    const side = Math.abs(p.lat) > 0.3 ? Math.sign(p.lat) : (this.rand() < 0.5 ? -1 : 1);
    const ex = -Math.cos(car.yaw) * side, ez = Math.sin(car.yaw) * side;
    // (Parvaneh is pregnant: she steps aside, briskly, and lets Ove know)
    const careful = old || key === 'parvaneh';
    const gesture = o && o.gesture !== undefined ? o.gesture : key === 'sara' || key === 'nasanin' || kid ? 'cheer'
      : key === 'jimmy' || key === 'adrian' ? 'wave'
      : key === 'anders' || key === 'parvaneh' ? 'fist'
      : key ? null : this.chance(old ? 0.75 : p.front ? 0.5 : 0.3) ? 'fist' : null;
    const talks = mayTalk && (key ? this.chance(key === 'rune' ? 0.7 : 0.9) : this.chance(p.front ? 0.9 : kid ? 0.7 : 0.45));
    const s = c.honk = {
      kind, t: 0, phase: 0, car, front: p.front, ex, ez,
      // the line they get clear of: the car's centre line at the honk
      ox: car.x, oz: car.z, rx: -Math.cos(car.yaw), rz: Math.sin(car.yaw), clear: car.spec.wid / 2 + 1.4,
      delay: (o?.delay ?? 0) + (kid ? 0.06 : old ? 0.28 : 0.1) + this.rand() * 0.15 + Math.min(0.3, p.d * 0.012),
      speed: careful ? (old ? 2.6 : 3.2) : kid ? 5.0 : teen ? 6.0 : 5.4,
      jumpV: careful ? 0 : kid ? 3.6 : 3.4 + this.rand() * 0.6,
      hop: kind === 'flinch' && !careful && !c.wheelchair && this.chance(0.6) ? 2.1 : kind === 'cheer' ? 2.8 : 0,
      run: kind === 'leap' ? (old ? 1.8 : 1.25) : 0.5,
      stand: kind === 'leap' ? 1.5 + this.rand() * 0.5 : kind === 'cheer' ? 1.9 : 1.3,
      yelp: kind === 'leap' || (kind === 'flinch' && this.chance(0.45)),
      gesture, wave: false,
      line: o ? o.line ?? null : talks ? this.lineFor(c, p, car) : null,
    };
    if (o) return s;
    this.stats[kind === 'leap' ? 'leaps' : kind === 'cheer' ? 'cheers' : 'flinches']++;
    // Rune spoke: Anita, if she is with him, explains.
    if (key === 'rune' && s.line && g.time - this.runeT > 30) {
      this.runeT = g.time;
      const an = g.npcs.anita;
      if (an && an.state === 'normal' && !an.car && dist(an.x, an.z, c.x, c.z) < 15) this.after(s.delay + 2.0, () => this.speak(an, ANITA_RUNE, 2.6, an.def.voice));
    }
    return s;
  }

  lineFor(c, p, car) {
    const g = this.g;
    if (c.key === 'rune') return RUNE_HORN[car.kind] || RUNE_HORN.default;
    if (c.key) return pickWhen(HONK_NEIGHBOUR[c.key], g.missions, this.rand);
    if (isKid(c)) return pick(HONK_KID, this.rand);
    if (p.front && isCarFree(car.x, car.z)) return pick(HONK_CARFREE, this.rand);
    if (p.front && g.surfaceAt(car.x, car.z) !== 'asphalt') return pick(HONK_SIDEWALK, this.rand);
    if (isTeen(c)) return pick(HONK_TEEN, this.rand);
    if (isOld(c)) return pick(HONK_OLD, this.rand);
    return pick(p.front ? HONK_SCARED : HONK_HEARD, this.rand);
  }

  // Play out someone's reaction (from Ped.update and main.js stepNpcs): true while it steers them.
  // 1: the fright (a yelp, hands up; a leap or a hurried step out of the way, a flinch, a child's
  // hop); 2: turned to face the car, a line and a gesture; then back to whatever they were doing.
  drive(c, dt, ped = null) {
    const s = c.honk;
    if (!s) return false;
    if (c.state !== 'normal' || c.car) { this.endScare(c, ped); return false; }
    s.t += dt;
    if (s.t < s.delay) return false;
    const g = this.g, a = c.anim, t = s.t - s.delay, car = s.car;
    if (s.phase === 0) {
      s.phase = 1;
      if (s.yelp) audio.yelp(c.def.voice || 300, this.vol(c) * (s.kind === 'leap' ? 1 : 0.6));
      if (s.kind === 'leap' && s.jumpV > 0) c.jump(s.jumpV, JUMP.leap);
      else if (s.hop) c.jump(s.hop, JUMP.leap);
    }
    if (s.phase === 1) {
      let done;
      if (s.kind === 'leap') {
        a.fright = true; a.yell = t < 0.5;
        c.wishX = s.ex * s.speed; c.wishZ = s.ez * s.speed;
        const lat = Math.abs((c.x - s.ox) * s.rx + (c.z - s.oz) * s.rz);
        done = t > s.run || (t > 0.45 && (s.front ? lat > s.clear : t > 0.7));
      } else {
        a.fright = s.kind === 'flinch' && t < 0.45; a.yell = a.fright;
        c.wishX = c.wishZ = 0;
        done = t > s.run;
      }
      if (done) { s.phase = 2; s.t2 = t; a.yell = false; }
    }
    if (s.phase === 2) {
      const u = t - s.t2;
      // (still in the air from the leap: carry on over)
      if (c.onGround && !c.jumping && c.windT < 0) { c.wishX = c.wishZ = 0; a.fright = false; }
      if (u > 0.12) c.yaw = dampAngle(c.yaw, yawTo(car.x - c.x, car.z - c.z), 7, dt);
      if (!s.said && u > 0.2) {
        s.said = true;
        if (s.line && !g.inDialog) { this.speak(c, s.line, 2.4, c.def.voice); this.stats.lines++; }
      }
      a.fist = s.gesture === 'fist' && u > 0.15;
      a.cheer = s.gesture === 'cheer' && u > 0.1;
      s.wave = s.gesture === 'wave' && u > 0.1;
      if (u > s.stand) { this.endScare(c, ped); return false; }
    }
    return true;
  }

  endScare(c, ped = null) {
    const s = c.honk;
    if (!s) return;
    const a = c.anim;
    a.fright = a.fist = a.yell = false;
    if (s.gesture === 'cheer') a.cheer = false;
    c.honk = null;
    c.honkCD = this.g.time + 1.5;
    // back onto the pavement and on with the walk (a leap may have ended in the road or a garden)
    if (ped && s.kind === 'leap') ped.rehome?.();
  }

  // Say something (a bubble and a murmur or two). target: a character, a car, or a window.
  speak(target, text, secs = 2, pitch = 260) {
    if (!text || this.g.inDialog) return;
    // (with the voices on, say() says it - a clip or a murmur - when it is their turn)
    if (this.g.say(target, text, secs)) return;
    audio.talk(pitch);
    this.after(0.23, () => audio.talk(pitch));
  }

  // ---------------------------------------------------------------------------------------------
  // Drivers

  // A traffic car heard it: ahead (either way), close by, or blocked (it sat honking behind Ove).
  carReact(o, car, ahead, blocked) {
    const g = this.g;
    if (g.time < (o.honkCD || 0)) return null;
    o.honkCD = g.time + 2.5;
    // Saab drivers greet each other (when Ove drives a Saab too)
    if (o.kind === 'saab900' && car.kind === 'saab900' && !blocked) {
      this.stats.greets++;
      this.after(0.45 + this.rand() * 0.2, () => {
        const v = this.vol(o);
        audio.honk(v, 0.11, 'saab900'); audio.honk(v, 0.11, 'saab900', 0.2);
        if (this.chance(0.5)) this.speak(o, pick(SAAB_GREET, this.rand), 1.8, 260);
      });
      if (g.time - this.saabT > 20) { this.saabT = g.time; this.after(1.5, () => this.oveSays(OVE_HONK.saab, true)); }
      return 'saab';
    }
    // the one ahead going the same way speeds up a little
    const same = ahead && Math.cos(o.yaw - car.yaw) > 0.5;
    if (same && o.ai.mode === 'traffic') { o.ai.hurryT = 3; this.stats.hurries++; }
    if (!this.chance(blocked ? 1 : TEMPER[o.kind] ?? 0.5)) return null;
    this.stats.honkBacks++;
    const lines = blocked ? HONK_BACK.blocked : HONK_BACK[o.kind] || (same ? [...HONK_BACK.default, ...HONK_BACK.ahead] : HONK_BACK.default);
    this.after(0.35 + this.rand() * 0.45, () => {
      if (o.dead) return;
      const v = this.vol(o);
      if (blocked) audio.honk(v, 0.9, o.kind);
      else { audio.honk(v, 0.18, o.kind); if (this.chance(0.5)) audio.honk(v, 0.18, o.kind, 0.27); }
      if (this.chance(0.65)) this.speak(o, pick(lines, this.rand), 2, 170 + this.rand() * 200);
      if (this.chance(0.35)) this.after(1.4, () => this.oveSays(OVE_HONK.back));
    });
    return 'back';
  }

  // ---------------------------------------------------------------------------------------------
  // Ove, his passengers, the neighbourhood

  oveSays(list, force = false) {
    const g = this.g;
    if (g.inDialog || (!force && g.time - this.saidT < 8)) return false;
    this.saidT = g.time;
    if (!g.say(g.player, pick(list, this.rand), 2.2)) audio.talk(CHARS.ove.voice);
    this.stats.ove++;
    return true;
  }

  // What Ove thinks of what he just honked at (busy: a passenger is saying something: later).
  opinion(car, r, busy) {
    const g = this.g, wait = busy ? 2.4 : 0;
    if (r.saab) return;   // (the greeting has its own line)
    let list = null, at = 0.7;
    if (r.pursuit) { if (this.chance(0.5)) { list = OVE_HONK.smitare; at = 0.3; } }
    else if (r.kids && !r.frontAdults && this.chance(0.5)) { list = OVE_HONK.kids; at = 1.8; }
    else if (r.frontAdults && this.chance(0.55)) { list = OVE_HONK.walker; at = 1.2; }
    else if (r.ahead && this.chance(0.5)) list = this.chance(0.5) && OVE_HONK[r.ahead.kind] || OVE_HONK.car;
    else if (r.empty && this.chance(0.7)) list = OVE_HONK.empty;
    else if (!r.people.length && !r.ahead && !r.pursuit && g.time - this.prevT > 20 && this.chance(0.6)) list = OVE_HONK.none;
    if (list) this.after(at + wait, () => this.oveSays(list));
  }

  // A passenger in Ove's car has something to say about it (returns true if they will).
  passengers(car) {
    const g = this.g;
    if (g.time - this.passT < 10) return false;
    const ps = car.passengers.filter((p) => p.key);
    if (!ps.length || !this.chance(0.7)) return false;
    const p = pick(ps, this.rand);
    const line = p.key === 'rune' ? RUNE_HORN[car.kind] || RUNE_HORN.default : pick(HONK_PASSENGER[p.key] || HONK_PASSENGER_ANY, this.rand);
    this.passT = g.time;
    this.stats.passengers++;
    // (a bubble over the car, a little above Ove's)
    const at = { get x() { return car.x; }, get y() { return car.y; }, get z() { return car.z; }, height: car.height + 0.75 };
    this.after(0.5, () => this.speak(at, line, 2.2, p.def.voice));
    return true;
  }

  // Too much needless honking: it costs, and somebody says so.
  complain() {
    const g = this.g, car = g.playerCar || this.last?.car;
    if (!car || g.time - this.complainT < 30) return;
    this.complainT = g.time;
    this.annoy = 0;
    this.stats.complaints++;
    g.patrol.addOrdning(-2);
    hud.toast('Onödig tutning · −2 Ordning', 'bad');
    const an = g.npcs.anders;
    if (an && an.state === 'normal' && !an.car && dist(an.x, an.z, car.x, car.z) < 70 && !g.inDialog) {
      g.shout('anders', pick(ANDERS_LAW, this.rand));
      g.murmur(an.def.voice);
      this.after(2.6, () => this.oveSays(OVE_HONK.law, true));
    } else if (this.window(car, true)) this.after(2.4, () => this.oveSays(OVE_HONK.window, true));
  }

  // Someone in the nearest house shouts from a window (force: whatever the last one was).
  window(car, force = false) {
    const g = this.g;
    if (g.inDialog || (!force && g.time - this.windowT < 25)) return false;
    const w = this.nearHouse(car.x, car.z);
    if (!w) return false;
    this.windowT = g.time;
    this.stats.windows++;
    this.speak(w, pick(HONK_WINDOW, this.rand), 2.6, 190 + this.rand() * 220);
    return true;
  }
  // A point on the nearest house wall within 32 m, upstairs (a box collider over 4.5 m tall).
  nearHouse(x, z) {
    const list = queryBlocks(x - 32, z - 32, x + 32, z + 32, this._blocks);
    let best = null, bd = 32;
    for (const b of list) {
      if (b.shape !== BOX || b.top < 4.5 || b.maxX - b.minX < 4 || b.maxZ - b.minZ < 4) continue;
      const px = clamp(x, b.minX, b.maxX), pz = clamp(z, b.minZ, b.maxZ), d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, y: 2.2, z: pz, height: 1 }; }
    }
    return best;
  }

  // The cat by Ove's door (after day 4): a jump straight up, a half turn, a hiss.
  catFright(car) {
    const g = this.g, cat = g.homeCat;
    if (!cat || !cat.root.visible || this.cat || g.time - this.catT < 6) return;
    const p = cat.root.position, d = dist(p.x, p.z, car.x, car.z);
    if (d > 25) return;
    this.catT = g.time;
    this.stats.cats++;
    this.cat = { t: 0, y0: p.y, yaw0: cat.root.rotation.y, spin: (this.rand() < 0.5 ? -1 : 1) * 2.4 };
    cat.sit(false);
    audio.hiss(clamp(1.3 - d / 25, 0.3, 1));
    if (g.time - this.catLineT > 40) { this.catLineT = g.time; this.after(1.1, () => this.oveSays(OVE_HONK.cat, true)); }
  }
  tickCat(dt) {
    const s = this.cat, cat = this.g.homeCat;
    if (!s) return;
    if (!cat) { this.cat = null; return; }
    s.t += dt;
    const r = cat.root, T = 0.42, k = Math.min(1, s.t / T);
    r.position.y = s.y0 + Math.sin(Math.PI * k) * 0.34;
    r.rotation.y = s.yaw0 + s.spin * k * k * (3 - 2 * k);
    if (k >= 1) { r.position.y = s.y0; this.cat = null; }
  }

  // Shave-and-a-haircut: five short taps, long-short-short-long (the middle two gaps the quicker).
  // Two bits answer from the nearest driver, a rest and two beats later.
  rhythm() {
    const g = this.g, T = this.taps, n = T.length;
    if (n < 5 || g.time - this.duetT < 8) return;
    const a = T.slice(n - 5);
    if (a.some((x) => x.len < 0 || x.len > 0.4)) return;
    const gp = [1, 2, 3, 4].map((i) => a[i].t - a[i - 1].t), span = a[4].t - a[0].t;
    if (span < 0.8 || span > 3.2) return;
    const outer = Math.min(gp[0], gp[3]);
    if (!(gp[1] < outer * 0.8 && gp[2] < outer * 0.8)) return;
    // (the five a phrase of their own, not the end of a longer drumming)
    if (n > 5 && a[0].t - T[n - 6].t < outer * 1.6) return;
    const beat = clamp((gp[0] + gp[3]) / 2, 0.2, 0.7);
    this.annoy = Math.max(0, this.annoy - 5);
    const pending = (this.duetPending = { beat });
    this.after(Math.max(0.05, beat * 2 - (g.time - a[4].t)), () => { if (this.duetPending === pending) this.duet(beat); });
  }
  duet(beat) {
    const g = this.g, f = g.focus();
    this.duetPending = null;
    let best = null, bd = 90;
    for (const c of g.cars) {
      if (!c.traffic || c.dead || c === g.playerCar) continue;
      const d = dist(c.x, c.z, f.x, f.z);
      if (d < bd) { bd = d; best = c; }
    }
    const v = best ? clamp(1.25 - bd / 70, 0.25, 1) : 0.2, kind = best?.kind || 'default';
    audio.honk(v, beat * 0.45, kind);
    audio.honk(v, beat * 0.45, kind, beat);
    this.duetT = g.time;
    this.stats.duets++;
    this.after(beat * 2 + 0.7, () => this.oveSays(OVE_HONK.duet, true));
  }
}
