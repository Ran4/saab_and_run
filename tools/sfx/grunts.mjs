// Ove's jump grunts (feature fixa_hoppet): a 59-year-old's effort as he pushes off the ground, in
// Ove's own ElevenLabs voice, made once and checked in as assets/sfx/ove_hopp_<n>.mp3 (and his
// landing as ove_land_<n>.mp3). The game never calls the API: audio.js plays them in turn
// (1, 2, 3, 4, 1, ...). Kept apart from tools/voice/ (those are lines in the script; these are not).
//
//   node tools/sfx/grunts.mjs tts <name> "<text>" [--seed n] [--stab s] [--voice id]   a take in Ove's voice (TTS, audio tags)
//   node tools/sfx/grunts.mjs sfx <name> "<prompt>" [--dur s] [--infl p]              a Sound Effects take
//   node tools/sfx/grunts.mjs sts <name> <take> [--seed n] [--stab s]                  a take re-voiced as Ove (Voice Changer)
//   node tools/sfx/grunts.mjs batch <file.json>      [[kind, name, text | take, { seed, stab, dur, infl }], ...]
//   node tools/sfx/grunts.mjs ledger                 every request and what it cost
//   node tools/sfx/grunts.mjs make <set> <lufs> <take[@from-to]> ...
//        the chosen takes (or the part of one from..to s: tools/sfx/grunts.py --bursts finds them),
//        processed, as assets/sfx/<set>_<n>.mp3, each to <lufs> (looped: they are short)
//
// Raw takes: .cache/sfx/<name>.mp3 (+ .json: the request). tools/sfx/ledger.json: every request with
// its cost (the `character-cost` header; a guess when there is none). A request that would take the
// ledger past CAP credits is refused. The API key is read from .env (ELEVENLABS_API_KEY) and only ever
// goes into a request header.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache/sfx'), LEDGER = path.join(ROOT, 'tools/sfx/ledger.json');
const OUT = path.join(ROOT, 'assets/sfx');
const API = 'https://api.elevenlabs.io';
const CAP = 480;                                         // credits, all requests together
const OVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/voice/cast.json'), 'utf8'));
const VOICE = OVE.roles.ove.voice_id, MODEL = OVE.model;
const SR = 44100, KBPS = 64, TP = -1.5;

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const ledger = readJson(LEDGER, []);
const spent = () => ledger.reduce((s, e) => s + (e.cost ?? e.guess ?? 0), 0);

function apiKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error('.env has no ELEVENLABS_API_KEY');
  return m[1];
}
async function request(p, body, guess, entry) {
  if (spent() + guess > CAP) throw new Error(`refused: ${spent().toFixed(1)} spent + ~${guess} would pass the cap of ${CAP}`);
  const json = !(body instanceof FormData);
  const r = await fetch(API + p, { method: 'POST', body: json ? JSON.stringify(body) : body, headers: { 'xi-api-key': apiKey(), Accept: 'audio/mpeg', ...(json ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) {
    let msg = await r.text();
    try { const d = JSON.parse(msg).detail; msg = typeof d === 'string' ? d : [d?.status, d?.message].filter(Boolean).join(': ') || JSON.stringify(d); } catch {}
    throw new Error(`HTTP ${r.status} ${p.split('?')[0]}: ${String(msg).slice(0, 300)}`);
  }
  const c = r.headers.get('character-cost');
  const buf = Buffer.from(await r.arrayBuffer());
  const e = { ...entry, at: new Date().toISOString(), cost: c == null ? null : Number(c), guess: c == null ? guess : undefined, bytes: buf.length };
  ledger.push(e);
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
  return { buf, e };
}
const rawOf = (name) => path.join(CACHE, name + '.mp3');
function save(name, buf, meta) {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(rawOf(name), buf);
  fs.writeFileSync(path.join(CACHE, name + '.json'), JSON.stringify(meta, null, 1) + '\n');
}

// A take in Ove's voice: the TTS model reads audio tags ("[grunts]") as direction, not words.
async function tts(name, text, o = {}) {
  if (fs.existsSync(rawOf(name))) return console.log(name, 'already here');
  const body = { text, model_id: MODEL, language_code: OVE.language, voice_settings: { ...OVE.settings, ...(o.stab != null ? { stability: +o.stab } : {}) }, seed: +(o.seed ?? 1) };
  const { buf, e } = await request(`/v1/text-to-speech/${o.voice || VOICE}?output_format=mp3_44100_128`, body, Math.ceil(text.length * 0.3), { kind: 'tts', name, text, seed: body.seed, stab: body.voice_settings.stability });
  save(name, buf, { kind: 'tts', text, ...body });
  console.log(name, 'tts', JSON.stringify(text), 'cost', e.cost ?? `~${e.guess}`, '| total', spent().toFixed(1));
}
// A Sound Effects take: a stranger's voice, but made as a sound rather than read as a line.
async function sfx(name, text, o = {}) {
  if (fs.existsSync(rawOf(name))) return console.log(name, 'already here');
  const dur = o.dur != null ? +o.dur : null;
  const body = { text, ...(dur ? { duration_seconds: dur } : {}), prompt_influence: +(o.infl ?? 0.5) };
  const { buf, e } = await request('/v1/sound-generation?output_format=mp3_44100_128', body, dur ? Math.ceil(dur * 40) : 100, { kind: 'sfx', name, text, dur, infl: body.prompt_influence });
  save(name, buf, { kind: 'sfx', ...body });
  console.log(name, 'sfx', JSON.stringify(text), 'cost', e.cost ?? `~${e.guess}`, '| total', spent().toFixed(1));
}
// A take (any) re-voiced as Ove: the performance stays, the voice becomes his.
async function sts(name, from, o = {}) {
  if (fs.existsSync(rawOf(name))) return console.log(name, 'already here');
  const src = rawOf(from), secs = durOf(src);
  const fd = new FormData();
  fd.append('audio', new Blob([fs.readFileSync(src)], { type: 'audio/mpeg' }), from + '.mp3');
  fd.append('model_id', 'eleven_multilingual_sts_v2');
  fd.append('voice_settings', JSON.stringify({ ...OVE.settings, ...(o.stab != null ? { stability: +o.stab } : {}) }));
  fd.append('seed', String(+(o.seed ?? 1)));
  const { buf, e } = await request(`/v1/speech-to-speech/${o.voice || VOICE}?output_format=mp3_44100_128`, fd, Math.ceil(secs * 20) + 5, { kind: 'sts', name, from, secs: +secs.toFixed(2) });
  save(name, buf, { kind: 'sts', from, seed: +(o.seed ?? 1) });
  console.log(name, 'sts from', from, `(${secs.toFixed(2)} s)`, 'cost', e.cost ?? `~${e.guess}`, '| total', spent().toFixed(1));
}
function durOf(f) { return +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); }

// ---------------------------------------------------------------------------------------------
// Processing a chosen take (or a part of it): trimmed to the sound (40 dB under its loudest 10 ms,
// 15 ms kept before and 60 ms after), a 5 ms fade in and 40 ms out, every take of a set to the same
// loudness, mono mp3.

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
function bounds(pcm) {
  const hop = SR / 100, f = [];
  for (let i = 0; i < pcm.length; i += hop) { let s = 0; for (let k = i; k < Math.min(pcm.length, i + hop); k++) s += pcm[k] * pcm[k]; f.push(Math.sqrt(s / hop)); }
  const peak = Math.max(...f.map(db)), thr = Math.max(peak - 40, -60);
  const a = f.findIndex((v) => db(v) > thr), b = f.length - 1 - [...f].reverse().findIndex((v) => db(v) > thr);
  return [Math.max(0, a / 100 - 0.015), Math.min(pcm.length / SR, (b + 1) / 100 + 0.06)];
}
function writeWav(file, pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
// Integrated loudness; a clip this short can't be measured on its own, so it is looped.
function lufsOf(wav) {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-stream_loop', '6', '-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return Number(JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)).input_i);
}
function make(set, lufs, takes) {
  fs.mkdirSync(OUT, { recursive: true });
  const out = [];
  takes.forEach((spec, i) => {
    const [name, span] = spec.split('@'), [t0, t1] = span ? span.split('-').map(Number) : [0, 1e9];
    const all = decode(rawOf(name)), pcm = all.subarray(Math.floor(t0 * SR), Math.min(all.length, Math.floor(t1 * SR)));
    const [a, b] = bounds(pcm);
    const seg = Float32Array.from(pcm.subarray(Math.floor(a * SR), Math.floor(b * SR)));
    const fi = Math.floor(SR * 0.005), fo = Math.floor(SR * 0.04);
    for (let k = 0; k < fi; k++) seg[k] *= k / fi;
    for (let k = 0; k < fo; k++) seg[seg.length - 1 - k] *= k / fo;
    const tmp = path.join(CACHE, `tmp-${process.pid}-${i}.wav`);
    writeWav(tmp, seg);
    const l = lufsOf(tmp), gain = lufs - l, file = path.join(OUT, `${set}_${i + 1}.mp3`);
    execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', tmp, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${(10 ** (TP / 20)).toFixed(3)}:level=0`,
      '-ar', String(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, file]);
    fs.rmSync(tmp);
    out.push({ f: path.relative(ROOT, file), take: spec, d: +(seg.length / SR).toFixed(3), lufs: +l.toFixed(1), gain: +gain.toFixed(1) });
  });
  for (const o of out) console.log(JSON.stringify(o));
}

const [cmd, a1, a2] = args;
const o = { seed: opt('--seed'), stab: opt('--stab'), dur: opt('--dur'), infl: opt('--infl'), voice: opt('--voice') };
if (cmd === 'tts') await tts(a1, a2, o);
else if (cmd === 'sfx') await sfx(a1, a2, o);
else if (cmd === 'sts') await sts(a1, a2, o);
else if (cmd === 'batch') {
  for (const [kind, name, text, oo = {}] of JSON.parse(fs.readFileSync(a1, 'utf8'))) await { tts, sfx, sts }[kind](name, text, oo);
} else if (cmd === 'ledger') {
  for (const e of ledger) console.log(e.kind.padEnd(4), e.name.padEnd(16), String(e.cost ?? `~${e.guess}`).padStart(6), e.text ?? e.from ?? '');
  console.log('total', spent().toFixed(1), 'of', CAP);
} else if (cmd === 'make') make(a1, +a2, args.slice(3));
else console.log('usage: see the top of tools/sfx/grunts.mjs');
