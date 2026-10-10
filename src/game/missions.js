// The story: seven days ("dagar"), one mission a day, each a short script of stages from
// stages.js (DESIGN.md section 5). A day's mission is offered by a neighbour who stands at their
// landmark with the amber marker; it unlocks once the day before is done and Ove has patrolled a
// little (two more anmälningar or a minute and a quarter of free roam; off in ?test unless &gate).
//
// A mission def: { id, day, name, title, giver, at, extra (more neighbours standing there), away
// (neighbours who are elsewhere that day: hidden at home), elsewhere ({ key: [landmark, right,
// ahead] }: where someone spends the day instead of at home), reward (kr), intro, retryIntro (a
// two-line intro when the day is taken up again after giving up), stages: [() => stage], setup
// (g, m) (when the stages start: things in place for the day), retry ({ from: stage index, car,
// with: [npc keys aboard] }: a retry starts there, e.g. on the race grid with Adrian aboard),
// outro (lines; a third element (g) => {...} runs as the line starts: a camera beat), outroAt (a
// place: where Ove stands for the outro, facing its yaw), outroSetup (g) => { look, dispose } (a
// prop for the outro: the Saab for sale), outroLook (g) => a point to frame when nobody but Ove
// speaks, snow (light snowfall from the start until after the outro), bustFails (a chaser that
// catches Ove fails the mission instead of just holding him up) }.
// Player-facing text is Swedish; speaker keys are CHARS keys ('ove' is the player).

import * as GFX from '../gfx.js';
import { lm, rc, landmarks } from '../world/layout.js';
import { segmentBlocked, queryBlocks, contains, RAMP } from '../world/collision.js';
import { kneelPoint } from '../actors/models.js';
import { audio } from '../audio.js';
import { hud } from './hud.js';
import { fx } from './fx.js';
import { dist, yawTo, angleDiff } from '../util.js';
import { Collectible } from '../actors/pickups.js';
import {
  newCtx, disposeCtx, getInCar, goto, holdAt, fetch, pickup, dropoff, catchCat, parkIn, report,
  race, destroy, grab, talk, cut, at, lmOr,
} from './stages.js';

export const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
// Between two days: the next one dawns after this many more reports (but not before minSecs), or
// after `secs` of free roam at the most. Time spent on an errand, a call or a chase doesn't count,
// and a new day never dawns in the middle of one.
const GATE = { reports: 3, minSecs: 35, secs: 90 };
const DAY_START = [10, 30], DAY_END = [14, 30];   // late November: light from about nine to three

// Extras for a stage when it starts: { say (an Ove line in a bubble), toast, call: [who, text,
// reply] (the phone rings; callAt = s into the stage instead of at once), lines: [[who, text,
// 'shout' | 'radio'], ...] every `every` s while the stage runs (the first after `first` s),
// start(g, m) (when it starts), done(g, m) (when it is done) }.
const also = (factory, x) => () => {
  const st = factory();
  const init = st.init, update = st.update;
  st.init = function (g, m) {
    init?.call(this, g, m);
    if (x.say) g.say(g.player, x.say, 2.4);
    if (x.toast) hud.toast(x.toast, 'warn', 8000);
    if (x.call && !x.callAt) g.interrupts.radioOnly(...x.call);
    x.start?.(g, m);
    this.lineI = 0; this.lineT = x.first ?? 6;
    this.callAtT = x.call && x.callAt ? x.callAt : null;
  };
  st.update = function (g, m, dt) {
    if (this.callAtT != null && !g.inDialog) {
      this.callAtT -= dt;
      if (this.callAtT <= 0 && !g.interrupts.call) { this.callAtT = null; g.interrupts.radioOnly(...x.call); }
    }
    if (x.lines && this.lineI < x.lines.length && !g.inDialog) {
      this.lineT -= dt;
      if (this.lineT <= 0) {
        const [who, text, how] = x.lines[this.lineI++];
        if (how === 'radio') g.radio(who, text); else g.shout(who, text);
        this.lineT = x.every ?? 12;
      }
    }
    const r = update.call(this, g, m, dt);
    if (r === 'done') x.done?.(g, m);
    return r;
  };
  return st;
};

// ---------------------------------------------------------------------------------------------
// Day 7 at Sonja's grave.

// Where Ove kneels and where the flowers land: on the spruce twigs ~0.6 m in front of the stone
// (the plinth ledge is out of reach from in front of the bed). His root 0.41 m behind the landing
// point, facing it (the people area's kneel: the flowers land ~0.27 m above his root).
export function kneelSpot(g) {
  const s = lm('sonjaGrave'), gf = landmarks.graveFlowers;
  let ux = Math.sin(s.yaw), uz = Math.cos(s.yaw);
  if (gf) { const L = Math.hypot(gf.x - s.x, gf.z - s.z); if (L > 0.3) { ux = (gf.x - s.x) / L; uz = (gf.z - s.z) / L; } }
  const k = g.player.model?.D?.k ?? 1;
  const tx = s.x + ux * 0.62, tz = s.z + uz * 0.62, rx = tx - ux * 0.42 * k, rz = tz - uz * 0.42 * k;
  return { ux, uz, rx, rz, tx, tz, yaw: Math.atan2(ux, uz), sx: s.x + ux * 1.55, sz: s.z + uz * 1.55, y: g.groundAt(rx, rz) };
}

// The flowers lying on the grave (after a reload, or for tests: the stage lays them itself).
export function flowersOnGrave(g) {
  const k = kneelSpot(g);
  const f = new Collectible(g.scene, 'flowers', 'grave', k.tx, g.groundAt(k.tx, k.tz) + 0.12, k.tz, { beam: false, scale: 1.9 });
  f.inner.rotation.set(1.35, k.yaw, 0, 'YXZ');
  g.graveFlowers?.dispose?.();
  g.graveFlowers = f;
}

// One press of E: Ove goes down on one knee, lays the flowers (the kneel's own ~3 s sequence: the
// bouquet follows his hands until it is down) and stays there for the outro.
const _kp = new GFX.THREE.Vector3();
const layFlowers = () => ({
  kind: 'holdAt',
  text: 'Gå till Sonjas grav',
  init(g) { this.k = kneelSpot(g); this.t = null; this.p = 0; },
  target() { return { x: this.k.rx, z: this.k.rz, r: 1.2 }; },
  close(g) { return !g.playerCar && g.player.state === 'normal' && dist(g.player.x, g.player.z, this.k.rx, this.k.rz) < 2.4; },
  prompt(g) {
    if (this.t != null) return null;
    if (this.close(g)) return { text: '<b>E</b> Lägg blommorna på Sonjas grav', takesE: true };
    if (g.playerCar && dist(g.playerCar.x, g.playerCar.z, this.k.rx, this.k.rz) < 12) return { text: 'Kliv ur bilen först', takesE: false };
    return null;
  },
  obj() { return this.t != null ? { bar: this.p, barLabel: 'Blommorna' } : {}; },
  update(g, m, dt) {
    const p = g.player, k = this.k;
    if (this.t == null) {
      this.sub = g.playerCar && dist(g.playerCar.x, g.playerCar.z, k.rx, k.rz) < 20 ? 'Kliv ur bilen.' : null;
      if (!this.close(g) || !g.input.pressed('interact')) return;
      this.t = 0;
      g.inDialog = true;
      hud.clearBubbles();
      p.teleport(k.rx, k.rz, k.yaw);
      p.vx = p.vz = 0; p.wishX = p.wishZ = 0;
      p.anim.kneel = true;
      g.setCarrying?.(null);
      this.bq = new Collectible(g.scene, 'flowers', 'grave', k.tx, k.y + 0.9, k.tz, { beam: false, scale: 1.9 });
      g.graveFlowers?.dispose?.();
      g.graveFlowers = this.bq;
      hud.letterbox(true);
      graveShot(g, 'lay');
      return;
    }
    this.t += dt;
    this.p = Math.min(1, this.t / 3);
    if (this.t < 2.2) {
      // In his hands (upright, then tipping forward as he lays them down).
      p.root.updateMatrixWorld(true);
      kneelPoint(p.model, _kp);
      this.bq.mesh.position.copy(_kp);
      const lay = Math.min(1, Math.max(0, (this.t - 0.7) / 1.3));
      this.bq.inner.rotation.set(0.25 + lay * 1.1, k.yaw, 0, 'YXZ');
    }
    if (this.t > 3.1) {
      audio.checkpoint();
      hud.letterbox(false);
      g.cam.release();
      g.inDialog = false;
      return 'done';
    }
  },
  cleanup(g) {
    if (this.t != null && this.t <= 3.1) { hud.letterbox(false); g.cam.release(); g.inDialog = false; g.player.anim.kneel = false; }
  },
});

// The finale's shots, hand-placed round the grave and judged by the camera like any other shot
// (the first clear one wins; else an ordinary frame of Ove and the stone):
//   stone  over Ove's shoulder to the stone: the gilded name, the flowers, the lantern (the review's)
//   face   the reverse, from beside the stone: Ove's face, on one knee
//   lay    from the side, a little in front: the flowers going down
//   wide   further back and higher, for UPPDRAG KLART and the end banner
function graveShot(g, kind) {
  const k = kneelSpot(g), y = k.y, ux = k.ux, uz = k.uz, rx = -uz, rz = ux;
  const V = (x, yy, z) => ({ x, y: yy, z });
  const S = { x: k.sx, z: k.sz };
  const ove = { x: g.player.x, y: g.player.y, z: g.player.z, height: g.player.anim.kneel ? 1.2 : g.player.height, ref: g.player, person: true };
  const stone = { x: S.x, y, z: S.z, height: 0.95 };
  const mid = V((S.x + k.rx) / 2, y + 0.7, (S.z + k.rz) / 2);
  const cands = [];
  const sides = [1, -1];
  if (kind === 'stone') {
    for (const [back, side, up] of [[3.9, 1.5, 1.5], [4.4, 1.9, 1.65], [3.5, 1.2, 1.4], [4.8, 1.4, 1.8]]) for (const sd of sides) cands.push({ pos: V(S.x - ux * back + rx * side * sd, y + up, S.z - uz * back + rz * side * sd), look: V(mid.x, y + 0.75, mid.z), fov: 38 });
    return g.cam.pick(cands, [ove, stone], { need: 2 });
  }
  if (kind === 'face') {
    // (wide enough that the kneel reads as a kneel: close in from the front it looked like sitting)
    const chest = V(k.rx, y + 0.72, k.rz);
    for (const [fwd, side, up] of [[1.1, 2.4, 1.3], [0.8, 2.8, 1.4], [1.4, 2.2, 1.25], [0.5, 3.0, 1.5], [1.6, 1.9, 1.15]]) for (const sd of sides) cands.push({ pos: V(k.rx + ux * fwd + rx * side * sd, y + up, k.rz + uz * fwd + rz * side * sd), look: chest, fov: 40 });
    return g.cam.pick(cands, [ove], { need: 1, fallback: false });
  }
  if (kind === 'lay') {
    for (const [fwd, side, up] of [[0.4, 2.3, 1.0], [0.1, 2.6, 1.2], [0.8, 2.2, 0.9]]) for (const sd of sides) cands.push({ pos: V(k.rx + ux * fwd + rx * side * sd, y + up, k.rz + uz * fwd + rz * side * sd), look: V(k.tx, y + 0.45, k.tz), fov: 40 });
    return g.cam.pick(cands, [ove, stone], { need: 1 });
  }
  // (wide: the banner over the middle of the upper half, so the grave and Ove sit low in the frame)
  for (const [back, side, up] of [[3.4, 2.2, 2.2], [4.0, 1.6, 2.5], [3.0, 2.8, 2.1], [4.6, 2.4, 2.7]]) for (const sd of sides) cands.push({ pos: V(k.rx - ux * back + rx * side * sd, y + up, k.rz - uz * back + rz * side * sd), look: V(mid.x, y + 1.15, mid.z), fov: 46 });
  return g.cam.pick(cands, [ove, stone], { need: 2 });
}

// "Senare samma dag": the November afternoon light (dimmer sun and sky, a little more haze) until
// the snowfall stops after the end. Restored on a failed / abandoned day.
let duskSaved = null;
export function dusk(on) {
  const sun = GFX.sun, sc = GFX.scene;
  if (!sun || !sc) return;
  if (on && !duskSaved) {
    duskSaved = { si: sun.intensity, env: sc.environmentIntensity, fog: sc.fog?.density, exp: GFX.renderer?.toneMappingExposure };
    sun.intensity *= 0.42;
    sc.environmentIntensity *= 0.72;
    if (sc.fog) sc.fog.density *= 1.8;
    if (GFX.renderer) GFX.renderer.toneMappingExposure *= 0.9;
  } else if (!on && duskSaved) {
    sun.intensity = duskSaved.si;
    sc.environmentIntensity = duskSaved.env;
    if (sc.fog && duskSaved.fog != null) sc.fog.density = duskSaved.fog;
    if (GFX.renderer && duskSaved.exp != null) GFX.renderer.toneMappingExposure = duskSaved.exp;
    duskSaved = null;
  }
  GFX.LIGHTING?.sunColor?.copy(sun.color).multiplyScalar(sun.intensity);
}

// Where the race to the car dealer ends: the street in front of Bilhallen (the world's
// dealerFinish when it has one).
const dealerStreet = () => { const d = landmarks.dealerLot || lm('dealer'); return { x: rc(6) + 3, z: d.z, yaw: Math.PI }; };
const DEALER_FINISH = lmOr('dealerFinish', dealerStreet);
// The hospital: the car-reachable drive-up spot (the world's hospitalDrop; else in the car park
// by its entrance from the x = 120 street, the kerb is in the way further south) and the walk from
// there to the A&E door under the canopy.
const HOSP_DROP = lmOr('hospitalDrop', { x: 137, z: -150, yaw: Math.PI / 2 });
const toAkut = (g) => (landmarks.hospitalDrop ? [lm('hospital')] : [{ x: 146, z: -158.5 }, lm('hospital')]);
// The way in for the guide arrow: the Akut wing stands between the x = 120 street and the canopy;
// the world's Akut driveway leaves the street at z ≈ -158.7, crosses an apron and turns north into
// the canopy's lane.
const HOSP_VIA = (g) => { const d = landmarks.hospitalDrop; return d ? [{ x: 126, z: -158.7 }, { x: d.x, z: -158.7 }] : [{ x: 126, z: -150 }]; };
// Parvaneh walks from her door to the residents' lot (by the cross walkway, then along the aisle
// to the entrance) while Ove fetches the Saab; he picks her up where they meet.
const LOT_PICKUP = { x: -27, z: -22.6, yaw: Math.PI / 2 };
const toLot = () => [{ x: -5.9, z: 2.4 }, { x: -1.4, z: 2.4 }, { x: -1.4, z: -20.4 }, { x: -3.5, z: -23.4 }, { x: -24, z: -23.2 }];
const walkToLot = (speed) => ({
  start(g, m) {
    const n = g.npc('parvaneh');
    if (n.car || n.walkTo) return;
    m.data.npcs.add(n);
    g.walkNpc(n, [...toLot(), LOT_PICKUP], { speed, stay: true, yaw: LOT_PICKUP.yaw });
  },
});
// Day 7: Vita skjortan's Škoda has waited by the entrance all morning, engine running (on the
// west street, south of the lot entrance, facing north).
const SKODA_WAIT = { x: -37.25, z: -5, yaw: Math.PI };
// Day 6: the same street, by the lot entrance (seen from the entrance as the Saab comes out).
const SKODA_DAY6 = { x: -37.25, z: -9, yaw: Math.PI };
// Day 3: the radiator key is in Rune's Volvo (in the garage row): beside its driver's door.
const RUNE_VOLVO = (g) => { const c = g.ensureNamedCar('runeVolvo'); return c ? g.exitSpot(c, 1) : lm('oveGarage'); };
// Day 5: the Saab for sale on Bilhallen's forecourt (the empty bay with the 35 000:- board).
const SAAB_FOR_SALE = { x: 226, z: 68, yaw: -Math.PI / 2 };

export const MISSIONS = [
  // ---------------------------------------------------------------------------------------------
  {
    id: 'slapet', day: 1, name: 'Släpkärran', title: 'Dag 1 – Släpkärran', giver: 'patrick', at: 'parvanehHouse', extra: ['parvaneh'], reward: 100,
    tagline: 'Nya grannar. Ett släp. Ingen kan backa.',
    intro: [
      ['patrick', 'Hej! Du måste vara grannen. Patrick. Vi flyttade in i går. Eller, vi håller på.'],
      ['ove', 'Det är förbjudet att köra bil inom området.'],
      ['patrick', 'Ja, jo, vi skulle bara backa fram släpet till dörren. Det har tagit... en stund.'],
      ['ove', 'Tjugo minuter. Jag har tagit tid. Och du har kört över min brevlåda.'],
      ['patrick', 'Har jag? Förlåt! Jag är IT-konsult. Jag är inte så bra på... fysiska saker.'],
      ['parvaneh', 'Patrick, älskling. Låt mannen göra det. Han ser ut som någon som kan backa med släp.'],
      ['ove', 'Vem backar med släp så? Flytta på dig.'],
    ],
    retryIntro: [['patrick', 'Ove! Släpet står fortfarande snett. Jag rörde det inte. Nästan.'], ['ove', 'Flytta på dig.']],
    stages: [
      () => getInCar({ car: 'patrickCar', text: 'Kliv in i Patricks bil' }),
      also(() => parkIn({
        box: 'parvanehDrive', car: 'patrickCar', trailer: true, reverse: true, tol: 0.35, clear: 14,
        text: 'Backa in bilen och släpet i rutan framför Parvanehs dörr',
        hint: 'Backa med släp: vrid ratten <b>åt andra hållet</b> än dit du vill att släpet ska. Små rattrörelser, rätta ofta. Titta bakåt med <b>B</b>.',
      }), {
        first: 9, every: 14,
        lines: [['patrick', 'Lite till vänster! Eller... höger?'], ['parvaneh', 'Patrick, säg inget. Låt honom vara.'], ['patrick', 'Ska jag vinka in dig?'], ['ove', 'NEJ.', 'radio'], ['patrick', 'Wow. Det ser ut som i reklamen.']],
      }),
      also(() => report({ n: 3, near: 'guestParking', radius: 45, smitare: false, text: 'Anteckna tre felparkerade bilar vid parkeringen' }), {
        say: 'När jag ändå är ute.',
        toast: 'Gå fram till en felparkerad bil och håll <b>F</b> för att anteckna den i blocket.',
      }),
      () => getInCar({ car: 'saab', text: 'Hämta Saaben vid garagen' }),
      () => parkIn({ box: 'oveGarageSpot', car: 'saab', tol: 0.3, text: 'Ställ in Saaben i garaget, nosen först' }),
    ],
    // In front of his garage door, facing the lot (he has just put the Saab away).
    outroAt: () => { const o = lm('oveGarage'); return { x: o.x, z: o.z - 0.5, yaw: o.yaw + Math.PI }; },
    outro: [
      ['parvaneh', 'Ove! Där är du. Jag har lagat saffransris med kyckling. Det blev för mycket.'],
      ['ove', 'Jag har mat.'],
      ['parvaneh', 'Vad åt du i går då?'],
      ['ove', '...Mat.'],
      ['parvaneh', 'Ta den. Lådan vill jag ha tillbaka. Och tack för släpet.'],
      ['ove', 'Hmpf. Ni är skyldiga mig en brevlåda.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'sjukhuset', day: 2, name: 'Sjukhuset', title: 'Dag 2 – Sjukhuset', giver: 'parvaneh', at: 'parvanehHouse', away: ['patrick'], reward: 150,
    // The girls are at Jimmy's (Parvaneh says so, and Jimmy phones about them on the way).
    elsewhere: { sara: ['jimmyHouse', -1.7, 1.5], nasanin: ['jimmyHouse', -0.8, 2.3] },
    tagline: 'Patrick, en stege och en adventsstjärna.',
    intro: [
      ['parvaneh', 'Ove! Patrick har ramlat ner från stegen. Han skulle sätta upp en adventsstjärna.'],
      ['ove', 'På en stege. I snö.'],
      ['parvaneh', 'Ambulansen tog honom. Jag måste dit, och jag... jag har inget körkort.'],
      ['ove', 'Inget körkort? Du är ju trettio år!'],
      ['parvaneh', 'Ove. Snälla. Flickorna är hos Jimmy. Jag går till parkeringen.'],
      ['ove', 'Jag hämtar Saaben. Man kör inte bil inne på området.'],
    ],
    retryIntro: [['parvaneh', 'Ove, snälla. Sjukhuset. Nu.'], ['ove', 'Jaja. Gå till parkeringen.']],
    stages: [
      also(() => getInCar({ car: 'saab', text: 'Hämta Saaben' }), walkToLot(2.0)),
      () => pickup({ who: 'parvaneh', at: LOT_PICKUP, walk: toLot, speed: 2.0, needCar: true, text: 'Hämta Parvaneh på parkeringen', carText: 'Parvaneh går mot parkeringen. Ta Saaben.', hello: 'Kör, Ove!' }),
      () => goto({
        to: HOSP_DROP, via: HOSP_VIA, radius: 9, timer: 95, inCar: true, with: ['parvaneh'], text: 'Kör Parvaneh till sjukhuset', failText: 'Det tog för lång tid. Parvaneh tog en taxi.',
        radioFirst: 3, radioEvery: 6,
        radio: [['parvaneh', 'Ove, du kör som en pensionär!'], ['ove', 'Jag kör som det står på skyltarna.'], ['parvaneh', 'Varför blinkar du? Det är ingen där!'], ['ove', 'Man blinkar. Alltid.'], ['parvaneh', 'En stjärna, Ove. Han skulle sätta upp EN stjärna.']],
        callFirst: 12, calls: [['jimmy', 'Ove! Flickorna undrar om de får äta glass till frukost. De säger att du sa ja.', 'Nej.']],
      }),
      () => dropoff({ who: 'parvaneh', at: HOSP_DROP, radius: 9, walk: toAkut, text: 'Släpp av Parvaneh vid akuten', bye: 'Tack, Ove! Parkera, jag kommer ut sen!' }),
      () => parkIn({ box: 'hospitalSpot', either: true, tol: 0.35, text: 'Parkera på sjukhusets parkering' }),
    ],
    outro: [
      ['parvaneh', 'Han har brutit armen. Han är hög på morfin och skrattar åt allting. Han hälsar.'],
      ['ove', 'Det kostar tjugofem kronor i timmen att stå här.'],
      ['parvaneh', 'Ove. Min man har brutit armen.'],
      ['ove', 'Jag betalar inte för att stå still!'],
      ['parvaneh', 'Du är helt omöjlig. Du får lära mig köra. Det har jag bestämt nu.'],
      ['ove', '...Vi börjar på måndag. I en riktig bil.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'elementet', day: 3, name: 'Elementet', title: 'Dag 3 – Elementet', giver: 'anita', at: 'runeHouse', reward: 150,
    tagline: 'Det klickar i elementen hos Anita och Rune.',
    intro: [
      ['anita', 'Ove, förlåt att jag stör. Elementen är kalla igen, och det klickar i dem.'],
      ['ove', 'Det är luft i dem. Har ni luftat?'],
      ['anita', 'Rune gjorde alltid det. Förut. Nu vet jag inte ens var nyckeln ligger.'],
      ['ove', 'Elementnyckel. Jag har en i garaget. Alla borde ha en.'],
      ['rune', '...'],
      ['anita', 'Han tycker om när du kommer, Ove. Även om han inte säger det.'],
    ],
    stages: [
      // The key isn't on its hook: Rune borrowed it in 1998, and it is still in his Volvo.
      also(() => holdAt({ at: 'oveGarage', secs: 1.4, radius: 2.2, label: 'Leta efter elementnyckeln', text: 'Hämta elementnyckeln i garaget', work: 'wall' }), {
        done: (g) => { hud.toast('Tom krok. Rune lånade elementnyckeln 1998. Den ligger säkert kvar i hans Volvo.', '', 7000); g.say(g.player, 'Rune. Typiskt.', 2.2); },
      }),
      () => fetch({ at: RUNE_VOLVO, exact: true, item: 'wrench', label: 'elementnyckeln', text: 'Hämta elementnyckeln i Runes Volvo', got: 'Elementnyckeln. Mässing. Ove har haft den sedan 1991. Rune sedan 1998.' }),
      also(() => report({ n: 2, near: 'garbageRoom', radius: 40, smitare: false, text: 'Två bilar står framför soprummet. Anteckna dem' }), {
        call: ['anita', 'Ove? Förlåt igen. Sopbilen kommer inte fram, det står två bilar framför soprummet.', 'Jag tar dem.'],
      }),
      () => holdAt({ at: 'runeHouse', secs: 2.6, label: 'Gå in och lufta elementen', text: 'Lufta elementen hos Anita och Rune', work: 'wall', cut: 'Ove går in och luftar elementen. Ett i taget.' }),
    ],
    // Out on the walkway in front of their door, facing it (not on Rune's ramp: its railings
    // filled the shot and the camera ended up filming the ground).
    outroAt: () => { const o = lm('runeHouse'), f = Math.sin(o.yaw), h = Math.cos(o.yaw); return { x: o.x + f * 2.3, z: o.z + h * 2.3, yaw: o.yaw + Math.PI }; },
    outro: [
      ['anita', 'Det är varmt i huset igen. Tack, Ove.'],
      ['ove', 'Två gånger per vinter. Minst. Jag skriver det på en lapp åt er.'],
      ['rune', '...Saab.'],
      ['ove', 'Ja, Rune. Saab.'],
      ['anita', 'Han kom ihåg dig. Han kom faktiskt ihåg dig.'],
      ['ove', 'Hmpf. Han har kört Volvo hela livet. Klart han minns en riktig bil.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'katten', day: 4, name: 'Katten', title: 'Dag 4 – Katten', giver: 'jimmy', at: 'jimmyHouse', reward: 150,
    tagline: 'En katt i snön. Ingens katt.',
    intro: [
      ['jimmy', 'Tjena Ove! Det sitter en katt i snön vid cykelförrådet. Den har suttit där hela natten.'],
      ['ove', 'Det är inte min katt.'],
      ['jimmy', 'Den är ingens katt. Det är ju det som är grejen.'],
      ['ove', 'Den har säkert loppor.'],
      ['jimmy', 'Jag skulle ta den själv, men den springer ifrån mig. Alla katter springer ifrån mig. Och duvor.'],
      ['ove', 'Det förstår jag.'],
    ],
    retryIntro: [['jimmy', 'Katten är tillbaka vid cykelförrådet, Ove!'], ['ove', 'Det är fortfarande inte min katt.']],
    stages: [
      also(() => catchCat({ near: 'bikeShed', rMin: 2, rMax: 5, sit: true, timer: 110, text: 'Fånga katten vid cykelförrådet', failText: 'Katten sprang till skogen.' }), {
        first: 6, every: 10,
        lines: [['jimmy', 'Spring efter den, Ove!'], ['jimmy', 'Nej, vänta! Stå still! Prata snällt med den!'], ['ove', 'Jag pratar inte med katter.', 'radio']],
      }),
      () => goto({ to: 'oveHouse', radius: 2.6, onFoot: true, text: 'Bär hem katten, in i värmen' }),
    ],
    // Just outside his own door, facing out (the cat is already in the hall).
    outroAt: () => { const o = lm('oveHouse'), f = Math.sin(o.yaw), h = Math.cos(o.yaw); return { x: o.x + f * 1.4, z: o.z + h * 1.4, yaw: o.yaw }; },
    outro: [
      ['jimmy', 'Du tog den! Vad ska den heta?'],
      ['ove', 'Den ska inte heta något. Den ska inte bo här.'],
      ['jimmy', 'Den sitter ju redan i din hall, Ove.'],
      ['ove', '...'],
      ['ove', 'Den får stanna. Tills vidare.'],
      ['jimmy', 'Tills vidare. Klart. Jag köper kattmat!'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'saab', day: 5, name: 'Saab, inte Audi', title: 'Dag 5 – Saab, inte Audi', giver: 'adrian', at: 'adrianSpot', extra: ['anders'], reward: 200,
    tagline: 'Adrian ska köpa bil. Anders har åsikter.',
    intro: [
      ['adrian', 'Ove! Jag har sparat ihop till en bil. Jag ska köpa en Audi!'],
      ['ove', 'En Audi.'],
      ['anders', 'Klokt val, Adrian. Tysk ingenjörskonst. Jag kör själv en A6, som bekant.'],
      ['ove', 'Plast och elektronik.'],
      ['anders', 'Säger mannen i en bil från förra årtusendet. Vi kan ju se vem som är först till bilhallen?'],
      ['ove', 'Sätt dig i bilen, Adrian.'],
      ['adrian', 'Vänta, vad? Nu? Okej! Okej!'],
    ],
    retryIntro: [['anders', 'En gång till, Ove? Jag har all tid i världen. Och en A6.'], ['ove', 'Sätt dig i bilen, Adrian.']],
    // A lost race starts again on the grid, Adrian still aboard.
    retry: { from: 2, car: 'saab', with: ['adrian'] },
    stages: [
      () => getInCar({ car: 'saab', text: 'Hämta Saaben' }),
      () => pickup({ who: 'adrian', at: 'adrianSpot', needCar: true, text: 'Hämta Adrian på parkeringen', carText: 'Adrian väntar på parkeringen. Ta Saaben.', hello: 'Det här är det bästa som har hänt mig!' }),
      () => race({
        who: 'anders', car: 'andersAudi', start: { x: -12, z: rc(3), yaw: Math.PI / 2 }, checkpoints: [[5, 3], [5, 5], [6, 5]], after: [[6, 4]],
        finish: DEALER_FINISH, finishR: 12, cruise: 19, aggressive: false, text: 'Hinn först till bilhallen!', failText: 'Anders kom först. Han kommer att prata om det i flera år.',
        radio: [['adrian', 'Gasa, Ove! GASA!'], ['ove', 'Man gasar inte i kurvorna.'], ['anders', 'Vorsprung durch Technik, Ove!'], ['adrian', 'Är det normalt att det luktar så här?'], ['ove', 'Det är kopplingen. Den är som den ska.']],
      }),
    ],
    // On Bilhallen's forecourt, the Saab for sale a few metres off.
    outroAt: () => ({ x: 222.5, z: 72.6, yaw: Math.PI }),
    outroSetup: (g) => {
      const s = SAAB_FOR_SALE;
      const car = g.spawnMissionCar({ cars: [] }, 'saab900', s.x, s.z, s.yaw, { color: 0x8a8e92, engineOn: false });
      car.locked = true;
      return { look: { x: car.x, y: car.y, z: car.z, height: 1.1 }, dispose: () => g.removeCar(car) };
    },
    outro: [
      ['adrian', 'Vi vann! Mot en Audi! I en bil som är äldre än jag!'],
      ['anders', 'Jag lät dig vinna, Ove. Av respekt för de äldre.'],
      ['ove', 'Adrian. Den där.', (g) => { const p = g.missions.outroProps; if (p?.look) g.cam.frame(p.look, g.player); }],
      ['adrian', 'En Saab? Den är ju... faktiskt rätt snygg.'],
      ['ove', 'Den är ordentlig. Kolla rosten under trösklarna. Och pruta.'],
      ['adrian', 'Jag köper den! Ove, du får provsitta när du vill.', (g) => g.cam.frame(g.npc('adrian'), g.player)],
      ['ove', 'Hmpf. Jag vet hur en Saab sitter.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'vitskjortan', day: 6, name: 'Vita skjortan', title: 'Dag 6 – Vita skjortan', giver: 'anita', at: 'runeHouse', away: ['vitskjorta'], reward: 250,
    tagline: 'Kommunen har kommit för Rune.',
    intro: [
      ['anita', 'Ove... mannen från kommunen var här igen. Han i den vita skjortan.'],
      ['ove', 'Vad ville han?'],
      ['anita', 'De vill flytta Rune till ett boende. De säger att jag inte orkar ta hand om honom längre.'],
      ['rune', '...'],
      ['anita', 'Han tog med sig alla papper. Hela utredningen om Rune. Han sitter i sin vita bil vid infarten och skriver.'],
      ['ove', 'Vid infarten. Jaså.'],
      ['anita', 'Ove, du ska väl inte göra något dumt?'],
      ['ove', 'Jag ska bara prata med honom.'],
    ],
    retryIntro: [['anita', 'Ove... pappren. Han har dem fortfarande.'], ['ove', 'Inte länge till.']],
    // This morning the Saab stands along the aisle, facing the lot entrance (Ove turned it last
    // night: he knew), not nose to the garage door with a three-point turn to make first.
    setup: (g) => {
      const c = g.named?.saab;
      if (c && c !== g.playerCar && c.home && dist(c.x, c.z, c.home.x, c.home.z) < 3) { c.place(c.home.x, c.home.z, -Math.PI / 2); c.ctrl.park = true; }
    },
    stages: [
      () => getInCar({ car: 'saab', text: 'Hämta Saaben' }),
      // He sits in the Škoda by the lot entrance, in plain view as Ove comes out, and sets off
      // when Ove's car comes near: no 84 km/h head start from 100 m off while the Saab is still in
      // the garage (5 of 5 key-driven starts used to fail).
      also(() => destroy({
        who: 'vitskjorta', type: 'skoda', carName: 'vitskjortaSkoda', cruise: 19, timer: 160, ram: 3.5, ramMax: 30, drain: 8,
        at: SKODA_DAY6, wait: 35, wake: 30, goLine: 'Nej, nej, nej. Inte nu, Ove.', escape: 250, grace: 20, seenAt: 60, rubber: [1, 0.85],
        waitText: 'Vita skjortan står vid infarten. Kör dit', text: 'Stoppa den vita Škodan: knuffa den och håll dig tätt bakom', failText: 'Han kom undan med pappren.', stopBanner: 'TAGEN!', stopSub: 'Vita skjortan kör in till vägkanten', tag: 'Vita skjortan',
      }), {
        call: ['anita', 'Ove... var försiktig. Han är bara en tjänsteman.', 'Det är det som är problemet.'], callAt: 8,
        first: 14, every: 13,
        lines: [['vitskjorta', 'Det här kommer att få konsekvenser, Ove!', 'radio'], ['ove', 'Det står ju på skylten. Trettio.', 'radio'], ['vitskjorta', 'Det här blir en tjänsteanteckning, Ove! I tre exemplar!', 'radio']],
      }),
      () => talk({
        who: 'vitskjorta', from: 'wreck', text: 'Prata med Vita skjortan',
        lines: [
          ['vitskjorta', 'Det här är en kommunal angelägenhet. Ni har ingen som helst rätt att...'],
          ['ove', 'Pärmen.'],
          ['vitskjorta', 'Den innehåller sekretessbelagda handlingar. Beslutet är fattat på goda grunder.'],
          ['ove', 'Beslutet saknar en underskrift. Sidan fyra. Jag läste det genom rutan.'],
          ['vitskjorta', '...Det här är inte över, Ove. Vi har papper på allt.'],
          ['ove', 'Det har jag också.'],
        ],
      }),
      () => grab({ item: 'papers', label: 'Runes papper', text: 'Ta pärmen med Runes papper', side: -1, got: 'Runes papper. Sidan fyra, ingen underskrift. Ove hade rätt. Som vanligt.' }),
      () => goto({ to: 'runeHouse', radius: 3.5, text: 'Lämna pappren till Anita' }),
    ],
    outro: [
      ['anita', 'Ove? Är det där... Runes papper?'],
      ['ove', 'De hade glömt en underskrift. Då gäller inte beslutet.'],
      ['anita', 'Så han får bo kvar?'],
      ['ove', 'Tills de har lärt sig läsa sina egna blanketter.'],
      ['rune', '...Ove.'],
      ['anita', 'Du är en god människa, Ove.'],
      ['ove', 'Säg inte det till någon.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'varkarna', day: 7, name: 'Värkarna', title: 'Dag 7 – Värkarna', giver: 'patrick', at: 'parvanehHouse', extra: ['parvaneh'], away: ['vitskjorta'], reward: 500, snow: true,
    tagline: 'Vattnet har gått. Alla ringer.',
    intro: [
      ['patrick', 'Ove! OVE! Det är Parvaneh! Vattnet har gått!'],
      ['ove', 'Vilket vatten?'],
      ['patrick', 'Barnet, Ove! Barnet kommer! Och jag kan inte köra med gipset!'],
      ['parvaneh', 'OVE! BILEN! NU!'],
      ['ove', 'Jag hämtar Saaben. Gå till parkeringen.'],
      ['patrick', 'Och Ove... den vita Škodan har stått vid infarten hela morgonen. Han väntar på dig.'],
      ['ove', 'Låt honom vänta.'],
    ],
    retryIntro: [['patrick', 'Ove! Barnet!'], ['ove', 'Jaja. Jag hämtar Saaben.']],
    // The Škoda waits by the entrance from the start of the day, engine running.
    setup: (g, m) => {
      const s = SKODA_WAIT, sp = g.spotFree(s.x, s.z) ? s : { ...s, z: s.z + 8 };
      const car = g.spawnMissionCar(m, 'skoda', sp.x, sp.z, sp.yaw, { color: 0xe8e8e6, name: 'vitskjortaSkoda' });
      g.addBust(g.charDef('vitskjorta'), car);
      car.locked = true; car.ctrl.park = true;
      m.data.skoda = car;
    },
    stages: [
      also(() => getInCar({ car: 'saab', text: 'Hämta Saaben' }), walkToLot(1.7)),
      () => pickup({ who: 'parvaneh', at: LOT_PICKUP, walk: toLot, speed: 1.7, needCar: true, text: 'Hämta Parvaneh på parkeringen', carText: 'Parvaneh går mot parkeringen. Ta Saaben!', hello: 'Kör, Ove! KÖR!' }),
      () => goto({
        to: HOSP_DROP, via: HOSP_VIA, radius: 9, timer: 120, inCar: true, with: ['parvaneh'], text: 'Kör Parvaneh till sjukhuset! Skaka av dig Škodan', failText: 'För sent. Barnet föddes i Saaben. Ove kommer aldrig att prata om det.',
        chaser: {
          type: 'skoda', who: 'vitskjorta', cruise: 24, stun: 2.5, kr: 20, car: (g, m) => m.data.skoda, at: SKODA_WAIT, wait: 2.5, wake: 14,
          goLine: 'Ove! Stanna! Jag har en blankett till dig!',
          bannerText: 'Vita skjortan vill ha en underskrift', stopText: 'Vita skjortan håller upp ett papper mot rutan...', lines: ['Ove! Bara en underskrift!', 'Stanna! Det här är en kommunal fråga!', 'Vi har papper på det här också!'],
        },
        callFirst: 4, callEvery: 8,
        calls: [
          ['anita', 'Ove, elementet klickar igen...', 'INTE NU!'],
          ['sara', 'Ove! Får katten sova i min säng?', '...Ja. Men INTE NU!'],
          ['jimmy', 'Ove! Katten har ätit upp min macka!', 'INTE NU!'],
          ['adrian', 'Ove, Saaben låter konstigt när jag svänger vänster...', 'INTE NU!'],
          ['anders', 'Ove, styrelsen undrar om du kan titta på bommen vid...', 'INTE NU, ANDERS!'],
        ],
        radioFirst: 7, radioEvery: 7,
        radio: [['parvaneh', 'Andas, Ove! Nej, vänta, det är jag som ska andas!'], ['parvaneh', 'Varför kör han efter oss?!'], ['parvaneh', 'Om du blinkar en gång till föder jag i din Saab!']],
      }),
      () => dropoff({ who: 'parvaneh', at: HOSP_DROP, radius: 9, walk: toAkut, text: 'Lämna Parvaneh vid akuten', bye: 'Gå nu, Ove. Det är söndag. Hälsa Sonja från mig.', byeSecs: 3.2 }),
      // Ove waits at the hospital all day; in the afternoon he goes to Sonja, as every Sunday.
      () => cut({
        delay: 3.4, secs: 2.4, caption: 'Senare samma dag', clock: [15, 40], away: ['parvaneh'],
        then: (g) => {
          const c = g.playerCar, h = lm('hospitalSpot');
          if (c && c.name === 'saab' && g.spotFree(h.x, h.z)) { c.place(h.x, h.z, h.yaw + Math.PI); g.cam.yaw = c.yaw; g.cam.snapNext = true; }
          // The afternoon: the light low and dim, and it snows properly now.
          dusk(true);
          fx.snowfall(true, 0.9);
        },
      }),
      // On the way to the cemetery Patrick phones from the maternity ward.
      also(() => fetch({ at: 'flowerShop', item: 'flowers', label: 'blommorna', text: 'Köp blommor vid kyrkogården', rMin: 0.8, rMax: 2.2, got: 'Rosa. Hon tyckte alltid om rosa.' }), {
        say: 'Det är söndag.',
        call: ['patrick', 'Ove! Det blev en pojke! Tre kilo fyrahundra! Han skriker precis som Parvaneh. Jag svimmade bara lite!', 'Hmpf. Grattis.'], callAt: 3.5,
      }),
      () => layFlowers(),
    ],
    // The finale has its own shots (graveShot): over Ove's shoulder to the stone, the reverse from
    // beside the stone, and a wide one for the end banner. Ove stays on one knee throughout.
    finale: (g, phase) => {
      if (phase === 'klart') graveShot(g, 'wide');
      else if (phase === 'outro') { g.player.anim.kneel = true; graveShot(g, 'stone'); }
      else if (phase === 'end') { hud.letterbox(false); graveShot(g, 'wide'); }
      else if (phase === 'done') g.player.anim.kneel = false;
    },
    outro: [
      ['ove', 'Hej, Sonja.'],
      ['ove', 'Vilken vecka det har varit. Grannarna, alltså. De kan ingenting.'],
      ['ove', 'Parvaneh fick en pojke. Han skriker som hon. Patrick svimmade.'],
      ['ove', 'Adrian har köpt en Saab. Rune bor kvar. Katten... katten får stanna. Tills vidare.', (g) => graveShot(g, 'face')],
      ['ove', 'Jag vet vad du skulle säga. Att de behöver mig.'],
      ['ove', 'Hmpf.'],
      ['ove', 'Det är i ordning nu, Sonja. Området.', (g) => graveShot(g, 'stone')],
      ['ove', 'Jag kommer igen på söndag. Som vanligt.'],
    ],
  },
];

// ---------------------------------------------------------------------------------------------

export class MissionRunner {
  constructor(game) {
    this.g = game;
    this.index = 0;          // the day whose mission is next (0 = day 1; MISSIONS.length = all done)
    this.state = 'idle';     // idle | intro | running | outro | failed
    this.m = null;
    this.stage = null;
    this.stageI = 0;
    this.gating = true;      // main.js: false in ?test (unless &gate)
    this.gateOpen = true;    // the current day is offered
    this.gate = null;        // { idle (s of free roam), reports } since the last day ended
    this.gaveUp = new Set(); // days given up (Q) at least once: a short intro next time
    this.outroCast = [];     // the people in the outro (tests check they stand by Ove, in view)
    this.outroOn = false;    // the outro's dialogue is up (cast placed, camera framed)
    this.introOn = false;    // the intro's dialogue is up (tests check its framing)
    this.outroProps = null;
  }

  get current() { return MISSIONS[this.index] || null; }
  // The mission a neighbour is offering right now (null while a mission runs or the day hasn't begun).
  get offered() { return this.state === 'idle' && this.gateOpen ? this.current : null; }
  get active() { return this.state !== 'idle'; }

  // While idle between two days: the next one begins after a little patrolling.
  updateGate(dt = 0) {
    if (this.state !== 'idle' || this.gateOpen || !this.current) return;
    const g = this.g, G = (this.gate ||= { idle: 0, reports: g.patrol.reports });
    // Never in the middle of an errand, a call, a chase or a conversation (it used to dawn while
    // Ove carried Sara's cat home).
    if (g.interrupts.active || g.interrupts.call || g.patrol.pursuit || g.inDialog) return;
    G.idle += dt;
    if (this.gating && !((g.patrol.reports - G.reports >= GATE.reports && G.idle >= GATE.minSecs) || G.idle >= GATE.secs)) return;
    this.gateOpen = true;
    const def = this.current;
    g.setClock(...DAY_START);
    // A new morning: everyone where they spend the day (whoever is elsewhere is gone at once), and
    // the Saab back at home (unless Ove is in it or standing by it).
    g.placeNpcs?.(true);
    const saab = g.named?.saab;
    if (saab && saab !== g.playerCar && dist(saab.x, saab.z, g.player.x, g.player.z) > 60) g.homeNamedCar?.('saab');
    hud.showBanner(`Dag ${def.day}`, `${DAYS[def.day - 1]}smorgon`, 'mission', 2600, 'Ny dag');
    setTimeout(() => hud.toast(`<b>${g.charDef(def.giver).name}</b> vill dig något <span class="bang">!</span> Leta efter markeringen.`), 2200);
    g.save?.();
  }

  // Ove steps up to the giver for the intro: on their side of the door, about 2 m in front of them
  // along the way their spot faces (out of the door), on the same level, with nothing between them,
  // the free spot nearest to where he came from. He stays where he is if that already holds.
  standBefore(giver, def) {
    const g = this.g, p = g.player, L = lm(def.at), yaw = L.yaw ?? 0;
    const others = Object.values(g.npcs || {}).filter((n) => n !== giver && n.state === 'normal' && !n.car);
    const free = (x, z) => g.spotFree(x, z) && Math.abs(g.groundAt(x, z) - giver.y) < 0.25 && !onRamp(x, z)
      && segmentBlocked(giver.x, giver.z, x, z, Math.min(giver.y, g.groundAt(x, z)) + 0.6) < 0 && !others.some((n) => dist(n.x, n.z, x, z) < 0.9);
    const d = dist(p.x, p.z, giver.x, giver.z), rel = Math.abs(angleDiff(yaw, yawTo(p.x - giver.x, p.z - giver.z)));
    if (d > 1.4 && d < 3.0 && rel < 1.1 && free(p.x, p.z)) return;
    let best = null, bs = Infinity;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9]) {
      for (const r of [2.1, 1.8, 2.5]) {
        const a = yaw + da, x = giver.x + Math.sin(a) * r, z = giver.z + Math.cos(a) * r;
        if (!free(x, z)) continue;
        const sc = Math.abs(da) + Math.abs(r - 2.1) * 0.5 + dist(x, z, p.x, p.z) * 0.08;
        if (sc < bs) { bs = sc; best = { x, z }; }
      }
    }
    if (best) p.teleport(best.x, best.z, yawTo(giver.x - best.x, giver.z - best.z));
  }

  // Dialogue lines with a camera beat whenever someone in `cast` who isn't in the shot speaks (the
  // camera turns to them and Ove); Ove's own lines keep the shot.
  beats(lines, cast) {
    let framed = cast[0];
    return lines.map(([who, text, on]) => {
      if (on || cast.length < 2 || who === 'ove') return [who, text, on];
      const n = this.g.npc(who);
      if (!cast.includes(n) || n === framed) return [who, text];
      framed = n;
      return [who, text, (gg) => gg.cam.frame(n, gg.player, { extras: cast.filter((c) => c !== n) })];
    });
  }

  async begin() {
    const g = this.g, def = this.offered;
    if (!def) return;
    this.state = 'intro';
    hud.hideBanner();
    hud.clearBubbles?.();
    g.interrupts.abort();
    g.patrol.cancelWriting('');
    // A smitare chase still going drives off quietly (no SMET! over the intro).
    g.patrol.dropPursuit?.();
    const giver = g.npc(def.giver);
    const lines = this.gaveUp.has(def.day) && def.retryIntro ? def.retryIntro : def.intro;
    // Whoever else speaks in the scene (Parvaneh beside Patrick, Anders, Rune).
    const cast = [giver, ...[...new Set(lines.map(([w]) => w))].filter((w) => w !== 'ove' && w !== def.giver).map((k) => g.npc(k)).filter((n) => n && n.state === 'normal' && !n.car)];
    g.player.wishX = g.player.wishZ = 0;
    g.player.vx = g.player.vz = 0;
    this.standBefore(giver, def);
    g.player.yaw = yawTo(giver.x - g.player.x, giver.z - g.player.z);
    for (const n of cast) n.yaw = yawTo(g.player.x - n.x, g.player.z - n.z);
    g.cinematic(giver, g.player, { extras: cast.slice(1) });
    this.introOn = true;
    // Taken up again after giving up: two lines, not the whole scene again.
    await g.dialog(this.beats(lines, cast));
    this.introOn = false;
    g.endCinematic();
    hud.showBanner(def.name, def.tagline || '', 'mission', 3000, `Dag ${def.day} · ${DAYS[def.day - 1]}`);
    audio.jingle('start');
    if (def.snow) fx.snowfall(true, 0.55);
    this.startMission();
  }

  // From stage `from` (a retry on the race grid), with `aboard` (npc keys) in Ove's car.
  startMission(from = 0, aboard = []) {
    const g = this.g, def = this.current;
    this.m = newCtx(def);
    def.setup?.(g, this.m);
    for (const k of aboard) {
      const n = g.npc(k);
      this.m.data.npcs.add(n);
      if (g.playerCar && n.car !== g.playerCar) { g.sendHome?.(n); g.boardCompanion(n, g.playerCar); }
    }
    this.stageI = from;
    this.state = 'running';
    this.startStage();
  }

  startStage() {
    const g = this.g;
    this.stage = this.m.def.stages[this.stageI]();
    this.stage.init?.(g, this.m);
  }

  update(dt) {
    this.updateGate(dt);
    if (this.state !== 'running') return;
    const g = this.g;
    const r = this.stage.update(g, this.m, dt);
    if (r === 'done') {
      this.stage.cleanup?.(g, this.m);
      this.stage = null;
      this.stageI++;
      if (this.stageI >= this.m.def.stages.length) this.complete();
      else { audio.checkpoint(); this.startStage(); }
    } else if (r && r.fail) this.fail(r.fail);
  }

  // From main.js onCarImpact: some stages count rams (destroy).
  onImpact(a, b, impact) { if (this.state === 'running') this.stage?.onImpact?.(this.g, this.m, a, b, impact); }

  objective() {
    if (this.state !== 'running' || !this.stage) return null;
    const o = this.stage.obj?.(this.g) || {};
    return { title: this.m.def.title, text: this.stage.sub || this.stage.text, ...o };
  }
  target() {
    if (this.state !== 'running' || !this.stage) return null;
    return this.stage.altTarget?.(this.g) || this.stage.target?.(this.g) || null;
  }
  markers() { return this.state === 'running' ? this.stage?.markers?.(this.g) || [] : []; }

  cleanupMission() {
    const g = this.g;
    if (this.stage) this.stage.cleanup?.(g, this.m);
    this.stage = null;
    if (this.m) disposeCtx(g, this.m);
    g.freezeCar = false;
    g.interrupts.hangUp?.();
  }

  // The outro's people stand by Ove, in plain view: whoever is already within 4 m with nothing
  // between them stays; the others are brought to a free spot in front of him (fanning out to the
  // sides) on his level - never behind a wall, a fence or a car, never on a ramp.
  placeCast(keys) {
    const g = this.g, p = g.player, out = [];
    // (nothing taller than 0.6 m above the lower of the two spots between them: walls, fences, hedges)
    const clear = (x, z) => segmentBlocked(p.x, p.z, x, z, Math.min(g.groundAt(p.x, p.z), g.groundAt(x, z)) + 0.6) < 0;
    const ok = (x, z) => dist(x, z, p.x, p.z) < 4 && clear(x, z) && !onRamp(x, z) && !out.some((q) => dist(q.x, q.z, x, z) < 1.25);
    for (const key of keys) {
      const n = g.npc(key);
      if (n.car) g.unseat(n);
      g.removeCompanion(n);
      if (n.state === 'hidden') { n.state = 'normal'; n.root.visible = true; }
      n.walkTo = null; n.walkPath = null; n.busy = true;
      if (n.state === 'normal' && dist(n.x, n.z, p.x, p.z) > 1.0 && ok(n.x, n.z) && Math.abs(n.y - p.y) < 0.3) { out.push(n); continue; }
      let spot = null;
      for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, 2.5, -2.5, Math.PI]) {
        for (const r of [2.3, 2.9, 1.8, 3.5]) {
          const a = p.yaw + da, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
          if (g.spotFree(x, z) && Math.abs(g.groundAt(x, z) - p.y) < 0.2 && ok(x, z)) { spot = { x, z }; break; }
        }
        if (spot) break;
      }
      spot ??= g.freeSpot(p.x, p.z, 1.8, 3.2);
      n.teleport(spot.x, spot.z);
      n.state = 'normal';
      out.push(n);
    }
    for (const n of out) n.yaw = yawTo(p.x - n.x, p.z - n.z);
    if (out[0]) p.yaw = yawTo(out[0].x - p.x, out[0].z - p.z);
    return out;
  }

  async complete() {
    const g = this.g, def = this.m.def, p = g.player;
    this.state = 'outro';
    this.outroOn = false; this.outroCast = [];
    this.cleanupMission();
    hud.clearBubbles?.();
    // UPPDRAG KLART over a held shot of what was just done (the Saab in its garage, Ove at a door,
    // the grave), not wherever the chase camera happens to look; nobody moves under the banner.
    const sub = g.playerCar || p;
    g.inDialog = true;
    if (def.finale) def.finale(g, 'klart');
    else if ((sub.speed || 0) < 3) g.cam.showcase(sub);
    hud.showBanner('UPPDRAG KLART', `${def.name} · +${def.reward} kr`, 'good', 2400, `Dag ${def.day}`);
    audio.jingle('complete');
    g.addCoins(def.reward);
    await g.wait(2.2);
    hud.hideBanner();
    g.cam.release();
    if (g.playerCar) g.exitCar(true);
    p.state = 'normal';
    p.wishX = p.wishZ = 0; p.vx = p.vz = 0;
    // The end of days 1-6 ("Dagen är slut"; the next day dawns at 10:30). Day 7 set its own.
    if (def.day < 7) g.setClock(...DAY_END);
    if (def.outroAt) { const o = at(def.outroAt, g); p.teleport(o.x, o.z, o.yaw ?? p.yaw); }
    this.outroProps = def.outroSetup?.(g) || null;
    const keys = [...new Set(def.outro.map(([w]) => w).filter((w) => w !== 'ove'))];
    const cast = (this.outroCast = keys.length ? this.placeCast(keys) : []);
    if (def.finale) { hud.letterbox(true); g.inDialog = true; def.finale(g, 'outro'); }
    else if (cast[0]) g.cinematic(cast[0], p, { extras: cast.slice(1) });
    else if (def.outroLook) { const o = def.outroLook(g); p.yaw = yawTo(o.x - p.x, o.z - p.z); g.cinematic(o, p); }
    else { hud.letterbox(true); g.inDialog = true; }
    this.outroOn = true;
    await g.dialog(this.beats(def.outro, cast));
    const last = this.index + 1 >= MISSIONS.length;
    if (!last || !def.finale) { g.endCinematic(); def.finale?.(g, 'done'); }
    this.outroOn = false;
    this.outroProps?.dispose?.();
    this.outroProps = null;
    for (const n of cast) { n.busy = false; n.homeX = undefined; }
    this.index++;
    this.state = 'idle';
    this.m = null;
    this.gateOpen = false;
    this.gate = { idle: 0, reports: g.patrol.reports };
    g.storyWorld?.();
    g.save();
    if (this.index >= MISSIONS.length) {
      // The area is in order: the meter says so too.
      g.patrol.ordning = Math.max(g.patrol.ordning, 90);
      hud.setMeter(g.patrol.ordning);
      hud.showBanner('OMRÅDET ÄR I ORDNING', 'Sju dagar. Tack för att du spelade. Patrullen fortsätter.', 'final', 8000, 'Saab & Run');
      audio.jingle('complete');
      setTimeout(() => hud.toast('Grannarna kommer att fortsätta ringa. Det gör de alltid.', '', 7000), 8500);
      if (def.finale) {
        // The banner over the grave, wide, in the snow; then Ove gets up and the town is his again.
        g.inDialog = true;
        def.finale(g, 'end');
        await g.wait(6.5);
        g.endCinematic();
        def.finale(g, 'done');
      }
      if (def.snow) setTimeout(() => { fx.snowfall(false); dusk(false); }, 40000);
    } else {
      if (def.snow) fx.snowfall(false);
      const next = this.current;
      if (this.gating) hud.toast(`Dagen är slut. Patrullera området en stund – i morgon behöver <b>${g.charDef(next.giver).name}</b> hjälp.`, '', 7000);
      this.updateGate(0);
    }
  }

  fail(reason) {
    if (this.state !== 'running') return;
    const g = this.g, def = this.m.def;
    this.state = 'failed';
    audio.jingle('fail');
    hud.showBanner('UPPDRAG MISSLYCKADES', reason, 'bad', 0, def.title);
    // Whoever rode with Ove took a taxi home: nobody is left standing on the street.
    const riders = [...this.m.data.npcs].filter((n) => g.companions.has(n) || (n.car && n.car === g.playerCar));
    this.cleanupMission();
    for (const n of riders) g.sendHome?.(n);
    g.player.anim.kneel = false;
    dusk(false);
    this.failT = 0;
  }

  // While failed: E tries again (from the start of the day's mission, or from def.retry.from), Q
  // (or the gamepad's B) gives up for now. No time limit: the banner waits for the player.
  updateFailed(dt) {
    if (this.state !== 'failed') return;
    this.failT += dt;
    const g = this.g;
    hud.setPrompt(this.failT > 0.8 ? '<b>E</b> Försök igen &nbsp; · &nbsp; <b>Q</b> Ge upp' : '');
    // Give up: Q or the gamepad's B (input.js's 'giveUp' action).
    const giveUp = g.input.pressed('giveUp');
    if (this.failT > 0.8 && g.input.pressed('interact')) this.retry();
    else if (this.failT > 0.8 && giveUp) this.abort();
  }

  retry() {
    const g = this.g;
    hud.hideBanner();
    hud.setPrompt('');
    const def = this.current, r = def.retry;
    if (r) {
      // Straight back to that stage (the race grid), in the car, with whoever rode along.
      if (g.playerCar && g.playerCar.name !== r.car) g.exitCar(true);
      if (!g.playerCar) { g.player.state = 'normal'; g.enterCar(g.ensureNamedCar(r.car)); }
      hud.showBanner(def.name, 'Ett försök till.', 'mission', 2000, def.title);
      audio.jingle('start');
      this.startMission(r.from, r.with || []);
      return;
    }
    const p = lm(def.at);
    if (g.playerCar) g.exitCar(true);
    const s = g.freeSpot(p.x + Math.sin(p.yaw) * 2.5, p.z + Math.cos(p.yaw) * 2.5, 0, 2);
    g.player.teleport(s.x, s.z, p.yaw + Math.PI);
    g.player.state = 'normal';
    g.cam.yaw = p.yaw + Math.PI;
    g.cam.snapNext = true;
    g.homeNamedCar?.('saab');
    hud.showBanner(def.name, 'Ett försök till.', 'mission', 2000, def.title);
    audio.jingle('start');
    this.startMission();
  }

  abort() {
    const def = this.current;
    hud.hideBanner();
    hud.setPrompt('');
    if (this.state === 'running') this.cleanupMission();
    this.state = 'idle';
    this.m = null;
    this.g.player.anim.kneel = false;
    dusk(false);
    if (def) this.gaveUp.add(def.day);
    if (def?.snow) fx.snowfall(false);
    if (def) hud.toast(`<b>${this.g.charDef(def.giver).name}</b> väntar fortfarande. Kom tillbaka när du vill.`);
  }
}

// On a ramp (Rune's): nobody is placed for a scene there.
function onRamp(x, z) {
  for (const b of queryBlocks(x - 0.4, z - 0.4, x + 0.4, z + 0.4, _rq)) if (b.shape === RAMP && contains(b, x, z)) return true;
  return false;
}
const _rq = [];

