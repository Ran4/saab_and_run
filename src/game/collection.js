// Ove's collection (features/implemented/se_pa_trinkets.md): the seven Saab emblems and Sonja's seven
// photographs lying about the area, what Ove makes of each, and the pictures themselves. Pure data
// and 2D canvas drawing, no three.js: the photographs' textures in the world (actors/pickups.js
// photoMesh) and the album page in the pause menu (hud.js renderAlbum) are drawn by the same code,
// so the print Ove picks up is the one he finds in "Samlingen". Where each lies is with its spot
// (world/town.js placeCollectibles: [x, y, z, where, hint]).
//
// The notes are only read, never said (script.js has everything said out loud):
//   - an emblem's note goes with the order it was found in (the seventh closes the collection), so
//     the album gives the n-th one found the n-th note (game.got.emblems keeps the order: a Set,
//     saved as an array);
//   - a photograph's memory goes with its picture (by id).

import { mulberry32 } from '../util.js';

export const EMBLEM_NOTES = [
  'Riktig plåt. Inte som nu för tiden.',
  'Från en 99:a. Någon hade slängt det. Idioter.',
  'Griphuvudet. Ove putsar det med tummen.',
  'Från en 96:a. Sonja sa att den lät som en symaskin. Hon hade fel.',
  'En man ska ha en ordentlig bil.',
  'Trollhättan, 1986. Han körde dit bara för att titta på fabriken.',
  'Det sista. Nu är samlingen hel. Ove säger ingenting.',
];
// Sonja's photographs: short memories (warm, a little sad, never more), one per picture below.
export const PHOTO_NOTES = [
  'Sonja, 1984. Tåget till Göteborg. Hon skrattade åt honom hela vägen.',
  'Sonja i Saaben, 1988. Hon ville byta radiokanal. Han lät henne. En gång.',
  'Sonja på skolavslutningen. Hela klassen hade ritat henne.',
  'Sonja och Ove i Spanien. Hon i solen. Han i skuggan, med en karta.',
  'Bröllopsdagen. Hon sa ja innan han hunnit fråga ordentligt.',
  'Sonja i trädgården. Hon planterade blommor där han ville ha grus. Blommorna vann.',
  'Sonja, en vanlig tisdag. Han vet inte varför han tog bilden. Han är glad att han gjorde det.',
];
// What is written on the white edge of each print (Ove's hand, or hers).
const CAPTIONS = ['Göteborg -84', 'Saaben -88', 'Skolavslutningen', 'Spanien', 'Bröllopet', 'Trädgården', 'Tisdag'];
export const COUNT = 7;

// ---------------------------------------------------------------------------------------------
// The photographs: old sepia prints, 192 x 256 with a cream border (the picture 164 x 200 inside
// it), drawn at `scale` (1 for the texture in the world, 2 for the album). Cached per id and scale.

const W = 192, H = 256, PX = 14, PY = 14, PW = 164, PH = 200;
const DARK = [44, 32, 22], MID = [140, 109, 76], LIGHT = [238, 225, 198];
// The sepia ramp: v 0 (dark) .. 1 (light), alpha a.
function tone(v, a = 1) {
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  const [p, q, t] = v < 0.5 ? [DARK, MID, v / 0.5] : [MID, LIGHT, (v - 0.5) / 0.5];
  return `rgba(${Math.round(p[0] + (q[0] - p[0]) * t)},${Math.round(p[1] + (q[1] - p[1]) * t)},${Math.round(p[2] + (q[2] - p[2]) * t)},${a})`;
}
const vgrad = (x, y0, y1, a, b) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, tone(a)); g.addColorStop(1, tone(b)); return g; };
const ell = (x, cx, cy, rx, ry, fill, rot = 0) => { x.fillStyle = fill; x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); x.fill(); };
const poly = (x, fill, ...pts) => { x.fillStyle = fill; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
const line = (x, stroke, w, ...pts) => { x.strokeStyle = stroke; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); };
// Something soft (out of focus, or moving past a train window).
const blurred = (x, px, fn) => { x.save(); x.filter = `blur(${px * (x.__s || 1)}px)`; fn(); x.restore(); };

// A face: centre (hx, hy), half-width r. o: skin, hair (tones), long (Sonja's hair to the shoulders),
// tilt, mouth 'smile' | 'laugh' | 'flat', shut (eyes closed with laughing), light (-1 from the left,
// 1 from the right), look (the eyes' sideways offset), hat (a sun hat's tone).
function head(x, hx, hy, r, o = {}) {
  const skin = o.skin ?? 0.74, hair = o.hair ?? 0.2, L = o.light ?? 0;
  x.save();
  x.translate(hx, hy);
  x.rotate(o.tilt || 0);
  if (o.long) ell(x, 0, r * 0.45, r * 1.34, r * 1.5, tone(hair));
  x.fillStyle = tone(skin - 0.14);
  x.fillRect(-r * 0.4, r * 0.7, r * 0.8, r * 1.0);
  const g = x.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, tone(skin - 0.12 * L)); g.addColorStop(1, tone(skin + 0.12 * L));
  ell(x, 0, 0, r, r * 1.2, g);
  // hair over the top (hers parted and over the forehead, his short)
  x.fillStyle = tone(hair);
  x.beginPath();
  if (o.long) { x.ellipse(0, -r * 0.42, r * 1.12, r * 0.86, 0, Math.PI * 0.96, Math.PI * 2.04); x.fill(); ell(x, -r * 0.5, -r * 0.62, r * 0.6, r * 0.3, tone(hair), -0.45); }
  else { x.ellipse(0, -r * 0.5, r * 1.04, r * 0.76, 0, Math.PI, Math.PI * 2); x.fill(); }
  if (o.hat != null) { ell(x, 0, -r * 0.78, r * 2.3, r * 0.42, tone(o.hat)); ell(x, 0, -r * 1.05, r * 1.0, r * 0.55, tone(o.hat - 0.06)); }
  const ink = tone(0.1, 0.85), lk = (o.look || 0) * r * 0.2;
  x.strokeStyle = ink; x.fillStyle = ink; x.lineCap = 'round'; x.lineWidth = Math.max(0.8, r * 0.11);
  for (const s of [-1, 1]) {
    if (o.shut) { x.beginPath(); x.arc(s * r * 0.38, -r * 0.02, r * 0.17, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
    else ell(x, s * r * 0.38 + lk, -r * 0.04, r * 0.11, r * 0.09, ink);
  }
  x.lineWidth = Math.max(0.8, r * 0.09);
  x.beginPath();
  if (o.mouth === 'laugh') { x.fillStyle = tone(0.12, 0.9); x.ellipse(0, r * 0.5, r * 0.32, r * 0.2, 0, 0, Math.PI); x.fill(); }
  else if (o.mouth === 'flat') { x.moveTo(-r * 0.22, r * 0.52); x.lineTo(r * 0.22, r * 0.52); x.stroke(); }
  else { x.arc(0, r * 0.3, r * 0.3, Math.PI * 0.18, Math.PI * 0.82); x.stroke(); }
  x.restore();
}
// Shoulders and body, from under the head down to `bottom`. o.w (shoulder half-width in r), o.collar
// (a tone: an open collar or a shirt), o.flare (the hem wider than the shoulders: a dress).
function torso(x, hx, hy, r, bottom, t, o = {}) {
  const top = hy + r * 1.42, w = r * (o.w ?? 2.4), f = o.flare ?? 1.05;
  x.fillStyle = typeof t === 'number' ? tone(t) : t;
  x.beginPath();
  x.moveTo(hx - w * f, bottom);
  x.quadraticCurveTo(hx - w, top + r * 0.15, hx - r * 0.55, top);
  x.lineTo(hx + r * 0.55, top);
  x.quadraticCurveTo(hx + w, top + r * 0.15, hx + w * f, bottom);
  x.closePath();
  x.fill();
  if (o.collar != null) poly(x, tone(o.collar), hx - r * 0.5, top, hx + r * 0.5, top, hx, top + r * 1.3);
}
// Flowers: a few blossoms on a stem (the bouquets, the garden).
function blossoms(x, cx, cy, n, R, rnd, lo = 0.35, hi = 0.95) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = R * Math.sqrt(rnd());
    ell(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, R * 0.32, R * 0.3, tone(lo + (hi - lo) * rnd()));
  }
}

const SCENES = [
  // 0. The train to Göteborg, 1984: she laughs at him, the country going by behind her.
  (x, rnd) => {
    x.fillStyle = vgrad(x, PY, PY + PH, 0.42, 0.26); x.fillRect(PX, PY, PW, PH);
    const wx = 30, wy = 24, ww = 142, wh = 92;
    x.save();
    x.beginPath(); x.roundRect(wx, wy, ww, wh, 10); x.clip();
    x.fillStyle = vgrad(x, wy, wy + wh, 0.98, 0.84); x.fillRect(wx, wy, ww, wh);
    blurred(x, 1.2, () => {
      x.fillStyle = tone(0.62); x.beginPath(); x.moveTo(wx, wy + 62);
      for (let i = 0; i <= 14; i++) x.lineTo(wx + i * ww / 14, wy + 56 + Math.sin(i * 1.7) * 4 - (i % 3) * 2);
      x.lineTo(wx + ww, wy + wh); x.lineTo(wx, wy + wh); x.fill();
      x.fillStyle = tone(0.36); x.beginPath(); x.moveTo(wx, wy + 70);
      for (let i = 0; i <= 28; i++) x.lineTo(wx + i * ww / 28, wy + 64 - (i % 2 ? 6 : 1) - (rnd() * 4));
      x.lineTo(wx + ww, wy + 74); x.lineTo(wx, wy + 74); x.fill();
      x.fillStyle = vgrad(x, wy + 72, wy + wh, 0.8, 0.7); x.fillRect(wx, wy + 72, ww, wh - 72);
    });
    blurred(x, 2.4, () => { x.fillStyle = tone(0.24); x.fillRect(wx + 112, wy + 6, 4, wh); line(x, tone(0.3), 1.5, wx + 96, wy + 14, wx + 132, wy + 12); });
    x.restore();
    x.strokeStyle = tone(0.2); x.lineWidth = 6; x.beginPath(); x.roundRect(wx, wy, ww, wh, 10); x.stroke();
    x.fillStyle = tone(0.55); x.fillRect(wx - 6, wy + wh + 4, ww + 12, 6);
    // the curtain, gathered at the left of the window
    x.fillStyle = vgrad(x, PY, 150, 0.66, 0.5); x.fillRect(PX, PY, 26, 136);
    for (let i = 0; i < 4; i++) line(x, tone(0.4, 0.7), 1.4, PX + 4 + i * 6, PY, PX + 3 + i * 6.4, 150);
    // the seat behind her, and the little table under the window
    x.fillStyle = tone(0.24); x.beginPath(); x.roundRect(40, 96, 92, 140, 14); x.fill();
    x.fillStyle = tone(0.6); x.fillRect(118, 168, 70, 8);
    poly(x, tone(0.9), 146, 152, 160, 152, 158, 168, 148, 168);
    torso(x, 84, 122, 17, PY + PH, 0.36, { collar: 0.82 });
    head(x, 84, 122, 17, { long: true, tilt: -0.2, mouth: 'laugh', shut: true, light: 1 });
    ell(x, 124, 166, 8, 5, tone(0.66));
  },
  // 1. Sonja in the Saab, 1988, from the driver's seat: her hand on the radio.
  (x) => {
    x.fillStyle = tone(0.3); x.fillRect(PX, PY, PW, PH);
    x.fillStyle = vgrad(x, PY, 104, 0.95, 0.82); x.fillRect(PX, 30, 70, 80);
    blurred(x, 1.6, () => { for (let i = 0; i < 6; i++) poly(x, tone(0.48), PX + i * 13, 100, PX + 7 + i * 13, 58 + (i % 3) * 7, PX + 14 + i * 13, 100); x.fillStyle = tone(0.93); x.fillRect(PX, 96, 70, 14); });
    // the side window behind her: snow and spruce along the road
    x.save(); x.beginPath(); x.moveTo(86, 36); x.lineTo(PX + PW, 30); x.lineTo(PX + PW, 118); x.lineTo(80, 118); x.closePath(); x.clip();
    x.fillStyle = vgrad(x, 30, 118, 0.97, 0.9); x.fillRect(80, 30, 100, 90);
    blurred(x, 1.4, () => { for (let i = 0; i < 6; i++) poly(x, tone(0.42), 92 + i * 16, 96, 100 + i * 16, 62 + (i % 3) * 5, 108 + i * 16, 96); x.fillStyle = tone(0.96); x.fillRect(80, 96, 100, 24); });
    x.restore();
    poly(x, tone(0.14), 74, PY, 92, PY, 86, 120, 70, 120);   // the pillar
    x.fillStyle = tone(0.16); x.fillRect(PX, PY, PW, 18);    // the roof lining
    x.fillStyle = tone(0.26); x.fillRect(80, 118, 98, 100);  // the door
    // the seat and its headrest
    x.fillStyle = tone(0.2); x.beginPath(); x.roundRect(98, 62, 76, 160, 16); x.fill();
    x.fillStyle = tone(0.24); x.beginPath(); x.roundRect(106, 70, 48, 30, 9); x.fill();
    torso(x, 130, 96, 16, PY + PH, 0.46, { collar: 0.78 });
    line(x, tone(0.62), 4, 152, 112, 116, 196);              // the seat belt
    head(x, 130, 96, 16, { long: true, tilt: 0.1, mouth: 'smile', look: -1, light: 1 });
    // the dashboard and the radio, her hand on it
    x.fillStyle = tone(0.14); x.beginPath(); x.moveTo(PX, 150); x.quadraticCurveTo(70, 140, 96, 214); x.lineTo(PX, 214); x.fill();
    x.fillStyle = tone(0.4); x.fillRect(26, 170, 44, 16);
    x.fillStyle = tone(0.88); x.fillRect(38, 174, 18, 6);
    ell(x, 31, 178, 3, 3, tone(0.7)); ell(x, 64, 178, 3, 3, tone(0.7));
    line(x, tone(0.46), 9, 114, 130, 92, 160, 66, 176);
    ell(x, 62, 178, 6, 5, tone(0.7));
  },
  // 2. The end of term: the class drew her, all of them.
  (x, rnd) => {
    x.fillStyle = vgrad(x, PY, PY + PH, 0.8, 0.7); x.fillRect(PX, PY, PW, PH);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const cx = PX + 22 + c * 40 + (rnd() - 0.5) * 6, cy = PY + 22 + r * 36 + (rnd() - 0.5) * 5;
      x.save(); x.translate(cx, cy); x.rotate((rnd() - 0.5) * 0.2);
      x.fillStyle = tone(0.95); x.fillRect(-15, -12, 30, 24);
      const ink = tone(0.28 + rnd() * 0.25);
      if ((r * 4 + c) % 3 === 2) { x.strokeStyle = ink; x.lineWidth = 1; x.beginPath(); x.arc(-6, -4, 4, 0, Math.PI * 2); x.stroke(); for (let k = 0; k < 6; k++) line(x, ink, 0.8, -6 + Math.cos(k) * 6, -4 + Math.sin(k) * 6, -6 + Math.cos(k) * 8, -4 + Math.sin(k) * 8); line(x, ink, 1, -10, 8, 12, 8); }
      else { ell(x, 0, -3, 4.5, 6, ink); ell(x, 0, -2, 2.6, 3.4, tone(0.85)); poly(x, ink, -6, 10, 6, 10, 2, 3, -2, 3); }
      x.restore();
    }
    // a branch of lilac in a vase on the desk, top right
    blurred(x, 0.8, () => { blossoms(x, 162, 44, 26, 16, rnd, 0.45, 0.75); ell(x, 150, 70, 10, 5, tone(0.32), 0.6); });
    torso(x, 94, 120, 18, PY + PH, 0.84, { w: 2.3 });
    head(x, 94, 120, 18, { long: true, mouth: 'smile', light: -1, tilt: 0.05 });
    // the flowers the children gave her, in her arms
    line(x, tone(0.3), 2, 92, 210, 98, 176); line(x, tone(0.3), 2, 104, 210, 104, 176);
    blossoms(x, 100, 172, 22, 15, rnd, 0.4, 0.97);
    ell(x, 80, 196, 8, 6, tone(0.7)); ell(x, 118, 194, 8, 6, tone(0.7));
  },
  // 3. Spain: she in the sun, he in the shade with a map.
  (x, rnd) => {
    x.fillStyle = vgrad(x, PY, 112, 0.99, 0.9); x.fillRect(PX, PY, PW, 100);
    const sun = x.createRadialGradient(44, 36, 2, 44, 36, 46); sun.addColorStop(0, 'rgba(255,252,240,1)'); sun.addColorStop(1, 'rgba(255,252,240,0)');
    x.fillStyle = sun; x.fillRect(PX, PY, 90, 80);
    x.fillStyle = vgrad(x, 112, 132, 0.58, 0.68); x.fillRect(PX, 112, PW, 20);
    for (let i = 0; i < 26; i++) { const sx = PX + rnd() * PW, sy = 114 + rnd() * 16; line(x, tone(0.95, 0.8), 1, sx, sy, sx + 3 + rnd() * 4, sy); }
    x.fillStyle = vgrad(x, 132, PY + PH, 0.9, 0.76); x.fillRect(PX, 132, PW, PY + PH - 132);
    for (let i = 0; i < 300; i++) { x.fillStyle = tone(rnd() < 0.5 ? 0.6 : 0.95, 0.35); x.fillRect(PX + rnd() * PW, 134 + rnd() * 80, 1, 1); }
    // the parasol and its shade
    ell(x, 146, 198, 46, 12, tone(0.48, 0.85));
    line(x, tone(0.22), 2.5, 146, 82, 146, 200);
    x.fillStyle = tone(0.28); x.beginPath(); x.moveTo(94, 104); x.quadraticCurveTo(146, 52, 198, 104); x.quadraticCurveTo(146, 92, 94, 104); x.fill();
    for (const s of [-1, 1]) { x.fillStyle = tone(0.5); x.beginPath(); x.moveTo(146, 72); x.quadraticCurveTo(146 + s * 18, 76, 146 + s * 24, 100); x.lineTo(146 + s * 12, 98); x.closePath(); x.fill(); }
    // Ove in a deck chair, in the shade, with the map
    line(x, tone(0.18), 2, 126, 196, 140, 160, 164, 196);
    torso(x, 150, 150, 7, 186, 0.18, { w: 2.2 });
    line(x, tone(0.2), 4.5, 146, 184, 126, 192, 116, 194);
    head(x, 150, 150, 7, { hair: 0.12, skin: 0.45, mouth: 'flat' });
    x.save(); x.translate(150, 172); x.rotate(-0.08); x.fillStyle = tone(0.93); x.fillRect(-15, -9, 30, 18); line(x, tone(0.6), 0.8, -5, -9, -5, 9); line(x, tone(0.6), 0.8, 5, -9, 5, 9); line(x, tone(0.55), 0.8, -12, -2, 12, 3); x.restore();
    // Sonja in the sun, in a light dress and a sun hat
    ell(x, 74, 200, 16, 3.5, tone(0.55, 0.7));
    line(x, tone(0.72), 3, 60, 174, 59, 198); line(x, tone(0.72), 3, 66, 174, 68, 198);
    poly(x, tone(0.96), 57, 128, 67, 128, 80, 176, 46, 176);
    line(x, tone(0.74), 2.6, 58, 132, 46, 150); line(x, tone(0.74), 2.6, 66, 132, 80, 118);
    head(x, 62, 118, 8, { long: true, mouth: 'smile', hat: 0.88, light: -1 });
  },
  // 4. The wedding day, outside the church door: she laughing, he as straight as the door.
  (x) => {
    x.fillStyle = vgrad(x, PY, PY + PH, 0.72, 0.6); x.fillRect(PX, PY, PW, PH);
    for (let r = 0; r < 12; r++) {
      const y = PY + r * 17;
      line(x, tone(0.5, 0.6), 1, PX, y, PX + PW, y);
      for (let c = 0; c < 6; c++) { const sx = PX + c * 30 + (r % 2) * 15; line(x, tone(0.5, 0.6), 1, sx, y, sx, y + 17); }
    }
    x.fillStyle = tone(0.22); x.beginPath(); x.moveTo(62, PY + PH); x.lineTo(62, 70); x.arc(98, 70, 36, Math.PI, 0); x.lineTo(134, PY + PH); x.fill();
    for (let i = 1; i < 6; i++) line(x, tone(0.14), 1.2, 62 + i * 12, 40, 62 + i * 12, PY + PH);
    x.fillStyle = tone(0.66); x.fillRect(PX, 200, PW, 14);
    // Ove, in his suit
    torso(x, 132, 84, 15, PY + PH, 0.14, { collar: 0.96, w: 2.5 });
    poly(x, tone(0.1), 130, 106, 134, 106, 135, 124, 132, 128, 129, 124);
    head(x, 132, 84, 15, { hair: 0.14, mouth: 'flat', light: -1 });
    // Sonja: the veil, the dress, the bouquet; her arm through his
    x.fillStyle = tone(0.97, 0.55); x.beginPath(); x.moveTo(70, 80); x.quadraticCurveTo(40, 150, 46, 206); x.lineTo(96, 206); x.quadraticCurveTo(98, 150, 76, 80); x.fill();
    torso(x, 74, 98, 14, PY + PH, 0.96, { w: 2.2, flare: 1.35 });
    head(x, 74, 98, 14, { long: true, mouth: 'laugh', shut: true, tilt: -0.12, light: 1 });
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.12 + i * 0.127); ell(x, 74 + Math.cos(a) * 15, 94 + Math.sin(a) * 15, 3.2, 2.8, tone(i % 2 ? 0.98 : 0.86)); }
    line(x, tone(0.86), 6, 92, 128, 112, 136);
    line(x, tone(0.3), 1.5, 82, 166, 84, 186); line(x, tone(0.3), 1.5, 88, 166, 86, 186);
    blossoms(x, 85, 158, 18, 11, mulberry32(44), 0.45, 0.98);
  },
  // 5. In the garden: flowers where he wanted gravel. The flowers won.
  (x, rnd) => {
    x.fillStyle = vgrad(x, PY, 70, 0.93, 0.84); x.fillRect(PX, PY, PW, 60);
    blurred(x, 1.4, () => { for (let i = 0; i < 9; i++) ell(x, PX + 6 + i * 20, 52 + (i % 3) * 4, 16, 20, tone(0.42 + (i % 2) * 0.08)); });
    for (let i = 0; i < 15; i++) poly(x, tone(0.74 - (i % 2) * 0.04), PX + i * 11.5, 112, PX + i * 11.5, 66, PX + i * 11.5 + 5, 60, PX + i * 11.5 + 10, 66, PX + i * 11.5 + 10, 112);
    x.fillStyle = tone(0.6); x.fillRect(PX, 76, PW, 4); x.fillRect(PX, 100, PW, 4);
    x.fillStyle = vgrad(x, 110, PY + PH, 0.4, 0.5); x.fillRect(PX, 110, PW, PY + PH - 110);
    // the bit of gravel he got
    poly(x, tone(0.82), 128, PY + PH, PX + PW, PY + PH, 166, 112, 154, 112);
    for (let i = 0; i < 220; i++) { const t = rnd(), y = 112 + t * 102, x0 = 154 - t * 26, w = 12 + t * 38; x.fillStyle = tone(rnd() < 0.5 ? 0.62 : 0.95, 0.6); x.fillRect(x0 + rnd() * w, y, 1.3, 1.3); }
    // the flowers that won
    for (let i = 0; i < 70; i++) {
      const t = rnd(), y = 114 + t * 100, fx = PX + rnd() * (122 - t * 10), s = 1.6 + t * 3.4;
      line(x, tone(0.28), 0.8 + t, fx, y, fx + (rnd() - 0.5) * 3, y + s * 3);
      ell(x, fx, y, s, s * 0.9, tone(rnd() < 0.45 ? 0.95 : rnd() < 0.5 ? 0.7 : 0.3));
    }
    // Sonja on her knees among them, looking up
    x.fillStyle = tone(0.5); x.beginPath(); x.ellipse(76, 166, 24, 26, 0.25, 0, Math.PI * 2); x.fill();
    torso(x, 78, 130, 13, 168, 0.52, { w: 2.2, collar: 0.8 });
    line(x, tone(0.52), 6, 90, 150, 104, 172);
    line(x, tone(0.82), 2.5, 106, 172, 112, 182);
    head(x, 78, 130, 13, { long: true, mouth: 'smile', tilt: 0.16, light: -1 });
    for (let i = 0; i < 12; i++) { const fx = 60 + rnd() * 70, y = 186 + rnd() * 26; ell(x, fx, y, 4, 3.6, tone(rnd() < 0.5 ? 0.95 : 0.62)); }
  },
  // 6. An ordinary Tuesday: the kitchen, a cup of coffee, her.
  (x, rnd) => {
    x.fillStyle = vgrad(x, PY, PY + PH, 0.64, 0.52); x.fillRect(PX, PY, PW, PH);
    x.fillStyle = tone(1); x.fillRect(110, PY, 68, 84);
    const glow = x.createRadialGradient(144, 50, 10, 144, 50, 90); glow.addColorStop(0, 'rgba(255,250,236,0.55)'); glow.addColorStop(1, 'rgba(255,250,236,0)');
    x.fillStyle = glow; x.fillRect(PX, PY, PW, PH);
    x.fillStyle = tone(0.36); x.fillRect(142, PY, 4, 84); x.fillRect(110, 48, 68, 4);
    x.strokeStyle = tone(0.4); x.lineWidth = 5; x.strokeRect(110, PY - 4, 70, 90);
    x.fillStyle = tone(0.8, 0.9); x.fillRect(98, PY, 14, 100);
    for (let i = 0; i < 3; i++) line(x, tone(0.6, 0.8), 1, 101 + i * 4, PY, 101 + i * 4, 114);
    torso(x, 80, 102, 17, PY + PH, 0.4, { collar: 0.86 });
    head(x, 80, 102, 17, { long: true, mouth: 'smile', light: 1, tilt: -0.06, look: 0.3 });
    // the table (a checked cloth), the cup, the paper
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) { x.fillStyle = tone((r + c) % 2 ? 0.9 : 0.8); x.fillRect(PX + c * 14, 168 + r * 12, 14, 12); }
    line(x, tone(0.56), 2, PX, 168, PX + PW, 168);
    ell(x, 98, 172, 17, 4, tone(0.97));
    poly(x, tone(0.95), 89, 156, 107, 156, 105, 171, 91, 171);
    x.strokeStyle = tone(0.92); x.lineWidth = 2.5; x.beginPath(); x.arc(108, 163, 4.5, -1.3, 1.3); x.stroke();
    for (let i = 0; i < 2; i++) { x.strokeStyle = tone(0.98, 0.5); x.lineWidth = 1.2; x.beginPath(); x.moveTo(95 + i * 6, 152); x.bezierCurveTo(91 + i * 6, 144, 99 + i * 6, 140, 95 + i * 6, 132); x.stroke(); }
    ell(x, 84, 168, 7, 5, tone(0.7)); ell(x, 112, 168, 6, 5, tone(0.7));
    x.save(); x.translate(150, 190); x.rotate(-0.16); x.fillStyle = tone(0.93); x.fillRect(-22, -14, 44, 28); for (let i = 0; i < 7; i++) line(x, tone(0.55, 0.8), 1, -18, -9 + i * 3.4, i === 0 ? 4 : 18 - rnd() * 8, -9 + i * 3.4); x.restore();
  },
];

// Draws photograph `id` into a 2D context, in the 192 x 256 print's units (the caller scales).
export function drawPhoto(x, id, scale = 1) {
  const rnd = mulberry32(9001 + id * 77);
  x.__s = scale;
  x.fillStyle = '#efe6d2'; x.fillRect(0, 0, W, H);
  x.save();
  x.beginPath(); x.rect(PX, PY, PW, PH); x.clip();
  SCENES[id % SCENES.length](x, rnd);
  // (soft, as a print of a snapshot is: no hard drawn edges)
  const c = x.canvas, tmp = document.createElement('canvas');
  tmp.width = c.width; tmp.height = c.height;
  tmp.getContext('2d').drawImage(c, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.filter = `blur(${0.6 * scale}px)`; x.drawImage(tmp, 0, 0); x.restore();
  // An old print: faded, grainy, darker towards the edges.
  x.fillStyle = 'rgba(236, 218, 180, 0.10)'; x.fillRect(PX, PY, PW, PH);
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,245,220' : '40,30,20'},${(rnd() * 0.09).toFixed(3)})`; x.fillRect(PX + rnd() * PW, PY + rnd() * PH, 1.5, 1.5); }
  const v = x.createRadialGradient(96, 114, 46, 96, 114, 134);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,0.38)');
  x.fillStyle = v; x.fillRect(PX, PY, PW, PH);
  x.restore();
  x.fillStyle = '#6a5a44'; x.font = 'italic 17px Caveat, cursive'; x.textAlign = 'right';
  x.fillText(CAPTIONS[id % CAPTIONS.length], PX + PW - 2, 240);
  x.textAlign = 'left';
  x.__s = 1;
}

const _photos = new Map();
// A canvas with photograph `id` at `scale` (192 x 256 per unit), drawn once.
export function photoCanvas(id, scale = 1) {
  const key = `${id}:${scale}`;
  let c = _photos.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const x = c.getContext('2d');
    x.scale(scale, scale);
    drawPhoto(x, id, scale);
    _photos.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// The emblem, as the album shows it: the Saab roundel of the model in the world (pickups.js
// emblemGeo) - a chrome ring, a dark blue field, a red disc with a crowned griffin's head in chrome,
// SAAB along the bottom of the blue ring. Drawn into an s x s area.

export function drawEmblem(x, s) {
  x.save();
  x.translate(s / 2, s / 2);
  x.scale(s / 212, s / 212);   // the ring's radius is 100
  const ring = x.createLinearGradient(-100, -100, 100, 100);
  ring.addColorStop(0, '#f6f7f8'); ring.addColorStop(0.42, '#9ca3aa'); ring.addColorStop(0.55, '#eceef0'); ring.addColorStop(1, '#5f676f');
  x.shadowColor = 'rgba(0, 0, 0, 0.5)'; x.shadowBlur = 10 * s / 212; x.shadowOffsetY = 3 * s / 212;
  ell(x, 0, 0, 100, 100, ring);
  x.shadowColor = 'transparent';
  const blue = x.createRadialGradient(-20, -30, 10, 0, 0, 88);
  blue.addColorStop(0, '#2c4478'); blue.addColorStop(1, '#0f1b34');
  ell(x, 0, 0, 86, 86, blue);
  x.strokeStyle = 'rgba(255, 255, 255, 0.35)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 86, 0, Math.PI * 2); x.stroke();
  const red = x.createRadialGradient(-14, -18, 6, 0, 0, 56);
  red.addColorStop(0, '#cf3a30'); red.addColorStop(1, '#7c1610');
  ell(x, 0, 0, 54, 54, red);
  x.strokeStyle = '#d9dce0'; x.lineWidth = 3.5; x.beginPath(); x.arc(0, 0, 55.5, 0, Math.PI * 2); x.stroke();
  // SAAB along the bottom of the blue ring
  x.fillStyle = '#e9ecef'; x.font = '600 23px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const word = 'SAAB';
  for (let i = 0; i < word.length; i++) {
    const a = Math.PI / 2 + (1.5 - i) * 0.24;
    x.save(); x.translate(Math.cos(a) * 71, Math.sin(a) * 71); x.rotate(a - Math.PI / 2); x.fillText(word[i], 0, 0); x.restore();
  }
  // the griffin's head (facing right) and its crown, in units of the red disc
  x.scale(54, 54);
  const chrome = x.createLinearGradient(-0.6, -0.9, 0.7, 0.8);
  chrome.addColorStop(0, '#fbfbfc'); chrome.addColorStop(0.6, '#c9ced3'); chrome.addColorStop(1, '#8d959c');
  x.fillStyle = chrome;
  x.beginPath();
  x.moveTo(-0.42, 0.78);
  x.bezierCurveTo(-0.64, 0.35, -0.64, -0.05, -0.42, -0.3);
  x.lineTo(-0.66, -0.6); x.lineTo(-0.22, -0.44);
  x.bezierCurveTo(-0.04, -0.56, 0.26, -0.52, 0.42, -0.36);
  x.bezierCurveTo(0.58, -0.24, 0.72, -0.16, 0.8, 0.0);
  x.bezierCurveTo(0.85, 0.12, 0.79, 0.27, 0.66, 0.31);
  x.bezierCurveTo(0.68, 0.2, 0.62, 0.15, 0.5, 0.15);
  x.lineTo(0.34, 0.19);
  x.bezierCurveTo(0.36, 0.31, 0.3, 0.42, 0.22, 0.5);
  x.lineTo(0.3, 0.78); x.lineTo(0.16, 0.68); x.lineTo(0.05, 0.8); x.lineTo(-0.07, 0.68); x.lineTo(-0.19, 0.8); x.lineTo(-0.3, 0.68);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(-0.34, -0.56); x.lineTo(-0.36, -0.86); x.lineTo(-0.22, -0.72); x.lineTo(-0.06, -0.95); x.lineTo(0.1, -0.72); x.lineTo(0.24, -0.86); x.lineTo(0.22, -0.5);
  x.closePath();
  x.fill();
  ell(x, 0.22, -0.18, 0.07, 0.07, '#7c1610');
  x.strokeStyle = '#7c1610'; x.lineWidth = 0.035; x.beginPath(); x.moveTo(-0.3, 0.1); x.quadraticCurveTo(-0.1, 0.0, 0.1, 0.25); x.stroke();
  x.restore();
}
