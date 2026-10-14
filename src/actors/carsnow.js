// Snow on cars (feature sno_pa_bilar, features/implemented/sno_pa_bilar.md). A car parked under the
// first snow (car.js opts.snow: a cap on the roof, bonnet, boot and the upward-facing glass, and the
// paint's frost) sheds it when somebody drives it away:
//  - The cap is mapped onto a grid over the car's top (CELL; per model, snowLayout: the cap's height,
//    slope, depth and glass-or-paint at every cell) and cut into slabs (`chunks`: ~0.4 x 0.46 m
//    Voronoi cells, glass and paint apart). From the moment the car moves or its engine runs, a
//    CarSnow keeps each slab's state and an R8 texture of what is left, which the car's own cap
//    material reads (capMaterial): thinner where the wind has worn it, broken off with a ragged edge
//    where a slab has gone. The parked cars round about keep the shared cap; nothing changes for them.
//  - A slab breaks loose when what pulls at it beats its bond (`hold`, per slab: most hold fast, a
//    few are loose, the edges less): the shear of the car's own acceleration (the snow stays behind
//    when the car pulls away, runs on when it brakes, slides off the outside of a turn), the wind's
//    drag on a slab whose windward edge is free, the lift over the car at speed (the suction over the
//    windscreen header peels the roof from its front edge from ~60-70 km/h; the boot, in the roof's
//    wake, keeps its snow longest), a car dropping away under it (a jump), a jolt cracking the bonds
//    (a kerb, a landing, a crash). Only a slab with a free side that way can go: its neighbours of
//    the same panel hold it in, so a panel comes off from its edges inwards. The engine warms the
//    bonnet over a few minutes and its snow lets go. The wind blows powder off the exposed edges
//    and wears them thin.
//  - A slab that lets go is a lump (all of them in one InstancedMesh): it slides along the car's top
//    (the grid's heights: gravity, friction, the car's accelerations and turns, the wind; it piles up
//    against the foot of the windscreen), leaves at an edge or lifts off, tumbles through the air
//    against its drag, crumbles into powder in the airstream, and bursts into powder on the road or
//    lands softly and lies there a while (a car driving over it squashes it).
//  - Wipers: someone in the driver's seat with the engine running sweeps two fans out of the
//    windscreen's snow, pushing a ridge to the end of each sweep (two blades drawn while they move).
//  - The paint's frost fades as the wind takes it (the car's own copies of its snowy materials, which
//    differ only in a uniform: car.js frostMaterials). When the last of it is gone the car is an
//    ordinary clean car again (car.js snowGone: shared materials, no cap, instanced far away).
// Nothing costs anything until a snowy car moves (parked cars sleep). Per shedding car: one small
// texture, its own cap material (one program for all of them), ~40 slabs stepped at 60 Hz; the lumps
// and blades are two instanced draw calls for the whole town, and none while there are none.

import { THREE, GeoBuilder, PRIM, surfaceMaterial, scene, camera, getSnow } from '../gfx.js';
import { groundAt } from '../world/collision.js';
import { fx as FX } from '../game/fx.js';
import { snowCapGeometry } from './carmodels.js';
import { clamp, mulberry32 } from '../util.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 0.08;     // the grid (m)
const MAXV = 1.6;      // the texture's 1.0: snow can pile up to 1.6x the cap's depth (the wipers' ridge)
const G = 9.81;
const MU = 0.22;       // a loose lump on paint or glass (kinetic friction)
// The wind on a slab: 0.5 rho v² over its mass per m² (fresh snow that settled overnight, ~150
// kg/m³ x 4.5 cm), times a lift coefficient per slab (`cl`) and a drag on a free windward edge.
const AIR = 0.096;
// Tuning (tests may change it): hold = the bonds' range (m/s², drawn skewed to the low end per slab),
// erode = the wind's wear on an exposed edge per (v - 8 m/s)², film = the paint frost's per
// (v - 5 m/s)², warmT = s of running engine until the bonnet is warm, rest = s a lump lies on the road.
export const SNOW_TUNE = { hold: [4, 20], erode: 0.0005, film: 0.0004, warmT: 180, rest: 30, near: 110 };

// ---------------------------------------------------------------------------------------------
// The grid over a model's snow cap.

const layouts = new WeakMap();
export function snowLayout(model) {
  const geo = snowCapGeometry(model.body, model.glass);
  if (!geo || !geo.attributes.capo) return null;
  let L = layouts.get(geo);
  if (!L) { L = buildLayout(geo, model.type || 'car'); layouts.set(geo, L); }
  return L;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

function buildLayout(geo, type) {
  const pos = geo.attributes.position.array, co = geo.attributes.capo.array;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const x0 = bb.min.x - CELL, z0 = bb.min.z - CELL;
  const nx = Math.ceil((bb.max.x - bb.min.x) / CELL) + 3, nz = Math.ceil((bb.max.z - bb.min.z) / CELL) + 3, N = nx * nz;
  const top = new Float32Array(N).fill(-99), dep = new Float32Array(N), glass = new Uint8Array(N);
  const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
  // every cap triangle rasterised from above: the highest layer wins a cell
  const nt = pos.length / 9;
  for (let t = 0; t < nt; t++) {
    const a = t * 9;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[a + 3], by = pos[a + 4], bz = pos[a + 5], cx = pos[a + 6], cy = pos[a + 7], cz = pos[a + 8];
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(d) < 1e-7) continue;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    let fl = Math.hypot(fx, fy, fz) || 1;
    if (fy < 0) fl = -fl;
    fx /= fl; fy /= fl; fz /= fl;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / CELL - 0.5));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / CELL - 0.5)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / CELL - 0.5));
    const g = co[t * 6 + 1] > 0.5 ? 1 : 0;
    for (let k = k0; k <= k1; k++) {
      const pz = z0 + (k + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * CELL;
        const w1 = ((px - ax) * (cz - az) - (cx - ax) * (pz - az)) / d, w2 = ((bx - ax) * (pz - az) - (px - ax) * (bz - az)) / d, w0 = 1 - w1 - w2;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const y = w0 * ay + w1 * by + w2 * cy, j = k * nx + i;
        if (y <= top[j]) continue;
        top[j] = y; NX[j] = fx; NY[j] = fy; NZ[j] = fz; glass[j] = g;
        dep[j] = w0 * co[t * 6] + w1 * co[t * 6 + 2] + w2 * co[t * 6 + 4];
      }
    }
  }
  const has = (j) => top[j] > -50;
  // one-cell cracks between parts of the cap (its triangles don't meet everywhere) are filled
  const fill = [];
  for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) {
    const j = k * nx + i;
    if (has(j)) continue;
    for (const [p, q] of [[j - 1, j + 1], [j - nx, j + nx]]) if (has(p) && has(q) && Math.abs(top[p] - top[q]) < 0.12 && glass[p] === glass[q]) { fill.push(j, top[p] > top[q] ? p : q); break; }
  }
  for (let f = 0; f < fill.length; f += 2) { const j = fill[f], s = fill[f + 1]; top[j] = top[s]; dep[j] = dep[s]; glass[j] = glass[s]; NX[j] = NX[s]; NY[j] = NY[s]; NZ[j] = NZ[s]; }

  // slabs: a jittered grid of sites, every cell to its nearest, glass and paint apart
  const rnd = mulberry32(hashStr(type));
  const CX = 0.4, CZ = 0.46;
  const sxN = Math.ceil((bb.max.x - bb.min.x) / CX) + 1, szN = Math.ceil((bb.max.z - bb.min.z) / CZ) + 1;
  const sites = new Float32Array(sxN * szN * 2);
  for (let b = 0; b < szN; b++) for (let a = 0; a < sxN; a++) {
    sites[(b * sxN + a) * 2] = bb.min.x + (a + 0.5 + (rnd() - 0.5) * 0.7) * CX;
    sites[(b * sxN + a) * 2 + 1] = bb.min.z + (b + 0.5 + (rnd() - 0.5) * 0.7) * CZ;
  }
  let chunkOf = new Int32Array(N).fill(-1);
  const keyMap = new Map();
  let nc = 0;
  for (let j = 0; j < N; j++) {
    if (!has(j)) continue;
    const px = x0 + ((j % nx) + 0.5) * CELL, pz = z0 + (((j / nx) | 0) + 0.5) * CELL;
    const a0 = Math.floor((px - bb.min.x) / CX), b0 = Math.floor((pz - bb.min.z) / CZ);
    let best = -1, bd = 1e9;
    for (let b = Math.max(0, b0 - 1); b <= Math.min(szN - 1, b0 + 1); b++) for (let a = Math.max(0, a0 - 1); a <= Math.min(sxN - 1, a0 + 1); a++) {
      const s = b * sxN + a, dd = (sites[s * 2] - px) ** 2 + (sites[s * 2 + 1] - pz) ** 2;
      if (dd < bd) { bd = dd; best = s; }
    }
    const key = best * 2 + glass[j];
    let c = keyMap.get(key);
    if (c === undefined) { c = nc++; keyMap.set(key, c); }
    chunkOf[j] = c;
  }
  // borders between slabs (cells shared), and tiny slabs (a corner of a cell) merged into a neighbour
  const borders = () => {
    const B = new Map();
    for (let j = 0; j < N; j++) {
      const c = chunkOf[j];
      if (c < 0) continue;
      for (const o of [j + 1, j + nx]) {
        if (o >= N || (o === j + 1 && (j + 1) % nx === 0)) continue;
        const e = chunkOf[o];
        if (e < 0 || e === c) continue;
        const k1 = c * 4096 + e, k2 = e * 4096 + c;
        B.set(k1, (B.get(k1) || 0) + 1); B.set(k2, (B.get(k2) || 0) + 1);
      }
    }
    return B;
  };
  const count = new Int32Array(nc);
  for (let j = 0; j < N; j++) if (chunkOf[j] >= 0) count[chunkOf[j]]++;
  let B = borders();
  const chGlass = new Int8Array(nc).fill(-1);
  for (let j = 0; j < N; j++) if (chunkOf[j] >= 0) chGlass[chunkOf[j]] = glass[j];
  const remap = new Int32Array(nc).map((_, i) => i);
  for (let c = 0; c < nc; c++) {
    if (count[c] >= 6) continue;
    let best = -1, bn = 0;
    for (const [k, n] of B) if (((k / 4096) | 0) === c) { const e = k % 4096; if (chGlass[e] === chGlass[c] && count[e] >= 6 && n > bn) { bn = n; best = e; } }
    if (best >= 0) { remap[c] = best; count[best] += count[c]; count[c] = 0; }
  }
  const ids = new Map();
  for (let j = 0; j < N; j++) {
    if (chunkOf[j] < 0) continue;
    const r = remap[chunkOf[j]];
    if (!ids.has(r)) ids.set(r, ids.size);
    chunkOf[j] = ids.get(r);
  }
  nc = ids.size;
  B = borders();
  const chunks = [];
  for (let c = 0; c < nc; c++) chunks.push({ tex: [], n: 0, x: 0, y: 0, z: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, nx: 0, ny: 0, nz: 0, dep: 0, glass: 0, nbr: [] });
  for (let j = 0; j < N; j++) {
    const c = chunkOf[j];
    if (c < 0) continue;
    const C = chunks[c], px = x0 + ((j % nx) + 0.5) * CELL, pz = z0 + (((j / nx) | 0) + 0.5) * CELL;
    C.tex.push(j); C.n++;
    C.x += px; C.y += top[j]; C.z += pz; C.nx += NX[j]; C.ny += NY[j]; C.nz += NZ[j]; C.dep += dep[j]; C.glass = glass[j];
    C.x0 = Math.min(C.x0, px - CELL / 2); C.x1 = Math.max(C.x1, px + CELL / 2); C.z0 = Math.min(C.z0, pz - CELL / 2); C.z1 = Math.max(C.z1, pz + CELL / 2);
  }
  let yLo = 1e9, yHi = -1e9;
  for (const C of chunks) {
    C.x /= C.n; C.y /= C.n; C.z /= C.n; C.dep /= C.n;
    const l = Math.hypot(C.nx, C.ny, C.nz) || 1;
    C.nx /= l; C.ny /= l; C.nz /= l;
    C.tex = Int32Array.from(C.tex);
    if (!C.glass) { yLo = Math.min(yLo, C.y); yHi = Math.max(yHi, C.y); }
  }
  for (const [k, n] of B) {
    const c = (k / 4096) | 0, e = k % 4096, C = chunks[c], E = chunks[e];
    const dx = E.x - C.x, dz = E.z - C.z, l = Math.hypot(dx, dz) || 1;
    // (a neighbour holds a slab in only if it is of the same panel: the roof's front row is free to
    // the wind although the windscreen's snow lies in front of it, lower down)
    C.nbr.push({ i: e, dx: dx / l, dz: dz / l, same: E.glass === C.glass && Math.abs(E.y - C.y) < 0.1 + 0.6 * l * Math.max(0.2, 1 - C.ny), n });
  }
  // the foot of the windscreen (the bonnet lies in front of it), and each slab's place in the wind
  let wsZ = null;
  const ws = [];
  for (let j = 0; j < N; j++) if (has(j) && glass[j] && NZ[j] > 0.25) {
    const pz = z0 + (((j / nx) | 0) + 0.5) * CELL;
    if (pz > 0.1) { ws.push(j); wsZ = Math.max(wsZ ?? -1e9, pz); }
  }
  for (const C of chunks) {
    // in the lee of the roof: something of the cap more than 12 cm higher within 1.6 m in front
    let lee = false;
    for (let j = 0; j < N && !lee; j++) {
      if (!has(j) || top[j] < C.y + 0.12) continue;
      const px = x0 + ((j % nx) + 0.5) * CELL, pz = z0 + (((j / nx) | 0) + 0.5) * CELL;
      if (Math.abs(px - C.x) < 0.3 && pz > C.z1 && pz < C.z1 + 1.6) lee = true;
    }
    C.lee = lee;
    C.bonnet = !C.glass && !lee && wsZ !== null && C.z > wsZ - 0.05 && C.nz < 0.3;
    // lift: the suction is strongest over the roof (just behind the windscreen header), less over the
    // bonnet; the windscreen is pressed (the flow stops against it); in the roof's wake little
    const h = yHi > yLo ? clamp((C.y - yLo) / (yHi - yLo), 0, 1) : 1;
    C.cl = (lee ? 0.12 : C.nz > 0.3 ? 0.1 : 0.28 + 0.24 * h) * (0.8 + 0.4 * rnd());
    C.edge = C.nbr.filter((b) => b.same).length < 3;
  }
  // around the cap's outline: cells off the cap that take their neighbour's value in the texture (so
  // that the cap's own edge is not eaten into by the filtering)
  const rim = [];
  for (let j = 0; j < N; j++) {
    if (has(j)) continue;
    const i = j % nx, k = (j / nx) | 0, src = [];
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, kk = k + dk;
      if ((di || dk) && ii >= 0 && ii < nx && kk >= 0 && kk < nz && has(kk * nx + ii)) src.push(kk * nx + ii);
    }
    if (src.length) rim.push([j, Int32Array.from(src)]);
  }
  // the wipers (two, parked along the foot of the windscreen pointing to the passenger's side, as
  // carmodels.js draws them): each cell of the windscreen in the glass's own plane
  let wiper = null;
  if (ws.length >= 12) {
    let xa = 1e9, xb = -1e9, yb = 1e9, yt = -1e9, zt = 1e9;
    for (const j of ws) { const px = x0 + ((j % nx) + 0.5) * CELL, pz = z0 + (((j / nx) | 0) + 0.5) * CELL; xa = Math.min(xa, px); xb = Math.max(xb, px); yb = Math.min(yb, top[j]); yt = Math.max(yt, top[j]); zt = Math.min(zt, pz); }
    const ul = Math.hypot(yt - yb, zt - wsZ) || 1, uy = (yt - yb) / ul, uz = (zt - wsZ) / ul;
    const hw = (xb - xa) / 2, xc = (xb + xa) / 2, sc = hw / 0.7;
    const wx = new Float32Array(ws.length), wsS = new Float32Array(ws.length);
    ws.forEach((j, n) => { const pz = z0 + (((j / nx) | 0) + 0.5) * CELL; wx[n] = x0 + ((j % nx) + 0.5) * CELL; wsS[n] = (top[j] - yb) * uy + (pz - wsZ) * uz; });
    wiper = { tex: Int32Array.from(ws), x: wx, s: wsS, px: [xc - 0.075 * sc, xc + 0.545 * sc], R: 0.6 * sc, y: yb, z: wsZ, uy, uz, max: 1.82 };
  }
  return { nx, nz, N, x0, z0, top, dep, glass, NX, NY, NZ, chunkOf, chunks, rim, wiper, wsZ };
}

// ---------------------------------------------------------------------------------------------
// The shedding car's cap material: the snow surface reading what is left from the car's texture.

function capMaterial(tex, L) {
  const m = surfaceMaterial('snow', { unique: true });
  const base = m.onBeforeCompile, key = m.customProgramCacheKey;
  const u = { uShed: { value: tex }, uShedBox: { value: new THREE.Vector4(L.x0, L.z0, 1 / (L.nx * CELL), 1 / (L.nz * CELL)) } };
  m.onBeforeCompile = function (sh, r) {
    base.call(this, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uShed;\nuniform vec4 uShedBox;\nattribute vec2 capo;\nvarying vec2 vShedUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vShedUv = ( position.xz - uShedBox.xy ) * uShedBox.zw;
transformed -= normal * capo.x * 0.8 * ( 1.0 - texture2D( uShed, vShedUv ).r * ${MAXV.toFixed(2)} );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uShed;\nuniform vec4 uShedBox;\nvarying vec2 vShedUv;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ // what is left of the snow (carsnow.js): a ragged edge where a slab has gone, patchy where the wind wore it thin
  vec3 sq = vec3( vTri.x, 0.0, vTri.z );
  vec2 sw = ( vec2( gNoise( sq * 7.0 ), gNoise( sq * 7.0 + 5.3 ) ) - 0.5 ) * ${(1.4 * CELL).toFixed(3)} * uShedBox.zw;
  float sv = texture2D( uShed, vShedUv + sw ).r * ${MAXV.toFixed(2)};
  float sn = gNoise( sq * 17.0 ) * 0.65 + gNoise( sq * 43.0 + 3.1 ) * 0.35;
  if ( sv < 0.4 + ( sn - 0.5 ) * 0.62 ) discard;
}`);
  };
  m.customProgramCacheKey = () => key.call(m) + '|carsnow1';
  m.name = 'carsnow:cap';
  return m;
}

// ---------------------------------------------------------------------------------------------
// One car's snow.

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const shedding = new Set();
const FROST = 0.32;
const wiping = new Set();

export class CarSnow {
  constructor(car) {
    const L = (this.L = snowLayout(car.model));
    this.car = car;
    const nc = L.chunks.length, T = SNOW_TUNE;
    this.alive = new Uint8Array(nc).fill(1);
    this.thick = new Float32Array(nc).fill(1);
    this.q8 = new Uint8Array(nc).fill(48);
    this.hold = new Float32Array(nc);
    for (let i = 0; i < nc; i++) this.hold[i] = (T.hold[0] + (T.hold[1] - T.hold[0]) * Math.random() ** 1.3) * (L.chunks[i].edge ? 0.85 : 1);
    this.left = nc;
    this.own = new Float32Array(L.N);
    for (let j = 0; j < L.N; j++) this.own[j] = L.chunkOf[j] >= 0 ? 1 : 0;
    this.data = new Uint8Array(L.N);
    const tex = (this.tex = new THREE.DataTexture(this.data, L.nx, L.nz, THREE.RedFormat, THREE.UnsignedByteType));
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    this.mat = capMaterial(tex, L);
    // (out of the AO pre-pass: it draws the cap whole)
    for (const m of [car.snowCap, car.snowCapLod]) if (m) { m.material = this.mat; m.userData.noAO = true; }
    this.frost = { value: getSnow() };
    car.frostMaterials(this.frost);
    this.film = 1;
    this.frostT = 0;
    this.warm = 0;
    this.shake = 0;
    this.ax = this.ay = this.az = 0;
    this.pv = null;
    this.wasAir = false;
    this.kick = null;
    this.wipe = null;
    this.wiped = !L.wiper;
    this.wipeWait = 0.7;
    this.puffT = 0;
    this.dirty = true;
    this.write();
    shedding.add(this);
  }

  // The car was put somewhere (car.place): no acceleration out of a teleport.
  reset() { this.pv = null; }

  near() {
    const c = this.car, r = SNOW_TUNE.near;
    return !!camera && (c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2 < r * r && c.root.visible;
  }

  step(dt) {
    const c = this.car, L = this.L, T = SNOW_TUNE;
    // the car's acceleration in its own frame (+x left, +y up, +z forward) from its velocity (the
    // body's: the wheels' vertical speed and the springs'): what it keeps up for a while (pulling
    // away, braking, turning; ~0.1 s to build) loads the bonds; a knock within a step (a crash, a
    // landing) is one of its own (knock)
    const vyb = c.vy + c._sus.hv;
    if (!this.pv) this.pv = [c.vx, vyb, c.vz];
    const p = this.pv, dvx = c.vx - p[0], dvy = vyb - p[1], dvz = c.vz - p[2];
    p[0] = c.vx; p[1] = vyb; p[2] = c.vz;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    const dx = dvx * cy - dvz * sy, dz = dvx * sy + dvz * cy;
    const k = 1 - Math.exp(-8 * dt), A = 15;
    this.ax += (clamp(dx / dt, -A, A) - this.ax) * k;
    this.az += (clamp(dz / dt, -A, A) - this.az) * k;
    this.ay += (clamp(dvy / dt, -A, A) - this.ay) * k;
    const kn = Math.hypot(dx, dz), kv = this.wasAir && !c.air ? Math.abs(dvy) : 0;
    this.wasAir = c.air;
    this.shake = Math.max(this.shake * Math.exp(-5 * dt), Math.min(1, kn / 4 + kv / 6));
    if ((kn > 0.6 || kv > 2) && this.left) this.knock(dx, dz, kn, kv, dvx, dvz);
    const vf = c.vx * sy + c.vz * cy;
    if (c.running) this.warm = Math.min(1, this.warm + dt / T.warmT);
    // the paint's frost goes with the wind (what a slab leaves on the paint is a patchy residue, not
    // the full frost of a parked car: down to FROST of it in the first half second)
    const wv = Math.abs(vf) - 5;
    if (wv > 0 && this.film > 0) this.film = Math.max(0, this.film - dt * T.film * wv * wv);
    this.frostT = Math.min(1, this.frostT + dt * 2);
    this.frost.value = getSnow() * (1 - (1 - FROST) * this.frostT) * smooth01(this.film * 1.3);
    if (!this.wiped && !this.wipe && c.running && (c.driver || c.ai) && !c.dead) {
      this.wipeWait -= dt;
      if (this.wipeWait <= 0) { this.wipe = { t: 0, ang: 0, last: 0 }; wiping.add(this); ensureMeshes(); }
    }
    if (this.wipe) this.stepWipers(dt);
    if (this.left > 0) this.stepChunks(dt, vf);
    if (this.dirty) this.write();
    if (!this.left && this.film <= 0 && !this.wipe) c.snowGone();
  }

  stepChunks(dt, vf) {
    const L = this.L, C = L.chunks, al = this.alive, c = this.car, T = SNOW_TUNE;
    const q = AIR * vf * vf, back = vf >= 0 ? 1 : -1;     // the wind comes from the front going forwards
    const near = this.near();
    let anyFree = 0;
    for (let i = 0; i < C.length; i++) {
      if (!al[i]) continue;
      const ch = C[i];
      // the free sides: no snow of the same panel left next to it that way
      let fF = true, fB = true, fL = true, fR = true;
      for (const nb of ch.nbr) {
        if (!nb.same || !al[nb.i]) continue;
        if (nb.dz > 0.5) fF = false; else if (nb.dz < -0.5) fB = false;
        if (nb.dx > 0.5) fL = false; else if (nb.dx < -0.5) fR = false;
      }
      const windFree = back > 0 ? fF : fB, th = this.thick[i];
      // the wind's lift (a worn slab is lighter) and its drag on a free windward edge (along -z)
      const lift = (q * ch.cl * (windFree ? 1 : 0.3)) / Math.max(0.35, th);
      const drag = windFree ? q * 0.1 * back : 0;
      // the shear along the panel: the car's acceleration (the snow is left behind) and the drag; in the
      // air the snow falls with the car (weightless on it, whatever the game's gravity)
      const Fx = -this.ax, Fy = c.air ? G : -this.ay, Fz = -this.az - drag;
      const Fn = Fx * ch.nx + Fy * ch.ny + Fz * ch.nz;
      const Tx = Fx - Fn * ch.nx, Ty = Fy - Fn * ch.ny, Tz = Fz - Fn * ch.nz;
      const shear = Math.hypot(Tx, Ty, Tz);
      // off the panel: the lift, the car dropping away under it, against gravity
      const pull = lift + Fn - G * ch.ny;
      let h = this.hold[i] * (1 - 0.4 * this.shake);
      if (ch.bonnet) h *= 1 - 0.7 * this.warm;
      let go = pull > h * 0.6 && (windFree || (c.air && (fF || fB || fL || fR)));
      if (!go && shear > h) {
        const l = Math.hypot(Tx, Tz) || 1, sx = Tx / l, sz = Tz / l;
        go = (sz > 0.5 && fF) || (sz < -0.5 && fB) || (sx > 0.5 && fL) || (sx < -0.5 && fR);
      }
      if (go) { this.detach(i, near, false); continue; }
      if (windFree) anyFree++;
      // the wind wears the exposed snow away (an edge it gets under more, the rest a little)
      if (Math.abs(vf) > 8) {
        const e = T.erode * (Math.abs(vf) - 8) ** 2 * (ch.cl / 0.45) * (windFree ? 1 : 0.15) * dt;
        const t2 = (this.thick[i] = th - e);
        if (t2 < 0.22) { this.detach(i, near, true); continue; }
        const q8 = (t2 * 48) | 0;
        if (q8 !== this.q8[i]) { this.q8[i] = q8; this.dirty = true; }
      }
    }
    // powder streaming off the exposed snow at speed
    if (near && Math.abs(vf) > 9 && this.left) {
      this.puffT += dt * 26 * clamp((Math.abs(vf) - 9) / 12, 0, 1.4) * Math.sqrt(this.left / C.length) * (0.4 + 0.6 * Math.min(1, anyFree / 4));
      for (let n = 0; n < 4 && this.puffT >= 1; n++) {
        this.puffT -= 1;
        let i = (Math.random() * C.length) | 0;
        for (let a = 0; a < 6 && !al[i]; a++) i = (Math.random() * C.length) | 0;
        if (!al[i]) break;
        const ch = C[i];
        _v.set(ch.x + (Math.random() - 0.5) * (ch.x1 - ch.x0), ch.y + 0.03, ch.z + (Math.random() - 0.5) * (ch.z1 - ch.z0)).applyMatrix4(c._im);
        const kk = 0.55 + 0.25 * Math.random();
        if (puffOk(_v)) FX.blown(_v.x, _v.y, _v.z, c.vx * kk, 0.4 + Math.random() * 0.6, c.vz * kk, 0.6 + 0.4 * ch.cl / 0.45);
      }
    } else this.puffT = 0;
  }

  // A knock: the snow is left behind by the change of velocity (dx, dz in the car's frame), and a
  // landing cracks it. The slabs with a free side that way let go at once, by chance - the weaker
  // the bond and the harder the knock, the likelier; as lumps they keep the velocity they had.
  knock(dx, dz, kn, kv, wx, wz) {
    const L = this.L, C = L.chunks, al = this.alive, near = this.near();
    const ux = -dx / (kn || 1), uz = -dz / (kn || 1);
    const ph = clamp((kn - 0.6) / 3.5, 0, 0.85), pv = clamp((kv - 2) / 8, 0, 0.6);
    this.kick = [wx * 0.85, wz * 0.85];
    for (let i = 0; i < C.length; i++) {
      if (!al[i]) continue;
      let fd = true, any = false;
      for (const nb of C[i].nbr) {
        if (!nb.same || !al[nb.i]) continue;
        if (nb.dx * ux + nb.dz * uz > 0.5) fd = false;
        any = true;
      }
      const w = 8 / Math.max(4, this.hold[i]);
      const p = (fd && ph > 0 ? ph : 0) * w + (pv > 0 && (fd || C[i].edge || !any) ? pv : 0) * w;
      if (Math.random() < p) this.detach(i, near, false);
    }
    this.kick = null;
  }

  // A slab lets go: a lump (two if it cracks), or powder only (worn away / out of sight).
  detach(i, near, dust) {
    this.alive[i] = 0;
    this.left--;
    this.dirty = true;
    if (!near) return;
    const ch = this.L.chunks[i], c = this.car;
    let m = 0;
    for (const j of ch.tex) m += Math.min(1, this.own[j]);
    const frac = (m / ch.tex.length) * this.thick[i];
    if (frac < 0.12) return;
    _v.set(ch.x, ch.y, ch.z).applyMatrix4(c._im);
    if (puffOk(_v)) FX.powder(_v.x, _v.y + 0.02, _v.z, c.vx * 0.9, 0.5, c.vz * 0.9, dust ? 6 : 2, dust ? 0.8 : 0.5);
    if (dust) return;
    this.write();   // (the lump lies in the slab's place, on what is under it)
    const f = Math.sqrt(Math.max(0.2, frac));
    const w = (ch.x1 - ch.x0) * 0.9 * f, l = (((ch.z1 - ch.z0) * 0.9) / Math.max(0.55, ch.ny)) * f, t = Math.max(0.014, ch.dep * this.thick[i]) * 1.25;
    // it cracks as it goes: into 1-4 pieces (a big slab more often)
    const nx = w > 0.22 && Math.random() < 0.7 ? 2 : 1, nz = l > 0.25 && Math.random() < 0.75 ? 2 : 1;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const px = (a + 0.5) / nx - 0.5, pz = (b + 0.5) / nz - 0.5, j = 0.8 + 0.3 * Math.random();
      spawnRide(this, ch, (w / nx) * j, t, (l / nz) * j, px * w, pz * l);
    }
  }

  // The texture: what is left of every cell (its own share x its slab's), the outline dilated.
  write() {
    const L = this.L, d = this.data, own = this.own, co = L.chunkOf, al = this.alive, th = this.thick, S = 255 / MAXV;
    for (let j = 0; j < L.N; j++) {
      const c = co[j];
      d[j] = c < 0 || !al[c] ? 0 : Math.min(255, Math.round(own[j] * th[c] * S));
    }
    for (const [j, src] of L.rim) { let v = 0; for (const s of src) if (d[s] > v) v = d[s]; d[j] = v; }
    this.tex.needsUpdate = true;
    this.dirty = false;
  }
  // The snow's top at a point of the car's top (car frame): the cap's height there, less what has
  // gone of the cell's snow; null off the cap. out.n = the cell's normal (car frame).
  surface(x, z, out) {
    const L = this.L, fi = (x - L.x0) / CELL - 0.5, fk = (z - L.z0) / CELL - 0.5;
    const ri = Math.round(fi), rk = Math.round(fk);
    if (ri < 0 || rk < 0 || ri >= L.nx || rk >= L.nz) return null;
    const jn = rk * L.nx + ri;
    if (L.chunkOf[jn] < 0) return null;
    const i0 = Math.floor(fi), k0 = Math.floor(fk), ti = fi - i0, tk = fk - k0;
    let h = 0, w = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const i = i0 + a, k = k0 + b;
      if (i < 0 || k < 0 || i >= L.nx || k >= L.nz) continue;
      const j = k * L.nx + i;
      if (L.chunkOf[j] < 0) continue;
      const ww = (a ? ti : 1 - ti) * (b ? tk : 1 - tk) + 1e-4;
      h += (L.top[j] - L.dep[j] * (1 - Math.min(1, (this.data[j] * MAXV) / 255))) * ww;
      w += ww;
    }
    if (out) out.set(L.NX[jn], L.NY[jn], L.NZ[jn]);
    return h / w;
  }

  // Two blades from the foot of the windscreen: up (clearing a fan, the snow it pushes heaped in a
  // ridge in front of it) and down, three times; powder flicked off the blades' tips on the way up.
  stepWipers(dt) {
    const W = this.L.wiper, w = this.wipe, c = this.car;
    if (!W || c.dead || !c.running) { this.endWipe(); return; }
    w.t += dt;
    const P = 1.3, n = Math.floor(w.t / P), ph = (w.t % P) / P;
    if (n >= 3) { this.endWipe(); return; }
    w.ang = W.max * Math.sin(Math.PI * ph);
    if (ph < 0.5 && n < 2) {
      // (each cell by how much of it lies inside the swept fan: a smooth edge once filtered)
      const own = this.own, a = w.ang, ridge = 1 + 0.45 * (a / W.max), iC = 1 / CELL;
      let cleared = 0;
      for (let m = 0; m < W.tex.length; m++) {
        const j = W.tex[m];
        if (own[j] <= 0) continue;
        for (const px of W.px) {
          const dx = W.x[m] - px, s = W.s[m], r = Math.hypot(dx, s);
          if (r > W.R + CELL || r < 0.03) continue;
          const e = (a - Math.atan2(s, -dx)) * r;     // how far behind the blade (m)
          const inFan = clamp(e * iC + 0.5, 0, 1) * clamp((W.R - r) * iC + 0.5, 0, 1);
          if (inFan > 0) {
            const o = own[j] * (1 - inFan);
            if (o < own[j]) { cleared += own[j] - o; own[j] = o < 0.04 ? 0 : o; }
          } else if (e > -0.12 && r < W.R && own[j] > 0.5 && own[j] < ridge) own[j] = ridge;
        }
      }
      if (cleared > 0) {
        this.dirty = true;
        if (this.near()) {
          w.last += cleared;
          for (; w.last > 3; w.last -= 3) {
            const px = W.px[Math.random() < 0.5 ? 0 : 1], r = W.R * (0.6 + 0.4 * Math.random());
            _v.set(px - Math.cos(a) * r, W.y + Math.sin(a) * r * W.uy + 0.03, W.z + Math.sin(a) * r * W.uz).applyMatrix4(c._im);
            if (puffOk(_v)) FX.powder(_v.x, _v.y, _v.z, c.vx, 0.6, c.vz, 1, 0.35);
          }
        }
      }
    }
  }
  endWipe() {
    if (!this.wipe) return;
    this.wipe = null;
    this.wiped = true;
    wiping.delete(this);
    // windscreen slabs wiped (nearly) away are gone
    const L = this.L;
    for (let i = 0; i < L.chunks.length; i++) {
      if (!this.alive[i]) continue;
      const ch = L.chunks[i];
      let m = 0;
      for (const j of ch.tex) m += Math.min(1, this.own[j]);
      if (m < ch.tex.length * 0.15) { this.alive[i] = 0; this.left--; this.dirty = true; }
    }
  }

  // The car is wrecked: what rides on it falls off; no more stepping.
  die() {
    for (const o of lumps) if (o.on === RIDE && o.S === this) launch(o);
    this.endWipe();
  }

  stats() {
    const L = this.L;
    let area = 0, all = 0;
    for (let i = 0; i < L.chunks.length; i++) { const n = L.chunks[i].tex.length; all += n; if (this.alive[i]) area += n * this.thick[i]; }
    return { left: this.left, slabs: L.chunks.length, area: +(area / all).toFixed(3), film: +this.film.toFixed(3), warm: +this.warm.toFixed(2), wiped: this.wiped, wiping: !!this.wipe };
  }

  dispose() {
    this.endWipe();
    shedding.delete(this);
    for (const o of lumps) if (o.on === RIDE && o.S === this) launch(o);
    this.tex.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Lumps: slabs that have let go. RIDE on their car's top (car frame), FLY (world), REST on the ground.

const RIDE = 1, FLY = 2, REST = 3;
const MAXL = 72;
const lumps = [];
for (let i = 0; i < MAXL; i++) lumps.push({ on: 0, q: new THREE.Quaternion(), n: new THREE.Vector3(0, 1, 0) });
let lumpMesh = null, bladeMesh = null;
const stats = { made: 0, burst: 0, rested: 0, squashed: 0, crumbled: 0, onCar: 0, tickMs: 0, ticks: 0 };

function puffOk(p) {
  if (!camera) return false;
  const c = camera.position;
  return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2 > 1.5 * 1.5;
}

// A broken-off piece of the snow's crust (unit size; scaled per lump, turned at random about its
// own up so that no two look alike): a thick puck with a ragged outline, a lumpy top and a flatter
// underside (where it lay on the car).
function lumpGeometry() {
  const ico = PRIM.ico(3).clone();
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const src = mergeVertices(ico);
  const p = src.attributes.position;
  const v = new THREE.Vector3();
  const nz = (x, y, z) => Math.sin(x * 12.9 + y * 7.1) * 0.5 + Math.sin(y * 9.7 + z * 13.3) * 0.3 + Math.sin(z * 11.3 + x * 5.9) * 0.2;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const th = Math.atan2(v.z, v.x), ay = Math.abs(v.y);
    // the outline: broken, not round
    const f = 1 + 0.2 * Math.sin(3 * th + 1.3) + 0.12 * Math.sin(5 * th + 0.4) + 0.07 * Math.sin(9 * th + 2.1);
    // a puck: flat-ish top and bottom, rounded rim
    const rh = 0.5 * f * Math.pow(Math.max(0, 1 - ay ** 3), 0.3);
    let y = Math.sign(v.y) * 0.5 * Math.pow(ay, 0.45);
    y += v.y > 0 ? 0.09 * nz(v.x * 3, 0.5, v.z * 3) * ay : -0.08 * ay;
    const hz = Math.max(1e-4, Math.hypot(v.x, v.z));
    v.set((v.x / hz) * rh, y, (v.z / hz) * rh);
    v.multiplyScalar(1 + 0.05 * nz(v.x * 5, v.y * 5, v.z * 5));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  src.computeVertexNormals();
  return new GeoBuilder().use('snow').add(src, 0xf2f3f4).build();
}
function ensureMeshes() {
  if (lumpMesh && lumpMesh.parent) return;
  if (!scene) return;
  if (!lumpMesh) {
    lumpMesh = new THREE.InstancedMesh(lumpGeometry(), surfaceMaterial('snow', { kind: 'inst' }), MAXL);
    lumpMesh.name = 'carsnow:lumps';
    lumpMesh.frustumCulled = false;
    lumpMesh.castShadow = true; lumpMesh.receiveShadow = true;
    lumpMesh.count = 0; lumpMesh.visible = false;
    const bg = new GeoBuilder().use('rubber').box(0x101112, 0, 0, 0, 1, 1, 1).build();
    bladeMesh = new THREE.InstancedMesh(bg, surfaceMaterial('rubber', { snow: false, kind: 'inst' }), 8);
    bladeMesh.name = 'carsnow:blades';
    bladeMesh.frustumCulled = false;
    bladeMesh.castShadow = false; bladeMesh.receiveShadow = true;
    bladeMesh.count = 0; bladeMesh.visible = false;
  }
  scene.add(lumpMesh, bladeMesh);
}
// For car.js's warm-up: the meshes whose programs must be compiled before the first car sheds.
export function snowMeshes() { ensureMeshes(); return [lumpMesh, bladeMesh].filter(Boolean); }

function freeLump() {
  let best = null;
  for (const o of lumps) { if (!o.on) return o; if (o.on === REST && (!best || o.restT < best.restT)) best = o; }
  return best;
}
// A new lump riding where slab `ch` was (dx, dz: across and along the car from the slab's middle).
function spawnRide(S, ch, w, t, l, dx, dz) {
  ensureMeshes();
  const o = freeLump();
  if (!o || !lumpMesh) return;
  const c = S.car;
  o.on = RIDE; o.S = S; o.car = c;
  o.lx = ch.x + dx; o.lz = ch.z + dz * ch.ny;
  o.sx = w; o.sy = t; o.sz = l; o.k = 1; o.age = 0; o.spin = Math.random() * 6.283;
  const h = S.surface(o.lx, o.lz, o.n);
  o.ly = (h ?? ch.y - t) + t * 0.5;
  // moving with the car, at the point where it was (or as it was before a knock)
  _v.set(o.lx, o.ly, o.lz).applyMatrix4(c._im);
  o.vx = c.vx + c.w * (_v.z - c.z) - (S.kick?.[0] ?? 0); o.vy = c.vy; o.vz = c.vz - c.w * (_v.x - c.x) - (S.kick?.[1] ?? 0);
  o.kd = 0.65 / (300 * t);          // drag: 0.5 rho Cd A / m for a slab tumbling (A ~ half its face)
  o.kl = 0.033 * 0.045 / t;         // lift on it while it lies on the car
  o.puff = 0;
  stats.made++;
}

// Lump in the car's frame -> world (pos into _v, rotation into _q).
function rideWorld(o) {
  const c = o.car;
  _v.set(o.lx, o.ly, o.lz).applyMatrix4(c._im);
  _q.setFromRotationMatrix(c._im);
  _q2.setFromUnitVectors(UP, o.n);
  _q.multiply(_q2);
  _q2.setFromAxisAngle(UP, o.spin);
  _q.multiply(_q2);
}
function launch(o) {
  rideWorld(o);
  o.on = FLY;
  o.x = _v.x; o.y = _v.y; o.z = _v.z;
  o.q.copy(_q);
  // tumbling: the wind tips its windward edge up (about the car's left axis), plus a little of anything
  const c = o.car, sp = Math.hypot(o.vx - c.vx, o.vz - c.vz) + Math.hypot(c.vx, c.vz) * 0.25;
  const r = (1.2 + sp * 0.35 * (0.6 + 0.8 * Math.random())) * clamp(0.25 / Math.max(0.08, Math.sqrt(o.sx * o.sz)), 0.7, 2);
  o.wx = -Math.cos(c.yaw) * r + (Math.random() - 0.5) * 2; o.wy = (Math.random() - 0.5) * 2; o.wz = Math.sin(c.yaw) * r + (Math.random() - 0.5) * 2;
  o.S = null;
}

const _n = new THREE.Vector3();
function stepRide(o, dt) {
  const c = o.car, S = c.snowFx;
  if (!S || S !== o.S || c.dead || !c.root.parent || c.disposed) { launch(o); return; }
  const E = c._im.elements;
  _v.set(o.lx, o.ly, o.lz).applyMatrix4(c._im);
  // the car's top under it moves with the car (and its turning)
  const vpx = c.vx + c.w * (_v.z - c.z), vpy = c.vy + c._sus.hv, vpz = c.vz - c.w * (_v.x - c.x);
  // the normal in the world
  _n.set(o.n.x * E[0] + o.n.y * E[4] + o.n.z * E[8], o.n.x * E[1] + o.n.y * E[5] + o.n.z * E[9], o.n.x * E[2] + o.n.y * E[6] + o.n.z * E[10]);
  // gravity, the drag of the still air, the lift over the car
  const sp = Math.hypot(o.vx, o.vy, o.vz), kd = 0.5 * o.kd * sp, lf = o.kl * sp * sp;
  o.vx += (-kd * o.vx + _n.x * lf) * dt;
  o.vy += (-G - kd * o.vy + _n.y * lf) * dt;
  o.vz += (-kd * o.vz + _n.z * lf) * dt;
  let rx = o.vx - vpx, ry = o.vy - vpy, rz = o.vz - vpz;
  const vn = rx * _n.x + ry * _n.y + rz * _n.z;
  if (vn > 0.6 || (c.air && vn > 0.2)) { launch(o); return; }
  rx -= vn * _n.x; ry -= vn * _n.y; rz -= vn * _n.z;
  if (vn < 0) {
    // pressed onto the car: friction for how hard
    const tl = Math.hypot(rx, ry, rz);
    if (tl > 1e-6) { const f = Math.max(0, 1 - (MU * -vn) / tl); rx *= f; ry *= f; rz *= f; }
  }
  // along the car's top, in its frame
  const dlx = (rx * E[0] + ry * E[1] + rz * E[2]) * dt, dlz = (rx * E[8] + ry * E[9] + rz * E[10]) * dt;
  const nlx = o.lx + dlx, nlz = o.lz + dlz, d = Math.hypot(dlx, dlz);
  const h = S.surface(nlx, nlz, _n);
  const cur = o.ly - o.sy * o.k * 0.5;
  if (h === null) { o.vx = vpx + rx; o.vy = vpy + ry; o.vz = vpz + rz; launch(o); return; }
  if (h > cur + d * 1.5 + 0.006) {
    // against a steep rise (the foot of the windscreen): it stops there
    o.vx = vpx; o.vy = vpy; o.vz = vpz;
  } else if (h < cur - d * 1.1 - 0.05 && d > 0.004) {
    // the top falls away faster than it follows: over the edge (a step down off the snow that is
    // left onto the paint it only drops down, below)
    o.vx = vpx + rx; o.vy = vpy + ry; o.vz = vpz + rz;
    o.lx = nlx; o.lz = nlz;
    launch(o);
    return;
  } else {
    o.vx = vpx + rx; o.vy = vpy + ry; o.vz = vpz + rz;
    o.lx = nlx; o.lz = nlz;
    o.n.copy(_n);
    const y = h + o.sy * o.k * 0.5;
    o.ly = y < o.ly ? Math.max(y, o.ly - 1.5 * dt) : y;
  }
  o.spin += (rx * E[0] + rz * E[2]) * dt * 0.4;
}

function stepFly(o, dt) {
  const sp = Math.hypot(o.vx, o.vy, o.vz), kd = o.kd * sp;
  o.vx -= kd * o.vx * dt; o.vz -= kd * o.vz * dt; o.vy -= (G + kd * o.vy) * dt;
  o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
  const w = Math.hypot(o.wx, o.wy, o.wz);
  if (w > 1e-4) { _q2.setFromAxisAngle(_v2.set(o.wx / w, o.wy / w, o.wz / w), w * dt); o.q.premultiply(_q2); }
  // in the airstream it crumbles
  if (sp > 9) {
    o.k *= Math.exp(-0.03 * (sp - 9) * dt);
    o.puff += dt * (sp - 7) * 1.5 * o.k;
    if (o.puff > 1) { o.puff = 0; _v.set(o.x, o.y, o.z); if (puffOk(_v)) FX.blown(o.x, o.y, o.z, o.vx * 0.5, o.vy * 0.5, o.vz * 0.5, 0.35 + o.sx * o.k); }
    if (o.k < 0.35) { _v.set(o.x, o.y, o.z); if (puffOk(_v)) FX.powder(o.x, o.y, o.z, o.vx * 0.4, o.vy * 0.4, o.vz * 0.4, 4, 0.5 + o.sx * 0.5); o.on = 0; stats.crumbled++; return; }
  }
  // back onto its own car (off the bonnet over the windscreen onto the roof)
  const c = o.car;
  if (c && c.snowFx && !c.dead && c.root.parent && Math.abs(o.x - c.x) < c.radius && Math.abs(o.z - c.z) < c.radius) {
    const E = c._im.elements, px = o.x - E[12], py = o.y - E[13], pz = o.z - E[14];
    const lx = px * E[0] + py * E[1] + pz * E[2], ly = px * E[4] + py * E[5] + pz * E[6], lz = px * E[8] + py * E[9] + pz * E[10];
    const h = c.snowFx.surface(lx, lz, o.n);
    if (h !== null && ly - o.sy * o.k * 0.5 < h && ly > h - 0.3) {
      // (turned about the car's top as it came down)
      _v2.set(0, 0, 1).applyQuaternion(o.q);
      o.spin = Math.atan2(_v2.x * E[0] + _v2.y * E[1] + _v2.z * E[2], _v2.x * E[8] + _v2.y * E[9] + _v2.z * E[10]);
      o.on = RIDE; o.S = c.snowFx; o.lx = lx; o.lz = lz; o.ly = h + o.sy * o.k * 0.5;
      stats.onCar++;
      return;
    }
  }
  const gy = groundAt(o.x, o.z, o.y, 0.1), half = o.sy * o.k * 0.5;
  if (o.y - half > gy) return;
  // the ground: a burst of powder (and a piece or two), or a soft landing
  const vy = -o.vy, hs = Math.hypot(o.vx, o.vz);
  _v.set(o.x, gy, o.z);
  if (hs > 4 || vy > 2.6) {
    // (a low white spray skidding on along the road, not a cloud)
    const big = Math.sqrt(o.sx * o.sz) * o.k;
    if (puffOk(_v)) {
      FX.powder(o.x, gy + 0.04, o.z, o.vx * 0.3, 0.5 + vy * 0.08, o.vz * 0.3, Math.round(1 + 6 * big), 0.35 + big * 0.8);
      for (let n = Math.round(1 + 5 * big); n > 0; n--) FX.blown(o.x, gy + 0.05, o.z, o.vx * (0.5 + 0.3 * Math.random()), 0.4 + Math.random() * 0.8, o.vz * (0.5 + 0.3 * Math.random()), 0.45 + big * 0.8);
    }
    o.on = 0;
    stats.burst++;
    if (o.k * o.sx > 0.12) for (let n = Math.random() < 0.5 ? 1 : 2; n > 0; n--) {
      const f = freeLump();
      if (!f || f === o) continue;
      Object.assign(f, { on: FLY, car: null, S: null, x: o.x, y: gy + 0.1, z: o.z, vx: o.vx * 0.45 + (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 1.6, vz: o.vz * 0.45 + (Math.random() - 0.5) * 2.4,
        sx: o.sx * o.k * 0.45, sy: o.sy * o.k * 0.7, sz: o.sz * o.k * 0.45, k: 1, kd: o.kd * 1.4, puff: 0, age: 0, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 6, wz: (Math.random() - 0.5) * 12 });
      f.q.copy(o.q);
    }
    return;
  }
  o.on = REST;
  o.y = gy + half - o.sy * o.k * 0.15;
  o.vy = 0;
  o.restT = SNOW_TUNE.rest * (0.75 + 0.5 * Math.random());
  // it settles on whichever big face is down
  _v2.set(0, 1, 0).applyQuaternion(o.q);
  if (_v2.y < 0) _v2.negate();
  o.flat = new THREE.Quaternion().setFromUnitVectors(_v2, UP).multiply(o.q);
  stats.rested++;
  if (puffOk(_v)) FX.powder(o.x, gy + 0.03, o.z, o.vx * 0.3, 0.3, o.vz * 0.3, 2, 0.4 + o.sx);
}

function stepRest(o, dt, movers) {
  const hs = Math.hypot(o.vx, o.vz);
  if (hs > 0) { const f = Math.max(0, 1 - (7 * dt) / hs); o.vx *= f; o.vz *= f; o.x += o.vx * dt; o.z += o.vz * dt; }
  if (o.flat) o.q.slerp(o.flat, 1 - Math.exp(-12 * dt));
  o.restT -= dt;
  if (o.restT <= 0) { o.on = 0; return; }
  // under a car's wheels: squashed
  for (const c of movers) {
    const b = c.obb, dx = o.x - b.x, dz = o.z - b.z;
    if (Math.abs(dx * b.fx + dz * b.fz) < b.hz && Math.abs(dx * b.fz - dz * b.fx) < b.hx) {
      _v.set(o.x, o.y, o.z);
      if (puffOk(_v)) FX.powder(o.x, o.y, o.z, c.vx * 0.5, 0.5, c.vz * 0.5, 4, 0.5 + o.sx);
      o.on = 0; stats.squashed++;
      return;
    }
  }
}

const movers = [];
// Every frame (main.js, after the cars' sync and before FX.tick): the lumps and the wiper blades.
export function tickCarSnow(dt, game) {
  if (!lumpMesh) return;
  const t0 = performance.now();
  let any = false;
  movers.length = 0;
  for (const o of lumps) if (o.on === REST) { any = true; break; }
  if (any && game) for (const c of game.cars) if (!c.asleep && c.speed > 1.5) movers.push(c);
  let n = 0;
  const M = lumpMesh.instanceMatrix.array;
  for (const o of lumps) {
    if (!o.on) continue;
    o.age += dt;
    if (o.on === RIDE) stepRide(o, dt);
    else if (o.on === FLY) { stepFly(o, dt); if (o.age > 12) o.on = 0; }
    else stepRest(o, dt, movers);
    if (!o.on) continue;
    let k = o.k;
    if (o.on === REST && o.restT < 4) k *= o.restT / 4;
    if (o.on === RIDE) {
      rideWorld(o);
      _m.compose(_v, _q, _s.set(o.sx * k, o.sy * k, o.sz * k));
    } else _m.compose(_v.set(o.x, o.y, o.z), o.q, _s.set(o.sx * k, o.sy * k * (o.on === REST && o.restT < 4 ? 0.6 + 0.1 * o.restT : 1), o.sz * k));
    _m.toArray(M, n * 16);
    n++;
  }
  lumpMesh.count = n;
  lumpMesh.visible = n > 0;
  if (n) lumpMesh.instanceMatrix.needsUpdate = true;
  // wiper blades
  let b = 0;
  if (bladeMesh) {
    const B = bladeMesh.instanceMatrix.array;
    for (const S of wiping) {
      const W = S.L.wiper, a = S.wipe?.ang ?? 0, c = S.car;
      if (!W || b > 6) continue;
      // the glass's normal (car frame: up the glass is (0, uy, uz)), and the blade along it at `a`
      const gx = 0, gy = -W.uz, gz = W.uy;
      const dx = -Math.cos(a), dy = Math.sin(a) * W.uy, dz = Math.sin(a) * W.uz;
      const zx = dy * gz - dz * gy, zy = dz * gx - dx * gz, zz = dx * gy - dy * gx;
      const L = W.R - 0.06, o = L / 2 + 0.05;
      for (const px of W.px) {
        const cx = px + dx * o + gx * 0.012, cy = W.y + dy * o + gy * 0.012, cz = W.z + dz * o + gz * 0.012;
        _m2.set(dx * L, gx * 0.014, zx * 0.022, cx, dy * L, gy * 0.014, zy * 0.022, cy, dz * L, gz * 0.014, zz * 0.022, cz, 0, 0, 0, 1);
        _m.multiplyMatrices(c._im, _m2);
        _m.toArray(B, b * 16);
        b++;
      }
    }
    bladeMesh.count = b;
    bladeMesh.visible = b > 0;
    if (b) bladeMesh.instanceMatrix.needsUpdate = true;
  }
  stats.tickMs += performance.now() - t0;
  stats.ticks++;
}

// Test numbers.
export function carSnowStats() {
  const on = [0, 0, 0, 0];
  for (const o of lumps) on[o.on]++;
  return { shedding: shedding.size, wiping: wiping.size, ride: on[RIDE], fly: on[FLY], rest: on[REST], ...stats };
}
