// Pedestrians stroll the sidewalk loops around blocks at a November pace, sometimes cross the
// street, step smartly out of the way of speeding cars, and say what they think when they don't
// make it.

import { Character } from './character.js';
import { randomPed } from './models.js';
import { pedLoops } from '../world/town.js';
import { N } from '../world/layout.js';
import { mulberry32, pick, yawTo } from '../util.js';

const r = mulberry32(99);
export const PANIC = ['Oj!', 'Se upp!', 'Hallå!', 'Sakta ner!', 'Men herregud!', 'Kör som folk!'];

export class Ped {
  constructor(scene, loop) {
    this.char = new Character(randomPed(r));
    this.loop = loop;
    const k0 = (r() * 4) | 0;
    this.dir = r() < 0.5 ? 1 : -1;
    const t = r();
    const [ax, az] = loop.pts[k0], [bx, bz] = loop.pts[(k0 + 1) % 4];
    this.char.teleport(ax + (bx - ax) * t, az + (bz - az) * t);
    // Strolling pace; pensioners (stooped, shorter steps in their style) a little slower.
    const old = (this.char.def.age || 40) >= 65;
    this.walk = (old ? 0.95 : 1.2) + r() * 0.5;
    this.k = this.dir > 0 ? (k0 + 1) % 4 : k0;   // index of the corner we're walking to
    this.target = loop.pts[this.k];
    this.panicT = 0;
    this.idleT = 0;
    this.crossing = false;
    scene.add(this.char.root);
  }

  nextTarget() {
    this.k = (this.k + this.dir + 4) % 4;
    this.target = this.loop.pts[this.k];
  }

  // At a corner, maybe cross to the neighbouring block's matching corner.
  maybeCross() {
    if (r() > 0.25) return false;
    const L = this.loop;
    const [x, z] = this.target;
    const cx = x < (L.pts[0][0] + L.pts[1][0]) / 2 ? -1 : 1, cz = z < (L.pts[0][1] + L.pts[2][1]) / 2 ? -1 : 1;
    const horizontal = r() < 0.5;
    const ni = L.i + (horizontal ? cx : 0), nj = L.j + (horizontal ? 0 : cz);
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return false;
    const nl = pedLoops.find((p) => p.i === ni && p.j === nj);
    if (!nl) return false;
    let best = 0, bd = Infinity;
    nl.pts.forEach(([px, pz], idx) => { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = idx; } });
    this.loop = nl;
    this.k = best;
    this.target = nl.pts[best];
    this.crossing = true;
    return true;
  }

  update(dt, game) {
    const c = this.char;
    if (c.state !== 'normal') { c.wishX = c.wishZ = 0; return; }
    if (this.idleT > 0) { this.idleT -= dt; c.wishX = c.wishZ = 0; return; }
    // Step quickly aside from a fast car heading at us (no cartoon leaps).
    if (this.panicT <= 0) {
      const threat = game.carThreat(c.x, c.z);
      if (threat) {
        this.panicT = 1.2;
        c.wishX = threat.dx * 5.2; c.wishZ = threat.dz * 5.2;
        c.vx = c.wishX * 0.7; c.vz = c.wishZ * 0.7;
        if (r() < 0.45) game.say(c, pick(PANIC), 1.3);
        return;
      }
    } else {
      this.panicT -= dt;
      if (this.panicT > 0.5) return;
    }
    const [tx, tz] = this.target;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.8) {
      if (this.crossing) this.crossing = false;
      else if (!this.maybeCross()) this.nextTarget();
      if (r() < 0.08) this.idleT = 2 + r() * 3;
      return;
    }
    const sp = this.crossing ? this.walk * 1.35 : this.walk;
    c.wishX = (dx / d) * sp; c.wishZ = (dz / d) * sp;
    c.yaw = yawTo(dx, dz);
  }
}

export function spawnPeds(scene, n) {
  const out = [];
  const loops = pedLoops.slice();
  for (let k = 0; k < n; k++) {
    const loop = loops[(r() * loops.length) | 0];
    out.push(new Ped(scene, loop));
  }
  return out;
}
