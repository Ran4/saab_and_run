// Builds the suburb on an early-winter morning: Ove's radhusområde in the middle, row-house areas,
// villas, lamellhus, centrum, sjukhuset, the church and cemetery, a car dealer, a preschool,
// kommunhuset, a petrol station, a park, a football field and forest at the edges.
// See DESIGN.md section 6 (contract) and notes/world.md (API, deviations).
//
// Static geometry is merged per block (one GeoBuilder for solids, one for flat ground cover, one for
// twigs) and then batched by surface across the town (batch.js: one BatchedMesh per surface with one
// instance per block, so one draw call per surface per pass and per-block culling), printed signs
// are batched in a few atlas meshes (signs.js), breakables are instanced (props.js).

import { GeoBuilder, realMesh, makeStatic, precompile, uploadGeometry, nextTask } from '../gfx.js';
import { batchSteps, touchSurfaces } from './batch.js';
import { P, N, HALF, CURB, rc, blockInterior, MAP, landmarks, carFreeZones, isCarFree } from './layout.js';
import { Frame } from './kit.js';
import { oveBlock } from './ove.js';
import { villaBlock, apartmentsBlock, radhusBlock } from './buildings.js';
import { centrumBlock, hospitalBlock, churchBlock, cemeteryBlock, dealerBlock, preschoolBlock, kommunBlock, gasBlock, parkBlock, fieldBlock, forestBlock } from './places.js';
import { buildStreets, BUS_STOPS } from './streets.js';
import { buildOutskirts } from './outskirts.js';
import { finalizeSigns } from './signs.js';
import { parkedCars, pedLoops, animated, lamps, bouncers, violationSpots, litterSpots, collectibleSpots, mapLabels, shared, camBlocks, roadNames } from './data.js';
import { surfaceAt } from './surface.js';
import { fx } from '../game/fx.js';
import { mulberry32 } from '../util.js';

export { parkedCars, pedLoops, animated, lamps, bouncers, violationSpots, litterSpots, collectibleSpots, carFreeZones, isCarFree, mapLabels, surfaceAt, camBlocks, roadNames };

// Blocks right around Ove's that get a few extra violation spots of their own.
const NEAR_SPOTS = new Set(['2,3', '3,4', '3,2', '1,3']);
// Row-house areas face their parking lot towards a street; these line up their walkways with Ove's.
const RADHUS_YAW = { '2,3': 0, '1,3': 0, '3,4': Math.PI, '5,3': 0 };

export const townStats = {};

// ?nobatch: the old per-block meshes (one mesh per block per builder) instead of the batches.
const BATCH = typeof location === 'undefined' || !new URLSearchParams(location.search).has('nobatch');

// buildTown(scene) builds it all in one go; buildTownAsync(scene, onProgress) does exactly the same
// work in the same order (the same town, byte for byte) but gives the browser the thread back every
// ~40 ms (the loading screen stays alive: the whole build is 2.5-3 s on a desktop CPU, one task) and
// calls onProgress(f), f = 0..1, at each of those breaks and with 1 at the end. Both run townSteps.
export function buildTown(scene) {
  for (const _ of townSteps(scene));   // eslint-disable-line no-unused-vars
}
export async function buildTownAsync(scene, onProgress = null) {
  let t = performance.now(), last = -1;
  for (const f of townSteps(scene)) {
    if (performance.now() - t < 40) continue;
    if (onProgress && f !== last) { last = f; try { onProgress(f); } catch (e) { console.warn(e); } }
    await nextTask();
    t = performance.now();
  }
  if (onProgress) onProgress(1);
}

// The build, as a generator yielding the progress (0..1) at the points where it may pause.
function* townSteps(scene) {
  // (times are work time: the pauses of buildTownAsync are not counted)
  const t0 = performance.now(), steps = {};
  let busy = 0, resumed = t0, lastB = 0;
  const work = () => busy + performance.now() - resumed;
  const lap = (k) => { const b = work(); steps[k] = Math.round((steps[k] || 0) + b - lastB); lastB = b; };
  function* y(f) { busy += performance.now() - resumed; yield f; resumed = performance.now(); }
  const before = new Set(scene.children);
  const chunks = [];
  // (S.fineG: the thin branches and twigs of the block's trees, round 5 - no shadow, no AO pre-pass)
  for (let i = 0; i < N; i++) { chunks.push([]); for (let j = 0; j < N; j++) { const S = new GeoBuilder(), F = new GeoBuilder(); S.fineG = new GeoBuilder(); chunks[i].push({ S, F }); } }
  const chunk = (x, z) => {
    const i = Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / P))), j = Math.max(0, Math.min(N - 1, Math.floor((z + HALF) / P)));
    return chunks[i][j];
  };
  const centres = {};
  const glassG = (shared.glassG = new GeoBuilder().use('tinted'));
  // progress: the blocks are about half of the time, the streets / outskirts / batching the rest
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const b = blockInterior(i, j), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const { S, F } = chunks[i][j];
    const f = new Frame(S, F, cx, cz, 0);
    const r = mulberry32(1000 + i * 131 + j * 17);
    const key = `${i},${j}`;
    centres[MAP[j][i]] ??= f;
    switch (MAP[j][i]) {
      case 'ove': oveBlock(f); break;
      case 'radhus': radhusBlock(f, r, RADHUS_YAW[key] ?? [0, Math.PI / 2, Math.PI, -Math.PI / 2][(i * 3 + j * 5) % 4], { spots: NEAR_SPOTS.has(key) }); break;
      case 'villa': villaBlock(f, r, { ew: (i + j) % 2 === 1, lawnSpot: ['2,4', '4,4', '4,2', '2,2'].includes(key) || (i + j) % 3 === 0 }); break;
      case 'apartments': apartmentsBlock(f, r, { spots: NEAR_SPOTS.has(key) || key === '1,4' }); break;
      case 'centrum': centrumBlock(f, r); break;
      case 'hospital': hospitalBlock(f, r); break;
      case 'church': churchBlock(f, r); break;
      case 'cemetery': cemeteryBlock(f, r); break;
      case 'dealer': dealerBlock(f, r); break;
      case 'preschool': preschoolBlock(f, r); break;
      case 'kommun': kommunBlock(f, r); break;
      case 'gas': gasBlock(f, r); break;
      case 'park': parkBlock(f, r); break;
      case 'field': fieldBlock(f, r); break;
      case 'forest': forestBlock(f, r); break;
    }
    yield* y(0.5 * (i * N + j + 1) / (N * N));
  }
  lap('blocks');
  const roadG = new GeoBuilder();
  buildStreets(chunk, glassG, roadG);
  lap('streets');
  yield* y(0.56);
  buildOutskirts(scene);
  lap('outskirts');
  yield* y(0.6);
  placeCollectibles(centres);
  topUpLitter();

  // Meshes: per block solids (S: cast + receive), flat ground cover (F: no cast) and thin twigs
  // (S.fineG: no cast, no AO), the road surface (joins the ground), shelter glass, signs. Batched
  // (batch.js): one BatchedMesh per category and surface with one instance per block, so a surface
  // is one draw call per pass and blocks are still culled one by one. One category at a time, the
  // builders emptied as they go (lower peak memory).
  let meshes = 0;
  if (BATCH) {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const { S, F } = chunks[i][j]; touchSurfaces(S); touchSurfaces(F); touchSurfaces(S.fineG); }
    touchSurfaces(roadG);
  }
  const take = (B) => { if (B.empty) return null; const g = B.build(); B.parts = []; return g; };
  const cats = [
    ['block', (c) => take(c.S), { cast: true }],
    ['ground', (c) => take(c.F), { cast: false }],
    ['twigs', (c) => take(c.S.fineG), { cast: false, noAO: true }],
  ];
  let ci = 0;
  for (const [name, get, o] of cats) {
    const geos = [], p0 = 0.6 + 0.1 * ci++;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const g = get(chunks[i][j]);
        if (!g) continue;
        if (BATCH) { geos.push(g); continue; }
        const m = realMesh(g, { cast: o.cast });
        m.name = `${name}${i}${j}`;
        if (o.noAO) m.userData.noAO = true;
        scene.add(m); meshes++;
      }
      yield* y(p0 + 0.05 * (i + 1) / N);
    }
    lap('merge');
    if (name === 'ground') {
      const g = take(roadG);
      if (g && BATCH) geos.push(g);
      else if (g) { const m = realMesh(g, { cast: false }); m.name = 'roads'; scene.add(m); meshes++; }
    }
    if (BATCH) {
      const out = [];
      for (const _ of batchSteps(scene, [{ name, geos, ...o }], out)) yield* y(p0 + 0.075);   // eslint-disable-line no-unused-vars
      meshes += out.length;
    }
    lap('batch');
    yield* y(p0 + 0.1);
  }
  // The outskirts' forest belt (24 sector meshes, ~8 surfaces each) joins the batches as well.
  if (BATCH) {
    const belt = scene.children.filter((m) => m.name === 'forestbelt' && m.isMesh && !before.has(m));
    for (const m of belt) scene.remove(m);
    const out = [];
    for (const _ of batchSteps(scene, [{ name: 'forest', geos: belt.map((m) => m.geometry), cast: true }], out)) yield* y(0.92);   // eslint-disable-line no-unused-vars
    meshes += out.length;
    lap('batch');
  }
  if (!glassG.empty) { const m = realMesh(glassG.build(), { snow: false, cast: false }); m.renderOrder = 2; m.name = 'glass'; scene.add(m); }
  finalizeSigns(scene);
  lap('signs');
  yield* y(0.96);
  // The hills and the silhouette forest are far beyond the AO pre-pass anyway. (Far blocks no longer
  // need a noAO toggle: that pass only draws within its far plane, and the batches cull per block.)
  for (const m of scene.children) if (/^(hills|silhouettes)$/.test(m.name)) m.userData.noAO = true;
  // Everything built here is static: matrices fixed, CPU-side vertex arrays dropped after upload.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('townhash')) townStats.hash = townHash(scene, before);
  for (const m of scene.children) if (!before.has(m)) makeStatic(m);
  uploadGeometry();   // the world's vertex buffers go to the GPU now, not in the first frame
  lap('upload');
  // Start compiling the world's shaders now, in the background, while the cars and people are built.
  precompile(scene, { warm: false });
  lap('precompile');
  // Car grip and skid marks ask fx.surfaceAt (see fx.js, car.js); footsteps can use it too.
  fx.surfaceAt = surfaceAt;
  mapLabels.push(['Oves område', 'oveHouse'], ['Centrum', 'centrum'], ['Sjukhuset', 'hospital'], ['Kyrkan', 'church'], ['Kyrkogården', 'cemetery'], ['Bilhallen', 'dealer'], ['Förskolan', 'preschool'], ['Kommunhuset', 'kommun'], ['Bensin & Service', 'gas'], ['Parken', 'park'], ['Fotbollsplanen', 'field']);
  Object.assign(townStats, { buildMs: Math.round(work()), batchMs: steps.batch || 0, wallMs: Math.round(performance.now() - t0), steps, meshes, landmarks: Object.keys(landmarks).length, violationSpots: violationSpots.length, litter: litterSpots.length, parkedCars: parkedCars.length });
}

// ?townhash (tests): a hash of every batch's buffers and runs (the world must come out byte-identical)
function townHash(scene, before) {
  let h = 0x811c9dc5 >>> 0, n = 0;
  const mix = (a) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619) >>> 0; n += u.length; };
  for (const m of scene.children) {
    if (before.has(m) || !m.geometry) continue;
    const g = m.geometry;
    for (const k of Object.keys(g.attributes).sort()) mix(g.attributes[k].array);
    if (g.index) mix(g.index.array);
    if (m.runs) mix(new Float64Array(m.runs.flatMap((r) => [r.start, r.count, r.sphere.radius, r.box.min.x, r.box.max.z])));
  }
  return { hash: h.toString(16), bytes: n };
}

export function tickTown(t) {
  for (const a of animated) a.tick(t);
}

// Seven Saab emblems and seven of Sonja's photographs, each reachable on foot (ground level, or
// on a low step / bench / the sledding hill and the stand, which are climbable in 0.4 m steps).
function placeCollectibles(c) {
  const at = (type, yaw, lx, lz, y) => { const b = c[type]; const f = new Frame(null, null, b.ox, b.oz, yaw); return [f.wx(lx, lz), y, f.wz(lx, lz)]; };
  const E = collectibleSpots.emblems, Ph = collectibleSpots.photos;
  E.push(at('ove', 0, 5.0, -14.55, CURB + 1.3));            // on Ove's workbench, in the open garage
  E.push(at('dealer', Math.PI / 2, -15, -8.5, CURB + 1.0));   // among the used cars at Bilhallen
  E.push(at('park', 0, -15, 17, CURB + 3.2 + 0.9));            // top of the sledding hill
  E.push(at('gas', 0, 21, -29.8, CURB + 1.0));                 // behind the car wash
  E.push(at('ove', 0, -28.2, 28.0, CURB + 0.9));               // in the bike shed
  E.push(at('field', Math.PI, 30.4, 2, CURB + 1.2 + 0.9));     // top row of the stand
  E.push(at('hospital', 0, -29.6, 5.4, CURB + 1.0));           // by a parking meter
  Ph.push(at('park', 0, 12, -6.7, CURB + 1.05));               // on the bench by the pond
  Ph.push(at('church', 0, -16.6, -2, CURB + 0.48 + 0.9));      // on the church steps
  Ph.push(at('cemetery', 0, -11.4, 24.9, CURB + 1.0));         // by the minneslund
  Ph.push(at('centrum', 0, 7.4, -0.8, CURB + 1.0));            // under the Christmas tree on the torg
  const bs = BUS_STOPS[0];
  Ph.push([bs.a + 0.5, CURB + 1.05, bs.c + bs.dir * 7.6]);     // in the shelter at Solrosvägen
  Ph.push(at('forest', 0, -22, 5, CURB + 1.0));                // on the jogging track
  Ph.push(at('preschool', Math.PI, 6, 5.5, CURB + 0.3 + 0.9)); // in the preschool sandbox
}

// Make sure there are ~120 cans: add more along sidewalks near Ove's if needed.
function topUpLitter() {
  const r = mulberry32(31337);
  let guard = 0;
  while (litterSpots.length < 125 && guard++ < 400) {
    const i = 1 + Math.floor(r() * 5), j = 1 + Math.floor(r() * 5);
    const side = Math.floor(r() * 4), t = rc(i) + 12 + r() * 56, l = 5.5 + 1.8 + r() * 1.2;
    const [x, z] = side === 0 ? [t, rc(j) + l] : side === 1 ? [t, rc(j) - l] : side === 2 ? [rc(i) + l, rc(j) + 12 + r() * 56] : [rc(i) - l, rc(j) + 12 + r() * 56];
    litterSpots.push([x, CURB + 0.05, z]);
  }
}
