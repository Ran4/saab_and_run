// The music: the score's cues (features/implemented/a_fully_voiced_game.md, section 8), made once with Eleven Music
// and checked in. The game never calls the API; it reads assets/music/index.json and plays
// assets/music/<cue>.mp3 (a loop cue between its loop points, AudioBufferSourceNode.loopStart/End).
//
//   node tools/music/music.mjs [--dry] [--only a,b]
//        the cues with no raw take in .cache/music/<cue>/1.mp3 get one (one take per cue, never more)
//        and are processed. --dry: what is on disk, what would be made, what it would cost.
//        Nothing is made past cues.json's maxSeconds (counting everything in the ledger).
//   node tools/music/music.mjs reprocess     redo trimming, loudness, loops, measurements (free)
//   node tools/music/music.mjs check         no requests: every cue has its mp3 and index entry; exit 1 if not
//
// The files: tools/music/cues.json (per cue a prompt or a composition plan, length, loop, seed,
// conditioning on another cue's take), tools/music/ledger.json (every request ever sent: cue, ms,
// duration received, song id), .cache/music/<cue>/1.mp3 + 1.json (the raw take and its request) and
// meta.json (its measurements), .cache/music/index.json (all measurements, for the review page),
// assets/music/<cue>.mp3 + index.json (what the game reads: { cue: { f, d, loop, lufs } }).
// Eleven Music bills ~900 credits per generated minute and reports no cost: hence the ledger and the
// cap. A failed request stops the run and is never retried by itself; running again retries it once.
// The API key is read from .env (ELEVENLABS_API_KEY) and only ever goes into a request header.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'tools/music');
const CUES = path.join(DIR, 'cues.json'), LEDGER = path.join(DIR, 'ledger.json');
const CACHE = path.join(ROOT, '.cache/music'), REVIEW = path.join(CACHE, 'index.json');
const OUT = path.join(ROOT, 'assets/music'), MANIFEST = path.join(OUT, 'index.json');
const API = 'https://api.elevenlabs.io';
const SR = 44100, KBPS = 128, HOP = 441;          // analysis frames of 10 ms
const KEEP = 0.05;                                 // silence kept before the first and after the last sound
const XMIN = 1.5, XMAX = 3.4;                      // a loop's crossfade, seconds
const LOOP_PRE = 0.5, LOOP_POST = 1.0;             // loopStart; audio kept after the seam
const LIMITER_DELAY = 219;                         // samples alimiter (5 ms attack) delays by (ffmpeg 4.4, 44.1 kHz)
const ATTEMPTS = 2;                                // per cue: a failed request may be retried once

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const cmd = args[0] && !args[0].startsWith('--') ? args[0] : 'gen';
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const r2 = (x, k = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
const cfg = readJson(CUES);
const names = Object.keys(cfg.cues);
const rawOf = (n) => path.join(CACHE, n, '1.mp3');
const outOf = (n) => path.join(OUT, n + '.mp3');
const credits = (s) => Math.round(s / 60 * cfg.creditsPerMinute);

// ---------------------------------------------------------------------------------------------
// The ledger: every request, kept for good. A request still waiting (ok null: the run died) counts.

const ledger = readJson(LEDGER, { requests: [] });
const counts = (q) => q.ok !== false;
const spentSeconds = () => ledger.requests.filter(counts).reduce((s, q) => s + q.ms / 1000, 0);
function saveLedger() {
  const s = spentSeconds();
  writeJson(LEDGER, { totalSeconds: r2(s), creditsEstimate: credits(s), creditsPerMinute: cfg.creditsPerMinute, maxSeconds: cfg.maxSeconds, requests: ledger.requests });
}

// ---------------------------------------------------------------------------------------------
// The request

const lengthMs = (c) => (c.plan ? c.plan.reduce((s, k) => s + k.duration_ms, 0) : c.seconds * 1000);
function problems(n, c) {
  const p = [];
  if (!!c.prompt === !!c.plan) p.push('needs a prompt or a plan (not both)');
  if (lengthMs(c) !== c.seconds * 1000) p.push(`the plan is ${lengthMs(c)} ms, not ${c.seconds} s`);
  for (const k of c.plan || []) if (!(k.duration_ms >= 3000 && k.duration_ms <= 120000)) p.push(`a chunk of ${k.duration_ms} ms (3000-120000)`);
  if (c.plan && c.plan[0].positive_styles.length < 6) p.push('the first chunk wants 6-7 styles');
  if (c.prompt && c.seed != null) p.push('a seed only goes with a plan');
  if (c.conditioning && (!c.plan || !cfg.cues[c.conditioning.cue] || names.indexOf(c.conditioning.cue) > names.indexOf(n))) p.push('conditioning needs a plan and an earlier cue');
  return p;
}
function songIdOf(n) {
  return readJson(path.join(CACHE, n, '1.json'), null)?.songId || ledger.requests.findLast((q) => q.cue === n && q.ok && q.songId)?.songId || null;
}
function requestBody(n, c) {
  const b = { model_id: c.model || cfg.model };
  if (c.prompt) {
    b.prompt = c.prompt;
    b.music_length_ms = c.seconds * 1000;
    if (c.force_instrumental) b.force_instrumental = true;
  } else {
    const chunks = structuredClone(c.plan);
    if (c.conditioning) {
      const k = c.conditioning, id = songIdOf(k.cue);
      if (!id) throw new Error(`${n} is conditioned on ${k.cue}, which has no take yet`);
      chunks[0].conditioning_ref = { song_id: id, range: { start_ms: k.start_ms, end_ms: k.end_ms } };
      chunks[0].condition_strength = k.strength;
    }
    b.composition_plan = { chunks };
    if (c.seed != null) b.seed = c.seed;
  }
  if (c.store_for_inpainting) b.store_for_inpainting = true;
  return b;
}

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error('.env has no ELEVENLABS_API_KEY');
  return m[1];
}
class ApiError extends Error {}
// One attempt, no retry: a music request that times out may still have been made (and billed).
async function compose(body) {
  const r = await fetch(`${API}/v1/music?output_format=mp3_44100_128`, { method: 'POST', body: JSON.stringify(body), headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, signal: AbortSignal.timeout(600e3) });
  if (!r.ok) {
    let msg = await r.text();
    try { const d = JSON.parse(msg).detail; msg = typeof d === 'string' ? d : JSON.stringify(d); } catch {}
    throw new ApiError(`HTTP ${r.status}: ${String(msg).slice(0, 400)}`);
  }
  const audio = Buffer.from(await r.arrayBuffer());
  const headers = Object.fromEntries([...r.headers].filter(([k]) => !/cookie|^date$|^server$|^cf-|alt-svc|^via$|access-control|strict-transport|^vary$|^connection$/i.test(k)));
  return { audio, songId: r.headers.get('song-id'), headers };
}

// ---------------------------------------------------------------------------------------------
// Audio: decoding, analysis, the loop

function decode(file, channels = 2) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = x.length / channels;
  return Array.from({ length: channels }, (_, c) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[i * channels + c]; return y; });
}
const mix = (ch) => { const m = new Float32Array(ch[0].length); for (const c of ch) for (let i = 0; i < m.length; i++) m[i] += c[i] / ch.length; return m; };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

function writeWavF32(file, ch) {
  const n = ch[0].length, k = ch.length, b = Buffer.alloc(44 + n * k * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * k * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(k, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * k * 4, 28);
  b.writeUInt16LE(k * 4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * k * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) b.writeFloatLE(ch[c][i], 44 + (i * k + c) * 4);
  fs.writeFileSync(file, b);
}

// Where the sound starts and ends: 10 ms frames over 60 dB under the loudest frame (never below
// -70 dBFS), keeping KEEP seconds either side.
function soundBounds(ch) {
  const n = ch[0].length, f = [];
  for (let i = 0; i < n; i += HOP) {
    let s = 0; const e = Math.min(n, i + HOP);
    for (const c of ch) for (let k = i; k < e; k++) s += c[k] * c[k];
    f.push(db(Math.sqrt(s / Math.max(1, (e - i) * ch.length))));
  }
  const thr = Math.max(Math.max(...f) - 60, -70);
  const a = f.findIndex((v) => v > thr), b = f.findLastIndex((v) => v > thr);
  if (a < 0) return [0, n];
  return [Math.max(0, a * HOP - Math.round(KEEP * SR)), Math.min(n, (b + 1) * HOP + Math.round(KEEP * SR))];
}

// In-place radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// Onset strength every 10 ms: the spectral flux of the log spectrum (up to ~11 kHz), minus its
// local mean, rectified and lightly smoothed.
function onsets(mono) {
  const N = 2048, K = 512, win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const frames = Math.floor(mono.length / HOP), flux = new Float64Array(frames);
  let prev = new Float64Array(K);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let t = 0; t < frames; t++) {
    const s = t * HOP - N / 2;
    for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < mono.length ? mono[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(K);
    let f = 0;
    for (let k = 1; k < K; k++) { cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k])); f += Math.max(0, cur[k] - prev[k]); }
    flux[t] = t ? f : 0; prev = cur;
  }
  const e = new Float64Array(frames);
  for (let t = 0; t < frames; t++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, t - 25); k <= Math.min(frames - 1, t + 25); k++) { s += flux[k]; c++; }
    e[t] = Math.max(0, flux[t] - s / c);
  }
  const g = [0.12, 0.24, 0.28, 0.24, 0.12], out = new Float64Array(frames);
  for (let t = 0; t < frames; t++) for (let k = -2; k <= 2; k++) out[t] += g[k + 2] * (e[Math.min(frames - 1, Math.max(0, t + k))]);
  return out;
}
function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}
// The beat from the onsets' autocorrelation: the peak near the cue's bpm (or the strongest one between
// 60 and 180 bpm when that is much stronger), refined on the peak eight beats out.
function tempoOf(e, hint) {
  let m = 0; for (const v of e) m += v; m /= e.length;
  const c = Float64Array.from(e, (v) => v - m);
  const ac = (lag) => { let s = 0; for (let t = 0; t + lag < c.length; t++) s += c[t] * c[t + lag]; return s / (c.length - lag); };
  const r0 = ac(0) || 1;
  const peak = (lo, hi) => { let best = lo, v = -Infinity; for (let l = lo; l <= hi; l++) { const x = ac(l); if (x > v) { v = x; best = l; } } return [best, v / r0]; };
  const [g, gs] = peak(33, 100);
  let [lag, s] = hint ? peak(Math.floor(6000 / hint / 1.1), Math.ceil(6000 / hint * 1.1)) : [g, gs];
  if (s < gs * 0.6) [lag, s] = [g, gs];
  let p = lag * 8;
  if (p + 9 < c.length / 2) {
    for (let l = lag * 8 - 8; l <= lag * 8 + 8; l++) if (ac(l) > ac(p)) p = l;
    const y0 = ac(p - 1), y1 = ac(p), y2 = ac(p + 1), den = y0 - 2 * y1 + y2;
    p += den ? Math.max(-0.5, Math.min(0.5, (y0 - y2) / (2 * den))) : 0;
  }
  const beat = p / 8 / 100;
  return { beat, bpm: 60 / beat, strength: s, strongestBpm: 6000 / g };
}
// The loop's period P (the crossfade is X = L - P): a whole number of bars if one fits in the
// crossfade range (else half bars, else beats), nudged up to 30 ms onto the best onset match between
// the start and the tail that will be laid over it.
function loopPoint(e, L, tempo) {
  const Lf = e.length, ov = (pf) => pearson(e.subarray(0, Lf - pf), e.subarray(pf, Lf));
  const lo = L - XMAX, hi = L - XMIN;
  let P = L - 2, how = 'no clear beat: a 2 s crossfade';
  if (tempo.strength >= 0.1) {
    const b = tempo.beat, rank = (k) => (k % 4 === 0 ? 0 : k % 2 === 0 ? 1 : 2), ks = [];
    for (let k = Math.ceil(lo / b); k * b <= hi; k++) ks.push(k);
    ks.sort((x, y) => rank(x) - rank(y) || Math.abs(L - x * b - 2.25) - Math.abs(L - y * b - 2.25));
    if (ks.length) { const k = ks[0]; P = k * b; how = `${k} beats${k % 4 === 0 ? ` (${k / 4} bars)` : k % 2 === 0 ? ' (half bars)' : ''} at ${tempo.bpm.toFixed(1)} bpm`; }
  }
  let pf = Math.round(P * 100), best = pf, bv = ov(pf);
  for (let d = -3; d <= 3; d++) {
    const q = pf + d;
    if (q < lo * 100 || q > hi * 100) continue;
    const v = ov(q); if (v > bv + 0.02) { bv = v; best = q; }
  }
  if (best !== pf) { P = best / 100; how += `, nudged ${(best - pf) * 10} ms`; }
  return { P, how, match: bv };
}
// Where a loop take's music ends: the end of its last 250 ms within 6 dB of its median level. A take
// asked not to end often ends anyway (a final hit and its decay); what follows is cut off, so the
// crossfade lays music over the start rather than the ending.
function bodyEnd(m) {
  const w = SR / 4, lv = [];
  for (let i = 0; i + w <= m.length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += m[k] * m[k]; lv.push(10 * Math.log10(s / w + 1e-12)); }
  const med = [...lv].sort((a, b) => a - b)[lv.length >> 1];
  let k = lv.length - 1;
  while (k > 0 && lv[k] < med - 6) k--;
  return k === lv.length - 1 ? m.length : (k + 1) * w;
}
// Bake the loop: the last X seconds are crossfaded (equal power) into the first X, so the audio is
// periodic with period P; written from 0 to P + LOOP_POST, looping between LOOP_PRE and LOOP_PRE + P.
function bakeLoop(ch0, bpm) {
  const end = bodyEnd(mix(ch0)), cut = (ch0[0].length - end) / SR;
  const ch = ch0.map((a) => a.subarray(0, end));
  const n = ch[0].length, L = n / SR, m = mix(ch), e = onsets(m);
  const tempo = tempoOf(e, bpm);
  const { P, how, match } = loopPoint(e, L, tempo);
  const Ps = Math.round(P * SR), Xs = n - Ps, len = Ps + Math.round(LOOP_POST * SR);
  const out = ch.map((a) => {
    const y = new Float32Array(Ps);
    for (let i = 0; i < Ps; i++) {
      if (i < Xs) { const g = (i / Xs) * Math.PI / 2; y[i] = a[i] * Math.sin(g) + a[Ps + i] * Math.cos(g); } else y[i] = a[i];
    }
    const z = new Float32Array(len);
    for (let i = 0; i < len; i++) z[i] = y[i % Ps];
    return z;
  });
  // How the crossfaded tail compares with the whole: well under 0 dB would dip at the seam.
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += m[i] * m[i]; return Math.sqrt(s / Math.max(1, b - a)); };
  const tailDb = db(rms(Ps, n)) - db(rms(0, n));
  return {
    pcm: out, loop: [LOOP_PRE, r2(LOOP_PRE + Ps / SR, 6)],
    info: { bpm: r2(tempo.bpm, 1), beatStrength: r2(tempo.strength), strongestBpm: r2(tempo.strongestBpm, 1), P: r2(Ps / SR, 4), X: r2(Xs / SR, 3), how, onsetMatch: r2(match), endingCut: r2(cut, 2), tailDb: r2(tailDb, 1) },
  };
}
function fades(ch, inS = 0.005, outS = 0.05) {
  const n = ch[0].length, a = Math.round(inS * SR), b = Math.min(n, Math.round(outS * SR));
  for (const c of ch) {
    for (let i = 0; i < a; i++) c[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
    for (let i = 0; i < b; i++) c[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  }
}

// Integrated loudness, true peak and loudness range (ffmpeg loudnorm), and silences under -50 dB
// longer than 1.5 s (silencedetect).
function measure(file, silences = false) {
  const af = (silences ? 'silencedetect=noise=-50dB:d=1.5,' : '') + 'loudnorm=print_format=json';
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const j = JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1));
  const starts = [...e.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +m[1]), ends = [...e.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  return { i: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra), silences: starts.map((s, k) => [r2(Math.max(0, s)), ends[k] != null ? r2(ends[k]) : 'end']) };
}
// The seam as the game will play it: decode the mp3 and compare 300 ms around loopStart with the same
// span around loopEnd (correlation at no offset, and the offset within 10 ms that matches best).
function seamCheck(file, [a, b]) {
  const x = decode(file, 1)[0], w = Math.round(0.15 * SR), i0 = Math.round(a * SR), i1 = Math.round(b * SR);
  const at = (d) => pearson(x.subarray(i0 - w, i0 + w), x.subarray(i1 + d - w, i1 + d + w));
  let best = 0, bv = -2;
  for (let d = -441; d <= 441; d++) { const v = at(d); if (v > bv) { bv = v; best = d; } }
  return { corr: r2(at(0), 4), bestLagMs: r2(best / SR * 1000, 2), bestCorr: r2(bv, 4) };
}

// Trim, bake the loop, level to cfg.lufs, limit, encode; measure the result.
function processCue(n) {
  const c = cfg.cues[n], raw = rawOf(n), out = outOf(n);
  const ch0 = decode(raw), rawS = ch0[0].length / SR;
  const [a, b] = soundBounds(ch0);
  let ch = ch0.map((x) => x.slice(a, b)), loop = null, loopInfo = null;
  if (c.loop) ({ pcm: ch, loop, info: loopInfo } = bakeLoop(ch, c.bpm));
  else fades(ch);
  fs.mkdirSync(CACHE, { recursive: true });
  const tmp = path.join(CACHE, `tmp-${process.pid}-${n}.wav`);
  writeWavF32(tmp, ch);
  const before = measure(tmp), lim = 10 ** ((cfg.truePeak ?? -1.5) / 20);
  let gainDb = cfg.lufs - before.i, after;
  const encode = () => execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', tmp,
    '-af', `volume=${gainDb.toFixed(2)}dB,apad=pad_len=${LIMITER_DELAY},alimiter=limit=${lim.toFixed(4)}:level=0,atrim=start_sample=${LIMITER_DELAY}`,
    '-ar', String(SR), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, out]);
  fs.mkdirSync(OUT, { recursive: true });
  try {
    encode();
    after = measure(out, true);
    // The limiter and the encoder move the level a little: one more pass if it is off by over 0.2 LU.
    if (Math.abs(after.i - cfg.lufs) > 0.2) { gainDb += cfg.lufs - after.i; encode(); after = measure(out, true); }
  } finally { fs.rmSync(tmp, { force: true }); }
  const d = decode(out, 1)[0].length / SR;
  const meta = {
    f: `${n}.mp3`, d: r2(d, 3), loop, lufs: r2(after.i, 1), tp: r2(after.tp, 1), lra: r2(after.lra, 1), gainDb: r2(gainDb), rawLufs: r2(before.i, 1),
    rawS: r2(rawS, 3), trimmed: [r2(a / SR, 3), r2(rawS - b / SR, 3)], silences: after.silences, loopInfo, seam: loop ? seamCheck(out, loop) : null,
  };
  writeJson(path.join(CACHE, n, 'meta.json'), { ...readJson(path.join(CACHE, n, 'meta.json'), {}), ...meta });
  const s = meta.seam;
  console.log(`  ${n}: ${meta.d} s, ${meta.lufs} LUFS (gain ${meta.gainDb} dB), peak ${meta.tp} dBTP${loop ? `, loop ${loop[0]}-${loop[1]} (X ${loopInfo.X} s, ${loopInfo.how}), seam corr ${s.corr}` : ''}${meta.silences.length ? `, silences ${JSON.stringify(meta.silences)}` : ''}`);
  return meta;
}

// ---------------------------------------------------------------------------------------------
// Listening for vocals: tools/voice/analyze.py (a local Swedish recogniser). On instrumental music
// it hears nothing or invents a short phrase per 30 s window (its stock subtitle phantoms: "av musik",
// "»Masked Singer»", "Nationalencyklopedic"; on these takes a voice detector found no speech at all),
// and not the same phrase twice. More than a few words per window suggests singing.
const PHANTOM = /<\|[^|]*\|>|textning|svensktextning|undertext|btistudios|stina hedin|www|\.nu\b|\.com\b|tack för att ni (tittade|lyssnade)|prenumerera|masked singer|nationalencyklopedi\S*|musik\S*|♪/gi;
const WORDS_PER_WINDOW = 3;
function listen(list) {
  if (!list.length) return;
  const jobs = list.map((n) => ({ file: outOf(n), text: '' }));
  const r = spawnSync('uv', ['run', '--quiet', path.join(ROOT, 'tools/voice/analyze.py')], { input: jobs.map((j) => JSON.stringify(j)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 26, cwd: ROOT });
  if (r.status !== 0) { console.log('analyze.py failed (no vocals check): ' + (r.stderr || '').slice(-400)); return; }
  const res = r.stdout.trim().split('\n').filter(Boolean).map((s) => JSON.parse(s));
  for (const [k, n] of list.entries()) {
    const heard = res[k]?.heard ?? '', words = heard.replace(PHANTOM, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w));
    const f = path.join(CACHE, n, 'meta.json'), meta = readJson(f, {}), sung = words.length > WORDS_PER_WINDOW * Math.ceil((meta.d || 30) / 30);
    writeJson(f, { ...meta, heard, words: words.length, vocals: sung ? 'check: words heard' : 'none heard' });
    console.log(`  ${n}: heard ${heard ? `"${heard.slice(0, 120)}"` : 'nothing'} -> ${sung ? 'CHECK FOR VOCALS' : 'no vocals'}`);
  }
}

// The game's manifest and the review page's index, from each cue's meta (else the old manifest).
function writeIndexes() {
  const old = readJson(MANIFEST, {}), m = {}, review = {};
  for (const n of names) {
    const meta = readJson(path.join(CACHE, n, '1.json'), null) && readJson(path.join(CACHE, n, 'meta.json'), null);
    if (meta && fs.existsSync(outOf(n))) m[n] = { f: meta.f, d: meta.d, loop: meta.loop, lufs: meta.lufs };
    else if (old[n] && fs.existsSync(outOf(n))) m[n] = old[n];
    if (!meta) continue;
    const take = readJson(path.join(CACHE, n, '1.json'), {}), c = cfg.cues[n];
    review[n] = {
      about: c.about, file: `assets/music/${n}.mp3`, songId: take.songId, model: take.request?.model_id, requestedS: take.ms / 1000,
      conditioning: take.conditioning || null, ...meta,
    };
  }
  writeJson(MANIFEST, m);
  writeJson(REVIEW, { lufsTarget: cfg.lufs, ledger: { totalSeconds: r2(spentSeconds()), creditsEstimate: credits(spentSeconds()) }, cues: review });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Commands

async function generate() {
  const only = opt('--only')?.split(','), dry = flag('--dry');
  for (const o of only || []) if (!cfg.cues[o]) throw new Error(`cues.json has no cue ${o}`);
  const spent = spentSeconds(), todo = [], refuse = [];
  console.log(`cues.json: ${names.length} cues; the ledger: ${ledger.requests.length} requests, ${r2(spent)} s generated ≈ ${credits(spent)} credits`);
  for (const n of names) {
    const c = cfg.cues[n], have = fs.existsSync(rawOf(n)), asset = fs.existsSync(outOf(n));
    const make = !have && (!only || only.includes(n)), sec = make ? lengthMs(c) / 1000 : 0, p = problems(n, c);
    const prev = ledger.requests.filter((q) => q.cue === n);
    if (make && prev.some(counts)) p.push(`the ledger says it was made already (${prev.find(counts).songId || 'pending'}) but the raw take is gone: remove that ledger entry to make it again`);
    if (make && prev.length >= ATTEMPTS) p.push(`${prev.length} requests already (a failed one is retried once)`);
    if (make) todo.push(n);
    if (make && p.length) refuse.push(n);
    console.log(`  ${n.padEnd(14)} ${(have ? 'take' : '-').padEnd(5)} ${(asset ? 'asset' : '-').padEnd(6)} ${make ? `make ${String(sec).padStart(3)} s ≈ ${String(credits(sec)).padStart(4)} credits` : '-'.padEnd(26)} ${c.loop ? 'loop' : '    '} ${c.conditioning ? `on ${c.conditioning.cue} ${c.conditioning.start_ms / 1000}-${c.conditioning.end_ms / 1000} s (${c.conditioning.strength})` : ''}`);
    for (const x of p) console.log(`      PROBLEM: ${x}`);
  }
  const sec = todo.reduce((s, n) => s + lengthMs(cfg.cues[n]) / 1000, 0);
  console.log(`to make now: ${sec} s ≈ ${credits(sec)} credits; with the ledger ${r2(spent + sec)} s of max ${cfg.maxSeconds} s (≈ ${credits(spent + sec)} credits at ${cfg.creditsPerMinute}/min)`);
  if (spent + sec > cfg.maxSeconds) { console.log(`REFUSED: ${r2(spent + sec)} s is over maxSeconds (${cfg.maxSeconds}). Nothing made.`); process.exitCode = 1; return; }
  if (refuse.length) { console.log(`REFUSED: problems with ${refuse.join(', ')}. Nothing made.`); process.exitCode = 1; return; }
  if (dry) return;
  if (!todo.length) { writeIndexes(); console.log('nothing to make; indexes rewritten'); return; }

  const made = [];
  let abort = null;
  for (const n of todo) {
    const c = cfg.cues[n], ms = lengthMs(c);
    let body;
    try { body = requestBody(n, c); } catch (e) { abort = e.message; break; }
    if (spentSeconds() + ms / 1000 > cfg.maxSeconds) { abort = `cap of ${cfg.maxSeconds} s reached`; break; }
    const conditioning = c.conditioning ? { cue: c.conditioning.cue, songId: body.composition_plan.chunks[0].conditioning_ref.song_id, range: [c.conditioning.start_ms, c.conditioning.end_ms], strength: c.conditioning.strength } : null;
    const q = { cue: n, ms, model: body.model_id, at: new Date().toISOString(), ok: null, songId: null, received: null, ...(conditioning ? { conditioning } : {}), ...(body.store_for_inpainting ? { store_for_inpainting: true } : {}) };
    ledger.requests.push(q); saveLedger();
    console.log(`${n}: requesting ${ms / 1000} s (${c.plan ? `plan, ${c.plan.length} chunks, seed ${c.seed}` : 'prompt'}${conditioning ? `, conditioned on ${conditioning.cue}` : ''}) ...`);
    const t0 = Date.now();
    let res;
    try { res = await compose(body); } catch (e) {
      Object.assign(q, { ok: false, error: String(e.message).slice(0, 400), waited: r2((Date.now() - t0) / 1000, 1) });
      if (!(e instanceof ApiError)) q.note = `network error (${e.cause?.code || e.name}): check the account's history that nothing was made`;
      saveLedger(); abort = `${n}: ${q.error}`; break;
    }
    const dir = path.join(CACHE, n);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(rawOf(n), res.audio);
    let received = null;
    try { received = r2(decode(rawOf(n), 1)[0].length / SR, 3); } catch {}
    Object.assign(q, { ok: true, songId: res.songId, received, bytes: res.audio.length, waited: r2((Date.now() - t0) / 1000, 1), ...(conditioning ? { conditioningAccepted: true } : {}) });
    saveLedger();
    writeJson(path.join(dir, '1.json'), { cue: n, ms, songId: res.songId, received, at: q.at, waited: q.waited, request: body, headers: res.headers, conditioning: conditioning && { ...conditioning, accepted: true } });
    console.log(`${n}: got ${received} s (song ${res.songId}) in ${q.waited} s`);
    if (received == null) { abort = `${n}: the response does not decode as audio (${res.audio.length} bytes)`; break; }
    processCue(n);
    made.push(n);
  }
  listen(made);
  writeIndexes();
  const s = spentSeconds();
  console.log(`made ${made.length} cues; the ledger: ${r2(s)} s generated ≈ ${credits(s)} credits`);
  if (abort) { console.log('ABORTED: ' + abort); process.exitCode = 1; }
}

function reprocess() {
  const list = names.filter((n) => fs.existsSync(rawOf(n)));
  for (const n of list) processCue(n);
  listen(list);
  writeIndexes();
  console.log(`reprocessed ${list.length} cues`);
}

function check() {
  const man = readJson(MANIFEST, {});
  const missing = names.filter((n) => !fs.existsSync(outOf(n)) || !man[n]);
  const extra = Object.keys(man).filter((n) => !cfg.cues[n]);
  const s = spentSeconds();
  console.log(`${names.length} cues; ${names.length - missing.length} with their mp3 and index entry; the ledger: ${r2(s)} s ≈ ${credits(s)} credits`);
  if (missing.length) console.log(`MISSING: ${missing.map((n) => `${n}${fs.existsSync(outOf(n)) ? ' (no index entry)' : ''}`).join(', ')}`);
  if (extra.length) console.log(`in the index but not in cues.json: ${extra.join(', ')}`);
  if (missing.length) process.exitCode = 1;
  else console.log('music-check ok');
}

try {
  if (cmd === 'check') check();
  else if (cmd === 'reprocess') reprocess();
  else if (cmd === 'gen') await generate();
  else throw new Error('unknown command ' + cmd);
} catch (e) { console.log(e instanceof ApiError ? 'ABORTED: ' + e.message : e.stack); process.exitCode = 1; }
