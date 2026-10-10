# Handoff — Saab & Run (En man som heter Ove)

Läge **2026-10-10 ~16:30**. Läs den här filen, sedan `CLAUDE.md` (motorkonventioner, tester),
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
| 4 | helhetsgranskning (5 linser) → fixare per ägare | nästan klar — se nedan |

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

## Nästa steg

0. **Känd flake:** `story`:s bildkontroll för dag 6:s eftertexter slår ibland fel
   (`CHECK FAILED day 6 outro: anita … wall=true`) — `placeCast` i missions.js ställer ibland
   Anita bakom husknuten vid Runes ramp (slumpad plats). 1 av ~7 körningar 10-10. Fixa
   placeringen (pröva fler platser, kräv fri sikt) så att testet blir stabilt.
1. **Slutverifiera** i spelmappen: `story` ×2, `m1`, `start`, `title`, `talk`, `errands`,
   `rperf`/`rload` (render.mjs), `carcost`; titta på titelskärmen och några intron. Commita.
2. **Fas 4, runda 2:** kör om de fem helhetsgranskarna (art director, svenska/ton, kod,
   prestanda, ny spelares genomspelning) mot det nya läget — samma upplägg som runda 1 (läsande
   granskare i `.wt/saab_work/qa`, egen PORT/OUT, svar som JSON med `owner` per fynd), sortera
   per ägare, kör fixare med disjunkt ägarskap parallellt (gameplay-filerna i följd), verifiera,
   commita per landning. Kända svagheter att kolla extra:
   - granar på 2–6 m (våningar) och skogsbältets koner på 13–25 m;
   - props är största statiska draw call-posten (~100–200 i huvudpasset) — batcha per cell/yta;
   - Saaben känns inte omedelbart igen som 900 från jaktkameran; Golfen är kantig från sidan;
   - ansikten i porträtt/närbild är "bra CG", inte foto; håret är skal;
   - bloom från lägre mip och KTX2-texturer ej gjorda; folk saknar mellan-LOD;
   - matrisuppdateringar ~0.9 ms (bilar/folk);
   - granskarnas "minor"-punkter som inte hanns med (se fixrapporterna).
3. Om allt håller: uppdatera README/DESIGN vid behov och commita.

## Hur vi jobbar (metoden som fungerat)

- **Work-katalog (beständig, överlever omstart):** `/home/ran/src/html/everything_and_run/.wt/saab_work`
  - privata kopior per område: `world cars people render systems story qa`
    (`rsync -a --exclude node_modules --exclude assets --exclude out --exclude handoff GAME/ kopia/`
    + symlänkar `node_modules`, `assets`);
  - `browserslot` — flock-spärr, högst två av våra headless-webbläsare samtidigt (andra
    Claude-sessioner på maskinen kör egna). ALLA browserkörningar går via den:
    `PORT=88xx ../browserslot node tools/shot.mjs <scenarier>`;
  - `refresh.sh <kopia> <ägda filer…>` — drar in allt utom de ägda filerna från GAME;
  - `extract_handback.py <agent-transkript> <ut.json|ut.md>` — plockar ut en agents slutrapport;
  - `reviews/` — alla granskningar och fixrapporter; backups `game_after_phase3.tgz` m.fl.
- **Agentmönster:** en fixare per område med disjunkt filägarskap i egen kopia, exakt
  tillbakakopieringskommando i prompten, `notes/<område>.md` uppdateras; granskare läser bara
  (egen kopia `qa`, egen PORT, `OUT=out/<namn>`), returnerar JSON med `severity/owner/area/
  problem/fix`. Orkestreraren sorterar per ägare, startar fixare, verifierar i GAME och
  commitar efter varje landning.
- **Ägare:** world = `src/world/*` (utom town.js/batch.js = rendering); cars = `src/actors/
  car.js carmodels.js trailer.js drivers.js`; people = `src/actors/models.js character.js`;
  rendering = `src/gfx.js src/game/fx.js markers.js src/world/town.js batch.js`; gameplay =
  `src/main.js input.js src/game/patrol.js interruptions.js stages.js camera.js missions.js
  src/actors/pickups.js peds.js`; ui = `src/game/hud.js style.css index.html src/audio.js`.
  Gameplay-filerna delas → kör de fixarna i följd.
- **Portar:** world 8802, cars 8803, people 8804, systems 8806, story 8807, render 8851,
  granskare 8841–8845, orkestreraren 8798.
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
> och fortsätt med Saab & Run där förra sessionen slutade (fas 4: slutverifiering, sedan runda 2
> av helhetsgranskningen och fixar). Svenska i kommunikationen; commita efter varje stor ändring.
