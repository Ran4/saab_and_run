# Saab & Run — En man som heter Ove

*Simpsons: Hit & Run*, fast baklänges. Här är det inte du som skapar kaos: du är Ove, 59 år,
självutnämnd ordningsvakt i ett svenskt radhusområde en kall dag i slutet av november. Du
patrullerar området i din Saab 900 och skriver upp felparkerade bilar i blocket, jagar smitarna
som drar iväg när du börjar skriva och håller ordningen uppe. Men grannarna avbryter dig hela
tiden. Släpkärran, elementet, katten, sjukhuset. Ove muttrar och hjälper till. Han säger aldrig
varför.

Ett fanprojekt i three.js (vanliga ES-moduler, inget byggsteg), realistiskt renderat: låg vintersol,
nysnö, riktiga texturer.

## Starta

```sh
make run           # installerar beroenden vid behov, startar http://127.0.0.1:8790 och öppnar sidan
```

Klicka på **Spela** (eller tryck Enter eller mellanslag, eller A eller Start på handkontrollen). Finns
det ett sparat spel står det **Fortsätt** (med dagen du är på, eller *Fri patrull* när alla sju dagarna
är klara), och
**Nytt spel** under knappen börjar om (två klick: det sparade spelet raderas). **Kontroller** visar
tangenterna. `make serve` startar bara servern, `PORT=9000 make run` väljer en annan port.
Modulerna kräver en HTTP-server: `file://` fungerar inte. Typsnitten ligger inbäddade, så spelet
behöver inget nätverk.

URL-val: `?fresh` struntar i det sparade spelet, `?mission=N` börjar på dag N+1 (0–6), `?q=auto`,
`?q=high` eller `?q=low` väljer grafiknivå (`?lowgfx` = låg).

**Röster och musik.** Ove pratar med riktig röst i hela spelet, och dag 1 är röstsatt (Patrick
och Parvaneh också; barnen mumlar och fnissar). De andra mumlar som förut tills deras repliker är
inspelade, och textningen syns alltid. Ingen pratar i munnen på någon: repliker väntar på sin tur. Musiken är
komponerad (tema, patrull, ärenden, jakt, racet, Vita skjortan) med det genererade pianot emellan.
**Röster** och **Röstvolym** i pausmenyn stänger av rösterna (då blir det mummel) och sänker dem.

**Grafik** i pausmenyn växlar Auto → Hög → Låg. Auto är förvalt: spelet väljer själv efter datorn
(låg på inbyggda och svaga grafikkretsar, och det går ner till låg om bildfrekvensen blir för låg) och visar
vad det valde, "Auto (Hög)" eller "Auto (Låg)". Valet sparas.

## Kontroller

| tangent | till fots | i bil |
|---|---|---|
| W A S D / pilar | gå | köra, styra (S backar när bilen står still) |
| Mus | titta | titta |
| Shift | spring | |
| Mellanslag | hoppa (ett litet hopp) | handbroms: sladden håller i sig när du släpper (se nedan); med gas och ratt snurrar bilen runt på stället |
| E | prata, kliva in, öppna/stänga garageporten, interagera (håll) | kliva ur |
| F | anteckna felparkering (håll) | anteckna felparkering (håll, rutan nere, i krypfart) |
| J / klick | sparka (på däcket) | |
| T / H | | tuta (folk märker det, se nedan) |
| B | | titta bakåt (bra när man backar med släp) |
| M | stor karta | stor karta |
| N | ljud av/på | ljud av/på |
| R | fast? tillbaka till vägen | fast? tillbaka till vägen |
| Esc / P | paus (med Oves anteckningsbok) | paus |
| Q | ge upp efter ett misslyckat uppdrag; håll Q för att avbryta ett pågående | ge upp efter ett misslyckat uppdrag; håll Q för att avbryta ett pågående |

En handkontroll fungerar också (A hoppa/handbroms, B anteckna, X sparka, Y interagera, avtryckarna
gasar och bromsar, L3 eller RB tutar, Start paus, B ger upp efter ett misslyckat uppdrag). En handkontroll utan analoga
avtryckare kör med vänster spak: framåt gasar, bakåt bromsar. Pausmenyn har också **Avbryt dagens
uppdrag**. Spelet pausar när fliken döljs eller fönstret tappar fokus. Hinner datorn inte med 30
bilder i sekunden går hela spelet lite långsammare: tidsgränserna blir inte kortare för det.

## Spelet

- **Saaben** står framför Oves garage vid boendeparkeringen, söder om radhusen (gå ut mot
  Solrosvägen). Går den sönder står det en ny där när du kommer tillbaka.
- **Garageporten.** Ställ dig framför Oves garageport och tryck **E** för att öppna eller stänga den.
  Det går inifrån garaget också. Ove lyfter i handtaget och kliver undan när porten svänger ut. När
  han stänger når han upp till kanten, drar ner porten och rycker sedan tre gånger i handtaget för
  att se att den verkligen är stängd. En stängd port släpper varken in eller ut Saaben, och det står
  i bilen när du kör fram till den. Porten går inte igen om en bil står i vägen. Den står öppen från
  början, och spelet kommer ihåg hur du lämnade den.
- **Köra på vinterväg.** Det är halt ute, och i fart (från ungefär 30 km/h, fullt ut från 80) släpper
  bakvagnen före fronten. Ratten tar skarpt, och bilen vill gärna svänga runt mer än du bett om.
  Håller du ratten länge i en sväng kommer bakvagnen ut och bilen sladdar av sig själv. Det går
  fortare om du släpper gasen i svängen. I de bakhjulsdrivna bilarna (Volvo 240 och 740, BMW:n,
  skåpbilen, bussen och sopbilen) räcker det att gasa, och gasen håller sedan sladden vid liv. Saaben
  och Golfen ligger stadigare med gasen i botten och drar sig själva raka när du släpper ratten. Fånga
  sladden genom att styra åt andra hållet (motstyra). Trampar du på bromsen låser hjulen (bilarna har
  inget ABS): bilen glider rakt fram i sin bana i stället för att vrida sig, och en sladd rätar upp
  sig. En sväng åt ena hållet och sedan snabbt åt det andra (en skandinavisk pendelsväng) slänger ut
  bakvagnen åt andra hållet. **Sladd med handbromsen:** dra i handbromsen (Mellanslag) med ratten åt
  något håll, så släpper bakvagnen, och sladden håller i sig när du släpper handbromsen. Ratten
  bestämmer hur snett bilen står: åt samma håll som svängen blir vinkeln större, åt andra hållet
  (motstyrning) rätar bilen upp sig. Gasen gör olika i olika bilar. I en bakhjulsdriven (en 240!)
  håller gasen sladden vid liv, och du får motstyra dig ur den. I en framhjulsdriven (Saaben, Golfen)
  drar gasen bilen rak, så där släpper du gasen för att sladda längre. Audin ligger mittemellan.
  Handbroms, gas och fullt rattutslag när bilen nästan står still: bilen snurrar runt på stället (en
  bakhjulsdriven kring framaxeln, Saaben kring bakaxeln). Ove har en åsikt efteråt.
- **Tutan** (**T** eller **H**, handkontrollens L3 eller RB). Varje bilmärke har sin egen tuta, och
  stan reagerar. Den som står framför bilen får en chock: händerna i luften, ett skrik och ett skutt
  ut ur vägen (en pensionär kliver undan så fort det går, Parvaneh också: hon är gravid). Sedan
  vänder de sig om och säger vad de tycker, en del med knytnäven i luften. Barnen hoppar också, men
  de vill att du tutar igen. Grannarna svarar som de är: Patrick hoppar undan fast han inte står i
  vägen, Jimmy och Adrian vinkar, Anders citerar reglerna, och Rune, som nästan aldrig säger något,
  känner igen bilen på tutan ("...Saab."). Bilisterna tutar tillbaka med sina egna tutor och har en
  åsikt, bilen framför gasar på lite, och en annan Saab hälsar med två tut. En smitare som sitter
  kvar i sin felparkerade bil blir skrämd och drar, och en smitare du jagar blir nervös och ger upp
  fortare. Den du ska hämta med bil kommer ut när du tutar. Katten vid Oves dörr skuttar högt, och
  Ove ber den om ursäkt. Tutar du i onödan (ingen framför bilen, ingen bil framför) blir det
  **Onödig tutning**: −2 Ordning, och Anders eller någon i ett fönster säger ifrån. Och prova att
  tuta *shave and a haircut*.
- **Patrullen.** Ett halvdussin felparkeringar finns alltid någonstans: bil i bilfritt område, på
  gräsmattan, uppe på trottoaren, på handikapplatsen, framför soprummet, på räddningsvägen... De syns
  som P-förbud på kartan och med en skylt över bilen. Gå fram och håll **F**: Ove skriver i blocket
  (Reg.nr, Plats, Tid, Överträdelse) och stämplar ANMÄLD. +7 Ordning, +10 kr. Gå inte iväg, och
  svara inte i telefon mitt i.
- **Smitare.** Ibland sitter föraren kvar i bilen och gasar iväg när Ove börjar skriva. Ta en bil,
  knuffa till smitaren eller håll dig tätt bakom tills den ger upp: **TAGEN!** Tappar du den: **SMET!**
- **Ordning i området.** Mätaren uppe till höger sjunker med varje felparkering som står kvar, och
  med allt Ove själv ställer till med: kör inom området (−1 Ordning i sekunden, det står nere i
  mitten så länge bilen är där), har sönder saker, kör på folk. Går den till noll blir det **KAOS I
  OMRÅDET** och extra föreningsmöte. Fyller du den: **ORDNING OCH REDA**, +100 kr.
- **Avbrott.** Telefonen ringer. Anita, Parvaneh, Jimmy, Adrian, Patrick... Det klickar i
  elementet, någon har låst sig ute, katten har rymt, Rune har rullat iväg. Hjälp till innan
  tålamodet tar slut. Den som följer med Ove går i hans spår. De nya grannarna ringer först när de
  har träffat Ove, och en del ärenden dyker upp först senare i veckan.
- **Till fots** går Ove, går raskt och sparkar på däck. Han har åsikter om de flesta bilmärken.
- **Kronor och samlarsaker.** Pantburkar (1 kr), belöningar, sju Saab-emblem och sju av Sonjas
  fotografier gömda i stan. Allt Ove har sönder betalar han själv.
- Spelet sparas automatiskt i webbläsaren (efter varje anmälan, ärende, samlarsak och dag, och var
  30:e sekund). Laddar du om mitt i en dag börjar dagen om, men grannen fattar sig kort. Pausmenyn kan
  radera det sparade spelet.

### Sju dagar

Varje dag har en granne något Ove måste hjälpa till med. Grannen står vid sitt hus med en
markering över huvudet; gå fram och tryck **E**. Nästa dag börjar när du har patrullerat en stund
(tre anmälningar till, eller en och en halv minut utan ärenden). Dagen varar från halv elva till
halv tre.

1. **Släpkärran** – de nya grannarna kan inte backa med släp.
2. **Sjukhuset** – en stege, en adventsstjärna och någon som inte har körkort.
3. **Elementet** – det klickar i elementen hos Anita och Rune.
4. **Katten** – en katt i snön. Ingens katt.
5. **Saab, inte Audi** – Adrian ska köpa bil. Anders har åsikter.
6. **Vita skjortan** – kommunen har kommit med papper.
7. **Värkarna** – alla ringer på en gång.

Går ett uppdrag snett: **E** försöker igen (ett förlorat race börjar om vid startlinjen), **Q** ger
upp så länge (grannen väntar, och nästa gång blir det kort). Ett pågående uppdrag ger man upp genom
att hålla **Q** en sekund, eller med **Avbryt dagens uppdrag** i pausmenyn. Katter fångar man inte genom att springa
efter dem.

## Kodkarta

```
index.html, style.css      sidan, HUD-stilar, titel- och pausskärm (typsnitten inbäddade)
src/main.js                Game: bygger världen, fast tidssteg, tangenter -> Ove eller bilen, grannarna,
                           händelser, sparning, berättelsens spår i världen (gips, katt, Adrians Saab)
src/gfx.js                 PBR-renderaren: ytor, triplanara texturer, snö, skuggor, AO, dimma, GeoBuilder
src/input.js, audio.js     tangentbord/mus/handkontroll; ljudet: syntetiserade effekter (Saab-motor, telefon),
                           röstkedjan (lägen, duckning) och musikregissören (komponerade stycken, pianot)
src/voice.js               rösterna: klippen, turordningen (kön), mummel när klipp saknas, läppsynken
src/game/script.js         manuset: alla repliker som sägs högt, som ren data (allLines())
src/world/                 stadsplan och vägnät (layout), kollision, kvarteren (town, ove, rowhouse,
                           buildings, places, streets, outskirts), skyltar, rekvisita, Oves garageport
                           (garagedoor)
src/actors/car.js          bilarna: fysik, lampor, registreringsskyltar (carmodels.js: modellerna)
src/actors/trailer.js      släpkärran
src/actors/drivers.js      AI-förare: trafik, rutt, jakt, flykt, stanna vid kanten
src/actors/models.js       människorna (och katten); character.js: fysik till fots; peds.js: fotgängare
src/actors/pickups.js      pantburkar, emblem, fotografier, saker att hämta
src/game/patrol.js         felparkeringar, anteckningsblocket, smitare, Ordning-mätaren
src/game/interruptions.js  avbrotten: samtalen och ärendena
src/game/stages.js         byggstenarna för ärenden och uppdrag (parkera, anteckna, hämta, skjutsa, jaga...)
src/game/horn.js           tutan: vad folk, bilister, grannarna, smitarna och katten gör när Ove tutar
src/game/missions.js       de sju dagarna och uppdragskörningen
src/game/hud.js            HUD, karta, dialog, porträtt, anteckningsbok
src/game/camera.js, fx.js, markers.js   kameran, partiklar, markeringar
tools/voice/               rösterna: voice.mjs (generering, kontroll), cast.json (rollerna), lines.json (regi),
                           review.mjs (provlyssningssidan), analyze.py (taligenkänning och tonhöjd, lokalt)
tools/music/               musiken: music.mjs och cues.json
assets/voice/, assets/music/   de färdiga klippen och styckena (index.json: manifesten)
tools/shot.mjs             headless-testkörning (scenarier i tools/scenarios/)
tools/gait.mjs             Oves gång, löpning och hopp filmade bild för bild, med mätvärden
```

## Headless-tester

`tools/shot.mjs` startar en egen server, kör spelet i headless Chrome på riktigt grafikkort (inget
fönster) och sparar skärmdumpar i `out/`:

```sh
make test                                   # alla sju dagarna; ska sluta med '#7 idle' och 'no errors'
make test-all                               # dessutom m1, kontrollerna nedan, start, report, pursuit, interrupt, errands
PORT=8791 node tools/shot.mjs m1            # dag 1 med riktiga tangenttryck: backa in släpet
PORT=8791 node tools/shot.mjs m5race        # dag 5:s race med tangenterna: måste vinnas
PORT=8791 node tools/shot.mjs m7chase       # dag 7: Škodan ska hinna ikapp av sig själv
PORT=8791 node tools/shot.mjs m4cat         # dag 4: katten med tangenterna (tålamod, inte fart)
FROM=4 PORT=8791 node tools/shot.mjs story  # berättelsen från dag 5
PORT=8791 node tools/shot.mjs titlecheck quality tabhide gamepad corruptsave   # titel, grafikval, paus, handkontroll, sparfiler
PORT=8791 node tools/shot.mjs titlekeys reloadday r2checks smalltalk dilation    # titeln med tangenter, omladdning, klockan, småprat, tid under 30 fps
PORT=8791 node tools/shot.mjs giveup uiabort uitoasts      # ge upp med Q, pausmenyns Avbryt dagens uppdrag, notiser under scener
PORT=8791 node tools/shot.mjs uipause                      # pausmenyn i 15 fönsterstorlekar: anteckningsboken lika hög som menyn, inget utanför
PORT=8791 node tools/shot.mjs horn                         # tutan med riktiga T-tryck: 19 kontroller (hornlook: närbilder, WHO=adult|kid|old|patrick)
PORT=8791 node tools/shot.mjs voice vcut                   # rösterna: turordning, läppar, duckning; dag 1-4 i mänsklig takt
```

I testerna (`?test=1`) är rösterna avstängda, så de går lika fort som förut; `&voice` slår på dem.

## Röster och musik

Replikerna är genererade i förväg med ElevenLabs (`eleven_v4`, svenska) och incheckade. Spelet
anropar aldrig API:t. Nyckeln ligger i `.env` (`ELEVENLABS_API_KEY`) och används bara av verktygen.

```sh
make voice DRY=1            # vad som skulle göras och vad det kostar, utan anrop
make voice                  # gör klippen som saknas (inom omfånget i tools/voice/cast.json)
make voice-check            # saknas något? (inga anrop)
make voice-review           # provlyssningssidan: http://127.0.0.1:8795/ (byt röst, gör om repliker)
make voice-cast WHO=anita   # provinspelningar av en rolls kandidater (Voice Library)
make music DRY=1            # musiken: samma sak, tools/music/cues.json
```

Ändrar man en replik i `src/game/script.js` mumlas just den tills `make voice` har körts. Mer i
`features/implemented/a_fully_voiced_game.md`.

## Tillgångar och tack

Alla texturer och himlen är CC0 (Poly Haven, ambientCG), se `assets/LICENSES.md`. Typsnitten
Barlow, Barlow Condensed och Caveat (SIL Open Font License 1.1) ligger inbäddade i `style.css`.
Rösterna och musiken är gjorda med ElevenLabs (rösterna från deras Voice Library, musiken med Eleven
Music). Allt annat (modeller, ljudeffekter, pianot) genereras i koden.

Ett fanprojekt, fritt efter Fredrik Backmans roman *En man som heter Ove*. Inte associerat med
Fredrik Backman, förlaget, filmbolagen eller Saab. Inga Volvoägare tillfrågades.
