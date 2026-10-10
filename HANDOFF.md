# Handoff — Saab & Run (En man som heter Ove)

Läge 2026-10-04 ~14:30, efter **fas 1 av 4**. Läs den här filen, sedan `DESIGN.md` (designbibeln
och alla kontrakt mellan modulerna), sedan `CLAUDE.md` (motorkonventioner).

## Uppdraget (användarens ord)

> Create Saab & Run (En man som heter Ove - skriv till saab_and_run__en_man_som_heter_ove):
> Omvänd Hit & Run, där du är polisen. Ove patrullerar området i sin Saab och rapporterar
> felparkeringar, men grannar avbryter honom hela tiden för att de behöver hjälp.
>
> obs: ingen cellshadad stil den här gången utan realistiskt ska det vara.

Användaren körde med **ultracode** (multi-agent-workflows för allt substantiellt). Kommunicera på
svenska. Öppna aldrig fönster — verifiera bara headless (se nedan).

## Var vi är (ungefär 15 % klart)

| fas | vad | status |
|---|---|---|
| 0 | kopia av `../bigmouth_and_run/`, `DESIGN.md`, `tools/pageshot.mjs`, topp-`CLAUDE.md` pekar på det här spelet | ✅ klart |
| 1 | realistisk PBR-renderare (`src/gfx.js`, `src/game/fx.js`, `src/game/markers.js`, `assets/`) | ✅ klart |
| 2 | innehåll: värld, bilar, personer, UI + ljud (4 agenter parallellt) | ⏸ pausad ungefär halvvägs (ui klart), se "Fas 2 — PAUSAD" nedan |
| 3 | spelmekanik (patrull, smitare, avbrott) + de sju dagarna (story) | ⏳ utkast: `handoff/phase3-gameplay.workflow.js` |
| 4 | granskning & polish (visuellt, QA, svenska/Ove-ton, buggar, prestanda) | ❌ ej skriptad (se nedan) |

**Just nu** är spelet fortfarande *Bigmouth & Run* till innehåll och spelmekanik (amerikanska
hus, tecknade monster, Nick, Shame-mätaren, gamla HUD:en på engelska) men renderat med den nya
realistiska motorn: låg vintersol (13°), CC0-HDRI (`passendorf_snow`), kaskadskuggor, GTAO,
ACES, snötäcke på allt uppåtvänt, triplanar-texturer. `story` och alla scenarier går fortfarande.
Kontaktark: `out/phase1_sheet.png`.

### Fas 1 i siffror
- Byggd + 2 art director-granskningar + 2 fixrundor (4 h 10 min, ~1,8 M subagent-tokens).
  Betyg 5/10 → 5/10 (andra granskningen: "grunden är sund och på sina håll övertygande";
  den sista fixrundan åtgärdade alla 10 blocking/major-punkter, men **ingen tredje granskning
  har körts**).
- 60 fps (vsync) i 1280×720 på RTX 4070, ~1 600 draw calls (~785 i skugg-/AO-förpasset),
  2,9 M trianglar, 4,6–6,5 ms CPU. `?lowgfx` / `setQuality('low')` finns.
- 24 MB CC0-assets i `assets/`, alla listade i `assets/LICENSES.md`; `tools/textures.py`
  återskapar de packade texturerna.

### Kvar att ta hand om från fas 1 (svagheter enligt sista fixagenten)
- Bilkroppar är fortfarande lådor (fas 2 bilar löser). Lackens fejkade krökning förutsätter att
  bilmeshen har origo i bilens mitt på marken.
- Häckar är ico-sfärer (ska vara lådor i `'hedge'`), skogen på kullarna är bara en shader-effekt,
  skyltfönster speglar fotots trädlinje, fogsnön på plattor lite kritig på nära håll, biografens
  lila fasad (allt detta är världsinnehåll → fas 2 värld).
- Trianglar drivs av instansade props (staketbrädor ~134k, mynt ~90k, lyktstolpar ~66k).
- **`story`-testet är flakigt:** ibland startar ett uppdrag aldrig (den enda E-tryckningen i
  `startMission` verkar missas). Inte orsakat av fas 1 — samma fel i en kopia med gamla filer.
  Fas 3-skriptet ber E1 fixa det i `tools/shot.mjs`.
- Fas 1 rörde `src/world/town.js` (asfaltsfärger, `spruce`/`hedge`/`hillside`, inga glintstavar).
  Världsagenten i fas 2 ersätter filen; lärdomarna står i `DESIGN.md` 10.2 och 10.10.

## Hur du fortsätter

**Git (från 2026-10-10):** spelmappen är ett git-repo (gren `develop`). Commita efter varje tillbakakopiering från en agent.

### Fas 2 — ÅTERUPPTAGEN 2026-10-09 (ny session, utan Workflow-verktyget)
Datorn startades om 10-09, så scratchpad-kopiorna (och de halvgjorda fixarna för folk/bilar) är
borta. Granskningarna finns kvar i journalen ovan. Nu körs stegen som enskilda bakgrundsagenter
(Agent-verktyget) i en **beständig** work-katalog: `/home/ran/src/html/everything_and_run/.wt/saab_work`
(`world|cars|people`, `browserslot`, backup `game_before_phase2_resume.tgz`).
- `main.js` har nu en TILLFÄLLIG bro (`OLD_LM`, gamla landmärkesnamn → nya) så att spelet bootar i
  `GAME` igen (`start`: 59 fps, inga fel). Fas 3 tar bort den.
- `tools/shot.mjs` laddar områdesägda scenarier från `tools/scenarios/<område>.mjs` (se README där)
  och respekterar `OUT=<katalog>`.
- Kedjor kvar: cars fix r1 → r2 → fix r2 → r3; people fix r1 → r2 → fix r2 → r3; world r2 → fix r2 → r3.
  Status per steg loggas i tabellen nedan.

| steg | status |
|---|---|
| cars fix r1 | ✅ klar 19:2x, tillbakakopierad (Saab ombyggd mot foto, lack/lampor/glas/skyltar/buss/LOD/flykt-vakthund/släp/acceleration) |
| cars review r2 | ✅ 5/10, kontrakt ok (Saab fram/bak, tvåfärgad lack, bromsljus, Golf, tomma kupéer, flykt-AI) |
| cars fix r2 | ✅ klar 22:50, tillbakakopierad (Saab fram/bak, asfaltreflektion, lampor, Golf, kupéer, flykt-AI 0 fast i 9 körningar, taxiskyltar, tyngre fysik) |
| cars review r3 | ✅ 6/10: platta paneler blir silver i solen, Saab från jaktkameran, Golf, Audi, för rena bilar, flykt/jakt-AI |
| cars fix r3 (extra) | ✅ klar 10-10 00:40, tillbakakopierad: konvexa sidor + matt baslack, Saab-glashus/baklucka/droppränna, Golf, Audi, märkesnamn i krom (inga logotyper), vägsmuts, flykt/jakt-AI (jagaren når fram 7–23 s), pullover på körbanan |
| people fix r1 | ✅ klar 20:20, tillbakakopierad (händer, ansikten/åldrande, klädklippning, Ove, telefon, Parvaneh, filt, katt, barn) |
| people review r2 | ✅ 6/10, kontrakt ok (ansikten/porträtt blocking; kvinnoansikten, hår, katt, händer/grepp, Vita skjortans skjorta, halsar) |
| people fix r2 | ✅ klar 21:55, tillbakakopierad (ansiktstexturer per karaktär, kvinnoansikten, hår, katt, händer/penna, skjorta+slips, kofta, blinkningar, st.carry/st.work) |
| people review r3 | ✅ 6/10 ("hög sexa"): carry/work oanvända i spelet (→ systems fix r1), ögon/bryn/hud/öron, porträttljus, hår, katt, barnansikten, Anders solglasögon |
| people fix r3 (extra) | ✅ klar 23:55, tillbakakopierad: ögon/lock/iris, målade bryn, öron, hår (ingen vit Fresnel), katt ombyggd + hold(), barnansikten, Anders solglasögon, spade/skiftnyckel, löpsteg, idle/talk; main.js kattoffset −0.14 borttagen av orkestreraren |

**Till fas 4:** camera.js ska använda trädens crownR/crownBottom (world.md "For main.js"); fx.exhaust med alpha/storlek (bilar); hudens hud/skin wrap+sheen i gfx.js (people); granar på 13–25 m är fortfarande staplade koner; drone_nw 8.48 M tris (folk 1.5 M, bilar 1.4 M). **Sett av orkestreraren:** kameran fastnar bakom Runes rampräcke/lyktstolpe när Ove skjuter rullstolen (errand_rune_push); vintergröna häckar ser svarta och brusiga ut på 5–15 m i spelet; snötraktorn i Oves lot är en låda; granar på 2–6 m ser ut som våningar.
| world review r2 | ✅ 7/10, kontrakt ok, 7 major (träd på avstånd, snö, häckar, granar, springa i kullarna, takdetaljer, tom asfalt) |
| world fix r2 | ✅ klar 20:55, tillbakakopierad (kronor, snö, häckar, granar, springan, takdetaljer, fyllda ytor; surfaceAt/roadNames/camBlocks; `validate` grön) |
| world review r3 | ✅ 7/10 (arkitektur ~8, vegetation ~5), kontrakt ok; plåttak-bugg, 10–13 M tris |
| world fix r3 (extra) | ✅ klar 23:35, tillbakakopierad: kronor alfablandade, granar med kärna + kort, björkar, platta tak, snö, 3–8 M tris (var 10–13 M); kvar: granar på 2–6 m, snötraktorn i Oves lot är en låda |
| **fas 3a systems (E1)** | ✅ klar 20:40, tillbakakopierad; fritt läge spelbart, alla scenarier utan fel. Startad 10-09 18:50 parallellt, i `saab_work/systems` (äger main/input/patrol/interruptions/stages/pickups/peds/camera/missions/shot.mjs + UI-filerna; `refresh-systems.sh` drar in andras filer) |

| fas 3b story (E2) | ✅ klar 22:20, tillbakakopierad: sju dagar, `story` → `#7 idle`, m1 med riktiga tangenter; OLD_LM borta. Startad 10-09 20:45 i `saab_work/story` (äger missions.js, README, CLAUDE.md, story.mjs; får röra main/stages/patrol/interruptions + UI-filer vid behov) |
| fas 3a QA r1 | ✅ 6/10 (Ove ramlar mot parkerade bilar, bilar knuffar liggande/barn/Rune, kamera i träd/huvud, Ordning-dränering som nedräkning + 13 minor) — systems fix r1 startar när story landat |

**Till story fix r1:** dag 3:s element-holdAt `work: 'wall'` (ta bort `pose: 'push'`), dag 7:s grav-holdAt `work: 'low'`.

| systems fix r1 | ✅ klar 23:45, tillbakakopierad: alla QA-majors + minors, UI-rester, porträttljus, carry/work, fast skylt SAB 900; DESIGN §4 uppdaterad |
| story QA r1 | ✅ 6/10: dag 7-jagaren kör ifrån, dag 5-racet ovinnbart, katten för lätt, dag 1-outro filmar vägg, finalens tidshopp, dag 2-kontinuitet, samtalstempo + 11 minor |
| story fix r1 | ✅ klar 01:55, tillbakakopierad (jagare, race 9/9, dag 1-outro, finalens tidshopp, katt, pacing + alla minor; nya no-warp-tester). `story` i GAME: `#7 idle`, 60 fps, inga fel. Backup: `game_after_phase3.tgz`. Startad 10-10 00:15 i `saab_work/story` (drivers.js-delen av jagaren → cars fix r3) |
| world fix r4 | ✅ klar 01:25, tillbakakopierad (landmärken + Akut-uppfart, trädkronor i kollisionsdata, rampräcke/lyktstolpar i camBlocks, lövkort-häckar, traktor, granar; drone_nw 8.48 M tris). Var: landmärken dealerFinish/adrianBay/graveFlowers/hospitalDrop, trädkronor + rampräcke för kameran, häckar på mellanavstånd, snötraktor, granar nära |

**FAS 4 startad 10-10 02:00:** fem parallella granskare i `saab_work/qa` (läser bara): art director (8841), svenska/ton (8842), kod (8843), prestanda (8844), ny spelares genomspelning (8845). Fynd taggas med ägare → fixare per ägargrupp. Svenska/ton ✅ 8/10 (`reviews/p4_lang.json`). De andra fyra stoppades av API-veckogränsen ~03:00 och återupptogs med SendMessage (samma transkript). Resultat: art 6, kod 6, prestanda **4** (laptop), svenska 8, genomspelning 6. Fynd per ägare: `reviews/p4_owner_<ägare>.json`.

| fas 4-fix | status |
|---|---|
| rendering (gfx/fx/markers + world/town.js, batch.js; auto-kvalitet, batching, pre-pass, laddning, avgaser, svärta, snö) | ✅ landad 14:42 (start 1375 → 493 draw calls, JS-buffertar 473 → 233 MB). Regressionen (story-flikkrasch vid dagövergång: testets raycasts loopade över frisläppta arrayer i batcharna) fixad i d42e414 |
| värld (häckar, adventsstjärna/lampor, kyrkogårdsgrind, planteringar, snögubbe, kvistkort, 2 texter) | ✅ klar ~06:30 (loft-ändlock stängda = skåran, `kit.glow` under bloom-tröskeln, grind, granris-plantering, snögubbe, kvistkort tonas 9–20 m, anslagstavlan vänd rätt) |
| bilar (instansade LOD-kroppar, sovande bilar, Car.dispose, förvärmning, hjulhusflik, avgaser) | ✅ klar ~07:40: bil-draw calls ungefär halverade (start 316 → 134), 137/159 bilar sover, `car.dispose()` + `warmCars()` (main.js ska anropa — gameplay A) |
| folk (runtime-LOD, ansikten, Jimmys luva, knäböj) | ✅ klar ~06:00: THREE.LOD per person (folk 7.05 → 2.14 M tris summerat över 6 poser), oljekarta/relief/köldrodnad, tre unga män åtskilda, `st.kneel` + `kneelPoint`. OBS: hudshadern använder gfx.js-interna (`gBump`, `TRI_SPECK` …) |
| gameplay B (story/filmkamera/tid på dygnet/dag 6/kontinuitet; `reviews/p4_gameplay_B.json`) | ✅ landad 14:36 (commit 8281a67) |
| gameplay A (robusthet, input, save, UI/titel, småprat, loop-prestanda, docs; `reviews/p4_gameplay_A.json`) | startad ~16:10 i `saab_work/systems`. Ska även: koppla Grafik-knappen till setQuality auto/high/low (se reviews/p4_fix_render.md), uploadGeometry()+precompile() vid 'Tar porträtt', car.dispose() i removeCar, broadphase som hoppar över sovande bilar, giveUp-knapp |

Granskningar sparas som JSON i `saab_work/reviews/<område>_review_rN.json`.

### Fas 2 — PAUSAD 2026-10-07 (användaren nära 5h-taket)
Läge vid paus (journal: `~/.claude/projects/-home-ran-src-html-everything-and-run-saab-and-run--en-man-som-heter-ove/ecf3e0dc-d8e2-438f-8144-5af90560e3cc/subagents/workflows/wf_49d099bc-25a/journal.jsonl`):

| område | klart | betyg | avbrutet mitt i |
|---|---|---|---|
| ui | bygg, r1, fix, r2, fix, r3 (kedjan klar) | 7 → 7 → **8** (2 blocking/major kvar i r3) | — |
| world | bygg, r1, fix r1 (tillbakakopierad) | 6 | review r2 |
| people | bygg, r1 | 5 (kontrakt ofullständigt, 10 blocking/major) | fix r1 (halvgjort i `<work>/people`, ej tillbakakopierat) |
| cars | bygg, r1 | 4 (8 blocking/major) | fix r1 (halvgjort i `<work>/cars`, ej tillbakakopierat) |

Spelet (`GAME`) har alla fyra byggena plus world fix r1 och ui:s båda fixar; `notes/*.md` finns.
**Återuppta i samma session:** `Workflow({ scriptPath: '<…>/handoff/phase2-content.workflow.js',
resumeFromRunId: 'wf_49d099bc-25a', args: { work: '<work-katalogen nedan>' } })` (samma args,
annars ingen cache). Klara anrop returneras från cache, och de tre avbrutna körs om från början
(i sina befintliga kopior). **I en ny session:** kör bara de saknade stegen för world/people/cars
(t.ex. en nedbantad kopia av skriptet utan ui, där people/cars börjar med fix r1, med r1-
granskningarna från journalen inklistrade, och world börjar med review r2).

Startad med run-id `wf_49d099bc-25a`, work-katalog
`/tmp/claude-1000/-home-ran-src-html-everything-and-run-saab-and-run--en-man-som-heter-ove/ecf3e0dc-d8e2-438f-8144-5af90560e3cc/scratchpad/saab_work`
(privata kopior `world|cars|people|ui`). Backup av spelet före fas 2: `game_before_phase2.tgz` i
samma scratchpad. Ändringar i skriptet: 3 granskningar (fix efter de två första, den tredje
sätter bara slutbetyg) och `<work>/browserslot`, en flock-spärr som tillåter högst två headless-
webbläsare samtidigt (maskinen har bara ~5 GB ledigt RAM). Skapa om den om work-katalogen
försvinner; skriptet förutsätter att den finns. Om sessionen dör: en ny session kan inte återuppta
run-id:t (det gäller bara i samma session). Titta i stället på vilka filer som redan kopierats
tillbaka till spelet och på `notes/*.md`, och kör de kedjor som saknas.

### Fas 2 — innehåll (4 parallella kedjor: bygg → granska → fixa, 3 granskningar)
Kräver att användaren har slagit på ultracode / bett om en workflow. Kör:

```
Workflow({
  scriptPath: '/home/ran/src/html/everything_and_run/saab_and_run__en_man_som_heter_ove/handoff/phase2-content.workflow.js',
  args: { work: '<din scratchpad-katalog>/saab_work' }
})
```

- Varje område jobbar i en **privat kopia** (`<work>/world|cars|people|ui`, med symlänkade
  `node_modules` och `assets`) så att allas tester bootar, får göra slit-och-släng-ändringar i
  andras filer *i sin kopia*, och kopierar bara tillbaka sina egna filer (exakta kommandon finns i
  skriptet) + en anteckningsfil `notes/<område>.md` med API/avvikelser.
- Portar: world 8802, cars 8803, people 8804, ui 8805; granskare +10/+20.
- Ägarskap: se `DESIGN.md` §11. Bilagenten skapar `tools/cars.html`, personagenten
  `tools/people.html` (skärmdumpas med `tools/pageshot.mjs`).
- Förväntad tid: flera timmar (fas 1 tog ~4 h för *ett* område med 2 varv; här körs fyra
  parallellt). Efteråt bootar spelet troligen **inte** i `GAME` (gamla `main.js` refererar gamla
  landmärken/karaktärer) — det är väntat, fas 3 kopplar ihop allt.
- Efter fas 2: läs `notes/*.md`, titta på skärmdumparna i `<work>/*/out/`, och justera fas 3-
  skriptets promptar om något kontrakt ändrats.

### Fas 3 — spelmekanik och story (sekventiellt i `GAME`)
`handoff/phase3-gameplay.workflow.js` (utkast, kör utan `args`): E1 (systems: `main.js`,
`patrol.js` ersätter `shame.js`, `interruptions.js`, pickups, input, kamera, `shot.mjs`) → QA →
fix, sedan E2 (de sju dagarna i `missions.js`, `story`-test, README på svenska, spelets
`CLAUDE.md`) → QA → fix. Kriterium: `PORT=88xx node tools/shot.mjs story` slutar med
`#7 idle` och `no errors`.

### Fas 4 — granskning & polish (att skriva)
Förslag: parallella granskare med olika linser — (1) art director över hela spelet (värld +
bilar + folk + UI tillsammans, mot DESIGN §2), (2) QA som spelar fritt läge och alla uppdrag med
riktiga tangenttryck, (3) svenska språket och Oves ton i all dialog/UI, (4) kodgranskning för
buggar, (5) prestanda (fps, draw calls; peds/props/bilar) → dedup av fynd → fixare per
filägargrupp (en i taget eller med disjunkt ägarskap) → slutverifiering (`story`, `start`,
skärmdumpar). Sist: uppdatera topp-`CLAUDE.md` om ett nytt spel skapas senare (den pekar redan
på det här).

## Testning (gäller alla)
- Aldrig synliga fönster. `cd GAME && PORT=88xx node tools/shot.mjs <scenarier>` (headless
  Chrome, riktig GPU, PNG i `out/`), `tools/look.mjs` (kameravyer utan spel, se `CLAUDE.md`),
  `tools/pageshot.mjs <sida.html> [prefix]` (fristående testsidor). **Alltid egen PORT** så
  parallella körningar inte krockar.
- Läs PNG:erna själv och bedöm mot `DESIGN.md` §2.
- `?test=1` hoppar över titeln; `window.__game`, `__lm`, `__props`, `__stats()` finns.

## Användarens preferenser som spelar roll här
- Svenska i kommunikationen och i allt spelarvänt. Kod/kommentarer/CLAUDE.md på engelska.
- `uv`, inte pip, om Python behövs.
- Börjar ett meddelande med `q` är det bara en fråga — implementera inget.
- "ESPFEIT" = en subagent per feature, en i taget.

## Startprompt för en ny session (klistra in)

> Läs `/home/ran/src/html/everything_and_run/saab_and_run__en_man_som_heter_ove/HANDOFF.md` och
> fortsätt med fas 2 (ultracode).
