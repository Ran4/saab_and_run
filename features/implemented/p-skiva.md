# P-skiva (och lapplisan)

> **Status: byggt (2026-10-15).** Avsnittet *Hur det blev* säger vad som gjordes och vad som skiljer
> sig från definitionen, *Så verifierar man* hur det testas. Definitionen står sist, som den skrevs.
> Bilden den hänvisar till ligger här bredvid: `pskiva.avif`.

## Hur det blev

- **Rutorna och skyltarna** (`src/world/data.js` `parkingLots` / `parkingBays`, `Frame.bay` i
  `kit.js`): varje målad ruta på stadens parkeringar har nu en regel, den som står på skylten.
  - **Centrum, Livs parkering** (affären): P 2 tim 8–18 med p-skiva, 38 rutor. Skylten fick en skylt
    till under sig: "P-skiva". De två västligaste rutorna i norra raden är lastzon (skylten sa
    "LASTZON 6–10", nu 6–18: hela spelets dag ligger 10:30–16:30, och patrullen anmäler bilar där
    hela dagen).
  - **Sjukhusets besöksparkering**: 3 tim 8–18 med p-skiva (52 rutor). Den var avgiftsbelagd
    ("Avgift vardagar 8–18 · Betala i automaten"); skylten säger nu P · 3 tim 8–18 · P-skiva ·
    "Längre: betala i automaten", så automaterna står kvar och har en mening. De två breda platserna
    vid entrén är handikapplatser.
  - **Förskolan Solrosen**: "Hämtning/lämning max 10 min" med p-skiva, dygnet runt (10 rutor).
  - **Kommunhusets besöksparkering**: 2 tim 8–18 med p-skiva (12 rutor; skylten fick "2 tim 8–18" och
    "P-skiva").
  - **Flerbostadshusens parkeringar** ("Boende med tillstånd") och **de andra radhusområdenas**
    (de fick en P-skylt "Boende med tillstånd" vid infarten, som Oves har sin): boende med tillstånd,
    deras handikapplats och reserverade plats likaså. Gästplatserna är fria.
  - **Oves egen parkering** är fri för honom (han bor där), utom handikapplatsen och de reserverade
    (Anders "Reserverad – Ordförande" och Adrians). Föreningen har avtal med samma bolag: Anders
    skrev under.
- **En parkering** (`src/game/pskiva.js`, ny): stannar bilen Ove kör (under 0,6 m/s) i en ruta med en
  regel börjar en parkering, och ankomsttiden är minuten den stannade. Att kliva ur och in igen ändrar
  ingenting; kör han ut ur rutan är den slut. Prompten i bilen: **"G Ställ in p-skivan · P 2 tim 8–18 ·
  p-skiva"**, när den är ställd "P-skiva 12:30 · G ändra", och i en ruta som kräver tillstånd vad det är
  för ruta ("Handikapplats · tillstånd krävs", "Lastzon 6–18", "Boende med tillstånd", "Reserverad
  plats").
- **Minispelet** (`src/game/pskivaui.js`, ny): **G** (handkontrollens styrkors upp) tar fram p-skivan,
  hela skivan på skärmen, ritad efter bilden: det blå kortet med ANKOMSTTID, visaren ner i fönstret,
  P:et, den vita ratten bakom med 1–12 och små 13–24, ett streck varje halvtimme och den räfflade kanten
  i greppet upptill. **Q / E** (också A/D, pilarna, styrkorset, LB/RB) vrider ratten en halvtimme åt
  gången med ett knäpp och en liten studs; håller man nere går den vidare av sig själv. **F** (Enter,
  mellanslag, A/B) lägger den i rutan: den åker iväg mot vindrutan, Ove säger "Så." och en notis
  säger "P-skivan ligger i rutan: 12:30". **G** (Esc, Y, Start) lägger tillbaka den utan att något
  ändrats. Bredvid skivan: skylten som en liten skylt (P · 2 tim 8–18 · P-skiva), klockan i Saabens
  gröna siffror, regeln i en mening ("Ankomsttiden: närmast följande hel- eller halvtimme.") och
  tangenterna. Bilen står bromsad och inget annat tar tangenterna så länge skivan är framme; kartan,
  hastighetsmätaren och panelerna bleknar undan. I ett smalt eller stående fönster ligger raden under
  skivan.
- **Skivan ligger kvar i bilen** som den ställdes (varje bil har sin; Saabens står på 12 från början).
  På nästa parkering visar den samma tid tills den ställs om, och en gammal tid är fel tid.
- **De svenska reglerna**: ankomsttiden avrundad uppåt till närmast följande hel- eller halvtimme
  (12:10 blir 12:30, 16:31 blir 17:00, 12:30 är 12:30). Lapplisan skriver en kontrollavgift för:
  - **P-skiva saknas**;
  - **Felaktigt inställd p-skiva**: skivan visar en senare tid än närmast följande halvtimme just då
    (att ställa fram den, fusk). Kommer hon först senare syns det inte, men tiden räknas från skivan;
  - **Parkerat längre än tillåten tid**: från skivans tid räknas bara minuterna inom skyltens timmar
    (8–18), så en natt emellan räknas också (14:00 till nästa morgon 10:30 är 6 tim 30 min);
  - **utan tillstånd** på en boende-, handikapp-, last- eller reserverad plats.
  En för tidig skiva (12:00 för 12:10) är inget fel i sig, men tiden tar slut en halvtimme tidigare.
- **Lapplisan** (P-Ordning AB) syns inte. Hon går sin runda förbi en parkering 4 + Exp(12)
  spelminuter efter ankomsten och sedan var 8 + Exp(16):e minut, men bara när Ove är mer än 35 m från
  bilen och inte i den, och har varit det i 10 s (`PSK` överst i pskiva.js). Spelets klocka går en
  timme på fyra minuter: två timmar vid Livs är åtta minuter.
- **Lappen på bilen**: ett gult plastkuvert under förarens torkarblad, på rutan där torkaren ligger för
  varje bilmodell (carmodels.js sparar torkarens plats, `P.wiperZ`); på traktorn, som har en egen kaross,
  på motorhuven. Ove ser den inom 11 m till fots och säger något ("Vad är det där på rutan?", "En lapp.
  På min bil.", "Nej. Nej, nej, nej.", "Lapplisan. Självklart."), och en notis: "Det sitter en lapp
  under torkarbladet. E tar den." Vid bilen säger prompten **"E Ta lappen"**, och det går inte att
  kliva in förrän han tagit den. Hamnar han i bilen på något annat sätt (en scen eller racets startruta sätter honom
  där) tar han lappen så fort bilen står still och ingen dag pågår; till dess åker den med.
- **Lappen i fullskärm**: ett kvitto ur kontrollantens skrivare: P-ORDNING AB, KONTROLLAVGIFT, numret,
  "enligt lagen (1984:318) om kontrollavgift vid olovlig parkering", Datum (Dag 3, onsdag),
  Klockslag, Reg.nr, Fabrikat, Plats och platsens nummer, P-skiva (tiden, eller "Saknas"),
  Överträdelse, en förklaring när skivan saknas eller stod fel, AVGIFT 300 kr, bankgiro och OCR,
  kontrollantens nummer och en streckkod. Den betalas så fort han tittar på den: en röd BETALD-stämpel
  med "−300 kr" (kronorna går inte under noll, som allt annat Ove betalar). Ove säger något
  ("Trehundra kronor. För att stå still.", "Rätt ska vara rätt. Även för mig.", "Sonja hade skrattat åt
  det här."). **E** stoppar den i fickan.
- **När lapplisan gjort fel** (20 % av lapparna): fel registreringsnummer (ett tecken förväxlat med ett
  som liknar det, 0/8, B/8, S/5...), fel fabrikat (en Saab blir en Volvo: "Volvo?! Det är en Saab!"), ett
  klockslag innan han ens hade parkerat, fel parkering, eller fel tid på p-skivan. Och vid en parkerings
  första runda läser hon fel på en rätt ställd skiva en gång av tjugo (en lapp som aldrig borde ha
  skrivits). Ove ringar in felet med röd penna, skriver FEL! bredvid och säger vad som är fel ("Det där
  är inte ens rätt registreringsnummer!", "Den stod inte alls på det! Kan hon inte läsa en
  p-skiva?"...). När han stoppat lappen i fickan **ringer han P-Ordning AB** (kortet "Ove ringer", två
  svenska ringsignaler på 425 Hz, kundtjänsten svarar):
  > — P-Ordning, kundtjänst. Vad kan jag hjälpa dig med?
  > — Ni har satt en lapp på min bil. Och den är fel.
  > — Vill du bestrida avgiften kan du göra det skriftligen inom tre veckor...
  > — Jag bestrider ingenting. Jag rättar er. Ni heter P-Ordning och har ingen ordning alls.
  > — ...Jag ser det. Kontrollanten har skrivit fel. Jag makulerar avgiften.
  > — Och mina trehundra kronor?
  > — Pengarna kommer tillbaka. Ha en fortsatt fin dag.
  > — Hmpf.

  Avgiften makuleras och han får tillbaka 300 kr ("P-Ordning AB makulerade kontrollavgiften. +300
  kr"). Samtalet är hans eget: inget uppdrag lägger på det (`interrupts.outCall`).
- **Röster**: 20 nya klipp, 16 för Ove och 4 för kundtjänsten, 817 tecken och 817 credits; "Så." och
  "Hmpf." fanns redan. Kundtjänsten är en ny roll, `kundtjanst` i `cast.json` (`extra`: inte en av
  grannarna), med Voice Library-rösten "Lisa – Friendly Customer Service Agent", samma som Nasanins men
  obearbetad (Nasanin är höjd till en treåring). Uttalet: `lexicon.pls` fick P-Ordning → Pe-ordning och
  p-skiva → pe-skiva. Alla gick igenom taligenkänningen i första tagningen; "Nej. Nej, nej, nej." står
  på granskningslistan (den hörde ett "nej" för mycket). Manuset är nu 606 repliker och 18 657 tecken,
  med poolen 1 468 repliker och 1 467 klipp.
- **Kontrolltabellen** (titeln och pausmenyn) fick raden "G – ställ in p-skivan (stående i en p-ruta)".

### Skillnader från definitionen och tillägg

- **Bilden ritas** (SVG), den visas inte som den är: ratten måste kunna vridas bakom fönstret. Bara
  svensk text: ANKOMSTTID (bilden är en finländsk skiva, SAAPUMISAIKA / ANKOMSTTID).
- **Tangenten är G** (P är paus). Esc lägger också tillbaka skivan, men i en riktig webbläsare släpper
  Esc musen, och då pausar spelet: därför står G i tipset.
- **Sjukhusets parkering** var avgiftsbelagd. Den är nu 3 tim med p-skiva och längre i automaten, så att
  sjukhuset blir ett ställe där man använder p-skiva, som definitionen säger.
- **Lastzonens skylt** sa 6–10, nu 6–18 (se ovan).
- **Felen**: "20 % av tillfällena" är 20 % av lapparna. Dessutom felläsningen av en rätt ställd skiva (1
  på 20 vid första rundan): de lapparna är alltid fel och ringer Ove alltid om. Bolaget makulerar en
  felskriven lapp och betalar tillbaka; det är vad samtalet slutar med.
- **Hur lång tid det är**: två timmar i spelet är åtta minuter. Exemplet i definitionen (12:10, skivan
  12:30, tillbaka 15:45) fungerar fast dagen slutar 14:30: klockan står still till nästa morgon, och
  en natt på parkeringen är för lång tid.
- **Lapplisan syns inte**, det finns ingen figur: lappen kommer medan Ove är borta.
- **Inget sparas**: en omladdning börjar dagen om (Saaben står hemma), så parkeringarna, lapparna och
  skivans läge är borta.
- **I testerna** (`?test=1`) går lapplisan inte sin runda utan `&lapp` (allt annat, minispelet och
  `parking.check()`, fungerar).

## Så verifierar man

`PORT=88xx node tools/shot.mjs <scenario>` (tools/scenarios/pskiva.mjs):

- `pskiva` (riktiga tangenttryck, `&lapp`): Saaben körs in i en ruta vid Livs 12:10 med W/S (en
  återkopplad styrning) och står still i rutan; parkeringen börjar 12:10 med Livs regel; prompten; G tar
  fram skivan på 12; E Q Q E E ger 12:30; E i skivan kliver inte ur bilen; E nedhållen 1,3 s vrider den
  av sig själv; G lägger tillbaka den oförändrad; F lägger 12:30 i rutan (rätt för 12:10), "Så." och
  notisen, prompten "P-skiva 12:30"; E ur bilen, långt bort: en runda 14:00 ger ingen lapp, 14:45 en
  (för länge), kuvertet sitter under torkaren (på karossen); tillbaka till fots med W: Ove ser lappen
  inom 11 m, notisen; vid dörren "E Ta lappen", E tar den och inte bilen, 300 kr dras direkt, hans
  replik; E i fickan; E kliver in. En felskriven lapp (registreringsnumret): den röda ringen, hans
  replik, samtalet till P-Ordning AB av sig självt, kortet, pengarna tillbaka. Lapplisans egen runda:
  ingen medan Ove står 8 m bort och ingen hans första 10 s borta, sedan "P-skiva saknas". Satt i en bil
  med lapp på annat sätt: lappen i hans händer. G på gatan och G i en handikapplats: ingen skiva
  (prompten säger "Handikapplats"). Bilder: `pskiva_bay`, `pskiva_open`, `pskiva_1230`,
  `pskiva_ticketcar`, `plapp`, `plapp_wrong`, `pskiva_call`.
- `pskivarules` (lapplisan anropad direkt): rätt skiva 2 tim (14:30 ok, 14:31 lapp), för tidig, framställd
  (fast 12:20, inte 12:40, för länge 15:01), ingen skiva, utanför 8–18, över natten, en gammal skiva
  från förra parkeringen, sjukhuset 3 tim, förskolan 10 min, Kommunhuset 2 tim, lastzon, handikapplats
  på sjukhuset och i ett annat radhusområde, boendeplats, Oves egen handikapplats och reserverade plats;
  gästplats och Oves egen boendeplats: ingen parkering; felläsningen; vart och ett av hennes fel; att
  slumpen under 0,2 ger ett fel och över inte; en bil som kör ut ur rutan och en som tas bort.
- `pskivalook`: skivan på 12:00, 12:30, 16:30 och 07:30, i 1280×720, 1920×1080, 1024×768 och
  720×1100 (`out/pskl_disc_*.png`); lappen rätt, framställd (med förklaringen) och fel (`pskl_ticket_*`);
  kuvertet på rutan på varje biltyp (`pskl_env_*`); skyltarna (`pskl_sign_*`).
- `pskivavoice` (`&voice`): en felskriven lapp och samtalet med rösterna: varje replik ett klipp, ingen
  avbruten, aldrig två röster på en gång, ingen replik som inte står i script.js.
- Regression: `story` (missions.js: gryningen, ge upp), `interrupt errands giveup` (avbrotten,
  interruptions.js), `uipause titlecheck` (kontrolltabellen), `start`; `make voice-check`.

## Definitionen

Om man parkerar (alltså ställer sig i en ruta) vid t.ex. supermarket, sjukhuset osv. (ställen där man
kan förväntas använda p-skiva) så ska det vara möjligt att trycka på en knapp för att ställa in p-skivan.

Det blir ett litet minispel: en p-skiva visas (rendera features/pskiva.avif),
tänk dig att hela p-skivan visas på skärmen,
sen använder man Q och E för att snurra den (den snappar i 30 min-intervaller)
och F för att godkänna.

Givetvis blir det konsekvens om man gör fel
(givetvis kör vi efter svenska parkeringsregler, dvs. så vitt jag vet,
är klockan 16:31 så ska man sätta den på 17:00 osv), du får lista ut något passande.

Har man gjort något fel, t.ex. kommer tillbaka för sent (exempel: utsatt tid är 2 tim 8-18, du ställer bilen
12:10, sätter p-skivan 12:30, kommer tillbaka 15:45) och kommer tillbaka till bilen så får man en böteslapp:
* Böteslappen syns på bilen
* Ove ska kommentera att han fått en böteslapp.
* Trycker du på E (ska inte gå att gå in i bilen tills du tagit lappen) så får du se lappen i fullskärm.
* Givetvis får du betala den (görs automatiskt när du tittar på den) - dyrt! 300 kr tänker jag)
* I 20% av tillfällen så har lapplisan gjort fel (t.ex. läst fel, och skriver då fel i boten, t.ex.
  fel starttid) - då ska ove bli riktigt arg och ringa upp lapplise-bolaget!

Gäller även om du parkerat på lastzon eller handikapp-parkering osv., t.ex. boendeparkering där du inte
bor osv.
