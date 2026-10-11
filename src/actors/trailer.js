// A kinematic single-axle box trailer (släpkärra) hitched to a car's tow ball.
//   car.attachTrailer(opts) -> car.trailer ; car.detachTrailer()
// The trailer turns about its hitch so that its axle never slides sideways:
//   dψt/dt = (hitch velocity · trailer's left) / L   (= v/L · sin(ψcar - ψtrailer) for a hitch
// on the rear axle), which is what makes reversing jackknife. The angle to the car is limited
// (the drawbar hits the bumper). Its box is pushed out of static solids by turning about the hitch,
// or, when that can't help, by shoving the car. Exposes x, z (box centre), yaw, len, wid.
// Up and down (feature snöhög): the axle has a vertical speed of its own. It follows the ground,
// flies off a snow hill's edge as the car does, and lands with a bounce or two (BOUNCE of the speed
// into the ground comes back while that is over BUMP m/s: game.onTrailerBounce); the box pivots
// about the tow ball (where the car's pitched body has it) to rest on the axle, no more than PMAX
// either way (the drawbar against the bumper: past that the car lifts the trailer or drags it down).

import { THREE, GeoBuilder, realMesh, MAT } from '../gfx.js';
import { queryBlocks, obbVsBlock, obbVsObb, groundAt, groundInfo, topAt, hillSlope, RAMP, HILL } from '../world/collision.js';
import { trackWheels, lightMaterial, randomPlate, claimPlate, releasePlate, allocPlate, freePlate, plateGeometry, CH } from './carmodels.js';

const DRAW = 1.05;     // hitch -> front of the box
const BOX = 2.5;       // box length
const HW = 0.7;        // box half width
const WR = 0.27, WW = 0.155, WX = 0.83;
const FLOOR = 0.5, WALL = 0.36;
const AXLE = DRAW + BOX * 0.5; // hitch -> axle
const JACK = 1.3;              // max |car yaw - trailer yaw| (rad, ~75°)
const TG = 15;                 // gravity in the air (car.js HOPP.grav)
const PMAX = 0.6, BOUNCE = 0.45, BUMP = 2;   // (bounces while the speed into the ground is over BUMP m/s)
const BALL = 0.47;             // the coupling's height above the ground under the wheels
const PR = Math.hypot(BALL, AXLE), P0 = Math.atan2(AXLE, BALL);
const _sl = { gx: 0, gz: 0 };

let model = null;
// The car shading's road-grime mask (car.js reads the attribute 'cgrime'): the lower box sides, the
// mudguards and the rear panel take the spray.
function trailerGrime(geo) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i), ny = nrm.getY(i);
    let m = Math.max(0, Math.min(1, (0.75 - y) / 0.4));
    if (ny < -0.35) m = 1; else if (ny > 0.55) m *= 0.15;
    out[i] = m;
  }
  geo.setAttribute('cgrime', new THREE.BufferAttribute(out, 1));
}
function trailerModel() {
  if (model) return model;
  const g = new GeoBuilder();
  // galvanised steel (round 2's pale galv read as white paint in the sun)
  const galv = 0x868a8c, dark = 0x2a2c2e;
  const z0 = -DRAW, z1 = -DRAW - BOX, zc = (z0 + z1) / 2;
  // drawbar: an A-frame from the coupling to the box
  g.use('metal');
  g.box(0x3a3c3e, 0, 0.47, -0.08, 0.1, 0.09, 0.22);                       // coupling head
  for (const sx of [1, -1]) {
    const dx = sx * 0.5, len = Math.hypot(dx, DRAW - 0.1);
    g.box(galv, dx / 2, 0.44, -0.1 - (DRAW - 0.1) / 2, 0.06, 0.07, len, Math.atan2(dx, DRAW - 0.1));
  }
  g.box(galv, 0, 0.44, -DRAW / 2 - 0.05, 0.06, 0.07, DRAW - 0.1);
  // floor, walls, top rails (galvanised steel), plywood floor
  g.box(galv, 0, FLOOR - 0.04, zc, HW * 2, 0.08, BOX);
  g.use('wood').box(0x9a7a52, 0, FLOOR + 0.005, zc, HW * 2 - 0.08, 0.02, BOX - 0.08);
  g.use('metal');
  for (const sx of [1, -1]) {
    g.box(galv, sx * (HW - 0.02), FLOOR + WALL / 2, zc, 0.03, WALL, BOX);
    g.box(galv, sx * (HW - 0.01), FLOOR + WALL + 0.02, zc, 0.05, 0.04, BOX + 0.02);
    for (let k = 0; k < 4; k++) g.box(galv, sx * (HW + 0.005), FLOOR + WALL / 2, z0 - 0.05 - k * (BOX - 0.1) / 3, 0.02, WALL, 0.04); // stakes
  }
  for (const z of [z0 + 0.015, z1 - 0.015]) {
    g.box(galv, 0, FLOOR + WALL / 2, z, HW * 2, WALL, 0.03);
    g.box(galv, 0, FLOOR + WALL + 0.02, z, HW * 2 + 0.02, 0.04, 0.05);
  }
  // axle beam, mudguards
  g.box(dark, 0, WR, -AXLE, WX * 2 - 0.1, 0.07, 0.07);
  g.use('plastic');
  for (const sx of [1, -1]) {
    g.box(0x18191a, sx * WX, WR * 2 + 0.06, -AXLE, WW + 0.08, 0.03, WR * 2.4);
    g.box(0x18191a, sx * WX, WR + 0.18, -AXLE + WR * 1.2, WW + 0.08, 0.3, 0.03, 0, 0.5);
    g.box(0x18191a, sx * WX, WR + 0.18, -AXLE - WR * 1.2, WW + 0.08, 0.3, 0.03, 0, -0.5);
  }
  // light bar at the back
  g.box(0x1a1b1c, 0, FLOOR - 0.06, z1 - 0.05, HW * 2 + 0.1, 0.1, 0.06);
  const body = g.build();
  trailerGrime(body);
  // lamps: tail (+ brake), indicators; built like a car's light geometry
  const pos = [], nrm = [], col = [], emi = [], chs = [], met = [], lq = [], pat = [], idx = [];
  // (lens face coordinates and pattern as carmodels' LightBuilder: 2 = ribbed rear lamp)
  const addBox = (x, y, z, w, h, d, ch, lens, emit, pt = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const lp = geo.attributes.position.clone();
    geo.translate(x, y, z);
    const p = geo.attributes.position, n = geo.attributes.normal, base = pos.length / 3;
    const lc = new THREE.Color(lens), ec = new THREE.Color(emit);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(lc.r, lc.g, lc.b); emi.push(ec.r, ec.g, ec.b); chs.push(ch); met.push(0.3); idx.push(base + i);
      const u = Math.max(-1, Math.min(1, (lp.getX(i) / w) * 2)), v = Math.max(-1, Math.min(1, (lp.getY(i) / h) * 2));
      lq.push(u * w / 2, v * h / 2, u, v); pat.push(pt);
    }
  };
  for (const sx of [1, -1]) {
    addBox(sx * (HW - 0.12), FLOOR - 0.06, z1 - 0.09, 0.16, 0.07, 0.03, CH.tail, 0x620605, 0xff0000, 2);
    addBox(sx * (HW - 0.01), FLOOR - 0.06, z1 - 0.09, 0.07, 0.07, 0.03, sx > 0 ? CH.indL : CH.indR, 0xb0560a, 0xff6000);
  }
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lights.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  lights.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lights.setAttribute('lemit', new THREE.Float32BufferAttribute(emi, 3));
  lights.setAttribute('lch', new THREE.Float32BufferAttribute(chs, 1));
  lights.setAttribute('lmet', new THREE.Float32BufferAttribute(met, 1));
  lights.setAttribute('lq', new THREE.Float32BufferAttribute(lq, 4));
  lights.setAttribute('lpat', new THREE.Float32BufferAttribute(pat, 1));
  lights.setIndex(idx);
  model = { body, lights, plates: [{ side: 'rear', pos: [0, FLOOR + 0.12, z1 - 0.03], dir: -1 }] };
  return model;
}

const _blocks = [], _hit = {}, _ch = {};
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export class Trailer {
  constructor(car, opts = {}) {
    this.car = car;
    this.len = BOX; this.wid = HW * 2; this.axleL = AXLE; this.drawbar = DRAW;
    this.radius = (DRAW + BOX) / 2 + 0.5;
    const m = trailerModel();
    this.root = new THREE.Group();
    this.body = realMesh(m.body, { snow: opts.snow ?? false });
    this.root.add(this.body);
    this.lightMat = lightMaterial();
    this.lights = new THREE.Mesh(m.lights, this.lightMat);
    this.lights.castShadow = false; this.lights.userData.noAO = true;
    this.root.add(this.lights);
    this.plate = opts.plate ? claimPlate(opts.plate) : randomPlate();
    this.plateMesh = null;
    this.wheelSpin = 0;
    this.yaw = car.yaw;
    this.x = 0; this.z = 0; this.y = car.y;
    this.hx = 0; this.hz = 0;          // hitch (world)
    this.hy = 0;                       // ... its height (the tow ball)
    this.ay = car.y; this.avy = 0;     // the ground contact under the axle (height), its vertical speed
    this.air = false; this.onHill = null; this.bounces = 0;
    this.pitch = 0;                    // + = the back up
    this.obb = { x: 0, z: 0, fx: 0, fz: 1, hx: HW + 0.05, hz: BOX / 2 };
    this.jackknifed = false;
    this.drift = Math.random() < 0.5 ? -1 : 1;
    this.reset();
    // follow the car into and out of the scene
    this._onAdd = () => { if (this.car.root.parent && !this.root.parent) this.car.root.parent.add(this.root); };
    this._onRemove = () => { if (this.root.parent) this.root.parent.remove(this.root); };
    car.root.addEventListener('added', this._onAdd);
    car.root.addEventListener('removed', this._onRemove);
    trackWheels(this);
    if (car.root.parent) { this._onAdd(); this.showPlate(true); }
  }

  hitchWorld() {
    const c = this.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), hz = c.model.hitch;
    return [c.x + fx * hz, c.z + fz * hz];
  }
  // Straight behind the car.
  reset() {
    const [hx, hz] = this.hitchWorld();
    this.hx = hx; this.hz = hz;
    this.yaw = this.car.yaw;
    this.updatePose();
    this.ay = this.y = groundAt(this.x, this.z, this.car.y + 0.3, 0.6);
    this.avy = 0; this.air = false; this.onHill = null; this.bounces = 0;
    this.hy = this.ballY(); this.pitch = 0;
  }
  // The tow ball's height: the car's body pitched and heaved on its springs (and by the slope).
  ballY() {
    const c = this.car, p = (c.groundPitch || 0) + (c._sus?.p || 0), hz = c.model.hitch;
    return c.y + (c._sus?.h || 0) + BALL * Math.cos(p) - hz * Math.sin(p);
  }
  updatePose() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), d = DRAW + BOX / 2;
    this.x = this.hx - fx * d; this.z = this.hz - fz * d;
    const o = this.obb;
    o.x = this.x; o.z = this.z; o.fx = fx; o.fz = fz;
  }

  step(dt, game) {
    const c = this.car;
    const [hx, hz] = this.hitchWorld();
    let vx = (hx - this.hx) / dt, vz = (hz - this.hz) / dt;
    if (Math.hypot(hx - this.hx, hz - this.hz) > 2) { this.reset(); return; } // teleported
    this.hx = hx; this.hz = hz;
    // the no-side-slip law about the hitch
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    this.yaw += ((vx * lx + vz * lz) / AXLE) * dt;
    // speed along the trailer for the wheels
    const fwd = vx * Math.sin(this.yaw) + vz * Math.cos(this.yaw);
    // road camber / play in the coupling: a slow drift, so even dead-straight reversing wanders off
    // like a real trailer (driving forward straightens it out again)
    this.yaw += this.drift * 0.004 * Math.abs(fwd) * dt;
    this.wheelSpin += (fwd * dt) / WR;
    // drawbar against the bumper
    let rel = wrap(c.yaw - this.yaw);
    this.jackknifed = Math.abs(rel) > JACK;
    if (this.jackknifed) {
      this.yaw = c.yaw - Math.sign(rel) * JACK;
      // the car can't keep folding it: it gets dragged/stopped
      c.w *= 0.5; c.vx *= 0.96; c.vz *= 0.96;
    }
    this.updatePose();
    this.stepUpDown(dt, game);
    this.collide(game);
  }

  stepUpDown(dt, game) {
    const c = this.car;
    // (x, z: the box centre, which is over the axle)
    const ga = groundAt(this.x, this.z, Math.max(this.ay, c.y) + 0.3, 0.6), gb = groundInfo.block, onHill = !!gb && gb.shape === HILL;
    if (this.air) {
      this.avy -= TG * dt; this.ay += this.avy * dt;
      if (this.ay <= ga) {
        let impact = -this.avy, vyOn = 0;
        if (onHill) {
          hillSlope(gb, this.x, this.z, _sl);
          const L = Math.hypot(1, _sl.gx, _sl.gz);
          impact = Math.max(0, -(this.avy - _sl.gx * c.vx - _sl.gz * c.vz) / L);
          vyOn = _sl.gx * c.vx + _sl.gz * c.vz;
        }
        this.ay = ga;
        if (impact > BUMP) game?.onTrailerBounce?.(this, impact);
        if (impact > BUMP && this.bounces < 3) {
          this.avy = vyOn + impact * BOUNCE; this.bounces++;
          this.yaw += (Math.random() - 0.5) * 0.08 * Math.min(1, impact / 6);   // it lands a little askew
        } else { this.air = false; this.avy = vyOn; this.bounces = 0; }
      }
    } else if (onHill || this.onHill) {
      const pred = this.ay + this.avy * dt - 0.5 * TG * dt * dt;
      if (ga < pred - 0.004) { this.air = true; this.ay = pred; this.avy -= TG * dt; }
      else { this.avy = Math.max(-20, Math.min(20, (ga - this.ay) / dt)); this.ay = ga; }
    } else {
      // (off a ledge: falls; onto a kerb: up it)
      if (ga < this.ay - 0.35) { this.air = true; this.avy = 0; } else { this.ay = ga; this.avy = 0; }
    }
    this.onHill = onHill && !this.air ? gb : null;
    // the drawbar: the box hangs on the tow ball
    const hy = this.hy = this.ballY();
    let th = Math.acos(Math.max(-1, Math.min(1, (hy - this.ay) / PR))) - P0;
    if (th < -PMAX) {
      // the car is above: it lifts the trailer by the drawbar
      this.ay = hy - PR * Math.cos(-PMAX + P0);
      if (this.ay > ga + 0.01) { this.air = true; this.avy = Math.max(this.avy, c.vy); }
      th = -PMAX;
    } else if (th > PMAX && this.ay > ga + 0.01) {
      // the car is below: it drags the trailer down after it
      this.ay = Math.max(ga, hy - PR * Math.cos(PMAX + P0));
      this.avy = Math.min(this.avy, c.vy);
      th = Math.acos(Math.max(-1, Math.min(1, (hy - this.ay) / PR))) - P0;
    }
    this.pitch = Math.max(-0.8, Math.min(0.8, th));
    this.y = this.ay;
  }

  collide(game) {
    const c = this.car, o = this.obb, r = this.radius;
    const list = queryBlocks(this.x - r, this.z - r, this.x + r, this.z + r, _blocks);
    for (let pass = 0; pass < 2; pass++) {
      for (const b of list) {
        const top = b.shape === RAMP ? topAt(b, this.x, this.z) : b.top;
        if (top <= this.y + 0.5) continue;
        if (!obbVsBlock(o, b, _hit)) continue;
        if (b.kind === 'prop' && game && Math.hypot(c.vx, c.vz) > (b.ref.def.minSpeed ?? 3)) { game.breakProp(b.ref, c.vx, c.vz, c); continue; }
        this.pushOut(_hit.nx, _hit.nz, Math.min(_hit.depth, 0.6), _hit.cx, _hit.cz);
      }
    }
    // other cars get shoved aside
    if (game?.cars) {
      for (const k of game.cars) {
        if (k === c || Math.abs(k.x - this.x) > r + k.radius || Math.abs(k.z - this.z) > r + k.radius) continue;
        if (!obbVsObb(o, k.obb, _ch)) continue;
        k.wake?.();
        const d = Math.min(_ch.depth, 0.5), share = c.mass / (c.mass + k.mass);
        k.x -= _ch.nx * d * share; k.z -= _ch.nz * d * share;
        const vn = (k.vx - c.vx) * _ch.nx + (k.vz - c.vz) * _ch.nz;
        if (vn > 0) { k.vx -= _ch.nx * vn * share; k.vz -= _ch.nz * vn * share; }
        k.updateObb();
        if (share < 1) this.pushOut(_ch.nx, _ch.nz, d * (1 - share), _ch.cx, _ch.cz);
      }
    }
  }
  // Move the box by depth along n: as far as possible by swinging about the hitch, the rest by
  // pushing the car (and taking its speed into the obstacle).
  pushOut(nx, nz, depth, cx, cz) {
    const rx = cx - this.hx, rz = cz - this.hz;
    const lever = rz * nx - rx * nz; // contact displacement along n per radian of yaw
    let done = 0;
    if (Math.abs(lever) > 0.25) {
      const dpsi = Math.max(-0.08, Math.min(0.08, depth / lever));
      this.yaw += dpsi;
      done = Math.abs(dpsi * lever);
    }
    const rest = depth - done;
    if (rest > 1e-4) {
      const c = this.car;
      c.x += nx * rest; c.z += nz * rest;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) { c.vx -= nx * vn; c.vz -= nz * vn; }
      c.updateObb();
      const [hx, hz] = this.hitchWorld();
      this.hx = hx; this.hz = hz;
    }
    this.updatePose();
  }

  // The model's origin is under the coupling at its ground: hang it on the tow ball, pitched.
  rootPose(v) {
    const sp = Math.sin(this.pitch);
    return v.set(this.hx - BALL * sp * Math.sin(this.yaw), this.hy - BALL * Math.cos(this.pitch), this.hz - BALL * sp * Math.cos(this.yaw));
  }
  sync(dt, t) {
    this.rootPose(this.root.position);
    this.root.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const a = this.car.lightMat?.userData.ch, b = this.lightMat.userData.ch;
    if (a) { b[CH.tail] = a[CH.tail]; b[CH.indL] = a[CH.indL]; b[CH.indR] = a[CH.indR]; b[CH.brake] = a[CH.brake]; }
    if (!this.body.userData.baseMaterial) this.body.userData.baseMaterial = this.body.material;
    this.body.material = this.car.dead ? MAT.burnt : this.body.userData.baseMaterial;
  }

  showPlate(on) {
    if (on && !this.plateMesh) {
      this.plateH = allocPlate(this.plate);
      this.plateMesh = new THREE.Mesh(plateGeometry(trailerModel().plates, this.plateH.slot), this.plateH.page.material);
      this.plateMesh.castShadow = false; this.plateMesh.userData.noAO = true;
      this.root.add(this.plateMesh);
    } else if (!on && this.plateMesh) {
      freePlate(this.plateH);
      this.plateMesh.geometry.dispose();
      this.root.remove(this.plateMesh);
      this.plateMesh = null;
    }
  }

  writeWheels(sink) {
    _m4.compose(this.rootPose(_v), _q.setFromEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ')), _s.set(1, 1, 1));
    for (const sx of [1, -1]) {
      _e.set(sx > 0 ? this.wheelSpin : -this.wheelSpin, sx > 0 ? 0 : Math.PI, 0, 'YXZ');
      _m4b.compose(_v.set(sx * WX, WR, -AXLE), _q.setFromEuler(_e), _s.set(WW, WR, WR));
      _m4b.premultiply(_m4);
      sink.put('van', _m4b, this.car.dead);
    }
  }

  detach() {
    this.car.root.removeEventListener('added', this._onAdd);
    this.car.root.removeEventListener('removed', this._onRemove);
    this.showPlate(false);
    if (this.root.parent) this.root.parent.remove(this.root);
    releasePlate(this.plate);
  }
  // Round 4 (Car.dispose): detach, and free the trailer's own lamp material and wheel tracking.
  dispose() {
    this.detach();
    this._wheelsOff?.();
    this.lightMat.dispose();
  }
}

function wrap(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
