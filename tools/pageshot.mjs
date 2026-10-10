// Headless screenshots of a standalone test page (e.g. tools/cars.html, tools/people.html):
// serves the game folder, opens the page in headless Chrome on the real GPU (no window) and
// saves one PNG per view to out/.
//   PORT=88xx node tools/pageshot.mjs <page> [prefix]
// The page sets window.__ready = true when loaded, and may expose window.__views (an array of
// view names) plus window.__setView(name) (sync or async). With views, every view is saved as
// out/<prefix>_<view>.png; without, a single out/<prefix>.png. W/H env vars set the size.
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
const page_ = process.argv[2];
if (!page_) { console.log('usage: node tools/pageshot.mjs <page.html> [prefix]'); process.exit(1); }
const prefix = process.argv[3] || path.basename(page_, '.html');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.ktx2': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[t]')) { console.log(`[${m.type()}]`, m.text().slice(0, 500)); if (m.type() === 'error') errors.push(m.text()); } });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); errors.push(e.message); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Let a few frames render after each change so shadows, AO and env maps settle.
const settle = () => page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 8 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));

await page.goto(`http://127.0.0.1:${PORT}/${page_}${process.env.QUERY || ''}`, { waitUntil: 'load' });
try { await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 }); }
catch (e) { console.log('page never set window.__ready'); }
await settle();
const views = await page.evaluate(() => window.__views || null);
if (views && views.length) {
  for (const v of views) {
    await page.evaluate((v) => window.__setView(v), v);
    await settle();
    await sleep(100);
    const file = path.join(OUT, `${prefix}_${v}.png`);
    await page.screenshot({ path: file });
    console.log('saved', path.relative(ROOT, file));
  }
} else {
  await sleep(300);
  const file = path.join(OUT, `${prefix}.png`);
  await page.screenshot({ path: file });
  console.log('saved', path.relative(ROOT, file));
}
console.log(errors.length ? `${errors.length} errors` : 'no errors');
await browser.close();
server.close();
