# Småprat: Ove svarar på det grannen faktiskt säger

> **Status: förslag (2026-10-14).** Inget är byggt.

## Problemet

När man trycker E vid en granne säger grannen en slumpad replik. Ove svarar med en av sex
grymtningar ur `OVE_REPLY` (`src/game/script.js:394`). Svaret slumpas utan hänsyn till vad grannen
sa (`src/main.js:1466`). Det ger fyra problem:

- **Svaren passar inte.** Ove kan säga "Det får vi se." på "Tack för i går, Ove." och "Jaså." på
  "Vill du ha lite saffransris?".
- **"Jaha." är en fråga.** Klippet stiger 8,6 halvtoner på "-ha" (90 → 160 Hz, uppmätt). Det låter
  som ett nyfiket "Jaha?", alltså motsatsen till Ove. De andra fem är platta eller fallande, utom
  "Det får vi se." som stiger lite.
- **Repliker upprepas.** Samma replik kan komma två gånger i rad, eftersom valet är rent slumpvis
  och väntetiden bara 3 s. Rune har fyra repliker, så var fjärde gång blir en upprepning.
- **Ove står still.** Han svarar likadant dag 1 som dag 7, fast hela berättelsen handlar om att han
  tinar upp. När grannarna börjar prata själva (`src/main.js:2050`) svarar han aldrig.

## Vad som ska byggas

1. **Ett svar på varje replik.** Alla 72 småpratsrepliker (`CHATTER`, `CHATTER_FIRST`,
   `CHATTER_AFTER`) får ett eget svar från Ove, eller några att välja mellan. Svaren står i
   tabellerna nedan. 17 av dem är repliker som redan finns inspelade.
2. **Han tinar upp under veckan.** Några svar byter med dagarna. De använder samma taggar som
   replikerna (`whenOk`). Sara ber honom bygga snögubbe hela veckan, och han svarar:
   - dag 1–4: "Nej."
   - dag 5–6: "Sen."
   - dag 7: "...En liten då."
3. **Några utbyten fortsätter.** Ett svar kan ha en fortsättning: grannen svarar, och ibland
   svarar Ove igen.
   - Saffransriset spelar om dag 1:s outro: "Jag har mat." – "Vad åt du i går då?" – "...Mat."
     Alla tre klippen finns redan.
   - Insexnyckeln: "Vilken storlek?" – Patrick: "Det finns... storlekar?"
4. **Tystnad.** Ibland säger Ove ingenting (svaret `''`), och då gör han en gest:
   - Rune: "..." → Ove nickar.
   - Vitskjortan: "Ha en bra dag. Tills vidare." → Ove tittar på honom och skakar sakta på huvudet.
   - Parvaneh: "Patrick, älskling. Andas." → ingenting, för hon pratar med Patrick.

   Nickningen och huvudskakningen finns inte än. De blir två korta rörelser i nacken och huvudet i
   `models.js`, där `st.look` redan vrider nacken. Om det går lätt kan "Nej." få en huvudskakning
   och "Mm.", "Ja?" och "Hej..." en nick, men det är valfritt.
5. **Ingen upprepning, och "Nu har vi pratat."**
   - Varje granne kommer ihåg vad den har sagt. En ny replik väljs bland dem som inte är bland de
     ⌊n/2⌋ senaste, och aldrig samma som förra gången.
   - Fjärde gången Ove trycker E på samma granne inom 60 s säger grannen ingenting, och Ove säger
     "Nu har vi pratat." (ny replik).
   - Efter det kan den grannen varken tilltalas eller börja prata själv på 20 s.
     `nearestInteractable` hoppar över grannen, så E-prompten försvinner.
6. **Ibland svarar han när grannen börjar.** Ove svarar i 35 % av fallen om:
   - grannen börjar prata självmant (`main.js:2050`)
   - Ove står inom 4 m och går till fots
   - ingen dialogruta är uppe

   Han svarar som vid E, men utan fortsättning och utan att vända sig mot grannen. Är svaret en
   tystnad händer ingenting.

## Svaren

"(finns)" betyder att klippet redan är inspelat. Taggarna räknar klara dagar (`m.index`):
`before4` = till och med dag 4, `after4 before6` = dag 5–6, `after6` = dag 7.

### Parvaneh

| Hon säger | Ove svarar |
|---|---|
| Hej! Vi har precis flyttat in. *(före dag 1)* | Det har jag sett. |
| Han har backat i en kvart nu. Minst. *(före dag 1)* | Sjutton minuter. *(Dag 1:s intro: "Tjugo minuter. Jag har tagit tid.")* |
| Patrick, älskling. Andas. *(före dag 1)* | *(tystnad)* |
| Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket. | Ett av: **Jag har mat.** (finns) → *Parvaneh:* Vad åt du i går då? (finns) → **...Mat.** (finns) · Lådan står diskad på trappan. (`before5`) · ...Ställ det på bänken. (`after5`) |
| Ove, du ser nästan glad ut i dag. | Det gör jag inte. |
| Patrick har klättrat upp på en stege igen. Titta inte. | Är det min stege? |
| Flickorna vill att du kommer på middag. Jag med. | Jag äter klockan fem. (`before5`) · ...Vad blir det? (`after5`) |
| Första körlektionen på måndag, Ove! Jag har redan köpt en övningskörningsskylt. | Manuell växellåda. Inget fusk. |
| Patrick försöker knyta skorna med en hand. Det är bättre än tv. | Kardborreband. |
| Tack för hjälpen med släpet. Igen. | Hmpf. Ni är skyldiga mig en brevlåda. (finns) |

### Patrick

| Han säger | Ove svarar |
|---|---|
| Jag har köpt en bok om att backa med släp. Den har bilder. *(före dag 1)* | Läs den. |
| Vänster... nej. Höger. Eller? *(före dag 1)* | Vänster. |
| Hur svårt kan det vara att backa ett släp? *(före dag 1)* | Tydligen väldigt svårt. |
| Hej Ove! Jag skulle bara... nej, det var inget. | Jaha. (finns: det frågande klippet, som passar här) |
| Släpet står helt rakt. Jag har tagit en bild på det. | Det står fyra centimeter snett. |
| Jag är IT-konsult. Jag kan starta om saker. Det är ungefär allt. | Det har jag märkt. |
| Har du en insexnyckel? Jag ska bara montera en garderob. Tror jag. | **Vilken storlek?** → *Patrick:* Det finns... storlekar? |
| Armen kliar under gipset. Hela tiden. | Rör den inte. |
| Parvaneh säger att jag inte får gå upp på stegar mer. Någonsin. | Klok kvinna. |
| Tack för att du körde Parvaneh. Jag var... upptagen. | Du låg i snön. |

### Sara

| Hon säger | Ove svarar |
|---|---|
| Hej! Vi har flyttat hit! *(före dag 1)* | Jaså. (finns) |
| Pappa kan inte backa. *(före dag 1)* | Nej. (finns) |
| Vem är du? *(före dag 1)* | Ove. (finns) |
| Ove! Kom och bygg snögubbe! | Nej. (finns, `before4`) · Sen. (`after4 before6`) · ...En liten då. (`after6`) |
| Varför är du alltid så arg? | Jag är inte arg. |
| Mamma säger att du är snäll inuti. | Mamma pratar för mycket. |
| Pappa kan inte bygga snögubbar. De ramlar. | Ingen grund. Det är alltid grunden. |
| Katten tycker om dig. | Katten tycker om mat. |
| Får jag klappa katten? | Fråga katten. |

### Nasanin

| Hon säger | Ove svarar |
|---|---|
| Hej! *(före dag 1)* | Hej. |
| Snö! *(också före dag 1)* | Ja. Det är snö. |
| Släpet! *(före dag 1)* | Det står snett. |
| Ove! Ove! Ove! | Ja? (finns) |
| Snögubbe! | Nej. (finns) |
| Ove, titta! | Jag tittar. |
| Katten! | Ja. Katten. |
| Kissen! | Den heter inte Kissen. |

### Jimmy

| Han säger | Ove svarar |
|---|---|
| Tjena Ove! Har du ätit? | Klockan tolv. Som vanligt. |
| Ove! Mannen själv! | Vem annars? |
| Jag kör nyttigt nu. Typ. | Typ. |
| Fint väder, va? | Nej. (finns) |
| Hur mår katten? Har den fått ett namn än? | Den heter Katten. |
| Jag köpte kattmat. Jag köpte för mycket kattmat. | Det märks. På katten. |

### Adrian

| Han säger | Ove svarar |
|---|---|
| Ove, vad tycker du om Audi? | Plast och elektronik. (finns) |
| Jag ska köpa bil snart. Vad köper man? | Saab. |
| Kan du lära mig byta däck någon gång? | Det får vi se. (finns) |
| Saaben startade på första försöket i morse! | Det är en Saab. |
| Jag har kollat trösklarna. Två gånger. | Kolla dem en gång till. |
| Jag bytte däck själv i går! Nästan. | Nästan är inte bytt. |

### Anita

| Hon säger | Ove svarar |
|---|---|
| Hej, Ove. | Hej, Anita. |
| Rune sov dåligt i natt. | Det är för kallt hos er. Det är elementen. (`before3`, bäddar för dag 3) · Mm. (finns, `after3`) |
| Klä dig varmt, Ove. Det är kallt i dag. | Jag har jacka. |
| Han frågar efter dig ibland. På sitt sätt. | ...Hälsa honom. |
| Det är så varmt hos oss nu, Ove. | Har ni lappen kvar? *(dag 3:s outro: "Jag skriver det på en lapp åt er.")* |
| Rune sa ”Saab” igen i morse. Bara så där. | Han vet. |
| Tack för i går, Ove. | Det var ingenting. (finns) |

### Rune

| Han säger | Ove svarar |
|---|---|
| ... | *(tystnad, en nick)* |
| Hm. | Hm. |
| ...Ove. | Rune. |
| Volvo. | Saab. |
| ...Saab. | Ja, Rune. Saab. (finns, från dag 3:s outro) |

### Anders

| Han säger | Ove svarar |
|---|---|
| Ove! Har du sett min nya Audi? | Nej. (finns) |
| Föreningen har nya regler, Ove. Jag mejlar. | Jag har ingen mejl. |
| Morsning, Ove. Fint väder för en promenad. | Det är ingen promenad. Det är en inspektion. |
| Vi borde ha en bom vid infarten, tycker du inte? | Det har jag sagt i tjugo år. |
| Audin var på service. Det var inget fel på den. Alls. | Säkert inte. |
| Två Saabar i föreningen nu. Fantastiskt. | Det är en början. |

### Vitskjortan

| Han säger | Ove svarar |
|---|---|
| Vi har papper på allt. | Jag också. I pärmar. |
| Det här är en kommunal angelägenhet. | Det här är föreningens mark. |
| Ha en bra dag. Tills vidare. | *(tystnad, en huvudskakning)* |
| Vi ses, Ove. Vi har tid. | Jag är pensionär. Jag har mer tid än ni. |
| Underskriften är på väg. Den är på väg. | Jag väntar. |

## Data: `CHATTER_REPLY` i `script.js`

Tabellen grupperas per granne, som `CHATTER`. Det behövs eftersom samma text kan ha olika talare:
Anitas "Hej, Ove." är också `CHATTER_FALLBACK`, och Nasanins "Snö!" finns i två tabeller.

```js
// Ove's answer to small talk (main.js chat): CHATTER_REPLY[who][line] = POOL of ANSWERs, one picked
// among those whose tag holds. ANSWER = text | [text, tag] | [text, tag | null, [LINE, ...]]: with
// LINEs the exchange goes on, in turn. '' = Ove says nothing (main.js: a nod, a shake of the head).
// Every line in CHATTER, CHATTER_FIRST and CHATTER_AFTER has one (the smalltalk scenario checks).
export const CHATTER_REPLY = {
  parvaneh: {
    'Hej Ove! Vill du ha lite saffransris? Jag har gjort för mycket.': [
      ['Jag har mat.', null, [['parvaneh', 'Vad åt du i går då?'], ['ove', '...Mat.']]],
      ['Lådan står diskad på trappan.', 'before5'], ['...Ställ det på bänken.', 'after5']],
    // ...
  },
  // ...
};
// The fourth time in a minute Ove is talked to by the same neighbour.
export const CHATTER_ENOUGH = 'Nu har vi pratat.';
```

- `whenOk(null)` är alltid sant.
- `allLines()` får delen `'chatterReply'`, med Oves svar, fortsättningarnas repliker och
  `CHATTER_ENOUGH`. Repliker som redan finns behåller sin gamla del, eftersom den första vinner.
- Tabellen är ingen delad tabell, så den behöver ingen `@voice`-tagg.
- **`OVE_REPLY` ändras inte.** `luftning.js` och `hoppbacke.js` plockar ur den efter position.
  Den finns kvar som reserv för en replik utan svar (i dag bara `CHATTER_FALLBACK`), men utan
  "Jaha.".

## Kod: `main.js`

- **`chatterFor` / `chat()`:** grannen väljer bland repliker som inte sagts nyligen
  (`n.chatSaid`). Räkna E-trycken per granne de senaste 60 s (punkt 5).
- **Svaret och fortsättningen:**
  - Svaret kommer som i dag: 450 ms efter att grannens klipp tagit slut, och bara om klippet inte
    klipptes av (`u.state === 'done'`).
  - Varje följande replik kommer 450 ms efter den förra.
  - Utan röster (testläget) gäller dagens tider: 2 s efter grannens replik, sedan 1,6 s per replik.
- **Kedjan bryts om:**
  - Ove är mer än 6 m bort
  - han sitter i en bil
  - en dialogruta är uppe
  - ett uppdrag börjar
  - grannen inte längre är `normal`
  - kylan håller på (`cold.busy`)
- **Tystnad:** en gest i stället för en replik. Rune ger en nick, Vitskjortan en huvudskakning,
  övriga ingenting.
- **Självmant prat** (rad ~2050): punkt 6.

## Röster och budget

- **Mängd:** 60 nya klipp, 59 för Ove och ett för Patrick. Ungefär 1 050 tecken. 17 svar använder
  klipp som redan finns.
- **Budget:** manuset går från 15 546 till ungefär 16 600 tecken. Gränsen höjdes till ≲ 30 000
  den 2026-10-14, så det ryms. Uppdatera siffrorna i CLAUDE.md (repliker, tecken, datum).
- **Kostnad:** en röst per replik. Rabatten på `eleven_v4` gick ut 12 oktober, och priset efter
  det är inte uppmätt. `cast.json` räknar med 1 credit per tecken, vilket ger högst cirka 1 050
  credits. Det är långt under `MAX` (30 000 per körning).
- **Steg:**
  1. Kör `make voice DRY=1`. Den ska visa runt 60 repliker och 1 050 tecken, alla för `ove` utom en
     för `patrick`.
  2. Kör `make voice`.
  3. Kör `make voice-check`.
- **Lyssna på de korta svaren** ("Saab.", "Typ.", "Sen.", "Hm.", "Ja. Katten."), eller mät
  tonhöjden. Ett svar som stiger som "Jaha." gjorde ska tas om (`qc.json`), utom där en fråga är
  meningen ("Är det min stege?", "Vilken storlek?", "Vem annars?", "...Vad blir det?").

### Bakgrund: budgeten

- Förslaget i `features/implemented/a_fully_voiced_game.md` var "≲ 15 000 tecken". Manuset blev
  ungefär 15 100–15 500 tecken, så gränsen sattes till 16 000. Den följde storleken manuset fick,
  inte någon kalkyl. Utvecklaren höjde den till 30 000 den 2026-10-14.
- Det den skyddar mot är kostnaden. Varje tecken kostar credits en gång för varje röst som säger
  repliken. Oves repliker har en röst. Delade tabeller (statisterna) har 12–20 röster.
- Gränsen räknar alla tecken lika, så den är ett trubbigt mått. Den enda hårda gränsen är
  verktygets `MAX`.

## Test

- **`smalltalk`** (`tools/scenarios/gameplay.mjs`) utökas. För varje granne, dag 0–7 och båda
  lägena på grinden ska följande gälla:
  - varje replik som `chatterFor` kan ge har ett svar med en tagg som gäller den dagen, så att
    reserven aldrig används
  - mönstren i `bad` gäller också svaren och fortsättningarnas repliker
  - upptiningen ger rätt svar per dag: Saras snögubbe, Parvanehs middag och saffransris, Anitas
    "Rune sov dåligt"
- **Nytt scenario `smaprat`** (`tools/scenarios/smaprat.mjs`) med riktiga E-tryck. Ove ställs
  bredvid varje granne som är ute dag 0, 2, 4 och 6 (warp), trycker E och läser bubblorna. Det
  ska gälla att:
  - grannens replik kommer först, sedan ett svar ur den replikens svar
  - fortsättningar kommer i ordning
  - en tystnad ger ingen bubbla från Ove men en gest
  - fyra E i rad ger "Nu har vi pratat." och ingen E-prompt på 20 s
  - 40 E på Rune ger aldrig samma replik två gånger i rad
  - med `&voice` hörs aldrig två röster samtidigt, och varje replik väntar in föregående klipp
- **`story`** ska fortfarande sluta med `#7 idle` och `no errors`.

## Dokument att uppdatera

- **CLAUDE.md:** budgeten och siffrorna, och `smaprat` i scenariolistan.
- **`script.js`:** överst, `CHATTER_REPLY`, `CHATTER_ENOUGH` och delen `'chatterReply'`.
- **`notes/integration.md`:** småpratet.
- **Efteråt:** flytta det här dokumentet till `features/implemented/smaprat.md` och skriv in vad
  som blev annorlunda.

## Inte nu

- **Grannen kommenterar vad Ove nyss gjorde:** hoppet i backen, tutan, frosten, Saaben som står
  snett. Krokarna finns redan (`horn.last`, `hoppbacke`, `cold`).
- **Ove börjar själv:** "Din bil står fel." till en granne vars bil står fel. Det passar spelets
  omvända upplägg.
- **Reservsvar efter typ av replik** (erbjudande, fråga, tack): behövs inte när varje replik har
  ett eget svar.
