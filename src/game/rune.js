// Rune's fate (features/implemented/roligare_runeuppdrag.md). The errand "Rune har rullat iväg"
// (interruptions.js; stages.js escort with `mortal`) is a little sandbox now:
//   - his wheelchair rolls on by itself: Ove lets go of it with E (striding, Shift, it rolls a good
//     way on: ROLL.brisk; walking, hardly at all), or kicks it (ROLL.kick, along its own heading:
//     wheels don't go sideways); it slows on the snow and stops against whatever it meets;
//   - on the errand he can die: a car that comes at him at speed (as fast as one that knocks a
//     passer-by over), or the cold (stages.js: 5 minutes from the call, wherever he is; out past the
//     forest, COLD, much quicker - an old man sitting still in a blanket);
//   - dead, he slumps in his chair (a car tips it onto its side and it slides a few metres); the
//     errand fails with E (try again: he is alive and lost again) or Q (give up: he stays dead);
//   - from the moment he dies (also while E or Q is still to be chosen, and saved so) game.runeDead:
//     he is gone (main.js npcAway; his body stays until Ove has gone off), the errands that need or
//     mention him are no longer offered, and Anita grieves: her small talk (script.js WIDOW), a hand
//     over her eyes when nobody talks to her, her sobs as Ove goes by (now and then), her horn and
//     radio lines; the story's days 3, 6 and 7 go on without him (missions.js `widow`).
// game.rune: step(n, h) (main.js stepNpcs: true = it moved him this step), letGo(n), kick(n, fx, fz),
// hit(n, car, hit) (main.js carsVsPeople), kill(n, cause, car), revive(n), givenUp(), bury(n, near)
// and grief(n, dt, near) (main.js, the neighbours' frame loop: Rune; Anita).

import { groundAt } from '../world/collision.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { hud } from './hud.js';
import { fx as FX } from './fx.js';
import { RUNE_DIES, WIDOW, ERRANDS } from './script.js';
import { dist, pick, clamp } from '../util.js';

// The chair rolling free: decel (m/s² on the snow), let go of in Ove's stride (his speed along it,
// at least `strideMin`, times `brisk`: ~15 m on), walking (times `walk`: under a metre), kicked
// (`kick` m/s straight from behind, less from the side: ~8 m on), done below `min`.
export const ROLL = { decel: 0.85, brisk: 1.4, strideMin: 3.2, walk: 0.3, kick: 3.6, min: 0.05 };
// A car kills him at what knocks a passer-by over (main.js carsVsPeople): coming at him at more than
// carIn m/s, itself faster than speed m/s.
export const KILL = { carIn: 4.5, speed: 3 };
// Anita's sobs as Ove goes by: within `near` m, every `every` s or so (the first after `first`).
const SOB = { near: 14, every: [22, 38], first: [2, 5] };
const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

export class RuneFate {
  constructor(g) {
    this.g = g;
    this.sobT = 0;
    this.sobbing = 0;
    this.deaths = 0;
    if (TEST) window.__rune = this;
  }

  // ----------------------------------------------------------------------------------------------
  // The chair

  // main.js stepNpcs, for Rune: his body, or a chair rolling free. true: he is done with this step.
  step(n, h) {
    if (n.dead) { if (n.state !== 'hidden') this.body(n, h); return true; }
    const r = n.roll;
    if (!r) return false;
    if (n.state !== 'normal' || n.car || this.g.companions.get(n)?.push) { n.roll = null; n.anim.coast = false; return false; }
    const fx = Math.sin(n.yaw) * r.dir, fz = Math.cos(n.yaw) * r.dir;
    const v0 = r.v;
    r.v = Math.max(0, r.v - ROLL.decel * h);
    r.t += h;
    // (straight on: no turning towards the wish, no lag behind it)
    n.vx = fx * r.v; n.vz = fz * r.v;
    n.wishX = n.vx; n.wishZ = n.vz;
    const fw = n.faceWish;
    n.faceWish = false;
    n.step(h, this.g);
    n.faceWish = fw;
    // against something (a wall, a fence, a car's flank): it stops there, with a knock if it came fast
    const along = n.vx * fx + n.vz * fz;
    if (along < r.v * 0.5 - 0.05) {
      if (v0 > 1.6 && r.t > 0.1) { audio.thud(Math.min(0.8, v0 / 7)); FX.dust(n.x + fx * 0.4, n.z + fz * 0.4, 3, n.y + 0.2); }
      r.v = Math.max(0, along) * 0.3;
    }
    if (r.v < ROLL.min) { n.roll = null; n.anim.coast = false; n.vx = n.vz = 0; }
    return true;
  }

  roll(n, v, dir = 1) {
    if (!(v >= ROLL.min)) { n.roll = null; n.anim.coast = false; return; }
    n.roll = { v, dir, t: 0 };
    n.anim.coast = true;
    n.vx = Math.sin(n.yaw) * v * dir; n.vz = Math.cos(n.yaw) * v * dir;
  }

  // Ove lets go of the handles (stages.js escort, E): the chair keeps what it had of his speed, and
  // in his stride (Shift) he gives it a shove as his hands come off.
  letGo(n) {
    const g = this.g, p = g.player;
    g.removeCompanion(n);
    const v = Math.max(0, p.vx * Math.sin(n.yaw) + p.vz * Math.cos(n.yaw));
    const brisk = g.input?.down?.('sprint') && v > 1.5;
    this.roll(n, brisk ? Math.max(v, ROLL.strideMin) * ROLL.brisk : v * ROLL.walk);
    if (TEST) console.log('[t] rune: let go at', v.toFixed(2), 'm/s', brisk ? '(striding)' : '', '->', (n.roll?.v || 0).toFixed(2));
  }

  // Ove's boot against the chair (main.js kickHit): it rolls off along its own heading, forwards if
  // he kicked it from behind, backwards from in front; from the side it turns a little and rolls
  // less. false: not now (nobody's chair to kick: in a car, dead, held).
  kick(n, fx, fz) {
    if (n.dead || n.car || n.state !== 'normal' || n.offstage || this.g.companions.get(n)?.push) return false;
    const hx = Math.sin(n.yaw), hz = Math.cos(n.yaw), a = fx * hx + fz * hz, side = fx * hz - fz * hx;
    n.yaw += 0.35 * (1 - Math.abs(a)) * Math.sign(side);
    this.roll(n, ROLL.kick * Math.max(0.3, Math.abs(a)), a < 0 ? -1 : 1);
    return true;
  }

  // ----------------------------------------------------------------------------------------------
  // Death

  // A car at speed (main.js carsVsPeople, only while he is `mortal`: the errand): over he goes.
  hit(n, car, hit) {
    const g = this.g;
    this.kill(n, car === g.playerCar ? 'ove' : 'car', car);
    const d = n.dead;
    d.vx = car.vx * 0.7 + hit.nx * 2; d.vz = car.vz * 0.7 + hit.nz * 2;
    // over to the side the blow pushes him to (topple > 0 goes over to his local -x)
    const lat = d.vx * Math.cos(n.yaw) - d.vz * Math.sin(n.yaw);
    d.side = lat > 0 ? -1 : 1;
    n.x += hit.nx * hit.depth; n.z += hit.nz * hit.depth;
    car.vx *= 0.88; car.vz *= 0.88;
    const f = g.focus();
    if (dist(n.x, n.z, f.x, f.z) < 60) { audio.crash(0.45); audio.thud(1); }
    FX.dust(n.x, n.z, 6, n.y + 0.3);
    if (car === g.playerCar) g.cam.shake = Math.min(1, g.cam.shake + 0.3);
  }

  // cause: 'cold' | 'coldOut' (beyond the forest) | 'car' | 'ove' (Ove's own car).
  kill(n, cause, car = null) {
    if (n.dead) return;
    const g = this.g;
    g.removeCompanion(n);
    n.roll = null;
    n.state = 'frozen';
    n.vx = n.vz = n.vy = 0;
    n.dead = { cause, t: 0, vx: 0, vz: 0, side: 0, fell: false };
    n.topple = 0; n.toppleW = 0.32;
    Object.assign(n.anim, { slump: true, shiver: 0, coast: false, talk: false, mouth: null, listen: false, fright: false, fist: false });
    n.honk = null;
    g.runeDead = true;
    this.deaths++;
    if (cause === 'cold' || cause === 'coldOut') g.cold?.sfx?.('freeze');
    const p = g.player;
    if (dist(p.x, p.z, n.x, n.z) < 30) setTimeout(() => { if (g.runeDead && n.dead) g.say(g.player, RUNE_DIES[1], 2); }, 900);
    if (TEST) console.log('[t] rune: died', cause, 'at', n.x.toFixed(1), n.z.toFixed(1));
  }

  // The body: tips over (a car), slides to a stop on the snow, stays.
  body(n, h) {
    const d = n.dead;
    d.t += h;
    if (d.side) {
      const u = sstep(0, 0.5, d.t);
      n.topple = d.side * (Math.PI / 2 - 0.07) * u * u;
      if (!d.fell && d.t > 0.5) { d.fell = true; audio.thud(0.9); FX.dust(n.x, n.z, 5, n.y + 0.1); }
    }
    const sp = Math.hypot(d.vx, d.vz);
    if (sp > 0.02) {
      const k = Math.max(0, sp - 7 * h) / sp;
      d.vx *= k; d.vz *= k;
      n.x += d.vx * h; n.z += d.vz * h;
      n.vx = d.vx; n.vz = d.vz;
      n.collideWalls(true);
      d.vx = n.vx; d.vz = n.vz;
      n.vx = n.vz = 0;
    }
    n.y = groundAt(n.x, n.z, n.y + 0.4, 0.45);
  }

  // Alive again (the errand tried again: stages.js escort puts him somewhere new).
  revive(n = this.g.npc('rune')) {
    if (!n) return;
    const g = this.g;
    n.dead = null; n.roll = null;
    if (n.state === 'frozen' || n.state === 'hidden') n.state = 'normal';
    n.topple = 0; n.toppleW = 0;
    Object.assign(n.anim, { slump: false, shiver: 0, coast: false });
    if (n.model.w) n.model.w.slump = 0;
    n.root.rotation.set(0, n.yaw, 0);
    n.root.visible = !n.offstage;
    g.runeDead = false;
    const a = g.npc('anita');
    if (a) Object.assign(a.anim, { grief: false, sob: 0 });
  }

  // Ove gave the errand up after Rune died: so it stays (it was saved so the moment he died).
  givenUp() {
    const g = this.g;
    g.save();
    hud.toast('<b>Rune</b> är död. Anita är ensam nu.', 'bad', 7000);
    setTimeout(() => { if (g.runeDead) g.radio('anita', ERRANDS.rune.dead, { must: true, tag: 'widow' }); }, 1800);
    if (TEST) console.log('[t] rune: given up, dead for good');
  }

  // The body goes once nobody is there to see it (and it is not waiting for E or Q).
  bury(n, near) {
    if (!n.dead || n.state !== 'frozen' || this.g.interrupts.retry) return;
    if (near > 30 || (near > 8 && !this.g.onScreen(n.x, n.y + 0.8, n.z))) { n.state = 'hidden'; n.root.visible = false; }
  }

  // ----------------------------------------------------------------------------------------------
  // Anita without him

  // main.js's frame loop, for Anita (near: her distance from Ove): her hand over her eyes when nobody
  // talks to her, and now and then, as Ove goes by, a line through her tears.
  grief(n, dt, near) {
    const g = this.g, a = n.anim;
    if (!g.runeDead || n.state !== 'normal' || n.car || g.companions.has(n)) { if (a.grief) { a.grief = false; a.sob = 0; } return; }
    const u = voice.talking('anita');
    a.grief = !g.inDialog || !!u;
    a.sob = u && WIDOW.sobs.includes(u.text) ? 1 : this.sobbing > 0 ? 1 : 0.18;
    if (this.sobbing > 0) this.sobbing -= dt;
    if (near > SOB.near) { this.sobT = Math.max(this.sobT, SOB.first[0] + Math.random() * (SOB.first[1] - SOB.first[0])); return; }
    if (g.inDialog || g.missions.state === 'intro' || g.missions.state === 'outro') return;
    this.sobT -= dt;
    if (this.sobT > 0 || !voice.quiet() || g.time < (g.chatGlobalT || 0)) return;
    this.sobT = SOB.every[0] + Math.random() * (SOB.every[1] - SOB.every[0]);
    this.sobbing = 2.6;
    const line = pick(WIDOW.sobs);
    g.say(n, line, 2.6);
    g.chatGlobalT = Math.max(g.chatGlobalT || 0, g.time + 4);
    n.chatT = Math.max(n.chatT ?? 0, 8);
    if (TEST) console.log('[t] rune: Anita sobs', JSON.stringify(line));
  }
}
