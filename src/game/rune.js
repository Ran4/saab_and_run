// Rune's fate (features/implemented/roligare_runeuppdrag.md, rune_ar_permadod.md). The errand "Rune
// har rullat iväg" (interruptions.js; stages.js escort with `cold`) is a little sandbox:
//   - his wheelchair rolls on by itself: Ove lets go of it with E (striding, Shift, it rolls a good
//     way on: ROLL.brisk; walking, hardly at all), or kicks it (ROLL.kick, along its own heading:
//     wheels don't go sideways); it slows on the snow and stops against whatever it meets;
//   - he can die, anywhere and any day, errand or not: a car that comes at him faster than a slow
//     walk (KILL: Ove's own, backing a trailer at walking pace included; anybody else's at less, and
//     the traffic doesn't brake for him: main.js obstacleAhead), and on the errand the cold
//     (stages.js: 5 minutes from the call, wherever he is; out past the forest, COLD, much quicker);
//   - dead, he slumps in his chair (a car tips it onto its side and it slides a few metres), and it
//     is for good: no trying again. RUNE ÄR DÖD and the cause, saved at once (game.runeDead), the
//     errand (if he was on it) over; then the news, and Anita: a cry if she saw it, else her call;
//   - from then on he is gone (main.js npcAway; his body stays until Ove has gone off), the errands
//     that need or mention him are no longer offered, and Anita grieves: her small talk (script.js
//     WIDOW), a hand over her eyes when nobody talks to her, her sobs as Ove goes by (now and then),
//     her horn and radio lines; the story's days 3, 6 and 7 go on without him (missions.js `widow`).
// game.rune: step(n, h) (main.js stepNpcs: true = it moved him this step), letGo(n), kick(n, fx, fz),
// lethal(n, car, hit) and hit(n, car, hit) (main.js carsVsPeople), kill(n, cause, car), update(dt)
// (main.js: the news after a death), bury(n, near) and grief(n, dt, near) (main.js, the neighbours'
// frame loop: Rune; Anita); revive(n) for tests only (the game never brings him back).

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
// A car kills him (main.js carsVsPeople): closing on him at more than `in` m/s (the car's speed
// against him less his own roll: rolled into a car's flank counts too), the car itself faster than
// `speed` m/s. Ove's at a slow walk (backing Patrick's trailer is 2.2 m/s at most); anybody else's at
// less (a passer-by is knocked over at 4.5 / 3).
export const KILL = { ove: { in: 1.7, speed: 1.5 }, other: { in: 1.0, speed: 1.0 } };
// The banner's line under RUNE ÄR DÖD, by cause.
export const DEATH = { cold: 'Rune frös ihjäl.', coldOut: 'Rune frös ihjäl bortom skogen.', car: 'Rune blev påkörd.', ove: 'Ove körde över Rune.', oveBack: 'Ove backade över Rune.' };
// After he has died: the toast at `toast` s, Anita's cry (she saw it: within `seen` m) at `cry` s, or
// her call from `call` s on (once nobody else is talking).
const NEWS = { toast: 2.6, cry: 2.0, call: 4.4, seen: 25 };
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

  // A car against him (main.js carsVsPeople, its box or its trailer's; `hit` pushes out of it): is
  // it enough to kill him?
  lethal(n, car, hit) {
    const k = car === this.g.playerCar ? KILL.ove : KILL.other;
    return car.speed > k.speed && (car.vx - n.vx) * hit.nx + (car.vz - n.vz) * hit.nz > k.in;
  }

  // ...it is: over he goes.
  hit(n, car, hit) {
    const g = this.g, sp = car.speed;
    this.kill(n, car === g.playerCar ? (car.forwardSpeed < -0.3 ? 'oveBack' : 'ove') : 'car', car);
    const d = n.dead;
    d.vx = car.vx * 0.7 + hit.nx * 2; d.vz = car.vz * 0.7 + hit.nz * 2;
    // over to the side the blow pushes him to (topple > 0 goes over to his local -x)
    const lat = d.vx * Math.cos(n.yaw) - d.vz * Math.sin(n.yaw);
    d.side = lat > 0 ? -1 : 1;
    n.x += hit.nx * hit.depth; n.z += hit.nz * hit.depth;
    car.vx *= 0.88; car.vz *= 0.88;
    const f = g.focus();
    if (dist(n.x, n.z, f.x, f.z) < 60) { audio.crash(clamp(0.1 + sp * 0.03, 0.15, 0.45)); audio.thud(Math.min(1, 0.5 + sp * 0.08)); }
    FX.dust(n.x, n.z, 6, n.y + 0.3);
    if (car === g.playerCar) g.cam.shake = Math.min(1, g.cam.shake + 0.3);
  }

  // cause: 'cold' | 'coldOut' (beyond the forest) | 'car' | 'ove' / 'oveBack' (Ove's own car, backing).
  // For good: saved at once, the banner, the Ordning a failed errand costs; the errand he was on (if
  // any) fails by itself (stages.js escort, interruptions.js), and update() brings the news.
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
    g.save();
    g.patrol.addOrdning(-10);
    audio.jingle('fail');
    // (a failed day's banner, waiting for E or Q, stays: a toast instead)
    if (g.missions.state === 'failed') hud.toast(`<b>RUNE ÄR DÖD</b> · ${DEATH[cause] || DEATH.car}`, 'bad', 6000);
    else hud.showBanner('RUNE ÄR DÖD', DEATH[cause] || DEATH.car, 'bad', 4500, g.interrupts.active?.tpl.id === 'rune' ? 'Avbrott' : '');
    if (cause === 'cold' || cause === 'coldOut') g.cold?.sfx?.('freeze');
    const p = g.player, a = g.npc('anita');
    if (dist(p.x, p.z, n.x, n.z) < 30) setTimeout(() => { if (g.runeDead && n.dead) g.say(g.player, RUNE_DIES[1], 2); }, 900);
    // (Anita, if she was there to see it: at home by their door, he was killed in front of her)
    const seen = !!a && a.state === 'normal' && !a.car && !a.offstage && dist(a.x, a.z, n.x, n.z) < NEWS.seen;
    this.news = { t: 0, seen, toast: false, cried: false };
    // (her cry first: no sob of grief() before it)
    if (seen) this.sobT = Math.max(this.sobT, NEWS.cry + 8);
    if (TEST) console.log('[t] rune: died', cause, 'at', n.x.toFixed(1), n.z.toFixed(1), seen ? '(Anita saw it)' : '');
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

  // Alive again: for tests only (one page load, several deaths). The game never calls it.
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
    this.news = null;
    const a = g.npc('anita');
    if (a) Object.assign(a.anim, { grief: false, sob: 0 });
  }

  // main.js, every frame (not while Ove himself freezes to death): the news after he has died. A
  // toast; Anita, if she saw it, cries out (then grieves as ever); if not, she phones Ove once a call
  // fits ("De har hittat Rune."): not in a scene, nor over another call or voice.
  update(dt) {
    const w = this.news, g = this.g;
    if (!w) return;
    w.t += dt;
    if (!w.toast && w.t > NEWS.toast) { w.toast = true; hud.toast('<b>Rune</b> är död. Anita är ensam nu.', 'bad', 7000); }
    if (w.seen) {
      const a = g.npc('anita');
      if (!w.cried && w.t > NEWS.cry) { w.cried = true; if (a?.state === 'normal') { g.say(a, WIDOW.sobs[0], 2.4); this.sobT = Math.max(this.sobT, 9); } }
      if (w.toast && w.cried) this.news = null;
      return;
    }
    const ms = g.missions.state;
    if (w.t < NEWS.call || !w.toast || g.inDialog || ms === 'intro' || ms === 'outro' || g.interrupts.call || !voice.quiet()) return;
    this.news = null;
    if (g.runeDead) g.radio('anita', ERRANDS.rune.dead, { must: true, tag: 'widow' });
    if (TEST) console.log('[t] rune: Anita phones');
  }

  // The body goes once nobody is there to see it: Ove gone off, or (after a few seconds: time to turn
  // round and look) out of the picture.
  bury(n, near) {
    if (!n.dead || n.state !== 'frozen') return;
    if (near > 30 || (near > 8 && n.dead.t > 8 && !this.g.onScreen(n.x, n.y + 0.8, n.z))) { n.state = 'hidden'; n.root.visible = false; }
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
