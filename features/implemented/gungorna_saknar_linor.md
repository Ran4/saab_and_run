Gungorna saknar linor, se features/implemented/gungor.png

Gör det även möjligt att knuffa på gungorna genom att trycka på E.
Man skjuter iväg dem, sen när de träffar dig så är det 30% sannolikhet att du ramlar omkull och ragdollar
(lol)

---

## Implementerat (2026-10-17)

### Linorna

Bilden var förskolans gunga: sitsarna hängde i luften under bommen. Radhusområdenas gungor hade
kedjor, men allt var statisk geometri. Nu är **varje gungsits i stan en egen pendel** (24 stycken:
förskolans par och ett par på lekplatsen i vart och ett av de tio radhusområdena, också Oves):

- **Förskolan**: flätade rep (polyester med stålkärna, gråbruna) med kaus och schackel i kroken.
- **Radhusområdena**: galvade kedjor med en svart plasthylsa över den nedre halvmetern, där händerna
  sitter (som på riktiga svenska lekplatser).
- Sitsen är en gummisele som sviktar 3 cm på mitten, ändarna i stålklämmor. Under bommen sitter
  krokfästena (statiska stålplattor); ställningen och bommen är kvar i den statiska världen.
- Sitsarna ritas som två instansierade meshar (en per sort): 4 ritanrop per pass oavsett vad som syns.
  Ingen `rnd` dras, så resten av stan blir likadan.

### Knuffa (E)

Ställ dig bakom en sits, i linje med den och vänd mot den: **"E Knuffa gungan"**. Ove håller fram
händerna, tar tag i kedjorna/repen på ungefär bröstbens höjd (garageportens pose: båda händerna på
en "stång" framför honom), kliver in ett steg om sitsen hänger still, och knuffar iväg den; händerna
följer med tills armarna är raka. Från stillastående går den ut ungefär 34°.

Utöver definitionen: trycker man **E igen när sitsen är på väg tillbaka** håller Ove fram händerna, tar
emot den (den bromsas in i händerna) och knuffar igen, och det den hade med sig läggs till knuffen:
34° → 46° → 53° → 58° … som högst 72° (linorna skulle slakna). Prompten syns bara där sitsen faktiskt
kan nå hans händer (stilla: inom 0,7 m; i gungning: så långt den svänger ut).

### Träffen (30 %)

Står Ove kvar i banan utan att ta emot den kommer sitsen tillbaka och träffar honom (om den själv rör
sig mot honom fortare än 1,25 m/s). Då:

- **30 %**: han går omkull som trasdocka (`p.tumble`, samma ragdoll som när han snubblar): benen
  slås undan från där sitsen träffade, han faller med händerna ut, ligger kvar en stund (sitsen
  svänger över honom), tar sig upp och säger något han redan har repliker för ("Det var meningen.",
  "Det där såg ingen.", "Typiskt.", "Hmpf.": inga nya röstklipp).
- **70 %**: han knuffas lite bakåt (en duns och ett "uff"), sitsen studsar av honom, och
  ibland muttrar han "Hmpf." / "Jaså.".

Samma sits kan inte träffa igen inom 1,2 s.

### Mer som kom med

- **Gå in i en sits** som hänger still: den åker med framför honom (inte en träff), upp till ~57°, sen
  kommer han förbi under den. Släpper han den svänger den tillbaka, och kan träffa honom.
- **Från sidan** är sitsen i vägen som en liten vägg.
- **Saaben** (eller vilken bil Ove kör) genom gungställningen: sitsarna flyger av stötfångaren med ett
  klonk. Står bilen under gungan vilar sitsen mot dess sida.
- **Ljud** (syntetiserade, audio.js `swing`): kedjornas schackel gnisslar / repets kaus knarrar i
  vändläget, en duns och ett kedjeskrammel vid knuffen, en dov smäll vid träffen, klonk mot bilen.

### Kod

- `src/world/swings.js`: sitsarna (`swing(f, lx, lz, o)` från places.js och rowhouse.js, `Swing`:
  pendeln, `SWING`: dämpning och maxvinkel, `buildSwings` från town.js).
- `src/game/gunga.js`: allt spelet gör med dem (`game.gunga`: `step` från `stepWorld`, `update` per
  bildruta: knuffens faser och pose, `reach` för E, `hit`, `touchCar`; `GUNGA` med alla mått).
- main.js: `nearestInteractable` ('swing', före grannarnas småprat om han står rakt mot gungan, annars
  efter), `interact`, prompten, `fixedStep` (knuffen håller honom kvar / kliver in), `handleOneShots`.
- script.js: `OVE_STUMBLE.swing` (befintliga repliker), audio.js: `swing(kind)`.
- Dokumenterat i notes/world.md (*The playgrounds' swings*), notes/integration.md (*The swings*),
  DESIGN.md (4.4), README.md, CLAUDE.md.

### Verifiera

```
PORT=88xx node tools/shot.mjs gunga      # 27 kontroller med riktiga E-tryck vid gungan i Oves område
PORT=88xx node tools/shot.mjs gungfilm   # filmremsor: en knuff, en knuff till, ett fall (out/gungfilm_*.png)
PORT=88xx node tools/shot.mjs gunglook   # närbilder: förskolans rep, radhusområdets kedjor, stilla och i gungning
```

`gunga` kontrollerar: prompten (och att den inte syns bakvänd, för långt bort eller vid sidan), en
knuff från stilla (~34°), tre till i rätt ögonblick (högre varje gång, ≥ 55°, aldrig över 72°), aldrig
träffad medan han knuffar, att den lämnad åt sig själv träffar honom (`gunga.fallNext = true`: ragdoll,
upp igen, på marken; `false`: kvar på fötterna, ett steg bakåt, sitsen studsar), 40 träffar på chans
(förväntat ~12; 4-22 godkänt; körningarna gav 12-18), att gå in i en stilla sits, att gå in i den från
sidan, och Saaben genom paret. Regression: `story`, `garage`, `smaprat`, `smalltalk`, `snubbla`,
`hoppaur`, `start`, `rperf`.
