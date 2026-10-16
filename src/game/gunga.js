// Saab & Run — pushing the playgrounds' swings, and being hit by them (feature
// gungorna_saknar_linor). The seats are world/swings.js' pendulums; this steps the ones that move
// (60 Hz, main.js stepWorld) and:
//   - E at a swing (on foot, in line with its seat, facing it, where it comes within his reach: at
//     most GUNGA.stand m out across the beam): Ove holds his hands out for it ('ready', at most
//     GUNGA.ready s), takes the lines as the seat comes within his reach ('take': a still one he
//     steps in to, one coming at him slows into his hands) and shoves it off ('shove': his hands go
//     with the lines until they are out of reach). What a seat brought with it adds to the shove, so
//     each push as it comes back sends it higher: ~34° from rest, then ~45°, ~53°, ~59° ... at most
//     SWING.max (72°).
//   - A seat that comes at him by itself (its speed into him > GUNGA.hit m/s) while his hands aren't
//     on it hits him: GUNGA.fall (30 %) of the time he goes over (a ragdoll: actors/ragdoll.js, the
//     legs knocked from under him; main.js onGetUp says OVE_STUMBLE.swing when he is up), otherwise
//     it knocks him back a little and bounces off him. Slower it stops against him; walking into one
//     pushes it ahead of him (to ~57°: then it lets him by); from the side it is in his way.
//   - Ove's car into a seat sends it flying off the bumper (a car standing under it: the seat rests
//     against its side).
// API: step(h) (fixed step), update(dt) (the push: phases, pose), reach() (main.js
// nearestInteractable: { s, sg (the way he shoves it, in th), facing, d } or null), push(r), op (the
// push going on; op.lock: no walking, jumping or kicking), stats, log (the last 20 events), rand
// (tests make chance come true), fallNext (tests: true / false, the next hit's outcome).

import { swings, SWING } from '../world/swings.js';
import { audio } from '../audio.js';
import { fx as FX } from './fx.js';
import { CHARS } from '../actors/models.js';
import { OVE_REPLY } from './script.js';
import { circleVsObb } from '../world/collision.js';
import { clamp, dist, yawTo, dampAngle } from '../util.js';

export const GUNGA = {
  push: 1.5,       // rad/s a shove gives a seat at rest (2.3 m/s: up to ~34°)
  stand: 1.7,      // m across the beam from the hooks: how far out Ove may stand to push one
  grip: 0.7,       // m: lines closer than this ahead of him are in his hands' reach ...
  near: 0.44,      // ... he steps in to this to shove a still one ...
  arm: 0.74,       // ... and his hands go with them this far
  hand: 1.12,      // m above his soles: where he takes the lines
  ready: 2.2,      // s he holds his hands out for it
  take: 0.26,      // s from his hands on the lines to the shove (a seat coming at him slows into them)
  shove: 0.32,     // s at most his hands go with the lines
  hit: 1.25,       // m/s: the seat's own speed into him from which it is a hit
  fall: 0.3,       // a hit knocks him over this often
  ear: 35,         // m: no creak heard from further off
};

const _hit = {};

export class Gungor {
  constructor(g) {
    this.g = g;
    this.active = [];
    this.op = null;
    this.stats = { pushes: 0, hits: 0, falls: 0, stops: 0, cars: 0 };
    this.log = [];
    this.rand = Math.random;
    this.fallNext = null;
    this.reachG = [0, 0, 0]; this.left = 0;
  }

  // A seat that moves from now on (stepped until it rests).
  wake(s) { s.moving = true; if (!this.active.includes(s)) this.active.push(s); }
  note(ev) { this.log.push({ t: +this.g.time.toFixed(2), ...ev }); if (this.log.length > 20) this.log.shift(); }
  vol(s, k = 1) { const f = this.g.focus(); return clamp(1.05 - dist(f.x, f.z, s.x, s.z) / GUNGA.ear, 0, 1) * k; }

  step(h) {
    const g = this.g, p = g.player, op = this.op;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i], w0 = s.w;
      // in his hands: a seat coming at him slows into them
      if (op?.s === s && op.phase === 'take' && s.w * op.sg < 0) s.w *= Math.exp(-14 * h);
      if (!s.step(h) && op?.s !== s) { this.active.splice(i, 1); continue; }
      // turning at the end of a swing: the hooks creak
      if (w0 * s.w < 0 && Math.abs(s.th) > 0.3) audio.swing('creak', this.vol(s, Math.min(1, Math.abs(s.th) * 0.9)), s.kind === 'chain');
    }
    if (g.playerCar) this.touchCar(g.playerCar);
    else if (p.state === 'normal') this.touchOve(h);
  }

  // Ove against the seats near him (resting ones too: he may walk into one).
  touchOve() {
    const g = this.g, p = g.player, r = p.r * 0.8, op = this.op;
    for (const s of swings) {
      const dx = p.x - s.x, dz = p.z - s.z;
      if (dx * dx + dz * dz > 9) continue;
      const a = dx * s.ax + dz * s.az, o = dx * s.ox + dz * s.oz;
      const penA = s.hw + r - Math.abs(a);
      if (penA <= 0) continue;
      const sy = s.sy;
      if (sy < p.y + 0.08 || sy > p.y + p.height * 0.95) continue;
      const d = o - s.so, reachD = s.hd + r, penO = reachD - Math.abs(d);
      if (penO <= 0 || op?.s === s) continue;
      const n = d >= 0 ? 1 : -1;            // across the beam, from the seat to him
      const vs = s.svo * n;                  // the seat's own speed into him
      if (penA < 0.08 && penA < penO) {
        // at its side: it is in his way (a seat flying past nudges him aside)
        const sa = a >= 0 ? 1 : -1;
        p.x += s.ax * sa * penA; p.z += s.az * sa * penA;
        const va = p.vx * s.ax + p.vz * s.az;
        if (va * sa < 0) { p.vx -= s.ax * va; p.vz -= s.az * va; }
        continue;
      }
      if (vs > GUNGA.hit && !(g.time < s.cd)) { this.hit(s, n, vs); return; }
      // slower: it stops against him, or goes ahead of him as he walks into it
      const pv = (p.vx * s.ox + p.vz * s.oz) * n;   // his speed away from it
      if (vs > pv) {
        const edge = o - n * reachD;
        if (Math.abs(edge) > s.L * 0.84) continue;   // pushed as far as it goes: he gets by under it
        // (it goes with him as he walks into it; drifting into him it bounces off a little)
        const th = Math.asin(clamp(edge / s.L, -1, 1)), v = pv - 0.2 * Math.max(0, vs);
        s.set(th, (v * n) / (s.L * Math.cos(th)));
        s.cap();
        this.wake(s);
        if (vs - pv > 0.6) { this.stats.stops++; audio.swing('push', this.vol(s, 0.5), s.kind === 'chain'); }
      }
    }
  }

  // It swings into him: over he goes (FALL), or it knocks him back a little and bounces off.
  hit(s, n, vs) {
    const g = this.g, p = g.player, nx = s.ox * n, nz = s.oz * n;
    this.stats.hits++;
    s.cd = g.time + 1.2;
    const fall = this.fallNext ?? this.rand() < GUNGA.fall;
    this.fallNext = null;
    audio.swing('hit', this.vol(s, Math.min(1, 0.4 + vs / 4)), s.kind === 'chain');
    // (a body, not a wall: the seat loses most of its speed in him either way)
    if (fall && !g.carrying && !g.pushedNpc() && !g.inDialog) {
      // The legs knocked from under him: the body thrown along the seat's way, the points below where
      // it hit him more than those above (the head goes back towards the swing: on his face if he
      // stood facing it, on his back if it came from behind).
      const k = clamp((s.sy - p.y) / p.height, 0.25, 0.6);
      const ok = p.tumble({
        v: [nx * vs * 0.4 + p.vx * 0.3, 0.6, nz * vs * 0.4 + p.vz * 0.3],
        trip: [-nx, -nz, 1.4 + 0.55 * vs, k], tone: 0.3, brace: true,
        lie: 0.7 + this.rand() * 0.6, why: 'swing',
      });
      if (ok) {
        this.stats.falls++;
        s.w *= 0.35;
        audio.oof(p.def.voice);
        FX.dust(p.x, p.z, 2, p.y + 0.08);
        this.note({ ev: 'fall', vs: +vs.toFixed(2) });
        return;
      }
    }
    p.x += nx * 0.08; p.z += nz * 0.08;
    p.vx += nx * vs * 0.6; p.vz += nz * vs * 0.6;
    s.w *= -0.3;
    audio.oof(p.def.voice);
    if (this.rand() < 0.3 && !g.inDialog) { g.say(p, this.rand() < 0.5 ? OVE_REPLY[0] : OVE_REPLY[3], 1.4); g.murmur(CHARS.ove.voice); }
    this.note({ ev: 'bump', vs: +vs.toFixed(2) });
  }

  // Ove's car into a seat: it flies off the bumper.
  touchCar(c) {
    for (const s of swings) {
      const sx = s.x + s.ox * s.so, sz = s.z + s.oz * s.so, sy = s.sy;
      if (Math.abs(sx - c.x) > c.radius + 0.5 || Math.abs(sz - c.z) > c.radius + 0.5) continue;
      if (sy > c.y + c.height || !circleVsObb(sx, sz, 0.22, c.obb, _hit)) continue;
      // (n: the way the car pushes it across the beam; no: the car's side is along the swing)
      const no = _hit.nx * s.ox + _hit.nz * s.oz, n = Math.sign(no) || Math.sign(c.vx * s.ox + c.vz * s.oz);
      if (Math.abs(no) < 0.3) continue;
      const cv = c.vx * s.ox + c.vz * s.oz, rel = cv - s.svo;
      // out of the car's body (a car standing under the swing: the seat rests against its side)
      const so = s.so + n * _hit.depth / Math.abs(no);
      if (Math.abs(so) < s.L * 0.84) { s.th = Math.asin(so / s.L); this.wake(s); }
      if (rel * n <= 0.2) { if (s.w * n < 0) s.w = 0; s.place(); continue; }
      const ct = Math.max(0.3, Math.cos(s.th));
      s.w = (cv + n * Math.min(1.5, Math.abs(rel) * 0.3)) / (s.L * ct);
      s.cap();
      this.wake(s);
      s.place();
      if (Math.abs(rel) > 1 && !(this.g.time < s.carT)) { s.carT = this.g.time + 0.5; this.stats.cars++; audio.swing('clank', this.vol(s, Math.min(1, Math.abs(rel) / 6)), s.kind === 'chain'); }
    }
  }

  // The swing Ove could push now, or null.
  reach() {
    const g = this.g, p = g.player;
    if (this.op || g.playerCar || p.state !== 'normal' || !p.onGround || g.carrying || g.pushedNpc() || g.doorOp) return null;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best = null;
    for (const s of swings) {
      const dx = p.x - s.x, dz = p.z - s.z;
      if (dx * dx + dz * dz > 6.25) continue;
      const a = dx * s.ax + dz * s.az, o = dx * s.ox + dz * s.oz;
      if (Math.abs(a) > s.hw + 0.12 || Math.abs(o) < 0.3 || Math.abs(o) > GUNGA.stand) continue;
      const lift = s.y - s.L - p.y;
      if (lift < 0.15 || lift > 1.1) continue;
      // (only where it comes within his reach: at rest, or as high as it swings now)
      if (Math.abs(o) > GUNGA.grip + (s.y - p.y - GUNGA.hand) * Math.tan(Math.min(1, s.amplitude()))) continue;
      const sg = o > 0 ? -1 : 1, facing = (fx * s.ox + fz * s.oz) * sg;
      if (facing < 0.3) continue;
      const d = Math.abs(o) + Math.abs(a);
      if (!best || d < best.d) best = { s, sg, facing, d };
    }
    return best;
  }

  push(r) {
    if (this.op || !r) return false;
    this.op = { s: r.s, sg: r.sg, phase: 'ready', t: 0, pt: 0, lock: false, uin: 0, wx: 0, wz: 0 };
    this.wake(r.s);
    this.note({ ev: 'ready' });
    return true;
  }
  endOp() {
    this.op = null;
    this.g.player.faceWish = true;
  }

  // Where his hands take the lines (world, into reachG): on them at GUNGA.hand above his soles, in
  // the middle between them; and how far ahead of him that is.
  grip(op) {
    const s = op.s, p = this.g.player, hy = p.y + GUNGA.hand, c = Math.max(0.2, Math.cos(s.th));
    const q = Math.max(0, s.y - hy) / c, off = q * Math.sin(s.th);
    const G = this.reachG;
    G[0] = s.x + s.ox * off; G[1] = hy; G[2] = s.z + s.oz * off;
    const dx = G[0] - p.x, dz = G[2] - p.z, sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
    this.left = dx * cs - dz * sn;
    return dx * sn + dz * cs;
  }

  update(dt) {
    const op = this.op;
    if (!op) return;
    const g = this.g, p = g.player, s = op.s;
    if (g.playerCar || p.state !== 'normal' || !p.onGround || g.inDialog || g.failWait || g.cold.busy || g.carrying) { this.endOp(); return; }
    op.t += dt; op.pt += dt;
    p.faceWish = false;
    p.yaw = dampAngle(p.yaw, yawTo(op.sg * s.ox, op.sg * s.oz), 10, dt);
    const ahead = this.grip(op), u = s.w * op.sg;   // (u: + the seat going away from him)
    op.wx = op.wz = 0;
    if (op.phase === 'ready') {
      // (walking off, or it never comes: he lets it be)
      if (op.pt > GUNGA.ready || (op.pt > 0.15 && p.speed > 0.6)) { this.endOp(); return; }
      if (ahead < GUNGA.grip && ahead > 0.12 && u < 0.4) { op.phase = 'take'; op.pt = 0; op.lock = true; op.uin = Math.min(0, u); audio.swing('push', this.vol(s, 0.45), s.kind === 'chain'); }
      else { this.pose(Math.min(0.45, Math.max(0.3, ahead)), clamp(this.left, -0.15, 0.15)); return; }
    }
    if (op.phase === 'take') {
      this.pose(ahead, this.left);
      // a seat hanging still: he steps in to it (his arms bent, room to shove); one coming at him
      // he takes where it comes
      if (u > -0.3) { const v = clamp((ahead - GUNGA.near) * 6, -0.8, 1.2); op.wx = Math.sin(p.yaw) * v; op.wz = Math.cos(p.yaw) * v; }
      if (op.pt >= GUNGA.take) {
        // The shove: GUNGA.push from rest; what a seat coming at him brought with it is caught and
        // given back with the shove (the energies add up: each push in time sends it higher); a
        // seat already going gets a smaller push.
        const P = GUNGA.push;
        const u2 = op.uin < 0 ? Math.hypot(op.uin, P) : Math.hypot(Math.max(0, u), P * (u > 0.3 ? 0.6 : 1));
        s.w = op.sg * u2;
        s.cap();
        this.wake(s);
        this.stats.pushes++;
        this.note({ ev: 'push', amp: +s.amplitude().toFixed(3) });
        audio.swing('push', this.vol(s, 0.8), s.kind === 'chain');
        op.phase = 'shove'; op.pt = 0;
      }
      return;
    }
    // 'shove': his hands with the lines while they are in reach
    if (op.pt > GUNGA.shove || ahead > GUNGA.arm) { this.endOp(); return; }
    this.pose(ahead, this.left);
  }
  // Both hands on the lines (main.js' door pose: a bar across in front of him, at reachG).
  pose(ahead, left) {
    const g = this.g, p = g.player;
    g.poseReach = [GUNGA.hand, ahead, left];
    g.posePlayer('work', 'door');
  }
}
