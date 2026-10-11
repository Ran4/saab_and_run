// Snow hills to drive and walk on (feature snöhög): smooth heightfield floors (collision.js HILL),
// their mesh built from the same function, so wheels and feet are where the snow is.
//   jumpHill(f, lx, lz, ly)   the park's hoppbacke: a long pile of snow shaped as a two-way tabletop.
//                             From either end: a face (inrun) steepening to 24°, a tight rounded edge
//                             that kicks a car off at the face's angle, a flat table (the avsats: a
//                             slow car lands there and rolls off the far edge), and the far face as
//                             the landing (24° easing to 16°, then the runout). Steep, lumpy flanks.
//   domeHill(x, z, rad, h, y)  a round sledding mound's collider (places.js mound)
// JUMP_HILLS: the built jump hills, for game/hoppbacke.js: { x, z, fx, fz (along the axis), rx, rz,
// table (half length of the table), edge (where the faces start: the kicking edges, from the
// centre), end (the faces' feet), top (the table's height), at(x, z), along(x, z), across(x, z) }.

import { THREE } from '../gfx.js';
import { CURB } from './layout.js';
import { hill } from './collision.js';
import { chunks, vnoise3, TAU } from './kit.js';
import { mulberry32 } from '../util.js';

export const JUMP_HILLS = [];

const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The jump hill's long profile: knots [s (m from the centre), h (m above the ground), dh/ds], cubic
// Hermite between them (designed with a flight simulation, notes/world.md *Hoppbacken*: up to ~11 m/s
// at the edge a car lands on the table, 12-14 m/s on the far face, faster ones overshoot to the flat).
export const JUMP = {
  table: 3.5,     // half the table (edge to edge 7 m)
  top: 3.4,       // the edges' height; the table dips to topMid in its middle
  topMid: 3.33,
  round: 0.6,     // the edge's rounding into the face
  slope: 0.45,    // the face just below the edge (24°): the kick
  steep: 3.6,     // m of it
  ease: 1.6,      // m easing it to ...
  slope2: 0.28,   // ... 16° ...
  steep2: 2.6,    // ... for this far, then a parabola to the ground
  core: 2.8,      // half width of the flat crown (the drive line), before the flanks
};
function knots(J) {
  const k1 = [J.table + J.round, J.top - J.slope * J.round * 0.5, -J.slope];
  const k2 = [k1[0] + J.steep, k1[1] - J.slope * J.steep, -J.slope];
  const k3 = [k2[0] + J.ease, k2[1] - ((J.slope + J.slope2) / 2) * J.ease, -J.slope2];
  const k4 = [k3[0] + J.steep2, k3[1] - J.slope2 * J.steep2, -J.slope2];
  const k5 = [k4[0] + k4[1] / (J.slope2 / 2), 0, 0];
  // (each segment's drop is its mean slope times its length, so none has a bump in it)
  return [[0, J.topMid, 0], [J.table, J.top, 0], k1, k2, k3, k4, k5];
}
function hermite(K, s) {
  s = Math.abs(s);
  const last = K[K.length - 1];
  if (s >= last[0]) return 0;
  for (let i = 0; i < K.length - 1; i++) {
    const [s0, h0, m0] = K[i], [s1, h1, m1] = K[i + 1];
    if (s > s1) continue;
    const L = s1 - s0, t = (s - s0) / L, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * h0 + (t3 - 2 * t2 + t) * L * m0 + (-2 * t3 + 3 * t2) * h1 + (t3 - t2) * L * m1;
  }
  return 0;
}

// The jump hill at local (lx, lz) of frame f, its axis along local yaw ly. Builds the collider, the
// mesh (into f.S, surface 'snow'), lumps of snow round its foot, and registers it in JUMP_HILLS.
export function jumpHill(f, lx, lz, ly = 0, seed = 7) {
  const J = JUMP, K = knots(J), end = K[K.length - 1][0];
  const x0 = f.wx(lx, lz), z0 = f.wz(lx, lz), yaw = f.yaw + ly;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
  // Plan view: an oval (half width `outline` along the pile), the crown narrowing towards the feet;
  // the flanks fill what is left (no steeper than ~36°: a wide skirt where the faces are low), and
  // bulge and dent along the pile (low frequency, in the collider too: it is the pile's outline),
  // each side its own.
  const half = J.core + 0.3 + 1.9 * J.top + 0.6;
  const crown = (u, side) => J.core * (1 - 0.4 * sstep((Math.abs(u) - end * 0.55) / (end * 0.45))) + 0.45 * (vnoise3(u * 0.22, side * 5.3, 1.7, seed) - 0.5);
  const outline = (u, side) => half * Math.sqrt(Math.max(0, 1 - (u / (end + 0.3)) ** 2)) * (0.93 + 0.14 * vnoise3(u * 0.17, side * 3.1, 8.3, seed + 1));
  const flank = (u, side, h) => Math.max(1.9 * h + 0.6, outline(u, side) - crown(u, side));
  // height above the ground at local (u along the axis, w across it)
  const rel = (u, w) => {
    const h = hermite(K, u);
    if (h <= 0) return 0;
    const side = w < 0 ? -1 : 1, c = crown(u, side), aw = Math.abs(w);
    if (aw <= c) return h;
    return h * (1 - sstep((aw - c) / flank(u, side, h)));
  };
  const along = (x, z) => (x - x0) * fx + (z - z0) * fz;
  const across = (x, z) => (x - x0) * rx + (z - z0) * rz;
  const at = (x, z) => {
    const r = rel(along(x, z), across(x, z));
    return r > 0.004 ? CURB + r : -Infinity;
  };
  const wMax = half * 1.08 + 0.6;
  hill(x0, z0, Math.hypot(end, wMax) + 0.5, CURB + J.top, at, 'mound', CURB);
  JUMP_HILLS.push({ x: x0, z: z0, fx, fz, rx, rz, table: J.table, edge: J.table + J.round * 0.5, end, top: CURB + J.top, at, along, across });

  // ---- the mesh: a grid over (u, w), finer across the crown's edges
  const us = [], ws = [];
  for (let u = -end - 0.4; u <= end + 0.4 + 1e-6; u += 0.4) us.push(u);
  for (let w = -wMax - 0.4; w <= wMax + 0.4 + 1e-6; w += 0.36) ws.push(w);
  const nu = us.length, nw = ws.length, pos = new Float32Array(nu * nw * 3), col = new Float32Array(nu * nw * 3);
  const r = mulberry32(seed * 977 + 13);
  // pulka runs down the faces: [w, the face (+1 / -1), wiggle phase]
  const sleds = [];
  for (let k = 0; k < 7; k++) sleds.push([(r() - 0.5) * 2 * (J.core + 1.2), r() < 0.5 ? -1 : 1, r() * TAU]);
  for (let i = 0; i < nu; i++) {
    const u = us[i];
    for (let j = 0; j < nw; j++) {
      const w = ws[j], h = rel(u, w), aw = Math.abs(w), side = w < 0 ? -1 : 1;
      const c = crown(u, side);
      // lumps: none on the drive line (2 cm), up to 14 cm out on the flanks
      const fl = sstep((aw - c + 0.2) / 1.6);
      const n = vnoise3(u * 0.9, w * 0.9, 3.1, seed + 3) - 0.5, n2 = vnoise3(u * 2.6, w * 2.6, 0.4, seed + 5) - 0.5;
      let y = h > 0.004 ? CURB + h + (n * 0.04 + n2 * 0.02) * (1 - fl) * Math.min(1, h * 3) + (n * 0.22 + n2 * 0.08) * fl * Math.min(1, h * 1.5) : CURB - 0.07;
      if (h > 0.004 && h < 0.08) y = Math.max(y, CURB + h * 0.5);
      const k = (i * nw + j) * 3;
      pos[k] = x0 + fx * u + rx * w; pos[k + 1] = y; pos[k + 2] = z0 + fz * u + rz * w;
      // colour: snow, the packed lane greyer, two wheel ruts (the kids' sleds and a car or two have
      // been at it), pulka runs down the faces, grit at the foot, mottling
      let m = 0.9 + 0.1 * vnoise3(u * 0.35, w * 0.35, 9.1, seed + 51);
      const lane = (1 - sstep((aw - 1.0) / 0.9)) * Math.min(1, h * 2);
      m *= 1 - 0.05 * lane;
      const rut = Math.max(0, 1 - Math.abs(aw - 0.78) / 0.16) * (0.55 + 0.45 * (vnoise3(u * 0.6, side, 2.2, seed + 9))) * Math.min(1, h * 2.5);
      m *= 1 - 0.13 * rut;
      for (const [sw, sf, ph] of sleds) {
        if (u * sf < J.table * 0.6) continue;
        const d = Math.abs(w - sw - 0.35 * Math.sin(u * 0.45 + ph));
        if (d < 0.3) m *= 1 - 0.07 * (1 - d / 0.3) * Math.min(1, h * 2);
      }
      const grit = (1 - sstep((h - 0.02) / 0.35)) * (0.55 + 0.45 * (vnoise3(u * 1.7, w * 1.7, 5.5, seed + 7)));
      const cr = m * (1 - 0.3 * grit), cg = m * (1 - 0.33 * grit), cb = m * (1 - 0.38 * grit);
      col[k] = cr; col[k + 1] = cg; col[k + 2] = cb;
    }
  }
  const idx = [];
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nw - 1; j++) {
    const a = i * nw + j, b = a + 1, c = a + nw, d = c + 1;
    // (skip cells wholly under the ground)
    if (pos[a * 3 + 1] < CURB - 0.05 && pos[b * 3 + 1] < CURB - 0.05 && pos[c * 3 + 1] < CURB - 0.05 && pos[d * 3 + 1] < CURB - 0.05) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let up = 0; for (let i = 0; i < g.attributes.normal.count; i++) up += g.attributes.normal.getY(i);
  if (up < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  f.S.use('snow').add(g, null, null);
  // the vertex colours (add() gave every vertex the surface's white)
  const p = f.S.parts[f.S.parts.length - 1], c = p.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * col[i * 3], c.getY(i) * col[i * 3 + 1], c.getZ(i) * col[i * 3 + 2]);
  // lumps of packed snow round the foot, out of the way of the faces
  for (let k = 0; k < 22; k++) {
    const u = (r() - 0.5) * 2 * end * 0.75, side = k % 2 ? 1 : -1;
    const h = hermite(K, u), w = side * (crown(u, side) + flank(u, side, h) * (0.88 + 0.22 * r()));
    chunks(f.S, x0 + fx * u + rx * w, z0 + fz * u + rz * w, 1 + Math.floor(r() * 3), 0.32 + r() * 0.22, 0.9, CURB, r, 0.82);
  }
  return JUMP_HILLS[JUMP_HILLS.length - 1];
}

// A round mound's collider: its top at distance d from (x, z) follows places.js mound's cap.
export function domeHill(x, z, rad, h, y0 = CURB) {
  const at = (px, pz) => {
    const t = Math.hypot(px - x, pz - z) / rad;
    if (t >= 1) return -Infinity;
    return y0 - 0.02 + h * (1 - t * t) * (1 - t * 0.15) ** 2 * 1.02;
  };
  return hill(x, z, rad, y0 + h, at, 'mound', y0);
}
