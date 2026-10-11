// Ove wakes up in his own bed after freezing to death out beyond the forest (features/avgrunden.md,
// game/cold.js). Called behind the black that ends the death, with the real Ove already out at his
// door; update(dt) -> true once the picture is back on the walkway and the game is his again.
//   0.4   the curtain lifts: his bedroom on a grey winter morning, Ove asleep on his back on his half
//         of the double bed, the duvet to his chin, the alarm clock ticking. Her half made up, empty,
//         her pillow plumped; her photograph on her nightstand. (From day 4 the cat sits at the foot
//         of the bed and watches him.)
//   2.1   close on his face, eyes shut.
//   2.9   a gasp, and he sits bolt upright, the duvet thrown down to his waist (the cat starts).
//   3.4   from the foot of the bed: he looks across at her half of the bed.
//   4.6   he says one of WAKE (script.js: never the same one twice running), in the dialogue box.
//   then  a sigh, black, and out on the walkway at his door.
// Skippable like the game's other scenes (Space, E, Enter, a click, the pad's A or Y): straight to the
// black and out. The set is world/interior.js buildBedroom, built inside his real row house when the
// scene starts and gone when it ends (its window, the house's back window, shows his back garden: its
// panes are a mesh of their own that the scene hides). Ove is a puppet (models.js, posed here, no
// physics); the real one is off the stage meanwhile (main.js offstage: back as his state says after).
// ?test: window.__wake is the running scene; __wake.pauseAt = s holds it at s (tools: cold.mjs coldbed).

import { THREE, scene, GeoBuilder, realMesh } from '../gfx.js';
import { buildCharacter, animateCharacter, buildCat, CHARS } from '../actors/models.js';
import { buildBedroom, BED } from '../world/interior.js';
import { interiors } from '../world/data.js';
import { sonjaPhotoTexture } from '../actors/pickups.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { hud } from './hud.js';
import { WAKE } from './script.js';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
// The beats (s from the start, under the black); `say` on: the line, then `after` s to the black.
const T = { build: 0.05, open: 0.4, close1: 2.1, gasp: 2.9, foot: 3.4, look: 3.75, say: 4.6, after: 1.1 };
// Ove in bed: pale blue pyjamas buttoned to the neck, nothing on his head.
const OVE_BED = { ...CHARS.ove, coat: { type: 'cardigan', color: 0x9fb4c6, len: 0.4, buttonColor: 0xf2f0ea }, under: 0x9fb4c6, trousers: { type: 'slacks', color: 0x9fb4c6 }, shoes: { type: 'shoes', color: 0x4a4c54, sole: 0x4a4c54 }, gloves: null, scarf: null };
// Where he lies: his hips on his half (the door side), his head on his pillow; facing the foot.
const OVE = { x: (BED.mid + BED.x1) / 2 + 0.02, z: 5.66 };
const CAT = { x: BED.x0 + 0.42, z: BED.z1 - 0.32 };
// The shots: [from (s), camera, look at (a point, or [dy] below his head: it follows him up), fov,
// drift (the camera at the end of the shot)].
const SHOTS = [
  [0, [0.42, 2.02, 8.0], [1.85, 0.6, 5.2], 52, [0.56, 1.96, 7.7]],         // the room from the window corner
  [T.close1, [2.9, 1.66, 5.92], [0.06], 42, [2.88, 1.62, 5.86]],          // from his side: asleep, then up at us
  [T.foot, [1.92, 1.34, 7.62], [0.32], 46, [1.9, 1.33, 7.45]],             // from the foot: him, her half
  [T.say, [0.86, 1.46, 6.95], [0.12], 42, [0.9, 1.44, 6.82]],             // across her half of the bed
];

const _dn = new THREE.Vector3();
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
let lastLine = -1;
// One of the lines, not the one he said last time.
export function pickWake() {
  let i = Math.floor(Math.random() * WAKE.length);
  if (WAKE.length > 1 && i === lastLine) i = (i + 1 + Math.floor(Math.random() * (WAKE.length - 1))) % WAKE.length;
  lastLine = i;
  return WAKE[i];
}

export function wakeScene(g, o = {}) { return new WakeScene(g, o); }

class WakeScene {
  constructor(g, o) {
    this.g = g; this.o = o;
    this.t = 0; this.shotI = -1;
    this.line = o.line || pickWake();
    this.end = Infinity;   // set once the line is said
    if (TEST) window.__wake = this;
  }

  // -> true when it is over.
  update(dt) {
    const g = this.g;
    if (this.pauseAt != null) dt = Math.min(dt, Math.max(0, this.pauseAt - this.t));
    if (this.t > 0.9 && !this.closing && g.input.pressed('skip')) this.close(true);
    const t0 = this.t;
    this.t += dt;
    const t = this.t, at = (x) => t0 < x && t >= x;
    if (!this.built && t >= T.build) this.build();
    if (at(T.open)) hud.curtain(false);
    if (this.set && !this.closing) this.play(dt, t, at);
    if (this.closing) {
      const c = t - this.closeT;
      if (c >= 0.7 && this.set) this.teardown();
      if (c >= 0.75 && !this.lifted) { this.lifted = true; hud.curtain(false); }
      if (c >= 1.3) { this.dispose(); return true; }
    }
    return false;
  }

  // To black (now, or after the line), and out.
  close(skipped = false) {
    if (this.closing) return;
    this.closing = true; this.skipped = skipped;
    this.closeT = this.t;
    hud.curtain(true, '');
    this.ticking?.stop?.();
    // (a line being said stops: the dialogue box closes by itself a moment later)
    if (skipped) voice.hush();
  }

  // ----------------------------------------------------------------------------------------------
  // The set, the puppet, the props: at the first black.

  build() {
    this.built = true;
    const t0 = performance.now();
    const g = this.g, info = interiors.ove;
    if (!info?.ox && info?.ox !== 0) { this.close(); return; }
    const k = (this.set = buildBedroom(info, { photo: sonjaPhotoTexture(), clock: g.clockMin }));
    scene.add(k.root);
    this.W = (p) => new THREE.Vector3(...k.at(p[0], p[1], p[2]));
    // the window's panes (seen from inside they were a slab); the real Ove off the stage
    this.hidden = [];
    if (info.paneMesh) { this.hidden.push([info.paneMesh, info.paneMesh.visible]); info.paneMesh.visible = false; }
    g.offstage(g.player, true);
    // Ove in bed: lying on his back (models.js' downPose, held: st.downLeft), legs straight
    const m = buildCharacter(OVE_BED);
    scene.add(m.root);
    // (sunk into the mattress and the pillow a little: he is no plank any more)
    m.root.position.copy(this.W([OVE.x, BED.top - 0.09, OVE.z]));
    m.root.rotation.y = k.yaw(0);
    const bone = (name) => m.bones.find((b) => b.name === name);
    this.ove = {
      m, neck: bone('neck'), head: bone('head'), spine: bone('spine'), chest: bone('chest'),
      legs: ['thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL'].map(bone),
      arms: ['armR', 'foreR', 'armL', 'foreL'].map(bone),
      st: { speed: 0, air: false, vy: 0, kick: 0, talk: false, seated: false, driving: false, flung: false, down: true, downLeft: 9, mouth: null, t: Math.random() * 10, spin: 0, look: 0, wave: false, cheer: false, sprint: false, write: false, phone: false, push: false, yell: false, flungT: 0, carry: false, work: false, workKind: null, listen: false, kneel: false, jumpWind: 0, jumping: false, landT: 9, jumpV: 0, fright: false, fist: false, shiver: 0 },
    };
    // his duvet: a soft, rounded body from the foot of the bed up to his chin (a flattened cylinder
    // along the bed, its lower half in the mattress), and its folded top edge (both scaled to where it
    // lies now: up to his chin, then thrown down to his waist)
    const dg = new GeoBuilder().use('fabric');
    dg.cyl(0x7d98b4, 0, 0, 0.5, 0.5, 1, 22, Math.PI / 2, 0, 0);
    this.duvet = realMesh(dg.build(), { snow: false, cast: false });
    const rg = new GeoBuilder().use('fabric');
    rg.cyl(0x7d98b4, 0, 0, 0, 0.5, 1, 14, 0, 0, Math.PI / 2);
    rg.cyl(0xf0eee8, 0, 0.06, -0.1, 0.4, 1.002, 14, 0, 0, Math.PI / 2);
    this.roll = realMesh(rg.build(), { snow: false, cast: false });
    for (const d of [this.duvet, this.roll]) { d.rotation.y = k.yaw(0); scene.add(d); }
    // the cat, from day 4: sitting at the foot of the bed on her half, watching him
    if (g.homeCat) {
      const cat = (this.cat = buildCat());
      cat.root.position.copy(this.W([CAT.x, BED.top + 0.04, CAT.z]));
      cat.root.rotation.y = k.yaw(Math.PI - 0.35);
      cat.sit(true);
      cat.animate(0, 0);
      scene.add(cat.root);
    }
    hud.letterbox(true);
    this.ticking = this.sfx('ticking');
    this.tick(0);
    this.buildMs = Math.round(performance.now() - t0);
    if (TEST) console.log('[t] waking: the bedroom built in', this.buildMs, 'ms;', this.cat ? 'the cat on the bed' : 'no cat yet', '; the line:', this.line);
  }

  // ----------------------------------------------------------------------------------------------

  play(dt, t, at) {
    const g = this.g;
    // the shot
    let si = 0;
    while (si < SHOTS.length - 1 && SHOTS[si + 1][0] <= t) si++;
    const [s0, pos, look, fov, to] = SHOTS[si], s1 = SHOTS[si + 1]?.[0] ?? s0 + 7;
    const u = sstep(s0, s1 + 0.4, t), cp = [0, 1, 2].map((k) => lerp(pos[k], to[k], u));
    const lk = look.length === 1 ? this.ove.head.getWorldPosition(new THREE.Vector3()).add(_dn.set(0, -look[0], 0)) : this.W(look);
    if (si !== this.shotI) {
      this.shotI = si;
      g.cam.cine = { pos: this.W(cp), look: lk, cut: true, fov };
      g.cam.cineInfo = { kind: 'scene', shot: si }; g.cam.cineSubjects = [];
    } else if (g.cam.cine) { g.cam.cine.pos.copy(this.W(cp)); g.cam.cine.look.copy(lk); }
    // the beats
    if (at(T.gasp)) { this.sfx('gasp'); this.sfx('creak'); }
    if (at(T.gasp + 1.4)) this.sfx('shovel');
    if (at(T.say)) this.say();
    if (this.said && t >= this.end) this.close();
    this.tick(dt);
  }

  // The line, in the dialogue box (said in his voice; it closes by itself when he has said it).
  say() {
    const g = this.g, auto = g.autoDialog;
    g.autoDialog = true;
    hud.runDialog([{ who: 'ove', text: this.line }], g).then(() => {
      g.autoDialog = auto;
      this.said = true;
      if (!this.closing) { this.end = this.t + T.after; this.sfx('sigh'); }
    });
  }

  // Poses and props, every frame (dt 0: as they are now).
  tick(dt) {
    const t = this.t, o = this.ove, st = o.st;
    // asleep until the gasp, then up in a third of a second (downPose's own lie -> sit, held there)
    const up = sstep(T.gasp, T.gasp + 0.32, t);
    st.downLeft = up > 0 ? 1.3 - 0.455 * up : 9;
    // his mouth on his line (voice.js)
    const vu = voice.talking('ove');
    st.talk = this.g.talker === 'ove' || !!vu;
    st.mouth = vu ? vu.mouth() : null;
    st.t += dt;
    animateCharacter(o.m, st, dt);
    // the legs straight under the duvet, toes along the bed (downPose bends a knee); asleep, the arms
    // by his sides under it (downPose throws them out), up, as downPose sits him
    const [tR, sR, fR, tL, sL, fL] = o.legs;
    const legT = lerp(0, -1.08, up), legS = lerp(0, 0.06, up);
    for (const b of [tR, tL]) b.rotation.set(legT, 0, b === tR ? -0.04 : 0.04);
    for (const b of [sR, sL]) b.rotation.set(legS, 0, 0);
    // (and his feet small: in bed they are only ever two bumps poking through the duvet)
    for (const b of [fR, fL]) { b.rotation.set(1.2, 0, 0); b.scale.setScalar(0.45); }
    const [aR, eR, aL, eL] = o.arms, k = 1 - up;
    aR.rotation.x = lerp(aR.rotation.x, 0.05, k); aR.rotation.z = lerp(aR.rotation.z, -0.12, k);
    aL.rotation.x = lerp(aL.rotation.x, 0.05, k); aL.rotation.z = lerp(aL.rotation.z, 0.12, k);
    eR.rotation.x = lerp(eR.rotation.x, -0.25, k); eL.rotation.x = lerp(eL.rotation.x, -0.25, k);
    // (breathing in his sleep; the head on the pillow, then up)
    o.neck.rotation.x += lerp(0.3, 0, up);
    o.chest.rotation.x += (1 - up) * 0.02 * Math.sin(t * 1.6);
    // he looks across at her half of the bed (to his right), then down in front of him as he speaks
    const across = sstep(T.look, T.look + 0.5, t) * (1 - sstep(T.say + 0.3, T.say + 1.1, t));
    o.neck.rotation.y += -0.62 * across;
    o.head.rotation.y += -0.2 * across;
    o.neck.rotation.x += 0.18 * sstep(T.say + 0.3, T.say + 1.1, t);
    // the gasp: a jolt through the shoulders
    const jolt = t > T.gasp ? Math.exp(-(t - T.gasp) * 6) * Math.sin(Math.min(Math.PI, (t - T.gasp) * 10)) : 0;
    o.spine.rotation.x -= 0.12 * jolt;
    // the duvet: up to his chin asleep; at the gasp thrown down to his waist, bunched up there
    const head = lerp(5.15, 5.76, up), lo = BED.top - 0.02, hi = lerp(0.3, 0.22, up);
    const w = BED.x1 - BED.mid + 0.22, cx = (BED.mid + BED.x1) / 2 + 0.02, len = BED.z1 + 0.04 - head;
    this.duvet.position.copy(this.W([cx, lo, head]));
    this.duvet.scale.set(w, hi * 2, len);
    // (its top edge turned down over his chest asleep, a heap in his lap sitting up)
    const rr = lerp(0.07, 0.12, up);
    this.roll.position.copy(this.W([cx, lo + hi - rr * lerp(1.0, 0.35, up), head + lerp(0.1, 0.06, up)]));
    this.roll.scale.set(w - 0.06, rr * 2, rr * 2.4);
    // the cat: sits, starts at the gasp and looks at him
    if (this.cat) {
      const c = this.cat;
      c.animate(dt, 0);
      const startle = t > T.gasp ? Math.exp(-(t - T.gasp) * 4) : 0;
      c.head.rotation.x -= 0.5 * sstep(T.gasp, T.gasp + 0.2, t) + 0.2 * startle;
      c.head.rotation.z += 0.35 * sstep(T.say + 1.5, T.say + 2.0, t);
    }
  }

  sfx(kind, a) { return audio.synth((A) => SOUNDS[kind](A, a)); }

  // The set goes (under the black): everything back as it was, the camera behind Ove at his door.
  teardown() {
    if (!this.set) return;
    const g = this.g;
    this.ticking?.stop?.();
    for (const [m, v] of this.hidden) m.visible = v;
    g.offstage(g.player, false);
    scene.remove(this.ove.m.root); this.ove.m.root.traverse((x) => x.geometry?.dispose());
    for (const d of [this.duvet, this.roll]) { scene.remove(d); d.geometry.dispose(); }
    if (this.cat) { scene.remove(this.cat.root); this.cat.root.traverse((x) => x.geometry?.dispose()); }
    this.set.dispose();
    this.set = null;
    hud.letterbox(false);
    g.cam.release();
    g.cam.behind(g.player);
  }

  // Over (or broken off): nothing of it left.
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
    hud.curtain(false);
    hud.letterbox(false);
    if (TEST && window.__wake === this) window.__wake = null;
  }
}

// ------------------------------------------------------------------------------------------------
// The bedroom's sounds (audio.synth's tools), into their own little buses with a touch of room.

const rnd = (a, b) => a + Math.random() * (b - a);
const bus = (A, gain = 1, verb = 0.06) => { const o = A.ctx.createGain(); o.gain.value = gain; o.connect(A.sfx); A.verbSend?.(o, verb); return o; };
// (exported for tools: cold.mjs coldsound renders each offline and checks its level)
export const SOUNDS = {
  // The alarm clock ticking, quietly, for as long as the room is there. stop() ends it.
  ticking(A) {
    const out = bus(A, 1, 0.03);
    let on = true, n = 0;
    const one = () => {
      if (!on) return;
      const t = A.now();
      A.burst(t, 0.008, n % 2 ? 0.018 : 0.026, n % 2 ? 3600 : 4200, 'bandpass', 4, { dest: out });
      n++;
      setTimeout(one, 500);
    };
    one();
    return { stop() { on = false; } };
  },
  // A sharp breath in through the mouth: waking from it
  gasp(A) {
    const t = A.now(), out = bus(A, 1, 0.05);
    A.burst(t, 0.42, 0.11, 900, 'bandpass', 1.1, { dest: out, attack: 0.05, to: 2400 });
    A.burst(t + 0.02, 0.36, 0.05, 2600, 'bandpass', 1.4, { dest: out, attack: 0.08 });
    A.vocal?.(t + 0.3, 0.16, [125, 140, 110], [400, 1100, 2400], [520, 1200, 2500], 0.05, { at: 0.3, open: 0.08, creak: 60, press: 0.7 });
  },
  // The bed taking his weight: a dry wooden creak and the springs
  creak(A) {
    const t = A.now(), out = bus(A, 1, 0.06);
    A.osc('sawtooth', 210, t + 0.05, 0.28, 0.018, { to: 160, attack: 0.04, dest: out });
    A.burst(t + 0.05, 0.25, 0.05, 520, 'bandpass', 3, { dest: out, attack: 0.03 });
    for (let i = 0; i < 3; i++) A.osc('sine', rnd(900, 1300), t + 0.1 + i * 0.06, 0.08, 0.008, { to: rnd(700, 900), dest: out });
  },
  // A long breath out
  sigh(A) {
    const t = A.now(), out = bus(A, 1, 0.05);
    A.burst(t, 1.1, 0.05, 700, 'bandpass', 0.7, { dest: out, soft: true, attack: 0.25 });
    A.burst(t + 0.1, 0.9, 0.018, 1800, 'bandpass', 0.9, { dest: out, soft: true, attack: 0.2 });
  },
  // Somebody shovelling snow outside, muffled by the window: three scrapes
  shovel(A) {
    const t = A.now(), out = bus(A, 0.7, 0.1), lp = A.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(out);
    for (let i = 0; i < 3; i++) A.burst(t + i * 0.9, rnd(0.35, 0.5), 0.05, rnd(1200, 1700), 'bandpass', 0.8, { dest: lp, attack: 0.06 });
  },
};
