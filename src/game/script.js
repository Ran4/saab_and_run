// Saab & Run — every line anybody says out loud, as pure data: no imports and nothing that runs at
// load, so the voice tool (features/a_fully_voiced_game.md) can import it in node and record a clip
// for each. Code imports its lines from here and never inlines voiced text. Text that is only read
// (objectives, toasts, banners, failText, `got:` notes, prompts, labels, taglines, waitToast, the
// emblem and photo notes) is not voiced and stays with the code. The lines are Swedish; keep them
// exactly as they are said (a changed line is a new clip).
//
//   LINE  = [who, text] or [who, text, how]; how 'radio' | 'shout' (only a stage's `lines` honour it:
//           missions.js also(); without it they shout). who is a CHARS key (models.js: 'ove',
//           'patrick', 'parvaneh', 'sara', 'nasanin', 'jimmy', 'adrian', 'anita', 'rune', 'anders',
//           'vitskjorta') or a pseudo-speaker for a shared table:
//             'ped'       an adult passer-by        'ped_teen'  a teenager (13-18)
//             'ped_old'   a pensioner (65+)         'ped_kid'   a child (under 13)
//             'driver'    a car's driver (a smitare too: the bubble is on the car)
//             'window'    someone shouting from a window
//             'cast'      one of the named neighbours
//           A `// @voice ...` comment above a shared table says who can say it: the pool voices and
//           the neighbours it is to be recorded for ('cast': all of them). allLines() gives its
//           lines once, with the table's pseudo-speaker.
//   CALL  = [who, text, reply]: a neighbour on the phone (interrupts.radioOnly) and Ove's answer.
//   POOL  = [text, ...]: code picks one at random (keep the order: the picks depend on it).
//   WHEN  = [text, tag]: a pool line said only while whenOk(tag, m) holds (m: the MissionRunner).
//
//   STORY[mission id] = {        (missions.js MISSIONS[].id, in day order)
//     day                        1-7
//     intro, retryIntro, outro   [LINE...]: the scenes (missions.js adds the outros' camera beats,
//                                by line index: keep those lines where they are)
//     introWidow, outroWidow,    the same, once Rune is dead (game/rune.js: the errand given up
//     callsBackWidow             after he died); missions.js takes them instead (same beats)
//     call: CALL, calls / callsBack: [CALL...]   phone calls during a stage (keys starting 'call')
//     any other key              a LINE or [LINE...] said during the day's stages, named for the
//                                moment (missions.js says where: bubbles, radio, a stage's hello)
//   }
//   ERRANDS[id] = { who, lines: POOL said in turn on the phone, ove (his answer), thanks, fail,
//                   busy (a story day took Ove off it), hello / bye: LINE (a stage's, by whoever is
//                   fetched or dropped off), dead (rune: on the radio once Ove has given up after
//                   Rune died) }      ERRAND_BUSY  the fallback busy line
//   ANSWER, DONE     Ove picks up the phone / has done an errand
//   CHATTER[who]     small talk (POOL of text | WHEN)   CHATTER_FIRST[who]  before day 1's scene
//   CHATTER_AFTER[who] = [days done, POOL, replace]     CHATTER_FALLBACK  when nothing else fits
//   CHATTER_REPLY[who][line]   Ove's answer to each line of small talk (and the exchanges that go on)
//   CHATTER_ENOUGH, CHATTER_SPARE   the fourth chat in a minute; an answer to a line with none
//   OVE_REPLY, TYRE, SLID, OVE_HOPP, GARAGE_DOOR, OVE_START    Ove's own reactions
//   OUCH, GETUP, CARJACK, KICKED, KICKED_NEIGHBOUR, SHOVED, SHOVED_KID, PANIC   people hit, kicked,
//                    shoved, carjacked, nearly run over
//   FLEE_LINES, CAUGHT_LINES, PATROL   the patrol (smitare, the Ordning meter's events)
//   HONK_*, SAAB_GREET, ANDERS_LAW, RUNE_HORN, ANITA_RUNE, OVE_HONK   the horn (horn.js)
//   COMING, CAT_COMES, CHASER_GAVE_UP   stages.js
//   WIDOW            Anita once Rune is dead (game/rune.js): small talk, sobs, horn, the radio
//   RUNE_DIES        Ove, as Rune dies on the errand
//
//   whenOk(tag, m)   the WHEN tags: 'met' (day 1 is done: the new neighbours know Ove), 'notMet',
//                    'eveningOfDay1', 'onDay<n>' (the day it is: the evening after day n is still day
//                    n), 'after<n>' (n days done), 'before<n>'; several tags separated by spaces
//                    must all hold ('met before7').
//   allLines()       [[who, text, part], ...]: every line the code can say, deduplicated on who +
//                    text (the first one wins). part: 'day1' .. 'day7' (all of STORY), then
//                    'chatterFirst', 'chatter', 'chatterAfter', 'errands', 'calls' (ANSWER, DONE),
//                    'reactions' (Ove's own), 'waking', 'patrol', 'peds', 'horn', 'stages', 'widow',
//                    'chatterReply' (CHATTER_REPLY's new lines, CHATTER_ENOUGH). A CALL's reply is
//                    its own ['ove', reply, part]. The fallbacks (ERRAND_BUSY, CHATTER_FALLBACK,
//                    HONK_PASSENGER_ANY) are in it only for a speaker who can get to them (nobody
//                    today). Keep it complete: a new table goes in here too.

export const STORY = {
  // ---------------------------------------------------------------------------------------------
  slapet: {
    day: 1,
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
    outro: [
      ['parvaneh', 'Ove! Där är du. Jag har lagat saffransris med kyckling. Det blev för mycket.'],
      ['ove', 'Jag har mat.'],
      ['parvaneh', 'Vad åt du i går då?'],
      ['ove', '...Mat.'],
      ['parvaneh', 'Ta den. Lådan vill jag ha tillbaka. Och tack för släpet.'],
      ['ove', 'Hmpf. Ni är skyldiga mig en brevlåda.'],
    ],
    // While Ove backs the trailer in (shouted, unless 'radio').
    backing: [['patrick', 'Lite till vänster! Eller... höger?'], ['parvaneh', 'Patrick, säg inget. Låt honom vara.'], ['patrick', 'Ska jag vinka in dig?'], ['ove', 'NEJ.', 'radio'], ['patrick', 'Wow. Det ser ut som i reklamen.']],
    // A bubble as the three reports start.
    whileOut: ['ove', 'När jag ändå är ute.'],
  },
  // ---------------------------------------------------------------------------------------------
  sjukhuset: {
    day: 2,
    intro: [
      ['parvaneh', 'Ove! Patrick har ramlat ner från stegen. Han skulle sätta upp en adventsstjärna.'],
      ['ove', 'På en stege. I snö.'],
      ['parvaneh', 'Ambulansen tog honom. Jag måste dit, och jag... jag har inget körkort.'],
      ['ove', 'Inget körkort? Du är ju trettio år!'],
      ['parvaneh', 'Ove. Snälla. Flickorna är hos Jimmy. Jag går till parkeringen.'],
      ['ove', 'Jag hämtar Saaben. Man kör inte bil inne på området.'],
    ],
    retryIntro: [['parvaneh', 'Ove, snälla. Sjukhuset. Nu.'], ['ove', 'Jaja. Gå till parkeringen.']],
    outro: [
      ['parvaneh', 'Han har brutit armen. Han är hög på morfin och skrattar åt allting. Han hälsar.'],
      ['ove', 'Det kostar tjugofem kronor i timmen att stå här.'],
      ['parvaneh', 'Ove. Min man har brutit armen.'],
      ['ove', 'Jag betalar inte för att stå still!'],
      ['parvaneh', 'Du är helt omöjlig. Du får lära mig köra. Det har jag bestämt nu.'],
      ['ove', '...Vi börjar på måndag. I en riktig bil.'],
    ],
    // Parvaneh gets in at the lot; the radio on the drive; Jimmy phones; she gets out at Akuten.
    hello: ['parvaneh', 'Kör, Ove!'],
    drive: [['parvaneh', 'Ove, du kör som en pensionär!'], ['ove', 'Jag kör som det står på skyltarna.'], ['parvaneh', 'Varför blinkar du? Det är ingen där!'], ['ove', 'Man blinkar. Alltid.'], ['parvaneh', 'En stjärna, Ove. Han skulle sätta upp EN stjärna.']],
    calls: [['jimmy', 'Ove! Töserna undrar om de får äta glass till lunch. De säger att du sa ja.', 'Nej.']],
    bye: ['parvaneh', 'Tack, Ove! Parkera, jag kommer ut sen!'],
  },
  // ---------------------------------------------------------------------------------------------
  elementet: {
    day: 3,
    intro: [
      ['anita', 'Ove, förlåt att jag stör. Elementen är kalla igen, och det klickar i dem.'],
      ['ove', 'Det är luft i dem. Har ni luftat?'],
      ['anita', 'Rune gjorde alltid det. Förut. Nu vet jag inte ens var nyckeln ligger.'],
      ['ove', 'Elementnyckel. Jag har en i garaget. Alla borde ha en.'],
      ['rune', '...'],
      ['anita', 'Han tycker om när du kommer, Ove. Även om han inte säger det.'],
    ],
    retryIntro: [['anita', 'Ove... det klickar fortfarande i elementen.'], ['ove', 'Jag hämtar nyckeln.']],
    outro: [
      ['anita', 'Det är varmt i huset igen. Tack, Ove.'],
      ['ove', 'Två gånger per vinter. Minst. Jag skriver det på en lapp åt er.'],
      ['rune', '...Saab.'],
      ['ove', 'Ja, Rune. Saab.'],
      ['anita', 'Han kom ihåg dig. Han kom faktiskt ihåg dig.'],
      ['ove', 'Hmpf. Han har kört Volvo hela livet. Klart han minns en riktig bil.'],
    ],
    // Rune is dead (game/rune.js): Anita alone.
    introWidow: [
      ['anita', 'Ove, förlåt att jag stör. Elementen är kalla igen, och det klickar i dem.'],
      ['ove', 'Det är luft i dem. Har du luftat?'],
      ['anita', 'Rune gjorde alltid det. Förut. Nu vet jag inte ens var nyckeln ligger.'],
      ['ove', 'Elementnyckel. Jag har en i garaget. Alla borde ha en.'],
      ['anita', 'Han tyckte om när du kom, Ove. Även om han aldrig sa det.'],
    ],
    outroWidow: [
      ['anita', 'Det är varmt i huset igen. Tack, Ove.'],
      ['ove', 'Två gånger per vinter. Minst. Jag skriver det på en lapp åt dig.'],
      ['anita', 'Rune hade velat att det var du som gjorde det.'],
      ['ove', 'Hmpf. Han körde Volvo hela livet. Men elementen skötte han.'],
    ],
    // Bubbles: the empty hook in the garage, the note in Rune's glove box, Anders handing it over.
    noKey: ['ove', 'Rune. Naturligtvis.'],
    glovebox: ['ove', 'Anders.'],
    andersKey: ['anders', 'Elementnyckeln? Jaså, den. Den låg i Audin. Varsågod.'],
    call: ['anita', 'Ove? Förlåt igen. Sopbilen kommer inte fram, det står två bilar framför soprummet.', 'Jag tar dem.'],
  },
  // ---------------------------------------------------------------------------------------------
  katten: {
    day: 4,
    intro: [
      ['jimmy', 'Tjena Ove! Det sitter en katt i snön vid cykelförrådet. Den har suttit där hela natten.'],
      ['ove', 'Det är inte min katt.'],
      ['jimmy', 'Den är ingens katt. Det är ju det som är grejen.'],
      ['ove', 'Den har säkert loppor.'],
      ['jimmy', 'Jag skulle ta den själv, men den springer ifrån mig. Alla katter springer ifrån mig. Och duvor.'],
      ['ove', 'Det förstår jag.'],
    ],
    retryIntro: [['jimmy', 'Katten är tillbaka vid cykelförrådet, Ove!'], ['ove', 'Det är fortfarande inte min katt.']],
    outro: [
      ['jimmy', 'Du tog den! Vad ska den heta?'],
      ['ove', 'Den ska inte heta något. Den ska inte bo här.'],
      ['jimmy', 'Den sitter ju redan i din hall, Ove.'],
      ['ove', '...'],
      ['ove', 'Den får stanna. Tills vidare.'],
      ['jimmy', 'Tills vidare. Klart. Jag köper kattmat!'],
    ],
    // While Ove tries to catch the cat (shouted, unless 'radio').
    catching: [['jimmy', 'Spring efter den, Ove!'], ['jimmy', 'Nej, vänta! Stå still! Prata snällt med den!'], ['ove', 'Jag pratar inte med katter.', 'radio']],
  },
  // ---------------------------------------------------------------------------------------------
  saab: {
    day: 5,
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
    outro: [
      ['adrian', 'Vi vann! Mot en Audi! I en bil som är äldre än jag!'],
      ['anders', 'Jag lät dig vinna, Ove. Av respekt för de äldre.'],
      ['ove', 'Adrian. Den där.'],                                   // (beat: the Saab for sale)
      ['adrian', 'En Saab? Den är ju... faktiskt rätt snygg.'],
      ['ove', 'Den är ordentlig. Kolla rosten under trösklarna. Och pruta.'],
      ['adrian', 'Jag köper den! Ove, du får provsitta när du vill.'],  // (beat: Adrian and Ove)
      ['ove', 'Hmpf. Jag vet hur en Saab sitter.'],
    ],
    // Adrian gets in; the radio during the race.
    hello: ['adrian', 'Det här är det bästa som har hänt mig!'],
    race: [['adrian', 'Gasa, Ove! GASA!'], ['ove', 'Man gasar inte i kurvorna.'], ['anders', 'Vorsprung durch Technik, Ove!'], ['adrian', 'Är det normalt att det luktar så här?'], ['ove', 'Det är kopplingen. Den är som den ska.']],
  },
  // ---------------------------------------------------------------------------------------------
  vitskjortan: {
    day: 6,
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
    outro: [
      ['anita', 'Ove? Är det där... Runes papper?'],
      ['ove', 'De hade glömt en underskrift. Då gäller inte beslutet.'],
      ['anita', 'Så han får bo kvar?'],
      ['ove', 'Tills de har lärt sig läsa sina egna blanketter.'],
      ['rune', '...Ove.'],
      ['anita', 'Du är en god människa, Ove.'],
      ['ove', 'Säg inte det till någon.'],
    ],
    // Rune is dead: it is Anita they want to move.
    introWidow: [
      ['anita', 'Ove... mannen från kommunen var här igen. Han i den vita skjortan.'],
      ['ove', 'Vad ville han?'],
      ['anita', 'De vill flytta mig till ett boende. Nu när Rune är borta säger de att jag inte klarar mig själv.'],
      ['anita', 'Han tog med sig alla papper. Hela utredningen om mig. Han sitter i sin vita bil vid infarten och skriver.'],
      ['ove', 'Vid infarten. Jaså.'],
      ['anita', 'Ove, du ska väl inte göra något dumt?'],
      ['ove', 'Jag ska bara prata med honom.'],
    ],
    outroWidow: [
      ['anita', 'Ove? Är det där... mina papper?'],
      ['ove', 'De hade glömt en underskrift. Då gäller inte beslutet.'],
      ['anita', 'Så jag får bo kvar? I vårt hus?'],
      ['ove', 'Tills de har lärt sig läsa sina egna blanketter.'],
      ['anita', 'Du är en god människa, Ove.'],
      ['ove', 'Säg inte det till någon.'],
    ],
    // The Škoda sets off (radio); Anita phones; the radio during the chase; the talk at the wreck.
    getaway: ['vitskjorta', 'Nej, nej, nej. Inte nu, Ove.'],
    call: ['anita', 'Ove... var försiktig. Han är bara en tjänsteman.', 'Det är det som är problemet.'],
    chase: [['vitskjorta', 'Det här kommer att få konsekvenser, Ove!', 'radio'], ['ove', 'Det står ju på skylten. Trettio.', 'radio'], ['vitskjorta', 'Det här blir en tjänsteanteckning, Ove! I tre exemplar!', 'radio']],
    talk: [
      ['vitskjorta', 'Det här är en kommunal angelägenhet. Ni har ingen som helst rätt att...'],
      ['ove', 'Pärmen.'],
      ['vitskjorta', 'Den innehåller sekretessbelagda handlingar. Beslutet är fattat på goda grunder.'],
      ['ove', 'Beslutet saknar en underskrift. Sidan fyra. Jag läste det genom rutan.'],
      ['vitskjorta', '...Det här är inte över, Ove. Vi har papper på allt.'],
      ['ove', 'Det har jag också.'],
    ],
  },
  // ---------------------------------------------------------------------------------------------
  varkarna: {
    day: 7,
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
    outro: [
      ['ove', 'Hej, Sonja.'],
      ['ove', 'Vilken vecka det har varit. Grannarna, alltså. De kan ingenting.'],
      ['ove', 'Parvaneh fick en pojke. Han skriker som hon. Patrick svimmade.'],
      ['ove', 'Adrian har köpt en Saab. Rune bor kvar. Katten... katten får stanna. Tills vidare.'],  // (beat: his face)
      ['ove', 'Jag vet vad du skulle säga. Att jag behöver dem lika mycket som de behöver mig.'],
      ['ove', 'Hmpf.'],
      ['ove', 'Det är i ordning nu, Sonja. Området.'],   // (beat: the stone)
      ['ove', 'Jag kommer igen på söndag. Som vanligt.'],
    ],
    // Rune is dead (the same beats: line 3 his face, line 6 the stone).
    outroWidow: [
      ['ove', 'Hej, Sonja.'],
      ['ove', 'Vilken vecka det har varit. Grannarna, alltså. De kan ingenting.'],
      ['ove', 'Parvaneh fick en pojke. Han skriker som hon. Patrick svimmade.'],
      ['ove', 'Adrian har köpt en Saab. Rune är borta. Anita bor kvar. Katten... katten får stanna. Tills vidare.'],
      ['ove', 'Jag vet vad du skulle säga. Att jag behöver dem lika mycket som de behöver mig.'],
      ['ove', 'Hmpf.'],
      ['ove', 'Det är i ordning nu, Sonja. Området.'],
      ['ove', 'Jag kommer igen på söndag. Som vanligt.'],
    ],
    // Parvaneh gets in; the Škoda sets off and stops Ove (radio: one at random); the morning's
    // "INTE NU!" calls; the radio on the drive; she gets out at Akuten.
    hello: ['parvaneh', 'Kör, Ove! KÖR!'],
    chaserGo: ['vitskjorta', 'Ove! Stanna! Jag har en blankett som ni ska skriva under!'],
    chaserStop: [['vitskjorta', 'Ove! Bara en underskrift!'], ['vitskjorta', 'Stanna! Det här är en kommunal fråga!'], ['vitskjorta', 'Vi har papper på det här också!']],
    calls: [
      ['anita', 'Ove, elementet klickar igen...', 'INTE NU!'],
      ['sara', 'Ove! Får katten sova i min säng?', '...Ja. Men INTE NU!'],
      ['jimmy', 'Ove! Katten har ätit upp min macka!', 'INTE NU!'],
      ['adrian', 'Ove, Saaben låter konstigt när jag svänger vänster...', 'INTE NU!'],
      ['anders', 'Ove, styrelsen undrar om du kan titta på bommen vid...', 'INTE NU, ANDERS!'],
    ],
    drive: [['parvaneh', 'Andas, Ove! Nej, vänta, det är jag som ska andas!'], ['parvaneh', 'Varför kör han efter oss?!'], ['parvaneh', 'Om du blinkar en gång till föder jag i din Saab!']],
    bye: ['parvaneh', 'Gå nu, Ove. Det är söndag. Hälsa Sonja från mig.'],
    // The afternoon, on the way to the flowers: a bubble, Patrick from the maternity ward, and the
    // morning's calls again, answered this time.
    sunday: ['ove', 'Det är söndag.'],
    call: ['patrick', 'Ove! Det blev en pojke! Tre kilo fyrahundra! Han skriker precis som Parvaneh. Jag svimmade bara lite!', 'Hmpf. Grattis.'],
    callsBack: [
      ['anita', 'Ove? Rune sa ditt namn i dag. Två gånger. Jag ville bara att du skulle veta det.', 'Bra. Det är bra, Anita.'],
      ['adrian', 'Ove! Jag kollade under trösklarna. Ingen rost! Och jag prutade fyratusen!', 'Hmpf. Femtusen hade gått.'],
    ],
    callsBackWidow: [
      ['anita', 'Ove? Jag tände ett ljus för Rune i dag. Jag ville bara att du skulle veta det.', 'Bra. Det är bra, Anita.'],
      ['adrian', 'Ove! Jag kollade under trösklarna. Ingen rost! Och jag prutade fyratusen!', 'Hmpf. Femtusen hade gått.'],
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Avbrott (interruptions.js TEMPLATES, by id).

export const ERRANDS = {
  element: {
    who: 'anita',
    lines: ['Ove? Det är Anita. Förlåt att jag stör.', 'Det klickar i elementet hos oss igen. Rune blir så orolig av det.'],
    ove: 'Jaja. Jag kommer.',
    thanks: 'Tack, Ove. Du är snäll, vad du än säger.', fail: 'Det gör inget, Ove. Vi tar på oss en tröja till.',
    busy: 'Jaså, du är upptagen. Vi tar på oss en tröja till så länge.',
  },
  forskolan: {
    who: 'parvaneh',
    lines: ['Ove! Hej! Det är Parvaneh.', 'Kan du hämta Nasanin på förskolan? Jag hinner inte, och Patrick... ja. Du vet.'],
    ove: 'Vad har han gjort nu då?',
    hello: ['nasanin', 'Ove! Ove! Ove!'], bye: ['nasanin', 'Hej då, Ove!'],
    thanks: 'Tack, Ove! Du är bäst. Säg inte det till Patrick.', fail: 'Jag hämtade henne själv. Det gick bra. Typ.',
    busy: 'Du är upptagen? Okej, jag ringer Jimmy.',
  },
  mobilen: {
    who: 'jimmy',
    lines: ['Tjena Ove! Det är Jimmy. Jag ringer från Adrians telefon.', 'Jag har glömt min mobil på torget i centrum. Kan du kolla? Snälla?'],
    ove: 'Vem glömmer sin telefon på ett torg?',
    thanks: 'Ove, du är kung! Jag bjuder på en macka!', fail: 'Ingen fara, Ove. Jag köper en ny. Eller lånar.',
    busy: 'Lugnt, Ove. Jag hämtar den själv sen.',
  },
  punktering: {
    who: 'adrian',
    lines: ['Eh, Ove? Det är Adrian.', 'Jag har fått punktering på cykeln vid cykelförrådet. Jag vet inte hur man... lagar sånt.'],
    ove: 'Ingen kan någonting nu för tiden.',
    thanks: 'Tack, Ove! Du borde ha en egen kanal.', fail: 'Okej... jag går väl då.',
    busy: 'Okej... jag leder cykeln då.',
  },
  nyckeln: {
    who: 'patrick',
    lines: ['Hej Ove, det är Patrick. Jag har låst mig ute.', 'Parvaneh sa att du har en reservnyckel. Hon sa att du har reservnycklar till... allt.'],
    ove: 'Klart jag har.',
    thanks: 'Tack, Ove! Jag ska aldrig mer... ja. Tack.', fail: 'Det är lugnt, Ove. Jag klättrade in genom fönstret.',
    busy: 'Okej! Jag... väntar här. Det är inte så kallt.',
  },
  rune: {
    who: 'anita',
    lines: ['Ove... det är Anita. Rune är borta.', 'Han rullade iväg medan jag hängde tvätt. Han kan inte ha kommit långt.'],
    ove: 'Jag letar.',
    hello: ['rune', '...Ove?'],
    thanks: 'Tack, Ove. Jag vet inte vad vi skulle göra utan dig.', fail: 'Grannarna hittade honom vid busshållplatsen. Han frös.',
    busy: 'Jaså. Jag letar själv då. Han kan inte ha kommit långt.',
    dead: 'Ove? De har hittat Rune. Han är död, Ove. Han är död.',
  },
  skotta: {
    who: 'anita',
    lines: ['Ove, det är Anita igen. Förlåt.', 'Det har drivit igen framför dörren. Rune kommer inte ut med rullstolen.'],
    ove: 'Hmpf. Jag tar min egen snöskyffel.',
    thanks: 'Nu kommer han ut igen. Tack, Ove.', fail: 'Vi tar det i morgon, Ove.',
    busy: 'Det ordnar sig, Ove. Vi tar det i morgon.',
  },
  katten: {
    who: 'sara',
    lines: ['Ove! Det är Sara. Din katt har rymt!', 'Han sprang mot cykelförrådet! Du MÅSTE hitta honom!'],
    ove: 'Det är inte min katt.',
    thanks: 'Du hittade honom! Ove, du är världens bästa!', fail: 'Han hittade hem själv till slut. Men han var jättekall.',
    busy: 'Okej. Jag letar själv!',
  },
  skjuts: {
    who: 'jimmy',
    lines: ['Ove! Jimmy här. Bussen har gått.', 'Kan du skjutsa mig till centrum? Jag står vid busshållplatsen.'],
    ove: 'Det går en buss om tjugo minuter.',
    hello: ['jimmy', 'Tjena! Vilken service!'], bye: ['jimmy', 'Tack, Ove! Du är en klippa!'],
    thanks: 'Jag kom i tid! För första gången!', fail: 'Jag tog bussen till slut. Den var full.',
    busy: 'Lugnt. Jag tar nästa buss.',
  },
};
// An errand with no busy line of its own (every errand above has one).
export const ERRAND_BUSY = 'Jaså, du är upptagen. Det ordnar sig.';
// Ove answering the phone; Ove once an errand is done.
export const ANSWER = ['Ja?', 'Vad är det nu då?', 'Ove.', 'Ja, det är Ove.'];
export const DONE = ['Hmpf.', 'Det var ingenting.', 'Ingen kan någonting nu för tiden.', 'Jaja.'];

// ---------------------------------------------------------------------------------------------
// Small talk (main.js chatterFor). Nothing here thanks Ove for something that hasn't happened yet,
// mentions the cat before day 4 or says good morning at half past two (the day runs 10:30-14:30).

export const CHATTER = {
  parvaneh: [['Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket.', 'met'], 'Ove, du ser nästan glad ut i dag.', ['Patrick har klättrat upp på en stege igen. Titta inte.', 'eveningOfDay1'], ['Flickorna vill att du kommer på middag. Jag med.', 'met']],
  patrick: ['Hej Ove! Jag skulle bara... nej, det var inget.', ['Släpet står helt rakt. Jag har tagit en bild på det.', 'eveningOfDay1'], ['Jag är IT-konsult. Jag kan starta om saker. Det är ungefär allt.', 'met'], 'Har du en insexnyckel? Jag ska bara montera en garderob. Tror jag.'],
  sara: ['Ove! Kom och bygg snögubbe!', 'Varför är du alltid så arg?', 'Mamma säger att du är snäll inuti.', 'Pappa kan inte bygga snögubbar. De ramlar.'],
  nasanin: ['Ove! Ove! Ove!', 'Snögubbe!', 'Snö!', 'Ove, titta!'],
  jimmy: ['Tjena Ove! Har du ätit?', 'Ove! Mannen själv!', 'Jag kör nyttigt nu. Typ.', 'Fint väder, va?'],
  adrian: ['Ove, vad tycker du om Audi?', 'Jag ska köpa bil snart. Vad köper man?', 'Kan du lära mig byta däck någon gång?'],
  anita: ['Hej, Ove.', 'Rune sov dåligt i natt.', 'Klä dig varmt, Ove. Det är kallt i dag.', 'Han frågar efter dig ibland. På sitt sätt.'],
  rune: ['...', 'Hm.', '...Ove.', 'Volvo.'],
  anders: ['Ove! Har du sett min nya Audi?', 'Föreningen har nya regler, Ove. Jag mejlar.', 'Morsning, Ove. Fint väder för en promenad.', 'Vi borde ha en bom vid infarten, tycker du inte?'],
  vitskjorta: ['Vi har papper på allt.', 'Det här är en kommunal angelägenhet.', 'Ha en bra dag. Tills vidare.'],
};
// Before day 1's scene the family that moved in yesterday hasn't met Ove: no line names him or knows
// him (no dinner, no saffransris, no "IT-konsult" right before Patrick introduces himself); Patrick
// is still backing the trailer ("en kvart. Minst." sets up Ove's "Tjugo minuter. Jag har tagit tid.").
export const CHATTER_FIRST = {
  patrick: ['Jag har köpt en bok om att backa med släp. Den har bilder.', 'Vänster... nej. Höger. Eller?', 'Hur svårt kan det vara att backa ett släp?'],
  parvaneh: ['Hej! Vi har precis flyttat in.', 'Han har backat i en kvart nu. Minst.', 'Patrick, älskling. Andas.'],
  sara: ['Hej! Vi har flyttat hit!', 'Pappa kan inte backa.', 'Vem är du?'],
  nasanin: ['Hej!', 'Snö!', 'Släpet!'],
};
// Later in the week some of them have news: [missions done, lines, replace]. From then on those lines
// come 60 % of the time (with `replace`: always, the base lines are retired - Adrian has his Saab).
// Lines may carry a tag too, as above.
export const CHATTER_AFTER = {
  patrick: [2, ['Armen kliar under gipset. Hela tiden.', 'Parvaneh säger att jag inte får gå upp på stegar mer. Någonsin.', 'Tack för att du körde Parvaneh. Jag var... upptagen.']],
  parvaneh: [2, ['Första körlektionen på måndag, Ove! Jag har redan köpt en övningskörningsskylt.', 'Patrick försöker knyta skorna med en hand. Det är bättre än tv.', 'Tack för hjälpen med släpet. Igen.']],
  // ("i går" = day 3, Anita's radiators: said on day 4 only, not on the evening of day 3 or on day 5)
  anita: [3, ['Det är så varmt hos oss nu, Ove.', 'Rune sa ”Saab” igen i morse. Bara så där.', ['Tack för i går, Ove.', 'onDay4']]],
  sara: [4, ['Katten tycker om dig.', 'Får jag klappa katten?']],
  nasanin: [4, ['Katten!', 'Kissen!']],
  rune: [3, ['...Saab.']],
  jimmy: [4, ['Hur mår katten? Har den fått ett namn än?', 'Jag köpte kattmat. Jag köpte för mycket kattmat.']],
  adrian: [5, ['Saaben startade på första försöket i morse!', 'Jag har kollat trösklarna. Två gånger.', 'Jag bytte däck själv i går! Nästan.'], true],
  anders: [5, ['Audin var på service. Det var inget fel på den. Alls.', 'Två Saabar i föreningen nu. Fantastiskt.']],
  vitskjorta: [6, ['Vi ses, Ove. Vi har tid.', 'Underskriften är på väg. Den är på väg.']],
};
// When none of a neighbour's lines fit (never today: each has a line in CHATTER without a tag).
export const CHATTER_FALLBACK = 'Hej, Ove.';

// Ove's answer to small talk (main.js chat; features/implemented/smaprat.md): CHATTER_REPLY[who][line]
// = POOL of ANSWERs, one picked among those whose tag holds. ANSWER = text | [text, tag] |
// [text, tag | null, [LINE, ...]]: with LINEs the exchange goes on, in turn. '' = Ove says nothing
// (main.js: Rune gets a nod, Vita skjortan a shake of the head, Anita in her grief a nod). Every line
// in CHATTER, CHATTER_FIRST, CHATTER_AFTER and WIDOW.chatter has one (the smalltalk scenario checks),
// and some change with the days as Ove thaws (the tags count days done, as above).
export const CHATTER_REPLY = {
  parvaneh: {
    'Hej! Vi har precis flyttat in.': ['Det har jag sett.'],
    // (day 1's intro: "Tjugo minuter. Jag har tagit tid.")
    'Han har backat i en kvart nu. Minst.': ['Sjutton minuter.'],
    // (she is talking to Patrick)
    'Patrick, älskling. Andas.': [''],
    // (the first plays day 1's outro again)
    'Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket.': [
      ['Jag har mat.', null, [['parvaneh', 'Vad åt du i går då?'], ['ove', '...Mat.']]],
      ['Lådan står diskad på trappan.', 'before5'], ['...Ställ det på bänken.', 'after5']],
    'Ove, du ser nästan glad ut i dag.': ['Det gör jag inte.'],
    'Patrick har klättrat upp på en stege igen. Titta inte.': ['Är det min stege?'],
    'Flickorna vill att du kommer på middag. Jag med.': [['Jag äter klockan fem.', 'before5'], ['...Vad blir det?', 'after5']],
    'Första körlektionen på måndag, Ove! Jag har redan köpt en övningskörningsskylt.': ['Manuell växellåda. Inget fusk.'],
    'Patrick försöker knyta skorna med en hand. Det är bättre än tv.': ['Kardborreband.'],
    'Tack för hjälpen med släpet. Igen.': ['Hmpf. Ni är skyldiga mig en brevlåda.'],
  },
  patrick: {
    'Jag har köpt en bok om att backa med släp. Den har bilder.': ['Läs den.'],
    'Vänster... nej. Höger. Eller?': ['Vänster.'],
    'Hur svårt kan det vara att backa ett släp?': ['Tydligen väldigt svårt.'],
    // (the questioning "Jaha.", for once in its place)
    'Hej Ove! Jag skulle bara... nej, det var inget.': ['Jaha.'],
    'Släpet står helt rakt. Jag har tagit en bild på det.': ['Det står fyra centimeter snett.'],
    'Jag är IT-konsult. Jag kan starta om saker. Det är ungefär allt.': ['Det har jag märkt.'],
    'Har du en insexnyckel? Jag ska bara montera en garderob. Tror jag.': [['Vilken storlek?', null, [['patrick', 'Det finns... storlekar?']]]],
    'Armen kliar under gipset. Hela tiden.': ['Rör den inte.'],
    'Parvaneh säger att jag inte får gå upp på stegar mer. Någonsin.': ['Klok kvinna.'],
    'Tack för att du körde Parvaneh. Jag var... upptagen.': ['Du låg i snön.'],
  },
  sara: {
    'Hej! Vi har flyttat hit!': ['Jaså.'],
    'Pappa kan inte backa.': ['Nej.'],
    'Vem är du?': ['Ove.'],
    // (all week: no, later, at last a small one)
    'Ove! Kom och bygg snögubbe!': [['Nej.', 'before4'], ['Sen.', 'after4 before6'], ['...En liten då.', 'after6']],
    'Varför är du alltid så arg?': ['Jag är inte arg.'],
    'Mamma säger att du är snäll inuti.': ['Mamma pratar för mycket.'],
    'Pappa kan inte bygga snögubbar. De ramlar.': ['Ingen grund. Det är alltid grunden.'],
    'Katten tycker om dig.': ['Katten tycker om mat.'],
    'Får jag klappa katten?': ['Fråga katten.'],
  },
  nasanin: {
    'Hej!': ['Hej.'],
    'Snö!': ['Ja. Det är snö.'],
    'Släpet!': ['Det står snett.'],
    'Ove! Ove! Ove!': ['Ja?'],
    'Snögubbe!': ['Nej.'],
    'Ove, titta!': ['Jag tittar.'],
    'Katten!': ['Ja. Katten.'],
    'Kissen!': ['Den heter inte Kissen.'],
  },
  jimmy: {
    'Tjena Ove! Har du ätit?': ['Klockan tolv. Som vanligt.'],
    'Ove! Mannen själv!': ['Vem annars?'],
    'Jag kör nyttigt nu. Typ.': ['Typ.'],
    'Fint väder, va?': ['Nej.'],
    'Hur mår katten? Har den fått ett namn än?': ['Den heter Katten.'],
    'Jag köpte kattmat. Jag köpte för mycket kattmat.': ['Det märks. På katten.'],
  },
  adrian: {
    'Ove, vad tycker du om Audi?': ['Plast och elektronik.'],
    'Jag ska köpa bil snart. Vad köper man?': ['Saab.'],
    'Kan du lära mig byta däck någon gång?': ['Det får vi se.'],
    'Saaben startade på första försöket i morse!': ['Det är en Saab.'],
    'Jag har kollat trösklarna. Två gånger.': ['Kolla dem en gång till.'],
    'Jag bytte däck själv i går! Nästan.': ['Nästan är inte bytt.'],
  },
  anita: {
    'Hej, Ove.': ['Hej, Anita.'],
    // (until day 3 it sets up the radiators)
    'Rune sov dåligt i natt.': [['Det är för kallt hos er. Det är elementen.', 'before3'], ['Mm.', 'after3']],
    'Klä dig varmt, Ove. Det är kallt i dag.': ['Jag har jacka.'],
    'Han frågar efter dig ibland. På sitt sätt.': ['...Hälsa honom.'],
    // (day 3's outro: "Jag skriver det på en lapp åt er.")
    'Det är så varmt hos oss nu, Ove.': ['Har ni lappen kvar?'],
    'Rune sa ”Saab” igen i morse. Bara så där.': ['Han vet.'],
    'Tack för i går, Ove.': ['Det var ingenting.'],
    // her grief (WIDOW.chatter)
    'Det är så tyst hemma nu, Ove.': [''],
    'Jag dukade för två i morse. Av gammal vana.': ['Jag dukade för två i ett år. Efter Sonja.'],
    'Hans filt ligger kvar på stolen. Jag kan inte flytta den.': ['Låt den ligga.'],
    'Jag skulle inte ha hängt tvätt den dagen.': ['Det var inte ditt fel, Anita.'],
    'Han sa ditt namn ibland. Visste du det?': ['...Nej. Det visste jag inte.'],
  },
  rune: {
    '...': [''],
    'Hm.': ['Hm.'],
    '...Ove.': ['Rune.'],
    'Volvo.': ['Saab.'],
    // (day 3's outro)
    '...Saab.': ['Ja, Rune. Saab.'],
  },
  anders: {
    'Ove! Har du sett min nya Audi?': ['Nej.'],
    'Föreningen har nya regler, Ove. Jag mejlar.': ['Jag har ingen mejl.'],
    'Morsning, Ove. Fint väder för en promenad.': ['Det är ingen promenad. Det är en inspektion.'],
    'Vi borde ha en bom vid infarten, tycker du inte?': ['Det har jag sagt i tjugo år.'],
    'Audin var på service. Det var inget fel på den. Alls.': ['Säkert inte.'],
    'Två Saabar i föreningen nu. Fantastiskt.': ['Det är en början.'],
  },
  vitskjorta: {
    'Vi har papper på allt.': ['Jag också. I pärmar.'],
    'Det här är en kommunal angelägenhet.': ['Det här är föreningens mark.'],
    // (Ove looks at him and slowly shakes his head)
    'Ha en bra dag. Tills vidare.': [''],
    'Vi ses, Ove. Vi har tid.': ['Jag är pensionär. Jag har mer tid än ni.'],
    'Underskriften är på väg. Den är på väg.': ['Jag väntar.'],
  },
};
// The fourth time in a minute Ove is talked to by the same neighbour (they say nothing; he does).
export const CHATTER_ENOUGH = 'Nu har vi pratat.';
// Ove's answer to a line with none in CHATTER_REPLY (CHATTER_FALLBACK from anyone but Anita): OVE_REPLY
// without its rising, curious "Jaha.".
export const CHATTER_SPARE = ['Hmpf.', 'Mm.', 'Jaså.', 'Nej.', 'Det får vi se.'];

// ---------------------------------------------------------------------------------------------
// Ove's own reactions (main.js; OVE_START: patrol.js).

// His grunts (luftning.js and hoppbacke.js pick from it by position: keep the order). Small talk has its
// own answers now (CHATTER_REPLY).
export const OVE_REPLY = ['Hmpf.', 'Jaha.', 'Mm.', 'Jaså.', 'Nej.', 'Det får vi se.'];
// What Ove thinks of a car, by make (TYRE[c.kind]; Rune's own Volvo by its name). One opinion per make:
// there is no Japanese car in the area, and "Typiskt" is used enough elsewhere.
export const TYRE = {
  saab900: ['Bra däck.', 'Så ska en bil se ut.', 'Ordentligt.'],
  runeVolvo: ['Runes Volvo. Han kör den inte längre.', 'Volvo. Jaja.'],
  volvo240: ['Volvo. Jaja.', 'En 240. Den går i alla fall.'],
  volvo740: ['Volvo. Jaja.', 'För lite luft. Som vanligt.'],
  audi: ['Plast och elektronik.', 'Tyskt krafs.', 'Anders har en sån. Det säger väl allt.'],
  bmw: ['Plast och elektronik.', 'BMW. Hmpf.', 'Rune köpte en sån. Sen pratade vi inte på flera år.'],
  golf: ['Tyskt krafs.', 'Golf. Det är en sport, inte en bil.'],
  skoda: ['Tjeckiskt. Hmpf.', 'Sånt här kör de på kommunen.'],
  bus: ['Hmpf.'],
  default: ['Hmpf.', 'Sommardäck. I november.', 'För lite luft. Som vanligt.', 'Ingen kollar lufttrycket nu för tiden.'],
};
// What Ove says after a long slide in his car (car.drift, by make, else `default`) or a donut.
export const SLID = {
  saab900: ['Framhjulsdrift. Saaben vet vart den ska.'],
  volvo240: ['Volvo. Den kan inte ens köra rakt.'],
  volvo740: ['Volvo. Den kan inte ens köra rakt.'],
  default: ['Det där såg ingen.', 'Kommunen har inte sandat här.', 'Det var meningen.'],
  donut: ['Kollar bara mönsterdjupet.', 'Det där såg ingen.'],
};
// After a long flight off the hoppbacke (game/hoppbacke.js, feature snöhög): in his own Saab, landed
// well (Saab made aeroplanes first); in a car that isn't his. (Otherwise SLID, TYRE and OVE_REPLY.)
export const OVE_HOPP = { saab: 'Saab byggde flygplan först. Det märks.', notMine: 'Det är inte min bil.' };
// His garage door: what is in its way (a line each), shut and tugged (sometimes), a car into it.
export const GARAGE_DOOR = {
  saabInWay: 'Saaben står i vägen.',
  carInWay: 'Det står en bil i vägen.',
  inDoorway: 'Flytta på dig.',
  shut: ['Så.', 'Stängt.', 'Ordning och reda.'],
  hit: ['Porten!', 'Min garageport!', 'Den var stängd, Ove.'],
};
// Starting to write up a felparkering (on foot).
export const OVE_START = ['Det står ju på skylten.', 'Idioter.', 'Typiskt.', 'Ingen kan läsa nu för tiden.', 'Hmpf.', 'Jaså. Här ska vi stå, minsann.'];
// Waking up in his own bed after freezing to death out beyond the forest (game/waking.js,
// features/avgrunden.md): one of these, never the same twice running.
export const WAKE = [
  'Jag var nästan framme hos dig, Sonja. Men någon hade parkerat fel vid pärleporten.',
  'Sonja skickade hem mig igen. Utan mössa kommer du inte in här, sa hon.',
  'Bortom skogen tar världen slut. Det borde kommunen ha satt upp en skylt om.',
  'Inte ens att frysa ihjäl går att göra ordentligt nu för tiden.',
  'Sonja sa alltid att jag skulle ta halsduken. Fyrtio år, och hon har fortfarande rätt.',
];

// ---------------------------------------------------------------------------------------------
// People (main.js; PANIC: peds.js). Children and the neighbours are never knocked over.

// Knocked over by a car; getting up again.
// @voice ped ped_teen ped_old
export const OUCH = ['Aj!', 'Är du inte klok?!', 'Min höft!', 'Vad håller du på med?!', 'Jag ringer polisen!', 'Kör som folk!', 'Galning!', 'Hallå där!'];
// @voice ped ped_teen ped_old
export const GETUP = ['Jag ska anmäla dig.', 'Pensionärer i bil, alltså.', 'Min rygg...', 'Det här var inte okej.', 'Jag mår bra. Jag mår BRA.'];
// The driver of a car Ove "borrows" (a passer-by put out of the car).
// @voice ped ped_teen ped_old ped_kid
export const CARJACK = ['Hallå! Min bil!', 'Den där gubben tog min bil!', 'Polis! Polis!', 'Men snälla! Jag ska till jobbet!'];
// A passer-by in the way of Ove's kick; a neighbour in the way of it.
// @voice ped ped_kid ped_teen ped_old
export const KICKED = ['Hallå!', 'Vad gör du?', 'Akta dig!', 'Ove!'];
// @voice cast
export const KICKED_NEIGHBOUR = ['Ove!', 'Vad håller du på med?', 'Aj, Ove!'];
// Shoved aside by Ove's car (children and the neighbours are never knocked over; Rune says nothing).
// @voice ped ped_teen ped_old patrick parvaneh jimmy adrian anita anders vitskjorta
export const SHOVED = ['Akta!', 'Hallå!', 'Ove! Titta dig för!', 'Är du inte klok, Ove?!', 'Kör som folk, Ove!'];
// @voice ped_kid sara nasanin
export const SHOVED_KID = ['Aj!', 'Akta!', 'Ove!', 'Hallå!'];
// Stepping smartly out of a speeding car's way.
// @voice ped ped_kid ped_teen ped_old
export const PANIC = ['Oj!', 'Se upp!', 'Hallå!', 'Sakta ner!', 'Men herregud!', 'Kör som folk!'];

// ---------------------------------------------------------------------------------------------
// The patrol (patrol.js).

// A smitare driving off; a caught one pulling over.
// @voice driver
export const FLEE_LINES = ['Hej då, gubbe!', 'Skriv vad du vill!', 'Ha det, farbror!', 'Jag ska bara...!'];
// @voice driver
export const CAUGHT_LINES = ['Okej, okej! Jag flyttar den!', 'Förlåt! Jag skulle bara handla!', 'Det var bara fem minuter!', 'Snälla, inte en lapp till...'];
// caught: Ove, after a caught smitare (on foot); kaos / reda: the radio after the meter's KAOS I
// OMRÅDET / ORDNING OCH REDA; carFree: Anders, as Ove drives in the car-free area.
export const PATROL = {
  caught: ['ove', 'Det står ju på skylten.'],
  kaos: ['anders', 'Extra föreningsmöte i kväll, Ove. Klockan sju. Ordningen i området är under all kritik.'],
  reda: ['anita', 'Det är så lugnt i området i dag, Ove. Rune sover som en stock.'],
  carFree: ['anders', 'Ove! Det är förbjudet att köra bil inom området!'],
};

// ---------------------------------------------------------------------------------------------
// The horn (horn.js). Neighbours' lists take WHEN lines like CHATTER.

// Someone who leapt out of the car's way, turned round to face it.
// @voice ped
export const HONK_SCARED = ['Jösses!', 'Men herregud!', 'Jag går ju här!', 'Jag fick nästan hjärtstopp!', 'Vad tutar du för?!', 'Hallå, jag har också rätt att vara här!'];
// ...when the car is the one off the street: on a pavement, a path or a lawn (or in the car-free area)
// @voice ped ped_teen ped_old
export const HONK_SIDEWALK = ['Det här är en trottoar!', 'Kör på gatan!'];
// @voice ped ped_teen ped_old
export const HONK_CARFREE = ['Det är bilfritt här!'];
// An old one (Ove is 59: a youngster to them).
// @voice ped_old
export const HONK_OLD = ['Ungdomen nu för tiden!', 'Jag har gått här sedan 1962!', 'Mitt hjärta!', 'Jag är inte döv!'];
// @voice ped_teen
export const HONK_TEEN = ['Okej, boomer.', 'Lugna dig, gubbe!', 'Chilla!'];
// Children love a horn.
// @voice ped_kid
export const HONK_KID = ['Igen!', 'Tuta igen!', 'Tut tut!', 'Häftigt!'];
// Anyone else who heard it close by.
// @voice ped
export const HONK_HEARD = ['Lugna ner dig!', 'Det är en bostadsgata!', 'Ja, ja, vi hör dig!', 'Vad är det som brinner?'];
// A driver honking back (the bubble is on their car): by make, else `default` (+ `ahead` for the one
// in front going Ove's way); `blocked`: one that sat honking behind Ove and got honked at for it.
// @voice driver
export const HONK_BACK = {
  default: ['Lugna dig, farbror!', 'Själv då!', 'Vad är problemet?', 'Pensionärer!'],
  ahead: ['Kör om då!'],
  blocked: ['Flytta på dig då!', 'Det är du som står i vägen!'],
  bus: ['Bussen har företräde!', 'Jag har en tidtabell!'],
  taxi: ['Jag har en körning!'],
  garbage: ['Vi jobbar här!'],
};
// Another Saab's driver, greeting.
// @voice driver
export const SAAB_GREET = ['Tjena, Saab!'];
// A smitare honked at in the chase.
// @voice driver
export const HONK_SMITARE = ['Sluta tuta!', 'Jag hör dig, jag hör dig!', 'Lägg av med tutan!'];
// From a window (a long honk among houses, or too much honking).
// @voice window
export const HONK_WINDOW = ['Tyst därute!', 'Folk sover!', 'Vi har ett spädbarn här!', 'Lägg av med tutandet!'];
// Anders, on needless honking (trafikförordningen: the horn is for averting danger).
export const ANDERS_LAW = ['Ove! Ljudsignal får bara användas för att avvärja fara!', 'Onödig tutning, Ove! Det tar jag upp på årsmötet!'];
export const HONK_NEIGHBOUR = {
  // (before day 1's scene the family hasn't met Ove; after day 7 Parvaneh has had her boy)
  parvaneh: [['Ove! Jag är gravid, inte döv!', 'met before7'], ['Ove! Pojken sover!', 'after7'], ['Hallå! Vi har precis flyttat in!', 'notMet']],
  patrick: ['Oj! Förlåt! Står jag i vägen?', 'Jag flyttar på mig! Jag flyttar på mig!', ['Akta armen, Ove!', 'after2']],
  sara: [['Tuta igen, Ove!', 'met'], 'Igen! Igen!'],
  nasanin: ['Tut tut!', 'Igen!'],
  jimmy: ['Tjena Ove! Tut tut!', 'Ove! Mannen! Tutar på mig!'],
  adrian: ['Fet tuta, Ove!', 'Är det originaltutan?', ['Min Saab har exakt samma tuta!', 'after5']],
  anita: ['Ove, Rune sover.', 'Inte så högt, Ove.'],
  anders: ['Ove! Det är en bostadsgata!', 'Jag tar upp det på årsmötet, Ove!'],
  vitskjorta: ['Det där noteras.', 'Vi har en blankett för sådant.'],
};
// Rune knows a car by its horn (the one Ove honks with); Anita, beside him, explains.
export const RUNE_HORN = { saab900: '...Saab.', volvo240: '...Volvo.', volvo740: '...Volvo.', bmw: '...BMW.', default: '...Hm.' };
export const ANITA_RUNE = 'Han känner igen tutan, Ove.';
// Ove's passengers (Rune: RUNE_HORN); HONK_PASSENGER_ANY for one with no list (none today).
export const HONK_PASSENGER = {
  parvaneh: ['Ove! Inte i mitt öra!', 'Måste du, Ove?'],
  patrick: ['Oj! Jag hoppade till.'],
  sara: ['Igen!'],
  nasanin: ['Tut tut!'],
  anita: ['Ove, Rune blir rädd.'],
  jimmy: ['Tuta igen, Ove!'],
  adrian: ['Får jag också tuta?'],
  anders: ['Onödig tutning, Ove.'],
  vitskjorta: ['Det där noteras.'],
};
export const HONK_PASSENGER_ANY = ['Ove!'];
// What Ove thinks (by what he honked at; `back`: a driver honked back; `law`, `window`: answering
// a complaint about needless honking; `duet`: after a shave-and-a-haircut was answered).
export const OVE_HONK = {
  walker: ['Trottoaren. Den finns där av en anledning.', 'Det är en gata. För bilar.', 'Gå på trottoaren!'],
  car: ['Blinkers! Har du hört talas om blinkers?', 'Körkort på internet, va?', 'Gasen sitter till höger.'],
  audi: ['Tyskt krafs.'],
  golf: ['Tyskt krafs.'],
  bmw: ['BMW. Hmpf.'],
  volvo240: ['Volvoförare.'],
  volvo740: ['Volvoförare.'],
  skoda: ['Kommunen. Typiskt.'],
  saab: ['Saab-folk. Vi hälsar.'],
  none: ['Tutan fungerar.', 'Kontrollerar tutan.'],
  back: ['Själv då.', 'Lär dig köra.'],
  kids: ['Tutan är ingen leksak.'],
  law: ['Det var fara.'],
  window: ['Det var för att avvärja fara.'],
  cat: ['Förlåt, katten.'],
  smitare: ['Stanna!', 'Stanna, sa jag!'],
  empty: ['Ingen hemma. Typiskt.'],
  duet: ['Hmpf.'],
};

// ---------------------------------------------------------------------------------------------
// Rune's fate (game/rune.js, features/implemented/roligare_runeuppdrag.md): he can die on the errand
// "Rune har rullat iväg", and if Ove gives it up then, he stays dead for the rest of the game.

// Ove, as it happens (a bubble by the body).
export const RUNE_DIES = ['ove', 'Rune?'];
// Anita from then on: her small talk (instead of CHATTER and CHATTER_AFTER), what she says through her
// tears as Ove goes by (now and then), a honk at her, and the radio after ORDNING OCH REDA (PATROL.reda).
export const WIDOW = {
  chatter: ['Det är så tyst hemma nu, Ove.', 'Jag dukade för två i morse. Av gammal vana.', 'Hans filt ligger kvar på stolen. Jag kan inte flytta den.', 'Jag skulle inte ha hängt tvätt den dagen.', 'Han sa ditt namn ibland. Visste du det?'],
  sobs: ['Rune...', 'Förlåt, Ove. Det går över.', 'Varför, Rune? Varför?', '...'],
  honk: ['Inte nu, Ove. Snälla.', 'Ove... låt bli.'],
  reda: ['anita', 'Det är så lugnt i området i dag, Ove. Rune hade tyckt om det.'],
};

// ---------------------------------------------------------------------------------------------
// Stages (stages.js), in any mission or errand.

// Someone waiting for Ove's car, called out by its horn (a pickup stage's who: in allLines 'cast').
// @voice parvaneh adrian nasanin jimmy
export const COMING = ['Jag kommer!', 'Ja, ja, jag kommer!', 'En sekund bara!'];
// The cat comes to Ove (catchCat).
export const CAT_COMES = ['ove', 'Kiss, kiss... Hmpf.'];
// A chaser (goto's) that has stopped Ove three times gives up: its driver's default giveUpLine
// (the only chaser is Vita skjortan's Škoda on day 7).
export const CHASER_GAVE_UP = ['vitskjorta', 'Jag skickar ett brev, Ove! Rekommenderat!'];

// ---------------------------------------------------------------------------------------------

// The story's days: 7 (missions.js MISSIONS.length, one STORY entry each).
const DAYS = 7;
// The day it is: the evening after day n is still day n (m.index days done, m.gateOpen = the next
// day has dawned).
const storyDay = (m) => Math.max(1, m.index + (m.gateOpen && m.index < DAYS ? 1 : 0));
const TAG_N = /^(onDay|after|before)(\d+)$/;

// May a WHEN line be said now? m: the MissionRunner (m.index days done, m.gateOpen).
export function whenOk(tag, m) {
  if (tag.includes(' ')) return tag.split(' ').every((t) => whenOk(t, m));
  if (tag === 'met') return m.index >= 1;                         // the new neighbours know Ove (day 1's scene)
  if (tag === 'notMet') return !(m.index >= 1);
  if (tag === 'eveningOfDay1') return m.index === 1 && !m.gateOpen;  // Patrick still climbs ladders
  const k = TAG_N.exec(tag);
  if (!k) throw new Error(`script.js: unknown tag '${tag}'`);
  const n = +k[2];
  return k[1] === 'onDay' ? storyDay(m) === n : k[1] === 'after' ? m.index >= n : m.index < n;
}

// Every voiced line: [[who, text, part], ...], deduplicated on who + text (see the top).
export function allLines() {
  const out = [], seen = new Set();
  const add = (who, text, part) => { const k = who + '\u0000' + text; if (!seen.has(k)) { seen.add(k); out.push([who, text, part]); } };
  const pool = (who, list, part) => { for (const t of list) add(who, t, part); };
  // (a WHEN line's tag is checked here, so a typo fails the voice tool, not a chat in the game)
  const text = (l) => { if (typeof l === 'string') return l; whenOk(l[1], { index: 0, gateOpen: true }); return l[0]; };
  const byWho = (o, part) => { for (const who in o) pool(who, o[who].map(text), part); };
  for (const d of Object.values(STORY).sort((a, b) => a.day - b.day)) {
    const part = 'day' + d.day;
    for (const key in d) {
      if (key === 'day') continue;
      const v = d[key];
      for (const l of Array.isArray(v[0]) ? v : [v]) {
        add(l[0], l[1], part);
        if (key.startsWith('call')) add('ove', l[2], part);
      }
    }
  }
  byWho(CHATTER_FIRST, 'chatterFirst');
  byWho(CHATTER, 'chatter');
  for (const who in CHATTER) if (!CHATTER[who].some((l) => typeof l === 'string')) add(who, CHATTER_FALLBACK, 'chatter');
  for (const who in CHATTER_AFTER) pool(who, CHATTER_AFTER[who][1].map(text), 'chatterAfter');
  for (const e of Object.values(ERRANDS)) {
    pool(e.who, e.lines, 'errands');
    add('ove', e.ove, 'errands');
    for (const l of [e.hello, e.bye]) if (l) add(l[0], l[1], 'errands');
    pool(e.who, [e.thanks, e.fail, e.busy || ERRAND_BUSY, ...(e.dead ? [e.dead] : [])], 'errands');
  }
  pool('ove', [...ANSWER, ...DONE], 'calls');
  pool('ove', [...OVE_REPLY, ...Object.values(TYRE).flat(), ...Object.values(SLID).flat(), ...Object.values(OVE_HOPP), ...Object.values(GARAGE_DOOR).flat(), ...OVE_START], 'reactions');
  pool('ove', WAKE, 'waking');
  pool('driver', [...FLEE_LINES, ...CAUGHT_LINES], 'patrol');
  for (const l of Object.values(PATROL)) add(l[0], l[1], 'patrol');
  pool('ped', [...OUCH, ...GETUP, ...CARJACK, ...KICKED], 'peds');
  pool('cast', KICKED_NEIGHBOUR, 'peds');
  pool('ped', SHOVED, 'peds');
  pool('ped_kid', SHOVED_KID, 'peds');
  pool('ped', PANIC, 'peds');
  pool('ped', [...HONK_SCARED, ...HONK_SIDEWALK, ...HONK_CARFREE], 'horn');
  pool('ped_old', HONK_OLD, 'horn');
  pool('ped_teen', HONK_TEEN, 'horn');
  pool('ped_kid', HONK_KID, 'horn');
  pool('ped', HONK_HEARD, 'horn');
  pool('driver', [...Object.values(HONK_BACK).flat(), ...SAAB_GREET, ...HONK_SMITARE], 'horn');
  pool('window', HONK_WINDOW, 'horn');
  pool('anders', ANDERS_LAW, 'horn');
  byWho(HONK_NEIGHBOUR, 'horn');
  pool('rune', Object.values(RUNE_HORN), 'horn');
  add('anita', ANITA_RUNE, 'horn');
  byWho(HONK_PASSENGER, 'horn');
  // (a neighbour riding with Ove who has no list of their own; Rune has RUNE_HORN)
  for (const who in CHATTER) if (who !== 'rune' && !HONK_PASSENGER[who]) pool(who, HONK_PASSENGER_ANY, 'horn');
  pool('ove', Object.values(OVE_HONK).flat(), 'horn');
  pool('cast', COMING, 'stages');
  for (const l of [CAT_COMES, CHASER_GAVE_UP]) add(l[0], l[1], 'stages');
  add(RUNE_DIES[0], RUNE_DIES[1], 'widow');
  pool('anita', [...WIDOW.chatter, ...WIDOW.sobs, ...WIDOW.honk], 'widow');
  add(WIDOW.reda[0], WIDOW.reda[1], 'widow');
  // (last: a reply that is already said elsewhere keeps its part)
  for (const who in CHATTER_REPLY) {
    for (const answers of Object.values(CHATTER_REPLY[who])) {
      for (const a of answers) {
        const [t, tag, then] = typeof a === 'string' ? [a] : a;
        if (tag) whenOk(tag, { index: 0, gateOpen: true });
        if (t) add('ove', t, 'chatterReply');
        for (const l of then || []) add(l[0], l[1], 'chatterReply');
      }
    }
  }
  add('ove', CHATTER_ENOUGH, 'chatterReply');
  pool('ove', CHATTER_SPARE, 'chatterReply');
  return out;
}
