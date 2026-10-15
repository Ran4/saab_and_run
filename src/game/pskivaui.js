// What Ove holds in his hands (feature p-skiva, game/pskiva.js): the p-skiva, the whole disc on the
// screen (drawn after features/implemented/pskiva.avif: a blue card, ANKOMSTTID, a pointer down into a window
// over the white dial, the P; Swedish text only), its dial turning half an hour a step under the
// pointer; and a kontrollavgift from P-Ordning AB as it came out of the attendant's printer, with a
// BETALD stamp and, when she wrote something wrong, Ove's red ring round it. DOM + inline SVG in
// #hud; no sound, no game state (pskiva.js calls these).
//   pskivaUI.init()
//   pskivaUI.showDisc({ dial, clock, sign, limit, hours })   dial: minutes 0..719 (12 o'clock = 0)
//   pskivaUI.turn(k)       +1 half an hour later, -1 earlier (animated, the long way never)
//   pskivaUI.clock(text)   the time beside the disc
//   pskivaUI.hideDisc(laid)   laid: it goes into the window; else back into the glove box
//   pskivaUI.showTicket(t) / stamp(kr) / markWrong(field) / hideTicket()
//   pskivaUI.logo()        P-Ordning AB's mark as a data URL (the phone's portrait)

const NS = 'http://www.w3.org/2000/svg';
// The disc's geometry (viewBox 882 x 1200, measured off the photograph): the dial turns about C, its
// big numbers at R_NUM, the 24-hour ones at R_SMALL; the window is the ring between R_IN and R_OUT,
// WIN degrees either side of straight down.
const CX = 441, CY = 382, R_DIAL = 352, R_NUM = 238, R_SMALL = 296, R_IN = 160, R_OUT = 338, WIN = 46;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const P = (r, deg) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.sin(a), CY + r * Math.cos(a)]; };
const f1 = (v) => v.toFixed(1);

// The window: the ring sector with rounded corners (quadratic fillets at its four corners).
function windowPath() {
  const fo = 20, fi = 16, dO = (fo / R_OUT) * (180 / Math.PI), dI = (fi / R_IN) * (180 / Math.PI);
  const pt = (r, d) => P(r, d).map(f1).join(' ');
  return [
    `M ${pt(R_OUT, -WIN + dO)}`,
    `A ${R_OUT} ${R_OUT} 0 0 0 ${pt(R_OUT, WIN - dO)}`,
    `Q ${pt(R_OUT, WIN)} ${pt(R_OUT - fo, WIN)}`,
    `L ${pt(R_IN + fi, WIN)}`,
    `Q ${pt(R_IN, WIN)} ${pt(R_IN, WIN - dI)}`,
    `A ${R_IN} ${R_IN} 0 0 1 ${pt(R_IN, -WIN + dI)}`,
    `Q ${pt(R_IN, -WIN)} ${pt(R_IN + fi, -WIN)}`,
    `L ${pt(R_OUT - fo, -WIN)}`,
    `Q ${pt(R_OUT, -WIN)} ${pt(R_OUT, -WIN + dO)} Z`,
  ].join(' ');
}
// The card: rounded corners and the thumb notch at the top, where the dial's ribbed rim shows.
const CARD = 'M 54 26 H 356 Q 363 26 365 32 L 371 47 Q 375 56 387 56 H 495 Q 507 56 511 47 L 517 32 Q 519 26 526 26 H 828 Q 854 26 854 52 V 1150 Q 854 1176 828 1176 H 54 Q 28 1176 28 1150 V 52 Q 28 26 54 26 Z';

function discSvg() {
  const win = windowPath();
  const parts = [];
  // The dial (behind the card): white, the ribbed rim, the half-hour lines, 1-12 and 13-24 upright
  // towards the centre (a number's top points at C).
  parts.push(`<g class="ps-dial">`);
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DIAL}" fill="url(#psDialG)"/>`);
  for (let k = 0; k < 144; k++) { const [x, y] = P(R_DIAL - 3, k * 2.5); parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="5.2" fill="#f4f4f1"/>`); }
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DIAL - 7}" fill="none" stroke="#d9dbd8" stroke-width="2"/>`);
  for (let i = 0; i < 24; i++) {
    const a = i * 15, half = i % 2 === 1;
    const [x0, y0] = P(R_IN + 3, a), [x1, y1] = P(half ? R_IN + 30 : R_IN + 17, a);
    parts.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#141414" stroke-width="${half ? 7 : 6}" stroke-linecap="round"/>`);
  }
  for (let h = 1; h <= 12; h++) {
    const a = h * 30, [x, y] = P(R_NUM, a), [sx, sy] = P(R_SMALL, a);
    parts.push(`<text class="ps-num" transform="translate(${f1(x)} ${f1(y)}) rotate(${-a})">${h}</text>`);
    parts.push(`<text class="ps-num24" transform="translate(${f1(sx)} ${f1(sy)}) rotate(${-a})">${h + 12}</text>`);
  }
  parts.push(`</g>`);
  // The card over it, the window cut out (and the notch: its outline leaves the rim showing).
  parts.push(`<path d="${CARD} ${win}" fill="url(#psCardG)" fill-rule="evenodd"/>`);
  parts.push(`<path d="${CARD} ${win}" fill-rule="evenodd" filter="url(#psGrain)" opacity="0.55"/>`);
  parts.push(`<path d="${CARD}" fill="url(#psGloss)"/>`);
  // the window's edge: the card's thickness, a shadow on the dial below it
  parts.push(`<g clip-path="url(#psWinClip)"><path d="${win}" fill="none" stroke="#08204a" stroke-opacity="0.55" stroke-width="22" filter="url(#psSoft)"/></g>`);
  parts.push(`<path d="${win}" fill="none" stroke="#123f86" stroke-width="5"/>`);
  parts.push(`<path d="${win}" fill="none" stroke="#7fa8e6" stroke-opacity="0.45" stroke-width="1.6" transform="translate(0 -2.2)"/>`);
  // the card's edge
  parts.push(`<path d="${CARD}" fill="none" stroke="#0f3c82" stroke-width="5"/>`);
  parts.push(`<path d="${CARD}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2" transform="translate(1.2 1.6) scale(0.997)"/>`);
  // The print: ANKOMSTTID, the pointer down into the window, the P.
  parts.push(`<g class="ps-print">`);
  parts.push(`<text x="${CX}" y="178" class="ps-title">ANKOMSTTID</text>`);
  parts.push(`<path d="M 368 226 L 514 226 L ${CX} 548 Z" class="ps-arrow"/>`);
  parts.push(`<rect x="292" y="800" width="298" height="298" rx="46" class="ps-pbox"/>`);
  parts.push(`<text x="${CX}" y="1060" class="ps-p">P</text>`);
  parts.push(`</g>`);
  return `<svg class="ps-svg" viewBox="0 0 882 1200" aria-hidden="true">
    <defs>
      <linearGradient id="psCardG" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#2d72d6"/><stop offset="0.55" stop-color="#2163c6"/><stop offset="1" stop-color="#1a55b2"/></linearGradient>
      <linearGradient id="psGloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.38" stop-color="#fff" stop-opacity="0.02"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.08"/></linearGradient>
      <radialGradient id="psDialG" cx="${CX}" cy="${CY}" r="${R_DIAL}" gradientUnits="userSpaceOnUse"><stop offset="0.4" stop-color="#ffffff"/><stop offset="0.86" stop-color="#f6f6f3"/><stop offset="1" stop-color="#e2e3df"/></radialGradient>
      <filter id="psGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.2  0 0 0 0 0.45  0 0 0 1.4 -0.55"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="psSoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
      <clipPath id="psWinClip"><path d="${win}"/></clipPath>
    </defs>
    ${parts.join('\n    ')}
  </svg>`;
}

const TICKET_ROWS = [['day', 'Datum'], ['time', 'Klockslag'], ['plate', 'Reg.nr'], ['make', 'Fabrikat'], ['place', 'Plats'], ['disc', 'P-skiva'], ['what', 'Överträdelse']];

export const pskivaUI = {
  root: null, disc: null, lapp: null, steps: 0,

  init() {
    if (this.root) return;
    const hudRoot = document.getElementById('hud') || document.body;
    const d = document.createElement('div');
    d.id = 'pskiva';
    d.innerHTML = `<div class="ps-wrap">
        <div class="ps-side">
          <div class="ps-sign"><b>P</b><span class="ps-limit"></span><i>P-skiva</i></div>
          <div class="ps-time"><small>Klockan</small><span class="ps-clock">12:00</span></div>
          <p class="ps-rule">Ankomsttiden: närmast följande hel- eller halvtimme.</p>
          <div class="ps-keys"><div><kbd>Q</kbd><kbd>E</kbd> vrid skivan</div><div><kbd>F</kbd> lägg den i rutan</div><div><kbd>G</kbd> lägg tillbaka</div></div>
        </div>
        <div class="ps-disc">${discSvg()}</div>
      </div>`;
    hudRoot.appendChild(d);
    this.root = d;
    this.dialEl = d.querySelector('.ps-dial');
    const l = document.createElement('div');
    l.id = 'plapp';
    l.innerHTML = `<div class="pl-slip">
        <div class="pl-head"><img class="pl-logo" alt=""><div><b>P-ORDNING AB</b><small>Parkeringsövervakning</small></div></div>
        <div class="pl-title">KONTROLLAVGIFT</div>
        <div class="pl-no"></div>
        <div class="pl-law">enligt lagen (1984:318) om kontrollavgift vid olovlig parkering</div>
        <div class="pl-rows">${TICKET_ROWS.map(([f, label]) => `<div class="pl-row" data-f="${f}"><label>${label}</label><span></span></div>`).join('')}
          <svg class="pl-ring" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="M 18 40 C 6 18, 70 4, 160 5 C 250 6, 296 16, 290 33 C 284 52, 200 57, 140 56 C 70 55, 10 50, 22 30"/></svg>
          <div class="pl-fel">FEL!</div>
        </div>
        <div class="pl-note"></div>
        <div class="pl-fee"><span>AVGIFT</span><b></b></div>
        <div class="pl-pay">Betalas inom 8 dagar till bankgiro 0000-0000.<br>Ange OCR-nummer <span class="pl-ocr"></span>.</div>
        <div class="pl-sign">Kontrollant nr <span class="pl-warden"></span></div>
        <div class="pl-bar"></div>
        <div class="pl-stamp"><b>BETALD</b><small></small></div>
      </div>
      <div class="pl-keys"><kbd>E</kbd> Stoppa lappen i fickan</div>`;
    hudRoot.appendChild(l);
    this.lapp = l;
    l.querySelector('.pl-logo').src = this.logo();
  },

  // ------------------------------------------------------------------------------------------
  // The disc

  showDisc(o) {
    this.init();
    const d = this.root;
    this.steps = Math.round(o.dial / 30);
    this.setRot(false);
    d.querySelector('.ps-limit').innerHTML = o.limit ? `${esc(o.limit)}<br>${o.hours && !(o.hours[0] <= 0 && o.hours[1] >= 24) ? `${o.hours[0]}–${o.hours[1]}` : ''}` : '';
    this.clock(o.clock);
    d.classList.remove('laid', 'back');
    void d.offsetWidth;
    d.classList.add('show');
    this.held(true);
  },
  held(on) { document.getElementById('hud')?.classList.toggle('held', !!on); },
  turn(k) { this.steps += k; this.setRot(true); },
  // (the dial turns clockwise for a later time: 30° an hour; rotate(T * 30°) puts hour T under the pointer)
  setRot(anim) {
    const el = this.dialEl;
    if (!el) return;
    el.style.transition = anim ? '' : 'none';
    el.style.transform = `rotate(${this.steps * 15}deg)`;
    if (!anim) { void el.getBoundingClientRect(); el.style.transition = ''; }
  },
  clock(text) { const c = this.root?.querySelector('.ps-clock'); if (c && c.textContent !== text) c.textContent = text; },
  hideDisc(laid) {
    const d = this.root;
    if (!d) return;
    d.classList.add(laid ? 'laid' : 'back');
    d.classList.remove('show');
    this.held(false);
  },
  get discOpen() { return !!this.root?.classList.contains('show'); },

  // ------------------------------------------------------------------------------------------
  // The ticket

  showTicket(t) {
    this.init();
    const l = this.lapp, set = (f, v) => { const e = l.querySelector(`.pl-row[data-f="${f}"] span`); if (e) e.innerHTML = v; };
    l.querySelector('.pl-no').textContent = `Nr ${t.no}`;
    set('day', esc(t.dayText));
    set('time', esc(t.time));
    set('plate', esc(t.plate));
    set('make', esc(t.make));
    set('place', `${esc(t.place)}<br><small>plats ${t.bay}</small>`);
    set('disc', esc(t.discText));
    l.querySelector('.pl-row[data-f="disc"]').hidden = t.rule?.disc == null;
    // (no line break at the hyphen of "p-skiva")
    set('what', esc(t.what).replace(/p-skiva/g, 'p\u2011skiva'));
    const note = l.querySelector('.pl-note');
    note.textContent = t.why === 'ahead' ? 'Ankomsttiden ska anges med närmast följande hel- eller halvtimme.' : t.why === 'nodisc' ? 'Ankomsttiden ska visas med p-skiva, väl synlig i vindrutan.' : '';
    note.hidden = !note.textContent;
    l.querySelector('.pl-fee b').textContent = `${t.fine} kr`;
    l.querySelector('.pl-ocr').textContent = String(t.no).replace(/\s/g, '') + '06';
    l.querySelector('.pl-warden').textContent = t.warden;
    l.querySelector('.pl-stamp small').textContent = '';
    l.classList.remove('stamped', 'wrong');
    void l.offsetWidth;
    l.classList.add('show');
    this.held(true);
  },
  stamp(kr) {
    const l = this.lapp;
    if (!l) return;
    l.querySelector('.pl-stamp small').textContent = `−${kr} kr`;
    l.classList.add('stamped');
  },
  // Ove's red ring round the field she got wrong, and FEL! beside it.
  markWrong(field) {
    const l = this.lapp, row = l?.querySelector(`.pl-row[data-f="${field}"]`);
    if (!row) return;
    const ring = l.querySelector('.pl-ring'), fel = l.querySelector('.pl-fel');
    const top = row.offsetTop, h = row.offsetHeight;
    ring.style.top = `${top - 7}px`; ring.style.height = `${h + 14}px`;
    fel.style.top = `${top - 22}px`;
    l.classList.add('wrong');
  },
  hideTicket() { this.lapp?.classList.remove('show'); this.held(false); },
  get ticketOpen() { return !!this.lapp?.classList.contains('show'); },

  // P-Ordning AB's mark: a white P in a white-ringed square on their blue (the phone's portrait is
  // cropped round its upper middle, so the P sits there).
  logo() {
    if (this._logo) return this._logo;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#2b6fd2'); g.addColorStop(1, '#1a54b0');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#eef3fb'; x.lineWidth = 9;
    const r = 22, x0 = 70, y0 = 34, s = 116;
    x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + s, y0, x0 + s, y0 + s, r); x.arcTo(x0 + s, y0 + s, x0, y0 + s, r); x.arcTo(x0, y0 + s, x0, y0, r); x.arcTo(x0, y0, x0 + s, y0, r); x.closePath(); x.stroke();
    x.fillStyle = '#eef3fb'; x.font = '700 104px "Barlow Condensed", "Barlow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('P', 128, 96);
    x.font = '700 30px "Barlow Condensed", "Barlow", sans-serif';
    x.fillText('ORDNING', 128, 190);
    this._logo = c.toDataURL('image/png');
    return this._logo;
  },
};
