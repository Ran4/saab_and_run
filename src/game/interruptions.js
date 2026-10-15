// Avbrott (DESIGN.md 4.3): in free roam a neighbour phones every 70-110 s (the first ~45 s in),
// and Ove, grumbling, goes and helps. The call cancels any report he was writing (that's the
// joke). An errand is a short list of stages (stages.js) with a patience timer.
//
// API:
//   interrupts.update(dt)                main.js, every frame
//   interrupts.radioOnly(who, text)      a short call for flavour (missions use it; no errand)
//   interrupts.outCall(who, name, lines, sub)   Ove phones somebody (game/pskiva.js: P-Ordning AB
//                                        about a ticket written wrong): [[who, text]...] in turn
//   interrupts.force(id, { quick })      start errand `id` now (quick: skip the phone call)
//   interrupts.abort()                   drop the current errand (a mission started: no blame; the
//                                        neighbour says it's fine on the radio once the intro is over)
//   interrupts.hangUp()                  cut off a mission's flavour call (radioOnly) still going
//   interrupts.active                    { tpl, ctx, stages, i, stage, timer (null: none) } or null
//   interrupts.retry                     a failed errand waiting for E (try again) or Q (give up):
//                                        { tpl, t, reason } (tpl.retry: Rune's, once he has died)
//   interrupts.call                      the ringing / talking phone call or null
//   interrupts.onPhone                   Ove has the phone at his ear
//   interrupts.auto                      the scheduler runs (main.js: off in ?test unless &calls)
//   interrupts.ringing                   the phone is ringing and nobody has answered yet
//   TEMPLATES                            the nine errands (id, who, title, lines, stages ...; `after`:
//                                        only once that many story days are done; `busy`: what they
//                                        say when a story day takes Ove off their errand)
// Everything said (an errand's who, lines, ove, thanks, fail, busy and its stages' hello / bye;
// ANSWER, DONE) is in script.js ERRANDS, by the same id.

import { CHARS } from '../actors/models.js';
import { lm } from '../world/layout.js';
import { audio } from '../audio.js';
import { voice } from '../voice.js';
import { hud } from './hud.js';
import { newCtx, disposeCtx, holdAt, fetch, pickup, dropoff, goto, escort, catchCat } from './stages.js';
import { ERRANDS as E, ERRAND_BUSY, ANSWER, DONE } from './script.js';
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
    // Only after day 3: until then Ove's elementnyckel is in Rune's Volvo ("Tom krok."), and day 3 is
    // the day he gets it back. (It needs Rune: Anita says the clicking worries him.)
    id: 'element', ...E.element, title: 'Elementet klickar', needs: ['rune'], patience: 90, after: 3,
    stages: () => [holdAt({ at: 'runeHouse', secs: 3, label: 'Lufta elementet', text: 'Lufta elementet hos Anita och Rune', work: 'wall' })],
  },
  {
    // The new neighbours phone Ove once they have met him (after day 1). ("Patrick... ja. Du vet." fits
    // every day: before day 2 and with his arm in plaster after it.)
    id: 'forskolan', ...E.forskolan, title: 'Hämta Nasanin', needs: ['nasanin'], patience: 150, after: 1,
    stages: () => [
      pickup({ who: 'nasanin', at: 'preschool', text: 'Hämta Nasanin på förskolan', hello: E.forskolan.hello[1] }),
      dropoff({ who: 'nasanin', at: 'parvanehHouse', radius: 6, text: 'Lämna Nasanin hemma hos Parvaneh', bye: E.forskolan.bye[1] }),
    ],
  },
  {
    id: 'mobilen', ...E.mobilen, title: 'Jimmys mobil', patience: 140,
    stages: () => [
      fetch({ at: 'centrum', item: 'phone', label: 'Jimmys mobil', text: 'Hitta Jimmys mobil på torget i centrum', rMin: 2, rMax: 7, got: 'Jimmys mobil. Skärmen är sprucken. Typiskt.' }),
      goto({ who: 'jimmy', radius: 2.6, text: 'Lämna mobilen till Jimmy' }),
    ],
  },
  {
    id: 'punktering', ...E.punktering, title: 'Punktering', patience: 100,
    stages: () => [holdAt({ at: 'bikeShed', secs: 4, label: 'Laga punkteringen', text: 'Laga Adrians punktering vid cykelförrådet', work: 'low' })],
  },
  {
    // (after day 1: before it Patrick hasn't met Ove, let alone heard about his spare keys)
    id: 'nyckeln', ...E.nyckeln, title: 'Utelåst', needs: ['parvaneh'], patience: 110, after: 1,
    stages: () => [
      fetch({ at: 'oveHouse', item: 'key', label: 'reservnyckeln', text: 'Hämta reservnyckeln hemma hos dig', rMin: 0.3, rMax: 1.0 }),
      holdAt({ at: 'parvanehHouse', secs: 1.5, label: 'Lås upp', text: 'Lås upp hos Parvaneh och Patrick', work: 'wall' }),
    ],
  },
  {
    // No time limit: Rune's cold instead (5 minutes from the call wherever he is, much quicker out past
    // the forest), and he can die (game/rune.js, features/implemented/roligare_runeuppdrag.md): then E
    // tries again (onRetry: alive, and lost again) or Q gives up (he stays dead for the rest of the game).
    id: 'rune', ...E.rune, title: 'Rune har rullat iväg', needs: ['rune'], patience: null, retry: true,
    toast: 'Rune har bara sin filt. Han blir kallare för varje minut.',
    stages: () => [escort({ who: 'rune', to: 'runeHouse', push: true, mortal: true, cold: 300, max: 80, findText: 'Hitta Rune. Han kan inte ha kommit långt.', bringText: 'Rulla hem Rune till Anita', hello: E.rune.hello[1] })],
    deadBanner: 'RUNE ÄR DÖD',
    onRetry: (g) => g.rune.revive(g.npc('rune')),
    onGiveUp: (g) => g.rune.givenUp(),
  },
  {
    id: 'skotta', ...E.skotta, title: 'Snöskottning', needs: ['rune'], patience: 100,
    stages: () => [holdAt({ spots: snowSpots('runeHouse'), secs: 1.6, label: 'Skotta', text: 'Skotta framför Anitas och Runes dörr', mounds: true, work: 'shovel' })],
  },
  {
    // Only once the cat lives at Ove's (day 4: "Den får stanna. Tills vidare."), and it is his cat
    // that has run off; his "Det är inte min katt." is denial now.
    id: 'katten', ...E.katten, title: 'Katten har rymt', needs: ['sara'], patience: 120, after: 4,
    stages: () => [
      catchCat({ near: 'bikeShed', text: 'Fånga katten vid cykelförrådet' }),
      goto({ who: 'sara', radius: 2.4, text: 'Bär katten till Sara', onFoot: true }),
    ],
  },
  {
    id: 'skjuts', ...E.skjuts, title: 'Skjuts till jobbet', patience: 150,
    stages: () => [
      // He waits at the bus stop (the bus has gone), out of sight of the Saab, and he rides: a
      // walk to centrum with Ove doesn't count.
      pickup({ who: 'jimmy', at: 'busStop', needCar: true, text: 'Hämta Jimmy med bil vid busshållplatsen', carText: 'Jimmy väntar vid busshållplatsen. Ta bilen.', hello: E.skjuts.hello[1] }),
      dropoff({ who: 'jimmy', at: 'centrum', radius: 14, needCar: true, carText: 'Jimmy ska åka bil, inte gå.', text: 'Skjutsa Jimmy till centrum', bye: E.skjuts.bye[1] }),
    ],
  },
];

// (somebody on the phone who is nobody in the town: P-Ordning AB's customer service, game/pskiva.js)
const EXTRA = { kundtjanst: 'P-Ordning AB' };
const nameOf = (who) => CHARS[who]?.name || EXTRA[who] || who;
// How long a line of a call takes: the voice's clip (or its guess), else the old reading time.
const lineSecs = (who, s) => voice.secs(who, s, 1.3 + s.length * 0.045) + (voice.enabled ? 0.35 : 0);

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
    this.retry = null;    // a failed errand waiting for E (try again) or Q (give up): { tpl, t, reason }
  }

  get stage() { return this.active?.stage || null; }
  // Ringing, not yet answered (the pause menu stops the bell and starts it again after).
  get ringing() { return !!this.call && this.call.k === 0; }

  update(dt) {
    const g = this.g;
    const free = g.missions.state === 'idle';
    // An errand a story day took Ove off: the neighbour says it's fine, once the intro is over.
    const dn = this.dropNote;
    if (dn && !g.inDialog && g.missions.state !== 'intro' && (dn.t += dt) > 1.6) { this.dropNote = null; g.radio(dn.who, dn.text); }
    // A failed errand waiting for E or Q (Rune's, once he has died): nothing else meanwhile.
    if (this.retry) {
      if (!free) this.giveUp();
      else { this.updateRetry(dt); return; }
    }
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
    const a = pick(ANSWER);
    script.push([t, () => { audio.ring(false); hud.answerCall(); this.onPhone = true; this.phoneLine('ove', a, 1.4); }]);
    t += Math.max(1.2, voice.enabled ? lineSecs('ove', a) : 0);
    for (const line of tpl.lines) { script.push([t, () => this.phoneLine(tpl.who, line)]); t += lineSecs(tpl.who, line); }
    script.push([t, () => this.phoneLine('ove', tpl.ove, 2.2)]);
    t += lineSecs('ove', tpl.ove) * (voice.enabled ? 1 : 0.8);
    script.push([t, () => { hud.endCall(); this.onPhone = false; this.call = null; this.start(tpl); }]);
    this.call = { tpl, t: 0, script, k: 0 };
    audio.ring(true);
    hud.incomingCall(tpl.who, nameOf(tpl.who), tpl.title);
    return true;
  }

  available(t) {
    const g = this.g;
    if (t.after && g.missions.index < t.after) return false;
    // (Rune is dead: game/rune.js)
    if (g.runeDead && (t.who === 'rune' || t.needs?.includes('rune'))) return false;
    // Everyone involved has to be around (not riding in a mission car, not busy elsewhere).
    for (const k of [t.who, ...(t.needs || [])]) { const n = g.npc(k); if (n && (n.busy || n.car || n.state === 'hidden')) return false; }
    return true;
  }

  murmur(who, text) {
    const n = Math.min(10, Math.round(text.split(/\s+/).length * 0.8));
    for (let k = 0; k < n; k++) setTimeout(() => audio.talk(CHARS[who]?.voice || 300), k * 230);
  }
  // One line of a call: its toast, and the voice (the neighbour down the line; Ove's own answer dry,
  // with a bubble over him: `bubble` s). With the voices on a call's lines are never dropped (they
  // wait for whoever else is talking) and the call waits for each one (updateCall).
  phoneLine(who, text, bubble = 0) {
    const g = this.g, c = this.call;
    const u = voice.play(who, text, {
      slot: 'main', mode: who === 'ove' ? 'dialog' : 'phone', must: true, ch: who === 'ove' ? g.player : null,
      start: (u) => hud.phone(who, nameOf(who), text, Math.max(3500, (u.dur + 0.9) * 1000)),
    });
    if (u) { if (c) (c.voice ||= []).push(u); if (bubble) g.say(g.player, text, bubble, { voice: false }); return; }
    hud.phone(who, nameOf(who), text);
    if (who === 'ove') { if (bubble) g.say(g.player, text, bubble); } else this.murmur(who, text);
  }

  updateCall(dt) {
    const c = this.call;
    // (with the voices on: the next step waits while a line of this call is still to be said)
    const due = c.k < c.script.length && c.t + dt >= c.script[c.k][0];
    if (due && c.voice?.some((u) => u.state === 'queued' || u.state === 'playing')) return;
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
      const back = reply ? (voice.enabled ? lineSecs('ove', reply) : 1.4) : 0;
      const script = [
        [1.1, () => { audio.ring(false); hud.answerCall(); this.onPhone = true; this.phoneLine(who, text); }],
        [1.1 + lineSecs(who, text), () => { if (reply) this.phoneLine('ove', reply, 1.6); }],
        [1.1 + lineSecs(who, text) + back, () => { hud.endCall(); this.onPhone = false; this.call = null; resolve(); }],
      ];
      this.call = { tpl: null, t: 0, script, k: 0, radio: true };
    });
  }

  // Ove phones somebody himself (feature p-skiva: P-Ordning AB about a ticket written wrong): the card
  // says "Ove ringer", the Swedish ringback tone twice (425 Hz), then the lines in turn ([who, text];
  // Ove's dry, with a bubble over him). It is his own call: no mission stage hangs it up and a story
  // day doesn't cut it off (force() does: then it resolves false). Resolves true when it has ended.
  outCall(who, name, lines, sub = '') {
    return new Promise((resolve) => {
      if (this.call) { resolve(false); return; }
      hud.incomingCall(who, name, sub, { out: true });
      const script = [];
      let t = 0.4;
      for (let k = 0; k < 2; k++) { script.push([t, () => audio.tone(425, 1.0, 'sine', 0.045)]); t += 2.2; }
      script.push([t - 0.6, () => { hud.answerCall(); this.onPhone = true; }]);
      for (const [w, text] of lines) { script.push([t, () => this.phoneLine(w, text, w === 'ove' ? 2.4 : 0)]); t += lineSecs(w, text); }
      script.push([t, () => { hud.endCall(); this.onPhone = false; this.call = null; resolve(true); }]);
      this.call = { tpl: null, t: 0, script, k: 0, out: true, resolve };
    });
  }

  // A mission stage is over (Ove has arrived): a flavour call still ringing or talking is cut off,
  // so an "INTE NU!" never turns up at the next stage.
  hangUp() {
    if (!this.call?.radio) return;
    this.silence(this.call);
    audio.ring(false); hud.endCall(); this.onPhone = false; this.call = null;
  }
  // A call cut off: its lines are not said after all.
  silence(c) { for (const u of c?.voice || []) u.stop(0.15); }

  // ------------------------------------------------------------------------------------------
  // The errand

  force(id, opts = {}) {
    if (this.active || this.retry) this.abort();
    if (this.call) { this.silence(this.call); audio.ring(false); hud.endCall(); this.onPhone = false; this.call.resolve?.(false); this.call = null; }
    const tpl = TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
    if (opts.quick) { this.g.patrol.cancelWriting('telefonen ringde'); this.lastId = tpl.id; this.start(tpl); }
    else this.ring(tpl.id);
    return tpl.id;
  }

  start(tpl) {
    const g = this.g;
    const ctx = newCtx(tpl);
    const stages = tpl.stages();
    // (patience null: no time limit - Rune's errand has his cold instead)
    this.active = { tpl, ctx, stages, i: 0, stage: stages[0], timer: tpl.patience === null ? null : tpl.patience ?? 120 };
    this.active.stage.init?.(g, ctx);
    audio.checkpoint();
    if (!this.told && this.active.timer != null) { this.told = true; hud.toast('Ett avbrott. Hjälp grannen innan tålamodet tar slut.', 'warn', 6500); }
    if (tpl.toast) hud.toast(tpl.toast, 'cold', 6500);
  }

  updateErrand(dt) {
    const g = this.g, a = this.active;
    if (a.timer != null) {
      a.timer -= dt;
      if (a.timer <= 0) { this.fail(); return; }
    }
    const r = a.stage.update(g, a.ctx, dt);
    if (r === 'done') {
      a.stage.cleanup?.(g, a.ctx);
      a.i++;
      if (a.i >= a.stages.length) { this.complete(); return; }
      a.stage = a.stages[a.i];
      a.stage.init?.(g, a.ctx);
      audio.checkpoint();
    } else if (r && r.fail) this.fail(r.fail, { retry: !!r.dead && !!a.tpl.retry });
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
    // (saved at once: a reload used to lose the reward of the last 30 s)
    g.save();
    audio.jingle('complete');
    hud.showBanner('KLART', `${tpl.title} · +10 Ordning · +${kr} kr`, 'good', 2200, 'Avbrott');
    const done = () => { const l = pick(DONE); if (!g.playerCar) g.say(g.player, l, 1.6); };
    setTimeout(() => {
      const u = g.radio(tpl.who, tpl.thanks, { must: true });
      // (Ove grunts once the thanks have been said; without the voices, 1.7 s after them)
      if (u) u.ended.then(() => setTimeout(done, 400)); else setTimeout(done, 1700);
    }, 900);
  }

  // o.retry: as after a failed day (missions.js), the banner waits for E (the errand again, from the
  // start) or Q (give up): Rune's errand once he has died (updateRetry).
  fail(reason = '', o = {}) {
    const g = this.g, tpl = this.active.tpl;
    this.finish();
    this.failed++;
    g.patrol.addOrdning(-10);
    g.save();
    audio.jingle('fail');
    if (o.retry) {
      this.retry = { tpl, t: 0, reason };
      hud.showBanner(tpl.deadBanner || 'MISSLYCKADES', reason || tpl.title, 'bad', 0, 'Avbrott');
      return;
    }
    hud.showBanner('FÖR SENT', reason || tpl.title, 'bad', 2200, 'Avbrott');
    setTimeout(() => g.radio(tpl.who, tpl.fail, { must: true, tag: 'fail' }), 900);
  }

  // While a failed errand waits: E tries again, Q (the pad's B) gives up. Ove stands still meanwhile
  // (main.js failWait), as after a failed day; no calls.
  updateRetry(dt) {
    const g = this.g, r = this.retry;
    r.t += dt;
    hud.setPrompt(r.t > 0.8 ? '<b>E</b> Försök igen &nbsp; · &nbsp; <b>Q</b> Ge upp' : '');
    if (r.t > 0.8 && g.input.pressed('interact')) this.tryAgain();
    else if (r.t > 0.8 && g.input.pressed('giveUp')) this.giveUp();
  }
  tryAgain() {
    const g = this.g, tpl = this.retry?.tpl;
    if (!tpl) return;
    this.retry = null;
    hud.hideBanner();
    hud.setPrompt('');
    tpl.onRetry?.(g);
    this.lastId = tpl.id;
    this.start(tpl);
    hud.showBanner(tpl.title, 'Ett försök till.', 'mission', 2000, 'Avbrott');
    audio.jingle('start');
    g.save();
  }
  giveUp() {
    const g = this.g, tpl = this.retry?.tpl;
    if (!tpl) return;
    this.retry = null;
    hud.hideBanner();
    hud.setPrompt('');
    this.nextT = Math.max(this.nextT, 70);
    tpl.onGiveUp?.(g);
  }

  // A story mission starts: drop the errand without blame. A call cut off by it (Ove walked up to the
  // day's giver while it rang) is tried again a good while later, never right after the scene.
  // An answered errand dropped because a story day began doesn't just vanish: its neighbour says on
  // the radio that it's fine (tpl.busy), after the day's intro. (abort() in free roam - tests, force -
  // drops it without a word.)
  abort() {
    if (this.retry) this.giveUp();
    if (this.call && !this.call.radio && !this.call.out) { this.silence(this.call); audio.ring(false); hud.endCall(); this.onPhone = false; this.call = null; this.nextT = Math.max(this.nextT, 45); }
    if (this.active) {
      const tpl = this.active.tpl;
      this.finish();
      this.nextT = 45;
      if (this.g.missions.state !== 'idle') this.dropNote = { who: tpl.who, text: tpl.busy || ERRAND_BUSY, t: 0 };
    }
  }

  // ------------------------------------------------------------------------------------------
  // For main.js's HUD

  panel() {
    const a = this.active;
    if (!a) return null;
    const s = a.stage, o = s.obj?.(this.g) || {};
    // (Rune's errand: his cold instead of a timer)
    if (o.cold != null) return { kicker: 'Avbrott', title: a.tpl.title, text: s.sub || s.text, timer: null, cold: o.cold, temp: o.temp, bar: o.cold, barLabel: o.note, danger: o.danger };
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
