# Snöspår

## Önskemålet

När man går eller kör bil i snön så borde det bildas spår.

De behöver inte vara där permanent eller så (mycket att spara+extrajobb att rendera?),
men spara iaf ett par dussin meter.
Försvinner efter en ny dag.

## Vad som blev gjort (2026-10-15)

### Vem som lämnar spår, och var

- **Fotspår** efter alla som går i snön: Ove, och folk på gatorna och grannarna inom 70 m från
  kameran. Ett avtryck per steg, precis där foten sätts ner (fotens ben i animationen, tidigt i
  steget, när sulan ligger platt), vänster och höger om vartannat, tårna lite utåt som på
  gubben själv. Landar man efter ett hopp, eller kliver ur bilen, blir det två avtryck bredvid
  varandra. Storleken och sulan kommer från personens skor: vinterkängor ger grova klackmönster,
  gympaskor fina vågor, vanliga skor (som Oves) en fristående klack. Barn trampar mindre och grundare,
  den som springer djupare.
- **Hjulspår** efter allt som rullar i snön: bilen Ove kör och alla bilar inom 100 m, släpkärran,
  snötraktorn (breda spår med stora vinklade klackar) och Runes rullstol (två smala spår efter de stora
  hjulen och två ännu smalare efter de små framhjulen). Ett spår per hjul, så fram- och bakhjulen syns
  isär i en kurva. Ett däck som glider i sidled smetar ut ett bredare spår, och det gamla bleka
  sladdmärket ritas inte längre på snö (bara på asfalt).
- **Bara i snö**: gräsmattorna, parken, snöhögarna (hoppbacken, förskolans pulkabacke), fotbollsplanen,
  fälten och skogsvägarnas kanter utanför stan. Inget på asfalt, plattor, grus eller is, inget
  på en bänk eller ett biltak, inget i luften (en bil som flyger från hoppbacken får ett spår upp till
  kanten och ett nytt där den landar).
- Ute i **snöyran** bortom stan blåser nya spår igen (helt borta på ~40 s när det blåser som mest).

### Hur länge de ligger kvar

- Tills **en ny dag gryr** ("Ny dag"-skylten): då är alla spår borta.
- Fram till dess ligger de i ringbuffertar, där de äldsta tonar bort innan de skrivs över: Oves egna
  fotspår och hjulspåren efter bilen han kör för sig (~560 m promenad, ~500 m bilkörning i snö), allt
  annat för sig, så att trafiken aldrig suddar ut Oves spår. Det är långt mer än "ett par dussin meter".
- Spåren sparas inte: en omladdning börjar med orörd snö.

### Hur de ser ut

Spåren ritas med snöns egen yta (samma textur, drivor och glitter som marken under), och formen kommer
från en höjdfunktion per pixel: sulans kontur med branta, smuliga väggar och en liten upptryckt kant,
mönstret i botten; däckets platta botten med rundade kanter, vallar på sidorna och slitbanan. Lutningen
böjer ytans normal, och den låga solen (13°) kastar skugga in i gropen: en fyra centimeter djup sko i
solen ligger mest i sin egen blå skugga med den bortre väggen solbelyst, ett hjulspår får ett skuggband
längs ena väggen. I skugga är de mjuka, lite blåare gropar. Mönstren i sulor och däck är svaga och
ojämna (snön tar inte emot hela mönstret) och försvinner på avstånd i stället för att flimra. Spåren
tonar bort 90–140 m bort.

Kostnad: två draw calls till. Med alla ringar fulla och allt i bild uppifrån 0,4 ms GPU (RTX 4070),
från en följekameras höjd inget mätbart. Själva uppdateringen ~3 µs per bildruta.

### Skillnader mot önskemålet

- Inte bara Ove: alla som går eller kör i snön nära kameran lämnar spår (det är snön som har spår,
  inte spelaren).
- Mer än ett par dussin meter sparas (hundratals), och spåren tonar bort i stället för att poppa bort.
- Snöyran utanför stan fyller igen spåren (ett tillägg).

## Kod

- `src/game/tracks.js` (ny): spåren. `tracks.init(scene)`, `tracks.update(game, dt)` (main.js, varje
  bildruta efter `syncAll`), `tracks.clear()` (missions.js `updateGate`, gryningen), `tracks.on`
  (`&notracks` stänger av), för tester `stats()`, `feetList(ring)`, `rutList(ring)`, `meshes()`,
  `debugFill(x, z, r)`; `window.__tracks`.
- `src/world/surface.js`: `surfaceHit` (`y` = den registrerade markbitens höjd, alltså gräsmattans
  synliga yta; `raw` = vad den registrerades som, så att is kan undantas).
- `src/main.js`: init, uppdateringen, och sladdmärket (`fx.skid`) läggs bara där marken inte är snö.
- `src/game/missions.js`: gryningen rensar spåren.
- DESIGN.md 4.10 och 10.5, notes/integration.md och notes/rendering.md (*Tracks in the snow*),
  notes/world.md (`surfaceHit`), CLAUDE.md.

## Verifiering

`PORT=88xx node tools/shot.mjs <scenario>` med `tools/scenarios/snospar.mjs`:

- `snospar` (riktiga tangenttryck, 20 kontroller): Ove går 7 m över en gräsmatta: ett avtryck per steg
  (0,91 m mellan), alla inom 8 cm från linjen han gick, åt rätt håll, vänster/höger om vartannat, i
  skostorlek; springer; hoppar (två avtryck); går på gatan (inga). Parvaneh går över en gräsmatta
  (hennes avtryck, mindre än Oves). Saaben på fotbollsplanen: fyra spår under hjulen, en sladd med
  handbromsen ger bredare spår, inga spår på vägen. En ny dag: allt borta, och nya spår efteråt.
- `sposmore`: upp och över hoppbacken (spår uppför, inget segment över flygningen), Patricks bil med
  släpkärra, snötraktorn, Runes rullstol som rullar iväg, Ove ute i kylan (avtryck på bergens mark,
  som börjar fyllas igen).
- `sposlook`: närbilder i skugga och sol, följekamerorna; `sposperf` (`QUERY='&gputime'`): kostnaden.
- Regression: `story` (alla sju dagarna, `#7 idle`, no errors), `start walk drive drift coldwalk
  colddrive`.
