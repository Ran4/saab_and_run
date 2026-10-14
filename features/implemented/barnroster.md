# Barnröster

## Definitionen

Ok, går inte att generera barnröster med elevenlabs.
generera röster så att barnen pratar väldigt pipigt bara (om än med vuxenröster).

---

# Implementerat (2026-10-15)

Barnen pratar nu med riktiga röster i stället för mummel och fniss: Sara, Nasanin och fyra nya
barnröster bland statisterna. Varje barnroll läses av en vuxen röst från ElevenLabs Voice Library,
och röstverktyget höjer sedan varje tagning kraftigt i tonläge (och mindre i formanter) så att
den blir pipig. Längden ändras inte, så replikernas tider, undertexternas tider och läppsynken
stämmer som förut.

## Rollerna

| Roll | Vuxen röst (Voice Library) | Höjning: tonläge / formanter | Ungefärlig tonhöjd i spelet |
|---|---|---|---|
| **Sara** (7 år) | Sanna Hartfield – Sassy and Natural (Stockholm) | ×1,6 / ×1,3 | ~415 Hz |
| **Nasanin** (3 år) | Lisa – Friendly Customer Service Agent (standard) | ×1,8 / ×1,4 | ~490 Hz, den pipigaste |
| `ped_kid_f_1`, flicka | Olivia – Bright, Youthful and Engaging (Stockholm) | ×1,6 / ×1,3 | ~430 Hz |
| `ped_kid_f_2`, flicka | Sini – Energetic and spirited (Stockholm) | ×1,65 / ×1,3 | ~430 Hz |
| `ped_kid_m_1`, pojke | Matias – Kind and youthful (Stockholm), en ung mansröst | ×2,0 / ×1,45 | ~400 Hz |
| `ped_kid_m_2`, pojke | Anders – Direct, Clear and Warm (standard), en ung mansröst | ×2,2 / ×1,45 | ~410 Hz |

- Tonhöjden i tabellen är tagningarnas medianton (uppmätt med Praat, barnens repliker är mest
  utrop: 186–273 Hz) gånger höjningen. Riktiga barn som ropar ligger på ungefär 300–500 Hz, så det
  här är högt men inte helt orimligt. "Väldigt pipigt" alltså, som beställt.
- Pojkarna görs av unga mansröster med mer höjning än flickorna, men landar lite mörkare, så att
  en pojke och en flicka bland statisterna inte låter likadant.
- Ingen av rösterna användes av någon annan roll förut. Alla fanns redan som kandidater i
  `cast.json` (Sanna Hartfield till Parvaneh, de andra till statistpoolen), så deras provklipp låg
  redan i cachen.
- **Statisterna:** ett barn (under 13 år) får nu en barnröst av sitt eget kön ur poolen, vald med
  personens eget frö som de vuxna statisterna (samma barn låter alltid likadant). `index.json`
  `_pool` har grupperna `f_kid` och `m_kid`. Den gamla rollen `ped_kid` (mummel) är borttagen ur
  `cast.json`. Namnet `ped_kid` finns kvar som pseudotalare i `script.js` (`@voice ped_kid`-taggen
  betyder nu "de fyra barnrösterna", `POOL_AGES.ped_kid = ['kid']`) och som reserv i `voice.js`
  om manifestet saknar barnröster (då mumlas det som förut).

## Hur höjningen görs

- **`cast.json`:** en barnroll har `"shift": { "pitch": 1.6, "formant": 1.3 }`. Höjningen hör
  till bearbetningen, inte till ElevenLabs-anropet, så den ingår inte i klippets hash. Ändrar man
  den behövs alltså ingen ny tagning: `make voice REPROCESS=1 WHO=sara` gör om rollens klipp från
  de cachade tagningarna, gratis, på ungefär en halv minut.
- **`tools/voice/shift.py`** (nytt, uv-skript med Praat via parselmouth, samma beroende som
  `analyze.py`) använder Praats *Change gender* (PSOLA). Tonläget höjs med `pitch` (tagningens
  egen median gånger faktorn, så att intonationen följer med i proportion), formanterna med
  `formant`, och längden är exakt densamma (ingen förskjutning i tid, uppmätt).
- **I `processTake`** (`tools/voice/voice.mjs`) körs höjningen efter trimningen och före
  ljudnivån. Ljudstyrkan (−20 LUFS), limitern och läppkurvan räknas alltså på den pipiga rösten.
- **Rubberband provades först** (ffmpegs `rubberband`-filter, asetrate för formanterna). Det
  smetade ut rösten (fasvokoderns fasbrus syns i spektrogrammet). Vid samma tonhöjd hörde
  taligenkännaren fel på 4 av Saras 17 längre repliker med rubberband, mot 2 med Praat. Vid ×1,55
  var det 2 mot 0.
- **Valet av faktorer:** för varje roll provades tre kombinationer på rollens egna tagningar
  (gratis, bara bearbetning). Valt blev det högsta tonläget där taligenkännaren fortfarande hörde
  de längre replikerna rätt. Formanterna höjs mindre än tonläget: det låter mer som ett barn och
  mindre som en uppsnabbad bandspelare, och det håller orden begripliga.

## Verktyget

- `make voice-hear WHO=a,b` (`voice.mjs hear`, nytt) lyssnar på klippen så som spelet spelar dem,
  det vill säga efter höjningen. Den skriver ut tonhöjden och hur många av de längre replikerna
  taligenkännaren förstår, jämfört med samma tagningar före bearbetningen. Gratis, inget sparas.
  - Praats tonanalys slutar vid 600 Hz, och ett barns rop går över det, så tonhöjden kan visa för
    lågt (oktavfel). Därför skriver `hear` också ut tagningarnas ton gånger höjningen.
- `make voice REPROCESS=1 WHO=a,b`: `reprocess` tar nu `--who`.
- `make voice-cast WHO=sara` gör provlyssningarna så som rollen kommer att låta, alltså höjda. En
  kandidat som redan har ett provklipp hos en annan roll kopieras därifrån utan anrop. Ändras
  rollens `shift` höjs provet om automatiskt. Barnrollernas prover (4+4+3+3+3+3) kostade inget.
- **Provlyssningssidan** (`make voice-review`) visar flicka/pojke under 13 år och höjningen på
  rollkortet. "Välj" byter röst som för alla roller; därefter `make voice`.

## Kostnad och resultat

- 120 klipp (Sara 24, Nasanin 20, varje barnröst 19), 1 534 tecken, **1 534 credits** (uppmätt:
  `character-cost` per anrop). Alla gick igenom i första tagningen, så det blev inga omtagningar.
- 173 s tal och 1,7 MB mp3. `assets/voice/` är nu 25 MB och manifestet har 1 383 klipp.
- **Taligenkännaren (`make voice-hear`)** förstår 35 av 36 längre repliker efter höjningen, alla
  utom Saras "Får jag klappa katten?". På de korta utropen ("Tut tut!", "Akta dig!") hör den lika
  ofta fel som på de vuxnas tagningar. De står på granskningslistan som vanligt.
- **`make voice-check`:** ok. Inga repliker är längre "mumble".

## Skillnader mot definitionen

- **Även barnstatisterna** fick röster, inte bara Sara och Nasanin. De var också mummel, och
  definitionen säger "barnen". Fyra röster gör att alla barn som går förbi inte låter likadant.
- **Formanterna höjs också,** men mindre än tonläget. "Bara pipigt" hade kunnat vara ren
  chipmunk (allt höjt lika mycket). Den varianten låter mer som en uppsnabbad inspelning, och
  taligenkännaren hörde den sämre. Vill utvecklaren ha ren chipmunk: sätt `formant` lika med
  `pitch` i `cast.json` och kör `make voice REPROCESS=1 WHO=…`.
- **Ingen har lyssnat.** Jag kan inte höra, så valen bygger på mätningar: tonhöjd,
  taligenkänning och spektrogram (inga artefakter, tydliga övertoner). Om något låter fel är
  rösterna, faktorerna och provlyssningssidan gjorda för att det ska vara gratis att ändra.
  - **För pipigt eller inte pipigt nog:** ändra `shift` och kör REPROCESS.
  - **Fel röst:** "Välj" en annan kandidat på sidan och kör `make voice`, ungefär 200–550 credits
    per roll.
- Fnisset (`audio.giggle`) finns kvar för ett barns replik som saknar klipp, och med rösterna av.

## Kod

- `tools/voice/voice.mjs`: `shiftWav` och höjningen i `processTake`, `hear`, `reprocess --who`, i
  `cast` kopierade och höjda prover. `POOL_AGES.ped_kid = ['kid']`.
- `tools/voice/shift.py`: ny.
- `tools/voice/cast.json`:
  - `sara` och `nasanin` har röst och `shift`, och `mumble` är borta.
  - `ped_kid` är ersatt av `ped_kid_f_1`, `ped_kid_f_2`, `ped_kid_m_1` och `ped_kid_m_2`, med
    `pool: { sex, age: 'kid' }` och `shift`.
- `src/voice.js`:
  - `poolVoice` ger ett barn en röst ur `f_kid` / `m_kid`.
  - `isKid` ersätter mängden `KIDS`, så fnisset vid saknat klipp gäller även de nya
    barnrösterna.
- `tools/voice/review.mjs`: rollkortets etikett.
- `Makefile`: `voice-hear`, `REPROCESS=1 WHO=`.
- Klippen: `assets/voice/{sara,nasanin,ped_kid_*}/`, `index.json`, `tools/voice/qc.json`.

## Verifiering

```sh
make voice-check                                   # ok, 1 383 klipp
make voice-hear WHO=sara,nasanin,ped_kid_f_1,ped_kid_f_2,ped_kid_m_1,ped_kid_m_2
PORT=88xx node tools/shot.mjs barnroster vpool voice
TO=7 PORT=88xx node tools/shot.mjs vcut            # alla sju dagarna med rösterna
```

- **`barnroster`** (nytt, `tools/scenarios/voice.mjs`): Sara och Nasanin står framför kameran
  och säger fem repliker. Varje replik ska:
  - spelas som klipp med egen röst;
  - inte klippas av;
  - få käken att följa klippet (öppen på 60–75 % av bildrutorna, bredast 1);
  - lämna käken odriven efteråt.

  Närbilder sparas som `barn_*.png`. Under den här delen är grannarnas småprat avstängt
  (`chatGlobalT`), annars köar flickornas repliker bakom grannarnas. Sedan slås småpratet på igen.
  Ove står då utanför tystnaden runt dagens uppdragsgivare (Patrick står bredvid flickorna), och en
  av flickorna ska säga en småpratsreplik av sig själv, som klipp, till exempel Saras "Vem är du?".
  Scenariot gick igenom tre gånger i rad.
  - Käken rör sig lite, som hos alla figurer (models.js: "mouths that barely move"). Munnen är
    lätt öppen på närbilderna.
- **`vpool`** kontrollerar nu också barnen:
  - ett barn bland statisterna får en barnröst av sitt kön;
  - varje replik ett barn kan säga har ett klipp;
  - minst två barnröster används;
  - ett barns, Saras och Nasanins repliker spelas som klipp.

  34 statister, varav 4 respektive 8 barn i två körningar, med tre olika barnröster.
- **`voice`** (påhittat manifest, turordningen och munnarna): no errors.
- **`vcut TO=7`** (alla sju dagarna med rösterna, i mänsklig takt): slutar på `#7 idle`, no
  errors.
  - 122 repliker sades, varav 120 som klipp.
  - En klipptes av (0,8 %), och det var Anitas "Ove, elementet klickar igen...", inte ett barns.
  - Inga två röster hördes samtidigt.
  - Misslyckandet och omstarten: 8 repliker, ingen avklippt.
- **Rösterna, inte spelet:** `story` behövde inte köras, eftersom inga uppdrag, steg, förare eller
  fysik ändrades. Med `?test=1` är rösterna av, så historien går som förut.
