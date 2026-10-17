# Rune är permadöd

## Definitionen

ok, i features/implemented/roligare_runeuppdrag.md så sa vi att han bara remains död om man väljer
att inte resetta uppdraget.

Men typ ingen kommer göra det, så... istället, gör så att det blir permanent direkt om han dör, ingen
möjlighet till reset.

Och se till att man verkligen kan rulla in honom i traffik (borde krävas en mindre kollision om det är någon annan bil som kör på honom - och se till att npc:n som kör inte bromsar in om rune är framför)

Och dödsfall borde ske även om man kör på honom utanför köld-uppdraget!
dvs. om man t.ex. kör på honom dag 1 när man backar med bilen osv.

## Vad som gjordes (2026-10-17)

Det mesta ligger i `src/game/rune.js` (`game.rune`) och i `carsVsPeople` / `obstacleAhead` i
`src/main.js`. "Försök igen / Ge upp"-maskineriet i `src/game/interruptions.js` är borta.

### Död är död, direkt

- När Rune dör (bil eller kyla) är han **död för gott i samma ögonblick**: det sparas på en gång
  (`rune: 0`), RUNE ÄR DÖD visas med orsaken i 4,5 s (med "Avbrott" ovanför om han var på sitt
  ärende), −10 Ordning (som ett misslyckat ärende) och misslyckat-jingeln. Ingen "E Försök igen ·
  Q Ge upp", och Ove står inte fastfrusen och väljer: han kan gå vidare direkt.
- Var han på sitt ärende ("Rune har rullat iväg") är det slut och räknas som misslyckat, men
  ärendet säger inget eget ("FÖR SENT" och Anitas "Grannarna hittade honom..." kommer inte).
- Sedan beskedet: en notis efter 2,6 s, "Rune är död. Anita är ensam nu.", och Anita:
  - **såg hon det** (hon var inom 25 m, t.ex. hemma vid deras dörr) ropar hon "Rune..." där hon
    står (efter Oves "Rune?"), och sörjer sedan som vanligt;
  - **annars ringer hon** ("Ove? De har hittat Rune. Han är död, Ove. Han är död.") så fort ett
    samtal passar: inte mitt i en scen, inte över ett annat samtal eller någon som pratar.
- Kroppen ligger kvar minst 8 s även om den hamnar utanför bilden (så att man hinner vända sig
  om och se), och försvinner direkt om Ove är mer än 30 m bort.
- Allt efteråt är som förut: Anita förkrossad resten av spelet, hans ärenden kommer inte längre,
  dag 3, 6 och 7 utan honom.

### Påkörd var som helst, när som helst

- **Vilken bil som helst, var som helst, vilken dag som helst**, ärende eller inte, hemma vid dörren
  eller på gatan, skjuten av Ove eller inte. Även **släpkärran**: backar man Patricks bil med släp
  in i honom (dag 1-exemplet) så dör han.
- **Mindre krävs**: förut skulle en bil komma mot honom i mer än 4,5 m/s (det som fäller en
  fotgängare). Nu räknas hur fort bilen och han närmar sig varandra (bilens fart mot honom minus
  hans egen rullning, så en rullstol som rullar in i sidan på en bil som kör förbi räknas också):
  - **Oves egen bil**: mer än 1,7 m/s (ungefär 6 km/h, långsam promenad) och bilen själv fortare
    än 1,5 m/s. En släpkärra backas i högst 2,2 m/s, så den räcker. I 1,2 m/s knuffas han bara
    undan, som förut.
  - **Alla andras bilar**: redan över 1,0 m/s.
- Orsaken i banderollen: "Rune blev påkörd." (någon annans bil), "Ove körde över Rune.", ny:
  **"Ove backade över Rune."** (Oves bil på väg bakåt), "Rune frös ihjäl." / "... bortom skogen.".
- Aldrig på titelskärmen och aldrig när han är "av scenen" i en scen (dag 3:s kök).

### Trafiken bromsar inte för honom

- Bilarnas "något framför mig?" (`obstacleAhead`, som all trafik, jakter och racet använder) ser
  inte Rune i rullstolen. Rullar man ut honom i gatan kör trafiken rakt på honom i full fart.
- Hans **kropp** ser de däremot, precis som vem som helst som ligger på vägen: bilarna stannar.

## Skillnader mot definitionen

- **Kylan** dödar honom fortfarande bara på ärendet (det är där hans köldmätare finns); definitionen
  bad bara om påkörningar utanför ärendet.
- **Oves bil** har också fått en lägre gräns (1,7 m/s i stället för 4,5), inte bara andras: annars
  hade dag 1-exemplet (backa med släpkärra, högst 2,2 m/s) aldrig kunnat döda honom. Andras bilar
  har en ännu lägre gräns (1,0), som definitionen ville.
- **Anitas reaktion** beror nu på var han dog: förut ringde hon alltid (först när man valt Q). Dör
  han framför henne vore "De har hittat Rune" konstigt, så då ropar hon i stället. Inga nya
  inlästa repliker behövdes (hennes "Rune..." och Oves "Rune?" fanns redan).
- En död mitt under en storydag **misslyckar inte dagen**: dagen fortsätter, och dess outro (som
  väljs när den börjar) är änkans version om han hunnit dö.
- `rune.revive()` finns kvar men bara för testerna (flera dödsfall på en sidladdning); spelet
  anropar den aldrig, och ärendet väcker inte längre liv i honom.

## Verifiering

Scenarier i `tools/scenarios/rune.mjs` (fel blir 'N errors'):

```sh
PORT=88xx node tools/shot.mjs runecar runetraffic runehome runecold   # det nya
PORT=88xx node tools/shot.mjs runeroll runekick runewidow runelook    # det gamla, oförändrat
PORT=88xx node tools/shot.mjs story                                    # felar om Rune dör någon dag
QUERY='&runedead' PORT=88xx node tools/shot.mjs story
```

- `runecar`: en bil i 13 m/s på ärendet: död, stolen på sidan, RUNE ÄR DÖD / "Rune blev påkörd." /
  "Avbrott"; ärendet slut och misslyckat, sparat som död, ingen E/Q-prompt, Ove inte fasthållen;
  Anita sörjer, notisen och hennes samtal kommer; ärendet erbjuds aldrig igen. Sedan Saaben med W
  (utan ärende): "Ove körde över Rune." utan "Avbrott". Gränserna: någon annans bil i 1,5 m/s
  dödar, Oves i 1,2 m/s knuffar bara, Oves i 2,2 m/s dödar, rullad in i sidan på en bil som kör
  förbi i 4 m/s dödar.
- `runetraffic` (riktiga tangenter): utan ärende sparkas Rune (J) från trottoaren ut i körfältet på
  Solrosvägen; en trafikbil med egen AI kommer 70 m bortifrån, ser honom aldrig (`obstacleAhead`),
  bromsar inte (12,6 m/s 30 m före, 11 m/s i träffen) och kör över honom. Hans kropp, och Anita
  ställd där han ligger, ser den.
- `runehome` (riktiga tangenter): hemma vid hans dörr, utan ärende, backar Ove (S) en bil med
  släpkärra längs gången in i honom i 2,2 m/s: död, "Ove backade över Rune.", sparat; Anita såg
  det och ropar "Rune...", inget samtal; omladdning (inte fresh): fortfarande död.
- `runecold`: ihjälfrusen bortom skogen: ärendet slut direkt, sparat, ingen E/Q.
- `story` har fått en kontroll (`runeCheck`): ingen dag får döda Rune av sig själv (t.ex. botten som
  backar Patricks släpkärra dag 1, som står parkerad på gången vid hans hus).
- Bilderna (läst själv): rune_traffic_* (bilen i fart, dammet, stolen på sidan), rune_home_*
  (släpkärran mot honom, Anita med handen för ögonen och "Rune..."), rune_car_*, rune_cold_*,
  rune_look_*.
