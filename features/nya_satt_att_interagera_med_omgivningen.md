# Nya sätt att interagera med omgivningen

## Önskemålet

> Behövs mer interaktivitet känner jag. Tänk ut nya sätt att interagera med omgivningen. Återkom med
> en massa förslag.

## Tanken

Tutan, garageporten och hoppbacken fungerar av samma skäl: ett verb, och världen svarar i karaktär.
Barnen jublar, pensionärerna skakar näven, Anders citerar stadgarna och Ove har en åsikt. Förslagen
nedan gör samma sak med nya verb och återanvänder mest repliker som redan finns.

**Insats:** S ungefär en dag, M några dagar, L en vecka eller mer. **Röst:** nya inspelade repliker,
märkta (ny); 0 = bara text och ljud, och en replik för förbipasserande spelas in i alla tolv
poolröster. Manuset har cirka 450 tecken kvar. Numren gäller hela dokumentet: "gör 3, 17 och 40".

I **Obs** går två saker igen: efter dag 7 kommer ingen ny morgon och i fri runda står klockan på
14.30, och en bil inom 2,2 m tar E, så nya E-mål behöver garageportens vänd-regel.

## Börja här: topp 12

1. **1. Saklistan: ett register för småsaker** – grunden: sak nummer 40 kostar lika lite som nummer
   4, och 4, 85 och flera andra står på den · Insats M
2. **51. Fler saker att sparka på** – spelets mest tryckta verb får svar överallt, utan en enda ny
   replik · Insats S
3. **29. Veva ner rutan och säga till** – tutans tysta syster, och ett riktigt val mellan vänlighet
   och kronor · Insats S
4. **5. Säga till: T till fots** – tutans system till fots, en knapp som alltid gör något vettigt ·
   Insats M
5. **16. Snöbollskrig med ungarna** – barnen kastar först, och alla svarar efter typ · Insats M
6. **2. Grannarna minns i dag** – det billigaste sättet att få världen att minnas; alla repliker
   finns redan · Insats M
7. **46. Pojken sover i vagnen** – tutan, motorn och porten får ett pris, och Ove rycker bara en
   gång i porten · Insats M
8. **42. Ge bort och smita från tacket** – bokens kärna som verb: en omvänd smitarjakt · Insats M
9. **73. Rädda köparen från Audin** – Oves bilfördomar ändrar vad folk gör, med noll nya repliker ·
   Insats M
10. **56. Anders skriver upp Ove** – Hit & Runs polismätare, vänd mot Ove själv · Insats M
11. **23. Duvorna och duvtanten på torget** – F får ett absurt mål, och Ove smular själv när ingen
    ser · Insats L
12. **88. Skymningen faller, lamporna tänds** – novembermörkret klockan tre, och Oves egen lampa vid
    dörren · Insats L

## Grunden

Fyra byggstenar som många av förslagen längre ner står på: ett register för småsaker, ett minne för
dagen, att bära och att titta.

### 1. Saklistan: ett register för småsaker

En enda tabell (`src/game/things.js`) där varje sak man kan göra något med är en rad: var den står,
verbet, hur länge E hålls, posen och vad världen svarar. Då kostar sak nummer 40 lika lite som sak
nummer 4, och alla saker beter sig likadant.

- **Så gör man:** Till fots, E som i dag. Ett kort tryck är det snabba verbet (titta, ringa på,
  sätta sig), håll E för jobbet (laga, sanda, fälla upp) med den vanliga stapeln i promptraden. En
  sak tar E bara om Ove står vänd mot den och närmare än 1,2 m, samma regel som vid garageporten.
  Prompten: "**E** Titta · **håll E** Fäll upp pollaren".
- **Världen svarar:** En rad kan ge en toast, en replik ur en befintlig tabell, Ordning eller
  kronor, ett ljud, en pose och en vittnesreaktion (barn jublar, pensionärer nickar eller skakar
  näven) genom samma väg som tutans och hoppbackens reaktioner. Har Ove redan gjort saken i dag
  kommer en torr toast i stället för samma replik igen: "Redan gjort. 10:47."
- **Ove:** "Hmpf." · "Det står ju på skylten." · "Ordning och reda."
- **Bygger på:** `nearestInteractable()` och `interact()` (ny typ `'thing'`), `handleOneShots()`
  (tryck mot håll genom att följa `input.down('interact')` över flera bilder), holdAt:s hållogik
  lyft till en hjälpfunktion, `hud.setPrompt(text, hold)`, `posePlayer()`, `horn.react()` för
  vittnen (med en ny lugn sort `'look'`), ett 10 m-rutnät byggt en gång efter `finalizeProps`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: fyra sorters E-mål (prata, bil, garage, småprat) men inget register. Börja
  med bara tryck-rader (`{ at, r, label, toast, say, cd }`) och lyft in håll-E senare. De flesta mål
  är bakad geometri utan landmärke, så raderna behöver `bf.mark(...)` i `world/*.js`.

### 2. Grannarna minns i dag

I dag glömmer grannarna allt efter tre sekunder. Låt dem minnas dagen: den Ove tutade på tar upp
det, den han hjälpte tackar, den han knuffade håller avstånd, och Anders skriver upp Ove i sitt eget
block.

- **Så gör man:** Inget nytt. E vid en granne är småpratet som förut, men repliken väljs efter det
  senaste som hänt mellan dem.
- **Världen svarar:** Efter en tuta säger Anders "Jag tar upp det på årsmötet, Ove!", efter en knuff
  Patrick "Akta armen, Ove!" (från dag 2), efter ett hopp Parvaneh "Ove, du ser nästan glad ut i
  dag.", efter ett ärende Anita "Tack, Ove. Du är snäll, vad du än säger.". Den Ove knuffat vänder
  sig bort i stället för mot honom. Anders tar fram ett block (write-posen) när Ove kör förbi efter
  en tuta eller kör i bilfria området, och Ove kan skriva upp honom tillbaka med F medan han står
  där. Stan minns också, per åldersgrupp: har Ove tutat mycket på pensionärer skakar alla
  pensionärer näven när Saaben syns. Efter något anmärkningsvärt (hopprekord, KAOS, en lånad taxi)
  kommer en toast "P4 Lokal: ...".
- **Ove:** "Det var ingenting." · "Jaså." · "Det får vi se."
- **Bygger på:** `chatterFor()` som väljer en minnesrad först, matad från `horn.react`
  (`HONK_NEIGHBOUR`), `kickHit` (`KICKED_NEIGHBOUR`), `shoveAside` (`SHOVED`), `hoppbacke.watchers`
  och ärendenas `complete()`. Vändningen bort i `syncAll`. Radiotoasten byggs av `hopp.best`,
  `patrol.ordning` och kapningsgrenen i `enterCar`.
- **Insats:** M · **Röst:** 0
- **Obs:** Spara dag 6:s "Säg inte det till någon." till sin scen; som vardagssvar på tack blir det
  billigt. Bara minnet i småpratet är S. Ett minne per fotgängare märks inte bland 34 personer i en
  så stor stad, därför åldersgrupper.

### 3. Ove bär saker med båda händerna

Ett nytt grundverb: Ove lyfter lösa saker (flyttkartonger, kassar, en lagad pulka), bär dem i famnen
och ställer ner dem där han vill. Många förslag längre ner står på det.

- **Så gör man:** Till fots, E vid saken: han böjer sig och lyfter, med ett av hoppets gubbstön.
  Medan han bär går han långsamt och kan inte springa, hoppa, sparka eller anmäla. E ställer ner, J
  slänger kort framåt. Kliver han in i bilen hamnar saken på passagerarsätet, som katten i dag.
- **Världen svarar:** Första användningen är Parvanehs tre flyttkartonger, och Patrick kommer ut och
  "hjälper till" så att han står i vägen ("Hej Ove! Jag skulle bara... nej, det var inget."). En
  pensionär står utanför Livs med två matkassar; Ove tar dem utan att fråga ("Ge hit.") och bär hem
  dem, och hoppar han skramlar det ("Äggen!"). Grannar skickar saker med honom som bud, till exempel
  Parvanehs matlåda till Anita, med toasten "Från Parvaneh. Inte från Ove.". Lådor på Patricks släp
  flyger av i hoppbacken, och barnen som ser det jublar. Ett kast nära folk ger tutans reaktioner.
- **Ove:** "Ge hit." (ny) · "Jag tar dem." · "Man bär inte två gånger det man kan bära en gång."
  (ny)
- **Bygger på:** `setCarrying()` och `carryPoint` (kattens), en tvåhandsvariant av `carryPose`,
  fartgränsen i `fixedStep`, `props.js` (dölj den bakade propen med `setMatrix(p, false)` och
  `p.block.dead` utan skräp, bygg en lös mesh ur `TYPES[type].build`), `horn.react` för kast,
  `hopp.trailerBounce` för släpet.
- **Insats:** L · **Röst:** 3 repliker (två för Ove, "Äggen!" i de gamla poolrösterna)
- **Obs:** Finns delvis: bara katten kan bäras. Spärrarna saknas i dag (`handleOneShots` kollar bara
  `pushedNpc()`), och `catchCat` får inte ta katten medan något annat bärs. Billigast: bara
  kartongerna, utan kast och utan kolliderare (M). Patricks hyrsläp kan bli ett tyst ärende ovanpå:
  backa in det i raden på macken, och Patrick på passagerarsätet säger "Wow. Det ser ut som i
  reklamen.".

### 4. Titta på saker: Oves åsikt

Ett kort E på skyltar, automater och prylar som i dag bara är dekor ger en handskriven rad och en
åsikt han redan har sagt någon annanstans. Det är det billigaste sättet att göra den redan byggda
världen läsbar.

- **Så gör man:** Till fots, kort E vänd mot saken. Ove stannar och tittar, ibland skriver han i
  blocket. Varannan sak får en liten handling före åsikten: han rättar till en sned lapp eller
  borstar snön av skylten.
- **Världen svarar:** Skylten Reserverad Ordförande: "Anders." Gästparkering max 24 tim: "Jaså. Här
  ska vi stå, minsann." Tidtabellen i busskuren: "Det går en buss om tjugo minuter."
  Parkeringsautomaterna vid sjukhuset: "Jag betalar inte för att stå still!" Återvinningen: "Ingen
  kan läsa nu för tiden." Verktygstavlan efter dag 3: "Elementnyckel. Jag har en i garaget. Alla
  borde ha en." Löpsedeln KVÄLLSPRESSEN vid Livs byggs av spelets läge: "GUBBE I SAAB FLÖG 23
  METER", "KAOS PÅ PARKERINGEN". Blocket räknar: "Ove har en åsikt om 14 av 30 saker."
- **Ove:** "Anders." · "Det står ju på skylten." · "Typiskt."
- **Bygger på:** rader i Saklistan (1) med bara tryck. Målen finns: anslagstavlan och stolparna i
  `ove.js`, Återvinningen i `rowhouse.js`, tidtabellen i `streets.js busStop()`, `newsStand()` i
  `places.js`, de brytbara `'meter'`-propsen. Löpsedeln byggs av `hopp.best`, `missions.index` och
  `patrol.ordning`.
- **Insats:** S · **Röst:** 0
- **Obs:** S förutsätter 1, annars M. Nya åsikter som inte finns inspelade blir toasts.
  Elementnyckel-raden först efter dag 3.

## Grannar och folk

Sätt att vända sig till förbipasserande och grannar, som i dag bara går att köra på, sparka eller
tuta på.

### 5. Säga till: T till fots

Tutan får en tvilling till fots. T (och H) blir Oves egen signal, och vad den blir beror på vem han
står vänd mot. Det är ett enda kontextkänsligt verb, och kvarteret svarar på det lika mycket som på
tutan.

- **Så gör man:** Till fots, T eller H (RB på handkontrollen). Ove väljer gest efter det som står
  framför honom i kamerans riktning: ett nick åt den som går som folk, ett pekfinger åt den som går
  i gatan eller slänger en burk, stopphanden mot en bil när han står i gatan, en knackning på
  armbandsuret mot den som är sen. Håller han inne ropar han "Hallå där.", och det som är gömt
  svarar från rätt håll (Runes "...Ove?", ett jamande, Jimmys mobil som ringer i snön).
- **Världen svarar:** Pensionärer nickar tillbaka, tonåringar tittar ner, barn vinkar och fnittrar,
  och grannarna svarar med sitt småprat. Den som går i gatan kliver upp på trottoaren ("Jag går ju
  här!"). Står Ove i gatan med handen uppe stannar bilarna och kön växer, och efter 4 s tutar den
  ("Flytta på dig då!", bussens "Jag har en tidtabell!"). En pensionär kan hålla fram en lapp där
  det står VÅRDCENTRALEN; pekar Ove rätt nickar hen och går, pekar han fel kommer toasten en minut
  senare: "En pensionär har setts vid fotbollsplanen. Hen letar efter kyrkan." Onödiga rop kostar
  som onödig tutning, och ett fönster ropar "Tyst därute!".
- **Ove:** "Hallå där." (ny) · "Trottoaren. Den finns där av en anledning." · "Hmpf."
- **Bygger på:** `horn.update` får en gren till fots, `horn.react` med en ny lugn sort `'look'` och
  en pseudo-bil `{ x, z, yaw, spec }` vid Ove, `chatterFor()` för grannarna, nya överlägg `'point'`
  och `'stop'` byggda med `armIK` och `aimHand`. Stopphanden behöver ett undantag från
  5-sekundersregeln i `drivers.js`.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Ge den en egen handling till fots (`footHorn`, bara RB), eftersom L3 är rask gång.
  Stopphanden ska inte fungera mot jakter, loppet eller dag 7:s Škoda. Fotgängare kan inte vinka i
  dag (`anim.wave` sätts bara för grannar).

### 6. Ringa på, och barn som springer

Alla radhus- och villadörrar har en ringklocka, och ljudet finns redan i spelet men används aldrig.
Ove kan ringa på själv, och stans barn ringer på och springer. Det är alltid Ove som får skulden.

- **Så gör man:** Till fots, E vid en ytterdörr där ingen granne står: det plingar.
- **Världen svarar:** Efter 1,5–3 s är ingen hemma ("Ingen hemma. Typiskt.") eller så ropar någon
  från fönstret ovanför ("Folk sover!", "Vi har ett spädbarn här!"). Hos grannarna vänder sig den
  som står utanför och säger sin tutreplik. Tre ringningar på samma dörr inom 30 s ger −1 Ordning
  och "Tyst därute!". Barn som går förbi en villa viker ibland av, ringer, fnissar och springer.
  Står Ove inom 8 m skyller fönstret på honom, och han hinner säga "Det var inte jag." medan barnet
  fnissar bakom häcken. Håller han F skriver han upp det ("Ringde på och sprang. Röd mössa.") och
  barnet jublar, för det fick hans uppmärksamhet.
- **Ove:** "Det var inte jag." (ny) · "Ringklockan fungerar." (ny) · "Ingen hemma. Typiskt."
- **Bygger på:** `audio.doorbell()` (finns, anropas aldrig) med avståndsdämpning, en ny lista
  `frontDoors` i `data.js` fylld i `radhusRow` (`info.doorW`) och `villaLot`, `horn.nearHouse()` och
  `HONK_WINDOW` för fönstret, `chat(n)` för grannarna.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Låt barnen ringa på hos villorna, där dörren vetter mot gatan; radhusens dörrar vetter
  mot gångvägar där fotgängarna aldrig går. Bara ringningen utan barn är S med 0–1 replik.

### 7. Förskolegruppen i gula västar

Två gånger om dagen går en förskolegrupp i gula reflexvästar, två och två i ett promenadrep, från
Förskolan Solrosen till parken och tillbaka. Ove kan stanna för dem, lotsa dem över gatan eller köra
rakt igenom och själv bli uppskriven.

- **Så gör man:** I bil: stanna före övergångsstället vid förskolan när gruppen väntar. Till fots:
  ställ dig på övergångsstället och håll E, så sträcker Ove upp handen och trafiken stannar.
- **Världen svarar:** Stannar Ove vinkar barnen och pedagogen ger tummen upp (+3 Ordning). Ett kort
  tut ger "Tut tut!", och Ove: "Tutan är ingen leksak.". Kör han igenom medan de väntar ropar
  pedagogen "Sakta ner!" och antecknar hans registreringsnummer ("Fröken antecknar: SAB 900."), −10
  Ordning: hans eget verb vänt mot honom. När han lotsar mumlar varje barn "Hej!" när det går förbi.
  Ibland sliter sig ett barn för att titta på katten, och Ove vallar tillbaka det.
- **Ove:** "Övergångsställe. Då stannar man." (ny) · "Tutan är ingen leksak." · "Ordning och reda."
- **Bygger på:** `CROSSINGS` (förskolans övergångsställe), landmärkena `preschoolGate` och `park`,
  förbyggda figurer med västar i ytan `'fabric'`, `walkNpc` för ledaren och ett brödsmulespår för
  resten, `obstacleAhead` som redan stoppar trafiken för folk i körfältet.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** Klockslagen syns sällan (se Tanken), så låt gruppen gå på en timer när Ove är inom 150 m.
  Pedagogens skrivpose behöver block och penna, som bara Ove har. Börja med en pedagog och fyra barn
  (M+).

### 8. "Flytta på dig." Patrick försöker

Patrick försöker hela tiden göra fysiska saker vid huset, och det går dåligt. Ove går dit, säger
"Flytta på dig." och gör det själv, medan Patrick står bredvid och beundrar honom.

- **Så gör man:** Spelaren ser misslyckandet från gången: en kartong välter med en duns, Patrick
  skottar med gipsarmen. Till fots, E vid Patrick ger "E Ta över", sedan håll E några sekunder i
  rätt arbetspose.
- **Världen svarar:** Patrick: "Wow. Det ser ut som i reklamen." eller "Jag är IT-konsult. Jag kan
  starta om saker. Det är ungefär allt.". Parvaneh från dörren: "Patrick, säg inget. Låt honom
  vara.". Flickorna jublar. Tar Ove inte över fortsätter Patrick och tappar saker då och då. Ingen
  Ordning åt något håll, det är ren karaktärskomik, och jobbet är gjort resten av dagen.
- **Ove:** "Flytta på dig." · "NEJ." · "Hmpf."
- **Bygger på:** `HOMES.patrick`, kartong-propsen i `ove.js decorate('parvaneh')`, en ny ägare av
  håll-E i `stagePrompt()` (holdAt finns bara inuti uppdrag), `posePlayer('work', ...)`, replikerna
  i `STORY.slapet.backing`, `GARAGE_DOOR.inDoorway` och `CHATTER.patrick`.
- **Insats:** M · **Röst:** 0
- **Obs:** Patrick är borta dag 2 och dag 7. Props kommer tillbaka av sig själva efter 75–115 s, så
  "gjort för dagen" behöver ett eget dölj-läge. Billigast: en välta kartong från dag 3 (S–M).

### 9. Hjälpa upp den som halkat

Ove kan hjälpa upp folk som han själv har kört omkull, och det är kärnan: den omvända Hit &
Run-poängen. Där han inte har sandat (52) halkar dessutom pensionärer ibland.

- **Så gör man:** Till fots, E vid någon som ligger: Ove böjer sig, tar handen och drar, låst på
  plats i 1,5 s.
- **Världen svarar:** Den Ove själv körde omkull säger "Det var ju du som körde på mig!", och han
  får tillbaka 6 av de 12 Ordning det kostade. En pensionär som halkat: "Tack, unge man." (+2
  Ordning). Hjälper ingen reser hen sig själv efter en stund med "Min rygg...". Barn och grannar
  halkar inte; barnen studsar upp och fnittrar.
- **Ove:** "Upp med dig." (ny) · "Kommunen har inte sandat här."
- **Bygger på:** `Character.fling` och tillståndet `'down'` (förläng timern för folk som Ove kört
  på), `onCharHit` och `onGetUp`, en ny typ `'help'` i `nearestInteractable`, `posePlayer('work',
  'bend')`, en ny delad tabell `HELPED`.
- **Insats:** M · **Röst:** 3 repliker
- **Obs:** Finns delvis: fall och uppresning finns för påkörda, men de ligger bara 3 s. "Tack, unge
  man." bara i de gamla poolrösterna (4 klipp); "Det var ju du som körde på mig!" blir 12 klipp. Låt
  folk bara halka på trottoarer, annars stoppar de trafiken. Billigast: bara de Ove kört på, en
  replik (S).

### 10. Blicken: stirra tills de ger sig

Ibland räcker det att Ove ställer sig en meter bort och tittar. Han lägger armarna i kors, kameran
kryper in, och den som gör något dumt ger sig till slut. Pensionärer stirrar tillbaka och vinner
alltid.

- **Så gör man:** Till fots, håll E inom 3 m från någon som gör fel. Släpper man för tidigt har Ove
  förlorat.
- **Världen svarar:** Börja med smitaren: föraren som sitter kvar i en felparkerad bil skruvar på
  sig och flyttar bilen efter 3 s ("Okej, okej! Jag flyttar den!") i stället för att fly, för lite
  mindre Ordning än en jakt. En tonåring tittar ner i mobilen och ger sig ("Chilla!"). En pensionär
  stirrar tillbaka med näven ("Ungdomen nu för tiden!"), och Ove ger upp: "Hmpf.". Anders tar fram
  mobilen: "Föreningen har nya regler, Ove. Jag mejlar.". Vid sjukhusets huvudentré röker folk under
  skylten Rökfritt område; efter halva tiden tar Ove fram blocket, rökaren fimpar och går till
  rökrutan, och dagen efter står det en färre där.
- **Ove:** "Jaså. Här ska vi stå, minsann." · "Det står ju på skylten." · "Hmpf."
- **Bygger på:** `hud.setPrompt(text, hold)` för stapeln, en kort kamerapush som `airK` i
  `camera.js`, ett nytt överlägg med armarna i kors (`armIK` på båda armarna), gesterna från
  `horn.react`, `CAUGHT_LINES`. Felparkerade bilar är låsta, så E bredvid dem är ledigt i dag.
- **Insats:** M · **Röst:** 0
- **Obs:** Smitaren är M; tonåringen på motorhuven och rökarna finns inte än och gör det L. Bara två
  tonåringar bland stans fotgängare.

### 11. Hittegods: vanten på staketstolpen

En röd barnvante ligger i snön. Ove plockar upp den och listar ut vems den är, eller sätter den på
en staketstolpe, som man gör.

- **Så gör man:** Till fots, E plockar upp. E vid ägaren lämnar tillbaka, E vid en staketstolpe
  hänger upp den.
- **Världen svarar:** Efter dag 1 ligger Saras vante vid snögubben. Lämnar Ove tillbaka den jublar
  hon (+2 Ordning, inga kronor). Hänger han den på stolpen kommer Sara senare och hämtar den och
  jublar åt ingen särskild. Hänger det fler än tre vantar på samma staket sorterar Ove dem efter
  färg. Senare fynd: Runes Volvonycklar till Anita ("Tack, Ove. Du är snäll, vad du än säger.", och
  Rune "...Volvo.").
- **Ove:** "En vante. Barnstorlek." (ny) · "Den hör hemma på en staketstolpe." (ny) · "Hmpf."
- **Bygger på:** `Collectible` i `pickups.js` (utan ljusstråle och snurr) med ett nytt fall
  `'mitten'` i `itemGeo`, propsen `fence` och `woodfence` för stolparna, `game.unlocked` (sparas men
  används inte i dag) för det som lämnats tillbaka.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Bara fyra barn bland fotgängarna, så börja med Sara. Ett barn med en bar hand måste
  bestämmas när modellerna byggs. Flera vantar och ägare gör det L.

### 12. Barnen frågar Ove saker

Barn ställer raka frågor, och Ove svarar med repliker han redan har: "Nej.", "Ove.", "Det är inte
min katt.".

- **Så gör man:** Börja gratis: när Sara eller Nasanin frågar något i småpratet väljer Ove det svar
  som passar i stället för ett slumpat grymt. Sedan E vid ett förbipasserande barn, som stannar och
  frågar.
- **Världen svarar:** "Mamma säger att du är snäll inuti." får "Säg inte det till någon.", "Vem är
  du?" får "Ove.", "Varför är du alltid så arg?" får "Nej.". Nya barnfrågor ("Är du pensionär?",
  "Kan du tuta?", "Är det din katt?") mumlas och kostar inga klipp. Barn som har pratat med Ove
  vinkar resten av passet.
- **Ove:** "Ove." · "Nej." · "Tutan är ingen leksak."
- **Bygger på:** `chat()` och `chatterFor()` för flickorna, en tabell `KID_ASK` med `[fråga,
  oveRad]` där svaren är exakt befintliga repliker, `voiceFor` som ger `'ped_kid'` (mumlat).
- **Insats:** S · **Röst:** 0
- **Obs:** Barnfrågorna räknas ändå mot teckenbudgeten (6–8 frågor, cirka 170 tecken). Stan behöver
  fler fotgängarbarn för att frågorna ska höras.

### 13. Dela ut reflexer

Det blir mörkt vid tre i november, och Ove tycker att alla ska bära reflex. Han har fem i fickan
varje dag, och sedan syns de överallt.

- **Så gör man:** Till fots, med reflexer i fickan: E vid en fotgängare inom 2 m. Hen stannar och
  vänder sig mot Ove, och han sträcker fram en.
- **Världen svarar:** Personen bär en vit reflex på jackan resten av dagen. Barn viftar med sina
  ("Häftigt!"). En tonåring säger "Okej, boomer." och slänger den i snön varannan gång, och där
  ligger den tills Ove plockar upp den med ett "Hmpf.". Pensionärer: "Tack, unge man.". Anders
  hänger sin på Audins backspegel. +1 Ordning per buren reflex, räknade i blocket.
- **Ove:** "Ta en reflex. Det blir mörkt vid tre." (ny) · "Du syns inte. Ta den här." (ny) · "Hmpf."
- **Bygger på:** en typ `'ped'` i `nearestInteractable` när Ove har reflexer, `Ped.idleT` för att
  stanna dem, en liten mesh på ett bröstben i ytan `'plastic'` (inget självlysande), gesterna från
  `horn.react`.
- **Insats:** M · **Röst:** 3 repliker (två för Ove; "Tack, unge man." delas med 9)
- **Obs:** E på fotgängare vill användas av både 10, 12 och 13: bestäm en regel. Fem per story-dag,
  efter dag 7 en timer.

### 14. Matlådan på trappan

Har Ove hjälpt grannarna står en matlåda från Parvaneh på hans trappa nästa morgon. Äter han den
blir han varm i magen och klarar kylan bortom skogen längre. Lådan vill hon ha tillbaka.

- **Så gör man:** Till fots, E vid lådan tar upp den ("Jag har mat."), E vid hans dörr äter han
  stående på trappan ("...Mat."). Den tomma lådan lämnar han vid Parvanehs dörr, eller så ger han
  den orörda till Jimmy.
- **Världen svarar:** Toasten "Varm i magen", och kylan stiger 35 % långsammare resten av dagen.
  Tillbaka hos Parvaneh jublar flickorna och hon säger "Hej Ove! Vill du ha lite saffransris? Jag
  har gjort för mycket.". Jimmy: "Ove, du är kung! Jag bjuder på en macka!". Ger han den till Jimmy
  påminner Parvaneh honom nästa gång de småpratar.
- **Ove:** "Jag har mat." · "...Mat." · "Hmpf."
- **Bygger på:** dag 1:s outro ("Ta den. Lådan vill jag ha tillbaka."), `setCarrying()`, en faktor
  på `rate(d)` i `cold.js`, gryningen i `missions.updateGate`.
- **Insats:** M · **Röst:** 0
- **Obs:** Billigast: bara den första lådan, direkt efter dag 1 (S). Kylan märks bara långt ute, så
  toasten bär effekten.

### 15. Piska mattan i snön

På hyreshusens gård har en pensionär hängt sin trasmatta på piskställningen men orkar inte. Ove gör
det ordentligt, först med framsidan ner i nysnön, som man gör i november.

- **Så gör man:** Till fots, håll E vid ställningen: en smäll och ett dammoln var 0,6 s.
- **Världen svarar:** Ägaren nickar och försöker sticka åt honom en tjugolapp, men han vägrar
  (toast). Ett barn i porten hoppar till vid varje smäll. Slår han för länge öppnas ett fönster:
  "Tyst därute!". En grå rektangel ligger kvar i snön till nästa dag, med +2 Ordning och "Ove
  antecknar: Mattan ren.".
- **Ove:** "Ordning och reda." · "Ingen kan någonting nu för tiden."
- **Bygger på:** piskställningen i `buildings.js apartmentsBlock()` (finns i alla sex
  hyreshusområden), en mattmesh i ytan `'fabric'`, en ny `workKind` `'beat'`, `FX.dust`,
  `audio.thud`, `HONK_WINDOW`.
- **Insats:** M · **Röst:** 0
- **Obs:** Rytmspelet hoppas över; avtrycket i snön är belöningen. Ägaren är en förbyggd docka, inte
  en av de 34 fotgängarna.

## Vinterlek

Det barnsliga som Ove inte erkänner att han tycker om. Barnen mumlar, så det mesta här kostar nästan
inga röster. En gemensam sak lyfter flera förslag: det finns inga lekande barn i parken eller på
förskolan i dag, och några barndockor på lekplatserna gör 16, 19 och 21 mycket bättre.

### 16. Snöbollskrig med ungarna

Ove böjer sig, knådar en snöboll och kastar. Barnen kastar alltid först, och han svarar bara: "Jaså.
Det är krig nu."

- **Så gör man:** Till fots på snö, en egen tangent (G eller höger musknapp, RB på handkontrollen).
  Håll: han böjer sig och har en boll i handen. Släpp: han kastar i en båge mot kamerans riktning,
  längre ju längre han höll. På asfalt: "Ingen snö här.".
- **Världen svarar:** Sara och Nasanin ligger i bakhåll bakom Patricks bil och kastar först. Den som
  träffas får en puff och svarar efter typ: barn jublar och kastar tillbaka, pensionärer skakar
  näven ("Ungdomen nu för tiden!", −2 Ordning), tonåringar "Okej, boomer.", vuxna "Hallå!". Patrick
  ber om ursäkt för att ha blivit träffad, Anders tar upp det på årsmötet och Vita skjortan noterar.
  En träff på en bils vindruta lämnar en snöstjärna; föraren tutar tillbaka, och en smitare blir
  nervös som av tutan. Ett fönster ropar "Tyst därute!". Katten träffas aldrig, den viker undan och
  fräser. Efteråt: "Ove antecknar: Träffar 6 · Fått 9".
- **Ove:** "Jaså. Det är krig nu." (ny) · "Armen sitter kvar." (ny) · "Det där såg ingen."
- **Bygger på:** en ny handling `throw` i `input.js`, `handleOneShots` (packa vid tryck, kasta vid
  släpp), en liten projektillista i `fixedStep` (folk via `allChars()`, bilar via `g.byX()`, väggar
  via `queryBlocks`), `horn.react` med en bil-lik källa som i `hoppbacke.watchers`, `horn.carReact`,
  `horn.window`, `horn.catFright`, `FX.powder`, `surfaceAt() === 'snow'`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Använd inte tutans handling till fots, för L3 är också rask gång. Barn som kastar
  tillbaka behöver ett eget litet tillstånd; billigast är att bara flickorna svarar med ett skriptat
  kast. Det finns ingen kastpose i dag.

### 17. Bygg snögubbe med flickorna

Sara har ropat "Ove! Kom och bygg snögubbe!" sedan dag 1. Nu kan han svara: rulla tre klot, lyfta
dem med ett gubbstön och kontrollera med vattenpass.

- **Så gör man:** Till fots efter dag 1, E vid Sara. Håll E och gå framåt: klotet växer med sträckan
  det rullar på snö. Håll E vid bottenklotet för att lyfta upp nästa.
- **Världen svarar:** Klotet lämnar ett mörkt grässpår. När han är klar springer flickorna fram med
  morot och kol och jublar. Ove tar fram vattenpasset och kontrollerar huvudet tre gånger, som de
  tre rycken i garageporten, innan han godkänner, och rätar sedan upp flickornas lutande snögubbe
  utan ett ord. Sara mumlar "Pappa kan inte bygga snögubbar. De ramlar.", Parvaneh säger "Ove, du
  ser nästan glad ut i dag.", och Patrick som vill hjälpa till får "Flytta på dig.". Snögubben
  sparas; kör någon sönder den ringer Sara.
- **Ove:** "Lodrätt. Så ska en snögubbe stå." (ny) · "Flytta på dig." · "Ingen kan någonting nu för
  tiden."
- **Bygger på:** `CHATTER.sara`, `snowBall()` i `props.js` (behöver exporteras) och
  `TYPES.snowman.build` för en egen mesh, en kolliderare av en egen sort (inte `'prop'`, då kraschar
  `breakProp`), `posePlayer('push')`, Oves stön (`audio.grunt`), `game.unlocked` för sparningen.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: replikerna och snögubbens geometri. Billigast: inget rullande, ett
  håll-E-jobb på en fast plats vid Parvanehs hus. En snögubbstävling med Anders som domare
  ("Korrekt. Men själlös.") är en egen L.

### 18. Gungan när ingen ser

På lekplatsen kan Ove gunga, sätta sig på fjädergungan eller lägga sig rak som en planka och göra en
snöängel, men bara när ingen ser. Kommer någon tar han fram skiftnyckeln.

- **Så gör man:** Till fots på lekplatsen i Oves område. E vid gungan: Space i takt tar honom högre,
  och E i främre läget är avhoppet, med gubbstön, och längden antecknas. E vid fjädergungan: W/S
  gungar och fjädern knarrar. E i orörd snö: han lägger sig och gör en ängel, mer symmetrisk än
  något barn har gjort.
- **Världen svarar:** Står någon inom 25 m med fri sikt säger han "Nej." och går. Kommer någon medan
  han gungar kliver han av och kontrollerar kedjan: "Ove kontrollerar kättingens fästen.", och
  kommer samma granne igen: "Ove kontrollerar kättingens fästen. Igen.". Tjatar barnen tre gånger
  gör han det ändå, en gång, och reser sig med "Säg inte det till någon.". Den som hann se reagerar:
  Parvaneh "Ove, du ser nästan glad ut i dag.", Anders "Jag tar upp det på årsmötet, Ove!", en
  tonåring "Okej, boomer.". Sara och Nasanin ropar "Ove gungade!" när han går förbi resten av dagen.
  Avhoppet blir ett rekord.
- **Ove:** "Nej." · "Det där såg ingen." · "Säg inte det till någon."
- **Bygger på:** `rowhouse.js playground()` (landmärket `playground`): gungsitsarna och fjädergungan
  blir egna små meshar som i `garagedoor.js`, tillståndet `'seated'` på ett rörligt ankare,
  `collision.segmentBlocked` för vittnen, `posePlayer('work', 'low')` som visar skiftnyckeln, en
  egen liten mesh för änglaavtrycket.
- **Insats:** M · **Röst:** 0
- **Obs:** Vittnena är grannarna, eftersom inga fotgängare går in i området. Flickornas nya rad
  mumlas. Billigast: bara fjädergungan och vittneskollen.

### 19. Bollen tillbaka, alltid för hårt

En röd plastboll rullar fram till Oves fötter. Han sparkar tillbaka den, och det blir alltid lite
för hårt.

- **Så gör man:** Till fots, J när bollen ligger inom en meter. Sparken tar bollen före däck, prylar
  och folk. I bilen studsar den iväg, och kör han över den smäller den.
- **Världen svarar:** Bollen studsar mot väggar, staket och bilar. Sara och Nasanin springer efter
  den och rullar tillbaka den snällt. Hamnar den på garagelängans tak blir barnen stående och tittar
  på Ove tills han hämtar stegen (68): "På en stege. I snö.". I gatan tvärbromsar en bil ("Vad är
  problemet?"), på Anders Audi blir det "Jag tar upp det på årsmötet, Ove!", på en fotgängare "Akta
  dig!". Smäller den är leken slut för dagen.
- **Ove:** "Bollar var tyngre förr." (ny) · "Det var meningen." · "Hmpf."
- **Bygger på:** `kickHit()` med bollen först, en liten boll med gravitation och studs
  (`queryBlocks`, `circleVsBlock`, `g.byX()` och `circleVsObb`), `walkNpc` för flickorna, gungningen
  från `kickTyre` för bilar.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** M gäller flickorna framför sitt hus; fotbollsplanen och förskolan gör det L. Alla tak har
  kolliderare upp till 99 m, så en boll på garagetaket kräver ett specialfall. Trafiken ser bara
  bilar och folk, så tvärbromsen behöver en bollkoll i `obstacleAhead`.

### 20. Ove på sparkstötting

Ove tar sin egen sparkstötting vid dörren och sparkar sig fram på gångvägarna: snabbare än att gå,
långsammare än bilen och helt laglig i bilfria området. På sätet kan Nasanin eller Rune åka med.

- **Så gör man:** Till fots, E vid sparken. W eller Shift i takt sparkar, A/D styr trögt, S bromsar
  med foten, E kliver av.
- **Världen svarar:** Pensionärer som möter honom nickar, det är deras eget fordon. Barn:
  "Häftigt!". Anders: "Morsning, Ove. Fint väder för en promenad.". Anita kan be honom ta en sväng
  med Rune på sätet i stället för i rullstolen, och Rune säger "...Saab." när de passerar Oves
  garage. I ärendet "Hämta Nasanin" kan hon sitta på sätet och fnissa "Igen!" när han springer. Ett
  varv på elljusspåret i skogen ger "Ove antecknar: Varv 1 · 0.31,4", och efter ett varv på 176 m:
  "Två och en halv kilometer. Det har aldrig stämt."
- **Ove:** "Saltat. Typiskt." (ny) · "Det är förbjudet att köra bil inom området." · "Hmpf."
- **Bygger på:** `kicksled`-propsen (Oves vid X(3.85) i `ove.js`), ett eget glidläge i `character.js
  step()`, en spark med bara benen som överlägg (`anim.kick` tar över hela kroppen i dag), `pickup`
  och `dropoff` för Nasanin, sparkens bakade prop gömd medan den används.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: bara propsen. Gångvägarna är registrerade som asfalt, så "glid på snö,
  skrapa på asfalt" måste bli "glid överallt utom på gatorna" (`isRoad`). Pulkahoppet och skidorna
  hoppas över; backen ger ingen luft för en pulka.

### 21. Ut på isen

Den frusna dammen i parken är i dag en halv osynlig vägg. Gör den till riktig is: Ove kan gå, kana
och provtrampa, och den som kör ut med bilen får en hal arena. Isen håller alltid.

- **Så gör man:** Till fots, håll E vid kanten: Ove stampar tre gånger, som rycken i garageporten,
  och antecknar "Isen: 12 cm. Bär.". Går han ut utan att ha provat halkar han på första steget. Ta
  sats och släpp W för att kana. I bil är greppet en fjärdedel av snöns.
- **Världen svarar:** Ove går stelt med korta steg och viftar med armarna om han springer. En bil på
  isen får åskådare som vid hoppbacken ("Men herregud!", barnen "Häftigt!"). Fotbollsplanen kan bli
  en andra isbana: håll E vid slangvindan vid Klubbstugan ("Ove spolar i tre tunna lager"), och
  nästa dag är planen is med samma fysik.
- **Ove:** "Fem centimeter bär en människa. Tjugo en bil." (ny) · "Tolv centimeter. Den bär." (ny) ·
  "Kommunen har inte sandat här."
- **Bygger på:** dammens isyta och dess vägg i `places.js parkBlock` (`bf.circ(..., 'water')`, bara
  6,5 m av en 9,5 m lång ellips), en ny ytkategori `'ice'` (greppet i `car.js`, höjden i `fx.skid`,
  `character.js`), `player.fling` för halkan, `audio.step('ice')` som redan finns.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Finns delvis: isen finns som mesh och fotsteg. Varje ställe som i dag jämför mot `'snow'`
  måste få `'ice'` uttryckligen, annars får isen asfaltsgrepp. Planen blir is först "nästa dag", se
  Tanken.

### 22. Studsmattan bakom häcken

Studsmattorna i villaträdgårdarna blir riktiga studsmattor. Ove kliver upp med ett stön och studsar
högre om han tajmar rätt, och i toppläget kan han anmäla felparkeringar över häcken.

- **Så gör man:** Till fots, E vid ramen ger "Kliv upp". Space precis när han landar ger högre
  studs, upp till 3,5 m. Studsar han snett nära kanten flyger han av och landar på rygg i snön.
- **Världen svarar:** Första studsen blåser snön av mattan. Barn stannar och jublar ("Igen!"), en
  pensionär skakar näven. Efter sex studsar ropar ett fönster "Folk sover!". I toppläget får
  felparkeringar inom 60 m etikett, F mitt i luften anmäler, och toasten säger "Ove inspekterar
  området från ovan". Rekordet sparas: "Ove antecknar: Studs 2,9 m".
- **Ove:** "Det där såg ingen." · "Hmpf." · "Fjädrarna är slappa. Typiskt." (ny, valfri)
- **Bygger på:** studsen finns redan i motorn men används inte: `character.js` har block av sorten
  `'bounce'`, `onBounce() {}` i `main.js` är tom, `audio.boing()` anropas aldrig och `data.js
  bouncers` är tom. Byt sort på kollideraren i `buildings.js trampoline()` och styr höjden med
  `jumpAsk` i `onBounce`.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis. Byts sorten utan att `onBounce` stäms av blir varje studsmatta en katapult
  på 5 m. Kontrollera att villornas bakgårdar går att nå till fots.

## Djur

Katten är klustrets hjärta. Fåglarna behöver en gemensam flockmodul som byggs en gång; sedan blir
duvorna, fågelborden och kråkorna billiga.

### 23. Duvorna och duvtanten på torget

En flock duvor trippar vid busshållplatsen och korvkiosken, och på bänken matar en pensionär dem
under skylten "Matning av duvor förbjuden". Ove kan skingra flocken och skriva upp henne, och sedan
smular han själv när ingen ser.

- **Så gör man:** Gå eller spring genom flocken så lyfter den; tutan och bilar i fart lyfter hela
  flocken. Håll F vid duvtanten: blocket och pennan, som för en bil. Står han stilla vid duvorna i
  10 s utan någon i närheten släpper han smulor i smyg.
- **Världen svarar:** Duvorna landar igen efter 5–10 s, och barn springer efter dem. Duvtanten
  svarar "Jag har gått här sedan 1962!" och sedan "Snälla, inte en lapp till...", och rullar iväg
  med rollatorn i 0,9 m/s, världens långsammaste smitare. Men hon vinner: när Ove har skrivit klart
  räcker hon honom en brödbit, duvorna samlas kring hans fötter och han står med pennan i luften i
  tio sekunder: "Det där såg ingen.". Vita skjortan: "Det där noteras.". Nästa dag sitter hon på en
  annan bänk.
- **Ove:** "Flygande råttor." (ny) · "Det står ju på skylten." · "Det där såg ingen."
- **Bygger på:** en delad flockmodul (en `InstancedMesh` stegad i `main.js` som `homeCat`, gallrad
  på avstånd), `horn.press`, `kickHit` och fart via `g.byX()` som skrämsel, en ny skylt med
  `textFace`, en pensionär ur `randomPed` (en pool-ped, så att `HONK_OLD` och `CAUGHT_LINES` redan
  har klipp) med en parkerad rollator bredvid.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** Fotgängarna går aldrig in på torget, så placera flocken där de faktiskt passerar. Låt F
  på en person gå en egen väg; att göra om `patrol.reportable` för personer rör spelets mest testade
  system. Efter flockmodulen är resten M.

### 24. Klappa katten när ingen ser

Från dag 4 sitter katten vid Oves dörr. Han kan klappa den, men bara om ingen ser, och klappar han
den tillräckligt ofta ligger den på Saabens varma motorhuv.

- **Så gör man:** Till fots, E vid katten. Ove tittar sig om åt vänster och höger, går ner på ett
  knä och kliar den ett par sekunder. Katten lutar huvudet mot handen och jamar.
- **Världen svarar:** Vittnena är poängen. Rune ser allt och säger bara "...Hm.", flickorna smyger
  fram bakom Ove ("Kissen!"), och då reser han sig: "Det är inte min katt.". Han får vänta tills de
  har gått in. Efter sju klappar byter katten plats när ingen tittar: till Saabens motorhuv om bilen
  nyss har stått hemma, till arbetsbänken om garageporten står öppen. Startar han Saaben med katten
  på huven fräser den och hoppar ner.
- **Ove:** "Kiss, kiss... Hmpf." · "Det är inte min katt." · "Det är en Saab. Inte en kakelugn."
  (ny, valfri)
- **Bygger på:** `homeCat` i `storyWorld()`, `anim.kneel` med `kneelReach` som tal, en ny typ
  `'cat'` i `nearestInteractable`, en lutningsparameter i `buildCat`:s `animate`, `horn.catFright`
  för fräset, `car.leftAt` för den varma motorn.
- **Insats:** S · **Röst:** 0–1 replik
- **Obs:** Finns delvis: katten, knäposen och alla repliker. Kravet "ingen inom 15 m" går nästan
  aldrig, eftersom Parvanehs dörr är 8,6 m bort; vittnena måste vara en del av skämtet. `kneelReach`
  måste återställas efteråt, annars fryser blomsterläggningen dag 7. Motorhuven är M.

### 25. Katten går med på promenad

Efter dag 4 kan katten följa med Ove i radhusområdet. Den går efter i sin egen takt, sätter sig när
han stannar och åker med i Saaben på hatthyllan.

- **Så gör man:** Till fots, E vid katten: Ove klappar den, och den följer efter i ungefär två
  minuter. E igen lyfter den. Med katten i famnen in i Saaben sitter den synligt på hatthyllan. E
  medan den följer betyder "gå hem".
- **Världen svarar:** Katten håller sig 2–5 m bakom, stryker sig mot hans ben när han står still och
  viker undan för Shift, tutan och bilar. På hatthyllan glider den åt sidan i varje sladd, och Ove
  muttrar "Förlåt, katten.". Sara: "Får jag klappa katten?", Nasanin: "Kissen!". För Jimmy springer
  den, precis som han själv säger på dag 4.
- **Ove:** "Gå hem, katten. ...Jaja. Kom då." (ny) · "Jag pratar inte med katter." · "Förlåt,
  katten."
- **Bygger på:** lägena i `catchCat` (`'come'`, `freeRun`, `bolt`) lyfta ur steget till en delad
  katthjärna, `setCarrying()`, katten som barn till `car.tilt` som i `seat()`, `slideTalk` för
  sladdarna.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: katten rör sig bara i `catchCat`. Inget i spelet har vägsökning, och
  trafiken ser inte katten, så bara inom området (hela stan är L); den går hem när Ove är utom
  synhåll. Frostdöden släpper katten där Ove dör, så den måste skickas hem.

### 26. Blondinbellans hund kissar överallt

Som i boken går en ung kvinna från Anders hus två gånger om dagen med en liten pälsboll till hund.
Den kissar på Oves lyktstolpe och Saabens framdäck. Ove skriver upp henne, och katten tar hans
parti.

- **Så gör man:** Till fots, håll F vid matten. I bilen tutar man, och hunden skäller som galen.
  Håll E vid en gul fläck för att skotta bort den.
- **Världen svarar:** Hunden lyfter på benet vid stolpar, Oves gång och snögubbar, och fläcken
  ligger kvar dagen ut. Matten: "Okej, boomer.", "Chilla!", vid tutan "Vad tutar du för?!". Skriver
  Ove upp henne försvarar Anders henne: "Jag tar upp det på årsmötet, Ove!". Efter dag 4 reser sig
  katten vid Oves dörr och fräser, hunden flyr gnällande och drar med sig matten ("Jösses!"), och
  Ove: "Bra, katten.".
- **Ove:** "Bra, katten." (ny) · "Det står ju på skylten." · "Typiskt."
- **Bygger på:** en ny hundmodell byggd som `buildCat()`, en gående med koppel längs gångvägen och
  tvärgången från `andersHouse`, en gul variant i `SKID_FRAG` eller en egen dekal, `horn.catFright`,
  `posePlayer('work', 'shovel')`, matten som en namnlös ung pool-ped så att `HONK_TEEN` redan har
  klipp.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** Klustrets största jobb: en ny djurmodell och en ny sorts aktör. Ingen spark mot hunden.
  Låt fläckarna vara utan Ordningsavdrag i början.

### 27. Fyll fågelborden och räkna fåglarna

Ove hämtar fågelfrö i garaget och fyller Runes och sitt eget fågelbord. Sedan kommer talgoxar och
domherrar, och han för noggrann bok.

- **Så gör man:** Till fots, E vid hyllan i garaget tar frö. Håll E vid ett bord i 2 s.
- **Världen svarar:** Inom en halv minut kommer småfåglar, en flock där arten är färgen. Hela
  flocken lyfter när någon kommer fort, när en bil kör förbi och när Ove tutar, så tutan får en ny
  publik. Katten sätter sig under bordet och stirrar. Vid Runes bord vänder Rune huvudet efter
  fåglarna och säger "...Ove." första gången. Anita: "Han tycker om när du kommer, Ove. Även om han
  inte säger det.". Toasten "Ove antecknar: Talgoxe 4 · Blåmes 2 · Domherre 1", och den första
  domherren ger ett kort minne av Sonja som text.
- **Ove:** "Talgoxe. Den är i alla fall punktlig." (ny) · "Hmpf." · "Jaså."
- **Bygger på:** `birdTable()` i `ove.js` (Oves på baksidan, Runes vid gångvägen) med positionerna
  sparade i `data.js`, flockmodulen från 23, garagehyllans solid, `horn.press` och fart som
  skrämsel, `hud.toast` i hoppbackens stil.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: borden finns som mesh. M förutsätter flockmodulen. Gör Runes bord till
  huvudbordet; Oves eget bakom staketet kan vara svårt att nå. Ingen ekorre.

### 28. Hundkören och fönstren som öppnas

Allt högljutt Ove gör hörs i husen: en krasch, en sönderslagen soptunna, en lång tuta, garageporten
som smäller. En hund börjar skälla, nästa svarar, och fönster öppnas.

- **Så gör man:** Inget nytt. Det följer av att sparka sönder saker, krocka, tuta länge och landa
  hårt från hoppbacken.
- **Världen svarar:** Ett avlägset skall, ett svar och ett fönster: "Tyst därute!", "Folk sover!". I
  Oves område säger närmaste granne sin tutreplik: Anders "Jag tar upp det på årsmötet, Ove!", Anita
  "Ove, Rune sover.", efter dag 7 Parvaneh "Ove! Pojken sover!". Anders lilla hund är alltid den
  sista som tystnar.
- **Ove:** "Hundar. Alla har hund nu för tiden." (ny) · "Det där såg ingen." · "Hmpf."
- **Bygger på:** `horn.window()` och `horn.nearHouse()` (tar redan vilken punkt som helst),
  ljudkällorna `onCarImpact`, `onPropBroken`, `kickTyre`, `garageHit` och hoppbackens hårda
  landningar, ett syntat skall via `audio.synth`.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Finns delvis: fönsterropet finns för tutan. Högst en kör per minut, och ingenting under
  uppdrag (dag 7:s jakt och loppet kraschar med flit). En hel kedja av hundar är M.

## Bilen

Mer att göra med Saaben än att köra och tuta. Bäst fungerar ett verb i bilen som får världen att
svara. Tangenterna bör lösas i ett svep: Z/X för blinkers, G för rutan; J och K gör ingenting i
bilen i dag.

### 29. Veva ner rutan och säga till

Saab 900:an har vevfönster. Ove vevar ner rutan och säger till folk utan att tuta: fotgängare i
gatan, en felparkerare som sitter kvar i bilen, grannar han kör förbi.

- **Så gör man:** I bilen vevar G ner eller upp rutan (styrkorset upp). Med rutan nere och farten
  under 2 m/s visar promptraden "G Säg till" när någon är inom 6 m.
- **Världen svarar:** Fotgängaren i gatan får "Gå på trottoaren!" och svarar efter typ ("Okej,
  boomer.", "Ungdomen nu för tiden!", "Ja, ja, vi hör dig!") och går faktiskt upp på trottoaren.
  Smitaren som sitter kvar får "Det står ju på skylten.". Hälften flyttar bilen ("Okej, okej! Jag
  flyttar den!") och ger +4 Ordning men inga kronor, resten drar och jakten börjar. "G Säg till"
  bredvid "F Anteckna" blir ett val mellan vänlighet och kronor. Grannar ute på stan vänder sig mot
  bilen och säger sitt småprat. Med rutan nere låter världen inte längre dämpad. Det kostar ingen
  Ordning och väcker inga fönster.
- **Ove:** "Gå på trottoaren!" · "Det står ju på skylten." · "Trottoaren. Den finns där av en
  anledning."
- **Bygger på:** `voice.js` (`u.muffle` får `&& !game.windowDown`), `horn.react` med sin
  `o`-parameter, `patrol.dropPursuit()` som visar hur en felparkerad bil kör iväg utan SMET,
  `patrol.startPursuit(c)` för vägran, `CAUGHT_LINES[0]`, `chatterFor(key)` för grannarna.
- **Insats:** S · **Röst:** 0
- **Obs:** Rutan syns inte gå ner, eftersom bilglaset är en hopslagen mesh; veven är ljud och
  dämpning. Ingen tillsägelse till smitare under story-dagar.

### 30. Slaskduschen vid trottoarkanten

Novembergatorna är blöta och salta. Kör Ove fort nära kanten när någon går där blir de genomblöta av
grått slask. Barn älskar det, pensionärer inte, och Ove låtsas att ingen såg.

- **Så gör man:** Inget nytt reglage. Det händer över ungefär 30 km/h, med bilens sida inom 1,5 m
  från kanten och en fotgängare bredvid. Den som kör förbi lugnt slipper.
- **Världen svarar:** En kaskad av slask och ett plask. Vuxna: "Kör som folk!", tonåringar:
  "Chilla!", pensionärer: "Ungdomen nu för tiden!" med näven, barn hoppar: "Igen!". Patrick ber om
  ursäkt för att ha blivit blöt, Anders tar upp det på årsmötet. −1 Ordning per blöt vuxen, aldrig
  för barn. Vid busshållplatserna ligger slaskpölar, så den som väntar på bussen är det klassiska
  offret. Saktar Ove in och kör förbi hänsynsfullt nickar folk (+1 Ordning).
- **Ove:** "Kommunen har inte sandat här." · "Det där såg ingen." · "Hmpf."
- **Bygger på:** `FX.splash` och `audio.splash()` (båda finns och används aldrig), `surfaceAt()` och
  avståndet till kanten, `horn.react(p, car, true, { kind: 'flinch', gesture, line })`, `PANIC`,
  `HONK_TEEN`, `HONK_OLD`, `SHOVED[4]`, `patrol.addOrdning`.
- **Insats:** S · **Röst:** 0
- **Obs:** Måste samsas med fotgängarnas egen panik (`carThreat`) och med en pågående tutreaktion.
  Pölarna behöver brunnarnas positioner exporterade från `streets.js`.

### 31. Söndagstur med Rune

Ove tar med Rune på en tur i bilen. Rune säger nästan ingenting, men han känner igen varje bil de
möter, och Oves svar blir ett samtal mellan två gamla rivaler, byggt av repliker som redan finns.

- **Så gör man:** Till fots efter dag 3, E vid Rune med Anita bredvid: "Ta med Rune på en tur". En
  kort ridå när Ove lyfter in honom, sedan kör man vart man vill i några minuter och lämnar honom
  vid hans dörr.
- **Världen svarar:** Rune kommenterar bilar inom 12 m, högst var femtonde sekund: "...Saab.",
  "...Volvo.", "...BMW.". Ove svarar med sin åsikt om märket: en BMW ger "Rune köpte en sån. Sen
  pratade vi inte på flera år.", en Saab "Ja, Rune. Saab.". En gång per tur får Rune tuta när de
  möter en Volvo; Ove suckar "Volvo. Jaja.", och Volvoföraren tutar tillbaka. Kör Ove vilt ringer
  Anita: "Ove, Rune blir rädd.". Tillbaka hemma: "Tack, Ove. Du är snäll, vad du än säger." och +5
  Ordning.
- **Ove:** "Rune köpte en sån. Sen pratade vi inte på flera år." · "Volvo. Jaja." · "Ja, Rune.
  Saab."
- **Bygger på:** `g.seat(rune, car, -1)` (rullstolen göms av sig själv när han sitter),
  `horn.passengers()` och `passenger()` i `hoppbacke.js` som redan känner igen Rune, `RUNE_HORN`,
  `TYRE[kind]`, `interrupts.radioOnly('anita', ...)`, `ERRANDS.element.thanks`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: Rune kan skjutas men aldrig åka. Han måste alltid komma hem: när ett
  uppdrag börjar, efter frostdöden och om bilen kvaddas (då kastas passagerare ut i dag).

### 32. Någon hänger efter Saaben

När Saaben står still vid en korsning smyger en tonåring fram och tar tag i bakre stötfångaren. Det
skrapar bakom bilen, och Ove måste få loss honom utan att någon kommer till skada.

- **Så gör man:** I bilen, från dag 3, efter 2 s stillastående nära gänget (95). Tonåringen syns i
  snöyran bakom bilen i den vanliga kameran. Kliver Ove ur (E) släpper han och springer. Tutar han
  släpper han förskräckt. Kör Ove sakta hela vägen fram till gänget släpper han själv och vinkar.
  Kör han fort eller drar handbromsen tappar han greppet.
- **Världen svarar:** För fort ger en kullerbytta in i snövallen, "Jag mår bra. Jag mår BRA.", −3
  Ordning och "Tyst därute!" från ett fönster. Kliver Ove ur säger han "Det är ingen skidlift."
  medan tonåringen springer till sina skrattande kompisar (+2 Ordning). Kör han sakta hela vägen
  tycker gänget att han är cool, men Anders har sett det: "Jag tar upp det på årsmötet, Ove!".
- **Ove:** "Det är ingen skidlift." (ny) · "Idioter." · "Hmpf."
- **Bygger på:** tonåringen placerad vid stötfångaren varje fysiksteg (`spec.len / 2`, `ch.solid =
  false`), `Character.fling` vid släppet, `horn.drive` för tutan, `GETUP`, `HONK_TEEN`,
  `HONK_WINDOW`, `HONK_NEIGHBOUR.anders[1]`.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Släpp honom vid `BOUND`, vid hopp och vid hårda inbromsningar, och aldrig med släp eller
  barn i bilen. Repliken om Oves pappa i det ursprungliga förslaget är struken; den är för tung.

### 33. Blinkers: man blinkar, alltid

Ove kräver blinkers av alla andra, men spelaren har ingen blinkersspak. Med den kommer Parvanehs
gamla repliker när han faktiskt blinkar, och anteckningsboken räknar.

- **Så gör man:** I bilen, Z vänster och X höger (styrkorset vänster och höger), L varningsblinkers.
  Blinkersen slår av sig själv när ratten vrids tillbaka, och reläet tickar.
- **Världen svarar:** Dag 2 kommer Parvanehs "Varför blinkar du? Det är ingen där!" vid Oves första
  blink, med timern som reserv, och han svarar "Man blinkar. Alltid.". Svänger han utan att blinka
  antecknar han det: "Blinkat: 41 av 43 svängar" i pausmenyn, och efter första missen muttrar han
  "Det där såg ingen.". Var åttonde BMW eller Audi blinkar inte; följer Ove efter säger han
  "Blinkers! Har du hört talas om blinkers?". Helljusblinken sitter på samma spak: en mötande Saab
  blinkar tillbaka, och Ove säger "Saab-folk. Vi hälsar.".
- **Ove:** "Man blinkar. Alltid." · "Blinkers! Har du hört talas om blinkers?" · "Saab-folk. Vi
  hälsar."
- **Bygger på:** `car.indicator`, `car.hazard` och `updateLights()` (lamporna blinkar redan för
  AI-bilar), nya handlingar i `input.js` lästa i bilgrenen av `handleOneShots`, `audio.tick()`, en
  `sloppy`-flagga per förare i `drivers.js`, goto-stegets radiotimer för dag 2 och 7, pilar i
  `hud.setSpeedo`.
- **Insats:** S · **Röst:** 0
- **Obs:** Finns delvis: blinkers finns för AI-bilar. Att trafiken släpper in Ove när han blinkar är
  dyrt och riskabelt (M); hoppa över det. Dag 2:s radio ändras, så `story`, `vcut` och `vstory` ska
  köras om.

### 34. Passageraren har åsikter

Den som sitter bredvid Ove reagerar i dag bara på tutan och hoppbacken. Låt passagerarna reagera på
hur han kör, och luta sig synligt i kurvorna.

- **Så gör man:** Inget nytt verb: körningen är verbet, under uppdrag och ärenden med någon i
  passagerarsätet.
- **Världen svarar:** Efter en krock säger grannen sin egen knuffreplik ("Ove! Titta dig för!", "Kör
  som folk, Ove!"). Efter en lång sladd säger Adrian "Är det normalt att det luktar så här?" och Ove
  "Det är kopplingen. Den är som den ska."; Parvaneh säger "Måste du, Ove?" och Jimmy "Ove! Mannen
  själv!". Vid smygkörning säger Parvaneh "Ove, du kör som en pensionär!" och Ove "Jag kör som det
  står på skyltarna.". Varje klagomål kostar 1 Ordning; en resa utan klagomål ger raden "Levererad.
  Inga anmärkningar.".
- **Ove:** "Det är kopplingen. Den är som den ska." · "Jag kör som det står på skyltarna." · "Jaså."
- **Bygger på:** `car.passengers`, slutet av en sladd i `slideTalk`, `onCarImpact`, `car.accelF` för
  inbromsningar, `SHOVED`-tabellen som redan är inspelad för grannarna, en lutning i sittposen styrd
  av `car.accelF` och `accelL`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: passagerare reagerar på tutan och hopp. Uppdragens egna radiorepliker får
  inte skjutas upp för länge; kör om `vcut`. Börja med krock och sladd.

### 35. Övningskörning med Parvaneh

"Vi börjar på måndag. I en riktig bil." Efter dag 7 är det måndag. Parvaneh kör Saaben, Ove sitter
bredvid, och spelaren styr inte bilen utan Oves instruktioner.

- **Så gör man:** Efter dag 7, E vid Parvaneh: "Övningskör". A och D blir "Vänster!" och "Höger!", S
  blir "Bromsa!". Hon reagerar med fördröjning och ibland åt fel håll.
- **Världen svarar:** En manusstyrd slinga med tre planterade misstag: hon glider mot parkerade
  bilar, glömmer blinka, gasar i svängen. Kommer kommandot för sent blir det en buckla eller en
  fotgängare som hoppar undan. Pojken sover i babyskyddet i baksätet, så varje tvärbroms väcker
  honom och Parvaneh skäller på Ove. Efter slingan visas banderollen Godkänt eller Underkänt med
  antalet ingripanden.
- **Ove:** "Bromsa." (ny) · "Man blinkar. Alltid." · "Jag kör som det står på skyltarna."
- **Bygger på:** `'route'`-läget i `drivers.js` med `LanePath`, `seat(parvaneh, car, 1)`, spelarens
  tangenter skickade till AI:n i stället för till `playerCar.ctrl`, ett undantag i kamera och fokus
  för Ove som passagerare, `hud.showBanner`, WHEN-taggen `'after7'`.
- **Insats:** L · **Röst:** ~6 repliker
- **Obs:** Kameran, tangenterna, fokus och HUD:en förutsätter alla att Ove kör. Kommandona kan vara
  mumlade bubblor i stället för klipp (Röst 0, fortfarande M). I dag är Parvaneh fortfarande gravid
  efter dag 7 (se 48).

### 36. Parkeringsbetyget och lappen på Saaben

När Ove ställer Saaben i sin egen ruta mäter han: centimeter från mitten och grader snett. Han har
ett rekord. Står han fel kan han skriva en lapp på sin egen bil.

- **Så gör man:** Inget nytt reglage. Betyget kommer när han kliver ur i sin ruta, i garaget eller
  på Anders plats. Står Saaben olagligt kan han hålla F vid den och anmäla sig själv.
- **Världen svarar:** En toast i hans handstil: "4 cm från mitten · 0,6° snett · Ordentligt".
  Rekordet sparas som hopprekordet. Självanmälan ger −10 kr till föreningens kassa, +2 Ordning för
  hederligheten och raden "SAB 900 · Parkerad på busshållplatsen" i loggen. Parkerar han på
  ordförandeplatsen kommer Anders ut: "Föreningen har nya regler, Ove. Jag mejlar.". Ser Patrick en
  perfekt parkering säger han "Wow. Det ser ut som i reklamen.".
- **Ove:** "Ordentligt." · "Det står ju på skylten." · "Hmpf."
- **Bygger på:** `inner()`, `cornersIn()` och `angleDiff` i `stages.js parkIn` lyfta till en fri
  funktion, `landmarks.saabSpot` och `oveGarageSpot`, `exitCar()`, `hud.notebook` för självanmälan,
  Saabens skylt `'SAB 900'`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: betygsättningen finns i `parkIn`. Mät bara i de egna rutorna, annars blir
  det spam vid varje urstigning. En självanmälan i loggen behöver en egen flagga, annars räknas den
  som en anmäld felparkering.

### 37. Starthjälp åt grannen

En bil på parkeringen vill inte starta, eller sitter fast i plogvallen. Ove ställer Saaben nos mot
nos och tar fram startkablarna, eller ställer sig bakom och knuffar i takt.

- **Så gör man:** Ägaren står vid bilen med varningsblinkers. Ställ Saabens front nära den döda
  bilen och kliv ur, håll E vid bagageluckan (kablarna) och sedan vid den döda bilen. Sitter den
  fast: håll E bakom och tryck i takt när bilen rullar bakåt.
- **Världen svarar:** Två hostningar och den startar, eller tre bra tag så skuttar den loss och
  pudrar Ove med snö. Främlingen tutar två gånger och kör iväg, +3 Ordning, och Ove tar inte betalt.
  Grannarna, en gång var: Anders Audi efter dag 5 ("Audin var på service. Det var inget fel på den.
  Alls.", och Ove: "Plast och elektronik."), Patricks kombi ("Jag är IT-konsult. Jag kan starta om
  saker. Det är ungefär allt."), Runes Volvo som hostar igång medan Rune säger "...Volvo.". Adrian
  behöver aldrig hjälp: "Saaben startade på första försöket i morse!".
- **Ove:** "Plast och elektronik." · "Ingen kan någonting nu för tiden." · "Det var ingenting."
- **Bygger på:** en ärendemall startad med `interrupts.force(id, { quick: true })` så att `holdAt`
  äger E, en lånad fotgängare som ägare (som kapningen i `enterCar`), `car.hazard`, `car.engineOn`,
  `g.cold.sfx('stall')` för hostningen, gungningen från `kickTyre` för knuffen.
- **Insats:** M · **Röst:** 0
- **Obs:** De flesta rutor har nosen mot staket, så nos mot nos går inte överallt; tillåt Saabens
  front inom 3 m från valfri sida. Ingen bogserlina, den ensam är L.

### 38. P-automaten och P-vakten

Sjukhusparkeringen kostar 25 kronor i timmen. Ove kan betala eller låta bli, och låter han bli
kommer en P-vakt och skriver en lapp på Saaben. För en gångs skull är det Ove som blir uppskriven.

- **Så gör man:** Till fots, E vid någon av sjukhusets tre automater: "Betala parkering · 25 kr".
  Står Saaben där obetald i ungefär 4 minuter går en P-vakt mot bilen.
- **Världen svarar:** Betalt ger "P-biljett till 13:10" och en lapp på instrumentbrädan; har Ove
  betalat nickar han och P-vakten åt varandra som två yrkesmän. Obetalt skriver P-vakten med samma
  pose och samma penn- och stämpelljud som Ove. Hinner han köra innan stämpeln är han smitaren ("Ove
  smet. Han skäms lite."). Annars "Kontrollavgift 300 kr" och "Idioter.".
- **Ove:** "Jag betalar inte för att stå still!" · "Det kostar tjugofem kronor i timmen att stå
  här." · "Kollega." (ny, valfri)
- **Bygger på:** `'meter'`-propsen i `places.js hospitalBlock`, en ny typ i `nearestInteractable`
  med vänd-regel, `addCoins()`, en lånad fotgängare som P-vakt med `anim.write`, `audio.pen` och
  `audio.stamp`, tiden räknad i `g.time` eftersom klockan står still.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Sjukhusparkeringen är mål dag 2 och dag 7, så P-vakten ska vara borta under uppdrag.
  Billigast: ingen vakt, bara automaten och en toast (S).

### 39. Borsta av snön först

De parkerade bilarna har ett riktigt snötäcke på taket. Ove borstar av en bil innan han kör den, och
hoppar spelaren över det blåser snön av i ett moln över bilen bakom.

- **Så gör man:** Till fots, håll E vid motorhuven ("Sopa av bilen", 1,5 s, armarna uppsträckta).
  Dörren ger fortfarande "Kliv in".
- **Världen svarar:** Ett obortborstat tak blåser av över ungefär 50 km/h i ett puder bakåt; bilen
  bakom tutar ("Själv då!") och en fotgängare vid kanten säger "Men herregud!". På en gästbil som
  stått för länge är snön ett bevis: "Snön ljuger inte.". Har Saaben stått ute hostar startmotorn en
  extra gång, och Ove säger "Det där såg ingen."; det stängda garaget räknas som motorvärmare.
  Borstar han en grannes bil utan att köra den får han +1 Ordning och Jimmys "Ove! Mannen själv!".
- **Ove:** "Det där såg ingen." · "Ordentligt." · "Man kör inte med snö på taket." (ny, valfri)
- **Bygger på:** `car.snowCap` och `snowCapLod` (göm för gott, byt lacken i `bodyMesh` utan snö och
  nollställ `_batch`), en motorhuvszon med vänd-regel i `nearestInteractable`, `car.accelF`,
  `FX.powder`, `horn.react`.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis: snötäcket finns på namnlösa parkerade bilar. Saaben och grannarnas bilar
  har aldrig snö, så ritualen vid Saaben kräver att de får det. Bara borstningen är S.

### 40. Skjuts från busshållplatsen

Bussen stannar aldrig i den här stan, så folk står och fryser vid hållplatserna. Ove stannar, tutar
kort, och en pensionär med rollator kliver in och vill till vårdcentralen.

- **Så gör man:** I bilen, stanna vid en busskur och tuta kort. Den som väntar sätter sig. Resmålet
  syns som mål och markör; släpp av inom 10 m.
- **Världen svarar:** Pensionären vill till sjukhuset eller centrum. Barn följer aldrig med en
  främling: de vinkar bara, och Ove nickar nöjt. Avlämnad säger pensionären "Tack, unge man.", +3
  Ordning, och ibland blir det en påse kanelbullar (toast). Kör han vilt hörs "Mitt hjärta!" från
  baksätet. Bussen sveper förbi hållplatsen precis när Ove har stannat, och han säger "Typiskt.".
- **Ove:** "Det går en buss om tjugo minuter." · "Typiskt." · "Hmpf."
- **Bygger på:** busskurarnas landmärken (`busStop`, `busStopCentrum`, `busStopSjukhuset` och de
  andra), `g.seat()` för en fotgängare, `freeSeat()`, tut-kallelsen i `pickup` (`horn.last`),
  `HONK_OLD[2]`.
- **Insats:** M · **Röst:** 1 replik (delas med 9)
- **Obs:** Finns delvis: Jimmys skjutsärende hämtar redan vid `busStop`. Fotgängarslingan i
  `syncAll` drar tillbaka en sittande fotgängare till scenen; undanta `'seated'`. Mumla alla tack
  utom pensionärens.

### 41. Stanna vid övergångsstället

Vid övergångsställena väntar ibland en pensionär med rollator. Stannar Saaben går hon över framför
den och nickar. Till fots kan Ove lotsa henne över med handen uppe.

- **Så gör man:** I bil: stanna före övergångsstället när någon väntar (under 1 m/s inom 12 m). Till
  fots: E vid den som väntar, "Nu går vi.", och hen går bredvid medan T (5) håller bilarna borta.
- **Världen svarar:** Stannar Ove går hon över, vinkar tack och ger +1 Ordning; barn vinkar och
  jublar. Kör han förbi ropar någon på trottoaren "Kör som folk!", men det kostar inget om han inte
  såg henne. Lotsar han säger hon "Tack, unge man." på andra sidan, och ibland kommer toasten "Hon
  sa att hennes man alltid gick på gatusidan. Ove sa ingenting.". En otålig BMW tutar ändå, och Ove:
  "Lär dig köra.".
- **Ove:** "Nu går vi." (ny) · "Lär dig köra." · "Jag kör som det står på skyltarna."
- **Bygger på:** `CROSSINGS` i `streets.js`, en skriptad pensionär (de slumpade har inga
  rollatorer), `obstacleAhead` som redan stoppar trafiken för folk i körfältet, ett följ-läge på
  `game.crumbs` för lotsningen.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Fotgängarna korsar i hörnen, inte vid övergångsställena, så pensionären måste skriptas.
  Lotsningen tar 12 s i 0,95 m/s och krockar med 5-sekundersregeln i `drivers.js`. Börja med
  bilversionen.

## Låna, ge och få tillbaka

Verktyg och saker går mellan Ove och grannarna och kommer tillbaka på sitt eget sätt. Verktygstavlan
(44) bär de andra; tills 3 finns bär Ove sakerna abstrakt, som fetch-steget gör.

### 42. Ge bort och smita från tacket

Ove ger bort saker men står inte ut med att bli tackad. Han räcker över gåvan och går innan tacket
hinner fram, en smitare åt andra hållet. Grannarna ger igen med saker han inte bad om.

- **Så gör man:** Till fots, med en sak i händerna, E vid grannen: han räcker fram den utan ett ord.
  Efter ungefär två sekunder tar grannen sats för att tacka.
- **Världen svarar:** Grannen går efter med tacket i sin egen takt: Jimmy joggar ikapp, Parvaneh
  vaggar efter och ropar "Ove!", Anita vinkar bara från rampen. Ove gömmer sig bakom ett hörn eller
  i Saaben, och anteckningsboken skriver "Smet från tacket: 1,8 s" med rekord. Hinner de fram: Anita
  "Tack, Ove. Du är snäll, vad du än säger.", Adrian "Tack, Ove! Du borde ha en egen kanal.", och
  Ove "Det var ingenting.". Gåvor: en egen elementnyckel till Anita, ett Volvo-emblem till Rune
  ("...Volvo."), en lagad pulka till flickorna; Anders får ingenting. Tillbaka kommer Anitas
  stickade mössa och Anders laminerade "Trivselvärd"-bricka, som inte går att bli av med: slänger
  Ove den i plastkärlet ligger den på trappan med lappen "Fel fraktion. Metall. /A".
- **Ove:** "Det var ingenting." · "Hmpf." · "Jag behöver ingenting." (ny)
- **Bygger på:** en typ `'give'` i `nearestInteractable`, tacken i `ERRANDS.*.thanks`,
  `KICKED_NEIGHBOUR` ("Ove!", inspelad för varje granne), `g.say` och `g.shout`, rekordet sparat som
  `hopp`, `npcAway()`, gåvorna tillbaka placerade i gryningen eller i `storyWorld()`.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Med Shift hinner Ove 8 m på under 2 s, så grannen ska gå efter i stället för att ge upp
  vid ett avstånd. En anonym gåva på trappan händer sällan, eftersom grannarna nästan alltid står
  hemma. En synlig mössa kräver att Oves modell byggs om; börja med effekten och en toast.

### 43. Låna ut när grannarna ber

Grannarna ber redan om saker i småpratet: Patrick vill ha en insexnyckel, Adrian vill lära sig byta
däck. Nu kan Ove svara med handling, och se grannen använda verktyget på sitt sätt, eller göra fel.

- **Så gör man:** Efter en be-replik står prompten "E Visa" kvar i fem sekunder. Ove hämtar
  verktyget på tavlan och går tillbaka; E vid grannen lämnar över, och lånet skrivs in under
  UTLÅNAT.
- **Världen svarar:** Patrick vrider insexnyckeln åt fel håll där Ove ser det, och Ove tar över i
  fem sekunder: "Medurs. Inte moturs.". Garderoben står sedan rak vid hans förråd i stället för
  sned. Lånen kommer tillbaka på olika sätt: från Anita samma dag inlindat i en servett, från
  Patrick nästa dag med en lapp, från Jimmy när han kommer ihåg det, från Anders aldrig. Det som
  inte lämnas tillbaka vandrar vidare, en lapp i taget (Patrick, Jimmy, Saras snögubbe där
  tumstocken sitter som arm), och slutar med Anders etikett FÖRENINGENS på skaftet, som Ove pillar
  bort med tummen.
- **Ove:** "Medurs. Inte moturs." (ny) · "Den är min. Det står O på skaftet." (ny) · "Jaja."
- **Bygger på:** `chat()` som känner igen en be-replik ur en liten `REQUESTS`-tabell, en typ
  `'lend'` före `'chat'`, grannens arbetspose via `anim.work` och `workKind` (lägg `'wrench'` i
  props för `CHARS.adrian`), kedjans fyndställen (Jimmys backar, sandlådan, traktorhytten) som
  statiska `Collectible`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Finns delvis: önskemålen finns i småpratet. Kedjan går ett steg per besök, inte per
  morgon. Adrian ber bara före dag 5, men hans Saab finns först från dag 5. Bygger på 44.

### 44. Verktygstavlan med konturerna

Verktygstavlan i Oves garage får en målad kontur runt varje verktyg, och anteckningsboken får raden
UTLÅNAT. Står porten öppen när Ove är borta lånar någon något utan att fråga, så de tre rycken i
handtaget får en mening.

- **Så gör man:** Till fots i garaget, E vänd mot tavlan: hänger upp det Ove bär, eller visar listan
  som toast ("Saknas: Skiftnyckel (Patrick, tisdag 11.40)"). Ärendena kräver rätt verktyg:
  elementnyckeln för Anitas element, fälgkorset för punkteringen, skyffeln för skottningen.
- **Världen svarar:** En tom krok visar en vit silhuett, och dag 3:s "Tom krok" blir en riktig tom
  kontur. Står porten öppen en minut medan Ove är långt borta försvinner ett verktyg (efter dag 3,
  ett i taget). Ledtrådarna finns ute i världen: fälgkorset vid Adrians Saab som står på domkraft,
  insexnyckeln på Patricks kartonger, elementnyckeln i Anders Audi igen. Lånehistoriken kommer som
  toast i dag 3:s stil: "Fälgkorset. Ove sedan 1979. Adrian sedan i går.". +2 Ordning per återfunnet
  verktyg, och när allt hänger på plats: "Ordning och reda.".
- **Ove:** "Någon har varit här." (ny) · "Ordning och reda." · "Hmpf."
- **Bygger på:** tavlan i `rowhouse.js garageInterior` som en egen ombyggd mesh, en typ `'board'`
  med garageportens vänd-regel, holdAt:s `ready`-krok för ärendena, `game.garage.isOpen`,
  `game.unlocked`, en rad under felparkeringarna i `hud.renderLog`.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: tavlan är dekor. Står Saaben i garaget når Ove inte bänken (ungefär 0,4 m
  kvar). Porten står öppen från start, så stöld utan förvarning dag 1 vore orättvist.

### 45. Runes låda: det Rune lånade

Rune lånade elementnyckeln 1998, men den var inte det enda. Anita hittar en låda i Runes förråd full
av Oves saker med Runes lappar på och lämnar tillbaka en sak i taget.

- **Så gör man:** Till fots efter dag 3, E vid Anita när hon har "något åt Ove". Ove bär saken till
  garaget och hänger den på sin kontur, eller ger den till Rune.
- **Världen svarar:** Tumstocken ("Lånad av Ove 1977. /R"), vattenpasset, instruktionsboken till
  Oves Saab 99 med Runes understrykningar, hylsnyckelsatsen, termosen, och sist en bilkarta över
  Norrland med Sonjas handstil i marginalen: "Fika här.". Rune säger "...Ove." från rullstolen.
  Lånen gick åt båda hållen: på Oves egen hylla står Runes gamla Volvo-dragkrok med Oves lapp "Lånad
  av Rune 1979. /O", och när Ove bär tillbaka den säger Rune "...Volvo." och Ove "Hmpf.".
- **Ove:** "Rune. Naturligtvis." · "Hmpf." · "Behåll den, Rune." (ny, valfri)
- **Bygger på:** dag 3:s lappar i `missions.js`, Anitas och Runes befintliga repliker, en typ
  `'receive'` före `'chat'`, dagens sak satt i `storyWorld()` via `missions.index`, sakerna som små
  meshar på hyllan eller tavlan.
- **Insats:** S · **Röst:** 0–1 replik
- **Obs:** S förutsätter 44. En sak per besök, inte per morgon: det finns bara fyra gryningar efter
  dag 3. Dag 6 är Anita dagens givare, så då ska överlämningen ske efter outrot. Kartans årtal ska
  vara efter 1984, när Ove och Sonja träffades.

## Dagarnas arv

Det som hände under de sju dagarna ligger kvar i världen och ger nya verb, nästan helt utan nya
röster. Byten bör ske när Ove har varit borta och inte sett platsen, eftersom "nästa morgon" tar
slut efter dag 7.

### 46. Pojken sover i vagnen

Efter dag 7 står en barnvagn utanför Parvanehs dörr, för svenska bebisar sover ute. Runt vagnen
måste det vara tyst: tutan, motorn, garageporten och en sönderslagen soptunna väcker pojken.

- **Så gör man:** Mest att låta bli. Inom ungefär 30 m (45 m för tutan) räknas ljuden: tut, full
  gas, sladd, krockar, sparkar och garageporten. Håll E vid vagnen för att gunga den. Har Ove väckt
  honom kan han ta handtaget och gå ett varv på gångvägarna tills han somnar; kantstenar, snövallar
  och tvärstopp väcker honom igen.
- **Världen svarar:** Först gnyr pojken, sedan gråter han. Parvaneh kommer ut: "Ove! Pojken sover!",
  −2 Ordning, och Ove svarar "Det var för att avvärja fara.". Under tupplurarna rycker Ove bara en
  gång i garageporten i stället för tre ("Ett ryck. Pojken sover."). Världen för också oväsen:
  Anders Audi rullar in och varvar, sopbilen närmar sig, och Ove kan gå emellan innan pojken vaknar.
  Efter ett varv med vagnen säger Parvaneh "Ove, du ser nästan glad ut i dag."; katten följer gärna
  efter vagnen.
- **Ove:** "Det var för att avvärja fara." · "Så." · "Säg inte det till någon."
- **Bygger på:** en vagnmodell i `storyWorld()` när `index >= 7` (kartongerna i `ove.js
  decorate('parvaneh')` göms), en hjälpfunktion `g.noise(x, z, kind)` anropad från `horn.press`,
  `updateAudio`, `onCarImpact`, `kickTyre`, `onPropBroken` och garageporten, rycken i `stepDoorOp`
  (`n < 3` blir `n < 1`), skjutkoden för Runes rullstol i `stepNpcs` för vagnen.
- **Insats:** M · **Röst:** 0
- **Obs:** Tre ljud (gny, gråt, joller) syntas eller görs med `tools/sfx`. En skjuten vagn har ingen
  väggkollision, precis som Runes rullstol i dag. Billigast: bara tutan och porten väcker honom (S).

### 47. Patricks nya brevlåda

Patrick har varit skyldig Ove en brevlåda sedan dag 1. Från dag 2 står den vid Oves gång: sned, för
låg, med OVE i klisterbokstäver och E:et bakochfram. Ove kan rätta upp den eller sparka omkull den
och se vad Patrick hittar på härnäst.

- **Så gör man:** Till fots. Kort E: Ove tittar och antecknar ("Lutar 11 grader. Fel höjd. E:et
  bakochfram."). Håll E (arbetsposen, tre tag) så står den rakt resten av spelet. J sparkar omkull
  den.
- **Världen svarar:** Varje omkullsparkad låda följs av en värre, och Patrick kommer själv ut med
  gipsarmen och skruvar upp den när Ove är i närheten: IKEA-modellen på för låg stolpe, samma låda
  med silvertejp och en snökäpp, en flyttkartong med OVE i tusch på en sparkstötting, efter dag 5 en
  hemsvetsad jättelåda från Adrian och Jimmy. Har ingen godkänts kommer dag 7 en sned men ärlig låda
  som Patrick snickrat själv, med OVE målat med darrig hand (+5 Ordning om den godkänns). Godkänd:
  blocket får "Patrick: 1 brevlåda. Kvitt. Nästan.", och Patrick säger generat "Hej Ove! Jag skulle
  bara... nej, det var inget.".
- **Ove:** "Ingen kan någonting nu för tiden." · "Ordentligt." · "Ni är skyldiga mig en brevlåda."
- **Bygger på:** alla varianter placerade vid bygget i `ove.js decorate('ove')` (props bakas en gång
  i `finalizeProps`) och gömda med en ny exporterad hjälpfunktion i `props.js`, en
  `noRespawn`-flagga, en typ `'mailbox'` med tryck mot håll, `game.unlock('brevlada:2')`.
- **Insats:** M · **Röst:** 0
- **Obs:** Gömda varianter måste ha `alive = false`, annars träffar sparkar osynliga lådor. Varje
  spark kostar Ordning och kronor som andra props, och det är meningen. Ove har redan ett fack i
  föreningens ställ vid parkeringen; låt Patricks låda ersätta det eller säg det i lappen.

### 48. Hålla pojken

Parvaneh lägger pojken i Oves armar innan han hinner säga nej. Ove står stel som en stolpe, och alla
grannar kommer fram för att titta.

- **Så gör man:** Till fots efter dag 7, E vid Parvaneh, som nu står med pojken i famnen i stället
  för att vara gravid. Ove håller honom i kattens bärpose i ungefär åtta sekunder och står still.
- **Världen svarar:** Pojken greppar Oves pekfinger, så han kan inte anteckna eller sparka: "Han har
  ett bra grepp.". Grannarna kommer fram en i taget med en replik som får ny betydelse: Parvaneh
  "Ove, du ser nästan glad ut i dag.", Anita "Du är en god människa, Ove.", Patrick "Wow. Det ser ut
  som i reklamen.", Sara "Mamma säger att du är snäll inuti.", Rune "...Ove.". Ove svarar "Säg inte
  det till någon.". Blocket räknar hur många gånger han har hållit honom, men han skriver först när
  pojken är tillbaka hos Parvaneh.
- **Ove:** "Säg inte det till någon." · "Hmpf." · "Han har ett bra grepp." (ny, valfri)
- **Bygger på:** `setNpcDef('parvaneh', ...)` i `storyWorld()` med en ny def utan `pregnant` (i dag
  är hon fortfarande gravid efter förlossningen), ett lindat knyte som `setCarrying()` tar, en typ
  `'baby'` före `'chat'`, `walkNpc` för grannarna.
- **Insats:** S · **Röst:** 0–1 replik
- **Obs:** Att gå omkring med pojken (M) kräver spärrar som saknas i dag: bil, F, spark, hopp,
  Shift, samtal och R. Den stilla versionen behöver inga.

### 49. Revansch: Saab mot Audi

Anders har inte kommit över dag 5. När Saaben kommer till parkeringen står han i Audin och varvar.
Två korta tut betyder revansch, och förloraren tvättar vinnarens bil.

- **Så gör man:** I bilen efter dag 5: stanna bredvid Audin och tuta två gånger. Kör förbi betyder
  nej. Det är dag 5:s lopp till Bilhallen igen.
- **Världen svarar:** Anders: "En gång till, Ove? Jag har all tid i världen. Och en A6.", under
  loppet "Vorsprung durch Technik, Ove!". Vinner Ove säger Anders "Jag lät dig vinna, Ove. Av
  respekt för de äldre.", och dagen efter står han med hink och svamp vid Saaben på parkeringen, där
  grannarna går förbi och kommenterar. Vinner Anders får Ove tvätta Audin (håll E). Ställningen står
  i blocket ("Saab–Audi 3–1") och styr Anders småprat: leder Ove hörs oftare "Audin var på service.
  Det var inget fel på den. Alls.".
- **Ove:** "Plast och elektronik." · "Man gasar inte i kurvorna." · "Tyskt krafs."
- **Bygger på:** `race` i `stages.js` som ett tyst ärende (`interrupts.force(id, { quick: true })`),
  `horn.taps` för de två tutten, `g.seat(npc, andersAudi, 1)`, Audins ruta Reserverad Ordförande,
  `holdAt` med `'bend'` för tvätten, Anders repliker i `STORY.saab` och `CHATTER_AFTER.anders`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: loppet finns. Adrians radiorepliker i loppet ska bort när han inte sitter
  med. Botarna i `m5race` är ostadiga; kör dem parvis. Billigast: samma rutt till Bilhallen och
  resultatet som toast (S–M).

### 50. Vita skjortan håller avstånd

Efter dag 6 kör Vita skjortan omkring i sin vita Škoda med tejpad stötfångare. När Saaben syns i
backspegeln blir han stans mest laglydiga bilist, så nervös att han gör fel.

- **Så gör man:** I bilen, lägg dig bakom Škodan. Inom 45 m kör han exakt 30 och svänger av. Håller
  sig Ove inom 15 m i 12 sekunder kör han in till kanten med varningsblinkers.
- **Världen svarar:** Vid kanten håller han upp ett papper mot rutan och säger "Vi ses, Ove. Vi har
  tid." eller "Underskriften är på väg. Den är på väg.". Tutar Ove svarar han "Det där noteras.".
  Nervös parkerar han snett över två rutor på kommunens egen parkering, och Ove kan anmäla kommunen
  med F för dubbelt betalt ("Kommunens bil. På kommunens parkering. Över två rutor.") medan han
  kommer ut och säger "Vi har en blankett för sådant.". Ove: "Kommunen. Typiskt.".
- **Ove:** "Kommunen. Typiskt." · "Det har jag också." · "Hmpf."
- **Bygger på:** en låst, namngiven trafikbil med `addBust(CHARS.vitskjorta)`, `ai.cruise`,
  `ai.pullOver(onStopped)`, en ny `bias` i `LanePath.ensure` för att svänga bort från Ove, en egen
  parkerad Škoda för anmälan (en anmäld bil tas bort när den är utom synhåll).
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: Škodan finns som uppdragsbil dag 6 och 7. Dag 7 skapar sin egen Škoda, så
  trafikens måste bort när dag 7 börjar. Ändringar i `drivers.js` kräver `m5race` och `m7chase`.
  Utan bortsvängning är det S–M.

## Snö och is

Novembervintern blir något man gör saker med. Fotgängarna går bara på trottoarslingorna, så halka
och ras måste ligga där folk faktiskt går eller där grannarna står.

### 51. Fler saker att sparka på

Sparken är verbet spelare trycker på hela tiden, och i dag ger den mest böter för en sönderslagen
sak. Låt fler saker svara på sitt sätt: trädet släpper snön över Ove, lyktstolpen klingar,
garageporten skramlar.

- **Så gör man:** J, K eller klick, som i dag. Sparken testar nu också träd, stolpar,
  återvinningskärl, busskurer och garageporten inom 0,7 m.
- **Världen svarar:** Granen släpper snön med en halv sekunds fördröjning, så Ove hinner titta upp
  innan det puffar över honom; han står stilla och skakar av sig: "Typiskt.". Barnen i närheten
  springer genast in under samma träd och väntar på att han ska sparka igen. Gran och tuja släpper
  mest, björk lite. Lyktstolpen ger ett dovt metalliskt dong, Oves egen garageport skramlar ("Min
  garageport!") och ibland ropar ett fönster "Tyst därute!". Kärl och busskurar dånar. Inget kostar
  något.
- **Ove:** "Typiskt." · "Min garageport!" · "Det var meningen."
- **Bygger på:** en fjärde gren i `kickHit()` före `audio.kick()`: `queryBlocks` för `'tree'`
  (blocket bär `species`, `crownR` och `crownBottom`), `'pole'`, `'bins'`, `'shelter'` och
  `'garageDoor'` (`d.bump()`), `FX.powder` från kronan, `horn.react` för folk under trädet,
  `audio.boing()` som aldrig anropas.
- **Insats:** S · **Röst:** 0
- **Obs:** Finns delvis: sparken på bilar, props och folk. Skakningen krockar med `cold.js`, som
  skriver `anim.shiver` varje bild. Snötäcket på parkerade bilar och en krona ur p-automaten hoppas
  över i första steget.

### 52. Sanda halkan

Varje morgon har det frusit på, och det ligger blanka isfläckar på trottoarer och gångvägar.
Pensionärer halkar på dem, och Ove sandar ur föreningens sandlåda.

- **Så gör man:** Till fots, håll E vid en isfläck ("E Sanda", 1 s, posen `'bend'` och ett grått
  gruskast). Springer han på osandad is halkar han själv.
- **Världen svarar:** Pensionärer som går på en osandad fläck nära Ove kan halka: "Min höft!", sedan
  "Jag mår bra. Jag mår BRA.". Barn kanar glatt och jublar. +2 Ordning per fläck och lappen "Ove
  antecknar: Sandat 7 av 11". Det ligger alltid en fläck på Runes ramp; när den är sandad säger
  Anita "Nu kommer han ut igen. Tack, Ove.". Halkar Ove på en fläck han själv hoppat över muttrar
  han "Kommunen har inte sandat här.", fast det var hans jobb.
- **Ove:** "Kommunen har inte sandat här." · "Sand. Det är inte svårare än så." (ny) · "Ingen kan
  någonting nu för tiden."
- **Bygger på:** `sandBox()` i `rowhouse.js`, `Character.fling` och `onGetUp` (`OUCH`, `GETUP`), en
  `iceAt(x, z)` i greppkoden i `car.js` (låt inte `surfaceAt` returnera `'ice'`, flera system kollar
  `'asphalt'`), en `InstancedMesh` i ytan `'ice'` med en grusad variant, farten `PUSH` i `main.js`
  för Rune på is.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: sandlådan och isytan finns. Sandlådan står 1–2 m från en parkerad Škoda,
  som tar E utan vänd-regel. Billigast: 6–8 fasta fläckar utan hink, 0 nya repliker.

### 53. Takfoten: istappar och takras

Istappar hänger över portskärmar, busskurer och Livs entré. Ove slår ner dem ordentligt med E, eller
sparkar på stupröret, och då kommer ibland ett snöflak över honom.

- **Så gör man:** Till fots, E under en takkant inom räckhåll: Ove sträcker sig upp som vid
  garageporten, och istapparna krossas med glasklirr. J mot stupröret är genvägen.
- **Världen svarar:** Nedslagna istappar över en ingång ger +2 Ordning och "Ove antecknar: Istappar
  · Livs". Står de kvar kan en falla nära en fotgängare ("Jösses!"). Var tredje spark mot stupröret
  kommer ett snöflak över Ove; ungarna ropar "Igen!" och tonåringar säger "Okej, boomer.". Från de
  låga radhuslängorna rasar taksnö på grannen vid dörren, helst Patrick: "Oj! Förlåt! Står jag i
  vägen?". På framsidan sitter snörasskydd, och där blir skyddet skämtet: "Snörasskydd. Någon har
  tänkt.".
- **Ove:** "Varning för takras. Det är ingen dekoration." (ny) · "Istappar. Folk går ju här under."
  (ny) · "Typiskt."
- **Bygger på:** en `InstancedMesh` av koner i ytan `'ice'`, portskärmarna (`canopy()` i `kit.js`)
  och busskurarna, takfoten på 1,5-planslängorna (Oves och Anitas), dörrposens `st.reach`, en lista
  med stuprörens positioner (de saknar kolliderare), `spawnDebris` i isfärg, `horn.react`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** De flesta takrännor sitter på 5,3 m och nås inte, så sätt istapparna bara där Ove når.
  Raset ska bara gå från de låga längorna. Billigast: istappar på portskärmar och busskurer, 0–1
  replik (S).

### 54. Spår i snön

Allt som rör sig i snön lämnar spår: Oves kängor, katten och haren. Morgonens färska spår över Oves
gräsmatta leder till en skyldig som byts från dag till dag.

- **Så gör man:** Spåren syns utan knapptryck där marken är snö. Till fots får B (gör ingenting till
  fots i dag) Ove att sätta sig på huk och läsa spåret: en toast ("Tassar. Färska.") och en kort pil
  på minikartan.
- **Världen svarar:** Spåret över gräsmattan leder till en tonåring, till Jimmy eller till katten,
  eller ibland bara tillbaka till Oves egen dörr: "Ove antecknar: Storlek 44. Egna.". Den som genat
  får höra "Trottoaren. Den finns där av en anledning.". Ibland slutar spåret vid Oves avgnagda
  häck, där Sara mumlar "En kanin!" och Ove rättar: "Hare. Inte kanin.". Spåren bleknar efter några
  minuter, och snöfallet dag 7 fyller igen dem fortare.
- **Ove:** "Trottoaren. Den finns där av en anledning." · "Hare. Inte kanin." (ny) · "Tassar. Den
  går alltid samma väg." (ny)
- **Bygger på:** en egen `InstancedMesh` för avtryck (inte ringbufferten i `fx.skid`, som delas med
  däckspåren), avtryck lagda på Oves stegfas (`stepPh`, samma tick som `audio.step`), `anim.kneel`,
  `hud.drawMinimap`, katten i `catchCat` för tassarna.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Finns delvis: bara Saabens sladdspår finns. Fotgängarna går aldrig på snö, så deras spår
  syns inte. Billigast: Oves kängor och katten, inga konstruerade spår (S).

### 55. Plogvallen vid utfarten

Varje morgon ligger en plogvall tvärs över parkeringens utfart. Ove skottar den, kör rakt igenom den
med Saaben eller plogar med föreningens traktor.

- **Så gör man:** Till fots, håll E "Skotta" (posen `'shovel'` visar skyffeln av sig själv). I bil:
  kör in i vallen över ungefär 6 m/s. Vid traktorn: håll E för en kort övertoning med texten "Ove
  plogar utfarten med föreningens traktor.".
- **Världen svarar:** Saaben brister igenom i ett snömoln med hoppbackens landningsdunk och lite
  skada. Skottat ger +3 Ordning. Precis när Ove har skottat klart passerar sopbilen med sitt gula
  blinkljus och lägger tillbaka vallen. Vid traktorn säger han "Ordning och reda.".
- **Ove:** "Plogbilen. Samma ställe varje morgon." (ny) · "Ordning och reda." · "Det var meningen."
- **Bygger på:** vallen som en prop (props i `props.js` bryts över `minSpeed` och är en vägg under),
  undantag i `kickHit` (inte bryta med en spark) och `onPropBroken` (inte kosta), `tickProps` som
  bara återställer vid gryningen, `audio.hoppLand`, `car.damage`, traktorn i `ove.js tractor()` som
  en E-plats.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Finns delvis: skottning finns i ärendet. Saaben kör ut dag 1, 2, 5, 6 och 7, så vallen
  måste bort när varje sådan dag börjar. En vall framför garagelängan går inte, eftersom Saaben och
  Runes Volvo står där.

## Föreningen, lapparna och posten

Bostadsrättsföreningens vardag: lappar, anslagstavlan, posten och Oves eviga dragkamp med Anders.
Välj två eller tre av de här, så att Anders inte blir tjatig.

### 56. Anders skriver upp Ove

Hit & Runs polismätare, vänd mot Ove själv. Bryter ordningsmannen mot reglerna fylls en mätare, och
till sist kommer Anders efter honom med sin pärm.

- **Så gör man:** Ingen ny knapp. Bilkörning i bilfria området, onödig tutning, förstörda saker,
  knuffar och lånade bilar fyller en liten mätare bredvid Ordning. När den är full kliver Anders ut
  och följer efter. Ove smiter genom att komma utom synhåll, eller in i garaget och dra igen porten.
- **Världen svarar:** Kommer Anders inom 4 m läser han upp en anmärkning: "Jag tar upp det på
  årsmötet, Ove!", med toasten "Föreningen: anmärkning, 50 kr". Smiter Ove blir Anders stående och
  skakar näven. Vid garaget knackar han på porten, säger "Föreningen har nya regler, Ove. Jag
  mejlar." och går, medan Ove drar tre gånger i handtaget. Jimmy ropar "Ove! Mannen själv!" när han
  ser jakten, och flickorna springer efter Anders.
- **Ove:** "Det var fara." · "Anders." · "Föreningen. Hmpf." (ny, valfri)
- **Bygger på:** de fem matningspunkterna (bilfria grenen i `patrol.update`, `horn.complain`,
  `onPropBroken`, `shoveAside`, kapningen i `enterCar`), förföljelsen ur dag 7:s goto-steg lyft till
  fri runda, `walkNpc` eller kompanjonsspåret i `stepNpcs`, `segmentBlocked` för synhåll, ett
  HUD-kort som `#cold`.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis: Anders ropar redan vid bilfritt och onödig tutning, och KAOS kostar 50 kr.
  Låt jakten ersätta KAOS-mötets avdrag så att samma förseelse inte straffas två gånger. Den behöver
  en egen spärr, eftersom `patrol.suspended` bara gäller bilfritt.

### 57. Lappen under torkarbladet

Allt är inte olagligt, men Ove har synpunkter ändå: snett över två rutor, sommardäck i november, snö
på taket sedan i går. Han skriver en lapp och sätter den under torkarbladet, och ägaren svarar på
sitt sätt.

- **Så gör man:** Till fots vid en laglig bil med ett fel, håll F: anteckningsboken med lappens text
  och stämpeln LAPP i stället för ANMÄLD. I tvåtimmarsrutorna i centrum blir F i stället "Krita
  däcket"; efter 8 minuter (räknat i `g.time`) har hälften av de kritade bilarna stått för länge och
  kan skrivas upp.
- **Världen svarar:** Är Ove 30 m bort kommer ägaren ut samma dag, läser lappen, ser sig om och
  ställer bilen rakt (+2 Ordning) eller river den: "Skriv vad du vill!". Den som vägrar svarar med
  en lapp på Oves dörr nästa morgon: "Vem är du att döma? /Golfen i ruta 7". Tredje lappen till
  samma bil blir lappkrig på anslagstavlan. Står Saaben fel en speltimme skriver Anders en lapp till
  Ove, "Felparkerat. /Styrelsen", och Ove säger "Anders.". En lapp om luddfiltret i tvättstugan får
  fem svar i olika handstilar nästa dag.
- **Ove:** "Ingen kan läsa nu för tiden." · "Anders." · "Mellan linjerna. Det är därför de är
  målade." (ny)
- **Bygger på:** patrullens F-flöde (`reportable`, `startWriting`, `WRITE_SECS`) med en egen lista
  över lagliga bilar och utan `patrol.credit()` (den öppnar dagens grind), `hud.notebook` med
  stämpeltexten som parameter, en vit pappersquad på `car.tilt`, några parkerade bilar placerade
  snett i `ove.js` och `places.js`.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** F betyder då tre saker bredvid varandra på samma parkering (lapp, krita, anmälan), och
  "närmast vinner" väljer ofta fel. Skylten LASTZON 6–10 vid torget stämmer inte i dag, eftersom
  dagen börjar 10.30: ändra skylten eller ta bort lastplatserna. Billigast: bara de sneda bilarna
  och förbipasserandes reaktioner (S–M).

### 58. Namninsamling mot bommen

Anders motion om en bom vid infarten sitter på anslagstavlan. Ove går runt med en namnlista och
ringer på i området inför föreningsmötet på torsdag.

- **Så gör man:** Till fots, E vid tavlan ger listan, E vid en ytterdörr ringer på.
- **Världen svarar:** Främlingar svarar från fönstret som toasts ("Holm vill ha bom."). Grannarna i
  karaktär: Parvaneh skriver under direkt, Patrick frågar om det finns en app, Jimmy skriver två
  gånger så att Ove får stryka den ena, Anita skriver för Rune också och Rune ritar ett kryss och
  säger "...Saab.", Anders säger nej. Efter dag 4 kommer ridån "Föreningsmötet. Motionen om bom
  avslogs med 14 röster mot 2.". Förlorar Ove kommer bommen efter dag 7, och Anders fjärrkontroll
  får aldrig upp den, så han ringer Ove, som lyfter den för hand åt ordföranden.
- **Ove:** "Skriv här. Och här." (ny) · "Ingen hemma. Typiskt." · "Demokrati. Hmpf." (ny)
- **Bygger på:** dörrarna i `radhusArea` (`out.rows[...].units[k].doorW`), `audio.doorbell()`,
  `horn.nearHouse()`, `hud.curtain()` vid dag 4:s gryning, `game.unlocked` för resultatet; samma
  dörrlista som i 6.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Ingen fysisk bom under berättelsen: infarten är den enda vägen in och ut dag 2, 5 och 7.
  En bom efter dag 7 gör det L. Dag 7:s samtal om bommen måste fortfarande stämma.

### 59. Anslagstavlan: inte beslutat på stämman

Anders sätter upp en ny påhittad regel varje dag. Ove läser den, konstaterar att den inte är
protokollförd och river ner den, och det syns i världen när regeln försvinner.

- **Så gör man:** Till fots vid tavlan, E läser dagens anslag på ett papperskort. Håll E på anslaget
  för att riva ner det. Håll E på en tom plats för att sätta upp en egen lapp, en per dag.
- **Världen svarar:** Anders regel märks: "Snögubbar högst 1,20 m" ger Saras snögubbe en röd lapp,
  "Endast vitt sken" släcker Jimmys renar. River Ove regeln blir allt som förut, och Anders går till
  tavlan, läser och skakar näven: "Föreningen har nya regler, Ove. Jag mejlar.". Oves egen lapp
  ("Bilkörning inom området är förbjuden. Det gäller även ordföranden.") halverar felparkeringarna i
  bilfria området för dagen. Stadgarna riktas mot Anders: hans LED-nummer, terrassvärmaren och
  stolpen Reserverad Ordförande kan anmälas med F ("Hus 16 · §7"), och dagen efter är stolpen borta.
- **Ove:** "Inte beslutat på stämman. Gäller inte." (ny) · "Protokollfört? Nej. Då så." (ny) · "Det
  har jag också."
- **Bygger på:** tavlan `nb` i `ove.js` (anslagen är bakade, så dagens anslag blir en egen liten
  mesh med `CanvasTexture`, som `sonjaPhotoTexture`), vikterna i `patrol.spawnOne`, `walkNpc`,
  `anim.fist`, gryningen i `updateGate`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Finns delvis: tavlan finns med två bakade anslag. Saaben på `saabSpot` tar E ett halvt
  steg bort, så tavlan behöver vänd-regeln. Bara sju gryningar, inga efter dag 7.

### 60. Morgonposten i Oves brevlåda

Varje morgon ligger post i Oves fack, och breven handlar om vad han gjorde i går: ett föreläggande
om motortrafik i parken, sjukhusets p-avgift, en teckning från Sara.

- **Så gör man:** Till fots, E vid postlådorna läser ett brev i taget i anteckningsbokens stil.
  Reklamen bärs till papperskärlet.
- **Världen svarar:** Ett hopp i hoppbacken som någon såg ger "Föreläggande: motorfordon i parken.
  500 kr.". Efter dag 2 kommer sjukhusets p-avgift på 25 kr, och Ove: "Jag betalar inte för att stå
  still!". Reklam kommer trots "Ingen reklam tack"; i papperskärlet ger den +1 Ordning. Oves egen
  låda, som Patrick körde över dag 1, står buckig, och posten ligger blöt i snön bredvid, överst en
  räkning för en ny brevlåda adresserad till Patrick. Från dag 2 saknas tidningen; en lapp
  ("Tidningen kostar 28 kr. Den som tar den vet vem den är. /O.") ger nästa morgon 28 kr i växel och
  en bilannons med en inringad Saab.
- **Ove:** "Jag betalar inte för att stå still!" · "Ingen kan läsa nu för tiden." · "Typiskt."
- **Bygger på:** landmärket `mailboxes` och namnskylten `'Ove'`, stilen från `EMBLEM_NOTES` och
  `PHOTO_NOTES` i `hud.showCollect`, Oves `note`-prop i handen, en sparad logg över gårdagens
  flaggor (hoppbackens vittnen, kvaddade bilar, kapningar), papperskärlet vid Återvinningen.
- **Insats:** M · **Röst:** 0
- **Obs:** En Golf i ruta 9 står 0,9 m från Oves fack och tar E. Samma sak ska inte kosta två
  gånger: ett brev om något som redan har kostat är ett kvitto, inte en ny böter. Bara morgnar under
  berättelsen.

## Spana och anmäla

Nya sätt att använda blicken och anteckningsboken. Bäst fungerar de där folk svarar direkt och efter
typ.

### 61. Kikaren: spana på håll

Ove tar fram sin gamla kikare. Han ser vem som sitter kvar i bilen på 60 meters håll, och folk
märker att de blir iakttagna.

- **Så gör man:** Till fots, håll B (gör ingenting till fots i dag). Kameran smalnar över hans axel.
  Så länge han håller når taggarna 70 m i stället för 35, och "förare i bilen" syns på 60 m i
  stället för 22.
- **Världen svarar:** Den som står mitt i kikaren i 2 s inom 40 m vänder sig mot Ove och svarar
  efter typ: barn vinkar och jublar, vuxna säger "Hallå, jag har också rätt att vara här!",
  tonåringar "Okej, boomer.", pensionärer skakar näven. Patrick blir påkommen ("Hej Ove! Jag skulle
  bara... nej, det var inget."), Vita skjortan stirrar tillbaka ("Det där noteras."), Rune säger
  "...Ove.". Ove har en åsikt om bilmärket. Spanar han mot Anders hus står Anders redan där med en
  egen kikare, och Ove sänker sin: "Hmpf.". Även utan kikare vrider Ove huvudet mot felparkeringar
  han går förbi och pekar.
- **Ove:** "Jag ser det härifrån." (ny) · "Hmpf." · "Typiskt."
- **Bygger på:** `KEYS.lookBack` (läst bara i bilgrenen i `camera.js`), kamerans gren till fots
  (fov), gränserna 35 m och 22 m i `patrol.tags()`, `horn.react` med en ny sort `'look'` som i
  `hoppbacke.watchers`, `TYRE[kind]`, `p.anim.look` för huvudvridningen.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Bilar ritas utan förare bortom 46 m (LOD), så "förare i bilen" måste stanna där eller
  LOD-avståndet skalas med linsen. Att hålla R3 och sikta med samma spak är besvärligt; LT är ledig
  till fots. En riktig zoomvy med linsfält är M.

### 62. Knacka på rutan

Sitter föraren kvar i en felparkerad bil kan Ove knacka på rutan i stället för att skriva upp bilen.
Ibland flyttar föraren, ibland drar hen, och det beror på bilmärket.

- **Så gör man:** Till fots, E vid förardörren (i dag händer ingenting där). Ove lutar sig mot bilen
  och knackar tre gånger. Samma knackning fungerar på en parkerad bil som står på tomgång med
  föraren inne.
- **Världen svarar:** Chansen att föraren drar följer tutans humörtabell (BMW nästan alltid, Volvo
  240 sällan). Flyttar hen säger hen "Okej, okej! Jag flyttar den!", blinkar och kör iväg, och det
  ger lika mycket som en anmälan och räknas mot dagens grind. Drar hen börjar jakten som vanligt.
  Tom bil: "Ingen hemma. Typiskt.". Bilen gungar till vid knackningen, eftersom föraren är en byst
  som inte kan röra sig. På tomgångsbilen stängs motorn av och avgaserna slocknar (+2 Ordning),
  eller så tutar föraren.
- **Ove:** "Ingen hemma. Typiskt." · "Det blir inte varmare för att motorn går." (ny) · "Det står ju
  på skylten."
- **Bygger på:** en typ `'knock'` i `nearestInteractable` före kollen av låsta bilar, kroppen i
  `patrol.dropPursuit()` för att köra iväg, `patrol.startPursuit(c)`, `TEMPER` exporterad ur
  `horn.js`, gungningen från `kickTyre`, ett glasknack via `audio.synth`.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Med mindre belöning än en anmälan knackar ingen, därför samma +7 Ordning. Tomgångsbilarna
  görs av befintliga parkerade bilar (`engineOn = null` och en byst), inte nya.

### 63. Stamkunderna: samma skylt igen

Det är alltid samma idioter. Fyra återkommande bilar med fasta registreringsnummer felparkerar på
sina favoritställen, och Ove för bok.

- **Så gör man:** Inget nytt, F som vanligt. Står skylten redan i blocket skriver Ove "3:e gången".
- **Världen svarar:** Varje stamkund har en vana på en gatuplats. Tredje gången sitter föraren kvar
  och blir smitare. Femte gången sitter en handskriven lapp i rutan ("Hej Ove! Bara fem minuter!
  /Golfen"); Ove läser den, säger "Du igen." och skriver upp bilen ändå. Efter sjätte gången kommer
  den inte tillbaka: "GXT 418 har skaffat parkeringstillstånd. Ove är nästan besviken.", +50 kr. En
  anmäld bil på gästparkeringen kommer tillbaka nästa morgon med samma skylt: "Igen. Noterad i går
  kl. 10:42.".
- **Ove:** "Du igen." (ny) · "Fjärde gången. Jag har det i boken." (ny) · "Jaså. Här ska vi stå,
  minsann."
- **Bygger på:** `patrol.spawnAt` med alternativ för skylt, typ och färg (`claimPlate`), en tabell
  `ROSTER`, räkningen per skylt i `patrol.toSave`, fältet `Nr` i `hud.notebook`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Bara gatuplatser kan ge smitare. Två bilar med samma skylt samtidigt släpper varandras
  skylt i `claimPlate`.

### 64. Eldar för kråkorna

Anders terrassvärmare brinner mitt på dagen, och en tom bil står med lyset tänt. Ove vrider av och
släcker, och har en åsikt om alltihop.

- **Så gör man:** Till fots, E vid terrassvärmaren: ett pys och lågan dör. E vid förardörren på en
  bil med lyset på ger "Släck lyset" i stället för "Kliv in".
- **Världen svarar:** Anders tänder värmaren igen så fort Ove har gått 50 m, en löpande gag: "Jag
  tar upp det på årsmötet, Ove!". Lyset slocknar med ett klick, och ägaren får aldrig veta; en bil
  där Ove inte släckte har dött batteri senare och blir en starthjälp (37). Varje sak ger +2 Ordning
  och "Ove har sparat 6 kWh i dag.".
- **Ove:** "Ni eldar för kråkorna." (ny) · "Ingen hemma. Typiskt." · "Hmpf."
- **Bygger på:** terrassvärmarens låga i `ove.js decorate('anders')` som egen mesh styrd med
  `gfx.setLight()`, `updateLights()` med en flagga för kvarglömt lyse (och bilen väckt så att
  lamporna syns), `HONK_NEIGHBOUR.anders[1]`.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Öppna fönster ur det ursprungliga förslaget hoppas över, och ringklockan finns i 6. En
  parkerad bil som sover uppdaterar inte sina lampor.

### 65. Stoppuret vid lyktstolparna

Ove har tagit tid på folk hela livet. Han ställer sig vid ett kritkryss mellan två lyktstolpar på
Solrosvägen och mäter farten på nästa bil.

- **Så gör man:** Till fots vid krysset, en bit från trottoarkanten: ett tryck läser nästa bils
  verkliga fart.
- **Världen svarar:** En handskriven toast: "Golf. 47 km/h. I trettio.". Bilar som ser Ove stå där
  saktar in som för en fartkamera. Den som körde över 35 hamnar under "Fortkörare" i blocket (+1
  Ordning). Vid hållplatsen kan han ta tid på bussen mellan två hållplatser ("Linje 2: 4 min sen.",
  med rekord), och en bil som står på hållplatsen och spärrar bussen ger dubbelt.
- **Ove:** "Ordentligt." · "Det står ju på skylten." · "Typiskt."
- **Bygger på:** `data.js lamps` för stolparna, bilens `speed`, AI:ns `cruise` som sänks när Ove
  syns, bussen i `TRAFFIC`, patrullplatserna av sorten `'busstop'`.
- **Insats:** S · **Röst:** 0
- **Obs:** En bil inom 2,2 m tar E även när den rullar, och `enterCar` kollar inte farten, så
  krysset måste stå en bit från kanten eller rullande bilar uteslutas. A-traktorn med basen på max
  kan komma senare som vanlig trafik på gatorna.

## Laga och fixa

Ingen kan någonting nu för tiden, utom Ove. Håll lagandet smalt (det Ove själv haft sönder och det i
hans kvarter) och låt grannarna komma med jobben, så att det aldrig blir en checklista.

### 66. Gatlyktan som blinkar

En parklykta vid Oves gångväg blinkar och surrar. Han kan sparka på stolpen, vilket hjälper en
stund, felanmäla den, vilket inte hjälper alls, eller öppna luckan och laga kontakten själv.

- **Så gör man:** Till fots. J vid stolpen ger ett metalliskt dong, och lyktan lyser stadigt i 20–40
  s; den tredje sparken släcker den helt. F skriver "Felanmälan: Gatlykta blinkar" i
  anteckningsboken. Håll E vid luckan längst ner (posen `'low'`) och tryck E när lampan är tänd för
  att trycka fast kontakten, tre gånger i rad.
- **Världen svarar:** Felanmälan ger toasten "Kommunen: Tack för din felanmälan. Handläggningstid
  6–8 veckor." och nästa morgon "Ärendet avslutat. Ingen åtgärd.". Lagar Ove den själv bockas den
  av: "Åtgärdat av Ove. 0 kr.". Trycker han när lampan är släckt slår det en gnista och han rycker
  till. Vita skjortan: "Det där noteras.".
- **Ove:** "Kontaktfel. Kommunen har vetat sedan i våras." (ny) · "Ingen kan någonting nu för
  tiden." · "Hmpf."
- **Bygger på:** `pathLamp` i `kit.js` (en lykta byggd utanför batchen med `realMesh(geo, { unique:
  ['light'] })` och `gfx.setLight()`, eller en mörk platta över), en gren i `kickHit` för stolpar,
  `hud.notebook` med stämpeltexten som parameter, `FX.sparks`, `audio.synth` för surret.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Fri runda är alltid dagsljus, så en låg parklykta syns bättre än en gatlykta på 6,6 m. F
  måste ge företräde åt en felparkering inom räckhåll. Billigast: sparken och luckan, ingen
  felanmälan (S).

### 67. Trasigt står kvar tills Ove lagar

I dag kommer allt som gått sönder tillbaka av sig självt efter en och en halv minut. Låt det Ove
själv haft sönder i sitt kvarter ligga kvar som vrak tills han lagar det. Första jobbet är hans egen
brevlåda, som Patricks släp tog dag 1.

- **Så gör man:** Till fots vid en trasig sak, håll E: Ove tar fram verktyget och jobbar i
  arbetsposen medan stapeln fylls. Spikar han är det tre spikar, och man trycker när hammaren är
  högst upp; en miss träffar tummen ("uff" och en röd blixt). Sneda skyltar som någon kört på riktar
  han upp med vattenpass.
- **Världen svarar:** Det lagade står kvar och sparas, och han får tillbaka halva böten för det han
  själv förstörde. Patrick med gips står bredvid och håller brädan snett, och Ove säger "Mät två
  gånger. Såga en gång." till honom. Barn tittar och jublar vid sista spiken. Lappen: "Ove
  antecknar: Brevlåda, Solrosvägen. Lagad.". Utanför kvarteret felanmäler han med F, och kommunen
  "åtgärdar" utom synhåll på sitt sätt: skylten lutar nu åt andra hållet. Torgklockan, som går fyra
  minuter efter, ställer han med ett tryck på E, och en pensionär bredvid vrider fram sitt eget ur
  också.
- **Ove:** "Ingen kan någonting nu för tiden." · "Ordentligt." · "Mät två gånger. Såga en gång."
  (ny)
- **Bygger på:** `breakProp` och `tickProps` i `props.js` (en `repairProp(p)` som gör återkomstens
  gren direkt), en variant av `propsNear` som tar med döda props, `p.byOve` och `p.paidKr` sparade i
  `onPropBroken`, `blockAt()` mot Oves kvarter, `posePlayer('work', 'low')` med skiftnyckeln,
  `hud.toast` i hoppbackens stil.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: sönder och betala finns, laga inte. Namnskyltarna på postlådeställen är
  bakade separat och svävar kvar när stället går sönder; uteslut `mailrow` eller göm skyltarna.
  Högst sex trasiga saker åt gången, annars blir det en städsyssla. Spikspelet, felanmälan och
  torgklockan gör det L.

### 68. Stegen ur garaget

Ove tar stegen från garageväggen och bär den. Han ställer den mot en vägg för att nå upp: till
Parvanehs adventsstjärna, till katten på cykelförrådets tak, till flickornas boll på garagetaket.

- **Så gör man:** Till fots, E vid stegen i garaget. E vid ett markerat ställe reser den, håll E för
  uppgiften däruppe, E nere tar med den igen.
- **Världen svarar:** Första jobbet är stjärnan Patrick aldrig fick upp dag 2. Ove sätter den på
  övervåningen, och Patrick tittar upp och säger "Parvaneh säger att jag inte får gå upp på stegar
  mer. Någonsin.", och Ove: "På en stege. I snö.". Stegens sving är skämtet: den som står bakom Ove
  när han vänder sig får den i sig ("Akta!"), parkerade bilar gungar till, och Patrick går över till
  andra sidan gångvägen när han ser Ove komma med en stege. Katten på taket: "Det är inte min
  katt.", och Sara säger "Du hittade honom! Ove, du är världens bästa!".
- **Ove:** "På en stege. I snö." · "Det är inte min katt." · "Sjuttiofem grader. Annars ramlar man.
  Som Patrick." (ny, valfri)
- **Bygger på:** stegen i `rowhouse.js garageInterior` (rad 393–395, utan slumptal, så den kan tas
  bort säkert), `setCarrying()`, ett nytt klättertillstånd i `character.js`, stjärnan som en liten
  mesh i ytan `'light'` som Jimmys, `catchCat` och kattärendet, ett svep mot folk och bilar.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** M gäller en kort pallstege och bara katten och stjärnan; en 3 m stege är L, sticker in i
  kameran bakom Ove och svänger genom väggar. Bärandet spärrar inget i dag (hopp, spark, bil).
  Parvanehs köksfönster har redan en stjärna; flytta upp den först när jobbet är gjort.

### 69. Lämnat vid garageporten

Grannarna har förstått vem som kan laga saker. På morgonen står något trasigt vid Oves garageport
med en lapp, och Ove lagar det där.

- **Så gör man:** Till fots, E vid saken läser lappen, håll E lagar den med ett av handgreppen i 67.
- **Världen svarar:** Lapparna är text: "Ove! Pulkan sprack. Kan du? /Sara (och Nasanin)", "Förlåt
  att jag stör. Sparken gnisslar. /Anita", "Insexnyckeln gick av. Igen. /Patrick", och Patricks
  lappar blir allt mer ursäktande. Nästa morgon står saken hos ägaren och används, och tacket kommer
  nästa gång Ove pratar med dem: Anita "Tack, Ove. Du är snäll, vad du än säger.", Jimmy "Ove, du är
  kung! Jag bjuder på en macka!". +3 Ordning per lagning.
- **Ove:** "Ingen kan någonting nu för tiden." · "Jaja." · "Det var ingenting."
- **Bygger på:** `PROP_TYPES[pulka | kicksled | bike].build` för lösa meshar, gryningen i
  `missions.updateGate`, ärendenas tack (`ERRANDS.element`, `.mobilen`, `.nyckeln`), en sparad
  lista.
- **Insats:** M · **Röst:** 0
- **Obs:** Efter dag 7 kommer inga fler morgnar, så det behövs en egen timer. Bärandet till ägaren
  hoppas över.

### 70. Saaben på arbetsbänken

I dag kan en rykande bil aldrig lagas. Ove kör in Saaben i garaget och skruvar tills röken slutar,
för en Saab lagar man själv.

- **Så gör man:** Ställ den skadade bilen på Oves plats i garaget, stå i porthålet och håll E: en
  kort ridå med texten "Ove skruvar i garaget".
- **Världen svarar:** Bilen får tillbaka hela hälsan, och röken under 35 hp försvinner. Toasten:
  "Ove antecknar: Saab 900. Lagad. 0 kr. Bilhallens verkstad: 4 800 kr.". Efter dag 5 ställer Adrian
  ibland sin rykande Saab framför Oves garage och väntar, och lagningen blir en lektion där Adrian
  tittar på ("Tack, Ove! Du borde ha en egen kanal."). En tysk bil vägrar Ove att röra: "Plast och
  elektronik.".
- **Ove:** "Saab lagar man själv. Det är hela poängen." (ny) · "Plast och elektronik." ·
  "Ordentligt."
- **Bygger på:** `car.repair()` (finns, anropas aldrig), `landmarks.oveGarageSpot` och rutkontrollen
  i `parkIn`, `cut` i `holdAt`, `named.adrianSaab`, `ERRANDS.punktering.thanks`.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Finns delvis: `car.repair()` och hp-mätaren på hastighetsmätaren. Ove kan inte stå vid
  motorhuven (0,3 m till bänken), därför porthålet. En omladdning lagar ändå allt gratis, så värdet
  ligger inom ett spelpass.

### 71. Ljusslingan med en trasig lampa

Ljusslingan på Jimmys förråd är mörk, eftersom en enda trasig lampa släcker hela slingan. Ove letar
upp den med en spänningsprovare, smart eller envist.

- **Så gör man:** Till fots vid slingan, håll E: fjorton prickar på anteckningsbokspapper, A/D
  flyttar provaren och E provar. Piper den har strömmen kommit fram, och felet sitter längre bort.
  Den som halverar hittar felet på 3–4 försök.
- **Världen svarar:** Hela slingan tänds. "Ove antecknar: Slinga, 14 lampor. Hittad på 4 försök.
  Rekord!". Jimmy kommer ut: "Ove! Mannen själv!". Felet flyttar till en ny slinga som går att nå
  från marken varje morgon: Jimmys förråd, Anitas räcke, torggranens nedersta varv. I
  adventsljusstakarna i fönstren lyser ibland bara sex av sju; Ove ringer på och räcker fram en
  lampa, och den sjunde tänds först när han har vänt ryggen till.
- **Ove:** "Seriekopplat. En går, alla går." (ny) · "Sju lampor. Det ska vara sju." (ny, valfri) ·
  "Typiskt."
- **Bygger på:** slingorna i `ove.js` (bakade lådor i ytan `'light'`), en liten `InstancedMesh` av
  mörka lådor som läggs över de "släckta" (inget behöver tas ur batchen), `audio.tick` för pipet,
  rekordet sparat som `hopp`.
- **Insats:** M · **Röst:** 1–2 repliker
- **Obs:** Lamporna sitter 15 cm isär, så de kan inte väljas med Oves position; det måste vara ett
  HUD-överlägg. Dra inga nya slumptal i `advent()`, det flyttar alla senare slumpval i stan.

### 72. Fotpumpen

Ove sparkar på däck och säger "För lite luft. Som vanligt.". Nu betyder det något: han pumpar med
fotpumpen i takt.

- **Så gör man:** Till fots. En spark på en bil ger trycket som toast ("Vänster fram. 1,6 bar.").
  Håll E vid ett mjukt däck och tryck sedan J i jämn takt; för fort och slangen lossnar med ett väs.
- **Världen svarar:** "Ove pumpar. 2,2 bar.", +1 Ordning. En förbipasserande pensionär stannar och
  nickar gillande. Har Ove pumpat en grannes bil sitter en lapp under Saabens torkarblad nästa
  morgon: "Tack för luften! /Nilsson". Tonåringar säger "Okej, boomer.". En hård landning från
  hoppbacken kan göra ett däck mjukt igen.
- **Ove:** "För lite luft. Som vanligt." · "Ingen kollar lufttrycket nu för tiden." · "Bra däck."
- **Bygger på:** `kickTyre()` och `TYRE` (alla tre repliker finns), en flagga per bil för mjukt
  däck, `anim.kick` utan `kickHit` medan pumpen är framme, `audio.noise` för väset.
- **Insats:** S · **Röst:** 0
- **Obs:** Finns delvis: sparken och replikerna. Låt inte en lutning gå genom `_sus`, för då somnar
  parkerade bilar aldrig; toasten bär trycket.

## Stan och kronorna

Kronorna går i dag bara till böter. De är inte knappa (dagarnas belöningar ger 1 500 kr), så ett köp
måste motiveras av hur världen svarar och av Oves åsikt, inte av ekonomin.

### 73. Rädda köparen från Audin

Efter dag 5 står det folk och tittar på bilarna på Bilhallen. Ove ställer sig bredvid och sparkar på
däcken, och hans åsikt om märket får köparen att gå vidare till en Saab.

- **Så gör man:** Till fots på Bilhallens planer: sparka (J) på däcket inom 6 m från en köpare vid
  en Audi, en BMW eller en Golf.
- **Världen svarar:** Efter två eller tre åsikter ("Plast och elektronik.", "Tyskt krafs.", "Golf.
  Det är en sport, inte en bil.") kliver köparen bakåt, skakar på huvudet och går till närmaste
  Saab. Där sparkar Ove igen ("Bra däck.") och avslutar: "Den är ordentlig. Kolla rosten under
  trösklarna. Och pruta.". När köparen tvekar står Adrian i närheten och säger "Saaben startade på
  första försöket i morse!" som ett vittnesmål, och köparen bestämmer sig. En tonåring säger "Okej,
  boomer." och köper Audin ändå. Säljaren kommer ut efter tre räddade köpare: "Vad håller du på
  med?!". Blocket räknar "Räddade från tysk plast: 3", +1 Ordning var.
- **Ove:** "Plast och elektronik." · "Den är ordentlig. Kolla rosten under trösklarna. Och pruta." ·
  "Bra däck."
- **Bygger på:** `dealerBlock()` i `places.js` (platserna, prisskyltarna, veckans BMW), `kickTyre()`
  och `TYRE[c.kind]`, `STORY.saab.outro[4]`, köparna som fotgängare med ett häng-läge i `g.peds`,
  `CHATTER_AFTER.adrian`, `HONK_TEEN`, `OUCH[3]`.
- **Insats:** M · **Röst:** 0
- **Obs:** Finns delvis: sparken och åsikterna. Dag 5:s outro spelas på samma plan, så ingenting där
  medan ett uppdrag pågår. Billigast: en köpare, ingen säljare och ingen SÅLD-lapp (S).

### 74. Kundvagnarna ska tillbaka

Övergivna kundvagnar står i snön runt centrum. Ove skjuter tillbaka dem till kundvagnsgaraget vid
Livs och får tillbaka tian, eller släpper en och ser vad som händer.

- **Så gör man:** Till fots, E vid handtaget (samma skjutpose som med Runes rullstol), E släpper. J
  medan han skjuter ger en ordentlig knuff, och vagnen rullar fritt. I kundvagnsgaraget klickar den
  fast: "+10 kr".
- **Världen svarar:** En vagn som rullar in i en parkerad bil får den att gunga. Folk i vägen hoppar
  undan som för tutan: barn säger "Häftigt!", pensionärer "Ungdomen nu för tiden!". Rullar den in i
  Anders Audi går larmet, Anders kommer ut ("Föreningen har nya regler, Ove. Jag mejlar.") och Ove
  säger "Det var inte jag.". En återlämnad vagn ger +1 Ordning och "Tio kronor. I myntlåset.".
- **Ove:** "En tia. Folk slänger tior i snön nu för tiden." (ny) · "Ordning och reda." · "Det var
  inte jag." (ny, delas med 6)
- **Bygger på:** `trolleyShelter()` och den lösa vagnen vid Livs i `places.js`, propsen `cart` gömda
  med en ny hjälpfunktion och en dynamisk mesh ur `TYPES.cart.build`, en vagnstvilling i varje
  kontroll av `pushedNpc()`, `circleVsBlock`, `kickTyre`, `horn.react`, `addCoins`.
- **Insats:** M · **Röst:** 1–2 repliker
- **Obs:** Finns delvis: vagnarna kan bara gå sönder i dag (en spark kostar Ordning och kronor). En
  flygtur i hoppbacken och bilarmet gör det L. Vagnar kan inte skapas efter laddningen, bara visas
  och döljas.

### 75. Kön vid korvkiosken

Vid GRILLEN i centrum står det kö. Ove ställer sig sist, väntar och köper en korv med bröd för 25
kronor. Den som tränger sig får höra det, och Ove tränger sig aldrig.

- **Så gör man:** Till fots, ställ dig bakom den sista. Kön rycker fram var femte till åttonde
  sekund. Vid luckan köper E en korv eller ett kaffe.
- **Världen svarar:** En pensionär framför Ove mumlar länge med luckan, så att Ove trummar otåligt
  med fingrarna och till sist säger "Det är kö.", fast han själv står i den. Tränger han sig blir
  det "Det är kö här!" och −2 Ordning. En tonåring som tränger sig före går längre bak efter Oves
  pekfinger (5). Korven äter han stående, och Jimmy byter "Har du ätit?" mot "Ove! Mannen själv!".
  Ibland köper han två, lägger den ena på bänken vid kiosken och går, och Jimmy hittar den och
  jublar.
- **Ove:** "Det är kö." (ny) · "Senap. Inte ketchup." (ny) · "Tjugofem kronor. För en korv." (ny)
- **Bygger på:** `korvkiosk()` i `places.js` (menyn "Korv med bröd 25:- / Kaffe 15:-"), ett
  håll-läge i `Ped` så att tut- och sparkreaktionerna fortsätter fungera, `addCoins(-25)`, kiosken
  som en röst bakom luckan (luckan är en självlysande panel).
- **Insats:** M · **Röst:** 3–4 repliker
- **Obs:** Klockan 11–13 syns aldrig i fri runda, så låt kön alltid stå där. "Det är kö här!" ger
  tolv klipp; som mumlad bubbla kostar det inget. Jimmy står vid sitt hus hela dagen och behöver
  flyttas till torget en stund.

### 76. Två kaffe till Rune och Anita

Ove köper två kaffe vid korvkiosken och bär dem till Rune och Anita. Kaffe spills, så han måste gå
lugnt och köra mjukt, precis som han själv predikar.

- **Så gör man:** Till fots vid luckan, E "Köp två kaffe (30 kr)". Han bär en bricka. Shift, hopp
  och sparkar spiller; i bilen spiller hårda kurvor, inbromsningar, gupp och krockar. Prompten visar
  hur mycket som är kvar.
- **Världen svarar:** Ove erkänner aldrig att kaffet är till dem. Ställer han brickan på deras
  trappa och går innan Anita hinner tacka kommer toasten "Ove påstår att han råkade köpa för
  många.". Hinner hon tacka svarar han "Det var ingenting.". Fullt och varmt fram: Rune säger
  "...Ove.", +3 Ordning. Halvspillt: "Det gör inget, Ove. Vi tar på oss en tröja till.". Vid en hård
  kurva säger han till sig själv: "Man gasar inte i kurvorna.".
- **Ove:** "Man gasar inte i kurvorna." · "Det var ingenting." · "Femton kronor. För kaffe." (ny)
- **Bygger på:** `korvkiosk` (`Kaffe 15:-`), `setCarrying({ root })` med kattens bärpose, spill från
  `onCarImpact`, `onCarLanded`, `hopp.land`, sprint, hopp och spark, en typ `'give'` före `'chat'`
  vid Anita, `ERRANDS.element.thanks` och `.fail`.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Dag 3 och dag 6 är Anita dagens givare, och då betyder E "börja dagen". Att bära
  blockerar garageporten.

### 77. Loppis på torget: pruta med prislappen

Reklampelaren har hela tiden sagt "Loppis söndag". Efter berättelsen står ett loppisbord utanför
Second hand, och Ove prutar tyst och envist med pengarna i handen.

- **Så gör man:** Till fots, E vid bordet. Ett kort E köper till lappens pris; håll E så prutar han,
  och priset sjunker i promptraden medan säljarens tålamod sjunker.
- **Världen svarar:** Pensionären korsar armarna och håller emot, tonåringen tittar i mobilen och
  säljer billigt. Bland fynden finns ett värmereglage till en Saab 900, som gör att Ove tinar
  fortare ute i kylan, och ett "Saab-emblem" som visar sig vara från en Opel och inte räknas till
  samlingen. Rekordet förs i blocket som luftfärden: "Prutat 140 av 200. 30 %.". Adrian, som prutade
  fyratusen, får höra hur man gör: "Hmpf. Femtusen hade gått.".
- **Ove:** "Femtio." (ny) · "Det där är ingen Saab. Det är en Opel." (ny) · "Hmpf. Femtusen hade
  gått."
- **Bygger på:** affischen `'Loppis\nsöndag'` på reklampelaren i `places.js`, bordet som props
  placerade vid bygget och gömda till efter dag 7, `hud.setPrompt(text, hold)`, en fotgängare i
  håll-läge som säljare, rekordet sparat som `hopp`, en faktor på `COLDK.thawCar`.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** M gäller ett bord och en säljare; flera bord och grannar som säljare gör det L. Efter
  berättelsen står klockan på 16.30, så loppisen hålls i skymning, utan nya ljus. Stumma grannar som
  säljare skulle bryta mönstret att alla svarar i karaktär.

### 78. Något att köpa: mössan, biltvätten och pantkvittot

Kronorna får äntligen något att gå till. Huvudköpet är en stickad mössa på Second hand; sedan finns
biltvätten på macken och ett pantkvitto som alltid räknar fel.

- **Så gör man:** Till fots. E vid Second hands dörr köper mössan en gång (40 kr). E vid biltvättens
  betalstolpe med Saaben i kön: "Biltvätt · 129 kr". E vid pantautomaten vid Livs skriver ut ett
  kvitto för burkarna sedan förra gången.
- **Världen svarar:** Mössan syns på Ove och kylan stiger långsammare; uppvaknandets "Utan mössa
  kommer du inte in här" tas bort, och Anita byter "Klä dig varmt, Ove." mot en nöjd nick.
  Biltvätten är en ridå, "Ove tvättar Saaben. Han håller ögonen på borstarna.", och sedan en blank
  Saab som andra Saabförare tutar extra åt. Pantkvittot räknar alltid en burk för lite: "Tjugofyra.
  Jag räknade tjugofyra.". Burkarna plingar som förut när han plockar dem.
- **Ove:** "Hundratjugonio kronor. För vatten." (ny) · "Tjugofyra. Jag räknade tjugofyra." (ny) ·
  "Hmpf."
- **Bygger på:** `game.unlocked` (sparas men används inte i dag), en faktor på `rate(d)` i
  `cold.js`, `CHARS.ove.hat` (modellen byggs om, och `animLod` kollar `def !== CHARS.ove`),
  biltvätten i `places.js gasBlock`, `car.grime` och `grimeLv`, `hud.curtain()`, kvittot som toast.
- **Insats:** L · **Röst:** 2 repliker
- **Obs:** Finns delvis: kronorna och butiksfasaderna. En osynlig mössa (bara effekten och en toast)
  plus biltvätten är S. Dockorna i `waking.js` och `luftning.js` bygger sin egen Ove och skulle
  sakna mössan. Second hands dörr har inget landmärke i dag.

## Grannväven

Grannarna får relationer till varandra som Ove ändrar, utan att han någonsin erkänner att han hade
med saken att göra. Allt här bör gå på realtidstimer i fri runda, annars ser spelaren aldrig
resultatet.

### 79. Rune ute: parkera rullstolen

Efter dag 3 kan Ove skjuta ut Rune och ställa honom där livet passerar: vid gatan, vid Jimmys dörr,
vid lekplatsen eller med flit framför Anders Audi. Där kommer grannarna fram, och Rune säger ett ord
i taget.

- **Så gör man:** Till fots, håll E vid Rune för att ta handtagen och tryck E för att ställa honom.
  Ove drar åt bromsen och går.
- **Världen svarar:** Vid gatan säger Rune märket på varje bil som kör förbi ("...Volvo.",
  "...BMW.", "...Saab."), och Ove för tyst en lista i blocket: "Volvo 4. Saab 1. Han fuskar.".
  Framför Anders Audi säger Rune "...BMW.", och Anders kommer ut: "Vad håller du på med?". Framför
  Saaben säger han av gammal vana "...Volvo.", tills Ove svarar "Ja, Rune. Saab.". Vid Jimmys dörr
  säger Jimmy "Fint väder, va?", Rune "Hm.", och en toast: "Jimmy delar sin macka med Rune.". Efter
  tre minuter hämtar Anita honom, och på kvällen säger hon i radion "Det är så lugnt i området i
  dag, Ove. Rune sover som en stock.".
- **Ove:** "Ja, Rune. Saab." · "Plast och elektronik." · "Sitt här. Titta på bilarna." (ny, valfri)
- **Bygger på:** `addCompanion(npcs.rune, { push: true })` och `pushedNpc()` (finns för
  rullstolsärendet), att ställa honom genom `removeCompanion` plus `busy = true`, passerande bilar
  via `g.byX()`, `RUNE_HORN[c.kind]`, `KICKED_NEIGHBOUR`, `PATROL.reda` via `game.radio`.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis: Rune kan skjutas i ärendet. Dag 3 och 6 är Anita givare och Rune med i
  introt, så han ska skickas hem vid `begin()`. Området runt hans dörr är bilfritt, så "vid gatan"
  betyder utanför det.

### 80. "Kom med." Ove för ihop grannar

Ove tar med sig en granne till en annan utan att säga varför, ställer dem mittemot varandra, säger
"Där. Prata." och går.

- **Så gör man:** Till fots, håll E en halv sekund vid en granne: hen följer efter Ove. När han
  kommer inom 3 m från en annan granne börjar mötet av sig självt.
- **Världen svarar:** Mötet fortsätter bara medan Ove har ryggen åt dem; vänder han sig om tystnar
  båda och vinkar stelt. Adrian och Patrick, två män utan händer: "Kan du lära mig byta däck någon
  gång?" och "Jag är IT-konsult. Jag kan starta om saker. Det är ungefär allt.", och toasten "De ska
  lära sig tillsammans. På YouTube.". Jimmy och Anita ger toasten "Anita bjuder på kanelbullar.
  Jimmy tar tre.". Fel par gör det värre: Adrian och Anders före dag 5 ("Klokt val, Adrian. Tysk
  ingenjörskonst. Jag kör själv en A6, som bekant.", och Ove muttrar "Plast och elektronik.").
  Anders följer inte med alls: "Morsning, Ove. Fint väder för en promenad.".
- **Ove:** "Kom med. Jag ska visa dig en sak." (ny) · "Där. Prata." (ny) · "Ingen kan någonting nu
  för tiden."
- **Bygger på:** `addCompanion` och `removeCompanion` och brödsmulespåret i `stepNpcs`, småpratet
  som blir ett följe om `input.down('interact')` fortfarande hålls efter 0,5 s, en tabell `MEET` i
  `script.js` som bara pekar på befintliga repliker, `walkNpc` hem längs gångvägen.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** `begin()` släpper inte tillfälliga följeslagare; släpp dem vid uppdrag och scener. Kliver
  Ove in i Saaben följer grannen med. Aldrig dagens givare.

### 81. Morgonens gräl: medla eller tuta

Anders står med knuten näve vid Runes Volvo framför garage 4. Ove kan köra undan bilen eller tuta,
så att båda blir arga på honom i stället.

- **Så gör man:** E vid Volvon: Ove sätter sig i den och ställer den i en ledig boenderuta. Eller
  tuta (T) från bilen inom 20 m.
- **Världen svarar:** Kör han undan Volvon har Anders inget mer att säga och går hem med händerna i
  fickorna, Ove säger "Vem tror du skrev stadgarna? Jag.", och Rune säger "...Volvo.". Volvon står
  sedan kvar i sin nya ruta för gott. Tutar han vänder sig båda mot Ove med sina tutrepliker och
  glömmer grälet, för nu har de något gemensamt: Ove (−2 Ordning). Fler gräl kan komma senare, om
  Jimmys ljusslinga och om Parvanehs flyttkartonger.
- **Ove:** "Vem tror du skrev stadgarna? Jag." (ny) · "Det var för att avvärja fara." · "Det står ju
  på skylten."
- **Bygger på:** `named.runeVolvo` i `ove.js`, de lediga norrutorna 6, 8, 10, 11 och 15,
  rutkontrollen i `parkIn`, rutan sparad och Volvon flyttad i `storyWorld()` (annars bygger
  `respawnNamed` och laddningen om den på den gamla platsen), `horn.react` och `HONK_NEIGHBOUR`.
- **Insats:** M · **Röst:** 1–2 repliker (Ove, och en öppningsreplik för Anders)
- **Obs:** Att ställa sig på regelns sida med F går inte via patrullen: en anmäld bil tas bort, och
  Runes Volvo skulle försvinna. Inget gräl med Anders dag 5 (han är med i loppet) och aldrig med
  dagens givare.

### 82. Grannväven: vem pratar med vem

Grannarna hälsar på varandra när berättelsen har fört dem samman: Parvaneh hos Anita efter dag 2,
Jimmy hos Anita efter dag 3, Adrian hos Patrick efter dag 5.

- **Så gör man:** Inget eget verb. Den som går förbi Anitas dörr ser Jimmy stå där.
- **Världen svarar:** Paret står vänt mot varandra med prat- och lyssnaposerna och byter repliker de
  redan har. När Ove går förbi tystnar de och tittar efter honom, som om de just pratat om honom.
  Första gången kommer toasten "Adrian och Patrick pratar med varandra nu. Ove hade inget med saken
  att göra.". Står Parvaneh nära säger hon "Ove, du ser nästan glad ut i dag.". Förslagen 80, 3 och
  79 lägger till fler besök.
- **Ove:** "Det var ingenting." · "Jaså." · "Hmpf."
- **Bygger på:** `homeSpot(key)` med en besökskälla efter `elsewhere`, `walkNpc(ch, pts, { stay:
  true, yaw })` längs gångvägen (`torg`, `oveStart`), `anim.listen`, `say(n, text)` under
  `chatGlobalT`, en tabell `GRANNPRAT` med befintliga par.
- **Insats:** S · **Röst:** 0
- **Obs:** Ett fast schema räcker; värden från −3 till +3 och en kartmarkör behövs inte. Besökarna
  är upptagna, så ärenden som behöver dem hoppas över. Skicka hem dem vid `begin()`.

### 83. Vem passar flickorna i dag?

En förmiddag ska Parvaneh till barnmorskan och lämnar Sara och Nasanin hos Ove. Han vill inte ha
några barn, så han lämnar dem hos en granne.

- **Så gör man:** Till fots, E vid Parvaneh under etiketten "Barnvakt?": flickorna följer efter. E
  vid en granne lämnar dem där, eller så behåller han dem.
- **Världen svarar:** Jimmy: "Ove! Mannen själv!", och toasten "Glass till lunch. Igen.". Anita:
  toasten "Sara lär Rune säga Nasanin. Det blir 'Saab'.", och Rune säger "...Saab.". Anders:
  "Morsning, Ove. Fint väder för en promenad.", och han stänger dörren. Oavsett vem smiter flickorna
  tillbaka efter en stund och sätter sig i Saabens baksäte, där de tutar "Igen!" tills Parvaneh
  kommer, och Ove säger "Det är inte mina barn.".
- **Ove:** "Det är inte mina barn." (ny) · "Ingen glass." (ny, valfri) · "Nej."
- **Bygger på:** `addCompanion` för flickorna (som Nasanin i förskoleärendet),
  `MISSIONS[1].elsewhere` som förebild (dag 2 är de redan hos Jimmy), `walkNpc` till värdens dörr,
  `horn.passengers` med `HONK_PASSENGER.sara` och `nasanin`.
- **Insats:** M · **Röst:** 1–2 repliker
- **Obs:** Bara morgnarna dag 3–6, och värden får inte vara dagens givare. "Klockan 14" i det
  ursprungliga förslaget ersätts med "tills Ove börjar dagen". Bara Jimmy som värd är S.

## Ronden och ordningen

Oves morgonrond i området. Kärnverbet är de tre rycken som redan finns vid hans egen garageport.

### 84. Kontrollrundan

Ove går sin rond: han drar i handtaget på varje garageport i längan och på soprummets dörrar, tre
ryck på varje, precis som med sin egen port. En av dem står olåst, och rundan har stoppur och
rekord.

- **Så gör man:** Till fots, kort E vid portarna 2–9 och vid soprummets dörrar. Den olåsta ger efter
  med ett klonk och låses. Klockan startar vid första punkten, och punkterna tas i valfri ordning.
- **Världen svarar:** "Rond 6/10" i hörnet. Hela ronden ger "Kontrollrunda 11:42 · Allt i ordning.",
  +3 Ordning och "Rundan 6 min 12 s · nytt rekord", sparat som hopprekordet. Den olåsta: "Garage 7
  var olåst. Nu är det låst.". Står en felparkerad bil framför soprummet eller garage 5–6 säger Ove
  "Det står en bil i vägen." och kan anmäla den på stället. Vid port 4: "Runes Volvo. Han kör den
  inte längre.". Fler stationer: två soptunnor som vinden har vält (med pantburkar runt),
  återvinningen där något ligger fel och kråkorna har dragit ut skräp (F vid en kråka: "Den kan ändå
  inte läsa."), och flaggan på gräsplanen som ska upp.
- **Ove:** "Så." · "Typiskt." · "Den kan ändå inte läsa." (ny)
- **Bygger på:** `garageRow()` i `rowhouse.js` (dörrarna med handtag på `CURB + 0.95`), tug-fasen i
  `stepDoorOp` och `doorReach` generaliserade (`op.door || this.garage`), soprummets dörrar i Oves
  block, `GARAGE_DOOR.shut` och `.carInWay`, `TYRE.runeVolvo[0]`, ett sparat fält för dagens ryckta
  portar.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis: de tre rycken vid Oves port. Varje port ska bara ge Ordning en gång per
  dag. Att porten glider upp kräver att den tas ur batchen; ljud och en skakning räcker. Bara
  portarna är S. Ingen gryning efter dag 7.

### 85. Oves lista: att åtgärda

Anteckningsboken får sidan ATT ÅTGÄRDA. Varje morgon har området fått några nya fel, och listan är
det Ove skriver upp på rundan.

- **Så gör man:** När Ove ser ett fel inom 12 m skriver han upp det ("Noterat: garage 6 olåst.").
  Pausmenyns bok visar sidan, och stora kartan ett blyertskryss. Att fixa är sakens eget verb.
- **Världen svarar:** 4–6 fel per morgon ur Saklistans rader: en olåst port, ett tomt fågelbord hos
  Rune, en isfläck, en brevlåda som någon kört sönder. Varje fix ger +2 Ordning och en överstruken
  rad. Allt avbockat ger stämpeln "ALLT ÅTGÄRDAT 12:41", +10 kr och Anitas "Det är så lugnt i
  området i dag, Ove. Rune sover som en stock.". Fixar räknas som anmälningar i grinden mellan
  dagarna, så den som hellre lagar än skriver lappar kommer också vidare.
- **Ove:** "Det står ju på skylten." · "Ingen kan någonting nu för tiden." · "Ordning och reda."
- **Bygger på:** rader med `fault` i Saklistan (1), `hud.renderLog`, en ny markörtyp i
  `hud.drawMinimap` och `toggleBigMap`, `audio.pen` och `audio.stamp`, summan i
  `missions.updateGate`, ett sparat fält `lista`.
- **Insats:** M · **Röst:** 0
- **Obs:** M gäller tre fel utan ny fysik (porten, fågelbordet, isfläcken); fler gör det L. Efter
  dag 7 behövs en egen natt (se 89). Pauskortet ska klara `uipause` i 15 fönsterstorlekar.

### 86. Oves trafikkoner

Ove har en trave koner i garaget. Han ställer ut dem för att stänga en ruta eller markera en
isfläck, och de står kvar tills Anders plockar in dem.

- **Så gör man:** Till fots, E vid en av tre fasta konplatser (gångvägens östra mynning, framför
  soprummet, en gästruta): "Ställ ut kon" eller "Ta in kon".
- **Världen svarar:** En kon på en felparkeringsplats gör att ingen parkerar där. Trafiken stannar
  vid en kon i gatan, tutar ("Vad är problemet?") och kör efter fem sekunder rakt över den så att
  den flyger; Ove antecknar numret ("Körde på konen. Noterat.") och får en anmälan. Varje morgon har
  Anders plockat in en, med toasten "Styrelsen har inte godkänt avspärrningen.". Den norra pollaren
  vid tvärgången kan fällas upp med E; felparkerarna flyttar då ut på gatan, där fler blir smitare.
- **Ove:** "Så. Här står ingen." (ny, valfri) · "Ordning och reda." · "Det står ju på skylten."
- **Bygger på:** `TYPES.cone` i `props.js` (definierad men aldrig placerad), egna konmeshar med
  kolliderare som slås av och på med `.dead`, `patrol.spotFree`, `obstacleAhead`, AI:ns
  5-sekundersregel i `drivers.js`, pollaren i `radhusArea` som egen mesh.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Lösa koner som Ove bär är L. Props kan inte flyttas efter laddningen, och en kon av
  sorten `'prop'` kraschar `breakProp`. Patrullen håller alltid sex öppna felparkeringar, så konerna
  flyttar dem i stället för att minska dem: det är ironin.

### 87. Knacka på termometern

Termometern vid Oves köksfönster går att läsa av. Ove knackar två gånger på glaset och stapeln
sjunker en grad, för den hade fastnat.

- **Så gör man:** Till fots, E framför termometern. Han sträcker sig fram och knackar två gånger.
- **Världen svarar:** Toasten "−9°. Kallare än i går.". Fem knackningar i rad ger "Den har alltid
  visat fel.". Dagens avläsning styr kylmätarens starttemperatur bortom skogen, och har han läst av
  den och sedan fryser ihjäl blir dödsrubrikens underrad "Termometern hade rätt. För en gångs
  skull." (raden finns redan i `cold.js`).
- **Ove:** "Den har fastnat igen." (ny) · "Hmpf." · "Jaså."
- **Bygger på:** termometern i `ove.js decorate('ove')`, en typ `'thermo'` med vänd-regel, dörrens
  räckpose (`doorReach`), `audio.tick`, `SUBS[4]` i `cold.js` tvingad i `pickSub`, kylmätarens
  `temp` som läser dagens värde.
- **Insats:** S · **Röst:** 0–1 replik
- **Obs:** En grad på en 1,8 cm bred stapel syns inte från kameran, så toasten bär det. "Kallare än
  i går" inte dag 1.

## Klockan och skymningen

Tiden blir något Ove kan läsa av och rätta sig efter. I fri runda står klockan på 14.30 och efter
dag 7 på 16.30, så det mesta här hänger på 88.

### 88. Skymningen faller, lamporna tänds

I dag stannar klockan på 14.30 och ljuset ändras aldrig. Låt i stället klockan gå till 16.30 efter
dagens uppdrag och skymningen falla. Lyktorna tänds, alla utom Oves egen farstulampa, tills han
tänder den själv.

- **Så gör man:** Ingen ny knapp. Efter uppdraget går klockan vidare, och ljuset följer den: solen
  bleknar från 14.45, och 15.10 tänds lyktorna. E vid Oves dörr, vänd mot den, tänder och släcker
  hans lampa.
- **Världen svarar:** Grannarna går in en efter en: Anita rullar in Rune först ("Klä dig varmt, Ove.
  Det är kallt i dag."), Parvaneh ropar in flickorna, Jimmy står kvar längst under sin ljusslinga.
  Första kvällen han tänder lampan säger Ove "Sonja tände alltid lampan. Klockan tre. Varje dag.",
  och sedan sätter sig katten i ljuset från den. Nästa morgon är det dagsljus igen.
- **Ove:** "Sonja tände alltid lampan. Klockan tre. Varje dag." (ny) · "Typiskt." · "Hmpf."
- **Bygger på:** `clockCap` och `tickClock` (tak på 16.30 medan grinden väntar), `dusk()` och `DUSK`
  i `missions.js` gjorda kontinuerliga och lagda runt bilden som `beforeRender` och `afterRender` i
  `cold.js`, den delade `uEmit` för ytan `'light'`, Oves farstulampa som egen mesh via radhusets
  `pre`-krok och `gfx.setLight()`, `setTimeout` som tänder dagsljuset igen 40 s efter dag 7
  borttagen.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** Finns delvis: dag 7 har en skymning som slås av och på. Grinden öppnar efter 90 s och
  måste vänta till 16.00 eller till sängen (89). Ändrar tester som `story`, `gate`, `dusk` och
  `reloadday`. Inga nya ljuskällor, bara självlysande ytor. Billigast: alla lyktor tänds samtidigt
  och Oves egen lampa är en egen mesh (M).

### 89. Kvällsrutinen: Ove går och lägger sig

I dag gryr nästa dag av sig själv mitt på gatan. Låt Ove avsluta dagen på sitt sätt: Saaben in,
porten ryckt tre gånger, lampan tänd och sedan in genom sin egen dörr. Under dagen ger samma dörr en
kopp kaffe.

- **Så gör man:** Till fots. När dagen är slut: E vid Oves dörr, "Gå in för kvällen". Är något
  ogjort säger han det och går inte in. Under dagen ger E vid dörren "Ove dricker en kopp kaffe."
  med perkolatorns puttrande bakom en svart ridå.
- **Världen svarar:** Kvällslistan består av sådant spelaren redan gör, +1 Ordning per bock och
  "Ordning och reda." när den är full. Sedan sovrummet från uppvaknandet: Ove drar upp
  väckarklockan, bläddrar i blocket med en toast om dagens siffror ("7 anmälningar. 1,8 s luftfärd.
  Hmpf."), tittar på hennes halva av sängen och släcker. Går Ove aldrig hem gryr det ändå: "Ove
  somnade i fåtöljen.". Efter kaffet står den granne som ringde på kvar på trappan med sin replik,
  till exempel Parvaneh: "Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket.". Parvaneh
  kan också bjuda på middag, med ridån "Middag hos Parvaneh. Saffransris. Igen.".
- **Ove:** "Saaben står ute. Det går inte." (ny) · "Ordning och reda." · "...Mat."
- **Bygger på:** `missions.updateGate` som väntar på sängen, `game/waking.js` och
  `buildBedroom(info, { photo, clock })` (väckarklockan visar redan `g.clockMin`), en typ `'door'`
  vid `lm('oveHouse')` med vänd-regel, `hud.curtain()`, `CHATTER.parvaneh`.
- **Insats:** L · **Röst:** 1 replik
- **Obs:** Finns delvis: sovrummet och gryningen. Bara dörren med ridåer är S–M. En vecka 2 efter
  dag 7 är ett eget lager. Saabens hem är `saabSpot` ute, så "Saaben in" är en ny regel.

### 90. Sopbilen kommer

När dagens uppdrag är klart på dag 2 och dag 5 tutar sopbilen från västra gatan. Någon har ställt
sin bil framför soprummet, och Ove har en minut på sig.

- **Så gör man:** Toasten "Sopbilen kommer om en minut", och en felparkering "Framför soprummet"
  dyker upp. Ove anmäler den med F, eller knackar på rutan (62).
- **Världen svarar:** Fri väg: sopbilen stannar vid infarten med pipande backvarnare och
  varningsblinkers, tömmer kärlen och tutar två korta tack, +3 Ordning. Står bilen kvar blir det en
  lång tuta, "Tyst därute!" från ett fönster, −3 Ordning och Anders "Jag tar upp det på årsmötet,
  Ove!". Står Saaben själv i vägen säger sopgubben "Vi jobbar här!".
- **Ove:** "Tisdag. Sopbilen. Alla vet det." (ny) · "Det står ju på skylten." · "Typiskt."
- **Bygger på:** `patrol.forceSpawn(1, 'garbageRoom', { kinds: ['garbage'], smitare: false })`, en
  sopbil (`Car('garbage')`) som kör `'route'` till noden vid infarten och `ai.pullOver`,
  `audio.tone` för backvarnaren, `HONK_BACK.garbage`, `horn.window`, grinden hållen i `updateGate`
  medan det pågår.
- **Insats:** M · **Röst:** 1 replik
- **Obs:** Finns delvis: sopbilen kör redan i trafiken och felparkeringsplatsen finns. Ingen AI kör
  in på en parkering och backar, så sopbilen stannar på gatan vid infarten. Klockslaget 11.00
  skippas, eftersom fri runda aldrig ser det.

### 91. Julgranen på torget tänds

På söndagen är det första advent, och folk väntar på att julgranen ska tändas. Kommunen har ordnat
allt, utom att jordfelsbrytaren har löst ut.

- **Så gör man:** Till fots, när dag 7:s final är klar och skymningen ligger kvar. E vid elskåpet
  vid granens fot: Ove slår till brytaren.
- **Världen svarar:** När Ove kommer står Vita skjortan och letar i pärmen efter numret till en
  elektriker, och hans "Vi har en blankett för sådant." kommer precis när slingan tänds och barnen
  jublar. +5 Ordning och "Kommunen betalar inte.". Vid granen står en insamlare med gryta och
  klocka; Ove lägger i en tia bara när ingen ser, och står en granne inom 10 m kommenterar hen det,
  och Ove svarar "Säg inte det till någon.".
- **Ove:** "Jordfelsbrytaren. Alla borde veta var den sitter." (ny) · "Det är inte jul. Det är
  november." (ny, valfri) · "Säg inte det till någon."
- **Bygger på:** torggranens 90 lampor i `places.js` som egen mesh med `gfx.setLight()`, ett elskåp
  och `bf.mark('julgran', ...)`, 4–6 jublande dockor, `g.npc('vitskjorta')` flyttad dit utom
  synhåll, ett sparat fält för tänd gran, återställningen 40 s efter dag 7 fördröjd tills granen är
  tänd.
- **Insats:** S–M · **Röst:** 1–2 repliker
- **Obs:** Finns delvis: granen och affischen "Julmarknad 1:a advent". Granen är tänd hela veckan
  och mörk bara dag 7:s kväll.

## Stillhet och Sonja

Stunder där inget räknas. De bär bara när någon i världen svarar på stillheten.

### 92. Sitta en stund hos Rune

Sedan dag 3 känner Rune igen Ove, lite i taget. Ove går ner på knä bredvid rullstolen och är bara
där en stund, och för varje gång kommer Rune ihåg lite mer.

- **Så gör man:** Till fots från dag 3, E vid Rune: Ove knäböjer bredvid stolen, och båda tittar ut
  mot gångvägen. Så länge spelaren inte rör WASD sitter han kvar.
- **Världen svarar:** Runes ord växer med antalet besök: "...", "Hm.", "Volvo.", "...Saab." och till
  sist "...Ove.". Vid Saab svarar Ove "Ja, Rune. Saab.". Första gången Rune säger "...Ove." säger
  Anita "Han kom ihåg dig. Han kom faktiskt ihåg dig.", och Ove "Bra. Det är bra, Anita.". Har Ove
  parkerat Saaben där Rune ser den och tutat kommer Rune ihåg snabbare. Ove kan också ringa Rune:
  andning, "...Ove.", "Ja, det är Ove.", luren läggs på, och toasten "Anita säger att han log.".
- **Ove:** "Ja, Rune. Saab." · "Bra. Det är bra, Anita." · "Ja, det är Ove."
- **Bygger på:** `chat()` med en gren för Rune efter dag 3, `anim.kneel` med `kneelReach = 0`,
  `CHATTER.rune` och `CHATTER_AFTER.rune`, `STORY.elementet.outro`, `STORY.varkarna.callsBack[0]`,
  en sparad räknare med en nedkylning i speltid.
- **Insats:** S · **Röst:** 0
- **Obs:** Ta bort "...Ove." ur Runes vanliga småprat, så att det sparas till sista steget; dag 6
  kan ändå säga det först. `kneelReach` måste återställas efteråt. "En gång om dagen" fungerar inte
  efter dag 7, därför nedkylningen.

### 93. Sätta sig på bänken

Ove kan sätta sig på vilken parkbänk som helst, sucka och bara vara. Världen fortsätter runt honom,
och bänken blir spelets vänteknapp.

- **Så gör man:** Till fots, E vid en bänk: Ove sätter sig med ett gubbstön. Rörelse eller E reser
  honom igen.
- **Världen svarar:** Efter 8 s tonas musiken ner. Folk reagerar efter ålder: en pensionär slår sig
  ner på andra änden och säger "Min rygg..." när hon reser sig, barn klättrar upp bredvid, en
  tonåring som satt där går när Ove sätter sig. På gröningen efter dag 3 rullar Anita fram Rune:
  "...Saab." och "Ja, Rune. Saab.". Sitter Ove kvar när nästa dag kan börja tonas bilden till "Ove
  sitter en stund." och en ny morgon.
- **Ove:** "Hmpf." · "Mm." · "Man får väl sitta." (ny, valfri)
- **Bygger på:** bänkarna (`bench` i `props.js`, cachade efter `finalizeProps`), sittposen utan ratt
  (`seatPose` med `st.driving = false`), ett nytt sittläge utan bil, `audio.oof` och `audio.grunt`
  (Oves egna stön), `audio.duckMusic`, grinden i `updateGate` som redan öppnar efter 90 s.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Ove ensam på bänken är S–M; folket omkring gör det L. Fotgängarna går bara slingorna runt
  kvarteren, så pensionären som sätter sig behöver en avstickare. En bil kan köra sönder bänken
  medan han sitter.

### 94. Söndagsbesök vid Sonjas grav

Efter dag 7 kan Ove göra som han lovade och komma tillbaka. Han berättar för Sonja vad som hänt i
dag, och kronorna kan gå till blommor.

- **Så gör man:** Till fots efter dag 7, E vid stenen: Ove knäböjer, letterbox, "Hej, Sonja.".
  Blommor köps vid kiosken för 40 kr.
- **Världen svarar:** Dagens rapport kommer som handskrivna kort: "9 felparkeringar. En Golf på
  handikapplatsen.", "Hoppade 23,4 meter i parken. Säg inget.", "Katten åt.". Sedan "Jag kommer igen
  på söndag. Som vanligt." och ett nytt litet minne per besök. Världen har varit där emellan: efter
  tredje besöket ligger en teckning från Sara vid stenen ("Till Sonja. Från Sara."), och Ove säger
  bara "Hmpf.". Grinden gnisslar varje gång tills han oljar den; då står han stilla en sekund och
  lyssnar på tystnaden innan han säger "Så.".
- **Ove:** "Hej, Sonja." · "Jag kommer igen på söndag. Som vanligt." · "Sonja tyckte inte om när det
  gnisslade." (ny, valfri)
- **Bygger på:** `kneelSpot()`, `graveShot()`, `flowersOnGrave()` och `layFlowers()` i `missions.js`
  (i en egen besökskontext, eftersom `stagePrompt` bara frågar uppdrag och ärenden),
  `hud.letterbox`, stilen från `PHOTO_NOTES`, en grindhalva i `places.js cemeteryBlock` som egen
  mesh.
- **Insats:** M · **Röst:** 0–1 replik
- **Obs:** Finns delvis: dag 7:s final gör det mesta. Inga speldagar efter dag 7, så "vissnar" och
  "på söndag" räknas per besök. Grinden ska vara tyst och stilla under hela dag 7.

## Lärlingen och gänget

Ove lär upp någon i stället för att göra jobbet själv, och stans tonåringar blir folk han kan vinna
respekt hos.

### 95. Gänget filmar: Gör om det, farbror!

Tre tonåringar hänger vid hoppbacken med mobilerna uppe. De filmar Ove och utmanar honom att göra
det igen, fast bättre, och respekten växer från "Okej, boomer." till "Saab-gubben!".

- **Så gör man:** Gör något märkvärdigt inom 40 m (ett hopp, en sladd, en lång tuta), så filmar de.
  E vid gänget ger dagens utmaning: "Slå gängets rekord. Golf, 17 m.". Ove vägrar först ("Nej.") men
  gör det ändå.
- **Världen svarar:** Klarar han det jublar de: "Gänget har lagt upp det. 3 412 visningar.".
  Respekten växer i fyra steg: de filmar hans misstag, de sänker mobilen när han går förbi, de
  nickar och ropar "Saab-gubben!", och när Anita ringer om snön står en av dem redan vid Runes dörr;
  Ove räcker fram spaden ("Här. Böj på knäna."), och skottningsärendet försvinner ur rotationen.
  Kraschar han medan de filmar heter videon "Gubbe tappar det", och Anders har sett den. Slår han
  rekordet skriver han in det under sitt eget: "Golf. 17 m. Slagen.".
- **Ove:** "Nej." · "Kollar bara mönsterdjupet." · "Här. Böj på knäna." (ny)
- **Bygger på:** `hoppbacke.js` (vittnena, `isTeen`, `hopp.best`, `land()`), tre fotgängare med ett
  häng-läge i `g.peds`, byggda med ett eget slumpfrö (frön ur `peds.js` skulle blanda om alla
  förbipasserande), en filmpose byggd på `phonePose`, `game.unlocked` för respekten, `available()` i
  `interruptions.js` för att ta bort skottningen.
- **Insats:** M · **Röst:** 3 repliker
- **Obs:** Finns delvis: hoppbacken har vittnen och tonårsreaktioner. "Gör om det, farbror!" och
  "Saab-gubben!" är poolrepliker för de unga rösterna (fyra klipp var). En Saab behöver ungefär 15
  m/s för 17 m och landar då hårt. Fler hängplatser (busskuren, GRILLEN) gör det L.

### 96. Lärlingen: däckbyte på Adrians Saab

Adrian har frågat "Kan du lära mig byta däck någon gång?" sedan dag 1. Nu lär Ove honom: visar,
låter honom försöka och rättar när han gör fel.

- **Så gör man:** Till fots efter dag 5, E vid Adrian vid hans Saab. Ove byter första hjulet själv
  (ett håll). Sedan gör Adrian fyra steg i sin egen takt, och när han är på väg att göra fel trycker
  man E: "E Rätta".
- **Världen svarar:** Felen syns på bilen, med kameran inramad på hjulet: Adrian håller nyckeln mot
  fel mutter, sätter domkraften mitt under tröskeln, tvekar och tittar på Ove. Ove rättar: "Inte
  där. Där." eller "I kryss. Aldrig runt.". Ett fel som får passera ger en krasch, och bilen sjunker
  ner på ena sidan. Betyget i blocket: "Adrian, däckbyte: 2 fel av 6. Godkänt med tvekan.". Andra
  lektionen är en punktering vid cykelstället, och efteråt går en tjej förbi med samma röda cykel
  och vinkar. Patrick med gips kan tävla mot Adrian om dubbdäcken, och Ove hjälper i smyg den som
  ligger efter.
- **Ove:** "Inte där. Där." (ny) · "I kryss. Aldrig runt." (ny) · "Ingen kan någonting nu för
  tiden."
- **Bygger på:** `holdAt` (`spots`, `work`), ett nytt steg med en fas där Adrian utför och ett
  fönster för att rätta, `'wrench'` i props för `CHARS.adrian`, `listenPose`, en hållen förskjutning
  i `car._sus` för domkraften, `game.unlocked`, ett specialfall i `kickTyre` så att hans Saab får
  "Sommardäck. I november." före lektionen.
- **Insats:** M · **Röst:** 2 repliker
- **Obs:** Finns delvis: `holdAt`, arbetsposerna och Adrians Saab. M gäller felen som toasts och
  ljud; riktig domkraftsfysik och ett hjul som rullar iväg är L. Adrians "Jag bytte däck själv i
  går! Nästan." sägs redan från dag 5 och ska filtreras till efter lektionen. Ärendets
  tålamodstimer, slumpschema och belöning måste stängas av.

### 97. Vad låter det? Felsökning med Adrian

På dag 7 ringer Adrian om att Saaben låter konstigt när han svänger vänster och får "INTE NU!" till
svar. Efter dag 7 får han ett riktigt svar: Ove kör Adrians Saab och lyssnar.

- **Så gör man:** Efter dag 7 säger Adrian sin gamla samtalsrad som småprat. E vid honom: "Sätt dig
  i bilen, Adrian.". Ove kör med Adrian bredvid, och vid fullt rattutslag åt vänster i låg fart
  klickar det. Stannar Ove bilen inom två sekunder efter klicket (under 1 m/s) är det diagnosen.
- **Världen svarar:** Ove drar handbromsen: "Drivknuten. Vänster sida.". Adrian bredvid har åsikter:
  "Är det normalt att det luktar så här?" och Ove: "Det är kopplingen. Den är som den ska.". Går
  bilen över en kantsten med Adrian ombord skramlar det i bagaget: två hantlar och ett bowlingklot,
  och toasten "I en Saab.". Sedan byts Adrians småprat ut.
- **Ove:** "Drivknuten. Vänster sida." (ny) · "Sätt dig i bilen, Adrian." · "Det är kopplingen. Den
  är som den ska."
- **Bygger på:** `STORY.varkarna.calls[3]` som småprat (samma talare och text, så klippet finns),
  `STORY.saab.intro[5]` och `race[3]` och `race[4]`, `getInCar({ car: 'adrianSaab' })` och `pickup`
  i ett manuellt ärende, `ctrl.steer`, `forwardSpeed`, kantstensgrenen i `car.step`, ett syntat
  klick.
- **Insats:** S · **Röst:** 1 replik
- **Obs:** Finns delvis: replikerna och att köra Adrians Saab. Stopp i stället för E, så att E
  fortfarande betyder "kliv ur". Motorljudet kan dölja ett tyst klick, så klicket behöver en egen
  klang.

## Strukna eller redan i spelet

- **Spolarvätskan: J i bilen.** Vindrutan syns inte bakifrån, och halva idén bygger på saker som
  inte finns (tonåringen på motorhuven, snöbollar på rutan). Den tysta tillsägelsen finns i 29.
- **Det borttappade barnet.** Fyra barn i hela stan, inget följ-läge för fotgängare, och en förälder
  som ropar var tolfte sekund skulle ta över gatans enda pratbubbla. För dyrt för vad det ger.
- **Växeln: skicka vidare samtalet.** Ove gör saker själv för att ingen annan kan, så en menyknapp
  för att lämna bort jobbet strider mot rollen. Det enda bra ögonblicket (Patrick hittar Jimmys
  mobil med en app på fyra sekunder) kan bli en toast i mobilärendet.
- **Brevlådan Patrick är skyldig.** Dubblett av 47; försöken som följer dagarna och den
  självsnickrade lådan dag 7 är införda där.
- **Oves blick vid sjukhusentrén.** Samma verb som 10; rökarna under skylten Rökfritt område är ett
  av blickens mål där.
- **Verktygstavlan: vem har lånat vad?** Dubblett av 44 och 43; ledtrådarna ute i världen och
  lånehistoriken är införda där.
