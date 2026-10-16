// Saab & Run — the city bus's passengers (feature bussen_ar_inte_en_bil). A traffic bus carries
// BUSS.min-max of them, always one tant (an old woman) among them: seated busts with their hands in
// their laps on the bus model's `benches`, baked one a frame (each ~4 ms: models.js bakeBust) and
// merged into one mesh (two draw calls for the lot; hidden with the car's far LOD, disposed with
// the car: car.riders). They stay aboard whoever drives it: nobody gets on or off. While Ove drives
// a bus with people in it:
//   - as he first takes the wheel one of them asks where the driver went (BUS_ABOARD);
//   - what he drives into is commented on (BUS_HIT by kind: a car, a person knocked over, anything
//     else, a landing after a jump; someone in the road who got out of its way), at most every
//     BUSS.hitGap s, an old one now and then with BUS_HIT_OLD, after a hard one a second voice;
//   - now and then (BUSS.ride s) somebody says something (BUS_RIDE; the old ones BUS_OLD.ride), and
//     the tant wants to get off: "Jag ska av här!" at random and as the bus comes to a bus stop;
//     driven past it without stopping, "Du körde förbi min hållplats!";
//   - Ove answers some of it (BUS_REPLY by their line, OVE_BUS_HIT after a hit).
// The bubble is over the roof where the speaker sits; the voice is theirs from the pool
// (voice.poolVoice: sex, age, seed), heard as a passenger ('car'); Ove's answers dry ('dialog').
// API: board(car, r, now) (main.js spawnTrafficCar; now: baked at once), unboard(car), aboard(car)
// (main.js enterCar), onImpact(a, b, impact) (onCarImpact), onHit(car, kind) ('person': onCharHit,
// 'any': a prop broken, 'near': someone shoved aside), onLanded(car, impact), onFlight(car)
// (onCarLanded / onCarFlight), update(dt), talk(car, kind) (tests: a line of that kind now),
// stats, log (the last 30 lines), rand (tests make chance come true).

import { bakeBust, mergeBusts, randomPed } from '../actors/models.js';
import { voice } from '../voice.js';
import { landmarks } from '../world/layout.js';
import { BUS_STOPS } from '../world/streets.js';
import { BUS_ABOARD, BUS_HIT, BUS_HIT_OLD, BUS_RIDE, BUS_OLD, BUS_REPLY, OVE_BUS_HIT } from './script.js';
import { dist, pick } from '../util.js';

export const BUSS = {
  min: 5, max: 9,      // passengers a traffic bus carries
  bakeMs: 3,           // ms of baking a frame (at least one bust)
  hitMin: 3,           // m/s: an impact worth a word
  hitGap: 4,           // s between two comments on what Ove hits
  hard: 9,             // m/s: a hit that makes two of them speak up
  ride: [18, 34],      // s between their own remarks
  stop: 30,            // m from a bus stop: the tant wants off there
  past: 45,            // m beyond it: he drove past it
  reply: 0.5,          // how often Ove answers what has an answer
};

// The bubble's anchor: over the roof above where the passenger sits (local +x = the car's left).
function anchor(car, at) {
  return {
    get x() { return car.x + at[0] * Math.cos(car.yaw) + at[2] * Math.sin(car.yaw); },
    get y() { return car.y; },
    get z() { return car.z - at[0] * Math.sin(car.yaw) + at[2] * Math.cos(car.yaw); },
    height: car.height + 0.1,
  };
}

export class Bussen {
  constructor(g) {
    this.g = g;
    this.queue = [];          // buses whose passengers are still being baked
    this.later = [];
    this.cur = null;          // the bus Ove drives (with people in it)
    this.hitT = -99; this.rideT = 0; this.offT = -99;
    this.last = [];           // the latest lines (none of them again for a while)
    this.stats = { boarded: 0, riders: 0, baked: 0, lines: 0, replies: 0, kinds: {} };
    this.log = [];
    this.rand = Math.random;
  }
  chance(p) { return this.rand() < p; }
  after(t, fn) { this.later.push({ t, fn }); }

  // ---------------------------------------------------------------------------------------------
  // Aboard

  board(car, r = Math.random, now = false) {
    const seats = car.model.benches;
    if (!seats?.length || car.riders) return;
    // (not where a companion would sit: the model's rear seats are on the benches too)
    const rear = car.model.rear, free = seats.filter((s) => !rear || Math.abs(s[2] - rear[2]) > 0.5);
    const n = Math.min(free.length, BUSS.min + Math.floor(r() * (BUSS.max - BUSS.min + 1)));
    const list = [];
    for (let k = 0; k < n; k++) {
      // the tant first, then grown-ups and teenagers (no children: their voices say none of this)
      let def = randomPed(r);
      for (let i = 0; i < 60 && (k === 0 ? def.sex !== 'f' || def.age < 65 : def.age < 13); i++) def = randomPed(r);
      const at = free.splice(Math.floor(r() * free.length), 1)[0];
      list.push({ def, at, look: (r() - 0.5) * 1.4, old: def.age >= 65, tant: k === 0 && def.sex === 'f' && def.age >= 65 });
    }
    car.riders = { list, parts: [], mesh: null, met: false, wanted: null, stopped: false, near: null };
    this.stats.boarded++;
    this.stats.riders += n;
    this.queue.push(car);
    if (now) while (this.queue.includes(car)) this.bake(car);
  }
  // One more passenger baked; the last one puts them all in the bus as one mesh.
  bake(car) {
    const R = car.riders;
    if (!R || car.disposed) { this.queue.splice(this.queue.indexOf(car), 1); return; }
    const p = R.list[R.parts.length];
    R.parts.push({ geo: bakeBust(p.def, { driving: false, look: p.look }), at: p.at });
    this.stats.baked++;
    if (R.parts.length < R.list.length) return;
    this.queue.splice(this.queue.indexOf(car), 1);
    R.mesh = mergeBusts(R.parts);
    R.parts = [];
    car.tilt.add(R.mesh);
    // (it never moves in the car's frame: a fixed matrix, like the car's own meshes; inside the
    // bus's own shadow, it casts none: not in the shadow pass)
    R.mesh.matrixAutoUpdate = false; R.mesh.updateMatrix();
    R.mesh.castShadow = false;
    R.mesh.visible = !car.lod;
  }
  // A wrecked bus: whoever was in it is gone from it.
  unboard(car) {
    const R = car.riders;
    if (!R) return;
    if (R.mesh) { R.mesh.parent?.remove(R.mesh); R.mesh.geometry.dispose(); }
    car.riders = null;
  }
  // Ove takes the wheel (enterCar, after he is in it): the first time, where did the driver go?
  aboard(car) {
    const R = car.riders;
    if (!R?.list.length || R.met) return;
    R.met = true;
    this.rideT = this.g.time + BUSS.ride[0];
    this.after(1.4, () => { if (this.g.playerCar === car) this.say(car, this.rider(R), BUS_ABOARD); });
  }

  // ---------------------------------------------------------------------------------------------
  // What happens to the bus

  driving(car) { return car && car === this.g.playerCar && !car.dead && car.riders?.list.length; }
  onImpact(a, b, impact) {
    const pc = this.g.playerCar;
    if (impact < BUSS.hitMin || (a !== pc && b !== pc)) return;
    this.onHit(pc, b ? 'car' : 'any', impact);
  }
  onLanded(car, impact) { if (impact > 6) this.onHit(car, 'flight', impact); }
  onFlight(car) { this.onHit(car, 'flight', 10); }
  onHit(car, kind, impact = 6) {
    const g = this.g;
    if (!this.driving(car) || g.inDialog) return;
    // (someone knocked over is said whatever was said just before; someone who leapt aside, now and then)
    if (g.time - this.hitT < (kind === 'person' ? 1.2 : BUSS.hitGap)) return;
    if (kind === 'near' && !this.chance(0.4)) return;
    this.hitT = g.time;
    const R = car.riders, a = this.rider(R);
    const lines = (p) => (p.old && kind !== 'person' && kind !== 'near' && this.chance(0.35) ? BUS_HIT_OLD : kind === 'any' ? BUS_HIT.any : kind === 'car' ? [...BUS_HIT.car, ...BUS_HIT.any] : BUS_HIT[kind]);
    const r = this.say(car, a, lines(a), kind);
    // a hard one: somebody else too
    if (impact >= BUSS.hard && R.list.length > 1 && kind !== 'near') {
      const b = this.rider(R, a);
      this.after(0.7, () => { if (this.driving(car)) this.say(car, b, lines(b), kind); });
    }
    // Ove: it was in the way (not a person: he says nothing to that)
    if ((kind === 'car' || kind === 'any') && r && !BUS_REPLY[r.text] && this.chance(0.3)) this.answer(r, pick(OVE_BUS_HIT, this.rand));
  }

  // ---------------------------------------------------------------------------------------------
  // The ride

  update(dt) {
    // the baking: a bust or so a frame
    if (this.queue.length) {
      const t0 = performance.now();
      do this.bake(this.queue[0]); while (this.queue.length && performance.now() - t0 < BUSS.bakeMs);
    }
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if ((l.t -= dt) <= 0) { this.later.splice(i, 1); l.fn(); }
    }
    const g = this.g, car = g.playerCar;
    if (!this.driving(car) || !car.riders.met) { this.cur = null; return; }
    const R = car.riders;
    if (this.cur !== car) { this.cur = car; this.rideT = Math.max(this.rideT, g.time + BUSS.ride[0]); }
    if (g.inDialog || g.cold.busy || g.failWait) return;
    this.stops(car, R);
    if (g.time > this.rideT) {
      this.rideT = g.time + BUSS.ride[0] + this.rand() * (BUSS.ride[1] - BUSS.ride[0]);
      const tant = R.list.find((p) => p.tant), old = R.list.filter((p) => p.old);
      if (tant && g.time - this.offT > 40 && this.chance(0.35)) this.off(car, tant);
      else if (old.length && this.chance(0.25)) this.say(car, pick(old, this.rand), BUS_OLD.ride, 'ride');
      else this.say(car, this.rider(R), BUS_RIDE, 'ride');
    }
  }
  // The bus stops (their landmarks: beside each shelter). Coming up to one the tant wants off there;
  // driven past it without stopping near it, she says so.
  stops(car, R) {
    const g = this.g, tant = R.list.find((p) => p.tant);
    if (!tant) return;
    const list = (this._stops ||= BUS_STOPS.map((b) => landmarks[b.lm]).filter(Boolean));
    let near = null;
    for (const s of list) if (dist(s.x, s.z, car.x, car.z) < BUSS.stop) near = s;
    if (near && near !== R.near && car.speed > 2 && g.time - this.offT > 12) { R.wanted = near; R.stopped = false; this.off(car, tant); }
    R.near = near;
    const w = R.wanted;
    if (!w) return;
    const d = dist(w.x, w.z, car.x, car.z);
    if (d < BUSS.stop && car.speed < 0.8) R.stopped = true;
    if (d > BUSS.past) {
      R.wanted = null;
      if (!R.stopped && this.chance(0.7)) this.say(car, tant, [BUS_OLD.missed], 'missed');
    }
  }
  off(car, tant) { this.offT = this.g.time; this.say(car, tant, [BUS_OLD.off], 'off'); }

  // ---------------------------------------------------------------------------------------------
  // Saying it

  // Somebody aboard (not `not`), at random.
  rider(R, not = null) {
    const l = R.list.length > 1 && not ? R.list.filter((p) => p !== not) : R.list;
    return pick(l, this.rand);
  }
  // A passenger says one of `lines` (not one of the latest, if it can be helped); Ove may answer.
  say(car, p, lines, kind = 'aboard') {
    const g = this.g;
    if (!p || g.inDialog) return null;
    const fresh = lines.filter((t) => !this.last.includes(t));
    const text = pick(fresh.length ? fresh : lines, this.rand);
    this.last.push(text);
    if (this.last.length > 4) this.last.shift();
    const at = anchor(car, p.at);
    const who = voice.poolVoice(p.def, at);
    const u = g.say(at, text, 2.4, { who, mode: car === g.playerCar ? 'car' : 'world' });
    if (!u) g.murmur(p.def.voice);
    this.stats.lines++;
    this.stats.kinds[kind] = (this.stats.kinds[kind] || 0) + 1;
    this.log.push({ t: +g.time.toFixed(2), kind, text, who, tant: !!p.tant, old: p.old, at: p.at });
    if (this.log.length > 30) this.log.shift();
    const r = { u, text };
    if (BUS_REPLY[text] && this.chance(BUSS.reply)) this.answer(r, BUS_REPLY[text]);
    return r;
  }
  // Ove answers once the line has been said.
  answer(r, text) {
    const g = this.g, go = () => this.after(0.35, () => {
      if (!g.playerCar || g.inDialog) return;
      this.stats.replies++;
      this.log.push({ t: +g.time.toFixed(2), kind: 'ove', text, who: 'ove' });
      if (!g.say(g.player, text, 2.2, { mode: 'dialog' })) g.murmur(g.player.def.voice);
    });
    if (r?.u) r.u.ended.then(go); else this.after(1.6, go);
  }

  // Tests: a line of this kind now ('aboard', 'ride', 'off', 'missed', or a hit's kind).
  talk(car, kind) {
    const R = car?.riders;
    if (!R) return null;
    const tant = R.list.find((p) => p.tant) || R.list[0];
    if (kind === 'aboard') return this.say(car, this.rider(R), BUS_ABOARD, kind);
    if (kind === 'ride') return this.say(car, this.rider(R), BUS_RIDE, kind);
    if (kind === 'off') return this.say(car, tant, [BUS_OLD.off], kind);
    if (kind === 'missed') return this.say(car, tant, [BUS_OLD.missed], kind);
    this.hitT = -99;
    return this.onHit(car, kind);
  }
}
