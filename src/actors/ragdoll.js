// Saab & Run — a person gone limp (feature snubbla_vid_hopp): Ove tripping as he lands a jump, thrown
// out of a car he jumped out of at speed, knocked off his feet by one. Position-based (Verlet) physics
// on 22 points of his own skeleton: the joints, plus a point at the front of the pelvis and of the
// chest (the trunk's depth), the middle of the skull, the balls of the feet and the ends of the hands.
// Sticks hold the bones' lengths and the trunk's two rigid parts; ranges let a spine, a neck, an
// ankle and a wrist bend only so far; the hips turn in a cone and a knee never bends forward (all of
// them moving the points by their weights: nothing moves a point outright onto a hinge's plane, which
// blew the body apart). The points collide with the ground (floors, roofs of cars, the hills), the
// walls and the cars' sides, with friction, and a body tumbling over the ground loses speed.
//
// For the first moments the body keeps some tone (Character.tumble's `tone` s): soft springs to the
// distances it started with, so a man who trips goes over stiffly before he goes limp, and his
// hands go out to break the fall (`brace`). When he has lain still for a moment the points freeze in
// the frame of a root turned along the body (on his back feet to +z, on his front head to +z), and
// pose() moves them into the first pose of models.js' downPose (anim.prone: face down), lies there a
// moment (`lie` s) and lets downPose get him up.
//
// pose(m, P, Q) is called by animateCharacter (st.rag): it overwrites the trunk's, the limbs' and the
// pelvis offset's channels of P from the points (bones' world rotations from pairs of directions:
// the bone's own and a reference across it; the limbs carry their twist along from frame to frame).
// notes/people.md, *The ragdoll*.

import { THREE } from '../gfx.js';
import { groundAt, queryBlocks, circleVsBlock, topAt, RAMP } from '../world/collision.js';

export const RAG = {
  grav: 16,          // m/s² (a person falling: 24, a jump: 14; 16 reads as a heavy old body, not a feather)
  sub: 2,            // substeps per fixed step (120 Hz)
  iter: 10,          // constraint passes per substep
  mu: 0.8,           // friction on the ground (Coulomb: what a contact may take off the sliding speed)
  damp: 0.9985,      // velocity kept per substep (air, and a little inner friction)
  still: 0.45,       // m/s: every point slower than this ...
  stillT: 0.3,       // ... for this long (s) and he lies still
  minT: 0.7,         // never still sooner (a stumble's first instant is slow too)
  maxT: 7,           // and lies still by then whatever happens
  thud: 2.6,         // m/s into the ground (trunk, head) for a thud (game.onBodyBounce)
  tumble: 4,         // 1/s: the speed a body loses tumbling over the ground (the trunk touching it: a
                     // roll loses nothing to friction, and a body is soft; he rolled 9 m from a run)
  dbg: {},           // (diagnostics, scenarios/snubbla.mjs snubbladbg: { noLimits, noHip, noKnee, noTone, noBrace, noRanges })
};

// The points.
const HR = 0, HL = 1, KR = 2, KL = 3, AR = 4, AL = 5, TR = 6, TL = 7, SP = 8, CH = 9, NK = 10, HD = 11,
  SR = 12, SL = 13, ER = 14, EL = 15, WR = 16, WL = 17, FR = 18, FL = 19, PF = 20, CF = 21, N = 22;
// The bone each point hangs on (its offset from the bone in rest-pose model space, at init).
const BONE = ['thighR', 'thighL', 'shinR', 'shinL', 'footR', 'footL', 'footR', 'footL', 'spine', 'chest', 'neck', 'head',
  'armR', 'armL', 'foreR', 'foreL', 'handR', 'handL', 'handR', 'handL', 'pelvis', 'chest'];
// Collision radius (m at 1.78 m tall; 0: none) and inverse mass.
const RAD = [0.1, 0.1, 0.065, 0.065, 0.06, 0.06, 0.035, 0.035, 0.125, 0.125, 0.06, 0, 0.08, 0.08, 0.05, 0.05, 0.04, 0.04, 0.035, 0.035, 0.05, 0.06];
const INV = [1, 1, 1.2, 1.2, 1.6, 1.6, 3, 3, 1, 1, 1, 1.3, 1, 1, 1.8, 1.8, 2.4, 2.4, 4, 4, 1, 1];
const TRUNK = new Uint8Array(N); for (const i of [HR, HL, SP, CH, SR, SL, HD, PF, CF]) TRUNK[i] = 1;

// The rig of one body (cached on its model): rest points, bones' rest origins, constraints, rest frames.
function rig(m) {
  if (m.ragRig) return m.ragRig;
  const D = m.D, k = D.k;
  const R = new Float64Array(N * 3), O = new Float64Array(N * 3);
  const set = (A, i, x, y, z) => { A[i * 3] = x; A[i * 3 + 1] = y; A[i * 3 + 2] = z; };
  const wy = D.shJ - D.upper - D.fore;
  for (const [s, side] of [[0, -1], [1, 1]]) {
    set(R, HR + s, side * D.hipX, D.hipY, 0); set(O, HR + s, side * D.hipX, D.hipY, 0);
    set(R, KR + s, side * D.hipX, D.kneeY, 0); set(O, KR + s, side * D.hipX, D.kneeY, 0);
    set(R, AR + s, side * D.hipX, D.ankleY, 0); set(O, AR + s, side * D.hipX, D.ankleY, 0);
    set(R, TR + s, side * D.hipX, 0.025 * k, 0.62 * D.footLen); set(O, TR + s, side * D.hipX, D.ankleY, 0);
    set(R, SR + s, side * D.S, D.shJ, 0); set(O, SR + s, side * D.S, D.shJ, 0);
    set(R, ER + s, side * D.S, D.shJ - D.upper, 0); set(O, ER + s, side * D.S, D.shJ - D.upper, 0);
    set(R, WR + s, side * D.S, wy, 0); set(O, WR + s, side * D.S, wy, 0);
    set(R, FR + s, side * D.S, wy - 0.55 * D.hand, 0); set(O, FR + s, side * D.S, wy, 0);
  }
  set(R, SP, 0, D.spineY, 0); set(O, SP, 0, D.spineY, 0);
  set(R, CH, 0, D.chestY, 0); set(O, CH, 0, D.chestY, 0);
  set(R, NK, 0, D.neckY, D.neckZ); set(O, NK, 0, D.neckY, D.neckZ);
  set(R, HD, 0, D.headY + 0.31 * D.headH, D.headZ + 0.04 * D.headH); set(O, HD, 0, D.headY, D.headZ);
  set(R, PF, 0, D.hipY + 0.06 * k, 0.1 * k); set(O, PF, 0, D.hipY, 0);
  set(R, CF, 0, (D.chestY + D.shJ) / 2, 0.11 * k); set(O, CF, 0, D.chestY, 0);
  const L = (i, j) => Math.hypot(R[i * 3] - R[j * 3], R[i * 3 + 1] - R[j * 3 + 1], R[i * 3 + 2] - R[j * 3 + 2]);
  const C = [];
  const stick = (i, j) => C.push([i, j, L(i, j), L(i, j)]);
  const range = (i, j, lo, hi) => C.push([i, j, L(i, j) * lo, L(i, j) * hi]);
  const atLeast = (i, j, d) => C.push([i, j, d, Infinity]);
  const all = (list) => { for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) stick(list[a], list[b]); };
  // the trunk: the pelvis and the chest are rigid, joined at the spine
  all([HR, HL, SP, PF]);
  all([CH, SR, SL, NK, CF]);
  stick(SP, CH);
  // the limbs' bones and the head on its neck
  for (const s of [0, 1]) {
    stick(HR + s, KR + s); stick(KR + s, AR + s); stick(AR + s, TR + s);
    stick(SR + s, ER + s); stick(ER + s, WR + s); stick(WR + s, FR + s);
  }
  stick(NK, HD);
  // the spine bends forward more than back, twists a little; the neck the same
  range(PF, CF, 0.8, 1.07);
  for (const s of [0, 1]) { range(HR + s, SR + s, 0.86, 1.05); range(HR + s, SL - s, 0.88, 1.05); range(HD, SR + s, 0.85, 1.1); }
  range(HD, CF, 0.82, 1.12);
  atLeast(HD, CH, L(HD, CH) * 0.92);
  // an ankle from 0.3 rad up to 0.85 down of its rest angle, a wrist bent up to 1.1 rad either way
  const law = (a, b, th) => Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(th));
  const ang = (i, j, c) => {   // angle at j between i and c (rest)
    const ax = R[i * 3] - R[j * 3], ay = R[i * 3 + 1] - R[j * 3 + 1], az = R[i * 3 + 2] - R[j * 3 + 2];
    const bx = R[c * 3] - R[j * 3], by = R[c * 3 + 1] - R[j * 3 + 1], bz = R[c * 3 + 2] - R[j * 3 + 2];
    return Math.acos((ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)));
  };
  for (const s of [0, 1]) {
    const a = L(KR + s, AR + s), b = L(AR + s, TR + s), th = ang(KR + s, AR + s, TR + s);
    C.push([KR + s, TR + s, law(a, b, th - 0.3), law(a, b, Math.min(Math.PI, th + 0.85))]);
    const e = L(ER + s, WR + s), h = L(WR + s, FR + s);
    C.push([ER + s, FR + s, law(e, h, Math.PI - 1.1), e + h]);
    // an elbow or a knee folds only so far
    atLeast(SR + s, WR + s, (D.upper + D.fore) * 0.3);
    atLeast(HR + s, AR + s, (D.hipY - D.ankleY) * 0.3);
  }
  // the legs don't pass through each other
  atLeast(KR, KL, 0.13 * k); atLeast(AR, AL, 0.11 * k); atLeast(TR, TL, 0.09 * k);
  const n = C.length, ci = new Int16Array(n), cj = new Int16Array(n), lo = new Float64Array(n), hi = new Float64Array(n);
  C.forEach(([i, j, a, b], q) => { ci[q] = i; cj[q] = j; lo[q] = a; hi[q] = b; });
  // the bones' rest frames (see pose)
  const v = (i, j) => [R[j * 3] - R[i * 3], R[j * 3 + 1] - R[i * 3 + 1], R[j * 3 + 2] - R[i * 3 + 2]];
  const X = [1, 0, 0];
  const rest = {};
  const fr = (name, u, w) => { rest[name] = frameQ(u[0], u[1], u[2], w[0], w[1], w[2], new THREE.Quaternion()).invert(); };
  fr('pelvis', [0, D.spineY - D.hipY, 0], X);
  fr('spine', v(SP, CH), X);
  fr('chest', v(CH, NK), X);
  fr('neck', v(NK, HD), X);
  for (const [s, n2] of [[0, 'R'], [1, 'L']]) {
    fr('thigh' + n2, v(HR + s, KR + s), X); fr('shin' + n2, v(KR + s, AR + s), X); fr('foot' + n2, v(AR + s, TR + s), X);
    fr('arm' + n2, v(SR + s, ER + s), X); fr('fore' + n2, v(ER + s, WR + s), X); fr('hand' + n2, v(WR + s, FR + s), X);
  }
  const r = new Float64Array(N), w = new Float64Array(N);
  for (let i = 0; i < N; i++) { r[i] = RAD[i] * k; w[i] = INV[i]; }
  r[HD] = 0.47 * D.headH;
  m.ragRig = { R, O, ci, cj, lo, hi, n, rest, r, w, hipY: D.hipY, k, legLen: D.hipY, thigh: D.hipY - D.kneeY };
  return m.ragRig;
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3(), _M = new THREE.Matrix4();
// The rotation whose columns are u (normalised), w made square to it, and their cross product.
function frameQ(ux, uy, uz, wx, wy, wz, out) {
  _e1.set(ux, uy, uz).normalize();
  _e2.set(wx, wy, wz).addScaledVector(_e1, -(_e1.x * wx + _e1.y * wy + _e1.z * wz));
  if (_e2.lengthSq() < 1e-10) _e2.set(_e1.y, -_e1.x, 0).lengthSq() < 1e-10 && _e2.set(0, _e1.z, -_e1.y);
  _e2.normalize();
  _e3.crossVectors(_e1, _e2);
  _M.makeBasis(_e1, _e2, _e3);
  return out.setFromRotationMatrix(_M);
}

const _v = new THREE.Vector3(), _blocks = [], _hit = {}, _cars = [];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Ragdoll {
  // o: { pose: 'live' (default: the bones as they are) | { x, y, z, yaw } (a standing body, feet at y),
  //      v: [vx, vy, vz] every point's velocity, feet: k (the feet's horizontal velocity × k: caught),
  //      trip: [dx, dz, s, pivot] a push along (dx, dz) growing with the height up the body from the
  //      pivot (0: the feet, 1: the head; below it the other way) to s x (1 - pivot) m/s at the head,
  //      spin: [wx, wy, wz] rad/s about the hips,
  //      tone: s of stiffness at the start, brace: hands out against the fall, lie: s lying still before
  //      getting up, why: what did it (main.js says something about it when he is up) }
  constructor(ch, o = {}) {
    const m = ch.model, G = rig(m);
    this.ch = ch; this.m = m; this.G = G; this.why = o.why || null;
    this.x = new Float64Array(N); this.y = new Float64Array(N); this.z = new Float64Array(N);
    this.px = new Float64Array(N); this.py = new Float64Array(N); this.pz = new Float64Array(N);
    this.gy = new Float64Array(N); this.dep = new Float64Array(N);
    this.t = 0; this.stillT = 0; this.thudT = -1; this.frozen = false; this.lie = o.lie ?? 1;
    this.tone = o.tone ?? 0; this.brace = o.brace ? [o.trip?.[0] || 0, o.trip?.[1] || 0] : null;
    this.hit = false;   // the trunk has hit something hard (the tone and the brace end)
    // where the points start
    const R = G.R, O = G.O;
    if (o.pose && o.pose !== 'live') {
      const { x, y, z, yaw } = o.pose, c = Math.cos(yaw), s = Math.sin(yaw);
      for (let i = 0; i < N; i++) {
        const lx = R[i * 3], ly = R[i * 3 + 1], lz = R[i * 3 + 2];
        this.x[i] = x + lx * c + lz * s; this.y[i] = y + ly; this.z[i] = z - lx * s + lz * c;
      }
    } else {
      // from the bones' world matrices (as last drawn), moved to where the character is now
      const root = ch.root;
      THREE.Object3D.prototype.updateMatrixWorld.call(root, true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const c = Math.cos(ch.yaw), s = Math.sin(ch.yaw);
      for (let i = 0; i < N; i++) {
        const b = m.bones[m.bi[BONE[i]]];
        _v.set(R[i * 3] - O[i * 3], R[i * 3 + 1] - O[i * 3 + 1], R[i * 3 + 2] - O[i * 3 + 2]).applyMatrix4(b.matrixWorld).applyMatrix4(inv);
        this.x[i] = ch.x + _v.x * c + _v.z * s; this.y[i] = ch.y + _v.y; this.z[i] = ch.z - _v.x * s + _v.z * c;
      }
    }
    // the tone: the distances it started with
    this.keep = [];
    if (this.tone > 0) {
      const pairs = [[HR, AR], [HL, AL], [SP, KR], [SP, KL], [KR, KL], [PF, CF], [HR, SR], [HL, SL], [HR, SL], [HL, SR], [HD, SR], [HD, SL], [SR, WR], [SL, WL], [CF, WR], [CF, WL]];
      for (const [i, j] of pairs) this.keep.push([i, j, Math.hypot(this.x[i] - this.x[j], this.y[i] - this.y[j], this.z[i] - this.z[j])]);
    }
    // the limbs' twist (an elbow's or a knee's hinge axis, rest +x: arm R, L, leg R, L): from the upper
    // arms' and the thighs' world matrices
    this.twist = [0, 1, 2, 3].map(() => new THREE.Vector3(1, 0, 0));
    for (let s = 0; s < 4; s++) {
      const tw = this.twist[s];
      if (!o.pose || o.pose === 'live') tw.setFromMatrixColumn((s < 2 ? m.arms : m.legs)[s & 1].matrixWorld, 0).normalize();
      else tw.set(Math.cos(o.pose.yaw), 0, -Math.sin(o.pose.yaw));
    }
    // (the bones as drawn may not be quite the rig's: hands in pockets are scaled down, a pose can
    // bend a spine past its range; set right before anything moves, or the difference is a kick)
    for (let it = 0; it < 12; it++) solve(G, this.x, this.y, this.z);
    // (none of it under the ground: a body landing is a little below it, and a point pushed out of it
    // would leave with the push as its speed)
    let lift = 0;
    for (let i = 0; i < N; i++) lift = Math.max(lift, groundAt(this.x[i], this.z[i], this.y[i], 0.3) + G.r[i] - this.y[i]);
    if (lift > 0) for (let i = 0; i < N; i++) this.y[i] += lift;
    // velocities
    const h = 1 / 60 / RAG.sub, v = o.v || [0, 0, 0], feet = o.feet ?? 1, tr = o.trip, sp = o.spin;
    const footY = Math.min(this.y[AR], this.y[AL]), top = this.y[HD] - footY || 1;
    const cx = (this.x[HR] + this.x[HL]) / 2, cy = (this.y[HR] + this.y[HL]) / 2, cz = (this.z[HR] + this.z[HL]) / 2;
    for (let i = 0; i < N; i++) {
      const low = i === AR || i === AL || i === TR || i === TL ? feet : i === KR || i === KL ? (1 + feet) / 2 : 1;
      let vx = v[0] * low, vy = v[1], vz = v[2] * low;
      if (tr) { const u = (this.y[i] - footY) / top - (tr[3] || 0); vx += tr[0] * tr[2] * u; vz += tr[1] * tr[2] * u; }
      if (sp) {
        const rx = this.x[i] - cx, ry = this.y[i] - cy, rz = this.z[i] - cz;
        vx += sp[1] * rz - sp[2] * ry; vy += sp[2] * rx - sp[0] * rz; vz += sp[0] * ry - sp[1] * rx;
      }
      this.px[i] = this.x[i] - vx * h; this.py[i] = this.y[i] - vy * h; this.pz[i] = this.z[i] - vz * h;
    }
    this.hx = cx; this.hz = cz;
  }

  // One fixed step. Returns true once he lies still (then call nothing but pose()).
  step(dt, g) {
    if (this.frozen) return true;
    const n = RAG.sub, h = dt / n;
    for (let s = 0; s < n; s++) this.sub(h, g);
    this.t += dt;
    this.turnLimbs();
    const ch = this.ch, G = this.G;
    const cx = (this.x[HR] + this.x[HL]) / 2, cy = (this.y[HR] + this.y[HL]) / 2, cz = (this.z[HR] + this.z[HL]) / 2;
    ch.vx = (cx - this.hx) / dt; ch.vz = (cz - this.hz) / dt; ch.vy = 0;
    this.hx = cx; this.hz = cz;
    ch.x = cx; ch.z = cz;
    const gy = Math.max(this.gy[HR], this.gy[HL]);
    ch.y = Math.max(gy, cy - G.legLen);
    let vmax = 0;
    for (let i = 0; i < N; i++) vmax = Math.max(vmax, (this.x[i] - this.px[i]) ** 2 + (this.y[i] - this.py[i]) ** 2 + (this.z[i] - this.pz[i]) ** 2);
    vmax = Math.sqrt(vmax) / h;
    this.stillT = vmax < RAG.still ? this.stillT + dt : 0;
    if ((this.stillT >= RAG.stillT && this.t >= RAG.minT) || this.t >= RAG.maxT) { this.freeze(gy); return true; }
    return false;
  }

  sub(h, g) {
    const { x, y, z, px, py, pz, gy, dep } = this, G = this.G, r = G.r, w = G.w;
    const gr = RAG.grav * h * h, damp = RAG.damp;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < N; i++) {
      const vx = (x[i] - px[i]) * damp, vy = (y[i] - py[i]) * damp, vz = (z[i] - pz[i]) * damp;
      px[i] = x[i]; py[i] = y[i]; pz[i] = z[i];
      x[i] += vx; y[i] += vy - gr; z[i] += vz;
      if (x[i] < x0) x0 = x[i]; if (x[i] > x1) x1 = x[i]; if (z[i] < z0) z0 = z[i]; if (z[i] > z1) z1 = z[i];
    }
    // what is near: blocks, cars (once a substep)
    queryBlocks(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, _blocks);
    _cars.length = 0;
    if (g?.byX) {
      const a = g.byX();
      for (let i = g.firstX(x0 - 2 * (g._rmax || 3) - 1); i < a.length; i++) {
        const c = a[i];
        if (c.x - c.radius > x1 + 0.5) break;
        if (c.z + c.radius < z0 - 0.5 || c.z - c.radius > z1 + 0.5 || !c.obb) continue;
        _cars.push(c);
      }
    }
    for (let i = 0; i < N; i++) { gy[i] = this.ground(i); dep[i] = 0; }
    // tone and brace fade
    const tone = this.tone > 0 && !this.hit ? 0.35 * (1 - sstep(0, this.tone, this.t)) : 0;
    const brace = this.brace && !this.hit && this.t < 1 ? 0.06 : 0;
    for (let it = 0; it < RAG.iter; it++) {
      solve(G, x, y, z);
      const D = RAG.dbg;
      if (tone > 0 && !D.noTone) for (const [i, j, L] of this.keep) this.pull(i, j, L, tone);
      if (brace > 0 && !D.noBrace) this.reach(brace);
      if (!D.noLimits) this.limits();
      this.collide();
    }
    // a contact: no speed out of the ground from being pushed out of it (inelastic), and friction:
    // it takes up to mu x what it pushed out off the sliding
    let touch = false;
    for (let i = 0; i < N; i++) {
      const d = dep[i];
      if (!(d > 0)) continue;
      if (TRUNK[i]) touch = true;
      if (y[i] > py[i]) py[i] = y[i];
      const vx = x[i] - px[i], vz = z[i] - pz[i], vt = Math.hypot(vx, vz), red = RAG.mu * d;
      if (vt <= red) { px[i] = x[i]; pz[i] = z[i]; } else { const f = 1 - red / vt; px[i] = x[i] - vx * f; pz[i] = z[i] - vz * f; }
      // a hard landing of the trunk or the head: a thud (and he is limp from then on)
      if (TRUNK[i] && d / h > RAG.thud && this.t > 0.05) {
        if (this.t - this.thudT > 0.25) { this.thudT = this.t; g?.onBodyBounce?.(this.ch); }
        this.hit = true;
      }
    }
    if (touch) {
      const k = Math.exp(-RAG.tumble * h);
      for (let i = 0; i < N; i++) { px[i] = x[i] - (x[i] - px[i]) * k; py[i] = y[i] - (y[i] - py[i]) * k; pz[i] = z[i] - (z[i] - pz[i]) * k; }
    }
  }

  // A limb's twist follows its upper bone (carried along square to it) and turns towards the plane its
  // elbow or knee bends in, as far as it is bent (an elbow bends forward, a knee back: the twist is
  // lower x upper for an arm, upper x lower for a leg). The hinges are a pose's: the points bend any
  // way, the shoulder or the hip turning the limb to it.
  turnLimbs() {
    const { x, y, z } = this;
    for (let s = 0; s < 4; s++) {
      const k = s & 1, arm = s < 2, S = (arm ? SR : HR) + k, E = (arm ? ER : KR) + k, W = (arm ? WR : AR) + k, tw = this.twist[s];
      _e1.set(x[E] - x[S], y[E] - y[S], z[E] - z[S]).normalize();
      _e2.set(x[W] - x[E], y[W] - y[E], z[W] - z[E]).normalize();
      if (arm) _e3.crossVectors(_e2, _e1); else _e3.crossVectors(_e1, _e2);
      const bend = _e3.length();
      if (bend > 0.2) tw.lerp(_e3.divideScalar(bend), Math.min(1, (bend - 0.2) * 2) * 0.5);
      tw.addScaledVector(_e1, -tw.dot(_e1));
      if (tw.lengthSq() < 1e-8) tw.set(_e1.y, -_e1.x, 0);
      tw.normalize();
      if (arm) continue;
      // a hip turns the leg in or out only so far (0.8 rad) from the pelvis' left
      _e2.set(x[HL] - x[HR], y[HL] - y[HR], z[HL] - z[HR]); _e2.addScaledVector(_e1, -_e2.dot(_e1));
      if (_e2.lengthSq() < 1e-8) continue;
      _e2.normalize(); _e3.crossVectors(_e1, _e2);
      const a = Math.atan2(tw.dot(_e3), tw.dot(_e2)), a2 = Math.max(-0.8, Math.min(0.8, a));
      if (a2 !== a) tw.copy(_e2).multiplyScalar(Math.cos(a2)).addScaledVector(_e3, Math.sin(a2));
    }
  }

  // The floor under point i: the ground, a block's top within 0.3 m of its bottom, a car's roof.
  ground(i) {
    const yb = this.y[i] - this.G.r[i];
    let h = groundAt(this.x[i], this.z[i], yb, 0.3);
    for (const c of _cars) {
      const top = c.y + c.height;
      if (top > yb + 0.3 || top <= h) continue;
      const o = c.obb, dx = this.x[i] - o.x, dz = this.z[i] - o.z;
      if (Math.abs(dx * o.fx + dz * o.fz) <= o.hz && Math.abs(-dx * o.fz + dz * o.fx) <= o.hx) h = top;
    }
    return h;
  }

  pull(i, j, L, s) {
    const { x, y, z } = this, w = this.G.w;
    const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const k = (d - L) / d / (w[i] + w[j]) * s;
    x[i] += dx * k * w[i]; y[i] += dy * k * w[i]; z[i] += dz * k * w[i];
    x[j] -= dx * k * w[j]; y[j] -= dy * k * w[j]; z[j] -= dz * k * w[j];
  }

  // Hands out against the fall: the wrists drawn towards a point ahead of the chest, low.
  reach(s) {
    const { x, y, z } = this, [bx, bz] = this.brace;
    for (const i of [WR, WL]) {
      const side = i === WR ? -1 : 1;
      // (the chest's own left: its shoulders)
      const lx = x[SL] - x[SR], lz = z[SL] - z[SR], ll = Math.hypot(lx, lz) || 1;
      const tx = x[CF] + bx * 0.45 + side * lx / ll * 0.2, ty = y[CF] - 0.25, tz = z[CF] + bz * 0.45 + side * lz / ll * 0.2;
      x[i] += (tx - x[i]) * s; y[i] += (ty - y[i]) * s; z[i] += (tz - z[i]) * s;
    }
  }

  // Hips in a cone (soft), knees that don't bend forward. (Moving a point onto a hinge's plane outright
  // made the body fly apart: a limb near the axis jumps from side to side.)
  limits() {
    const { x, y, z } = this, w = this.G.w;
    // the pelvis' frame: left (hips), up (to the spine), forward
    const cx = (x[HR] + x[HL]) / 2, cy = (y[HR] + y[HL]) / 2, cz = (z[HR] + z[HL]) / 2;
    let ax = x[HL] - x[HR], ay = y[HL] - y[HR], az = z[HL] - z[HR];
    let l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    let ux = x[SP] - cx, uy = y[SP] - cy, uz = z[SP] - cz;
    const ua = ux * ax + uy * ay + uz * az; ux -= ax * ua; uy -= ay * ua; uz -= az * ua;
    l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const fx = ay * uz - az * uy, fy = az * ux - ax * uz, fz = ax * uy - ay * ux;
    for (const s of [0, 1]) {
      const H = HR + s, K = KR + s, A = AR + s, side = s ? 1 : -1;
      // the thigh in the pelvis' frame: flexion (forward +) and abduction (out +)
      let tx = x[K] - x[H], ty = y[K] - y[H], tz = z[K] - z[H];
      const tl = Math.hypot(tx, ty, tz) || 1e-9;
      const dx = (tx * ax + ty * ay + tz * az) / tl, dy = (tx * ux + ty * uy + tz * uz) / tl, dz = (tx * fx + ty * fy + tz * fz) / tl;
      let ab = Math.asin(Math.max(-1, Math.min(1, side * dx))), fl = Math.atan2(dz, -dy);
      const ab2 = Math.max(-0.35, Math.min(1.0, ab)), fl2 = Math.max(-0.5, Math.min(2.2, fl));
      if ((ab2 !== ab || fl2 !== fl) && !RAG.dbg.noHip) {
        // (a fifth of the way a pass, at most 2 cm, the knee and the hip shared by their weights)
        const ca = Math.cos(ab2), nx = side * Math.sin(ab2), ny = -ca * Math.cos(fl2), nz = ca * Math.sin(fl2);
        let ex = x[H] + (ax * nx + ux * ny + fx * nz) * tl - x[K], ey = y[H] + (ay * nx + uy * ny + fy * nz) * tl - y[K], ez = z[H] + (az * nx + uz * ny + fz * nz) * tl - z[K];
        const el = Math.hypot(ex, ey, ez), f = Math.min(0.2, 0.02 / (el || 1)), wk = w[K] / (w[K] + w[H]), wh = 1 - wk;
        ex *= f; ey *= f; ez *= f;
        x[K] += ex * wk; y[K] += ey * wk; z[K] += ez * wk;
        x[H] -= ex * wh; y[H] -= ey * wh; z[H] -= ez * wh;
      }
      // the knee: in front of the line from the hip to the ankle (the pelvis' forward made square to it)
      if (!RAG.dbg.noKnee) ahead(this, H, K, A, fx, fy, fz);
    }
  }

  // Points against the ground (always) and the walls and the cars' sides.
  collide() {
    const { x, y, z, gy, dep } = this, r = this.G.r;
    for (let i = 0; i < N; i++) {
      const ri = r[i];
      if (!(ri > 0)) continue;
      const yb = y[i] - ri;
      for (const b of _blocks) {
        const top = b.shape === RAMP ? topAt(b, x[i], z[i]) : b.top;
        if (top <= yb + 0.3) continue;
        if (b.bottom !== undefined && b.bottom > y[i] + ri) continue;
        if (!circleVsBlock(x[i], z[i], ri, b, _hit)) continue;
        x[i] += _hit.nx * _hit.depth; z[i] += _hit.nz * _hit.depth;
      }
      for (const c of _cars) {
        if (c.y + c.height <= yb + 0.3 || c.y > y[i] + ri) continue;
        if (!carHit(x[i], z[i], ri, c.obb)) continue;
        x[i] += _hit.nx * _hit.depth; z[i] += _hit.nz * _hit.depth;
      }
      const fl = gy[i] + ri;
      if (y[i] < fl) { dep[i] += fl - y[i]; y[i] = fl; }
    }
  }

  // He lies still: the root under his hips, turned along his body, the points frozen in its frame; on
  // his back (feet to +z) or his front (head to +z: he pushes himself up and stands facing that way,
  // models.js downPose, anim.prone), whichever is the nearer; how far he rolls to it; how long until
  // he is up.
  freeze(gy) {
    const ch = this.ch, { x, y, z } = this;
    const cx = (x[HR] + x[HL]) / 2, cy = (y[HR] + y[HL]) / 2, cz = (z[HR] + z[HL]) / 2;
    // the pelvis' frame: left, up (to the head), front
    _e1.set(x[HL] - x[HR], y[HL] - y[HR], z[HL] - z[HR]).normalize();
    _e2.set(x[SP] - cx, y[SP] - cy, z[SP] - cz); _e2.addScaledVector(_e1, -_e2.dot(_e1)).normalize();
    _e3.crossVectors(_e1, _e2);
    const prone = _e3.y < 0;
    // head to -z on his back, +z on his front ((sitting or kneeling up: the way he faces)
    const hl = Math.hypot(_e2.x, _e2.z), wk = sstep(0.2, 0.5, hl), sg = _e2.y >= 0 ? 1 : -1, hd = prone ? 1 : -1;
    let fx = _e2.x * hd * wk + _e3.x * sg * (1 - wk), fz = _e2.z * hd * wk + _e3.z * sg * (1 - wk);
    if (Math.hypot(fx, fz) < 1e-3) { fx = Math.sin(ch.yaw); fz = Math.cos(ch.yaw); }
    const yaw = Math.atan2(fx, fz), c = Math.cos(yaw), s = Math.sin(yaw);
    ch.yaw = yaw; ch.x = cx; ch.z = cz; ch.y = gy;
    ch.vx = ch.vz = ch.vy = 0;
    for (let i = 0; i < N; i++) {
      const dx = x[i] - cx, dy = y[i] - gy, dz = z[i] - cz;
      x[i] = dx * c - dz * s; y[i] = dy; z[i] = dx * s + dz * c;
      this.px[i] = x[i]; this.py[i] = y[i]; this.pz[i] = z[i];
    }
    for (const tw of this.twist) { const tx = tw.x; tw.x = tx * c - tw.z * s; tw.z = tx * s + tw.z * c; }
    // the roll about the root's z from flat on his back (front up) or front (front down) to how he lies
    const fl = _e3.x * c - _e3.z * s, fu = _e3.y;
    this.roll = prone ? Math.atan2(fl, -fu) : Math.atan2(-fl, fu);
    this.prone = prone;
    ch.anim.prone = prone;
    this.rollT = 0.4 + 0.5 * Math.abs(this.roll) / (Math.PI / 2);
    this.frozen = true;
    this.downFor = this.rollT + this.lie + 1.3;
  }

  // The bones from the points into pose P (animateCharacter). Lying still (frozen) and Q given (the
  // get-up's first pose, models.js downPose): the points move from where he lies to that pose's own
  // (fk), the bones' lengths kept and nothing under the ground, over rollT s; the bones from those,
  // the last of the way into Q itself, and then Q as it is. (Turning the bones instead rolled him
  // over his own outstretched arm, through the road.)
  pose(m, P, Q) {
    const G = this.G, bi = m.bi, OFF = P.length - 3, ch = this.ch;
    const k = this.frozen && Q ? sstep(0, this.rollT, ch.downT) : 0;
    if (k >= 1) {
      for (const name of NAMES) { const b = bi[name] * 3; P[b] = Q[b]; P[b + 1] = Q[b + 1]; P[b + 2] = Q[b + 2]; }
      P[OFF] = Q[OFF]; P[OFF + 1] = Q[OFF + 1]; P[OFF + 2] = Q[OFF + 2];
      return;
    }
    const { x, y, z } = this, X = _X, Y = _Y, Z = _Z, tw = _tw;
    // into the root's frame (frozen: they are)
    let ox = 0, oy = 0, oz = 0, c = 1, s = 0;
    if (!this.frozen) { ox = ch.x; oy = ch.y; oz = ch.z; c = Math.cos(ch.yaw); s = Math.sin(ch.yaw); }
    for (let i = 0; i < N; i++) {
      const dx = x[i] - ox, dz = z[i] - oz;
      X[i] = dx * c - dz * s; Y[i] = y[i] - oy; Z[i] = dx * s + dz * c;
    }
    for (let i = 0; i < 4; i++) { const t = this.twist[i]; tw[i].set(t.x * c - t.z * s, t.y, t.x * s + t.z * c); }
    if (k > 0) {
      fk(m, Q, G, _TX, _TY, _TZ, _ttw);
      for (let i = 0; i < N; i++) { X[i] += (_TX[i] - X[i]) * k; Y[i] += (_TY[i] - Y[i]) * k; Z[i] += (_TZ[i] - Z[i]) * k; }
      for (let i = 0; i < 4; i++) tw[i].lerp(_ttw[i], k).normalize();
      for (let it = 0; it < 8; it++) { solve(G, X, Y, Z); for (let i = 0; i < N; i++) if (Y[i] < G.r[i]) Y[i] = G.r[i]; }
    }
    const d = (i, j) => [X[j] - X[i], Y[j] - Y[i], Z[j] - Z[i]];
    const W = _W, rest = G.rest;
    const world = (name, u, v) => frameQ(u[0], u[1], u[2], v[0], v[1], v[2], W[name]).multiply(rest[name]);
    const hc = [(X[HR] + X[HL]) / 2, (Y[HR] + Y[HL]) / 2, (Z[HR] + Z[HL]) / 2];
    const lat = d(HR, HL), shl = d(SR, SL);
    world('pelvis', [X[SP] - hc[0], Y[SP] - hc[1], Z[SP] - hc[2]], lat);
    const ll = Math.hypot(...lat) || 1, sl = Math.hypot(...shl) || 1;
    world('spine', d(SP, CH), [lat[0] / ll + shl[0] / sl, lat[1] / ll + shl[1] / sl, lat[2] / ll + shl[2] / sl]);
    world('chest', d(CH, NK), shl);
    world('neck', d(NK, HD), shl);
    for (const [k, n] of [[0, 'R'], [1, 'L']]) {
      const l = [tw[2 + k].x, tw[2 + k].y, tw[2 + k].z];
      world('thigh' + n, d(HR + k, KR + k), l); world('shin' + n, d(KR + k, AR + k), l); world('foot' + n, d(AR + k, TR + k), l);
      const t = [tw[k].x, tw[k].y, tw[k].z];
      world('arm' + n, d(SR + k, ER + k), t); world('fore' + n, d(ER + k, WR + k), t); world('hand' + n, d(WR + k, FR + k), t);
    }
    // locals (pelvis: under the root)
    const L = _L;
    L.pelvis.copy(W.pelvis);
    loc(L.spine, W.pelvis, W.spine); loc(L.chest, W.spine, W.chest);
    loc(_q, W.chest, W.neck); L.neck.identity().slerp(_q, 0.55); L.head.copy(L.neck).invert().multiply(_q);
    for (const n of ['R', 'L']) {
      loc(L['thigh' + n], W.pelvis, W['thigh' + n]); loc(L['shin' + n], W['thigh' + n], W['shin' + n]); loc(L['foot' + n], W['shin' + n], W['foot' + n]);
      loc(L['arm' + n], W.chest, W['arm' + n]); loc(L['fore' + n], W['arm' + n], W['fore' + n]); loc(L['hand' + n], W['fore' + n], W['hand' + n]);
    }
    let offx = hc[0], offy = hc[1] - G.hipY, offz = hc[2];
    // the last of the way: into Q's own bones (the points can't say how a head or a hand turns)
    const kq = sstep(0.65, 1, k);
    if (kq > 0) {
      for (const name of NAMES) {
        const b = bi[name] * 3;
        L[name].slerp(_qt.setFromEuler(_eu.set(Q[b], Q[b + 1], Q[b + 2], 'XYZ')), kq);
      }
      offx += (Q[OFF] - offx) * kq; offy += (Q[OFF + 1] - offy) * kq; offz += (Q[OFF + 2] - offz) * kq;
    }
    for (const name of NAMES) {
      const b = bi[name];
      _eu.setFromQuaternion(L[name], 'XYZ');
      P[b * 3] = _eu.x; P[b * 3 + 1] = _eu.y; P[b * 3 + 2] = _eu.z;
    }
    P[OFF] = offx; P[OFF + 1] = offy; P[OFF + 2] = offz;
  }
}

// The points and the limbs' twists (arm R, L, leg R, L) of pose Q in the root's frame: the bones'
// matrices from their rest offsets and Q's angles (the pelvis at Q's offset), as animateCharacter
// would set them.
const _FW = {}, _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fs = new THREE.Vector3(1, 1, 1), _fp = new THREE.Vector3();
function fk(m, Q, G, X, Y, Z, tw) {
  const OFF = Q.length - 3, bi = m.bi, R = G.R, O = G.O;
  for (const n of NAMES) {
    const i = bi[n], b = m.bones[i];
    if (n === 'pelvis') _fp.set(Q[OFF], G.hipY + Q[OFF + 1], Q[OFF + 2]); else _fp.copy(b.position);
    _fq.setFromEuler(_eu.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2], 'XYZ'));
    _fm.compose(_fp, _fq, _fs);
    const W = (_FW[n] ||= new THREE.Matrix4());
    if (n === 'pelvis') W.copy(_fm); else W.multiplyMatrices(_FW[b.parent.name], _fm);
  }
  for (let i = 0; i < N; i++) {
    _v.set(R[i * 3] - O[i * 3], R[i * 3 + 1] - O[i * 3 + 1], R[i * 3 + 2] - O[i * 3 + 2]).applyMatrix4(_FW[BONE[i]]);
    X[i] = _v.x; Y[i] = _v.y; Z[i] = _v.z;
  }
  ['armR', 'armL', 'thighR', 'thighL'].forEach((n, i) => tw[i].setFromMatrixColumn(_FW[n], 0).normalize());
}

// The sticks and the ranges, one pass, over points X, Y, Z.
function solve(G, X, Y, Z) {
  const w = G.w, ci = G.ci, cj = G.cj, lo = G.lo, hi = G.hi, nc = G.n;
  for (let q = 0; q < nc; q++) {
    const i = ci[q], j = cj[q];
    const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const L = d < lo[q] ? lo[q] : d > hi[q] ? hi[q] : d;
    if (L === d || (RAG.dbg.noRanges && lo[q] !== hi[q])) continue;
    const k = (d - L) / d / (w[i] + w[j]);
    X[i] += dx * k * w[i]; Y[i] += dy * k * w[i]; Z[i] += dz * k * w[i];
    X[j] -= dx * k * w[j]; Y[j] -= dy * k * w[j]; Z[j] -= dz * k * w[j];
  }
}

// a circle against a car's box (collision.js circleVsObb, inlined for _hit)
function carHit(x, z, r, o) {
  const rx = -o.fz, rz = o.fx, dx = x - o.x, dz = z - o.z;
  const lx = dx * rx + dz * rz, lz = dx * o.fx + dz * o.fz;
  const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
  let nlx = lx - qx, nlz = lz - qz;
  const d2 = nlx * nlx + nlz * nlz;
  if (d2 > r * r) return false;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); nlx /= d; nlz /= d; _hit.depth = r - d; }
  else {
    const ex = o.hx - Math.abs(lx), ez = o.hz - Math.abs(lz);
    if (ex < ez) { nlx = Math.sign(lx) || 1; nlz = 0; _hit.depth = ex + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; _hit.depth = ez + r; }
  }
  _hit.nx = nlx * rx + nlz * o.fx; _hit.nz = nlx * rz + nlz * o.fz;
  return true;
}

// Point K of a bent limb (H - K - A) kept on the side n of the line H - A (n made square to it): a
// knee in front of the leg's line, never bent the wrong way. Position-based: K moves along n, H and A
// against it, by their weights (momentum kept, nothing thrown).
function ahead(R, H, K, A, nx, ny, nz) {
  const { x, y, z } = R, w = R.G.w;
  const dx = x[A] - x[H], dy = y[A] - y[H], dz = z[A] - z[H], dl2 = dx * dx + dy * dy + dz * dz;
  if (dl2 < 1e-8) return;
  let t = ((x[K] - x[H]) * dx + (y[K] - y[H]) * dy + (z[K] - z[H]) * dz) / dl2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nd = (nx * dx + ny * dy + nz * dz) / dl2;
  nx -= dx * nd; ny -= dy * nd; nz -= dz * nd;
  const nl = Math.hypot(nx, ny, nz); if (nl < 1e-6) return;
  nx /= nl; ny /= nl; nz /= nl;
  // C = n . (K - (1 - t) H - t A) >= 0
  const C = nx * (x[K] - (1 - t) * x[H] - t * x[A]) + ny * (y[K] - (1 - t) * y[H] - t * y[A]) + nz * (z[K] - (1 - t) * z[H] - t * z[A]);
  if (C >= 0) return;
  const a = 1 - t, b = t, sm = w[K] + a * a * w[H] + b * b * w[A], s = -C / sm;
  x[K] += nx * s * w[K]; y[K] += ny * s * w[K]; z[K] += nz * s * w[K];
  x[H] -= nx * s * w[H] * a; y[H] -= ny * s * w[H] * a; z[H] -= nz * s * w[H] * a;
  x[A] -= nx * s * w[A] * b; y[A] -= ny * s * w[A] * b; z[A] -= nz * s * w[A] * b;
}

const NAMES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'armR', 'foreR', 'handR', 'armL', 'foreL', 'handL', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL'];
const _X = new Float64Array(N), _Y = new Float64Array(N), _Z = new Float64Array(N);
const _tw = [0, 1, 2, 3].map(() => new THREE.Vector3());
const _W = {}, _L = {};
for (const n of [...NAMES, 'neck']) { _W[n] = new THREE.Quaternion(); _L[n] = new THREE.Quaternion(); }
const _q = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _eu = new THREE.Euler();
const _TX = new Float64Array(N), _TY = new Float64Array(N), _TZ = new Float64Array(N), _ttw = [0, 1, 2, 3].map(() => new THREE.Vector3());
// child's rotation relative to its parent's (both in the same frame)
function loc(out, parent, child) { return out.copy(parent).invert().multiply(child); }
