// Pedestrians stroll the sidewalk loops around blocks at a November pace, sometimes cross the
// street, step smartly out of the way of speeding cars, and say what they think when they don't
// make it. (What they say is in game/script.js: PANIC here, OUCH and the others in main.js.)

import { Character } from './character.js';
import { randomPed } from './models.js';
import { pedLoops } from '../world/town.js';
import { N } from '../world/layout.js';
import { PANIC } from '../game/script.js';
import { mulberry32, pick, yawTo } from '../util.js';

const r = mulberry32(99);

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

  // Put somewhere new (a carjack sets the car's driver down by its door, wherever it stood): walk on
  // from the nearest point of the nearest sidewalk loop (briskly, like a crossing), then on round that
  // loop. The old loop's next corner was usually across town, and a straight walk there pressed them
  // into hedges and walls for the rest of the session. (main.js lets them out on the car's side that
  // faces that sidewalk, so the car itself isn't in the way.)
  rehome() {
    const c = this.char, w = nearestSidewalk(c.x, c.z);
    if (!w) return;
    const n = w.loop.pts.length;
    this.loop = w.loop;
    // nextTarget() at the sidewalk goes on to the corner ahead in our direction
    this.k = this.dir > 0 ? w.k : (w.k + 1) % n;
    this.target = [w.x, w.z];
    this.crossing = true;
    this.panicT = 0;
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
    // honked at (game/horn.js): the fright, a leap out of the way, a word about it
    if (c.honk && game.horn?.drive(c, dt, this)) return;
    if (this.idleT > 0) { this.idleT -= dt; c.wishX = c.wishZ = 0; return; }
    // Step quickly aside from a fast car heading at us (no cartoon leaps).
    if (this.panicT <= 0) {
      const threat = game.carThreat(c.x, c.z);
      if (threat) {
        this.panicT = 1.2;
        c.wishX = threat.dx * 5.2; c.wishZ = threat.dz * 5.2;
        c.vx = c.wishX * 0.7; c.vz = c.wishZ * 0.7;
        if (r() < 0.45) game.say(c, pick(PANIC), 1.3);
        // (the passengers of the bus Ove drives saw it too: game/buss.js)
        if (threat.car === game.playerCar) game.buss?.onHit(threat.car, 'near');
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

// The nearest point of any sidewalk loop to (x, z): { loop, k (the edge pts[k] -> pts[k + 1]), x, z }.
export function nearestSidewalk(x, z) {
  let best = null, bd = Infinity;
  for (const L of pedLoops) {
    const n = L.pts.length;
    for (let k = 0; k < n; k++) {
      const [ax, az] = L.pts[k], [qx, qz] = L.pts[(k + 1) % n];
      const ex = qx - ax, ez = qz - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { loop: L, k, x: px, z: pz }; }
    }
  }
  return best;
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
