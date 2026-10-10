// Static world batching (owned by rendering; called by buildTown in town.js).
//
// buildTown makes, per 80 m block, one GeoBuilder for buildings and solids (cast + receive), one for
// the ground (no cast) and one for thin twigs (no cast, no AO). As plain meshes each of those draws
// once per surface (~15 per block) in every pass: ~1,000 main-pass calls for the static world.
// batchStatic() regroups them into ONE batch (StaticBatch, a THREE.BatchedMesh) per (category,
// surface), with one instance per block. Per-block frustum culling stays (every instance keeps the
// bounds of its part of the block; the batch culls them itself, in the shadow cascades too), and the
// visible instances that lie next to each other in the batch's buffers are drawn as ONE range: all
// instances have the identity matrix, so a surface costs a few draws per pass (one per run of
// neighbouring visible blocks) and almost no three.js per-object work.
// The surface shader handles batching (batchingMatrix in DESIGN 10's surface shader), and the batches
// get the 'batch' copies of the shared surface materials.
//
// The batch buffers are written directly (no per-part copies), and the vertex attributes are packed
// on the way in: normal int16, colour uint16 (float if a colour is over 1), trin int8 - 64 -> 43
// bytes per vertex. town.js drops the CPU-side arrays once they are on the GPU (gfx makeStatic).

import { THREE, surfaceMaterial, prepareKind } from '../gfx.js';

// The shared surface materials a GeoBuilder will ask for, made in the order build() + realMesh would
// (first use in part order), so batching does not change which materials exist first. Call it for
// the builders in the order their meshes used to be made, before batchStatic. (Draw order of opaque
// things follows material ids: it decides coplanar overlaps such as road markings on asphalt.)
export function touchSurfaces(B, snow = true) {
  for (const p of B.parts) {
    const ss = p.userData?.surfaces;
    if (ss && ss.length > 1 && p.groups.length) { for (const g of p.groups) surfaceMaterial(ss[g.materialIndex] || 'plain', { snow }); }
    else surfaceMaterial(p._surface || ss?.[0] || 'plain', { snow });
  }
}

// Per-surface index / vertex ranges of a GeoBuilder geometry (groups are contiguous in both).
function ranges(geo) {
  const surfs = geo.userData?.surfaces || ['plain'];
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  const idx = geo.index.array;
  if (!geo.groups.length) return [{ s: surfs[0] || 'plain', i0: 0, ic: idx.length, v0: 0, v1: geo.attributes.position.count }];
  return geo.groups.map((g) => {
    let lo = Infinity, hi = -1;
    for (let i = g.start, e = g.start + g.count; i < e; i++) { const v = idx[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return { s: surfs[g.materialIndex] || 'plain', i0: g.start, ic: g.count, v0: hi < 0 ? 0 : lo, v1: hi + 1 };
  }).filter((r) => r.ic > 0);
}

function maxColor(geo, r) {
  const C = geo.attributes.color.array;
  let m = 0;
  for (let i = r.v0 * 3, e = r.v1 * 3; i < e; i++) if (C[i] > m) m = C[i];
  return m;
}

const _m = new THREE.Matrix4(), _f = new THREE.Frustum(), _rm = new THREE.Mesh(), _hits = [], _inv = new THREE.Matrix4(), _ray = new THREE.Ray();
// One surface of one category for the whole town: a THREE.BatchedMesh whose buffers are filled
// directly (one "geometry", one instance with the identity matrix), plus `runs`: the index range and
// bounds of each block's part, in buffer order. onBeforeRender (and onBeforeShadow, which calls it)
// culls the runs against that pass's camera and merges neighbours into the draw list.
export class StaticBatch extends THREE.BatchedMesh {
  constructor(geometry, runs, material) {
    const n = geometry.attributes.position.count, ic = geometry.index.count;
    super(Math.max(1, runs.length), n, ic, material);   // (sizes the draw lists: one entry per run at most)
    this.geometry = geometry;
    this._geometryInitialized = true;
    const box = new THREE.Box3();
    for (const r of runs) box.union(r.box);
    this._geometryInfo.push({ vertexStart: 0, vertexCount: n, reservedVertexCount: n, indexStart: 0, indexCount: ic, reservedIndexCount: ic, start: 0, count: ic, boundingBox: box, boundingSphere: box.getBoundingSphere(new THREE.Sphere()), active: true });
    this._geometryCount = 1;
    this._nextVertexStart = n; this._nextIndexStart = ic;
    this.addInstance(0);
    this._indirectTexture.image.data.fill(0);
    this._indirectTexture.needsUpdate = true;   // uploaded once (BatchedMesh re-uploads it every draw)
    this.runs = runs;
    this.sortObjects = false;
  }
  // Raycasts test only the runs (blocks) the ray passes near (BatchedMesh's own raycast would walk the
  // whole town's triangles of this surface per ray). Positions and index stay in memory for this
  // (userData.raycastable: makeStatic keeps them).
  raycast(raycaster, intersects) {
    const g = this.geometry;
    if (!g.index.array.length || !g.attributes.position.array.length) return;
    _rm.geometry.index = g.index;
    _rm.geometry.attributes = g.attributes;
    _rm.material = this.material;
    _rm.matrixWorld.copy(this.matrixWorld);
    _inv.copy(this.matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inv);
    for (const r of this.runs) {
      if (!_ray.intersectsSphere(r.sphere)) continue;
      _rm.geometry.setDrawRange(r.start, r.count);
      _rm.geometry.boundingSphere = r.sphere;
      _rm.geometry.boundingBox = r.box;
      _rm.raycast(raycaster, _hits);
      for (const h of _hits) { h.object = this; intersects.push(h); }
      _hits.length = 0;
    }
  }
  onBeforeRender(renderer, scene, camera, geometry) {
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld);
    _f.setFromProjectionMatrix(_m, camera.coordinateSystem, camera.reversedDepth);
    const bpe = geometry.index.array.BYTES_PER_ELEMENT, S = this._multiDrawStarts, C = this._multiDrawCounts;
    let n = 0, s0 = -1, e0 = -1;
    for (const r of this.runs) {
      if (!_f.intersectsSphere(r.sphere)) continue;
      if (r.start === e0) { e0 += r.count; continue; }
      if (s0 >= 0) { S[n] = s0 * bpe; C[n] = e0 - s0; n++; }
      s0 = r.start; e0 = r.start + r.count;
    }
    if (s0 >= 0) { S[n] = s0 * bpe; C[n] = e0 - s0; n++; }
    this._multiDrawCount = n;
  }
}

// cats: [{ name, geos: [built GeoBuilder geometries], cast, snow = true, noAO }]. Adds the batches to
// the scene and returns them. The geos arrays are emptied (the source geometries are let go).
export function batchStatic(scene, cats) {
  const out = [];
  prepareKind('batch');
  for (const cat of cats) {
    const geos = cat.geos.filter(Boolean);
    // pass 1: sizes and attribute types per surface
    const per = new Map();
    const rs = geos.map((geo) => {
      const r = ranges(geo);
      for (const q of r) {
        let e = per.get(q.s);
        if (!e) per.set(q.s, (e = { verts: 0, idx: 0, hdr: false }));
        e.verts += q.v1 - q.v0; e.idx += q.ic;
        if (!e.hdr && maxColor(geo, q) > 1.0001) e.hdr = true;
      }
      return r;
    });
    // pass 2: one set of packed buffers per surface, filled block by block
    for (const e of per.values()) {
      const n = e.verts;
      e.P = new Float32Array(n * 3); e.T = new Float32Array(n * 4);
      e.N = new Int16Array(n * 3); e.TN = new Int8Array(n * 3);
      e.C = e.hdr ? new Float32Array(n * 3) : new Uint16Array(n * 3);
      e.I = n > 65535 ? new Uint32Array(e.idx) : new Uint16Array(e.idx);
      e.v = 0; e.i = 0; e.runs = [];
    }
    geos.forEach((geo, k) => {
      const A = geo.attributes, P = A.position.array, N = A.normal.array, Cc = A.color.array, T = A.tri.array, TN = A.trin.array, I = geo.index.array;
      for (const q of rs[k]) {
        const e = per.get(q.s), nv = q.v1 - q.v0, vb = e.v;
        e.P.set(P.subarray(q.v0 * 3, q.v1 * 3), vb * 3);
        e.T.set(T.subarray(q.v0 * 4, q.v1 * 4), vb * 4);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0, o = q.v0 * 3, d = vb * 3; i < nv * 3; i++, o++, d++) {
          const nn = N[o], tn = TN[o], c = Cc[o], p = P[o], ax = i % 3;
          e.N[d] = Math.round((nn > 1 ? 1 : nn < -1 ? -1 : nn) * 32767);
          e.TN[d] = Math.round((tn > 1 ? 1 : tn < -1 ? -1 : tn) * 127);
          e.C[d] = e.hdr ? c : Math.round((c > 1 ? 1 : c < 0 ? 0 : c) * 65535);
          if (p < lo[ax]) lo[ax] = p;
          if (p > hi[ax]) hi[ax] = p;
        }
        const off = vb - q.v0, ib = e.i;
        for (let i = 0; i < q.ic; i++) e.I[ib + i] = I[q.i0 + i] + off;
        const box = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
        e.runs.push({ start: ib, count: q.ic, box, sphere: box.getBoundingSphere(new THREE.Sphere()) });
        e.v += nv; e.i += q.ic;
      }
      geo.dispose();
    });
    cat.geos.length = 0;
    for (const [s, e] of per) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(e.P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(e.N, 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(e.C, 3, !e.hdr));
      g.setAttribute('tri', new THREE.BufferAttribute(e.T, 4));
      g.setAttribute('trin', new THREE.BufferAttribute(e.TN, 3, true));
      g.setIndex(new THREE.BufferAttribute(e.I, 1));
      const bm = new StaticBatch(g, e.runs, surfaceMaterial(s, { snow: cat.snow !== false, kind: 'batch' }));
      g.boundingBox = bm._geometryInfo[0].boundingBox.clone();
      g.boundingSphere = bm._geometryInfo[0].boundingSphere.clone();
      bm.name = `batch:${cat.name}:${s}`;
      bm.castShadow = !!cat.cast;
      bm.receiveShadow = true;
      bm.userData.raycastable = true;   // makeStatic keeps positions + index (line-of-sight checks)
      if (cat.noAO) bm.userData.noAO = true;
      bm.computeBoundingSphere(); bm.computeBoundingBox();
      scene.add(bm); out.push(bm);
    }
  }
  return out;
}
