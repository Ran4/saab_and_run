// The p-skiva and the lapplisa (feature p-skiva, features/implemented/p-skiva.md). The town's car
// parks have marked bays and rules on their signs (world/data.js parkingLots / parkingBays): two hours
// with a p-skiva 8-18 at the Livs in centrum, three at the hospital, ten minutes at the preschool, two
// at Kommunhuset; residents with a permit only in the other areas' lots; the loading zone, the
// handicap bays and the reserved ones never without a permit.
//
// Ove's car stopped in a bay is a parking (`rec`; its arrival is the minute it stopped). In a p-skiva
// bay G (the pad's d-pad up) takes the disc out: a minigame (game/pskivaui.js draws it, the whole
// disc on the screen), Q / E turn it half an hour at a time, F lays it in the window. The Swedish rule:
// the arrival rounded up to the next whole or half hour (16:31 -> 17:00). The disc stays in that car
// as it was set (a new parking needs it set again: an old time is just wrong).
//
// While Ove is away from the car (> PSK.away m, not in it, for PSK.awaySecs s) a parking attendant
// comes by now and then (game minutes: PSK.first, then every PSK.gap) and writes a kontrollavgift
// if something is wrong:
//   nodisc    no p-skiva in the window            overtime  longer than the sign allows (the hours
//   ahead     the disc shows a later time than               of the day the rule holds count)
//             the next half hour now (set ahead)  permit    a bay Ove has no permit for
// The ticket lies under the driver's wiper (a yellow envelope). Ove sees it (a line), E takes it
// instead of getting in (there is no getting in before), it fills the screen and is paid at once
// (PSK.fine kr). One in five has something written wrong on it (PSK.wrong: the plate, the make, the
// time, the disc, the place; and now and then a correctly set disc is read wrong, PSK.misread): Ove
// circles it in red and phones P-Ordning AB (interrupts.outCall), who cancel it and pay him back.
//
// In tests (?test) the attendant stays at home unless &lapp. API (main.js):
//   parking.update(dt)            every frame          parking.dawn()          a new day (missions.js)
//   parking.prompt()              the prompt line in a car (G / what the bay is)
//   parking.openDisc()            G: the minigame, if the car stands in a p-skiva bay
//   parking.overlay(dt)           while g.overlay is set: the minigame's or the ticket's keys
//   parking.ticketOn(car)         a ticket under its wiper (main.js: E takes it, not the car)
//   parking.take(car)             E on it
//   parking.check(car, o)         tests: a round now, wherever Ove is (o.err: the error to write)
//   parking.recs, stats, rand     tests
import { THREE, GeoBuilder, realMesh } from '../gfx.js';
import { parkingLots, parkingBays } from '../world/town.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { hud } from './hud.js';
import { pskivaUI } from './pskivaui.js';
import { PSKIVA as LINES, GARAGE_DOOR } from './script.js';
import { DAYS } from './missions.js';
import { dist, pick } from '../util.js';

export const PSK = {
  fine: 300,          // kr: a kontrollavgift
  wrong: 0.2,         // the share of tickets with something written wrong on them
  misread: 0.05,      // a correctly set disc read wrong, at a parking's first round (a ticket it shouldn't be)
  away: 35,           // m: she comes by only while Ove is further than this from the car (and not in it)
  awaySecs: 10,       // s: ... and has been for this long (a clock that jumps - the end of a day - is no round)
  first: [4, 12],     // game minutes from the arrival to her first round: first[0] + Exp(mean first[1])
  gap: [8, 16],       // between rounds: gap[0] + Exp(gap[1])
  again: 45,          // a ticket taken: the next round no sooner (game minutes)
  slow: 0.6,          // m/s: a car slower than this in a bay has stopped there
  seen: 11,           // m: Ove on foot this close to a ticketed car of his sees the ticket
  cell: 24,           // m: the bays' lookup grid
};
// What the ticket says Ove did ("Överträdelse"), by the offence; and what the prompt says of a bay
// he needs a permit for.
const OFFENCE = {
  nodisc: 'P-skiva saknas',
  ahead: 'Felaktigt inställd p-skiva',
  boende: 'Parkerat på plats för boende utan tillstånd',
  handikapp: 'Parkerat på plats för rörelsehindrade utan tillstånd',
  lastzon: 'Parkerat på lastplats',
  reserverad: 'Parkerat på reserverad plats',
};
const PERMIT = { boende: 'Boende med tillstånd', handikapp: 'Handikapplats · tillstånd krävs', lastzon: 'Lastzon 6–18', reserverad: 'Reserverad plats' };
const MAKES = ['Saab', 'Volvo', 'Audi', 'BMW', 'Škoda', 'Volkswagen'];
// A wrong plate: one character mistaken for one that looks like it.
const LOOKALIKE = { 0: '8', 8: '0', 1: '7', 7: '1', 3: '8', 5: '6', 6: '5', 9: '8', 2: '7', 4: '1', O: 'D', D: 'O', B: '8', S: '5', E: 'F', F: 'E', H: 'N', N: 'H', M: 'N', C: 'G', G: 'C', A: 'R', R: 'A', U: 'J', T: 'Y', Y: 'T', L: 'J', K: 'X', X: 'K', P: 'R', W: 'M', Z: '2', J: 'L' };

export const hhmm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
// The next whole or half hour from minute m (m itself if it is one).
export const ceil30 = (m) => Math.ceil(Math.floor(m) / 30) * 30;
// Minutes between a and b (absolute) that fall within the rule's hours of each day.
function regMin(a, b, hours) {
  if (!hours || (hours[0] <= 0 && hours[1] >= 24)) return Math.max(0, b - a);
  let s = 0;
  for (let d = Math.floor(a / 1440); d <= Math.floor(b / 1440); d++) {
    const lo = Math.max(a, d * 1440 + hours[0] * 60), hi = Math.min(b, d * 1440 + hours[1] * 60);
    if (hi > lo) s += hi - lo;
  }
  return s;
}
const within = (t, hours) => { if (!hours) return true; const m = ((t % 1440) + 1440) % 1440; return m >= hours[0] * 60 && m < hours[1] * 60; };
const limitText = (min) => (min % 60 ? `${min} min` : `${min / 60} tim`);
export function makeOf(car) {
  const n = car.spec?.name || '';
  const w = n.split(' ')[0];
  return MAKES.includes(w) ? w : n;
}

// The envelope under the wiper (shared geometry): yellow plastic, the slip showing through.
let envGeo = null;
function envelope() {
  if (!envGeo) {
    const g = new GeoBuilder();
    g.use('plastic').box(0xe2b02a, 0, 0, 0, 0.21, 0.004, 0.115);
    g.use('painted').box(0xf2efe4, -0.012, 0.0022, 0.004, 0.16, 0.0015, 0.072);
    g.use('painted').box(0x2a2c30, -0.03, 0.0032, 0.022, 0.09, 0.001, 0.008);
    g.use('painted').box(0x2a2c30, -0.012, 0.0032, 0.0, 0.12, 0.001, 0.006);
    envGeo = g.build();
  }
  return realMesh(envGeo, { snow: false, cast: false });
}

export class Parking {
  constructor(g, o = {}) {
    this.g = g;
    this.day = 0;             // days since the session began (dawn()): the absolute game time's day
    this.recs = new Map();    // car -> the parking: { car, bay, rule, lot, arrive, next, discSet, ticket }
    this.wardens = o.wardens ?? true;
    this.rand = Math.random;
    this.open = null;         // what Ove holds: { kind: 'disc' | 'lapp', ... } (g.overlay is set meanwhile)
    this.calls = [];          // tickets written wrong, still to be phoned about
    this.stats = { checks: 0, tickets: 0, wrong: 0, paid: 0, refunded: 0, calls: 0, set: null, said: [] };
    this.cells = new Map();
    for (const b of parkingBays) {
      const k = this.key(Math.floor(b.x / PSK.cell), Math.floor(b.z / PSK.cell));
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(b);
    }
    this.tk = 0;
    pskivaUI.init();
    hud.portraits.kundtjanst = pskivaUI.logo();
  }
  key(i, j) { return i * 4096 + j; }
  now() { return this.day * 1440 + this.g.clockMin; }
  dawn() { this.day++; }
  exp(mean) { return -mean * Math.log(1 - this.rand() * 0.999); }
  ruleOf(b) { return b.rule === false ? null : b.rule || parkingLots[b.lot]?.rule || null; }

  // Is the car (centre and heading) in bay b? Either way round, a little slack all round.
  inside(b, c) {
    const dx = c.x - b.x, dz = c.z - b.z, s = Math.sin(b.yaw), k = Math.cos(b.yaw);
    const along = dx * s + dz * k, across = dx * k - dz * s;
    return Math.abs(across) < b.w / 2 + 0.25 && Math.abs(along) < b.l / 2 + 0.7 && Math.abs(Math.sin(c.yaw - b.yaw)) < 0.55;
  }
  // The bay with a rule that car c stands in, or null.
  bayAt(c) {
    const i = Math.floor(c.x / PSK.cell), j = Math.floor(c.z / PSK.cell);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const b of this.cells.get(this.key(i + di, j + dj)) || []) if (this.ruleOf(b) && this.inside(b, c)) return b;
    }
    return null;
  }

  // A parking begins: the car has stopped in bay b (a ticket still on it: that one goes on).
  begin(c, b) {
    const old = this.recs.get(c);
    if (old?.ticket) return old;
    const t = this.now();
    const r = { car: c, bay: b, rule: this.ruleOf(b), lot: parkingLots[b.lot], arrive: Math.floor(t), next: t + PSK.first[0] + this.exp(PSK.first[1]), discSet: false, ticket: null };
    this.recs.set(c, r);
    return r;
  }
  drop(r) { this.detach(r); this.recs.delete(r.car); }

  // The disc in car c's window as an absolute time: its 12-hour dial read as the time nearest to the
  // arrival (within six hours either way), or null with no disc in the window.
  discAt(c, arrive) {
    const p = c.pskiva;
    if (!p?.on) return null;
    const d0 = arrive - ((((arrive - p.dial) % 720) + 720) % 720);
    return arrive - d0 <= 360 ? d0 : d0 + 720;
  }

  update(dt) {
    const g = this.g, c = g.playerCar;
    if (c && !c.dead) {
      let r = this.recs.get(c);
      // (in a car with a ticket on it some other way than by E - a scene seated him, the race's grid:
      // he takes it as soon as the car stands and no story day is on; till then it rides along)
      if (r?.ticket && Math.abs(c.speed) < PSK.slow && !g.inDialog && !g.overlay && !g.failWait && g.missions.state === 'idle') this.take(c);
      if (r && !this.inside(r.bay, c)) { if (!r.ticket) this.drop(r); r = null; }
      if (!r && Math.abs(c.speed) < PSK.slow) { const b = this.bayAt(c); if (b) this.begin(c, b); }
    }
    if ((this.tk += dt) < 0.25) return;
    this.tk = 0;
    for (const r of [...this.recs.values()]) {
      const car = r.car;
      if (car.disposed || car.dead) { this.drop(r); continue; }
      if (!r.ticket && !this.inside(r.bay, car)) { this.drop(r); continue; }
      this.round(r);
    }
    this.spot();
    this.phone();
  }

  // The attendant's round past a parking: due, Ove gone, and something wrong -> a ticket.
  round(r) {
    const g = this.g, car = r.car, t = this.now();
    const away = g.playerCar !== car && dist(g.player.x, g.player.z, car.x, car.z) >= PSK.away;
    r.awayT = away ? (r.awayT || 0) + 0.25 : 0;
    if (!this.wardens || r.ticket || !r.rule || t < r.next || r.awayT < PSK.awaySecs) return;
    this.check(car, { at: t });
  }
  // A round now (tests call it wherever Ove is): o.err writes that error on the ticket (or none:
  // o.err === null), o.misread reads a right disc wrong. Returns the ticket or null.
  check(car, o = {}) {
    const r = this.recs.get(car), t = o.at ?? this.now();
    if (!r || r.ticket || !r.rule) return null;
    r.next = t + PSK.gap[0] + this.exp(PSK.gap[1]);
    this.stats.checks++;
    const v = this.offence(r, t);
    if (v) return this.issue(r, t, v, o);
    // (a disc that is right, read wrong: once a parking, at its first round)
    if (r.rule.disc != null && car.pskiva?.on && !r.readOnce) {
      r.readOnce = true;
      if (o.misread || (o.misread === undefined && this.rand() < PSK.misread)) return this.issue(r, t, { why: 'overtime' }, { ...o, err: 'misread' });
    }
    r.readOnce = true;
    return null;
  }
  offence(r, t) {
    const rule = r.rule;
    if (rule.permit) return within(t, rule.hours) ? { why: rule.permit } : null;
    if (!within(t, rule.hours)) return null;
    const D = this.discAt(r.car, r.arrive);
    if (D == null) return { why: 'nodisc' };
    if (D > ceil30(t)) return { why: 'ahead' };
    if (regMin(D, t, rule.hours) > rule.disc) return { why: 'overtime' };
    return null;
  }
  // The ticket: what she writes (o.err: an error of hers, else one in PSK.wrong at random).
  issue(r, t, v, o = {}) {
    const g = this.g, car = r.car, disc = this.discAt(car, r.arrive);
    const tk = {
      no: `${1000 + Math.floor(this.rand() * 9000)} ${1000 + Math.floor(this.rand() * 9000)}`,
      t, arrive: r.arrive, why: v.why, rule: r.rule, plate: car.plate, make: makeOf(car), place: r.lot?.name || 'Parkeringen', bay: r.bay.n,
      disc, fine: PSK.fine, err: null, warden: 11 + Math.floor(this.rand() * 80), day: g.storyDayNow?.() ?? 1, saab: car.kind === 'saab900',
    };
    tk.what = v.why === 'overtime' ? `Parkerat längre än tillåten tid (${limitText(r.rule.disc)})` : OFFENCE[v.why] || 'Felparkering';
    let err = o.err !== undefined ? o.err : this.rand() < PSK.wrong ? pick(['plate', 'make', 'time', 'place', ...(disc != null ? ['disc'] : [])]) : null;
    if (err === 'disc' && disc == null) err = 'time';
    if (err) this.mistake(tk, err, r);
    r.ticket = tk;
    this.stats.tickets++;
    if (tk.err) this.stats.wrong++;
    this.attach(r);
    return tk;
  }
  // What she got wrong: the field, and what it should have said.
  mistake(tk, err, r) {
    if (err === 'plate') {
      const s = tk.plate, idx = [...s].map((ch, i) => (LOOKALIKE[ch] ? i : -1)).filter((i) => i >= 0);
      const i = idx.length ? idx[Math.floor(this.rand() * idx.length)] : 0;
      tk.err = { field: 'plate', real: s };
      tk.plate = s.slice(0, i) + (LOOKALIKE[s[i]] || 'X') + s.slice(i + 1);
    } else if (err === 'make') {
      tk.err = { field: 'make', real: tk.make };
      tk.make = tk.make === 'Saab' ? 'Volvo' : 'Saab';
    } else if (err === 'time') {
      tk.err = { field: 'time', real: tk.t };
      tk.t = tk.arrive - 30 - Math.floor(this.rand() * 60);
    } else if (err === 'place') {
      const others = Object.values(parkingLots).filter((l) => l.rule?.disc && l.name !== tk.place);
      tk.err = { field: 'place', real: tk.place };
      tk.place = others.length ? others[Math.floor(this.rand() * others.length)].name : 'Kyrkans parkering';
    } else if (err === 'disc' || err === 'misread') {
      // (an 1 read as an 11, a 2 as a 12: two hours earlier; or as long before as makes it run out)
      const D = tk.disc, lim = r.rule.disc ?? 120;
      tk.err = { field: 'disc', real: D, misread: err === 'misread' };
      tk.disc = Math.min(D - 120, ceil30(tk.t - lim - 30) - 30);
      if (err === 'misread') tk.what = `Parkerat längre än tillåten tid (${limitText(lim)})`;
    }
  }

  // The envelope under the driver's wiper (+x local: Swedish cars are left-hand drive), on the glass
  // just above the blade; a car without a profile (the tractor) gets it at the foot of its screen.
  attach(r) {
    const car = r.car, m = car.model, P = m?.P, f = P?._fn;
    const mesh = envelope();
    mesh.name = 'car:ticket';
    mesh.userData.noAO = true;
    const x = 0.33;
    if (f && P.wiperZ != null) {
      const z = P.wiperZ, y0 = f.topY(z, x), y1 = f.topY(z - 0.1, x);
      const u = new THREE.Vector3(0, y1 - y0, -0.1).normalize(), n = new THREE.Vector3(0, 0.1, y1 - y0).normalize();
      mesh.position.set(x, y0 + 0.02, z).addScaledVector(u, 0.075).addScaledVector(n, 0.006);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      mesh.rotateY((this.rand() - 0.5) * 0.25);
    } else {
      // (no loft profile: on the bonnet, a metre from the front, where a ray from above meets the body)
      const z = (P?.z1 ?? (m?.len ?? 4.5) / 2) - 0.95;
      const hit = m?.body ? new THREE.Raycaster(new THREE.Vector3(x, (m.height ?? 2) + 2, z), new THREE.Vector3(0, -1, 0)).intersectObject(new THREE.Mesh(m.body), false)[0] : null;
      mesh.position.set(x, (hit ? hit.point.y : (m?.height ?? 1.5) * 0.6) + 0.004, z);
    }
    (car.tilt || car.root).add(mesh);
    r.mesh = mesh;
  }
  detach(r) { if (r.mesh) { r.mesh.parent?.remove(r.mesh); r.mesh = null; } }

  ticketOn(car) { return !!this.recs.get(car)?.ticket; }

  // Ove on foot by a car of his with a ticket on it: he sees it (once a ticket).
  spot() {
    const g = this.g, p = g.player;
    if (g.playerCar || g.inDialog || g.overlay || p.state !== 'normal') return;
    for (const r of this.recs.values()) {
      const tk = r.ticket;
      if (!tk || tk.seen || dist(p.x, p.z, r.car.x, r.car.z) > PSK.seen) continue;
      tk.seen = true;
      this.say(pick(LINES.seen), 2.4);
      hud.toast('Det sitter en lapp under torkarbladet. <b>E</b> tar den.', 'warn');
    }
  }
  say(text, secs = 2.2) { this.stats.said.push(text); return this.g.say(this.g.player, text, secs); }

  // ------------------------------------------------------------------------------------------
  // The prompt line, in a car stopped in a bay with a rule

  prompt() {
    const g = this.g, c = g.playerCar;
    if (!c || g.overlay || Math.abs(c.speed) > PSK.slow) return null;
    const r = this.recs.get(c);
    if (!r?.rule) return null;
    if (r.rule.disc != null) {
      const D = r.discSet ? this.discAt(c, r.arrive) : null;
      return D != null ? `P-skiva ${hhmm(D)} <span class="pr-dim">· <b>G</b> ändra</span>` : `<b>G</b> Ställ in p-skivan <span class="pr-dim">· ${r.lot?.sign || ''}</span>`;
    }
    return `<span class="pr-dim">${PERMIT[r.rule.permit] || ''}</span>`;
  }

  // ------------------------------------------------------------------------------------------
  // The minigame: the disc in Ove's hands

  canSet() {
    const g = this.g, c = g.playerCar;
    if (!c || g.inDialog || g.failWait || g.overlay || Math.abs(c.speed) > PSK.slow) return null;
    const r = this.recs.get(c);
    return r?.rule?.disc != null && !r.ticket ? r : null;
  }
  openDisc() {
    const r = this.canSet();
    if (!r) return false;
    const g = this.g, car = r.car;
    // (each car has its disc: the Saab's lies at 12; anybody else's where its owner left it)
    car.pskiva ||= { dial: car.name === 'saab' ? 0 : 30 * Math.floor(this.rand() * 24), on: false };
    this.open = { kind: 'disc', r, car, dial: car.pskiva.dial, t: 0, held: 0, rep: 0 };
    g.overlay = 'pskiva';
    pskivaUI.showDisc({ dial: car.pskiva.dial, clock: g.clockText(), sign: r.lot?.sign || '', limit: limitText(r.rule.disc), hours: r.rule.hours });
    audio.noise(0.18, 0.08, 2600, 'bandpass', 0, 0.8);
    return true;
  }
  // Half an hour on (+1) or back (-1).
  turn(k) {
    const o = this.open;
    if (o?.kind !== 'disc') return;
    o.dial = (((o.dial + k * 30) % 720) + 720) % 720;
    pskivaUI.turn(k);
    audio.tick();
  }
  confirmDisc() {
    const o = this.open, g = this.g;
    if (o?.kind !== 'disc') return;
    const r = o.r, car = o.car;
    car.pskiva = { dial: o.dial, on: true };
    r.discSet = true;
    const D = this.discAt(car, r.arrive);
    this.stats.set = { dial: o.dial, arrive: r.arrive, correct: ceil30(r.arrive), disc: D, at: this.now() };
    this.close();
    pskivaUI.hideDisc(true);
    hud.toast(`P-skivan ligger i rutan: <b>${hhmm(D)}</b>`);
    this.say(GARAGE_DOOR.shut[0], 1.3);
  }
  cancelDisc() { if (this.open?.kind !== 'disc') return; this.close(); pskivaUI.hideDisc(false); }
  close() { this.open = null; this.g.overlay = null; }

  // While g.overlay is set (main.js handleOneShots, instead of everything else): the keys.
  overlay(dt) {
    const o = this.open;
    if (!o) { this.g.overlay = null; return; }
    // (a scene begins: it goes back into the glove box / his pocket)
    if (this.g.inDialog) { if (o.kind === 'disc') this.cancelDisc(); else this.closeTicket(); return; }
    o.t += dt;
    if (o.kind === 'disc') {
      const later = input.keyPressed('KeyE') || input.keyPressed('KeyD') || input.keyPressed('ArrowRight') || input.padPressed(15) || input.padPressed(5);
      const earlier = input.keyPressed('KeyQ') || input.keyPressed('KeyA') || input.keyPressed('ArrowLeft') || input.padPressed(14) || input.padPressed(4);
      if (later) { this.turn(1); o.held = 0; } else if (earlier) { this.turn(-1); o.held = 0; }
      // (held: on by itself, after a moment, four steps a second... then faster)
      const hl = input.key('KeyE') || input.key('KeyD') || input.key('ArrowRight') || input.padDown(15) || input.padDown(5);
      const hr = input.key('KeyQ') || input.key('KeyA') || input.key('ArrowLeft') || input.padDown(14) || input.padDown(4);
      if ((hl || hr) && !(later || earlier)) {
        o.held += dt;
        if (o.held > 0.42) { o.rep -= dt; if (o.rep <= 0) { this.turn(hl ? 1 : -1); o.rep = o.held > 1.6 ? 0.08 : 0.16; } }
      } else if (!(later || earlier)) { o.held = 0; o.rep = 0; }
      pskivaUI.clock(this.g.clockText());
      if (o.t > 0.25 && (input.keyPressed('KeyF') || input.keyPressed('Enter') || input.keyPressed('Space') || input.padPressed(0) || input.padPressed(1))) this.confirmDisc();
      else if (o.t > 0.25 && (input.keyPressed('Escape') || input.keyPressed('KeyG') || input.keyPressed('KeyP') || input.padPressed(12) || input.padPressed(9) || input.padPressed(3))) this.cancelDisc();
      return;
    }
    if (o.kind === 'lapp') {
      const tk = o.tk;
      // Paid as soon as he looks at it; then he reads it.
      if (!o.paid && o.t > 0.8) { o.paid = true; this.g.addCoins(-tk.fine); this.stats.paid += tk.fine; pskivaUI.stamp(tk.fine); audio.stamp(); }
      if (!o.said && o.t > 1.5) {
        o.said = true;
        if (tk.err) {
          pskivaUI.markWrong(tk.err.field);
          const w = LINES.wrong, f = tk.err.field;
          this.say(f === 'make' && tk.saab ? w.makeSaab : w[f] || w.time, 3.2);
        } else this.say(pick(LINES.paid), 2.6);
      }
      if (o.t > 1.7 && (input.pressed('interact') || input.pressed('skip') || input.keyPressed('KeyF') || input.keyPressed('Escape') || input.padPressed(1) || input.padPressed(9))) this.closeTicket();
    }
  }

  // ------------------------------------------------------------------------------------------
  // The ticket in his hands

  take(car) {
    const r = this.recs.get(car), g = this.g;
    if (!r?.ticket || g.overlay) return false;
    const tk = r.ticket;
    r.ticket = null;
    this.detach(r);
    r.next = this.now() + PSK.again;
    tk.seen = true;
    this.open = { kind: 'lapp', tk, car, t: 0, paid: false, said: false };
    g.overlay = 'lapp';
    const day = Math.max(1, Math.min(7, tk.day));
    pskivaUI.showTicket({ ...tk, dayText: `Dag ${day}, ${DAYS[day - 1].toLowerCase()}`, time: hhmm(tk.t), discText: tk.disc != null ? hhmm(tk.disc) : tk.rule?.disc != null ? 'Saknas' : '–' });
    audio.noise(0.3, 0.12, 3200, 'bandpass', 0, 0.7);
    return true;
  }
  closeTicket() {
    const o = this.open;
    if (o?.kind !== 'lapp') return;
    const tk = o.tk;
    if (!o.paid) { this.g.addCoins(-tk.fine); this.stats.paid += tk.fine; }
    this.close();
    pskivaUI.hideTicket();
    // Written wrong: Ove phones them, once he has put it in his pocket.
    if (tk.err) this.calls.push({ tk, t: 0 });
    this.g.save?.();
  }

  // The call to P-Ordning AB about a ticket written wrong: when the phone is free and nothing else
  // is on (a scene, the disc, the cold), Ove dials. They cancel it and pay him back.
  phone() {
    const g = this.g, c = this.calls[0];
    if (!c || g.interrupts.call || g.inDialog || g.overlay || g.cold?.busy || g.failWait) return;
    if ((c.t += 0.25) < 1.2) return;
    this.calls.shift();
    this.stats.calls++;
    g.patrol?.cancelWriting?.('Ove ringer P-Ordning');
    g.interrupts.outCall('kundtjanst', 'P-Ordning AB', LINES.call, 'Kundtjänst').then(() => {
      g.addCoins(c.tk.fine);
      this.stats.refunded += c.tk.fine;
      hud.toast(`P-Ordning AB makulerade kontrollavgiften. <b>+${c.tk.fine} kr</b>`, 'good');
      g.save?.();
    });
  }
}
