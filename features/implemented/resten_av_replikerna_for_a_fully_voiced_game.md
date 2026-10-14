# Resten av replikerna

> **Status: byggd 2026-10-11.** Alla roller har nu röst utom barnen (Sara, Nasanin och
> barnstatisterna), som mumlar och fnissar som förut. Statisterna, förarna och fönsterropen pratar
> med en pool av tolv röster. Alla klipp gjordes den 11 oktober, före rabattens sista dag. Vad som
> gjordes, vilka röster som valdes och varför, vad det kostade och vad utvecklaren kan vilja byta
> står i "Det här gjordes". Uppgiften som den skrevs står sist.

## Det här gjordes (2026-10-11)

Utvecklaren var borta. Rösterna valdes därför på mätvärdena och beskrivningarna, enligt
instruktionen. Jag kan inte lyssna. Alla kandidater ligger på provlyssningssidan
(`make voice-review`, http://127.0.0.1:8795/), och där byter man röst med ett klick.

Samma regler som för första versionen:

- bara färdiga röster ur Voice Library, som inte tar någon röstplats
- inga designade röster, ingen uppgradering och inga röster borttagna från kontot
- ingen ny musik

### Rollerna

Varje roll fick fyra kandidater ur Voice Library. Urvalet gjordes på etiketterna (modersmål,
kön, ålder, dialekt, avgift 1×) och på röstens eget svenska provklipp, som går att hämta gratis och
mättes lokalt. Varje kandidat läste sedan rollens egna repliker med `eleven_v4`, 119–217 tecken.
Det kostade 576 credits för 24 provläsningar.

| Roll | Röst (Voice Library) | Etikett | Varför | Andra kandidater på sidan |
|---|---|---|---|---|
| **Anita** | Karin – Steady and grounded (`2z4pujvcLHrr5ilDhLnD`) | kvinna, medelålder, standard | Voice Library har ingen äldre kvinna och ingen norrländsk kvinna. Av de mjuka och varma rösterna har Karin lägst tonhöjd på provet (205 Hz mot 208–217), vilket låter äldst. "Mjuk, pålitlig ton" | Signe (varm, inbjudande), Marie, Maria |
| **Rune** | Robert – Mature, Calm (`Cu8zBLZATMEvxva2xzc3`) | man, **gammal**, skånsk | den enda svenska rösten märkt "gammal", och den långsammaste (9,3 tecken/s). Runes repliker är mest enstaka ord ("...Saab.", "Hm."), så dialekten hörs knappt | Mathias (göteborgsk, medelålder), Paul Axel (djup, lugn), Sovn (ung, halländsk) |
| **Jimmy** | Peter – Natural and Engaging (`oJEeOXECH9V31Oci9WHK`) | man, medelålder, **skånsk** | skånska som i förslaget. Störst tonomfång av kandidaterna (119–422 Hz), vilket passar "glad och rund". Taligenkänningen hörde provet helt rätt | Martin (skånsk, Helsingborg), Niels Joaquin (skånsk), Andreas – Natural (göteborgsk, ung) |
| **Adrian** | David (`UzJFCns81AYkRdrnw0ql`) | man, ung, standard | **alternativ A** (ung, rikssvenska). Ljus och ivrig på provet (244 Hz, 106–316). B, en multietnisk ungdomsmelodi, finns inte i Voice Library: rösterna med arabisk brytning (Rami, Tarek) är en utländsk brytning, inte en svensk ungdomsvarietet | Simon (ung, västgötsk), Rami (arabisk brytning), Tarek (arabisk brytning) |
| **Anders** | Tommy Thunstroem – Warm and Informative (`6eknYWL7D5Z4nRkDy15t`) | man, medelålder, **stockholmsk** | beskrivs som "Stockholm-esque". Brett tonomfång (77–205 Hz), vilket passar "slipad, säljartrevlig" | Adam Composer (len, resonant), Christer, Zébulon (alla stockholmska) |
| **Vita skjortan** | Stefan – Calm & Instructive (`OK5EmHXWwHrd5FnZlPcs`) | man, medelålder, standard | rikssvenska. Smalast tonomfång av kandidaterna (120–265 Hz), alltså den plattaste, och "lugn och instruerande" är myndighetssvenska | Henrik, Sven, David (alla standard) |

Patrick (Filip) och Parvaneh (Setareh) behöll sina röster från första versionen.

### Statisterna: poolen

- **Tolv röster:** kvinnor och män, var och en i tre åldrar, två röster i varje grupp.
- **Brytning:** sju av dem har ett annat modersmål (finska, arabiska, polska, kroatiska) och talar
  svenska med det, som i en svensk förort. Det är fler än förslagets "några". Förklaringen är att
  de mognaste rösterna, som de äldre grupperna behövde, finns bland dem. Varje sådan plats har en
  svensk röst bland alternativen på sidan.
- **Valet:** poolrösterna provlästes inte för pengar. De valdes på röstens eget svenska provklipp
  (gratis): tonhöjd, tempo, beskrivning, och att taligenkänningen hörde svenska. Därefter gjordes en
  pilot med tre repliker per röst.
- **Bytet efter piloten:** Marie var först tänkt som äldre kvinna 1. Hon ropade ljusast av alla
  kvinnor på två av tre repliker, så hon byttes mot Kaisa.
- **De äldre rösterna** har `speed: 0.92`. Voice Library har bara två svenska röster märkta
  "gammal": Robert (Rune) och Tomasz Z. Resten är de mognaste medelålders rösterna.

| Grupp (ålder i spelet) | Röst 1 | Röst 2 |
|---|---|---|
| kvinna 13–34 | Saga – Content & Ads (svenska, "tidigt 20-tal") | Leila – Silky and Warm (arabiska som modersmål) |
| kvinna 35–64 | Louise – Warm and Friendly (stockholmska) | Ivana – Calm, Slow & Friendly (kroatiska som modersmål) |
| kvinna 65+ | Kaisa – Strong and authoritative (finska som modersmål) | Beatrycze – Calm & Mature (polska som modersmål) |
| man 13–34 | Simon (västgötska) | Rami – Friendly and Easygoing (arabiska som modersmål) |
| man 35–64 | Henrik – Calm and composed (standard) | Aapo – Friendly and approachable (finska som modersmål) |
| man 65+ | Tomasz Z – Expressive and Deep (polska som modersmål, märkt "gammal") | Andreas – Swedish, Deep, manly, calm (standard) |

Varje poolröst har två eller tre alternativ på provlyssningssidan, med sina gratis provklipp.

- **Hur en statist får sin röst** (`voice.voiceFor`, `src/voice.js`):
  - Statisten får en röst ur sin grupp, alltså sitt kön och sitt åldersband: 13–34, 35–64 eller 65+.
  - Vilken röst i gruppen avgörs av statistens eget slumpfrö (tonhöjden ur `randomPed`), så samma
    person låter alltid likadant.
  - Barn under 13 mumlar och fnissar.
  - En bil pratar med sin förares röst. Har bilen bara en sittande byst (trafiken och smitarna)
    gäller bystens röst. Vita skjortans byst pratar med hans egen röst.
  - Ett fönsterrop får en röst i 35–64 eller 65+, vald efter husets läge.
  - Poolen står i `assets/voice/index.json` som `_pool`, så den som byter en röst behöver inte röra
    spelets kod.
- **Vilka repliker varje poolröst har:** `// @voice`-taggarna i `script.js` säger vem som kan säga
  en tabell, och verktyget läser dem.
  - `ped` (vuxna 19–64) ger de unga och de medelålders rösterna.
  - `ped_teen` ger de unga rösterna.
  - `ped_old` ger de äldre rösterna.
  - `driver` (alla åldrar, `randomPed`) ger alla poolröster.
  - `window` ger de medelålders och äldre rösterna.
  - `cast` ger alla grannar, och ett rollnamn ger den rollen.

  Därför har till exempel Parvaneh, Jimmy och Anders egna klipp av "Kör som folk, Ove!" (`SHOVED`).
  Det blir 63–68 repliker per poolröst, ungefär 1 050–1 150 tecken.

### Barnen

(**Inaktuellt sedan 2026-10-15:** barnen har röster nu, vuxna röster gjorda pipiga, och `ped_kid`
är fyra poolröster: `features/implemented/barnroster.md`.)

Sara, Nasanin och barnstatisterna (`ped_kid`, en egen roll med `"mumble": true`) mumlar och
fnissar som förut. Voice Library har inga barnröster: ElevenLabs tillåter dem inte, och bland de
61 röster som har svenska som modersmål finns ingen. Det finns alltså ingen trovärdig barnröst att
välja.

### Dialektomskrivningar

Bara en replik skrevs om, och bara där rösten verkligen har dialekten:

- **Jimmy (skånsk röst):** "Ove! Flickorna undrar om de får äta glass…" blev "Ove! **Töserna**
  undrar om de får äta glass…" (tös = flicka på skånska). Undertexten är samma text. Resten av hans
  repliker är redan neutrala och fungerar på skånska.
- **Rune (skånsk röst):** säger bara enstaka ord, så där fanns inget att skriva om.
- **Anders (stockholmsk):** Östermalm sitter i tonen, inte i orden. Hans repliker är formella
  föreningsrepliker, så en omskrivning hade blivit en karikatyr.
- **Övriga roller:** rösterna är standardsvenska, så inget skrevs om.

### Verktyget

- **`scope` är borttaget** ur `cast.json`, så `make voice` gör allt.
- **De delade tabellerna expanderas:** en rad med en pseudotalare (`ped`, `driver`, `window`,
  `cast`) görs för varje röst som tabellens `@voice`-tagg pekar ut (`speakersFor`, `POOL_AGES`).
  Manifestet har klippen under röstens nyckel (`ped_f_old_1` och så vidare) och grupperna under
  `_pool`.
- **Poolrösterna** är vanliga roller i `cast.json` med `"pool": { "sex", "age" }`. Barnstatisterna
  är rollen `ped_kid` (`"mumble": true, "extra": true`; `extra` håller den utanför `cast`).
- **409 `already_running`:** en Voice Library-röst läggs till på kontot vid sitt första anrop. Två
  samtidiga anrop med samma nya röst gav 409 (inget gjort, inget debiterat), och första körningen
  stannade där. Nu väntar verktyget och frågar igen, högst tre gånger.
- **Provlyssningssidan** visar poolens repliker röst för röst, och statistens grupp på rollkortet.

### Kostnad (uppmätt: varje anrop loggar `character-cost`)

| Vad | Credits |
|---|---|
| provläsningar: 24 kandidater (6 roller × 4), 119–217 tecken var | 576 |
| ett prov av `speed: 0.92` för de äldre poolrösterna (en replik) | 2 |
| pilot: 6 repliker per ny roll och 3 per poolröst, med 3 automatiska omtagningar (76 anrop) | 307 |
| huvudomgången: 994 repliker, 20 527 tecken | 2 741 |
| omtagningar efteråt (1 automatisk, 5 för hand och 2 automatiska av dem) | 17 |
| **summa** | **3 643** |

- **Pris:** `eleven_v4` kostade **0,134 credits per tecken** med rabatten (2 741 / 20 527).
- **Mot taket och uppskattningen:** summan ligger under taket på 6 000, men över uppskattningen
  (3 000–3 500). Två saker drog över:
  - **Poolen:** tolv röster med 63–68 repliker var blev 13 300 tecken, ungefär 1 780 credits.
  - **Provläsningarna:** 576 credits.
- **Barnens repliker** kostade inget, eftersom de mumlas.
- **Fullpriset** efter 12 oktober är inte uppmätt. En omgång av samma storlek till v3-priset (1
  credit per tecken) hade kostat ungefär 20 500 credits.
- **Saldot** syns inte, eftersom nyckeln saknar `user_read`. Kontots sida har de exakta siffrorna.

### Vad som röstsattes

Räknat ur `assets/voice/index.json` och `allLines()`:

- **Manuset:** 490 repliker och 15 114 tecken (två färre än förut: "Flickorna" blev "Töserna").
- **Klippen:** de delade tabellerna görs en gång per röst, så det blir 1 295 rader. 1 231 av dem har
  klipp (1 064 nya). 63 är barnens och mumlas, och Runes "..." är tyst.
- **Ljudet:** 41 minuter tal. `assets/voice/` växte från 3,3 MB till 23 MB, med samma format som
  förut: mono-mp3, 64 kbps, −20 LUFS.

| Röst | Klipp | Tal | Tempo (tecken/s) |
|---|---|---|---|
| Ove | 149 (inga nya) | 5,4 min | 11,2 |
| Anita | 53 | 2,8 min | 12,1 |
| Parvaneh | 54 (46 nya) | 2,8 min | 12,1 |
| Patrick | 39 (29 nya) | 2,4 min | 11,6 |
| Jimmy | 43 | 1,9 min | 11,6 |
| Adrian | 36 | 1,6 min | 11,4 |
| Anders | 28 | 1,5 min | 11,9 |
| Vita skjortan | 26 | 1,1 min | 11,9 |
| Rune | 11 | 0,2 min | 7,1 |
| poolen, 12 röster | 63–68 var, 790 i allt | 1,7–1,9 min var | 9,6–11,0 |

### Kvalitetskontrollen och granskningslistan

- **Automatiska omtagningar:** 4 tagningar underkändes och gjordes om automatiskt:
  - Anders "Vorsprung durch Technik, Ove!", två gånger
  - Sagas "Ha det, farbror!" (hördes som "Ta det")
  - Henriks "Lugna ner dig!"

  Sedan gjordes 5 om för hand, med regi (se nedan).
- **Granskningslistan har 82 tagningar.** 12 är från första versionen (11 av Oves och Patricks
  "IT-konsult"). Av de 70 nya är:
  - **51 korta rop** som aldrig underkänns automatiskt: "Aj!", "Oj!", "Ove!", "Akta!" och
    "Aj, Ove!", i alla röster som säger dem. Taligenkänningen hörde nästan alla rätt, men bara
    "pace" (korta klipp) satte dem på listan. Avvikande: "Ove!" hördes som "över", "Ave", "OV" och
    "Av." hos några röster med brytning, och hos Parvaneh.
  - **Brytning eller taligenkänningen:**
    - "Se upp!" hördes som "Sätt upp!" hos Aapo och Kaisa, båda finska.
    - "Chilla!" hördes som "chelle" hos Leila.
    - "Pensionärer!" hördes som "pensionära" ×3.
    - "Tyst därute!" hördes som "Tyst är ute".
    - "Tjena, Saab!" hördes som "SAB", och "Akta dig!" som "ACTA DIGG".
  - **Upprepningar som Whisper stryker:** "Polis! Polis!" och "Jag mår bra. Jag mår BRA." hördes
    en gång. Klippen är lika långa som de godkända tagningarna i de andra rösterna, så båda delarna
    finns med.
  - **Parvanehs två versalrop**, "OVE! BILEN! NU!" och "Kör, Ove! KÖR!":
    - Versalerna lästes fel: de hördes som "Ove, bilen, moon" och "Korv och vekorv".
    - De gjordes om med regin `[shouts] Ove! Bilen! Nu!` och `[shouts] Kör, Ove! Kör!`. Det är samma
      ord, så undertexten stämmer.
    - Efteråt hördes de som "Ave! Billan! Nu!" och "Kör och väp! Kör!". Det är troligen hennes
      uttal av "Ove". Andra versalrepliker, som "Gasa, Ove! GASA!" och "Han skulle sätta upp EN
      stjärna", hördes rätt.
  - **Parvanehs "Aj, Ove!"** gjordes om, och "Aj" hörs fortfarande inte.
  - **Anders tyska "Vorsprung durch Technik"** kan den svenska taligenkänningen inte höra. Repliken
    har en anteckning i `lines.json`.
  - **Runes "...BMW." och "...Hm."**
- **Ivanas omtagningar:** hennes "Galning!" (hördes först som "Geining") godkändes efter
  omtagningen. Hennes "Ove!" ligger kvar på listan.

### Det som gick snett under körningen: disken blev full

Datorns disk (863 GB) blev full under körningen: 4 MB kvar, och vid ett tillfälle 1,4 MB. Det
berodde inte på den här featuren. Mina filer tog ungefär 200 MB, och andra processer (bland annat
modellnedladdningar och webbläsar- och GPU-cachar) åt resten.

- **Huvudomgången dog två gånger** under efterbehandlingen. Alla tagningar var redan hämtade och
  betalda, så inget behövde göras om för pengar.
- **Ändringar i `voice.mjs` efter det:**
  - Det taligenkänningen hörde och omtagningarna sparas innan efterbehandlingen börjar.
  - En tagning som redan har lyssnats på lyssnas inte på igen.
  - Den temporära wav-filen ligger i `/dev/shm`.
  - Ett klipp som ffmpeg lämnar tomt ger ett fel. Ett klipp på 0 byte hann skapas en gång och togs
    bort.
- **`voice.mjs qc`** lyssnar nu bara på tagningar som saknar ett utlåtande. Den första körningen
  hann aldrig skriva `qc.json`, så 358 tagningar saknade utlåtande. `--all` lyssnar på allt.
- **Råtagningarna och provläsningarna** (`.cache/voice/raw`, 51 MB, och `.cache/voice/cast`, 17 MB)
  ligger tills vidare i `/dev/shm/saab_voice_hold/`, med symlänkar från `.cache/voice/`. Det
  frigjorde plats för klippen och för commiten.
  - Försvinner de (vid omstart: `/dev/shm` ligger i minnet) fungerar spelet ändå. Det som går
    förlorat är möjligheten att efterbehandla om utan nya anrop (`make voice REPROCESS=1`) och
    provläsningarnas ljud på provlyssningssidan.
  - Flytta tillbaka dem när disken har plats:
    `rm .cache/voice/raw .cache/voice/cast && mv /dev/shm/saab_voice_hold/{raw,cast} .cache/voice/`.
- **Testerna** körde med Chromes profil och skärmbilder i `/dev/shm` (`TMPDIR`, `OUT`).

### Tester

Alla körningar var headless, på egna portar (8856, 8858, 8860), och med Chrome tystat
(`--mute-audio`). Inget webbläsarfönster öppnades.

- **`story`, rösterna av:** `#7 idle stage 7`, `hud watch: 2730 samples, 0 leaks`, `no errors`.
- **`vstory`, alla sju dagarna med rösterna:** `#7 idle stage 7`, `hud watch: 4771 samples, 0
  leaks`, `no errors`.
  - 123 repliker begärda och 122 sagda, 120 av dem med klipp och 1 struken.
  - **2 avklippta (1,6 %):** Oves "Jaså. Här ska vi stå, minsann." (sägs när han börjar skriva en
    felparkering) med 0,7 s osagt, och Anitas "Ove, elementet klickar igen..." på dag 7 med 0,7 s
    osagt. Den senare lades på när Ove kom fram, som det är tänkt (samma som i första versionen).
  - 0 gånger två röster samtidigt, 0 radiotoasts som försvann för tidigt och 0 repliker utanför
    script.js.
- **`vcut`, alla sju dagarna (`TO=7`) i mänsklig takt, och sedan ett misslyckat race med omstart:**
  `#7 idle stage 7`, `hud watch: 5108 samples, 0 leaks`.
  - **Dag 1–7:** 124 repliker begärda och 121 sagda, 118 av dem med klipp och 3 strukna.
    - **1 avklippt (0,8 %):** Saras "Ove! Får katten sova i min säng?", som mumlas.
    - 0 bubblor avklippta av 14, och 0 gånger två röster samtidigt.
    - 0 radiotoasts som försvann för tidigt, och 0 repliker utanför script.js.
  - **Misslyckandet och omstarten:** 8 repliker, alla med klipp, 0 avklippta och 0 överlappande.
  - **Körningen räknade 1 fel:** en 404 när dag 7 började. Under körningen tog jag bort Parvanehs
    gamla tagning av "OVE! BILEN! NU!" (en dag 7-replik), och sidan hade det gamla manifestet
    laddat.
  - **Omkörningen mot det slutliga manifestet:** `#7 idle stage 7`, `hud watch: 5127 samples, 0
    leaks`, ingen 404.
    - Dag 1–7: 121 repliker begärda och 121 sagda, 119 av dem med klipp och 0 strukna.
    - **1 avklippt (0,8 %):** Anitas samtal på dag 7, som läggs på när Ove kommer fram.
    - 0 bubblor avklippta av 16, och 0 gånger två röster samtidigt.
    - Omstarten: 8 av 8 med klipp, 0 avklippta.
  - **Men omkörningen gav 2 fel som inte gäller rösterna:** outro-kontrollen på dag 3 och dag 6
    ("anita … shown=false", alltså att Anitas rot är dold eller att hon inte är i läget `normal`).
    - Felen kom efter luftningsscenen (commit 1c19bb3, dag 3, en annan session). Dessutom låg andra
      sessioners ocommittade ändringar i `character.js` och `models.js` i trädet.
    - De två första röstkörningarna, med samma klipp men före 1c19bb3, var rena.
    - `story` med rösterna av och `vstory FROM=2 TO=3` med rösterna på går igenom. Det som skiljer
      `vcut` är läsaren, som trycker Enter efter varje replik och kan hoppa över scenen.
    - Felet är rapporterat till orkestratorn. Luftningskoden är inte ändrad här.
- **`vpool`** (nytt): 34 statister, varav 7 barn som mumlar, 25 trafikförare och 3 fönster.
  - Alla tolv poolröster används.
  - Varje person har en röst av sitt kön och sitt åldersband, och samma röst vid varje anrop.
  - Varje röst har klipp för alla repliker personen kan säga (förare, fönster och grannarnas
    delade repliker ingår).
  - En statists "Är du inte klok?!" spelas som klipp. `no errors`.
- **`voice`** (påhittat manifest, turordning, läppar, duckning): `no errors`.
- **`make voice-check`:** ok, 1 231 av 1 231. Inga föräldralösa klipp.
- **Provlyssningssidan** svarar med 24 roller och 93 scener. Statisternas repliker visas röst för
  röst, och granskningslistan har 82 poster.

### Det här behöver utvecklaren göra eller bestämma

1. **Lyssna** på provlyssningssidan (`make voice-review`, http://127.0.0.1:8795/). Inget av det här
   har hörts av en människa:
   - **Rollerna:**
     - Anita (Karin) mot Signe.
     - Rune (Robert) mot Paul Axel.
     - Jimmys skånska (Peter) mot Martin.
     - Adrian: David (A) mot Rami (närmast B).
     - Anders (Tommy) mot Adam Composer.
     - Vita skjortan (Stefan) mot Henrik.

     "Välj" byter röst. Då blir rollens klipp inaktuella, och `make voice` gör om dem. Till
     fullpris kostar det kanske 1 credit per tecken.
   - **Poolen:**
     - Låter de äldre rösterna (Kaisa, Beatrycze, Tomasz Z, Andreas) gamla nog?
     - Är brytningarna för många? Varje poolplats har två alternativ, minst ett svenskt.
   - **Granskningslistan:** främst Parvanehs två versalrop och hennes "Aj, Ove!", "Se upp!" hos de
     finska rösterna och Anders tyska. "Gör om" tar regi.
2. **Flytta tillbaka** råtagningarna och provläsningarna från `/dev/shm` när disken har plats (se
   ovan).
3. **Barnen** mumlar fortfarande. Riktiga röster kräver inspelningar (väg b i
   `a_fully_voiced_game.md` 4.4).

## Uppgiften (som den skrevs, före bygget)

I featuren `a_fully_voiced_game.md` (nu i `features/implemented/`) röstsatte vi alla Oves repliker
och allt Patrick och Parvaneh säger fram till och med dag 1: 167 av spelets 490 repliker (34 %).
Spela in resten.

Designen, verktyget, uppspelningen och musiken finns redan och beskrivs där. Den här featuren lägger
bara till röster och klipp. Siffrorna nedan är räknade med `allLines()` 2026-10-11, efter att
manuset flyttats till `src/game/script.js` och efter featurerna oppna_garaget, roligare_bilkorning
och tuta_med_bilen (de lade till repliker). `make voice DRY=1 ALL=1` räknar om dem.

### Det som återstår

- **323 repliker, ungefär 10 500 tecken:**

  | Vem | Repliker | Tecken |
  |---|---|---|
  | Anita | 45 | 2 051 |
  | Parvaneh (efter dag 1) | 35 | 1 497 |
  | Jimmy | 32 | 1 269 |
  | Patrick (efter dag 1) | 21 | 1 057 |
  | Anders | 20 | 977 |
  | Adrian | 25 | 946 |
  | Vita skjortan | 18 | 711 |
  | Sara (allt, även småpratet före dag 1) | 18 | 499 |
  | Rune | 9 | 56 |
  | Nasanin (allt) | 11 | 88 |
  | statisterna: `ped` 41, `ped_kid` 8, `ped_old` 4, `ped_teen` 3 | 56 | 822 |
  | förare och smitare (`driver`) | 23 | 428 |
  | fönster (`window`) | 4 | 68 |
  | grannarna i delade tabeller (`cast`) | 6 | 78 |

  - Det är dag 2–7 utom Oves repliker, grannarnas småprat efter dag 1 (`CHATTER`,
    `CHATTER_AFTER`), telefonsamtalen och ärendena, tutans repliker (`HONK_*`) och statisternas
    och smitarnas repliker (`OUCH`, `GETUP`, `CARJACK`, `KICKED`, `SHOVED`, `SHOVED_KID`,
    `PANIC`, `FLEE_LINES`, `CAUGHT_LINES`).
  - Oves repliker i allt detta är redan inspelade.
- **Nya roller att besätta:** Anita, Rune, Jimmy, Adrian, Anders och Vita skjortan (avsnitt 4.1 och
  4.2 där). Patrick och Parvaneh har redan sina röster.
- **Statisternas pool** (4.3 där): `ped`, `ped_kid`, `ped_old`, `ped_teen`, `driver`, `window`.
  `voice.voiceFor(ch)` ger i dag bara `ped` eller `ped_kid`. Den behöver lära sig ålder, kön och en
  röst per statist ur dess slumpfrö (och förarens röst för en bil).
- **Barnen** (4.4 där). Voice Design vägrar barnröster (HTTP 403), och Voice Library har inga. De
  mumlar och fnissar. Vill ni ha riktiga barnröster är det inspelningar (väg b) som gäller.

### Stegen

1. Läs avsnittet "Det här gjordes" i `features/implemented/a_fully_voiced_game.md`: rösterna som
   valdes och varför, kontot (10 av 10 egna röstplatser upptagna, Voice Library tar ingen plats),
   priserna och det som blev kvar.
2. Besätt de nya rollerna med `make voice-cast WHO=anita SEARCH=6` och provlyssningssidan
   (`make voice-review`). Kandidaterna läggs till från Voice Library. Dialekterna i 4.1 finns
   delvis där (norrland, göteborg, skåne, stockholm).
3. Ta bort `scope` i `tools/voice/cast.json`, eller lägg till delar i den.
4. `make voice DRY=1`. Kolla siffrorna. Sedan en pilot per ny roll (`make voice WHO=anita
   LIMIT=3`), lyssna, och sedan `make voice`.
5. Gå igenom granskningslistan på provlyssningssidan.
6. Kör `vstory` och `vcut` (`tools/scenarios/voice.mjs`) på alla sju dagarna.

### Kostnad (grovt)

- **Replikerna:** ungefär 10 500 tecken.
  - Med `eleven_v4` i dag (rabatt till 12 oktober, uppmätt 0,13–0,14 credits per tecken) blir
    det ungefär 1 500 credits.
  - Till fullpris (inte uppmätt; v3 kostade 1 credit per tecken) blir det ungefär 10 500 credits.
- **Statisternas varianter:** ungefär 1 400 tecken per poolröst, gånger antalet röster.
- **Omtagningar:** några procent. Taligenkänningen körs lokalt och är gratis.
