// Building helpers and the residential block types: villas (villa), lamellhus (apartments) and
// the generic row-house areas (radhus).

import { THREE, PRIM, mat } from '../gfx.js';
import { CURB } from './layout.js';
import { C, WALLS, DOORS, rnd, R, pickR, TAU, parkingLot, win, winLite, door, canopy, lampBox, hedge, quads, snowBank, snowPile, shrub, limb, snowGuard, roofLadder, ventStack, downpipe, hash, glow } from './kit.js';
export { winLite };
import { radhusArea } from './rowhouse.js';
import { textFace, picto, decal } from './signs.js';
import { violationSpots, keepClear, litterSpots, roadNames } from './data.js';

export const jit = (c, a, r = rnd) => {
  const f = 1 + (r() - 0.5) * 2 * a;
  return (Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f);
};

// Pyramid (hip roof / spire) with an axis-aligned square base of 1 x 1, height 1, base at y = 0.
let _hip = null;
export function hipGeo() {
  if (_hip) return _hip;
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  return (_hip = g);
}

// A gabled house in frame f: footprint local x in [x0, x0 + w], z in [z0, z0 + d], ridge along x,
// front facade at z0 (normal -z). o: wallH, pitch, wall, trim, surface ('wood' | 'plaster' |
// 'brick'), roof ('tile' | 'metalroof'), roofC, plinth, brickBand, chimney, ov (eave overhang).
export function gableHouse(f, x0, z0, w, d, o = {}) {
  const PL = o.plinth ?? 0.4, Y0 = CURB + PL, Hw = o.wallH ?? 3, Ye = Y0 + Hw, p = o.pitch ?? 0.6;
  const wall = o.wall ?? C.falu, trim = o.trim ?? C.trim, rs = o.roof ?? 'tile', rc = o.roofC ?? C.roofBlack;
  const ov = o.ov ?? 0.5, gov = o.gov ?? 0.4, th = rs === 'metalroof' ? 0.06 : 0.17;
  const cx = x0 + w / 2, cz = z0 + d / 2;
  f.use('concrete').box(o.plinthC ?? C.plinth, cx, CURB - 0.05, cz, w + 0.06, PL + 0.05, d + 0.06);
  f.use(o.surface ?? 'wood').box(wall, cx, Y0 - 0.02, cz, w, Hw + 0.02, d);
  if (o.brickBand) f.use('brick').box(o.brickC ?? 0x8a4a3a, cx, Y0 - 0.02, cz, w + 0.04, o.brickBand, d + 0.04);
  const rise = (d / 2) * Math.tan(p);
  f.use(o.gableSurface ?? o.surface ?? 'wood').add(PRIM.prism(), wall, cx, Ye, cz, 0, w, rise, d);
  const half = d / 2 + ov, L = half / Math.cos(p), drop = ov * Math.tan(p);
  const yc = Ye + (rise - drop) / 2 + th / 2 / Math.cos(p);
  f.use(rs).boxC(rc, cx, yc, z0 + d / 4 - ov / 2, w + 2 * gov, th, L, 0, -p);
  f.use(rs).boxC(rc, cx, yc, z0 + (3 * d) / 4 + ov / 2, w + 2 * gov, th, L, 0, p);
  // Ridge: tiles for a tile roof, a painted ridge flashing for sheet metal (no ribs on its ends).
  if (rs === 'metalroof') f.use('painted').boxC(o.fasciaC ?? 0x2e3134, cx, Ye + rise + th * 0.9, cz, w + 2 * gov + 0.02, 0.08, 0.3);
  // (a tile ridge in the tile texture showed its rows as a barcode of bands: the ridge tiles are one
  // smooth row in the roof colour)
  else f.use('painted').boxC(rc, cx, Ye + rise + th * 0.9, cz, w + 2 * gov, 0.1, 0.34);
  f.use('painted');
  for (const [z, s] of [[z0 + d / 4 - ov / 2, -1], [z0 + (3 * d) / 4 + ov / 2, 1]]) for (const x of [x0 - gov - 0.02, x0 + w + gov + 0.02]) f.boxC(trim, x, yc - 0.03, z, 0.05, 0.26, L + 0.02, 0, s * p);
  // Eave fascias: tall enough to cover the slab's cut edge (no tile / rib 'barcode' showing).
  f.boxC(trim, cx, Ye - drop + th * 0.45, z0 - ov - 0.01, w + 2 * gov, 0.2 + th * 0.9, 0.04);
  f.boxC(trim, cx, Ye - drop + th * 0.45, z0 + d + ov + 0.01, w + 2 * gov, 0.2 + th * 0.9, 0.04);
  f.use('metal');
  f.cyl(0x3a3d40, cx, Ye - drop - 0.1, z0 - ov - 0.08, 0.07, w + 2 * gov, 8, 0, Math.PI / 2);
  f.cyl(0x3a3d40, cx, Ye - drop - 0.1, z0 + d + ov + 0.08, 0.07, w + 2 * gov, 8, 0, Math.PI / 2);
  if ((o.surface ?? 'wood') === 'wood') { f.use('painted'); for (const x of [x0 + 0.03, x0 + w - 0.03]) for (const z of [z0 + 0.03, z0 + d - 0.03]) f.box(trim, x, Y0, z, 0.15, Hw, 0.15); }
  // Swedish roof furniture (o.vern): a snow guard over the front (entrance) eave, a roof ladder up
  // to the ridge, a vent stack on the back slope, downpipes at the four corners.
  if (o.vern) {
    const slope = (dir) => ({ zr: cz + dir * (th / 2) * Math.sin(p), yr: yc + (L / 2) * Math.sin(p) + (th / 2) * Math.cos(p), dir, p, L });
    const PF = slope(-1), PB = slope(1);
    snowGuard(f, PF, x0 - gov + 0.12, x0 + w + gov - 0.12);
    roofLadder(f, PF, x0 + Math.min(1.3, w * 0.2));
    ventStack(f, PB, x0 + w * 0.68, L * 0.3, 0.6, 0.08);
    for (const xx of [x0 + 0.3, x0 + w - 0.3]) {
      downpipe(f, xx, z0, -0.08, z0 - ov - 0.08, Ye - drop - 0.1);
      downpipe(f, xx, z0 + d, 0.08, z0 + d + ov + 0.08, Ye - drop - 0.1);
    }
  }
  if (o.chimney) f.use('brick').box(o.chimneyC ?? 0x7a3a2e, cx + o.chimney * w * 0.25, Ye + rise * 0.4, cz + d * 0.12, 0.7, rise * 0.6 + 1.0, 0.7).use('metal').box(0x2a2a2a, cx + o.chimney * w * 0.25, Ye + rise + 0.98, cz + d * 0.12, 0.85, 0.06, 0.85);
  if (o.solid !== false) f.solid(cx, cz, w, d, 99, 'building');
  return { Y0, Ye, rise, cx, cz, x0, z0, w, d };
}

// Flat-roofed box building with a parapet. Front at z0 (normal -z).
export function flatBuilding(f, x0, z0, w, d, h, o = {}) {
  const cx = x0 + w / 2, cz = z0 + d / 2;
  if (o.recess) {
    // Shop fronts: the ground floor is set back by recess.depth (an open, lit shop interior behind
    // see-through glass at z0), the floor above runs over it on the full depth.
    const rd = o.recess.depth, rh = o.recess.h;
    f.use('concrete').box(C.plinth, cx, CURB - 0.05, cz + rd / 2, w + 0.06, 0.45, d - rd + 0.06);
    f.use(o.surface ?? 'plaster').box(o.wall ?? 0xd8d2c4, cx, CURB + 0.38, cz + rd / 2, w, rh - 0.38, d - rd);
    f.use(o.surface ?? 'plaster').box(o.wall ?? 0xd8d2c4, cx, CURB + rh, cz, w, h - rh, d);
    f.use('concrete', { snow: 0 }).box(0xc8c4bc, cx, CURB, z0 + rd / 2, w, 0.02, rd);
    for (const x of [x0 + 0.1, x0 + w - 0.1]) f.use(o.surface ?? 'plaster').box(o.wall ?? 0xd8d2c4, x, CURB, z0 + rd / 2, 0.2, rh, rd);
  } else {
    f.use('concrete').box(C.plinth, cx, CURB - 0.05, cz, w + 0.06, 0.45, d + 0.06);
    f.use(o.surface ?? 'plaster').box(o.wall ?? 0xd8d2c4, cx, CURB + 0.38, cz, w, h - 0.38, d);
  }
  // Flat roof: a sheet-metal coping round the parapet (dark, or the brand colour) and inside it the
  // roofing membrane under an even field of snow, with a few hatches, vents and a fan unit.
  const cc = o.capC ?? 0x5a5e62, cw = 0.3, ch = 0.16, top = CURB + h;
  f.use('painted', { snow: 0.5 });
  for (const sd of [-1, 1]) {
    f.box(cc, cx, top, cz + sd * (d / 2 - cw / 2 + 0.06), w + 0.12, ch, cw);
    f.box(cc, cx + sd * (w / 2 - cw / 2 + 0.06), top, cz, cw, ch, d + 0.12 - 2 * cw);
  }
  f.use('snow').box(0xeceef0, cx, top - 0.1, cz, w - 2 * cw + 0.12, 0.18, d - 2 * cw + 0.12);
  {
    const hs = (k) => hash(Math.round(cx * 7 + cz * 13 + f.ox * 3 + f.oz * 5) + k * 17, 41);
    const n = Math.max(1, Math.min(4, Math.round((w * d) / 140)));
    for (let k = 0; k < n; k++) {
      const px = cx + (hs(k) - 0.5) * (w - 3), pz = cz + (hs(k + 9) - 0.5) * (d - 3), kind = Math.floor(hs(k + 5) * 3);
      if (kind === 0) {           // roof hatch
        f.use('painted').box(0x6a6e70, px, top + 0.06, pz, 0.95, 0.42, 0.95);
        f.use('metal', { snow: 1 }).box(0x8a8e90, px, top + 0.48, pz, 1.05, 0.06, 1.05);
      } else if (kind === 1) {    // vent stacks
        for (let q = 0; q < 2; q++) f.use('metal').cyl(0x4a4e50, px + q * 0.7, top + 0.45, pz, 0.12, 0.8, 8).cyl(0x4a4e50, px + q * 0.7, top + 0.88, pz, 0.2, 0.05, 8);
      } else {                    // fan / heat-pump unit on rails
        f.use('metal', { snow: 1 }).box(0x9a9ea0, px, top + 0.2, pz, 1.8, 0.9, 1.1);
        f.use('metal').box(0x3a3e40, px, top + 0.06, pz - 0.45, 2.0, 0.14, 0.12).box(0x3a3e40, px, top + 0.06, pz + 0.45, 2.0, 0.14, 0.12);
      }
    }
  }
  if (o.solid !== false) f.solid(cx, cz, w, d, 99, 'building');
  return { cx, cz, top: CURB + h };
}

// ---------------------------------------------------------------------------------------------
// Villa block: three lots facing each of two opposite streets.

export const CARS = ['volvo740', 'golf', 'kombi', 'volvo240', 'skoda', 'bmw', 'audi', 'volvo740', 'golf', 'kombi'];
export const CAR_COLS = [0x8a8e92, 0x2a3a4a, 0x6a2a22, 0xd8d6d0, 0x3a4a3a, 0x1e1e20, 0x7a7466, 0x4a5a6a, 0xa8a49a, 0x1c2a44, 0x5a3a2a];

export function villaBlock(bf, r, o = {}) {
  const ew = o.ew ?? false;
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const LW = 62 / 3, LD = 31;
  const lots = [];
  for (let side = 0; side < 2; side++) for (let k = 0; k < 3; k++) {
    const along = -31 + (k + 0.5) * LW;
    let f;
    if (!ew) f = side === 0 ? bf.sub(along, -31, 0) : bf.sub(-along, 31, Math.PI);
    else f = side === 0 ? bf.sub(-31, -along, Math.PI / 2) : bf.sub(31, along, -Math.PI / 2);
    lots.push(villaLot(f, LW, LD, r, { lawnSpot: o.lawnSpot && side === 0 && k === 1 }));
  }
  // Back fences down the middle and between back yards (plank fence segments).
  const run = (x0, x1, z, alongX) => { for (let t = x0 + 1.25; t <= x1 - 1.2; t += 2.5) alongX ? bf.prop('woodfence', t, z, 0) : bf.prop('woodfence', z, t, Math.PI / 2); };
  if (!ew) { run(-30.5, 30.5, 0, true); for (const x of [-31 + LW, -31 + 2 * LW]) { run(-31 + 18.5, -0.5, x, false); run(0.5, 31 - 18.5, x, false); } }
  else { run(-30.5, 30.5, 0, false); for (const z of [-31 + LW, -31 + 2 * LW]) { run(-31 + 18.5, -0.5, z, true); run(0.5, 31 - 18.5, z, true); } }
  return lots;
}

// One villa lot. Frame: street edge at local z = 0, lot runs back to +z, x in [-LW/2, LW/2].
function villaLot(f, LW, LD, r, o = {}) {
  const type = pickR(['kataloghus', 'kataloghus', 'enplan', 'enplan', 'sekel'], r);
  const gs = r() < 0.5 ? -1 : 1;                    // garage / carport side
  const front = R(6.8, 8.6, r);
  const wall = pickR([C.falu, C.ochre, C.offwhite, C.greygreen, C.brown, C.lightgrey, C.paleyellow, C.bluegrey, C.falu, C.offwhite], r);
  const trim = wall === C.offwhite ? pickR([C.trim, 0x3a4a3a, 0x2a3440], r) : C.trim;
  const doorC = pickR(DOORS, r);
  let hx, hw, hd, h, carX, carZ, driveTo;
  if (type === 'enplan') {
    hw = R(12.5, 14, r); hd = R(8.8, 9.6, r);
    const cw = 3.6;
    hx = -gs * cw / 2 + (r() - 0.5) * 0.8;
    h = gableHouse(f, hx - hw / 2, front, hw, hd, { wallH: 2.7, pitch: R(0.3, 0.4, r), wall, trim, roof: r() < 0.6 ? 'tile' : 'metalroof', roofC: pickR([C.roofBlack, C.roofGrey, C.roofRed], r), brickBand: r() < 0.6 ? 0.95 : 0, brickC: pickR([0x8a4a3a, 0xb89a6a, 0x7a3a2e], r), chimney: gs, plinth: 0.3, vern: true });
    // Carport under the extended roof at the garage side.
    const cx = hx + gs * (hw / 2 + cw / 2);
    f.use('painted');
    for (const z of [front + 0.3, front + hd - 0.3]) f.box(trim, cx + gs * (cw / 2 - 0.15), CURB, z, 0.14, 2.45, 0.14);
    f.circ(cx + gs * (cw / 2 - 0.15), front + 0.3, 0.12); f.circ(cx + gs * (cw / 2 - 0.15), front + hd - 0.3, 0.12);
    f.roof(C.metalBlack, cx, CURB + 2.55, front + hd / 2, hd + 0.8, cw + 0.4, -gs * 0.05, Math.PI / 2, { fascia: trim, fh: 0.22 });
    f.use('asphalt', { snow: 0 }).box(C.asphalt, cx, CURB, front + hd / 2, cw - 0.1, 0.02, hd);
    carX = cx; carZ = front + hd / 2 - 0.4; driveTo = front;
  } else {
    const sek = type === 'sekel';
    hw = sek ? R(9, 10, r) : R(10, 11.5, r); hd = sek ? R(8.2, 9, r) : R(7.8, 8.6, r);
    hx = -gs * 2.4 + (r() - 0.5) * 1.0;
    h = gableHouse(f, hx - hw / 2, front, hw, hd, { wallH: sek ? 5.5 : 3.0, pitch: sek ? 0.62 : R(0.66, 0.75, r), wall, trim, roof: sek && r() < 0.5 ? 'metalroof' : 'tile', roofC: pickR([C.roofBlack, C.roofRed, C.roofGrey], r), chimney: -gs, vern: true });
    // Detached garage, gable to the street.
    const gx = hx + gs * (hw / 2 + 3.4), gz = front + 1.0;
    const gf = f.sub(gx, gz + 3.25, Math.PI / 2);
    gableHouse(gf, -3.25, -2.0, 6.5, 4.0, { wallH: 2.45, pitch: 0.55, wall, trim, roof: 'tile', roofC: h.rc ?? C.roofBlack, plinth: 0.1, gov: 0.25, ov: 0.3, solid: false });
    f.solid(gx, gz + 3.25, 4.0, 6.5, 99, 'garage');
    f.use('painted').box(trim, gx, CURB, gz - 0.02, 2.8, 2.15, 0.05);
    for (let q = 1; q < 6; q++) f.box(jit(trim, 0.08, r), gx, CURB + q * 0.36, gz - 0.05, 2.7, 0.03, 0.02);
    carX = gx; carZ = gz - 3.0; driveTo = gz;
    if (sek) {
      // Glazed veranda at the front, on the garage side of the door.
      const vx = hx + gs * 1.9;
      f.use('painted').box(trim, vx, CURB + 0.4, front - 1.3, 3.4, 0.5, 2.6);
      f.use('glass');
      for (const a of [-1.1, 0, 1.1]) f.box(null, vx + a, CURB + 0.95, front - 2.58, 1.0, 1.6, 0.04);
      f.use('painted').box(trim, vx, CURB + 2.6, front - 1.3, 3.5, 0.15, 2.7);
      f.roof(C.metalBlack, vx, CURB + 2.85, front - 1.3, 3.7, 2.9, -0.18, 0, { fascia: trim, fh: 0.15 });
      f.solid(vx, front - 1.3, 3.4, 2.6, 99, 'building');
    }
  }
  // Windows and door on the front; side and back windows.
  const Y0 = h.Y0, two = type === 'sekel';
  const dx = type === 'enplan' ? hx + gs * (hw / 2 - 2.4) : type === 'sekel' ? hx - gs * 1.6 : hx + gs * 1.2;
  door(f, dx, Y0, front, 1.0, 2.1, Math.PI, doorC, { trim });
  f.use('concrete').box(0x9a9894, dx, CURB, front - 0.55, 1.6, Y0 - CURB - 0.02, 1.1);
  f.solid(dx, front - 0.55, 1.6, 1.1, Y0 - 0.02, 'step');
  if (type !== 'sekel') canopy(f, dx, Y0 + 2.3, front, 1.9, 1.2, Math.PI, C.metalBlack, trim);
  lampBox(f, dx + 0.85, Y0 + 1.7, front, Math.PI);
  const nWin = Math.max(2, Math.floor(hw / 3.0));
  for (let s = 0; s < (two ? 2 : 1); s++) for (let k = 0; k < nWin; k++) {
    const wx = hx - hw / 2 + (k + 0.5) * (hw / nWin);
    if (s === 0 && Math.abs(wx - dx) < 1.5) continue;
    if (s === 0) win(f, wx, Y0 + 0.9, front, 1.3, 1.3, Math.PI, { trim });
    else winLite(f, wx, Y0 + 0.9 + s * 2.8, front, 1.3, 1.3, Math.PI, trim);
    if (s === 0 && r() < 0.2) f.use('light', { snow: 0 }).box(glow(0xffd090, 1.4), wx, Y0 + 0.95, front - 0.03, 0.5, 0.06, 0.02);
    winLite(f, wx, Y0 + 0.9 + s * 2.8, front + hd, 1.3, 1.3, 0, trim);
  }
  for (const side of [-1, 1]) winLite(f, hx + side * hw / 2, Y0 + 0.95, front + hd / 2, 1.2, 1.2, side * Math.PI / 2, trim);
  if (type === 'kataloghus') {
    // Dormer on the front slope.
    const Ye = h.Ye, dzh = 1.6, dx2 = hx;
    f.use('wood').box(wall, dx2, Ye - 0.2, front + 0.35 + 0.9, 2.6, dzh + 0.2, 1.8);
    f.use('tile').boxC(C.roofBlack, dx2, Ye + dzh + 0.06, front + 1.2, 2.95, 0.1, 2.2, 0, -0.12);
    win(f, dx2, Ye + 0.3, front + 0.35, 1.5, 0.95, Math.PI, { trim });
  } else if (type === 'sekel') {
    win(f, hx, h.Ye + 0.5, front + hd / 2, 0.8, 0.8, -Math.PI / 2, { trim });
  }
  // Drive, path, hedge, mailbox, bins.
  const driveMat = r() < 0.6 ? 'asphalt' : 'gravel';
  f.useF(driveMat).flat(driveMat === 'asphalt' ? 0x6a6866 : C.gravel, carX, (driveTo - 3.6) / 2, 3.3, driveTo + 3.6, CURB + 0.034);
  keepClear.push({ x: f.wx(carX, -2), z: f.wz(carX, -2), r: 3.0 });
  f.useF('paving').flat(C.paving, dx, (front - 1.1) / 2, 1.1, front - 1.1, CURB + 0.03);
  const hedgeKind = r();
  const gaps = [[carX - 3.0, carX + 3.0], [dx - 0.8, dx + 0.8]].sort((a, b) => a[0] - b[0]);
  let x0 = -LW / 2 + 0.3;
  for (const [a, b] of [...gaps, [LW / 2 - 0.3, 99]]) {
    if (a - x0 > 0.6) {
      if (hedgeKind < 0.55) f.hedge((x0 + a) / 2, 0.5, a - x0, 0.7, R(0.9, 1.3, r), 0, jit(C.hedge, 0.1, r), true, { bronze: hedgeKind < 0.2 ? 0.8 : 0.35 });
      else if (hedgeKind < 0.8) picketLine(f, x0, a, 0.4);
    }
    x0 = Math.max(x0, b);
  }
  f.prop('mailbox', carX - gs * 2.45, 0.55, Math.PI);
  f.prop('trashcan', carX + gs * 2.2, 0.9, Math.PI);
  if (r() < 0.5) f.prop('trashcan', carX + gs * 2.75, 1.7, Math.PI);
  // Trees, flagpole, snowman, tomte.
  const tx = hx - gs * (hw / 2 - 1.5) + R(-1, 1, r);
  const ls = o.lawnSpot;
  if (r() < 0.75 && !ls) f.tree(tx, R(2.8, 4.2, r), R(0.85, 1.15, r), r() < 0.25 ? 'spruce' : 'birch', r);
  if (r() < 0.45) f.tree(hx + gs * R(1, 3, r), front + hd + R(4, 8, r), R(0.9, 1.2, r), 'small', r);
  if (r() < 0.35 && !ls) { f.tree(dx - 1.1, front - 0.6, 0.55, 'thuja', r); f.tree(dx + 1.1, front - 0.6, 0.55, 'thuja', r); }
  if (r() < 0.4) flagpole(f, hx - gs * (hw / 2 + 2.2), front + hd + 2.5, r);
  if (r() < 0.16 && !ls) f.prop('snowman', hx + R(-3, 3, r), R(2.4, 4.8, r), R(0, 6, r));
  if (r() < 0.2 && !ls) f.prop('gnome', dx + 1.5, front - 1.4, Math.PI);
  if (r() < 0.12) f.prop('kicksled', dx - 1.4, front - 1.3, Math.PI);
  // Back yard: friggebod, playhouse, trampoline or greenhouse.
  const by = front + hd + 4;
  if (by < LD - 4) {
    const roll = r();
    if (roll < 0.35) friggebod(f, -gs * (LW / 2 - 3.2), LD - 3.2, r);
    else if (roll < 0.55) trampoline(f, hx + R(-2, 2, r), by + 2.5);
    else if (roll < 0.7) greenhouse(f, hx - gs * 3, LD - 3.0);
  }
  // Car on the drive (or none).
  if (r() < 0.12) f.car(pickR(CARS, r), carX, carZ, Math.PI, { color: pickR(CAR_COLS, r) });
  if (ls) {
    // A car on the front lawn, clear of the drive and the front path.
    let sx = carX - gs * 5.6;
    if (Math.abs(sx - dx) < 3.1) sx = dx - gs * 3.2;
    if (Math.abs(sx) + 2.5 < LW / 2) violationSpots.push({ x: f.wx(sx, 3.2), z: f.wz(sx, 3.2), yaw: f.yaw + Math.PI / 2, kind: 'lawn', where: 'villa' });
  }
  if (r() < 0.15) litterSpots.push([f.wx(R(-6, 6, r), -1.5), CURB + 0.05, f.wz(R(-6, 6, r), -1.5)]);
  return { f, hx, front };
}

function picketLine(f, x0, x1, z) {
  const n = Math.max(1, Math.round((x1 - x0) / 0.19));
  f.use('painted');
  for (let k = 0; k < n; k++) f.box(0xe6e2da, x0 + (k + 0.5) * ((x1 - x0) / n), CURB, z, 0.09, 0.95, 0.024);
  f.box(0xdcd6cc, (x0 + x1) / 2, CURB + 0.28, z + 0.04, x1 - x0, 0.07, 0.04);
  f.box(0xdcd6cc, (x0 + x1) / 2, CURB + 0.72, z + 0.04, x1 - x0, 0.07, 0.04);
  f.solid((x0 + x1) / 2, z, x1 - x0, 0.15, CURB + 0.95, 'fence');
}
// Flagpole with the blue-yellow pennant (vimpel).
export function flagpole(f, x, z, r, h = 8.5) {
  f.use('painted').cyl(0xf0eee8, x, CURB + h / 2, z, 0.05, h, 8);
  f.use('painted').sphere(0xc8a040, x, CURB + h + 0.06, z, 0.14);
  const a = r() * TAU;
  f.use('fabric', { snow: 0 });
  f.boxC(0x2a5aa8, x + Math.cos(a) * 1.2, CURB + h - 0.55, z + Math.sin(a) * 1.2, 2.4, 0.16, 0.01, -a, 0, 0.12);
  f.boxC(0xe8c030, x + Math.cos(a) * 1.0, CURB + h - 0.5, z + Math.sin(a) * 1.0, 2.0, 0.05, 0.012, -a, 0, 0.12);
  f.circ(x, z, 0.08);
}
function friggebod(f, x, z, r) {
  const c = pickR([C.falu, C.falu, 0x86927f, 0x4a3d32], r);
  gableHouse(f, x - 2.0, z - 1.4, 4.0, 2.8, { wallH: 2.0, pitch: 0.5, wall: c, roof: 'tile', roofC: C.roofBlack, plinth: 0.1, ov: 0.25, gov: 0.2 });
  f.use('painted').box(C.trim, x, CURB + 0.1, z - 1.42, 0.9, 1.85, 0.04);
  win(f, x + 1.2, CURB + 0.9, z - 1.4, 0.6, 0.6, Math.PI, { panes: 1 });
}
function trampoline(f, x, z) {
  f.use('metal');
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; f.cyl(0x6a6e72, x + Math.cos(a) * 1.7, CURB + 0.42, z + Math.sin(a) * 1.7, 0.04, 0.84, 6); }
  f.use('plastic').cyl(0x2a4a6a, x, CURB + 0.86, z, 1.85, 0.1, 20);
  f.use('fabric').cyl(0x1d1f22, x, CURB + 0.9, z, 1.6, 0.03, 20);
  f.use('metal');
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; f.cyl(0x2a2a2a, x + Math.cos(a) * 1.82, CURB + 1.75, z + Math.sin(a) * 1.82, 0.025, 1.8, 5); }
  f.solid(x, z, 3.4, 3.4, CURB + 0.92, 'trampoline');
}
function greenhouse(f, x, z) {
  f.use('metal').box(0xd8dadc, x, CURB, z, 2.6, 0.2, 3.2);
  f.use('glass');
  for (const s of [-1, 1]) { f.box(null, x + s * 1.28, CURB + 0.2, z, 0.04, 1.6, 3.1, 0); }
  f.box(null, x, CURB + 0.2, z - 1.58, 2.5, 1.6, 0.04).box(null, x, CURB + 0.2, z + 1.58, 2.5, 1.6, 0.04);
  f.boxC(null, x - 0.65, CURB + 2.1, z, 1.45, 0.04, 3.1, 0, 0, 0.55).boxC(null, x + 0.65, CURB + 2.1, z, 1.45, 0.04, 3.1, 0, 0, -0.55);
  f.solid(x, z, 2.6, 3.2, CURB + 2.5, 'shed');
}

// ---------------------------------------------------------------------------------------------
// Lamellhus: 3-4 storey slab. Frame f at the slab's front-left corner, length along +x, depth
// along +z, entrances on the front (local -z), balconies on the back.
export function lamellhus(f, len, dep, floors, o = {}) {
  const r = o.r || rnd;
  const brick = o.surface === 'brick';
  const wall = o.wall ?? (brick ? 0x9a5a44 : 0xd8cbb0), trim = o.trim ?? (brick ? 0xe8e4da : C.trim);
  const SH = 2.85, PL = 0.65, Y0 = CURB + PL, H = floors * SH + 0.35;
  const cx = len / 2, cz = dep / 2;
  f.use('concrete').box(0x8a8884, cx, CURB - 0.05, cz, len + 0.06, PL + 0.05, dep + 0.06);
  f.use(o.surface ?? 'plaster').box(wall, cx, Y0 - 0.02, cz, len, H, dep);
  // Low gable roof in sheet metal.
  const p = 0.32, ov = 0.45, rise = (dep / 2) * Math.tan(p), Ye = Y0 + H;
  f.use(o.surface ?? 'plaster').add(PRIM.prism(), wall, cx, Ye, cz, 0, len, rise, dep);
  const L = (dep / 2 + ov) / Math.cos(p), drop = ov * Math.tan(p), yc = Ye + (rise - drop) / 2 + 0.09;
  f.use('metalroof').boxC(o.roofC ?? C.metalBlack, cx, yc - 0.05, dep / 4 - ov / 2, len + 0.8, 0.06, L, 0, -p);
  f.use('metalroof').boxC(o.roofC ?? C.metalBlack, cx, yc - 0.05, (3 * dep) / 4 + ov / 2, len + 0.8, 0.06, L, 0, p);
  // Eave fascias, verge boards along the gable edges, a painted ridge flashing.
  f.use('painted').box(trim, cx, Ye - drop - 0.14, -ov - 0.01, len + 0.8, 0.26, 0.04).box(trim, cx, Ye - drop - 0.14, dep + ov + 0.01, len + 0.8, 0.26, 0.04);
  for (const [z, s] of [[dep / 4 - ov / 2, -1], [(3 * dep) / 4 + ov / 2, 1]]) for (const x of [-0.42, len + 0.42]) f.boxC(0x2e3134, x, yc - 0.1, z, 0.04, 0.24, L + 0.02, 0, s * p);
  f.boxC(0x2e3134, cx, Ye + rise + 0.04, cz, len + 0.84, 0.08, 0.3);
  f.solid(cx, cz, len, dep, 99, 'building');
  // Roof furniture: snow guards over both eaves (entrances, balconies), a ladder at every
  // stairwell, vent stacks along the back slope; downpipes beside the entrances and between the
  // balcony bays.
  {
    const slope = (dir) => ({ zr: cz + dir * 0.03 * Math.sin(p), yr: yc - 0.05 + (L / 2) * Math.sin(p) + 0.03 * Math.cos(p), dir, p, L });
    const PF = slope(-1), PB = slope(1);
    snowGuard(f, PF, -0.3, len + 0.3); snowGuard(f, PB, -0.3, len + 0.3);
    const bay_ = 3.6, nb_ = Math.floor(len / bay_), b0_ = (len - nb_ * bay_) / 2;
    for (let k = 2; k < nb_ - 1; k += 4) roofLadder(f, PF, b0_ + (k + 0.5) * bay_ + 0.9);
    for (let k = 1; k < nb_; k += 3) ventStack(f, PB, b0_ + (k + 0.5) * bay_, L * 0.3, 0.7, 0.1);
    for (let k = 2; k < nb_ - 1; k += 4) downpipe(f, b0_ + (k + 0.5) * bay_ - 1.65, 0, -0.08, -ov - 0.08, Ye - drop - 0.18);
    for (let k = 2; k < nb_; k += 3) downpipe(f, b0_ + k * bay_, dep, 0.08, dep + ov + 0.08, Ye - drop - 0.18);
  }
  const bay = 3.6, nb = Math.floor(len / bay), b0 = (len - nb * bay) / 2;
  const stairs = new Set();
  for (let s = 2; s < nb - 1; s += 4) stairs.add(s);
  const entrances = [];
  let letter = 0;
  for (let k = 0; k < nb; k++) {
    const x = b0 + (k + 0.5) * bay;
    if (stairs.has(k)) {
      // Stairwell: entrance door with canopy, a lit window per landing, a house number.
      f.use('painted').box(o.doorC ?? 0x3a4a5a, x, Y0 - 0.5, -0.03, 1.5, 2.45, 0.05);
      f.use('glass').box(null, x - 0.3, Y0 - 0.35, -0.06, 0.55, 2.0, 0.02).box(null, x + 0.32, Y0 - 0.35, -0.06, 0.55, 2.0, 0.02);
      f.use('concrete').box(0x9a9894, x, CURB, -1.0, 2.6, Y0 - 0.5 - CURB, 2.0);
      f.solid(x, -1.0, 2.6, 2.0, Y0 - 0.5, 'step');
      f.use('concrete').box(0xb8b6b0, x, Y0 + 2.2, -0.9, 2.8, 0.16, 1.9);
      f.use('light').box(glow(0xfff0d8, 1.0), x, Y0 + 2.18, -0.9, 0.6, 0.03, 0.3);
      for (let fl = 1; fl < floors; fl++) {
        winLite(f, x, Y0 + fl * SH - 1.0, 0, 1.0, 1.25, Math.PI, trim, false);
        f.use('light', { snow: 0 }).box(glow(0xfff2e0, 1.2), x, Y0 + fl * SH - 0.95, -0.075, 0.5, 0.06, 0.01);
      }
      const label = `${o.num ?? 12}${String.fromCharCode(65 + letter++)}`;
      f.sign(textFace(label, 0.42, 0.24, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 280, weight: '700' }), x + 1.05, Y0 + 1.95, -0.05, 0.42, 0.24, Math.PI);
      entrances.push(f.W(x, -2.5));
      // Back of the stairwell: windows only.
      for (let fl = 0; fl < floors; fl++) winLite(f, x, Y0 + fl * SH + 0.9, dep, 1.0, 1.25, 0, trim, false);
      continue;
    }
    for (let fl = 0; fl < floors; fl++) {
      const y = Y0 + fl * SH + 0.85;
      winLite(f, x - 0.75, y, 0, 1.15, 1.3, Math.PI, trim);
      winLite(f, x + 0.85, y + 0.3, 0, 0.75, 1.0, Math.PI, trim);
      if (fl === 0 && r() < 0.15) f.use('light', { snow: 0 }).box(glow(0xffcf80, 1.4), x - 0.75, y + 0.06, -0.08, 0.5, 0.05, 0.02);
      // Back: balcony with door + window (ground floor: two windows, no doors - a lamellhus has
      // its doors in the stairwells).
      winLite(f, x + 0.95, y, dep, 1.0, 1.3, 0, trim);
      if (fl === 0 && !o.groundBalc) { winLite(f, x - 0.75, y, dep, 1.15, 1.3, 0, trim); continue; }
      f.use('painted').box(trim, x - 0.65, Y0 + fl * SH + 0.02, dep + 0.02, 1.0, 2.15, 0.04);
      f.use('glass').box(null, x - 0.65, Y0 + fl * SH + 0.9, dep + 0.05, 0.75, 1.15, 0.02);
      if (fl > 0 || o.groundBalc) {
        const by = Y0 + fl * SH - 0.15;
        f.use('concrete').box(0xb0aea8, x, by, dep + 0.75, bay - 0.15, 0.16, 1.5);
        // Sheet-metal front on a steel frame, a top rail.
        f.use('painted').box(o.balcC ?? 0xdcd8cc, x, by + 0.2, dep + 1.48, bay - 0.15, 0.85, 0.04);
        f.use('metal').box(0x5a5e62, x, by + 1.05, dep + 1.48, bay - 0.1, 0.05, 0.07).box(0x5a5e62, x, by + 0.16, dep + 1.49, bay - 0.1, 0.05, 0.05);
        f.box(o.balcC ?? 0xdcd8cc, x - bay / 2 + 0.1, by + 0.16, dep + 0.75, 0.05, 1.0, 1.45).box(o.balcC ?? 0xdcd8cc, x + bay / 2 - 0.1, by + 0.16, dep + 0.75, 0.05, 1.0, 1.45);
        if (r() < 0.25) f.use('light', { snow: 0 }).box(glow(0xffd8a0, 0.8), x + r() - 0.5, by + 1.25, dep + 1.48, 0.25, 0.25, 0.04);
      }
    }
  }
  // Gable windows.
  for (const [x, ly] of [[0, -Math.PI / 2], [len, Math.PI / 2]]) for (let fl = 0; fl < floors; fl++) winLite(f, x, Y0 + fl * SH + 0.85, dep / 2, 0.9, 1.2, ly, trim, false);
  return { entrances, Y0, top: Ye + rise };
}

// Apartment block: two slabs around a gård, a parking lot on the local south side.
export function apartmentsBlock(bf, r, o = {}) {
  bf.useF('grass').flat(C.lawn, 0, 0, 62, 62, CURB + 0.015);
  const brick = r() < 0.55;
  const wall = brick ? pickR([0x9a5a44, 0xb8946a, 0x8a4a3a, 0xc0a07a], r) : pickR([0xd8cbb0, 0xc8c8b4, 0xd4c4a8, 0xb8c0b4, 0xd0b8a0], r);
  const balcC = pickR([0xdcd8cc, 0x5a6a5a, 0x8a3a2a, 0x3a4a5a, 0xe0c890], r);
  // Slab A (z -27..-16) faces the gård with its entrances (+z); slab B (z 0..11) faces it too (-z).
  const A = lamellhus(bf.sub(24, -16, Math.PI), 48, 11, 4, { r, surface: brick ? 'brick' : 'plaster', wall, balcC, num: 12 });
  const B = lamellhus(bf.sub(-24, 0, 0), 48, 11, 3, { r, surface: brick ? 'brick' : 'plaster', wall: jit(wall, 0.05, r), balcC, num: 14 });
  // Gård paths, play corner, carpet-beating rack, benches, birches.
  bf.useF('paving').flat(C.paving, 0, -8, 50, 2.4, CURB + 0.03);
  bf.useF('paving').flat(C.paving, -27.5, -8, 7, 2.4, CURB + 0.03);
  bf.useF('paving').flat(C.paving, 27.5, -8, 7, 2.4, CURB + 0.03);
  for (const e of [...A.entrances, ...B.entrances]) { const [lx, lz] = bfLocal(bf, e); bf.useF('paving').flat(C.paving, lx, (lz + -8) / 2, 2.2, Math.abs(lz + 8), CURB + 0.031); }
  // Piskställning (carpet-beating rack).
  bf.use('metal');
  for (const x of [-20, -17]) bf.box(0x6a7a6a, x, CURB, -5.2, 0.07, 1.8, 0.07);
  bf.box(0x6a7a6a, -18.5, CURB + 1.8, -5.2, 3.1, 0.06, 0.06);
  bf.circ(-20, -5.2, 0.08); bf.circ(-17, -5.2, 0.08);
  // Sandbox + swing.
  bf.use('wood').box(0x7a6048, 10, CURB, -4.4, 2.6, 0.3, 0.12).box(0x7a6048, 10, CURB, -2.0, 2.6, 0.3, 0.12).box(0x7a6048, 8.75, CURB, -3.2, 0.12, 0.3, 2.3).box(0x7a6048, 11.25, CURB, -3.2, 0.12, 0.3, 2.3);
  bf.use('snow').box(null, 10, CURB, -3.2, 2.4, 0.2, 2.2);
  bf.solid(10, -3.2, 2.6, 2.5, CURB + 0.3, 'sandbox');
  bf.prop('bench', 2, -10.2, Math.PI); bf.prop('bench', -4, -10.2, Math.PI);
  bf.prop('papperskorg', -0.8, -10.3, 0);
  for (const [x, z] of [[-18, -11], [19, -4.5], [-26, -3], [25, -12]]) bf.tree(x, z, R(0.9, 1.15, r), 'birch', r);
  for (let k = 0; k < 4; k++) bf.prop('bike', 3.2 + k * 0.8, -13.4, 0);
  // Parking lot along the south street (entrance from the local east street).
  bf.useF('asphalt').flat(C.lot, 0, 24.5, 62, 13, CURB + 0.03);
  bf.useF('asphalt').flat(C.lot, 32.8, 21, 3.7, 6, CURB + 0.033);
  keepClear.push({ x: bf.wx(33, 21), z: bf.wz(33, 21), r: 4.5 });
  const lines = [];
  for (let k = 0; k <= 20; k++) lines.push([-28 + k * 2.7, 28.6, 0.1, 4.6]);
  quads(bf.F.use('marking'), 0xd8d8d0, lines.map(([x, z, w, d]) => [bf.wx(x, z), bf.wz(x, z), w, d, bf.yaw]), CURB + 0.042);
  bf.use('concrete').box(C.granite, 0, CURB, 30.85, 62, 0.12, 0.2);
  for (let k = 0; k < 20; k++) if (r() < 0.08) bf.car(pickR(CARS, r), -28 + (k + 0.5) * 2.7, 28.4, 0, { color: pickR(CAR_COLS, r) });
  snowPile(bf.S, bf.wx(-29.5, 20), bf.wz(-29.5, 20), 2.0, 1.2);
  bf.post(31.2, 17.4, Math.PI / 2, [{ f: picto('p'), w: 0.6, h: 0.6 }, { f: textFace('Boende med\ntillstånd', 0.6, 0.3, { ppm: 260, scale: 0.72 }), w: 0.6, h: 0.3 }]);
  // (residents with a permit only: Ove has none here, game/pskiva.js)
  const lot = parkingLot(`boende:${Math.round(bf.ox)},${Math.round(bf.oz)}`, { name: `Boendeparkering, ${roadNames.at(bf.wx(33, 21), bf.wz(33, 21))}`, sign: 'Boende med tillstånd', rule: { permit: 'boende' } });
  for (let k = 0; k < 20; k++) bf.bay(-28 + (k + 0.5) * 2.7, 28.5, 0, lot.id);
  bf.lamp(-12, 18.0, 0, 6.0); bf.lamp(14, 18.0, 0, 6.0);
  // Soprum corner.
  const sp = bf.sub(26, -4.5, -Math.PI / 2);
  sp.use('wood').box(0x5a4632, 0, CURB, 0, 4.4, 2.4, 3.2);
  sp.roof(C.metalBlack, 0, CURB + 2.5, 0, 4.8, 3.6, 0.06);
  sp.use('painted').box(0x3a4a3e, 0, CURB, -1.62, 1.4, 2.0, 0.05);
  sp.solid(0, 0, 4.4, 3.2, 99, 'building');
  if (o.spots) {
    violationSpots.push({ x: bf.wx(-7.5, -4.2), z: bf.wz(-7.5, -4.2), yaw: bf.yaw + Math.PI / 2, kind: 'firelane', where: 'apartments' });
    violationSpots.push({ x: bf.wx(22, -11.8), z: bf.wz(22, -11.8), yaw: bf.yaw - Math.PI / 2 + 0.1, kind: 'lawn', where: 'apartments' });
  }
  for (let k = 0; k < 2; k++) { const x = R(-25, 25, r), z = R(19.5, 23, r); litterSpots.push([bf.wx(x, z), CURB + 0.05, bf.wz(x, z)]); }
}
function bfLocal(f, [x, z]) { const dx = x - f.ox, dz = z - f.oz; return [dx * f.c - dz * f.s, dx * f.s + dz * f.c]; }

// Generic radhus block: the shared layout with its own colours and turned to face a street.
export function radhusBlock(bf, r, yaw = 0, o = {}) {
  const f = bf.sub(0, 0, yaw);
  const walls = [pickR(WALLS, r), pickR(WALLS, r), pickR(WALLS, r), pickR(WALLS, r)];
  const st = r() < 0.5 ? [2, 2, 2, 2] : [1.5, 1.5, 2, 2];
  const area = radhusArea(f, { r, lite: true, litter: 2, walls, storeys: st, roofs: [pickR(['tile', 'metalroof'], r), 'tile', pickR(['tile', 'metalroof'], r), 'tile'], advent: 0.25 });
  // Residents' cars in the lot.
  for (const b of area.bays) if (r() < (b.row === 'north' ? 0.16 : 0.1)) f.car(pickR(CARS, r), b.lx, b.lz, b.ly, { color: pickR(CAR_COLS, r) });
  // Its lot is for the residents (a permit), the reserved bay and the handicap bay too; the four guest
  // bays are free (feature p-skiva, game/pskiva.js). The sign at the entrance says so.
  f.post(-31.2, -27.0, -Math.PI / 2, [{ f: picto('p'), w: 0.64, h: 0.64 }, { f: textFace('Boende med\ntillstånd', 0.64, 0.3, { ppm: 260, scale: 0.72 }), w: 0.64, h: 0.3 }]);
  const lot = parkingLot(`boende:${Math.round(f.ox)},${Math.round(f.oz)}`, { name: `Boendeparkering, ${roadNames.at(f.wx(-33, -22.75), f.wz(-33, -22.75))}`, sign: 'Boende med tillstånd', rule: { permit: 'boende' }, signAt: [f.wx(-31.2, -27.0), f.wz(-31.2, -27.0), f.yaw - Math.PI / 2] });
  for (const b of area.bays) f.bay(b.lx, b.lz, b.ly, lot.id, { w: b.w ?? 2.7, l: b.row === 'south' ? 5.2 : 4.9, rule: b.kind === 'guest' ? false : b.kind === 'handicap' ? { permit: 'handikapp' } : b.kind === 'reserved' ? { permit: 'reserverad' } : null });
  if (o.spots) {
    violationSpots.push({ x: f.wx(14, 3.8), z: f.wz(14, 3.8), yaw: f.yaw + Math.PI / 2, kind: 'carfree', where: 'radhus' });
    violationSpots.push({ x: f.wx(-6.8, -21.6), z: f.wz(-6.8, -21.6), yaw: f.yaw - Math.PI / 2, kind: 'garbage', where: 'radhus' });
  }
  return area;
}
