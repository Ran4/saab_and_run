# Fixa outro: Anita osynlig efter luftningen

## Felet

Röstsessionen körde `vcut` (TO=7, rösterna på, en läsare som trycker Enter efter varje replik) och
fick två fel i outro-kontrollen:

```
CHECK FAILED day 3 outro: anita d=2.28 wall=false shown=false
CHECK FAILED day 6 outro: anita d=2.3 wall=false shown=false
```

`shown` är `n.root.visible && n.state === 'normal'`. Anita stod alltså på rätt plats och i rätt
läge (`normal`), men hon var osynlig, och hon förblev osynlig resten av spelet. Dag 6 är nästa gång
hon är med i en avslutning, så felet på dag 6 är samma fel som på dag 3. Felet kom med 1c19bb3
(luftningsscenen på dag 3) och syntes bara ibland. En tidigare vcut-körning på samma kod gick
igenom, liksom `story` och `vstory`.

## Orsaken

- Luftningsscenen (`src/game/luftning.js`) bygger kulissen 0,65 s efter E-trycket, bakom ridån. Då
  döljer den den riktiga Ove, Anita och Rune, eftersom dockor spelar dem i köket. Den sparade
  samtidigt hur synliga de var (`[o, o.visible]`), för att lägga tillbaka det när scenen var slut.
- Under de 0,65 sekunderna går spelet som vanligt bakom ridån, och följekameran står bakom Ove vid
  dörren. `hideNearCamera()` (main.js) döljer i varje bildruta den som kameran har hamnat inuti
  (inom armlängds avstånd från linsen) och visar dem igen i nästa bildruta. Om kameran står åt
  Anitas håll är hon dold just den bildrutan. Huset bakom Ove drar då in kameran mot honom, och
  Anita står en knapp meter från honom.
- Det var just "dold" som scenen sparade. I bildrutan därpå visade `hideNearCamera` henne igen, så
  den riktiga Anita stod synlig ute på gången medan dockan var i köket. När scenen var slut lade
  den tillbaka "dold". Inget i spelet visar igen en granne som har läget `normal` (det sker bara
  när läget byts från `hidden`), så hon förblev osynlig: i dag 3:s avslutning, på dag 4 och 5, och
  i dag 6:s avslutning.
- Vilket håll kameran står åt beror på vilket håll Ove tittade åt i steget före. Testet ställer
  honom vid dörren men behåller hans riktning. Läsaren ändrar bara tajmingen, och därmed Oves
  riktning. Därför föll ungefär varannan vcut-körning, och inte `story` eller `vstory` den gången.
  Gissningen att läsarens Enter hoppar över scenen stämmer inte: läsaren trycker bara medan
  dialogrutan syns, och det gör den inte i scenen. Gissningen att Anitas rot redan var dold när
  `build()` kördes stämmer, och den förklarar också dag 6. Hoppets ändringar (298fc6c) har inget
  med felet att göra.
- Samma sak hände Rune, när kameran stod hos honom (se `luftcam` nedan). Ove döljs aldrig av
  `hideNearCamera`, men en sparad bild av hans synlighet hade fått med allt annat som råkade dölja
  honom just då.
- Bisektering behövdes inte. Felet gick att återskapa varje gång, med kameran vid Anita när scenen
  började: "false/normal" efteråt, exakt som i vcut.

## Rättningen

- **main.js `offstage(ch, off)`**: en scen som spelar någon med en docka tar den riktiga av scenen
  med `offstage(ch, true)`. Personen är då dold, och `hideNearCamera` varken visar eller döljer hen
  under tiden. Efteråt sätter `offstage(ch, false)` tillbaka personen så som hens läge säger
  (synlig om inte `state === 'hidden'`), aldrig så som hen råkade vara när scenen började.
- **`hideNearCamera`** visar inte igen någon som en scen har tagit av scenen. Den riktiga Anita
  syns alltså inte heller ute på gången under scenen.
- **luftning.js** använder detta för Ove, Anita och Rune. Fönsterrutan har kvar sin sparade
  synlighet, eftersom den är en vanlig mesh som inget annat döljer.
- Dokumentation: notes/story.md (*People* i dag 3:s scen), notes/integration.md (kameran och ett
  eget avsnitt), CLAUDE.md och README.md (`luftcam`, `LUFTSKIP`).

## Tester

- **`luftcam`** (ny, story.mjs) startar scenen med kameran hos Anita och sedan hos Rune. Testet
  letar självt upp en kameravinkel vid dörren där `hideNearCamera` döljer personen, och håller
  kameran där tills kulissen är byggd. De riktiga personerna ska vara dolda under hela scenen, och
  alla tre ska synas efteråt. Utan rättningen faller sex kontroller (båda syns under scenen och är
  borta efteråt). Med rättningen: inga fel.
- **`vcut` med `LUFTSKIP=s`**: läsaren hoppar också över luftningsscenen med Enter, s sekunder in i
  den (1 = medan det fortfarande är svart).

### Körningar efter rättningen (2026-10-11, headless, egna portar, ljudet avstängt)

| Körning | Resultat |
|---|---|
| `vcut` TO=7 (rösterna på, läsaren trycker Enter) | `no errors`. Anita syns på dag 3 och 6. 0,8 % avklippt (1 av 120), inga två röster samtidigt; omförsöket 0 % |
| `vcut` TO=7 `LUFTSKIP=1` (Enter medan det är svart, 1,02 s in) | Anita syns på dag 3 och 6. **1 fel av ett annat slag**: `outro day 6 #0: SkinnedMesh 1.44 m from the lens` (se nedan). 0,9 % avklippt |
| `vcut` TO=3 `LUFTSKIP=6` (Enter mitt i scenen, 6,02 s in) | `no errors`. Anita syns på dag 3 |
| `vstory` | `no errors`, `#7 idle`. 0,8 % avklippt, inga två röster samtidigt |
| `story` | `no errors`, `#7 idle` |
| `luft`, `luftskip`, `luftcam` | `no errors`. Scenen ser ut som förut, och alla tre är tillbaka efteråt |

**Två saker som inte hör till felet:**

- `vstory` föll en gång på dag 1 med `Cannot read properties of undefined (reading 'yaw')`. Det
  hände när den gick parallellt med `vcut`. Felet låg i testet: `reverseInto` (story.mjs) läste
  `missions.stage.b` i ett nytt anrop efter kontrollen att steget var `parkIn`. Hann bilen in i
  rutan mellan de två anropen var steget redan borta. Hjälpfunktionen kontrollerar nu steget i
  samma anrop. Körd ensam var `vstory` ren.
- I dag 6:s avslutning med `LUFTSKIP=1` stod Anita och Rune redan intill Ove när dagen tog slut
  (Anita vid dörren, Rune i rullstolen till höger). `placeCast` låter den som redan står bra stå
  kvar, och kameran för tagningen med alla tre hamnade då 1,4 m från Runes huvud, som sticker in i
  bildens hörn. Det har med kamerans bildval att göra, inte med synligheten.
