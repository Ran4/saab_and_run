// Everything drawn over the 3D view: kronor and anmälningar, the Ordning meter, objectives and
// timers, the avbrott (errand) panel, incoming calls, Ove's notebook, world-anchored tags, the
// minimap and big map, the Saab speedometer, dialogue with portraits, banners, toasts, speech
// bubbles, and the title / pause screens' wiring. Contract: DESIGN.md section 9; notes/ui.md.

import { THREE, camera, scene as worldScene, setQuality, getQuality, qualityInfo } from '../gfx.js';
import * as LAYOUT from '../world/layout.js';
import { blocks, BOX, CIRCLE, RAMP } from '../world/collision.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';

const { MAP, N, P, HALF, RHW, rc, BOUND } = LAYOUT;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const PARAMS = new URLSearchParams(location.search);
const SETTINGS_KEY = 'saab-and-run-settings';

let root, mapCanvas, mapCtx, baseMap;
const byDist = (a, b) => a.d - b.d;
// A two-click button back to its first state (see _initMenus' twice()).
const unconfirm = (b) => { clearTimeout(b._confirmT); if (b.classList.contains('confirm')) { b.classList.remove('confirm'); if (b._label) b.textContent = b._label; } };

// The whole HUD is laid out for 1280x720 and zoomed by --ui (CSS `zoom`) so it keeps its
// proportions on other screens: min(w/1280, h/720), kept between 0.8 and 2. index.html sets it too
// (before the modules load, for the title screen).
export function uiScale() { return clamp(Math.min(window.innerWidth / 1280, window.innerHeight / 720), 0.8, 2); }
function applyUiScale() {
  const s = uiScale();
  document.documentElement.style.setProperty('--ui', s.toFixed(4));
  return s;
}
const MAP_SCALE = 1.6; // px per metre on the base map
const MAP_EXT = BOUND + 20;

// Winter map palette: snow a little greyer than paper-white so the disc still reads as a disc over
// a snowy view (it also gets a dark outer ring).
const MAPC = {
  outside: '#d3d9dd',    // snowy fields beyond the town
  asphalt: '#3c4147',
  centre: 'rgba(235, 238, 240, 0.55)',
  sidewalk: '#b9bfc4',
  snow: '#e3e7ea',
  building: '#8f979f',
  buildingEdge: '#646b73',
  garage: '#a4abb1',
  water: '#768b98',
  carfree: 'rgba(240, 178, 74, 0.12)',
  carfreeEdge: 'rgba(186, 128, 40, 0.8)',
  blocks: {
    park: '#d8e0da', field: '#dce2e2', cemetery: '#d5dcd7', forest: '#9eaaa2', church: '#dadde0',
    centrum: '#c2c7cb', mall: '#c2c7cb', shops: '#c2c7cb', gas: '#c0c5c9', dealer: '#c0c5c9', hospital: '#c8ccd0',
    kommun: '#c8ccd0', preschool: '#dde1e1', school: '#d6dbdd', apartments: '#dadee1', tower: '#dadee1', cinema: '#c2c7cb',
    construct: '#cbc8c1', ove: '#e8eae7',
  },
};

// Friendly car names for the speedometer badge.
const CAR_NAMES = { saab: 'Saab 900', patrickCar: 'Patricks bil', runeVolvo: 'Runes Volvo', andersAudi: 'Anders Audi', vitskjortaSkoda: 'Kommunens Škoda', skoda: 'Kommunens Škoda' };
// The new car specs already have Swedish names ('Volvo 240', 'Skåpbil'); the old English ones are
// translated, and the ones with no sensible Swedish name are not shown at all.
const SPEC_SV = { 'Family Wagon': 'Kombi', Wagon: 'Kombi', Hatchback: 'Halvkombi', Sedan: 'Sedan', Van: 'Skåpbil', Pickup: 'Pickup', Hearse: 'Likbil', 'School Bus': 'Buss', Bus: 'Buss', 'Ice Cream Truck': 'Glassbil', Taxi: 'Taxi', Truck: 'Lastbil', 'Hormone Rocket': '' };
// Auto-styling of well-known banner texts when no class is given.
const BANNER_AUTO = { 'ANMÄLD': 'stamp', 'ANMÄLD!': 'stamp', 'TAGEN!': 'stamp', 'TAGEN': 'stamp', 'SMET!': 'bad', 'KAOS I OMRÅDET': 'chaos', 'ORDNING OCH REDA': 'good', 'UPPDRAG KLART': 'good', 'UPPDRAG KLART!': 'good', 'UPPDRAG MISSLYCKADES': 'bad', 'OMRÅDET ÄR I ORDNING': 'final' };
// Violation kinds (DESIGN 6): the words come from patrol.js's KINDS ([tag / log, notebook sentence]),
// which sets hud.kinds - one source for the tag, the notebook and the pause log.
const kindShort = (k) => hud.kinds?.[k]?.[0];
const kindText = (k) => hud.kinds?.[k]?.[1];
// World tags: [minimum opacity, minimum scale] per class as they get further away.
const TAG_FADE = { smitare: [1, 0.9], violation: [0.9, 0.8], errand: [0.92, 0.82], neighbour: [0.6, 0.75], reported: [0.35, 0.72], plain: [0.35, 0.72] };

const ICON = {
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.6"/><path d="M10 5.5V10l3 2"/></svg>',
  book: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="2.8" width="12" height="14.6" rx="1"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
  north: '<svg viewBox="0 0 34 46"><path d="M17 3 L27 30 L17 24 L7 30 Z" fill="#1b1f24"/><path d="M17 3 L17 24 L7 30 Z" fill="#5a626a"/><text x="17" y="44" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="600" font-size="13" fill="#1b1f24">N</text></svg>',
  flake: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 1.5v17M2.6 5.75l14.8 8.5M2.6 14.25l14.8-8.5M7.6 2.9 10 5.2l2.4-2.3M7.6 17.1 10 14.8l2.4 2.3"/></svg>',
  pencil: '<svg viewBox="0 0 84 14"><path d="M0 7 L7 4.6 L7 9.4 Z" fill="#3b3e44"/><path d="M7 4.6 L19 1.5 L19 12.5 L7 9.4 Z" fill="#dcc29a"/><rect x="19" y="1.5" width="60" height="11" fill="#9a2f22"/><rect x="19" y="1.5" width="60" height="3.2" fill="#b4412f"/><rect x="79" y="1.5" width="5" height="11" fill="#5b2018"/></svg>',
};

export const hud = {
  portraits: {},
  kinds: null,             // patrol.js's KINDS (set by the patrol)
  dialogActive: false,
  onResetSave: null,       // set by main.js: called when "Radera sparat spel" is confirmed
  fontsReady: Promise.resolve(),

  init() {
    root = $('hud');
    this.ui = applyUiScale();
    window.addEventListener('resize', () => { this.ui = applyUiScale(); this._spKey = ''; });
    root.innerHTML = `
      <div id="status" class="card">
        <div class="st st-clock">${ICON.clock}<span id="clock-t">06:00</span></div>
        <div class="st st-kr"><span id="coin-n">0</span><small>kr</small></div>
        <div class="st st-rep" title="Anmälda felparkeringar">${ICON.book}<span id="rep-n">0</span><small>anm.</small></div>
      </div>
      <div id="leftcol">
        <div id="call" class="card"><div class="call-face"><span class="face-crop"><img alt=""></span><i class="r1"></i><i class="r2"></i></div><div class="call-body"><div class="kicker call-kicker">Telefonen ringer</div><div class="call-name"></div><div class="call-sub"></div></div><div class="call-icon">${ICON.phone}</div></div>
        <div id="errand" class="card"><div class="er-head"><span class="kicker er-kicker">Avbrott</span><span class="er-timer"></span></div><div class="er-title"></div><div class="er-text"></div><div class="er-bar"><div class="er-fill"></div></div><span class="er-label"></span></div>
        <div id="collect" class="card"></div>
      </div>
      <div id="meter" class="card"><div class="mt-head"><span class="kicker">Ordning i området</span><span class="mt-val">50</span></div><div class="mt-bar"><div class="mt-fill"></div><div class="mt-ticks"></div></div></div>
      <div id="pursuit" class="card"><div class="pu-head"><span class="kicker">Smitare</span><span class="pu-dist"></span></div><div class="pu-label"></div><div class="pu-bar"><div class="pu-fill"></div></div><div class="pu-sub"><span class="pu-blabel">Ork</span><span class="pu-note"></span></div></div>
      <div id="cold" class="card"><div class="co-head"><span class="kicker">${ICON.flake}Kyla</span><span class="co-val"></span></div><div class="co-bar"><div class="co-fill"></div><div class="mt-ticks"></div></div><div class="co-sub"></div></div>
      <div id="objective" class="card"><div class="obj-title"></div><div class="obj-text"></div><div class="obj-timer"></div><div class="obj-bar"><div class="obj-bar-fill"></div></div><span class="obj-bar-label"></span></div>
      <div id="minimap-wrap"><canvas id="minimap" width="420" height="420"></canvas><div class="mm-n">N</div></div>
      <div id="speedo"><canvas class="sp-dial"></canvas><div class="sp-name"></div></div>
      <div id="tags"></div>
      <div id="bubbles"></div>
      <div id="prompt" class="card"></div>
      <div id="toasts"></div>
      <div id="banner"><div class="banner-kicker"></div><div class="banner-rule"></div><div class="banner-main"></div><div class="banner-rule"></div><div class="banner-sub"></div></div>
      <div id="notebook"><div class="nb-page paper"><div class="nb-wire"></div>
        <div class="nb-head"><span>Felparkering</span><span class="nb-no"><b></b></span></div>
        <div class="nb-row"><label>Reg.nr</label><span class="nb-val hand plate" data-f="plate"></span></div>
        <div class="nb-row"><label>Plats</label><span class="nb-val hand" data-f="place"></span></div>
        <div class="nb-row"><label>Tid</label><span class="nb-val hand" data-f="time"></span></div>
        <div class="nb-row nb-row-text"><label>Överträdelse</label><span class="nb-val hand text" data-f="text"></span></div>
        <div class="nb-row nb-row-sign"><label>Sign.</label><span class="nb-val hand" data-f="sign"></span></div>
        <div class="nb-stamp"><b>ANMÄLD</b><small class="nb-stamp-t"></small></div>
        <div class="nb-cancel"><svg viewBox="0 0 260 150" preserveAspectRatio="none"><path d="M4 140 C 60 110, 120 70, 256 8 M 10 18 C 90 50, 170 100, 250 146"/></svg></div>
        <div class="nb-reason"></div>
        <div class="nb-pencil">${ICON.pencil}</div>
      </div></div>
      <div id="frost"></div>
      <div id="curtain"><div class="cu-text"></div></div>
      <div id="letterbox"><div class="lb-top"></div><div class="lb-bot"></div></div>
      <div id="dialog" class="card"><div class="dlg-portrait"><img alt=""></div><div class="dlg-body"><div class="dlg-name"></div><div class="dlg-text"></div></div><div class="dlg-next"><b>E</b>fortsätt</div></div>
      <div id="flash"></div>
      <div id="bigmap"><div class="bm-frame"><div class="bm-title">Karta över området</div><canvas width="1100" height="1100"></canvas><div class="bm-north">${ICON.north}</div></div><div class="bm-legend"></div></div>
    `;
    mapCanvas = $('minimap');
    mapCtx = mapCanvas.getContext('2d');
    this.status = $('status');
    this.coinEl = $('coin-n');
    this.repEl = $('rep-n');
    this.clockEl = $('clock-t');
    this.meterEl = $('meter');
    this.meterFill = root.querySelector('.mt-fill');
    this.meterVal = root.querySelector('.mt-val');
    this.pursuitEl = $('pursuit');
    const pq = (s) => this.pursuitEl.querySelector(s);
    this._pu = { label: pq('.pu-label'), fill: pq('.pu-fill'), dist: pq('.pu-dist'), note: pq('.pu-note'), blabel: pq('.pu-blabel') };
    this.obj = $('objective');
    this.objTitle = root.querySelector('.obj-title');
    this.objText = root.querySelector('.obj-text');
    this.objTimer = root.querySelector('.obj-timer');
    this.objBar = root.querySelector('.obj-bar');
    this.objBarFill = root.querySelector('.obj-bar-fill');
    this.objBarLabel = root.querySelector('.obj-bar-label');
    this.errandEl = $('errand');
    const eq = (s) => this.errandEl.querySelector(s);
    this._er = { kicker: eq('.er-kicker'), title: eq('.er-title'), text: eq('.er-text'), timer: eq('.er-timer'), bar: eq('.er-bar'), fill: eq('.er-fill'), label: eq('.er-label') };
    this.callEl = $('call');
    this.speedo = $('speedo');
    this.prompt = $('prompt');
    this.toastsEl = $('toasts');
    this.banner = $('banner');
    this.bubbles = $('bubbles');
    this.tagsEl = $('tags');
    this.dialog = $('dialog');
    this.collectEl = $('collect');
    this.flash = $('flash');
    this.bigmap = $('bigmap');
    this.coldEl = $('cold');
    this._co = { fill: this.coldEl.querySelector('.co-fill'), val: this.coldEl.querySelector('.co-val'), sub: this.coldEl.querySelector('.co-sub') };
    this.frostEl = $('frost');
    this.frostEl.appendChild(frostCanvas());
    this._tagPool = [];
    this._meter = null;
    this.notebook._init($('notebook'));
    this.fontsReady = loadFonts();
    this.fontsReady.then(() => { this._spFace = null; this._spKey = ''; });
    // The meter starts at 50 (DESIGN 4.2) without a "previous value", so the game's first
    // setMeter() call jumps straight to its value instead of floating a big +/- delta.
    this.setMeter(50);
    this._meter = null;
    this._initMenus();
  },

  // ------------------------------------------------------------------------------------------
  // Title / pause menu wiring (the visible toggles are ours; main.js wires #play and #resume).

  _initMenus() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    if (s.music === false) audio.setMusic(false);
    if (s.sound === false) audio.setMuted(true);
    // Graphics: 'auto' (the default: the renderer picks the tier, gfx.js), 'high' or 'low', saved under
    // `quality` once chosen. The old `gfx` key was written as 'high' whenever any toggle changed (no
    // real choice: ignored); an old 'low' still counts. The URL (?q=, ?lowgfx) wins over both.
    const saved = ['auto', 'high', 'low'].includes(s.quality) ? s.quality : s.gfx === 'low' ? 'low' : null;
    this._quality = saved;
    if (saved && !PARAMS.has('q') && !PARAMS.has('lowgfx') && getQuality() !== saved) setQuality(saved);
    const bind = (id, fn) => $(id)?.addEventListener('click', fn);
    bind('opt-music', () => { audio.setMusic(!audio.musicOn); this._saveSettings(); this.syncMenu(); });
    // The voices: on (the clips) or off (the old murmur), and their level (voice.js reads both at load).
    bind('opt-voice', () => { voice.setting = !voice.setting; voice.setEnabled(voice.setting); this._saveSettings(); this.syncMenu(); });
    bind('opt-voicelvl', () => { const L = [1, 0.7, 0.4], i = L.indexOf(voice.level); voice.setLevel(L[(i + 1) % L.length]); this._saveSettings(); this.syncMenu(); });
    bind('opt-sound', () => { audio.setMuted(!audio.muted); this._saveSettings(); this.syncMenu(); });
    bind('opt-gfx', () => { this._quality = setQuality({ auto: 'high', high: 'low', low: 'auto' }[getQuality()] || 'auto').setting; this._saveSettings(); this.syncMenu(); });
    // Two clicks for anything that throws work away: "Säker? Klicka igen" first (for 3.5 s).
    const twice = (id, fn) => bind(id, (e) => {
      const b = e.currentTarget;
      b._label ||= b.textContent;
      clearTimeout(b._confirmT);
      if (!b.classList.contains('confirm')) {
        b.classList.add('confirm');
        b.textContent = 'Säker? Klicka igen';
        b._confirmT = setTimeout(() => unconfirm(b), 3500);
        return;
      }
      unconfirm(b);
      fn(b);
    });
    twice('opt-reset', () => {
      if (this.onResetSave) this.onResetSave();
      else window.__game?.resetSave?.();
    });
    // The day's mission, while it runs (Q only gives up after a failure, and a gamepad has no other
    // way out): the runner cleans up, marks the day given up (a short intro next time) and says
    // who is still waiting; then back to the game.
    twice('opt-abort', (b) => {
      const g = window.__game;
      b.hidden = true;
      if (g?.missions?.canGiveUp) g.missions.abort();
      g?.pause?.(false);
    });
    // The title's "Kontroller": the controls table over the right of the scene, on request (it used
    // to cover the scene all the time).
    bind('title-ctl', (e) => { const on = $('title')?.classList.toggle('ctl'); e.currentTarget.setAttribute('aria-expanded', String(!!on)); });
    document.querySelector('#title .title-controls')?.addEventListener('click', () => { $('title')?.classList.remove('ctl'); $('title-ctl')?.setAttribute('aria-expanded', 'false'); });
    // "Kontroller": the title screen's controls table, shown in place of the notebook page.
    const pause = $('pause');
    const ctl = $('pause-controls'), table = document.querySelector('#title .controls');
    if (ctl && table && !ctl.querySelector('table')) {
      el('div', 'tc-head', ctl, 'Kontroller');
      ctl.appendChild(table.cloneNode(true));
    }
    bind('opt-controls', () => { pause?.classList.toggle('ctl'); this.syncMenu(); });
    pause?.addEventListener('mousemove', () => pause.classList.remove('pad'));
    let wasShown = false;
    if (pause) new MutationObserver(() => {
      const shown = pause.classList.contains('show');
      if (shown && !wasShown) { pause.classList.remove('ctl'); for (const b of pause.querySelectorAll('.confirm')) unconfirm(b); this.syncMenu(); this.renderLog(this._log); }
      if (shown !== wasShown) this._padMenu(shown);
      wasShown = shown;
    }).observe(pause, { attributes: true, attributeFilter: ['class'] });
    this.syncMenu();
    this.renderLog(this._log);
  },
  // The pause menu with a gamepad (standard mapping): d-pad or left stick up/down moves the focus
  // over the menu's buttons, A presses the focused one - on release, so the press that resumes the
  // game doesn't also reach it as a jump. Start still toggles the pause (main.js). Without a pad,
  // nothing changes (no focus is set).
  _padMenu(on) {
    cancelAnimationFrame(this._padRaf);
    const pause = $('pause');
    if (!pause) return;
    if (!on) { pause.classList.remove('pad'); if (pause.contains(document.activeElement)) document.activeElement.blur(); return; }
    let prev = null, rep = 0;
    const step = () => {
      this._padRaf = requestAnimationFrame(step);
      let pad = null;
      try { for (const p of navigator.getGamepads?.() || []) if (p && p.connected && p.mapping === 'standard') { pad = p; break; } } catch (e) { pad = null; }
      if (!pad) return;
      const b = (i) => { const v = pad.buttons[i]; return !!(v && (typeof v === 'object' ? v.pressed || v.value > 0.5 : v > 0.5)); };
      const ay = +pad.axes[1] || 0;
      const cur = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, a: b(0) };
      if (!prev) { prev = cur; return; }   // a button already held when the menu opened doesn't count
      const list = [...pause.querySelectorAll('.pause-menu button')].filter((e) => !e.hidden && e.offsetParent);
      const now = performance.now();
      if ((cur.up || cur.down) && (!(prev.up || prev.down) || now > rep)) {
        rep = now + (prev.up || prev.down ? 160 : 420);
        let i = list.indexOf(document.activeElement);
        i = i < 0 ? 0 : (i + (cur.down ? 1 : -1) + list.length) % list.length;
        pause.classList.add('pad');
        list[i]?.focus();
      }
      if (prev.a && !cur.a && list.includes(document.activeElement)) document.activeElement.click();
      prev = cur;
    };
    step();
  },
  _saveSettings() {
    const o = { music: audio.musicOn, sound: !audio.muted, voice: voice.setting, voiceLevel: voice.level };
    if (this._quality) o.quality = this._quality;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
  },
  // Refresh the pause menu's toggle labels (called whenever the pause menu opens).
  syncMenu() {
    const set = (id, on, txt) => { const b = $(id); if (!b) return; b.querySelector('b').textContent = txt; b.classList.toggle('off', !on); };
    set('opt-music', audio.musicOn, audio.musicOn ? 'På' : 'Av');
    set('opt-voice', voice.setting, voice.setting ? 'På' : 'Av');
    set('opt-voicelvl', voice.setting, `${Math.round(voice.level * 100)} %`);
    set('opt-sound', !audio.muted, audio.muted ? 'Av' : 'På');
    // Auto shows what it picked: "Auto (Hög)" / "Auto (Låg)" (it may have dropped to low meanwhile).
    const q = getQuality(), tierName = (t) => (t === 'low' ? 'Låg' : 'Hög');
    set('opt-gfx', true, q === 'auto' ? `Auto (${tierName(qualityInfo().tier)})` : tierName(q));
    const ctl = !!$('pause')?.classList.contains('ctl');
    set('opt-controls', true, ctl ? 'Dölj' : 'Visa');
    // "Avbryt dagens uppdrag" only while a mission runs and can be given up (not in its intro, outro,
    // a mid-mission scene such as day 6's talk, or after a failure): missions.canGiveUp, like hold-Q.
    const ab = $('opt-abort');
    if (ab) { const on = !!window.__game?.missions?.canGiveUp; if (ab.hidden === on) { ab.hidden = !on; unconfirm(ab); } }
  },

  // ------------------------------------------------------------------------------------------
  // The static part of the minimap, drawn once from the town data. opts.carFreeZones overrides
  // layout's carFreeZones ({x0, z0, x1, z1} rectangles), drawn as Ove's car-free area.

  buildBaseMap(opts = {}) {
    const size = Math.ceil(MAP_EXT * 2 * MAP_SCALE);
    baseMap = document.createElement('canvas');
    baseMap.width = baseMap.height = size;
    const x = baseMap.getContext('2d');
    const W = (v) => (v + MAP_EXT) * MAP_SCALE;
    const S = MAP_SCALE;
    x.fillStyle = MAPC.outside;
    x.fillRect(0, 0, size, size);
    x.fillStyle = MAPC.asphalt;
    x.fillRect(W(-HALF - RHW), W(-HALF - RHW), (2 * HALF + 2 * RHW) * S, (2 * HALF + 2 * RHW) * S);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const type = MAP[j]?.[i];
      x.fillStyle = MAPC.sidewalk;
      x.fillRect(W(rc(i) + RHW), W(rc(j) + RHW), (P - 2 * RHW) * S, (P - 2 * RHW) * S);
      x.fillStyle = MAPC.blocks[type] || MAPC.snow;
      x.fillRect(W(rc(i) + RHW + 3.5), W(rc(j) + RHW + 3.5), (P - 2 * RHW - 7) * S, (P - 2 * RHW - 7) * S);
    }
    // Ove's car-free area.
    const zones = opts.carFreeZones || LAYOUT.carFreeZones || [];
    for (const zn of zones) {
      const x0 = Math.min(zn.x0, zn.x1), z0 = Math.min(zn.z0, zn.z1), w = Math.abs(zn.x1 - zn.x0), d = Math.abs(zn.z1 - zn.z0);
      x.fillStyle = MAPC.carfree;
      x.fillRect(W(x0), W(z0), w * S, d * S);
      x.strokeStyle = MAPC.carfreeEdge; x.lineWidth = 1.2; x.setLineDash([4, 3]);
      x.strokeRect(W(x0) + 0.5, W(z0) + 0.5, w * S - 1, d * S - 1);
      x.setLineDash([]);
    }
    const SKIP = new Set(['bound', 'prop', 'pole', 'tree', 'bounce', 'ramp', 'curb', 'kerb', 'fence', 'hedge', 'sign', 'lamp', 'bench']);
    for (const b of blocks) {
      if (b.shape === CIRCLE && b.kind === 'water') {
        x.fillStyle = MAPC.water;
        x.beginPath(); x.arc(W(b.x), W(b.z), b.r * S, 0, Math.PI * 2); x.fill();
        continue;
      }
      if (b.shape === RAMP || SKIP.has(b.kind)) continue;
      const isBuilding = b.kind === 'building' || b.kind === 'house' || b.kind === 'marquee' || b.kind === 'church';
      const isGarage = b.kind === 'garage' || b.kind === 'shed' || b.kind === 'carport';
      if (b.shape === BOX && (isBuilding || isGarage || (b.top >= 2.4 && b.kind === 'solid'))) {
        const bw = (b.maxX - b.minX) * S, bd = (b.maxZ - b.minZ) * S;
        if (bw < 2 && bd < 2) continue;
        x.fillStyle = isGarage ? MAPC.garage : MAPC.building;
        x.fillRect(W(b.minX), W(b.minZ), bw, bd);
        x.strokeStyle = MAPC.buildingEdge;
        x.lineWidth = 1;
        x.strokeRect(W(b.minX) + 0.5, W(b.minZ) + 0.5, bw - 1, bd - 1);
      }
    }
    // Centre lines: faint dashed white.
    x.strokeStyle = MAPC.centre;
    x.lineWidth = 1;
    x.setLineDash([5, 5]);
    for (let k = 0; k <= N; k++) {
      x.beginPath(); x.moveTo(W(rc(k)), W(-HALF)); x.lineTo(W(rc(k)), W(HALF)); x.stroke();
      x.beginPath(); x.moveTo(W(-HALF), W(rc(k))); x.lineTo(W(HALF), W(rc(k))); x.stroke();
    }
    x.setLineDash([]);
  },

  // ------------------------------------------------------------------------------------------
  // Counters, meter, clock

  setCoins(n) { this.coinEl.textContent = Math.round(n); },
  bumpCoins() { const s = this.status; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); },
  setReports(n) { this.status.classList.add('has-rep'); this.repEl.textContent = n; },
  setClock(text) { this.status.classList.add('has-clock'); if (this._clock !== text) { this._clock = text; this.clockEl.textContent = text; } },

  // The Ordning meter, 0-100 (high = orderly). Jumps of 1 or more show a floating +/- delta.
  setMeter(v) {
    v = clamp(+v || 0, 0, 100);
    const prev = this._meter;
    this._meter = v;
    const r = Math.round(v);
    if (r !== this._meterR) {
      this._meterR = r;
      this.meterVal.textContent = r;
      this.meterFill.style.width = `${v}%`;
      this.meterFill.style.backgroundColor = meterColor(v);
      this.meterEl.classList.toggle('low', v < 20);
    }
    if (prev != null && Math.abs(v - prev) >= 1) {
      const d = Math.round(v - prev);
      if (d) {
        const f = el('div', 'mt-delta ' + (d > 0 ? 'pos' : 'neg'), this.meterEl, (d > 0 ? '+' : '−') + Math.abs(d));
        setTimeout(() => f.remove(), 1500);
        const cls = d > 0 ? 'up' : 'down';
        this.meterEl.classList.remove('up', 'down'); void this.meterEl.offsetWidth; this.meterEl.classList.add(cls);
        clearTimeout(this._meterT);
        this._meterT = setTimeout(() => this.meterEl.classList.remove('up', 'down'), 700);
      }
    }
  },
  // LEGACY, keeps the old Shame meter's polarity: v = shame 0-100, HIGH = BAD (the old shame.js
  // calls setShame(0) when all is well). It shows Ordning = 100 - v. New code calls setMeter()
  // with the Ordning value and never this. The second argument is ignored.
  setShame(v) { this.setMeter(100 - clamp(+v || 0, 0, 100)); },

  // Active smitare chase: { label, bar (0-1: how much fight the smitare has left), dist (m),
  // note?, farAt?, barLabel? } or null. Called every frame: only touches the DOM when a shown
  // value changes.
  setPursuit(o) {
    const e = this.pursuitEl, n = this._pu, c = (this._puC ||= {});
    if (!o) { if (this._pursuit) { e.classList.remove('show'); document.body.classList.remove('pursuit'); this._pursuit = false; } return; }
    if (!this._pursuit) { e.classList.add('show'); document.body.classList.add('pursuit'); this._pursuit = true; }
    const lab = o.label || '';
    if (lab !== c.label) { c.label = lab; n.label.textContent = lab; }
    const bl = o.barLabel || 'Ork';
    if (bl !== c.bl) { c.bl = bl; n.blabel.textContent = bl; }
    const w = Math.round(clamp(o.bar ?? 1, 0, 1) * 100);
    if (w !== c.w) { c.w = w; n.fill.style.width = `${w}%`; }
    const dist = o.dist != null ? `${Math.round(o.dist)} m` : '';
    if (dist !== c.dist) { c.dist = dist; n.dist.textContent = dist; }
    const far = o.dist != null && o.dist > (o.farAt ?? 80);
    if (far !== c.far) { c.far = far; e.classList.toggle('far', far); }
    const note = o.note ?? (far ? 'Tappar spåret' : '');
    if (note !== c.note) { c.note = note; n.note.textContent = note; }
  },

  // The mission objective: { title, text, timer, bar, barLabel, barColor, quiet } or null (quiet:
  // the smaller, fainter free-roam line). Called every frame by main.js: only touches the DOM when
  // a shown value changes.
  setObjective(o) {
    const c = (this._objC ||= {});
    if (!o) { if (c.on) { c.on = false; this.obj.classList.remove('show'); } return; }
    if (!c.on) { c.on = true; this.obj.classList.add('show'); }
    const quiet = !!o.quiet;
    if (quiet !== c.quiet) { c.quiet = quiet; this.obj.classList.toggle('quiet', quiet); }
    const title = o.title || '', text = o.text || '';
    if (title !== c.title) { c.title = title; this.objTitle.textContent = title; }
    if (text !== c.text) { c.text = text; this.objText.textContent = text; }
    const tm = o.timer != null ? fmtTime(o.timer) : null;
    if (tm !== c.tm) { c.tm = tm; this.objTimer.style.display = tm == null ? 'none' : ''; if (tm != null) this.objTimer.textContent = tm; }
    const urgent = o.timer != null && o.timer < 10;
    if (urgent !== c.urgent) { c.urgent = urgent; this.objTimer.classList.toggle('urgent', urgent); }
    const w = o.bar != null ? Math.round(clamp(o.bar, 0, 1) * 100) : -1;
    if (w !== c.w) { c.w = w; this.objBar.style.display = w < 0 ? 'none' : ''; if (w >= 0) this.objBarFill.style.width = `${w}%`; }
    const col = o.bar != null && o.barColor ? o.barColor : '';
    if (col !== c.col) { c.col = col; this.objBarFill.style.background = col ? mutedBarColor(col) : ''; }
    const lab = o.bar != null && o.barLabel ? o.barLabel : '';
    if (lab !== c.lab) { c.lab = lab; this.objBarLabel.textContent = lab; this.objBarLabel.style.display = lab ? '' : 'none'; }
  },

  // The avbrott panel: { title, text, timer (s), bar (0-1), barLabel, kicker? } or null.
  // Called every frame: only touches the DOM when a shown value changes.
  setErrand(o) {
    const e = this.errandEl, n = this._er;
    if (!o) { if (this._erOn) { e.classList.remove('show'); this._erOn = false; this._erC = {}; } return; }
    if (!this._erOn) { e.classList.add('show'); this._erOn = true; }
    const c = (this._erC ||= {});
    const key = `${o.kicker}|${o.title}|${o.text}`;
    if (key !== c.key) {
      c.key = key;
      n.kicker.textContent = o.kicker || 'Avbrott';
      n.title.textContent = o.title || '';
      n.text.textContent = o.text || '';
    }
    // Rune's errand: his cold instead of a timer (o.cold 0..1, o.temp °C, o.danger: the stage's obj())
    const cold = o.cold != null;
    if (cold !== !!c.cold) { c.cold = cold; e.classList.toggle('cold', cold); }
    const tm = cold ? `${(o.temp ?? 36.6).toFixed(1).replace('.', ',')}°` : o.timer != null ? fmtTime(o.timer) : '';
    if (tm !== c.tm) { c.tm = tm; if (cold) n.timer.innerHTML = `${ICON.flake}${tm}`; else n.timer.textContent = tm; }
    const urgent = cold ? !!o.danger : o.timer != null && o.timer < 15;
    if (urgent !== c.urgent) { c.urgent = urgent; n.timer.classList.toggle('urgent', urgent); }
    const w = o.bar != null ? Math.round(clamp(o.bar, 0, 1) * 100) : -1;
    if (w !== c.w) { c.w = w; n.bar.style.display = w < 0 ? 'none' : ''; if (w >= 0) n.fill.style.width = `${w}%`; }
    const lab = o.bar != null && o.barLabel ? o.barLabel : '';
    if (lab !== c.lab) { c.lab = lab; n.label.textContent = lab; n.label.style.display = lab ? '' : 'none'; }
  },

  // ------------------------------------------------------------------------------------------
  // Phone

  // Shows the ringing card. `who` = portrait key (CHARS key), `name` = display name, `sub` = an
  // optional line under the name (e.g. 'Radhus 12'; hidden when empty).
  incomingCall(who, name, sub = '') {
    const c = this.callEl;
    clearTimeout(this._callT);
    c.className = 'card show ringing';
    c.querySelector('img').src = this.portraits[who] || '';
    c.querySelector('.call-name').textContent = name || who || '';
    c.querySelector('.call-kicker').textContent = 'Telefonen ringer';
    c.querySelector('.call-sub').textContent = sub || '';
    this._callWho = who;
    this._callStart = 0;
  },
  // Optional: the call was picked up (stops the pulse, shows a running call timer).
  answerCall() {
    const c = this.callEl;
    if (!c.classList.contains('show')) return;
    c.classList.remove('ringing'); c.classList.add('live');
    c.querySelector('.call-kicker').textContent = 'I samtal';
    this._callStart = performance.now();
    const tick = () => {
      if (!c.classList.contains('live')) return;
      c.querySelector('.call-sub').textContent = fmtTime((performance.now() - this._callStart) / 1000);
      this._callT = setTimeout(tick, 500);
    };
    tick();
  },
  endCall() {
    const c = this.callEl;
    if (!c.classList.contains('show')) return;
    clearTimeout(this._callT);
    c.classList.remove('ringing', 'live'); c.classList.add('ended');
    c.querySelector('.call-kicker').textContent = 'Samtal avslutat';
    this._callT = setTimeout(() => { c.className = 'card'; }, 1200);
  },

  // ------------------------------------------------------------------------------------------
  // Speedometer: a Saab 900 instrument, green-lit needle and numerals on black, km/h.

  setSpeedo(car) {
    if (!car) { if (this._spOn) { this.speedo.classList.remove('show'); this._spOn = false; } return; }
    if (!this._spOn) { this.speedo.classList.add('show'); this._spOn = true; }
    const kmh = Math.abs(car.forwardSpeed) * 3.6;
    const hp = car.spec?.hp ? clamp(car.hp / car.spec.hp, 0, 1) : 1;
    const key = `${Math.round(kmh * 2)}|${Math.round(hp * 16)}`;
    if (key !== this._spKey) { this._spKey = key; drawSpeedo(this, kmh, hp); }
    const sn = car.spec?.name || '';
    const name = (car.name && CAR_NAMES[car.name]) || car.displayName || (sn in SPEC_SV ? SPEC_SV[sn] : sn);
    if (name !== this._spName) { this._spName = name; this.speedo.querySelector('.sp-name').textContent = name; this.speedo.querySelector('.sp-name').style.display = name ? '' : 'none'; }
  },

  // ------------------------------------------------------------------------------------------
  // Prompt, toasts, banners

  // text: HTML (<b>E</b> renders as a key cap). hold: optional 0-1 progress of a held key.
  setPrompt(text, hold = null) {
    const key = text + '|' + (hold == null ? '' : Math.round(hold * 50));
    if (key === this._prompt) return;
    this._prompt = key;
    this.prompt.innerHTML = (text || '') + (hold != null && text ? `<span class="pr-hold"><i style="width:${Math.round(clamp(hold, 0, 1) * 100)}%"></i></span>` : '');
    this.prompt.classList.toggle('show', !!text);
  },

  // While a scene is up (letterbox, curtain, a held shot: see _cineSet) a toast waits in a queue
  // and slides in after it; the element is returned either way.
  toast(text, cls = '', ms = 0) {
    const plain = String(text).replace(/<[^>]*>/g, '');
    const dur = ms || clamp(1800 + plain.length * 45, 2600, 7000);
    // One flex item: plain text with <b> key caps in it must not fall apart into columns.
    const html = /^\s*<(img|div|span class="radio-face")/.test(text) ? text : `<span>${text}</span>`;
    const t = el('div', 'toast card ' + cls, null, html);
    if (this._cine) {
      const q = (this._toastQ ||= []);
      q.push({ t, dur });
      if (q.length > 4) q.shift();
    } else this._showToast(t, dur);
    return t;
  },
  _showToast(t, dur) {
    while (this.toastsEl.children.length >= 4) this.toastsEl.firstChild.remove();
    this.toastsEl.appendChild(t);
    setTimeout(() => t.classList.add('out'), dur);
    setTimeout(() => t.remove(), dur + 600);
  },
  // Fades out the toasts on screen - only those of class `cls` ('phone', 'radio', 'warn', ...) if
  // given - and drops queued ones. missions.begin() clears 'phone' (a call cut short by the intro).
  clearToasts(cls = '') {
    const hit = (t) => !cls || t.classList.contains(cls);
    for (const t of [...this.toastsEl.children]) if (hit(t)) { t.classList.add('out'); setTimeout(() => t.remove(), 600); }
    if (this._toastQ) this._toastQ = this._toastQ.filter((q) => !hit(q.t));
  },
  // A scene is up while the letterbox or the curtain is, or the game holds a shot (game.inDialog:
  // UPPDRAG KLART, the finale), polled every frame from tickBubbles. Then the toast column and the
  // report ticket fade out (`#hud.cine`): what was on screen belonged to the moment before and is
  // dropped; toasts that arrive meanwhile are queued and slide in one by one once the scene is over.
  _cineSet(src, on) {
    const s = (this._cineSrc ||= {});
    if (s[src] === !!on) return;
    s[src] = !!on;
    const cine = !!(s.lb || s.cu || s.dlg);
    if (cine === !!this._cine) return;
    this._cine = cine;
    root?.classList.toggle('cine', cine);
    clearTimeout(this._flushT);
    if (cine) this.clearToasts();
    else if (this._toastQ?.length) {
      const flush = () => {
        if (this._cine) return;
        const q = this._toastQ.shift();
        if (q) this._showToast(q.t, q.dur);
        if (this._toastQ.length) this._flushT = setTimeout(flush, 350);
      };
      this._flushT = setTimeout(flush, 500);
    }
  },
  // A radio / phone message with the speaker's portrait (ms: how long it stays: a voiced line's
  // toast stays while it is said, main.js radio()).
  radio(who, name, text, cls = 'radio', ms = 0) {
    const img = this.portraits[who] ? `<span class="radio-face"><img src="${this.portraits[who]}" alt=""></span>` : '';
    return this.toast(`${img}<div><span class="t-who">${esc(name || who)}</span>${text}</div>`, cls, ms);
  },
  phone(who, name, text, ms = 0) { return this.radio(who, name, text, 'phone', ms); },

  // main: headline; sub: line under it; cls: good | bad | mission | count | stamp | chaos | final
  // (empty = guessed from the text, e.g. "ANMÄLD" -> stamp); ms: auto-hide (0 = stay); kicker:
  // small line above (e.g. "Dag 3").
  showBanner(main, sub = '', cls = '', ms = 2600, kicker = '') {
    clearTimeout(this._bannerT);
    if (!cls) cls = BANNER_AUTO[String(main).trim().toUpperCase()] || '';
    this.banner.className = cls;
    void this.banner.offsetWidth;
    this.banner.className = 'show ' + cls;
    // A stamp is inked onto a paper slip: the slip is .banner-main, the ink a span inside it.
    if (cls === 'stamp') this.banner.querySelector('.banner-main').innerHTML = `<span class="stamp-ink">${esc(main)}</span>`;
    else this.banner.querySelector('.banner-main').textContent = main;
    this.banner.querySelector('.banner-sub').textContent = sub || '';
    this.banner.querySelector('.banner-kicker').textContent = kicker || '';
    if (ms) this._bannerT = setTimeout(() => this.hideBanner(), ms);
  },
  hideBanner() { this.banner.classList.remove('show'); },

  // A full-screen colour flash fading out over `ms`.
  flashColor(color, ms = 700) {
    this.flash.style.background = color;
    this.flash.style.animationDuration = `${Math.max(60, +ms || 700)}ms`;
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
  },

  showCollect(text, ms = 3800) {
    this.collectEl.innerHTML = text;
    this.collectEl.classList.remove('show'); void this.collectEl.offsetWidth;
    this.collectEl.classList.add('show');
    clearTimeout(this._collectT);
    this._collectT = setTimeout(() => this.collectEl.classList.remove('show'), ms);
  },

  // ------------------------------------------------------------------------------------------
  // The cold (game/cold.js, features/avgrunden.md)

  // The cold meter under the Ordning meter: v 0..1 (1: Ove freezes to death); o = { show, temp (the
  // cold Ove feels, deg C), note (a line under the bar), warm (thawing: going down), danger }. Called
  // every frame: only touches the DOM when a shown value changes.
  setCold(v, o = {}) {
    const e = this.coldEl, n = this._co, c = (this._coC ||= {});
    const on = !!o.show;
    if (on !== c.on) { c.on = on; e.classList.toggle('show', on); document.body.classList.toggle('coldhud', on); }
    if (!on) return;
    const w = Math.round(clamp(v, 0, 1) * 200) / 2;
    if (w !== c.w) { c.w = w; n.fill.style.width = `${w}%`; }
    const t = `−${Math.abs(Math.round(o.temp ?? 0))}°`;
    if (t !== c.t) { c.t = t; n.val.textContent = t; }
    const note = o.note || '';
    if (note !== c.note) { c.note = note; n.sub.textContent = note; }
    for (const k of ['warm', 'danger']) if (!!o[k] !== !!c[k]) { c[k] = !!o[k]; e.classList.toggle(k, c[k]); }
  },
  // Frost on the picture, creeping in from its edges: 0 none, 1 most of it, up to 1.6 all of it
  // (white). Quantised: the full-screen mask is repainted only when it changes.
  setFrost(f) {
    const q = Math.round(clamp(f, 0, 1.6) * 100);
    if (q === this._frQ) return;
    this._frQ = q;
    const s = this.frostEl.style, k = q / 100;
    s.opacity = k > 0 ? Math.min(1, k * 2.5).toFixed(3) : '0';
    s.setProperty('--fa', `${Math.max(0, 74 - k * 66).toFixed(1)}%`);
    s.setProperty('--fb', `${Math.max(12, 122 - k * 78).toFixed(1)}%`);
    s.setProperty('--fw', Math.max(0, (k - 1.12) * 1.7).toFixed(3));
  },

  // Ove dead in the snow (game/cold.js): the HUD's chrome fades out as under the curtain.
  deathHud(on) { root?.classList.toggle('dead', !!on); },

  letterbox(on) { $('letterbox').classList.toggle('on', !!on); this._cineSet('lb', on); },
  // A cut: the scene fades to black (0.6 s) with an optional caption ("Senare samma dag"), and back.
  // Over the world and its tags; the HUD (clock, kr, objective, meter, minimap, speedometer, prompt)
  // fades out with the picture (#hud.curtain): only the caption, a banner and the dialogue stay.
  curtain(on, caption = '') {
    const c = $('curtain');
    if (on) c.querySelector('.cu-text').textContent = caption || '';
    c.classList.toggle('on', !!on);
    root?.classList.toggle('curtain', !!on);
    this._cineSet('cu', on);
  },

  // ------------------------------------------------------------------------------------------
  // Dialogue: lines of { who, text }. Resolves when the last line is dismissed.
  // With the voices on, each line is said (voice.js: a clip, or a murmur that takes as long): the
  // text is typed out in time with the speech (the clip's per-character times), and the line is done
  // when the speech is. The first press of the skip key shows the whole text while the voice goes
  // on; the second goes on to the next line (the voice fades out). The test mode's autoDialog waits
  // for the end of the clip and 0.4 s.

  async runDialog(lines, game) {
    this.dialogActive = true;
    this.dialog.classList.add('show');
    voice.prefetch(lines.map((l) => [l.who, l.text]));
    for (const line of lines) {
      if (voice.enabled) { await this._sayLine(line, game); continue; }
      const def = game.charDef(line.who);
      const img = this.dialog.querySelector('img');
      const src = this.portraits[line.who] || '';
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.visibility = src ? '' : 'hidden';
      this.dialog.querySelector('.dlg-name').textContent = def?.name || line.who;
      const textEl = this.dialog.querySelector('.dlg-text');
      textEl.textContent = '';
      game.setTalker(line.who);
      // A line may carry a hook (a camera beat: "Adrian. Den där." frames the car).
      if (line.on) { try { line.on(game); } catch (e) { console.error(e); } }
      let shown = 0;
      const text = line.text;
      let done = false, skipped = false;
      await new Promise((resolve) => {
        // The voice: one soft murmur per word (at most one every 0.22 s), not a blip per letter.
        let acc = 0, sinceVoice = 1;
        const step = (dt) => {
          if (!done) {
            acc += dt * 50;
            sinceVoice += dt;
            const n = Math.min(text.length, Math.floor(acc));
            if (n > shown) {
              let wordStart = false;
              for (let i = shown; i < n; i++) if ((i === 0 || /\s/.test(text[i - 1])) && /[a-zåäöéü0-9]/i.test(text[i])) wordStart = true;
              shown = n;
              textEl.textContent = text.slice(0, shown);
              if (wordStart && sinceVoice >= 0.22) { audio.talk(def?.voice || 300); sinceVoice = 0; }
            }
            if (shown >= text.length) { done = true; game.setTalker(null); }
          }
          if (game.input.pressed('skip')) {
            if (!done) { shown = text.length; textEl.textContent = text; done = true; game.setTalker(null); }
            else { skipped = true; }
          }
          if (skipped || (game.autoDialog && done && (acc += dt * 50) > text.length + 30)) { game.offFrame(step); resolve(); }
        };
        game.onFrame(step);
      });
    }
    game.setTalker(null);
    this.dialog.classList.remove('show');
    this.dialogActive = false;
  },
  async _sayLine(line, game) {
    const def = game.charDef(line.who);
    const img = this.dialog.querySelector('img');
    const src = this.portraits[line.who] || '';
    if (img.getAttribute('src') !== src) img.src = src;
    img.style.visibility = src ? '' : 'hidden';
    this.dialog.querySelector('.dlg-name').textContent = def?.name || line.who;
    const textEl = this.dialog.querySelector('.dlg-text');
    textEl.textContent = '';
    game.setTalker(line.who);
    if (line.on) { try { line.on(game); } catch (e) { console.error(e); } }
    const text = line.text;
    const u = voice.play(line.who, text, { slot: 'main', mode: 'dialog', now: true });
    let shown = 0, full = false, after = 0;
    await new Promise((resolve) => {
      const step = (dt) => {
        const speaking = u && (u.state === 'playing' || u.state === 'queued');
        if (!full) {
          // In time with the clip's characters; a murmur (or no voice at all) types at 50 chars/s.
          const s = u && u.t0 != null ? voice.now() - u.t0 : 0;
          const t = u?.clip?.t;
          let n = t ? 0 : Math.floor(s * 50);
          if (t) while (n < t.length && t[n] <= s * 100) n++;
          if (!speaking) n = text.length;
          n = Math.min(text.length, n);
          if (n > shown) { shown = n; textEl.textContent = text.slice(0, shown); }
          if (shown >= text.length) full = true;
        }
        if (!speaking) { game.setTalker(null); after += dt; }
        if (game.input.pressed('skip')) {
          if (!full) { full = true; shown = text.length; textEl.textContent = text; }
          else { u?.stop(0.08); game.offFrame(step); resolve(); return; }
        }
        if (game.autoDialog && !speaking && after >= 0.4) { game.offFrame(step); resolve(); }
      };
      game.onFrame(step);
    });
    game.setTalker(null);
  },

  // Speech bubbles over characters in the world. Returns the bubble: main.js hangs the line's voice
  // on it (item.u), and a bubble stays up while its voice waits its turn or is being said.
  say(target, text, secs = 2) {
    const b = el('div', 'bubble', this.bubbles, text);
    const item = { b, target, until: performance.now() + secs * 1000, u: null };
    (this._bubbles ||= []).push(item);
    return item;
  },
  // A cutscene starts: small talk from a moment ago doesn't hang over it (nor its voice, unless
  // keepVoice: the line being said is said to the end, and what waits is dropped).
  clearBubbles(keepVoice = false) {
    for (const it of this._bubbles || []) it.b.remove();
    if (this._bubbles) this._bubbles.length = 0;
    if (keepVoice) voice.unqueue((q) => q.slot === 'bubble'); else voice.stop('bubble');
  },
  tickBubbles() {
    // (called every frame by main.js: also where a held shot without letterbox is noticed)
    this._cineSet('dlg', !!window.__game?.inDialog);
    const list = this._bubbles || [];
    if (!list.length) return;
    const now = performance.now();
    const v = _v;
    const W = window.innerWidth, H = window.innerHeight;
    for (let k = list.length - 1; k >= 0; k--) {
      const it = list[k];
      if (now > it.until && !(it.u && (it.u.state === 'queued' || it.u.state === 'playing'))) { it.b.remove(); list.splice(k, 1); continue; }
      const t = it.target;
      v.set(t.x, t.y + (t.height || 1.8) + 0.45, t.z);
      v.project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { it.b.style.display = 'none'; continue; }
      it.b.style.display = '';
      // The bubble is zoomed by --ui, which also scales its translate: divide it out. It is kept
      // whole on screen (clear of the status strip at the top); the tail still points at the
      // speaker.
      const u = this.ui || 1, Wu = W / u, Hu = H / u;
      if (!it.w) { const r = it.b.getBoundingClientRect(); it.w = r.width / u; it.h = r.height / u; }
      const ax = (v.x * 0.5 + 0.5) * Wu, ay = (-v.y * 0.5 + 0.5) * Hu;
      const x = it.w + 16 < Wu ? clamp(ax, it.w / 2 + 8, Wu - it.w / 2 - 8) : Wu / 2;
      const y = clamp(ay, it.h + 70, Hu - 8);
      const tail = clamp(ax - x, -it.w / 2 + 12, it.w / 2 - 12);
      if (tail !== it.tail) { it.tail = tail; it.b.style.setProperty('--tail-dx', `${tail.toFixed(1)}px`); }
      it.b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  },

  // World-anchored labels, called every frame with [{ x, y, z, text, cls }] (cls: violation |
  // smitare | reported | neighbour | errand | plain). Off-screen / behind-camera items are hidden;
  // far ones shrink, and the background ones (reported, plain, neighbour) also fade. The things
  // Ove is hunting stay readable at any distance. Identical labels that would sit on top of each
  // other (two cars on the same walkway) become one: "2 × BIL I BILFRITT OMRÅDE". Pass [] or null to
  // clear. Nothing here allocates per frame once the pools have grown.
  tags(list) {
    const pool = this._tagPool;
    const W = window.innerWidth, H = window.innerHeight;
    const cp = camera.position;
    const u = this.ui || 1;
    const items = (this._tagItems ||= []);
    const placed = (this._tagPlaced ||= []);
    placed.length = 0;
    let ni = 0;
    if (list) for (const t of list) {
      _v.set(t.x, t.y, t.z).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.08 || Math.abs(_v.y) > 1.08) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const d = Math.hypot(t.x - cp.x, t.y - cp.y, t.z - cp.z);
      // the same label close by on screen: count it in, keep the nearer one's place
      let same = null;
      for (let k = 0; k < ni; k++) {
        const q = items[k];
        if (q.text === t.text && q.cls === (t.cls || 'plain') && Math.abs(q.x - x) < 120 * u && Math.abs(q.y - y) < 46 * u) { same = q; break; }
      }
      if (same) { same.n++; if (d < same.d) { same.x = x; same.y = y; same.d = d; same.op = t.opacity; } continue; }
      const it = items[ni] || (items[ni] = {});
      ni++;
      it.text = t.text; it.cls = t.cls || 'plain'; it.x = x; it.y = y; it.d = d; it.n = 1; it.op = t.opacity;
    }
    for (let k = 0; k < ni; k++) {
      const t = items[k];
      let e = pool[k];
      if (!e) {
        e = el('div', 'tag3d', this.tagsEl, '<span><i></i><em></em></span>');
        e._em = e.querySelector('em'); e._em.style.fontStyle = 'normal';
        e._pl = { e, x: 0, y: 0, w: 0, h: 0, d: 0, sc: 1 };
        pool.push(e);
      }
      const cls = 'tag3d ' + t.cls;
      if (e._cls !== cls) { e._cls = cls; e.className = cls; }
      const text = t.n > 1 ? `${t.n} × ${t.text}` : t.text;
      if (e._text !== text) { e._text = text; e._em.textContent = text; e._w = 0; }
      const lim = TAG_FADE[t.cls] || TAG_FADE.plain;
      const op = t.op ?? clamp(1.25 - t.d / 40, lim[0], 1);
      const sc = clamp(1.12 - t.d / 90, lim[1], 1);
      if (e.style.display) e.style.display = '';
      const ops = op.toFixed(2);
      if (e._op !== ops) { e._op = ops; e.style.opacity = ops; }
      const z = 1000 - Math.round(t.d);
      if (e._z !== z) { e._z = z; e.style.zIndex = String(z); }
      // Unscaled on-screen size, measured once per text (the label is zoomed by --ui).
      if (!e._w) { const r = e.firstChild.getBoundingClientRect(); const k2 = e._sc || 1; e._w = r.width / k2 || 120 * u; e._h = r.height / k2 || 22 * u; }
      const pl = e._pl;
      pl.x = t.x; pl.y = t.y; pl.w = e._w * sc; pl.h = e._h * sc; pl.d = t.d; pl.sc = sc;
      placed.push(pl);
    }
    // Labels that would overlap (JIMMY on top of BIL I BILFRITT OMRÅDE): the nearer one stays,
    // a farther one moves up above it (at most three labels' worth).
    placed.sort(byDist);
    for (let i = 0; i < placed.length; i++) {
      const it = placed[i], y0 = it.y;
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const q = placed[j];
          if (Math.abs(it.x - q.x) < (it.w + q.w) / 2 + 4 && it.y > q.y - q.h - 3 && it.y - it.h < q.y + 3) { it.y = q.y - q.h - 4; moved = true; }
        }
        if (!moved) break;
      }
      it.y = Math.max(it.y, y0 - 3 * (it.h + 4));
      const e = it.e;
      e._sc = it.sc;
      e.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) scale(${it.sc.toFixed(3)})`;
    }
    for (let k = ni; k < pool.length; k++) if (pool[k].style.display !== 'none') pool[k].style.display = 'none';
  },

  // ------------------------------------------------------------------------------------------
  // Minimap: the base map shifted and turned so the camera's forward is up.

  drawMinimap(px, pz, camYaw, playerYaw, markers, route) {
    // Drawn in a 420x420 logical space (2x the 210 css px); the backing store follows the screen's
    // pixel ratio times the HUD zoom so it stays sharp at 1080p and up.
    const want = Math.round(210 * clamp((window.devicePixelRatio || 1) * (this.ui || 1), 2, 4));
    if (mapCanvas.width !== want) mapCanvas.width = mapCanvas.height = want;
    const c = mapCtx, S = 420, R = S / 2;
    c.setTransform(want / S, 0, 0, want / S, 0, 0);
    const k = S / 220 * 1.25; // canvas px per metre (the canvas is drawn at 2x)
    const t = performance.now() / 1000;
    const RM = R - 13;        // the map disc; outside it a white rim and a dark outer ring
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(R, R, RM, 0, Math.PI * 2); c.clip();
    c.fillStyle = MAPC.outside; c.fillRect(0, 0, S, S);
    c.translate(R, R);
    c.rotate(camYaw + Math.PI);
    c.scale(k / MAP_SCALE, k / MAP_SCALE);
    if (baseMap) c.drawImage(baseMap, -(px + MAP_EXT) * MAP_SCALE, -(pz + MAP_EXT) * MAP_SCALE);
    c.restore();
    c.save();
    c.beginPath(); c.arc(R, R, RM, 0, Math.PI * 2); c.clip();
    // A soft vignette towards the rim.
    const vg = c.createRadialGradient(R, R, RM * 0.62, R, R, RM);
    vg.addColorStop(0, 'rgba(20,24,28,0)'); vg.addColorStop(1, 'rgba(20,24,28,0.22)');
    c.fillStyle = vg; c.fillRect(0, 0, S, S);
    c.translate(R, R);
    c.rotate(camYaw + Math.PI);
    if (route && route.length > 1) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(0, 0);
      for (const [x, z] of route) c.lineTo((x - px) * k, (z - pz) * k);
      c.strokeStyle = 'rgba(27,31,36,0.55)'; c.lineWidth = 9; c.stroke();
      c.strokeStyle = '#f0b24a'; c.lineWidth = 5; c.stroke();
    }
    for (const m of markers || []) {
      let x = (m.x - px) * k, y = (m.z - pz) * k;
      const d = Math.hypot(x, y), lim = RM - 16;
      const clamped = d > lim;
      if (clamped) { if (!m.edge) continue; x *= lim / d; y *= lim / d; }
      c.save();
      c.translate(x, y);
      c.rotate(-(camYaw + Math.PI));
      // The things Ove is out to find are drawn a size larger than the rest.
      drawMarker(c, m, clamped, m.type === 'violation' || m.type === 'smitare' ? 2.5 : 2, t);
      c.restore();
    }
    c.restore();
    // Player arrow (always up = camera forward, turned by facing relative to the camera).
    c.save();
    c.translate(R, R);
    c.rotate(-(playerYaw - camYaw));
    drawPlayerArrow(c, 2);
    c.restore();
    // Rim: a thin white line round the map, then a dark ring (reads over snow and over asphalt).
    c.beginPath(); c.arc(R, R, R - 6.5, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(19,23,27,0.78)'; c.lineWidth = 13; c.stroke();
    c.beginPath(); c.arc(R, R, RM, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(241,242,238,0.95)'; c.lineWidth = 3; c.stroke();
    // North marker orbiting on the dark ring. North is +z in the world (DESIGN 6: the low November
    // sun then stands in the south-west, as it does in the early afternoon).
    const n = this._north ||= root.querySelector('.mm-n');
    const a = camYaw, rr = 210 / 2 - 3.5;
    n.style.transform = `translate(${(Math.cos(a - Math.PI / 2) * rr).toFixed(1)}px, ${(Math.sin(a - Math.PI / 2) * rr).toFixed(1)}px)`;
  },

  toggleBigMap(on, game) {
    this.bigmap.classList.toggle('show', on);
    document.body.classList.toggle('bigmap-open', !!on);
    if (!on || !baseMap) return;
    const cv = this.bigmap.querySelector('canvas');
    const c = cv.getContext('2d');
    const t = performance.now() / 1000;
    // Crop to the town itself, north up (north is +z: the base map, drawn with -z up, is turned
    // half a turn).
    const E = HALF + 16, S = cv.width, k = S / (2 * E);
    c.clearRect(0, 0, S, S);
    c.imageSmoothingQuality = 'high';
    c.save(); c.translate(S, S); c.rotate(Math.PI);
    c.drawImage(baseMap, (MAP_EXT - E) * MAP_SCALE, (MAP_EXT - E) * MAP_SCALE, 2 * E * MAP_SCALE, 2 * E * MAP_SCALE, 0, 0, S, S);
    c.restore();
    const toC = (x, z) => [S - (x + E) * k, S - (z + E) * k];
    const markers = (game.mapMarkers?.(true) || []).map((m) => [m, toC(m.x, m.z)]);
    const p = game.focus();
    const [x, y] = toC(p.x, p.z);
    const L100 = 100 * k;
    // Place names. Each is tried above, below, right and left of its place (then further above /
    // below) and goes where it overlaps no other name and, if possible, no marker, the player, the
    // scale bar or the north arrow; a name that fits nowhere is left out. Names are drawn first and
    // the markers on top, so a name never hides a marker.
    // (The 1100 px canvas is shown at ~576 px on a 720p screen: labels are drawn large.)
    c.font = '600 25px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.letterSpacing = '0px';
    const LS = 2;
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    // What a name should not cover, with a weight: the player arrow most of all.
    const blocked = markers.map(([, [mx, my]]) => [mx - 17, my - 17, mx + 17, my + 17, 1]);
    blocked.push([x - 26, y - 26, x + 26, y + 26, 4], [0, S - 70, L100 + 50, S, 2], [S - 115, 0, S, 125, 2]);
    const placed = [];
    for (const [name, lx, lz] of game.mapLabels?.() || []) {
      const [x0, y0] = toC(lx, lz);
      const txt = String(name).toUpperCase();
      // Width with the letter spacing and the 3 px halo on each side, plus a little air.
      const w = c.measureText(txt).width + LS * txt.length + 14, h = 30;
      const spots = [[0, -22], [0, 24], [w / 2 + 18, 0], [-w / 2 - 18, 0], [0, -48], [0, 50], [w / 2 + 10, -30], [-w / 2 - 10, -30], [w / 2 + 10, 32], [-w / 2 - 10, 32]].map(([dx, dy]) => {
        const cx = x0 + dx, cy = y0 + dy;
        return [cx, cy, [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]];
      }).filter(([, , r]) => r[0] > 2 && r[1] > 2 && r[2] < S - 2 && r[3] < S - 2 && !placed.some((q) => hit(q[3], r)));
      // The first spot that covers nothing, else the one that covers the least.
      let best = null, bestCost = Infinity;
      for (const sp of spots) {
        let cost = 0;
        for (const b of blocked) if (hit(b, sp[2])) cost += b[4];
        if (cost < bestCost) { best = sp; bestCost = cost; if (!cost) break; }
      }
      if (best) placed.push([txt, best[0], best[1], best[2]]);
    }
    c.letterSpacing = `${LS}px`;
    for (const [txt, lx, ly] of placed) {
      c.strokeStyle = 'rgba(244,245,243,0.92)'; c.lineWidth = 6; c.strokeText(txt, lx, ly);
      c.fillStyle = '#2b3036'; c.fillText(txt, lx, ly);
    }
    c.letterSpacing = '0px';
    for (const [m, [mx, my]] of markers) { c.save(); c.translate(mx, my); drawMarker(c, m, false, 1.9, t); c.restore(); }
    c.save(); c.translate(x, y); c.rotate(-p.yaw); drawPlayerArrow(c, 2.1); c.restore();
    // Scale bar: 100 m.
    c.save();
    c.translate(28, S - 30);
    c.fillStyle = 'rgba(244,245,243,0.88)'; c.fillRect(-12, -34, L100 + 24, 48);
    c.strokeStyle = '#1b1f24'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(0, 0); c.lineTo(L100, 0); c.lineTo(L100, -8); c.stroke();
    c.fillStyle = '#1b1f24'; c.font = '600 22px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center';
    c.fillText('100 m', L100 / 2, -15);
    c.restore();
    // Legend: collectibles (new names first, old ones as a fallback).
    const got = game.got || {};
    const em = got.emblems ?? got.records, ph = got.photos ?? got.mosquitoes;
    const n = (s) => (s?.size ?? s?.length ?? 0);
    const reps = game.reports ?? game.patrol?.reports;
    // The legend's symbols are drawn by the same code as the map's markers.
    const icon = (type) => `<canvas class="lg" data-t="${type}" width="44" height="44"></canvas>`;
    const lg = this.bigmap.querySelector('.bm-legend');
    lg.innerHTML = [
      '<span><kbd>M</kbd> stäng</span>',
      `<span>${icon('mission')}uppdrag</span>`,
      `<span>${icon('violation')}felparkering</span>`,
      `<span>${icon('smitare')}smitare</span>`,
      `<span>${icon('errand')}avbrott</span>`,
      `<span>${icon('neighbour')}granne</span>`,
      em ? `<span>${icon('emblem')}Saab-emblem <b>${n(em)}/7</b></span>` : '',
      ph ? `<span>${icon('photo')}Sonjas fotografier <b>${n(ph)}/7</b></span>` : '',
      reps != null ? `<span>Anmälningar <b>${typeof reps === 'number' ? reps : n(reps)}</b></span>` : '',
    ].join('');
    for (const cvl of lg.querySelectorAll('canvas.lg')) {
      const x2 = cvl.getContext('2d');
      x2.translate(22, 22);
      drawMarker(x2, { type: cvl.dataset.t }, false, 2.2, 0.4);
    }
  },

  // ------------------------------------------------------------------------------------------
  // Ove's notebook in the pause menu: entries { plate, kind, text, time, caught?, escaped? },
  // oldest first. caught = a smitare who was caught ("tagen"); escaped = one who got away ("smet":
  // struck through, no tick).

  renderLog(entries) {
    this._log = entries || this._log || [];
    const page = $('pause-log');
    if (!page) return;
    const list = this._log;
    const rows = list.slice(-60).map((e) => {
      const cls = e.escaped ? ' escaped' : e.caught ? ' caught' : '';
      const note = e.escaped ? ' <small>(smet)</small>' : e.caught ? ' <small>(tagen)</small>' : '';
      return `<div class="log-entry${cls}"><span class="le-time">${esc(nbTime(e.time))}</span><span class="le-plate">${esc(e.plate || '')}</span><span class="le-text"><span class="le-t">${esc(kindShort(e.kind) || e.text || e.kind || '')}</span>${note}</span><span class="le-mark">${e.escaped ? '–' : TICK_SVG}</span></div>`;
    }).join('');
    const done = list.filter((e) => !e.escaped).length;
    page.innerHTML = `<div class="log-head">Oves anteckningsbok</div><div class="log-sub">${list.length ? `Anmälda felparkeringar: ${done}` : 'Anmälda felparkeringar'}</div>${rows || '<div class="log-empty">Inga anteckningar än.<br>Misstänkt lugnt.</div>'}`;
    // Shrink the handwriting of entries that do not fit their line (only measurable when shown).
    if (page.offsetParent) for (const t of page.querySelectorAll('.le-text')) fitWidth(t, 14);
    page.scrollTop = page.scrollHeight;
  },

  // ------------------------------------------------------------------------------------------
  // The reporting notebook: show({ plate, kind, text, place, time, no? }) -> progress(0..1) ->
  // done() (ANMÄLD stamp) or cancel(reason). Plays no sounds itself (see notes/ui.md).

  notebook: {
    open: false,
    _init(node) {
      this.node = node;
      this.page = node.querySelector('.nb-page');
      this.pencil = node.querySelector('.nb-pencil');
      this.fields = {};
      for (const f of node.querySelectorAll('[data-f]')) this.fields[f.dataset.f] = f;
    },
    show(o = {}) {
      if (!this.node) return;
      clearTimeout(this._t1); clearTimeout(this._t2);
      const vals = {
        plate: o.plate || '',
        place: o.place || 'Inom området',
        time: nbTime(o.time),
        text: o.text || kindText(o.kind) || o.kind || '',
        sign: 'Ove',
      };
      const KEYS = ['plate', 'place', 'time', 'text', 'sign'];
      for (const key of KEYS) {
        const f = this.fields[key];
        f.innerHTML = '';
        for (const ch of vals[key]) {
          const s = document.createElement('span');
          s.className = ch === ' ' ? 'c on' : 'c';
          s.textContent = ch;
          f.appendChild(s);
        }
      }
      // Every value is written on its ruled line(s): long ones shrink, then take another line (the
      // page grows by a rule), and only as a last resort are cut with "…" (see NB_FIT). Done before
      // progress(0) so the pencil starts in the right place.
      for (const key of Object.keys(NB_FIT)) fitNb(this.fields[key], NB_FIT[key]);
      this.chars = [];
      for (const key of KEYS) for (const s of this.fields[key].children) if (s.textContent !== ' ') this.chars.push(s);
      this.node.querySelector('.nb-no b').textContent = o.no != null ? `Nr ${o.no}` : '';
      this.node.querySelector('.nb-stamp-t').textContent = vals.time ? `KL. ${vals.time}` : '';
      this.node.querySelector('.nb-reason').textContent = '';
      this.node.className = 'show writing';
      document.body.classList.add('nb-open');
      this.shown = 0;
      this.open = true;
      this.progress(0);
    },
    // p: 0..1 of the writing. The text is written by ~0.92, the signature in the rest.
    progress(p) {
      if (!this.open || !this.chars) return;
      const n = Math.round(clamp(p / 0.97, 0, 1) * this.chars.length);
      if (n === this.shown && this._pencilSet) return;
      for (let i = this.shown; i < n; i++) this.chars[i].classList.add('on');
      for (let i = n; i < this.shown; i++) this.chars[i].classList.remove('on');
      this.shown = n;
      // Pencil tip at the end of the last written character.
      const last = this.chars[Math.max(0, n - 1)];
      if (last) {
        let x = last.offsetLeft + (n ? last.offsetWidth : 0), y = last.offsetTop + last.offsetHeight * 0.78;
        let p2 = last.offsetParent;
        while (p2 && p2 !== this.page) { x += p2.offsetLeft; y += p2.offsetTop; p2 = p2.offsetParent; }
        this.pencil.style.transform = `translate(${x.toFixed(1)}px, ${(y - 7).toFixed(1)}px) rotate(-38deg)`;
        this._pencilSet = true;
      }
    },
    done() {
      if (!this.open) return;
      this.progress(1);
      this.node.classList.remove('writing');
      this.node.classList.add('stamped', 'thump');
      this._t1 = setTimeout(() => this._leave(), 1700);
    },
    cancel(reason = '') {
      if (!this.open) return;
      this.node.classList.remove('writing');
      this.node.classList.add('cancelled');
      this.node.querySelector('.nb-reason').textContent = reason ? `Avbrutet – ${reason}` : 'Avbrutet';
      this._t1 = setTimeout(() => this._leave(), 1400);
    },
    hide() { if (this.open) this._leave(); },
    _leave() {
      this.open = false;
      this._pencilSet = false;
      this.node.classList.add('leave');
      document.body.classList.remove('nb-open');
      this._t2 = setTimeout(() => { if (!this.open) this.node.className = ''; }, 700);
    },
  },
};

const _v = new THREE.Vector3();

// How each notebook value is fitted onto the ruled page: a list of [lines, smallest px] tried in
// order, each from the CSS size down. A place name gets one line down to 19 px, then two lines;
// the violation text two lines down to 17 px, then three. Whatever still does not fit (well over
// 80 / 150 characters) is cut with "…".
const NB_FIT = { plate: [[1, 15]], time: [[1, 15]], place: [[1, 19], [2, 16]], text: [[2, 17], [3, 15]] };
const NB_RULE = 30; // px between the notebook's ruled lines (one row)
// Frost on the inside of a cold window, for the edges of the picture (hud.setFrost): ferns of ice that
// grow in from the edges (a stem, side branches at about 60 degrees and theirs, thinning out), drawn
// twice (blurred under sharp), over a soft rime that is thickest at the edges. Made once, at load.
function frostCanvas() {
  const W = 1280, H = 720, A = document.createElement('canvas');
  A.width = W; A.height = H;
  const x = A.getContext('2d');
  let seed = 90210;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(238, 246, 255, 0.6)';
  const fern = (px, py, a, len, w, depth) => {
    const n = Math.max(2, Math.floor(len / 10));
    for (let i = 0; i < n; i++) {
      a += (r() - 0.5) * 0.22;
      const qx = px + Math.cos(a) * len / n, qy = py + Math.sin(a) * len / n;
      x.lineWidth = Math.max(0.6, w * (1 - (i / n) * 0.7));
      x.beginPath(); x.moveTo(px, py); x.lineTo(qx, qy); x.stroke();
      if (depth > 0 && r() < 0.75) {
        const side = r() < 0.5 ? 1 : -1, bl = len * (0.22 + r() * 0.3) * (1 - i / n);
        fern(qx, qy, a + side * (1.0 + r() * 0.2), bl, w * 0.65, depth - 1);
        if (r() < 0.45) fern(qx, qy, a - side * (1.0 + r() * 0.2), bl * 0.8, w * 0.65, depth - 1);
      }
      px = qx; py = qy;
    }
  };
  for (let k = 0; k < 130; k++) {
    const e = Math.floor(r() * 4), t = r();
    const [px, py, a0] = e === 0 ? [t * W, -4, Math.PI / 2] : e === 1 ? [t * W, H + 4, -Math.PI / 2] : e === 2 ? [-4, t * H, 0] : [W + 4, t * H, Math.PI];
    fern(px, py, a0 + (r() - 0.5) * 1.5, 50 + r() * 230, 1.4 + r() * 1.3, 2);
  }
  const C = document.createElement('canvas');
  C.width = W; C.height = H;
  const y = C.getContext('2d');
  const g = y.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(226, 238, 250, 0)');
  g.addColorStop(0.6, 'rgba(226, 238, 250, 0.16)');
  g.addColorStop(1, 'rgba(236, 244, 252, 0.72)');
  y.fillStyle = g; y.fillRect(0, 0, W, H);
  y.filter = 'blur(4px)'; y.drawImage(A, 0, 0); y.filter = 'none';
  y.drawImage(A, 0, 0);
  return C;
}

// Ove writes the time the Swedish way, 06.42 (the digital clock on the HUD keeps its colon).
function nbTime(t) { return String(t || '').replace(':', '.'); }
// A hand-drawn tick in the stamp's red (the ✓ glyph isn't in the embedded fonts).
const TICK_SVG = '<svg class="le-tick" viewBox="0 0 22 18" aria-hidden="true"><path d="M2.5 9.6 C 4.2 10.4, 6 12.6, 7.6 15.4 C 10.2 9.8, 14.2 5.1, 19.8 2.2"/></svg>';

function fitNb(val, spec) {
  const row = val.parentElement, label = row.querySelector('label');
  const chars = val.children;
  if (!chars.length) { row.style.height = ''; row.classList.remove('wrap'); return; }
  val.style.fontSize = '';
  const base = parseFloat(getComputedStyle(val).fontSize);
  // offset* values are layout px (no transforms), all in the same units, so this also works with
  // the notebook rotated and the HUD zoomed.
  const lineOf = (s, n) => Math.floor((s.offsetTop + s.offsetHeight / 2) / (row.offsetHeight / n));
  const fits = (n) => val.offsetWidth <= row.clientWidth - label.offsetWidth + 0.5 && lineOf(chars[0], n) === 0 && lineOf(chars[chars.length - 1], n) <= n - 1;
  const lines = (n) => { row.style.height = `${n * NB_RULE}px`; row.classList.toggle('wrap', n > 1); };
  for (const [n, min] of spec) {
    lines(n);
    for (let fs = base; ; fs = Math.max(min, fs - 1)) {
      val.style.fontSize = `${fs}px`;
      if (fits(n)) return;
      if (fs <= min) break;
    }
  }
  // Still too long at the smallest size: cut it.
  const ell = document.createElement('span');
  ell.className = 'c'; ell.textContent = '…';
  val.appendChild(ell);
  while (chars.length > 2 && !fits(spec[spec.length - 1][0])) {
    val.removeChild(ell.previousSibling);
    while (chars.length > 2 && ell.previousSibling.textContent === ' ') val.removeChild(ell.previousSibling);
  }
}

// Shrinks an element's font size (down to `min` px) until its content fits its width.
function fitWidth(e, min = 14) {
  e.style.fontSize = '';
  const cw = e.clientWidth;
  if (!cw || e.scrollWidth <= cw + 0.5) return;
  const base = parseFloat(getComputedStyle(e).fontSize);
  let fs = Math.max(min, Math.floor(base * cw / e.scrollWidth * 10) / 10);
  e.style.fontSize = `${fs}px`;
  // One correction pass: letter-spacing and kerning do not scale exactly linearly.
  if (fs > min && e.scrollWidth > cw + 0.5) { fs = Math.max(min, fs * cw / e.scrollWidth - 0.3); e.style.fontSize = `${fs.toFixed(1)}px`; }
}
function loadFonts() {
  if (!document.fonts?.load) return Promise.resolve();
  const want = ['500 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '400 20px "Barlow"', '500 20px "Barlow"', '600 20px "Barlow"', 'italic 400 20px "Barlow"', '600 20px "Caveat"'];
  return Promise.race([
    Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).then(() => undefined);
}

// Ordning colour: muted red (chaos) -> amber -> sage green (order).
function meterColor(v) {
  const stops = [[0, [196, 72, 61]], [35, [217, 164, 65]], [65, [190, 186, 120]], [100, [141, 180, 135]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (v >= stops[i][0] && v <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const t = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
// Mission code passes candy colours for bars; mute them towards the HUD palette.
function mutedBarColor(c) {
  const m = String(c).match(/^#?([0-9a-f]{6})$/i);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const grey = (r + g + b) / 3;
  const f = (x) => Math.round(x * 0.62 + grey * 0.38);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// ---------------------------------------------------------------------------------------------
// Map markers. s = scale, t = time (s) for pulsing ones.

function drawPlayerArrow(c, s) {
  c.scale(s, s);
  c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 7); c.lineTo(0, 3.2); c.lineTo(-7, 7); c.closePath();
  c.lineJoin = 'round';
  c.strokeStyle = '#ffffff'; c.lineWidth = 3.2; c.stroke();
  c.fillStyle = '#2f6fc0'; c.fill();
  c.strokeStyle = 'rgba(27,31,36,0.6)'; c.lineWidth = 0.8; c.stroke();
}

function drawMarker(c, m, clamped, scale = 1, t = 0) {
  c.scale(scale, scale);
  const ring = (r, fill, stroke = '#ffffff', w = 1.6) => { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = w; c.stroke(); } };
  const diamond = (r, fill, stroke = '#ffffff', w = 1.6) => { c.beginPath(); c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = w; c.stroke(); } };
  switch (m.type) {
    case 'mission': {
      diamond(7.5, '#f0b24a', '#1b1f24', 1.3);
      c.fillStyle = '#1b1f24'; c.fillRect(-0.9, -4, 1.8, 4.6); c.fillRect(-0.9, 2, 1.8, 1.8);
      break;
    }
    case 'objective': {
      const p = 0.5 + 0.5 * Math.sin(t * 4);
      ring(6.5 + p * 2.5, null, `rgba(240,178,74,${0.55 - p * 0.4})`, 1.4);
      diamond(6, '#f0b24a', '#ffffff', 1.5);
      ring(1.6, '#1b1f24', null);
      break;
    }
    case 'enemy': ring(4.6, '#c4483d'); break;
    case 'friend': ring(4.6, '#4fa38c'); break;
    case 'neighbour': ring(3.6, '#4fa38c', '#ffffff', 1.3); break;
    case 'errand': {
      const p = 0.5 + 0.5 * Math.sin(t * 3);
      ring(7 + p * 2, null, `rgba(240,178,74,${0.5 - p * 0.35})`, 1.2);
      ring(5.2, '#ffffff', '#f0b24a', 2.6);
      ring(1.7, '#1b1f24', null);
      break;
    }
    case 'violation': {
      // A tiny P-förbud sign: blue disc, red ring, red diagonal.
      ring(5.4, '#2f6096', '#d0463b', 2);
      c.strokeStyle = '#d0463b'; c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(-3.6, -3.6); c.lineTo(3.6, 3.6); c.stroke();
      ring(6.5, null, 'rgba(255,255,255,0.9)', 1);
      break;
    }
    case 'smitare': {
      const p = (t * 1.6) % 1;
      ring(5 + p * 7, null, `rgba(208,70,59,${0.8 * (1 - p)})`, 1.6);
      diamond(5.2, '#d0463b', '#ffffff', 1.5);
      break;
    }
    case 'emblem': case 'record': {
      // A round car badge: silver with a red centre.
      ring(4.8, '#c9ced3', '#ffffff', 1.4);
      ring(4.8, null, 'rgba(27,31,36,0.55)', 0.7);
      ring(2.3, '#a8322a', null);
      break;
    }
    case 'photo': {
      // A small print with a white border, a little askew.
      c.rotate(-0.16);
      c.fillStyle = '#fbfaf6'; c.fillRect(-4.3, -5.2, 8.6, 10.4);
      c.strokeStyle = 'rgba(27,31,36,0.75)'; c.lineWidth = 0.9; c.strokeRect(-4.3, -5.2, 8.6, 10.4);
      c.fillStyle = '#9c8463'; c.fillRect(-3, -3.9, 6, 6);
      break;
    }
    case 'collectible': {
      c.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 1.6 : 4.4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = 'rgba(27,31,36,0.7)'; c.lineWidth = 0.9; c.stroke();
      break;
    }
    case 'mosquito': ring(2.6, '#7d8a5a', 'rgba(255,255,255,0.8)', 1); break;
    case 'item': ring(4, '#ffffff', '#1b1f24', 1.4); break;
    default: ring(3.4, '#ffffff', '#1b1f24', 1.2);
  }
}

// ---------------------------------------------------------------------------------------------
// Saab 900-style speedometer (canvas). The face is cached; the needle redrawn on change.

const SP = { vmax: 200, a0: Math.PI * 0.75, sweep: Math.PI * 1.5 };
// Instrument light: a soft, slightly desaturated green (the old Saab 900 cluster at dusk), with only
// a hint of glow so it reads as a lit gauge in daylight, not neon.
const SPC = { lit: '#b9e8a0', tick: 'rgba(185, 232, 160, 0.92)', dim: 'rgba(185, 232, 160, 0.55)', glow: 'rgba(170, 225, 140, 0.55)', off: 'rgba(185, 232, 160, 0.12)' };
function drawSpeedo(h, kmh, hp) {
  const cv = h.speedo.querySelector('canvas');
  // Canvas pixels per CSS px: device pixels times the HUD zoom, so the dial stays sharp when zoomed.
  const css = 196, dpr = Math.min(3, (window.devicePixelRatio || 1) * (h.ui || 1)), S = Math.round(css * dpr);
  if (cv.width !== S) { cv.width = cv.height = S; h._spFace = null; }
  if (!h._spFace) h._spFace = speedoFace(S);
  const c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  c.drawImage(h._spFace, 0, 0);
  const C = S / 2, R = S / 2 - 2 * dpr;
  // Condition ("SKICK", labelled on the face): a small segmented arc in the bottom gap, like the
  // fuel gauge.
  const segs = 8, lit = Math.ceil(hp * segs - 1e-6);
  const g0 = Math.PI * 0.5 - 0.42, g1 = Math.PI * 0.5 + 0.42;
  c.lineWidth = 5 * dpr;
  for (let i = 0; i < segs; i++) {
    const a = g1 - (i / segs) * (g1 - g0), b = g1 - ((i + 0.78) / segs) * (g1 - g0);
    c.beginPath(); c.arc(C, C, R - 14 * dpr, b, a);
    const on = i < lit;
    c.strokeStyle = on ? (hp < 0.3 ? '#f08a6e' : hp < 0.55 ? '#e3c26a' : SPC.lit) : SPC.off;
    c.shadowColor = on ? SPC.glow : 'transparent'; c.shadowBlur = on ? 1.5 * dpr : 0;
    c.stroke();
  }
  c.shadowBlur = 0;
  // Digital readout.
  c.fillStyle = SPC.lit;
  c.shadowColor = SPC.glow; c.shadowBlur = 1.5 * dpr;
  c.font = `600 ${Math.round(25 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText(String(Math.round(kmh)), C, C + R * 0.47);
  c.shadowBlur = 0;
  // Needle.
  const a = SP.a0 + clamp(kmh / SP.vmax, 0, 1.03) * SP.sweep;
  c.save();
  c.translate(C, C);
  c.rotate(a);
  c.shadowColor = SPC.glow; c.shadowBlur = 2.5 * dpr;
  c.fillStyle = '#cdeebb';
  c.beginPath();
  c.moveTo(-16 * dpr, -2.6 * dpr); c.lineTo(R - 17 * dpr, -0.9 * dpr); c.lineTo(R - 14 * dpr, 0); c.lineTo(R - 17 * dpr, 0.9 * dpr); c.lineTo(-16 * dpr, 2.6 * dpr);
  c.closePath(); c.fill();
  c.restore();
  // Hub.
  const hub = c.createRadialGradient(C - 3 * dpr, C - 3 * dpr, 1, C, C, 13 * dpr);
  hub.addColorStop(0, '#3a3f44'); hub.addColorStop(1, '#0b0c0d');
  c.fillStyle = hub; c.beginPath(); c.arc(C, C, 11 * dpr, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1 * dpr; c.stroke();
}
function speedoFace(S) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const C = S / 2, dpr = S / 196, R = S / 2 - 2 * dpr;
  // Bezel and face.
  const bz = c.createLinearGradient(0, 0, 0, S);
  bz.addColorStop(0, '#4a4f54'); bz.addColorStop(0.5, '#1d2023'); bz.addColorStop(1, '#2f3337');
  c.fillStyle = bz; c.beginPath(); c.arc(C, C, R, 0, Math.PI * 2); c.fill();
  const face = c.createRadialGradient(C, C * 0.8, R * 0.1, C, C, R);
  face.addColorStop(0, '#16191b'); face.addColorStop(1, '#040505');
  c.fillStyle = face; c.beginPath(); c.arc(C, C, R - 4 * dpr, 0, Math.PI * 2); c.fill();
  // Glass reflection.
  const gl = c.createLinearGradient(0, C - R, 0, C);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.beginPath(); c.ellipse(C, C - R * 0.42, R * 0.8, R * 0.5, 0, Math.PI, 0); c.fill();
  // Ticks and numerals.
  c.shadowColor = SPC.glow;
  c.strokeStyle = SPC.tick; c.fillStyle = SPC.lit;
  c.lineCap = 'butt';
  for (let v = 0; v <= SP.vmax; v += 5) {
    const a = SP.a0 + (v / SP.vmax) * SP.sweep;
    const major = v % 20 === 0, mid = v % 10 === 0;
    const r1 = R - 8 * dpr, r2 = r1 - (major ? 12 : mid ? 8 : 4.5) * dpr;
    c.lineWidth = (major ? 2.6 : mid ? 1.5 : 1) * dpr;
    c.shadowBlur = major ? 1.2 * dpr : 0.6 * dpr;
    c.beginPath(); c.moveTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); c.lineTo(C + Math.cos(a) * r2, C + Math.sin(a) * r2); c.stroke();
    if (major) {
      const rn = R - 33 * dpr;
      c.shadowBlur = 1.5 * dpr;
      c.font = `600 ${Math.round(15 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(v), C + Math.cos(a) * rn, C + Math.sin(a) * rn + 0.5 * dpr);
    }
  }
  c.shadowBlur = 1 * dpr;
  c.textBaseline = 'alphabetic';
  c.font = `500 ${Math.round(11 * dpr)}px "Barlow", Arial, sans-serif`;
  c.fillStyle = SPC.dim;
  c.textAlign = 'center';
  c.fillText('km/h', C, C + R * 0.62);
  // The condition arc's label, left of its first segment.
  const ga = Math.PI * 0.5 + 0.42, gr = R - 14 * dpr;
  c.font = `600 ${Math.round(8 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  c.letterSpacing = `${(1.2 * dpr).toFixed(1)}px`;
  c.fillStyle = 'rgba(185, 232, 160, 0.5)';
  c.textAlign = 'right';
  c.fillText('SKICK', C + Math.cos(ga) * gr - 6 * dpr, C + Math.sin(ga) * gr + 3 * dpr);
  c.letterSpacing = '0px';
  c.shadowBlur = 0;
  return cv;
}

// ---------------------------------------------------------------------------------------------
// Portraits: a head-and-shoulders photograph of a character, lit like a winter window portrait
// (the world's sky as image-based light, a soft warm key, a cool rim), tone mapped like the game.

// Lighting setup (exported so look-dev pages can tune it; positions are metres from the face).
// Phase 4 round 2: a window-portrait set-up instead of flat studio light - a warm key from well to
// camera-left (it casts a soft shadow: brows, noses and hat brims model the face), little fill and
// sky, so the far cheek falls off to about a third (`uiportraits` measures it), and a cool rim from
// behind on the other side that draws a bright edge on hair and shoulder. `warm` lifts the
// midtones a little towards warm (skin), after tone mapping.
export const PORTRAIT = {
  env: 0.35, key: 4.8, fill: 0.22, rim: 7.5, exposure: 1.0, warm: 0.03, shadow: true,
  keyPos: [-1.7, 0.9, 0.55], rimPos: [1.3, 1.0, -1.7], fillPos: [2, -0.1, 1.4],
  keyColor: 0xffe6cc, rimColor: 0xcfe0ff, fillColor: 0xdfe8f5,
};
export function renderPortrait(renderer, model, R = 0.3) {
  const L = PORTRAIT;
  const S = 256;
  const scene = new THREE.Scene();
  scene.environment = worldScene.environment || null;
  if (scene.environmentRotation && worldScene.environmentRotation) scene.environmentRotation.copy(worldScene.environmentRotation);
  scene.environmentIntensity = L.env;
  const holder = new THREE.Group();
  const parent = model.root.parent;
  const savedPos = model.root.position.clone(), savedRot = model.root.rotation.clone();
  holder.add(model.root);
  scene.add(holder);
  model.root.position.set(0, 0, 0);
  model.root.rotation.set(0, 0.32, 0);
  holder.updateMatrixWorld(true);
  // Find the face. The people models' `head` is an empty marker at eye level (mid-face) with
  // `headTop` (top of hair/hat) and `D.headH`; older or simpler models have a `head` group with
  // geometry, framed by its bounding box.
  const box = new THREE.Box3();
  if (model.head) box.setFromObject(model.head);
  const bodyH = model.height || new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).y || 1.75;
  let hReal = box.isEmpty() ? 0 : box.max.y - box.min.y;
  const ctr = new THREE.Vector3();
  let top;
  if (!(hReal > 0.05 && hReal < 3)) {
    hReal = model.D?.headH || bodyH / 7.5;
    if (model.head) model.head.getWorldPosition(ctr); else ctr.set(0, bodyH - hReal / 2, 0);
    top = model.headTop > ctr.y ? model.headTop : ctr.y + hReal * 0.55;
  } else { box.getCenter(ctr); top = box.max.y; }
  const eyeY = ctr.y;
  // A realistic head is ~1/7.5 of the body; cartoon heads are clamped so the shoulders still show.
  const hH = clamp(hReal, bodyH / 9, bodyH / 5);
  // A close head-and-shoulders frame, ~1.9 head heights tall, the eye line 40 % from the top (so
  // the face fills the round call/toast crops). Tall hats get the room they need.
  const EYE = 0.40;
  const Vh = Math.max(hH * 1.9, (top - eyeY + hH * 0.12) / EYE, hReal * 1.25);
  const cy = eyeY + Vh * EYE - Vh / 2;
  const fov = 24;
  const dist = (Vh / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 50);
  cam.position.set(ctr.x + dist * 0.06, cy + hH * 0.12, ctr.z + dist);
  cam.lookAt(ctr.x, cy, ctr.z);
  // Lights: warm soft key from camera-left and above (it casts a soft shadow, so brows, noses and
  // hat brims model the face), cool rim from behind the other side, faint fill.
  const at = new THREE.Vector3(ctr.x, eyeY, ctr.z);
  const key = new THREE.DirectionalLight(L.keyColor, L.key); key.position.set(at.x + L.keyPos[0], at.y + L.keyPos[1], at.z + L.keyPos[2]); key.target.position.copy(at);
  key.castShadow = L.shadow;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.5, far: 6 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006; key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(L.rimColor, L.rim); rim.position.set(at.x + L.rimPos[0], at.y + L.rimPos[1], at.z + L.rimPos[2]); rim.target.position.copy(at);
  const fill = new THREE.DirectionalLight(L.fillColor, L.fill); fill.position.set(at.x + L.fillPos[0], at.y + L.fillPos[1], at.z + L.fillPos[2]); fill.target.position.copy(at);
  for (const l of [key, rim, fill]) { scene.add(l); scene.add(l.target); }
  const rt = new THREE.WebGLRenderTarget(S, S, { type: THREE.FloatType, samples: 4 });
  const oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
  const oldTarget = renderer.getRenderTarget();
  const oldShadowUpdate = renderer.shadowMap.needsUpdate;
  let px = null;
  try {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.shadowMap.needsUpdate = true; // the game renders shadows on demand only
    renderer.render(scene, cam);
    px = new Float32Array(S * S * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
  } catch (e) {
    console.warn('portrait render failed', e);
    px = null;
  } finally {
    renderer.shadowMap.needsUpdate = oldShadowUpdate;
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldClear, oldAlpha);
    rt.dispose();
    key.shadow.map?.dispose();
    holder.remove(model.root);
    model.root.position.copy(savedPos);
    model.root.rotation.copy(savedRot);
    if (parent) parent.add(model.root);
  }
  // Compose: a blurred winter street behind (drawn once per variant), then the tone-mapped portrait.
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(portraitBackdrop(backdropFor(model), S).data), S, S);
  if (px) {
    const d = img.data;
    const exposure = L.exposure, warm = L.warm || 0;
    for (let y = 0; y < S; y++) {
      const src = (S - 1 - y) * S * 4, dst = y * S * 4;
      for (let x = 0; x < S * 4; x += 4) {
        const a = px[src + x + 3];
        if (!(a > 0.002)) continue;
        const ia = 1 / Math.min(1, a);
        const rgb = aces(px[src + x] * ia * exposure, px[src + x + 1] * ia * exposure, px[src + x + 2] * ia * exposure);
        if (warm) {
          const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], m = warm * clamp(4 * l * (1 - l), 0, 1);
          rgb[0] = Math.min(1, rgb[0] * (1 + m)); rgb[1] = Math.min(1, rgb[1] * (1 + m * 0.35)); rgb[2] *= 1 - m;
        }
        const k = Math.min(1, a);
        for (let ch = 0; ch < 3; ch++) d[dst + x + ch] = Math.round(d[dst + x + ch] * (1 - k) + srgb8(Math.pow(rgb[ch], 0.86)) * k);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // A light lens vignette over the whole picture (the backdrop has its own, stronger one).
  const vg = ctx.createRadialGradient(S / 2, S * 0.45, S * 0.4, S / 2, S / 2, S * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,14,18,0.2)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, S, S);
  return cv.toDataURL('image/jpeg', 0.9);
}

// The portrait's background: a winter street a few metres behind the sitter, far out of focus - the
// wall of a row house across the street (stående panel, a white window, a corner board), its snowy
// eave, pale sky, a dark spruce past the corner and the snow bank at the foot of the wall. The low
// sun comes from the left like the key, so the wall is warm on the left and in a cool shadow on the
// right (where the rim light draws its edge). Drawn sharp, blurred by a down/up-sample pyramid (no
// canvas filter needed), vignetted, and cached as pixels: drawn once per variant for the game. The
// variant (house colour, where the window is) is picked from the character's name, so neighbours
// don't all stand in front of the same house.
const BACKDROPS = [
  { wall: [112, 50, 42], lit: [156, 82, 62], win: 0.8, tree: 0.07 },    // falu red
  { wall: [140, 116, 74], lit: [182, 150, 100], win: 0.2, tree: 0.93 },  // ochre yellow
  { wall: [100, 112, 102], lit: [140, 150, 134], win: 0.8, tree: 0.06 }, // grey-green
];
const _backdrops = new Map();
function backdropFor(model) {
  const name = String(model?.def?.name || model?.def?.key || '');
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BACKDROPS[h % BACKDROPS.length];
}
function portraitBackdrop(v, S) {
  const id = BACKDROPS.indexOf(v) + ':' + S;
  if (_backdrops.has(id)) return _backdrops.get(id);
  // Software canvases (willReadFrequently): an accelerated one would make the final getImageData
  // wait for the GPU, which is busy uploading the town at this point of the load.
  const mk = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; c.getContext('2d', { willReadFrequently: true }); return c; };
  const a = mk(S), x = a.getContext('2d');
  const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
  // Sky, paler towards the horizon.
  let gr = x.createLinearGradient(0, 0, 0, S * 0.45);
  gr.addColorStop(0, '#b4c4d4'); gr.addColorStop(1, '#e2e7ea');
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  // The wall spans the frame except a strip at the tree's side (past the house corner).
  const left = v.tree < 0.5;
  const w0 = left ? S * 0.17 : 0, w1 = left ? S : S * 0.83;
  // A spruce past the corner: dark, cool, a soft triangle stack.
  x.fillStyle = '#26332f';
  for (let k = 0; k < 6; k++) {
    const ty = S * (0.08 + k * 0.1), hw = S * (0.035 + k * 0.022);
    x.beginPath(); x.moveTo(v.tree * S, ty); x.lineTo(v.tree * S - hw, ty + S * 0.16); x.lineTo(v.tree * S + hw, ty + S * 0.16); x.fill();
  }
  // Snowy roof edge, the eave's shadow, then the wall: lit warm on the sun side, cooler shade beyond.
  x.fillStyle = '#dfe4e8'; x.fillRect(w0, S * 0.02, w1 - w0, S * 0.05);
  x.fillStyle = '#2b2a2c'; x.fillRect(w0, S * 0.07, w1 - w0, S * 0.035);
  gr = x.createLinearGradient(0, 0, S, 0);
  gr.addColorStop(0, rgb(v.lit)); gr.addColorStop(0.42, rgb(v.lit, 0.9)); gr.addColorStop(0.62, rgb(v.wall)); gr.addColorStop(1, rgb(v.wall, 0.82));
  x.fillStyle = gr; x.fillRect(w0, S * 0.105, w1 - w0, S * 0.72);
  // Board joints (they survive the blur only as a faint texture).
  x.fillStyle = 'rgba(0,0,0,0.12)';
  for (let bx = w0 + 5; bx < w1; bx += 11) x.fillRect(bx, S * 0.105, 2, S * 0.72);
  // Under the eave the wall is darker still.
  gr = x.createLinearGradient(0, S * 0.105, 0, S * 0.24);
  gr.addColorStop(0, 'rgba(10,12,16,0.4)'); gr.addColorStop(1, 'rgba(10,12,16,0)');
  x.fillStyle = gr; x.fillRect(w0, S * 0.105, w1 - w0, S * 0.14);
  // The corner board.
  x.fillStyle = '#d6d6d0'; x.fillRect(left ? w0 : w1 - S * 0.03, S * 0.07, S * 0.03, S * 0.76);
  // A window: white frame and mullion, dark glass with the sky in its top.
  const wx = v.win * S, ww = S * 0.26, wy = S * 0.3, wh = S * 0.32;
  x.fillStyle = '#c8cacb'; x.fillRect(wx - ww / 2, wy, ww, wh);
  gr = x.createLinearGradient(0, wy, 0, wy + wh);
  gr.addColorStop(0, '#6f7e8c'); gr.addColorStop(0.45, '#3e4954'); gr.addColorStop(1, '#323a42');
  x.fillStyle = gr;
  const f = S * 0.025;
  x.fillRect(wx - ww / 2 + f, wy + f, ww / 2 - f * 1.5, wh - 2 * f);
  x.fillRect(wx + f / 2, wy + f, ww / 2 - f * 1.5, wh - 2 * f);
  // Warm light inside one pane (somebody is home).
  x.fillStyle = 'rgba(255,196,120,0.35)'; x.fillRect(wx + f / 2, wy + wh * 0.45, ww / 2 - f * 1.5, wh * 0.45);
  // The snow bank along the foot of the wall, bluish in the shade.
  gr = x.createLinearGradient(0, 0, S, 0);
  gr.addColorStop(0, '#eef1f2'); gr.addColorStop(0.55, '#dfe6ec'); gr.addColorStop(1, '#c4d0dc');
  x.fillStyle = gr;
  x.beginPath(); x.moveTo(0, S * 0.84);
  for (let k = 0; k <= 8; k++) x.lineTo(k / 8 * S, S * (0.8 + 0.025 * Math.sin(k * 1.7 + v.win * 9)));
  x.lineTo(S, S); x.lineTo(0, S); x.fill();
  // Out of focus: halve down to S/16, then back up (bilinear each step: a smooth, wide blur).
  let c = a;
  for (let n = S >> 1; n >= S >> 4; n >>= 1) { const d = mk(n); const dx = d.getContext('2d'); dx.imageSmoothingQuality = 'high'; dx.drawImage(c, 0, 0, n, n); c = d; }
  for (let n = c.width << 1; n <= S; n <<= 1) { const d = mk(n); const dx = d.getContext('2d'); dx.imageSmoothingQuality = 'high'; dx.drawImage(c, 0, 0, n, n); c = d; }
  const cx2 = c.getContext('2d');
  // The vignette, a little off-centre towards the face.
  gr = cx2.createRadialGradient(S * 0.5, S * 0.42, S * 0.22, S * 0.5, S * 0.5, S * 0.8);
  gr.addColorStop(0, 'rgba(14,18,24,0)'); gr.addColorStop(1, 'rgba(14,18,24,0.5)');
  cx2.fillStyle = gr; cx2.fillRect(0, 0, S, S);
  const data = cx2.getImageData(0, 0, S, S);
  _backdrops.set(id, data);
  return data;
}

// three.js' ACESFilmicToneMapping (RRT+ODT fit), per pixel in JS.
function aces(r, g, b) {
  r /= 0.6; g /= 0.6; b /= 0.6;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.07600 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const fr = fit(ir), fg = fit(ig), fb = fit(ib);
  return [
    clamp(1.60475 * fr - 0.53108 * fg - 0.07367 * fb, 0, 1),
    clamp(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb, 0, 1),
    clamp(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb, 0, 1),
  ];
}
function srgb8(c) { return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
