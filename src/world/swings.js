// Saab & Run — the playgrounds' swings (feature gungorna_saknar_linor). Every seat hangs from its
// beam on two lines - braided ropes at the preschool, chains with a plastic sleeve where the hands
// go in the row-house areas - and is a pendulum about the beam: `th` (rad, + swings the seat
// towards the local +z of the frame it was built in) and `w` (rad/s). The frames and beams stay in
// the static world (places.js preschoolBlock, rowhouse.js playground: each calls swing() where its
// seat used to be, no rnd drawn); the seats are two instanced meshes (one per kind of line), built
// by town.js after the static world like the garage door. game/gunga.js steps the ones that move,
// pushes them (E) and lets them hit Ove.
//
// A seat: `x, z` (the hooks' mid-point on the beam, world), `y` (the hooks' height: the beam's
// underside), `L` (hooks to the seat's middle), `ax, az` (along the beam), `ox, oz` (across it, the
// way + th swings), `hw`, `hd` (the seat's half width along the beam and half depth across it),
// `rope` (the lines' distance from the seat's middle), `kind` ('rope' | 'chain').

import { THREE, GeoBuilder, realMaterials } from '../gfx.js';

export const swings = [];

export const SWING = {
  g: 9.81,
  damp: 0.075,     // 1/s: the angular speed lost to the hooks (the amplitude halves in ~18 s) ...
  drag: 0.05,      // ... and to the air, with the square of the speed (big swings settle sooner)
  max: 1.25,       // rad (~72°): no higher (the lines would go slack)
  rest: 0.004,     // rad and rad/s: below both it stops
};

// A seat hanging from the beam over (lx, lz) of frame f (the beam along f's local x). o: { top (the
// beam's underside), seat (the seat's middle, height), kind, rope }.
export function swing(f, lx, lz, o) {
  const s = new Swing(f.wx(lx, lz), f.wz(lx, lz), f.yaw, o);
  swings.push(s);
  return s;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

export class Swing {
  constructor(x, z, yaw, o) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = o.top; this.L = o.top - o.seat;
    this.ax = Math.cos(yaw); this.az = -Math.sin(yaw);
    this.ox = Math.sin(yaw); this.oz = Math.cos(yaw);
    this.kind = o.kind || 'rope';
    this.rope = o.rope ?? 0.2;
    this.hw = 0.225; this.hd = 0.085;
    this.th = 0; this.w = 0;
    this.moving = false;
    this.cd = 0; this.carT = 0;   // (game/gunga.js: game time until it may hit Ove / clank on a car again)
    this.im = null; this.idx = -1;
  }

  // [along the beam, across it] of a world point, from the hooks
  local(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.ax + dz * this.az, dx * this.ox + dz * this.oz]; }
  // the seat's middle: across the beam from the hooks (m) and its height
  get so() { return this.L * Math.sin(this.th); }
  get sy() { return this.y - this.L * Math.cos(this.th); }
  // its velocity across the beam (horizontal) and up
  get svo() { return this.L * this.w * Math.cos(this.th); }
  get svy() { return this.L * this.w * Math.sin(this.th); }
  // The highest it will go from here (rad).
  amplitude() {
    const c = Math.cos(this.th) - (this.w * this.w * this.L) / (2 * SWING.g);
    return c <= -1 ? Math.PI : Math.acos(c);
  }
  // No higher than SWING.max: the speed taken down to what reaches it.
  cap() {
    const cm = Math.cos(SWING.max), c = Math.cos(this.th);
    if (Math.abs(this.th) >= SWING.max) { this.th = Math.sign(this.th) * SWING.max; if (this.w * this.th > 0) this.w = 0; return; }
    if (c - (this.w * this.w * this.L) / (2 * SWING.g) < cm) this.w = Math.sign(this.w) * Math.sqrt((2 * SWING.g * (c - cm)) / this.L);
  }
  // One fixed step; false once it has come to rest.
  step(h) {
    const S = SWING;
    this.w -= (S.g / this.L) * Math.sin(this.th) * h;
    this.w *= Math.exp(-(S.damp + S.drag * Math.abs(this.w)) * h);
    this.th += this.w * h;
    if (Math.abs(this.th) > S.max) { this.th = Math.sign(this.th) * S.max; if (this.w * this.th > 0) this.w = 0; }
    if (Math.abs(this.th) < S.rest && Math.abs(this.w) < S.rest) { this.th = 0; this.w = 0; this.moving = false; }
    this.place();
    return this.moving;
  }
  // Set it swinging (or hold it where it is).
  set(th, w) { this.th = th; this.w = w; this.moving = true; this.place(); }
  place() {
    if (!this.im) return;
    // (rotation.x = -th: the seat, at (0, -L, 0) below the hooks, goes to local +z for th > 0)
    _e.set(-this.th, this.yaw, 0, 'YXZ');
    this.im.setMatrixAt(this.idx, _m.compose(_p.set(this.x, this.y, this.z), _q.setFromEuler(_e), _one));
    this.im.instanceMatrix.needsUpdate = true;
  }
}

// One seat and its lines, the hooks at the origin, hanging along -y; the beam along x.
//   rope: braided polyester rope with a steel core (dark grey-brown), a thimble and a shackle at the
//   hook, a clamp at the seat; chain: galvanised chain (a thin bar: links don't read at this size),
//   a black plastic sleeve over its lower 0.55 m, a shackle at the hook. Both: a rubber sling seat
//   that sags a little in the middle, its ends in steel clamps.
function seatGeo(kind, L, rope) {
  const g = new GeoBuilder();
  const top = -0.03, low = -L + 0.035;
  const len = top - low;
  if (kind === 'chain') {
    g.use('metal', { snow: 0 });
    for (const s of [-1, 1]) {
      g.box(0x9a9da0, s * rope, (top + low) / 2, 0, 0.016, len, 0.016);
      g.box(0x7e8286, s * rope, -0.02, 0, 0.012, 0.05, 0.04);
    }
    g.use('rubber', { snow: 0 });
    for (const s of [-1, 1]) g.cyl(0x26282a, s * rope, low + 0.3, 0, 0.017, 0.55, 8);
  } else {
    g.use('fabric', { snow: 0 });
    for (const s of [-1, 1]) g.cyl(0x56504a, s * rope, (top + low) / 2, 0, 0.012, len, 6);
  }
  // the sling: six segments sagging 3 cm in the middle, its ends up where the lines meet them
  g.use('rubber', { snow: 0 });
  const W = 0.45, D = 0.17, n = 6, sag = 0.03;
  const yAt = (u) => -L + sag * (u * u - 1 / 3);
  for (let k = 0; k < n; k++) {
    const u0 = -1 + (2 * k) / n, u1 = u0 + 2 / n, x0 = (u0 * W) / 2, x1 = (u1 * W) / 2, y0 = yAt(u0), y1 = yAt(u1);
    const lx = Math.hypot(x1 - x0, y1 - y0);
    g.box(0x1e1e20, (x0 + x1) / 2, (y0 + y1) / 2, 0, lx + 0.004, 0.014, D, 0, 0, Math.atan2(y1 - y0, x1 - x0));
  }
  // the clamps at its ends, and the hooks' shackles (rubber, their colour: one surface fewer)
  for (const s of [-1, 1]) {
    g.box(0x2a2c2e, s * rope, yAt(1) + 0.012, 0, 0.03, 0.05, 0.05);
    if (kind === 'rope') g.box(0x2a2c2e, s * rope, -0.02, 0, 0.022, 0.05, 0.035);
  }
  return g.build();
}

// The seats' meshes (town.js, after the static world): one instanced mesh per kind of line.
export function buildSwings(scene) {
  const kinds = new Map();
  for (const s of swings) {
    const key = `${s.kind}:${s.L.toFixed(3)}:${s.rope}`;
    if (!kinds.has(key)) kinds.set(key, []);
    kinds.get(key).push(s);
  }
  for (const [key, list] of kinds) {
    const geo = seatGeo(list[0].kind, list[0].L, list[0].rope);
    const im = new THREE.InstancedMesh(geo, realMaterials(geo, { snow: false }), list.length);
    im.name = 'swings:' + key;
    im.castShadow = true; im.receiveShadow = true;
    list.forEach((s, i) => { s.im = im; s.idx = i; s.place(); });
    im.computeBoundingSphere();
    // (the town-wide sphere already holds every seat at any angle)
    im.boundingSphere.radius += 2;
    scene.add(im);
  }
}
