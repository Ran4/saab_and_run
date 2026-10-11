# Ett fullt röstsatt spel (och riktig musik)

> **Status: första versionen är byggd (2026-10-11).** Ove pratar i hela spelet, Patrick och Parvaneh
> till och med dag 1, och allt runt omkring är byggt: manuset i `src/game/script.js`, verktyget,
> provlyssningssidan, turordningen, ljudkedjan, läppsynken och musiken. Vad som faktiskt gjordes,
> vilka röster som valdes och varför, vad det kostade och vad som avviker från förslaget står i
> "Det här gjordes" nedan. **Resten av replikerna gjordes samma dag** (alla roller utom barnen, och
> en pool av tolv röster för statisterna): se
> `features/implemented/resten_av_replikerna_for_a_fully_voiced_game.md`.
>
> Efter det avsnittet följer förslaget som det skrevs (före bygget), med korta noteringar
> **(Blev: …)** där det blev annorlunda.

## Det här gjordes (2026-10-11)

Första versionen är byggd. Rösterna:

- **Ove** har röst i hela spelet.
- **Patrick och Parvaneh** har röst till och med dag 1.
- **Sara och Nasanin** mumlar och fnissar.
- **Alla andra** mumlar som förut, men tar nu sin tur i kön (de väntar in varandra).

Resten är byggt fullt ut:

- manuset i `src/game/script.js`
- verktyget och provlyssningssidan
- turordningen
- ljudkedjan
- läppsynken
- musiken och musikregissören

Spelet anropar aldrig API:t. Med rösterna avstängda, och i testläget utan `&voice`, beter det sig
som förut.

### Kontot och röstplatserna (11.1)

- **Alla 10 platser för egna röster är upptagna** (Seinfeld-spelet). Ett försök att spara en
  designad röst gav `voice_limit_reached (10 / 10)`.
- **Utvecklarens beslut:** ingen uppgradering, inga borttagna röster och inga nya designade
  röster. Bara färdiga röster: premade och Voice Library.
- **Voice Library tar ingen plats.**
  - En röst därifrån kan användas direkt i API:t. Den läggs till på kontot vid första anropet.
  - Den tar ingen egen röstplats: kontot har nu 10 egna röster plus 16 tillagda från Voice
    Library (3 fanns där sedan tidigare), och de egna är fortfarande 10 av 10.
  - Även Voice Library-röster som ursprungligen gjorts med Voice Design (Setareh, Niloofar) läggs
    till utan plats, som kopior med `is_owner: false`.
  - Alla röster som provlyssnades ligger kvar på kontot. Inga togs bort.
- **Premade-rösterna används inte.** Alla 21 är engelska röster, och på svenska skulle de få
  engelsk brytning. Voice Library har 61 röster med svenska som modersmål och dialektetiketter
  (standard, Stockholm, Göteborg, Skåne, Norrland), så rollerna togs därifrån.
- **Voice Design** hann provas två gånger innan beslutet:
  - en provkörning för Ove, med tre kandidater som aldrig sparades (de gick inte att spara)
  - ett försök med Sara, som API:t vägrade (se Barnen nedan)

  Inget av det används. `make voice-cast DESIGN=1` finns kvar i verktyget, men kräver en ledig
  plats för att en designad röst ska kunna väljas.

### Rollbesättningen

Kandidaterna valdes på Voice Library-etiketterna: modersmål svenska, kön, ålder, dialekt och
avgift 1× (några röster tar 2–3 gånger så mycket per tecken). Varje kandidat läste en provtext av
rollens egna repliker med `eleven_v4`, cirka 215 tecken. Provet mättes på tre sätt:

- vad taligenkänningen hörde
- tonhöjd med Praat: median och spann
- tempo i tecken per sekund

Jag kan inte lyssna, så valen bygger på mätvärdena och beskrivningarna. Alla prov ligger på
provlyssningssidan (`make voice-review`), och där byter man röst med ett klick. Det enda
utvecklaren behöver göra är att lyssna.

| Roll | Röst (Voice Library) | Etikett | Varför | Andra kandidater på sidan |
|---|---|---|---|---|
| **Ove** | Brage – Nordic Storyteller (`nEJYXtiAMFuP7hh9yoi4`) | man, medelålder, norrländsk | den djupaste och långsammaste: 127 Hz (92–201) och 11,9 tecken/s på provet, 110 Hz på korta repliker. "Mörk, jordnära, lite väderbiten, återhållsam". Närmast "låg, lite grusig, korthuggen" | Robert (skånsk, äldre), JJ (skånsk, 45–60), Ola Paulakoski (värmländsk), Andreas (skådespelare, standard), Mathias (göteborgsk; 175 Hz, för ljus för Ove) |
| **Patrick** | Filip – Energetic and expressive (`ISDDl0xPNLMD73L5PQj4`) | man, ung, standard | störst tonhöjdsspann (119–337 Hz), vilket passar en nervös man som avbryter sig själv. Taligenkänningen hörde provet helt rätt | Tobias (småländsk, snabb, ljus), Andreas – Natural (göteborgsk) |
| **Parvaneh** | Setareh – Expressive Tehrani Creator (`8Ebkg5uUcbSbeqGucAoR`) | kvinna, persiska som modersmål | en verklig persisk röst som talar svenska ger en äkta brytning, inte en härmad. Snabbast (13,7 tecken/s) och "uttrycksfull, nyfiken" stämmer med "snabb, varm, bestämd, retsam". Taligenkänningen hörde provet helt rätt | Niloofar (persiska), Noushin/"Sahar" (persisk brytning, varmare och lägre), Sanna Hartfield – Sassy (Stockholm, ingen brytning) |
| **Sara, Nasanin** | ingen: mummel och fniss | | se Barnen | |

- **Dialekterna (11.4):** Voice Library har ingen äldre man på västgötska. Ove fick den röst som
  bäst passar ålder och klang, och den är norrländsk.
  - Vill man hellre ha dialekten än klangen är Ola Paulakoski (värmländska, grannlandskapet)
    eller Mathias (göteborgska) ett klick bort på sidan.
  - Patrick har rikssvenska i stället för stockholmska.
  - Parvanehs brytning kommer från rösten själv. Hur tydlig den är har ingen hört än: jämför med
    Niloofar och Noushin på sidan.
- **Dialektomskrivningar (11.5): inga.** Oves röst är inte västgötsk, så västgötska ord hade
  krockat med uttalet, och Parvanehs brytning sitter i rösten. Undertexten och talet är samma text
  överallt.
- **Barnen (11.3):** Voice Design vägrar ("blocked_generation: … safety guidelines", HTTP 403) att
  ens göra en 7-årings röst, och Voice Library tar inte barnröster. Sara och Nasanin blev därför väg
  c: mummel som förut, och ett syntetiskt fniss efter ungefär varannan replik (`audio.giggle`).
  Deras sex repliker i småpratet före dag 1 står som `"mumble": true` i `cast.json`, så
  `make voice-check` räknar dem inte som saknade.

### Vad som röstsattes

Räknat med `allLines()`:

- **Manuset:** 490 repliker och 15 116 tecken. Det är fler än förslagets 354, eftersom featurerna
  oppna_garaget, roligare_bilkorning och tuta_med_bilen lade till repliker, och delade rader nu
  räknas en gång per talare.
- **Inom omfånget:** 173 repliker och 4 639 tecken. 167 av dem har klipp, och 6 är barnens
  (mummel).

| Roll | Klipp | Tecken | Tal | Tempo |
|---|---|---|---|---|
| Ove (alla delar: dag 1–7, ärenden, samtal, reaktioner, tutan, garaget, sladdarna) | 149 | 3 704 | 5,4 min | 11,2 tecken/s |
| Patrick (dag 1 och småpratet före) | 10 | 512 | 0,7 min | 12,0 tecken/s |
| Parvaneh (dag 1 och småpratet före) | 8 | 361 | 0,5 min | 12,6 tecken/s |
| **summa** | **167** | **4 577** | **6,6 min** | |

- **Ljudet:** klippen är mono-mp3 i 64 kbps och 44,1 kHz, −20 LUFS (uppmätt −21,0 till −19,0),
  med en limiter vid −1,5 dBTP. `assets/voice/` är 3,3 MB.
- **Oves tystnad** ("..." dag 4, när katten får stanna) är en suck, `tts: "[sighs] ..."` i
  `lines.json`. `eleven_v4` läser audio tags: taligenkänningen hörde inga ord i den.
- **Text to Dialogue** användes inte. Jag kan inte höra om det låter bättre, och en replik per
  anrop låter en ändrad replik göras om ensam. Varje replik är vanlig TTS med tidsstämplar.
- **Uttalsordlistan** (`tools/voice/lexicon.pls`) byter "Škoda" mot "Skoda" i det som skickas. Den
  rör ingen replik i första versionen. Namnen (Parvaneh, Ove, Patrick, Sonja) hördes rätt utan den.

### Kvalitetskontrollen

- **Lokal taligenkänning i stället för Scribe:** Scribe kostar 330 credits per minut, alltså
  ungefär 2 200 för första versionen. I stället körs KBLab:s svenska `kb-whisper-small` lokalt
  (faster-whisper på CPU, gratis) via `tools/voice/analyze.py`, som också mäter tonhöjden med
  Praat.
- **Normaliseringen** behandlar följande som samma ord, så att det inte blir falska underkännanden:
  - "Jaja" och "Ja, ja"
  - "i går" och "igår"
  - "Patrik" och "Patrick"
  - "5 000" och "femtusen"
- **Underkännanden:** 7 tagningar underkändes och gjordes om automatiskt. 5 klarade sig på första
  omtagningen. Två fick göras om en gång till, och sedan behölls den tagning taligenkänningen
  gillade bäst: "Jaja. Jag kommer." och "Kiss, kiss... Hmpf.". Omtagningarna står i
  `tools/voice/lines.json`.
- **Granskningslistan:** 155 av 167 tagningar godkändes direkt. 12 ligger på listan, och för
  nästan alla beror det på att taligenkänningen inte skriver ut grymtningar:
  - 6 med "Hmpf"
  - Oves suck
  - de korta "Ja?", "Ove.", "Mm." och "Så."
  - "IT-konsult", som hördes som "i tekonsult"

### Musiken

Eleven Music kostar 900 credits per minut på abonnemanget, inte 0,15 dollar per minut som
förslaget räknade med (det priset gäller deras API-fakturering i dollar). API:t rapporterar ingen
kostnad. Förslagets plan, cirka 120 minuter med fyra varianter, hade kostat cirka 108 000 credits.
Musiken fick därför högst 300 sekunder och **en tagning per stycke, inga varianter**: ungefär
4 500 credits.

| Stycke | Längd | Loop | När |
|---|---|---|---|
| `tema` | 53 s | nej | titelskärmen (första tangenten eller klicket startar ljudet), dag 7 vid graven och sista outrot |
| `patrull-kall` | 59 s | nej | fri patrull dag 1–3, i en spellista |
| `patrull-varm` | 60 s | nej | fri patrull dag 4–7, i en spellista |
| `vardag` | 26 s | ja | ärenden och samtal, och dagarnas uppdrag |
| `jakt` | 24 s | ja | jakt på en smitare, och dag 2:s körning till sjukhuset mot klockan |
| `racet` | 22 s | ja | dag 5, Saab mot Audi |
| `vita-skjortan` | 27 s | ja | dag 6:s jakt och dag 7:s Škoda |
| `klart` | 5 s | nej | (stinger från spiken; inte inkopplad, syntjinglarna finns kvar) |

- **Styckenas storlek:** stereo-mp3 i 128 kbps, −24 LUFS. `assets/music/` är 4,3 MB.
- **Det gemensamma temat:** de båda patrullstyckena gjordes med `conditioning_ref` på temat, och
  API:t tog emot det. Om de verkligen delar dess melodi går bara att höra.
- **Looparna** bakas med en övertoning slut → början och har explicita looppunkter i
  `assets/music/index.json`. Mätt korrelation över skarven: 0,985–1,0. Tre loop-tagningar slutade
  med ett slutackord trots regin; deras slut klipptes bort före bakningen.
- **Spellistan för patrullen:** stycket, 8–15 s tystnad, det genererade pianot 70–120 s, 5–10 s
  tystnad, sedan stycket igen. Pianot är alltså både reserv och en del av spellistan, vilket svarar
  på fråga 11.8: båda, inget val i inställningarna. Saknas ett stycke, eller laddas det inte, spelar
  pianot.
- **Fler stycken:** `sjukhuset` och `sonja` gjordes inte. Det som saknas görs med
  `make music`, efter att `maxSeconds` i `tools/music/cues.json` har höjts.

### Kostnad (uppmätt där API:t rapporterar den)

| Vad | Credits |
|---|---|
| spik: v4-priset, ett Voice Library-test, stabilitets- och audio tag-prov | ~90 |
| provlyssning: 13 kandidater × ~215 tecken | 368 |
| pilot (9 repliker) | 75 |
| första versionen (158 repliker till) | 532 |
| automatiska omtagningar (9) | 25 |
| **röster, summa** | **~1 090** |
| Voice Design: en provkörning för Ove och ett nekat försök för Sara | rapporteras inte (högst ~240) |
| musik: 300 s | ~4 500 (900/min, rapporteras inte) |
| **totalt** | **~5 600–5 850** |

- `eleven_v4` kostade **0,13–0,14 credits per tecken** i dag, med rabatten som går ut 12 oktober.
  Priset därefter är inte uppmätt.
- Totalen ligger under taket på 7 000. Nyckeln saknar `user_read`, så saldot kan inte läsas, och
  kontots sida har exakta siffror.

### Spelet

- **Manuset:** `src/game/script.js` är en ren datafil med 490 repliker, 15 116 tecken och 13
  `del`-värden (`day1`–`day7`, `chatterFirst`, `chatter`, `chatterAfter`, `errands`, `calls`,
  `reactions`, `horn`, `patrol`, `peds`, `stages`). Villkoren i småpratet är taggar (`whenOk`).
  Flytten ändrade ingen text: varje literal som lämnade koden finns i script.js, och tabellerna
  byggda från gammal och ny källkod jämfördes värde för värde, 239 kontroller utan skillnad.
- **`src/voice.js`:** kön, de två platserna, mummel med gissade längder, läppkurvan, uppspelningen
  (de 24 senaste klippen avkodade) och klipp som inte går att ladda (de mumlas). API:t står överst i
  filen och i CLAUDE.md.
- **Var rösterna kopplas in:**
  - **Dialogrutan:** texten skrivs ut i takt med talet. Första trycket visar hela texten, det andra
    går vidare.
  - **Bubblor:** en bubbla står kvar tills rösten har sagt repliken.
  - **Radio och rop:** toasten kommer när repliken sägs och står kvar så länge den sägs.
  - **Telefonsamtalen:** tiderna kommer från klippen, och samtalet väntar in varje replik.
  - **Småpratet:** Ove svarar när grannen har sagt sitt. Ingen pratar i munnen på någon, och ingen
    pratar inom 6 m från den som har dagens uppdrag.
  - **Etappernas radio, also()-repliker och samtal:** klockorna går bara när det är tyst.
  - **Outrot** väntar tills det är tyst.
  - **Ett ärendes tack och fail-repliker** stryks aldrig (`must`).
- **Ljudkedjan (`audio.js`):**
  - Rösterna har en egen buss.
  - Under tal sänks musiken 8 dB och motorn 4 dB.
  - Det finns fyra lägen:
    - `dialog`: torrt
    - `phone`: 300–3 400 Hz och lätt mättnad
    - `car`: passagerare lite till höger
    - `world` och `shout`: `PannerNode` där personen står. Ett rop långt bort hörs som högst 22 m
      bort, åt rätt håll, och inne i bilen är det dämpat med lågpass.
  - **Pausmenyn** pausar rösterna.
- **Läppsynken:** käken följer klippets volymkurva (30 bilder/s, 64 nivåer) och sluts på m, b och
  p. Utan klipp flaxar den efter mumlet.
- **Inställningarna:** "Röster" (på/av) och "Röstvolym" (100/70/40 %) i pausmenyn, sparade som
  `voice` och `voiceLevel`.
- **Testerna:** se nedan. Alla headless-verktyg startar nu Chrome med `--mute-audio`. Det saknades
  förut, så ljud kunde i princip höras i högtalarna.

### Tester

Alla körningar var headless, på egen port och med Chrome tystat (`--mute-audio`).

- **`story`, rösterna av (som i alla vanliga tester):** slutar med `#7 idle stage 7`, `hud watch: 2838
  samples, 0 leaks` och `no errors`.
- **Regression, rösterna av:** `m1 retry interrupt errands patrol horn smalltalk companion garage`
  ger `no errors`. Alla nio ärenden är ok, och garaget klarar alla sina kontroller.
- **`voice`**, med ett påhittat manifest:
  - En dialog med klipp på 1,5 och 1,0 s tar 3,3 s, alltså klippen plus 0,4 s vardera.
  - En bubbla under en dialogreplik stryks efter sina 2,5 s. Radion köar och börjar efter
    dialogen.
  - Samma talare väntar in sig själv: 7,61–9,60 och sedan 9,60–10,61 s.
  - Ett trasigt klipp mumlas: tre mummel och inget fel i konsolen.
  - Käken öppnas på kurvan, sluts på "p" och rör sig 0,010–0,078 rad.
  - Musiken duckas till 0,40 under tal och går tillbaka till 1,0.
  - Avstängda röster ger `null`.
- **`music`:** dag 1:s patrull spelar `patrull-kall`, ett ärende `vardag` och sedan patrullen
  igen. Looppunkterna laddas. Uppmätta nivåer före `CUE_GAIN`: stycket −40 dBFS, pianot −35 och en
  röst −17. Styckena höjdes 4,6 dB så att de ligger i nivå med pianot.
- **`vcut`**, dag 1–4 med rösterna och en läsare som trycker 0,5–0,8 s efter varje sagd replik:
  - 60 repliker begärda och 60 sagda, 37 av dem med klipp och 0 strukna.
  - **0 avklippta** (målet var under 5 %; Seinfeld-spelet låg på 24 % före sin kö).
  - **0 gånger två röster samtidigt.**
  - 0 repliker som inte står i script.js.

  Ett misslyckat race med omstart (`retry`) gav 8 repliker, 0 avklippta och 0 överlappande. Inget
  uppdrag i de körningarna har en röstad fail-replik, så "fail-repliker avklippta" blev 0 av 0.
  Ärendenas fail-repliker är `must` och stryks aldrig.
- **`vstory`**, alla sju dagarna med rösterna (autoDialog väntar in varje klipp plus 0,4 s): slutar med
  `#7 idle stage 7`, `hud watch: 4851 samples, 0 leaks` och `no errors`.
  - 122 repliker begärda och 119 sagda, 65 av dem med klipp och 3 strukna.
  - **1 avklippt (0,8 %):** Anitas "Ove, elementet klickar igen..." på dag 7. Ove kom fram och
    samtalet lades på, som det är tänkt.
  - 0 gånger två röster samtidigt, 0 radiotoasts som försvann för tidigt och 0 repliker utanför
    script.js.
- **Verktygen:**
  - `make voice-check`: ok, 167 av 167 klipp inom omfånget.
  - `make music-check`: ok, 8 av 8 stycken.
  - Provlyssningssidan svarar med rollerna, 57 scener, granskningslistan och musiken.
  - Filservern vägrar sökvägar utanför `assets/` och `.cache/`.
- **En bugg hittad på vägen:** en bubbla som köades precis när ett intro började låg kvar i kön
  (kön stod still medan dialogrutan var uppe), så `quiet()` blev aldrig sann igen. Nu löper
  tidsgränsen även medan dialogrutan är uppe.

### Det här behöver utvecklaren göra eller bestämma

1. **Lyssna** på provlyssningssidan (`make voice-review`, http://127.0.0.1:8795/):
   - **Rollerna:** Oves norrländska Brage mot Ola Paulakoski (värmländsk) och Mathias
     (göteborgsk). Hur tydlig är Parvanehs brytning hos Setareh, jämfört med Niloofar och Noushin?
     "Välj" byter röst. Rollens klipp blir då inaktuella, och `make voice` gör om dem.
   - **Granskningen:** de tolv på listan, framför allt Oves "Hmpf." (sex repliker). Låter de fel
     finns "Gör om" med regi, t.ex. `[scoffs] Hmpf.`.
   - **Musiken:** varje stycke, och om patrullstyckena delar temats melodi.
2. **Rabatten på `eleven_v4` går ut 12 oktober.** Resten av replikerna, ungefär 10 500 tecken,
   kostar i dag runt 1 500 credits. Till fullpris kan de kosta runt 10 500. Enligt instruktionen
   gjordes de inte nu. **(Gjort 2026-10-11 i resten-featuren: 3 643 credits med poolen och
   provläsningarna.)**
3. **Barnen:** riktiga inspelningar (väg b), eller mummel och fniss som nu?
4. **Fler röstplatser** behövs bara om ni vill ha designade röster (en västgötsk Ove, egna röster
   för statisterna). Allt i första versionen klarar sig utan.

## Förslaget

### Kortversion

- **Rösterna:** replikerna blir riktigt tal. Talet genereras i förväg med ElevenLabs (`eleven_v4`,
  svenska) och checkas in som små mono-mp3-filer. Spelet anropar aldrig API:t, och API-nyckeln
  hamnar aldrig i koden.
- **Första versionen:** alla Oves repliker, plus allt de andra säger fram till och med dag 1. Det
  är 125 av spelets 354 repliker (35 %) och 3 800 av 12 600 tecken. Bara fem roller behöver en
  röst: Ove, Patrick, Parvaneh, Sara och Nasanin. Resten görs i en senare feature.
- **Manuset:** alla röstade repliker flyttas till en ren datafil, `src/game/script.js`, med
  `allLines()`. Verktyget importerar den direkt, så det behövs ingen parser. Så gör
  Seinfeld-spelet.
- **Rollerna:** varje roll får en egen röst med rätt ålder och dialekt: Ove västgöte, Rune
  göteborgare, Anita norrländska och så vidare. Rösterna tas fram med Voice Design, och du väljer
  dem på en provlyssningssida. **(Blev: färdiga röster ur Voice Library, som inte tar någon
  röstplats; Oves röst är norrländsk. Se "Rollbesättningen".)**
- **Regenerering:** `make voice` genererar bara det som saknas eller har ändrats, en tagning per
  replik. Taligenkänning flaggar dåliga tagningar, och de görs om. Ett hårt tak i tecken och stopp
  vid första API-felet gör att en körning aldrig kan kosta mer än tänkt. Ändrar man en replik låter
  just den som i dag (mummel) tills `make voice` körs igen.
- **Turordning:** ingen pratar i munnen på någon. I Seinfeld-spelets första version klipptes vart
  fjärde klipp av. En röstkö fick ner det till 3 %. Vi bygger kön från början, redan innan det
  finns några klipp.
- **Läppsynk:** den är billig. Käkbenet finns redan och flaxar i dag efter en sinus
  (`src/actors/models.js:3725`). Sinusen byts mot ljudets volymkurva, och munnen stängs på m, b
  och p. Ungefär 40 rader.
- **Musik:** Eleven Music genererar ett tiotal stycken: tema, patrull, ärenden, jakt, dag 5-racet,
  dag 7-jakten, minnen av Sonja och final. En liten musikregissör i `audio.js` tonar mellan dem.
  Dagens genererade piano blir reserv.
- **Kostnad och storlek:** första versionen kostar ungefär 5 000 credits och blir ungefär 3 MB
  röster. **(Blev: rösterna ~1 090 credits med v4-rabatten och 3,3 MB; musiken ~4 500 credits för
  300 s, 4,3 MB.)** Hela spelet blir ungefär 25 000 credits och 11 MB (Seinfeld: 18 000 tecken kostade
  18 100 credits). Musiken blir ungefär 25 MB.
- **Största osäkerheterna:**
  - hur bra svenska *dialekter* blir
  - barnrösterna (ElevenLabs regler)
  - kontots röstplatser: Seinfeld-spelet använder alla 10, om det är samma konto
  - vad `eleven_v4` kostar när rabatten går ut (12 oktober)

  Allt det testas i en spik (steg 0) innan något byggs på riktigt.

## Första versionen

### Vad som röstsätts

Räknat på koden 2026-10-11 (alla röstade strängar i `src/`, utan dubbletter). Räkningen gjordes
med en tillfällig parser, så siffrorna kan vara fel med några repliker. `allLines()` ger de exakta
när manuset har flyttats:

| Del | Repliker | Tecken | Vem |
|---|---|---|---|
| **alla Oves repliker**, hela spelet | 102 (29 %) | 2 855 | Ove |
| **dag 1** (intro, outro, omstart, radio) utom Ove | 12 | 653 | Patrick, Parvaneh |
| **småpratet före dag 1** (`CHATTER_FIRST`) | 11 | 286 | Patrick, Parvaneh, Sara, Nasanin |
| **första versionen** | **125 (35 %)** | **3 794 (30 %)** | |
| **(Blev, efter tre nya features och flytten)** | **173 (167 med klipp, 6 barnens mummel)** | **4 639** | Ove 149, Patrick 10, Parvaneh 8, Sara 3, Nasanin 3 |
| resten (resten-featuren) | 229 | 8 845 | Anita, Rune, Jimmy, Adrian, Anders, Vita skjortan, statisterna; Patrick, Parvaneh, Sara och Nasanin efter dag 1 |
| hela spelet | 354 | 12 639 | |

- Dag 1 och det som sägs före den är ungefär de första 15 % av spelet: en av sju dagar.
- Oves repliker är ensamma 29 % av alla repliker, så första versionen hamnar på drygt en tredjedel,
  inte en femtedel.
- **Utanför första versionen** är också det som sägs under hela spelet: grannarnas småprat efter
  dag 1 (`CHATTER`, `CHATTER_AFTER`), telefonsamtalen och ärendena, och statisternas och smitarnas
  repliker (`OUCH`, `PANIC`, `FLEE_LINES` och de andra). Oves egna repliker i dem är med.

### Vad det betyder i spelet

- Dag 1 och allt före den är helt röstsatt. Det är det första intrycket.
- Från dag 2 pratar Ove med röst, och de andra mumlar som i dag. Samma sak i telefonsamtalen och
  ärendena: grannen mumlar och Ove svarar med röst. Textningen syns alltid, så inget går förlorat.
- Allt annat i den här featuren byggs fullt ut: manuset i `script.js`, verktyget, turordningen,
  ljudkedjan, läppsynken och musiken. Resten-featuren behöver bara röstsätta fler roller och köra
  `make voice` igen.

### Hur verktyget vet omfånget

- `allLines()` ger `[vem, text, del]`, där `del` säger var repliken hör hemma i `script.js`
  (`day1`, `chatterFirst`, `chatter`, `errands`, `peds` och så vidare).
- `cast.json` har ett omfång:
  `"scope": { "who": ["ove"], "parts": ["day1", "chatterFirst"] }`. En replik genereras om
  talaren *eller* delen står i omfånget.
- Torrkörningen visar också hur många repliker och tecken som ligger utanför omfånget.
  `make voice-check` räknar bara det som ligger inom omfånget som fel.
- Resten-featuren tar bort `scope`.

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
- **Replikerna finns i tre former, i sex filer** (avsnitt 5.1 samlar dem i en):
  - `['vem', 'text']`-tupler i `missions.js`
  - fält i objekt som har ett `who`: `lines`, `ove`, `thanks`, `fail`, `hello`, `bye`, `goLine`
    och så vidare, i `interruptions.js` och `stages.js`
  - delade tabeller som vem som helst kan säga: `OUCH`, `GETUP`, `CARJACK`, `KICKED`, `SHOVED`,
    `SHOVED_KID` och `CHATTER`/`CHATTER_AFTER`/`TYRE` i `main.js`, `PANIC` i `peds.js`,
    `FLEE_LINES`/`CAUGHT_LINES` i `patrol.js`
- **Statisterna** har ålder och kön (`randomPed`, `src/actors/models.js:3114`), och det räcker för
  att välja en röst som passar. Smitarna pratar via sin bil (`g.say(car, …)`), så bilens förare
  behöver också en röst.
- **Mängden:** 354 unika repliker och 12 600 tecken, i snitt 36 tecken per replik. Ove har flest:
  102 repliker, varav 26 är reaktioner (`TYRE`, `OVE_START`, `OVE_REPLY`). Statisternas tabeller
  (37 repliker) ska sägas med flera olika röster.
- **Musiken** är ett generativt piano med en stråkmatta i a-moll, 64 bpm (`src/audio.js:852`). Den
  har ett enda humör och duckas till hälften under jakt och samtal (`main.js:1936`). Jinglarna är
  syntetiserade.
- **Ljudfiler:** projektet har inga än. Allt ljud syntetiseras.

## 2. Förebilden: Seinfeld-spelet

`../nothing_and_run__seinfeld` röstsatte hela sitt manus 2026-10-11 (fas 2.5, rapporten finns i
`docs/phase2-reports/voices.md` där):

- 356 repliker och 18 013 tecken. 10 röster gjorda med Voice Design (`eleven_ttv_v3`) från
  beskrivningar av egenskaper.
- Talet gjordes med `eleven_v3` och kostade 18 101 credits, alltså 1 credit per tecken. Det blev
  20,8 minuter tal.
- Klippen är mono-mp3 i 64 kbps, utjämnade till −16 LUFS, sammanlagt 10,2 MB.
- Allt sköts av ett skript, `tools/voices.mjs` (cirka 220 rader, inga beroenden), och dess
  inställningar i `tools/voices.json`.

### 2.1 Det vi tar efter

- **Manuset är ren data.** Varje röstad replik ligger i `src/game/script.js`, som inte importerar
  något. `allLines()` ger `[[vem, text], ...]`. Verktyget importerar filen direkt i Node, så det
  behövs ingen parser (5.1).
- **Filnamnet är en hash** av talare, text, röst, modell, inställningar och omtagningsnummer. Seeden
  tas ur samma hash, så samma replik ger alltid samma tagning. Ändras något av det blir det ett nytt
  klipp. Det gamla blir föräldralöst och tas bort med `--prune`.
- **Manifestet är nycklat på exakt text** (`{ vem: { text: klipp } }`) och har varje klipps längd.
  Spelet räknar ingen hash, det slår bara upp texten. Saknas klippet blir det mummel som i dag.
- **Tempo per roll** (tecken/s, uppmätt på klippen) ger en gissad längd för en replik som saknar
  klipp.
- **Det är billigt att iterera:**
  - Torrkörningen visar repliker, tecken och credits per roll.
  - Ett hårt tak (`--max-chars`, 30 000) stoppar körningen: över taket genereras ingenting.
  - Körningen stannar vid första API-felet. Ett nätverksfel får ett nytt försök.
  - En pilot görs först, 2–3 repliker per roll (`--only`, `--limit`), innan hela omgången.
  - Kostnaden läses ur svarets `character-cost`-header och loggas.
  - Råklippen sparas, så `--reprocess` gör om efterbehandlingen utan nya anrop.
  - En omtagning är `"<exakt text>": 1` i inställningarna. Det ger ny hash och ny seed.
- **Två anrop åt gången.** Planen tillåter tre.
- **En regel i CLAUDE.md:** efter ändrade repliker körs först torrkörningen och sedan generatorn.
  `.env` skrivs aldrig ut och grep:as aldrig. Manuset har en budget (där ≲ 22 000 tecken och
  ≲ 25 ord per replik) och ett kommando som räknar.

### 2.2 Det de fick laga efteråt

- **Repliker klipptes av.** Första versionen spelade varje klipp när repliken visades. De mätte en
  runda spelad i mänsklig takt (uppdrag 1–4, med misslyckanden och omstarter):
  - 24 % av klippen klipptes av, och 38 % utanför dialogrutan.
  - Två röster hördes samtidigt åtta gånger.
  - Omstarten klippte av 3 av 5 repliker som sades när ett uppdrag misslyckades.
  - Radiotoasts försvann innan klippet var slut.

  Efter en röstkö (6.2) klipptes 3 % av. Alla tre var uppdrag som misslyckades mitt i en replik.
  Inga två röster hördes samtidigt.
- **Minnet.** 20 minuter avkodat ljud tar ungefär 250 MB. Bara de 24 senast använda klippen hålls
  avkodade.
- **Fördröjningen.** Ett klipp som inte är förladdat börjar 100–300 ms efter att repliken syns,
  eftersom det först ska hämtas och avkodas.

### 2.3 Det vi gör annorlunda

- **Någon lyssnar.** Ingen har lyssnat på Seinfeld-klippen. Rösterna valdes på mätvärden: tempo,
  tonhöjd (Praat), ljudstyrka och hur rätt Whisper hörde texten. Här väljer du på
  provlyssningssidan (5.5), med samma mätvärden bredvid som hjälp.
- **Mer än en statiströst.** Kontot rymde bara 10 egna röster. Därför pratar alla förbipasserande,
  även kvinnorna, med en taxichaufförs röst, och kvinnornas och barnens repliker spelas 14 %
  snabbare som nödlösning. Röstplatserna är därför den första öppna frågan här (11).
- **Taligenkänningen underkänner inte korta rop.** Whisper missade mest på enordsrop ("Ehh!" blev
  "Hey!"), på tal skrivna med bokstäver och på namn uttalade med brytning. Sådana repliker hamnar
  på granskningslistan i stället för att tas om automatiskt.
- **Svenska.** Alla anrop skickar `language_code: 'sv'`. Dialekterna är en ny risk, eftersom
  Seinfeld bara behövde amerikansk engelska.

### 2.4 Kontot

Om det är samma ElevenLabs-konto gäller också det här (från deras rapport 2026-10-11):

- Alla 10 platser för egna röster är upptagna. **(Bekräftat: `voice_limit_reached (10 / 10)`.)**
- Ungefär 65 000–69 000 credits fanns kvar efteråt.
- Nyckeln saknar rättigheten `user_read`, så skriptet kan inte läsa saldot. Med den rättigheten
  kan `make voice DRY=1` visa saldot bredvid kostnaden.
- Voice Design rapporterar ingen kostnad i svaret.
- `eleven_v4` hade ungefär 85 % rabatt till 12 oktober (27 tecken kostade 4 credits). Vad den
  kostar efter det är inte kollat.

## 3. Röstmotorn: ElevenLabs

- **Modell:** `eleven_v4`, deras nyaste flaggskepp, för alla roller. **(Blev så: 0,13–0,14
  credits/tecken med rabatten. Audio tags fungerar, "[sighs]" lästes inte upp.)** Den stöder svenska och audio
  tags som `[sighs]` och `[whispers]`.
  - ElevenLabs skriver själva att röster från Voice Design kan bli "mindre performativa" i v4.
    Låter en roll platt i spiken skärper vi beskrivningen eller inställningarna.
  - Priset efter rabatten kollas med en enda replik och svarets `character-cost`. Kostnaderna i
    det här dokumentet räknar med 1 credit per tecken, som v3 *(overifierat för v4)*.
  - Alla anrop skickar `language_code: 'sv'` så att talet inte glider över i engelska.
- **Versaler och "...":** i Seinfeld-spelet (v3) blev versaler betoning och "..." en paus. Gör v4
  likadant behöver Anitas "Ove..." och Oves "NEJ." ingen extra regi. Spiken kollar det.
- **Samtal kan genereras som samtal.** Spiken provar att skicka dialogerna i `intro`, `outro` och
  `retryIntro` till Text to Dialogue (`/v1/text-to-dialogue/with-timestamps`).
  - Gränsen är 10 röster och 2 000 tecken, och alla våra samtal ryms.
  - Den byggdes för v3. Att den tar v4 är *(overifierat)*.
  - Då får replikerna naturlig turtagning och reagerar på det som just sades.
  - Svaret har `voice_segments` med `dialogue_input_index`, så vi klipper upp det i en fil per
    replik. `runDialog` spelar ändå rad för rad.
  - Låter det inte tydligt bättre blir det vanlig TTS per replik, som i Seinfeld-spelet.
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
  - Skripten läser den från `ELEVENLABS_API_KEY` i en git-ignorerad `.env` i spelmappen
    (`.example.env` finns redan). Lägg in den själv där, inte i chatten.
  - Den används bara av verktygen under `tools/`. Spelet i webbläsaren rör aldrig API:t.
  - `.cache/` läggs till i `.gitignore` (`.env` finns redan där).
- **Plan och röstplatser:**
  - Röstplatserna är flaskhalsen, inte krediterna. Starter har 10 egna röster, och det var den
    gränsen Seinfeld-spelet slog i. Creator har 30.
  - Röster som sparas från Voice Library räknas inte mot gränsen, enligt hjälpsidan *(overifierat
    i praktiken)*.
  - WAV i 44,1 kHz kräver Pro. Vi hämtar `mp3_44100_128`, som Seinfeld-spelet, och kodar om. I ett
    spel hörs ingen skillnad.

## 4. Rollbesättningen: dialekt och ålder

### 4.1 Förslag per roll

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
| Sara | 7 | neutral, uppvuxen här | barn, se 4.4 |
| Nasanin | 3 | – | litet barn, enstaka ord, se 4.4 |

**(Blev: Ove = Brage (norrländsk), Patrick = Filip (rikssvenska), Parvaneh = Setareh (persiska som
modersmål), barnen mumlar. Se "Rollbesättningen".)**

Parvanehs brytning ska vara lätt och ge värme, aldrig bli en karikatyr. Hur tydlig den ska vara
avgör du på provlyssningssidan.

**I första versionen** besätts bara Ove, Patrick, Parvaneh, Sara och Nasanin. De andra rollerna
och statisterna (4.3) besätts i resten-featuren. Spiken provar ändå en norrländsk och en
göteborgsk röst, så att vi vet tidigt om dialekterna håller.

### 4.2 Så tas rösterna fram

- Varje roll har en beskrivning för Voice Design i `tools/voice/cast.json`. Den är skriven på
  engelska, precis som ElevenLabs egna exempel. Deras guide säger:
  - Börja med språket och den regionala varianten i första meningen.
  - Ange åldern konkret ("late 50s", "mid-70s").
  - "Thick" fungerar bättre än "strong" för en tydlig brytning.
  - Undvik vaga ord som "foreign" och effektord som "phone" och "reverb".
  - Höj `guidance scale` när dialekten är viktigare än ljudkvaliteten.
- Alla beskrivningar slutar med samma mening om inspelningen, så att rösterna låter som från samma
  studio. Seinfeld-spelet använder "Clear studio recording."
- Voice Design ger tre kandidater per körning. `make voice-cast WHO=ove` gör två körningar (sex
  kandidater), och `ROUNDS=n` ger fler. Till dem kommer en sökning i Voice Library (`language=sv`,
  kön, ålder). Röster därifrån tar inga platser.
- Provtexten är rollens egna repliker ur `allLines()`, 160–270 tecken, som täcker röstens omfång.
  API:t kräver minst 100 tecken, så för Rune, som mest säger enstaka ord, skrivs en egen
  `previewText`.
- Du lyssnar och väljer på provlyssningssidan (5.5). Valet sparas som en röst med namnet
  `Saab & Run: <roll>`, så att den syns bland Seinfeld-rösterna i samma konto, och dess `voice_id`
  skrivs in i `cast.json`. Att byta röst på en roll senare gör att alla rollens klipp genereras om.
- **Ingen kloning av verkliga personer**, och särskilt inte av skådespelarna i filmen. Rösterna ska
  passa rollerna, inte imitera någon.

Ett exempel på en post i `cast.json`:

```json
"ove": {
  "design": "A Swedish man in his late 50s from Västergötland in western Sweden, speaking Swedish with a light västgötska accent. Low, slightly gravelly voice; terse and clipped, dry and unimpressed, very little melody, as if every word costs money. Natural, close conversational recording.",
  "model": "eleven_v4",
  "voice_id": null,
  "preview": null,
  "settings": { "stability": 0.5, "similarity_boost": 0.75 }
}
```

### 4.3 Statisterna

*Görs i resten-featuren. Här står designen, så att verktyget byggs för den redan nu.*

- Statisterna delar en pool av röster. Hur stor den blir beror på röstplatserna (avsnitt 3 och fråga 1 i avsnitt 11):
  - **Med 30 platser:** ungefär 14 röster. Kvinnor och män i tre åldrar (ung, medel, äldre), två
    röster i varje grupp, plus två tonåringar och barn om det går (4.4).
  - **Med 10 platser:** rollerna tar alla platser, och poolen hämtas helt från Voice Library.
- Dialekterna blandas. Några röster har en annan svensk brytning, till exempel finsk, arabisk,
  polsk eller bosnisk, för så låter en svensk förort.
- En statist får sin röst ur sitt eget slumpfrö, så samma person alltid har samma röst. En smitare
  pratar med förarens röst.
- Seinfeld-spelet valde i stället rösten ur replikens hash. Då görs varje replik bara en gång,
  men en person byter röst mellan två repliker. Vi gör inte så.
- Bara de kombinationer som kan förekomma genereras. I `script.js` står det i en kommentar vem som
  kan säga en tabell, till exempel `// @voice ped-adult cast` ovanför `OUCH` och
  `// @voice ped-kid` ovanför `SHOVED_KID`.
- Statisternas tabeller är 37 repliker och ungefär 600 tecken, så varje poolröst kostar ungefär
  600 credits.

### 4.4 Barnen (Sara 7, Nasanin 3 och barnstatisterna)

ElevenLabs tillåter inte barnröster eller röster som låter som barn i Voice Library. Det gäller även
vuxna röster som härmar barn. Dokumentationen säger inte om Voice Design ändå skapar en barnröst för
eget bruk *(overifierat)*. Därför finns tre vägar:

- **a) Voice Design, om det tillåts.** Spiken provar det först.
- **b) Riktiga inspelningar** av barn, med vårdnadshavares godkännande. Det är ungefär 25 korta
  repliker, en kvart med en telefon i ett tyst rum, och samma efterbehandling som allt annat.
  Det blir ofta mest levande.
- **c) Mummel som i dag, plus fniss.** Nasanins repliker är ändå ett till tre ord ("Ove! Ove!
  Ove!", "Snö!", "Katten!").

**(Blev: a gick inte. Voice Design vägrar barnröster med HTTP 403. Det blev c: mummel och fniss.)**

Mitt förslag är att pröva a i spiken. Går det inte blir det b om det finns barnröster att spela in,
annars c.

I första versionen har barnen bara småpratet före dag 1: Sara tre repliker ("Hej! Vi har flyttat
hit!", "Pappa kan inte backa.", "Vem är du?") och Nasanin några ord. Blir det c fungerar första
versionen ändå. Seinfeld-spelets knep, en vuxen röst som spelas 14 % snabbare, låter som en ekorre och är
ingen väg.

## 5. Manus och regenerering

### 5.1 Manuset: `src/game/script.js`

- Alla röstade repliker flyttas till `src/game/script.js`, en ren datafil som inte importerar
  något. Den exporterar replikerna per dag, per avbrott och per tabell, och `allLines()` ger alla
  `[vem, text]` utan dubbletter.
- Koden importerar replikerna och skriver aldrig röstad text direkt i koden. Text som bara läses,
  som mål, toasts och banners, stannar i koden.
- **Varför inte en parser:** att plocka ut repliker ur sex filer med en AST-parser kräver regler för
  tre olika former, och den missar repliker som byggs i koden. Med en datafil är frågan "är den här
  repliken röstad?" samma sak som "står den i `script.js`?".
- **Flytten** gäller alla 354 repliker, även de som röstsätts först i resten-featuren. De kommer
  från `missions.js`, `interruptions.js`, `stages.js`, `main.js`, `peds.js` och `patrol.js`.
  Flytten är mekanisk och ändrar ingen text. `story` och de andra
  scenarierna visar att inget gått sönder, och `story` med `&voice` (6.5) visar att ingen replik
  sägs utan att stå i `allLines()`.
- **Budget:** CLAUDE.md får en regel om manusets storlek (förslag ≲ 15 000 tecken, ≲ 25 ord per
  replik) och ett kommando som räknar:
  `node -e "import('./src/game/script.js').then(m => { const l = m.allLines(); console.log(l.length, l.reduce((s, [, t]) => s + t.length, 0)) })"`.

### 5.2 Filerna

| Fil | Incheckad | Innehåll |
|---|---|---|
| `src/game/script.js` | ja | manuset (5.1) |
| `tools/voice/cast.json` | ja | rollbesättningen: beskrivning, `voice_id`, modell och inställningar per roll och poolröst |
| `tools/voice/lines.json` | ja | regi per replik, nycklad på vem och exakt text: `tts`, `retake`, `locked`, anteckning |
| `tools/voice/lexicon.pls` | ja | uttalsordlistan |
| `.cache/voice/raw/` | nej | råa tagningar från API:t, så att efterbehandlingen kan göras om gratis |
| `.cache/voice/design/` | nej | röstkandidaterna och taligenkänningens resultat |
| `assets/voice/<vem>/<hash>.mp3` | ja | de färdiga klippen |
| `assets/voice/index.json` | ja | manifestet som spelet läser |

### 5.3 Hash och manifest

- Filnamnet är `sha1(vem, text, voice_id, modell, inställningar, retake)`, de första 12 tecknen.
  Seeden tas ur samma hash.
- Ändras något av det (texten, rösten, en inställning, ett nytt `retake`) saknas klippet, och nästa
  `make voice` gör det. Det gamla klippet blir föräldralöst.
- Manifestet är nycklat på exakt text: `{ "<vem>": { "<text>": { f, d, t, lip } } }`, där `f` är
  filen, `d` längden, `t` starttiden för varje tecken (för utskriften) och `lip` läppkurvan
  (avsnitt 7). Spelet räknar ingen hash.
- Poolrösterna har egna nycklar (`ped_k_aldre_1` och så vidare). Spelet frågar efter
  `voice.voiceFor(statist)`.

### 5.4 Stegen i `make voice`

1. **Planen.** `tools/voice/voice.mjs` importerar `allLines()`, behåller det som ligger inom
   omfånget (`scope` i `cast.json`, se "Första versionen"), räknar ut varje repliks hash och
   jämför med disken. Den flaggar repliker som behöver en människa:
   - bara skiljetecken (Runes "..." blir en suck eller ingenting)
   - interjektioner ("Hmpf.", "Mm.", "Aj!")
   - förkortningar och siffror
2. **Torrkörningen** (`DRY=1`, och alltid innan något genereras) skriver per roll ut repliker,
   tecken och credits, saldot om nyckeln får läsa det, roller som saknar röst, föräldralösa klipp
   och hur mycket som ligger utanför omfånget. Över taket (`MAX`, standard 30 000 tecken) genereras ingenting.
3. **Genereringen** gör en tagning per replik som saknas, med seeden ur hashen.
   - Två anrop åt gången.
   - Ett nätverksfel får ett nytt försök efter 3 s. Första API-felet stoppar allt.
   - Varje anrop loggar sin kostnad ur `character-cost`.
   - Råklippet sparas i `.cache/voice/raw/` innan det efterbehandlas.
4. **Kvalitetskontrollen** **(Blev: KBLab:s `kb-whisper-small` lokalt, gratis; Scribe kostar 330
   credits/min):** Scribe v2 (ElevenLabs taligenkänning, svenska) skriver ut varje
   tagning, och utskriften jämförs med repliken efter normalisering (små bokstäver, utan
   skiljetecken). En tagning underkänns om den:
   - hoppar över eller lägger till ord
   - glider över i engelska
   - har en orimlig längd (tecken per sekund jämfört med rollens tempo)

   En underkänd tagning görs om automatiskt med nästa `retake`, högst två gånger. Sedan hamnar
   den på granskningslistan. Repliker på högst två ord och rop underkänns aldrig automatiskt, de
   går direkt till listan (se 2.3). Lokalt finns KBLab:s svenska Whisper-modeller som gratis
   alternativ *(overifierat hur bra de är på dialekt)*.
5. **Efterbehandlingen** (ffmpeg):
   - klipper bort tystnad: 40 ms får vara kvar i början och 100 ms i slutet
   - mäter ljudstyrkan och justerar den. Ett klipp under 0,4 s går inte att mäta, så det loopas
     fyra gånger för mätningen.
   - en limiter vid −1,5 dBTP
   - ljudstyrkan sätts mot spelets egna syntljud (runt −20 LUFS för vanligt tal, rop starkare;
     Seinfeld-spelet använder −16)
   - kodar till mono-mp3 i 64 kbps. mp3 avkodas i alla webbläsare och är beprövat i
     syskonprojektet. Opus hade sparat ungefär 3 MB.
   - räknar ut läppkurvan (avsnitt 7)
   - skriver om manifestet, med längden på varje klipp
6. **Kontrollen** (`make voice-check`) gör inga anrop. Den listar repliker utan ljud, föräldralösa
   och inaktuella filer, och avslutas med felkod om något saknas. Därför kan den köras bland
   testerna.

```sh
make voice DRY=1             # vad som skulle genereras och vad det kostar, utan anrop
make voice                   # generera det som saknas, kontrollera, efterbehandla
make voice WHO=ove LIMIT=3   # pilot: tre repliker för en roll
make voice DAY=3             # bara dag 3:s repliker; MAX=n ändrar taket
make voice PRUNE=1           # tar också bort klipp som ingen replik använder
make voice REPROCESS=1       # gör om efterbehandlingen från råklippen, utan anrop
make voice-cast WHO=anita    # nya röstkandidater för en roll
make voice-review            # provlyssningssidan, skriver ut adressen
make voice-check             # bara kontrollen
```

### 5.5 Provlyssningssidan

`tools/voice/review.mjs` är en liten Node-server på en egen port. Den skriver dina val direkt till
`cast.json` och `lines.json`.

- **Rollbesättning:** alla kandidater för en roll sida vid sida. Du väljer en. Bredvid varje
  kandidat står mätvärdena som Seinfeld-spelet valde på: tempo (tecken/s), tonhöjd och hur rätt
  taligenkänningen hörde texten.
- **Repliker per dag och scen:** spela upp ett helt samtal i följd och lyssna på varje replik.
  - Granskningslistan från kvalitetskontrollen ligger överst.
  - "Gör om" tar en regianvisning, som sparas som `tts` eller ett nytt `retake` i `lines.json`.
    Nästa `make voice` genererar bara de replikerna.
  - Med `locked` blir en bra tagning aldrig omgjord av misstag, inte ens när rollens inställningar
    ändras.

## 6. Uppspelningen i spelet

### 6.1 En ny modul, `src/voice.js`

```js
voice.play(who, text, { slot, mode, at, wait, must })  // -> { dur, ended (Promise), mouth(), stop() } eller null
voice.secs(who, text)        // klippets längd i sekunder, annars tecken / rollens tempo
voice.quiet()                // ingen pratar och kön är tom
voice.waitQuiet(min, max)    // Promise: tyst, men vänta minst min och högst max sekunder
voice.prefetch(lines)        // [[who, text], ...]: ladda och avkoda i förväg
voice.voiceFor(ch)           // rollnyckel, statistens poolröst eller förarens röst
```

Får anroparen `null` gör den som i dag och mumlar. Samma sak när rösterna är avstängda. Kön och
`secs` fungerar även utan klipp, med mummel och gissade längder. Därför kan turordningen byggas och
testas innan det finns en enda röst.

### 6.2 Turordning

Reglerna kommer från Seinfeld-spelet (deras `docs/phase3-reports/fix-a.md`, avsnitt 4), där de tog
de avklippta replikerna från 24 % till 3 %:

- **Två platser:** *huvud* (dialogrutan, radio, telefonsamtal) och *bubbla* (`say`, rop, småprat,
  statister). En röst per plats.
- **En dialogreplik** bryter in på allt och stoppar bubblan.
- **Radio och samtal köar** bakom den som pratar och väntar högst 6 s, annars stryks de. Med
  `must` väntar de hur länge som helst. Toasten visas när repliken faktiskt sägs, i
  max(3,5 s, klippet + 0,9 s).
- **En bubbla** visas direkt. Är det tyst spelas rösten med en gång, annars köas den i högst 2,5 s
  och stryks sedan. Bubblan syns ändå. En bubbla pratar aldrig över en huvudreplik.
- **Samma talare väntar in sig själv:** en ny replik från den som redan pratar väntar tills den
  förra är sagd.
- **Etappernas småprat** (radiorepliker under `goto`, `escort`, jakten) går genom en gemensam
  hjälpare som väntar tills det är tyst och sedan en paus efter att förra repliken *slutade*.
- **Uppdragen tajmas efter klippen:** scener med flera repliker i följd väntar med
  `await voice.waitQuiet()` eller `voice.secs()`, aldrig med fasta tider.
- **Slutet:** när sista etappen är klar väntar uppdraget tills det är tyst (1,6–5 s) innan
  `outro` börjar.
- **Misslyckanden:** repliken som sägs när ett uppdrag misslyckas spelas klart in i omstarten.
  Omstarten stoppar inte rösten, och nästa försöks radio köar bakom.
- **Nära den som ger uppdraget** är grannarna tysta (6 m), annars klipps deras småprat av introt.
- **Hos oss dessutom:**
  - Telefonsamtalen i `interruptions.js` byter `lineSecs(text)` mot `voice.secs(who, text)`.
  - I småpratet (`main.js:1286`) svarar Ove när grannen har pratat färdigt, inte efter fasta 2 s.

### 6.3 Ljudkedjan (i `audio.js`)

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
- **Minnet:** bara de 24 senast använda klippen hålls avkodade (2.2).
- **Ett klipp som inte går att ladda** mumlas resten av sessionen.

### 6.4 Ändringar per anropsställe

- **`runDialog`:**
  - Hela samtalet förladdas när dialogen börjar.
  - Texten skrivs ut tecken för tecken efter tidsstämplarna, så textningen följer talet.
  - Raden är klar när klippet är slut.
  - Första trycket på hoppa-knappen visar hela texten medan rösten pratar vidare. Andra trycket går
    vidare, och rösten tonas ut på 80 ms.
  - `autoDialog` väntar tills klippet är slut plus 0,4 s.
- **`say` och bubblorna:** en bubbla visas i `max(secs, klippets längd + 0,4 s)`. Den som pratar
  får `talk`-tillståndet så länge klippet spelar, och då rör sig käken.
- **`radio`, `shout` och samtalen:** längden blir `voice.secs(who, text)`. Då väntar samtalsskripten
  i `interruptions.js` in rösten av sig själva.
- **Paus:** pausmenyn pausar rösterna. En dold flik stänger redan av hela AudioContexten.

### 6.5 Inställningar, laddning och tester

- **Inställningar:** "Röster: på/av" plus nivå, sparat i `saab-and-run-settings` (`voice`).
  Avstängt betyder dagens mummel. Textningen syns alltid.
- **Laddning:**
  - `index.json` laddas vid start. Den är liten.
  - Dagens samtal förladdas när uppdraget erbjuds, så att det inte blir 100–300 ms tystnad före
    varje replik (2.2).
  - Reaktionerna för statisterna i närheten laddas när de behövs.
  - Allt som allt är det ungefär 11 MB, och aldrig allt på en gång.
- **Tester:**
  - `?test=1` stänger av rösterna, så testerna går lika fort som i dag. `&voice` slår på dem.
  - Ett nytt scenario, `voice`, använder ett påhittat manifest och kontrollerar:
    - att varje rad väntar in sitt klipp
    - att bubblor inte pratar över en huvudreplik
    - att ett klipp som inte går att ladda blir mummel
    - att käken rör sig medan någon pratar och stängs på m/b/p
  - Ett scenario `vcut` spelar dag 1–4 i mänsklig takt, med ett misslyckande och en omstart, och
    mäter samma saker som Seinfeld-spelet. Målen:
    - under 5 % av klippen avklippta (mer än 0,25 s ospelat)
    - inga två röster samtidigt (mer än 0,3 s)
    - ingen avklippt replik när ett uppdrag misslyckas
    - ingen toast som försvinner innan klippet är slut
  - `story` med `&voice` samlar repliker som sägs utan att stå i `allLines()` och räknar dem som
    fel.

## 7. Läppsynk

- **Det som redan finns:** ett käkben som den nedre delen av ansiktet är viktad mot. Det sätts varje
  bildruta i `models.js:3725`. När någon pratar flaxar det efter en sinus, vid rop står det på 0.16
  och annars på 0.004.
- **I förväg (efterbehandlingen):**
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
  hoppar vi över det, och sinusen finns kvar. Seinfeld-spelet har ingen läppsynk alls.

## 8. Musik

### 8.1 Mål

Musiken ska vara komponerad men ha samma stämning som i dag: svensk vintermelankoli, återhållsam,
med piano och stråkar i botten. Den ska aldrig låta som "spelmusik". Dagens generativa piano blir
reserv (inga filer, eller medan musiken laddas) och kan finnas kvar som ett val i inställningarna.

### 8.2 Styckena

| Stycke | När | Längd | Stil (idé till prompten) |
|---|---|---|---|
| `tema` | titeln; finalen i full version | 90 s + 2–3 min **(Blev: 53 s, även finalen)** | nordisk melankolisk melodi på solopiano, stråkar som kommer in |
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

### 8.3 Uppspelningen

- **Nytt API:** `audio.music(state)` med tillstånden `title`, `roam`, `errand`, `pursuit`,
  `mission:<id>`, `memory` och `finale`. `main.js` sätter tillståndet på samma ställe där duckningen
  räknas ut i dag (`main.js:1936`).
- **Byten och loopar:**
  - Mellan tillstånden tonas det över på 2–3 s med jämn effekt.
  - `roam` är en spellista: ett stycke, 5–15 s tystnad och sedan nästa. Det blir mindre tjatigt än
    en ändlös loop och passar stämningen.
  - Korta tillstånd (`errand`, `pursuit`) loopar.
- **Looparna bakas i förväg.** Ett stycke genereras med en kompositionsplan där sista delen
  återvänder till början. Sedan tonar efterbehandlingen över slutet in i början (ffmpeg
  `acrossfade`), och `AudioBufferSourceNode.loop` spelar utan skarv. Looppunkterna står i
  `index.json`.
- **Under tal** duckas musiken av rösterna (6.3).
- **Senare:** ElevenLabs ska ha en endpoint för stem-separation *(overifierat, källan är
  tredjepartsdokumentation)*. Med den kan patrullmusiken delas i lager (piano, stråkar, slagverk)
  som läggs till när Ordning sjunker eller det blir kaos. Det behövs inte i första versionen.

**(Blev: åtta stycken, en tagning var, 300 s sammanlagt: musiken kostar 900 credits/min. Se "Musiken".)**

### 8.4 Skript

- **Konfiguration:** `tools/music/cues.json` (incheckad) har per stycke en prompt eller
  kompositionsplan, längd, modell (`music_v2_5`), `force_instrumental`, `seed` och antal varianter.
- **Kommandon:**
  - `make music` genererar varianterna för de stycken som saknas (standard 4) till `.cache/music/`.
    Samma torrkörning, tak och stopp vid fel som för rösterna.
  - `make music-review` öppnar samma provlyssningssida, där du väljer variant.
- **Efterbehandling:** ljudstyrkan normaliseras (musiken lägre än rösterna, runt −24 LUFS),
  looparna bakas och allt kodas till stereo-mp3 i 128 kbps. Ut kommer `assets/music/<stycke>.mp3`
  och `assets/music/index.json`.
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

## 9. Kostnad och storlek (grovt)

Rösterna är räknade med 1 credit per tecken. Det kostade v3 i Seinfeld-spelet, och v4:s pris efter
rabatten kollas i spiken.

**Första versionen:**

| Vad | Mängd | Kostnad |
|---|---|---|
| repliker, en tagning (piloten ingår) | 125 repliker, ~3 800 tecken | ~3 800 credits |
| omtagningar | ~10 % | ~400 credits |
| röstdesign | 5 roller (+ 2 dialektprov) × 2 körningar × ~200 tecken | okänt, rapporteras inte (högst ~3 000) |
| kvalitetskontroll (Scribe v2) | ~5 min tal | några cent |
| musik | ~12 stycken × 2,5 min × 4 varianter ≈ 120 min | ~18 $ (0,15 $/min) **(Blev: 900 credits/min på abonnemanget: 300 s ≈ 4 500 credits)** |

**Resten-featuren**, för jämförelse:

| Vad | Mängd | Kostnad |
|---|---|---|
| resten av replikerna | 229 repliker, ~8 800 tecken | ~8 800 credits |
| statisternas varianter | ~600 tecken per poolröst | ~5 000–8 500 credits (8–14 röster) |
| omtagningar | ~10 % | ~1 500 credits |
| röstdesign | 6 roller + poolen | okänt |

- **Första versionen:** ungefär 4 200 credits plus röstdesignen. Hela spelet blir ungefär 25 000.
  Båda ryms i det som var kvar efter Seinfeld-spelet (2.4). Med tre tagningar per replik, som det
  första utkastet av det här förslaget ville, hade hela spelet blivit runt 60 000.
- **Att göra om några ändrade repliker** kostar några hundra credits.
- **Storlek:** Seinfeld-spelets 18 000 tecken blev 21 minuter och 10 MB. Första versionens 3 800
  tecken blir ungefär 3 MB. Hela spelet, med statisternas varianter, blir runt 11 MB. Musiken blir
  ungefär 25 MB. `assets/` är 24 MB i dag.

## 10. Byggordning

0. **Spik**, ingen spelkod, ungefär en halv dag:
   - Kontot: lediga röstplatser, saldo och vad `eleven_v4` kostar efter rabatten.
   - Ove, Patrick och Parvaneh i sina dialekter, i v4. Håller dialekten? Håller åldern?
   - En norrländsk (Anita) och en göteborgsk (Rune) röst, bara för att veta om dialekterna håller
     innan resten-featuren.
   - Försöka göra Saras röst (regeln i 4.4).
   - Versaler och "..." i v4 (avsnitt 3).
   - Dag 1:s intro genom Text to Dialogue, uppklippt per replik, jämfört med vanlig TTS.
   - Scribe på svenska, och på dialekt.
   - Ett musikstycke med loop och en stinger.

   Du lyssnar och säger ja eller nej per del, och bekräftar rollbesättningen.
1. **Manuset:** alla replikerna flyttas till `script.js`, med `allLines()` (och `del`), budgeten
   och regeln i CLAUDE.md. Inga anrop. `story` och resten av testerna ska gå som förut.
2. **Turordningen:** `voice.js` och kön, med mummel och gissade längder. Inga klipp behövs. De nya
   scenarierna `voice` och `vcut` mäter redan här.
3. **Verktyget:** plan, omfång, torrkörning, tak, efterbehandling och kontroll.
   `make voice DRY=1` ska visa 125 repliker inom omfånget och 229 utanför, innan något anrop görs.
4. **Rollbesättningen och provlyssningssidan**, som ger `cast.json` för de fem rollerna.
5. **Pilot** med 2–3 repliker per roll. Du lyssnar. Sedan första versionens repliker,
   kvalitetskontrollen och `assets/voice/`.
6. **Ljudkedjan:** lägena, duckningen och inställningarna.
7. Läppsynken.
8. Musiken: styckena, provlyssning och musikregissören.

Varje steg kan landa för sig, och spelet fungerar hela tiden. Mummel och syntmusik finns kvar som
reserv. Steg 1–5 motsvarar ungefär det Seinfeld-spelet har i dag, plus provlyssningen. Resten är
tillägg.

När featuren flyttas till `features/implemented/` skrivs det in vad som faktiskt röstsattes, och
`resten_av_replikerna_for_a_fully_voiced_game.md` uppdateras med siffrorna.

## 11. Öppna frågor

**(Besvarade av utvecklaren 2026-10-11: 1. ingen uppgradering, inga borttagna röster, inga designade
röster, färdiga röster ur Voice Library; 2. ja; 3. AI om det är trovärdigt, annars mummel: blev
mummel; 4. förslagen i 4.1: närmast möjliga i Voice Library; 5. ja, lätt: inga gjordes, se
"Rollbesättningen"; 6. ja; 7. nej, toasts förblir text; 8. båda: pianot är reserv och del av
patrullens spellista.)**

1. **Kontot:** är det samma ElevenLabs-konto som Seinfeld-spelet använder? Då är alla 10
   röstplatser upptagna. Första versionen behöver fem (tre om barnen blir mummel), hela spelet
   elva plus statisterna. Tre vägar:
   - uppgradera till Creator (30 platser)
   - ta bort Seinfeld-rösterna. Deras klipp finns kvar, men nya eller ändrade repliker där kan inte
     göras med samma röst igen.
   - bara Voice Library-röster för statisterna, och rollerna på platser som frigörs
2. **Flytten till `script.js`:** okej att flytta alla röstade repliker till en datafil (5.1)? Den
   rör sex filer men ändrar ingen text.
3. **Barnen:** AI om det går, egna inspelningar eller mummel?
4. Stämmer dialekterna i 4.1 med hur du hör rollerna? Särskilt hur tydlig Parvanehs brytning ska
   vara, och om Adrian ska vara A eller B.
5. Får replikerna skrivas om en aning så att de bär dialekten? Till exempel Anitas "Rune sov dåligt
   i natt" → "Rune sov int' bra i natt". Annars sitter dialekten bara i uttalet.
6. Ska ljudfilerna checkas in? Mitt förslag: ja för de färdiga, som i Seinfeld-spelet. Råa
   tagningar stannar i `.cache/`.
7. Ska Ove läsa upp de toasts som i dag bara är text, som "Tom krok. Rune lånade elementnyckeln
   1998 …"? Mitt förslag: nej, toasts förblir text.
8. Ska musiken ersätta det genererade pianot helt, eller ska man kunna välja i inställningarna?

## Källor

- Seinfeld-spelet: `../nothing_and_run__seinfeld/tools/voices.mjs` och `tools/voices.json`,
  `docs/phase2-reports/voices.md` (generering, kostnad, mätvärden) och
  `docs/phase3-reports/fix-a.md` avsnitt 4 (röstkön och mätningen av avklippta repliker),
  README-avsnittet "Voices".
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
