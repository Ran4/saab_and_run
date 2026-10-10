// Static solids for a mostly-flat town. Every solid is a 2D footprint (axis-aligned box, circle
// or oriented "ramp" box) with a top height. Whether it's a wall or a floor depends on who asks:
// if its top at the contact is within your step height you stand on it, otherwise it stops you.

import { baseGround } from './layout.js';

export const BOX = 0, CIRCLE = 1, RAMP = 2;
const CELL = 16;
const grid = new Map();
export const blocks = [];
let stamp = 0;

const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

function bounds(b) {
  if (b.shape === BOX) { b.bx0 = b.minX; b.bx1 = b.maxX; b.bz0 = b.minZ; b.bz1 = b.maxZ; }
  else if (b.shape === CIRCLE) { b.bx0 = b.x - b.r; b.bx1 = b.x + b.r; b.bz0 = b.z - b.r; b.bz1 = b.z + b.r; }
  else {
    const ex = Math.abs(b.fx) * b.hz + Math.abs(b.fz) * b.hx, ez = Math.abs(b.fz) * b.hz + Math.abs(b.fx) * b.hx;
    b.bx0 = b.x - ex; b.bx1 = b.x + ex; b.bz0 = b.z - ez; b.bz1 = b.z + ez;
  }
}

export function addBlock(b) {
  b.dead = false;
  b._s = 0;
  bounds(b);
  for (let cx = Math.floor(b.bx0 / CELL); cx <= Math.floor(b.bx1 / CELL); cx++) {
    for (let cz = Math.floor(b.bz0 / CELL); cz <= Math.floor(b.bz1 / CELL); cz++) {
      const k = key(cx, cz);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(b);
    }
  }
  blocks.push(b);
  return b;
}

export const box = (minX, minZ, maxX, maxZ, top, kind = 'solid', ref = null) =>
  addBlock({ shape: BOX, minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), top, kind, ref });
export const circle = (x, z, r, top, kind = 'solid', ref = null) => addBlock({ shape: CIRCLE, x, z, r, top, kind, ref });
// A ramp rising along yaw: height h0 at the back edge to h1 at the front edge.
export const ramp = (x, z, yaw, width, length, h0, h1, kind = 'ramp') =>
  addBlock({ shape: RAMP, x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), hx: width / 2, hz: length / 2, h0, h1, top: Math.max(h0, h1), kind });

export function queryBlocks(minX, minZ, maxX, maxZ, out) {
  out.length = 0;
  stamp++;
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const l = grid.get(key(cx, cz));
      if (!l) continue;
      for (let n = 0; n < l.length; n++) {
        const b = l[n];
        if (b.dead || b._s === stamp) continue;
        b._s = stamp;
        if (b.bx1 < minX || b.bx0 > maxX || b.bz1 < minZ || b.bz0 > maxZ) continue;
        out.push(b);
      }
    }
  }
  return out;
}

export function contains(b, x, z) {
  if (b.shape === BOX) return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  if (b.shape === CIRCLE) return (x - b.x) ** 2 + (z - b.z) ** 2 <= b.r * b.r;
  const dx = x - b.x, dz = z - b.z;
  const lz = dx * b.fx + dz * b.fz, lx = dx * -b.fz + dz * b.fx;
  return Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz;
}

export function topAt(b, x, z) {
  if (b.shape !== RAMP) return b.top;
  const lz = (x - b.x) * b.fx + (z - b.z) * b.fz;
  const t = Math.max(0, Math.min(1, (lz + b.hz) / (2 * b.hz)));
  return b.h0 + (b.h1 - b.h0) * t;
}

// Highest floor under (x,z) that someone at height y with the given step could stand on.
// groundInfo.block is left pointing at the block providing it (null for bare ground).
export const groundInfo = { block: null };
export function groundAt(x, z, y, step) {
  let g = baseGround(x, z);
  groundInfo.block = null;
  const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (l) {
    for (let n = 0; n < l.length; n++) {
      const b = l[n];
      if (b.dead || b.noFloor) continue;
      if (!contains(b, x, z)) continue;
      const h = topAt(b, x, z);
      if (h > g && h <= y + step) { g = h; groundInfo.block = b; }
    }
  }
  return g;
}

// --------------------------------------------------------------------------------------------
// Circle (people, coins) against a block. Fills out.nx/nz (push direction) and out.depth.

export function circleVsBlock(x, z, r, b, out) {
  if (b.shape === BOX) {
    const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
    const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 > r * r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      out.nx = dx / d; out.nz = dz / d; out.depth = r - d;
    } else {
      const l = x - b.minX, rr = b.maxX - x, t = z - b.minZ, bt = b.maxZ - z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) { out.nx = -1; out.nz = 0; } else if (m === rr) { out.nx = 1; out.nz = 0; } else if (m === t) { out.nx = 0; out.nz = -1; } else { out.nx = 0; out.nz = 1; }
      out.depth = m + r;
    }
    out.cx = cx; out.cz = cz;
    return true;
  }
  if (b.shape === CIRCLE) {
    const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz, R = r + b.r;
    if (d2 > R * R) return false;
    const d = Math.sqrt(d2) || 1e-6;
    out.nx = dx / d; out.nz = dz / d; out.depth = R - d;
    out.cx = b.x + out.nx * b.r; out.cz = b.z + out.nz * b.r;
    return true;
  }
  // Oriented box: work in its local frame (right = (fz,-fx)... any perpendicular will do).
  const rx = -b.fz, rz = b.fx;
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * rx + dz * rz, lz = dx * b.fx + dz * b.fz;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
  let nlx = lx - qx, nlz = lz - qz;
  const d2 = nlx * nlx + nlz * nlz;
  if (d2 > r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nlx /= d; nlz /= d; out.depth = r - d;
  } else {
    const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; out.depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; out.depth = pz + r; }
  }
  out.nx = nlx * rx + nlz * b.fx;
  out.nz = nlx * rz + nlz * b.fz;
  out.cx = b.x + qx * rx + qz * b.fx;
  out.cz = b.z + qx * rz + qz * b.fz;
  return true;
}

// --------------------------------------------------------------------------------------------
// Oriented box (cars) against blocks and each other, by separating axes.
// An OBB is { x, z, fx, fz, hx, hz } with forward (fx,fz), half-width hx, half-length hz.

const _corners = new Float64Array(8);
function obbCorners(o, arr) {
  const rx = -o.fz, rz = o.fx;
  let k = 0;
  for (const sf of [1, -1]) for (const sr of [1, -1]) {
    arr[k++] = o.x + o.fx * o.hz * sf + rx * o.hx * sr;
    arr[k++] = o.z + o.fz * o.hz * sf + rz * o.hx * sr;
  }
  return arr;
}

// Average of the OBB corners furthest along direction (dx,dz).
function support(o, dx, dz, out) {
  obbCorners(o, _corners);
  let best = -Infinity;
  for (let k = 0; k < 4; k++) best = Math.max(best, _corners[k * 2] * dx + _corners[k * 2 + 1] * dz);
  let sx = 0, sz = 0, n = 0;
  for (let k = 0; k < 4; k++) {
    if (_corners[k * 2] * dx + _corners[k * 2 + 1] * dz > best - 0.12) { sx += _corners[k * 2]; sz += _corners[k * 2 + 1]; n++; }
  }
  out.cx = sx / n; out.cz = sz / n;
}

const _axes = new Float64Array(8);
function satBox(o, cx, cz, ex, ez, axes, nAxes, out) {
  // Box given as centre + half-extents along world axes (ex, ez) if axes are world-aligned,
  // or as another OBB when ez < 0 (then ex is that OBB).
  let minO = Infinity, nx = 0, nz = 0;
  const rx = -o.fz, rz = o.fx;
  const dx = o.x - cx, dz = o.z - cz;
  for (let k = 0; k < nAxes; k++) {
    const ax = axes[k * 2], az = axes[k * 2 + 1];
    const ro = o.hz * Math.abs(ax * o.fx + az * o.fz) + o.hx * Math.abs(ax * rx + az * rz);
    let rb;
    if (ez >= 0) rb = ex * Math.abs(ax) + ez * Math.abs(az);
    else {
      const p = ex, prx = -p.fz, prz = p.fx;
      rb = p.hz * Math.abs(ax * p.fx + az * p.fz) + p.hx * Math.abs(ax * prx + az * prz);
    }
    const d = dx * ax + dz * az;
    const ov = ro + rb - Math.abs(d);
    if (ov <= 0) return false;
    if (ov < minO) { minO = ov; const s = d < 0 ? -1 : 1; nx = ax * s; nz = az * s; }
  }
  out.nx = nx; out.nz = nz; out.depth = minO;
  return true;
}

export function obbVsBlock(o, b, out) {
  if (b.shape === CIRCLE) {
    const rx = -o.fz, rz = o.fx;
    const dx = b.x - o.x, dz = b.z - o.z;
    const lx = dx * rx + dz * rz, lz = dx * o.fx + dz * o.fz;
    const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
    let nlx = lx - qx, nlz = lz - qz;
    const d2 = nlx * nlx + nlz * nlz;
    if (d2 > b.r * b.r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nlx /= d; nlz /= d; out.depth = b.r - d;
    } else {
      const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
      if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; out.depth = px + b.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; out.depth = pz + b.r; }
    }
    // Normal pushes the OBB away from the circle.
    out.nx = -(nlx * rx + nlz * o.fx);
    out.nz = -(nlx * rz + nlz * o.fz);
    out.cx = o.x + qx * rx + qz * o.fx;
    out.cz = o.z + qx * rz + qz * o.fz;
    return true;
  }
  const rx = -o.fz, rz = o.fx;
  if (b.shape === BOX) {
    _axes[0] = 1; _axes[1] = 0; _axes[2] = 0; _axes[3] = 1;
    _axes[4] = o.fx; _axes[5] = o.fz; _axes[6] = rx; _axes[7] = rz;
    if (!satBox(o, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2, _axes, 4, out)) return false;
  } else {
    _axes[0] = b.fx; _axes[1] = b.fz; _axes[2] = -b.fz; _axes[3] = b.fx;
    _axes[4] = o.fx; _axes[5] = o.fz; _axes[6] = rx; _axes[7] = rz;
    if (!satBox(o, b.x, b.z, b, -1, _axes, 4, out)) return false;
  }
  support(o, -out.nx, -out.nz, out);
  return true;
}

export function obbVsObb(a, b, out) {
  _axes[0] = a.fx; _axes[1] = a.fz; _axes[2] = -a.fz; _axes[3] = a.fx;
  _axes[4] = b.fx; _axes[5] = b.fz; _axes[6] = -b.fz; _axes[7] = b.fx;
  if (!satBox(a, b.x, b.z, b, -1, _axes, 4, out)) return false;
  // Contact: midway between the two deepest features.
  support(a, -out.nx, -out.nz, out);
  const ax = out.cx, az = out.cz;
  support(b, out.nx, out.nz, out);
  out.cx = (out.cx + ax) / 2; out.cz = (out.cz + az) / 2;
  return true;
}

export function circleVsObb(x, z, r, o, out) {
  const rx = -o.fz, rz = o.fx;
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * rx + dz * rz, lz = dx * o.fx + dz * o.fz;
  const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
  let nlx = lx - qx, nlz = lz - qz;
  const d2 = nlx * nlx + nlz * nlz;
  if (d2 > r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nlx /= d; nlz /= d; out.depth = r - d;
  } else {
    const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; out.depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; out.depth = pz + r; }
  }
  out.nx = nlx * rx + nlz * o.fx;
  out.nz = nlx * rz + nlz * o.fz;
  return true;
}

// Is the straight segment from a to b (at height y) blocked by anything taller than y?
const _segOut = [];
export function segmentBlocked(ax, az, bx, bz, y, ignoreKind = 'prop') {
  queryBlocks(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), _segOut);
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(len / 0.8));
  for (const b of _segOut) {
    if (b.kind === ignoreKind || b.top < y) continue;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (contains(b, ax + (bx - ax) * t, az + (bz - az) * t)) return t;
    }
  }
  return -1;
}
