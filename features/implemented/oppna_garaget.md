# Öppna garaget

## Önskemålet

Man borde kunna öppna/stänga oves garageport.

## Vad som blev gjort (2026-10-11)

Oves garageport var bara en bild av en öppen port: panelen satt fast uppfälld under taket. Nu är den
en riktig vipport som går upp och ned. Den står öppen från början, som förut.

**Använda den**: ställ dig vid porten, utanför eller inne i garaget, vänd mot den, och tryck **E**
(prompten säger "Öppna garageporten" eller "Stäng garageporten"). Står en bil bakom eller bredvid Ove
tar porten E bara när han tittar på den. Annars går E till bilen som vanligt.

- **Öppna**: Ove ställer sig vid handtaget mitt på porten, tar tag och lyfter. Låset klickar, porten
  tippar upp och fjädrarna tar den sista biten (1,5 s). Han kliver bakåt när underkanten svänger ut,
  ungefär 3 dm i knähöjd. Uppe tar porten emot stoppen med en duns.
- **Stänga**: Ove sträcker sig upp efter den öppna portens framkant (2,02 m upp), drar ned den och
  kliver undan när den faller igen (1,15 s, en smäll av plåt som klingar efter). Utifrån rycker han
  sedan **tre gånger i handtaget** för att se att den verkligen är stängd, som i boken. Ibland säger
  han "Så.", "Stängt." eller "Ordning och reda.".
- Medan han har händerna på porten står han kvar. Sedan räcker ett steg, ett hopp, en spark eller E
  för att gå därifrån, och porten går klart av sig själv.
- **Stopp**: porten rör sig inte om en bil står i porthålet eller närmare än 45 cm utanför ("Saaben
  står i vägen." / "Det står en bil i vägen."), och den går inte igen om någon står under den
  ("Flytta på dig."). Saaben, parkerad med nosen in i garaget, står aldrig i vägen. Portens svep är
  kontrollerat mot varenda punkt i Saabens modell.
- **En stängd port stänger**: varken Ove eller Saaben kommer igenom den, och "Kliv in" når inte en
  bil på andra sidan. Sitter Ove i en bil framför den stängda porten står det "Garageporten är
  stängd · kliv ur (E) och öppna den". Kör man in i den dånar den och skallrar ("Porten!" /
  "Min garageport!").
- **Sparas**: spelet kommer ihåg om porten är stängd.
- **Berättelsen**: dag 1:s "Ställ in Saaben i garaget" kräver en öppen port (bil-tipset säger till).
  På dag 3 ligger elementnyckelns krok i garaget: är porten stängd säger uppdraget först "Öppna
  garageporten", och sedan kan Ove leta.

**Hur den är byggd**: `src/world/garagedoor.js` (`GarageDoor`). Det är världens enda rörliga mesh:
panelen med radens ribbor och handtag, en stålram och en låsstång på insidan, två skenor under taket.
Kollisionsblocket fyller porthålet så länge porten är stängd, går ned eller är öppen till mindre än
85 %. Den öppna panelen är ett tak som kameran håller sig under. Ove styrs från `src/main.js`
(`useGarage`, `stepDoorOp`) och har en egen pose med båda händerna på porten (`'door'` i
`src/actors/models.js`). Ljuden är syntetiska som resten av spelets (`audio.garage`: lås, rullar och
fjädrar, duns, smäll, ryck). Mer finns i `notes/world.md` och `notes/integration.md` under *Ove's
garage door*.

**Kontroller**: `PORT=88xx node tools/shot.mjs garage` (i `tools/scenarios/gameplay.mjs`): 15 kontroller
med riktiga knapptryck. Den stänger utifrån med tre ryck, öppnar med Saaben i garaget, stänger och
öppnar inifrån, provar en bil i vägen, bil-tipset, att köra in i porten, sparningen och dag 3. Bilder
i `out/garage_*.png`. Dessutom gick `story` (alla sju dagarna, slutar på `#7 idle` och `no errors`),
`m1`, `camtight`, `camroof`, `lotwalk`, `giveup`, `camwall` och `pplanim` igenom utan fel.
Kameran bakom bilen i Oves garage (`camroof`, `camtight`) ger samma värden som före ändringen.
