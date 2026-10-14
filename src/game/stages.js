// Stage kinds shared by the avbrott (interruptions.js) and the story (missions.js).
//
// A stage is a plain object made fresh by a factory, e.g. `holdAt({ at: 'runeHouse', secs: 3,
// label: 'Lufta elementet' })`. The runner calls, all optional except update:
//   init(g, m)            once, when the stage starts
//   update(g, m, dt)      every frame -> 'done' | { fail: 'reason' } | undefined
//   cleanup(g, m)         when the stage ends (done, failed or aborted)
//   text / sub            objective line (sub, when set, replaces text: "Kliv ur bilen" ...)
//   target(g)             { x, z, r, follow?, noBeacon? } where the beacon / arrow / route point
//   altTarget(g)          overrides target() (e.g. a passenger left behind)
//   markers(g)            extra minimap markers [{ type, x, z, edge }]
//   obj(g)                { timer, bar, barLabel, barColor } for the objective / errand panel
//   prompt(g)             { text, hold?, takesE? } shown at the bottom; takesE = the stage reads
//                         the E key itself (main.js then won't use E to get in cars etc.)
//   tags(g)               world tags [{ x, y, z, text, cls }]
// `g` is the Game (main.js), `m` the context shared by a mission's or errand's stages:
//   { def, cars: [], items: [], data: {} } — cars are removed at the end, items are cleanup
//   functions, data is free for stages (data.carrying, data.cat, data.npcs ...). See newCtx /
//   disposeCtx. Text is Swedish (player-facing). What a stage says by itself (COMING, CAT_COMES,
//   CHASER_GAVE_UP) is in script.js; the lines a stage is given (hello, bye, radio, calls, lines,
//   goLine ...) come from script.js through missions.js and interruptions.js.

import { THREE } from '../gfx.js';
import { lm, landmarks, nodeX, nodeZ, nodeId, nearestNode, neighbors, findPath, LANE, NN, isRoad, edgeDist } from '../world/layout.js';
import { pedLoops } from '../world/town.js';
import { AIDriver, LanePath, startNodes } from '../actors/drivers.js';
import { Collectible } from '../actors/pickups.js';
import { buildCat } from '../actors/models.js';
import { GeoBuilder, realMesh } from '../gfx.js';
import { queryBlocks, circleVsBlock, circleVsObb, groundAt, topAt, RAMP, segmentBlocked } from '../world/collision.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { hud } from './hud.js';
import { fx as FX } from './fx.js';
import { COMING, CAT_COMES, CHASER_GAVE_UP } from './script.js';
import { COLDK, coldRate } from './cold.js';
import { dist, yawTo, pick, angleDiff, clamp } from '../util.js';

// A place: a landmark name, a { x, z, yaw } object, or a function (g) => place.
export const at = (p, g) => (typeof p === 'string' ? lm(p) : typeof p === 'function' ? p(g) : p);
// A world landmark that may not exist yet (the world adds it later): the landmark, else `fallback`.
export const lmOr = (name, fallback) => (g) => landmarks[name] || (typeof fallback === 'function' ? fallback(g) : fallback);

export function newCtx(def = {}) { return { def, cars: [], items: [], data: { npcs: new Set() } }; }

// End of a mission or errand: remove its cars, run its cleanups, send the people it borrowed home.
export function disposeCtx(g, m) {
  if (!m) return;
  for (const c of m.cars) {
    for (const p of [c.driver, ...c.passengers]) if (p && p !== g.player) g.unseat(p);
    g.removeCar(c);
  }
  m.cars.length = 0;
  for (const f of m.items) { try { f(); } catch (e) { console.error(e); } }
  m.items.length = 0;
  for (const n of m.data.npcs || []) g.releaseNpc(n);
  m.data.npcs?.clear();
  if (g.carrying && m.data.cat && g.carrying === m.data.cat) g.setCarrying(null);
}

const nameOf = (g, key) => g.charDef(key)?.name || key;
const onFoot = (g) => !g.playerCar && g.player.state === 'normal';

// ---------------------------------------------------------------------------------------------

// Get in a car: any car, or a named one (`car: 'patrickCar'`, `any: false` to insist on it).
export const getInCar = (o = {}) => ({
  kind: 'getInCar',
  text: o.text || 'Kliv in i en bil',
  init(g) { if (o.car) this.car = g.ensureNamedCar(o.car); },
  target(g) { return this.car && g.playerCar !== this.car ? { x: this.car.x, z: this.car.z, r: 3.5 } : null; },
  update(g) {
    this.sub = null;
    // (a named car wrecked before Ove got in: no way on - the retry brings a new one)
    if (this.car?.dead && !o.any) return { fail: 'Bilen är kvaddad.' };
    if (!g.playerCar) return;
    if (!this.car || g.playerCar === this.car || o.any) return 'done';
    this.sub = o.wrongText || 'Fel bil.';
  },
});

// Go somewhere. o: { to (place) | who (an NPC key: go to them), radius = 7, text, timer, failText,
// inCar, onFoot, stop (must have stopped, in a car), with: [npc keys that must come along],
// radio: [[who, text], ...] (toasts on the way: the first after radioFirst = 6 s, then every
// radioEvery = 7 (+0..2) s; never over a phone call), calls: [[who, text, oveReply], ...]
// (neighbours phoning in on the way: the ring, the call card, Ove's reply; callFirst = 5 s,
// callEvery = 11 s; a call still going when Ove arrives is cut off), chaser: { type, color, name,
// who, cruise, catchFails, catchText, stun = 2.5, kr = 20, stopText, lines, at (a place: it waits
// parked there), car ((g, m) => an existing mission car to use, e.g. parked there since the day
// began), wait (s it stays parked; wake = it starts at once when Ove comes this close), goLine
// (its driver's radio line when it sets off), rubber (d => factor on its cruising speed; default
// 1.3 beyond 80 m, 1.15 beyond 50 m: it catches up on the straights, it still brakes for corners
// like anyone) } (a car that hunts Ove, like the Hit & Run cops), via ((g) => [points]: the
// guide (arrow, route, map) leads through these first - a driveway round a building - each
// dropped once Ove is near it or nearer the next point than it is).
// The chaser "catches" Ove after ~1.2 s within 6.5 m: normally a short stop (the car is held for
// `stun` s, `kr` kronor gone, the chaser backs off for a few seconds); with `catchFails` or the
// mission's `bustFails` it fails the stage instead.
export const goto = (o) => ({
  kind: 'goto',
  text: o.text,
  init(g, m) {
    this.t = o.timer ?? null;
    this.radioI = 0; this.radioT = o.radioFirst ?? 6;
    this.callI = 0; this.callT = o.callFirst ?? 5;
    this.quietT = 0; this.wasCall = false;
    if (o.chaser) this.spawnChaser(g, m, o.chaser);
  },
  dest(g) {
    if (o.who) { const n = g.npc(o.who); return n.car ? { x: n.car.x, z: n.car.z } : { x: n.x, z: n.z }; }
    return at(o.to, g);
  },
  target(g) {
    const d = this.dest(g), v = this.via(g);
    return v ? { x: v.x, z: v.z, r: 3, noBeacon: true } : { x: d.x, z: d.z, r: o.radius || 7 };
  },
  // The next guide point on the way (o.via), or null.
  via(g) {
    if (!o.via) return null;
    const pts = o.via(g), d = this.dest(g), f = g.focus();
    this.viaI ??= 0;
    while (this.viaI < pts.length) {
      const p = pts[this.viaI], n = pts[this.viaI + 1] || d;
      // (passed: near it, or already nearer the next point than it is)
      if (dist(f.x, f.z, p.x, p.z) < 8 || dist(f.x, f.z, n.x, n.z) < dist(p.x, p.z, n.x, n.z)) this.viaI++;
      else break;
    }
    return pts[this.viaI] || null;
  },
  altTarget(g) {
    for (const k of o.with || []) {
      const n = g.npc(k);
      if (!g.isWithOve(n)) return n.car ? { x: n.car.x, z: n.car.z, r: 4 } : { x: n.x, z: n.z, r: 4 };
    }
    return null;
  },
  markers() { return this.chaser && !this.chaser.dead ? [{ type: 'enemy', x: this.chaser.x, z: this.chaser.z, edge: true }] : []; },
  obj() { return { timer: this.t }; },
  update(g, m, dt) {
    if (this.t != null) {
      this.t -= dt;
      if (this.t <= 0) return { fail: o.failText || 'Tiden tog slut.' };
    }
    // Radio lines and phone calls take turns: a line that falls due during a call waits for it to
    // end, and nothing starts within a moment of the last thing said. With the voices on, the
    // clocks only run while nobody is talking: the pause is counted from the end of the last line.
    const onCall = !!g.interrupts.call, hush = voice.quiet();
    if (this.wasCall && !onCall) this.quietT = 0.8;
    this.wasCall = onCall;
    if (hush) this.quietT -= dt;
    const free = !onCall && this.quietT <= 0 && !g.inDialog && hush;
    if (o.radio && this.radioI < o.radio.length) {
      if (hush) this.radioT -= dt;
      if (this.radioT <= 0 && free) {
        g.radio(o.radio[this.radioI][0], o.radio[this.radioI][1]);
        this.radioI++; this.radioT = (o.radioEvery ?? 7) + Math.random() * 2; this.quietT = 2.2;
      }
    }
    if (o.calls && this.callI < o.calls.length && !g.inDialog) {
      this.callT -= dt;
      if (this.callT <= 0 && free && this.quietT <= 0) {
        const [who, text, reply] = o.calls[this.callI++];
        g.interrupts.radioOnly(who, text, reply);
        this.callT = (o.callEvery ?? 11) + Math.random() * 2;
      }
    }
    if (this.chaser) {
      const r = this.updateChaser(g, m, dt);
      if (r) return r;
    }
    this.sub = this.stunT > 0 ? (o.chaser.stopText || 'Vita skjortan vill se dina papper...') : null;
    if (this.sub) return;
    if (o.inCar && !g.playerCar) { this.sub = 'Kliv in i bilen igen!'; return; }
    if (o.onFoot && g.playerCar) { this.sub = 'Kliv ur bilen.'; return; }
    for (const k of o.with || []) {
      if (!g.isWithOve(g.npc(k))) { this.sub = `Hämta ${nameOf(g, k)}!`; return; }
    }
    const f = g.focus(), d = this.dest(g);
    if (dist(f.x, f.z, d.x, d.z) < (o.radius || 7)) {
      if (o.stop && g.playerCar && g.playerCar.speed > 3) { this.sub = 'Stanna bilen.'; return; }
      return 'done';
    }
  },
  spawnChaser(g, m, c) {
    const f = g.focus();
    // window.__chaserAway (tests): the old spawn, 70-140 m off and facing away from Ove.
    const away = typeof window !== 'undefined' && window.__chaserAway;
    let car = !away && c.car ? c.car(g, m) : null;
    if (!car) {
      let x, z, yaw;
      const p = !away && c.at ? at(c.at, g) : null;
      if (p) ({ x, z, yaw } = p);
      else {
        let best = null;
        for (let tries = 0; tries < 60 && best == null; tries++) {
          const id = (Math.random() * NN * NN) | 0;
          const d = dist(nodeX(id), nodeZ(id), f.x, f.z);
          if (d > 70 && d < 140) best = id;
        }
        best ??= nearestNode(f.x + 100, f.z);
        // On the edge out of that junction that heads towards Ove (or away, for the test), in its lane.
        const nbs = neighbors(best), toOve = (n) => dist(nodeX(n), nodeZ(n), f.x, f.z);
        const nb = nbs.reduce((a, b) => ((toOve(b) < toOve(a)) !== !!away ? b : a));
        const dx = nodeX(nb) - nodeX(best), dz = nodeZ(nb) - nodeZ(best), l = Math.hypot(dx, dz);
        x = nodeX(best) + (dx / l) * 14 + (-dz / l) * LANE; z = nodeZ(best) + (dz / l) * 14 + (dx / l) * LANE; yaw = yawTo(dx, dz);
      }
      car = g.spawnMissionCar(m, c.type || 'skoda', x, z, yaw, { color: c.color ?? 0xe8e8e6, name: c.name || 'vitskjortaSkoda' });
      if (c.who) g.addBust(g.charDef(c.who), car);
    }
    car.locked = true;
    car.isChaser = true;
    car.damageScale = 0.4;
    this.chaser = car;
    this.caughtT = 0; this.stunT = 0; this.backoffT = 0; this.catches = 0;
    this.waitT = c.wait ?? 0;
    if (this.waitT > 0) { car.ai = null; car.ctrl.park = true; car.ctrl.throttle = 0; }
    else this.chase(g);
  },
  // Its cruising speed factor: it pushes when far behind (the rubber band of the Hit & Run cops;
  // the driver applies it to the cruise only, never to its corner speeds).
  rubber(g) {
    const c = this.chaser, f = g.focus(), d = dist(c.x, c.z, f.x, f.z), R = o.chaser.rubber;
    return typeof R === 'function' ? R(d) : d > 80 ? 1.3 : d > 50 ? 1.15 : 1;
  },
  // (The driver plans the chase itself: a new route when Ove's nearest junction changes, never a
  // U-turn - round the block, or a three-point turn when he is right behind it.)
  chase(g) {
    this.chaser.ai = new AIDriver(this.chaser, { mode: 'chase', target: () => g.focusTarget(), cruise: o.chaser.cruise || 22, aggressive: true, avoid: false, rubber: () => this.rubber(g) });
  },
  updateChaser(g, m, dt) {
    const c = this.chaser, f = g.focus(), C = o.chaser;
    if (c.dead) return null;
    if (this.waitT > 0) {
      // Parked where it waited all morning; it sets off after a moment (or at once if Ove comes close).
      this.waitT -= dt;
      if (this.waitT <= 0 || dist(c.x, c.z, f.x, f.z) < (C.wake ?? 0)) {
        this.waitT = 0;
        this.chase(g);
        audio.honk(0.5, 0.25);
        if (C.goLine && C.who) g.radio(C.who, C.goLine);
      }
      return null;
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.stunT <= 0) g.freezeCar = false;
    }
    if (this.backoffT > 0) {
      this.backoffT -= dt;
      if (this.backoffT <= 0) this.chase(g);
      return null;
    }
    const d = dist(c.x, c.z, f.x, f.z);
    this.caughtT = d < 6.5 ? this.caughtT + dt : Math.max(0, this.caughtT - dt * 0.5);
    if (this.caughtT < (C.catchSecs ?? 1.2)) return null;
    this.caughtT = 0;
    this.catches++;
    if (C.catchFails || m.def?.bustFails) return { fail: C.catchText || 'Vita skjortan hann ikapp.' };
    // Three stops in one drive is plenty: after that he gives up (and says so).
    if (this.catches > (C.maxCatches ?? 3)) {
      c.ai = new AIDriver(c, { mode: 'traffic', cruise: 11 });
      c.isChaser = false;
      this.chaser = null;
      if (C.who) g.radio(C.who, C.giveUpLine || CHASER_GAVE_UP[1], { must: true });
      return null;
    }
    // Stopped: Ove is held up for a moment (and it costs), then the Škoda backs off and comes again.
    this.stunT = C.stun ?? 2.5;
    if (g.playerCar) g.freezeCar = true;
    const kr = Math.min(g.coins, C.kr ?? 20);
    if (kr) g.addCoins(-kr);
    hud.showBanner('STOPPAD', `${C.bannerText || 'Vita skjortan vill se papper'}${kr ? ` · −${kr} kr` : ''}`, 'bad', 1900);
    audio.honk(0.8, 0.35);
    if (C.lines && C.who) g.radio(C.who, pick(C.lines));
    g.cam.shake = Math.max(g.cam.shake, 0.3);
    c.ai = null; c.ctrl.throttle = 0; c.ctrl.brake = 1; c.ctrl.steer = 0; c.ctrl.park = true;
    // (and it hangs back longer after every stop)
    this.backoffT = this.stunT + (C.backoff ?? 4) + (this.catches - 1) * 3;
    return null;
  },
  cleanup(g) {
    if (this.stunT > 0) g.freezeCar = false;
    if (o.calls) g.interrupts.hangUp?.();
    if (this.chaser && !this.chaser.dead) { this.chaser.ai = new AIDriver(this.chaser, { mode: 'traffic', cruise: 12 }); }
  },
});

// Hold E at a spot (or at each of several spots in turn) for `secs` seconds, on foot.
// o: { at | spots: [places], secs = 3, label ('Lufta elementet'), radius = 1.8, text,
//      mounds (a snow heap on each spot that goes when it is cleared), work ('bend' | 'low' |
//      'shovel' | 'wall': the people area's work pose while E is held; without it the kind is
//      guessed from the label, else 'bend'), pose ('write': the notebook instead of working),
//      cut (a caption: the job happens off screen - one press of E and the scene cuts to black
//      with the caption while the bar fills by itself, "Ove går in och luftar elementen"),
//      scene ((g, { open, close }) -> { t, length, update(dt) -> true when over, dispose() }: with cut,
//      one press of E plays a cutscene instead - day 3's radiator, game/luftning.js - with cut as the
//      caption going in and sceneEnd coming out; the stage is done when it is over),
//      ready (g -> null | text: while it gives a text the job can't be done yet - the text is the
//      objective there, and E is left to whatever else is at hand: "Öppna garageporten" on day 3) }.
const WORK_GUESS = [[/lufta|element|lås/i, 'wall'], [/skott|snö/i, 'shovel'], [/punkter|däck|blomm|grav/i, 'low']];
function workKind(o) {
  if (o.work) return o.work;
  const t = `${o.label || ''} ${o.text || ''}`;
  for (const [re, k] of WORK_GUESS) if (re.test(t)) return k;
  return 'bend';
}
export const holdAt = (o) => ({
  kind: 'holdAt',
  text: o.text || o.label,
  init(g, m) {
    this.spots = (o.spots || [o.at]).map((p) => { const q = at(p, g); return { x: q.x, z: q.z, yaw: q.yaw ?? 0 }; });
    this.i = 0; this.p = 0; this.active = false;
    this.secs = o.secs ?? 3;
    if (o.mounds) {
      this.mounds = this.spots.map((s) => snowMound(g.scene, s.x, s.z, g.groundAt(s.x, s.z)));
      m.items.push(() => { for (const mm of this.mounds) mm.parent?.remove(mm); });
    }
  },
  spot() { return this.spots[Math.min(this.i, this.spots.length - 1)]; },
  target() { const s = this.spot(); return { x: s.x, z: s.z, r: 1.2 }; },
  markers() { return this.spots.slice(this.i + 1).map((s) => ({ type: 'item', x: s.x, z: s.z })); },
  close(g) { const s = this.spot(); return onFoot(g) && dist(g.player.x, g.player.z, s.x, s.z) < (o.radius || 1.8); },
  notReady(g) { return o.ready ? o.ready(g) : null; },
  cleanup(g) {
    if (this.cutT != null) { hud.curtain(false); g.inDialog = false; this.cutT = null; }
    if (this.scene) { this.scene.dispose(); this.scene = null; this.hush = false; }
  },
  prompt(g) {
    if (this.cutT != null || this.scene) return null;
    if (this.close(g) && !this.notReady(g)) return { text: `<b>E</b> ${o.label}`, hold: o.cut ? null : this.p, takesE: true };
    if (g.playerCar) { const s = this.spot(), f = g.focus(); if (dist(f.x, f.z, s.x, s.z) < 9) return { text: 'Kliv ur bilen först', takesE: false }; }
    return null;
  },
  obj() {
    const n = this.spots.length;
    return { bar: (this.i + this.p) / n, barLabel: n > 1 ? `${o.label} ${this.i}/${n}` : o.label };
  },
  update(g, m, dt) {
    const s = this.spot();
    if (this.scene) {
      // (the music steps back while it plays: main.js reads hush)
      this.p = Math.min(1, this.scene.t / this.scene.length);
      if (!this.scene.update(dt)) return;
      this.scene = null; this.hush = false;
      audio.checkpoint();
      return 'done';
    }
    if (o.cut && this.cutT != null) {
      // Off screen: black, the caption, the bar fills; then back to the scene.
      this.cutT += dt;
      if (this.cutT > 0.6) this.p = Math.min(1, this.p + dt / this.secs);
      g.posePlayer('work', workKind(o));
      if (this.p >= 1 && this.cutT > 0.6 + this.secs + 0.4) { hud.curtain(false); g.inDialog = false; this.cutT = null; audio.checkpoint(); return 'done'; }
      return;
    }
    // Ove doesn't wade into a snow heap: he stands at its edge (and shovels from there).
    if (this.mounds && onFoot(g)) {
      const p = g.player;
      for (let k = this.i; k < this.spots.length; k++) {
        const q = this.spots[k], dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
        if (d < 0.72) { const ux = d > 0.01 ? dx / d : -Math.sin(p.yaw), uz = d > 0.01 ? dz / d : -Math.cos(p.yaw); p.x = q.x + ux * 0.72; p.z = q.z + uz * 0.72; }
      }
    }
    const why = this.notReady(g), near = this.close(g), close = near && !why;
    if (o.scene && close && g.input.pressed('interact')) {
      this.p = 0; this.hush = true;
      this.scene = o.scene(g, { open: o.cut, close: o.sceneEnd });
      return;
    }
    if (o.cut && close && g.input.pressed('interact')) {
      this.cutT = 0; this.p = 0;
      g.inDialog = true;
      hud.curtain(true, o.cut);
      audio.door();
      return;
    }
    this.active = close && g.input.down('interact');
    this.sub = !near && g.playerCar && dist(g.focus().x, g.focus().z, s.x, s.z) < 12 ? 'Kliv ur bilen.' : why && onFoot(g) && dist(g.player.x, g.player.z, s.x, s.z) < 8 ? why : null;
    if (this.active) {
      this.p += dt / this.secs;
      const p = g.player;
      p.yaw = yawTo(s.x - p.x, s.z - p.z) || p.yaw;
      if (o.pose === 'write') g.posePlayer('write');
      else g.posePlayer('work', workKind(o));
      if (o.mounds && Math.random() < dt * 5) FX.dust(s.x, s.z, 2, g.groundAt(s.x, s.z) + 0.2);
    } else this.p = Math.max(0, this.p - dt * 0.4);
    if (this.p >= 1) {
      audio.checkpoint();
      if (this.mounds) { const mm = this.mounds[this.i]; mm.parent?.remove(mm); FX.dust(s.x, s.z, 8, g.groundAt(s.x, s.z) + 0.2); }
      this.i++; this.p = 0;
      if (this.i >= this.spots.length) return 'done';
    }
  },
});

// A drift of snow to shovel: soft, smooth heaps (enough segments that they don't read as faceted
// rocks), sunk a little into the ground, in the snow surface with the renderer's snow sparkle.
let moundGeo = null;
function snowMound(scene, x, z, y) {
  if (!moundGeo) {
    const g = new GeoBuilder();
    g.use('snow');
    // (unit spheres are 1 m across: a heap ~1.1 m wide and ~0.4 m high, with a few lumps)
    g.sphere(0xe6e8ea, 0, 0.0, 0, 1.15, 0.78, 0.9, 0, 0, 0, 22);
    g.sphere(0xe9ebed, 0.36, 0.0, 0.22, 0.62, 0.5, 0.56, 0, 0.4, 0, 18);
    g.sphere(0xe3e5e7, -0.34, 0.0, -0.2, 0.6, 0.44, 0.52, 0, -0.3, 0, 18);
    g.sphere(0xe8eaec, 0.1, 0.18, -0.08, 0.5, 0.42, 0.44, 0.2, 0.9, 0.1, 16);
    g.sphere(0xdfe1e3, 0.2, 0.08, 0.38, 0.24, 0.16, 0.2, 0.4, 0.2, 0.3, 12);
    g.sphere(0xdfe1e3, -0.42, 0.04, 0.24, 0.2, 0.13, 0.18, -0.3, 1.1, 0.2, 12);
    moundGeo = g.build();
  }
  const m = realMesh(moundGeo, { snow: true });
  m.position.set(x, y - 0.03, z);
  m.rotation.y = Math.random() * 6;
  scene.add(m);
  return m;
}

// Walk over an item to pick it up. o: { at, item ('key' | 'phone' | 'wrench' | 'papers' |
// 'flowers'), label ('reservnyckeln'), text, rMin = 0.6, rMax = 2.5 (scatter from the place) }.
// Sets m.data.carrying = label.
export const fetch = (o) => ({
  kind: 'fetch',
  text: o.text || `Hämta ${o.label}`,
  init(g, m) {
    const p = at(o.at, g);
    const s = o.exact ? p : g.freeSpot(p.x, p.z, o.rMin ?? 0.6, o.rMax ?? 2.5);
    this.item = new Collectible(g.scene, o.item || 'papers', 'fetch', s.x, g.groundAt(s.x, s.z) + 0.45, s.z);
    m.items.push(() => this.item.dispose());
  },
  target() { return { x: this.item.x, z: this.item.z, r: 1.4 }; },
  update(g, m) {
    this.item.tick(g.time);
    const f = g.focus();
    const r = g.playerCar ? 2.8 : 1.4;
    this.sub = g.playerCar && dist(f.x, f.z, this.item.x, this.item.z) < 10 ? 'Kliv ur bilen.' : null;
    if (!g.playerCar && dist(f.x, f.z, this.item.x, this.item.z) < r && Math.abs(f.y - this.item.y) < 2.2) {
      this.item.remove();
      audio.pickup();
      FX.sparkle(this.item.x, this.item.y, this.item.z, 0xfff1d0, 12);
      m.data.carrying = o.label;
      if (o.got) hud.toast(o.got);
      return 'done';
    }
  },
});

// Pick someone up. o: { who, at (where they wait; omitted = where they are), needCar, text, hello,
// walk ((g) => [points]: they walk to `at` by way of these instead of being put there; if a
// mission already sent them, they carry on), speed (their walking speed) }.
// On foot: walk up to them and they follow Ove. In a car: stop within ~9 m and they get in, or stop
// within 25 m and honk (game/horn.js): they come out to the car (script.js COMING: "Jag kommer!").
export const pickup = (o) => ({
  kind: 'pickup',
  get text() { return o.text || `Hämta ${this.name || o.who}`; },
  init(g, m) {
    const n = (this.npc = g.npc(o.who));
    this.name = n.def.name;
    this.honkT = g.time;
    m.data.npcs.add(n);
    g.removeCompanion(n);
    if (n.car) g.unseat(n);
    n.busy = true;
    if (o.at && o.walk) {
      const p = at(o.at, g);
      if (!n.walkTo && dist(n.x, n.z, p.x, p.z) > 1.5) g.walkNpc(n, [...o.walk(g), p], { speed: o.speed, stay: true, yaw: p.yaw });
      return;
    }
    n.walkTo = null; n.walkPath = null;
    if (o.at) {
      const p = at(o.at, g);
      const s = g.freeSpot(p.x, p.z, 0, 1.5);
      n.teleport(s.x, s.z, p.yaw ?? n.yaw);
    }
  },
  target() { const n = this.npc; return n.car ? { x: n.car.x, z: n.car.z, r: 3 } : { x: n.x, z: n.z, r: 3 }; },
  tags() { const n = this.npc; return n.car ? [] : [{ x: n.x, y: n.y + n.height + 0.35, z: n.z, text: this.name, cls: 'errand' }]; },
  update(g, m, dt = 1 / 60) {
    const n = this.npc;
    this.sub = null;
    if (g.isWithOve(n)) return 'done';
    const c = g.playerCar;
    if (c) {
      const d = dist(c.x, c.z, n.x, n.z), h = g.horn?.last;
      // Waiting for Ove's car (the horn leaves them be, see horn.react): a honk from it, stopped
      // within 25 m, brings them out to its passenger side.
      n.pickupT = g.time + 0.5;
      if (h && h.car === c && h.t > this.honkT && d >= 10 && d < 25 && c.speed < 4 && !n.walkTo && n.state === 'normal') {
        this.honkT = h.t;
        const e = g.exitSpot(c, -1);
        g.walkNpc(n, [e], { speed: 2.4, stay: true, yaw: yawTo(c.x - e.x, c.z - e.z) });
        if (!g.say(n, pick(COMING), 1.8)) audio.talk(n.def.voice || 300);
        g.horn.stats.called++;
        this.called = { t: 0, d };
      }
      // (called out: they get in a little further off, and a walk that stalls against a hedge for
      // 2 s gets them in from up to 22 m - the walk is a straight line)
      let reach = 10;
      if (this.called && n.walkTo) {
        const k = this.called;
        k.t += dt;
        if (k.t > 2) { reach = k.d - d < 0.5 ? 22 : 13; if (k.d - d >= 0.5) { k.t = 0; k.d = d; } }
        else reach = 13;
      }
      if (d < reach) {
        if (c.speed > 3) { this.sub = `Stanna så kan ${this.name} kliva in.`; return; }
        if (g.boardCompanion(n, c)) { if (o.hello) g.say(n, o.hello, 2); return 'done'; }
        this.sub = 'Det finns ingen plats i bilen.';
      }
    } else {
      if (o.needCar) { this.sub = o.carText || `Hämta en bil först.`; return; }
      if (g.player.state === 'normal' && dist(g.player.x, g.player.z, n.x, n.z) < 2.4) {
        g.addCompanion(n);
        if (o.hello) g.say(n, o.hello, 2);
        return 'done';
      }
    }
  },
});

// Drop someone off. o: { who, at, radius = 8, text, bye, needCar (they must arrive in Ove's car,
// not walking beside him; carText says so), walk ((g) => [points]: where they walk after getting
// out, e.g. round to the door; default `at`) }. They have to be with Ove (in his car or walking
// with him); then he stops near `at` and they walk the last bit.
export const dropoff = (o) => ({
  kind: 'dropoff',
  text: o.text,
  init(g) { this.npc = g.npc(o.who); },
  target(g) { const d = at(o.at, g); return { x: d.x, z: d.z, r: o.radius || 8 }; },
  altTarget(g) { const n = this.npc; if (g.isWithOve(n)) return null; return n.car ? { x: n.car.x, z: n.car.z, r: 4 } : { x: n.x, z: n.z, r: 4 }; },
  update(g, m) {
    const n = this.npc;
    this.sub = null;
    if (!g.isWithOve(n)) { this.sub = `Du glömde ${n.def.name}!`; return; }
    if (o.needCar && n.car !== g.playerCar) { this.sub = o.carText || `${n.def.name} ska åka bil.`; return; }
    const d = at(o.at, g), f = g.focus();
    if (dist(f.x, f.z, d.x, d.z) < (o.radius || 8)) {
      if (g.playerCar && g.playerCar.speed > 3) { this.sub = 'Stanna bilen.'; return; }
      g.removeCompanion(n, { walkTo: o.walk ? o.walk(g) : d });
      if (o.bye) g.say(n, o.bye, o.byeSecs ?? 2.2);
      m.data.npcs.delete(n);
      audio.door();
      return 'done';
    }
  },
});

// Find someone and bring them home walking (Rune: Ove pushes the wheelchair). o: { who, at |
// spawn: 'sidewalk' (somewhere on a sidewalk 45-110 m from `to`), to, push, radius = 3.5,
// findText, bringText, hello, mortal, cold }.
// push: E takes hold of the wheelchair and E lets go of it again (game/rune.js: let go of in Ove's
// stride it rolls on a good way; a kick rolls it too); home is home whether he is pushed there or
// rolls there. mortal (Rune's errand, features/implemented/roligare_runeuppdrag.md): a car at speed
// kills him (main.js carsVsPeople), and so does the cold: from nothing to dead in `cold` s wherever
// he is, much quicker out past the forest (RUNE_COLD); the stage then fails with { fail, dead }
// (interruptions.js: E tries again, Q gives up and he stays dead). obj() has his cold for the panel.
export const RUNE_COLD = { out: 3.0, temp: [36.6, 27.0] };
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const RUNE_NOTES = [[0.2, 'Rune är kall om händerna'], [0.45, 'Rune fryser'], [0.7, 'Rune skakar av köld'], [0.88, 'Rune är blå om läpparna'], [2, 'Rune somnar']];
const DEATH = { cold: 'Rune frös ihjäl.', coldOut: 'Rune frös ihjäl bortom skogen.', car: 'Rune blev påkörd.', ove: 'Ove körde över Rune.' };
export const escort = (o) => ({
  kind: 'escort',
  get text() { return this.phase === 'bring' ? (o.bringText || `Följ ${this.name} hem`) : (o.findText || `Hitta ${this.name}`); },
  init(g, m) {
    const n = (this.npc = g.npc(o.who));
    this.name = n.def.name;
    m.data.npcs.add(n);
    g.removeCompanion(n);
    if (n.car) g.unseat(n);
    if (n.dead) g.rune.revive(n);
    n.roll = null;
    n.busy = true; n.walkTo = null; n.walkPath = null;
    const dest = at(o.to, g);
    let p = o.at ? at(o.at, g) : null;
    if (!p) {
      // A spot on a sidewalk loop not too near, not too far.
      const cands = [];
      for (const L of pedLoops) for (let k = 0; k < 4; k++) {
        const [ax, az] = L.pts[k], [bx, bz] = L.pts[(k + 1) % 4];
        for (let t = 0.15; t < 0.9; t += 0.15) {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t, d = dist(x, z, dest.x, dest.z);
          if (d > (o.min ?? 45) && d < (o.max ?? 110)) cands.push({ x, z, yaw: yawTo(bx - ax, bz - az) });
        }
      }
      p = cands.length ? pick(cands) : { x: dest.x + 50, z: dest.z, yaw: 0 };
    }
    const s = g.freeSpot(p.x, p.z, 0, 1.5);
    n.teleport(s.x, s.z, p.yaw ?? 0);
    this.phase = 'find';
    this.can = null;
    if (o.mortal) {
      this.cold = 0; this.out = false;
      n.mortal = true;
      m.items.push(() => { n.mortal = false; n.roll = null; n.anim.shiver = 0; n.anim.coast = false; });
    }
  },
  held(g) { const n = this.npc; return !!g.companions.get(n)?.push && g.isWithOve(n); },
  target(g) {
    if (this.phase === 'bring' && (!o.push || this.held(g))) { const d = at(o.to, g); return { x: d.x, z: d.z, r: o.radius || 3.5 }; }
    return { x: this.npc.x, z: this.npc.z, r: 2.5 };
  },
  tags(g) { const n = this.npc; return this.phase === 'find' || (o.push && !this.held(g)) ? [{ x: n.x, y: n.y + n.height + 0.35, z: n.z, text: this.name, cls: 'errand' }] : []; },
  prompt() {
    if (this.can === 'grab') return { text: '<b>E</b> Ta tag i rullstolen', takesE: true };
    if (this.can === 'let') return { text: '<b>E</b> Släpp rullstolen', takesE: true };
    return null;
  },
  obj() {
    if (!o.mortal) return {};
    const v = this.cold, [t0, t1] = RUNE_COLD.temp;
    return { cold: v, temp: t0 + (t1 - t0) * v, note: this.out ? 'Här ute fryser Rune fort' : RUNE_NOTES.find(([k]) => v < k)[1], danger: v > 0.75 || this.out };
  },
  // Rune's cold (o.cold s from nothing to dead; out past the forest the cold's own rate, times
  // RUNE_COLD.out, on top of it): he shivers, and at the end he dies.
  chill(g, n, dt) {
    const d = edgeDist(n.x, n.z);
    this.out = d > COLDK.start;
    this.cold = Math.min(1, this.cold + (1 / o.cold + (this.out ? RUNE_COLD.out * coldRate(d) : 0)) * dt);
    n.anim.shiver = sstep(0.12, 0.7, this.cold);
    if (this.cold >= 1) g.rune.kill(n, this.out ? 'coldOut' : 'cold');
  },
  update(g, m, dt) {
    const n = this.npc;
    this.sub = null;
    if (o.mortal) {
      if (!n.dead && o.cold) this.chill(g, n, dt);
      if (n.dead) { this.can = null; return { fail: DEATH[n.dead.cause] || DEATH.car, dead: true }; }
    }
    const p = g.player, held = this.held(g);
    const near = !g.playerCar && p.state === 'normal' && !n.car && dist(p.x, p.z, n.x, n.z) < 2.2;
    if (o.push) {
      this.can = held ? 'let' : near ? 'grab' : null;
      if (this.can && g.input.pressed('interact')) {
        if (this.can === 'grab') {
          n.roll = null; n.anim.coast = false;
          g.addCompanion(n, { push: true });
          if (this.phase === 'find' && o.hello) g.say(n, o.hello, 2);
          this.phase = 'bring';
          this.can = 'let';
        } else { g.rune.letGo(n); this.can = null; }
      }
    } else if (this.phase === 'find' && near) {
      g.addCompanion(n);
      if (o.hello) g.say(n, o.hello, 2);
      this.phase = 'bring';
    }
    if (this.phase === 'find') {
      if (g.playerCar && dist(g.playerCar.x, g.playerCar.z, n.x, n.z) < 18) this.sub = 'Kliv ur bilen.';
      return;
    }
    if (!o.push && !g.isWithOve(n)) { this.phase = 'find'; return; }
    // Home: pushed there, or rolled there (and come to a stop).
    const d = at(o.to, g);
    if (dist(n.x, n.z, d.x, d.z) < (o.radius || 3.5) && (this.held(g) || !n.roll)) {
      g.removeCompanion(n, { walkTo: d });
      this.can = null;
      return 'done';
    }
    if (o.push && !this.held(g)) this.sub = n.roll ? `${this.name} rullar iväg!` : g.playerCar && dist(g.playerCar.x, g.playerCar.z, n.x, n.z) < 18 ? 'Kliv ur bilen.' : `Ta tag i ${this.name}s rullstol igen`;
  },
});

// Catch the stray cat. o: { near (place), timer, text, rMin = 8, rMax = 18, sit (it starts sitting
// in the snow), leash = 18 (it keeps within about this of where it started), failText }.
// Patience, not speed: it bolts when Ove strides at it (Shift) within ~7 m, walks up within ~3 m
// or comes by car; it runs 3-4.5 s (6 m/s, 7.2 with him close: a chase never catches it)
// along the most open way away from him - never into a dead end or through a gap Ove can't follow
// - then sits again. If Ove stands still a moment within ~9 m (and in plain view), it gets curious and
// comes to him; within ~1.15 m on foot he has it. Then Ove carries it (m.data.cat, g.carrying)
// until the mission/errand ends.
export const catchCat = (o) => ({
  kind: 'catchCat',
  text: o.text || 'Fånga katten',
  init(g, m) {
    const p = at(o.near, g);
    // Somewhere open near the place (most directions free for a few metres), not in a corner of the
    // bike shed where the first step towards it pins it.
    let s = null, bestN = -Infinity;
    for (let k = 0; k < 24; k++) {
      const q = g.freeSpot(p.x, p.z, o.rMin ?? 8, o.rMax ?? 18), y = g.groundAt(q.x, q.z);
      let n = isRoad(q.x, q.z) ? -20 : 0;   // (never out on the street)
      for (let h = 0; h < 12; h++) if (this.freeRun(q.x, q.z, Math.sin(h * Math.PI / 6), Math.cos(h * Math.PI / 6), y) >= 4) n++;
      if (n > bestN) { bestN = n; s = q; }
      if (n >= 10) break;
    }
    s ??= g.freeSpot(p.x, p.z, 0, 3);
    const cat = (this.cat = buildCat());
    cat.x = s.x; cat.z = s.z; cat.y = g.groundAt(s.x, s.z); cat.yaw = Math.random() * 6;
    cat.vx = 0; cat.vz = 0; cat.wanderT = 0; cat.meowT = 1;
    this.home = { x: s.x, z: s.z };
    this.mode = null; this.setMode(o.sit ? 'sit' : 'wander');
    this.stillT = 0; this.runs = 0; this.comes = 0; this.pickT = 0;
    cat.root.position.set(cat.x, cat.y, cat.z);
    g.scene.add(cat.root);
    this.t = o.timer ?? null;
    m.data.cat = cat;
    // (its geometry and its skeleton's bone texture are its own; the materials are shared surfaces)
    m.items.push(() => {
      if (g.carrying === cat) g.setCarrying(null);
      cat.root.parent?.remove(cat.root);
      cat.root.traverse((o) => { o.geometry?.dispose(); o.skeleton?.dispose(); });
    });
  },
  target() { return { x: this.cat.x, z: this.cat.z, r: 1.2 }; },
  markers() { return [{ type: 'item', x: this.cat.x, z: this.cat.z, edge: true }]; },
  tags() { const c = this.cat; return [{ x: c.x, y: c.y + 0.55, z: c.z, text: 'Katten', cls: 'errand' }]; },
  obj() { return { timer: this.t }; },
  // sit | rest (sitting after a run) | wander | run | come (to Ove)
  setMode(mode) {
    const c = this.cat;
    if (this.mode === mode) return;
    const sitting = mode === 'sit' || mode === 'rest';
    if (sitting !== (this.mode === 'sit' || this.mode === 'rest')) c.sit(sitting);
    this.mode = mode; this.modeT = 0;
    if (sitting || mode === 'come') { c.vx = 0; c.vz = 0; }
    if (mode === 'wander') c.wanderT = 0;
  },
  // How far the cat can run from (x, z) along (sx, sz), up to 6 m, through a gap wide enough for
  // Ove too (probes either side of the centre line).
  freeRun(x, z, sx, sz, y) {
    const R = 6, px = -sz * 0.3, pz = sx * 0.3, ex = x + sx * R, ez = z + sz * R;
    queryBlocks(Math.min(x, ex) - 0.6, Math.min(z, ez) - 0.6, Math.max(x, ex) + 0.6, Math.max(z, ez) + 0.6, _fr);
    let free = R;
    // (every 0.25 m, the cat's own collision test: thin fences slip between coarser samples)
    for (const b of _fr) {
      if (b.shape !== RAMP && b.top <= y + 0.45) continue;
      for (let st = 0.25; st <= free; st += 0.25) {
        let hit = false;
        for (const [ox, oz] of [[0, 0], [px, pz], [-px, -pz]]) {
          const qx = x + ox + sx * st, qz = z + oz + sz * st;
          if ((b.shape === RAMP ? topAt(b, qx, qz) : b.top) > y + 0.45 && circleVsBlock(qx, qz, 0.22, b, _h)) { hit = true; break; }
        }
        if (hit) { free = st - 0.25; break; }
      }
    }
    return free;
  },
  // The most open way away from Ove, near home, without zigzagging.
  pickHeading(f) {
    const c = this.cat, ax = c.x - f.x, az = c.z - f.z, l = Math.hypot(ax, az) || 1;
    const moving = Math.hypot(c.vx, c.vz) > 0.5, cur = Math.atan2(c.vx, c.vz);
    let best = null, bs = -Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13, sx = Math.sin(a), sz = Math.cos(a);
      const run = this.freeRun(c.x, c.z, sx, sz, c.y);
      const away = (sx * ax + sz * az) / l;
      const ex = c.x + sx * run, ez = c.z + sz * run;
      const leash = Math.max(0, dist(ex, ez, this.home.x, this.home.z) - (o.leash ?? 18));
      // (and never past him within arm's reach)
      const t = clamp(((f.x - c.x) * sx + (f.z - c.z) * sz), 0, run), pass = dist(c.x + sx * t, c.z + sz * t, f.x, f.z);
      const score = run + away * 3.2 - leash * 0.6 - (isRoad(ex, ez) ? 4 : 0) + (moving ? Math.cos(angleDiff(a, cur)) * 0.7 : 0) - (run < 1.5 ? 6 : 0) - (pass < 2.6 ? 9 : 0);
      if (score > bs) { bs = score; best = { sx, sz, run }; }
    }
    return best;
  },
  bolt(g, f) {
    this.setMode('run');
    this.runs++;
    this.runFor = 3 + Math.random() * 1.5;
    this.pickT = 0;
    audio.catMeow();
  },
  update(g, m, dt) {
    if (this.t != null) { this.t -= dt; if (this.t <= 0) return { fail: o.failText || 'Katten försvann.' }; }
    const c = this.cat, f = g.focus(), pl = g.player;
    const dx = c.x - f.x, dz = c.z - f.z, d = Math.hypot(dx, dz);
    // How Ove comes at it: by car, striding (Shift), walking or standing still.
    const foot = !g.playerCar && pl.state === 'normal';
    const v = foot ? Math.hypot(pl.vx, pl.vz) : 99;
    this.stillT = foot && v < 0.5 ? this.stillT + dt : 0;
    const striding = g.playerCar ? d < 12 : v > 4.0 && d < 7;
    const scary = striding || (foot && v > 0.5 && d < 3.2);
    this.modeT += dt;
    if (this.mode === 'sit' || this.mode === 'rest' || this.mode === 'wander') {
      if (scary) this.bolt(g, f);
      else if (this.stillT > 1.2 && d < 9 && segmentBlocked(c.x, c.z, pl.x, pl.z, c.y + 0.45) < 0) {
        // Curious: it comes to the man who stands still.
        this.setMode('come');
        if (!this.comes++) { audio.catMeow(); g.say(pl, CAT_COMES[1], 2.2); }
      }
    } else if (this.mode === 'run') {
      if (this.modeT > this.runFor) this.setMode('rest');
    } else if (this.mode === 'come') {
      if (striding) this.bolt(g, f);
      else if (d > 11) this.setMode('rest');
    }
    // Hints in the objective line once it has run off.
    this.sub = g.playerCar && d < 20 ? 'Katter fångar man inte med bil. Kliv ur.'
      : this.runs && (this.mode === 'rest' || this.mode === 'run') && d < 16 ? 'Gå lugnt mot katten. Stå still en stund, så kommer den.' : null;
    let sp = 0;
    if (this.mode === 'run') {
      this.pickT -= dt;
      if (this.pickT <= 0) {
        const h = this.pickHeading(f);
        if (!h || h.run < 1.2) { this.setMode('rest'); }
        else { const v = d < 4.5 ? CAT_BURST : CAT_RUN; c.vx = h.sx * v; c.vz = h.sz * v; this.pickT = 0.35; }
      }
      sp = Math.hypot(c.vx, c.vz);
      c.meowT -= dt;
      if (c.meowT <= 0) { c.meowT = 2.5 + Math.random() * 3; if (d < 25) audio.catMeow(); }
    } else if (this.mode === 'come') {
      // Up to Ove, slowly, and stop at his feet (round a bench or a bike rack on the way).
      this.detourT = (this.detourT || 0) - dt;
      if (this.detourT <= 0) { const k = d > 0.95 ? 1.1 / d : 0; c.vx = -dx * k; c.vz = -dz * k; }
      sp = Math.hypot(c.vx, c.vz);
    } else if (this.mode === 'wander') {
      c.wanderT -= dt;
      if (c.wanderT <= 0) {
        c.wanderT = 1.5 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2, go = Math.random() < 0.55;
        // (and back towards home when it has strayed)
        const hx = this.home.x - c.x, hz = this.home.z - c.z, far = Math.hypot(hx, hz) > (o.leash ?? 18) * 0.6;
        const ha = far ? Math.atan2(hx, hz) : a;
        c.vx = go || far ? Math.sin(ha) * 0.7 : 0; c.vz = go || far ? Math.cos(ha) * 0.7 : 0;
      }
      sp = Math.hypot(c.vx, c.vz);
    }
    if (sp > 0) {
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      queryBlocks(nx - 0.3, nz - 0.3, nx + 0.3, nz + 0.3, _bl);
      let hit = false;
      for (const b of _bl) {
        const top = b.shape === RAMP ? topAt(b, nx, nz) : b.top;
        if (top > c.y + 0.45 && circleVsBlock(nx, nz, 0.22, b, _h)) { hit = true; break; }
      }
      if (!hit) { c.x = nx; c.z = nz; }
      else if (this.mode === 'run') this.pickT = 0;
      else if (this.mode === 'come') {
        // Sideways round whatever is in the way, the side nearer the line to Ove.
        const a0 = Math.atan2(-dx, -dz);
        let ok = null;
        for (const da of [0.6, -0.6, 1.1, -1.1, 1.6, -1.6]) {
          const a = a0 + da, sx = Math.sin(a), sz = Math.cos(a);
          queryBlocks(c.x + sx * 0.5 - 0.3, c.z + sz * 0.5 - 0.3, c.x + sx * 0.5 + 0.3, c.z + sz * 0.5 + 0.3, _bl);
          if (!_bl.some((b) => (b.shape === RAMP ? topAt(b, c.x + sx * 0.5, c.z + sz * 0.5) : b.top) > c.y + 0.45 && circleVsBlock(c.x + sx * 0.5, c.z + sz * 0.5, 0.22, b, _h))) { ok = { sx, sz }; break; }
        }
        if (ok) { c.vx = ok.sx * 1.1; c.vz = ok.sz * 1.1; this.detourT = 0.7; } else this.setMode('rest');
      }
      else { c.wanderT = 0; c.vx = 0; c.vz = 0; }
      c.y = groundAt(c.x, c.z, c.y + 0.4, 0.45);
      if (sp > 0.1) c.yaw = yawTo(c.vx, c.vz);
    } else if (this.mode === 'rest' || this.mode === 'sit') {
      // Sitting, it keeps an eye on him.
      if (d < 14) c.yaw = dampAngleTo(c.yaw, yawTo(-dx, -dz), dt * 2);
    }
    c.root.position.set(c.x, c.y, c.z);
    c.root.rotation.y = c.yaw;
    c.animate(dt, sp);
    if (onFoot(g) && dist(g.player.x, g.player.z, c.x, c.z) < 1.15) {
      audio.catMeow();
      g.setCarrying(c);
      return 'done';
    }
  },
});
const dampAngleTo = (a, b, k) => a + angleDiff(a, b) * Math.min(1, k);
const CAT_RUN = 6.0, CAT_BURST = 7.2;   // m/s (Ove walks 3.2, runs 5.5); the burst with him close behind
const _bl = [], _h = {}, _fr = [];

// Park a car in a landmark box. o: { box (a box landmark with w, l, yaw), car (name of the car it
// must be; else any), tol = 0.3 rad heading tolerance, either (nose in or out both fine), trailer
// (the trailer must be in the box too), reverse (must have backed in), text, still = 0.8 s,
// hint (a toast when the stage starts), clear (metres: unreported felparkeringar standing in the
// box or within this far of it along its length are towed away first, so it can be done) }.
export const parkIn = (o) => ({
  kind: 'parkIn',
  text: o.text || 'Parkera i rutan',
  init(g, m) {
    const b = at(o.box, g);
    this.b = { x: b.x, z: b.z, yaw: b.yaw ?? 0, w: b.w ?? 2.6, l: b.l ?? 5.2 };
    this.marker = new BoxMarker(g.scene, this.b);
    m.items.push(() => this.marker.dispose());
    this.stillT = 0; this.wasIn = false; this.enteredRev = null;
    if (o.car) this.car = g.ensureNamedCar(o.car);
    if (o.clear) {
      const fx = Math.sin(this.b.yaw), fz = Math.cos(this.b.yaw);
      for (const c of g.patrol.active.slice()) {
        if (c.violation.reported || c === g.playerCar) continue;
        const dx = c.x - this.b.x, dz = c.z - this.b.z;
        if (Math.abs(dx * fx + dz * fz) < this.b.l / 2 + o.clear && Math.abs(dx * -fz + dz * fx) < this.b.w / 2 + 2.5) g.patrol.remove(c);
      }
    }
    if (o.hint) hud.toast(o.hint, 'warn', 9000);
  },
  target() { return { x: this.b.x, z: this.b.z, r: 0, noBeacon: true }; },
  obj() { return o.bar === false ? {} : { bar: this.score || 0, barLabel: 'I rutan', barColor: '#8db487' }; },
  cleanup() { this.marker.dispose(); },
  update(g, m, dt) {
    const c = g.playerCar, b = this.b;
    // The car it has to be is a wreck: a fail, and the retry brings a new one (it used to say
    // "Kliv in i Patricks bil" for ever).
    if (this.car?.dead) return { fail: 'Bilen är kvaddad.' };
    this.marker.update(g.time, false);
    this.score = 0;
    if (!c) { this.sub = this.car ? `Kliv in i ${this.car.name === 'patrickCar' ? 'Patricks bil' : this.car.name === 'saab' ? 'Saaben' : 'bilen'}` : 'Kliv in i en bil'; return; }
    if (this.car && c !== this.car) { this.sub = 'Fel bil.'; return; }
    const bfx = Math.sin(b.yaw), bfz = Math.cos(b.yaw);
    const inner = (x, z, m2 = 0.12) => {
      const dx = x - b.x, dz = z - b.z;
      return Math.abs(dx * bfx + dz * bfz) <= b.l / 2 + m2 && Math.abs(dx * -bfz + dz * bfx) <= b.w / 2 + m2;
    };
    const cornersIn = (x, z, yaw, len, wid) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
      let n = 0;
      for (const [a, s] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inner(x + fx * a * len / 2 + rx * s * wid / 2, z + fz * a * len / 2 + rz * s * wid / 2)) n++;
      return n;
    };
    const centreIn = inner(c.x, c.z, 0);
    if (centreIn && !this.wasIn) this.enteredRev = c.forwardSpeed < -0.2;
    this.wasIn = centreIn;
    const nc = cornersIn(c.x, c.z, c.yaw, c.spec.len, c.spec.wid);
    let nt = 4;
    if (o.trailer) nt = c.trailer ? cornersIn(c.trailer.x, c.trailer.z, c.trailer.yaw, c.trailer.len, c.trailer.wid) : 0;
    const dh = Math.abs(angleDiff(c.yaw, b.yaw)), headOk = dh < (o.tol ?? 0.3) || (o.either && Math.abs(dh - Math.PI) < (o.tol ?? 0.3));
    const revOk = !o.reverse || this.enteredRev === true;
    this.score = (nc + (o.trailer ? nt : 4)) / 8 * (headOk ? 1 : 0.6);
    const ok = nc === 4 && nt === 4 && headOk && revOk;
    this.marker.update(g.time, ok);
    this.sub = null;
    // Where the car is relative to the box: ahead of it (along the way a parked car faces) or behind.
    const along = (c.x - b.x) * bfx + (c.z - b.z) * bfz, near = dist(c.x, c.z, b.x, b.z) < b.l / 2 + 22;
    // Driving forward through the box on the way past it (as told, however slowly: the box is 9.5 m
    // long) is fine: only a car that stops in it nose first is told to back in.
    this.fwdInT = this.wasIn && this.enteredRev === false ? (this.fwdInT || 0) + dt : 0;
    const scold = this.fwdInT > 0.4 && c.speed < 0.5;
    if (o.trailer && c.trailer?.jackknifed) this.sub = 'Släpet har vikt sig. Kör framåt en bit och räta upp det.';
    else if (o.reverse && this.wasIn && this.enteredRev === false && scold) this.sub = 'Backa in! Kör ut ur rutan och försök igen.';
    else if (o.reverse && this.wasIn && this.enteredRev === false) this.sub = 'Kör förbi rutan i pilens riktning och backa sedan in.';
    else if (o.reverse && !centreIn && near) this.sub = along > 0 && Math.cos(dh) > 0.7 ? 'Backa in i rutan (S). Styr åt andra hållet för att svänga släpet.' : 'Kör förbi rutan i pilens riktning och backa sedan in.';
    else if (nc > 0 && nc < 4) this.sub = 'Hela bilen i rutan.';
    else if (nc === 4 && !headOk) this.sub = 'Rakt i rutan.';
    else if (nc === 4 && nt < 4) this.sub = 'Släpet också.';
    else if (ok && c.speed >= 0.4) this.sub = 'Stanna.';
    if (ok && c.speed < 0.4) {
      this.stillT += dt;
      if (this.stillT > (o.still ?? 0.8)) { audio.checkpoint(); return 'done'; }
    } else this.stillT = 0;
  },
});

// An outline on the ground: amber, turning sage green when the car is in it right.
export class BoxMarker {
  constructor(scene, b) {
    this.scene = scene;
    this.grp = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.fill = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.07, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const y = groundAt(b.x, b.z, 0.5, 0.6) + 0.03;
    const W = 0.12;
    const bar = (w, l, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), this.mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); m.userData.noAO = true; this.grp.add(m); };
    bar(b.w + W, W, 0, b.l / 2); bar(b.w + W, W, 0, -b.l / 2); bar(W, b.l, b.w / 2, 0); bar(W, b.l, -b.w / 2, 0);
    // A chevron at the front end shows which way the car should face.
    const ch = new THREE.Mesh(new THREE.CircleGeometry(0.32, 3), this.mat);
    ch.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    ch.position.set(0, 0, b.l / 2 - 0.55);
    ch.userData.noAO = true;
    this.grp.add(ch);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.l), this.fill);
    f.rotation.x = -Math.PI / 2; f.userData.noAO = true;
    this.grp.add(f);
    this.grp.position.set(b.x, y, b.z);
    this.grp.rotation.y = b.yaw;
    for (const c of this.grp.children) { c.castShadow = false; c.receiveShadow = false; c.renderOrder = 3; }
    scene.add(this.grp);
  }
  update(t, ok) {
    const col = ok ? 0x8db487 : 0xffb347;
    this.mat.color.setHex(col); this.fill.color.setHex(col);
    this.mat.opacity = 0.75 + Math.sin(t * 4) * 0.15;
  }
  dispose() {
    if (!this.grp.parent) return;
    this.grp.parent.remove(this.grp);
    for (const c of this.grp.children) c.geometry.dispose();
    this.mat.dispose(); this.fill.dispose();
  }
}

// Report n violations. o: { n, near (place: violations are force-spawned near it), radius = 70,
// smitare = false, spawn = true, text }. Counts every report from the moment the stage starts.
export const report = (o) => ({
  kind: 'report',
  text: o.text || `Anteckna ${o.n} felparkeringar`,
  init(g) {
    this.t0 = g.time;
    this.k = 0;
    this.cars = o.spawn === false ? [] : g.patrol.forceSpawn(o.n, o.near, { smitare: !!o.smitare, radius: o.radius ?? 70 });
  },
  open() { return this.cars.filter((c) => c.violation && !c.violation.reported && !c.violation.gone); },
  target(g) {
    const f = g.focus();
    let best = null, bd = Infinity;
    for (const c of this.open()) { const d = dist(c.x, c.z, f.x, f.z); if (d < bd) { bd = d; best = c; } }
    return best ? { x: best.x, z: best.z, r: 3.5 } : null;
  },
  markers() { return this.open().map((c) => ({ type: 'violation', x: c.x, z: c.z, edge: true })); },
  obj() { return { bar: this.k / o.n, barLabel: `Anmälda ${this.k}/${o.n}` }; },
  update(g) {
    this.k = g.patrol.reportsSince(this.t0);
    if (this.k >= o.n) return 'done';
  },
});

// Just wait a moment (for a line of dialogue to land, a car to arrive ...).
export const wait = (o) => ({
  kind: 'wait',
  text: o.text || '',
  init() { this.t = o.secs ?? 2; },
  update(g, m, dt) { this.t -= dt; if (this.t <= 0) return 'done'; },
});

// A race to a place against someone in a car (Anders' Audi). o: { who (driver's NPC key), car (a
// named car to race in) | type + color + carName (a mission car), start: place (the grid: Ove in
// the right-hand lane, the opponent beside him in the left one, kept there along the first
// straight), checkpoints: [[i, j] road nodes], finish: place, finishR = 12, cruise = 19,
// aggressive = false, text, failText, radio: [[who, text]], after: [[i, j]] (where the opponent's
// lane path goes on past the finish), cut (caption while the screen is black: Ove and his car are
// put on the grid behind a cut), clear = 20 (m either side of the first straight cleared of
// traffic) }. Countdown 3-2-1-KÖR; the opponent eases off when ahead and pushes when far behind.
export const race = (o) => ({
  kind: 'race',
  text: o.text || 'Kom först i mål!',
  init(g, m) {
    if (!g.playerCar) g.enterCar(g.ensureNamedCar('saab'));
    const fin = at(o.finish, g);
    this.cps = o.checkpoints.map(([i, j]) => ({ x: nodeX(nodeId(i, j)), z: nodeZ(nodeId(i, j)) }));
    this.cps.push({ x: fin.x, z: fin.z, finish: true });
    this.npc = g.npc(o.who);
    m.data.npcs.add(this.npc);
    this.rubber = 1;
    this.pi = 0; this.oi = 0;
    this.radioI = 0; this.radioT = 7;
    this.lastCount = 4;
    // To the grid behind a cut (the Saab was in the residents' lot a moment ago).
    this.phase = 'cut'; this.cutT = 0;
    hud.curtain(true, o.cut || '');
    g.freezeCar = true;
  },
  // Line up: the opponent in the left lane (its path keeps it there along the first straight),
  // Ove in the right-hand one; no traffic on that straight.
  grid(g, m) {
    const s = at(o.start, g), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
    const c1 = this.cps[0], W = o.clear ?? 20;
    const segD = (x, z) => { const vx = c1.x - s.x, vz = c1.z - s.z, L2 = vx * vx + vz * vz; const t = clamp(((x - s.x) * vx + (z - s.z) * vz) / L2, 0, 1); return dist(x, z, s.x + vx * t, s.z + vz * t); };
    for (const c of g.cars.slice()) if (c.traffic && (dist(c.x, c.z, s.x, s.z) < 45 || segD(c.x, c.z) < W)) g.removeCar(c);
    const pc = g.playerCar;
    pc.place(s.x + rx * LANE, s.z + rz * LANE, s.yaw);
    g.cam.yaw = s.yaw; g.cam.snapNext = true;
    let opp;
    if (o.car) {
      opp = g.ensureNamedCar(o.car);
      // (a lost race queued it to go home once nobody looks: not any more, it's racing again)
      g.rehoming?.delete(opp);
      this.named = opp;
      opp.place(s.x - rx * LANE, s.z - rz * LANE, s.yaw);
    } else opp = g.spawnMissionCar(m, o.type || 'audi', s.x - rx * LANE, s.z - rz * LANE, s.yaw, { color: o.color, name: o.carName });
    this.opp = opp;
    opp.locked = true;
    opp.engineOn = null;
    g.removeCompanion(this.npc);
    if (this.npc.car !== opp) g.seat(this.npc, opp, 1);
    const nodes = [];
    const [a, b] = startNodes(opp);
    nodes.push(a, b);
    for (const [i, j] of o.checkpoints) nodes.push(...findPath(nodes[nodes.length - 1], nodeId(i, j)).slice(1));
    if (o.after) for (const [i, j] of o.after) nodes.push(...findPath(nodes[nodes.length - 1], nodeId(i, j)).slice(1));
    // The driver takes the wheel at "KÖR!" (an AI created now would count the countdown as being
    // stuck and back out).
    this.nodes = nodes;
    this.laneShift = { x: -rx * 2 * LANE, z: -rz * 2 * LANE };
    opp.ai = null; opp.ctrl.park = true; opp.ctrl.throttle = 0;
  },
  // The opponent's lane path, moved into the left lane up to ~30 m before the first turn.
  oppPath() {
    const path = new LanePath(this.nodes);
    path.ensure(60);
    const pts = path.pts, k = pts.findIndex((q) => q.turn);
    if (k > 0) {
      let along = 0;
      const lens = [0];
      for (let i = 1; i <= k; i++) lens.push((along += dist(pts[i].x, pts[i].z, pts[i - 1].x, pts[i - 1].z)));
      const total = lens[k];
      for (let i = 0; i < k; i++) {
        const left = total - lens[i];
        const w = left > 34 ? 1 : left < 16 ? 0 : (left - 16) / 18;
        pts[i].x += this.laneShift.x * w; pts[i].z += this.laneShift.z * w;
      }
    }
    return path;
  },
  target() { const c = this.cps[Math.min(this.pi, this.cps.length - 1)]; return { x: c.x, z: c.z, r: o.finishR || 11, checkpoint: true }; },
  markers() {
    if (!this.opp) return [];
    const out = [{ type: 'enemy', x: this.opp.x, z: this.opp.z, edge: true }];
    const n = this.cps[this.pi + 1];
    if (n) out.push({ type: 'item', x: n.x, z: n.z, edge: false });
    return out;
  },
  obj(g) {
    if (!this.opp) return {};
    const first = this.place(g) === 1, n = this.cps.length;
    return { bar: this.pi / n, barLabel: `${first ? 'Etta' : 'Tvåa'} · kontroll ${Math.min(this.pi, n)}/${n}`, barColor: first ? '#8db487' : '#c4483d' };
  },
  place(g) {
    const f = g.focus();
    if (this.pi !== this.oi) return this.pi > this.oi ? 1 : 2;
    const c = this.cps[Math.min(this.pi, this.cps.length - 1)];
    return dist(f.x, f.z, c.x, c.z) <= dist(this.opp.x, this.opp.z, c.x, c.z) ? 1 : 2;
  },
  update(g, m, dt) {
    if (this.phase === 'cut') {
      this.cutT += dt;
      if (this.cutT > 0.7 && !this.opp) { if (!g.playerCar) g.enterCar(g.ensureNamedCar('saab')); this.grid(g, m); }
      if (this.cutT > 1.3) { hud.curtain(false); this.phase = 'count'; this.countdown = 3.6; }
      return;
    }
    if (this.phase === 'count') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount && n >= 0 && n <= 3) {
        this.lastCount = n;
        if (n > 0) { hud.showBanner(String(n), '', 'count', 900); audio.tick(); }
        else { hud.showBanner('KÖR!', '', 'count', 900); audio.checkpoint(); }
      }
      if (this.countdown <= 0) {
        this.phase = 'race';
        g.freezeCar = false;
        this.ai = this.opp.ai = new AIDriver(this.opp, { mode: 'route', path: this.oppPath(), cruise: o.cruise || 19, aggressive: o.aggressive ?? false, avoid: true, rubber: () => this.rubber });
        this.goT = g.time;
      }
      return;
    }
    if (o.radio && this.radioI < o.radio.length) {
      // (the gap between lines counted from the end of the last one)
      if (voice.quiet()) this.radioT -= dt;
      if (this.radioT <= 0) { g.radio(o.radio[this.radioI][0], o.radio[this.radioI][1]); this.radioI++; this.radioT = 6 + Math.random() * 2; }
    }
    if (this.opp.dead) return 'done';
    const f = g.focus();
    this.sub = g.playerCar ? null : 'Kliv in i bilen igen!';
    const c = this.cps[this.pi];
    if (c && g.playerCar && dist(f.x, f.z, c.x, c.z) < (c.finish ? o.finishR || 12 : 13)) {
      this.pi++;
      audio.checkpoint();
      if (this.pi >= this.cps.length) return 'done';
    }
    const oc = this.cps[this.oi];
    if (oc && dist(this.opp.x, this.opp.z, oc.x, oc.z) < (oc.finish ? (o.finishR || 12) + 1 : 14)) {
      this.oi++;
      if (this.oi >= this.cps.length) return { fail: o.failText || `${this.npc.def.name} kom först.` };
    }
    // Keep it close: the opponent eases off when ahead and pushes when far behind (gap > 0: it leads).
    const cp = this.cps[Math.min(this.pi, this.cps.length - 1)], co = this.cps[Math.min(this.oi, this.cps.length - 1)];
    const gap = (this.oi - this.pi) * 200 + (dist(f.x, f.z, cp.x, cp.z) - dist(this.opp.x, this.opp.z, co.x, co.z));
    this.gap = gap;
    this.rubber = gap > 30 ? 0.75 : gap > 8 ? 0.86 : gap < -40 ? 1.1 : 1;
  },
  cleanup(g, m) {
    g.freezeCar = false;
    if (this.phase === 'cut') hud.curtain(false);
    const opp = this.opp;
    if (!opp) return;
    opp.ai = null; opp.ctrl.park = true; opp.ctrl.throttle = 0;
    if (this.npc.car === opp) {
      // The opponent climbs out at the finish; a named car goes home once nobody is looking.
      const e = g.exitSpot(opp, 1);
      g.unseat(this.npc, e.x, e.z);
    }
    if (this.named) { opp.locked = false; opp.engineOn = false; g.rehome?.(opp); }
  },
});

// Stop a fleeing car (Vita skjortan's Škoda): ram it and stay on its bumper until it gives up,
// like a smitare (DESIGN 4.1) but with a timer. o: { type, color, carName, who (NPC on the
// driver's seat, as a bust), cruise = 19, timer, ram = 3.5 (Ork per unit of impact, at most
// ramMax = 30 a hit: it takes a few), drain = 8/s within 12 m, text, failText, barLabel,
// at (a place: it waits parked there, engine running, instead of a random street 60-120 m off),
// wait (s it waits at most), wake (m: it sets off at once when Ove's car comes this close), goLine
// (its driver's radio line as it sets off), waitText, escape = 170 (m: further than this for 6 s
// and it got away), grace = 0 (s before an escape can count; it never counts before Ove has been
// within seenAt = 60 m of it once), rubber = [near, far] (cruise factor within / beyond 80 m) }.
// When stopped: m.data.wreck = { x, z, car }.
export const destroy = (o) => ({
  kind: 'destroy',
  get text() { return this.waitT > 0 && o.waitText ? o.waitText : o.text; },
  init(g, m) {
    const f = g.focus();
    let x, z, yaw;
    const p = o.at ? at(o.at, g) : null;
    if (p) ({ x, z, yaw } = p);
    else {
      let best = null;
      for (let tries = 0; tries < 60 && best == null; tries++) {
        const id = (Math.random() * NN * NN) | 0;
        const d = dist(nodeX(id), nodeZ(id), f.x, f.z);
        if (d > 60 && d < 120) best = id;
      }
      best ??= nearestNode(f.x + 90, f.z);
      const nb = neighbors(best)[0];
      const dx = nodeX(nb) - nodeX(best), dz = nodeZ(nb) - nodeZ(best), l = Math.hypot(dx, dz);
      x = nodeX(best) + (dx / l) * 14 + (-dz / l) * LANE; z = nodeZ(best) + (dz / l) * 14 + (dx / l) * LANE; yaw = yawTo(dx, dz);
    }
    const car = (this.car = g.spawnMissionCar(m, o.type || 'skoda', x, z, yaw, { color: o.color ?? 0xe8e8e6, name: o.carName || 'vitskjortaSkoda' }));
    car.locked = true;
    car.isTarget = true;
    car.damageScale = o.damageScale ?? 0.4;
    if (o.who) g.addBust(g.charDef(o.who), car);
    this.t = o.timer ?? null;
    this.ork = 100;
    this.farT = 0; this.el = 0; this.seen = false;
    this.stopped = false;
    this.waitT = o.wait ?? 0;
    if (this.waitT > 0) { car.ai = null; car.engineOn = true; car.ctrl.park = true; car.ctrl.throttle = 0; }
    else this.flee(g);
  },
  // Off it goes; it pushes a little while Ove is near and eases off when he is far behind (it used
  // to speed up when far, and a player who lost sight of it never saw it again).
  flee(g) {
    const car = this.car, [rn, rf] = o.rubber || [1, 0.85];
    car.ctrl.park = false;
    car.ai = new AIDriver(car, { mode: 'flee', target: () => g.focusTarget(), cruise: o.cruise || 19, avoid: true, rubber: () => { const f2 = g.focus(); return dist(car.x, car.z, f2.x, f2.z) > 80 ? rf : rn; } });
  },
  onImpact(g, m, a, b, impact) {
    if (this.stopped || impact <= 3) return;
    const pc = g.playerCar;
    if ((a === pc && b === this.car) || (b === pc && a === this.car)) { this.ork -= Math.min(o.ramMax ?? 30, impact * (o.ram ?? 3.5)); g.cam.shake = Math.min(1, g.cam.shake + impact * 0.03); }
  },
  target() { return { x: this.car.x, z: this.car.z, r: 0, follow: true }; },
  markers() { return [{ type: 'enemy', x: this.car.x, z: this.car.z, edge: true }]; },
  obj() { return { timer: this.stopped || this.waitT > 0 ? null : this.t, bar: Math.max(0, this.ork) / 100, barLabel: o.barLabel || 'Ork', barColor: '#c4483d' }; },
  tags(g) { const c = this.car, f = g.focus(); return dist(c.x, c.z, f.x, f.z) < 120 && !this.stopped ? [{ x: c.x, y: c.y + c.height + 0.6, z: c.z, text: o.tag || 'Vita skjortan', cls: 'smitare' }] : []; },
  update(g, m, dt) {
    const c = this.car, f = g.focus();
    if (this.stopped) {
      this.stopT += dt;
      if (c.speed < 0.5 || this.stopT > 7) { m.data.wreck = { x: c.x, z: c.z, car: c }; return 'done'; }
      return;
    }
    const d = dist(c.x, c.z, f.x, f.z);
    if (this.waitT > 0) {
      // Parked where Ove will see it as he comes out; it sets off when he comes close (in a car).
      this.waitT -= dt;
      if (this.waitT <= 0 || (g.playerCar && d < (o.wake ?? 0)) || (!c.dead && this.ork < 100)) {
        this.waitT = 0;
        this.flee(g);
        audio.honk(0.5, 0.25);
        if (o.goLine && o.who) g.radio(o.who, o.goLine);
      }
      this.sub = g.playerCar ? null : 'Kliv in i bilen!';
      return;
    }
    this.el += dt;
    if (this.t != null) { this.t -= dt; if (this.t <= 0) return { fail: o.failText || 'Han kom undan.' }; }
    if (d < 12 && g.playerCar) this.ork -= (o.drain ?? 8) * dt;
    if (d < (o.seenAt ?? 60)) this.seen = true;
    // (it can only get away from a man who was on its tail: never in the first moments, never
    // while Ove is still on his way to it)
    if (d > (o.escape ?? 170) && this.seen && this.el > (o.grace ?? 0)) { this.farT += dt; if (this.farT > 6) return { fail: o.failText || 'Han kom undan.' }; } else this.farT = Math.max(0, this.farT - dt);
    if (this.ork <= 0 || c.dead) {
      this.stopped = true; this.stopT = 0;
      if (!c.dead && c.ai) c.ai.pullOver(); else c.hazard = !c.dead;
      hud.showBanner(o.stopBanner || 'STOPPAD!', o.stopSub || '', 'stamp', 2200);
      audio.stamp();
      return;
    }
    this.sub = g.playerCar ? null : 'Kliv in i bilen!';
  },
});

// Pick something up where the stopped car is (or at a place): on foot, or slowly in a car.
// o: { at (else m.data.wreck), side = 1 (which side of the stopped car: 1 driver's, -1 the other),
// item = 'papers', label, text, got }.
export const grab = (o) => ({
  kind: 'grab',
  text: o.text,
  init(g, m) {
    const w = m.data.wreck || at(o.at, g);
    const p = w.car ? g.exitSpot(w.car, o.side ?? 1) : g.freeSpot(w.x, w.z, 2.5, 5);
    this.item = new Collectible(g.scene, o.item || 'papers', 'quest', p.x, g.groundAt(p.x, p.z) + 0.55, p.z);
    m.items.push(() => this.item.dispose());
  },
  target() { return { x: this.item.x, z: this.item.z, r: 1.5 }; },
  update(g, m) {
    this.item.tick(g.time);
    const f = g.focus(), car = g.playerCar;
    const d = dist(f.x, f.z, this.item.x, this.item.z);
    this.sub = car && car.speed > 3 && d < 12 ? 'Sakta ner.' : null;
    if ((!car && d < 1.5 && g.player.state === 'normal') || (car && d < 3 && car.speed < 3)) {
      this.item.remove();
      audio.jingle('record');
      FX.sparkle(this.item.x, this.item.y, this.item.z, 0xfff1d0, 18);
      m.data.carrying = o.label;
      if (o.got) hud.toast(o.got);
      return 'done';
    }
  },
});

// A conversation in the middle of a mission. o: { who, lines: [[who, text]], from: 'wreck' (they
// step out of m.data.wreck's car) | place, range = 4.5, text }. Starts when Ove is on foot near them.
export const talk = (o) => ({
  kind: 'talk',
  text: o.text || '',
  init(g, m) {
    const n = (this.npc = g.npc(o.who));
    m.data.npcs.add(n);
    g.removeCompanion(n);
    if (n.car) g.unseat(n);
    n.busy = true; n.walkTo = null; n.walkPath = null;
    n.state = 'normal'; n.root.visible = true;
    const car = o.from === 'wreck' ? m.data.wreck?.car : null;
    if (car) {
      if (g.dropBust) g.dropBust(car); else if (car.driverBust) { car.tilt.remove(car.driverBust); car.driverBust = null; }
      const e = g.exitSpot(car, 1);
      n.teleport(e.x, e.z, car.yaw);
      audio.door();
    } else if (o.at) { const p = at(o.at, g), s = g.freeSpot(p.x, p.z, 0, 1.5); n.teleport(s.x, s.z, p.yaw ?? n.yaw); }
    this.phase = 'wait';
  },
  target() { const n = this.npc; return { x: n.x, z: n.z, r: 2.5 }; },
  tags() { const n = this.npc; return this.phase === 'wait' ? [{ x: n.x, y: n.y + n.height + 0.35, z: n.z, text: n.def.name, cls: 'errand' }] : []; },
  update(g, m, dt) {
    const n = this.npc, p = g.player;
    if (this.phase === 'done') return 'done';
    if (this.phase === 'talking') return;
    if (this.phase === 'stand') {
      // A few frames with everyone where the scene has put them, so the shot is judged on the
      // final positions (physics has settled the step out of the car).
      p.wishX = p.wishZ = 0; p.vx = p.vz = 0;
      this.standT -= dt;
      if (this.standT > 0) return;
      this.phase = 'talking';
      // (a mission call still going is cut off: no call card over the scene)
      g.interrupts.hangUp?.();
      (async () => {
        n.yaw = yawTo(p.x - n.x, p.z - n.z);
        p.yaw = yawTo(n.x - p.x, n.z - p.z);
        g.cinematic(n, p);
        await g.dialog(o.lines);
        g.endCinematic();
        this.phase = 'done';
      })();
      return;
    }
    this.sub = g.playerCar ? 'Kliv ur bilen.' : null;
    if (g.playerCar && g.playerCar.speed < 1 && dist(g.playerCar.x, g.playerCar.z, n.x, n.z) < 9) g.exitCar(true);
    if (g.playerCar || p.state !== 'normal' || dist(p.x, p.z, n.x, n.z) > (o.range ?? 4.5)) return;
    // Ove steps up in front of them, on their side of the cars (he used to pop out of the Saab on
    // its far side, and the scene was filmed without him).
    const s = standFor(g, n, o.from === 'wreck' ? m.data.wreck?.car : null);
    if (s) p.teleport(s.x, s.z, yawTo(n.x - s.x, n.z - s.z));
    p.wishX = p.wishZ = 0; p.vx = p.vz = 0;
    n.yaw = yawTo(p.x - n.x, p.z - n.z);
    g.inDialog = true;
    this.phase = 'stand'; this.standT = 0.15;
  },
  cleanup(g) { if (this.phase === 'stand') g.inDialog = false; },
});

// Where Ove stands to talk to n: about 2 m out from them on the open side (away from the car they
// stepped out of, else the way they face), on their level, clear of cars and walls, with nothing
// between them (no car, nothing taller than 0.6 m); of those the nearest to where Ove is. null: he
// already stands well, or there is no such spot.
function standFor(g, n, car) {
  const p = g.player;
  let base = n.yaw;
  if (car) { const dx = n.x - car.x, dz = n.z - car.z; if (Math.hypot(dx, dz) > 0.3) base = Math.atan2(dx, dz); }
  const ok = (x, z) => {
    const y = g.groundAt(x, z);
    if (Math.abs(y - n.y) > 0.25 || !g.spotFree(x, z, y)) return false;
    if (segmentBlocked(n.x, n.z, x, z, Math.min(n.y, y) + 0.6) >= 0) return false;
    const L = dist(n.x, n.z, x, z), steps = Math.max(2, Math.ceil(L / 0.15));
    for (const c of g.cars) {
      if (Math.abs(c.x - x) > 9 || Math.abs(c.z - z) > 9) continue;
      if (circleVsObb(x, z, 0.7, c.obb, _h)) return false;
      for (let k = 1; k < steps; k++) if (circleVsObb(n.x + (x - n.x) * k / steps, n.z + (z - n.z) * k / steps, 0.3, c.obb, _h)) return false;
    }
    return true;
  };
  const d = dist(p.x, p.z, n.x, n.z);
  if (d > 1.5 && d < 3 && Math.abs(angleDiff(base, yawTo(p.x - n.x, p.z - n.z))) < 1.3 && ok(p.x, p.z)) return null;
  // (all the way round, further out last: with the Saab pulled up alongside, the open spot is past
  // the ends of the two cars)
  let best = null, bs = Infinity;
  for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0, 2.5, -2.5, Math.PI]) for (const r of [2.0, 2.4, 1.7, 2.8, 3.4]) {
    const a = base + da, x = n.x + Math.sin(a) * r, z = n.z + Math.cos(a) * r;
    const sc = Math.abs(da) * 0.5 + Math.abs(r - 2) * 0.8 + dist(x, z, p.x, p.z) * 0.05;
    if (sc >= bs || !ok(x, z)) continue;
    bs = sc; best = { x, z };
  }
  return best;
}

// A cut to black and back (a time skip). o: { delay = 0 (s the scene runs on first), secs = 2.2
// (s black), caption ('Senare samma dag'), clock: [h, m] (the clock jumps while it is dark),
// banner: [main, sub, kicker] (as the picture comes back), away: [npc keys out of the story for the
// rest of the mission: hidden], then(g, m) (while it is dark: move things) }.
export const cut = (o) => ({
  kind: 'cut',
  text: o.text || '',
  init() { this.t = 0; this.phase = 0; },
  update(g, m, dt) {
    this.t += dt;
    const d = o.delay ?? 0, black = o.secs ?? 2.2;
    if (this.phase === 0 && this.t >= d) { this.phase = 1; hud.curtain(true, o.caption || ''); g.inDialog = true; }
    if (this.phase === 1 && this.t >= d + 0.7) {
      this.phase = 2;
      if (o.clock) g.setClock(o.clock[0], o.clock[1] || 0);
      if (o.away) { m.data.away ??= new Set(); for (const k of o.away) { m.data.away.add(k); const n = g.npc(k); if (!n.car && !g.companions.has(n)) { n.walkTo = null; n.walkPath = null; n.busy = false; n.homeX = undefined; } } }
      o.then?.(g, m);
    }
    if (this.phase === 2 && this.t >= d + 0.7 + black) {
      this.phase = 3;
      hud.curtain(false);
      g.inDialog = false;
      if (o.banner) hud.showBanner(o.banner[0], o.banner[1] || '', 'mission', 2600, o.banner[2] || '');
    }
    if (this.phase === 3 && this.t >= d + 1.3 + black) return 'done';
  },
  cleanup(g) { if (this.phase === 1 || this.phase === 2) { hud.curtain(false); g.inDialog = false; } },
});

export const STAGES = { getInCar, goto, holdAt, fetch, pickup, dropoff, escort, catchCat, parkIn, report, wait, race, destroy, grab, talk, cut };
