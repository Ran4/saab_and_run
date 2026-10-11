import { buildCharacter, animateCharacter, LOD_DIST, CHARS } from './models.js';
import { THREE, camera, gfxStats } from '../gfx.js';
import { queryBlocks, circleVsBlock, groundAt, groundInfo, topAt, RAMP } from '../world/collision.js';
import { dampAngle, yawTo } from '../util.js';

export const STEP = 0.45;
const GRAV = 24;
// A grown man's jump (Ove is 59): a wind-up of `wind` s standing (`windRun` on the move) before he
// leaves the ground, a flight under `grav` (gentler than a fall, so the jump takes its time:
// ~0.56 s in the air for 0.55 m, against 0.45 s), and for `slow` s after the landing his legs take
// him on at no more than `slowMin` of the speed asked for, rising back to all of it.
export const JUMP = { wind: 0.22, windRun: 0.1, grav: 14, slow: 0.42, slowMin: 0.45 };
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _blocks = [], _hit = {};

// Animation level of detail (p4r2). Posing a person (animateCharacter) and updating the ~50
// matrices of their skeleton every frame cost ~0.5-1 ms for everybody in view of the 190 m ring, at
// any distance. So: visible people beyond ANIM_LOD.near (30 m) are posed every 2nd frame, people off
// screen beyond ANIM_LOD.off (12 m) and seated people in cars beyond 30 m every 4th, with the dt
// accumulated (the motion is the same, just sampled less often; who skips which frame is staggered).
// On a frame without a new pose the root's matrix update is skipped too (models.js gives the root
// an updateMatrixWorld that honours root._skipFrom), unless the person moved more than 2 cm (that
// angle beyond 30 m, twice it off screen) or turned since their matrices were last updated. Never
// skipped: Ove (or any
// Character with animLod = false), anyone within 12 m of the camera (every dialogue, cinematic and
// on-foot camera), a frame with dt = 0 (a snap), and the frame after a level-of-detail switch.
// ANIM_LOD.on = false turns it off (A/B measurements).
export const ANIM_LOD = { on: true, near: 30, off: 12 };
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere();
let lodFrame = -1, lodN = 0;
function viewFrustum() {
  // once per rendered frame: the camera as the last render saw it (people sync before the camera
  // moves this frame; the sphere's margin covers the difference)
  if (gfxStats.frames !== lodFrame) {
    lodFrame = gfxStats.frames;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
  }
  return _frustum;
}

// A walking (or rolling) person with simple capsule physics. The model (models.js) is a skinned mesh
// per level of detail on one skeleton; everything about how it moves on screen lives in this.anim, which animateCharacter reads:
//   speed, air, vy, kick (1 -> 0), talk, wave, cheer, sprint, look (neck yaw), spin (air spin),
//   write (notebook + pencil), phone (phone at the ear), push (hands on a wheelchair/trolley),
//   yell, seated + driving (set from the car seat), flung / flungT, down / downLeft, carry, work +
//   workKind, listen, kneel (+ kneelReach), fright / fist (the horn, game/horn.js), and a jump's
//   jumpWind / jumping / landT / jumpV (set here: see JUMP and jump()).
export class Character {
  constructor(def, opts = {}) {
    this.def = def;
    // level of detail: the cast is lod 0 near, a mid level beyond LOD_DIST.mid and a far level beyond
    // LOD_DIST.cast; pedestrians lod 1 and far beyond LOD_DIST.ped (three.js picks the level per
    // render camera; see models.js)
    const ped = def.name === 'ped';
    this.model = buildCharacter(def, { far: ped ? LOD_DIST.ped : LOD_DIST.cast, mid: ped ? 0 : LOD_DIST.mid, ...(opts.model || {}) });
    this.root = this.model.root;
    this.x = opts.x ?? 0; this.z = opts.z ?? 0; this.yaw = opts.yaw ?? 0;
    this.y = opts.y ?? groundAt(this.x, this.z, 0.2, 0.6);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.wheelchair = this.model.kind === 'wheelchair';
    this.r = this.model.radius ?? (def.kind === 'kid' ? 0.26 : 0.34);
    this.state = 'normal';   // normal | flung | down | seated | hidden
    this.onGround = true;
    this.timer = 0;
    this.downT = 0; this.flungT = 0;
    this.wishX = 0; this.wishZ = 0;
    this.faceWish = true;
    // a jump: winding up (windT >= 0), in the air (jumping), landed landT s ago
    this.windT = -1; this.windDur = JUMP.wind; this.jumpV = 0; this.jumping = false; this.landT = 9;
    this.anim = {
      speed: 0, air: false, vy: 0, kick: 0, talk: false, seated: false, driving: false, flung: false, down: false,
      mouth: null,                                     // while a voice clip plays: its loudness, 0..1 (voice.js)
      t: Math.random() * 10, spin: 0, look: 0, wave: false, cheer: false, sprint: false,
      write: false, phone: false, push: false, yell: false, flungT: 0, downLeft: 0,
      carry: false, work: false, workKind: null,   // carrying (the cat) at chest height; hold-E jobs
      listen: false,                                 // listening to someone talking: small nods
      kneel: false, kneelReach: undefined,           // down on one knee (Sonja's grave): see models.js
      jumpWind: 0, jumping: false, landT: 9, jumpV: 0, // a jump's wind-up (0..1), flight, landing (see JUMP)
      fright: false, fist: false,                      // the horn: hands up in fright, a fist shaken at it
    };
    this.car = null;
    this.spin = 0; this.spinRate = 0;
    this.height = this.model.height;
    this.floats = def.kind === 'wizard' || def.kind === 'ghost';
    // Rune does not get knocked out of his wheelchair; cars just shove him.
    this.invulnerable = this.wheelchair;
    this.solid = true;
    // animation level of detail (see ANIM_LOD): never for Ove
    this.animLod = def !== CHARS.ove;
    this.lodAcc = 0; this.lodN = lodN++ & 3; this.lodEvery = 1; this.lodLevel = -1; this.lodDist = 0; this.lodVis = true;
    this.sync(0);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  teleport(x, z, yaw = this.yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = groundAt(x, z, 0.2, 0.6);
    this.vx = this.vz = this.vy = 0;
    this.onGround = true;
    this.windT = -1; this.jumping = false; this.landT = 9;
  }

  // Starts a jump: the wind-up first, then the push off the ground at v m/s (game.onJump), the
  // landing (game.onJumpLand). False if he can't (busy, in the air, already winding up).
  jump(v = 8.2) {
    if (this.state !== 'normal' || this.wheelchair || this.windT >= 0 || this.jumping || !this.onGround) return false;
    this.windT = 0; this.jumpV = v;
    this.windDur = lerp(JUMP.wind, JUMP.windRun, Math.min(1, this.speed / 3));
    return true;
  }

  // Knocked over by a car: thrown along (vx, vz), falls over backwards (facing what hit them),
  // turns a little in the air, lands on the back, lies there, gets up.
  fling(vx, vy, vz) {
    if (this.state === 'seated' || this.state === 'hidden' || this.invulnerable) return false;
    this.state = 'flung';
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.onGround = false;
    if (Math.hypot(vx, vz) > 0.5) this.yaw = yawTo(-vx, -vz);
    this.spinRate = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4);
    this.bounces = 0;
    this.windT = -1; this.jumping = false; this.landT = 9;
    this.flungT = 0;
    return true;
  }

  step(dt, game) {
    if (this.state === 'seated' || this.state === 'hidden') return;
    if (this.state === 'down') {
      this.timer -= dt;
      this.downT += dt;
      if (this.timer <= 0) { this.state = 'normal'; this.spin = 0; game?.onGetUp(this); }
      return;
    }
    if (this.state === 'flung') {
      this.flungT += dt;
      this.vy -= GRAV * dt;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
      this.yaw += this.spinRate * dt;
      this.collideWalls(true);
      const gh = groundAt(this.x, this.z, this.y, 0.3);
      if (this.y <= gh && this.vy < 0) {
        this.y = gh;
        if (this.bounces < 1 && -this.vy > 5) {
          this.vy = -this.vy * 0.25; this.vx *= 0.45; this.vz *= 0.45; this.bounces++;
          this.spinRate *= 0.4;
          game?.onBodyBounce(this);
        } else {
          // lie still for a while, then ~1.3 s of getting up (the model animates it)
          this.state = 'down'; this.timer = 2.6 + Math.random() * 0.8; this.downT = 0;
          this.vx = this.vz = this.vy = 0;
        }
      }
      return;
    }
    if (this.windT >= 0) {
      this.windT += dt;
      if (this.windT >= this.windDur) {
        this.windT = -1;
        if (this.onGround) { this.vy = this.jumpV; this.onGround = false; this.jumping = true; game?.onJump?.(this); }
      }
    }
    if (this.landT < 9) this.landT += dt;
    const slow = this.landT < JUMP.slow ? lerp(JUMP.slowMin, 1, sstep(0, JUMP.slow, this.landT)) : 1;
    const accel = this.onGround ? 42 : 14;
    const dvx = this.wishX * slow - this.vx, dvz = this.wishZ * slow - this.vz;
    const dl = Math.hypot(dvx, dvz), maxD = accel * dt;
    if (dl > maxD) { this.vx += (dvx / dl) * maxD; this.vz += (dvz / dl) * maxD; } else { this.vx = this.wishX; this.vz = this.wishZ; }
    this.vy -= (this.jumping ? JUMP.grav : GRAV) * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.collideWalls(false);
    let gh = groundAt(this.x, this.z, this.y, STEP);
    let gb = groundInfo.block;
    if (game) {
      const roof = game.carRoofAt(this.x, this.z, this.y + STEP);
      if (roof && roof.top > gh) { gh = roof.top; gb = null; this.standingOn = roof.car; } else this.standingOn = null;
    }
    if (this.y <= gh) {
      if (this.jumping) { this.jumping = false; this.landT = 0; game?.onJumpLand?.(this, -this.vy); }
      if (!this.onGround && this.vy < -6) { this.model.squash = 0.5; game?.onLand(this, -this.vy); }
      this.y = gh;
      this.vy = 0;
      this.onGround = true;
      if (gb && gb.kind === 'bounce' && !this.wheelchair) {
        this.vy = 15.5; this.onGround = false;
        this.model.squash = 0.6;
        game?.onBounce(this);
      }
    } else if (this.onGround && this.y - gh < 0.3 && this.vy <= 0) {
      this.y = gh; this.vy = 0;
    } else {
      this.onGround = false;
    }
    if (this.standingOn && this.onGround) {
      this.x += this.standingOn.vx * dt; this.z += this.standingOn.vz * dt;
    }
    if (this.faceWish && Math.hypot(this.wishX, this.wishZ) > 0.5) this.yaw = dampAngle(this.yaw, yawTo(this.wishX, this.wishZ), this.wheelchair ? 5 : 12, dt);
  }

  collideWalls(bouncy) {
    const r = this.r;
    const list = queryBlocks(this.x - r, this.z - r, this.x + r, this.z + r, _blocks);
    for (const b of list) {
      const top = b.shape === RAMP ? topAt(b, this.x, this.z) : b.top;
      if (top <= this.y + STEP) continue;
      if (!circleVsBlock(this.x, this.z, r, b, _hit)) continue;
      this.x += _hit.nx * _hit.depth;
      this.z += _hit.nz * _hit.depth;
      const vn = this.vx * _hit.nx + this.vz * _hit.nz;
      if (vn < 0) {
        const k = bouncy ? 1.3 : 1;
        this.vx -= _hit.nx * vn * k; this.vz -= _hit.nz * vn * k;
      }
    }
  }

  // How often this person is posed (1 = every frame, 2, 4), from the camera's distance and view.
  animStride(dt) {
    if (!(dt > 0) || !ANIM_LOD.on || !this.animLod || !camera) return 1;
    const lv = this.model.lodNode ? this.model.lodNode.getCurrentLevel() : 0;
    if (lv !== this.lodLevel) { this.lodLevel = lv; return 1; }
    const seated = this.state === 'seated' && this.car;
    const x = seated ? this.car.x : this.x, z = seated ? this.car.z : this.z, y = seated ? (this.car.y ?? this.y) : this.y;
    const cp = camera.position, d2 = (x - cp.x) ** 2 + (z - cp.z) ** 2 + (y + 1 - cp.y) ** 2;
    const near = ANIM_LOD.near, off = ANIM_LOD.off;
    this.lodDist = Math.sqrt(d2);
    if (d2 < off * off) return 1;
    this.lodVis = false;
    if (!this.root.visible) return 4;
    _sph.center.set(x, y + this.height * 0.5, z);
    _sph.radius = this.height * 0.75 + 0.6;
    if (!viewFrustum().intersectsSphere(_sph)) return 4;
    this.lodVis = true;
    if (d2 < near * near) return 1;
    return seated ? 4 : 2;
  }

  sync(dt) {
    const a = this.anim;
    a.t += dt;
    a.speed = this.state === 'normal' ? Math.hypot(this.vx, this.vz) : 0;
    a.air = !this.onGround && this.state === 'normal';
    a.vy = this.vy;
    a.flung = this.state === 'flung';
    a.flungT = this.flungT;
    a.down = this.state === 'down';
    a.downLeft = this.state === 'down' ? this.timer : 0;
    a.seated = this.state === 'seated';
    a.driving = a.seated && !!this.car && this.car.driver === this;
    a.jumpWind = this.windT >= 0 ? Math.min(1, this.windT / this.windDur) : 0;
    a.jumping = this.jumping && this.state === 'normal';
    a.landT = this.state === 'normal' ? this.landT : 9;
    a.jumpV = this.jumpV;
    if (a.kick > 0) a.kick = Math.max(0, a.kick - dt * 3.2);
    // animation level of detail: pose every k-th frame with the accumulated dt
    const k = this.animStride(dt);
    this.lodEvery = k;
    this.lodAcc += dt;
    const posed = k === 1 || ++this.lodN >= k;
    if (posed) { animateCharacter(this.model, a, this.lodAcc); this.lodAcc = 0; this.lodN = 0; }
    const r = this.root;
    if (this.state === 'seated') { r._skipFrom = null; return; }
    r.position.set(this.x, this.y, this.z);
    r.rotation.set(0, this.yaw, 0);
    // no new pose: skip the skeleton's matrices as well while the root is still where they were
    // last computed (its parent is the scene, so its world matrix is position + yaw)
    // (2 cm at 30 m, the same angle further out: ~1 px; twice that off screen)
    let skip = false;
    if (!posed && r.parent && r.parent.isScene) {
      const tl = 0.02 * Math.max(1, this.lodDist / ANIM_LOD.near) * (this.lodVis ? 1 : 2), tol = tl * tl;
      const e = r.matrixWorld.elements;
      const dx = e[12] - this.x, dy = e[13] - this.y, dz = e[14] - this.z;
      skip = dx * dx + dy * dy + dz * dz < tol && Math.abs(e[8] - Math.sin(this.yaw)) < 0.01 && Math.abs(e[0] - Math.cos(this.yaw)) < 0.01;
    }
    r._skipFrom = skip ? r.parent : null;
  }
}
