// Anita and Rune's kitchen: the set of day 3's radiator scene (game/luftning.js). Built only when
// the scene starts and disposed after it, inside their real row house, so the kitchen window looks
// out on the real walkway: the house's own walls are boxes seen from inside (culled), the window's
// frame and mullion are the real ones, and its pane is a mesh of its own (data.js interiors.rune,
// town.js) that the scene hides. Everything is section-10 surfaces, no lights: the room is lit by
// the sky like any shade (the house keeps the sun out), the lamps only glow.
//
// Unit-local coordinates (rowhouse.js): x along the row from the unit's left end (gable at 0, the
// neighbour's party wall at 5.4), z into the house from the front wall (0) to the back (8.4), y world.
// The kitchen window's opening is x 3.725..4.975, y0 + 1.0 .. y0 + 2.05 (rowhouse.js: win at X(4.35)).

import { THREE, GeoBuilder, realMesh, signMesh } from '../gfx.js';
import { Frame, glow } from './kit.js';

export const ROOM = { x0: 0.12, x1: 5.28, z0: 0.14, z1: 4.4, floor: 0.012, ceil: 2.42 };
export const WIN = { x0: 3.725, x1: 4.975, y: 1.0, h: 1.05 };
// The radiator under the window and its bleed valve (front face, top left corner, facing the room).
export const RAD = { x0: 3.8, x1: 4.9, y: 0.16, h: 0.55, z: 0.18, d: 0.1 };
export const VENT = { x: 3.88, y: RAD.y + RAD.h - 0.06, z: RAD.z + RAD.d + 0.016 };

// info: data.js interiors.rune ({ ox, oz, yaw, a0, y0 }). Returns { root, at(lx, ly, lz) (unit
// local -> world, ly above the floor), yaw(local) -> world yaw, dispose() }.
export function buildKitchen(info) {
  const G = new GeoBuilder();
  const f = new Frame(G, G, info.ox, info.oz, info.yaw);
  const a0 = info.a0 || 0, FY = info.y0 + ROOM.floor, CY = info.y0 + ROOM.ceil;
  const X = (x) => a0 + x;
  // (all heights below are above the floor)
  const box = (c, x, y, z, w, h, d, ly = 0) => f.box(c, X(x), FY + y, z, w, h, d, ly);
  const boxC = (c, x, y, z, w, h, d, ly = 0, rx = 0, rz = 0) => f.boxC(c, X(x), FY + y, z, w, h, d, ly, rx, rz);
  const cyl = (c, x, y, z, r, h, n = 14, rx = 0, rz = 0) => f.cyl(c, X(x), FY + y, z, r, h, n, rx, rz);
  const { x0, x1, z0, z1 } = ROOM, H = CY - FY, T = 0.12;
  const wy0 = WIN.y, wy1 = WIN.y + WIN.h;

  // ----- Shell: a linoleum floor, the ceiling, walls (a green board wainscot under cream plaster).
  G.use('plastic', { snow: 0 });
  f.box(0x8a7a62, X((x0 + x1) / 2), info.y0 - 0.03, (z0 + z1) / 2, x1 - x0 + 0.2, 0.042, z1 - z0 + 0.2);
  G.use('plain');
  f.box(0xeeebe4, X((x0 + x1) / 2), CY, (z0 + z1) / 2, x1 - x0 + 0.2, 0.05, z1 - z0 + 0.2);
  const WALL = 0xe4d8bc, PANEL = 0x8c9873, PH = 0.95;
  // A wall from (xa, za) to (xb, zb) along x or z, inner face towards the room; holes: [[a, b, y0, y1]].
  const wall = (along, a, b, at, side, holes = []) => {
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
      const c = (s0 + s1) / 2, l = s1 - s0, off = at + side * T / 2;
      // (proud: m towards the room)
      const put = (col, ya, yb, proud = 0) => {
        if (yb - ya < 0.005) return;
        if (along === 'x') f.box(col, X(c), FY + ya, off - side * proud, l, yb - ya, T);
        else f.box(col, X(off - side * proud), FY + ya, c, T, yb - ya, l);
      };
      // the panel stands 1 cm proud of the plaster, with a cap rail on it; a skirting board
      G.use('wood', { snow: 0 }); put(PANEL, y0, Math.min(y1, PH), 0.01);
      G.use('plaster', { snow: 0 }); put(WALL, Math.max(y0, PH), y1);
      if (y0 < PH && y1 > PH) { G.use('painted', { snow: 0 }); put(0xe8e2d4, PH - 0.01, PH + 0.035, 0.022); }
      if (y0 < 0.01) { G.use('painted', { snow: 0 }); put(0xeae6dc, 0, 0.09, 0.025); }
    };
    let s = a;
    const hs = [...holes].sort((p, q) => p[0] - q[0]);
    for (const [h0, h1, y0, y1] of hs) { seg(s, h0, 0, H); seg(h0, h1, 0, y0); seg(h0, h1, y1, H); s = h1; }
    seg(s, b, 0, H);
  };
  // (the walls run past each other at the corners; the front wall's outer face meets the house's)
  wall('x', x0 - T, x1 + T, z0, -1, [[WIN.x0, WIN.x1, wy0, wy1]]);
  wall('x', x0 - T, x1 + T, z1, 1, [[3.55, 4.45, 0, 2.05]]);
  wall('z', z0, z1, x0, -1);
  wall('z', z0, z1, x1, 1);

  // ----- The window from inside: deep plastered reveals, a white sill board, curtains and a valance.
  G.use('plaster', { snow: 0 });
  // (the reveal's faces are the front wall's own: put a lining in so the jambs read as plaster
  // right to the real frame at z 0)
  for (const x of [WIN.x0 - 0.01, WIN.x1 + 0.01]) f.box(WALL, X(x), FY + wy0, 0.07, 0.02, WIN.h, 0.14);
  f.box(WALL, X((WIN.x0 + WIN.x1) / 2), FY + wy1 - 0.0, 0.07, WIN.x1 - WIN.x0 + 0.04, 0.02, 0.14);
  G.use('painted', { snow: 0 });
  box(0xf0eee8, (WIN.x0 + WIN.x1) / 2, wy0 - 0.03, 0.12, WIN.x1 - WIN.x0 + 0.16, 0.03, 0.24);
  G.use('fabric', { snow: 0 });
  // curtains drawn to the sides (folds: a few staggered panels), a gathered valance (kappa) on top
  const CUR = 0xb4683a, CUR2 = 0xc87c48;
  for (const [cx, s] of [[WIN.x0 - 0.13, -1], [WIN.x1 + 0.13, 1]]) {
    for (let k = 0; k < 4; k++) box(k % 2 ? CUR2 : CUR, cx + s * (k - 1.5) * 0.045, wy0 - 0.12, z0 + 0.05 + (k % 2) * 0.025, 0.07, wy1 - wy0 + 0.32, 0.03);
  }
  for (let k = 0; k < 16; k++) {
    const x = WIN.x0 - 0.22 + (k + 0.5) * ((WIN.x1 - WIN.x0 + 0.44) / 16);
    box(k % 2 ? CUR2 : CUR, x, wy1 - 0.02, z0 + 0.06 + (k % 2) * 0.02, (WIN.x1 - WIN.x0 + 0.44) / 16 + 0.006, 0.24, 0.025);
  }
  G.use('metal', { snow: 0 });
  box(0xb08a48, (WIN.x0 + WIN.x1) / 2, wy1 + 0.22, z0 + 0.05, WIN.x1 - WIN.x0 + 0.5, 0.018, 0.018);

  // ----- The radiator: a white two-panel radiator (vertical grooves) on brackets, its pipes, the
  // thermostat at the right end and the bleed valve (a brass nipple with a square stem) at the top left.
  const R = RAD, rc = 0xecebe6, rcx = (R.x0 + R.x1) / 2;
  G.use('painted', { snow: 0 });
  box(rc, rcx, R.y, R.z + R.d * 0.25, R.x1 - R.x0, R.h, R.d * 0.3);
  box(rc, rcx, R.y, R.z + R.d * 0.82, R.x1 - R.x0, R.h, R.d * 0.36);
  const nr = 21;
  for (let k = 0; k < nr; k++) box(0xe2e1dc, R.x0 + (k + 0.5) * (R.x1 - R.x0) / nr, R.y + 0.012, R.z + R.d + 0.003, 0.016, R.h - 0.024, 0.008);
  G.use('metal', { snow: 0 });
  // the convector fins between the panels, seen through the top grille
  for (let k = 0; k < 40; k++) box(0x6a6c6e, R.x0 + 0.03 + k * (R.x1 - R.x0 - 0.06) / 39, R.y + R.h - 0.11, R.z + R.d * 0.55, 0.004, 0.1, R.d * 0.42);
  G.use('painted', { snow: 0 });
  for (const x of [R.x0 + 0.12, R.x1 - 0.12]) box(0xdcdad4, x, R.y + R.h - 0.12, (z0 + R.z) / 2, 0.04, 0.05, R.z - z0 + 0.01);
  for (const x of [R.x0 + 0.04, R.x1 - 0.06]) { cyl(rc, x, R.y / 2 - 0.005, R.z + R.d * 0.5, 0.011, R.y + 0.01, 10); }
  // the thermostat head on its valve, right end, low
  G.use('plastic', { snow: 0 });
  f.cyl(0xf2f0ea, X(R.x1 + 0.05), FY + R.y + 0.09, R.z + R.d * 0.5, 0.027, 0.075, 16, 0, Math.PI / 2);
  G.use('metal', { snow: 0 });
  f.cyl(0xc8c4b8, X(R.x1 + 0.004), FY + R.y + 0.09, R.z + R.d * 0.5, 0.012, 0.02, 10, 0, Math.PI / 2);
  // the bleed valve: a brass boss and the square stem the key goes on
  G.use('chrome', { snow: 0 });
  f.cyl(0xc9a253, X(VENT.x), FY + VENT.y, VENT.z - 0.008, 0.009, 0.016, 10, Math.PI / 2, 0);
  f.boxC(0xb89040, X(VENT.x), FY + VENT.y, VENT.z + 0.004, 0.006, 0.006, 0.01);

  // ----- Along the party wall: base cabinets (oak doors, a laminate worktop, a sink, a stove),
  // wall cupboards, the coffee maker. Clear of the radiator (from z 1.0).
  const kz0 = 1.0, kz1 = 3.75, kx = x1 - 0.6;
  G.use('painted', { snow: 0 });
  box(0xa07a4e, x1 - 0.3, 0.1, (kz0 + kz1) / 2, 0.58, 0.76, kz1 - kz0);
  G.use('rubber', { snow: 0 }); box(0x1e1e20, x1 - 0.27, 0, (kz0 + kz1) / 2, 0.52, 0.1, kz1 - kz0);
  G.use('painted', { snow: 0 });
  for (let z = kz0 + 0.02; z < kz1 - 0.3; z += 0.6) {
    box(0x6a4a2c, kx - 0.004, 0.13, z + 0.005, 0.012, 0.72, 0.01);              // the gap between doors
    box(0x2a2624, kx - 0.02, 0.72, z + 0.29 + 0.18, 0.02, 0.02, 0.1);         // its handle
  }
  G.use('plastic', { snow: 0 }); box(0xd6cfb8, x1 - 0.31, 0.86, (kz0 + kz1) / 2, 0.64, 0.04, kz1 - kz0 + 0.02);
  G.use('metal', { snow: 0 }); box(0xb8bcc0, x1 - 0.31, 0.875, 1.75, 0.46, 0.03, 0.62);
  box(0x8a8e92, x1 - 0.31, 0.88, 1.75, 0.36, 0.03, 0.48);
  f.cyl(0xc0c4c8, X(x1 - 0.08), FY + 1.05, 1.75, 0.012, 0.3, 10);
  f.boxC(0xc0c4c8, X(x1 - 0.16), FY + 1.19, 1.75, 0.18, 0.02, 0.02);
  G.use('painted', { snow: 0 }); box(0xf2f0ea, x1 - 0.31, 0.1, 3.2, 0.6, 0.79, 0.58);
  G.use('rubber', { snow: 0 });
  for (const [dx, dz] of [[-0.12, -0.13], [-0.12, 0.13], [0.12, -0.13], [0.12, 0.13]]) f.cyl(0x202022, X(x1 - 0.31 + dx), FY + 0.9, 3.2 + dz, 0.085, 0.012, 16);
  G.use('painted', { snow: 0 });
  box(0xa07a4e, x1 - 0.18, 1.45, (kz0 + kz1) / 2 + 0.2, 0.34, 0.7, kz1 - kz0 - 0.4);
  G.use('painted', { snow: 0 });
  for (let z = kz0 + 0.22; z < kz1 - 0.4; z += 0.6) { box(0x2a2624, x1 - 0.36, 1.5, z + 0.48, 0.02, 0.1, 0.02); box(0x6a4a2c, x1 - 0.355, 1.46, z + 0.6, 0.012, 0.68, 0.01); }
  // the coffee maker (bryggare) with its jug, and a tin of coffee
  G.use('plastic', { snow: 0 });
  box(0xeeece6, x1 - 0.3, 0.88, 2.45, 0.2, 0.32, 0.22);
  box(0xeeece6, x1 - 0.3, 1.16, 2.37, 0.2, 0.06, 0.34);
  G.use('tinted', { snow: 0 }); f.cyl(0x3a2a20, X(x1 - 0.3), FY + 0.97, 2.32, 0.065, 0.16, 14);
  G.use('painted', { snow: 0 }); f.cyl(0xb02a24, X(x1 - 0.32), FY + 0.95, 2.82, 0.055, 0.14, 14);

  // ----- The table by the gable wall: teak, a red runner, coffee cups, a thermos, kanelbullar.
  const tx = 1.55, tz = 1.6, tw = 1.3, td = 0.82, th = 0.73;
  G.use('painted', { snow: 0 });
  box(0x6a4428, tx, th - 0.035, tz, tw, 0.035, td);
  box(0x5e3c22, tx, th - 0.12, tz, tw - 0.12, 0.085, td - 0.12);
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(0x5e3c22, tx + sx * (tw / 2 - 0.08), 0, tz + sz * (td / 2 - 0.08), 0.05, th - 0.035, 0.05);
  G.use('fabric', { snow: 0 }); box(0x9a2a24, tx, th, tz, 0.95, 0.004, 0.3);
  G.use('painted', { snow: 0 });
  for (const [cx, cz] of [[tx - 0.38, tz + 0.12], [tx + 0.05, tz - 0.25]]) {
    f.cyl(0xf4f2ec, X(cx), FY + th + 0.008, cz, 0.07, 0.01, 16);
    f.cyl(0xf4f2ec, X(cx), FY + th + 0.045, cz, 0.038, 0.065, 16);
    f.cyl(0x3a2414, X(cx), FY + th + 0.072, cz, 0.033, 0.006, 14);
  }
  G.use('plastic', { snow: 0 }); f.cyl(0xa8302a, X(tx + 0.3), FY + th + 0.14, tz + 0.1, 0.06, 0.28, 16);
  f.cyl(0xe8e4dc, X(tx + 0.3), FY + th + 0.3, tz + 0.1, 0.045, 0.04, 14);
  G.use('painted', { snow: 0 }); f.cyl(0xf0eee6, X(tx - 0.05), FY + th + 0.008, tz + 0.12, 0.13, 0.012, 20);
  G.use('plain', { snow: 0 });
  for (const [bx, bz] of [[-0.06, 0.08], [0.03, 0.15], [-0.02, 0.2], [0.05, 0.07]]) {
    f.sphere(0xa86a34, X(tx - 0.05 + bx), FY + th + 0.03, tz + bz, 0.075, 0.04, 0.075);
    f.sphere(0xf4f2ee, X(tx - 0.05 + bx), FY + th + 0.05, tz + bz, 0.02, 0.01, 0.02);
  }
  // two chairs (Rune's place, nearer the window, is his wheelchair)
  G.use('painted', { snow: 0 });
  for (const [cx, cz, ly] of [[tx - 0.15, tz + td / 2 + 0.3, Math.PI], [tx - tw / 2 - 0.32, tz, Math.PI / 2]]) {
    const fr = f.sub(X(cx), cz, ly);
    fr.box(0x6a4428, 0, FY + 0.43, 0, 0.42, 0.035, 0.42);
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) fr.box(0x5e3c22, sx * 0.18, FY, sz * 0.18, 0.035, 0.43, 0.035);
    for (const sx of [-1, 1]) fr.box(0x5e3c22, sx * 0.18, FY + 0.46, -0.19, 0.035, 0.48, 0.03);
    fr.box(0x6a4428, 0, FY + 0.7, -0.195, 0.4, 0.2, 0.02);
  }
  // a rag rug (trasmatta) under the table, in stripes
  G.use('fabric', { snow: 0 });
  const rug = [0x8a3a30, 0x3a4a6a, 0xd8ccb0, 0x6a7a4a, 0xc8a050, 0x3a4a6a, 0xd8ccb0, 0x8a3a30];
  for (let k = 0; k < 18; k++) box(rug[k % rug.length], tx + 0.05, 0.001, tz - 1.0 + k * 0.115, 1.7, 0.006, 0.112);

  // ----- The ceiling lamp over the table (a glowing bulb in an opal shade), a seven-armed Advent
  // candlestick and a pelargon on the sill, the kitchen clock, the door to the hall.
  G.use('painted', { snow: 0 });
  f.cyl(0xe8e4dc, X(tx), CY - 0.35, tz, 0.006, 0.7, 6);
  // (an opal glass globe, lit: it glows, it lights nothing)
  G.use('metal', { snow: 0 }); f.cyl(0xb08a48, X(tx), CY - 0.71, tz, 0.035, 0.03, 12);
  G.use('light', { snow: 0 }); f.sphere(glow(0xffe2b8, 1.1), X(tx), CY - 0.82, tz, 0.24, 0.22, 0.24);
  const sy = wy0 + 0.0, sz = 0.11;
  G.use('wood', { snow: 0 }); box(0x3a2a20, 4.05, sy, sz, 0.42, 0.04, 0.06);
  G.use('light', { snow: 0 });
  for (let k = 0; k < 7; k++) { const h = 0.08 + (3 - Math.abs(k - 3)) * 0.04; box(glow(0xffcf80, 1.8), 4.05 - 0.18 + k * 0.06, sy + 0.04 + h, sz, 0.016, 0.04, 0.016); }
  G.use('painted', { snow: 0 });
  for (let k = 0; k < 7; k++) { const h = 0.08 + (3 - Math.abs(k - 3)) * 0.04; box(0x3a2a20, 4.05 - 0.18 + k * 0.06, sy + 0.04, sz, 0.01, h, 0.01); }
  G.use('plastic', { snow: 0 }); f.cyl(0xa8583a, X(4.88), FY + sy + 0.06, sz, 0.055, 0.12, 14);
  G.use('foliage', { snow: 0 });
  for (const [dx, dy, dz] of [[0, 0.17, 0], [-0.05, 0.14, 0.03], [0.05, 0.15, -0.02], [0.02, 0.21, 0.02]]) f.sphere(0x3e5a32, X(4.88 + dx), FY + sy + dy, sz + dz, 0.11, 0.08, 0.1);
  G.use('plain', { snow: 0 });
  for (const [dx, dy, dz] of [[0.0, 0.26, 0.01], [-0.04, 0.23, -0.02], [0.04, 0.24, 0.03]]) f.sphere(0xc8242a, X(4.88 + dx), FY + sy + dy, sz + dz, 0.035, 0.035, 0.035);
  // the clock over the door's left jamb, facing into the room
  G.use('metal', { snow: 0 }); f.cyl(0x9a9890, X(2.7), FY + 2.0, z1 - 0.02, 0.15, 0.03, 24, Math.PI / 2, 0);
  G.use('painted', { snow: 0 }); f.cyl(0xf6f4ee, X(2.7), FY + 2.0, z1 - 0.036, 0.135, 0.01, 24, Math.PI / 2, 0);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; f.boxC(0x222222, X(2.7 + Math.sin(a) * 0.115), FY + 2.0 + Math.cos(a) * 0.115, z1 - 0.042, 0.008, k % 3 ? 0.012 : 0.022, 0.004, 0, 0, -a); }
  // twenty to one (seen from the room +x is on the left: a hand at clock angle a points to -sin a)
  for (const [a, L, w, dz] of [[0.35, 0.07, 0.009, 0.046], [4.19, 0.11, 0.006, 0.049]]) f.boxC(0x1a1a1a, X(2.7 - Math.sin(a) * L / 2), FY + 2.0 + Math.cos(a) * L / 2, z1 - dz, w, L, 0.004, 0, 0, a);
  // the door: frame, leaf, handle
  box(0xf0eee6, 4.0, 0, z1 - 0.02, 0.9, 2.04, 0.04);
  for (const x of [3.52, 4.48]) box(0xe8e4da, x, 0, z1 - 0.03, 0.07, 2.1, 0.03);
  box(0xe8e4da, 4.0, 2.05, z1 - 0.03, 1.03, 0.07, 0.03);
  G.use('chrome', { snow: 0 }); f.boxC(0xb8a070, X(3.62), FY + 1.02, z1 - 0.07, 0.12, 0.02, 0.025);

  const root = new THREE.Group();
  root.name = 'interior:rune';
  root.add(realMesh(G.build(), { snow: false, cast: false }));
  // An embroidered wall hanging (bonad) over the table, on the gable wall.
  const bonad = signMesh('Borta bra\nmen hemma bäst', 0.62, 0.42, { bg: '#ece4cf', fg: '#8e2420', border: '#2f5a3a', borderW: 0.06, font: 'Georgia, "Times New Roman", serif', weight: 'italic 600', scale: 0.56, ppm: 400 });
  const bp = new THREE.Vector3(...at(x0 + 0.005, 1.62, tz));
  bonad.position.copy(bp);
  bonad.rotation.y = info.yaw + Math.PI / 2;
  root.add(bonad);

  function at(lx, ly, lz) { return [f.wx(X(lx), lz), FY + ly, f.wz(X(lx), lz)]; }
  return {
    root, FY,
    // unit-local point (ly above the floor) -> world [x, y, z]; a local yaw -> world yaw
    at,
    yaw: (ly) => info.yaw + ly,
    dispose() {
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m === bonad.material) { m.map?.dispose(); m.dispose(); }
      });
      root.parent?.remove(root);
    },
  };
}
