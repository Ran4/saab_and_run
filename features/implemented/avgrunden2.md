# Avgrunden 2

## Önskemålet

Man fryser ihjäl när man åker utanför banan. det är ok.

Men det går FÖR fort just nu. Borde ta 2.5x längre tid, så man har iaf lite tid att reagera.

## Vad som blev gjort (2026-10-12)

Allt sitter i `COLDK` i `src/game/cold.js`. Ingenting annat i spelet ändrades.

### Takten: 2,5 gånger så lång tid på varje plats

Köldmätaren stiger 2,5 gånger långsammare överallt (`edgeSecs` 45 → 112,5). Takten ökar fortfarande
med kvadraten på avståndet bortom kanten (`scale` 70 m), så tiden från ingenting till döden blir 2,5
gånger så lång på varje plats:

| Var Ove står          | Förut | Nu      | Uppmätt stående (`coldrate`) | Uppmätt i förbifarten (`coldwalk` / `colddrive`) |
|-----------------------|-------|---------|------------------------------|--------------------------------------------------|
| precis vid kanten     | 45 s  | 112,5 s | 110,9 s (0,5 m ut)           | 112,2 s / 111,8 s                                |
| 70 m ut               | 11 s  | 28 s    | 27,9 s                       | 28,1 s / 28,1 s                                  |
| 140 m ut              | 5 s   | 12,5 s  | 12,4 s                       | 12,5 s / 12,5 s                                  |

Den som går eller kör rakt ut vinner mindre än 2,5 gånger, eftersom takten stiger ju längre ut han
kommer. Det är samma väg i båda fallen, eftersom den gamla takten räknades fram över precis de
bildrutor som spelades in:

| Rakt ut med riktiga tangenttryck | Tid i kylan, förut → nu | Död bortom kanten, förut → nu |
|----------------------------------|-------------------------|-------------------------------|
| till fots, rask gång (W + Shift) | 16,1 s → 25,7 s         | 89 m → 141 m (cirka 485 m ut) |
| Saaben i full fart               | 7,6 s → 10,8 s          | 197 m → 304 m (cirka 650 m ut) |

### Varningarna följer med

- **Det som hänger på mätaren följer med av sig självt:** frosten i bildkanten, huttrandet och
  händerna i fickorna, tandskallret, andedräktens takt, hjärtat (från 72 %), raderna under mätaren
  och att musiken drar sig undan. Står man stilla kommer allt 2,5 gånger så långt före döden.
  Hjärtat hörs till exempel 31 s före döden vid kanten, mot 12,6 s förut. Gick man rakt ut kom
  varningarna så här många sekunder före döden (mätt i `coldwalk`):

  | Varning                         | Förut | Nu   |
  |---------------------------------|-------|------|
  | Ove huttrar (och tänderna)      | 9,1   | 13,2 |
  | frost syns i bildkanten         | 8,9   | 12,8 |
  | *Ove tänker på Sonja* (notisen) | 3,8   | 8,5  |
  | snöyran halvvägs till vitt      | 5,7   | 7,6  |
  | hjärtat                         | 2,7   | 3,8  |
  | *Vänd om, Ove*                  | 2,4   | 3,4  |

- **Snöyran** hängde på avståndet, inte på mätaren. Den var som värst 170 m bortom kanten. Nu kommer
  Ove längre ut innan han dör, så den hade blivit helvit långt före döden (i Saaben de sista 134 m,
  ungefär 5 s, och till fots 0,96 när han dör), och då ser man inte vägen tillbaka. Därför är den nu som värst 255 m ut (`whiteout`). När
  han dör är snöyran lika tät som förut: 0,7 till fots och precis helvit i bilen.
- **Sonja-notisen kommer tidigare: vid 45 % i stället för 62 %.** Den är den enda varning som säger
  åt Ove att vända (*Ove tänker på Sonja. Hon hade sagt åt honom att vända.*). Vägen rakt tillbaka
  kostar lika mycket kyla som vägen ut, så den som har gått rakt ut kan inte vända efter 50 %. Den som
  lydde notisen vid 62 % frös därför alltid ihjäl på vägen hem (`WARN=0.62 coldback`: död 71 m från
  kanten). Den som vänder vid notisen nu klarar sig hem, och mätaren stannar på 93 %. Det här är det
  enda som inte bara var en siffra som skalades om, men utan det kom varningen inte i tid.

### Tinandet

Inne i stan tinar Ove nu på **24 s** från helt nedkyld (förut 18 s), och i bil med värmen på på
**12 s** (förut 9 s). Det tar ungefär lika lång tid att bli varm som det snabbaste sättet att frysa
ihjäl från kanten tar: rask gång rakt ut 26 s, Saaben i full fart 11 s. Man väntar alltså aldrig
längre på att bli varm än man kunde ha varit ute, och stan är fortfarande en säker plats. Men en ny
tur ut direkt efter den förra blir kortare, och en kort sväng utanför kanten kostar fortfarande
något. Den som vände vid Sonja-notisen (93 %) är varm igen efter 22 s.

### Tester (`tools/scenarios/cold.mjs`)

- **`coldwalk` och `colddrive`** (riktiga tangenttryck) mäter nu takten. Varje uppdatering av
  mätaren spelas in i sidan. Varje bildruta lägger till takten × dt, så takten där Ove var kan läsas
  av bildruta för bildruta. Den räknas om till sekunder till döden vid kanten, 70 m och 140 m ut. Båda
  scenarierna mäter också tiden i kylan, när varje varning kom och när ljuden hördes första gången, och
  räknar den gamla takten över samma väg. Kontrollerna:
  - 112,5 ± 4 s, 28 ± 1 s och 12,5 ± 0,6 s.
  - Minst 1,4 gånger så lång tid i kylan som i den gamla takten.
  - Notisen och hjärtat kommer vid sina mätarnivåer.
  - Till fots: 20–32 s i kylan, döden 460–540 m ut, och varje varning minst 1,25 gånger så tidigt
    som förut (notisen minst 1,8 gånger).
  - Med bilen: 8–15 s i kylan.
- **`coldback`** är omskriven: ut med riktiga tangenttryck tills Ove tänker på Sonja, sedan rakt
  tillbaka. Han ska komma in levande och tina till noll. "Aldrig död" räknar nu dödsfallen, eftersom
  den gamla kontrollen godkände en död som han hunnit vakna upp från. `WARN=0.62` kör den med den gamla
  gränsen.
- **`coldrate`**: de nya siffrorna, 110,9, 27,9 och 12,4 s.
- Körda och godkända: `coldwalk`, `colddrive`, `coldback`, `coldrate`, `coldbed` och `story` (`#7
  idle`, `no errors`).

Siffrorna i features/implemented/avgrunden.md, README.md, DESIGN.md (4.8), CLAUDE.md,
notes/integration.md och notes/rendering.md är uppdaterade.

### Avvikelser och kvar

- "2,5 gånger så lång tid överallt" gäller för varje plats. Den som rör sig utåt får 1,4–1,6 gånger
  så lång tid, eftersom han hela tiden kommer ut där det är kallare.
- I Saaben i full fart kommer Sonja-notisen bara 2,8 s före döden. Det räcker inte för att bromsa och
  vända, och där är det mätaren, frosten och snöyran som varnar. Notisen skulle kunna räkna med vad en
  U-sväng kostar där bilen är, så att den kommer tidigare i full fart. Det är inte gjort.
