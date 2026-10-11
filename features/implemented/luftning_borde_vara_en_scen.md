# Luftningen borde vara en scen

## Önskemålet

Luftningen av elementen är nu bara fade-to-black med text som säger att Ove luftade elementen.

Borde vara en liten cutscene (inifrån).

## Vad som blev gjort (2026-10-11)

Dag 3:s sista steg, "Gå in och lufta elementen" vid Anitas och Runes dörr, är nu en kort scen inne i
deras kök i stället för en övertoning till svart. Ett tryck på E: svart, "Ove går in och luftar
elementen.", och sedan är vi inne. Själva köket syns i ungefär 14 sekunder, och allt som allt är man
tillbaka på gången efter 18 sekunder. Därefter går spelet vidare precis som förut (UPPDRAG KLART,
avslutningen på gången med Anita och Rune).

**Scenen** (s från trycket på E):

- **1,3**: köket, från bortre änden. Ove på ett knä vid elementet under fönstret, Anita och Rune (i
  rullstolen) tittar på. Han knackar tre gånger: det ekar ihåligt. Ute på fönsterblecket sitter
  redan en grå randig katt och tittar in, men det är inte många som ser den än.
- **3,0**: från sidan. Han lägger örat mot elementet med handen på det. Det kluckar.
- **4,6**: ventilen. Mässingsnyckeln mellan tummen och pekfingret, Anitas finkopp (vit med blå
  rand) under. Nyckeln vrids, och luften pyser ut med en tunn strimma ånga.
- **6,7**: Oves ansikte, Anita och Rune bakom honom. Det pyser. Och pyser. Ove vänder sig och tittar
  rakt in i kameran, och han tittar länge. Rune somnar med hakan mot bröstet.
- **9,1**: det fräser och spottar, och i koppen droppar rostbrunt elementvatten. Droppen klingar
  ljusare ju fullare koppen blir, och sist kommer en liten stråle. Nyckeln vrids tillbaka.
- **11,5**: en knackning till, nu en dov duns (elementet är fullt). "Mm." och en nick, och Anita
  nickar också. Rune vaknar med en snarkning.
- **13,5**: det Ove ser är katten på blecket, som tittar in och lägger huvudet på sned.
- **14,3**: det katten ser är Ove, öga mot öga. "Hmpf."
- **15,2**: katten tittar bort (inte imponerad). Svart: **"Sex element till. Ett i taget."** Sedan
  tillbaka på gången.

Katten är dagen-före-blinkningen. På dag 4 är det den Ove fångar vid cykelförrådet, och den hänger
redan på anslagstavlan ("Upphittad: grå randig katt").

**Hoppa över**: som spelets andra scener, med Mellanslag, E, Enter, ett klick eller handkontrollens
A/Y (E-trycket som startade scenen räknas inte). Scenen går då direkt till den sista svarta bilden,
och man är ute igen på drygt 2 s. Ge upp-tangenten (Q) fungerar inte under scenen, liksom under
andra scener.

**Repliker**: inga nya. Ove säger bara "Mm." och "Hmpf.", som är hans småpratssvar (`OVE_REPLY` i
script.js) och redan röstade. Allt annat är ljud och mimik. script.js, tools/voice och
röstmanifestet är orörda, och inget behöver röstas.

**Ljud** (syntetiserade, `audio.synth`): knackningarna (ihåligt plåtklang, sedan en dov duns),
kluckandet, nyckeln (tick, ett litet gnissel, tick), pyset (brus som fladdrar och en tunn vissling
som sjunker när trycket går ned), fräsandet, dropparna, strålen och Runes snarkning. Musiken sänks
till 30 % medan scenen pågår.

### Hur

- **Kulissen** (`src/world/interior.js`): ett litet 70-talskök, byggt inne i Anitas och Runes riktiga
  radhus, så att köksfönstret vetter mot den riktiga gången med grannarnas hus mittemot. Det har
  grön stående panel under krämfärgad puts, linoleumgolv, ekfärgade köksskåp med diskbänk, spis och
  bryggare, ett teakbord med röd löpare, kaffekoppar, termos och kanelbullar, en trasmatta, en
  opalglaslampa, en köksklocka (tjugo i ett), en bonad ("Borta bra men hemma bäst"), orange
  gardiner med kappa, en adventsljusstake och en pelargon i fönstret, och elementet med
  termostat, rör och luftningsventil. Allt är GeoBuilder med ytor från tabellen (`plaster`, `wood`,
  `painted`, `plastic`, `fabric`, `metal`, `chrome`, `light`, `water`), inga nya material och inga
  ljuskällor. Rummet lyses av himlen som allt i skugga, och lamporna bara lyser (`glow`). Kulissen
  byggs när det blir svart (cirka 150 ms, bakom ridån) och tas bort när det blir svart igen, så den
  kostar ingenting under spelet.
- **Fönstret**: husen är slutna lådor som syns inifrån bara som sina insidor, och de ritas inte.
  Fönsterbågen och mittposten är de riktiga och syns inifrån, men rutan (en ogenomskinlig
  'glass'-låda) hade blivit en grå skiva. Därför har just det fönstrets ruta en egen mesh
  (`kitchenGlass` → `win(..., { glassG })` i kit.js, `interiors.rune` i data.js, `pane:rune` i
  town.js) som scenen döljer. Utifrån ser fönstret ut som förut, och resten av staden är byggd
  likadant.
- **Folket**: dockor (`buildCharacter` + `animateCharacter`), utan fysik. Den riktiga Ove, Anita och
  Rune döljs under tiden. Inomhus har Anita kofta och Rune varken mössa eller rock. Ove står på knä
  (`kneelPose`), och scenen styr hans händer: `st.hands`, `st.lean` och `st.head` är nya i
  models.js (notes/people.md). Det blir knytnäve vid knackningarna, handflata på elementet,
  pincettgrepp om nyckeln (vridningen roterar handen) och handen runt koppen.
- **Kod**: `src/game/luftning.js` (scenen, tidslinjen `T`, bildvinklarna `SHOTS`, ljuden),
  `holdAt({ scene })` i stages.js, dag 3 i missions.js, musiksänkningen i main.js.
- **Dokumentation**: notes/story.md (*Day 3's radiator scene*), notes/world.md (*Rooms inside the
  houses*), notes/people.md (kneel), DESIGN.md (dag 3), CLAUDE.md, README.md.

### Tester

- `luft` (story.mjs): scenen stoppas vid varje ögonblick för en skärmbild (`out/luft_*.png`), och
  sedan kontrolleras att man är tillbaka på gången utan kvarlämnad kuliss, med rutan, folket och
  ridån som förut. `luftskip`: Mellanslag mitt i, och scenen ska vara slut inom 3 s. `luftsound`:
  ljuden renderas offline, ingenting spelas upp. Toppnivåerna ligger på 0,05–0,15, ungefär som
  dörrens 0,13, ingen klipper, och pysets RMS är 0,028.
- `story` spelar scenen på dag 3 som vanligt.

### Avvikelser och kvar

- Ärendet "Elementet klickar" (fri roam, utan uppdrag) är fortfarande ett vanligt håll-E-jobb. Det är
  kort med flit och var inte en övertoning.
- Kameran kan inte filma in genom fönstret utifrån, eftersom husets framsida är ogenomskinlig där
  också. "Det katten ser" är därför filmat inifrån, framför fönstret.
