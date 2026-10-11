// 1970s Swedish radhusområde: rows (längor) of two- or one-and-a-half-storey row houses in
// stående panel, a parking lot with a garage row (garagelänga), a soprum and a car-free
// interior with walkways. Used for Ove's block and the generic 'radhus' blocks.

import { mat, PRIM } from '../gfx.js';
import { CURB } from './layout.js';
import { C, WALLS, DOORS, rnd, R, pickR, TAU, win as winFull, winLite, door, canopy, lampBox, hedge, quads, snowBank, snowPile, shrub, limb, taperGeo, HEDGE_GREEN, HEDGE_BARE, snowGuard, roofLadder, ventStack, downpipe, glow } from './kit.js';
import { textFace, picto, decal } from './signs.js';
import { keepClear, litterSpots, parkedCars, shared } from './data.js';
import { carFreeZones } from './layout.js';

const win = winFull;
export const UW = 5.4;   // unit width
export const D = 8.4;    // house depth

const jitter = (c, a, r = rnd) => {
  const f = 1 + (r() - 0.5) * 2 * a;
  const R_ = Math.min(255, ((c >> 16) & 255) * f), G_ = Math.min(255, ((c >> 8) & 255) * f), B_ = Math.min(255, (c & 255) * f);
  return (R_ << 16) | (G_ << 8) | B_;
};

const numFace = (n) => textFace(String(n), 0.2, 0.17, { bg: '#f2f0e8', fg: '#1d1d1d', ppm: 320, scale: 0.8, weight: '700' });

// Advent candlestick (adventsljusstake) in a window, just in front of the pane.
function advent(f, lx, y, lz, ly) {
  const nx = Math.sin(ly), nz = Math.cos(ly), ax = Math.cos(ly), az = -Math.sin(ly);
  const at = (a, n) => [lx + ax * a + nx * n, lz + az * a + nz * n];
  let p = at(0, 0.04);
  f.use('wood').box(0x3a2a20, p[0], y, p[1], 0.62, 0.05, 0.05, ly);
  f.use('light', { snow: 0 });
  for (let k = 0; k < 7; k++) {
    const a = -0.27 + k * 0.09, h = 0.08 + (3 - Math.abs(k - 3)) * 0.045;
    p = at(a, 0.045);
    f.box(glow(0xffcf80, 2.0), p[0], y + 0.05 + h, p[1], 0.022, 0.055, 0.022, ly);
  }
}

// One row (länga) of n units. f: frame at the row's front-left corner; local +x along the row,
// local +z into the houses (depth D); the fronts face local -z, the backs +z.
// o: storeys (2 | 1.5), wall, trim, roof ('tile' | 'metalroof'), roofC, FG (front garden depth),
//    BG (back garden depth), front ('hedge' | 'fence'), num0 (first house number), doors,
//    r (rng), unit(k, info) callback for special decoration.
// Returns { len, units: [{ k, a0, door: [lx, lz] (on the path, 1.3 m out), doorW: [x, z] }] }.
export function radhusRow(f, n, o = {}) {
  const r = o.r || rnd;
  const win = o.lite ? (f_, lx, y, lz, w, h, ly, op = {}) => winLite(f_, lx, y, lz, w, h, ly, op.trim ?? C.trim, (op.panes ?? 2) > 1) : winFull;
  const two = o.storeys !== 1.5;
  const wall = o.wall ?? pickR(WALLS, r), trim = o.trim ?? C.trim;
  const len = n * UW;
  const PL = 0.32, Y0 = CURB + PL;
  const Hw = two ? 5.15 : 2.9, Ye = Y0 + Hw;
  const pitch = two ? 0.38 : 0.7;
  const roofS = o.roof ?? 'tile';
  const ov = 0.5, gov = 0.35, th = roofS === 'metalroof' ? 0.06 : 0.16;
  const roofC = o.roofC ?? (roofS === 'metalroof' ? C.metalBlack : pickR([C.roofBlack, C.roofBlack, C.roofGrey], r));
  const FG = o.FG ?? 2.6, BG = o.BG ?? 4.5;
  const shedC = o.shedC ?? jitter(wall, 0.06, r);
  const units = [];

  // Plinth, walls (one box per unit: each gets its own board tones), gables under the roof.
  f.use('concrete').box(C.plinth, len / 2, CURB - 0.05, D / 2, len + 0.06, PL + 0.05, D + 0.06);
  for (let k = 0; k < n; k++) f.use('wood').box(jitter(wall, 0.035, r), k * UW + UW / 2, Y0 - 0.02, D / 2, UW, Hw + 0.02, D);
  const rise = (D / 2) * Math.tan(pitch);
  f.use('wood').add(PRIM.prism(), wall, len / 2, Ye, D / 2, 0, len, rise, D);
  // Roof: two slabs, fascia boards, gutters, ridge.
  const half = D / 2 + ov, L = half / Math.cos(pitch), drop = ov * Math.tan(pitch);
  const yc = Ye + (rise - drop) / 2 + th / 2 / Math.cos(pitch);
  f.use(roofS).boxC(roofC, len / 2, yc, D / 4 - ov / 2, len + 2 * gov, th, L, 0, -pitch);
  f.use(roofS).boxC(roofC, len / 2, yc, (3 * D) / 4 + ov / 2, len + 2 * gov, th, L, 0, pitch);
  if (roofS === 'metalroof') f.use('painted').boxC(0x2e3134, len / 2, Ye + rise + th * 0.9, D / 2, len + 2 * gov + 0.02, 0.08, 0.3);
  else f.use(roofS).boxC(roofC, len / 2, Ye + rise + th * 0.9, D / 2, len + 2 * gov, 0.1, 0.34);
  f.use('painted');
  for (const [z, s] of [[D / 4 - ov / 2, -1], [(3 * D) / 4 + ov / 2, 1]]) {
    for (const x of [-gov - 0.02, len + gov + 0.02]) f.boxC(trim, x, yc - 0.03, z, 0.05, 0.26, L + 0.02, 0, s * pitch);
  }
  // Eave fascias, tall enough to cover the slab's cut edge (no tile 'barcode').
  f.boxC(trim, len / 2, Ye - drop + th * 0.45, -ov - 0.01, len + 2 * gov, 0.2 + th * 0.9, 0.04);
  f.boxC(trim, len / 2, Ye - drop + th * 0.45, D + ov + 0.01, len + 2 * gov, 0.2 + th * 0.9, 0.04);
  f.use('metal');
  f.cyl(0x3a3d40, len / 2, Ye - drop - 0.1, -ov - 0.08, 0.07, len + 2 * gov, 8, 0, Math.PI / 2);
  f.cyl(0x3a3d40, len / 2, Ye - drop - 0.1, D + ov + 0.08, 0.07, len + 2 * gov, 8, 0, Math.PI / 2);
  // Roof furniture: a snow guard over the walkway side's eave (required over a walkway), roof
  // ladders up to the ridge on every second house, a vent stack per house on the back slope.
  const slope = (dir) => ({ zr: D / 2 + dir * (th / 2) * Math.sin(pitch), yr: yc + (L / 2) * Math.sin(pitch) + (th / 2) * Math.cos(pitch), dir, p: pitch, L });
  const PF = slope(-1), PB = slope(1);
  snowGuard(f, PF, -gov + 0.12, len + gov - 0.12);
  for (let k = 0; k < n; k++) {
    if (k % 2 === 0) roofLadder(f, PF, k * UW + (two ? 1.0 : 0.7));
    ventStack(f, PB, k * UW + 1.4 + (k % 3) * 0.6, L * 0.25, k % 2 ? 0.55 : 0.7, k % 2 ? 0.07 : 0.1);
  }
  // Downpipes from the gutters on every second house, front and back.
  for (let k = 1; k < n; k += 2) {
    downpipe(f, k * UW + 5.15, 0, -0.08, -ov - 0.08, Ye - drop - 0.1);
    downpipe(f, k * UW + 5.15, D, 0.08, D + ov + 0.08, Ye - drop - 0.1);
  }
  // Corner boards at the row ends.
  f.use('painted');
  for (const x of [0.03, len - 0.03]) for (const z of [0.03, D - 0.03]) f.box(trim, x, Y0, z, 0.15, Hw, 0.15);
  // Gable windows (two-storey rows have a small gable window upstairs).
  for (const [x, ly] of [[0, -Math.PI / 2], [len, Math.PI / 2]]) {
    win(f, x, Y0 + (two ? 3.6 : 1.0), D / 2, 1.0, 1.0, ly, { trim });
    if (two) win(f, x, Ye + rise * 0.25, D / 2, 0.6, 0.6, ly, { trim, panes: 1 });
  }
  f.solid(len / 2, D / 2, len, D, 99, 'building');

  for (let k = 0; k < n; k++) {
    const a0 = k * UW, X = (a) => a0 + a;
    const pre = (o.pre && o.pre(k)) || {};
    const doorC = pre.doorC ?? (o.doors ? o.doors[k % o.doors.length] : pickR(DOORS, r));
    const info = { k, a0, doorC, num: (o.num0 ?? 1) + k * 2, f };
    // Party-wall boards (lisener) between units.
    if (k > 0) {
      f.use('painted');
      f.box(trim, X(0), Y0, -0.025, 0.13, Hw, 0.05);
      f.box(trim, X(0), Y0, D + 0.025, 0.13, Hw, 0.05);
    }
    // Förråd at the front, left side of the unit: an entry nook forms between the sheds.
    const sw = 1.8, sd = 2.0, sh = 2.15;
    f.use('wood').box(shedC, X(0.08 + sw / 2), CURB, -sd / 2, sw, sh, sd);
    f.use('painted').box(trim, X(0.08 + sw / 2), CURB + sh - 0.12, -sd - 0.02, sw + 0.04, 0.12, 0.04);
    f.roof(C.metalBlack, X(0.08 + sw / 2), CURB + sh + 0.1, -sd / 2 - 0.12, sw + 0.22, sd + 0.4, -0.1, 0, { fh: 0.12, fascia: trim === C.trim ? 0x2e3134 : trim });
    f.use('wood').box(jitter(doorC, 0.05, r), X(0.08 + sw / 2), CURB + 0.05, -sd - 0.025, 0.78, 1.85, 0.04);
    f.use('metal').box(0x2a2a2a, X(0.08 + sw / 2 + 0.28), CURB + 1.0, -sd - 0.05, 0.04, 0.12, 0.03);
    f.solid(X(0.08 + sw / 2), -sd / 2, sw, sd, CURB + 2.4, 'shed');
    // Entrance: step, door, canopy, lamp, number.
    const dA = 2.72;
    f.use('concrete').box(0x9a9894, X(dA), CURB, -0.45, 1.3, 0.17, 0.9);
    f.solid(X(dA), -0.45, 1.3, 0.9, CURB + 0.17, 'step');
    door(f, X(dA), Y0, 0, 0.95, 2.05, Math.PI, doorC, { trim });
    if (!pre.noCanopy) canopy(f, X(dA - 0.1), Y0 + 2.27, 0, 1.75, 1.05, Math.PI, C.metalBlack, trim);
    lampBox(f, X(dA + 0.82), Y0 + 1.65, 0, Math.PI);
    f.sign(numFace(info.num), X(dA + 0.82), Y0 + 2.08, -0.035, 0.2, 0.17, Math.PI);
    // Kitchen window by the door; upstairs windows or a dormer. (pre.kitchenGlass: a builder for its
    // panes - Rune's, looked out of from inside: world/interior.js)
    const kw = advent;
    win(f, X(4.35), Y0 + 1.0, 0, 1.25, 1.05, Math.PI, { trim, glassG: pre.kitchenGlass });
    if (r() < (o.advent ?? 0.3)) kw(f, X(4.35), Y0 + 1.02, 0, Math.PI);
    if (two) {
      win(f, X(1.35), Y0 + 3.55, 0, 1.15, 1.1, Math.PI, { trim });
      win(f, X(4.1), Y0 + 3.55, 0, 1.15, 1.1, Math.PI, { trim });
    } else {
      // Shed dormer (takkupa) on the front slope.
      const dz0 = 0.35, dzh = 1.75;
      f.use('wood').box(wall, X(2.9), Ye - 0.2, dz0 + 0.95, 2.5, dzh + 0.2, 1.9);
      f.use('painted').box(trim, X(2.9 - 1.25), Ye - 0.2, dz0, 0.12, dzh + 0.2, 0.05).box(trim, X(2.9 + 1.25), Ye - 0.2, dz0, 0.12, dzh + 0.2, 0.05);
      f.use(roofS).boxC(roofC, X(2.9), Ye + dzh + 0.07, dz0 + 0.85, 2.85, 0.1, 2.3, 0, -0.12);
      win(f, X(2.9), Ye + 0.35, dz0, 1.3, 1.0, Math.PI, { trim });
    }
    // Back: living-room window, patio door, upstairs windows, deck, privacy screen. (pre.backGlass: a
    // builder for the big window's panes - Ove's bedroom looks out of it: world/interior.js)
    win(f, X(1.6), Y0 + 0.55, D, 1.9, 1.45, 0, { trim, panes: 3, glassG: pre.backGlass });
    win(f, X(4.15), Y0 + 0.02, D, 0.92, 2.05, 0, { trim, panes: 1, sill: false });
    if (two) { win(f, X(1.35), Y0 + 3.55, D, 1.15, 1.1, 0, { trim }); win(f, X(4.1), Y0 + 3.55, D, 1.15, 1.1, 0, { trim }); }
    f.use('wood').box(0x6a5a4a, X(UW / 2), CURB, D + 1.3, UW - 0.12, 0.13, 2.6);
    f.solid(X(UW / 2), D + 1.3, UW - 0.12, 2.6, CURB + 0.13, 'deck');
    if (k > 0 || true) {
      f.use('wood').box(0x5a4c3e, X(0.02), CURB, D + 1.5, 0.07, 1.75, 3.0);
      f.solid(X(0.02), D + 1.5, 0.12, 3.0, CURB + 1.75, 'screen');
    }
    if (k === n - 1) { f.use('wood').box(0x5a4c3e, X(UW - 0.02), CURB, D + 1.5, 0.07, 1.75, 3.0); f.solid(X(UW - 0.02), D + 1.5, 0.12, 3.0, CURB + 1.75, 'screen'); }
    // Front garden: path, edge hedge or picket fence with a gap, lawn is the block's base.
    f.useF('paving').flat(C.paving, X(dA), -(0.9 + FG) / 2, 1.15, FG - 0.9, CURB + 0.032);
    if (!o.lite) for (const sd of [-1, 1]) f.fringe(X(dA) + sd * 0.575, -0.95, X(dA) + sd * 0.575, -FG + 0.05, -sd, CURB + 0.032, Math.floor(r() * 999), { reach: 0.22 });
    const edgeZ = -FG + 0.2;
    const segs = [[0.08 + sw + 0.05, dA - 0.65], [dA + 0.65, UW]];
    const front = (o.frontFn && o.frontFn(k)) || o.front || 'green';
    info.front = front;
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.3) continue;
      if (front === 'fence') picket(f, X(s0), X(s1), edgeZ);
      else if (front === 'square') f.hedge(X((s0 + s1) / 2), edgeZ, s1 - s0, 0.42, 0.8, 0, 0x33432e, true, { square: true, bronze: 0.15 });
      else if (front === 'bare') f.hedge(X((s0 + s1) / 2), edgeZ, s1 - s0, 0.45, 0.85, 0, HEDGE_BARE, true, { kind: 'bare' });
      else f.hedge(X((s0 + s1) / 2), edgeZ, s1 - s0, 0.42, 0.85, 0, jitter(HEDGE_GREEN, 0.06, r));
    }
    // Back garden: lawn (block base) beyond the deck, and one to three of the things a Swedish
    // back garden holds in November (on the deck when the garden is shallow).
    {
      const deep = BG > 3.6, slots = [0.95, 2.6, 4.35].sort(() => r() - 0.5);
      const ni = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      let big = false;
      for (let q = 0; q < ni; q++) {
        const sx = X(slots[q]), zz = deep ? D + 2.9 + r() * (BG - 3.5) : D + 0.9 + r() * 1.0, roll = r();
        if (deep && roll < 0.14) f.tree(sx, D + BG - 0.9, R(0.8, 1.1, r), 'small', r);
        else if (deep && roll < 0.2) f.tree(sx, D + BG - 0.9, R(0.75, 0.95, r), 'birch', r);
        else if (deep && roll < 0.3) dryer(f, sx, zz);
        else if (deep && roll < 0.38 && !big) { playhouse(f, X(UW / 2), D + BG - 1.2, r); big = true; break; }
        else if (roll < 0.5) compost(f, sx, deep ? D + BG - 0.7 : D + 2.15);
        else if (roll < 0.64) coveredSet(f, sx, deep ? zz : D + 1.3, r);
        else if (roll < 0.74) grill(f, sx, deep ? zz : D + 2.0);
        else if (roll < 0.82) birdTable(f, sx, zz);
        else if (deep && roll < 0.88 && !big) { miniGreenhouse(f, sx, D + BG - 1.15); big = true; }
        else f.prop(r() < 0.65 ? 'pulka' : 'snowman', sx, zz, r() * TAU);
      }
    }
    if (r() < 0.2) gardenSet(f, X(R(1.5, 3.9, r)), D + 1.3);
    info.doorL = [X(dA), -1.3];
    info.doorW = f.W(X(dA), -1.3);
    info.dA = dA;
    info.shedL = [X(0.08 + sw / 2), -sd / 2];
    info.backL = [X(UW / 2), D + 1.3];
    units.push(info);
    const special = o.unit ? o.unit(k, info) : false;
    if (!special) {
      // Everyday things by the door: a wheelie bin under the kitchen window, a kicksled.
      if (r() < 0.3) f.prop('trashcan', X(4.75), -0.55, Math.PI);
      if (r() < 0.22) f.prop('kicksled', X(4.55), -1.35, Math.PI / 2);
      else if (r() < 0.12) f.prop('pulka', X(4.5), -1.4, Math.PI / 2);
    }
  }
  // Back fence along the end of the gardens: a plank fence, a low picket fence or a hedge (o.backFence
  // 'wood' | 'picket' | 'hedge'; false: none).
  if (o.backFence) {
    if (o.backFence === 'hedge') f.hedge(len / 2, D + BG - 0.32, len, 0.6, 1.25, 0, jitter(HEDGE_GREEN, 0.06, r), true, { bronze: 0.4 });
    else {
      const nseg = Math.ceil(len / 2.5);
      const step = len / nseg;
      for (let m = 0; m < nseg; m++) f.prop(o.backFence === 'picket' ? 'fence' : 'woodfence', step * (m + 0.5), D + BG - 0.1, Math.PI);
    }
  }
  return { len, units, Ye, rise, wall, roofC };
}

// Grit box (sandlåda): a green plastic chest with a sloped lid, SAND on the front. Frame at its
// centre, front towards local -z.
function sandBox(f) {
  f.use('plastic').box(0x2f5a3a, 0, CURB, 0, 1.15, 0.62, 0.62);
  f.use('plastic').boxC(0x2a5034, 0, CURB + 0.66, 0.02, 1.2, 0.05, 0.7, 0, 0.12);
  f.sign(textFace('SAND', 0.42, 0.15, { bg: '#2f5a3a', fg: '#f2f0e8', ppm: 400, weight: '700', scale: 0.8 }), 0, CURB + 0.42, -0.315, 0.42, 0.15, Math.PI);
  f.solid(0, 0, 1.15, 0.62, CURB + 0.7, 'box');
}

// Static white picket fence from x0 to x1 (local) along local x at z.
function picket(f, x0, x1, z) {
  const n = Math.max(1, Math.round((x1 - x0) / 0.19));
  f.use('painted');
  for (let k = 0; k < n; k++) f.box(0xe6e2da, x0 + (k + 0.5) * ((x1 - x0) / n), CURB, z, 0.09, 0.9, 0.024);
  f.box(0xdcd6cc, (x0 + x1) / 2, CURB + 0.28, z + 0.04, x1 - x0, 0.07, 0.04);
  f.box(0xdcd6cc, (x0 + x1) / 2, CURB + 0.7, z + 0.04, x1 - x0, 0.07, 0.04);
  f.solid((x0 + x1) / 2, z, x1 - x0, 0.15, CURB + 0.9, 'fence');
}
// Rotary clothes dryer (torkvinda): a pole with folded arms.
function dryer(f, x, z) {
  f.use('metal');
  f.cyl(0x9a9da0, x, CURB + 0.95, z, 0.03, 1.9, 6);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4;
    f.boxC(0x9a9da0, x + Math.cos(a) * 0.12, CURB + 1.55, z + Math.sin(a) * 0.12, 0.02, 0.8, 0.02, -a, 0.08, 0);
  }
  f.circ(x, z, 0.08);
}
// Little red playhouse (lekstuga).
function playhouse(f, x, z, r) {
  const c = pickR([C.falu, 0xb8913f, 0x86927f], r);
  f.use('wood').box(c, x, CURB, z, 1.8, 1.35, 1.5);
  f.add(PRIM.prism(), c, x, CURB + 1.35, z, 0, 1.8, 0.7, 1.5);
  f.use('tile').boxC(C.roofBlack, x, CURB + 1.72, z - 0.42, 2.1, 0.06, 1.0, 0, -0.75).boxC(C.roofBlack, x, CURB + 1.72, z + 0.42, 2.1, 0.06, 1.0, 0, 0.75);
  f.use('painted').box(C.trim, x - 0.4, CURB, z - 0.77, 0.6, 1.05, 0.04);
  win(f, x + 0.45, CURB + 0.55, z - 0.75, 0.45, 0.45, Math.PI, { panes: 1, sill: false });
  f.solid(x, z, 1.8, 1.5, CURB + 1.4, 'shed');
}
// Compost bin (kompost): a green plastic thermo-composter with a lid, or a slatted wooden box.
function compost(f, x, z) {
  if (hashN(x * 3.1 + z) < 0.5) { f.use('plastic').box(0x2f4a30, x, CURB, z, 0.8, 0.85, 0.8); f.use('plastic').boxC(0x2a4028, x, CURB + 0.9, z, 0.86, 0.08, 0.86, 0, 0.08); }
  else { f.use('wood'); for (let k = 0; k < 5; k++) { f.box(0x6a5440, x, CURB + 0.05 + k * 0.16, z - 0.42, 0.9, 0.11, 0.04).box(0x6a5440, x, CURB + 0.05 + k * 0.16, z + 0.42, 0.9, 0.11, 0.04); f.box(0x6a5440, x - 0.43, CURB + 0.05 + k * 0.16, z, 0.04, 0.11, 0.84).box(0x6a5440, x + 0.43, CURB + 0.05 + k * 0.16, z, 0.04, 0.11, 0.84); } f.use('snow').box(0xeef0f2, x, CURB, z, 0.8, 0.6, 0.8); }
  f.solid(x, z, 0.9, 0.9, CURB + 0.95, 'box');
}
// Garden furniture stacked under a tarpaulin for the winter.
function coveredSet(f, x, z, r) {
  const a = (r() - 0.5) * 0.3;
  f.use('fabric', { snow: 1 }).box(pickR([0x4a5a4a, 0x3a4652, 0x5a5048], r), x, CURB, z, 1.3, 0.85, 0.8, a);
  f.use('fabric', { snow: 1 }).box(0x3a4652, x, CURB + 0.85, z, 1.2, 0.08, 0.7, a);
  f.solid(x, z, 1.3, 0.8, CURB + 0.95, 'box');
}
// A kettle grill under a black cover.
function grill(f, x, z) {
  f.use('fabric').cyl(0x1e2022, x, CURB + 0.42, z, 0.3, 0.84, 12);
  f.use('fabric').add(PRIM.dome(), 0x1e2022, x, CURB + 0.84, z, 0, 0.6, 0.3, 0.6);
  f.circ(x, z, 0.32, CURB + 1.0);
}
function birdTable(f, x, z) {
  f.use('wood');
  f.box(0x6a5440, x, CURB, z, 0.07, 1.45, 0.07);
  f.box(0x7a6048, x, CURB + 1.45, z, 0.5, 0.04, 0.5);
  f.add(PRIM.prism(), 0x5a3026, x, CURB + 1.75, z, 0, 0.62, 0.2, 0.62);
  for (const [a, b] of [[-0.22, -0.22], [0.22, 0.22]]) f.box(0x6a5440, x + a, CURB + 1.48, z + b, 0.04, 0.28, 0.04);
  f.circ(x, z, 0.08);
}
// A small greenhouse of see-through panels on an aluminium frame.
function miniGreenhouse(f, x, z) {
  f.use('metal');
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.5, 0.5]) f.box(0xc8cacc, x + sx, CURB, z + sz, 0.04, 1.7, 0.04);
  f.box(0xc8cacc, x, CURB + 1.7, z, 1.56, 0.04, 1.06);
  tglassF(f, x, CURB + 0.05, z - 0.52, 1.5, 1.6, 0.02); tglassF(f, x, CURB + 0.05, z + 0.52, 1.5, 1.6, 0.02);
  tglassF(f, x - 0.77, CURB + 0.05, z, 0.02, 1.6, 1.0); tglassF(f, x + 0.77, CURB + 0.05, z, 0.02, 1.6, 1.0);
  f.use('snow').box(0xeef0f2, x, CURB + 1.72, z, 1.5, 0.05, 1.0);
  f.solid(x, z, 1.6, 1.1, CURB + 1.75, 'shed');
}
function tglassF(f, lx, y0, lz, w, h, d) { shared.glassG.boxB(null, f.wx(lx, lz), y0, f.wz(lx, lz), w, h, d, f.yaw); }
const hashN = (v) => { const x = Math.sin(v * 127.1) * 43758.5453; return x - Math.floor(x); };

// Garden table and two chairs under the snow.
function gardenSet(f, x, z) {
  f.use('wood');
  f.box(0x6e5a44, x, CURB + 0.7, z, 1.2, 0.05, 0.75);
  for (const s of [-0.5, 0.5]) f.box(0x5a4a3a, x + s, CURB, z, 0.06, 0.7, 0.6);
  for (const s of [-0.95, 0.95]) { f.box(0x6e5a44, x + s, CURB + 0.42, z, 0.45, 0.04, 0.45); f.box(0x5a4a3a, x + s * 1.15, CURB + 0.44, z, 0.04, 0.5, 0.45); }
}

// ---------------------------------------------------------------------------------------------
// Garage row (garagelänga). f at the row's front-left corner, doors along local x facing local -z.
// o.open: index of a garage built open with its interior; o.doorC, o.wall. o.moving: that garage's
// door is a moving one (garagedoor.js, Ove's): only its tracks are built here, not the door tipped up
// under the ceiling.
export function garageRow(f, n, o = {}) {
  const GW = o.GW ?? 3.05, GD = 6.0, GH = 2.55, len = n * GW;
  const wall = o.wall ?? C.brown, trim = o.trim ?? C.trim, doorC = o.doorC ?? 0x6a4a34;
  const open = o.open ?? -1;
  // Walls: closed parts as solid blocks, the open garage built as a shell.
  const runs = [];
  let s = 0;
  for (let k = 0; k <= n; k++) if (k === open || k === n) { if (k > s) runs.push([s, k]); s = k + 1; }
  f.use('wood');
  for (const [a, b] of runs) {
    f.box(wall, (a + b) * GW / 2, CURB, GD / 2, (b - a) * GW, GH, GD);
    f.solid((a + b) * GW / 2, GD / 2, (b - a) * GW, GD, 99, 'garage');
  }
  if (open >= 0) {
    const x0 = open * GW, cx = x0 + GW / 2;
    // End wall(s) and back wall; the neighbours' blocks are the other walls.
    if (open === 0) { f.box(wall, x0 + 0.08, CURB, GD / 2, 0.16, GH, GD); f.solid(x0 + 0.08, GD / 2, 0.16, GD, 99, 'garage'); }
    if (open === n - 1) { f.box(wall, x0 + GW - 0.08, CURB, GD / 2, 0.16, GH, GD); f.solid(x0 + GW - 0.08, GD / 2, 0.16, GD, 99, 'garage'); }
    f.box(wall, cx, CURB, GD - 0.08, GW, GH, 0.16);
    f.solid(cx, GD - 0.08, GW, 0.16, 99, 'garage');
    f.use('concrete', { snow: 0 }).box(0x8e8c88, cx, CURB, GD / 2, GW - 0.1, 0.03, GD - 0.1);
    // The up-and-over door, tipped up under the ceiling; a moving one rides in two tracks there.
    if (!o.moving) f.use('painted', { snow: 0 }).box(doorC, cx, CURB + GH - 0.32, 1.25, GW - 0.5, 0.05, 2.2);
    else {
      // (the panel's edges run just inside them; they rise 9 cm into the garage, hung from the
      // ceiling)
      f.use('metal', { snow: 0 });
      for (const s of [-1, 1]) {
        const x = cx + s * (GW / 2 - 0.17);
        f.boxC(0x5e6266, x, CURB + 2.21, 1.27, 0.03, 0.06, 2.42, 0, -0.037);
        for (const z of [1.3, 2.42]) f.box(0x5e6266, x, CURB + 2.2, z, 0.025, GH + 0.1 - 2.2, 0.04);
      }
    }
    // (round 6: a bright tube, but under the bloom threshold: it smeared across the garage ceiling)
    f.use('light', { snow: 0 }).box(glow(0xf4f6ff, 1.5), cx, CURB + GH - 0.1, GD * 0.55, 0.1, 0.05, 1.3);
  }
  // Roof slab, slight slope to the back, and a front fascia.
  f.roof(o.roofC ?? C.metalBlack, len / 2, CURB + GH + 0.12, GD / 2 + 0.05, len + 0.5, GD + 0.7, 0.04, 0, { fascia: trim, fh: 0.32 });
  const doors = [];
  for (let k = 0; k < n; k++) {
    const cx = k * GW + GW / 2;
    f.use('painted');
    f.box(trim, cx - GW / 2 + 0.1, CURB, -0.03, 0.12, 2.22, 0.06).box(trim, cx + GW / 2 - 0.1, CURB, -0.03, 0.12, 2.22, 0.06);
    f.box(trim, cx, CURB + 2.16, -0.03, GW - 0.08, 0.12, 0.06);
    if (k !== open) {
      f.box(o.doors ? o.doors[k % o.doors.length] : doorC, cx, CURB, -0.02, GW - 0.32, 2.16, 0.04);
      f.use('painted');
      for (let q = 1; q < 6; q++) f.box(jitter(doorC, 0.15), cx, CURB + q * 0.36, -0.045, GW - 0.34, 0.03, 0.02);
      f.use('metal').box(0x9a9da0, cx, CURB + 0.95, -0.06, 0.22, 0.05, 0.03);
    }
    if (o.numbers !== false) f.sign(numFace(k + 1), cx, CURB + 2.36, -0.065, 0.2, 0.17, Math.PI);
    if (k % 2 === 0) { f.use('painted').box(0x2a2a2a, cx, CURB + 2.32, -0.14, 0.2, 0.12, 0.18); f.use('light').box(glow(0xffe0b0, 0.8), cx, CURB + 2.3, -0.2, 0.16, 0.02, 0.1); }
    doors.push(f.W(cx, -1.5));
  }
  return { len, GW, GD, doors };
}

// Interior of an open garage: workbench, pegboard, shelves, winter tyres, shovel.
export function garageInterior(f, cx, GW = 3.05, GD = 6.0) {
  const x0 = cx - GW / 2;
  f.use('wood', { snow: 0 });
  f.box(0x8a6a48, cx, CURB + 0.86, GD - 0.5, GW - 0.5, 0.06, 0.62);
  f.use('painted', { snow: 0 });
  for (const s of [-1, 1]) f.box(0x3a4a5a, cx + s * (GW / 2 - 0.4), CURB, GD - 0.5, 0.06, 0.86, 0.55);
  f.box(0x3a4a5a, cx, CURB + 0.25, GD - 0.5, GW - 0.6, 0.04, 0.55);
  f.use('wood', { snow: 0 }).box(0x9a8058, cx, CURB + 1.15, GD - 0.18, GW - 0.6, 0.9, 0.03);
  f.use('metal', { snow: 0 });
  for (let k = 0; k < 9; k++) f.box(pickR([0x3a3a3a, 0x7a2a22, 0x2a4a7a, 0x9a9da0]), cx - 1.0 + k * 0.25, CURB + 1.25 + (k % 3) * 0.18, GD - 0.21, 0.04, 0.22 + (k % 2) * 0.08, 0.04);
  // Shelf along the left wall with tins and boxes.
  f.use('metal', { snow: 0 });
  for (let q = 0; q < 3; q++) f.box(0x8a8e92, x0 + 0.38, CURB + 0.7 + q * 0.55, GD * 0.62, 0.42, 0.03, 2.2);
  for (const z of [GD * 0.62 - 1.08, GD * 0.62 + 1.08]) f.box(0x8a8e92, x0 + 0.38, CURB, z, 0.42, 1.9, 0.04);
  f.use('plastic', { snow: 0 });
  for (let q = 0; q < 3; q++) for (let k = 0; k < 4; k++) f.box(pickR([0x7a5a3a, 0x4a5a6a, 0x9a2a22, 0x5a6a4a, 0xb8a888]), x0 + 0.38, CURB + 0.73 + q * 0.55, GD * 0.62 - 0.8 + k * 0.5, 0.32, 0.2 + (k % 2) * 0.08, 0.34);
  // Winter tyres stacked in the corner, a snow shovel, a ladder on the wall.
  f.use('rubber', { snow: 0 });
  for (let k = 0; k < 4; k++) f.cyl(0x1a1a1c, x0 + GW - 0.55, CURB + 0.11 + k * 0.21, GD - 1.4, 0.32, 0.2, 14);
  f.use('plastic', { snow: 0 }).boxC(0x2a4a7a, x0 + GW - 0.3, CURB + 0.75, 1.2, 0.42, 0.05, 0.36, 0, 0.1);
  f.use('wood', { snow: 0 }).boxC(0x8a6a48, x0 + GW - 0.3, CURB + 1.2, 1.2, 0.04, 1.3, 0.04, 0, 0.12);
  f.use('metal', { snow: 0 });
  for (const s of [-0.2, 0.2]) f.box(0x9a9da0, x0 + 0.12, CURB + 0.6, 1.6 + s, 0.04, 2.0, 0.04);
  for (let q = 0; q < 6; q++) f.box(0x9a9da0, x0 + 0.12, CURB + 0.75 + q * 0.3, 1.6, 0.04, 0.03, 0.4);
  // Colliders: bench and shelf.
  f.solid(cx, GD - 0.45, GW - 0.4, 0.75, CURB + 0.95, 'bench');
  f.solid(x0 + 0.38, GD * 0.62, 0.45, 2.3, CURB + 2.0, 'shelf');
}

// ---------------------------------------------------------------------------------------------
// The whole area. bf: frame at the block interior centre (62 x 62 m); the parking lot lies along
// local -z with its entrance from the local -x street. Returns the named parts (local coords).
export function radhusArea(bf, o = {}) {
  const r = o.r || rnd;
  const L = 31;
  const out = { rows: {}, bays: [], lot: {} };
  // Ground: snowy lawn everywhere, then the hard surfaces.
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  // Parking lot: aisle + north bays across the whole width, bays and soprum on the south-west.
  bf.useF('asphalt').flat(C.lot, 0, -25.25, 62, 11.5, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, -17.25, -16.75, 27.5, 5.5, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, -32.8, -22.75, 3.7, 6.5, CURB + 0.033); // entrance over the sidewalk
  keepClear.push({ ...xz(bf, -33, -22.75), r: 5 });
  const lines = [];
  // North bays, nose to the local north edge.
  const nb = 22, bw = 2.7;
  for (let k = 0; k <= nb; k++) if (k !== 11) lines.push([-29.7 + k * bw, -28.3, 0.1, 4.7]);
  for (let k = 0; k < nb; k++) if (k !== 10 && k !== 11) out.bays.push({ lx: -29.7 + (k + 0.5) * bw, lz: -28.4, ly: Math.PI, row: 'north' });
  // Mailbox island across from the walkway entrance (the postman stops in the aisle).
  bf.useF('paving').flat(C.paving, 0, -28.6, 5.2, 4.2, CURB + 0.04);
  bf.use('concrete').box(C.granite, 0, CURB, -26.45, 5.3, 0.14, 0.2);
  bf.prop('mailrow', -1.3, -28.2, 0);
  bf.prop('mailrow', 1.3, -28.2, 0);
  out.mail = [{ lx: -1.3, lz: -27.4 }, { lx: 1.3, lz: -27.4 }];
  // South-west bays: reserved / guests (4) / handicap.
  const sb = [-30.5, -27.9, -25.3, -22.7, -20.1, -17.5, -13.9];
  for (const x of sb) lines.push([x, -16.75, 0.1, 5.2]);
  for (let k = 0; k < sb.length - 1; k++) out.bays.push({ lx: (sb[k] + sb[k + 1]) / 2, lz: -16.9, ly: 0, row: 'south', w: sb[k + 1] - sb[k], kind: k === 0 ? 'reserved' : k === 5 ? 'handicap' : 'guest' });
  quads(bf.F.use('marking'), 0xd8d8d0, lines.map(([x, z, w, d]) => [bf.wx(x, z), bf.wz(x, z), w, d, bf.yaw]), CURB + 0.042);
  bf.decal(decal('hcp'), -15.7, -16.6, 1.5, 1.5, Math.PI);
  // Low kerb between the north bays and the sidewalk (plowed snow left ragged along it), snow piles
  // at the aisle's dead end.
  bf.use('concrete').box(C.granite, 0, CURB, -30.85, 62, 0.12, 0.2);
  bf.fringe(-30.5, -30.72, 30.5, -30.72, 1, CURB + 0.03, 17, { reach: 0.55 });
  bf.pile(29.2, -23.0, 2.3, 1.4, true, -Math.PI / 2);
  bf.pile(-30.0, -30.3, 1.4, 0.8, false, Math.PI / 2);
  // Garage row on the south-east side of the aisle.
  const gf = bf.sub(3.5, -19.5, 0);
  out.garages = garageRow(gf, 9, { wall: o.garageWall ?? o.walls?.[0] ?? C.brown, open: o.openGarage ?? -1, moving: !!o.movingGarage, doorC: o.garageDoor ?? 0x5a4632 });
  out.garageFrame = gf;
  // Soprum + återvinning: a small building with its doors on the aisle, containers in a screen.
  const sp = bf.sub(-6.8, -17.0, 0);
  sp.use('wood').box(o.walls?.[1] ?? C.brown, 0, CURB, 0, 6.4, 2.5, 4.4);
  sp.roof(C.metalBlack, 0, CURB + 2.62, 0.1, 6.8, 4.9, 0.05, 0, { fh: 0.22 });
  sp.use('painted');
  for (const x of [-1.6, 1.6]) { sp.box(0x3a4a3e, x, CURB, -2.22, 1.4, 2.05, 0.05); sp.box(C.trim, x, CURB + 2.05, -2.24, 1.6, 0.1, 0.05); }
  sp.use('metal').box(0x9a9da0, -1.1, CURB + 1.0, -2.27, 0.03, 0.15, 0.04).box(0x9a9da0, 2.1, CURB + 1.0, -2.27, 0.03, 0.15, 0.04);
  sp.sign(textFace('Hushållsavfall', 1.1, 0.26, { bg: '#3a3e40', fg: '#f4f2ea', ppm: 300, scale: 0.7, weight: '700' }), -1.6, CURB + 1.75, -2.27, 1.1, 0.26, Math.PI);
  sp.sign(textFace('Matavfall', 1.1, 0.26, { bg: '#6a4426', fg: '#f4f2ea', ppm: 300, scale: 0.7, weight: '700' }), 1.6, CURB + 1.75, -2.27, 1.1, 0.26, Math.PI);
  sp.solid(0, 0, 6.4, 4.4, 99, 'building');
  out.soprum = { lx: -6.8, lz: -21.2 };
  // Återvinning: four big bins behind a plank screen.
  const av = bf.sub(-11.8, -16.9, 0);
  av.use('concrete').box(0x9a9894, 0, CURB, 0, 3.2, 0.04, 4.6);
  const binC = [[0x2f5a3a, 'Glas'], [0x2a4a7a, 'Papper'], [0xb08a2a, 'Plast'], [0x6a6e72, 'Metall']];
  binC.forEach(([c, label], k) => {
    av.use('plastic').box(c, -0.75 + (k % 2) * 1.5, CURB + 0.08, -1.1 + Math.floor(k / 2) * 1.6, 1.3, 1.15, 1.25);
    av.use('plastic').boxC(jitter(c, 0.1), -0.75 + (k % 2) * 1.5, CURB + 1.27, -1.1 + Math.floor(k / 2) * 1.6, 1.36, 0.06, 1.32, 0, 0.08);
    if (k < 2) av.sign(textFace(label, 0.7, 0.22, { bg: '#f4f2ea', fg: '#1e2a24', ppm: 300, weight: '700', scale: 0.72 }), -0.75 + k * 1.5, CURB + 0.85, -1.1 - 0.64, 0.7, 0.22, Math.PI);
  });
  av.use('wood').box(0x5a4c3e, 0, CURB, 2.25, 3.2, 1.6, 0.06).box(0x5a4c3e, -1.58, CURB, 0.5, 0.06, 1.6, 3.6);
  av.solid(0, 0.2, 3.2, 4.2, CURB + 1.4, 'bins');
  av.sign(textFace('ÅTERVINNING', 1.6, 0.32, { bg: '#2f5a3a', fg: '#f2f0e8', ppm: 220 }), 0, CURB + 1.95, -2.32, 1.6, 0.32, Math.PI);
  av.use('metal').box(0x9a9da0, -0.75, CURB, -2.3, 0.05, 1.8, 0.05).box(0x9a9da0, 0.75, CURB, -2.3, 0.05, 1.8, 0.05);
  // Fence between the south bays/soprum and the gardens behind.
  for (let x = -30.2 + 1.25; x < -4.5; x += 2.5) bf.prop('woodfence', x, -13.85, 0);
  // Lamp posts in the lot.
  // (on the bay lines, between two cars' noses)
  for (const x of [-29.7 + 4 * bw, 0, -29.7 + 18 * bw]) bf.lamp(x, -30.6, 0, 6.0);
  // A grit box (sandlåda) by the lot entrance, a kicksled parked by the mailboxes.
  sandBox(bf.sub(-30.35, -29.2, Math.PI / 2));
  bf.prop('kicksled', 2.7, -27.6, 0.3);

  // ----- Rows
  const walls = o.walls ?? [pickR(WALLS, r), pickR(WALLS, r), pickR(WALLS, r), pickR(WALLS, r)];
  const st = o.storeys ?? [2, 2, 2, 2];
  const roofs = o.roofs ?? ['tile', 'tile', 'tile', 'tile'];
  const defs = {
    N1a: { ox: -3.2, oz: -1.8, yaw: Math.PI, i: 0, num0: 12 },
    N1b: { ox: 30.2, oz: -1.8, yaw: Math.PI, i: 1, num0: 2 },
    S1a: { ox: -30.2, oz: 9.4, yaw: 0, i: 2, num0: 21 },
    S1b: { ox: 3.2, oz: 9.4, yaw: 0, i: 3, num0: 31 },
  };
  for (const [key, d] of Object.entries(defs)) {
    const rf = bf.sub(d.ox, d.oz, d.yaw);
    out.rows[key] = radhusRow(rf, 5, {
      r, wall: walls[d.i], storeys: st[d.i], roof: roofs[d.i], FG: 2.6, BG: key[0] === 'N' ? 3.3 : 4.8,
      front: (o.fronts ?? [pickR(['green', 'bare', 'fence'], r), pickR(['bare', 'fence', 'green'], r), pickR(['green', 'fence', 'bare'], r), pickR(['fence', 'green', 'bare'], r)])[d.i],
      frontFn: o.frontFn ? (k) => o.frontFn(key, k) : null, pre: o.pre ? (k) => o.pre(key, k) : null, num0: d.num0, advent: o.advent, lite: o.lite,
      backFence: key[0] === 'S' ? pickR(['wood', 'wood', 'picket', 'hedge'], r) : false, unit: o.unit ? (k, info) => o.unit(key, k, info) : null,
    });
    out.rows[key].frame = rf;
  }
  // Main walkway (local x, z 0.8..6.8) and cross walkway (x -3..3), asphalt; small torg.
  bf.useF('asphalt').flat(C.walk, 0, 3.8, 66.2, 6.0, CURB + 0.03);
  bf.useF('asphalt').flat(C.walk, 0, 5.75, 6.0, 50.5, CURB + 0.031);
  bf.useF('paving').flat(C.paving, 0, 3.8, 9.0, 9.0, CURB + 0.036);
  keepClear.push({ ...xz(bf, -32.5, 3.8), r: 4 }, { ...xz(bf, 32.5, 3.8), r: 4 }, { ...xz(bf, 0, 32.5), r: 4 });
  bf.useF('asphalt').flat(C.walk, -32.8, 3.8, 3.6, 6.0, CURB + 0.033);
  bf.useF('asphalt').flat(C.walk, 32.8, 3.8, 3.6, 6.0, CURB + 0.033);
  bf.useF('asphalt').flat(C.walk, 0, 32.8, 6.0, 3.6, CURB + 0.033);
  // Plowed snow: a continuous low ridge along both edges of the main walkway, pressed against the
  // garden hedges / fences, broken only at the garden paths, the torg and the walkway ends.
  const gaps = [];
  for (const key of ['N1a', 'N1b', 'S1a', 'S1b']) for (const u of out.rows[key].units) {
    const [x, z] = u.doorL; const w = u.f.W(x, z); const [lx, lz] = bf2local(bf, w);
    gaps.push([lx, lz, u.clearPath ? 1.3 : 0.75]);
  }
  for (const [zEdge, side] of [[1.0, 'N'], [6.6, 'S']]) {
    const stops = gaps.filter((g) => (side === 'N' ? g[1] < 3.8 : g[1] > 3.8)).map(([g, , hw]) => [g - hw, g + hw]);
    stops.push([-5.2, 5.2], [30.4, 99], [-99, -30.4]);
    stops.sort((a, b) => a[0] - b[0]);
    let x0 = -30.4;
    for (const [a, b] of stops) {
      if (a - x0 > 0.9) bankL(bf, x0, zEdge + (side === 'N' ? -0.05 : 0.05), a, zEdge, 0.62, 0.2 + r() * 0.06, r, { skirt: 0.22, dirty: side === 'N' ? 1 : -1 });
      x0 = Math.max(x0, b);
    }
  }
  // The cross walkway (räddningsväg) is plowed too: ridges along its edges between the rows.
  for (const sx of [-1, 1]) for (const [z0, z1] of [[-12.6, -2.6], [8.6, 23.0]]) bankL(bf, sx * 2.75, z0, sx * 2.75, z1, 0.6, 0.22 + r() * 0.05, r, { skirt: 0.22, dirty: sx });
  // Where the snowy lawns meet the walkways and the garden paths: a ragged rim of trodden snow, so
  // no boundary is a ruled line.
  for (const [zE, sd, side] of [[0.8, 1, 'N'], [6.8, -1, 'S']]) {
    const stops = gaps.filter((g) => (side === 'N' ? g[1] < 3.8 : g[1] > 3.8)).map(([g]) => [g - 0.6, g + 0.6]);
    stops.push([-4.6, 4.6]);
    stops.sort((a, b) => a[0] - b[0]);
    let x0 = -30.4;
    for (const [a, b] of [...stops, [30.4, 99]]) { if (a - x0 > 0.4) bf.fringe(x0, zE, a, zE, sd, CURB + 0.03, Math.floor(r() * 999)); x0 = Math.max(x0, b); }
  }
  for (const sx of [-1, 1]) for (const [z0, z1] of [[-13.4, -0.4], [8.0, 23.4]]) bf.fringe(sx * 3, z0, sx * 3, z1, sx, CURB + 0.031, Math.floor(r() * 999));
  // Lamps along the walkways (in the hedge line between gardens) and at the torg.
  for (const x of [-19.4, -8.6, 8.6, 19.4]) { bf.plamp(x, 0.6); bf.plamp(x + (x < 0 ? 5.4 : -5.4), 7.0); }
  bf.plamp(-3.6, -12.5); bf.plamp(3.6, 18); bf.plamp(-3.6, 27.5);
  // Bollards at the walkway ends (fold-down: the middle one is down).
  for (const [x, z, ax] of [[-31.2, 3.8, 'z'], [31.2, 3.8, 'z'], [0, 31.2, 'x'], [0, -13.2, 'x']]) {
    for (const s of [-2.6, 2.6]) {
      const bx = ax === 'z' ? x : x + s, bz = ax === 'z' ? z + s : z;
      bf.use('painted').cyl(0x2a2c2e, bx, CURB + 0.45, bz, 0.08, 0.9, 10);
      bf.use('painted').cyl(0xd8d4c8, bx, CURB + 0.8, bz, 0.085, 0.08, 10);
      bf.circ(bx, bz, 0.1, CURB + 0.9, 'bollard');
    }
    // The fold-down one lying flat in the middle.
    bf.use('painted').boxC(0x2a2c2e, x, CURB + 0.09, z, ax === 'z' ? 0.16 : 0.9, 0.16, ax === 'z' ? 0.9 : 0.16);
  }

  // ----- South band: footpath, bike shed, playground, green, mailboxes, hedge to the street.
  bf.useF('gravel').flat(C.gravel, 0, 24.5, 62, 2.2, CURB + 0.03);
  bf.useF('gravel').flat(C.gravel, -32.8, 24.5, 3.6, 2.2, CURB + 0.032);
  bf.useF('gravel').flat(C.gravel, 32.8, 24.5, 3.6, 2.2, CURB + 0.032);
  keepClear.push({ ...xz(bf, -32.5, 24.5), r: 2.5 }, { ...xz(bf, 32.5, 24.5), r: 2.5 });
  const bs = bf.sub(-24.5, 28.5, 0);
  bs.use('wood').box(o.walls?.[2] ?? C.falu, 0, CURB, 1.65, 8.4, 2.3, 0.15);
  bs.box(o.walls?.[2] ?? C.falu, -4.15, CURB, 0, 0.12, 2.3, 3.4).box(o.walls?.[2] ?? C.falu, 4.15, CURB, 0, 0.12, 2.3, 3.4);
  bs.roof(C.metalBlack, 0, CURB + 2.4, 0.1, 8.9, 4.0, 0.1, 0, { fascia: C.trim, fh: 0.22 });
  bs.use('painted', { snow: 0 }).box(0x8e8c88, 0, CURB, 0.2, 8.2, 0.03, 3.0);
  bs.use('metal', { snow: 0 });
  for (let k = 0; k < 9; k++) bs.box(0x8e9296, -3.6 + k * 0.9, CURB, 1.0, 0.04, 0.4, 0.9);
  bs.solid(0, 1.65, 8.4, 0.3, 99, 'shed').kind = 'shed';
  bs.solid(-4.15, 0, 0.2, 3.4, 99, 'shed'); bs.solid(4.15, 0, 0.2, 3.4, 99, 'shed');
  bs.sign(textFace('Cykelförråd', 1.3, 0.26, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 240 }), 0, CURB + 2.0, -1.76, 1.3, 0.26, Math.PI);
  for (const x of [-2.7, -0.9, 1.8, 3.6]) if (r() < 0.8) bs.prop('bike', x, 0.6, 0);
  out.bikeShed = { lx: -24.5, lz: 25.6 };
  // Playground.
  playground(bf.sub(14, 28.2, 0), r);
  out.playground = { lx: 14, lz: 28.2 };
  // Green with birches and a bench.
  for (const [x, z, s] of [[-18.0, 28.0, 1.0], [-15.0, 29.6, 0.9], [-10.5, 29.6, 1.1], [24.5, 27.0, 1.05], [28.5, 29.2, 0.9]]) bf.tree(x, z, s, 'birch', r);
  for (const [x, z, s] of [[7.0, 29.3, 0.8], [22.2, 29.6, 0.7], [-1.5, -31.6 + 0.0, 0]]) if (s) bf.tree(x, z, s, 'spruce', r);
  bf.prop('bench', -12.5, 26.0, Math.PI);
  bf.prop('papperskorg', -10.9, 26.0, 0);
  // Mailbox stands at the lot and the south entrance.
  bf.prop('mailrow', 4.8, 27.6, -Math.PI / 2);
  // Hedge along the south edge (gaps for the walkway, the footpath ends).
  for (const [x0, x1] of [[-30.6, -3.4], [3.4, 30.6]]) bf.hedge((x0 + x1) / 2, 30.55, x1 - x0, 0.6, 1.1, 0, C.hedge);
  // Hedges along the west/east block edges beside the gardens (the walkway and footpath pass).
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[-13.4, 0.6], [7.0, 23.2], [25.8, 30.2]]) bf.hedge(s * 30.6, (z0 + z1) / 2, 0.6, z1 - z0, 1.1, 0, C.hedge);
  }
  // The interior is car-free (everything but the lot): the zone, and at every entrance "no motor
  // vehicles" (C2) + gångfartsområde (E9) signs, with "Räddningsväg" plates on the cross walkway.
  const rect = (x0, z0, x1, z1) => { const ax = bf.wx(x0, z0), az = bf.wz(x0, z0), bx = bf.wx(x1, z1), bz = bf.wz(x1, z1); carFreeZones.push({ x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) }); };
  rect(-31, -13.5, 31, 31);
  rect(-3.6, -19.5, 3.5, -13.5);
  const entrance = (x, z, yaw, rescue) => {
    const faces = [{ f: picto('motorfordon'), w: 0.64, h: 0.64 }, { f: picto('gangfart'), w: 0.5, h: 0.7 }];
    if (rescue) faces.push({ f: textFace('Räddningsväg\nParkering förbjuden', 0.6, 0.3, { bg: '#f4f2ea', fg: '#b01e1e', border: '#b01e1e', ppm: 280, scale: 0.7, weight: '700' }), w: 0.6, h: 0.3 });
    bf.post(x, z, yaw, faces, { top: 2.7 });
  };
  entrance(-31.1, 0.3, -Math.PI / 2);
  entrance(31.1, 7.3, Math.PI / 2);
  entrance(-3.5, 31.1, 0, true);
  entrance(3.6, -13.3, Math.PI, true);
  // Litter: lot and walkways.
  const nl = o.litter ?? 3;
  for (let k = 0; k < nl; k++) { const [x, z] = k % 3 === 0 ? [R(-28, 28, r), R(-25.5, -20, r)] : k % 3 === 1 ? [R(-28, 28, r), R(2, 5.6, r)] : [R(-20, 20, r), 24.5]; const [wx, wz] = xz2(bf, x, z); litterSpots.push([wx, CURB + 0.05, wz]); }
  return out;
}

function bankL(bf, x0, z0, x1, z1, w, h, r, o) { snowBank(bf.S, bf.wx(x0, z0), bf.wz(x0, z0), bf.wx(x1, z1), bf.wz(x1, z1), w, h, Math.floor(r() * 1000), undefined, o); }
function xz(f, lx, lz) { return { x: f.wx(lx, lz), z: f.wz(lx, lz) }; }
function xz2(f, lx, lz) { return [f.wx(lx, lz), f.wz(lx, lz)]; }
function bf2local(f, [x, z]) { const dx = x - f.ox, dz = z - f.oz; return [dx * f.c - dz * f.s, dx * f.s + dz * f.c]; }

// Snowy playground: sandbox, swings, a climbing frame, a spring rider.
function playground(f, r) {
  f.useF('gravel').flat(0x8a7a66, 0, 0, 13, 4.6, CURB + 0.033);
  // Sandbox (wood frame, snow in it).
  f.use('wood').box(0x7a6048, -4.5, CURB, 0, 2.6, 0.3, 0.12).box(0x7a6048, -4.5, CURB, 1.2, 2.6, 0.3, 0.12);
  f.box(0x7a6048, -5.75, CURB, 0.6, 0.12, 0.3, 1.3).box(0x7a6048, -3.25, CURB, 0.6, 0.12, 0.3, 1.3);
  f.use('snow').box(null, -4.5, CURB, 0.6, 2.4, 0.22, 1.1);
  f.solid(-4.5, 0.6, 2.6, 1.3, CURB + 0.3, 'sandbox');
  // Swings: A-frames and a beam, two seats.
  f.use('painted');
  for (const s of [-1.5, 1.5]) { f.boxC(0x2a5a3a, 0.5 + s, CURB + 1.1, -0.55, 0.09, 2.3, 0.09, 0, 0.45); f.boxC(0x2a5a3a, 0.5 + s, CURB + 1.1, 0.55, 0.09, 2.3, 0.09, 0, -0.45); f.circ(0.5 + s, -0.9, 0.08); f.circ(0.5 + s, 0.9, 0.08); }
  f.boxC(0x2a5a3a, 0.5, CURB + 2.18, 0, 3.3, 0.1, 0.1);
  for (const s of [-0.6, 0.6]) { f.use('metal').boxC(0x9a9da0, 0.5 + s - 0.18, CURB + 1.4, 0, 0.02, 1.5, 0.02).boxC(0x9a9da0, 0.5 + s + 0.18, CURB + 1.4, 0, 0.02, 1.5, 0.02); f.use('rubber').boxC(0x1e1e1e, 0.5 + s, CURB + 0.62, 0, 0.45, 0.05, 0.2); }
  // Climbing frame (a little tower with a slide).
  f.use('wood').box(0x8a6a4a, 4.6, CURB + 1.1, 0.3, 1.6, 0.08, 1.6);
  for (const [sx, sz] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 1.05], [0.75, 1.05]]) { f.box(0x6a5038, 4.6 + sx, CURB, 0.3 + sz, 0.1, 2.3, 0.1); }
  f.use('tile').add(PRIM.prism(), 0x5a2e24, 4.6, CURB + 2.3, 0.3, Math.PI / 2, 1.8, 0.7, 1.8);
  f.use('plastic').boxC(0x2a5a8a, 4.6, CURB + 0.6, -1.3, 0.6, 0.05, 2.2, 0, 0.5);
  f.solid(4.6, 0.3, 1.6, 1.6, CURB + 1.15, 'platform');
  // Spring rider.
  f.use('metal').cyl(0x6a6e72, -1.8, CURB + 0.2, 1.4, 0.06, 0.4, 8);
  f.use('plastic').box(0xb8402a, -1.8, CURB + 0.4, 1.4, 0.3, 0.35, 0.7);
  f.circ(-1.8, 1.4, 0.35, CURB + 0.75);
}
