// Gait look-dev: films Ove (a real Character on tools/gait.html, fixed 60 Hz steps) walking, running
// and jumping, and writes a contact sheet per take (+ an mp4 with VIDEO=1).
//   PORT=8811 node tools/gait.mjs [take ...]       takes: walk run walkback runback jump runjump clip
//   WALK=3.2 RUN=5.5 JUMP=5.4 override the speeds (default: the game's), OUT=dir redirects.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'out'));
const W = +(process.env.W || 640), Hh = +(process.env.H || 720);
const PORT = +(process.env.PORT || 8811);
// the game's on-foot speeds (main.js)
const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const num = (k, d) => +(process.env[k] || (src.match(new RegExp(`\\b${k} = ([\\d.]+)`)) || [])[1] || d);
const WALK = num('WALK', 3.2), RUN = num('BRISK', 5.5), JUMP_V = num('JUMP_V', 5.4);
const VIDEO = !!process.env.VIDEO;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', `--window-size=${W},${Hh}`] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: Hh, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[t]')) { console.log(`[${m.type()}]`, m.text().slice(0, 400)); if (m.type() === 'error') errors.push(m.text()); } });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); errors.push(e.message); });
await page.goto(`http://127.0.0.1:${PORT}/tools/gait.html?test=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });

const ev = (f, ...a) => page.evaluate(f, ...a);
// A take: a list of segments [steps, speed, opts]; every `every` steps (inside segments with cap) a frame.
async function take(name, segs, { cam = 'side', camOpts = {}, every = 3, tile = 6, video = VIDEO } = {}) {
  const dir = path.join(OUT, 'gait', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await ev(() => __reset());
  let n = 0, k = 0, warm = false;
  const trace = [];
  for (const [steps, speed, o = {}] of segs) {
    if (!o.cap) { const s = await ev((a, b, c) => __step(a, b, c), steps, speed, { v: JUMP_V, ...o }); trace.push(s); continue; }
    for (let i = 0; i < steps; i += o.every || every) {
      const s = await ev((a, b, c) => __step(a, b, c), Math.min(o.every || every, steps - i), speed, i === 0 ? { v: JUMP_V, ...o } : { ...o, jump: false });
      trace.push(s);
      await ev((c, co) => __cam(c, co), cam, camOpts);
      if (!warm) { warm = true; await ev(() => __warm(40)); await ev((c, co) => __cam(c, co), cam, camOpts); }
      await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(3, '0')}.png`) });
      k++;
    }
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(dir, f));
  const sheet = path.join(OUT, `gait_${name}.png`);
  if (!video || files.length <= 36) {
    execFileSync('montage', [...files.slice(0, 36), '-tile', `${tile}x`, '-geometry', `${Math.round(W / 2.5)}x${Math.round(Hh / 2.5)}+2+2`, '-background', '#222', sheet]);
    console.log('saved', path.relative(ROOT, sheet), `(${files.length} frames)`);
  }
  if (video) {
    const fps = Math.round(60 / (segs.find((s) => s[2]?.cap)?.[2]?.every || every));
    const mp4 = path.join(OUT, `gait_${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4]);
    console.log('saved', path.relative(ROOT, mp4));
  }
  return trace;
}

const TAKES = {
  // one and a bit walk cycles from the side, after 3 s of walking
  walk: () => take('walk', [[180, WALK], [72, WALK, { cap: true }]], { every: 3 }),
  run: () => take('run', [[180, RUN, { brisk: true }], [48, RUN, { brisk: true, cap: true }]], { every: 2 }),
  walkback: () => take('walkback', [[180, WALK], [72, WALK, { cap: true }]], { cam: 'back', every: 3 }),
  runback: () => take('runback', [[180, RUN, { brisk: true }], [48, RUN, { brisk: true, cap: true }]], { cam: 'back', every: 2 }),
  walkfront: () => take('walkfront', [[180, WALK], [72, WALK, { cap: true }]], { cam: 'front', camOpts: { d: 4 }, every: 3 }),
  // a standing jump: press, wind-up, flight, landing, recovery
  jump: async () => {
    const tr = await take('jump', [[40, 0], [108, 0, { jump: true, cap: true }]], { every: 3 });
    const y0 = tr[0].y; let top = 0, air = 0;
    for (const s of tr) { top = Math.max(top, s.y - y0); }
    console.log('[t] jump', JSON.stringify({ apex: +top.toFixed(2), log: await ev(() => __log()) }));
    return tr;
  },
  runjump: () => take('runjump', [[150, RUN, { brisk: true }], [90, RUN, { brisk: true, jump: true, cap: true }]], { every: 3, camOpts: { d: 4.5 } }),
  walkjump: () => take('walkjump', [[150, WALK], [90, WALK, { jump: true, cap: true }]], { every: 3, camOpts: { d: 4.2 } }),
  // a minute of everything at 60 fps for the eye: start, walk, speed up, run, slow down, stop, jump
  clip: () => take('clip', [[20, 0, { cap: true, every: 1 }], [150, WALK, { cap: true, every: 1 }], [150, RUN, { brisk: true, cap: true, every: 1 }], [80, WALK, { cap: true, every: 1 }], [60, 0, { cap: true, every: 1 }], [110, 0, { jump: true, cap: true, every: 1 }], [80, WALK, { cap: true, every: 1 }], [80, WALK, { jump: true, cap: true, every: 1 }], [60, 0, { cap: true, every: 1 }]], { every: 1, cam: process.env.CAM || 'side', camOpts: { d: 4.4 }, video: true }),
};

// the jump's sounds: out/gait_sounds.wav (+ a spectrogram png) and their levels against ouch / talk
TAKES.sound = async () => {
  const r = await ev(() => __sounds());
  const pcm = Buffer.from(r.b64, 'base64'), hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(44100, 24); hdr.writeUInt32LE(88200, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  const wav = path.join(OUT, 'gait_sounds.wav');
  fs.writeFileSync(wav, Buffer.concat([hdr, pcm]));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-lavfi', 'showspectrumpic=s=1600x600:legend=1:fscale=lin:stop=4000', path.join(OUT, 'gait_sounds.png')]);
  console.log('[t] sounds [at, peak, rms] (grunt, oof, grunt, oof, ouch, talk x3)', JSON.stringify(r.stats));
  console.log('saved', path.relative(ROOT, wav));
  return [];
};
// numbers only: Ove at a range of speeds (gait.html __metrics)
TAKES.metrics = async () => {
  for (const [v, brisk] of [[1.4, false], [2.2, false], [WALK, false], [4.3, true], [RUN, true]]) console.log('[t] metrics', JSON.stringify(await ev((v, b) => __metrics(v, { brisk: b }), v, brisk)));
  return [];
};

// eval <file.js>: run a script in the page and print what it returns (one line per array item)
if (process.argv[2] === 'eval') {
  const r = await ev(fs.readFileSync(process.argv[3], 'utf8'));
  console.log(Array.isArray(r) ? r.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') : JSON.stringify(r));
  process.argv.length = 2; process.argv.push('none');
}
const list = process.argv.slice(2).length ? process.argv.slice(2) : ['walk', 'run', 'jump'];
for (const t of list) {
  if (t === 'none') continue;
  if (!TAKES[t]) { console.log('no take', t); continue; }
  const tr = await TAKES[t]();
  const cap = tr.slice(-3);
  console.log('[t]', t, JSON.stringify(cap));
}
console.log(errors.length ? `${errors.length} errors` : 'no errors');
await browser.close();
server.close();
