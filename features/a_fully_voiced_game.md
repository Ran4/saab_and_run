# Förslag: ett fullt röstsatt spel (och riktig musik)

> **Status: förslag.** Inget av detta är byggt. Implementera inte förrän utvecklaren säger till.
> Skrivet 2026-10-11. Uppgifterna om ElevenLabs (modeller, priser, gränser) kommer från deras
> dokumentation den dagen och ändras ofta. Kolla dem igen innan vi bygger. Det som inte gick att
> bekräfta är markerat *(overifierat)*.

## Kortversion

- **Rösterna:** alla repliker blir riktigt tal, ungefär 330 unika och 11 500 tecken. Talet
  genereras i förväg med ElevenLabs (`eleven_v4`, svenska) och checkas in som små Opus-filer.
  Spelet anropar aldrig API:t, och API-nyckeln hamnar aldrig i koden.
- **Rollerna:** varje roll får en egen röst med rätt ålder och dialekt: Ove västgöte, Rune
  göteborgare, Anita norrländska och så vidare. Rösterna tas fram med Voice Design, och du väljer
  dem på en provlyssningssida.
- **Regenerering:** `make voice` plockar ut replikerna ur koden och genererar bara det som saknas
  eller har ändrats. Varje tagning kontrolleras med taligenkänning innan den används. Ändrar man en
  replik låter just den som i dag (mummel) tills `make voice` körs igen.
- **Läppsynk:** den är billig. Käkbenet finns redan och flaxar i dag efter en sinus
  (`src/actors/models.js:3725`). Sinusen byts mot ljudets volymkurva, och munnen stängs på m, b
  och p. Ungefär 40 rader.
- **Musik:** Eleven Music genererar ett tiotal stycken: tema, patrull, ärenden, jakt, dag 5-racet,
  dag 7-jakten, minnen av Sonja och final. En liten musikregissör i `audio.js` tonar mellan dem.
  Dagens genererade piano blir reserv.
- **Kostnad och storlek:** några hundralappar totalt. Ungefär 10 MB röster och 25 MB musik.
- **Största osäkerheterna:** dels hur bra svenska *dialekter* blir, dels barnrösterna
  (ElevenLabs regler). Båda testas i en spik (steg 0) innan något byggs på riktigt.

## 1. Läget i dag

- **Dialogrutan:** `hud.runDialog` (`src/game/hud.js:638`) skriver ut texten i 50 tecken/s och
  spelar ett `audio.talk(pitch)`-mummel per ord (`hud.js:669`). Raden är klar när texten är
  utskriven. Sedan trycker spelaren vidare, eller så går testläget vidare själv.
- **Fem andra ställen där folk pratar:**
  - pratbubblor, `game.say` (`src/main.js:906`)
  - radio- och porträtt-toasts, `game.radio` (`main.js:909`)
  - rop, `game.shout` (`main.js:916`)
  - telefonsamtalen i `interruptions.js`, tidsatta med `lineSecs = 1.3 + 0.045 · tecken`
    (`interruptions.js:125`)
  - grannarnas småprat (`main.js:1286`)
- **All text är statisk.** Ingen replik byggs med variabler (belopp, namn, registreringsnummer),
  så allt går att spela in i förväg.
- **Replikerna finns i tre former:**
  - `['vem', 'text']`-tupler i `missions.js`
  - fält i objekt som har ett `who`: `lines`, `ove`, `thanks`, `fail`, `hello`, `bye`, `goLine`
    och så vidare, i `interruptions.js` och `stages.js`
  - delade tabeller som vem som helst kan säga: `OUCH`, `GETUP`, `CARJACK`, `KICKED`, `SHOVED`,
    `SHOVED_KID` och `CHATTER`/`CHATTER_AFTER`/`TYRE` i `main.js`, `PANIC` i `peds.js`,
    `FLEE_LINES`/`CAUGHT_LINES` i `patrol.js`
- **Statisterna** har ålder och kön (`randomPed`, `src/actors/models.js:3114`), och det räcker för
  att välja en röst som passar. Smitarna pratar via sin bil (`g.say(car, …)`), så bilens förare
  behöver också en röst.
- **Mängden:** ungefär 330 unika repliker och 11 500 tecken, i snitt 35 tecken per replik. Ove har
  flest, ungefär 75 egna plus reaktioner. De delade tabellerna (cirka 44 repliker) ska sägas med
  flera olika röster.
- **Musiken** är ett generativt piano med en stråkmatta i a-moll, 64 bpm (`src/audio.js:852`). Den
  har ett enda humör och duckas till hälften under jakt och samtal (`main.js:1936`). Jinglarna är
  syntetiserade.
- **Ljudfiler:** projektet har inga än. Allt ljud syntetiseras.

## 2. Röstmotorn: ElevenLabs

- **Modell:** `eleven_v4` är deras nyaste flaggskepp. Den stöder svenska och audio tags som
  `[sighs]` och `[whispers]`. Vi jämför med `eleven_v3`, eftersom ElevenLabs själva skriver att
  röster från Voice Design kan bli "mindre performativa" i v4. Spiken provar båda modellerna för
  varje roll, och `cast.json` får välja modell per roll. Alla anrop skickar `language_code: 'sv'`
  så att talet inte glider över i engelska.
- **Samtal genereras som samtal.** Dialogerna i `intro`, `outro` och `retryIntro` skickas till Text
  to Dialogue (`/v1/text-to-dialogue/with-timestamps`). Gränsen är 10 röster och 2 000 tecken, och
  alla våra samtal ryms. Då får replikerna naturlig turtagning och reagerar på det som just sades.
  Svaret har `voice_segments` med `dialogue_input_index`, så vi klipper upp det i en fil per
  replik. `runDialog` spelar ändå rad för rad.
- **Enstaka repliker** (bubblor, samtal, reaktioner) görs med vanlig TTS
  (`/v1/text-to-speech/{voice}/with-timestamps`). Finns det sammanhang skickas `previous_text` och
  `next_text` med.
- **Tidsstämplar per tecken** följer med i båda anropen. De används till tre saker: att skriva ut
  texten i takt med talet, till läppsynken och till att klippa upp samtalen.
- **Uttal:**
  - En uttalsordlista (`tools/voice/lexicon.pls`, alias-regler) tar namn och ord som modellen kan
    snubbla på: Parvaneh, Nasanin, Škoda, Saab, Sonja.
  - En replik kan dessutom ha en egen `tts`-text som skiljer sig från textningen, till exempel
    "kr" → "kronor" eller "Hmpf." → `[grunts] Hmpf.`.
- **API-nyckeln:**
  - Skripten läser den från `ELEVENLABS_API_KEY`, eller från en git-ignorerad `.env` i spelmappen.
    Lägg in den själv där, inte i chatten.
  - Den används bara av verktygen under `tools/`. Spelet i webbläsaren rör aldrig API:t.
  - `.env` och `.cache/` läggs till i `.gitignore`.
- **Plan:** Creator räcker. Den har 30 egna röster, och röster som sparas från Voice Library räknas
  inte mot den gränsen. WAV i 44,1 kHz kräver Pro. På Creator hämtar vi `mp3_44100_192` och kodar
  om, och skillnaden hörs inte i ett spel.

## 3. Rollbesättningen: dialekt och ålder

### 3.1 Förslag per roll

Tanken: Saab mot Volvo blir Trollhättan mot Göteborg. De andra rollerna sprids över landet, så att
man hör vem som pratar utan att titta.

| Roll | Ålder | Dialekt (förslag) | Rösten |
|---|---|---|---|
| Ove | 59 | lätt västgötska (Trollhättan, Saabs hemstad) | låg, lite grusig, korthuggen och torr, nästan ingen melodi; varje ord kostar pengar |
| Rune | 70-tal | göteborgska (Volvomannen) | svag, hes och långsam, mest enstaka ord ("...Saab.") |
| Anita | 70-tal | mild norrländska | mjuk och varm, lite darr, ursäktande |
| Parvaneh | 30-tal, gravid | flytande svenska med lätt persisk brytning | snabb, varm och bestämd, retsam, skrattar lätt |
| Patrick | 30-tal | stockholmska | mjuk och nervös, överartig, avbryter sig själv |
| Jimmy | 25 | skånska | glad och rund, avslappnad, ljus |
| Adrian | 19 | A: ung stockholmska, eller B: lätt multietnisk ungdomsmelodi | lite osäker och mumlig, ivrig när det gäller bilar |
| Anders | 40-tal | Östermalms-/Danderydsstockholmska | slipad och självgod, säljartrevlig |
| Vita skjortan | 40–50 | rikssvenska, "myndighetssvenska" | platt, korrekt, artig och kall |
| Sara | 7 | neutral, uppvuxen här | barn, se 3.4 |
| Nasanin | 3 | – | litet barn, enstaka ord, se 3.4 |

Parvanehs brytning ska vara lätt och ge värme, aldrig bli en karikatyr. Hur tydlig den ska vara
avgör du på provlyssningssidan.

### 3.2 Så tas rösterna fram

- Varje roll har en beskrivning för Voice Design i `tools/voice/cast.json`. Den är skriven på
  engelska, precis som ElevenLabs egna exempel. Deras guide säger:
  - Börja med språket och den regionala varianten i första meningen.
  - Ange åldern konkret ("late 50s", "mid-70s").
  - "Thick" fungerar bättre än "strong" för en tydlig brytning.
  - Undvik vaga ord som "foreign" och effektord som "phone" och "reverb".
  - Höj `guidance scale` när dialekten är viktigare än ljudkvaliteten.
- Voice Design ger tre kandidater per körning. `make voice-cast WHO=ove ROUNDS=3` ger alltså nio
  kandidater. Till dem kommer en sökning i Voice Library (`language=sv`, kön, ålder). Röster därifrån
  tar inga platser.
- Provtexten är tre eller fyra av rollens egna repliker som täcker röstens omfång. För Ove till
  exempel "Idioter.", "Det står ju på skylten." och något längre ur ett samtal.
- Du lyssnar och väljer på provlyssningssidan (4.4). Valet sparas som en röst, och dess `voice_id`
  skrivs in i `cast.json`.
- **Ingen kloning av verkliga personer**, och särskilt inte av skådespelarna i filmen. Rösterna ska
  passa rollerna, inte imitera någon.

Ett exempel på en post i `cast.json`:

```json
"ove": {
  "design": "A Swedish man in his late 50s from Västergötland in western Sweden, speaking Swedish with a light västgötska accent. Low, slightly gravelly voice; terse and clipped, dry and unimpressed, very little melody, as if every word costs money. Natural, close conversational recording.",
  "sample": ["Idioter.", "Det står ju på skylten.", "Det är förbjudet att köra bil inom området."],
  "model": "eleven_v4",
  "voice_id": null,
  "settings": { "stability": 0.5, "similarity": 0.75, "style": 0.2 }
}
```

### 3.3 Statisterna

- Statisterna delar en pool på ungefär 14 röster:
  - kvinnor och män i tre åldrar (ung, medel, äldre), två röster i varje grupp
  - två tonåringar
  - barn om det går (3.4)
- Dialekterna blandas. Några röster har en annan svensk brytning, till exempel finsk, arabisk,
  polsk eller bosnisk, för så låter en svensk förort.
- Rösterna hämtas i första hand från Voice Library (de tar inga platser). Det som saknas fylls i med
  Voice Design.
- En statist får sin röst ur sitt eget slumpfrö, så samma person har alltid samma röst. En smitare
  pratar med förarens röst.
- Bara de kombinationer som kan förekomma genereras. Tabellerna i koden får en kommentar om vem som
  kan säga dem, till exempel `// @voice ped-adult cast` ovanför `OUCH` och `// @voice ped-kid`
  ovanför `SHOVED_KID`.

### 3.4 Barnen (Sara 7, Nasanin 3 och barnstatisterna)

ElevenLabs tillåter inte barnröster eller röster som låter som barn i Voice Library. Det gäller även
vuxna röster som härmar barn. Dokumentationen säger inte om Voice Design ändå skapar en barnröst för
eget bruk *(overifierat)*. Därför finns tre vägar:

- **a) Voice Design, om det tillåts.** Spiken provar det först.
- **b) Riktiga inspelningar** av barn, med vårdnadshavares godkännande. Det är ungefär 25 korta
  repliker, en kvart med en telefon i ett tyst rum, och samma efterbehandling som allt annat.
  Det blir ofta mest levande.
- **c) Mummel som i dag, plus fniss.** Nasanins repliker är ändå ett till tre ord ("Ove! Ove!
  Ove!", "Snö!", "Katten!").

Mitt förslag är att pröva a i spiken. Går det inte blir det b om det finns barnröster att spela in,
annars c.

## 4. Manus och regenerering

### 4.1 Filerna

| Fil | Incheckad | Innehåll |
|---|---|---|
| `tools/voice/cast.json` | ja | rollbesättningen: beskrivning, `voice_id`, modell och inställningar per roll och poolröst |
| `tools/voice/script.json` | ja | manuset: varje replik med vem, text och eventuellt `tts`, `tags`, scen, vald tagning, `locked` |
| `tools/voice/lexicon.pls` | ja | uttalsordlistan |
| `.cache/voice/` | nej | alla tagningar, röstprover och taligenkänningsresultat. Att byta tagning kostar inget nytt anrop |
| `assets/voice/<vem>/<id>.webm` | ja | de färdiga klippen |
| `assets/voice/index.json` | ja | manifestet som spelet läser |

### 4.2 Nyckeln är vem + text

- Spelet räknar ut `id = fnv1a(vem + '|' + text)` i base36. Verktygen använder samma funktion.
- Ingen behöver hålla id:n i koden. Ändrar man en replik får den ett nytt id och låter som i dag
  tills `make voice` har körts.
- Manifestet sparar vilken röst, modell och inställning som gjorde varje fil. Byter man röst på en
  roll blir rollens filer inaktuella och genereras om.

### 4.3 Stegen i `make voice`

1. **`extract.mjs`** går igenom `src/` med en AST-parser (acorn som dev-beroende). Den hittar
   replikerna i de tre formerna från avsnitt 1 och i strängar som skickas direkt till `say`, `radio`,
   `shout` och `radioOnly`. Sedan uppdaterar den `script.json`:
   - nya repliker läggs till
   - repliker som har försvunnit markeras `orphan`
   - det du har skrivit för hand finns kvar

   Den flaggar också repliker som behöver en människa:
   - bara skiljetecken (Runes "..." blir en suck eller ingenting)
   - versaler ("NEJ." blir ett rop)
   - interjektioner ("Hmpf.", "Mm.", "Aj!")
   - förkortningar och siffror
2. **`generate.mjs`** tar alla repliker vars fil saknas eller är inaktuell:
   - Varje replik får `TAKES` tagningar (standard 3), med olika `seed`.
   - Samtalen går via Text to Dialogue, allt annat via vanlig TTS.
   - Alla råa tagningar sparas i `.cache/voice/`.
3. **Kvalitetskontroll:** Scribe v2 (ElevenLabs taligenkänning, svenska) skriver ut varje tagning,
   och utskriften jämförs tecken för tecken med repliken. En tagning underkänns om den:
   - hoppar över eller lägger till ord
   - glider över i engelska
   - har en orimlig längd (tecken per sekund jämfört med rollens normala tempo)

   Den bästa godkända tagningen väljs automatiskt. Repliker där ingen tagning klarar sig hamnar
   på granskningslistan.
4. **`finish.mjs`** (ffmpeg):
   - klipper bort tystnad (60 ms får vara kvar)
   - normaliserar ljudstyrkan enligt EBU R128 (alla roller lika starka, runt −20 LUFS; rop får
     vara starkare)
   - kodar till mono-Opus 48 kbps i `.webm`
   - räknar ut läppkurvan (avsnitt 6)
   - skriver `index.json`: `{ id: { f, d, t, lip } }`, där `f` är filen, `d` längden, `t`
     starttiden för varje tecken (för utskriften) och `lip` läppkurvan
5. **`check.mjs`** gör inga anrop. Den listar repliker utan ljud, föräldralösa filer och inaktuella
   filer, och avslutas med felkod om något är fel. Därför kan den köras bland testerna.

```sh
make voice                   # extrahera, generera det som saknas eller är inaktuellt, efterbehandla, kontrollera
make voice DRY=1             # visa vad som skulle genereras och ungefär vad det kostar, utan anrop
make voice WHO=ove DAY=3     # begränsa till en roll och/eller en dag; FORCE=1 gör om även det som finns
make voice-cast WHO=anita    # nya röstkandidater för en roll
make voice-review            # provlyssningssidan, skriver ut adressen
make voice-check             # bara kontrollen
```

### 4.4 Provlyssningssidan

`tools/voice/review.mjs` är en liten Node-server på en egen port. Den skriver dina val direkt till
`cast.json` och `script.json`.

- **Rollbesättning:** alla kandidater för en roll sida vid sida. Du väljer en.
- **Repliker per dag och scen:** spela upp ett helt samtal i följd och lyssna på varje tagning.
  - Du kan markera en tagning med en stjärna.
  - "Gör om" tar en regianvisning, som sparas som `tags` eller `tts` i manuset. Nästa
    `make voice` genererar bara de replikerna.
  - Med `locked` blir en bra tagning aldrig omgjord av misstag.

## 5. Uppspelningen i spelet

### 5.1 En ny modul, `src/voice.js`

```js
voice.has(who, text)                   // finns det ett klipp?
voice.prefetch(lines)                  // [[who, text], ...]: ladda och avkoda i förväg
voice.play(who, text, { mode, at })    // -> { dur, ended (Promise), mouth(), stop() } eller null
voice.secs(who, text, fallback)        // klippets längd i sekunder, annars fallback
voice.voiceFor(ch)                     // rollnyckel, statistens poolröst eller förarens röst
```

Får anroparen `null` gör den som i dag och mumlar. Samma sak när rösterna är avstängda.

### 5.2 Ljudkedjan (i `audio.js`)

- **Egen buss:** rösterna får en egen `voiceBus` till master, bredvid `sfx` och musiken, med en egen
  nivå i inställningarna.
- **Duckning:** medan någon pratar sänks musiken ungefär 8 dB och motorn ungefär 4 dB. Sänkningen
  tar 0,1 s och återgången 0,6 s. Det ersätter en del av dagens fasta `duckMusic`.
- **Lägen:**
  - `dialog`: torrt och centrerat, med lite av det befintliga rummet.
  - `phone`, för `hud.phone` och samtalen: bandpass 300–3 400 Hz och lätt mättnad, så att det
    låter som en lur. Det passar Televerket-telefonen. Oves eget svar hörs torrt.
  - `world`, för bubblor, rop och småprat: en `PannerNode` där den som pratar står, och svagare
    ljud på avstånd. Rop låter starkare och med mer rum.
  - `car`: när Ove sitter i bilen dämpas röster utanför med lågpass. Passagerare, som Parvaneh dag 2,
    hörs en aning till höger.
- **Tonhöjd och tempo** ändras aldrig.

### 5.3 Ändringar per anropsställe

- **`runDialog`:**
  - Hela samtalet förladdas när dialogen börjar.
  - Texten skrivs ut tecken för tecken efter tidsstämplarna, så textningen följer talet.
  - Raden är klar när klippet är slut.
  - Första trycket på hoppa-knappen visar hela texten medan rösten pratar vidare. Andra trycket går
    vidare, och rösten tonas ut på 80 ms.
  - `autoDialog` väntar tills klippet är slut plus 0,4 s.
- **`say` och bubblorna:** en bubbla visas i `max(secs, klippets längd + 0,4 s)`. Den som pratar
  får `talk`-tillståndet så länge klippet spelar, och då rör sig käken.
- **`radio`, `shout` och samtalen:** `lineSecs(text)` blir `voice.secs(who, text, lineSecs(text))`.
  Då väntar samtalsskripten i `interruptions.js` in rösten av sig själva.
- **Småpratet** (`main.js:1286`): Ove svarar när grannen har pratat färdigt, inte efter fasta 2 s.
- **Paus:** pausmenyn pausar rösterna. En dold flik stänger redan av hela AudioContexten.

### 5.4 Inställningar, laddning och tester

- **Inställningar:** "Röster: på/av" plus nivå, sparat i `saab-and-run-settings` (`voice`).
  Avstängt betyder dagens mummel. Textningen syns alltid.
- **Laddning:**
  - `index.json` laddas vid start. Den är liten.
  - Dagens samtal förladdas när uppdraget erbjuds.
  - Reaktionerna för statisterna i närheten laddas när de behövs.
  - Allt som allt är det ungefär 10 MB, och aldrig allt på en gång.
- **Tester:**
  - `?test=1` stänger av rösterna, så testerna går lika fort som i dag. `&voice` slår på dem.
  - Ett nytt scenario, `voice`, spelar dag 1:s intro med röst och kontrollerar tre saker: att varje
    rad väntar in sitt klipp, att käken rör sig medan någon pratar och stängs på m/b/p, och att
    inga filer saknas.
  - `story` med `&voice` samlar repliker som sägs utan klipp och räknar dem som fel. Det fångar det
    som den statiska extraheringen missar.

## 6. Läppsynk

- **Det som redan finns:** ett käkben som den nedre delen av ansiktet är viktad mot. Det sätts varje
  bildruta i `models.js:3725`. När någon pratar flaxar det efter en sinus, vid rop står det på 0.16
  och annars på 0.004.
- **I förväg (`finish.mjs`):**
  - Volymen (RMS) mäts var 33:e ms och görs om till dB och sedan till ett värde mellan 0 och 1.
    Munnen öppnas snabbt och stängs på ungefär 80 ms.
  - På m, b och p, enligt tidsstämplarna, sätts värdet till 0, och läpparna sluts. Det är billigt
    och syns mer än man tror.
  - Kurvan sparas som en kort sträng med ett tecken per bildruta och 64 nivåer. Det blir ungefär
    75 byte för en replik på 2,5 s.
- **I spelet:**
  - `mouth()` på röstens handtag läser värdet där uppspelningen är just nu.
  - Karaktären får `st.mouth`, och käkraden blir
    `st.mouth != null ? 0.01 + 0.07 * st.mouth : (dagens sinus)`.
  - Den största öppningen justeras så att DESIGN.md:s "mouths barely move" fortfarande gäller.
- **Omfång:** ungefär 40 rader. Munnen kan bara öppnas och stängas, eftersom läpparna saknar
  blendshapes. Mer behövs inte med den här realismen och de här kameraavstånden. Ser det dåligt ut
  hoppar vi över det, och sinusen finns kvar.

## 7. Musik

### 7.1 Mål

Musiken ska vara komponerad men ha samma stämning som i dag: svensk vintermelankoli, återhållsam,
med piano och stråkar i botten. Den ska aldrig låta som "spelmusik". Dagens generativa piano blir
reserv (inga filer, eller medan musiken laddas) och kan finnas kvar som ett val i inställningarna.

### 7.2 Styckena

| Stycke | När | Längd | Stil (idé till prompten) |
|---|---|---|---|
| `tema` | titeln; finalen i full version | 90 s + 2–3 min | nordisk melankolisk melodi på solopiano, stråkar som kommer in |
| `patrull-kall` ×2 | fri patrull dag 1–3 | 2–3 min styck | glest filtpiano, celesta, mjuka stråkar, mycket luft |
| `patrull-varm` ×2 | fri patrull dag 4–7 | 2–3 min styck | samma instrument men varmare, en cellomelodi, lite fylligare: Ove tinar |
| `vardag` | ärenden och samtal | loop 60–90 s | lätt och torrt komisk: pizzicato, klarinett och fagott, vispar |
| `jakt` | jakt på smitare | loop 60–90 s | återhållsam spänning: gående kontrabas, vispar, pizzicato-ostinato, ~108 bpm |
| `sjukhuset` | dag 2, körningen | ~90 s | brådskande men komiskt, snabba stråkar |
| `racet` | dag 5, Saab mot Audi | ~2 min | svensk rock med synt från 80-talet, drivande trummor: en blinkning till Saab-åren |
| `vita-skjortan` | dag 7, jakten | ~2 min | cello-ostinato, låga stråkar, pukor; allvarligt men inte episkt |
| `sonja` | fotona och graven | 30–60 s | solopiano eller nyckelharpa, svensk folkton i 60-talsjazz (beskrivet i ord, aldrig med artistnamn) |
| stingers ×4 | start, klart, misslyckat, rekord | 3–5 s | samma tonart och instrument som patrullen, eller dagens syntjinglar |

Musiken följer berättelsen: dag 1–3 är kalla och glesa, dag 4–7 varmare, och finalen spelar hela
temat.

### 7.3 Uppspelningen

- **Nytt API:** `audio.music(state)` med tillstånden `title`, `roam`, `errand`, `pursuit`,
  `mission:<id>`, `memory` och `finale`. `main.js` sätter tillståndet på samma ställe där duckningen
  räknas ut i dag (`main.js:1936`).
- **Byten och loopar:**
  - Mellan tillstånden tonas det över på 2–3 s med jämn effekt.
  - `roam` är en spellista: ett stycke, 5–15 s tystnad och sedan nästa. Det blir mindre tjatigt än
    en ändlös loop och passar stämningen.
  - Korta tillstånd (`errand`, `pursuit`) loopar.
- **Looparna bakas i förväg.** Ett stycke genereras med en kompositionsplan där sista delen
  återvänder till början. Sedan tonar `finish` över slutet in i början (ffmpeg `acrossfade`), och
  `AudioBufferSourceNode.loop` spelar utan skarv. Looppunkterna står i `index.json`.
- **Under tal** duckas musiken av rösterna (5.2).
- **Senare:** ElevenLabs ska ha en endpoint för stem-separation *(overifierat, källan är
  tredjepartsdokumentation)*. Med den kan patrullmusiken delas i lager (piano, stråkar, slagverk)
  som läggs till när Ordning sjunker eller det blir kaos. Det behövs inte i första versionen.

### 7.4 Skript

- **Konfiguration:** `tools/music/cues.json` (incheckad) har per stycke en prompt eller
  kompositionsplan, längd, modell (`music_v2_5`), `force_instrumental`, `seed` och antal varianter.
- **Kommandon:**
  - `make music` genererar varianterna för de stycken som saknas (standard 4) till `.cache/music/`.
  - `make music-review` öppnar samma provlyssningssida, där du väljer variant.
- **Efterbehandling:** `finish` normaliserar ljudstyrkan (musiken lägre än rösterna, runt
  −24 LUFS), bakar looparna och kodar till stereo-Opus 128 kbps. Ut kommer
  `assets/music/<stycke>.webm` och `assets/music/index.json`.
- **Ett gemensamt tema:** Eleven Music kan inte lova samma melodi i två separata genereringar.
  Spiken provar två vägar:
  - v2:s `conditioning_ref` och `source_from` refererar till en befintlig låt och kan ge varianter
    av temat *(overifierat hur bra det fungerar)*
  - styckena delar instrument och tonart men inte melodi, vilket fungerar för stämningsmusik
- **Prompterna** innehåller inga artistnamn och inga hänvisningar till filmens musik. Stilen
  beskrivs i ord.
- **Licens:** Eleven Music får användas kommersiellt på betalplanerna (Starter och uppåt). Film,
  TV och spel från stora studior kräver Enterprise. Ett gratis fanspel är inget problem, men
  villkoren behöver läsas om spelet någonsin säljs.

## 8. Kostnad och storlek (grovt)

| Vad | Mängd | Kostnad (API-listpris) |
|---|---|---|
| repliker, en hel omgång | ~850 klipp (330 repliker plus statistvarianter), ~20 000 tecken | – |
| med 3 tagningar | ~60 000 tecken | ~5 $ (v4, 0,08 $ per 1 000 tecken) |
| röstdesign | ~30 röster × ~5 omgångar × ~150 tecken | ~2 $ |
| kvalitetskontroll (Scribe v2) | ~1,5 h tal | ~0,35 $ |
| musik | ~12 stycken × 2,5 min × 4 varianter ≈ 120 min | ~18 $ (0,15 $/min) |

- **Prenumeration:** på en plan dras allt från krediterna, och det ryms gott i en månad på Creator.
  Att göra om några ändrade repliker kostar ören.
- **Storlek:** rösterna blir ungefär 10 MB och musiken ungefär 25 MB. `assets/` är 24 MB i dag.

## 9. Byggordning

0. **Spik**, ingen spelkod, ungefär en halv dag:
   - Ove, Anita, Jimmy, Parvaneh och Rune i sina dialekter, i både v4 och v3. Håller dialekten?
     Håller åldern?
   - Försöka göra Saras röst (regeln i 3.4).
   - Dag 1:s intro genom Text to Dialogue, uppklippt per replik.
   - Scribe på svenska.
   - Ett musikstycke med loop och en stinger.

   Du lyssnar och säger ja eller nej per del, och bekräftar rollbesättningen.
1. Extraheringen, `script.json` och kontrollen. Inga anrop.
2. Rollbesättningen och provlyssningssidan, som ger `cast.json`.
3. Generering, kvalitetskontroll och efterbehandling, som ger `assets/voice/`.
4. `voice.js`, ljudkedjan, anropsställena, inställningarna och testscenariot.
5. Läppsynken.
6. Musiken: styckena, provlyssning och musikregissören.

Varje steg kan landa för sig, och spelet fungerar hela tiden. Mummel och syntmusik finns kvar som
reserv.

## 10. Öppna frågor

1. Vilken ElevenLabs-plan har du? Creator räcker. Pro ger WAV i 44,1 kHz och fler röster.
2. Barnen: AI om det går, egna inspelningar eller mummel?
3. Stämmer dialekterna i 3.1 med hur du hör rollerna? Särskilt hur tydlig Parvanehs brytning ska
   vara, och om Adrian ska vara A eller B.
4. Får replikerna skrivas om en aning så att de bär dialekten? Till exempel Anitas "Rune sov dåligt
   i natt" → "Rune sov int' bra i natt". Annars sitter dialekten bara i uttalet.
5. Ska ljudfilerna checkas in? Mitt förslag: ja för de färdiga. Råa tagningar stannar i `.cache/`.
6. Ska Ove läsa upp de toasts som i dag bara är text, som "Tom krok. Rune lånade elementnyckeln
   1998 …"? Mitt förslag: nej, toasts förblir text.
7. Ska musiken ersätta det genererade pianot helt, eller ska man kunna välja i inställningarna?

## Källor

- [ElevenLabs: modeller](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs: Text to Speech med tidsstämplar](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [ElevenLabs: Text to Dialogue med tidsstämplar](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps)
- [ElevenLabs: Voice Design](https://elevenlabs.io/docs/product-guides/voices/voice-design)
- [ElevenLabs: barnröster i Voice Library](https://elevenlabs.io/docs/help-center/product/voices/voice-library/can-childrens-or-child-like-voices-be-added-to-the-voice-library)
- [ElevenLabs: Music compose](https://elevenlabs.io/docs/api-reference/music/compose)
- [ElevenLabs: Music API, licens](https://elevenlabs.io/sv/music-api)
- [ElevenLabs: API-priser](https://elevenlabs.io/pricing/api)
- [ElevenLabs: röstplatser per plan](https://help.elevenlabs.io/hc/en-us/articles/24351056337937-How-many-voice-slots-do-I-get-per-tier-and-how-can-I-increase-it)
- [Stem-separation (tredjepartsdokumentation)](https://mintlify.wiki/elevenlabs/elevenlabs-python/api-reference/audio/music)
