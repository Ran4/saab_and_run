// The cold beyond the town (features/avgrunden.md). There are no invisible walls any more: Ove can
// walk or drive out past the forest belt onto the hills, where there is nothing but nature, and it is
// cold. From COLD (world/layout.js: 30 m beyond where the walls stood, the outer edge of the forest)
// a cold meter rises: 45 s from nothing to dead right at the edge, quicker further out (the rate goes
// with the square of the distance beyond it). Back inside it thaws again (twice as fast in a car with
// the heater on). It shows and sounds: the meter (hud.setCold), frost creeping in from the edges of
// the picture (hud.setFrost), Ove's breath, his shivering (hands in his pockets, chattering teeth),
// the wind, his heart at the end; and out there a blizzard: snow on the wind, the haze and the sky
// going white, the sun dimmed (beforeRender / afterRender, around the frame).
//
// At 100 % Ove dies of frost: he stiffens where he stands and topples over like a plank (in a car he
// just sits there, the engine dying), the frost takes the whole picture and "Ove dog av frost". Then
// black, the world is tidied up behind it (aftermath), and he wakes up in his own bed (game/waking.js)
// and is let out on the walkway outside his door.
//
// What a death does to the rest of the game (fair, and nothing left broken):
//   - the day's mission, if one was running, has failed ("Ove frös ihjäl."): its banner comes after he
//     wakes, with E (try again) and Q (give up) as after any failure;
//   - an errand or a call is dropped without blame (no Ordning lost), a smitare chase dropped;
//   - whoever walked or rode with him goes home, the cat he carried goes back where it came from;
//   - his car: a named one (the Saab, a neighbour's, its trailer with it) is back at home when he
//     wakes; a borrowed one stays out there (the traffic takes it away later);
//   - no kronor, no Ordning, the clock and the day as they were.
// game.cold: update(dt) (main.js, every frame), busy (dying or waking: the rest of the game holds),
// v (0..1), beforeRender() / afterRender(), musicDuck, engineOff.

import { THREE, scene, camera, sun } from '../gfx.js';
import { COLD, BOUND, edgeDist } from '../world/layout.js';
import { hud } from './hud.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { fx as FX } from './fx.js';
import { wakeScene } from './waking.js';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
// start: where it begins (m, square distance from the town's centre); edgeSecs: from nothing to dead
// right there; scale: m further out per step of the rate's square (70 m out: 4x, 11 s; 140 m: 9x,
// 5 s); thaw / thawCar: s from dead cold to warm again, on foot / in a car; whiteout: the distance
// at which the blizzard is at its worst.
export const COLDK = { start: COLD, edgeSecs: 45, scale: 70, thaw: 18, thawCar: 9, whiteout: COLD + 170 };
const rate = (d) => (1 / COLDK.edgeSecs) * (1 + (d - COLDK.start) / COLDK.scale) ** 2;

// The line under "Ove dog av frost" (shown, never said; one of these, not the same twice running).
const SUBS = [
  'Det var kallare än det såg ut.',
  'Han hade mössa. Det hjälpte inte.',
  'Här ute plogar ingen.',
  'Kommunen ansvarar inte för något bortom skogen.',
  'Termometern hade rätt. För en gångs skull.',
];
const SUBS_CAR = [
  'Kupévärmen räckte inte ända hit ut.',
  'Saaben startar i alla väder. Ove gör det inte.',
];
// What the meter says under its bar.
const NOTES = [[0.25, 'Kallt'], [0.5, 'Ove fryser'], [0.75, 'Ove känner inte tårna'], [2, 'Vänd om, Ove']];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const _v = new THREE.Vector3(), _c = new THREE.Color();
let lastSub = -1;
function pickSub(list) {
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && list === SUBS && i === lastSub) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  if (list === SUBS) lastSub = i;
  return list[i];
}
const skyDome = () => scene.children.find((o) => o.material?.uniforms?.uWhite);

export class Cold {
  constructor(g) {
    this.g = g;
    this.v = 0;            // the meter, 0..1 (1: frozen to death)
    this.d = 0;            // square distance of Ove (or his car) from the town's centre
    this.zone = 0;         // how wild the weather is where the camera is, 0..1
    this.frost = 0;        // frost on the picture (hud.setFrost)
    this.dying = null;     // the death and the waking, while they run
    this.deaths = 0;
    this.musicDuck = 1;
    this.engineOff = false;
    this.breathT = 1;
    this.chatterT = 2;
    this.heartT = 0;
    this.toldIn = false;   // the first-time toast (once a session)
    this.warned = false;   // the 'think of Sonja' toast (once an outing)
    this.wind = null;
    this.windIdle = 0;
    this.gust = 0;
    if (TEST) window.__cold = this;
  }

  // The rest of the game holds while Ove dies and wakes up (main.js: no missions, errands or patrol).
  get busy() { return !!this.dying; }

  update(dt) {
    const g = this.g, p = g.player, f = g.focus();
    const d = (this.d = edgeDist(f.x, f.z));
    if (this.dying) this.updateDeath(dt);
    else {
      // (not while Ove isn't his own: a scene, a cut, a failed mission waiting for E or Q)
      const ms = g.missions.state;
      const held = g.inDialog || g.freezeCar || ms === 'intro' || ms === 'outro' || ms === 'failed' || p.state === 'hidden';
      const out = d > COLDK.start;
      if (!held) {
        this.v = clamp(this.v + (out ? rate(d) : -1 / (g.playerCar ? COLDK.thawCar : COLDK.thaw)) * dt, 0, 1);
        if (this.v >= 1) { this.die(); }
      }
      this.rising = out && !held;
      if (out && !this.toldIn && !held) {
        this.toldIn = true;
        if (!TEST) hud.toast('<b>Kallt.</b> Kallare än det borde vara. Och ju längre ut, desto kallare. Vänd om i tid.', 'cold', 6500);
      }
      if (this.v > 0.62 && out && !this.warned) { this.warned = true; hud.toast('Ove tänker på Sonja. Hon hade sagt åt honom att vända.', 'cold', 5000); }
      if (this.v < 0.2) this.warned = false;
      if (!this.dying) this.frost = sstep(0.04, 1, this.v) * 1.05;
    }
    this.effects(dt, d);
    // the meter: out there, or while there is any cold left in him
    const show = !this.dying && (this.v > 0.003 || d > COLDK.start - 1);
    const v = this.v, note = this.rising ? NOTES.find(([k]) => v < k)[1] : v > 0.003 ? 'Det tinar' : '';
    hud.setCold(v, { show, temp: 8 + v * 40, note, warm: !this.rising && v > 0.003, danger: this.rising && v > 0.75 });
    hud.setFrost(this.frost);
  }

  // ----------------------------------------------------------------------------------------------
  // What the cold looks and sounds like (alive or dying).

  effects(dt, d) {
    const g = this.g, p = g.player, v = this.v, t = g.time;
    const cp = camera.position;
    // the weather where the camera is (it is the camera that sees it)
    const zone = (this.zone = sstep(BOUND - 26, COLDK.whiteout, Math.max(d, edgeDist(cp.x, cp.z))));
    // the wind blows in from the void, gusting (and the snow on it)
    this.gust = 0.6 + 0.25 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 1.13 + 1.7);
    const fx0 = this.g.focus(), ax = Math.abs(fx0.x) > Math.abs(fx0.z);
    const wx = ax ? -Math.sign(fx0.x) : 0.25 * Math.sin(t * 0.07), wz = ax ? 0.25 * Math.sin(t * 0.07) : -Math.sign(fx0.z);
    const ws = (3 + 10 * zone) * this.gust;
    FX.blizzard(zone > 0.01 ? Math.min(1, zone * 1.25) : 0, wx * ws, wz * ws, this.dying?.t > 6);
    // the music steps back out there, and further when it is bad
    this.musicDuck = this.dying ? 0.12 : 1 - 0.45 * zone - 0.35 * sstep(0.4, 1, v);
    // Ove: shivering with his hands in his pockets (from a little cold on), chattering teeth
    const alive = !this.dying || this.dying.t < 0.9;
    const shiver = alive ? sstep(0.06, 0.55, v) + (this.dying ? 0.4 : 0) : 0;
    p.anim.shiver = Math.min(1, shiver);
    const st = p.model.style;
    if (st) {
      if (v > 0.12 && !g.playerCar && alive && !st.pockets) { st.pockets = true; this.pockets = true; }
      else if (this.pockets && (v < 0.06 || g.playerCar || !alive)) { st.pockets = false; this.pockets = false; }
    }
    // his breath, in the cold air out there, or while he is cold
    const cold = Math.max(zone * 1.6, v);
    if (cold > 0.05 && alive && !g.playerCar && p.state === 'normal') {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = lerp(2.7, 1.5, v) * (0.85 + Math.random() * 0.3);
        this.exhale(Math.min(1, cold));
      }
    }
    // the sounds
    this.sounds(dt, zone, v, shiver);
  }

  // A breath out: three small puffs from his mouth, carried a little forward and off on the wind.
  exhale(k) {
    const p = this.g.player, head = (this._head ||= p.model.bones.find((b) => b.name === 'head'));
    if (!head) return;
    head.getWorldPosition(_v);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const x = _v.x + fx * 0.13, y = _v.y - 0.06, z = _v.z + fz * 0.13;
    for (let i = 0; i < 3; i++) setTimeout(() => FX.exhaust(x + fx * 0.04 * i, y - 0.01 * i, z + fz * 0.04 * i, fx * (1.6 + p.speed) + FX.windX * 0.25, fz * (1.6 + p.speed) + FX.windZ * 0.25, { alpha: 2.2 + 1.6 * k, size: 0.2 + 0.08 * k }), i * 110);
    if (k > 0.3) this.sfx('breath', k);
  }

  sounds(dt, zone, v, shiver) {
    // the wind: a loop while there is any of it (and a while after)
    if (zone > 0.01 || this.dying) {
      this.windIdle = 0;
      this.wind ||= this.sfx('wind');
      this.wind?.set(this.dying ? 0.2 : 0.18 * zone ** 0.8, this.gust, zone);
    } else if (this.wind && (this.windIdle += dt) > 3) { this.wind.stop(); this.wind = null; }
    else this.wind?.set(0, this.gust, 0);
    if (this.dying && this.dying.t > 5.6) { this.wind?.stop(); this.wind = null; }
    // teeth, in fits
    if (shiver > 0.35 && !this.g.playerCar && (!this.dying || this.dying.t < 0.9)) {
      this.chatterT -= dt;
      if (this.chatterT <= 0) { this.chatterT = lerp(3.4, 1.4, shiver) * (0.7 + Math.random() * 0.6); this.sfx('chatter', shiver); }
    }
    // his heart, slower and slower at the end
    if (v > 0.72 && (!this.dying || this.dying.t < 1.4)) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = lerp(0.85, 1.6, sstep(0.72, 1, v)); this.sfx('heart', sstep(0.7, 1, v)); }
    }
  }

  sfx(kind, a) { return audio.synth((A) => SOUNDS[kind](A, a)); }

  // Around the frame (main.js loop): the blizzard's haze (thicker and whiter), the sky white with it,
  // the sun dimmed behind the snow. Put back after the frame: dusk() and the rest see the real values.
  beforeRender() {
    const z = this.zone, dome = (this._dome ||= skyDome()), U = dome?.material.uniforms;
    if (U) U.uWhite.value = z;
    if (z < 0.002 || !scene.fog) { this._saved = null; return; }
    const fog = scene.fog, S = (this._saved ||= { sky: new THREE.Color() });
    S.d = fog.density; S.r = fog.color.r; S.g = fog.color.g; S.b = fog.color.b; S.sun = sun?.intensity;
    fog.density *= 1 + 11 * z * z;
    const L = fog.color.r * 0.2126 + fog.color.g * 0.7152 + fog.color.b * 0.0722;
    fog.color.lerp(_c.setRGB(L * 1.0, L * 1.06, L * 1.16), 0.75 * z);
    // (the sky's haze is a colour of its own: the same white)
    if (U) { S.sky.copy(U.uFog.value); U.uFog.value.lerp(fog.color, z); }
    if (sun) sun.intensity *= 1 - 0.6 * z;
  }
  afterRender() {
    const S = this._saved;
    if (!S || !scene.fog) return;
    scene.fog.density = S.d;
    scene.fog.color.setRGB(S.r, S.g, S.b);
    const U = this._dome?.material.uniforms;
    if (U) U.uFog.value.copy(S.sky);
    if (sun && S.sun != null) sun.intensity = S.sun;
    this._saved = null;
  }

  // ----------------------------------------------------------------------------------------------
  // Dying of frost, and waking up again.

  die() {
    const g = this.g, p = g.player, car = g.playerCar;
    this.v = 1;
    this.deaths++;
    this.dying = { t: 0, car, sub: pickSub(car ? SUBS_CAR : SUBS), crane: null };
    // Ove is nobody's any more: no input, no prompts, nothing said over it
    g.inDialog = true;
    p.cancelJump?.();
    p.wishX = p.wishZ = 0;
    g.patrol.cancelWriting?.('');
    hud.clearBubbles?.();
    hud.setPrompt('');
    hud.clearToasts?.();
    voice.hush();
    if (TEST) console.log('[t] cold: Ove died of frost at', g.focus().x.toFixed(1), g.focus().z.toFixed(1), car ? `in ${car.name || car.kind}` : 'on foot');
  }

  updateDeath(dt) {
    const g = this.g, p = g.player, D = this.dying;
    const t0 = D.t;
    D.t += dt;
    const t = D.t, at = (x) => t0 < x && t >= x;
    if (D.wake) {
      // Waking up (game/waking.js): it puts Ove at his door and lifts the curtain.
      if (D.wake.update(dt)) this.woken();
      return;
    }
    // the frost closes in (he still shows while he stiffens and goes over), then takes it all
    this.frost = 1.05 + 0.12 * sstep(0, 2.0, t) + 0.43 * sstep(2.4, 5.2, t);
    if (D.car) {
      // at the wheel: the car rolls to a stop (main.js brakes it while inDialog), the engine dies
      if (at(0.6)) { this.engineOff = true; this.sfx('stall'); }
      if (at(0.9)) this.sfx('freeze');
    } else {
      // on foot: he stops, stiffens where he stands, and goes over like a plank
      if (at(0.9) && (p.state === 'normal' || p.state === 'down')) {
        p.state = 'frozen'; p.vx = p.vz = p.vy = 0; p.topple = 0; D.side = Math.random() < 0.5 ? 1 : -1;
        this.sfx('freeze');
      }
      if (p.state === 'frozen' && t > 1.5) { const u = clamp((t - 1.5) / 0.6, 0, 1); p.topple = D.side * (Math.PI / 2 - 0.1) * u * u; }
      if (at(2.1) && p.state === 'frozen') {
        this.sfx('poff');
        audio.thud(1.1);
        const rx = -Math.cos(p.yaw) * D.side, rz = Math.sin(p.yaw) * D.side;   // the side he fell to
        for (const k of [0.5, 1.1, 1.6]) FX.dust(p.x + rx * k, p.z + rz * k, 5, p.y + 0.1);
        g.cam.shake = Math.min(1, g.cam.shake + 0.35);
      }
    }
    // The camera rises slowly and looks down at him in the snow.
    // (it follows a car still rolling to a stop)
    if (at(0.8)) {
      const f = g.focus(), cp = camera.position;
      D.crane = { dx: cp.x - f.x, y0: cp.y - f.y, dz: cp.z - f.z };
      g.cam.cine = { pos: cp.clone(), look: new THREE.Vector3(f.x, f.y + 0.8, f.z), cut: true, fov: camera.fov };
      g.cam.cineInfo = { kind: 'frost' }; g.cam.cineSubjects = [];
      hud.deathHud(true);
    }
    if (D.crane && g.cam.cine) {
      const C = D.crane, f = g.focus(), u = sstep(0.8, 5.4, t), l = Math.hypot(C.dx, C.dz) || 1;
      const back = lerp(l, Math.min(l, 5) * 0.55 + 1.5, u);
      g.cam.cine.pos.set(f.x + (C.dx / l) * back, f.y + lerp(C.y0, 9, u), f.z + (C.dz / l) * back);
      g.cam.cine.look.set(f.x, f.y + lerp(0.8, 0.2, u), f.z);
    }
    if (at(2.2)) { audio.jingle('fail'); hud.showBanner('Ove dog av frost', D.sub, 'frost', 0, `−${Math.round(48 + Math.random() * 3)} °C`); }
    if (at(5.4)) { hud.hideBanner(); hud.curtain(true, ''); hud.deathHud(false); }
    if (at(6.1)) { this.aftermath(); D.wake = wakeScene(g, { deaths: this.deaths }); }
  }

  // Behind the black: the world tidied up after him (see the top of the file).
  aftermath() {
    const g = this.g, p = g.player, ms = g.missions;
    if (ms.state === 'running') ms.fail('Ove frös ihjäl.', { later: true });
    g.interrupts.abort();
    g.patrol.dropPursuit?.();
    g.patrol.cancelWriting?.('');
    for (const ch of [...g.companions.keys()]) g.sendHome(ch);
    g.setCarrying(null);
    const car = g.playerCar;
    if (car) g.exitCar(true);
    if (car?.name) g.homeNamedCar(car.name);
    this.engineOff = false;
    p.state = 'normal'; p.topple = 0; p.anim.shiver = 0;
    if (this.pockets && p.model.style) { p.model.style.pockets = false; this.pockets = false; }
    p.root.rotation.set(0, p.yaw, 0);
    this.v = 0; this.frost = 0; this.rising = false; this.warned = false;
    FX.blizzard(0, 0, 0, true);
    voice.hush();
    g.cam.release();
    g.spawnPlayer();
  }

  // Awake and out on the walkway: the game is his again.
  woken() {
    const g = this.g;
    this.dying = null;
    g.inDialog = false;
    const ms = g.missions;
    if (ms.state === 'failed' && ms.failHeld) ms.showFailed();
    g.save();
    if (TEST) console.log('[t] cold: Ove woke up at his door');
  }
}

// ------------------------------------------------------------------------------------------------
// The cold's sounds (audio.synth's tools: osc(type, f, t, dur, peak, { to, attack, dest }),
// burst(t, dur, peak, f, filter, q, { dest, soft, attack, buf }), noise). Into the effects bus.

const rnd = (a, b) => a + Math.random() * (b - a);
const bus = (A, gain = 1, verb = 0.05) => { const o = A.ctx.createGain(); o.gain.value = gain; o.connect(A.sfx); A.verbSend?.(o, verb); return o; };
// (exported for tools: cold.mjs coldsound renders each offline and checks its level)
export const SOUNDS = {
  // The wind out there, kept running: a low roar and a whistling band over it, two decorrelated
  // noises. set(level, gust 0..1, whistle 0..1) eases to it; stop() fades it out.
  wind(A) {
    const { ctx } = A, t = A.now(), out = bus(A, 1, 0.02);
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(out);
    const s1 = ctx.createBufferSource(); s1.buffer = A.noise; s1.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 0.6;
    const s2 = ctx.createBufferSource(); s2.buffer = A.noise; s2.loop = true; s2.playbackRate.value = 0.81;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2.4;
    const wg = ctx.createGain(); wg.gain.value = 0.18;
    s1.connect(lp).connect(g);
    s2.connect(bp).connect(wg).connect(g);
    s1.start(t); s2.start(t, 0.73);
    let gone = false;
    return {
      set(level, gust = 0.6, whistle = 0) {
        if (gone) return;
        const tn = ctx.currentTime;
        g.gain.setTargetAtTime(Math.max(0.0001, level * (0.55 + 0.6 * gust)), tn, 0.3);
        lp.frequency.setTargetAtTime(220 + 320 * gust, tn, 0.35);
        bp.frequency.setTargetAtTime(650 + 700 * whistle * gust, tn, 0.5);
        wg.gain.setTargetAtTime(0.06 + 0.22 * whistle, tn, 0.5);
      },
      stop(fade = 0.6) {
        if (gone) return;
        gone = true;
        const tn = ctx.currentTime;
        g.gain.cancelScheduledValues(tn); g.gain.setTargetAtTime(0, tn, fade / 3);
        for (const s of [s1, s2]) { try { s.stop(tn + fade * 2); } catch (e) { /* stopped */ } }
      },
    };
  },
  // Chattering teeth: a quick run of small hard clicks (k: how cold)
  chatter(A, k = 0.6) {
    const t = A.now(), out = bus(A, 1, 0.02), n = 7 + Math.floor(k * 7);
    let tt = t;
    for (let i = 0; i < n; i++) {
      A.burst(tt, 0.007, rnd(0.05, 0.09) * (0.6 + 0.4 * k), rnd(2600, 3400), 'bandpass', 3, { dest: out });
      A.osc('sine', rnd(1700, 2100), tt, 0.012, 0.012, { dest: out });
      tt += rnd(0.055, 0.075);
    }
  },
  // A breath out in the cold: a soft, shaky 'hhhh'
  breath(A, k = 0.5) {
    const t = A.now(), out = bus(A, 1, 0.03);
    A.burst(t, 0.7, 0.022 + 0.02 * k, 1100, 'bandpass', 0.6, { dest: out, soft: true, attack: 0.18 });
    A.burst(t + 0.05, 0.5, 0.01 + 0.01 * k, 2600, 'bandpass', 0.8, { dest: out, soft: true, attack: 0.15 });
  },
  // His heart, lub-dub, low (k: how near the end)
  heart(A, k = 0.5) {
    const t = A.now(), out = bus(A, 1, 0.01), a = 0.13 + 0.09 * k;
    A.osc('sine', 58, t, 0.13, a, { to: 44, attack: 0.008, dest: out });
    A.osc('sine', 52, t + 0.19, 0.11, a * 0.7, { to: 40, attack: 0.008, dest: out });
  },
  // Freezing solid: ice crackling over him, a tight glassy creak
  freeze(A) {
    const t = A.now(), out = bus(A, 1, 0.12);
    for (let i = 0; i < 26; i++) {
      const tt = t + Math.pow(i / 26, 1.4) * 0.9;
      A.burst(tt, rnd(0.004, 0.012), rnd(0.04, 0.12), rnd(3200, 7500), 'bandpass', rnd(2, 5), { dest: out });
    }
    A.osc('sine', 2900, t + 0.1, 0.8, 0.012, { to: 3400, attack: 0.25, dest: out });
    A.osc('triangle', 180, t + 0.05, 0.5, 0.03, { to: 150, attack: 0.1, dest: out });
  },
  // A body going over into deep snow: a soft, heavy 'poff'
  poff(A) {
    const t = A.now(), out = bus(A, 1, 0.04);
    A.burst(t, 0.35, 0.22, 700, 'lowpass', 0.7, { dest: out, attack: 0.01 });
    A.burst(t + 0.02, 0.4, 0.06, 2200, 'bandpass', 0.6, { dest: out, soft: true, attack: 0.03 });
  },
  // The engine giving up in the cold: a cough, a sag, gone
  stall(A) {
    const t = A.now(), out = bus(A, 1, 0.04);
    A.osc('sawtooth', 62, t, 0.5, 0.05, { to: 28, attack: 0.02, dest: out });
    A.burst(t + 0.05, 0.12, 0.12, 380, 'lowpass', 0.9, { dest: out });
    A.burst(t + 0.32, 0.1, 0.08, 300, 'lowpass', 0.9, { dest: out });
  },
};
