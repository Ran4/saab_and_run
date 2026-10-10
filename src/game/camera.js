// Third-person camera, kept low and steady for a realistic look: free mouse-look on foot (a step
// behind Ove at shoulder height), a chase cam in cars that swings in behind the direction of
// travel (further back when towing a trailer). The boom is pulled in against anything solid between
// the pivot and the camera (houses, garages, sheds, fences taller than the camera), snapping in at
// once and easing back out, so the camera never ends up inside a wall.

import { THREE } from '../gfx.js';
import { queryBlocks, groundAt, topAt, BOX, CIRCLE } from '../world/collision.js';
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
      this.pos.lerp(this.cine.pos, 1 - Math.exp(-4 * dt));
      this.look.lerp(this.cine.look, 1 - Math.exp(-5 * dt));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      this.fov = damp(this.fov, 42, 4, dt);
      cam.fov = this.fov; cam.updateProjectionMatrix();
      return;
    }
    if (look && (Math.abs(look.x) > 0.1 || Math.abs(look.y) > 0.1)) {
      // Clamp: some browsers deliver a huge jump on the first pointer-locked move.
      this.yaw -= clamp(look.x, -250, 250) * 0.0024;
      this.pitch = clamp(this.pitch + clamp(look.y, -250, 250) * 0.002, -0.3, 1.1);
      this.manualT = 1.8;
    }
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
    if (this.snapNext || wantBoom < this.boom) this.boom = wantBoom;
    else this.boom = damp(this.boom, wantBoom, 1.6, dt);
    const k = this.boom / dist;
    const want = _want.set(px + (tx - px) * k, py + (ty - py) * k, pz + (tz - pz) * k);
    // Pulled in close (a wall right behind): stay low, just over Ove's shoulder, so the camera
    // never rises into a porch canopy or a shed's snowy roof (those have no collision).
    if (k < 0.6) {
      want.y = Math.min(want.y, py + 0.12 + k * 0.4);
      // ... and step to the side (over his right shoulder on foot), so we look past him rather
      // than at the back of his head.
      const side = (0.6 - k) * (focus.car ? 0.9 : 1.25);
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
    this.look.set(px + fx * la, py - (focus.car ? 0.25 : 0.12) + ahead * 0.12, pz + fz * la);
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

  // Frame two people talking, from the side, at eye height, from a spot with a clear view: both
  // sides of the line between them, square on and turned up to ~40° either way; each candidate is
  // pulled in to its clear part (never placed inside or behind a wall), and the longest clear,
  // squarest one wins (a little bonus for the side the camera is already on).
  frame(a, b) {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const d = Math.max(3.6, l * 1.5 + 2.2);
    const here = (this.pos.x - mx) * nx + (this.pos.z - mz) * nz >= 0 ? 1 : -1;
    const top = Math.max(a.height || 1.6, b.height || 1.6);
    const y0 = Math.max(a.y, b.y) + top * 0.82;
    const need = Math.max(2.4, l * 1.1 + 1.2);   // closer than this and the two don't fit
    let best = null;
    for (const s of [here, -here]) {
      for (const ang of [0, 0.3, -0.3, 0.6, -0.6]) {
        const c = Math.cos(ang), sn = Math.sin(ang);
        const ux = (nx * c - nz * sn) * s, uz = (nx * sn + nz * c) * s;
        const f = boomFree(mx, y0, mz, mx + ux * d, y0 + 0.2, mz + uz * d);
        const r = Math.max(0, f * d - 0.35);
        let score = Math.min(r, d) / d - Math.abs(ang) * 0.12 + (s === here ? 0.05 : 0);
        if (r < need) score -= 1;
        if (!best || score > best.score) best = { px: mx + ux * r, pz: mz + uz * r, score };
      }
      if (best.score > 0.99) break;
    }
    this.cine = { pos: new THREE.Vector3(best.px, y0 + 0.25, best.pz), look: new THREE.Vector3(mx, y0 - 0.05, mz) };
  }
  release() { this.cine = null; }
}
