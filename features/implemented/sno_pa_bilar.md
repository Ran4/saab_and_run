Många bilar har snö på sig.

Om man tar en sån bil och åker iväg så borde snön flyga av (realistiskt, men utan att prestandan
blir heelt fucked).

---

# Implementerat (2026-10-15)

Kod: `src/actors/carsnow.js` (ny), kopplad i `car.js` (`stepSnow`, `frostMaterials`, `snowGone`,
egna materialkopior, LOD, uppvärmningen), `carmodels.js` (`snowCapGeometry` fick attributet `capo`),
`fx.js` (`fx.blown`), `main.js` (`tickCarSnow` varje bildruta). Detaljerna står i notes/cars.md,
*Snow on cars, shed when driven*.

## Vad som händer

De parkerade bilarna (alla onamngivna parkerade bilar och felparkeringarna på gästplatserna) har som
förut ett snötäcke på tak, motorhuv, baklucka och rutor, och frost på lacken. Så länge ingen rör dem
är allt som förut och kostar ingenting extra. Den första fysikstegningen där en snöig bil rör sig
(eller har motorn igång) får den sitt eget snöläge:

- **Snötäcket delas i flak** (40-55 per bil, ~0,4 x 0,46 m, glas och lack för sig) över ett rutnät
  på 8 cm över bilens ovansida. Vad som är kvar skrivs i en liten textur som bilens eget
  snötäckesmaterial läser: där ett flak har gått är kanten bruten och ojämn, där vinden nött snön
  blir den tunnare och fläckig.
- **Ett flak lossnar** när det som drar i det är starkare än dess fäste (som skiljer sig mellan
  flaken: de flesta sitter hårt, några löst, kanterna lösare):
  - bilens egen acceleration: snön blir kvar när bilen drar iväg, åker framåt när den tvärbromsar och
    glider av ytterkanten i en skarp sväng;
  - fartvinden: dess drag mot en fri framkant och lyftet över taket (suget bakom vindrutans överkant
    flår taket framifrån från ~60-70 km/h); bagageluckan och bakrutan ligger i lä bakom taket och
    behåller snön längst;
  - stötar: en krock eller en landning slår loss flak med fri sida bort från stöten (med
    sannolikhet efter stötens styrka) och de behåller farten de hade, så de far iväg;
  - i luften (hoppbacken) faller snön med bilen och lyfter av i fartvinden;
  - motorn värmer huven på några minuter och huvens snö släpper lättare;
  - bara flak med en fri sida åt det hållet kan gå, så en panel lossnar utifrån kanterna och inåt.
  Vinden nöter också bort snön från de utsatta kanterna (snörök, flaket blir tunnare och går till
  slut som pulver).
- **Flaken spricker i 1-4 bitar** som glider längs bilens ovansida (gravitation, friktion, bilens
  rörelser och sväng, vinden; de fastnar mot vindrutans fot), lämnar bilen vid en kant eller lyfter,
  tumlar genom luften med luftmotstånd, smulas sönder i fartvinden och slår i vägen i ett lågt
  snöstänk (och en bit eller två), eller landar mjukt och ligger kvar ~30 s (en bil som kör över en
  klump mosar den). En bit som faller ner på sin egen bil igen glider vidare där.
- **Snörök**: i fart ryker snön från de utsatta kanterna (`fx.blown`: tunna strimmor som bromsas upp
  till en svag dimma), efter flygande bitar och vid nedslagen.
- **Vindrutetorkarna** (inte begärt, men det är det första som händer när man kör iväg med en
  insnöad bil): förare + motor igång startar dem efter 0,7 s, tre svep, två blad som syns medan de
  rör sig. De sopar två solfjädrar rena och skjuter upp en vall i änden av svepet; snön i hörnen och
  överst blir kvar.
- **Frosten på lacken** blir fläckig där flaken gått och blåser bort med farten. När allt är borta
  blir bilen en vanlig ren bil igen (delade material, inget snötäcke, instansierad på avstånd).

## Hur mycket och hur fort (uppmätt, `bilsnosim`)

Andel snö kvar, sex modeller x sex bilar, spelarens acceleration upp till en jämn fart:
30 km/h: 0,96 efter 3 s, 0,93 efter en minut. 50 km/h: 0,87 / 0,80 / 0,65 efter 15 / 30 / 60 s.
70 km/h: 0,58 / 0,40 / 0,17. 90 km/h: 0,37 / 0,15 / 0. Tvärbroms från 50: 0,90 -> 0,72. En sväng
med 0,8 g i 50: 0,90 -> 0,75. Hoppbacken i ~45 km/h: ungefär hälften går (luften, landningen,
inbromsningen efteråt). En parkerad snöig bil som Saaben kör in i tappar ~7 flak.

## Prestanda

Inget kostar något förrän en snöig bil rör sig. Per bil som tappar snö: en liten R8-textur (~1,5 kB),
ett eget snötäckesmaterial (ett och samma shaderprogram för alla) och egna kopior av lackens snöiga
material (samma program, bara en uniform skiljer), ~50 flak som stegas i 60 Hz. Klumparna (högst 72)
och torkarbladen är två instansierade ritanrop för hela stan, inga alls när de inte finns. Uppmätt
(`bilsnoperf`, full gas i en insnöad Volvo mot samma bil utan snö): snöns steg + klumparnas tick
0,09-0,11 ms per bildruta; hela bildrutan 7,2-7,8 ms mot 7,2-7,5 ms över fyra par körningar (0-0,5
ms mer: partiklarna och klumparna som ritas; bruset mellan körningar är ±0,3 ms), inget shaderprogram
kompileras när snön börjar lossna (uppvärmningen vid laddning har dem).

## Skillnader mot beskrivningen

- Torkarna och lackfrosten som bleknar är tillägg.
- Snön lossnar inte bara när man "tar" bilen: varje snöig bil som rör sig tappar sin snö (en
  parkerad bil som blir påkörd, en AI-förare om någon någon gång kör en insnöad bil - i dagens spel
  är smitarna aldrig insnöade, gästplatserna ligger inte på gatan).
- Inget ljud: snö som glider av en bil hörs knappt inifrån den.

## Verifiera

`PORT=88xx node tools/shot.mjs bilsnosim bilsnochecks bilsnohopp bilsnoperf` (kontrollerna läggs
till körningens fel) och bilderna i `bilsnodrive` (jaktkameran), `bilsnolook` (torkarna framifrån,
närbilder från fyra håll efter en kort tur), `bilsnopass` (en bil som drar förbi en kamera vid
vägkanten). `TYPE=golf` m.fl. väljer modell.
