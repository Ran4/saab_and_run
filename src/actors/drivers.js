// AI drivers on the road grid. Modes:
//   'traffic'  wander the streets in the right-hand lane (indicators at turns, keeps distance)
//   'route'    follow a LanePath to its end (missions), then stop; onArrive(ai) once
//   'chase'    hunt a target ({x, z, vx, vz} from opts.target()): lanes when far, straight at it near
//   'flee'     run from opts.target(): fast, picks far-away destinations, swerves past slower cars,
//              reverses out when stuck
//   'pullover' indicate right, slow down to the kerb, stop with hazards on -> 'parked'
//              (ai.pullOver(onStopped) switches any driver to it)
// Speeds: traffic ~30-50 km/h (cruise 8-14 m/s); turns are taken at what the grip allows, with
// braking planned ahead (the cars brake like real ones now, ~8 m/s² at most).

import { LANE, P, nodeX, nodeZ, neighbors, nearestNode, findPath, nodeI, nodeJ, N, rc, RHW, isRoad } from '../world/layout.js';
import { groundAt } from '../world/collision.js';
import { fx as FX } from '../game/fx.js';
import { clamp, angleDiff, yawTo } from '../util.js';

const M = 8.5; // how far from an intersection's centre a lane path starts its turn

function dirOf(a, b) {
  const dx = nodeX(b) - nodeX(a), dz = nodeZ(b) - nodeZ(a), l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

// Points along the lanes through a list of nodes. Turn points carry the turn's direction
// (turn: -1 left, +1 right, 2 = U-turn) and its radius r (m).
export class LanePath {
  constructor(nodes, opts = {}) {
    this.nodes = nodes.slice();
    this.pts = [];
    this.built = 0;
    this.idx = 0;
    this.wander = !!opts.wander;
    this.endPoint = opts.endPoint || null; // final [x,z] beyond the last node
    this.finished = false;
  }
  ensure(n = 14) {
    while (this.pts.length - this.idx < n) {
      if (this.wander && this.nodes.length - this.built < 3) {
        const last = this.nodes[this.nodes.length - 1], prev = this.nodes[this.nodes.length - 2];
        const opts = neighbors(last).filter((m) => m !== prev);
        const [dx, dz] = prev !== undefined ? dirOf(prev, last) : [0, 0];
        const weighted = [];
        for (const m of opts) {
          const [ex, ez] = dirOf(last, m);
          weighted.push(m);
          if (ex * dx + ez * dz > 0.9) weighted.push(m, m);
        }
        this.nodes.push(weighted[(Math.random() * weighted.length) | 0]);
      }
      if (this.built >= this.nodes.length - 1) {
        if (this.endPoint && !this._endAdded) { this.pts.push({ x: this.endPoint[0], z: this.endPoint[1], end: true }); this._endAdded = true; }
        break;
      }
      this.buildEdge(this.built++);
    }
    if (this.idx > 40) { this.pts.splice(0, 30); this.idx -= 30; }
  }
  buildEdge(k) {
    const A = this.nodes[k], B = this.nodes[k + 1], C = this.nodes[k + 2];
    const [dx, dz] = dirOf(A, B), rx = -dz, rz = dx;
    const ax = nodeX(A), az = nodeZ(A), bx = nodeX(B), bz = nodeZ(B);
    const sx = ax + dx * M + rx * LANE, sz = az + dz * M + rz * LANE;
    const ex = bx - dx * M + rx * LANE, ez = bz - dz * M + rz * LANE;
    const len = Math.hypot(ex - sx, ez - sz), n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i <= n; i++) this.pts.push({ x: sx + (ex - sx) * (i / n), z: sz + (ez - sz) * (i / n) });
    if (C === undefined) return;
    const [d2x, d2z] = dirOf(B, C), r2x = -d2z, r2z = d2x;
    const dot = dx * d2x + dz * d2z;
    if (dot > 0.9) return; // straight on: the next edge starts where this one ends
    if (dot < -0.9) {
      this.pts.push({ x: bx + dx * 3 + rx * LANE, z: bz + dz * 3 + rz * LANE, turn: 2, r: 3 });
      this.pts.push({ x: bx + dx * 4, z: bz + dz * 4, turn: 2, r: 3 });
      this.pts.push({ x: bx + dx * 3 - rx * LANE, z: bz + dz * 3 - rz * LANE, turn: 2, r: 3 });
      return;
    }
    const right = d2x * rx + d2z * rz > 0;
    const r = right ? M - LANE : M + LANE;
    const cx = bx + (rx + r2x) * LANE, cz = bz + (rz + r2z) * LANE;
    const xx = bx + d2x * M + r2x * LANE, xz = bz + d2z * M + r2z * LANE;
    for (let i = 1; i < 6; i++) {
      const t = i / 6, u = 1 - t;
      this.pts.push({ x: u * u * ex + 2 * u * t * cx + t * t * xx, z: u * u * ez + 2 * u * t * cz + t * t * xz, turn: right ? 1 : -1, r });
    }
  }
}

export function startNodes(car) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const n0 = nearestNode(car.x, car.z);
  const tx = nodeX(n0) - car.x, tz = nodeZ(n0) - car.z;
  if (tx * fx + tz * fz > 4) {
    let best = null, bd = -Infinity;
    for (const m of neighbors(n0)) { const [dx, dz] = dirOf(m, n0); const s = dx * fx + dz * fz; if (s > bd) { bd = s; best = m; } }
    return [best, n0];
  }
  let best = null, bd = -Infinity;
  for (const m of neighbors(n0)) { const [dx, dz] = dirOf(n0, m); const s = dx * fx + dz * fz; if (s > bd) { bd = s; best = m; } }
  return [n0, best];
}

export function pathTo(car, targetNode, endPoint = null, noUturn = false) {
  const [a, b] = startNodes(car);
  let rest = findPath(b, targetNode);
  // noUturn (chase): a U-turn at a junction is tighter than any car's lock (the lanes are 5.5 m apart)
  // and ends over a kerb; go round the block instead
  if (noUturn && rest.length > 1 && rest[1] === a) {
    let alt = null;
    if (targetNode !== a) alt = findPath(b, targetNode, new Set([a]));
    else for (const c of neighbors(b)) if (c !== a) { const r = findPath(c, a, new Set([b])); if (r[r.length - 1] === a) { alt = [b, ...r]; break; } }
    if (alt && alt[alt.length - 1] === targetNode) rest = alt;
  }
  return new LanePath([a, ...rest], { endPoint });
}

// The nearest street to (x, z): its centre line { axis: 'x' (runs along x) | 'z', c, d (distance) }.
function nearestStreet(x, z) {
  const snap = (v) => { let best = rc(0), bd = Infinity; for (let i = 0; i <= N; i++) { const d = Math.abs(v - rc(i)); if (d < bd) { bd = d; best = rc(i); } } return { c: best, d: bd }; };
  const sx = snap(x), sz = snap(z);
  return sx.d < sz.d ? { axis: 'z', c: sx.c, d: sx.d } : { axis: 'x', c: sz.c, d: sz.d };
}
// A point in the right-hand lane of the street nearest (x, z), `ahead` metres on in the direction
// closest to (dx, dz) - where a car that has left the asphalt should aim to get back on it.
export function laneAim(x, z, dx, dz, ahead = 6) {
  const s = nearestStreet(x, z);
  if (s.axis === 'z') { const dir = Math.sign(dz) || 1; return { x: s.c - dir * LANE, z: z + dir * ahead, d: s.d }; }
  const dir = Math.sign(dx) || 1;
  return { x: x + dir * ahead, z: s.c + dir * LANE, d: s.d };
}
// Drivable: asphalt - the streets, and the car parks and their entrances (the world registers every
// flat surface with fx.surfaceAt), not pavements, lawns, gravel paths or yards.
const drivable = (x, z) => (FX.surfaceAt ? FX.surfaceAt(x, z) === 'asphalt' : isRoad(x, z));
// Is the straight segment from (ax, az) to (bx, bz) drivable all the way (n samples)?
function roadBetween(ax, az, bx, bz, n = 6) {
  for (let k = 1; k <= n; k++) { const t = k / n; if (!drivable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}

export class AIDriver {
  constructor(car, opts = {}) {
    this.car = car;
    this.mode = opts.mode || 'traffic';
    this.cruise = opts.cruise ?? 10 + Math.random() * 3;
    this.path = opts.path || null;
    this.stuckT = 0;
    this.reverseT = 0;
    this.blockedT = 0;
    this.ignoreT = 0;
    this.honkT = 0;
    this.hurryT = 0;    // honked at by Ove from behind (game/horn.js): traffic speeds up for a moment
    this.target = opts.target || null;   // for chase / flee: () => {x,z,vx,vz}
    this.replanT = 0;
    this.aggressive = !!opts.aggressive;
    this.avoid = opts.avoid ?? true;
    this.wobble = opts.wobble || 0;
    this.rubber = opts.rubber || null;    // () => speed multiplier
    this.onArrive = opts.onArrive || null;
    this.onStopped = opts.onStopped || null;
    this.arrived = false;
    this.swerveT = 0; this.swerve = 0;
    this.stuckN = 0; this.stuckAt = null;
    this.t = Math.random() * 10;
    if (this.mode === 'pullover') this.pullOver(this.onStopped);
    else if (!this.path && this.mode === 'traffic') this.setPath(new LanePath(startNodes(car), { wander: true }));
    else if (this.path) this.setPath(this.path);
  }

  setPath(path) {
    const car = this.car, fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    path.ensure();
    while (path.idx < path.pts.length - 1) {
      const q = path.pts[path.idx];
      if ((q.x - car.x) * fx + (q.z - car.z) * fz < 1) path.idx++;
      else break;
    }
    this.path = path;
    this.arrived = false;
  }

  // A three-point turn to the left (into the road, away from the kerb): forward on full left lock
  // until the nose nears the far kerb, back on full right lock, forward on left lock until it faces
  // the way back; then a fresh path.
  updateKTurn(dt) {
    const k = this.kturn, car = this.car, c = car.ctrl, fwd = car.forwardSpeed;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), reach = car.spec.len / 2 + 1.2;
    const turned = Math.abs(angleDiff(k.yaw0, car.yaw));
    k.t += dt;
    c.handbrake = false;
    if (k.phase === 1) {
      c.throttle = fwd < 2.5 ? 0.55 : 0; c.brake = 0; c.steer = -1;
      const blocked = !isRoad(car.x + fx * reach, car.z + fz * reach);
      if (k.t > 2.8 || turned > 1.6 || (blocked && k.t > 0.4)) { k.phase = 2; k.t = 0; }
    } else if (k.phase === 2) {
      c.throttle = 0; c.brake = fwd > 0.3 ? 1 : 0.6; c.steer = 1;
      const blocked = !isRoad(car.x - fx * reach, car.z - fz * reach);
      if (k.t > 2.6 || turned > 2.6 || (blocked && k.t > 0.6)) { k.phase = 3; k.t = 0; }
    } else {
      c.throttle = fwd < 3 ? 0.6 : 0; c.brake = 0; c.steer = -1;
      if (Math.abs(angleDiff(car.yaw, k.H)) < 0.35 || k.t > 3.2) { this.kturn = null; this.kCool = 8; this.forceReplan = true; }
    }
  }

  // A U-turn point (turn 2) on the path within `range` metres ahead?
  uturnAhead(range) {
    const p = this.path;
    if (!p) return false;
    let d = 0, px = this.car.x, pz = this.car.z;
    for (let i = p.idx; i < p.pts.length && d < range; i++) {
      const q = p.pts[i];
      d += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z;
      if (q.turn === 2 && d < range) return true;
    }
    return false;
  }

  // Signal right, ease over to the kerb and stop there with the hazards on. The stop point is on the
  // lane's outer edge (the car's centre at most RHW - 1.1 from the road's centre line); if the place it
  // would stop is on a kerb (an island, a bus-stop kerb, a corner) it stays in its lane and just brakes
  // there - round 2 steered out onto kerb islands and stood tilted with a wheel in the air. A car shoved
  // off the asphalt (a rammed smitare) comes back onto it at walking pace first.
  pullOver(onStopped = null) {
    const car = this.car;
    this.mode = 'pullover';
    this.onStopped = onStopped || this.onStopped;
    this.po = { v0: Math.max(4, Math.abs(car.forwardSpeed)), run: 0, lastX: car.x, lastZ: car.z, kerb: kerbLine(car), checkT: 0 };
    const k = this.po.kerb, lat = k ? Math.abs((car.x - k.x) * k.dz - (car.z - k.z) * k.dx) : 0;
    this.po.dist = 14 + this.po.v0 * 1.4 + Math.min(8, Math.max(0, lat - 2) * 0.8);   // (a little further if it has to get back onto the street)
    this.po.stillT = 0;
    if (k && isRoad(car.x, car.z) && this.kerbBlocked(this.po.dist * 0.85)) this.po.inLane = true;
    car.indicator = 1;
    car.hazard = false;
  }
  // Would the car, pulling over to the kerb line, end up on a kerb `ahead` metres on?
  kerbBlocked(ahead) {
    const car = this.car, k = this.po.kerb;
    if (!k) return false;
    const s = (car.x - k.x) * k.dx + (car.z - k.z) * k.dz + ahead;
    const x = k.x + k.dx * s, z = k.z + k.dz * s;
    const rx = -k.dz, rz = k.dx;                   // outwards (the kerb side): right of the travel direction
    const half = car.spec.wid / 2 + 0.15, len = car.spec.len / 2;
    const ex = x + rx * half, ez = z + rz * half;
    for (const [px, pz] of [[x, z], [ex, ez], [ex + k.dx * len, ez + k.dz * len], [ex - k.dx * len, ez - k.dz * len]]) {
      if (groundAt(px, pz, 0.2, 0.6) > 0.1 || !isRoad(px, pz)) return true;
    }
    return false;
  }

  update(dt, game) {
    const car = this.car;
    const c = car.ctrl;
    c.park = false;
    this.t += dt;
    if (car.dead) { c.throttle = 0; c.brake = 0; c.park = true; car.indicator = 0; return; }
    if (this.mode === 'pullover' || this.mode === 'parked') { this.updatePullover(dt); return; }
    const speed = car.speed, fwd = car.forwardSpeed;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const flee = this.mode === 'flee', chase = this.mode === 'chase';

    let direct = null;
    if (chase && this.target) {
      if (this.kturn) { this.updateKTurn(dt); return; }
      const t = this.target();
      const d = Math.hypot(t.x - car.x, t.z - car.z);
      // the target is well behind and the car is slow on a street: turn round on the spot (a
      // three-point turn) instead of driving off to the next junction and round the block
      this.kCool = (this.kCool || 0) - dt;
      if (this.kCool <= 0 && d > 25 && fwd < 9 && isRoad(car.x, car.z) && ((t.x - car.x) * fx + (t.z - car.z) * fz) / d < -0.6) {
        if (fwd > 1) { c.throttle = 0; c.brake = 1; c.steer = 0; return; }
        this.kturn = { phase: 1, t: 0, yaw0: car.yaw, H: car.yaw + Math.PI };
        this.updateKTurn(dt);
        return;
      }
      this.replanT -= dt;
      // straight at it only when the way there is asphalt (or for the last few metres): round 2 went
      // direct within 38 m and drove over kerbs into yards, against buildings and along pavements
      const px = t.x + (t.vx || 0) * 0.45, pz = t.z + (t.vz || 0) * 0.45;
      const onRoad = drivable(car.x, car.z);
      if ((d < 8 && drivable(t.x, t.z)) || (d < 38 && onRoad && roadBetween(car.x, car.z, px, pz))) direct = { x: px, z: pz, d };
      // re-plan when the target has moved to another junction, the path runs out, or now and then -
      // never in the middle of a turn (from a junction a diagonal heading picks the street it is
      // leaving, and the new path starts with a U-turn over the kerb)
      // never with a U-turn coming up within 30 m: re-planning from the node the car faces pushed the
      // U-turn one junction further every time, and a chaser facing away drove off for good
      else if (!this.path || this.path.idx >= this.path.pts.length - 2 || ((this.forceReplan || nearestNode(t.x, t.z) !== this.chaseNode || (d < 38 && this.replanT <= 0)) && !this.turnNear && !this.uturnAhead(30))) {
        this.replanT = 2; this.forceReplan = false;
        this.chaseNode = nearestNode(t.x, t.z);
        // a target off the asphalt (a yard, a pavement): the path ends in the lane beside it
        let end = [t.x, t.z];
        if (!drivable(t.x, t.z)) { const a = laneAim(t.x, t.z, t.x - car.x, t.z - car.z, 0); end = a.d < 18 ? [a.x, a.z] : null; }
        this.setPath(pathTo(car, nearestNode(t.x, t.z), end, true));
      }
    }
    if (flee) {
      this.replanT -= dt;
      const t = this.target ? this.target() : { x: 0, z: 0 };
      // replan when the path runs out, or when the pursuer is ahead of us on it
      let ahead = false;
      if (this.path && this.replanT <= 0) {
        const q = this.path.pts[Math.min(this.path.pts.length - 1, this.path.idx + 4)];
        if (q) {
          const ax = q.x - car.x, az = q.z - car.z, bx = t.x - car.x, bz = t.z - car.z;
          const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
          ahead = (ax * bx + az * bz) / (la * lb) > 0.75 && lb < 45;
        }
      }
      if (!this.path || this.path.idx >= this.path.pts.length - 4 || ahead || this.forceReplan) {
        this.replanT = 3; this.forceReplan = false;
        let best = null, bd = -Infinity;
        // far from the pursuer, not straight back past it, a fair way off (relaxed if nothing fits:
        // a smitare must never be left without a destination - it would sit there for good)
        for (const minD of [60, 25, 0]) {
          for (let k = 0; k < 16; k++) {
            const n = (Math.random() * (N + 1) * (N + 1)) | 0;
            const dx = nodeX(n) - car.x, dz = nodeZ(n) - car.z;
            const away = Math.hypot(nodeX(n) - t.x, nodeZ(n) - t.z), mine = Math.hypot(dx, dz);
            const back = ((t.x - car.x) * dx + (t.z - car.z) * dz) / ((Math.hypot(t.x - car.x, t.z - car.z) || 1) * (mine || 1));
            const s = away + mine * 0.25 - Math.max(0, back) * 80;
            if (mine > minD && s > bd) { bd = s; best = n; }
          }
          if (best !== null) break;
        }
        if (best !== null) this.setPath(pathTo(car, best));
      }
    }

    // Where to aim and how fast to go.
    // the rubber band (race opponents, the story's chaser) scales the cruising speed; turns are never
    // taken faster than the grip plan (x 1.3 into a right turn sent the chaser through the corner)
    const rb = this.rubber ? this.rubber() : 1;
    let aimX, aimZ, targetSpeed = this.cruise * rb;
    if (this.hurryT > 0) { this.hurryT -= dt; if (this.mode === 'traffic') targetSpeed *= 1.35; }
    // how hard it corners and plans to brake (m/s²); the physics gives AI cars ~9 m/s² of grip, so
    // a smitare at 7 still has a margin and doesn't wreck itself on every corner
    const aLat = flee || this.aggressive ? 7.0 : 5.2;
    const aBrake = flee || this.aggressive ? 5.8 : 4.6;
    if (direct) {
      aimX = direct.x; aimZ = direct.z;
      targetSpeed = car.spec.maxSpeed * 0.95;
    } else if (this.path) {
      const p = this.path;
      p.ensure();
      while (p.idx < p.pts.length - 1) {
        const q = p.pts[p.idx];
        const dx = q.x - car.x, dz = q.z - car.z;
        if (dx * dx + dz * dz < 16 || (dx * fx + dz * fz < 0 && dx * dx + dz * dz < 100)) p.idx++;
        else break;
      }
      let look = 4.2 + Math.abs(fwd) * 0.38;
      // Near a turn the long lookahead cuts the corner over the kerb (into a car park, a wall): aim at
      // the turn's first point until it is close, then follow the arc with a short lookahead.
      for (let i = p.idx; i < p.pts.length && i < p.idx + 10; i++) {
        const a = p.pts[i];
        if (!a.turn) continue;
        const dTurn = Math.hypot(a.x - car.x, a.z - car.z);
        if (dTurn < look) look = Math.max(6, dTurn);
        break;
      }
      // Off the road (a rammed smitare shoved onto the pavement, a corner cut too fine): back to the
      // nearest lane point at walking pace instead of cutting across whatever is there. (Not near a
      // route's end: mission end points are often in yards and car parks.)
      const pe = p.pts[p.pts.length - 1];
      const endNear = this.mode === 'route' && p.built >= p.nodes.length - 1 && Math.hypot(pe.x - car.x, pe.z - car.z) < 35;
      const chaseEnd = chase && Math.hypot(pe.x - car.x, pe.z - car.z) < 12;
      this.offT = isRoad(car.x, car.z) || endNear || chaseEnd || (chase && drivable(car.x, car.z)) ? 0 : (this.offT || 0) + dt;
      // a smitare that starts in a bay or half on the pavement gets onto the street first
      const offRoad = this.offT > (flee ? 0.15 : 0.4);
      if (offRoad) look = Math.min(look, 6);
      let k = p.idx, q = p.pts[k];
      while (k < p.pts.length - 1 && Math.hypot(p.pts[k].x - car.x, p.pts[k].z - car.z) < look) q = p.pts[++k];
      if (!q) { c.throttle = 0; c.brake = fwd > 0.5 ? 1 : 0; this.watchdog(dt, game, 0, this.arrived || this.mode === 'route' ? 0 : this.cruise); return; }
      aimX = q.x; aimZ = q.z;
      // Off the asphalt: back onto the nearest street's right-hand lane, heading the way the path goes,
      // at walking pace, instead of cutting across lawns and car parks to a path point beyond them. Once
      // back on the road a fleeing or wandering car plans afresh from there.
      if (offRoad) {
        const a = laneAim(car.x, car.z, q.x - car.x, q.z - car.z, 6);
        if (a.d < RHW + 22) { aimX = a.x; aimZ = a.z; this.rejoining = true; }
      } else if (this.rejoining && isRoad(car.x, car.z)) {
        // back on the street: plan afresh from here (the old path's next point is usually behind or
        // beside the car by now - it overshot a turn into a car park - and chasing it leads straight
        // back in)
        this.rejoining = false;
        if (flee || chase) { this.forceReplan = true; this.replanT = 0; }
        else if (this.mode === 'traffic') this.setPath(new LanePath(startNodes(car), { wander: true }));
      }
      // in a turn, aim a little wide by the rear wheels' off-tracking (wb²/2r: ~1 m for the van, more
      // for the bus on a 5.75 m right turn), so a long vehicle's inner rear corner clears the kerb
      if (q.turn === 1 || q.turn === -1) {
        const off = clamp((car.spec.wb * car.spec.wb) / (2 * q.r) - 0.4, 0, 1.3), s = q.turn === 1 ? 1 : -1;
        aimX += Math.cos(car.yaw) * off * s; aimZ += -Math.sin(car.yaw) * off * s;
      }
      if (offRoad) targetSpeed = Math.min(targetSpeed, flee ? 5 : 6);
      this.turnNear = false;
      // brake ahead of turns: v <= sqrt(v_turn² + 2 a d) for every turn point within reach
      let d = Math.hypot(p.pts[p.idx].x - car.x, p.pts[p.idx].z - car.z), sig = 0;
      this.aReq = 0;
      for (let i = p.idx; i < p.pts.length && d < 70; i++) {
        const a = p.pts[i];
        if (i > p.idx) d += Math.hypot(a.x - p.pts[i - 1].x, a.z - p.pts[i - 1].z);
        if (a.turn) {
          const vt = Math.sqrt(aLat * a.r);
          targetSpeed = Math.min(targetSpeed, Math.sqrt(vt * vt + 2 * aBrake * Math.max(0, d - 2)) * Math.min(1, rb));
          // the deceleration this turn asks for from here (feed-forward for the brake below)
          if (fwd > vt) this.aReq = Math.max(this.aReq, (fwd * fwd - vt * vt) / (2 * Math.max(1.5, d - 2)));
          if (!sig && d < 32 && a.turn !== 2) sig = a.turn;
          if (d < 28) this.turnNear = true;
        }
      }
      if (this.mode === 'traffic' || this.mode === 'route') car.indicator = sig;
      const last = p.pts[p.pts.length - 1];
      // a route's end: within 25 m of it for 5 s in all, at any speed, counts as there (also while a
      // re-route is still being built: creeping to and fro, or wedged and re-routed round the block,
      // near an end point in a yard or a car park it can't quite get into)
      if (this.mode === 'route' && !p.wander && !this.arrived) {
        const ex = p.endPoint ? p.endPoint[0] : p.built >= p.nodes.length - 1 ? last.x : nodeX(p.nodes[p.nodes.length - 1]);
        const ez = p.endPoint ? p.endPoint[1] : p.built >= p.nodes.length - 1 ? last.z : nodeZ(p.nodes[p.nodes.length - 1]);
        this.endD = Math.hypot(ex - car.x, ez - car.z);
        if (this.endD < 25) this.nearEndAcc = (this.nearEndAcc || 0) + dt;
        if (this.nearEndAcc > 5) { this.arrived = true; this.onArrive?.(this); }
      }
      if (!this.path.wander && p.built >= p.nodes.length - 1) {
        const dl = Math.hypot(last.x - car.x, last.z - car.z);
        targetSpeed = Math.min(targetSpeed, Math.sqrt(2 * 4 * Math.max(0, dl - 5)) + (dl > 7 ? 1 : 0));
        // there (or as close as it gets: stuck twice near the end counts too)
        this.nearEndT = dl < 22 && speed < 1.5 ? (this.nearEndT || 0) + dt : 0;
        if ((dl < 10 || (dl < 25 && this.stuckN >= 2) || this.nearEndT > 2.5) && !this.arrived) { this.arrived = true; this.onArrive?.(this); }
      }
    } else {
      c.throttle = 0; c.brake = fwd > 0.5 ? 1 : 0;   // (the brake held at a standstill would reverse)
      this.watchdog(dt, game, 0, flee || chase ? this.cruise : 0);
      return;
    }
    if (this.arrived && this.mode === 'route') targetSpeed = 0;
    this.wanted = Math.max(this.wanted || 0, targetSpeed);   // for the watchdog: before traffic ahead
    // just backed out of something: creep back onto the path instead of lunging at it again
    if (this.creepT > 0) { this.creepT -= dt; targetSpeed = Math.min(targetSpeed, 4); }

    // Traffic ahead: keep a gap (about a second plus 4 m), honk at a player in the way.
    if (this.avoid && this.ignoreT <= 0) {
      const range = 6 + Math.abs(fwd) * 1.4 + (fwd * fwd) / (2 * aBrake);
      const obstacle = game.obstacleAhead(car, range);
      if (obstacle) {
        // a smitare overtakes - on a straight stretch, into the other lane, never onto the pavement
        const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
        const canSwerve = flee && obstacle.dist < 22 && !obstacle.isPlayer && !this.turnNear && isRoad(aimX + lx * LANE * 1.9, aimZ + lz * LANE * 1.9) && isRoad(car.x + lx * LANE * 1.2 + Math.sin(car.yaw) * 8, car.z + lz * LANE * 1.2 + Math.cos(car.yaw) * 8);
        if (canSwerve) { this.swerveT = 1.6; this.swerve = 1; }
        else {
          const gap = Math.max(0, obstacle.dist - 4);
          targetSpeed = Math.min(targetSpeed, Math.min(gap * 0.85, Math.sqrt(2 * 5 * gap)));
        }
        this.blockedT += dt;
        if (obstacle.isPlayer) this.byPlayerT = 1;
        if (obstacle.isPlayer && this.blockedT > 1.5 && this.honkT <= 0) { this.honkT = 3.5; game.onHonk(car); }
        if (this.blockedT > 5) { this.ignoreT = 1.6; this.blockedT = 0; }
      } else this.blockedT = Math.max(0, this.blockedT - dt * 2);
    } else this.ignoreT -= dt;
    this.honkT -= dt;
    // Overtake: aim a lane over to the left for a moment (abandoned at a turn or off the asphalt).
    if (this.swerveT > 0) {
      this.swerveT -= dt;
      const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw); // car's left
      if (this.turnNear || !isRoad(aimX + lx * LANE * 1.9, aimZ + lz * LANE * 1.9)) this.swerveT = 0;
      else { aimX += lx * LANE * 1.9; aimZ += lz * LANE * 1.9; }
    }

    // Pure pursuit: the steering angle that lands us on the aim point, as a fraction of the lock.
    const desired = yawTo(aimX - car.x, aimZ - car.z);
    const err = angleDiff(car.yaw, desired);
    const Ld = Math.max(3, Math.hypot(aimX - car.x, aimZ - car.z));
    const delta = Math.atan((2 * car.spec.wb * Math.sin(err)) / Ld);
    const maxSteer = car.spec.steer / (1 + Math.abs(fwd) / 15);
    let steer = clamp((-delta / maxSteer) * (fwd < -0.5 ? -1 : 1), -1, 1);
    if (this.wobble) steer += Math.sin(this.t * 1.7) * this.wobble;

    // getting back onto the street with the lane point behind (a nose-in bay, a driveway, a carport):
    // reverse towards it, steering the tail round, instead of nudging the wall ahead
    this.backCool = (this.backCool || 0) - dt;
    if (this.rejoining && this.reverseT <= 0 && !(this.backT > 0) && this.backCool <= 0 && Math.abs(err) > 1.9 && fwd < 2.5) this.backT = 2.6;
    if (this.backT > 0) {
      this.backT -= dt;
      if (Math.abs(err) < 1.1 || !this.rejoining) this.backT = 0;
      if (this.backT <= 0) this.backCool = 2;
      else {
        const errB = angleDiff(car.yaw + Math.PI, desired);
        c.throttle = 0; c.brake = fwd > 0.5 ? 1 : 0.75; c.handbrake = false;
        c.steer = clamp(Math.atan((2 * car.spec.wb * Math.sin(errB)) / Ld) / maxSteer, -1, 1);
        this.watchdog(dt, game, c.steer);
        return;
      }
    }
    this.watchdog(dt, game, steer);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      c.throttle = 0; c.brake = 1; c.steer = -Math.sign(steer || 1) * (this.revFlip || 1); c.handbrake = false;
      if (this.reverseT <= 0) { this.creepT = 2.5; if (flee) this.replanT = 0; }
      return;
    }
    if (c.throttle > 0.4 && Math.abs(fwd) < 1.0 && targetSpeed > 3) {
      this.stuckT += dt;
      if (this.stuckT > (flee ? 0.8 : 1.3)) {
        this.stuckT = 0; this.reverseT = flee ? 0.9 : 1.3;
        // count repeated getting stuck at about the same spot
        if (this.stuckAt && Math.hypot(car.x - this.stuckAt[0], car.z - this.stuckAt[1]) < 6) this.stuckN++;
        else { this.stuckN = 1; this.stuckAt = [car.x, car.z]; }
        this.reverseT += 0.4 * Math.min(4, this.stuckN - 1);
        // wedged for good: find a new way from here
        if (this.stuckN >= 3 && this.mode !== 'route' && this.mode !== 'traffic') this.unstick(game);
        else if (this.stuckN >= 3 && this.path && !this.arrived) {
          const p = this.path;
          if (this.mode === 'traffic') this.setPath(new LanePath(startNodes(car), { wander: true }));
          else if (this.mode === 'route' && (this.endD ?? Infinity) < 30) { this.arrived = true; this.onArrive?.(this); }
          else if (this.mode === 'route') this.setPath(pathTo(car, p.nodes[p.nodes.length - 1], p.endPoint));
          else if (flee) { this.path = null; this.replanT = 0; }   // a new destination, away from here
          this.stuckN = 1;
        }
      }
    } else this.stuckT = Math.max(0, this.stuckT - dt);

    c.steer = steer;
    c.handbrake = false;
    if (fwd < targetSpeed - 0.3) { c.throttle = clamp((targetSpeed - fwd) * 0.5, 0.2, 1); c.brake = 0; }
    else if (fwd > targetSpeed + 0.6) { c.throttle = 0; c.brake = clamp((fwd - targetSpeed) * 0.3, 0.08, 1); }
    else { c.throttle = 0.12; c.brake = 0; }
    // braking for a turn: hold the deceleration the turn asks for (the proportional brake alone lagged
    // the plan by ~2 m/s and long cars and chasers reached the corner too fast and ran onto the kerb)
    if (!direct && (this.aReq || 0) > 1.2 && fwd > 3) { c.throttle = 0; c.brake = Math.max(c.brake, clamp(this.aReq / (car.spec.brake * 0.92), 0.1, 1)); }
    // hold at a stop with no pedal (the brake held at a standstill means reverse; car.js shows the
    // brake lights for an AI car at rest)
    if (targetSpeed < 0.2 && Math.abs(fwd) < 0.6) { c.throttle = 0; c.brake = 0; }
    if (Math.abs(err) > 1.3 && fwd > 7) { c.throttle = 0; c.brake = 0.6; }
    if (direct && this.aggressive && Math.abs(err) < 0.3) { c.throttle = 1; c.brake = 0; }
  }

  // Watchdog: whatever the controls say, a car that wanted to go somewhere but has moved less than
  // 2 m in 4 s (6 s in traffic) is wedged - a corner post, a kerb, gridlock at a junction, nose to
  // nose with another car: back out with the opposite lock and find a new way. Not while it waits
  // behind the player (it honks instead). Runs on every branch of update(), also when the path ran
  // out or there is none (want: the speed it wants there; those branches also back out here).
  watchdog(dt, game, steer, want = null) {
    const car = this.car, c = car.ctrl;
    if (want !== null) this.wanted = Math.max(this.wanted || 0, want);
    this.byPlayerT = Math.max(0, (this.byPlayerT || 0) - dt * 0.25);
    this.wdT = (this.wdT || 0) + dt;
    if (!this.wd) this.wd = [car.x, car.z];
    // a smitare reacts faster (round 3: under 1.5 m in 2 s; it sat wedged for 15 s at a time)
    const flee = this.mode === 'flee';
    if (this.wdT >= (this.mode === 'traffic' ? 6 : flee ? 2 : 4)) {
      const moved = Math.hypot(car.x - this.wd[0], car.z - this.wd[1]);
      if (moved < (flee ? 1.5 : 2) && this.wanted > 2 && this.byPlayerT <= 0 && this.reverseT <= 0) this.unstick(game);
      this.wdT = 0; this.wd = [car.x, car.z]; this.wanted = 0;
    }
    if (want !== null && this.reverseT > 0) {
      this.reverseT -= dt;
      c.throttle = 0; c.brake = 1; c.steer = -Math.sign(steer || car.steerAngle || 1) * (this.revFlip || 1); c.handbrake = false;
      if (this.reverseT <= 0) this.creepT = 2.5;
    }
  }

  // Back out for a moment, then take a new way (see the watchdog). Repeated at the same spot (a car
  // that left the road and keeps finding the same tree): back out longer with the other lock, and
  // from the second time, if the player is far off (nobody sees it), put it back on its lane.
  unstick(game) {
    const car = this.car, now = this.t;
    // a route that ends in a yard or a car park: wedged within reach of the end counts as there
    // (re-routing from here would drive off and lose whoever follows)
    if (this.mode === 'route' && this.path && !this.arrived && (this.endD ?? Infinity) < 30) { this.arrived = true; this.reverseT = 0; this.onArrive?.(this); return; }
    const same = this.unAt && Math.hypot(car.x - this.unAt[0], car.z - this.unAt[1]) < 6 && now - this.unAt[2] < 20;
    this.unN = same ? this.unN + 1 : 1;
    if (!same) this.unAt = [car.x, car.z, now];
    this.revFlip = this.unN % 2 ? 1 : -1;
    this.reverseT = 1.6 + Math.min(1.2, (this.unN - 1) * 0.6);
    this.stuckT = 0;
    this.stuckN = 0;
    if (this.mode === 'flee') { this.path = null; this.replanT = 0; }
    else if (this.mode === 'traffic') this.setPath(new LanePath(startNodes(car), { wander: true }));
    else if (this.mode === 'route' && this.path && !this.arrived) { const p = this.path; this.setPath(pathTo(car, p.nodes[p.nodes.length - 1], p.endPoint)); }
    else if (this.mode === 'chase') this.replanT = 0;
    const f = game?.focus?.();
    if (this.unN >= 2 && f && Math.hypot(f.x - car.x, f.z - car.z) > (this.mode === 'flee' ? 30 : 45)) {
      const [a, b] = startNodes(car), dx = nodeX(b) - nodeX(a), dz = nodeZ(b) - nodeZ(a), l = Math.hypot(dx, dz) || 1;
      const t = clamp((car.x - nodeX(a)) * dx / l + (car.z - nodeZ(a)) * dz / l, 10, l - 10);
      car.place(nodeX(a) + (dx / l) * t - (dz / l) * LANE, nodeZ(a) + (dz / l) * t + (dx / l) * LANE, yawTo(dx, dz));
      this.reverseT = 0; this.unN = 0;
      if (this.mode === 'flee') this.path = null;
      else if (this.mode === 'traffic') this.setPath(new LanePath(startNodes(car), { wander: true }));
    }
  }

  updatePullover(dt) {
    const car = this.car, c = car.ctrl, po = this.po;
    if (this.mode === 'parked') {
      c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = false; c.park = true;
      car.hazard = true; car.indicator = 0;
      return;
    }
    po.run += Math.hypot(car.x - po.lastX, car.z - po.lastZ);
    po.lastX = car.x; po.lastZ = car.z;
    const fwd = car.forwardSpeed;
    const onRoad = isRoad(car.x, car.z);
    // keep checking the way ahead: a kerb island coming up -> stay in the lane
    po.checkT -= dt;
    if (po.checkT <= 0 && !po.inLane && onRoad) { po.checkT = 0.25; if (this.kerbBlocked(Math.max(4, Math.abs(fwd) * 0.8 + 3))) po.inLane = true; }
    // aim a little ahead along the road: out at the kerb, or (inLane) straight on where it is
    const k = po.kerb;
    let aimX, aimZ;
    if (k) {
      const ahead = 5 + Math.abs(fwd) * 0.7;
      const s = (car.x - k.x) * k.dx + (car.z - k.z) * k.dz + ahead;
      if (po.inLane) {
        // stay in the lane: on the car's own line along the street, kept inside the asphalt
        const lat = clamp((car.x - k.cx) * -k.dz + (car.z - k.cz) * k.dx, -(RHW - 1.1), RHW - 1.1);
        const along = (car.x - k.cx) * k.dx + (car.z - k.cz) * k.dz + ahead;
        aimX = k.cx + k.dx * along - k.dz * lat; aimZ = k.cz + k.dz * along + k.dx * lat;
      }
      else { aimX = k.x + k.dx * s; aimZ = k.z + k.dz * s; }
    } else {
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      aimX = car.x + fx * 8 - Math.cos(car.yaw) * 1.2; aimZ = car.z + fz * 8 + Math.sin(car.yaw) * 1.2;
    }
    const left = Math.max(0, 1 - po.run / po.dist);
    let target = po.v0 * Math.sqrt(left);
    if (!onRoad && k) target = Math.min(target, 4);   // back onto the asphalt at walking pace
    const err = angleDiff(car.yaw, yawTo(aimX - car.x, aimZ - car.z));
    const maxSteer = car.spec.steer / (1 + Math.abs(fwd) / 15);
    const Ld = Math.max(3, Math.hypot(aimX - car.x, aimZ - car.z));
    c.steer = clamp(-Math.atan((2 * car.spec.wb * Math.sin(err)) / Ld) / maxSteer, -1, 1) * (fwd > 0.5 ? 1 : 0.3);
    c.handbrake = false;
    if (fwd > target + 0.3) { c.throttle = 0; c.brake = clamp((fwd - target) * 0.35 + 0.1, 0.1, 0.9); }
    else if (fwd < target - 0.5 && target > 1) { c.throttle = 0.3; c.brake = 0; }
    else { c.throttle = 0; c.brake = 0.15; }
    // the hazards go on as soon as it is down to walking pace
    if (Math.abs(fwd) < 1 && po.run > 1) { car.hazard = true; car.indicator = 0; }
    else car.indicator = 1;
    // done when the run is over and it has stopped - or when it has stood still for a moment anyway
    // (blocked by a kerb, a parked car, the player: it parks where it is)
    po.age = (po.age || 0) + dt;
    po.stillT = Math.abs(fwd) < 0.5 && po.age > 1.5 ? (po.stillT || 0) + dt : 0;
    if (((left <= 0 || target < 0.6) && Math.abs(fwd) < 0.5) || po.stillT > 1.2 || po.age > 14) {
      this.mode = 'parked';
      car.hazard = true; car.indicator = 0;
      c.park = true;
      this.onStopped?.(this);
    }
  }
}

// The kerb-side line a pulled-over car should stop on: the right edge of the street it is on, or
// of the street beside it when it was shoved a few metres off the road (a rammed smitare on the
// pavement comes back onto the asphalt to stop) - { x, z } on the line, { dx, dz } its direction =
// the car's travel direction - or null further off.
function kerbLine(car) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const alongX = Math.abs(fx) > Math.abs(fz);
  const snap = (v) => { let best = rc(0), bd = Infinity; for (let i = 0; i <= N; i++) { const d = Math.abs(v - rc(i)); if (d < bd) { bd = d; best = rc(i); } } return { c: best, d: bd }; };
  const off = Math.min(RHW - car.spec.wid / 2 - 0.35, RHW - 1.1); // centre of a car stopped at the kerb, from the centre line
  if (alongX) {
    const s = snap(car.z);
    if (s.d > RHW + 6) return null;
    const dx = Math.sign(fx) || 1;
    // right of +x travel is +z
    return { x: car.x, z: s.c + dx * off, dx, dz: 0, cx: car.x, cz: s.c };
  }
  const s = snap(car.x);
  if (s.d > RHW + 6) return null;
  const dz = Math.sign(fz) || 1;
  // right of +z travel is -x
  return { x: s.c - dz * off, z: car.z, dx: 0, dz, cx: s.c, cz: car.z };
}
