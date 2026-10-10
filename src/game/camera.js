// Third-person camera, kept low and steady for a realistic look: free mouse-look on foot (a step
// behind Ove at shoulder height), a chase cam in cars that swings in behind the direction of
// travel (further back when towing a trailer). The boom is pulled in against anything solid between
// the pivot and the camera (houses, garages, sheds, fences taller than the camera), snapping in at
// once and easing back out, so the camera never ends up inside a wall.

import { THREE } from '../gfx.js';
import { queryBlocks, groundAt, topAt, contains, BOX, CIRCLE } from '../world/collision.js';
import { camBlocks } from '../world/town.js';
import { clamp, damp, dampAngle, angleDiff } from '../util.js';

const _bl = [];
const MARGIN = 0.32;    // keep the near plane this far from walls

// Is (x, z) within `m` of block b's footprint?
function near(b, x, z, m) {
  if (b.shape === BOX) return x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m;
  if (b.shape === CIRCLE) return (x - b.x) ** 2 + (z - b.z) ** 2 <= (b.r + m) ** 2;
  const dx = x - b.x, dz = z - b.z;
  const lz = dx * b.fx + dz * b.fz, lx = dx * -b.fz + dz * b.fx;
  return Math.abs(lx) <= b.hx + m && Math.abs(lz) <= b.hz + m;
}

// How far round a thin circle block the camera itself must stay. Trees: their crowns have no
// collision, so a trunk stands for a camera-only crown (~1 m round, more for big trees).
function thinReach(b) {
  if (b.kind === 'tree') return Math.max(b.r + MARGIN, Math.min(1.5, b.r * 3.6));
  return b.r + MARGIN;
}

// Fraction (0..1) of the segment pivot -> camera that is free, sampled every ~0.2 m.
// Tree trunks stop the boom like walls (a trunk in mid-screen with the crown hanging over the
// view was worse than a short boom), thin poles don't (the camera looks past them); and the camera
// never ends up inside a pole, or inside a tree's crown: if the end of the segment is within
// reach of one, the boom stops just short of it.
export function boomFree(px, py, pz, cx, cy, cz) {
  queryBlocks(Math.min(px, cx) - 1.6, Math.min(pz, cz) - 1.6, Math.max(px, cx) + 1.6, Math.max(pz, cz) + 1.6, _bl);
  if (!_bl.length) return 1;
  const len = Math.hypot(cx - px, cy - py, cz - pz);
  const steps = Math.max(4, Math.ceil(len / 0.2));
  let free = 1;
  for (const b of _bl) {
    if (b.kind === 'prop') continue;
    if (b.shape === CIRCLE && b.r < 0.45 && b.kind !== 'tree') continue;   // poles: below
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (t >= free) break;
      const x = px + (cx - px) * t, y = py + (cy - py) * t, z = pz + (cz - pz) * t;
      if (topAt(b, x, z) < y - 0.15) continue;
      if (near(b, x, z, MARGIN)) { free = Math.max(0, (s - 1) / steps); break; }
    }
  }
  for (const b of _bl) {
    if (b.kind === 'prop' || b.shape !== CIRCLE || b.r >= 0.45) continue;
    const reach = thinReach(b), ex = px + (cx - px) * free, ez = pz + (cz - pz) * free, ey = py + (cy - py) * free;
    if (b.top < ey - 0.15 || (ex - b.x) ** 2 + (ez - b.z) ** 2 > reach * reach) continue;
    // Back along the segment to where it enters the reach.
    let t = free;
    for (let s = Math.floor(free * steps); s >= 0; s--) {
      t = s / steps;
      const x = px + (cx - px) * t, z = pz + (cz - pz) * t;
      if ((x - b.x) ** 2 + (z - b.z) ** 2 > reach * reach) break;
    }
    free = Math.min(free, t);
  }
  // Overhangs with no collision (garage and shed roofs, porch canopies, bus shelters: the world's
  // camBlocks): the boom stops just short of them.
  if (camBlocks.length) {
    const x0 = Math.min(px, cx) - MARGIN, x1 = Math.max(px, cx) + MARGIN, z0 = Math.min(pz, cz) - MARGIN, z1 = Math.max(pz, cz) + MARGIN;
    const y0 = Math.min(py, cy), y1 = Math.max(py, cy);
    for (const b of camBlocks) {
      if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1 || b.top < y0 - 0.2 || b.bottom > y1 + 0.3) continue;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        if (t >= free) break;
        const x = px + (cx - px) * t, y = py + (cy - py) * t, z = pz + (cz - pz) * t;
        if (y > b.bottom - 0.3 && y < b.top + 0.2 && x > b.x0 - MARGIN && x < b.x1 + MARGIN && z > b.z0 - MARGIN && z < b.z1 + MARGIN) { free = Math.max(0, (s - 1) / steps); break; }
      }
    }
  }
  return free;
}

const _want = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Shots for dialogue and cutscenes (CamRig.frame / showcase / pick).
//
// A shot is judged by what the lens would see. From a candidate spot, sight lines to each
// subject's shins, waist, chest and head are tested against everything solid: walls and sheds,
// props taller than 0.5 m, tree trunks and crowns (the world colliders' crownR / crownBottom /
// crownTop: dense spruce and thuja crowns block, see-through birches only near the stem), the
// world's camBlocks (railings, lamp posts, overhangs), parked cars (their boxes up to the roof) and
// people who aren't in the shot. The first 1.5 m in front of the lens must be empty (no pole, car
// roof, wall or crown filling a third of the frame), the camera itself must stand somewhere free,
// and both speakers' heads must be in the picture between the letterbox bars. A candidate is never
// pulled in closer than the distance at which the two of them fit.

const CINE_FOV = 42;
const HALF_H = Math.atan(Math.tan(THREE.MathUtils.degToRad(CINE_FOV / 2)) * 16 / 9);   // half the horizontal fov at 16:9
const HALF_V = 0.2;              // half the height (rad) that shows between the letterbox bars, with a margin
const DENSE = new Set(['spruce', 'spruceS', 'thuja']);
const PROP_MIN = 0.65;           // props lower than this (kerb stones, low boxes) don't block a view

// Everything near the shot, gathered once per plan.
function gather(x0, z0, x1, z1, ctx, subjects) {
  const bl = queryBlocks(x0 - 3, z0 - 3, x1 + 3, z1 + 3, []);
  // (a block a point subject stands in or on is the subject itself: the grave stone, a car's spot)
  const skip = new Set();
  for (const s of subjects) for (const b of bl) if (b.kind !== 'tree' && contains(b, s.x, s.z) && (!s.person || topAt(b, s.x, s.z) < s.y + 0.3)) skip.add(b);
  const cb = camBlocks.filter((c) => c.x1 > x0 - 3 && c.x0 < x1 + 3 && c.z1 > z0 - 3 && c.z0 < z1 + 3);
  const subjCars = new Set(subjects.map((s) => s.car).filter(Boolean));
  const near = (o, r) => o.x > x0 - r && o.x < x1 + r && o.z > z0 - r && o.z < z1 + r;
  const cars = (ctx.cars || []).filter((c) => !subjCars.has(c) && !c.dead && c.root?.visible !== false && near(c, 6) && !subjects.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 0.6));
  const subjPeople = new Set(subjects.map((s) => s.ref).filter(Boolean));
  const people = (ctx.people || []).filter((p) => !subjPeople.has(p) && p.state !== 'hidden' && p.state !== 'seated' && !p.car && p.root?.visible !== false && near(p, 2));
  // (the people in the shot hide each other too: Rune's wheelchair in front of Anita)
  const subj = subjects.filter((s) => s.person && s.ref && s.ref.x !== undefined).map((s) => s.ref);
  return { bl, skip, cb, cars, people, subj };
}

// What (if anything) is solid at (x, y, z), `m` metres of margin. `lens`: the camera itself (any
// crown counts at full size, and a person must not be within arm's reach).
const _rel = { bl: [], cb: [], cars: [], people: [] };
function solidAt(R, x, y, z, m, lens = false) {
  for (const b of R.bl) {
    if (b.kind === 'tree') {
      const d2 = (x - b.x) ** 2 + (z - b.z) ** 2;
      if (d2 <= (b.r + m) ** 2 && y < b.top) return 'trunk';
      if (b.crownR && y >= b.crownBottom - (lens ? 0.3 : 0) && y <= b.crownTop) {
        const k = lens ? 1 : DENSE.has(b.species) ? 0.8 : 0.4;
        if (d2 <= (b.crownR * k + m) ** 2) return 'crown';
      }
      continue;
    }
    if (b.kind === 'prop' && b.top < PROP_MIN) continue;
    if (y >= topAt(b, x, z)) continue;
    if (near(b, x, z, m)) return b.kind;
  }
  for (const c of R.cb) if (x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m && y > c.bottom - m && y < c.top + m) return 'over';
  for (const c of R.cars) {
    if (y > c.y + c.height + m) continue;
    const dx = x - c.x, dz = z - c.z, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (Math.abs(dx * fx + dz * fz) < c.spec.len / 2 + m && Math.abs(dx * -fz + dz * fx) < c.spec.wid / 2 + m) return 'car';
    const t = c.trailer;
    if (t) {
      const tx = x - t.x, tz = z - t.z, tfx = Math.sin(t.yaw), tfz = Math.cos(t.yaw);
      if (y < (t.y ?? c.y) + 1.1 + m && Math.abs(tx * tfx + tz * tfz) < t.len / 2 + m && Math.abs(tx * -tfz + tz * tfx) < t.wid / 2 + m) return 'car';
    }
  }
  for (const p of R.people) {
    if (y < p.y - m || y > p.y + (p.height || 1.7) + 0.1 + m) continue;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < (lens ? 0.75 : (p.wheelchair ? 0.42 : 0.27) + m) ** 2) return 'person';
  }
  return null;
}
// The plan's things near the segment a -> b (bounding boxes), into _rel.
function relevant(P, ax, az, bx, bz, ignore = null) {
  const x0 = Math.min(ax, bx) - 0.4, x1 = Math.max(ax, bx) + 0.4, z0 = Math.min(az, bz) - 0.4, z1 = Math.max(az, bz) + 0.4;
  _rel.bl.length = 0; _rel.cb.length = 0; _rel.cars.length = 0; _rel.people.length = 0;
  for (const b of P.bl) {
    if (P.skip.has(b)) continue;
    const e = b.crownR || 0;
    if (b.bx1 + e < x0 || b.bx0 - e > x1 || b.bz1 + e < z0 || b.bz0 - e > z1) continue;
    _rel.bl.push(b);
  }
  for (const c of P.cb) if (!(c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1)) _rel.cb.push(c);
  for (const c of P.cars) { const r = (c.radius || 3) + (c.trailer ? c.trailer.len + 2 : 0); if (!(c.x + r < x0 || c.x - r > x1 || c.z + r < z0 || c.z - r > z1)) _rel.cars.push(c); }
  for (const p of P.people) if (!(p.x + 0.5 < x0 || p.x - 0.5 > x1 || p.z + 0.5 < z0 || p.z - 0.5 > z1)) _rel.people.push(p);
  if (ignore) for (const p of P.subj) if (p !== ignore && !(p.x + 0.5 < x0 || p.x - 0.5 > x1 || p.z + 0.5 < z0 || p.z - 0.5 > z1)) _rel.people.push(p);
  return _rel;
}
// Is the sight line a -> b clear (it stops `short` m before b: the subject's own body)?
function sight(P, ax, ay, az, bx, by, bz, short = 0.3, m = 0.04, ignore = null) {
  const R = relevant(P, ax, az, bx, bz, ignore);
  if (!R.bl.length && !R.cb.length && !R.cars.length && !R.people.length) return true;
  const len = Math.hypot(bx - ax, by - ay, bz - az), end = Math.max(0, len - short);
  for (let s = 0.12; s <= end; s += 0.1) {
    const t = s / len;
    if (solidAt(R, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, m)) return false;
  }
  return true;
}

// A subject: { x, y, z, height, person (a Character), car, ref, pts: [[dx, dy, dz, weight, inFrame]] }.
function subjectOf(o) {
  if (o.isSubject) return o;
  // (o may be a Character, a Car, a point { x, y, z, height }, or a stand-in { ..., ref, person }:
  // Ove on one knee is a person 1.2 m tall)
  const s = { isSubject: true, x: o.x, y: o.y ?? 0, z: o.z, height: o.height || 1.6, ref: o.ref || o, person: !!(o.model || o.def || o.person), car: o.spec ? o : o.car || null };
  if (o.spec) {
    // A car: its four corners at the belt line, the roof, the middle.
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), l = o.spec.len * 0.38, w = o.spec.wid * 0.36, h = o.height || 1.4;
    s.height = h;
    s.pts = [[fx * l - fz * w, h * 0.55, fz * l + fx * w, 1, true], [fx * l + fz * w, h * 0.55, fz * l - fx * w, 1, true], [-fx * l - fz * w, h * 0.55, -fz * l + fx * w, 1, true], [-fx * l + fz * w, h * 0.55, -fz * l - fx * w, 1, true], [0, h * 0.95, 0, 1.5, true]];
  } else if (s.person || s.height > 1.2) {
    const h = s.height;
    s.pts = [[0, h * 0.25, 0, 0.6, false], [0, h * 0.55, 0, 1, false], [0, h * 0.78, 0, 1, true], [0, h * 0.93, 0, 2.2, true]];
  } else {
    s.pts = [[0, s.height * 0.4, 0, 1, true], [0, s.height * 0.9, 0, 1.5, true]];
  }
  return s;
}

// How good is the camera at c looking at l, for these subjects (the first `need` must be seen)?
// -> { score, vis: [0..1 per subject], heads, near (blocked rays in the first 1.5 m), poles }
function judge(P, c, l, subjects, need = 2, fov = CINE_FOV) {
  const out = { score: -9, vis: [], heads: 0, near: 0, poles: 0, ok: false };
  // (a narrower lens: a narrower picture)
  const tk = Math.tan(THREE.MathUtils.degToRad(fov / 2)) / Math.tan(THREE.MathUtils.degToRad(CINE_FOV / 2));
  const hh = fov === CINE_FOV ? HALF_H : Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 16 / 9), hv = HALF_V * Math.min(1, tk);
  {
    const R = relevant(P, c.x - 0.8, c.z - 0.8, c.x + 0.8, c.z + 0.8);
    if (solidAt(R, c.x, c.y, c.z, 0.35, true)) return out;
    // (never under the ground or a floor: e.g. on the low side of a ramp)
    if (groundAt(c.x, c.z, c.y, 0) > c.y - 0.55) return out;
  }
  const fx0 = l.x - c.x, fy0 = l.y - c.y, fz0 = l.z - c.z, fl = Math.hypot(fx0, fy0, fz0) || 1;
  const fx = fx0 / fl, fy = fy0 / fl, fz = fz0 / fl;
  const yaw0 = Math.atan2(fx, fz), pitch0 = Math.asin(clamp(fy, -1, 1));
  // Each subject: how much of them shows, and whether the head (and chest) are in the picture.
  let total = 0, mainMin = 1, extra = 0;
  subjects.forEach((s, i) => {
    let w = 0, v = 0, head = false;
    for (const [dx, dy, dz, wt, frame] of s.pts) {
      const px = s.x + dx, py = s.y + dy, pz = s.z + dz;
      let inFrame = true;
      if (frame) {
        const hy = Math.atan2(px - c.x, pz - c.z), hd = Math.hypot(px - c.x, pz - c.z);
        const vp = Math.atan2(py - c.y, hd);
        inFrame = Math.abs(angleDiff(yaw0, hy)) < hh * 0.86 && Math.abs(vp - pitch0) < hv;
      }
      const clear = inFrame && sight(P, c.x, c.y, c.z, px, py, pz, s.person ? 0.3 : 0.5, 0.04, s.ref || true);
      w += wt; if (clear) v += wt;
      if (wt >= 1.5 && clear) head = true;
    }
    const vis = w ? v / w : 0;
    out.vis.push(vis);
    if (i < need) { mainMin = Math.min(mainMin, vis); if (head) out.heads++; total += vis; } else extra += vis;
  });
  const n = Math.min(need, subjects.length);
  if (out.heads < n) { out.score = mainMin * 1.2 + (total / n) * 0.4 - 2; return out; }
  // The first 1.5 m in front of the lens, across the frame, must be empty; the next 1.5 m should be
  // (a car's bonnet, a sign or a headstone there fills a corner of the picture: out.fore).
  out.fore = 0;
  for (const a of [-0.48, -0.24, 0, 0.24, 0.48]) for (const e of [-0.17, 0, 0.17]) {
    const yw = yaw0 + a, pt = pitch0 + e, dx = Math.sin(yw) * Math.cos(pt), dy = Math.sin(pt), dz = Math.cos(yw) * Math.cos(pt);
    if (!sight(P, c.x, c.y, c.z, c.x + dx * 1.5, c.y + dy * 1.5, c.z + dz * 1.5, 0, 0.03)) out.near++;
    else if (!sight(P, c.x + dx * 1.5, c.y + dy * 1.5, c.z + dz * 1.5, c.x + dx * 3, c.y + dy * 3, c.z + dz * 3, 0, 0.03)) out.fore++;
  }
  // Thin poles (lamp posts, sign posts; trunks too) standing between the lens and the subjects in
  // the middle of the picture.
  const dS = Math.hypot(subjects[0].x - c.x, subjects[0].z - c.z);
  for (const b of P.bl) {
    if (b.shape !== CIRCLE || (b.r >= 0.45 && b.kind !== 'tree') || b.top < c.y - 0.8) continue;
    const d = Math.hypot(b.x - c.x, b.z - c.z);
    if (d > dS - 0.4 || d < 0.2) continue;
    if (Math.abs(angleDiff(yaw0, Math.atan2(b.x - c.x, b.z - c.z))) < hh * 0.6) out.poles += 1.4 - d / Math.max(dS, 1);
  }
  for (const k of P.cb) {
    if (k.x1 - k.x0 > 0.5 || k.z1 - k.z0 > 0.5 || k.top - k.bottom < 1.2 || k.top < c.y - 0.8) continue;
    const x = (k.x0 + k.x1) / 2, z = (k.z0 + k.z1) / 2, d = Math.hypot(x - c.x, z - c.z);
    if (d > dS - 0.4 || d < 0.2) continue;
    if (Math.abs(angleDiff(yaw0, Math.atan2(x - c.x, z - c.z))) < hh * 0.6) out.poles += 1.4 - d / Math.max(dS, 1);
  }
  out.ok = out.heads >= n && out.near === 0;
  out.score = mainMin * 1.2 + (total / n) * 0.4 + extra * 0.15 + (out.heads >= n ? 0 : -2) - out.near * 0.35 - out.fore * 0.07 - out.poles * 0.3;
  return out;
}

export class CamRig {
  constructor(cam) {
    this.cam = cam;
    this.yaw = Math.PI;
    this.pitch = 0.2;
    this.manualT = 0;
    this.pos = new THREE.Vector3(0, 10, 10);
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fov = 55;
    this.cine = null; // { pos, look } for dialogue framing
    this.snapNext = true;
    this.boom = 5;    // current boom length (pulled in instantly, eased back out)
  }

  update(dt, focus, look, cars = []) {
    const cam = this.cam;
    if (this.cine) {
      // A new shot is a cut (the camera never flies through a wall to get there); a small change
      // of framing within a scene eases over.
      if (this.cine.cut) { this.cine.cut = false; this.pos.copy(this.cine.pos); this.look.copy(this.cine.look); this.fov = this.cine.fov || CINE_FOV; }
      this.pos.lerp(this.cine.pos, 1 - Math.exp(-4 * dt));
      this.look.lerp(this.cine.look, 1 - Math.exp(-5 * dt));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      this.fov = damp(this.fov, this.cine.fov || CINE_FOV, 4, dt);
      cam.fov = this.fov; cam.updateProjectionMatrix();
      return;
    }
    if (look && Number.isFinite(look.x) && Number.isFinite(look.y) && (Math.abs(look.x) > 0.1 || Math.abs(look.y) > 0.1)) {
      // Clamp: some browsers deliver a huge jump on the first pointer-locked move.
      this.yaw -= clamp(look.x, -250, 250) * 0.0024;
      this.pitch = clamp(this.pitch + clamp(look.y, -250, 250) * 0.002, -0.3, 1.1);
      this.manualT = 1.8;
    }
    // Never a NaN camera (one bad gamepad axis used to turn the screen black for good).
    if (!Number.isFinite(this.yaw)) this.yaw = Number.isFinite(focus.yaw) ? focus.yaw : 0;
    if (!Number.isFinite(this.pitch)) this.pitch = 0.16;
    if (!Number.isFinite(this.boom)) this.boom = 4;
    this.manualT -= dt;
    let pivotH, dist, lead = 0;
    if (focus.car) {
      const car = focus.car, sp = car.speed;
      const vyaw = sp > 3 ? Math.atan2(car.vx, car.vz) : car.yaw;
      const reversing = car.forwardSpeed < -2;
      const want = reversing ? car.yaw : vyaw;
      if (this.manualT <= 0) {
        this.yaw = dampAngle(this.yaw, want, sp > 1 ? 3.0 : 1.1, dt);
        this.pitch = damp(this.pitch, car.spec.tall ? 0.2 : 0.15, 2, dt);
      }
      if (focus.lookBack) this.yaw = want + Math.PI;
      pivotH = car.height + 0.42;
      dist = 4.4 + car.spec.len * 0.8 + Math.min(3, sp * 0.09);
      if (car.trailer) dist += car.trailer.len + (car.trailer.drawbar || 1);
      lead = Math.min(2.5, sp * 0.1);
      this.fov = damp(this.fov, 54 + Math.min(10, sp * 0.3), 3, dt);
    } else {
      pivotH = Math.min(1.6, (focus.height || 1.75) * 0.9);
      dist = 4.6;
      this.fov = damp(this.fov, 52, 3, dt);
      // Ease in behind Ove when he walks (forward-ish: never when he walks back towards the
      // camera, which would chase him round in circles) and the mouse has been left alone ~2.5 s.
      if (this.manualT <= -0.7 && focus.speed > 1 && focus.autoTurn && Math.abs(angleDiff(this.yaw, focus.yaw)) < 1.3) this.yaw = dampAngle(this.yaw, focus.yaw, 0.6, dt);
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = focus.x, py = focus.y + pivotH, pz = focus.z;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Desired camera at full boom, then pull in to the free part of the segment.
    const tx = px - fx * cp * dist, tz = pz - fz * cp * dist;
    const ty = Math.max(groundAt(tx, tz, py + sp * dist, 2) + 0.45, py + sp * dist);
    const free = boomFree(px, py, pz, tx, ty, tz);
    const wantBoom = Math.max(0.9, free * dist);
    // On foot, backed into a wall with the boom short (a garage row, a shed, a porch): swing round
    // towards the open side unless the player is steering the camera.
    if (focus.car || this.manualT > 0) this.swingTo = null;
    else if (this.manualT <= -0.5 && free * dist < 1.3 && this.swingTo == null) {
      let best = null, bf = free;
      for (const da of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const yw = this.yaw + da, x = px - Math.sin(yw) * cp * dist, z = pz - Math.cos(yw) * cp * dist;
        const f = boomFree(px, py, pz, x, ty, z);
        if (f > bf + 0.25 && (best == null || f > bf + 0.1)) { bf = f; best = yw; }
      }
      this.swingTo = best;
    }
    if (this.swingTo != null) {
      this.yaw = dampAngle(this.yaw, this.swingTo, 2.2, dt);
      if (Math.abs(angleDiff(this.yaw, this.swingTo)) < 0.05) this.swingTo = null;
    }
    if (this.snapNext || wantBoom < this.boom) this.boom = wantBoom;
    else this.boom = damp(this.boom, wantBoom, 1.6, dt);
    const k = this.boom / dist;
    const want = _want.set(px + (tx - px) * k, py + (ty - py) * k, pz + (tz - pz) * k);
    // Pulled in close (a wall right behind): stay low, just over Ove's shoulder, so the camera
    // never rises into a porch canopy or a shed's snowy roof (those have no collision).
    if (k < 0.6) {
      want.y = Math.min(want.y, py + 0.12 + k * 0.4);
      // ... and step to the side, so we look past him rather than at the back of his head: in a
      // car over the right, on foot over the shoulder on the open side (more room at shoulder
      // height; it changes only for a clearly better side).
      if (focus.car) this.openSide = 1;
      else {
        const fR = boomFree(px, py, pz, px - fz * 1.6, py, pz + fx * 1.6), fL = boomFree(px, py, pz, px + fz * 1.6, py, pz - fx * 1.6);
        if (fL > fR + 0.15) this.openSide = -1; else if (fR > fL + 0.15 || !this.openSide) this.openSide = 1;
      }
      const side = (0.6 - k) * (focus.car ? 0.9 : 1.25) * this.openSide;
      for (const f of [1, 0.6, 0.3]) {
        const sx = want.x - fz * side * f, sz = want.z + fx * side * f;
        if (boomFree(px, py, pz, sx, want.y, sz) > 0.98) { want.x = sx; want.z = sz; break; }
      }
    }
    // ... and look ahead, past the subject: in a tight spot (a garage, a wall behind Ove) the view
    // goes over the car's roof or Ove's shoulder to what is in front, not down at the roof / his back.
    const ahead = clamp((0.72 - k) / 0.5, 0, 1);
    if (this.snapNext) { this.pos.copy(want); this.snapNext = false; }
    else {
      const kk = focus.car ? 9 : 12;
      this.pos.x = damp(this.pos.x, want.x, kk, dt);
      this.pos.y = damp(this.pos.y, want.y, kk * 0.7, dt);
      this.pos.z = damp(this.pos.z, want.z, kk, dt);
      // Never lag so far behind that a wall slips between us.
      if (free < 1 && boomFree(px, py, pz, this.pos.x, this.pos.y, this.pos.z) < 0.999) this.pos.copy(want);
    }
    const la = lead + ahead * (focus.car ? 9 : 4.5);
    // On foot with the boom under 1.4 m (a wall or a door right behind or beside him) the aim moves
    // 0.45 m to the open side: Ove off-centre, the open space in the picture, not the wall.
    const tight = focus.car ? 0 : clamp((1.4 - this.boom) / 0.4, 0, 1);
    this.lookSide = damp(this.lookSide || 0, tight * 0.45 * (this.openSide || 1), 4, dt);
    this.look.set(px + fx * la - fz * this.lookSide, py - (focus.car ? 0.25 : 0.12) + ahead * 0.12, pz + fz * la + fx * this.lookSide);
    // Never sit inside another car: ride up over its roof instead.
    for (const c of cars) {
      if (c === focus.car || Math.abs(c.x - this.pos.x) > c.radius + 1 || Math.abs(c.z - this.pos.z) > c.radius + 1) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, cfx = Math.sin(c.yaw), cfz = Math.cos(c.yaw);
      if (Math.abs(dx * cfx + dz * cfz) < c.spec.len / 2 + 0.5 && Math.abs(dx * -cfz + dz * cfx) < c.spec.wid / 2 + 0.5) {
        this.pos.y = Math.max(this.pos.y, c.y + c.height + 0.6);
      }
    }
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.look);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  // Behind someone on foot, after a scene: their yaw, or the nearest yaw either side of it with the
  // boom free (Ove backed up to his garage door at the end of day 1: the camera would start in the
  // door and swing off), the pivot and pitch as update() uses them.
  behind(p) {
    const h = Math.min(1.6, (p.height || 1.75) * 0.9), py = p.y + h, d = 4.6, pt = 0.2;
    let best = p.yaw, bf = -1;
    for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) {
      const yw = p.yaw + da, f = boomFree(p.x, py, p.z, p.x - Math.sin(yw) * Math.cos(pt) * d, py + Math.sin(pt) * d, p.z - Math.cos(yw) * Math.cos(pt) * d);
      if (f > 0.7) { best = yw; break; }
      if (f > bf + 0.05) { bf = f; best = yw; }
    }
    this.yaw = best; this.pitch = pt; this.snapNext = true; this.swingTo = null;
  }

  // The things a shot has to see past: { cars, people } (main.js sets this.world = () => {...}).
  shotCtx() { return this.world ? this.world() : { cars: [], people: [] }; }

  // Frame two people talking (or a person and a thing: { x, y, z, height }). Candidates on both
  // sides of the line between them, square on and turned up to ~70° either way, at the comfortable
  // distance, a closer one and the closest at which both still fit (never closer), at eye height
  // and a little above (over a low fence or a car roof); then over-the-shoulder shots behind each of
  // them, and higher ones. Each is judged by what it would really show (see judge above); the best
  // wins, with a small bonus for the side the camera is already on. opts: { extras: [more people
  // who should be in the picture if possible], side: +1 | -1 (preferred side) }.
  frame(a, b, opts = {}) {
    const t0 = performance.now();
    const sa = subjectOf(a), sb = subjectOf(b);
    const extras = (opts.extras || []).filter((e) => e && e !== a && e !== b && e.state !== 'hidden').map(subjectOf);
    const subjects = [sa, sb, ...extras];
    const mx = (sa.x + sb.x) / 2, mz = (sa.z + sb.z) / 2;
    const dx = sb.x - sa.x, dz = sb.z - sa.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const d = Math.max(3.6, l * 1.5 + 2.2);
    const need = Math.max(2.4, l * 1.1 + 1.2);   // closer than this and the two don't fit
    const here = opts.side || ((this.pos.x - mx) * nx + (this.pos.z - mz) * nz >= 0 ? 1 : -1);
    const top = Math.max(sa.height, sb.height);
    const y0 = Math.max(sa.y, sb.y) + top * 0.82;
    const P = gather(Math.min(sa.x, sb.x) - d - 1, Math.min(sa.z, sb.z) - d - 1, Math.max(sa.x, sb.x) + d + 1, Math.max(sa.z, sb.z) + d + 1, this.shotCtx(), subjects);
    const look = { x: mx, y: y0 - 0.05, z: mz };
    let best = null;
    const consider = (c, lk, bonus, kind) => {
      // (the two must not stand in line, one hiding the other)
      const a1 = Math.atan2(sa.x - c.x, sa.z - c.z), a2 = Math.atan2(sb.x - c.x, sb.z - c.z);
      if (kind === 'two' && Math.abs(angleDiff(a1, a2)) < 0.16) return;
      const j = judge(P, c, lk, subjects, 2);
      const score = j.score + bonus;
      if (!best || score > best.score) best = { c, look: lk, score, j, kind };
    };
    for (const s of [here, -here]) {
      for (const ang of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) {
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const ux = (nx * cs - nz * sn) * s, uz = (nx * sn + nz * cs) * s;
        for (const [r, dq] of [[d, 0.12], [(d + need) / 2, 0.07], [need, 0]]) {
          for (const [up, uq] of [[0.25, 0.04], [0.8, 0]]) {
            consider({ x: mx + ux * r, y: y0 + up, z: mz + uz * r }, up > 0.5 ? { ...look, y: look.y - 0.1 } : look, dq + uq - Math.abs(ang) * 0.1 + (s === here ? 0.05 : 0), 'two');
          }
        }
      }
      if (best && best.j.ok && best.score > 1.6) break;
    }
    // Over the shoulder: behind one of them (a little to the side), looking at the other; then
    // raised ones (the fallback when a two-shot can't be had: a wall right behind the pair).
    if (!best || !best.j.ok || best.score < 1.2) {
      for (const [X, O] of [[sb, sa], [sa, sb]]) {
        const ux = (X.x - O.x) / l, uz = (X.z - O.z) / l;
        for (const back of [2.3, 1.9, 2.8]) for (const side of [0.65, -0.65]) for (const up of [0.3, 0.6, 1.0]) {
          const c = { x: X.x + ux * back - uz * side, y: X.y + X.height + up, z: X.z + uz * back + ux * side };
          const lk = { x: O.x * 0.75 + mx * 0.25, y: O.y + O.height * 0.78, z: O.z * 0.75 + mz * 0.25 };
          consider(c, lk, -0.12 - (up - 0.3) * 0.08, 'ots');
        }
      }
    }
    this.setShot(best, subjects);
    this.cineInfo.ms = Math.round(performance.now() - t0);
  }

  // A closer shot of whoever speaks (a): from past the listener's shoulder (b), 15-22 degrees off
  // the line between them, 1.6-2.4 m behind the listener, a 36-degree lens - the speaker big in the
  // middle, the listener's back and shoulder at the side of the picture, ~2 m from the lens (never
  // in the first 1.5 m). Judged like any other shot, both heads in the picture; used only when it
  // is clean (ok, a good score): returns false otherwise, and the caller keeps the two-shot.
  single(a, b, opts = {}) {
    const t0 = performance.now();
    const sa = subjectOf(a), sb = subjectOf(b);
    const dx = sb.x - sa.x, dz = sb.z - sa.z, l = Math.hypot(dx, dz);
    if (l < 1.2 || l > 4.2) return false;
    const ux = dx / l, uz = dz / l, FOV = 36;
    const subjects = [sa, sb];
    const P = gather(Math.min(sa.x, sb.x) - l - 3, Math.min(sa.z, sb.z) - l - 3, Math.max(sa.x, sb.x) + l + 3, Math.max(sa.z, sb.z) + l + 3, this.shotCtx(), subjects);
    const look = { x: sa.x + ux * 0.25, y: sa.y + sa.height * 0.8, z: sa.z + uz * 0.25 };
    // (the side of the line the camera is on now: shot / reverse shot stay on one side of it)
    const here = opts.side || (((this.pos.x - sa.x) * -uz + (this.pos.z - sa.z) * ux) >= 0 ? 1 : -1);
    let best = null;
    for (const s of [here, -here]) for (const th of [0.3, 0.38, 0.24]) for (const back of [1.8, 2.2, 1.6]) for (const up of [0, 0.2]) {
      const r = l + back, cs = Math.cos(th * s), sn = Math.sin(th * s);
      const vx = ux * cs - uz * sn, vz = ux * sn + uz * cs;
      const c = { x: sa.x + vx * r, y: sa.y + sa.height * 0.86 + up, z: sa.z + vz * r };
      // (the listener's shoulder no nearer the lens than ~1.6 m)
      if (Math.hypot(c.x - sb.x, c.z - sb.z) < 1.9) continue;
      const j = judge(P, c, look, subjects, 2, FOV);
      const score = j.score - Math.abs(th - 0.3) * 0.4 - Math.abs(back - 1.8) * 0.1 - up * 0.2 + (s === here ? 0.05 : 0);
      if (!best || score > best.score) best = { c, look, score, j, kind: 'single', fov: FOV };
    }
    if (!best || !best.j.ok || best.score < (opts.min ?? 1.45)) return false;
    this.setShot(best, subjects);
    this.cineInfo.ms = Math.round(performance.now() - t0);
    return true;
  }

  // A single subject on show (UPPDRAG KLART: Ove's car in the garage, Ove at a door): from 3/4
  // front, a few metres off, a little above, wherever the view of it is clear.
  showcase(o, opts = {}) {
    const s = subjectOf(o), car = !!o.spec;
    const yaw = o.yaw ?? 0, dists = car ? [7, 8.5, 5.8] : [3.8, 4.6, 3.2];
    const P = gather(s.x - 10, s.z - 10, s.x + 10, s.z + 10, this.shotCtx(), [s]);
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = yaw + (k / 16) * Math.PI * 2, off = Math.abs(angleDiff(a, yaw + (opts.side ?? 0.6)));
      for (const r of dists) for (const up of car ? [1.1, 2.0] : [0.15, 0.6]) {
        const c = { x: s.x + Math.sin(a) * r, y: s.y + s.height + up, z: s.z + Math.cos(a) * r };
        // (the UPPDRAG KLART banner covers the middle of the upper half: the subject sits below it
        // and, a person, a little to one side)
        const sx = Math.cos(a) * (car ? 0 : 0.8), sz = -Math.sin(a) * (car ? 0 : 0.8);
        const look = { x: s.x + sx, y: s.y + s.height * (car ? 0.95 : 1.05), z: s.z + sz };
        const j = judge(P, c, look, [s], 1);
        const score = j.score - off * 0.12 + (r === dists[0] ? 0.05 : 0);
        if (!best || score > best.score) best = { c, look, score, j, kind: 'show' };
      }
    }
    this.setShot(best, [s]);
  }

  // The best of some hand-placed shots ([{ pos, look, fov? }]) for these subjects (a finale), or,
  // if none of them works, frame(subjects[0], subjects[1]).
  pick(cands, list, opts = {}) {
    const subjects = list.map(subjectOf);
    const xs = [...cands.map((c) => c.pos.x), ...subjects.map((s) => s.x)], zs = [...cands.map((c) => c.pos.z), ...subjects.map((s) => s.z)];
    const P = gather(Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2, this.shotCtx(), subjects);
    let best = null;
    cands.forEach((cd, i) => {
      const j = judge(P, cd.pos, cd.look, subjects, opts.need ?? subjects.length);
      const score = j.score - i * 0.03;
      if (!best || score > best.score) best = { c: cd.pos, look: cd.look, fov: cd.fov, score, j, kind: 'pick' };
    });
    if ((!best || !best.j.ok) && subjects.length >= 2 && opts.fallback !== false) { this.frame(list[0], list[1]); return this.cineInfo; }
    this.setShot(best, subjects);
    return this.cineInfo;
  }

  setShot(best, subjects) {
    const pos = new THREE.Vector3(best.c.x, best.c.y, best.c.z), look = new THREE.Vector3(best.look.x, best.look.y, best.look.z);
    // A cut when the shot changes for real (or the camera comes from gameplay); a small reframing eases.
    const cut = !this.cine || this.pos.distanceTo(pos) > 1.5;
    this.cine = { pos, look, cut, fov: best.fov || CINE_FOV };
    this.cineSubjects = subjects;
    this.cineInfo = { kind: best.kind, score: +best.score.toFixed(2), ok: best.j.ok, vis: best.j.vis.map((v) => +v.toFixed(2)), heads: best.j.heads, near: best.j.near, poles: +best.j.poles.toFixed(2), subjects: subjects.map((s) => s.ref?.key || s.ref?.name || 'point') };
  }
  release() { this.cine = null; this.cineInfo = null; this.cineSubjects = null; }
}
