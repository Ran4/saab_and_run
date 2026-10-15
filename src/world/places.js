// The town's special places: centrum, sjukhuset, the church and its cemetery, the car dealer,
// the preschool, kommunhuset, the petrol station, the park, the football field and the forest.
// Each builder gets a frame at the block interior centre (62 x 62 m, -z = north).

import { THREE, PRIM, mat } from '../gfx.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB } from './layout.js';
import { C, rnd, R, pickR, TAU, parkingLot, PSKIVA_PLATE, win, door, canopy, lampBox, quads, snowBank, snowPile, snowFringe, chunks, shrub, limb, tree, Frame, fineTex, granris, vnoise3, hash, metalRoof, streetLamp, pathLamp, shadeLast, glow } from './kit.js';
import { gableHouse, flatBuilding, winLite, hipGeo, flagpole, jit, CARS, CAR_COLS } from './buildings.js';
import { textFace, picto, decal, addSign, addCard, twigFace } from './signs.js';
import { violationSpots, keepClear, litterSpots, animated, shared } from './data.js';
import { addGround } from './surface.js';
import { mulberry32 } from '../util.js';
import { jumpHill, domeHill } from './snowhill.js';

const V = (f, lx, lz, ly, kind, where) => violationSpots.push({ x: f.wx(lx, lz), z: f.wz(lx, lz), yaw: f.yaw + ly, kind, where });
const LIT = (f, lx, lz) => litterSpots.push([f.wx(lx, lz), CURB + 0.05, f.wz(lx, lz)]);
const KEEP = (f, lx, lz, r) => keepClear.push({ x: f.wx(lx, lz), z: f.wz(lx, lz), r });
// A-board (gatupratare) at (lx, lz) facing ly: two hinged boards with the same printed ad.
function aBoard(f, lx, lz, ly, text, bg = '#f2f0e8', fg = '#1a1a1a') {
  const fc = textFace(text, 0.56, 0.8, { bg, fg, ppm: 260, scale: 0.8, weight: '700' });
  for (const sd of [-1, 1]) {
    const b = f.sub(lx, lz, ly + (sd < 0 ? Math.PI : 0));
    b.use('painted').boxC(0x2e3134, 0, CURB + 0.48, 0.16, 0.64, 0.98, 0.03, 0, -0.17);
    b.sign(fc, 0, CURB + 0.5, 0.185, 0.56, 0.8 * Math.cos(0.17), 0);
  }
  f.solid(lx, lz, 0.66, 0.5, CURB + 0.9, 'sign', ly);
}
// Slush trodden along a walking line on paving: grey blobs of wet, packed snow every half metre or
// so, scattered across w (feet, prams, a shovel's pass), never one white runner.
function slushTrack(f, ax, az, bx, bz, w, seed) {
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ly = Math.atan2(ux, uz);
  const rr = mulberry32(seed * 977 + 13);
  for (let d = 0.3; d < L - 0.3; d += 0.45 + rr() * 0.5) {
    const o = (rr() - 0.5) * w, x = ax + ux * d - uz * o, z = az + uz * d + ux * o, g = Math.round(150 + rr() * 34);
    slush(f, x, z, 0.35 + rr() * 0.55, 0.3 + rr() * 0.4, ly + (rr() - 0.5) * 0.8, Math.floor(rr() * 999), (g << 16) | ((g + 4) << 8) | (g + 8));
  }
}
// A path trodden through the snow (park paths in winter): a band of compacted, slightly grey snow
// from a to b, w wide, with a ragged rim of loose snow along both edges (not a ruled line).
function trodPath(f, ax, az, bx, bz, w, seed, y = CURB + 0.03, color = 0xcdd0d4) {
  const L = Math.hypot(bx - ax, bz - az), ly = Math.atan2(bx - ax, bz - az);
  f.useF('snow').flat(color, (ax + bx) / 2, (az + bz) / 2, w, L, y, ly);
  const nx = -(bz - az) / L, nz = (bx - ax) / L;
  for (const sd of [-1, 1]) f.fringe(ax + nx * sd * w / 2, az + nz * sd * w / 2, bx + nx * sd * w / 2, bz + nz * sd * w / 2, -sd, y + 0.001, seed + (sd > 0 ? 7 : 0), { reach: 0.3, color: 0xe2e4e6 });
}
// The "P-skiva" plate under a time-limited P sign (feature p-skiva): blue on white.
const pskivaFace = () => ({ f: textFace('P-skiva', PSKIVA_PLATE.w, PSKIVA_PLATE.h, { bg: '#f4f2ea', fg: '#1e4f9a', border: '#1e4f9a', ppm: 260, scale: 0.74, weight: '700' }), ...PSKIVA_PLATE });
const lines = (f, list, color = 0xd8d8d0, y = CURB + 0.042) => quads(f.F.use('marking'), color, list.map(([x, z, w, d]) => [f.wx(x, z), f.wz(x, z), w, d, f.yaw]), y);
// Bays along local x: count n starting at x0, width bw, centre z, depth d; returns bay centres.
function bayRow(f, x0, n, bw, z, d) {
  const out = [];
  const ls = [];
  for (let k = 0; k <= n; k++) ls.push([x0 + k * bw, z, 0.1, d - 0.2]);
  lines(f, ls);
  for (let k = 0; k < n; k++) out.push(x0 + (k + 0.5) * bw);
  return out;
}

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
// A box of see-through ('tinted') glass in frame f, in the town's shared glass mesh.
function tglass(f, lx, y0, lz, w, h, d, ly = 0) { shared.glassG.boxB(null, f.wx(lx, lz), y0, f.wz(lx, lz), w, h, d, f.yaw + ly); }

// A shop front in frame f (front at local z = 0 facing -z) between local x0 and x1. The building
// behind is recessed by `depth` (flatBuilding({ recess })): see-through glass with an open, lit
// shop behind it (a glowing back wall, shelves, ceiling lights), posters and ÖPPET on the glass.
const POSTERS = [['REA\n\u221230\u00a0%', '#c8102e', '#f6f6f2'], ['Veckans\nerbjudande', '#f5c518', '#1a1a1a'], ['Kaffe\n& bulle 25:-', '#f2f0e8', '#5a2a1a'], ['NYHET', '#1e5aa8', '#f6f6f2'], ['Julklappar\nhär!', '#2f5a3a', '#f6f6f2'], ['Lotto\nhär', '#f2f0e8', '#1e5aa8']];
function shopfront(f, x0, x1, name, o = {}) {
  const w = x1 - x0, cx = (x0 + x1) / 2, depth = o.depth ?? 1.6;
  const doorX = o.doorX ?? x1 - 1.4;
  const segs = [[x0 + 0.2, doorX - 0.75], [doorX + 0.75, x1 - 0.2]];
  const band = o.band ?? 0x2e3134;
  f.use('metal');
  f.box(0x34373a, cx, CURB, -0.05, w - 0.2, 0.45, 0.1);
  f.box(0x34373a, cx, CURB + 3.05, -0.05, w - 0.2, 0.12, 0.1);
  let pane = 0;
  for (const [a, b] of segs) {
    if (b - a < 0.5) continue;
    const n = Math.max(1, Math.round((b - a) / 2.4)), pw = (b - a) / n;
    for (let k = 0; k < n; k++) {
      tglass(f, a + (k + 0.5) * pw, CURB + 0.45, -0.03, pw - 0.08, 2.6, 0.02);
      f.use('metal').box(0x34373a, a + k * pw, CURB + 0.45, -0.06, 0.08, 2.6, 0.08);
      // A poster stuck on the inside of some panes.
      if ((pane++ + name.length) % 3 === 0) { const [t, bg, fg] = POSTERS[(pane + name.length) % POSTERS.length]; f.sign(textFace(t, 0.6, 0.8, { bg, fg, ppm: 220, weight: '700', scale: 0.62 }), a + (k + 0.5) * pw + (k % 2 ? 0.4 : -0.4), CURB + 1.4, 0.0, 0.6, 0.8, Math.PI); }
    }
    f.use('metal').box(0x34373a, b, CURB + 0.45, -0.06, 0.08, 2.6, 0.08);
  }
  tglass(f, doorX, CURB + 0.05, -0.03, 1.3, 2.3, 0.02);
  f.use('metal').box(0x34373a, doorX, CURB + 2.35, -0.06, 1.5, 0.1, 0.08).box(0x9a9da0, doorX + 0.45, CURB + 1.0, -0.09, 0.04, 0.6, 0.04);
  f.use('metal').box(0x34373a, doorX - 0.68, CURB, -0.06, 0.06, 2.4, 0.08).box(0x34373a, doorX + 0.68, CURB, -0.06, 0.06, 2.4, 0.08);
  f.sign(textFace('ÖPPET', 0.56, 0.2, { bg: '#1a1a1a', fg: '#ff4a3a', ppm: 300, weight: '700', glow: true, scale: 0.8 }), doorX, CURB + 1.75, 0.0, 0.56, 0.2, Math.PI);
  // The shop inside: partitions, a glowing back wall, shelves with goods, ceiling light strips.
  f.use('painted', { snow: 0 });
  f.box(0xe2ded6, x0 + 0.06, CURB, depth / 2, 0.1, 3.0, depth).box(0xe2ded6, x1 - 0.06, CURB, depth / 2, 0.1, 3.0, depth);
  f.use('light', { snow: 0 }).box(o.inside ?? 0x8e8068, cx, CURB + 0.05, depth - 0.04, w - 0.3, 2.95, 0.03);
  f.box(0xfff2dc, cx, CURB + 2.98, depth * 0.45, w - 0.6, 0.03, 0.18);
  const ns = Math.max(1, Math.floor((w - 0.8) / 1.6));
  for (let k = 0; k < ns; k++) {
    const sx = x0 + 0.4 + (k + 0.5) * ((w - 0.8) / ns);
    if (Math.abs(sx - doorX) < 0.9) continue;
    f.use('painted', { snow: 0 }).box(0x4a4440, sx, CURB, depth - 0.35, 1.2, 0.08, 0.5);
    for (let q = 1; q < 4; q++) {
      f.use('painted', { snow: 0 }).box(0x4a4440, sx, CURB + q * 0.55, depth - 0.35, 1.2, 0.03, 0.5);
      f.use('plastic', { snow: 0 });
      for (let g = 0; g < 4; g++) f.box(pickR([0xc8402a, 0x2a6ab0, 0xe0b020, 0x3a8a4a, 0xe8e4da, 0x8a3a6a]), sx - 0.45 + g * 0.3, CURB + q * 0.55 + 0.03, depth - 0.35, 0.22, 0.2 + (g % 2) * 0.08, 0.3);
    }
  }
  f.use('painted').box(band, cx, CURB + 3.2, -0.08, w - 0.1, 0.95, 0.08);
  const sw = Math.min(w - 1.0, name.length * 0.62 + 1.2);
  f.sign(textFace(name, sw, 0.7, { bg: hex(band), fg: o.fg ?? '#f2f0e8', ppm: 180, scale: 0.78, weight: '600', glow: o.glow ?? true }), cx, CURB + 3.67, -0.125, sw, 0.7, Math.PI);
  if (o.awning) f.use('fabric', { snow: 1 }).boxC(o.awning, cx, CURB + 2.95, -0.75, w - 0.6, 0.05, 1.5, 0, -0.32);
  return { door: f.W(doorX, -1.6) };
}

// ---------------------------------------------------------------------------------------------
// Centrum: a 1970s low-rise centre around a torg, with a car park and a loading zone.
export function centrumBlock(bf, r) {
  // (a lighter slab and less remnant snow in the joints: shaded paving reads grey, not navy-speckled)
  bf.useF('paving', { snow: 0.4 }).flat(0xb0aea8, 0, 0, 62, 62, CURB + 0.015);
  // North wing (front at z -18 facing +z) and west wing (front at x -18 facing +x).
  const nw = bf.sub(31, -18, Math.PI), ww = bf.sub(-18, -18, -Math.PI / 2);
  flatBuilding(nw, 0, 0, 62, 13, 4.6, { surface: 'brick', wall: 0x8a4a3a, capC: 0x3a3d40, recess: { depth: 1.6, h: 3.1 } });
  flatBuilding(ww, 0, 0, 28, 13, 4.6, { surface: 'brick', wall: 0x8a4a3a, capC: 0x3a3d40, recess: { depth: 1.6, h: 3.1 } });
  // Upper floor over the Livs: offices (vårdcentral, tandläkare).
  nw.use('plaster').box(0xd6cebc, 45.5, CURB + 4.6, 7.2, 33, 3.2, 12.2);
  // (coping round the edge, snow inside: no full-size steel cap)
  nw.use('painted', { snow: 0.5 });
  for (const sd of [-1, 1]) { nw.box(0x3a3d40, 45.5, CURB + 7.8, 7.2 + sd * 6.0, 33.1, 0.16, 0.3); nw.box(0x3a3d40, 45.5 + sd * 16.4, CURB + 7.8, 7.2, 0.3, 0.16, 11.7); }
  nw.use('snow').box(0xeceef0, 45.5, CURB + 7.7, 7.2, 32.6, 0.18, 11.8);
  nw.use('metal', { snow: 1 }).box(0x9a9ea0, 52, CURB + 7.8, 8.5, 1.8, 0.9, 1.1).box(0x9a9ea0, 38, CURB + 7.8, 6.0, 1.2, 0.7, 1.2);
  for (let k = 0; k < 10; k++) winLite(nw, 30.6 + k * 3.1, CURB + 5.4, 1.1, 1.8, 1.3, Math.PI);
  nw.sign(textFace('Vårdcentral · Tandläkare', 6.0, 0.55, { bg: '#f2f0e8', fg: '#1e3a5a', ppm: 160, scale: 0.7, weight: '600' }), 45.5, CURB + 7.15, 1.05, 6.0, 0.55, Math.PI);
  const shops = [
    [29, 49, 'Livs', { band: 0x2f5a3a, doorX: 33 }],
    [21, 29, 'Pizzeria Roma', { band: 0x7a2a22, awning: 0x2a4a2a }],
    [14.5, 21, 'Frisör', { band: 0x2e3134 }],
    [7, 14.5, 'Apotek', { band: 0x2a5a3a, fg: '#f2f0e8' }],
    [0.3, 7, 'Café', { band: 0x5a3a2a, awning: 0x8a2a22 }],
  ];
  const doors = {};
  for (const [a, b, name, o] of shops) doors[name] = shopfront(nw, a, b, name, o).door;
  for (const [a, b, name, o] of [[0.3, 12, 'Bibliotek', { band: 0x2a3a5a }], [12, 18, 'Kiosk', { band: 0x9a7a2a, fg: '#1a1a1a' }], [18, 27.7, 'Second hand', { band: 0x4a3a4a }]]) shopfront(ww, a, b, name, o);
  // Livs extras: carts, bike racks, a red post box.
  trolleyShelter(bf, -12.5, -13.6, 0);
  bf.prop('cart', -8.6, -14.4, 0.3);
  for (let k = 0; k < 5; k++) bf.prop('bike', 6 + k * 0.85, -14.8, 0);
  bf.use('metal'); for (let k = 0; k < 6; k++) bf.boxC(0x9a9da0, 5.6 + k * 0.85, CURB + 0.35, -14.9, 0.04, 0.6, 0.5, 0, 0, 0);
  // Newspaper stand by the Livs, an advertising pillar on the torg, a big plowed pile at its edge.
  newsStand(bf.sub(-4.6, -15.2, 0));
  adPillar(bf, 10.5, 1.5);
  bf.pile(-27.5, 6.5, 2.6, 1.6);
  bf.pile(27.5, -12.5, 2.0, 1.3);
  bf.use('painted').box(0xd8b030, -7.5, CURB, -16.9, 0.45, 1.2, 0.35);
  bf.solid(-7.5, -16.9, 0.5, 0.4, CURB + 1.2, 'postbox');
  // Torg: the Christmas tree, benches, planters, a clock post, lamps.
  const jx = 4, jz = -3;
  // The town Christmas tree: a light string spiralling up just inside its branch tips.
  const xt = tree(bf.S, bf.wx(jx, jz), bf.wz(jx, jz), 0.85, 'spruce', r), M = xt.meta;
  bf.use('light', { snow: 0 });
  for (let k = 0; k < 90; k++) {
    const t = k / 90, a = t * TAU * 7.5, tt = 0.04 + t * 0.9, h = CURB + (M.base + tt * (M.top - M.base)) * xt.sy, rr = M.R(tt) * xt.s * 0.8 + 0.1;
    bf.box(pickR([0xffd890, 0xffe8c0, 0xffcf70], r), jx + Math.cos(a) * rr, h, jz + Math.sin(a) * rr, 0.07, 0.07, 0.07);
  }
  for (const [x, z, y] of [[-6, 2, 0], [14, 2, 0], [-10, -8, Math.PI / 2], [20, -8, -Math.PI / 2]]) bf.prop('bench', x, z, y);
  for (const [x, z] of [[-4, -10], [12, -10], [0, 6], [8, 6], [-12, 4]]) bf.prop('planter', x, z, 0);
  for (const [x, z] of [[-6, 6.5], [16, 6.5], [-12, -10], [22, -13]]) bf.plamp(x, z, 4.0);
  // A grill kiosk on the torg, more benches and planters, a second bike rack by the café.
  korvkiosk(bf, 26.5, -8.5, Math.PI / 2);
  for (const [x, z, y] of [[26.5, -3.2, -Math.PI / 2], [-14, 6.0, 0]]) bf.prop('bench', x, z, y);
  for (const [x, z] of [[18, -14.5], [24.5, 2.5], [-15, -2]]) bf.prop('planter', x, z, 0);
  bf.use('metal'); for (let k = 0; k < 5; k++) bf.boxC(0x9a9da0, 25.0 + k * 0.85, CURB + 0.35, -14.9, 0.04, 0.6, 0.5);
  for (let k = 0; k < 3; k++) bf.prop('bike', 25.4 + k * 0.85, -14.8, 0);
  // Slush trodden across the torg: from the car park to the Livs, to the café and the pizzeria, and
  // grey patches by the doors.
  for (const [ax, az, bx, bz, w] of [[-2.5, 14, -2, -15, 1.6], [0, 0, 10, -14.5, 1.2], [8, 2, 22, -14.5, 1.2]]) slushTrack(bf, ax, az, bx, bz, w, Math.floor(r() * 99));
  for (const [x, z, w, d] of [[-2, -15.6, 2.6, 1.3], [22, -15.6, 2.0, 1.1], [9, -15.4, 1.6, 1.0]]) slush(bf, x, z, w, d, 0, Math.floor(r() * 99), 0xa8acb0);
  aBoard(bf, 1.5, -14.2, 0.2, 'DAGENS\nLUNCH\n85:-\nfika 25:-', '#2e3134', '#f2f0e8');
  bf.prop('papperskorg', -2, 2.4, 0); bf.prop('papperskorg', 18, -12, 0);
  bf.use('metal').cyl(0x2e3431, 22, CURB + 1.6, 4, 0.08, 3.2, 8);
  bf.use('painted').box(0x2e3431, 22, CURB + 3.2, 4, 0.75, 0.75, 0.22);
  bf.sign(picto('clock'), 22, CURB + 3.58, 4.12, 0.62, 0.62, 0);
  bf.sign(picto('clock'), 22, CURB + 3.58, 3.88, 0.62, 0.62, Math.PI);
  bf.circ(22, 4, 0.12);
  // Car park south of the torg, entered from the east street.
  bf.useF('asphalt').flat(C.lot, 0, 20.5, 62, 21, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, 32.8, 18.75, 3.7, 6.5, CURB + 0.033);
  KEEP(bf, 33, 18.75, 4.5);
  const nb = bayRow(bf, -28, 21, 2.7, 13.0, 5);
  const sb = bayRow(bf, -28, 21, 2.7, 24.5, 5);
  bf.use('concrete').box(C.granite, 0, CURB, 10.1, 62, 0.14, 0.2);
  // Kerbed islands with a tree at the row ends and in the middle of each row; a weekday morning:
  // about half the bays taken; slush in the empty ones.
  for (const z of [13.0, 24.5]) { island(bf, -29.9, z, 2.2, 4.8, { tree: 'birch', ts: 0.7, r, seed: 61 }); island(bf, nb[10], z, 2.5, 4.8, { tree: 'lime', ts: 0.62, shrubs: 1, r, seed: 62 }); }
  for (let k = 0; k < 21; k++) {
    if (k === 10) continue;
    if (k >= 2) { if (r() < 0.45) bf.car(pickR(CARS, r), nb[k], 13.0, Math.PI, { color: pickR(CAR_COLS, r) }); else if (r() < 0.4) slush(bf, nb[k], 13.4, 1.8, 3.2, 0, k); }
    if (r() < 0.4) bf.car(pickR(CARS, r), sb[k], 24.5, 0, { color: pickR(CAR_COLS, r) }); else if (r() < 0.4) slush(bf, sb[k], 24.0, 1.8, 3.2, 0, k + 40);
  }
  snowFringe(bf.F, bf.wx(-31, 30.9), bf.wz(-31, 30.9), bf.wx(31, 30.9), bf.wz(31, 30.9), -1, CURB + 0.03, 71, { reach: 0.55 });
  // Loading zone: the two westmost bays of the north row (6-18: the patrol writes up a car there at
  // any hour of the game's day, and so does the lapplisa).
  for (const k of [0, 1]) bf.decal(decal('last'), nb[k], 12.6, 2.2, 0.7, Math.PI / 2);
  bf.post(-28.4, 10.6, 0, [{ f: textFace('LASTZON\n6–18', 0.6, 0.42, { bg: '#f4f2ea', fg: '#1a1a1a', ppm: 260, scale: 0.75, weight: '700' }), w: 0.6, h: 0.42 }], { top: 2.3 });
  bf.post(31.1, 15.0, Math.PI / 2, [{ f: picto('p'), w: 0.6, h: 0.6 }, { f: textFace('2 tim\n8–18', 0.6, 0.3, { ppm: 260, scale: 0.72 }), w: 0.6, h: 0.3 }, pskivaFace()]);
  // The supermarket's car park: a p-skiva, two hours 8-18 (game/pskiva.js); the loading zone's bays not
  // without a permit.
  parkingLot('centrum', { name: 'Centrum, Livs parkering', sign: 'P 2 tim 8–18 · p-skiva', rule: { disc: 120, hours: [8, 18] }, signAt: [bf.wx(31.1, 15.0), bf.wz(31.1, 15.0), bf.yaw + Math.PI / 2] });
  nb.forEach((x, k) => { if (k !== 10) bf.bay(x, 13.0, Math.PI, 'centrum', k < 2 ? { rule: { permit: 'lastzon', hours: [6, 18] } } : {}); });
  sb.forEach((x, k) => { if (k !== 10) bf.bay(x, 24.5, 0, 'centrum'); });
  bf.post(16, 9.6, 0, [{ f: textFace('Räddningsväg', 0.6, 0.18, { bg: '#f4f2ea', fg: '#b01e1e', border: '#b01e1e', ppm: 260, scale: 0.72 }), w: 0.6, h: 0.18 }], { top: 2.0 });
  for (const x of [-15, 5, 25]) bf.lamp(x, 29.5, Math.PI, 6.4);
  snowPile(bf.S, bf.wx(29.3, 29.0), bf.wz(29.3, 29.0), 2.0, 1.3);
  snowPile(bf.S, bf.wx(-29.3, 29.0), bf.wz(-29.3, 29.0), 2.0, 1.1);
  bf.mark('centrum', -2, -14.8, Math.PI);
  bf.mark('pizzeria', ...lxz(bf, doors['Pizzeria Roma']), Math.PI);
  V(bf, nb[0], 13.0, Math.PI, 'loading', 'centrum');
  V(bf, nb[1], 13.0, Math.PI, 'loading', 'centrum');
  V(bf, 13.5, -2.0, Math.PI / 2 + 0.25, 'firelane', 'centrum');
  for (let k = 0; k < 5; k++) LIT(bf, R(-25, 25, r), R(16, 20, r));
  for (let k = 0; k < 4; k++) LIT(bf, R(-14, 26, r), R(-12, 6, r));
}
// Newspaper stand (tidningsställ): a green metal box with today's headlines.
function newsStand(f) {
  f.use('painted').box(0x2f4a3a, 0, CURB, 0, 0.9, 1.15, 0.45);
  f.use('painted').boxC(0x263c30, 0, CURB + 1.18, 0.02, 0.96, 0.05, 0.52, 0, 0.15);
  f.sign(textFace('KVÄLLSPRESSEN\nSnökaos väntar –\nså klarar du vintern', 0.78, 0.5, { bg: '#f6f2e6', fg: '#b01e1e', ppm: 300, weight: '700', scale: 0.8 }), 0, CURB + 0.75, -0.235, 0.78, 0.5, Math.PI);
  f.solid(0, 0, 0.9, 0.45, CURB + 1.2, 'stand');
}
// Advertising pillar (reklampelare) with posters and a little dome.
function adPillar(f, lx, lz) {
  f.use('painted').cyl(0x2e3431, lx, CURB + 0.15, lz, 0.62, 0.3, 16);
  f.use('painted').cyl(0xe8e4da, lx, CURB + 1.45, lz, 0.55, 2.3, 16);
  f.use('painted').cyl(0x2e3431, lx, CURB + 2.65, lz, 0.62, 0.1, 16);
  f.use('metalroof').add(PRIM.dome(), 0x3a5a48, lx, CURB + 2.7, lz, 0, 1.2, 0.5, 1.2);
  const P = [['Konsert\nlördag 19.00\nKyrkan', '#2a3a5a', '#f2f0e8'], ['Julmarknad\n1:a advent\nTorget', '#8a1e1e', '#f6f2e6'], ['Loppis\nsöndag', '#f5c518', '#1a1a1a'], ['Bio\nfredag 19.30', '#1e1e1e', '#f2f0e8']];
  P.forEach(([t, bg, fg], k) => { const a = (k / 4) * TAU + 0.3; f.sign(textFace(t, 0.7, 1.0, { bg, fg, ppm: 220, weight: '700', scale: 0.6 }), lx + Math.sin(a) * 0.565, CURB + 1.45, lz + Math.cos(a) * 0.565, 0.7, 1.0, a); });
  f.circ(lx, lz, 0.62);
}

function lxz(f, [x, z]) { const dx = x - f.ox, dz = z - f.oz; return [dx * f.c - dz * f.s, dx * f.s + dz * f.c]; }

// ---------------------------------------------------------------------------------------------
// Sjukhuset: a six-storey main building, the Akutmottagning under a drive-in canopy, a paid
// car park with meters.
export function hospitalBlock(bf, r) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const mf = bf.sub(22, -15, Math.PI);
  flatBuilding(mf, 0, 0, 42, 16, 20.3, { surface: 'plaster', wall: 0xd9d3c4 });
  for (let fl = 0; fl < 6; fl++) {
    const y = CURB + 1.2 + fl * 3.25;
    mf.use('painted').box(0xb8b0a0, 21, y - 0.55, -0.03, 42.1, 0.32, 0.06).box(0xb8b0a0, 21, y - 0.55, 16.03, 42.1, 0.32, 0.06);
    for (let k = 0; k < 14; k++) {
      if (fl === 0 && k >= 4 && k <= 6) continue;
      winLite(mf, 1.5 + k * 3.0, y, 0, 2.2, 1.5, Math.PI);
      winLite(mf, 1.5 + k * 3.0, y, 16, 2.2, 1.5, 0);
    }
  }
  mf.use('painted').box(0x1e4a7a, 21, CURB + 18.85, -0.07, 13.4, 1.5, 0.08);
  mf.sign(textFace('SJUKHUSET', 12, 1.4, { bg: '#1e4a7a', fg: '#f2f0e8', ppm: 90, scale: 0.78, weight: '700', glow: true }), 21, CURB + 19.6, -0.13, 12, 1.4, Math.PI);
  // Facade: two stair towers with tall glazed slots, a plant room on the roof.
  for (const tx of [1.5, 40.5]) {
    mf.use('plaster').box(0xcfc8b8, tx, CURB, -0.7, 3.0, 21.2, 1.4);
    for (let fl = 0; fl < 6; fl++) winLite(mf, tx, CURB + 2.0 + fl * 3.25, -1.4, 0.9, 2.2, Math.PI, 0x5a5e62, false);
    mf.use('metal').box(0x5a5e62, tx, CURB + 21.2, -0.7, 3.1, 0.12, 1.5);
    mf.solid(tx, -0.7, 3.0, 1.4, 99, 'building');
  }
  mf.use('metal').box(0x8a8e92, 21, CURB + 20.4, 8, 14, 2.8, 7);
  mf.use('painted'); for (let k = 0; k < 12; k++) mf.box(0x6a6e72, 15 + k, CURB + 21.0, 4.48, 0.5, 1.6, 0.04);
  mf.roof(0x5a5e62, 21, CURB + 23.25, 8, 14.4, 7.4, 0.03);
  // Main entrance: a glass vestibule under a big canopy with the hospital's name on its fascia.
  const ex = 6;
  vestibule(bf.sub(ex, -12.05, Math.PI), 7.6, 2.9, 3.0, { lobby: 0x8e8270 });
  bf.use('concrete').box(0xb8b6b0, ex, CURB + 3.7, -11.0, 15.0, 0.25, 6.6);
  bf.cam(ex, -11.0, 15.0, 6.6, CURB + 3.5, CURB + 4.05);
  bf.use('painted').box(0x1e4a7a, ex, CURB + 3.55, -7.72, 15.0, 0.6, 0.06);
  bf.use('light', { snow: 0 }); for (let k = 0; k < 4; k++) bf.box(glow(0xfff4e6, 1.4), ex - 5.4 + k * 3.6, CURB + 3.66, -10.0, 1.6, 0.03, 0.4);
  for (const x of [ex - 6.8, ex + 6.8]) { bf.use('metal').box(0x9a9da0, x, CURB, -8.2, 0.22, 3.7, 0.22); bf.circ(x, -8.2, 0.15); }
  bf.solid(ex, -13.5, 7.6, 2.9, 99, 'building');
  bf.sign(textFace('Sjukhuset · Huvudentré', 6.4, 0.5, { bg: '#1e4a7a', fg: '#f2f0e8', ppm: 180, scale: 0.68, weight: '600', glow: true }), ex, CURB + 3.85, -7.68, 6.4, 0.5, 0);
  // Wayfinding: blue posts with white text.
  const way = (lx, lz, ly, t) => { bf.use('painted').box(0x1e4a7a, lx, CURB, lz, 0.12, 2.2, 0.12); bf.use('painted').box(0x1e4a7a, lx, CURB + 1.3, lz, 0.7, 0.9, 0.06, ly); bf.sign(textFace(t, 0.66, 0.86, { bg: '#1e4a7a', fg: '#f2f0e8', ppm: 300, weight: '600', scale: 0.5, align: 'left' }), lx + Math.sin(ly) * 0.035, CURB + 1.75, lz + Math.cos(ly) * 0.035, 0.66, 0.86, ly); bf.circ(lx, lz, 0.1); };
  way(-0.6, -6.4, 0, '↑ Huvudentré\n← Akuten\n→ Parkering');
  way(-9.6, 1.0, Math.PI / 2, '← Akut-\nmottagning\nAmbulans');
  way(-28.6, 6.4, Math.PI / 2, 'Sjukhuset\nBesökare P\n→ Entré');
  // Smoking shelter (rökruta) off to the side, bike racks by the entrance path.
  const sh = bf.sub(19.6, -11.6, 0);
  sh.use('metal'); for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) sh.box(0x5a5e62, x, CURB, z, 0.06, 2.2, 0.06);
  sh.roof(0x4a4e52, 0, CURB + 2.25, 0, 2.9, 1.6, 0.06, 0, { fh: 0.12, fascia: 0x4a4e52 });
  tglass(sh, 0, CURB + 0.1, 0.6, 2.6, 2.0, 0.02); tglass(sh, -1.3, CURB + 0.1, 0, 0.02, 2.0, 1.2); tglass(sh, 1.3, CURB + 0.1, 0, 0.02, 2.0, 1.2);
  sh.use('wood').box(0x7a5a3e, 0, CURB + 0.45, 0.35, 2.2, 0.05, 0.35);
  sh.sign(textFace('Rökruta', 0.7, 0.2, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 300, weight: '600' }), 0, CURB + 2.05, -0.62, 0.7, 0.2, Math.PI);
  for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) sh.circ(x, z, 0.08);
  sh.solid(0, 0.6, 2.6, 0.12, 99, 'shelter');
  bf.use('metal'); for (let k = 0; k < 5; k++) bf.boxC(0x9a9da0, -4.2 + k * 0.8, CURB + 0.35, -12.4, 0.04, 0.6, 0.5);
  for (let k = 0; k < 4; k++) bf.prop('bike', -4.2 + k * 0.8 + (k % 2) * 0.05, -12.3, Math.PI);
  bf.mark('hospitalEntrance', ex, -6.5, Math.PI);
  // Akut wing (two storeys, front facing +x) and the drive-in canopy.
  const aw = bf.sub(-20, -31, -Math.PI / 2);
  flatBuilding(aw, 0, 0, 28, 11, 7.0, { surface: 'plaster', wall: 0xcfc8b8 });
  for (let fl = 0; fl < 2; fl++) for (let k = 0; k < 8; k++) { if (fl === 0 && (k === 6 || k === 7)) continue; winLite(aw, 1.8 + k * 3.4, CURB + 1.1 + fl * 3.2, 0, 2.0, 1.4, Math.PI); }
  for (let fl = 0; fl < 2; fl++) for (let k = 0; k < 8; k++) winLite(aw, 1.8 + k * 3.4, CURB + 1.1 + fl * 3.2, 11, 2.0, 1.4, 0);
  aw.use('painted').box(0xb8b0a0, 14, CURB + 3.0, 11.03, 28.1, 0.3, 0.06);
  aw.use('glass').box(null, 22, CURB, -0.03, 2.4, 2.4, 0.04);
  aw.use('metal').box(0x5a5e62, 22, CURB + 2.4, -0.06, 2.6, 0.12, 0.06);
  bf.use('concrete').box(0xb8b6b0, -14, CURB + 4.3, -9, 12.6, 0.45, 10.4);
  bf.cam(-14, -9, 12.6, 10.4, CURB + 3.6, CURB + 4.8);
  bf.use('painted').box(0xf2f0e8, -7.75, CURB + 3.65, -9, 0.08, 0.6, 10.4);
  for (const z of [-13.6, -4.4]) { bf.use('concrete').box(0xb8b6b0, -8.4, CURB, z, 0.45, 4.3, 0.45); bf.solid(-8.4, z, 0.45, 0.45, 99, 'pillar'); }
  bf.sign(textFace('AKUTMOTTAGNING', 7.0, 0.6, { bg: '#f2f0e8', fg: '#c01e1e', ppm: 150, scale: 0.75, weight: '700', glow: true }), -7.69, CURB + 3.95, -9, 7.0, 0.6, Math.PI / 2);
  bf.useF('asphalt').flat(C.lot, -14, -9, 12.6, 10.4, CURB + 0.03);
  bf.decal(decal('ambulans'), -12.0, -6.2, 3.4, 0.9, Math.PI / 2);
  lines(bf, [[-12.0, -4.4, 4.2, 0.12], [-12.0, -13.6, 4.2, 0.12], [-14.05, -9.0, 0.12, 9.3], [-9.95, -9.0, 0.12, 9.3]], 0xd8b030);
  bf.car('van', -12.3, -10.5, Math.PI, { color: 0xf0f0ec });
  bf.mark('hospital', -16.6, -6.6, -Math.PI / 2);
  // Akut driveway (round 5). The wing stands between the west street and the canopy, so drivers come
  // in by their own entrance just south of the wing (a dropped kerb over the sidewalk, signposted),
  // over a paved apron between the wing / canopy and the car park, and turn north into the canopy's
  // drive lane (between the wing's door and the ambulance bay). hospitalDrop: where a car stops to
  // let someone off, beside the Akut door, its tail clear of the 'hospital' standing spot.
  bf.useF('asphalt').flat(C.lot, -32.8, 1.3, 3.7, 6.6, CURB + 0.033);
  KEEP(bf, -33, 1.3, 4.6);
  bf.useF('asphalt').flat(C.lot, -19.5, -2.45, 23, 2.9, CURB + 0.03);
  bf.mark('hospitalDrop', -17.3, -11.0, Math.PI, { w: 2.6, l: 5.2 });
  way(-30.3, -2.45, -Math.PI / 2, '↑ Akut-\nmottagning\nAvlämning');
  bf.post(-7.3, -2.6, Math.PI / 2, [{ f: picto('stoppforbud'), w: 0.56, h: 0.56 }, { f: textFace('Ambulans', 0.56, 0.18, { ppm: 260, scale: 0.75 }), w: 0.56, h: 0.18 }], { top: 2.4 });
  // Paid car park.
  bf.useF('asphalt').flat(C.lot, 0, 15, 62, 32, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, 0, 32.8, 8, 3.7, CURB + 0.033);
  bf.useF('asphalt').flat(C.lot, -32.8, 10, 3.7, 7, CURB + 0.033);
  KEEP(bf, 0, 33, 5); KEEP(bf, -33, 10, 4.5);
  const r1 = bayRow(bf, -6, 3, 3.6, 2.5, 5).concat(bayRow(bf, 4.8, 9, 2.6, 2.5, 5));
  const r2 = bayRow(bf, -28, 21, 2.7, 14.0, 5);
  const r3 = bayRow(bf, -28, 21, 2.7, 19.0, 5);
  for (const k of [0, 1]) bf.decal(decal('hcp'), r1[k], 2.7, 1.4, 1.4, Math.PI);
  bf.mark('hospitalSpot', r1[5], 2.5, Math.PI, { w: 2.6, l: 5.0 });
  V(bf, r1[0], 2.5, Math.PI, 'handicap', 'hospital');
  V(bf, r1[1], 2.5, Math.PI, 'handicap', 'hospital');
  V(bf, -14.5, 0.6, Math.PI, 'firelane', 'hospital');
  r1.forEach((x, k) => { if (k > 1 && k !== 5 && r() < 0.25) bf.car(pickR(CARS, r), x, 2.5, Math.PI, { color: pickR(CAR_COLS, r) }); });
  // Planted islands across the double row (middle and east end), the west end short of the west
  // entrance; ~40 % of the bays taken, slush in some empty ones; plowed piles at the far corners.
  island(bf, r2[10], 16.5, 2.5, 9.8, { tree: 'birch', ts: 0.75, shrubs: 2, r, seed: 81 });
  island(bf, 29.9, 16.5, 2.2, 9.8, { tree: 'lime', ts: 0.6, r, seed: 82 });
  island(bf, -29.9, 17.9, 2.2, 7.0, { shrubs: 2, lamp: true, lyaw: Math.PI / 2, r, seed: 83 });
  r2.forEach((x, k) => { if (k === 10) return; if (r() < 0.4) bf.car(pickR(CARS, r), x, 14.0, 0, { color: pickR(CAR_COLS, r) }); else if (r() < 0.35) slush(bf, x, 14.2, 1.8, 3.0, 0, k); });
  r3.forEach((x, k) => { if (k === 10) return; if (r() < 0.4) bf.car(pickR(CARS, r), x, 19.0, Math.PI, { color: pickR(CAR_COLS, r) }); else if (r() < 0.35) slush(bf, x, 18.8, 1.8, 3.0, 0, k + 30); });
  bf.pile(-27.5, 29.0, 2.0, 0.9, true, Math.PI * 0.85);
  bf.pile(27.5, 29.0, 2.2, 1.0, true, -Math.PI * 0.85);
  snowFringe(bf.F, bf.wx(-31, 31.0), bf.wz(-31, 31.0), bf.wx(-4.5, 31.0), bf.wz(-4.5, 31.0), -1, CURB + 0.03, 72, { reach: 0.5 });
  snowFringe(bf.F, bf.wx(4.5, 31.0), bf.wz(4.5, 31.0), bf.wx(31, 31.0), bf.wz(31, 31.0), -1, CURB + 0.03, 73, { reach: 0.5 });
  bf.prop('meter', -30.2, 4.0, Math.PI / 2);
  bf.prop('meter', 30.2, 8.2, -Math.PI / 2);
  bf.prop('meter', -10, 30.4, Math.PI);
  // Visitors' parking: three hours with a p-skiva 8-18, longer at the meters (game/pskiva.js); the two
  // wide bays by the entrance for the disabled.
  bf.post(4.6, 30.8, 0, [{ f: picto('p'), w: 0.6, h: 0.6 }, { f: textFace('3 tim\n8–18', 0.6, 0.3, { ppm: 260, scale: 0.72 }), w: 0.6, h: 0.3 }, pskivaFace(), { f: textFace('Längre: betala\ni automaten', 0.6, 0.24, { ppm: 260, scale: 0.7 }), w: 0.6, h: 0.24 }]);
  parkingLot('sjukhuset', { name: 'Sjukhusets besöksparkering', sign: 'P 3 tim 8–18 · p-skiva', rule: { disc: 180, hours: [8, 18] }, signAt: [bf.wx(4.6, 30.8), bf.wz(4.6, 30.8), bf.yaw] });
  r1.forEach((x, k) => bf.bay(x, 2.5, Math.PI, 'sjukhuset', { w: k < 3 ? 3.6 : 2.6, rule: k < 2 ? { permit: 'handikapp' } : null }));
  r2.forEach((x, k) => { if (k !== 10) bf.bay(x, 14.0, 0, 'sjukhuset'); });
  r3.forEach((x, k) => { if (k !== 10) bf.bay(x, 19.0, Math.PI, 'sjukhuset'); });
  for (const x of [-20, 0, 20]) bf.lamp(x, 30.6, Math.PI, 6.4);
  for (const [x, z] of [[-27, 28], [27, 28], [26, -6], [28, -2]]) bf.tree(x, z, R(0.9, 1.1, r), 'birch', r);
  bf.prop('bench', 14, -9.8, 0); bf.prop('papperskorg', 12.5, -9.8, 0);
  for (let k = 0; k < 4; k++) LIT(bf, R(-25, 25, r), R(6, 11, r));
}

// ---------------------------------------------------------------------------------------------
// White church with a tower, inside a fieldstone wall.
export function churchBlock(bf, r) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const wall = 0xe9e5dc, roofC = 0x2a2c2e;
  // Nave (ridge along x), choir to the east, tower to the west.
  const granite = 0x6e6c6a;
  const nave = gableHouse(bf, -9, -7.5, 22, 11, { wallH: 7.6, pitch: 0.92, wall, surface: 'plaster', gableSurface: 'plaster', roof: 'metalroof', roofC, plinth: 0.75, plinthC: granite, ov: 0.45, gov: 0.3 });
  gableHouse(bf, 13, -5.5, 5.5, 7, { wallH: 6.2, pitch: 0.92, wall, surface: 'plaster', gableSurface: 'plaster', roof: 'metalroof', roofC, plinth: 0.75, plinthC: granite, ov: 0.35, gov: 0.25 });
  for (const z of [-7.5, 3.5]) for (let k = 0; k < 4; k++) archWin(bf, -6 + k * 4.8, CURB + 2.5, z, 1.3, 3.9, z < 0 ? Math.PI : 0);
  for (const z of [-5.5, 1.5]) archWin(bf, 15.75, CURB + 2.4, z, 1.0, 2.8, z < 0 ? Math.PI : 0);
  // Tower: square shaft, belfry openings, clock faces, a tall black spire with a gilded ball.
  const tx = -12.25, tz = -2, TW = 6.5, TH = 19;
  bf.use('concrete').box(granite, tx, CURB - 0.05, tz, TW + 0.12, 0.85, TW + 0.12);
  bf.use('plaster').box(wall, tx, CURB + 0.5, tz, TW, TH, TW);
  bf.use('metal').box(0x3a3c3e, tx, CURB + 0.5 + TH, tz, TW + 0.3, 0.25, TW + 0.3);
  bf.use(PRIM ? 'metalroof' : 'metalroof').add(hipGeo(), roofC, tx, CURB + 0.75 + TH, tz, 0, TW + 0.5, 14, TW + 0.5);
  bf.use('chrome').sphere(0xc8a040, tx, CURB + TH + 15.0, tz, 0.5);
  bf.use('chrome').box(0xc8a040, tx, CURB + TH + 15.9, tz, 0.08, 1.4, 0.08).box(0xc8a040, tx, CURB + TH + 16.2, tz, 0.7, 0.08, 0.08);
  for (const [ly, ox, oz] of [[Math.PI, 0, -TW / 2], [0, 0, TW / 2], [-Math.PI / 2, -TW / 2, 0], [Math.PI / 2, TW / 2, 0]]) {
    const nx = Math.sin(ly), nz = Math.cos(ly);
    bf.use('painted').box(0x2a2a2a, tx + ox + nx * 0.02, CURB + TH - 3.6, tz + oz + nz * 0.02, 1.4, 2.2, 0.06, ly);
    bf.sign(picto('clock'), tx + ox + nx * 0.05, CURB + TH - 5.6, tz + oz + nz * 0.05, 1.6, 1.6, ly);
    archWin(bf, tx + ox, CURB + 6.3, tz + oz, 0.8, 1.9, ly);
  }
  bf.solid(tx, tz, TW, TW, 99, 'building');
  // West door in the tower: a heavy panelled double door in a dressed-granite surround.
  churchDoor(bf, tx - TW / 2, CURB + 0.5, tz, 2.0, 3.0, -Math.PI / 2, granite);
  bf.use('concrete').box(0x9a9894, tx - TW / 2 - 1.0, CURB, tz, 2.0, 0.48, 3.4);
  bf.solid(tx - TW / 2 - 1.0, tz, 2.0, 3.4, CURB + 0.48, 'step');
  bf.mark('church', tx - TW / 2 - 3.6, tz, Math.PI / 2);
  // Gravel paths: the south gate up to the church, round to the tower door.
  bf.useF('gravel').flat(C.gravel, 0, 18.5, 3.2, 25, CURB + 0.03);
  bf.useF('gravel').flat(C.gravel, -10, 6.5, 23.2, 3.2, CURB + 0.03);
  bf.useF('gravel').flat(C.gravel, -20.5, 2.5, 3.2, 11, CURB + 0.03);
  bf.useF('gravel').flat(C.gravel, 24, 0, 14, 3.2, CURB + 0.03);
  // Fieldstone wall with gates (south and east).
  stoneWall(bf, -30.6, -30.6, 30.6, -30.6, r);
  stoneWall(bf, -30.6, 30.6, -2.2, 30.6, r);
  stoneWall(bf, 2.2, 30.6, 30.6, 30.6, r);
  stoneWall(bf, -30.6, -30.6, -30.6, 30.6, r);
  stoneWall(bf, 30.6, -30.6, 30.6, -2.2, r);
  stoneWall(bf, 30.6, 2.2, 30.6, 30.6, r);
  KEEP(bf, 0, 33, 3); KEEP(bf, 33, 0, 3);
  // A lychgate (stiglucka) in the south gate, a shovelled path up to the church lined with lanterns.
  lychgate(bf.sub(0, 30.6, 0));
  for (const sx of [-1, 1]) {
    bf.bank(sx * 1.95, 8.6, sx * 1.95, 29.2, 0.55, 0.22, 60 + sx, { skirt: 0.2, dirty: sx });
    for (let z = 10; z < 29; z += 6) lantern(bf, sx * 2.5, z);
  }
  bf.bank(-19.5, 8.3, -1.9, 8.3, 0.55, 0.22, 63, { skirt: 0.2, dirty: -1 });
  bf.bank(-22.3, 1.5, -22.3, 7.8, 0.5, 0.2, 64, { skirt: 0.2, dirty: -1 });
  // Big old lindens along the wall, a few graves, lamps.
  for (const [x, z] of [[-26, -26], [-10, -27], [8, -27], [26, -26], [-27, 12], [-26, 26], [26, 25], [27, 10], [14, 26], [-14, 26]]) bf.tree(x, z, R(1.05, 1.3, r), 'bare', r);
  graves(bf, 6, 12, 3, 5, r);
  graves(bf, -26, 14, 4, 3, r);
  for (const [x, z] of [[2.5, 12], [2.5, 24], [-18, 8.5]]) bf.plamp(x, z, 3.6);
  bf.prop('bench', 10, 8.6, Math.PI); bf.prop('papperskorg', 12, 8.6, 0);
  LIT(bf, 0, 28); LIT(bf, -8, 6.5);
}

// Fieldstone wall (kallmur): two courses of rounded, varied granite boulders with a tarred board
// roof on top, like an old Swedish churchyard wall.
const stoneGeos = [];
function stoneGeo(v) {
  if (stoneGeos[v]) return stoneGeos[v];
  let g = new THREE.IcosahedronGeometry(0.5, 1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise3(x * 2.4, y * 2.4, z * 2.4, v * 3 + 1) - 0.5) * 0.32; p.setXYZ(i, x * k, y * k * 0.85, z * k); }
  g.computeVertexNormals();
  return (stoneGeos[v] = g);
}
// Stones: grey and pink granite, dark diabase, weathered pale ones; each with its own patch of grey-
// green lichen; three irregular courses of big and small stones over a dark core (the gaps read as
// deep joints, not as daylight).
const STONE_C = [0x76736f, 0x868079, 0x5f5c58, 0x93796c, 0x8a6e62, 0x3e3c3b, 0x9a948a, 0x6c6560, 0x4e4b48];
function stoneWall(f, x0, z0, x1, z1, r) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  f.use('concrete', { snow: 0.4 }); f.S.add(PRIM.box(), 0x48443f, mat(f.wx((x0 + x1) / 2, (z0 + z1) / 2), CURB + 0.42, f.wz((x0 + x1) / 2, (z0 + z1) / 2), 0, f.yaw + yaw, 0, 0.34, 0.78, L - 0.1));
  const stone = (x, z, y, s, sh) => {
    const side = (r() - 0.5) * 0.14;
    f.use('concrete', { snow: 0.35 });
    f.S.add(stoneGeo(Math.floor(r() * 6)), pickR(STONE_C, r), mat(f.wx(x + uz * side, z - ux * side), y, f.wz(x + uz * side, z - ux * side), (r() - 0.5) * 0.6, r() * TAU, (r() - 0.5) * 0.6, s * (1.0 + r() * 0.35), s * sh, Math.min(0.85, s * 1.15)));
    fineTex(f.S, 1.3);
    // lichen: a grey-green / yellowish blotch on part of the stone, darker underneath
    const lc = r() < 0.6, cy = y + s * (0.1 + r() * 0.2);
    shadeLast(f.S, (px, py) => { const k = py < y - s * 0.2 ? 0.7 : 1; return lc && py > cy ? [k * 0.95, k * 1.0, k * 0.86] : [k, k, k]; });
  };
  for (const [y, s0, s1] of [[CURB + 0.2, 0.42, 0.72], [CURB + 0.56, 0.3, 0.6], [CURB + 0.84, 0.25, 0.45]]) {
    let t = (r() - 0.5) * 0.3;
    while (t < L) {
      const s = s0 + (s1 - s0) * r() ** 1.5, tt = Math.min(L - 0.15, t + s / 2);
      stone(x0 + ux * tt, z0 + uz * tt, y + (r() - 0.5) * 0.08, s, 0.8 + r() * 0.25);
      // small fill stones in the joint behind
      if (r() < 0.45) { const t2 = Math.min(L - 0.1, t + s * 0.95); stone(x0 + ux * t2, z0 + uz * t2, y + (r() - 0.3) * s * 0.4, 0.14 + r() * 0.12, 0.8); }
      t += s * (0.66 + r() * 0.12);
    }
  }
  // Board roof (tarred, dark) on the top.
  f.use('wood').add(PRIM.prism(), 0x3a3029, (x0 + x1) / 2, CURB + 0.92, (z0 + z1) / 2, yaw + Math.PI / 2, L, 0.16, 0.66);
  const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  f.solid((x0 + x1) / 2, (z0 + z1) / 2, ax ? L : 0.85, ax ? 0.85 : L, CURB + 1.0, 'wall');
}

// Round-arched church window: a deep white surround, a pane below, a half-disc pane on top, glazing
// bars. (lx, lz) on the wall, ly the outward normal, y the sill, w x h overall.
const halfDisc = new THREE.CircleGeometry(0.5, 14, 0, Math.PI);
function archWin(f, lx, y, lz, w, h, ly, trim = 0xf0ece4) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  const at = (a, n) => [lx + ax * a + nx * n, lz + az * a + nz * n];
  const hr = h - w / 2, b = 0.11;
  let p;
  f.use('glass');
  p = at(0, 0.012); f.box(null, p[0], y, p[1], w, hr, 0.02, ly);
  p = at(0, 0.024); f.add(halfDisc, null, p[0], y + hr, p[1], ly, w, w, 1);
  f.use('painted');
  for (const s of [-1, 1]) { p = at(s * (w / 2 + b / 2), 0.04); f.box(trim, p[0], y, p[1], b, hr, 0.08, ly); }
  p = at(0, 0.06); f.box(trim, p[0], y - 0.14, p[1], w + 2 * b + 0.06, 0.14, 0.14, ly);
  // The arch: short trim pieces round the half circle.
  const R = w / 2 + b / 2, n = 9;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (k + 0.5) / n, len = 2 * R * Math.sin(Math.PI / (2 * n)) + 0.02;
    p = at(Math.cos(a) * R, 0.04); f.boxC(trim, p[0], y + hr + Math.sin(a) * R, p[1], len, b, 0.08, ly, 0, a - Math.PI / 2);
  }
  // Glazing bars: one upright, three across, and the spring line.
  p = at(0, 0.03); f.box(trim, p[0], y, p[1], 0.04, hr + w / 2 - 0.02, 0.03, ly);
  for (let k = 1; k <= 3; k++) { p = at(0, 0.03); f.box(trim, p[0], y + (hr * k) / 4, p[1], w, 0.04, 0.03, ly); }
  p = at(0, 0.03); f.box(trim, p[0], y + hr - 0.02, p[1], w, 0.05, 0.03, ly);
}

// Heavy panelled double door (dark oak) with iron straps, in a dressed-granite surround with an
// arched head.
function churchDoor(f, lx, y, lz, w, h, ly, granite) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  const at = (a, n) => [lx + ax * a + nx * n, lz + az * a + nz * n];
  let p;
  f.use('concrete');
  for (const s of [-1, 1]) { p = at(s * (w / 2 + 0.2), 0.08); f.box(granite, p[0], y - 0.02, p[1], 0.4, h, 0.18, ly); }
  p = at(0, 0.08); f.box(granite, p[0], y + h - 0.02, p[1], w + 0.8, 0.45, 0.18, ly);
  p = at(0, 0.09); f.add(halfDisc, granite, p[0], y + h + 0.43, p[1], ly, w + 0.8, 0.9, 1);
  f.use('wood');
  p = at(0, 0.03); f.box(0x4a3020, p[0], y, p[1], w, h, 0.06, ly);
  for (const s of [-1, 1]) for (let q = 0; q < 3; q++) { p = at(s * w / 4, 0.07); f.box(0x553826, p[0], y + 0.25 + q * 0.95, p[1], w / 2 - 0.25, 0.75, 0.04, ly); }
  f.use('metal');
  for (const yy of [0.5, 2.4]) { p = at(0, 0.1); f.box(0x2a2a2a, p[0], y + yy, p[1], w - 0.1, 0.06, 0.02, ly); }
  for (const s of [-0.12, 0.12]) { p = at(s, 0.11); f.box(0x2a2a2a, p[0], y + 1.2, p[1], 0.05, 0.3, 0.05, ly); }
}

// Stiglucka: the roofed churchyard gate. Frame at the gate's centre in the wall, local +z = out.
function lychgate(f) {
  f.use('wood');
  for (const sx of [-1.9, 1.9]) for (const sz of [-0.9, 0.9]) { f.box(0x5a4632, sx, CURB, sz, 0.2, 2.5, 0.2); f.circ(sx, sz, 0.14); }
  for (const sz of [-0.9, 0.9]) f.box(0x5a4632, 0, CURB + 2.45, sz, 4.2, 0.2, 0.2);
  for (const sx of [-1.9, 1.9]) f.box(0x5a4632, sx, CURB + 2.45, 0, 0.2, 0.2, 2.0);
  f.use('painted').add(PRIM.prism(), 0xe8e4da, 0, CURB + 2.65, 0, Math.PI / 2, 2.2, 1.3, 3.6);
  const p = 0.86, L = 1.55 / Math.cos(p);
  f.use('tile').boxC(0x4a3a30, -1.05, CURB + 3.32, 0, L + 0.2, 0.1, 2.9, 0, 0, p).boxC(0x4a3a30, 1.05, CURB + 3.32, 0, L + 0.2, 0.1, 2.9, 0, 0, -p);
  f.use('painted').boxC(0x2e3134, 0, CURB + 4.08, 0, 0.22, 0.12, 2.92);
  // The gate leaves, swung open against the wall.
  f.use('wood');
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) f.box(0x6a5440, s * 1.75, CURB + 0.1, -0.95 - 0.12 - k * 0.27, 0.05, 1.3, 0.1);
  for (const s of [-1, 1]) f.box(0x6a5440, s * 1.75, CURB + 0.9, -1.75, 0.06, 0.1, 1.6);
}

// A small lantern on a post along the church path, lit.
function lantern(f, lx, lz) {
  f.use('painted').box(0x1e1e1e, lx, CURB, lz, 0.08, 1.05, 0.08);
  f.use('painted').box(0x1e1e1e, lx, CURB + 1.05, lz, 0.22, 0.04, 0.22).box(0x1e1e1e, lx, CURB + 1.33, lz, 0.24, 0.05, 0.24);
  f.use('light', { snow: 0 }).box(glow(0xffc880, 1.0), lx, CURB + 1.09, lz, 0.16, 0.24, 0.16);
  f.use('painted').add(PRIM.cone(4), 0x1e1e1e, lx, CURB + 1.44, lz, Math.PI / 4, 0.28, 0.16, 0.28);
  f.circ(lx, lz, 0.08);
}

// Rows of gravestones in a quarter: origin (x0, z0) is the first stone; stones face -z.
function graves(f, x0, z0, rows, cols, r, skip = null) {
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = x0 + j * 1.8 + (r() - 0.5) * 0.15, z = z0 + i * 2.7;
    if (skip && skip(x, z)) continue;
    gravestone(f, x, z, r);
  }
}
function gravestone(f, x, z, r, o = {}) {
  const shape = o.shape ?? r();
  const col = o.color ?? pickR([0x5a5a5c, 0x4a4a4e, 0x2e2e30, 0x5e4a44, 0x6a6866, 0x3e3a3c, 0x525456], r);
  const w = o.w ?? R(0.55, 0.85, r), h = o.h ?? R(0.55, 1.0, r);
  f.use('concrete').box(jit(col, 0.06, r), x, CURB, z, w + 0.2, 0.12, 0.42);
  if (shape < 0.65) f.use('concrete').box(col, x, CURB + 0.12, z, w, h, 0.16);
  else { f.use('concrete').box(col, x, CURB + 0.12, z, w, h * 0.75, 0.16); f.use('concrete').cyl(col, x, CURB + 0.12 + h * 0.75, z, w / 2, 0.16, 12, Math.PI / 2); }
  // Low hedge frame on some plots, a lantern on many.
  // A bed of spruce twigs (granris) in front of many stones, as graves are dressed for winter.
  if (r() < 0.45 && !o.noFrame) granris(f.S, f.wx(x, z - 0.75), f.wz(x, z - 0.75), w + 0.2, 0.7, 0.16, f.yaw);
  if ((r() < 0.45 || o.lantern) && !o.noLantern) {
    f.use('painted').box(0x1e1e1e, x + w * 0.3, CURB + 0.12, z - 0.35, 0.13, 0.2, 0.13);
    f.use('light', { snow: 0 }).box(r() < 0.6 ? 0xff5030 : 0xffd090, x + w * 0.3, CURB + 0.16, z - 0.35, 0.09, 0.12, 0.09);
  }
  f.solid(x, z, w + 0.2, 0.42, CURB + 0.12 + h, 'grave');
}

// A grave lantern (gravlykta): black metal frame, see-through panes, a pointed lid with a ring, a
// candle burning inside.
function graveLantern(f, x, z) {
  const y0 = CURB + 0.12;
  f.use('painted').box(0x1a1a1a, x, y0, z, 0.16, 0.03, 0.16);
  for (const sx of [-0.07, 0.07]) for (const sz of [-0.07, 0.07]) f.box(0x1a1a1a, x + sx, y0 + 0.03, z + sz, 0.012, 0.2, 0.012);
  f.box(0x1a1a1a, x, y0 + 0.23, z, 0.17, 0.02, 0.17);
  f.add(PRIM.cone(4), 0x1a1a1a, x, y0 + 0.3, z, Math.PI / 4, 0.24, 0.12, 0.24);
  f.use('metal').add(PRIM.torus(), 0x2a2a2a, x, y0 + 0.39, z, 0, 0.06, 0.06, 0.06);
  tglass(f, x, y0 + 0.035, z, 0.13, 0.19, 0.13);
  f.use('painted', { snow: 0 }).cyl(0xf0e8d8, x, y0 + 0.08, z, 0.03, 0.09, 10);
  f.use('light', { snow: 0 }).add(PRIM.cone(8), 0xffb050, x, y0 + 0.155, z, 0, 0.022, 0.05, 0.022);
  f.use('light', { snow: 0 }).sphere(0xffd890, x, y0 + 0.14, z, 0.016, 0.022, 0.016);
}

// ---------------------------------------------------------------------------------------------
// Cemetery with Sonja's grave, a gate towards the church and a flower kiosk.
export function cemeteryBlock(bf, r) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  // Paths: main path from the north gate, cross paths, a perimeter path.
  // (phase 4 r2) The gravel with its partial snow showed as brown smudges between the graves in the
  // finale's wide shots. The main path and the entrance are shovelled and gravelled (no snow, a ragged
  // rim of trodden snow along them); the cross and perimeter paths are trodden snow.
  bf.useF('gravel', { snow: 0 }).flat(C.gravel, 0, -3, 3.2, 56, CURB + 0.03);
  bf.useF('gravel', { snow: 0 }).flat(C.gravel, 0, -27.5, 8, 7, CURB + 0.031);
  for (const sd of [-1, 1]) bf.fringe(sd * 1.6, -24.0, sd * 1.6, 25.0, -sd, CURB + 0.032, 41 + sd, { reach: 0.22 });
  for (const z of [-18, -4, 10, 22]) trodPath(bf, -26, z, 26, z, 2.4, 50 + z, CURB + 0.028);
  for (const x of [-26, 26]) trodPath(bf, x, -19, x, 23, 2.4, 60 + x, CURB + 0.029);
  // Thuja hedge around, gates in the north (to the church) and east.
  // (phase 4 r2: a darker, olive thuja green; each plant's own tone is in kit.hedge)
  const H = 1.7, hc = 0x384432;
  const ho = { bronze: 1.0 };   // thuja: bronze-olive patches in winter
  // (the north hedge stops short of the gate pillars: the Kyrkogården plaque must stay readable)
  for (const [x0, x1] of [[-30.6, -3.5], [3.5, 30.6]]) bf.hedge((x0 + x1) / 2, -30.5, x1 - x0, 0.9, H, 0, hc, true, ho);
  bf.hedge(0, 30.5, 61.2, 0.9, H, 0, hc, true, ho);
  bf.hedge(-30.5, 0, 0.9, 61.2, H, 0, hc, true, ho);
  bf.hedge(30.5, -16.5, 0.9, 28, H, 0, hc, true, ho); bf.hedge(30.5, 16.5, 0.9, 28, H, 0, hc, true, ho);
  KEEP(bf, 0, -33, 3.2); KEEP(bf, 33, 0, 3);
  // Gate pillars and the open wrought-iron gates.
  for (const s of [-1, 1]) {
    bf.use('concrete').box(0x8a8682, s * 2.9, CURB, -30.5, 0.7, 2.0, 0.7);
    bf.use('concrete').box(0x7a7672, s * 2.9, CURB + 2.0, -30.5, 0.85, 0.15, 0.85);
    bf.solid(s * 2.9, -30.5, 0.7, 0.7, 99, 'pillar');
    // (round 6) Both leaves open inwards by the same angle (ga), and every part of a leaf lies on one
    // line from its hinge: the point t along it is (gx - s cos(ga) t, -30.5 + sin(ga) t), and the
    // rails turn so their local +x runs along that line (three's rotation.y maps local +x to
    // (cos a, -sin a)). Round 5 turned the rails off the bars' line and swung one leaf outwards
    // over the plaque: loose sticks in front of the pillar.
    const gx = s * 2.45, ga = 1.25, L = 2.2;
    const P = (t) => [gx - s * Math.cos(ga) * t, -30.5 + Math.sin(ga) * t];
    const ry = Math.atan2(-Math.sin(ga), -s * Math.cos(ga));
    bf.use('painted', { snow: 0.3 });
    // hinge and latch stiles, nine bars with spear tips between them
    for (const t of [0.03, L - 0.03]) { const [px, pz] = P(t); bf.box(0x1e1e1e, px, CURB + 0.05, pz, 0.045, 1.66, 0.045, ry); }
    for (let k = 0; k < 9; k++) {
      const [px, pz] = P((k + 1) / 10 * L);
      bf.box(0x1e1e1e, px, CURB + 0.1, pz, 0.022, 1.62, 0.022, ry);
      bf.add(PRIM.cone(4), 0x1e1e1e, px, CURB + 1.77, pz, ry + Math.PI / 4, 0.05, 0.1, 0.05);
    }
    // top, middle and bottom rails along the leaf, and a pair of hinge straps on the pillar side
    const [mx, mz] = P(L / 2);
    for (const y of [CURB + 1.58, CURB + 1.32, CURB + 0.2]) bf.boxC(0x1e1e1e, mx, y, mz, L, 0.045, 0.03, ry);
    for (const y of [CURB + 0.35, CURB + 1.45]) { const [hx, hz] = P(0.0); bf.boxC(0x1e1e1e, hx, y, hz, 0.12, 0.05, 0.05, ry); }
  }
  bf.use('painted').box(0x2e3134, -2.9, CURB + 1.28, -30.87, 0.62, 0.3, 0.02);
  bf.sign(textFace('Kyrkogården', 0.6, 0.28, { bg: '#2e3134', fg: '#e8e4d8', ppm: 420, scale: 0.6, weight: '600' }), -2.9, CURB + 1.43, -30.885, 0.58, 0.27, Math.PI);
  bf.mark('cemetery', 0, -28.6, 0);
  // Quarters of graves (stones face north, towards the visitor standing on the north side).
  const sonja = { x: 6.2, z: -21.2 };
  const skipNear = (x, z) => (Math.abs(x - sonja.x) < 1.2 && Math.abs(z - sonja.z) < 1.0) || Math.abs(x) < 2.6;
  for (const [x0, z0, rows] of [[-23.5, -26.5, 3], [3.2, -26.5, 3], [-23.5, -12.5, 3], [3.2, -12.5, 3], [-23.5, 1.5, 3], [3.2, 1.5, 3], [-23.5, 13.8, 3], [3.2, 13.8, 3]]) {
    graves(bf, x0, z0, rows, 12, r, (x, z) => skipNear(x, z) || (x0 < 0 && x > -2.8) || (x > -11 && x < -3.5 && z < -25));
  }
  // Sonja's stone: dark polished granite, gilded name, a lantern and a bare little rose.
  gravestone(bf, sonja.x, sonja.z, r, { shape: 0.9, color: 0x2a2b2e, w: 0.8, h: 0.95, noFrame: true, noLantern: true });
  bf.sign(textFace('SONJA', 0.6, 0.2, { bg: null, fg: '#c8a860', ppm: 400, scale: 0.85, weight: '600', cutout: true }), sonja.x, CURB + 0.84, sonja.z - 0.085, 0.6, 0.2, Math.PI);
  bf.sign(textFace('1966–2025', 0.5, 0.1, { bg: null, fg: '#c8a860', ppm: 500, scale: 0.8, weight: '500', cutout: true }), sonja.x, CURB + 0.66, sonja.z - 0.085, 0.5, 0.1, Math.PI);
  granris(bf.S, bf.wx(sonja.x, sonja.z - 0.7), bf.wz(sonja.x, sonja.z - 0.7), 1.1, 0.75, 0.18, bf.yaw);
  graveLantern(bf, sonja.x + 0.3, sonja.z - 0.3);
  // a single red rose laid on the spruce twigs
  { const [ax, az] = bf.W(sonja.x - 0.15, sonja.z - 0.95), [bx, bz] = bf.W(sonja.x - 0.32, sonja.z - 0.55);
    bf.use('bark'); limb(bf.S, ax, CURB + 0.13, az, bx, CURB + 0.15, bz, 0.005, 0.004, 0x3a5a2a, 4);
    bf.use('plastic').sphere(0x9a0f1a, sonja.x - 0.33, CURB + 0.16, sonja.z - 0.53, 0.045, 0.04, 0.06);
    bf.use('foliage').sphere(0x2e4a26, sonja.x - 0.28, CURB + 0.14, sonja.z - 0.62, 0.05, 0.012, 0.03); }
  bf.mark('sonjaGrave', sonja.x, sonja.z - 1.55, 0);
  // Where the story lays the flowers (round 5): on the plinth's front ledge, between the stone's
  // face (z - 0.08) and the plinth's front edge (z - 0.21), left of the lantern; y = the plinth top.
  bf.mark('graveFlowers', sonja.x - 0.12, sonja.z - 0.15, 0, { y: CURB + 0.12 });
  // Minneslund: a boulder ringed by candles.
  bf.use('concrete').add(PRIM.ico(1), 0x7a7874, bf.wx(-14, 26.5), CURB + 0.2, bf.wz(-14, 26.5), 0, 0.4, 2.4, 1.4, 1.9);
  bf.circ(-14, 26.5, 1.1, CURB + 1.2);
  bf.use('light', { snow: 0 });
  for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; bf.box(r() < 0.5 ? 0xff5030 : 0xffd090, -14 + Math.cos(a) * 1.9, CURB + 0.02, 26.5 + Math.sin(a) * 1.5, 0.08, 0.1, 0.08); }
  bf.sign(textFace('Minneslund', 0.9, 0.22, { bg: '#2e3134', fg: '#e8e4d8', ppm: 260, scale: 0.7 }), -14, CURB + 0.6, 24.3, 0.9, 0.22, Math.PI);
  bf.use('metal').box(0x5a5e62, -14.45, CURB, 24.33, 0.04, 0.5, 0.04).box(0x5a5e62, -13.55, CURB, 24.33, 0.04, 0.5, 0.04);
  // Linden alley along the main path, birches by the hedge.
  for (const z of [-24, -11, 3, 16]) { bf.tree(-2.9, z + 3, R(1.05, 1.25, r), 'bare', r); bf.tree(2.9, z, R(1.05, 1.25, r), 'bare', r); }
  for (const [x, z] of [[-28, -28], [28, -27], [-28, 28], [28, 28]]) bf.tree(x, z, R(0.95, 1.15, r), 'birch', r);
  // Water post with watering cans by the gate.
  bf.use('metal').box(0x4a5a4a, 4.6, CURB, -27.8, 0.12, 1.1, 0.12);
  bf.use('metal').box(0x9a9da0, 4.6, CURB + 0.95, -27.95, 0.04, 0.04, 0.25);
  bf.use('plastic');
  for (let k = 0; k < 3; k++) bf.box(0x2a6a3a, 5.4 + k * 0.4, CURB, -27.8, 0.25, 0.32, 0.4);
  bf.solid(4.9, -27.8, 1.4, 0.5, CURB + 1.1, 'post');
  // Flower kiosk inside the hedge corner by the gate.
  const k = bf.sub(-7.5, -28.4, 0);
  gableHouse(k, -2.2, -1.5, 4.4, 3.0, { wallH: 2.4, pitch: 0.55, wall: 0x2f4a3a, roof: 'tile', roofC: C.roofBlack, plinth: 0.15, ov: 0.35, gov: 0.25 });
  k.use('painted').box(0xe8e4da, 0, CURB + 1.0, -1.54, 2.4, 0.12, 0.35);
  k.use('glass').box(null, 0, CURB + 1.15, -1.53, 2.2, 0.68, 0.03);
  k.use('painted').box(0xe8e4da, 0, CURB + 1.86, -1.55, 2.4, 0.34, 0.04);
  k.sign(textFace('BLOMMOR', 2.2, 0.3, { bg: '#e8e4da', fg: '#2f4a3a', ppm: 240, scale: 0.8, weight: '700' }), 0, CURB + 2.03, -1.58, 2.2, 0.3, Math.PI);
  // Wreath stand: spruce wreaths with red ribbons.
  k.use('metal').box(0x3a3a3a, 2.9, CURB, -2.0, 0.05, 1.5, 0.05).box(0x3a3a3a, 2.9, CURB + 1.45, -2.0, 0.05, 0.05, 1.2);
  for (let q = 0; q < 3; q++) {
    k.use('spruce').add(PRIM.torus(), 0x33462c, 2.9, CURB + 0.45 + q * 0.42, -2.0, Math.PI / 2, 0.42, 0.42, 0.9);
    k.use('fabric', { snow: 0 }).box(0x9a1e1e, 2.9, CURB + 0.28 + q * 0.42, -1.98, 0.06, 0.14, 0.06);
  }
  k.solid(2.9, -2.0, 0.4, 0.5, CURB + 1.5, 'stand');
  bf.mark('flowerShop', -7.5, -32.4 + 0.6, 0);
  LIT(bf, 0, -27); LIT(bf, 1, -10);
}

// ---------------------------------------------------------------------------------------------
// Bilhallen: a showroom and a lot of used cars, facing the street on local -z.
export function dealerBlock(bf0, r) {
  const bf = bf0.sub(0, 0, Math.PI / 2);   // street (x = 200) at local z = -31
  bf.useF('asphalt').flat(C.lot, 0, -6, 62, 50, CURB + 0.03);
  bf.useF('grass').flat(C.lawn, 0, 25, 62, 12, CURB + 0.02);
  bf.useF('asphalt').flat(C.lot, 0, -32.8, 10, 3.7, CURB + 0.033);
  KEEP(bf, 0, -33, 5.5);
  // Showroom: steel frame and see-through glass on the street side and the west end; inside, a
  // polished floor, ceiling lights, a desk and two cars on show (parked cars flagged indoor).
  const sx0 = -14, sz0 = -4, SW_ = 26, SD = 14, SH = 5.6, ID = 7.5;
  bf.use('plaster').box(0xd8d8d4, sx0 + SW_ / 2, CURB, sz0 + ID + (SD - ID) / 2, SW_, SH, SD - ID);
  bf.use('plaster').box(0xd8d8d4, sx0 + SW_ - 0.15, CURB, sz0 + ID / 2, 0.3, SH, ID);
  for (let k = 0; k < 8; k++) tglass(bf, sx0 + 1.6 + k * 3.25, CURB + 0.1, sz0 + 0.05, 3.1, SH - 0.5, 0.03);
  for (let k = 0; k < 2; k++) tglass(bf, sx0 + 0.05, CURB + 0.1, sz0 + 1.6 + k * 3.2, 0.03, SH - 0.5, 3.05);
  bf.use('plaster').box(0xd8d8d4, sx0 + 0.15, CURB, sz0 + 6.95, 0.3, SH, 1.1);
  bf.use('metal');
  for (let k = 0; k <= 8; k++) bf.box(0x3a3d40, sx0 + k * 3.25, CURB, sz0 + 0.0, 0.14, SH, 0.14);
  for (let k = 0; k <= 2; k++) bf.box(0x3a3d40, sx0, CURB, sz0 + k * 3.2, 0.14, SH, 0.14);
  // fascia band round the roof edge (its top is the coping) and an even snow field inside it
  // (a full-size steel cap showed as camouflage blotches from the air)
  {
    const cx = sx0 + SW_ / 2, cz = sz0 + SD / 2, W = SW_ + 0.4, D = SD + 0.4, t = 0.3;
    for (const sd of [-1, 1]) { bf.box(0x3a3d40, cx, CURB + SH, cz + sd * (D - t) / 2, W, 0.62, t); bf.box(0x3a3d40, cx + sd * (W - t) / 2, CURB + SH, cz, t, 0.62, D - 2 * t); }
    bf.use('metal').box(0x3a3d40, cx, CURB + SH - 0.02, cz, W - 0.2, 0.3, D - 0.2);
    bf.use('snow').box(0xeceef0, cx, CURB + SH + 0.28, cz, W - 2 * t + 0.1, 0.22, D - 2 * t + 0.1);
    bf.use('painted').box(0x6a6e70, cx - 6, CURB + SH + 0.5, cz + 2, 0.95, 0.42, 0.95);
    bf.use('metal', { snow: 1 }).box(0x9a9ea0, cx + 7, CURB + SH + 0.5, cz + 1, 1.8, 0.9, 1.1);
  }
  bf.use('concrete', { snow: 0 }).box(0xd4d0c8, sx0 + SW_ / 2, CURB, sz0 + ID / 2, SW_ - 0.4, 0.03, ID);
  bf.use('light', { snow: 0 });
  for (let k = 0; k < 4; k++) for (const z of [2.0, 5.0]) bf.box(glow(0xfff4e6, 1.4), sx0 + 3.5 + k * 6.3, CURB + SH - 0.06, sz0 + z, 2.6, 0.04, 0.5);
  // The welcome sign hangs from the ceiling just inside the glass, centred in one bay (phase 4 r2b:
  // 7.6 m wide on the back wall, 7.5 m behind the 3.25 m mullion grid, a mullion always cut through
  // its text - "Välkom|men till Bil..."). 0.3 m behind the glass and 2.6 m wide in the 3.1 m pane,
  // no mullion reaches its edge from up to ~45 degrees off the glass's normal.
  {
    const x = sx0 + 4.5 * 3.25, z = sz0 + 0.3, y0 = CURB + 3.0, top = CURB + SH - 0.02;
    bf.use('painted', { snow: 0 }).box(0x2a3a5a, x, y0, z + 0.02, 2.6, 0.95, 0.04);
    bf.use('metal', { snow: 0 });
    for (const dx of [-1.0, 1.0]) bf.cyl(0x9a9da0, x + dx, (y0 + 0.95 + top) / 2, z + 0.02, 0.008, top - y0 - 0.95, 5);
    bf.sign(textFace('Välkommen till\nBilhallen', 2.5, 0.85, { bg: '#2a3a5a', fg: '#f2f0e8', ppm: 220, weight: '700', scale: 0.8, glow: true }), x, y0 + 0.475, z - 0.005, 2.5, 0.85, Math.PI);
  }
  bf.use('wood', { snow: 0 }).box(0xe8e4da, sx0 + 19.5, CURB, sz0 + 5.6, 2.4, 1.05, 0.8);
  bf.car('volvo740', sx0 + 6.5, sz0 + 3.8, Math.PI / 2 + 0.5, { color: 0x8a1e1e, indoor: true });
  bf.car('saab900', sx0 + 13.5, sz0 + 3.6, Math.PI / 2 - 0.45, { color: 0x1e3a2a, indoor: true });
  // Colliders: the back, the glass walls and the east wall (the floor inside is open).
  bf.solid(sx0 + SW_ / 2, sz0 + ID + (SD - ID) / 2, SW_, SD - ID, 99, 'building');
  bf.solid(sx0 + SW_ / 2, sz0, SW_, 0.25, 99, 'glass');
  bf.solid(sx0, sz0 + ID / 2, 0.25, ID, 99, 'glass');
  bf.solid(sx0 + SW_ - 0.15, sz0 + ID / 2, 0.3, ID, 99, 'building');
  // Workshop behind with a roller door.
  const wf = bf.sub(16, 4, 0);
  flatBuilding(wf, 0, 0, 13, 12, 5.0, { surface: 'plaster', wall: 0xb8b4aa });
  wf.use('painted').box(0x7a7e82, 6.5, CURB, -0.04, 4.0, 3.8, 0.05);
  for (let q = 1; q < 12; q++) wf.use('painted').box(0x6a6e72, 6.5, CURB + q * 0.32, -0.07, 3.9, 0.03, 0.02);
  wf.sign(textFace('Verkstad', 2.2, 0.45, { bg: '#2a3a5a', fg: '#f2f0e8', ppm: 200 }), 6.5, CURB + 4.3, -0.07, 2.2, 0.45, Math.PI);
  // Pylon by the street.
  bf.use('metal').box(0x3a3d40, -24.5, CURB, -29.5, 0.3, 5.6, 0.3).box(0x3a3d40, -21.5, CURB, -29.5, 0.3, 5.6, 0.3);
  bf.use('painted').box(0x2a3a5a, -23, CURB + 3.4, -29.5, 3.6, 2.4, 0.4);
  for (const ly of [Math.PI, 0]) bf.sign(textFace('BILHALLEN\nBegagnade bilar', 3.3, 2.1, { bg: '#2a3a5a', fg: '#f2f0e8', ppm: 120, scale: 0.68, weight: '700', glow: true }), -23, CURB + 4.6, -29.5 + (ly ? -0.21 : 0.21), 3.3, 2.1, ly);
  bf.solid(-23, -29.5, 3.6, 0.5, 99, 'pylon');
  // Cars for sale in two rows with price boards; bunting over the lot.
  const prices = ['29 900:-', '44 500:-', '18 900:-', '67 000:-', '52 900:-', '35 000:-', '89 500:-', '24 900:-'];
  const slots = [-18, -12, -6, 0, 6, 12, 18, 24];
  slots.forEach((x, k) => {
    const z = k % 2 ? -14 : -22;
    if (k !== 3 && k !== 5) bf.car(['volvo740', 'saab900', 'golf', 'audi', 'volvo240', 'skoda', 'bmw', 'kombi'][k], x, z, Math.PI, { color: pickR(CAR_COLS, r) });
    bf.use('painted').box(0xf2f0e8, x + 1.6, CURB, z - 2.6, 0.6, 0.85, 0.04);
    bf.sign(textFace(prices[k], 0.56, 0.3, { bg: '#f2f0e8', fg: '#b01e1e', ppm: 300, scale: 0.75, weight: '700' }), x + 1.6, CURB + 0.65, z - 2.63, 0.56, 0.3, Math.PI);
  });
  for (const x of [-27, -9, 9, 27]) { bf.use('metal').cyl(0x9a9da0, x, CURB + 3.5, -26.5, 0.06, 7, 8); bf.circ(x, -26.5, 0.1); }
  bf.use('fabric', { snow: 0 });
  for (let k = 0; k < 54; k++) {
    const t = k / 54, x = -27 + t * 54, sag = Math.sin(((x + 27) % 18) / 18 * Math.PI) * 0.7;
    bf.boxC(pickR([0xb02a22, 0x2a4a8a, 0xd8b030, 0xe8e6e0], r), x, CURB + 6.7 - sag, -26.5, 0.35, 0.4, 0.01, 0, 0, Math.PI / 4);
  }
  // More stock: a row along each side of the forecourt, price boards on stands.
  [[-28, -3, 0], [-24, -3, 0], [-20, -3, 0], [17, -4, 0], [21, -4, 0], [25, -4, 0]].forEach(([x, z, y], k) => {
    bf.car(['volvo240', 'golf', 'kombi', 'skoda', 'volvo740', 'bmw'][k], x, z, Math.PI + y, { color: pickR(CAR_COLS, r) });
    bf.use('painted').box(0xf2f0e8, x + 1.4, CURB, z - 2.7, 0.6, 0.85, 0.04);
    bf.sign(textFace(['14 900:-', '22 500:-', '31 900:-', '39 000:-', '19 900:-', '74 500:-'][k], 0.56, 0.3, { bg: '#f2f0e8', fg: '#b01e1e', ppm: 300, scale: 0.75, weight: '700' }), x + 1.4, CURB + 0.65, z - 2.73, 0.56, 0.3, Math.PI);
  });
  bf.pile(29, -29, 2.0, 1.3, true, Math.PI * 0.75);
  bf.bank(-30, -9, -30, 18, 1.0, 0.45, 41, { dirty: -1 });
  // Kerbed planting strips along the street edge either side of the entrance, a 'car of the week'
  // on a low podium, slush on the forecourt.
  island(bf, -18.5, -30.2, 22, 1.6, { shrubs: 4, r, seed: 91 });
  island(bf, 18.5, -30.2, 22, 1.6, { shrubs: 4, r, seed: 92 });
  bf.use('concrete').cyl(0xb8b6b0, -25, CURB + 0.1, -12, 2.7, 0.2, 24);
  bf.solid(-25, -12, 4.6, 4.6, CURB + 0.2, 'podium');
  bf.car('bmw', -25, -12, Math.PI * 0.8, { color: 0x1e3a5a, podium: true });
  bf.post(-21.6, -10.4, Math.PI, [{ f: textFace('VECKANS BIL\n119 000:-', 0.8, 0.45, { bg: '#2a3a5a', fg: '#f2f0e8', ppm: 260, weight: '700', scale: 0.8 }), w: 0.8, h: 0.45 }], { top: 1.6 });
  for (const [x, z, w, d] of [[-8, -20, 2.6, 1.6], [14, -26, 3.2, 1.4], [2, -11, 1.8, 2.2], [24, -18, 2.4, 1.6]]) slush(bf, x, z, w, d, 0.4, Math.floor(r() * 99));
  bf.mark('dealer', -1, -7.2, 0);
  bf.mark('dealerLot', 0, -26, 0);
  // The race's finish (round 5): on the street (x = 200) in front of the driveway, in the
  // northbound lane (the race comes up from the south), heading along the road.
  bf.mark('dealerFinish', 0, -31 - 6.25, Math.PI / 2);
  for (const x of [-26, 26]) bf.lamp(x, -30.4, 0, 6.6);
  for (let k = 0; k < 3; k++) LIT(bf, R(-25, 25, r), R(-28, -9, r));
}

// ---------------------------------------------------------------------------------------------
// Förskolan Solrosen: wooden L-shaped building, fenced playground, drop-off bays.
export function preschoolBlock(bf0, r) {
  const bf = bf0.sub(0, 0, Math.PI);       // street (z = -120, south) at local z = -31
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const wall = 0xc4a050;
  const A = gableHouse(bf, -28, -20, 34, 10, { wallH: 3.1, pitch: 0.42, wall, roof: 'tile', roofC: C.roofRed, chimney: 1 });
  gableHouse(bf.sub(-23, -10, -Math.PI / 2), 0, -5, 16, 10, { wallH: 3.1, pitch: 0.42, wall, roof: 'tile', roofC: C.roofRed });
  for (let k = 0; k < 9; k++) { const x = -26 + k * 3.7; if (Math.abs(x + 6) > 1.6) win(bf, x, A.Y0 + 0.8, -20, 1.6, 1.3, Math.PI); win(bf, x, A.Y0 + 0.8, -10, 1.6, 1.3, 0); }
  door(bf, -6, A.Y0, -20, 1.3, 2.2, Math.PI, 0x2a5a3a);
  canopy(bf, -6, A.Y0 + 2.4, -20, 3.0, 1.6, Math.PI, C.metalBlack);
  bf.use('concrete').box(0x9a9894, -6, CURB, -20.8, 2.6, A.Y0 - CURB - 0.02, 1.6);
  bf.solid(-6, -20.8, 2.6, 1.6, A.Y0 - 0.02, 'step');
  bf.use('painted').box(0x2a5a3a, -13.4, A.Y0 + 2.2, -20.05, 5.2, 0.6, 0.04);
  bf.sign(textFace('Förskolan Solrosen', 4.0, 0.5, { bg: '#2a5a3a', fg: '#f6f2e6', ppm: 220, scale: 0.7, weight: '700' }), -12.9, A.Y0 + 2.5, -20.08, 4.0, 0.5, Math.PI);
  bf.sign(textFace('☀', 0.5, 0.5, { bg: '#2a5a3a', fg: '#f2c414', ppm: 220, scale: 0.86 }), -15.55, A.Y0 + 2.5, -20.08, 0.48, 0.48, Math.PI);
  bf.mark('preschool', -6, -23.4, 0);
  // Path from the street, drop-off bays (nose in), the stroller shed.
  bf.useF('paving').flat(C.paving, -6, -26.5, 2.4, 9.0, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, 12, -27.5, 30, 7, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, 12, -32.8, 30, 3.7, CURB + 0.033);
  KEEP(bf, 12, -33, 9);
  const bays = bayRow(bf, -1.5, 10, 2.7, -27.5, 5);
  bays.forEach((x, k) => { if (r() < 0.2) bf.car(pickR(CARS, r), x, -27.8, Math.PI, { color: pickR(CAR_COLS, r) }); });
  bf.post(-2.6, -24.6, Math.PI, [{ f: picto('p'), w: 0.56, h: 0.56 }, { f: textFace('Hämtning/lämning\nmax 10 min', 0.56, 0.3, { ppm: 280, scale: 0.72 }), w: 0.56, h: 0.3 }, { ...pskivaFace(), w: 0.56, h: 0.16 }], { top: 2.4 });
  // (ten minutes with a p-skiva, at any hour: game/pskiva.js)
  parkingLot('forskolan', { name: 'Förskolan Solrosen', sign: 'P 10 min · p-skiva', rule: { disc: 10, hours: [0, 24] }, signAt: [bf.wx(-2.6, -24.6), bf.wz(-2.6, -24.6), bf.yaw + Math.PI] });
  bays.forEach((x) => bf.bay(x, -27.65, Math.PI, 'forskolan'));
  V(bf, 8, -21.6, Math.PI / 2, 'firelane', 'preschool');
  const vs = bf.sub(16, -18.5, 0);
  vs.use('wood').box(0x7a2a1f, 0, CURB, 1.6, 8, 2.3, 0.12).box(0x7a2a1f, -4, CURB, 0, 0.12, 2.3, 3.3).box(0x7a2a1f, 4, CURB, 0, 0.12, 2.3, 3.3);
  vs.roof(C.metalBlack, 0, CURB + 2.4, 0, 8.5, 3.8, 0.08, 0, { fh: 0.2 });
  vs.solid(0, 1.6, 8, 0.2, 99, 'shed'); vs.solid(-4, 0, 0.2, 3.3, 99, 'shed'); vs.solid(4, 0, 0.2, 3.3, 99, 'shed');
  vs.sign(textFace('Vagnhall', 1.2, 0.26, { ppm: 240 }), 0, CURB + 2.1, -1.66, 1.2, 0.26, Math.PI);
  // Fenced playground behind.
  const fx0 = -16, fx1 = 29, fz0 = -8, fz1 = 29;
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2.0)), yaw = Math.atan2(x1 - x0, z1 - z0);
    bf.use('painted');
    for (let k = 0; k <= n; k++) bf.box(0x2a4a32, x0 + (x1 - x0) * k / n, CURB, z0 + (z1 - z0) * k / n, 0.06, 1.25, 0.06);
    bf.boxC(0x2a4a32, (x0 + x1) / 2, CURB + 1.2, (z0 + z1) / 2, 0.05, 0.05, L, yaw).boxC(0x2a4a32, (x0 + x1) / 2, CURB + 0.15, (z0 + z1) / 2, 0.05, 0.05, L, yaw);
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; addCard(twigFace('mesh', 0), bf.wx(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t), CURB + 0.68, bf.wz(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t), L / n, 1.0, bf.yaw + yaw + Math.PI / 2, 0.2); }
    const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    bf.solid((x0 + x1) / 2, (z0 + z1) / 2, ax ? L : 0.15, ax ? 0.15 : L, CURB + 1.25, 'fence');
  };
  fence(fx0, fz0, 12, fz0); fence(15.2, fz0, fx1, fz0); fence(fx1, fz0, fx1, fz1); fence(fx0, fz1, fx1, fz1); fence(fx0, fz0, fx0, fz1);
  bf.use('painted').boxC(0x2a4a32, 12.0 + 0.55 * Math.sin(0.9), CURB + 0.6, fz0 - 0.55 * Math.cos(0.9) - 0.1, 0.04, 1.2, 1.5, 0.9 - Math.PI / 2);
  bf.mark('preschoolGate', 13.6, fz0 - 1.6, 0);
  // Playground kit: sandbox, swings, climbing frame + slide, playhouse, a sledding mound, sleds.
  bf.use('wood').box(0x7a6048, 6, CURB, 4, 4, 0.3, 0.12).box(0x7a6048, 6, CURB, 7, 4, 0.3, 0.12).box(0x7a6048, 4, CURB, 5.5, 0.12, 0.3, 3).box(0x7a6048, 8, CURB, 5.5, 0.12, 0.3, 3);
  bf.use('snow').box(null, 6, CURB, 5.5, 3.8, 0.2, 2.9);
  bf.solid(6, 5.5, 4.1, 3.1, CURB + 0.3, 'sandbox');
  bf.use('painted');
  for (const s of [-2, 2]) { bf.boxC(0xb84a2a, 18 + s, CURB + 1.1, -0.6, 0.09, 2.3, 0.09, 0, 0.45).boxC(0xb84a2a, 18 + s, CURB + 1.1, 0.6, 0.09, 2.3, 0.09, 0, -0.45); bf.circ(18 + s, -1, 0.08); bf.circ(18 + s, 1, 0.08); }
  bf.boxC(0xb84a2a, 18, CURB + 2.18, 0, 4.3, 0.1, 0.1);
  for (const s of [-0.9, 0.9]) bf.use('rubber').boxC(0x1e1e1e, 18 + s, CURB + 0.6, 0, 0.45, 0.05, 0.2);
  bf.use('wood').box(0x8a6a4a, 22, CURB + 1.2, 14, 2.0, 0.08, 2.0);
  for (const [sx, sz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) bf.box(0x6a5038, 22 + sx, CURB, 14 + sz, 0.1, 2.4, 0.1);
  bf.use('tile').add(PRIM.prism(), 0x8a2a1f, 22, CURB + 2.4, 14, 0, 2.2, 0.8, 2.2);
  bf.use('plastic').boxC(0xd8a020, 22, CURB + 0.65, 11.6, 0.65, 0.05, 2.6, 0, 0.48);
  bf.solid(22, 14, 2.0, 2.0, CURB + 1.25, 'platform');
  playhouse2(bf, -9, 22);
  mound(bf, 8, 20, 6.5, 2.0);
  bf.prop('pulka', 3, 16, 0.4); bf.prop('pulka', 12, 25, 2.0); bf.prop('snowman', -4, 8, 0.3); bf.prop('snowman', 25, 4, 2.0);
  for (const [x, z] of [[-12, 26], [26, 26], [-12, -4], [27, -5]]) bf.tree(x, z, R(0.9, 1.1, r), 'birch', r);
  // Children warning signs on the street.
  bf.post(-20, -33.7, Math.PI, [{ f: picto('barn'), w: 0.7, h: 0.62 }], { top: 2.4 });
  bf.post(26, -33.7, Math.PI, [{ f: picto('barn'), w: 0.7, h: 0.62 }], { top: 2.4 });
  for (let k = 0; k < 2; k++) LIT(bf, R(-1, 25, r), R(-24, -22, r));
}
function playhouse2(f, x, z) {
  f.use('wood').box(C.falu, x, CURB, z, 2.2, 1.5, 1.8);
  f.add(PRIM.prism(), C.falu, x, CURB + 1.5, z, 0, 2.2, 0.8, 1.8);
  f.use('tile').boxC(C.roofBlack, x, CURB + 1.92, z - 0.5, 2.5, 0.06, 1.15, 0, -0.73).boxC(C.roofBlack, x, CURB + 1.92, z + 0.5, 2.5, 0.06, 1.15, 0, 0.73);
  f.use('painted').box(C.trim, x - 0.5, CURB, z - 0.92, 0.7, 1.2, 0.04);
  win(f, x + 0.5, CURB + 0.6, z - 0.9, 0.5, 0.5, Math.PI, { panes: 1, sill: false });
  f.solid(x, z, 2.2, 1.8, CURB + 1.6, 'shed');
}
// A snowy mound (pulkabacke): a smooth cap, its collider a hill of the same shape (snowhill.js; it
// was stepped circle floors, which stopped a car dead: feature snöhög).
export function mound(f, x, z, rad, h) {
  domeHill(f.wx(x, z), f.wz(x, z), rad, h);
  const seg = 28, rings = 7, pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, rr = rad * t, y = CURB - 0.05 + h * (1 - t * t) * (1 - t * 0.15) ** 2 * 1.02 + (i === rings ? 0 : 0.03);
    for (let j = 0; j < seg; j++) { const a = (j / seg) * TAU; pos.push(f.wx(x + Math.cos(a) * rr, z + Math.sin(a) * rr), i === rings ? CURB - 0.05 : y, f.wz(x + Math.cos(a) * rr, z + Math.sin(a) * rr)); }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let up = 0; for (let i = 0; i < g.attributes.normal.count; i++) up += g.attributes.normal.getY(i);
  if (up < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  f.S.use('snow').add(g, null, null);
}

// ---------------------------------------------------------------------------------------------
// Kommunhuset: four storeys of 1970s brick with window bands, flags, visitor parking.
export function kommunBlock(bf0, r) {
  const bf = bf0.sub(0, 0, Math.PI);       // street (z = -40, south) at local z = -31
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const kf = bf.sub(-22, -6, 0);
  flatBuilding(kf, 0, 0, 44, 16, 14.2, { surface: 'brick', wall: 0x6a4a3a, capC: 0x2e3134 });
  for (let fl = 0; fl < 4; fl++) {
    const y = CURB + 1.4 + fl * 3.3;
    for (const [z, ly] of [[0, Math.PI], [16, 0]]) {
      const nz = ly ? -1 : 1;
      kf.use('metal').box(0x2e3134, 22, y - 0.12, z + nz * 0.04, 43.6, 0.12, 0.08).box(0x2e3134, 22, y + 1.55, z + nz * 0.04, 43.6, 0.1, 0.08);
      for (let k = 0; k < 18; k++) { kf.use('glass').box(null, 1.2 + k * 2.42 + 0.0, y, z + nz * 0.03, 2.3, 1.55, 0.03); kf.use('metal').box(0x2e3134, 0.05 + k * 2.42, y, z + nz * 0.05, 0.08, 1.55, 0.05); }
    }
  }
  // Entrance pavilion with canopy and sign.
  vestibule(bf.sub(0, -10, 0), 8, 4, 3.2, { lobby: 0x84786a });
  bf.use('concrete').box(0xb0aea8, 0, CURB + 3.6, -11.5, 11, 0.35, 4);
  bf.cam(0, -11.5, 11, 4, CURB + 3.4, CURB + 4.0);
  for (const x of [-5, 5]) { bf.use('metal').box(0x2e3134, x, CURB, -13.2, 0.18, 3.6, 0.18); bf.circ(x, -13.2, 0.13); }
  bf.solid(0, -8, 8, 4, 99, 'building');
  bf.use('painted').box(0x2e3134, 0, CURB + 3.42, -13.53, 6.6, 0.72, 0.04);
  bf.sign(textFace('KOMMUNHUSET', 6.2, 0.62, { bg: '#2e3134', fg: '#f2f0e8', ppm: 150, scale: 0.72, weight: '700', glow: true }), 0, CURB + 3.78, -13.56, 6.2, 0.62, Math.PI);
  bf.mark('kommun', 0, -15.5, 0);
  // Forecourt, flagpoles with flags, a monument sign, birches.
  bf.useF('paving', { snow: 0.4 }).flat(0xb0aea8, 0, -20, 22, 16, CURB + 0.03);
  bf.useF('paving', { snow: 0.4 }).flat(0xb0aea8, 0, -32.8, 6, 3.7, CURB + 0.033);
  // The forecourt is used: benches, a bike rack with bikes, planters with granris, slush trodden
  // from the street and the car parks to the door.
  for (const [x, z, y] of [[-8.5, -17.0, 0], [8.5, -17.0, 0]]) bf.prop('bench', x, z, y);
  for (const [x, z] of [[-10, -14.6], [10, -14.6], [-10, -27], [10, -27]]) bf.prop('planter', x, z, 0);
  bf.use('metal'); for (let k = 0; k < 5; k++) bf.boxC(0x9a9da0, -6.0 + k * 0.85, CURB + 0.35, -26.6, 0.04, 0.6, 0.5);
  for (let k = 0; k < 3; k++) bf.prop('bike', -5.6 + k * 1.7, -26.5, 0);
  for (const [ax, az, bx, bz, w] of [[0, -31, 0, -14.5, 1.6], [-12, -24, -1.5, -15, 1.1], [12, -24, 1.5, -15, 1.1]]) slushTrack(bf, ax, az, bx, bz, w, Math.floor(r() * 99));
  slush(bf, 0, -14.0, 3.6, 1.4, 0, Math.floor(r() * 99), 0xa8acb0);
  KEEP(bf, 0, -33, 3.5);
  [['flagKommun', -6], ['flagSE', 0], ['flagKommun', 6]].forEach(([fl, x]) => {
    bf.use('painted').cyl(0xf0eee8, x, CURB + 5, -24, 0.06, 10, 8);
    bf.use('painted').sphere(0xc8a040, x, CURB + 10.05, -24, 0.16);
    bf.circ(x, -24, 0.1);
    for (const ly of [Math.PI / 2, -Math.PI / 2]) bf.sign(picto(fl), x + 0.85, CURB + 9.2, -24 + (ly > 0 ? 0.01 : -0.01), 1.6, 1.0, ly);
  });
  bf.use('concrete').box(0x6a6a6c, 17, CURB, -26, 3.2, 1.1, 0.5);
  bf.sign(textFace('Kommunhuset', 2.8, 0.6, { bg: '#5e5e60', fg: '#e8e4d8', ppm: 200, scale: 0.6, weight: '600' }), 17, CURB + 0.6, -26.26, 2.8, 0.6, Math.PI);
  bf.solid(17, -26, 3.2, 0.5, CURB + 1.1, 'monument');
  for (const [x, z] of [[-14, -26], [14, -18], [-27, 22], [27, 22], [-27, -14]]) bf.tree(x, z, R(0.95, 1.15, r), 'birch', r);
  // Visitor parking west and east of the forecourt.
  for (const sx of [-1, 1]) {
    bf.useF('asphalt').flat(C.lot, sx * 21.5, -23, 19, 16, CURB + 0.03);
    bf.useF('asphalt').flat(C.lot, sx * 21.5, -32.8, 7, 3.7, CURB + 0.033);
    KEEP(bf, sx * 21.5, -33, 4.5);
    const bays = bayRow(bf, sx > 0 ? 12.5 : -30.5, 6, 2.8, -18.0, 5);
    bays.forEach((x) => { if (r() < 0.25) bf.car(pickR(CARS, r), x, -18.0, 0, { color: pickR(CAR_COLS, r) }); });
    // (two hours with a p-skiva 8-18: game/pskiva.js)
    parkingLot('kommunhuset', { name: 'Kommunhusets besöksparkering', sign: 'P 2 tim 8–18 · p-skiva', rule: { disc: 120, hours: [8, 18] }, signAt: [bf.wx(-29, -30.6), bf.wz(-29, -30.6), bf.yaw + Math.PI] });
    bays.forEach((x) => bf.bay(x, -18.0, 0, 'kommunhuset', { w: 2.8 }));
  }
  bf.post(-29, -30.6, Math.PI, [{ f: picto('p'), w: 0.56, h: 0.56 }, { f: textFace('Besöksparkering\n2 tim 8–18', 0.56, 0.3, { ppm: 280, scale: 0.72 }), w: 0.56, h: 0.3 }, { ...pskivaFace(), w: 0.56, h: 0.16 }], { top: 2.6 });
  V(bf, 0, -19.5, Math.PI / 2 + 0.1, 'firelane', 'kommun');
  for (let k = 0; k < 3; k++) LIT(bf, R(-28, 28, r), R(-28, -20, r));
}

// A glazed entrance vestibule (entré) in frame v: front at local z = 0 (facing -z), w wide, D deep
// back to the facade, h tall. Aluminium frames, see-through panes no wider than ~1.2 m, a pair of
// sliding door leaves in the middle (a little open), a door sensor, an entrance mat, a lit lobby
// behind (a warm back wall, a desk, a plant).
function vestibule(v, w, D, h, o = {}) {
  const AL = 0xb4b8bc, n = Math.max(4, Math.round(w / 1.15)), pw = w / n, dh = 2.3;
  v.use('concrete', { snow: 0 }).box(0xc8c4bc, 0, CURB, D / 2, w, 0.02, D);
  v.use('light', { snow: 0 }).box(o.lobby ?? 0x8a7c66, 0, CURB + 0.05, D - 0.06, w - 0.3, h - 0.2, 0.03);
  v.use('painted', { snow: 0 }).box(0xe2ded6, -w / 2 + 1.2, CURB, D - 0.9, 1.8, 1.05, 0.6).box(0x6a5a48, -w / 2 + 1.2, CURB + 1.05, D - 0.9, 1.9, 0.05, 0.7);
  v.use('foliage').cyl(0x3a5236, w / 2 - 0.9, CURB + 0.9, D - 0.7, 0.35, 0.9, 8);
  v.use('plastic').cyl(0x2e3134, w / 2 - 0.9, CURB + 0.22, D - 0.7, 0.28, 0.44, 10);
  v.use('metal');
  // frame: posts between panes, sill, transom over the doors, head, the corners
  for (let k = 0; k <= n; k++) v.box(AL, -w / 2 + k * pw, CURB, -0.02, 0.07, h, 0.1);
  v.box(AL, 0, CURB, -0.02, w, 0.1, 0.1).box(AL, 0, CURB + dh, -0.02, w, 0.08, 0.1).box(AL, 0, CURB + h - 0.08, -0.02, w + 0.07, 0.1, 0.12);
  for (const sx of [-1, 1]) { v.box(AL, sx * w / 2, CURB, D / 2, 0.08, h, D); }
  v.box(0x5a5e62, 0, CURB + h, D / 2, w + 0.2, 0.22, D + 0.1);
  // glass: front panes (the two middle ones are the door leaves, slid apart a little), sides
  const mid = Math.floor(n / 2);
  for (let k = 0; k < n; k++) {
    const cx = -w / 2 + (k + 0.5) * pw, door = k === mid - 1 || k === mid;
    if (door) {
      const slide = (k === mid ? 1 : -1) * 0.35;
      tglass(v, cx + slide, CURB + 0.06, -0.12, pw - 0.06, dh - 0.08, 0.025);
      v.use('metal').box(AL, cx + slide, CURB + 0.03, -0.12, pw - 0.04, 0.06, 0.05).box(AL, cx + slide + (k === mid ? -1 : 1) * (pw / 2 - 0.03), CURB + 0.03, -0.12, 0.05, dh - 0.06, 0.05);
    } else tglass(v, cx, CURB + 0.1, 0, pw - 0.07, dh - 0.1, 0.02);
    tglass(v, cx, CURB + dh + 0.08, 0, pw - 0.07, h - dh - 0.18, 0.02);
  }
  for (const sx of [-1, 1]) tglass(v, sx * (w / 2), CURB + 0.1, D / 2, 0.02, h - 0.2, D - 0.2);
  // door sensor, mat
  v.use('painted', { snow: 0 }).box(0x2a2c2e, 0, CURB + dh + 0.12, -0.1, 0.36, 0.1, 0.1);
  v.use('fabric', { snow: 0 }).box(0x2a2c30, 0, CURB, -1.0, 2.6, 0.02, 1.6);
}

// ---------------------------------------------------------------------------------------------
// Small kit for paved places: kerbed planted islands, trailers for hire, pallets, a hot-dog kiosk,
// a trolley shelter, slush and plowed edges in car parks.

// A kerbed island (w x d, along the frame's x / z) with snowy grass, optionally shrubs, a tree, a
// lamp; a low collider (cars mount the kerb, nobody drives through a tree).
export function island(f, x, z, w, d, o = {}) {
  const kc = C.granite, kh = 0.14, kw = 0.16;
  f.use('concrete');
  f.box(kc, x, CURB, z - d / 2 + kw / 2, w, kh, kw).box(kc, x, CURB, z + d / 2 - kw / 2, w, kh, kw);
  f.box(kc, x - w / 2 + kw / 2, CURB, z, kw, kh, d - 2 * kw).box(kc, x + w / 2 - kw / 2, CURB, z, kw, kh, d - 2 * kw);
  f.use('grass').box(C.lawn, x, CURB, z, w - 2 * kw, kh - 0.02, d - 2 * kw);
  const rr = o.r || rnd;
  if (o.shrubs) for (let k = 0; k < o.shrubs; k++) shrub(f.S, f.wx(x + (rr() - 0.5) * (w - 1.0), z + (rr() - 0.5) * (d - 0.8)), f.wz(x + (rr() - 0.5) * (w - 1.0), z + (rr() - 0.5) * (d - 0.8)), 0.6 + rr() * 0.3, 0x354430);
  if (o.tree) f.tree(x + (o.tx ?? 0), z + (o.tz ?? 0), o.ts ?? 0.75, o.tree, rr);
  if (o.lamp) f.lamp(x + (o.lx ?? 0), z + (o.lz ?? 0), o.lyaw ?? 0, o.lh ?? 6.0);
  if (o.snow !== false) snowFringe(f.F || f.S, f.wx(x - w / 2, z - d / 2), f.wz(x - w / 2, z - d / 2), f.wx(x + w / 2, z - d / 2), f.wz(x + w / 2, z - d / 2), -1, CURB + kh, (o.seed ?? 3), { reach: 0.12 });
  f.solid(x, z, w, d, CURB + kh, 'island');
}
// Släpvagn (a trailer for hire): galvanised box on a frame, two wheels, a drawbar resting on its
// jockey wheel, a rental board on the side. Frame at its centre, drawbar towards local +z.
export function trailer(f, x, z, yaw, color = 0xd0661e) {
  const t = f.sub(x, z, yaw);
  t.use('metal');
  t.box(0xa4a8aa, 0, CURB + 0.5, 0, 1.45, 0.42, 2.5);
  t.box(0x8e9296, 0, CURB + 0.43, 0, 1.2, 0.08, 2.4);
  t.use('rubber');
  for (const sx of [-0.8, 0.8]) t.cyl(0x1c1c1e, sx, CURB + 0.3, 0, 0.3, 0.18, 12, 0, Math.PI / 2);
  t.use('metal');
  for (const sx of [-0.8, 0.8]) t.cyl(0x9a9da0, sx * 1.01, CURB + 0.3, 0, 0.16, 0.19, 10, 0, Math.PI / 2);
  for (const sx of [-1, 1]) t.boxC(0x9a9da0, sx * 0.3, CURB + 0.42, 1.75, 0.06, 0.06, 1.25, sx * 0.24);
  t.cyl(0x9a9da0, 0, CURB + 0.25, 2.3, 0.04, 0.4, 6);
  t.use('rubber').cyl(0x1c1c1e, 0, CURB + 0.06, 2.3, 0.06, 0.05, 8, 0, Math.PI / 2);
  t.use('painted').box(color, 0.735, CURB + 0.56, 0, 0.02, 0.3, 1.6);
  t.sign(textFace('HYR SLÄP', 1.5, 0.28, { bg: hex(color), fg: '#f6f2e6', ppm: 240, weight: '700', scale: 0.78 }), 0.75, CURB + 0.71, 0, 1.5, 0.28, Math.PI / 2);
  t.use('snow').box(0xeef0f2, 0, CURB + 0.48, 0, 1.3, 0.06, 2.35);
  t.solid(0, 0.3, 1.5, 3.1, CURB + 0.92, 'trailer');
}
// A pallet of goods (washer fluid jugs / firewood sacks / gas bottles in a cage) under shrink wrap.
function pallet(f, x, z, yaw, kind = 'fluid', r = rnd) {
  const p = f.sub(x, z, yaw);
  p.use('wood').box(0x9a7a50, 0, CURB, 0, 1.2, 0.14, 0.8);
  if (kind === 'fluid') {
    p.use('plastic');
    for (let l = 0; l < 3; l++) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) p.box(l === 2 && (i + j) % 3 === 0 ? 0x2a6ab0 : 0x3a7ac8, -0.45 + i * 0.3, CURB + 0.14 + l * 0.33, -0.25 + j * 0.25, 0.26, 0.31, 0.22);
    p.sign(textFace('SPOLARVÄTSKA\n−18°  2 för 99:-', 0.9, 0.4, { bg: '#f2f0e8', fg: '#1e4a8a', ppm: 300, weight: '700', scale: 0.78 }), 0, CURB + 0.75, -0.42, 0.9, 0.4, Math.PI);
  } else {
    p.use('fabric');
    for (let l = 0; l < 3; l++) for (let i = 0; i < 2; i++) p.box(pickR([0x6a8a4a, 0x5a7a3e], r), -0.28 + i * 0.56, CURB + 0.14 + l * 0.32, 0, 0.52, 0.3, 0.74);
  }
  p.solid(0, 0, 1.2, 0.8, CURB + 1.15, 'pallet');
}
// Korvkiosk: a small grill kiosk with a lit serving hatch, an awning, a menu board, a bench.
function korvkiosk(f, x, z, yaw) {
  const k = f.sub(x, z, yaw);
  k.use('painted').box(0xc8402a, 0, CURB, 0, 3.4, 2.5, 2.4);
  k.use('painted').box(0xf2f0e8, 0, CURB + 2.5, 0, 3.6, 0.3, 2.6);
  k.roof(C.metalBlack, 0, CURB + 2.9, 0, 3.9, 2.9, 0.08, 0, { fh: 0.14, fascia: 0xf2f0e8 });
  k.use('painted').box(0xe8e4da, 0, CURB + 0.95, -1.22, 2.0, 0.08, 0.3);
  k.use('light', { snow: 0 }).box(glow(0xffe6c0, 1.0), 0, CURB + 1.0, -1.18, 1.9, 1.0, 0.03);
  k.use('fabric', { snow: 1 }).boxC(0xf2f0e8, 0, CURB + 2.15, -1.6, 2.6, 0.04, 0.9, 0, -0.3);
  k.sign(textFace('GRILLEN', 2.2, 0.26, { bg: '#f2f0e8', fg: '#c8402a', ppm: 220, weight: '700', glow: true, scale: 0.8 }), 0, CURB + 2.65, -1.315, 2.2, 0.26, Math.PI);
  k.sign(textFace('Korv med bröd 25:-\nMos & räksallad 45:-\nKaffe 15:-', 1.0, 0.7, { bg: '#1e2a24', fg: '#f2f0e8', ppm: 240, weight: '600', scale: 0.8, align: 'left' }), 1.2, CURB + 1.6, -1.215, 1.0, 0.7, Math.PI);
  k.solid(0, 0, 3.4, 2.4, 99, 'building');
  k.prop('papperskorg', 2.2, -1.2, 0);
}
// Kundvagnsgarage: an open shelter of steel posts and a low roof with a row of trolleys inside.
function trolleyShelter(f, x, z, yaw) {
  const t = f.sub(x, z, yaw);
  t.use('metal');
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.7, 0.7]) { t.box(0x5a5e62, sx, CURB, sz, 0.07, 2.1, 0.07); t.circ(sx, sz, 0.08); }
  t.roof(0x4a4e52, 0, CURB + 2.15, 0, 3.6, 1.8, 0.05, 0, { fh: 0.12, fascia: 0x2f5a3a });
  t.sign(textFace('Kundvagnar', 1.2, 0.22, { bg: '#2f5a3a', fg: '#f2f0e8', ppm: 260, weight: '700' }), 0, CURB + 2.0, -0.95, 1.2, 0.22, Math.PI);
  for (let k = 0; k < 4; k++) t.prop('cart', -1.05 + k * 0.7, 0, 0);
}
// A slush patch: a flat, jagged, grey remnant of packed snow on a car park (in empty bays, along the
// edges, where the plough did not reach).
export function slush(f, x, z, w, d, yaw = 0, seed = 1, color = 0xc4c8cc) {
  const n = 14, pos = [f.wx(x, z), CURB + 0.036, f.wz(x, z)], idx = [];
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, rad = 0.62 + 0.38 * vnoise3(Math.cos(a) * 1.7, seed, Math.sin(a) * 1.7, seed) + (hash(k, seed) - 0.5) * 0.18;
    const lx = Math.cos(a) * w / 2 * rad, lz = Math.sin(a) * d / 2 * rad;
    pos.push(f.wx(x + lx * c + lz * sn, z - lx * sn + lz * c), CURB + 0.034, f.wz(x + lx * c + lz * sn, z - lx * sn + lz * c));
  }
  for (let k = 0; k < n; k++) idx.push(0, 1 + ((k + 1) % n), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  f.S.use('snow').add(g, color, null);
}

// ---------------------------------------------------------------------------------------------
// Bensin & Service: a forecourt (~43 x 44 m) with the canopy over two pump islands, the shop, a car
// wash with its queue lane, the price pylon; around it snowy verges with kerbed islands, a row of
// trailers for hire, pallets of washer fluid and firewood by the shop.
export function gasBlock(bf, r) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  // Forecourt: x -12..31 (from the shop front to the east street), z -31..13; the strip north of
  // the shop is paved too (deliveries).
  bf.useF('asphalt').flat(C.lot, 9.5, -9, 43, 44, CURB + 0.025);
  bf.useF('asphalt').flat(C.lot, -20, -28.5, 16.2, 5, CURB + 0.024);
  bf.useF('asphalt').flat(C.lot, 32.8, 0, 3.7, 16, CURB + 0.033);
  bf.useF('asphalt').flat(C.lot, 10, -32.8, 16, 3.7, CURB + 0.033);
  KEEP(bf, 33, 0, 8.5); KEEP(bf, 10, -33, 8.5);
  // Kerbs round the forecourt where it meets the verges (south edge, west edge south of the shop).
  bf.use('concrete');
  bf.box(C.granite, 9.5, CURB, 13.08, 43, 0.12, 0.16);
  bf.box(C.granite, -12.08, CURB, 1.5, 0.16, 0.12, 23);
  // Canopy.
  const cx = 6, cz = 0;
  bf.use('painted');
  for (const sx of [-7, 7]) for (const sz of [-5.5, 5.5]) { bf.box(0xe8e6e0, cx + sx, CURB, cz + sz, 0.5, 5.2, 0.5); bf.solid(cx + sx, cz + sz, 0.5, 0.5, 99, 'pillar'); }
  bf.box(0x2e5a46, cx, CURB + 5.2, cz, 18, 0.95, 13);
  bf.cam(cx, cz, 18, 13, CURB + 5.1, CURB + 6.3);
  bf.use('metalroof').box(0xd8d8d4, cx, CURB + 6.15, cz, 17.8, 0.02, 12.8);
  bf.use('light');
  for (const sx of [-4.5, 4.5]) for (const sz of [-3.5, 3.5]) bf.box(glow(0xfff4e0, 1.4), cx + sx, CURB + 5.14, cz + sz, 2.4, 0.04, 0.5);
  for (const ly of [Math.PI, 0]) bf.sign(textFace('Bensin & Service', 8, 0.75, { bg: '#2e5a46', fg: '#f2f0e8', ppm: 150, scale: 0.75, glow: true }), cx, CURB + 5.65, cz + (ly ? -6.56 : 6.56), 8, 0.75, ly);
  for (const sz of [-3.0, 3.0]) {
    bf.use('concrete').box(0xa8a6a0, cx, CURB, cz + sz, 9, 0.22, 1.3);
    bf.solid(cx, cz + sz, 9, 1.3, CURB + 0.22, 'island');
    bf.prop('pump', cx - 2.5, cz + sz, sz < 0 ? 0 : Math.PI);
    bf.prop('pump', cx + 2.5, cz + sz, sz < 0 ? 0 : Math.PI);
    // a bucket with a squeegee and paper towels at each island
    bf.use('plastic').cyl(0x2a5a8a, cx, CURB + 0.37, cz + sz, 0.16, 0.3, 10);
    bf.use('wood').boxC(0x8a6a48, cx, CURB + 0.65, cz + sz, 0.03, 0.8, 0.03, 0, 0.2);
  }
  // Shop (front facing +x).
  const sf = bf.sub(-12, -26, -Math.PI / 2);
  flatBuilding(sf, 0, 0, 16, 16, 4.4, { surface: 'plaster', wall: 0xe0dcd2, capC: 0x2e5a46, recess: { depth: 1.6, h: 3.1 } });
  shopfront(sf, 0.5, 15.5, 'Bensin & Service', { band: 0x2e5a46, doorX: 4.5 });
  bf.mark('gas', -9.6, -21.5, -Math.PI / 2);
  for (const [x, z] of [[-10.6, -16.5], [-10.6, -15.4]]) bf.prop('trashcan', x, z, -Math.PI / 2);
  // Firewood, washer fluid, propane by the shop front.
  pallet(bf, -10.8, -12.5, Math.PI / 2, 'wood', r);
  bf.sign(textFace('VED 59:-', 0.8, 0.3, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 260 }), -10.15, CURB + 1.4, -12.5, 0.8, 0.3, Math.PI / 2);
  pallet(bf, -10.8, -1.6, Math.PI / 2, 'fluid', r);
  pallet(bf, -10.8, 0.2, Math.PI / 2, 'fluid', r);
  bf.use('metal').box(0x8a8e92, -10.9, CURB, -8.5, 1.0, 1.6, 0.9);
  bf.use('painted'); for (let k = 0; k < 4; k++) bf.cyl(0x3a6ab0, -11.15 + (k % 2) * 0.45, CURB + 0.4, -8.7 + Math.floor(k / 2) * 0.4, 0.15, 0.75, 10);
  bf.sign(textFace('GASOL', 0.6, 0.2, { bg: '#f2f0e8', fg: '#b01e1e', ppm: 300, weight: '700' }), -10.39, CURB + 1.35, -8.5, 0.6, 0.2, Math.PI / 2);
  bf.solid(-10.9, -8.5, 1.0, 0.9, CURB + 1.6, 'cage');
  // Car wash, and its queue lane (painted, with a sign) from the forecourt to the wash door.
  const cw = bf.sub(14, -28, 0);
  flatBuilding(cw, 0, 0, 14, 9, 4.8, { surface: 'plaster', wall: 0xd8d4c8, capC: 0x2a4a7a });
  // the wash's entry door (west end): a roll-up door of slats in a blue frame, red / green lights,
  // a pay terminal on a post; the long street side gets the blue band and a row of high windows
  cw.use('painted').box(0x2a4a7a, -0.05, CURB, 4.5, 0.06, 4.1, 4.4);
  cw.use('metal'); for (let k = 0; k < 14; k++) cw.box(k % 2 ? 0xc8ccd0 : 0xb8bcc0, -0.09, CURB + 0.2 + k * 0.26, 4.5, 0.04, 0.24, 3.8);
  cw.use('painted').box(0x2e3134, -0.12, CURB + 3.85, 3.6, 0.08, 0.5, 0.3);
  cw.use('light').box(0xd83020, -0.17, CURB + 4.15, 3.6, 0.03, 0.12, 0.12).box(0x40c050, -0.17, CURB + 3.95, 3.6, 0.03, 0.12, 0.12);
  cw.use('painted').box(0x2a4a7a, -2.2, CURB, 1.9, 0.25, 1.2, 0.35).box(0x2e3134, -2.08, CURB + 0.9, 1.9, 0.06, 0.28, 0.24);
  cw.solid(-2.2, 1.9, 0.3, 0.4, CURB + 1.2, 'post');
  cw.use('painted').box(0x2a4a7a, 7, CURB + 3.75, -0.03, 13.9, 0.5, 0.06);
  cw.use('glass'); for (let k = 0; k < 6; k++) cw.box(null, 1.6 + k * 2.15, CURB + 2.5, -0.03, 1.6, 0.6, 0.04);
  cw.sign(textFace('Tvätt från 129:-  ·  Biltvätt dygnet runt', 5.2, 0.4, { bg: '#f2f0e8', fg: '#2a4a7a', ppm: 160, weight: '700', scale: 0.7 }), 7, CURB + 1.6, -0.07, 5.2, 0.4, Math.PI);
  cw.sign(textFace('BILTVÄTT', 3.0, 0.6, { bg: '#2a4a7a', fg: '#f2f0e8', ppm: 180, weight: '700', glow: true }), 7, CURB + 4.1, -0.06, 3.0, 0.6, Math.PI);
  lines(bf, [[3, -25.6, 22, 0.12], [3, -21.4, 22, 0.12]]);
  bf.post(-8.5, -25.9, 0, [{ f: textFace('BILTVÄTT\nKö här →', 0.7, 0.4, { bg: '#2a4a7a', fg: '#f2f0e8', ppm: 280, weight: '700', scale: 0.8 }), w: 0.7, h: 0.4 }], { top: 1.9 });
  // Service corner: air & water post with a coiled hose, a vacuum station.
  const sv = bf.sub(23, 10, -Math.PI / 2);
  sv.use('concrete').box(0xa8a6a0, 0, CURB, 1.2, 1.6, 0.15, 4.2);
  sv.use('painted').box(0x2e5a46, 0, CURB + 0.15, 0, 0.45, 1.35, 0.32);
  sv.use('painted').box(0xe8e6e0, 0, CURB + 1.15, -0.17, 0.36, 0.28, 0.02);
  sv.sign(textFace('LUFT\nVATTEN', 0.34, 0.26, { bg: '#e8e6e0', fg: '#2e5a46', ppm: 400, weight: '700', scale: 0.8 }), 0, CURB + 1.29, -0.185, 0.34, 0.26, Math.PI);
  sv.use('rubber').add(PRIM.torus(), 0x1a1a1a, 0.26, CURB + 0.8, 0, 0, 0.35, 0.35, 0.6);
  sv.use('painted').box(0xd8b030, 0, CURB + 0.15, 2.4, 0.7, 1.45, 0.6);
  sv.use('painted').box(0x2e3134, 0, CURB + 1.6, 2.4, 0.75, 0.12, 0.65);
  sv.sign(textFace('DAMMSUGARE\n10 kr / 4 min', 0.6, 0.32, { bg: '#d8b030', fg: '#1a1a1a', ppm: 400, weight: '700', scale: 0.78 }), 0, CURB + 1.05, 2.09, 0.6, 0.32, Math.PI);
  sv.use('metal').boxC(0x8a8e92, 0.2, CURB + 2.2, 2.4, 0.06, 1.2, 0.06, 0, 0, 0.6).boxC(0x8a8e92, -0.2, CURB + 2.2, 2.4, 0.06, 1.2, 0.06, 0, 0, -0.6);
  sv.use('rubber'); for (const sx of [-0.65, 0.65]) sv.boxC(0x1a1a1a, sx, CURB + 1.5, 2.4, 0.06, 1.3, 0.06, 0, 0, sx > 0 ? -0.25 : 0.25);
  sv.solid(0, 0, 0.45, 0.32, CURB + 1.5, 'post'); sv.solid(0, 2.4, 0.7, 0.6, CURB + 1.6, 'post');
  // Kerbed islands on the forecourt edges: shrubs, a lamp.
  island(bf, -5.5, 9.5, 7.5, 2.6, { shrubs: 3, lamp: true, lx: -2.6, r, seed: 51 });
  island(bf, 26.5, -9.0, 3.0, 7.0, { shrubs: 2, lamp: true, lz: 2.4, lyaw: -Math.PI / 2, r, seed: 52 });
  // Lighting mast with three floodlights, in the south verge.
  bf.use('metal').add(PRIM.cyl(8), C.galv, bf.wx(-24, 20), CURB + 6, bf.wz(-24, 20), 0, 0, 0, 0.28, 12, 0.28);
  for (const a of [0.3, 1.9, 3.5]) { bf.use('painted').box(0x3a3d40, -24 + Math.cos(a) * 0.35, CURB + 11.7, 20 + Math.sin(a) * 0.35, 0.55, 0.32, 0.4, -a); bf.use('light').box(0xd8d0b8, -24 + Math.cos(a) * 0.56, CURB + 11.7, 20 + Math.sin(a) * 0.56, 0.02, 0.24, 0.32, -a); }
  bf.circ(-24, 20, 0.2);
  // Winter tyres on a display rack by the shop.
  const tr = bf.sub(-10.4, -5.0, -Math.PI / 2);
  tr.use('metal').box(0x5a5e62, 0, CURB, 0, 2.2, 0.06, 0.6).box(0x5a5e62, -1.05, CURB, 0, 0.05, 1.3, 0.05).box(0x5a5e62, 1.05, CURB, 0, 0.05, 1.3, 0.05);
  tr.use('rubber'); for (let k = 0; k < 5; k++) for (let q = 0; q < 2; q++) tr.cyl(0x1a1a1c, -0.84 + k * 0.42, CURB + 0.4 + q * 0.62, 0, 0.3, 0.2, 14, Math.PI / 2);
  tr.sign(textFace('VINTERDÄCK\nfr. 3 995:-', 1.2, 0.36, { bg: '#f2f0e8', fg: '#b01e1e', ppm: 300, weight: '700', scale: 0.78 }), 0, CURB + 1.55, -0.04, 1.2, 0.36, Math.PI);
  tr.use('painted').box(0xf2f0e8, 0, CURB + 1.35, -0.02, 1.25, 0.4, 0.02);
  tr.solid(0, 0, 2.2, 0.6, CURB + 1.3, 'rack');
  for (const [x, c] of [[15, 0x2e5a46], [18, 0xe8e6e0], [21, 0x2e5a46]]) {
    bf.use('painted').cyl(0xf0eee8, x, CURB + 4, -29, 0.05, 8, 8); bf.circ(x, -29, 0.08);
    bf.use('fabric', { snow: 0 }).box(c, x, CURB + 5.4, -28.6, 0.02, 2.4, 0.7);
  }
  bf.car('kombi', 3.6, -5.1, Math.PI / 2, { color: 0x6a7884 });
  // a car queuing for the wash
  bf.car('volvo740', 4.3, -23.5, Math.PI / 2, { color: 0x8a8e92 });
  // A-boards by the shop door and at the entrance, a bin and a paper-towel stand at each island
  aBoard(bf, -8.6, -18.6, -Math.PI / 2 + 0.3, 'KAFFE\n+ BULLE\n25:-', '#2e5a46', '#f2f0e8');
  aBoard(bf, -8.4, -6.8, -Math.PI / 2 - 0.2, 'SPOLAR-\nVÄTSKA\n2 för 99:-', '#f2f0e8', '#b01e1e');
  for (const sz of [-3.0, 3.0]) {
    bf.prop('papperskorg', cx + 4.2, cz + sz, 0);
    bf.use('metal').box(0x5a5e62, cx - 4.2, CURB + 0.22, cz + sz, 0.06, 1.0, 0.06);
    bf.use('painted').box(0x2e5a46, cx - 4.2, CURB + 1.05, cz + sz, 0.32, 0.4, 0.22);
    bf.use('painted', { snow: 0 }).box(0xf0eee8, cx - 4.2, CURB + 1.0, cz + sz + (sz < 0 ? -0.12 : 0.12), 0.18, 0.06, 0.02);
  }
  bf.car('golf', 9.8, 5.0, -Math.PI / 2, { color: 0x8a1e1e });
  // Trailers for hire on a gravel pad in the south verge, with their sign.
  bf.useF('gravel').flat(C.gravel, 6, 20, 19, 7, CURB + 0.03);
  for (let k = 0; k < 4; k++) trailer(bf, -1.5 + k * 4.2, 19.5, Math.PI + (k === 3 ? 0.25 : 0), k === 1 ? 0x2a5a8a : 0xd0661e);
  bf.post(15.8, 16.7, 0, [{ f: textFace('SLÄPVAGNS-\nUTHYRNING\nFråga i kassan', 0.9, 0.6, { bg: '#d0661e', fg: '#f6f2e6', ppm: 260, weight: '700', scale: 0.8 }), w: 0.9, h: 0.6 }], { top: 2.0 });
  // Plowed snow: piles at the forecourt corners (pushed off the asphalt), banks along the kerbs.
  bf.pile(28.5, -28.5, 2.2, 1.0, true, -Math.PI * 0.75);
  bf.pile(-10.0, 11.0, 1.6, 0.8, true, -Math.PI * 0.25);
  bf.bank(-11, 13.6, 2.5, 13.6, 0.9, 0.38, 31, { dirty: -1 });
  bf.bank(17, 13.6, 30, 13.6, 0.9, 0.38, 32, { dirty: -1 });
  bf.bank(-12.6, -9.0, -12.6, 12.5, 0.8, 0.35, 33, { dirty: -1 });
  // Slush left on the forecourt edges and in the corners.
  for (const [x, z, w, d] of [[-8, -30, 4, 1.6], [29.5, 10, 1.4, 4], [-9.5, 8.5, 2.6, 2.0], [26, -30.2, 5, 1.2], [1, 12, 3.5, 1.2]]) slush(bf, x, z, w, d, 0, Math.floor(r() * 99));
  // Price pylon at the corner, in the verge.
  bf.use('metal').box(0x3a3d40, 26.5, CURB, 26, 0.3, 6.5, 0.3).box(0x3a3d40, 29.5, CURB, 26, 0.3, 6.5, 0.3);
  bf.use('painted').box(0x2e5a46, 28, CURB + 3.2, 26, 3.8, 3.4, 0.4);
  for (const ly of [Math.PI, 0]) bf.sign(textFace('BENSIN & SERVICE\n95      18,49\nDiesel  19,29\nE85     13,99', 3.4, 3.0, { bg: '#2e5a46', fg: '#f2f0e8', ppm: 120, scale: 0.8, weight: '700', glow: true }), 28, CURB + 4.9, 26 + (ly ? -0.21 : 0.21), 3.4, 3.0, ly);
  bf.solid(28, 26, 3.8, 0.5, 99, 'pylon');
  bf.lamp(-28, 28, Math.PI / 4, 6.4); bf.lamp(28, -28, -3 * Math.PI / 4, 6.4);
  // Verges: a few birches and a spruce, a bench by the trailers.
  for (const [x, z, k] of [[-27, -2, 'birch'], [-20, 27, 'birch'], [-28, 10, 'spruce'], [22, 27, 'birch']]) bf.tree(x, z, R(0.85, 1.05, r), k, r);
  for (let k = 0; k < 3; k++) LIT(bf, R(-8, 20, r), R(-12, 12, r));
}

// ---------------------------------------------------------------------------------------------
// Park: frozen pond, gravel paths, a sledding hill, benches, big trees.
export function parkBlock(bf, r) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  // Paths: Ove's walkway continues across the park (z 3.8), a N-S path and a loop.
  // (in winter the gravel paths are bands of trodden snow with a ragged rim: under snow, the gravel
  // boxes showed only as brown pencil lines across the white)
  trodPath(bf, -33, 3.8, 33, 3.8, 2.6, 11, CURB + 0.035);
  trodPath(bf, 0, -31, 0, 2.5, 2.3, 13, CURB + 0.034); trodPath(bf, 0, 5.1, 0, 31, 2.3, 15, CURB + 0.034);
  KEEP(bf, -33, 3.8, 3); KEEP(bf, 33, 3.8, 3); KEEP(bf, 0, -33, 3); KEEP(bf, 0, 33, 3);
  bf.useF('gravel').flat(C.gravel, -32.8, 3.8, 3.7, 3.0, CURB + 0.033);
  const loop = [];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; loop.push([Math.cos(a) * 20, Math.sin(a) * 20]); }
  for (let k = 0; k < 10; k++) {
    const [ax, az] = loop[k], [bx, bz] = loop[(k + 1) % 10], L = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / L * 0.3, ez = (bz - az) / L * 0.3;
    trodPath(bf, ax - ex, az - ez, bx + ex, bz + ez, 2.1, 20 + k);
  }
  // Frozen pond (ellipse), stones and reeds at the rim.
  const px = 13, pz = -14, rx = 9.5, rz = 6.0;
  bf.F.use('ice').add(PRIM.cyl(40), 0xb8c8d0, mat(bf.wx(px, pz), CURB - 0.01, bf.wz(px, pz), 0, bf.yaw + 0.3, 0, rx * 2, 0.08, rz * 2));
  bf.use('concrete');
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + r() * 0.15, c = Math.cos(0.3), s = Math.sin(0.3);
    const lx = Math.cos(a) * (rx + 0.3), lz = Math.sin(a) * (rz + 0.3);
    const x = px + lx * c + lz * s, z = pz - lx * s + lz * c;
    bf.S.use('concrete').add(stoneGeo(Math.floor(r() * 6)), pickR([0x7a7a78, 0x6a6a68, 0x86847c, 0x8c7e74], r), mat(bf.wx(x, z), CURB + 0.05, bf.wz(x, z), r(), r() * 6, r(), R(0.7, 1.3, r), R(0.45, 0.75, r), R(0.7, 1.2, r)));
    fineTex(bf.S, 1.2);
    if (k % 3 === 0) { bf.use('bark'); for (let q = 0; q < 6; q++) limb(bf.S, bf.wx(x + R(-0.6, 0.6, r), z + R(-0.6, 0.6, r)), CURB, bf.wz(x + R(-0.6, 0.6, r), z + R(-0.6, 0.6, r)), bf.wx(x + R(-0.8, 0.8, r), z + R(-0.8, 0.8, r)), CURB + R(0.9, 1.6, r), bf.wz(x + R(-0.8, 0.8, r), z + R(-0.8, 0.8, r)), 0.012, 0.004, 0x8a7a50, 3); bf.use('concrete'); }
  }
  bf.circ(px, pz, Math.min(rx, rz) + 0.5, 99, 'water');
  bf.mark('park', px - 2, pz + rz + 2.4, Math.PI);
  bf.mark('pond', px, pz + rz + 1.4, Math.PI);
  // The sledding hill: a big pile of snow shaped into a hoppbacke (snowhill.js, feature snöhög), its
  // long axis east-west along the open lawn north of the lime alley (a car can run up to it from the
  // street or from across the park). Two pulkas left at its foot.
  jumpHill(bf, -13.5, 18.5, Math.PI / 2);
  // ... and the kommun's sign at its foot, facing the street
  bf.post(-29.4, 23.6, -Math.PI / 2, [
    { f: textFace('Pulkaåkning sker\npå egen risk', 0.62, 0.3, { ppm: 260, scale: 0.7, border: '#1e1e1e' }), w: 0.62, h: 0.3 },
    { f: textFace('Motortrafik\nförbjuden', 0.62, 0.26, { ppm: 260, scale: 0.7, bg: '#f4f2ea', fg: '#9a1c1c', border: '#9a1c1c' }), w: 0.62, h: 0.26 },
  ], { top: 1.7 });
  bf.mark('pulkabacke', -15, 6.5, 0);
  bf.prop('pulka', -6, 8.0, 0.4); bf.prop('pulka', -24, 8.6, 2.6);
  // Benches, bins, lamps.
  for (const [x, z, y] of [[-8, 1.6, 0], [8, 1.6, 0], [px - 1, pz + rz + 1.3, Math.PI], [20, -6, -Math.PI / 2]]) bf.prop('bench', x, z, y);
  for (const [x, z] of [[-10, 1.6], [10, 1.6]]) bf.prop('papperskorg', x, z, 0);
  for (const [x, z] of [[-14, 5.6], [14, 5.6], [-26, 5.6], [26, 5.6], [1.8, -14], [1.8, 14], [1.8, 26]]) bf.plamp(x, z, 3.9);
  // Trees: an alley of bare limes along the main path, birches, a spruce group.
  for (const x of [-22, -12, 10, 20]) { bf.tree(x, 0.9, R(1.0, 1.2, r), 'bare', r); bf.tree(x + 4, 6.9, R(1.0, 1.2, r), 'bare', r); }
  for (const [x, z] of [[-25, -22], [-18, -26], [26, 15], [22, 24], [6, 24], [-27, 26]]) bf.tree(x, z, R(0.9, 1.2, r), 'birch', r);
  for (const [x, z] of [[-24, -10], [-21, -13], [-26, -14.5], [26, -26]]) bf.tree(x, z, R(0.85, 1.1, r), 'spruce', r);
  V(bf, -18, -27.3, Math.PI / 2 + 0.2, 'lawn', 'park');
  V(bf, 23, 27.5, -Math.PI / 2, 'lawn', 'park');
  for (let k = 0; k < 6; k++) LIT(bf, R(-28, 28, r), 3.8 + R(-1, 1, r));
  LIT(bf, px - 4, pz + rz + 1.6); LIT(bf, -10, 9);
}

// ---------------------------------------------------------------------------------------------
// Football field under snow, floodlights, a clubhouse, a small stand.
export function fieldBlock(bf0, r) {
  const bf = bf0.sub(0, 0, Math.PI);       // street (z = -200, south) at local z = -31
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  bf.useF('snow').flat(null, 0, 2, 50, 32, CURB + 0.03);
  // Goals.
  for (const s of [-1, 1]) {
    const gx = s * 24.5;
    bf.use('painted');
    bf.box(0xf0eee8, gx, CURB, 2 - 2.5, 0.12, 2.0, 0.12).box(0xf0eee8, gx, CURB, 2 + 2.5, 0.12, 2.0, 0.12);
    bf.box(0xf0eee8, gx, CURB + 2.0, 2, 0.12, 0.12, 5.12);
    // The net: see-through cards (back and sides) on a white frame running back from the posts.
    bf.box(0xf0eee8, gx + s * 1.2, CURB, 2, 0.05, 0.05, 5.0).box(0xf0eee8, gx + s * 0.6, CURB, 2 - 2.5, 1.2, 0.05, 0.05).box(0xf0eee8, gx + s * 0.6, CURB, 2 + 2.5, 1.2, 0.05, 0.05);
    for (const sz of [-2.5, 2.5]) bf.boxC(0xf0eee8, gx + s * 0.6, CURB + 1.05, 2 + sz, 0.04, 2.3, 0.04, 0, 0, s * 0.52);
    addCard(twigFace('net', 0), bf.wx(gx + s * 1.18, 2), CURB + 1.0, bf.wz(gx + s * 1.18, 2), 5.0, 2.0, bf.yaw + Math.PI / 2, 0.2);
    for (const sz of [-2.48, 2.48]) addCard(twigFace('net', 1), bf.wx(gx + s * 0.6, 2 + sz), CURB + 1.0, bf.wz(gx + s * 0.6, 2 + sz), 1.2, 2.0, bf.yaw, 0.2);
    bf.circ(gx, 2 - 2.5, 0.08); bf.circ(gx, 2 + 2.5, 0.08);
  }
  // Low rail fence around the pitch.
  bf.use('painted');
  const rail = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 2.5), yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k <= n; k++) bf.box(0x2a4a32, x0 + (x1 - x0) * k / n, CURB, z0 + (z1 - z0) * k / n, 0.06, 1.0, 0.06);
    bf.boxC(0x2a4a32, (x0 + x1) / 2, CURB + 1.0, (z0 + z1) / 2, 0.06, 0.06, L, yaw);
    const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    bf.solid((x0 + x1) / 2, (z0 + z1) / 2, ax ? L : 0.12, ax ? 0.12 : L, CURB + 1.0, 'fence');
  };
  rail(-27, -15, -3, -15); rail(3, -15, 27, -15); rail(-27, 19, 27, 19); rail(-27, -15, -27, 19); rail(27, -15, 27, 19);
  // Floodlight masts.
  for (const [x, z] of [[-29, -17], [29, -17], [-29, 21], [29, 21]]) {
    bf.use('metal').add(PRIM.cyl(8), C.galv, bf.wx(x, z), CURB + 7, bf.wz(x, z), 0, 0, 0, 0.3, 14, 0.3);
    bf.use('painted').box(0x3a3d40, x, CURB + 14, z, 1.6, 1.0, 0.3, Math.atan2(-x, 2 - z));
    bf.use('lamp').box(0xd8d8d0, x + Math.sign(-x) * 0.1, CURB + 14.1, z + Math.sign(2 - z) * 0.1, 1.4, 0.8, 0.1, Math.atan2(-x, 2 - z));
    bf.circ(x, z, 0.2);
  }
  // Clubhouse on the far side, stand on the east.
  const ch = gableHouse(bf, -10, 23, 16, 6.5, { wallH: 2.8, pitch: 0.45, wall: C.falu, roof: 'tile', roofC: C.roofBlack });
  for (const x of [-7.5, -3.5, 4.5]) win(bf, x, ch.Y0 + 0.9, 23, 1.2, 1.0, Math.PI);
  door(bf, 0.5, ch.Y0, 23, 1.0, 2.1, Math.PI, 0x2a3440);
  bf.use('concrete').box(0x9a9894, 0.5, CURB, 22.4, 1.6, ch.Y0 - CURB - 0.02, 1.0);
  bf.solid(0.5, 22.4, 1.6, 1.0, ch.Y0 - 0.02, 'step');
  bf.sign(textFace('Klubbstugan', 2.4, 0.42, { bg: '#f2f0e8', fg: '#7a2a1f', ppm: 220, weight: '700' }), 0.5, ch.Y0 + 2.45, 22.94, 2.4, 0.42, Math.PI);
  for (let k = 0; k < 3; k++) {
    bf.use('concrete').box(0x9a9894, 29.6 - k * 0.0 - (2 - k) * 0.9 + 0.9, CURB, 2, 0.9, 0.4 * (k + 1), 18);
    bf.use('wood').box(0x6e5238, 29.6 - (2 - k) * 0.9 + 0.9, CURB + 0.4 * (k + 1), 2, 0.85, 0.06, 18);
    bf.solid(29.6 - (2 - k) * 0.9 + 0.9, 2, 0.9, 18, CURB + 0.4 * (k + 1), 'stand');
  }
  // Gravel car park by the street.
  bf.useF('gravel').flat(C.gravel, -14, -24, 30, 12, CURB + 0.03);
  bf.useF('gravel').flat(C.gravel, -14, -32.8, 8, 3.7, CURB + 0.033);
  KEEP(bf, -14, -33, 4.5);
  for (const x of [-26, -22, -18, -10]) if (r() < 0.35) bf.car(pickR(CARS, r), x, -21.5, Math.PI, { color: pickR(CAR_COLS, r) });
  bf.mark('field', 0, -17.5, 0);
  snowPile(bf.S, bf.wx(-28.5, -28.5), bf.wz(-28.5, -28.5), 2.4, 1.5);
  for (const [x, z] of [[-29, 28], [29, 28], [27, -28], [10, -27]]) bf.tree(x, z, R(0.9, 1.15, r), r() < 0.5 ? 'birch' : 'spruce', r);
  LIT(bf, -14, -20); LIT(bf, 20, -16.5);
}

// ---------------------------------------------------------------------------------------------
// Forest block: spruce, pine and birch with an illuminated jogging track (elljusspår).
export function forestBlock(bf, r) {
  bf.useF('snow').flat(null, 0, 0, 62, 62, CURB + 0.02);
  const inset = 9;
  const track = [[-31 + inset, -31 + inset], [31 - inset, -31 + inset], [31 - inset, 31 - inset], [-31 + inset, 31 - inset]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = track[k], [bx, bz] = track[(k + 1) % 4];
    bf.useF('gravel').flat(0x7a7064, (ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) + 2.4, Math.abs(bz - az) + 2.4, CURB + 0.03);
    for (let t = 0.25; t < 1; t += 0.5) bf.plamp(ax + (bx - ax) * t + (az === bz ? 0 : 1.6), az + (bz - az) * t + (az === bz ? 1.6 : 0), 4.2);
  }
  bf.useF('gravel').flat(0x7a7064, 0, -26, 2.4, 10, CURB + 0.03);
  KEEP(bf, 0, -33, 3);
  bf.post(2.0, -29.5, Math.PI, [{ f: textFace('Motionsspår\n2,5 km', 0.8, 0.45, { bg: '#f2c414', fg: '#1a1a1a', ppm: 220, scale: 0.75, weight: '700' }), w: 0.8, h: 0.45 }], { top: 2.0 });
  const onTrack = (x, z) => {
    const e = 31 - inset;
    const nearLine = (Math.abs(Math.abs(x) - e) < 2.6 && Math.abs(z) < e + 2.6) || (Math.abs(Math.abs(z) - e) < 2.6 && Math.abs(x) < e + 2.6);
    return nearLine || (Math.abs(x) < 2.4 && z < -e);
  };
  for (let gx = -28; gx <= 28; gx += 6.2) for (let gz = -28; gz <= 28; gz += 6.2) {
    const x = gx + R(-2.2, 2.2, r), z = gz + R(-2.2, 2.2, r);
    if (onTrack(x, z)) continue;
    const t = r();
    // (the trees inside the stand, more than ~12 m from the streets and away from the track, are
    // the far templates: the edge trees hide them)
    const deep = Math.max(Math.abs(x), Math.abs(z)) < 17;
    tree(bf.S, bf.wx(x, z), bf.wz(x, z), R(0.85, 1.25, r), t < 0.55 ? 'spruce' : t < 0.78 ? 'pine' : 'birch', r, true, CURB, deep);
    if (r() < 0.25) { const ux = x + R(-2, 2, r), uz = z + R(-2, 2, r); if (!onTrack(ux, uz)) tree(bf.S, bf.wx(ux, uz), bf.wz(ux, uz), R(0.25, 0.45, r), 'spruce', r, false); }
  }
  for (let k = 0; k < 5; k++) {
    const x = R(-26, 26, r), z = R(-26, 26, r);
    if (onTrack(x, z)) continue;
    const s = R(1.4, 2.6, r);
    bf.S.use('concrete').add(stoneGeo(Math.floor(r() * 6)), pickR([0x7a7a76, 0x6e6c68, 0x84827c], r), mat(bf.wx(x, z), CURB + s * 0.2, bf.wz(x, z), r(), r() * 6, r() * 0.3, s * 1.3, s * 0.85, s));
    bf.circ(x, z, s * 0.55, CURB + s * 0.6, 'rock');
  }
  bf.mark('forest' + Math.round(bf.ox) + '_' + Math.round(bf.oz), 0, -24, 0);
}
