// Things lying about: pantburkar (empty cans, 1 kr each, instanced), Ove's collectibles (Saab
// emblems and Sonja's photographs), errand/mission items (a spare key, Jimmy's phone, the
// elementnyckel, papers, flowers).

import { THREE, GeoBuilder, realMesh, realMaterials } from '../gfx.js';
import { groundAt } from '../world/collision.js';

const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------------------------------------
// Pantburkar: aluminium cans lying on their side in the snow. One instanced mesh per print colour
// (a handful of draw calls in all), no spinning or bobbing: they just lie there, the low sun
// glinting off the rims. Collected by walking (or driving) over them.

const CAN_R = 0.056, CAN_H = 0.2;    // larger than a real 33 cl can, so it reads on the snow
const CAN_COLORS = [0xb8261e, 0x1f4f9a, 0x2f7a3c, 0xc8ccd0];
export const cans = [];
let canMeshes = [];

function canGeo(color) {
  const g = new GeoBuilder();
  g.use('plastic').cyl(color, 0, 0, 0, CAN_R, CAN_H * 0.82, 14);                  // printed body
  g.use('chrome').cyl(0xc8ccd2, 0, CAN_H * 0.45, 0, CAN_R * 0.9, CAN_H * 0.1, 14);  // top rim
  g.cyl(0xb8bcc2, 0, -CAN_H * 0.45, 0, CAN_R * 0.9, CAN_H * 0.1, 14);            // bottom
  g.use('painted').box(0xe8e4dc, 0, CAN_H * 0.08, CAN_R * 0.98, CAN_R * 0.9, CAN_H * 0.22, 0.004); // label band
  return g.build();
}

export function initCans(scene, spots) {
  const per = Math.ceil(spots.length / CAN_COLORS.length) + 1;
  canMeshes = CAN_COLORS.map((c) => {
    const geo = canGeo(c);
    const im = new THREE.InstancedMesh(geo, realMaterials(geo, { snow: false }), per);
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.name = 'cans';
    for (let i = 0; i < per; i++) im.setMatrixAt(i, _zero);
    scene.add(im);
    return { im, next: 0 };
  });
  spots.forEach(([x, , z], i) => {
    const m = canMeshes[i % CAN_COLORS.length];
    const c = { id: i, x, z, y: 0, alive: true, respawn: 0, mesh: m.im, idx: m.next++, yaw: (i * 2.399) % 6.283, roll: (i * 0.7) % 0.5 };
    c.y = groundAt(x, z, 0.4, 0.6) + CAN_R * 0.92;
    cans.push(c);
    setCan(c, true);
  });
}

function setCan(c, show) {
  if (show) {
    _e.set(c.roll, c.yaw, Math.PI / 2, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(c.x, c.y, c.z), _q, _s);
    c.mesh.setMatrixAt(c.idx, _m);
  } else c.mesh.setMatrixAt(c.idx, _zero);
  c.mesh.instanceMatrix.needsUpdate = true;
}

// collector: { x, y, z, r } (r = pickup radius). Calls game.collectCan(c) for each picked up.
export function tickCans(dt, collector, game) {
  const { x, y, z, r } = collector;
  for (const c of cans) {
    if (!c.alive) {
      c.respawn -= dt;
      // Someone always drops a new one, eventually. Never in front of Ove's nose.
      if (c.respawn <= 0 && (c.x - x) ** 2 + (c.z - z) ** 2 > 70 * 70) { c.alive = true; setCan(c, true); }
      continue;
    }
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz > r * r || Math.abs(c.y - y) > 2.2) continue;
    c.alive = false;
    c.respawn = 240 + Math.random() * 180;
    setCan(c, false);
    game.collectCan(c);
  }
}

// Kept for old callers: there are no coins any more.
export function initCoins() {}
export function placeCoin() {}
export function burstCoins() {}
export function tickCoins() {}

// ---------------------------------------------------------------------------------------------
// Collectibles and items. Each gently turns and bobs a few centimetres, with a faint shaft of
// light above it so it can be found in the snow.

const CULL = 60;
let beamGeo = null;
function addBeam(obj, h = 5, r = 0.2) {
  beamGeo ??= new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.scale.set(r, h, r);
  beam.position.y = h / 2 + 0.15;
  beam.userData.noAO = true;
  beam.castShadow = false;
  // (it never moves on its holder: no per-frame matrix update)
  beam.updateMatrix();
  beam.matrixAutoUpdate = false;
  obj.add(beam);
  return beam;
}

const geoCache = {};
function emblemGeo() {
  // The Saab roundel: chrome ring, dark blue field, red disc with a (very simplified) crowned
  // griffin head in chrome. Stands on edge.
  const g = new GeoBuilder();
  const X = Math.PI / 2;
  g.use('chrome').cyl(0xd8dade, 0, 0, 0, 0.17, 0.035, 32, X);
  g.use('paintsolid').cyl(0x17284a, 0, 0, 0.004, 0.15, 0.034, 32, X);
  g.cyl(0x9a1c18, 0, 0, 0.008, 0.095, 0.034, 28, X);
  g.use('chrome');
  g.box(0xe0e2e6, 0, -0.005, 0.027, 0.07, 0.07, 0.008);              // griffin head
  g.box(0xe0e2e6, 0.03, 0.025, 0.027, 0.035, 0.02, 0.008, 0, 0, -0.5); // beak
  g.box(0xe0e2e6, 0, 0.055, 0.027, 0.06, 0.018, 0.008);              // crown band
  for (const s of [-1, 0, 1]) g.box(0xe0e2e6, s * 0.022, 0.072, 0.027, 0.012, 0.02, 0.008);
  return g.build();
}

let photoTex = null;
// (also the framed one on her nightstand: world/interior.js buildBedroom, game/waking.js)
export function sonjaPhotoTexture() {
  if (photoTex) return photoTex;
  const c = document.createElement('canvas');
  c.width = 192; c.height = 256;
  const x = c.getContext('2d');
  // An old print: cream border, a sepia picture of a woman laughing in front of a car.
  x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 192, 256);
  const g = x.createLinearGradient(0, 14, 0, 214);
  g.addColorStop(0, '#d9c6a2'); g.addColorStop(0.55, '#b89e78'); g.addColorStop(1, '#6e5a40');
  x.fillStyle = g; x.fillRect(14, 14, 164, 200);
  x.fillStyle = 'rgba(70,52,34,0.75)';
  x.beginPath(); x.moveTo(20, 196); x.lineTo(30, 160); x.lineTo(70, 148); x.lineTo(150, 150); x.lineTo(172, 172); x.lineTo(172, 196); x.fill();
  x.fillStyle = '#4a3826';
  x.beginPath(); x.ellipse(96, 92, 30, 34, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#d8c0a0';
  x.beginPath(); x.ellipse(96, 98, 21, 25, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5a4430';
  x.fillRect(86, 92, 7, 2); x.fillRect(100, 92, 7, 2);
  x.beginPath(); x.arc(96, 106, 8, 0.15, Math.PI - 0.15); x.lineWidth = 2.5; x.strokeStyle = '#5a4430'; x.stroke();
  x.fillStyle = '#8a3a2a';
  x.beginPath(); x.moveTo(52, 214); x.quadraticCurveTo(60, 132, 96, 128); x.quadraticCurveTo(132, 132, 140, 214); x.fill();
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,245,220' : '40,30,20'},${(Math.random() * 0.08).toFixed(3)})`; x.fillRect(14 + Math.random() * 164, 14 + Math.random() * 200, 1.5, 1.5); }
  const v = x.createRadialGradient(96, 114, 40, 96, 114, 130);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,0.35)');
  x.fillStyle = v; x.fillRect(14, 14, 164, 200);
  x.fillStyle = '#6a5a44'; x.font = 'italic 17px Caveat, cursive'; x.fillText('Sonja', 126, 240);
  photoTex = new THREE.CanvasTexture(c);
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.anisotropy = 4;
  return photoTex;
}
function photoMesh() {
  const grp = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ map: sonjaPhotoTexture(), roughness: 0.55, metalness: 0 }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.8 }));
  back.rotation.y = Math.PI;
  front.castShadow = back.castShadow = true;
  for (const m of [front, back]) { m.updateMatrix(); m.matrixAutoUpdate = false; }
  grp.add(front, back);
  grp.scale.setScalar(1.3);
  return grp;
}

// ---------------------------------------------------------------------------------------------
// Sonja's bouquet (the finale's close-up; also carried): eight pink roses - a tight bud in three
// nested, slightly open cups of five-lobed petals, the outer ones darker - fanned a little, green
// stems and a few leaves, in a cone of kraft-cream florist's paper with a crumpled rim cut low at
// the front, a ribbon round the waist and the cut stems out of the bottom. ~7k triangles (a frame
// draws millions). Origin at the cone's tip; up is +y, the front (the low side of the paper) -z: it
// faces up when the bouquet lies on the grave or tips forward in Ove's hands. (It used to be a
// smooth paper cone with a handful of pink balls: in the most important close-up of the game it read
// like a pickup icon.)

// A two-sided parametric sheet: fn(u, v) -> [x, y, z] over u in 0..1 (nu steps) and v in 0..1 around
// (nv steps, closed).
function sheet(nu, nv, fn) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) pos.push(...fn(i / nu, j / nv));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + ((j + 1) % nv), c = a + nv, d = b + nv;
    idx.push(a, c, b, b, c, d);
  }
  const one = new THREE.BufferGeometry();
  one.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  one.setIndex(idx);
  one.computeVertexNormals();
  // the back faces: the same points, normals flipped, winding reversed
  const n = pos.length / 3, nrm = one.attributes.normal.array;
  const P2 = new Float32Array(n * 6), N2 = new Float32Array(n * 6);
  P2.set(pos); P2.set(pos, n * 3);
  N2.set(nrm); for (let k = 0; k < n * 3; k++) N2[n * 3 + k] = -nrm[k];
  const I2 = idx.slice();
  for (let k = 0; k < idx.length; k += 3) I2.push(idx[k] + n, idx[k + 2] + n, idx[k + 1] + n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  geo.setIndex(I2);
  return geo;
}
// One petal cup: radius r, depth h, five lobes (the petal tips), the rim curling out a little.
const _cups = new Map();
function petalCup(r, h, open) {
  const key = `${r}:${h}:${open}`;
  if (!_cups.has(key)) {
    _cups.set(key, sheet(3, 18, (u, v) => {
      const th = v * Math.PI * 2, lobe = 1 + 0.1 * Math.cos(5 * th);
      const rr = r * u * lobe * (1 + open * u ** 3);
      return [Math.cos(th) * rr, h * u ** 1.5 * (1 - 0.25 * open * u ** 4) + 0.12 * h * (lobe - 1) * u, Math.sin(th) * rr];
    }));
  }
  return _cups.get(key);
}
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3(1, 1, 1);
function bouquet(g) {
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => _bm.compose(_bp.set(x, y, z), _bq.setFromEuler(_be.set(rx, ry, rz, 'YXZ')), _bs.set(s, s, s)).clone();
  // the roses: one in the middle, seven round it, tilted out (a slight fan)
  const roses = [[0, 0.246, 0, 0, 0]];
  for (let k = 0; k < 7; k++) { const a = k * (Math.PI * 2 / 7) + 0.4; roses.push([Math.cos(a) * 0.034, 0.228 + 0.008 * Math.sin(k * 2.3), Math.sin(a) * 0.034, a, 0.5 + 0.08 * Math.cos(k * 1.7)]); }
  // stems, then leaves (under the roses, poking out past the paper)
  g.use('foliage');
  for (const [x, y, z] of roses) g.cyl(0x3e5a2c, x * 0.6, (y + 0.02) / 2, z * 0.6, 0.0028, y - 0.02, 5);
  for (let k = 0; k < 7; k++) {
    const a = k * (Math.PI * 2 / 7) + 0.85, d = 0.06;
    g.sphere(0x3c5e2c, Math.cos(a) * d, 0.2 + 0.012 * (k % 2), Math.sin(a) * d, 0.05, 0.005, 0.022, 0.55, -a, 0, 7);
  }
  // the cut stems out of the bottom of the paper
  for (let k = 0; k < 5; k++) { const a = k * 1.3; g.cyl(0x4e6a34, Math.cos(a) * 0.004, -0.018, Math.sin(a) * 0.004, 0.0028, 0.05, 5); }
  // the roses
  g.use('fabric');
  for (const [x, y, z, a, tilt] of roses) {
    // tilt outwards: about the horizontal axis perpendicular to the way it leans
    const m = (dy, s = 1) => at(x + Math.cos(a) * Math.sin(tilt) * dy, y + Math.cos(tilt) * dy, z + Math.sin(a) * Math.sin(tilt) * dy, 0, 0, 0, s).multiply(new THREE.Matrix4().makeRotationAxis(_bp.set(-Math.sin(a), 0, Math.cos(a)).normalize(), -tilt));
    const spin = a * 3.1;
    g.sphere(0x9e1c4a, x + Math.cos(a) * Math.sin(tilt) * 0.009, y + Math.cos(tilt) * 0.009, z + Math.sin(a) * Math.sin(tilt) * 0.009, 0.016, 0.021, 0.016, 0, 0, 0, 8);
    g.add(petalCup(0.012, 0.018, 0.2), 0xc23a66, m(-0.002).multiply(new THREE.Matrix4().makeRotationY(spin)));
    g.add(petalCup(0.017, 0.016, 0.45), 0xd04c76, m(-0.004).multiply(new THREE.Matrix4().makeRotationY(spin + 0.6)));
    g.add(petalCup(0.022, 0.013, 0.8), 0xa8305a, m(-0.006).multiply(new THREE.Matrix4().makeRotationY(spin + 1.3)));
  }
  // the paper: a cone, its rim crumpled and cut low at the front, high at the back. The front is -z:
  // lying on the grave (tipped forwards about x) and in Ove's hands it is the side that faces up.
  g.add(sheet(4, 24, (u, v) => {
    const th = v * Math.PI * 2, front = -Math.sin(th);   // +1 at the front (-z)
    const rim = 0.185 + 0.035 * -front + 0.006 * Math.sin(7 * th + 0.5);
    const r = 0.066 * (1 + 0.07 * Math.sin(5 * th + 1) + 0.04 * Math.sin(11 * th)) * u * (1 + 0.22 * u ** 3);
    return [Math.cos(th) * r, u * rim + 0.004 * Math.sin(9 * th) * u ** 2, Math.sin(th) * r];
  }), 0xd6c6a6, null);
  // a ribbon round the waist
  g.add(sheet(1, 16, (u, v) => { const th = v * Math.PI * 2, r = 0.0175 + 0.0015; return [Math.cos(th) * r, 0.05 + u * 0.012, Math.sin(th) * r]; }), 0x9a1e46, null);
}

function itemGeo(kind) {
  const g = new GeoBuilder();
  switch (kind) {
    case 'key': // a spare key on a ring with a red plastic tag
      g.use('metal').cyl(0xb8a46a, 0, 0, 0, 0.03, 0.008, 16, Math.PI / 2);
      g.box(0xb8a46a, 0.07, 0, 0, 0.09, 0.022, 0.006);
      g.box(0xb8a46a, 0.1, -0.012, 0, 0.012, 0.012, 0.006);
      g.use('plastic').box(0x9a1c18, -0.07, -0.01, 0, 0.07, 0.04, 0.01);
      break;
    case 'phone':
      g.use('plastic').box(0x16181a, 0, 0, 0, 0.075, 0.155, 0.009);
      g.use('chrome').box(0x2a3038, 0, 0.002, 0.0048, 0.068, 0.142, 0.001);
      break;
    case 'wrench': // elementnyckel: a little brass radiator key
      g.use('metal').cyl(0xc8a050, 0, 0, 0, 0.012, 0.07, 10);
      g.box(0xc8a050, 0, 0.04, 0, 0.06, 0.012, 0.01);
      break;
    case 'flowers': // pink roses in florist's paper (Sonja liked pink): see bouquet()
      bouquet(g);
      break;
    default: // 'papers': a brown document folder with white sheets
      g.use('fabric').box(0x6a4a2a, 0, 0, 0, 0.32, 0.23, 0.03);
      g.use('painted').box(0xf0ece2, 0.01, 0.01, 0.017, 0.28, 0.2, 0.006);
      break;
  }
  return g.build();
}

// kind: 'emblem' | 'photo' | 'record' (legacy name for 'papers') | item kinds 'key' |
// 'phone' | 'wrench' | 'papers' | 'flowers'. opts: { scale, beam, static (the holder never moves:
// Ove's emblems and photographs) }.
export class Collectible {
  constructor(scene, kind, id, x, y, z, opts = {}) {
    this.kind = kind; this.id = id; this.x = x; this.y = y; this.z = z;
    this.alive = true;
    this.scene = scene;
    const k = kind === 'record' ? 'papers' : kind;
    if (k === 'emblem') this.inner = realMesh(geoCache.emblem ??= emblemGeo(), { snow: false });
    else if (k === 'photo') this.inner = photoMesh();
    else { this.inner = realMesh(geoCache[k] ??= itemGeo(k), { snow: false }); this.inner.scale.setScalar(opts.scale ?? 1.7); }
    // `mesh` is the holder: its position is the item's (old callers read mesh.position).
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);
    this.mesh.add(this.inner);
    if (opts.beam !== false) addBeam(this.mesh, k === 'emblem' || k === 'photo' ? 4.5 : 3.2, 0.18);
    if (opts.static) { this.mesh.updateMatrix(); this.mesh.matrixAutoUpdate = false; }
    scene.add(this.mesh);
    this.ph = Math.random() * 6;
  }
  // cam: the camera position (optional). Beyond CULL m the item itself isn't drawn (the 14 emblems
  // and photos were 15-53 draw calls in the main pass); its shaft of light keeps it findable.
  tick(t, cam = null) {
    if (!this.alive) return;
    const inner = this.inner;
    if (cam) {
      const near = (this.x - cam.x) ** 2 + (this.z - cam.z) ** 2 < CULL * CULL;
      if (near !== inner.visible) { inner.visible = near; inner.matrixAutoUpdate = near; }
      if (!near) return;
    }
    inner.rotation.y = t * 0.9 + this.ph;
    inner.position.y = Math.sin(t * 1.6 + this.ph) * 0.03;
  }
  remove() {
    this.alive = false;
    this.mesh.visible = false;
  }
  dispose() { this.remove(); this.scene.remove(this.mesh); }
}
