# Resten av replikerna

I featuren `a_fully_voiced_game.md` röstsatte vi alla Oves repliker och allt de andra säger fram
till och med dag 1: 125 av 354 repliker (35 %). Spela in resten.

Designen, verktyget och uppspelningen finns redan och beskrivs där. Den här featuren lägger bara
till röster och klipp. Siffrorna nedan är räknade 2026-10-11. Uppdatera dem när den första
featuren flyttas till `features/implemented/`.

## Det som återstår

- **229 repliker, ungefär 8 800 tecken:**
  - dag 2–7 utom Oves repliker
  - grannarnas småprat efter dag 1 (`CHATTER`, `CHATTER_AFTER`)
  - telefonsamtalen och ärendena
  - statisternas och smitarnas repliker (`OUCH`, `GETUP`, `CARJACK`, `KICKED`, `SHOVED`,
    `SHOVED_KID`, `PANIC`, `FLEE_LINES`, `CAUGHT_LINES`)
- **Nya roller att besätta** (avsnitt 4.1 och 4.2 där): Anita, Rune, Jimmy, Adrian, Anders och Vita
  skjortan.
- **Statisternas pool** (avsnitt 4.3 där). Hur stor den blir beror på kontots röstplatser.
- **Barnen**, om de blev mummel i första versionen (avsnitt 4.4 där).

## Stegen

1. Läs vad som står om första versionen i `features/implemented/a_fully_voiced_game.md`: vad
   som gick bra, vilka röster och inställningar som valdes, och vad som blev kvar.
2. Besätt de nya rollerna och poolen med `make voice-cast` och provlyssningssidan.
3. Ta bort `scope` i `tools/voice/cast.json`.
4. `make voice DRY=1`. Kolla siffrorna och saldot. Sedan en pilot per ny roll
   (`make voice WHO=anita LIMIT=3`), lyssna, och sedan `make voice`.
5. Gå igenom granskningslistan på provlyssningssidan.
6. Kör `story` med `&voice` och `vcut` på alla sju dagar.

## Kostnad (grovt)

Ungefär 15 000–19 000 credits: 8 800 för replikerna, 5 000–8 500 för statisternas varianter (8–14
poolröster) och omtagningar. Röstdesignen kommer till, och vad den kostar rapporteras inte.
