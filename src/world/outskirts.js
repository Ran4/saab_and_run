// Beyond the town: a forest belt just outside the outer road, then rolling snowy hills (a noise
// heightfield in 'hillside', never spheres) with stands of spruce silhouettes, a red barn and a
// roundpole fence on the near hills. The hills are the horizon (DESIGN 10.1).

import { THREE, GeoBuilder, realMesh, realMaterials, mat, PRIM } from '../gfx.js';
import { HALF, RHW, SW, CURB, BOUND } from './layout.js';
import { box } from './collision.js';
import { C, tree, limb, TAU, pickR } from './kit.js';
import { gableHouse } from './buildings.js';
import { mulberry32 } from '../util.js';

const r = mulberry32(777);
const EDGE = HALF + RHW + SW;   // outer edge of the outermost sidewalk

function hash2(i, j, s) { const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return x - Math.floor(x); }
function noise2(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, s) { return noise2(x, z, s) * 0.55 + noise2(x * 2.1, z * 2.1, s + 1) * 0.3 + noise2(x * 4.3, z * 4.3, s + 2) * 0.15; }
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Terrain height outside the town (0 inside). Square distance, so the hills hug the grid.
export function hillHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d < 330) return CURB - 0.08;
  const n1 = fbm(x / 260, z / 260, 3), n2 = fbm(x / 520, z / 520, 9), n3 = fbm(x / 90, z / 90, 5);
  const near = sstep(330, 700, d) * (18 + 42 * n1);
  const far = sstep(560, 1500, d) * (40 + 110 * n2);
  return CURB - 0.08 + near + far + sstep(340, 600, d) * (n3 - 0.5) * 7;
}

export function buildOutskirts(scene) {
  // ----- Heightfield, four quadrant meshes.
  const coords = [];
  for (let v = -1800; v <= 1800 + 1e-6;) {
    coords.push(v);
    const a = Math.abs(v);
    v += a < 760 ? 12 : a < 1250 ? 30 : 60;
  }
  const n = coords.length;
  const H = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i * n + j] = hillHeight(coords[i], coords[j]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pos = [], idx = [], map = new Map();
    const vid = (i, j) => {
      const k = i * n + j;
      if (map.has(k)) return map.get(k);
      map.set(k, pos.length / 3);
      pos.push(coords[i], H[k], coords[j]);
      return pos.length / 3 - 1;
    };
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
      const cx = (coords[i] + coords[i + 1]) / 2, cz = (coords[j] + coords[j + 1]) / 2;
      // (a cell centred exactly on an axis belongs to the + side: Math.sign(0) is 0, which used to
      // drop the whole x = 0 and z = 0 strips and cut a slot through the hills)
      if ((cx < 0 ? -1 : 1) !== sx || (cz < 0 ? -1 : 1) !== sz) continue;
      if (Math.max(Math.abs(coords[i]), Math.abs(coords[i + 1])) < 300 && Math.max(Math.abs(coords[j]), Math.abs(coords[j + 1])) < 300) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const G = new GeoBuilder();
    G.use('hillside').add(g, null, null);
    const m = realMesh(G.build(), { cast: false });
    m.name = 'hills';
    scene.add(m);
  }

  // ----- Forest belt just outside the outer sidewalk (full trees), eight sector meshes.
  // (24 sectors: small enough to be frustum-culled and to drop out of the AO / shadow pre-pass when
  // far from the camera, see town.js tickTown)
  const NS = 24, sectors = [];
  for (let k = 0; k < NS; k++) sectors.push(new GeoBuilder());
  const sectorOf = (x, z) => { const a = Math.atan2(z, x); return ((Math.floor(((a + Math.PI) / TAU) * NS) % NS) + NS) % NS; };
  const inner = EDGE + 7, outer = 346;
  for (let x = -outer; x <= outer; x += 9.5) for (let z = -outer; z <= outer; z += 9.5) {
    const px = x + (r() - 0.5) * 7, pz = z + (r() - 0.5) * 7;
    const d = Math.max(Math.abs(px), Math.abs(pz));
    if (d < inner || d > outer) continue;
    if (fbm(px / 60, pz / 60, 11) < 0.33 && d < 320) continue;       // clearings
    const t = r();
    const kind = t < 0.74 ? 'spruce' : t < 0.82 ? (d < EDGE + 16 ? 'pine' : 'spruce') : 'birch';
    tree(sectors[sectorOf(px, pz)], px, pz, 0.85 + r() * 0.5, kind, r, d < BOUND + 2, hillHeight(px, pz), d > EDGE + 13);
  }
  for (const G of sectors) if (!G.empty) { const m = realMesh(G.build()); m.name = 'forestbelt'; scene.add(m); }

  // ----- Spruce silhouettes on the hills (instanced, no shadows), four quadrant meshes.
  const sg = new GeoBuilder();
  sg.use('bark').cyl(0x4a3a2e, 0, 1.0, 0, 0.18, 2.0, 5);
  sg.use('spruce');
  for (let k = 0; k < 4; k++) sg.cone(0x2f4229, 0, 2.2 + k * 2.5, 0, 2.6 * (1 - k / 4.3) + 0.25, 4.4, 7, 0, k * 1.3);
  const sgeo = sg.build();
  const quads = [[], [], [], []];
  let placed = 0;
  for (let k = 0; k < 9000 && placed < 2400; k++) {
    const px = (r() * 2 - 1) * 1500, pz = (r() * 2 - 1) * 1500;
    const d = Math.max(Math.abs(px), Math.abs(pz));
    if (d < outer + 4 || d > 1480) continue;
    const dens = fbm(px / 140, pz / 140, 21);
    if (dens < 0.5) continue;
    quads[(px > 0 ? 1 : 0) + (pz > 0 ? 2 : 0)].push([px, hillHeight(px, pz) - 0.6, pz, 0.8 + r() * 0.9, r() * TAU]);
    placed++;
  }
  for (const list of quads) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(sgeo, realMaterials(sgeo), list.length);
    list.forEach(([x, y, z, s, a], i) => im.setMatrixAt(i, mat(x, y, z, 0, a, 0, s, s * (0.9 + (i % 5) * 0.06), s)));
    im.castShadow = false; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'silhouettes';
    scene.add(im);
  }

  // ----- A red barn and a cottage on the near hills, a roundpole fence (gärdesgård) across a field.
  const G = new GeoBuilder();
  const place = (x, z) => hillHeight(x, z);
  {
    const bx = 120, bz = -470, y0 = place(bx, bz);
    const f = new FrameAt(G, bx, bz, 0.25, y0);
    gableHouse(f, -11, -5, 22, 10, { wallH: 4.2, pitch: 0.62, wall: C.falu, roof: 'metalroof', roofC: 0x4a4c4e, plinth: 0.5, solid: false });
    f.box(C.trim, 0, CURB, -5.04, 3.6, 3.4, 0.06);
  }
  {
    const cx = -420, cz = 160, y0 = place(cx, cz);
    const f = new FrameAt(G, cx, cz, 1.3, y0);
    gableHouse(f, -4.5, -3.5, 9, 7, { wallH: 2.9, pitch: 0.68, wall: C.falu, roof: 'tile', roofC: C.roofBlack, chimney: 1, solid: false });
  }
  // Roundpole fence along a contour north of town.
  for (let x = -260; x < 60; x += 2.2) {
    const z = -430 + Math.sin(x / 45) * 12, y = place(x, z);
    G.use('bark');
    limb(G, x, y - 0.2, z - 0.25, x, y + 1.4, z - 0.25, 0.05, 0.04, 0x6a5a48, 4);
    limb(G, x, y - 0.2, z + 0.25, x, y + 1.4, z + 0.25, 0.05, 0.04, 0x6a5a48, 4);
    limb(G, x - 1.4, y + 0.1, z, x + 1.6, y + 1.3, z, 0.045, 0.04, 0x7a6a56, 4);
  }
  scene.add(realMesh(G.build(), { cast: false }));

  // ----- Invisible walls beyond the trees.
  const b = BOUND;
  box(-b - 10, -b - 10, b + 10, -b, 99, 'bound');
  box(-b - 10, b, b + 10, b + 10, 99, 'bound');
  box(-b - 10, -b, -b, b, 99, 'bound');
  box(b, -b, b + 10, b, 99, 'bound');
}

// A minimal frame for building on the hills: like kit.Frame but lifted to a ground height y0
// (CURB-relative builders add CURB themselves, so we offset by y0 - CURB).
class FrameAt {
  constructor(G, ox, oz, yaw, y0) { this.S = G; this.F = G; this.ox = ox; this.oz = oz; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); this.dy = y0 - CURB; }
  use(s, o) { this.S.use(s, o); return this; }
  wx(lx, lz) { return this.ox + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.oz - lx * this.s + lz * this.c; }
  box(color, lx, y0, lz, w, h, d, ly = 0) { this.S.boxB(color, this.wx(lx, lz), y0 + this.dy, this.wz(lx, lz), w, h, d, this.yaw + ly); return this; }
  boxC(color, lx, y, lz, w, h, d, ly = 0, rx = 0, rz = 0) { this.S.box(color, this.wx(lx, lz), y + this.dy, this.wz(lx, lz), w, h, d, this.yaw + ly, rx, rz); return this; }
  cyl(color, lx, y, lz, r, h, n = 12, rx = 0, rz = 0, ly = 0) { this.S.cyl(color, this.wx(lx, lz), y + this.dy, this.wz(lx, lz), r, h, n, rx, this.yaw + ly, rz); return this; }
  add(geo, color, lx, y, lz, ly = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { this.S.add(geo, color, mat(this.wx(lx, lz), y + this.dy, this.wz(lx, lz), rx, this.yaw + ly, rz, sx, sy, sz)); return this; }
  solid() { return null; }
  W(lx, lz) { return [this.wx(lx, lz), this.wz(lx, lz)]; }
}
