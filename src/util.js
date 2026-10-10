export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent exponential approach of a towards b.
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const angleDiff = (a, b) => wrapAngle(b - a);
export const dampAngle = (a, b, k, dt) => a + angleDiff(a, b) * (1 - Math.exp(-k * dt));

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
export const randRange = (a, b, r = Math.random) => a + (b - a) * r();
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// Forward vector for a yaw angle, matching three.js rotation.y applied to a +Z-facing model.
export const fwdX = (yaw) => Math.sin(yaw);
export const fwdZ = (yaw) => Math.cos(yaw);
export const yawTo = (dx, dz) => Math.atan2(dx, dz);
