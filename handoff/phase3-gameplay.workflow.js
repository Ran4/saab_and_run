export const meta = {
  name: 'saab-phase3-gameplay',
  description: 'Saab & Run phase 3: gameplay systems (patrol, smitare, avbrott, main integration) then the seven story missions, each with QA',
  phases: [
    { title: 'Systems', detail: 'E1: main.js integration, patrol, pursuit, interruptions, pickups' },
    { title: 'Systems QA', detail: 'play-test review + fix' },
    { title: 'Story', detail: 'E2: seven missions + story test + docs' },
    { title: 'Story QA', detail: 'play-test review + fix' },
  ],
}

// DRAFT written at the end of phase 1. Before running it, read GAME/notes/*.md (phase-2 API
// notes) and adjust the prompts if phase 2 changed any contract. Works directly in GAME
// (sequential, nobody else is editing).

const GAME = '/home/ran/src/html/everything_and_run/saab_and_run__en_man_som_heter_ove'
const PRE = (port) => `You are working on "Saab & Run — En man som heter Ove" in ${GAME} (GAME): a reversed Simpsons Hit & Run where you are Ove, patrolling his Swedish row-house area in his Saab and reporting illegally parked cars while the neighbours keep interrupting him. Plain three.js ES modules (r186), no build step, realistic PBR look. Read first: GAME/DESIGN.md (design bible + all module contracts), GAME/CLAUDE.md (engine conventions), and GAME/notes/*.md (API notes from the world, cars, people and UI agents of phase 2 — they override DESIGN.md where they differ). You are alone in GAME right now and work directly in it.
Testing: never open a visible window; only \`cd ${GAME} && PORT=${port} node tools/shot.mjs <scenarios>\` (headless, real GPU, PNGs in out/). Always PORT=${port}. Read the PNGs yourself. Keep ~60 fps and no console errors. All player-facing text Swedish; Ove's voice per DESIGN.md section 3.`

const QA_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '1-10 how complete, bug-free and fun this is' },
    verdict: { type: 'string' },
    issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'major', 'minor'] }, area: { type: 'string' }, problem: { type: 'string' }, repro: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'area', 'problem', 'fix'] } },
  },
  required: ['score', 'verdict', 'issues'],
}

const E1 = `${PRE(8806)}

YOUR JOB (phase 3a, systems): make the game a game again on top of the new world, cars, people and UI. You own src/main.js, src/input.js, src/game/patrol.js (new; remove src/game/shame.js and its imports), src/game/interruptions.js (new), src/actors/pickups.js, src/actors/peds.js, src/game/camera.js, tools/shot.mjs; you may make small fixes in other files when integration requires it (note them in notes/integration.md).
1. main.js integration: new cast and HOMES (NPCs at the world's landmarks per DESIGN.md 6; Rune in his wheelchair at runeHouse with Anita), player = Ove starting at oveHouse, the named cars (saab, patrickCar with trailer, runeVolvo, andersAudi), traffic with the new car types and busts, Swedish pedestrians, MAP_LABELS in Swedish, CHATTER/OUCH/GETUP/CARJACK lines in Swedish in Ove's world (neighbours greet or nag Ove; pedestrians hit by a car say "Aj!", "Är du inte klok?!" etc.), collectibles (7 Saab-emblem + 7 Sonjas fotografier at collectibleSpots, each with a short memory toast), pantburkar (cans as kronor) at litterSpots, kronor everywhere coins were, save key 'saab-and-run-v1', on-foot movement per DESIGN.md 4.4 (walk 3.2, rask gång 5.5, one small jump, no double jump/stomp, J = sparka på däcket with comments), the in-game clock (from 06:00), headlights on, footsteps audio, camera tuned for a realistic feel (chase cam a bit lower and further back).
2. input.js: add the 'report' action (KeyF, gamepad B), keep the rest (DESIGN.md 4.6).
3. patrol.js (DESIGN.md 4.1 and 4.2): violations from violationSpots (~8 active, random types/colours/plates, car.violation), minimap 'violation' markers and hud.tags within ~35 m, hold-F reporting with hud.notebook + audio.pen/stamp (cancelled by moving away, speeding up, or an incoming call), rewards, reported cars leaving out of sight and respawning elsewhere, ~25% smitare (0% while a mission's report stage says so) fleeing with AI 'flee' -> pursuit with hud.setPursuit, ramming/proximity depleting motstånd, 'pullover' + hazards + TAGEN!, SMET! when they get away; the Ordning meter with every rule in 4.2 (including Anders shouting when Ove himself drives inside the car-free zone), KAOS I OMRÅDET and ORDNING OCH REDA events. Expose an API for missions: patrol.forceSpawn(n, nearLandmark, { smitare: false }), patrol.onReport(cb), patrol.pause(bool), patrol.reportsSince(t).
4. interruptions.js (DESIGN.md 4.3): the scheduler (free roam only; missions can call interruptions.radioOnly(who, text) for flavour), phone ring + hud.incomingCall + two lines + Ove's grumpy answer, cancels an in-progress report, the nine errand templates built from small reusable stage objects (goto, holdAt with a progress bar on hold-E, fetch, pickup/dropoff of an NPC or kid, catchCat, follow-me escort for Rune), hud.setErrand with the patience timer, rewards/penalties, one at a time. Make the stage objects importable so missions.js (phase 3b) can reuse holdAt/fetch/catchCat/parkIn-style stages, or put shared stage kinds in src/game/stages.js.
5. Keep the old missions.js running for now only as far as needed to not crash (phase 3b rewrites it); free roam must be fully playable.
6. tools/shot.mjs: the old 'story' run was flaky at the end of phase 1 (a mission sometimes never starts: the single E tap in startMission seems to miss — likely a frame/input race); make starting missions robust (e.g. retry the tap until missions.state changes, or call the interact path directly). Update scenarios to the new game (start, views of all landmarks, drive, walk, talk, smash, chaos -> rename 'patrol', traffic, cruise, title) and add: 'report' (walk to a violation, hold F, check +1 anmälan and Ordning), 'pursuit' (force a smitare, ram it until TAGEN!), 'interrupt' (force an avbrott while writing a report: check the report is cancelled and the errand completes via debug warps), 'collect' (pick up an emblem/photo/cans). Print [t] log lines with the relevant state.
Iterate with screenshots until free roam plays well. Final message: what works, scenario outputs, known gaps.`

const E1QA = (round) => `${PRE(8816 + round)}

You are a demanding QA lead / game designer play-testing phase 3a (free-roam systems) of the game. Don't edit files. Read DESIGN.md sections 4 and 6 and the code (src/main.js, src/game/patrol.js, src/game/interruptions.js, pickups.js), run the scenarios (start, report, pursuit, interrupt, collect, patrol, traffic, talk, views) with PORT=${8816 + round}, read the screenshots and [t] logs, and write your own throwaway puppeteer checks if needed (e.g. evaluate state over time). Look for: crashes/console errors, rules from DESIGN.md 4.x not implemented or wrong, stuck states (can't report, pursuit never ends, errand impossible), NPCs/cars in walls or floating, UI not updating, balance problems (meter drains too fast/slow), Swedish text errors, things that aren't fun. Round ${round}. Return a score and prioritised concrete issues with repro and fix.`

const E2 = `${PRE(8807)}

YOUR JOB (phase 3b, story): rewrite src/game/missions.js as the seven days of DESIGN.md section 5, on top of the phase-3a systems (read src/game/patrol.js, interruptions.js / stages.js and notes/integration.md first). You own src/game/missions.js, tools/shot.mjs (story part), README.md and CLAUDE.md of the game; small fixes elsewhere are OK when needed (note them in notes/integration.md).
- New stage kinds: parkIn (stop inside a landmark box w x l with heading tolerance ~20 deg, optional trailer: the trailer must be inside, optional reverse-only; clear on-screen guidance), report (N reports via patrol.forceSpawn near a landmark, smitare off in the tutorial), holdAt, fetch, catchCat, and goto's chaser option (Vita skjortan's Škoda hunting you in the finale like Hit & Run cops; contact = a short stun/penalty, not instant fail unless you choose bustFails for the finale). Re-theme getInCar/goto/pickup/dropoff/race/destroy/grab.
- Dialogue: Swedish, in the voices of DESIGN.md section 3 (Ove terse and grumpy, secretly kind; Parvaneh warm and pushy; Patrick apologetic; Jimmy cheerful; Anita gentle; Rune mostly silent; Anders smug; Vita skjortan bureaucratic). Funny, with the book's spirit, no suicide content. Mid-mission radio lines from neighbours interrupting Ove (the theme), especially in day 7 ("INTE NU!").
- Rewards in kr, unlocks if any (e.g. after day 5 Adrian's newly bought Saab appears; after day 7 the end banner OMRÅDET ÄR I ORDNING and free roam continues).
- tools/shot.mjs 'story': plays all seven missions via debug warps (like the old one did) and must end with '#7 idle' and 'no errors'; FROM=n support; screenshots at key moments. Also scenario 'm1' for the trailer parking (prove it can actually be reversed into the box with real inputs, not only warps).
- README.md (Swedish, player-facing: what the game is, how to run (make run), controls, the systems, the seven days, code map, headless tests, CC0 asset credits pointing to assets/LICENSES.md, "inte associerad med ...") and the game's CLAUDE.md (English, engine conventions updated for the new game: rendering surfaces, patrol/interruptions APIs, story test must end '#7 idle').
Final message: what works, story output, known gaps.`

const E2QA = (round) => `${PRE(8826 + round)}

You are a demanding QA lead / narrative designer play-testing phase 3b (the seven story missions) of the game. Don't edit files. Read DESIGN.md section 5 and src/game/missions.js; run \`story\` (and FROM=n story, m1) with PORT=${8826 + round}; read screenshots and logs; also try playing missions with real inputs where warps hide problems (write throwaway puppeteer checks). Look for: crashes, missions that can't be completed without warps, wrong/missing stages vs DESIGN.md 5, confusing objectives, Swedish language errors, dialogue that is off-character or not funny, pacing problems, the finale not landing emotionally. Round ${round}. Return a score and prioritised concrete issues with repro and fix.`

const fixPrompt = (port, what, c, own) => `${PRE(port)}

You own ${own}. A QA review of ${what} scored it ${c.score}/10: "${c.verdict}". Issues (most important first):
${c.issues.map((i, k) => `${k + 1}. [${i.severity}] (${i.area}) ${i.problem}${i.repro ? `\n   Repro: ${i.repro}` : ''}\n   Suggested fix: ${i.fix}`).join('\n')}
Fix all blocking and major issues and sensible minor ones; verify with the scenarios; finish with \`PORT=${port} node tools/shot.mjs story\` (must not regress: '#7 idle' + 'no errors' once phase 3b exists). Final message: what you fixed, what's left.`

async function loop(build, qa, port, what, own, phaseB, phaseQ) {
  const out = []
  phase(phaseB)
  out.push({ step: 'build', report: await agent(build, { label: `${what}: build`, phase: phaseB, effort: 'xhigh' }) })
  for (let r = 1; r <= 2; r++) {
    phase(phaseQ)
    const c = await agent(qa(r), { label: `${what}: QA r${r}`, phase: phaseQ, schema: QA_SCHEMA, effort: 'high' })
    if (!c) break
    out.push({ step: `qa ${r}`, score: c.score, issues: c.issues })
    log(`${what} QA r${r}: ${c.score}/10, ${c.issues.filter((i) => i.severity !== 'minor').length} blocking/major`)
    if (c.score >= 8 && !c.issues.some((i) => i.severity !== 'minor')) break
    out.push({ step: `fix ${r}`, report: await agent(fixPrompt(port, what, c, own), { label: `${what}: fix r${r}`, phase: phaseQ, effort: 'xhigh' }) })
  }
  return out
}

const sys = await loop(E1, E1QA, 8806, 'systems', 'src/main.js, src/input.js, src/game/patrol.js, src/game/interruptions.js, src/game/stages.js, src/actors/pickups.js, src/actors/peds.js, src/game/camera.js, tools/shot.mjs (small fixes elsewhere allowed)', 'Systems', 'Systems QA')
const story = await loop(E2, E2QA, 8807, 'story', 'src/game/missions.js, tools/shot.mjs, README.md, CLAUDE.md (small fixes elsewhere allowed)', 'Story', 'Story QA')
return { systems: sys.filter((s) => s.score != null).map((s) => s.score), story: story.filter((s) => s.score != null).map((s) => s.score), lastSystems: sys[sys.length - 1], lastStory: story[story.length - 1] }
