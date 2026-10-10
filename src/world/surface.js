// What the ground is made of where you stand or drive: surfaceAt(x, z) -> 'snow' | 'asphalt' |
// 'paving' | 'gravel' (car grip, skid marks, footsteps). Every flat piece of ground the town builds
// (Frame.flat, the sidewalks, the block slabs) registers its footprint here with its surface and
// height; the highest one containing the point wins. Snow banks and plowed piles register on top
// (you wade through them). Off the grid it is snow.

import { isRoad, HALF, RHW } from './layout.js';

const CAT = { asphalt: 'asphalt', marking: 'asphalt', paving: 'paving', concrete: 'paving', plain: 'paving', gravel: 'gravel', grass: 'snow', snow: 'snow', hillside: 'snow', ice: 'snow', wood: 'paving' };
const CELL = 8;
const grid = new Map();
const key = (i, j) => (i + 512) * 1024 + (j + 512);

// A rectangle w (along its local x) by d (local z), centred at (x, z), turned by yaw (Frame
// convention: local +x -> (cos yaw, -sin yaw)), top at y.
export function addGround(surface, x, z, w, d, yaw = 0, y = 0) {
  const s = CAT[surface];
  if (!s) return;
  const c = Math.cos(yaw), sn = Math.sin(yaw), hw = w / 2, hd = d / 2;
  const ex = Math.abs(c) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(c) * hd;
  const e = { x, z, c, s: sn, hw, hd, y, surf: s };
  for (let i = Math.floor((x - ex) / CELL); i <= Math.floor((x + ex) / CELL); i++) {
    for (let j = Math.floor((z - ez) / CELL); j <= Math.floor((z + ez) / CELL); j++) {
      const k = key(i, j);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(e);
    }
  }
}
// A disc (plowed piles).
export function addGroundCircle(surface, x, z, r, y = 1) { addGround(surface, x, z, 1.6 * r, 1.6 * r, 0, y); }

export function surfaceAt(x, z) {
  const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  let best = null, by = -1e9;
  if (l) {
    for (const e of l) {
      if (e.y <= by) continue;
      const dx = x - e.x, dz = z - e.z;
      const lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c;
      if (Math.abs(lx) <= e.hw && Math.abs(lz) <= e.hd) { best = e.surf; by = e.y; }
    }
  }
  if (best) return best;
  if (isRoad(x, z)) return 'asphalt';
  if (Math.abs(x) > HALF + RHW || Math.abs(z) > HALF + RHW) return 'snow';
  return 'paving';
}
