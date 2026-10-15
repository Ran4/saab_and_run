// People: the cast of Saab & Run, Swedish winter pedestrians, cheap seated busts for drivers and
// the stray cat. Realistic proportions (an adult head is ~1/7.5 of the height), layered winter
// clothes, simple but human faces, mouths that barely move.
//
// Every person is ONE THREE.SkinnedMesh rigged to a small skeleton (24 bones: body, arms, legs,
// fingers at the knuckles and middle joints, thumbs; plus props, a wheelchair or a walking aid), so
// a person costs one draw call per surface: fabric, skin, hair, leather, and for the cast 'lamp'
// (glossy eyes, phone, pencil); the wheelchair and rollators add 'metal', 'rubber'.
// Geometry is generated procedurally in the rest pose, in model space (feet at the origin, facing
// +Z): lofted cross-sections for torso, sleeves, trouser legs, palms and fingers, shoes, nose and
// ears, a sculpted head (a profile-driven surface on anatomical landmarks, with sockets, brow ridge,
// cheekbones, lips, folds and age), offset shells for hair, beards and hats. Vertices are weighted
// to one bone, or blended at the joints; coat skirts follow the thighs like the trousers under them.
//
// The cast's faces (lod 0) are dense grids with a per-character baked face texture (one own skin
// material each: no extra draw calls); pedestrians and busts keep the face in vertex colours.
//
// API (see notes/people.md): CHARS, buildCharacter(def) -> model, animateCharacter(model, st, dt),
// randomPed(rng), buildBust(def), buildCat(), carryPoint(model).

import { THREE, SURFACES, realMaterials, surfaceMaterial, mat } from '../gfx.js';
import { mulberry32, pick } from '../util.js';

const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const G2 = (a, b) => { const q = a * a + b * b; return q > 24 ? 0 : Math.exp(-q); };
const fract = (x) => x - Math.floor(x);
const hash1 = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const wrapAbs = (a) => Math.abs(fract((a + PI) / TAU) * TAU - PI);
const _col = new THREE.Color();
const lin = (hex) => { _col.set(hex); return [_col.r, _col.g, _col.b]; };
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// Value noise in [0, 1] (an integer hash per lattice point: no sin, the face texture calls it a lot).
const ihash = (i, j, s) => {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j + 0x3c6ef372, 0x165667b1) ^ Math.imul(s, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (seed * 977) | 0;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s), c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a + (a - b + d - c) * u) * v;
}

// Monotone cubic interpolation through [[x, y], ...] (no overshoot), clamped at the ends.
function spline(pts) {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
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
// Periodic curve over u in [0, 1): the table starts at u = 0 and ends at u = 1 with the same value.
function periodic(pts) {
  const k = pts.length;
  const ext = [[pts[k - 3][0] - 1, pts[k - 3][1]], [pts[k - 2][0] - 1, pts[k - 2][1]], ...pts, [pts[1][0] + 1, pts[1][1]], [pts[2][0] + 1, pts[2][1]]];
  const f = spline(ext);
  return (u) => f(u - Math.floor(u));
}

// ---------------------------------------------------------------------------------------------
// SkinBuilder: like gfx.GeoBuilder (surfaces, vertex colours, triplanar part frames) but keeps
// skin indices/weights, and merges everything into one geometry with a group per surface.

let partSeed = 0;
const _mp = new THREE.Vector3(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3(), _mqi = new THREE.Quaternion();
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _nm = new THREE.Matrix3();
const GEO = {};
const sphereGeo = (w, h) => (GEO['s' + w + '_' + h] ??= new THREE.SphereGeometry(1, w, h));
const boxGeo = () => (GEO.box ??= new THREE.BoxGeometry(1, 1, 1));
// A copy of geo with every vertex weighted [[bone, w], ...] (for small parts on blended skin).
function weighted(geo, ws) {
  const g = geo.clone(), n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  let tot = 0; for (const [, w] of ws) tot += w;
  for (let i = 0; i < n; i++) ws.slice(0, 4).forEach(([b, w], q) => { si[i * 4 + q] = b; sw[i * 4 + q] = w / (tot || 1); });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

class SkinBuilder {
  // uvOn: the mesh gets a 'uv' attribute (the lod-0 face texture): parts flagged geo.userData.faceUV
  // keep theirs, everything else points at the texture's neutral texel; skinK brightens every 'skin'
  // part's colour (the face texture stores its multipliers / TEXK).
  // triK scales the parts' triplanar coordinates (the surface texture's scale: 3 = a 3x finer knit).
  constructor(remap = null) { this.parts = []; this.surface = 'fabric'; this.remap = remap; this.uvOn = false; this.skinK = 1; this.triK = 1; }
  use(surface) { this.surface = surface; return this; }
  // geo: position, normal, optional color (multiplied with `color`), optional skinIndex/skinWeight.
  // m: optional Matrix4 placing it (the triplanar frame is the part's own, as in GeoBuilder);
  // bone: what everything is weighted to when geo has no weights of its own.
  add(geo, color, m = null, bone = 0) {
    let surf = this.surface;
    if (this.remap && this.remap[surf]) surf = this.remap[surf];
    if (!SURFACES[surf]) surf = 'plain';
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const n = P.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), tri = new Float32Array(n * 4), trin = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    let uv = null;
    if (this.uvOn) {
      uv = new Float32Array(n * 2);
      const U = geo.userData?.faceUV ? geo.attributes.uv : null;
      for (let i = 0; i < n; i++) { uv[i * 2] = U ? U.array[i * 2] : FT_NEUTRAL[0]; uv[i * 2 + 1] = U ? U.array[i * 2 + 1] : FT_NEUTRAL[1]; }
    }
    const ck = surf === 'skin' ? this.skinK : 1;
    _mqi.identity();
    if (m) { m.decompose(_mp, _mq, _ms); _mqi.copy(_mq).invert(); _nm.getNormalMatrix(m); }
    _col.set(color ?? SURFACES[surf].base);
    const cr = _col.r * ck, cg = _col.g * ck, cb = _col.b * ck;
    const seed = fract(Math.sin(++partSeed * 12.9898) * 43758.5453) * 0.999;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(P, i);
      if (m) _v.applyMatrix4(m);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      _t.copy(_v).applyQuaternion(_mqi).multiplyScalar(this.triK);
      tri[i * 4] = _t.x; tri[i * 4 + 1] = _t.y; tri[i * 4 + 2] = _t.z; tri[i * 4 + 3] = seed;
      _v.fromBufferAttribute(N, i);
      if (m) _v.applyMatrix3(_nm).normalize();
      nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z;
      _t.copy(_v).applyQuaternion(_mqi);
      trin[i * 3] = _t.x; trin[i * 3 + 1] = _t.y; trin[i * 3 + 2] = _t.z;
      col[i * 3] = cr * (C ? C.array[i * 3] : 1); col[i * 3 + 1] = cg * (C ? C.array[i * 3 + 1] : 1); col[i * 3 + 2] = cb * (C ? C.array[i * 3 + 2] : 1);
      if (SI) for (let k = 0; k < 4; k++) { si[i * 4 + k] = SI.array[i * 4 + k]; sw[i * 4 + k] = SW.array[i * 4 + k]; }
      else { si[i * 4] = bone; sw[i * 4] = 1; }
    }
    const idx = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    this.parts.push({ surf, n, pos, nrm, col, tri, trin, si, sw, idx, uv });
    return this;
  }
  sphere(color, bone, x, y, z, rx, ry = rx, rz = rx, ax = 0, ay = 0, az = 0, w = 12, h = 8) {
    return this.add(sphereGeo(w, h), color, mat(x, y, z, ax, ay, az, rx, ry, rz), bone);
  }
  box(color, bone, x, y, z, w, h, d, ax = 0, ay = 0, az = 0) { return this.add(boxGeo(), color, mat(x, y, z, ax, ay, az, w, h, d), bone); }
  tube(color, bone, a, b, r0, r1 = r0, n = 8, caps = 0.3) {
    const [geo, M] = tubeGeo(a, b, r0, r1, n, caps);
    return this.add(geo, color, M, bone);
  }
  build() {
    const by = new Map();
    for (const p of this.parts) { if (!by.has(p.surf)) by.set(p.surf, []); by.get(p.surf).push(p); }
    const surfaces = [...by.keys()];
    let nv = 0, ni = 0;
    for (const p of this.parts) { nv += p.n; ni += p.idx.length; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), tri = new Float32Array(nv * 4), trin = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
    const uv = this.uvOn ? new Float32Array(nv * 2) : null;
    const geo = new THREE.BufferGeometry();
    let v0 = 0, i0 = 0;
    surfaces.forEach((s, k) => {
      const start = i0;
      for (const p of by.get(s)) {
        pos.set(p.pos, v0 * 3); nrm.set(p.nrm, v0 * 3); col.set(p.col, v0 * 3); tri.set(p.tri, v0 * 4); trin.set(p.trin, v0 * 3);
        si.set(p.si, v0 * 4); sw.set(p.sw, v0 * 4);
        if (uv) uv.set(p.uv, v0 * 2);
        for (let j = 0; j < p.idx.length; j++) idx[i0 + j] = p.idx[j] + v0;
        v0 += p.n; i0 += p.idx.length;
      }
      geo.addGroup(start, i0 - start, k);
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('tri', new THREE.BufferAttribute(tri, 4));
    geo.setAttribute('trin', new THREE.BufferAttribute(trin, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.userData = { surfaces };
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------------------------------------------------------------------------------------------
// Lofts: closed cross-sections stacked along Y. A ring is { y, rx, rz | rzF, rzB, cx, cz, p | pF, pB }:
// a superellipse (exponent p; 2 = ellipse, higher = boxier) with separate front (+Z) and back
// depths. o: { n (segments), thetas, mod(v, ring) (move vertex v.x/y/z), weights(v, ring) ->
// [[bone, w], ...] (or ring.w / o.w), color(v, ring) -> [r, g, b], capBot / capTop (pole offset
// in metres; null = open), flip }.

const ANGLES = {};
function evenThetas(n) { return (ANGLES['e' + n] ??= Array.from({ length: n }, (_, j) => (j / n) * TAU)); }
function faceThetas(n) { return (ANGLES['f' + n] ??= Array.from({ length: n }, (_, j) => { const u = (j / n) * TAU; return u - 0.33 * Math.sin(u); })); }

function loft(rings, o = {}) {
  const n = o.n || 12, R = rings.length;
  const ths = o.thetas || evenThetas(n);
  const bot = o.capBot !== undefined && o.capBot !== null, top = o.capTop !== undefined && o.capTop !== null;
  const nv = R * n + (bot ? 1 : 0) + (top ? 1 : 0);
  const pos = new Float32Array(nv * 3), col = o.color ? new Float32Array(nv * 3) : null;
  const skinned = !!o.weights || o.w !== undefined || rings[0].w !== undefined;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const v = { x: 0, y: 0, z: 0, th: 0, s: 0, c: 0, i: 0, j: 0, t: 0 };
  const setW = (k, w) => {
    if (typeof w === 'number') { si[k * 4] = w; sw[k * 4] = 1; return; }
    let tot = 0;
    const L = Math.min(4, w.length);
    for (let q = 0; q < L; q++) tot += w[q][1];
    for (let q = 0; q < L; q++) { si[k * 4 + q] = w[q][0]; sw[k * 4 + q] = w[q][1] / (tot || 1); }
  };
  let k = 0;
  for (let i = 0; i < R; i++) {
    const r = rings[i];
    const pF = r.pF ?? r.p ?? 2, pB = r.pB ?? r.p ?? 2, rzF = r.rzF ?? r.rz, rzB = r.rzB ?? r.rz;
    for (let j = 0; j < n; j++, k++) {
      const a = ths[j], s = Math.sin(a), c = Math.cos(a);
      const e = 2 / (c >= 0 ? pF : pB);
      v.x = (r.cx || 0) + r.rx * Math.sign(s) * Math.pow(Math.abs(s), e);
      v.z = (r.cz || 0) + (c >= 0 ? rzF : rzB) * Math.sign(c) * Math.pow(Math.abs(c), e);
      v.y = r.y; v.th = a; v.s = s; v.c = c; v.i = i; v.j = j; v.t = R > 1 ? i / (R - 1) : 0;
      if (o.mod) o.mod(v, r);
      pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      setW(k, o.weights ? o.weights(v, r) : r.w ?? o.w ?? 0);
      if (col) { const cc = o.color(v, r); col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2]; }
    }
  }
  const pole = (ring, dy) => {
    let x = 0, y = 0, z = 0, cr = 0, cg = 0, cb = 0;
    for (let j = 0; j < n; j++) {
      const q = ring * n + j;
      x += pos[q * 3]; y += pos[q * 3 + 1]; z += pos[q * 3 + 2];
      if (col) { cr += col[q * 3]; cg += col[q * 3 + 1]; cb += col[q * 3 + 2]; }
    }
    pos[k * 3] = x / n; pos[k * 3 + 1] = y / n + dy; pos[k * 3 + 2] = z / n;
    if (col) { col[k * 3] = cr / n; col[k * 3 + 1] = cg / n; col[k * 3 + 2] = cb / n; }
    for (let q = 0; q < 4; q++) { si[k * 4 + q] = si[ring * n * 4 + q]; sw[k * 4 + q] = sw[ring * n * 4 + q]; }
    return k++;
  };
  const idx = [];
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    if (o.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  if (bot) { const p = pole(0, -o.capBot); for (let j = 0; j < n; j++) { const a = j, b = (j + 1) % n; if (o.flip) idx.push(a, b, p); else idx.push(a, p, b); } }
  if (top) { const p = pole(R - 1, o.capTop); for (let j = 0; j < n; j++) { const a = (R - 1) * n + j, b = (R - 1) * n + ((j + 1) % n); if (o.flip) idx.push(a, p, b); else idx.push(a, b, p); } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (skinned) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Interpolate key rings (sorted by y) at the given heights.
const RING_F = ['rx', 'rzF', 'rzB', 'cx', 'cz', 'pF', 'pB'];
function ringSplines(keys) {
  const get = (k, f) => k[f] ?? (f === 'rzF' || f === 'rzB' ? k.rz : f === 'pF' || f === 'pB' ? k.p ?? 2 : 0);
  const sp = {};
  for (const f of RING_F) sp[f] = spline(keys.map((k) => [k.y, get(k, f)]));
  return (y) => { const r = { y }; for (const f of RING_F) r[f] = sp[f](y); return r; };
}
function sampleRings(keys, ys) { const at = ringSplines(keys); return ys.map(at); }
function rangeYs(y0, y1, step, extra = []) {
  const n = Math.max(1, Math.round((y1 - y0) / step)), ys = [];
  for (let i = 0; i <= n; i++) ys.push(y0 + ((y1 - y0) * i) / n);
  for (const e of extra) if (e > y0 + 0.004 && e < y1 - 0.004) ys.push(e);
  ys.sort((a, b) => a - b);
  return ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.0035);
}
function ringPt(r, th) {
  const s = Math.sin(th), c = Math.cos(th), e = 2 / (c >= 0 ? r.pF : r.pB);
  return [(r.cx || 0) + r.rx * Math.sign(s) * Math.pow(Math.abs(s), e), (r.cz || 0) + (c >= 0 ? r.rzF : r.rzB) * Math.sign(c) * Math.pow(Math.abs(c), e)];
}

// A tapered tube from a to b (model space). Returns [geometry in its own frame, placing matrix].
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
function tubeGeo(a, b, r0, r1, n = 8, caps = 0.3) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  _dir.normalize();
  const rings = [{ y: 0, rx: r0, rz: r0 }, { y: len, rx: r1, rz: r1 }];
  const geo = loft(rings, { n, capBot: caps === null ? null : r0 * caps, capTop: caps === null ? null : r1 * caps });
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _dir);
  const M = new THREE.Matrix4().compose(new THREE.Vector3(...a), q, new THREE.Vector3(1, 1, 1));
  return [geo, M];
}

// ---------------------------------------------------------------------------------------------
// Skeleton

const CORE = ['pelvis', 'spine', 'chest', 'neck', 'head', 'jaw', 'armR', 'foreR', 'handR', 'armL', 'foreL', 'handL', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL',
  'fingR', 'tipR', 'thumbR', 'fingL', 'tipL', 'thumbL', 'idxR', 'idxTipR', 'idxL', 'idxTipL'];
const NB = CORE.length;
const B = Object.fromEntries(CORE.map((n, i) => [n, i]));
const OFF = NB * 3;          // pelvis offset (x, y, z)
const NCH = OFF + 3;

// Body measurements from height, age, sex and build.
function dims(d) {
  const H = d.height || 1.75, age = d.age ?? 35, fem = d.sex === 'f', build = d.build || 1;
  const kidT = clamp((15 - age) / 12, 0, 1);
  const adult = age >= 15;
  const headH = adult ? clamp(0.222 + (H - 1.72) * 0.09, 0.2, 0.25) * (fem ? 0.975 : 1) : lerp(0.218, 0.18, kidT);
  const legR = adult ? (fem ? 0.512 : 0.522) : lerp(0.5, 0.43, Math.pow(kidT, 1.2));
  const hipY = H * legR;
  const kneeY = hipY * (adult ? 0.545 : 0.535);
  const ankleY = 0.043 * H;
  const chinY = H - headH;
  // the neck shortens with age and a stoop (the head sinks between the shoulders)
  const neckLen = (adult ? (fem ? 0.08 : 0.086) : lerp(0.075, 0.048, kidT)) * Math.min(1, H / 1.7) * (1 - 0.15 * sstep(58, 76, age) - 0.08 * (d.style?.stoop || 0));
  const shoulderY = chinY - neckLen;
  const Sa = (fem ? 0.158 * Math.pow(H / 1.66, 0.6) : 0.176 * Math.pow(H / 1.78, 0.6)) * Math.pow(build, 0.35);
  const Sk = 0.095 + (H - 0.95) * 0.115;
  const S = adult ? Sa : lerp(Sa, Sk, Math.min(1, kidT * 1.6));
  const shJ = shoulderY - 0.02 * (H / 1.78);
  const upper = (adult ? 0.186 : 0.18) * H, fore = (adult ? 0.146 : 0.14) * H, hand = (adult ? 0.1 : 0.098) * H;
  const D = {
    H, age, fem, build, kidT, adult, headH, hipY, kneeY, ankleY, chinY, shoulderY, shJ, S,
    hipX: S * (fem ? 0.5 : 0.46), upper, fore, hand,
    elbowY: shJ - upper, wristY: shJ - upper - fore,
    footLen: (adult ? 0.152 : 0.16) * H,
    neckR: (fem ? 0.05 : 0.058) * Math.pow(build, 0.4) * (adult ? 1 + 0.05 * clamp((age - 40) / 35, 0, 1) : lerp(1, 0.66, kidT)),
    spineY: hipY + (shoulderY - hipY) * 0.22, chestY: hipY + (shoulderY - hipY) * 0.55,
    neckY: shoulderY + 0.03 * (H / 1.78), neckZ: -0.014 * (H / 1.78),
    z0: 0.004,
    k: H / 1.78,
  };
  D.headY = chinY + 0.24 * headH;
  D.headZ = D.z0 - 0.04 * headH;
  D.jawY = chinY + 0.41 * headH;
  D.jawZ = D.z0 + 0.05 * headH;
  return D;
}

// ---------------------------------------------------------------------------------------------
// The head: a surface defined by horizontal sections from the chin (h = 0) to the crown (h = 1),
// in head heights, x to the left, z forward (z = 0 at the ear canal). Each section is a
// superellipse (flatter at the front: the face) with front depth F(h), back depth B(h) and
// half-width W(h); Gaussian dents and bumps make eye sockets, brow ridge, cheekbones, the lips,
// chin, jowls. At lod 0 (the cast) the head is a dense grid (rings ~1.5 mm apart, normals from the
// grid) with a cylindrical UV into a per-character baked face texture that carries all of the
// face's colour (lips with a defined border, lid creases, lines and wrinkles, stubble grain, skin
// grain, freckles, the painted hairline and brows); lower lods keep that colour in vertex colours.

function headParams(d, D) {
  const f = d.face || {};
  const kid = D.kidT, fem = D.fem, fat = f.fat || 0;
  // ageing: 0 at 45, 1 at ~78 (sagging, folds, thinner lips, blotchier skin); face.old adds to it
  const old = clamp((D.age - 45) / 33 + (f.old || 0), 0, 1);
  const jaw = (f.jaw || 1) * lerp(fem ? 0.86 : 1, 0.97, kid) * (1 + fat * 0.15);
  const wid = (f.width || 1) * (1 + fat * 0.07);
  // landmarks in head heights from the chin: mouth line, nose base, pupils (kids' features sit lower)
  const mh = lerp(0.192, 0.172, kid) + (f.mouthY || 0), nb = lerp(0.288, 0.252, kid) + (f.noseY || 0);
  const eh = lerp(0.478, 0.43, kid) + (fem ? 0.008 : 0) + (f.eyeY || 0);
  const Wb = spline([[0, 0.05], [0.03, 0.124], [0.08, 0.19], [0.14, 0.232], [mh, 0.255], [nb - 0.02, 0.274], [nb + 0.06, 0.29], [eh - 0.05, 0.3], [eh + 0.02, 0.305], [0.58, 0.316], [0.65, 0.329], [0.72, 0.332], [0.8, 0.316], [0.87, 0.278], [0.93, 0.21], [0.97, 0.13], [1, 0.0]]);
  // femK: the grown-up women's terms (fuller, redder lips, darker lashes, arched brows); not for girls
  const femK = fem ? 1 - kid : 0;
  const chin = (f.chin || 1) * (fem ? 0.9 : 1) * lerp(1, 0.85, kid), lips = (f.lips || 1) * lerp(1, 1.3, femK);
  // the face profile at the centre line: chin, the muzzle round the teeth, the face plane under the
  // nose, the nasion, the brow, the forehead (women: a rounder, more upright forehead)
  const Fb = spline([[0, 0.235], [0.03, 0.333], [0.065, 0.372], [mh - 0.075, 0.37], [mh - 0.03, 0.386], [mh + 0.02, 0.4], [nb - 0.01, 0.398], [nb + 0.04, 0.388], [eh - 0.06, 0.38], [eh + 0.01, 0.372], [eh + 0.04, 0.378], [eh + 0.08, fem ? 0.388 : 0.396], [eh + 0.13, fem ? 0.392 : 0.39], [0.68, fem ? 0.379 : 0.37], [0.74, fem ? 0.346 : 0.33], [0.82, fem ? 0.272 : 0.26], [0.9, 0.17], [0.96, 0.086], [1, 0.0]]);
  const Bb = spline([[0, -0.01], [0.08, -0.075], [0.16, -0.15], [0.24, -0.235], [0.32, -0.32], [0.4, -0.39], [0.5, -0.44], [0.6, -0.462], [0.7, -0.452], [0.8, -0.405], [0.88, -0.315], [0.94, -0.205], [0.98, -0.1], [1, 0]]);
  const PFb = spline([[0, 2], [0.15, 2.06], [0.3, 2.2], [0.45, 2.3], [0.6, 2.24], [0.8, 2.08], [1, 2]]);
  const eye = f.eye || 1;
  const P = {
    kid, fem, femK, old, fat, Hh: D.headH, chinY: D.chinY, z0: D.z0, mh, nb, eh,
    brow: (f.brow || 1) * (fem ? 0.2 : 1) * (1 - kid * 0.8), cheek: (f.cheek || 1) * (1 - old * 0.3) * (fem ? 1.1 : 1) * (1 + 0.25 * kid), cheekY: f.cheekY || 0,
    nose: (f.nose || 1) * (fem ? 0.88 : 1) * lerp(1, 0.6, kid) * (1 + old * 0.08), noseW: (f.noseW || 1) * (fem ? 0.88 : 1) * (1 + old * 0.06),
    hump: f.hump || 0, tip: f.tip || 0, lips: lips * lerp(1, 0.9, kid), chin,
    mw: (f.mouthW || 1) * (fem ? 0.95 : 1) * lerp(1, 0.9, kid), frown: d.frown || 0,
    rosy: f.rosy ?? lerp(0.8, 1.2, kid), skin: lin(d.skin ?? 0xe8b898),
    // a winter morning: nose tip, cheeks and ears flushed by the cold (less visible on darker skin);
    // oil: the T-zone's sheen (young skin oilier, old skin and kids' drier); smile: the mouth corners
    cold: (f.cold ?? lerp(1, 1.2, kid)) * clamp(0.35 + 1.1 * lin(d.skin ?? 0xe8b898)[1], 0.5, 1),
    oil: f.oil ?? lerp(lerp(1.1, 0.7, old), 0.6, kid), smile: f.smile || 0,
    // eyes: size, spacing (the pupil's x), the eyeball radius (head units); women's ~8 % larger
    eye: eye * (fem ? 1.04 : 1), ex: (kid ? 0.13 : 0.134) + (f.eyeX || 0), re: 0.052 * lerp(1, 1.08, kid) * eye * (fem ? 1.03 : 1),
    ear: (f.ear || 1) * (fem ? 0.93 : 1), freckles: f.freckles || 0, moles: f.moles ?? 1,
    stub: d.beard?.style === 'stubble' ? 1 : d.beard ? 0.3 : D.adult && !fem ? 0.22 + 0.1 * old : 0,
    // stubble: blue-grey from dark hairs, lighter and greyer from grey ones
    stubLin: d.beard?.color != null ? mixc(lin(STUBBLE), lin(d.beard.color), 0.45) : lin(STUBBLE),
    seed: hash1((d.name || 'x').length * 1.7 + (d.skin ?? 0) * 1e-6 + (d.age ?? 30) * 0.131 + (d.height ?? 1.7) * 3.3) * 100,
  };
  // brows: women's thinner, higher, more arched
  P.browThick = lerp(d.browStyle === 'heavy' ? 1.45 : d.browStyle === 'thin' ? 0.62 : fem ? 0.62 : 1, 0.5, kid);
  P.browArch = lerp(fem ? 1.5 : 1, 1.1, kid) * (f.browArch ?? 1);
  P.browY = (fem ? 0.007 : 0) + (f.browY || 0);
  // kids' brows are fine and pale (mostly skin); grey brows let the skin show between the hairs
  P.browLin = mixc(lin(d.brows ?? darker(d.hair?.color ?? 0x3a2a1e, 0.85)), P.skin, lerp(0.1, 0.6, kid));
  P.browDens = lerp(1, 0.65, kid);
  // the hair, for the scalp tint under it (short cuts show the scalp; every cut gets a soft hairline)
  const hs = d.hair || {};
  P.hairStyle = hs.style || 'short';
  P.hairLin = lin(hs.color ?? 0x3a2a1e);
  P.rec = hs.recede ?? (!fem && D.adult ? clamp((D.age - 35) / 40, 0, 0.8) : 0);
  P.scalp = P.hairStyle === 'bald' ? 0 : P.hairStyle === 'crew' || P.hairStyle === 'buzz' ? 0.62 : 0.42;
  P.longHair = ['pony', 'bun'].includes(P.hairStyle);   // tied back: the hairline runs over the ears
  P.W = (h) => Wb(h) * wid * (h < 0.34 ? lerp(jaw, 1, sstep(0.12, 0.34, h)) : 1) * (h > 0.5 ? 1 + kid * 0.05 * sstep(0.5, 0.7, h) : 1) * (fem ? lerp(lerp(0.94, 1, kid), 1, sstep(0.1, 0.46, h)) : 1)
    * (1 + kid * 0.07 * G2((h - 0.24) / 0.12, 0));
  P.F = (h) => Fb(h) * (h < 0.12 ? lerp(chin, 1, sstep(0.06, 0.12, h)) : 1) * (1 - 0.06 * kid * (1 - sstep(0.4, 0.6, h)));
  P.B = (h) => Bb(h) * (1 + fat * 0.06 * (1 - sstep(0.1, 0.3, h)));
  P.PF = (h) => lerp(PFb(h), 2, kid * 0.4);
  P.moleAt = Array.from({ length: Math.round(3 * P.moles) }, (_, q) => [(hash1(P.seed + q * 7.1) - 0.5) * 0.5, 0.12 + hash1(P.seed + q * 3.3) * 0.5, 0.004 + 0.003 * hash1(P.seed + q * 5.9)]);
  const hb = P.eh + 0.075;
  P.browT0 = thetaAt(P, 0.05, hb); P.browT1 = thetaAt(P, 0.225, hb);
  return P;
}

// The brow at theta th (either side): its centre height and half-height (head units), and u
// (0 at the inner end, 1 at the tail).
const _brow = [0, 0, 0];
function browAt(P, th) {
  const u = clamp((Math.abs(th) - P.browT0) / (P.browT1 - P.browT0), 0, 1);
  const mid = P.eh + 0.072 + P.browY + 0.016 * P.browArch * Math.sin(PI * Math.min(1, u * 1.25)) - P.frown * 0.022 * (1 - u) * (1 - u) - (P.browArch > 1.2 ? 0.006 * sstep(0.7, 1, u) : 0);
  _brow[0] = mid; _brow[1] = (0.017 - 0.009 * u) * P.browThick; _brow[2] = u;
  return _brow;
}

// The mouth: the mouth line (corners a little up, down with a frown), the upper lip with a Cupid's
// bow and a soft ridge at its border, the fuller lower lip. Sets the radial bump `d` (head units)
// and the vermilion masks `up` / `lo` used by the face colour.
const _lip = { d: 0, up: 0, lo: 0, ml: 0, t: 0 };
function lipAt(P, x, h) {
  const o = _lip, xc = 0.1 * P.mw, t = Math.abs(x) / xc, lk = P.lips * (1 - P.old * 0.35);
  const ml = P.mh + (0.003 + 0.002 * P.kid) * t * t - 0.007 * P.frown * t * t * t + 0.006 * P.smile * t * t * t;
  const dh = h - ml;
  o.t = t; o.ml = ml; o.d = 0; o.up = 0; o.lo = 0;
  if (t > 1.5 || dh > 0.08 || dh < -0.09) return o;
  const env = t < 1 ? Math.pow(1 - t * t, 0.6) : 0, sq = Math.sqrt(lk);
  if (dh >= 0) {
    const hu = (0.019 + 0.007 * G2((t - 0.32) / 0.15, 0) - 0.004 * G2(t / 0.1, 0)) * sq * Math.pow(Math.max(0, 1 - Math.pow(Math.min(t, 1), 2.4)), 0.55) + 0.001;
    const s = dh / hu;
    o.up = sstep(1.12, 0.9, s) * sstep(1.12, 0.94, t);
    o.d = 0.0085 * lk * Math.pow(Math.sin(PI * clamp(0.15 + 0.7 * s, 0, 1)), 0.7) * sstep(1.35, 0.95, s) * env;
  } else {
    const hl = 0.03 * sq * Math.pow(Math.max(0, 1 - Math.min(t, 1) ** 2), 0.5) + 0.001;
    const s = -dh / hl;
    o.lo = sstep(1.12, 0.9, s) * sstep(1.1, 0.92, t);
    o.d = 0.012 * lk * Math.pow(Math.sin(PI * clamp(0.1 + 0.75 * s, 0, 1)), 0.6) * sstep(1.4, 0.95, s) * env;
  }
  o.d -= 0.0045 * G2(dh / 0.0075, 0) * sstep(1.25, 0.9, t);
  o.d -= 0.004 * G2((t - 1.03) / 0.1, dh / 0.012);
  return o;
}

// Bumps and dents on the head surface (head units, along the horizontal radius).
function headDelta(P, x, h, z) {
  const ax = Math.abs(x), fr = sstep(0.12, 0.26, z), eh = P.eh, nb = P.nb, mh = P.mh, old = P.old, ex = P.ex, es = P.eye;
  let d = 0;
  // cheekbones (women's a little higher and further forward), temples; jowls; a double chin
  d += 0.019 * P.cheek * G2((ax - 0.235 + (P.fem ? 0.012 : 0)) / 0.065, (h - eh + 0.075 - P.cheekY - (P.fem ? 0.008 : 0)) / 0.055);
  d -= 0.01 * G2((ax - 0.3) / 0.05, (h - 0.58) / 0.06);
  d += (0.014 * old + 0.018 * P.fat) * G2((ax - 0.2) / 0.06, (h - 0.13) / 0.05);
  d += 0.02 * P.fat * G2(x / 0.11, h / 0.035) * sstep(0.0, 0.2, z);
  if (fr <= 0) return d;
  // eye sockets, brow ridge and glabella, the nasion
  d -= 0.03 * es * (1 - 0.4 * P.kid) * G2((ax - ex + 0.004) / (0.056 * es), (h - eh - 0.004) / (0.042 * es)) * fr;
  d += 0.015 * P.brow * G2((ax - 0.125) / 0.095, (h - eh - 0.08) / 0.024) * fr;
  d += 0.007 * P.brow * G2(x / 0.05, (h - eh - 0.072) / 0.03) * fr;
  d -= 0.006 * G2(x / 0.045, (h - eh - 0.032) / 0.02) * fr;
  // the hollow under the cheekbones (with age, unless fat)
  d -= (0.003 + 0.01 * old) * (1 - Math.min(1, P.fat)) * G2((ax - 0.22) / 0.05, (h - nb + 0.03) / 0.045) * fr;
  // the muzzle round the teeth, the lips, philtrum, mentolabial fold, chin
  d += 0.012 * G2(x / 0.13, (h - mh - 0.01) / 0.07) * fr;
  d += lipAt(P, x, h).d * fr;
  d -= 0.0035 * G2(x / 0.015, (h - (mh + nb) / 2 - 0.006) / 0.03) * fr;
  d -= 0.008 * G2(x / 0.07, (h - mh + 0.066) / 0.017) * fr * (1 - 0.5 * P.kid);
  d += 0.012 * P.chin * G2(x / (P.fem ? 0.058 : 0.07), (h - 0.055) / 0.035) * fr;
  // nasolabial folds, from the nose wings down past the mouth corners, the cheek mass beside them
  const t = clamp((nb + 0.01 - h) / (nb - mh + 0.05), 0, 1), xf = lerp(0.088, 0.14, t) * P.mw;
  const nl = G2((ax - xf) / 0.013, (h - (nb + mh) / 2 + 0.01) / ((nb - mh + 0.05) * 0.55));
  d -= (0.004 + 0.006 * old + 0.002 * P.frown) * nl * fr * (1 - 0.75 * P.kid);
  d += (0.006 + 0.004 * old + 0.01 * P.fat + (P.fem ? 0.004 : 0)) * G2((ax - xf - 0.042) / 0.032, (h - (nb + mh) / 2) / 0.06) * fr;
  // age: eye bags, marionette lines; fat and kids: round cheeks
  d += 0.008 * old * G2((ax - ex) / 0.045, (h - eh + 0.052) / 0.014) * fr;
  d -= 0.004 * old * G2((ax - 0.118) / 0.012, (h - mh + 0.05) / 0.035) * fr;
  d += (0.018 * P.fat + P.kid * 0.026) * G2((ax - 0.17) / 0.09, (h - nb + 0.02) / 0.08) * fr;
  // kids: a round, prominent forehead
  if (P.kid > 0) d += 0.014 * P.kid * G2(x / 0.2, (h - 0.68) / 0.11) * sstep(0.0, 0.2, z);
  return d;
}
function headPt(P, th, h, out) {
  const w = P.W(h), f = P.F(h), b = P.B(h), p = P.PF(h);
  const s = Math.sin(th), c = Math.cos(th), e = 2 / (c >= 0 ? p : 2);
  const x = w * Math.sign(s) * Math.pow(Math.abs(s), e);
  const z = c >= 0 ? f * Math.pow(c, e) : b * Math.pow(-c, e);
  const dl = headDelta(P, x, h, z), r = Math.hypot(x, z) || 1;
  out[0] = x + (x / r) * dl; out[1] = h; out[2] = z + (z / r) * dl;
  return out;
}
const _ha = [0, 0, 0], _hb = [0, 0, 0];
function headN(P, th, h, out) {
  const hh = Math.min(h, 0.965), e = 0.012;
  headPt(P, th + e, hh, _ha); headPt(P, th - e, hh, _hb);
  const tx = _ha[0] - _hb[0], ty = _ha[1] - _hb[1], tz = _ha[2] - _hb[2];
  headPt(P, th, hh + 0.01, _ha); headPt(P, th, hh - 0.01, _hb);
  const ux = _ha[0] - _hb[0], uy = _ha[1] - _hb[1], uz = _ha[2] - _hb[2];
  let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
  const k = sstep(0.94, 1, h);
  let l = Math.hypot(nx, ny, nz) || 1;
  nx = lerp(nx / l, 0, k); ny = lerp(ny / l, 1, k); nz = lerp(nz / l, 0, k);
  l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  return out;
}
// The theta of the front surface point at a given x and h.
function thetaAt(P, x, h) {
  const s = clamp(Math.abs(x) / P.W(h), 0, 0.999);
  return Math.asin(Math.pow(s, P.PF(h) / 2)) * Math.sign(x);
}
// The front surface z (head units) at a given x and h (solves the superellipse for theta).
function faceZ(P, x, h) {
  return headPt(P, thetaAt(P, x, h), h, _ha)[2];
}
const toModel = (P, x, h, z, out) => { out[0] = x * P.Hh; out[1] = P.chinY + h * P.Hh; out[2] = P.z0 + z * P.Hh; return out; };

const FOREHEAD = [0.605, 0.637, 0.668];   // forehead lines (old faces)
const HEAD_HS = [
  null,
  [0, 0.03, 0.07, 0.11, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.44, 0.48, 0.52, 0.56, 0.61, 0.67, 0.73, 0.8, 0.86, 0.91, 0.955, 0.985],
  [0, 0.05, 0.11, 0.19, 0.27, 0.36, 0.43, 0.5, 0.58, 0.68, 0.78, 0.87, 0.94, 0.985],
];

// The face texture's UV: u round the head (the face gets most of the width: u = 0.5 at the front,
// 0 / 1 at the back), v = h. A texel inside the neck stays neutral, for the other skin parts.
const FT_W = 320, FT_H = 272, FT_A = 0.75, TEXK = 1.5, FT_NEUTRAL = [0.993, 0.012];
const ftU = (th) => { const t = th - TAU * Math.round(th / TAU); return 0.5 + (t + FT_A * Math.sin(t)) / TAU; };
function ftTh(u) {
  const M = TAU * (u - 0.5);
  let a = -PI, b = PI;
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (m + FT_A * Math.sin(m) < M) a = m; else b = m; }
  return (a + b) / 2;
}
// UVs for a part lying on the face (the nose): each vertex takes the face texture under it.
function faceUV(P, geo) {
  const p = geo.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const h = (p.getY(i) - P.chinY) / P.Hh;
    uv[i * 2] = ftU(thetaAt(P, p.getX(i) / P.Hh, clamp(h, 0, 1))); uv[i * 2 + 1] = clamp(h, 0, 1);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.faceUV = true;
  return geo;
}

// lod 0: a dense grid (with a duplicated seam column for the UV) and normals from the grid; the
// colour is in the face texture. lod 1-2: rings through the features, analytic normals, the face
// colour in vertex colours.
function headMesh(P, d, bi, lod) {
  const dense = lod === 0;
  let hs;
  if (dense) {
    hs = [0, 0.007];
    for (let h = 0.014; h < 0.665; h += 0.0068) hs.push(h);
    for (let h = 0.684; h < 0.95; h += 0.022) hs.push(h);
    hs.push(0.958, 0.97, 0.979, 0.987);
    // the nearest rings snap to the mouth line, the nose base and the pupils
    for (const L of [P.mh, P.nb, P.eh]) { let q = 1; for (let i = 1; i < hs.length; i++) if (Math.abs(hs[i] - L) < Math.abs(hs[q] - L)) q = i; hs[q] = L; }
    hs.sort((a, b) => a - b);
  } else {
    // lod 1: rings on the lip borders and the mouth line (a sharp lip edge), the nose base, the eyes
    const extra = lod === 1 ? [P.mh - 0.03, P.mh - 0.016, P.mh - 0.006, P.mh, P.mh + 0.007, P.mh + 0.019, P.nb, P.eh - 0.032, P.eh, P.eh + 0.03] : [];
    hs = HEAD_HS[lod].concat(extra).sort((a, b) => a - b);
    hs = hs.filter((h, i) => i === 0 || h - hs[i - 1] > (lod === 1 ? 0.0055 : 0.009));
  }
  const n = [72, 32, 16][lod];
  const ths = dense ? Array.from({ length: n + 1 }, (_, j) => { const u = -PI + (TAU * j) / n; return u - 0.55 * Math.sin(u); }) : faceThetas(n);
  const J = ths.length, R = hs.length, nv = R * J + 2;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), nrm = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const uv = dense ? new Float32Array(nv * 2) : null;
  const pt = [0, 0, 0], mp = [0, 0, 0], cc = [0, 0, 0], nn = [0, 0, 0];
  let k = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < J; j++, k++) {
    const h = hs[i], th = ths[j];
    headPt(P, th, h, pt);
    toModel(P, pt[0], h, pt[2], mp);
    pos.set(mp, k * 3);
    if (dense) { uv[k * 2] = ftU(th); uv[k * 2 + 1] = h; }
    else { faceColor(P, pt[0], h, pt[2], cc, th, false); col.set(cc, k * 3); headN(P, th, h, nn); nrm.set(nn, k * 3); }
    const wj = (1 - sstep(P.mh - 0.035, P.mh + 0.004, h)) * sstep(0.02, 0.22, pt[2]) * 0.95;
    si[k * 4] = bi.head; sw[k * 4] = 1 - wj; si[k * 4 + 1] = bi.jaw; sw[k * 4 + 1] = wj;
  }
  if (dense) {
    // normals by central differences over the grid (the seam column wraps)
    const p = (i, j) => (i * J + j) * 3;
    for (let i = 0; i < R; i++) for (let j = 0; j < J; j++) {
      const a = p(i, j === J - 1 ? 1 : j + 1), b = p(i, j === 0 ? J - 2 : j - 1), c = p(Math.min(R - 1, i + 1), j), e = p(Math.max(0, i - 1), j);
      const tx = pos[a] - pos[b], ty = pos[a + 1] - pos[b + 1], tz = pos[a + 2] - pos[b + 2];
      const ux = pos[c] - pos[e], uy = pos[c + 1] - pos[e + 1], uz = pos[c + 2] - pos[e + 2];
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
      let l = Math.hypot(nx, ny, nz) || 1;
      const kk = sstep(0.94, 1, hs[i]);
      nx = lerp(nx / l, 0, kk); ny = lerp(ny / l, 1, kk); nz = lerp(nz / l, 0, kk);
      l = Math.hypot(nx, ny, nz) || 1;
      const q = p(i, j);
      nrm[q] = nx / l; nrm[q + 1] = ny / l; nrm[q + 2] = nz / l;
    }
  }
  const bp = k++, tp = k++;
  const avg = (ring, out) => { out[0] = out[1] = out[2] = 0; const m = dense ? J - 1 : J; for (let j = 0; j < m; j++) for (let q = 0; q < 3; q++) out[q] += pos[(ring * J + j) * 3 + q] / m; return out; };
  avg(0, mp); pos.set([mp[0], mp[1] - 0.004, mp[2]], bp * 3);
  avg(R - 1, mp); pos.set([0, P.chinY + P.Hh, mp[2]], tp * 3);
  col.set(col.subarray(0, 3), bp * 3); col.set(col.subarray((R - 1) * J * 3, (R - 1) * J * 3 + 3), tp * 3);
  nrm.set([0, -1, 0], bp * 3); nrm.set([0, 1, 0], tp * 3);
  if (dense) { uv.set(FT_NEUTRAL, bp * 2); uv.set([0.5, 1], tp * 2); }
  si[bp * 4] = bi.jaw; sw[bp * 4] = 0.9; si[bp * 4 + 1] = bi.head; sw[bp * 4 + 1] = 0.1;
  si[tp * 4] = bi.head; sw[tp * 4] = 1;
  const idx = [];
  const JJ = dense ? J - 1 : J;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < JJ; j++) {
    const a = i * J + j, b = i * J + ((j + 1) % J), c = (i + 1) * J + j, e = (i + 1) * J + ((j + 1) % J);
    idx.push(a, b, c, b, e, c);
  }
  for (let j = 0; j < JJ; j++) { idx.push(j, bp, (j + 1) % J); idx.push((R - 1) * J + j, (R - 1) * J + ((j + 1) % J), tp); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (dense) { geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.userData.faceUV = true; }
  geo.setIndex(idx);
  return geo;
}

// Multipliers on the skin colour: lips, the mouth line, contact shadow in the folds and sockets,
// cold-flushed cheeks, age, the blue-grey shadow of stubble, the scalp under the hair. `hi`: for
// the face texture (sharp borders, lines and wrinkles, skin grain, freckles, moles, stubble grain,
// painted brows and hairline); without it the smooth version for vertex colours.
const STUBBLE = 0x55575c;
let r = 1, g = 1, b = 1;
const mul = (k, kr, kg, kb) => { if (k > 1e-4) { r *= 1 - kr * k; g *= 1 - kg * k; b *= 1 - kb * k; } };
const toward = (c, k, s) => { r = lerp(r, c[0] / s[0], k); g = lerp(g, c[1] / s[1], k); b = lerp(b, c[2] / s[2], k); };
// a line or crease: darkens like mul and also deepens `crease` (the face texture's alpha: lines are
// matte and, through the skin shader's relief, grooves)
let crease = 0;
const ln = (k, kr, kg, kb) => { if (k > 1e-4) { mul(k, kr, kg, kb); crease += k * kg; } };
// The broad terms (fine at the vertices of a coarse grid): socket shadows, cold flush, the paler
// forehead, unevenness, age's sallow blotchy tone, temples, hollow cheeks.
function faceSmooth(P, x, h, z) {
  const ax = Math.abs(x), fr = sstep(0.18, 0.3, z), eh = P.eh, nb = P.nb, old = P.old, ex = P.ex, sd = P.seed;
  if (fr > 0.001) {
    // the eye sockets: the bowl round the eye, deepest at the inner corner beside the nose bridge and
    // under the brow ridge (the orbital roof), so the eyes sit in shade as real ones do
    const sk = fr * (1 - 0.5 * P.kid);
    mul(G2((ax - ex) / 0.062, (h - eh) / 0.047) * sk, 0.12, 0.16, 0.14);
    mul(G2((ax - ex + 0.059) / 0.024, (h - eh + 0.005) / 0.032) * sk, 0.16, 0.21, 0.18);
    mul(G2((ax - ex + 0.008) / 0.05, (h - eh - 0.034) / 0.017) * sk * (0.7 + 0.3 * P.brow), 0.08, 0.11, 0.1);
    mul(G2((ax - 0.2) / 0.075, (h - eh + 0.12) / 0.07) * fr * P.rosy, -0.02, 0.12, 0.12);
    mul(G2(x / 0.06, (h - 0.06) / 0.04) * fr * P.rosy * 0.5, 0, 0.07, 0.07);
    // cold: the apples of the cheeks flushed in blotches, the nose tip red, the chin a little
    const cold = P.cold * fr;
    mul(G2((ax - 0.165) / 0.058, (h - eh + 0.1) / 0.055) * cold * (0.55 + 0.9 * vnoise(x * 22 + 5 + sd, h * 22, 61)), -0.04, 0.16, 0.14);
    mul(G2(x / 0.034, (h - nb - 0.04) / 0.032) * cold, -0.05, 0.2, 0.18);
    mul(G2(x / 0.07, (h - 0.075) / 0.04) * cold * 0.5, -0.02, 0.06, 0.05);
    // warmth where the skin is thin and well supplied: the nose and round the nostrils, the inner
    // corners of the eyes, the lower lids (a little darker, cooler)
    mul(G2(x / 0.05, (h - nb - 0.03) / 0.05) * fr * (0.5 + 0.4 * P.rosy), -0.025, 0.08, 0.08);
    mul(G2((ax - ex + 0.05) / 0.018, (h - eh) / 0.02) * fr, -0.02, 0.07, 0.06);
    mul(G2((ax - ex) / 0.04, (h - eh + 0.035) / 0.012) * fr * (1 - 0.6 * P.kid), 0.03, 0.06, 0.03);
    if (old > 0) {
      mul(old * G2((ax - 0.235) / 0.035, (h - eh + 0.005) / 0.04) * fr, 0.08, 0.1, 0.09);
      mul(old * G2((ax - 0.21) / 0.04, (h - nb + 0.02) / 0.05) * fr * (1 - P.fat), 0.07, 0.09, 0.08);
    }
  }
  if (h > 0.6) { const k = sstep(0.6, 0.72, h); g *= 1 - 0.015 * k; b *= 1 - 0.04 * k; }
  mul(vnoise(x * 8 + 7 + sd, h * 7 + z * 4, 21) - 0.5, 0.06, 0.08, 0.08);
  if (old > 0) {
    const n1 = vnoise(x * 12 + 3 + sd, h * 11, 11) - 0.5, n2 = vnoise(x * 24, h * 20 + z * 10, 13) - 0.5;
    mul(old * (n1 * 0.9 + n2 * 0.6), 0.1, 0.16, 0.16);
    mul(old * 0.5, 0.0, 0.02, 0.07);
  }
}
// The sharp terms: lips, mouth line, creases and lines, the nose base, nasolabial folds, eye bags;
// with `hi` (the texture) also skin grain, freckles, moles, crow's feet, age spots, stubble grain,
// painted brows and single hairs at the hairline. hl: the hairline at th if the caller has it.
function faceDetail(P, x, h, z, th, hi, hl) {
  const ax = Math.abs(x), fr = sstep(0.18, 0.3, z), eh = P.eh, nb = P.nb, mh = P.mh, old = P.old, ex = P.ex, sd = P.seed;
  let lipM = 0;
  if (fr > 0.001) {
    // lips: the vermilion darker and redder (women's a little more), with a defined border
    const L = lipAt(P, x, h);
    if (L.t < 1.5) {
      lipM = clamp(L.up + L.lo * 0.85, 0, 1);
      const fk = P.femK;
      mul(lipM * lerp(1, 1.22, fk) * (1 - old * 0.3) * (1 - 0.3 * P.kid) * (hi ? 1 : 0.72) * fr, lerp(0.1, 0.12, fk), lerp(0.33, 0.46, fk), lerp(0.29, 0.36, fk));
      if (hi) {
        mul(L.up * sstep(0.004, 0.0, h - L.ml - 0.004) * fr, 0.1, 0.14, 0.12);          // the upper lip's shaded underside
        mul(-0.07 * L.lo * G2((h - L.ml + 0.013 * Math.sqrt(P.lips)) / 0.006, 0) * fr, 1, 1, 1);  // the lower lip catches light
        if (old > 0.2 && P.fem) ln(old * 0.5 * sstep(0.6, 0.95, Math.abs(Math.sin(x * 170 + vnoise(x * 30, h * 30, 7) * 3))) * G2(x / 0.08, (h - L.ml - 0.04) / 0.02) * fr, 0.08, 0.1, 0.09);
      }
      ln(G2((h - L.ml) / (hi ? 0.0042 : 0.0065), 0) * sstep(1.2, 0.85, L.t) * fr * (1 - 0.35 * P.kid), 0.48, 0.56, 0.56);   // mouth line
      ln(G2((L.t - 1.02) / 0.09, (h - L.ml) / 0.011) * fr * (1 - 0.7 * P.kid) * (1 - 0.4 * clamp(P.smile, 0, 1)), 0.25, 0.3, 0.3);   // corners
    }
    const kd = 1 - 0.75 * P.kid;   // kids: soft, barely any lines
    ln(G2(x / 0.06, (h - mh + 0.03 * Math.sqrt(P.lips) + 0.016) / 0.012) * fr * (1 - 0.5 * P.kid), 0.08, 0.11, 0.11);     // under the lower lip
    // the lid crease under the brow, the tear trough
    ln(G2((ax - ex + 0.004) / 0.07, (h - eh - 0.048 + (P.fem ? 0.004 : 0)) / (hi ? 0.009 : 0.014)) * fr * kd, hi ? 0.13 : 0.09, hi ? 0.17 : 0.12, hi ? 0.15 : 0.11);
    ln(G2((ax - ex + 0.012) / 0.045, (h - eh + 0.058) / 0.016) * fr * (0.45 + old) * kd, 0.06, 0.12, 0.07);
    // nose base, nasolabial folds
    ln(G2(x / 0.05, (h - nb + 0.003) / 0.009) * fr, 0.2, 0.25, 0.25);
    const t = clamp((nb + 0.01 - h) / (nb - mh + 0.05), 0, 1), xf = lerp(0.088, 0.14, t) * P.mw;
    const span = (nb - mh + 0.05) * 0.5, hy = (h - (nb + mh) / 2 + 0.01) / span;
    // the nasolabial fold: shade on the mouth's side, the cheek's fullness catching light above it
    ln(G2((ax - xf + 0.006) / 0.013, hy) * fr * (0.65 + old + 0.3 * P.frown + 0.2 * P.fat) * kd, 0.11, 0.15, 0.13);
    mul(G2((ax - xf - 0.016) / 0.016, hy * 0.9) * fr * (0.4 + 0.5 * old + 0.3 * P.fat) * kd, -0.035, -0.03, -0.03);
    if (hi) ln(G2((ax - xf + 0.009) / 0.0035, hy * 1.1) * fr * (0.2 + 0.9 * old + 0.3 * P.frown + 0.25 * P.fat) * kd, 0.11, 0.14, 0.13);
    if (P.frown > 0) ln(P.frown * G2((ax - 0.022) / (hi ? 0.0045 : 0.007), (h - eh - 0.05) / 0.025) * fr, 0.06, 0.08, 0.08);   // frown lines
    if (hi) {
      // a faint reddish mottling; freckles, moles
      mul((vnoise(x * 30 + sd, h * 30, 33) - 0.5) * fr, -0.02, 0.05, 0.04);
      if (P.freckles > 0) { const fk = vnoise(x * 70 + sd, h * 70, 34); mul(P.freckles * sstep(0.68, 0.8, fk) * fr * G2(x / 0.25, (h - nb) / 0.12), 0.12, 0.2, 0.26); }
      for (let q = 0; q < P.moleAt.length; q++) { const M = P.moleAt[q]; mul(G2((x - M[0]) / M[2], (h - M[1]) / M[2]) * fr * 0.8, 0.35, 0.45, 0.5); }
    }
    // age: eye bags, marionette lines, forehead lines, crow's feet, age spots
    if (old > 0) {
      ln(old * G2((ax - ex) / 0.05, (h - eh + 0.064) / (hi ? 0.009 : 0.016)) * fr, 0.14, 0.19, 0.16);
      ln(old * G2((ax - 0.118 * P.mw) / (hi ? 0.006 : 0.014), (h - mh + 0.05) / 0.035) * fr, 0.14, 0.17, 0.16);
      if (h > 0.58 && h < 0.7) {
        let fl = 0;
        for (const f of FOREHEAD) fl += G2(0, (h - f - (hi ? 0.004 * Math.sin(x * 22 + sd + f * 40) : 0)) / (hi ? 0.0035 : 0.0055));
        ln(old * fl * G2(x / 0.19, 0) * fr, 0.16, 0.18, 0.17);
      }
      if (hi) {
        const cx = ax - ex - 0.062, cy = h - eh + 0.004, rr = Math.hypot(cx, cy);
        if (cx > -0.01 && rr < 0.07) {
          const a = Math.atan2(cy, cx), lk = sstep(0.75, 0.95, Math.sin(a * 9 + sd + vnoise(rr * 60, a * 3, 8) * 2));
          ln(old * lk * sstep(0.012, 0.025, rr) * sstep(0.07, 0.04, rr) * fr, 0.12, 0.15, 0.14);
        }
        ln(old * G2((ax - ex) / 0.04, (h - eh + 0.074) / 0.0035) * fr, 0.1, 0.13, 0.12);
        mul(old * old * sstep(0.8, 0.88, vnoise(x * 38 + sd, h * 38 + z * 15, 35)) * sstep(0.1, 0.25, z) * 0.55, 0.12, 0.2, 0.28);
      }
    }
  }
  // skin grain
  if (hi) mul((vnoise(x * 95 + sd, h * 95 + z * 40, 31) - 0.5) * 0.6 + (vnoise(x * 210, h * 210 + z * 90, 32) - 0.5) * 0.4, 0.05, 0.06, 0.06);
  // stubble: the skin of the beard area turns blue-grey (jaw, chin, upper lip, the cheeks below
  // the cheekbones, down the throat), grainy in the texture
  if (P.stub > 0 && z > -0.13) {
    // the beard line: over the upper lip, down the cheek from the sideburns to near the mouth corners
    const top = ax < 0.1 ? nb - 0.012 : lerp(nb - 0.035, 0.44, sstep(0.1, 0.3, ax));
    const area = (1 - sstep(top - 0.025, top + 0.03, h)) * sstep(-0.12, 0.05, z) * (1 - lipM * 0.95) * (1 - G2(x / 0.03, (h - nb + 0.012) / 0.012) * 0.6);
    let k = P.stub * 0.26 * area;
    if (hi && k > 0.002) k *= 0.8 + 0.4 * sstep(0.35, 0.7, vnoise(x * 340 + sd, h * 340 + z * 150, 36)) - 0.08 * sstep(0.55, 0.8, vnoise(x * 70 + sd, h * 70, 38));
    if (k > 0.001) toward(P.stubLin, k, P.skin);
  }
  // brows (texture only, no strips over them at lod 0): single hairs over the skin, growing up at the
  // inner end, outwards along the body and down at the tail, a ragged edge, sparser towards the tail
  if (hi && fr > 0.1 && th !== undefined && Math.abs(h - eh - 0.08) < 0.06) {
    const B_ = browAt(P, th), bm = B_[0], bh = B_[1], u = B_[2];
    const span = sstep(P.browT0 - 0.05, P.browT0 + 0.035, Math.abs(th)) * sstep(P.browT1 + 0.035, P.browT1 - 0.06, Math.abs(th));
    const dy = (h - bm) / bh;
    const edge = sstep(1.3, 0.55, Math.abs(dy) + 0.4 * (vnoise(th * 70 + sd, h * 110, 41) - 0.5)) * span;
    if (edge > 0.001) {
      const ang = lerp(1.2, 0.2, sstep(0.0, 0.4, u)) - 0.4 * sstep(0.75, 1, u);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const along = ax * ca + h * sa, across = -ax * sa + h * ca;
      const hairs = vnoise(across * 300 + sd, along * 50, 42) * 0.7 + vnoise(across * 520, along * 80 + sd, 43) * 0.3;
      const core = sstep(1.0, 0.3, Math.abs(dy));
      const k = edge * (0.3 + 0.25 * core + 0.6 * sstep(0.38, 0.68, hairs)) * P.browDens * (1 - 0.3 * sstep(0.6, 1, u));
      toward(P.browLin, Math.min(0.97, k), P.skin);
    }
  }
  // the scalp under the hair takes the hair's colour, fading out a little below the hairline; in
  // the texture as single hairs thinning out towards the edge
  if (P.scalp > 0 && th !== undefined) {
    const a = wrapAbs(th);
    if (hl === null) hl = hairlineFor(P, th);
    if (h > hl - 0.04) {
      let on = hi ? sstep(hl - 0.032, hl + 0.022, h) : sstep(hl - 0.035, hl + 0.012, h);
      if (P.hairStyle === 'balding') on *= sstep(0.8, 1.05, a) * (1 - sstep(0.01, 0.05, h - lerp(0.58, 0.68, sstep(PI / 2, PI, a))));
      let k;
      if (hi) {
        const flow = a < 1.1 ? 1 : 0.4;    // strands run up the forehead, down the sides
        const nn = vnoise(th * 55 * flow + sd, h * 55 / flow * 0.4, 4) * 0.55 + vnoise(th * 140, h * 50, 9) * 0.45;
        k = sstep(1 - on - 0.18, 1 - on + 0.12, nn) * Math.min(1, P.scalp * 1.35);
      } else k = on * P.scalp * (0.8 + 0.4 * vnoise(th * 26, h * 34, 4));
      if (k > 0.001) toward(P.hairLin, k, P.skin);
    }
  }
}
function faceColor(P, x, h, z, out, th, hi = false, hl = null) {
  r = 1; g = 1; b = 1; crease = 0;
  faceSmooth(P, x, h, z);
  faceDetail(P, x, h, z, th, hi, hl);
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

// The skin's oil per texel (the face texture's alpha, read by the cast's own skin material, see
// faceSkinMat): it scales the specular and lowers the roughness, and its fine detail becomes relief.
// The T-zone (forehead, the nose's ridge and tip, the chin) oilier by P.oil, the lips wet, the cheeks
// and the flanks of the nose drier (a lit nose flank was the brightest thing in every portrait), pores
// as small matte pits (densest on the nose and cheeks), lines and creases (cr, from faceDetail) matte
// grooves, stubble and the hair-tinted scalp matte.
const SPEC_MAX = 1.6;
function faceSpec(P, x, h, z, hl, cr = 0) {
  const ax = Math.abs(x), fr = sstep(0.18, 0.3, z), oil = P.oil, sd = P.seed;
  let sp = 0.52 + 0.08 * oil;
  sp += 0.17 * oil * G2(x / 0.16, (h - 0.66) / 0.08) * fr;
  sp += 0.28 * oil * G2(x / 0.035, (h - P.nb - 0.04) / 0.025) * fr;
  sp += 0.1 * oil * G2(x / 0.06, (h - 0.07) / 0.04) * fr;
  sp -= 0.3 * G2((ax - 0.035) / 0.03, (h - P.nb - 0.1) / 0.07) * fr;
  sp -= 0.2 * G2((ax - 0.19) / 0.07, (h - P.eh + 0.1) / 0.08) * fr;
  const L = lipAt(P, x, h);
  if (L.t < 1.5) sp += 0.45 * clamp(L.up + L.lo, 0, 1) * fr;
  if (P.stub > 0 && z > -0.13) {
    const top = ax < 0.1 ? P.nb - 0.012 : lerp(P.nb - 0.035, 0.44, sstep(0.1, 0.3, ax));
    sp -= 0.3 * Math.min(1, P.stub * 1.5) * (1 - sstep(top - 0.025, top + 0.03, h)) * sstep(-0.12, 0.05, z) * (1 - clamp(L.up + L.lo, 0, 1));
  }
  if (fr > 0.01) {
    const dens = 0.45 + 0.55 * G2(x / 0.07, (h - P.nb - 0.03) / 0.06) + 0.45 * G2((ax - 0.15) / 0.08, (h - P.eh + 0.1) / 0.07);
    sp -= PORE * dens * sstep(0.58, 0.85, vnoise(x * 260 + sd, h * 260 + z * 120, 52)) * fr * (1 - 0.6 * P.kid) * (1 - clamp(L.up + L.lo, 0, 1));
    sp += 0.07 * (vnoise(x * 150 + sd * 2, h * 150 + z * 60, 53) - 0.5) * fr;
  }
  sp -= CREASE * Math.min(1, cr);
  if (P.scalp > 0 && hl !== null && h > hl - 0.03) sp *= lerp(1, 0.45, sstep(hl - 0.03, hl + 0.02, h));
  return clamp(sp, 0.1, SPEC_MAX);
}
// pores and creases in the oil map (spec units); the relief per unit of oil (texture alpha 0..1), m
let PORE = 0.16, CREASE = 0.55, FACE_RELIEF = 0.0016;
// look-dev hook (tools/people.html): tune the face's micro-detail
export function faceTuning(o = {}) { if (o.pore !== undefined) PORE = o.pore; if (o.crease !== undefined) CREASE = o.crease; if (o.relief !== undefined) FACE_RELIEF = o.relief; return { pore: PORE, crease: CREASE, relief: FACE_RELIEF }; }

// The face texture (lod 0): faceColor() with all the detail, baked per character over the UV of
// headMesh (u round the head, v = h). Linear multipliers / TEXK (the skin's vertex colours are
// TEXK x brighter), so hair and brows lighter than the skin still fit. ~384 x 320, 0.5-0.7 mm per
// texel on the face.
const FACE_TEX = new WeakMap();
// The bake is lazy (lazy = true): the texture starts neutral and is baked a few columns at a time in
// idle time; whatever is left is finished synchronously the first time a mesh using it is rendered
// (finishFace, from its onBeforeRender), so no frame or portrait ever shows a half-baked face, and
// characters out of view at load cost nothing until later.
const FACE_JOBS = new Set();
let faceIdle = 0;
function faceTexture(P, def, lazy = false) {
  if (def && FACE_TEX.has(def)) return FACE_TEX.get(def);
  const W = FT_W, H = FT_H, data = new Uint8Array(W * H * 4);
  for (let o = 0; o < data.length; o += 4) { data[o] = data[o + 1] = data[o + 2] = 255 / TEXK + 0.5; data[o + 3] = (0.6 / SPEC_MAX) * 255 + 0.5; }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  if (def) FACE_TEX.set(def, tex);
  const job = { P, data, tex, c: -1, grid: null };
  tex.userData.job = job;
  if (!lazy) finishFace(tex);
  else {
    FACE_JOBS.add(job);
    if (!faceIdle) faceIdle = (globalThis.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 6 }), 30)))(faceIdleRun);
  }
  return tex;
}
function faceIdleRun(deadline) {
  faceIdle = 0;
  for (const job of FACE_JOBS) {
    while (deadline.timeRemaining() > 3 && !job.done) faceBake(job, 12);
    if (!job.done) break;
  }
  if (FACE_JOBS.size) faceIdle = (globalThis.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 6 }), 30)))(faceIdleRun);
}
function finishFace(tex) {
  const job = tex?.userData.job;
  if (job && !job.done) faceBake(job, FT_W);
}
// Bake up to n more columns of the face texture (the first call precomputes the coarse grid).
function faceBake(job, n) {
  const P = job.P, W = FT_W, H = FT_H, data = job.data;
  // surface points and the broad colour terms on a coarse grid, interpolated per texel; the sharp
  // terms per texel
  const GW = 97, GH = 81;
  if (!job.grid) {
    const NG = GW * GH, gx = new Float32Array(NG), gz = new Float32Array(NG), gc = new Float32Array(NG * 3), pt = [0, 0, 0];
    for (let j = 0; j < GW; j++) {
      const th = ftTh(j / (GW - 1));
      for (let i = 0; i < GH; i++) {
        const q = i * GW + j, h = i / (GH - 1);
        headPt(P, th, h, pt); gx[q] = pt[0]; gz[q] = pt[2];
        r = 1; g = 1; b = 1; faceSmooth(P, pt[0], h, pt[2]); gc[q * 3] = r; gc[q * 3 + 1] = g; gc[q * 3 + 2] = b;
      }
    }
    job.grid = { gx, gz, gc }; job.c = 0;
    if (n < W) return;
  }
  const { gx, gz, gc } = job.grid;
  const bil = (A, q, fu, fv, s = 1, o = 0) => lerp(lerp(A[q * s + o], A[(q + 1) * s + o], fu), lerp(A[(q + GW) * s + o], A[(q + GW + 1) * s + o], fu), fv);
  const nc = Math.round(FT_NEUTRAL[0] * W), nr = Math.round(FT_NEUTRAL[1] * H);
  const end = Math.min(W, job.c + n);
  for (let c = job.c; c < end; c++) {
    const u = (c + 0.5) / W, th = ftTh(u), gu = u * (GW - 1), j0 = Math.min(GW - 2, Math.floor(gu)), fu = gu - j0, hl = hairlineFor(P, th);
    for (let rI = 0; rI < H; rI++) {
      // the neutral patch (inside the neck) for the skin parts that are not the face
      if (c >= nc - 4 && rI <= nr + 4) continue;
      const h = (rI + 0.5) / H, gv = h * (GH - 1), i0 = Math.min(GH - 2, Math.floor(gv)), fv = gv - i0;
      const q = i0 * GW + j0;
      const x = bil(gx, q, fu, fv), z = bil(gz, q, fu, fv);
      r = bil(gc, q, fu, fv, 3, 0); g = bil(gc, q, fu, fv, 3, 1); b = bil(gc, q, fu, fv, 3, 2); crease = 0;
      faceDetail(P, x, h, z, th, true, hl);
      const o = (rI * W + c) * 4;
      data[o] = clamp(r / TEXK, 0, 1) * 255 + 0.5; data[o + 1] = clamp(g / TEXK, 0, 1) * 255 + 0.5; data[o + 2] = clamp(b / TEXK, 0, 1) * 255 + 0.5;
      data[o + 3] = (faceSpec(P, x, h, z, hl, crease) / SPEC_MAX) * 255 + 0.5;
    }
  }
  job.c = end;
  if (end >= W) { job.done = true; job.grid = null; job.tex.needsUpdate = true; job.tex.userData.job = null; FACE_JOBS.delete(job); }
}

// The nose: a loft of sections from the nostrils up to the nasion. Each section is a bell-shaped
// ridge whose flanks run tangentially into the face (no hard edge where the nose meets the cheek):
// a soft, fairly wide bridge (a narrow sharp ridge renders as a bright stripe), a rounded tip, the
// wings (alae) as lobes beside the base. `tip` turns the tip up (+) or down (-), `hump` adds a dorsal
// hump. Interpolated between the keys so the ridge has no facets.
function noseMesh(sb, P, d, bi, lod, tex) {
  const ns = P.nose, nb = P.nb, nh = P.eh + lerp(0.032, 0.006, P.kid), nw = Math.sqrt(ns) * P.noseW * (1 + 0.12 * P.kid), hump = P.hump * (1 - P.kid), tp = P.tip, Hh = P.Hh;
  const L = nh - nb;
  // [h, projection, half-width, ridge width (0..1 of the half-width), wing lobes]
  const keys = [
    [nb - 0.006 + tp * 0.004, 0.02, 0.072, 0.72, 0.75], [nb + 0.01 + tp * 0.004, 0.048 - tp * 0.004, 0.082, 0.6, 0.62], [nb + 0.027 + tp * 0.005, 0.066, 0.074, 0.56, 0.25],
    [nb + 0.044 + tp * 0.003, 0.071, 0.062, 0.55, 0], [nb + 0.066, 0.061 - tp * 0.002, 0.066, 0.56, 0], [nb + L * 0.42, 0.046 + hump * 0.012, 0.076, 0.6, 0],
    [nb + L * 0.62, 0.034 + hump * 0.008, 0.078, 0.62, 0], [nb + L * 0.84, 0.014, 0.075, 0.6, 0], [nh + 0.008, -0.008, 0.08, 0.62, 0],
  ];
  const sp = [1, 2, 3, 4].map((q) => spline(keys.map((k) => [k[0], k[q]])));
  const hs = lod === 2 ? keys.map((k) => k[0]) : rangeYs(keys[0][0], keys[8][0], lod ? 0.02 : 0.0075, keys.map((k) => k[0]));
  const pt = [0, 0, 0];
  const rings = hs.map((h) => {
    const zf = headPt(P, 0, h, pt)[2];
    return { y: P.chinY + h * Hh, cx: 0, cz: P.z0 + (zf - 0.03) * Hh, rx: sp[1](h) * Hh * nw, rz: 0.03 * Hh, p: 2, proj: sp[0](h) * ns * Hh, sig: sp[2](h), wing: Math.max(0, sp[3](h)) };
  });
  const nostril = P.chinY + (nb + 0.002 + tp * 0.004) * Hh, tipY = P.chinY + (nb + 0.04) * Hh;
  const n = [28, 14, 8][lod];
  const geo = loft(rings, {
    n, thetas: faceThetas(n), capBot: 0.0025 * Hh / 0.23, capTop: 0.0, w: bi.head,
    mod: (v, r) => {
      if (v.c <= 0) return;
      const u = v.s, au = Math.abs(u);
      const bell = Math.exp(-((u / r.sig) ** 2) * 1.6) - Math.exp(-1.6 / (r.sig * r.sig)) * au;
      const lobe = r.wing * G2((au - 0.66) / 0.2, 0) * 0.45;
      v.x = r.rx * u;
      v.z = r.cz + r.rz * (1 - 0.6 * u * u) * Math.sqrt(v.c) + r.proj * (Math.max(bell, 0) + lobe);
    },
    color: (v) => {
      if (v.y < nostril && Math.abs(v.x) > 0.006 * Hh / 0.23 && v.c > 0.1) return [0.42, 0.28, 0.27];
      const tip = G2((v.y - tipY) / (0.035 * Hh), 0) * sstep(0.2, 0.9, v.c);
      // the crease round the wings, where the nose base meets the cheek
      const crease = sstep(nostril + 0.028 * Hh, nostril + 0.006 * Hh, v.y) * G2((Math.abs(v.s) - 0.86) / 0.12, 0);
      const k = 1 - 0.25 * crease;
      return [k, k * (1 - 0.13 * tip * P.rosy), k * (1 - 0.12 * tip * P.rosy)];
    },
  });
  if (tex) faceUV(P, geo);
  sb.use('skin').add(geo, d.skin);
}

// An eyeball: sclera, iris and pupil in vertex colours. At lod 0 (the cast) a sphere with its rings
// crowded round the iris (a crisp limbal ring), a lighter collarette round the pupil, radial
// fibres, dark irises lifted so they still read as brown under the glossy coat, the upper lid's
// shadow painted on it, warm reddish corners and the caruncle (pink, at the inner corner: side is +1
// for the left eye, whose inner corner is towards -X). At lod 1-2 (matte, small) the sclera is
// dimmer and the upper lid and lash line are painted on.
const EYES = {};
const IRIS_A = 0.5, PUPIL_A = 0.165;     // the iris' and pupil's angular radii (iris ~0.48 of the eyeball)
function eyeGeo(r, iris, lod, lidC = null, top = 0.43, side = 1) {
  const key = r.toFixed(4) + '_' + iris + '_' + lod + '_' + top.toFixed(2) + (lod ? '_' + lidC : '_' + side);
  if (EYES[key]) return EYES[key];
  let g;
  if (lod === 0) {
    // rings by polar angle from the front (dense across the pupil edge, the iris and the limbus)
    const A = [0, 0.08, 0.14, 0.165, 0.2, 0.26, 0.33, 0.4, 0.45, 0.48, 0.5, 0.52, 0.56, 0.64, 0.78, 0.95, 1.12, 1.3, 1.5, 1.8, 2.3, PI];
    const N = 32, pos = [], idx = [];
    for (const a of A) for (let j = 0; j <= N; j++) { const ph = (j / N) * TAU; pos.push(r * Math.sin(a) * Math.cos(ph), r * Math.sin(a) * Math.sin(ph), r * Math.cos(a)); }
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
  } else {
    g = new THREE.SphereGeometry(r, [18, 12, 8][lod], [14, 10, 6][lod]);
    g.rotateX(PI / 2);
    g.deleteAttribute('uv');
  }
  const n = g.attributes.normal, c = new Float32Array(n.count * 3);
  let ir = lin(iris);
  const mx = Math.max(ir[0], ir[1], ir[2]);
  if (lod === 0 && mx < 0.11) ir = scl(ir, 0.11 / Math.max(mx, 1e-3));
  const scl_ = scl(lin(0xc8c0b2), lod ? 0.85 : 1), pu = [0.006, 0.005, 0.005], ring = scl(ir, 0.28), lid = lod ? lin(lidC) : null;
  const seed = (iris % 97) * 0.37;
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), z = n.getZ(i), a = Math.acos(clamp(z, -1, 1)), el = Math.asin(clamp(ny, -1, 1));
    const ph = Math.atan2(ny, nx);
    let cc = mixc(scl_, scl(scl_, 0.74), sstep(0.6, 1.3, a));                         // the white, greyer round the back
    if (lod === 0) {
      // warm, a little reddish towards the corners; the caruncle at the inner corner
      const horiz = Math.abs(Math.cos(ph)) * sstep(0.75, 1.15, a);
      cc = [cc[0], cc[1] * (1 - 0.1 * horiz), cc[2] * (1 - 0.13 * horiz)];
      const inner = sstep(0.5, 0.9, -side * nx) * sstep(0.95, 1.2, a) * sstep(0.35, 0.05, Math.abs(ny + 0.02));
      cc = mixc(cc, [0.62, 0.26, 0.24], 0.85 * inner);
    }
    if (a < IRIS_A + 0.03) {
      // iris: lighter collarette near the pupil, radial fibres, darker towards the limbal ring
      const f = lod === 0 ? 0.82 + 0.36 * vnoise(ph * 9 + seed, a * 6, 21) + 0.12 * (vnoise(ph * 26 + seed, a * 14, 22) - 0.5) : 1;
      let ic = mixc(scl(ir, 1.35), ir, sstep(0.19, 0.3, a));
      ic = mixc(ic, scl(ir, 0.62), sstep(0.32, 0.46, a));
      cc = mixc(scl(ic, f), cc, sstep(IRIS_A - 0.005, IRIS_A + 0.03, a));
      if (a > IRIS_A - 0.065) cc = mixc(cc, ring, sstep(IRIS_A - 0.065, IRIS_A - 0.02, a) * (1 - sstep(IRIS_A + 0.005, IRIS_A + 0.035, a)));
    }
    if (a < PUPIL_A + 0.012) cc = mixc(pu, cc, sstep(PUPIL_A - 0.01, PUPIL_A + 0.012, a));
    if (lid) { if (el > top - 0.13) cc = lid; else if (el > top - 0.2) cc = [0.03, 0.025, 0.022]; }
    else cc = scl(cc, 1 - 0.55 * sstep(top - 0.34, top + 0.01, el) - 0.18 * sstep(-0.3, -0.55, el));   // the lids' shadow
    c.set(cc, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return (EYES[key] = g);
}
// Eyelids: shells over the eyeball whose edges arch from corner to corner (seen from the front the
// upper lid is highest a little inside the middle), a lid margin with thickness, and a dark lash
// line on the upper margin (thicker for women). Unit eyeball radius, eye looking along +Z; `side`
// puts the outer corner at +X (left eye) or -X. top / bot: the edge elevations (radians) in the
// middle of the eye.
function lidGeo(lod, upper, side, top, bot, fem = false) {
  const key = 'lid' + (upper ? 'u' : 'l') + lod + side + top.toFixed(3) + bot.toFixed(3) + (fem ? 'f' : '');
  if (GEO[key]) return GEO[key];
  const nP = lod ? 11 : 21, PH = 1.75;                                     // azimuth -100..100 deg
  const rows = upper ? [[0, 1.0, 0.18], [0, 1.09, 0.85], [0.06, 1.1, 1], [0.22, 1.1, 1], [0.45, 1.1, 1], [0.75, 1.08, 1], [1, 1.06, 1]]
    : [[0, 1.0, 0.75], [0, 1.07, 0.9], [0.12, 1.07, 1], [0.4, 1.06, 1], [0.75, 1.05, 1], [1, 1.04, 1]];
  const pos = [], col = [], idx = [];
  for (let r = 0; r < rows.length; r++) {
    const [f, rad, shade] = rows[r];
    for (let j = 0; j < nP; j++) {
      const ph = lerp(-PH, PH, j / (nP - 1)), out = ph * side;              // > 0 towards the outer corner
      const c = Math.cos(clamp(ph / 1.22, -1, 1) * PI / 2);
      const corner = out > 0 ? 0.06 : -0.06;                                // the outer corner a little higher
      const edge = upper ? lerp(corner, top, Math.pow(c, 0.7)) + 0.03 * c * Math.sin(-out) : lerp(corner, bot, Math.pow(c, 0.9));
      const far = upper ? 1.35 : -1.35;
      const e = lerp(edge, far, f), ce = Math.cos(e);
      pos.push(Math.sin(ph) * ce * rad, Math.sin(e) * rad, Math.cos(ph) * ce * rad);
      // (men's lashes make a dark line too, a little lighter and thinner than women's)
      const lash = upper ? (r === 0 ? (fem ? 0.1 : 0.14) : r === 1 ? (fem ? 0.22 : 0.3) : r === 2 ? (fem ? 0.7 : 0.8) : 1) : r === 0 ? (fem ? 0.6 : 0.7) : 1;
      const crease = upper ? 1 - 0.14 * G2((f - 0.42) / 0.12, 0) : 1;
      // the lower lid's wet line (its margin, rows 0-1): pinkish
      const wet = !upper && r <= 1 ? 1 : 0;
      col.push(shade * lash * crease * (1 + 0.08 * wet), shade * lash * crease * (0.97 - 0.2 * wet), shade * lash * crease * (0.97 - 0.18 * wet));
    }
  }
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < nP - 1; j++) {
    const a = r * nP + j, b = a + 1, c = a + nP, d = c + 1;
    if (upper) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return (GEO[key] = g);
}

// A lofted ear: an outline from the lobe up to the top of the helix, a plate standing out from the
// head towards the back, with real relief on its outer face (head units): the helix rolled outwards
// round the back and top edge, the scapha (groove) inside it, the antihelix ridge, the deep bowl of
// the concha (the whole plate curves with it), the tragus at the front, a thick lobe. Vertex colour
// is ambient occlusion: dark in the concha and the groove and on the side facing the head, so the
// ear neither glows nor reads as cardboard.
function earMesh(P, lod, side, colr) {
  const He = 0.27 * (1 + P.old * 0.1) * P.ear, k = P.Hh, h0 = P.nb - 0.008;
  // [height in the ear (0 lobe .. 1 top), back edge z, front edge z, thickness] in head units
  const O = [[0, -0.045, -0.018, 0.011], [0.05, -0.068, 0.0, 0.015], [0.15, -0.086, 0.012, 0.016], [0.28, -0.098, 0.02, 0.017], [0.42, -0.112, 0.022, 0.018],
    [0.58, -0.124, 0.017, 0.018], [0.72, -0.128, 0.006, 0.017], [0.84, -0.122, -0.01, 0.016], [0.93, -0.106, -0.032, 0.014], [0.985, -0.088, -0.056, 0.01]];
  const ek = P.ear;
  const keys = O.map(([y, zb, zf, th]) => ({ y: y * He * k, rx: th * k, rzF: (zf - zb) / 2 * k * ek, rzB: (zf - zb) / 2 * k * ek, cz: (zf + zb) / 2 * k * ek, p: 2.4 }));
  // (rangeYs drops rings closer than 3.5 mm, so lod 0 samples its own 23 rings)
  const yTop = keys[keys.length - 1].y;
  const rings = lod === 0 ? sampleRings(keys, Array.from({ length: 23 }, (_, i) => (yTop * i) / 22)) : keys;
  const relief = (yy, u) => {
    // outward offsets of the outer face: [helix, scapha, antihelix, concha, tragus]
    const rim = Math.min(1, sstep(-0.5, -0.9, u) * sstep(0.08, 0.2, yy) + sstep(0.8, 0.95, yy));
    const sc = G2((u + 0.48 - 0.25 * sstep(0.75, 0.95, yy)) / 0.13, 0) * sstep(0.25, 0.4, yy) * (1 - sstep(0.88, 0.97, yy));
    const ah = G2((u + 0.2 - 0.35 * sstep(0.55, 0.85, yy)) / 0.11, 0) * sstep(0.28, 0.42, yy) * sstep(0.88, 0.74, yy);
    const co = G2((yy - 0.37) / 0.15, (u - 0.22) / 0.32);
    const tr = G2((yy - 0.36) / 0.07, (u - 0.85) / 0.12);
    return [rim, sc, ah, co, tr];
  };
  const geo = loft(rings, {
    n: [24, 10, 8][lod], capBot: 0.004 * k, capTop: 0.003 * k,
    mod: (v, rr) => {
      const yy = v.y / (He * k);
      const u = clamp((v.z - rr.cz) / (rr.rzF + 1e-4), -1, 1);           // -1 back edge .. 1 front edge
      // follow the side of the head, the back of the ear stands out
      // the ear stands out from the head towards its back edge (the helix ~1.2 cm off the skull)
      v.x += (P.W(h0 + yy * He) - P.W(h0 + He * 0.5)) * k + (0.034 * sstep(0.65, -1, u) + 0.007) * k;
      const [rim, sc, ah, co, tr] = relief(yy, u);
      // relief on the outer face; the concha's bowl also bends the plate a little
      v.x -= 0.004 * k * co;
      if (v.s > 0) v.x += k * (0.016 * rim - 0.01 * sc + 0.008 * ah - 0.014 * co * (1 - ah) + 0.008 * tr + 0.004 * (1 - sstep(0.05, 0.18, yy)));
      else v.x -= k * 0.003 * rim;
    },
    color: (v, rr) => {
      const yy = v.y / (He * k), u = clamp((v.z - rr.cz) / (rr.rzF + 1e-4), -1, 1);
      const [rim, sc, ah, co] = relief(yy, u);
      // occlusion: the concha, the groove, the face towards the head (darker near the root)
      let kk = v.s > 0 ? 1 - 0.42 * co * (1 - ah) - 0.22 * sc + 0.04 * rim : 0.72 - 0.12 * sstep(-0.2, 0.6, u);
      kk *= 1 - 0.12 * sstep(0.2, 0.9, u);
      // thin parts (the helix, the lobe) a little redder
      // and the cold reddens the whole ear, most of all the rim and the lobe
      const red = 0.06 * rim + 0.05 * (1 - sstep(0.05, 0.2, yy)) + 0.035 * P.cold * (0.6 + rim + (1 - sstep(0.05, 0.25, yy)));
      return [kk, kk * (0.9 - 0.04 * P.rosy - red), kk * (0.88 - 0.04 * P.rosy - red * 0.9)];
    },
  });
  // mirror the right ear, tilt the top back, place it beside the ear canal
  const mp = [0, 0, 0];
  toModel(P, side * (P.W(h0 + He * 0.5) - 0.012), h0, 0.0, mp);
  const M = mat(mp[0], mp[1], mp[2], -0.24, 0, 0, side, 1, 1);
  if (side < 0) {
    // a mirrored part: flip the winding so the faces stay outward
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  geo.applyMatrix4(M);
  geo.computeVertexNormals();
  return geo;
}

// The centre of eye `side` (+1 left, -1 right) in model space.
function eyeCentre(P, side, out) {
  const ex = side * P.ex;
  const zs = faceZ(P, ex, P.eh) - headDelta(P, ex, P.eh, 0.36);
  return toModel(P, ex, P.eh, zs - 0.0105 - P.re, out);
}
// The upper lid's edge (radians above the eye's centre): just over the top of the iris, lower when
// frowning, sleepy or old; the lower lid just under the iris.
// The upper lid covers the top ~1.5 mm of the iris (more frowning or old): no sclera above the iris.
const lidTop = (P, d) => Math.max(0.2, 0.36 - (d.frown || 0) * 0.055 - (d.sleepy || 0) - P.old * 0.1 + P.kid * 0.09 + (P.fem ? 0.035 : 0) * (1 - P.kid));
const lidBot = (P) => -0.475 + P.old * 0.04 - (P.fem ? 0.015 : 0);

function buildHead(sb, d, D, bi, lod, P, tex) {
  sb.use('skin').add(headMesh(P, d, bi, lod), d.skin);
  noseMesh(sb, P, d, bi, lod, tex);
  const Hh = P.Hh, mp = [0, 0, 0];
  const earC = new THREE.Color(d.skin).multiply(_col.setRGB(0.95, 0.85, 0.82));
  for (const side of [-1, 1]) sb.use('skin').add(earMesh(P, lod, side, earC), earC, null, bi.head);
  // eyes in their sockets (glossy: 'lamp' for the cast, skin with painted lids for the cheaper levels),
  // with lids; at lod 0 the upper lids are on their own bones (blinking)
  const re = P.re, iris = d.eyes ?? 0x4a3424;
  const lidCol = new THREE.Color(d.skin).multiplyScalar(0.93);
  const top = lidTop(P, d), bot = lidBot(P);
  for (const side of [-1, 1]) {
    eyeCentre(P, side, mp);
    sb.use(lod === 0 ? 'lamp' : 'skin').add(eyeGeo(re * Hh, iris, lod, lidCol.getHex(), top, side), 0xffffff, mat(mp[0], mp[1], mp[2], 0, side * 0.08, 0), bi.head);
    sb.use('skin');
    const lb = side < 0 ? bi.lidR : bi.lidL;
    sb.add(lidGeo(lod, true, side, top, bot, P.femK > 0.5), lidCol, mat(mp[0], mp[1], mp[2], 0, side * 0.08, 0, re * Hh, re * Hh, re * Hh), lb ?? bi.head);
    sb.add(lidGeo(lod, false, side, top, bot, P.femK > 0.5), lidCol, mat(mp[0], mp[1], mp[2], 0, side * 0.08, 0, re * Hh, re * Hh, re * Hh), bi.head);
  }
  // brows: at lod 0 painted in the face texture (single hairs); cheaper levels get thin strips of hair
  // following the brow ridge
  const browC = d.brows ?? darker(d.hair?.color ?? 0x3a2a1e, 0.85);
  if (!tex) for (const side of [-1, 1]) {
    const t0 = side * P.browT0, t1 = side * P.browT1;
    const k = 0.72;
    sb.use('hair').add(shellMesh(P, {
      n: lod ? 6 : 14, K: lod ? 2 : 3, periodic: false, th0: Math.min(t0, t1), th1: Math.max(t0, t1),
      hLo: (th) => { const [m, hh] = browAt(P, th); return m - hh * k; }, hHi: (th) => { const [m, hh] = browAt(P, th); return m + hh * k; },
      thick: (th) => 0.008 * P.browThick * (1 - 0.45 * browAt(P, th)[2]), edgeHi: 'feather', edgeLo: 'feather',
      color: (th, h, t) => scl([1, 1, 1], 0.85 + 0.3 * vnoise(th * 40, h * 80, 3)),
    }), new THREE.Color().setRGB(...mixc(lin(browC), P.skin, 0.4)).getHex(), null, bi.head);
  }
  return P;
}
function darker(hex, k) { _col.set(hex).multiplyScalar(k); return _col.getHex(); }

// Offset shells over the head: hair, beards, hats. o: { n, K, periodic | th0, th1, hLo(th), hHi(th),
// thick(th, h, t) [head heights], edgeLo: 'feather' | 'roll', edgeHi: 'feather' | 'pole', w, post(p, th, h),
// ao (a band in head heights above the lower edge, and the sides, darkened: hair's edges are in its
// own shadow), inner (non-periodic shells: a second, dark layer this far inside, joined to the outer
// one along the lower edge and the sides, so a hanging curtain has a back and a thickness) }.
function shellMesh(P, o) {
  const per = o.periodic !== false;
  const n = o.n, K = o.K;
  const ths = per ? faceThetas(n) : Array.from({ length: n + 1 }, (_, j) => lerp(o.th0, o.th1, j / n));
  const J = ths.length;
  const rows = [];
  if (o.edgeLo === 'roll') rows.push({ t: 0, tuck: true });
  for (let k = 0; k <= K; k++) rows.push({ t: k / K });
  const pole = o.edgeHi === 'pole';
  const R = rows.length, NV = R * J + (pole ? 1 : 0);
  const inner = o.inner && !per ? o.inner : 0;
  const nv = NV * (inner ? 2 : 1);
  const pos = new Float32Array(nv * 3), col = o.color ? new Float32Array(nv * 3) : null;
  const pt = [0, 0, 0], nn = [0, 0, 0], mp = [0, 0, 0], hs = new Float32Array(R * J);
  let k = 0;
  for (const row of rows) for (let j = 0; j < J; j++, k++) {
    const th = ths[j];
    const hl = o.hLo(th), hh = Math.min(o.hHi(th), 0.985);
    const h = row.tuck ? Math.min(hh, hl + 0.03) : lerp(hl, hh, row.t);
    hs[k] = h;
    headPt(P, th, h, pt); headN(P, th, h, nn);
    let T = o.thick(th, h, row.t);
    let fe = 1;
    if (o.edgeLo !== 'roll') fe *= o.rampH ? sstep(0, o.rampH, h - hl) : sstep(0, 0.16, row.t);
    if (!pole) fe *= sstep(1, 0.84, row.t);
    const u = per ? 0.5 : j / (J - 1);
    if (!per) { const e = o.sideW ?? 0.12; fe *= lerp(o.sideMin ?? 0, 1, sstep(0, e, u) * sstep(1, 1 - e, u)); }
    if (row.tuck) T *= 0.2;
    const off = (o.base ?? 0.004) + T * fe;
    pt[0] += nn[0] * off; pt[1] += nn[1] * off; pt[2] += nn[2] * off;
    if (o.post) o.post(pt, th, h);
    toModel(P, pt[0], pt[1], pt[2], mp);
    pos.set(mp, k * 3);
    if (col) {
      const c = o.color(th, h, row.t);
      let a = 1;
      if (o.ao) a = lerp(0.55, 1, Math.min(row.tuck ? 0 : sstep(0, o.ao, h - hl), per ? 1 : sstep(0, 0.08, Math.min(u, 1 - u))));
      col[k * 3] = c[0] * a; col[k * 3 + 1] = c[1] * a; col[k * 3 + 2] = c[2] * a;
    }
    if (inner) {
      const d = Math.min(inner, Math.max(0.002, off - 0.003));
      toModel(P, pt[0] - nn[0] * d, pt[1] - nn[1] * d, pt[2] - nn[2] * d, mp);
      pos.set(mp, (NV + k) * 3);
      if (col) { col[(NV + k) * 3] = col[k * 3] * 0.4; col[(NV + k) * 3 + 1] = col[k * 3 + 1] * 0.4; col[(NV + k) * 3 + 2] = col[k * 3 + 2] * 0.4; }
    }
  }
  let tp = -1;
  if (pole) {
    const hz = (P.F(0.985) + P.B(0.985)) / 2;
    pt[0] = 0; pt[1] = 1 + o.thick(0, 1, 1) + 0.004; pt[2] = hz;
    if (o.post) o.post(pt, 0, 1);
    toModel(P, pt[0], pt[1], pt[2], mp);
    pos.set(mp, k * 3);
    if (col) col.set(o.color(0, 1, 1), k * 3);
    tp = k++;
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < (per ? J : J - 1); j++) {
    const a = r * J + j, b = r * J + ((j + 1) % J), c = (r + 1) * J + j, e = (r + 1) * J + ((j + 1) % J);
    idx.push(a, b, c, b, e, c);
    if (inner) idx.push(NV + a, NV + c, NV + b, NV + b, NV + c, NV + e);
  }
  if (pole) for (let j = 0; j < J; j++) idx.push((R - 1) * J + j, (R - 1) * J + ((j + 1) % J), tp);
  if (inner) {
    // the lower edge and the two sides join the layers
    for (let j = 0; j < J - 1; j++) { const a = j, b = j + 1; idx.push(a, NV + a, b, b, NV + a, NV + b); }
    for (let r = 0; r < R - 1; r++) {
      const a = r * J, c = (r + 1) * J; idx.push(a, c, NV + a, c, NV + c, NV + a);
      const b = r * J + J - 1, e = (r + 1) * J + J - 1; idx.push(b, NV + b, e, e, NV + b, NV + e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // (the outer layer's grid, for the hair cards: rows from the lower edge up, columns ths)
  geo.userData.grid = { R, J, per, ths, hs, tuck: o.edgeLo === 'roll' };
  return geo;
}

const HAIRLINE = spline([[0, 0.745], [0.5, 0.735], [0.85, 0.705], [1.1, 0.64], [1.25, 0.56], [1.36, 0.47], [1.43, 0.47], [1.5, 0.565], [1.7, 0.58], [1.9, 0.55], [2.1, 0.44], [2.45, 0.3], [2.8, 0.2], [PI, 0.175]]);
const HAIRLINE_F = spline([[0, 0.75], [0.5, 0.74], [0.85, 0.715], [1.1, 0.67], [1.3, 0.615], [1.45, 0.585], [1.6, 0.58], [1.9, 0.55], [2.1, 0.44], [2.45, 0.3], [2.8, 0.2], [PI, 0.175]]);
const hairline = (th, rec = 0, fem = false) => { const a = wrapAbs(th); return (fem ? HAIRLINE_F(a) : HAIRLINE(a)) + rec * 0.08 * (1 - sstep(0.5, 1.1, a)); };
// long hair is tucked behind the ears: its edge runs over them
const earBand = (th) => { const a = wrapAbs(th); return 0.5 * sstep(1.32, 1.48, a) * sstep(2.42, 2.22, a); };
const hairlineFor = (P, th) => (P.longHair ? Math.max(hairline(th, P.rec, P.fem), earBand(th)) : hairline(th, P.rec, P.fem));
const HATS = {
  beanie: spline([[0, 0.6], [0.8, 0.585], [1.3, 0.49], [1.65, 0.465], [2.1, 0.42], [2.7, 0.36], [PI, 0.34]]),
  flatcap: spline([[0, 0.665], [1.2, 0.625], [1.8, 0.6], [PI, 0.56]]),
  cap: spline([[0, 0.655], [1.2, 0.61], [1.8, 0.585], [PI, 0.55]]),
};
HATS.pom = HATS.beanie;
const hatLo = (type, th) => (HATS[type] || HATS.beanie)(wrapAbs(th));

// A swept tube: rings perpendicular to a smooth path through pts ([x, y, z] model space), each an
// ellipse rx (across, along `side`) x rz (along `out`); outs[i] says which way is 'out' at pts[i].
// o: { n, steps, rx(t), rz(t), weights(t) -> [[bone, w]...], color(t, a) -> rgb, capBot, capTop, mod(p, t, a) }.
const _sT = new THREE.Vector3(), _sB = new THREE.Vector3(), _sN = new THREE.Vector3(), _sO = new THREE.Vector3();
function sweep(pts, outs, o) {
  const n = o.n || 8, S = o.steps || 16;
  const cr = (arr, t, out) => {
    const L = arr.length - 1, f = clamp(t, 0, 1) * L, i = Math.min(L - 1, Math.floor(f)), u = f - i;
    const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(L, i + 2)];
    for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
    return out;
  };
  const nv = (S + 1) * n + 2, pos = new Float32Array(nv * 3), col = o.color ? new Float32Array(nv * 3) : null, si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const c = [0, 0, 0], c2 = [0, 0, 0], ou = [0, 0, 0], p = [0, 0, 0];
  const setW = (k, w) => { let tot = 0; for (const [, x] of w) tot += x; w.slice(0, 4).forEach(([bn, x], q) => { si[k * 4 + q] = bn; sw[k * 4 + q] = x / (tot || 1); }); };
  let k = 0;
  const ends = [[0, 0, 0], [0, 0, 0]];
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    cr(pts, t, c); cr(pts, Math.min(1, t + 0.01), c2); cr(outs, t, ou);
    _sT.set(c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]);
    if (s === S) { cr(pts, t - 0.01, c2); _sT.set(c[0] - c2[0], c[1] - c2[1], c[2] - c2[2]); }
    _sT.normalize();
    _sO.set(ou[0], ou[1], ou[2]);
    _sB.crossVectors(_sT, _sO).normalize(); _sN.crossVectors(_sB, _sT).normalize();
    const rx = o.rx(t), rz = o.rz(t), w = o.weights(t);
    for (let j = 0; j < n; j++, k++) {
      const a = (j / n) * TAU, sa = Math.sin(a), ca = Math.cos(a);
      p[0] = c[0] + _sB.x * rx * sa + _sN.x * rz * ca; p[1] = c[1] + _sB.y * rx * sa + _sN.y * rz * ca; p[2] = c[2] + _sB.z * rx * sa + _sN.z * rz * ca;
      if (o.mod) o.mod(p, t, a, _sN, _sB);
      pos.set(p, k * 3);
      if (col) col.set(o.color(t, a), k * 3);
      setW(k, w);
    }
    if (s === 0) ends[0] = [...c]; if (s === S) ends[1] = [...c];
  }
  const idx = [];
  for (let s = 0; s < S; s++) for (let j = 0; j < n; j++) {
    const a = s * n + j, b = s * n + ((j + 1) % n), cc = (s + 1) * n + j, d = (s + 1) * n + ((j + 1) % n);
    idx.push(a, b, cc, b, d, cc);
  }
  // caps (a point at each end, pushed out along the path)
  for (const [e, ring, dir] of [[0, 0, -1], [1, S, 1]]) {
    const q = k++, ce = ends[e];
    cr(pts, e ? 1 - 0.01 : 0.01, c2);
    const L = Math.hypot(ce[0] - c2[0], ce[1] - c2[1], ce[2] - c2[2]) || 1, cap = (e ? o.capTop : o.capBot) ?? 0;
    for (let m = 0; m < 3; m++) pos[q * 3 + m] = ce[m] + ((ce[m] - c2[m]) / L) * cap;
    if (col) col.set(col.subarray(ring * n * 3, ring * n * 3 + 3), q * 3);
    for (let m = 0; m < 4; m++) { si[q * 4 + m] = si[ring * n * 4 + m]; sw[q * 4 + m] = sw[ring * n * 4 + m]; }
    for (let j = 0; j < n; j++) { const a = ring * n + j, b = ring * n + ((j + 1) % n); if (dir < 0) idx.push(a, q, b); else idx.push(a, b, q); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildHair(sb, P, D, d, bi, lod, tex) {
  const hs = d.hair || {};
  const style = hs.style || 'short';
  const col = hs.color ?? 0x3a2a1e;
  const n = [56, 24, 14][lod], K = [14, 7, 4][lod];
  const rec = P.rec;
  const hat = d.hat?.type;
  // under a hat the hair is pressed flat
  const under = (th, h, T) => (hat && h > hatLo(hat, th) - 0.035 ? Math.min(T, 0.01) : T);
  const seed = hash1((d.name || 'x').length * 3.1 + (hs.color || 0) * 1e-6) * 50;
  // strands: streaks along the hair's flow (the meridians), darker at the roots
  const vcol = (th, h, t) => { const v = 0.9 + 0.16 * vnoise(th * 4, h * 12, 5) + 0.26 * (vnoise(th * 34 + seed, h * 3.2, 8) - 0.5) + 0.12 * (vnoise(th * 80 + seed, h * 6, 9) - 0.5); return scl([1, 1, 1], v * lerp(0.78, 1, sstep(0, 0.4, t))); };
  const wHead = bi.head;
  const lump = (th, h) => (vnoise(th * 3.2 + seed, h * 10, 3) - 0.5) * 0.022 + (vnoise(th * 9 + seed, h * 26, 6) - 0.5) * 0.01;
  // the shell's lower edge is wavy, not jagged; at lod 0 it starts a little above the hairline, so
  // the single hairs painted on the scalp (face texture) make the soft edge
  const ragged = (th) => (vnoise(th * 7 + seed, 1, 2) - 0.5) * (tex ? 0.012 : 0.018) + (tex ? 0 : (vnoise(th * 17 + seed, 2, 3) - 0.5) * 0.008);
  const lift = tex ? 0.016 : 0;
  // lod 0: locks of hair as shallow ridges along the flow (the meridians) on the sides and back, so a
  // cap's surface and silhouette are not a smooth helmet
  const rk = lod === 0 ? ({ short: 0.8, side: 0.8, slick: 0.45, bob: 1, long: 1, pony: 0.7, bun: 0.7, balding: 0.5 }[style] ?? 0) : 0;
  const ridge = (th, h) => rk * 0.0055 * (Math.abs(Math.sin(th * 21 + 2.5 * vnoise(th * 4 + seed, h * 6, 11))) - 0.62) * sstep(0.5, 0.72, h) * (1 - sstep(0.9, 0.97, h));
  // p4r2, lod 0: strand cards along the shells' outlines (shellCards): edge cards past the lower
  // edges (nape, over the ears, fringes, the curtains' ends, a beard's lower edge) and fins standing
  // up along the flow on the upper shell, so the silhouette breaks into hair instead of a helmet's rim
  const cards = !!(tex && D.cards), cw = [[wHead, 1]];
  const noHat = (th, h) => !hat || h < hatLo(hat, th) - 0.05;
  const noShades = (th, h) => !d.sunglassesOnHead || !(wrapAbs(th) < 1.0 && h > 0.76);
  const front = (th) => wrapAbs(th) < 1.5;   // (the temples and sideburns: in front of the ears)
  const CAPC = {
    short: { edge: { over: 0.012, keep: (th, h) => !front(th) && noHat(th, h) }, fins: { h: 0.009, len: 0.022, lean: 0.9 } },
    side: { edge: { over: 0.011, keep: (th, h) => !front(th) && noHat(th, h) }, fins: { h: 0.008, len: 0.024, lean: 1.0 } },
    slick: { edge: { over: 0.009, keep: (th, h) => !front(th) && noHat(th, h) }, fins: { h: 0.005, len: 0.026, lean: 1.7 } },
    messy: { edge: { over: 0.02, curl: 0.002, keep: noHat }, fins: { h: 0.016, len: 0.026, lean: 0.45, from: 0.2 } },
    curly: { edge: { over: 0.016, keep: noHat }, fins: { h: 0.014, len: 0.02, lean: 0.3, from: 0.2 } },
    long: { fins: { h: 0.006, len: 0.03, lean: 1.3, from: 0.4 } },
    bob: { fins: { h: 0.006, len: 0.03, lean: 1.3, from: 0.4 } },
    pony: { fins: { h: 0.004, len: 0.03, lean: 1.6, from: 0.4 } },
    bun: { fins: { h: 0.004, len: 0.03, lean: 1.6, from: 0.4 } },
  }[style];
  const shellC = (g, c, extra) => {
    if (!cards || !c) return;
    const fins = c.fins && { ...c.fins, keep: (th, h) => noHat(th, h) && noShades(th, h) && (!c.fins.keep || c.fins.keep(th, h)) };
    shellCards(D, g, { col, wts: cw, seed: seed + 3, ...c, fins, ...extra });
  };
  const cap = (thick, extra = {}) => {
    const g = shellMesh(P, { n, K, rampH: 0.07, hLo: (th) => hairlineFor(P, th) + ragged(th) + lift, hHi: () => 1, edgeHi: 'pole', thick: (th, h, t) => under(th, h, Math.max(0.003, thick(th, h, t) + lump(th, h) * Math.min(1, thick(th, h, t) * 25) + ridge(th, h))), color: (th, h, t) => scl(vcol(th, h, t), 1 + 6 * ridge(th, h)), ...extra });
    sb.use('hair').add(g, col, null, wHead);
    shellC(g, CAPC);
  };
  // hair falling from the widest part of the skull, held off the cheeks; ends at lo(th)
  const curtain = (lo, T, o = {}) => {
    const wMax = P.W(0.62) + (hat ? 0.018 : o.off ?? 0.04), bMax = P.B(0.6) - (hat ? 0.018 : o.off ?? 0.04);
    const fall = (p, th, h) => {
      const k = sstep(0.62, 0.42, h), s = Math.abs(Math.sin(th)), c = Math.cos(th);
      const tx = wMax * Math.pow(s, 0.6);
      if (Math.abs(p[0]) < tx) p[0] = Math.sign(p[0] || 1) * lerp(Math.abs(p[0]), tx, k * 0.92);
      if (c < 0) { const tz = bMax * Math.pow(-c, 0.6); if (p[2] > tz) p[2] = lerp(p[2], tz, k * 0.92); }
      if (o.turn) { const tu = sstep(lo(th) + 0.07, lo(th), h) * o.turn; p[0] *= 1 - 0.05 * tu; p[2] = p[2] * (1 - 0.05 * tu); }
    };
    const g = shellMesh(P, {
      n, K: Math.max(4, K - 1), periodic: false, th0: hat ? Math.max(1.3, o.th0 ?? 0.82) : o.th0 ?? 0.82, th1: TAU - (hat ? Math.max(1.3, o.th0 ?? 0.82) : o.th0 ?? 0.82), hLo: lo, hHi: () => 0.72,
      thick: (th, h, t) => under(th, h, T(th, h, t)), edgeLo: o.edge ?? 'roll', edgeHi: 'feather', post: fall, color: vcol, sideMin: o.sideMin ?? 0.35, sideW: 0.08,
      ao: 0.06, inner: lod < 2 ? 0.01 : 0,
    });
    sb.use('hair').add(g, col, null, wHead);
    // the ends: strands hanging past the curtain's edge (a bob's turned under)
    shellC(g, { edge: { over: o.turn ? 0.02 : 0.03, rows: 2, curl: o.turn ? 0.008 : 0.003, droop: o.turn ? 0 : 0.004, layers: 2, keep: o.endKeep } });
  };
  let beardOk = true;
  switch (style) {
    case 'bald': beardOk = true; break;
    // crew cut: at lod 0 the short sides are painted on the scalp and a 1-3 mm brush sits on top;
    // cheaper levels: a 1-4 mm shell over the tinted scalp
    case 'crew':
      if (tex) cap((th, h) => lerp(0.0015, 0.011, sstep(0.66, 0.84, h)) * (1 - 0.3 * sstep(1.2, 2.6, wrapAbs(th))) + 0.002 * (vnoise(th * 14 + seed, h * 30, 7) - 0.5), { hLo: (th) => hairlineFor(P, th) + 0.024 + ragged(th) * 0.5, rampH: 0.06, base: 0.0015, color: (th, h, t) => scl(vcol(th, h, 1), 0.92) });
      else cap((th, h) => lerp(0.004, 0.015, sstep(0.66, 0.86, h)) * (1 - 0.3 * sstep(1.2, 2.6, wrapAbs(th))));
      break;
    case 'buzz': if (!tex) cap(() => 0.004); break;
    case 'short': cap((th, h) => lerp(0.018, 0.062, sstep(0.6, 0.86, h)) + 0.022 * G2(wrapAbs(th) / 0.7, (h - 0.74) / 0.07)); break;
    case 'side': cap((th, h) => lerp(0.026, 0.056, sstep(0.66, 0.86, h)) + 0.024 * sstep(0.7, 0.86, h) * (0.5 - 0.5 * Math.sin(th)) * G2(wrapAbs(th) / 1.2, 0)); break;
    case 'slick': cap((th, h) => lerp(0.022, 0.045, sstep(0.65, 0.85, h))); break;
    // messy: tufts that stick up and out, a ragged fringe
    case 'messy': cap((th, h) => lerp(0.022, 0.05, sstep(0.6, 0.86, h)) + 0.05 * Math.pow(vnoise(th * 7 + seed, h * 15, 3), 2.2) * sstep(0.62, 0.8, h) + 0.02 * (vnoise(th * 19 + seed, h * 30, 5) - 0.5) * sstep(0.65, 0.75, h), { hLo: (th) => hairline(th, rec) + lift - 0.04 * G2(wrapAbs(th) / 0.55, 0) + (vnoise(th * 13 + seed, 1, 2) - 0.5) * 0.04 }); break;
    // curly: a mass of springy lumps
    case 'curly': cap((th, h) => 0.052 + 0.055 * Math.pow(vnoise(th * 8 + seed, h * 18, 7), 1.6) + 0.02 * vnoise(th * 20, h * 40, 2)); break;
    case 'balding':
      {
        const g = shellMesh(P, { n, K: Math.max(3, K - 3), periodic: false, th0: 0.95, th1: TAU - 0.95, hLo: (th) => hairline(th) + lift * 0.5, hHi: (th) => lerp(0.58, 0.68, sstep(PI / 2, PI, wrapAbs(th))), thick: (th, h) => under(th, h, 0.014), rampH: 0.05, edgeHi: 'feather', color: vcol });
        sb.use('hair').add(g, col, null, wHead);
        shellC(g, { edge: { over: 0.008, rows: 1, curl: 0.002, keep: (th, h) => !front(th) && noHat(th, h) }, fins: { h: 0.006, len: 0.02, lean: 1.0, from: 0.3, keep: (th) => !front(th) } });
      }
      break;
    case 'bob': {
      // a side parting, a soft side-swept fringe, the hair falling from the widest part of the skull
      // to the jaw (a little longer in front), 1-1.5 cm off the cheeks, the ends turned under
      const part = 0.32;
      cap((th, h) => 0.04 - 0.02 * G2((th - part) / 0.09, 0) * sstep(0.8, 0.92, h) + 0.01 * (vnoise(th * 5 + seed, h * 8, 3) - 0.4));
      const sweepF = (th) => 0.05 * G2((th + 0.45) / 0.45, 0);
      if (!hat) {
        const g = shellMesh(P, { n, K: Math.max(3, K - 3), periodic: false, th0: -1.15, th1: 0.25, hLo: (th) => hairlineFor(P, th) - sweepF(th) + ragged(th) * 0.5, hHi: (th) => hairlineFor(P, th) + 0.07, thick: (th) => 0.014 + 0.16 * sweepF(th), edgeHi: 'feather', rampH: 0.05, color: vcol });
        sb.use('hair').add(g, col, null, wHead);
        shellC(g, { edge: { over: 0.012, rows: 1, curl: 0.002, layers: 2 } });
      }
      // layered ends: the length steps by ~1 cm from lock to lock (choppy, not one straight panel);
      // clumps of strands as ridges down the curtain, so the back is not a smooth helmet
      const lo = (th) => lerp(0.13, 0.2, sstep(1.3, PI, wrapAbs(th))) + 0.045 * (Math.pow(vnoise(th * 9 + seed, 2, 5), 1.5) - 0.3) + 0.012 * (vnoise(th * 31 + seed, 4, 6) - 0.5);
      const clump = (th, h) => 0.007 * (Math.abs(Math.sin(th * 13 + 3 * vnoise(th * 3 + seed, h * 4, 8))) - 0.5) * sstep(0.6, 0.4, h);
      curtain(lo, (th, h, t) => 0.016 + 0.012 * (1 - t) + 0.008 * (Math.pow(vnoise(th * 8 + seed, h * 12, 4), 1.5) - 0.3) + clump(th, h), { turn: 1, off: 0.028, sideMin: 0.3 });
      break;
    }
    case 'long': case 'pony': case 'bun': {
      // close to the skull on top, a parting
      const T0 = style === 'long' ? 0.046 : 0.03;
      const sweepF = style === 'long' && D.fem ? (th) => 0.06 * G2((th - 0.62) / 0.42, 0) : () => 0;
      cap((th, h) => (T0 - 0.02 * G2((wrapAbs(th) - (style === 'long' ? 0.35 : 0)) / 0.12, 0) * sstep(0.78, 0.9, h) + 0.6 * sweepF(th) * (1 - sstep(0.7, 0.85, h))) * (style === 'long' ? 1.2 : lerp(0.6, 1.25, Math.min(1, sstep(0.62, 0.78, h) + sstep(2.0, 2.6, wrapAbs(th))))) + (style === 'long' ? 0.012 * (vnoise(th * 9 + seed, h * 10, 3) - 0.3) : 0));
      if (style === 'long' && D.fem && !hat) {
        // the swept fringe comes lower over the temple (a second, thin shell over the cap's edge)
        const g = shellMesh(P, { n, K: Math.max(3, K - 3), periodic: false, th0: 0.05, th1: 1.25, hLo: (th) => hairlineFor(P, th) - sweepF(th) + ragged(th), hHi: (th) => hairlineFor(P, th) + 0.07, thick: (th, h, t) => 0.016 + 0.16 * sweepF(th), edgeHi: 'feather', rampH: 0.05, color: vcol });
        sb.use('hair').add(g, col, null, wHead);
        shellC(g, { edge: { over: 0.014, rows: 1, curl: 0.002, layers: 2 } });
      }
      if (style === 'long') {
        // long hair falls over the ears down the sides of the face to the jaw, then on down the back
        // (longHair) and, on one side, in a lock over the shoulder in front
        // close to the cheeks, thinner, clumps of strands down it, the ends ragged and the front edge thin
        const lo = (th) => lerp(0.02, 0.1, sstep(1.0, 2.0, wrapAbs(th))) + 0.04 * (Math.pow(vnoise(th * 8 + seed, 3, 5), 1.4) - 0.35) + 0.015 * (vnoise(th * 29 + seed, 5, 7) - 0.5);
        const clump = (th, h) => 0.008 * (Math.abs(Math.sin(th * 11 + 3 * vnoise(th * 3 + seed, h * 3, 8))) - 0.5) * sstep(0.62, 0.45, h);
        // (no strands off the curtain's back: the length goes on down the back there)
        curtain(lo, (th, h, t) => 0.016 + 0.014 * (1 - t) + 0.01 * (Math.pow(vnoise(th * 9 + seed, h * 7, 4), 1.4) - 0.3) + clump(th, h), { th0: 1.1, off: 0.022, edge: 'feather', sideMin: 0.15, endKeep: (th) => wrapAbs(th) < 2.1 });
        longHair(sb, P, D, d, bi, lod, col);
        if (!hat || D.fem) D.pendingLock = () => frontLock(sb, P, D, d, bi, lod, col, seed);
      }
      if (style === 'pony') {
        const low = !!hat, h0 = low ? 0.3 : 0.58;
        const top = [0, 0, 0]; toModel(P, 0, h0, P.B(h0) - 0.02, top);
        const yb = low ? D.shoulderY - 0.02 : D.shoulderY + 0.03;
        const rings = [
          { y: yb, rx: 0.012, rz: 0.012, cz: top[2] - 0.05, w: [[bi.head, 0.4], [bi.chest, 0.6]] },
          { y: lerp(yb, top[1], 0.5), rx: 0.024 * D.k, rz: 0.026 * D.k, cz: top[2] - 0.045, w: [[bi.head, 0.8], [bi.neck, 0.2]] },
          { y: top[1] - 0.01, rx: 0.02 * D.k, rz: 0.02 * D.k, cz: top[2] - 0.015, w: bi.head },
          { y: top[1] + 0.012, rx: 0.016, rz: 0.016, cz: top[2] + 0.005, w: bi.head },
        ];
        sb.use('hair').add(loft(rings, { n: 8, capBot: 0.01, capTop: 0.0 }), col);
      }
      if (style === 'bun') {
        toModel(P, 0, 0.8, P.B(0.8) - 0.03, top3);
        sb.use('hair').sphere(col, wHead, top3[0], top3[1], top3[2], 0.045 * D.k, 0.04 * D.k, 0.04 * D.k, 0, 0, 0, 10, 8);
      }
      break;
    }
    default: cap(() => 0.04);
  }
  if (!beardOk) return;
  // beards: the upper edge along the cheek line, a moustache over the upper lip (not over the
  // vermilion: the lips stay visible), a ragged lower edge under the jaw
  const bd = d.beard;
  if (bd && bd.style !== 'stubble') {
    const bc = bd.color ?? col;
    const mo = bd.style === 'moustache', full = bd.style === 'full';
    const T = full ? 0.055 : 0.026;
    // the mouth: no beard over the lips (a gap round them, a little wider than the mouth)
    const mouth = (th, h) => { const x = Math.sin(th) * P.W(h) * 0.95; return sstep(1.35, 1.05, Math.abs(x) / (0.1 * P.mw)) * sstep(0.045, 0.02, Math.abs(h - P.mh - 0.003 + (h < P.mh ? 0.012 : 0))) * sstep(0.5, 0.9, Math.cos(th)); };
    const top = (th) => { const a = Math.abs(th); return mo ? P.nb - 0.008 : a < 0.42 ? P.nb - 0.012 : lerp(P.nb - 0.04, 0.44, sstep(0.42, 1.45, a)) + (vnoise(th * 9 + seed, 4, 3) - 0.5) * 0.012; };
    const bg = shellMesh(P, {
      n: lod ? n : 64, K: Math.max(3, K - 2), periodic: false, th0: mo ? -0.6 : -1.62, th1: mo ? 0.6 : 1.62,
      hLo: (th) => (mo ? P.mh + 0.022 : 0.0), hHi: top,
      thick: (th, h) => {
        if (mo) return 0.026 * (1 - mouth(th, h));
        const m = mouth(th, h);
        return Math.max(0, T * (1 - m) + 0.01 * (1 - sstep(0.0, 0.07, h)) + 0.008 * (vnoise(th * 14 + seed, h * 20, 6) - 0.5)) - 0.02 * m;
      },
      post: mo ? null : (p, th, h) => { if (h < 0.04) p[1] -= 0.02 * (vnoise(th * 11 + seed, 1, 7)) * sstep(0.04, 0.0, h); },
      edgeHi: 'feather', color: (th, h, t) => scl(vcol(th, h, t), 0.85 + 0.25 * vnoise(th * 30 + seed, h * 40, 2)),
    });
    sb.use('hair').add(bg, bc, null, bi.head);
    // a ragged lower edge: strands past the jaw line
    if (cards && !mo) shellCards(D, bg, { col: bc, wts: [[bi.head, 1]], seed: seed + 9, edge: { over: full ? 0.016 : 0.009, rows: 1, curl: 0.002, w: 2 } });
  }
}
const top3 = [0, 0, 0];

function longHair(sb, P, D, d, bi, lod, col) {
  // the length falls from under the back of the cap: behind the jaw, down the neck, spreading over
  // the upper back in a few loose locks with a ragged end
  const Hh = P.Hh;
  const yTop = P.chinY + 0.5 * Hh, yHead = P.chinY + 0.06 * Hh, yBot = D.shoulderY - 0.19 * D.k;
  const ys = rangeYs(yBot, yTop, [0.025, 0.04, 0.07][lod]);
  const backZ = -(0.56 * D.S + (d.coat?.bulk ?? 0.02)) - 0.006;
  const rings = ys.map((y) => {
    if (y > yHead) {
      const h = (y - P.chinY) / Hh, bb = P.B(h);
      const fall = sstep(0.5, 0.3, h);   // below the ears the hair hangs straight, as wide as the head
      return { y, rx: (lerp(0.62, 0.9, fall) * P.W(Math.max(h, 0.42)) + 0.045) * Hh, cz: P.z0 + bb * lerp(0.78, 0.66, fall) * Hh, rzB: (-bb * 0.25 + 0.05) * Hh, rzF: 0.05 * Hh, pB: 2.1, pF: 2 };
    }
    const t = sstep(yHead, D.shoulderY - 0.04, y);
    return { y, rx: lerp((0.9 * P.W(0.42) + 0.045) * Hh, 0.13 * D.k, t), cz: lerp(P.z0 + P.B(0.06) * 0.66 * Hh, backZ + 0.016, t), rzB: lerp(0.04, 0.014, t) * D.k + 0.004, rzF: lerp(0.03, 0.012, t), pB: 2.4, pF: 2 };
  });
  const w = (v) => { const t = sstep(yHead + 0.02, D.shoulderY - 0.02, v.y); return [[bi.head, 1 - t], [bi.chest, t]]; };
  const seed = hash1((d.name || 'x').length * 7.7) * 40;
  const ln = [22, 14, 9][lod];
  const lg = loft(rings, {
    n: ln, weights: w, capBot: 0.006, capTop: 0.0,
    mod: (v) => {
      // locks: the back surface ripples into strands, the end is ragged
      const lock = Math.sin(v.th * 9 + seed) * 0.5 + (vnoise(v.th * 6 + seed, v.y * 8, 4) - 0.5);
      const k = 1 + 0.06 * lock * sstep(yHead, yHead - 0.08, v.y);
      v.x *= k;
      if (v.i === 0) v.y += (vnoise(v.th * 5 + seed, 0, 5) - 0.6) * 0.05;
    },
    color: (v) => scl([1, 1, 1], 0.88 + 0.22 * vnoise(v.th * 16 + seed, v.y * 4, 9) + 0.1 * (vnoise(v.th * 40, v.y * 9, 3) - 0.5)),
  });
  sb.use('hair').add(lg, col);
  // (lod 0) the ragged end breaks into strands, and fins along the panel break its outline (the
  // loft's rings are the rows of a shell's grid: the end ring first)
  if (D.cards) {
    lg.userData.grid = { R: rings.length, J: ln, per: true, ths: evenThetas(ln), hs: new Float32Array(rings.length * ln), tuck: false };
    shellCards(D, lg, { col, seed: seed + 5, edge: { over: 0.035, vary: 1.3, rows: 1, curl: 0.002, droop: 0.004, w: 1.5, bright: 1.15 }, fins: { h: 0.006, len: 0.03, lean: 1.5, from: 0.1, every: 2 } });
  }
}

// A lock of long hair falling forward over the right shoulder, in front of the scarf and the coat,
// to the chest: from under the curtain beside the jaw, over the collarbone, flat against the chest.
// At lod 0 four flattened strands that fan out and taper (different lengths), not one tube.
function frontLock(sb, P, D, d, bi, lod, col, seed) {
  const Hh = P.Hh, side = -1, k = D.k;
  const sc = d.scarf ? 0.035 + (d.coat?.bulk ?? 0.02) * 0.4 : 0.012;
  const p0 = [0, 0, 0]; toModel(P, side * (P.W(0.3) + 0.045), 0.3, 0.02, p0);
  const yS = D.shoulderY + 0.05, yC = D.chestY + 0.02 * k;
  const fz = (y) => D.frontZ(Math.min(y, D.shoulderY - 0.02));
  const pts = [
    p0,
    [side * (P.W(0.08) * Hh + 0.04), P.chinY + 0.02 * Hh, P.z0 - 0.0 * Hh],
    [side * (D.neckR + 0.075 + sc * 0.6), yS, D.neckZ + 0.03 + sc * 0.5],
    [side * 0.105 * k, D.shoulderY - 0.05, fz(D.shoulderY - 0.05) + sc * 0.7 + 0.014],
    [side * 0.1 * k, yC, fz(yC) + sc * 0.45 + 0.012],
  ];
  const outs = [[side, 0, 0.3], [side, 0, 0.5], [side * 0.6, 0.3, 0.8], [0, 0.2, 1], [0, 0, 1]];
  const nP = pts.length - 1;
  const w = (t) => { const u = t * nP; const c = sstep(1.6, 2.6, u); return [[bi.head, 1 - c], [bi.neck, c * (1 - sstep(2.6, 3.2, u))], [bi.chest, sstep(2.6, 3.2, u)]]; };
  const NS = lod === 0 ? 4 : 1;
  for (let q = 0; q < NS; q++) {
    const f = NS === 1 ? 0 : q / (NS - 1) - 0.5, len = NS === 1 ? 1 : 1 - 0.1 * Math.abs(f * 2) - 0.12 * hash1(seed + q * 3.7);
    // across the lock: front-back beside the head, along x on the chest; the strands fan out downwards
    const P2 = pts.map((p, i) => {
      const t = i / nP, a = sstep(0.35, 0.7, t), sp = f * (0.016 + 0.034 * t) * k;
      return [p[0] + sp * a, p[1] - sp * 0.2 * (1 - a), p[2] + sp * (1 - a) + 0.002 * Math.sin(q * 2.1 + seed)];
    });
    // cut at this strand's length
    const last = P2[nP], prev = P2[nP - 1], cut = (1 - len) * nP;
    P2[nP] = [lerp(last[0], prev[0], cut), lerp(last[1], prev[1], cut), lerp(last[2], prev[2], cut)];
    const thin = NS === 1 ? 1 : 0.4;
    sb.use('hair').add(sweep(P2, outs, {
      n: [8, 7, 5][lod], steps: [22, 12, 7][lod], capBot: 0.003, capTop: 0.004,
      rx: (t) => lerp(0.03, 0.022, t) * k * thin * (1 - 0.75 * sstep(0.6, 1, t)), rz: (t) => lerp(0.012, 0.008, t) * (NS === 1 ? 1 : 0.6) * (1 - 0.5 * sstep(0.7, 1, t)),
      weights: w,
      mod: (pp, t, a, N, Bv) => { const rip = 0.002 * Math.sin(a * 3 + t * 9 + seed + q); pp[0] += Bv.x * rip; pp[1] += Bv.y * rip; pp[2] += Bv.z * rip; },
      color: (t, a) => scl([1, 1, 1], (0.86 + 0.24 * vnoise(a * 5 + seed + q * 7, t * 6, 9) + 0.12 * (vnoise(a * 14, t * 20 + q, 3) - 0.5)) * (0.75 + 0.25 * Math.cos(a))),
    }), col);
  }
}

function buildHat(sb, P, D, d, bi, lod) {
  const h = d.hat;
  if (!h) return;
  const n = [30, 22, 14][lod], K = [9, 6, 4][lod];
  const type = h.type;
  const col = h.color ?? 0x3a3a40;
  const mp = [0, 0, 0];
  if (type === 'beanie' || type === 'pom') {
    sb.use('fabric').add(shellMesh(P, {
      n, K: K + 2, hLo: (th) => hatLo(type, th), hHi: () => 1, edgeLo: 'roll', edgeHi: 'pole',
      thick: (th, hh, t) => 0.066 + 0.03 * (1 - sstep(0.16, 0.24, t)) + 0.035 * sstep(0.82, 1, hh),
      color: (th, hh, t) => scl([1, 1, 1], (1 - sstep(0.18, 0.22, t)) * 0.06 + 0.94 + 0.04 * Math.sin(th * 40)),
    }), col, null, bi.head);
    if (type === 'pom') {
      toModel(P, 0, 1.17, -0.03, mp);
      sb.use('hair').sphere(h.color2 ?? col, bi.head, mp[0], mp[1], mp[2], 0.2 * P.Hh, 0.18 * P.Hh, 0.2 * P.Hh, 0, 0, 0, 10, 8);
    }
  } else if (type === 'flatcap' || type === 'cap') {
    const flat = type === 'flatcap';
    sb.use('fabric').add(shellMesh(P, {
      n, K, hLo: (th) => hatLo(type, th), hHi: () => 1, edgeLo: 'roll', edgeHi: 'pole',
      thick: (th, hh) => (flat ? 0.045 : 0.04) + (flat ? 0.0 : 0.02 * sstep(0.8, 1, hh)),
      post: flat ? (p, th, hh) => { const c = Math.cos(th); p[1] = Math.min(p[1], 1.018); if (c > 0) { p[2] += 0.07 * c * sstep(0.7, 0.92, hh); p[1] -= 0.02 * c * sstep(0.75, 0.95, hh); } } : null,
    }), col, null, bi.head);
    const ph = hatLo(type, 0) + 0.005;
    const zf = P.F(ph);
    toModel(P, 0, ph, zf + (flat ? 0.1 : 0.18), mp);
    sb.use('fabric').sphere(darker(col, flat ? 0.95 : 0.85), bi.head, mp[0], mp[1], mp[2], 0.27 * P.Hh, 0.022 * P.Hh, (flat ? 0.17 : 0.27) * P.Hh, flat ? 0.22 : 0.14, 0, 0, 14, 6);
  }
}

function buildFaceExtras(sb, P, D, d, bi, lod) {
  const Hh = P.Hh, mp = [0, 0, 0], mq = [0, 0, 0];
  if (d.glasses) {
    sb.use('leather');
    const ring = GEO.glass ??= new THREE.TorusGeometry(1, 0.055, 6, 28);
    const zf = faceZ(P, 0.135, P.eh) + 0.075;
    for (const side of [-1, 1]) {
      toModel(P, side * 0.14, P.eh - 0.005, zf, mp);
      sb.add(ring, d.glasses, mat(mp[0], mp[1], mp[2], 0, side * 0.1, 0, 0.115 * Hh, 0.085 * Hh, 0.115 * Hh), bi.head);
      toModel(P, side * 0.255, P.eh + 0.02, zf - 0.03, mq);
      toModel(P, side * (P.W(P.eh + 0.02) + 0.015), P.eh + 0.02, -0.06, mp);
      sb.tube(d.glasses, bi.head, mq, mp, 0.0014, 0.0014, 4, 0.2);
    }
    toModel(P, 0, P.eh + 0.02, zf + 0.005, mp);
    sb.box(d.glasses, bi.head, mp[0], mp[1], mp[2], 0.045 * Hh, 0.007 * Hh, 0.007 * Hh);
  }
  if (d.sunglassesOnHead) {
    // real sunglasses pushed up onto the hair: two dark, glossy lenses (5.5 x 4.5 cm, 3 mm, so they
    // mirror the sky) in a black acetate frame with a rim round each lens, a bridge, and the temple
    // arms running back over the hair to just above the ears. The frame lies on the hair where the
    // head's surface faces up-forward; its top edge points back.
    const hC = 0.835, pt = [0, 0, 0], nn = [0, 0, 0], off = 0.058;
    headPt(P, 0, hC, pt); headN(P, 0, hC, nn);
    const c = toModel(P, pt[0] + nn[0] * off, pt[1] + nn[1] * off, pt[2] + nn[2] * off, [0, 0, 0]);
    const Zn = new THREE.Vector3(nn[0], nn[1], nn[2]).normalize(), Xa = new THREE.Vector3(1, 0, 0), Yb = new THREE.Vector3().crossVectors(Zn, Xa).normalize();
    const F = new THREE.Matrix4().makeBasis(Xa, Yb, Zn).setPosition(c[0], c[1], c[2]);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(F).toArray();
    const lensGeo = (rx, ry, t) => {
      const g = loft([{ y: -t, rx, rz: ry, p: 3.1 }, { y: t, rx, rz: ry, p: 3.1 }], {
        n: 28, capBot: 0.0, capTop: 0.0,
        // a wayfarer: the lower edge a little narrower, the top edge straighter
        mod: (v) => { if (v.z < 0) v.x *= 1 - 0.1 * (-v.z / ry); else v.z *= 0.92; },
      });
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-PI / 2));
      return g;
    };
    const lensG = GEO.sgLens ??= lensGeo(0.0272, 0.0222, 0.0014), rimG = GEO.sgRim ??= lensGeo(0.0298, 0.0248, 0.0024);
    for (const side of [-1, 1]) {
      const lx = side * 0.0335;
      const Ml = F.clone().multiply(new THREE.Matrix4().makeTranslation(lx, 0, 0.0012)).multiply(new THREE.Matrix4().makeRotationY(side * 0.12));
      const Mr = F.clone().multiply(new THREE.Matrix4().makeTranslation(lx, 0.0006, -0.0004)).multiply(new THREE.Matrix4().makeRotationY(side * 0.12));
      sb.use('lamp').add(lensG, 0x241a14, Ml, bi.head);
      sb.use('lamp').add(rimG, 0x0c0a09, Mr, bi.head);
      // the temple arm: from the hinge at the frame's outer top corner, over the hair, to above the ear
      const hinge = at(side * 0.064, 0.016, -0.004);
      const q1 = [0, 0, 0], n1 = [0, 0, 0], q2 = [0, 0, 0], n2 = [0, 0, 0];
      headPt(P, side * 1.2, 0.76, q1); headN(P, side * 1.2, 0.76, n1); headPt(P, side * 1.72, 0.64, q2); headN(P, side * 1.72, 0.64, n2);
      const m1 = toModel(P, q1[0] + n1[0] * 0.048, q1[1] + n1[1] * 0.048, q1[2] + n1[2] * 0.048, [0, 0, 0]);
      const m2 = toModel(P, q2[0] + n2[0] * 0.036, q2[1] + n2[1] * 0.036, q2[2] + n2[2] * 0.036, [0, 0, 0]);
      sb.use('lamp').add(sweep([hinge, m1, m2], [[side, 0.3, 0], [n1[0], n1[1], n1[2]], [n2[0], n2[1], n2[2]]], {
        n: 6, steps: 10, rx: () => 0.0026, rz: (t) => lerp(0.0028, 0.0018, t), capBot: 0.001, capTop: 0.002, weights: () => [[bi.head, 1]],
      }), 0x0c0a09);
    }
    // the bridge over the nose pads
    sb.use('lamp').tube(0x0c0a09, bi.head, at(-0.0075, 0.012, 0.0), at(0.0075, 0.012, 0.0), 0.0022, 0.0022, 6, 0.3);
  }
}

// ---------------------------------------------------------------------------------------------
// Clothes

const COATS = {
  parka: { bulk: 0.032, len: 0.72, collar: 'hood', zip: true, pockets: true, flare: 0.06 },
  puffer: { bulk: 0.04, len: 0.4, collar: 'stand', zip: true, quilt: 0.1, flare: 0.03 },
  pufferLong: { bulk: 0.04, len: 0.95, collar: 'stand', zip: true, quilt: 0.12, flare: 0.07 },
  wool: { bulk: 0.018, len: 0.85, collar: 'lapel', buttons: true, flare: 0.12 },
  jacket: { bulk: 0.024, len: 0.42, collar: 'stand', zip: true, pockets: true, flare: 0.03 },
  bomber: { bulk: 0.026, len: 0.26, collar: 'knit', zip: true, hemBand: true, cuffBand: true },
  quilted: { bulk: 0.022, len: 0.5, collar: 'knit', buttons: true, quilt: 0.065, pockets: true },
  shirt: { bulk: 0.006, len: 0.05, collar: 'shirt', tucked: true },
  cardigan: { bulk: 0.012, len: 0.4, collar: 'knit', buttons: true },
  snowsuit: { bulk: 0.05, len: 0.5, collar: 'stand', zip: true, suit: true, quilt: 0.0 },
};
const TROUSERS = { jeans: 0.004, slacks: 0.008, joggers: 0.009, snow: 0.045, tights: 0.0 };

function coatHem(c, D) {
  if (c.suit) return D.hipY - 0.06 * D.k;
  const L = c.len;
  const pts = [[0, D.spineY - 0.02], [0.35, D.hipY - 0.03 * D.k], [0.6, D.hipY - 0.12 * D.k], [0.8, D.hipY - 0.22 * D.k], [1, D.kneeY + 0.04 * D.k]];
  return spline(pts)(L);
}

function torsoWeights(D, bi, hemY) {
  return (v) => {
    const y = v.y;
    if (y >= D.shoulderY + 0.045) return [[bi.chest, 0.6], [bi.neck, 0.4]];
    if (y >= D.chestY) return [[bi.chest, 1]];
    if (y >= D.spineY) { const t = sstep(D.spineY, D.chestY, y); return [[bi.spine, 1 - t], [bi.chest, t]]; }
    // the skirt follows the thighs as far as the trouser legs under it do (see legWeights), split
    // between the two thighs at the centre line
    // (on the skirt bones, which turn SKIRT x the thigh's angle standing: the same as weighting the
    // thighs 0.52; seated they follow the thighs nearly fully, so a long coat lies on the lap)
    const wt = (0.4 * sstep(D.hipY + 0.07, D.hipY + 0.02, y) + 0.52 * sstep(D.hipY + 0.02, D.hipY - 0.08, y)) / 0.52;
    const sp = sstep(D.hipY - 0.02, D.spineY, y), wl = sstep(-0.03, 0.03, v.x), ws = Math.min(1, wt);
    if (ws <= 0) return [[bi.pelvis, 1 - sp], [bi.spine, sp]];
    return [[bi.pelvis, (1 - ws) * (1 - sp)], [bi.spine, (1 - ws) * sp], [bi.skirtL, ws * wl], [bi.skirtR, ws * (1 - wl)]];
  };
}

function buildTorso(sb, d, D, bi, lod, m) {
  const c = d.coat, S = D.S, Bd = D.build, b = c.bulk, fem = D.fem;
  const hemY = coatHem(c, D);
  D.hemY = hemY;
  const bust = fem && D.adult ? 0.11 * S : 0;
  const belly = d.belly || 0;
  const flare = c.flare ?? 0.06;
  const keys = [];
  const add = (y, rx, rzF, rzB, p, cz = 0) => keys.push({ y, rx, rzF, rzB, p, cz });
  const hipRx = (fem ? 0.99 : 0.87) * S * Bd;
  if (hemY < D.hipY - 0.075) {
    for (let y = D.hipY - 0.2; y > hemY + 0.06; y -= 0.13) { const dy = D.hipY - y; add(y, hipRx + b + flare * dy * 0.6, 0.52 * S * Bd + b + flare * dy * 0.35, 0.6 * S * Bd + b + flare * dy * 0.4, 2.2); }
    const dy = D.hipY - hemY; add(hemY, hipRx + b + flare * dy * 0.6, 0.52 * S * Bd + b + flare * dy * 0.35, 0.6 * S * Bd + b + flare * dy * 0.4, 2.2);
    keys.reverse();
  }
  add(D.hipY - 0.075, hipRx + b, 0.52 * S * Bd + b + belly * 0.2, 0.6 * S * Bd + b, 2.2);
  add(D.hipY + 0.02, (fem ? 1.0 : 0.88) * S * Bd + b, 0.53 * S * Bd + b + belly * 0.5, 0.6 * S * Bd + b, 2.3);
  add(D.spineY, (fem ? 0.78 : 0.83) * S * Bd + b, 0.55 * S * Bd + b + belly, 0.5 * S * Bd + b, 2.3);
  add(D.chestY + 0.03, 0.92 * S * Math.pow(Bd, 0.7) + b, 0.6 * S * Math.pow(Bd, 0.8) + b + bust + belly * 0.35, 0.55 * S * Math.pow(Bd, 0.7) + b, 2.45);
  add(D.shoulderY - 0.1 * D.k, 0.97 * S * Math.pow(Bd, 0.5) + b, 0.58 * S * Math.pow(Bd, 0.6) + b + bust * 0.4, 0.54 * S * Math.pow(Bd, 0.6) + b, 2.6);
  add(D.shoulderY - 0.03, 1.02 * S + b * 0.9, 0.52 * S + b * 0.9, 0.5 * S + b * 0.9, 2.8);
  add(D.shoulderY + 0.022, 0.62 * S + b * 0.7, 0.4 * S + b * 0.6, 0.42 * S + b * 0.6, 2.3, -0.004);
  add(D.shoulderY + 0.055, D.neckR + 0.014 + b * 0.5, D.neckR + 0.012 + b * 0.5, D.neckR + 0.012 + b * 0.5, 2, D.neckZ);
  const at = ringSplines(keys);
  const topY = D.shoulderY + 0.055;
  const step = [0.022, 0.036, 0.06][lod];
  const extra = [];
  const q = c.quilt || 0;
  if (q) for (let y = hemY + q; y < D.shoulderY - 0.04; y += q) extra.push(y - q * 0.5, y);
  const ys = rangeYs(hemY, topY, step, extra);
  const preg = d.pregnant ? 1 : 0;
  const by = D.hipY + 0.1;
  D.bumpY = by;
  const mod = (v) => {
    if (c.type === 'shirt') { const bl = G2((v.y - D.hipY - 0.1 * D.k) / 0.035, 0); const r0 = Math.hypot(v.x, v.z) || 1; v.x += (v.x / r0) * 0.006 * bl; v.z += (v.z / r0) * 0.006 * bl; }
    if (preg && v.c > 0) {
      // the bump: rounder above, and the coat hangs straight down from it below
      const dy = v.y - by, g = Math.exp(-((dy / (dy < 0 ? 0.21 : 0.12)) ** 2)) * Math.pow(v.c, 1.4);
      v.z += 0.16 * g; v.x *= 1 + 0.1 * g;
      if (v.i === 0) v.y += 0.04 * v.c * v.c;
    }
    if (q && v.y < D.shoulderY - 0.04) {
      const ph = Math.abs(Math.sin((PI * (v.y - hemY)) / q));
      const o = 0.016 * (Math.pow(ph, 0.6) - 0.55);
      const r = Math.hypot(v.x, v.z) || 1;
      v.x += (v.x / r) * o; v.z += (v.z / r) * o;
    }
  };
  const base = lin(c.color);
  // (p4r2: a scarf with hanging ends no longer fills the V with its colour - that read as a flat
  // bib behind the ends: a dark knit is under the coat; a tucked scarf still fills it)
  const vcol = c.open || c.collar === 'lapel' ? lin(d.scarf ? (d.scarf.style === 'tucked' ? d.scarf.color : c.under ?? d.under ?? 0x2c2a2a) : c.under ?? d.under ?? 0x6a6a6a) : base;
  const yV0 = D.chestY - 0.03;
  // a cardigan under a lapel coat (no scarf): its own, narrower V with a blouse in it
  const cardi = c.collar === 'lapel' && !d.scarf && d.under != null;
  const blouse = lin(d.blouse ?? 0xd6d0c4);
  const thC = (y) => lerp(0.0, 0.3, sstep(yV0 + 0.035, D.shoulderY + 0.06, y));
  D.cardiV = cardi ? thC : null;
  const color = (v) => {
    let cc = base;
    const a = wrapAbs(v.th);
    if (c.open && v.y < D.shoulderY + 0.04) cc = mixc(cc, vcol, 1 - sstep(0.26, 0.34, a));
    if (c.collar === 'lapel' && v.y > yV0) {
      const thv = lerp(0.05, 0.62, sstep(yV0, D.shoulderY + 0.05, v.y));
      cc = mixc(cc, vcol, 1 - sstep(thv - 0.04, thv + 0.02, a));
      if (cardi) cc = mixc(cc, blouse, 1 - sstep(thC(v.y) - 0.03, thC(v.y) + 0.01, a));
    }
    if (c.type === 'shirt') {
      // soft folds: down the sides and the back, bunched over the belt
      const fold = 0.5 + 0.5 * Math.sin(v.th * 9 + v.y * 6 + 1.3 * Math.sin(v.th * 4));
      cc = scl(cc, 1 - 0.07 * fold * sstep(0.5, 1.4, a) - 0.05 * G2((v.y - D.hipY - 0.1 * D.k) / 0.03, 0) * fold);
    }
    if (c.hemBand && v.y < hemY + 0.055 * D.k) cc = lin(c.hem ?? darker(c.color, 0.6));
    if (q && v.y < D.shoulderY - 0.04) { const ph = Math.abs(Math.sin((PI * (v.y - hemY)) / q)); cc = scl(cc, lerp(0.78, 1.02, Math.pow(ph, 0.5))); }
    if (c.suit && c.reflect && Math.abs(v.y - (D.chestY + 0.02)) < 0.012) cc = lin(0xb8bcc0);
    return cc;
  };
  const rings = ys.map(at);
  const cloth = c.type === 'shirt' ? 'painted' : 'fabric';
  const tn = [32, 18, 12][lod];
  sb.use(cloth).add(loft(rings, { n: tn, thetas: lod === 0 ? faceThetas(tn) : null, mod, color, weights: torsoWeights(D, bi, hemY), capBot: 0.0, capTop: 0.0 }), 0xffffff);
  // surface queries for the details
  const surf = (th, y) => { const r = at(y); const [x, z] = ringPt(r, th); const v = { x, y, z, th, s: Math.sin(th), c: Math.cos(th) }; mod(v); return v; };
  D.torsoAt = at; D.torsoSurf = surf;
  D.frontZ = (y) => surf(0, y).z;
  D.backZ = (y) => surf(PI, y).z;
  m.armOut = armClearance(D, at, c);

  const W = torsoWeights(D, bi, hemY);
  const strip = (th, y0, y1, w, t, colr, out = 0.003, nseg = 6) => {
    const yy = rangeYs(y0, y1, [0.03, 0.05, 0.08][lod]);
    const rr = yy.map((y) => { const p = surf(th, y); const r = Math.hypot(p.x, p.z) || 1; return { y, cx: p.x + (p.x / r) * out, cz: p.z + (p.z / r) * out, rx: w, rz: t, w: W(p) }; });
    sb.use('fabric').add(loft(rr, { n: nseg, capBot: 0.0, capTop: 0.0, weights: (v, r) => r.w }), colr);
  };
  const zipC = c.zipColor ?? darker(c.color, 0.55);
  if (c.zip && !c.open && c.collar !== 'shirt') strip(0, hemY + 0.004, D.shoulderY + 0.04, 0.006, 0.004, zipC);
  if (c.open) for (const s of [-1, 1]) strip(s * 0.3, hemY + 0.004, D.shoulderY + 0.03, 0.012, 0.006, darker(c.color, 0.9), 0.004);
  if (c.type === 'shirt') {
    // the placket and its buttons (mostly behind the tie)
    const yb0 = D.hipY + 0.07 * D.k, yb1 = D.shoulderY + 0.02;
    strip(0.0, yb0, yb1, 0.0075 * D.k, 0.0016, darker(c.color, 0.96), 0.0012, 6);
    const pl = sb.parts[sb.parts.length - 1]; pl.surf = sb.remap?.painted ?? 'painted';
    for (let q = 0; q < 6; q++) {
      const y = lerp(yb0 + 0.03, yb1 - 0.02, q / 5), p = surf(0, y);
      sb.use('leather').add(weighted(sphereGeo(6, 4), W(p)), 0xe2e0da, mat(0, y, p.z + 0.0035, 0, 0, 0, 0.0045, 0.0045, 0.0018));
    }
  }
  if (cardi) {
    // the cardigan's button bands along its V (ribbed), two buttons inside the coat's V
    for (const s2 of [-1, 1]) {
      const yy = rangeYs(yV0, D.shoulderY + 0.05, 0.02);
      const rr = yy.map((y) => { const p = surf(s2 * (thC(y) + 0.02), y), r0 = Math.hypot(p.x, p.z) || 1; return { y, cx: p.x + (p.x / r0) * 0.003, cz: p.z + (p.z / r0) * 0.003, rx: 0.011 * D.k, rz: 0.0035, p: 2.4, w: W(p) }; });
      sb.use('fabric').add(loft(rr, { n: 6, capBot: 0.0, capTop: 0.0, weights: (v, r) => r.w, color: (v) => scl([1, 1, 1], 0.86 + 0.08 * Math.sin(v.y * 600)) }), d.under);
    }
    for (const y of [yV0 + 0.03, yV0 + 0.075]) {
      const p = surf(-(thC(y) + 0.02), y);
      sb.use('leather').add(weighted(sphereGeo(6, 4), W(p)), 0xd8ccb8, mat(p.x, y, p.z + 0.006, 0, 0, 0, 0.005, 0.005, 0.002));
    }
  }
  if (c.buttons) {
    const bc = c.buttonColor ?? 0x2a2420;
    const yb = c.collar === 'lapel' ? yV0 - 0.005 : D.shoulderY - 0.06;
    for (let k = 0; k < 4; k++) {
      const y = yb - k * 0.105 * D.k;
      if (y < hemY + 0.05) break;
      const p = surf(0.04, y);
      sb.use('leather').add(weighted(sphereGeo(8, 5), W(p)), bc, mat(p.x, p.y, p.z + 0.004, 0, 0, 0, 0.011 * D.k, 0.011 * D.k, 0.005));
    }
  }
  if (c.pockets && hemY < D.hipY + 0.02) {
    for (const s of [-1, 1]) {
      const th = s * 0.95, y = Math.max(hemY + 0.07, D.hipY - 0.02);
      const p = surf(th, y);
      sb.use('fabric').add(weighted(boxGeo(), W(p)), darker(c.color, 0.85), mat(p.x + Math.sin(th) * 0.0015, p.y, p.z + Math.cos(th) * 0.0015, 0, th, 0, 0.15 * D.k, 0.03, 0.006));
    }
  }
  if (c.belt || d.belt) {
    const y = c.tucked ? D.hipY + 0.07 * D.k : D.spineY;
    const r = at(y);
    sb.use('leather').add(loft([{ y: y - 0.018, rx: r.rx + 0.006, rzF: r.rzF + 0.006, rzB: r.rzB + 0.006, pF: r.pF, pB: r.pB }, { y: y + 0.018, rx: r.rx + 0.006, rzF: r.rzF + 0.006, rzB: r.rzB + 0.006, pF: r.pF, pB: r.pB }], { n: [20, 14, 10][lod], w: c.tucked ? bi.pelvis : bi.spine }), c.belt ?? d.belt);
  }
  buildCollar(sb, d, D, bi, lod, c, surf);
  if (d.scarf) buildScarf(sb, d, D, bi, lod, surf);
  if (d.tie) {
    // the blade: from under the knot, widening to ~8 cm, a pointed tip at the belt, standing a little
    // off the chest and the belly; the knot: a trapezoid under the collar points
    const yk = D.shoulderY + 0.028 * D.k, y0 = D.hipY + 0.11 * D.k, y1 = yk - 0.012;
    const yy = rangeYs(y0, y1, [0.02, 0.04, 0.06][lod]);
    const rr = yy.map((y) => { const p = surf(0, y); const t = (y - y0) / (y1 - y0); return { y, cx: 0, cz: p.z + 0.004 + 0.012 * Math.sin(PI * clamp((1 - t) * 1.1, 0, 1)) * (1 - t * 0.6), rx: lerp(0.04, 0.017, Math.pow(t, 0.8)) * D.k, rz: 0.0026, pF: 6, pB: 6, w: W(p) }; });
    sb.use('fabric').add(loft(rr, { n: 8, capBot: 0.034 * D.k, capTop: 0.0, weights: (v, r) => r.w, color: (v) => scl([1, 1, 1], 0.95 + 0.07 * Math.sin(v.y * 90 + v.x * 200)) }), d.tie);
    const p = surf(0, yk);
    const kr = [{ y: yk - 0.018 * D.k, rx: 0.011 * D.k, rz: 0.006, cz: p.z + 0.009 }, { y: yk + 0.002, rx: 0.017 * D.k, rz: 0.008, cz: p.z + 0.011 }, { y: yk + 0.016 * D.k, rx: 0.019 * D.k, rz: 0.0075, cz: p.z + 0.008 }];
    sb.use('fabric').add(loft(kr, { n: 10, capBot: 0.002, capTop: 0.0, w: bi.chest, pF: 3 }), darker(d.tie, 0.92));
  }
}

// How far the arms must swing out to clear the coat (radians).
function armClearance(D, at, c) {
  // only the hands need to clear the coat (hips, a flared hem); higher up the sleeve may press in
  let a = 0.05;
  const r = (0.034 * D.k + (c.bulk ?? 0.02) * 0.6) * 0.6;
  for (let y = D.elbowY; y > D.wristY - 0.05; y -= 0.025) {
    if (y < D.hemY) break;
    const need = at(y).rx + r - D.S;
    if (need > 0) a = Math.max(a, Math.atan2(need, D.shJ - y));
  }
  return clamp(a, 0.05, 0.2);
}

function collarRings(y0, h, rx, rz, cz, inset = 0.012) {
  return [
    { y: y0, rx, rz, cz },
    { y: y0 + h * 0.6, rx: rx + 0.003, rz: rz + 0.003, cz },
    { y: y0 + h, rx: rx + 0.005, rz: rz + 0.004, cz },
    { y: y0 + h - 0.006, rx: rx - inset * 0.7, rz: rz - inset * 0.7, cz },
    { y: y0 + 0.02, rx: rx - inset, rz: rz - inset, cz },
  ];
}

// Push model-space point p ([x, y, z]) out of the torso's surface until it is `gap` outside it, along
// the surface's normal (on the sloping trapezius that is mostly up, on the chest forwards); points
// above or below the torso are left alone.
const _oT = [0, 0, 0];
function outsideTorso(D, p, gap) {
  if (!D.torsoSurf || p[1] > D.shoulderY + 0.05 || p[1] < D.hemY) return p;
  const y = p[1], r = D.torsoAt(y), cx = r.cx || 0, cz = r.cz || 0;
  const dx = p[0] - cx, dz = p[2] - cz, phi = Math.atan2(dx, dz), rp = Math.hypot(dx, dz);
  let th = phi, q = null;
  for (let k = 0; k < 4; k++) {
    q = D.torsoSurf(th, y);
    let e = phi - Math.atan2(q.x - cx, q.z - cz);
    e -= TAU * Math.round(e / TAU);
    th += e;
  }
  const rs = Math.hypot(q.x - cx, q.z - cz);
  if (rp > rs + gap + 0.05) return p;
  // the surface normal from its tangents round the section and up the torso
  const a = D.torsoSurf(th + 0.01, y), u = D.torsoSurf(th, y + 0.006);
  _v.set(a.x - q.x, 0, a.z - q.z); _t.set(u.x - q.x, 0.006, u.z - q.z);
  const n = _v.cross(_t).normalize();
  const rx = dx / (rp || 1e-6), rz = dz / (rp || 1e-6);
  if (n.x * rx + n.z * rz < 0) n.negate();
  const dist = (rp - rs) * (n.x * rx + n.z * rz);   // signed distance along the normal (approx.)
  if (dist < gap) { const m = gap - dist; p[0] += n.x * m; p[1] += n.y * m; p[2] += n.z * m; }
  return p;
}

function buildCollar(sb, d, D, bi, lod, c, surf) {
  const nR = D.neckR, b = c.bulk ?? 0.02, cz = D.neckZ + 0.004;
  const n = [20, 14, 10][lod];
  const wf = (v) => { const t = sstep(D.shoulderY + 0.03, D.shoulderY + 0.11, v.y); return [[bi.chest, 1 - t * 0.55], [bi.neck, t * 0.55]]; };
  const col = c.collarColor ?? c.color;
  const type = c.collar;
  // a hoodie under an open coat: its hood comes out over the coat's collar at the back and its rim
  // runs down into the coat's opening at the front
  const hoodUnder = (type === 'hood' || d.hood) && c.open && (c.hoodColor ?? c.under ?? col) !== col;
  if (type === 'stand' || type === 'knit' || type === 'hood') {
    // (a child's snowsuit collar stops at the chin, the zip a little open: the face shows; an open
    // coat over a hoodie: a lower collar, spread open at the front)
    const h = (type === 'knit' ? 0.05 : 0.095) * Math.min(1, D.k + 0.2) * (c.suit ? 0.55 : 1) * (hoodUnder ? 0.62 : 1);
    const rx = nR + 0.017 + b * 0.45, rz = nR + 0.017 + b * 0.4;
    // the front dips and stands a little forward, so the chin clears it when the head drops
    const y0 = D.shoulderY + 0.025, dip = (type === 'knit' ? 0.012 : c.suit ? 0.05 : hoodUnder ? 0.05 : 0.034) * D.k, push = 0.01 * D.k;
    const mod = (v, r) => { if (v.c > 0) { const f = clamp((r.y - y0) / h, 0, 1), cc = Math.pow(v.c, 1.6); v.y -= dip * cc * f; v.z += push * cc * f; } };
    sb.use('fabric').add(loft(collarRings(y0, h, rx, rz, cz), { n, weights: wf, mod }), type === 'knit' ? (c.hem ?? darker(col, 0.6)) : col);
    if (c.zip && type !== 'knit' && !c.open) {
      sb.box(c.zipColor ?? darker(col, 0.55), bi.chest, 0, y0 + (h - dip) * 0.5, cz + rz + 0.004 + push * 0.5, 0.012, (h - dip) * 0.95, 0.006);
    }
  }
  if (type === 'hood' || d.hood) {
    // a hood down: its rolled rim round the neck (high at the back, its two ends down on the chest),
    // and the empty hood lying flat on the upper back with soft folds; a parka's fur trim on the rim.
    // Nothing of it may sink into the coat: rim and hood are kept outside the torso's surface.
    const hc = c.hoodColor ?? (c.open ? c.under ?? col : col);
    // (a hoodie's band hugs the base of the neck: p4r2)
    const y0 = D.shoulderY + 0.02, rr = nR + (hoodUnder ? 0.04 : 0.05) + b * (hoodUnder ? 0.55 : 0.8), rz0 = nR + (hoodUnder ? 0.045 : 0.055) + b * (hoodUnder ? 0.55 : 0.8);
    const furR = !!c.fur, tr = (furR ? 0.026 : hoodUnder ? 0.026 : 0.017) + b * (hoodUnder ? 0.1 : 0.25), tz = (furR ? 0.03 : hoodUnder ? 0.008 : 0.02) + b * (hoodUnder ? 0.05 : 0.3);
    const rim = [], outs = [];
    const A = hoodUnder ? 2.85 : 2.5;
    for (let q = 0; q <= 12; q++) {
      const a = lerp(-A, A, q / 12), sa = Math.sin(a), ca = Math.cos(a);   // a = 0 at the back
      const fr = sstep(1.4, 2.5, Math.abs(a));
      // (under an open coat the ends converge into the opening, lying on the hoodie's front)
      const p = hoodUnder
        ? [sa * rr * (1 - 0.55 * fr), y0 + 0.035 * Math.max(0, ca) - 0.05 * fr * fr, cz - ca * rz0 * (1 - 0.15 * fr) + 0.01 * fr]
        : [sa * rr * (1 - 0.25 * fr), y0 + 0.035 * Math.max(0, ca) - 0.045 * fr, cz - ca * rz0 + 0.012 * fr];
      // (never into the coat: lifted onto the shoulders, laid on the chest)
      outsideTorso(D, p, Math.max(tr, tz) + 0.004);
      rim.push(p);
      outs.push([sa, 0.35, -ca]);
    }
    const wR = (t) => { const fr = sstep(0.3, 0.0, Math.min(t, 1 - t)); return [[bi.chest, 0.55 + 0.45 * fr], [bi.neck, 0.45 * (1 - fr)]]; };
    const furCards = furR && !!D.cards;
    // a hoodie's hood (p4r2): not a round tube but the hood's opening lying round the neck as a band
    // standing up behind it, bunched in soft folds, narrowing to the front where its two ends meet in
    // the neckline (no longer running down the chest like a sling), the lining showing darker on its
    // inner face and a rolled hem along its upper edge (below)
    const hb = hoodUnder && !furR;
    const rxR = hb ? (t) => tr * lerp(0.55, 1, sstep(0, 0.38, Math.min(t, 1 - t))) * (1 + 0.13 * Math.sin(t * 29 + 1.3) * sstep(0.08, 0.3, Math.min(t, 1 - t))) : () => tr;
    const rzR = hb ? (t) => tz * lerp(0.7, 1, sstep(0, 0.3, Math.min(t, 1 - t))) : () => tz;
    const rimG = sweep(rim, outs, {
      n: [hb ? 14 : 10, 8, 6][lod], steps: [36, 20, 12][lod], rx: rxR, rz: rzR, capBot: 0.01, capTop: 0.01, weights: wR,
      mod: (p, t, a) => { if (furR) p[1] += 0.006 * (vnoise(a * 4, t * 40, 2) - 0.3); outsideTorso(D, p, 0.003); },
      // (with fur cards the tube is the fur's dense, darker root)
      color: (t, a) => scl([1, 1, 1], furR ? (0.85 + 0.25 * vnoise(a * 6, t * 50, 3)) * (furCards ? 0.8 : 1) : hb ? (Math.cos(a) < -0.3 ? 0.68 : 0.86 + 0.12 * Math.cos(a)) * (0.94 + 0.06 * Math.sin(t * 29 + 1.3)) : 0.9 + 0.1 * Math.cos(a)),
    });
    sb.use(furR ? 'hair' : 'fabric').add(rimG, furR ? c.fur : hc);
    if (hb) {
      // the rolled hem along the band's upper edge (the band's up-and-across direction: T x out)
      const hem = [], ho = [];
      for (let q = 0; q <= 12; q++) {
        const T = v3norm(v3sub(rim[Math.min(12, q + 1)], rim[Math.max(0, q - 1)], [0, 0, 0])), O = v3norm([...outs[q]]);
        const Bv = v3norm(v3cross(T, O, [0, 0, 0])); if (Bv[1] < 0) { Bv[0] = -Bv[0]; Bv[1] = -Bv[1]; Bv[2] = -Bv[2]; }
        const t = q / 12, w = rxR(t) * 0.93, o = rzR(t) * 0.35;
        hem.push([rim[q][0] + Bv[0] * w + O[0] * o, rim[q][1] + Bv[1] * w + O[1] * o, rim[q][2] + Bv[2] * w + O[2] * o]);
        ho.push(outs[q]);
      }
      sb.use('fabric').add(sweep(hem, ho, {
        n: [8, 6, 5][lod], steps: [36, 20, 12][lod], rx: (t) => tz * 0.75 * lerp(0.6, 1, sstep(0, 0.3, Math.min(t, 1 - t))), rz: (t) => tz * 0.8 * lerp(0.6, 1, sstep(0, 0.3, Math.min(t, 1 - t))), capBot: 0.004, capTop: 0.004, weights: wR,
        mod: (p) => outsideTorso(D, p, 0.003),
        color: (t, a) => scl([1, 1, 1], 0.92 + 0.08 * Math.cos(a)),
      }), hc);
    }
    // (lod 0) the fur: two layers of tufts, 3-6 cm, standing out of the trim
    if (furCards) tubeFurCards(D, rimG, [10, 8, 6][lod], { col: c.fur, len: 0.042 * Math.min(1.1, D.k + 0.1), seed: 11 });
    // the hood itself, flat on the back: from under the rim down ~22 cm, its sides rounding off, never
    // wider than the back under it (the corners stood out over the shoulders)
    const yT = y0 + 0.01, yB = D.shoulderY - 0.21 * D.k;
    const ys = rangeYs(yB, yT, [0.015, 0.03, 0.05][lod]);
    const rings = ys.map((y) => {
      const t = (y - yB) / (yT - yB), bz = D.backZ(Math.min(y, D.shoulderY - 0.02));
      const wdt = (0.15 * Math.pow(Math.sin(PI * clamp(0.1 + 0.9 * t, 0, 1) * 0.5 + PI * 0.5 * (t > 0.9 ? 0 : 0)), 0.5)) * D.k * lerp(0.55, 1, sstep(0, 0.35, t)) + b;
      const wMax = Math.min(D.torsoAt(Math.min(y, D.shoulderY + 0.05)).rx * 0.86, lerp(9, rr * 0.92, sstep(D.shoulderY - 0.06, yT, y)));
      const th = (0.012 + 0.016 * Math.sin(PI * clamp(t, 0, 1))) + b * 0.4;
      return { y, rx: Math.max(0.03, Math.min(wdt, wMax)), rzF: th * 0.4, rzB: th, cz: Math.min(bz, cz - nR) - 0.004, pF: 2.6, pB: 2.2 };
    });
    sb.use('fabric').add(loft(rings, {
      n: [22, 14, 10][lod], capBot: 0.01, capTop: 0.0,
      weights: (v) => { const t = sstep(D.shoulderY - 0.02, y0, v.y); return [[bi.chest, 1 - 0.4 * t], [bi.neck, 0.4 * t]]; },
      mod: (v) => {
        const f = 0.004 * Math.sin(v.x * 70 + v.y * 25) * sstep(0.2, 0.8, -v.c); v.z -= f;
        _oT[0] = v.x; _oT[1] = v.y; _oT[2] = v.z; outsideTorso(D, _oT, 0.003); v.x = _oT[0]; v.z = _oT[2];
      },
      color: (v) => scl([1, 1, 1], 0.86 + 0.1 * Math.sin(v.x * 70 + v.y * 25) - 0.12 * sstep(0.7, 1, Math.abs(v.s))),
    }), hc);
    if (c.open && hc !== col) {
      // the drawstrings, hanging from the rim's ends
      for (const [s, e] of [[-1, rim[0]], [1, rim[12]]]) {
        const top = [e[0] * 0.9, e[1] - 0.01, e[2] + tz * 0.6], y1 = D.chestY - 0.02;
        sb.use('fabric').tube(0xd8d4cc, bi.chest, top, [top[0] + s * 0.004, y1, D.frontZ(y1) + 0.012], 0.0035, 0.0035, 4, 0.5);
      }
    }
  }
  if (type === 'lapel') {
    // a collar standing at the back and dipping into the V at the front, lapels along the V
    const rx = nR + 0.03 + b * 0.5, rz = nR + 0.03 + b * 0.5;
    const rr = collarRings(D.shoulderY + 0.02, 0.07, rx, rz, cz, 0.014);
    sb.use('fabric').add(loft(rr, { n, weights: wf, mod: (v, r) => { if (v.c > 0 && r.y > D.shoulderY + 0.03) v.y -= 0.05 * Math.pow(v.c, 2) * sstep(D.shoulderY + 0.03, D.shoulderY + 0.09, r.y); const f = lerp(1, 0.55, sstep(0.3, 0.75, v.c)); v.x *= f; v.z = cz + (v.z - cz) * f; } }), col);
    const yV0 = D.chestY - 0.03;
    for (const s of [-1, 1]) {
      const yy = rangeYs(yV0, D.shoulderY + 0.03, 0.025);
      const rings = yy.map((y) => {
        const thv = lerp(0.05, 0.62, sstep(yV0, D.shoulderY + 0.05, y));
        const p = surf(s * (thv + 0.08), y), r = Math.hypot(p.x, p.z) || 1;
        return { y, cx: p.x + (p.x / r) * 0.005, cz: p.z + (p.z / r) * 0.005, rx: lerp(0.018, 0.04, sstep(yV0, D.shoulderY, y)) * D.k, rz: lod ? 0.006 : 0.0075, p: lod ? 2.5 : 2.2, w: y > D.chestY ? bi.chest : [[bi.spine, 0.5], [bi.chest, 0.5]] };
      });
      // (p4r2, lod 0: rounder edges, the outer edge rolled forward a little, its underside darker - not a flat slab)
      sb.use('fabric').add(loft(rings, {
        n: [12, 6, 6][lod], capBot: 0.0, capTop: 0.0, weights: (v, r) => r.w,
        mod: lod ? null : (v, r) => { const e = sstep(0.2, 1, ((v.x - r.cx) * s) / r.rx); v.z += 0.004 * e; },
        color: lod ? null : (v, r) => scl([1, 1, 1], v.c < -0.3 ? 0.8 : 0.96 + 0.04 * v.c),
      }), darker(col, 0.95));
    }
  }
  if (type === 'shirt') {
    // the band up the neck (covering most of it), the collar turned down over it with two points
    // that lie on the chest either side of the tie knot
    const rx = nR + 0.006, rz = nR + 0.006, y0 = D.shoulderY + 0.012, hb = 0.064 * D.k;
    sb.use('painted').add(loft(collarRings(y0, hb, rx, rz, cz, 0.005), { n: 24, weights: wf }), col);
    const yt = y0 + hb + 0.002, fh = 0.032 * D.k;
    const fr = [{ y: yt - fh, rx: rx + 0.009, rz: rz + 0.009, cz }, { y: yt - fh * 0.5, rx: rx + 0.006, rz: rz + 0.006, cz }, { y: yt, rx: rx + 0.0035, rz: rz + 0.0035, cz }];
    sb.use('painted').add(loft(fr, {
      n: 40, weights: wf, capBot: null, capTop: null,
      mod: (v) => {
        if (v.i !== 0) return;
        // the points: the lower edge drops down and out onto the chest at the front
        const a = Math.abs(v.th > PI ? v.th - TAU : v.th), pt = G2((a - 0.36) / 0.22, 0) * (a > 0.14 ? 1 : sstep(0.02, 0.14, a));
        v.y -= 0.05 * D.k * pt; v.z += 0.02 * pt; v.x *= 1 + 0.25 * pt;
        if (a < 0.14) { v.y = lerp(v.y, yt - 0.004, sstep(0.14, 0.04, a)); }
      },
      color: (v) => scl([1, 1, 1], v.i === 0 ? 0.93 : 1),
    }), col);
    sb.use('leather').sphere(0xe2e0da, bi.chest, 0, y0 + 0.012, cz + rz + 0.003, 0.0042, 0.0042, 0.0018, 0, 0, 0, 6, 4);
  }
}

// Scarves (p4r2, rebuilt): the wrap is the band wound twice round the neck - one swept tube along a
// helix, the lower turn bigger and lying on the collar, the upper one closer round the neck, dipping
// under the chin, so a crease runs between the turns and the band climbs across one side - with soft
// folds along it (its height and depth rippling three or four times a turn, creases round its
// section), smooth normals and a 3x finer knit (the fabric texture's scale); a second colour shows
// as bands near the ends (stripes across the wound band read as blotches). Its ends (style: 'end' one hanging in front, 'two' both, different lengths,
// 'tucked' none, 'loop' folded in half with the ends pulled through the loop at the throat: a soft
// knot across the front) follow the chest and the belly with lengthwise folds, gathered where they
// leave the wrap, and end in a fringe of short strands.
function buildScarf(sb, d, D, bi, lod, surf) {
  const sc = d.scarf, nR = D.neckR, bk = sc.bulk ?? 1, b = (d.coat.bulk ?? 0.02) * 0.4, cz = D.neckZ;
  const style = sc.style || 'end';
  const y0 = D.shoulderY - 0.005, H = (0.1 + 0.02 * bk) * Math.min(1, D.k + 0.25);
  const g = (v) => nR + v * bk + b;
  const c1 = lin(sc.color), c2 = sc.color2 != null ? lin(sc.color2) : c1, two = sc.color2 != null;
  const seed = hash1(sc.color * 1e-6 + (d.age ?? 1) * 0.37) * 30;
  const triK = sb.triK; sb.triK = 3;
  // the wrap: a helix from the end hanging in front (th0), twice round
  const th0 = style === 'two' ? 0.22 : style === 'loop' ? 0.1 : style === 'tucked' ? 0.4 : 0.16;
  const turns = 1.94, NP = 48;
  const rz0 = (0.017 + 0.011 * bk) * Math.min(1, D.k + 0.2);   // the band's depth (radial half-thickness)
  const outer1 = g(0.074), outer2 = nR + 0.05 * bk + b * 0.5 + 0.004;
  const pts = [], outs = [];
  for (let q = 0; q <= NP; q++) {
    const u = q / NP, ph = th0 + u * turns * TAU, su = sstep(0.25, 0.75, u);
    const fold = 1 + 0.07 * Math.sin(3.5 * ph + seed) + 0.03 * Math.sin(7.3 * ph + seed * 2);
    const rp = (lerp(outer1, outer2, su) - rz0 * lerp(1, 0.85, su)) * fold;
    const cf = Math.max(0, Math.cos(ph));
    const x = Math.sin(ph) * rp, z = cz + Math.cos(ph) * rp * (Math.cos(ph) > 0 ? 1.04 : 0.93);
    const y = y0 + H * lerp(0.3, 0.68, su) - 0.012 * cf * cf * su + 0.004 * Math.sin(2.3 * ph + seed);
    pts.push([x, y, z]);
    outs.push([Math.sin(ph), 0, Math.cos(ph)]);
  }
  const wf = (t) => { const y = lerp(y0 + H * 0.3, y0 + H * 0.68, sstep(0.25, 0.75, t)), w = sstep(y0 + 0.02, y0 + H * 0.95, y); return [[bi.chest, 1 - w * 0.6], [bi.neck, w * 0.6]]; };
  const hW = (t) => H * 0.31 * (1 + 0.14 * Math.sin(2.6 * (th0 + t * turns * TAU) + seed)) * lerp(1, 0.85, sstep(0.25, 0.75, t));
  sb.use('fabric').add(sweep(pts, outs, {
    n: [14, 10, 7][lod], steps: [110, 48, 24][lod], capBot: 0.01, capTop: 0.01, weights: wf,
    rx: hW, rz: (t) => rz0 * lerp(1, 0.85, sstep(0.25, 0.75, t)),
    // creases round the band's section, drifting along it
    mod: (p, t, a, N, Bv) => {
      if (lod > 1) return;
      const k = 0.11 * Math.sin(3 * a + t * 31 + seed) + 0.05 * Math.sin(5 * a - t * 17);
      const rx = hW(t) * Math.sin(a) * k, rz = rz0 * Math.cos(a) * k;
      p[0] += Bv.x * rx + N.x * rz; p[1] += Bv.y * rx + N.y * rz; p[2] += Bv.z * rx + N.z * rz;
    },
    color: (t, a) => scl(c1, (0.9 + 0.08 * Math.cos(a)) * (0.94 + 0.06 * Math.sin(3 * a + t * 31 + seed)) * (0.97 + 0.03 * Math.sin(t * 900 + a * 3))),
  }), 0xffffff);
  if (style === 'tucked') { sb.triK = triK; return; }
  // an end hanging from the wrap at angle th0, to height yb, its width w; follows the coat's surface
  const end = (th0, yb, w, twist) => {
    const yTop = y0 + H * 0.3, pts = [], outs = [], N = 6;
    for (let q = 0; q <= N; q++) {
      const t = q / N, y = lerp(yTop, yb, t), th = th0 * (1 - 0.35 * t) + 0.05 * Math.sin(t * 3 + seed);
      const p = surf(th, Math.min(y, D.shoulderY - 0.02)), r0 = Math.hypot(p.x, p.z) || 1;
      const off = lerp(g(0.06) - Math.hypot(p.x, p.z - cz) + 0.012, 0.012, sstep(0, 0.3, t)) + 0.004;
      pts.push([p.x + (p.x / r0) * Math.max(0.006, off), y, p.z + (p.z / r0) * Math.max(0.006, off)]);
      outs.push([Math.sin(th + twist * t), 0, Math.cos(th + twist * t)]);
    }
    const len = yTop - yb, wd = (t) => w * D.k * lerp(0.55, 1, sstep(0, 0.3, t)), th = 0.0065 * bk + 0.003;
    sb.use('fabric').add(sweep(pts, outs, {
      n: [14, 8, 6][lod], steps: Math.max(6, Math.round(len / [0.018, 0.035, 0.05][lod])), rx: wd, rz: (t) => th * lerp(1.6, 1, sstep(0, 0.3, t)), capBot: 0.0, capTop: 0.0,
      weights: (t) => { const y = lerp(yTop, yb, t); return y > D.chestY ? [[bi.chest, 1]] : [[bi.spine, 0.5], [bi.chest, 0.5]]; },
      // soft lengthwise folds rippling across the width (gathered where it leaves the wrap, opening out
      // towards the free end), the edges rolled a little
      mod: (p, t, a, N) => {
        if (lod > 1) return;
        const fo = 0.0055 * Math.sin(Math.sin(a) * PI * 1.7 + seed + t * 2.5) * (0.4 + 0.6 * t) + 0.006 * (1 - sstep(0, 0.25, t)) * Math.cos(Math.sin(a) * PI * 3);
        p[0] += N.x * fo; p[1] += N.y * fo; p[2] += N.z * fo;
      },
      color: (t, a) => {
        const y = lerp(yTop, yb, t), sh = 0.92 + 0.08 * Math.sin(Math.sin(a) * PI * 1.7 + seed + t * 2.5);
        // two-colour: bands near the end; one colour: a darker ribbed band above the fringe
        const band = two ? (y < yb + 0.05 ? 1 : 1 - sstep(0.004, 0.009, Math.abs(((y - yb) % 0.07) - 0.035))) * sstep(yb + 0.24, yb + 0.16, y) : 0;
        return scl(mixc(c1, c2, band), sh * (two ? 1 : y < yb + 0.03 ? 0.88 : 1));
      },
    }), 0xffffff);
    // the fringe: short twisted strands across the end, a little apart and of different lengths
    const nf = [11, 6, 0][lod];
    const pe = pts[N], pp = pts[N - 1], ou = outs[N];
    const sx = Math.cos(th0 * 0.65 + twist), sz = -Math.sin(th0 * 0.65 + twist);   // across the end
    for (let f = 0; f < nf; f++) {
      const u = (f / (nf - 1) - 0.5) * 1.84 * wd(1), fl = (0.045 + 0.02 * hash1(seed + f * 3.1)) * Math.min(1, D.k + 0.1);
      const top = [pe[0] + sx * u + ou[0] * 0.001, pe[1] + 0.004, pe[2] + sz * u + ou[2] * 0.001];
      const dir = v3norm([pe[0] - pp[0], pe[1] - pp[1], pe[2] - pp[2]]);
      const sw = 0.006 * (hash1(seed + f * 7.7) - 0.5);
      const bot = [top[0] + dir[0] * fl + sx * sw, top[1] + dir[1] * fl, top[2] + dir[2] * fl + sz * sw];
      const [tg, M] = tubeGeo(top, bot, 0.0028 * Math.min(1.2, bk + 0.3), 0.0016, lod ? 3 : 4, 0.4);
      tg.applyMatrix4(M);
      _col.setRGB(...scl(two ? c2 : c1, 0.9));
      sb.use('fabric').add(weighted(tg, top[1] > D.chestY ? [[bi.chest, 1]] : [[bi.spine, 0.5], [bi.chest, 0.5]]), _col.getHex());
    }
  };
  const yLong = D.spineY - 0.06, yShort = D.chestY + 0.01;
  if (style === 'two') { end(0.22, sc.long ? yLong : yShort - 0.03, 0.052 * bk + 0.01, 0.2); end(-0.3, sc.long ? yLong + 0.09 : yShort + 0.05, 0.05 * bk + 0.01, -0.25); }
  else if (style === 'loop') {
    // the folded loop at the throat: a soft roll across the front of the wrap, the ends pulled through
    // it hanging close together below
    const kp = [], ko = [], rK = outer1 + 0.008;
    for (let q = 0; q <= 8; q++) {
      const ph = lerp(-0.62, 0.62, q / 8);
      kp.push([Math.sin(ph) * rK, y0 + H * 0.2 - 0.008 * Math.cos(ph * 2.5), cz + Math.cos(ph) * rK * 1.04 + 0.006]);
      ko.push([Math.sin(ph), 0.2, Math.cos(ph)]);
    }
    const kr = 0.03 * bk + 0.01, kd = 0.02 * bk + 0.008;
    sb.use('fabric').add(sweep(kp, ko, {
      n: [12, 8, 6][lod], steps: [20, 10, 6][lod], capBot: 0.012, capTop: 0.012, weights: () => [[bi.chest, 1]],
      rx: (t) => kr * (0.75 + 0.25 * Math.sin(PI * t)), rz: (t) => kd * (0.7 + 0.3 * Math.sin(PI * t)),
      mod: (p, t, a, N, Bv) => { const k = 0.12 * Math.sin(3 * a + t * 9 + seed); p[0] += (Bv.x * kr * Math.sin(a) + N.x * kd * Math.cos(a)) * k; p[1] += (Bv.y * kr * Math.sin(a) + N.y * kd * Math.cos(a)) * k; p[2] += (Bv.z * kr * Math.sin(a) + N.z * kd * Math.cos(a)) * k; },
      color: (t, a) => scl(c1, (0.88 + 0.1 * Math.cos(a)) * (0.94 + 0.06 * Math.sin(3 * a + t * 9 + seed))),
    }), 0xffffff);
    end(0.1, yShort - 0.02, 0.045 * bk + 0.008, 0.15); end(-0.08, yShort + 0.015, 0.045 * bk + 0.008, -0.2);
  } else end(0.16, sc.long ? yLong : yShort, 0.055 * bk + 0.01, 0.25);
  sb.triK = triK;
}

function sleeveWeights(D, bi, i) {
  const arm = i ? bi.armL : bi.armR, fore = i ? bi.foreL : bi.foreR;
  return (v) => {
    const y = v.y;
    if (y > D.shJ + 0.03) return [[bi.chest, 0.7], [arm, 0.3]];
    if (y > D.shJ - 0.06) { const t = sstep(D.shJ + 0.03, D.shJ - 0.06, y); return [[bi.chest, 0.7 * (1 - t)], [arm, 0.3 + 0.7 * t]]; }
    if (y > D.elbowY + 0.035) return [[arm, 1]];
    if (y > D.elbowY - 0.035) { const t = sstep(D.elbowY + 0.035, D.elbowY - 0.035, y); return [[arm, 1 - t], [fore, t]]; }
    return [[fore, 1]];
  };
}

function buildArms(sb, d, D, bi, lod, m) {
  const c = d.coat, b = (c.bulk ?? 0.02) * 0.7, k = D.k * Math.pow(D.build, 0.4);
  const n = [24, 10, 7][lod];
  const base = lin(c.color);
  // padded sleeves (parkas, puffers, snowsuits) gather into an elastic cuff at the wrist
  const padded = (c.bulk ?? 0.02) >= 0.03;
  const cw = padded ? 0.38 : 1;
  for (const [i, side] of [[0, -1], [1, 1]]) {
    const x0 = side * D.S;
    const cast = d.cast === (i ? 'L' : 'R');
    const bottom = cast ? D.elbowY - 0.06 : D.wristY - 0.004;
    const keys = [
      { y: D.wristY - 0.004, rx: 0.035 * k + b * cw, rz: 0.038 * k + b * cw, cx: x0 },
      { y: D.wristY + 0.012, rx: 0.033 * k + b * cw + (padded ? 0.002 : 0), rz: 0.036 * k + b * cw + (padded ? 0.002 : 0), cx: x0 },
      ...(padded ? [{ y: D.wristY + 0.024, rx: 0.033 * k + b * 0.45, rz: 0.036 * k + b * 0.45, cx: x0 }, { y: D.wristY + 0.045, rx: 0.034 * k + b * 0.8, rz: 0.037 * k + b * 0.8, cx: x0 }] : []),
      { y: D.wristY + 0.07, rx: 0.034 * k + b * 0.9, rz: 0.037 * k + b * 0.9, cx: x0 },
      { y: D.elbowY - 0.07, rx: 0.04 * k + b, rz: 0.043 * k + b, cx: x0 },
      { y: D.elbowY, rx: 0.038 * k + b, rz: 0.041 * k + b, cx: x0 },
      { y: D.elbowY + 0.06, rx: 0.04 * k + b, rz: 0.043 * k + b, cx: x0 },
      { y: D.shJ - 0.12, rx: 0.046 * k + b, rz: 0.05 * k + b, cx: x0 },
      { y: D.shJ - 0.03, rx: 0.051 * k + b, rz: 0.054 * k + b, cx: x0 },
      { y: D.shJ + 0.02, rx: 0.042 * k + b * 0.7, rz: 0.05 * k + b * 0.8, cx: x0 - side * 0.016 },
      { y: D.shJ + 0.045, rx: 0.026 * k + b * 0.35, rz: 0.038 * k + b * 0.5, cx: x0 - side * 0.04 },
    ];
    if (cast) { const rest = keys.filter((r) => r.y > bottom + 0.035); keys.length = 0; keys.push({ y: bottom, rx: 0.05 * k + b, rz: 0.053 * k + b, cx: x0 }, { y: bottom + 0.02, rx: 0.047 * k + b, rz: 0.05 * k + b, cx: x0 }, ...rest); }
    const q = c.quilt ? c.quilt * 0.8 : 0;
    const extra = [];
    if (q) for (let y = bottom + q; y < D.shJ - 0.05; y += q) extra.push(y - q * 0.5, y);
    const ys = rangeYs(bottom, D.shJ + 0.05, [0.025, 0.04, 0.065][lod], extra);
    const cuffC = c.cuffBand || c.cuffs ? lin(c.cuffs ?? c.hem ?? darker(c.color, 0.6)) : padded ? scl(base, 0.72) : null;
    const cuffY = padded && !c.cuffBand && !c.cuffs ? 0.022 : 0.05 * D.k;
    // lod 0: compression folds inside the elbow, a shoulder seam (shading and a little relief)
    const fold = (v) => lod === 0 && !c.quilt ? G2((v.y - D.elbowY - 0.005) / 0.05, 0) * sstep(-0.3, 0.7, v.c) * Math.sin((v.y - D.elbowY) * 140 + v.s * 2) : 0;
    const seam = (v) => lod === 0 ? G2((v.y - D.shJ - 0.012) / 0.004, 0) * sstep(-0.2, 0.5, side * v.s) : 0;
    const color = (v) => {
      let cc = base;
      if (cuffC && v.y < D.wristY + cuffY && !cast) cc = cuffC;
      cc = scl(cc, 1 - 0.1 * Math.max(0, -fold(v)) - 0.18 * seam(v));
      if (q && v.y < D.shJ - 0.05) { const ph = Math.abs(Math.sin((PI * (v.y - bottom)) / q)); cc = scl(cc, lerp(0.8, 1.02, Math.pow(ph, 0.5))); }
      if (c.reflect && Math.abs(v.y - (D.elbowY - 0.06)) < 0.011) cc = lin(0xb8bcc0);
      return cc;
    };
    const mod = q ? (v) => { if (v.y < D.shJ - 0.05) { const ph = Math.abs(Math.sin((PI * (v.y - bottom)) / q)); const o = 0.01 * (Math.pow(ph, 0.6) - 0.55); const dx = v.x - x0, r = Math.hypot(dx, v.z) || 1; v.x += (dx / r) * o; v.z += (v.z / r) * o; } }
      : lod === 0 ? (v) => { const o = 0.0025 * fold(v) - 0.0015 * seam(v); if (o) { const dx = v.x - x0, r = Math.hypot(dx, v.z) || 1; v.x += (dx / r) * o; v.z += (v.z / r) * o; } } : null;
    const cloth = c.type === 'shirt' ? 'painted' : 'fabric';
    sb.use(cloth).add(loft(sampleRings(keys, ys), { n, weights: sleeveWeights(D, bi, i), color, mod, capBot: 0.0, capTop: 0.0 }), 0xffffff);
    if (c.type === 'shirt' && !cast) {
      // the cuff: a band at the wrist, a button
      const rr = [{ y: D.wristY - 0.006, rx: 0.037 * k + b + 0.003, rz: 0.04 * k + b + 0.003, cx: x0 }, { y: D.wristY + 0.05 * D.k, rx: 0.037 * k + b + 0.003, rz: 0.04 * k + b + 0.003, cx: x0 }];
      sb.use('painted').add(loft(rr, { n, weights: sleeveWeights(D, bi, i), capBot: 0.0, capTop: 0.0, color: (v) => scl([1, 1, 1], v.y < D.wristY - 0.002 || v.y > D.wristY + 0.046 * D.k ? 0.9 : 1) }), c.color);
      sb.use('leather').sphere(0xe8e6e0, i ? bi.foreL : bi.foreR, x0, D.wristY + 0.025 * D.k, 0.04 * k + b + 0.004, 0.0045, 0.0045, 0.002, 0, 0, 0, 6, 4);
    }
    if (cast) castArm(sb, d, D, bi, lod, i, side, k, m);
    hand(sb, d, D, bi, lod, i, side, cast);
  }
}

// Hands. A palm, four fingers (separate tubes at lod 0; one fused block at lod 1-2 and in mittens)
// on bones (knuckles 'fing' and middle joints 'tip' for the middle, ring and little fingers; the index
// on its own 'idx' / 'idxTip'), and a thumb on its own bone, so poses curl the fingers about the
// knuckle axis towards the palm (relaxed, grip, fist, a pen pinch; see handShape). Rest: the hand
// hangs with the palm towards the body. Hand frame: u = down the hand (towards the fingertips),
// w = across towards the thumb (+Z), t = towards the palm side (-side * X). Sizes for a 19 cm hand.
// The palm is rounded (wider at the knuckles, the knuckle line slanting down to the little finger,
// a rounded end); the thumb grows out of the thenar pad on the palm's radial side and at rest
// points down and forward along the index finger.
const HAND = { kn: 0.1, pip: 0.044, cmc: [0.03, 0.02, 0.006], thumbDir: [0.88, 0.16, 0.4] };
const FINGERS = [ // w (across), u (knuckle), length, half-width, half-thickness
  [0.026, 0.098, 0.074, 0.0092, 0.0084],
  [0.0085, 0.1, 0.082, 0.0094, 0.0087],
  [-0.009, 0.097, 0.077, 0.0089, 0.0083],
  [-0.0255, 0.089, 0.061, 0.0078, 0.0074],
];
function hand(sb, d, D, bi, lod, i, side, cast) {
  const glove = cast ? null : d.gloves ?? null;
  const mitt = cast ? null : d.mittens ?? null;
  const k = D.hand / 0.19, x0 = side * D.S, wy = D.wristY;
  const g = glove ? 0.0024 : mitt ? 0.0045 : 0;       // glove / mitten thickness
  const hb = i ? bi.handL : bi.handR, fb = i ? bi.foreL : bi.foreR;
  const fing = i ? bi.fingL : bi.fingR, tip = i ? bi.tipL : bi.tipR, thb = i ? bi.thumbL : bi.thumbR;
  const ix = i ? bi.idxL : bi.idxR, ixt = i ? bi.idxTipL : bi.idxTipR;
  const surf = mitt ? 'fabric' : glove ? 'leather' : 'skin';
  const colr = mitt ?? glove ?? d.skin;
  const Y = (u) => wy - u * k;                          // hand frame -> model space
  // palm: [u, half-thickness, half-width on the thumb side, on the little-finger side]
  const pk = [
    [0.108, 0.0085, 0.025, 0.022], [0.101, 0.0118, 0.034, 0.031], [0.088, 0.0142, 0.04, 0.0372], [0.066, 0.0153, 0.041, 0.037],
    [0.042, 0.016, 0.0395, 0.0345], [0.018, 0.0161, 0.0345, 0.0305], [-0.008, 0.0158, 0.0285, 0.0272], [-0.035, 0.0162, 0.0262, 0.0255],
  ];
  const palmRings = pk.map(([u, t, wf, wb]) => ({ y: Y(u), rx: t * k + g, rzF: wf * k + g, rzB: wb * k + g, cx: x0, cz: 0, pF: 2.25, pB: 2.4, u }));
  const W = (v) => (v.y > wy + 0.004 ? [[hb, 0.55], [fb, 0.45]] : v.y > wy - 0.012 * k ? [[hb, 0.85], [fb, 0.15]] : [[hb, 1]]);
  sb.use(surf).add(loft(palmRings, {
    n: [18, 12, 8][lod], weights: W, capBot: 0.002 * k, capTop: 0.0,
    mod: (v, r) => {
      let u = r.u;
      const w = v.z / k, palm = -side * Math.sign(v.s) > 0 ? Math.abs(v.s) : 0;
      // the knuckle line slants: the little finger's end of the palm is shorter
      if (u > 0.075) { const e = (u - 0.075) * (1 + 0.32 * clamp(w / 0.035, -1, 1)); u = 0.075 + e; v.y = Y(u); }
      // thenar (thumb side) and hypothenar pads, the hollow of the palm between them; knuckles on the back
      const pad = 0.0045 * G2((u - 0.03) / 0.024, (w - 0.022) / 0.015) + 0.003 * G2((u - 0.05) / 0.03, (w + 0.024) / 0.012) - 0.0018 * G2((u - 0.06) / 0.02, w / 0.015);
      const back = side * Math.sign(v.s) > 0 ? Math.abs(v.s) : 0;
      const kn = 0.0018 * G2((u - 0.089 - 0.25 * w) / 0.008, 0) * (0.6 + 0.4 * Math.cos(w * 185));
      v.x += -side * pad * k * palm + side * kn * k * back;
    },
  }), colr);
  // fingers
  const fw = (v, u0, len, f1, f2) => {
    const s = (wy - v.y) / k - u0;                      // distance past the knuckle
    if (s < -0.004) return [[hb, 1]];
    if (s < 0.01) { const t = sstep(-0.004, 0.01, s); return [[hb, 1 - t], [f1, t]]; }
    const sp = HAND.pip - (u0 - HAND.kn) + (len - 0.082) * 0.4;  // this finger's middle joint
    if (s < sp - 0.007) return [[f1, 1]];
    if (s < sp + 0.007) { const t = sstep(sp - 0.007, sp + 0.007, s); return [[f1, 1 - t], [f2, t]]; }
    return [[f2, 1]];
  };
  if (lod === 0 && !mitt) {
    FINGERS.forEach(([w, u0, len, hw, ht], fi) => {
      const us = [u0 + len, u0 + len - 0.005, u0 + len * 0.86, u0 + len * 0.66, u0 + len * 0.45, u0 + len * 0.24, u0 + 0.006, u0 - 0.016];
      const rings = us.map((u) => {
        const s = (u - u0) / len, taper = lerp(1.04, 0.74, clamp(s, 0, 1)) * (u > u0 + len - 0.008 ? 0.9 : 1);
        const joint = 1 + 0.07 * G2((s - 0.55) / 0.08, 0) + 0.05 * G2((s - 0.82) / 0.06, 0);
        return { y: Y(u), rx: ht * k * taper * joint + g, rz: hw * k * taper * joint + g, cx: x0, cz: (w + w * 0.1 * clamp(s, 0, 1)) * k, p: 2.15 };
      });
      const [f1, f2] = fi === 0 ? [ix, ixt] : [fing, tip];
      sb.use(surf).add(loft(rings, { n: [10, 8, 6][lod], weights: (v) => fw(v, u0, len, f1, f2), capBot: 0.006 * k, capTop: 0.0 }), colr);
    });
  } else {
    // one block: the four fingers side by side (a mitten's bag), shorter on the little-finger side
    const L = mitt ? 0.086 : 0.08, u0 = 0.094;
    const us = [u0 + L, u0 + L - 0.012, u0 + L * 0.7, u0 + L * 0.4, u0 + 0.01, u0 - 0.004];
    const rings = us.map((u) => {
      const s = (u - u0) / L, end = sstep(0.62, 1, s);
      return { y: Y(u), rx: lerp(0.0094, 0.0078, s) * k + g, rzF: (lerp(0.039, 0.031, s) - 0.006 * end) * k + g, rzB: (lerp(0.038, 0.03, s) - 0.016 * end) * k + g, cx: x0, cz: (0.002 + 0.005 * end) * k, pF: mitt ? 2.2 : 2.6, pB: mitt ? 2.2 : 2.6 };
    });
    sb.use(surf).add(loft(rings, { n: [14, 10, 8][lod], weights: (v) => fw(v, u0 + 0.004, 0.08, fing, tip), capBot: (mitt ? 0.012 : 0.006) * k, capTop: 0.0 }), colr);
  }
  // thumb: out of the thenar pad (its base inside the palm), down, forwards and towards the palm
  const [du, dw, dt] = HAND.thumbDir, dl = Math.hypot(du, dw, dt);
  const dir = new THREE.Vector3(-side * dt / dl, -du / dl, dw / dl);     // model space: x = -side * t
  const base = new THREE.Vector3(x0 - side * HAND.cmc[2] * k, Y(HAND.cmc[0]), HAND.cmc[1] * k);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const M = new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1));
  const tk = [[0.098, 0.0078], [0.093, 0.0091], [0.082, 0.0098], [0.066, 0.0103], [0.05, 0.0112], [0.034, 0.0128], [0.016, 0.0148], [-0.01, 0.0158]];
  const th = tk.map(([s, r]) => ({ y: -s * k, rx: r * k * (mitt ? 1.12 : 0.92) + g, rz: r * k * 1.04 + g }));
  const tw = (v) => { const s = -v.y / k; const t = sstep(0.004, 0.032, s); return [[hb, 1 - t], [thb, t]]; };
  sb.use(surf).add(loft(th, { n: [10, 8, 6][lod], weights: tw, capBot: 0.0055 * k, capTop: 0.0 }), colr, M);
  if (glove || mitt) {
    // the cuff, over the end of the sleeve
    const rr = [{ y: wy - 0.012, rx: 0.019 * k + g + 0.002, rz: 0.03 * k + g + 0.002, cx: x0 }, { y: wy + 0.03, rx: 0.022 * k + g + 0.003, rz: 0.032 * k + g + 0.003, cx: x0 }];
    sb.use(surf).add(loft(rr, { n: [12, 10, 7][lod], weights: W, capBot: 0.0, capTop: 0.0 }), darker(colr, 0.9));
  }
}

function castArm(sb, d, D, bi, lod, i, side, k, m) {
  const x0 = side * D.S, fb = i ? bi.foreL : bi.foreR, hb = i ? bi.handL : bi.handR;
  const rr = rangeYs(D.wristY - 0.06, D.elbowY - 0.03, 0.03).map((y) => ({ y, rx: 0.047 * k, rz: 0.05 * k, cx: x0, w: y < D.wristY - 0.01 ? hb : fb }));
  // plaster bandage over the forearm, from the knuckles to below the elbow
  sb.use('fabric').add(loft(rr, { n: [12, 9, 7][lod], capBot: 0.01, capTop: 0.01, weights: (v, r) => r.w, color: (v) => scl([1, 1, 1], 0.95 + 0.07 * Math.sin(v.y * 140 + v.th)) }), 0xeceae4);
  // sling: a pale band cradling the forearm (on the forearm bone only, closed ends)
  const sc = d.slingColor ?? 0xc2c6ca;
  const s0 = D.wristY + 0.07, s1 = D.elbowY - 0.025;
  const sr = rangeYs(s0, s1, 0.03).map((y, q, A) => { const e = Math.min(q, A.length - 1 - q) === 0 ? 0.92 : 1; return { y, rx: 0.058 * k * e, rz: 0.062 * k * e, cx: x0, w: fb }; });
  sb.use('fabric').add(loft(sr, { n: 12, capBot: 0.004, capTop: 0.004, w: fb }), sc);
  // the strap round the neck, built where it hangs in the cast pose (the arm's pose is fixed) and
  // carried by the chest alone: up from both ends of the sling, over the opposite shoulder and the
  // same-side shoulder, round the back of the neck
  if (!m) return;
  // (worked out once, in the rest pose at build time: a far level built later reuses it)
  if (!m._strap) {
    const F = castForearm(m, i), R = new THREE.Matrix4().copy(m.fores[i].matrixWorld).invert();
    const toPose = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(R).applyMatrix4(F).toArray();
    const out = -0.062 * k;   // the sling's outer side (away from the palm)
    const a0 = toPose(x0 + side * out * 0.2, s0 + 0.01, -0.05 * k), a1 = toPose(x0 + side * out * 0.2, s1 - 0.01, -0.05 * k);
    const nR = D.neckR, fz = D.frontZ(D.shoulderY - 0.06), bz = D.neckZ - nR - 0.012, ny = D.shoulderY + 0.045;
    const pts = [
      a0,
      [lerp(a0[0], -side * 0.07, 0.5), lerp(a0[1], D.shoulderY - 0.05, 0.6), Math.max(lerp(a0[2], fz, 0.6), D.frontZ(lerp(a0[1], D.shoulderY - 0.05, 0.6)) + 0.012)],
      [-side * (nR + 0.035), ny, D.neckZ + nR * 0.5],
      [-side * nR * 0.6, ny + 0.008, bz],
      [side * nR * 0.6, ny + 0.008, bz],
      [side * (nR + 0.035), ny, D.neckZ + nR * 0.5],
      [lerp(a1[0], side * 0.12, 0.5), lerp(a1[1], D.shoulderY - 0.04, 0.6), Math.max(lerp(a1[2], fz, 0.6), D.frontZ(lerp(a1[1], D.shoulderY - 0.04, 0.6)) + 0.012)],
      a1,
    ];
    const outs = pts.map((p) => { const dx = p[0], dz = p[2] - D.neckZ, l = Math.hypot(dx, dz) || 1; return [dx / l, 0.15, dz / l]; });
    m._strap = { pts, outs };
  }
  const { pts, outs } = m._strap;
  sb.use('fabric').add(sweep(pts, outs, { n: 4, steps: [28, 16, 10][lod], rx: () => 0.024 * k, rz: () => 0.0035, weights: () => [[bi.chest, 1]], capBot: 0.0, capTop: 0.0 }), sc);
}
// The forearm's matrix (model space, body at rest) in the cast pose: pose the skeleton, read it, reset.
function castForearm(m, i) {
  const P = new Float32Array(NCH);
  castPose(m, P);
  const bones = m.bones, saved = bones.map((b) => b.rotation.clone());
  for (let b = 0; b < NB; b++) bones[b].rotation.set(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
  m.root.updateMatrixWorld(true);
  const M = m.fores[i].matrixWorld.clone();
  bones.forEach((b, j) => b.rotation.copy(saved[j]));
  m.root.updateMatrixWorld(true);
  return M;
}

function legWeights(D, bi, i) {
  const th = i ? bi.thighL : bi.thighR, sh = i ? bi.shinL : bi.shinR;
  return (v) => {
    const y = v.y;
    if (y > D.hipY + 0.02) return [[bi.pelvis, 0.6], [th, 0.4]];
    if (y > D.hipY - 0.07) { const t = sstep(D.hipY + 0.02, D.hipY - 0.07, y); return [[bi.pelvis, 0.6 * (1 - t)], [th, 0.4 + 0.6 * t]]; }
    if (y > D.kneeY + 0.04) return [[th, 1]];
    if (y > D.kneeY - 0.04) { const t = sstep(D.kneeY + 0.04, D.kneeY - 0.04, y); return [[th, 1 - t], [sh, t]]; }
    return [[sh, 1]];
  };
}

function buildLegs(sb, d, D, bi, lod, bust) {
  const tr = d.trousers, c = d.coat;
  const suit = !!c.suit;
  const tb = suit ? 0.045 : TROUSERS[tr.type] ?? 0.006;
  const colr = suit ? c.color : tr.color;
  const S = D.S, Bd = D.build, k = D.k * Math.pow(Bd, 0.35), kl = D.k * Math.pow(Bd, 0.8);
  const hemY = D.hemY;
  D.legFrontZ = 0.09 * kl + tb;
  const n = [14, 10, 7][lod];
  // wherever a coat covers them, the trousers stay at least ~1 cm inside its surface
  const margin = 0.01 + (c.quilt ? 0.008 : 0);
  const inside = suit || !D.torsoAt ? null : (v) => {
    if (v.y < hemY - 0.004) return;
    const r = D.torsoAt(Math.min(v.y, D.shoulderY - 0.1)), cz = r.cz || 0, dz = v.z - cz;
    const th = Math.atan2(v.x / r.rx, dz / (dz >= 0 ? r.rzF : r.rzB));
    const [px, pz] = ringPt(r, th);
    const Rc = Math.hypot(px, pz - cz), Rv = Math.hypot(v.x, dz), lim = Rc - margin;
    if (Rv > lim) { const k = lim / Rv; v.x *= k; v.z = cz + dz * k; }
  };
  // seat
  if (hemY > D.hipY - 0.13) {
    const y1 = Math.min(hemY + 0.06, D.hipY + 0.16 * D.k);
    const keys = [
      { y: D.hipY - 0.09 * D.k, rx: (D.fem ? 0.92 : 0.8) * S * Bd + tb, rzF: 0.46 * S * Bd + tb, rzB: 0.52 * S * Bd + tb, p: 2.2 },
      { y: D.hipY - 0.04, rx: (D.fem ? 0.98 : 0.86) * S * Bd + tb, rzF: 0.5 * S * Bd + tb + (d.belly || 0) * 0.2, rzB: 0.6 * S * Bd + tb, p: 2.2 },
      { y: D.hipY + 0.03, rx: (D.fem ? 0.98 : 0.86) * S * Bd + tb, rzF: 0.52 * S * Bd + tb + (d.belly || 0) * 0.5, rzB: 0.58 * S * Bd + tb, p: 2.3 },
      { y: y1, rx: (D.fem ? 0.8 : 0.82) * S * Bd + tb, rzF: 0.53 * S * Bd + tb + (d.belly || 0) * 0.9, rzB: 0.5 * S * Bd + tb, p: 2.3 },
    ];
    const W = (v) => (v.y > D.hipY + 0.02 ? [[bi.pelvis, 1 - sstep(D.hipY + 0.02, D.spineY, v.y) * 0.5], [bi.spine, sstep(D.hipY + 0.02, D.spineY, v.y) * 0.5]] : [[bi.pelvis, 1]]);
    sb.use('fabric').add(loft(sampleRings(keys, rangeYs(keys[0].y, y1, [0.03, 0.045, 0.07][lod])), { n: [20, 14, 10][lod], weights: W, capBot: 0.01, capTop: 0.0, mod: inside }), colr);
  }
  const shoes = d.shoes || { type: 'shoes', color: 0x2a2420 };
  const tall = shoes.type === 'tall';
  for (const [i, side] of [[0, -1], [1, 1]]) {
    const x0 = side * D.hipX;
    const hemLow = bust ? D.kneeY - 0.06 : tall ? D.kneeY - 0.12 : D.ankleY + 0.03 * D.k;
    const fit = tr.type === 'jeans' ? 0.9 : tr.type === 'joggers' ? 0.95 : 1;
    const hemR = tr.type === 'joggers' ? 0.042 : tr.type === 'jeans' ? 0.05 : 0.057;
    const keys = [
      { y: hemLow, rx: hemR * D.k + tb, rzF: (hemR + 0.002) * D.k + tb, rzB: (hemR + 0.006) * D.k + tb, cx: x0 },
      { y: D.ankleY + 0.12 * D.k, rx: 0.047 * k * fit + tb, rz: 0.05 * k * fit + tb, cx: x0 },
      { y: D.kneeY - 0.13 * D.k, rx: 0.056 * k * fit + tb, rzF: 0.054 * k * fit + tb, rzB: 0.067 * k * fit + tb, cx: x0 },
      { y: D.kneeY - 0.02, rx: 0.055 * k * fit + tb, rz: 0.059 * k * fit + tb, cx: x0 },
      { y: D.kneeY + 0.07 * D.k, rx: 0.061 * kl * fit + tb, rz: 0.064 * kl * fit + tb, cx: x0 },
      { y: D.hipY - 0.13 * D.k, rx: 0.08 * kl + tb, rz: 0.084 * kl + tb, cx: x0 },
      { y: D.hipY - 0.04, rx: 0.088 * kl + tb, rzF: 0.09 * kl + tb, rzB: 0.095 * kl + tb, cx: x0 + side * 0.004 },
      { y: D.hipY + 0.05, rx: 0.08 * kl, rz: 0.088 * kl, cx: x0 - side * 0.014 },
    ].filter((r) => r.y >= hemLow - 1e-4);
    const ys = rangeYs(hemLow, D.hipY + 0.05, [0.03, 0.045, 0.07][lod]);
    const base = lin(colr);
    const color = (v) => {
      if (suit && c.reflect && Math.abs(v.y - (D.kneeY - 0.1 * D.k)) < 0.012) return lin(0xb8bcc0);
      if (tr.type === 'joggers' && v.y < hemLow + 0.03) return scl(base, 0.8);
      return base;
    };
    sb.use('fabric').add(loft(sampleRings(keys, ys), { n, weights: legWeights(D, bi, i), color, capBot: 0.0, capTop: 0.0, mod: inside }), 0xffffff);
    if (!bust) shoe(sb, d, D, bi, lod, i, side, shoes);
  }
}

function shoe(sb, d, D, bi, lod, i, side, s) {
  const type = s.type || 'shoes';
  const boot = type === 'boots' || type === 'winter' || type === 'tall';
  const L = D.footLen * (type === 'winter' ? 1.08 : boot ? 1.03 : 1);
  const k = L / 0.27, Wk = type === 'winter' ? 1.14 : type === 'sneakers' ? 1.06 : 1;
  const x0 = side * D.hipX, zH = -0.24 * L;
  const soleH = (type === 'winter' ? 0.03 : type === 'sneakers' ? 0.028 : 0.02) * Math.min(1, k + 0.15);
  const vk = Math.min(1, k + 0.1);
  const top = spline([[0, 0.068 * vk], [0.12, 0.082 * vk], [0.28, (boot ? 0.11 : 0.1) * vk], [0.45, 0.083 * vk], [0.65, 0.06 * vk], [0.85, 0.048 * vk], [1, 0.032 * vk]]);
  const hw = spline([[0, 0.028], [0.1, 0.034], [0.4, 0.038], [0.68, 0.046], [0.86, 0.044], [0.97, 0.032], [1, 0.018]]);
  const ss = [0, 0.04, 0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.92, 0.98, 1];
  const fb = i ? bi.footL : bi.footR, sh = i ? bi.shinL : bi.shinR;
  const M = new THREE.Matrix4().makeTranslation(x0, 0, 0).multiply(new THREE.Matrix4().makeRotationY(side * 0.1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, zH)).multiply(new THREE.Matrix4().makeRotationX(PI / 2));
  const upper = ss.map((u) => { const hc = (soleH + top(u)) / 2; return { y: u * L, rx: hw(u) * k * Wk, cz: -hc, rzF: hc - soleH + 0.004, rzB: top(u) - hc, pF: 5, pB: 2.3 }; });
  sb.use('leather').add(loft(upper, { n: [14, 10, 8][lod], capBot: 0.008, capTop: 0.008, w: fb }), s.color, M);
  const sole = ss.map((u) => ({ y: lerp(-0.006, L + 0.006, u), rx: hw(u) * k * Wk * 1.05 + 0.003, cz: -soleH / 2, rz: soleH / 2, p: 4 }));
  sb.add(loft(sole, { n: [12, 8, 6][lod], capBot: 0.004, capTop: 0.004, w: fb }), s.sole ?? (type === 'sneakers' ? 0xe8e6e0 : 0x24201c), M);
  if (boot) {
    const y1 = type === 'tall' ? D.kneeY - 0.05 : D.ankleY + (type === 'winter' ? 0.15 : 0.1) * D.k;
    const r = (type === 'winter' ? 0.062 : 0.052) * D.k;
    const rr = rangeYs(D.ankleY - 0.03, y1, 0.04).map((y) => ({ y, rx: r * (type === 'tall' && y > D.ankleY + 0.15 ? 1.12 : 1), rz: r * 1.12, cx: x0, cz: 0.006 }));
    const W = (v) => { const t = sstep(D.ankleY - 0.02, D.ankleY + 0.05, v.y); return [[fb, 1 - t], [sh, t]]; };
    sb.use('leather').add(loft(rr, { n: [12, 9, 7][lod], weights: W, capBot: 0.0, capTop: null }), s.color);
    if (type === 'winter') {
      const fr = [{ y: y1 - 0.02, rx: r + 0.008, rz: r * 1.12 + 0.008, cx: x0, cz: 0.006 }, { y: y1 + 0.015, rx: r + 0.006, rz: r * 1.12 + 0.006, cx: x0, cz: 0.006 }];
      sb.use('fabric').add(loft(fr, { n: [12, 9, 7][lod], w: sh, capTop: -0.01 }), s.trim ?? 0xd8d0c4);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Props, walking aids, the wheelchair, Rune's blanket

// A point in hand i's rest frame (u down the hand, w towards the thumb, t towards the palm side), in
// model space, and a box in that frame (sizes along t, u, w).
function handPt(D, i, u, w, t) { const k = D.hand / 0.19, side = i ? 1 : -1; return [side * D.S - side * t * k, D.wristY - u * k, w * k]; }
function handBox(sb, D, i, bone, color, u, w, t, st, su, sw) { const p = handPt(D, i, u, w, t), k = D.hand / 0.19; sb.box(color, bone, p[0], p[1], p[2], st, su * k, sw * k); }

function buildProps(sb, d, D, bi, lod) {
  const props = d.props || [];
  if (props.includes('note')) {
    // a small black notebook lying open on the left palm (8 mm: a thin black cover under a block of
    // paper, the page up), a little towards the fingers so the thumb lies on its edge
    sb.use('leather'); handBox(sb, D, 1, bi.note, 0x1c1a18, 0.1, -0.012, 0.0188, 0.0014, 0.096, 0.13);
    sb.use('fabric'); handBox(sb, D, 1, bi.note, 0xe6e0d0, 0.1, -0.012, 0.0226, 0.0062, 0.092, 0.126);
    sb.use('fabric'); handBox(sb, D, 1, bi.note, 0xf2eee4, 0.1, -0.012, 0.0258, 0.0004, 0.088, 0.122);
  }
  if (props.includes('pencil')) {
    // on the index finger's last joint: its point beyond the fingertip, the back end over the web of
    // the thumb (the pen grip curls the finger onto it and brings the thumb against it)
    const j = HAND.kn + HAND.pip, T_ = PENCIL.tip, Bk = PENCIL.back;
    const p0 = handPt(D, 0, j + Bk[0], Bk[1], Bk[2]), p2 = handPt(D, 0, j + T_[0], T_[1], T_[2]);
    const p1 = p0.map((v, q) => lerp(v, p2[q], 0.88));
    sb.use('lamp').tube(0xc89a2a, bi.pencil, p0, p1, 0.0036, 0.0036, 6, 0.2);
    sb.use('leather').tube(0xd8c0a0, bi.pencil, p1, p2, 0.0036, 0.001, 6, 0.1);
  }
  if (props.includes('phone')) {
    // in the right palm, screen out (towards the ear), the fingers along its back
    sb.use('lamp'); handBox(sb, D, 0, bi.phone, 0x141518, 0.097, -0.002, 0.0205, 0.0085, 0.146, 0.071);
  }
  if (props.includes('shovel')) {
    // a snow shovel (snöskovel) in the right hand, built in the hand's rest frame: the shaft along the
    // grip axis (w, towards the thumb) through the curled fingers, the blade end towards the thumb, a
    // T-grip 0.55 m the other way for the left hand; the blade's face towards the palm side, its width
    // across the fingers, bent ~17 deg flatter than the shaft, with a rim along its back edge
    const k = D.hand / 0.19, x0 = -D.S + 0.031 * k, y0 = D.wristY - 0.095 * k, b = bi.shovel;
    sb.use('leather').tube(0x8a6a44, b, [x0, y0, -0.57], [x0, y0, 0.36], 0.0155, 0.0155, 8, 0.3);
    sb.tube(0x1a1a1c, b, [x0, y0 - 0.06, -0.585], [x0, y0 + 0.06, -0.585], 0.014, 0.014, 8, 0.5);
    sb.tube(0x1a1a1c, b, [x0, y0, -0.57], [x0, y0, -0.5], 0.019, 0.017, 8, null);
    sb.use('lamp').tube(0x3a4656, b, [x0, y0, 0.33], [x0 + 0.02, y0, 0.42], 0.018, 0.022, 8, null);
    const a = 0.7, ca = Math.cos(a), sa = Math.sin(a), L = 0.32, W = 0.38;
    const bc = [x0 + 0.02 + sa * L * 0.5, y0, 0.42 + ca * L * 0.5];
    sb.box(0x3a4656, b, bc[0], bc[1], bc[2], 0.004, W, L, 0, a, 0);
    sb.box(0x2c3644, b, x0 + 0.02 + 0.018 * ca, y0, 0.42 - 0.018 * sa, 0.04, W, 0.006, 0, a, 0);
    for (const s2 of [-1, 1]) sb.box(0x2c3644, b, bc[0] + 0.012 * ca, y0 + s2 * W * 0.5, bc[2] - 0.012 * sa, 0.024, 0.005, L, 0, a, 0);
  }
  if (props.includes('wrench')) {
    // a combination spanner in the right fist (a bicycle's axle nut), its open end beyond the thumb
    const k = D.hand / 0.19, x0 = -D.S + 0.031 * k, y0 = D.wristY - 0.092 * k, b = bi.wrench;
    sb.use('lamp').box(0x9a9ca0, b, x0, y0, 0.05 * k, 0.006, 0.016, 0.17);
    sb.box(0x9a9ca0, b, x0, y0, 0.05 * k + 0.095, 0.007, 0.034, 0.026);
    sb.box(0x9a9ca0, b, x0, y0, 0.05 * k - 0.09, 0.007, 0.03, 0.028);
  }
  if (d.clipboard) {
    // carried at the side, pinched by its top edge: the edge in the web of the thumb, the fingers
    // along its outer face, the thumb over the edge on the inner face; the papers face the body
    sb.use('leather'); handBox(sb, D, 1, bi.clip, 0x6a4a30, 0.236, -0.006, 0.0155, 0.006, 0.31, 0.225);
    sb.use('fabric'); handBox(sb, D, 1, bi.clip, 0xf0eee8, 0.246, -0.006, 0.0196, 0.0024, 0.28, 0.2);
    sb.use('painted'); handBox(sb, D, 1, bi.clip, 0x8a8c8e, 0.096, -0.006, 0.0205, 0.007, 0.03, 0.07);
  }
  if (d.bag) {
    // a handbag on the left forearm
    const x = D.S + 0.04 * D.k, y = D.elbowY - 0.12;
    sb.use('leather').box(d.bag, bi.foreL, x + 0.03, y, 0.0, 0.08, 0.17, 0.26, 0, 0, 0);
    sb.tube(darker(d.bag, 0.7), bi.foreL, [x + 0.03, y + 0.085, -0.08], [x - 0.01, D.elbowY - 0.02, 0.0], 0.006, 0.006, 4, null);
    sb.tube(darker(d.bag, 0.7), bi.foreL, [x - 0.01, D.elbowY - 0.02, 0.0], [x + 0.03, y + 0.085, 0.08], 0.006, 0.006, 4, null);
  }
}

function buildAid(sb, d, D, bi, lod) {
  const k = D.k;
  if (d.aid === 'stick') {
    // the handle runs across the right palm, in the curled fingers; the shaft drops from its front end
    const h0 = handPt(D, 0, 0.095, 0.06, 0.031), h1 = handPt(D, 0, 0.098, -0.065, 0.031);
    sb.use('leather').tube(0x3a2618, bi.handR, h0, h1, 0.0115, 0.0105, 6, 0.4);
    sb.tube(0x3a2618, bi.handR, [h0[0], h0[1] + 0.006, h0[2] - 0.004], [h0[0], 0.012, h0[2] + 0.02], 0.011, 0.009, 6, 0.3);
    sb.sphere(0x141414, bi.handR, h0[0], 0.012, h0[2] + 0.02, 0.013, 0.012, 0.013, 0, 0, 0, 6, 4);
  }
  if (d.aid === 'rollator') {
    const fc = d.aidColor ?? 0x6a2228, a = bi.aid;
    const hy = 0.86 * k, hz = 0.27;
    sb.use('metal');
    for (const s of [-1, 1]) {
      const x = s * 0.24;
      sb.tube(fc, a, [x, 0.12, 0.2], [x, hy, hz], 0.012, 0.012, 6, null);
      sb.tube(fc, a, [x, 0.12, 0.64], [x, hy * 0.72, hz + 0.08], 0.012, 0.012, 6, null);
      sb.tube(fc, a, [x, hy, hz], [x, hy + 0.01, hz - 0.1], 0.012, 0.012, 6, 0.4);
      sb.tube(0x9a9a9e, a, [x, 0.1, 0.2], [x, 0.1, 0.64], 0.006, 0.006, 4, null);
    }
    sb.tube(fc, a, [-0.24, hy * 0.62, hz + 0.05], [0.24, hy * 0.62, hz + 0.05], 0.01, 0.01, 6, null);
    sb.use('leather');
    for (const s of [-1, 1]) {
      sb.tube(0x18181a, a, [s * 0.24, hy + 0.005, hz - 0.03], [s * 0.24, hy + 0.012, hz - 0.12], 0.016, 0.016, 6, 0.5);
      for (const z of [0.2, 0.64]) {
        const [g, M] = tubeGeo([s * 0.24 - 0.015, 0.1, z], [s * 0.24 + 0.015, 0.1, z], 0.1, 0.1, 12, 0.05);
        sb.add(g, 0x202022, M, a);
      }
    }
    sb.use('fabric').box(0x2a2a30, a, 0, hy * 0.64, hz + 0.1, 0.4, 0.025, 0.24);
  }
}

function buildWheelchair(sb, d, D, bi, lod) {
  const c = bi.chair, frame = 0x2c2e32;
  const seatY = 0.48;
  sb.use('fabric');
  sb.box(0x22242a, c, 0, seatY, 0.03, 0.44, 0.03, 0.42);
  sb.box(0x22242a, c, 0, seatY + 0.26, -0.2, 0.42, 0.38, 0.025, 0, -0.12, 0);
  sb.use('metal');
  for (const s of [-1, 1]) {
    const x = s * 0.225;
    sb.tube(frame, c, [x, seatY - 0.03, -0.21], [x, seatY - 0.03, 0.25], 0.012, 0.012, 6, null);
    sb.tube(frame, c, [x, seatY - 0.06, -0.21], [x, 0.93, -0.25], 0.012, 0.012, 6, null);
    sb.tube(frame, c, [x, 0.93, -0.25], [x, 0.95, -0.36], 0.012, 0.012, 6, null);
    sb.tube(frame, c, [x, seatY - 0.03, 0.25], [x, 0.16, 0.27], 0.012, 0.012, 6, null);
    sb.tube(frame, c, [x, seatY - 0.03, 0.22], [x - s * 0.04, 0.13, 0.42], 0.011, 0.011, 6, null);
    sb.tube(frame, c, [x, 0.69, -0.2], [x, 0.69, 0.16], 0.011, 0.011, 6, 0.6);
    sb.tube(frame, c, [x, 0.69, 0.12], [x, seatY - 0.03, 0.12], 0.01, 0.01, 6, null);
    sb.box(frame, c, s * 0.12, 0.115, 0.44, 0.15, 0.01, 0.12);
    sb.tube(0x8a8c90, c, [x, 0.3, -0.07], [s * 0.3, 0.3, -0.07], 0.012, 0.012, 6, null);
  }
  sb.tube(frame, c, [-0.225, seatY - 0.05, -0.15], [0.225, 0.2, 0.15], 0.01, 0.01, 6, null);
  sb.tube(frame, c, [0.225, seatY - 0.05, -0.15], [-0.225, 0.2, 0.15], 0.01, 0.01, 6, null);
  // rear wheels (turn with wheelR/wheelL), casters
  const tor = (R, r, seg = 24) => (GEO['t' + R + r + seg] ??= new THREE.TorusGeometry(R, r, 6, seg));
  for (const s of [-1, 1]) {
    const wb = s < 0 ? bi.wheelR : bi.wheelL, x = s * 0.3, y = 0.3, z = -0.07;
    sb.use('rubber').add(tor(0.285, 0.017, [32, 24, 16][lod]), 0x1a1a1a, mat(x, y, z, 0, PI / 2, 0), wb);
    sb.use('metal').add(tor(0.27, 0.007, [28, 20, 14][lod]), 0xb8bcc0, mat(x, y, z, 0, PI / 2, 0), wb);
    sb.add(tor(0.255, 0.006, [28, 20, 14][lod]), 0xc8ccd0, mat(x + s * 0.035, y, z, 0, PI / 2, 0), wb);
    for (let q = 0; q < 12; q++) {
      const a = (q / 12) * TAU;
      sb.tube(0xc0c4c8, wb, [x - s * 0.012, y, z], [x, y + Math.cos(a) * 0.265, z + Math.sin(a) * 0.265], 0.0022, 0.0022, 3, null);
    }
    for (let q = 0; q < 3; q++) sb.tube(0xb8bcc0, wb, [x + s * 0.004, y + Math.cos((q / 3) * TAU) * 0.255, z + Math.sin((q / 3) * TAU) * 0.255], [x + s * 0.035, y + Math.cos((q / 3) * TAU) * 0.255, z + Math.sin((q / 3) * TAU) * 0.255], 0.004, 0.004, 3, null);
    sb.tube(0x8a8c90, wb, [x - s * 0.03, y, z], [x + s * 0.03, y, z], 0.022, 0.022, 8, 0.2);
    const cb = s < 0 ? bi.casterR : bi.casterL, cx = s * 0.21, cy = 0.065, cz = 0.32;
    sb.use('rubber').add(tor(0.052, 0.014, 14), 0x1a1a1a, mat(cx, cy, cz, 0, PI / 2, 0), cb);
    sb.use('metal').tube(0x8a8c90, cb, [cx - 0.02, cy, cz], [cx + 0.02, cy, cz], 0.02, 0.02, 8, 0.2);
    sb.box(frame, c, cx, 0.13, 0.3, 0.035, 0.1, 0.02);
  }
}
// Rune's blanket, built in the standing rest pose so that seated it lies flat over the thighs, folds
// down over the knees and hangs in front of the shins to ~15 cm above the footrests, with its edges
// hanging over the sides of the thighs and soft vertical folds in the hanging part. A two-colour
// check (~12 cm) with thin light lines, as smooth bands so vertex colours cannot smear it.
function buildBlanket(sb, d, D, bi, lod) {
  const bl = d.blanket;
  const c1 = lin(bl.color), c2 = lin(bl.color2 ?? 0x2a3a5a), c3 = lin(0xd8c8a0);
  const y0 = D.kneeY - 0.25 * D.k, y1 = D.hipY + 0.04, kn = D.kneeY;
  const keys = [
    { y: y0, rx: D.hipX + 0.135, rzF: 0.112, rzB: 0.035, cz: 0.012, p: 2.5 },
    { y: kn - 0.12, rx: D.hipX + 0.128, rzF: 0.112, rzB: 0.04, cz: 0.01, p: 2.6 },
    { y: kn - 0.02, rx: D.hipX + 0.125, rzF: 0.118, rzB: 0.07, cz: 0.0, p: 2.7 },
    { y: kn + 0.12, rx: D.hipX + 0.13, rzF: 0.122, rzB: 0.095, cz: 0.0, p: 2.8 },
    { y: y1, rx: D.hipX + 0.12, rzF: 0.12, rzB: 0.09, cz: 0.0, p: 2.8 },
  ];
  const W = (v) => {
    const side = sstep(-0.06, 0.06, v.x);
    if (v.y > kn + 0.06) { const tp = sstep(D.hipY - 0.1, D.hipY + 0.04, v.y) * 0.5; return [[bi.thighR, (1 - side) * (1 - tp)], [bi.thighL, side * (1 - tp)], [bi.pelvis, tp]]; }
    const t = sstep(kn + 0.06, kn - 0.06, v.y);
    return [[bi.thighR, (1 - side) * (1 - t)], [bi.thighL, side * (1 - t)], [bi.shinR, (1 - side) * t], [bi.shinL, side * t]];
  };
  const P = 0.12, band = (u) => 0.5 + 0.5 * Math.cos((TAU * u) / P);
  const color = (v) => {
    const u = v.th * 0.21, w = v.y;
    let cc = c1;
    cc = mixc(cc, c2, 0.78 * sstep(0.6, 0.86, band(u)));
    cc = mixc(cc, c2, 0.78 * sstep(0.6, 0.86, band(w)));
    if (lod === 0) { cc = mixc(cc, c3, 0.55 * sstep(0.86, 0.97, band(u + P / 2))); cc = mixc(cc, c3, 0.55 * sstep(0.86, 0.97, band(w + P / 2))); }
    return scl(cc, 0.94 + 0.12 * vnoise(v.th * 30, v.y * 60, 3));
  };
  // soft folds in the hanging part, the fabric falling a little outwards at the bottom edge
  const mod = (v) => {
    const hang = sstep(kn - 0.03, kn - 0.2, v.y);
    const k = 1 + hang * (0.06 * Math.sin(v.th * 5 + 0.7) + 0.03 * Math.sin(v.th * 11)) * (v.c > -0.3 ? 1 : 0.3);
    v.x *= k; v.z = v.z * k;
  };
  sb.use('fabric').add(loft(sampleRings(keys, rangeYs(y0, y1, [0.015, 0.025, 0.045][lod])), { n: [32, 22, 14][lod], weights: W, color, mod, capBot: 0.0, capTop: 0.0 }), 0xffffff);
}

// ---------------------------------------------------------------------------------------------
// Definitions

// Normalise a character definition: fill in defaults, and accept the old cartoon defs (shirt,
// pants, hair as a string) by mapping them onto winter clothes.
const OLD_HAIR = { swoop: 'short', curly: 'curly', curlyLong: 'long', slick: 'slick', balding: 'balding', bun: 'bun', long: 'long', afro: 'curly', short: 'short', cap: 'short' };
function normDef(def) {
  const d = { ...def };
  const old = !def.coat && (def.shirt !== undefined || def.kind === 'monster' || def.kind === 'wizard' || def.kind === 'ghost');
  if (old) {
    const kid = def.kind === 'kid';
    d.age = d.age ?? (kid ? 11 : 40);
    d.height = d.height ?? (kid ? 1.45 : 1.76) * (def.scale || 1);
    d.sex = d.sex ?? 'm';
    d.skin = def.skin ?? 0xe8b898;
    const hs = typeof def.hair === 'string' ? def.hair : 'short';
    d.hair = { style: OLD_HAIR[hs] || 'short', color: def.hairC ?? 0x3a2a1e };
    if (hs === 'cap') d.hat = { type: 'cap', color: def.hairC ?? 0x2a2a2a };
    d.coat = { type: 'jacket', color: def.shirt ?? def.robe ?? def.fur ?? 0x3a4250 };
    d.trousers = { type: 'jeans', color: def.pants ?? 0x2a3040 };
    d.shoes = { type: 'shoes', color: def.shoes ?? 0x2a2420 };
    if (typeof def.glasses === 'number' && def.glasses) d.glasses = def.glasses;
    d.kind = kid ? 'kid' : 'adult';
  }
  d.kind = d.kind || (d.age !== undefined && d.age < 15 ? 'kid' : 'adult');
  d.age = d.age ?? (d.kind === 'kid' ? 9 : 38);
  d.height = d.height ?? (d.kind === 'kid' ? 1.35 : 1.75);
  d.sex = d.sex ?? 'm';
  d.skin = d.skin ?? 0xe8b898;
  d.hair = typeof d.hair === 'object' && d.hair ? d.hair : { style: 'short', color: 0x3a2a1e };
  const ct = d.coat?.type || 'jacket';
  d.coat = { ...COATS[ct], ...(d.coat || {}) };
  d.coat.type = ct;
  if (d.coat.suit) d.coat.reflect = d.coat.reflect ?? true;
  d.trousers = { type: 'slacks', color: 0x2e3038, ...(d.trousers || {}) };
  d.shoes = { type: 'shoes', color: 0x2a2420, ...(d.shoes || {}) };
  if (d.kind === 'wheelchair') d.wheelchair = true;
  // small children in padded snowsuits are nearly round
  if (d.kind === 'kid' && d.coat.type === 'snowsuit') d.build = Math.max(d.build || 1, lerp(1.1, 1.3, sstep(10, 3, d.age)));
  return d;
}

// One shared hair material for everyone (and the cat): matte, and its specular follows the hair's
// own colour, so dark hair can never Fresnel to white in a backlight or the portraits' rim light,
// while grey and fair hair keep a soft sheen. (TRI_SPECK is the surface shader's specular scale,
// gfx.js SURF_SPEC: F0 and F90 are multiplied by it; here an expression of the albedo.)
let HAIR_MAT = null;
function hairMat() {
  if (!HAIR_MAT) {
    HAIR_MAT = surfaceMaterial('hair', { snow: false, unique: true });
    HAIR_MAT.roughness = 0.52;
    HAIR_MAT.defines.TRI_SPECK = '( 0.2 + 0.7 * min( 1.0, dot( diffuseColor.rgb, vec3( 0.75 ) ) ) )';
  }
  return HAIR_MAT;
}
// ---------------------------------------------------------------------------------------------
// Hair and fur cards (p4r2; level 0 of the cast only). Close up, the shells' smooth outlines read as
// helmets and the fur trims as sausages: so the silhouettes get alpha-tested strips with a strand
// texture - edge cards hanging past a shell's lower edge (nape, over the ears, a fringe, the ends of
// a bob or of long hair, a beard's lower edge), fins standing up from the upper shell along the hair's
// flow (they show only where the surface turns away: the outline breaks into strands; seen face on
// they are edge-on), and two layers of tufts round a fur trim. They are one more SkinnedMesh on the
// same skeleton under level 0 (one draw call, main pass only: no shadow, not in the AO pre-pass,
// userData.noAO), double-sided by duplicated triangles (so both sides take the surface's normal, not
// a flipped one), shaded with the normal of the surface they grow from.
// The atlas: three 128-texel bands (hair: long fine strands; fuzz: sparse wisps for fins; fur: dense
// tufts, dark at the root), the root at the top of each band; mipmaps keep each band's coverage (an
// alpha test on plain box-filtered mips would thin the strands away with distance).
const CARD_W = 256, CARD_RH = 128;
const CARD_V = { fur: [0.004, 1 / 3 - 0.004], fuzz: [1 / 3 + 0.004, 2 / 3 - 0.004], hair: [2 / 3 + 0.004, 1 - 0.004] };
let CARD_TEX = null, CARD_MAT = null;
function cardTexture() {
  if (CARD_TEX) return CARD_TEX;
  const W = CARD_W, H = CARD_RH * 3, A = new Float32Array(W * H), Lw = new Float32Array(W * H), Wt = new Float32Array(W * H);
  const rnd = mulberry32(4242);
  // a strand in band b (0 fur, 1 fuzz, 2 hair) from x0 at the band's top (the root) down `len` texels
  const strand = (b, x0, len, wid, bend, bright, tipFade) => {
    const y1 = (b + 1) * CARD_RH - 1, n = Math.max(1, Math.ceil(len));
    for (let k = 0; k <= n; k++) {
      const t = k / n, y = y1 - k;
      if (y < b * CARD_RH) break;
      const xc = x0 + bend * t * t, hw = Math.max(0.5, wid * 0.5 * (1 - 0.6 * t));
      const fade = t > tipFade ? 1 - (t - tipFade) / (1 - tipFade) : 1, br = typeof bright === 'function' ? bright(t) : bright;
      for (let x = Math.floor(xc - hw - 1); x <= Math.ceil(xc + hw + 1); x++) {
        const a = clamp(hw + 0.5 - Math.abs(x + 0.5 - xc), 0, 1) * fade;
        if (a <= 0) continue;
        const i = y * W + (((x % W) + W) % W);
        A[i] = 1 - (1 - A[i]) * (1 - a); Lw[i] += a * br; Wt[i] += a;
      }
    }
  };
  for (let q = 0; q < 150; q++) strand(2, rnd() * W, CARD_RH * (0.5 + 0.5 * rnd()), 2.6 + 2.0 * rnd(), (rnd() - 0.5) * 22, 0.74 + 0.28 * rnd(), 0.7);
  for (let q = 0; q < 52; q++) strand(1, rnd() * W, CARD_RH * (0.35 + 0.65 * rnd()), 2.2 + 1.4 * rnd(), (rnd() - 0.5) * 40, 0.8 + 0.25 * rnd(), 0.6);
  for (let q = 0; q < 330; q++) { const b0 = 0.88 + 0.22 * rnd(); strand(0, rnd() * W, CARD_RH * (0.3 + 0.7 * rnd()), 3.0 + 2.2 * rnd(), (rnd() - 0.5) * 36, (t) => b0 * lerp(0.72, 1.1, t), 0.6); }
  // solid roots: the strip's root edge sinks into the surface it grows from
  for (const [b, rows] of [[2, 8], [1, 6], [0, 8]]) for (let y = (b + 1) * CARD_RH - rows; y < (b + 1) * CARD_RH; y++) for (let x = 0; x < W; x++) { const i = y * W + x; A[i] = 1; if (!Wt[i]) { Lw[i] = 0.75; Wt[i] = 1; } }
  // levels: box-filtered, alpha scaled per band so the share above the 0.5 test stays the same
  const levels = [];
  let w = W, h = H, a = A, lw = Lw, wt = Wt;
  const cover = (arr, w, h, b, k) => { let c = 0, n = 0; const y0 = Math.floor((b * h) / 3), y1 = Math.floor(((b + 1) * h) / 3); for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { n++; if (Math.min(1, arr[y * w + x] * k) >= 0.5) c++; } return n ? c / n : 0; };
  const cov0 = [0, 1, 2].map((b) => cover(A, W, H, b, 1));
  for (;;) {
    const data = new Uint8Array(w * h * 4), ks = [0, 1, 2].map((b) => {
      if (w === W) return 1;
      let lo = 1, hi = 8;
      for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (cover(a, w, h, b, mid) < cov0[b]) lo = mid; else hi = mid; }
      return hi;
    });
    for (let y = 0; y < h; y++) {
      const k = ks[Math.min(2, Math.floor((y * 3) / h))];
      for (let x = 0; x < w; x++) {
        const i = y * w + x, l = wt[i] > 0 ? lw[i] / wt[i] : 0.8;
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(clamp(l, 0, 1) * 255);
        data[i * 4 + 3] = Math.round(clamp(a[i] * k, 0, 1) * 255);
      }
    }
    levels.push({ data, width: w, height: h });
    if (w === 1 && h === 1) break;
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), a2 = new Float32Array(w2 * h2), l2 = new Float32Array(w2 * h2), t2 = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let sa = 0, sl = 0, st = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const xx = Math.min(w - 1, x * 2 + dx), yy = Math.min(h - 1, y * 2 + dy), i = yy * w + xx; sa += a[i]; sl += lw[i]; st += wt[i]; }
      const i = y * w2 + x; a2[i] = sa / 4; l2[i] = sl; t2[i] = st;
    }
    w = w2; h = h2; a = a2; lw = l2; wt = t2;
  }
  const tex = new THREE.DataTexture(levels[0].data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return (CARD_TEX = tex);
}
// The cards' material: the shared hair material's look (specular following the albedo) with the
// strand atlas as map, alpha-tested with alpha to coverage (soft strand edges under MSAA, like the
// world's twig cards; without MSAA a plain cut-out).
function cardMat() {
  if (CARD_MAT) return CARD_MAT;
  const m = surfaceMaterial('hair', { snow: false, unique: true });
  m.map = cardTexture();
  m.alphaTest = 0.3;
  m.alphaToCoverage = true;
  m.roughness = 0.55;
  m.defines.TRI_SPECK = '( 0.2 + 0.7 * min( 1.0, dot( diffuseColor.rgb, vec3( 0.75 ) ) ) )';
  m.needsUpdate = true;
  return (CARD_MAT = m);
}
// Cards collected for one SkinBuilder part: strips from a root edge along a direction.
class CardBatch {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.idx = []; this.n = 0; }
  // root p, unit dir, length len, unit across ax, width w, bend (a vector reached at the tip, x t^2),
  // shading normal nrm, band kind ('hair' | 'fuzz' | 'fur'), u0 + du of the atlas, colour c (rgb
  // multiplier), weights wts ([[bone, w], ...]), seg segments, taper (the tip's width share).
  card(p, dir, len, ax, w, bend, nrm, kind, u0, du, c, wts, seg = 2, taper = 0.8) {
    const [v0, v1] = CARD_V[kind], base = this.n;
    for (let q = 0; q <= seg; q++) {
      const t = q / seg, hw = w * 0.5 * lerp(1, taper, t), b = t * t;
      for (const sd of [-1, 1]) {
        this.pos.push(p[0] + dir[0] * len * t + bend[0] * b + ax[0] * hw * sd, p[1] + dir[1] * len * t + bend[1] * b + ax[1] * hw * sd, p[2] + dir[2] * len * t + bend[2] * b + ax[2] * hw * sd);
        this.nrm.push(nrm[0], nrm[1], nrm[2]);
        this.uv.push(u0 + du * (sd + 1) * 0.5, lerp(v1, v0, t));
        this.col.push(c[0], c[1], c[2]);
        for (let k = 0; k < 4; k++) { this.si.push(wts[k] ? wts[k][0] : 0); this.sw.push(wts[k] ? wts[k][1] : 0); }
        this.n++;
      }
    }
    for (let q = 0; q < seg; q++) {
      const a = base + q * 2;
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // (weights normalised: a card's weights may not sum to 1)
    for (let i = 0; i < this.n; i++) { let t = 0; for (let k = 0; k < 4; k++) t += this.sw[i * 4 + k]; for (let k = 0; k < 4; k++) this.sw[i * 4 + k] /= t || 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.userData.faceUV = true;
    return g;
  }
}
const _c1 = [0, 0, 0], _c2 = [0, 0, 0], _c3 = [0, 0, 0], _cn = [0, 0, 0], _ca = [0, 0, 0], _cb = [0, 0, 0];
const v3sub = (a, b, o) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
const v3norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
const v3cross = (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
// Cards on a hair shell (shellMesh's geometry, model space; its grid in userData.grid), into the
// character's card builder D.cards (level 0 only). o: { col (hex), wts, seed,
//   edge: { over (m past the edge), rows (how far up the root sits), curl (towards the head, m),
//           every, w (width x column spacing), keep(th, h) },
//   fins: { h (m), len (m along the flow), lean, from (row share), every, keep(th, h) } }.
function shellCards(D, g, o) {
  if (!D.cards || !g.userData.grid) return;
  const gr = g.userData.grid, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color?.array;
  const { R, J, per, ths, hs } = gr, r0 = gr.tuck ? 1 : 0, cb = new CardBatch(), rnd = mulberry32(((o.seed ?? 1) * 7919) | 0);
  // (weights: o.wts for everything, or each card the weights of the vertex it grows from)
  const SI = g.attributes.skinIndex?.array, SW = g.attributes.skinWeight?.array;
  const wAt = (r, j) => { if (o.wts || !SI) return o.wts ?? [[0, 1]]; const k = r * J + (((j % J) + J) % J); return [0, 1, 2, 3].map((q) => [SI[k * 4 + q], SW[k * 4 + q]]); };
  const get = (r, j, out, arr = P) => { const k = (r * J + (((j % J) + J) % J)) * 3; out[0] = arr[k]; out[1] = arr[k + 1]; out[2] = arr[k + 2]; return out; };
  const colAt = (r, j, k) => { if (!C) return [k, k, k]; const i = (r * J + j) * 3; return [C[i] * k, C[i + 1] * k, C[i + 2] * k]; };
  const jn = per ? J : J - 1;
  const e = o.edge;
  if (e && R > r0 + 2) {
    const rr = Math.min(R - 1, r0 + (e.rows ?? 1));
    for (let j = 0; j < jn; j += e.every ?? 1) {
      if (e.keep && !e.keep(ths[j], hs[r0 * J + j])) continue;
      for (let layer = 0; layer < (e.layers ?? 2); layer++) {
        const f = rnd(), j2 = j + 1;
        // root (rr rows up) and the edge point, between columns j and j+1
        get(rr, j, _c1); get(rr, j2, _c2); const root = [lerp(_c1[0], _c2[0], f), lerp(_c1[1], _c2[1], f), lerp(_c1[2], _c2[2], f)];
        get(r0, j, _c1); get(r0, j2, _c2); const edge = [lerp(_c1[0], _c2[0], f), lerp(_c1[1], _c2[1], f), lerp(_c1[2], _c2[2], f)];
        get(rr, j, _cn, N); get(rr, j2, _c3, N); const n = v3norm([lerp(_cn[0], _c3[0], f), lerp(_cn[1], _c3[1], f), lerp(_cn[2], _c3[2], f)]);
        get(r0, j, _c1); get(r0, j2, _c2); const sp = Math.hypot(_c2[0] - _c1[0], _c2[1] - _c1[1], _c2[2] - _c1[2]) || 0.01;
        const dir = v3norm(v3sub(edge, root, [0, 0, 0])), dl = Math.hypot(edge[0] - root[0], edge[1] - root[1], edge[2] - root[2]);
        const ax = v3norm(v3cross(n, dir, [0, 0, 0]));
        const lift = 0.0012 + 0.001 * layer;
        root[0] += n[0] * lift; root[1] += n[1] * lift; root[2] += n[2] * lift;
        const vr = e.vary ?? 0.6, over = e.over * (1 - vr * 0.45 + vr * rnd()) * (layer ? 0.75 : 1), curl = (e.curl ?? 0.003) * (0.6 + 0.8 * rnd());
        // (the colour from a few rows up: the shell's own edge is darkened as in its own shadow)
        cb.card(root, dir, dl + over, ax, sp * (e.w ?? 1.8) * (0.8 + 0.4 * rnd()), [-n[0] * curl, -n[1] * curl - (e.droop ?? 0), -n[2] * curl], n, 'hair', rnd(), 0.28 + 0.14 * rnd(), colAt(Math.min(R - 1, r0 + 4), j, (0.78 + 0.2 * rnd()) * (layer ? 0.92 : 1) * (e.bright ?? 1)), wAt(rr, j), e.seg ?? 3, 0.8);
      }
    }
  }
  const fn = o.fins;
  if (fn) {
    const rs = Math.max(r0 + 1, Math.floor(R * (fn.from ?? 0.3)));
    for (let r = rs; r < R - 1; r++) for (let j = (r & 1) * Math.max(1, (fn.every ?? 2) >> 1); j < jn; j += fn.every ?? 2) {
      const th = ths[j], h = hs[r * J + j];
      if (fn.keep && !fn.keep(th, h)) continue;
      get(r, j, _c1); get(r, j, _cn, N); get(r - 1, j, _c2);
      const flow = v3norm(v3sub(_c2, _c1, [0, 0, 0])), n = [_cn[0], _cn[1], _cn[2]];
      const lean = fn.lean ?? 0.8, dir = v3norm([n[0] + flow[0] * lean, n[1] + flow[1] * lean, n[2] + flow[2] * lean]);
      const L = fn.len * (0.75 + 0.5 * rnd()), Hh = fn.h * (0.6 + 0.7 * rnd());
      const root = [_c1[0] - n[0] * 0.002 - flow[0] * L * 0.2, _c1[1] - n[1] * 0.002 - flow[1] * L * 0.2, _c1[2] - n[2] * 0.002 - flow[2] * L * 0.2];
      // (a little darker than the shell: lit like it, they would read as grey flecks over it)
      cb.card(root, dir, Hh, flow, L, [flow[0] * Hh * 0.3, flow[1] * Hh * 0.3, flow[2] * Hh * 0.3], n, 'fuzz', rnd(), 0.22 + 0.12 * rnd(), colAt(r, j, 0.68 + 0.2 * rnd()), wAt(r, j), 1, 0.9);
    }
  }
  if (cb.n) D.cards.use('hair').add(cb.geometry(), o.col);
}

// Fur round a swept tube (a parka's hood trim): two layers of tufts standing out of the half of the
// tube that faces away from the body (its normal not pointing down into the coat), leaning up and
// along. g: sweep()'s geometry (steps + 1 rings of n vertices); o: { col, len, seed, out(p) ->
// whether a point's normal faces out }.
function tubeFurCards(D, g, n, o) {
  if (!D.cards) return;
  const P = g.attributes.position.array, N = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array;
  const rings = Math.floor((P.length / 3 - 2) / n), cb = new CardBatch(), rnd = mulberry32(((o.seed ?? 1) * 7) | 0);
  const cen = (s, out) => { out[0] = out[1] = out[2] = 0; for (let j = 0; j < n; j++) { const k = (s * n + j) * 3; out[0] += P[k] / n; out[1] += P[k + 1] / n; out[2] += P[k + 2] / n; } return out; };
  for (let s = 0; s < rings; s++) {
    cen(Math.max(0, s - 1), _ca); cen(Math.min(rings - 1, s + 1), _cb);
    const tan = v3norm(v3sub(_cb, _ca, [0, 0, 0]));
    const endK = sstep(0, 2.5, Math.min(s, rings - 1 - s));   // thinner towards the tube's ends
    for (let j = 0; j < n; j++) {
      const k = s * n + j, nn = [N[k * 3], N[k * 3 + 1], N[k * 3 + 2]];
      if (nn[1] < -0.45) continue;
      for (let layer = 0; layer < 3; layer++) {
        if (rnd() > 0.85 * endK + 0.15) continue;
        const sd = (rnd() - 0.5) * 0.9, up = layer === 2 ? 0.6 : layer ? 0.4 : 0.2;
        const dir = v3norm([nn[0] + tan[0] * sd, nn[1] + tan[1] * sd + up, nn[2] + tan[2] * sd]);
        const len = o.len * (layer === 2 ? 1.0 + 0.35 * rnd() : layer ? 0.8 + 0.25 * rnd() : 0.6 + 0.2 * rnd()) * lerp(0.6, 1, endK);
        const root = [P[k * 3] - nn[0] * 0.008, P[k * 3 + 1] - nn[1] * 0.008, P[k * 3 + 2] - nn[2] * 0.008];
        // (mostly along the tube, turned a little: a fin across it would read as a cross)
        const tw = (rnd() - 0.5) * 1.0, ac = v3norm(v3cross(dir, tan, [0, 0, 0]));
        const ax = v3norm([tan[0] + ac[0] * tw, tan[1] + ac[1] * tw, tan[2] + ac[2] * tw]);
        const wts = [0, 1, 2, 3].map((q) => [SI[k * 4 + q], SW[k * 4 + q]]);
        const c = (0.84 + 0.3 * rnd()) * (layer ? 1.05 : 0.95);
        cb.card(root, dir, len, ax, len * (0.8 + 0.4 * rnd()), [0, -len * 0.25, 0], nn, 'fur', rnd(), 0.25 + 0.12 * rnd(), [c, c, c], wts, 2, 0.85);
      }
    }
  }
  D.cards.use('hair').add(cb.geometry(), o.col);
}

// The cast's eyes (and phone, pencil): the 'lamp' surface with a thinner clear coat, its base
// specular following the albedo, so dark irises stay brown instead of mirroring the sky grey.
let EYE_MAT = null;
function eyeMat() {
  if (!EYE_MAT) {
    EYE_MAT = surfaceMaterial('lamp', { snow: false, unique: true });
    EYE_MAT.clearcoat = 0.45; EYE_MAT.roughness = 0.18;
    EYE_MAT.defines.TRI_SPECK = '( 0.25 + 0.75 * min( 1.0, dot( diffuseColor.rgb, vec3( 1.2 ) ) ) )';
  }
  return EYE_MAT;
}

// The cast. Old Bigmouth keys stay as aliases below so old code keeps booting.
export const CHARS = {
  ove: {
    name: 'Ove', kind: 'adult', sex: 'm', age: 59, height: 1.75, build: 1.3, belly: 0.07, skin: 0xd6a080,
    hair: { style: 'crew', color: 0x9a968e, recede: 0.55 }, brows: 0x5e5a54, browStyle: 'heavy', frown: 1.4, eyes: 0x4e5e6c,
    face: { jaw: 1.12, chin: 1.05, nose: 1.12, noseW: 1.1, hump: 0.5, tip: -0.3, brow: 1.45, cheek: 0.85, width: 1.04, lips: 0.72, mouthW: 0.97, eye: 0.92, old: 0.18, rosy: 1.0, oil: 0.95, cold: 1.15, smile: -0.2 }, beard: { style: 'stubble', color: 0x8a8680 },
    coat: { type: 'jacket', color: 0x1d2636, len: 0.48, collar: 'stand', cuffs: 0x161c28, zipColor: 0x101318 },
    trousers: { type: 'slacks', color: 0x55575c }, shoes: { type: 'shoes', color: 0x5a3a24, sole: 0x2a2018 },
    props: ['note', 'pencil', 'phone', 'shovel', 'wrench'], voice: 150, style: { swing: 0.85, lean: 0.03, old: 0.6 },
  },
  parvaneh: {
    name: 'Parvaneh', kind: 'adult', sex: 'f', age: 32, height: 1.64, build: 1.0, pregnant: true, skin: 0xb98466,
    hair: { style: 'long', color: 0x2a1c14 }, brows: 0x2a1e18, browStyle: 'thin', eyes: 0x3a2416,
    face: { lips: 1.05, nose: 1.02, noseW: 0.92, hump: 0.3, tip: 0.1, cheek: 1.15, width: 0.94, jaw: 0.95, chin: 0.95, eye: 1.08, rosy: 0.6 },
    coat: { type: 'wool', color: 0x8e4428, len: 0.86 }, scarf: { color: 0xb88a3a, color2: 0x6a2a20, bulk: 0.7, style: 'loop' },
    trousers: { type: 'jeans', color: 0x23252c }, shoes: { type: 'tall', color: 0x2a1e18 }, gloves: 0x3a2418,
    props: ['phone'], voice: 330, style: { swing: 0.9, lean: -0.05, sway: 1.3 },
  },
  patrick: {
    name: 'Patrick', kind: 'adult', sex: 'm', age: 34, height: 1.95, build: 0.86, skin: 0xe2b394,
    hair: { style: 'short', color: 0x7a5c3e }, beard: { style: 'short', color: 0x6e5034 }, glasses: 0x24221f, eyes: 0x5a7690,
    face: { width: 0.9, jaw: 0.95, nose: 1.12, noseW: 0.9, hump: 0.2, noseY: -0.01, lips: 0.95, freckles: 0.3, cold: 1.1, smile: 0.25 },
    hat: { type: 'beanie', color: 0x34465a },
    coat: { type: 'parka', color: 0xb4aa92, len: 0.72, fur: 0x7a6c5c, zipColor: 0x6a604e },
    trousers: { type: 'jeans', color: 0x343c4a }, shoes: { type: 'boots', color: 0x5e4028 },
    props: ['phone'], voice: 260, style: { swing: 1.15, stride: 1.06 },
  },
  sara: {
    name: 'Sara', kind: 'kid', sex: 'f', age: 7, height: 1.22, skin: 0xc49170,
    hair: { style: 'pony', color: 0x22180f }, eyes: 0x3a2416, face: { eye: 1.05, tip: 0.3 },
    hat: { type: 'pom', color: 0xe4dad2, color2: 0xc06a80 },
    coat: { type: 'snowsuit', color: 0xc77a92 }, mittens: 0x9a4a62,
    shoes: { type: 'winter', color: 0x3a2a36, trim: 0xd8ccd0 }, voice: 520, style: { swing: 1.1, bounce: 1.3 },
  },
  nasanin: {
    name: 'Nasanin', kind: 'kid', sex: 'f', age: 3, height: 0.95, skin: 0xc69474,
    hair: { style: 'short', color: 0x22180f }, eyes: 0x3a2416, face: { eye: 1.06, tip: 0.4, rosy: 1.2 },
    hat: { type: 'pom', color: 0xb0322c, color2: 0xece4dc },
    coat: { type: 'snowsuit', color: 0xa8302a }, mittens: 0x7a2420,
    shoes: { type: 'winter', color: 0x2a2a30, trim: 0xd0c8c0 }, voice: 600, style: { swing: 1.2, bounce: 1.4 },
  },
  jimmy: {
    name: 'Jimmy', kind: 'adult', sex: 'm', age: 25, height: 1.8, build: 1.42, belly: 0.1, skin: 0xe2b293,
    hair: { style: 'messy', color: 0x6a4a2c }, eyes: 0x4a5a3a,
    // the three young men apart: Jimmy round and soft (a wide jaw, a short upturned nose, raised brows
    // over a soft brow, a small chin, a smile, ruddy and oily); Adrian lean and angular; Vita skjortan narrow and long
    face: { fat: 1, jaw: 1.16, width: 1.08, chin: 0.88, nose: 0.8, noseW: 1.08, noseY: 0.014, tip: 0.6, brow: 0.65, browY: 0.008, browArch: 1.2, eye: 0.9, lips: 1.15, mouthW: 1.04, smile: 0.7, rosy: 1.35, freckles: 0.6, oil: 1.35, cold: 1.15 },
    coat: { type: 'jacket', color: 0x2a3a2e, len: 0.42, open: true, under: 0x7e8084, collar: 'hood', hoodColor: 0x7e8084, pockets: true },
    trousers: { type: 'jeans', color: 0x2a3448 }, shoes: { type: 'sneakers', color: 0xe8e8e4, sole: 0xf0f0ec },
    voice: 240, style: { sway: 1.7, swing: 0.8 },
  },
  adrian: {
    name: 'Adrian', kind: 'adult', sex: 'm', age: 19, height: 1.79, build: 0.9, skin: 0xc89676,
    hair: { style: 'short', color: 0x241a12 }, eyes: 0x3a2a1e, beard: null, brows: 0x1c140e, browStyle: 'heavy',
    face: { width: 0.88, jaw: 0.98, chin: 1.14, cheek: 1.3, cheekY: 0.015, nose: 1.1, noseW: 0.9, noseY: -0.006, hump: 0.35, tip: -0.05, brow: 1.2, browY: -0.009, browArch: 0.45, eye: 1.0, lips: 1.12, mouthW: 0.94, eyeX: 0.003, rosy: 0.7, oil: 1.25 },
    hat: { type: 'cap', color: 0x1e1e22 },
    coat: { type: 'bomber', color: 0x3c4434, hem: 0x262624, cuffs: 0x262624 },
    trousers: { type: 'joggers', color: 0x1e1e22 }, shoes: { type: 'sneakers', color: 0xe6e4de, sole: 0xf2f0ea },
    voice: 300, style: { pockets: true, bounce: 1.2 },
  },
  anita: {
    name: 'Anita', kind: 'adult', sex: 'f', age: 74, height: 1.6, build: 1.06, skin: 0xdfb398,
    hair: { style: 'bob', color: 0xb4b0aa }, eyes: 0x5a6878, brows: 0x8a8278, face: { cheek: 1.05, lips: 0.85, nose: 1.0, noseW: 0.95, width: 0.97, tip: -0.2, old: 0.05 },
    coat: { type: 'wool', color: 0x4a525c, len: 0.82, buttonColor: 0x1e1e1e }, under: 0x8a3a3a,
    trousers: { type: 'slacks', color: 0x34343a }, shoes: { type: 'boots', color: 0x2a2420 }, gloves: 0x4a2e22, bag: 0x5a3a24,
    voice: 360, style: { stoop: 0.5, stride: 0.78, swing: 0.6 },
  },
  rune: {
    name: 'Rune', kind: 'wheelchair', sex: 'm', age: 77, height: 1.76, build: 1.0, skin: 0xd8a88c,
    hair: { style: 'balding', color: 0xd2cec6 }, brows: 0xb8b4ac, eyes: 0x5e6c78, face: { nose: 1.28, noseW: 1.15, jaw: 0.95, cheek: 0.8, lips: 0.72, hump: 0.7, tip: -0.5, noseY: -0.012, width: 0.95, ear: 1.15, eye: 0.9, cold: 1.2 }, beard: { style: 'stubble', color: 0xc8c4bc },
    hat: { type: 'flatcap', color: 0x544e44 },
    coat: { type: 'quilted', color: 0x3e443a, len: 0.4 }, scarf: { color: 0x4a4038, style: 'tucked', bulk: 0.6 }, blanket: { color: 0x7a2a24, color2: 0x24344e },
    trousers: { type: 'slacks', color: 0x4a4440 }, shoes: { type: 'shoes', color: 0x2a2018 },
    voice: 170, style: { stoop: 0.6 },
  },
  anders: {
    name: 'Anders', kind: 'adult', sex: 'm', age: 45, height: 1.84, build: 1.0, skin: 0xd49a78,
    hair: { style: 'slick', color: 0xa88a5a, recede: 0.2 }, eyes: 0x5a7a9a, sunglassesOnHead: true, face: { jaw: 1.14, chin: 1.15, cheek: 1.2, nose: 1.05, noseW: 0.92, lips: 0.88, mouthW: 1.05, eye: 0.98, smile: 0.35, oil: 1.2, cold: 0.8 },
    coat: { type: 'wool', color: 0xa07e52, len: 0.96, buttonColor: 0x3a2a1a }, scarf: { color: 0x262c3a, style: 'two', long: true, bulk: 0.75 },
    trousers: { type: 'slacks', color: 0x2a2e38 }, shoes: { type: 'shoes', color: 0x4a2818 }, gloves: 0x3a2418,
    voice: 230, style: { lean: -0.03, swing: 0.95 },
  },
  vitskjorta: {
    name: 'Vita skjortan', kind: 'adult', sex: 'm', age: 38, height: 1.8, build: 0.95, skin: 0xe6c0a4,
    hair: { style: 'side', color: 0x4e3e2c, recede: 0.42 }, eyes: 0x4a5a6a, browStyle: 'thin',
    face: { rosy: 1.4, width: 0.9, jaw: 0.82, chin: 0.76, nose: 1.2, noseW: 0.82, noseY: -0.02, tip: -0.12, brow: 0.7, browY: 0.015, browArch: 1.45, lips: 0.74, mouthW: 0.86, smile: -0.3, eye: 0.9, eyeX: -0.008, old: 0.08, oil: 1.05 },
    coat: { type: 'shirt', color: 0xeeeeea, belt: 0x161616 }, tie: 0x24304a,
    trousers: { type: 'slacks', color: 0x26282e }, shoes: { type: 'shoes', color: 0x121212 }, clipboard: true,
    voice: 280, style: { swing: 0.5, stiff: 1 },
  },
};
CHARS.patrickCast = { ...CHARS.patrick, name: 'Patrick', cast: 'R', props: [] };
for (const k of Object.keys(CHARS)) CHARS[k].scale = CHARS[k].scale ?? CHARS[k].height / 1.78;
// Old keys from the Bigmouth copy, so the old main.js / missions keep booting.
Object.assign(CHARS, {
  nick: CHARS.ove, andrew: CHARS.patrick, jessi: CHARS.parvaneh, jay: CHARS.adrian, steve: CHARS.anders,
  maurice: CHARS.jimmy, connie: CHARS.anita, duke: CHARS.rune, shame: CHARS.vitskjorta,
});

// ---------------------------------------------------------------------------------------------
// Pedestrians: Swedes in November, all ages, muted Scandinavian palette.

const P_SKIN = [0xdcb29a, 0xe0b294, 0xd9a98a, 0xdcb096, 0xd5a184, 0xcb9576, 0xbc8564, 0xa47050, 0x86563a, 0x63402c, 0xdab098, 0xdcae92];
const P_HAIR = [0xc8b088, 0xa8885a, 0x8a6a46, 0x5e4430, 0x3a2a1e, 0x1e1612, 0x2a1e16, 0x9a6a3e, 0xb89a6a, 0x6e5a48];
const P_GREY = [0xd0ccc4, 0xb8b4ae, 0x9e9a94, 0xe2ded6];
const P_COAT = [0x1e1e22, 0x2a2c30, 0x23304a, 0x1c2638, 0x2e3a30, 0x3e4434, 0x4a4a46, 0x5a5e62, 0x6e4a2e, 0xa07e52, 0x5a2a2a, 0x7a3a2a, 0x3a4a5a, 0x5e6a74, 0x8a8478, 0xb4aa92, 0x34465a, 0x4a3a4a, 0x8e6a2a, 0x2a3e44];
const P_HAT = [0x1e1e22, 0x3a3a40, 0x6a2a2a, 0x2a3a5a, 0x8a8478, 0xd8d0c4, 0x4a5a3a, 0x8e6a2a, 0x5a5e62, 0xa04a3a, 0x2e4a54];
const P_SCARF = [0x8a2a24, 0xb88a3a, 0x2a3a5a, 0x6a6a6a, 0xd0c8b8, 0x3a5a4a, 0x5a2a3a, 0x9a5a2a, 0x1e1e22];
const P_TROUS = [0x1e1e22, 0x23252c, 0x2a3448, 0x343c4a, 0x3a3a3c, 0x4a4844, 0x5a564e, 0x2a2e38];
const P_SHOE = [0x1a1816, 0x2a2018, 0x3a2618, 0x4a3020, 0x2a2a2e, 0x5a4030];
const P_KID = [0x2a5a8a, 0xb0322c, 0xc77a92, 0x3a6a4a, 0xd89a2a, 0x5a3a7a, 0x2a2a3a, 0x4a7a9a, 0x8a3a5a];
const P_EYES = [0x3a2416, 0x4a3424, 0x5a6e80, 0x6a7a6a, 0x4a5a6a, 0x2a1e14];

export function randomPed(r = Math.random) {
  const u = r();
  const age = u < 0.12 ? 3 + Math.floor(r() * 10) : u < 0.2 ? 13 + Math.floor(r() * 6) : u < 0.75 ? 19 + Math.floor(r() * 46) : 65 + Math.floor(r() * 25);
  const sex = r() < 0.5 ? 'f' : 'm';
  const kid = age < 13;
  const old = age >= 65;
  const fem = sex === 'f';
  const height = kid ? 0.9 + (age - 3) * 0.06 + r() * 0.06 : age < 16 ? 1.55 + r() * 0.15 : (fem ? 1.6 + r() * 0.14 : 1.72 + r() * 0.16) - (old ? 0.03 : 0);
  const skin = pick(P_SKIN, r);
  const darkSkin = P_SKIN.indexOf(skin) >= 7 && P_SKIN.indexOf(skin) <= 9;
  const hairC = old ? pick(P_GREY, r) : darkSkin ? pick([0x1e1612, 0x2a1e16, 0x1a1412], r) : pick(P_HAIR, r);
  const d = {
    name: 'ped', kind: kid ? 'kid' : 'adult', sex, age, height, scale: height / 1.78, skin, eyes: pick(P_EYES, r),
    build: kid ? 1 : 0.86 + r() * 0.3 + (age > 40 ? r() * 0.12 : 0),
    face: { jaw: 0.9 + r() * 0.22, nose: 0.85 + r() * 0.38, noseW: 0.88 + r() * 0.26, hump: r() * r() * 0.8, tip: (r() - 0.5) * 0.8, chin: 0.9 + r() * 0.22, cheek: 0.85 + r() * 0.35, width: 0.93 + r() * 0.14, lips: 0.8 + r() * 0.4, eye: 0.92 + r() * 0.16, rosy: 0.5 + r() * 0.7 },
    voice: kid ? 420 + r() * 140 : fem ? 280 + r() * 120 : 150 + r() * 110,
    style: { swing: 0.7 + r() * 0.5, stride: (old ? 0.75 : 0.9) + r() * 0.2, stoop: old ? 0.3 + r() * 0.5 : 0, pockets: !kid && r() < 0.18, bounce: kid ? 1.3 : 1, lean: (r() - 0.5) * 0.05 },
  };
  d.belly = !kid && !fem && age > 35 ? r() * 0.06 : 0;
  if (kid) {
    d.hair = { style: fem ? pick(['pony', 'long', 'bob'], r) : pick(['short', 'messy'], r), color: hairC };
    if (d.hair.style === 'long' && r() < 0.6) d.hair.style = 'pony';
    d.hat = { type: r() < 0.7 ? 'pom' : 'beanie', color: pick(P_KID.concat(P_HAT), r), color2: pick([0xece4dc, 0xd8d0c4, 0x2a2a3a, 0xc06a80], r) };
    d.coat = r() < 0.75 ? { type: 'snowsuit', color: pick(P_KID, r) } : { type: 'puffer', color: pick(P_KID, r), len: 0.4 };
    d.trousers = { type: 'snow', color: d.coat.type === 'snowsuit' ? d.coat.color : pick([0x1e1e22, 0x2a2a3a, 0x23304a], r) };
    d.mittens = pick([0x2a2a3a, 0x8a2a24, 0x2a5a8a, 0x5a3a7a, 0xd89a2a], r);
    d.shoes = { type: 'winter', color: pick([0x2a2a30, 0x3a2a36, 0x1e2a3a, 0x4a3020], r), trim: 0xd8d0c4 };
    if (r() < 0.3) d.scarf = { color: pick(P_SCARF, r), style: 'tucked', bulk: 0.7 };
    return d;
  }
  // adults
  const styleF = old ? pick(['bob', 'bob', 'short', 'bun'], r) : pick(['long', 'long', 'bob', 'pony', 'bun', 'short'], r);
  const styleM = old ? pick(['balding', 'balding', 'short', 'crew', 'bald'], r) : pick(['short', 'short', 'crew', 'messy', 'side', 'slick', 'buzz', 'curly'], r);
  d.hair = { style: fem ? styleF : styleM, color: hairC };
  if (!fem && !old && r() < 0.28) d.beard = { style: pick(['full', 'short', 'short', 'stubble', 'moustache'], r), color: darker(hairC, 0.9) };
  if (!fem && old && r() < 0.2) d.beard = { style: pick(['full', 'moustache'], r), color: hairC };
  const coatType = old ? pick(['wool', 'wool', 'quilted', 'parka', 'pufferLong', 'jacket'], r) : pick(['parka', 'parka', 'puffer', 'puffer', 'pufferLong', 'wool', 'jacket', 'bomber'], r);
  const cc = pick(P_COAT, r);
  d.coat = { type: coatType, color: cc };
  if (coatType === 'parka' && r() < 0.6) d.coat.fur = pick([0x7a6c5c, 0x6a5e50, 0x8a7a68, 0x4a4038], r);
  if (coatType === 'parka' && r() < 0.3) d.coat.len = 0.55;
  if (coatType === 'puffer') d.coat.len = 0.3 + r() * 0.2;
  if (coatType === 'jacket' && r() < 0.25) { d.coat.open = true; d.coat.under = pick([0x7e8084, 0x2a2a2e, 0x8a3a3a, 0xd0c8b8], r); }
  if (coatType === 'wool' || coatType === 'quilted') d.under = pick([0x8a3a3a, 0x2a2a2e, 0xd0c8b8, 0x4a5a6a], r);
  d.trousers = { type: fem ? pick(['jeans', 'jeans', 'slacks'], r) : pick(['jeans', 'slacks', 'jeans', 'joggers'], r), color: pick(P_TROUS, r) };
  const hatR = r();
  if (hatR < 0.42) d.hat = { type: r() < 0.3 ? 'pom' : 'beanie', color: pick(P_HAT, r), color2: pick(P_HAT, r) };
  else if (hatR < 0.5 && !fem) d.hat = { type: old ? 'flatcap' : 'cap', color: pick(P_HAT, r) };
  if (r() < (coatType === 'wool' ? 0.8 : 0.45)) d.scarf = { color: pick(P_SCARF, r), color2: r() < 0.4 ? pick(P_SCARF, r) : undefined, long: r() < 0.3, style: pick(['end', 'end', 'two', 'tucked', 'tucked', 'loop'], r), bulk: 0.6 + r() * 0.5 };
  if (r() < 0.65) d.gloves = pick([0x1a1816, 0x2a2018, 0x3a2618, 0x2a2a2e, 0x4a3020], r);
  d.shoes = { type: fem ? pick(['boots', 'boots', 'tall', 'winter', 'sneakers'], r) : pick(['shoes', 'boots', 'boots', 'winter', 'sneakers'], r), color: pick(P_SHOE, r) };
  if (d.shoes.type === 'tall') d.trousers.type = 'jeans';
  if (r() < 0.12) d.glasses = pick([0x1a1816, 0x3a2a1e, 0x6a6a6e], r);
  if (old) {
    const a = r();
    if (a < 0.3) { d.aid = 'rollator'; d.aidColor = pick([0x6a2228, 0x4a4e54, 0x22344e, 0x9a9ca0], r); }
    else if (a < 0.55) d.aid = 'stick';
    d.style.stride *= 0.85;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Building a character

// The geometry of a person at body lod `lod` and head lod `hl` (tex: the face texture, lod-0 head),
// weighted to the bones in `bi`. m: the model (builders read its bones and note a few fit values).
function personGeo(m, d, D, P, bi, lod, hl, tex, opts) {
  const sb = new SkinBuilder(opts.remap || null);
  if (tex) { sb.uvOn = true; sb.skinK = TEXK; }
  const bust = !!opts.bust;
  // neck
  {
    const nR = D.neckR, z = D.neckZ, y0 = D.shoulderY - 0.05, y1 = D.headY + 0.035;
    const keys = [
      { y: y0, rx: nR * 1.6, rz: nR * 1.25, cz: z },
      { y: D.shoulderY + 0.02, rx: nR * 1.16, rz: nR * 1.06, cz: z },
      { y: (D.shoulderY + D.headY) / 2 + 0.01, rx: nR, rz: nR, cz: z + 0.004 },
      { y: D.headY - 0.012, rx: nR * 1.02, rzF: nR, rzB: nR * 1.08, cz: z + 0.008 },
      { y: y1, rx: nR * 0.9, rz: nR * 0.95, cz: z + 0.012 },
    ];
    const W = (v) => {
      if (v.y < D.shoulderY + 0.01) { const t = sstep(y0, D.shoulderY + 0.01, v.y); return [[bi.chest, 1 - t], [bi.neck, t]]; }
      if (v.y > D.headY - 0.03) { const t = sstep(D.headY - 0.03, D.headY + 0.02, v.y); return [[bi.neck, 1 - t], [bi.head, t]]; }
      return [[bi.neck, 1]];
    };
    // men's stubble runs down the front of the throat
    const sk = P.stub * 0.22, sc = P.stubLin, s0 = P.skin;
    const adam = D.adult && !D.fem ? 0.0065 * D.k : 0, ym = (D.shoulderY + D.headY) / 2;
    const nmod = (v) => {
      if (v.c > 0) {
        const s2 = Math.abs(v.s);
        v.z += adam * G2((v.y - ym + 0.004) / 0.013, v.s / 0.2) + 0.004 * D.k * G2((s2 - 0.62) / 0.2, 0) * sstep(D.headY, D.shoulderY, v.y);
      }
      // narrower behind the jaw, towards the top
      v.x *= 1 - 0.07 * sstep(ym, D.headY, v.y) * Math.abs(v.s) * (v.c < 0.3 ? 1 : 0.4);
    };
    const ncol = sk > 0 ? (v) => { const k = sk * sstep(-0.2, 0.5, v.c) * sstep(D.shoulderY + 0.03, D.headY - 0.01, v.y); return [lerp(1, sc[0] / s0[0], k), lerp(1, sc[1] / s0[1], k), lerp(1, sc[2] / s0[2], k)]; } : null;
    sb.use('skin').add(loft(sampleRings(keys, rangeYs(y0, y1, [0.02, 0.03, 0.045][lod])), { n: [14, 10, 8][lod], weights: W, capTop: 0.0, color: ncol, mod: nmod }), d.skin);
  }
  buildHead(sb, d, D, bi, hl, P, tex);
  m.headP = P;
  buildHair(sb, P, D, d, bi, hl, tex);
  buildHat(sb, P, D, d, bi, hl);
  buildFaceExtras(sb, P, D, d, bi, hl);
  buildTorso(sb, d, D, bi, lod, m);
  if (D.pendingLock) D.pendingLock();
  buildArms(sb, d, D, bi, lod, m);
  buildLegs(sb, d, D, bi, lod, bust);
  if (!bust) {
    buildProps(sb, d, D, bi, lod);
    if (d.aid) buildAid(sb, d, D, bi, lod);
    if (d.wheelchair) buildWheelchair(sb, d, D, bi, lod);
  }
  if (d.blanket) buildBlanket(sb, d, D, bi, lod);
  const geo = sb.build();
  return geo;
}

// The cast's skin: their own instance of the skin surface with the baked face texture as map. The
// texture's alpha is the skin's oil (faceSpec), used in the surface shader's TRI_SPECK hook (an
// expression evaluated right after <lights_physical_fragment>, before any light is summed):
// - it scales the specular (as before) and sets the roughness: oily T-zone and wet lips smoother,
//   dry cheeks, pores and creases rougher, round the character's own base roughness (young skin
//   smoother, old skin drier; def.face.rough overrides);
// - its fine detail (pores, lines, creases, the lip border) tilts the normal through the surface
//   shader's gBump, scaled to a metric slope (FACE_RELIEF m per unit of oil, divided by the pixel's
//   size: the same relief at any distance; mipmapping fades it out far away). The hook is expanded
//   twice (specularColor, specularF90), so the bump is applied twice: half the relief each time;
// - the comma expression puts the alpha back to 1 (the portraits composite by it).
function faceSkinMat(tex, d) {
  const sm = surfaceMaterial('skin', { snow: false, unique: true });
  const age = d.age ?? 35;
  sm.map = tex;
  sm.roughness = d.face?.rough ?? (age < 15 ? 0.6 : age < 30 ? 0.52 : age < 55 ? 0.56 : 0.62);
  const a = 'sampledDiffuseColor.a', rel = (FACE_RELIEF / 2).toExponential(3);
  const dH = `vec2( texture2D( map, vMapUv + dFdx( vMapUv ) ).a - ${a}, texture2D( map, vMapUv + dFdy( vMapUv ) ).a - ${a} ) * ${rel} / max( vec2( length( gVx ), length( gVy ) ), vec2( 1e-6 ) )`;
  sm.defines.TRI_SPECK = `( ( diffuseColor.a = 1.0 ), ( material.roughness = min( max( roughnessFactor * ( 1.34 - 0.9 * ${a} ), 0.0525 ) + geometryRoughness, 1.0 ) ), ( normal = gBump( gVx, gVy, normal, ${dH} ) ), ${a} * ${SPEC_MAX.toFixed(2)} )`;
  return sm;
}

// ---------------------------------------------------------------------------------------------
// Level of detail. A person's meshes hang under a PersonLOD (a THREE.LOD): three.js picks the level
// in every render from that render's own camera, so the game camera, the HUD portraits' camera and
// a look-dev camera each get the right one (a portrait is always level 0). Every level is a
// SkinnedMesh bound to the one skeleton with the same bind matrix, so animation, seating,
// carryPoint and the props work whichever level is drawn. Beyond LOD_DIST.shadow a person casts no
// shadow. The shadow and AO passes draw what the main camera chose (the pre-pass renders with it).
// The cast has three levels (p4r2): level 0 (the dense head with the baked face, hair cards) to
// LOD_DIST.mid, a mid level (a lod-1 body and head) to LOD_DIST.cast, then the far level; each level
// casts its own shadow, so the shadow pass draws level 0 only for the one or two people within 6 m.
// The distances are screen sizes: measured over the camera's zoom and through the game's 55-degree
// lens (a 42-degree dialogue shot from 6.8 m sees its speakers as from 5 m: level 0).
export const LOD_DIST = { cast: 15, mid: 6, ped: 40, shadow: 60, hyst: 0.1 };
const _lv1 = new THREE.Vector3(), _lv2 = new THREE.Vector3(), TAN_REF = Math.tan(27.5 * DEG);
class PersonLOD extends THREE.LOD {
  constructor() { super(); this.shadowOn = true; this.dist = 0; }
  update(camera) {
    _lv1.setFromMatrixPosition(camera.matrixWorld); _lv2.setFromMatrixPosition(this.matrixWorld);
    const lens = camera.isPerspectiveCamera ? Math.tan(camera.fov * DEG * 0.5) / TAN_REF : 1;
    const dd = (this.dist = (_lv1.distanceTo(_lv2) / camera.zoom) * lens);
    const L = this.levels;
    if (L.length > 1) {
      // (THREE.LOD.update with that distance)
      L[0].object.visible = true;
      let i = 1;
      for (; i < L.length; i++) {
        let ld = L[i].distance;
        if (L[i].object.visible) ld -= ld * L[i].hysteresis;
        if (dd >= ld) { L[i - 1].object.visible = false; L[i].object.visible = true; } else break;
      }
      this._currentLevel = i - 1;
      for (; i < L.length; i++) L[i].object.visible = false;
    }
    const on = dd < LOD_DIST.shadow * (this.shadowOn ? 1 + LOD_DIST.hyst : 1);
    if (on !== this.shadowOn) { this.shadowOn = on; for (const l of L) l.object.castShadow = on; }
  }
}
// The cheaper levels, built in idle time (~4-6 ms each, so loading costs nothing); until one exists
// the person stays at the level before it.
// - mid (the cast, from LOD_DIST.mid): a lod-1 body and a lod-1 head (as a pedestrian: the face in
//   vertex colours), its hair and leather kept apart (3-4 draw calls; ~11-16 k triangles);
// - far (from LOD_DIST.cast / LOD_DIST.ped): a lod-2 body and a lod-1 head (as the busts;
//   pedestrians: a lod-2 head), its surfaces folded into fabric + skin (2 draw calls; 'metal' stays
//   for wheelchairs and rollators).
const FAR_REMAP = { hair: 'fabric', leather: 'fabric', painted: 'fabric', lamp: 'fabric', rubber: 'fabric', plastic: 'fabric' };
const MID_REMAP = { lamp: 'leather', rubber: 'leather', plastic: 'fabric' };
const LOD_JOBS = [];
let lodIdle = 0;
const onIdle = (f) => (globalThis.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(() => f({ timeRemaining: () => 8, didTimeout: true }), 30));
function addLevel(m, kind) {
  const key = kind + 'Mesh';
  if (m[key] || !m.lodNode) return m[key];
  const mid = kind === 'mid';
  const d = m.d, D2 = dims(d), P2 = headParams(d, D2);
  // the builders note fit values on the model (armOut, headP): keep the near level's
  const mm = Object.create(m);
  const geo = personGeo(mm, d, D2, P2, m.bi, mid ? 1 : 2, mid ? 1 : m.lod >= 1 ? 2 : 1, null, { remap: mid ? MID_REMAP : FAR_REMAP });
  const lv = new THREE.SkinnedMesh(geo, personMaterials(geo, 1, null, d));
  lv.castShadow = m.lodNode.shadowOn; lv.receiveShadow = true;
  lv.bind(m.mesh.skeleton, m.mesh.bindMatrix);
  lv.boundingSphere = m.mesh.boundingSphere.clone();
  lv.userData.lodName = kind;
  m.lodNode.addLevel(lv, mid ? m.midDist : m.farDist, LOD_DIST.hyst);
  lv.updateMatrixWorld(true);   // (the root may be skipping its matrix updates: animation LOD)
  m[key] = lv;
  m.meshes.push(lv);
  return lv;
}
const addFarLevel = (m) => addLevel(m, 'far');
function lodIdleRun(deadline) {
  lodIdle = 0;
  let n = 0;
  while (LOD_JOBS.length && (deadline.timeRemaining() > 5 || (deadline.didTimeout && n === 0))) { const [m, k] = LOD_JOBS.shift(); addLevel(m, k); n++; }
  if (LOD_JOBS.length) lodIdle = onIdle(lodIdleRun);
}
// Build every cheaper level still waiting (tests, or a loading screen that has the time).
export function buildFarLevels() { while (LOD_JOBS.length) { const [m, k] = LOD_JOBS.shift(); addLevel(m, k); } }

// The materials of a person's mesh: the shared surface materials, the shared matte hair, the cast's
// glossy eyes (lod-0 heads) and the cast's own skin material carrying the face texture.
function personMaterials(geo, hl, tex, d) {
  const mats = realMaterials(geo, { snow: false });
  if (!Array.isArray(mats)) return mats;
  const hi = geo.userData.surfaces.indexOf('hair'); if (hi >= 0) mats[hi] = hairMat();
  const li = geo.userData.surfaces.indexOf('lamp'); if (li >= 0 && hl === 0) mats[li] = eyeMat();
  if (tex) {
    const si = geo.userData.surfaces.indexOf('skin');
    if (si >= 0) mats[si] = faceSkinMat(tex, d);
  }
  return mats;
}

// A person's root skips its whole subtree's matrix update on frames where Character.sync left the
// pose alone and the root where it was (character.js' animation level of detail sets root._skipFrom
// to the parent it decided that under). Anything that moved the root since - a portrait reparents
// it, a teleport - updates as usual: the root's world matrix must still sit on its position.
function rootMatrixWorld(force) {
  const f = this._skipFrom;
  if (f && f === this.parent) {
    const e = this.matrixWorld.elements, p = this.position;
    if ((e[12] - p.x) ** 2 + (e[13] - p.y) ** 2 + (e[14] - p.z) ** 2 < 0.0625) return;
  }
  THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
}

export function buildCharacter(def, opts = {}) {
  const d = normDef(def);
  const lod = opts.lod ?? (def.name === 'ped' ? 1 : 0);
  const D = dims(d);
  // the head may be finer than the body (busts: lod 2 body, lod 1 head); lod-0 heads get a baked
  // face texture (their own skin material: same number of draw calls)
  const hl = opts.headLod ?? lod;
  const P = headParams(d, D);
  const tex = hl === 0 && opts.faceTex !== false ? faceTexture(P, def, opts.lazyFace !== false) : null;
  const m = {
    def, d, D, lod, root: new THREE.Group(), body: new THREE.Group(), phase: Math.random() * TAU, squash: 0, talkT: 0,
    seed: Math.random(), wheelAng: 0, meshes: [], style: { swing: 1, stride: 1, stoop: 0, lean: 0, sway: 1, bounce: 1, ...(d.style || {}) },
    P: new Float32Array(NCH), Q: new Float32Array(NCH),
    w: { seat: 0, air: 0, flung: 0, down: 0, kick: 0, write: 0, phone: 0, wave: 0, talk: 0, listen: 0, push: 0, cheer: 0, pockets: 0, carry: 0, work: 0, kneel: 0, fright: 0, fist: 0, shiver: 0, slump: 0, grief: 0 }, kneelT: 0,
    handScale: [1, 1], fingScale: [1, 1],
  };
  m.root.add(m.body);
  m.root.updateMatrixWorld = rootMatrixWorld;
  const bones = [], bi = {};
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); bi[name] = bones.length; bones.push(b); return b; };
  const pelvis = mk('pelvis', m.body, 0, D.hipY, 0);
  const spine = mk('spine', pelvis, 0, D.spineY - D.hipY, 0);
  const chest = mk('chest', spine, 0, D.chestY - D.spineY, 0);
  const neck = mk('neck', chest, 0, D.neckY - D.chestY, D.neckZ);
  const headB = mk('head', neck, 0, D.headY - D.neckY, D.headZ - D.neckZ);
  const jaw = mk('jaw', headB, 0, D.jawY - D.headY, D.jawZ - D.headZ);
  // upper eyelids on their own bones (blinking) at lod 0, at the eyes' centres
  if (hl === 0) {
    const ec = [0, 0, 0];
    m.lids = [-1, 1].map((side) => { eyeCentre(P, side, ec); return mk(side < 0 ? 'lidR' : 'lidL', headB, ec[0], ec[1] - D.headY, ec[2] - D.headZ); });
    m.lidClose = lidTop(P, d) - lidBot(P) + 0.04;
    m.blinkT = 1 + Math.random() * 3; m.blink = 0;
  }
  const arms = [], fores = [], hands = [];
  for (const [s, side] of [['R', -1], ['L', 1]]) {
    const a = mk('arm' + s, chest, side * D.S, D.shJ - D.chestY, 0);
    const f = mk('fore' + s, a, 0, -D.upper, 0);
    const h = mk('hand' + s, f, 0, -D.fore, 0);
    arms.push(a); fores.push(f); hands.push(h);
  }
  const legs = [], shins = [], feet = [];
  // coat skirts: bones at the hip joints that follow the thighs part of the way (more when seated)
  m.skirts = [mk('skirtR', pelvis, -D.hipX, 0, 0), mk('skirtL', pelvis, D.hipX, 0, 0)];
  for (const [s, side] of [['R', -1], ['L', 1]]) {
    const t = mk('thigh' + s, pelvis, side * D.hipX, 0, 0);
    const sh = mk('shin' + s, t, 0, D.kneeY - D.hipY, 0);
    const f = mk('foot' + s, sh, 0, D.ankleY - D.kneeY, 0);
    legs.push(t); shins.push(sh); feet.push(f);
  }
  // fingers: knuckles ('fing'), middle joints ('tip'), thumb (at its base): see hand()
  const hk = D.hand / 0.19;
  const fings = [], thumbs = [];
  for (const [s, side, i] of [['R', -1, 0], ['L', 1, 1]]) {
    const f = mk('fing' + s, hands[i], 0, -HAND.kn * hk, 0);
    mk('tip' + s, f, 0, -HAND.pip * hk, 0);
    const ix = mk('idx' + s, hands[i], 0, -HAND.kn * hk, 0);
    m.idxTips = m.idxTips || [];
    m.idxTips[i] = mk('idxTip' + s, ix, 0, -HAND.pip * hk, 0);
    (m.idxs = m.idxs || [])[i] = ix;
    thumbs.push(mk('thumb' + s, hands[i], -side * HAND.cmc[2] * hk, -HAND.cmc[0] * hk, HAND.cmc[1] * hk));
    fings.push(f);
  }
  m.fings = fings; m.thumbs = thumbs;
  const props = d.props || [];
  m.props = {};
  if (props.includes('note')) m.props.note = mk('note', hands[1], 0, 0, 0);
  if (props.includes('pencil')) m.props.pencil = mk('pencil', m.idxTips[0], 0, 0, 0);
  if (props.includes('phone')) m.props.phone = mk('phone', hands[0], 0, 0, 0);
  if (props.includes('shovel')) m.props.shovel = mk('shovel', hands[0], 0, 0, 0);
  if (props.includes('wrench')) m.props.wrench = mk('wrench', hands[0], 0, 0, 0);
  if (d.clipboard) mk('clip', hands[1], 0, 0, 0);
  if (d.aid === 'rollator') m.aid = mk('aid', m.body, 0, 0, 0);
  if (d.wheelchair) {
    m.chair = mk('chair', m.body, 0, 0, 0);
    m.wheels = [mk('wheelR', m.chair, -0.3, 0.3, -0.07), mk('wheelL', m.chair, 0.3, 0.3, -0.07)];
    m.casters = [mk('casterR', m.chair, -0.21, 0.065, 0.32), mk('casterL', m.chair, 0.21, 0.065, 0.32)];
  }
  // the pose arrays address bones by their CORE index: core bones first, in CORE order
  {
    const order = [...CORE.map((n) => bones[bi[n]]), ...bones.filter((b) => !(b.name in B))];
    bones.length = 0; bones.push(...order); bones.forEach((b, i) => { bi[b.name] = i; });
  }
  m.root.updateMatrixWorld(true);
  m.bones = bones; m.bi = bi; m.chest = chest; m.fores = fores; m.hips = pelvis;

  // (p4r2) level 0 of the cast collects hair and fur cards while it is built (shellCards)
  if (hl === 0 && !opts.bust && opts.cards !== false) { D.cards = new SkinBuilder(); D.cards.uvOn = true; }
  const geo = personGeo(m, d, D, P, bi, lod, hl, tex, opts);
  const mats = personMaterials(geo, hl, tex, d);
  if (tex) m.faceTex = tex;
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (tex?.userData.job) {
    // finish a lazily baked face before this mesh is first drawn
    mesh.onBeforeRender = function () { finishFace(tex); this.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; };
  }
  // the meshes hang under a level-of-detail switch (PersonLOD): this one is level 0; a cheaper far
  // level on the same skeleton is added later (opts.far, see addFarLevel)
  m.lodNode = new PersonLOD();
  m.root.add(m.lodNode);
  m.lodNode.addLevel(mesh, 0);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, D.H * 0.5, 0), D.H * 0.75 + (d.wheelchair ? 0.35 : 0.15));
  mesh.userData.lodName = 'l' + lod + (hl !== lod ? 'h' + hl : '');
  m.mesh = mesh;
  m.meshes.push(mesh);
  if (D.cards?.parts.length) {
    // the cards: one more skinned mesh on the skeleton, a child of level 0 (shown with it), main
    // pass only (no shadow, kept out of the AO pre-pass)
    const cm = new THREE.SkinnedMesh(D.cards.build(), cardMat());
    cm.castShadow = false; cm.receiveShadow = true; cm.userData.noAO = true; cm.userData.lodName = 'cards';
    cm.bind(mesh.skeleton, mesh.bindMatrix);
    cm.boundingSphere = mesh.boundingSphere.clone();
    mesh.add(cm);
    m.cardMesh = cm;
  }
  delete D.cards;
  m.bones = bones; m.bi = bi;
  m.hips = pelvis; m.pelvis = pelvis; m.spine = spine; m.chest = chest; m.neck = neck; m.headBone = headB; m.mouth = jaw; m.jaw = jaw;
  m.arms = arms; m.fores = fores; m.hands = hands; m.legs = legs; m.shins = shins; m.feet = feet;
  // a marker at the middle of the face (eye level), where portraits and look-at code aim
  m.head = new THREE.Object3D();
  m.head.position.set(0, D.chinY + 0.5 * D.headH - D.headY, D.z0 + 0.12 * D.headH - D.headZ);
  headB.add(m.head);
  const hatH = d.hat ? (d.hat.type === 'pom' ? 0.07 : 0.02) : 0.01;
  m.height = d.wheelchair ? 0.58 + (D.H - D.hipY) * 0.97 + hatH : D.H + hatH;
  m.headTop = m.height;
  m.legLen = D.hipY;
  m.armLen = D.upper + D.fore + D.hand;
  m.radius = d.wheelchair ? 0.45 : D.adult ? clamp(D.S + (d.coat.bulk ?? 0.02) + 0.1, 0.28, 0.4) : clamp(D.S + 0.08, 0.16, 0.3);
  m.kind = d.kind;
  m.armOut = m.armOut ?? 0.1;
  animateCharacter(m, { t: 0, speed: 0 }, 0);
  // a mid level beyond opts.mid metres (the cast: lod-0 models only) and a far level beyond opts.far
  // metres (in idle time; opts.lazyFar === false: now)
  if (!opts.bust && lod < 2) {
    if (opts.mid && hl === 0 && (!opts.far || opts.mid < opts.far)) {
      m.midDist = opts.mid;
      if (opts.lazyFar === false) addLevel(m, 'mid'); else LOD_JOBS.push([m, 'mid']);
    }
    if (opts.far) {
      m.farDist = opts.far;
      if (opts.lazyFar === false) addFarLevel(m); else LOD_JOBS.push([m, 'far']);
    }
    if (LOD_JOBS.length && !lodIdle) lodIdle = onIdle(lodIdleRun);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Animation. A pose is a Float32Array: Euler XYZ per core bone + the pelvis offset. Each frame:
// locomotion (idle -> walk -> brisk -> run, by speed) -> upper-body overlays (write, phone,
// wave, talk, push, cheer...) blended by smoothed weights -> whole-body states (seated, a jump's
// wind-up / flight / landing, air, kick, flung, down + getting up) -> bones.

// Gait curves: one leg, phase u from its heel strike (degrees). hip = the thigh's flexion from the
// vertical, knee = flexion, foot = the sole's pitch to the ground (toes up +).
// The walk is a normal ~1.4 m/s walk: heel strike on a nearly straight knee, the knee yielding ~15 deg
// under the load, the heel rising from ~45 %, toe-off at ~60 %, the swing knee peaking at ~73 % and
// straight again just before the next heel strike. locomotion() makes faster walks of it (a longer
// stride, a deeper stance knee, a harder push-off, an earlier toe-off).
const WALK = {
  hip: periodic([[0, 22], [0.1, 19], [0.2, 12], [0.3, 4], [0.4, -5], [0.5, -13], [0.56, -16], [0.62, -12], [0.68, -3], [0.76, 11], [0.86, 22], [0.93, 24], [1, 22]]),
  knee: periodic([[0, 4], [0.08, 12], [0.15, 16], [0.25, 11], [0.38, 5], [0.48, 6], [0.56, 19], [0.62, 37], [0.7, 57], [0.75, 60], [0.84, 42], [0.92, 14], [0.97, 4], [1, 4]]),
  foot: periodic([[0, 15], [0.05, 6], [0.1, 0], [0.42, 0], [0.5, -7], [0.56, -20], [0.62, -34], [0.68, -16], [0.76, -2], [0.86, 4], [0.94, 10], [1, 15]]),
};
// The run: heel strike under a slightly bent knee, the knee yielding ~40 deg, toe-off at ~29 % off the
// toes, the heel coming up behind to a jogger's ~95 deg (not a sprinter's heel to the buttock), the
// thigh driven forward, the shin reaching out again before landing.
const RUN = {
  hip: periodic([[0, 25], [0.13, 7], [0.27, -22], [0.38, -18], [0.52, 2], [0.7, 29], [0.86, 30], [1, 25]]),
  knee: periodic([[0, 16], [0.1, 38], [0.22, 25], [0.29, 21], [0.4, 56], [0.54, 96], [0.66, 90], [0.82, 50], [0.94, 21], [1, 16]]),
  foot: periodic([[0, 8], [0.06, 0], [0.18, 0], [0.29, -46], [0.42, -24], [0.6, 0], [0.85, 8], [1, 8]]),
};
// stride scale (look-dev tuning hook) and the tuning knobs of locomotion (the gait look-dev page sets
// them live; the defaults are the game's)
export const GAIT = { walk: 1, run: 1, k: {} };
const _la0 = [0, 0, 0], _la1 = [0, 0, 0];
// shoulder swing over the same leg's phase: back at its heel strike, forward at the other's
const WALK_ARM = periodic([[0, -1], [0.25, -0.2], [0.5, 1], [0.75, 0.2], [1, -1]]);

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _mc = new THREE.Matrix4();
const _T = new THREE.Vector3(), _U = new THREE.Vector3(), _W = new THREE.Vector3(), _E = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _F = new THREE.Vector3(), _M = new THREE.Matrix4();

const set3 = (P, b, x, y, z) => { P[b * 3] = x; P[b * 3 + 1] = y; P[b * 3 + 2] = z; };
function lerpPose(P, Q, w, from = 0, to = NCH) { if (w <= 0) return; if (w >= 1) { for (let i = from; i < to; i++) P[i] = Q[i]; return; } for (let i = from; i < to; i++) P[i] += (Q[i] - P[i]) * w; }
function lerpBones(P, Q, w, list) { if (w <= 0) return; for (const b of list) for (let k = 0; k < 3; k++) P[b * 3 + k] += (Q[b * 3 + k] - P[b * 3 + k]) * Math.min(1, w); }
const ARM_R = [B.armR, B.foreR, B.handR, B.fingR, B.tipR, B.thumbR, B.idxR, B.idxTipR], ARM_L = [B.armL, B.foreL, B.handL, B.fingL, B.tipL, B.thumbL, B.idxL, B.idxTipL];

// Hand shapes: knuckle curl, middle-joint curl (radians, towards the palm), thumb flex (towards the
// palm), thumb opposition (across, towards the fingers), thumb lift.
// [knuckle curl, middle-joint curl (middle/ring/little), thumb flex, thumb opposition, thumb lift,
//  index knuckle curl, index middle-joint curl] (the index defaults to the others')
const HANDS = {
  relax: [0.32, 0.5, 0.1, 0.12, 0, 0.22, 0.36],
  grip: [1.3, 1.45, 0.45, 0.55, 0.2],
  // a fist: the fingertips folded into the palm, the thumb across the index and middle fingers
  fist: [1.5, 1.62, 0.5, 1.0, 0.0, 1.48, 1.62],
  open: [0.04, 0.05, -0.08, -0.3, 0],
  talk: [0.2, 0.28, 0.0, -0.05, 0, 0.12, 0.18],
  phone: [0.75, 0.55, 0.3, 0.5, 0.1],
  // a pen: the index and thumb pinch it, the other three curl under
  pen: [1.25, 1.5, 0.42, 0.72, 0.28, 0.52, 0.62],
  // a notebook flat on the palm: fingers straight under it, the thumb on its edge
  note: [0.12, 0.08, 0.12, 0.05, 0.0],
  pocket: [0.9, 1.1, 0.3, 0.4, 0],
  // a clipboard: the fingers wrapped behind its edge, the thumb flat on the front
  board: [0.1, 0.12, -0.22, 0.05, 0.0, 0.08, 0.1],
  carry: [0.55, 0.62, 0.15, 0.3, 0, 0.45, 0.5],
  limp: [0.2, 0.35, 0.05, 0.05, 0],
};
function handShape(P, i, sh, w = 1) {
  const side = i ? 1 : -1, f = i ? B.fingL : B.fingR, tp = i ? B.tipL : B.tipR, th = i ? B.thumbL : B.thumbR, ix = i ? B.idxL : B.idxR, it = i ? B.idxTipL : B.idxTipR;
  const a = typeof sh === 'string' ? HANDS[sh] : sh;
  const [c1, c2, tf, to, tx] = a, i1 = a[5] ?? c1, i2 = a[6] ?? c2;
  const L = (idx, val) => { P[idx] += (val - P[idx]) * w; };
  L(f * 3, 0); L(f * 3 + 1, 0); L(f * 3 + 2, -side * c1);
  L(tp * 3, 0); L(tp * 3 + 1, 0); L(tp * 3 + 2, -side * c2);
  L(ix * 3, 0); L(ix * 3 + 1, 0); L(ix * 3 + 2, -side * i1);
  L(it * 3, 0); L(it * 3 + 1, 0); L(it * 3 + 2, -side * i2);
  L(th * 3, tx); L(th * 3 + 1, -side * to); L(th * 3 + 2, -side * tf);
}
// The pencil's point (hand frame u, w, t of a 19 cm hand) for index curls c1, c2: the pencil rides on
// the index finger's last joint (PENCIL: its point relative to that joint, finger straight).
const PENCIL = { tip: [0.05, 0.019, 0.026], back: [-0.085, 0.05, -0.016] };
function penTip(c1, c2, out) {
  const ju = HAND.kn + HAND.pip * Math.cos(c1), jt = HAND.pip * Math.sin(c1), a = c1 + c2;
  const [du, w, dt] = PENCIL.tip;
  out[0] = ju + du * Math.cos(a) - dt * Math.sin(a); out[1] = w; out[2] = jt + du * Math.sin(a) + dt * Math.cos(a);
  return out;
}
const LEGS = [B.thighR, B.shinR, B.footR, B.thighL, B.shinL, B.footL];

// The chest frame of pose P (relative to the body), for targets given in body space.
function chestFrame(m, P, out) {
  const D = m.D;
  _m1.makeRotationFromEuler(_e.set(P[0], P[1], P[2])); _m1.setPosition(P[OFF], D.hipY + P[OFF + 1], P[OFF + 2]);
  _m2.makeRotationFromEuler(_e.set(P[3], P[4], P[5])); _m2.setPosition(0, D.spineY - D.hipY, 0);
  _m3.makeRotationFromEuler(_e.set(P[6], P[7], P[8])); _m3.setPosition(0, D.chestY - D.spineY, 0);
  return out.multiplyMatrices(_m1, _m2).multiply(_m3);
}
// Body-space point -> chest frame of pose P.
function bodyToChest(m, P, x, y, z, out) {
  chestFrame(m, P, _mc).invert();
  return out.set(x, y, z).applyMatrix4(_mc);
}
function bodyDirToChest(m, P, x, y, z, out) {
  chestFrame(m, P, _mc).invert();
  return out.set(x, y, z).transformDirection(_mc);
}

// Two-bone arm IK: wrist to (tx, ty, tz) in the chest frame, elbow towards pole (px, py, pz).
function armIK(m, Q, i, tx, ty, tz, px, py, pz) {
  const D = m.D, a = D.upper, b = D.fore;
  const sx = (i ? 1 : -1) * D.S, sy = D.shJ - D.chestY;
  _T.set(tx - sx, ty - sy, tz);
  const d = clamp(_T.length(), Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  _U.copy(_T).normalize();
  _W.set(px, py, pz).addScaledVector(_U, -_W.set(px, py, pz).dot(_U));
  if (_W.lengthSq() < 1e-8) _W.set(0, 0, 1).addScaledVector(_U, -_U.z);
  _W.normalize();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _E.copy(_U).multiplyScalar(cosA * a).addScaledVector(_W, sinA * a);
  _F.copy(_U).multiplyScalar(d).sub(_E).normalize();
  _Y.copy(_E).normalize().negate();
  _Z.copy(_F).addScaledVector(_Y, -_F.dot(_Y));
  if (_Z.lengthSq() < 1e-6) _Z.copy(_W);
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  _M.makeBasis(_X, _Y, _Z);
  _q.setFromRotationMatrix(_M);
  _e.setFromQuaternion(_q, 'XYZ');
  const arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR;
  set3(Q, arm, _e.x, _e.y, _e.z);
  const cosG = clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1);
  const flex = PI - Math.acos(cosG);
  set3(Q, fore, -flex, 0, 0);
  // the forearm's orientation in the chest frame, for aimHand
  _qF.copy(_q).multiply(_qX.setFromAxisAngle(_ax, -flex));
}
const _qF = new THREE.Quaternion(), _qX = new THREE.Quaternion(), _qH = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
const _HY = new THREE.Vector3(), _HX = new THREE.Vector3(), _HZ = new THREE.Vector3();
// Orient the hand of the arm just solved by armIK: fingers along (dx, dy, dz), palm facing
// (nx, ny, nz), both in body space (P gives the trunk).
function aimHand(m, P, Q, i, dx, dy, dz, nx, ny, nz) {
  const side = i ? 1 : -1;
  bodyDirToChest(m, P, -dx, -dy, -dz, _HY);
  bodyDirToChest(m, P, -side * nx, -side * ny, -side * nz, _HX);
  _HX.addScaledVector(_HY, -_HX.dot(_HY));
  if (_HX.lengthSq() < 1e-6) _HX.set(1, 0, 0);
  _HX.normalize();
  _HZ.crossVectors(_HX, _HY);
  _M.makeBasis(_HX, _HY, _HZ);
  _qH.setFromRotationMatrix(_M);
  _qH.premultiply(_qX.copy(_qF).invert());
  _e.setFromQuaternion(_qH, 'XYZ');
  set3(Q, i ? B.handL : B.handR, _e.x, _e.y, _e.z);
}

// Grip a bar with hand i: the bar passes through body-space point (px, py, pz) along (wx, wy, wz)
// (the thumb's side), the palm faces (nx, ny, nz). The bar sits in the curled fingers ('grip'), about
// 9.5 cm along the hand from the wrist and 3 cm off the palm. Elbow towards pole (qx, qy, qz).
const _gW = new THREE.Vector3(), _gN = new THREE.Vector3(), _gU = new THREE.Vector3();
function gripBar(m, P, Q, i, px, py, pz, wx, wy, wz, nx, ny, nz, qx, qy, qz, shape = 'grip', gu = 0.095, gt = 0.031) {
  const side = i ? 1 : -1, k = m.D.hand / 0.19;
  _gW.set(wx, wy, wz).normalize();
  _gN.set(nx, ny, nz).addScaledVector(_gW, -_gN.set(nx, ny, nz).dot(_gW)).normalize();
  _gU.crossVectors(_gW, _gN).multiplyScalar(side);                    // the fingers' direction
  bodyToChest(m, P, px - _gU.x * gu * k - _gN.x * gt * k, py - _gU.y * gu * k - _gN.y * gt * k, pz - _gU.z * gu * k - _gN.z * gt * k, _T);
  armIK(m, Q, i, _T.x, _T.y, _T.z, qx, qy, qz);
  aimHand(m, P, Q, i, _gU.x, _gU.y, _gU.z, _gN.x, _gN.y, _gN.z);
  handShape(Q, i, shape);
}
// The head frame of pose P (relative to the body), and a rest-pose model-space point -> body space.
function headFrame(m, P, out) {
  const D = m.D;
  chestFrame(m, P, out);
  _m2.makeRotationFromEuler(_e.set(P[B.neck * 3], P[B.neck * 3 + 1], P[B.neck * 3 + 2])); _m2.setPosition(0, D.neckY - D.chestY, D.neckZ);
  _m3.makeRotationFromEuler(_e.set(P[B.head * 3], P[B.head * 3 + 1], P[B.head * 3 + 2])); _m3.setPosition(0, D.headY - D.neckY, D.headZ - D.neckZ);
  return out.multiply(_m2).multiply(_m3);
}
const _hf = new THREE.Matrix4();

function smoothW(m, key, target, rate, dt) {
  const w = m.w;
  w[key] += (target - w[key]) * (dt > 0 ? 1 - Math.exp(-rate * dt) : 1);
  if (dt === 0) w[key] = target;
  return w[key];
}

export function animateCharacter(m, st, dt) {
  if (!m.P) return animateLegacy(m, st, dt);
  const P = m.P, Q = m.Q, D = m.D, sty = m.style, t = st.t || 0;
  const wheel = m.d.wheelchair && !st.seated;
  // weights
  const seatT = st.seated ? 1 : 0;
  const wSeat = smoothW(m, 'seat', seatT, 14, dt);
  const wAir = smoothW(m, 'air', st.air && !st.flung && !st.down ? 1 : 0, st.jumping ? 16 : 10, dt);
  // a jump's wind-up (st.jumpWind 0..1, jumpWindPose): he sinks, gathers himself and pushes off; once
  // he is off the ground what is left of it lets go quickly. windC: how far down he is (lids, jaw).
  if (st.jumpWind > 0) { m.windU = st.jumpWind; m.windK = 1; } else m.windK = (m.windK || 0) * (dt > 0 ? Math.exp(-14 * dt) : 0);
  m.windC = m.windK > 0.001 ? m.windK * windCrouch(m.windU) : 0;
  // the landing: the knees give in ~70 ms, he is up again by ~0.4 s
  const lt = st.landT ?? 9, wLand = lt < 0.45 && !st.air ? (lt < 0.07 ? sstep(0, 0.07, lt) : 1 - sstep(0.1, 0.42, lt)) : 0;
  const wFlung = smoothW(m, 'flung', st.flung ? 1 : 0, 14, dt);
  const wDown = smoothW(m, 'down', st.down ? 1 : 0, st.down ? 30 : 6, dt);
  const wWrite = smoothW(m, 'write', st.write ? 1 : 0, 7, dt);
  const wPhone = smoothW(m, 'phone', st.phone ? 1 : 0, 6, dt);
  const wWave = smoothW(m, 'wave', st.wave ? 1 : 0, 6, dt);
  const wTalk = smoothW(m, 'talk', st.talk ? 1 : 0, 4, dt);
  const wListen = smoothW(m, 'listen', st.listen && !st.talk ? 1 : 0, 3, dt);
  const wPush = smoothW(m, 'push', st.push ? 1 : 0, 6, dt);
  const wCheer = smoothW(m, 'cheer', st.cheer ? 1 : 0, 6, dt);
  const wCarry = smoothW(m, 'carry', st.carry ? 1 : 0, 6, dt);
  const wWork = smoothW(m, 'work', st.work && !st.seated ? 1 : 0, 5, dt);
  const wKneel = smoothW(m, 'kneel', st.kneel && !st.seated && !st.down && !st.flung ? 1 : 0, 4.5, dt);
  // a fright (the horn): both hands thrown up at once, let down slowly; a fist shaken at a car
  const upright = !st.seated && !st.down && !st.flung && !wheel;
  const wFright = smoothW(m, 'fright', st.fright && upright ? 1 : 0, st.fright ? 22 : 6, dt);
  const wFist = smoothW(m, 'fist', st.fist && upright ? 1 : 0, 9, dt);
  // the cold (game/cold.js): st.shiver 0..1, standing, walking or at the wheel (and Rune in his
  // wheelchair, game/rune.js)
  const wShiver = smoothW(m, 'shiver', !st.flung && !st.down && !st.slump ? clamp(st.shiver || 0, 0, 1) : 0, 2.5, dt);
  // dead in his wheelchair; Anita grieving (game/rune.js)
  const wSlump = smoothW(m, 'slump', st.slump ? 1 : 0, 2.2, dt);
  // (her hand stays at her eyes through a sob: st.sob 1 while she says one)
  const wGrief = smoothW(m, 'grief', st.grief && upright && (!st.talk || (st.sob || 0) > 0.5) && !st.phone && !st.wave ? 1 : 0, 2.5, dt);
  m.kneelT = st.kneel ? m.kneelT + dt : 0;
  m.squash = Math.max(0, (m.squash || 0) - dt * 2.5);

  // 1. locomotion
  if (wheel) wheelchairPose(m, st, dt, P);
  else locomotion(m, st, dt, P);
  // 2. upper-body overlays
  if (m.d.cast) castPose(m, P);
  if (wPush > 0.001 && !wheel) { pushPose(m, P, Q, t); lerpBones(P, Q, wPush, ARM_R); lerpBones(P, Q, wPush, ARM_L); P[B.spine * 3] += 0.08 * wPush; }
  if (wTalk > 0.001) talkPose(m, st, P, Q, t, wTalk, wheel);
  if (wListen > 0.001) listenPose(m, P, t, wListen);
  if (wWave > 0.001) { wavePose(m, P, Q, t); lerpBones(P, Q, wWave, ARM_L); }
  if (wCheer > 0.001) { cheerPose(m, P, Q, t); lerpBones(P, Q, wCheer, ARM_R); P[B.spine * 3] += 0.05 * wCheer * Math.max(0, Math.sin(t * 8.5)); }
  if (wCarry > 0.001 && !wheel) { carryPose(m, P, Q, t); lerpBones(P, Q, wCarry, ARM_R); lerpBones(P, Q, wCarry, ARM_L); P[B.neck * 3] += 0.18 * wCarry; P[B.spine * 3] -= 0.03 * wCarry; }
  if (wWrite > 0.001) { P[B.spine * 3] += 0.04 * wWrite; writePose(m, P, Q, t); lerpBones(P, Q, wWrite, ARM_R); lerpBones(P, Q, wWrite, ARM_L); P[B.neck * 3] += 0.2 * wWrite; P[B.head * 3] += 0.24 * wWrite; }
  if (wPhone > 0.001) { P[B.head * 3 + 2] -= 0.1 * wPhone; P[B.neck * 3] += 0.05 * wPhone; phonePose(m, P, Q, t); lerpBones(P, Q, wPhone, ARM_R); }
  // 3. whole-body states
  if (wWork > 0.001 && !wheel) { workPose(m, st, P, Q, t); lerpPose(P, Q, wWork); }
  if (wKneel > 0.001 && !wheel) { kneelPose(m, st, P, Q, t); lerpPose(P, Q, wKneel); }
  if (wSeat > 0.001) { seatPose(m, st, Q, t); lerpPose(P, Q, wSeat); }
  if (m.windK > 0.001 && !st.seated) jumpWindPose(m, P, m.windU, m.windK, sstep(0.5, 3, st.speed || 0));
  if (wAir > 0.001) {
    // (a jump's air pose lets go after the landing too, from its legs reaching for the ground)
    if (st.jumping || lt < 0.6) { jumpAirPose(m, st, P, Q, t); lerpPose(P, Q, wAir); }
    else { airPose(m, st, P, Q); lerpPose(P, Q, wAir * 0.8, 0, OFF); }
  }
  // (standing, through the wind-up and the landing: both feet on the ground, whatever the poses above
  // did to the legs; on the move the stride has its own feet)
  const plant = st.seated || st.air ? 0 : Math.max(m.windK, 1 - sstep(0.45, 0.6, lt)) * (1 - sstep(0.5, 3, st.speed || 0));
  if (lt < 0.6) evenLegs(P, plant);
  if (wLand > 0.001 && !st.seated) jumpLand(m, P, wLand, sstep(0.5, 3, st.speed || 0), sty.old || 0);
  if (plant > 0.001) P[OFF + 1] -= soleGap(m, P) * plant;
  // (after the jump's poses: a fright's leap keeps its hands up)
  if (wFright > 0.001) frightPose(m, P, Q, t, wFright);
  if (wFist > 0.001) fistPose(m, P, Q, t, wFist);
  if (wShiver > 0.001) shiverPose(m, P, t, wShiver);
  if (wGrief > 0.001) griefPose(m, st, P, Q, t, wGrief);
  if (wSlump > 0.001) slumpPose(m, P, Q, wSlump);
  if (st.kick > 0) { kickPose(m, st, P, Q); lerpPose(P, Q, 1); }
  if (wFlung > 0.001) { flungPose(m, st, Q, t); lerpPose(P, Q, wFlung); }
  if (wDown > 0.001) { downPose(m, st, Q, t); lerpPose(P, Q, wDown); }
  if (m.squash > 0) { const s = Math.sin(Math.min(1, m.squash / 0.6) * PI) * 0.6; P[OFF + 1] -= 0.06 * s; for (const i of [0, 1]) { P[(i ? B.thighL : B.thighR) * 3] -= 0.35 * s; P[(i ? B.shinL : B.shinR) * 3] += 0.7 * s; P[(i ? B.footL : B.footR) * 3] -= 0.35 * s; } }
  // a ragdoll (actors/ragdoll.js, feature snubbla_vid_hopp): the trunk, the limbs and the pelvis from its
  // points; lying still, blended into the get-up above (Q: downPose)
  if (st.rag) { if (st.down && !(wDown > 0.001)) downPose(m, st, Q, t); st.rag.pose(m, P, st.down ? Q : null); }
  // mouth: barely moves. With a voice clip playing (voice.js) the jaw follows its loudness and shuts
  // on m, b and p (st.mouth, 0..1); a murmur still flaps.
  const jawT = st.talk ? (st.mouth != null ? 0.01 + 0.07 * st.mouth : 0.02 + 0.055 * Math.abs(Math.sin(t * 13 + Math.sin(t * 4.7) * 2)) * (0.6 + 0.4 * Math.sin(t * 2.3 + m.seed * 9))) : st.yell || st.flung ? 0.16 : 0.004;
  // (a jump: clenched while gathering, open on the grunt as he pushes off and on the 'uff' as he
  // lands; running hard: breathing through the mouth)
  const jr = st.jumping ? clamp((st.vy || 0) / Math.max(1, st.jumpV || 4), -1, 1) : -1;
  const jp = m.windK > 0.001 ? 0.055 * m.windK * sstep(JUMP_PUSH, JUMP_PUSH + 0.12, m.windU) : 0;
  P[B.jaw * 3] = st.talk ? jawT : Math.max(jawT * (1 - m.windC), jp, 0.075 * sstep(0.35, 0.75, jr), 0.06 * wLand, (0.025 + 0.02 * Math.sin(t * 9)) * (m.gaitRun || 0) * sstep(0.5, 3, st.speed || 0));
  P[B.jaw * 3 + 1] = 0; P[B.jaw * 3 + 2] = 0;
  // (teeth chattering in the cold)
  if (wShiver > 0.25 && !st.talk) P[B.jaw * 3] = Math.max(P[B.jaw * 3], 0.016 * wShiver * (0.5 + 0.5 * Math.sin(t * 46)));
  // look
  if (!st.rag) P[B.neck * 3 + 1] += (st.look || 0) * (1 - wDown);
  // a nod or a slow shake of the head (st.gesture 'nod' | 'shake' from st.gestureAt = st.t: Ove's
  // silent answers to small talk, main.js chat)
  if (st.gesture && wDown < 0.05 && wFlung < 0.05) {
    const u = t - (st.gestureAt ?? -9);
    if (st.gesture === 'nod' && u >= 0 && u < 0.8) {
      // down in 0.16 s, a beat there, back up slowly
      const k = u < 0.16 ? sstep(0, 0.16, u) : 1 - sstep(0.26, 0.8, u);
      P[B.neck * 3] += 0.22 * k; P[B.head * 3] += 0.14 * k;
    } else if (st.gesture === 'shake' && u >= 0 && u < 2) {
      // two slow turns each way, the head a little bowed
      const k = sstep(0, 0.25, u) * (1 - sstep(1.45, 2, u));
      P[B.neck * 3 + 1] += 0.3 * k * Math.sin(u * TAU / 0.8); P[B.head * 3 + 1] += 0.1 * k * Math.sin(u * TAU / 0.8 - 0.4);
      P[B.neck * 3] += 0.08 * k;
    }
  }
  // apply
  const bones = m.bones;
  for (let b = 0; b < NB; b++) bones[b].rotation.set(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
  // hands that went into pockets come back out for anything else
  const busy = Math.min(1, Math.max(wPhone, wWrite, wPush, wCheer, wWave, wTalk, wSeat, wFlung, wDown, wAir, wCarry, wWork, wKneel, wFright, wFist, wGrief, m.windK ? m.windK * sstep(0, 0.25, m.windU) : 0));
  for (const i of [0, 1]) {
    m.hands[i].scale.setScalar(lerp(m.handScale[i], 1, busy));
    m.fings[i].scale.setScalar(lerp(m.fingScale[i], 1, busy));
    m.idxs[i].scale.setScalar(lerp(m.fingScale[i], 1, busy));
  }
  m.hips.position.set(P[OFF], D.hipY + P[OFF + 1], P[OFF + 2]);
  {
    const ks = lerp(0.52, 0.95, wSeat);
    for (const i of [0, 1]) {
      const th = (i ? B.thighL : B.thighR) * 3;
      m.skirts[i].rotation.set(P[th] * ks, P[th + 1] * ks, P[th + 2] * ks);
      // seated, the skirt is drawn in round the thigh and pressed flat onto it
      m.skirts[i].scale.set(lerp(1, 0.86, wSeat), 1, lerp(1, 0.62, wSeat));
    }
  }
  m.body.rotation.y = st.air && st.spin ? st.spin : 0;
  // props and the wheelchair
  const vis = (b, on) => { if (b) b.scale.setScalar(on ? 1 : 1e-4); };
  if (m.props.note) vis(m.props.note, wWrite > 0.4);
  if (m.props.pencil) vis(m.props.pencil, wWrite > 0.4);
  if (m.props.phone) vis(m.props.phone, wPhone > 0.35);
  if (m.props.shovel) vis(m.props.shovel, wWork > 0.35 && st.workKind === 'shovel');
  if (m.props.wrench) vis(m.props.wrench, wWork > 0.35 && st.workKind === 'low');
  if (m.chair) {
    vis(m.chair, !st.seated);
    m.wheelAng += (st.speed || 0) * dt / 0.3;
    m.wheels[0].rotation.x = m.wheels[1].rotation.x = m.wheelAng;
    m.casters[0].rotation.x = m.casters[1].rotation.x = m.wheelAng * 4.6;
  }
  if (m.aid) vis(m.aid, !st.seated);
  // in a car seat the shins and feet are folded away into the knees (a bust has none either): the
  // seats sit low in the cars' shells, which have no footwells, so the lower legs went through the
  // floor and stood on the road under the car (features/implemented/ben_i_marken_vid_bilkorning.md).
  // Not smoothed: in and out of a seat is a cut. m.shinsIn: what this pose did (Character.sync).
  // st.legRoom: a seat with a floor under the feet (the snow tractor's cab, carmodels.js `legRoom`):
  // the lower legs stay.
  const fold = !!st.seated && !st.legRoom;
  m.shinsIn = fold;
  vis(m.shins[0], !fold); vis(m.shins[1], !fold);
  // blinking (lod 0): every 2-6 s, ~0.2 s, now and then twice; the lids drop when looking down
  if (m.lids) {
    m.blinkT -= dt;
    if (m.blinkT <= 0) { m.blink = 1e-4; m.blinkT = 2 + Math.random() * 4 - (Math.random() < 0.15 ? 1.75 : 0); }
    let c = 0;
    if (m.blink > 0) { m.blink += dt; const u = m.blink; c = u < 0.06 ? u / 0.06 : u < 0.09 ? 1 : u < 0.21 ? 1 - (u - 0.09) / 0.12 : 0; if (u >= 0.21) m.blink = 0; }
    const shut = Math.max(st.down && (st.downLeft ?? 9) > 1.3 ? 0.85 : wFlung * 0.5, 0.95 * wSlump, 0.55 * wGrief);
    const down = 0.3 * wWrite + 0.22 * wKneel + 0.3 * Math.max(m.windC, 0.6 * wLand);
    for (const l of m.lids) l.rotation.x = m.lidClose * Math.max(c, shut) + down * (1 - c);
  }
}

// The thigh's local rotation for a leg flexed by h in the body's sagittal plane and leaned out by ab
// (about the forward axis, towards +x), under a pelvis turned by (yaw, roll): the pelvis' turn is taken
// back out, so the leg keeps swinging straight ahead and a planted foot neither slides sideways nor
// twists while the hips rotate and tilt (it used to: 13 cm per step at 3.2 m/s, the feet landing on
// one line).
const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _te = new THREE.Euler(), _tx = new THREE.Vector3(1, 0, 0), _tz = new THREE.Vector3(0, 0, 1);
function thighRot(P, b, h, ab, yaw, roll) {
  _tq.setFromEuler(_te.set(0, yaw, roll)).invert();
  _tq.multiply(_tq2.setFromAxisAngle(_tz, ab)).multiply(_tq2.setFromAxisAngle(_tx, -h));
  _te.setFromQuaternion(_tq, 'XYZ');
  P[b * 3] = _te.x; P[b * 3 + 1] = _te.y; P[b * 3 + 2] = _te.z;
}
const _lh = [0, 0], _lk = [0, 0], _lf = [0, 0], _lx = [0, 0], _lt = [false, false], _lw = [0, 0], _la2 = [0, 0, 0];

function locomotion(m, st, dt, P) {
  const D = m.D, sty = m.style, t = st.t || 0, K = GAIT.k;
  const v = st.speed || 0;
  const thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY;
  // style.old (0..1): an older, heavier body (Ove): toes turned out, a wider and more rocking gait,
  // knees that bend less in the swing, the trunk and head a little forward, the elbows out on a run
  const old = sty.old || 0;
  // Walk or run: people switch gait rather than blend one into the other (a half-run at 4.3 m/s
  // fits neither), with hysteresis (a run from 4.1 m/s, a walk again below 3.6), cross-faded over a
  // fifth of a second.
  m.runOn = v > (m.runOn ? K.runOff ?? 3.6 : K.runOn ?? 4.1);
  m.runT = dt > 0 ? (m.runT ?? 0) + ((m.runOn ? 1 : 0) - (m.runT ?? 0)) * (1 - Math.exp(-(K.runRate ?? 12) * dt)) : m.runOn ? 1 : 0;
  if (m.runT > 0.999) m.runT = 1; else if (m.runT < 0.001) m.runT = 0;
  const runW = sstep(0, 1, m.runT);
  const fast = sstep(1.0, 3.3, v);           // a stroll .. a power walk (Ove's 3.2 m/s)
  const brisk = sstep(1.7, 3.3, v) * (1 - runW);
  const moveW = sstep(0.06, 0.45, v);
  m.gaitRun = runW;
  const rollator = m.d.aid === 'rollator', stick = m.d.aid === 'stick';
  const strideK = (sty.stride || 1) * (rollator ? 0.7 : 1);
  // Walk amplitudes: the hip's flexion (forward) and extension (back). A fast walk lengthens the
  // stride mostly behind (a longer push-off from the toes); a heel reaching far out ahead drops the
  // body by the leg's arc (a 40 deg heel strike: 12 cm per step). Faster: the stance knee yields more.
  const ampW = clamp((K.f0 ?? 1) + (K.f1 ?? 0.12) * v / Math.max(0.6, strideK), 0.6, 1.6) * Math.min(1, 0.6 + 0.4 * strideK);
  const ampE = clamp((K.e0 ?? 1) + (K.e1 ?? 0.3) * v / Math.max(0.6, strideK), 0.6, 2.4) * Math.min(1, 0.6 + 0.4 * strideK);
  const ampR = clamp(0.85 + 0.05 * v, 0.9, 1.25) * (K.ampR ?? 1);
  const loadK = (K.load ?? 12) * fast, pushK = 1 + (K.push ?? 0.3) * fast;
  const swingK = (1 + 0.06 * fast) * (1 - 0.1 * old), runKnee = 1 - 0.1 * old;
  P.fill(0);
  const hipA = [0, 0], swingA = [0, 0], stanceA = [0, 0], ext = [0, 0];
  // leg angles (hip flexion h, knee flexion k, foot pitch fp, radians) at phase uu
  const legAt = (uu, out) => {
    const uf = fract(uu), hw = WALK.hip(uu), fw = WALK.foot(uu);
    const hW = hw * (hw > 0 ? ampW : ampE);
    const kW = WALK.knee(uu) * (uf > 0.5 ? swingK : 1) + loadK * Math.max(0, Math.sin(PI * Math.min(1, uf / (K.loadEnd ?? 0.32))));
    const fW = fw * (fw < 0 ? pushK : Math.min(1.2, ampW));
    const kR = RUN.knee(uu) * (uf > 0.3 ? runKnee : 1);
    out[0] = lerp(hW, RUN.hip(uu) * ampR, runW) * DEG * moveW;
    out[1] = lerp(kW, kR, runW) * DEG * moveW;
    out[2] = lerp(fW, RUN.foot(uu), runW) * DEG * moveW;
    return out;
  };
  // The pelvis turns forward on the side of the leg that swings (most at its heel strike: yaw > 0 is
  // the right hip forward), drops on the swinging side just after the other heel strikes, and shifts
  // over the standing foot (less at speed, more for a heavy or old body).
  const u = m.phase / TAU;
  const idleShift = (1 - moveW) * Math.sin(t * 0.55 + m.seed * 7);
  const yawA = lerp(lerp(0.06, 0.1, fast), 0.11, runW) * moveW * (K.yaw ?? 1);
  const yaw = yawA * Math.cos(TAU * u);
  const rollA = (lerp(0.055, 0.04, fast) + 0.015 * old) * (1 - runW) + 0.03 * runW;
  const roll = -rollA * Math.sin(TAU * (u + 0.05)) * moveW + idleShift * 0.035;
  const wz = Math.sin(TAU * (u - 0.05));      // +1: the weight over the right foot
  const swayA = ((lerp(0.02, 0.012, fast) * (sty.sway || 1) + 0.01 * old) * (1 - runW) + 0.008 * runW) * (K.sway ?? 1);
  P[OFF] = -swayA * wz * moveW + idleShift * 0.014;
  // Planted feet. The stance foot touches down heel first at u = 0 and leaves from the toe at uTO;
  // the stride is whatever lets that contact point stay put while the body moves on, and during
  // the stance the hip angle is solved so it does (the gait curves alone skate the foot back and
  // forth, as the hip does not sweep linearly in time). The hip joints ride forward and back with the
  // pelvis' turn (fwd).
  const F = D.footLen, uTO = lerp(0.6, 0.285, runW);
  const ankX = (a) => thighL * Math.sin(a[0]) + shinL * Math.sin(a[0] - a[1]);
  const zHeel = (fp) => D.ankleY * Math.sin(fp) - 0.24 * F * Math.cos(fp);
  const zToe = (fp) => D.ankleY * Math.sin(fp) + 0.76 * F * Math.cos(fp);
  const fwdAt = (uu) => D.hipX * Math.sin(yawA * Math.cos(TAU * uu));   // the right hip joint's
  const heel = 0.17 * D.k;
  const extOf = (a) => thighL * Math.cos(a[0]) + shinL * Math.cos(a[0] - a[1]) + Math.sin(Math.max(0, -a[2])) * heel;
  const L1 = (thighL + shinL) * 0.997;
  const ankleAt = (fp, toe) => (toe ? D.ankleY * Math.cos(fp) - 0.76 * F * Math.sin(fp) : D.ankleY * Math.cos(fp) + 0.24 * F * Math.sin(fp));
  const reach = (X, fp, toe) => ankleAt(fp, toe) + Math.sqrt(Math.max(0, L1 * L1 - X * X)) - D.ankleY;
  // What depends only on the speed and the gait (the stride, the contact angles, the pelvis' range,
  // the landing path's start), cached per person while those stay the same (to the cm/s): most
  // people walk at a steady speed, and this is most of locomotion's cost.
  const w0 = K.land0 ?? 0.86;
  let gc = m.gc;
  if (!gc || Math.abs(gc.v - v) > 0.005 || gc.runW !== runW || gc.K !== K || gc.gw !== GAIT.walk) {
    gc = m.gc ||= { a0: [0, 0, 0] };
    gc.v = v; gc.runW = runW; gc.K = K; gc.gw = GAIT.walk;
    const a0 = legAt(0, gc.a0), a1 = legAt(uTO, _la1);
    gc.hx0 = ankX(a0) + zHeel(a0[2]);
    gc.S = Math.max(0.3, (gc.hx0 + F - ankX(a1) - zToe(a1[2]) + fwdAt(0) - fwdAt(uTO)) / uTO) * GAIT.walk;
    // the double support at a heel strike: the leading heel on its mark, the trailing toes on theirs
    const fpT = legAt(0.5, _la2)[2], xT = gc.hx0 + F - gc.S * 0.5 - zToe(fpT) + fwdAt(0) - fwdAt(0.5);
    gc.pvLow = Math.min(reach(gc.hx0 - zHeel(a0[2]), a0[2], false), reach(xT, fpT, true)) - 0.004;
    gc.pvHigh = extOf(legAt(0.28, _la2));
    gc.landRef = ankX(legAt(w0, _la2));
    gc.flOff = extOf(legAt(0.285, _la2)); gc.flOn = extOf(a0);
  }
  const a0 = gc.a0, hx0 = gc.hx0, S = gc.S;
  if (v > 0.01) m.phase += (TAU * v * dt) / S;
  const la = [0, 0, 0];
  for (const i of [0, 1]) {
    const uu = u + (i ? 0.5 : 0), side = i ? 1 : -1;
    const fwd = -side * D.hipX * Math.sin(yaw);
    legAt(uu, la);
    let [h, k, fp] = la;
    const uf0 = fract(uu);
    const toe = fp < -0.004 && uf0 > uTO * 0.3 && uf0 < 0.9;
    const xA = (toe ? hx0 + F - S * uf0 - zToe(fp) : hx0 - S * uf0 - zHeel(fp)) + fwdAt(0) - fwd;
    if (moveW > 0.02 && uf0 < uTO + 0.05) {
      let hh = h;
      for (let it = 0; it < 3; it++) { const f = thighL * Math.sin(hh) + shinL * Math.sin(hh - k) - xA; hh -= f / (thighL * Math.cos(hh) + shinL * Math.cos(hh - k)); }
      const bo = lerp(0.05, 0.012, runW);    // a running stance is short: hold the foot to toe-off
      h = lerp(h, hh, 1 - sstep(uTO - bo, uTO + bo, uf0));
    }
    // running: in the last part of the swing the heel comes down onto the point where it will land
    // (fixed on the ground), instead of skidding in at the body's speed
    if (moveW > 0.02 && runW > 0.01 && uf0 > 0.86) {
      const xA = hx0 + S * (1 - uf0) - zHeel(fp) + fwdAt(0) - fwd;
      let hh = h;
      for (let it = 0; it < 3; it++) { const f = thighL * Math.sin(hh) + shinL * Math.sin(hh - k) - xA; hh -= f / (thighL * Math.cos(hh) + shinL * Math.cos(hh - k)); }
      h = lerp(h, hh, sstep(0.86, 0.95, uf0) * runW);
    }
    // idle: weight on one leg, the other knee a little soft
    if (moveW < 1) {
      const ws = Math.sin(t * 0.55 + m.seed * 7);
      const soft = (i ? ws : -ws) > 0 ? 0.09 : 0.015;
      h += (1 - moveW) * soft * 0.5; k += (1 - moveW) * soft;
    }
    hipA[i] = h; _lh[i] = h; _lk[i] = k; _lf[i] = fp; _lx[i] = xA; _lt[i] = toe;
    const uf = fract(uu);
    swingA[i] = lerp(sstep(0.55, 0.65, uf) * (1 - sstep(0.92, 1, uf)), sstep(0.25, 0.32, uf) * (1 - sstep(0.95, 1, uf)), runW) * moveW;
    stanceA[i] = 1 - swingA[i];
    // (from the hip joint: the pelvis' tilt raises one and lowers the other)
    ext[i] = thighL * Math.cos(h) + shinL * Math.cos(h - k) + Math.sin(Math.max(0, -fp)) * heel - side * D.hipX * Math.sin(roll);
    // walking: the share of the body's weight on this leg, handed over during the double support
    // (the leading leg takes it from its heel strike, the trailing one keeps its toes down by IK)
    _lw[i] = sstep(-0.02, 0.06, uf > 0.9 ? uf - 1 : uf) * (1 - sstep(0.48, 0.56, uf));
  }
  // Pelvis height. Walking: a smooth double bump, highest over the standing leg at mid-stance and
  // lowest at the heel strike, as low as the leading heel and the trailing toes can both reach;
  // running: the supporting leg(s) reach the ground, in a flight phase a ballistic arc from take-off
  // to the other foot's touch-down.
  const sr = D.hipX * Math.sin(roll);
  const landX = (fp, i) => hx0 + S * (1 - fract(u + (i ? 0.5 : 0))) - zHeel(fp) + fwdAt(0) + (i ? 1 : -1) * D.hipX * Math.sin(yaw);
  let pvW = gc.pvHigh - Math.max(0, gc.pvHigh - gc.pvLow) * moveW * (0.5 - 0.5 * Math.cos(4 * PI * (u - 0.27)));
  // held below what each loaded foot can reach (the trailing foot only until the other heel is down:
  // after that its toes leave the ground when it can no longer reach them)
  for (const i of [0, 1]) {
    const uf = fract(u + (i ? 0.5 : 0)), side = i ? 1 : -1;
    if (uf > 0.52 && uf < 0.99) continue;
    const X = uf >= 0.99 ? landX(_lf[i], i) : _lx[i];
    pvW = Math.min(pvW, reach(X, _lf[i], _lt[i]) - side * sr);
  }
  let pv = -1;
  for (const i of [0, 1]) if (stanceA[i] > 0.5) pv = Math.max(pv, ext[i]);
  if (pv < 0) {
    const ur = fract(u), a = ur < 0.5 ? ur : ur - 0.5;
    const f = clamp((a - 0.285) / (0.5 - 0.285), 0, 1);
    pv = lerp(gc.flOff, gc.flOn, f) + 4 * f * (1 - f) * 0.06 * (sty.bounce || 1);
  }
  pv = moveW > 0.02 ? lerp(pvW, pv, runW) : pv;
  // Walking: the legs reach their marks by two-bone IK (hip and knee). A planted foot: its heel or toe
  // stays on its point on the ground (the trailing leg bends its knee to push off). The end of the
  // swing: the heel slows down onto the point where it will land and comes down to it, instead of
  // skimming in at the body's speed; in the swing the foot stays clear of the ground.
  if (moveW > 0.02 && runW < 0.999) {
    for (const i of [0, 1]) {
      const uf = fract(u + (i ? 0.5 : 0)), side = i ? 1 : -1;
      const fp = _lf[i], toe = _lt[i], hj = D.ankleY + pv + side * sr, ankH = ankleAt(fp, toe);
      const vert = thighL * Math.cos(_lh[i]) + shinL * Math.cos(_lh[i] - _lk[i]), cx = thighL * Math.sin(_lh[i]) + shinL * Math.sin(_lh[i] - _lk[i]);
      let X, Y, c;
      if (uf < uTO + 0.05) { X = _lx[i]; Y = ankH - hj; c = 1 - sstep(uTO - 0.05, uTO + 0.05, uf); }
      else {
        // (the lowest point of the foot above the ground, as the curves have it)
        const lowH = hj - vert - Math.max(ankH, ankleAt(fp, !toe));
        const minH = lerp(0.014, K.heelUp ?? 0.035, sstep(0.75, 0.86, uf)) * moveW;
        // (from w0 the heel follows a path that arrives on its landing point at the heel strike with no
        // speed over the ground: the landing point minus a gap that closes quadratically)
        const lift = sstep(minH * 2.5, minH, lowH), land = sstep(w0, w0 + 0.03, uf);
        const hT = Math.max(lowH, minH) * (1 - sstep(K.land1 ?? 0.94, 1, uf));
        const q = Math.max(0, (1 - uf) / (1 - w0)), gap = landX(fp, i) + S * (uf - w0) - gc.landRef;
        X = lerp(cx, landX(fp, i) - gap * q * q, land);
        Y = -vert + (hT - lowH);
        c = Math.max(land, lift) * sstep(uTO + 0.02, uTO + 0.1, uf);
      }
      c *= 1 - runW;
      if (c < 0.001) continue;
      const d = Math.min(Math.hypot(X, Y), (thighL + shinL) * 0.9999);
      const kk = Math.acos(clamp((d * d - thighL * thighL - shinL * shinL) / (2 * thighL * shinL), -1, 1));
      const hh = Math.atan2(X, -Y) + Math.atan2(shinL * Math.sin(kk), thighL + shinL * Math.cos(kk));
      _lh[i] = lerp(_lh[i], hh, c); _lk[i] = lerp(_lk[i], kk, c);
      ext[i] = thighL * Math.cos(_lh[i]) + shinL * Math.cos(_lh[i] - _lk[i]) + Math.sin(Math.max(0, -fp)) * heel - side * D.hipX * Math.sin(roll);
    }
  }
  P[OFF + 1] = pv - (thighL + shinL);
  P[OFF + 1] -= (1 - moveW) * 0.004;
  // The legs: each foot on its own line (step width W, feet under the hips when standing), turned out
  // a little; the pelvis' turn and tilt taken out of the thighs (thighRot), the sole kept level.
  const W = lerp(lerp(((K.width ?? 0.1) + 0.04 * old) * D.k, 0.06 * D.k, runW), 1.7 * D.hipX, 1 - moveW);
  const toeOut = ((K.toe ?? 5) + 7 * old) * DEG;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, h = _lh[i], k = _lk[i], fp = _lf[i];
    const ab = Math.atan2(side * W / 2 - (P[OFF] + side * D.hipX * Math.cos(roll)), Math.max(0.3, ext[i] + side * D.hipX * Math.sin(roll)));
    const thigh = i ? B.thighL : B.thighR, shin = i ? B.shinL : B.shinR, foot = i ? B.footL : B.footR;
    thighRot(P, thigh, h, ab, yaw, roll);
    P[shin * 3] = k;
    P[foot * 3] = h - k - fp; P[foot * 3 + 1] = side * toeOut; P[foot * 3 + 2] = -ab;
  }
  P[B.pelvis * 3 + 1] = yaw;
  P[B.pelvis * 3 + 2] = roll;
  // The trunk leans into the walk (more at speed, more on a run), the thorax turns against the
  // pelvis (the shoulders counter the hips, the head stays on the way ahead) and stays upright over the
  // tilting pelvis; an old body rocks a little over the standing foot.
  const stoop = (sty.stoop || 0) * 0.22;
  const lean = 0.02 + 0.06 * fast * (1 - runW) + 0.13 * runW + (sty.lean || 0) + stoop + (rollator ? 0.12 : 0) + 0.03 * old * moveW;
  P[B.spine * 3] = lean * 0.6;
  P[B.spine * 3 + 1] = -yaw * 0.85;
  P[B.spine * 3 + 2] = -roll * 0.7 + wz * (0.025 * old * (1 - runW) + 0.012 * runW) * moveW;
  const breath = Math.sin(t * 1.55 + m.seed * 3);
  P[B.chest * 3] = lean * 0.4 - 0.012 * breath * (1 - moveW * 0.5);
  P[B.chest * 3 + 1] = -yaw * 0.85;
  P[B.neck * 3] = -lean * 0.75 + stoop * 0.4 + 0.04 * old * moveW;
  P[B.neck * 3 + 1] = -(P[B.pelvis * 3 + 1] + P[B.spine * 3 + 1] + P[B.chest * 3 + 1]) + (1 - moveW) * 0.18 * Math.sin(t * 0.23 + m.seed * 11) * Math.sin(t * 0.11 + m.seed * 5);
  P[B.neck * 3 + 2] = -P[B.spine * 3 + 2] * 0.5;
  P[B.head * 3] = -lean * 0.15 + (1 - moveW) * 0.03 * Math.sin(t * 0.4 + m.seed * 2);
  // Arms: they swing from the shoulder against the legs (a little behind them), wider and with more
  // bent elbows the faster the walk; on a run bent ~85 deg and pumping, the hands coming in towards the
  // middle on the forward swing (an old runner: elbows out). Standing: elbows a little bent, the arms
  // close in (no A-pose), drifting slowly with the weight shift.
  const swing = ((0.17 + 0.3 * fast) * (1 - runW) + 0.62 * (1 - 0.15 * old) * runW) * moveW * (sty.swing || 1) * (sty.stiff ? 0.8 : 1);
  const idle = 1 - moveW, drift = Math.sin(t * 0.55 + m.seed * 7);
  const elbow = 0.18 + 0.1 * idle + 0.42 * fast * (1 - runW) + 1.25 * runW + (sty.stiff ? 0.05 : 0) + 0.06 * old * moveW;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR, hand = i ? B.handL : B.handR;
    const cw = WALK_ARM(u + (i ? 0.5 : 0) - 0.03);
    const a = cw * swing + idle * (0.035 + 0.025 * Math.sin(t * 0.37 + m.seed * 4 + i * 2.1));
    const out = (m.armOut || 0.08) * (1 - 0.3 * idle) + 0.012 * idle + (0.05 + 0.06 * old) * runW + 0.012 * breath * idle + 0.012 * idle * drift * side;
    // (running, the upper arm swings mostly behind the body: the elbow goes well back, the hand only
    // comes up to the chest in front)
    P[arm * 3] = -a - 0.02 + 0.24 * runW * moveW;
    P[arm * 3 + 1] = side * (0.05 + 0.1 * Math.max(0, cw)) * runW;
    P[arm * 3 + 2] = side * (out - 0.03 * Math.max(0, cw) * moveW * (1 + 2 * runW));
    P[fore * 3] = -(elbow + 0.3 * Math.max(0, a) * (1 + brisk) - 0.12 * runW * cw);
    P[fore * 3 + 1] = -side * (0.25 + 0.2 * runW);
    P[hand * 3] = -0.08;
    P[hand * 3 + 2] = side * 0.06;
    handShape(P, i, 'relax');
    if (runW > 0) handShape(P, i, 'fist', runW * 0.55);
  }
  if (rollator) {
    const Q = m.Q;
    for (const i of [0, 1]) {
      gripBar(m, P, Q, i, (i ? 1 : -1) * 0.24, 0.869 * D.k, 0.19, 0, 0.07, 1, 0, -1, 0, (i ? 1 : -1) * 0.6, -0.3, -0.5);
      for (const b of i ? ARM_L : ARM_R) for (let k = 0; k < 3; k++) P[b * 3 + k] = Q[b * 3 + k];
    }
    m.aid.position.set(0, 0, 0);
  } else if (stick) {
    P[B.armR * 3] = -0.12 - 0.15 * WALK_ARM(u + 0.52) * moveW;
    P[B.foreR * 3] = -0.45;
    handShape(P, 0, 'grip');
  }
  if (m.d.clipboard) { P[B.armL * 3] *= 0.35; P[B.foreL * 3] = -0.12; P[B.armL * 3 + 2] = (m.armOut || 0.08) + 0.06; P[B.foreL * 3 + 1] = 0.4; handShape(P, 1, 'board'); }
  m.handScale[0] = m.handScale[1] = 1; m.fingScale[0] = m.fingScale[1] = 1;
  if (sty.pockets && !rollator && !stick && D.torsoSurf) {
    // hands in pockets: the coat's side pockets (the hand slides in, out of sight), or under a short
    // jacket the jeans' front pockets with the thumbs out. Elbows close to the body.
    const Q = m.Q, w = 1 - moveW * 0.3;
    const coat = m.d.coat.pockets && D.hemY < D.hipY - 0.03;
    for (const i of [0, 1]) {
      const side = i ? 1 : -1;
      if (coat) {
        const py = Math.max(D.hemY + 0.1, D.hipY - 0.04), sp = D.torsoSurf(side * 0.95, py), r = Math.hypot(sp.x, sp.z) || 1;
        bodyToChest(m, P, sp.x * (1 - 0.02 / r), py + 0.03, sp.z * (1 - 0.02 / r), _T);
        armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.4, -0.2, -0.8);
        aimHand(m, P, Q, i, side * 0.15, -1, 0.35, -side * 0.6, 0, -0.5);
        handShape(Q, i, 'pocket');
        m.handScale[i] = lerp(1, 0.55, w);
      } else {
        // the jeans' front pocket: the opening slants down from the hip towards the crotch
        bodyToChest(m, P, side * (D.hipX + 0.06), D.hipY + 0.045, (D.legFrontZ ?? 0.1) - 0.004, _T);
        armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.7, -0.1, -0.6);
        aimHand(m, P, Q, i, -side * 0.35, -1, 0.05, -side * 0.35, 0, -1);
        handShape(Q, i, [0.15, 0.1, -0.15, -0.35, 0]);
        m.handScale[i] = lerp(1, 0.85, w);
        m.fingScale[i] = lerp(1, 0.3, w);
      }
      lerpBones(P, Q, w, i ? ARM_L : ARM_R);
    }
  }
  // pregnant: now and then a hand rests on the bump while standing
  if (m.d.pregnant && D.bumpY && moveW < 0.99) {
    const w = (1 - moveW) * sstep(-0.2, 0.4, Math.sin(t * 0.19 + m.seed * 5)), Q = m.Q;
    if (w > 0.01) {
      const y = D.bumpY + 0.04, fz = D.frontZ(y);
      bodyToChest(m, P, 0.045, y + 0.035, fz + 0.03, _T);
      armIK(m, Q, 1, _T.x, _T.y, _T.z, 0.8, -0.3, -0.2);
      aimHand(m, P, Q, 1, -0.75, -0.35, 0.25, 0.25, 0.3, -1);
      handShape(Q, 1, 'talk');
      lerpBones(P, Q, w, ARM_L);
    }
  }
}

function wheelchairPose(m, st, dt, P) {
  const D = m.D, t = st.t || 0, v = st.speed || 0;
  P.fill(0);
  seatBase(m, P, 0.58);
  // pushing the rims when moving, hands in the lap otherwise (and while the chair rolls on by
  // itself: st.coast, game/rune.js)
  const mv = st.coast ? 0 : sstep(0.05, 0.4, v);
  m.pushPh = (m.pushPh || 0) + dt * (0.8 + v * 0.9);
  const ph = fract(m.pushPh);
  const Q = m.Q;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    // lap
    bodyToChest(m, P, side * 0.09, 0.62, 0.24, _T);
    armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.8, -0.2, -0.4);
    aimHand(m, P, Q, i, -side * 0.6, -0.2, 0.7, 0, -1, 0);
    handShape(Q, i, 'limp');
    for (const b of i ? ARM_L : ARM_R) for (let k = 0; k < 3; k++) P[b * 3 + k] = Q[b * 3 + k];
    if (mv > 0.01) {
      const z = ph < 0.6 ? lerp(-0.12, 0.16, ph / 0.6) : lerp(0.16, -0.12, (ph - 0.6) / 0.4);
      const y = ph < 0.6 ? 0.56 + 0.04 * Math.sin((ph / 0.6) * PI) : 0.64;
      const a = Math.atan2(z, y - 0.3), ca = Math.cos(a), sa = Math.sin(a);   // on the hand rim, round the hub
      gripBar(m, P, Q, i, side * 0.335, 0.3 + 0.255 * ca, -0.07 + 0.255 * sa, 0, -sa, ca, -side * 0.5, -0.85 * ca, -0.85 * sa, side * 0.5, 0.2, -0.8, 'grip', 0.09, 0.024);
      lerpBones(P, Q, mv, i ? ARM_L : ARM_R);
    }
  }
  P[B.spine * 3] += 0.1 + 0.08 * mv;
  P[B.neck * 3] += -0.05 + 0.05 * Math.sin(t * 0.3 + m.seed * 4);
  P[B.neck * 3 + 1] = 0.25 * Math.sin(t * 0.17 + m.seed * 8) * Math.sin(t * 0.07);
}

// Sitting with the hip joints at hipH above the ground (seat height + ~0.1 m).
function seatBase(m, P, hipH) {
  const D = m.D;
  P[OFF + 1] = hipH - D.hipY;
  P[B.pelvis * 3] = -0.12;
  for (const i of [0, 1]) {
    const thigh = i ? B.thighL : B.thighR, shin = i ? B.shinL : B.shinR, foot = i ? B.footL : B.footR;
    P[thigh * 3] = -PI / 2 + 0.12 + 0.02;
    P[thigh * 3 + 2] = (i ? 1 : -1) * 0.05;
    P[shin * 3] = PI / 2 - 0.04;
    P[foot * 3] = 0.02;
  }
  P[B.spine * 3] = 0.05; P[B.chest * 3] = 0.02; P[B.neck * 3] = 0.06;
}

function seatPose(m, st, Q, t) {
  const D = m.D;
  Q.fill(0);
  Q[OFF + 1] = 0;
  Q[B.pelvis * 3] = -0.22;
  for (const i of [0, 1]) {
    const thigh = i ? B.thighL : B.thighR, shin = i ? B.shinL : B.shinR, foot = i ? B.footL : B.footR;
    Q[thigh * 3] = -1.46 + 0.22;
    Q[thigh * 3 + 2] = (i ? 1 : -1) * 0.06;
    Q[shin * 3] = 1.25;
    Q[foot * 3] = -0.1;
  }
  Q[B.spine * 3] = -0.02; Q[B.chest * 3] = 0.0; Q[B.neck * 3] = 0.2;
  Q[B.neck * 3 + 1] = (st.look || 0) * 0.5;
  const driving = st.driving ?? true;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    if (driving) {
      // the car's wheel (carmodels interior): centre 0.5 m above and ahead of the seat point, rim
      // radius 0.19, tilted back 0.45 rad. Hands at ten to two, palms towards the rim.
      const cy = D.hipY + 0.38, cz = 0.38, R = 0.19, th = side * 1.05 + Math.sin(t * 2.1 + i) * 0.015;
      const uy = Math.cos(0.45), uz = -Math.sin(0.45), ny = Math.sin(0.45), nz = Math.cos(0.45);   // wheel up / normal
      const sx = Math.sin(th), cx = Math.cos(th);
      const px = R * sx, py = cy + R * cx * uy, pz = cz + R * cx * uz;
      // the rim's tangent towards the top, the palm: forwards (the wheel's normal) and inwards
      const tx = -side * cx, ty = side * sx * uy, tz = side * sx * uz;
      gripBar(m, Q, Q, i, px, py, pz, tx, ty, tz, -0.62 * sx, 0.62 * ny - 0.6 * cx * uy, 0.62 * nz - 0.6 * cx * uz, side * 0.5, -0.9, -0.1);
    } else {
      bodyToChest(m, Q, side * 0.11, D.hipY + 0.1, 0.27 * D.k, _T);
      armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.8, -0.2, -0.3);
      aimHand(m, Q, Q, i, -side * 0.2, -0.45, 1, 0, -1, 0);
      handShape(Q, i, 'relax');
    }
  }
}

// Pushing a wheelchair: hands on its push handles (0.75 m ahead of the root, see buildWheelchair).
function pushPose(m, P, Q, t) {
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    gripBar(m, P, Q, i, side * 0.225, 0.945, 0.43, 0.05 * side, 0.15, 1, 0, -1, 0, side * 0.6, -0.6, -0.3);
  }
}

// Talking: small nods on the stresses and slow head tilts; both hands up in front of the waist, the
// leading one making continuous small beats (the palm turning up and over), the other lower and
// quieter; they swap every few seconds. The jaw is driven in animateCharacter.
function talkPose(m, st, P, Q, t, w, wheel) {
  const s = m.seed * 10;
  P[B.neck * 3] += w * (0.045 * Math.sin(t * 2.6 + s) * Math.max(0, Math.sin(t * 0.9 + s)) + 0.02);
  P[B.neck * 3 + 1] += w * 0.07 * Math.sin(t * 0.7 + s);
  P[B.head * 3 + 2] += w * 0.05 * Math.sin(t * 0.5 + s * 2);
  if (wheel) return;
  const D = m.D, fz = D.frontZ ? D.frontZ(D.spineY) : 0.15;
  const swap = sstep(-0.5, 0.5, Math.sin(t * 0.33 + s));       // 1: the right hand leads
  const castI = m.d.cast ? (m.d.cast === 'L' ? 1 : 0) : -1;
  for (const i of [0, 1]) {
    if ((m.d.clipboard && i === 1) || i === castI) continue;
    const side = i ? 1 : -1, ld = i ? 1 - swap : swap;
    const beat = Math.sin(t * 5.4 + s + i * 1.7) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 1.3 + s + i * 2)));
    const x = side * D.S * lerp(0.7, 0.8, ld), y = D.spineY - D.chestY + lerp(-0.08, 0.01, ld) + 0.02 * beat * ld;
    const z = fz + lerp(0.05, 0.13, ld) + 0.012 * beat * ld;
    armIK(m, Q, i, x, y, z, side * 0.8, -0.45, -0.25);
    // the palm turns between facing in and facing up with the beats; the quiet hand faces in
    const up = ld * (0.25 + 0.35 * beat);
    aimHand(m, P, Q, i, side * lerp(0.1, 0.3, ld), lerp(-0.5, 0.05, ld) + 0.1 * beat * ld, 1, -side * (1 - 0.5 * up), up, 0.1);
    handShape(Q, i, 'talk');
    lerpBones(P, Q, w * (0.75 + 0.25 * ld), i ? ARM_L : ARM_R);
  }
}
// Listening (st.listen): attentive, now and then a small nod, the head a little tilted.
function listenPose(m, P, t, w) {
  const s = m.seed * 10, nod = Math.pow(Math.max(0, Math.sin(t * 1.05 + s)), 6);
  P[B.neck * 3] += w * (0.03 + 0.07 * nod * (0.5 + 0.5 * Math.sin(t * 7.5)));
  P[B.head * 3 + 2] += w * 0.06 * Math.sin(t * 0.3 + s);
  P[B.neck * 3 + 1] += w * 0.04 * Math.sin(t * 0.21 + s * 3);
}

// Cold (st.shiver, game/cold.js): hunched against it (the back rounded, the head drawn down between
// the shoulders) and a fine, fast tremble through the trunk and the head, in fits (it comes and goes
// every second or so). The hands go into the pockets: game/cold.js sets style.pockets meanwhile.
function shiverPose(m, P, t, w) {
  const fit = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.1 + m.seed * 6)) ** 2;
  const a = (Math.sin(t * 47) * 0.6 + Math.sin(t * 31 + 1.3) * 0.4) * fit * w, b = Math.sin(t * 39 + 0.7) * fit * w;
  P[B.spine * 3] += 0.07 * w; P[B.chest * 3] += 0.06 * w;
  P[B.neck * 3] += 0.14 * w; P[B.head * 3] -= 0.06 * w;
  P[B.chest * 3 + 2] += 0.014 * a; P[B.spine * 3 + 1] += 0.012 * b;
  P[B.neck * 3 + 2] += 0.012 * b; P[B.head * 3 + 1] += 0.016 * a;
  for (const k of [B.armR, B.armL]) P[k * 3] += 0.02 * a;
}

// Dead in his wheelchair (Rune, game/rune.js): sunk down and forward, the head fallen onto his chest
// and over to one side, one hand slid off his lap to hang beside the wheel.
function slumpPose(m, P, Q, w) {
  const D = m.D;
  P[B.spine * 3] += 0.2 * w; P[B.chest * 3] += 0.1 * w;
  P[B.neck * 3] += 0.6 * w; P[B.head * 3] += 0.2 * w;
  P[B.neck * 3 + 1] *= 1 - w;
  P[B.neck * 3 + 2] += 0.14 * w; P[B.head * 3 + 2] += 0.26 * w;
  // the left arm: down beside the wheel, the hand limp
  bodyToChest(m, P, 0.42, 0.46, 0.1, _T);
  armIK(m, Q, 1, _T.x, _T.y, _T.z, 0.8, 0, -0.6);
  aimHand(m, P, Q, 1, 0.05, -1, 0.1, -1, 0, 0);
  handShape(Q, 1, 'limp');
  lerpBones(P, Q, w, ARM_L);
}

// Grief (Anita once Rune is dead, game/rune.js): the head bowed, her right hand over her eyes, the
// left across her waist; while she sobs (st.sob, 0..1) her shoulders heave.
const _gE = new THREE.Vector3(), _gF = new THREE.Vector3(), _gP = new THREE.Vector3();
function griefPose(m, st, P, Q, t, w) {
  const D = m.D, hp = m.headP, k = D.hand / 0.19, s = m.seed * 10;
  const sob = clamp(st.sob || 0, 0, 1), heave = sob * Math.max(0, Math.sin(t * 7.5 + s)) ** 2 * (0.6 + 0.4 * Math.sin(t * 1.9 + s));
  P[B.spine * 3] += w * (0.07 + 0.03 * heave); P[B.chest * 3] += w * (0.04 + 0.05 * heave);
  P[B.neck * 3] += w * (0.3 + 0.04 * heave); P[B.head * 3] += w * 0.12;
  if (!hp) return;
  // the right palm over the eyes: the fingers up and across the brow, the palm to the face
  headFrame(m, P, _hf);
  _gE.set(-0.03 * hp.Hh, hp.chinY + 0.56 * hp.Hh - D.headY, hp.z0 + 0.62 * hp.Hh - D.headZ).applyMatrix4(_hf);
  _gF.set(0.5, 0.86, 0.1).transformDirection(_hf);
  _gP.set(0.05, 0, -1).transformDirection(_hf);
  bodyToChest(m, P, _gE.x - _gF.x * 0.085 * k - _gP.x * 0.02 * k, _gE.y - _gF.y * 0.085 * k - _gP.y * 0.02 * k, _gE.z - _gF.z * 0.085 * k - _gP.z * 0.02 * k, _T);
  armIK(m, Q, 0, _T.x, _T.y, _T.z, -0.5, -0.9, 0.1);
  aimHand(m, P, Q, 0, _gF.x, _gF.y, _gF.z, _gP.x, _gP.y, _gP.z);
  handShape(Q, 0, 'relax');
  lerpBones(P, Q, w, ARM_R);
  // the left forearm across the waist
  const fz = D.frontZ ? D.frontZ(D.spineY) : 0.15;
  armIK(m, Q, 1, -0.04 * k, D.spineY + 0.04 - D.chestY, fz + 0.09 * k, 0.7, -0.6, -0.2);
  aimHand(m, P, Q, 1, -1, 0.15, 0.1, 0, 0, -1);
  handShape(Q, 1, 'relax');
  lerpBones(P, Q, w, ARM_L);
}

function wavePose(m, P, Q, t) {
  const D = m.D;
  const wag = Math.sin(t * 8) * 0.045;
  armIK(m, Q, 1, D.S + 0.22 + wag, D.shJ - D.chestY + 0.2, 0.12, 1, -0.7, 0.1);
  aimHand(m, P, Q, 1, 0.15 + wag * 3, 1, 0.05, 0, 0.1, 1);
  handShape(Q, 1, 'open');
}

// A 'yes!': the right fist pulled down to chest height, the elbow driven back to the hip, pumping.
function cheerPose(m, P, Q, t) {
  const D = m.D, k = D.k;
  const fz = D.frontZ ? D.frontZ(D.chestY) : 0.14;
  const pump = 0.06 * Math.pow(Math.max(0, Math.sin(t * 8.5)), 2);
  bodyToChest(m, P, -0.12 * k, D.chestY - 0.04 * k - pump, fz + 0.12, _T);
  armIK(m, Q, 0, _T.x, _T.y, _T.z, -0.25, -1, -0.5);
  aimHand(m, P, Q, 0, 0.25, 1, 0.45, 0.9, -0.15, 0.25);
  handShape(Q, 0, 'fist');
}

// A fright (the horn, feature tuta_med_bilen): both hands thrown up in front of the face, palms out
// and fingers spread, the elbows out and down, a tremble; the trunk and head pulled back. An arm in a
// cast stays in its sling. Applied over everything up to the jump's poses (a leap keeps it).
function frightPose(m, P, Q, t, w) {
  const D = m.D, k = D.k || 1;
  const fz = D.frontZ ? D.frontZ(D.chestY) : 0.14;
  const castI = m.d.cast ? (m.d.cast === 'L' ? 1 : 0) : -1;
  for (const i of [0, 1]) {
    if (i === castI) continue;
    const side = i ? 1 : -1, tr = 0.008 * Math.sin(t * 31 + i * 2) * k;
    armIK(m, Q, i, side * (D.S * 0.62 + 0.03 * k), D.shJ - D.chestY + 0.13 * k + tr, fz + 0.2 * k, side, -0.75, -0.15);
    aimHand(m, P, Q, i, side * 0.3, 1, 0.12, 0, 0.1, 1);
    handShape(Q, i, 'open');
    lerpBones(P, Q, w, i ? ARM_L : ARM_R);
  }
  P[B.spine * 3] -= 0.1 * w;
  P[B.neck * 3] -= 0.12 * w;
}

// A fist shaken at a car (the horn): the right fist (the left one for a cast on the right) raised in
// front of the shoulder, knuckles out, shaking.
function fistPose(m, P, Q, t, w) {
  const D = m.D, k = D.k || 1;
  const fz = D.frontZ ? D.frontZ(D.chestY) : 0.14;
  const i = m.d.cast && m.d.cast !== 'L' ? 1 : 0, side = i ? 1 : -1;
  const sh = 0.035 * k * Math.sin(t * 15);
  armIK(m, Q, i, side * (D.S + 0.04 * k), D.shJ - D.chestY + 0.27 * k + sh, fz + 0.17 * k, side * 0.8, -0.7, -0.2);
  aimHand(m, P, Q, i, side * 0.1, 1, 0.25, -side * 0.3, 0, -1);
  handShape(Q, i, 'fist');
  lerpBones(P, Q, w, i ? ARM_L : ARM_R);
  P[B.spine * 3] += 0.04 * w;
}

// Where a carried thing sits (world space) for a model in the carry pose: on top of the right forearm,
// a little nearer the elbow than the hand, and at least a cat's half-width in front of the chest.
// Put the cat's root here with the carrier's yaw + 90 deg (its head towards the carrier's left) and
// call cat.hold(true). Call after animateCharacter (+ updateMatrixWorld).
const _cpA = new THREE.Vector3(), _cpB = new THREE.Vector3();
export function carryPoint(m, out = new THREE.Vector3()) {
  m.fores[0].getWorldPosition(_cpA); m.hands[0].getWorldPosition(_cpB);
  out.copy(_cpA).lerp(_cpB, 0.68);
  m.root.worldToLocal(out);
  const fz = m.D.frontZ ? m.D.frontZ(m.D.chestY) : 0.14;
  out.z = Math.max(out.z, fz + 0.06 * m.D.k);
  out.y += 0.03 * m.D.k;
  return m.root.localToWorld(out);
}

// Carrying something at chest height (the cat): the right forearm across the front under it, palm
// up (its belly on the forearm, the rump in the crook of the elbow), the left hand over its back, the
// elbows in, looking down at it.
function carryPose(m, P, Q, t) {
  const D = m.D, k = D.k;
  const fz = D.frontZ ? D.frontZ(D.chestY) : 0.14, br = 0.004 * Math.sin(t * 1.6);
  bodyToChest(m, P, 0.085 * k, D.chestY - 0.07 * k + br, fz + 0.16 * k, _T);
  armIK(m, Q, 0, _T.x, _T.y, _T.z, -0.5, -0.9, 0.1);
  aimHand(m, P, Q, 0, 1, 0.15, 0.25, -0.1, 1, 0.1);
  handShape(Q, 0, 'carry');
  bodyToChest(m, P, -0.06 * k, D.chestY + 0.07 * k + br, fz + 0.15 * k, _T);
  armIK(m, Q, 1, _T.x, _T.y, _T.z, 0.9, 0.1, -0.3);
  aimHand(m, P, Q, 1, -0.7, -0.6, 0.4, 0.0, -0.9, -0.3);
  handShape(Q, 1, 'carry');
}

const _sS = new THREE.Vector3(), _sL = new THREE.Vector3(), _sR = new THREE.Vector3(), _sP = new THREE.Vector3();
// Working with the hands (hold-E jobs). st.workKind: 'bend' (default: bent over, hands at knee
// height), 'low' (crouched, hands near the ground: a tyre), 'shovel' (bent, both hands on a shaft,
// pushing and lifting), 'wall' (standing, hands at waist/chest height: a radiator). Whole body.
function workPose(m, st, P, Q, t) {
  const D = m.D, k = D.k, kind = st.workKind || 'bend';
  Q.set(P);
  if (kind === 'door') { doorPose(m, st, Q); return; }
  const thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY;
  const [hf, kf, bend, chest] = kind === 'low' ? [1.3, 2.05, 0.38, 0.1] : kind === 'shovel' ? [0.62, 0.95, 0.6, 0.12] : kind === 'wall' ? [0.06, 0.1, 0.14, 0.04] : [0.32, 0.5, 0.62, 0.16];
  for (const i of [0, 1]) {
    const lean = kind === 'shovel' ? (i ? 0.22 : -0.1) : 0;   // a shoveller stands with one foot forward
    const h = hf + lean, kk = kf + (kind === 'shovel' && i ? 0.15 : 0);
    Q[(i ? B.thighL : B.thighR) * 3] = -h; Q[(i ? B.thighL : B.thighR) * 3 + 1] = 0; Q[(i ? B.thighL : B.thighR) * 3 + 2] = (i ? 1 : -1) * (kind === 'low' ? 0.22 : 0.06);
    Q[(i ? B.shinL : B.shinR) * 3] = kk; Q[(i ? B.footL : B.footR) * 3] = h - kk;
  }
  const ext = thighL * Math.cos(hf) + shinL * Math.cos(hf - kf), fwd = thighL * Math.sin(hf) + shinL * Math.sin(hf - kf);
  Q[OFF] = 0; Q[OFF + 1] = ext - (thighL + shinL); Q[OFF + 2] = -fwd - Math.sin(bend) * 0.08;
  Q[B.pelvis * 3] = 0; Q[B.pelvis * 3 + 1] = 0; Q[B.pelvis * 3 + 2] = 0;
  Q[B.spine * 3] = bend; Q[B.spine * 3 + 1] = 0; Q[B.spine * 3 + 2] = 0;
  Q[B.chest * 3] = chest; Q[B.chest * 3 + 1] = 0.05 * Math.sin(t * 2.2);
  Q[B.neck * 3] = -bend * 0.45 + 0.25; Q[B.neck * 3 + 1] = 0; Q[B.head * 3] = 0.1;
  const ph = t * (kind === 'shovel' ? 3.2 : 6.5);
  const hipF = Math.max(0.15, (D.hipY + Q[OFF + 1]) * 0.55);
  if (kind === 'shovel') {
    // the shovel (props 'shovel', on the right hand): the left hand on the T-grip in front of the
    // left hip, the right hand 0.55 m down the shaft, the blade on the snow ahead; push it in, lift
    const push = 0.08 * Math.sin(ph), lift = Math.max(0, Math.sin(ph - 1.3));
    const ang = 0.76 - 0.2 * lift, hy = D.hipY + Q[OFF + 1];
    _sS.set(-0.14, -Math.sin(ang), Math.cos(ang)).normalize();
    _sL.set(0.07 * k, hy - 0.02 + 0.08 * lift, 0.24 * k + push);
    _sR.copy(_sL).addScaledVector(_sS, 0.57);
    _sP.set(0, 1, 0).addScaledVector(_sS, -_sS.y).normalize();
    gripBar(m, Q, Q, 0, _sR.x, _sR.y, _sR.z, _sS.x, _sS.y, _sS.z, _sP.x, _sP.y, _sP.z, -0.6, -0.7, 0.1, 'grip');
    // the T-grip: across the shaft at its top, gripped from above
    _sL.addScaledVector(_sS, -0.015);
    gripBar(m, Q, Q, 1, _sL.x, _sL.y, _sL.z, -1, 0, -0.1, 0, -1, 0.2, 0.7, -0.5, -0.3, 'grip');
    return;
  }
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, s = Math.sin(ph + i * 1.9), c = Math.cos(ph * 0.5 + i);
    let x, y, z, fd = [0, -0.4, 1], pn = [0, -1, 0];
    if (kind === 'shovel') {
      // the lower (right) hand on the shaft near the blade, the upper (left) at the grip; push + lift
      const push = 0.12 * Math.sin(ph), lift = 0.08 * Math.max(0, Math.sin(ph - 1.2));
      if (i === 0) { x = -0.04 * k; y = D.kneeY + Q[OFF + 1] + 0.06 + lift; z = 0.56 * k + push; fd = [0.9, 0.2, 0.3]; pn = [0, 1, -0.2]; }
      else { x = 0.1 * k; y = D.hipY + Q[OFF + 1] - 0.02 + lift * 0.4; z = 0.2 * k + push * 0.6; fd = [-0.8, -0.1, 0.5]; pn = [0, -0.3, -1]; }
    } else if (kind === 'wall') { x = side * 0.11 * k + 0.02 * c; y = D.spineY + 0.12 + 0.03 * s; z = 0.4 * k + 0.02 * c; fd = [0, 0.1, 1]; pn = [-side * 0.2, 0, 1]; }
    else if (kind === 'low') { x = side * 0.13 * k + 0.02 * c; y = 0.22 * k + 0.05 * s; z = 0.42 * k + 0.04 * c; }
    else { x = side * 0.13 * k + 0.02 * c; y = hipF + 0.05 * s; z = 0.48 * k + 0.05 * c; }
    bodyToChest(m, Q, x, y, z, _T);
    armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.7, -0.4, -0.4);
    aimHand(m, Q, Q, i, fd[0], fd[1], fd[2], pn[0], pn[1], pn[2]);
    handShape(Q, i, kind === 'shovel' ? 'grip' : 'carry');
    if (kind !== 'shovel') handShape(Q, i, 'grip', 0.4 + 0.3 * Math.max(0, s));
  }
}

// At the garage door ('door' work, main.js): both hands a shoulder's width apart on what st.reach
// gives in body space, [height above the soles, ahead, to the left] - the handle, or the bottom edge
// of the open door overhead. Overhand low down, the palms turning to the door as the hands go up;
// he leans in to reach low and stretches up (looking up) to reach high. st.tug (0..1): a pull back
// on the handle, the weight going back onto the heels. Standing: the legs keep the stance under it.
function doorPose(m, st, Q) {
  const D = m.D, k = D.k, r = st.reach || [D.hipY + 0.1, 0.45 * k, 0], tug = st.tug || 0;
  const ry = r[0], rz = r[1], rx = r[2] || 0;
  const hi = sstep(D.chestY, D.headY + 0.15, ry), low = 1 - sstep(D.hipY - 0.05, D.chestY, ry);
  const far = sstep(0.42 * k, 0.75 * k, rz);
  Q[B.spine * 3] = 0.06 + 0.2 * low * (0.4 + far) + 0.08 * far * (1 - hi) - 0.07 * hi - 0.13 * tug;
  Q[B.spine * 3 + 1] = 0; Q[B.spine * 3 + 2] = 0;
  Q[B.chest * 3] = 0.03 + 0.05 * low - 0.06 * hi - 0.05 * tug; Q[B.chest * 3 + 1] = 0; Q[B.chest * 3 + 2] = 0;
  Q[B.neck * 3] = 0.22 * (1 - hi) - 0.42 * hi; Q[B.neck * 3 + 1] = 0;
  Q[B.head * 3] = 0.08 * (1 - hi) - 0.12 * hi;
  // the knees give a little when he reaches low, and against a tug
  for (const i of [0, 1]) {
    const bend = 0.12 * low + 0.1 * tug;
    Q[(i ? B.thighL : B.thighR) * 3] -= bend; Q[(i ? B.shinL : B.shinR) * 3] += bend * 2; Q[(i ? B.footL : B.footR) * 3] -= bend;
  }
  Q[OFF + 1] -= 0.02 * low + 0.025 * tug;
  Q[OFF + 2] -= 0.04 * tug;
  const ny = -(1 - hi), nz = 0.25 + 0.75 * hi;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    gripBar(m, Q, Q, i, rx + side * 0.2 * k, ry, rz, -side, 0, 0, 0, ny, nz, side * 0.7, -0.6, -0.2 + 0.3 * hi, 'grip');
  }
}

// Down on one knee (Sonja's grave, st.kneel): the right knee on the ground with the shin and the foot
// lying behind it, the left foot planted forward (shin near vertical, thigh about level), the torso
// upright, the head bowed, the eyes down. Hands, by st.kneelReach (0..1) if it is a number, else by an
// automatic sequence from the moment st.kneel is set (m.kneelT): holding flowers at the waist while
// going down (~0.5 s), reaching forward and down to lay them on the ground ~0.45 m ahead of the root
// (0.6-2.3 s, the back leaning in), straightening up with the hands resting on the forward knee (from
// ~2.9 s). kneelPoint(m) is the point between the hands (where the bouquet's stems are held).
// A scene may take the hands and the head itself (day 3's radiator, game/luftning.js): st.hands =
// [right, left], each null (as above) or { p: [x, y, z] (body space: y above the soles, z ahead, x to
// the left), fd, pn (the fingers' direction and the palm's normal, body space), shape (HANDS), pole
// (the elbow's pole, chest space) }; st.lean (rad: the back bends further in), st.head ([neck pitch,
// neck yaw, head roll] added: an ear to the radiator, a look up at the window).
const _kR = new THREE.Vector3(), _kL = new THREE.Vector3(), _kA = new THREE.Vector3();
function kneelPose(m, st, P, Q, t) {
  const D = m.D, k = D.k, T = m.kneelT;
  Q.set(P);
  const thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY;
  const manual = typeof st.kneelReach === 'number';
  const reach = manual ? clamp(st.kneelReach, 0, 1) : sstep(0.6, 1.35, T) * (1 - sstep(2.2, 2.9, T));
  const rest = manual ? 1 : sstep(1.9, 2.7, T);              // the flowers are down: hands to the knee
  // legs: the kneeling (right) thigh near vertical, its knee ~5 cm off the ground; the hip height
  // follows, and the forward (left) thigh is solved so its foot stands flat on the ground
  const kneelA = 0.05, H = thighL * Math.cos(kneelA) + 0.055 * k;
  const sa = 0.18;                                            // the forward shin leans, knee over the toes
  const h = Math.acos(clamp((H - D.ankleY - shinL * Math.cos(sa)) / thighL, -1, 1));
  set3(Q, B.thighR, kneelA, 0, -0.05); set3(Q, B.shinR, PI / 2 - kneelA + 0.07, 0, 0); set3(Q, B.footR, 1.15, 0, 0);
  set3(Q, B.thighL, -h, 0, 0.1); set3(Q, B.shinL, h + sa, 0, 0); set3(Q, B.footL, -sa, 0, 0);
  Q[OFF] = 0; Q[OFF + 1] = H - D.hipY - 0.02 * reach; Q[OFF + 2] = (-0.12 + 0.05 * reach) * k;
  set3(Q, B.pelvis, 0.12 * reach, 0.06, 0);
  // the back upright, leaning in to lay the flowers; the head bowed (a small nod while talking)
  set3(Q, B.spine, 0.04 + 0.62 * reach + (st.lean || 0), -0.04, 0); set3(Q, B.chest, 0.03 + 0.16 * reach, 0, 0);
  set3(Q, B.neck, 0.3 - 0.2 * reach + (st.talk ? 0.04 * Math.sin(t * 2.3) : 0), 0.04, 0); set3(Q, B.head, 0.14, 0, 0);
  if (st.head) { Q[B.neck * 3] += st.head[0]; Q[B.neck * 3 + 1] += st.head[1]; Q[B.head * 3 + 2] += st.head[2]; }
  // hands: holding the stems at the waist / laying them on the ground ahead / resting on the knee
  const kz = Q[OFF + 2] + thighL * Math.sin(h), ky = H - thighL * Math.cos(h), kx = D.hipX + 0.02;
  const hold = (i, out) => out.set(i ? 0.035 : -0.035, H + (i ? 0.2 : 0.13) * k, 0.2 * k);
  const lay = (i, out) => out.set(i ? -0.01 : -0.08, 0.27 * k + (i ? 0.035 : 0), 0.4 * k + (i ? -0.01 : 0.02));
  const knee = (i, out) => out.set(i ? kx + 0.01 : kx - 0.07, ky + (i ? 0.075 : 0.1), kz - (i ? 0.05 : 0.1));
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, tgt = i ? _kL : _kR, own = st.hands?.[i];
    if (own) {
      bodyToChest(m, Q, own.p[0], own.p[1], own.p[2], _T);
      const q = own.pole || [side * 0.8, -0.5, -0.3];
      armIK(m, Q, i, _T.x, _T.y, _T.z, q[0], q[1], q[2]);
      aimHand(m, Q, Q, i, own.fd[0], own.fd[1], own.fd[2], own.pn[0], own.pn[1], own.pn[2]);
      handShape(Q, i, own.shape || 'grip');
      continue;
    }
    hold(i, tgt); knee(i, _kA); tgt.lerp(_kA, rest); lay(i, _kA); tgt.lerp(_kA, reach);
    bodyToChest(m, Q, tgt.x, tgt.y, tgt.z, _T);
    armIK(m, Q, i, _T.x, _T.y, _T.z, side * 0.8, -0.5, -0.3);
    // the stems run up through the fists (fingers across them); resting, the palm on the knee
    const fd = rest > 0.5 && reach < 0.5 ? [0.15 * -side, -0.75, 0.6] : [-side * 0.75, -0.25, 0.6];
    const pn = rest > 0.5 && reach < 0.5 ? [0, -1, 0.1] : [-side * 0.6, -0.2, -0.5];
    aimHand(m, Q, Q, i, fd[0], fd[1], fd[2], pn[0], pn[1], pn[2]);
    handShape(Q, i, rest > 0.5 && reach < 0.3 ? 'relax' : 'grip');
  }
}
// The point between Ove's hands in the kneel (the bouquet), world space, after the model's matrices
// are updated: where the flowers are while he holds them, on the ground ahead when kneelReach is 1.
const _kpA = new THREE.Vector3(), _kpB = new THREE.Vector3();
export function kneelPoint(m, out = new THREE.Vector3()) {
  out.set(0, 0, 0);
  for (const i of [0, 1]) { m.hands[i].getWorldPosition(_kpA); m.fings[i].getWorldPosition(_kpB); out.addScaledVector(_kpA.lerp(_kpB, 0.75), 0.5); }
  return out;
}

// A point in hand i's frame (u along the fingers f, w towards the thumb, t towards the palm side n;
// sizes of a 19 cm hand), relative to the wrist, in body space.
const _hn = new THREE.Vector3(), _hw = new THREE.Vector3();
function handOff(m, i, f, n, u, w, t, out) {
  const k = m.D.hand / 0.19, side = i ? 1 : -1;
  _hn.copy(n).addScaledVector(f, -n.dot(f)).normalize();
  _hw.crossVectors(_hn, f).multiplyScalar(side);
  return out.copy(f).multiplyScalar(u * k).addScaledVector(_hw, w * k).addScaledVector(_hn, t * k);
}
// Writing: the notebook flat on the left palm in front of the stomach, the pencil's tip on its page.
const _wL = new THREE.Vector3(), _wF = new THREE.Vector3(), _wN = new THREE.Vector3(), _wP = new THREE.Vector3(), _wO = new THREE.Vector3();
const _pt3 = [0, 0, 0];
function writePose(m, P, Q, t) {
  const D = m.D, k = D.k;
  const fz = D.frontZ ? D.frontZ(D.chestY) : 0.14;
  _wL.set(0.05 * k, D.spineY + 0.11 * k, fz + 0.19 * k);
  _wF.set(-0.45, 0.1, 1).normalize(); _wN.set(0.1, 1, -0.15).normalize();
  bodyToChest(m, P, _wL.x, _wL.y, _wL.z, _T);
  armIK(m, Q, 1, _T.x, _T.y, _T.z, 0.8, -0.5, -0.1);
  aimHand(m, P, Q, 1, _wF.x, _wF.y, _wF.z, _wN.x, _wN.y, _wN.z);
  handOff(m, 1, _wF, _wN, 0.1, -0.012, 0.026, _wP).add(_wL);             // the page
  // the right hand writes short lines across it, the pencil's point on the page
  const jx = 0.02 * Math.sin(t * 9) * Math.sin(t * 2.3), jz = 0.012 * Math.sin(t * 1.7) - 0.01;
  _wF.set(0.5, -0.62, 0.62).normalize(); _wN.set(0.35, -0.9, -0.2).normalize();
  const pt = penTip(HANDS.pen[5], HANDS.pen[6], _pt3);
  handOff(m, 0, _wF, _wN, pt[0], pt[1], pt[2], _wO);
  bodyToChest(m, P, _wP.x + jx - _wO.x, _wP.y + 0.003 - _wO.y, _wP.z + jz - _wO.z, _T);
  armIK(m, Q, 0, _T.x, _T.y, _T.z, -0.8, -0.5, -0.1);
  aimHand(m, P, Q, 0, _wF.x, _wF.y, _wF.z, _wN.x, _wN.y, _wN.z);
  handShape(Q, 1, 'note');
  handShape(Q, 0, 'pen');
}

// The phone at the right ear: its top (speaker) at the ear canal, its bottom towards the mouth, held
// in the right hand with the fingers up along its back and the palm towards the head.
const _pE = new THREE.Vector3(), _pU = new THREE.Vector3(), _pN = new THREE.Vector3();
function phonePose(m, P, Q, t) {
  const D = m.D, k = D.hand / 0.19, hp = m.headP;
  headFrame(m, P, _hf);
  // the ear canal, just off the ear (rest model space -> head bone -> body)
  _pE.set(-(hp.W(0.42) * hp.Hh + 0.03), hp.chinY + 0.42 * hp.Hh - D.headY, hp.z0 - 0.004 * hp.Hh - D.headZ).applyMatrix4(_hf);
  _pU.set(0.12, 0.8, -0.58).transformDirection(_hf);                 // the phone's long axis, up the hand
  _pN.set(1, 0, 0.12).transformDirection(_hf);                        // the palm, towards the cheek
  const cu = 0.095 * k, ct = 0.0205 * k, top = 0.06;
  const wx = _pE.x - _pU.x * (top + cu) - _pN.x * (ct + 0.0045), wy = _pE.y - _pU.y * (top + cu) - _pN.y * (ct + 0.0045), wz = _pE.z - _pU.z * (top + cu) - _pN.z * (ct + 0.0045);
  bodyToChest(m, P, wx, wy, wz, _T);
  armIK(m, Q, 0, _T.x, _T.y, _T.z, -0.35, -0.9, 0.3);
  aimHand(m, P, Q, 0, _pU.x, _pU.y, _pU.z, _pN.x, _pN.y, _pN.z);
  handShape(Q, 0, 'phone');
}

function castPose(m, P) {
  const D = m.D, Q = m.Q, i = m.d.cast === 'L' ? 1 : 0, side = i ? 1 : -1;
  const fz = D.frontZ ? D.frontZ(D.spineY + 0.05) : 0.15;
  // the forearm across the body, rising ~15 deg towards the other shoulder, in its sling
  armIK(m, Q, i, -side * 0.06, D.spineY + 0.17 - D.chestY, fz + 0.075, side * 0.6, -0.5, -0.25);
  aimHand(m, P, Q, i, -side, 0.25, 0.12, 0, 0, -1);
  handShape(Q, i, 'pocket');
  for (const b of i ? ARM_L : ARM_R) for (let k = 0; k < 3; k++) P[b * 3 + k] = Q[b * 3 + k];
}

function airPose(m, st, P, Q) {
  Q.set(P);
  const up = (st.vy || 0) > 0 ? 1 : 0.5;
  for (const i of [0, 1]) {
    const thigh = i ? B.thighL : B.thighR, shin = i ? B.shinL : B.shinR, foot = i ? B.footL : B.footR, arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR;
    Q[thigh * 3] = -(i ? 0.55 : 0.2) * up - 0.1;
    Q[shin * 3] = (i ? 0.9 : 0.5) * up;
    Q[foot * 3] = 0.2;
    Q[arm * 3] = -0.35;
    Q[arm * 3 + 2] = (i ? 1 : -1) * 0.45;
    Q[fore * 3] = -0.7;
  }
}

// A grown man's jump (Character.jump, st.jumpWind / jumping / landT). squatAdd bends both legs by dk
// on top of any pose (hip and ankle half each, so the feet stay under him and flat) and drops the
// pelvis by what that costs, the trunk leaning in by `lean`.
function squatAdd(m, P, dk, lean) {
  const D = m.D, L = D.hipY - D.ankleY;
  for (const i of [0, 1]) {
    const th = i ? B.thighL : B.thighR, sh = i ? B.shinL : B.shinR, ft = i ? B.footL : B.footR;
    P[th * 3] -= dk * 0.5; P[sh * 3] += dk; P[ft * 3] -= dk * 0.5;
  }
  P[OFF + 1] -= L * (1 - Math.cos(dk * 0.5));
  P[B.spine * 3] += lean; P[B.chest * 3] += lean * 0.25; P[B.neck * 3] -= lean * 0.7;
}
// The wind-up (u 0..1 of it; w its weight: 1 until he leaves the ground, then letting go). He sinks
// (to u = WIND.sink): the knees go forward and the seat back over the feet, the trunk folds forward,
// the arms swing back, the head goes down a little; gathers himself (to JUMP_PUSH, where
// character.js has him push: the grunt); and pushes off: the legs straighten, the arms swing through
// forward and up, and at the end the heels come off the ground, so he leaves it from his toes,
// stretched, where the air pose takes over. Standing, the feet stay where they are (the seat goes back
// as the knees come forward; up on the toes he rolls forward over them). On the move (mv) a shallower
// dip on top of the stride, whose feet are its own.
export const JUMP_PUSH = 0.7;
const WIND = { sink: 0.6, thigh: 0.74, shin: 0.5, lean: 0.44, heel: 0.5, armBack: 0.62 };
function windCrouch(u) { return sstep(0, WIND.sink, u) * (1 + 0.05 * sstep(WIND.sink, JUMP_PUSH, u)) * (1 - sstep(JUMP_PUSH, 0.97, u)); }
function jumpWindPose(m, P, u, w, mv) {
  const D = m.D, thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY, toe = 0.76 * D.footLen;
  const k = lerp(1, 0.45, mv), c = windCrouch(u) * w * k;
  // (the arms swing through a little ahead of the legs)
  const fwd = sstep(JUMP_PUSH - 0.08, 0.97, u), back = sstep(0.05, WIND.sink, u) * (1 - fwd) * w * k, up = fwd * w * lerp(1, 0.5, mv);
  const hr = WIND.heel * sstep(0.8, 1, u) * w * (1 - mv);
  // legs: the thigh forward by a more and the shin back by b (the knee bent a + b more), the sole as it
  // was (then up on the toes by hr). The pelvis goes back so the toe tips stay where they were (the
  // seat over the heels; on the toes he rolls forward over them); down: animateCharacter's plant step.
  // (h: the hip's flexion, k the knee's, p the foot's pitch, toes down, in the body)
  const a = WIND.thigh * c, b = WIND.shin * c;
  // (standing, both feet take his weight as he gathers himself: neither leaves the ground)
  evenLegs(P, w * (1 - mv) * sstep(0, 0.25, u));
  const tip = (h, k, p) => thighL * Math.sin(h) + shinL * Math.sin(h - k) - D.ankleY * Math.sin(p) + toe * Math.cos(p);
  let dz = 0;
  for (const i of [0, 1]) {
    const th = i ? B.thighL : B.thighR, sh = i ? B.shinL : B.shinR, ft = i ? B.footL : B.footR;
    const h = -P[th * 3], kn = P[sh * 3], p = P[th * 3] + kn + P[ft * 3];
    dz += (tip(h + a, kn + a + b, p + hr) - tip(h, kn, p)) / 2;
    P[th * 3] -= a; P[sh * 3] += a + b; P[ft * 3] += hr - b;
  }
  P[OFF + 2] -= dz * (1 - mv);
  // the trunk folds forward over the knees (the eyes stay on where he is going), upright again as he pushes
  const lean = WIND.lean * c;
  P[B.spine * 3] += lean * 0.75; P[B.chest * 3] += lean * 0.25; P[B.neck * 3] += 0.1 * c - lean * 0.62;
  P[B.head * 3] += 0.04 * c - 0.05 * up;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR;
    P[arm * 3] = lerp(P[arm * 3], WIND.armBack, back); P[arm * 3 + 2] = lerp(P[arm * 3 + 2], side * 0.17, back);
    P[fore * 3] = lerp(P[fore * 3], -0.3, back);
    P[arm * 3] = lerp(P[arm * 3], -1.0, up); P[arm * 3 + 2] = lerp(P[arm * 3 + 2], side * 0.12, up);
    P[fore * 3] = lerp(P[fore * 3], -0.45, up);
  }
}
// Both legs bent alike (w 0..1): standing still, one knee is soft (locomotion's idle), and bending
// both by the same amount on top of that lifts that foot off the ground (~2 cm in a deep crouch). The
// same hip and knee flexion in both, each sole's pitch kept; the legs' turn and spread stay (they hold
// the feet under the tilted pelvis).
function evenLegs(P, w) {
  if (!(w > 0.001)) return;
  const hm = (P[B.thighR * 3] + P[B.thighL * 3]) / 2, km = (P[B.shinR * 3] + P[B.shinL * 3]) / 2;
  for (const i of [0, 1]) {
    const th = i ? B.thighL : B.thighR, sh = i ? B.shinL : B.shinR, ft = i ? B.footL : B.footR;
    const p = P[th * 3] + P[sh * 3] + P[ft * 3];
    P[th * 3] = lerp(P[th * 3], hm, w); P[sh * 3] = lerp(P[sh * 3], km, w);
    P[ft * 3] = p - P[th * 3] - P[sh * 3];
  }
}
// How far the lower sole is above the ground under the root (m), from the legs as they are posed, in
// their own plane: the hip's flexion h = -thigh x, the knee's k = shin x, the foot's pitch (toes down)
// the sum of the three; from the hip joint down to the lowest of the sole's heel and toe.
function soleGap(m, P) {
  const D = m.D, thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY, F = D.footLen;
  let e = 0;
  for (const i of [0, 1]) {
    const th = i ? B.thighL : B.thighR, sh = i ? B.shinL : B.shinR, ft = i ? B.footL : B.footR;
    const h = -P[th * 3], k = P[sh * 3], p = P[th * 3] + k + P[ft * 3];
    e = Math.max(e, thighL * Math.cos(h) + shinL * Math.cos(h - k) + D.ankleY * Math.cos(p) + Math.max(-0.24 * F * Math.sin(p), 0.76 * F * Math.sin(p)));
  }
  return D.hipY + P[OFF + 1] - e;
}
// The landing (c 0..1: the knees take it, the trunk goes forward, the arms come forward and out to
// catch the balance).
function jumpLand(m, P, c, moving, old) {
  const k = c * lerp(1, 0.55, moving);
  squatAdd(m, P, 1.1 * k * (1 + 0.15 * old), 0.42 * k);
  for (const i of [0, 1]) {
    const side = i ? 1 : -1, arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR;
    P[arm * 3] = lerp(P[arm * 3], -0.4, k); P[arm * 3 + 2] = lerp(P[arm * 3 + 2], side * 0.34, k);
    P[fore * 3] = lerp(P[fore * 3], -0.75, k);
  }
}
// In the air (r: vertical speed over take-off speed, 1 -> -1; -1 once down). Standing: pushed off and
// stretched on the way up (toes pointed, the arms swung forward and up), the knees coming up a little
// over the top (an old body hardly tucks) with the arms going out to the sides for balance, a little
// flailing, the legs reaching down for the ground before it comes, the knees soft and the feet under
// him (where he will stand: they don't slide back in once he is down). On the move, a leap: the left
// leg reaching ahead, the right folded behind, the right arm forward and the left back and out, both
// legs coming forward to land.
function jumpAirPose(m, st, P, Q, t) {
  Q.set(P);
  const old = m.style.old || 0, r = st.jumping ? clamp((st.vy || 0) / Math.max(1, st.jumpV || 4), -1, 1) : -1;
  const up = sstep(0, 1, r), dn = sstep(0, 1, -r), mid = 1 - up - dn;
  const mv = sstep(0.5, 3, st.speed || 0), tuck = 1 - 0.3 * old;
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    const thigh = i ? B.thighL : B.thighR, shin = i ? B.shinL : B.shinR, foot = i ? B.footL : B.footR;
    const arm = i ? B.armL : B.armR, fore = i ? B.foreL : B.foreR;
    // standing
    let h = 0.1 * up + 0.42 * tuck * mid + 0.22 * dn + (i ? 0.07 : -0.03) * mid;
    let k = 0.2 * up + 0.55 * tuck * mid + 0.44 * dn + (i ? 0.1 : 0) * mid;
    let ax = -(1.0 * up + 0.3 * mid + 0.3 * dn), az = 0.12 * up + 0.66 * mid + 0.52 * dn, fx = -(0.45 * up + 0.35 * mid + 0.4 * dn);
    // on the move (i = 1, the left, leads)
    const hM = i ? 0.42 + 0.18 * mid + 0.1 * dn : -0.32 * (1 - dn) + 0.05 * dn, kM = i ? 0.22 + 0.25 * mid - 0.05 * dn : 0.95 * (1 - dn) + 0.45 * dn;
    const axM = i ? 0.45 : -0.7, azM = i ? 0.42 : 0.22, fxM = -1.0;
    h = lerp(h, hM, mv); k = lerp(k, kM, mv); ax = lerp(ax, axM, mv); az = lerp(az, azM, mv); fx = lerp(fx, fxM, mv);
    const fp = -0.5 * up * (1 - 0.6 * mv) - 0.08 * mid + 0.12 * dn;
    // (reaching for the ground, the legs come in to the stance's own width and turn)
    Q[thigh * 3] = -h; Q[thigh * 3 + 1] = lerp(0, P[thigh * 3 + 1], dn); Q[thigh * 3 + 2] = lerp(side * 0.05, P[thigh * 3 + 2], dn);
    Q[shin * 3] = k; Q[shin * 3 + 1] = 0; Q[shin * 3 + 2] = 0;
    Q[foot * 3] = h - k - fp; Q[foot * 3 + 1] = lerp(side * 0.12 * old, P[foot * 3 + 1], dn); Q[foot * 3 + 2] = lerp(0, P[foot * 3 + 2], dn);
    Q[arm * 3] = ax; Q[arm * 3 + 1] = 0;
    Q[arm * 3 + 2] = side * (az + 0.07 * old * mid * Math.sin(t * 13 + i * 2));
    Q[fore * 3] = fx; Q[fore * 3 + 1] = -side * 0.3;
  }
  Q[B.pelvis * 3] = 0; Q[B.pelvis * 3 + 1] = 0.12 * mv; Q[B.pelvis * 3 + 2] = 0;
  Q[B.spine * 3] = 0.04 * up + 0.13 * mid + 0.2 * dn + 0.03 * old + 0.06 * mv; Q[B.spine * 3 + 1] = -0.1 * mv; Q[B.spine * 3 + 2] = 0;
  Q[B.chest * 3] = 0.03 * mid; Q[B.chest * 3 + 1] = -0.06 * mv; Q[B.chest * 3 + 2] = 0;
  Q[B.neck * 3] = -0.06 * up - 0.12 * mid - 0.05 * dn; Q[B.neck * 3 + 1] = -0.12 * mv * 0.5 + 0.04 * mv; Q[B.neck * 3 + 2] = 0;
  Q[B.head * 3] = -0.04 * up + 0.1 * dn;
  Q[OFF] = 0; Q[OFF + 1] = 0; Q[OFF + 2] = 0;
}

function kickPose(m, st, P, Q) {
  // a tyre kick with the right foot: wind up, strike low, recover. kick goes 1 -> 0.
  Q.set(P);
  const u = 1 - st.kick;
  const k1 = sstep(0, 0.3, u) * (1 - sstep(0.3, 0.55, u));
  const k2 = sstep(0.3, 0.5, u) * (1 - sstep(0.62, 1, u));
  Q[B.thighR * 3] = 0.4 * k1 - 0.8 * k2;
  Q[B.shinR * 3] = 1.1 * k1 + 0.25 * k2;
  Q[B.footR * 3] = 0.2 * k1 - 0.1 * k2;
  Q[B.thighL * 3] = -0.1 * (k1 + k2);
  Q[B.shinL * 3] = 0.18 * (k1 + k2);
  Q[B.footL * 3] = -0.08 * (k1 + k2);
  Q[B.spine * 3] = 0.08 * k1 - 0.14 * k2;
  Q[B.armR * 3] = 0.25 * k2;
  Q[B.armR * 3 + 2] = -0.35 * k2 - 0.1;
  Q[B.armL * 3] = -0.4 * k2;
  Q[B.armL * 3 + 2] = 0.35 * (k1 + k2) + 0.1;
  Q[B.foreL * 3] = -0.6;
  Q[OFF + 1] = -0.03 * (k1 + k2);
}

function flungPose(m, st, Q, t) {
  // knocked back: the body tips over backwards (about the hips) during the flight, limbs loose
  const D = m.D;
  Q.fill(0);
  const a = Math.min(PI / 2, (st.flungT || 0) * 3.2);
  const f = a / (PI / 2);
  Q[B.pelvis * 3] = -a;
  Q[OFF + 1] = (0.13 - D.hipY) * f * sstep(0.5, 1, f);
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    Q[(i ? B.thighL : B.thighR) * 3] = -0.35 - (i ? 0.25 : 0) + 0.1 * Math.sin(t * 7 + i);
    Q[(i ? B.shinL : B.shinR) * 3] = 0.5 + (i ? 0.3 : 0);
    Q[(i ? B.armL : B.armR) * 3] = -0.6 + 0.2 * Math.sin(t * 6 + i * 2);
    Q[(i ? B.armL : B.armR) * 3 + 2] = side * (1.1 + 0.15 * Math.sin(t * 8 + i));
    Q[(i ? B.foreL : B.foreR) * 3] = -0.6;
  }
  Q[B.spine * 3] = 0.15;
  Q[B.neck * 3] = 0.35;
  handShape(Q, 0, 'limp'); handShape(Q, 1, 'limp');
}

const _kneel = new Float32Array(NCH), _sit = new Float32Array(NCH), _lie = new Float32Array(NCH), _plie = new Float32Array(NCH), _pall = new Float32Array(NCH);
function downPose(m, st, Q, t) {
  // lying on the back for a moment, then: sit up -> one knee -> stand. st.prone (a ragdoll that came to
  // rest on his front, actors/ragdoll.js): face down, then: push up onto hands and knees -> one knee ->
  // stand (the root's +z is where his head was).
  const D = m.D, s = m.seed > 0.5 ? 1 : 0;
  const lie = _lie; lie.fill(0);
  lie[B.pelvis * 3] = -PI / 2;
  lie[OFF + 1] = 0.12 - D.hipY;
  lie[(s ? B.thighL : B.thighR) * 3] = -0.6; lie[(s ? B.shinL : B.shinR) * 3] = 1.1; lie[(s ? B.footL : B.footR) * 3] = -0.4;
  lie[(s ? B.thighR : B.thighL) * 3 + 2] = (s ? -1 : 1) * 0.1;
  lie[B.armR * 3 + 2] = -1.0; lie[B.armL * 3 + 2] = 1.15; lie[B.armR * 3] = -0.2; lie[B.foreR * 3] = -0.4; lie[B.foreL * 3] = -0.2;
  lie[B.neck * 3] = 0.08 + 0.12 * Math.max(0, Math.sin(t * 1.3));
  const sit = _sit; sit.fill(0);
  sit[OFF + 1] = 0.13 - D.hipY;
  sit[B.pelvis * 3] = -0.45;
  for (const i of [0, 1]) { const bent = i === s; sit[(i ? B.thighL : B.thighR) * 3] = bent ? -1.45 : -1.1; sit[(i ? B.shinL : B.shinR) * 3] = bent ? 0.85 : 0.1; sit[(i ? B.footL : B.footR) * 3] = bent ? 0.5 : -0.3; }
  sit[B.spine * 3] = 0.3; sit[B.chest * 3] = 0.1; sit[B.neck * 3] = 0.15;
  // (the hands behind him on the ground: the elbows a little bent, or the hands go into it)
  sit[B.armR * 3] = 0.5; sit[B.armL * 3] = 0.5; sit[B.armR * 3 + 2] = -0.35; sit[B.armL * 3 + 2] = 0.35; sit[B.foreR * 3] = -0.4; sit[B.foreL * 3] = -0.4;
  const kn = _kneel; kn.fill(0);
  kn[OFF + 1] = D.kneeY + 0.02 - D.hipY;
  const a = s ? B.thighL : B.thighR, b = s ? B.thighR : B.thighL;
  kn[a * 3] = 0.08; kn[(s ? B.shinL : B.shinR) * 3] = PI / 2 - 0.05; kn[(s ? B.footL : B.footR) * 3] = 0.6;
  kn[b * 3] = -1.5; kn[(s ? B.shinR : B.shinL) * 3] = 1.5; kn[(s ? B.footR : B.footL) * 3] = 0.0;
  kn[B.spine * 3] = 0.35; kn[B.neck * 3] = -0.1;
  kn[(s ? B.armR : B.armL) * 3] = -0.5; kn[(s ? B.foreR : B.foreL) * 3] = -0.5;
  for (const A of [lie, sit, kn]) { handShape(A, 0, 'limp'); handShape(A, 1, 'limp'); }
  // timeline: lying until 1.3 s before the end, then the get-up
  const g = clamp(1 - (st.downLeft ?? 9) / 1.3, 0, 1);
  const first = st.prone ? proneKeys(m, t) : lie, second = st.prone ? _pall : sit;
  if (g <= 0) Q.set(first);
  else if (g < 0.35) {
    const k = sstep(0, 0.35, g);
    for (let i = 0; i < NCH; i++) Q[i] = lerp(first[i], second[i], k);
    // (pushing himself up: the palms stay on the ground under the trunk as it rises)
    if (st.prone) pronePalms(m, Q, k);
  }
  else if (g < 0.7) { const k = sstep(0.35, 0.7, g); for (let i = 0; i < NCH; i++) Q[i] = lerp(second[i], kn[i], k); }
  else { const k = sstep(0.7, 1, g); for (let i = 0; i < NCH; i++) Q[i] = lerp(kn[i], 0, k); }
  // (getting up from the ground the poses in between put a foot through it: from sitting to one knee
  // the kneeling leg's ankle went 0.33 m under; that knee bends further instead)
  if (g > 0.3 || (g > 0 && st.prone)) liftFeet(m, Q, 0.07 * D.k);
}

// Lying face down (proneKeys returns it: _plie) and on hands and knees (_pall), for downPose.
function proneKeys(m, t) {
  const D = m.D, s = m.seed > 0.5 ? 1 : 0, k = D.k;
  const lie = _plie; lie.fill(0);
  lie[B.pelvis * 3] = PI / 2;
  lie[OFF + 1] = 0.11 * k - D.hipY;
  for (const i of [0, 1]) { lie[(i ? B.footL : B.footR) * 3] = 1.2; lie[(i ? B.thighL : B.thighR) * 3 + 2] = (i ? 1 : -1) * 0.08; }
  // the head turned to a side (his face off the ground), breathing
  lie[B.neck * 3 + 1] = (s ? 1 : -1) * 0.9; lie[B.head * 3 + 1] = (s ? 1 : -1) * 0.35; lie[B.neck * 3] = -0.15 - 0.06 * Math.max(0, Math.sin(t * 1.3));
  pronePalms(m, lie, 0);
  const all = _pall; all.fill(0);
  const tilt = 0.35;
  all[B.pelvis * 3] = PI / 2 - tilt;
  all[OFF + 1] = D.hipY - D.kneeY + 0.07 * k - D.hipY;
  for (const i of [0, 1]) { all[(i ? B.thighL : B.thighR) * 3] = -(PI / 2 - tilt); all[(i ? B.shinL : B.shinR) * 3] = PI / 2; all[(i ? B.footL : B.footR) * 3] = 1.2; }
  all[B.neck * 3] = -0.35;
  pronePalms(m, all, 1);
  return lie;
}
// Both palms flat on the ground beside (up: under) the shoulders, the fingers towards the head, the
// elbows out and up (up: nearly straight).
const _ppM = new THREE.Matrix4(), _ppV = new THREE.Vector3();
function pronePalms(m, A, up) {
  const D = m.D, k = D.k;
  chestFrame(m, A, _ppM);
  for (const i of [0, 1]) {
    const side = i ? 1 : -1;
    _ppV.set(side * D.S, D.shJ - D.chestY, 0).applyMatrix4(_ppM);
    const wx = _ppV.x + side * lerp(0.16, 0.03, up) * k, wz = _ppV.z + lerp(-0.08, 0.04, up) * k, wy = 0.05 * k;
    bodyToChest(m, A, wx, wy, wz, _T);
    armIK(m, A, i, _T.x, _T.y, _T.z, side, lerp(0.2, 0, up), lerp(-1, -0.3, up));
    aimHand(m, A, A, i, 0, 0, 1, 0, -1, 0);
    handShape(A, i, 'open');
  }
}
// A leg's ankle in body space under pose Q, its shin bent f (a leg's FK: pelvis, thigh, shin).
const _lfA = new THREE.Matrix4(), _lfB = new THREE.Matrix4(), _lfV = new THREE.Vector3();
function ankleAt(m, Q, i, f) {
  const D = m.D, th = (i ? B.thighL : B.thighR) * 3, sh = (i ? B.shinL : B.shinR) * 3;
  _lfA.makeRotationFromEuler(_e.set(Q[0], Q[1], Q[2])).setPosition(Q[OFF], D.hipY + Q[OFF + 1], Q[OFF + 2]);
  _lfB.makeRotationFromEuler(_e.set(Q[th], Q[th + 1], Q[th + 2])).setPosition((i ? 1 : -1) * D.hipX, 0, 0); _lfA.multiply(_lfB);
  _lfB.makeRotationFromEuler(_e.set(f, Q[sh + 1], Q[sh + 2])).setPosition(0, D.kneeY - D.hipY, 0); _lfA.multiply(_lfB);
  return _lfV.set(0, D.ankleY - D.kneeY, 0).applyMatrix4(_lfA).y;
}
// A knee bent or straightened (0 .. 2.6 rad), as little as will do, where its ankle would be under minY
// (the ground at 0); the best it can if nothing will.
function liftFeet(m, Q, minY) {
  for (const i of [0, 1]) {
    const sh = (i ? B.shinL : B.shinR) * 3, f0 = Q[sh];
    let y = ankleAt(m, Q, i, f0), best = f0;
    if (y >= minY) continue;
    for (let j = 1; j <= 32 && y < minY; j++) {
      for (const f of [f0 + j * 0.08, f0 - j * 0.08]) {
        if (f < 0 || f > 2.6) continue;
        const y2 = ankleAt(m, Q, i, f);
        if (y2 > y) { y = y2; best = f; }
        if (y >= minY) break;
      }
    }
    Q[sh] = best;
  }
}

// Old models (anything not built by buildCharacter here): keep the old swinging pivots working.
function animateLegacy(m, st, dt) {
  const sw = Math.sin((m.phase = (m.phase || 0) + (st.speed || 0) * dt * 2.4)) * Math.min(1, (st.speed || 0) * 0.3) * 0.6;
  if (m.legs?.length === 2) { m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw; }
  if (m.arms?.length === 2) { m.arms[0].rotation.x = -sw; m.arms[1].rotation.x = sw; }
}

// ---------------------------------------------------------------------------------------------
// Busts: a cheap static seated driver (no skeleton): the character in the driving pose, baked.
// Two surfaces (fabric + skin) so traffic costs two draw calls per driver. Origin = seat surface;
// the hip joints sit 0.12 m above it and 0.12 m forward, like a seated Character.

const BUST_REMAP = { hair: 'fabric', leather: 'fabric', painted: 'fabric', metal: 'fabric', rubber: 'fabric', plastic: 'fabric' };
export function buildBust(def) {
  const m = buildCharacter(def, { bust: true, lod: 2, headLod: 1, remap: BUST_REMAP });
  animateCharacter(m, { t: 0, speed: 0, seated: true, driving: true }, 0);
  m.root.updateMatrixWorld(true);
  const mesh = m.mesh, skel = mesh.skeleton;
  skel.update();
  const geo = mesh.geometry;
  const pos = geo.attributes.position, nrm = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const out = new Float32Array(pos.count * 3), outN = new Float32Array(pos.count * 3);
  const mats = skel.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[i]));
  const p = new THREE.Vector3(), q = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), nm = new THREE.Vector3();
  const D = m.D;
  for (let i = 0; i < pos.count; i++) {
    acc.set(0, 0, 0); accN.set(0, 0, 0);
    p.fromBufferAttribute(pos, i); nm.fromBufferAttribute(nrm, i);
    for (let k = 0; k < 4; k++) {
      const w = sw.array[i * 4 + k];
      if (!w) continue;
      const M = mats[si.array[i * 4 + k]];
      acc.addScaledVector(q.copy(p).applyMatrix4(M), w);
      accN.addScaledVector(q.copy(nm).transformDirection(M), w);
    }
    accN.normalize();
    out[i * 3] = acc.x; out[i * 3 + 1] = acc.y - D.hipY + 0.12; out[i * 3 + 2] = acc.z + 0.12;
    outN[i * 3] = accN.x; outN[i * 3 + 1] = accN.y; outN[i * 3 + 2] = accN.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  for (const k of ['color', 'tri', 'trin']) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.userData = { surfaces: geo.userData.surfaces };
  g.computeBoundingSphere();
  const root = new THREE.Group();
  const bm = new THREE.Mesh(g, realMaterials(g, { snow: false }));
  bm.castShadow = true; bm.receiveShadow = true;
  root.add(bm);
  root.userData.mouth = null;
  root.userData.def = def;
  geo.dispose();
  return root;
}

// ---------------------------------------------------------------------------------------------
// The stray cat: a scruffy brown-grey mackerel tabby, ~0.45 m nose to tail base, ~0.24 m at the
// shoulder: a broad round head on a short thick neck (the ruff), wide-set 5 cm ears, thick legs with
// round haunches, a ragged fur outline. buildCat() -> { root, mesh, body, head, height,
// animate(dt, speed), sit(on), hold(on) }. Standing still for a while it sits down: the body pitched
// ~40 deg, the haunches folded on the ground beside it with the hind paws flat, the front legs
// straight in front of the chest, the head low between the shoulders, the tail round the paws.
// hold(true): curled in someone's arms (root at carryPoint(model), yaw + 90 deg, see carryPose): the
// belly on the forearm, front paws folded against the chest, hind legs and tail hanging, head up.

export function buildCat(opts = {}) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const bones = [], bi = {};
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); bi[name] = bones.length; bones.push(b); return b; };
  const HY = 0.178;
  const hips = mk('hips', body, 0, HY, -0.1);
  const chest = mk('chest', hips, 0, 0.006, 0.2);
  const neck = mk('neck', chest, 0, 0.024, 0.06);
  const head = mk('head', neck, 0, 0.038, 0.034);
  const t0 = mk('tail0', hips, 0, 0.018, -0.078), t1 = mk('tail1', t0, 0, 0, -0.09), t2 = mk('tail2', t1, 0, 0, -0.09);
  // legs: [upper, lower, front, foot] - front: shoulder, elbow, wrist; hind: hip, knee (stifle), hock
  const legs = [];
  for (const [nm, par, x, front] of [['fl', chest, 0.034, true], ['fr', chest, -0.034, true], ['bl', hips, 0.043, false], ['br', hips, -0.043, false]]) {
    const up = front ? mk(nm + 'u', par, x, -0.026, 0.0) : mk(nm + 'u', par, x, -0.008, 0.0);
    const lo = front ? mk(nm + 'l', up, 0, -0.06, -0.012) : mk(nm + 'l', up, 0, -0.056, 0.046);
    const ft = front ? mk(nm + 'w', lo, 0, -0.068, 0.006) : mk(nm + 'h', lo, 0, -0.058, -0.06);
    legs.push([up, lo, front, ft]);
  }
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const sb = new SkinBuilder();
  const base = lin(opts.color ?? 0x86705a), dark = lin(0x2a2018), belly = lin(0xd2c2a6), warm = lin(0xa07c58), pale = lin(0xc4b294);
  const fur = (x, y, z) => 0.84 + 0.22 * vnoise(x * 70 + z * 50, y * 70, 4) + 0.1 * (vnoise(x * 170 + z * 150, y * 170, 7) - 0.5);
  // mackerel tabby: narrow wavy dark stripes down the flanks from the dorsal line, broken into bars
  // by noise, a dark line down the spine, warmer brown between them, a pale belly
  const tabby = (x, y, z, along, top) => {
    const w = along * 140 + Math.sin(y * 45 + x * 25) * 1.4 + (vnoise(along * 18, y * 22 + x * 9, 2) - 0.5) * 4;
    const st = Math.sin(w) * (0.45 + 0.85 * vnoise(along * 40 + x * 20, y * 30, 6));
    let c = mixc(base, warm, 0.45 * vnoise(along * 9 + 3, y * 9, 12));
    c = mixc(c, dark, sstep(0.25, 0.75, st) * 0.9 * top);
    c = mixc(c, dark, sstep(0.026, 0.01, Math.abs(x)) * top * 0.85);
    return c;
  };
  // the fur's ragged outline: a radial jitter of a few mm, tufts here and there
  const shag = (th, y, k = 1) => (0.1 * (vnoise(th * 19, y * 150, 6) - 0.5) + 0.14 * Math.pow(vnoise(th * 9 + 4, y * 70, 8), 4)) * k;

  // body, lofted along +Z (loft frame: y = model z, z = -model y): the round rump and haunches, the
  // loins with the belly tucked up, the deep chest, its front rounding up into the neck
  const Rz = new THREE.Matrix4().makeRotationX(PI / 2);
  const zH = hips.position.z, cy = -HY;
  const bk = [
    { y: zH - 0.09, rx: 0.02, rzF: 0.024, rzB: 0.02, cz: cy - 0.004 },
    { y: zH - 0.074, rx: 0.047, rzF: 0.05, rzB: 0.042, cz: cy - 0.004 },
    { y: zH - 0.04, rx: 0.064, rzF: 0.064, rzB: 0.05, cz: cy },
    { y: zH + 0.02, rx: 0.062, rzF: 0.062, rzB: 0.05, cz: cy + 0.002 },
    { y: zH + 0.1, rx: 0.055, rzF: 0.056, rzB: 0.049, cz: cy + 0.002 },
    { y: zH + 0.17, rx: 0.057, rzF: 0.068, rzB: 0.05, cz: cy },
    { y: zH + 0.225, rx: 0.056, rzF: 0.074, rzB: 0.052, cz: cy - 0.004 },
    { y: zH + 0.265, rx: 0.048, rzF: 0.066, rzB: 0.05, cz: cy - 0.012 },
    { y: zH + 0.29, rx: 0.036, rzF: 0.048, rzB: 0.04, cz: cy - 0.026 },
    { y: zH + 0.302, rx: 0.02, rzF: 0.026, rzB: 0.024, cz: cy - 0.034 },
  ];
  sb.use('hair').add(loft(sampleRings(bk, rangeYs(bk[0].y, bk[bk.length - 1].y, 0.008)), {
    n: 28, capBot: 0.012, capTop: 0.01,
    mod: (v, r) => {
      const back = sstep(0.3, -0.6, v.c);
      const k = 1 + 0.04 * (vnoise(v.th * 7, v.y * 50, 1) - 0.5) + shag(v.th, v.y, 0.4 + 0.6 * back);
      v.x *= k; v.z = r.cz + (v.z - r.cz) * k;
    },
    weights: (v) => { const z = v.y; const t = sstep(zH + 0.07, zH + 0.17, z), n = sstep(zH + 0.27, zH + 0.3, z) * 0.6; return [[bi.hips, 1 - t], [bi.chest, t * (1 - n)], [bi.neck, t * n]]; },
    color: (v) => { const top = sstep(0.3, -0.45, v.c); let c = tabby(v.x, -v.z, v.y, v.y, top); c = mixc(c, belly, sstep(-0.05, 0.6, v.c) * 0.85); return scl(c, fur(v.x, v.z, v.y)); },
  }), 0xffffff, Rz);
  // the neck: short and thick, a ruff of fur from the top of the chest up into the head
  const hp = wp(head), cp = wp(chest);
  {
    const p0 = [0, cp.y + 0.02, cp.z + 0.005], p1 = [0, (cp.y + hp.y) / 2 + 0.008, (cp.z + 0.005 + hp.z - 0.02) / 2 + 0.004], p2 = [0, hp.y - 0.006, hp.z - 0.022];
    sb.use('hair').add(sweep([p0, p1, p2], [[0, 1, 0], [0, 1, 0], [0, 1, 0]], {
      n: 22, steps: 8, rx: (t) => lerp(0.04, 0.045, sstep(0, 0.5, t)), rz: (t) => lerp(0.045, 0.046, t), capBot: 0.0, capTop: 0.0,
      weights: (t) => [[bi.chest, 1 - sstep(0.1, 0.6, t)], [bi.neck, sstep(0.1, 0.6, t) * (1 - sstep(0.6, 1, t))], [bi.head, sstep(0.6, 1, t)]],
      mod: (p, t, a, N, Bv) => { const k = shag(a, t * 0.05, 1.2) * 0.05; p[0] += (N.x * Math.cos(a) + Bv.x * Math.sin(a)) * k; p[1] += (N.y * Math.cos(a) + Bv.y * Math.sin(a)) * k; p[2] += (N.z * Math.cos(a) + Bv.z * Math.sin(a)) * k; },
      color: (t, a) => { const top = sstep(-0.4, 0.5, Math.cos(a)); let c = mixc(belly, tabby(Math.sin(a) * 0.04, 0.2, t * 0.05, 0.2 + t * 0.03, 1), top); c = mixc(c, dark, 0.5 * sstep(0.5, 0.9, Math.sin(a * 2 + t * 9)) * top); return scl(c, fur(a, t, 0)); },
    }), 0xffffff);
  }
  // legs: one continuous limb each (rings along y in the rest pose), its top buried in the body:
  // front - a muscular upper arm in the chest, a thick forearm, a round paw; hind - a big round
  // haunch blended into the flank, the stifle, the hock behind, the long metatarsal, a round paw
  for (const [up, lo, front, ft] of legs) {
    const a = wp(up), x = a.x, sx = Math.sign(x);
    const iu = bones.indexOf(up), il = bones.indexOf(lo), iff = bones.indexOf(ft), ib = front ? bi.chest : bi.hips;
    const kY = wp(lo).y, fY = wp(ft).y;
    // [y, z, rx (side), rzF (front), rzB (back), outward bulge]
    const R = front
      ? [[0.003, 0.106, 0.017, 0.022, 0.014, 0], [0.011, 0.106, 0.021, 0.026, 0.017, 0], [0.022, 0.1, 0.019, 0.02, 0.016, 0], [0.036, 0.096, 0.0165, 0.016, 0.015, 0], [0.065, 0.094, 0.018, 0.017, 0.017, 0],
        [0.092, 0.09, 0.022, 0.02, 0.022, 0], [0.118, 0.094, 0.027, 0.026, 0.028, -0.002], [0.145, 0.1, 0.029, 0.031, 0.03, -0.006], [0.175, 0.104, 0.024, 0.026, 0.024, -0.008]]
      : [[0.003, -0.082, 0.017, 0.024, 0.013, 0], [0.011, -0.083, 0.02, 0.026, 0.016, 0], [0.022, -0.09, 0.016, 0.016, 0.013, 0], [0.042, -0.104, 0.0145, 0.014, 0.013, 0], [0.058, -0.112, 0.016, 0.016, 0.013, 0],
        [0.078, -0.096, 0.02, 0.02, 0.022, 0], [0.1, -0.074, 0.026, 0.028, 0.026, -0.004], [0.125, -0.078, 0.034, 0.05, 0.04, -0.01], [0.15, -0.09, 0.037, 0.056, 0.05, -0.014],
        [0.175, -0.1, 0.033, 0.05, 0.048, -0.016], [0.198, -0.104, 0.024, 0.034, 0.034, -0.016]];
    const zz = R[0][1] - (front ? 0.106 : -0.082);
    const rings = sampleRings(R.map(([y, z, rx, rzF, rzB, bul]) => ({ y, cz: z + zz, rx, rzF, rzB, cx: x + sx * bul, p: 2 })), rangeYs(0.003, R[R.length - 1][0], 0.008));
    for (const r of rings) r.cx = lerp(r.cx, x * (front ? 0.62 : 0.85), sstep(a.y - 0.03, a.y + 0.03, r.y));
    sb.use('hair').add(loft(rings, {
      n: 14, capBot: 0.004, capTop: 0.0,
      mod: (v, r) => { const k = 1 + shag(v.th, v.y, 0.5 + 0.8 * sstep(0.08, 0.14, v.y)); v.x = r.cx + (v.x - r.cx) * k; v.z = r.cz + (v.z - r.cz) * k; },
      weights: (v) => {
        const f = 1 - sstep(fY - 0.008, fY + 0.008, v.y), t = sstep(kY - 0.012, kY + 0.012, v.y), tb = sstep(a.y - 0.025, a.y + 0.03, v.y);
        return [[iff, f], [il, (1 - f) * (1 - t)], [iu, t * (1 - tb)], [ib, t * tb]];
      },
      color: (v) => {
        let c = mixc(base, warm, 0.3 * vnoise(v.y * 30, v.th, 9));
        const band = sstep(0.45, 0.9, Math.sin(v.y * 140 + (front ? 0 : 1) + vnoise(v.y * 30, v.th, 3) * 2)) * sstep(0.035, 0.06, v.y);
        const blot = sstep(0.55, 0.8, vnoise(v.th * 2.5 + v.y * 40, v.y * 60, 13));
        const hi = sstep(kY - 0.01, kY + 0.02, v.y);
        c = mixc(c, dark, lerp(band * 0.75, blot * 0.6 * sstep(0.3, -0.3, sx * v.s), hi));
        if (!front) c = mixc(c, dark, 0.7 * sstep(0.07, 0.04, v.y) * sstep(0.2, 0.8, -v.c));    // dark sole line up the back of the hind foot
        c = mixc(c, belly, sstep(0.2, 0.9, -sx * v.s) * 0.45 + (v.y < 0.03 ? 0.5 : 0));
        return scl(c, fur(v.x, v.y, v.z));
      },
    }), 0xffffff);
  }
  // head: one sculpted loft (back of the skull -> nose; loft frame: y forward, +z down): broad
  // cheeks, low and wide, a short muzzle with whisker pads, a flat forehead with the tabby M
  const HS = 1.28;
  const hk = [
    { y: -0.036, rx: 0.02, rzF: 0.016, rzB: 0.024, cz: -0.004 }, { y: -0.026, rx: 0.035, rzF: 0.027, rzB: 0.035, cz: -0.004 },
    { y: -0.012, rx: 0.043, rzF: 0.032, rzB: 0.036, cz: 0.0 }, { y: 0.002, rx: 0.045, rzF: 0.033, rzB: 0.033, cz: 0.002 },
    { y: 0.014, rx: 0.04, rzF: 0.029, rzB: 0.027, cz: 0.004 }, { y: 0.024, rx: 0.031, rzF: 0.024, rzB: 0.019, cz: 0.007 },
    { y: 0.031, rx: 0.022, rzF: 0.019, rzB: 0.0125, cz: 0.011 }, { y: 0.036, rx: 0.013, rzF: 0.012, rzB: 0.008, cz: 0.012 },
  ].map((r) => ({ y: r.y * HS, rx: r.rx * HS, rzF: r.rzF * HS, rzB: r.rzB * HS, cz: r.cz * HS }));
  const Hm = new THREE.Matrix4().makeTranslation(hp.x, hp.y, hp.z).multiply(Rz);
  sb.use('hair').add(loft(sampleRings(hk, rangeYs(-0.036 * HS, 0.036 * HS, 0.004)), {
    n: 26, capBot: 0.008, capTop: 0.004,
    mod: (v) => {
      const yy = v.y / HS;
      // the cheek ruff: tufts sticking out below and behind the eyes; whisker pads either side of
      // the muzzle; a small chin
      const cheek = G2((yy + 0.002) / 0.016, (v.c - 0.1) / 0.5) * Math.abs(v.s);
      const pad = G2((yy - 0.03) / 0.006, (Math.abs(v.s) - 0.55) / 0.3) * sstep(-0.1, 0.4, v.c);
      const k = 1 + 0.14 * cheek * vnoise(v.th * 9, v.y * 80, 3) + 0.03 * (vnoise(v.th * 8, v.y * 60, 2) - 0.5) + shag(v.th, v.y, 0.35 * sstep(0.02, -0.01, yy)) + 0.12 * pad;
      v.x *= k; v.z *= 1 + (k - 1) * 0.5;
    },
    weights: () => [[bi.head, 1]],
    color: (v) => {
      // loft frame: x = side, y = forward, +z = down (c > 0: the jaw and chin)
      const top = sstep(-0.2, 0.6, -v.c), ax = Math.abs(v.x) / HS, yy = v.y / HS;
      let c = mixc(base, warm, 0.3 + 0.3 * vnoise(v.x * 60, v.y * 60, 14));
      // the M on the forehead: thin dark lines rising from above the eyes back over the crown,
      // joined over the brows in a zigzag; a warmer bridge down the nose
      const lines = Math.max(G2((ax - 0.003) / 0.0028, 0), G2((ax - 0.0115) / 0.0026, 0) * 0.85, G2((ax - 0.02) / 0.003, 0) * 0.7);
      c = mixc(c, dark, 0.85 * lines * sstep(0.2, 0.6, top) * sstep(0.022, 0.012, yy) * sstep(-0.04, -0.02, yy));
      c = mixc(c, dark, 0.7 * sstep(0.6, 0.95, Math.abs(Math.sin(ax * 260))) * G2((yy - 0.015) / 0.004, 0) * sstep(0.3, 0.7, top) * sstep(0.026, 0.018, ax));
      c = mixc(c, warm, 0.6 * sstep(0.008, 0.002, ax) * sstep(0.02, 0.03, yy) * sstep(0.2, 0.6, top));
      // a dark line from the outer corner of each eye back across the cheek, a second below it
      const ck = sstep(0.35, 0.9, Math.abs(v.s)) * sstep(-0.25, 0.35, v.c) * sstep(0.022, 0.012, yy);
      c = mixc(c, dark, 0.7 * ck * Math.max(G2((yy - 0.012 + v.c * 0.012) / 0.0035, 0), 0.8 * G2((yy + 0.004 + v.c * 0.016) / 0.0035, 0)));
      // pale: a thin ring round the eyes, the whisker pads and the chin, the throat
      c = mixc(c, pale, 0.4 * G2((yy - 0.021) / 0.005, (ax - 0.017) / 0.011) * (1 - top * 0.5));
      c = mixc(c, belly, clamp(sstep(0.3, 0.85, v.c) * 0.85 + sstep(0.027, 0.034, yy) * sstep(-0.1, 0.35, v.c) * 0.7, 0, 1));
      return scl(c, fur(v.x, v.y, v.z));
    },
  }), 0xffffff, Hm);
  // ears: cupped triangles ~5 cm tall with 4.5 cm bases, set wide on the head, pale fur inside
  const earG = GEO.catEar2 ??= (() => {
    const rings = [];
    for (let q = 0; q <= 9; q++) { const t = q / 9; rings.push({ y: t * 0.05, rx: lerp(0.0225, 0.0012, Math.pow(t, 0.9)), rz: lerp(0.0032, 0.0012, t), cz: 0 }); }
    return loft(rings, {
      n: 14, capBot: 0.0, capTop: 0.0015,
      // bend the section into a cup (concave towards the front), the tip a little forward
      mod: (v) => { const u = v.x / 0.0225; v.z += -0.0075 * (1 - Math.min(1, Math.pow(u / Math.max(0.05, 1 - v.t * 0.95), 2))) * (1 - v.t * 0.6) + 0.004 * v.t * v.t; },
      // absolute colours (the part colour is white): tabby outside, pale cream fur over pinkish skin inside
      color: (v) => {
        const inner = v.c > 0.15 ? sstep(0.95, 0.65, Math.abs(v.s)) * sstep(0.97, 0.8, v.t) : 0;
        const tuft = 0.8 + 0.4 * vnoise(v.x * 900, v.y * 300, 5);
        const out = scl(mixc(lin(0x86705a), lin(0x2a2018), 0.3 + 0.3 * v.t), tuft);
        const inn = scl(mixc(lin(0xb88c80), lin(0xd6c6ae), sstep(0.15, 0.6, Math.abs(v.s)) * 0.7 + 0.3 * vnoise(v.x * 700, v.y * 400, 8)), 0.9 + 0.2 * tuft);
        return mixc(out, inn, inner);
      },
    });
  })();
  for (const s2 of [-1, 1]) {
    sb.use('hair').add(earG, 0xffffff, mat(hp.x + s2 * 0.036, hp.y + 0.031, hp.z - 0.006, -0.25, s2 * 0.42, -s2 * 0.42, 1, 1, 1), bi.head);
  }
  // eyes (glossy amber with slit pupils and a dark rim), the nose leather, the mouth
  for (const s2 of [-1, 1]) {
    const ex = hp.x + s2 * 0.0215, ey = hp.y + 0.006, ez = hp.z + 0.0352;
    sb.use('lamp').sphere(0xb08626, bi.head, ex, ey, ez, 0.0095, 0.0083, 0.0062, 0, s2 * 0.42, 0, 12, 10);
    sb.sphere(0x050404, bi.head, ex + s2 * 0.0018, ey, ez + 0.0052, 0.0016, 0.0064, 0.0016, 0, s2 * 0.42, 0, 6, 4);
    sb.use('hair').sphere(0x1e1814, bi.head, ex - s2 * 0.0004, ey + 0.0006, ez - 0.0006, 0.0104, 0.0091, 0.0062, 0, s2 * 0.42, 0, 12, 8);
  }
  sb.use('skin').sphere(0xa86a62, bi.head, hp.x, hp.y - 0.0045, hp.z + 0.0458, 0.0066, 0.0044, 0.0044, 0.5, 0, 0, 8, 5);
  // the muzzle: two whisker pads under the nose and a small chin
  for (const s2 of [-1, 1]) sb.use('hair').sphere(0xb4a48a, bi.head, hp.x + s2 * 0.0086, hp.y - 0.0115, hp.z + 0.0365, 0.0098, 0.0078, 0.0078, 0.1, s2 * 0.3, 0, 10, 7);
  sb.use('hair').sphere(0xa89880, bi.head, hp.x, hp.y - 0.0205, hp.z + 0.0315, 0.008, 0.0055, 0.008, 0, 0, 0, 8, 6);
  sb.use('hair').box(0x3a2a24, bi.head, hp.x, hp.y - 0.0145, hp.z + 0.043, 0.0014, 0.0075, 0.0014);
  // tail: thick and bushy at the base, tabby rings, a dark tip
  const tp = wp(t0);
  const tr = [];
  for (let k2 = 0; k2 <= 18; k2++) tr.push({ y: tp.z - k2 * 0.0155, rx: lerp(0.022, 0.0135, k2 / 18), rz: lerp(0.022, 0.0135, k2 / 18), cz: -tp.y });
  tr.reverse();
  sb.use('hair').add(loft(tr, {
    n: 12, capBot: 0.012, capTop: 0.0,
    mod: (v) => { const k = 1 + 0.1 * (vnoise(v.th * 6, v.y * 70, 5) - 0.5) + shag(v.th, v.y, 1.4); v.x *= k; v.z = -tp.y + (v.z + tp.y) * k; },
    weights: (v) => { const dd = tp.z - v.y; const a = sstep(0.07, 0.085, dd), b2 = sstep(0.16, 0.175, dd); return [[bi.tail0, 1 - a], [bi.tail1, a * (1 - b2)], [bi.tail2, b2]]; },
    color: (v) => { const dd = tp.z - v.y; const c = dd > 0.25 ? dark : mixc(mixc(base, warm, 0.3), dark, sstep(0.15, 0.65, Math.sin(dd * 125 + vnoise(v.th, dd * 20, 4))) * 0.9); return scl(c, fur(v.x, v.y, v.z)); },
  }), 0xffffff, Rz);
  const geo = sb.build();
  const mesh = new THREE.SkinnedMesh(geo, realMaterials(geo, { snow: false }));
  if (Array.isArray(mesh.material)) { const hi = geo.userData.surfaces.indexOf('hair'); if (hi >= 0) mesh.material[hi] = hairMat(); }
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.5);
  let ph = Math.random(), tt = Math.random() * 10, still = 0, sitW = 0, holdW = 0, holdOn = false;
  const order = [0.25, 0.75, 0.0, 0.5]; // fl, fr, bl, br: a lateral-sequence walk
  const hz0 = hips.position.z;
  const ease = (w, target, rate, dt) => w + (target - w) * (dt > 0 ? 1 - Math.exp(-rate * dt) : 1);
  const cat = {
    root, mesh, body, head, height: 0.32,
    // sit(true): sit down now (when standing still); sit(false): only after a while (the default)
    sit(on = true) { if (on) still = Math.max(still, 3); else still = 0; },
    // hold(true): curled in someone's arms (see carryPoint); hold(false): back on its feet
    hold(on = true) { holdOn = !!on; if (!on) still = 0; },
    animate(dt, speed = 0) {
      tt += dt;
      holdW = ease(holdW, holdOn ? 1 : 0, 7, dt);
      const hw = holdW;
      const v = Math.abs(speed) * (1 - hw), mv = sstep(0.04, 0.3, v);
      still = mv > 0.05 ? 0 : still + dt;
      sitW = ease(sitW, still > 2.5 && !holdOn ? 1 : 0, 3, dt);
      const sit = sitW * (1 - mv) * (1 - hw), stand = 1 - sit - hw;
      const trot = sstep(1.0, 1.6, v);
      ph += dt * (v / lerp(0.27, 0.4, trot));
      const br = Math.sin(tt * 4);
      // body: standing / sitting (pitched ~40 deg, rump on the ground) / held (curled)
      hips.position.set(0, HY * stand + 0.05 * sit + 0.075 * hw + Math.abs(Math.sin(ph * TAU * 2)) * 0.005 * mv, hz0 + 0.03 * sit + 0.01 * hw);
      hips.rotation.set(-0.7 * sit - 0.06 * hw, 0, Math.sin(ph * TAU) * 0.035 * mv);
      chest.rotation.set(-0.1 * sit - 0.16 * hw, 0, 0);
      chest.scale.setScalar(1 + 0.01 * br);
      legs.forEach(([up, lo, front, ft], i) => {
        const o = lerp(order[i], [0, 0.5, 0.5, 0][i], trot);
        const p = fract(ph + o);
        const swing = p > 0.6 ? Math.sin(((p - 0.6) / 0.4) * PI) : 0;
        const a = (p < 0.6 ? lerp(0.3, -0.3, p / 0.6) : lerp(-0.3, 0.3, (p - 0.6) / 0.4)) * mv;
        const side = Math.sign(up.position.x);
        if (front) {
          // sitting: straight down in front of the chest, paws flat; held: folded against the chest
          up.rotation.set(-a + 0.71 * sit - 0.45 * hw, 0, 0);
          lo.rotation.set(-0.7 * swing * mv + 0.17 * sit + 1.7 * hw, 0, 0);
          ft.rotation.set(0.9 * swing * mv - 0.08 * sit + 0.8 * hw, 0, 0);
        } else {
          // sitting: the thigh forward along the ground, the shin folded back under it, the hock on
          // the ground and the metatarsal flat forward; held: hanging, a little apart
          up.rotation.set(-a - 0.18 * sit + 0.78 * hw, 0, side * (0.16 * sit + 0.1 * hw));
          lo.rotation.set(0.6 * swing * mv + 1.65 * sit - 0.55 * hw, 0, 0);
          ft.rotation.set(-0.4 * swing * mv - 1.74 * sit + 0.7 * hw, 0, 0);
        }
      });
      // the head: looking around standing; low between the shoulders sitting; up when held
      const look = 0.55 * Math.sin(tt * 0.31) * Math.sin(tt * 0.13);
      neck.rotation.set((1 - mv) * (0.12 + 0.05 * Math.sin(tt * 0.5)) * stand + 0.62 * sit - 0.05 * mv - 0.05 * hw, (1 - mv) * look * (1 - hw * 0.5), 0);
      head.rotation.set((1 - mv) * 0.06 * stand + 0.22 * sit + 0.42 * hw, 0, 0.08 * hw * Math.sin(tt * 0.4));
      // the tail: up and curved walking; sitting, down on the ground and round the paws; held, hanging
      const sw = Math.sin(tt * 1.7);
      t0.rotation.set(lerp(-0.5, 1.0, mv) * stand + 0.08 * Math.sin(tt * 1.3) * stand + 0.7 * sit - 1.42 * hw, 0.7 * sit + 0.12 * hw * sw, 0);
      t1.rotation.set(lerp(0.25, -0.35, mv) * stand + 0.08 * sit + 0.15 * hw, 0.3 * sw * stand + 1.0 * sit + 0.1 * hw * sw, 0);
      t2.rotation.set(-0.5 * Math.max(mv, sit) * stand + 0.2 * hw, 0.35 * Math.sin(tt * 1.7 - 0.8) * stand + (1.05 + 0.12 * Math.sin(tt * 0.9)) * sit + 0.15 * hw * sw, 0);
    },
  };
  cat.animate(0, 0);
  return cat;
}
