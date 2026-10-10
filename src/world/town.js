// Builds the suburb on an early-winter morning: Ove's radhusområde in the middle, row-house areas,
// villas, lamellhus, centrum, sjukhuset, the church and cemetery, a car dealer, a preschool,
// kommunhuset, a petrol station, a park, a football field and forest at the edges.
// See DESIGN.md section 6 (contract) and notes/world.md (API, deviations).
//
// Static geometry is merged per block (one realMesh for solids, one for flat ground cover, so one
// draw call per surface per block), printed signs are batched in a few atlas meshes (signs.js),
// breakables are instanced (props.js).

import { GeoBuilder, realMesh, camera } from '../gfx.js';
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

export function buildTown(scene) {
  const t0 = performance.now();
  const chunks = [];
  // (S.fineG: the thin branches and twigs of the block's trees, round 5 - no shadow, no AO pre-pass)
  for (let i = 0; i < N; i++) { chunks.push([]); for (let j = 0; j < N; j++) { const S = new GeoBuilder(), F = new GeoBuilder(); S.fineG = new GeoBuilder(); chunks[i].push({ S, F }); } }
  const chunk = (x, z) => {
    const i = Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / P))), j = Math.max(0, Math.min(N - 1, Math.floor((z + HALF) / P)));
    return chunks[i][j];
  };
  const centres = {};
  const glassG = (shared.glassG = new GeoBuilder().use('tinted'));
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
  }
  const roadG = new GeoBuilder();
  buildStreets(chunk, glassG, roadG);
  buildOutskirts(scene);
  placeCollectibles(centres);
  topUpLitter();

  // Meshes: per block solids + flat ground cover, the road surface, shelter glass, signs.
  let meshes = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const { S, F } = chunks[i][j];
    if (!S.empty) { const m = realMesh(S.build()); m.name = `block${i}${j}`; scene.add(m); meshes++; }
    if (!F.empty) { const m = realMesh(F.build(), { cast: false }); m.name = `ground${i}${j}`; scene.add(m); meshes++; }
    if (!S.fineG.empty) { const m = realMesh(S.fineG.build(), { cast: false }); m.name = `twigs${i}${j}`; m.userData.noAO = true; scene.add(m); meshes++; }
  }
  { const m = realMesh(roadG.build(), { cast: false }); m.name = 'roads'; scene.add(m); }
  if (!glassG.empty) { const m = realMesh(glassG.build(), { snow: false, cast: false }); m.renderOrder = 2; m.name = 'glass'; scene.add(m); }
  finalizeSigns(scene);
  // Far meshes leave the AO / shadow pre-pass (tickTown): GTAO's 0.9 m contact occlusion is a
  // fraction of a pixel there, and nothing that far casts into the 210 m shadow cascade (a 10 m
  // building's shadow at 13 deg is ~43 m long, hence the margin). The hills and the silhouette
  // forest are always that far.
  farMeshes.length = 0;
  for (const m of scene.children) {
    if (!m.isMesh || !m.geometry) continue;
    if (/^(hills|silhouettes)$/.test(m.name)) { m.userData.noAO = true; continue; }
    if (!/^(block|ground|forestbelt|roads)/.test(m.name)) continue;
    m.geometry.computeBoundingSphere();
    const b = m.geometry.boundingSphere;
    farMeshes.push([m, b.center.x, b.center.y, b.center.z, b.radius]);
  }
  // Car grip and skid marks ask fx.surfaceAt (see fx.js, car.js); footsteps can use it too.
  fx.surfaceAt = surfaceAt;
  mapLabels.push(['Oves område', 'oveHouse'], ['Centrum', 'centrum'], ['Sjukhuset', 'hospital'], ['Kyrkan', 'church'], ['Kyrkogården', 'cemetery'], ['Bilhallen', 'dealer'], ['Förskolan', 'preschool'], ['Kommunhuset', 'kommun'], ['Bensin & Service', 'gas'], ['Parken', 'park'], ['Fotbollsplanen', 'field']);
  Object.assign(townStats, { buildMs: Math.round(performance.now() - t0), meshes, landmarks: Object.keys(landmarks).length, violationSpots: violationSpots.length, litter: litterSpots.length, parkedCars: parkedCars.length });
}

const farMeshes = [], FAR_AO = 240;
export function tickTown(t) {
  for (const a of animated) a.tick(t);
  const c = camera.position;
  for (const [m, x, y, z, r] of farMeshes) m.userData.noAO = Math.hypot(c.x - x, c.y - y, c.z - z) - r > FAR_AO;
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
