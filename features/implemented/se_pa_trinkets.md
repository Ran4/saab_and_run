Man kan hitta foton, saab-delar osv. runtom,
men det verkar inte finnas något att se dem?

Lägg till en meny eller nått där man kan se dem igen,
och hålla koll på hur många man plockat upp.

---

## Vad som gjordes (2026-10-15)

**Samlingen** i pausmenyn: en ny rad under Kontroller, `Samlingen  n/14` (räknaren visar hur många
av de fjorton som är hittade; rutan blir mörk medan albumet är uppe). Ett klick byter
anteckningsboken till höger mot en mörk albumsida, "Oves samling":

- **Hittat n av 14**, och två rader om sju: Sonjas fotografier (n/7) och Saab-emblemen (n/7). Det
  som är hittat syns som sig självt (fotot, emblemet), det som inte är hittat som en tom streckad
  ram med ett frågetecken. En hel rad får Oves rad om var de hamnade: "På hyllan i hallen." /
  "Uppsatta i garaget." (samma som toasten när den sjunde hittas).
- Den valda visas stort under raderna: bilden, "Sonjas fotografi" eller "Saab-emblem nr 3" (det
  tredje Ove hittade), minnet / Oves anteckning i hans handstil och **var den låg** ("Hittat: På
  kyrktrappan"). En som inte är hittad: "Inte hittat än." och en **ledtråd**, "Någonstans vid
  kyrkan." (bara stadsdelen, inte platsen).
- Längst ner: **Pantburkar** (alla burkar Ove någonsin plockat upp, ny räknare, sparas) och
  **Längsta hoppet** (hoppbackens rekord, när det finns ett).
- Albumet öppnar på det Ove hittade senast (efter en omladdning: fotot som hittades sist, annars
  emblemet). Musen väljer (hovra eller klicka), piltangenterna eller WASD också (vänster / höger
  genom alla fjorton, upp / ner mellan raderna), en gamepad med styrkorset eller vänster spak åt
  sidan medan albumet är öppet (upp / ner flyttar som förut mellan menyns knappar, A på Samlingen
  öppnar och stänger). Pausmenyn öppnar alltid på anteckningsboken.

**Fotografierna har fått var sin bild.** Förut var alla sju samma bild (en kvinna framför en bil);
nu är var och en en egen gammal sepiabild som hör ihop med minnet: tåget till Göteborg -84, Sonja i
Saaben -88 med handen på radion, skolavslutningen framför barnens teckningar, Spanien (hon i solen,
han i skuggan under parasollet med en karta), bröllopet utanför kyrkdörren, trädgården (blommorna
som vann över gruset), en vanlig tisdag i köket. Samma bild ligger i världen (texturen på fotot man
plockar upp) och i albumet. Ritade med canvas 2D i `src/game/collection.js` (ingen ny fil att ladda),
med en text på den vita kanten ("Göteborg -84", "Tisdag"). Fotot på Oves nattduksbord är det gamla.

**Upplockningslappen** säger nu också var samlingen finns: "Samlingen: Esc".

### Skillnader mot definitionen / beslut

- "Meny eller nått": en sida i pausmenyn, inte en egen tangent (alla tangenter nära till hands var
  upptagna och pausmenyn är dit man redan går; en gamepad når den med Start).
- Ett fotos minne följer nu **bilden** (id), inte i vilken ordning det hittades (förut fick det
  första fotot man hittade alltid "Sonja, 1984. Tåget till Göteborg."). Emblemens anteckningar
  följer fortfarande ordningen (den sjunde: "Det sista. Nu är samlingen hel."); albumet ger det n:te
  emblemet den n:te anteckningen. Ordningen fanns redan i sparfilen (en Set sparad som array).
- "Osv": pantburkarna räknas också (`pant` i sparfilen, sparas med autosparningen var 30:e sekund
  som kronorna de ger). Emblemen sitter inte på riktigt i garaget (bara texten säger det).
- Pausmenyn fick en rad till: avstånden mellan raderna är 2 px mindre (11/10 px), och i låga fönster
  (≤ 540 px, ≤ 464 px) lite tätare än förut, så att menyn med "Avbryt dagens uppdrag" fortfarande
  får plats ner till ~435 px höga fönster (`uipause`).

### Kod

- `src/game/collection.js` (ny): `EMBLEM_NOTES`, `PHOTO_NOTES` (flyttade från main.js), de sju
  fotografierna (`drawPhoto`, `photoCanvas(id, scale)`), emblemet som albumet ritar det
  (`drawEmblem`).
- `src/world/town.js` `placeCollectibles`: varje plats är `[x, y, z, where, hint]`.
- `src/actors/pickups.js`: `photoMesh(id)` med fotots egen textur.
- `src/main.js`: `albumData()`, `game.cans` (sparas som `pant`), `game.lastFound`, minnet per bild,
  lappens "Samlingen: Esc", `pause(true)` ritar albumet.
- `src/game/hud.js`: `renderAlbum(data)`, `#opt-album`, piltangenter / gamepad i albumet.
- `index.html`: raden och `#pause-album`; `style.css`: albumsidan, menyns avstånd.

### Verifiering

- `PORT=88xx node tools/shot.mjs album` (ny, tools/scenarios/ui.mjs, ett riktigt spel utan ?test):
  tomt album (0/14, ledtråd), två foton, två emblem och en burk upplockade genom att gå på dem
  (lappen har fotots minne och "Samlingen"), räknarna (4/14, 2/7, 2/7, Pantburkar 1), öppnar på det
  senaste, minnet per bild och anteckningen per ordning, hovra / klicka / pilar, ledtrådarna, en
  omladdning med Fortsätt (samma fyra i samma ordning, burken kvar), alla sju emblem (nr 7, den
  sista anteckningen, "Uppsatta i garaget."); sidan lika hög som menyn och inget avklippt. 16
  kontroller, bilder `album_*`.
- `uipause` kontrollerar nu också albumsidan (`_album`) i alla 15 fönsterstorlekar: lika hög som
  menyn, inget bredare än sidan, ingen scroll i fönster ≥ 700 px höga. Alla gick igenom.
- `uiabort` (gamepaden i pausmenyn), `pausemenu`, `corruptsave`, `reloadday`, `collect`,
  `titlegone`, `validate` (alla 14 platser nåbara), `start`: inga fel.
- Fotona i världen: närbilder med `tools/look.mjs` (fotot på kyrktrappan visar "Saaben -88", det på
  torget "Spanien").
