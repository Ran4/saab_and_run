// Ove's garage door: a steel up-and-over door (vipport) that he opens and closes by hand (main.js
// drives it: E at the door, both sides; DESIGN.md 6, notes/world.md, *Ove's garage door*).
//
// The panel is one rigid 2.73 x 2.16 m sheet with the row's ribs and handle. Its top edge runs in
// two tracks under the ceiling while it tips up; the bottom swings out ~0.3 m on the way (at knee
// height) and the panel ends inside the frame, 6 deg short of level, its front edge 2.02 m up (Ove can
// reach it from below). Its sweep stays above 1.1 m from 0.12 m inside the frame inwards, so the
// Saab (parked nose in, its rear 0.2 m in, its tailgate's edge lower than that) is not in the way. A
// collider fills the doorway while the door is shut, closing or less than 85 % open.
//
// State: p (0 shut .. 1 open), dir (+1 opening, -1 closing, 0 still). update(dt) moves it and says
// 'opened' / 'closed' on arrival. Built by ove.js into the garage row's frame (doors face local -z),
// listed in data.js `doors`; town.js adds the mesh after the static world is made static.

import { GeoBuilder, realMesh } from '../gfx.js';
import { CURB } from './layout.js';
import { RAMP } from './collision.js';
import { camBlocks } from './data.js';
import { mulberry32 } from '../util.js';

const L = 2.16;            // panel height = the opening's, jamb to header
const Z0 = -0.02;          // the shut panel's centre plane (frame local z), like the row's other doors
const TOP_UP = 0.09;       // the tracks rise this much into the garage (the top edge, open: 2.25 m)
const Z_UP = 2.25;         // how far the top edge runs in
const TIP = 0.105;         // rad the open panel is short of level
const SWING = 0.45;        // the bottom's swing out (the top edge held back at mid-travel)
const T_OPEN = 1.5, T_CLOSE = 1.15;   // s: lifted and sprung up / pulled down and falling shut
export const HANDLE = 0.975;   // the handle's height above the bottom edge

const jitter = (c, a, r) => {
  const f = 1 + (r() - 0.5) * 2 * a;
  const R_ = Math.min(255, ((c >> 16) & 255) * f), G_ = Math.min(255, ((c >> 8) & 255) * f), B_ = Math.min(255, (c & 255) * f);
  return (R_ << 16) | (G_ << 8) | B_;
};

export class GarageDoor {
  // f: the garage row's frame, cx: the door's centre along it. o: { w (panel width), color, name, open }
  constructor(f, cx, o = {}) {
    this.f = f; this.cx = cx;
    this.name = o.name || 'garageDoor';
    this.w = o.w ?? 2.73;
    this.color = o.color ?? 0x5a4632;
    this.p = o.open === false ? 0 : 1;
    this.dir = 0; this.s = 0;
    this.wob = 0; this.wobT = 9;
    // World frame: centre of the shut panel, out of the garage (local -z), along it (local +x).
    const [x, z] = f.W(cx, Z0);
    this.x = x; this.z = z;
    this.ox = -f.s; this.oz = -f.c;
    this.ax = f.c; this.az = -f.s;
    // The doorway's collider, overlapping the walls on both sides.
    this.block = f.solid(cx, Z0 - 0.02, this.w + 0.3, 0.16, 99, 'garageDoor');
    this.block.ref = this;
    this.block.dead = this.p > 0.5;
    // The open panel under the ceiling is an overhang the camera stays below (camera.js, camBlocks);
    // out of play (far below the ground) while it is shut or moving.
    const xs = [], zs = [];
    for (const [lx, lz] of [[cx - this.w / 2, 0.05], [cx + this.w / 2, 0.05], [cx - this.w / 2, Z0 + Z_UP], [cx + this.w / 2, Z0 + Z_UP]]) { xs.push(f.wx(lx, lz)); zs.push(f.wz(lx, lz)); }
    this.cb = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs), bottom: -100, top: -100 };
    camBlocks.push(this.cb);
    this.mesh = null;
    this._k = { yT: 0, zT: 0, th: 0 };
  }

  get isOpen() { return this.dir ? this.dir > 0 : this.p > 0.5; }
  get moving() { return this.dir !== 0; }

  // A point (world) in door coordinates: [across from the centre, out of the garage (> 0 outside)].
  local(x, z) {
    const dx = x - this.x, dz = z - this.z;
    return [dx * this.ax + dz * this.az, dx * this.ox + dz * this.oz];
  }
  // ...and back: a door-coordinate point (across, out) in world x, z.
  world(a, o) { return [this.x + this.ax * a + this.ox * o, this.z + this.az * a + this.oz * o]; }

  // The panel at p: its top edge (height, depth into the garage in frame local z) and its tilt.
  kin(p, out = this._k) {
    const e = Math.sin(p * Math.PI / 2);
    out.th = p * (Math.PI / 2 - TIP);
    out.yT = CURB + L + TOP_UP * e;
    out.zT = Z0 + Z_UP * e - SWING * Math.sin(p * Math.PI);
    return out;
  }
  // A point on the panel u metres up from its bottom edge (u = HANDLE: the handle), at the present
  // p: [height, out of the garage (door coordinates, > 0 outside)].
  pointUp(u, out = []) {
    const k = this.kin(this.p), d = L - u, th = k.th + this.wobAngle();
    out[0] = k.yT - d * Math.cos(th);
    out[1] = -(k.zT - d * Math.sin(th)) + Z0;
    return out;
  }
  wobAngle() { return this.wobT < 2 ? -this.wob * Math.sin(this.wobT * 38) * Math.exp(-this.wobT * 7) : 0; }

  // Start moving (false if it already is, or already is there).
  open() { if (this.dir || this.p >= 1) return false; this.dir = 1; this.s = 0; this.block.dead = false; return true; }
  close() { if (this.dir || this.p <= 0) return false; this.dir = -1; this.s = 0; this.block.dead = false; return true; }
  // At once, no sound (the save, tests).
  set(open) {
    this.dir = 0; this.s = 0; this.p = open ? 1 : 0;
    this.block.dead = !!open;
    this.wob = 0; this.wobT = 9;
    this.place();
  }
  // A rattle in the frame: a car into it (amount: the impact), a tug on the handle.
  bump(amount) { this.wob = Math.min(0.05, Math.max(this.wobT < 0.5 ? this.wob : 0, amount)); this.wobT = 0; }

  update(dt) {
    let ev = null;
    if (this.dir > 0) {
      this.s = Math.min(1, this.s + dt / T_OPEN);
      const s = this.s;
      this.p = s * s * (3 - 2 * s);
      // out of the way of people and cars once it is high enough (the bottom edge above 1.75 m)
      if (this.p > 0.85) this.block.dead = true;
      if (s >= 1) { this.dir = 0; this.p = 1; ev = 'opened'; this.bump(0.01); }
    } else if (this.dir < 0) {
      // pulled down, then falling shut faster and faster on its springs
      this.s = Math.min(1, this.s + dt / T_CLOSE);
      this.p = 1 - this.s * this.s;
      if (this.s >= 1) { this.dir = 0; this.p = 0; ev = 'closed'; this.bump(0.022); }
    }
    if (this.wobT < 2) this.wobT += dt;
    if (ev || this.dir || this.wobT < 2) this.place();
    return ev;
  }

  // Doorway queries. A band across the doorway from `out` metres outside the panel to `inn` inside
  // (an oriented box, collision.js's RAMP shape: circleVsBlock / obbVsBlock take it).
  band(out, inn, o = (this._band ||= { shape: RAMP, top: 99, h0: 99, h1: 99 })) {
    const mid = (out - inn) / 2;
    [o.x, o.z] = this.world(0, mid);
    o.fx = -this.ox; o.fz = -this.oz;
    o.hx = this.w / 2 + 0.05; o.hz = (out + inn) / 2;
    return o;
  }
  // Does the shut (or not yet open) door stand between two points? (Ove outside, the Saab inside.)
  between(ax, az, bx, bz) {
    if (this.block.dead) return false;
    const [, oa] = this.local(ax, az), [, ob] = this.local(bx, bz);
    if (oa * ob > 0) return false;
    const t = oa / (oa - ob), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    return Math.abs(this.local(x, z)[0]) < this.w / 2 + 0.3;
  }

  // ---------------------------------------------------------------------------------------------
  // Mesh. Panel-local: origin on the top edge's centre, x along the door, y down the panel (to -L),
  // -z the outside face.
  build() {
    const g = new GeoBuilder(), r = mulberry32(5101), W = this.w, c = this.color;
    g.use('painted', { snow: 0 });
    g.boxB(c, 0, -L, 0, W, L, 0.04);
    // (the ribs catch snow on top like the row's other doors: thin white lines while it is shut)
    g.use('painted');
    for (let q = 1; q < 6; q++) g.boxB(jitter(c, 0.15, r), 0, -L + q * 0.36, -0.025, W - 0.02, 0.03, 0.02);
    g.use('metal', { snow: 0 });
    g.boxB(0x9a9da0, 0, -L + 0.95, -0.04, 0.22, 0.05, 0.03);
    // Inside: the steel frame it is built on, the lock bar to the latches, the inner handle.
    for (const s of [-1, 1]) g.boxB(0x6e7276, s * (W / 2 - 0.04), -L + 0.02, 0.035, 0.05, L - 0.04, 0.03);
    for (const y of [-L + 0.04, -L * 0.52, -0.09]) g.boxB(0x6e7276, 0, y, 0.035, W - 0.12, 0.05, 0.03);
    g.boxB(0x8a8e92, 0, -L + 0.12, 0.052, 0.03, 0.85, 0.012);
    g.boxB(0x8a8e92, 0, -L + HANDLE - 0.02, 0.06, 0.16, 0.04, 0.03);
    this.mesh = realMesh(g.build());
    this.mesh.name = this.name;
    this.mesh.rotation.order = 'YXZ';
    this.place();
    return this.mesh;
  }
  place() {
    const up = this.p >= 1 && !this.dir;
    this.cb.bottom = up ? CURB + 2.0 : -100; this.cb.top = up ? CURB + 2.3 : -100;
    const m = this.mesh;
    if (!m) return;
    const k = this.kin(this.p), f = this.f;
    m.position.set(f.wx(this.cx, k.zT), k.yT, f.wz(this.cx, k.zT));
    m.rotation.set(k.th + this.wobAngle(), f.yaw, 0);
  }
}
