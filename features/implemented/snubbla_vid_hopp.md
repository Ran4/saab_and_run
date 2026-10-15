# Snubbla vid hopp (och hoppa ur en bil i fart)

> **Status: byggt (2026-10-15).** Avsnittet *Hur det blev* säger vad som gjordes och vad som skiljer
> sig från definitionen, *Så verifierar man* hur det testas. Definitionen står sist, som den skrevs.

## Hur det blev

- **En riktig ragdoll** (`src/actors/ragdoll.js`, ny): Oves skelett som 22 punkter med
  positionsbaserad fysik (Verlet, 120 Hz): lederna, fotbladen, handändarna, mitten av skallen och en
  punkt framför bäckenet och bröstet så att bålen har djup. Pinnar håller benens längder och bålens två
  stela delar; ryggen, nacken, fotlederna och handlederna böjer sig bara så långt de kan; höfterna rör
  sig i en kon och knäna böjs aldrig framåt. Punkterna slår i marken (trottoarkanter, snöhögar,
  bilarnas tak), i väggar och i bilarnas sidor, med friktion, och en kropp som tumlar förlorar fart.
  Benen i modellen ställs från punkterna varje bildruta (armbågar och knän blir rena gångjärn på
  skärmen). I början är kroppen lite spänd (han går omkull som en gubbe, inte som en säck) och
  händerna åker ut för att ta emot fallet.
- **Snubblet**: ett hopp på 40 (`STUMBLE.chance` i main.js) snubblar han när han landar. I farten
  fastnar en fot och han far framåt (springande ibland rakt över ända), stående faller han bakåt eller
  åt sidan när benen viker sig, och ibland går fötterna undan och han landar på rumpan. Hans "uff",
  lite snö. Inte på ett biltak, med katten i famnen, i en dialog, vid garageporten, när han fryser,
  framför ett misslyckat uppdrags skylt.
- **Hoppa ur en bil i fart**: E i mer än 4 m/s (~14 km/h; förut kastades han i ett färdigt "flung"
  över 7 m/s) och han hoppar ut genom förardörren med bilens fart, framåtlutad och lite i rullning, och
  tumlar längs vägen: ~3 / 5 / 9 / 13 m i 15 / 35 / 60 / 90 km/h. Bilen rullar vidare utan honom. I
  krypfart kliver han ur som förut.
- **Upp igen**: när han ligger still glider kroppen (punkterna, utan att något går genom marken) in i
  utgångsläget för att resa sig: på rygg sätter han sig upp, ställer sig på ett knä och reser sig (som
  förut); har han landat på magen tar han sig upp på alla fyra, sedan ett knä, och står upp åt det håll
  huvudet låg. Han säger något 4 gånger av 5: "Det där såg ingen.", "Kommunen har inte sandat här.",
  "Det var meningen.", "Hmpf." (repliker han redan har: inga nya klipp; script.js `OVE_STUMBLE`).
  Snubbel till uppe igen tar ~4-5 s.

### Skillnader från definitionen och tillägg

- **Alla Oves fall är ragdolls**, inte bara snubblet och hoppet ur bilen: blir han påkörd eller går
  bilen sönder under honom kastas han också som ragdoll (han svarar "Idioter." eller "Hmpf." efter en
  påkörning). Det hade sett konstigt ut om bara två av fallen var riktiga. Fotgängarna har kvar det
  gamla färdiga "flung"-fallet (ragdollen fungerar för alla, `fling(..., { rag: true })`, men det kan
  bli många på en gång i en jakt).
- **"En gång av 40"** gäller i spelet. I testerna (`?test=1`) snubblar han aldrig utan `&stumble`, så
  att de andra hoppscenarierna inte blir slumpmässiga; `__game.stumbleNext = true` får nästa landning
  att snubbla.
- **Resningen från magen** är ny (models.js `downPose` med `st.prone`): att rulla en kropp med
  utsträckta armar och ben ett halvt varv till rygg körde armar och fötter en halv meter ner i vägen.
- **Två gamla fel i uppresningen rättade** (gäller alla som blivit påkörda): från sittande till ett knä
  gick knäbenets fotled 0,33 m ner i marken (`liftFeet` böjer eller sträcker nu knät så lite som
  behövs), och händerna bakom honom när han sitter gick 2,5 cm ner (armbågarna böjs lite mer).
  Sängscenen efter kylan ser likadan ut.
- **Hastighetsgränsen för att tumla ur bilen** sänktes från 7 till 4 m/s ("en körande bil").

## Så verifierar man

`PORT=88xx node tools/shot.mjs <scenario>` (tools/scenarios/snubbla.mjs):

- `snubbla`: riktiga mellanslagstryck stående, gående och springande (två av varje) med nästa landning
  inställd på att snubbla: varje gång en ragdoll, stilla inom 5 s, uppe inom 8 s, huvudet nere vid
  marken, ingen punkt och ingen led under marken, ingenting i en vägg, uppe nära där han föll (2,5 /
  4 / 5,5 m), framåt på väg; han säger något; sex hopp utan spaken: aldrig snubbel; oddsen 1/40;
  vid en husvägg: inget genom den; på Saabens tak: inget snubbel.
- `hoppaur`: in i Saaben, W till 15 / 35 / 60 / 90 km/h, E: ute och tumlande, stilla till slut, uppe
  igen, inget under vägen, inte i en vägg eller i bilen, längre ju fortare; i 10 km/h kliver han ur;
  en bil in i honom: ragdoll, uppe igen, inget under marken (`HIT=1`: bara den).
- `snubblaperf`: ~0,1-0,25 ms per fysiksteg medan han tumlar, ~0,05 ms per pose.
- `snubblalook`: filmremsor (var 4:e bildruta) av ett snubbel stående, gående och springande, en
  påkörning och hoppet ur bilen i 50 km/h bakifrån och från sidan: `out/snubbla_<tagning>.jpg`
  (`FILM=katalog` sparar rutorna).
- `snubbladbg`: diagnostik, ett snubbel steg för steg (`DBG=noLimits,...` stänger av delar av
  lösaren, `RAG.dbg`).
- Regression: `hopp` (hoppet, 11 kontroller), `coldbed` (sängscenen), `story`.

---

## Definitionen (som den skrevs)

Ove är ju lite gubbig av sig.

När man hoppar (alltså det man gör med space), gör så att en gång av 40 så snubblar han när han landar.
Med ragdoll!

När vi ändå är där: om man hoppar ur en körande bil så ska ove ragdolla också (gör det i samma feature).
