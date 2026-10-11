// Look-dev helper: renders the game from scripted camera poses (no gameplay), headless.
//   PORT=8801 node tools/look.mjs <name> '<json list of shots>' [query]
//   shot: { at: [x,y,z], look: [x,y,z], fov, name, lm, eval }  (lm: landmark name -> stand there)
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const PORT = +(process.env.PORT || 8799);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--mute-audio', `--window-size=${W},${H}`] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[t]')) console.log(`[${m.type()}]`, m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shots = JSON.parse(process.argv[3] || '[]');
const query = process.argv[4] || '';
await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1${query}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
const frames = async (n) => { const f0 = await page.evaluate(() => window.__frame); await page.waitForFunction(`window.__frame >= ${f0 + n}`, { timeout: 60000, polling: 50 }); };
await frames(20);
for (const s of shots) {
  if (s.eval) console.log('[t] eval', JSON.stringify(await page.evaluate(s.eval)));
  if (s.at || s.lm) {
    await page.evaluate((s) => {
      const g = window.__game;
      g.cam.update = function () {}; // freeze the rig: we place the camera ourselves
      const cam = g.cam.cam;
      let at = s.at, look = s.look;
      if (s.lm) { const m = window.__lm(s.lm); const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw); at = [m.x + fx * (s.d ?? 8), s.h ?? 1.7, m.z + fz * (s.d ?? 8)]; look = [m.x, s.lh ?? 1.5, m.z]; }
      cam.position.set(...at); cam.lookAt(...look); cam.fov = s.fov || 55; cam.updateProjectionMatrix();
      g.hideHud = true; document.getElementById('hud').style.display = 'none';
    }, s);
  }
  await frames(s.frames || 12);
  const f = path.join(OUT, `look_${process.argv[2]}_${s.name || 'x'}.png`);
  await page.screenshot({ path: f });
  console.log('saved', f);
}
if (process.env.STATS) console.log('[t] stats', JSON.stringify(await page.evaluate(() => window.__stats())));
await browser.close();
server.close();
