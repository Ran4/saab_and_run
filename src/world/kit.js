// Building kit shared by every block builder: local frames, trees, hedges, lamps, sign posts,
// snow banks, windows and doors. Everything is PBR via the section-10 surfaces.

import { THREE, mat, PRIM, GeoBuilder, SUN_DIR } from '../gfx.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, landmarks } from './layout.js';
import { box, circle, ramp } from './collision.js';
import { placeProp } from './props.js';
import { addSign, addDecal, addCard, addQuad, addGrid, twigFace, PICTO_SHAPE } from './signs.js';
import { parkedCars, lamps, camBlocks, parkingLots, parkingBays } from './data.js';
import { addGround, addGroundCircle } from './surface.js';
import { mulberry32, clamp } from '../util.js';

export const TAU = Math.PI * 2;
// A car park's rule and name (data.js parkingLots; its bays: Frame.bay). The first call makes it.
export function parkingLot(id, o) { return (parkingLots[id] ||= { id, ...o }); }
// The plate under a P sign for a p-skiva car park (feature p-skiva).
export const PSKIVA_PLATE = { w: 0.6, h: 0.17 };
export const wrapYaw = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const rnd = mulberry32(19581109);
export const R = (a, b, r = rnd) => a + (b - a) * r();
export const pickR = (arr, r = rnd) => arr[Math.floor(r() * arr.length)];
// (round 6) A 'light' colour scaled down so that its emission (vertex colour x 4, linear) has a
// luminance of at most L. In daylight a lamp glows; it must not bloom (the bloom pass starts at a
// luminance of 2.6, and a lit face in the sun adds its diffuse light on top): Parvaneh's star and the
// porch lamps were white starbursts behind every dialogue.
const _gc = new THREE.Color();
export function glow(hex, L = 1.2) {
  _gc.set(hex);
  const l = 4 * (0.2126 * _gc.r + 0.7152 * _gc.g + 0.0722 * _gc.b);
  if (l > L) _gc.multiplyScalar(L / l);
  return _gc.getHex();
}

// Muted Scandinavian palette.
export const C = {
  falu: 0x7a2a1f, ochre: 0xb3904a, offwhite: 0xe0dacb, greygreen: 0x7d8b77, brown: 0x4a3d32,
  lightgrey: 0xb2ada2, paleyellow: 0xcfbd8a, bluegrey: 0x6a7884, sand: 0xc8b89a, darkgreen: 0x3e4a3c,
  trim: 0xebe7de, trimDark: 0x2c2c2a, plinth: 0x8a8884, granite: 0x8c8a86,
  roofBlack: 0x2a2a2d, roofGrey: 0x3a3836, roofRed: 0x5a3026, metalBlack: 0x2e3134, metalGrey: 0x55595c,
  asphalt: 0x6a6866, lot: 0x74726e, walk: 0x8c8984, paving: 0x9e9c98, gravel: 0x8a8070, lawn: 0x6b6440,
  galv: 0x8e9296, hedge: 0x45553d, spruce: 0x2f4229,
};
export const WALLS = [C.falu, C.ochre, C.offwhite, C.greygreen, C.brown, C.lightgrey, C.paleyellow, C.bluegrey, C.falu];
export const DOORS = [0x2f3a2e, 0x5a2a22, 0x2a3440, 0xe2dccd, 0x4a3a2a, 0x353535, 0x3a5662, 0x6a5a3a, 0x7a2a1f];

// ---------------------------------------------------------------------------------------------
// A local frame: origin + yaw, so things can be authored facing one way. Local +z maps to the
// world direction (sin yaw, cos yaw); local +x to (cos yaw, -sin yaw).

export class Frame {
  constructor(S, F, ox, oz, yaw = 0) {
    this.S = S; this.F = F; this.ox = ox; this.oz = oz; this.yaw = yaw;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }
  sub(lx, lz, ly = 0) { return new Frame(this.S, this.F, this.wx(lx, lz), this.wz(lx, lz), this.yaw + ly); }
  use(surface, opts) { this.S.use(surface, opts); return this; }
  useF(surface, opts) { this.F.use(surface, opts); return this; }
  wx(lx, lz) { return this.ox + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.oz - lx * this.s + lz * this.c; }
  box(color, lx, y0, lz, w, h, d, ly = 0, G = this.S) { G.boxB(color, this.wx(lx, lz), y0, this.wz(lx, lz), w, h, d, this.yaw + ly); return this; }
  boxC(color, lx, y, lz, w, h, d, ly = 0, rx = 0, rz = 0, G = this.S) { G.box(color, this.wx(lx, lz), y, this.wz(lx, lz), w, h, d, this.yaw + ly, rx, rz); return this; }
  sphere(color, lx, y, lz, sx, sy = sx, sz = sx, ly = 0, G = this.S) { G.sphere(color, this.wx(lx, lz), y, this.wz(lx, lz), sx, sy, sz, 0, this.yaw + ly, 0); return this; }
  cyl(color, lx, y, lz, r, h, n = 12, rx = 0, rz = 0, ly = 0, G = this.S) { G.cyl(color, this.wx(lx, lz), y, this.wz(lx, lz), r, h, n, rx, this.yaw + ly, rz); return this; }
  cone(color, lx, y, lz, r, h, n = 12, G = this.S) { G.cone(color, this.wx(lx, lz), y, this.wz(lx, lz), r, h, n); return this; }
  ico(color, lx, y, lz, s, G = this.S) { G.ico(color, this.wx(lx, lz), y, this.wz(lx, lz), s, 1, rnd() * 6); return this; }
  add(geo, color, lx, y, lz, ly = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, G = this.S) { G.add(geo, color, mat(this.wx(lx, lz), y, this.wz(lx, lz), rx, this.yaw + ly, rz, sx, sy, sz)); return this; }
  // Flat ground cover (F builder) at height y: a horizontal quad (no side faces: a slab's 1-2 cm
  // riser read as a black line across the snow).
  flat(color, lx, lz, w, d, y = CURB + 0.02, ly = 0) {
    this.F.add(FLATQ, color, mat(this.wx(lx, lz), y, this.wz(lx, lz), 0, this.yaw + ly, 0, w, 1, d));
    addGround(this.F.surface, this.wx(lx, lz), this.wz(lx, lz), w, d, this.yaw + ly, y);
    return this;
  }
  // An overhang the camera should avoid (see data.js camBlocks): local rectangle w x d at (lx, lz).
  cam(lx, lz, w, d, bottom, top, ly = 0) { camBlock(this.wx(lx, lz), this.wz(lx, lz), w, d, this.yaw + ly, bottom, top); return this; }
  // Collider from a local rectangle: an axis-aligned box when the result is axis-aligned, else
  // an oriented box (a flat 'ramp').
  solid(lx, lz, w, d, top = 99, kind = 'building', ly = 0) {
    const yaw = this.yaw + ly, x = this.wx(lx, lz), z = this.wz(lx, lz);
    const sn = Math.abs(Math.sin(yaw)), cs = Math.abs(Math.cos(yaw));
    if (sn < 1e-3 || cs < 1e-3) {
      const turned = sn > 0.7;
      const hw = (turned ? d : w) / 2, hd = (turned ? w : d) / 2;
      return box(x - hw, z - hd, x + hw, z + hd, top, kind);
    }
    return ramp(x, z, yaw, w, d, top, top, kind);
  }
  circ(lx, lz, r, top = 99, kind = 'solid') { return circle(this.wx(lx, lz), this.wz(lx, lz), r, top, kind); }
  ramp(lx, lz, ly, w, l, h0, h1, kind = 'ramp') { return ramp(this.wx(lx, lz), this.wz(lx, lz), this.yaw + ly, w, l, h0, h1, kind); }
  prop(type, lx, lz, ly = 0) { placeProp(type, this.wx(lx, lz), this.wz(lx, lz), this.yaw + ly); return this; }
  mark(name, lx, lz, ly = 0, extra = null) { landmarks[name] = { x: this.wx(lx, lz), z: this.wz(lx, lz), yaw: wrapYaw(this.yaw + ly), ...(extra || {}) }; return landmarks[name]; }
  car(type, lx, lz, ly, extra = {}) { parkedCars.push({ type, x: this.wx(lx, lz), z: this.wz(lx, lz), yaw: this.yaw + ly, ...extra }); return this; }
  // A marked parking bay of lot `lot` (data.js parkingBays: game/pskiva.js), centred at (lx, lz), a car
  // in it heading ly; o: { w, l, rule } (rule: this bay's own, e.g. the handicap bay of a p-skiva lot).
  bay(lx, lz, ly, lot, o = {}) {
    const n = (parkingLots[lot].count = (parkingLots[lot].count || 0) + 1);
    parkingBays.push({ x: this.wx(lx, lz), z: this.wz(lx, lz), yaw: wrapYaw(this.yaw + ly), w: o.w ?? 2.7, l: o.l ?? 5, lot, rule: o.rule ?? null, n });
    return this;
  }
  // A printed face (signs.js) on a wall or plate: centred at (lx, y, lz), facing local yaw ly.
  sign(face, lx, y, lz, w, h, ly = 0) { addSign(face, this.wx(lx, lz), y, this.wz(lx, lz), w, h, this.yaw + ly); return this; }
  decal(face, lx, lz, w, d, ly = 0, y = CURB + 0.045) { addDecal(face, this.wx(lx, lz), y, this.wz(lx, lz), w, d, this.yaw + ly); return this; }
  post(lx, lz, ly, faces, opts) { signPost(this.S, this.wx(lx, lz), this.wz(lx, lz), this.yaw + ly, faces, opts); return this; }
  tree(lx, lz, s = 1, kind = 'birch', r = rnd) { tree(this.S, this.wx(lx, lz), this.wz(lx, lz), s, kind, r); return this; }
  lamp(lx, lz, ly = 0, h) { streetLamp(this.S, this.wx(lx, lz), this.wz(lx, lz), this.yaw + ly, h); return this; }
  plamp(lx, lz, h) { pathLamp(this.S, this.wx(lx, lz), this.wz(lx, lz), h); return this; }
  roof(color, lx, y, lz, w, l, tilt = 0, ly = 0, o) { metalRoof(this, color, lx, y, lz, w, l, tilt, ly, o); return this; }
  bank(lx0, lz0, lx1, lz1, w, h, seed, o) { snowBank(this.S, this.wx(lx0, lz0), this.wz(lx0, lz0), this.wx(lx1, lz1), this.wz(lx1, lz1), w, h, seed, undefined, o); return this; }
  // face: local direction (yaw) of the plough-cut, gritty side (towards the street / aisle)
  pile(lx, lz, r, h, solid = true, face) { snowPile(this.S, this.wx(lx, lz), this.wz(lx, lz), r, h, solid, rnd, CURB, 3, face === undefined ? undefined : this.yaw + face); return this; }
  fringe(lx0, lz0, lx1, lz1, side, y, seed, o) { snowFringe(this.F || this.S, this.wx(lx0, lz0), this.wz(lx0, lz0), this.wx(lx1, lz1), this.wz(lx1, lz1), side, y, seed, o); return this; }
  hedge(lx, lz, w, d, h = 0.9, ly = 0, color, collide = true, o = {}) {
    // (the hedge body is lofted along its local x: a hedge given as narrow x long z is turned)
    if (d > w) hedge(this.S, this.wx(lx, lz), this.wz(lx, lz), d, w, h, this.yaw + ly + Math.PI / 2, color, o);
    else hedge(this.S, this.wx(lx, lz), this.wz(lx, lz), w, d, h, this.yaw + ly, color, o);
    if (collide) this.solid(lx, lz, w, d, CURB + h, 'hedge', ly);
    return this;
  }
  // World position of a local point.
  W(lx, lz) { return [this.wx(lx, lz), this.wz(lx, lz)]; }
}

// World AABB of a rectangle w (local x) x d (local z) at (x, z) turned by yaw -> camBlocks.
export function camBlock(x, z, w, d, yaw, bottom, top) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = c * w / 2 + s * d / 2, ez = s * w / 2 + c * d / 2;
  camBlocks.push({ x0: x - ex, z0: z - ez, x1: x + ex, z1: z + ez, bottom, top });
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

const geoCache = {};
const FLATQ = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// A horizontal quad w x d at height y (ground cover with no side faces: a 1-2 cm riser of a thin
// box shows as a line, e.g. the grass edge of a verge strip along the kerb).
export function flatQuad(G, color, x, y, z, w, d, yaw = 0) { G.add(FLATQ, color, mat(x, y, z, 0, yaw, 0, w, 1, d)); }
// Open tapered cylinder, unit height, base radius 0.5, top radius 0.5 * top.
export function taperGeo(top = 0.6, n = 8) {
  const k = `t${top.toFixed(2)}_${n}`;
  return (geoCache[k] ??= new THREE.CylinderGeometry(0.5 * Math.max(0.02, top), 0.5, 1, n, 1, true));
}
// A limb (tapered cylinder) from A to B.
export function limb(G, ax, ay, az, bx, by, bz, r0, r1, color, n = 5) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-3;
  const ry = Math.atan2(dx, dz), rx = Math.acos(clamp(dy / L, -1, 1));
  G.add(taperGeo(Math.round((r1 / r0) * 20) / 20, n), color, mat((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, rx, ry, 0, r0 * 2, L, r0 * 2));
  // (in a tree template: a thin branch or twig, which leaves the shadow pass, see placeTemplate)
  if (TPL_ON && r0 < 0.035) G.parts[G.parts.length - 1]._fine = true;
}
// Triangular plate (for warning signs), unit size facing +z, 1 unit thick.
export function triPlateGeo() {
  if (geoCache.tri) return geoCache.tri;
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0, 0.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.deleteAttribute('uv');
  return (geoCache.tri = g);
}
// Quarter-round / bent geometry for an arch-shaped arm etc. is not needed; keep it simple.

// Horizontal quads (road paint etc.) as one part: list of [x, z, w, d, yaw]; y = top height.
export function quads(G, color, list, y) {
  if (!list.length) return;
  const pos = new Float32Array(list.length * 12), nrm = new Float32Array(list.length * 12), idx = new Uint32Array(list.length * 6);
  list.forEach(([x, z, w, d, yaw = 0], i) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    pts.forEach(([a, b], k) => {
      pos[i * 12 + k * 3] = x + a * c + b * s;
      pos[i * 12 + k * 3 + 1] = y;
      pos[i * 12 + k * 3 + 2] = z - a * s + b * c;
      nrm[i * 12 + k * 3 + 1] = 1;
    });
    // Counter-clockwise seen from above (+y).
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  G.add(g, color, null);
}

// Value noise for organic shapes (1D, 2D, 3D; all in 0..1).
export function hash(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
export function vnoise(t, s) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash(i, s) * (1 - u) + hash(i + 1, s) * u; }
function hash3(i, j, k, s) { const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + s * 19.19) * 43758.5453; return x - Math.floor(x); }
export function vnoise3(x, y, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(hash3(i, j, k, s), hash3(i + 1, j, k, s), u), L(hash3(i, j + 1, k, s), hash3(i + 1, j + 1, k, s), u), v),
    L(L(hash3(i, j, k + 1, s), hash3(i + 1, j, k + 1, s), u), L(hash3(i, j + 1, k + 1, s), hash3(i + 1, j + 1, k + 1, s), u), v), w);
}
export const vnoise2 = (x, z, s = 0) => vnoise3(x, 0.5, z, s);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Multiply the vertex colour of the last part added by f(x, y, z) (world position): grit at the
// foot of a pile, a darker base under a hedge, etc.
export function shadeLast(G, f) {
  const p = G.parts[G.parts.length - 1];
  if (!p) return;
  const c = p.attributes.color, pos = p.attributes.position;
  for (let i = 0; i < c.count; i++) {
    const k = f(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (Array.isArray(k)) { c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]); } else c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

// Build an indexed loft: rings of points (each ring an array of [x, y, z]) joined into quads, with
// smooth normals. Faces are wound to point away from `inside` (a point, or a function of the vertex
// index giving one). Optional end caps (fans to the ring centroid, pushed out along o.axis by
// o.bulge), each wound to face away from the body.
function loft(rings, o = {}) {
  const R = rings.length, P = rings[0].length;
  const pos = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const V = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const fn = (a, b, c) => { const A = V(a), B = V(b), C = V(c); const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]; return [[u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], A]; };
  let body = [];
  for (let k = 0; k < R - 1; k++) for (let p = 0; p < P - 1; p++) {
    const a = k * P + p, b = a + 1, c = a + P, d = c + 1;
    body.push(a, c, b, b, c, d);
  }
  let out = 0;
  for (let i = 0; i < body.length; i += 3) {
    const [n, A] = fn(body[i], body[i + 1], body[i + 2]);
    const c = typeof o.inside === 'function' ? o.inside(body[i]) : o.inside || [0, -1e6, 0];
    out += (A[0] - c[0]) * n[0] + (A[1] - c[1]) * n[1] + (A[2] - c[2]) * n[2];
  }
  const flip = (l) => { for (let i = 0; i < l.length; i += 3) { const t = l[i + 1]; l[i + 1] = l[i + 2]; l[i + 2] = t; } };
  if (out < 0) flip(body);
  const idx = body;
  if (o.caps) {
    const [ax, ay, az] = o.axis || [1, 0, 0];
    for (const [k, dir] of [[0, -1], [R - 1, 1]]) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of rings[k]) { cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= P; cy /= P; cz /= P;
      const b = o.bulge ?? 0, ci = pos.length / 3;
      pos.push(cx + ax * dir * b, cy + ay * dir * b, cz + az * dir * b);
      // The cap gets its own copy of the ring (a crease, not a smoothed sliver at the end).
      for (const p of rings[k]) pos.push(p[0], p[1], p[2]);
      const l = [];
      for (let p = 0; p < P - 1; p++) l.push(ci, ci + 1 + p, ci + 2 + p);
      // (round 6) and the fan's last triangle, from the ring's last point back to its first: an open
      // profile (a hedge's: its bottom edge is not in the ring) left a V-shaped hole in the cap, the
      // black notch on the end of the hedge in the game's first frame
      l.push(ci, ci + P, ci + 1);
      let s = 0;
      for (let i = 0; i < l.length; i += 3) { const [n] = fn(l[i], l[i + 1], l[i + 2]); s += (n[0] * ax + n[1] * ay + n[2] * az) * dir; }
      if (s < 0) flip(l);
      idx.push(...l);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Plowed snow is chunky and dirty: grey-brown grit at its foot and on the side the plough /
// traffic threw it from, white above. Multipliers on the snow's white for that grit (about
// 0x8f8a82 where it is dirtiest).
const GRIT = [0.27, 0.24, 0.2];
// Debug: triangles of snow geometry by kind.
export const snowStats = {};
const sst = (k, G) => { const p = G.parts[G.parts.length - 1]; snowStats[k] = (snowStats[k] || 0) + (p.index ? p.index.count : p.attributes.position.count) / 3; };
const mixK = (t) => [GRIT[0] + (1 - GRIT[0]) * t, GRIT[1] + (1 - GRIT[1]) * t, GRIT[2] + (1 - GRIT[2]) * t];

// A lump of packed, dirty snow (a broken-off plough chunk, rounded by the frost): a welded,
// noise-pushed icosphere with a flattened underside, smooth-shaded. v = variant; lite: 20 faces.
const chunkGeos = [];
function chunkGeo(v, lite = false) {
  const key = v * 2 + (lite ? 1 : 0);
  if (chunkGeos[key]) return chunkGeos[key];
  let g = new THREE.IcosahedronGeometry(0.5, lite ? 0 : 1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (vnoise3(x * 2.6, y * 2.6, z * 2.6, v * 3 + 1) - 0.5) * 0.55 + (vnoise3(x * 6, y * 6, z * 6, v * 3 + 2) - 0.5) * 0.2;
    p.setXYZ(i, x * k * (1.1 + 0.2 * hash(v, 3)), y < 0 ? y * k * 0.4 : y * k * 0.75, z * k * (0.9 + 0.2 * hash(v, 5)));
  }
  g.computeVertexNormals();
  return (chunkGeos[key] = g);
}
const chunkLite = (v) => chunkGeo(v, true);
// Scatter n lumps of size ~sz around (x, z) within radius rad (y0 = ground), half sunk, grey
// (0xb8b6b0 .. 0x9a968e: what the plough breaks off is the dirty packed snow).
export function chunks(G, x, z, n, sz, rad, y0 = CURB, rr = rnd, grey = 0.8, lite = false) {
  G.use('snow');
  for (let k = 0; k < n; k++) {
    const a = rr() * TAU, d = rad * Math.sqrt(rr()), s = sz * (0.55 + rr() * 0.6);
    const g = 0.7 + rr() * 0.22;
    G.add(chunkGeo(Math.floor(rr() * 8), lite), new THREE.Color(0.86 * g, 0.85 * g, 0.82 * g).getHex(), mat(x + Math.cos(a) * d, y0 - s * 0.08, z + Math.sin(a) * d, (rr() - 0.5) * 0.4, rr() * TAU, (rr() - 0.5) * 0.4, s, s * (0.7 + rr() * 0.4), s * (0.8 + rr() * 0.4)));
    sst('chunks', G);
  }
}

// Vertex colour of plowed snow: grit at the foot (the lower third), a grey-brown spray band on the
// face towards the asphalt it was plowed from (lateral > 0 is that side), mottling.
function gritShade(G, y0, h, latOf, seed, spray = 0.35) {
  shadeLast(G, (x, y, z) => {
    const yy = y - y0, lat = latOf(x, z);
    const foot = 1 - sstep(0.02, 0.08 + h * 0.42, yy);
    const side = sstep(-0.05, 0.2, lat) * (1 - sstep(spray * 0.7, spray + 0.08, yy));
    const n = vnoise2(x * 3.3, z * 3.3, seed + 7), n2 = vnoise2(x * 9, z * 9, seed + 9);
    const dirt = Math.min(1, Math.max(foot * (0.75 + 0.5 * n), side * (0.8 + 0.5 * n), 0.12 + 0.2 * n2) * (0.85 + 0.45 * n2));
    const mot = 0.86 + 0.14 * vnoise2(x * 2.7, z * 2.7, seed + 51);
    return mixK(1 - dirt).map((v) => v * mot);
  });
}

// A plowed snow bank (snövall) along a segment: a low lumpy ridge w wide (plus a near-flat skirt
// that sinks into the ground on both sides) and ~h tall, whose height changes by +-40 % every metre
// or two, lumpy at 0.3-0.6 m (the blade leaves broken, rounded chunks, never a smooth tube), tapering
// to nothing over its last 0.3-0.5 m with a ragged outline. Visual only (you wade through it).
// o.skirt (m, default 0.3), o.end (taper length, default 0.45), o.dirty (+1 / -1: the side, along
// the left normal (-dz, dx) of the segment, that faces the asphalt it was plowed from: slush-grey
// spray there), o.chunks (false: no loose lumps), o.rubble (lumps per metre on the crest).
export function snowBank(G, x0, z0, x1, z1, w = 1.0, h = 0.45, seed = 1, y0 = CURB - 0.06, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.8) return;
  const ax = (x1 - x0) / L, az = (z1 - z0) / L, nx = -az, nz = ax;
  const sk = o.skirt ?? 0.3, endL = Math.min(o.end ?? 0.45, L / 2.5);
  // Across the bank: lateral position (fraction of w, skirt in metres) and height (fraction of h).
  // (the asphalt side, if known, is steeper: cut by the blade / shovel)
  const ds = o.dirty ?? 0;
  const prof = (o.coarse ? [[-0.5, -sk, -0.5], [-0.5, 0, 0.1], [-0.18, 0, 0.9], [0.16, 0, 0.95], [0.5, 0, 0.1], [0.5, sk, -0.5]]
    : [[-0.5, -sk, -0.5], [-0.5, 0, 0.1], [-0.37, 0, 0.5], [-0.2, 0, 0.88], [0.0, 0, 1.0], [0.19, 0, 0.9], [0.36, 0, 0.52], [0.5, 0, 0.1], [0.5, sk, -0.5]])
    .map(([a, s_, b]) => [ds && a * ds > 0.1 ? a * 0.8 + 0.1 * ds : a, s_, ds && a * ds > 0.1 && b > 0 ? Math.min(1, b * 1.25) : b]);
  const st = Math.max(3, Math.ceil(L / (o.coarse ? 0.48 : 0.3)));
  const P = prof.length;
  const rings = [];
  const gl = 0.06;   // the ground sits ~6 cm above y0
  for (let k = 0; k <= st; k++) {
    const d = (k / st) * L;
    const e = sstep(0, endL, Math.min(d, L - d)), ee = Math.pow(e, 0.7);
    // +-40 % over 1-2 m
    const hv = 0.62 + 0.8 * vnoise(d * 0.7, seed) * (0.6 + 0.4 * vnoise(d * 0.23, seed + 4));
    // (o.pushes: a long street bank is pushes of the plough, 3-8 m, each its own height, +-50 %)
    const hp = o.pushes ? 0.5 + 1.0 * sstep(0.2, 0.8, vnoise(d * 0.19, seed + 33)) : 1;
    const hh = h * hv * hp * ee;
    // ragged in plan at the ends (the last pushes of the blade)
    const ww = w * (0.78 + 0.4 * vnoise(d * 0.45, seed + 7)) * (0.3 + 0.7 * e);
    const off = (vnoise(d * 0.21, seed + 3) - 0.5) * w * 0.25 + (1 - e) * (vnoise(d * 3.1, seed + 17) - 0.5) * w * 0.4;
    const ring = [];
    for (let p = 0; p < P; p++) {
      const [a, s, b] = prof[p];
      const inner = p > 0 && p < P - 1;
      // lumps at 0.3-0.6 m: height and sideways, so no face is a smooth tube
      const lump = inner ? 0.7 + 0.42 * vnoise2(d * 2.2, p * 0.9, seed + 5) + 0.22 * vnoise2(d * 4.6, p * 1.7, seed + 6) : 1;
      const lat = a * ww + s * (0.6 + 0.8 * vnoise(d * 0.9 + p, seed + 13)) + off + (inner ? (vnoise2(d * 2.6, p, seed) - 0.5) * Math.max(0.16, w * 0.3) * (0.5 + 0.5 * e) : 0);
      const y = b < 0 ? y0 + gl * 0.3 : y0 + gl + b * hh * lump + (inner && b > 0.3 ? (vnoise2(d * 3.4, p * 2.1, seed + 8) - 0.5) * 0.1 * ee : 0) - (p === 1 || p === P - 2 ? gl * (1 - vnoise(d * 1.3 + p, seed + 21) * 1.6) : 0);
      ring.push([x0 + ax * d + nx * lat, y, z0 + az * d + nz * lat]);
    }
    rings.push(ring);
  }
  const mid = Math.floor(P / 2);
  const g = loft(rings, { inside: (i) => { const k = Math.floor(i / P), r = rings[Math.min(k, rings.length - 1)][mid]; return [r[0], y0 - 5, r[2]]; } });
  G.use('snow').add(g, o.color ?? 0xe8eaec, null);
  sst(o.coarse ? 'bankStreet' : 'bank', G);
  addGround('snow', (x0 + x1) / 2, (z0 + z1) / 2, L, w * 0.8, Math.atan2(-az, ax), 1);
  if (o.grit !== false) gritShade(G, y0 + 0.02, h, (x, z) => (ds ? ((x - x0) * nx + (z - z0) * nz) * ds - w * 0.15 : -1), seed, Math.min(0.4, h * 0.9));
  // A few lumps on the crest, half sunk (o.rubble per metre).
  const rub = o.rubble ?? 0.3;
  if (rub > 0) {
    const rr = mulberry32(seed * 31 + 5), nr = Math.floor(L * rub);
    for (let k = 0; k < nr; k++) {
      const d = endL + rr() * (L - 2 * endL), hv = 0.62 + 0.8 * vnoise(d * 0.7, seed) * (0.6 + 0.4 * vnoise(d * 0.23, seed + 4));
      const sz = Math.min(0.28, h * (0.5 + rr() * 0.5));
      const lat = (rr() - 0.5) * w * 0.5 + (vnoise(d * 0.21, seed + 3) - 0.5) * w * 0.25;
      const hp = o.pushes ? 0.5 + 1.0 * sstep(0.2, 0.8, vnoise(d * 0.19, seed + 33)) : 1;
      const y = y0 + 0.06 + h * hv * hp * (1 - 2.2 * (lat / w) ** 2) - sz * 0.25;
      const gg = 0.82 + rr() * 0.12;
      G.use('snow').add(chunkGeo(Math.floor(rr() * 8), true), new THREE.Color(0.92 * gg, 0.92 * gg, 0.91 * gg).getHex(), mat(x0 + ax * d + nx * lat, y, z0 + az * d + nz * lat, (rr() - 0.5) * 0.5, rr() * TAU, (rr() - 0.5) * 0.5, sz, sz * (0.6 + rr() * 0.3), sz * (0.8 + rr() * 0.4)));
      sst('rubble', G);
    }
  }
  // A lump or two at the foot on the asphalt side.
  if (o.chunks !== false) {
    const rr = mulberry32(seed * 13 + 7), nc = Math.min(3, Math.floor(L / 5 + rr()));
    for (let k = 0; k < nc; k++) {
      const d = (k + rr()) * (L / Math.max(1, nc)), lat = (ds || (rr() < 0.5 ? 1 : -1)) * w * (0.5 + rr() * 0.2);
      chunks(G, x0 + ax * d + nx * lat, z0 + az * d + nz * lat, 1, Math.min(0.2, h * 0.6), 0.1, y0 + 0.06, rr, 0.75, !!o.coarse);
    }
  }
}

// A thin, ragged rim of trodden snow where a snowy lawn meets a hard surface (walkway, path),
// along x0,z0 -> x1,z1: it starts just on the lawn side and reaches 5-45 cm out over the hard
// surface with a noisy, jagged edge, so the boundary is never a ruled line. side: +1 / -1, the
// hard surface's side along the left normal (-dz, dx). y = the hard surface's top.
export function snowFringe(G, x0, z0, x1, z1, side = 1, y = CURB + 0.03, seed = 1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.3) return;
  const ax = (x1 - x0) / L, az = (z1 - z0) / L, nx = -az * side, nz = ax * side;
  const n = Math.max(2, Math.ceil(L / 0.24)), reach = o.reach ?? 0.35;
  const pos = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * L, e = sstep(0, Math.min(0.45, L / 3), Math.min(d, L - d));
    const w = (0.05 + reach * (0.35 * vnoise(d * 1.6, seed) + 0.45 * vnoise(d * 4.1, seed + 3) + 0.2 * hash(k, seed))) * e;
    const bx = x0 + ax * d, bz = z0 + az * d;
    pos.push(bx - nx * 0.06, y + 0.012, bz - nz * 0.06);                       // on the lawn side
    pos.push(bx + nx * w * 0.45, y + 0.012 + 0.012 * vnoise(d * 3, seed + 9), bz + nz * w * 0.45);
    pos.push(bx + nx * w, y + 0.004, bz + nz * w);                              // the ragged edge
  }
  for (let k = 0; k < n; k++) for (let c = 0; c < 2; c++) { const a = k * 3 + c, b = a + 1, cc = a + 3, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let up = 0; for (let i = 0; i < g.attributes.normal.count; i++) up += g.attributes.normal.getY(i);
  if (up < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  G.use('snow').add(g, o.color ?? 0xdcdee0, null);
  sst('fringe', G);
}

// A plowed pile (lot corners, junctions): low and wide (height ~0.45 x radius), built from a
// welded icosphere: a few big lumps, broken into chunks (each Voronoi cell of ~0.3 m on the
// surface pushed in or out by a few cm), one or two steep plough-cut faces on its `face` side,
// grey-brown grit at the foot and on that side, loose chunks around it. Solid unless solid = false.
const pileGeos = [];
function pileGeo(v, lod = 3) {
  const key = v * 10 + lod;
  if (pileGeos[key]) return pileGeos[key];
  let g = new THREE.IcosahedronGeometry(1, lod);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const rr = mulberry32(900 + v * 31);
  const lumps = [];
  const nl = 3 + Math.floor(rr() * 3);
  for (let k = 0; k < nl; k++) { const a = rr() * TAU; lumps.push([Math.cos(a), Math.sin(a), 0.2 + rr() * 0.3]); }
  // Chunk cells: random points on the sphere, each with its own push (+-7 % of the radius).
  const seeds = [];
  for (let k = 0; k < (lod >= 3 ? 55 : 30); k++) {
    let x = rr() * 2 - 1, y = rr() * 2 - 1, z = rr() * 2 - 1; const l = Math.hypot(x, y, z) || 1;
    seeds.push([x / l, y / l, z / l, (rr() - 0.5) * 0.24]);
  }
  // Plough cuts on the +x side (the face side): one or two near-vertical planes.
  const cuts = [[1, 0, 0.6 + rr() * 0.15]];
  if (rr() < 0.6) { const a = (rr() < 0.5 ? -1 : 1) * (0.7 + rr() * 0.5); cuts.push([Math.cos(a), Math.sin(a), 0.68 + rr() * 0.12]); }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let bump = 0;
    for (const [lx, lz, s] of lumps) { const d = x * lx + z * lz; bump += s * Math.max(0, d) ** 3; }
    let best = -2, push = 0;
    for (const [sx, sy, sz, o] of seeds) { const d = x * sx + y * sy + z * sz; if (d > best) { best = d; push = o; } }
    // big lumps, then the blade's broken chunks at 0.3-0.6 m (template ~1 = 2 m), then crumbs
    const n = (vnoise3(x * 1.3, y * 1.3, z * 1.3, v) - 0.5) * 0.36 + (vnoise3(x * 3.1, y * 3.1, z * 3.1, v + 7) - 0.5) * 0.16 + (vnoise3(x * 6.5, y * 6.5, z * 6.5, v + 9) - 0.5) * 0.09;
    const r = 1 + n + bump * 0.5 + push;
    x *= r; z *= r; y *= r;
    // Low and flat-bottomed, with a flattened, broken top.
    y = y < 0 ? y * 0.1 : Math.min(y * (0.5 + 0.18 * vnoise3(x, 3.3, z, v + 3)), 0.5 + 0.1 * vnoise3(x * 2, 1.1, z * 2, v + 4) + push * 0.6);
    for (const [cx, cz, d] of cuts) { const sd = x * cx + z * cz - d; if (sd > 0) { x -= cx * sd * 0.9; z -= cz * sd * 0.9; } }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  // Normalise: radius 1.45, height 0.95 (snowPile scales by r / 1.45 and h / 0.95).
  g.computeBoundingBox();
  const bb = g.boundingBox, sx = 1.45 / Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z), sy = 0.95 / bb.max.y;
  g.scale(sx, sy, sx);
  return (pileGeos[key] = g);
}
// face: direction (radians, world, as atan2(dx, dz) of the way it faces) of the plough-cut, gritty
// side (the street / aisle it was pushed from); random if omitted.
export function snowPile(G, x, z, r = 2, h = 1.2, solid = true, rr = rnd, y0 = CURB, lod = 3, face) {
  G.use('snow');
  h = Math.min(h, r * 0.42);
  const v = Math.floor(rr() * 6);
  const fa = face ?? rr() * TAU, fx = Math.sin(fa), fz = Math.cos(fa);
  // The template's cut side is its +x: turn it to face (fx, fz). (local +x -> (cos y, -sin y))
  const yaw = Math.atan2(-fz, fx);
  const sz = r / 1.45 * (0.8 + rr() * 0.3);
  sst('pile', { parts: [pileGeo(v, lod)] });
  G.add(pileGeo(v, lod), 0xe2e4e6, mat(x, y0 - 0.06, z, 0, yaw, 0, r / 1.45, h / 0.95, sz));
  const sd = Math.floor(rr() * 999);
  // grit at the foot and a spray band on the plough-cut side
  gritShade(G, y0 - 0.04, h, (px, pz) => ((px - x) * fx + (pz - z) * fz) / r - 0.45, sd, Math.min(0.5, h * 0.45));
  // Loose lumps the blade broke off: a few, rounded, half sunk, at the cut side and behind.
  chunks(G, x + fx * r * 0.95, z + fz * r * 0.95, 1 + Math.floor(rr() * 2), Math.min(0.32, h * 0.3), r * 0.4, y0, rr, 0.78);
  if (rr() < 0.6) chunks(G, x - fx * r * 0.85, z - fz * r * 0.85, 1 + Math.floor(rr() * 2), Math.min(0.26, h * 0.25), r * 0.4, y0, rr, 0.85);
  if (solid) circle(x, z, r * 0.75, y0 + h * 0.8, 'snowpile');
  addGroundCircle('snow', x, z, r * 0.9, 1);
}

// ---------------------------------------------------------------------------------------------
// Trees and plants. Every kind is built a few times as a template (in the tree's own frame, foot at
// the origin, with its own seeded randomness); a placed tree is a rotated / scaled copy of one
// template merged into the caller's builder (same draw calls as before, a fraction of the build
// time), plus its see-through cards (signs.js) placed in world space. Each adds a trunk collider
// unless collide = false. Kinds: birch, spruce, pine, lime (= bare), small, thuja; `lite` gives a
// cheaper template for far trees (forest belt).

let LITE = false, SMALL = false, TPL_ON = false;
let SINK = null;   // while a template is built: collects its cards instead of placing them
function card(face, x, y, z, w, h, yaw, up) { if (SINK) SINK.push([face, x, y, z, w, h, yaw, up]); else addCard(face, x, y, z, w, h, yaw, up); }
// A card of any orientation (centre c, half-extents r, u), both faces.
function quadCard(face, c, r, u) { if (SINK) SINK.push(['quad', face, c, r, u]); else addQuad(face, c, r, u); }
export const treeStats = {};
const NV = { birch: 8, birchL: 4, spruce: 8, spruceS: 5, spruceL: 5, pine: 6, pineL: 3, lime: 6, limeL: 3, small: 6, thuja: 5 };
const GEN = { birch: (...a) => birch(...a), spruce: (...a) => spruce(...a), pine: (...a) => pine(...a), lime: (...a) => bareTree(...a), small: (...a) => smallTree(...a), thuja: (...a) => thuja(...a) };
const TPL = {};
function templateOf(kind, v) {
  const key = kind + ':' + v;
  if (TPL[key]) return TPL[key];
  const lite = kind.endsWith('L'), small = kind.endsWith('S'), base = lite || small ? kind.slice(0, -1) : kind;
  const T = new GeoBuilder();
  const r = mulberry32(7919 * (v + 1) + base.charCodeAt(0) * 104729 + base.length * 131 + (lite ? 17 : 0));
  SINK = []; LITE = lite; SMALL = small; TPL_ON = true;
  const meta = GEN[base](T, 0, 0, 1, r, 0) || null;
  const cards = SINK; SINK = null; LITE = SMALL = TPL_ON = false;
  const by = new Map();
  for (const p of T.parts) { const k = p._surface + (p._fine ? '|fine' : ''); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const parts = [...by].map(([k, l]) => [k.split('|')[0], l.length === 1 ? l[0] : mergeGeometries(l, false), k.endsWith('|fine')]);
  const tris = parts.reduce((n, [, g]) => n + g.index.count / 3, 0);
  return (TPL[key] = { parts, cards, tris, meta });
}
// A rotated (rot about y), scaled (s across, sy up) and slightly tilted copy of template T at
// (x, y, z): new positions and normals, the colour / triplanar attributes and the index shared.
// Thin branches and twigs (round 5) go to G.fineG when the builder has one (town.js gives every
// block builder a 'twigs' builder: no shadow, no AO pre-pass): sub-texel in the shadow maps anyway,
// they were most of a birch's or lime's triangles in both cascades and the AO pass.
const _nm = new THREE.Matrix3();
function placeTemplate(G, T, x, y, z, rot, s, sy, tx = 0, tz = 0) {
  const m = mat(x, y, z, tx, rot, tz, s, sy, s), e = m.elements;
  const q = _nm.getNormalMatrix(m).elements;
  for (const [surf, geo, fine] of T.parts) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array;
    const p2 = new Float32Array(P.length), n2 = new Float32Array(N.length);
    for (let i = 0; i < P.length; i += 3) {
      const a = P[i], b = P[i + 1], c = P[i + 2];
      p2[i] = e[0] * a + e[4] * b + e[8] * c + e[12];
      p2[i + 1] = e[1] * a + e[5] * b + e[9] * c + e[13];
      p2[i + 2] = e[2] * a + e[6] * b + e[10] * c + e[14];
      const u = N[i], v = N[i + 1], w = N[i + 2];
      const nx = q[0] * u + q[3] * v + q[6] * w, ny = q[1] * u + q[4] * v + q[7] * w, nz = q[2] * u + q[5] * v + q[8] * w;
      const l = Math.hypot(nx, ny, nz) || 1;
      n2[i] = nx / l; n2[i + 1] = ny / l; n2[i + 2] = nz / l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n2, 3));
    for (const k of ['color', 'tri', 'trin']) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(geo.index);
    g._surface = surf;
    (fine && G.fineG ? G.fineG : G).parts.push(g);
  }
  // (a builder that is thrown away - G.noCards: a tree kept out of a forest track - places no cards
  // either: they live in the sign pages, not in G)
  if (G.noCards) return;
  const c = Math.cos(rot), sn = Math.sin(rot);
  for (const cd of T.cards) {
    if (cd[0] === 'top') { const q = cd[1]; addTopCard({ f: q.f, c: [x + (q.c[0] * c + q.c[2] * sn) * s, y + q.c[1] * sy, z + (-q.c[0] * sn + q.c[2] * c) * s], d: q.d * s, a: q.a + rot }); continue; }
    if (cd[0] === 'quad') {
      const V = (v) => [(v[0] * c + v[2] * sn) * s, v[1] * sy, (-v[0] * sn + v[2] * c) * s], cc = V(cd[2]);
      addQuad(cd[1], [x + cc[0], y + cc[1], z + cc[2]], V(cd[3]), V(cd[4]));
      continue;
    }
    const [f, cx, cy, cz, w, h, yaw, up] = cd;
    addCard(f, x + (cx * c + cz * sn) * s, y + cy * sy, z + (-cx * sn + cz * c) * s, w * s, h * sy, yaw + rot, up);
  }
}

export function tree(G, x, z, s = 1, kind = 'birch', r = rnd, collide = true, y0 = CURB, lite = false) {
  if (kind === 'bare') kind = 'lime';
  // Small spruces (undergrowth, garden) get a template with fewer, wider-spaced whorls (scaled
  // down they end up at the normal spacing); far trees the lite one.
  const k = lite && NV[kind + 'L'] ? kind + 'L' : kind === 'spruce' && s < 0.6 ? 'spruceS' : kind;
  treeStats[k] = (treeStats[k] || 0) + 1;
  const T = templateOf(k, Math.floor(r() * NV[k]));
  treeStats[k + 'Tris'] = (treeStats[k + 'Tris'] || 0) + T.tris;
  const rot = r() * TAU, hs = 0.92 + r() * 0.16;
  // A slight lean (birches and pines lean more than spruces).
  const ln = kind === 'spruce' || kind === 'thuja' ? 0.025 : 0.05;
  placeTemplate(G, T, x, y0, z, rot, s, s * hs, (r() - 0.5) * ln, (r() - 0.5) * ln);
  // The trunk collider carries the crown (round 5, for the camera): crownR = the crown's radius
  // round the stem (outermost branch tips / twig cards), crownBottom / crownTop = world heights of
  // its lowest hanging twigs or branch tips and of the top.
  if (collide) {
    const b = circle(x, z, kind === 'small' || kind === 'thuja' ? 0.25 * s : 0.3 * s, 99, 'tree'), m = T.meta;
    b.species = kind;   // 'spruce' and 'thuja' crowns are dense; birch, lime, pine and garden trees see-through
    if (m && m.crownR) { b.crownR = m.crownR * s; b.crownBottom = y0 + m.crownBottom * s * hs; b.crownTop = y0 + m.H * s * hs; }
  }
  // What was placed (template metadata in template units, e.g. a spruce's H, R0, base, top).
  return { meta: T.meta, s, sy: s * hs };
}

// A branch as a chain of tapered limbs that arches: starts at (x, y, z) heading azimuth az,
// elevation el; each of the n segments turns down by `bend` (rad). Returns the joint points.
// base ({ surf, color }): the first segment in another bark (a birch limb is white at its base and
// twig-brown beyond), the rest in thin-snowed 'bark'; with a base the droop also accelerates towards
// the tip and the segments lose sides as they thin.
function arch(G, x, y, z, az, el, len, n, r0, r1, bend, color, sides, base) {
  const pts = [[x, y, z]];
  const ca = Math.cos(az), sa = Math.sin(az);
  for (let q = 0; q < n; q++) {
    const e = base ? el - bend * q * (1 + 0.15 * q) : el - q * bend, l = len / n;
    const ex = x + ca * Math.cos(e) * l, ey = y + Math.sin(e) * l, ez = z + sa * Math.cos(e) * l;
    const ra = r0 + (r1 - r0) * (q / n), rb = r0 + (r1 - r0) * ((q + 1) / n);
    if (base) G.use(q === 0 ? base.surf : 'bark', { snow: q === 0 ? 0.35 : 0.12 });
    limb(G, x, y, z, ex, ey, ez, ra, rb, base && q === 0 ? base.color : color, base ? Math.max(3, sides - q) : sides);
    x = ex; y = ey; z = ez;
    pts.push([x, y, z]);
  }
  return pts;
}
const LIMB_C = 0x4c3634, BIRCH_BASE = { surf: 'birch', color: 0xd2cec2 };
const along = (pts, f) => {
  const t = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(t)), u = t - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * u];
};

// Winter birch (vårtbjörk): chalk-white stem with a dark foot, a tall oval crown of thin limbs that
// rise, arch over and droop, side branches, curtains of fine hanging twigs (small see-through cards
// along the outer half of every limb, crisp close up, plus a few real twigs), and crossed crown
// cards for the fine haze a birch crown is from further away.
function birch(G, x, z, s, r, y0 = CURB) {
  const y = y0, H = (10.5 + r() * 5) * s;
  const la = r() * TAU, lean = (r() - 0.5) * 0.06 * H;
  const tx = x + Math.cos(la) * lean, tz = z + Math.sin(la) * lean;
  const ca = r() * TAU, cm = (r() - 0.5) * 0.05 * H;
  const at = (t) => { const b = Math.sin(t * Math.PI) * cm; return [x + (tx - x) * t + Math.cos(ca) * b, y + H * t, z + (tz - z) * t + Math.sin(ca) * b]; };
  G.use('bark');
  limb(G, x, y - 0.1, z, ...at(0.09), 0.2 * s, 0.165 * s, 0x34302e, 7);
  G.use('birch');
  limb(G, ...at(0.085), ...at(0.5), 0.165 * s, 0.1 * s, 0xdcd8cc, LITE ? 6 : 8);
  limb(G, ...at(0.495), ...at(0.8), 0.1 * s, 0.045 * s, 0xdcd8cc, LITE ? 5 : 7);
  // (the top of the stem is thin and twiggy: grey-brown, not chalk white)
  G.use('bark', { snow: 0.2 });
  limb(G, ...at(0.795), ...at(0.97), 0.045 * s, 0.012 * s, 0x5a4644, LITE ? 4 : 5);
  const nb = LITE ? 8 : 15 + Math.floor(r() * 6);
  let crownR = 1.5 * s, lowY = y + H * 0.27;
  for (let k = 0; k < nb; k++) {
    const t = 0.3 + (k / nb) * 0.62 + r() * 0.03;
    const [bx, by, bz] = at(t);
    const az = k * 2.39996 + r() * 0.6;
    const el = 0.62 + (t - 0.3) * 1.1 + (r() - 0.5) * 0.25;
    const len = (0.24 + r() * 0.1) * H * (1.1 - (t - 0.3) * 1.15);
    // A limb rises, arches over and droops, tapering to a ~1 cm tip: white bark at its base (the
    // first segment), purple-brown twig bark beyond (a thin line of snow on top at most).
    const nseg = LITE ? 2 : 4, bend = (0.36 + 0.3 * (1 - t)) * (LITE ? 1.4 : 0.75);
    const pts = arch(G, bx, by, bz, az, el, len, nseg, 0.05 * s * (1.15 - t * 0.6), 0.005 * s, bend, LIMB_C, LITE ? 3 : 5, BIRCH_BASE);
    const tip = pts[pts.length - 1];
    crownR = Math.max(crownR, Math.hypot(tip[0] - bx, tip[2] - bz) + 0.4);
    lowY = Math.min(lowY, tip[1]);
    if (LITE) continue;
    // Side branches off the limb, arching out and down.
    {
      const [px, py, pz] = along(pts, 0.35 + r() * 0.45);
      arch(G, px, py, pz, az + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), 0.25 + r() * 0.3, len * (0.3 + r() * 0.2), 2, 0.013 * s, 0.003 * s, 0.45, LIMB_C, 3);
    }
    // A real hanging twig on every other limb (thin: a few mm; the cards carry the curtain).
    if (k % 2 === 0) {
      const [px, py, pz] = along(pts, 0.5 + r() * 0.5);
      const a2 = az + (r() - 0.5) * 1.2, dl = (0.5 + r() * 0.9) * s;
      limb(G, px, py, pz, px + Math.cos(a2) * dl * 0.18, py - dl, pz + Math.sin(a2) * dl * 0.18, 0.005 * s, 0.002 * s, LIMB_C, 3);
    }
    // Curtains of fine hanging twigs: short see-through cards hanging from the outer half of the
    // limb every ~0.6 m, alternately along and across it (never merging into bars).
    const L = len * 0.55, nh = Math.max(1, Math.round(L / (0.6 * s)));
    for (let q = 0; q < nh; q++) {
      const [px, py, pz] = along(pts, 0.45 + (q + 0.2 + r() * 0.6) / nh * 0.55);
      const w = (0.35 + r() * 0.25) * s, h = (0.5 + r() * 0.4) * s * (1.1 - t * 0.3);
      const side = (q % 2 ? 1 : -1) * 0.12 * s;
      lowY = Math.min(lowY, py - h * 0.95);
      card(twigFace('birchhang', Math.floor(r() * 4)), px - Math.sin(az) * side, py - h * 0.45, pz + Math.cos(az) * side, w, h, -az + Math.PI / 2 + (q % 2 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.5, 0.3);
    }
  }
  // Twig haze: crossed cards around the stem, covering the crown.
  const [cx, , cz] = at(0.62);
  const base = y + H * 0.27, top = y + H * 1.02;
  const face = twigFace('birch', Math.floor(r() * 4));
  const nc = LITE ? 2 : 4 + Math.floor(r() * 2), a0 = r() * Math.PI;
  for (let c = 0; c < nc; c++) card(face, cx, (base + top) / 2, cz, 2 * crownR * 1.08, top - base, a0 + (c / nc) * Math.PI, 0.95);
  topCard(cx, base + (top - base) * 0.62, cz, crownR * 1.7, r);
  return { H, crownR: crownR * 1.08, crownBottom: Math.max(0, lowY - y) };
}
// A horizontal crown card (seen from above).
function topCard(x, y, z, d, r) {
  const f = twigFace('crowntop', Math.floor(r() * 3));
  const q = { f, c: [x, y, z], d, a: r() * TAU };
  if (SINK) SINK.push(['top', q]); else addTopCard(q);
}
// (only its upper face: the shader shows it from well above only; from below it was a floating plank)
function addTopCard(q) { addDecal(q.f, q.c[0], q.c[1], q.c[2], q.d, q.d, q.a); }

// Norway spruce (gran). Near trees (full and small templates): a straight stem inside a dark,
// tiered inner mass (the shadowed, needle-filled inside of the crown: wide at the foot of every
// tier, narrowing up to the next whorl; it casts the tree's shadow and no pole or sky ever shows
// through), and whorls of branches every ~0.6 m, each branch a see-through card seen from the side
// (pendulous needled combs hanging from a drooping branch: the Norway spruce's curtains) plus one
// across its tip, so the outline is ragged at every scale; snow lies along the top of some branches
// as thin white streaks. Far trees (lite, forest belt): the inner cone and drooping lobed skirts that
// overlap (cheap, no cards). Dark blue-black green 'foliage', a fine needle grain.
const SPRUCE_C = [0x26342a, 0x2a382c, 0x243128, 0x2c3a2e];
function spruce(G, x, z, s, r, y0 = CURB) {
  const y = y0, H = (9 + r() * 8) * s, R0 = H * (0.19 + r() * 0.05);
  const lite = LITE, small = SMALL;
  const base = y + (0.3 + r() * 0.9) * s, top = y + H - 0.85 * s;
  G.use('bark');
  limb(G, x, y - 0.1, z, x, base + 1.0 * s, z, 0.2 * s, 0.15 * s, 0x4a3a2e, lite ? 5 : 6);   // only the foot shows
  const col = pickR(SPRUCE_C, r);
  const Rt = (t) => R0 * Math.pow(1 - t, 0.92) + 0.2 * s;
  // Asymmetry: the crown is a little fuller on one side.
  const fa = r() * TAU, fk = 0.08 + r() * 0.1;
  let crown = null;
  {
    const sp = (lite ? 1.15 : small ? 1.0 : 0.7) * s, n = Math.max(lite || small ? 5 : 10, Math.round((top - base) / sp));
    const W = [];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      W.push({ t, cy: base + t * (top - base) + (r() - 0.5) * sp * 0.25, R: Rt(t) * (0.9 + r() * 0.2) });
    }
    // The tiered inner mass: per whorl a ring wide just above the next whorl down (the foot of
    // the tier, where the combs hang) and a narrow one at the whorl's own branch base.
    const S = lite ? 8 : small ? 12 : 16, rings = [], ph = r() * TAU;
    // (every ring lobed: some sides reach out, some fall back; the wide rings' points also hang at
    // their own heights, a jagged rim of drooping branch tips: a tier is no lampshade. Round 5: the
    // wide rings are star-shaped, every other point a long, low branch tip, so each tier is pleated
    // into ridges and its rim zig-zags)
    const ring = (yy, rc, k, lob, jy = 0) => { const q = []; for (let j = 0; j < S; j++) { const a = (j / S) * TAU + (hash(j + k * 7, 5 + ph) - 0.5) * (TAU / S) * 0.6, h1 = hash(j + k * 13, 71 + ph), st = jy > 0 ? (j % 2 ? 0.78 : 1.18) : 1, rr = rc * st * (1 - lob + 2 * lob * h1) * (1 + fk * Math.cos(a - fa)); q.push([x + Math.cos(a) * rr, yy - jy * (h1 - 0.3) - (jy > 0 && j % 2 === 0 ? jy * 0.6 : 0), z + Math.sin(a) * rr]); } rings.push(q); };
    ring(base - 0.35 * s, 0.5 * W[0].R, 0, 0.3);
    for (let k = 0; k < n; k++) {
      const w = W[k], below = k > 0 ? W[k - 1].cy : base - 0.5 * s;
      // (round 5: near trees' mass is slimmer, a dark core; the branches' frond cards make the tiers)
      // (phase 4 r2: near trees' wide rings droop a third further and are a little wider up the crown,
      // where the small tiers stood apart: a pagoda against the light)
      // (phase 4 r2b: the droop is a fixed 0.33 s, so up the crown, where a tier is only ~0.3 m across,
      // its pleated rim hung like a pagoda's eaves: there it shrinks with the tier)
      if (k > 0) ring(below - (lite ? 0 : 0.1) * s, (lite ? 0.66 : 0.44 + 0.14 * w.t) * w.R, k * 2, 0.34, (lite ? 0.25 : 0.33 * (1 - 0.7 * sstep(0.45, 0.95, w.t))) * s);
      // (phase 4 r2: near trees' waists widen up the crown, so the small upper tiers merge into a cone)
      ring(w.cy + 0.04 * s, (lite ? 0.26 : 0.26 + 0.3 * w.t * w.t) * w.R + 0.06 * s, k * 2 + 1, 0.15);
    }
    ring(top + 0.5 * s, 0.05 * s, 99, 0);
    G.use('spruce', { snow: lite ? 0.8 : 0.35 }).add(ringLoft(rings), col, null);
    fineTex(G, 9);
    shadeLast(G, (px, py, pz) => (lite ? 0.4 : 0.32) + 0.15 * vnoise3(px * 2.1, py * 2.1, pz * 2.1, 5));
    // Branches: a side-view card each (skewed to the branch's droop), near trees one across the
    // tip too, and a short white streak of snow on the flatter inner part of some.
    const pSnowK = 0;
    const snowP = [], snowI = [];
    // (phase 4 r2) Snow on the branch / frond cards: near trees by the tree's own snowiness and the
    // tier's height (the upper, outer branches catch it; many carry none), not a quarter / half of
    // all cards at random; the forest belt (lite) as before.
    const snowy = lite ? 0 : 0.35 + 0.65 * r();
    const snowVar = (t, dflt) => (lite ? dflt() : r() < snowy * (0.18 + 0.5 * t) ? 2 + Math.floor(r() * 2) : Math.floor(r() * 2));
    let maxR = 0.5 * s, lowY = base;
    for (let k = 0; k < n; k++) {
      const { t, cy, R } = W[k];
      const nb = lite ? 3 + (r() < 0.5 ? 1 : 0) : Math.max(3, Math.round((small ? 3 : 4) + (small ? 2 : 3.5) * Math.min(1, R / (R0 * 0.8)) + (r() - 0.5) * 1.5));
      const a0 = r() * TAU;
      for (let b = 0; b < nb; b++) {
        const a = a0 + (b / nb) * TAU + (r() - 0.5) * (TAU / nb) * 0.5;
        // (phase 4 r2: near trees' upper branches rise instead of drooping, as a spruce's do: flat
        // plates of fronds up the crown were a pagoda against the light)
        // (phase 4 r2b: up the crown the branches reach a little further past the inner mass and their
        // combs hang longer, so the top third's outline is needles rather than the mass's tiers)
        const up = lite ? 0 : sstep(0.45, 0.9, t);
        const Rj = R * (0.75 + r() * 0.3) * (1 + fk * Math.cos(a - fa)) * (1 + 0.35 * up), dl = 0.36 + 0.22 * (1 - t) + r() * 0.12 - (lite ? 0 : 0.85 * sstep(0.5, 1, t));
        const ca = Math.cos(a), sa = Math.sin(a);
        const rho0 = 0.4 * Rj, rho1 = 1.04 * Rj;
        const yAt = (rho) => cy + 0.03 - Math.tan(dl) * rho * (0.55 + 0.45 * rho / Rj);
        const h = ((0.5 + 0.28 * r()) * s * (0.6 + 0.6 * (1 - t)) + 0.1 * Rj) * (lite ? 1.25 : 1 + 0.6 * up);
        // the side card: its top edge 0.13 h above the branch line
        const P0 = [x + ca * rho0, yAt(rho0), z + sa * rho0], P1 = [x + ca * rho1, yAt(rho1), z + sa * rho1];
        const cx = (P0[0] + P1[0]) / 2, cyc = (P0[1] + P1[1]) / 2 + 0.13 * h - h / 2, cz = (P0[2] + P1[2]) / 2;
        maxR = Math.max(maxR, rho1); lowY = Math.min(lowY, cyc - h / 2);
        // (snow on some: see snowVar)
        quadCard(twigFace('sprucebranch', snowVar(t, () => (r() < 0.75 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)))), [cx, cyc, cz], [(P1[0] - P0[0]) / 2, (P1[1] - P0[1]) / 2, (P1[2] - P0[2]) / 2], [0, h / 2, 0]);
        // across the tip
        if (!lite && Rj > 0.5 * s && t < 0.6 && r() < 0.8) {
          const tw = Math.min(1.1 * s, 2 * Rj * Math.sin(Math.PI / nb) * 0.75 + 0.2 * s), th = h * 0.85, ty = yAt(Rj * 0.98);
          quadCard(twigFace('sprucetuft', snowVar(t, () => Math.floor(r() * 4))), [x + ca * Rj * 0.98, ty + 0.14 * th - th / 2, z + sa * Rj * 0.98], [-sa * tw / 2, 0, ca * tw / 2], [0, th / 2, 0]);
        }
        // (round 5) the branch seen from above: a frond card lying on it from near the stem to just
        // past the tip (needled shoots, first snow on some), so up close a tier's upper face is
        // needled branches with gaps between them, not the inner mass's smooth lampshade
        {
          const rA = 0.2 * Rj, rB = 1.08 * Rj, A = [x + ca * rA, yAt(rA) + 0.035, z + sa * rA], B = [x + ca * rB, yAt(rB) + 0.015, z + sa * rB];
          const hw = Math.min((lite ? 0.6 : 0.75) * s, Rj * Math.sin(Math.PI / nb) * (lite ? 0.95 : 1.2) + 0.1 * s);
          quadCard(twigFace('sprucefrond', snowVar(t, () => Math.floor(r() * 4))), [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], [(B[0] - A[0]) / 2, (B[1] - A[1]) / 2, (B[2] - A[2]) / 2], [-sa * hw, 0, ca * hw]);
        }
        // snow on the flatter inner half of the branch
        if (r() < pSnowK * (0.5 + 0.7 * (1 - t))) {
          const f0 = 0.22 + r() * 0.12, f1 = Math.min(0.62, f0 + 0.18 + r() * 0.18), wv = (0.07 + r() * 0.06) * (0.7 + 0.5 * (1 - t)) * s;
          const b0 = snowP.length / 3, NA = 4;
          for (let q = 0; q < NA; q++) {
            const f = f0 + (f1 - f0) * q / (NA - 1), rho = rho0 + (rho1 - rho0) * f, yy = yAt(rho) + 0.012, e = Math.sin((q / (NA - 1)) * Math.PI) * 0.7 + 0.3;
            for (const sd of [-1, 0, 1]) snowP.push(x + ca * rho - sa * wv * sd * e, yy + (sd === 0 ? 0.035 * e : -0.008), z + sa * rho + ca * wv * sd * e);
          }
          for (let q = 0; q < NA - 1; q++) for (let c = 0; c < 2; c++) { const A = b0 + q * 3 + c, B = A + 1, C = A + 3, D = C + 1; snowI.push(A, C, B, B, C, D); }
        }
      }
      // (phase 4 r2) under the whorl, at the stem: three crossed tuft cards hanging over the notch
      // between this tier's skirt and the tier below (against the light the tiers stood apart with the
      // sky between them: a pagoda)
      if (!lite && k > 0) {
        const tw = 0.95 * R, th = Math.min(0.75 * s, 0.85 * (cy - W[k - 1].cy) + 0.15 * s), a1 = r() * TAU;
        for (let q = 0; q < 3; q++) {
          const aq = a1 + q * Math.PI / 3, cq = Math.cos(aq), sq = Math.sin(aq);
          quadCard(twigFace('sprucetuft', Math.floor(r() * 2)), [x, cy - 0.06 * s - th * 0.42, z], [-sq * tw / 2, 0, cq * tw / 2], [0, th / 2, 0]);
        }
      }
    }
    if (snowI.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(snowP, 3));
      sg.setIndex(snowI);
      sg.computeVertexNormals();
      const nm = sg.attributes.normal;
      let up = 0; for (let i = 0; i < nm.count; i++) up += nm.getY(i);
      if (up < 0) { const ia = sg.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } sg.computeVertexNormals(); }
      G.use('snow').add(sg, 0xe8ebee, null);
    }
    crown = { crownR: maxR, crownBottom: Math.max(0, lowY - y) };
  }
  G.use('foliage', { snow: 1 });
  // The leader and the topmost shoots.
  G.add(PRIM.cone(6), col, mat(x, top + 0.75 * s, z, 0, 0, 0, 0.3 * s, 1.9 * s, 0.3 * s));
  fineTex(G, 9);
  G.use('bark');
  limb(G, x, top + 1.3 * s, z, x, y + H + 0.35 * s, z, 0.025 * s, 0.006 * s, 0x3a3428, 4);
  return { H, R0, base: base - y, top: top - y, R: Rt, ...crown };
}
// One whorl of a spruce: a closed, lobed skirt around the stem. Per spoke a profile from the stem
// (top) out to the drooping tip and back underneath. nl main branches make lobes (the long ones
// droop most); every spoke its own length (+-15 %), so the rim is ragged rather than a plate's
// straight edge. userData.shade: per-vertex darkening (inside and underneath are shadowed needles);
// userData.tips: [angle, radius, drop] of each main branch tip; userData.snow: thin caps of snow
// lying on the upper side of some main branches, following the branch surface.
function skirtGeo(R, droop, thick, S, nl, ph, r, lite, fa = 0, fk = 0, pSnow = 0, fronds = false) {
  const pos = [], shade = [], prof = lite ? 3 : 4;
  const jit = Array.from({ length: nl }, () => 0.75 + r() * 0.5);   // per main branch: length
  const dro = Array.from({ length: nl }, () => 0.85 + 0.3 * r());
  const spk = [], rs = 0.05 + R * 0.05;
  for (let j = 0; j < S; j++) {
    const a = (j / S) * TAU + (r() - 0.5) * (TAU / S) * 0.3;
    const u = ((a + ph) / TAU) * nl, bi = ((Math.round(u) % nl) + nl) % nl;
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(u * TAU), 1.3);
    const Rj = R * (0.5 + 0.5 * lobe * jit[bi]) * (0.85 + r() * 0.3) * (1 + fk * Math.cos(a - fa));
    const dj = Rj * Math.tan(droop) * (0.7 + 0.5 * lobe) * dro[bi];
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (rad, y, k) => { pos.push(ca * rad, y, sa * rad); shade.push(k); };
    const ym = -dj * 0.18 + 0.05 + r() * 0.05;
    P(rs, 0.04, 0.45);                                          // at the stem, on top
    if (!lite) P(Rj * 0.5, ym, 0.8);                            // the upper side, slightly arched
    P(Rj, -dj, 0.95 + 0.1 * lobe);                              // the drooping tip
    P(Rj * 0.45, -dj * 0.55 - thick, 0.38);                     // underneath
    spk.push([a, Rj, dj, ym]);
  }
  const idx = [];
  const V = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let j = 0; j < S; j++) {
    const j1 = (j + 1) % S;
    let cx = 0, cy = 0, cz = 0;
    for (let p = 0; p < prof; p++) { const v = V(j * prof + p); cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= prof; cy /= prof; cz /= prof;
    for (let p = 0; p < prof; p++) {
      const p1 = (p + 1) % prof;
      const A = j * prof + p, B = j * prof + p1, C = j1 * prof + p, D = j1 * prof + p1;
      for (const [u, v, w] of [[A, C, B], [B, C, D]]) {
        const a = V(u), b = V(v), c = V(w);
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const out = (a[0] - cx) * nx + (a[1] - cy) * ny + (a[2] - cz) * nz;
        if (out >= 0) idx.push(u, v, w); else idx.push(u, w, v);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shade = shade;
  // Main branch tips (for the needle sprays).
  g.userData.tips = [];
  for (let k = 0; k < nl; k++) {
    const a = (k / nl) * TAU - ph, Rj = R * (0.5 + 0.5 * jit[k]) * (1 + fk * Math.cos(a - fa));
    g.userData.tips.push([a, Rj * 0.97, Rj * Math.tan(droop) * 1.2 * dro[k] * 0.97]);
  }
  // a point on spoke j's upper side, rho 0 (stem) .. 1 (tip)
  const topAt = (j, rho) => {
    const [a, Rj, dj, ym] = spk[(j + S) % S];
    let rr, yy;
    if (lite) { rr = rs + (Rj - rs) * rho; yy = 0.04 + (-dj - 0.04) * rho; }
    else {
      const rm = (Rj * 0.5 - rs) / (Rj - rs);
      if (rho < rm) { const f = rho / rm; rr = rs + (Rj * 0.5 - rs) * f; yy = 0.04 + (ym - 0.04) * f; }
      else { const f = (rho - rm) / (1 - rm); rr = Rj * 0.5 + Rj * 0.5 * f; yy = ym + (-dj - ym) * f; }
    }
    return [Math.cos(a) * rr, yy, Math.sin(a) * rr];
  };
  // the spoke nearest main branch k
  const nearest = (k) => {
    const ak = (k / nl) * TAU - ph;
    let j0 = 0, best = 9;
    for (let j = 0; j < S; j++) { const d = Math.abs(((spk[j][0] - ak) % TAU + TAU + Math.PI) % TAU - Math.PI); if (d < best) { best = d; j0 = j; } }
    return j0;
  };
  // Needle fronds: [centre, r, u] of a card lying on each lobe from a fifth of the way out to a
  // little past the tip, as wide as the lobe.
  if (fronds) {
    g.userData.fronds = [];
    for (let k = 0; k < nl; k++) {
      const j0 = nearest(k), [a, Rj] = spk[j0];
      const B = topAt(j0, 0.2), T = topAt(j0, 1.0), ov = 1.14 + r() * 0.08;
      const E = [B[0] + (T[0] - B[0]) * ov, B[1] + (T[1] - B[1]) * ov, B[2] + (T[2] - B[2]) * ov];
      const hw = Math.min(Rj * Math.sin(Math.PI / nl) * 0.75, Rj * 0.42) * (0.9 + r() * 0.25), lift = 0.03 + R * 0.01;
      g.userData.fronds.push([[(B[0] + E[0]) / 2, (B[1] + E[1]) / 2 + lift, (B[2] + E[2]) / 2], [-Math.sin(a) * hw, 0, Math.cos(a) * hw], [(E[0] - B[0]) / 2, (E[1] - B[1]) / 2, (E[2] - B[2]) / 2]]);
    }
  }
  // Snow on the upper side of some main branches: a thin cap lying on the skirt (sampled from the
  // spokes either side of the branch), thickest along its middle, with a ragged edge; from a third
  // of the way out to short of the tip (first snow: not every branch, more low down).
  if (pSnow > 0) {
    const sp = [], si = [];
    for (let k = 0; k < nl; k++) {
      if (r() > pSnow) continue;
      const j0 = nearest(k);
      const rho0 = 0.3 + r() * 0.15, rho1 = Math.min(0.88, rho0 + 0.3 + r() * 0.25), wf = 0.3 + r() * 0.2, th = (0.02 + r() * 0.025);
      const NA = 4, NU = 5, b0 = sp.length / 3;
      for (let q = 0; q < NA; q++) {
        const rho = rho0 + (rho1 - rho0) * (q / (NA - 1)), endK = Math.sin((q / (NA - 1)) * Math.PI);
        for (let c = 0; c < NU; c++) {
          const u = (c / (NU - 1)) * 2 - 1, f = Math.abs(u) * wf * (0.75 + 0.5 * r()) * (0.6 + 0.4 * endK);
          const A = topAt(j0, rho), B = topAt(j0 + (u < 0 ? -1 : 1), rho);
          const lift = (fronds ? 0.04 + R * 0.01 : 0.012) + th * (1 - u * u) * (0.4 + 0.6 * endK);
          sp.push(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f + lift, A[2] + (B[2] - A[2]) * f);
        }
      }
      for (let q = 0; q < NA - 1; q++) for (let c = 0; c < NU - 1; c++) {
        const A = b0 + q * NU + c, B = A + 1, C = A + NU, D = C + 1;
        si.push(A, B, C, B, D, C);
      }
    }
    if (si.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sg.setIndex(si);
      sg.computeVertexNormals();
      // face up
      const nm = sg.attributes.normal;
      let up = 0; for (let i = 0; i < nm.count; i++) up += nm.getY(i);
      if (up < 0) { const ia = sg.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } sg.computeVertexNormals(); }
      g.userData.snow = sg;
    }
  }
  return g;
}

// Columnar thuja (tuja 'Brabant'): a narrow, lobed column with a blunt point, a little bronze in
// winter, snow caught in its outer twigs.
function thuja(G, x, z, s, r, y0 = CURB) {
  const H = (2.4 + r() * 0.6) * s, R = (0.5 + r() * 0.1) * s, S = 10, NR = 9;
  const rings = [];
  const ph = r() * TAU;
  for (let k = 0; k <= NR; k++) {
    const t = k / NR, prof = t < 0.12 ? 0.7 + t * 2.5 : t > 0.6 ? Math.max(0.04, Math.pow((1 - t) / 0.4, 0.8)) : 1;
    const ring = [];
    for (let j = 0; j < S; j++) {
      const a = (j / S) * TAU;
      const rr = R * prof * (0.86 + 0.14 * Math.cos(5 * a + ph + t * 2) + (vnoise(t * 6 + j, 7) - 0.5) * 0.18);
      ring.push([x + Math.cos(a) * rr, y0 - 0.05 + t * H, z + Math.sin(a) * rr]);
    }
    rings.push(ring);
  }
  const g = ringLoft(rings);
  G.use('foliage').add(g, pickR([0x2e3c28, 0x34402a, 0x2c3826, 0x3a4228], r), null);
  fineTex(G, 5);
  shadeLast(G, (px, py) => 0.7 + 0.3 * sstep(y0, y0 + 0.8 * s, py));
  return { H, crownR: R * 1.15, crownBottom: 0 };
}
// Rings of points closed around (each ring wraps), joined into a smooth, closed tube (top capped).
function ringLoft(rings) {
  const R_ = rings.length, S = rings[0].length, pos = [], idx = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let k = 0; k < R_ - 1; k++) for (let j = 0; j < S; j++) {
    const a = k * S + j, b = k * S + (j + 1) % S, c = a + S, d = b + S;
    idx.push(a, c, b, b, c, d);
  }
  // cap: fan to the top ring's centre
  const top = rings[R_ - 1];
  let cx = 0, cy = 0, cz = 0;
  for (const p of top) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const ci = pos.length / 3;
  pos.push(cx / S, cy / S + 0.05, cz / S);
  for (let j = 0; j < S; j++) idx.push((R_ - 1) * S + j, ci, (R_ - 1) * S + (j + 1) % S);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // outward check (rings ordered counter-clockwise seen from above give outward faces)
  let out = 0;
  const P = g.attributes.position, Nn = g.attributes.normal;
  for (let i = 0; i < S; i++) { const dx = P.getX(i) - rings[0].reduce((s, p) => s + p[0], 0) / S, dz = P.getZ(i) - rings[0].reduce((s, p) => s + p[2], 0) / S; out += dx * Nn.getX(i) + dz * Nn.getZ(i); }
  if (out < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

// A lumpy needle clump for pines: a welded icosphere pushed about by noise, smooth-shaded.
const clumpGeos = [];
function clumpGeo(v, detail = 1) {
  if (clumpGeos[v * 2 + detail]) return clumpGeos[v * 2 + detail];
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (vnoise3(x * 3.1, y * 3.1, z * 3.1, v * 5 + 1) - 0.5) * 0.5 + (vnoise3(x * 7, y * 7, z * 7, v * 5 + 2) - 0.5) * 0.18;
    p.setXYZ(i, x * k, y * k * (y < 0 ? 0.8 : 1), z * k);
  }
  g.computeVertexNormals();
  return (clumpGeos[v * 2 + detail] = g);
}

function pine(G, x, z, s, r, y0 = CURB) {
  // Scots pine: straight trunk, dark and fissured below, orange-brown above; a high, irregular
  // crown of needle clusters (3-5 lumpy clumps at the end of each limb), leaning to one side.
  const y = y0, H = (14 + r() * 6) * s;
  G.use('bark');
  const la = r() * TAU, lean = (r() - 0.5) * 0.06 * H;
  const tx = x + Math.cos(la) * lean, tz = z + Math.sin(la) * lean;
  const at = (t) => [x + (tx - x) * t, y + H * t, z + (tz - z) * t];
  limb(G, x, y - 0.1, z, ...at(0.42), 0.27 * s, 0.2 * s, 0x4a3a2c, 7);
  limb(G, ...at(0.42), ...at(0.97), 0.2 * s, 0.05 * s, 0x9a6844, 7);
  const col = pickR([0x2c3a26, 0x2f3d28, 0x29361f], r);
  const n = LITE ? 5 : 10 + Math.floor(r() * 4);
  const t0 = 0.52, oa = r() * TAU, asym = (0.4 + r() * 0.8) * s;
  let crownR = 1.5 * s, lowY = y + H;
  // A clump: a dark core (mass, shadow) inside crossed needle-tuft cards (the fluffy outline).
  const clump = (cx, cy, cz, cs) => {
    G.use('foliage').add(clumpGeo(Math.floor(r() * 6), 0), jitterC(col, 0.08, r) & 0xfefefe, mat(cx, cy - 0.08 * cs, cz, (r() - 0.5) * 0.35, r() * TAU, (r() - 0.5) * 0.35, cs * (0.55 + r() * 0.12), cs * 0.38, cs * (0.55 + r() * 0.12)));
    fineTex(G, 2.2);
    shadeLast(G, () => 0.62);
    const f = twigFace('pine', Math.floor(r() * 4)), a0 = r() * Math.PI, nc = LITE ? 2 : 3;
    for (let q = 0; q < nc; q++) card(f, cx, cy, cz, cs * 1.55, cs * 1.0, a0 + (q / nc) * Math.PI, 0.9);
  };
  for (let k = 0; k < n; k++) {
    const t = t0 + (k / n) * (0.93 - t0) + r() * 0.03;
    const a = k * 2.4 + r() * 0.6;
    const reach = ((1.5 + r() * 1.7) * (1.2 - (t - t0) * 1.4) + Math.max(0, Math.cos(a - oa)) * asym) * s;
    const [bx, by, bz] = at(t);
    const cx = bx + Math.cos(a) * reach, cy = by + reach * 0.3, cz = bz + Math.sin(a) * reach;
    if (!LITE) { G.use('bark'); limb(G, bx, by - 0.2 * s, bz, cx, cy, cz, 0.08 * s, 0.03 * s, 0x7a5236, 4); }
    // Clumps along the limb (inner one smaller), the biggest at its end, one off to the side.
    const cs = (1.6 + r() * 0.8) * s * (1.05 - (t - t0) * 0.7) * (LITE ? 1.5 : 1);
    crownR = Math.max(crownR, Math.hypot(cx - x, cz - z) + cs * 0.75); lowY = Math.min(lowY, by - 0.2 * s, cy - cs * 0.5);
    clump(cx, cy, cz, cs);
    if (LITE) continue;
    const f = 0.45 + r() * 0.15;
    clump(bx + (cx - bx) * f, by + (cy - by) * f + 0.2 * s, bz + (cz - bz) * f, cs * (0.65 + r() * 0.2));
    if (r() < 0.7) { const qa = a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5), qd = 0.55 * cs; clump(cx + Math.cos(qa) * qd, cy + (r() - 0.3) * 0.3 * cs, cz + Math.sin(qa) * qd, cs * (0.6 + r() * 0.25)); }
  }
  // The top: a small cluster.
  const [ux, uy, uz] = at(0.97);
  for (let q = 0; q < (LITE ? 1 : 3); q++) clump(ux + (r() - 0.5) * 1.2 * s + Math.cos(oa) * asym * 0.3, uy + (r() - 0.3) * 0.6 * s, uz + (r() - 0.5) * 1.2 * s + Math.sin(oa) * asym * 0.3, (1.9 + r() * 0.6) * s);
  return { H, crownR, crownBottom: Math.max(0, lowY - y) };
}
const jitterC = (c, a, r = rnd) => { const f = 1 + (r() - 0.5) * 2 * a; return (Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f); };

// Bare broadleaf (lime / linden, maple): a short trunk, 4-6 steep main limbs that curve outwards,
// each forking into secondary branches and twigs, small sprays of fine twigs (cards) at the branch
// ends, plus dome-shaped crown cards for the haze from further away.
function bareTree(G, x, z, s, r, y0 = CURB) {
  const y = y0, H = (10 + r() * 5) * s;
  G.use('bark');
  const col = pickR([0x4a4440, 0x504840, 0x45403c], r);
  const fork = y + H * (0.3 + r() * 0.08);
  limb(G, x, y - 0.1, z, x, fork, z, 0.32 * s, 0.24 * s, col, 8);
  const nl = LITE ? 3 : 4 + Math.floor(r() * 3);
  let crownR = 2 * s;
  const spray = twigFace('limespray', Math.floor(r() * 4));
  for (let k = 0; k < nl; k++) {
    const a = (k / nl) * TAU + r() * 0.8, el = 1.05 + r() * 0.3, len = H * (0.42 + r() * 0.14);
    const pts = arch(G, x, fork - 0.2, z, a, el, len, 3, 0.17 * s, 0.045 * s, 0.17, col, LITE ? 5 : 7);
    const tip = pts[3];
    crownR = Math.max(crownR, Math.hypot(tip[0] - x, tip[2] - z) + 1.2 * s);
    const nb = LITE ? 2 : 5 + Math.floor(r() * 2);
    for (let q = 0; q < nb; q++) {
      const [px, py, pz] = along(pts, 0.3 + (q / nb) * 0.7 + r() * 0.05);
      const a2 = a + (r() - 0.5) * 2.2, el2 = 0.35 + r() * 0.7, l2 = (1.4 + r() * 2.0) * s;
      const p2 = arch(G, px, py, pz, a2, el2, l2, LITE ? 1 : 2, 0.05 * s, 0.012 * s, 0.25, col, LITE ? 4 : 5);
      if (LITE) continue;
      for (let w = 0; w < 2; w++) {
        const [qx, qy, qz] = along(p2, 0.5 + r() * 0.5), a3 = a2 + (r() - 0.5) * 1.8, l3 = (0.5 + r() * 0.8) * s, e3 = 0.3 + r() * 0.8;
        limb(G, qx, qy, qz, qx + Math.cos(a3) * Math.cos(e3) * l3, qy + Math.sin(e3) * l3, qz + Math.sin(a3) * Math.cos(e3) * l3, 0.01 * s, 0.003 * s, col, 3);
      }
      // A spray of fine twigs at the branch end (crossed cards).
      const e = p2[p2.length - 1], sw = (1.1 + r() * 0.6) * s, sh = (0.8 + r() * 0.5) * s;
      for (const da of [0, Math.PI / 2]) card(spray, e[0], e[1] + sh * 0.3, e[2], sw, sh, -a2 + Math.PI / 2 + da, 0.6);
    }
  }
  const base = fork - 0.3, top = y + H * 1.03;
  const face = twigFace('lime', Math.floor(r() * 4));
  const nc = LITE ? 2 : 4, a0 = r() * Math.PI;
  for (let c = 0; c < nc; c++) card(face, x, (base + top) / 2, z, 2 * crownR, top - base, a0 + (c / nc) * Math.PI, 0.95);
  topCard(x, base + (top - base) * 0.68, z, crownR * 1.6, r);
  return { H, crownR, crownBottom: Math.max(0, base - y) };
}

function smallTree(G, x, z, s, r, y0 = CURB) {
  // Garden tree (apple / rowan): short trunk, a twiggy round crown.
  const y = y0, H = (3.2 + r() * 1.6) * s;
  G.use('bark');
  const col = pickR([0x4e4038, 0x55463a], r);
  const fork = y + H * 0.4;
  limb(G, x, y - 0.05, z, x, fork, z, 0.1 * s, 0.08 * s, col, 6);
  const n = 6 + Math.floor(r() * 3);
  const spray = twigFace('limespray', Math.floor(r() * 4));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + r() * 0.5, el = 0.5 + r() * 0.6, len = H * (0.45 + r() * 0.2);
    const ex = x + Math.cos(a) * Math.cos(el) * len, ey = fork + Math.sin(el) * len, ez = z + Math.sin(a) * Math.cos(el) * len;
    limb(G, x, fork, z, ex, ey, ez, 0.045 * s, 0.012 * s, col, 4);
    const px = (x + ex) / 2, py = (fork + ey) / 2, pz = (z + ez) / 2;
    limb(G, px, py, pz, px + Math.cos(a + 0.8) * len * 0.4, py + len * 0.35, pz + Math.sin(a + 0.8) * len * 0.4, 0.025 * s, 0.008 * s, col, 3);
    if (k % 2 === 0) card(spray, ex, ey + 0.2 * s, ez, 0.9 * s, 0.7 * s, -a + Math.PI / 2, 0.6);
  }
  const face = twigFace('lime', Math.floor(r() * 4));
  const R_ = H * 0.62;
  for (let c = 0; c < 2; c++) card(face, x, (fork - 0.2 + y + H * 1.05) / 2, z, 2 * R_, y + H * 1.05 - fork + 0.2, c * Math.PI / 2 + r(), 0.95);
  return { H: H * 1.05, crownR: R_, crownBottom: Math.max(0, fork - 0.2 - y) };
}

// Scale the triplanar coordinates of the last part added (finer texture detail, e.g. clipped
// hedges whose leaf clumps should read smaller than a free-grown shrub's). The coordinates are
// re-centred on the part first: procedural noise at (world position x 10) runs out of float
// precision on the GPU far from the origin and turns into a blocky pixel pattern.
const FT_ROT = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.63, 0.81, 0.37)).toArray().filter((v, i) => i % 4 !== 3 && i < 12);
export function fineTex(G, k) {
  const t = G.parts[G.parts.length - 1]?.attributes.tri;
  if (!t) return;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < t.count; i++) { cx += t.getX(i); cy += t.getY(i); cz += t.getZ(i); }
  cx /= t.count; cy /= t.count; cz /= t.count;
  // Also turn the coordinates obliquely to every face: the shader's value-noise lattice then cuts
  // the faces at odd angles, so its cells read as irregular clumps, not axis-aligned squares.
  const ox = rnd() * 40, oy = rnd() * 40, oz = rnd() * 40;
  const M = FT_ROT;
  for (let i = 0; i < t.count; i++) {
    const x = (t.getX(i) - cx) * k, y = (t.getY(i) - cy) * k, z = (t.getZ(i) - cz) * k;
    t.setX(i, M[0] * x + M[1] * y + M[2] * z + ox); t.setY(i, M[3] * x + M[4] * y + M[5] * z + oy); t.setZ(i, M[6] * x + M[7] * y + M[8] * z + oz);
  }
}

// Clipped hedge: a lofted body (slightly bulging sides, rounded top edges, a top that wavers by a few
// cm), with an overhanging cap of snow on top. kind 'evergreen' (thuja / liguster: dark muted green
// foliage at a fine scale) or 'bare' (oxbär / hagtorn / avenbok in November: a brown-grey twig mass
// with see-through twig cards along both sides, so its outline frays). Visual only; the caller adds
// the collider (Frame.hedge does).
export const HEDGE_GREEN = 0x435638, HEDGE_BARE = 0x66584d;
export function hedge(G, x, z, w, d, h = 0.9, yaw = 0, color = C.hedge, o = {}) {
  const bare = o.kind === 'bare';
  const seed = Math.floor(rnd() * 9973);
  const hd = d / 2, y0 = CURB - 0.03;
  // (phase 4 r2: an evergreen body's top stays just under the clipped line, hk: it poked through the
  // thinner snow cap as dark blotches)
  const prof = o.square ? [[-0.95, 0], [-1.0, 0.25], [-1.0, 0.9], [-0.97, 0.98], [-0.5, 1.0], [0.5, 1.0], [0.97, 0.98], [1.0, 0.9], [1.0, 0.25], [0.95, 0]]
    : bare ? [[-0.86, 0], [-1.02, 0.4], [-0.98, 0.82], [-0.75, 0.97], [0, 1.01], [0.75, 0.97], [0.98, 0.82], [1.02, 0.4], [0.86, 0]]
      : [[-0.86, 0], [-1.02, 0.4], [-0.98, 0.82], [-0.75, 0.95], [0, 0.985], [0.75, 0.95], [0.98, 0.82], [1.02, 0.4], [0.86, 0]];
  // An evergreen hedge is a row of plants (one every ~0.7 m): each bulges out a little and has its
  // own height, with shallow grooves between them, so no face is one plane.
  const st = Math.max(2, Math.ceil(w / (bare ? 0.45 : 0.3)));
  const rings = [], cap = [], hs = [];
  // (round 6) Evergreen ends are rounded in plan: a half-ellipse eR long (up to 0.45 m; Ove's, clipped
  // with a spirit level, only at the corners), and lower towards the tip, with the rings closer
  // together there. (Round 5's square ends read as a box wrapped in leaf cards.)
  const eL = bare ? Math.min(0.3, w / 3) : o.square ? Math.min(0.14, w / 5) : Math.min(0.45, w / 4, Math.max(0.24, hd * 1.05));
  let lxs = [];
  for (let k = 0; k <= st; k++) lxs.push(-w / 2 + (w * k) / st);
  if (!bare) for (const f of [0.06, 0.22, 0.45, 0.75]) lxs.push(-w / 2 + f * eL, w / 2 - f * eL);
  lxs.sort((a, b) => a - b);
  { const out = []; for (const v of lxs) { if (out.length && v - out[out.length - 1] < 0.025) { if (Math.abs(v - w / 2) < 1e-9) out[out.length - 1] = v; } else out.push(v); } lxs = out; }
  const pl = 0.62 + rnd() * 0.16, po = rnd() * pl;
  // The body at lx (pi: evaluate it as part of that plant, e.g. a plant's cushion near its edge):
  // height hk, half-width wk (rounded at the ends), unrounded wr, end factor e.
  // (phase 4 r2: the plants are not all the same width: the plant coordinate u wanders by up to a
  // third of a plant over a couple of metres, monotonically)
  const uOf = (lx) => (lx + w / 2 + po) / pl + (bare || o.square ? 0 : 0.34 * (vnoise(lx / 1.9, seed + 89) - 0.5));
  const plantOf = (lx) => { const u = uOf(lx), pi = Math.floor(u); return [pi, u - pi]; };
  const bodyAt = (lx, piF) => {
    const dEnd = Math.min(lx + w / 2, w / 2 - lx), e = sstep(0, eL, dEnd), tt = Math.min(1, Math.max(0, dEnd) / eL);
    // plan: an ellipse quadrant to the tip (never quite a point); elevation: a little lower there
    const pr = bare ? 1 - 0.14 * (1 - e) : Math.max(0.22, Math.sqrt(Math.max(0, 1 - (1 - tt) * (1 - tt))));
    const ph = bare ? 1 - 0.1 * (1 - e) : 1 - (o.square ? 0.04 : 0.13) * Math.pow(1 - tt, 1.5);
    const sq = o.square ? 0.15 : 1;   // Ove's: clipped with a spirit level
    const u = uOf(lx), pi = piF ?? Math.floor(u), bulge = bare ? 0 : 0.5 - 0.5 * Math.cos((u - pi) * TAU);
    const plantH = bare ? 0 : (hash(pi, seed) - 0.5) * 0.16 * (o.square ? 0.3 : 1), plantW = bare ? 0 : (hash(pi, seed + 1) - 0.5) * 0.12 * (o.square ? 0.3 : 1);
    // (the clipped top line also steps by up to +-8 cm every 2-4 m: clipped by hand, in pieces)
    const cut = bare || o.square ? 0 : (vnoise(lx / 3.0, seed + 61) - 0.5) * 0.16 + (hash(Math.floor((lx + 40) / 2.7), seed + 63) - 0.5) * 0.06;
    const hk = (h + cut + ((vnoise(lx * 0.65, seed) - 0.5) * 0.16 + (vnoise(lx * 2.3, seed + 3) - 0.5) * 0.04) * sq + plantH + (bulge - 0.5) * 0.06 * (o.square ? 0.4 : 1)) * ph;
    const wr = hd * (1 + (vnoise(lx * 0.8, seed + 9) - 0.5) * 0.14 * sq + (bulge - 0.6) * 0.24 * (o.square ? 0.3 : 1) + plantW), wk = wr * pr;
    return { hk, wk, wr, e };
  };
  for (const lx of lxs) {
    const { hk, wk, wr, e } = bodyAt(lx);
    hs.push([hk, wk, lx, wr]);
    rings.push(prof.map(([a, b], p) => {
      // (round 6: an evergreen body's sides stay put: the leaf cards stand 1.5 cm outside its widest
      // point, and a jittered side poked through them as dark seams down the face)
      const j = (vnoise2(lx * 3.1, p * 1.7, seed + 1) - 0.5) * 0.04;
      return [lx, y0 + b * hk + (b > 0.05 && (bare || b < 0.9) ? j : 0), a * wk + (bare && Math.abs(a) > 0.5 ? j * Math.sign(a) : 0)];
    }));
    // Snow: thicker in places, missing where it slid off; it thins out and pulls in at the ends.
    // (the evergreen hedges' cap is built further down, finer and following the leaf faces)
    if (!bare) continue;
    const ov = (0.03 + 0.025 * vnoise(lx * 1.7, seed + 31)) * e;
    const cov = vnoise(lx * 0.8, seed + 23);
    const t = cov < 0.28 ? -0.03 : (0.02 + 0.06 * vnoise(lx * 1.3, seed + 17)) * e - 0.02 * (1 - e);
    const yt = y0 + hk, cx = lx - Math.sign(lx) * 0.08 * (1 - e);
    const sw = wk * (0.75 + 0.18 * e);
    cap.push([[cx, yt - 0.05, -(sw + ov)], [cx, yt + t * 0.55, -sw * 0.84], [cx, yt + t, -sw * 0.34], [cx, yt + t * 0.95, sw * 0.32], [cx, yt + t * 0.55, sw * 0.84], [cx, yt - 0.05, sw + ov]]);
  }
  // the ring nearest to lx: [height, half-width, lx, unrounded half-width]
  const hAt = (lx) => { let b = hs[0]; for (const q of hs) if (Math.abs(q[2] - lx) < Math.abs(b[2] - lx)) b = q; return b; };
  const m = mat(x, 0, z, 0, yaw, 0, 1, 1, 1);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const W = (lx, ly, lz) => [x + lx * c + lz * sn, ly, z - lx * sn + lz * c];
  const Wn = (nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; return [(nx * c + nz * sn) / l, ny / l, (-nx * sn + nz * c) / l]; };
  if (!bare) {
    G.use('foliage').add(loft(rings, { caps: true, bulge: 0, axis: [1, 0, 0], inside: [0, y0 + h * 0.45, 0] }), color, m);
    fineTex(G, o.fine ?? 8);
    // Darker at the foot and in the grooves between plants; thuja / liguster go bronze-olive in
    // patches in winter (o.bronze: 0..1 how much).
    const br = o.bronze ?? 0.5, cc = Math.cos(yaw), cs = Math.sin(yaw);
    shadeLast(G, (px, py, pz) => {
      const lx = (px - x) * cc - (pz - z) * cs, u = uOf(lx), gr = 0.5 - 0.5 * Math.cos((u - Math.floor(u)) * TAU);
      // (round 5: about as light as the leaf cards in front of it, which hide it but at the ends)
      const k = (0.62 + 0.2 * sstep(y0, y0 + 0.4, py)) * (0.88 + 0.12 * gr);
      const b = br * sstep(0.45, 0.8, vnoise(lx * 0.45, seed + 41) * 0.7 + vnoise(lx * 1.7, seed + 43) * 0.3);
      return [k * (1 + 0.3 * b), k * (1 + 0.04 * b), k * (1 - 0.2 * b)];
    });
    // thuja (o.bronze > 0.6: the cemetery's) has flat fans of scale leaves, other hedges small sprays
    const thu = (o.bronze ?? 0.5) > 0.6, fk = thu ? 'thujagreen' : 'hedgegreen';
    // (phase 4 r2) The leaf walls: per plant and face a cushion (addGrid: 4 x 3 cells on the 'leaf'
    // page) that bulges D out of the face in its middle and falls back into the groove between plants,
    // its normals bent with it, so the low sun rakes across a row of lumps instead of lighting one flat
    // green plane (round 6's flat cards read as felt in the sun and a dark slab in the shade). Each
    // plant has its own tone (+-13 %, a little more or less bronze; the cemetery's thuja darker and
    // olive). The faces are the fringe-less 'low' leaf walls up to the clipped top, which the snow cap
    // covers: the fringe over the clipped line and the sprays across the top were dark flecks on the
    // white cap.
    const D = o.square ? 0.012 : 0.045;
    const base = thu ? [0.68, 0.66, 0.56] : [1, 1, 1];
    const tintOf = (pi) => {
      const v = 1 + (hash(pi, seed + 91) - 0.5) * (o.square ? 0.1 : thu ? 0.18 : 0.24), t = (hash(pi, seed + 93) - 0.5) * (thu ? 0.14 : 0.08);
      return [base[0] * v * (1 + t), base[1] * v, base[2] * v * (1 - t)];
    };
    // |profile| of the body at height fraction b (0 foot .. 1 top), one side
    const PR = prof.filter(([a]) => a <= 0).map(([a, b]) => [b, -a]).sort((p, q) => p[0] - q[0]);
    const profAt = (b) => { for (let i = 1; i < PR.length; i++) if (b <= PR[i][0]) { const [b0, a0] = PR[i - 1], [b1, a1] = PR[i]; return a0 + (a1 - a0) * (b - b0) / (b1 - b0); } return PR[PR.length - 1][1]; };
    // how far out of the centre line the leaf wall stands at (lx, b) on a plant's cushion: just outside
    // the body (its profile there, at least 0.86 of its width: the cap covers the rounded top edge),
    // plus the plant's own bulge, most at about half height
    // (each plant bulges by its own amount, fullest at its own height, with a few lumps of +-1 cm)
    // (the plant's width blends into its neighbour's over the last fifth on either side, so two cushions
    // meet in the groove; and never inside the lofted body, whose rings (every 0.3 m) do not resolve
    // the grooves: it poked through as dark slivers)
    const wkI = (lx) => {
      let a = 1, b = hs.length - 1;
      while (a < b) { const m_ = (a + b) >> 1; if (hs[m_][2] < lx) a = m_ + 1; else b = m_; }
      const [, wa, la] = hs[a - 1], [, wb, lb] = hs[a];
      return wa + (wb - wa) * Math.min(1, Math.max(0, (lx - la) / ((lb - la) || 1)));
    };
    // (faceAt: what does not depend on the height, once per lx; faceOff: the offset at height b)
    const faceAt = (lx, pi) => {
      const B = bodyAt(lx, pi), ph = uOf(lx) - pi;
      let wk = B.wk;
      if (ph < 0.2) { const t = 0.5 * (1 - ph / 0.2); wk += (bodyAt(lx, pi - 1).wk - wk) * t; } else if (ph > 0.8) { const t = 0.5 * (ph - 0.8) / 0.2; wk += (bodyAt(lx, pi + 1).wk - wk) * t; }
      return { lx, pi, ph, hk: B.hk, wk: Math.max(wk, wkI(lx)), pk: 0.38 + 0.32 * hash(pi, seed + 97), dk: 0.6 + 0.6 * hash(pi, seed + 95) };
    };
    // (lumps: the position only; the normals follow the plant's envelope)
    const faceOff = (F, b, k, lumps = true) => {
      const { lx, ph, hk, wk, pk, dk } = F;
      const vp = b < pk ? 0.55 + 0.45 * sstep(0, pk, b) : 1 - 0.35 * sstep(pk, 1, b);
      const lump = o.square || !lumps ? 0 : (vnoise2(lx * 3.2, b * hk * 3.2, seed + 99) - 0.5) * 0.024 * Math.sin(Math.PI * Math.min(1, b * 1.6));
      return wk * Math.max(profAt(Math.min(b, 0.9)), 0.86) + 0.015 + D * dk * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, ph))), 0.7) * vp + lump + (k % 2) * 0.006;
    };
    const xs0 = -w / 2 + eL * 0.97, xs1 = w / 2 - eL * 0.97;
    const BL = [0, 0.4, 0.78, 1];
    // one cushion: plant pi, lx from xa to xb, heights bLo..bHi of the body (a full leaf face each)
    const cushion = (pi, xa, xb, sd, k, bLo, bHi, dz, vv) => {
      const cols = xb - xa > 0.4 ? 4 : 2, P = [], N = [], A = [], B = [], nr = BL.length;
      const cf = [];
      for (let i = 0; i <= cols; i++) cf.push(faceAt(sd > 0 ? xa + (xb - xa) * i / cols : xb - (xb - xa) * i / cols, pi));
      // the grid's offsets and heights, then the normal at each vertex from its neighbours (along: a few
      // cm over half a plant; up: the rounded top), exaggerated a little: the leaf mass is rougher than
      // its envelope
      const off = [], ys = [];
      for (let j = 0; j < nr; j++) for (let i = 0; i <= cols; i++) { const F = cf[i], b = bLo + (bHi - bLo) * BL[j]; off.push(faceOff(F, b, k) + dz); ys.push(y0 + b * F.hk); }
      const at = (j, i) => j * (cols + 1) + i;
      for (let j = 0; j < nr; j++) for (let i = 0; i <= cols; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(cols, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nr - 1, j + 1);
        const dX = (off[at(j, i1)] - off[at(j, i0)]) / (cf[i1].lx - cf[i0].lx || 1e-3);
        const dY = (off[at(j1, i)] - off[at(j0, i)]) / (ys[at(j1, i)] - ys[at(j0, i)] || 1e-3);
        P.push(W(cf[i].lx, ys[at(j, i)], sd * off[at(j, i)])); N.push(Wn(-1.6 * dX, -1.4 * dY + 0.05, sd));
        A.push(i / cols); B.push(BL[j]);
      }
      addGrid(twigFace(fk + 'low', vv), cols, nr - 1, P, N, A, B, tintOf(pi));
    };
    // (where plant boundary u starts: uOf is monotonic, so a bisection)
    const lxOf = (u) => { let a = -w / 2 - pl * 2, b = w / 2 + pl * 2; for (let q = 0; q < 32; q++) { const m_ = (a + b) / 2; if (uOf(m_) < u) a = m_; else b = m_; } return (a + b) / 2; };
    const [p0] = plantOf(xs0), [p1] = plantOf(xs1);
    for (let pi = p0, k = 0; pi <= p1; pi++, k++) {
      const la = Math.max(xs0, lxOf(pi)), lb = Math.min(xs1, lxOf(pi + 1));
      if (lb - la < 0.03) continue;
      // (each cushion reaches 3 cm into its neighbours: no slit between plants)
      const xa = la - (la > xs0 ? 0.03 : 0.02), xb = lb + (lb < xs1 ? 0.03 : 0.02);
      for (const sd of [-1, 1]) {
        const vv = Math.floor(hash(k * 3 + (sd > 0 ? 1 : 0), seed + 5) * 4) % 4;
        let hm = 0; for (let q = 0; q <= 4; q++) hm += bodyAt(xa + (xb - xa) * q / 4, pi).hk / 5;
        // (a hedge over 1.25 m: two faces stacked, the upper one 4 mm proud where they overlap)
        if (hm > 1.25 && !o.square) { cushion(pi, xa, xb, sd, k, 0, 0.53, 0, vv); cushion(pi, xa, xb, sd, k, 0.5, 1, 0.004, (vv + 1) % 4); }
        else cushion(pi, xa, xb, sd, k, 0, 1, 0, vv);
      }
    }
    // (round 6) The rounded ends: four cards tangent to the plan's half-ellipse (eL long, as wide as
    // the unrounded body), each a little wider than its 45-degree arc, so they overlap into a closed,
    // faceted round end. (Round 5 closed the end with one flat card, and the body's end cap poked
    // through it.) (phase 4 r2: each a 2 x 3 grid whose normals follow the ellipse: a round end, not
    // facets; the end plant's tone)
    for (const sd of [-1, 1]) {
      const lxE = sd * (w / 2 - eL);
      let bAx = 0;
      for (const q of hs) if (sd * (q[2] - lxE) >= -0.05) bAx = Math.max(bAx, q[3]);
      const E = (ph_) => [lxE + sd * eL * Math.cos(ph_), bAx * Math.sin(ph_)];
      const En = (ph_) => { const nx = sd * bAx * Math.cos(ph_), nz = eL * Math.sin(ph_), l = Math.hypot(nx, nz); return [nx / l, nz / l]; };
      const [piE] = plantOf(sd * w / 2 - sd * 0.01), tE = tintOf(piE);
      for (let i = 0; i < 4; i++) {
        const phc = (-0.375 + i * 0.25) * Math.PI, out = 0.014 + (i % 2) * 0.01;
        // from phc - 0.15 pi to phc + 0.15 pi, ordered left to right as seen from outside
        const phs = [-0.15, 0, 0.15].map((q) => phc - q * Math.PI * sd);
        const P = [], N = [], A = [], B = [];
        for (let j = 0; j < BL.length; j++) phs.forEach((ph_, ii) => {
          const [ex, ez] = E(ph_), [nx, nz] = En(ph_), top = hAt(ex)[0], b = BL[j];
          P.push(W(ex + nx * out, y0 + b * top, ez + nz * out));
          N.push(Wn(nx, b > 0.6 ? 0.5 * (b - 0.6) / 0.4 : -0.1, nz));
          A.push(ii / 2); B.push(b);
        });
        addGrid(twigFace(fk + 'low', Math.floor(hash(i * 2 + sd + 3, seed + 9) * 4) % 4), 2, BL.length - 1, P, N, A, B, tE);
      }
    }
    // (round 6) Sprigs proud of the face: loose shoots that grew since the last clipping, leaning out
    // of both faces at 25-55 degrees and a little up, so the silhouette along the hedge is broken
    // (Ove's, clipped with a spirit level, has only a few). (phase 4 r2: none near the top, where
    // they poked over the snow cap; the plant's tone)
    const spF = twigFace(thu ? 'thujasprig' : 'hedgesprig', 0), nsp = Math.round((xs1 - xs0) * (o.square ? 0.5 : 1.3));
    for (let k = 0; k < nsp; k++) {
      const lx = xs0 + (k + 0.15 + 0.7 * hash(k, seed + 71)) / Math.max(1, nsp) * (xs1 - xs0), sd = hash(k, seed + 73) < 0.5 ? -1 : 1;
      const [hk, wk] = hAt(lx), along = hash(k, seed + 75) < 0.5 ? -1 : 1;
      const gam = 0.45 + hash(k, seed + 77) * 0.5, tilt = 0.2 + hash(k, seed + 79) * 0.45;
      const yb = y0 + hk * (hash(k, seed + 81) < 0.45 ? 0.62 + 0.1 * hash(k, seed + 83) : 0.25 + 0.4 * hash(k, seed + 83));
      const L = (0.2 + 0.12 * hash(k, seed + 85)) * (o.square ? 0.7 : 1), Hs = L * 0.62;
      // direction out of the face (local): along the hedge by cos(gam), out by sin(gam), up by tilt
      let dx = along * Math.cos(gam), dz = sd * Math.sin(gam), dy = Math.sin(tilt);
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      // the card's "up": vertical, minus its part along the shoot
      let ux = -dx * dy, uy = 1 - dy * dy, uz = -dz * dy;
      const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      const bx = lx, bz = sd * (wk - 0.03);
      const [cx2, , cz2] = W(bx + dx * L * 0.45, 0, bz + dz * L * 0.45);
      const wd = (vx, vz) => [vx * c + vz * sn, -vx * sn + vz * c];
      const [rx, rz] = wd(dx * L / 2, dz * L / 2), [qx, qz] = wd(ux * Hs / 2, uz * Hs / 2);
      // (lit like the face it grows out of, from both sides: shaded by its own plane it was a black
      // arrowhead on the side away from the sun)
      addQuad(spF, [cx2, yb + dy * L * 0.45, cz2], [rx, dy * L / 2, rz], [qx, uy * Hs / 2, qz], Wn(0, 0.3, sd), tintOf(plantOf(lx)[0]), true);
    }
    // (the sprays across the top are gone: dark flecks on the cap; the loop still draws its random
    // numbers, so everything built after a hedge is placed as before)
    if (!o.square) for (let lx = -w / 2 + eL * 0.8; lx < w / 2 - eL * 0.6; lx += 1.6 + rnd() * 0.8) { rnd(); rnd(); }
    // (phase 4 r2) The snow cap, a third thinner than round 6's and finer (a ring every ~0.15 m): its
    // rim follows the plants' cushions just outside their top edge, hangs 2-6 cm down the face and
    // reaches out by a ragged 0-3 cm; where the snow slid off it sinks below the clipped top.
    const capX = [];
    for (let i = 0; i < lxs.length; i++) { capX.push(lxs[i]); if (i + 1 < lxs.length && lxs[i + 1] - lxs[i] > 0.2) capX.push((lxs[i] + lxs[i + 1]) / 2); }
    for (const lx of capX) {
      const [pi] = plantOf(lx), { hk, wk, e } = bodyAt(lx);
      const cov = vnoise(lx * 0.8, seed + 23), bareTop = cov < 0.28;
      const t = bareTop ? -0.03 : (0.013 + 0.038 * vnoise(lx * 1.3, seed + 17)) * e - 0.02 * (1 - e);
      const yt = y0 + hk, cx = lx - Math.sign(lx) * 0.03 * (1 - e);
      const sw = wk * (0.75 + 0.18 * e);
      const straight = lx > xs0 && lx < xs1;
      const edge = (sd) => {
        const rag = (0.004 + 0.026 * vnoise(lx * 4.3 + sd * 7, seed + 33)) * e;
        if (bareTop) return sw * 0.9;
        return Math.max(sw + (0.03 + 0.02 * vnoise(lx * 1.7, seed + 31)) * e, straight ? faceOff(faceAt(lx, pi), 1, pi - p0) + 0.006 + rag : 0);
      };
      const drop = (sd) => 0.02 + 0.045 * vnoise(lx * 3.7 + sd * 5, seed + 37);
      cap.push([[cx, yt - drop(-1), -edge(-1)], [cx, yt + t * 0.55, -sw * 0.84], [cx, yt + t, -sw * 0.34], [cx, yt + t * 0.95, sw * 0.32], [cx, yt + t * 0.55, sw * 0.84], [cx, yt - drop(1), edge(1)]]);
    }
    G.use('snow').add(loft(cap, { inside: [0, -50, 0] }), 0xf0f2f4, m);
    sst('hedgecap', G);
    return;
  }
  // Bare: a dark core (the shadowed inside of the twig mass), slightly inset, wrapped in twig cards:
  // along both sides, across the top every ~0.55 m (they face you when you look along the hedge),
  // and a few 3D twigs. Snow lies in a thin broken layer on the top.
  const core = rings.map((ring) => ring.map(([px, py, pz]) => [px, y0 + (py - y0) * 0.9, pz * 0.86]));
  G.use('bark').add(loft(core, { caps: true, bulge: 0.02, axis: [1, 0, 0], inside: [0, y0 + h * 0.45, 0] }), o.color ?? HEDGE_BARE, m);
  fineTex(G, 2);
  G.use('snow').add(loft(cap.map((ring) => ring.map(([px, py, pz]) => [px, y0 + (py - y0) * 0.9 - 0.01, pz * 0.85])), { inside: [0, -50, 0] }), 0xf0f2f4, m);
  const ns = Math.max(1, Math.round(w / 1.5));
  for (let k = 0; k < ns; k++) {
    const lx = -w / 2 + ((k + 0.5) / ns) * w, [hk, wk] = hAt(lx), ch = (hk + 0.1) / 0.84;
    for (const sd of [-1, 1]) {
      const [px, , pz] = W(lx, 0, sd * wk * 0.97);
      addCard(twigFace('hedgeside', (k * 2 + seed + (sd > 0 ? 1 : 0)) % 4), px, y0 + ch / 2, pz, w / ns + 0.12, ch, yaw + (sd > 0 ? 0 : Math.PI), 0.9);
    }
  }
  // (round 6) and across both ends, so an end frays like the sides instead of showing the bare core
  for (const sd of [-1, 1]) {
    const [hk, wk] = hAt(sd * w / 2), ch = (hk + 0.1) / 0.84, [px, , pz] = W(sd * (w / 2 - 0.02), 0, 0);
    addCard(twigFace('hedgeside', (seed + (sd > 0 ? 2 : 3)) % 4), px, y0 + ch / 2, pz, 2 * wk + 0.1, ch, yaw + sd * Math.PI / 2, 0.9);
  }
  const fh = 0.32;
  for (let lx = -w / 2 + 0.25; lx < w / 2 - 0.1; lx += 0.5 + rnd() * 0.2) {
    const [hk, wk] = hAt(lx), [px, , pz] = W(lx, 0, 0);
    addCard(twigFace('fringe', Math.floor(rnd() * 4)), px, y0 + hk * 0.9 + fh * 0.3, pz, wk * 2.15, fh, yaw + Math.PI / 2 + (rnd() - 0.5) * 0.3, 0.9);
  }
  G.use('bark');
  const n = Math.round(w * 4);
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + ((k + rnd()) / n) * w, [hk, wk] = hAt(lx);
    const lz = (rnd() - 0.5) * 1.6 * wk, ly = y0 + hk * 0.9 - 0.05, L = 0.16 + rnd() * 0.2;
    const dx = (rnd() - 0.5) * 0.6, dz = lz * 0.9 + (rnd() - 0.5) * 0.4, dy = 0.7 + rnd() * 0.4, dl = Math.hypot(dx, dy, dz);
    limb(G, ...W(lx, ly, lz), ...W(lx + dx / dl * L, ly + dy / dl * L, lz + dz / dl * L), 0.008, 0.003, 0x5a4c42, 3);
  }
}

// Low evergreen shrub.
export function shrub(G, x, z, s = 1, color = 0x3d4c36) {
  G.use('foliage');
  G.add(clumpGeo(Math.floor(rnd() * 6)), color, mat(x, CURB + 0.25 * s, z, 0, rnd() * TAU, 0, 1.3 * s, 1.0 * s, 1.1 * s));
  fineTex(G, 2.5);
}

// A bed of spruce twigs (granris) laid over a grave or a planter in winter: a low bed of needles
// with overlapping sprigs on it (see-through cards on the 'leaf' page: a stem with needled side
// shoots), a little snow caught on the top ones.
// (phase 4 r2) The sprigs were flat decals in a 3-8 % albedo green with a straight-up normal over a
// dark box: black paper combs on the snow in the finale. Now two layers of sprigs (no box: the snow
// shows between them), each lifted and tilted (one end higher, rolled a little), so they overlap
// rather than lie in one plane, shaded by a normal leaning ~20 degrees towards the low sun (a mass of
// needles catches the sun better than a flat board would).
const SUN_H = (() => { const l = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1; return [SUN_DIR.x / l, SUN_DIR.z / l]; })();
// (the sprigs' tint: their own colour, and 1.7 x the indirect light: lying on the snow they are lit
// by it from below too; in the shade of a stone they were black)
const SPRIG_T = [1, 1, 1, 1.7];
export function granris(G, x, z, w, d, h = 0.18, yaw = 0, y0 = CURB) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // (the new parts draw from their own random numbers; the shared stream (rnd) is used as round 6 used
  // it, so everything built after a grave is placed as before)
  const lr = mulberry32(Math.floor(x * 131 + z * 71) & 0x7fffffff);
  for (let q = 0; q < 3; q++) rnd();   // (round 6's needle bed: fineTex)
  // one sprig at (lx, lz) in the bed's frame, stem along world angle a, lifted by lift
  const sprig = (f, lx, lz, a, len, lift, tilt) => {
    // the stem along a (image up), the shoots across it; pitch: the tip end up or down, roll: tipped
    // onto one side
    const pitch = (lr() - 0.5) * 0.24 * tilt, roll = (lr() - 0.5) * 0.36 * tilt, cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const ax = Math.sin(a), az = Math.cos(a), bx = -Math.cos(a), bz = Math.sin(a);
    const U = [ax * cp, sp, az * cp], Rv = [bx * cr, sr, bz * cr];
    const hw = len * 0.42 / 2, hl = len / 2;
    // the normal (Rv x U), then leaning towards the sun
    let nx = Rv[1] * U[2] - Rv[2] * U[1], ny = Rv[2] * U[0] - Rv[0] * U[2], nz = Rv[0] * U[1] - Rv[1] * U[0];
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nx += SUN_H[0] * 0.35; nz += SUN_H[1] * 0.35;
    const cy = y0 + lift + Math.abs(sp) * hl * 0.5 + Math.abs(sr) * hw * 0.5;
    addQuad(f, [x + lx * c + lz * s, cy, z - lx * s + lz * c], [Rv[0] * hw, Rv[1] * hw, Rv[2] * hw], [U[0] * hl, U[1] * hl, U[2] * hl], [nx, ny, nz], SPRIG_T);
  };
  // the lower layer: sprigs laid flat from the middle outwards on a jittered grid, overlapping like
  // shingles (it covers the bed; the snow shows between them at the rim)
  const nx = Math.max(2, Math.round(w / 0.22)), nz = Math.max(2, Math.round(d / 0.2));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lx = ((i + 0.5) / nx - 0.5) * w * 0.8 + (lr() - 0.5) * 0.08, lz = ((j + 0.5) / nz - 0.5) * d * 0.75 + (lr() - 0.5) * 0.08;
    const a = yaw + Math.atan2(lx + (lr() - 0.5) * 0.3, lz + (lr() - 0.5) * 0.3 + 0.05);
    sprig(twigFace('sprig', Math.floor(lr() * 3)), lx, lz, a, 0.36 + lr() * 0.2, 0.012 + lr() * 0.012, 0.5);
  }
  // a few more at odd angles between the layers
  for (let k = 0, m = Math.round(w * d / 0.12); k < m; k++) sprig(twigFace('sprig', Math.floor(lr() * 3)), (lr() - 0.5) * w * 0.8, (lr() - 0.5) * d * 0.75, yaw + lr() * TAU, 0.4 + lr() * 0.25, 0.022 + lr() * 0.012, 0.8);
  // the top layer, at odd angles; the outer, top-most sprigs caught a dusting of snow
  const n = Math.max(4, Math.round((w * d) / 0.06));
  for (let k = 0; k < n; k++) {
    const lx = (rnd() - 0.5) * w * 0.85, lz = (rnd() - 0.5) * d * 0.8, a = yaw + (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI);
    const len = 0.42 + rnd() * 0.3, outer = Math.abs(lx) / w > 0.26 || Math.abs(lz) / d > 0.24;
    sprig(twigFace('sprig', outer && rnd() < 0.6 ? 3 : Math.floor(rnd() * 3)), lx, lz, a, len, 0.03 + lr() * 0.02 + h * (k / n) * 0.45, 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Roofs

// A low roof slab in frame f (sheds, garages, shelters): a thin (5 cm) slab of roofing felt (or
// o.surface) whose four edges are covered by painted fascia / verge boards, plus a gutter at the
// low edge. Never shows sheet-metal ribs on an edge.
// (lx, y, lz): centre of the slab; w along the part's x, l along its z; tilt: rotation about the
// part's x (positive tilts the +z edge down); ly: yaw in the frame.
export function metalRoof(f, color, lx, y, lz, w, l, tilt = 0, ly = 0, o = {}) {
  const fc = o.fascia ?? 0x2e3134, fh = o.fh ?? 0.18, ft = 0.035;
  // (round 5: the camera block takes in the gutter, which hung 10 cm outside it: a camera sitting
  // just clear of the block had the gutter as a pipe across half the view)
  camBlock(f.wx(lx, lz), f.wz(lx, lz), w + 0.3, l + 0.4, f.yaw + ly, y - fh - 0.1 - Math.abs(Math.sin(tilt)) * l / 2, y + 0.12 + Math.abs(Math.sin(tilt)) * l / 2);
  const zx = Math.sin(ly), zz = Math.cos(ly), xx = Math.cos(ly), xz = -Math.sin(ly);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // Low roofs are roofing felt (takpapp) under snow unless told otherwise: a ribbed sheet seen at a
  // grazing angle turns into a barcode.
  f.use(o.surface ?? 'plain').boxC(o.surface ? color : 0x2a2a2c, lx, y, lz, w, 0.05, l, ly, tilt);
  f.use('painted');
  for (const sd of [-1, 1]) {
    // Eave / ridge edges (along the part's x), vertical boards.
    const ez = sd * (l / 2 * ct + ft / 2), ey = y - sd * (l / 2) * st;
    f.boxC(fc, lx + zx * ez, ey - fh / 2 + 0.03, lz + zz * ez, w + 2 * ft + 0.01, fh, ft, ly);
    // Verges (along the part's z), tilted with the slab.
    const ex = sd * (w / 2 + ft / 2);
    f.boxC(fc, lx + xx * ex, y - fh / 2 + 0.03, lz + xz * ex, ft, fh, l + 0.005, ly, tilt);
  }
  if (o.gutter !== false && Math.abs(tilt) > 0.01) {
    const sd = tilt > 0 ? 1 : -1, ez = sd * (l / 2 * ct + ft + 0.06), ey = y - sd * (l / 2) * st - fh + 0.06;
    f.use('metal').cyl(0x3a3d40, lx + zx * ez, ey, lz + zz * ez, 0.06, w + 0.1, 8, 0, Math.PI / 2, ly);
  }
}

// ---------------------------------------------------------------------------------------------
// Swedish roof and facade furniture: snow guards (snörasskydd) above the eaves over walkways,
// roof ladders (takstegar) up to the ridge, vent stacks, downpipes (stuprör). All in a frame f.
// A slope P = { zr, yr, dir, p, L }: the ridge line of the roof's top surface at local z = zr,
// y = yr; the slope runs down towards dir (-1: -z, +1: +z) at pitch p, L long to the eave edge.
const ROOFBLACK = 0x26282a;
export const slopeAt = (P, t) => [P.yr - t * Math.sin(P.p), P.zr + P.dir * t * Math.cos(P.p)];
// Snow guard: two round rails on brackets, ~0.6 m up from the eave, from x0 to x1.
export function snowGuard(f, P, x0, x1, color = ROOFBLACK) {
  const t = P.L - 0.6, [y, z] = slopeAt(P, t), ny = Math.cos(P.p), nz = P.dir * Math.sin(P.p);
  f.use('metal');
  for (const [k, r] of [[0.08, 0.016], [0.17, 0.016]]) f.cyl(color, (x0 + x1) / 2, y + ny * k, z + nz * k, r, x1 - x0, 6, 0, Math.PI / 2);
  const n = Math.max(2, Math.round((x1 - x0) / 1.1));
  for (let i = 0; i <= n; i++) f.boxC(color, x0 + 0.05 + (i / n) * (x1 - x0 - 0.1), y + ny * 0.1, z + nz * 0.1, 0.03, 0.22, 0.05, 0, P.dir * P.p);
}
// Roof ladder: two rails and rungs along the slope at x, from the snow guard up to the ridge.
export function roofLadder(f, P, x, color = ROOFBLACK) {
  const t0 = 0.25, t1 = P.L - 0.55, tm = (t0 + t1) / 2, [ym, zm] = slopeAt(P, tm), ny = Math.cos(P.p), nz = P.dir * Math.sin(P.p);
  f.use('painted');
  for (const sx of [-0.2, 0.2]) f.boxC(color, x + sx, ym + ny * 0.06, zm + nz * 0.06, 0.035, 0.03, t1 - t0, 0, P.dir * P.p);
  for (let t = t0 + 0.15; t < t1; t += 0.33) { const [y, z] = slopeAt(P, t); f.boxC(color, x, y + ny * 0.075, z + nz * 0.075, 0.4, 0.022, 0.03, 0, P.dir * P.p); }
}
// Vent stack (ventilationshuv) through the slope at (x, t): a black pipe with a rain cap.
export function ventStack(f, P, x, t, h = 0.6, r = 0.08, color = ROOFBLACK) {
  const [y, z] = slopeAt(P, t);
  f.use('metal').cyl(color, x, y + h / 2 - 0.05, z, r, h + 0.1, 8);
  f.cyl(color, x, y + h + 0.06, z, r * 1.7, 0.04, 8);
  f.cyl(color, x, y + h + 0.01, z, r * 0.6, 0.08, 6);
}
// Downpipe (stuprör) on a facade: from the gutter at (zg, yg) (frame local z, y) down to the plinth
// at x, standing dz out from the wall at zw; an offset bend, a shoe kicked out at the foot.
export function downpipe(f, x, zw, dz, zg, yg, y0 = CURB + 0.08, color = 0x3a3d40) {
  const zp = zw + dz, yb = yg - 0.3;
  f.use('metal').cyl(color, x, (y0 + 0.12 + yb) / 2, zp, 0.04, yb - y0 - 0.12, 8);
  const [ax, az] = f.W(x, zg), [bx, bz] = f.W(x, zp);
  limb(f.S, ax, yg - 0.04, az, bx, yb, bz, 0.04, 0.04, color, 8);
  const [cx, cz] = f.W(x, zp + Math.sign(dz) * 0.14);
  limb(f.S, bx, y0 + 0.14, bz, cx, y0 + 0.02, cz, 0.04, 0.045, color, 8);
  for (const yy of [y0 + 0.6, (y0 + yb) / 2 + 0.3]) f.box(color, x, yy, zw + dz / 2, 0.02, 0.03, Math.abs(dz));
}

// ---------------------------------------------------------------------------------------------
// Lamps

// Street lamp: galvanised pole, arm out along yaw, flat luminaire.
export function streetLamp(G, x, z, yaw, h = 6.6) {
  const ax = Math.sin(yaw), az = Math.cos(yaw);
  G.use('metal');
  G.add(taperGeo(0.55, 8), C.galv, mat(x, CURB + h / 2, z, 0, 0, 0, 0.19, h, 0.19));
  G.cyl(C.galv, x, CURB + 0.35, z, 0.11, 0.7, 8);
  G.box(C.galv, x + ax * 0.75, CURB + h + 0.06, z + az * 0.75, 0.06, 0.06, 1.55, yaw, -0.1);
  G.use('painted').box(0x55585c, x + ax * 1.55, CURB + h + 0.17, z + az * 1.55, 0.3, 0.12, 0.72, yaw);
  G.use('light').box(0xb8a27e, x + ax * 1.55, CURB + h + 0.105, z + az * 1.55, 0.24, 0.02, 0.6, yaw);
  circle(x, z, 0.14, 99, 'pole');
  lamps.push({ x, z });
}
// Path lamp (parklykta) for walkways and parks.
export function pathLamp(G, x, z, h = 3.8) {
  G.use('painted');
  G.cyl(0x2e3431, x, CURB + h / 2, z, 0.055, h, 8);
  G.cyl(0x2e3431, x, CURB + 0.25, z, 0.09, 0.5, 8);
  G.use('light').cyl(0xa8957a, x, CURB + h + 0.2, z, 0.17, 0.36, 10);
  G.use('painted').cone(0x2e3431, x, CURB + h + 0.47, z, 0.25, 0.18, 10);
  circle(x, z, 0.1, 99, 'pole');
  // (round 5) the camera keeps out of walkway lamp posts: a pole right in front of the lens was a
  // grey column filling half the view
  camBlock(x, z, 0.16, 0.16, 0, CURB, CURB + h + 0.6);
  lamps.push({ x, z });
}

// Sign post: faces [{ f, w, h }] stacked from the top down, facing yaw.
export function signPost(G, x, z, yaw, faces, opts = {}) {
  const top = opts.top ?? 2.5;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  G.use('metal').cyl(0x9a9da0, x, CURB + top / 2 + 0.02, z, 0.03, top + 0.04, 6);
  G.cyl(0x9a9da0, x, CURB + top + 0.05, z, 0.035, 0.03, 6);
  let y = CURB + top;
  for (const s of faces) {
    const cy = y - s.h / 2;
    const shape = s.f.shape || 'rect';
    if (shape === 'disc') G.use('metal').cyl(0x9a9c9e, x + nx * 0.045, cy, z + nz * 0.045, s.w * 0.49, 0.02, 20, Math.PI / 2, yaw);
    else if (shape === 'tri') G.use('metal').add(triPlateGeo(), 0x9a9c9e, mat(x + nx * 0.045, cy, z + nz * 0.045, 0, yaw, 0, s.w * 0.98, s.h * 0.98, 0.02));
    else G.use('metal').box(0x9a9c9e, x + nx * 0.045, cy, z + nz * 0.045, s.w, s.h, 0.02, yaw);
    addSign(s.f, x + nx * 0.057, cy, z + nz * 0.057, s.w, s.h, yaw);
    y -= s.h + 0.05;
  }
  circle(x, z, 0.06, 99, 'pole');
}

// ---------------------------------------------------------------------------------------------
// Facade parts in a frame.
// (they go into the block's ground builder, which casts no shadow: a window trim's shadow is a few
// centimetres on its own wall, and windows were ~0.3 M triangles drawn twice more into the cascades)
function onF(f, fn) {
  if (!f.F || f.F === f.S) return fn();
  const S0 = f.S, F = f.F, fs = F.surface, fl = F.snowLvl;
  f.S = F;
  try { fn(); } finally {
    // (the main builder ends up on the surface the window code ended with, as before; the ground
    // builder's own state is restored)
    f.S = S0; S0.surface = F.surface; S0.snowLvl = F.snowLvl; F.surface = fs; F.snowLvl = fl;
  }
}
// (lx, lz) is a point on the wall surface, ly the wall's outward normal (local yaw), y the bottom
// of the opening. o.glassG: the panes go into that builder instead (a window someone looks out of
// from inside: Rune's kitchen, world/interior.js - its pane is a mesh of its own that can be hidden).

export function win(f, lx, y, lz, w, h, ly, o = {}) { onF(f, () => winB(f, lx, y, lz, w, h, ly, o)); }
function winB(f, lx, y, lz, w, h, ly, o) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  const trim = o.trim ?? C.trim, b = 0.085;
  const at = (a, n) => [lx + ax * a + nx * n, lz + az * a + nz * n];
  let p;
  f.use('painted');
  p = at(0, 0.035); f.box(trim, p[0], y - b, p[1], w + 2 * b, b, 0.07, ly);          // bottom bar
  f.box(trim, p[0], y + h, p[1], w + 2 * b, b, 0.07, ly);                              // top bar
  p = at(-w / 2 - b / 2, 0.035); f.box(trim, p[0], y, p[1], b, h, 0.07, ly);
  p = at(w / 2 + b / 2, 0.035); f.box(trim, p[0], y, p[1], b, h, 0.07, ly);
  const panes = o.panes ?? (w > 1.15 ? 2 : 1);
  const mw = 0.07, pw = (w - mw * (panes - 1)) / panes;
  for (let k = 1; k < panes; k++) { p = at(-w / 2 + k * (pw + mw) - mw / 2, 0.035); f.box(trim, p[0], y, p[1], mw, h, 0.06, ly); }
  if (o.transom) { p = at(0, 0.035); f.box(trim, p[0], y + h * o.transom - mw / 2, p[1], w, mw, 0.06, ly); }
  f.use('glass');
  const G = o.glassG?.use('glass');
  for (let k = 0; k < panes; k++) {
    if (o.transom) {
      const h0 = h * o.transom - mw / 2;
      p = at(-w / 2 + pw / 2 + k * (pw + mw), 0.012); f.box(null, p[0], y, p[1], pw, h0, 0.02, ly, G);
      f.box(null, p[0], y + h0 + mw, p[1], pw, h - h0 - mw, 0.02, ly, G);
    } else { p = at(-w / 2 + pw / 2 + k * (pw + mw), 0.012); f.box(null, p[0], y, p[1], pw, h, 0.02, ly, G); }
  }
  if (o.sill !== false) { f.use('metal'); p = at(0, 0.075); f.box(o.sillC ?? 0x5e6264, p[0], y - b - 0.035, p[1], w + 2 * b + 0.08, 0.035, 0.15, ly); }
  if (o.lamp) { f.use('light'); p = at(o.lamp[0], 0.02); f.box(glow(o.lamp[1] ?? 0xffd9a0, 1.2), p[0], y + 0.05, p[1], 0.2, 0.32, 0.08, ly); }
}

// A cheap window for big facades: frame + pane (+ mullion).
export function winLite(f, lx, y, lz, w, h, ly, trim = C.trim, mull = true) { onF(f, () => winLiteB(f, lx, y, lz, w, h, ly, trim, mull)); }
function winLiteB(f, lx, y, lz, w, h, ly, trim, mull) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  f.use('painted').box(trim, lx + nx * 0.02, y - 0.07, lz + nz * 0.02, w + 0.14, h + 0.14, 0.05, ly);
  f.use('glass').box(null, lx + nx * 0.052, y, lz + nz * 0.052, w, h, 0.02, ly);
  if (mull && w > 1.0) f.use('painted').box(trim, lx + nx * 0.064, y, lz + nz * 0.064, 0.06, h, 0.02, ly);
}

// Front door with frame, a narrow light, handle; returns nothing.
export function door(f, lx, y, lz, w, h, ly, color, o = {}) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  const at = (a, n) => [lx + ax * a + nx * n, lz + az * a + nz * n];
  const trim = o.trim ?? C.trim;
  let p;
  f.use('painted');
  p = at(0, 0.03); f.box(trim, p[0], y + h, p[1], w + 0.2, 0.1, 0.06, ly);
  p = at(-w / 2 - 0.05, 0.03); f.box(trim, p[0], y, p[1], 0.1, h, 0.06, ly);
  p = at(w / 2 + 0.05, 0.03); f.box(trim, p[0], y, p[1], 0.1, h, 0.06, ly);
  p = at(0, 0.02); f.box(color, p[0], y, p[1], w, h, 0.04, ly);
  if (o.glass !== false) {
    f.use('glass'); p = at(o.glassX ?? -w * 0.22, 0.045); f.box(null, p[0], y + h * 0.35, p[1], w * 0.2, h * 0.55, 0.02, ly);
  }
  f.use('metal'); p = at(w * 0.36, 0.07); f.box(0xb0b2b4, p[0], y + 1.0, p[1], 0.13, 0.03, 0.05, ly);
}

// A small mono-pitch entrance roof (skärmtak) over a door, projecting `out` metres.
export function canopy(f, lx, y, lz, w, out, ly, roofC = C.metalBlack, postC = C.trim) {
  const nx = Math.sin(ly), nz = Math.cos(ly);
  const at = (n) => [lx + nx * n, lz + nz * n];
  // A painted box (fascia all round, soffit below) with a thin sheet-metal top inset into it.
  const p = at(out / 2);
  camBlock(f.wx(p[0], p[1]), f.wz(p[0], p[1]), w + 0.1, out + 0.05, f.yaw + ly, y - 0.12, y + 0.2);
  f.use('painted').boxC(postC, p[0], y + 0.01, p[1], w + 0.04, 0.18, out, ly, 0.12);
  f.use('metalroof').boxC(roofC, p[0], y + 0.1, p[1], w - 0.02, 0.03, out - 0.04, ly, 0.12);
}

// Small round-cornered lit house number / nameplate by a door.
// (round 6) A dim warm glow behind a glazing cross (a lantern, not a flat white slab).
export function lampBox(f, lx, y, lz, ly, color = 0xffd9a0) {
  const nx = Math.sin(ly), nz = Math.cos(ly);
  f.use('painted').box(0x2a2a2a, lx + nx * 0.06, y - 0.03, lz + nz * 0.06, 0.2, 0.34, 0.12, ly);
  f.use('light').box(glow(color === 0xffd9a0 ? 0xc0a070 : color, 0.55), lx + nx * 0.13, y + 0.02, lz + nz * 0.13, 0.13, 0.24, 0.02, ly);
  f.use('painted', { snow: 0 }).box(0x2a2a2a, lx + nx * 0.142, y + 0.02, lz + nz * 0.142, 0.014, 0.24, 0.006, ly);
  f.box(0x2a2a2a, lx + nx * 0.142, y + 0.135, lz + nz * 0.142, 0.13, 0.012, 0.006, ly);
}

// Expose PICTO_SHAPE for builders that check sign shapes.
export { PICTO_SHAPE };
