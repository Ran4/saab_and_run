// Avbrott (DESIGN.md 4.3): in free roam a neighbour phones every 70-110 s (the first ~45 s in),
// and Ove, grumbling, goes and helps. The call cancels any report he was writing (that's the
// joke). An errand is a short list of stages (stages.js) with a patience timer.
//
// API:
//   interrupts.update(dt)                main.js, every frame
//   interrupts.radioOnly(who, text)      a short call for flavour (missions use it; no errand)
//   interrupts.force(id, { quick })      start errand `id` now (quick: skip the phone call)
//   interrupts.abort()                   drop the current errand silently (a mission started)
//   interrupts.hangUp()                  cut off a mission's flavour call (radioOnly) still going
//   interrupts.active                    { tpl, ctx, stages, i, stage, timer } or null
//   interrupts.call                      the ringing / talking phone call or null
//   interrupts.onPhone                   Ove has the phone at his ear
//   interrupts.auto                      the scheduler runs (main.js: off in ?test unless &calls)
//   interrupts.ringing                   the phone is ringing and nobody has answered yet
//   TEMPLATES                            the nine errands (id, who, title, lines, stages ...; `after`:
//                                        only once that many story days are done)

import { CHARS } from '../actors/models.js';
import { lm } from '../world/layout.js';
import { audio } from '../audio.js';
import { hud } from './hud.js';
import { newCtx, disposeCtx, holdAt, fetch, pickup, dropoff, goto, escort, catchCat } from './stages.js';
import { pick, dist } from '../util.js';

// Three spots on the path in front of Rune and Anita's door, from the door out to the walkway.
function snowSpots(where) {
  return [0, 1.6, 3.2].map((ahead, k) => (g) => {
    const p = lm(where), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const side = [0.35, -0.45, 0.3][k];
    let x = p.x + fx * ahead + fz * side, z = p.z + fz * ahead - fx * side;
    if (!g.spotFree(x, z)) { x = p.x + fx * ahead; z = p.z + fz * ahead; }
    return { x, z, yaw: p.yaw };
  });
}

export const TEMPLATES = [
  {
    id: 'element', who: 'anita', title: 'Elementet klickar', patience: 90,
    lines: ['Ove? Det är Anita. Förlåt att jag stör.', 'Det klickar i elementet hos oss igen. Rune blir så orolig av det.'],
    ove: 'Jaja. Jag kommer.',
    stages: () => [holdAt({ at: 'runeHouse', secs: 3, label: 'Lufta elementet', text: 'Lufta elementet hos Anita och Rune', work: 'wall' })],
    thanks: 'Tack, Ove. Du är snäll, vad du än säger.', fail: 'Det gör inget, Ove. Vi tar på oss en tröja till.',
  },
  {
    id: 'forskolan', who: 'parvaneh', title: 'Hämta Nasanin', needs: ['nasanin'], patience: 150,
    lines: ['Ove! Hej! Det är Parvaneh.', 'Kan du hämta Nasanin på förskolan? Patrick har... gjort något med handen.'],
    ove: 'Vad har han gjort nu då?',
    stages: () => [
      pickup({ who: 'nasanin', at: 'preschool', text: 'Hämta Nasanin på förskolan', hello: 'Ove! Ove! Ove!' }),
      dropoff({ who: 'nasanin', at: 'parvanehHouse', radius: 6, text: 'Lämna Nasanin hemma hos Parvaneh', bye: 'Hej då, Ove!' }),
    ],
    thanks: 'Tack, Ove! Du är bäst. Säg inte det till Patrick.', fail: 'Jag hämtade henne själv. Det gick bra. Typ.',
  },
  {
    id: 'mobilen', who: 'jimmy', title: 'Jimmys mobil', patience: 140,
    lines: ['Tjena Ove! Det är Jimmy. Jag ringer från Adrians telefon.', 'Jag har glömt min mobil på torget i centrum. Kan du kolla? Snälla?'],
    ove: 'Vem glömmer sin telefon på ett torg?',
    stages: () => [
      fetch({ at: 'centrum', item: 'phone', label: 'Jimmys mobil', text: 'Hitta Jimmys mobil på torget i centrum', rMin: 2, rMax: 7, got: 'Jimmys mobil. Skärmen är sprucken. Typiskt.' }),
      goto({ who: 'jimmy', radius: 2.6, text: 'Lämna mobilen till Jimmy' }),
    ],
    thanks: 'Ove, du är kung! Jag bjuder på en macka!', fail: 'Ingen fara, Ove. Jag köper en ny. Eller lånar.',
  },
  {
    id: 'punktering', who: 'adrian', title: 'Punktering', patience: 100,
    lines: ['Eh, Ove? Det är Adrian.', 'Jag har fått punktering på cykeln vid cykelförrådet. Jag vet inte hur man... lagar sånt.'],
    ove: 'Ingen kan någonting nu för tiden.',
    stages: () => [holdAt({ at: 'bikeShed', secs: 4, label: 'Laga punkteringen', text: 'Laga Adrians punktering vid cykelförrådet', work: 'low' })],
    thanks: 'Tack, Ove! Du borde ha en egen kanal.', fail: 'Okej... jag går väl då.',
  },
  {
    id: 'nyckeln', who: 'patrick', title: 'Utelåst', needs: ['parvaneh'], patience: 110,
    lines: ['Hej Ove, det är Patrick. Jag har låst mig ute.', 'Parvaneh sa att du har en reservnyckel. Hon sa att du har reservnycklar till... allt.'],
    ove: 'Klart jag har.',
    stages: () => [
      fetch({ at: 'oveHouse', item: 'key', label: 'reservnyckeln', text: 'Hämta reservnyckeln hemma hos dig', rMin: 0.3, rMax: 1.0 }),
      holdAt({ at: 'parvanehHouse', secs: 1.5, label: 'Lås upp', text: 'Lås upp hos Parvaneh och Patrick', work: 'wall' }),
    ],
    thanks: 'Tack, Ove! Jag ska aldrig mer... ja. Tack.', fail: 'Det är lugnt, Ove. Jag klättrade in genom fönstret.',
  },
  {
    id: 'rune', who: 'anita', title: 'Rune har rullat iväg', needs: ['rune'], patience: 130,
    lines: ['Ove... det är Anita. Rune är borta.', 'Han rullade iväg medan jag hängde tvätt. Han kan inte ha kommit långt.'],
    ove: 'Jag letar.',
    stages: () => [escort({ who: 'rune', to: 'runeHouse', push: true, max: 80, findText: 'Hitta Rune. Han kan inte ha kommit långt.', bringText: 'Rulla hem Rune till Anita', hello: '...Ove?' })],
    thanks: 'Tack, Ove. Jag vet inte vad vi skulle göra utan dig.', fail: 'Grannarna hittade honom vid busshållplatsen. Han frös.',
  },
  {
    id: 'skotta', who: 'anita', title: 'Snöskottning', needs: ['rune'], patience: 100,
    lines: ['Ove, det är Anita igen. Förlåt.', 'Det har drivit igen framför dörren. Rune kommer inte ut med rullstolen.'],
    ove: 'Hmpf. Jag tar min egen snöskyffel.',
    stages: () => [holdAt({ spots: snowSpots('runeHouse'), secs: 1.6, label: 'Skotta', text: 'Skotta framför Anitas och Runes dörr', mounds: true, work: 'shovel' })],
    thanks: 'Nu kommer han ut igen. Tack, Ove.', fail: 'Vi tar det i morgon, Ove.',
  },
  {
    // Only once the cat lives at Ove's (day 4: "Den får stanna. Tills vidare."), and it is his cat
    // that has run off; his "Det är inte min katt." is denial now.
    id: 'katten', who: 'sara', title: 'Katten har rymt', needs: ['sara'], patience: 120, after: 4,
    lines: ['Ove! Det är Sara. Din katt har rymt!', 'Han sprang mot cykelförrådet! Du MÅSTE hitta honom!'],
    ove: 'Det är inte min katt.',
    stages: () => [
      catchCat({ near: 'bikeShed', text: 'Fånga katten vid cykelförrådet' }),
      goto({ who: 'sara', radius: 2.4, text: 'Bär hem katten till Sara', onFoot: true }),
    ],
    thanks: 'Du hittade honom! Ove, du är världens bästa!', fail: 'Han sprang hem till dig själv. Men han var jättekall.',
  },
  {
    id: 'skjuts', who: 'jimmy', title: 'Skjuts till jobbet', patience: 150,
    lines: ['Ove! Jimmy här. Bussen har gått.', 'Kan du skjutsa mig till centrum? Jag står vid busshållplatsen.'],
    ove: 'Det går en buss om tjugo minuter.',
    stages: () => [
      // He waits at the bus stop (the bus has gone), out of sight of the Saab, and he rides: a
      // walk to centrum with Ove doesn't count.
      pickup({ who: 'jimmy', at: 'busStop', needCar: true, text: 'Hämta Jimmy med bil vid busshållplatsen', carText: 'Jimmy väntar vid busshållplatsen. Ta bilen.', hello: 'Tjena! Fin Saab.' }),
      dropoff({ who: 'jimmy', at: 'centrum', radius: 14, needCar: true, carText: 'Jimmy ska åka bil, inte gå.', text: 'Skjutsa Jimmy till centrum', bye: 'Tack, Ove! Du är en klippa!' }),
    ],
    thanks: 'Jag kom i tid! För första gången!', fail: 'Jag tog bussen till slut. Den var full.',
  },
];
const ANSWER = ['Ja?', 'Vad är det nu då?', 'Ove.', 'Ja, det är Ove.'];
const DONE = ['Hmpf.', 'Det var ingenting.', 'Ingen kan någonting nu för tiden.', 'Jaja.'];

const nameOf = (who) => CHARS[who]?.name || who;
const lineSecs = (s) => 1.3 + s.length * 0.045;

export class Interruptions {
  constructor(game) {
    this.g = game;
    this.nextT = 45;
    this.active = null;
    this.call = null;
    this.onPhone = false;
    this.auto = true;
    this.lastId = null;
    this.done = 0;
    this.failed = 0;
  }

  get stage() { return this.active?.stage || null; }
  // Ringing, not yet answered (the pause menu stops the bell and starts it again after).
  get ringing() { return !!this.call && this.call.k === 0; }

  update(dt) {
    const g = this.g;
    const free = g.missions.state === 'idle';
    if (this.call) this.updateCall(dt);
    if (this.active) {
      if (!free) this.abort();
      else this.updateErrand(dt);
    }
    // During a story mission (and its outro) nobody calls, and the first call after it comes
    // a good while later, never the moment the outro ends.
    if (!free) { this.nextT = Math.max(this.nextT, 40); return; }
    if (!this.auto || this.active || this.call || g.inDialog) return;
    this.nextT -= dt;
    if (this.nextT <= 0) {
      // Not in the middle of a chase, not while Ove is lying in the snow, and not as he walks up
      // to the neighbour whose day it is (the call would be cut off by their scene a second later).
      const giver = g.missions.offered ? g.npc(g.missions.offered.giver) : null, f = g.focus();
      if (g.patrol.pursuit || (!g.playerCar && g.player.state !== 'normal')) this.nextT = 6;
      else if (giver && giver.state === 'normal' && dist(giver.x, giver.z, f.x, f.z) < 14) this.nextT = 8;
      else this.ring();
    }
  }

  // ------------------------------------------------------------------------------------------
  // The phone call

  ring(id = null, opts = {}) {
    const g = this.g;
    let tpl = id ? TEMPLATES.find((t) => t.id === id) : null;
    if (!tpl) tpl = pick(TEMPLATES.filter((t) => t.id !== this.lastId && this.available(t)));
    if (!tpl) { this.nextT = 10; return false; }
    this.lastId = tpl.id;
    g.patrol.cancelWriting('telefonen ringde');
    const script = [];
    let t = 2.6;
    script.push([t, () => { audio.ring(false); hud.answerCall(); this.onPhone = true; const a = pick(ANSWER); hud.phone('ove', 'Ove', a); g.say(g.player, a, 1.4); }]);
    t += 1.2;
    for (const line of tpl.lines) { script.push([t, () => { hud.phone(tpl.who, nameOf(tpl.who), line); this.murmur(tpl.who, line); }]); t += lineSecs(line); }
    script.push([t, () => { hud.phone('ove', 'Ove', tpl.ove); g.say(g.player, tpl.ove, 2.2); }]);
    t += lineSecs(tpl.ove) * 0.8;
    script.push([t, () => { hud.endCall(); this.onPhone = false; this.call = null; this.start(tpl); }]);
    this.call = { tpl, t: 0, script, k: 0 };
    audio.ring(true);
    hud.incomingCall(tpl.who, nameOf(tpl.who), tpl.title);
    return true;
  }

  available(t) {
    const g = this.g;
    if (t.after && g.missions.index < t.after) return false;
    // Everyone involved has to be around (not riding in a mission car, not busy elsewhere).
    for (const k of [t.who, ...(t.needs || [])]) { const n = g.npc(k); if (n && (n.busy || n.car || n.state === 'hidden')) return false; }
    return true;
  }

  murmur(who, text) {
    const n = Math.min(10, Math.round(text.split(/\s+/).length * 0.8));
    for (let k = 0; k < n; k++) setTimeout(() => audio.talk(CHARS[who]?.voice || 300), k * 230);
  }

  updateCall(dt) {
    const c = this.call;
    c.t += dt;
    while (this.call === c && c.k < c.script.length && c.t >= c.script[c.k][0]) c.script[c.k++][1]();
  }

  // A quick call with no errand: ring, one line, gone. Returns a promise for when it has ended.
  radioOnly(who, text, reply = null) {
    const g = this.g;
    return new Promise((resolve) => {
      if (this.call) { g.radio(who, text); resolve(); return; }
      audio.ring(true);
      hud.incomingCall(who, nameOf(who));
      const script = [
        [1.1, () => { audio.ring(false); hud.answerCall(); this.onPhone = true; hud.phone(who, nameOf(who), text); this.murmur(who, text); }],
        [1.1 + lineSecs(text), () => { if (reply) { hud.phone('ove', 'Ove', reply); g.say(g.player, reply, 1.6); } }],
        [1.1 + lineSecs(text) + (reply ? 1.4 : 0), () => { hud.endCall(); this.onPhone = false; this.call = null; resolve(); }],
      ];
      this.call = { tpl: null, t: 0, script, k: 0, radio: true };
    });
  }

  // A mission stage is over (Ove has arrived): a flavour call still ringing or talking is cut off,
  // so an "INTE NU!" never turns up at the next stage.
  hangUp() {
    if (!this.call?.radio) return;
    audio.ring(false); hud.endCall(); this.onPhone = false; this.call = null;
  }

  // ------------------------------------------------------------------------------------------
  // The errand

  force(id, opts = {}) {
    if (this.active) this.abort();
    if (this.call) { audio.ring(false); hud.endCall(); this.onPhone = false; this.call = null; }
    const tpl = TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
    if (opts.quick) { this.g.patrol.cancelWriting('telefonen ringde'); this.lastId = tpl.id; this.start(tpl); }
    else this.ring(tpl.id);
    return tpl.id;
  }

  start(tpl) {
    const g = this.g;
    const ctx = newCtx(tpl);
    const stages = tpl.stages();
    this.active = { tpl, ctx, stages, i: 0, stage: stages[0], timer: tpl.patience ?? 120 };
    this.active.stage.init?.(g, ctx);
    audio.checkpoint();
    if (!this.told) { this.told = true; hud.toast('Ett avbrott. Hjälp grannen innan tålamodet tar slut.', 'warn', 6500); }
  }

  updateErrand(dt) {
    const g = this.g, a = this.active;
    a.timer -= dt;
    if (a.timer <= 0) { this.fail(); return; }
    const r = a.stage.update(g, a.ctx, dt);
    if (r === 'done') {
      a.stage.cleanup?.(g, a.ctx);
      a.i++;
      if (a.i >= a.stages.length) { this.complete(); return; }
      a.stage = a.stages[a.i];
      a.stage.init?.(g, a.ctx);
      audio.checkpoint();
    } else if (r && r.fail) this.fail(r.fail);
  }

  finish() {
    const a = this.active;
    if (!a) return;
    a.stage?.cleanup?.(this.g, a.ctx);
    disposeCtx(this.g, a.ctx);
    this.active = null;
    this.nextT = 70 + Math.random() * 40;
  }

  complete() {
    const g = this.g, tpl = this.active.tpl;
    this.finish();
    this.done++;
    const kr = 30 + Math.round(Math.random() * 6) * 5;
    g.patrol.addOrdning(10);
    g.addCoins(kr);
    audio.jingle('complete');
    hud.showBanner('KLART', `${tpl.title} · +10 Ordning · +${kr} kr`, 'good', 2200, 'Avbrott');
    setTimeout(() => g.radio(tpl.who, tpl.thanks), 900);
    setTimeout(() => { const l = pick(DONE); if (!g.playerCar) g.say(g.player, l, 1.6); }, 2600);
  }

  fail(reason = '') {
    const g = this.g, tpl = this.active.tpl;
    this.finish();
    this.failed++;
    g.patrol.addOrdning(-10);
    audio.jingle('fail');
    hud.showBanner('FÖR SENT', reason || tpl.title, 'bad', 2200, 'Avbrott');
    setTimeout(() => g.radio(tpl.who, tpl.fail), 900);
  }

  // A story mission starts: drop the errand without blame. A call cut off by it (Ove walked up to the
  // day's giver while it rang) is tried again a good while later, never right after the scene.
  abort() {
    if (this.call && !this.call.radio) { audio.ring(false); hud.endCall(); this.onPhone = false; this.call = null; this.nextT = Math.max(this.nextT, 45); }
    if (this.active) { this.finish(); this.nextT = 45; }
  }

  // ------------------------------------------------------------------------------------------
  // For main.js's HUD

  panel() {
    const a = this.active;
    if (!a) return null;
    const s = a.stage, o = s.obj?.(this.g) || {};
    return { kicker: 'Avbrott', title: a.tpl.title, text: s.sub || s.text, timer: a.timer, bar: o.bar, barLabel: o.barLabel };
  }
  target() { const s = this.stage; return s ? (s.altTarget?.(this.g) || s.target?.(this.g) || null) : null; }
  markers() {
    const s = this.stage;
    if (!s) return [];
    const out = [...(s.markers?.(this.g) || [])];
    const t = this.target();
    if (t) out.push({ type: 'errand', x: t.x, z: t.z, edge: true });
    return out;
  }
  tags() { return this.stage?.tags?.(this.g) || []; }
  prompt() { return this.stage?.prompt?.(this.g) || null; }
}
