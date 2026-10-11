# Handoff — Saab & Run (En man som heter Ove)

Läge **2026-10-11 ~07:00**. Läs den här filen, sedan `CLAUDE.md` (motorkonventioner, tester),
`DESIGN.md` (designbibeln och alla modulkontrakt) och `notes/*.md` (per område). Historiken
(fas 0–4 steg för steg) ligger i `handoff/history.md`.

## Uppdraget (användarens ord)

> Create Saab & Run (En man som heter Ove - skriv till saab_and_run__en_man_som_heter_ove):
> Omvänd Hit & Run, där du är polisen. Ove patrullerar området i sin Saab och rapporterar
> felparkeringar, men grannar avbryter honom hela tiden för att de behöver hjälp.
>
> obs: ingen cellshadad stil den här gången utan realistiskt ska det vara.

Användaren kör med **ultracode** (multi-agent för allt substantiellt). Kommunicera på svenska.
Öppna aldrig fönster — verifiera bara headless. **Commita efter varje stor ändring** (git-repo i
spelmappen, gren `develop`; användarens begäran 2026-10-10).

## Status

| fas | vad | status |
|---|---|---|
| 0–1 | kopia av bigmouth_and_run, realistisk PBR-renderare | ✅ |
| 2 | värld, bilar, folk, UI + ljud (3–5 gransknings-/fixrundor per område) | ✅ |
| 3 | spelsystem (patrull, smitare, Ordning, nio avbrott, stages) + sju story-dagar | ✅ |
| 4 | helhetsgranskning (5 linser) → fixare per ägare, två rundor + putsrunda | ✅ |

Spelet är komplett och spelbart: titelskärm, fritt läge, sju dagar, slutet ("OMRÅDET ÄR I
ORDNING") och fortsatt fritt läge. `story` slutar `#7 idle`, inga fel; `m1` backar släpet med
riktiga tangenter; ~60 fps på RTX 4070.

### Fas 4, runda 1 (2026-10-10)
Granskningar (i `.wt/saab_work/reviews/`): art 6/10 (`p4_art.json`), svenska 8 (`p4_lang.json`),
kod 6 (`p4_code.json`), prestanda 4 för en mellanklass-laptop (`p4_perf.json`), ny spelares
genomspelning 6 (`p4_play.json`). Fynd per ägare: `p4_owner_*.json`, `p4_gameplay_A.json`,
`p4_gameplay_B.json`. Fixrapporter: `p4_fix_<område>.md`.

| fix | commit |
|---|---|
| värld (häckar, lampor/bloom, grind, plantering, snögubbe, kvistkort) | i 401c538 (före git) |
| folk (runtime-LOD, ansikten, Jimmys luva, knäböj) | i 401c538 |
| bilar (instansade LOD-kroppar, sovande bilar, `dispose`, `warmCars`, hjulhus) | a2896ac |
| gameplay B (filmkamera med siktkontroll, finalen, klocka 10:30/14:30, karta N = +z, dag 6, kontinuitet) | 8281a67 |
| rendering (auto-kvalitet, batchad värld 1375 → 493 draw calls, billigare pass, svärta, fx) | a34a5fd + krasch-fix d42e414 |
| **gameplay A** (robusthet, input, save, UI/titel, kvalitetsväljare, `car.dispose`, broadphase, småprat, docs) | e82f4a6 |

### Fas 4, runda 2 + 2b (session 4cca0e8c, 2026-10-10/11)
- Dag 6:s flake fixad (`placeCast` deterministisk, inga slumpplatser) — 6aa7e2e.
- Runda 2-granskningar: art 7, svenska 8,5, kod 7, prestanda 6,5, ny spelare 7,5 (runda 1:
  6/8/6/4/6). `reviews/p4r2_<lins>.json`; per ägare `reviews/p4r2_owner_<ägare>.json`.
- Sju fixare landade via en seriell landningsgrind (tillbakakopiering → story + områdestester i
  GAME → commit): ui 5911916, cars 6694528, people ee44914, story 8dc53a2, world f0bc717,
  rendering 4139be5, systems 2fe8e3d, integration b96422f.
- Putsrunda 2b (fynd från slutverifieringen): titel-spöke över spelet, HUD över svarta kort,
  mål-raden i letterboxen, erbjudande-toasts under uppdrag, kamera under låga tak, auto-kvalitet
  som fastnade på Låg, blåare Saab, Bilhallen-skylten — a52538e, 0f6e9f5, cbf6e69; porträtt en
  per task 996f309.
- Slutverifiering (`out/final3/`): 27/27 + 4 extra gröna — story ×2 `#7 idle` / inga fel, m1,
  m5race, m7chase, m4cat, lotwalk, hospdrive, retry, giveup, start, title, titlecam, talk, report,
  pursuit, interrupt, errands, collect, smalltalk, pausemenu, quality, rautosim, rperf, rload,
  carcost. Siffror: start 387 draw calls / cpuMs 5,9; första bildrutan 8 ms; redo ~5,9 s;
  rperf loop 7–9 ms medel.

## Nästa steg (valfritt — spelet är klart)

1. **Runda 3** av de fem granskarna om användaren vill höja betygen ytterligare (samma workflow
   som runda 2: `saab-p4r2-verify-review` → `saab-p4r2-fix-land`, skripten i
   `~/.claude/projects/-home-ran-src-html-everything-and-run-saab-and-run--en-man-som-heter-ove/4cca0e8c-1d61-4e6b-b00d-2f4634f8b0df/workflows/scripts/`).
2. Kvarvarande svagheter (ingen blockerar):
   - Golfen bara delvis omformad (taket kvar på 1,48 m); Saabens bakre panel i djup skugga
     läser mörkt marinblå på tumnagelstorlek;
   - granarnas övre tredjedel visar fortfarande våningar mot ljuset; kortsprites cullas inte
     (200 m-cellerna för grova);
   - folk: långt hårs bakpanel är en skiva, grått hår lite luddigt, hårslingor aliasar på Låg,
     ansikten enkla i närbild;
   - fotkameran mot väggar bara delvis fixad;
   - `m5race`-boten (riktiga tangenter) är tidskänslig — enstaka flake;
   - laddning: 'Tankar bilarna' är en 0,5 s-task; `holdAutoQuality(2000,'curtain')` inte inkopplad;
   - medvetet bortvalt: KTX2-texturer (ingen kodare installerad), svetsade vertexar.
3. Mappen `SUGGESTIONS_DO_NOT_IMPLEMENT_UNTIL_THE_USER_SAYS_SO/` (förslag: röstsatt spel) är
   inte vår och ska inte röras/committas förrän användaren säger till.

## Hur vi jobbar (metoden som fungerat)

- **Work-katalog (beständig, överlever omstart):** `/home/ran/src/html/everything_and_run/.wt/saab_work`
  - privata kopior per område: `world cars people render ui systems story`, granskare `qa_<lins>`
    (`rsync -a --exclude node_modules --exclude assets --exclude out --exclude handoff GAME/ kopia/`
    + symlänkar `node_modules`, `assets`);
  - `browserslot` — flock-spärr, högst **tre** av våra headless-webbläsare samtidigt (andra
    Claude-sessioner på maskinen kör egna; `SLOTS=` i skriptet), `EXCLUSIVE=1` väntar in alla
    platser (för tidsmätningar). ALLA browserkörningar går via den:
    `PORT=88xx ../browserslot node tools/shot.mjs <scenarier>`;
  - `refresh.sh <kopia> <ägda filer…>` — drar in allt utom de ägda filerna från GAME;
  - `extract_handback.py <agent-transkript> <ut.json|ut.md>` — plockar ut en agents slutrapport;
  - `reviews/` — alla granskningar och fixrapporter; backups `game_after_phase3.tgz` m.fl.
- **Agentmönster:** en fixare per område med disjunkt filägarskap i egen kopia, exakt
  tillbakakopieringskommando i prompten, `notes/<område>.md` uppdateras; granskare läser bara
  (egen kopia `qa`, egen PORT, `OUT=out/<namn>`), returnerar JSON med `severity/owner/area/
  problem/fix`. En sorterare slår ihop fynden per ägare; fixarna kör parallellt och lämnar
  bara en rapport — en **seriell landningsgrind** (en agent i taget) kopierar tillbaka, kör story +
  områdets tester i GAME och commitar, eller backar och skickar till en reparatör. DESIGN.md delas:
  varje kopia har `DESIGN.orig.md`, och grinden applicerar diffen som patch.
- **Ägare:** world = `src/world/*` (utom town.js/batch.js = rendering); cars = `src/actors/
  car.js carmodels.js trailer.js drivers.js`; people = `src/actors/models.js character.js`;
  rendering = `src/gfx.js src/game/fx.js markers.js src/world/town.js batch.js`; gameplay =
  `src/main.js input.js src/game/patrol.js interruptions.js stages.js camera.js missions.js
  src/actors/pickups.js peds.js` (runda 2 delad disjunkt: story = missions/stages/camera,
  systems = resten); ui = `src/game/hud.js style.css index.html src/audio.js tools/scenarios/ui.mjs`.
- **Portar:** world 8802, cars 8803, people 8804, ui 8805, systems 8806, story 8807, render 8851,
  granskare 8841–8845, landningsgrind 8799, orkestreraren/slut-QA 8798.
- **Fallgropar vi gått i:**
  - två fixare som landar nära varandra hann inte testa mot varandras filer → kör alltid
    `story` i GAME efter varje landning (render + story gav en flikkrasch, fixad i d42e414);
  - API-veckogräns kan stoppa agenter mitt i — återuppta dem med SendMessage (transkriptet finns);
  - `Agent` med `name` öppnar tmux-paneler (tar slut på plats) — använd namnlösa bakgrundsagenter;
  - säkerhetsspärren stoppar `rm -rf $VAR/...` — använd bokstavliga sökvägar;
  - `/tmp` töms vid omstart — allt viktigt i `.wt/saab_work`.

## Testning
- Aldrig synliga fönster. `cd GAME && PORT=88xx node tools/shot.mjs <scenarier>` (headless
  Chrome, riktig GPU, PNG i `out/`, `OUT=dir`). Scenarier: shot.mjs + `tools/scenarios/*.mjs`
  (gameplay, story, cars, people, world, render) — se `CLAUDE.md`.
- `make test` = story, `make test-all` = story + nyckeltester.
- Läs PNG:erna själv och bedöm mot `DESIGN.md` §2.

## Användarens preferenser
- Svenska i kommunikationen och i allt spelarvänt. Kod/kommentarer/CLAUDE.md på engelska.
- `uv`, inte pip. Meddelanden som börjar med `q` är bara frågor. "ESPFEIT" = en subagent per
  feature, en i taget. Commita efter varje stor ändring.

## Startprompt för en ny session

> ultracode — Läs `/home/ran/src/html/everything_and_run/saab_and_run__en_man_som_heter_ove/HANDOFF.md`
> och fortsätt med Saab & Run där förra sessionen slutade (fas 4 är klar; t.ex. runda 3 av
> helhetsgranskningen och fixar). Svenska i kommunikationen; commita efter varje stor ändring.
