# Resten av replikerna

I featuren `a_fully_voiced_game.md` (nu i `features/implemented/`) röstsatte vi alla Oves repliker
och allt Patrick och Parvaneh säger fram till och med dag 1: 167 av spelets 490 repliker (34 %).
Spela in resten.

Designen, verktyget, uppspelningen och musiken finns redan och beskrivs där. Den här featuren lägger
bara till röster och klipp. Siffrorna nedan är räknade med `allLines()` 2026-10-11, efter att
manuset flyttats till `src/game/script.js` och efter featurerna oppna_garaget, roligare_bilkorning
och tuta_med_bilen (de lade till repliker). `make voice DRY=1 ALL=1` räknar om dem.

## Det som återstår

- **323 repliker, ungefär 10 500 tecken:**

  | Vem | Repliker | Tecken |
  |---|---|---|
  | Anita | 45 | 2 051 |
  | Parvaneh (efter dag 1) | 35 | 1 497 |
  | Jimmy | 32 | 1 269 |
  | Patrick (efter dag 1) | 21 | 1 057 |
  | Anders | 20 | 977 |
  | Adrian | 25 | 946 |
  | Vita skjortan | 18 | 711 |
  | Sara (allt, även småpratet före dag 1) | 18 | 499 |
  | Rune | 9 | 56 |
  | Nasanin (allt) | 11 | 88 |
  | statisterna: `ped` 41, `ped_kid` 8, `ped_old` 4, `ped_teen` 3 | 56 | 822 |
  | förare och smitare (`driver`) | 23 | 428 |
  | fönster (`window`) | 4 | 68 |
  | grannarna i delade tabeller (`cast`) | 6 | 78 |

  - Det är dag 2–7 utom Oves repliker, grannarnas småprat efter dag 1 (`CHATTER`,
    `CHATTER_AFTER`), telefonsamtalen och ärendena, tutans repliker (`HONK_*`) och statisternas
    och smitarnas repliker (`OUCH`, `GETUP`, `CARJACK`, `KICKED`, `SHOVED`, `SHOVED_KID`,
    `PANIC`, `FLEE_LINES`, `CAUGHT_LINES`).
  - Oves repliker i allt detta är redan inspelade.
- **Nya roller att besätta:** Anita, Rune, Jimmy, Adrian, Anders och Vita skjortan (avsnitt 4.1 och
  4.2 där). Patrick och Parvaneh har redan sina röster.
- **Statisternas pool** (4.3 där): `ped`, `ped_kid`, `ped_old`, `ped_teen`, `driver`, `window`.
  `voice.voiceFor(ch)` ger i dag bara `ped` eller `ped_kid`. Den behöver lära sig ålder, kön och en
  röst per statist ur dess slumpfrö (och förarens röst för en bil).
- **Barnen** (4.4 där). Voice Design vägrar barnröster (HTTP 403), och Voice Library har inga. De
  mumlar och fnissar. Vill ni ha riktiga barnröster är det inspelningar (väg b) som gäller.

## Stegen

1. Läs avsnittet "Det här gjordes" i `features/implemented/a_fully_voiced_game.md`: rösterna som
   valdes och varför, kontot (10 av 10 egna röstplatser upptagna, Voice Library tar ingen plats),
   priserna och det som blev kvar.
2. Besätt de nya rollerna med `make voice-cast WHO=anita SEARCH=6` och provlyssningssidan
   (`make voice-review`). Kandidaterna läggs till från Voice Library. Dialekterna i 4.1 finns
   delvis där (norrland, göteborg, skåne, stockholm).
3. Ta bort `scope` i `tools/voice/cast.json`, eller lägg till delar i den.
4. `make voice DRY=1`. Kolla siffrorna. Sedan en pilot per ny roll (`make voice WHO=anita
   LIMIT=3`), lyssna, och sedan `make voice`.
5. Gå igenom granskningslistan på provlyssningssidan.
6. Kör `vstory` och `vcut` (`tools/scenarios/voice.mjs`) på alla sju dagarna.

## Kostnad (grovt)

- **Replikerna:** ungefär 10 500 tecken.
  - Med `eleven_v4` i dag (rabatt till 12 oktober, uppmätt 0,13–0,14 credits per tecken) blir
    det ungefär 1 500 credits.
  - Till fullpris (inte uppmätt; v3 kostade 1 credit per tecken) blir det ungefär 10 500 credits.
- **Statisternas varianter:** ungefär 1 400 tecken per poolröst, gånger antalet röster.
- **Omtagningar:** några procent. Taligenkänningen körs lokalt och är gratis.
