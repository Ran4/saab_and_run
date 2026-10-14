# Ljudbugg vid kölddöd

## Önskemålet

vid kölddöd så visas en cutscene när man vaknar man upp i sängen - under tiden så spelas det upp ett
högt ljud samtidigt (låter som att flera grejer körs samtidigt, typ en kollision eller nått? idk).

Undersök och fixa.

## Felet (2026-10-14)

Det höga ljudet var **vinden**, som skapades på nytt i varje bildruta under hela sängscenen. Varje
sådan vind blev en kort brusstöt på full volym, men bara i **Firefox**.

- Medan Ove dör blåser det (`src/game/cold.js`, `sounds()`). När bilden går i svart, 5,6 s in i
  döden, ska vinden tystna. Men raden som *skapar* vinden ("det blåser eller han håller på att dö")
  kom före raden som stoppar den, och den gällde så länge döden pågick. Så i varje bildruta från
  svart, genom hela sängscenen och tills Ove står vid sin dörr, skapades en ny vind som stoppades i
  samma bildruta. Det blev ungefär 580 vindar per död (60 bilder/s i ~10 s), med två loopande brus
  och två filter vardera.
- I Chrome var de tysta. En vind börjar på volym 0,0001, och stoppet (`cancelScheduledValues(nu)` och
  sedan ett fall mot 0) höll den där. I **Firefox** gör samma anrop något annat. När
  `cancelScheduledValues(nu)` tar bort allt som var schemalagt, kastas volymen tillbaka till sitt
  standardvärde 1. I Firefox räknas även `gain.value = 0.0001` som en händelse vid samma tidpunkt, så
  den försvann också. Varje vind blev alltså en brusstöt på volym 1, fem gånger vindens högsta nivå
  när han dör. Den tonade ut på ungefär en halv sekund, och det kom 60 sådana i sekunden, ovanpå
  varandra.
- Resultatet var ett konstant dånande brus på **−14 dB RMS** genom hela sängscenen. Den fulla
  vinden när han dör ligger på −33 dB, väckarklockan i rummet runt −45 och Oves egen replik runt −18 dB. Ett
  lågfrekvent brus byggt av många stötar på en gång, alltså *flera grejer samtidigt, typ en
  kollision*.
- Utvecklarens standardwebbläsare är Firefox (`xdg-settings get default-web-browser`). Alla
  testverktyg kör Chrome, så felet hördes aldrig i testerna, och inte heller i en inspelning av hela
  döden i Chrome i riktigt läge med rösterna på. Där var sovrummet tyst (−33 till −45 dB) före
  repliken.

## Vad som gjordes

Bara i `src/game/cold.js`, plus en parameter i `exitCar` i `src/main.js`:

1. **Ingen vind efter svart.** I `sounds()` kommer stoppet nu först: efter 5,6 s i döden stoppas
   vinden en gång och skapas aldrig igen. Under döden blåser det precis som förut, och det tystnar
   på samma sätt (0,6 s) när bilden går i svart.
2. **Vindens `stop()` avbryter ingenting.** I stället schemalägger den fallet till 0 vid samma
   tidpunkt. En händelse vid samma tid ersätter den stigning som `set()` kan ha lagt där, i både
   Chrome och Firefox. En vind som stoppas i samma ögonblick som den skapas är därför tyst i båda
   webbläsarna, och en vind som har blåst tonar ut som förut. Det skyddar också resten av
   kylan: vinden stoppas även 3 s efter att Ove kommit in från snöyran.
3. **Ingen bildörr bakom svart.** Dör Ove i en bil lyfts han ur den bakom svart när världen städas
   upp. Då slog bildörren igen (`audio.door()`, −18 dB) en halv sekund innan sovrummet tonade in.
   `exitCar(force, quiet)` har fått en tyst variant, och kylan använder den.

Allt annat i döden och sängscenen är som förut: ljuden, nivåerna och tiderna.

## Hur det verifierades

- **Nytt scenario `coldwind`** (`tools/scenarios/cold.mjs`). Ove dör en gång till fots och en gång i
  Saaben. Scenariot räknar vindarna som skapas från döden tills han står vid dörren: 0 nu (576 och
  571 i den gamla koden). Det kontrollerar också att ingen vind finns kvar efteråt, att ingen bildörr
  slår bakom svart, och att effektbussen är tyst i sovrummet före repliken (−42 dB). Offline kontrollerar
  det dessutom tre saker: att vinden aldrig anropar `cancelScheduledValues` (det som Firefox gör fel,
  2 anrop i den gamla koden), att en vind som stoppas när den skapas är tyst, och att en vind som
  blåst en sekund tonar ut till under 5 %. Den gamla koden ger 3 fel, den nya inga.
- **Firefox, headless** (Firefox 156 som snap, som utvecklarens, och en fristående 158), offline-
  rendering utan ljudenhet:
  - Volymkurvan för en vind som skapas, får sin nivå och stoppas i samma ögonblick: på det gamla
    sättet 1,0 → 0,61 → 0,29 (Chrome: 0,0001), på det nya 0,0001. En vind som blåst en halv sekund
    och sedan stoppas faller från 0,16 till 0,04 på 0,3 s, som förut.
  - Sängscenens 120 vindar per 2 s, med spelets egen `SOUNDS.wind` (varje vind fördröjd till sin
    bildruta): **−13,9 dB RMS** (topp 0,68) i den gamla koden och **−90 dB** i den nya. En ensam vind
    på full styrka ligger på −33 dB.
  - Spelet kunde inte köras levande i Firefox headless. Firefox startar ingen ljudkontext utan en
    ljudenhet, och användarens ljudsystem rörde jag inte. Därför är Firefox-delen mätt offline,
    med spelets egen vindkod.
- **Chrome, hela döden inspelad** (riktigt läge utan `?test`, rösterna och musiken på, både med en
  död direkt vid kanten och efter en promenad ut med riktiga tangenter): utgången mätt var 0,1 s, ett
  spektrogram över förloppet, och varje ljudanrop loggat. Utöver vinden och dörren fanns inget
  oväntat, inga krockar och ingen överbelastning av ljudtråden.
- Regression: `coldwalk`, `colddrive`, `coldbed`, `coldbedskip`, `coldback`, `coldsound`,
  `coldmission` och `coldwind` gick igenom (`no errors`). Takten är oförändrad: 112,2, 28,1 och 12,5 s
  till fots, och 25,7 s i kylan rakt ut. Sängscenens bilder ser ut som förut.
  `story` kördes inte, eftersom varken uppdrag, scener, förare, säten eller fysik är ändrade. Den enda
  ändringen utanför kylan är att `exitCar` kan vara tyst, och den används bara av kylan.

**Verifiera själv:** `PORT=88xx node tools/shot.mjs coldwind` (och `coldwalk colddrive coldbed`).
Om du vill höra det: dö av köld i Firefox. Sovrummet ska vara tyst så när som på väckarklockan, Oves
flämtning, sängen, någon som skottar utanför och repliken.

## Avvikelser och kvar

- Firefox-fällan med `cancelScheduledValues(nu)` finns kvar på tre ställen som stoppar ett ljud på
  samma sätt: tutan när T släpps (`audio.horn(false)`), fartvinden när en bil landar från
  hoppbacken (`hoppLand`) och pyset från elementet i dag 3:s scen (`luftning.js`, `hiss.stop`). De
  smäller bara om ljudet stoppas i samma ögonblick som det startar. Det som schemalagts tidigare
  ligger kvar efter avbrottet, och i spelet har ljudet alltid hunnit spela en stund. De är inte
  ändrade. Regeln står i CLAUDE.md och notes/ui.md.
- Musikens efterklang tas före musikens duckning (`audio.js`: `vduck → musicVerb`). När musiken
  duckas till 12 % under döden hörs därför efterklangen nästan som vanligt, runt −38 dB i sovrummet.
  Den är inte hög, men musiken låter blöt där. Inte ändrad.
