# Snötraktor

## Önskemålet

Det finns en snötraktor i området där Ove bor.
Man kan inte köra den nu - gör så man kan göra det.

## Vad som blev gjort (2026-10-15)

Föreningens snöröjningstraktor på boendeparkeringen var kuliss: geometri inbakad i kvarteret
(world/ove.js `tractor()`) med en låda som kollision. Nu är den en riktig bil, en egen biltyp
`tractor`, som Ove kliver in i med **E** och kör som vilken bil som helst.

- **Var den står.** På samma plats som förut, längst in på boendeparkeringen i änden av garagelängan,
  men med plogbladet ut mot gången (den står redo att köra) och sandspridaren 25 cm från kantstenen.
  Platsen bredvid är nu tom: gången slutar i en stor plogad snöhög, och mellan den och en parkerad bil
  gick traktorn inte att svänga ut. Den är en namngiven bil (`named.tractor`, skylten BRF 076): blir
  den kvaddad står en ny på platsen när ingen ser, lämnas den bortom stan kommer den hem igen.
- **Modellen** (actors/carmodels.js `tractorP` / `tractorDetails`): byggd om från grunden efter den
  gamla, i bilens koordinater och lite större där det behövdes för att Ove ska få plats: stora
  bakhjul (r 0,58 m) under platta stänkskärmar som hytten står på, små framhjul (r 0,37), lång motorhuv
  med grill, strålkastare, ventilationsgaller, avgasrör med regnlock och luftrenare, en hytt med klart
  glas runt om, golv, fjädrad stol, ratt, pedaler och instrumentbräda, dörrkarm, handtag, steg och
  backspeglar, på taket det gula varningsljuset och två arbetsstrålkastare; framför det böjda
  plogbladet, vinklat så att snön går åt höger, med gummiskär, slitstål, ändplåtar, plogpinnar och
  hydraulcylindrar; bakom trepunktslyften med en grå sandspridare, **LGF-skylten** (den orange
  triangeln för långsamtgående fordon) och registreringsskylten (bara bak, som på en traktor). Fyra
  material, sju ritanrop nära som en bil, 2 400 trianglar (1 200 långt bort). Hjulen är en ny hjulstil
  med klackmönster på orange fälgar, och bilarnas hjul kan nu ha olika storlek fram och bak.
- **Att köra.** Högst 40 km/h (en traktor b), segt upp i fart men den vänder tvärt (svängradie ~2,5 m),
  fyrhjulsdrift och klackdäck som biter i snön (på snö tappar den bara lite grepp, där bilarna tappar
  mycket), tung och tålig. Egen motor: en långsamt varvande diesel med knackig tomgång och utan turbo;
  en egen platt tuta. Varningsljuset blinkar när motorn går. Hastighetsmätaren säger "Föreningens
  traktor". Första gången Ove kliver in (varje session) står det: "Föreningens snöröjningstraktor.
  Ove har nyckel, förstås. Den får köra på gångvägarna."
- **Gångvägarna.** Traktorn får köra i det bilfria området: det kostar ingen Ordning och Anders
  ropar inte, och prompten säger "Snöröjning · traktorn får köra på gångvägarna" i stället för
  varningen.
- **Plogen.** Kör den genom snö (gräsmattor, trottoarer, gångvägar) kastas snön upp och ut åt höger
  från plogbladets bakre ände, mer och längre ju fortare det går; på den plogade asfalten lite
  slask då och då.
- **En plats.** Hytten har bara förarstolen: ingen kan åka med (ärenden där någon ska följa med säger
  "Det finns ingen plats i bilen."). Ove sitter med underbenen kvar, fötterna på hyttens golv (i
  bilarna viks underbenen in, se ben_i_marken_vid_bilkorning.md: bilskalen har inget golv).

## Skillnader mot önskemålet

Önskemålet sa bara "gör så man kan köra den". Utöver det: traktorn står vänd åt andra hållet, en
parkerad bil är borta från platsen bredvid, den får köra på gångvägarna, plogen kastar snö, den har
egen motor och tuta, och bara en plats. Plogen röjer inte på riktigt (snövallarna och snön på marken
ligger kvar): det är bara snön som yr.

## Hur man verifierar

```sh
PORT=88xx node tools/shot.mjs traktor        # riktiga tangenter, 16 kontroller (fel = errors)
PORT=88xx node tools/shot.mjs seatlegs       # alla bilmodeller, nu också traktorn med Ove
PORT=88xx node tools/shot.mjs traktorlook traktorplog   # närbilder, LOD, plogens snö från fyra håll
```

`traktor` (tools/scenarios/traktor.mjs): Ove går fram till hyttdörren med Parvaneh som sällskap,
prompten säger "E Kliv in", **E** sätter honom vid ratten (Parvaneh blir stående: ingen plats);
hastighetsmätaren och notisen; underbenen kvar, lägsta punkten 3 cm över golvet, hjässan 13 cm under
innertaket; ut ur rutan, längs gången, ut genom infarten och söderut på gatan med W/A/D/S (en
regulator som en spelare på tangentbordet); toppfarten 36-37 km/h efter 80 m (taket 40 km/h); tutan
(T) och motorn med traktorns profil, varningsljuset blinkar; samma sträcka gångväg i traktorn och i
Saaben: Saaben tappar ~1 Ordning/s, traktorn bara det som felparkeringarna drar; på en snöig gräsmatta
kastar plogen snö (pudret räknas); **E** ut igen, på fötter bredvid. Bilder `trk_1..6*.png`.

Dessutom körda utan fel: `story` (alla sju dagarna, `#7 idle`, `no errors`), `seatlegs` (alla
bilmodeller, nu också traktorn: Ove 3 cm över golvet, inget av honom under golvet syns), `drive`,
`m1`, `horn`, `start`. (En gång föll två av `horn`:s kontroller när det kördes efter `drive m1`: en
smitarjakt startade mitt i provet, så tutandet räknades inte som onödigt. Samma följd utan fel på
nytt, och på HEAD.) Kostnad (`wcalls`, HEAD mot nu): vid startvyn 238 → 247 ritanrop i huvudpasset,
vid parkeringen (`lot_e`) oförändrat, CPU-tiden per bildruta densamma.
