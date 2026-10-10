// Ove's radhusområde (block type 'ove'): the shared radhusområde layout plus everything that
// makes it Ove's - named units, his open garage, the Saab, signs at every entrance, the board.
//
// Local layout (block interior centre = origin, -z = north):
//   z -31..-19.5  parking lot (north bays, aisle, entrance from the west street)
//   z -19.5..-13.5 guest/handicap/reserved bays + soprum (west), garage row (east)
//   rows N1a/N1b (doors south) | main walkway z 0.8..6.8 | rows S1a/S1b (doors north)
//   cross walkway x -3..3 from the lot to the south street; south band: footpath, bike shed,
//   playground, green, hedge.

import { PRIM } from '../gfx.js';
import { CURB, carFreeZones, landmarks } from './layout.js';
import { C, rnd, R, win, door, lampBox, limb, wrapYaw, canopy, glow } from './kit.js';
import { radhusArea, garageInterior, UW, D } from './rowhouse.js';
import { picto, textFace } from './signs.js';
import { violationSpots, parkedCars, shared } from './data.js';
import { mulberry32 } from '../util.js';

export function oveBlock(bf) {
  const r = mulberry32(1955);
  const units = {};
  const area = radhusArea(bf, {
    r,
    walls: [C.ochre, C.offwhite, C.falu, C.greygreen],
    storeys: [2, 2, 1.5, 1.5],
    roofs: ['tile', 'metalroof', 'tile', 'tile'],
    fronts: ['green', 'fence', 'bare', 'fence'],
    frontFn: (row, k) => (row === 'S1a' && k === 4 ? 'square' : null),
    pre: (row, k) => (row === 'N1a' && k === 4 ? { doorC: 0x2a2c2e, noCanopy: true } : null),
    garageWall: C.brown, garageDoor: 0x5a4632,
    openGarage: 0, advent: 0.35,
    unit: (row, k, info) => {
      const key = row === 'S1a' && k === 4 ? 'ove' : row === 'N1a' && k === 0 ? 'parvaneh' : row === 'S1b' && k === 0 ? 'rune' : row === 'N1b' && k === 3 ? 'jimmy' : row === 'N1a' && k === 4 ? 'anders' : null;
      if (key) { units[key] = info; decorate(key, info, r); }
      return !!key;
    },
  });

  // ----- Landmarks (people: yaw = the way someone standing there faces).
  const at = (key, ly) => { const u = units[key]; return { x: u.doorW[0], z: u.doorW[1], yaw: wrapYaw(u.f.yaw + ly) }; };
  const L = (name, o) => { landmarks[name] = o; return o; };
  L('oveHouse', at('ove', Math.PI));
  // Player spawn: on the main walkway west of Ove's path, facing east along it (8+ m free behind,
  // so a follow camera starts outside the houses; Patrick's car is further west).
  bf.mark('oveStart', -5.9, 4.2, Math.PI / 2);
  L('parvanehHouse', at('parvaneh', Math.PI));
  // Rune's door has the wheelchair ramp in front of it: stand at its foot, out on the walkway.
  { const u = units.rune, [x, z] = u.f.W(u.a0 + u.dA, -3.7); L('runeHouse', { x, z, yaw: wrapYaw(u.f.yaw + Math.PI) }); }
  L('jimmyHouse', at('jimmy', Math.PI));
  L('andersHouse', at('anders', Math.PI));
  // Garage 1 (open) is Ove's: the row starts at local (3.5, -19.5), garages 3.05 m wide.
  const g1x = 3.5 + 3.05 / 2;
  bf.mark('oveGarage', g1x - 0.3, -20.3, 0);
  // Between the shelf on the left wall (to x0 + 0.6) and the neighbour's wall: 2.3 m clear.
  bf.mark('oveGarageSpot', 3.5 + 0.605 + 1.225, -16.95, 0, { w: 2.3, l: 5.0 });
  bf.mark('saabSpot', 6.75, -23.1, 0, { w: 2.6, l: 5.2 });
  bf.mark('parvanehDrive', -8.0, 3.8, Math.PI / 2, { w: 3.2, l: 9.5 });
  bf.mark('garbageRoom', -4.2, -20.5, 0);
  bf.mark('bikeShed', -24.5, 25.4, 0);
  bf.mark('parking', 12, -22.75, Math.PI);
  bf.mark('guestParking', -22.7, -21.2, 0);
  bf.mark('adrianSpot', -26.6, -22.2, -0.4);
  bf.mark('mailboxes', 0, -26.4, Math.PI);
  bf.mark('playground', 14, 25.0, 0);
  bf.mark('torg', 1.8, 3.8, -Math.PI / 2);
  garageInterior(area.garageFrame, 3.05 / 2);
  area.garageFrame.sign(textFace('OVE', 0.42, 0.13, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 300, weight: '700' }), 3.05 / 2 + 0.6, CURB + 2.36, -0.065, 0.42, 0.13, Math.PI);

  // ----- Named cars.
  // (phase 4 r2: a mid slate-blue metallic, 0x1c2a44 was a black silhouette in the shade)
  bf.car('saab900', 6.75, -23.1, 0, { name: 'saab', color: 0x34506e });
  bf.car('kombi', -17.2, 3.55, Math.PI / 2 + 0.2, { name: 'patrickCar', color: 0x5a6670, trailer: true });
  bf.car('volvo240', 3.5 + 3.05 * 3.5, -23.2, 0, { name: 'runeVolvo', color: 0x7a1e1e });
  bf.car('audi', -29.2, -16.9, 0, { name: 'andersAudi', color: 0xd8d8d4 });
  // Residents' cars in the north bays (a couple of gaps; the eastmost bay holds the association's
  // snow tractor).
  const bays = area.bays.filter((b) => b.row === 'north');
  const taken = [0, 1, 3, 4, 5, 7, 9, 12, 13, 14, 16, 17, 18];
  const types = ['skoda', 'volvo740', 'golf', 'kombi', 'audi', 'volvo240', 'golf', 'bmw', 'skoda', 'kombi', 'volvo740', 'van', 'golf'];
  const cols = [0x4a5a6a, 0x8a8e92, 0x2a3a4a, 0x6a2a22, 0x1e1e20, 0xd8d6d0, 0x3a4a3a, 0x5a3a2a, 0x1e1e20, 0x7a7466, 0x4a5a6a, 0xe8e8e4, 0xa8a49a];
  taken.forEach((i, n) => { const b = bays[i]; if (b) bf.car(types[n], b.lx, b.lz, b.ly, { color: cols[n] }); });
  { const b = bays[bays.length - 1]; tractor(bf.sub(b.lx, b.lz + 0.2, Math.PI)); }
  // Adrian's bay (round 5): a free north bay near adrianSpot that stays empty (no parked car: the
  // story parks Adrian's newly bought Saab here after day 5), with a small "Reserverad" plate at its
  // head, behind the low kerb (clear of a parked car's nose).
  {
    const b = bays[2];
    if (taken.includes(2)) throw new Error('adrianBay must stay free');
    bf.mark('adrianBay', b.lx, b.lz, b.ly, { w: 2.5, l: 5.0 });
    bf.post(b.lx, -31.08, 0, [{ f: textFace('Reserverad', 0.46, 0.15, { ppm: 300, scale: 0.72, bg: '#f4f2ea', fg: '#1e3a6a', border: '#1e3a6a' }), w: 0.46, h: 0.15 }], { top: 1.05 });
  }
  // Name plates on the mailbox stands (6 boxes each, the stands face the aisle).
  const names = [['Ove', 'Parvaneh &\nPatrick', 'Rune &\nAnita', 'Jimmy', 'Anders', 'Lindqvist'], ['Berg', 'Nilsson', 'Holm', 'Ek', 'Sjöberg', 'Dahl']];
  [-1.3, 1.3].forEach((mx, q) => names[q].forEach((n, k) => bf.sign(textFace(n, 0.3, 0.07, { bg: '#f4f2ea', fg: '#1a1a1a', ppm: 700, weight: '600', scale: n.includes('\n') ? 0.86 : 0.7 }), mx - 0.95 + k * 0.38, CURB + 1.13, -28.2 + 0.222, 0.3, 0.07, 0)));

  // ----- Signs (the car-free entrances are signed by radhusArea).
  // Lot: blue P at the entrance, guest parking, handicap bay, reserved bay, residents only.
  bf.post(-31.2, -27.0, -Math.PI / 2, [{ f: picto('p'), w: 0.64, h: 0.64 }, { f: textFace('Endast boende\noch gäster', 0.64, 0.3, { ppm: 260, scale: 0.72 }), w: 0.64, h: 0.3 }]);
  bf.post(-23.95, -14.1, Math.PI, [{ f: picto('p'), w: 0.56, h: 0.56 }, { f: textFace('Gästparkering\nmax 24 tim', 0.56, 0.3, { ppm: 260, scale: 0.72 }), w: 0.56, h: 0.3 }], { top: 2.3 });
  bf.post(-15.7, -14.1, Math.PI, [{ f: picto('p'), w: 0.56, h: 0.56 }, { f: picto('hcp'), w: 0.56, h: 0.56 }], { top: 2.3 });
  bf.post(-29.2, -14.1, Math.PI, [{ f: textFace('Reserverad\nOrdförande', 0.56, 0.3, { ppm: 260, scale: 0.7, bg: '#f4f2ea', fg: '#1e3a6a', border: '#1e3a6a' }), w: 0.56, h: 0.3 }], { top: 1.5 });
  // Räddningsväg in front of the garages.
  bf.post(31.0, -19.8, Math.PI / 2, [{ f: picto('stoppforbud'), w: 0.56, h: 0.56 }, { f: textFace('Räddningsväg', 0.56, 0.18, { ppm: 260, scale: 0.75 }), w: 0.56, h: 0.18 }], { top: 2.4 });
  // Notice board by the mailboxes.
  const nb = bf.sub(3.4, -26.7, 0);
  nb.use('wood').box(0x5a4632, -0.75, CURB, 0, 0.09, 1.9, 0.09).box(0x5a4632, 0.75, CURB, 0, 0.09, 1.9, 0.09);
  nb.use('painted').box(0x3a3a34, 0, CURB + 1.0, 0, 1.5, 0.95, 0.05);
  nb.use('painted').boxC(C.metalBlack, 0, CURB + 2.0, 0.05, 1.8, 0.04, 0.4, 0, 0.2);
  // (round 6: the notices face south, towards the walkway entrance and the mailboxes' fronts; they
  // were on the board's south side facing north, into the board, and could not be seen from anywhere)
  nb.sign(textFace('ANSLAGSTAVLA', 1.36, 0.16, { bg: '#3a3a34', fg: '#e8e4d8', ppm: 260, weight: '700' }), 0, CURB + 1.84, 0.04, 1.36, 0.16, 0);
  nb.sign(textFace('Föreningsmöte\ntorsdag kl. 19.00\n\nBilkörning inom\nområdet är förbjuden!\n/Styrelsen', 0.62, 0.72, { bg: '#f4f2ea', fg: '#1a1a1a', ppm: 300, scale: 0.86, weight: '500' }), -0.36, CURB + 1.42, 0.035, 0.6, 0.7, 0);
  nb.sign(textFace('Upphittad: grå\nrandig katt.\nRing Jimmy!', 0.5, 0.4, { bg: '#f0e6a8', fg: '#1a1a1a', ppm: 300, scale: 0.8, weight: '500' }), 0.38, CURB + 1.52, 0.035, 0.46, 0.38, 0);
  nb.solid(0, 0, 1.6, 0.2, 99, 'board');

  // ----- Violation spots inside and right around the area.
  const V = (lx, lz, ly, kind) => violationSpots.push({ x: bf.wx(lx, lz), z: bf.wz(lx, lz), yaw: bf.yaw + ly, kind, where: 'ove' });
  V(13.5, 3.8, -Math.PI / 2, 'carfree');
  V(20.5, 3.6, Math.PI / 2, 'carfree');
  V(26.8, 3.9, -Math.PI / 2, 'carfree');
  V(0.2, 13.5, 0.06, 'firelane');
  V(-0.3, -8.8, Math.PI, 'firelane');
  V(0, -16.4, 0, 'firelane');
  V(0.3, 26.8, Math.PI - 0.05, 'firelane');
  V(-6.4, 28.0, Math.PI / 2 + 0.15, 'lawn');
  V(-7.2, -21.6, -Math.PI / 2, 'garbage');
  for (const x of [-26.6, -24.0, -21.4, -18.8]) V(x, -16.9, 0, 'guest24');
  V(-15.7, -16.9, 0, 'handicap');
  V(18.0, -21.4, Math.PI / 2, 'firelane');
  return { area, units };
}

// ----- The named neighbours' houses. Each gets at least one cue that reads from ~25 m.
function decorate(key, u, r) {
  const f = u.f, X = (a) => u.a0 + a, dA = u.dA;
  const Y0 = CURB + 0.32;
  const plate = (text, bg = '#f2f0e8', fg = '#1a1a1a') => f.sign(textFace(text, 0.42, 0.11, { bg, fg, ppm: 340, weight: '600', scale: 0.78 }), X(dA - 0.9), Y0 + 1.55, -0.035, 0.42, 0.11, Math.PI);
  if (key === 'ove') {
    // (phase 4 r2) a new widower who has not changed the plate; on the door above the letter slot
    // (beside the door it stood half inside his shed's wall)
    f.sign(textFace('Ove & Sonja', 0.3, 0.075, { bg: '#f2f0e8', fg: '#1a1a1a', ppm: 420, weight: '600', scale: 0.74 }), X(dA - 0.24), Y0 + 1.22, -0.072, 0.3, 0.075, Math.PI);
    u.clearPath = true;   // his walkway edge is shovelled clear (radhusArea leaves a wide gap)
    // "Ingen reklam tack" on the door, a big thermometer by the kitchen window, a kicksled, a shovel.
    f.sign(textFace('Ingen reklam\ntack', 0.2, 0.09, { bg: '#f4f2ea', fg: '#b01e1e', ppm: 400, scale: 0.8 }), X(dA + 0.15), Y0 + 1.3, -0.07, 0.2, 0.09, Math.PI);
    f.use('painted').box(0xf0eee8, X(5.15), Y0 + 1.0, -0.04, 0.16, 0.62, 0.03);
    f.use('painted').box(0xb01e1e, X(5.15), Y0 + 1.06, -0.058, 0.018, 0.48, 0.01);
    f.prop('kicksled', X(3.85), -1.55, Math.PI);
    f.use('plastic').boxC(0x2a4a7a, X(2.0), CURB + 0.75, -0.1, 0.4, 0.05, 0.34, 0, 0.12);
    f.use('wood').boxC(0x8a6a48, X(2.0), CURB + 0.75, -0.25, 0.04, 1.4, 0.04, 0, 0.16);
    // His home-made sign on the shed door: PARKERING FÖRBJUDEN, white board, red hand-painted letters.
    const shed = u.shedL;
    f.use('wood').box(0xece8de, shed[0], CURB + 1.12, -2.07, 1.42, 0.82, 0.035);
    f.use('wood').box(0x5a4632, shed[0], CURB + 1.08, -2.06, 1.5, 0.05, 0.04).box(0x5a4632, shed[0], CURB + 1.93, -2.06, 1.5, 0.05, 0.04);
    f.sign(textFace('PARKERING\nFÖRBJUDEN!', 1.36, 0.76, { bg: '#ece8de', fg: '#a8161a', ppm: 260, weight: '700', scale: 0.82 }), shed[0], CURB + 1.53, -2.092, 1.36, 0.76, Math.PI);
    // Swept clean: a broom against the shed and a perfectly clear paving path (no snow strip).
    f.use('wood').boxC(0x9a7a50, shed[0] + 0.75, CURB + 0.7, -2.1, 0.03, 1.4, 0.03, 0, 0.1);
    f.use('fabric', { snow: 0 }).box(0x8a6a3a, shed[0] + 0.83, CURB, -2.12, 0.28, 0.12, 0.06);
    birdTable(f, X(2.2), D + 3.4);
  } else if (key === 'parvaneh') {
    plate('Parvaneh & Patrick');
    for (const [a, z] of [[3.8, -1.25], [4.45, -1.6], [4.1, -1.4]]) f.prop('box', X(a), z, Math.PI);
    f.prop('pulka', X(4.6), -2.2, Math.PI / 2);
    f.prop('snowman', X(4.9), -0.9, 0.4);
    f.sign(textFace('Välkommen!', 0.4, 0.12, { bg: '#e8d8b0', fg: '#5a2a1a', ppm: 340, scale: 0.8, weight: '600' }), X(dA), Y0 + 2.4, -0.06, 0.4, 0.12, Math.PI);
    // Children's things in the front garden: a red snow racer, a yellow spade, a blue bucket, and a
    // paper Advent star lit in the kitchen window.
    const tx = X(1.6), tz = -1.5;
    f.use('plastic');
    f.boxC(0xc0281e, tx, CURB + 0.12, tz, 0.42, 0.16, 1.05, 0.5, 0.05);
    f.boxC(0xc0281e, tx + Math.sin(0.5) * 0.4, CURB + 0.38, tz + Math.cos(0.5) * 0.4, 0.5, 0.04, 0.05, 0.5);
    f.boxC(0xe0b020, X(0.6), CURB + 0.35, -1.0, 0.18, 0.03, 0.25, 0, 0.9).boxC(0xe0b020, X(0.6), CURB + 0.6, -1.12, 0.03, 0.55, 0.03, 0, 0.9);
    f.use('plastic').cyl(0x2a6ab0, X(0.95), CURB + 0.12, -1.6, 0.13, 0.24, 10);
    // (round 6: a warm paper glow with a slightly brighter heart, under the bloom threshold in
    // daylight: at full intensity it was a white starburst behind every dialogue at her door)
    f.use('light', { snow: 0 });
    for (const a of [0, Math.PI / 4]) f.boxC(glow(0xffc870, 0.75), X(4.35), Y0 + 1.6, -0.06, 0.3, 0.3, 0.02, 0, 0, a);
    for (const a of [0, Math.PI / 4]) f.boxC(glow(0xffd890, 1.25), X(4.35), Y0 + 1.6, -0.075, 0.1, 0.1, 0.01, 0, 0, a);
  } else if (key === 'rune') {
    plate('Rune & Anita');
    // Wheelchair ramp up to the door, with a railing.
    f.use('wood').boxC(0x7a6650, X(dA), CURB + 0.17, -1.45, 1.25, 0.06, 2.5, 0, -0.12);
    f.ramp(X(dA), -1.45, 0, 1.25, 2.5, CURB + 0.01, CURB + 0.34, 'ramp');
    // (round tube handrails ~0.85 m above the boards, rising with the ramp; the posts meet them)
    f.use('metal');
    const railY = (z) => CURB + 1.05 + (z + 1.45) * 0.12;
    for (const sx of [-0.66, 0.66]) {
      const [ax, az] = f.W(X(dA) + sx, -2.68), [bx, bz] = f.W(X(dA) + sx, -0.22);
      limb(f.S, ax, railY(-2.68), az, bx, railY(-0.22), bz, 0.022, 0.022, 0x9a9da0, 8);
      for (const z of [-2.55, -1.45, -0.35]) f.cyl(0x9a9da0, X(dA) + sx, CURB + railY(z) / 2 - CURB / 2, z, 0.02, railY(z) - CURB, 8);
      // the camera keeps out of the railing and the space just above it (no shot from right behind
      // it); a boom passing well over it (camera >= ~0.7 m above the rail) is left alone
      f.cam(X(dA) + sx, -1.45, 0.12, 2.5, CURB, CURB + 1.6);
    }
    birdTable(f, X(4.4), -1.5);
    f.use('light', { snow: 0 }).box(0xffcf80, X(1.35), Y0 + 3.55 + 0.05, -0.04, 0.04, 0.04, 0.02);
  } else if (key === 'jimmy') {
    plate('Jimmy');
    f.prop('bike', X(4.55), -0.95, Math.PI / 2);
    f.use('painted').cyl(0x1a1a1a, X(4.5), CURB + 0.85, D + 2.8, 0.3, 0.32, 14);
    f.use('metal'); for (const a of [0, 2.1, 4.2]) f.box(0x6a6e72, X(4.5) + Math.cos(a) * 0.2, CURB, D + 2.8 + Math.sin(a) * 0.2, 0.03, 0.7, 0.03);
    // Advent star in the upstairs window, and a string of coloured lights along his shed's eave
    // (sagging between hooks) and round the door.
    f.use('light', { snow: 0 }).boxC(glow(0xffd8a0, 0.8), X(1.35), Y0 + 4.1, -0.05, 0.32, 0.32, 0.03, Math.PI / 4);
    const cols = [0xff3020, 0x30d040, 0x3060ff, 0xffc020, 0xff60c0];
    const [sx] = u.shedL;
    for (let q = 0; q < 14; q++) {
      const t = q / 13, x = sx - 0.95 + t * 1.9, sag = Math.sin(((t * 3) % 1) * Math.PI) * 0.09;
      f.use('light', { snow: 0 }).box(glow(cols[q % cols.length], 1.8), x, CURB + 2.08 - sag, -2.06, 0.045, 0.06, 0.045);
    }
    for (let q = 0; q < 12; q++) {
      const t = q / 11, ang = t * Math.PI;
      f.use('light', { snow: 0 }).box(glow(cols[(q + 2) % cols.length], 1.8), X(dA) - Math.cos(ang) * 0.62, Y0 + 1.1 + Math.sin(ang) * 1.15, -0.08, 0.045, 0.06, 0.045);
    }
    // ...and a string all along his stretch of the eave, sagging between the hooks (reads from the
    // walkway's far end), a lit reindeer of light tube on the lawn, energy-drink crates by the door.
    const ye = Y0 + 5.15 - 0.5 * Math.tan(0.38) - 0.14, ze = -0.5 - 0.06;
    for (let q = 0; q < 34; q++) {
      const t = q / 33, x = X(0.12) + t * (UW - 0.24), sag = Math.sin(((t * 6) % 1) * Math.PI) * 0.16;
      f.use('light', { snow: 0 }).box(glow(cols[q % cols.length], 1.8), x, ye - sag, ze, 0.06, 0.08, 0.06);
    }
    reindeer(f, X(4.4), -1.85, 1.35);
    reindeer(f, X(1.1), -1.75, -1.6, true);
    f.use('plastic');
    for (let q = 0; q < 5; q++) f.box(q % 2 ? 0x2a6a3a : 0x1e3a6a, X(3.65) + (q % 2) * 0.04, CURB + q * 0.27, -0.42, 0.42, 0.26, 0.3);
    f.sign(textFace('ENERGI', 0.36, 0.1, { bg: '#2a6a3a', fg: '#f2f0e8', ppm: 400, weight: '700' }), X(3.65), CURB + 0.14, -0.575, 0.36, 0.1, Math.PI);
    f.solid(X(3.65), -0.42, 0.45, 0.32, CURB + 1.35, 'crates');
  } else if (key === 'anders') {
    // Anthracite door, a glass entrance canopy on steel brackets, a glowing LED house number,
    // dark stone paving, the patio heater and the big grill.
    plate('Anders', '#2e3134', '#e8e8e4');
    f.use('glass').boxC(null, X(dA - 0.1), Y0 + 2.42, -0.6, 1.9, 0.025, 1.2, 0, 0.06);
    f.use('chrome');
    for (const sx of [-0.85, 0.85]) {
      f.boxC(0xc8cacc, X(dA - 0.1) + sx, Y0 + 2.39, -0.6, 0.04, 0.05, 1.2, 0, 0.06);       // bracket under the glass
      f.box(0xc8cacc, X(dA - 0.1) + sx, Y0 + 2.3, -0.03, 0.1, 0.24, 0.05);                // wall plate
      // tie rod from high on the wall down to the canopy's outer corner
      const [ax, az] = f.W(X(dA - 0.1) + sx, -0.04), [bx, bz] = f.W(X(dA - 0.1) + sx, -1.15);
      limb(f.S, ax, Y0 + 3.05, az, bx, Y0 + 2.4, bz, 0.012, 0.012, 0xc8cacc, 6);
    }
    // a pair of clipped box balls in square anthracite planters
    for (const [px, pz] of [[X(dA + 0.95), -0.5], [X(dA + 0.75), -2.15]]) {
      f.use('painted').box(0x2e3134, px, CURB, pz, 0.5, 0.5, 0.5);
      f.use('foliage').sphere(0x34482e, px, CURB + 0.78, pz, 0.6, 0.56, 0.6);
      f.solid(px, pz, 0.5, 0.5, CURB + 1.0, 'planter');
    }
    f.sign(textFace(String(u.num), 0.22, 0.2, { bg: '#1a1c1e', fg: '#e8f4ff', ppm: 400, weight: '600', glow: true }), X(dA + 0.82), Y0 + 1.75, -0.04, 0.22, 0.2, Math.PI);
    f.useF('concrete').flat(0x3a3c3e, X(dA), -1.45, 1.4, 1.8, CURB + 0.045);
    f.useF('concrete').flat(0x444648, X(3.9), -1.2, 1.6, 1.6, CURB + 0.045);
    const hx = X(4.5), hz = -1.4;
    f.use('chrome').cyl(0xd0d2d4, hx, CURB + 1.15, hz, 0.045, 2.3, 10);
    f.use('chrome').cyl(0xd0d2d4, hx, CURB + 0.08, hz, 0.28, 0.16, 16);
    f.use('chrome').cyl(0xd0d2d4, hx, CURB + 2.45, hz, 0.42, 0.06, 16);
    f.use('chrome').add(PRIM.cone(16), 0xd0d2d4, hx, CURB + 2.6, hz, 0, 0.9, 0.22, 0.9);
    f.use('light', { snow: 0 }).cyl(0xff8a3a, hx, CURB + 2.15, hz, 0.12, 0.42, 12);
    f.circ(hx, hz, 0.3, 99, 'pole');
    f.use('fabric').box(0x2a2c2e, X(3.9), CURB, D + 3.0, 1.4, 1.15, 0.7);
    f.solid(X(3.9), D + 3.0, 1.4, 0.7, CURB + 1.15, 'grill');
    f.use('light', { snow: 0 });
    for (const a of [0.4, 2.0, 3.6, 5.0]) f.box(glow(0xf8f4ff, 1.5), X(a), CURB + 0.33, -2.45, 0.08, 0.04, 0.08);
  }
}

// The association's snow tractor (round 5: was a box): a compact tractor (snöröjningstraktor) with
// a glazed cab and a front plough blade, parked nose to the kerb. Orange bodywork, a black chassis
// and cab frame, lugged tyres on orange rims, mudguards over the big rear wheels, a bonnet with a
// grille and headlights, a seat and a steering wheel behind see-through glass, an amber beacon and
// work lights on the roof, an exhaust stack, mirrors, a step; in front a curved mouldboard angled
// to throw the snow aside, on a push frame with hydraulic rams, a rubber cutting edge, skid plates
// and orange marker sticks; behind, a sand spreader on the linkage. Frame at the rear axle's
// middle-ish, nose towards local +z. Static; a solid you cannot drive through.
function tractor(f) {
  // (painted, not clear-coated car paint: the mirror coat washed the orange out to peach in the sun)
  const body = 0xc24e14, dark = 0x1e1f21, Y = CURB, G = f.S;
  const P = (lx, y, lz) => { const [x, z] = f.W(lx, lz); return [x, y, z]; };
  const bar = (a, b, r, col, n = 6) => limb(G, ...P(...a), ...P(...b), r, r, col, n);
  // ----- wheels: lugged tyres (a staggered ring of tread blocks), orange rims, hubs
  const wheel = (sx, z, rad, wid) => {
    f.use('rubber').cyl(0x1a1a1c, sx, Y + rad, z, rad * 0.93, wid, 20, 0, Math.PI / 2);
    const nl = Math.round(rad * 34);
    for (let q = 0; q < nl; q++) {
      const a = (q / nl) * Math.PI * 2, s2 = q % 2 ? 1 : -1;
      f.boxC(0x1a1a1c, sx + s2 * wid * 0.17, Y + rad + Math.sin(a) * rad * 0.94, z + Math.cos(a) * rad * 0.94, wid * 0.6, rad * 0.11, rad * 0.16, 0, Math.PI / 2 - a, 0);
    }
    const out = Math.sign(sx);
    f.use('painted').cyl(0xc85e1c, sx, Y + rad, z, rad * 0.56, wid + 0.014, 16, 0, Math.PI / 2);
    f.use('metal').cyl(0x6a6c6e, sx + out * wid * 0.47, Y + rad, z, rad * 0.16, 0.06, 10, 0, Math.PI / 2);
    for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3; f.cyl(0x8a8c8e, sx + out * wid * 0.5, Y + rad + Math.sin(a) * rad * 0.1, z + Math.cos(a) * rad * 0.1, 0.012, 0.03, 6, 0, Math.PI / 2); }
  };
  for (const sx of [-0.66, 0.66]) { wheel(sx, -0.45, 0.5, 0.3); wheel(sx * 0.86, 1.2, 0.31, 0.2); }
  // mudguards over the rear wheels: an arc of plates, and the fender tops the cab stands on
  f.use('painted');
  for (const sx of [-0.66, 0.66]) {
    for (let q = 0; q < 5; q++) {
      const a = 0.25 + (q / 4) * (Math.PI - 0.5), rr = 0.6;
      f.boxC(body, sx, Y + 0.5 + Math.sin(a) * rr, -0.45 + Math.cos(a) * rr, 0.36, 0.025, 0.42, 0, Math.PI / 2 - a, 0);
    }
  }
  // ----- chassis, front axle, bonnet with grille and headlights
  f.use('metal', { snow: 0.3 }).box(dark, 0, Y + 0.3, 0.55, 0.46, 0.36, 2.0);
  f.cyl(dark, 0, Y + 0.31, 1.2, 0.05, 1.0, 8, 0, Math.PI / 2);
  f.use('painted').box(body, 0, Y + 0.62, 0.95, 0.66, 0.5, 1.1);
  f.boxC(body, 0, Y + 1.13, 0.9, 0.6, 0.05, 1.0, 0, -0.06);                          // bonnet top, sloping forward
  f.use('painted').box(0x2a2c2e, 0, Y + 0.66, 1.505, 0.56, 0.42, 0.03);              // grille
  f.use('painted');
  for (let q = 0; q < 6; q++) f.box(0x3a3c3e, 0, Y + 0.7 + q * 0.065, 1.522, 0.54, 0.018, 0.012);
  for (const sx of [-0.335, 0.335]) for (let q = 0; q < 4; q++) f.box(0x2a2c2e, sx, Y + 0.8 + q * 0.07, 0.75, 0.012, 0.025, 0.5);   // side louvres
  f.use('lamp');
  for (const sx of [-0.2, 0.2]) f.box(0xe8e8e0, sx, Y + 0.98, 1.47, 0.14, 0.07, 0.04);
  // ----- cab: floor, posts, roof, glass, door frame, seat, wheel, dash
  f.use('metal', { snow: 0 }).box(dark, 0, Y + 0.76, -0.35, 1.2, 0.06, 1.35);
  f.use('painted');
  for (const [sx, z] of [[-0.58, -0.98], [0.58, -0.98], [-0.58, 0.28], [0.58, 0.28]]) f.box(dark, sx, Y + 0.8, z, 0.06, 1.26, 0.06);
  for (const sx of [-0.58, 0.58]) { f.box(dark, sx, Y + 1.36, -0.35, 0.04, 0.04, 1.22); f.box(dark, sx, Y + 0.8, -0.35, 0.05, 0.08, 1.22); }
  f.box(dark, 0, Y + 2.0, 0.28, 1.2, 0.06, 0.06).box(dark, 0, Y + 2.0, -0.98, 1.2, 0.06, 0.06);
  f.use('painted').box(body, 0, Y + 2.06, -0.35, 1.34, 0.08, 1.5);
  f.use('painted').box(0xd8d6d0, 0, Y + 2.0, -0.35, 1.22, 0.02, 1.36);              // headliner
  const gl = shared.glassG;
  f.box(null, 0, Y + 0.88, 0.285, 1.1, 1.12, 0.012, 0, gl).box(null, 0, Y + 0.9, -0.985, 1.1, 1.08, 0.012, 0, gl);
  for (const sx of [-0.585, 0.585]) f.box(null, sx, Y + 0.86, -0.35, 0.012, 1.14, 1.22, 0, gl);
  f.use('metal').box(0x9a9da0, -0.6, Y + 1.25, -0.1, 0.02, 0.03, 0.14);               // door handle
  f.use('fabric', { snow: 0 }).box(0x26282a, 0, Y + 0.95, -0.6, 0.48, 0.12, 0.46).boxC(0x26282a, 0, Y + 1.3, -0.82, 0.46, 0.55, 0.1, 0, -0.15);
  f.use('painted', { snow: 0 }).box(0x2a2c2e, 0, Y + 0.82, 0.12, 0.7, 0.42, 0.16);   // dash / console
  bar([0, Y + 1.2, 0.1], [0, Y + 1.42, -0.12], 0.025, 0x2a2c2e);
  f.use('rubber').add(PRIM.torus(), 0x1e1e1e, 0, Y + 1.44, -0.14, 0, 0.36, 0.36, 0.36, -1.0, 0);
  // ----- roof: amber beacon, work lights; exhaust stack; mirrors; step; tail lights
  f.use('painted').cyl(0x2a2c2e, 0.42, Y + 2.13, -0.85, 0.08, 0.04, 12);
  f.use('light', { snow: 0 }).cyl(0xff9a1a, 0.42, Y + 2.21, -0.85, 0.065, 0.13, 12);
  f.use('lamp').sphere(0xffb040, 0.42, Y + 2.28, -0.85, 0.06, 0.035, 0.06);
  for (const sx of [-0.5, 0.5]) { f.use('painted').box(0x2a2c2e, sx, Y + 2.12, 0.36, 0.16, 0.1, 0.06); f.use('lamp').box(0xf0f0e8, sx, Y + 2.12, 0.395, 0.13, 0.07, 0.01); }
  f.use('metal').cyl(0x5a5c5e, 0.36, Y + 1.66, 0.4, 0.038, 1.1, 10);
  f.use('painted').boxC(0x2a2c2e, 0.36, Y + 2.24, 0.42, 0.09, 0.012, 0.11, 0, 0.35);  // rain cap
  for (const sx of [-1, 1]) { bar([sx * 0.6, Y + 1.7, 0.27], [sx * 0.86, Y + 1.78, 0.3], 0.012, dark, 4); f.use('painted').box(0x1a1a1a, sx * 0.88, Y + 1.66, 0.3, 0.04, 0.24, 0.16); }
  f.use('metal').box(dark, -0.64, Y + 0.4, -0.05, 0.22, 0.03, 0.3);                 // step
  f.use('lamp');
  for (const sx of [-0.62, 0.62]) f.box(0xb01818, sx, Y + 1.05, -1.06, 0.1, 0.06, 0.02);
  // ----- rear: three-point linkage and a sand spreader (a tapered hopper over a spinner disc)
  bar([-0.3, Y + 0.45, -0.75], [-0.32, Y + 0.5, -1.3], 0.03, dark);
  bar([0.3, Y + 0.45, -0.75], [0.32, Y + 0.5, -1.3], 0.03, dark);
  bar([0, Y + 0.95, -0.95], [0, Y + 0.9, -1.25], 0.03, dark);
  f.use('plastic').boxC(0x3a3e40, 0, Y + 0.98, -1.5, 0.95, 0.42, 0.6, 0, 0);
  f.use('plastic').boxC(0x3a3e40, 0, Y + 0.68, -1.5, 0.6, 0.22, 0.38, 0, 0);
  f.use('metal').cyl(0x6a6c6e, 0, Y + 0.48, -1.5, 0.22, 0.03, 12);
  f.use('snow').box(0xe8ebee, 0, Y + 1.2, -1.5, 0.88, 0.04, 0.54);                 // snow in the hopper's lid
  // ----- the plough: a curved mouldboard (six slats round a concave profile), angled 0.32 rad
  const bl = f.sub(0, 2.02, 0.32);
  const prof = [[0.12, 0.06], [0.03, 0.17], [-0.03, 0.3], [-0.05, 0.44], [-0.03, 0.57], [0.03, 0.67], [0.1, 0.72]];
  bl.use('painted');
  for (let i = 0; i < prof.length - 1; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1], L = Math.hypot(z1 - z0, y1 - y0);
    bl.boxC(body, 0, Y + (y0 + y1) / 2, (z0 + z1) / 2, 1.9, L + 0.012, 0.03, 0, Math.atan2(z1 - z0, y1 - y0), 0);
  }
  bl.use('rubber').box(0x141414, 0, Y + 0.0, 0.13, 1.88, 0.1, 0.035);               // cutting edge
  bl.use('metal');
  for (const sx of [-0.96, 0.96]) bl.box(dark, sx, Y + 0.02, 0.0, 0.03, 0.66, 0.36);    // skid / end plates
  for (const sx of [-0.6, 0, 0.6]) bl.boxC(dark, sx, Y + 0.38, -0.12, 0.06, 0.62, 0.05, 0, -0.08, 0);   // ribs
  bl.box(dark, 0, Y + 0.2, -0.2, 1.6, 0.08, 0.06).box(dark, 0, Y + 0.55, -0.18, 1.6, 0.08, 0.06);
  bl.box(dark, 0, Y + 0.28, -0.42, 0.34, 0.16, 0.42);                                   // pivot
  // marker sticks (plogpinnar) at the blade's ends: orange with a black top band
  for (const sx of [-0.92, 0.92]) {
    bl.use('painted').cyl(0xe86a10, sx, Y + 1.05, -0.14, 0.012, 0.9, 6);
    bl.use('painted').cyl(0x1a1a1a, sx, Y + 1.58, -0.14, 0.013, 0.16, 6);
  }
  // push frame and rams, from the front axle to the pivot
  const pv = (lx, y, lz) => { const [x, z] = bl.W(lx, lz); return [x, y, z]; };
  for (const sx of [-0.22, 0.22]) limb(G, ...P(sx, Y + 0.3, 1.0), ...pv(sx * 0.6, Y + 0.3, -0.5), 0.045, 0.045, dark, 6);
  for (const sx of [-0.25, 0.25]) {
    limb(G, ...P(sx, Y + 0.55, 1.45), ...P(sx + Math.sign(sx) * 0.05, Y + 0.4, 1.68), 0.035, 0.035, 0x2a2c2e, 6);
    limb(G, ...P(sx + Math.sign(sx) * 0.05, Y + 0.4, 1.68), ...pv(sx * 2.2, Y + 0.3, -0.18), 0.018, 0.018, 0xc8cacc, 6);
  }
  f.solid(0, 0.35, 2.0, 3.8, 99, 'vehicle');
}

// A Christmas lawn reindeer (a wire frame with a string of small bulbs along it), drawn as an outline
// in its own vertical plane (z forward, y up) like the real ones: a horizontal body with a rounded
// rump and chest, a neck rising forward, a head with a muzzle and an ear, two branched antlers
// (spread sideways), four legs with knees and hocks, a tail. graze: the neck and head bent down to
// the snow (a pair, one grazing, reads as reindeer from across the walkway).
// (phase 4 r2) The outline was a glowing light tube, white chalk scribbles behind the day 3 and 6
// dialogues in daylight. Now an unlit white wire (as they look by day) with 14 small warm bulbs.
function reindeer(f, x, z, yaw, graze = false) {
  const d = f.sub(x, z, yaw), y = CURB;
  // the shoulder pivot for the neck / head / antlers when grazing
  const sh = [0.42, 0.9], ga = graze ? -1.15 : 0, cg = Math.cos(ga), sg = Math.sin(ga);
  const head = ([zz, yy, xx = 0]) => { const dz = zz - sh[0], dy = yy - sh[1]; return [sh[0] + dz * cg - dy * sg, sh[1] + dz * sg + dy * cg, xx]; };
  const P = ([zz, yy, xx = 0]) => { const [wx, wz] = d.W(xx, zz); return [wx, y + yy, wz]; };
  const segs = [];
  const line = (pts, hd = false) => { for (let i = 0; i < pts.length - 1; i++) { const a = P(hd ? head(pts[i]) : pts[i]), b = P(hd ? head(pts[i + 1]) : pts[i + 1]); limb(f.S, a[0], a[1], a[2], b[0], b[1], b[2], 0.011, 0.011, 0xe8e4dc, 4); segs.push([a, b]); } };
  f.use('plastic', { snow: 0.3 });
  line([[-0.5, 0.86], [-0.2, 0.9], [0.15, 0.9], [0.42, 0.92]]);                  // back
  line([[-0.5, 0.86], [-0.6, 0.76], [-0.55, 0.64], [-0.42, 0.6]]);               // rump
  line([[-0.42, 0.6], [-0.1, 0.55], [0.2, 0.56], [0.4, 0.62]]);                  // belly
  line([[0.4, 0.62], [0.55, 0.74], [0.56, 0.84]]);                               // chest
  line([[-0.56, 0.8], [-0.66, 0.86]]);                                            // tail
  for (const sx of [-0.1, 0.1]) {
    line([[0.33, 0.6, sx], [0.37, 0.33, sx], [0.34, 0.0, sx], [0.4, 0.0, sx]]);   // front legs: knee, hoof
    line([[-0.42, 0.62, sx], [-0.5, 0.36, sx], [-0.4, 0.0, sx], [-0.34, 0.0, sx]]); // hind legs: hock
  }
  line([[0.42, 0.92], [0.56, 1.12], [0.64, 1.2]], true);                         // neck, back
  line([[0.56, 0.84], [0.7, 1.06]], true);                                        // neck, front
  line([[0.64, 1.2], [0.74, 1.24], [0.92, 1.14], [0.9, 1.07], [0.7, 1.06]], true); // head, muzzle
  line([[0.68, 1.23], [0.6, 1.32]], true);                                        // ear
  for (const sx of [-1, 1]) {
    line([[0.7, 1.24, sx * 0.05], [0.64, 1.42, sx * 0.14], [0.52, 1.6, sx * 0.24], [0.44, 1.7, sx * 0.3]], true);   // beam
    line([[0.64, 1.42, sx * 0.14], [0.76, 1.52, sx * 0.17]], true);                                                  // tine
    line([[0.56, 1.55, sx * 0.21], [0.62, 1.7, sx * 0.24]], true);                                                   // tine
    line([[0.68, 1.3, sx * 0.08], [0.8, 1.33, sx * 0.09]], true);                                                    // brow tine
  }
  // the bulbs, evenly along the whole outline
  const total = segs.reduce((n, [a, b]) => n + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0), nb = 14;
  f.use('light', { snow: 0 });
  let acc = 0, next = total / nb / 2;
  for (const [a, b] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (next <= acc + L) { const t = (next - acc) / L; f.S.sphere(glow(0xffe2b0, 0.5), a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.026, 0.032, 0.026, 0, 0, 0, 6); next += total / nb; }
    acc += L;
  }
  d.solid(0, 0.15, 0.4, 1.3, CURB + 1.4, 'figure');
}

function birdTable(f, x, z) {
  f.use('wood');
  f.box(0x6a5440, x, CURB, z, 0.07, 1.45, 0.07);
  f.box(0x7a6048, x, CURB + 1.45, z, 0.5, 0.04, 0.5);
  f.add(PRIM.prism(), 0x5a3026, x, CURB + 1.75, z, 0, 0.62, 0.2, 0.62);
  for (const [a, b] of [[-0.22, -0.22], [0.22, 0.22]]) f.box(0x6a5440, x + a, CURB + 1.48, z + b, 0.04, 0.28, 0.04);
  f.circ(x, z, 0.08);
}
