# Burkar och straff

## Önskemålet

Kronor är bara en siffra. Det finns ingen butik och inget att köpa. Det finns visserligen en unlock() i
src/main.js:1067 och en unlocked-mängd som sparas, men ingen kod anropar unlock(). Det enda som tar kronor är
straff:
- förstörda saker: 5–20 kr
- en förstörd bil med förare: självrisk på upp till 100 kr
- KAOS I OMRÅDET: −50 kr
- STOPPAD av Škodan: −20 kr

1. Femdubbla dessa straff, så det känns lite mer i plånboken
2. Gör så att varannan plockad burk (antal burkar plockade % 2 == 0 liksom) ökar ordningen i området med 1.

Gör det i samma commit.

## Vad som gjordes (2026-10-16)

### 1. Straffen gånger fem

| Straff | Förut | Nu | Var |
|---|---|---|---|
| En sak Ove har sönder (med bilen eller en spark) | 5 + 3 per sakens `coins` (11–41 kr) | 25 + 15 per `coins` (**25–205 kr**) | `src/main.js` `onPropBroken` |
| Någons bil kvaddad av Ove (självrisk) | upp till 100 kr | upp till **500 kr** | `src/main.js` `onCarDestroyed` |
| KAOS I OMRÅDET | −50 kr | **−250 kr** | `src/game/patrol.js` |
| STOPPAD av Vita skjortans Škoda (dag 7) | −20 kr | **−100 kr** | `src/game/missions.js` (`chaser.kr`), standardvärdet i `src/game/stages.js` `goto` |

Formeln för saker är exakt fem gånger den gamla: en sak utan `coins` räknas som 2 (55 kr), en
papperskorg eller kon 40 kr, en brevlåda eller brandpost 55 kr, en parkeringsautomat 115 kr och en
bensinpump 205 kr. Definitionens "5–20 kr" var ungefärlig: den dyraste saken kostade redan 41 kr.

Som förut tar varje straff högst det Ove har (`Math.min(coins, …)`), så han hamnar aldrig under
0 kr. Texterna är desamma, bara beloppen ändrade: "Ove betalar för det han förstört: N kr",
"Ove betalar självrisken: N kr", KAOS-bannerns "· −N kr" (som förut utelämnad under 5 kr) och
STOPPAD-bannerns "· −100 kr".

P-skivans kontrollavgift (300 kr, `game/pskiva.js`) tillkom efter att önskemålet skrevs och var
inte med i listan. Den är oförändrad, eftersom en kontrollavgift redan har sitt verkliga belopp.

### 2. Varannan burk ger +1 Ordning

`collectCan()` i `src/main.js` ger fortfarande 1 kr per burk. När antalet burkar Ove någonsin
plockat (`g.cans`, sparat som `pant`, samma siffra som "Pantburkar" i Samlingen) blir jämnt efter
en burk, får mätaren +1 (`patrol.addOrdning(1)`). Räkningen fortsätter över en omladdning: med 37
sparade ger den 38:e +1. Mätarens vanliga "+1" i grönt syns vid varje sådan burk. En burk som
fyller mätaren ger ORDNING OCH REDA som allt annat som fyller den. Burkarna ger Ordning även under
en dags uppdrag (där mätaren bara hindras från att *tömmas*).

Inget annat är ändrat. `unlock()` finns kvar som förut, oanropad.

## Hur det verifieras

Ny scenariofil `tools/scenarios/burkar.mjs` (`PORT=88xx node tools/shot.mjs burkar straff`):

- **`burkar`**: fyra burkar som Ove går över med riktiga W-tryck. Varje burk ger +1 kr, och
  mätaren går +0 / +1 / +0 / +1 (med patrullen pausad, så att inget annat rör mätaren).
  Mätarens "+1" ska finnas i DOM:en, och den syns i `burk_meter.png`. Sedan nio burkar till via
  spelets egen `tickCans`, där varje jämnt antal ska ge +1. Efter det 37 sparade burkar och en
  omladdning: den 38:e ska ge +1 och den 39:e inget. Sist en burk vid 99,6 som ska ge ORDNING
  OCH REDA. 25 kontroller.
- **`straff`**: tre sorters saker sparkas sönder med J (40, 55 och 115 kr, med exakt toasttext),
  och en sak sparkas med bara 18 kr kvar (alla 18 försvinner). En trafikbil med förare får låg hp
  och rammas av Saaben med W, och Ove betalar 500 kr i självrisk. KAOS med 1000 kr ska ge −250
  kr, och KAOS med 120 kr ska ge −120 kr, med bannertexten kontrollerad. Dag 7
  (`&mission=6`): Škodan hinner ikapp Saaben, och STOPPAD ska ge −100 kr med "· −100 kr" i
  bannern. Bilder: `straff_kick`, `straff_wreck`, `straff_kaos`, `straff_stoppad`.

Regressioner som kördes efter ändringen: `story` (alla sju dagarna; den slutar på `#7 idle`, no
errors), `album`, `collect`, `patrol` och `smash`.
