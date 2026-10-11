# Anteckningsboken i pausmenyn

## Önskemålet

Se anteckningsblock_bugg.png (filen pekade först på ../anteckningsbok_renderingsbugg.png).

Anteckningsblocket i pausmenyn går utanför.

Gör så själva pausmenyn blir typ 5% större, så att blocekt får plats innuti.

## Vad som blev gjort (2026-10-11)

**Felet**: pauskortet har två kolumner, menyn till vänster och Oves anteckningsbok till höger.
Anteckningsboken var låst till högst 560 px (i 1280x720-layouten). När Röster och Röstvolym kom till
blev menyn ungefär 600 px hög, och 640 px med "Avbryt dagens uppdrag" under ett uppdrag. Därför
slutade boken 40–80 px ovanför menyns nederkant, och spelet syntes under den (som i skärmbilden).

**Lösningen**: pauskortet är nu lika högt som menyn, i stället för en fast höjd som är "5 % större".
Anteckningsboken är alltid exakt lika hög som menyn, uppifrån och ned. Kommer det fler rader i
menyn växer kortet med. Det blev ungefär 7 % större i fri roaming och 15 % under ett uppdrag. Boken
scrollar inuti precis som förut, och den nyaste anteckningen syns när menyn öppnas. Kontroller-vyn
fyller samma ruta.

**Det som kom med på köpet**:
- **Linjerna följer raderna**: förut stod linjerna still när sidan scrollade, så raderna hamnade lite
  bredvid linjerna när det fanns många anteckningar. Nu scrollar linjerna med och varje anteckning
  står på sin linje.
- **Kontroller-tabellen gick också utanför**: den är ungefär 640 px bred men fick bara 548 px. I
  pausmenyn stack kolumnen "I bil" ut till höger utanför kortet, och på titelskärmen gick den utanför
  skärmkanten ("handbroms, sladd (+ gas och ratt: snurra)" klipptes). Nu radbryts de långa cellerna.
  En grå anteckning som "(+ gas och ratt: snurra)" flyttas hel till nästa rad. Tangenterna radbryts
  aldrig. Tabellen är samma på titelskärmen och i pausmenyn (pausmenyn kopierar den), så båda blev rätt.
- **Låga fönster**: under ungefär 540 px höjd slutar spelets zoom vid 0,8, och då räckte höjden
  inte till hela menyn (vid 1366x500 hamnade kortet ovanför skärmkanten). Nu drar menyn ihop sig där
  (tätare rader, lite mindre rubrik). Under ungefär 465 px försvinner tangentraden längst ned
  ("Esc P fortsätt N ljud"). Först under ungefär 435 px scrollar menyn, som en sista utväg.
- Det smala läget (fönster högst 860 px breda, med menyn ovanför boken och ett kort som scrollar)
  fungerar som förut.

**Kod**: bara `style.css`. Kortets rad är `minmax(0, 1fr)` under `max-height: 96vh`. `#pause-log`
har `contain: size`, så anteckningarna påverkar aldrig kortets höjd, och boken sträcks till menyns
höjd. `.log-page` har `background-attachment: local`. `.controls` har inte längre `nowrap` (men
`.hold` har det). Två `max-height`-mediefrågor sköter de låga fönstren. Detaljerna finns i
notes/ui.md under *Pause card layout*.

**Test**: nytt scenario `uipause` i `tools/scenarios/ui.mjs`. Det öppnar pausmenyn med 27
anteckningar (som i skärmbilden) i 15 fönsterstorlekar: 1280x720, 1366x768, 1920x1080, 1920x950
(ett maximerat fönster på en 1080p-skärm, som i skärmbilden), 2560x1440, 3840x2160, 1280x600,
1024x600, 1366x500, 1366x480, 1280x440, 1280x400, 1000x700, 800x600 och 600x800. Varje storlek
provas utan och med "Avbryt dagens uppdrag" och med Kontroller öppen, och 1280-bredderna även med en
tom bok. Scenariot kontrollerar:
- att boken och kontrollerna har exakt samma över- och underkant som menyn
- att ingen knapp i menyn är klippt
- att kortet ligger inom fönstret
- att tabellen ryms i sin panel, i pausmenyn och på titelskärmen
- att den nyaste anteckningen syns.

Till sist pausar scenariot ett riktigt spel med P och kontrollerar samma saker. Före ändringen
underkändes 33 kontroller, nu ingen ("no errors"). Jag har tittat på skärmbilderna
(de hamnar i `out/uipause_*.png`). `p4ui`, `uiabort`, `titlecheck` och `titlegone` går också igenom utan fel.
