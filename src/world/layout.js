// The suburb's street grid: N x N blocks between N+1 roads each way, plus the road graph that
// traffic, chasers and the waypoint arrow all route over. Right-hand traffic: a car heading
// (dx, dz) drives LANE metres to its right, right = (-dz, dx).

export const P = 80;          // road pitch (centre to centre)
export const N = 7;           // blocks per side
export const HALF = (P * N) / 2;
export const RHW = 5.5;       // asphalt half-width
export const SW = 3.5;        // sidewalk width
export const LANE = 2.75;     // lane centre offset from the road centre line
export const CURB = 0.15;     // everything off the asphalt sits this high
export const EDGE = HALF + RHW + SW; // outer edge of the outermost sidewalk
export const BOUND = HALF + 34;      // invisible wall beyond the trees

export const rc = (i) => i * P - HALF;

export function blockInterior(i, j) {
  return { x0: rc(i) + RHW + SW, x1: rc(i + 1) - RHW - SW, z0: rc(j) + RHW + SW, z1: rc(j + 1) - RHW - SW };
}
export function blockAt(x, z) {
  const i = Math.floor((x + HALF) / P), j = Math.floor((z + HALF) / P);
  if (i < 0 || j < 0 || i >= N || j >= N) return null;
  return { i, j };
}

// Distance from the nearest road centre line along each axis (or Infinity off-grid).
function offAxis(v, other) {
  if (Math.abs(other) > HALF + RHW) return Infinity;
  if (v < -HALF - RHW || v > HALF + RHW) return Infinity;
  const m = (((v + HALF) % P) + P) % P;
  return Math.min(m, P - m);
}
export const KR = 5;          // kerb radius at the junction corners (the block slabs are rounded)
export function isRoad(x, z) {
  const ox = offAxis(x, z), oz = offAxis(z, x);
  if (ox <= RHW || oz <= RHW) return true;
  // Rounded kerb corners: next to a junction, inside the grid, the corner square is road outside
  // the kerb arc (centre RHW + KR from both road centre lines).
  if (ox < RHW + KR && oz < RHW + KR && Math.abs(x) < HALF && Math.abs(z) < HALF) {
    const dx = RHW + KR - ox, dz = RHW + KR - oz;
    return dx * dx + dz * dz > KR * KR;
  }
  return false;
}
export function baseGround(x, z) {
  return isRoad(x, z) ? 0 : CURB;
}

// Block types (see DESIGN.md section 6). j = 0 is the north edge (-z), i = 0 the west edge (-x).
// Ove's radhusområde is the centre block (3, 3), whose interior is centred on the origin.
//                 i=0          1             2            3             4             5            6
export const MAP = [
  ['forest',   'villa',      'villa',      'field',      'radhus',     'villa',      'forest'],  // j=0 north
  ['villa',    'apartments', 'preschool',  'radhus',     'apartments', 'hospital',   'villa'],   // j=1
  ['radhus',   'villa',      'centrum',    'apartments', 'kommun',     'apartments', 'villa'],   // j=2
  ['gas',      'radhus',     'radhus',     'ove',        'park',       'radhus',     'villa'],   // j=3
  ['villa',    'apartments', 'villa',      'radhus',     'villa',      'villa',      'dealer'],  // j=4
  ['church',   'villa',      'radhus',     'villa',      'apartments', 'radhus',     'forest'],  // j=5
  ['cemetery', 'forest',     'villa',      'radhus',     'villa',      'forest',     'forest'],  // j=6 south
];
export const blockType = (i, j) => MAP[j][i];

// --------------------------------------------------------------------------------------------
// Road graph. Node id = j*(N+1)+i, at road intersections.

export const NN = N + 1;
export const nodeId = (i, j) => j * NN + i;
export const nodeI = (id) => id % NN;
export const nodeJ = (id) => Math.floor(id / NN);
export const nodeX = (id) => rc(id % NN);
export const nodeZ = (id) => rc(Math.floor(id / NN));

export function neighbors(id) {
  const i = nodeI(id), j = nodeJ(id), out = [];
  if (i > 0) out.push(nodeId(i - 1, j));
  if (i < N) out.push(nodeId(i + 1, j));
  if (j > 0) out.push(nodeId(i, j - 1));
  if (j < N) out.push(nodeId(i, j + 1));
  return out;
}

export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(N, Math.round((x + HALF) / P)));
  const j = Math.max(0, Math.min(N, Math.round((z + HALF) / P)));
  return nodeId(i, j);
}

// Shortest node path. The grid is complete so this is just a Manhattan staircase, but we take
// the BFS anyway so a blocked road can be modelled later.
export function findPath(a, b, blocked = null) {
  if (a === b) return [a];
  const prev = new Map([[a, -1]]);
  const q = [a];
  while (q.length) {
    const n = q.shift();
    if (n === b) break;
    const nb = neighbors(n);
    for (let k = nb.length - 1; k > 0; k--) { const r = (Math.random() * (k + 1)) | 0; [nb[k], nb[r]] = [nb[r], nb[k]]; }
    for (const m of nb) {
      if (prev.has(m) || (blocked && blocked.has(m))) continue;
      prev.set(m, n);
      q.push(m);
    }
  }
  if (!prev.has(b)) return [a];
  const path = [];
  for (let n = b; n !== -1; n = prev.get(n)) path.push(n);
  return path.reverse();
}

// Nodes at the corners of the grid cell holding (x,z), for routing from mid-block.
export function cellCorners(x, z) {
  const i = Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / P)));
  const j = Math.max(0, Math.min(N - 1, Math.floor((z + HALF) / P)));
  return [nodeId(i, j), nodeId(i + 1, j), nodeId(i, j + 1), nodeId(i + 1, j + 1)];
}

// Where to steer someone at (x,z) heading for (tx,tz): the next intersection along a shortest
// road route, or the target itself once it's close or on the same stretch of road.
export function routeAim(x, z, tx, tz) {
  const d = Math.hypot(tx - x, tz - z);
  if (d < 45) return { x: tx, z: tz, nodes: [] };
  const tn = nearestNode(tx, tz);
  let best = null, bestCost = Infinity;
  for (const c of cellCorners(x, z)) {
    const cx = nodeX(c), cz = nodeZ(c);
    const cost = Math.hypot(cx - x, cz - z) + (Math.abs(nodeI(c) - nodeI(tn)) + Math.abs(nodeJ(c) - nodeJ(tn))) * P + Math.hypot(nodeX(tn) - tx, nodeZ(tn) - tz);
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  const nodes = manhattanPath(best, tn, x, z);
  let k = 0;
  while (k < nodes.length - 1 && Math.hypot(nodeX(nodes[k]) - x, nodeZ(nodes[k]) - z) < 14) k++;
  if (k >= nodes.length - 1 && Math.hypot(nodeX(nodes[k]) - x, nodeZ(nodes[k]) - z) < 14) return { x: tx, z: tz, nodes };
  return { x: nodeX(nodes[k]), z: nodeZ(nodes[k]), nodes: nodes.slice(k) };
}

// Staircase path preferring to travel first along the axis we're already lined up with.
function manhattanPath(a, b, x, z) {
  const out = [a];
  let i = nodeI(a), j = nodeJ(a);
  const bi = nodeI(b), bj = nodeJ(b);
  const firstI = Math.abs(nodeZ(a) - z) < Math.abs(nodeX(a) - x);
  const stepI = () => { while (i !== bi) { i += Math.sign(bi - i); out.push(nodeId(i, j)); } };
  const stepJ = () => { while (j !== bj) { j += Math.sign(bj - j); out.push(nodeId(i, j)); } };
  if (firstI) { stepI(); stepJ(); } else { stepJ(); stepI(); }
  return out;
}

// Landmarks are filled in by the town builder: name -> { x, z, yaw }.
export const landmarks = {};
export function lm(name) {
  const l = landmarks[name];
  if (!l) throw new Error('unknown landmark ' + name);
  return l;
}

// Car-free areas (the inside of Ove's radhusområde): rectangles { x0, z0, x1, z1 } filled in by
// the town builder. Driving a car in here costs Ordning.
export const carFreeZones = [];
export function isCarFree(x, z) {
  for (const r of carFreeZones) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  return false;
}
