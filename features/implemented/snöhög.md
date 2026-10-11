# Snöhögen

## Önskemålet

Finns en stor snöhög nära där ove bor (i en park, typ). Men när man åker på den så studsar man bara.
Man borde kunna åka på den med bilen och göra ett hopp liksom.

(Förtydligat när uppgiften gavs: gör den till en riktig, rolig hoppbacke med en form som bilen kan
följa (uppfart och kant, gärna en avsats), känsla av lufttid, en landning som tar emot, snöpuder vid
avfärd och landning, och ljud. Den ska se ut som en snöhög. Den ska fungera för alla bilar, även med
släpkärra (gärna komiskt, men inget får gå sönder), och Ove ska kunna gå upp på den till fots. Något
roligt och lite knasigt på köpet, till exempel en åsikt från Ove efter ett långt hopp eller en granne
som reagerar. I första hand redan röstade repliker, högst ett par nya korta, under ~300 credits.)

## Vad som blev gjort (2026-10-12)

### Varför bilen studsade

Pulkabacken i parken var åtta staplade cirkelgolv, 0,4 m höga trappsteg (9 m radie, 3,2 m hög). En
bils mittpunkt klarar att kliva 0,4 m upp, men bilens 4,5 m långa kaross nådde in över cirkeln två
steg högre upp, 0,8 m ovanför. Det är mer än bilens 0,6 m kliv, och kollisionen tog det för en vägg.
Bilen knuffades tillbaka med en studs, varje gång.

### En ny sorts kulle: släta snöhögar

Kollisionen har fått en ny form, `HILL` (collision.js): en slät höjdkarta, där en funktion talar om
hur högt snön ligger i varje punkt. En snöhög är aldrig en vägg och alltid ett golv: den som kör
eller går upp på den, eller landar på den från luften, står på snön, och ingenting hamnar under den.
Hoppbacken ritas med samma funktion som kollisionen använder, så hjul och fötter står där snön är.
Förskolans runda pulkabacke har fått samma sorts kollision i stället för trappstegen.

### Hoppbacken

Snöhögen i parken (väster om Oves område, på andra sidan Parkvägen) är byggd om till en hoppbacke,
`world/snowhill.js`. Den är fortfarande en stor plogad snöhög: oval sedd uppifrån, 28,6 m lång och
3,4 m hög, med branta knöliga sidor, snöklumpar runt foten, grus vid kanten, en packad körbana med två
hjulspår och sju pulkaspår nerför sluttningarna. Formen är ett hoppbord som går åt båda hållen:

- en uppfart i var ände som blir brantare och brantare, upp till 24°
- en tätt avrundad kant överst, som skickar iväg bilen i uppfartens vinkel
- en platt avsats överst, 7 m lång (där landar den som kommer för sakta, och rullar sedan ner)
- nedfarten på andra sidan är landningen: 24° som planar ut till 16°, sedan utrullningen

Den ligger längs den enda öppna gräsytan i parken: ett 62 m långt fält utan träd och lyktstolpar,
från Parkvägen tvärs över parken, norr om lindallén. Man kan ta sats från gatan eller inifrån
parken. Formen är räknad fram med en simulering av hoppen. Upp till ungefär 11 m/s (40 km/h) vid
kanten landar bilen på avsatsen och rullar ner på andra sidan, i 12-14 m/s (45-50 km/h) landar den
mjukt i nedfarten, och i 15-18 m/s flyger den förbi hela backen och tar i hårt på plan mark. En
landningsbacke kan bara ta emot ett fönster på ett par m/s; det ligger där en vanlig ansats från
gatan hamnar.

Vid foten står kommunens skylt: "Pulkaåkning sker på egen risk" och under den "Motortrafik
förbjuden". Pulkorna som låg på den gamla högen ligger vid foten, och Saab-emblemet som låg på
toppen ligger nu på avsatsen. Man kan flyga över det och ta det i farten.

### Bilarna i luften

Bilfysiken (car.js `HOPP`):

- **På backen** känner bilen lutningen. Uppförsbacken kostar fart, och en bil som stannar i
  sluttningen utan broms rullar baklänges. Står den på tvären i en sidosluttning håller däcken, men i
  en för brant sluttning glider den ner. Fjädringen tar emot när lutningen ändras, och bilen lutar åt
  sidan efter marken.
- **Avfärden.** När snön faller undan fortare än bilen skulle falla lyfter den. Det händer vid
  kanten, och över ett krön i fart. Det är ingen trigger: varje backe och varje fart ger det hopp den
  ska.
- **I luften** faller bilen med 15 m/s² i stället för 22. Det är mjukare än en bil som kör över en
  kant, för lufttiden är poängen: 1,0-1,2 s för ett bra hopp. Nosen följer flygbanan, så bilen möter
  nedfarten i samma vinkel som backen.
- **Landningen** bedöms efter hur hårt bilen tar i snön *vinkelrätt mot backen*. Den som landar i
  nedfarten i rätt fart tar knappt i alls, och farten längs backen följer med. Den som flyger förbi och
  landar på plan mark tar i ordentligt (en duns och en studs). Skador blir det först i 20 m/s och
  uppåt, och då lite (2 hp).

### Släpkärran

Släpet har fått ett eget upp och ner. Hjulaxeln följer marken och flyger från kanten som bilen gör.
Lådan hänger på dragkulan (där bilens lutande kaross har den) och tippar för att vila på axeln,
högst 34° åt något håll. Längre än så lyfter bilen släpet med sig, eller drar ner det efter sig:
vid kanten dinglar släpet efter bilen. Efter en mjuk landning drar dragstången ner släpet längs
nedfarten efter bilen. Efter en hård landning slår det i marken en stund efter bilen och studsar
(i simuleringen två gånger, i 8,5 och 5,1 m/s), med ett litet snedsprång för varje studs, ett klonk
av galvaniserad plåt och ett skrammel. På plan mark är släpet exakt som förut (bilarnas släptest ger
samma siffror som innan), och dag 1:s backning fungerar.

### Ove till fots

Ove går upp på högen var som helst: uppfarten, sidorna, över avsatsen och ner på andra sidan. Han kan
hoppa på avsatsen. Fötterna är alltid på snön (testat bildruta för bildruta: aldrig under snön,
aldrig svävande).

### Runt hoppet: snö, ljud, kamera

- **Snöpuder** sprutar från bakhjulen vid avfärden och från alla fyra hjulen vid landningen, mer ju
  hårdare den var, och kastas med i bilens fart (många små virvlar: några få stora såg ut som
  bomullstussar). Ett studsande släp sprutar också.
- **Ljud** (syntetiserade, som spelets andra effekter): däcken som släpper den packade snön med ett
  dovt *whumpf* och fjädrarna som avlastas, luften som brusar förbi så länge bilen flyger, motorn som
  varvar upp när hjulen snurrar fritt (och däcken som tystnar), och landningen efter hur hård den var:
  ett djupt snöknarr och fjädrarna som slår i botten, från 8 m/s ett skrammel av allt löst i bilen
  och avgasröret mot karossen, från 12 m/s en smäll. Släpkärran klonkar och skramlar när den studsar.
  Nivåerna är mätta offline: en hård landning låter som en krock, en mjuk tystare än en duns, och
  inget klipper.
- **Kameran** öppnar upp i luften: lite längre bak, lite vidare, och den stiger långsamt efter bilen,
  så bilen klättrar upp mot himlen i bilden, och kameran hinner ikapp på vägen ner.

### Det knasiga: Ove antecknar, och alla har en åsikt

- **Ove antecknar.** Ove tar tid på allt (han tog tid på Patrick när han backade). Efter ett riktigt
  hopp (minst 0,55 s i luften) kommer en lapp med hans handstil: *Lufttid 1,07 s · 14,1 m · Bra
  landning*. Det längsta hoppet är hans rekord, sparat med spelet: "Rekord!" när han slår det.
- **Ove har en åsikt** efter ett långt hopp (minst 0,85 s, högst var 25:e sekund). I sin egen Saab med
  en bra landning säger han **"Saab byggde flygplan först. Det märks."** (första gången alltid). I
  någon annans bil, efter en hård landning, säger han **"Det är inte min bil."** Annars säger han
  något han redan sagt om annat: "Det var meningen." och "Det där såg ingen." efter en hård landning,
  "Hmpf." med släp, "Så ska en bil se ut.", "Ordentligt." och "Bra däck." efter en fin.
- **Passagerarna:** Patrick "Oj! Jag hoppade till.", Parvaneh "Måste du, Ove?", Anita "Ove, Rune blir
  rädd.", Rune "...Saab." (eller "...Volvo." efter märket), Jimmy "Ove! Mannen själv!", flickorna
  "Igen!".
- **Folk som såg det** (inom 38 m) reagerar som när Ove tutar. Barnen jublar ("Igen!", "Häftigt!"),
  pensionärerna skakar näven ("Ungdomen nu för tiden!", "Mitt hjärta!"), tonåringarna säger "Lugna dig,
  gubbe!", och de andra hoppar till ("Jösses!", "Jag fick nästan hjärtstopp!", "Det är bilfritt
  här!"). Den som stod där bilen landade hoppar undan.
- **En granne** inom 60 m har en åsikt: Anders "Jag tar upp det på årsmötet, Ove!" (med näven), Patrick
  "Wow. Det ser ut som i reklamen.", Parvaneh "Ove, du ser nästan glad ut i dag.", Jimmy "Ove! Mannen
  själv!", Anita "Hej, Ove.", Rune "...Saab.", Vita skjortan "Det där noteras.", flickorna "Igen!
  Igen!".
- Det kostar ingen Ordning. Skylten vid foten säger redan allt.

### Repliker

Allt som sägs är redan röstat utom två nya repliker för Ove, båda i `script.js` (`OVE_HOPP`):
"Saab byggde flygplan först. Det märks." och "Det är inte min bil." De är gjorda med röstverktyget
(`make voice`: 58 tecken, det kostade 8 credits). Röstkontrollen hörde båda ord för ord, och `make
voice-check` går igenom. Manuset är 497 repliker, 15 546 tecken.

### Tester

- `snohogsim`: bilen stegad för hand över den riktiga backen, utan bildfrekvens att bero på. 64 körningar:
  Saab 900, Volvo 240, Audi, skåpbil och Volvo 740 med släp, båda hållen, 5-22 m/s. Ingen hamnar
  någonsin under snön, alla står på hjulen, plana och rakt efter, och ingen tar skada under 20 m/s.
- `snohog`, med riktiga tangenttryck (en regulator på W/A/D/S håller bilen på backens mittlinje):
  - Saab, 13,5 m/s inifrån parken: 1,07 s i luften, 14,1 m, bra landning.
  - Saab, full gas från gatan: avsatsen, sedan ner.
  - Volvo 240, 12 m/s.
  - Audi, full gas: 1,23 s, 18,8 m, hård landning.
  - Skåpbil, 14 m/s.
  - Volvo 740 med släpkärra, 12,5 m/s: 0,85 s, mjuk landning, släpet nere och plant efteråt.

  Alla landade på hjulen, stod plant och tog ingen skada att tala om. Bilder vid avfärd, i luften och
  vid landning; `FILM=1` sparar varannan bildruta av varje hopp.
- `snohogwalk`: Ove går backen på längden och tvärs över den, med ett hopp på avsatsen.
  `snohogsound`: ljuden offline.
- Bilfysiken och kollisionen är ändrade, så också:
  - m1: Patricks släp backas in med tangenterna.
  - story: alla sju dagarna, `#7 idle`, `no errors`.
  - m5race: vunnet, två gånger.
  - m7chase: Škodan kommer ikapp av sig själv (5,2 och 5,6 m som närmast).

  Bilarnas `physics`, `handling`, `trailer` och `trailersleep` gick igenom; `physics` och `trailer`
  ger samma siffror som innan. Världens `validate` gick igenom: samlarsakerna går att nå och
  landmärkena är fria. Tre träd långt ute utanför stan har en anmärkning, men den fanns redan
  innan. Tutans `horn` klarade alla 19 kontroller.

### Filer

`src/world/collision.js` (HILL), `src/world/snowhill.js` (ny: hoppbacken, kupolen), `src/world/places.js`
(parken, pulkabacken), `src/world/town.js` (emblemet), `src/actors/car.js` (`HOPP`), `src/actors/trailer.js`,
`src/game/hoppbacke.js` (ny), `src/main.js`, `src/game/camera.js`, `src/game/fx.js` (`powder`),
`src/audio.js` (ljuden), `src/game/horn.js` (åskådarnas reaktioner), `src/game/script.js`,
`tools/scenarios/snohog.mjs` (ny), anteckningarna (notes/world.md, cars.md, integration.md), DESIGN.md
4.9, 6 och 7, README.md, CLAUDE.md.
