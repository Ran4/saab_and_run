// Everything drawn over the 3D view: kronor and anmälningar, the Ordning meter, objectives and
// timers, the avbrott (errand) panel, incoming calls, Ove's notebook, world-anchored tags, the
// minimap and big map, the Saab speedometer, dialogue with portraits, banners, toasts, speech
// bubbles, and the title / pause screens' wiring. Contract: DESIGN.md section 9; notes/ui.md.

import { THREE, camera, scene as worldScene, setQuality, getQuality } from '../gfx.js';
import * as LAYOUT from '../world/layout.js';
import { blocks, BOX, CIRCLE, RAMP } from '../world/collision.js';
import { audio } from '../audio.js';

const { MAP, N, P, HALF, RHW, rc, BOUND } = LAYOUT;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const PARAMS = new URLSearchParams(location.search);
const SETTINGS_KEY = 'saab-and-run-settings';

let root, mapCanvas, mapCtx, baseMap;

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
// Violation kinds (DESIGN 6) -> notebook text when the caller gives none.
const KIND_SHORT = { carfree: 'Bil i bilfritt område', lawn: 'På gräsmattan', sidewalk: 'På trottoaren', busstop: 'Busshållplats', handicap: 'Handikapplats', garbage: 'Framför soprummet', guest24: 'Gästplats över ett dygn', firelane: 'Räddningsväg', loading: 'Lastzon', corner: 'Vid korsning', crosswalk: 'Övergångsställe' };
// World tags: [minimum opacity, minimum scale] per class as they get further away.
const TAG_FADE = { smitare: [1, 0.9], violation: [0.9, 0.8], errand: [0.92, 0.82], neighbour: [0.6, 0.75], reported: [0.35, 0.72], plain: [0.35, 0.72] };
const KIND_TEXT = { carfree: 'Bil inom det bilfria området', lawn: 'Parkerad på gräsmattan', sidewalk: 'Parkerad på trottoaren', busstop: 'Parkerad vid busshållplats', handicap: 'Handikapplats utan tillstånd', garbage: 'Blockerar soprummet', guest24: 'Gästparkering över 24 h', firelane: 'Står på räddningsväg', loading: 'Parkerad i lastzon', corner: 'Inom 10 m från korsning', crosswalk: 'Står på övergångsstället' };

const ICON = {
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.6"/><path d="M10 5.5V10l3 2"/></svg>',
  book: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="2.8" width="12" height="14.6" rx="1"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
  north: '<svg viewBox="0 0 34 46"><path d="M17 3 L27 30 L17 24 L7 30 Z" fill="#1b1f24"/><path d="M17 3 L17 24 L7 30 Z" fill="#5a626a"/><text x="17" y="44" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="600" font-size="13" fill="#1b1f24">N</text></svg>',
  pencil: '<svg viewBox="0 0 84 14"><path d="M0 7 L7 4.6 L7 9.4 Z" fill="#3b3e44"/><path d="M7 4.6 L19 1.5 L19 12.5 L7 9.4 Z" fill="#dcc29a"/><rect x="19" y="1.5" width="60" height="11" fill="#9a2f22"/><rect x="19" y="1.5" width="60" height="3.2" fill="#b4412f"/><rect x="79" y="1.5" width="5" height="11" fill="#5b2018"/></svg>',
};

export const hud = {
  portraits: {},
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
    if (s.gfx === 'low' && !PARAMS.has('lowgfx') && getQuality() !== 'low') setQuality('low');
    const bind = (id, fn) => $(id)?.addEventListener('click', fn);
    bind('opt-music', () => { audio.setMusic(!audio.musicOn); this._saveSettings(); this.syncMenu(); });
    bind('opt-sound', () => { audio.setMuted(!audio.muted); this._saveSettings(); this.syncMenu(); });
    bind('opt-gfx', () => { setQuality(getQuality() === 'low' ? 'high' : 'low'); this._saveSettings(); this.syncMenu(); });
    bind('opt-reset', (e) => {
      const b = e.currentTarget;
      if (!b.classList.contains('confirm')) {
        b.classList.add('confirm');
        b.textContent = 'Säker? Klicka igen';
        clearTimeout(this._resetT);
        this._resetT = setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'Radera sparat spel'; }, 3500);
        return;
      }
      clearTimeout(this._resetT);
      b.classList.remove('confirm');
      b.textContent = 'Radera sparat spel';
      if (this.onResetSave) this.onResetSave();
      else window.__game?.resetSave?.();
    });
    // "Kontroller": the title screen's controls table, shown in place of the notebook page.
    const pause = $('pause');
    const ctl = $('pause-controls'), table = document.querySelector('#title .controls');
    if (ctl && table && !ctl.querySelector('table')) {
      el('div', 'tc-head', ctl, 'Kontroller');
      ctl.appendChild(table.cloneNode(true));
    }
    bind('opt-controls', () => { pause?.classList.toggle('ctl'); this.syncMenu(); });
    let wasShown = false;
    if (pause) new MutationObserver(() => {
      const shown = pause.classList.contains('show');
      if (shown && !wasShown) { pause.classList.remove('ctl'); this.syncMenu(); this.renderLog(this._log); }
      wasShown = shown;
    }).observe(pause, { attributes: true, attributeFilter: ['class'] });
    this.syncMenu();
    this.renderLog(this._log);
  },
  _saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: audio.musicOn, sound: !audio.muted, gfx: getQuality() })); } catch (e) { /* private mode */ }
  },
  // Refresh the pause menu's toggle labels (called whenever the pause menu opens).
  syncMenu() {
    const set = (id, on, txt) => { const b = $(id); if (!b) return; b.querySelector('b').textContent = txt; b.classList.toggle('off', !on); };
    set('opt-music', audio.musicOn, audio.musicOn ? 'På' : 'Av');
    set('opt-sound', !audio.muted, audio.muted ? 'Av' : 'På');
    const hi = getQuality() !== 'low';
    set('opt-gfx', hi, hi ? 'Hög' : 'Låg');
    const ctl = !!$('pause')?.classList.contains('ctl');
    set('opt-controls', true, ctl ? 'Dölj' : 'Visa');
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
    const tm = o.timer != null ? fmtTime(o.timer) : '';
    if (tm !== c.tm) { c.tm = tm; n.timer.textContent = tm; }
    const urgent = o.timer != null && o.timer < 15;
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

  toast(text, cls = '', ms = 0) {
    const plain = String(text).replace(/<[^>]*>/g, '');
    const dur = ms || clamp(1800 + plain.length * 45, 2600, 7000);
    while (this.toastsEl.children.length >= 4) this.toastsEl.firstChild.remove();
    // One flex item: plain text with <b> key caps in it must not fall apart into columns.
    const html = /^\s*<(img|div|span class="radio-face")/.test(text) ? text : `<span>${text}</span>`;
    const t = el('div', 'toast card ' + cls, this.toastsEl, html);
    setTimeout(() => t.classList.add('out'), dur);
    setTimeout(() => t.remove(), dur + 600);
    return t;
  },
  // A radio / phone message with the speaker's portrait.
  radio(who, name, text, cls = 'radio') {
    const img = this.portraits[who] ? `<span class="radio-face"><img src="${this.portraits[who]}" alt=""></span>` : '';
    return this.toast(`${img}<div><span class="t-who">${esc(name || who)}</span>${text}</div>`, cls);
  },
  phone(who, name, text) { return this.radio(who, name, text, 'phone'); },

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

  letterbox(on) { $('letterbox').classList.toggle('on', on); },
  // A cut: the scene fades to black (0.6 s) with an optional caption ("Senare samma dag"), and back.
  // Under the HUD cards (objective, prompt, banner stay readable), over the world and its tags.
  curtain(on, caption = '') {
    const c = $('curtain');
    if (on) c.querySelector('.cu-text').textContent = caption || '';
    c.classList.toggle('on', !!on);
  },

  // ------------------------------------------------------------------------------------------
  // Dialogue: lines of { who, text }. Resolves when the last line is dismissed.

  async runDialog(lines, game) {
    this.dialogActive = true;
    this.dialog.classList.add('show');
    for (const line of lines) {
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

  // Speech bubbles over characters in the world.
  say(target, text, secs = 2) {
    const b = el('div', 'bubble', this.bubbles, text);
    const item = { b, target, until: performance.now() + secs * 1000 };
    (this._bubbles ||= []).push(item);
  },
  // A cutscene starts: small talk from a moment ago doesn't hang over it.
  clearBubbles() {
    for (const it of this._bubbles || []) it.b.remove();
    if (this._bubbles) this._bubbles.length = 0;
  },
  tickBubbles() {
    const list = this._bubbles || [];
    if (!list.length) return;
    const now = performance.now();
    const v = _v;
    const W = window.innerWidth, H = window.innerHeight;
    for (let k = list.length - 1; k >= 0; k--) {
      const it = list[k];
      if (now > it.until) { it.b.remove(); list.splice(k, 1); continue; }
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
  // Ove is hunting stay readable at any distance. Pass [] or null to clear.
  tags(list) {
    const pool = this._tagPool;
    const W = window.innerWidth, H = window.innerHeight;
    const cp = camera.position;
    const u = this.ui || 1;
    const placed = (this._tagPlaced ||= []);
    placed.length = 0;
    let used = 0;
    if (list) for (const t of list) {
      _v.set(t.x, t.y, t.z).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.08 || Math.abs(_v.y) > 1.08) continue;
      let e = pool[used];
      if (!e) {
        e = el('div', 'tag3d', this.tagsEl, '<span><i></i><em></em></span>');
        e._em = e.querySelector('em'); e._em.style.fontStyle = 'normal';
        pool.push(e);
      }
      used++;
      const cls = 'tag3d ' + (t.cls || 'plain');
      if (e._cls !== cls) { e._cls = cls; e.className = cls; }
      if (e._text !== t.text) { e._text = t.text; e._em.textContent = t.text; e._w = 0; }
      const d = Math.hypot(t.x - cp.x, t.y - cp.y, t.z - cp.z);
      const lim = TAG_FADE[t.cls] || TAG_FADE.plain;
      const op = t.opacity ?? clamp(1.25 - d / 40, lim[0], 1);
      const sc = clamp(1.12 - d / 90, lim[1], 1);
      e.style.display = '';
      e.style.opacity = op.toFixed(2);
      e.style.zIndex = String(1000 - Math.round(d));
      // Unscaled on-screen size, measured once per text (the label is zoomed by --ui).
      if (!e._w) { const r = e.firstChild.getBoundingClientRect(); const k = e._sc || 1; e._w = r.width / k || 120 * u; e._h = r.height / k || 22 * u; }
      placed.push({ e, x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, w: e._w * sc, h: e._h * sc, d, sc });
    }
    // Labels that would overlap (JIMMY on top of BIL I BILFRITT OMRÅDE): the nearer one stays,
    // a farther one moves up above it (at most three labels' worth).
    placed.sort((a, b) => a.d - b.d);
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
    for (let k = used; k < pool.length; k++) if (pool[k].style.display !== 'none') pool[k].style.display = 'none';
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
      return `<div class="log-entry${cls}"><span class="le-time">${esc(nbTime(e.time))}</span><span class="le-plate">${esc(e.plate || '')}</span><span class="le-text"><span class="le-t">${esc(KIND_SHORT[e.kind] || e.text || e.kind || '')}</span>${note}</span><span class="le-mark">${e.escaped ? '–' : TICK_SVG}</span></div>`;
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
        text: o.text || KIND_TEXT[o.kind] || o.kind || '',
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

// Lighting setup (exported so look-dev pages can tune it).
// env 0.4 / key 4.4 / fill 0.2 gives a ~2.5-3:1 key-to-shadow ratio, so pale faces and white hair
// still model; `warm` lifts the midtones a little towards warm (skin), after tone mapping.
// Fix round 1: the key more frontal and a bit lower, with more fill and sky: it models cheeks and
// brows instead of making the nose's lit flank the brightest thing in every face. (Compared side by
// side with the people area's [-1.3, 0.7, 1.5] / fill 0.7 at dialogue size and in the call card's
// crop, `portraitlight` scenario: this one keeps a little more shape in pale faces.)
export const PORTRAIT = { env: 0.5, key: 4.4, rim: 2.4, fill: 0.55, exposure: 1.0, warm: 0.03, shadow: true, keyPos: [-1.4, 0.8, 1.3] };
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
  // hat brims model the face), cool rim from behind, faint fill.
  const at = new THREE.Vector3(ctr.x, eyeY, ctr.z);
  const key = new THREE.DirectionalLight(0xffe6cc, L.key); key.position.set(at.x + L.keyPos[0], at.y + L.keyPos[1], at.z + L.keyPos[2]); key.target.position.copy(at);
  key.castShadow = L.shadow;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.5, far: 6 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006; key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(0xcfe0ff, L.rim); rim.position.set(at.x + 1.7, at.y + 1.0, at.z - 1.9); rim.target.position.copy(at);
  const fill = new THREE.DirectionalLight(0xdfe8f5, L.fill); fill.position.set(at.x + 2, at.y - 0.1, at.z + 1.4); fill.target.position.copy(at);
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
  // Compose: a muted studio backdrop, then the tone-mapped portrait over it.
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const bg = ctx.createRadialGradient(S * 0.42, S * 0.3, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
  bg.addColorStop(0, '#8d9aa5'); bg.addColorStop(0.55, '#66727d'); bg.addColorStop(1, '#3c454e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  if (px) {
    const img = ctx.getImageData(0, 0, S, S);
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
    ctx.putImageData(img, 0, 0);
  }
  // Soft vignette.
  const vg = ctx.createRadialGradient(S / 2, S * 0.45, S * 0.35, S / 2, S / 2, S * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,14,18,0.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, S, S);
  return cv.toDataURL('image/jpeg', 0.9);
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
