import { buildCharacter, animateCharacter, LOD_DIST } from './models.js';
import { queryBlocks, circleVsBlock, groundAt, groundInfo, topAt, RAMP } from '../world/collision.js';
import { dampAngle, yawTo } from '../util.js';

export const STEP = 0.45;
const GRAV = 24;
const _blocks = [], _hit = {};

// A walking (or rolling) person with simple capsule physics. The model (models.js) is a skinned mesh
// per level of detail on one skeleton; everything about how it moves on screen lives in this.anim, which animateCharacter reads:
//   speed, air, vy, kick (1 -> 0), talk, wave, cheer, sprint, look (neck yaw), spin (air spin),
//   write (notebook + pencil), phone (phone at the ear), push (hands on a wheelchair/trolley),
//   yell, seated + driving (set from the car seat), flung / flungT, down / downLeft, carry, work +
//   workKind, listen, kneel (+ kneelReach).
export class Character {
  constructor(def, opts = {}) {
    this.def = def;
    // level of detail: the cast is lod 0 near and a far level beyond LOD_DIST.cast, pedestrians lod 1
    // and far beyond LOD_DIST.ped (three.js picks the level per render camera; see models.js)
    this.model = buildCharacter(def, { far: def.name === 'ped' ? LOD_DIST.ped : LOD_DIST.cast, ...(opts.model || {}) });
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
    this.anim = {
      speed: 0, air: false, vy: 0, kick: 0, talk: false, seated: false, driving: false, flung: false, down: false,
      t: Math.random() * 10, spin: 0, look: 0, wave: false, cheer: false, sprint: false,
      write: false, phone: false, push: false, yell: false, flungT: 0, downLeft: 0,
      carry: false, work: false, workKind: null,   // carrying (the cat) at chest height; hold-E jobs
      listen: false,                                 // listening to someone talking: small nods
      kneel: false, kneelReach: undefined,           // down on one knee (Sonja's grave): see models.js
    };
    this.car = null;
    this.spin = 0; this.spinRate = 0;
    this.height = this.model.height;
    this.floats = def.kind === 'wizard' || def.kind === 'ghost';
    // Rune does not get knocked out of his wheelchair; cars just shove him.
    this.invulnerable = this.wheelchair;
    this.solid = true;
    this.sync(0);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  teleport(x, z, yaw = this.yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = groundAt(x, z, 0.2, 0.6);
    this.vx = this.vz = this.vy = 0;
    this.onGround = true;
  }

  jump(v = 8.2) {
    if (this.state !== 'normal' || this.wheelchair) return false;
    this.vy = v;
    this.onGround = false;
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
    const accel = this.onGround ? 42 : 14;
    const dvx = this.wishX - this.vx, dvz = this.wishZ - this.vz;
    const dl = Math.hypot(dvx, dvz), maxD = accel * dt;
    if (dl > maxD) { this.vx += (dvx / dl) * maxD; this.vz += (dvz / dl) * maxD; } else { this.vx = this.wishX; this.vz = this.wishZ; }
    this.vy -= GRAV * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.collideWalls(false);
    let gh = groundAt(this.x, this.z, this.y, STEP);
    let gb = groundInfo.block;
    if (game) {
      const roof = game.carRoofAt(this.x, this.z, this.y + STEP);
      if (roof && roof.top > gh) { gh = roof.top; gb = null; this.standingOn = roof.car; } else this.standingOn = null;
    }
    if (this.y <= gh) {
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
    if (a.kick > 0) a.kick = Math.max(0, a.kick - dt * 3.2);
    animateCharacter(this.model, a, dt);
    if (this.state === 'seated') return;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.yaw, 0);
  }
}
