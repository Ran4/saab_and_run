# Fixa hoppet

## Önskemålet

Hoppet (alltså space för att hoppa upp i luften) ser och låter dumt.

1. ljudet är asdåligt, använd elevenlabs och generera ett ordentligt gubbstön när man hoppar. Eller, generera 4 olika och växla mellan dem mellan varje hopp (1,2,3,4,1,2,3,4...)
2. Hoppet är instant. Gör så han liksom sjunker ner och tar sats i någon halvsekund först.

(Förtydligat när uppgiften gavs: gärna med Oves röst, prova Sound Effects, välj det som låter bäst
med mätvärden och omdöme, under ~500 credits. Inmatningen ska kännas pålitlig, och allt som kräver
ett hopp ska fungera som förut.)

## Vad som blev gjort (2026-10-11)

### Ljudet: fyra stön med Oves röst, i tur och ordning

Ove stönar nu med sin egen röst (Brage, `eleven_v4`, samma röst som i alla hans repliker). Det är
fyra olika stön, som spelas i ordningen 1, 2, 3, 4, 1 … (`assets/sfx/ove_hopp_<n>.mp3`). Stönet
kommer när han tar avstamp, 0,17 s innan han lämnar marken, inte när han redan är i luften. När han
landar säger han "uff" (sju gånger av tio, som förut), också det med sin egen röst och också fyra i
tur och ordning (`ove_land_<n>.mp3`). Annars hade ett syntetiskt "uff" kommit direkt efter ett
riktigt stön, och det lät fel. Filerna är mono-mp3 på 64 kbps, 0,26–0,52 s långa och sammanlagt
ungefär 30 kB.

- **Nivå:** stönen ligger på −23 LUFS och landningarna på −26 LUFS (replikerna ligger på −20). De
  går torrt genom röstbussen, så reglaget för röstvolym styr dem också. Ett hopp görs ofta, så stönen
  ska ligga under talet.
- **Reserv:** tills filerna är laddade (eller om de inte går att ladda) spelas de gamla syntetiska
  ljuden.
- **Verktyget:** `tools/sfx/grunts.mjs` gör tagningarna (`tts`, `sfx`, `sts`), för en logg över varje
  anrop och dess kostnad (`tools/sfx/ledger.json`) och vägrar gå över 480 credits. `make` klipper ut
  den valda delen av en tagning och nivåjusterar den. `tools/sfx/grunts.py` mäter tagningarna (se
  nedan). Verktyget rör inte röstverktygets filer och kör inte `make voice`.

#### Hur valet gick till

Jag kan inte lyssna, så valet byggde på mätningar plus spektrogram av varje tagning
(`uv run tools/sfx/grunts.py --bursts --sheet ark.png`). Måtten var:

- längd, och hur snabbt ljudet når sin topp
- tonhöjd och hur mycket av ljudet som är tonande (Praat)
- vad MIT:s AudioSet-klassare (AST) tror att det är: "Grunt" + "Groan" mot tal
- vad KBLab:s svenska whisper hör (ett stön ska inte höras som ett ord)
- röstlikhet mot Oves repliker (WavLM-x-vektorer)

| Prov | Tagningar | Credits | Resultat |
|---|---|---|---|
| TTS med Oves röst och audio tag + ljudord ("[strained grunt] Hmmf!", "[grunts with effort] Hnngh!" …) | 19 | 62 | Två ljud per tagning, 1,1–2,6 s, mest "Sigh"/"Gasp". **Men taggens eget stön (första ljudet) var ofta det bästa av allt.** |
| TTS med bara tagg ("[grunts] ...", "[strained grunt] ..." …) | 18 | 44 | Ett tonande stön på 0,2–0,35 s och sedan en lång suck. Klipps 70 ms efter att rösten tystnar. |
| TTS med ord ("Hupp!", "Hah!", "Hoh!") | 6 | 22 | Hördes som ord ("Upp!", "Hopp!", "Ha!", "Hå!"). Bortvalda. |
| TTS för landningen ("[exhales] Uff.", "[grunts] Uff.", "[winded] Oof.") | 6 | 12 | Korta utandningar, "Sigh"/"Gasp" (som ett "uff" ska vara). |
| Sound Effects (1 s, `prompt_influence` 0,6) | 6 | 60 | Riktiga stön (två klassas som "Groan"), men med en främlings röst. Dessutom 0,7–0,9 s långa: ett stigande "uuuh?" och ett "aah" på 310 Hz. |
| Voice Changer: bästa SFX-tagningen omgjord till Oves röst | 1 | 17 | Ett platt, surrande brum på 71 Hz. Whisper hörde "Jag". Sämst av alla. |
| **Summa** | **56** | **217** | 140 för TTS (~0,15 credits/tecken med v4-rabatten), 60 för SFX (10/s), 17 för Voice Changer (17/s) |

Det blev Oves egen röst (TTS). Ur tagningarna klipptes den del som var ett stön. Så här står de
fyra som valdes mot den gamla syntetiska grunten:

| | tagning | längd | till toppen | tonhöjd | Grunt+Groan | tal | AudioSet tror |
|---|---|---|---|---|---|---|---|
| 1 | "[strained grunt] Hmmf!", seed 23: taggens stön | 0,37 s | 100 ms | 282 Hz | **0,49** | 0,09 | Groan, Grunt |
| 2 | "[grunts] ...", seed 11: den tonande kärnan | 0,47 s | 140 ms | 144 Hz | 0,33 | 0,11 | **Grunt** |
| 3 | "[strained grunt] Hnngh!", seed 11: taggens stön, kärnan | 0,45 s | 190 ms | 303 Hz | **0,54** | 0,30 | Groan |
| 4 | "[grunts with effort] Hnngh!", seed 37: taggens stön | 0,29 s | 150 ms | 148 Hz | 0,42 | 0,19 | **Grunt** |
| förut | den syntetiska grunten | 0,55 s | 40 ms | 100–110 Hz | 0,02–0,05 | **0,40–0,43** | Speech; whisper hörde "Mutte", "Mu" |

- **Stönen:** nummer 1 är ett klassiskt pressat "hnh". Tonhöjden går upp och ner igen på 0,25 s.
  Nummer 2 är ett lågt, raspigt "hmpf", nära Oves taltonläge (118 Hz). Nummer 3 är ett längre
  "hnnngh". Nummer 4 är ett kort, stigande "hupp". De är alltså lika i längd och nivå men olika till
  karaktären, och de växlar mellan pressat, lågt, långt och kort.
- **Bortvalt:** tagningen med högst stönpoäng (0,63) tog 480 ms att nå sin topp. Det blir ett segt
  "uuunngh", som inte passar ett avstamp.
- **Landningen:** "uff" (det sagda ordet, 109 Hz, 0,24 s) och tre korta utandningar och
  grymtningar (0,20–0,41 s).
- **Röstlikheten:** måttet kunde inte avgöra något. Oves egna repliker låg bara 0,03 närmare hans
  medelvärde än de andra männens, så det redovisas men användes inte. TTS-tagningarna har ändå
  Oves röst, eftersom de är gjorda med den.

### Ansatsen: han sjunker ner, samlar sig och tar avstamp

Förut tog ansatsen 0,22 s stående (0,1 s i rörelse). Den bestod av ett hopsjunk och sedan ett
hopp rakt upp ur det. Nu tar den 0,5 s stående, ungefär 0,33 s i gång och 0,2 s i full löpning
(`JUMP.wind` i `character.js`) och har tre faser (`jumpWindPose` i `models.js`):

1. **Han sjunker** (0–0,30 s stående). Knäna går fram och sätet bakåt över fötterna, så att fötterna
   står kvar. Överkroppen fälls framåt, armarna svingar bakåt och huvudet sänks lite. Han lägger
   tyngden på båda fötterna, eftersom viloställningens mjuka knä annars hade lyft ena foten 2 cm i
   djupaste läget.
2. **Han samlar sig** (0,30–0,35 s). Det är djupaste läget med en liten extra nedsjunkning.
3. **Avstampet** (0,35–0,50 s). Här kommer stönet (`game.onJumpPush`). Benen sträcks, armarna
   svingar framåt och upp en aning före benen, och hälarna lyfter de sista 0,1 s. Han rullar fram
   över tårna, som står kvar, och lämnar marken sträckt och på tå. Där tar luftposen över.

I gång och löpning blir det en grundare nedsjunkning ovanpå steget, och benen sköter sig själva.
Flygfasen är oförändrad: 3,95 m/s under 14 m/s², 0,55 m och 0,56 s. Därför når han lika högt som
förut, och allt som gick att ta sig upp på går fortfarande.

**Landningen fick två fel rättade på vägen:**

- **Fötterna sjönk ner i marken** (2,6 cm i HEAD). Nu ställer ett "plant"-steg den lägre sulan på
  marken genom ansatsen och landningen, räknat ur benens faktiska vinklar (`soleGap`).
- **Vänster fot gled 6,5 cm.** Så fort han landat blandades den allmänna fallposen in (med vänster
  ben fram) i stället för hoppets egen luftpose. Nu släpper hoppets luftpose genom landningen, och
  benen sträcker sig ner mot marken med stående ställningens bredd, med fötterna under honom.

Mätt med `tools/gait.mjs jump` (`jump feet`, ett stående hopp) och upprepat med tio slumpfrön
(viloställningen skiljer sig mellan dem). Värdena är i meter, min / median / max:

| | ansatsen: dopp | lyft före avstampet | glidning | landningen: dopp | glidning |
|---|---|---|---|---|---|
| HEAD (0,22 s ansats) | −0,004 | 0,014 / 0,018 / 0,019 | 0,005 / 0,011 / 0,012 | −0,033 / −0,030 / −0,026 | 0,069 / 0,070 / 0,070 |
| nu (0,5 s ansats) | −0,003 / −0,003 / −0,001 | 0,001 / 0,004 / 0,004 | 0,007 / 0,017 / 0,018 | −0,003 / −0,003 / −0,002 | 0,025 / 0,042 / 0,046 |

- **Ansatsen:** glidningen är 1–2 cm. Det är hälarna som vrids lite utåt i djupaste läget,
  symmetriskt, under en halv sekund. Tårna står helt still medan hälarna lyfter.
- **Landningen:** glidningen är 2,5–4,6 cm, under 0,3 s, medan luftposen släpper. Det är ungefär
  hälften av förut.

Gångens mått (`gait.mjs metrics`) påverkas inte: gångkoden är orörd.

### Inmatningen: ett tryck försvinner inte

- **Ett kort tryck räcker.** Hoppet kommer alltid efter ansatsen, och knappen behöver inte hållas
  inne.
- **Ett tryck till under ansatsen** är samma hopp. Det blir inget dubbelhopp.
- **Ett tryck som inte kan utföras än** (han är fortfarande i luften eller landar just) sparas i
  0,25 s (`JUMP_BUFFER` i `main.js`). Han hoppar igen så fort han kan, till exempel när han landar.
- **Om han går av en kant under ansatsen** tar han avstamp direkt, om han lämnade marken för högst
  0,15 s sedan (`JUMP.coyote`). Förut försvann hoppet då.
- **En dialog eller en bil** som tar över under ansatsen avbryter den. Förut kunde han hoppa mitt i
  dialogen eller när han klev ur bilen.
- **Sparken** (J) väntar tills ansatsen är över.
- **Space i bilen** är handbromsen och sparas inte som ett hopp.
- **Grannarnas skutt** (tutan, `horn.js`) behåller sin snabba ansats på 0,22 s (`JUMP.leap`).

### Tester

Alla körningar gick headless på egen port, med Chrome-profil och skärmdumpar i /dev/shm (disken var
full, se nedan).

- **`gait.mjs jump walkjump runjump metrics sound`:** `no errors`. Det stående hoppet: avstampet
  vid 0,333 s, av marken vid 0,5 s, höjden 0,52 m (samma som i HEAD). Fötterna enligt tabellen ovan.
  Bilderna har jag tittat på, rad för rad: han sjunker, samlar sig, sträcker på sig, står på tå och
  är i luften, och landningen är tung. Gångens mått var oförändrade (de varierar som förut med
  slumpfröet).
- **`hopp` (nytt scenario i gameplay.mjs, riktiga tangenttryck):** 11 av 11 kontroller OK.
  - Ett kort tryck ger ett hopp, och han lämnar marken 0,52 s efter trycket.
  - Stönet kommer 0,167 s före avstampet, och höjden är 0,524 m.
  - Ett tryck till under ansatsen ger fortfarande ett hopp.
  - Ett tryck strax före landningen sparas: nästa avstamp kommer 0,35 s efter landningen.
  - En dialog under ansatsen ger inget hopp.
  - Han kommer upp på ett 0,85 m högt block stående, gående och springande, men inte utan hopp.
- **`walk`:** höjden 0,52 m. Två tryck med fyra bildrutors mellanrum ger också 0,52 m, alltså inget
  dubbelhopp. Scenariot väntar nu 75 och 90 bildrutor, eftersom 30 inte räckte med den nya ansatsen.
- **`story`:** `#7 idle stage 7`, `hud watch: 2864 samples, 0 leaks`, `no errors`.
- **`pplanim`, `horn`, `camroof`, `uipause`:** `no errors`. Alla kontroller i `horn` gav OK, så
  grannarnas skutt fungerar som förut. `camroof` håller in Space medan Ove går in under akutens tak.
- **Ljudet:** `gait.mjs sound` renderar de fyra stönen och de fyra landningarna offline. Stönen har
  toppen 0,41–0,46 och landningarna 0,22–0,35, mot den gamla gruntens 0,23 och "aj"-ljudets 0,24.

### Att veta

- **Disken (/) var full** under arbetet (100 %, ibland 0 byte ledigt). Det berodde inte på det här
  arbetet. Headless Chrome fallerar då med `ERR_INSUFFICIENT_RESOURCES` och shaderfel. Lösningen var
  att köra med `TMPDIR` och `OUT` i /dev/shm.
- **Råtagningarna** ligger i `.cache/sfx/` (inte incheckade) med sina anrop. `tools/sfx/ledger.json`
  visar vad allt kostade. Vill man byta ett stön finns 56 tagningar att välja bland, och `make`
  klipper ut det man pekar på gratis.
