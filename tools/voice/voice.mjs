// The voice clips: every line in src/game/script.js spoken by its role's ElevenLabs voice, made
// ahead of time and checked in (features/implemented/a_fully_voiced_game.md, section 5). The game
// never calls the API; it reads assets/voice/index.json and plays assets/voice/<who>/<hash>.mp3.
//
//   node tools/voice/voice.mjs [--dry] [--who a,b] [--day n] [--limit n] [--max chars] [--all] [--prune]
//        what is missing (in scope) gets made, checked by ear (a local Swedish recogniser), retaken
//        up to twice, processed and written to the manifest. --dry: only say what would be made and
//        what it would cost. --all ignores cast.json's scope. --prune removes clips no line uses.
//   node tools/voice/voice.mjs check         no requests: lines without a clip, orphans; exit 1 if
//                                             anything in scope is missing (a test can run it)
//   node tools/voice/voice.mjs reprocess [--who a,b]   redo trimming, shift, loudness, lip curves
//                                             from .cache (free)
//   node tools/voice/voice.mjs qc [--all]    listen to the takes in use that have no verdict (--all:
//                                             every one again; free): qc.json
//   node tools/voice/voice.mjs hear [--who a,b]   listen to the clips as the game plays them
//                                             (after the shift: pitch and words; free, nothing kept)
//   node tools/voice/voice.mjs manifest      just rewrite assets/voice/index.json
//   node tools/voice/voice.mjs cast <who> [--search n] [--design] [--rounds n]
//        auditions: each Voice Library candidate in cast.json says the role's preview text (and
//        --design: Voice Design candidates); measured, for the review page (make voice-review). A
//        candidate already auditioned for another role is copied from there (its text; no request).
//   node tools/voice/voice.mjs choose <who> <voice_id | design:<generated_voice_id> | none>
//
// The children (features/implemented/barnroster.md): ElevenLabs makes no child voices, so a child's
// role has an adult voice and a "shift": { pitch, formant } in cast.json, and the processing raises
// the take by those factors (tools/voice/shift.py: Praat), its length kept (the times and the lip
// curve still fit). A changed shift needs no request: reprocess --who <role>; `cast <role>` makes the
// auditions as the role would sound (raised).
// The files: tools/voice/cast.json (the roles: voice, settings, shift, candidates, scope), lines.json
// (direction per line: { who: { text: { tts, retake, locked, hash, note, lufs } } }), qc.json (what
// the recogniser heard, per clip), .cache/voice/ (raw takes and auditions: not checked in).
// A clip's name is a hash of who, the spoken text, the voice, model, settings and retake number, and
// its seed comes from the same hash: change any of it and the clip is missing (made next run) and
// the old one is an orphan. The API key is read from .env (ELEVENLABS_API_KEY) and only ever goes
// into a request header. Any API error stops the run; a network blip gets one more try.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'tools/voice');
const CONF = path.join(DIR, 'cast.json'), LINES = path.join(DIR, 'lines.json'), QCF = path.join(DIR, 'qc.json');
const CACHE = path.join(ROOT, '.cache/voice'), RAW = path.join(CACHE, 'raw'), CASTDIR = path.join(CACHE, 'cast');
const OUT = path.join(ROOT, 'assets/voice'), MANIFEST = path.join(OUT, 'index.json');
const API = 'https://api.elevenlabs.io';
const WORKERS = 2;                 // the plan allows three requests at a time
const TP = -1.5, KBPS = 64, SR = 44100, FPS = 30;
const RETAKES = 2;                 // automatic retakes of a take the recogniser rejects
const LIP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';   // 64 mouth levels

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const cmd = args[0] && !args[0].startsWith('--') ? args[0] : 'gen';
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const conf = readJson(CONF);
const direction = readJson(LINES, {});
const saveConf = () => fs.writeFileSync(CONF, JSON.stringify(conf, null, 2) + '\n');
const saveLines = () => fs.writeFileSync(LINES, JSON.stringify(direction, null, 1) + '\n');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const rel = (f) => path.relative(ROOT, f);

// ---------------------------------------------------------------------------------------------
// The API

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error('.env has no ELEVENLABS_API_KEY');
  return m[1];
}
export class ApiError extends Error {}
export async function api(p, body, { method = 'POST', accept = 'application/json' } = {}) {
  let r;
  for (let tries = 0, busy = 0; ; tries++) {
    try {
      r = await fetch(API + p, { method, body: body && JSON.stringify(body), headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: accept } });
    } catch (e) { if (tries) throw e; await new Promise((ok) => setTimeout(ok, 3000)); continue; }   // a network blip: once more
    // A Voice Library voice is added to the account by its first request: two at once for the same
    // new voice get 409 already_running (nothing made, nothing charged). Wait and ask again.
    if (r.status === 409 && busy < 3) { const t = await r.clone().text(); if (/already_running/.test(t)) { busy++; await new Promise((ok) => setTimeout(ok, 2500 * busy)); continue; } }
    break;
  }
  if (!r.ok) {
    let msg = await r.text();
    try { const d = JSON.parse(msg).detail; msg = typeof d === 'string' ? d : [d?.status, d?.message].filter(Boolean).join(': ') || JSON.stringify(d); } catch {}
    throw new ApiError(`HTTP ${r.status} ${p.split('?')[0]}: ${String(msg).slice(0, 300)}`);
  }
  const cost = r.headers.get('character-cost');
  return { r, cost: cost == null ? null : Number(cost) };
}

// ---------------------------------------------------------------------------------------------
// The plan: every line, its clip, whether it is in scope

// Lines a person should look at rather than a machine: nothing but punctuation (Rune's "..."),
// interjections, digits and abbreviations. Two words or fewer are never rejected automatically.
const INTERJ = /^(hmpf|hm+|mm+|aj|oj|jaha|jaså|jaja|nej|ja|tja|äh|öh|tut)$/i;
const words = (t) => t.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, '')).filter(Boolean);
// Something to say: words, or an audio tag ("[sighs] ..." for a line that is only "...").
const sayable = (t) => words(t).length > 0 || /\[[^\]]+\]/.test(t);
function humanFlags(text, spoken) {
  const f = [], w = words(spoken);
  if (!w.length) f.push('punctuation');
  else if (w.every((x) => INTERJ.test(x))) f.push('interjection');
  if (/\d/.test(spoken)) f.push('digits');
  if (/\b[A-ZÅÄÖ]{2,}\b/.test(spoken) && !/^[A-ZÅÄÖ]+[.!?]*$/.test(spoken)) f.push('caps');
  return f;
}
export const short = (spoken) => words(spoken).length <= 2 || words(spoken).every((x) => INTERJ.test(x));

const settingsOf = (who) => ({ ...conf.settings, ...conf.roles[who]?.settings });
// tools/voice/lexicon.pls: aliases (<grapheme> -> <alias>) applied to what the voice is asked to say.
const LEX = (() => {
  const f = path.join(DIR, 'lexicon.pls');
  if (!fs.existsSync(f)) return [];
  return [...fs.readFileSync(f, 'utf8').matchAll(/<lexeme>\s*<grapheme>([^<]+)<\/grapheme>\s*<alias>([^<]+)<\/alias>\s*<\/lexeme>/g)].map(([, g, a]) => [new RegExp(`(?<![\\p{L}])${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu'), a]);
})();
const alias = (t) => LEX.reduce((s, [re, a]) => s.replace(re, a), t);

// The shared tables' speakers. allLines() gives a shared table's line once, with its pseudo-speaker
// ('ped', 'driver', 'cast', ...); script.js's `// @voice ...` tag above the table says who can say
// it. Each line is made for every voice those tags name: a pool voice (cast.json roles with a
// "pool": { sex, age }) or a neighbour. The game picks the pool voice from the person (voice.js
// voiceFor: sex, age, their own seed), so every voice a person can have needs the line.
//   ped       adults 19-64: the pool's young (19-34; teens too) and mid (35-64) voices
//   ped_teen  13-18: the young voices          ped_old   65+: the old voices
//   ped_kid   children (under 13): the kid voices (adult voices raised: "shift", barnroster.md)
//   driver    anyone at a wheel (randomPed: any age): every grown-up pool voice
//   window    someone in a house: the mid and old voices
//   cast      every neighbour (not Ove; not the extras' roles: "extra": true); a role key: that role
export const POOL_AGES = { ped: ['young', 'mid'], ped_teen: ['young'], ped_old: ['old'], ped_kid: ['kid'], driver: ['young', 'mid', 'old'], window: ['mid', 'old'] };
function tagsOf(script, src) {
  const by = new Map();
  // (the tagged tables are plain pools of text: no WHEN tags in them)
  const strings = (v, out) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };
  for (const [, tags, name] of src.matchAll(/^\/\/ @voice ([^\n]+)\nexport const (\w+)/gm)) {
    for (const t of strings(script[name], [])) { const s = by.get(t) || new Set(); for (const k of tags.trim().split(/\s+/)) s.add(k); by.set(t, s); }
  }
  return by;
}
export function speakersFor(who, text, tags) {
  if (conf.roles[who] && !conf.roles[who].pool) return [who];
  const pool = Object.entries(conf.roles).filter(([, r]) => r.pool);
  const cast = Object.keys(conf.roles).filter((k) => k !== 'ove' && !conf.roles[k].pool && !conf.roles[k].extra);
  const out = new Set();
  for (const t of tags.get(text) || [who]) {
    if (t === 'cast') cast.forEach((k) => out.add(k));
    else if (conf.roles[t]) out.add(t);   // (a role: a neighbour)
    else if (POOL_AGES[t]) for (const [k, r] of pool) { if (POOL_AGES[t].includes(r.pool.age)) out.add(k); }
  }
  // (a speaker nobody knows stays in the plan as itself: "no voice", never silently gone)
  return out.size || POOL_AGES[who] ? [...out] : [who];
}
// The pool as the game reads it (index.json _pool): { 'f_young': [keys], ..., 'm_kid': [keys] }.
export function poolGroups() {
  const g = {};
  for (const [k, r] of Object.entries(conf.roles)) if (r.pool && r.voice_id) (g[`${r.pool.sex}_${r.pool.age}`] ||= []).push(k);
  return g;
}

export async function plan() {
  const file = path.join(ROOT, 'src/game/script.js');
  const script = await import(pathToFileURL(file).href + '?t=' + Date.now());
  const tags = tagsOf(script, fs.readFileSync(file, 'utf8'));
  const seen = new Set(), expanded = [];
  for (const [who, text, part] of script.allLines()) {
    for (const k of speakersFor(who, text, tags)) { const key = k + '\0' + text; if (!seen.has(key)) { seen.add(key); expanded.push([k, text, part, who]); } }
  }
  return expanded.map(([who, text, part, from]) => {
    const role = conf.roles[who] || null, d = direction[who]?.[text] || {};
    const spoken = alias(d.tts || text), id = role?.voice_id || null, take = d.retake || 0;
    const inScope = !conf.scope || conf.scope.who.includes(who) || conf.scope.parts.includes(part);
    const hash = d.locked && d.hash ? d.hash : id && sayable(spoken) ? sha([who, spoken, id, conf.model, JSON.stringify(settingsOf(who)), ...(take ? [take] : [])].join('\0')).slice(0, 12) : null;
    const file = hash && `${who}/${hash}.mp3`;
    return { who, text, part, from, spoken, id, take, hash, file, inScope, mumble: !!role?.mumble, have: !!file && fs.existsSync(path.join(OUT, file)), flags: humanFlags(text, spoken) };
  });
}

function table(list, credits = true) {
  const by = {};
  for (const l of list) { const b = (by[l.who] ||= { lines: 0, chars: 0 }); b.lines++; b.chars += l.spoken.length; }
  let n = 0, c = 0;
  for (const [who, b] of Object.entries(by).sort((a, b) => b[1].chars - a[1].chars)) {
    console.log(`  ${who.padEnd(11)} ${String(b.lines).padStart(4)} lines ${String(b.chars).padStart(6)} chars${credits ? ` ≈ ${Math.ceil(b.chars * conf.creditsPerChar)} credits` : ''}`);
    n += b.lines; c += b.chars;
  }
  console.log(`  ${'total'.padEnd(11)} ${String(n).padStart(4)} lines ${String(c).padStart(6)} chars${credits ? ` ≈ ${Math.ceil(c * conf.creditsPerChar)} credits (${conf.model}, ${conf.creditsPerChar}/char before any discount)` : ''}`);
  return c;
}

function orphans(lines) {
  const used = new Set(lines.filter((l) => l.file).map((l) => l.file)), out = [];
  for (const d of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) {
    const p = path.join(OUT, d);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p)) if (!used.has(`${d}/${f}`)) out.push(`${d}/${f}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Processing a raw take: trim, level, limit, mono mp3; the lip curve and the per-character times

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
function rmsFrames(pcm, hop) {
  const out = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let s = 0; const e = Math.min(pcm.length, i + hop);
    for (let k = i; k < e; k++) s += pcm[k] * pcm[k];
    out.push(Math.sqrt(s / Math.max(1, e - i)));
  }
  return out;
}
// Where the speech starts and ends: 10 ms frames over the threshold (45 dB under the loudest frame,
// and never below -60 dBFS), keeping a 40 ms breath before and 100 ms after.
function speechBounds(pcm) {
  const hop = SR / 100, f = rmsFrames(pcm, hop), peak = Math.max(...f.map(db));
  const thr = Math.max(peak - 45, -60);
  let a = f.findIndex((v) => db(v) > thr), b = f.length - 1 - [...f].reverse().findIndex((v) => db(v) > thr);
  if (a < 0) { a = 0; b = f.length - 1; }
  const dur = pcm.length / SR;
  return [Math.max(0, a / 100 - 0.04), Math.min(dur, (b + 1) / 100 + 0.1)];
}
function writeWav(file, pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
// Integrated loudness (LUFS) of a wav; a clip under ~0.4 s can't be measured, so it is looped.
function lufsOf(wav) {
  const measure = (loop) => {
    const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-stream_loop', String(loop), '-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const i = Number(JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)).input_i);
    return Number.isFinite(i) && i > -70 ? i : null;
  };
  return measure(0) ?? measure(4);
}
// The mouth: loudness every 1/30 s mapped to 0..1 (opens at once, closes over ~80 ms), shut on m,
// b and p (from the character times: the lips meet there however loud the vowel around it is).
function lipCurve(pcm, gain, times) {
  const f = rmsFrames(pcm, SR / FPS).map((v) => db(v * gain));
  const out = [];
  let y = 0;
  const rel = Math.exp(-1 / FPS / 0.08);
  for (const d of f) { const x = Math.max(0, Math.min(1, (d + 48) / 34)); y = Math.max(x, y * rel); out.push(y); }
  for (const [ch, t0, t1] of times) if (/[mbpMBP]/.test(ch)) {
    const a = Math.floor(t0 * FPS), b = Math.max(a, Math.floor((t0 + (t1 - t0) * 0.6) * FPS));
    for (let k = a; k <= b && k < out.length; k++) if (k >= 0) out[k] = 0;
  }
  return out.map((v) => LIP[Math.round(v * 63)]).join('');
}
// Each character of the line as written (the subtitle) gets the time it is said: straight from the
// API's alignment, shifted by the trim; a `tts` text that differs is mapped across.
function charTimes(text, spoken, al, shift) {
  if (!al?.characters?.length) return null;
  const st = al.character_start_times_seconds, chars = al.characters.join('');
  let k = chars.indexOf(text);
  const at = (j) => Math.max(0, st[Math.min(st.length - 1, Math.max(0, j))] - shift);
  const out = [];
  for (let i = 0; i < text.length; i++) out.push(Math.round(100 * (k >= 0 ? at(k + i) : at(Math.round(i * (chars.length - 1) / Math.max(1, text.length - 1))))));
  return out;
}

// A child's role (cast.json "shift": { pitch, formant }): tools/voice/shift.py (Praat's Change gender,
// PSOLA) raises the take's pitch by `pitch` and its formants by `formant`, its length kept to the
// sample, so the character times and the lip curve still fit. (ffmpeg's rubberband was tried first: at
// the same pitch the recogniser misheard more than twice as many of Sara's lines.) A wav in, a wav out.
export function shiftWav(src, dst, shift) {
  const r = spawnSync('uv', ['run', '--quiet', path.join(DIR, 'shift.py')], { input: JSON.stringify({ src, dst, pitch: shift.pitch ?? 1, formant: shift.formant ?? 1 }) + '\n', encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0 || !fs.existsSync(dst)) throw new Error('shift.py failed: ' + (r.stderr || '').slice(-600));
}

const lufsTarget = (l) => direction[l.who]?.[l.text]?.lufs ?? conf.roles[l.who]?.lufs ?? conf.lufs ?? -20;
function processTake(l) {
  const raw = path.join(RAW, l.who, l.hash + '.mp3'), al = readJson(path.join(RAW, l.who, l.hash + '.json'), {}).alignment;
  const pcm = decode(raw);
  const [a, b] = speechBounds(pcm);
  let seg = pcm.subarray(Math.floor(a * SR), Math.floor(b * SR));
  // (in memory where there is a /dev/shm: nothing on a disk that may be full)
  const tmp = path.join(fs.existsSync('/dev/shm') ? '/dev/shm' : CACHE, `saab-voice-${process.pid}-${l.hash}.wav`);
  fs.mkdirSync(CACHE, { recursive: true });
  writeWav(tmp, seg);
  const shift = conf.roles[l.who]?.shift;
  if (shift) {
    const raised = tmp.replace(/\.wav$/, '-shift.wav');
    shiftWav(tmp, raised, shift);
    fs.renameSync(raised, tmp);
    seg = decode(tmp);
  }
  const i = lufsOf(tmp), gainDb = i == null ? 0 : lufsTarget(l) - i;
  const out = path.join(OUT, l.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', tmp, '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${(10 ** (TP / 20)).toFixed(3)}:level=0`,
    '-ar', String(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, out]);
  fs.rmSync(tmp);
  if (!(fs.statSync(out).size > 0)) { fs.rmSync(out); throw new Error(`ffmpeg wrote nothing for ${l.file} (a full disk?)`); }
  const times = al ? al.characters.map((c, j) => [c, al.character_start_times_seconds[j] - a, al.character_end_times_seconds[j] - a]) : [];
  const meta = { f: `${l.who}/${l.hash}.mp3`, d: Math.round(seg.length / SR * 100) / 100, t: charTimes(l.text, l.spoken, al, a), lip: lipCurve(seg, 10 ** (gainDb / 20), times), lufs: i == null ? null : Math.round(i * 10) / 10 };
  writeJson(path.join(RAW, l.who, l.hash + '.meta.json'), meta);
  return meta;
}

// The manifest the game reads: { who: { text: { f, d, t, lip } }, _tempo: { who: chars/s }, _fps }.
// Built from the plan and each clip's metadata (from .cache, else the manifest it replaces).
function writeManifest(lines) {
  const old = readJson(MANIFEST, {}), byFile = {};
  for (const [who, o] of Object.entries(old)) if (!who.startsWith('_')) for (const m of Object.values(o)) byFile[m.f] = m;
  const m = {}, rate = {};
  for (const l of lines) {
    if (!l.have) continue;
    const meta = readJson(path.join(RAW, l.who, l.hash + '.meta.json'), null) || byFile[l.file];
    if (!meta) continue;
    const { lufs, ...keep } = meta;
    (m[l.who] ||= {})[l.text] = keep;
    if (meta.d > 0.6) (rate[l.who] ||= []).push(l.text.length / meta.d);
  }
  m._tempo = {};
  for (const [who, r] of Object.entries(rate)) { r.sort((x, y) => x - y); m._tempo[who] = Math.round(r[r.length >> 1] * 10) / 10; }
  m._fps = FPS;
  m._pool = poolGroups();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m) + '\n');
  return m;
}

// ---------------------------------------------------------------------------------------------
// Listening: tools/voice/analyze.py (faster-whisper with KBLab's Swedish model, and Praat)

export function analyze(jobs) {
  if (!jobs.length) return [];
  const r = spawnSync('uv', ['run', '--quiet', path.join(DIR, 'analyze.py')], { input: jobs.map((j) => JSON.stringify(j)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 26, cwd: ROOT });
  if (r.status !== 0) throw new Error('analyze.py failed: ' + (r.stderr || '').slice(-600));
  return r.stdout.trim().split('\n').filter(Boolean).map((s) => JSON.parse(s));
}
// A take is rejected when the recogniser heard other words (WER over 0.25), or when it is far too
// slow or fast for the role. Short lines and interjections are never rejected: they go to review.
function verdict(l, a, tempo) {
  const cps = l.spoken.replace(/\[[^\]]*\]\s*/g, '').length / Math.max(0.2, a.dur - 0.14);
  const flags = [];
  if (a.wer > 0.25) flags.push('words');
  if (tempo && (cps < tempo * 0.45 || cps > tempo * 2.2)) flags.push('pace');
  const isShort = short(l.spoken) || l.flags.length;
  return { cps: Math.round(cps * 10) / 10, flags, verdict: !flags.length && !(isShort && a.wer > 0) ? 'ok' : isShort ? 'review' : 'retake' };
}

// ---------------------------------------------------------------------------------------------
// Making clips

async function take(l, log) {
  const rawDir = path.join(RAW, l.who), raw = path.join(rawDir, l.hash + '.mp3');
  if (fs.existsSync(raw)) { log(`${l.who} raw take already here (no request)`); return 0; }
  const body = { text: l.spoken, model_id: conf.model, language_code: conf.language, voice_settings: settingsOf(l.who), seed: parseInt(l.hash.slice(0, 8), 16) };
  const { r, cost } = await api(`/v1/text-to-speech/${l.id}/with-timestamps?output_format=mp3_44100_128`, body);
  const j = await r.json();
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(raw, Buffer.from(j.audio_base64, 'base64'));
  writeJson(path.join(rawDir, l.hash + '.json'), { who: l.who, text: l.text, spoken: l.spoken, voice: l.id, model: conf.model, take: l.take, cost, alignment: j.alignment, normalized: j.normalized_alignment });
  log(`${l.who} ${l.spoken.length} chars, cost ${cost ?? '?'}: ${l.spoken.slice(0, 64)}`);
  return cost ?? l.spoken.length * conf.creditsPerChar;
}

async function generate() {
  const max = Number(opt('--max', 30000)), only = opt('--who')?.split(','), limit = Number(opt('--limit', Infinity)), day = opt('--day');
  const dry = flag('--dry'), all = flag('--all');
  let lines = await plan();
  const total = lines.reduce((s, l) => s + l.spoken.length, 0);
  console.log(`script.js: ${lines.length} lines, ${total} chars; clips on disk ${lines.filter((l) => l.have).length}`);
  const scoped = lines.filter((l) => all || l.inScope), outside = lines.filter((l) => !all && !l.inScope);
  console.log(`in scope (${all || !conf.scope ? 'everything' : `who ${conf.scope.who.join(',')} or part ${conf.scope.parts.join(',')}`}):`);
  table(scoped, false);
  if (outside.length) { console.log('outside the scope (mumbled until the scope grows):'); table(outside, false); }
  const noVoice = scoped.filter((l) => !l.id && !l.mumble && sayable(l.spoken));
  if (noVoice.length) { console.log('in scope but the role has no voice yet (make voice-cast):'); table(noVoice, false); }
  const mumbled = scoped.filter((l) => l.mumble);
  if (mumbled.length) console.log(`in scope but mumbled by choice (cast.json "mumble": ${[...new Set(mumbled.map((l) => l.who))].join(', ')}): ${mumbled.length} lines`);
  const silent = scoped.filter((l) => !sayable(l.spoken));
  if (silent.length) console.log(`nothing to say (punctuation only; give it a "tts" in lines.json to voice it): ${silent.map((l) => `${l.who} "${l.text}"`).join(', ')}`);
  let todo = scoped.filter((l) => l.id && l.hash && !l.have && (!only || only.includes(l.who)) && (!day || l.part === 'day' + day));
  if (only) todo = only.flatMap((w) => todo.filter((l) => l.who === w).slice(0, limit)); else todo = todo.slice(0, limit);
  console.log('to make now:');
  const chars = table(todo);
  const human = todo.filter((l) => l.flags.length);
  if (human.length) console.log(`for a person to check afterwards: ${human.map((l) => `${l.who} "${l.text}" (${l.flags.join(', ')})`).join('; ')}`);
  const orph = orphans(lines), prune = flag('--prune') && !dry;
  if (orph.length) console.log(`${orph.length} clips no line uses any more${prune ? ': removed' : ' (PRUNE=1 removes them)'}`);
  if (prune) for (const o of orph) fs.rmSync(path.join(OUT, o));
  if (dry) return;
  if (chars * conf.creditsPerChar > max) { console.log(`REFUSED: ${chars} chars is over the cap of ${max} (MAX=n). Nothing made.`); process.exitCode = 1; return; }
  if (!todo.length) { writeManifest(lines); console.log('nothing to make; manifest rewritten'); return; }

  const qc = readJson(QCF, {});
  let spent = 0, abort = null;
  const tempo = readJson(MANIFEST, {})._tempo || {};
  for (let round = 0; round <= RETAKES && todo.length && !abort; round++) {
    if (round) console.log(`retakes, round ${round}: ${todo.length}`);
    const queue = [...todo];
    let n = 0;
    const worker = async () => {
      while (queue.length && !abort) {
        const l = queue.shift();
        if (spent > max) { abort ||= `cap of ${max} reached`; return; }
        try { const c = await take(l, (s) => console.log(`[${++n}/${todo.length}] ${s}`)); spent += c; } catch (e) { abort ||= e.message; }
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    // Listen to everything that came back, process what passed, retake what didn't.
    const got = todo.filter((l) => fs.existsSync(path.join(RAW, l.who, l.hash + '.mp3')));
    // (a take already listened to - a run that died before processing it - isn't heard again)
    const known = (l) => qc[l.hash] && qc[l.hash].take === l.take && qc[l.hash].text === l.text && qc[l.hash].dur != null;
    const fresh = analyze(got.filter((l) => !known(l)).map((l) => ({ file: path.join(RAW, l.who, l.hash + '.mp3'), text: l.spoken })));
    const heard = got.map((l) => (known(l) ? { ...qc[l.hash], dur: qc[l.hash].dur } : fresh.shift()));
    const again = [], keep = [];
    for (const [k, l] of got.entries()) {
      const a = heard[k], v = verdict(l, a, tempo[l.who]);
      qc[l.hash] = { who: l.who, text: l.text, take: l.take, heard: a.heard, wer: a.wer, f0: a.f0, cps: v.cps, flags: v.flags, verdict: v.verdict, dur: a.dur };
      if (v.verdict === 'retake' && l.take < RETAKES + (direction[l.who]?.[l.text]?.retakeBase || 0) && round < RETAKES) {
        const d = ((direction[l.who] ||= {})[l.text] ||= {});
        d.retake = (d.retake || 0) + 1; d.auto = true;
        again.push(l);
        console.log(`  rejected (${v.flags.join(', ')}; heard "${a.heard}"): ${l.who} "${l.text}" -> retake ${d.retake}`);
        continue;
      }
      if (v.verdict !== 'ok') console.log(`  for review (${v.flags.join(', ') || 'short line'}; heard "${a.heard}"): ${l.who} "${l.text}"`);
      keep.push(l);
    }
    // (what was heard and the retakes are written before the processing: a run that dies there,
    // a full disk say, doesn't lose them)
    writeJson(QCF, qc);
    if (again.length) saveLines();
    for (const l of keep) processTake(l);
    if (again.length) {
      const fresh = await plan();
      todo = again.map((l) => fresh.find((x) => x.who === l.who && x.text === l.text));
    } else todo = [];
  }
  // A line still rejected after its retakes keeps the take the recogniser liked best.
  for (const l of todo) {
    const takes = Object.entries(qc).filter(([, q]) => q.who === l.who && q.text === l.text).sort((a, b) => a[1].wer - b[1].wer);
    const d = direction[l.who][l.text];
    if (takes.length) { d.retake = takes[0][1].take; d.note = `rejected ${RETAKES + 1} times; kept the take with WER ${takes[0][1].wer}`; }
  }
  if (todo.length) {
    saveLines();
    const fresh = await plan();
    for (const l of todo) { const f = fresh.find((x) => x.who === l.who && x.text === l.text); if (f && fs.existsSync(path.join(RAW, f.who, f.hash + '.mp3'))) processTake(f); }
  }
  writeJson(QCF, qc);
  lines = await plan();
  const m = writeManifest(lines);
  console.log(`credits spent this run: ${Math.round(spent)}; manifest: ${Object.keys(m).filter((k) => !k.startsWith('_')).reduce((s, k) => s + Object.keys(m[k]).length, 0)} clips`);
  if (abort) { console.log('ABORTED:', abort); process.exitCode = 1; }
}

async function check() {
  const lines = await plan();
  const scoped = lines.filter((l) => l.inScope && !l.mumble && sayable(l.spoken));
  const missing = scoped.filter((l) => !l.have);
  const man = readJson(MANIFEST, {});
  const unlisted = lines.filter((l) => l.have && !man[l.who]?.[l.text]);
  const orph = orphans(lines);
  console.log(`${lines.length} lines; ${scoped.length} in scope and voiced; ${lines.filter((l) => l.have).length} clips`);
  if (missing.length) { console.log(`MISSING (${missing.length}):`); for (const l of missing) console.log(`  ${l.who} [${l.part}] ${l.id ? '' : '(no voice) '}"${l.text}"`); }
  if (unlisted.length) console.log(`not in the manifest (run: node tools/voice/voice.mjs manifest): ${unlisted.length}`);
  if (orph.length) console.log(`orphans (PRUNE=1 removes them): ${orph.join(', ')}`);
  const review = Object.values(readJson(QCF, {})).filter((q) => q.verdict !== 'ok' && lines.some((l) => l.have && l.who === q.who && l.text === q.text && l.take === q.take));
  if (review.length) console.log(`on the review list: ${review.length} (make voice-review)`);
  if (missing.length || unlisted.length) process.exitCode = 1;
  else console.log('voice-check ok');
}

// Listen again to the takes in use (no requests): qc.json's verdicts after a change to the check.
async function requalify() {
  const qc = readJson(QCF, {}), tempo = readJson(MANIFEST, {})._tempo || {};
  // (--all: every take in use; else only those with no verdict for this very take)
  const lines = (await plan()).filter((l) => l.hash && fs.existsSync(path.join(RAW, l.who, l.hash + '.mp3')) && (flag('--all') || !(qc[l.hash] && qc[l.hash].take === l.take && qc[l.hash].text === l.text)));
  const heard = analyze(lines.map((l) => ({ file: path.join(RAW, l.who, l.hash + '.mp3'), text: l.spoken })));
  for (const [k, l] of lines.entries()) {
    const a = heard[k], v = verdict(l, a, tempo[l.who]);
    qc[l.hash] = { who: l.who, text: l.text, take: l.take, heard: a.heard, wer: a.wer, f0: a.f0, cps: v.cps, flags: v.flags, verdict: v.verdict, dur: a.dur };
  }
  writeJson(QCF, qc);
  const n = (v) => lines.filter((l) => qc[l.hash].verdict === v).length;
  console.log(`listened to ${lines.length} takes: ok ${n('ok')}, review ${n('review')}, rejected ${n('retake')}`);
  for (const l of lines) if (qc[l.hash].verdict !== 'ok') console.log(`  ${qc[l.hash].verdict} (${qc[l.hash].flags.join(', ') || 'short line'}; heard "${qc[l.hash].heard}"): ${l.who} "${l.text}"`);
}

// Listen to the clips in use as the game plays them (assets/voice/: after the shift), per role: the
// pitch, and whether the recogniser still understands the longer lines, against the same takes before
// the processing (qc.json). No requests, nothing written.
async function hear() {
  const only = opt('--who')?.split(','), qc = readJson(QCF, {});
  const lines = (await plan()).filter((l) => l.have && (!only || only.includes(l.who)));
  const got = analyze(lines.map((l) => ({ file: path.join(OUT, l.file), text: l.spoken })));
  const by = {};
  for (const [k, l] of lines.entries()) (by[l.who] ||= []).push({ l, a: got[k] });
  const q = (v, p) => { v = v.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.round(p * (v.length - 1))] : null; };
  const mean = (v) => (v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 1000) / 1000 : null);
  for (const [who, r] of Object.entries(by)) {
    const f0 = r.map(({ a }) => a.f0), long = r.filter(({ l }) => !short(l.spoken)), sh = conf.roles[who]?.shift;
    // (the pitch analysis stops at 600 Hz and a child's shout goes over it: the takes' pitch times the
    // shift is the surer figure)
    const src = q(r.map(({ l }) => qc[l.hash]?.f0), 0.5);
    console.log(`${who.padEnd(14)} ${String(r.length).padStart(3)} clips  pitch ${q(f0, 0.5)} Hz (lines ${q(f0, 0.1)}-${q(f0, 0.9)}${sh && src ? `; the takes ${src} Hz × ${sh.pitch} = ${Math.round(src * sh.pitch)}` : ''})  understood ${long.filter(({ a }) => a.wer <= 0.25).length}/${long.length} longer lines, WER ${mean(long.map(({ a }) => a.wer))} (before the processing ${mean(long.map(({ l }) => qc[l.hash]?.wer).filter((x) => x != null))})${sh ? `  shift pitch ×${sh.pitch} formant ×${sh.formant}` : ''}`);
    for (const { l, a } of long) if (a.wer > 0.25) console.log(`    heard "${a.heard}" for "${l.text}" (WER ${a.wer})`);
  }
}

async function reprocess() {
  const lines = await plan(), only = opt('--who')?.split(',');
  let n = 0;
  for (const l of lines) if (l.hash && (!only || only.includes(l.who)) && fs.existsSync(path.join(RAW, l.who, l.hash + '.mp3'))) { processTake(l); l.have = true; n++; }
  writeManifest(lines);
  console.log(`reprocessed ${n} clips`);
}

// ---------------------------------------------------------------------------------------------
// Casting

// The role's preview text: its previewText, else its own lines (in scope first), 160-270 chars.
async function previewText(who) {
  const role = conf.roles[who];
  if (role.previewText) return role.previewText;
  const own = (await plan()).filter((l) => l.who === who && sayable(l.spoken)).sort((a, b) => b.inScope - a.inScope);
  let t = '';
  for (const l of own) { if (t.length >= 160) break; if (t.length + l.spoken.length < 270) t += (t ? ' ' : '') + l.spoken; }
  return t;
}

async function searchLibrary(who, n) {
  const role = conf.roles[who], L = role.library || {};
  const q = new URLSearchParams({ page_size: '100', language: 'sv' });
  if (L.gender) q.set('gender', L.gender);
  const { r } = await api('/v1/shared-voices?' + q, null, { method: 'GET' });
  const have = new Set((role.candidates || []).map((c) => c.voice_id));
  const ok = (await r.json()).voices.filter((v) => v.language === 'sv' && v.rate === 1 && !have.has(v.voice_id) && (!L.age || L.age.includes(v.age)) && (!L.accent || v.accent === L.accent));
  const add = ok.slice(0, n).map((v) => ({ voice_id: v.voice_id, owner: v.public_owner_id, name: v.name.trim(), lang: v.language, accent: v.accent, age: v.age, gender: v.gender, notice_days: v.notice_period, about: (v.description || '').replace(/\s+/g, ' ').slice(0, 200) }));
  (role.candidates ||= []).push(...add);
  saveConf();
  console.log(`${who}: ${add.length} new Voice Library candidates: ${add.map((c) => c.name).join(', ') || 'none'}`);
}

async function cast(who) {
  const role = conf.roles[who];
  if (!role) throw new Error(`cast.json has no role ${who}`);
  if (opt('--search')) await searchLibrary(who, Number(opt('--search')));
  const text = await previewText(who);
  if (text.length < 20) throw new Error(`${who}: no preview text (set previewText in cast.json)`);
  const dir = path.join(CASTDIR, who), idx = path.join(dir, 'index.json');
  fs.mkdirSync(dir, { recursive: true });
  const list = readJson(idx, []);
  let spent = 0;
  // (a voice already auditioned for another role, a pool's free Voice Library preview say, is copied
  // from there rather than asked for again; a shifted role's audition is the voice as it will sound,
  // raised from the adult one, `adult`, again whenever the role's shift changes)
  const elsewhere = (id) => {
    for (const d of fs.readdirSync(CASTDIR)) {
      const x = d !== who && readJson(path.join(CASTDIR, d, 'index.json'), []).find((y) => y.id === id);
      if (x && fs.existsSync(path.join(ROOT, x.adult || x.file))) return { ...x, from: d };
    }
    return null;
  };
  for (const c of role.candidates || []) {
    const file = path.join(dir, c.voice_id + '.mp3'), plain = role.shift ? path.join(dir, c.voice_id + '.adult.mp3') : file;
    let entry = list.find((x) => x.id === c.voice_id);
    if (!fs.existsSync(plain)) {
      const src = elsewhere(c.voice_id);
      if (src) {
        fs.copyFileSync(path.join(ROOT, src.adult || src.file), plain);
        console.log(`${who}: ${c.name}: the audition made for ${src.from} (no request)`);
        if (!entry) list.push(entry = { id: c.voice_id, kind: src.kind, name: c.name, accent: c.accent, age: c.age, lang: c.lang, file: rel(file), text: src.text });
      } else {
        const { r, cost } = await api(`/v1/text-to-speech/${c.voice_id}?output_format=mp3_44100_128`, { text, model_id: conf.model, language_code: conf.language, voice_settings: conf.settings, seed: 1 }, { accept: 'audio/mpeg' });
        fs.writeFileSync(plain, Buffer.from(await r.arrayBuffer()));
        spent += cost ?? 0;
        console.log(`${who}: ${c.name} said ${text.length} chars (cost ${cost ?? '?'})`);
      }
    }
    if (!entry) list.push(entry = { id: c.voice_id, kind: 'library', name: c.name, accent: c.accent, age: c.age, lang: c.lang, file: rel(file), text });
    if (role.shift && (JSON.stringify(entry.shift) !== JSON.stringify(role.shift) || !fs.existsSync(file))) {
      const a = path.join(dir, c.voice_id + '.adult.wav'), b = path.join(dir, c.voice_id + '.child.wav');
      execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', plain, '-ac', '1', '-ar', String(SR), a]);
      shiftWav(a, b, role.shift);
      execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', b, '-c:a', 'libmp3lame', '-b:a', '128k', file]);
      fs.rmSync(a); fs.rmSync(b);
      Object.assign(entry, { adult: rel(plain), shift: role.shift, wer: null });
    }
  }
  if (flag('--design')) {
    if (text.length < 100) throw new Error(`Voice Design needs 100+ chars of preview text (${who}: ${text.length})`);
    for (let k = 0; k < Number(opt('--rounds', 2)); k++) {
      const { r } = await api('/v1/text-to-voice/design?output_format=mp3_44100_128', { voice_description: role.design, model_id: conf.designModel, text, ...(role.guidance ? { guidance_scale: role.guidance } : {}) });
      const j = await r.json();
      for (const p of j.previews) {
        const file = path.join(dir, `design-${p.generated_voice_id}.mp3`);
        fs.writeFileSync(file, Buffer.from(p.audio_base_64, 'base64'));
        list.push({ id: 'design:' + p.generated_voice_id, kind: 'design', name: `Voice Design ${p.generated_voice_id.slice(0, 6)}`, file: rel(file), text: j.text });
      }
      console.log(`${who}: Voice Design round ${k + 1}: ${j.previews.length} previews (cost not reported)`);
    }
  }
  // Measure what isn't measured yet: what the recogniser heard, the pitch, the pace.
  const todo = list.filter((x) => x.wer == null);
  const res = analyze(todo.map((x) => ({ file: path.join(ROOT, x.file), text: x.text })));
  for (const [k, x] of todo.entries()) { const a = res[k]; Object.assign(x, { heard: a.heard, wer: a.wer, f0: a.f0, f0lo: a.f0lo, f0hi: a.f0hi, dur: a.dur, cps: Math.round(x.text.length / a.dur * 10) / 10 }); }
  writeJson(idx, list);
  console.log(`${who}: ${list.length} candidates (credits spent ${spent}):`);
  for (const x of list) console.log(`  ${(x.id === role.voice_id ? '*' : ' ')} ${x.name.slice(0, 34).padEnd(34)} ${String(x.f0).padStart(6)} Hz (${x.f0lo}-${x.f0hi})  ${String(x.cps).padStart(5)} chars/s  WER ${x.wer}`);
}

async function choose(who, id) {
  const role = conf.roles[who];
  if (!role) throw new Error(`cast.json has no role ${who}`);
  if (id === 'none') Object.assign(role, { voice_id: null, name: null, source: null });
  else if (id.startsWith('design:')) {
    const { r } = await api('/v1/text-to-voice', { voice_name: `Saab & Run: ${who}`, voice_description: role.design, generated_voice_id: id.slice(7) });
    const j = await r.json();
    Object.assign(role, { voice_id: j.voice_id, name: `Saab & Run: ${who}`, source: 'design', preview: id.slice(7) });
  } else {
    const c = (role.candidates || []).find((x) => x.voice_id === id);
    Object.assign(role, { voice_id: id, name: c?.name || id, source: 'library' });
  }
  saveConf();
  console.log(`${who} -> ${role.voice_id} (${role.name}). Its clips are now missing: make voice DRY=1, then make voice.`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    if (cmd === 'check') await check();
    else if (cmd === 'reprocess') await reprocess();
    else if (cmd === 'qc') await requalify();
    else if (cmd === 'hear') await hear();
    else if (cmd === 'manifest') { writeManifest(await plan()); console.log('manifest rewritten'); }
    else if (cmd === 'cast') await cast(args[1]);
    else if (cmd === 'choose') await choose(args[1], args[2]);
    else if (cmd === 'gen') await generate();
    else throw new Error('unknown command ' + cmd);
  } catch (e) { console.log(e instanceof ApiError ? 'ABORTED: ' + e.message : e.stack); process.exitCode = 1; }
}
