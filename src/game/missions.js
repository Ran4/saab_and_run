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

import { lm, rc, landmarks } from '../world/layout.js';
import { segmentBlocked } from '../world/collision.js';
import { audio } from '../audio.js';
import { hud } from './hud.js';
import { fx } from './fx.js';
import { dist, yawTo } from '../util.js';
import { Collectible } from '../actors/pickups.js';
import {
  newCtx, disposeCtx, getInCar, goto, holdAt, fetch, pickup, dropoff, catchCat, parkIn, report,
  race, destroy, grab, talk, cut, at, lmOr,
} from './stages.js';

export const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
// Between two days: the next one starts after this many more reports, or this long in free roam.
const GATE = { reports: 2, secs: 75 };

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

// Day 7: the flowers stay on Sonja's grave (until the game is reloaded). On the plinth in front of
// the stone (the world's graveFlowers spot), else leaning against the stone's front.
export function flowersOnGrave(g) {
  const s = lm('sonjaGrave'), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), gf = landmarks.graveFlowers;
  const x = gf ? gf.x : s.x + fx * 1.22 - fz * 0.18, z = gf ? gf.z : s.z + fz * 1.22 + fx * 0.18;
  const y = gf?.y != null ? gf.y : g.groundAt(x, z);
  const f = new Collectible(g.scene, 'flowers', 'grave', x, y + 0.02, z, { beam: false, scale: 2.3 });
  f.inner.rotation.set(0.42, s.yaw, 0, 'YXZ');
  g.graveFlowers?.dispose?.();
  g.graveFlowers = f;
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
        text: 'Backa in bil och släp i rutan framför Parvanehs dörr',
        hint: 'Backa med släp: vrid ratten <b>åt andra hållet</b> än dit du vill att släpet ska. Små rattrörelser, rätta ofta. <b>B</b> = titta bakåt.',
      }), {
        first: 9, every: 14,
        lines: [['patrick', 'Lite till vänster! Eller... höger?'], ['parvaneh', 'Patrick, säg inget. Låt honom vara.'], ['patrick', 'Ska jag vinka in dig?'], ['ove', 'NEJ.', 'radio'], ['patrick', 'Wow. Det ser ut som i reklamen.']],
      }),
      also(() => report({ n: 3, near: 'guestParking', radius: 45, smitare: false, text: 'Anteckna 3 felparkeringar på parkeringen' }), {
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
      ['ove', 'Inget körkort? Du är trettio år.'],
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
      () => fetch({ at: 'oveGarage', item: 'wrench', label: 'elementnyckeln', text: 'Hämta elementnyckeln i garaget', rMin: 0.4, rMax: 1.5, got: 'Elementnyckeln. Mässing. Ove har haft den sedan 1991.' }),
      also(() => report({ n: 2, near: 'garbageRoom', radius: 40, smitare: false, text: 'Två bilar står framför soprummet. Anteckna dem' }), {
        call: ['anita', 'Ove? Förlåt igen. Sopbilen kommer inte fram, det står två bilar framför soprummet.', 'Jag tar dem.'],
      }),
      () => holdAt({ at: 'runeHouse', secs: 2.6, label: 'Gå in och lufta elementen', text: 'Lufta elementen hos Anita och Rune', work: 'wall', cut: 'Ove går in och luftar elementen. Ett i taget.' }),
    ],
    outro: [
      ['anita', 'Det är varmt i huset igen. Tack, Ove.'],
      ['ove', 'Två gånger per vinter. Minst. Jag skriver det på en lapp åt er.'],
      ['rune', '...Saab.'],
      ['ove', 'Ja, Rune. Saab.'],
      ['anita', 'Han kom ihåg dig. Han kom faktiskt ihåg dig.'],
      ['ove', 'Hmpf. Han körde Volvo i trettio år. Det glömmer man inte.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 'katten', day: 4, name: 'Katten', title: 'Dag 4 – Katten', giver: 'jimmy', at: 'jimmyHouse', reward: 150,
    tagline: 'En katt i snön. Ingens katt.',
    intro: [
      ['jimmy', 'Ove! Min man! Det sitter en katt i snön vid cykelförrådet. Den har suttit där hela natten.'],
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
    // At his own door, facing out (the cat is already in the hall).
    outroAt: () => { const o = lm('oveHouse'); return { x: o.x, z: o.z, yaw: o.yaw }; },
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
        finish: DEALER_FINISH, finishR: 12, cruise: 19, aggressive: false, text: 'Kör först till bilhallen!', failText: 'Anders kom först. Han kommer att prata om det i flera år.',
        radio: [['adrian', 'Han kör om! Ove, han kör om!'], ['ove', 'Låt honom. Han får se.'], ['anders', 'Vorsprung durch Technik, Ove!'], ['adrian', 'Är det normalt att det luktar så här?'], ['ove', 'Det är kopplingen. Den är som den ska.']],
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
      ['anita', 'Han tog med sig alla papper. Runes journaler. Han åkte nyss, i den vita bilen.'],
      ['ove', 'Åt vilket håll?'],
      ['anita', 'Ove, du ska väl inte göra något dumt?'],
      ['ove', 'Jag ska bara prata med honom.'],
    ],
    retryIntro: [['anita', 'Ove... pappren. Han har dem fortfarande.'], ['ove', 'Inte länge till.']],
    stages: [
      () => getInCar({ car: 'saab', text: 'Hämta Saaben' }),
      also(() => destroy({
        who: 'vitskjorta', type: 'skoda', carName: 'vitskjortaSkoda', cruise: 19, timer: 160, ram: 3.5, ramMax: 30, drain: 8,
        text: 'Stoppa den vita Škodan: knuffa den och håll dig tätt bakom', failText: 'Han kom undan med pappren.', stopBanner: 'STOPPAD!', stopSub: 'Vita skjortan kör in till kanten', tag: 'Vita skjortan',
      }), {
        call: ['anita', 'Ove... var försiktig. Han är bara en tjänsteman.', 'Det är det som är problemet.'],
        first: 12, every: 13,
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
      () => grab({ item: 'papers', label: 'Runes papper', text: 'Ta pärmen med Runes papper', side: -1, got: 'Runes papper. Det saknas mycket riktigt en underskrift. Typiskt.' }),
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
        then: (g) => { const c = g.playerCar, h = lm('hospitalSpot'); if (c && c.name === 'saab' && g.spotFree(h.x, h.z)) { c.place(h.x, h.z, h.yaw + Math.PI); g.cam.yaw = c.yaw; g.cam.snapNext = true; } },
      }),
      // On the way to the cemetery Patrick phones from the maternity ward.
      also(() => fetch({ at: 'flowerShop', item: 'flowers', label: 'blommorna', text: 'Köp blommor vid kyrkogården', rMin: 0.8, rMax: 2.2, got: 'Rosa. Hon tyckte alltid om rosa.' }), {
        say: 'Det är söndag.',
        call: ['patrick', 'Ove! Det blev en pojke! Tre kilo fyrahundra! Han skriker precis som Parvaneh. Jag svimmade bara lite!', 'Hmpf. Grattis.'], callAt: 3.5,
      }),
      also(() => holdAt({ at: 'sonjaGrave', secs: 3, radius: 2.2, label: 'Lägg blommorna på Sonjas grav', text: 'Gå till Sonjas grav', work: 'low' }), { done: flowersOnGrave }),
    ],
    outroLook: (g) => { const s = lm('sonjaGrave'); const x = s.x + Math.sin(s.yaw) * 1.55, z = s.z + Math.cos(s.yaw) * 1.55; return { x, y: g.groundAt(x, z), z, height: 1.1 }; },
    outro: [
      ['ove', 'Hej, Sonja.'],
      ['ove', 'Vilken vecka det har varit. Grannarna, alltså. De kan ingenting.'],
      ['ove', 'Parvaneh fick en pojke. Han skriker som hon. Patrick svimmade.'],
      ['ove', 'Adrian har köpt en Saab. Rune bor kvar. Katten... katten får stanna. Tills vidare.'],
      ['ove', 'Jag vet vad du skulle säga. Att de behöver mig.'],
      ['ove', 'Hmpf.'],
      ['ove', 'Det är i ordning nu, Sonja. Området.'],
      ['ove', 'Jag kommer på söndag igen. Som vanligt.'],
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
    this.gate = null;        // { t, reports } when the last day ended
    this.gaveUp = new Set(); // days given up (Q) at least once: a short intro next time
    this.outroCast = [];     // the people in the outro (tests check they stand by Ove, in view)
    this.outroOn = false;    // the outro's dialogue is up (cast placed, camera framed)
    this.outroProps = null;
  }

  get current() { return MISSIONS[this.index] || null; }
  // The mission a neighbour is offering right now (null while a mission runs or the day hasn't begun).
  get offered() { return this.state === 'idle' && this.gateOpen ? this.current : null; }
  get active() { return this.state !== 'idle'; }

  // While idle between two days: the next one begins after a little patrolling.
  updateGate() {
    if (this.state !== 'idle' || this.gateOpen || !this.current) return;
    const g = this.g, G = this.gate || { t: g.time, reports: g.patrol.reports };
    if (this.gating && g.patrol.reports - G.reports < GATE.reports && g.time - G.t < GATE.secs) return;
    this.gateOpen = true;
    const def = this.current;
    g.setClock(6, 30);
    // A new morning: everyone where they spend the day, and the Saab back at home (unless Ove is
    // in it or standing by it).
    g.placeNpcs?.(true);
    const saab = g.named?.saab;
    if (saab && saab !== g.playerCar && dist(saab.x, saab.z, g.player.x, g.player.z) > 60) g.homeNamedCar?.('saab');
    hud.showBanner(`Dag ${def.day}`, `${DAYS[def.day - 1]} morgon`, 'mission', 2600, 'Ny dag');
    setTimeout(() => hud.toast(`<b>${g.charDef(def.giver).name}</b> vill dig något <span class="bang">!</span> Leta efter markeringen.`), 2200);
  }

  async begin() {
    const g = this.g, def = this.offered;
    if (!def) return;
    this.state = 'intro';
    hud.hideBanner();
    g.interrupts.abort();
    g.patrol.cancelWriting('');
    const giver = g.npc(def.giver);
    g.player.wishX = g.player.wishZ = 0;
    g.player.vx = g.player.vz = 0;
    g.player.yaw = yawTo(giver.x - g.player.x, giver.z - g.player.z);
    giver.yaw = yawTo(g.player.x - giver.x, g.player.z - giver.z);
    g.cinematic(giver, g.player);
    // Taken up again after giving up: two lines, not the whole scene again.
    await g.dialog(this.gaveUp.has(def.day) && def.retryIntro ? def.retryIntro : def.intro);
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
    this.updateGate();
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
  // sides), never behind a wall, a fence or a car.
  placeCast(keys) {
    const g = this.g, p = g.player, out = [];
    // (nothing taller than 0.6 m above the lower of the two spots between them: walls, fences, hedges)
    const clear = (x, z) => segmentBlocked(p.x, p.z, x, z, Math.min(g.groundAt(p.x, p.z), g.groundAt(x, z)) + 0.6) < 0;
    const ok = (x, z) => dist(x, z, p.x, p.z) < 4 && clear(x, z) && !out.some((q) => dist(q.x, q.z, x, z) < 1.25);
    for (const key of keys) {
      const n = g.npc(key);
      if (n.car) g.unseat(n);
      g.removeCompanion(n);
      if (n.state === 'hidden') { n.state = 'normal'; n.root.visible = true; }
      n.walkTo = null; n.walkPath = null; n.busy = true;
      if (n.state === 'normal' && dist(n.x, n.z, p.x, p.z) > 1.0 && ok(n.x, n.z) && Math.abs(n.y - p.y) < 0.5) { out.push(n); continue; }
      let spot = null;
      for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, 2.5, -2.5, Math.PI]) {
        for (const r of [2.3, 2.9, 1.8, 3.5]) {
          const a = p.yaw + da, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
          if (g.spotFree(x, z) && Math.abs(g.groundAt(x, z) - p.y) < 0.35 && ok(x, z)) { spot = { x, z }; break; }
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
    const g = this.g, def = this.m.def;
    this.state = 'outro';
    this.outroOn = false; this.outroCast = [];
    this.cleanupMission();
    hud.showBanner('UPPDRAG KLART', `${def.name} · +${def.reward} kr`, 'good', 2400, `Dag ${def.day}`);
    audio.jingle('complete');
    g.addCoins(def.reward);
    await g.wait(2.2);
    hud.hideBanner();
    if (g.playerCar) g.exitCar(true);
    const p = g.player;
    p.state = 'normal';
    p.wishX = p.wishZ = 0; p.vx = p.vz = 0;
    // The evening of days 1-6 ("Dagen är slut"; the next day dawns at 06:30). Day 7 set its own.
    if (def.day < 7) g.setClock(17, 30);
    if (def.outroAt) { const o = at(def.outroAt, g); p.teleport(o.x, o.z, o.yaw ?? p.yaw); }
    this.outroProps = def.outroSetup?.(g) || null;
    const keys = [...new Set(def.outro.map(([w]) => w).filter((w) => w !== 'ove'))];
    const cast = (this.outroCast = keys.length ? this.placeCast(keys) : []);
    let other = cast[0] || null;
    if (!other && def.outroLook) {
      other = def.outroLook(g);
      p.yaw = yawTo(other.x - p.x, other.z - p.z);
    }
    if (other) g.cinematic(other, p);
    else g.inDialog = true;
    this.outroOn = true;
    // With more than one other speaker the camera turns to whoever speaks (unless a line has its
    // own camera beat).
    let framed = cast[0];
    const lines = def.outro.map(([who, text, on]) => {
      if (on || cast.length < 2 || who === 'ove') return [who, text, on];
      const n = g.npc(who);
      if (n === framed) return [who, text];
      framed = n;
      return [who, text, (gg) => gg.cam.frame(n, gg.player)];
    });
    await g.dialog(lines);
    g.endCinematic();
    this.outroOn = false;
    this.outroProps?.dispose?.();
    this.outroProps = null;
    for (const n of cast) { n.busy = false; n.homeX = undefined; }
    this.index++;
    this.state = 'idle';
    this.m = null;
    this.gateOpen = false;
    this.gate = { t: g.time, reports: g.patrol.reports };
    g.storyWorld?.();
    g.save();
    if (this.index >= MISSIONS.length) {
      // The area is in order: the meter says so too.
      g.patrol.ordning = Math.max(g.patrol.ordning, 90);
      hud.setMeter(g.patrol.ordning);
      hud.showBanner('OMRÅDET ÄR I ORDNING', 'Sju dagar. Tack för att du spelade. Patrullen fortsätter.', 'final', 8000, 'Saab & Run');
      audio.jingle('complete');
      setTimeout(() => hud.toast('Grannarna kommer att fortsätta ringa. Det gör de alltid.', '', 7000), 8500);
      if (def.snow) setTimeout(() => fx.snowfall(false), 40000);
    } else {
      if (def.snow) fx.snowfall(false);
      const next = this.current;
      if (this.gating) hud.toast(`Dagen är slut. Patrullera området en stund – i morgon behöver <b>${g.charDef(next.giver).name}</b> hjälp.`, '', 7000);
      this.updateGate();
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
    this.failT = 0;
  }

  // While failed: E tries again (from the start of the day's mission, or from def.retry.from), Q
  // gives up for now. No time limit: the banner waits for the player.
  updateFailed(dt) {
    if (this.state !== 'failed') return;
    this.failT += dt;
    const g = this.g;
    hud.setPrompt(this.failT > 0.8 ? '<b>E</b> Försök igen &nbsp; · &nbsp; <b>Q</b> Ge upp' : '');
    if (this.failT > 0.8 && g.input.pressed('interact')) this.retry();
    else if (this.failT > 0.8 && g.input.keyPressed('KeyQ')) this.abort();
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
    if (def) this.gaveUp.add(def.day);
    if (def?.snow) fx.snowfall(false);
    if (def) hud.toast(`<b>${this.g.charDef(def.giver).name}</b> väntar fortfarande. Kom tillbaka när du vill.`);
  }
}
