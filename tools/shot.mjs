// Headless driver: serves the game, loads it in headless Chrome (real GPU via ANGLE, no window),
// runs a scenario and saves screenshots to out/.
//   PORT=88xx node tools/shot.mjs <scenario> [more scenarios...]   (see SCENARIOS below and
//   tools/scenarios/*.mjs: gameplay.mjs has report, pursuit, interrupt, collect, errands; story.mjs
//   has story (all seven days, must end '#7 idle' and 'no errors') and m1..m7)
// Env: OUT=dir (screenshots), W/H (viewport), QUERY='&x=1' (extra URL params), FROM=n (story).
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const PORT = +(process.env.PORT || 8791);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(p, 'index.html');
    if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(idx)); }
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--mute-audio', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[t]')) { console.log(`[${m.type()}]`, t.slice(0, 500)); if (m.type() === 'error') errors.push(t); }
});
page.on('pageerror', (e) => { console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); errors.push(e.message); });

async function fresh(query = '') {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1${process.env.QUERY || ''}${query}`, { waitUntil: 'load' });
  try { await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 }); }
  catch (e) { console.log('never became ready:', await page.evaluate(() => document.getElementById('loading')?.textContent)); }
  console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = async (n) => { const f0 = await page.evaluate(() => window.__frame); await page.waitForFunction(`window.__frame >= ${f0 + n}`, { timeout: 60000, polling: 50 }); };
const shot = async (name) => { await frames(3); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('saved', name); };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); };
const tap = async (k) => { await page.keyboard.down(k); await frames(2); await page.keyboard.up(k); await frames(1); };
const until = (fn, timeout = 90000, arg) => page.waitForFunction(fn, { timeout, polling: 100 }, arg);
const warp = (x, z, yaw = 0) => ev((x, z, yaw) => __game.debugWarp(x, z, yaw), x, z, yaw);
const L = (n) => ev((n) => window.__lm(n), n);
const fps = async () => { const a = await ev(() => window.__frame); await sleep(2000); const b = await ev(() => window.__frame); return ((b - a) / 2).toFixed(0); };
// Stand on foot at a free spot next to (x, z), facing it, the camera behind.
const standBy = (x, z, rMin = 1.2, rMax = 2.2) => ev(({ x, z, rMin, rMax }) => {
  const g = __game;
  if (g.playerCar) g.exitCar(true);
  const s = g.freeSpot(x, z, rMin, rMax);
  const yaw = Math.atan2(x - s.x, z - s.z);
  g.player.teleport(s.x, s.z, yaw);
  g.cam.yaw = yaw; g.cam.snapNext = true;
  return s;
}, { x, z, rMin, rMax });

const LANDMARKS = ['oveStart', 'oveHouse', 'parvanehHouse', 'runeHouse', 'jimmyHouse', 'andersHouse', 'oveGarage', 'saabSpot', 'parvanehDrive', 'garbageRoom', 'bikeShed', 'parking', 'guestParking', 'adrianSpot', 'busStop', 'hospital', 'hospitalSpot', 'preschool', 'centrum', 'dealer', 'kommun', 'gas', 'park', 'field', 'church', 'cemetery', 'sonjaGrave'];

const SCENARIOS = {
  async start() {
    await frames(30);
    console.log('fps ~', await fps());
    console.log('[t] stats', JSON.stringify(await ev(() => window.__stats())));
    console.log('[t] state', JSON.stringify(await ev(() => { const g = __game, P = g.patrol; return { clock: g.clockText(), ordning: +P.ordning.toFixed(1), open: P.open.length, active: P.active.length, smitare: P.active.filter((c) => c.violation.smitare).length, npcs: Object.keys(g.npcs).length, peds: g.peds.length }; })));
    await shot('start');
  },

  // Every landmark, seen from a few metres behind someone standing there.
  async views() {
    for (const l of LANDMARKS) {
      // A few metres out from the spot, looking back at it (at a house: at its front door).
      await ev((l) => {
        const g = __game, p = g.player, m = window.__lm(l);
        // Houses' yaw faces out of the door, places' yaw faces the entrance: stand accordingly.
        const out = /House$|^oveStart$/.test(l) ? 1 : -1;
        const fx = Math.sin(m.yaw) * out, fz = Math.cos(m.yaw) * out;
        let x = m.x + fx * 4, z = m.z + fz * 4;
        if (!g.spotFree(x, z)) { const s = g.freeSpot(x, z, 0.5, 2.5); x = s.x; z = s.z; }
        const yaw = Math.atan2(m.x - x, m.z - z);
        p.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true;
      }, l);
      await frames(20);
      await shot('view_' + l);
    }
  },
  async aerial() {
    await ev(() => { __game.aerial = true; });
    await frames(10);
    await shot('aerial');
  },

  // Into the Saab by the garages, then a drive along Solrosvägen and round a corner.
  async drive() {
    await ev(() => { const g = __game, c = g.named.saab; const s = g.freeSpot(c.x + 2, c.z, 0, 1); g.player.teleport(s.x, s.z, 0); });
    await frames(5);
    await tap('KeyE');
    await frames(10);
    console.log('[t] in car', await ev(() => !!__game.playerCar && __game.playerCar.name));
    await shot('drive_0');
    // Out on Solrosvägen (z = -40), eastbound lane, then drive.
    await ev(() => { const g = __game, c = g.playerCar; c.place(-30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
    await frames(5);
    await hold(['KeyW'], 2500);
    await shot('drive_1');
    await hold(['KeyW'], 2000);
    console.log('[t] speed', await ev(() => (__game.playerCar.speed * 3.6).toFixed(0)), 'km/h');
    await hold(['KeyS'], 900);
    await hold(['KeyW', 'KeyD'], 1600);
    await shot('drive_2');
    await hold(['KeyW'], 2200);
    console.log('[t] car', JSON.stringify(await ev(() => { const c = __game.playerCar; return { x: c.x.toFixed(1), z: c.z.toFixed(1), kmh: (c.speed * 3.6).toFixed(0), hp: c.hp.toFixed(0), ordning: __game.patrol.ordning.toFixed(1) }; })));
    await shot('drive_3');
  },

  // Patrick's car with the trailer: the camera pulls back by the trailer's length.
  async tow() {
    await ev(() => { const g = __game; g.enterCar(g.named.patrickCar); });
    await frames(20);
    await shot('tow_0');
    await hold(['KeyW'], 1500);
    await shot('tow_1');
    console.log('[t] tow', JSON.stringify(await ev(() => { const c = __game.playerCar, t = c.trailer; return { trailer: !!t, boom: __game.cam.boom.toFixed(1), ordning: __game.patrol.ordning.toFixed(1) }; })));
  },

  // On foot: walk, brisk walk, the one small jump, a tyre kick.
  async walk() {
    const y0 = await ev(() => __game.player.y);
    await page.keyboard.down('KeyW'); await sleep(1000);
    console.log('[t] walk speed', await ev(() => __game.player.speed.toFixed(2)));
    await shot('walk_0');
    await page.keyboard.down('ShiftLeft'); await sleep(800);
    console.log('[t] brisk speed', await ev(() => __game.player.speed.toFixed(2)));
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    await frames(20);
    let top = 0;
    await page.keyboard.down('Space'); await frames(2); await page.keyboard.up('Space');
    for (let k = 0; k < 30; k++) { await frames(1); top = Math.max(top, await ev(() => __game.player.y)); }
    console.log('[t] jump apex above ground', (top - y0).toFixed(2));
    // Double jump must not exist.
    await page.keyboard.down('Space'); await frames(2); await page.keyboard.up('Space');
    await frames(4);
    await page.keyboard.down('Space'); await frames(2); await page.keyboard.up('Space');
    let top2 = 0;
    for (let k = 0; k < 40; k++) { await frames(1); top2 = Math.max(top2, await ev(() => __game.player.y)); }
    console.log('[t] jump+jump apex', (top2 - y0).toFixed(2));
    // A tyre: stand by the Saab's front wheel and kick it.
    await ev(() => {
      const g = __game, c = g.named.saab, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const wx = c.x + fx * 1.3 + fz * 1.5, wz = c.z + fz * 1.3 - fx * 1.5;
      const yaw = Math.atan2(c.x + fx * 1.3 - wx, c.z + fz * 1.3 - wz);
      g.player.teleport(wx, wz, yaw); g.cam.yaw = yaw - 0.9; g.cam.snapNext = true;
    });
    await frames(10);
    const t0 = await ev(() => __game.tyreT);
    await tap('KeyJ');
    await frames(12);
    await shot('walk_kick');
    console.log('[t] tyre kicked', await ev((t0) => __game.tyreT > t0, t0));
  },

  // Small talk with Parvaneh, then the current mission giver's dialogue.
  async talk() {
    await ev(() => { const g = __game; g.autoDialog = false; const n = g.npc('parvaneh'); const s = g.freeSpot(n.x, n.z, 1.4, 1.8); g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z)); g.cam.yaw = g.player.yaw + 0.6; g.cam.snapNext = true; });
    await frames(6);
    await tap('KeyE');
    await frames(30);
    await shot('talk_chat');
    await ev(() => { const g = __game; const n = g.npc(g.missions.current.giver); const s = g.freeSpot(n.x, n.z, 1.2, 1.8); g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z)); g.cam.snapNext = true; });
    await frames(6);
    await tap('KeyE');
    await frames(40);
    await shot('talk_0');
    console.log('[t] dialog', await ev(() => `${__game.inDialog} ${__game.missions.state}`));
    await tap('Space'); await frames(10); await tap('Space'); await frames(30);
    await shot('talk_1');
  },

  // The story ('story', 'm1'..'m7') lives in tools/scenarios/story.mjs.

  // Drive the Saab into a bin and a pedestrian: things break, Ove pays, the Ordning drops.
  async smash() {
    const r = await ev(() => {
      const g = __game, car = g.named.saab;
      g.enterCar(car);
      // A prop with 16 m of clear ground in front of it (none stand by the streets: approach over a lot,
      // a drive or a lawn).
      let pick = null;
      const props = window.__props.filter((p) => p.alive && ['mailbox', 'trashcan', 'kicksled', 'bench', 'papperskorg', 'bike'].includes(p.type) && Math.hypot(p.x, p.z) < 220);
      props.sort((a, b) => Math.hypot(a.x - car.x, a.z - car.z) - Math.hypot(b.x - car.x, b.z - car.z));
      for (const p of props) {
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let ok = true;
          for (let t = 2.2; t <= 16 && ok; t += 1.0) for (const w of [-1, 0, 1]) if (!g.spotFree(p.x - ax * t + az * w, p.z - az * t - ax * w)) { ok = false; break; }
          if (ok) { pick = { p, x: p.x - ax * 14, z: p.z - az * 14, yaw: Math.atan2(ax, az) }; break; }
        }
        if (pick) break;
      }
      car.place(pick.x, pick.z, pick.yaw);
      g.cam.yaw = pick.yaw; g.cam.snapNext = true;
      window.__target = pick.p;
      return { prop: pick.p.type, at: [pick.p.x.toFixed(1), pick.p.z.toFixed(1)], ordning: g.patrol.ordning.toFixed(1), kr: g.coins };
    });
    console.log('[t] target', JSON.stringify(r));
    await ev(() => __game.addCoins(100));
    await frames(5);
    await shot('smash_0');
    await hold(['KeyW'], 2600);
    await frames(10);
    await shot('smash_1');
    console.log('[t] prop alive?', await ev(() => window.__target.alive), 'ordning', await ev(() => __game.patrol.ordning.toFixed(1)), 'kr', await ev(() => __game.coins));
    await ev(() => {
      const g = __game, c = g.playerCar, ped = g.peds.find((p) => !p.char.invulnerable).char;
      c.place(-60, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
      for (const o of g.cars.slice()) if (o.traffic && Math.hypot(o.x + 50, o.z + 40) < 70) g.removeCar(o);
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      ped.teleport(c.x + fx * 12, c.z + fz * 12);
      ped.state = 'normal';
      const P = g.peds.find((p) => p.char === ped); P.idleT = 5; P.panicT = 5;
      window.__ped = ped;
      window.__ord = g.patrol.ordning;
    });
    await hold(['KeyW'], 2000);
    await frames(4);
    await shot('smash_2');
    console.log('[t] ped', await ev(() => window.__ped.state), 'ordning change', await ev(() => (__game.patrol.ordning - window.__ord).toFixed(1)));
    await sleep(1500);
    await shot('smash_3');
  },

  // Let traffic run for a minute and report cars that have stopped moving.
  async traffic() {
    const snap = () => ev(() => __game.cars.filter((c) => c.traffic && !c.dead).map((c) => ({ x: c.x, z: c.z, v: c.speed, k: c.kind })));
    const a = await snap();
    console.log('[t] traffic kinds', [...new Set(a.map((c) => c.k))].join(' '));
    await sleep(30000);
    const b = await snap();
    await sleep(30000);
    const c = await snap();
    const moved = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    let stuck = 0;
    const n = Math.min(a.length, b.length, c.length);
    for (let k = 0; k < n; k++) if (moved(b[k], c[k]) < 5) { stuck++; console.log('[t] stuck car at', c[k].x.toFixed(0), c[k].z.toFixed(0), 'v', c[k].v.toFixed(1), c[k].k); }
    console.log('[t] traffic cars', n, 'stuck', stuck, 'avg speed', (c.reduce((s, q) => s + q.v, 0) / c.length).toFixed(1));
    console.log('[t] fps', await fps());
    await ev(() => { __game.aerial = true; });
    await frames(5);
    await shot('traffic_aerial');
    await ev(() => { __game.aerial = false; });
    await tap('KeyM');
    await frames(12);
    await shot('bigmap');
  },

  // Let an AI chauffeur drive the player's Saab around town for a look at the chase cam.
  async cruise() {
    await ev(() => { const g = __game; g.enterCar(g.named.saab); });
    await frames(3);
    await ev(() => { const g = __game, c = g.playerCar; c.place(30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
    await ev(async () => { const { AIDriver } = await import('./src/actors/drivers.js'); const c = __game.playerCar; c.ai = new AIDriver(c, { mode: 'traffic', cruise: 16, avoid: true }); });
    for (let k = 0; k < 6; k++) { await sleep(3500); await shot('cruise_' + k); }
    console.log('[t] fps', await fps());
  },

  async title() {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 60000 });
    await sleep(1500);
    await shot('title');
    await sleep(6000);
    await shot('title_b');
  },
};

// Area-owned scenarios: every tools/scenarios/<area>.mjs default-exports
// (helpers) => ({ name() {...}, ... }), merged into SCENARIOS (same name = override).
const SCN_DIR = path.join(ROOT, 'tools', 'scenarios');
if (fs.existsSync(SCN_DIR)) for (const f of fs.readdirSync(SCN_DIR).filter((f) => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(SCN_DIR, f)).href);
  Object.assign(SCENARIOS, mod.default({ page, ev, shot, frames, sleep, hold, tap, fps, fresh, until, warp, L, standBy, OUT, PORT, ROOT, errors }));
}

for (const name of process.argv.slice(2)) {
  if (!SCENARIOS[name]) { console.log('unknown scenario', name); continue; }
  console.log('--', name);
  await fresh();
  try { await SCENARIOS[name](); } catch (e) { console.log("scenario failed:", e.message, (e.stack || "").split("\n").slice(0, 4).join(" | ")); }
}
console.log(errors.length ? `${errors.length} errors` : 'no errors');
await browser.close();
server.close();
