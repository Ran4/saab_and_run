// Car models: realistic bodies lofted from side/plan profiles, built once per type and shared.
//
// Coordinates (the car's local frame, = car.tilt): +z forward, +x = the car's LEFT (drivers sit
// on +x), y up, ground at y = 0, origin at the middle of the car (the paint's fake curvature
// assumes exactly this, DESIGN.md 10.2).
//
// A body is two lofts over stations along z:
//   - the lower body: a closed section (underbody, side with bulge and tuck-under, shoulder,
//     crowned top = bonnet / waist / boot deck), wheel arches cut out of its bottom edge;
//   - the greenhouse: an open shell on the top surface from the belt line up to the roof
//     (side glass band, a corner band = A/B/C pillars and roof rails, the roof with windscreen and
//     rear window). Every quad is classified as paint / black trim / glass by where it is.
// Bumpers, rubbing strips and trims are swept profiles; lamps, grille, mirrors, handles,
// interior are small primitives. Glass goes into its own geometry, lamp lenses into a 'lights'
// geometry with a per-vertex channel (car.js drives the channels), plates/badges are placed by
// car.js from `plates` / `badges`. Wheels are unit-sized geometries per style, instanced by car.js.

import { THREE, GeoBuilder, PRIM, mat, scene, realMaterials, injectSceneShading } from '../gfx.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// Curves

// Monotone cubic interpolation through [[t, v], ...] (t ascending): smooth, never overshoots.
export function mono(pts) {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export function lin(pts) {
  const n = pts.length;
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------
// Mesher: indexed triangles per (surface, colour), handed to a GeoBuilder at the end.

class Mesher {
  constructor() { this.m = new Map(); }
  part(s, c) {
    const k = s + '|' + c;
    let p = this.m.get(k);
    if (!p) { p = { s, c, pos: [], nrm: [], idx: [] }; this.m.set(k, p); }
    return p;
  }
  vert(p, v, n) { p.pos.push(v[0], v[1], v[2]); p.nrm.push(n[0], n[1], n[2]); return p.pos.length / 3 - 1; }
  tri(s, c, a, b, cc, na, nb, nc) {
    const p = this.part(s, c);
    const i = this.vert(p, a, na), j = this.vert(p, b, nb), k = this.vert(p, cc, nc);
    p.idx.push(i, j, k);
  }
  // Flat triangle (normal from the winding).
  ftri(s, c, a, b, cc) {
    const n = triNormal(a, b, cc);
    if (!n) return;
    this.tri(s, c, a, b, cc, n, n, n);
  }
  // An axis-aligned box (flat shaded), optionally turned about y.
  box(s, c, x, y, z, w, h, d, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    geo.rotateY(ry); geo.translate(x, y, z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 3) this.ftri(s, c, [p.getX(i), p.getY(i), p.getZ(i)], [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)]);
    return this;
  }
  into(g) {
    for (const p of this.m.values()) {
      if (!p.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.nrm, 3));
      geo.setIndex(p.idx);
      g.use(p.s).add(geo, p.c);
    }
    return g;
  }
}
function triNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l < 1e-12 ? null : [nx / l, ny / l, nz / l];
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------------------------------------------------------------------------------------
// Loft: rings[i] = { z, pts: [[x, y], ...] } = the LEFT half section (+x) from the bottom centre
// (x = 0) round to the top centre (x = 0). Mirrored to the right half. Quads are classified by
// cls(i, j, mid) -> { s, c, inset?, inner? } | null. smoothBands: j indices where a new smoothing
// band starts (normals don't average across); creaseI: station indices with a hard edge.

function loft(M, G, rings, o) {
  const n = rings[0].pts.length, I = rings.length;
  const P = rings.map((r) => r.pts.map(([x, y]) => [x, y, r.z]));
  const bands = o.smoothBands || [0];
  const bandOf = (j) => { let b = 0; for (let k = 0; k < bands.length; k++) if (bands[k] <= j) b = k; return b; };
  const creaseI = o.creaseI || new Set();
  // Area-weighted face normals (outward = (d - b) x (c - a) for a=(i,j) b=(i+1,j) c=(i+1,j+1) d=(i,j+1)).
  const F = [];
  for (let i = 0; i < I - 1; i++) {
    F.push([]);
    for (let j = 0; j < n - 1; j++) {
      const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
      const ex = d[0] - b[0], ey = d[1] - b[1], ez = d[2] - b[2];
      const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
      F[i].push([ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx]);
    }
  }
  const vn = (qi, qj, ii, jj) => {
    const band = bandOf(qj);
    let sx = 0, sy = 0, sz = 0;
    for (let a = ii - 1; a <= ii; a++) {
      if (a < 0 || a >= I - 1) continue;
      if (creaseI.has(ii) && a !== qi) continue;
      for (let b = jj - 1; b <= jj; b++) {
        if (b < 0 || b >= n - 1 || bandOf(b) !== band) continue;
        const f = F[a][b];
        sx += f[0]; sy += f[1]; sz += f[2];
      }
    }
    if (jj === 0 || jj === n - 1) sx = 0; // centreline: the mirrored half evens x out
    const l = Math.hypot(sx, sy, sz);
    if (l < 1e-12) { const f = norm3(F[qi][qj]); return f; }
    return [sx / l, sy / l, sz / l];
  };
  for (let i = 0; i < I - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
      const f = F[i][j];
      if (Math.hypot(f[0], f[1], f[2]) < 1e-9) continue; // degenerate
      const mid = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      const k = o.cls(i, j, mid);
      if (!k) continue;
      const na = vn(i, j, i, j), nb = vn(i, j, i + 1, j), nc = vn(i, j, i + 1, j + 1), nd = vn(i, j, i, j + 1);
      if (k.clip) {
        // split the quad by planes and classify each piece by its centroid
        for (const tri of [[[a, na], [d, nd], [c, nc]], [[a, na], [c, nc], [b, nb]]]) {
          for (const poly of clipPolys([tri], k.clip)) {
            let cx = 0, cy = 0, cz = 0;
            for (const [v] of poly) { cx += v[0]; cy += v[1]; cz += v[2]; }
            const q = k.pick([cx / poly.length, cy / poly.length, cz / poly.length]);
            if (!q) continue;
            for (let t = 1; t < poly.length - 1; t++) {
              emitTri(q.glass ? G : M, q.s, q.c, poly[0], poly[t], poly[t + 1], q.inset || 0, false);
              if (q.inner) emitTri(q.inner.glass ? G : M, q.inner.s, q.inner.c, poly[0], poly[t], poly[t + 1], q.inner.off, true);
            }
          }
        }
        continue;
      }
      emitQuad(k.glass ? G : M, k.s, k.c, a, b, c, d, na, nb, nc, nd, k.inset || 0, false);
      if (k.inner) emitQuad(k.inner.glass ? G : M, k.inner.s, k.inner.c, a, b, c, d, na, nb, nc, nd, k.inner.off, true);
    }
  }
  return P;
}
// One quad on the left half plus its mirror on the right. inset moves it inwards along the normal,
// flip emits the inside face (reversed winding, normals inwards).
function emitQuad(M, s, c, a, b, cc, d, na, nb, nc, nd, inset, flip) {
  const off = (v, nv) => [v[0] - nv[0] * inset, v[1] - nv[1] * inset, v[2] - nv[2] * inset];
  let A = off(a, na), B = off(b, nb), C = off(cc, nc), D = off(d, nd);
  let NA = na, NB = nb, NC = nc, ND = nd;
  if (flip) { NA = neg(na); NB = neg(nb); NC = neg(nc); ND = neg(nd); }
  const mx = (v) => [-v[0], v[1], v[2]];
  if (!flip) {
    M.tri(s, c, A, D, C, NA, ND, NC); M.tri(s, c, A, C, B, NA, NC, NB);
    M.tri(s, c, mx(A), mx(C), mx(D), mx(NA), mx(NC), mx(ND)); M.tri(s, c, mx(A), mx(B), mx(C), mx(NA), mx(NB), mx(NC));
  } else {
    M.tri(s, c, A, C, D, NA, NC, ND); M.tri(s, c, A, B, C, NA, NB, NC);
    M.tri(s, c, mx(A), mx(D), mx(C), mx(NA), mx(ND), mx(NC)); M.tri(s, c, mx(A), mx(C), mx(B), mx(NA), mx(NC), mx(NB));
  }
}
const neg = (v) => [-v[0], -v[1], -v[2]];
// One triangle [[pos, nrm] x3] (already wound outwards, left half) plus its mirror.
function emitTri(M, s, c, A, B, C, inset, flip) {
  const off = ([v, n]) => [v[0] - n[0] * inset, v[1] - n[1] * inset, v[2] - n[2] * inset];
  const a = off(A), b = off(B), cc = off(C);
  let na = A[1], nb = B[1], nc = C[1];
  if (flip) { na = neg(na); nb = neg(nb); nc = neg(nc); }
  const mx = (v) => [-v[0], v[1], v[2]];
  if (!flip) { M.tri(s, c, a, b, cc, na, nb, nc); M.tri(s, c, mx(a), mx(cc), mx(b), mx(na), mx(nc), mx(nb)); }
  else { M.tri(s, c, a, cc, b, na, nc, nb); M.tri(s, c, mx(a), mx(b), mx(cc), mx(na), mx(nb), mx(nc)); }
}
// Split polygons [[pos, nrm], ...] by planes [a, b, c, d] (a x + b y + c z + d = 0), both sides kept.
function clipPolys(polys, planes) {
  for (const pl of planes) {
    const out = [];
    for (const poly of polys) {
      const dist = poly.map(([v]) => pl[0] * v[0] + pl[1] * v[1] + pl[2] * v[2] + pl[3]);
      if (dist.every((d) => d >= -1e-7) || dist.every((d) => d <= 1e-7)) { out.push(poly); continue; }
      const pos = [], negs = [];
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length, di = dist[i], dj = dist[j];
        if (di >= 0) pos.push(poly[i]); if (di <= 0) negs.push(poly[i]);
        if ((di > 0 && dj < 0) || (di < 0 && dj > 0)) {
          const t = di / (di - dj), [va, na] = poly[i], [vb, nb] = poly[j];
          const v = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
          const n = norm3([na[0] + (nb[0] - na[0]) * t, na[1] + (nb[1] - na[1]) * t, na[2] + (nb[2] - na[2]) * t]);
          pos.push([v, n]); negs.push([v, n]);
        }
      }
      if (pos.length >= 3) out.push(pos);
      if (negs.length >= 3) out.push(negs);
    }
    polys = out;
  }
  return polys;
}

// Flat end cap of a loft ring (front: dir = +1, rear: -1), fan from the section's centroid.
function cap(M, ring, dir, cls) {
  const pts = ring.pts, z = ring.z;
  let cy = 0;
  for (const p of pts) cy += p[1];
  cy /= pts.length;
  const C = [0, cy, z], N = [0, 0, dir];
  for (let j = 0; j < pts.length - 1; j++) {
    const a = [pts[j][0], pts[j][1], z], b = [pts[j + 1][0], pts[j + 1][1], z];
    if (Math.abs((a[0] - C[0]) * (b[1] - C[1]) - (a[1] - C[1]) * (b[0] - C[0])) < 1e-9) continue;
    const k = cls((a[0] + b[0]) / 3, (a[1] + b[1] + cy) / 3);
    if (!k) continue;
    const am = [-a[0], a[1], z], bm = [-b[0], b[1], z];
    if (dir > 0) { M.tri(k.s, k.c, C, a, b, N, N, N); M.tri(k.s, k.c, C, bm, am, N, N, N); }
    else { M.tri(k.s, k.c, C, b, a, N, N, N); M.tri(k.s, k.c, C, am, bm, N, N, N); }
  }
}

// Sweep a profile [[n, y], ...] (n = offset along the path's outward normal) along a plan path
// [{ x, z, nx, nz }, ...]. Smooth normals along the path, creases at profile indices `creases`.
function sweep(M, s, c, path, prof, o = {}) {
  const K = path.length, J = prof.length;
  const P = path.map((q) => prof.map(([n, y]) => [q.x + q.nx * n, y, q.z + q.nz * n]));
  const creases = new Set(o.creases || []);
  // Profile tangent normals in (n, y) space -> 3D using the path normal. Profile runs bottom ->
  // top on the outside, so the outward normal of segment (p, p+1) is (dy, -dn) rotated... compute
  // per segment and average at smooth joints.
  const segN = [];
  for (let p = 0; p < J - 1; p++) {
    const dn = prof[p + 1][0] - prof[p][0], dy = prof[p + 1][1] - prof[p][1], l = Math.hypot(dn, dy) || 1;
    segN.push([dy / l, -dn / l]); // (outward-n component, y component)
  }
  const nAt = (k, p, seg) => {
    let a = segN[seg];
    if (p === seg + 1 && p < J - 1 && !creases.has(p)) a = [a[0] + segN[p][0], a[1] + segN[p][1]];
    if (p === seg && p > 0 && !creases.has(p)) a = [a[0] + segN[p - 1][0], a[1] + segN[p - 1][1]];
    const l = Math.hypot(a[0], a[1]) || 1, q = path[k];
    return [q.nx * a[0] / l, a[1] / l, q.nz * a[0] / l];
  };
  for (let k = 0; k < K - 1; k++) {
    for (let p = 0; p < J - 1; p++) {
      const a = P[k][p], b = P[k + 1][p], cc = P[k + 1][p + 1], d = P[k][p + 1];
      const na = nAt(k, p, p), nb = nAt(k + 1, p, p), nc = nAt(k + 1, p + 1, p), nd = nAt(k, p + 1, p);
      // Path runs right -> left round the front (or left -> right round the rear): pick the winding
      // that faces outwards.
      const fn = triNormal(a, b, cc) || triNormal(a, cc, d);
      if (!fn) continue;
      if (fn[0] * na[0] + fn[1] * na[1] + fn[2] * na[2] >= 0) { M.tri(s, c, a, b, cc, na, nb, nc); M.tri(s, c, a, cc, d, na, nc, nd); }
      else { M.tri(s, c, a, cc, b, na, nc, nb); M.tri(s, c, a, d, cc, na, nd, nc); }
    }
  }
  if (o.caps !== false) {
    for (const k of [0, K - 1]) {
      const ring = P[k];
      let cx = 0, cy = 0, cz = 0;
      for (const v of ring) { cx += v[0]; cy += v[1]; cz += v[2]; }
      const C = [cx / J, cy / J, cz / J];
      const q = path[k], q2 = path[k === 0 ? 1 : K - 2];
      const out = norm3([q.x - q2.x, 0, q.z - q2.z]);
      for (let p = 0; p < J - 1; p++) {
        const a = ring[p], b = ring[p + 1];
        const fn = triNormal(C, a, b);
        if (!fn) continue;
        if (fn[0] * out[0] + fn[2] * out[2] >= 0) M.tri(s, c, C, a, b, out, out, out);
        else M.tri(s, c, C, b, a, out, out, out);
      }
    }
  }
}
// A plan path round the front (dir +1) or rear (dir -1) of the car: the side at x = -hw (car's
// right) from z = zs, a corner of radius r, across at z = zf, the other corner, back to zs.
function wrapPath(hw, zf, zs, r, dir, steps = 6, step = 0.12) {
  const out = [];
  const zc = zf - dir * r;
  const push = (x, z, nx, nz) => out.push({ x, z, nx, nz });
  const n0 = Math.max(1, Math.round(Math.abs(zc - zs) / step));
  for (let k = 0; k <= n0; k++) push(-hw, zs + (zc - zs) * (k / n0), -1, 0);
  for (let k = 1; k <= steps; k++) {
    const a = (k / steps) * Math.PI / 2;
    push(-hw + r - r * Math.cos(a), zc + dir * r * Math.sin(a), -Math.cos(a), dir * Math.sin(a));
  }
  const n1 = Math.max(1, Math.round((2 * (hw - r)) / (step * 1.6)));
  for (let k = 1; k < n1; k++) push(-hw + r + (2 * (hw - r)) * (k / n1), zf, 0, dir);
  for (let k = 0; k <= steps; k++) {
    const a = Math.PI / 2 - (k / steps) * Math.PI / 2;
    push(hw - r + r * Math.cos(a), zc + dir * r * Math.sin(a), Math.cos(a), dir * Math.sin(a));
  }
  for (let k = 1; k <= n0; k++) push(hw, zc + (zs - zc) * (k / n0), 1, 0);
  return out;
}
// Path along one side (x sign sx) from z0 to z1 at a fixed outward offset from a surface x(z).
function sidePath(sx, z0, z1, xAt, step = 0.15) {
  const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step)), out = [];
  for (let k = 0; k <= n; k++) { const z = z0 + (z1 - z0) * (k / n); out.push({ x: sx * xAt(z), z, nx: sx, nz: 0 }); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lights geometry: lenses with a channel (car.js drives the channel intensities) and an emission
// colour. Channels: 0 low beam + front position, 1 tail (+ brake), 2 indicator left, 3 indicator
// right, 4 reversing, 5 brake only (third brake light), 6 sign (taxi roof sign, bus destination),
// 7 always off (unlit outer lenses, fog lamps), 8 beacon (the sopbil's amber roof lamps).
// Unlit, a lens is glossy (clear coat) over either a reflector (metallic grey: headlamps, clear
// indicators, reversing lenses) or a coloured plastic (red, amber), so it shows reflections instead
// of reading as a matte sticker. Lit, it adds a saturated emission (pure red and a deep amber, kept
// under the tone mapper's shoulder by car.js), and brake / indicator / reversing lamps also get a
// soft additive glow quad.
// Every lens carries its own face coordinates (lq: metres and -1..1 across the lens) and a pattern
// (lpat): 0 plain, 1 a reflector headlamp (vertical flutes in the glass, lit: a bright core round
// the bulb fading to the edges), 2 a ribbed rear lamp (horizontal ribs, darker grooves), 3 a round
// projector / round headlamp (a small bright core, a dimmer ring).
export const CH = { head: 0, tail: 1, indL: 2, indR: 3, rev: 4, brake: 5, sign: 6, fog: 7, beacon: 8 };
const NCH = 10;
const LENS = { head: 0x747a80, tail: 0x620605, ind: 0xb0560a, indClear: 0x7a7e82, rev: 0x84888c, brake: 0x620605, sign: 0xe8d070, fog: 0x7a8086, beacon: 0xc06a14 };
const METAL = { head: 0.8, tail: 0.3, ind: 0.3, indClear: 0.8, rev: 0.8, brake: 0.3, sign: 0.0, fog: 0.85, beacon: 0.2 };
const EMIT = { head: 0xfff1dc, tail: 0xff0000, ind: 0xff6000, rev: 0xfff6ec, brake: 0xff0000, sign: 0xffe9a0, beacon: 0xff6a00 };
// glow: colour, channel threshold, gain. The tail lamps glow only when braking (the channel is 0.25
// for the tail light and 0.8 with the brake); red stays a deep red disc.
const GLOW = { tail: [0xff0000, 0.35, 2.6], brake: [0xff0000, 0.2, 1.5], ind: [0xff6000, 0.2, 2.0], rev: [0xfff0e0, 0.2, 1.0], beacon: [0xff6a00, 0.3, 2.0] };
const PAT = { head: 1, tail: 2, brake: 2 };

class LightBuilder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.emi = []; this.ch = []; this.met = []; this.lq = []; this.pat = []; this.idx = []; this.glow = []; }
  // geo: a unit primitive (PRIM.box: the lens face is its x/y; PRIM.cyl turned by lamp(): x/z),
  // m: its matrix, face: { w, h, round, pat } for the lens coordinates.
  add(geo, m, ch, lens, emit, metal = 0.3, face = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const lp = g.attributes.position.clone();
    g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal, base = this.pos.length / 3;
    const lc = new THREE.Color(lens), ec = new THREE.Color(emit);
    const w = face?.w ?? 0.1, h = face?.h ?? 0.1, pat = face?.pat ?? 0;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(lc.r, lc.g, lc.b);
      this.emi.push(ec.r, ec.g, ec.b);
      this.ch.push(ch);
      this.met.push(metal);
      const u = clamp(lp.getX(i) * 2, -1, 1), v = clamp((face?.round ? -lp.getZ(i) : lp.getY(i)) * 2, -1, 1);
      this.lq.push(u * w / 2, v * h / 2, u, v);
      this.pat.push(pat);
      this.idx.push(base + i);
    }
  }
  // lamp(kind, x, y, z, w, h, d, opts): a box lens (or a round one: opts.round) on both sides
  // (opts.mirror !== false). Indicators get the left/right channel by side. opts: rx, ry, rz,
  // lens / emit / metal (override the tables), clear (clear indicator lens), glow: false, pat
  // (lens pattern, default by kind: headlamps fluted, rear lamps ribbed, round headlamps projector).
  lamp(kind, x, y, z, w, h, d, o = {}) {
    const sides = o.mirror === false || x === 0 ? [1] : [1, -1];
    const lensKey = kind === 'ind' && o.clear ? 'indClear' : kind;
    const pat = o.pat ?? (o.round && kind === 'head' ? 3 : PAT[kind] ?? 0);
    for (const sx of sides) {
      let ch = CH[kind] ?? 0;
      if (kind === 'ind') ch = sx * Math.sign(x || 1) > 0 ? CH.indL : CH.indR;
      const geo = o.round ? PRIM.cyl(o.seg || 14) : PRIM.box();
      const m = o.round
        ? mat(sx * x, y, z, Math.PI / 2 + (o.rx || 0), sx * (o.ry || 0), 0, w, d, h)
        : mat(sx * x, y, z, o.rx || 0, sx * (o.ry || 0), sx * (o.rz || 0), w, h, d);
      this.add(geo, m, ch, o.lens ?? LENS[lensKey], o.emit ?? EMIT[kind === 'fog' ? 'head' : kind], o.metal ?? METAL[lensKey], { w, h, round: !!o.round, pat });
      const gl = GLOW[kind];
      if (gl && o.glow !== false) {
        // facing: the box's +z turned like the lamp; rear lamps placed without a turn face -z
        const e = new THREE.Euler(o.rx || 0, sx * (o.ry || 0), 0, 'YXZ');
        const f = new THREE.Vector3(0, 0, 1).applyEuler(e);
        if (o.ry === undefined && z < 0) f.negate();
        if (o.up) f.set(0, 1, 0);
        this.glow.push({ c: [sx * x + f.x * d * 0.5, y + f.y * d * 0.5, z + f.z * d * 0.5], n: [f.x, f.y, f.z], s: clamp(Math.max(w, h) * 0.9, 0.1, 0.34), col: gl[0], thr: gl[1], gain: gl[2], ch, omni: !!o.omni });
      }
    }
    return this;
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('lemit', new THREE.Float32BufferAttribute(this.emi, 3));
    g.setAttribute('lch', new THREE.Float32BufferAttribute(this.ch, 1));
    g.setAttribute('lmet', new THREE.Float32BufferAttribute(this.met, 1));
    g.setAttribute('lq', new THREE.Float32BufferAttribute(this.lq, 4));
    g.setAttribute('lpat', new THREE.Float32BufferAttribute(this.pat, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
  // The glow quads (one per lamp that can glow): position = the lamp's centre, gUV the corner.
  buildGlow() {
    if (!this.glow.length) return null;
    const pos = [], nrm = [], uv = [], col = [], k = [], sz = [], idx = [];
    const c = new THREE.Color();
    for (const q of this.glow) {
      const base = pos.length / 3;
      c.set(q.col).multiplyScalar(q.gain ?? 1);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(...q.c); nrm.push(...q.n); uv.push(u, v); col.push(c.r, c.g, c.b); k.push(q.ch, q.thr, q.omni ? 1 : 0); sz.push(q.s);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('gN', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('gUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('gE', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('gK', new THREE.Float32BufferAttribute(k, 3));
    g.setAttribute('gS', new THREE.Float32BufferAttribute(sz, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// The lofted body. P: see the type definitions below.

const BLACK = 0x141516, TRIM = 0x1b1c1e, UNDER = 0x101112, DASH = 0x161718, INTER = 0x2c2c2e, HEADLINER = 0x5a5854;
const SEAL = 0x0e0f10;

function stationsFor(P) {
  const keys = [P.z0, P.z1, ...(P.keys || [])];
  for (const list of P.lod ? [P.belt] : [P.hw, P.yb, P.belt]) for (const [z] of list) keys.push(z);
  const gh = P.gh;
  if (gh && P.lod) {
    keys.push(gh.ws, gh.rw, gh.z0, gh.z1);
    for (const [z] of gh.c) keys.push(z);
  } else if (gh) {
    keys.push(gh.ws, gh.ws + P.seal, gh.rw, gh.rw - P.seal, gh.z0, gh.z1);
    if (gh.rwSealB) keys.push(gh.z0 + gh.rwSealB);
    for (const q of gh.side) {
      const [a, b, fs, rs] = Array.isArray(q) ? [q[0], q[1], 0, 0] : [q.f, q.r, q.fs || 0, q.rs || 0];
      if (!fs) keys.push(a, a - P.seal);
      if (!rs) keys.push(b, b + P.seal);
    }
    for (const [z] of gh.c) keys.push(z);
    for (const [z] of gh.e) keys.push(z);
  }
  for (const z of P.creases || []) keys.push(z);
  const na = P.lod ? 8 : 10;
  for (const a of P.axles) {
    const R = P.arch.r;
    keys.push(a - R - 0.006, a + R + 0.006);
    for (let k = 0; k <= na; k++) keys.push(a - R + (2 * R * k) / na);
  }
  const zs = [...new Set(keys.map((z) => Math.round(z * 1000) / 1000))].filter((z) => z >= P.z0 - 1e-6 && z <= P.z1 + 1e-6).sort((a, b) => a - b);
  const out = [zs[0]];
  for (let k = 1; k < zs.length; k++) {
    const a = out[out.length - 1], b = zs[k];
    if (b - a < (P.lod ? 0.03 : 0.003)) continue;
    const n = Math.ceil((b - a) / (P.lod ? Math.max(0.4, P.step || 0) : (P.step || 0.15)));
    for (let q = 1; q < n; q++) out.push(a + ((b - a) * q) / n);
    out.push(b);
  }
  return out;
}

export function buildLoftBody(P) {
  const M = new Mesher(), G = new Mesher();
  const HW = mono(P.hw), YB = mono(P.yb), BELT = mono(P.belt);
  const sideDX = P.sideLin ? lin(P.side) : mono(P.side), rS = P.shoulder, crown = P.crown, sill = P.sill;
  // The side section is sampled densely (round 3): the panels are convex in section now, so a
  // highlight is a gradient that slides down the door instead of a flat band lighting up at once. A
  // feature line (creaseF) is a station of its own, but the normals are smoothed across it (a hard
  // normal break drew a white shoulder band with a knife edge in the low sun) unless P.creaseHard.
  let sideF = P.lod ? (P.sideFLod || [0, 0.3, 0.6, 0.84, 1]) : P.sideF || [0, 0.08, 0.18, 0.3, 0.42, 0.54, 0.65, 0.75, 0.84, 0.92, 1];
  if (P.creaseF && !P.lod) sideF = [...new Set([...sideF.filter((v) => Math.abs(v - P.creaseF) > 0.035), P.creaseF])].sort((a, b) => a - b);
  const jCrease = P.creaseF && P.creaseHard && !P.lod ? 2 + sideF.indexOf(P.creaseF) : -1;
  const ginset = P.gh?.inset ?? 0.035;
  P.seal ??= 0.02;
  const archY = (z) => {
    let y = -1;
    for (const a of P.axles) {
      const d = Math.abs(z - a);
      if (d <= P.arch.r + 1e-6) y = Math.max(y, P.arch.y + Math.sqrt(Math.max(0, P.arch.r * P.arch.r - d * d)));
    }
    return y;
  };
  const xTopAt = (z) => HW(z) + sideDX(1) - rS;
  // the top's crown across the car; P.crownZ ([[z, crown], ...]) varies it along the car (a flat
  // clamshell bonnet, a near-vertical tail panel that must not bulge backwards)
  const CROWN = P.crownZ ? mono(P.crownZ) : () => crown;
  const topY = (z, x) => { const xt = xTopAt(z); return BELT(z) + CROWN(z) * (1 - Math.min(1, (x / xt) ** 2)); };
  // the greenhouse's base is inset from the shoulder (a ledge along the belt); gh.insetZ ([[z,
  // inset], ...]) varies it, e.g. 0 at a hatchback's C-pillar so the pillar flows into the body side
  const INS = P.gh?.insetZ ? mono(P.gh.insetZ) : () => ginset;
  const xBAt = (z) => xTopAt(z) - INS(z);
  // the body side's half-width at height y: the side profile, then round the shoulder's arc
  const sideX = (z, y) => {
    const yTop = BELT(z) - rS;
    if (y <= yTop) return HW(z) + sideDX(clamp((y - sill) / (yTop - sill), 0, 1));
    const dy = Math.min(rS, y - yTop);
    return xTopAt(z) + Math.sqrt(Math.max(0, rS * rS - dy * dy));
  };
  P._fn = { HW, YB, BELT, sideDX, xTopAt, topY, xBAt, archY, sideX };

  // ---- lower body
  const zs = stationsFor(P);
  const rings = [];
  let jTop0 = 0, jB = 0;
  for (const z of zs) {
    const hw = HW(z), yt = BELT(z);
    let yb = YB(z);
    const ay = archY(z);
    if (ay > yb) yb = ay;
    const pts = [[0, yb]];
    const ySideTop = yt - rS;
    pts.push([hw + sideDX(0) - (P.tuck ?? 0.05), Math.min(yb, ySideTop)]);
    for (const f of sideF) {
      let y = sill + f * (ySideTop - sill);
      if (y < yb) y = yb;
      if (y > ySideTop) y = ySideTop;
      const ff = clamp((y - sill) / (ySideTop - sill), 0, 1);
      pts.push([hw + sideDX(ff), y]);
    }
    const xt = xTopAt(z);
    for (const a of P.lod ? (rS >= 0.06 ? [30, 60] : [45]) : rS >= 0.06 ? [18, 36, 54, 72] : [30, 60]) { const r = (a * Math.PI) / 180; pts.push([xt + rS * Math.cos(r), ySideTop + rS * Math.sin(r)]); }
    jTop0 = pts.length;
    const xb = xBAt(z);
    const tops = P.lod ? [xt, xb, 0] : [xt, xt - ginset * 0.5, xb, xb * 0.75, xb * 0.48, xb * 0.22, 0];
    jB = jTop0 + (P.lod ? 1 : 2);
    for (const x of tops) pts.push([x, topY(z, x)]);
    rings.push({ z, pts });
  }
  const creaseI = new Set();
  const archEdges = [];
  for (const a of P.axles) archEdges.push(a - P.arch.r, a + P.arch.r, a - P.arch.r - 0.006, a + P.arch.r + 0.006);
  zs.forEach((z, i) => {
    if ((P.creases || []).some((c) => Math.abs(c - z) < 0.002)) creaseI.add(i);
    if (archEdges.some((c) => Math.abs(c - z) < 0.0015)) creaseI.add(i);
  });
  const gh = P.gh;
  const inCabin = (z) => gh && z < gh.cab1 && z > gh.cab0;
  const bodyPaint = P.paintSurf || 'paint';
  loft(M, G, rings, {
    smoothBands: jCrease > 0 ? [0, 1, jCrease] : [0, 1],
    creaseI,
    cls: (i, j, mid) => {
      const z = mid[2];
      if (j === 0) return { s: 'plastic', c: UNDER };
      if (P.lowerCls) { const k = P.lowerCls(z, mid[1], j, mid[0]); if (k) return k; }
      if (j >= jB && gh && z < gh.z1 && z > gh.z0 && inCabin(z)) {
        if (P.lod) return { s: 'plastic', c: DASH };
        if (z > (gh.dash ?? gh.ws)) return { s: 'fabric', c: DASH };
        return { s: 'fabric', c: P.interior ?? INTER };
      }
      return { s: bodyPaint, c: 0xffffff };
    },
  });
  cap(M, rings[rings.length - 1], 1, (x, y) => (P.frontCap ? P.frontCap(x, y) : { s: bodyPaint, c: 0xffffff }));
  cap(M, rings[0], -1, (x, y) => (P.rearCap ? P.rearCap(x, y) : { s: bodyPaint, c: 0xffffff }));

  // ---- greenhouse
  if (gh) {
    const C = mono(gh.c), E = mono(gh.e), XE = mono(gh.xe);
    const cw = gh.corner ?? 0.06, seal = P.seal;
    const gz = zs.filter((z) => z >= gh.z0 - 1e-6 && z <= gh.z1 + 1e-6);
    const grings = [];
    for (const z of gz) {
      const xb = xBAt(z), yb0 = topY(z, xb), base0 = topY(z, 0);
      const yc = Math.max(base0, C(z));
      let ye = Math.max(yb0, Math.min(E(z), yc - 0.012));
      const xe = Math.min(XE(z), xb);
      // side from B to E: straight with a slight outward bow; seal points near both ends
      const hs = ye - yb0;
      const sp = (t) => [xb + (xe - xb) * t + (gh.bow ?? 0.012) * Math.sin(Math.PI * t) * Math.min(1, hs / 0.3), yb0 + hs * t];
      const ts = hs > 1e-4 ? Math.min(0.45, seal / hs) : 0;
      const pts = [[xb, yb0], sp(ts), sp(0.5), sp(1 - ts), [xe, ye]];
      // corner band (pillar / roof rail), then the roof (or windscreen / rear window) to the centre
      const e2y = Math.min(ye + cw * 0.85, yc - 0.004), e2x = Math.max(0.05, xe - cw * 0.45 * Math.min(1, (e2y - ye) / (cw * 0.85 + 1e-6)));
      pts.push([e2x, e2y]);
      const e3x = Math.max(0.04, e2x - seal);
      const roofY = (x) => yc - (yc - e2y) * (x / e2x) ** 2;
      pts.push([e3x, roofY(e3x)]);
      for (const f of P.lod ? [0.5, 0] : [0.7, 0.42, 0.18, 0]) pts.push([e3x * f, roofY(e3x * f)]);
      grings.push({ z, pts });
    }
    // side windows: zones with a front and a rear edge, each a line z = z0 + slope * (y - y0)
    const zones = gh.side.map((q) => (Array.isArray(q) ? { f: q[0], r: q[1], fs: 0, rs: 0 } : { fs: 0, rs: 0, ...q }));
    const y0 = gh.y0 ?? 1.0;
    const zf = (q, y) => q.f + q.fs * (y - y0), zr = (q, y) => q.r + q.rs * (y - y0);
    const plane = (z, sl) => [0, -sl, 1, -(z - sl * y0)];
    const planes = [];
    for (const q of zones) planes.push(...(P.lod ? [plane(q.f, q.fs), plane(q.r, q.rs)] : [plane(q.f, q.fs), plane(q.f - seal, q.fs), plane(q.r + seal, q.rs), plane(q.r, q.rs)]));
    const zoneAt = (z, y) => zones.find((q) => z <= zf(q, y) + 1e-6 && z >= zr(q, y) - 1e-6);
    const sideZone = (z) => zones.find((q) => z <= Math.max(zf(q, 0.9), zf(q, 1.5)) + 0.3 && z >= Math.min(zr(q, 0.9), zr(q, 1.5)) - 0.3);
    // non-glass parts of the side band: [zFront, zRear, surface, colour, slope] (slope: the
    // bounds move by slope * (y - y0), for raked pillars)
    const pillar = (z, y = y0) => { for (const [a, b, s, c, sl = 0] of gh.pillars || []) { const o = sl * (y - y0); if (z <= a + o && z >= b + o) return { s, c }; } return gh.pillar || { s: bodyPaint, c: 0xffffff }; };
    const roofK = gh.roof || { s: bodyPaint, c: 0xffffff };
    const cornerK = gh.cornerSurf || { s: bodyPaint, c: 0xffffff };
    const beltK = gh.belt || { s: 'plastic', c: SEAL };
    const sealK = { s: 'plastic', c: SEAL };
    const glassK = P.lod ? { s: 'plastic', c: 0x14181d, inset: 0.01 } : { s: 'tinted', c: null, glass: true, inset: 0.012, inner: { s: 'tinted', c: null, glass: true, off: 0.016 } };
    // inside: the headliner over the roof and rails, dark trim panels on the pillars below them (a
    // pale pillar lining lit through the glass read as an empty, lit box from behind)
    const innerHead = P.lod ? (k) => k : (k) => ({ ...k, inner: { s: 'fabric', c: HEADLINER, off: 0.018 } });
    const innerSide = P.lod ? (k) => k : (k) => ({ ...k, inner: { s: 'fabric', c: 0x2a2a2c, off: 0.018 } });
    loft(M, G, grings, {
      smoothBands: [0, 4],
      cls: (i, j, mid) => {
        const z = mid[2];
        // gh.rwWrap: the rear window wraps round into the pillars (the corner band is glass), framed by
        // black rubber along the side band's top and (rwSealB) along its foot
        if (gh.rwWrap && z < gh.rw && j >= 3) {
          if (j === 3) return P.lod ? innerSide(pillar(z, mid[1])) : innerSide(sealK);
          if (!P.lod && (z < gh.z0 + (gh.rwSealB ?? 0) || z > gh.rw - seal)) return innerHead(sealK);
          return glassK;
        }
        if (j <= 3) {
          if (!sideZone(z)) return innerSide(pillar(z, mid[1]));
          return {
            clip: planes,
            pick: (c) => {
              const q = zoneAt(c[2], c[1]);
              if (!q) return innerSide(pillar(c[2], c[1]));
              if (j === 0) return innerSide(beltK);
              if (P.lod) return glassK;
              if (j === 3 || c[2] > zf(q, c[1]) - seal || c[2] < zr(q, c[1]) + seal) return innerSide(sealK);
              return glassK;
            },
          };
        }
        if (j === 4) return innerHead(gh.cornerAt ? gh.cornerAt(z) || cornerK : cornerK);
        if (z > gh.ws) return !P.lod && (j === 5 || z < gh.ws + seal) ? innerHead(sealK) : glassK;
        if (z < gh.rw) {
          // gh.rwX: the rear window ends at |x| = rwX (body colour outside it: the C/D-pillars wrap
          // round the corner instead of the glass)
          if (gh.rwX && !P.lod) return { clip: [[1, 0, 0, -gh.rwX], [1, 0, 0, -(gh.rwX - seal)]], pick: (c) => (c[0] > gh.rwX ? innerHead(roofK) : (c[0] > gh.rwX - seal || c[2] > gh.rw - seal) ? innerHead(sealK) : glassK) };
          if (gh.rwX && P.lod) return mid[0] > gh.rwX ? roofK : glassK;
          return !P.lod && (j === 5 || z > gh.rw - seal) ? innerHead(sealK) : glassK;
        }
        return innerHead(roofK);
      },
    });
    P._gh = { C, E, XE, rings: grings };
  }
  return { M, G, rings };
}

// ---------------------------------------------------------------------------------------------
// Helpers for details on a lofted body.

// A strip lying on the lower body's side between heights y0..y1 (absolute), z0..z1, standing out
// by `out`, as a swept rounded profile (rubbing strips, chrome trims, door shut lines).
function sideStrip(M, P, s, c, z0, z1, y0, y1, out = 0.012, round = true) {
  const f = P._fn;
  for (const sx of [1, -1]) {
    const path = sidePath(sx, z1, z0, (z) => f.sideX(z, (y0 + y1) / 2), P.lod ? 0.8 : 0.15);
    const h = y1 - y0;
    const prof = round ? [[-0.01, y0], [out * 0.6, y0 + h * 0.08], [out, y0 + h * 0.35], [out, y0 + h * 0.65], [out * 0.6, y0 + h * 0.92], [-0.01, y1]] : [[-0.01, y0], [out, y0], [out, y1], [-0.01, y1]];
    sweep(M, s, c, path, prof, { creases: round ? [] : [1, 2] });
  }
}
// A dark shut line following the lower body side at station z, from y0 up to y1.
function shutLineV(M, P, z, y0, y1, w = 0.005) {
  if (P.lod) return;
  const f = P._fn;
  for (const sx of [1, -1]) {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const ya = y0 + ((y1 - y0) * k) / n, yb = y0 + ((y1 - y0) * (k + 1)) / n;
      const xa = f.sideX(z, ya) + 0.0015, xb = f.sideX(z, yb) + 0.0015;
      const a = [sx * xa, ya, z - w], b = [sx * xb, yb, z - w], c = [sx * xb, yb, z + w], d = [sx * xa, ya, z + w];
      if (sx > 0) { M.ftri('plastic', SEAL, a, b, c); M.ftri('plastic', SEAL, a, c, d); }
      else { M.ftri('plastic', SEAL, a, c, b); M.ftri('plastic', SEAL, a, d, c); }
    }
  }
}
// A dark shut line along the side at height y from z0 to z1.
function shutLineH(M, P, y, z0, z1, w = 0.005) {
  if (P.lod) return;
  const f = P._fn;
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.1));
  for (const sx of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
      const xa = f.sideX(za, y) + 0.0015, xb = f.sideX(zb, y) + 0.0015;
      const a = [sx * xa, y - w, za], b = [sx * xb, y - w, zb], c = [sx * xb, y + w, zb], d = [sx * xa, y + w, za];
      const fn = triNormal(a, b, c);
      if (!fn) continue;
      if (fn[0] * sx > 0) { M.ftri('plastic', SEAL, a, b, c); M.ftri('plastic', SEAL, a, c, d); }
      else { M.ftri('plastic', SEAL, a, c, b); M.ftri('plastic', SEAL, a, d, c); }
    }
  }
}
// A dark line on the top surface (bonnet / boot lid edges) at |x| = x from z0 to z1.
function shutLineTop(M, P, x, z0, z1, w = 0.005) {
  if (P.lod) return;
  const f = P._fn;
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.1));
  for (const sx of [1, -1]) for (let k = 0; k < n; k++) {
    const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
    const pa = (xx, z) => [sx * xx, f.topY(z, xx) + 0.0015, z];
    const a = pa(x - w, za), b = pa(x - w, zb), c = pa(x + w, zb), d = pa(x + w, za);
    const fn = triNormal(a, b, c);
    if (!fn) continue;
    if (fn[1] > 0) { M.ftri('plastic', SEAL, a, b, c); M.ftri('plastic', SEAL, a, c, d); }
    else { M.ftri('plastic', SEAL, a, c, b); M.ftri('plastic', SEAL, a, d, c); }
  }
}
// A line across the top surface at station z (bonnet front edge, boot lid edge).
function shutLineAcross(M, P, z, xMax, w = 0.005) {
  if (P.lod) return;
  const f = P._fn, n = 8;
  for (let k = -n; k < n; k++) {
    const xa = (xMax * k) / n, xb = (xMax * (k + 1)) / n;
    const a = [xa, f.topY(z, Math.abs(xa)) + 0.0015, z - w], b = [xb, f.topY(z, Math.abs(xb)) + 0.0015, z - w];
    const c = [xb, f.topY(z, Math.abs(xb)) + 0.0015, z + w], d = [xa, f.topY(z, Math.abs(xa)) + 0.0015, z + w];
    M.ftri('plastic', SEAL, a, d, c); M.ftri('plastic', SEAL, a, c, b);
  }
}

// Where the lower body's surface is at (x, y) seen from the front (dir +1) or the rear (-1):
// { x, z, nx, nz, ry } with (nx, nz) the outward normal in plan (left side, x > 0).
export function surfAt(P, x, y, dir) {
  const f = P._fn, zEnd = dir > 0 ? P.z1 : P.z0;
  const half = (z) => f.sideX(z, y);
  if (x <= half(zEnd)) return { x, z: zEnd, nx: 0, nz: dir, ry: dir > 0 ? 0 : Math.PI };
  let a = zEnd, b = zEnd - dir * 0.9;
  for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (half(m) < x) a = m; else b = m; }
  const z = (a + b) / 2, e = 0.008;
  const sl = (half(z + e) - half(z - e)) / (2 * e);
  const l = Math.hypot(1, sl), nx = 1 / l, nz = -sl / l;
  return { x, z, nx, nz, ry: Math.atan2(nx, nz) };
}
// The lower body's surface seen along z from the front (dir +1) or rear (-1) at (x, y): the first
// station inward whose section contains the point. -> { z, n: [nx, ny, nz], rx, ry } (left side).
function insideSec(P, z, x, y) {
  const f = P._fn;
  let yb = f.YB(z); const ay = f.archY(z); if (ay > yb) yb = ay;
  if (y < yb) return false;
  const xt = f.xTopAt(z);
  if (y > f.topY(z, Math.min(x, xt))) return false;
  return x <= f.sideX(z, y);
}
// (stepped inwards first, then bisected: a single 1.2 m probe could land in a wheel arch, where a low
// point is outside every section, and drop a lamp on top of the arch)
function surfZ(P, x, y, dir) {
  const zEnd = dir > 0 ? P.z1 : P.z0;
  if (insideSec(P, zEnd, x, y)) return zEnd;
  let a = zEnd, b = null;
  for (let k = 1; k <= 30; k++) { const z = zEnd - dir * k * 0.04; if (insideSec(P, z, x, y)) { b = z; break; } a = z; }
  if (b === null) return zEnd - dir * 1.2;
  for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if (insideSec(P, m, x, y)) b = m; else a = m; }
  return (a + b) / 2;
}
export function surf3(P, x, y, dir) {
  const z = surfZ(P, x, y, dir), e = 0.01;
  const dzdx = (surfZ(P, x + e, y, dir) - surfZ(P, Math.max(0, x - e), y, dir)) / (x - e < 0 ? x + e : 2 * e);
  const dzdy = (surfZ(P, x, y + e, dir) - surfZ(P, x, y - e, dir)) / (2 * e);
  // surface z = s(x, y); outward normal ~ (-ds/dx, -ds/dy, 1) * dir
  let n = norm3([-dzdx * dir, -dzdy * dir, 1]);
  n = [n[0] * 1, n[1], n[2] * dir];
  if (!Number.isFinite(n[0])) n = [0, 0, dir];
  return { x, y, z, n, ry: Math.atan2(n[0], n[2]), rx: -Math.asin(clamp(n[1], -1, 1)) };
}
// A lamp lens sitting on the body at (x, y) (mirrored), facing out of the surface.
function lampOn(L, P, kind, x, y, w, h, dir, o = {}) {
  const d = o.d ?? 0.05, q = surf3(P, x, y, dir), sink = d / 2 - (o.proud ?? 0.005);
  L.lamp(kind, q.x - q.n[0] * sink, y - q.n[1] * sink, q.z - q.n[2] * sink, w, h, d, { ...o, ry: q.ry, rx: q.rx });
}
// A lamp that wraps round the corner: n pieces from x0 to x1.
function lampStrip(L, P, kind, x0, x1, y, h, dir, n = 3, o = {}) {
  const w = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const xc = x0 + w * (k + 0.5), q = surf3(P, xc, y, dir);
    // width along the surface, not along x
    const ww = (w / Math.max(0.2, Math.hypot(q.n[2], q.n[1]))) * 1.04;
    lampOn(L, P, kind, xc, y, Math.min(ww, 0.4), h, dir, o);
  }
}
// A band of boxes following the body round a corner (a lamp surround wrapping round the front),
// x0..x1 in n pieces, each turned to the surface under it (one flat box stuck out past the corner and
// showed its pale end face).
function bandOn(g, P, surf, color, x0, x1, y, h, dir, n = 4, o = {}) {
  const w = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const xc = x0 + w * (k + 0.5), q = surf3(P, xc, y, dir);
    const ww = (w / Math.max(0.2, Math.hypot(q.n[2], q.n[1]))) * 1.06;
    boxOn(g, P, surf, color, xc, y, Math.min(ww, 0.45), h, dir, o);
  }
}
// A body detail box on the surface (black intake, chrome strip...), mirrored.
function boxOn(g, P, surf, color, x, y, w, h, dir, o = {}) {
  const d = o.d ?? 0.04, q = surf3(P, x, y, dir), sink = d / 2 - (o.proud ?? 0.004);
  for (const sx of o.mirror === false || x === 0 ? [1] : [1, -1]) g.use(surf).add(PRIM.box(), color, mat(sx * (q.x - q.n[0] * sink), y - q.n[1] * sink, q.z - q.n[2] * sink, q.rx, sx * q.ry, 0, w, h, d));
}
// An extruded outline [[x, y], ...] laid on the body's face at the front/rear (centred on x = 0),
// pitched to the surface at its middle.
function shapeOn(g, P, surf, color, pts, dir, d = 0.03, o = {}) {
  let cy = 0; for (const p of pts) cy += p[1]; cy /= pts.length;
  const q = surf3(P, o.x ?? 0.001, cy, dir), sink = d / 2 - (o.proud ?? 0.004);
  const geo = shapeGeo(pts.map(([x, y]) => [x, y - cy]), d, o.bevel ?? 0.005);
  g.use(surf).add(geo, color, mat(0, cy - q.n[1] * sink, q.z - q.n[2] * sink, q.rx, dir > 0 ? 0 : Math.PI, 0));
}
// An extruded polygon [[x, y], ...] (x across the car), depth d along z, bevelled, at z facing dir.
function shapeGeo(pts, d, bevel = 0.006) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

// Wheel-well liners: dark boxes inboard of each tyre so you can't see through the arches.
function wheelWells(g, P) {
  g.use('plastic');
  for (const a of P.axles) for (const sx of [1, -1]) {
    const x = sx * (P.wx - P.ww / 2 - 0.09);
    g.box(UNDER, x, P.arch.y + P.arch.r * 0.25, a, 0.14, P.arch.r * 1.3, P.arch.r * 1.9);
  }
}

// Seats, dash, steering wheel - just enough to read through the glass.
function interior(g, P, o) {
  if (P.lod) return;
  // seatY = the cushion surface (a bust's origin; its hips sit 0.12 above and 0.12 forward)
  const fab = o.fabric ?? 0x34363a;
  const sY = o.seatY, sz = o.seatZ, sx = o.seatX;
  g.use('fabric');
  for (const x of [sx, -sx]) {
    g.box(fab, x, sY - 0.07, sz + 0.14, 0.5, 0.14, 0.52);                        // cushion
    g.box(fab, x, sY + 0.3, sz - 0.1, 0.48, 0.62, 0.13, 0, -0.2);               // back
    g.box(fab, x, sY + 0.72, sz - 0.19, 0.26, 0.19, 0.1, 0, -0.14);             // headrest
  }
  if (o.rearZ !== undefined) {
    g.box(fab, 0, sY - 0.06, o.rearZ + 0.25, sx * 2 + 0.5, 0.14, 0.5);
    g.box(fab, 0, sY + 0.28, o.rearZ - 0.02, sx * 2 + 0.52, 0.56, 0.14, 0, -0.2);
  }
  g.use('fabric');
  // dashboard under the windscreen; the steering wheel where the busts' hands are (0.5 m ahead of
  // the seat point, ~0.5 m above it), on the driver's side (+x)
  if (o.dashZ !== undefined) {
    g.box(DASH, 0, o.dashY - 0.12, o.dashZ, o.dashW, 0.24, 0.4);
    // (vans and trucks: a flatter wheel, lower - o.wheelTilt, o.wheelY)
    const wz = sz + 0.5, wy = sY + (o.wheelY ?? 0.5);
    g.add(PRIM.torus(), 0x1a1a1c, mat(sx, wy, wz, o.wheelTilt ?? -0.45, 0, 0, 0.38, 0.38, 0.5));
    const cl = Math.hypot(o.dashZ - 0.2 - wz, o.dashY - 0.1 - wy);
    g.box(0x1a1a1c, sx, (wy + o.dashY - 0.1) / 2, (wz + o.dashZ - 0.2) / 2, 0.05, 0.05, cl, 0, -Math.atan2(o.dashY - 0.1 - wy, o.dashZ - 0.2 - wz));
  }
}

// Exterior mirrors: a housing shaped like the real thing - flat at the back where the glass sits,
// rounded at the front and over the top and bottom, tapering towards the door (about 0.135 x 0.09 x
// 0.075 m; round 2's 0.19 m housings stood 0.25 m off the pillar and looked truck-sized) - on a short
// sail at the front of the door glass. The outline is a spline and the normals are smoothed (round 2's
// polygon outline drew sunlit facets as beige strips). LOD: a dark box (matte plastic, never pale).
const mirrorCache = new Map();
function mirrorGeo(w, h, d, sx) {
  const key = [w, h, d, sx].join('|');
  if (mirrorCache.has(key)) return mirrorCache.get(key);
  // plan outline (x out from the door, z forward; the back edge at z = 0), drawn counter-clockwise
  const V = (x, z) => new THREE.Vector2(sx * x, -z);
  const sh = new THREE.Shape();
  const round = [[w, d * 0.14], [w * 0.99, d * 0.5], [w * 0.9, d * 0.84], [w * 0.68, d], [w * 0.38, d * 0.94], [w * 0.12, d * 0.76], [0, d * 0.6]];
  sh.moveTo(0, 0);
  sh.lineTo(sx * w * 0.86, 0);
  sh.splineThru(round.map(([x, z]) => V(x, z)));
  sh.lineTo(0, 0);
  const bt = Math.min(0.022, h * 0.26), bs = Math.min(0.016, d * 0.2);
  // shape (x, -z) extruded along +z, then turned so the extrusion runs up y (see rotateX below)
  let geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, h - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 4, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(h - 2 * bt) / 2, 0);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  mirrorCache.set(key, geo);
  return geo;
}
function mirrors(g, P, x, y, z, o = {}) {
  const k = o.surf ?? 'plastic', c = o.color ?? BLACK, h = o.h ?? 0.09, w = o.w ?? 0.135, d = o.d ?? 0.075;
  if (P.lod || o.box) {
    for (const sx of [1, -1]) {
      g.use(P.lod ? 'plastic' : k).box(P.lod ? BLACK : c, sx * (x + 0.012 + w / 2), y, z, w, h, 0.07);
      if (!P.lod) { g.use(k).box(c, sx * (x + 0.02), y, z, 0.05, 0.04, 0.04); g.use('chrome').box(0x8a9096, sx * (x + 0.03 + w / 2), y, z - 0.042, w - 0.02, h - 0.02, 0.005); }
    }
    return;
  }
  for (const sx of [1, -1]) {
    g.use('plastic').box(BLACK, sx * (x + 0.006), y - 0.025, z + 0.02, 0.04, 0.04, 0.1, sx * 0.1);          // sail on the door
    g.use(k).add(mirrorGeo(w, h, d, sx), c, mat(sx * (x + 0.012), y, z - 0.025, 0, sx * 0.08, 0));         // housing
    g.use('chrome').box(0x6e747a, sx * (x + 0.012 + w * 0.49), y, z - 0.027, w * 0.84, h * 0.7, 0.006, sx * 0.08);  // the glass
  }
}
// A point of the greenhouse section at station z: ring point j (0 belt, 4 top of the side band,
// 5 top of the corner band = the roof edge), interpolated between the loft's stations.
function ghPt(P, z, j) {
  const R = P._gh.rings;
  if (z <= R[0].z) return R[0].pts[j];
  for (let k = 0; k < R.length - 1; k++) {
    const a = R[k], b = R[k + 1];
    if (z <= b.z) { const t = (z - a.z) / (b.z - a.z || 1); return [a.pts[j][0] + (b.pts[j][0] - a.pts[j][0]) * t, a.pts[j][1] + (b.pts[j][1] - a.pts[j][1]) * t]; }
  }
  return R[R.length - 1].pts[j];
}
// A thin rail along the roof edge (drip rails) from z0 to z1, w wide (outwards) x h tall: an outer
// face and a top face lying along the corner band's upper edge.
function ghRail(M, P, z0, z1, surf, col, w = 0.012, h = 0.012) {
  if (P.lod) return;
  const n = Math.max(2, Math.round(Math.abs(z0 - z1) / 0.08));
  const pt = (z, ox, oy) => { const p = ghPt(P, z, 5); return [p[0] + ox, p[1] + oy, z]; };
  for (let k = 0; k < n; k++) {
    const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
    // outer face (x out), top face (y up); left side, then mirrored
    for (const [a, b, c, d] of [[pt(za, w, -h * 0.4), pt(zb, w, -h * 0.4), pt(zb, w, h * 0.6), pt(za, w, h * 0.6)], [pt(za, w, h * 0.6), pt(zb, w, h * 0.6), pt(zb, -0.004, h * 0.6), pt(za, -0.004, h * 0.6)]]) {
      for (const sx of [1, -1]) {
        const m = (v) => [sx * v[0], v[1], v[2]];
        const A = m(a), B = m(b), C = m(c), D = m(d);
        const fn = triNormal(A, B, C);
        if (!fn) continue;
        const out = fn[0] * sx + fn[1] > 0;
        if (out) { M.ftri(surf, col, A, B, C); M.ftri(surf, col, A, C, D); } else { M.ftri(surf, col, A, C, B); M.ftri(surf, col, A, D, C); }
      }
    }
  }
}
// The underside seen under the bumpers: a dark floor pan between the sills and the subframes, tank and
// spare-wheel well in the overhangs (the space under a car is never empty daylight).
function underbody(g, P, o = {}) {
  if (P.lod && !o.lod) return;
  const f = P._fn, [zR, zF] = [Math.min(...P.axles), Math.max(...P.axles)], R = P.arch.r;
  const y = Math.max(0.12, P.sill - 0.08), hw = P.wx - P.ww / 2 - 0.12;
  g.use('plastic');
  const span = (a, b) => g.box(UNDER, 0, y + 0.06, (a + b) / 2, hw * 1.6, 0.12, Math.max(0.1, b - a));
  g.box(UNDER, 0, y + 0.03, (zR + zF) / 2, hw * 2, 0.06, zF - zR - 2 * R);
  span(zF - R * 0.3, P.z1 - 0.28);
  span(P.z0 + 0.24, zR + R * 0.3);
}
function handles(g, P, z, y, o = {}) {
  if (P.lod) return;
  const f = P._fn;
  for (const sx of [1, -1]) for (const zz of [].concat(z)) g.use(o.surf ?? 'plastic').box(o.color ?? BLACK, sx * (f.sideX(zz, y) + 0.008), y, zz, 0.02, 0.035, 0.16);
}
function wipers(g, P, z, n = 2) {
  if (P.lod) return;
  const f = P._fn, y = f.topY(z, 0.2) + 0.02;
  g.use('plastic');
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? 0.1 : -0.35 + k * 0.62;
    g.box(0x111214, x, y, z, 0.55, 0.012, 0.02, 0.08);
  }
}

// ---------------------------------------------------------------------------------------------
// Wheels: unit geometry (tyre radius 1, width 1 along x, outer face at +x). car.js scales each
// instance by (width, r, r) and turns the right-hand ones round.

const wheelCache = new Map();
export function wheelGeometry(style) {
  if (wheelCache.has(style)) return wheelCache.get(style);
  const g = new GeoBuilder();
  const rr = style === 'sport' ? 0.72 : style === 'alloy5' ? 0.66 : 0.6; // rim radius / tyre radius
  // tyre: a lathe round the x axis
  const prof = [[rr - 0.01, 0.38], [rr + 0.04, 0.46], [0.8, 0.5], [0.93, 0.48], [0.99, 0.4], [1.0, 0.28], [1.0, -0.28], [0.99, -0.4], [0.93, -0.48], [0.8, -0.5], [rr + 0.04, -0.46]];
  if (style === 'lod') {
    // far wheels: a dark tyre (tread + sidewall) round a small dark-grey rim, nothing that reads as a
    // pale disc from 50 m
    const l = new THREE.LatheGeometry([[0.58, 0.44], [0.9, 0.5], [0.99, 0.42], [1, 0.3], [1, -0.3], [0.99, -0.42], [0.9, -0.5], [0.58, -0.44]].map(([r, x]) => new THREE.Vector2(r, x)), 12);
    l.rotateZ(-Math.PI / 2);
    g.use('rubber').add(l, 0x161618);
    g.use('metal').add(PRIM.cyl(10), 0x5c6064, mat(0.4, 0, 0, 0, 0, Math.PI / 2, 1.16, 0.02, 1.16));
    g.use('plastic').add(PRIM.cyl(8), 0x1a1b1c, mat(0.415, 0, 0, 0, 0, Math.PI / 2, 0.5, 0.02, 0.5));
    const geo = g.build();
    wheelCache.set(style, geo);
    return geo;
  }
  const lathe = new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), style === 'truck' ? 20 : 18);
  lathe.rotateZ(-Math.PI / 2);
  g.use('rubber').add(lathe, 0x1b1b1d);
  // inner disc (hub/brake shadow) so nothing shows through
  g.use('plastic').add(PRIM.cyl(16), 0x0c0c0d, mat(-0.1, 0, 0, 0, 0, Math.PI / 2, rr * 2, 0.04, rr * 2));
  const face = 0.36;
  const ring = (surf, col, r0, r1, x0, x1, seg = 20) => {
    // a conical annulus from (r0 at x0) to (r1 at x1)
    const pts = [new THREE.Vector2(r0, x0), new THREE.Vector2(r1, x1)];
    const l = new THREE.LatheGeometry(pts, seg);
    l.rotateZ(-Math.PI / 2);
    g.use(surf).add(l, col);
  };
  // dark windows between spokes: annular sectors facing +x, lying on the (dished) face x(r) + lift
  const sectorHoles = (n, r0, r1, half, xAt, col = 0x070708, lift = 0.006) => {
    const pos = [], nrm = [], idx = [];
    const steps = 5;
    const X = typeof xAt === 'function' ? xAt : () => xAt;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + Math.PI / n - half, a1 = a0 + 2 * half;
      const base = pos.length / 3;
      for (let s = 0; s <= steps; s++) {
        const a = a0 + ((a1 - a0) * s) / steps;
        // rounded window: pull the corners in a little
        const t = Math.sin((Math.PI * s) / steps);
        const ri = r0 + (1 - t) * 0.05, ro = r1 - (1 - t) * 0.04;
        pos.push(X(ri) + lift, Math.cos(a) * ri, Math.sin(a) * ri, X(ro) + lift, Math.cos(a) * ro, Math.sin(a) * ro);
        nrm.push(1, 0, 0, 1, 0, 0);
      }
      for (let s = 0; s < steps; s++) { const q = base + s * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    g.use('plastic').add(geo, col);
  };
  if (style === 'saab3' || style === 'alloy5' || style === 'alloy7' || style === 'sport') {
    // cast alloys: a dark mid-grey (a pale disc in the low sun is the cartoon tell), the spoke face
    // dished - it rises ~2 cm from the rim to the hub, so the sky slides across it instead of one
    // flat mirror - a darker recessed centre, black cavities
    const spokes = style === 'saab3' ? 3 : style === 'alloy5' ? 5 : style === 'sport' ? 10 : 7;
    const face0 = style === 'saab3' ? 0x6e7276 : 0x6a6e72, lip = 0x7a7e82;
    const rA = rr - 0.07, rB = 0.17, xA = face - 0.04, xB = face + 0.07;
    const faceX = (r) => xA + (xB - xA) * clamp((rA - r) / (rA - rB), 0, 1);
    ring('metal', lip, rr, rr - 0.05, 0.4, 0.42);              // outer lip
    ring('metal', 0x4e5256, rr - 0.05, rA, 0.42, xA);          // lip slope inwards
    ring('metal', face0, rA, (rA + rB) / 2, xA, faceX((rA + rB) / 2), 24);   // spoke face, dished
    ring('metal', face0, (rA + rB) / 2, rB, faceX((rA + rB) / 2), xB, 24);
    ring('metal', 0x5a5e62, rB, 0.11, xB, xB - 0.02);          // the face dips to the centre
    const half = style === 'saab3' ? 0.66 : style === 'alloy5' ? 0.38 : style === 'sport' ? 0.19 : 0.27;
    sectorHoles(spokes, 0.22, rr - 0.1, half, faceX, 0x060607);
    ring('metal', 0x46494c, 0.11, 0.001, xB - 0.02, xB - 0.01, 12);  // centre cap, recessed
  } else if (style === 'steel') {
    // steel wheel with a plastic hubcap (silver, but not a white disc), domed, small slots
    ring('metal', 0x5a5e62, rr, rr - 0.06, 0.4, 0.4);
    ring('plastic', 0x686c70, rr - 0.05, rr - 0.12, 0.4, face + 0.06);
    ring('plastic', 0x6e7276, rr - 0.12, 0.3, face + 0.06, face + 0.1, 24);
    ring('plastic', 0x72767a, 0.3, 0.18, face + 0.1, face + 0.13, 24);
    ring('plastic', 0x6a6e72, 0.18, 0.001, face + 0.13, face + 0.15);
    sectorHoles(10, rr - 0.22, rr - 0.13, 0.11, (r) => face + 0.06 + 0.04 * clamp((rr - 0.12 - r) / 0.18, 0, 1), 0x1e2022);
  } else if (style === 'van') {
    ring('metal', 0x3a3c3e, rr, rr - 0.08, 0.42, face);
    ring('metal', 0x3a3c3e, rr - 0.08, 0.2, face, face + 0.02);
    ring('plastic', 0x2a2b2c, 0.2, 0.001, face + 0.02, face + 0.08);
    sectorHoles(6, 0.26, 0.38, 0.14, face + 0.02);
  } else { // truck: deep steel disc, raised hub, wheel nuts
    ring('metal', 0x70747a, rr, rr - 0.06, 0.42, 0.1);
    ring('metal', 0x70747a, rr - 0.06, 0.26, 0.1, 0.12);
    ring('metal', 0x64686c, 0.26, 0.18, 0.12, 0.24);
    ring('metal', 0x585c60, 0.18, 0.001, 0.24, 0.26);
    sectorHoles(8, 0.32, 0.46, 0.13, 0.11);
    g.use('chrome');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.cyl(0x9a9ea2, 0.25, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.025, 0.05, 6, 0, 0, Math.PI / 2); }
  }
  const geo = g.build();
  wheelCache.set(style, geo);
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Types

// Shared bits of a model description.
function base(o) {
  return {
    sill: 0.24, shoulder: 0.04, crown: 0.03, step: 0.12, tuck: 0.05,
    side: [[0, -0.05], [0.2, -0.016], [0.45, -0.002], [0.6, 0], [0.75, -0.008], [0.88, -0.026], [1, -0.05]],
    ...o,
  };
}

// The hero: Saab 900 classic, 3-door kombikupé (1987-93 facelift). 4.70 x 1.69 x 1.42 m, wb 2.517.
// Proportions measured off a pure side-view photo (wheelbase as the scale): a long front overhang
// and a flat clamshell bonnet that falls ~0.2 m to a crisp front edge; under it the face is one tall
// band of lamps and grille (lamp lenses ~0.40 x 0.15 m, the corner lamps wrapping round), and below
// that a slim black bumper (~0.24 m) over a thin lip. A tall glasshouse on a 0.93 m belt; a deeply
// wrapped windscreen (45° at the centre, its black A-pillars nearly upright, 56°, set back by the
// wrap); a flat roof; a long door; a small quarter window whose rear edge leans back, leaving a big
// body-coloured C-pillar; the long fastback hatch glass (~20°) running down to within ~0.25 m of
// the tail, a short lid with a crisp lip, then the near-vertical tail panel with the wide ribbed
// lamps and the plate between them; the rear bumper like the front one.
function saab900() {
  const zF = 1.355, zR = zF - 2.517;
  const P = base({
    key: 'saab900', len: 4.70, wid: 1.69, height: 1.42,
    z0: -2.29, z1: 2.26, axles: [zR, zF], wr: 0.31, ww: 0.195, wx: 0.715, wheel: 'saab3',
    arch: { r: 0.355, y: 0.3 },
    keys: [2.17, 2.195, 2.21, 2.225, 2.24, 2.252, -2.283, -2.27, -2.256, -2.242, -2.228, -2.215, -2.2, -2.16, -2.1, -2.02, -1.9],
    // a little plan curvature: the sides bow out ~1 cm at the doors, so highlights slide along the car
    hw: [[-2.29, 0.792], [-2.25, 0.815], [-2.2, 0.83], [-2.05, 0.839], [-1.6, 0.844], [-0.2, 0.851], [1.5, 0.845], [1.85, 0.841], [2.05, 0.835], [2.17, 0.82], [2.23, 0.799], [2.26, 0.775]],
    yb: [[-2.29, 0.32], [-2.12, 0.26], [-1.85, 0.235], [1.85, 0.235], [2.12, 0.27], [2.26, 0.32]],
    belt: [
      // the tail panel (near vertical), the lid's crisp lip, the short lid behind the glass
      [-2.29, 0.55], [-2.283, 0.6], [-2.27, 0.7], [-2.256, 0.79], [-2.242, 0.86], [-2.228, 0.91], [-2.215, 0.94], [-2.2, 0.952],
      [-2.16, 0.958], [-2.1, 0.964], [-2.02, 0.97], [-1.9, 0.958], [-1.5, 0.936], [-1.2, 0.918], [-0.4, 0.905], [0.5, 0.9],
      // the bonnet falls to its front edge, then the lamp face drops to the bumper
      [0.95, 0.895], [1.3, 0.865], [1.7, 0.815], [2.0, 0.784], [2.12, 0.77], [2.17, 0.762], [2.195, 0.752], [2.21, 0.728],
      [2.225, 0.685], [2.24, 0.628], [2.252, 0.575], [2.26, 0.535]],
    crownZ: [[-2.29, 0.006], [-2.215, 0.016], [-2.1, 0.04], [-1.8, 0.048], [1.0, 0.045], [1.6, 0.032], [2.1, 0.022], [2.195, 0.016], [2.26, 0.006]],
    creases: [-2.215, 2.195],
    // round 3: the 900's rounded 'bathtub' sides - convex all the way from the tuck-under to the
    // shoulder, no feature line (the black moulding is the only line along the side)
    crown: 0.045, shoulder: 0.085, sill: 0.235, tuck: 0.055,
    side: [[0, -0.062], [0.15, -0.026], [0.34, -0.007], [0.52, 0], [0.66, -0.004], [0.78, -0.013], [0.89, -0.026], [1, -0.042]],
    seal: 0.024,
    gh: {
      // round 3: a narrower greenhouse (the 900's tumblehome: the glass leans in ~16 deg from a ledge
      // along the shoulder), the hatch glass dropping ~0.1 m at its sides so it wraps round into the
      // C-pillars (rwWrap: the corner band is glass there, framed in black rubber; rwSealB along its foot)
      z0: -2.12, z1: 0.95, cab0: -2.12, cab1: 0.95, dash: 0.5, ws: 0.47, rw: -1.02, inset: 0.03, y0: 0.95, corner: 0.06, bow: 0.016,
      rwWrap: true, rwSealB: 0.05,
      c: [[-2.12, 0.978], [-2.02, 0.997], [-1.9, 1.035], [-1.7, 1.103], [-1.5, 1.17], [-1.25, 1.265], [-1.05, 1.34], [-0.85, 1.395], [-0.6, 1.418], [-0.3, 1.425], [0.3, 1.415], [0.44, 1.397], [0.53, 1.35], [0.7, 1.175], [0.88, 0.975], [0.95, 0.94]],
      e: [[-2.1, 0.966], [-2.0, 0.972], [-1.75, 1.0], [-1.5, 1.06], [-1.25, 1.15], [-1.05, 1.24], [-0.9, 1.3], [-0.7, 1.345], [-0.4, 1.36], [0.0, 1.362], [0.36, 1.35], [0.47, 1.318], [0.73, 0.915], [1.0, 0.87]],
      xe: [[-2.1, 0.72], [-2.0, 0.705], [-1.76, 0.672], [-1.5, 0.632], [-1.2, 0.598], [-0.9, 0.584], [0.0, 0.578], [0.47, 0.594], [0.73, 0.648], [0.95, 0.695]],
      insetZ: [[-2.12, 0.004], [-1.3, 0.006], [-0.9, 0.03], [0.95, 0.03]],
      // the door glass starts behind a raked line: in front of it the black triangular sail the
      // mirror stands on (a 900 signature), behind the B-pillar the small quarter window
      side: [{ f: 0.6, fs: 1.15, r: -0.35 }, { f: -0.40, r: -1.08, rs: 0.62 }],
      pillars: [[-0.35, -0.40, 'plastic', BLACK], [1.4, 0.5, 'plastic', BLACK]],
      // the windscreen surround and A-pillars are black; the roof rail and C-pillars body colour
      cornerAt: (z) => (z > 0.4 ? { s: 'plastic', c: BLACK } : null),
    },
  });
  return P;
}

function saabDetails(P, g, M, L) {
  const f = P._fn, R = P.arch.r, [zR, zF] = P.axles;
  const step = P.lod ? 0.6 : 0.1, cs = P.lod ? 2 : 7;
  // Bumpers: slim (~0.24 m), black, with a recessed band holding a dull grey rubbing strip; they
  // wrap round to the wheel arches, flush with the body sides (1-2 cm proud), and stand ~9 cm proud
  // of the lamp face. A thin black lip under the front one.
  const fb = wrapPath(f.sideX(1.9, 0.42) - 0.006, 2.345 - 0.022, zF + R + 0.03, 0.3, 1, cs, step);
  sweep(M, 'plastic', TRIM, fb, [[-0.12, 0.3], [-0.01, 0.302], [0.012, 0.318], [0.02, 0.35], [0.022, 0.393], [0.012, 0.399], [0.012, 0.447], [0.022, 0.453], [0.02, 0.492], [0.008, 0.517], [-0.02, 0.536], [-0.12, 0.536]], { creases: [1, 4, 5, 6, 7, 10] });
  sweep(M, 'chrome', 0x6e7276, fb, [[0.008, 0.415], [0.017, 0.418], [0.017, 0.43], [0.008, 0.433]], { creases: [1, 2] });
  sweep(M, 'plastic', 0x0c0c0d, wrapPath(f.sideX(1.9, 0.42) - 0.05, 2.345 - 0.05, zF + R + 0.1, 0.3, 1, cs, step), [[-0.06, 0.262], [0.0, 0.266], [0.018, 0.285], [0.018, 0.3], [-0.06, 0.306]], { creases: [1, 3] });
  const rb = wrapPath(f.sideX(-1.9, 0.4) - 0.006, -2.35 + 0.022, zR - R - 0.03, 0.26, -1, cs, step);
  sweep(M, 'plastic', TRIM, rb, [[-0.12, 0.29], [-0.01, 0.292], [0.012, 0.308], [0.02, 0.34], [0.022, 0.383], [0.012, 0.389], [0.012, 0.437], [0.022, 0.443], [0.02, 0.482], [0.008, 0.507], [-0.02, 0.526], [-0.12, 0.526]], { creases: [1, 4, 5, 6, 7, 10] });
  sweep(M, 'chrome', 0x6e7276, rb, [[0.008, 0.405], [0.017, 0.408], [0.017, 0.42], [0.008, 0.423]], { creases: [1, 2] });
  // the black side moulding between the arches, with its grey line
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.035, zF - R - 0.035, 0.4, 0.47, 0.016);
  sideStrip(M, P, 'chrome', 0x6e7276, zR + R + 0.035, zF - R - 0.035, 0.428, 0.436, 0.02);
  // shut lines: the long door, the clamshell bonnet's edge along the wing at lamp-top height, the
  // hatch across the tail above the lamps
  shutLineV(M, P, 0.735, 0.27, 0.92);
  shutLineV(M, P, -0.37, 0.26, 0.94);
  shutLineH(M, P, 0.738, 0.735, 2.175);
  // the hatch's cut across the tail panel just above the lamps (a dark strip lying on the panel)
  if (!P.lod) { boxOn(g, P, 'plastic', SEAL, 0, 0.792, 0.9, 0.006, -1, { proud: 0.001, d: 0.01, mirror: false }); boxOn(g, P, 'plastic', SEAL, 0.6, 0.792, 0.3, 0.006, -1, { proud: 0.001, d: 0.01 }); }
  // The face: one band of lamps and grille, 0.545-0.725 m. The grille: chrome surround, black,
  // three bright slats; the headlamps: big rectangular reflector lenses in a black surround; the
  // corner lamps wrapping round, amber over clear.
  const gp = [[-0.19, 0.712], [0.19, 0.712], [0.182, 0.56], [-0.182, 0.56]];
  shapeOn(g, P, 'chrome', 0xb8bcc0, gp.map(([x, y]) => [x * 1.07, 0.636 + (y - 0.636) * 1.12]), 1, 0.03, { proud: 0.004 });
  shapeOn(g, P, 'plastic', 0x0a0a0b, gp, 1, 0.03, { proud: 0.01 });
  for (const y of [0.598, 0.636, 0.674]) boxOn(g, P, 'chrome', 0x9a9ea2, 0, y, 0.34, 0.01, 1, { proud: 0.016, d: 0.02 });
  bandOn(g, P, 'plastic', 0x0a0a0b, 0.2, 0.785, 0.636, 0.184, 1, 5, { proud: 0.002, d: 0.04 });
  lampOn(L, P, 'head', 0.415, 0.637, 0.395, 0.15, 1, { proud: 0.008, d: 0.04 });
  lampStrip(L, P, 'ind', 0.625, 0.775, 0.68, 0.072, 1, 3, { proud: 0.004, d: 0.04 });
  lampStrip(L, P, 'fog', 0.625, 0.775, 0.597, 0.072, 1, 3, { proud: 0.004, d: 0.04, lens: 0x8a8e92, metal: 0.75 });
  // side repeaters on the front wings
  L.lamp('ind', f.sideX(1.92, 0.665) + 0.003, 0.665, 1.92, 0.05, 0.022, 0.012, { ry: Math.PI / 2 });
  // The tail: wide ribbed lamp units in a black surround either side of the plate panel - red above,
  // amber (outer) and clear reversing (inner) below - the SAAB letters on the lid above them.
  bandOn(g, P, 'plastic', 0x0b0b0c, 0.31, 0.8, 0.668, 0.21, -1, 4, { proud: 0.002, d: 0.03 });
  lampStrip(L, P, 'tail', 0.325, 0.795, 0.712, 0.104, -1, 3, { proud: 0.007 });
  lampStrip(L, P, 'ind', 0.565, 0.795, 0.617, 0.074, -1, 2, { proud: 0.007 });
  lampStrip(L, P, 'rev', 0.325, 0.555, 0.617, 0.074, -1, 2, { proud: 0.007 });
  boxOn(g, P, 'plastic', 0x0b0b0c, 0, 0.668, 0.62, 0.21, -1, { proud: 0.003, d: 0.03 });
  // mirrors, handles, the C-pillar vent, wipers, exhaust
  mirrors(g, P, f.sideX(0.64, 0.86) - 0.1, 0.99, 0.66);
  handles(g, P, -0.2, 0.8);
  if (!P.lod) { sideStrip(M, P, 'plastic', 0x0c0c0d, -1.64, -1.2, 0.79, 0.835, 0.005, false); for (let k = 1; k < 4; k++) sideStrip(M, P, 'plastic', 0x2a2b2d, -1.64, -1.2, 0.79 + k * 0.011, 0.794 + k * 0.011, 0.007, false); }
  wipers(g, P, 0.9);
  // the tailpipe: ~6 cm proud of the bumper, angled down a little, from a silencer under the tail
  if (!P.lod) {
    g.use('plastic').cyl(0x3a3734, -0.45, 0.255, -2.3, 0.026, 0.2, 10, Math.PI / 2 + 0.17, 0, 0);
    g.use('plastic').box(0x161718, -0.3, 0.25, -1.98, 0.62, 0.13, 0.42).box(0x161718, -0.42, 0.24, -1.4, 0.08, 0.06, 0.8);
  }
  interior(g, P, { seatY: 0.33, seatZ: -0.28, seatX: 0.37, rearZ: -1.25, dashZ: 0.6, dashY: 0.93, dashW: 1.5 });
  // the parcel shelf under the hatch glass (dark: a lit cabin through the glass read as an empty box)
  if (!P.lod) g.use('fabric').box(0x1e1e20, 0, 0.935, -1.7, 1.24, 0.02, 0.7);
  // drip rails along the roof edges over the doors
  ghRail(M, P, 0.4, -0.98, 'plastic', BLACK, 0.01, 0.014);
  underbody(g, P);
  wheelWells(g, P);
  const pr = surf3(P, 0, 0.668, -1), bf = surf3(P, 0, 0.636, 1), bl = surf3(P, 0, 0.86, -1);
  return {
    plates: [{ side: 'front', pos: [0, 0.42, 2.362], rx: 0 }, { side: 'rear', pos: [0, 0.668, pr.z - 0.012], rx: pr.rx }],
    badges: [{ text: 'SAAB', pos: [0.0, 0.86, bl.z - 0.004], w: 0.17, h: 0.042, rx: bl.rx, dir: -1 }, { text: 'SAAB', pos: [0.0, 0.636, bf.z + 0.03], w: 0.09, h: 0.022, rx: bf.rx, dir: 1 }],
    seat: [0.37, 0.33, -0.28], rear: [0.33, 0.34, -1.18], exhaust: [-0.45, 0.24, -2.42], hitch: -2.44,
  };
}

// ---- shared detail helpers for the other types

// A wrap-round bumper (black plastic or body colour) at the front (dir +1) or rear (-1).
function bumper(M, P, dir, o) {
  const f = P._fn, zFace = dir > 0 ? P.z1 : P.z0;
  const hw = (o.hw ?? f.HW(zFace - dir * 0.4)) + (o.side ?? 0.012);
  const zf = zFace + dir * (o.out ?? 0.07);
  const path = wrapPath(hw, zf, o.wrap, o.r ?? 0.2, dir, P.lod ? 2 : 6, P.lod ? 0.6 : 0.12);
  const y0 = o.y0, y1 = o.y1, h = y1 - y0, d = o.depth ?? 0.03;
  const prof = [[-0.12, y0], [-0.012, y0 + 0.004], [d * 0.55, y0 + h * 0.14], [d, y0 + h * 0.36], [d * 0.92, y0 + h * 0.72], [d * 0.45, y1 - h * 0.05], [-0.015, y1], [-0.12, y1]];
  sweep(M, o.surf ?? 'plastic', o.color ?? TRIM, path, prof, { creases: [1, 6] });
  if (o.strip) { // a thin contrasting strip along the bumper's face (chrome / black rubber)
    const ys = o.strip.y, hs = o.strip.h ?? 0.03;
    const p2 = wrapPath(hw + d * 0.9, zf + dir * d * 0.9, o.wrap + dir * 0.02, Math.max(0.05, (o.r ?? 0.2) - d), dir, P.lod ? 2 : 6, P.lod ? 0.6 : 0.12);
    sweep(M, o.strip.surf ?? 'chrome', o.strip.color ?? 0xc0c4c8, p2, [[-0.01, ys - hs / 2], [0.006, ys - hs * 0.3], [0.008, ys + hs * 0.3], [-0.01, ys + hs / 2]]);
  }
}
// Roof rails: two bars along the roof.
function roofRails(g, P, x, z0, z1, o = {}) {
  const C = P._gh.C, surf = o.surf ?? 'plastic', col = o.color ?? BLACK;
  const n = 6;
  for (const sx of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
      const ya = C(za) - 0.012 + 0.05, yb = C(zb) - 0.012 + 0.05;
      const len = Math.hypot(zb - za, yb - ya);
      g.use(surf).box(col, sx * x, (ya + yb) / 2, (za + zb) / 2, 0.035, 0.03, len + 0.01, 0, -Math.atan2(yb - ya, zb - za));
    }
    for (const z of [z0 + 0.06, z1 - 0.06]) g.use(surf).box(col, sx * x, C(z) + 0.015, z, 0.04, 0.05, 0.1);
  }
}
// Doors: shut lines (verticals at zs from sill to belt), handles.
function doors(M, g, P, zs, hz, hy) {
  const f = P._fn;
  for (const z of zs) shutLineV(M, P, z, Math.max(f.YB(z), P.sill) + 0.03, f.BELT(z) - 0.02);
  handles(g, P, hz, hy);
}
// The common interior / wells / exhaust / wipers bundle.
// o.cover: an estate's load cover [zFront, zRear, y] (a dark roller blind over the boot at the belt;
// a lit, empty cargo bay through the glass read as an aquarium).
function common(g, M, P, o) {
  wipers(g, P, o.wiperZ, o.wipers ?? 2);
  interior(g, P, o.interior);
  wheelWells(g, P);
  underbody(g, P);
  if (o.cover && !P.lod) {
    const [za, zb, y] = o.cover, w = 2 * (P._fn.xBAt((za + zb) / 2) - 0.06);
    g.use('fabric').box(0x1c1c1e, 0, y, (za + zb) / 2, w, 0.02, Math.abs(za - zb));
  }
  if (o.exhaust && !P.lod) g.use('plastic').cyl(0x3a3734, o.exhaust[0], o.exhaust[1], o.exhaust[2] + 0.07, 0.026, 0.16, 10, Math.PI / 2 + 0.17, 0, 0);
}
// Grille: a black panel with horizontal (or vertical) slats and an optional chrome frame.
function grille(g, x, y, z, w, h, o = {}) {
  const n = o.n ?? 4, col = o.color ?? BLACK;
  g.use('plastic').box(col, x, y, z, w, h, 0.03);
  if (o.frame) { g.use(o.frame === 'black' ? 'plastic' : 'chrome'); const fc = o.frame === 'black' ? 0x0c0c0c : 0xc4c8cc, t = o.ft ?? 0.018; g.box(fc, x, y + h / 2, z + 0.012, w + t, t, 0.03); g.box(fc, x, y - h / 2, z + 0.012, w + t, t, 0.03); g.box(fc, x + w / 2, y, z + 0.012, t, h, 0.03); g.box(fc, x - w / 2, y, z + 0.012, t, h, 0.03); }
  g.use(o.slatSurf ?? 'plastic');
  const sc = o.slat ?? 0x2c2d30;
  if (o.vertical) for (let k = 1; k < n; k++) g.box(sc, x - w / 2 + (w * k) / n, y, z + 0.01, 0.012, h - 0.02, 0.02);
  else for (let k = 1; k < n; k++) g.box(sc, x, y - h / 2 + (h * k) / n, z + 0.01, w - 0.02, 0.012, 0.02);
}

// ---- Volvo 240 (244 saloon, late 80s): a brick with big black bumpers and chrome strips.
function volvo240() {
  const zF = 1.465, zR = zF - 2.64;
  return base({
    key: 'volvo240', len: 4.79, wid: 1.71, height: 1.43, wb: 2.64,
    z0: -2.33, z1: 2.33, axles: [zR, zF], wr: 0.31, ww: 0.185, wx: 0.71, wheel: 'steel',
    arch: { r: 0.365, y: 0.33 }, sill: 0.26, shoulder: 0.016, crown: 0.018, tuck: 0.03,
    hw: [[-2.33, 0.83], [-2.28, 0.853], [2.26, 0.853], [2.33, 0.835]],
    yb: [[-2.33, 0.38], [-2.2, 0.27], [2.2, 0.27], [2.33, 0.38]],
    belt: [[-2.33, 0.89], [-2.27, 0.915], [-1.45, 0.925], [0.72, 0.905], [1.2, 0.865], [2.22, 0.8], [2.33, 0.775]],
    creases: [-2.27, 2.22],
    side: [[0, -0.028], [0.1, -0.008], [0.32, -0.001], [0.55, 0], [0.78, -0.003], [0.92, -0.009], [1, -0.016]],
    gh: {
      z0: -1.42, z1: 0.84, cab0: -1.42, cab1: 0.84, dash: 0.42, ws: 0.4, rw: -0.99, inset: 0.035, y0: 0.95, corner: 0.05, bow: 0.006,
      c: [[-1.42, 0.94], [-1.37, 0.955], [-1.0, 1.405], [-0.88, 1.425], [0.25, 1.43], [0.38, 1.414], [0.78, 0.93], [0.84, 0.92]],
      e: [[-1.33, 0.93], [-0.98, 1.36], [-0.86, 1.378], [0.28, 1.378], [0.39, 1.362], [0.62, 0.92], [0.68, 0.9]],
      xe: [[-1.4, 0.74], [-0.9, 0.705], [0.3, 0.705], [0.6, 0.79]],
      side: [{ f: 0.64, r: -0.24 }, { f: -0.36, r: -1.02, rs: 0.55 }],
      pillars: [[-0.24, -0.36, 'plastic', BLACK]],
      belt: { s: 'chrome', c: 0xb8bcc0 },
    },
  });
}
function volvo240Details(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  bumper(M, P, 1, { y0: 0.3, y1: 0.53, out: 0.1, wrap: zF + R + 0.05, r: 0.08, depth: 0.04, strip: { y: 0.5, h: 0.025 } });
  bumper(M, P, -1, { y0: 0.32, y1: 0.55, out: 0.1, wrap: zR - R - 0.05, r: 0.08, depth: 0.04, strip: { y: 0.52, h: 0.025 } });
  for (const [a, b] of [[zR + R + 0.04, zF - R - 0.04]]) sideStrip(M, P, 'plastic', TRIM, a, b, 0.5, 0.56, 0.014);
  doors(M, g, P, [0.66, -0.3, -1.08], [0.05, -0.85], 0.86);
  shutLineAcross(M, P, 0.86, 0.75);
  shutLineAcross(M, P, -1.5, 0.75);
  shutLineTop(M, P, P._fn.xTopAt(1.5) - 0.01, 0.86, 2.2);
  const z = P.z1 + 0.012;
  grille(g, 0, 0.665, z, 0.62, 0.2, { n: 6, frame: 'chrome', vertical: true, slat: 0x2a2b2d });
  // the diagonal bar across the grille (plain trim, no badge on it)
  g.use('chrome').box(0xc4c8cc, 0, 0.665, z + 0.024, 0.65, 0.016, 0.012, 0, 0, -Math.atan2(0.2, 0.62));
  L.lamp('head', 0.53, 0.665, z + 0.004, 0.36, 0.17, 0.024);
  L.lamp('ind', 0.79, 0.665, P.z1 - 0.03, 0.06, 0.17, 0.08, { ry: 1.2, clear: true });
  g.use('chrome').box(0xb8bcc0, 0.53, 0.665, z - 0.004, 0.38, 0.19, 0.016).box(0xb8bcc0, -0.53, 0.665, z - 0.004, 0.38, 0.19, 0.016);
  // tall rear lamp clusters at the corners: amber / red / white bands, ribbed
  const zr = P.z0 - 0.012;
  L.lamp('ind', 0.65, 0.79, zr, 0.3, 0.07, 0.024, { lens: 0x9a5a16 });
  L.lamp('tail', 0.65, 0.7, zr, 0.3, 0.11, 0.024);
  L.lamp('rev', 0.65, 0.615, zr, 0.3, 0.05, 0.022);
  g.use('plastic');
  for (const sx of [1, -1]) for (let k = 0; k < 7; k++) g.box(0x1a0606, sx * (0.52 + k * 0.043), 0.7, zr - 0.014, 0.004, 0.25, 0.006);
  mirrors(g, P, 0.82, 0.99, 0.56);
  common(g, M, P, { wiperZ: 0.8, exhaust: [-0.5, 0.25, -2.4], interior: { seatY: 0.35, seatZ: -0.15, seatX: 0.38, rearZ: -1.0, dashZ: 0.6, dashY: 0.9, dashW: 1.5 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.41, P.z1 + 0.148] }, { side: 'rear', pos: [0, 0.63, P.z0 - 0.015] }],
    badges: [{ text: 'VOLVO', pos: [-0.45, 0.83, P.z0 - 0.003], w: 0.2, h: 0.05, dir: -1 }],
    seat: [0.38, 0.35, -0.15], rear: [0.36, 0.36, -0.95], exhaust: [-0.5, 0.25, -2.45], hitch: -2.5,
  };
}

// ---- Volvo 740 kombi (745): the long flat roof, near-vertical tailgate, black bumpers.
function volvo740() {
  const zF = 1.535, zR = zF - 2.77;
  return base({
    key: 'volvo740', len: 4.79, wid: 1.75, height: 1.47, wb: 2.77,
    z0: -2.33, z1: 2.33, axles: [zR, zF], wr: 0.315, ww: 0.195, wx: 0.73, wheel: 'alloy7',
    arch: { r: 0.37, y: 0.335 }, sill: 0.26, shoulder: 0.02, crown: 0.018, tuck: 0.035,
    hw: [[-2.33, 0.85], [-2.28, 0.873], [2.25, 0.873], [2.33, 0.85]],
    yb: [[-2.33, 0.38], [-2.2, 0.27], [2.2, 0.27], [2.33, 0.38]],
    belt: [[-2.33, 0.86], [-2.28, 0.9], [-1.0, 0.92], [0.7, 0.905], [1.2, 0.855], [2.2, 0.78], [2.33, 0.755]],
    creases: [-2.28, 2.2],
    side: [[0, -0.03], [0.1, -0.009], [0.32, -0.001], [0.55, 0], [0.78, -0.003], [0.92, -0.01], [1, -0.018]],
    gh: {
      z0: -2.31, z1: 0.88, cab0: -2.31, cab1: 0.88, dash: 0.45, ws: 0.22, rw: -2.17, inset: 0.035, y0: 0.95, corner: 0.05, bow: 0.006,
      c: [[-2.31, 0.92], [-2.27, 0.96], [-2.19, 1.40], [-2.1, 1.425], [-1.5, 1.44], [0.1, 1.44], [0.22, 1.422], [0.82, 0.93], [0.88, 0.92]],
      e: [[-2.29, 0.905], [-2.2, 1.37], [-2.08, 1.385], [0.12, 1.385], [0.25, 1.37], [0.62, 0.91], [0.68, 0.89]],
      xe: [[-2.25, 0.765], [-1.5, 0.745], [0.2, 0.735], [0.6, 0.81]],
      side: [{ f: 0.64, r: -0.28 }, { f: -0.4, r: -1.18 }, { f: -1.3, r: -2.12 }],
      pillars: [[-0.28, -0.4, 'plastic', BLACK], [-1.18, -1.3, 'plastic', BLACK]],
    },
  });
}
function volvo740Details(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  bumper(M, P, 1, { y0: 0.3, y1: 0.54, out: 0.09, wrap: zF + R + 0.05, r: 0.1, depth: 0.04 });
  bumper(M, P, -1, { y0: 0.32, y1: 0.55, out: 0.09, wrap: zR - R - 0.05, r: 0.1, depth: 0.04 });
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.04, zF - R - 0.04, 0.5, 0.57, 0.016);
  doors(M, g, P, [0.68, -0.33, -1.22], [0.05, -0.95], 0.86);
  shutLineAcross(M, P, 0.9, 0.78);
  shutLineV(M, P, -2.25, 0.4, 0.86);
  const z = P.z1 + 0.012;
  grille(g, 0, 0.66, z, 0.64, 0.2, { n: 5, frame: 'chrome', slat: 0x6a6c70, slatSurf: 'chrome' });
  g.use('chrome').box(0xc4c8cc, 0, 0.66, z + 0.026, 0.67, 0.016, 0.012, 0, 0, -Math.atan2(0.2, 0.64));
  L.lamp('head', 0.56, 0.665, z + 0.004, 0.38, 0.17, 0.024);
  L.lamp('ind', 0.82, 0.665, P.z1 - 0.035, 0.07, 0.17, 0.08, { ry: 1.2, clear: true });
  roofRails(g, P, 0.62, -2.1, 0.0);
  // tall rear lamps beside the tailgate
  const zr = P.z0 - 0.012;
  L.lamp('tail', 0.73, 0.76, zr, 0.2, 0.2, 0.024);
  L.lamp('ind', 0.73, 0.62, zr, 0.2, 0.07, 0.024, { lens: 0x9a5a16 });
  L.lamp('rev', 0.73, 0.89, zr, 0.2, 0.05, 0.022);
  g.use('plastic');
  for (const sx of [1, -1]) for (let k = 0; k < 6; k++) g.box(0x1a0606, sx * 0.73, 0.62 + k * 0.05, zr - 0.014, 0.2, 0.004, 0.006);
  mirrors(g, P, 0.84, 1.0, 0.58);
  common(g, M, P, { wiperZ: 0.84, exhaust: [-0.5, 0.25, -2.4], cover: [-1.12, -2.22, 0.93], interior: { seatY: 0.36, seatZ: -0.15, seatX: 0.38, rearZ: -1.05, dashZ: 0.62, dashY: 0.9, dashW: 1.55 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.41, P.z1 + 0.138] }, { side: 'rear', pos: [0, 0.7, P.z0 - 0.015] }],
    badges: [{ text: 'VOLVO', pos: [0, 0.82, P.z0 - 0.004], w: 0.2, h: 0.05, dir: -1 }],
    seat: [0.38, 0.36, -0.15], rear: [0.36, 0.37, -1.0], exhaust: [-0.5, 0.25, -2.45], hitch: -2.5,
  };
}

// ---- Audi A6 (C7-ish): long, smooth, high waist, singleframe grille, chrome window line.
function audi() {
  const zF = 1.545, zR = zF - 2.91;
  return base({
    key: 'audi', len: 4.93, wid: 1.87, height: 1.46, wb: 2.91,
    z0: -2.465, z1: 2.465, axles: [zR, zF], wr: 0.345, ww: 0.235, wx: 0.81, wheel: 'sport',
    arch: { r: 0.39, y: 0.355 }, sill: 0.2, shoulder: 0.03, crown: 0.035, tuck: 0.06, creaseF: 0.82,
    hw: [[-2.465, 0.76], [-2.42, 0.85], [-2.3, 0.91], [-2.0, 0.932], [1.9, 0.935], [2.2, 0.922], [2.32, 0.898], [2.4, 0.862], [2.445, 0.8], [2.465, 0.72]],
    keys: [2.28, 2.34, 2.38, 2.41, 2.44, -2.44, -2.4, -2.34],
    yb: [[-2.465, 0.36], [-2.35, 0.22], [-1.9, 0.19], [1.9, 0.19], [2.3, 0.2], [2.465, 0.3]],
    belt: [[-2.465, 0.84], [-2.43, 0.95], [-2.32, 1.0], [-1.8, 1.025], [-0.5, 1.005], [0.6, 0.985], [1.0, 0.955], [1.6, 0.885], [2.2, 0.81], [2.34, 0.775], [2.42, 0.72], [2.465, 0.6]],
    creases: [],
    side: [[0, -0.066], [0.14, -0.026], [0.34, -0.008], [0.55, -0.001], [0.72, 0.003], [0.8, 0.009], [0.84, 0.007], [0.9, -0.012], [1, -0.044]],
    gh: {
      z0: -2.0, z1: 1.0, cab0: -2.0, cab1: 1.0, dash: 0.5, ws: 0.03, rw: -1.25, inset: 0.05, y0: 1.0, corner: 0.05,
      c: [[-2.0, 1.03], [-1.95, 1.045], [-1.25, 1.415], [-0.9, 1.45], [-0.5, 1.46], [-0.1, 1.45], [0.02, 1.43], [0.95, 1.02], [1.0, 1.0]],
      e: [[-1.86, 1.03], [-1.2, 1.375], [-0.9, 1.398], [-0.1, 1.398], [0.05, 1.38], [0.62, 1.01], [0.7, 0.99]],
      xe: [[-1.8, 0.75], [-1.2, 0.71], [0.0, 0.71], [0.4, 0.76], [0.7, 0.87]],
      side: [{ f: 0.66, r: -0.3 }, { f: -0.42, r: -1.62, rs: 1.3 }],
      pillars: [[-0.3, -0.42, 'plastic', BLACK]],
      belt: { s: 'chrome', c: 0xc0c4c8 }, cornerSurf: { s: 'chrome', c: 0xb8bcc0 },
    },
  });
}
function audiDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles, f = P._fn;
  doors(M, g, P, [0.68, -0.36, -1.5], [0.02, -1.0], 0.93);
  shutLineAcross(M, P, 1.04, 0.78);
  shutLineAcross(M, P, -2.02, 0.75);
  shutLineH(M, P, 0.6, 1.95, 2.42);
  shutLineH(M, P, 0.6, -2.42, -1.85);
  // a crisp feature line under the windows
  sideStrip(M, P, 'paint', 0xffffff, -2.0, 2.0, 0.84, 0.855, 0.004);
  const z = P.z1;
  // Singleframe grille (round 3): a wide trapezoid, ~0.54 m across the top with chamfered corners,
  // 0.71 at the bottom, 0.375 tall, in a thin chrome frame, horizontal slats only, the plate on its
  // lower half (round 2's tall upright grid with the plate under it read as a Rolls-Royce)
  const gp = [[-0.27, 0.675], [0.27, 0.675], [0.32, 0.625], [0.355, 0.27], [-0.355, 0.27], [-0.32, 0.625]];
  shapeOn(g, P, 'chrome', 0xc8ccd0, gp.map(([x, y]) => [x * 1.03, 0.4725 + (y - 0.4725) * 1.035]), 1, 0.03, { proud: 0.006 });
  shapeOn(g, P, 'plastic', 0x08090a, gp, 1, 0.03, { proud: 0.012 });
  for (let k = 0; k < 8; k++) { const y = 0.3 + k * 0.045, w = 2 * (0.352 - (y - 0.27) * 0.1) - 0.05; boxOn(g, P, 'plastic', 0x33363a, 0, y, w, 0.011, 1, { proud: 0.018, d: 0.01 }); }
  // headlamps: a clear unit tapering round the corner, a projector, and the LED strip along its lower
  // edge (dim: no white bloom)
  const yt = 0.752, unit = [[0.37, 0.128], [0.48, 0.13], [0.6, 0.122], [0.7, 0.106], [0.78, 0.086], [0.845, 0.062]];
  for (let k = 0; k < unit.length - 1; k++) {
    const [x0, h0] = unit[k], [x1, h1] = unit[k + 1], h = (h0 + h1) / 2, yc = yt - h / 2, q = surf3(P, (x0 + x1) / 2, yc, 1);
    const ww = ((x1 - x0) / Math.max(0.2, Math.hypot(q.n[2], q.n[1]))) * 1.06;
    boxOn(g, P, 'plastic', 0x141516, (x0 + x1) / 2, yc, ww + 0.006, h + 0.01, 1, { proud: 0.002, d: 0.04 });
    lampOn(L, P, 'fog', (x0 + x1) / 2, yc, ww, h, 1, { proud: 0.008, d: 0.04, lens: 0x9298a0, metal: 0.85, pat: 1 });
  }
  lampOn(L, P, 'head', 0.5, yt - 0.058, 0.075, 0.075, 1, { round: true, proud: 0.013, d: 0.04, lens: 0xd8dce0, metal: 0.2, seg: 16 });
  lampStrip(L, P, 'head', 0.4, 0.83, yt - 0.112, 0.01, 1, 5, { emit: 0x34383e, proud: 0.013, d: 0.02, lens: 0xc0c4c8, pat: 0 });
  // lower bumper: side intakes with blades, a black lip
  boxOn(g, P, 'plastic', 0x0e0e10, 0.62, 0.36, 0.28, 0.13, 1, { proud: 0.006 });
  for (let k = 0; k < 3; k++) boxOn(g, P, 'chrome', 0x8a8e92, 0.62, 0.32 + k * 0.04, 0.27, 0.008, 1, { proud: 0.012, d: 0.02 });
  g.use('plastic').box(0x0e0e10, 0, 0.215, z - 0.05, 1.3, 0.05, 0.12);
  // rear: slim wrap-round lamps over the corners and onto the boot lid, chrome strip, diffuser
  lampStrip(L, P, 'tail', 0.42, 0.9, 0.9, 0.09, -1, 3, { proud: 0.008 });
  lampStrip(L, P, 'ind', 0.5, 0.88, 0.85, 0.018, -1, 3, { lens: 0x9a5a16, proud: 0.01 });
  lampOn(L, P, 'rev', 0.33, 0.85, 0.1, 0.035, -1);
  L.lamp('brake', 0, 1.42, -1.3, 0.3, 0.02, 0.05, { mirror: false });
  const zr = P.z0;
  g.use('chrome').box(0xc8ccd0, 0, 0.82, zr - 0.004, 0.6, 0.014, 0.01);
  g.use('plastic').box(0x0e0e10, 0, 0.3, zr + 0.02, 1.3, 0.12, 0.06);
  for (const sx of [1, -1]) g.use('chrome').box(0xb8bcc0, sx * 0.55, 0.31, zr - 0.012, 0.2, 0.07, 0.03);
  mirrors(g, P, 0.89, 1.05, 0.6, { surf: 'paint', color: 0xffffff, w: 0.155, h: 0.1 });
  common(g, M, P, { wiperZ: 0.94, exhaust: null, interior: { seatY: 0.37, seatZ: -0.25, seatX: 0.4, rearZ: -1.15, dashZ: 0.65, dashY: 0.98, dashW: 1.65 } });
  const ab = surf3(P, 0, 0.875, -1);
  return {
    plates: [{ side: 'front', pos: [0, 0.37, P.z1 + 0.026] }, { side: 'rear', pos: [0, 0.66, P.z0 - 0.012] }],
    badges: [{ text: 'AUDI', pos: [0, 0.875, ab.z - 0.004], w: 0.16, h: 0.038, rx: ab.rx, dir: -1 }],
    seat: [0.4, 0.37, -0.25], rear: [0.38, 0.38, -1.1], exhaust: [0.55, 0.33, -2.5], hitch: -2.55,
  };
}

// ---- BMW 5-serie (E34): long bonnet, quad lamps, kidney grille, Hofmeister kink.
function bmw() {
  const zF = 1.5, zR = zF - 2.76;
  return base({
    key: 'bmw', len: 4.72, wid: 1.75, height: 1.41, wb: 2.76,
    z0: -2.36, z1: 2.36, axles: [zR, zF], wr: 0.325, ww: 0.215, wx: 0.74, wheel: 'alloy7',
    arch: { r: 0.38, y: 0.34 }, sill: 0.22, shoulder: 0.03, crown: 0.03, tuck: 0.05,
    hw: [[-2.36, 0.83], [-2.3, 0.865], [-2.1, 0.875], [2.1, 0.875], [2.28, 0.86], [2.36, 0.83]],
    yb: [[-2.36, 0.34], [-2.2, 0.22], [2.2, 0.22], [2.36, 0.32]],
    belt: [[-2.36, 0.9], [-2.3, 0.96], [-1.6, 0.98], [-0.5, 0.955], [0.75, 0.935], [1.4, 0.855], [2.2, 0.775], [2.3, 0.75], [2.36, 0.72]],
    creases: [-2.3, 2.3],
    side: [[0, -0.052], [0.14, -0.019], [0.38, -0.003], [0.6, 0], [0.78, -0.007], [0.9, -0.018], [1, -0.034]],
    gh: {
      z0: -1.68, z1: 0.86, cab0: -1.68, cab1: 0.86, dash: 0.45, ws: 0.08, rw: -1.0, inset: 0.04, y0: 0.97, corner: 0.05,
      c: [[-1.68, 0.985], [-1.62, 1.0], [-1.02, 1.38], [-0.8, 1.405], [-0.3, 1.41], [0.0, 1.392], [0.08, 1.372], [0.8, 0.965], [0.86, 0.95]],
      e: [[-1.55, 0.98], [-0.98, 1.33], [-0.8, 1.35], [-0.05, 1.35], [0.1, 1.332], [0.6, 0.955], [0.66, 0.935]],
      xe: [[-1.5, 0.725], [-0.9, 0.705], [0.0, 0.7], [0.4, 0.75], [0.64, 0.83]],
      side: [{ f: 0.62, r: -0.3 }, { f: -0.4, r: -1.3, rs: 0.9 }],
      pillars: [[-0.3, -0.4, 'plastic', BLACK]],
      cornerSurf: { s: 'plastic', c: BLACK },
    },
  });
}
function bmwDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  // body-coloured bumpers with a black rubbing strip and black lower part
  bumper(M, P, 1, { y0: 0.27, y1: 0.52, out: 0.07, wrap: zF + R + 0.05, r: 0.12, depth: 0.035, surf: 'paint', color: 0xffffff, strip: { y: 0.45, h: 0.05, surf: 'plastic', color: TRIM } });
  bumper(M, P, -1, { y0: 0.3, y1: 0.54, out: 0.07, wrap: zR - R - 0.05, r: 0.12, depth: 0.035, surf: 'paint', color: 0xffffff, strip: { y: 0.47, h: 0.05, surf: 'plastic', color: TRIM } });
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.04, zF - R - 0.04, 0.44, 0.49, 0.012);
  doors(M, g, P, [0.64, -0.34, -1.25], [0.0, -0.95], 0.86);
  shutLineAcross(M, P, 0.88, 0.76);
  shutLineAcross(M, P, -1.72, 0.76);
  const z = P.z1 + 0.012;
  // black panel across the front with quad round lamps; kidneys in the middle
  g.use('plastic').box(0x101012, 0, 0.62, z - 0.004, 1.6, 0.18, 0.02);
  for (const sx of [1, -1]) {
    L.lamp('head', sx * 0.62, 0.625, z + 0.006, 0.17, 0.17, 0.02, { round: true, mirror: false });
    L.lamp('head', sx * 0.4, 0.625, z + 0.006, 0.15, 0.15, 0.02, { round: true, mirror: false, emit: 0x403a30 });
    g.use('chrome').box(0xc8ccd0, sx * 0.09, 0.64, z + 0.012, 0.14, 0.2, 0.03);
    g.use('plastic').box(0x101012, sx * 0.09, 0.64, z + 0.026, 0.11, 0.17, 0.01);
    for (let k = 0; k < 4; k++) g.use('chrome').box(0x9a9ea2, sx * (0.045 + k * 0.03), 0.64, z + 0.032, 0.008, 0.16, 0.006);
  }
  L.lamp('ind', 0.82, 0.48, P.z1 + 0.02, 0.1, 0.06, 0.04, { ry: 0.5, clear: true });
  // rear: wide lamp units, plate between on the boot lid
  const zr = P.z0 - 0.012;
  lampStrip(L, P, 'tail', 0.36, 0.87, 0.835, 0.09, -1, 3);
  lampStrip(L, P, 'ind', 0.44, 0.87, 0.755, 0.06, -1, 2, { lens: 0x9a5a16 });
  lampOn(L, P, 'rev', 0.33, 0.755, 0.12, 0.06, -1);
  mirrors(g, P, 0.83, 1.0, 0.56);
  common(g, M, P, { wiperZ: 0.82, exhaust: [-0.5, 0.26, -2.4], interior: { seatY: 0.33, seatZ: -0.2, seatX: 0.38, rearZ: -1.05, dashZ: 0.58, dashY: 0.92, dashW: 1.55 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.37, P.z1 + 0.112] }, { side: 'rear', pos: [0, 0.78, P.z0 - 0.015] }],
    badges: [{ text: 'BMW', pos: [-0.45, 0.905, surf3(P, -0.45, 0.905, -1).z - 0.004], w: 0.11, h: 0.03, rx: surf3(P, -0.45, 0.905, -1).rx, dir: -1 }],
    seat: [0.38, 0.33, -0.2], rear: [0.36, 0.34, -1.0], exhaust: [-0.5, 0.26, -2.45], hitch: -2.48,
  };
}

// ---- Škoda Octavia kombi (2010s): crisp modern estate, roof rails, C-shaped lamps.
function skoda() {
  const zF = 1.43, zR = zF - 2.69;
  return base({
    key: 'skoda', len: 4.66, wid: 1.81, height: 1.47, wb: 2.69,
    z0: -2.33, z1: 2.33, axles: [zR, zF], wr: 0.316, ww: 0.205, wx: 0.775, wheel: 'alloy5',
    arch: { r: 0.37, y: 0.33 }, sill: 0.21, shoulder: 0.04, crown: 0.035, tuck: 0.055, creaseF: 0.8,
    hw: [[-2.33, 0.83], [-2.27, 0.885], [-2.05, 0.9], [1.75, 0.905], [2.05, 0.89], [2.2, 0.855], [2.28, 0.8], [2.33, 0.7]],
    keys: [2.2, 2.25, 2.28, 2.31],
    yb: [[-2.33, 0.34], [-2.2, 0.21], [2.15, 0.21], [2.33, 0.3]],
    belt: [[-2.33, 0.86], [-2.29, 0.965], [-2.1, 0.995], [-1.2, 0.998], [0.0, 0.985], [0.85, 0.965], [1.3, 0.9], [2.05, 0.8], [2.2, 0.76], [2.29, 0.7], [2.33, 0.6]],
    creases: [-2.29],
    side: [[0, -0.06], [0.14, -0.024], [0.35, -0.006], [0.55, 0], [0.72, 0.002], [0.79, 0.007], [0.83, 0.004], [0.9, -0.014], [1, -0.042]],
    gh: {
      z0: -2.27, z1: 0.93, cab0: -2.27, cab1: 0.93, dash: 0.5, ws: 0.0, rw: -1.95, inset: 0.045, y0: 1.0, corner: 0.05,
      c: [[-2.27, 1.0], [-2.22, 1.02], [-1.95, 1.41], [-1.8, 1.44], [-0.6, 1.455], [-0.1, 1.44], [0.0, 1.422], [0.88, 0.985], [0.93, 0.97]],
      e: [[-2.22, 1.0], [-1.95, 1.37], [-1.8, 1.39], [-0.1, 1.39], [0.05, 1.372], [0.65, 0.98], [0.72, 0.96]],
      xe: [[-2.2, 0.745], [-1.8, 0.73], [-0.6, 0.71], [0.1, 0.71], [0.45, 0.77], [0.72, 0.86]],
      side: [{ f: 0.68, r: -0.25 }, { f: -0.37, r: -1.12 }, { f: -1.22, r: -2.02, rs: 0.9 }],
      pillars: [[-0.25, -0.37, 'plastic', BLACK], [-1.12, -1.22, 'plastic', BLACK]],
    },
  });
}
function skodaDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  doors(M, g, P, [0.7, -0.3, -1.17], [0.05, -0.85], 0.9);
  shutLineAcross(M, P, 0.95, 0.8);
  shutLineV(M, P, -2.24, 0.45, 0.94);
  sideStrip(M, P, 'paint', 0xffffff, -2.2, 2.2, 0.8, 0.812, 0.004);
  // black lower cladding over the sills and round the arches
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.03, zF - R - 0.03, 0.22, 0.3, 0.01, false);
  const z = P.z1 + 0.008;
  // grille with vertical slats in a chrome frame, wider at the top
  const sp = [[-0.3, 0.6], [0.3, 0.6], [0.27, 0.48], [-0.27, 0.48]];
  shapeOn(g, P, 'chrome', 0xc0c4c8, sp.map(([x, y]) => [x * 1.07, 0.54 + (y - 0.54) * 1.18]), 1, 0.03, { proud: 0.006 });
  shapeOn(g, P, 'plastic', 0x101112, sp, 1, 0.03, { proud: 0.012 });
  for (let k = -6; k <= 6; k++) g.use('chrome').box(0x8a8e92, k * 0.042, 0.54, P.z1 + 0.024, 0.008, 0.11, 0.008);
  lampStrip(L, P, 'fog', 0.36, 0.8, 0.64, 0.09, 1, 3, { proud: 0.008, d: 0.04, lens: 0x9298a0, metal: 0.85 });
  lampOn(L, P, 'head', 0.47, 0.645, 0.062, 0.062, 1, { round: true, plain: true, proud: 0.012, d: 0.04, lens: 0xd8dce0, metal: 0.2, seg: 16 });
  lampStrip(L, P, 'head', 0.4, 0.78, 0.592, 0.012, 1, 2, { emit: 0xf2f6ff, proud: 0.012, d: 0.03, lens: 0xe0e4e8 });
  g.use('plastic').box(0x0e0e10, 0, 0.36, z - 0.006, 1.2, 0.12, 0.03);
  boxOn(g, P, 'plastic', 0x0e0e10, 0.72, 0.38, 0.2, 0.1, 1);
  roofRails(g, P, 0.6, -1.9, -0.1, { surf: 'metal', color: 0xb0b4b8 });
  // C-shaped rear lamps at the corners
  lampOn(L, P, 'tail', 0.84, 0.88, 0.09, 0.2, -1, { proud: 0.008 });
  lampStrip(L, P, 'tail', 0.6, 0.8, 0.965, 0.04, -1, 2);
  lampStrip(L, P, 'tail', 0.6, 0.8, 0.8, 0.04, -1, 2);
  lampStrip(L, P, 'ind', 0.62, 0.8, 0.88, 0.03, -1, 2, { lens: 0x9a5a16 });
  lampOn(L, P, 'rev', 0.5, 0.88, 0.08, 0.05, -1);
  const zr = P.z0;
  L.lamp('brake', 0, 1.44, -1.97, 0.3, 0.025, 0.05, { mirror: false });
  g.use('plastic').box(0x0e0e10, 0, 0.32, zr - 0.012, 1.4, 0.12, 0.03);
  mirrors(g, P, 0.87, 1.04, 0.62, { surf: 'paint', color: 0xffffff, w: 0.15, h: 0.1 });
  common(g, M, P, { wiperZ: 0.9, exhaust: [-0.5, 0.25, -2.35], cover: [-1.12, -2.2, 1.0], interior: { seatY: 0.38, seatZ: -0.2, seatX: 0.39, rearZ: -1.05, dashZ: 0.62, dashY: 0.97, dashW: 1.6 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.4, P.z1 + 0.02] }, { side: 'rear', pos: [0, 0.68, P.z0 - 0.012] }],
    badges: [{ text: 'ŠKODA', pos: [0, 0.875, surf3(P, 0, 0.875, -1).z - 0.004], w: 0.22, h: 0.04, rx: surf3(P, 0, 0.875, -1).rx, dir: -1 }],
    seat: [0.39, 0.38, -0.2], rear: [0.37, 0.39, -1.0], exhaust: [-0.5, 0.25, -2.4], hitch: -2.42,
  };
}

// ---- Volkswagen Golf (mk6-ish 5-door): a short, tall hatch. A short bonnet (~1.05 m) that rises
// to a raked windscreen (~30°) whose base sits just behind the front wheel; a long roof from above
// the front door to over the rear wheel; the steep tailgate glass (~55°) between the massive,
// forward-leaning C-pillars (no quarter window), then the near-vertical tailgate. The face: slim
// clear trapezoid headlamps with a round projector, joined by a narrow black grille bar with a chrome
// line, a wide lower intake in the bumper.
function golf() {
  const zF = 1.25, zR = zF - 2.578;
  return base({
    key: 'golf', len: 4.2, wid: 1.78, height: 1.48, wb: 2.578,
    z0: -2.06, z1: 2.06, axles: [zR, zF], wr: 0.316, ww: 0.205, wx: 0.77, wheel: 'alloy5',
    arch: { r: 0.37, y: 0.32 }, sill: 0.22, shoulder: 0.05, crown: 0.035, tuck: 0.06, creaseF: 0.8,
    keys: [1.88, 1.92, 1.96, 1.99, 2.02, 2.045, -2.05, -2.035, -2.01, -1.98, -1.94, -1.9],
    hw: [[-2.06, 0.78], [-2.02, 0.835], [-1.92, 0.87], [-1.75, 0.885], [1.5, 0.89], [1.7, 0.884], [1.84, 0.865], [1.93, 0.835], [1.99, 0.795], [2.03, 0.74], [2.06, 0.65]],
    yb: [[-2.06, 0.36], [-1.95, 0.22], [1.9, 0.22], [2.06, 0.34]],
    // the tailgate below the glass leans back to the lamps, then the bumper; at the front the short
    // bonnet rounds down to the lamps
    belt: [[-2.06, 0.6], [-2.05, 0.7], [-2.035, 0.79], [-2.01, 0.87], [-1.98, 0.935], [-1.94, 0.98], [-1.9, 1.005], [-1.7, 1.022], [-1.3, 1.012], [-0.4, 0.99], [0.4, 0.975], [1.0, 0.962], [1.3, 0.928], [1.6, 0.89], [1.8, 0.862], [1.88, 0.848], [1.92, 0.834], [1.96, 0.79], [1.99, 0.725], [2.02, 0.655], [2.045, 0.585], [2.06, 0.5]],
    crownZ: [[-2.06, 0.008], [-1.95, 0.02], [-1.8, 0.035], [1.0, 0.035], [1.9, 0.025], [2.06, 0.008]],
    creases: [],
    side: [[0, -0.06], [0.12, -0.02], [0.4, -0.003], [0.72, 0], [0.8, 0.006], [0.88, -0.01], [1, -0.045]],
    gh: {
      z0: -1.9, z1: 1.0, cab0: -1.9, cab1: 1.0, dash: 0.62, ws: 0.2, rw: -1.58, rwX: 0.54, inset: 0.05, y0: 1.0, corner: 0.055,
      c: [[-1.9, 1.02], [-1.84, 1.12], [-1.76, 1.24], [-1.67, 1.36], [-1.6, 1.42], [-1.5, 1.45], [-1.2, 1.47], [-0.6, 1.48], [-0.1, 1.475], [0.12, 1.462], [0.22, 1.44], [0.5, 1.29], [0.8, 1.11], [0.96, 1.005], [1.0, 0.985]],
      e: [[-1.88, 1.01], [-1.62, 1.37], [-1.45, 1.41], [-0.3, 1.422], [0.1, 1.412], [0.25, 1.385], [0.8, 0.99], [0.86, 0.97]],
      xe: [[-1.88, 0.7], [-1.55, 0.672], [-0.3, 0.662], [0.3, 0.705], [0.8, 0.82]],
      side: [{ f: 0.78, r: -0.24 }, { f: -0.33, r: -1.3, rs: 0.68 }],
      pillars: [[-0.24, -0.33, 'plastic', BLACK]],
    },
  });
}
function golfDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  doors(M, g, P, [0.84, -0.28, -0.95], [0.12, -0.82], 0.94);
  // the rear door's dog-leg round the arch: up the C-pillar from the arch top to the window
  shutLineV(M, P, -1.32, 0.72, 0.99);
  shutLineH(M, P, 0.72, -1.32, -0.95);
  shutLineAcross(M, P, 1.02, 0.78);
  shutLineV(M, P, -1.93, 0.62, 0.96);
  // bumper shut lines front and rear, the black sill trim
  shutLineH(M, P, 0.54, 1.66, 2.0);
  shutLineH(M, P, 0.6, -2.0, -1.72);
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.03, zF - R - 0.03, 0.22, 0.28, 0.008, false);
  // the crisp shoulder line through the door handles, from the headlamps to the tail lamps
  sideStrip(M, P, 'paint', 0xffffff, -1.98, 1.92, 0.866, 0.878, 0.005);
  // The face (round 3): one dark band across the whole front, 0.69-0.84 m - big clear headlamps
  // tapering round the corners (a reflector body, a round projector, the indicator along the lower
  // outer edge) joined by a black grille bar of the same height with a chrome strip along its top -
  // over a body-coloured bumper with a wide trapezoid black intake and fog lamps in corner pockets.
  const yt = 0.838, unit = [[0.36, 0.15], [0.48, 0.149], [0.6, 0.142], [0.7, 0.128], [0.78, 0.106], [0.845, 0.08], [0.88, 0.058]];
  for (let k = 0; k < unit.length - 1; k++) {
    const [x0, h0] = unit[k], [x1, h1] = unit[k + 1], h = (h0 + h1) / 2, yc = yt - h / 2, q = surf3(P, (x0 + x1) / 2, yc, 1);
    const ww = ((x1 - x0) / Math.max(0.2, Math.hypot(q.n[2], q.n[1]))) * 1.06;
    boxOn(g, P, 'plastic', 0x16171a, (x0 + x1) / 2, yc, ww + 0.006, h + 0.012, 1, { proud: 0.002, d: 0.04 });
    lampOn(L, P, 'fog', (x0 + x1) / 2, yc, ww, h, 1, { proud: 0.008, d: 0.04, lens: 0x6c7278, metal: 0.85, pat: 1 });
  }
  lampOn(L, P, 'head', 0.47, yt - 0.072, 0.09, 0.09, 1, { round: true, proud: 0.013, d: 0.04, lens: 0x7a8086, metal: 0.7, seg: 18 });
  lampOn(L, P, 'head', 0.635, yt - 0.068, 0.06, 0.06, 1, { round: true, proud: 0.013, d: 0.04, lens: 0x70767c, metal: 0.7, emit: 0x403a30, seg: 14 });
  lampStrip(L, P, 'ind', 0.7, 0.86, yt - 0.11, 0.022, 1, 2, { proud: 0.011, d: 0.03 });
  shapeOn(g, P, 'plastic', 0x0b0b0c, [[-0.372, yt], [0.372, yt], [0.355, 0.69], [-0.355, 0.69]], 1, 0.03, { proud: 0.006 });
  for (let k = 0; k < 3; k++) boxOn(g, P, 'plastic', 0x222326, 0, 0.72 + k * 0.035, 0.68, 0.009, 1, { proud: 0.014, d: 0.016 });
  boxOn(g, P, 'chrome', 0xb8bcc0, 0, yt - 0.016, 0.72, 0.012, 1, { proud: 0.014, d: 0.02 });
  // the lower front: a wide trapezoid intake with slats, fog lamps in black corner pockets
  shapeOn(g, P, 'plastic', 0x0b0b0c, [[-0.5, 0.49], [0.5, 0.49], [0.6, 0.26], [-0.6, 0.26]], 1, 0.04, { proud: 0.006 });
  for (let k = 0; k < 4; k++) boxOn(g, P, 'plastic', 0x26272a, 0, 0.3 + k * 0.05, 1.08 - k * 0.07, 0.009, 1, { proud: 0.016, d: 0.02 });
  bandOn(g, P, 'plastic', 0x0b0b0c, 0.6, 0.82, 0.36, 0.13, 1, 2, { proud: 0.006, d: 0.04 });
  lampOn(L, P, 'fog', 0.7, 0.36, 0.08, 0.08, 1, { round: true, proud: 0.012, d: 0.03, seg: 14 });
  // rear: wide horizontal tail lamps in two parts - the outer on the body, the inner on the tailgate
  // across the shut line - the plate recess on the tailgate, a black diffuser, the roof spoiler with
  // the third brake light, the model name on the tailgate
  lampStrip(L, P, 'tail', 0.585, 0.86, 0.925, 0.13, -1, 3, { proud: 0.008 });
  lampStrip(L, P, 'tail', 0.36, 0.555, 0.94, 0.1, -1, 2, { proud: 0.008 });
  lampOn(L, P, 'ind', 0.7, 0.885, 0.13, 0.03, -1, { proud: 0.014 });
  lampOn(L, P, 'rev', 0.46, 0.91, 0.1, 0.03, -1, { proud: 0.014 });
  if (!P.lod) for (const y of [0.66, 0.78, 0.9]) boxOn(g, P, 'plastic', SEAL, 0.57, y, 0.006, 0.12, -1, { proud: 0.001, d: 0.01 });
  boxOn(g, P, 'plastic', 0x0b0b0c, 0, 0.34, 1.3, 0.12, -1, { proud: 0.006, d: 0.04 });
  const C = P._gh.C, zs = -1.52;
  g.use('paint').box(0xffffff, 0, C(zs) + 0.012, zs - 0.07, 1.08, 0.03, 0.2, 0, -0.16);
  L.lamp('brake', 0, C(zs) + 0.0, zs - 0.15, 0.3, 0.018, 0.02, { mirror: false });
  mirrors(g, P, 0.86, 1.06, 0.66, { surf: 'paint', color: 0xffffff, w: 0.15, h: 0.1 });
  common(g, M, P, { wiperZ: 0.96, exhaust: [-0.5, 0.25, -2.08], cover: [-1.15, -1.82, 1.0], interior: { seatY: 0.39, seatZ: -0.22, seatX: 0.38, rearZ: -1.05, dashZ: 0.6, dashY: 1.0, dashW: 1.55 } });
  const pf = surf3(P, 0, 0.565, 1), pr = surf3(P, 0, 0.72, -1), pb = surf3(P, -0.3, 0.83, -1);
  return {
    plates: [{ side: 'front', pos: [0, 0.565, pf.z + 0.012], rx: pf.rx }, { side: 'rear', pos: [0, 0.72, pr.z - 0.012], rx: pr.rx }],
    badges: [{ text: 'GOLF', pos: [-0.3, 0.83, pb.z - 0.004], w: 0.13, h: 0.032, rx: pb.rx, dir: -1 }],
    seat: [0.38, 0.39, -0.22], rear: [0.36, 0.4, -1.0], exhaust: [-0.5, 0.25, -2.12], hitch: -2.16,
  };
}

// ---- Kombi: a generic late-90s Swedish estate (V70-like): soft edges, tall rear lamps.
function kombi() {
  const zF = 1.48, zR = zF - 2.76;
  return base({
    key: 'kombi', len: 4.72, wid: 1.8, height: 1.49, wb: 2.76,
    z0: -2.36, z1: 2.36, axles: [zR, zF], wr: 0.32, ww: 0.205, wx: 0.76, wheel: 'alloy5',
    arch: { r: 0.375, y: 0.335 }, sill: 0.22, shoulder: 0.035, crown: 0.03, tuck: 0.05,
    hw: [[-2.36, 0.84], [-2.3, 0.885], [-2.1, 0.9], [1.9, 0.9], [2.25, 0.88], [2.36, 0.8]],
    yb: [[-2.36, 0.32], [-2.25, 0.22], [2.2, 0.22], [2.36, 0.32]],
    belt: [[-2.36, 0.86], [-2.32, 0.93], [-1.8, 0.955], [-0.5, 0.952], [0.7, 0.94], [1.2, 0.875], [2.2, 0.785], [2.3, 0.74], [2.36, 0.66]],
    creases: [-2.32],
    gh: {
      z0: -2.34, z1: 0.9, cab0: -2.34, cab1: 0.9, dash: 0.45, ws: 0.06, rw: -2.15, inset: 0.04, y0: 0.97, corner: 0.05,
      c: [[-2.34, 0.95], [-2.31, 0.98], [-2.16, 1.42], [-2.05, 1.45], [-0.5, 1.46], [0.0, 1.45], [0.06, 1.432], [0.84, 0.955], [0.9, 0.94]],
      e: [[-2.31, 0.95], [-2.15, 1.38], [-2.0, 1.4], [0.0, 1.4], [0.12, 1.38], [0.62, 0.95], [0.7, 0.93]],
      xe: [[-2.28, 0.755], [-1.5, 0.735], [0.1, 0.725], [0.45, 0.775], [0.7, 0.86]],
      side: [{ f: 0.65, r: -0.3 }, { f: -0.42, r: -1.18 }, { f: -1.28, r: -2.08, rs: 0.25 }],
      pillars: [[-0.3, -0.42, 'plastic', BLACK], [-1.18, -1.28, 'plastic', BLACK]],
    },
  });
}
function kombiDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  bumper(M, P, 1, { y0: 0.26, y1: 0.55, out: 0.06, wrap: zF + R + 0.05, r: 0.16, depth: 0.03, surf: 'paint', color: 0xffffff, strip: { y: 0.42, h: 0.05, surf: 'plastic', color: TRIM } });
  bumper(M, P, -1, { y0: 0.28, y1: 0.56, out: 0.06, wrap: zR - R - 0.05, r: 0.16, depth: 0.03, surf: 'paint', color: 0xffffff, strip: { y: 0.44, h: 0.05, surf: 'plastic', color: TRIM } });
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.04, zF - R - 0.04, 0.42, 0.5, 0.016);
  doors(M, g, P, [0.68, -0.36, -1.24], [0.05, -0.95], 0.88);
  shutLineAcross(M, P, 0.92, 0.8);
  shutLineV(M, P, -2.3, 0.6, 0.92);
  const z = P.z1 + 0.012;
  grille(g, 0, 0.64, z, 0.6, 0.15, { n: 4, frame: 'chrome', slat: 0x2a2b2d });
  L.lamp('head', 0.58, 0.64, z, 0.34, 0.14, 0.03);
  L.lamp('ind', 0.8, 0.64, P.z1 - 0.03, 0.08, 0.13, 0.08, { ry: 1.0, clear: true });
  roofRails(g, P, 0.6, -2.0, -0.1);
  const zr = P.z0 - 0.012;
  lampOn(L, P, 'tail', 0.81, 0.8, 0.13, 0.2, -1, { proud: 0.008 });
  lampOn(L, P, 'ind', 0.81, 0.655, 0.13, 0.08, -1, { lens: 0x9a5a16, proud: 0.008 });
  lampOn(L, P, 'rev', 0.81, 0.585, 0.13, 0.05, -1, { proud: 0.008 });
  L.lamp('brake', 0, 1.42, -2.17, 0.4, 0.03, 0.05, { mirror: false });
  mirrors(g, P, 0.86, 1.02, 0.58);
  common(g, M, P, { wiperZ: 0.86, exhaust: [-0.5, 0.25, -2.42], cover: [-1.12, -2.25, 0.96], interior: { seatY: 0.37, seatZ: -0.2, seatX: 0.38, rearZ: -1.05, dashZ: 0.62, dashY: 0.93, dashW: 1.6 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.34, P.z1 + 0.098] }, { side: 'rear', pos: [0, 0.74, P.z0 - 0.015] }],
    badges: [],
    seat: [0.38, 0.37, -0.2], rear: [0.36, 0.38, -1.0], exhaust: [-0.5, 0.25, -2.47], hitch: -2.48,
  };
}
// Taxi: the estate with a lit TAXI roof sign.
function taxiDetails(P, g, M, L) {
  const info = kombiDetails(P, g, M, L);
  const y = P._gh.C(-0.55) + 0.02;
  g.use('plastic').box(0x1a1a1a, 0, y + 0.02, -0.55, 0.56, 0.04, 0.2);
  L.lamp('sign', 0, y + 0.13, -0.55, 0.68, 0.18, 0.14, { mirror: false, lens: 0xf4d24a, emit: 0xffd860 });
  info.badges = [{ text: 'TAXI', pos: [0, y + 0.13, -0.55 + 0.072], w: 0.56, h: 0.14, dir: 1 }, { text: 'TAXI', pos: [0, y + 0.13, -0.55 - 0.072], w: 0.56, h: 0.14, dir: -1 }];
  return info;
}

// ---- Skåpbil: a modern panel van (Transit/Sprinter-ish), tall box, short bonnet.
function van() {
  const zF = 1.8, zR = zF - 3.4;
  return base({
    key: 'van', len: 5.4, wid: 2.0, height: 2.36, wb: 3.4,
    z0: -2.7, z1: 2.7, axles: [zR, zF], wr: 0.345, ww: 0.215, wx: 0.86, wheel: 'van',
    arch: { r: 0.41, y: 0.37 }, sill: 0.38, shoulder: 0.04, crown: 0.02, tuck: 0.04, step: 0.16,
    hw: [[-2.7, 0.97], [-2.64, 1.0], [2.25, 1.0], [2.55, 0.96], [2.7, 0.88]],
    yb: [[-2.7, 0.44], [-2.6, 0.38], [2.5, 0.38], [2.7, 0.44]],
    belt: [[-2.7, 1.12], [-2.64, 1.15], [1.6, 1.15], [1.9, 1.14], [2.4, 1.0], [2.6, 0.93], [2.7, 0.8]],
    creases: [-2.64],
    side: [[0, -0.032], [0.1, -0.008], [0.3, -0.001], [0.6, 0], [0.86, -0.004], [1, -0.016]], sideF: [0, 0.1, 0.3, 0.55, 0.8, 0.92, 1],
    gh: {
      z0: -2.7, z1: 1.95, cab0: -2.7, cab1: 1.95, dash: 1.35, ws: 1.07, rw: -9, inset: 0.035, y0: 1.2, corner: 0.08, bow: 0.004,
      c: [[-2.7, 1.16], [-2.67, 2.27], [-2.6, 2.34], [0.7, 2.35], [1.0, 2.24], [1.1, 2.08], [1.85, 1.18], [1.95, 1.15]],
      e: [[-2.69, 1.15], [-2.66, 2.22], [-2.58, 2.28], [0.7, 2.28], [1.0, 2.15], [1.2, 1.97], [1.6, 1.16], [1.66, 1.15]],
      xe: [[-2.65, 0.95], [0.7, 0.945], [1.2, 0.935], [1.6, 0.97]],
      side: [{ f: 1.6, r: 0.92, fs: -0.3 }],
      pillar: { s: 'paint', c: 0xffffff },
    },
  });
}
function vanDetails(P, g, M, L) {
  const R = P.arch.r, [zR, zF] = P.axles;
  bumper(M, P, 1, { y0: 0.34, y1: 0.66, out: 0.06, wrap: zF + R + 0.08, r: 0.22, depth: 0.04 });
  bumper(M, P, -1, { y0: 0.38, y1: 0.6, out: 0.08, wrap: -2.3, r: 0.1, depth: 0.04 });
  sideStrip(M, P, 'plastic', TRIM, zR + R + 0.05, zF - R - 0.05, 0.4, 0.62, 0.014, false);
  shutLineV(M, P, 0.86, 0.45, 1.14);
  shutLineV(M, P, 1.66, 0.45, 1.14);
  shutLineV(M, P, -0.1, 0.45, 1.14);
  shutLineH(M, P, 2.22, -2.5, 0.8);
  handles(g, P, [1.1, 0.7], 1.0);
  const z = P.z1 + 0.01;
  grille(g, 0, 0.82, z, 0.86, 0.22, { n: 4, frame: 'black', slat: 0x3a3b3e, slatSurf: 'chrome' });
  L.lamp('head', 0.7, 0.86, P.z1 - 0.06, 0.32, 0.22, 0.14, { ry: 0.4 });
  L.lamp('ind', 0.86, 0.75, P.z1 - 0.14, 0.12, 0.06, 0.12, { ry: 0.8, clear: true });
  const zr = P.z0 - 0.01;
  L.lamp('tail', 0.92, 0.9, zr + 0.015, 0.14, 0.3, 0.05);
  L.lamp('ind', 0.92, 0.7, zr + 0.015, 0.14, 0.1, 0.05, { lens: 0x9a5a16 });
  L.lamp('rev', 0.92, 1.1, zr + 0.015, 0.14, 0.09, 0.05);
  L.lamp('brake', 0, 2.3, zr + 0.01, 0.4, 0.04, 0.04, { mirror: false });
  // rear doors: the split down the middle
  g.use('plastic').box(SEAL, 0, 1.4, zr - 0.002, 0.012, 1.85, 0.01);
  mirrors(g, P, 0.97, 1.35, 1.55, { h: 0.24, w: 0.16, d: 0.09 });
  common(g, M, P, { wiperZ: 1.82, exhaust: [-0.6, 0.3, -2.6], interior: { seatY: 0.98, seatZ: 0.95, seatX: 0.45, dashZ: 1.55, dashY: 1.25, dashW: 1.8, wheelTilt: -0.95, wheelY: 0.4 } });
  return {
    plates: [{ side: 'front', pos: [0, 0.5, P.z1 + 0.108] }, { side: 'rear', pos: [0, 0.68, P.z0 - 0.012] }],
    badges: [],
    seat: [0.45, 0.98, 0.95], exhaust: [-0.6, 0.3, -2.7], hitch: -2.85,
  };
}

// ---- Stadsbuss: a red low-floor city bus. Doors on the kerb (right, -x) side. The greenhouse ends
// at z 5.9; busDetails closes it with the front face (windscreen, sign, roof cap).
function bus() {
  const zF = 3.3, zR = zF - 5.9;
  const panes = [];
  // window panes along both sides between the axles and over the rear wheels
  for (let z = 4.55; z > -4.8; z -= 1.32) panes.push({ f: z, r: z - 1.22 });
  return base({
    key: 'bus', len: 12.0, wid: 2.55, height: 3.12, wb: 5.9,
    z0: -6.0, z1: 6.0, axles: [zR, zF], wr: 0.48, ww: 0.3, wx: 1.04, wheel: 'truck',
    arch: { r: 0.56, y: 0.5 }, sill: 0.3, shoulder: 0.02, crown: 0.0, tuck: 0.02, step: 0.35, paintSurf: 'paint',
    hw: [[-6.0, 1.22], [-5.9, 1.275], [5.8, 1.275], [5.94, 1.255], [6.0, 1.22]],
    yb: [[-6, 0.42], [-5.8, 0.32], [5.7, 0.3], [6, 0.36]],
    belt: [[-6.0, 1.14], [-5.9, 1.15], [5.9, 1.15], [6.0, 1.14]],
    creases: [-5.9],
    side: [[0, -0.02], [0.05, 0], [1, 0]], sideF: [0, 0.05, 0.5, 1], sideFLod: [0, 0.5, 1],
    gh: {
      z0: -5.9, z1: 5.9, cab0: -5.9, cab1: 5.9, dash: 5.4, ws: 99, rw: -99, inset: 0.03, y0: 1.2, corner: 0.12, bow: 0.0,
      c: [[-5.9, 3.0], [5.9, 3.0]],
      e: [[-5.9, 2.86], [5.9, 2.86]],
      xe: [[-5.9, 1.24], [5.9, 1.24]],
      side: [{ f: 5.92, r: 4.65 }, ...panes],
      pillar: { s: 'plastic', c: 0x111214 }, roof: { s: 'painted', c: 0xd8d8d4 },
      cornerSurf: { s: 'painted', c: 0xd8d8d4 }, belt: { s: 'plastic', c: 0x111214 },
    },
  });
}
// The bus's front face: a gently curved (tapered corners) and slightly raked surface from the belt
// to the roof: a black frit band, the two-piece clear windscreen, a black band, the destination
// sign's black housing, the white roof cap; black corner pillars.
const BUS_FACE = { W: 1.24, z: 6.0, a: 0.09, b: 0.05 };
function busFaceZ(x, y) { const F = BUS_FACE; return F.z - F.a * (x / F.W) ** 2 - F.b * (y - 1.15) / 1.85; }
// dir +1: the front (windscreen); -1: the rear (white panel with a small window high up).
function busFace(M, G, P, dir = 1) {
  const F = BUS_FACE, W = F.W;
  const xs = dir < 0 ? [-W, -0.95, -0.5, 0, 0.5, 0.95, W] : P.lod ? [-W, -1.15, 0, 1.15, W] : [-W, -1.15, -0.9, -0.6, -0.3, -0.015, 0.015, 0.3, 0.6, 0.9, 1.15, W];
  const ys = dir < 0 ? [1.15, 1.9, 2.58, 2.9, 2.99] : P.lod ? [1.15, 1.3, 2.58, 2.9, 2.99] : [1.15, 1.3, 1.6, 1.9, 2.2, 2.58, 2.64, 2.9, 2.99];
  const P3 = (x, y) => [x, y, dir * busFaceZ(x, y)];
  const N3 = (x) => norm3([2 * F.a * x / (W * W), F.b / 1.85, dir]);
  const WHITE = { s: 'painted', c: 0xd8d8d4 }, BLK = { s: 'plastic', c: 0x0c0d0e };
  // the windscreen is clear glass, the small rear window tinted (car.js: 'glass' = clear panes)
  const GL = P.lod ? { s: 'plastic', c: 0x1a2026 } : { s: dir > 0 ? 'glass' : 'tinted', c: null, glass: true };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1], xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
    let k;
    if (yc > 2.9) k = WHITE;
    else if (dir < 0) k = yc > 1.9 && yc < 2.58 && Math.abs(xc) < 0.95 ? GL : WHITE;
    else if (yc > 2.58 || yc < 1.3 || Math.abs(xc) > 1.15 || Math.abs(xc) < 0.015) k = BLK;
    else k = GL;
    const A = P3(x0, y0), B = P3(x1, y0), C = P3(x1, y1), D = P3(x0, y1);
    const T = k.glass ? G : M;
    if (dir > 0) { T.tri(k.s, k.c, A, B, C, N3(x0), N3(x1), N3(x1)); T.tri(k.s, k.c, A, C, D, N3(x0), N3(x1), N3(x0)); }
    else { T.tri(k.s, k.c, A, C, B, N3(x0), N3(x1), N3(x1)); T.tri(k.s, k.c, A, D, C, N3(x0), N3(x0), N3(x1)); }
  }
  // the roof cap's top: from the face's top edge back to the roof at |z| 5.9
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const a = P3(x0, 2.99), b = P3(x1, 2.99), c = [x1, 3.0, dir * 5.89], d = [x0, 3.0, dir * 5.89];
    if (dir > 0) { M.ftri('painted', 0xd8d8d4, a, c, b); M.ftri('painted', 0xd8d8d4, a, d, c); }
    else { M.ftri('painted', 0xd8d8d4, a, b, c); M.ftri('painted', 0xd8d8d4, a, c, d); }
  }
}
function busDetails(P, g, M, L, G) {
  const R = P.arch.r, [zR, zF] = P.axles;
  bumper(M, P, 1, { y0: 0.3, y1: 0.62, out: 0.05, wrap: 5.5, r: 0.2, depth: 0.03, color: 0x1a1a1c });
  bumper(M, P, -1, { y0: 0.32, y1: 0.6, out: 0.05, wrap: -5.6, r: 0.2, depth: 0.03, color: 0x1a1a1c });
  busFace(M, G, P, 1);
  busFace(M, G, P, -1);
  // grey roof equipment pods
  g.use('painted').box(0xd0d0cc, 0, 3.12, 1.0, 1.9, 0.24, 3.4).box(0xd0d0cc, 0, 3.08, -4.6, 1.8, 0.16, 2.0);
  // doors on the kerb side (-x): glass with black frames
  for (const [z0, z1] of [[4.35, 5.55], [0.2, 1.45]]) {
    const zc = (z0 + z1) / 2, w = z1 - z0;
    g.use('plastic').box(0x111214, -1.276, 1.48, zc, 0.03, 2.42, w + 0.06);           // frame / seals
    for (const sz of [-1, 1]) G?.box('glass', null, -1.295, 1.5, zc + sz * w / 4, 0.01, 2.3, w / 2 - 0.07);
    g.use('plastic').box(0x2a2c2e, -1.296, 1.5, zc, 0.012, 2.34, 0.03);
  }
  // front: lamps low in the corners
  const z = P.z1 + 0.012;
  L.lamp('head', 1.0, 0.68, z - 0.03, 0.3, 0.12, 0.06);
  L.lamp('ind', 1.17, 0.83, z - 0.06, 0.12, 0.08, 0.06, { ry: 0.5 });
  const zr = P.z0 - 0.012;
  L.lamp('tail', 1.1, 0.96, zr, 0.15, 0.3, 0.04);
  L.lamp('ind', 1.1, 0.75, zr, 0.15, 0.1, 0.04);
  L.lamp('rev', 1.1, 0.655, zr, 0.15, 0.06, 0.04);
  L.lamp('brake', 0, 2.75, -busFaceZ(0, 2.75) - 0.012, 0.6, 0.05, 0.03, { mirror: false });
  // engine grille at the back
  for (let k = 0; k < 8; k++) g.use('plastic').box(0x1a1a1c, 0, 0.75 + k * 0.08, zr - 0.005, 1.5, 0.03, 0.02);
  // mirrors on arms reaching forward ("rabbit ears")
  for (const sx of [1, -1]) {
    g.use('plastic').box(0x111214, sx * 1.33, 2.62, 5.86, 0.035, 0.035, 0.32, sx * -0.5, 0.3);
    g.use('plastic').box(0x111214, sx * 1.4, 2.32, 6.02, 0.14, 0.42, 0.08, sx * 0.2);
    g.use('chrome').box(0x8a9096, sx * 1.4, 2.32, 5.975, 0.12, 0.38, 0.01, sx * 0.2);
  }
  if (!P.lod) {
    // wipers parked at the bottom of each pane, the dash and the driver's place behind the glass
    for (const sx of [1, -1]) g.use('plastic').box(0x0c0c0d, sx * 0.55, 1.36, busFaceZ(sx * 0.55, 1.36) + 0.02, 0.9, 0.02, 0.02, 0, 0, sx * 0.12);
    g.use('fabric').box(DASH, 0, 1.3, 5.7, 2.3, 0.3, 0.42);
    g.use('fabric').add(PRIM.torus(), 0x1a1a1c, mat(0.8, 1.58, 5.36, -1.15, 0, 0, 0.42, 0.42, 0.45));
    g.use('fabric').box(0x22262c, 0.8, 1.1, 4.82, 0.52, 0.16, 0.5).box(0x22262c, 0.8, 1.48, 4.56, 0.5, 0.7, 0.12, 0, -0.15);
  }
  wheelWells(g, P);
  // seats inside (rows of dark seat backs)
  g.use('fabric');
  for (let z2 = 3.8; z2 > -5.2; z2 -= 0.85) for (const sx of [1, -1]) g.box(0x2a3448, sx * 0.75, 1.15, z2, 0.85, 0.7, 0.12);
  g.use('plastic');
  for (let z2 = 4.0; z2 > -5; z2 -= 1.7) g.cyl(0xd0c040, 0, 1.9, z2, 0.02, 2.1, 6);
  return {
    plates: [{ side: 'front', pos: [0.5, 0.45, P.z1 + 0.088] }, { side: 'rear', pos: [0, 0.46, P.z0 - 0.088] }],
    badges: [{ text: 'LINJE', pos: [0, 2.77, busFaceZ(0, 2.77) + 0.008], w: 1.5, h: 0.2, rx: -0.027, dir: 1 }],
    seat: [0.8, 1.3, 4.9], rear: [0.75, 1.0, 2.5], exhaust: [0.9, 0.35, -6.0], hitch: -6.1,
  };
}

// ---- Sopbil: a cab-over truck with a compactor body and a rear-loader tailgate.
function garbageCab() {
  const zF = 3.05;
  return base({
    key: 'garbage', len: 9.1, wid: 2.5, height: 3.42, wb: 4.2,
    z0: 2.25, z1: 4.5, axles: [zF], wr: 0.5, ww: 0.32, wx: 1.02, wheel: 'truck',
    arch: { r: 0.58, y: 0.52 }, sill: 0.5, shoulder: 0.03, crown: 0.01, tuck: 0.03, step: 0.2,
    hw: [[2.25, 1.22], [2.3, 1.25], [4.35, 1.25], [4.5, 1.2]],
    yb: [[2.25, 0.55], [4.5, 0.55]],
    belt: [[2.25, 1.75], [4.3, 1.75], [4.45, 1.72], [4.5, 1.6]],
    side: [[0, -0.02], [0.05, 0], [1, 0]], sideF: [0, 0.05, 0.5, 1], sideFLod: [0, 0.5, 1],
    // the cab's greenhouse (side windows, roof) stops at z 4.38; garbageDetails closes it with a flat
    // face holding the two-piece windscreen (a cab-over truck has a flat screen, not a car's arch)
    gh: {
      z0: 2.25, z1: 4.27, cab0: 2.25, cab1: 4.5, dash: 4.05, ws: 99, rw: 2.0, inset: 0.03, y0: 1.8, corner: 0.14, bow: 0.0,
      c: [[2.25, 1.76], [2.28, 2.95], [2.35, 3.02], [4.27, 3.02]],
      e: [[2.26, 1.75], [2.29, 2.85], [2.36, 2.9], [4.27, 2.9]],
      xe: [[2.3, 1.16], [4.27, 1.16]],
      side: [{ f: 4.2, r: 3.3, fs: 0.12 }],
    },
  });
}
// The sopbil cab's flat front above the belt: a black band, the two-piece clear windscreen with a
// centre post, the white cap under the roof edge. Raked ~3°, from the cab roof's end (z 4.38) to the
// lower body's face.
function garbageFace(M, G, P) {
  const W = 1.2, zT = 4.272, zB = 4.47, y0 = 1.74, y1 = 3.0;
  const Z = (y) => zB + (zT - zB) * (y - y0) / (y1 - y0);
  const n = norm3([0, zB - zT, y1 - y0]);
  const xs = P.lod ? [-W, -1.1, 0, 1.1, W] : [-W, -1.1, -0.035, 0.035, 1.1, W];
  const ys = P.lod ? [y0, 1.98, 2.82, y1] : [y0, 1.9, 1.98, 2.82, 2.9, y1];
  const WHITE = { s: 'painted', c: 0xd8d8d2 }, BLK = { s: 'plastic', c: 0x0c0d0e };
  const GL = P.lod ? { s: 'plastic', c: 0x1a2026 } : { s: 'glass', c: null, glass: true };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const xa = xs[i], xb = xs[i + 1], ya = ys[j], yb = ys[j + 1], xc = (xa + xb) / 2, yc = (ya + yb) / 2;
    let k;
    if (yc > 2.9) k = WHITE;
    else if (yc < 1.98 || yc > 2.82 || Math.abs(xc) > 1.1 || Math.abs(xc) < 0.035) k = P.lod && Math.abs(xc) < 0.035 ? GL : BLK;
    else k = GL;
    const A = [xa, ya, Z(ya)], B = [xb, ya, Z(ya)], C = [xb, yb, Z(yb)], D = [xa, yb, Z(yb)];
    const T = k.glass ? G : M;
    T.tri(k.s, k.c, A, B, C, n, n, n); T.tri(k.s, k.c, A, C, D, n, n, n);
  }
  // the wipers parked under the screen, a black sun visor over it
  if (!P.lod) for (const sx of [1, -1]) M.box('plastic', 0x0c0c0d, sx * 0.55, 2.0, Z(2.0) + 0.02, 0.9, 0.02, 0.02, 0);
  M.box('plastic', 0x101112, 0, 2.97, Z(2.97) + 0.12, 2.3, 0.05, 0.26, 0);
}
function garbageDetails(P, g, M, L, G) {
  const GREEN = 0x3a6644, GRIME = 0x3c3d34;
  // the compactor body (a second loft, no arches: it sits above the wheels), and behind it the
  // tailgate: a rear-loader hopper hinged at the top, sloping down to a low loading sill
  const B = base({
    key: 'garbageBody', lod: P.lod, z0: -3.35, z1: 2.15, axles: [], wr: 0.5, ww: 0.32, wx: 1.02, arch: { r: 0.01, y: 0 },
    sill: 1.05, shoulder: 0.08, crown: 0.06, tuck: 0.02, step: 0.3, paintSurf: 'painted',
    hw: [[-3.35, 1.22], [-3.3, 1.24], [2.05, 1.24], [2.15, 1.2]],
    yb: [[-3.35, 1.05], [2.15, 1.05]],
    belt: [[-3.35, 3.3], [-3.25, 3.38], [2.0, 3.38], [2.15, 3.3]],
    side: [[0, -0.01], [0.05, 0], [1, -0.02]], sideF: [0, 0.05, 0.5, 0.85, 1], sideFLod: [0, 0.5, 1],
  });
  const T = base({
    key: 'garbageGate', lod: P.lod, z0: -4.6, z1: -3.36, axles: [], wr: 0.5, ww: 0.32, wx: 1.02, arch: { r: 0.01, y: 0 },
    sill: 0.78, shoulder: 0.1, crown: 0.05, tuck: 0.02, step: 0.2, paintSurf: 'painted',
    hw: [[-4.6, 1.16], [-4.5, 1.2], [-3.4, 1.21], [-3.36, 1.2]],
    yb: [[-4.6, 0.8], [-3.6, 0.78], [-3.36, 1.0]],
    belt: [[-4.6, 1.62], [-4.45, 2.1], [-4.0, 2.8], [-3.6, 3.28], [-3.36, 3.36]],
    side: [[0, -0.02], [0.05, 0], [1, -0.04]], sideF: [0, 0.05, 0.5, 0.85, 1], sideFLod: [0, 0.5, 1],
  });
  let bi = 0;
  for (const Q of [B, T]) {
    const { M: M2 } = buildLoftBody(Q);
    for (const p of M2.m.values()) { if (p.s === 'painted') p.c = GREEN; M.m.set('body2|' + bi++, p); }
  }
  sideStrip(M, B, 'painted', 0xd8d8d0, -3.2, 2.0, 1.75, 1.98, 0.008, false);
  sideStrip(M, B, 'painted', GRIME, -3.3, 2.1, 1.05, 1.22, 0.006, false);   // road grime along the bottom
  sideStrip(M, T, 'painted', GRIME, -4.55, -3.4, 0.8, 1.0, 0.006, false);
  shutLineV(M, B, -3.3, 1.08, 3.3);
  // the hopper mouth, the bin lifter (rails + comb), warning stripes, hydraulic rams
  const zb = -4.6;
  g.use('plastic').box(0x0c0c0d, 0, 1.18, zb - 0.01, 1.9, 0.5, 0.04);
  g.use('plastic').box(0x050506, 0, 1.2, zb + 0.02, 1.8, 0.42, 0.04);
  g.use('metal');
  for (const sx of [1, -1]) g.box(0x8e9294, sx * 0.55, 0.92, zb - 0.1, 0.07, 0.62, 0.07);
  g.box(0x8e9294, 0, 0.98, zb - 0.14, 1.4, 0.06, 0.06).box(0x8e9294, 0, 0.66, zb - 0.1, 1.3, 0.05, 0.08);
  for (let k = 0; k < 10; k++) g.use('painted').box(k % 2 ? 0x141414 : 0xd8b018, -0.95 + k * 0.211, 0.58, zb - 0.06, 0.2, 0.1, 0.03, 0, 0, 0.6);
  for (const sx of [1, -1]) g.use('metal').cyl(0xb0b4b6, sx * 1.255, 2.05, -3.62, 0.045, 1.6, 8, -0.36, 0, 0);
  // chassis, fuel tank, mudguards
  g.use('plastic');
  for (const sx of [1, -1]) g.box(0x1a1a1c, sx * 0.45, 0.85, 0.3, 0.12, 0.3, 7.8);
  g.box(0x1a1a1c, 0, 0.98, -0.6, 1.0, 0.1, 5.6);
  g.use('metal').cyl(0x9a9ea2, -0.95, 0.85, 1.4, 0.28, 1.0, 12, Math.PI / 2, 0, 0);
  g.use('plastic');
  for (const a of [-1.15, -2.5]) for (const sx of [1, -1]) g.box(0x161618, sx * 1.02, 1.12, a, 0.36, 0.04, 1.3);
  g.box(0x1a1a1c, 0, 0.95, 2.2, 2.4, 0.2, 0.12);
  garbageFace(M, G, P);
  // lamps; amber beacons on the cab roof and the body's rear corners
  const z = P.z1 + 0.01;
  grille(g, 0, 1.1, z, 1.3, 0.5, { n: 6, frame: 'black', slat: 0x2a2b2e });
  L.lamp('head', 0.92, 0.8, z, 0.34, 0.16, 0.04);
  L.lamp('ind', 1.15, 0.8, z - 0.02, 0.08, 0.14, 0.04, { clear: true });
  bumper(M, P, 1, { y0: 0.55, y1: 0.95, out: 0.05, wrap: 4.1, r: 0.15, depth: 0.04, color: 0x1a1a1c });
  L.lamp('tail', 1.0, 0.92, zb - 0.02, 0.16, 0.14, 0.04);
  L.lamp('ind', 1.0, 1.07, zb - 0.02, 0.16, 0.08, 0.04);
  L.lamp('rev', 0.8, 0.92, zb - 0.02, 0.1, 0.08, 0.04);
  for (const [x, y, zz] of [[0.75, 3.02, 4.15], [1.0, 3.38, -3.2]]) {
    g.use('plastic').cyl(0x1a1a1c, x, y + 0.02, zz, 0.1, 0.04, 12).cyl(0x1a1a1c, -x, y + 0.02, zz, 0.1, 0.04, 12);
    L.lamp('beacon', x, y + 0.11, zz, 0.15, 0.15, 0.15, { round: true, rx: -Math.PI / 2, omni: true, up: true, seg: 16 });
  }
  // the low-entry cab's front: a black lower band round the grille and lamps, black steps under the
  // doors, mirrors on arms reaching forward (round 2's cab read as a white phone booth)
  g.use('plastic').box(0x121314, 0, 1.12, P.z1 + 0.004, 2.42, 0.5, 0.03);
  for (const sx of [1, -1]) {
    g.use('plastic').box(0x121314, sx * 1.235, 0.72, 3.85, 0.06, 0.08, 0.62).box(0x121314, sx * 1.235, 1.08, 3.85, 0.06, 0.08, 0.62);
    g.use('plastic').box(0x121314, sx * 1.235, 0.9, 4.42, 0.06, 0.7, 0.14);
    // the arm: from the cab's corner out and forward, then down to the mirror head
    const ax0 = 1.18, az0 = 4.18, ax1 = 1.47, az1 = 4.5, al = Math.hypot(ax1 - ax0, az1 - az0);
    g.use('plastic').box(0x111214, sx * (ax0 + ax1) / 2, 2.5, (az0 + az1) / 2, 0.035, 0.035, al, sx * Math.atan2(ax1 - ax0, az1 - az0));
    g.use('plastic').box(0x111214, sx * ax1, 2.45, az1, 0.03, 0.12, 0.03);
    g.use('plastic').box(0x111214, sx * 1.48, 2.2, az1 + 0.02, 0.16, 0.42, 0.08, sx * 0.25);
    g.use('chrome').box(0x7c8288, sx * 1.48, 2.2, az1 - 0.025, 0.14, 0.38, 0.008, sx * 0.25);
  }
  wheelWells(g, P);
  interior(g, P, { seatY: 1.45, seatZ: 3.4, seatX: 0.6, dashZ: 4.05, dashY: 1.9, dashW: 2.2, wheelTilt: -0.95, wheelY: 0.4 });
  return {
    plates: [{ side: 'front', pos: [0, 0.75, P.z1 + 0.098] }, { side: 'rear', pos: [0.62, 0.58, zb - 0.1] }],
    badges: [],
    seat: [0.6, 1.45, 3.4], exhaust: [1.0, 3.45, 2.4], hitch: -4.75,
    extraAxles: [-1.15, -2.5],
  };
}

const TYPES = {
  saab900: { P: saab900, details: saabDetails },
  volvo240: { P: volvo240, details: volvo240Details },
  volvo740: { P: volvo740, details: volvo740Details },
  audi: { P: audi, details: audiDetails },
  bmw: { P: bmw, details: bmwDetails },
  skoda: { P: skoda, details: skodaDetails },
  golf: { P: golf, details: golfDetails },
  kombi: { P: kombi, details: kombiDetails },
  taxi: { P: () => ({ ...kombi(), key: 'taxi' }), details: taxiDetails },
  van: { P: van, details: vanDetails },
  bus: { P: bus, details: busDetails },
  garbage: { P: garbageCab, details: garbageDetails },
};

// ---------------------------------------------------------------------------------------------
// Build + cache

const cache = new Map();
const LOD_SURF = { chrome: 'plastic', metal: 'plastic', fabric: 'plastic', rubber: 'plastic', painted: 'painted', paint: 'paint', paintsolid: 'paintsolid', plastic: 'plastic', wood: 'plastic' };
function buildVariant(T, lod) {
  const P = T.P();
  P.lod = lod;
  const { M, G } = buildLoftBody(P);
  const g = new GeoBuilder();
  const L = new LightBuilder();
  const info = T.details(P, g, M, L, G);
  if (lod) {
    for (const p of M.m.values()) p.s = LOD_SURF[p.s] || 'plastic';
    for (const part of g.parts) part._surface = LOD_SURF[part._surface] || 'plastic';
    // the unlit lamp lenses baked into the far body (a parked far car draws no lamp mesh, car.js), a few
    // millimetres inside the lamp mesh's lenses so a running car's lit ones cover them
    if (L.pos.length) {
      const lp = [], ln = [], lc = [];
      for (let i = 0; i < L.pos.length; i += 3) {
        lp.push(L.pos[i] - L.nrm[i] * 0.004, L.pos[i + 1] - L.nrm[i + 1] * 0.004, L.pos[i + 2] - L.nrm[i + 2] * 0.004);
        ln.push(L.nrm[i], L.nrm[i + 1], L.nrm[i + 2]);
        lc.push(L.col[i] * 0.8, L.col[i + 1] * 0.8, L.col[i + 2] * 0.8);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      lg.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
      lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      lg.setIndex(L.idx.slice());
      lg._surface = 'plastic';
      g.parts.push(lg);
    }
  }
  M.into(g);
  const body = g.build();
  grimeMask(body, P, info);
  return { P, info, body, glass: lod ? null : G.into(new GeoBuilder()).build(), lights: lod ? null : L.build(), glows: lod ? null : L.buildGlow() };
}
// Where road grime can lie (round 3; car.js decides how much a car carries): a per-vertex exposure to
// spray and salt, baked as the attribute `cgrime` (0..1). The sills and lower doors and bumpers, a
// fan of spray behind every wheel and round the arches, the rear panel (the dust swirl behind a
// hatchback or an estate reaches up to the window), a little spatter on the front from the car
// ahead; upward faces stay nearly clean (rain and snow), undersides are filthy.
function grimeMask(geo, P, info) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
  const out = new Float32Array(n);
  const axles = [...P.axles, ...(info.extraAxles || [])], R = P.arch?.r ?? 0.35, wr = P.wr ?? 0.31;
  const H = P.height ?? 1.45, big = H > 2;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    let m = smooth(big ? 1.0 : 0.56, big ? 0.3 : 0.12, y);
    for (const a of axles) {
      const dz = z - a, d = Math.hypot(dz * (dz < 0 ? 0.8 : 1.2), (y - wr) * 1.2);
      m += (dz < 0 ? 0.6 : 0.35) * smooth(R * 1.9, R * 1.02, d);
    }
    if (nz < -0.3) m += smooth(H * (big ? 0.5 : 0.7), 0.25, y) * 0.9 * Math.min(1, -nz * 1.3);
    if (nz > 0.45) m += smooth(0.8, 0.3, y) * 0.35;
    if (ny < -0.35) m = 1;
    else if (ny > 0.55) m *= 0.12;
    out[i] = clamp(m, 0, 1);
  }
  geo.setAttribute('cgrime', new THREE.BufferAttribute(out, 1));
}
export function carModel(type) {
  if (cache.has(type)) return cache.get(type);
  const T = TYPES[type] || TYPES.saab900;
  const hi = buildVariant(T, false), lo = buildVariant(T, true);
  const { P, info, body, glass, lights, glows } = hi;
  const wheels = [];
  const axles = [...P.axles, ...(info.extraAxles || [])];
  const front = Math.max(...axles);
  for (const a of axles) for (const sx of [1, -1]) wheels.push({ x: sx * P.wx, z: a, front: a === front, side: sx });
  const out = {
    type, P, body, glass, lights, glows, lod: lo.body, wheels, wheelStyle: P.wheel, wr: P.wr, ww: P.ww,
    len: P.len, wid: P.wid, height: P.height, wb: P.wb ?? Math.abs(P.axles[1] - P.axles[0]), ...info,
    tris: (body.index.count + (glass?.index.count || 0) + (lights?.index.count || 0)) / 3,
    lodTris: lo.body.index.count / 3,
  };
  cache.set(type, out);
  return out;
}
export const MODEL_KEYS = Object.keys(TYPES);

// A snow cap for a parked car: the upward-facing paint of a body (roof, bonnet, boot, the window
// ledges), lifted along its normal by up to 4.5 cm in the middle of a panel and thinning to a few
// millimetres where the panel turns down, in 'snow'. A car that stood out overnight has snow on its
// glass too: the upward-facing panes (windscreen, rear window; normal.y > 0.45) get a thinner layer
// (~1.4 cm), from `glass` (the near body) or, on the LOD body, its opaque dark glass. Cached per body.
const capCache = new WeakMap();
const LOD_GLASS = new THREE.Color(0x14181d);
export function snowCapGeometry(geo, glass = null) {
  if (capCache.has(geo)) return capCache.get(geo);
  const P = [], N = [];
  const take = (g, filter, thick, thin) => {
    const surfs = g.userData.surfaces, pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index.array, col = g.attributes.color;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
    for (const grp of groups) {
      const s = surfs[grp.materialIndex];
      if (!filter(s)) continue;
      for (let i = grp.start; i < grp.start + grp.count; i += 3) {
        const t = [idx[i], idx[i + 1], idx[i + 2]];
        if (t.some((v) => nrm.getY(v) < (thick > 0.02 ? 0.5 : 0.45))) continue;
        // the LOD's glass is 'plastic' in its own colour
        if (s === 'plastic' && !(Math.abs(col.getX(t[0]) - LOD_GLASS.r) < 2e-4 && Math.abs(col.getZ(t[0]) - LOD_GLASS.b) < 2e-4)) continue;
        for (const v of t) {
          const off = thin + thick * smooth(0.55, 0.92, nrm.getY(v));
          P.push(pos.getX(v) + nrm.getX(v) * off, pos.getY(v) + nrm.getY(v) * off, pos.getZ(v) + nrm.getZ(v) * off);
          N.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
        }
      }
    }
  };
  take(geo, (s) => s === 'paint' || s === 'paintsolid', 0.041, 0.004);
  if (glass) take(glass, (s) => s === 'tinted', 0.011, 0.006);
  else take(geo, (s) => s === 'plastic', 0.011, 0.006);
  let out = null;
  if (P.length) {
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    cap.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    cap.setIndex([...Array(P.length / 3).keys()]);
    out = new GeoBuilder().use('snow').add(cap, 0xf2f3f4).build();
  }
  capCache.set(geo, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Runtime: instanced wheels. Anything with wheels (cars, trailers) registers itself while its root
// is in the scene; before every render of the scene the visible ones write their wheel matrices
// into one InstancedMesh per wheel style (a handful of draw calls for all the wheels in town).

const pools = new Map();
const wheeled = new Set();
let hooked = false;
// car.js hands in its wheel materials (the car shading: the road in the reflections, rougher rims)
let wheelMats = (geo) => realMaterials(geo, { snow: false });
export function setWheelMaterials(fn) { wheelMats = fn; }
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
function wheelPool(style) {
  let p = pools.get(style);
  if (p && p.mesh.parent) return p;
  const geo = wheelGeometry(style);
  const cap = p ? p.cap : 64;
  const material = p ? p.material : wheelMats(geo);
  const mesh = new THREE.InstancedMesh(geo, material, cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.name = 'wheels:' + style;
  scene.add(mesh);
  p = { style, mesh, cap, n: 0, material };
  pools.set(style, p);
  return p;
}
// (Pools grow inside scene.onBeforeRender, which also runs for the AO / shadow pre-pass while gfx
// has swapped its own material onto every mesh: take the pool's material, never old.material.)
function growPool(p) {
  const old = p.mesh;
  p.cap *= 2;
  const mesh = new THREE.InstancedMesh(old.geometry, p.material, p.cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(p.cap * 3).fill(1), 3);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = old.name;
  scene.remove(old);
  old.dispose?.();
  scene.add(mesh);
  p.mesh = mesh;
}
const _col = new THREE.Color();
export const wheelSink = {
  // obj.writeWheels(put) calls put(style, matrix, burnt, grime) per wheel; grime (0..1.1, the car's
  // road grime) dulls the wheel towards a brown-grey film of brake dust and salt.
  put(style, m, burnt, grime = 0) {
    const p = wheelPool(style);
    if (p.n >= p.cap) growPool(p);
    p.mesh.setMatrixAt(p.n, m);
    const g = Math.min(1, grime);
    p.mesh.setColorAt(p.n, burnt ? _col.setRGB(0.12, 0.11, 0.1) : _col.setRGB(1 - 0.2 * g, 1 - 0.23 * g, 1 - 0.28 * g));
    p.n++;
  },
};
function updateWheels(cam) {
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  for (const p of pools.values()) p.n = 0;
  const cx = cam.position.x, cz = cam.position.z;
  for (const o of wheeled) {
    if (!o.root.visible || !o.root.parent) continue;
    const dx = o.x - cx, dz = o.z - cz;
    if (dx * dx + dz * dz > 230 * 230) continue;
    _sph.center.set(o.x, (o.y || 0) + 0.8, o.z);
    _sph.radius = (o.radius || 3) + 4;
    if (!_frustum.intersectsSphere(_sph)) continue;
    o.writeWheels(wheelSink);
  }
  for (const p of pools.values()) {
    p.mesh.count = p.n;
    p.mesh.instanceMatrix.needsUpdate = true;
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
  }
}
// Keep obj (with .root, .x, .z, .radius, .writeWheels) in the wheel system while its root is in
// the scene.
export function trackWheels(obj) {
  const on = () => {
    if (!hooked && scene) {
      hooked = true;
      const prev = scene.onBeforeRender;
      scene.onBeforeRender = function (r, s, cam, rt) { prev.call(this, r, s, cam, rt); updateWheels(cam); };
    }
    wheeled.add(obj);
  };
  obj.root.addEventListener('added', on);
  obj.root.addEventListener('removed', () => wheeled.delete(obj));
  if (obj.root.parent) on();
}
// Pool state for debugging (style, capacity, instances drawn, materials).
export function wheelDebug() { return [...pools.values()].map((p) => ({ style: p.style, cap: p.cap, n: p.n, count: p.mesh.count, inScene: !!p.mesh.parent, col: !!p.mesh.instanceColor, mats: (Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material]).map((m) => m.name + ':' + m.color.getHexString()) })); }
export function wheelStats() { let n = 0; for (const p of pools.values()) n += p.n; return { styles: pools.size, wheels: n, tracked: wheeled.size }; }

// ---------------------------------------------------------------------------------------------
// Runtime: the lamp material. One per car (its own channel intensities), one shared program.

export function lightMaterial() {
  const ch = new Float32Array(NCH);
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1 });
  m.userData.ch = ch;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCh = { value: ch };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 lemit; attribute float lch; attribute float lmet; attribute vec4 lq; attribute float lpat;
        uniform float uCh[${NCH}];
        varying vec3 vLEmit; varying float vLMet; varying vec4 vLq; varying float vLPat;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLEmit = lemit * uCh[int(lch + 0.5)];\nvLMet = lmet;\nvLq = lq;\nvLPat = lpat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLEmit;\nvarying float vLMet;\nvarying vec4 vLq;\nvarying float vLPat;\nfloat gLEm = 1.0;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vLMet;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // lens patterns (see LightBuilder): a height field h (metres) bumps the normal, gLEm shapes
          // the emission across the lens, the grooves darken the lens colour
          float pat = floor( vLPat + 0.5 );
          vec2 q = vLq.zw, mm = vLq.xy;
          float h = 0.0;
          if ( pat > 0.5 ) {
            float edge = smoothstep( 1.0, 0.8, max( abs( q.x ), abs( q.y ) ) );
            if ( pat < 1.5 ) {
              // reflector headlamp: vertical flutes every 1.5 cm; lit, a bright core round the bulb
              float ph = mm.x * 418.9;
              float fw = length( vec2( dFdx( mm.x ), dFdy( mm.x ) ) ) * 66.7;
              float a = 1.0 - smoothstep( 0.3, 0.7, fw );
              h = sin( ph ) * 0.0007 * a;
              vec2 c = q * vec2( 0.85, 1.3 );
              float r2 = dot( c, c );
              gLEm = ( 0.05 + 0.16 * exp( - r2 * 2.0 ) + 1.9 * exp( - r2 * 13.0 ) ) * ( 1.0 - 0.25 * a * ( 0.5 + 0.5 * cos( ph ) ) ) * ( 0.4 + 0.6 * edge );
            } else if ( pat < 2.5 ) {
              // rear lamp: horizontal ribs every 1.9 cm, the grooves darker; lit, brighter towards the middle
              float ph = mm.y * 330.7;
              float fw = length( vec2( dFdx( mm.y ), dFdy( mm.y ) ) ) * 52.6;
              float a = 1.0 - smoothstep( 0.3, 0.7, fw );
              float rib = 0.5 + 0.5 * cos( ph );
              h = sin( ph ) * 0.0009 * a;
              diffuseColor.rgb *= 1.0 - 0.45 * a * ( 1.0 - rib );
              gLEm = ( 0.72 + 0.28 * mix( 0.6, rib, a ) ) * ( 0.75 + 0.25 * exp( - dot( q, q ) * 1.5 ) ) * ( 0.55 + 0.45 * edge );
            } else {
              // round projector / round headlamp: a small hot core, a dim ring
              float r2 = dot( q, q );
              gLEm = 0.06 + 0.2 * exp( - r2 * 2.5 ) + 2.2 * exp( - r2 * 16.0 );
              h = sin( sqrt( r2 ) * 18.0 ) * 0.0004;
            }
            if ( h != 0.0 ) {
              vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
              vec2 dh = vec2( dFdx( h ), dFdy( h ) );
              vec3 R1 = cross( dpy, normal ), R2 = cross( normal, dpx );
              float det = dot( dpx, R1 );
              vec3 grad = sign( det ) * ( dh.x * R1 + dh.y * R2 );
              normal = normalize( abs( det ) * normal - grad );
            }
          }
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLEmit * gLEm;')
      // a ribbed rear lens scatters its reflections (and a sky-white clear coat would turn a lit red
      // lamp pink): rougher, a thin clear coat
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nif ( floor( vLPat + 0.5 ) == 2.0 ) {\n  material.roughness = max( material.roughness, 0.34 );\n  #ifdef USE_CLEARCOAT\n  material.clearcoat *= 0.3;\n  #endif\n}')
      // A lit coloured lens: its own light swamps the sky it reflects (in reality by orders of
      // magnitude; here the red is kept under the tone mapper's shoulder, so a few percent of white
      // reflection would turn it pink), so its reflections fade out as it lights up.
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( 0.45 ) );
        {
          float eMax = max( vLEmit.r, max( vLEmit.g, vLEmit.b ) ), eMin = min( vLEmit.r, min( vLEmit.g, vLEmit.b ) );
          float k = 1.0 - 0.9 * smoothstep( 0.02, 0.25, eMax ) * ( eMax > 0.0 ? 1.0 - eMin / eMax : 0.0 );
          reflectedLight.directSpecular *= k; reflectedLight.indirectSpecular *= k;
          #ifdef USE_CLEARCOAT
            clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( 0.45 ) ) * k;
            clearcoatSpecularIndirect *= k;
          #endif
        }`);
    injectSceneShading(shader);
  };
  const baseKey = THREE.MeshPhysicalMaterial.prototype.customProgramCacheKey;
  m.customProgramCacheKey = function () { return baseKey.call(this) + '|carlights4'; };
  return m;
}

// The lamps' glow: soft additive discs facing the camera, pulled 0.3 m towards it so the lamp's
// own body doesn't clip them, faded when the lamp faces away (omni lamps, the beacons, never),
// at least ~0.35° across so a pulled-over car's hazards read from 40 m. Shares the car's channel
// array (see lightMaterial). A wide soft halo with a modest peak: added on top of the lens, it
// must not push a red lamp past the tone mapper's shoulder into orange.
export function glowMaterial(ch) {
  return new THREE.ShaderMaterial({
    uniforms: { uCh: { value: ch } },
    vertexShader: `
      attribute vec3 gN; attribute vec2 gUV; attribute vec3 gE; attribute vec3 gK; attribute float gS;
      uniform float uCh[${NCH}];
      varying vec2 vUV; varying vec3 vCol;
      void main() {
        float I = max( uCh[ int( gK.x + 0.5 ) ] - gK.y, 0.0 );
        vec4 c = modelViewMatrix * vec4( position, 1.0 );
        vec3 n = normalize( normalMatrix * gN );
        vec3 toCam = normalize( - c.xyz );
        float d = length( c.xyz );
        float facing = gK.z > 0.5 ? 1.0 : smoothstep( 0.05, 0.6, dot( n, toCam ) );
        float k = I * facing * exp( - d * 0.004 );
        float s = max( gS * 1.35, d * 0.0068 ) * step( 0.001, k );
        c.xyz += toCam * min( 0.3, d * 0.5 );
        c.xy += gUV * s;
        vUV = gUV; vCol = gE * k * 0.16;
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: `
      varying vec2 vUV; varying vec3 vCol;
      void main() {
        float r2 = dot( vUV, vUV );
        float a = ( exp( - r2 * 4.0 ) * 0.75 + exp( - r2 * 18.0 ) * 0.3 ) * ( 1.0 - smoothstep( 0.6, 1.0, r2 ) );
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

// ---------------------------------------------------------------------------------------------
// Runtime: Swedish licence plates. Unique random plates 'ABC 123' / 'ABC 12A' (no I, Q, V, Å, Ä,
// Ö; no O as the last letter), drawn into atlas pages (1024 x 512, 4 x 8 cells of 256 x 64 px;
// the last row holds badges). A car's plate mesh is a few quads with UVs into its page.

const PL_LETTERS = 'ABCDEFGHJKLMNOPRSTUWXYZ';
const PL_LAST = 'ABCDEFGHJKLMNPRSTUWXYZ';
const usedPlates = new Set();
const BAD = new Set(['FAN', 'FUL', 'KUK', 'SEX', 'NRP', 'NSD', 'APA', 'PUB', 'MLB']);
export function randomPlate(r = Math.random) {
  for (let k = 0; k < 1000; k++) {
    let s = '';
    for (let i = 0; i < 3; i++) s += PL_LETTERS[(r() * PL_LETTERS.length) | 0];
    if (BAD.has(s)) continue;
    s += ' ' + ((r() * 10) | 0) + ((r() * 10) | 0);
    s += r() < 0.28 ? PL_LAST[(r() * PL_LAST.length) | 0] : String((r() * 10) | 0);
    if (s.endsWith('000')) continue;
    if (!usedPlates.has(s)) { usedPlates.add(s); return s; }
  }
  return 'OVE 001';
}
export function claimPlate(s) { usedPlates.add(s); return s; }
export function releasePlate(s) { usedPlates.delete(s); }

const PW = 1024, PH = 512, CW = 256, CHh = 64, COLS = 4, ROWS = 8;
// make names as chrome lettering (no logos), the taxi sign, the bus's destination: the last two rows
const BADGES = ['GOLF', 'AUDI', 'BMW', 'ŠKODA', 'SAAB', 'VOLVO', 'TAXI', 'LINJE'];
const BROWS = 2, PLATE_SLOTS = COLS * (ROWS - BROWS);
const badgeAt = (i) => [(i % COLS) * CW, (ROWS - BROWS + Math.floor(i / COLS)) * CHh];
const pages = [];
const PLATE_FONT = '"Barlow Condensed", "Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif';
// key: the plate text, or 'ABC 123|T' for a taxi: Swedish taxis carry yellow plates with black
// characters and a small T after the number.
function drawPlate(x, cx, cy, key, dirt = 0) {
  const taxi = key.endsWith('|T'), text = taxi ? key.slice(0, -2) : key;
  const w = CW - 4, h = 54, x0 = cx + 2, y0 = cy + 5;
  x.clearRect(cx, cy, CW, CHh);
  x.fillStyle = taxi ? '#f2c414' : '#f3f3ee';
  roundRect(x, x0, y0, w, h, 5); x.fill();
  x.lineWidth = 2.2; x.strokeStyle = '#151515';
  roundRect(x, x0 + 1.5, y0 + 1.5, w - 3, h - 3, 4); x.stroke();
  // EU band: blue with the ring of stars and 'S'
  const bw = 24;
  x.fillStyle = '#0d3a96';
  roundRect(x, x0 + 3, y0 + 3, bw, h - 6, 2); x.fill();
  x.fillStyle = '#f2d21a';
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.beginPath(); x.arc(x0 + 3 + bw / 2 + Math.cos(a) * 6.5, y0 + 17 + Math.sin(a) * 6.5, 1.3, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#ffffff';
  x.font = `600 17px ${PLATE_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('S', x0 + 3 + bw / 2, y0 + h - 13);
  x.fillStyle = '#141414';
  x.font = `600 44px ${PLATE_FONT}`;
  const tail = taxi ? 22 : 0;
  const tw = x.measureText(text).width, avail = w - bw - 22 - tail;
  x.save();
  x.translate(x0 + bw + 8 + avail / 2 + 4, y0 + h / 2 + 2);
  if (tw > avail) x.scale(avail / tw, 1);
  x.fillText(text, 0, 0);
  x.restore();
  if (taxi) { x.font = `600 24px ${PLATE_FONT}`; x.fillText('T', x0 + w - 16, y0 + h / 2 + 9); }
  // road grime (round 3): a film of salt spray rising from the bottom edge, droplet speckle, and a
  // little dulling all over; a seeded pattern per plate
  if (dirt > 0.02) {
    let sd = 0; for (const ch of key) sd = (sd * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    x.save();
    roundRect(x, x0, y0, w, h, 5); x.clip();
    const gr = x.createLinearGradient(0, y0 + h, 0, y0);
    gr.addColorStop(0, `rgba(96,90,80,${(0.55 * dirt).toFixed(3)})`);
    gr.addColorStop(0.45, `rgba(120,114,104,${(0.22 * dirt).toFixed(3)})`);
    gr.addColorStop(1, `rgba(140,136,128,${(0.08 * dirt).toFixed(3)})`);
    x.fillStyle = gr; x.fillRect(x0, y0, w, h);
    for (let k = 0; k < 70 * dirt; k++) {
      const px = x0 + rnd() * w, py = y0 + h - Math.pow(rnd(), 1.6) * h, r = 0.6 + rnd() * 1.8;
      x.fillStyle = `rgba(${80 + (rnd() * 50) | 0},${76 + (rnd() * 44) | 0},${68 + (rnd() * 36) | 0},${((0.25 + rnd() * 0.35) * Math.min(1, dirt)).toFixed(3)})`;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function drawBadge(x, cx, cy, text) {
  x.clearRect(cx, cy, CW, CHh);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (text === 'TAXI') {
    x.font = `700 46px ${PLATE_FONT}`;
    x.fillStyle = '#121212';
    x.fillText(text, cx + CW / 2, cy + CHh / 2 + 2);
    return;
  }
  if (text === 'LINJE') { // bus destination: amber LED text on black
    x.fillStyle = '#0b0b0b'; x.fillRect(cx, cy, CW, CHh);
    x.font = `600 40px ${PLATE_FONT}`;
    x.fillStyle = '#ffb21e';
    x.fillText('3  CENTRUM', cx + CW / 2, cy + CHh / 2 + 2);
    return;
  }
  x.font = `600 44px ${PLATE_FONT}`;
  x.lineWidth = 4; x.strokeStyle = '#3a3c40'; x.strokeText(text, cx + CW / 2, cy + CHh / 2 + 2);
  x.fillStyle = '#e4e6ea'; x.fillText(text, cx + CW / 2, cy + CHh / 2 + 2);
}
function newPage() {
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  const x = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.0, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const page = { cv, x, tex, material, slots: new Array(PLATE_SLOTS).fill(null), dirt: new Array(PLATE_SLOTS).fill(0), free: PLATE_SLOTS };
  BADGES.forEach((b, i) => drawBadge(x, ...badgeAt(i), b));
  pages.push(page);
  return page;
}
let fontHooked = false;
function redrawAll() {
  for (const p of pages) {
    p.slots.forEach((t, i) => { if (t) drawPlate(p.x, (i % COLS) * CW, Math.floor(i / COLS) * CHh, t, p.dirt[i] || 0); });
    BADGES.forEach((b, i) => drawBadge(p.x, ...badgeAt(i), b));
    p.tex.needsUpdate = true;
  }
}
// -> { page, slot, uv(i) } ; uv rect of the slot as [u0, v0, u1, v1]
export function allocPlate(text, taxi = false, dirt = 0) {
  if (!fontHooked && document.fonts) {
    fontHooked = true;
    document.fonts.load(`600 44px "Barlow Condensed"`).then(() => redrawAll()).catch(() => {});
  }
  let page = pages.find((p) => p.free > 0) || newPage();
  const slot = page.slots.indexOf(null);
  const key = taxi ? text + '|T' : text;
  page.slots[slot] = key;
  page.dirt[slot] = dirt;
  page.free--;
  drawPlate(page.x, (slot % COLS) * CW, Math.floor(slot / COLS) * CHh, key, dirt);
  page.tex.needsUpdate = true;
  return { page, slot };
}
export function freePlate(h) {
  if (!h || h.page.slots[h.slot] === null) return;
  h.page.slots[h.slot] = null;
  h.page.free++;
}
function cellUV(slot, inset = true) {
  const c = slot % COLS, r = Math.floor(slot / COLS);
  const u0 = (c * CW + 2) / PW, u1 = ((c + 1) * CW - 2) / PW;
  const v1 = 1 - (r * CHh + 5) / PH, v0 = 1 - (r * CHh + 59) / PH;
  return inset ? [u0, v0, u1, v1] : [c * CW / PW, 1 - (r + 1) * CHh / PH, (c + 1) * CW / PW, 1 - r * CHh / PH];
}
// Plate + badge quads for a model: quads = [{ pos:[x,y,z], rx, dir(+1 front/-1 rear), w, h, slot | badge }]
export function plateGeometry(quads, slot) {
  const pos = [], nrm = [], uv = [], idx = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), nv = new THREE.Vector3();
  for (const q of quads) {
    const dir = q.dir ?? (q.side === 'rear' ? -1 : 1);
    const w = q.w ?? 0.52, h = q.h ?? 0.11;
    const uvr = q.badge !== undefined ? cellUV(PLATE_SLOTS + BADGES.indexOf(q.badge), false) : cellUV(slot);
    m.compose(new THREE.Vector3(...q.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(q.rx || 0, (dir < 0 ? Math.PI : 0) + (q.ry || 0), 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const base = pos.length / 3;
    for (const [sx, sy, u, vv] of [[-0.5, -0.5, uvr[0], uvr[1]], [0.5, -0.5, uvr[2], uvr[1]], [0.5, 0.5, uvr[2], uvr[3]], [-0.5, 0.5, uvr[0], uvr[3]]]) {
      v.set(sx * w, sy * h, 0).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      nv.set(0, 0, 1).transformDirection(m);
      nrm.push(nv.x, nv.y, nv.z);
      uv.push(u, vv);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
