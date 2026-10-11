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
//   node tools/voice/voice.mjs reprocess     redo trimming, loudness, lip curves from .cache (free)
//   node tools/voice/voice.mjs qc            listen again to the takes in use (free): qc.json
//   node tools/voice/voice.mjs manifest      just rewrite assets/voice/index.json
//   node tools/voice/voice.mjs cast <who> [--search n] [--design] [--rounds n]
//        auditions: each Voice Library candidate in cast.json says the role's preview text (and
//        --design: Voice Design candidates); measured, for the review page (make voice-review)
//   node tools/voice/voice.mjs choose <who> <voice_id | design:<generated_voice_id> | none>
//
// The files: tools/voice/cast.json (the roles: voice, settings, candidates, scope), lines.json
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
  for (let tries = 0; ; tries++) {
    try {
      r = await fetch(API + p, { method, body: body && JSON.stringify(body), headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: accept } });
      break;
    } catch (e) { if (tries) throw e; await new Promise((ok) => setTimeout(ok, 3000)); }   // a network blip: once more
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
export async function plan() {
  const { allLines } = await import(pathToFileURL(path.join(ROOT, 'src/game/script.js')).href + '?t=' + Date.now());
  return allLines().map(([who, text, part]) => {
    const role = conf.roles[who] || null, d = direction[who]?.[text] || {};
    const spoken = alias(d.tts || text), id = role?.voice_id || null, take = d.retake || 0;
    const inScope = !conf.scope || conf.scope.who.includes(who) || conf.scope.parts.includes(part);
    const hash = d.locked && d.hash ? d.hash : id && sayable(spoken) ? sha([who, spoken, id, conf.model, JSON.stringify(settingsOf(who)), ...(take ? [take] : [])].join('\0')).slice(0, 12) : null;
    const file = hash && `${who}/${hash}.mp3`;
    return { who, text, part, spoken, id, take, hash, file, inScope, mumble: !!role?.mumble, have: !!file && fs.existsSync(path.join(OUT, file)), flags: humanFlags(text, spoken) };
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

const lufsTarget = (l) => direction[l.who]?.[l.text]?.lufs ?? conf.roles[l.who]?.lufs ?? conf.lufs ?? -20;
function processTake(l) {
  const raw = path.join(RAW, l.who, l.hash + '.mp3'), al = readJson(path.join(RAW, l.who, l.hash + '.json'), {}).alignment;
  const pcm = decode(raw);
  const [a, b] = speechBounds(pcm);
  const seg = pcm.subarray(Math.floor(a * SR), Math.floor(b * SR));
  const tmp = path.join(CACHE, `tmp-${process.pid}-${l.hash}.wav`);
  fs.mkdirSync(CACHE, { recursive: true });
  writeWav(tmp, seg);
  const i = lufsOf(tmp), gainDb = i == null ? 0 : lufsTarget(l) - i;
  const out = path.join(OUT, l.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', tmp, '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${(10 ** (TP / 20)).toFixed(3)}:level=0`,
    '-ar', String(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, out]);
  fs.rmSync(tmp);
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
  console.log(`in scope (${all ? 'everything: --all' : `who ${conf.scope.who.join(',')} or part ${conf.scope.parts.join(',')}`}):`);
  table(scoped, false);
  console.log('outside the scope (mumbled until the scope grows):');
  table(outside, false);
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
    const heard = analyze(got.map((l) => ({ file: path.join(RAW, l.who, l.hash + '.mp3'), text: l.spoken })));
    const again = [];
    for (const [k, l] of got.entries()) {
      const a = heard[k], v = verdict(l, a, tempo[l.who]);
      qc[l.hash] = { who: l.who, text: l.text, take: l.take, heard: a.heard, wer: a.wer, f0: a.f0, cps: v.cps, flags: v.flags, verdict: v.verdict };
      if (v.verdict === 'retake' && l.take < RETAKES + (direction[l.who]?.[l.text]?.retakeBase || 0) && round < RETAKES) {
        const d = ((direction[l.who] ||= {})[l.text] ||= {});
        d.retake = (d.retake || 0) + 1; d.auto = true;
        again.push(l);
        console.log(`  rejected (${v.flags.join(', ')}; heard "${a.heard}"): ${l.who} "${l.text}" -> retake ${d.retake}`);
        continue;
      }
      if (v.verdict !== 'ok') console.log(`  for review (${v.flags.join(', ') || 'short line'}; heard "${a.heard}"): ${l.who} "${l.text}"`);
      processTake(l);
    }
    if (again.length) {
      saveLines();
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
  const lines = (await plan()).filter((l) => l.hash && fs.existsSync(path.join(RAW, l.who, l.hash + '.mp3')));
  const qc = readJson(QCF, {}), tempo = readJson(MANIFEST, {})._tempo || {};
  const heard = analyze(lines.map((l) => ({ file: path.join(RAW, l.who, l.hash + '.mp3'), text: l.spoken })));
  for (const [k, l] of lines.entries()) {
    const a = heard[k], v = verdict(l, a, tempo[l.who]);
    qc[l.hash] = { who: l.who, text: l.text, take: l.take, heard: a.heard, wer: a.wer, f0: a.f0, cps: v.cps, flags: v.flags, verdict: v.verdict };
  }
  writeJson(QCF, qc);
  const n = (v) => lines.filter((l) => qc[l.hash].verdict === v).length;
  console.log(`listened to ${lines.length} takes: ok ${n('ok')}, review ${n('review')}, rejected ${n('retake')}`);
  for (const l of lines) if (qc[l.hash].verdict !== 'ok') console.log(`  ${qc[l.hash].verdict} (${qc[l.hash].flags.join(', ') || 'short line'}; heard "${qc[l.hash].heard}"): ${l.who} "${l.text}"`);
}

async function reprocess() {
  const lines = await plan();
  let n = 0;
  for (const l of lines) if (l.hash && fs.existsSync(path.join(RAW, l.who, l.hash + '.mp3'))) { processTake(l); l.have = true; n++; }
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
  for (const c of role.candidates || []) {
    const file = path.join(dir, c.voice_id + '.mp3');
    if (!fs.existsSync(file)) {
      const { r, cost } = await api(`/v1/text-to-speech/${c.voice_id}?output_format=mp3_44100_128`, { text, model_id: conf.model, language_code: conf.language, voice_settings: conf.settings, seed: 1 }, { accept: 'audio/mpeg' });
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      spent += cost ?? 0;
      console.log(`${who}: ${c.name} said ${text.length} chars (cost ${cost ?? '?'})`);
    }
    if (!list.some((x) => x.id === c.voice_id)) list.push({ id: c.voice_id, kind: 'library', name: c.name, accent: c.accent, age: c.age, lang: c.lang, file: rel(file), text });
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
    else if (cmd === 'manifest') { writeManifest(await plan()); console.log('manifest rewritten'); }
    else if (cmd === 'cast') await cast(args[1]);
    else if (cmd === 'choose') await choose(args[1], args[2]);
    else if (cmd === 'gen') await generate();
    else throw new Error('unknown command ' + cmd);
  } catch (e) { console.log(e instanceof ApiError ? 'ABORTED: ' + e.message : e.stack); process.exitCode = 1; }
}
