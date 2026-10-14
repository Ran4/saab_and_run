// Everything you hear is synthesised (but the voices and the composed score, voice.js and the
// director below, and Ove's own jump grunts, EFFORTS): a Saab four-cylinder with fake gear changes,
// tyre hiss and snow crunch, a dual-tone horn per make, an old Swedish landline ring, a carpenter's pencil
// on paper, a rubber stamp, a doorbell, a cat, footsteps in snow - and a sparse, melancholic
// piano-and-strings score in A minor (generative, so it never loops the same bars).
//
// Every sound goes through `sfx` (or the music bus) -> master -> a gentle compressor. A small
// synthesised room reverb is shared by the music and the "domestic" sounds (bells, phone).
// Contract: DESIGN.md section 9; notes/ui.md.

let ctx = null, S = null;           // the live AudioContext and its node graph (see setup())
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MUSIC_LEVEL = 0.36;
const VOICE_LEVEL = 0.9;
// A telephone's gentle saturation (tanh, slightly asymmetric).
const PHONE_CURVE = (() => { const n = 1024, k = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; k[i] = Math.tanh(2.2 * (x + 0.04)) / Math.tanh(2.2); } return k; })();

// ---------------------------------------------------------------------------------------------
// Graph

function setup(c) {
  const s = { c };
  s.master = c.createGain();
  s.master.gain.value = audio.muted ? 0 : 0.75;
  s.comp = c.createDynamicsCompressor();
  s.comp.threshold.value = -16; s.comp.knee.value = 12; s.comp.ratio.value = 4;
  s.comp.attack.value = 0.004; s.comp.release.value = 0.22;
  s.master.connect(s.comp).connect(c.destination);
  s.sfx = c.createGain(); s.sfx.gain.value = 1; s.sfx.connect(s.master);
  s.musicBus = c.createGain(); s.musicBus.gain.value = audio.musicOn ? MUSIC_LEVEL : 0;
  s.duck = c.createGain(); s.duck.gain.value = 1;
  // (under speech the music steps back ~8 dB: voiceDuck)
  s.vduck = c.createGain(); s.vduck.gain.value = 1;
  s.musicBus.connect(s.vduck).connect(s.duck).connect(s.master);
  // The generative piano has its own gain: it gives way when a composed cue plays (audio.music).
  s.piano = c.createGain(); s.piano.gain.value = 1; s.piano.connect(s.musicBus);
  // Reverb: a synthesised stereo room tail (2.6 s, darker as it decays).
  s.verb = c.createConvolver();
  s.verb.buffer = makeImpulse(c, 2.6);
  s.verbOut = c.createGain(); s.verbOut.gain.value = 0.9;
  s.verb.connect(s.verbOut).connect(s.master);
  s.musicVerb = c.createGain(); s.musicVerb.gain.value = 0.55;
  s.vduck.connect(s.musicVerb).connect(s.verb);
  s.sfxVerb = c.createGain(); s.sfxVerb.gain.value = 1; s.sfxVerb.connect(s.verb);
  // The voices (voice.js): their own bus beside the effects and the music, its own level.
  s.voiceBus = c.createGain(); s.voiceBus.gain.value = VOICE_LEVEL * audio.voiceLevel;
  s.voiceBus.connect(s.master);
  // (and the engine steps back ~4 dB under speech)
  s.engDuck = c.createGain(); s.engDuck.gain.value = 1; s.engDuck.connect(s.sfx);
  s.noise = makeNoise(c);
  s.crunch = makeCrunch(c);
  s.pianoWave = c.createPeriodicWave(new Float32Array(12), Float32Array.from([0, 1, 0.42, 0.24, 0.17, 0.1, 0.07, 0.05, 0.034, 0.022, 0.014, 0.009]));
  s.bellA = makeBell(c, 1310, 0.45);
  s.bellB = makeBell(c, 1460, 0.42);
  buildEngine(s);
  buildTyres(s);
  return s;
}

function makeNoise(c) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Granular snow crunch: thousands of tiny resonant cracks whose density and loudness swell in
// bursts (the "squeak-crunch" of compacting snow). Looped for tyres, sliced for footsteps.
function makeCrunch(c) {
  const sr = c.sampleRate, len = sr * 2;
  const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  let env = 0.5, envT = 0, envTarget = 0.5, t = 0;
  while (t < len) {
    if (t >= envT) { envTarget = Math.pow(Math.random(), 0.7); envT = t + sr * rnd(0.02, 0.07); }
    env += (envTarget - env) * 0.35;
    const gl = Math.floor(sr * rnd(0.0015, 0.007));
    const amp = Math.pow(Math.random(), 2.4) * env;
    const f = rnd(900, 6500), r = rnd(0.86, 0.95), w = (2 * Math.PI * f) / sr;
    const a1 = 2 * r * Math.cos(w), a2 = -r * r;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < gl && t + i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.exp(-i / (gl * 0.28));
      const y = x + a1 * y1 + a2 * y2;
      y2 = y1; y1 = y;
      d[t + i] += y * amp * 0.12;
    }
    t += Math.floor(sr * rnd(0.0008, 0.0016 + 0.006 * (1 - env)));
  }
  // Crossfade the ends so the loop has no click.
  const xf = Math.floor(sr * 0.02);
  for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len - xf + i] * (1 - k); }
  // Normalise by RMS, not by peak (one loud grain used to set the level of everything: the
  // buffer's loudness varied ~6 dB from session to session), then soft-clip the outliers.
  // CRUNCH_RMS is the old buffers' typical level, so the tyres, skids and pen keep their mix.
  let ss = 0;
  for (let i = 0; i < len; i++) ss += d[i] * d[i];
  const g = CRUNCH_RMS / (Math.sqrt(ss / len) || 1);
  for (let i = 0; i < len; i++) d[i] = 0.9 * Math.tanh((d[i] * g) / 0.9);
  // Footsteps get their own copy with the spikes squashed (a dense, even crunch: a random slice of
  // the bursty buffer varied 6-11 dB from step to step) and the offsets of the slices within
  // ±1 dB of the median (b.step, b.step.slices).
  const st = c.createBuffer(1, len, sr), q = st.getChannelData(0);
  for (let i = 0; i < len; i++) q[i] = 0.1 * Math.tanh((d[i] / CRUNCH_RMS) * 0.4);
  // Judge each slice as the step hears it: through its band-pass (~1.85 kHz, Q 0.6), weighted by
  // the step's decaying envelope.
  const bp = new Float32Array(len);
  {
    const w0 = (2 * Math.PI * 1850) / sr, al = Math.sin(w0) / (2 * 0.6), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) { const y = b0 * q[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = q[i]; y2 = y1; y1 = y; bp[i] = y; }
  }
  const W = Math.floor(sr * 0.14), cand = [];
  for (let k = 0; k < 80; k++) {
    const a = Math.floor(sr * 0.05 + (k / 80) * (len - sr * 0.35));
    let e = 0;
    for (let i = 0; i < W; i++) { const v = bp[a + i]; e += v * v * (1 - i / W); }
    cand.push([a / sr, 10 * Math.log10(e / W + 1e-12)]);
  }
  const med = cand.map((x) => x[1]).sort((x, y) => x - y)[cand.length >> 1];
  st.slices = cand.filter((x) => Math.abs(x[1] - med) <= 1).map((x) => x[0]);
  b.step = st;
  return b;
}
const CRUNCH_RMS = 0.045;

// One strike of a small telephone bell: inharmonic partials, the high ones dying first.
function makeBell(c, f0, dur) {
  const sr = c.sampleRate, len = Math.floor(sr * dur);
  const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  const P = [[1, 1, 0.16], [2.32, 0.55, 0.09], [3.86, 0.35, 0.05], [5.4, 0.2, 0.03], [7.1, 0.1, 0.02]];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let v = 0;
    for (const [m, a, tau] of P) v += a * Math.sin(2 * Math.PI * f0 * m * t) * Math.exp(-t / tau);
    d[i] = v * 0.4 * Math.min(1, t / 0.0008);
  }
  return b;
}

function makeImpulse(c, secs) {
  const sr = c.sampleRate, len = Math.floor(sr * secs);
  const b = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.55 + 0.42 * t;                       // the tail gets darker
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      const early = i < sr * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.5 : 0;
      d[i] = (lp * 2.2 + early) * Math.pow(1 - t, 2.2) * Math.min(1, i / (sr * 0.012));
    }
  }
  return b;
}

// ---------------------------------------------------------------------------------------------
// Engine: a Saab four (two firings per crank turn: f = rpm / 30), five fake gears.

function buildEngine(s) {
  const c = s.c;
  const e = s.eng = { on: false, rpm: 0, gear: 1, shiftT: 0, last: 0, offT: 0, startT: -10, boost: 0, lastLoad: 0 };
  // Exhaust tone: harmonics of the firing frequency, strongest low, a bump around the 4th-6th.
  const real = new Float32Array(17), imag = new Float32Array(17);
  const amps = [0, 1, 0.75, 0.42, 0.5, 0.38, 0.3, 0.16, 0.2, 0.1, 0.08, 0.06, 0.05, 0.035, 0.03, 0.02, 0.015];
  for (let i = 1; i < 17; i++) { imag[i] = amps[i] * (i % 2 ? 1 : -1); real[i] = amps[i] * 0.3 * Math.sin(i * 1.7); }
  e.wave = c.createPeriodicWave(real, imag);
  e.o1 = c.createOscillator(); e.o1.setPeriodicWave(e.wave);
  e.o2 = c.createOscillator(); e.o2.type = 'sine';                 // half order: the crank's lope
  e.o3 = c.createOscillator(); e.o3.type = 'sawtooth'; e.o3.detune.value = 9; // a little valvetrain buzz
  e.g1 = c.createGain(); e.g1.gain.value = 0.9;
  e.g2 = c.createGain(); e.g2.gain.value = 0.2;    // (kept low: at idle it is a ~13 Hz sine)
  e.g3 = c.createGain(); e.g3.gain.value = 0.04;    // (0.07 buzzed at full throttle)
  e.drive = c.createGain(); e.drive.gain.value = 1;
  e.shape = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  e.shape.curve = curve;
  // Everything below ~35 Hz (the half order, and the firing fundamental at idle) is inaudible on
  // most speakers but would eat the master compressor's headroom and throb: high-pass it. The
  // ear still hears the idle pitch from the harmonics.
  e.hp = c.createBiquadFilter(); e.hp.type = 'highpass'; e.hp.frequency.value = 35; e.hp.Q.value = 0.7;
  e.body = c.createBiquadFilter(); e.body.type = 'peaking'; e.body.frequency.value = 105; e.body.Q.value = 1.1; e.body.gain.value = 5;
  e.lp = c.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.Q.value = 0.8; e.lp.frequency.value = 500;
  e.am = c.createGain(); e.am.gain.value = 1;
  e.lfo = c.createOscillator(); e.lfo.frequency.value = 7;
  e.lfoG = c.createGain(); e.lfoG.gain.value = 0.1;
  e.lfo.connect(e.lfoG).connect(e.am.gain);
  // Intake / exhaust rush.
  e.ns = c.createBufferSource(); e.ns.buffer = s.noise; e.ns.loop = true;
  e.nbp = c.createBiquadFilter(); e.nbp.type = 'bandpass'; e.nbp.Q.value = 1.1; e.nbp.frequency.value = 300;
  e.ng = c.createGain(); e.ng.gain.value = 0.05;
  // Turbo whistle (a Saab is a Saab).
  e.tw = c.createOscillator(); e.tw.type = 'sine'; e.tw.frequency.value = 2400;
  e.twg = c.createGain(); e.twg.gain.value = 0;
  // Starter motor.
  e.st = c.createOscillator(); e.st.type = 'sawtooth'; e.st.frequency.value = 170;
  e.stam = c.createGain(); e.stam.gain.value = 0;
  e.stlp = c.createBiquadFilter(); e.stlp.type = 'lowpass'; e.stlp.frequency.value = 1400;
  e.out = c.createGain(); e.out.gain.value = 0;
  e.o1.connect(e.g1).connect(e.drive);
  e.o2.connect(e.g2).connect(e.drive);
  e.o3.connect(e.g3).connect(e.drive);
  e.drive.connect(e.shape).connect(e.hp).connect(e.body).connect(e.lp).connect(e.am).connect(e.out);
  e.ns.connect(e.nbp).connect(e.ng).connect(e.am);
  e.tw.connect(e.twg).connect(e.out);
  e.st.connect(e.stlp).connect(e.stam).connect(s.sfx);
  e.out.connect(s.engDuck);
  for (const o of [e.o1, e.o2, e.o3, e.lfo, e.ns, e.tw, e.st]) o.start();
}

// Rolling tyres (damp asphalt hiss or packed snow), skids (squeal or crunch).
function buildTyres(s) {
  const c = s.c;
  const t = s.tyre = {};
  t.road = c.createBufferSource(); t.road.buffer = s.noise; t.road.loop = true;
  t.roadLp = c.createBiquadFilter(); t.roadLp.type = 'lowpass'; t.roadLp.frequency.value = 400; t.roadLp.Q.value = 0.5;
  t.roadG = c.createGain(); t.roadG.gain.value = 0;
  t.road.connect(t.roadLp).connect(t.roadG).connect(s.sfx);
  t.snow = c.createBufferSource(); t.snow.buffer = s.crunch; t.snow.loop = true;
  t.snowBp = c.createBiquadFilter(); t.snowBp.type = 'bandpass'; t.snowBp.frequency.value = 1100; t.snowBp.Q.value = 0.6;
  t.snowG = c.createGain(); t.snowG.gain.value = 0;
  t.snow.connect(t.snowBp).connect(t.snowG).connect(s.sfx);
  // Skid on asphalt: a wobbling, narrow squeal (quiet: cold damp roads hiss more than they sing).
  t.sq = c.createBufferSource(); t.sq.buffer = s.noise; t.sq.loop = true;
  t.sqBp = c.createBiquadFilter(); t.sqBp.type = 'bandpass'; t.sqBp.frequency.value = 1150; t.sqBp.Q.value = 9;
  t.sqTone = c.createOscillator(); t.sqTone.type = 'triangle'; t.sqTone.frequency.value = 960;
  t.sqVib = c.createOscillator(); t.sqVib.frequency.value = 7.5;
  t.sqVibG = c.createGain(); t.sqVibG.gain.value = 22;
  t.sqVib.connect(t.sqVibG).connect(t.sqTone.frequency);
  t.sqToneG = c.createGain(); t.sqToneG.gain.value = 0.12;
  t.sqG = c.createGain(); t.sqG.gain.value = 0;
  t.sq.connect(t.sqBp).connect(t.sqG);
  t.sqTone.connect(t.sqToneG).connect(t.sqG);
  t.sqG.connect(s.sfx);
  // Skid on snow: the crunch loop, lower and louder.
  t.sk = c.createBufferSource(); t.sk.buffer = s.crunch; t.sk.loop = true; t.sk.playbackRate.value = 0.8;
  t.skBp = c.createBiquadFilter(); t.skBp.type = 'bandpass'; t.skBp.frequency.value = 800; t.skBp.Q.value = 0.5;
  t.skG = c.createGain(); t.skG.gain.value = 0;
  t.sk.connect(t.skBp).connect(t.skG).connect(s.sfx);
  for (const o of [t.road, t.snow, t.sq, t.sqTone, t.sqVib, t.sk]) o.start(0, Math.random());
}

// Gear model: top speed fraction reached at ~6000 rpm in each gear.
const GEAR_TOP = [0, 0.24, 0.43, 0.63, 0.83, 1.08];
const TOP_SPEED = 38; // m/s (~137 km/h), the Saab's arcade top speed

// ---------------------------------------------------------------------------------------------
// Small building blocks for one-shot sounds.

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function osc(type, freq, t, dur, peak, { to = null, attack = 0.005, dest = null, detune = 0, wave = null } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (wave) o.setPeriodicWave(wave); else o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.detune.value = detune;
  env(g, t, peak, attack, dur);
  o.connect(g).connect(dest || S.sfx);
  o.start(t); o.stop(t + attack + dur + 0.05);
  return g;
}
// soft: a gentler tail (linear attack, then a decay with time constant dur / 3) instead of the
// exponential drop to silence, which keeps only the first ~30 ms of the slice.
function burst(t, dur, peak, freq, type = 'bandpass', q = 1, { buf = null, rate = 1, attack = 0.002, dest = null, to = null, offset = null, soft = false } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf || S.noise;
  s.playbackRate.value = rate;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (soft) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setTargetAtTime(0, t + attack, dur / 3); }
  else env(g, t, peak, attack, dur);
  s.connect(f).connect(g).connect(dest || S.sfx);
  s.start(t, offset ?? Math.random() * (s.buffer.duration - dur - 0.1 > 0 ? s.buffer.duration - dur - 0.1 : 0));
  s.stop(t + attack + dur + 0.05);
  return g;
}
const now = (d = 0) => ctx.currentTime + d;
const verbSend = (node, amount) => { const g = ctx.createGain(); g.gain.value = amount; node.connect(g).connect(S.sfxVerb); };

// A soft piano note (two slightly detuned strings, a damped bright attack, a hammer knock).
function piano(m, t, vel, dur, dest) {
  const f = mtof(m);
  const g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.4;
  const pitchN = clamp((m - 36) / 60, 0, 1);
  lp.frequency.setValueAtTime(Math.min(10000, f * (3 + 10 * vel)), t);
  lp.frequency.setTargetAtTime(f * 1.5 + 250, t + 0.01, 0.3 + (1 - pitchN) * 0.6);
  const tau = 0.9 + (1 - pitchN) * 2.6;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.005);
  g.gain.setTargetAtTime(vel * 0.13, t + 0.005, 0.08);
  g.gain.setTargetAtTime(0, t + 0.25, tau);
  g.gain.setTargetAtTime(0, t + dur, 0.28);
  for (const det of [-3.5, 3.5]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(S.pianoWave);
    o.frequency.value = f; o.detune.value = det;
    o.connect(lp);
    o.start(t); o.stop(t + dur + 1.6);
  }
  lp.connect(g).connect(dest);
  // Hammer.
  const hs = ctx.createBufferSource(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
  hs.buffer = S.noise; hf.type = 'bandpass'; hf.frequency.value = Math.min(6000, f * 3); hf.Q.value = 0.7;
  env(hg, t, vel * 0.025, 0.002, 0.035);
  hs.connect(hf).connect(hg).connect(dest);
  hs.start(t, Math.random()); hs.stop(t + 0.06);
}

// A soft string pad chord: detuned saws with a slow bow, vibrato, warm low-pass.
function pad(notes, t, dur, vel, dest) {
  const f = ctx.createBiquadFilter(), g = ctx.createGain(), hs = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.3;
  hs.type = 'highshelf'; hs.frequency.value = 2500; hs.gain.value = -9;
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(vel, t, 0.7);
  g.gain.setTargetAtTime(0, t + dur, 1.1);
  const vib = ctx.createOscillator(), vibG = ctx.createGain();
  vib.frequency.value = rnd(4.4, 5.2); vibG.gain.value = 5;
  vib.connect(vibG);
  vib.start(t); vib.stop(t + dur + 5);
  for (const m of notes) for (const det of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det + rnd(-2, 2);
    vibG.connect(o.detune);
    o.connect(f);
    o.start(t); o.stop(t + dur + 5);
  }
  f.connect(hs).connect(g).connect(dest);
}

// ---------------------------------------------------------------------------------------------
// Public API

export const audio = {
  muted: false,
  musicOn: true,
  gear: 1,          // the engine's current fake gear (read-only, for anyone curious)
  get ready() { return !!ctx; },
  get ringing() { return !!S?.ringer; },          // the landline bell is going (tests)
  get state() { return ctx ? ctx.state : 'none'; }, // the AudioContext's state (tests)

  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    S = setup(ctx);
    loadEfforts();
    if (this.musicOn) startMusic();
    // (a state set before the first gesture plays now)
    if (director.raw) { const st = director.raw; director.state = null; director.set(st, {}); }
  },

  // Everything stops while the tab is hidden (music, engine, a ringing phone: all of it is scheduled
  // on the context's clock, so it simply waits) and goes on when it is shown again.
  suspend(on) {
    if (!ctx) return;
    this.suspended = !!on;
    try { const p = on ? ctx.suspend() : ctx.resume(); p?.catch?.(() => {}); } catch (e) { /* closed */ }
  },

  setMuted(m) {
    this.muted = m;
    if (S) S.master.gain.setTargetAtTime(m ? 0 : 0.75, ctx.currentTime, 0.05);
  },
  setMusic(on) {
    this.musicOn = on;
    if (!S) return;
    S.musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.4);
    if (on) startMusic();
  },
  duckMusic(amount) { if (S) S.duck.gain.setTargetAtTime(clamp(amount, 0, 1), ctx.currentTime, 0.3); },
  // The composed score (assets/music/, made by tools/music/music.mjs): what should play now. State:
  // 'title', 'roam' (a playlist: a patrol cue, a pause, the generative piano a while, a pause...;
  // cold on days 1-3, warm from day 4: o.day), 'errand', 'pursuit', 'mission', 'hurry', 'race',
  // 'chase', 'memory', 'finale', 'none' (MUSIC_STATES). Changes cross-fade over 2.5 s; a cue that
  // isn't there (no files, still loading, a failed load) leaves the generative piano playing.
  music(state, o = {}) { director.set(state, o); },
  get musicState() { return director.state; },
  get musicCue() { return director.cur?.cue || (S && S.piano.gain.value > 0.5 ? 'piano' : null); },

  // ------------------------------------------------------------------------------------------
  // Voices (voice.js plays the clips; the chain they go through is here)

  voiceLevel: 1,
  get ctx() { return ctx; },
  get duckLevel() { return S ? S.vduck.gain.value : 1; },   // the music under speech (tests)
  // Tests: the RMS (dBFS) of the music and the voices as they leave their buses (analysers made on
  // first use; a window of ~0.7 s).
  levels() {
    if (!S) return null;
    if (!S.meters) {
      S.meters = {};
      for (const [k, node] of [['music', S.duck], ['voice', S.voiceBus], ['sfx', S.sfx]]) { const a = ctx.createAnalyser(); a.fftSize = 32768; node.connect(a); S.meters[k] = a; }
    }
    const out = {};
    for (const [k, a] of Object.entries(S.meters)) {
      const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
      let e = 0; for (const v of d) e += v * v;
      out[k] = +(10 * Math.log10(e / d.length + 1e-12)).toFixed(1);
    }
    return out;
  },
  setVoiceLevel(v) { this.voiceLevel = clamp(v, 0, 1.5); if (S) S.voiceBus.gain.setTargetAtTime(VOICE_LEVEL * this.voiceLevel, ctx.currentTime, 0.05); },
  // While anybody speaks the music drops ~8 dB and the engine ~4 dB (0.1 s down, 0.6 s back).
  voiceDuck(on) {
    if (!S) return;
    const t = ctx.currentTime;
    S.vduck.gain.setTargetAtTime(on ? 0.4 : 1, t, on ? 0.035 : 0.2);
    S.engDuck.gain.setTargetAtTime(on ? 0.63 : 1, t, on ? 0.035 : 0.2);
  },
  // The ears: the camera (position, forward, up).
  setListener(x, y, z, fx, fy, fz, ux, uy, uz) {
    const L = ctx?.listener;
    if (!L) return;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
    } else { L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
  },
  // One line's way to the voice bus, by mode: 'dialog' dry and centred with a touch of the room;
  // 'phone' a telephone line (300-3400 Hz, a little grit); 'car' a passenger, a little to the
  // right; 'world' / 'shout' from where the speaker stands (setPos), fading with distance, a shout
  // louder and with more room; muffle: heard from inside a car. Pitch and tempo are never touched.
  voiceChain(mode = 'dialog', { muffle = false } = {}) {
    const c = ctx, nodes = [];
    const mk = (n) => { nodes.push(n); return n; };
    const input = mk(c.createGain()), out = mk(c.createGain());
    let head = input, panner = null, verb = 0.05;
    if (mode === 'phone') {
      const hp = mk(c.createBiquadFilter()), lp = mk(c.createBiquadFilter()), sh = mk(c.createWaveShaper()), mg = mk(c.createGain());
      hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.8;
      lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.9;
      sh.curve = PHONE_CURVE;
      mg.gain.value = 1.25;
      head.connect(hp).connect(lp).connect(sh).connect(mg);
      head = mg; verb = 0;
    } else if (mode === 'car') {
      const p = mk(c.createStereoPanner());
      p.pan.value = 0.3;
      head.connect(p); head = p; verb = 0.02;
    } else if (mode === 'world' || mode === 'shout') {
      panner = mk(c.createPanner());
      Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 4, rolloffFactor: 1.1, maxDistance: 90 });
      const g = mk(c.createGain());
      g.gain.value = mode === 'shout' ? 1.35 : 1;
      head.connect(panner).connect(g); head = g;
      verb = mode === 'shout' ? 0.22 : 0.1;
    }
    if (muffle) {
      const lp = mk(c.createBiquadFilter());
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.5;
      head.connect(lp); head = lp;
    }
    head.connect(out).connect(S.voiceBus);
    if (verb) { const v = mk(c.createGain()); v.gain.value = verb; out.connect(v).connect(S.sfxVerb); }
    return {
      input, out, panner,
      setPos(x, y, z) { if (panner.positionX) { const t = c.currentTime; panner.positionX.setTargetAtTime(x, t, 0.03); panner.positionY.setTargetAtTime(y, t, 0.03); panner.positionZ.setTargetAtTime(z, t, 0.03); } else panner.setPosition(x, y, z); },
      dispose() { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } },
    };
  },

  // on: engine running; revs/load from the car (old car.js: revs = 0.85 * |v| / maxSpeed + 0.2 *
  // throttle, load = throttle); optional speed (m/s, signed) gives proper gearing and tyre noise;
  // optional surface 'snow' | 'asphalt' picks the rolling sound.
  engine(on, revs = 0, load = 0, speed = null, surface = 'asphalt') {
    if (!S) return;
    const e = S.eng, ty = S.tyre, t = ctx.currentTime;
    const dt = clamp(t - e.last, 0, 0.1);
    e.last = t;
    if (!on) {
      if (e.on) {
        e.on = false; e.offT = t;
        e.out.gain.setTargetAtTime(0, t, 0.12);
        e.o1.frequency.setTargetAtTime(14, t, 0.18); e.o2.frequency.setTargetAtTime(7, t, 0.18);
        e.twg.gain.setTargetAtTime(0, t, 0.1);
        ty.roadG.gain.setTargetAtTime(0, t, 0.15); ty.snowG.gain.setTargetAtTime(0, t, 0.15);
        e.rpm = 0;
      }
      return;
    }
    if (!e.on) {
      e.on = true;
      e.gear = 1;
      // A cold start after a while off: crank, catch, flare.
      if (t - e.offT > 2.5) {
        e.startT = t;
        e.stam.gain.cancelScheduledValues(t);
        e.stam.gain.setValueAtTime(0, t);
        for (let k = 0; k < 6; k++) { e.stam.gain.setValueAtTime(0.05, t + k * 0.105); e.stam.gain.setValueAtTime(0.018, t + k * 0.105 + 0.06); }
        e.stam.gain.setTargetAtTime(0, t + 0.62, 0.03);
        e.rpm = 250;
      } else e.rpm = Math.max(e.rpm, 800);
    }
    load = clamp(load || 0, 0, 1);
    let sf = speed != null ? Math.abs(speed) / TOP_SPEED : clamp((revs - (load > 0.05 ? 0.2 : 0)) / 0.85, 0, 1.2);
    // Gear changes with hysteresis; a short dip in load while the clutch is out.
    e.shiftT -= dt;
    if (e.shiftT <= 0) {
      const up = load > 0.6 ? 0.9 : load > 0.15 ? 0.62 : 0.48;
      if (e.gear < 5 && sf > GEAR_TOP[e.gear] * up) { e.gear++; e.shiftT = 0.24; }
      else if (e.gear > 1 && sf < GEAR_TOP[e.gear - 1] * 0.4) { e.gear--; e.shiftT = 0.16; }
    }
    this.gear = e.gear;
    let target = 800 + (sf / GEAR_TOP[e.gear]) * 5400;
    if (e.gear === 1 && sf < 0.09) target = Math.max(target, 820 + load * 2900);
    const sinceStart = t - e.startT;
    if (sinceStart < 0.65) target = 250;
    else if (sinceStart < 1.4) target = Math.max(target, 1500 - (sinceStart - 0.65) * 900);
    target = clamp(target, 0, 6400);
    const k = 1 - Math.exp(-dt / (e.shiftT > 0.1 ? 0.06 : 0.11));
    e.rpm += (target - e.rpm) * k;
    const clutch = e.shiftT > 0.08 ? 0.25 : 1;
    const ld = load * clutch;
    const f = Math.max(6, e.rpm / 30);
    const rn = clamp((e.rpm - 800) / 5400, 0, 1);
    e.o1.frequency.setTargetAtTime(f, t, 0.025);
    e.o2.frequency.setTargetAtTime(f / 2, t, 0.025);
    e.o3.frequency.setTargetAtTime(f * 2, t, 0.025);
    e.lfo.frequency.setTargetAtTime(Math.max(2, f / 4), t, 0.05);
    e.lfoG.gain.setTargetAtTime(0.13 - rn * 0.09, t, 0.1);
    // Full throttle: more growl, not more fizz (the load term used to open the low-pass to ~2.8 kHz
    // and drive the shaper hard: a buzzy ~1.5 kHz centroid ~8-11 dB over the music for a whole chase).
    e.drive.gain.setTargetAtTime(0.8 + ld * 1.0, t, 0.05);
    e.lp.frequency.setTargetAtTime(240 + f * 4.5 + ld * 800, t, 0.04);
    e.nbp.frequency.setTargetAtTime(240 + f * 3.2, t, 0.05);
    e.ng.gain.setTargetAtTime(0.03 + ld * 0.16 + rn * 0.05, t, 0.05);
    const vol = sinceStart < 0.65 ? 0.025 : 0.022 + ld * 0.03 + rn * 0.022;
    e.out.gain.setTargetAtTime(vol, t, 0.06);
    // Turbo: spools with load at revs, blows off when the throttle snaps shut.
    e.boost += ((ld > 0.5 ? rn : 0) - e.boost) * (1 - Math.exp(-dt / 0.6));
    e.tw.frequency.setTargetAtTime(1800 + e.boost * 3200, t, 0.08);
    e.twg.gain.setTargetAtTime(e.boost * 0.006, t, 0.08);
    if (e.lastLoad > 0.7 && load < 0.15 && e.boost > 0.35) {
      burst(t, 0.28, 0.035 * e.boost, 2600, 'bandpass', 1.2, { to: 1400 });
      e.boost *= 0.3;
    }
    e.lastLoad = load;
    // Tyres rolling.
    const v = speed != null ? Math.abs(speed) : sf * TOP_SPEED;
    const roll = clamp(v / 30, 0, 1.3);
    const snow = surface === 'snow', air = surface === 'air';   // ('air': off the hoppbacke, the tyres are silent)
    ty.roadLp.frequency.setTargetAtTime(220 + v * 28, t, 0.1);
    ty.roadG.gain.setTargetAtTime(air ? 0 : snow ? roll * 0.012 : Math.pow(roll, 1.4) * 0.05, t, 0.1);
    ty.snow.playbackRate.setTargetAtTime(0.5 + roll * 0.7, t, 0.1);
    ty.snowG.gain.setTargetAtTime(snow ? Math.min(1, roll * 1.6) * 0.06 : 0, t, 0.1);
  },
  // amount 0..1; surface 'snow' crunches instead of squealing.
  skid(amount, surface = 'asphalt') {
    if (!S) return;
    const ty = S.tyre, t = ctx.currentTime;
    const a = clamp(amount || 0, 0, 1);
    const snow = surface === 'snow';
    ty.sqG.gain.setTargetAtTime(snow ? 0 : a * 0.075, t, 0.05);
    ty.sqBp.frequency.setTargetAtTime(1050 + a * 250, t, 0.1);
    ty.skG.gain.setTargetAtTime(snow ? a * 0.2 : 0, t, 0.05);
    ty.sk.playbackRate.setTargetAtTime(0.7 + a * 0.5, t, 0.1);
  },

  // Generic helpers (old code calls these directly).
  tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    if (!S) return;
    // The old cartoon square waves are softened into triangles.
    osc(type === 'square' ? 'triangle' : type, freq, now(delay), dur, vol * (type === 'square' || type === 'sawtooth' ? 0.6 : 1), { to: slideTo });
  },
  noise(dur, vol = 0.2, freq = 1000, type = 'lowpass', delay = 0, q = 1) {
    if (!S) return;
    burst(now(delay), dur, vol, freq, type, q);
  },

  // A pantburk: a little aluminium clink.
  coin() {
    if (!S) return;
    const t = now();
    osc('sine', rnd(2250, 2450), t, 0.09, 0.13);
    osc('sine', rnd(3600, 3900), t + 0.003, 0.06, 0.08);
    osc('sine', rnd(5200, 5600), t + 0.002, 0.04, 0.045);
    burst(t, 0.015, 0.16, 7000, 'highpass', 0.7);
    osc('sine', 1568, t + 0.06, 0.25, 0.045);          // a quiet "kr" confirmation
  },
  // A small hop: a coat rustling and a boot pushing off the snow.
  jump() {
    if (!S) return;
    const t = now();
    burst(t, 0.13, 0.5, 1300, 'bandpass', 0.7);
    burst(t + 0.02, 0.07, 0.4, 420, 'lowpass', 0.7);
    burst(t, 0.09, 0.5, 1600, 'bandpass', 0.6, { buf: S.crunch, rate: 0.9, attack: 0.006 });
  },
  // A boot against a tyre: rubbery thunk.
  kick() {
    if (!S) return;
    const t = now();
    osc('sine', 105, t, 0.16, 0.32, { to: 58 });
    burst(t, 0.09, 0.22, 420, 'lowpass', 0.8);
    burst(t, 0.03, 0.08, 1800, 'bandpass', 1.5);
  },
  // Something breaks: a crack, a clatter, maybe glass.
  smash() {
    if (!S) return;
    const t = now();
    burst(t, 0.18, 0.22, 2200, 'highpass', 0.7);
    burst(t, 0.28, 0.2, 650, 'bandpass', 1.1);
    osc('sine', 120, t, 0.12, 0.14, { to: 60 });
    for (let k = 0; k < 6; k++) osc('sine', rnd(2800, 6200), t + rnd(0.02, 0.35), rnd(0.04, 0.12), rnd(0.008, 0.025));
  },
  // Car crash, i 0..1: thump, crumple, ringing metal, glass at the heavy end.
  crash(i = 1) {
    if (!S) return;
    i = clamp(i, 0, 1);
    const t = now();
    osc('sine', 72, t, 0.32, 0.45 * i, { to: 38 });
    burst(t, 0.42, 0.42 * i, 900, 'lowpass', 0.8);
    burst(t + 0.01, 0.25, 0.16 * i, 2400, 'bandpass', 1.4);
    for (const f of [1180, 2630, 3950]) burst(t + rnd(0, 0.03), rnd(0.25, 0.45), 0.05 * i, f * rnd(0.9, 1.1), 'bandpass', 14);
    if (i > 0.55) for (let k = 0; k < 8; k++) osc('sine', rnd(3000, 7500), t + rnd(0.05, 0.5), rnd(0.03, 0.1), rnd(0.006, 0.02) * i);
  },
  thud(k = 1) { if (!S) return; const t = now(); osc('sine', 115, t, 0.13, 0.22 * k, { to: 62 }); burst(t, 0.08, 0.12 * k, 320, 'lowpass', 0.7); },
  // The hoppbacke (feature snöhög, game/hoppbacke.js). k 0..1: how near. Off the snow hill's edge:
  // the tyres let go of the packed snow (a soft whumpf) and the springs unload (a clack).
  hoppTakeoff(k = 1) {
    if (!S) return;
    const t = now();
    burst(t, 0.24, 0.6 * k, 900, 'lowpass', 0.7, { buf: S.crunch, rate: 0.6, attack: 0.01, soft: true });
    burst(t, 0.12, 0.16 * k, 260, 'lowpass', 0.8);
    osc('sine', 150, t + 0.02, 0.06, 0.06 * k, { to: 110 });
    burst(t + 0.03, 0.03, 0.05 * k, 2600, 'bandpass', 3);
  },
  // The air rushing past while it flies: a band of noise swelling and falling over dur s (the
  // landing cuts it short).
  hoppWind(dur, k = 1) {
    if (!S) return;
    const t = now(), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = S.noise; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(480, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.5); f.frequency.linearRampToValueAtTime(420, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * k, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    src.connect(f).connect(g).connect(S.sfx);
    src.start(t); src.stop(t + dur + 0.25);
    this._wind = g;
  },
  // Coming down: i = the speed into the snow (m/s). Packed snow taking the car (a deep crunch), the
  // springs bottoming out (a thunk, more with i); from ~8 m/s a clatter of everything loose in the
  // car and the exhaust against the body, from ~12 a bang.
  hoppLand(i, k = 1) {
    if (!S) return;
    const t = now(), a = clamp(i / 12, 0.15, 1.2) * k;
    if (this._wind) { this._wind.gain.cancelScheduledValues(t); this._wind.gain.setTargetAtTime(0, t, 0.05); this._wind = null; }
    burst(t, 0.35, 0.8 * a, 1100, 'lowpass', 0.6, { buf: S.crunch, rate: 0.55, attack: 0.006, soft: true });
    burst(t, 0.2, 0.3 * a, 300, 'lowpass', 0.8);
    osc('sine', 90, t, 0.22, 0.32 * a, { to: 46 });
    if (i > 8) {
      for (let n = 0; n < 5; n++) burst(t + 0.04 + n * rnd(0.03, 0.07), rnd(0.03, 0.06), 0.05 * a, rnd(1800, 3400), 'bandpass', 8);
      osc('sine', rnd(700, 900), t + 0.02, 0.18, 0.02 * a, { to: 600 });
    }
    if (i > 12) { burst(t, 0.3, 0.25 * a, 2200, 'bandpass', 1.2); osc('sine', 60, t, 0.35, 0.3 * a, { to: 32 }); }
  },
  // A släpkärra bouncing down behind the car: a clank of galvanised steel, then a rattle.
  trailerClank(i, k = 1) {
    if (!S) return;
    const t = now(), a = clamp(i / 8, 0.2, 1) * k * 1.4;
    osc('sine', 130, t, 0.12, 0.18 * a, { to: 80 });
    for (const f of [1450, 2350, 3100]) burst(t + rnd(0, 0.02), rnd(0.12, 0.25), 0.05 * a, f * rnd(0.92, 1.08), 'bandpass', 16);
    for (let n = 0; n < 4; n++) burst(t + 0.05 + n * rnd(0.04, 0.08), 0.03, 0.04 * a, rnd(2000, 4000), 'bandpass', 6);
  },
  boing() {
    if (!S) return;
    const t = now();
    osc('sine', 150, t, 0.32, 0.17, { to: 340 });
    osc('triangle', 300, t + 0.02, 0.22, 0.045, { to: 520 });
    burst(t, 0.05, 0.09, 900, 'bandpass', 2);
  },
  ouch() {
    if (!S) return;
    const t = now();
    const g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(115, t + 0.22);
    f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 4;
    f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
    env(g, t, 0.34, 0.02, 0.2);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(S.sfx);
    o.start(t); o.stop(t + 0.3);
  },
  // Ove pushing off for a jump: one of his own four grunts, in turn (EFFORTS). Until they are loaded
  // (or if they can't be) a synthesised one: a short, strained, half-swallowed 'hnngh' (the mouth
  // opening from a nasal murmur onto an 'uh'), the pitch squeezed up and falling off, a breath out
  // after it. pitch: the CHARS voice (Ove 150 -> ~95 Hz).
  grunt(pitch = 150) {
    if (!S || playEffort('hopp')) return;
    const t = now(), f0 = clamp(pitch * 0.63, 80, 220) * rnd(0.94, 1.06), dur = rnd(0.24, 0.32), j = rnd(0.94, 1.06);
    vocal(t, dur, [f0 * 0.9, f0 * rnd(1.15, 1.28), f0 * 0.8], [270 * j, 1000 * j, 2350], [rnd(540, 620) * j, 1150 * j, 2500], 0.12, { at: 0.3, open: rnd(0.08, 0.13), creak: 55, press: 1 });
    burst(t + dur * 0.62, 0.16, 0.014, 1500, 'bandpass', 0.7, { attack: 0.03 });
  },
  // ...and landing: one of his four 'uff's, in turn; synthesised until then: a breath knocked out of
  // him and a low, short 'uff' closing to an 'oo'.
  oof(pitch = 150) {
    if (!S || playEffort('land')) return;
    const t = now() + 0.02, f0 = clamp(pitch * 0.6, 75, 210) * rnd(0.94, 1.06), dur = rnd(0.15, 0.2), j = rnd(0.94, 1.06);
    burst(t - 0.02, 0.07, 0.02, 1100, 'bandpass', 0.8, { attack: 0.005 });
    vocal(t, dur, [f0 * 1.06, f0, f0 * 0.72], [520 * j, 950 * j, 2300], [340 * j, 760 * j, 2200], 0.09, { at: 0.15, open: dur * 0.8, creak: 35, delayOpen: 0 });
  },
  // Slush.
  splash() { if (!S) return; const t = now(); burst(t, 0.45, 0.3, 1100, 'bandpass', 0.5); burst(t, 0.3, 0.17, 1, 'bandpass', 0.5, { buf: S.crunch, rate: 0.7 }); },
  door() {
    if (!S) return;
    const t = now();
    osc('sine', 88, t, 0.18, 0.42, { to: 52 });
    burst(t, 0.1, 0.3, 600, 'lowpass', 0.7);
    burst(t + 0.012, 0.025, 0.2, 3200, 'bandpass', 3);
    burst(t + 0.03, 0.06, 0.06, 1400, 'bandpass', 4);
  },
  // Ove's garage door, a steel vipport. kind: 'latch' (the handle turned), 'roll' (on its way for
  // dur s: the rollers knocking along the tracks in a rumble, the springs creaking), 'up' (against its
  // stops, open), 'shut' (into its frame: a heavy sheet-metal clang that rings; a car into it too),
  // 'tug' (pulled on, shut: a short rattle in the frame). k: loudness (by distance).
  garage(kind, k = 1, dur = 1.2) {
    if (!S || !(k > 0.02)) return;
    const t = now();
    if (kind === 'latch') {
      burst(t, 0.025, 0.3 * k, 2400, 'bandpass', 5);
      burst(t + 0.09, 0.035, 0.36 * k, 1700, 'bandpass', 4);
      osc('sine', 820, t + 0.09, 0.06, 0.04 * k, { to: 760 });
    } else if (kind === 'roll') {
      burst(t, dur, 0.13 * k, 320, 'bandpass', 0.9, { attack: dur * 0.3, soft: true });
      const n = Math.round(dur * 15);
      for (let i = 0; i < n; i++) burst(t + (i + Math.random() * 0.6) * dur / n, 0.018, rnd(0.05, 0.11) * k, rnd(480, 900), 'bandpass', 3);
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(rnd(70, 90), t); o.frequency.linearRampToValueAtTime(rnd(110, 130), t + dur * 0.7);
      f.type = 'bandpass'; f.Q.value = 9;
      f.frequency.setValueAtTime(1300, t); f.frequency.linearRampToValueAtTime(1900, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03 * k, t + dur * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur * 0.85);
      o.connect(f).connect(g).connect(S.sfx);
      o.start(t); o.stop(t + dur);
    } else if (kind === 'up') {
      osc('sine', 120, t, 0.12, 0.2 * k, { to: 75 });
      burst(t, 0.07, 0.17 * k, 700, 'lowpass', 0.8);
      for (const fr of [930, 1710]) burst(t, 0.2, 0.025 * k, fr, 'bandpass', 14);
    } else if (kind === 'shut') {
      osc('sine', 78, t, 0.3, 0.44 * k, { to: 46 });
      burst(t, 0.22, 0.34 * k, 650, 'lowpass', 0.8);
      burst(t + 0.005, 0.09, 0.14 * k, 2100, 'bandpass', 1.6);
      for (const fr of [410, 1130, 1870, 2950]) verbSend(burst(t + rnd(0, 0.01), rnd(0.35, 0.6), 0.045 * k, fr * rnd(0.97, 1.03), 'bandpass', 16), 0.25);
    } else if (kind === 'tug') {
      burst(t, 0.03, 0.17 * k, 900, 'bandpass', 2.5);
      burst(t + 0.035, 0.025, 0.11 * k, 1300, 'bandpass', 3);
      osc('sine', 140, t, 0.06, 0.08 * k, { to: 95 });
      for (const fr of [520, 1450]) burst(t, 0.12, 0.018 * k, fr, 'bandpass', 14);
    }
  },
  pickup() {
    if (!S) return;
    const t = now();
    for (const [m, d] of [[76, 0], [81, 0.09]]) { osc('sine', mtof(m), t + d, 0.45, 0.05); osc('sine', mtof(m) * 4, t + d, 0.12, 0.012); }
  },
  squash() { if (!S) return; const t = now(); burst(t, 0.12, 0.55, 900, 'bandpass', 2); osc('sine', 300, t, 0.08, 0.16, { to: 120 }); },
  // Dialogue voice: one soft, wordless murmur (hud.runDialog plays one per word, at most ~4 a
  // second): a breathy voiced hum through a gentle vowel formant that glides, under the words
  // rather than a beep per letter. pitch: the character's voice (old CHARS voice values, ~150-400).
  talk(pitch = 300) {
    if (!S) return;
    const t = now(), dur = rnd(0.12, 0.17);
    const f0 = clamp(pitch * 0.5, 85, 260) * rnd(0.92, 1.08);
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.04, t); o.frequency.linearRampToValueAtTime(f0 * rnd(0.86, 0.96), t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.3;
    // Two soft formants gliding between vowels.
    const fa = rnd(420, 760), fb = rnd(1000, 1900);
    for (const [f, k, a2] of [[fa, rnd(0.8, 1.2), 1], [fb, rnd(0.85, 1.15), 0.45]]) {
      const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(f, t); bp.frequency.linearRampToValueAtTime(f * k, t + dur);
      bg.gain.value = a2;
      o.connect(bp).connect(bg).connect(lp);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.035);
    g.gain.setValueAtTime(0.085, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(S.sfx);
    o.start(t); o.stop(t + dur + 0.03);
    // Breath.
    burst(t, dur * 0.9, 0.028, rnd(1300, 2000), 'bandpass', 0.9, { attack: 0.03 });
  },
  // A child's giggle (a child's line with no clip is a murmur and this, voice.js): three or four
  // quick breathy "hi"s falling in pitch.
  giggle(pitch = 420) {
    if (!S) return;
    const n = 3 + (Math.random() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const t = now(0.02 + k * rnd(0.085, 0.11)), f0 = pitch * (1.18 - k * 0.07) * rnd(0.96, 1.04), dur = rnd(0.06, 0.08);
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.88, t + dur);
      bp.type = 'bandpass'; bp.frequency.value = rnd(1800, 2600); bp.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp).connect(g).connect(S.sfx);
      o.start(t); o.stop(t + dur + 0.02);
      burst(t, dur, 0.02, rnd(2500, 3500), 'bandpass', 1.2, { attack: 0.006 });
    }
  },
  checkpoint() {
    if (!S) return;
    const t = now();
    for (const [m, d] of [[79, 0], [86, 0.11]]) { const g = osc('sine', mtof(m), t + d, 0.6, 0.045); verbSend(g, 0.4); osc('sine', mtof(m) * 2.76, t + d, 0.15, 0.006); }
  },
  // Clock tick / countdown: a dry wood-block click.
  tick() { if (!S) return; const t = now(); burst(t, 0.025, 1.1, 2600, 'bandpass', 6); osc('sine', 1900, t, 0.03, 0.26, { attack: 0.002 }); osc('sine', 1900 * 2.7, t, 0.012, 0.05, { attack: 0.001 }); },
  // The horn of the player's car while held (kind: the car's model, see HORNS: the Saab's dual tone,
  // a borrowed Golf peeps). A new kind while held starts that car's horn.
  horn(on, kind = 'saab900') {
    if (!S) return;
    if (on && S.hornNodes && S.hornKind !== kind) this.horn(false);
    if (on && !S.hornNodes) { S.hornNodes = hornVoice(ctx.currentTime, 0.1, kind); S.hornKind = kind; }
    else if (!on && S.hornNodes) {
      const h = S.hornNodes; S.hornNodes = null;
      const t = ctx.currentTime;
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setTargetAtTime(0, t, 0.025);
      for (const o of h.oscs) o.stop(t + 0.2);
    }
  },
  // A short honk from another car (vol 0..1, e.g. by distance; kind: its model, see HORNS; delay: s
  // from now, for a double toot).
  honk(vol = 1, dur = 0.3, kind = 'default', delay = 0) {
    if (!S || !(vol > 0.01)) return;
    const t = ctx.currentTime + delay, h = hornVoice(t, 0.07 * clamp(vol, 0, 1), kind);
    h.g.gain.setTargetAtTime(0, t + dur, 0.025);
    for (const o of h.oscs) o.stop(t + dur + 0.2);
  },
  // Someone the horn made jump: a sharp intake of breath and a short rising 'ah!' (pitch: the CHARS
  // voice, ~150 for a man to ~600 for a child; k: loudness by distance).
  yelp(pitch = 300, k = 1) {
    if (!S || !(k > 0.03)) return;
    const t = now(), f0 = clamp(pitch * 0.72, 105, 430) * rnd(0.93, 1.08), dur = rnd(0.17, 0.24), j = rnd(0.94, 1.08);
    burst(t, 0.08, 0.03 * k, 1900, 'bandpass', 0.9, { attack: 0.01 });
    vocal(t + 0.05, dur, [f0 * 1.05, f0 * rnd(1.4, 1.6), f0 * 1.12], [820 * j, 1250 * j, 2650], [600 * j, 1750 * j, 2600], 0.1 * k, { at: 0.35, open: 0.09, creak: 18, press: 0.9 });
  },
  // A cat that got a fright: a hiss through the teeth with a little spit at the start.
  hiss(k = 1) {
    if (!S || !(k > 0.03)) return;
    const t = now();
    burst(t, 0.03, 0.12 * k, 2600, 'bandpass', 2);
    burst(t + 0.02, 0.55, 0.15 * k, 4600, 'bandpass', 0.9, { attack: 0.05, soft: true });
  },
  // Short piano motifs (they ring in the same room as the score).
  jingle(kind) {
    if (!S) return;
    const seq = {
      start: [[57, 0, 0.55], [64, 0.16, 0.5], [69, 0.32, 0.5], [72, 0.5, 0.55]],
      complete: [[48, 0, 0.5], [55, 0.12, 0.45], [64, 0.24, 0.5], [71, 0.4, 0.45], [72, 0.75, 0.6], [76, 0.75, 0.4]],
      fail: [[64, 0, 0.5], [60, 0.28, 0.45], [57, 0.56, 0.5], [45, 0.56, 0.4]],
      record: [[81, 0, 0.35], [88, 0.09, 0.3], [84, 0.18, 0.3], [91, 0.3, 0.25]],
    }[kind];
    if (!seq) return;
    const t = now(0.01);
    const out = ctx.createGain(); out.gain.value = 0.32; out.connect(S.sfx); verbSend(out, 0.6);
    for (const [m, d, v] of seq) piano(m, t + d, v, 2.2, out);
  },
  // KAOS: a church bell tolling twice, far off. (alarm() is the new name.)
  shameBell() {
    if (!S) return;
    const t = now();
    const out = ctx.createGain(); out.gain.value = 0.4; out.connect(S.sfx); verbSend(out, 0.8);
    for (const d of [0, 1.15]) {
      for (const [m, a, dur] of [[0.5, 0.16, 4], [1, 0.2, 2.6], [1.19, 0.1, 2.0], [1.5, 0.06, 1.6], [2, 0.08, 1.8], [2.52, 0.04, 1.1], [3.01, 0.03, 0.9]]) {
        osc('sine', 196 * m * rnd(0.998, 1.002), t + d, dur, a, { attack: 0.004, dest: out });
      }
      burst(t + d, 0.05, 0.05, 2500, 'bandpass', 2, { dest: out });
    }
  },
  alarm() { this.shameBell(); },

  // An old Swedish landline ringing (one long burr, a pause, again) while on.
  ring(on) {
    if (!S) return;
    if (on) {
      if (S.ringer) return;
      const bus = ringBus();
      const r = S.ringer = { bus, srcs: [], next: ctx.currentTime + 0.05, n: 0 };
      scheduleRing(r, ctx.currentTime + 0.6);
      r.timer = setInterval(() => scheduleRing(r, ctx.currentTime + 0.6), 150);
    } else if (S.ringer) {
      const r = S.ringer; S.ringer = null;
      clearInterval(r.timer);
      const t = ctx.currentTime;
      r.bus.gain.setTargetAtTime(0, t, 0.03);
      for (const s of r.srcs) { try { s.stop(t + 0.15); } catch (e) { /* already stopped */ } }
    }
  },
  // A carpenter's pencil scratching on paper while on.
  pen(on) {
    if (!S) return;
    if (on) {
      if (S.penner) return;
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(S.sfx);
      const p = S.penner = { bus, srcs: [], next: ctx.currentTime + 0.02 };
      schedulePen(p, ctx.currentTime + 0.4);
      p.timer = setInterval(() => schedulePen(p, ctx.currentTime + 0.4), 100);
    } else if (S.penner) {
      const p = S.penner; S.penner = null;
      clearInterval(p.timer);
      const t = ctx.currentTime;
      p.bus.gain.setTargetAtTime(0, t, 0.02);
      for (const s of p.srcs) { try { s.stop(t + 0.1); } catch (e) { /* already stopped */ } }
    }
  },
  // The ANMÄLD stamp hitting the notebook on a knee: thump, paper slap, a knock.
  stamp() {
    if (!S) return;
    const t = now();
    osc('sine', 170, t, 0.1, 0.38, { to: 68 });
    burst(t, 0.055, 0.32, 2200, 'lowpass', 0.7);
    burst(t + 0.004, 0.09, 0.2, 480, 'bandpass', 2);
    burst(t + 0.002, 0.02, 0.1, 5200, 'highpass', 0.7);
  },
  // Ding-dong.
  doorbell() {
    if (!S) return;
    const t = now();
    const out = ctx.createGain(); out.gain.value = 0.7; out.connect(S.sfx); verbSend(out, 0.5);
    for (const [m, d] of [[76, 0], [72, 0.6]]) {
      const f = mtof(m);
      osc('sine', f, t + d, 1.7, 0.16, { attack: 0.003, dest: out });
      osc('sine', f * 2.76, t + d, 0.5, 0.035, { attack: 0.002, dest: out });
      osc('sine', f * 5.4, t + d, 0.18, 0.012, { attack: 0.001, dest: out });
      burst(t + d, 0.02, 0.05, 3000, 'bandpass', 2, { dest: out });
    }
  },
  // Mee-ow: a voiced buzz through vowel formants sliding i -> a -> u, with a pitch arch.
  catMeow() {
    if (!S) return;
    const t = now(), dur = rnd(0.5, 0.8);
    const f0 = rnd(480, 600), fPeak = f0 * rnd(1.3, 1.55), fEnd = f0 * rnd(0.8, 0.95);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(fPeak, t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(fEnd, t + dur);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 6.5; vg.gain.value = 14; vib.connect(vg).connect(o.detune);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    const F = [[[700, 0], [1250, 0.35], [650, 1]], [[2300, 0], [1900, 0.4], [1100, 1]]];
    for (const [k, path] of F.entries()) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = k ? 7 : 5;
      path.forEach(([fr, at], i) => (i ? bp.frequency.linearRampToValueAtTime(fr, t + at * dur) : bp.frequency.setValueAtTime(fr, t)));
      const bg = ctx.createGain(); bg.gain.value = k ? 0.6 : 1;
      o.connect(bp).connect(bg).connect(lp);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.05);
    g.gain.setValueAtTime(0.15, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(S.sfx);
    o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
    burst(t, dur * 0.8, 0.02, 3000, 'bandpass', 1.5);
  },
  // One footstep: 'snow' (default) crunches, 'asphalt'/'paving' scrape, 'gravel', 'wood', 'ice'.
  step(surface = 'snow') {
    if (!S) return;
    const t = now();
    if (surface === 'snow' || surface === 'grass' || surface === 'lawn') {
      // An even slice of the step crunch (see makeCrunch), loud enough to sit over the music.
      const sb = S.crunch.step || S.crunch, sl = sb.slices;
      burst(t, rnd(0.13, 0.16), 1.0, rnd(1600, 2100), 'bandpass', 0.6, { buf: sb, rate: rnd(0.9, 1.06), attack: 0.014, soft: true, offset: sl?.length ? sl[(Math.random() * sl.length) | 0] : null });
      burst(t, 0.06, 0.06, 380, 'lowpass', 0.7);
      osc('sine', 85, t, 0.05, 0.05, { to: 60 });
    } else if (surface === 'gravel') {
      burst(t, 0.14, 0.2, 1100, 'bandpass', 0.6, { buf: S.crunch, rate: 0.55, attack: 0.008 });
      burst(t, 0.05, 0.08, 500, 'lowpass', 0.7);
    } else if (surface === 'wood') {
      osc('sine', 190, t, 0.07, 0.1, { to: 150 });
      burst(t, 0.05, 0.1, 750, 'bandpass', 2);
    } else if (surface === 'ice') {
      burst(t, 0.04, 0.08, 3500, 'bandpass', 2);
      osc('sine', 1300, t, 0.05, 0.01, { to: 1700 });
    } else {
      burst(t, 0.035, 0.12, 800, 'lowpass', 0.8);             // heel
      osc('sine', 125, t, 0.035, 0.05, { to: 90 });
      burst(t + 0.03, rnd(0.04, 0.07), 0.05, rnd(2000, 2800), 'bandpass', 1.1); // sole scrape
      burst(t + 0.01, 0.05, 0.03, 4000, 'bandpass', 1, { buf: S.crunch, rate: 1.4 }); // grit
    }
  },

  // Sounds made elsewhere with this file's tools (game/luftning.js: the radiator): fn({ ctx, sfx,
  // now, osc, burst, vocal, verbSend, noise }) is called with them, and its result returned; null
  // before the first gesture (no context yet).
  synth(fn) { return S ? fn({ ctx, sfx: S.sfx, now, osc, burst, vocal, verbSend, noise: S.noise }) : null; },

  // Ove's effort sounds, fetched and decoded (tests: before an offline render); resolves when done.
  loadEfforts() { return loadEfforts(); },
  get effortsReady() { return EFFORTS.ready; },

  // Test hook: render `fn(audio, offlineCtx)` into an OfflineAudioContext of `secs` seconds and
  // return the AudioBuffer (the live graph is untouched). `fn` may await offlineCtx.suspend(t).
  async _offline(secs, fn, sr = 44100) {
    const saved = [ctx, S];
    const oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
    ctx = oc; S = setup(oc);
    let buf;
    try {
      const run = fn(this, oc, { scheduleMusic: (t0, t1) => scheduleMusicWindow(t0, t1), scheduleRing: (t1) => { const r = { bus: ringBus(), srcs: [], next: 0.05, n: 0 }; scheduleRing(r, t1); }, schedulePen: (t1) => { const bus = oc.createGain(); bus.connect(S.sfx); schedulePen({ bus, srcs: [], next: 0.02 }, t1); } });
      const rendering = oc.startRendering();
      await run;
      buf = await rendering;
    } finally { [ctx, S] = saved; }
    return buf;
  },
};

// Ove's own effort sounds (feature fixa_hoppet): four grunts as he pushes off for a jump
// (assets/sfx/ove_hopp_<n>.mp3) and four 'uff's as he lands (ove_land_<n>.mp3), in his ElevenLabs
// voice (tools/sfx/grunts.mjs, all at the same loudness), each kind played in turn (1, 2, 3, 4, 1, ...)
// dry and centred through the voices' bus, so the voice level covers them. Fetched once the context
// exists (decoded by a context of their own: an AudioBuffer plays in any context, the tests' offline
// ones too); a sound that isn't there yet leaves its turn to the synthesised one.
const EFFORTS = { hopp: [], land: [], n: 4, turn: { hopp: 0, land: 0 }, ready: false, loading: null };
function loadEfforts() {
  if (EFFORTS.loading) return EFFORTS.loading;
  const dec = new OfflineAudioContext(1, 1, 44100);
  const one = (kind, i) => fetch(new URL(`../assets/sfx/ove_${kind}_${i + 1}.mp3`, import.meta.url))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((b) => dec.decodeAudioData(b)).then((buf) => { EFFORTS[kind][i] = buf; }).catch(() => {});
  const all = [];
  for (const kind of ['hopp', 'land']) for (let i = 0; i < EFFORTS.n; i++) all.push(one(kind, i));
  return (EFFORTS.loading = Promise.all(all).then(() => { EFFORTS.ready = true; }));
}
function playEffort(kind) {
  const i = EFFORTS.turn[kind], buf = EFFORTS[kind][i];
  EFFORTS.turn[kind] = (i + 1) % EFFORTS.n;
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(S.voiceBus);
  verbSend(src, 0.04);
  src.start(now());
  return true;
}

// A short wordless effort sound (grunts, groans): a voice (a sawtooth, its pitch jittered by low
// noise: creak) through three formants gliding from vowel v0 to v1 ([F1, F2, F3] Hz) over `open` s,
// with a pressed, slightly shaking loudness. f: the pitch at the start, at `at` of dur, and at the end.
function vocal(t, dur, f, v0, v1, peak, { at = 0.3, open = 0.1, creak = 40, press = 0.6, delayOpen = 0.35 } = {}) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f[0], t);
  o.frequency.linearRampToValueAtTime(f[1], t + dur * at);
  o.frequency.exponentialRampToValueAtTime(f[2], t + dur);
  const jn = ctx.createBufferSource(), jf = ctx.createBiquadFilter(), jg = ctx.createGain();
  jn.buffer = S.noise; jf.type = 'lowpass'; jf.frequency.value = 60; jg.gain.value = creak * 6;
  jn.connect(jf).connect(jg).connect(o.detune);
  const g = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  trem.gain.value = 1; lfo.frequency.value = rnd(16, 22); lg.gain.value = 0.18 * press;
  lfo.connect(lg).connect(trem.gain);
  const shape = ctx.createBiquadFilter();
  shape.type = 'lowpass'; shape.frequency.value = 2600 + 1400 * press; shape.Q.value = 0.4;
  const gains = [1, 0.55 + 0.25 * press, 0.22 + 0.2 * press], qs = [5, 7, 9];
  for (let k = 0; k < 3; k++) {
    const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = qs[k];
    bp.frequency.setValueAtTime(v0[k], t);
    bp.frequency.setValueAtTime(v0[k], t + open * delayOpen);
    bp.frequency.linearRampToValueAtTime(v1[k], t + open);
    bg.gain.value = gains[k] * 3.2;
    o.connect(bp).connect(bg).connect(shape);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
  g.gain.setValueAtTime(peak, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  shape.connect(trem).connect(g).connect(S.sfx);
  verbSend(g, 0.08);
  o.start(t); lfo.start(t); jn.start(t, Math.random() * 1.5);
  for (const n of [o, jn, lfo]) n.stop(t + dur + 0.05);
}

// Every make has its own horn (feature tuta_med_bilen): two sawtooth tones (f, Hz) through a brassy
// shaper and a band (bp, Hz; q). Ove's Saab keeps its 405/498 Hz; the Volvos are a tired lower
// 'mööp', the Golf a high single peep (its two tones beat), the German cars a crisp major third, the
// Škoda a sour semitone, the bus and the sopbil an air horn (low, a slow rise: rise s).
export const HORNS = {
  saab900: { f: [405, 498], bp: 2100 },
  volvo240: { f: [352, 440], bp: 1600, q: 1.1 },
  volvo740: { f: [370, 466], bp: 1750 },
  golf: { f: [523, 529], bp: 2600, q: 1.2 },
  audi: { f: [440, 554], bp: 2400 },
  bmw: { f: [415, 523], bp: 2300 },
  skoda: { f: [466, 494], bp: 2200 },
  kombi: { f: [392, 494], bp: 2000 },
  taxi: { f: [440, 523], bp: 2200 },
  van: { f: [349, 415], bp: 1700 },
  bus: { f: [185, 233], bp: 900, q: 0.7, lp: 2600, rise: 0.09 },
  garbage: { f: [147, 185], bp: 800, q: 0.7, lp: 2200, rise: 0.1 },
  default: { f: [405, 498], bp: 2100 },
};

function hornVoice(t, vol, kind = 'default') {
  const H = HORNS[kind] || HORNS.default;
  const g = ctx.createGain(), sh = ctx.createWaveShaper(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
  const curve = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(x * 3); }
  sh.curve = curve;
  bp.type = 'bandpass'; bp.frequency.value = H.bp; bp.Q.value = H.q ?? 0.8;
  lp.type = 'lowpass'; lp.frequency.value = H.lp ?? 4800;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  const oscs = [];
  for (const f of H.f) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.96, t);
    o.frequency.exponentialRampToValueAtTime(f, t + (H.rise ?? 0.035));
    og.gain.value = 0.5;
    o.connect(og).connect(sh);
    o.start(t);
    oscs.push(o);
  }
  sh.connect(bp).connect(lp).connect(g).connect(S.sfx);
  const send = ctx.createGain(); send.gain.value = 0.15; g.connect(send).connect(S.sfxVerb);
  return { g, oscs };
}

// Ring cadence of a Swedish landline (Televerket / Ericsson Dialog): one long burr per cycle, the
// clapper hitting the two bells alternately ~22 times a second. The real pause is ~5 s; it is
// shortened for gameplay. Retune here.
const RING_CLAPPER_HZ = 22, RING_ON = 1.0, RING_OFF = 3.0;
// The bell's bus: a gentle 4.5 kHz roll-off takes the glassy top off (it loops until answered, so it
// must not grate), a little room.
function ringBus() {
  const lp = ctx.createBiquadFilter(), bus = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 4500; lp.Q.value = 0.5;
  bus.gain.value = 1;
  lp.connect(bus).connect(S.sfx);
  verbSend(bus, 0.25);
  bus.input = lp;
  return bus;
}
function scheduleRing(r, until) {
  const c = ctx;
  const hits = Math.round(RING_ON * RING_CLAPPER_HZ);
  while (r.next < until) {
    const t0 = r.next;
    for (let k = 0; k < hits; k++) {
      const t = t0 + k / RING_CLAPPER_HZ + rnd(-0.002, 0.002);
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = k % 2 ? S.bellB : S.bellA;
      // The clapper takes a few strikes to get going, and the last ones are a little softer.
      const swell = Math.min(1, 0.6 + k * 0.13) * (k > hits - 3 ? 0.85 : 1);
      g.gain.value = swell * rnd(0.85, 1) * 0.11;
      s.connect(g).connect(r.bus.input || r.bus);
      s.start(t);
      r.srcs.push(s);
    }
    r.n++;
    r.next = t0 + RING_ON + RING_OFF;
  }
  if (r.srcs.length > 80) r.srcs.splice(0, r.srcs.length - 80);
}

// Pencil strokes: grainy hiss bursts (crunch grains pitched up + filtered noise) with gaps.
function schedulePen(p, until) {
  const c = ctx;
  while (p.next < until) {
    const t = p.next, dur = rnd(0.06, 0.22), vol = rnd(0.07, 0.15);
    const fc = rnd(2600, 4800);
    for (const [buf, rate, v, q] of [[S.crunch, rnd(1.8, 2.6), vol, 0.9], [S.noise, 1, vol * 0.35, 1.4]]) {
      const s = c.createBufferSource(), hp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; s.playbackRate.value = rate;
      hp.type = 'highpass'; hp.frequency.value = 1500;
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(fc, t); bp.frequency.linearRampToValueAtTime(fc * rnd(0.85, 1.2), t + dur); bp.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.015);
      g.gain.setValueAtTime(v * rnd(0.6, 1), t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(hp).connect(bp).connect(g).connect(p.bus);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
      p.srcs.push(s);
    }
    p.next = t + dur + rnd(0.025, 0.09);
  }
  if (p.srcs.length > 60) p.srcs.splice(0, p.srcs.length - 60);
}

// ---------------------------------------------------------------------------------------------
// Music: sparse, melancholic piano over a soft string pad, A minor, ~64 bpm. Generative: each
// 4-bar phrase picks a progression, a texture and (sometimes) a melody that develops a motif.

// name: [bass, chord tones, colour tone]. The colour tone is the one extra note the right hand may
// add: the 9th where it is diatonic and soft (Am add9 = B, F add9 = G, C add9 = D, G add9 = A,
// Dm add9 = E, Fmaj9 = G), the 7th on Em (D), and only the plain fifth on the E major dominant (its
// 9th would be F#, and the old fixed "+14" gave A#: a tritone over the bass).
const CHORDS = {
  Am: [45, [57, 60, 64], 71], F: [41, [53, 57, 60], 67], C: [48, [55, 60, 64], 74], G: [43, [55, 59, 62], 69],
  Dm: [50, [53, 57, 62], 76], Em: [40, [55, 59, 64], 74], E: [40, [56, 59, 64], 71], Fmaj7: [41, [57, 60, 64], 67],
};
const PROGS = [
  ['Am', 'F', 'C', 'G'], ['Am', 'Em', 'F', 'C'], ['F', 'C', 'Dm', 'Am'], ['Am', 'Dm', 'G', 'C'],
  ['Dm', 'Am', 'F', 'E'], ['F', 'G', 'Em', 'Am'], ['Am', 'G', 'Fmaj7', 'E'], ['C', 'G', 'Am', 'Fmaj7'],
];
const SCALE = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
const SCALE_HARM = SCALE.map((m) => (m % 12 === 7 ? m + 1 : m)); // G -> G# (over E major)
const RHYTHMS = [
  [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 1]], [[1, 1], [2, 1], [3, 1]], [[0, 2], [2, 2]],
  [[0.5, 1.5], [2, 1], [3, 1]], [[0, 4]], [[2, 1], [3, 1]],
];
const ARPS = [[2, 3, 5], [1, 3, 4, 6], [2, 4, 6], [3, 5, 7], [2, 5], [1, 2, 3, 5, 6]];

function startMusic() {
  if (!S) return;
  const M = S.music ||= { next: 0, bar: 0, phrase: null, lastProg: -1, motif: null, mel: 64, count: 0 };
  if (M.timer) return;
  M.next = Math.max(M.next, ctx.currentTime + 0.4);
  const tick = () => {
    if (!S || S.music !== M) return;
    if (!audio.musicOn) { M.next = Math.max(M.next, ctx.currentTime + 0.4); M.phrase = null; return; }
    scheduleMusicWindow(M.next, ctx.currentTime + 1.4);
  };
  tick();
  M.timer = setInterval(tick, 250);
}
// Schedules whole bars starting at or after t0 until `until` (also used offline by tests).
function scheduleMusicWindow(t0, until) {
  const M = S.music ||= { next: 0, bar: 0, phrase: null, lastProg: -1, motif: null, mel: 64, count: 0 };
  if (M.next < t0) M.next = t0;
  const beat = 60 / 64, barLen = beat * 4;
  while (M.next < until) {
    if (!M.phrase || M.bar >= 4) newPhrase(M);
    playBar(M, M.next, beat);
    M.bar++;
    M.next += barLen;
  }
}
function newPhrase(M) {
  let pi;
  do pi = Math.floor(Math.random() * PROGS.length); while (pi === M.lastProg);
  M.lastProg = pi;
  M.count++;
  const textures = M.count === 1 ? ['sparse'] : M.count % 5 === 0 ? ['breath'] : ['arp', 'arp', 'melody', 'melody', 'sparse'];
  const texture = textures[Math.floor(Math.random() * textures.length)];
  // A motif is kept for a while and varied: same rhythm, notes shifted by a step or two.
  if (!M.motif || Math.random() < 0.3) M.motif = { rhythm: RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)], shape: [0, 1, 2, 3].map(() => Math.floor(rnd(-2, 3))) };
  M.phrase = { prog: PROGS[pi], texture, melodyBars: texture === 'melody' ? [0, 1, 2, 3].filter(() => Math.random() < 0.7) : [], vel: rnd(0.35, 0.55) };
  M.bar = 0;
}
function playBar(M, t, beat) {
  const P = M.phrase, name = P.prog[M.bar], [bass, tones, colour] = CHORDS[name];
  const scale = name === 'E' ? SCALE_HARM : SCALE;
  const bus = S.piano;
  if (S.piano.gain.value < 0.01 && Date.now() - (director.pianoOffAt || 0) > 4000) return;   // (silent: not worth the oscillators)
  const h = () => rnd(-0.012, 0.012);
  const v = P.vel;
  // Strings: always, quieter in sparse phrases, alone in "breath" phrases.
  pad([bass + 12, ...tones], t, beat * 4.2, P.texture === 'breath' ? 0.026 : P.texture === 'sparse' ? 0.016 : 0.02, bus);
  if (P.texture === 'breath') { if (M.bar === 0) piano(bass, t + 0.05, v * 0.8, beat * 6, bus); return; }
  // Left hand: the root, low, sometimes the fifth on beat 3.
  piano(bass, t + h(), v * rnd(0.85, 1.05), beat * 4.5, bus);
  if (Math.random() < 0.45) piano(bass + 7, t + beat * 2 + h(), v * 0.6, beat * 2.5, bus);
  const rh = [...tones.map((m) => m + 12), colour];
  if (P.texture === 'arp' || (P.texture === 'melody' && !P.melodyBars.includes(M.bar))) {
    const pat = ARPS[Math.floor(Math.random() * ARPS.length)];
    pat.forEach((slot, i) => piano(rh[i % rh.length] - (Math.random() < 0.3 ? 12 : 0), t + slot * beat / 2 + h(), v * rnd(0.55, 0.8), beat * 3, bus));
  } else if (P.texture === 'sparse') {
    if (Math.random() < 0.6) piano(rh[Math.floor(Math.random() * rh.length)], t + beat * (Math.random() < 0.5 ? 1 : 2) + h(), v * 0.65, beat * 3, bus);
  }
  if (P.texture === 'melody' && P.melodyBars.includes(M.bar)) {
    const R = M.motif.rhythm;
    R.forEach(([pos, len], i) => {
      // The motif moves in scale steps; strong beats land on the nearest chord tone.
      // (M.mel may be a G# left over from an E bar: look it up in either scale.)
      let idx = SCALE.indexOf(M.mel);
      if (idx < 0) idx = SCALE_HARM.indexOf(M.mel);
      if (idx < 0) idx = 4;
      idx = clamp(idx + M.motif.shape[i % 4], 3, SCALE.length - 2);
      let note = scale[idx];
      if (pos === 0 || pos === 2) {
        const pool = scale.filter((m) => m >= 62 && tones.some((c) => (((m - c) % 12) + 12) % 12 === 0));
        let bestD = 99;
        for (const m of pool) { const d = Math.abs(m - scale[idx]); if (d < bestD) { bestD = d; note = m; } }
      }
      M.mel = note;
      piano(note, t + pos * beat + h(), clamp(v * rnd(0.8, 1.0) + 0.06, 0, 0.8), Math.max(len * beat * 1.3, 0.8), bus);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// The composed score (features/implemented/a_fully_voiced_game.md, section 8): cues from
// assets/music/index.json ({ cue: { f, d, loop: [start, end] | null } }), one playing at a time over
// the music bus, cross-faded; the generative piano above is the fallback and part of the patrol's
// playlist. Decoded cues are kept three at a time (a minute of stereo is ~20 MB decoded).

// Which cue a state plays (an array: the first one there; 'piano': the generative one). A day's
// mission plays 'vardag' unless main.js says more: 'hurry' (day 2, to the hospital against the
// clock), 'race' (day 5), 'chase' (Vita skjortan's Škoda, days 6 and 7), 'finale' (the grave).
const MUSIC_STATES = {
  title: ['tema'], finale: ['tema'], memory: ['piano'], errand: ['vardag'], mission: ['vardag'], pursuit: ['jakt'],
  hurry: ['jakt'], race: ['racet'], chase: ['vita-skjortan'],
};
// (the cues are mastered at -24 LUFS; measured on the music bus they came out ~5 dB under the
// generative piano the bus level was set for: CUE_GAIN brings them level with it)
const XFADE = 2.5, KEEP_CUES = 3, CUE_GAIN = 1.7;
const director = {
  state: null, cur: null, index: null, bufs: new Map(), pianoOffAt: 0, roam: null, day: 1,
  async load() {
    if (this.index) return this.index;
    this.index = fetch('assets/music/index.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return this.index;
  },
  buf(cue, meta) {
    let p = this.bufs.get(cue);
    if (!p) {
      p = fetch('assets/music/' + meta.f).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b));
      p.catch(() => this.bufs.delete(cue));
    }
    this.bufs.delete(cue); this.bufs.set(cue, p);
    while (this.bufs.size > KEEP_CUES) this.bufs.delete(this.bufs.keys().next().value);
    return p;
  },
  set(state, o) {
    if (o.day) this.day = o.day;
    this.raw = state;
    const key = state === 'roam' ? `roam:${this.day >= 4 ? 'varm' : 'kall'}` : state;
    if (key === this.state) return;
    this.state = key;
    clearTimeout(this.roamT);
    if (!S) return;
    if (state === 'roam') { this.roamStep(0); return; }
    const want = MUSIC_STATES[state] || (state === 'none' ? [] : ['piano']);
    this.play(want, key);
  },
  // The patrol: the cue, 8-15 s of nothing, the piano for 70-120 s, 5-10 s of nothing, again.
  roamStep(k) {
    const key = this.state;
    if (!key?.startsWith('roam')) return;
    const cue = key === 'roam:varm' ? 'patrull-varm' : 'patrull-kall';
    if (k % 2 === 0) {
      this.play([cue, 'piano'], key).then((d) => { if (this.state === key) this.roamT = setTimeout(() => this.roamStep(k + 1), ((d || 90) + rnd(8, 15)) * 1000); });
    } else {
      this.play(['piano'], key);
      this.roamT = setTimeout(() => { this.play([], key); this.roamT = setTimeout(() => this.roamStep(k + 1), rnd(5, 10) * 1000); }, rnd(70, 120) * 1000);
    }
  },
  // Fades out what plays and in the first of `cues` that exists ('piano': the generative one; none:
  // silence). Resolves with the cue's length (s) or null.
  async play(cues, key) {
    const index = await this.load();
    if (this.state !== key || !S) return null;
    const t = ctx.currentTime;
    const old = this.cur;
    this.cur = null;
    if (old) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + XFADE); old.src.stop(t + XFADE + 0.1); }
    for (const cue of cues) {
      if (cue === 'piano') { this.piano(true); return null; }
      const meta = index[cue];
      if (!meta) continue;
      let b;
      try { b = await this.buf(cue, meta); } catch (e) { continue; }
      if (this.state !== key) return null;
      const t1 = ctx.currentTime;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b;
      if (meta.loop) { src.loop = true; src.loopStart = meta.loop[0]; src.loopEnd = meta.loop[1]; }
      g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(CUE_GAIN, t1 + XFADE);
      src.connect(g).connect(S.musicBus);
      src.start(t1);
      this.cur = { cue, src, g };
      this.piano(false);
      return meta.loop ? null : b.duration;
    }
    this.piano(false);
    return null;
  },
  piano(on) {
    S.piano.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, XFADE / 3);
    if (!on) this.pianoOffAt = Date.now();
    if (on && audio.musicOn) startMusic();
  },
};
