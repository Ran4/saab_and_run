// Day 3's radiator scene (features/implemented/luftning_borde_vara_en_scen.md). One press of E at
// Anita and Rune's door: a cut to black, and Ove is inside their kitchen bleeding the radiator under
// the window (~16 s; the skip keys - Space, E, Enter, a click, the pad's A or Y - end it at once).
//   He knocks on it three times (hollow) and listens with his ear to it (it gurgles); the brass key
//   goes on the valve, Anita's good coffee cup under it, and the air comes out: a hiss that goes on,
//   and on (he looks into the camera; Rune nods off); a sputter, a few drops of rust-brown water in
//   the cup, the key back. One more knock (full: a dull thud), "Mm.", Rune wakes with a snort. And
//   on the sill outside the window sits a grey striped cat, looking in (it is Ove's from tomorrow,
//   day 4): they look at each other. "Hmpf." Black: "Sex element till. Ett i taget."
// holdAt({ scene: luftScene }) runs it (stages.js): update(dt) -> true when it is over (the picture
// is back on the walkway and the stage is done), dispose() puts everything back (also on abort).
// The set is world/interior.js (built here, at the first black, and removed at the last); the people
// are puppets (models.js characters, posed here, no physics), the real Ove, Anita and Rune outside are
// hidden meanwhile. Nothing new is said: Ove's two grunts are his small-talk replies (script.js
// OVE_REPLY), voiced already; the rest is sound (made here with audio.synth) and acting.
// ?test: window.__luft is the running scene; __luft.pauseAt = s holds it at s (tools: story.mjs luft).

import { THREE, scene, realMesh, GeoBuilder, PRIM, mat } from '../gfx.js';
import { buildCharacter, animateCharacter, buildCat, CHARS } from '../actors/models.js';
import { buildKitchen, VENT, RAD } from '../world/interior.js';
import { interiors } from '../world/data.js';
import { audio } from '../audio.js';
import { hud } from './hud.js';
import { fx as FX } from './fx.js';
import { OVE_REPLY } from './script.js';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
// The beats, s from the press of E.
const T = {
  black: 0.65, open: 1.25, knock: [2.0, 2.36, 2.72], listen: 3.0, gurgle: 3.45, valve: 4.6, key: 5.0, hiss: 5.15,
  face: 6.7, look: 7.45, doze: 7.3, back: 8.75, sputter: 9.05, cup: 9.5, drips: [9.62, 9.98, 10.28], spurt: 10.5,
  shut: 11.1, wide: 11.45, thud: 11.95, mm: 12.35, wake: 12.8, cat: 13.45, tilt: 13.8, up: 14.25, hmpf: 14.6, cat2: 15.15,
  away: 15.35, close: 16.0, gone: 16.7, lift: 17.55, end: 18.15,
};
// Ove's grunts: his small-talk replies (voiced; never inline voiced text here).
const grunt = (t) => (OVE_REPLY.includes(t) ? t : OVE_REPLY[0]);

// Indoors: Anita in a cardigan, Rune without his cap and coat (made once: models.js caches a face
// texture per def).
const ANITA_IN = { ...CHARS.anita, coat: { type: 'cardigan', color: 0x7e5868, len: 0.5, buttonColor: 0xe8e0d0 }, under: 0xe6dccb, gloves: null, bag: null, shoes: { type: 'shoes', color: 0x4a3428 } };
const RUNE_IN = { ...CHARS.rune, hat: null, scarf: null, coat: { type: 'cardigan', color: 0x6a5c48, len: 0.42 } };

// Where everyone is (unit-local: x along the row, z into the house, y above the floor; interior.js).
const OVE = { x: 3.98, z: 0.72, yaw: Math.PI };
const RUNE = { x: 2.45, z: 1.0 }, ANITA = { x: 3.15, z: 2.25 };
const CAT = { x: 4.64, y: 0.905, z: -0.085 };               // on the window's outer sill
const CUP_HELD = [VENT.x + 0.004, VENT.y - 0.145, VENT.z + 0.04];
const CUP_FLOOR = [3.56, 0, 0.6], CUP_FULL = [3.6, 0, 0.64];
const KNOCK = [4.18, 0.55, RAD.z + RAD.d + 0.01];          // where the knuckles meet the radiator
// The shots: [from (s), camera, look at, fov, drift (the camera's position at the end of the shot)].
const SHOTS = [
  [0, [4.45, 1.45, 3.4], [3.45, 0.72, 0.7], 50, [4.32, 1.4, 3.12]],          // the kitchen: Ove at the radiator under the window
  [T.listen - 0.05, [2.95, 0.8, 0.5], [3.95, 0.88, 0.62], 40, [3.02, 0.8, 0.52]],    // his left side: the ear to it
  [T.valve, [3.36, 0.76, 0.5], [3.92, 0.56, 0.31], 38, [3.4, 0.75, 0.49]],   // the valve, the key, the cup
  [T.face, [4.5, 1.0, 0.36], [3.94, 1.08, 0.78], 40, [4.45, 1.0, 0.41]],     // his face; Anita and Rune behind
  [T.cup, [4.27, 0.72, 0.47], [3.89, 0.5, 0.33], 36, [4.25, 0.71, 0.46]],    // the cup, from under his arm
  [T.wide, [5.05, 1.6, 0.92], [3.2, 0.8, 1.15], 56, [5.0, 1.57, 0.94]],      // from the kitchen end: the thud, Rune
  [T.cat, [4.42, 1.3, 1.35], [4.6, 1.08, -0.05], 36, [4.44, 1.27, 1.18]],    // what Ove sees: the cat on the sill
  [T.up, [4.52, 1.3, 0.3], [3.98, 1.2, 0.75], 50, [4.5, 1.29, 0.32]],       // ...and what it sees: Ove, eye to eye
  [T.cat2, [4.44, 1.27, 1.12], [4.6, 1.08, -0.05], 34, [4.45, 1.26, 1.02]],  // it looks away
];

const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rnd = (a, b) => a + Math.random() * (b - a);

export function luftScene(g, o = {}) { return new LuftScene(g, o); }

class LuftScene {
  constructor(g, o) {
    this.g = g; this.o = o;
    this.t = 0; this.length = T.end;
    this.set = null; this.shotI = -1;
    g.inDialog = true;
    hud.clearBubbles?.();
    hud.curtain(true, o.open || '');
    audio.door();
    if (TEST) window.__luft = this;
  }

  // -> true when it is over.
  update(dt) {
    const g = this.g;
    if (this.pauseAt != null) dt = Math.min(dt, Math.max(0, this.pauseAt - this.t));
    if (this.t > 0.9 && this.t < T.close && !this.skipped && g.input.pressed('skip')) this.skip();
    const t0 = this.t;
    this.t += dt;
    const t = this.t, at = (x) => t0 < x && t >= x;
    if (!this.built && t >= T.black) this.build();
    if (this.set) this.play(dt, t, at);
    if (at(T.open)) hud.curtain(false);
    if (at(T.close)) { this.hush(); hud.curtain(true, this.o.close || ''); }
    if (at(T.gone)) this.teardown();
    if (at(T.lift)) hud.curtain(false);
    if (t >= T.end) { this.dispose(); return true; }
    return false;
  }

  // Straight to the end: to black with the closing caption (already black: it stays), out.
  skip() {
    this.skipped = true;
    this.hush();
    if (this.t < T.open) { hud.curtain(true, this.o.close || ''); this.t = T.gone - 0.05; }
    else this.t = T.close - 1e-4;
  }

  // ----------------------------------------------------------------------------------------------
  // The set, the people, the props: at the first black.

  build() {
    this.built = true;
    const t0 = performance.now();
    const g = this.g, info = interiors.rune;
    const k = (this.set = buildKitchen(info));
    scene.add(k.root);
    this.W = (p) => new THREE.Vector3(...k.at(p[0], p[1], p[2]));
    // the window's pane (seen from inside it was a slab); the real Ove and the neighbours outside go
    // off the stage (main.js offstage: back as their state says, not as they were this frame - the
    // camera may have hidden one of them for it, and putting that back hid Anita for good)
    this.hidden = [];
    if (info.paneMesh) { this.hidden.push([info.paneMesh, info.paneMesh.visible]); info.paneMesh.visible = false; }
    this.offstage = [g.player, g.npc('anita'), g.npc('rune')].filter(Boolean);
    for (const ch of this.offstage) g.offstage(ch, true);
    // the puppets
    this.ove = this.puppet(CHARS.ove, OVE.x, OVE.z, OVE.yaw);
    this.rune = this.puppet(RUNE_IN, RUNE.x, RUNE.z, Math.atan2(OVE.x - RUNE.x, OVE.z - RUNE.z) - 0.25);
    this.anita = this.puppet(ANITA_IN, ANITA.x, ANITA.z, Math.atan2(OVE.x - ANITA.x, OVE.z - ANITA.z));
    Object.assign(this.ove.st, { kneel: true, kneelReach: 0 });
    this.rune.st.listen = true; this.anita.st.listen = true;
    this.poses();
    // the cat on the sill outside, sitting, looking in
    const cat = (this.cat = buildCat());
    const cp = this.W([CAT.x, CAT.y, CAT.z]);
    cat.root.position.copy(cp);
    cat.root.rotation.y = k.yaw(0);
    cat.sit(true);
    scene.add(cat.root);
    // the brass key (its square socket on the valve's stem, turning about the valve's axis), the cup
    // (white porcelain, a blue band) with rust-brown water rising in it, the drops
    this.key = new THREE.Group();
    this.key.position.copy(this.W([VENT.x, VENT.y, VENT.z + 0.002]));
    this.key.rotation.y = k.yaw(0);
    const kg = new GeoBuilder().use('chrome');
    kg.add(PRIM.cyl(8), 0xc9a253, mat(0, 0, 0.016, Math.PI / 2, 0, 0, 0.012, 0.03, 0.012));
    kg.box(0xc9a253, 0, 0, 0.033, 0.036, 0.012, 0.004);
    kg.add(PRIM.torus(), 0xc9a253, mat(0, 0, 0.042, 0, 0, 0, 0.014, 0.014, 0.03));
    this.keyMesh = realMesh(kg.build(), { snow: false, cast: false });
    this.key.add(this.keyMesh);
    this.key.visible = false;
    scene.add(this.key);
    this.cup = new THREE.Group();
    const cg = new GeoBuilder().use('painted');
    const r = 0.037, n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      cg.box(0xf4f2ec, Math.sin(a) * r, 0.034, Math.cos(a) * r, 2 * Math.PI * r / n + 0.002, 0.058, 0.004, a);
      cg.box(0x2a4a8a, Math.sin(a) * (r + 0.0012), 0.057, Math.cos(a) * (r + 0.0012), 2 * Math.PI * r / n + 0.002, 0.006, 0.003, a);
    }
    cg.add(PRIM.cyl(18), 0xf4f2ec, mat(0, 0.004, 0, 0, 0, 0, 0.066, 0.008, 0.066));
    cg.add(PRIM.torus(), 0xf4f2ec, mat(r + 0.011, 0.035, 0, 0, 0, Math.PI / 2, 0.034, 0.042, 0.06));
    this.cup.add(realMesh(cg.build(), { snow: false, cast: false }));
    const wg = new GeoBuilder().use('water');
    wg.add(PRIM.cyl(18), 0x3a2414, mat(0, 0, 0, 0, 0, 0, 2 * r - 0.004, 0.002, 2 * r - 0.004));
    this.water = realMesh(wg.build(), { snow: false, cast: false });
    this.water.visible = false;
    this.cup.add(this.water);
    scene.add(this.cup);
    this.level = 0;
    const dg = new GeoBuilder().use('water');
    dg.sphere(0x4a3220, 0, 0, 0, 0.007, 0.011, 0.007);
    this.dropGeo = dg.build();
    this.drops = [];
    this.vent = this.W([VENT.x, VENT.y - 0.004, VENT.z + 0.012]);
    this.out = new THREE.Vector3(...k.at(0, 0, 1)).sub(new THREE.Vector3(...k.at(0, 0, 0))).normalize();
    hud.letterbox(true);
    this.tick(0);
    this.buildMs = Math.round(performance.now() - t0);
  }

  puppet(def, x, z, yaw) {
    const m = buildCharacter(def);
    scene.add(m.root);
    const p = this.W([x, 0, z]);
    m.root.position.copy(p);
    m.root.rotation.y = this.set.yaw(yaw);
    const bone = (name) => m.bones.find((b) => b.name === name);
    return {
      m, p, yaw: m.root.rotation.y, neck: bone('neck'), head: bone('head'), spine: bone('spine'),
      st: { speed: 0, air: false, vy: 0, kick: 0, talk: false, seated: false, driving: false, flung: false, down: false, mouth: null, t: Math.random() * 10, spin: 0, look: 0, wave: false, cheer: false, sprint: false, write: false, phone: false, push: false, yell: false, flungT: 0, downLeft: 0, carry: false, work: false, workKind: null, listen: false, kneel: false, kneelReach: undefined, jumpWind: 0, jumping: false, landT: 9, jumpV: 0, fright: false, fist: false },
    };
  }

  // Ove's hands through the scene, as keyframes in his body space: [time, right, left, lean, head].
  poses() {
    const o = this.ove, k = this.set, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    // unit-local point / direction -> Ove's body space (y above the soles, z ahead, x to his left)
    const P = (p) => { const w = this.W(p); const dx = w.x - o.p.x, dz = w.z - o.p.z; return [dx * c - dz * s, w.y - o.p.y, dx * s + dz * c]; };
    const Dv = (d) => { const a = this.W([0, 0, 0]), b = this.W(d), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, b.y - a.y, dz) || 1; return [(dx * c - dz * s) / l, (b.y - a.y) / l, (dx * s + dz * c) / l]; };
    const add = (p, d, u) => [p[0] + d[0] * u, p[1] + d[1] * u, p[2] + d[2] * u];
    // resting on the forward knee (models.js kneelPose's own rest, worked out from his size)
    const D = o.m.D, kk = D.k, thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY;
    const H = thighL * Math.cos(0.05) + 0.055 * kk, h = Math.acos(Math.min(1, Math.max(-1, (H - D.ankleY - shinL * Math.cos(0.18)) / thighL)));
    const kz = -0.12 * kk + thighL * Math.sin(h), ky = H - thighL * Math.cos(h), kx = D.hipX + 0.02;
    const restR = { p: [kx - 0.07, ky + 0.1, kz - 0.1], fd: [0.15, -0.75, 0.6], pn: [0, -1, 0.1], shape: 'relax' };
    const restL = { p: [kx + 0.01, ky + 0.075, kz - 0.05], fd: [-0.15, -0.75, 0.6], pn: [0, -1, 0.1], shape: 'relax' };
    // a fist a few cm off the radiator (the knock drives it in: knockPose)
    const kfd = Dv([0, -0.15, -1]);
    this.kfd = kfd;
    const knockR = { p: add(P(KNOCK), kfd, -0.155), fd: kfd, pn: Dv([-1, 0, 0]), shape: 'fist' };
    // a palm flat on the radiator's top while he listens
    const topR = { p: P([4.14, RAD.y + RAD.h + 0.035, RAD.z + RAD.d * 0.5 + 0.085]), fd: Dv([0, -0.1, -1]), pn: Dv([0, -1, 0]), shape: 'relax' };
    // the key between thumb and index (its turn rolls the palm: keyPose), the cup on the left palm
    const kfd2 = Dv([0.25, -0.2, -1]);
    const keyR = { p: add(add(P([VENT.x, VENT.y, VENT.z + 0.034]), kfd2, -0.1), Dv([-1, 0, 0]), -0.03), fd: kfd2, pn: Dv([-1, 0, 0]), shape: 'pen', key: true };
    // (round the cup like a mug, from its left: the palm to it, the fingers round its far side)
    const cupL = { p: P([CUP_HELD[0] - 0.054, CUP_HELD[1] + 0.03, CUP_HELD[2] + 0.085]), fd: Dv([0.1, 0, -1]), pn: Dv([1, 0, 0]), shape: 'carry' };
    // the head: [neck pitch, neck yaw, head roll] (yaw > 0: to his left)
    const LISTEN = [0.4, 0.15, 0.62], VALVE = [0.42, 0.32, 0.05], CAMERA = [-0.3, -0.95, 0.05], UP = [-0.36, -0.7, 0.02], NONE = [0.05, 0, 0];
    this.track = [
      [0, restR, restL, 0, NONE],
      [1.55, restR, restL, 0, [0.25, 0.1, 0]],
      [1.92, knockR, restL, 0.08, [0.3, 0.12, 0]],
      [2.85, knockR, restL, 0.08, [0.3, 0.12, 0]],
      [3.2, topR, restL, 0.62, LISTEN],
      [4.58, topR, restL, 0.62, LISTEN],
      [4.6, keyR, cupL, 0.26, VALVE],
      [T.look, keyR, cupL, 0.26, VALVE],
      [T.look + 0.35, keyR, cupL, 0.2, CAMERA],
      [T.back, keyR, cupL, 0.2, CAMERA],
      [T.back + 0.3, keyR, cupL, 0.26, VALVE],
      [T.wide - 0.01, keyR, cupL, 0.26, VALVE],
      [T.wide, knockR, restL, 0.08, [0.3, 0.1, 0]],
      [T.mm + 0.5, knockR, restL, 0.08, [0.2, 0.1, 0]],
      [T.mm + 0.85, restR, restL, 0, [0.15, 0.05, 0]],
      [T.cat + 0.15, restR, restL, 0, [0.15, 0.05, 0]],
      [T.cat + 0.55, restR, restL, -0.04, UP],
      [99, restR, restL, -0.04, UP],
    ];
  }

  // The keyframes at t (blended), plus the knocks and the key's turn.
  ovePose(t) {
    const tr = this.track;
    let i = 0;
    while (i < tr.length - 2 && tr[i + 1][0] <= t) i++;
    const a = tr[i], b = tr[i + 1], u = sstep(a[0], b[0], t);
    const mix = (p, q) => {
      const v3 = (x, y) => [lerp(x[0], y[0], u), lerp(x[1], y[1], u), lerp(x[2], y[2], u)];
      return { p: v3(p.p, q.p), fd: v3(p.fd, q.fd), pn: v3(p.pn, q.pn), shape: u < 0.5 ? p.shape : q.shape, key: u < 0.5 ? p.key : q.key };
    };
    const st = this.ove.st;
    const r = mix(a[1], b[1]), l = mix(a[2], b[2]);
    // a knock: the fist goes in 6 cm and back in a tenth of a second
    let hit = 0;
    for (const tk of [...T.knock, T.thud]) hit = Math.max(hit, 1 - Math.abs(t - tk) / 0.07);
    if (hit > 0 && r.shape === 'fist') for (let k = 0; k < 3; k++) r.p[k] += this.kfd[k] * 0.06 * hit;
    // the key: a third of a turn open at the hiss, back at the end
    if (r.key) {
      const ang = 0.9 * sstep(T.key, T.key + 0.22, t) * (1 - sstep(T.shut, T.shut + 0.22, t));
      const c = Math.cos(ang), s = Math.sin(ang), n = r.pn, f = r.fd;
      // (the palm's normal rolled about the fingers: Rodrigues)
      const d = n[0] * f[0] + n[1] * f[1] + n[2] * f[2], cx = [f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]];
      r.pn = [0, 1, 2].map((k) => n[k] * c + cx[k] * s + f[k] * d * (1 - c));
      this.keyAng = ang;
    }
    st.hands = [r, l];
    st.lean = lerp(a[3], b[3], u);
    const hd = [0, 1, 2].map((k) => lerp(a[4][k], b[4][k], u));
    // the nod on "Mm."
    hd[0] += 0.16 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - T.mm) / 0.45)) * Math.PI));
    st.head = hd;
  }

  // ----------------------------------------------------------------------------------------------

  play(dt, t, at) {
    const g = this.g;
    // the shot
    let si = 0;
    while (si < SHOTS.length - 1 && SHOTS[si + 1][0] <= t) si++;
    const [t0, pos, look, fov, to] = SHOTS[si], t1 = SHOTS[si + 1]?.[0] ?? T.close;
    const u = sstep(t0, t1 + 0.4, t), cp = [0, 1, 2].map((k) => lerp(pos[k], to[k], u));
    if (si !== this.shotI) {
      this.shotI = si;
      g.cam.cine = { pos: this.W(cp), look: this.W(look), cut: true, fov };
      g.cam.cineInfo = { kind: 'scene', shot: si }; g.cam.cineSubjects = [];
    } else g.cam.cine?.pos.copy(this.W(cp));

    // the beats
    for (const tk of T.knock) if (at(tk)) this.sfx('knock');
    if (at(T.gurgle)) this.sfx('gurgle');
    if (at(T.valve)) { this.key.visible = true; }
    if (at(T.key)) this.sfx('key');
    if (at(T.hiss)) this.hissing = this.sfx('hiss', T.sputter - T.hiss + 0.1);
    if (at(T.sputter)) { this.hissing?.stop(0.05); this.hissing = null; this.sfx('sputter'); }
    for (const td of T.drips) if (at(td)) this.drop(0, 0);
    if (at(T.spurt)) { this.sfx('spurt'); for (let k = 0; k < 9; k++) this.drop(k * 0.035, 0.6); }
    if (at(T.shut)) this.sfx('key');
    if (at(T.thud)) this.sfx('thud');
    if (at(T.mm)) this.say(grunt('Mm.'));
    if (at(T.wake)) this.sfx('snort');
    if (at(T.hmpf)) this.say(grunt('Hmpf.'));
    // the air: a thin wisp out of the valve while it hisses (thinning as the pressure falls)
    if (this.hissing && t < T.sputter) {
      this.wispT = (this.wispT || 0) - dt;
      if (this.wispT <= 0) {
        this.wispT = 0.05;
        const v = this.vent, w = 1 - 0.6 * sstep(T.hiss, T.sputter, t);
        FX.exhaust(v.x + this.out.x * 0.01, v.y, v.z + this.out.z * 0.01, this.out.x * 4, this.out.z * 4, { alpha: 1.8 * w, size: 0.09 });
      }
    }
    this.tick(dt);
  }

  // Poses and props, every frame (dt 0: as they are now).
  tick(dt) {
    const t = this.t, o = this.ove, ru = this.rune, an = this.anita;
    this.ovePose(t);
    // his mouth on his lines
    const talking = (this.talkU && (this.talkU.state === 'playing' || this.talkU.state === 'queued')) || t < (this.talkUntil || 0);
    o.st.talk = !!talking && (!this.talkU || this.talkU.state === 'playing');
    o.st.mouth = this.talkU?.mouth?.() ?? null;
    for (const p of [o, ru, an]) { p.st.t += dt; animateCharacter(p.m, p.st, dt); }
    // Rune nods off in the hiss and wakes with a jerk at the thud
    const doze = sstep(T.doze, T.doze + 1.3, t) * (1 - sstep(T.wake, T.wake + 0.12, t));
    const jerk = t > T.wake ? Math.exp(-(t - T.wake) * 5) * Math.sin(Math.min(Math.PI, (t - T.wake) * 9)) : 0;
    ru.neck.rotation.x += 0.78 * doze - 0.3 * jerk;
    ru.head.rotation.z += 0.2 * doze;
    ru.head.rotation.x += 0.22 * doze;
    // Anita leans in to watch the valve, and nods at the "Mm."
    an.spine.rotation.x += 0.12 * sstep(T.hiss, T.hiss + 1.2, t) * (1 - sstep(T.sputter, T.sputter + 1, t));
    an.neck.rotation.x += 0.18 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - T.mm - 0.2) / 0.5)) * Math.PI));
    // the cat: sits, tilts its head at Ove, then looks away (not impressed)
    const cat = this.cat;
    cat.animate(dt, 0);
    cat.head.rotation.z += 0.42 * sstep(T.tilt, T.tilt + 0.3, t) * (1 - sstep(T.away - 0.2, T.away, t));
    cat.head.rotation.y += 1.1 * sstep(T.away, T.away + 0.35, t);
    // the key, the cup, the drops
    this.keyMesh.rotation.z = -(this.keyAng || 0);
    const held = t >= T.valve && t < T.wide;
    this.cup.position.copy(this.W(held ? CUP_HELD : t < T.valve ? CUP_FLOOR : CUP_FULL));
    this.cup.rotation.y = this.set.yaw(held ? 0 : 0.6);
    this.water.visible = this.level > 0;
    this.water.position.y = 0.009 + this.level;
    for (const d of this.drops) {
      if (!d.on) continue;
      d.wait -= dt;
      if (d.wait > 0) { d.m.visible = false; continue; }
      d.m.visible = true;
      d.vy -= 9.8 * dt;
      d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt; d.m.position.y += d.vy * dt;
      const floor = this.cup.position.y + 0.009 + this.level;
      if (d.m.position.y <= floor) {
        d.on = false; d.m.visible = false;
        this.level = Math.min(0.03, this.level + (d.big ? 0.0022 : 0.003));
        this.sfx('drip', 1 + this.level * 14);
      }
    }
  }

  // A drop from the valve into the cup after `wait` s (spurt: thrown out a little).
  drop(wait, spurt) {
    let d = this.drops.find((q) => !q.on);
    if (!d) { d = { m: realMesh(this.dropGeo, { snow: false, cast: false }) }; scene.add(d.m); this.drops.push(d); }
    const v = this.vent;
    d.m.position.set(v.x, v.y, v.z);
    const sp = spurt * rnd(0.12, 0.3);
    Object.assign(d, { on: true, wait, vx: this.out.x * sp, vz: this.out.z * sp, vy: spurt ? rnd(0.0, 0.25) : 0, big: !!spurt });
    d.m.visible = false;
  }

  say(text) {
    // (the bubble over his head as he kneels: hud puts it 0.45 m over y + height)
    const g = this.g, h = this.ove.head.getWorldPosition(new THREE.Vector3());
    this.talkU = g.say({ x: h.x, y: h.y - 0.45, z: h.z, height: 0.2 }, text, 1.8, { who: 'ove' });
    if (!this.talkU) { g.murmur(CHARS.ove.voice); this.talkUntil = this.t + 0.55; }
  }

  sfx(kind, a) { return audio.synth((A) => RADIATOR[kind](A, a)); }
  hush() { this.hissing?.stop(0.05); this.hissing = null; }

  // The set goes (at the last black): everything back as it was, the camera behind Ove at the door.
  teardown() {
    if (!this.set) return;
    const g = this.g;
    this.hush();
    for (const [o, v] of this.hidden) o.visible = v;
    for (const ch of this.offstage) g.offstage(ch, false);
    for (const p of [this.ove, this.rune, this.anita]) { scene.remove(p.m.root); p.m.root.traverse((x) => x.geometry?.dispose()); }
    scene.remove(this.cat.root); this.cat.root.traverse((x) => x.geometry?.dispose());
    for (const m of [this.key, this.cup, ...this.drops.map((d) => d.m)]) { scene.remove(m); m.traverse((x) => { if (x.geometry !== this.dropGeo) x.geometry?.dispose(); }); }
    this.dropGeo.dispose();
    this.set.dispose();
    this.set = null;
    hud.clearBubbles?.();
    g.cam.release();
    g.cam.behind(g.player);
    hud.letterbox(false);
  }

  // Over, or broken off (holdAt's cleanup: a fail, an abort): nothing of it is left.
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
    hud.curtain(false);
    hud.letterbox(false);
    this.g.inDialog = false;
    if (TEST && window.__luft === this) window.__luft = null;
  }
}

// ------------------------------------------------------------------------------------------------
// The radiator's sounds (audio.synth's tools: osc(type, f, t, dur, peak, { to, attack, dest }),
// burst(t, dur, peak, f, filter, q, { dest, soft, attack }), vocal(...)). Each into its own little
// bus with a touch of room.

const bus = (A, gain = 1, verb = 0.07) => { const o = A.ctx.createGain(); o.gain.value = gain; o.connect(A.sfx); A.verbSend(o, verb); return o; };
// (exported for tools: story.mjs luftsound renders each one offline and checks its level)
export const RADIATOR = {
  // a knuckle on a radiator full of air: a hollow, ringing steel 'bong'
  knock(A) {
    const t = A.now(), out = bus(A);
    A.burst(t, 0.012, 0.3, 2400, 'bandpass', 1.2, { dest: out });
    A.burst(t, 0.03, 0.14, 520, 'lowpass', 0.8, { dest: out });
    for (const [f, a, d] of [[196, 0.13, 0.5], [331, 0.1, 0.38], [517, 0.07, 0.28], [788, 0.045, 0.2], [1187, 0.025, 0.13], [1630, 0.012, 0.09]]) A.osc('sine', f * rnd(0.985, 1.015), t + 0.002, d, a, { attack: 0.002, dest: out });
  },
  // ...and full of water: dull and short
  thud(A) {
    const t = A.now(), out = bus(A);
    A.burst(t, 0.01, 0.24, 2200, 'bandpass', 1.2, { dest: out });
    A.osc('sine', 150, t, 0.11, 0.24, { to: 92, dest: out });
    A.osc('sine', 290, t, 0.045, 0.05, { dest: out });
    A.burst(t, 0.05, 0.12, 380, 'lowpass', 0.8, { dest: out });
  },
  // air bubbling up inside it
  gurgle(A) {
    const t = A.now(), out = bus(A, 1, 0.05), lp = A.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1700; lp.connect(out);
    let tt = t + 0.03;
    for (let i = 0; i < 10; i++) {
      const f = rnd(240, 560);
      A.osc('sine', f, tt, rnd(0.035, 0.07), rnd(0.05, 0.11), { to: f * rnd(1.5, 2.0), attack: 0.004, dest: lp });
      tt += i === 4 ? 0.22 : rnd(0.035, 0.12);
    }
    A.burst(t, 0.8, 0.05, 240, 'bandpass', 2.5, { dest: lp, soft: true, attack: 0.15 });
  },
  // the brass key on the valve: a tick, a little squeak, a tick
  key(A) {
    const t = A.now(), out = bus(A);
    A.burst(t, 0.008, 0.22, 4200, 'bandpass', 2, { dest: out });
    A.osc('sine', 1850, t + 0.03, 0.12, 0.016, { to: 2350, attack: 0.02, dest: out });
    A.burst(t + 0.17, 0.006, 0.16, 3600, 'bandpass', 2, { dest: out });
  },
  // the air coming out for dur s: a fluttering hiss and a thin whistle that sags as the pressure falls
  hiss(A, dur = 4) {
    const { ctx } = A, t = A.now(), out = bus(A, 1, 0.04);
    const s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.095, t + 0.06);
    g.gain.setTargetAtTime(0.065, t + 0.1, 0.6);
    g.gain.setTargetAtTime(0.034, t + dur * 0.62, dur * 0.22);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 9.5; lg.gain.value = 0.012; lfo.connect(lg).connect(g.gain);
    const w = ctx.createOscillator(), wg = ctx.createGain();
    w.frequency.setValueAtTime(3150, t); w.frequency.linearRampToValueAtTime(2500, t + dur);
    const wv = ctx.createOscillator(), wvg = ctx.createGain();
    wv.frequency.value = 6.3; wvg.gain.value = 24; wv.connect(wvg).connect(w.frequency);
    wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.011, t + 0.35);
    s.connect(bp).connect(hp).connect(g).connect(out);
    w.connect(wg).connect(out);
    const all = [s, lfo, w, wv];
    for (const n of all) { n.start(t); n.stop(t + dur + 2); }
    return {
      stop(fade = 0.08) {
        const tn = ctx.currentTime;
        for (const p of [g.gain, wg.gain]) { p.cancelScheduledValues(tn); p.setTargetAtTime(0, tn, fade); }
        for (const n of all) { try { n.stop(tn + fade * 6); } catch (e) { /* already stopped */ } }
      },
    };
  },
  // the last of the air spitting water
  sputter(A) {
    const t = A.now(), out = bus(A);
    let tt = t;
    for (let i = 0; i < 7; i++) {
      A.burst(tt, rnd(0.02, 0.06), rnd(0.08, 0.15), rnd(1600, 3200), 'bandpass', 1.1, { dest: out });
      if (i % 2) A.osc('sine', rnd(700, 1000), tt + 0.01, 0.04, 0.03, { to: 1500, dest: out });
      tt += rnd(0.05, 0.15);
    }
  },
  // one drop into the cup (k: pitch: the fuller, the higher)
  drip(A, k = 1) {
    const t = A.now(), out = bus(A, 1, 0.05);
    A.osc('sine', 820 * k, t, 0.07, 0.17, { to: 1450 * k, attack: 0.002, dest: out });
    A.burst(t, 0.006, 0.06, 6000, 'highpass', 0.7, { dest: out });
  },
  // a squirt of water into it
  spurt(A) {
    const t = A.now(), out = bus(A, 1, 0.05);
    A.burst(t, 0.42, 0.11, 1300, 'bandpass', 0.7, { dest: out, soft: true, attack: 0.03 });
    A.burst(t + 0.02, 0.3, 0.05, 3200, 'bandpass', 0.9, { dest: out, soft: true, attack: 0.02 });
  },
  // Rune waking up: a snort through the nose that turns into a grunt
  snort(A) {
    const t = A.now(), out = bus(A, 1, 0.05);
    A.burst(t, 0.16, 0.07, 650, 'bandpass', 2.5, { dest: out, attack: 0.02 });
    A.vocal(t + 0.1, 0.26, [100, 118, 82], [300, 950, 2200], [520, 1050, 2350], 0.08, { at: 0.25, open: 0.1, creak: 90, press: 0.8 });
  },
};
