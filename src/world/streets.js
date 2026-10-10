// Streets: block slabs, granite kerbs, sidewalks (snowy verge strip + asphalt walkway, or paving
// in the centres), road markings (dashed centre and edge lines, zebra crossings, bus-stop
// zigzags), bus stops with shelters, street lamps, road signs, plowed snow banks, the
// street-side violation spots, pedestrian loops and street litter.

import { THREE, mat } from '../gfx.js';
import { P, N, HALF, RHW, SW, CURB, KR, rc, MAP, landmarks } from './layout.js';
import { C, R, quads, snowBank, snowPile, streetLamp, signPost, TAU, tree, metalRoof, Frame, hash, flatQuad } from './kit.js';
import { picto, textFace, decal, addDecal, addSign } from './signs.js';
import { violationSpots, keepClear, litterSpots, pedLoops, mapLabels, roadNames } from './data.js';
import { addGround } from './surface.js';
import { circle } from './collision.js';
import { mulberry32 } from '../util.js';

const r = mulberry32(4242);
const PAVED = new Set(['centrum', 'hospital', 'kommun', 'gas', 'dealer']);
const LAT = 5.85;            // a car parked half up on the kerb: centre this far from the road centre
const TREE_BLK = new Set(['ove', 'radhus', 'villa', 'apartments', 'preschool', 'church', 'cemetery', 'park', 'field']);
const CROSS_AT = 10.6;       // zebra centre distance from the intersection centre

// Sides: a sidewalk along a road. axis 'z' = road runs along x with its centre line at z = c;
// axis 'x' = road runs along z, centre x = c. dir = +-1 from the road towards the sidewalk.
// a0..a1 = along range (world coordinate along the road). blk = owning block type (or 'outer').
function sideList() {
  const out = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const t = MAP[j][i], x0 = rc(i) + RHW, x1 = rc(i + 1) - RHW, z0 = rc(j) + RHW, z1 = rc(j + 1) - RHW;
    out.push({ i, j, key: 'N', axis: 'z', c: rc(j), dir: 1, a0: x0, a1: x1, blk: t });
    out.push({ i, j, key: 'S', axis: 'z', c: rc(j + 1), dir: -1, a0: x0, a1: x1, blk: t });
    out.push({ i, j, key: 'W', axis: 'x', c: rc(i), dir: 1, a0: z0, a1: z1, blk: t });
    out.push({ i, j, key: 'E', axis: 'x', c: rc(i + 1), dir: -1, a0: z0, a1: z1, blk: t });
  }
  // Outer ring: the far side of the outermost roads.
  const e = HALF + RHW;
  out.push({ i: -1, j: -1, key: 'oN', axis: 'z', c: -HALF, dir: -1, a0: -e - SW, a1: e + SW, blk: 'outer' });
  out.push({ i: -1, j: -1, key: 'oS', axis: 'z', c: HALF, dir: 1, a0: -e - SW, a1: e + SW, blk: 'outer' });
  out.push({ i: -1, j: -1, key: 'oW', axis: 'x', c: -HALF, dir: -1, a0: -e, a1: e, blk: 'outer' });
  out.push({ i: -1, j: -1, key: 'oE', axis: 'x', c: HALF, dir: 1, a0: -e, a1: e, blk: 'outer' });
  return out;
}
// World position at along a, lateral l (from the road centre, towards the sidewalk).
const pos = (s, a, l) => (s.axis === 'z' ? [a, s.c + s.dir * l] : [s.c + s.dir * l, a]);
// Yaw of a car parked on this side, heading with the traffic on that half of the road.
const carYaw = (s) => (s.axis === 'z' ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.dir > 0 ? Math.PI : 0));
// Yaw of something on the sidewalk facing the road.
const faceRoad = (s) => (s.axis === 'z' ? (s.dir > 0 ? Math.PI : 0) : (s.dir > 0 ? -Math.PI / 2 : Math.PI / 2));
// Yaw along the side (direction of increasing a).
const alongYaw = (s) => (s.axis === 'z' ? Math.PI / 2 : 0);

// Zebra crossings: road axis, road centre c, along position a. Chosen near the places people walk.
const X = (k) => rc(k);
export const CROSSINGS = [
  { axis: 'x', c: X(3), a: 3.8 },              // ove main walkway -> radhus west
  { axis: 'x', c: X(4), a: 3.8 },              // ove main walkway -> park
  { axis: 'z', c: X(4), a: 0 },                // ove cross walkway -> radhus south
  { axis: 'z', c: X(3), a: X(3) - CROSS_AT },  // centrum corner
  { axis: 'x', c: X(3), a: X(3) - CROSS_AT },
  { axis: 'z', c: X(2), a: X(3) - CROSS_AT },  // preschool
  { axis: 'x', c: X(5), a: X(2) - 30 },        // hospital
  { axis: 'z', c: X(3), a: X(4) + CROSS_AT },  // kommun / park
  { axis: 'z', c: X(6), a: X(0) + 40 },        // church <-> cemetery
  { axis: 'x', c: X(3), a: X(3) + CROSS_AT },  // ove south-west corner
  { axis: 'z', c: X(3), a: X(5) - CROSS_AT },
  { axis: 'x', c: X(6), a: X(4) + 40 },        // dealer
];
// Bus stops: road axis/centre, along position, dir = sidewalk side, name on the plate.
export const BUS_STOPS = [
  { axis: 'z', c: X(3), dir: 1, a: 9, name: 'Solrosvägen', lm: 'busStop' },
  { axis: 'z', c: X(3), dir: -1, a: -70, name: 'Centrum', lm: 'busStopCentrum' },
  { axis: 'x', c: X(5), dir: 1, a: -172, name: 'Sjukhuset', lm: 'busStopSjukhuset' },
  { axis: 'z', c: X(6), dir: -1, a: -228, name: 'Kyrkan', lm: 'busStopKyrkan' },
  { axis: 'z', c: X(2), dir: -1, a: -64, name: 'Förskolan', lm: 'busStopForskolan' },
  { axis: 'x', c: X(6), dir: 1, a: 60, name: 'Bilhallen', lm: 'busStopBilhallen' },
];

// Blocks whose streets get (more) violation spots: Ove's and its neighbours.
const NEAR = new Set(['3,3', '2,3', '4,3', '3,2', '3,4', '2,2', '4,2', '2,4', '4,4', '1,3', '5,1', '2,1']);

export function buildStreets(chunk, glassG, roadG) {
  const sides = sideList();
  // ----- Ground: asphalt under the grid, block slabs, outer verge.
  const ext = HALF + RHW + 0.5;
  roadG.use('asphalt').box(C.asphalt, 0, -0.5, 0, ext * 2, 1, ext * 2);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const { F, S } = chunk(rc(i) + 40, rc(j) + 40);
    const x0 = rc(i) + RHW, x1 = rc(i + 1) - RHW, z0 = rc(j) + RHW, z1 = rc(j + 1) - RHW;
    const paved = PAVED.has(MAP[j][i]);
    // The block slab with rounded kerb corners (layout.isRoad agrees), granite kerb arcs.
    F.use(paved ? 'paving' : 'asphalt').add(roundedSlab(x0, z0, x1, z1, KR), paved ? C.paving : 0x7a7874, null);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kerbArc(S, sx < 0 ? x0 + KR : x1 - KR, sz < 0 ? z0 + KR : z1 - KR, sx, sz);
  }
  const o = HALF + RHW, far = 420;
  for (const [cx, cz, w, d] of [[0, -(o + far) / 2, 2 * far, far - o], [0, (o + far) / 2, 2 * far, far - o], [-(o + far) / 2, 0, far - o, 2 * o], [(o + far) / 2, 0, far - o, 2 * o]]) {
    roadG.use('snow').box(null, cx, CURB / 2 - 0.5, cz, w, CURB + 1, d);
  }

  // ----- Crossings and bus stops first: everything else keeps clear of them.
  for (const cr of CROSSINGS) {
    for (const d of [-1, 1]) keepClear.push({ ...xzOf(cr.axis, cr.c, cr.a, d * 6.3), r: 2.8 });
  }
  for (const b of BUS_STOPS) keepClear.push({ ...xzOf(b.axis, b.c, b.a, b.dir * 6.3), r: 11 });

  // ----- Street violation spots (half up on the kerb, never in a lane).
  streetSpots(sides);

  // ----- Per-side dressing.
  for (const s of sides) dressSide(s, chunk);
  // ----- Plowed piles at the junction corners (where the plough turns), clear of crossings.
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (MAP[j][i] === 'forest') continue;
    const x0 = rc(i) + RHW, x1 = rc(i + 1) - RHW, z0 = rc(j) + RHW, z1 = rc(j + 1) - RHW;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (r() < 0.25) continue;
      const d = 2.3 + r() * 0.6;
      const x = (sx < 0 ? x0 : x1) - sx * d, z = (sz < 0 ? z0 : z1) - sz * d;
      if (nearClear(x, z, 2.2) || nearSpot(x, z, 4.5)) continue;
      snowPile(chunk(x, z).S, x, z, 1.2 + r() * 0.5, 0.6 + r() * 0.3, false, r, CURB, 2, Math.atan2(sx, sz));
    }
  }

  // ----- Markings (in the road builder: one part per kind).
  const centre = [], edge = [], zebra = [], zig = [];
  const segs = [];
  for (let k = 0; k <= N; k++) for (let m = 0; m < N; m++) {
    segs.push({ axis: 'z', c: rc(k), a0: rc(m), a1: rc(m + 1) });
    segs.push({ axis: 'x', c: rc(k), a0: rc(m), a1: rc(m + 1) });
  }
  for (const sg of segs) {
    const crs = CROSSINGS.filter((c) => c.axis === sg.axis && Math.abs(c.c - sg.c) < 0.1 && c.a > sg.a0 && c.a < sg.a1).map((c) => c.a);
    const buses = BUS_STOPS.filter((b) => b.axis === sg.axis && Math.abs(b.c - sg.c) < 0.1 && b.a > sg.a0 && b.a < sg.a1);
    const blocked = (a, pad) => crs.some((c) => Math.abs(a - c) < 1.5 + pad);
    for (let a = sg.a0 + 12; a < sg.a1 - 12; a += 9) {
      if (blocked(a + 1.5, 1.2)) continue;
      centre.push(seg(sg.axis, sg.c, a + 1.5, 0, 3, 0.12));
    }
    for (const side of [-1, 1]) for (let a = sg.a0 + 9.5; a < sg.a1 - 9.5; a += 3) {
      if (blocked(a + 0.5, 0.5)) continue;
      if (buses.some((b) => b.dir === side && Math.abs(a - b.a) < 11)) continue;
      edge.push(seg(sg.axis, sg.c, a + 0.5, side * 5.05, 1, 0.1));
    }
    for (const c of crs) for (let w = -RHW + 0.55; w <= RHW - 0.5; w += 1.0) zebra.push(seg(sg.axis, sg.c, c, w, 3.0, 0.5));
  }
  // Bus stop zigzags (yellow) along the kerb, and BUSS lettering.
  for (const b of BUS_STOPS) {
    const n = 26, L = 20, a0 = b.a - L / 2;
    for (let k = 0; k < n; k++) {
      const ta = a0 + (k / n) * L, tb = a0 + ((k + 1) / n) * L;
      const la = k % 2 ? 4.5 : 5.25, lb = k % 2 ? 5.25 : 4.5;
      const [ax, az] = xzArr(b.axis, b.c, ta, b.dir * la), [bx, bz] = xzArr(b.axis, b.c, tb, b.dir * lb);
      const len = Math.hypot(bx - ax, bz - az);
      zig.push([(ax + bx) / 2, (az + bz) / 2, 0.11, len + 0.1, Math.atan2(bx - ax, bz - az)]);
    }
    const [dx, dz] = xzArr(b.axis, b.c, b.a, b.dir * 3.6);
    addDecal(decal('buss'), dx, 0.035, dz, 2.6, 0.9, carYaw(b));
  }
  // Drain grates (rännstensbrunnar) along the kerbs and manhole covers (brunnslock) in the lanes.
  const grates = [], frames = [], covers = [];
  for (const sg of segs) {
    const n = Math.floor((sg.a1 - sg.a0 - 24) / 26);
    for (let k = 0; k <= n; k++) {
      const a = sg.a0 + 12 + k * 26 + (hash(k, sg.c * 3 + sg.a0) - 0.5) * 6, side = (k + Math.round(sg.c / 80)) % 2 ? 1 : -1;
      if (CROSSINGS.some((c) => c.axis === sg.axis && Math.abs(c.c - sg.c) < 0.1 && Math.abs(c.a - a) < 4)) continue;
      if (BUS_STOPS.some((b) => b.axis === sg.axis && Math.abs(b.c - sg.c) < 0.1 && Math.abs(b.a - a) < 12)) continue;
      grates.push(seg(sg.axis, sg.c, a, side * (RHW - 0.32), 0.62, 0.36));
      frames.push(seg(sg.axis, sg.c, a, side * (RHW - 0.32), 0.74, 0.48));
      if (k % 2 === 0) covers.push(xzArr(sg.axis, sg.c, a + 9, -side * (1.1 + hash(k, sg.c) * 1.8)));
    }
  }
  // Cast iron, dull and dirty (a 'metal' cover mirrored the sky at grazing angles: pale ovals).
  roadG.use('rubber');
  quads(roadG, 0x3a3a38, frames, 0.004);
  quads(roadG, 0x161616, grates, 0.006);
  for (const [x, z] of covers) { roadG.cyl(0x34332f, x, 0.002, z, 0.34, 0.012, 16); roadG.cyl(0x2a2a27, x, 0.004, z, 0.3, 0.012, 16); }
  roadG.use('marking');
  quads(roadG, 0xdcdcd4, centre, 0.012);
  quads(roadG, 0xd4d4cc, edge, 0.012);
  quads(roadG, 0xe0e0d8, zebra, 0.014);
  quads(roadG, 0xd8b030, zig, 0.013);

  // ----- Crossing signs, bus stops.
  for (const cr of CROSSINGS) {
    // Keep both posts out of the junction's kerb arc: a post that would land there goes to the
    // other end of the zebra.
    const aj = Math.round((cr.a + HALF) / P) * P - HALF;
    for (const d of [-1, 1]) {
      let along = d * 2.9;
      if (Math.abs(cr.a + along - aj) < RHW + KR + 1.0) along = -along;
      const [x, z] = xzArr(cr.axis, cr.c, cr.a + along, d * 6.45);
      const yaw = carYaw({ axis: cr.axis, dir: d }) + Math.PI;
      const { S } = chunk(x, z);
      signPost(S, x, z, yaw, [{ f: picto('crossing'), w: 0.64, h: 0.64 }], { top: 2.6 });
    }
  }
  for (const b of BUS_STOPS) busStop(b, chunk, glassG);

  // ----- A few speed and parking signs.
  const speed = [[X(3), 'z', -1, X(2) + 20, 'speed30'], [X(4), 'z', 1, X(4) - 20, 'speed30'], [X(3), 'x', 1, X(2) + 25, 'speed30'], [X(4), 'x', -1, X(4) - 25, 'speed30'],
    [X(0), 'x', 1, -150, 'speed50'], [X(7), 'x', -1, 150, 'speed50'], [X(0), 'z', 1, 120, 'speed50'], [X(7), 'z', -1, -120, 'speed50']];
  for (const [c, axis, dir, a, p] of speed) {
    const [x, z] = xzArr(axis, c, a, dir * 6.5);
    if (nearClear(x, z, 1.5) || nearSpot(x, z, 3.4)) continue;
    const s = { axis, c, dir };
    signPost(chunk(x, z).S, x, z, carYaw(s) + Math.PI - dir * 0.25, [{ f: picto(p), w: 0.64, h: 0.64 }], { top: 2.5 });
  }
  // P-förbud along the centre's streets.
  for (const [c, axis, dir, a] of [[X(3), 'z', -1, X(2) + 22], [X(2), 'x', -1, X(2) + 30], [X(5), 'x', -1, X(1) + 52], [X(3), 'x', -1, X(2) + 52]]) {
    const [x, z] = xzArr(axis, c, a, dir * 6.6);
    if (nearClear(x, z, 1.5) || nearSpot(x, z, 3.4)) continue;
    signPost(chunk(x, z).S, x, z, carYaw({ axis, dir }) + Math.PI - dir * 0.25, [{ f: picto('pforbud'), w: 0.6, h: 0.6 }], { top: 2.4 });
  }

  // ----- Street-name signs (gatunamnsskyltar) at the junctions: one post near a corner, a plate per
  // road, each parallel to the road it names, printed on both sides (data.js roadNames).
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const bi = i + (sx > 0 ? 0 : -1), bj = j + (sz > 0 ? 0 : -1);
      if (bi < 0 || bj < 0 || bi >= N || bj >= N || MAP[bj][bi] === 'forest') continue;
      // beside the north-south road, 12.5 m from the junction: clear of the kerb corner (turning
      // cars mount it) and of the pedestrian loop
      const x = rc(i) + sx * 6.4, z = rc(j) + sz * 12.5;
      if (nearClear(x, z, 0.6) || nearSpot(x, z, 3.2)) continue;
      const { S } = chunk(x, z);
      S.use('metal').cyl(0x9a9da0, x, CURB + 1.45, z, 0.035, 2.9, 6);
      // the plates sit on brackets beside the pole, pointing away from the junction
      const plate = (name, y, yaw, out) => {
        const f = textFace(name, 0.95, 0.2, { bg: '#1e4a8a', fg: '#f6f6f2', ppm: 300, weight: '600', scale: 0.7, border: '#f6f6f2', borderW: 0.05 });
        const nx = Math.sin(yaw), nz = Math.cos(yaw), px = x + out[0] * 0.52, pz = z + out[1] * 0.52;
        S.use('metal').boxB(0x1e4a8a, px, y - 0.1, pz, 0.97, 0.21, 0.025, yaw);
        addSign(f, px + nx * 0.014, y, pz + nz * 0.014, 0.95, 0.2, yaw);
        addSign(f, px - nx * 0.014, y, pz - nz * 0.014, 0.95, 0.2, yaw + Math.PI);
      };
      plate(roadNames.ns[i], CURB + 2.66, Math.PI / 2, [0, sz]);   // along z: face +-x
      plate(roadNames.ew[j], CURB + 2.4, 0, [sx, 0]);              // along x: face +-z
      circle(x, z, 0.05, 99, 'pole');
      break;
    }
  }

  // ----- Pedestrian loops: one rectangle per block, on the walkway.
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const off = RHW + SW * 0.62;
    const x0 = rc(i) + off, x1 = rc(i + 1) - off, z0 = rc(j) + off, z1 = rc(j + 1) - off;
    pedLoops.push({ i, j, pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
  }
}

const seg = (axis, c, a, lat, len, w) => (axis === 'z' ? [a, c + lat, len, w, Math.PI / 2] : [c + lat, a, len, w, 0]);
function xzOf(axis, c, a, lat) { return axis === 'z' ? { x: a, z: c + lat } : { x: c + lat, z: a }; }
function xzArr(axis, c, a, lat) { return axis === 'z' ? [a, c + lat] : [c + lat, a]; }
function nearClear(x, z, pad = 0) { return keepClear.some((k) => (k.x - x) ** 2 + (k.z - z) ** 2 < (k.r + pad) ** 2); }
function nearSpot(x, z, rad) { return violationSpots.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < rad * rad); }

// ---------------------------------------------------------------------------------------------

function streetSpots(sides) {
  const add = (s, a, kind) => {
    const [x, z] = pos(s, a, LAT);
    violationSpots.push({ x, z, yaw: carYaw(s), kind, where: 'street' });
  };
  // Crosswalks: on the zebra, on one kerb.
  CROSSINGS.forEach((cr, n) => {
    const s = sides.find((q) => q.blk !== 'outer' && q.axis === cr.axis && Math.abs(q.c - cr.c) < 0.1 && cr.a > q.a0 && cr.a < q.a1 && q.dir === (n % 2 ? -1 : 1));
    if (s) add(s, cr.a, 'crosswalk');
  });
  // Bus stops.
  for (const b of BUS_STOPS) {
    const s = sides.find((q) => q.blk !== 'outer' && q.axis === b.axis && Math.abs(q.c - b.c) < 0.1 && q.dir === b.dir && b.a > q.a0 && b.a < q.a1);
    if (s) add(s, b.a + 4, 'busstop');
  }
  // Corners and plain sidewalk parking around Ove's and the nearby blocks.
  for (const s of sides) {
    if (s.blk === 'outer' || !NEAR.has(`${s.i},${s.j}`)) continue;
    const L = s.a1 - s.a0;
    const cands = [];
    const corner = (a) => cands.push([a, 'corner']);
    if (r() < 0.6) corner(s.a0 + (CROSS_AT - RHW) + 3.6);
    if (r() < 0.45) corner(s.a1 - (CROSS_AT - RHW) - 3.6);
    const ns = ['3,3', '2,3', '4,3', '3,2', '3,4'].includes(`${s.i},${s.j}`) ? 2 : 1;
    for (let k = 0; k < ns; k++) cands.push([s.a0 + 16 + r() * (L - 32), 'sidewalk']);
    for (const [a, kind] of cands) {
      const [x, z] = pos(s, a, LAT);
      if (nearClear(x, z, 2.6) || nearSpot(x, z, 7)) continue;
      add(s, a, kind);
    }
  }
}

function dressSide(s, chunk) {
  const paved = PAVED.has(s.blk);
  const outer = s.blk === 'outer';
  const len = s.a1 - s.a0;
  const mid = (s.a0 + s.a1) / 2;
  const yAlong = alongYaw(s);
  // (horizontal quads: the 6 cm boxes showed their snow-free grass side as a yellow-green line
  // along the back of the kerb)
  const flat = (G, color, a, l, w, d, top) => { const [x, z] = pos(s, a, l); flatQuad(G, color, x, top, z, s.axis === 'z' ? w : d, s.axis === 'z' ? d : w); addGround(G.surface, x, z, s.axis === 'z' ? w : d, s.axis === 'z' ? d : w, 0, top); };
  const { S, F } = chunk(...pos(s, mid, 8));
  // Granite kerb: covers the slab edge down to the road (the corner arcs are built per block).
  {
    const [x, z] = pos(s, mid, RHW + 0.09), kl = outer ? len : len - 2 * KR;
    // (its top at the verge strip's level: a 1.5 cm step behind it showed as a dark line)
    S.use('concrete').box(C.granite, x, (CURB + 0.018 - 0.05) / 2, z, s.axis === 'z' ? kl : 0.18, CURB + 0.068, s.axis === 'z' ? 0.18 : kl);
  }
  // Sidewalk surface: verge strip + asphalt walkway (residential), plain paving (centres).
  const inner = (l0, l1) => [RHW + l0, RHW + l1];
  if (!paved) {
    // The strip runs between the corner squares (clear of the kerb arcs); the walkway of the
    // along-x sides covers the corners (up to where the arc cuts in).
    const cut = outer ? 0 : SW + 0.4;
    F.use('grass');
    flat(F, C.lawn, mid, RHW + 0.18 + 0.56, len - 2 * cut, 1.12, CURB + 0.02);
    F.use('asphalt');
    if (outer) flat(F, 0x77756f, mid, RHW + 1.3 + 1.1, len, 2.2, CURB + 0.022);
    else if (s.axis === 'z') flat(F, 0x77756f, mid, RHW + 1.3 + 1.1, len - 3.6, 2.2, CURB + 0.022);
    else flat(F, 0x77756f, mid, RHW + 1.3 + 1.1, len - 2 * SW, 2.2, CURB + 0.022);
  }
  if (outer) {
    // Beyond the outer walkway: a snowy verge with a ditch line of birches further out.
    for (let a = s.a0 + 10; a < s.a1 - 10; a += 18 + r() * 14) {
      const [x, z] = pos(s, a + r() * 6, RHW + SW + 4 + r() * 10);
      if (Math.abs(x) > 286 + 30 || Math.abs(z) > 286 + 30) continue;
      chunk(x, z).S && treeAt(chunk(x, z).S, x, z, r() < 0.6 ? 'birch' : 'spruce');
    }
  }
  // Collect blocked along-intervals for lamps and banks.
  const blocks = [];
  const project = (x, z) => (s.axis === 'z' ? x : z);
  const lateral = (x, z) => (s.axis === 'z' ? (z - s.c) * s.dir : (x - s.c) * s.dir);
  for (const k of keepClear) { const l = lateral(k.x, k.z); if (l > 3 && l < 12) blocks.push([project(k.x, k.z) - k.r, project(k.x, k.z) + k.r]); }
  for (const v of violationSpots) { const l = lateral(v.x, v.z); if (l > 3 && l < 9) blocks.push([project(v.x, v.z) - 3.2, project(v.x, v.z) + 3.2]); }
  const isBlocked = (a, pad = 0) => blocks.some(([b0, b1]) => a > b0 - pad && a < b1 + pad);
  const bankBlocks = blocks.slice();   // banks only break for driveways, crossings, spots (not lamps/trees)
  const isBlockedB = (a, pad = 0) => bankBlocks.some(([b0, b1]) => a > b0 - pad && a < b1 + pad);
  // Lamps: residential blocks light their north and west streets (edge blocks also the outside);
  // the arm reaches over the road.
  const wantLamps = outer ? false : (s.key === 'N' || s.key === 'W' || (s.key === 'S' && s.j === N - 1) || (s.key === 'E' && s.i === N - 1));
  if (wantLamps) {
    for (const t of [0.25, 0.75]) {
      let a = s.a0 + len * t, free = false;
      for (const d of [0, 4, -4, 8, -8, 12, -12]) { if (!isBlocked(a + d, 1.2)) { a += d; free = true; break; } }
      if (!free) continue;
      const [x, z] = pos(s, a, RHW + 0.75);
      streetLamp(S, x, z, faceRoad(s), 6.8);
      blocks.push([a - 0.6, a + 0.6]);
    }
  }
  // Street trees in the verge: an avenue per road (birch or lime), one tree every ~13 m
  // alternating between the two sides, clear of lamps, driveways, crossings and parking spots.
  if (!paved && !outer && TREE_BLK.has(s.blk)) {
    const road = s.axis + Math.round(s.c);
    const lime = hash(Math.round(s.c / 80) * 7 + (s.axis === 'z' ? 3 : 0), 5) < 0.4;
    // None within 20 m of a junction (along the road): a car swinging wide round the corner or
    // pulling over there must not get trapped against a trunk.
    for (let a = s.a0 + (s.dir > 0 ? 15.8 : 28); a < s.a1 - 15.3; a += 26) {
      if (isBlocked(a, 1.6)) continue;
      const [x, z] = pos(s, a + (r() - 0.5) * 1.5, RHW + 0.74);
      const { S: TS } = chunk(x, z);
      if (lime) tree(TS, x, z, 0.62 + r() * 0.12, 'lime', r);
      else tree(TS, x, z, 0.7 + r() * 0.16, 'birch', r);
      blocks.push([a - 0.8, a + 0.8]);
    }
  }
  // Plowed snow: a continuous bank on the verge along the kerb, broken only at driveways, crossings,
  // bus stops and parked cars (or heaps at the kerb on paved sidewalks).
  const lat = paved ? RHW + 0.65 : RHW + 0.95;
  const segs = [];
  let a = s.a0 + (outer ? 2 : SW + 0.7);
  const end = s.a1 - (outer ? 2 : SW + 0.7);
  while (a < end) {
    if (isBlockedB(a, 0.3)) { a += 0.5; continue; }
    let b = a;
    // (one long bank between driveways; now and then the plough left a short gap in it)
    const want = paved ? 2.5 + r() * 4 : r() < 0.35 ? 6 + r() * 14 : 999;
    while (b < end && b - a < want && !isBlockedB(b, 0.3)) b += 0.5;
    if (b - a > 1.2) segs.push([a, b]);
    a = b + (paved ? 4 + r() * 10 : 0.5 + r() * 0.8);
  }
  for (const [a0, a1] of segs) {
    const [x0, z0] = pos(s, a0, lat + (r() - 0.5) * 0.15), [x1, z1] = pos(s, a1, lat + (r() - 0.5) * 0.15);
    snowBank(S, x0, z0, x1, z1, (paved ? 0.9 : 0.95) * (0.85 + r() * 0.3), (paved ? 0.36 : 0.3) * (0.75 + r() * 0.5), Math.floor(r() * 9999), undefined, { skirt: 0.22, dirty: s.axis === 'z' ? -s.dir : s.dir, rubble: 0.07, color: 0xdcdee0, coarse: true, pushes: !paved });
  }
  // Litter along the walkway.
  if (!outer) {
    const n = r() < (NEAR.has(`${s.i},${s.j}`) ? 0.6 : 0.12) ? 1 : 0;
    for (let k = 0; k < n; k++) { const [x, z] = pos(s, s.a0 + 6 + r() * (len - 12), RHW + 1.7 + r() * 1.3); litterSpots.push([x, CURB + 0.05, z]); }
  }
}

function treeAt(S, x, z, kind) { tree(S, x, z, 0.9 + r() * 0.35, kind, r); }

// A block slab (sidewalks + block ground under everything) with rounded corners of radius R: a flat
// top fan and vertical walls down to y = -1 (hidden under the kerbs).
function roundedSlab(x0, z0, x1, z1, R) {
  const pts = [];
  for (const [cx, cz, a0] of [[x1 - R, z0 + R, -Math.PI / 2], [x1 - R, z1 - R, 0], [x0 + R, z1 - R, Math.PI / 2], [x0 + R, z0 + R, Math.PI]]) {
    for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
  }
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, pos = [], nrm = [];
  const tri = (a, b, c, n) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) nrm.push(...n); };
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
    // Top: wind counter-clockwise seen from above.
    const cr = (ax - mx) * (bz - mz) - (az - mz) * (bx - mx);
    if (cr < 0) tri([mx, CURB, mz], [ax, CURB, az], [bx, CURB, bz], [0, 1, 0]); else tri([mx, CURB, mz], [bx, CURB, bz], [ax, CURB, az], [0, 1, 0]);
    // Wall facing out.
    let nx = bz - az, nz = -(bx - ax); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * ((ax + bx) / 2 - mx) + nz * ((az + bz) / 2 - mz) < 0) { nx = -nx; nz = -nz; }
    const A = [ax, CURB, az], B = [bx, CURB, bz], Cc = [bx, -1, bz], D = [ax, -1, az];
    const n = [nx, 0, nz];
    const e1 = [B[0] - A[0], 0, B[2] - A[2]], e2 = [0, -1, 0];
    const fy = e1[2] * e2[0] - e1[0] * e2[2], fx = e1[1] * e2[2] - e1[2] * e2[1], fz = e1[0] * e2[1] - e1[1] * e2[0];
    if (fx * nx + fz * nz > 0) { tri(A, B, Cc, n); tri(A, Cc, D, n); } else { tri(A, Cc, B, n); tri(A, D, Cc, n); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// Granite kerb along the quarter arc of a rounded block corner: arc centre (cx, cz), the corner
// lies towards (sx, sz). Short straight stones, like a real set kerb.
function kerbArc(S, cx, cz, sx, sz) {
  const a0 = sx > 0 ? 0 : Math.PI;
  let d = (sz > 0 ? Math.PI / 2 : -Math.PI / 2) - a0;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const n = 8, rr = KR - 0.09, L = 2 * rr * Math.sin(Math.abs(d) / (2 * n)) + 0.03;
  S.use('concrete');
  for (let k = 0; k < n; k++) {
    const a = a0 + d * (k + 0.5) / n;
    S.box(C.granite, cx + Math.cos(a) * rr, (CURB + 0.005 - 0.05) / 2, cz + Math.sin(a) * rr, L, CURB + 0.055, 0.18, -a - Math.PI / 2);
  }
}

// Bus stop: glass shelter (own tinted-glass mesh), bench, timetable, sign with the stop's name.
function busStop(b, chunk, glassG) {
  const s = { axis: b.axis, c: b.c, dir: b.dir };
  const yaw = faceRoad(s);
  const [x, z] = xzArr(b.axis, b.c, b.a, b.dir * (RHW + SW - 0.95));
  const { S } = chunk(x, z);
  // Shelter: the roof is cantilevered from two back posts (open front, nothing in the walking
  // line along the sidewalk); back glass and half-depth side screens.
  const W = 3.6, Dp = 1.5, H = 2.3;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  S.use('metal');
  for (const lx of [-W / 2, W / 2]) { const [px, pz] = L(lx, -Dp / 2); S.boxB(0x5a5e62, px, CURB, pz, 0.09, H + 0.1, 0.09, yaw); const [qx, qz] = L(lx, -0.1); S.box(0x5a5e62, qx, CURB + H - 0.06, qz, 0.07, 0.1, Dp + 0.3, yaw); }
  { const [px, pz] = L(0, -0.05); metalRoof(new Frame(S, null, px, pz, yaw), 0x4a4e52, 0, CURB + H + 0.06, 0, W + 0.35, Dp + 0.45, 0.04, 0, { fascia: 0x4a4e52, fh: 0.14 }); }
  { const [px, pz] = L(0, -Dp / 2 + 0.25); S.use('wood').boxB(0x7a5a3e, px, CURB + 0.45, pz, W - 0.6, 0.05, 0.36, yaw); S.use('metal').boxB(0x5a5e62, px, CURB, pz, W - 0.8, 0.45, 0.05, yaw); }
  { const [px, pz] = L(0, -Dp / 2); glassG.boxB(null, px, CURB + 0.15, pz, W - 0.1, H - 0.25, 0.03, yaw); }
  for (const sx of [-1, 1]) { const [px, pz] = L(sx * W / 2, -Dp / 4); glassG.boxB(null, px, CURB + 0.15, pz, 0.03, H - 0.25, Dp / 2 - 0.05, yaw); }
  { const [px, pz] = L(W / 2 - 0.35, -Dp / 2 + 0.06); addSign(textFace('Linje 2  Centrum\n06.12  06.32  06.52\n07.12  07.32  07.52', 0.6, 0.42, { ppm: 300, scale: 0.8, weight: '500', bg: '#f4f2ea' }), px, CURB + 1.5, pz, 0.6, 0.42, yaw); }
  // Colliders: the back posts and wall, the side screens.
  for (const lx of [-W / 2, W / 2]) { const [px, pz] = L(lx, -Dp / 2); circle(px, pz, 0.1, 99, 'pole'); const [qx, qz] = L(lx, -Dp / 4); circle(qx, qz, 0.18, CURB + 2.3, 'shelter'); }
  for (let k = -2; k <= 2; k++) { const [px, pz] = L(k * 0.7, -Dp / 2); circle(px, pz, 0.25, CURB + 2.3, 'shelter'); }
  // Stop sign on its post beside the shelter.
  const [sx, sz] = xzArr(b.axis, b.c, b.a - 3.4, b.dir * (RHW + 0.75));
  signPost(S, sx, sz, yaw, [{ f: picto('bus'), w: 0.56, h: 0.56 }, { f: textFace(b.name, 0.56, 0.16, { ppm: 300, scale: 0.78, bg: '#f4f2ea' }), w: 0.56, h: 0.16 }], { top: 2.75 });
  // Litter bin and some litter.
  const [px, pz] = L(W / 2 + 0.7, -0.5);
  S.use('painted').cyl(0x2e3e34, px, CURB + 0.7, pz, 0.2, 0.5, 10);
  S.use('painted').boxB(0x2a2e2c, px, CURB, pz, 0.06, 0.95, 0.06);
  circle(px, pz, 0.22, CURB + 1.0, 'bin');
  for (let k = 0; k < 3; k++) { const [lx, lz] = L(R(-2.5, 2.5, r), R(1.0, 1.6, r)); litterSpots.push([lx, CURB + 0.05, lz]); }
  if (b.lm) {
    const [lx, lz] = L(-W / 2 - 1.2, 0.9);
    landmarks[b.lm] = { x: lx, z: lz, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
  }
}
