# Fixa bilen

## Önskemålet

oops, i implemented/roligare_bilkorning.md
sa jag att den överstyrde för mycket i höga hastigheter -
tvärtom menade jag! Fixa!

(Bilarna överstyrde alltså inte, de understyrde och var för stabila. I högre fart ska de vara mer
lättsladdade och vilja svänga runt mer, särskilt de bakhjulsdrivna. Det är halt ute, det är vinter.
Det som var bra ska vara kvar: sladden efter handbromsen, att snurra på stället, Oves kommentarer
och sprejet. Det ska vara roligt och lite vilt men inte okörbart, så att en vanlig spelare klarar
racet på dag 5 och jakterna.)

## Vad som blev gjort (2026-10-11)

Punkt 1 i [roligare_bilkorning.md](roligare_bilkorning.md) är borttagen. Där gav däcken mindre i
sidled och ratten tog mjukare i hög fart, vilket gjorde bilarna ännu stabilare. Nu går det åt andra
hållet, och konstanten `WINTER` i `src/actors/car.js` betyder något nytt. Det gäller bara spelarens
bil, och inte när den drar en släpkärra. Datorns förare (trafiken, Anders i racet, Škodan och
smitarna) kör exakt som förut.

### Bakvagnen släpper först

Från ungefär 30 km/h, och fullt ut från 80 km/h, släpper bakvagnen före fronten:

- **Ratten tar skarpt.** Ett kort tryck (0,25 s) vrider bilen mer än förut:

  | | före roligare_bilkorning | roligare_bilkorning | nu |
  |---|---|---|---|
  | 60 km/h | 10,9° | 10,2° | 14° (bakhjulsdrivna 15°) |
  | 100 km/h | 6,5° | 3,8° | 9° (10°) |
  | 125 km/h | 5,2° | 2,8° | 7° (8°) |

- **Bilen vill svänga runt.** Ber man om mer än däcken ger, svänger bilen mer än den åker, i stället
  för att plöja rakt fram. Bakvagnen glider då ut. Hur mycket beror på drivlinan och pedalerna:
  - **Bakhjulsdriven** (Volvo 240 och 740, BMW:n, skåpbilen, bussen, sopbilen): gasen slänger ut
    bakvagnen mest av allt.
  - **Framhjulsdriven** (Saaben, Golfen, Škodan, kombin, taxin): med gasen i botten ligger den
    stadigt, för framhjulen drar bilen längs sin bana i måttlig fart. Släpper man gasen i svängen
    blir bakvagnen lätt och kommer ut (lyftöverstyrning).
  - **Fyrhjulsdriven** (Audin): mittemellan.
  - **Bromsen** i botten låser hjulen (bilarna har inget ABS). Då glider bilen rakt fram i sin
    bana i stället för att vrida sig, och i en sladd drar bromsen bilen rak. Att trampa på bromsen
    lugnar alltså alltid ner bilen. Med lite broms (handkontroll) blir bakvagnen däremot lösare,
    eftersom den då släpper gasen. Från början gjorde bromsen alla bilar lösare, men då snurrade
    boten i dag 6-jakten runt när den bromsade hårt från 95 km/h in i en sväng.
- **Sladden tar över.** När bakvagnen glidit ut 8–14° (8° i hög fart, 14° i 30-nånting km/h, så
  att en vanlig snäv sväng inte räcker) börjar en sladd av sig själv. Det sker bara om föraren
  styr åt samma håll som bilen svänger, så en knuff från en annan bil sätter aldrig igång en sladd.
  Det är samma sladd som efter handbromsen: ratten åt samma håll vrider ut bakvagnen mer,
  motstyrning fångar den, gasen håller en bakhjulsdriven sladd vid liv och drar en framhjulsdriven
  bil rak. Ove har en åsikt efteråt (om sladden varade minst 1,6 s), och sprejet yr bakom
  bakhjulen.
- **Den följer vägen.** I en sådan sladd greppar däcken nästan lika hårt i sidled som när de har
  fäste (8,5 m/s² mot handbromssladdens 5,2). Bilen står snett och tappar fart men åker inte
  rakt av vägen. Med handbromssladdens friktion åkte boten i dag 6-jakten 15 m ut ur en sväng.
- **Skandinavisk pendelsväng.** En sväng åt ena hållet och sedan snabbt åt det andra slänger ut
  bakvagnen åt det nya hållet. Det håller i sig så länge man håller ratten, och klingar av på
  ungefär 0,7 s.

### Mätt (`handling`, tangentbordsstil: fullt rattutslag, W nere eller uppe)

Tid tills bakvagnen släpper vid fullt rattutslag:

| | Saaben | Volvo 240 | Audin |
|---|---|---|---|
| 60 km/h, gasen nere | 1,38 s | 0,78 s | 0,93 s |
| 60 km/h, gasen släppt | 1,25 s | 1,3 s | 1,33 s |
| 100 km/h, gasen nere | 1,48 s | 0,8 s | 1,05 s |
| 100 km/h, gasen släppt | 0,85 s | 0,88 s | 0,9 s |
| 100 km/h, 60 % broms | 1,1 s | 1,13 s | 1,15 s |
| full broms | aldrig | aldrig | aldrig |

- Fullt rattutslag med gasen nere i 1,5 s: Saaben sladdar inte upp till 50 km/h (5–7° glidvinkel),
  men gör det i 60 km/h (13°). En 240 sladdar från 45 km/h (24°; 40° i 50, 57° i 60).
- En 90°-sväng i 60 km/h med gasen nere: Saaben sladdar (30°) och är rak igen efter 85°. En 240
  står 63° snett och fortsätter tills någon motstyr.
- En spelare som fångar sladden i 100 km/h (motstyr 0,3 s efter att bakvagnen släppt): Saaben är
  rak efter 0,25 s (högst 20°), en 240 efter 0,48 s (29°).
- Handbromssladdarna (`drift`) gav exakt samma siffror som före ändringen.

### Kontroller

- `handling` (`tools/scenarios/cars.mjs`) är omskriven för det nya beteendet: när bakvagnen släpper
  per bil, fart och pedal, korta tryck, en 90°-sväng, pendelsvängen och en spelare som fångar sladden.
- `speedslide` är ny och körs med riktiga knapptryck (Saaben, `TYPE=` för en annan bil):
  1. En undanmanöver i 95 km/h på ringvägen i norr. Bakvagnen vickar till 8° (en 240: 11° och en
     kort sladd), bilen stannar på vägen och är rak inom 2 s.
  2. In i korsningen vid (40, -40) från 60 km/h utan handbroms. Gasen släpps och A hålls, och
     bakvagnen släpper efter 1,3 s. Saaben driftar runt hörnet med högst 30° (en 240: 48°) och kör
     ut på tvärgatan i 50 km/h.

  Scenariot kontrollerar också att ingen AI-bil någonsin sladdar. Bilder finns i
  `out/speedslide_*.png`.
- `m5race` tar `RACE_VC`, en förare som tar kurvorna snabbare. Med 1,3 och 1,6 förlorar boten
  oftast även med den gamla fysiken. Det beror på botens kurvteknik, inte på bilen.
- Ove har inga nya repliker, så inget behöver röstas. Sladdar som börjar av sig själva får samma
  kommentarer som handbromssladdarna.

### Körda kontroller (slutversionen, headless, egna portar, utan ljud)

- `story`: alla sju dagarna, slutar på `#7 idle` och `no errors`.
- `m1`: släpkärran backas in med riktiga knapptryck. Med släp är vinterväglaget avstängt.
- `m5race`: vunnet på 26,8 s, och Anders var 91 m efter. Med `RACE_VMAX=22`: 27,3 s, 56 m efter.
- `m7chase`: under 40 m efter 10,9 s, som förut. Škodan är en AI-bil och kör som förut.
- `driftshot`: sladden håller 2,3 s efter Mellanslag (högst 55°), snurrandet går 0,85 varv på 3 s
  och Ove kommenterar båda.
- `drift` ger exakt samma siffror som före ändringen, och `trailer` är oförändrad. I `physics` är
  allt som förut utom fullt rattutslag i 60 km/h, som nu blir en kort sladd (1,03 rad/s, skid 0,3;
  förut 0,55 rad/s utan tjut).
- `speedslide` går igenom med Saaben och med en 240. Ingen AI-bil sladdade.

### Botarna är inte helt pålitliga, inte heller förut

Race- och jaktbotarna misslyckas ibland, oavsett fysik.

- **`m5race` med `RACE_VMAX=22`**, två körningar samtidigt: den gamla koden vann 6 av 7 gånger, den
  nya 3 av 4. Förlusterna var krascher mot stolpar och kanter i andra och tredje kurvan, i 30–45
  km/h.
- **Tredje kurvan** gick boten med den nya fysiken först ut ungefär 0,5 m närmare stolpen vid
  (206,25, 97,25) än förut. Framhjulsdrivna bilar fick därför draget med gasen nere, och den
  långsammare upptrappningen gav tillbaka nästan hela marginalen (2,48 m mot förut 2,67 m i en
  simulering).
- **`m6chase`** (dag 6, en bot jagar Škodan): den gamla koden lyckades 11 av 12 gånger. Den nya
  lyckades 6 av 8 med de nästan slutliga inställningarna och 1 av 2 med de slutliga.
  - De nya misslyckandena fastnade vid parkeringsutfarten i låg fart, eller tappade Škodan när den
    hamnade utanför vägen, där boten inte följer efter.
  - En tillfällig mätare visade att Saaben inte sladdade i något av dem. Under 32 km/h är fysiken
    bit för bit som förut.
  - Tidigare versioner fällde boten på riktigt, och de är åtgärdade. Bromsen gjorde bilen lösare
    och den snurrade. En knuff från Škodan kunde starta en sladd. Sladdens friktion gjorde svängarna
    för breda.
