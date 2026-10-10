// Breakable street furniture of a Swedish suburb: mailboxes, wheelie bins, litter bins,
// kicksleds, bikes, benches, planters, snowmen, fences... Each type is one instanced mesh.
// Smash one with a car or a kick and it bursts into debris (and kronor: `coins`).
// Type fields: r (circle footprint) or w/d (box footprint; yaw in multiples of 90 deg), top,
// coins, shame (Ordning cost weight), minSpeed (car speed needed to break it), color (debris).

import { THREE, GeoBuilder, MAT, mat, realMaterials, surfaceMaterial, ensureSurfaceAttributes, PRIM } from '../gfx.js';
import { box, circle } from './collision.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// (round 6) Packed snow, rolled by children: a lumpy ball (radius r, about +-8 % in and out, no two
// alike) with a flattened underside where it was set down (flat: how far below the centre, in
// units of r). Welded and smooth-shaded.
function snowBall(r, seed, flat = 0) {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.055 * Math.sin(x * 2.9 + seed) * Math.sin(y * 2.6 + seed * 1.7) + 0.04 * Math.sin(z * 4.1 + y * 2.3 + seed * 2.3) + 0.025 * Math.sin(x * 6.7 + z * 5.9 + seed * 3.1);
    x *= n; y *= n; z *= n;
    if (flat && y < -flat) y = -flat + (y + flat) * 0.12;
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.computeVertexNormals();
  return g;
}
// Tint the last part's vertex colours by f(x, y, z) -> [r, g, b] multipliers.
function tintLast(g, f) {
  const p = g.parts[g.parts.length - 1], pos = p.attributes.position, col = p.attributes.color;
  for (let i = 0; i < pos.count; i++) { const k = f(pos.getX(i), pos.getY(i), pos.getZ(i)); col.setXYZ(i, col.getX(i) * k[0], col.getY(i) * k[1], col.getZ(i) * k[2]); }
}
// (round 6) A spruce bough (granris) seen from above, along +x from its cut end: a stem with
// pairs of needled side shoots angled forwards (thin triangles facing up; nobody sees a planter's
// boughs from below), shorter towards the tip, drooping a little. Length 1 (scaled when placed).
let _bough = null;
function boughGeo() {
  if (_bough) return _bough;
  const pos = [], nrm = [];
  const tri = (a, b, c) => {
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    pos.push(...a, ...(up >= 0 ? b : c), ...(up >= 0 ? c : b)); nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };
  tri([0, 0, -0.018], [1, -0.03, 0], [0, 0, 0.018]);
  for (let k = 0; k < 11; k++) {
    const x = 0.06 + k * 0.085, s = 1 - k / 12;
    for (const sd of [-1, 1]) {
      const l = (0.16 + 0.06 * Math.sin(k * 1.9 + sd)) * (0.45 + 0.55 * s) + 0.05, y = -0.03 * x;
      tri([x - 0.045, y, 0], [x + l * 0.55, y - 0.015, sd * l], [x + 0.045, y, 0]);
      tri([x + 0.01, y + 0.004, 0], [x + l * 0.75, y - 0.01, sd * l * 0.7], [x + 0.07, y + 0.004, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return (_bough = g);
}

let _thinTorus = null;
const thinTorus = () => (_thinTorus ??= new THREE.TorusGeometry(0.5, 0.03, 4, 16));

const TYPES = {
  // Villa mailbox on a post (brevlåda).
  mailbox: {
    r: 0.3, top: 1.35, coins: 2, shame: 1, color: 0x3f4e45,
    build(g) {
      g.use('painted').boxB(0x2e3230, 0, 0, 0, 0.08, 1.05, 0.08);
      g.box(0x2e3230, 0, 1.0, 0, 0.12, 0.05, 0.36);
      g.boxB(0x3f4e45, 0, 1.03, 0, 0.32, 0.2, 0.46);
      g.cyl(0x3f4e45, 0, 1.23, 0, 0.16, 0.46, 12, Math.PI / 2);
      g.box(0xe8e6de, 0, 1.14, 0.235, 0.18, 0.06, 0.01);
      g.use('metal').box(0x9a9da0, 0.17, 1.2, 0.12, 0.02, 0.06, 0.06);
    },
  },
  // Postlådeställ: a stand with six mailboxes (radhusområden, apartments).
  mailrow: {
    w: 2.5, d: 0.6, top: 1.55, coins: 4, shame: 2, minSpeed: 3, color: 0x4a5a6a,
    build(g) {
      g.use('metal');
      for (const x of [-1.15, 1.15]) g.boxB(0x7a7e82, x, 0, 0, 0.07, 1.4, 0.07);
      g.box(0x7a7e82, 0, 0.88, -0.05, 2.4, 0.05, 0.05);
      g.use('painted');
      for (let k = 0; k < 6; k++) {
        const x = -0.95 + k * 0.38;
        g.boxB(0x48586a, x, 0.92, 0, 0.34, 0.3, 0.42);
        g.cyl(0x48586a, x, 1.22, 0, 0.17, 0.42, 10, Math.PI / 2);
        g.box(0xe8e6de, x, 1.04, 0.215, 0.16, 0.05, 0.01);
      }
      // (a painted sheet: a ribbed 'metalroof' slab this thin shows its ribs on the edge as a barcode)
      g.use('painted').box(0x34383c, 0, 1.5, 0, 2.6, 0.04, 0.7, 0, 0.12);
      g.box(0x2a2e32, 0, 1.457, 0.36, 2.62, 0.08, 0.025, 0, 0.12);
    },
  },
  // Green wheelie bin (soptunna, 240 l).
  trashcan: {
    r: 0.4, top: 1.1, coins: 1, shame: 1, color: 0x2f5a3a,
    build(g) {
      g.use('plastic');
      g.boxB(0x2f5236, 0, 0.06, 0, 0.58, 0.92, 0.7);
      g.box(0x2a4630, 0, 1.01, 0.02, 0.62, 0.05, 0.78);
      g.box(0x263e2b, 0, 0.95, -0.37, 0.5, 0.05, 0.05);
      g.use('rubber');
      for (const x of [-0.24, 0.24]) g.cyl(0x1c1c1e, x, 0.1, -0.3, 0.1, 0.06, 10, 0, 0, Math.PI / 2);
    },
  },
  // Litter bin on a post (papperskorg).
  papperskorg: {
    r: 0.26, top: 1.05, coins: 1, shame: 1, color: 0x2e3e34,
    build(g) {
      g.use('painted');
      g.boxB(0x2a2e2c, 0, 0, -0.22, 0.07, 1.0, 0.07);
      g.cyl(0x2e3e34, 0, 0.72, 0, 0.21, 0.5, 12);
      g.cyl(0x283630, 0, 0.98, 0, 0.23, 0.04, 12);
      g.use('rubber').cyl(0x141414, 0, 0.97, 0, 0.17, 0.02, 12);
    },
  },
  // Sparkstötting (kicksled).
  kicksled: {
    w: 0.5, d: 1.6, top: 1.0, coins: 0, shame: 1, minSpeed: 2, color: 0x8a2a22,
    build(g) {
      g.use('metal');
      for (const x of [-0.2, 0.2]) {
        g.box(0x8a8e92, x, 0.03, -0.1, 0.025, 0.02, 1.5);
        g.box(0x8a8e92, x, 0.07, 0.68, 0.025, 0.02, 0.18, 0, -0.5);
      }
      g.use('painted');
      for (const x of [-0.17, 0.17]) {
        g.box(0x8a2a22, x, 0.55, -0.48, 0.03, 1.0, 0.03, 0, -0.18);
        g.box(0x8a2a22, x, 0.27, 0.12, 0.03, 0.52, 0.03, 0, 0.12);
      }
      g.cyl(0x8a2a22, 0, 1.02, -0.57, 0.018, 0.5, 6, 0, 0, Math.PI / 2);
      g.use('wood').box(0x9a6a40, 0, 0.55, 0.1, 0.36, 0.03, 0.38);
      g.box(0x9a6a40, 0, 0.7, -0.08, 0.36, 0.25, 0.03, 0, -0.2);
    },
  },
  // Parked bicycle: thin wheels with spokes suggested by a hub, a slim frame of tubes.
  bike: {
    w: 0.45, d: 1.75, top: 1.05, coins: 0, shame: 1, minSpeed: 2, color: 0x2a3448,
    build(g) {
      g.use('rubber');
      for (const z of [-0.53, 0.53]) g.add(thinTorus(), 0x1a1a1a, mat(0, 0.34, z, 0, Math.PI / 2, 0, 0.66, 0.66, 0.66));
      g.use('metal');
      for (const z of [-0.53, 0.53]) g.cyl(0x9a9da0, 0, 0.34, z, 0.03, 0.08, 6, 0, 0, Math.PI / 2);
      g.use('painted');
      const c = 0x2a3448, t = (x0, y0, z0, x1, y1, z1, r = 0.014) => { const L = Math.hypot(y1 - y0, z1 - z0); g.add(PRIM.cyl(6), c, mat(0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0), 0, 0, r * 2, L, r * 2)); };
      t(0, 0.36, -0.08, 0, 0.82, -0.26);    // seat tube
      t(0, 0.36, -0.08, 0, 0.74, 0.38);     // down tube
      t(0, 0.8, -0.24, 0, 0.78, 0.36);      // top tube
      t(0, 0.36, -0.08, 0, 0.34, -0.53, 0.011);  // chain stay
      t(0, 0.8, -0.24, 0, 0.34, -0.53, 0.011);   // seat stay
      t(0, 0.86, 0.4, 0, 0.34, 0.53, 0.013);     // fork
      g.use('leather').box(0x1e1a18, 0, 0.88, -0.27, 0.1, 0.05, 0.22);
      g.use('metal').cyl(0x8a8e92, 0, 0.95, 0.42, 0.012, 0.5, 6, 0, 0, Math.PI / 2);
      g.box(0x8a8e92, 0, 0.5, -0.5, 0.1, 0.012, 0.42);
    },
  },
  // Park bench: dark green cast ends, wooden slats.
  bench: {
    w: 1.8, d: 0.7, top: 0.5, coins: 1, shame: 1, minSpeed: 4, color: 0x5a4632,
    build(g) {
      g.use('painted');
      for (const x of [-0.8, 0.8]) { g.boxB(0x2a3a30, x, 0, 0, 0.07, 0.44, 0.55); g.box(0x2a3a30, x, 0.68, -0.27, 0.06, 0.5, 0.06, 0, -0.18); }
      g.use('wood');
      for (let k = 0; k < 3; k++) g.boxB(0x6e5238, 0, 0.44, -0.16 + k * 0.17, 1.8, 0.05, 0.14);
      for (let k = 0; k < 2; k++) g.box(0x6e5238, 0, 0.62 + k * 0.17, -0.3 - k * 0.03, 1.8, 0.11, 0.04, 0, -0.18);
    },
  },
  // Concrete planter with spruce twigs (granris) for the winter.
  // (round 6: a cushion of snow on the soil with the boughs' needled tips sticking out from under it
  // and over the rim; round 5's nine dark capsules read as someone lying on the block)
  planter: {
    w: 1.1, d: 0.6, top: 0.6, coins: 1, shame: 1, minSpeed: 4, color: 0x8a8884,
    build(g) {
      g.use('concrete').boxB(0x9a9894, 0, 0, 0, 1.1, 0.45, 0.6);
      // dark soil under the boughs, then two layers of boughs: long ones radiating from the middle
      // over the rim, shorter ones on top at odd angles; snow lies in a few soft drifts on them
      g.use('foliage', { snow: 0 }).box(0x26301f, 0, 0.452, 0, 1.0, 0.012, 0.5);
      // (no shader snow on the boughs: flat ones turned white all over; the drifts below are the snow)
      g.use('foliage', { snow: 0 });
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + Math.sin(k * 2.3) * 0.12, ca = Math.cos(a), sa = Math.sin(a);
        const r0 = 0.05 + 0.05 * ((k * 7) % 3) / 2, bx = ca * r0, bz = sa * r0;
        // to the rim along the bough's direction, then 6-14 cm over it
        const toRim = Math.min(Math.abs(ca) > 1e-3 ? (0.55 - Math.abs(bx)) / Math.abs(ca) : 9, Math.abs(sa) > 1e-3 ? (0.3 - Math.abs(bz)) / Math.abs(sa) : 9);
        const L = toRim + 0.03 + 0.05 * ((k * 5) % 4) / 3;
        g.add(boughGeo(), [0x2f4a2c, 0x34502f, 0x2a4428][k % 3], mat(bx, 0.47 + 0.008 * (k % 3), bz, 0, -a, -0.03 - 0.03 * (k % 2), L, 1, Math.max(0.32, L) * 1.25));
      }
      for (let k = 0; k < 11; k++) {
        const a = k * 2.4 + 0.3, bx = Math.cos(k * 1.7) * 0.25, bz = Math.sin(k * 2.9) * 0.1;
        g.add(boughGeo(), [0x34502f, 0x2f4a2c, 0x3a5634][k % 3], mat(bx, 0.495 + 0.007 * (k % 3), bz, 0.05 * Math.sin(k), -a, 0.04 * Math.cos(k * 3), 0.36, 1, 0.42));
      }
      g.use('snow');
      for (const [x, z, s, h] of [[-0.24, 0.03, 0.2, 0.035], [0.1, -0.05, 0.23, 0.04], [0.34, 0.08, 0.13, 0.028], [-0.04, 0.11, 0.12, 0.025]]) g.add(snowBall(1, x * 9 + 4.2), 0xeef0f2, mat(x, 0.515, z, 0, x * 5, 0, s, h, s * 0.75));
    },
  },
  // Snowman, rolled by children: three lumpy balls of packed snow (not quite stacked straight), the
  // bottom one flattened where it stands and grey with dirt and grit at its foot, stick arms, coal
  // eyes and buttons, a carrot.
  snowman: {
    r: 0.45, top: 1.5, coins: 0, shame: 2, minSpeed: 1, color: 0xf0f2f4,
    build(g) {
      g.use('snow');
      const packed = 0xe2e6ea;
      g.add(snowBall(0.42, 1.3, 0.75), packed, mat(0, 0.28, 0, 0, 0.4, 0, 1, 0.93, 1));
      // (dirt picked up rolling it across the lawn, grit at the foot)
      tintLast(g, (x, y, z) => {
        const d = Math.max(0, 1 - y / 0.2) ** 1.4 * (0.75 + 0.25 * Math.sin(x * 13 + z * 9)), s = 0.08 * Math.max(0, Math.sin(x * 7.3 - y * 5.1 + z * 6.2));
        const k = 1 - 0.42 * d - s;
        return [k, k * 0.985, k * 0.96];
      });
      g.add(snowBall(0.3, 2.9, 0.75), packed, mat(0.025, 0.85, -0.015, 0.04, 1.3, -0.05, 1, 0.94, 1));
      tintLast(g, (x, y, z) => { const k = 1 - 0.06 * Math.max(0, Math.sin(x * 9.1 + y * 4.3 + z * 7.7)); return [k, k, k * 0.99]; });
      g.add(snowBall(0.21, 5.1, 0.8), packed, mat(0.05, 1.27, -0.02, 0.06, 2.1, -0.07, 1, 0.96, 1));
      g.use('plastic').cone(0xd8641e, 0.05, 1.27, 0.27, 0.032, 0.17, 6, Math.PI / 2 - 0.1);
      g.use('rubber');
      for (const x of [-0.065, 0.075]) g.box(0x161616, 0.05 + x, 1.35, 0.175, 0.038, 0.036, 0.04);
      for (const dy of [-0.09, 0.01, 0.11]) g.box(0x161616, 0.025 + dy * 0.05, 0.85 + dy, Math.sqrt(0.09 - dy * dy) * 0.96, 0.042, 0.04, 0.03);
      // stick arms with a fork near the hand
      g.use('bark');
      for (const s of [-1, 1]) {
        g.box(0x4a3a2c, 0.025 + s * 0.46, 0.95 + (s > 0 ? 0.03 : 0), 0, 0.46, 0.022, 0.022, 0, 0, s * (s > 0 ? 0.55 : 0.38));
        g.box(0x4a3a2c, 0.025 + s * 0.66, 1.08 + (s > 0 ? 0.08 : 0), 0.02, 0.16, 0.014, 0.014, 0.4, 0, s * 1.1);
      }
    },
  },
  // Plastic sled (pulka).
  pulka: {
    w: 0.55, d: 1.0, top: 0.3, coins: 0, shame: 1, minSpeed: 1, color: 0xb0302a,
    build(g) {
      g.use('plastic');
      g.boxB(0xb0302a, 0, 0.02, 0, 0.55, 0.05, 0.95);
      for (const x of [-0.26, 0.26]) g.boxB(0xb0302a, x, 0.02, 0, 0.04, 0.2, 0.95);
      g.box(0xb0302a, 0, 0.15, 0.5, 0.55, 0.05, 0.2, 0, -0.9);
      g.use('fabric').box(0x2a3a5a, 0, 0.3, 0.75, 0.02, 0.02, 0.4, 0, -0.4);
    },
  },
  // Moving box (flyttkartong).
  box: {
    w: 0.6, d: 0.42, top: 0.42, coins: 0, shame: 0, minSpeed: 1, color: 0xa08460,
    build(g) {
      g.use('plain').boxB(0xa08460, 0, 0, 0, 0.6, 0.4, 0.42);
      g.use('plastic').box(0xc8b48a, 0, 0.401, 0, 0.6, 0.004, 0.06);
    },
  },
  // White picket fence segment (spjälstaket).
  fence: {
    w: 2.5, d: 0.12, top: 1.05, coins: 0, shame: 1, minSpeed: 2, color: 0xe8e4dc,
    build(g) {
      g.use('painted');
      for (let k = 0; k < 17; k++) g.boxB(0xe6e2da, -1.2 + k * 0.15, 0.04, 0.02, 0.085, 0.95, 0.022);
      g.box(0xdcd6cc, 0, 0.3, -0.03, 2.5, 0.07, 0.04);
      g.box(0xdcd6cc, 0, 0.8, -0.03, 2.5, 0.07, 0.04);
      g.boxB(0xdcd6cc, -1.25, 0, -0.03, 0.08, 1.02, 0.08);
    },
  },
  // Wooden plank fence / screen (stained grey-brown).
  woodfence: {
    w: 2.5, d: 0.14, top: 1.55, coins: 0, shame: 1, minSpeed: 2, color: 0x5a4a3a,
    build(g) {
      g.use('wood').boxB(0x56463a, 0, 0.04, 0.02, 2.48, 1.45, 0.025);
      g.box(0x4a3e32, 0, 0.4, -0.03, 2.5, 0.08, 0.04);
      g.box(0x4a3e32, 0, 1.2, -0.03, 2.5, 0.08, 0.04);
      g.boxB(0x4a3e32, -1.25, 0, -0.02, 0.09, 1.55, 0.09);
    },
  },
  // Traffic cone.
  cone: {
    r: 0.28, top: 0.75, coins: 1, shame: 0, minSpeed: 1, color: 0xd8501a,
    build(g) { g.use('plastic').boxB(0xd8501a, 0, 0, 0, 0.42, 0.04, 0.42); g.cone(0xd8501a, 0, 0.38, 0, 0.17, 0.68, 12); g.cyl(0xe8e8e4, 0, 0.42, 0, 0.11, 0.1, 12); },
  },
  // Shopping cart (kundvagn) outside the Livs.
  cart: {
    r: 0.45, top: 1.0, coins: 1, shame: 0, minSpeed: 1, color: 0xc7ccd4,
    // A wire basket (thin bars: you see through it) on a tubular frame, a green handle, castors.
    build(g) {
      g.use('metal');
      const W = 0.52, Lb = 0.82, y0 = 0.42, y1 = 0.92, wire = 0.008, M = 0x9ea2a6;
      // basket rims and the bottom
      for (const y of [y0, y1]) { g.box(M, 0, y, -Lb / 2, W, 0.014, 0.014); g.box(M, 0, y, Lb / 2, W * 0.86, 0.014, 0.014); for (const sx of [-1, 1]) g.box(M, sx * W / 2, y, 0, 0.014, 0.014, Lb, 0, 0, 0); }
      for (let k = 0; k <= 6; k++) g.box(M, -W / 2 + (k / 6) * W, y0, 0, wire, wire, Lb);
      for (let k = 0; k <= 9; k++) g.box(M, 0, y0, -Lb / 2 + (k / 9) * Lb, W, wire, wire);
      // vertical wires on the sides, back and front
      for (let k = 0; k <= 9; k++) for (const sx of [-1, 1]) g.box(M, sx * W / 2, (y0 + y1) / 2, -Lb / 2 + (k / 9) * Lb, wire, y1 - y0, wire);
      for (let k = 0; k <= 6; k++) { g.box(M, -W / 2 + (k / 6) * W, (y0 + y1) / 2, -Lb / 2, wire, y1 - y0, wire); g.box(M, (-W / 2 + (k / 6) * W) * 0.86, (y0 + y1) / 2, Lb / 2, wire, y1 - y0, wire); }
      for (const y of [0.58, 0.75]) for (const sx of [-1, 1]) g.box(M, sx * W / 2, y, 0, wire, wire, Lb);
      // frame: legs down to the castors, the lower tray
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.34, 0.34]) g.box(M, sx, 0.25, sz, 0.02, 0.36, 0.02);
      g.box(M, 0, 0.14, 0, 0.46, 0.015, 0.72);
      g.use('plastic').cyl(0x2a5a3a, 0, 1.0, -0.48, 0.022, 0.56, 6, 0, 0, Math.PI / 2);
      g.use('metal'); for (const sx of [-0.27, 0.27]) g.box(M, sx, 0.96, -0.46, 0.015, 0.1, 0.05);
      g.use('rubber');
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.34, 0.34]) g.cyl(0x222222, sx, 0.055, sz, 0.055, 0.03, 10, 0, 0, Math.PI / 2);
    },
  },
  // Fuel pump.
  pump: {
    w: 0.9, d: 0.6, top: 1.9, coins: 12, shame: 6, minSpeed: 5, color: 0xd8d6d0,
    build(g) {
      g.use('painted').boxB(0xd8d8d4, 0, 0, 0, 0.9, 1.75, 0.55);
      g.boxB(0x2e5a46, 0, 1.75, 0, 0.92, 0.15, 0.57);
      g.use('glass').box(null, 0, 1.3, 0.28, 0.5, 0.3, 0.02);
      g.use('light', { snow: 0 }).box(0xb8e8d0, 0, 1.3, 0.285, 0.36, 0.14, 0.01);
      g.use('rubber').cyl(0x1a1a1a, 0.5, 0.95, 0, 0.025, 0.9, 6, 0.3);
      g.use('painted').box(0x2a2a2a, 0.47, 1.05, 0.12, 0.08, 0.2, 0.1);
    },
  },
  // Parking meter (p-automat).
  meter: {
    r: 0.25, top: 1.6, coins: 6, shame: 2, minSpeed: 3, color: 0x8a9096,
    build(g) {
      g.use('metal').boxB(0x7a7e82, 0, 0, 0, 0.12, 0.9, 0.12);
      g.use('painted').boxB(0x6e747a, 0, 0.9, 0, 0.36, 0.62, 0.24);
      g.box(0x2a4a8a, 0, 1.45, 0.122, 0.3, 0.08, 0.005);
      g.use('glass').box(null, 0, 1.3, 0.125, 0.16, 0.08, 0.01);
      g.use('light').box(0x9ad0e8, 0, 1.3, 0.128, 0.12, 0.05, 0.005);
      g.use('metal').box(0x3a3a3a, 0, 1.12, 0.125, 0.05, 0.1, 0.01);
    },
  },
  // Garden tomte (late November: they come out for advent).
  gnome: {
    r: 0.22, top: 0.65, coins: 2, shame: 1, color: 0x9a2a22,
    build(g) {
      g.use('plastic');
      g.cyl(0x6a6e78, 0, 0.16, 0, 0.14, 0.32, 10);
      g.sphere(0xe8e4dc, 0, 0.34, 0.06, 0.2, 0.2, 0.12, 0, 0, 0, 8);
      g.sphere(0xd0a488, 0, 0.42, 0.04, 0.12, 0.12, 0.12, 0, 0, 0, 8);
      g.cone(0x9a2a22, 0, 0.6, 0, 0.12, 0.32, 10);
    },
  },
  crate: {
    w: 1.2, d: 1.2, top: 1.2, coins: 2, shame: 0, minSpeed: 5, color: 0xa08458,
    build(g) { g.use('wood').boxB(0x8a7452, 0, 0, 0, 1.2, 1.2, 1.2); g.box(0x6e5a3e, 0, 0.6, 0.61, 1.2, 0.16, 0.02, 0, 0, 0.78); },
  },
  tombstone: {
    w: 0.8, d: 0.3, top: 1.0, coins: 0, shame: 3, minSpeed: 6, color: 0x6a6a6c,
    build(g) { g.use('concrete').boxB(0x5e5e60, 0, 0.1, 0, 0.7, 0.75, 0.16); g.boxB(0x58585a, 0, 0, 0, 0.8, 0.12, 0.3); },
  },
  // Kept for old callers (not placed in this town).
  hydrant: {
    r: 0.25, top: 0.9, coins: 2, shame: 2, minSpeed: 6, color: 0x9a2a22,
    build(g) { g.use('painted').cyl(0x9a2a22, 0, 0.4, 0, 0.12, 0.8, 10); g.use('metal').cyl(0x8a8e92, 0, 0.84, 0, 0.08, 0.1, 8); },
  },
  newsbox: {
    w: 0.55, d: 0.5, top: 1.15, coins: 3, shame: 1, color: 0x2a5a3a,
    build(g) { g.use('painted').boxB(0x2a5a3a, 0, 0.35, 0, 0.55, 0.75, 0.5); g.use('metal').boxB(0x333333, 0, 0, 0, 0.08, 0.35, 0.08); },
  },
  barrel: {
    r: 0.42, top: 1.05, coins: 2, shame: 0, minSpeed: 4, color: 0x2a4a6a,
    build(g) { g.use('painted').cyl(0x2a4a6a, 0, 0.52, 0, 0.4, 1.04, 14); },
  },
};
TYPES.bin = TYPES.trashcan;
export const PROP_TYPES = TYPES;

const placements = []; // { type, x, z, yaw }
export const props = []; // runtime list
let meshes = {};
let debris, debrisState = [];
const DEBRIS = 160;

export function placeProp(type, x, z, yaw = 0, baseY) {
  if (!TYPES[type]) throw new Error('unknown prop type ' + type);
  placements.push({ type, x, z, yaw, baseY });
}

const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export function finalizeProps(scene) {
  // One instanced mesh per type, and (round 5) per 200 m cell of a 3 x 3 grid for the common types
  // (an instanced mesh is culled as a whole: one per type drew every bin and fence plank in town in
  // the main pass, the AO pass and both shadow cascades, ~0.9 M triangles at any pose).
  const counts = {}, geos = {}, nType = {};
  for (const p of placements) nType[p.type] = (nType[p.type] || 0) + 1;
  const cell = (v) => Math.max(0, Math.min(2, Math.floor((v + 300) / 200)));
  const keyOf = (p) => (nType[p.type] > 30 ? p.type + ':' + (cell(p.x) * 3 + cell(p.z)) : p.type);
  for (const p of placements) { p.mkey = keyOf(p); counts[p.mkey] = (counts[p.mkey] || 0) + 1; }
  for (const [key, n] of Object.entries(counts)) {
    const type = key.split(':')[0], def = TYPES[type];
    if (!geos[type]) { const g = new GeoBuilder(); def.build(g); geos[type] = g.build(); }
    const geo = geos[type];
    const im = new THREE.InstancedMesh(geo, realMaterials(geo), n);
    im.castShadow = true; im.receiveShadow = true;
    im.name = 'props:' + key;
    scene.add(im);
    meshes[key] = { im, next: 0 };
  }
  for (const p of placements) {
    const def = TYPES[p.type];
    const m = meshes[p.mkey];
    const idx = m.next++;
    const prop = { ...p, def, idx, alive: true, respawn: 0 };
    if (prop.baseY === undefined) delete prop.baseY;
    // Box footprints turn by multiples of 90 degrees, so they stay axis-aligned.
    if (def.r) prop.block = circle(p.x, p.z, def.r, (p.baseY ?? 0.15) + def.top - 0.15, 'prop', prop);
    else {
      const turned = Math.abs(Math.sin(p.yaw)) > 0.7;
      const hw = (turned ? def.d : def.w) / 2, hd = (turned ? def.w : def.d) / 2;
      prop.block = box(p.x - hw, p.z - hd, p.x + hw, p.z + hd, (p.baseY ?? 0.15) + def.top - 0.15, 'prop', prop);
    }
    props.push(prop);
    setMatrix(prop, true);
  }
  for (const m of Object.values(meshes)) { m.im.instanceMatrix.needsUpdate = true; m.im.computeBoundingSphere(); }

  // Debris chunks share one instanced mesh with per-instance colours.
  debris = new THREE.InstancedMesh(ensureSurfaceAttributes(new THREE.BoxGeometry(1, 1, 1)), surfaceMaterial('painted', { snow: false }), DEBRIS);
  debris.castShadow = true;
  debris.frustumCulled = false;
  for (let k = 0; k < DEBRIS; k++) {
    debris.setMatrixAt(k, _zero);
    debris.setColorAt(k, new THREE.Color(0xffffff));
    debrisState.push({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2, rx: 0, ry: 0, wx: 0, wy: 0 });
  }
  scene.add(debris);
  placements.length = 0;
}

function setMatrix(p, show) {
  const m = meshes[p.mkey];
  if (show) _m.copy(mat(p.x, p.baseY ?? 0.15, p.z, 0, p.yaw, 0));
  else _m.copy(_zero);
  m.im.setMatrixAt(p.idx, _m);
  m.im.instanceMatrix.needsUpdate = true;
}

let debrisNext = 0;
const _c = new THREE.Color();
export function spawnDebris(x, y, z, color, n, vx = 0, vz = 0, power = 1) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = debrisNext++ % DEBRIS;
    const d = debrisState[i];
    d.t = 1.6 + Math.random() * 0.8;
    d.x = x + (Math.random() - 0.5) * 0.6; d.y = y + Math.random() * 0.6; d.z = z + (Math.random() - 0.5) * 0.6;
    d.vx = vx * 0.6 + (Math.random() - 0.5) * 7 * power;
    d.vz = vz * 0.6 + (Math.random() - 0.5) * 7 * power;
    d.vy = 3 + Math.random() * 6 * power;
    d.s = 0.12 + Math.random() * 0.22;
    d.wx = (Math.random() - 0.5) * 20; d.wy = (Math.random() - 0.5) * 20;
    debris.setColorAt(i, k % 3 === 2 ? _c.clone().multiplyScalar(0.7) : _c);
  }
  debris.instanceColor.needsUpdate = true;
}

// Returns the prop if it broke.
export function breakProp(p, vx = 0, vz = 0, game = null) {
  if (!p.alive) return null;
  p.alive = false;
  p.block.dead = true;
  p.respawn = 75 + Math.random() * 40;
  setMatrix(p, false);
  const big = p.type === 'fence' || p.type === 'woodfence' || p.type === 'mailrow';
  spawnDebris(p.x, 0.4, p.z, p.def.color, big ? 9 : 7, vx, vz);
  if (game) game.onPropBroken(p, vx, vz);
  return p;
}

export function tickProps(dt, px, pz) {
  for (const p of props) {
    if (p.alive) continue;
    p.respawn -= dt;
    if (p.respawn <= 0 && (p.x - px) ** 2 + (p.z - pz) ** 2 > 70 * 70) {
      p.alive = true;
      p.block.dead = false;
      setMatrix(p, true);
    }
  }
  let any = false;
  for (let i = 0; i < DEBRIS; i++) {
    const d = debrisState[i];
    if (d.t <= 0) continue;
    any = true;
    d.t -= dt;
    d.vy -= 22 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    if (d.y < 0.15 + d.s / 2) { d.y = 0.15 + d.s / 2; d.vy = Math.abs(d.vy) * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.6; d.wy *= 0.6; }
    d.rx += d.wx * dt; d.ry += d.wy * dt;
    const s = d.t <= 0 ? 0 : d.s * Math.min(1, d.t * 2);
    _m.copy(mat(d.x, d.y, d.z, d.rx, d.ry, 0, s, s, s));
    debris.setMatrixAt(i, _m);
  }
  if (any) debris.instanceMatrix.needsUpdate = true;
}

export function propsNear(x, z, r) {
  const out = [];
  for (const p of props) if (p.alive && (p.x - x) ** 2 + (p.z - z) ** 2 < (r + (p.def.r || p.def.w / 2)) ** 2) out.push(p);
  return out;
}
