# Avgrunden

## Önskemålet

Just nu så finns det osynliga väggar runt spelplanen.

Det... funkar ju, men är tråkigt.

Jag tänker mig att man absolut kan åka utanför, men det som händer är att det blir...
kallt. konstigt, visst, men... en köldmätare går långsamt upp.

Är man precis vid kanten av där kölden börjar (typ, 30 meter ifrån där osynliga väggarna finns nu)
så ska det ta 45s innan man dör.

När ove "dör" så visas "Ove dog av frost" på skärmen; sen visas en cutscene där
ove vaknar upp i sin säng och säger något finurligt och ledsamt
(olika varje gång, ha 5 olika saker han säger, välj en slumpmässigt varje gång),
sen spawnar man om utanför dörren.

I spelområdet runtom ska det mest fortsätta som vanligt, men dock inga hus eller så utan bara natur.

## Vad som blev gjort (2026-10-11)

### Utanför stan

- **Inga osynliga väggar.** Ove går och kör förbi där väggarna stod. Alla andra stannar där som
  förut: trafiken, jakterna, racet, smitarna, fotgängarna och grannarna som går med Ove
  (`keepCarsInside` och `keepPeopleInside` i main.js). Racet och jakten kan alltså inte hamna i kylan
  av misstag. En namngiven bil som Ove lämnar därute körs hem när ingen ser den.
- **Marken följer kullarna.** Den platta snön runt stan och kullarnas höjdkarta fanns redan, men bara
  för ögat. Nu går man och kör på dem: `layout.terrain` är kullarnas egen mesh, triangel för triangel.
  Bilen lutar både framåt och åt sidan ute i terrängen (i stan ändras ingenting).
- **Fyra skogsgator** leder ut, en åt varje håll: en gata som fortsätter förbi den yttre ringvägen
  som en snöig glugg rakt ut genom skogen. Plogvallen är öppen där den börjar. Det går också att
  slingra sig mellan träden, för nu har alla stammar i skogsbältet kollision.
- **Bara natur.** Den röda ladan, stugan och gärdesgården är borta. Ute på kullarna står granar i
  dungar. Vid skogskanten står de tätt, längre ut glesnar de, och här och där står en ensam gran mitt
  på ett fält. Där finns också ett sjuttiotal snötäckta flyttblock. Granarna är instansierade, en
  smal gran med tio våningar (cirka 200 trianglar, stammen med kollision). Medan kameran är inne i
  stan ritas de som de gamla siluetterna (76 trianglar), utan AO och utan skuggor. Den målade
  "skogen" på kullarnas yta syns bara på avstånd, så nära Ove är det ren snö.

### Kylan

- **Köldmätaren** (`src/game/cold.js`) startar 30 m utanför där väggarna stod (`COLD` = BOUND + 30,
  i kvadratiskt avstånd som stadsplanen, alltså vid skogsbältets yttre kant). Precis vid kanten tar
  det **45 s** att frysa ihjäl. Längre ut går det fortare, eftersom takten ökar med kvadraten på
  avståndet: 70 m ut tar det cirka 11 s och 140 m ut 5 s (uppmätt 44,4, 11,2 och 5,0 s). Till fots
  hinner Ove ungefär 430 m ut, i Saaben i 100 km/h ungefär 545 m. Inne i stan tinar han på 18 s, och
  i bil med värmen på på 9 s. Mätaren står still medan Ove inte styr själv (scener, svarta bilder, ett
  misslyckat uppdrag som väntar på E eller Q).
- **Mätaren** sitter under Ordning-mätaren: "❄ Kyla", kylan han känner (från −8° till −48°), en
  stapel och en rad under den: *Kallt*, *Ove fryser*, *Ove känner inte tårna*, *Vänd om, Ove*, och
  på väg ner *Det tinar*. Över 75 % pulserar den. Första gången man kommer ut kommer en notis (*Kallt.
  Kallare än det borde vara. Och ju längre ut, desto kallare. Vänd om i tid.*). Vid 62 % står det:
  *Ove tänker på Sonja. Hon hade sagt åt honom att vända.*
- **Man ser och hör kylan.** Frost kryper in från bildkanterna (isormbunkar som en kall fönsterruta),
  och Ove stoppar händerna i fickorna och huttrar: ryggen kutar, huvudet dras ner och skakningarna
  kommer i stötar. Man ser hans andedräkt, tänderna skallrar, och mot slutet hörs hjärtat slå allt
  långsammare. Vinden ökar. Ute på kullarna blir det snöyra: snön blåser in från tomheten, diset
  tjocknar och vitnar, himlen blir vit och solen bleknar bort. Bakom honom försvinner stan i det vita,
  och till sist allt annat också. Musiken drar sig undan.

### Döden

- Vid 100 % stelnar Ove där han står och faller **som en planka** åt sidan i snön, med en tung duns.
  Isen knastrar när han fryser. Kameran stiger långsamt och tittar ner på honom. I bilen hostar
  motorn och dör, bilen rullar till stopp och kameran följer med. Frosten tar hela bilden, och sedan
  kommer **"Ove dog av frost"** i mörk isblå skrift med temperaturen över (cirka −48 °C) och en torr
  rad under, aldrig samma två gånger i rad: *Det var kallare än det såg ut.* / *Han hade mössa. Det
  hjälpte inte.* / *Här ute plogar ingen.* / *Kommunen ansvarar inte för något bortom skogen.* /
  *Termometern hade rätt. För en gångs skull.* I bilen: *Kupévärmen räckte inte ända hit ut.* /
  *Saaben startar i alla väder. Ove gör det inte.* Sedan blir det svart. När skylten syns hoppar
  mellanslag och de andra hoppa-över-tangenterna direkt till det svarta.
- **Vad döden gör med resten** (rättvist, och ingenting går sönder):
  - **En pågående dag misslyckas** ("Ove frös ihjäl."), men skylten UPPDRAG MISSLYCKADES kommer
    först när han har vaknat. Sedan gäller E (försök igen) och Q (ge upp) som vanligt. Medan han dör
    och vaknar står dagen, ärendena och patrullen still, så ingenting hinner klaras av, misslyckas
    eller ringa bakom döden.
  - **Ett ärende eller ett samtal** släpps utan att det kostar Ordning, och en smitarjakt släpps.
  - **Den som gick eller åkte med** har gått hem, och katten han bar är tillbaka där den kom ifrån.
  - **Bilen:** Saaben (eller en grannes bil, med släpkärran) står hemma när han vaknar. En lånad bil
    blir kvar därute, och trafiken tar bort den senare.
  - Inga kronor, ingen Ordning, och klockan och dagen är som de var.

### Uppvaknandet

- Ove vaknar i **sin egen säng** (`src/game/waking.js`, cirka 12 s, går att hoppa över). Sovrummet
  byggs inne i hans riktiga radhus, i bakre halvan av bottenvåningen (`buildBedroom` i
  `src/world/interior.js`, samma teknik som köket i luftningsscenen). Fönstret är husets riktiga
  bakfönster, med en egen ruta som scenen döljer, så man ser hans trädgård och fågelbordet därute.
  - En gråvit vintermorgon. Ove sover på rygg på sin halva av dubbelsängen, i ljusblå pyjamas, med
    täcket upp till hakan. Väckarklockan (röd, med två klockor) visar spelets tid och tickar.
  - **Hennes halva är bäddad, slät och tom.** Kudden är uppruskad, och på hennes nattduksbord står
    hennes fotografi (samma bild som de samlingsbara), med läsglasögonen på hennes bok och hennes
    lampa. Hans byxor ligger vikta på stolen under fönstret, med jackan över ryggstödet. Vid dörren
    hänger en Saab-kalender där novemberdagarna är överkryssade.
  - **Från dag 4 sitter katten vid fotändan** på hennes sida och tittar på honom.
  - Han flämtar till och sätter sig käpprak upp, och täcket åker ner till midjan. Katten hoppar till.
    Han ser bort mot hennes halva av sängen och säger sedan en av fem repliker, med Oves egen röst och
    aldrig samma två gånger i rad:
    - *Jag var nästan framme hos dig, Sonja. Men någon hade parkerat fel vid pärleporten.*
    - *Sonja skickade hem mig igen. Utan mössa kommer du inte in här, sa hon.*
    - *Bortom skogen tar världen slut. Det borde kommunen ha satt upp en skylt om.*
    - *Inte ens att frysa ihjäl går att göra ordentligt nu för tiden.*
    - *Sonja sa alltid att jag skulle ta halsduken. Fyrtio år, och hon har fortfarande rätt.*
  - En suck, svart, och sedan står han på gången utanför sin dörr.
- **Den riktiga Ove** tas av scenen med `offstage` och sätts tillbaka som hans läge säger, aldrig
  enligt en sparad bild av hans synlighet. Det var lärdomen från fixa_outro_anita.

### Ljud

Allt är syntetiserat med `audio.synth`, så inga nya filer behövdes: vinden (ett lågt brus och ett
visslande band, i byar), tandhackningen, andetagen, hjärtat, isknastret, dunsen i snön och motorn som
dör. I sovrummet hörs väckarklockans tickande, flämtningen, sängen som knarrar, sucken och någon som
skottar snö utanför.

### Repliker och röst

Bara de fem replikerna är nya (`WAKE` i `src/game/script.js`). De röstades med Oves röst den 11
oktober, på rabattens sista dag: 5 klipp, 374 tecken, **49 credits**. Inga omtagningar behövdes, och
igenkännaren hörde varje replik ordagrant. Manuset är nu 495 repliker och 15 488 tecken. Texterna
under "Ove dog av frost" och notiserna står bara på skärmen och röstas inte.

### Tester (`tools/scenarios/cold.mjs`)

- `coldwalk` (W och Shift ut genom norra skogsgatan, riktiga tangenttryck): död efter cirka 15 s i
  kylan, cirka 430 m ut, vaknar vid dörren varm. `colddrive` (Saaben i full fart): död cirka 545 m
  ut, med Saaben tillbaka i garaget. `coldback`: ut och in igen, och mätaren tinar till noll.
  `coldrate`: 44,4, 11,2 och 5,0 s. `coldmission`: dag 2 pågår, misslyckas efter uppvaknandet, och E
  tar upp den igen. `coldwall`: en bil på full gas, en fotgängare och Anders stannar vid den gamla
  väggen, men Ove går vidare. `coldbed` (en bild per ögonblick i sovrummet; `WAKECAT=1` med katten,
  `WAKELINE=n`): ingenting kvar efteråt, och på 200 uppvaknanden aldrig samma replik två gånger i rad.
  `coldbedskip`: ute 1,4 s efter mellanslag. `coldsound`: ljuden renderas offline, ingenting spelas
  upp och ingenting klipper (topparna ligger på 0,03–0,13). `coldperf` och `coldlook`.
- `story` slutar på `#7 idle` och `no errors`. `m5race` vinns. I `m7chase` kommer Škodan ikapp på
  5 m efter 12 s. `luft` och `luftcam` går fortfarande igenom.
- **Prestanda** (`coldperf`, bilar och folk dolda, mot HEAD före): inne i stan är antalet ritanrop
  detsamma ±2. Trianglarna i huvudpasset ökar med 1–3 % (fler siluetter och stenblocken), och AO och
  skuggor är oförändrade. Vid den yttre ringvägen, med blicken utåt, tillkommer de detaljerade
  granarna och deras skuggor (+0,16 M skuggtrianglar). renderFrame-tiden är oförändrad inom bruset,
  och `rperf start` ger 60 fps.

### Avvikelser och kvar

- Granarna därute är instansierade och har inga kvistkort (korten finns i skyltsidornas atlas och går
  inte att instansiera), så på nära håll ser de enklare ut än skogsbältets.
- Grannarna och fotgängarna stannar vid den gamla väggen, och en följeslagare blir stående där när Ove
  går ut.
- R (tillbaka till vägen) fungerar fortfarande ute i kylan och är en nödutgång.
- Kartan och minikartan visar inget utanför stan.
