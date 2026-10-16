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

**Röster och musik.** Alla pratar med riktig röst: grannarna med var sin röst, och de som går
förbi, förarna och den som ropar från ett fönster med en av tolv röster (kvinnor och män i tre
åldrar; samma person låter alltid likadant). Barnen pratar pipigt: ElevenLabs gör inga
barnröster, så vuxna röster läser deras repliker och höjs sedan i tonläge (Sara, Nasanin och fyra
barnröster bland dem som går förbi). Textningen syns alltid. Ingen pratar i munnen på någon: repliker väntar på sin tur. Musiken är
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
| G | | ställ in p-skivan (stående i en p-ruta, se nedan) |
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
- **Hoppbacken i parken.** Den stora snöhögen i parken (väster om Oves område, på andra sidan
  Parkvägen) går att köra upp på och hoppa från. Den är formad som ett hoppbord: en uppfart i var
  ände som blir brantare upp mot kanten, en platt avsats överst och nedfarten på andra sidan, så det
  går åt båda hållen. Ta sats från gatan, eller längre över gräsmattan inifrån parken. För sakta och
  du landar på avsatsen och rullar ner, i lagom fart (runt 45-50 km/h vid kanten) landar du mjukt i
  nedfarten, för fort och du flyger förbi alltihop och tar i hårt. Alla bilar flyger, även med
  släpkärra (släpet dinglar efter, och studsar efter en hård landning). Ove antecknar lufttiden och
  längden, och det längsta hoppet är hans rekord. Efter ett riktigt hopp har han en åsikt, liksom
  passagerarna, folk som såg det och grannarna. Till fots går det att gå upp på högen.
- **Ove är ingen ungdom.** Ungefär ett hopp på fyrtio snubblar han när han landar och går i backen
  som en trasdocka (en ragdoll: kroppen faller av sig själv, händerna ut för att ta emot). I farten
  fastnar en fot och han far framåt, ibland rakt över ända; stående faller han bakåt eller åt sidan,
  och ibland går fötterna undan och han hamnar på rumpan. Han ligger kvar ett ögonblick, reser sig
  (från rygg sätter han sig upp, från magen tar han sig upp på alla fyra) och säger att det var
  meningen, eller att kommunen inte har sandat. Hoppar du ur en bil i fart (**E** i mer än ungefär 15
  km/h) tumlar han längs vägen, längre ju fortare det gick, och bilen rullar vidare utan honom. Blir
  han påkörd flyger han på samma sätt.
- **Snön på bilarna.** De parkerade bilarna har stått ute i nysnön. Tar du en och kör iväg går
  vindrutetorkarna först, och sedan börjar snön lossna: i fartvinden ryker snön från taket, och
  flak släpper och glider av och slår i vägen bakom bilen i ett stänk av snö (i 30 km/h ligger det
  mesta kvar, i 70-90 km/h är taket rent på en halv minut). Gasa hårt och snön blir kvar efter,
  tvärbromsa och den åker fram över rutan, sväng skarpt och den glider av åt sidan. Ett hopp i
  hoppbacken eller en smäll mot en parkerad bil skakar loss mycket; bakluckan, i lä bakom taket,
  behåller sin snö längst. Snöklumparna ligger kvar en stund på vägen.
- **Snöröjningstraktorn.** Föreningens orange traktor står med plogbladet ut mot gången på en
  plats längst in på boendeparkeringen, i änden av garagelängan, och Ove har förstås nyckel: kliv
  in med **E** som i en bil. Den går i högst 40 km/h, kommer långsamt upp i fart men vänder tvärt,
  har fyrhjulsdrift och klackdäck som biter i snön, en egen dieselmotor och en platt liten tuta, och
  det gula ljuset på taket blinkar när motorn går. Den får köra på de bilfria gångvägarna (det
  kostar ingen Ordning: den röjer ju snö), och kör du genom snön kastar plogbladet upp den åt höger.
  Det finns bara en plats i hytten, så ingen kan åka med.
- **Patrullen.** Ett halvdussin felparkeringar finns alltid någonstans: bil i bilfritt område, på
  gräsmattan, uppe på trottoaren, på handikapplatsen, framför soprummet, på räddningsvägen... De syns
  som P-förbud på kartan och med en skylt över bilen. Gå fram och håll **F**: Ove skriver i blocket
  (Reg.nr, Plats, Tid, Överträdelse) och stämplar ANMÄLD. +7 Ordning, +10 kr. Gå inte iväg, och
  svara inte i telefon mitt i.
- **Smitare.** Ibland sitter föraren kvar i bilen och gasar iväg när Ove börjar skriva. Ta en bil,
  knuffa till smitaren eller håll dig tätt bakom tills den ger upp: **TAGEN!** Tappar du den: **SMET!**
- **P-skivan och lapplisan.** Parkeringarna har regler, och det står på skyltarna: två timmar med
  p-skiva 8–18 vid Livs i centrum och vid Kommunhuset, tre vid sjukhuset, tio minuter vid förskolan.
  Står bilen still i en sådan ruta tar **G** fram p-skivan: **Q** och **E** vrider den en halvtimme
  åt gången och **F** lägger den i rutan (**G** lägger tillbaka den). Svenska regler: ankomsttiden
  avrundad uppåt till närmast följande hel- eller halvtimme (16:31 blir 17:00). Medan Ove är borta
  från bilen går lapplisan sin runda, och saknas skivan, är den framställd, har bilen stått för länge
  eller står den på en plats Ove inte har tillstånd för (lastzon, handikapplats, de andra områdenas
  boendeparkering, reserverade platser) sitter det en lapp under torkarbladet. **E** tar den (först
  då går det att kliva in), och den betalas på en gång: 300 kr. Var femte lapp har lapplisan skrivit
  fel på. Då ringer Ove till P-Ordning AB, och det slutar med att de betalar tillbaka.
- **Ordning i området.** Mätaren uppe till höger sjunker med varje felparkering som står kvar, och
  med allt Ove själv ställer till med: kör inom området (−1 Ordning i sekunden, det står nere i
  mitten så länge bilen är där), har sönder saker, kör på folk. Går den till noll blir det **KAOS I
  OMRÅDET**, extra föreningsmöte och 250 kr ur Oves plånbok. Fyller du den: **ORDNING OCH REDA**,
  +100 kr. Varannan pantburk Ove plockar upp ger +1 Ordning.
- **Avbrott.** Telefonen ringer. Anita, Parvaneh, Jimmy, Adrian, Patrick... Det klickar i
  elementet, någon har låst sig ute, katten har rymt, Rune har rullat iväg. Hjälp till innan
  tålamodet tar slut. Den som följer med Ove går i hans spår. De nya grannarna ringer först när de
  har träffat Ove, och en del ärenden dyker upp först senare i veckan.
- **Rune.** Ta tag i rullstolen med **E** och släpp den med **E**. Släpper du den i farten (Shift)
  rullar han vidare en bra bit, och en spark får den att rulla också. Rune har ingen tidsfrist, men
  han blir kallare för varje minut (fem minuter, och mycket fortare ute bortom skogen), och en bil
  i full fart tar livet av honom. Försök igen med **E**, eller ge upp med **Q**: då förblir han död,
  och Anita är förkrossad resten av spelet.
- **Småprat.** Gå fram till en granne och tryck **E**: grannen säger något och Ove svarar på just
  det (Sara får "Nej." på sin snögubbe, och längre fram i veckan något annat). Ibland fortsätter
  det en replik eller två, och ibland svarar Ove bara med huvudet: en nick åt Rune, en långsam
  huvudskakning åt Vita skjortan. Grannarna säger inte samma sak två gånger i rad. Fjärde gången
  inom en minut har Ove fått nog ("Nu har vi pratat.") och låter den grannen vara i 20 sekunder.
  Börjar en granne prata själv när Ove står nära händer det att han svarar.
- **Till fots** går Ove, går raskt och sparkar på däck. Han har åsikter om de flesta bilmärken.
- **Utanför stan.** Det finns inga osynliga väggar längre. Bortom den yttre ringvägen tar skogen vid,
  och fyra skogsgator (snöiga gluggar rakt ut genom skogen, en åt varje håll) leder ut på kullarna.
  Där ute finns bara natur: granar i dungar, stenblock och snö. Och kyla. Trettio meter bortom där
  väggarna stod börjar **köldmätaren** under Ordning-mätaren att stiga: precis vid kanten tar det
  knappt två minuter (112 s) innan Ove fryser ihjäl, och längre ut går det fortare (70 m ut ungefär 28
  s, 140 m ut 12 s). Frosten kryper in från bildkanterna, Ove stoppar händerna i fickorna och huttrar,
  man ser hans andedräkt, tänderna skallrar och vinden tar i. Ute på kullarna yr snön och allt blir
  vitt. När Ove tänker på Sonja är det dags att vända: vägen tillbaka kostar lika mycket kyla som
  vägen ut. Kommer man in igen tinar han (dubbelt så fort i bil med värmen på). Når mätaren hela vägen
  stelnar Ove där han står och faller som en planka i snön (i bilen dör motorn): **Ove dog av frost**.
  Sedan vaknar han med ett ryck i sin egen säng, bredvid Sonjas bäddade sida, säger något (fem
  repliker, aldrig samma två gånger i rad) och släpps ut på gången utanför dörren. Ett pågående
  uppdrag har misslyckats (E försöker igen, Q ger upp), ett ärende släpps utan att det kostar något,
  och en granne som följde med har gått hem. Saaben (eller grannens bil) står hemma igen; en lånad bil
  får stå kvar där ute. Mellanslag hoppar fram när skylten syns, och över scenen i sängen.
- **Kronor och samlarsaker.** Pantburkar (1 kr), belöningar, sju Saab-emblem och sju av Sonjas
  fotografier gömda i stan. Allt Ove har sönder betalar han själv, och det kostar: 25-205 kr för en
  sak, upp till 500 kr i självrisk för en kvaddad bil, 100 kr varje gång Vita skjortan stoppar honom.
  Det han hittat finns under
  **Samlingen** i pausmenyn: fotografierna (vart och ett en egen bild), emblemen, vad Ove tänker om
  dem, var de låg, en ledtråd till dem han inte hittat än, och hur många burkar han pantat.
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
                           (garagedoor), Anitas och Runes kök och Oves sovrum (interior: dag 3:s scen,
                           uppvaknandet); utanför stan: terrängen att gå på, skogsgatorna, granarna
                           och stenblocken (outskirts); snöhögar att köra och gå på, hoppbacken i
                           parken (snowhill)
src/actors/car.js          bilarna: fysik, lampor, registreringsskyltar (carmodels.js: modellerna, också
                           snöröjningstraktorn och plogbladets snö)
src/actors/carsnow.js      snön på de parkerade bilarna: flak som lossnar och yr av när någon kör
                           iväg, snörök i fartvinden, vindrutetorkarna
src/actors/trailer.js      släpkärran
src/actors/drivers.js      AI-förare: trafik, rutt, jakt, flykt, stanna vid kanten
src/actors/models.js       människorna (och katten); character.js: fysik till fots; peds.js: fotgängare
src/actors/ragdoll.js      Ove som trasdocka: när han snubblar, hoppar ur en bil i fart eller blir påkörd
src/actors/pickups.js      pantburkar, emblem, fotografier, saker att hämta
src/game/patrol.js         felparkeringar, anteckningsblocket, smitare, Ordning-mätaren
src/game/interruptions.js  avbrotten: samtalen och ärendena
src/game/rune.js           Runes rullstol som rullar själv, hans död på ärendet, Anitas sorg
src/game/stages.js         byggstenarna för ärenden och uppdrag (parkera, anteckna, hämta, skjutsa, jaga...)
src/game/horn.js           tutan: vad folk, bilister, grannarna, smitarna och katten gör när Ove tutar
src/game/hoppbacke.js      hoppen från hoppbacken: snöpudret, ljuden, Oves anteckning och rekord, vad alla säger
src/game/tracks.js         spår i snön: fotspår och hjulspår (bilar, släpkärran, rullstolen), borta en ny dag
src/game/collection.js     Oves samling: anteckningarna om emblemen, Sonjas sju fotografier (ritade, samma bild i
                           världen och i pausmenyns album) och emblemet som albumet visar det
src/game/missions.js       de sju dagarna och uppdragskörningen
src/game/luftning.js       dag 3:s scen: Ove luftar elementet hemma hos Anita och Rune (och katten tittar in)
src/game/cold.js           kylan utanför stan: köldmätaren, frosten, huttrandet, snöyran, döden av frost
src/game/waking.js         Ove vaknar i sin säng efter att ha frusit ihjäl (scenen och de fem replikerna)
src/game/pskiva.js         p-skivan och lapplisan: parkeringarnas regler, rundorna, lappen på bilen, samtalet till P-Ordning AB
src/game/pskivaui.js       p-skivan i helskärm (ritad efter features/implemented/pskiva.avif) och kontrollavgiften
src/game/hud.js            HUD, karta, dialog, porträtt, anteckningsbok
src/game/camera.js, fx.js, markers.js   kameran, partiklar, markeringar
tools/voice/               rösterna: voice.mjs (generering, kontroll), cast.json (rollerna), lines.json (regi),
                           review.mjs (provlyssningssidan), analyze.py (taligenkänning och tonhöjd, lokalt)
tools/music/               musiken: music.mjs och cues.json
assets/voice/, assets/music/   de färdiga klippen och styckena (index.json: manifesten)
tools/shot.mjs             headless-testkörning (scenarier i tools/scenarios/)
tools/gait.mjs             Oves gång, löpning och hopp filmade bild för bild, med mätvärden
tools/sfx/                 Oves hoppstön: grunts.mjs (ElevenLabs, en logg över kostnaden) och grunts.py (mätningarna)
assets/sfx/                stönen och landningarnas "uff" (fyra av varje, i tur och ordning)
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
PORT=8791 node tools/shot.mjs luft luftskip luftcam luftsound   # dag 3:s scen i köket: en bild per ögonblick, att hoppa över den, kameran hos Anita/Rune, ljudnivåerna
PORT=8791 node tools/shot.mjs smaprat smapratvoice         # småprat med riktiga E-tryck: svaren, fortsättningarna, nicken, "Nu har vi pratat.", med rösterna
PORT=8791 node tools/shot.mjs voice vcut vpool             # rösterna: turordning, läppar, duckning; dag 1-4 i mänsklig takt (TO=7: alla sju); statisternas röster
PORT=8791 node tools/shot.mjs coldwalk colddrive coldback  # kylan med riktiga tangenter: ut till fots och med Saaben (takten mätt på vägen), och in igen när Ove tänker på Sonja
PORT=8791 node tools/shot.mjs coldrate coldmission coldwall coldbed coldbedskip   # 112 s vid kanten, ett uppdrag som misslyckas, väggen för alla andra, sängscenen
PORT=8791 node tools/shot.mjs coldlook coldsound coldperf  # bilder därute, ljuden offline, ritanrop och trianglar (A/B)
PORT=8791 node tools/shot.mjs coldwind                     # ingen vind bakom svart, ett tyst sovrum, vindens stopp offline (ljudbuggen i Firefox)
PORT=8791 node tools/shot.mjs snohog snohogsim             # hoppbacken: sex hopp med riktiga tangenter (bilar, farter, släp; FILM=1), och 64 uträknade
PORT=8791 node tools/shot.mjs snohogwalk snohogsound       # Ove går över hoppbacken; hoppets ljud offline
PORT=8791 node tools/shot.mjs runeroll runekick runecar runecold runewidow   # Runes ärende: släppa och sparka rullstolen, påkörd, ihjälfrusen, Anita utan honom (runelook: närbilder)
QUERY='&runedead' PORT=8791 node tools/shot.mjs story      # berättelsen med Rune död
PORT=8791 node tools/shot.mjs snubbla hoppaur snubblaperf # snubbla vid landningen, hoppa ur bilen i 15-90 km/h, påkörd (riktiga tangenter): aldrig under marken, upp igen; kostnaden (snubblalook: filmremsor)
PORT=8791 node tools/shot.mjs traktor seatlegs             # snöröjningstraktorn med riktiga tangenter: in, ut ur rutan, 40 km/h, gångvägen, plogen, ut (traktorlook, traktorplog: bilder)
PORT=8791 node tools/shot.mjs pskiva pskivarules           # p-skivan med riktiga tangenter, lappen, samtalet till P-Ordning AB; alla regler (pskivalook: bilder, pskivavoice: rösterna)
```

I testerna (`?test=1`) är rösterna avstängda, så de går lika fort som förut; `&voice` slår på dem.

## Röster och musik

Replikerna är genererade i förväg med ElevenLabs (`eleven_v4`, svenska) och incheckade. Spelet
anropar aldrig API:t. Nyckeln ligger i `.env` (`ELEVENLABS_API_KEY`) och används bara av verktygen.

```sh
make voice DRY=1            # vad som skulle göras och vad det kostar, utan anrop
make voice                  # gör klippen som saknas (statisternas repliker en gång per poolröst)
make voice-check            # saknas något? (inga anrop)
make voice-hear WHO=sara    # klippen som de spelas: tonhöjd och vad taligenkänningen hör (gratis)
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
