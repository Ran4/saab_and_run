# Roligare Rune-uppdrag

## Definitionen

Rune-uppdraget där man hämtar honom i rullstol hade kunnat vara roligare.

1. När man tagit tag i honom, gör det möjligt att släppa honom (och ta i honom igen) med E.
Om man springer när man gör det så rullar han fram en bit i stolen, så att man t.ex kan rulla in honom
framför en bil t.ex., det behöver hanteras också - man får uppdragsfail om han dött.
Om man inte retryar uppdraget utan ger upp så förblir han död - hans
fru är förkrossad i resten av spelet, hörs då och då gråta när man går förbi osv.
(det händer from att han dör, så det gäller även när uppdraget i en "vill du retrya?"-fas).

Även om man inte håller i Rune, så ska man kunna sparka för att få stolen att rulla framåt.

2. Istället för en tidsfrist, visa hur kall Rune är (lite som när man åker utanför banan),
och gör så han blir kallare över tid. Vid för hög kyla så dör han (precis som i punkt 1 ovan).
Det ska ta rätt lång tid (typ, 5min totalt från att man får uppdraget), samma tid oberoende av om ännu inte
kommit fram till honom eller om man har hämtat honom och håller på att rulla honom tillbaka till radhuset
där han bor.

Det roliga är att man kan rulla ut honom utanför banan för att frysa ihjäl honom snabbare
(tanken med att ha just "kylfrist" istället för tidsfrist är att spelaren ska få den iden,
det här är ju lite av ett sandboxspel även om det är rätt hårt scriptat).

## Vad som gjordes (2026-10-14)

Det mesta ligger i en ny modul, `src/game/rune.js` (`game.rune`), och i avbrottets byggsten
`escort` i `src/game/stages.js`. Avbrottet är "Rune har rullat iväg" (`src/game/interruptions.js`).

### Rullstolen

- **E tar tag i rullstolen, E släpper den.** Förut tog Ove tag i den av sig själv när han kom inom
  2,2 m. Nu står det "E Ta tag i rullstolen" när han är nära och "E Släpp rullstolen" medan han
  håller i den. Runes "...Ove?" kommer första gången.
- **Släpper man i farten (Shift) rullar han vidare.** Stolen får Oves fart längs den, minst 3,2 m/s,
  gånger 1,4 (en knuff när händerna släpper), och rullar då ungefär 15 m. Går man bara och släpper
  rullar den under en meter. Den bromsar på snön (0,85 m/s²) och stannar mot väggar, staket och bilar
  (med en duns om den kom fort). Medan den rullar har Rune händerna i knät.
- **En spark (J) får stolen att rulla**, även när ingen håller i den, och även hemma vid dörren
  (utanför ärendet tar han aldrig skada och rullar hem igen av sig själv). Hjulen rullar bara framåt
  och bakåt: en spark bakifrån skickar honom ~8 m framåt, en framifrån bakåt, en från sidan vrider
  stolen lite och rullar den mindre. Han säger fortfarande något när han blir sparkad.
- På sitt ärende vänder Rune inte längre stolen mot Ove när han kommer nära, så att en spark
  bakifrån faktiskt rullar honom framåt.
- Målet följer med: "Rune rullar iväg!" medan han rullar, "Ta tag i Runes rullstol igen" när han
  står, och markören pekar på honom. Hemma är hemma vare sig han skjuts eller rullar dit.
- Ingen osynlig vägg för Rune: han åker aldrig någonstans själv, så bara Ove kan ta honom ut bortom
  stan (skjuta, släppa, sparka). Alla andra stannar fortfarande där väggarna stod.

### Kylan i stället för tidsfristen

- Ärendet har ingen tidsfrist längre (`patience: null`). Panelen visar Runes **kroppstemperatur**
  i stället för en klocka, i köldmätarens blå stil: "❄ 36,6°" som sjunker mot 27,0°, en stapel och en
  rad under den (Rune är kall om händerna / Rune fryser / Rune skakar av köld / Rune är blå om läpparna
  / Rune somnar). Över 75 %, eller ute bortom skogen, pulserar värdet.
- **Fem minuter** från samtalet till död, vare sig Ove har hittat honom eller håller på att skjuta
  hem honom. En notis när ärendet börjar: "Rune har bara sin filt. Han blir kallare för varje minut."
- **Bortom skogen** (från `COLD`, där Oves egen köldmätare börjar) läggs tre gånger Oves egen
  kyltakt till: 12 m ut dör han på ungefär 25 s, och längre ut går det fortare. Raden under stapeln
  säger "Här ute fryser Rune fort". Han huttrar mer ju kallare han blir.

### Döden

- **En bil i fart dödar honom** på ärendet, vare sig Ove håller i honom eller inte: samma gräns som
  välter en fotgängare (bilen kommer mot honom i mer än 4,5 m/s och kör själv fortare än 3 m/s).
  Stolen välter på sidan och glider några meter. Oves egen bil räknas också.
- **Kylan**: vid 100 % sjunker han ihop i stolen (huvudet mot bröstet och åt sidan, ögonen stängda,
  en arm hänger ner bredvid hjulet).
- Ove säger "Rune?". Ärendet misslyckas som en dag gör: **RUNE ÄR DÖD** ligger kvar med orsaken
  ("Rune blev påkörd." / "Ove körde över Rune." / "Rune frös ihjäl." / "Rune frös ihjäl bortom
  skogen."), och under den "E Försök igen · Q Ge upp". Ove står still medan han väljer, precis som
  efter en misslyckad dag. −10 Ordning som för andra misslyckade ärenden.
- **E**: Rune lever igen och har rullat iväg på nytt (någon annanstans), kylan börjar om.
- **Q** (eller om något annat tar över, t.ex. att Ove själv fryser ihjäl): han förblir död. En notis
  ("Rune är död. Anita är ensam nu.") och Anita ringer, gråtande: "Ove? De har hittat Rune. Han är
  död, Ove. Han är död."

### Död för resten av spelet

- Det gäller från det ögonblick han dör (`game.runeDead`), också medan E eller Q inte är valt, och
  det sparas (`rune: 0` i sparfilen). Laddar man om under E/Q är han alltså död. E nollställer det.
- Kroppen ligger kvar tills Ove har gått därifrån (mer än 30 m, eller när den inte syns), sedan är
  Rune borta. Ärendena som behöver honom kommer inte längre: "Rune har rullat iväg", "Snöskottning"
  och "Elementet klickar" (Anita säger att klickandet oroar Rune, så det kräver honom nu).
- **Anita är förkrossad**: när ingen pratar med henne står hon med huvudet böjt och högerhanden
  för ögonen, vänster arm över midjan. När Ove går förbi (inom 14 m) gråter hon då och då (var 22-38
  s): "Rune...", "Förlåt, Ove. Det går över.", "Varför, Rune? Varför?" eller bara gråt, med
  axlarna som skakar. Hennes småprat byts mot sorg ("Det är så tyst hemma nu, Ove.", "Jag dukade för
  två i morse. Av gammal vana." ...), tutar man åt henne svarar hon "Inte nu, Ove. Snälla.", och
  ORDNING OCH REDA-samtalet blir "... Rune hade tyckt om det." Alla repliker är inlästa med gråt,
  sorg eller bruten röst (ElevenLabs-taggar i `tools/voice/lines.json`).
- **Berättelsen** fortsätter utan honom (se nedan, *Skillnader*): dag 3 (Elementet), dag 6 (Vita
  skjortan) och dag 7 (vid graven) har egna varianter av intro och outro.

## Skillnader mot definitionen

- **Storyn.** Definitionen säger inget om berättelsen, men avbrottet kan komma redan före dag 1, och
  dag 3, 6 och 7 handlar om Rune. Jag frågade utvecklaren (/dev/shm/orch/roligare_runeuppdrag.blocked)
  och valde under tiden att låta storyn gå vidare utan honom, med nya inlästa repliker
  (`introWidow`, `outroWidow`, `callsBackWidow` i script.js, `widow` i missions.js):
  - dag 3: Anita är ensam, Runes "...Saab." och Oves svar hoppas över ("Rune hade velat att det var
    du som gjorde det." / "Hmpf. Han körde Volvo hela livet. Men elementen skötte han."), köket har
    ingen vid hans plats vid bordet;
  - dag 6: det är **Anita** kommunen vill flytta till ett boende ("Nu när Rune är borta säger de att
    jag inte klarar mig själv."), pärmen är "Anitas papper", outrot "Så jag får bo kvar? I vårt hus?";
  - dag 7: vid graven säger Ove "Rune är borta. Anita bor kvar.", och Anitas samtal på vägen dit är
    "Jag tände ett ljus för Rune i dag."
- **Ta tag i honom** krävs nu också första gången (E), inte bara efter att man släppt honom: annars
  hade Ove tagit tag i honom igen av sig själv så fort han kom nära.
- **Sparken** rullar stolen åt det håll den sparkas (längs stolens egen riktning, framåt eller
  bakåt), inte alltid framåt: en rullstol rullar inte åt sidan.
- Bara på ärendet kan han dö. Hemma kan man sparka iväg honom, men bilar knuffar bara undan honom som
  förut (där finns inget uppdrag att misslyckas med, och ingen fråga om att försöka igen).
- Kylan ute bortom skogen är 3 × Oves egen takt utöver de fem minuterna (inget tal i definitionen):
  tillräckligt fort för att det ska märkas, men man hinner se mätaren rusa.

## Verifiering

Nya scenarier i `tools/scenarios/rune.mjs` (fel blir 'N errors'):

```sh
PORT=88xx node tools/shot.mjs runeroll runekick runecar runecold runewidow
PORT=88xx node tools/shot.mjs runelook                 # närbilder: ihjälfrusen, vält, Anita (rune_look_*.png)
QUERY='&runedead' PORT=88xx node tools/shot.mjs story luft   # berättelsen med Rune död
```

- `runeroll`: med riktiga tangenter. E tar tag (prompterna stämmer), Shift+W i 1,5 s, E i farten:
  han rullar vidare 15 m och stannar; gå och släpp: 0,7 m; E igen, hem: klart.
- `runekick`: panelen visar kylan (36,6°), inte en klocka; han vänder sig inte mot Ove; J bakifrån
  rullar honom 7,6 m framåt, framifrån 7,6 m bakåt.
- `runecar`: en bil i 13 m/s: död, stolen vält, RUNE ÄR DÖD / "Rune blev påkörd.", E/Q väntar; Anita
  sörjer redan (gråter när Ove står hos henne); E: han lever och är borta igen. Sedan Saaben med W
  rakt på honom: "Ove körde över Rune.", E igen.
- `runecold`: i stan 1,00 × 1/300 per sekund; utskjuten med riktiga tangenter till COLD + 12: 13,5
  gånger fortare, "Här ute fryser Rune fort"; ihjälfrusen ("bortom skogen"), Q: död för gott, kroppen
  borta när Ove gått därifrån, inga ärenden som behöver honom; omladdning (inte fresh): fortfarande
  död, ingenstans, Anitas småprat är sorg.
- `runewidow` (`?runedead`): Rune ingenstans, ingen av Anitas repliker om en levande Rune, inget av
  hans ärenden, hon gråter när Ove står vid hennes dörr, tutan ger en änkereplik.
- Regression: `story` (alla sju dagarna) och `QUERY='&runedead' story` slutar båda med `#7 idle`
  och `no errors` (med Rune död: bara Anita i dag 3:s och dag 6:s scener, hennes nya repliker,
  inga fel i utrotestet); `errands` (alla nio, Rune med E), `interrupt`, `errandprog`, `companion`,
  `smalltalk`, `corruptsave`, `horn`, `luft` (även med `&runedead`: köket utan honom), `coldwalk`,
  `coldmission`: `no errors`. (`luftcam` med `&runedead` letar efter en kameravinkel som döljer
  Rune och misslyckas då, som väntat: han finns inte.) `make voice-check` går igenom (25 nya klipp,
  1 309 tecken).
- Bilderna (läst själv): rune_roll_*, rune_kick_*, rune_car_* (stolen på sidan), rune_cold_*,
  rune_look_* (ihjälfrusen i stolen, vält, Anita med handen för ögonen), intro3/outro3/intro6/outro6
  med `&runedead`.
