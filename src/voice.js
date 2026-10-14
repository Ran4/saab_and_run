// The voices (features/implemented/a_fully_voiced_game.md, section 6): pre-recorded clips from
// assets/voice/ (made by tools/voice/voice.mjs; index.json is keyed by who and the exact text), and
// the turns they take. Nobody talks over anybody:
//   - two slots: 'main' (the dialogue box, radio, the phone) and 'bubble' (speech bubbles, shouts,
//     small talk, passers-by), one voice in each, never two at once;
//   - a dialogue line breaks in on everything (it stops a bubble); radio and calls queue behind
//     whoever is talking for `wait` s (6) and are dropped after that (`must`: they wait for ever);
//   - a bubble's voice plays only when it is quiet, else it waits up to 2.5 s and is dropped (the
//     bubble itself shows anyway); a bubble never talks over a main line;
//   - the same speaker waits for himself: his next line waits until the last one is said.
// A line without a clip (none made yet, the role is mumbled, a file that won't load) is mumbled
// as before, but it still takes its turn for as long as it would take to say (voice.secs), so the
// turns are the same with or without clips. With the voices off (the setting, or ?test without
// &voice) play() returns null and the caller does what it always did.
//
//   voice.play(who, text, { slot, mode, at, near, ch, wait, must, now, start, drop, tag })  -> handle | null
//       now: a line of the dialogue box (hud.runDialog): it breaks in, it never waits
//       handle: { who, text, dur, state ('queued' | 'playing' | 'done' | 'dropped'), ended
//       (Promise), mouth() (0..1 or null), stop(fade), left() (s still to say) }
//       mode: 'dialog' (dry, centred), 'phone' (a telephone line), 'car' (a passenger, a little to
//       the right), 'world' (from `at`, a character or car, panned and fading with distance; muffled
//       while Ove sits in a car), 'shout' (world, louder, more room). start(handle): when it is
//       actually said (a radio toast goes up then); drop(): when the queue gave up on it.
//   voice.secs(who, text, fallback)   how long the line takes: the clip, else chars / the role's
//                                     tempo; with the voices off: `fallback` (the old timing)
//   voice.quiet()                     nobody is talking and nothing waits
//   voice.waitQuiet(min, max)         Promise: quiet, waiting at least min and at most max s
//   voice.prefetch(lines)             [[who, text], ...]: fetch and decode now
//   voice.voiceFor(ch)                the role key a character (or a car, a window) speaks with:
//                                     a neighbour's, or a pool voice (poolVoice: sex, age, seed;
//                                     a child a kid voice, ped_kid_*)
//   voice.stop(slot), voice.hush()    stop a slot / everything and drop what waits
//   voice.update(game)                main.js, every frame: the queue, positions, mouths
import { audio } from './audio.js';
import { CHARS } from './actors/models.js';
import { camera } from './gfx.js';
import { allLines } from './game/script.js';

const BASE = 'assets/voice/';
const KEEP = 24;                      // decoded clips kept in memory (20 minutes decoded is ~250 MB)
const WAIT = { main: 6, bubble: 2.5 };
const TEMPO = 13;                     // chars/s for a role with no clips yet
const LIP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const SETTINGS_KEY = 'saab-and-run-settings';
// (the children: Sara, Nasanin and the kid voices of the pool, ped_kid_*; 'ped_kid' is a child with
// no kid voice in the manifest)
const isKid = (who) => who === 'sara' || who === 'nasanin' || who.startsWith('ped_kid');
const P = new URLSearchParams(location.search);

const lipVal = (s, i) => { const k = LIP.indexOf(s[i]); return k < 0 ? 0 : k / 63; };

class Utterance {
  constructor(who, text, o) {
    Object.assign(this, { who, text, slot: o.slot || 'bubble', mode: o.mode || 'dialog', at: o.at || null, near: o.near || 0, ch: o.ch || o.at || null, must: !!o.must, onStart: o.start, onDrop: o.drop });
    this.clip = voice.clipOf(who, text);
    this.dur = this.clip ? this.clip.d : voice.guess(who, text);
    this.state = 'queued';
    this.queuedAt = voice.now();
    this.deadline = this.must ? Infinity : this.queuedAt + (o.wait ?? WAIT[this.slot]);
    this.ended = new Promise((ok) => { this._end = ok; });
    this.mouthV = null;
  }
  left() { return this.state === 'playing' ? Math.max(0, this.t0 + this.dur - voice.now()) : this.state === 'queued' ? this.dur : 0; }
  mouth() { return this.state === 'playing' ? this.mouthV : null; }
  stop(fade = 0.08) { voice._finish(this, fade); }
}

export const voice = {
  enabled: false,          // the setting (and not ?test without &voice)
  setting: true,           // the player's choice (the pause menu's "Röster")
  level: 1,
  manifest: null,
  tempo: {},
  playing: { main: null, bubble: null },
  queue: [],
  log: [],                 // every line asked for: { who, text, slot, mode, asked, t0, t1, dur, cut, dropped, clip } (tests)
  unknown: [],             // lines said that aren't in script.js's allLines() (story &voice: errors)
  failed: new Set(),       // clips that would not load: mumbled for the rest of the session
  inCar: () => false,      // main.js: Ove sits in a car
  _bufs: new Map(),
  _known: null,
  _paused: false,

  init() {
    const test = P.has('test');
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    this.setting = s.voice !== false;
    this.enabled = test ? P.has('voice') : this.setting;
    if (typeof s.voiceLevel === 'number') this.setLevel(s.voiceLevel);
    this._known = new Set(allLines().map(([, t]) => t));
    const url = P.get('voicemanifest') || BASE + 'index.json';
    this.ready = fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m) => {
      this.manifest = m || {};
      this.tempo = m?._tempo || {};
      this.fps = m?._fps || 30;
    });
    return this.ready;
  },
  setEnabled(on) { this.enabled = !!on; if (!on) this.hush(); },
  setLevel(v) { this.level = v; audio.setVoiceLevel?.(v); },
  now() { return audio.ctx ? audio.ctx.currentTime : performance.now() / 1000; },
  clipOf(who, text) {
    const c = this.manifest?.[who]?.[text];
    return c && !this.failed.has(c.f) ? c : null;
  },
  // A line's length without a clip: the role's measured tempo (chars/s), and a breath.
  guess(who, text) { return 0.35 + text.length / (this.tempo[who] || TEMPO); },
  secs(who, text, fallback) {
    if (!this.enabled) return fallback ?? this.guess(who, text);
    const c = this.clipOf(who, text);
    return c ? c.d : this.guess(who, text);
  },
  voiceFor(ch) {
    if (!ch) return null;
    if (ch.key && CHARS[ch.key]) return ch.key;          // the neighbours and Ove
    if (ch.driver) return this.voiceFor(ch.driver);      // a car speaks with its driver's voice
    if ('driver' in ch) {                                // ...or its seated bust's (traffic, smitare)
      const def = ch.driverBust?.userData?.def;
      return (def && Object.keys(CHARS).find((k) => CHARS[k] === def)) || this.poolVoice(def, ch);
    }
    return this.poolVoice(ch.def, ch);                   // a passer-by; no def: a window (horn.js)
  },
  // A passer-by's voice from the pool (index.json _pool, tools/voice/voice.mjs): by sex and age
  // (under 13 a kid voice: an adult's made squeaky, features/implemented/barnroster.md; 13-34
  // young, 35-64 mid, 65+ old), one voice per person from their own random pitch, so the same
  // person always sounds the same. No def (a window, a car nobody sits in): an adult from where it
  // is (a window: a mid or old voice). No pool voice for them: 'ped' / 'ped_kid' (mumbled).
  poolVoice(def, at) {
    const P = this.manifest?._pool;
    const age = def?.age ?? 50;
    const kid = !!def && (def.kind === 'kid' || age < 13), none = kid ? 'ped_kid' : 'ped';
    if (!P) return none;
    const band = kid ? 'kid' : age < 35 ? 'young' : age < 65 ? 'mid' : 'old';
    const list = def ? P[`${def.sex === 'f' ? 'f' : 'm'}_${band}`] : [...(P.f_mid || []), ...(P.m_mid || []), ...(P.f_old || []), ...(P.m_old || [])];
    if (!list?.length) return none;
    const seed = def ? def.voice ?? def.height ?? 0 : Math.round(at?.x ?? 0) * 31 + Math.round(at?.z ?? 0);
    const h = Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1;
    return list[Math.floor(h * list.length)];
  },
  quiet() { return !this.playing.main && !this.playing.bubble && !this.queue.length; },
  // Quiet, waiting at least min s (a beat after the last line) and at most max s.
  waitQuiet(min = 0, max = 8) {
    const t0 = performance.now();
    return new Promise((ok) => {
      const tick = () => {
        const s = (performance.now() - t0) / 1000;
        if ((s >= min && (this.quiet() || !this.enabled)) || s >= max) ok(); else setTimeout(tick, 50);
      };
      tick();
    });
  },
  talking(who) {
    for (const u of [this.playing.main, this.playing.bubble]) if (u && u.who === who) return u;
    return null;
  },

  play(who, text, o = {}) {
    if (!text) return null;
    if (this._known && !this._known.has(text)) this.unknown.push({ who, text });
    if (!this.enabled || !audio.ctx) return null;
    const u = new Utterance(who, text, o);
    const rec = { who, text, slot: u.slot, mode: u.mode, tag: o.tag || null, asked: u.queuedAt, t0: null, t1: null, dur: u.dur, cut: 0, dropped: false, clip: !!u.clip };
    u.rec = rec;
    this.log.push(rec);
    if (this.log.length > 2000) this.log.shift();
    if (u.clip) this._load(u.clip);
    if (o.now) {
      // A dialogue line breaks in: the bubble stops, and whatever was in the main slot.
      this._finish(this.playing.bubble, 0.08);
      this._finish(this.playing.main, 0.08);
      this.queue = this.queue.filter((q) => q.slot !== 'bubble' || (this._drop(q), false));
      this._start(u);
      return u;
    }
    this.queue.push(u);
    // Main lines before bubbles; otherwise first come, first served.
    this.queue.sort((a, b) => (a.slot === b.slot ? a.queuedAt - b.queuedAt : a.slot === 'main' ? -1 : 1));
    this._pump();
    return u;
  },
  prefetch(lines) {
    if (!this.enabled || !audio.ctx) return;
    for (const [who, text] of lines) { const c = this.clipOf(who, text); if (c) this._load(c); }
  },
  stop(slot) {
    this._finish(this.playing[slot], 0.08);
    this.queue = this.queue.filter((q) => q.slot !== slot || (this._drop(q), false));
  },
  // Drop queued radio (dropRadio) or bubbles only.
  unqueue(fn) { this.queue = this.queue.filter((q) => !fn(q) || (this._drop(q), false)); },
  hush() { for (const s of ['main', 'bubble']) this.stop(s); },
  // The pause menu: what is being said stops where it is and goes on afterwards.
  pause(on) {
    if (this._paused === !!on) return;
    this._paused = !!on;
    const t = this.now();
    for (const u of [this.playing.main, this.playing.bubble]) {
      if (!u) continue;
      if (on) { u.pausedAt = t - u.t0; this._stopSource(u, 0.03); }
      else { u.t0 = t - u.pausedAt; if (u.buf) this._source(u, u.pausedAt); }
    }
    for (const q of this.queue) if (on) q.pauseT = t; else if (q.pauseT != null) { q.deadline += t - q.pauseT; q.pauseT = null; }
  },

  // ---------------------------------------------------------------------------------------------
  _load(c) {
    const url = BASE + c.f;
    let p = this._bufs.get(url);
    if (!p) {
      p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => audio.ctx.decodeAudioData(b));
      p.catch(() => { this.failed.add(c.f); this._bufs.delete(url); });
      p.buf = null;
      p.then((b) => { p.buf = b; }, () => {});
    }
    this._bufs.delete(url); this._bufs.set(url, p);
    if (this._bufs.size > KEEP) this._bufs.delete(this._bufs.keys().next().value);
    return p;
  },
  // main.js: the dialogue box is up (nothing queued starts between two of its lines).
  held: () => false,
  _pump() {
    if (this._paused) return;
    const t = this.now(), held = this.held();
    for (let k = 0; k < this.queue.length; k++) {
      const u = this.queue[k];
      if (t > u.deadline) { this.queue.splice(k--, 1); this._drop(u); continue; }
      if (held) continue;   // (what waits still runs out of time while the dialogue box is up)
      const busyMain = !!this.playing.main, busyBubble = !!this.playing.bubble;
      const self = [this.playing.main, this.playing.bubble].some((p) => p && p.who === u.who);
      // Main lines wait for both slots (a radio call waits for a bubble); bubbles wait for quiet and
      // for any main line still waiting ahead of them.
      const ahead = this.queue.slice(0, k).some((q) => q.slot === 'main');
      if (self || busyMain || busyBubble || (u.slot === 'bubble' && ahead)) continue;
      this.queue.splice(k--, 1);
      this._start(u);
    }
  },
  _start(u) {
    const t = this.now();
    // (heard from inside Ove's car: the world outside is muffled)
    u.muffle = (u.mode === 'world' || u.mode === 'shout') && this.inCar();
    u.state = 'playing';
    u.t0 = t;
    u.rec.t0 = t;
    this.playing[u.slot] = u;
    u.onStart?.(u);
    if (u.clip) {
      const p = this._load(u.clip);
      // (not decoded yet: it starts as soon as it is, from the top; the turn is counted from now)
      if (p.buf) { u.buf = p.buf; this._source(u, 0); }
      else p.then((b) => { if (u.state === 'playing' && !u.src && !this._paused) { u.buf = b; u.t0 = this.now(); u.rec.t0 = u.t0; this._source(u, 0); } }, () => this._mumbleFrom(u));
    } else this._mumbleFrom(u);
    audio.voiceDuck?.(true);
  },
  // Where a world voice is heard from: the speaker (`near`: no further than that from the camera,
  // in their direction: a shout from across the area still carries).
  _place(u) {
    if (!u.chain?.panner || !u.at) return;
    let x = u.at.x, y = (u.at.y || 0) + 1.6, z = u.at.z;
    if (u.near && camera) {
      const e = camera.matrixWorld.elements, dx = x - e[12], dz = z - e[14], d = Math.hypot(dx, dz);
      if (d > u.near) { x = e[12] + dx * u.near / d; z = e[14] + dz * u.near / d; }
    }
    u.chain.setPos(x, y, z);
  },
  _source(u, offset) {
    const c = audio.ctx;
    const src = c.createBufferSource();
    src.buffer = u.buf;
    const chain = audio.voiceChain(u.mode, { muffle: u.muffle });
    src.connect(chain.input);
    src.start(c.currentTime, Math.min(offset, u.buf.duration - 0.01));
    u.src = src; u.chain = chain;
    this._place(u);
    src.onended = () => { if (u.src === src && !this._paused) this._finish(u, 0); };
  },
  _stopSource(u, fade) {
    if (!u.src) return;
    const c = audio.ctx, src = u.src, chain = u.chain;
    u.src = null;
    try {
      chain.out.gain.setTargetAtTime(0, c.currentTime, Math.max(0.005, fade / 3));
      src.stop(c.currentTime + fade + 0.02);
    } catch (e) { /* already stopped */ }
    setTimeout(() => chain.dispose(), (fade + 0.2) * 1000);
  },
  // No clip: a murmur at the word starts, spread over the line's length (at most one every 0.22 s).
  _mumbleFrom(u) {
    u.clip = null;
    const w = [], len = u.text.length;
    for (const m of u.text.matchAll(/\S+/g)) if (/[\p{L}\p{N}]/u.test(m[0])) w.push((m.index / Math.max(1, len)) * (u.dur - 0.35));
    u.murmurs = [];
    for (const at of w) if (!u.murmurs.length || at - u.murmurs[u.murmurs.length - 1] >= 0.22) u.murmurs.push(at);
    u.mi = 0;
    // (a child with no clip: a giggle after the murmur, now and then: 4.4 c)
    u.giggle = isKid(u.who) && Math.random() < 0.55 ? Math.max(0.2, u.dur - 0.45) : null;
  },
  _finish(u, fade) {
    if (!u || u.state === 'done' || u.state === 'dropped') return;
    const t = this.now();
    if (u.state === 'queued') { const k = this.queue.indexOf(u); if (k >= 0) this.queue.splice(k, 1); }
    if (u.state === 'playing') {
      u.rec.t1 = t;
      u.rec.cut = Math.max(0, u.t0 + u.dur - t);
      this._stopSource(u, fade);
      if (this.playing[u.slot] === u) this.playing[u.slot] = null;
    }
    u.state = 'done';
    u._end();
    if (!this.playing.main && !this.playing.bubble) audio.voiceDuck?.(false);
    this._pump();
  },
  _drop(u) {
    if (u.state !== 'queued') return;
    u.state = 'dropped';
    u.rec.dropped = true;
    u.onDrop?.(u);
    u._end();
  },

  // Every frame: start what may start, end what has been said, move the voices with their
  // speakers, and give each speaker's jaw the loudness of what they are saying.
  update(game) {
    if (!this.enabled || !audio.ctx) return;
    const t = this.now();
    if (camera) {
      const e = camera.matrixWorld.elements;
      audio.setListener?.(e[12], e[13], e[14], -e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
    for (const slot of ['main', 'bubble']) {
      const u = this.playing[slot];
      if (!u || this._paused) continue;
      const s = t - u.t0;
      if (u.src) this._place(u);
      if (u.clip && u.clip.lip) {
        const i = Math.floor(s * this.fps);
        u.mouthV = i >= 0 && i < u.clip.lip.length ? lipVal(u.clip.lip, i) : 0;
        if (!u.src && s > u.dur + 0.3) this._finish(u, 0);   // (a clip that never decoded)
      } else {
        // mumbled: a murmur per word start, the mouth open on each
        // (a passer-by murmurs at their own pitch)
        const pitch = CHARS[u.who]?.voice || u.ch?.def?.voice;
        while (u.murmurs && u.mi < u.murmurs.length && s >= u.murmurs[u.mi]) { audio.talk(pitch || 300); u.lastMurmur = s; u.mi++; }
        if (u.giggle != null && s >= u.giggle) { audio.giggle?.((pitch || 520) * 0.8); u.giggle = null; }
        const since = u.lastMurmur == null ? 1 : s - u.lastMurmur;
        u.mouthV = since < 0.18 ? 0.7 * (1 - since / 0.18) + 0.1 : 0.05;
        if (s >= u.dur) this._finish(u, 0);
      }
    }
    this._pump();
    void game;
  },
};
