// The review page for the voices and the music (features/implemented/a_fully_voiced_game.md 5.5):
// a small local server (make voice-review; PORT=8795 by default). It never calls the API itself:
// choosing a voice runs `voice.mjs choose`, and a retake or a direction is written to
// tools/voice/lines.json for the next `make voice`.
//   - Rollerna: every candidate for a role side by side (the audition, what the recogniser heard,
//     pitch and pace), the chosen one marked; "Välj" makes it the role's voice (its clips are then
//     missing: make voice DRY=1, make voice).
//   - Granskning: the takes the check put aside (short lines, interjections, rejected takes).
//   - Repliker: per day and scene, play a whole scene in order or one line; "Gör om" bumps the
//     line's retake (a new take next run), with an optional direction (a `tts` text such as
//     "[sighs] Mat."); "Lås" keeps a good take whatever the role's settings do later.
//   - Musik: each cue with its measurements.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8795);
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };

async function state() {
  const { plan } = await import(pathToFileURL(path.join(ROOT, 'tools/voice/voice.mjs')).href + '?t=' + Date.now());
  const script = await import(pathToFileURL(path.join(ROOT, 'src/game/script.js')).href + '?t=' + Date.now());
  const cast = read('tools/voice/cast.json', {}), qc = read('tools/voice/qc.json', {}), dir = read('tools/voice/lines.json', {});
  const lines = await plan();
  const byKey = new Map(lines.map((l) => [l.who + '\0' + l.text, l]));
  const qcOf = (l) => Object.entries(qc).find(([, q]) => q.who === l.who && q.text === l.text && q.take === l.take)?.[1] || null;
  const view = (l) => ({ who: l.who, text: l.text, part: l.part, file: l.have ? 'assets/voice/' + l.file : null, inScope: l.inScope, take: l.take, qc: qcOf(l), dir: dir[l.who]?.[l.text] || null, voiced: !!l.id });
  // Scenes: walk STORY (a day's intro, outro, stage lines in their order), then the other parts.
  const scenes = [];
  const speakers = new Set(Object.keys(cast.roles || {}));
  const isLine = (v) => Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && (speakers.has(v[0]) || /^ped|^driver|^window/.test(v[0]));
  const walk = (v, name, out) => {
    if (isLine(v)) { const l = byKey.get(v[0] + '\0' + v[1]); if (l) out.push(view(l)); if (typeof v[2] === 'string' && !/^(radio|shout)$/.test(v[2])) { const r = byKey.get('ove\0' + v[2]); if (r) out.push(view(r)); } return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, name, out); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'day') continue; const o = []; walk(x, k, o); if (o.length) out.push({ scene: name ? `${name} · ${k}` : k, lines: o }); }
  };
  const seen = new Set();
  for (const [id, m] of Object.entries(script.STORY || {})) {
    const groups = [];
    walk(m, '', groups);
    const flat = (g) => (g.lines ? g.lines.flatMap(flat) : [g]);
    for (const g of groups) { const ls = (g.lines || [g]).flatMap(flat); ls.forEach((l) => seen.add(l.who + '\0' + l.text)); scenes.push({ part: 'day' + m.day, title: `Dag ${m.day} (${id}) · ${g.scene || ''}`, lines: ls }); }
  }
  const rest = {};
  // (the pool's lines one voice at a time: a dozen voices say the same tables)
  for (const l of lines) if (!seen.has(l.who + '\0' + l.text)) (rest[cast.roles?.[l.who]?.pool ? `${l.part} · ${l.who}` : l.part] ||= []).push(view(l));
  for (const [part, ls] of Object.entries(rest)) scenes.push({ part, title: part, lines: ls });
  const roles = {};
  for (const [who, r] of Object.entries(cast.roles || {})) roles[who] = { ...r, auditions: read(`.cache/voice/cast/${who}/index.json`, []) };
  const review = lines.filter((l) => l.have).map(view).filter((l) => l.qc && l.qc.verdict !== 'ok');
  const music = { cues: read('tools/music/cues.json', {}), made: read('assets/music/index.json', {}), measured: read('.cache/music/index.json', {}) };
  return { roles, scope: cast.scope, scenes, review, music };
}

const PAGE = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saab &amp; Run – röster</title>
<style>
:root { --bg: #f4f1ea; --fg: #222; --mute: #6b665c; --card: #fff; --line: #ddd6c8; --acc: #2f5d8a; --warn: #a3501e; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1a18; --fg: #e8e4dc; --mute: #9a948a; --card: #262420; --line: #3a372f; --acc: #7fb0e0; --warn: #e09a6a; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
header { padding: 14px 18px; border-bottom: 1px solid var(--line); display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; }
header h1 { font-size: 18px; margin: 0; }
nav button { background: none; border: 1px solid var(--line); color: var(--fg); padding: 5px 11px; border-radius: 6px; cursor: pointer; }
nav button.on { background: var(--acc); color: #fff; border-color: var(--acc); }
main { padding: 16px 18px; max-width: 1100px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 0 0 12px; }
h2 { font-size: 16px; margin: 4px 0 10px; } h3 { font-size: 14px; margin: 14px 0 6px; color: var(--mute); }
table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 5px 6px; border-top: 1px solid var(--line); vertical-align: top; font-size: 14px; }
th { color: var(--mute); font-weight: 500; }
.chosen { outline: 2px solid var(--acc); }
.mute { color: var(--mute); } .warn { color: var(--warn); }
button.small { font-size: 12px; padding: 2px 8px; border: 1px solid var(--line); background: none; color: var(--fg); border-radius: 5px; cursor: pointer; }
audio { height: 30px; vertical-align: middle; max-width: 260px; }
.who { font-weight: 600; white-space: nowrap; }
input.dir { width: 220px; font: inherit; font-size: 13px; }
</style></head><body>
<header><h1>Saab &amp; Run – röster och musik</h1><nav id="tabs"></nav><span class="mute" id="note"></span></header>
<main id="main">Laddar…</main>
<script>
let S = null, tab = location.hash.slice(1) || 'roller';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const au = (f) => f ? '<audio controls preload="none" src="/file?p=' + encodeURIComponent(f) + '"></audio>' : '<span class="mute">mummel</span>';
async function load() { S = await (await fetch('/api/state')).json(); render(); }
async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const t = await r.text(); document.getElementById('note').textContent = t; await load(); }
function tabs() {
  const T = { roller: 'Rollerna', granskning: 'Granskning (' + S.review.length + ')', repliker: 'Repliker', musik: 'Musik' };
  document.getElementById('tabs').innerHTML = Object.entries(T).map(([k, v]) => '<button class="' + (k === tab ? 'on' : '') + '" data-tab="' + k + '">' + v + '</button>').join(' ');
}
function lineRow(l) {
  const q = l.qc ? '<span class="' + (l.qc.verdict === 'ok' ? 'mute' : 'warn') + '">' + esc(l.qc.verdict) + (l.qc.flags?.length ? ' (' + l.qc.flags.join(', ') + ')' : '') + ' · hörde: ”' + esc(l.qc.heard) + '” · ' + l.qc.cps + ' tecken/s</span>' : '';
  const d = l.dir || {};
  return '<tr><td class="who">' + esc(l.who) + '</td><td>' + esc(l.text) + (d.tts ? '<br><span class="mute">säger: ' + esc(d.tts) + '</span>' : '') + (d.note ? '<br><span class="mute">' + esc(d.note) + '</span>' : '') + '<br>' + q + '</td><td>' + au(l.file) + '</td><td>' +
    (l.voiced ? '<input class="dir" placeholder="regi, t.ex. [sighs] Mat." data-who="' + esc(l.who) + '" data-text="' + esc(l.text) + '"> <button class="small" data-act="retake" data-who="' + esc(l.who) + '" data-text="' + esc(l.text) + '">Gör om</button> <button class="small" data-act="lock" data-who="' + esc(l.who) + '" data-text="' + esc(l.text) + '">' + (d.locked ? 'Lås upp' : 'Lås') + '</button>' : '<span class="mute">' + (l.inScope ? 'rollen saknar röst' : 'utanför omfånget') + '</span>') + '</td></tr>';
}
function render() {
  tabs();
  const M = document.getElementById('main');
  if (tab === 'roller') {
    M.innerHTML = Object.entries(S.roles).map(([who, r]) => '<div class="card"><h2>' + esc(who) + ' <span class="mute">' + esc(r.name || (r.mumble ? 'mummel' : 'ingen röst än')) + (r.pool ? ' · statist: ' + (r.pool.sex === 'f' ? 'kvinna' : 'man') + ', ' + ({ young: '13–34 år', mid: '35–64 år', old: '65+' }[r.pool.age] || r.pool.age) : '') + '</span></h2>' + (r.note ? '<p class="mute">' + esc(r.note) + '</p>' : '') +
      (r.auditions.length ? '<table><tr><th>kandidat</th><th>prov</th><th>tonhöjd</th><th>tempo</th><th>taligenkänning</th><th></th></tr>' + r.auditions.map((a) => '<tr class="' + (a.id === r.voice_id ? 'chosen' : '') + '"><td>' + esc(a.name) + '<br><span class="mute">' + esc([a.kind, a.lang, a.accent, a.age].filter(Boolean).join(' · ')) + '</span></td><td>' + au(a.file) + '</td><td>' + a.f0 + ' Hz<br><span class="mute">' + a.f0lo + '–' + a.f0hi + '</span></td><td>' + a.cps + ' tecken/s</td><td>WER ' + a.wer + '<br><span class="mute">' + esc(a.heard) + '</span></td><td>' + (a.id === r.voice_id ? '<b>vald</b>' : '<button class="small" data-act="choose" data-who="' + who + '" data-id="' + a.id + '">Välj</button>') + '</td></tr>').join('') + '</table>' : '<p class="mute">Inga provinspelningar. make voice-cast WHO=' + esc(who) + '</p>') + '</div>').join('');
  } else if (tab === 'granskning') {
    M.innerHTML = '<div class="card"><p class="mute">Tagningar som kontrollen lade åt sidan: korta repliker och interjektioner (underkänns aldrig automatiskt) och tagningar som underkändes tre gånger. Lyssna, och gör om med regi om det behövs.</p><table>' + S.review.map(lineRow).join('') + '</table></div>';
  } else if (tab === 'repliker') {
    M.innerHTML = S.scenes.map((s, i) => '<div class="card"><h2>' + esc(s.title) + ' <button class="small" data-act="scene" data-i="' + i + '">Spela scenen</button></h2><table>' + s.lines.map(lineRow).join('') + '</table></div>').join('');
  } else {
    const c = S.music.cues.cues || S.music.cues;
    M.innerHTML = '<div class="card"><table><tr><th>stycke</th><th></th><th>mätt</th></tr>' + Object.keys(S.music.made).filter((k) => !k.startsWith('_')).map((k) => { const m = S.music.made[k], x = S.music.measured[k] || {}; return '<tr><td><b>' + esc(k) + '</b><br><span class="mute">' + esc(c?.[k]?.about || '') + '</span></td><td>' + au('assets/music/' + m.f) + '</td><td class="mute">' + esc(JSON.stringify(x)) + '</td></tr>'; }).join('') + '</table></div>';
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; location.hash = tab; render(); return; }
  const a = b.dataset.act;
  if (a === 'choose') await post('/api/choose', { who: b.dataset.who, id: b.dataset.id });
  if (a === 'retake') { const inp = [...document.querySelectorAll('input.dir')].find((x) => x.dataset.who === b.dataset.who && x.dataset.text === b.dataset.text); await post('/api/direction', { who: b.dataset.who, text: b.dataset.text, retake: true, tts: inp?.value || undefined }); }
  if (a === 'lock') await post('/api/direction', { who: b.dataset.who, text: b.dataset.text, lock: true });
  if (a === 'scene') { const list = [...b.closest('.card').querySelectorAll('audio')]; for (const x of list) { await new Promise((ok) => { x.onended = ok; x.onerror = ok; x.play().catch(ok); }); } }
});
load();
</script></body></html>`;

function body(req) { return new Promise((ok) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); }); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
    if (u.pathname === '/api/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await state())); return; }
    if (u.pathname === '/file') {
      const p = path.normalize(u.searchParams.get('p') || '');
      if (!/^(assets\/voice|assets\/music|\.cache\/voice|\.cache\/music)\//.test(p) || p.includes('..')) { res.writeHead(403); res.end(); return; }
      const f = path.join(ROOT, p);
      if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); fs.createReadStream(f).pipe(res); return;
    }
    if (req.method === 'POST' && u.pathname === '/api/choose') {
      const b = await body(req);
      const r = spawnSync('node', [path.join(ROOT, 'tools/voice/voice.mjs'), 'choose', String(b.who), String(b.id)], { encoding: 'utf8', cwd: ROOT });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end((r.stdout + r.stderr).trim()); return;
    }
    if (req.method === 'POST' && u.pathname === '/api/direction') {
      const b = await body(req), f = path.join(ROOT, 'tools/voice/lines.json');
      const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
      const d = ((all[b.who] ||= {})[b.text] ||= {});
      let msg = '';
      if (b.lock) {
        if (d.locked) { delete d.locked; delete d.hash; msg = 'upplåst'; }
        else { const { plan } = await import(pathToFileURL(path.join(ROOT, 'tools/voice/voice.mjs')).href + '?t=' + Date.now()); const l = (await plan()).find((x) => x.who === b.who && x.text === b.text); if (l?.hash) { d.locked = true; d.hash = l.hash; msg = 'låst'; } else msg = 'ingen tagning att låsa'; }
      }
      if (b.retake) { if (d.locked) msg = 'repliken är låst'; else { d.retake = (d.retake || 0) + 1; delete d.auto; if (b.tts) d.tts = b.tts; msg = `omtagning ${d.retake} sparad: make voice gör den`; } }
      fs.writeFileSync(f, JSON.stringify(all, null, 1) + '\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); return;
    }
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
}).listen(PORT, '127.0.0.1', () => console.log(`Provlyssningssidan: http://127.0.0.1:${PORT}/  (Ctrl-C stoppar)`));
