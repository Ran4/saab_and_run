// Beyond the town: a forest belt just outside the outer road, then rolling snowy hills (a noise
// heightfield in 'hillside', never spheres), spruces in stands and boulders on the near hills, spruce
// silhouettes on the far ones. The hills are the horizon (DESIGN 10.1) and, since
// features/avgrunden.md, ground: Ove can walk and drive out there (layout.terrain: the ground follows
// this mesh), through four forest tracks or between the trees. Nothing but nature out there, and the
// cold (game/cold.js).

import { THREE, GeoBuilder, realMesh, realMaterials, mat, PRIM } from '../gfx.js';
import { HALF, RHW, SW, CURB, terrain, onTrack } from './layout.js';
import { circle } from './collision.js';
import { tree, TAU } from './kit.js';
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
  // The ground out there is this mesh: its height at (x, z), triangle by triangle as it is drawn (the
  // smooth hillHeight differs from it by up to ~0.3 m between the vertices).
  const cell = (v) => { let lo = 0, hi = n - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (coords[m] <= v) lo = m; else hi = m - 1; } return lo; };
  terrain.at = (x, z) => {
    const i = cell(x), j = cell(z), x0 = coords[i], z0 = coords[j];
    const u = Math.max(0, Math.min(1, (x - x0) / (coords[i + 1] - x0))), v = Math.max(0, Math.min(1, (z - z0) / (coords[j + 1] - z0)));
    const a = H[i * n + j], b = H[(i + 1) * n + j], c = H[i * n + j + 1], d = H[(i + 1) * n + j + 1];
    // (the cell's two triangles, a c b and b c d: split along b - c)
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };

  // ----- Forest belt just outside the outer sidewalk (full trees), eight sector meshes.
  // (24 sectors: small enough to be frustum-culled and to drop out of the AO / shadow pre-pass when
  // far from the camera, see town.js tickTown)
  // Every trunk is solid now (only those by the old wall used to be: nobody got further). The
  // forest tracks stay clear: a tree there is still made, into a builder that is thrown away, so the
  // rest of the belt comes out as it was.
  const NS = 24, sectors = [], scrap = new GeoBuilder();
  scrap.noCards = true;
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
    const gap = onTrack(px, pz, 6);
    tree(gap ? scrap : sectors[sectorOf(px, pz)], px, pz, 0.85 + r() * 0.5, kind, r, !gap, hillHeight(px, pz), d > EDGE + 13);
    if (gap) scrap.parts.length = 0;
  }
  for (const G of sectors) if (!G.empty) { const m = realMesh(G.build()); m.name = 'forestbelt'; scene.add(m); }

  // ----- Out on the near hills (features/avgrunden.md: Ove can go out there now; nothing but nature):
  // spruces in stands, thick by the forest belt and thinning out over the open snow, as instances of
  // one low-detail spruce (the forest belt's own 'lite' template) with trunk colliders, four quadrant
  // meshes; snow-capped boulders. Beyond ~760 m (where the cold has long since got Ove) the cheaper
  // silhouettes take over.
  buildWilderness(scene);

  // ----- Spruce silhouettes on the far hills (instanced, no shadows), four quadrant meshes. (1920 of
  // them now: the ~500 that stood on the near hills are buildWilderness' spruces.)
  const sgeo = silhouetteGeo();
  const quads = [[], [], [], []];
  let placed = 0;
  for (let k = 0; k < 9000 && placed < 1920; k++) {
    const px = (r() * 2 - 1) * 1500, pz = (r() * 2 - 1) * 1500;
    const d = Math.max(Math.abs(px), Math.abs(pz));
    if (d < WILD_OUT - 20 || d > 1480) continue;
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
  // (no barn, no cottage, no fence any more: out there is nothing but nature. And no invisible walls:
  // the cold, game/cold.js, sends Ove home; everyone else stops at BOUND, main.js keepInside)
}

// The near hills' spruces and boulders (see buildOutskirts). Their own random stream, so the rest
// of the outskirts stays as it was. The spruce is one instanced shape: a trunk and ten narrow, offset
// tiers in 'spruce' (the surface draws the branch whorls and the snow on them), ~200 triangles, tall
// and slim like a Swedish spruce - no twig cards (those live in the sign pages and can't be instanced).
// While the camera is in the town they are the far silhouette instead (76 triangles, the same draw
// calls), out of the AO pre-pass and casting no shadow: tickWild.
const WILD_IN = 350, WILD_OUT = 760;
const wild = { near: [], far: [], on: null, shadow: null };
let SIL = null;
function silhouetteGeo() {
  if (SIL) return SIL;
  const sg = new GeoBuilder();
  sg.use('bark').cyl(0x4a3a2e, 0, 1.0, 0, 0.18, 2.0, 5);
  sg.use('spruce');
  for (let k = 0; k < 4; k++) sg.cone(0x2f4229, 0, 2.2 + k * 2.5, 0, 2.6 * (1 - k / 4.3) + 0.25, 4.4, 7, 0, k * 1.3);
  return (SIL = sg.build());
}
function wildSpruceGeo() {
  const g = new GeoBuilder(), q = mulberry32(5150);
  g.use('bark').cyl(0x45362b, 0, 1.6, 0, 0.17, 3.2, 6);
  g.use('spruce');
  const n = 10, top = 12.5;
  for (let k = 0; k < n; k++) {
    const u = k / n, y = 1.0 + u * (top - 2.4), r = 2.3 * Math.pow(1 - u, 0.85) + 0.22, h = 1.9 - u * 0.7;
    // (each tier a little off the axis and turned, so the outline is ragged, not a lathe)
    g.cone(0x253622, (q() - 0.5) * 0.12, y + h / 2, (q() - 0.5) * 0.12, r, h, 9, (q() - 0.5) * 0.08, q() * 6.3, (q() - 0.5) * 0.08);
  }
  g.cone(0x2a3b25, 0, top + 0.2, 0, 0.32, 1.4, 6);
  return g.build();
}
function buildWilderness(scene) {
  const q = mulberry32(4242);
  const at = terrain.at || hillHeight;
  const geo = wildSpruceGeo();
  const quads = [[], [], [], []];
  const put = (x, z, s) => {
    const y = at(x, z) - 0.15, hs = 0.85 + q() * 0.3;
    quads[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)].push([x, y, z, s, s * hs, q() * TAU]);
    // the trunk stops Ove and his car; the crown is the camera's (camera.js: dense, like a spruce)
    const b = circle(x, z, 0.3 * s, 99, 'tree');
    b.species = 'spruce'; b.crownR = 2.4 * s; b.crownBottom = y + 1.0 * s * hs; b.crownTop = y + 13.5 * s * hs;
  };
  // stands: a large-scale mask (denser just outside the belt, so the forest frays out rather than
  // stopping at a line), and lone trees here and there in the open
  for (let k = 0; k < 26000; k++) {
    const x = (q() * 2 - 1) * WILD_OUT, z = (q() * 2 - 1) * WILD_OUT, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < WILD_IN || d > WILD_OUT) continue;
    const stand = fbm(x / 110, z / 110, 31) + (1 - Math.min(1, (d - WILD_IN) / 90)) * 0.22;
    const p = stand > 0.56 ? 0.13 : stand > 0.5 ? 0.045 : 0.007;
    if (q() > p || onTrack(x, z, 8)) continue;
    put(x, z, 0.7 + q() * 0.55);
  }
  const sil = silhouetteGeo();
  for (const list of quads) {
    if (!list.length) continue;
    for (const [g, out, dy] of [[geo, wild.near, 0], [sil, wild.far, -0.45]]) {
      const im = new THREE.InstancedMesh(g, realMaterials(g), list.length);
      list.forEach(([x, y, z, s, sy, a], i) => im.setMatrixAt(i, mat(x, y + dy, z, 0, a, 0, s, sy, s)));
      im.castShadow = false; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = dy ? 'silhouettes' : 'wildtrees';
      // (both shown until the first tickWild: the loading's precompile and upload see them)
      scene.add(im);
      out.push(im);
    }
  }
  // Boulders (flyttblock): a few faceted, snow-capped grey stones, alone or two or three together,
  // half sunk into the hillside. One mesh.
  const G = new GeoBuilder().use('concrete');
  let n = 0;
  for (let k = 0; k < 4000 && n < 70; k++) {
    const x = (q() * 2 - 1) * 640, z = (q() * 2 - 1) * 640, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < 356 || onTrack(x, z, 9) || fbm(x / 80, z / 80, 41) < 0.55) continue;
    const parts = 1 + Math.floor(q() * 3);
    for (let j = 0; j < parts; j++) {
      const s = (j ? 0.5 + q() * 0.7 : 0.9 + q() * 1.6), px = x + (j ? (q() - 0.5) * 2.6 : 0), pz = z + (j ? (q() - 0.5) * 2.6 : 0);
      const c = [0x7c7a76, 0x8a8782, 0x6e6c6a][Math.floor(q() * 3)];
      G.add(PRIM.ico(0), c, mat(px, at(px, pz) + s * 0.12, pz, (q() - 0.5) * 0.5, q() * TAU, (q() - 0.5) * 0.5, s * (1.1 + q() * 0.5), s * (0.65 + q() * 0.3), s * (0.9 + q() * 0.5)));
      circle(px, pz, s * 0.55, at(px, pz) + s * 0.4, 'rock');
    }
    n++;
  }
  const rocks = realMesh(G.build());
  rocks.name = 'boulders';
  rocks.castShadow = false;   // (tickWild: only seen, and only casting, out there)
  scene.add(rocks);
  wild.rocks = rocks;
}

// Every frame (main.js): the near hills' spruces in detail only while the camera is out by the edge
// of the town or beyond it (from further in they are tops behind the forest belt), and only then in
// the AO pre-pass and, a little further out, casting shadows.
export function tickWild(cx, cz, cy = 0) {
  const d = Math.max(Math.abs(cx), Math.abs(cz));
  const on = d > (wild.on ? 255 : 268) && cy < 70;
  if (on !== wild.on) {
    wild.on = on;
    for (const m of wild.near) { m.visible = on; m.userData.noAO = !on; }
    for (const m of wild.far) m.visible = !on;
  }
  const sh = on && d > (wild.shadow ? 275 : 285);
  if (sh !== wild.shadow) { wild.shadow = sh; for (const m of [...wild.near, wild.rocks]) if (m) m.castShadow = sh; }
}
