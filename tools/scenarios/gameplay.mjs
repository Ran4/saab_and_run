// Gameplay scenarios (phase 3a, systems): the patrol, smitare, avbrott, collectibles.
//   report     walk up to a felparkering, hold F: +1 anmälan, Ordning up, +10 kr
//   pursuit    force a smitare, chase and ram it in the Saab until TAGEN!
//   interrupt  a call comes in while Ove is writing: the report is cancelled, the errand is done
//   errands    each of the nine avbrott completes (debug warps)
//   collect    a Saab emblem, one of Sonja's photographs, a pantburk
//   patrol     the Ordning meter: drain, driving in the car-free area, KAOS, ORDNING OCH REDA
// Fix round 1 (QA r1 repros): bump (brisk walk into the Saab: no knock-down), plough (traffic stops
// for a body; Ove's car shoves it sideways), shove (a child / Parvaneh ahead of the Saab), camtight
// (tree behind the car, Anita in the camera, the garage, walls behind Ove), drain (Ordning rates),
// pausemenu (a real game: P / Esc / Fortsätt), uicheck (bubbles at the edges, banners, call card,
// stamp, pause log, snow heaps, the cat carried, work poses), portraitlight (A/B portrait light),
// audiolevels (offline: engine at full throttle vs the music, snow steps across sessions).
// Phase 4 round 2 (notes/integration.md): dilation (game time = physics at ~20 fps), errandprog (no
// shader compiles in errands), smalltalk (+ day 0, day windows, errands by day), r2checks (clock,
// kick, trailer, grave flowers, dropped errand, KAOS hold), reloadday (short intro, "Fri patrull"),
// titlekeys (Enter / Space / pad on the title, Patrick on a continued day 2), titlepose, bouquet
// (look-dev). Their failed checks count as errors. Round 2b: camroof (the chase camera under bus
// shelters, the Akut canopy, in Ove's garage).

export default ({ page, ev, shot, frames, sleep, hold, tap, until, warp, L, standBy, fresh, fps, PORT, errors = [] }) => {
  // A failed check of the phase-4 round-2 scenarios ends the run with 'N errors' (like the story's).
  const verdict = (label, ok, good = 'OK', bad = 'BAD') => { if (!ok) errors.push(`${label}: ${bad}`); return ok ? good : bad; };
  const st = () => ev(() => { const g = __game, P = g.patrol; return { ordning: +P.ordning.toFixed(1), reports: P.reports, kr: g.coins, writing: !!P.writing, pursuit: !!P.pursuit, open: P.open.length }; });
  const log = async (label, extra = {}) => console.log('[t]', label, JSON.stringify({ ...(await st()), ...extra }));

  // Walk up to the nearest open violation that is not a smitare.
  const nearestViolation = () => ev(() => {
    const g = __game, P = g.patrol, p = g.player;
    let best = null, bd = 1e9;
    for (const c of P.open) { if (c.violation.smitare) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    if (!best) best = P.forceSpawn(1, { x: p.x, z: p.z }, { smitare: false })[0];
    window.__v = best;
    return { plate: best.plate, kind: best.violation.kind, place: best.violation.place, x: best.x, z: best.z, d: +bd.toFixed(1) };
  });
  const standByCar = () => ev(() => {
    const g = __game, c = window.__v;
    if (g.playerCar) g.exitCar(true);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    // Beside the driver's door, 1.6 m out, facing the car.
    let x = c.x + fz * (c.spec.wid / 2 + 1.4), z = c.z - fx * (c.spec.wid / 2 + 1.4);
    if (!g.spotFree(x, z)) { x = c.x - fz * (c.spec.wid / 2 + 1.4); z = c.z + fx * (c.spec.wid / 2 + 1.4); }
    if (!g.spotFree(x, z)) { const s = g.freeSpot(c.x, c.z, 3, 3.6); x = s.x; z = s.z; }
    const yaw = Math.atan2(c.x - x, c.z - z);
    g.player.teleport(x, z, yaw);
    g.cam.yaw = yaw + 0.5; g.cam.pitch = 0.22; g.cam.snapNext = true;
  });

  // ------------------------------------------------------------------------------------------
  // A generic errand solver: looks at the current stage's kind and does what a player would,
  // with warps instead of walking.
  async function solveStep() {
    const s = await ev(() => {
      const it = __interrupt, a = it.active;
      if (!a) return null;
      const g = __game, s = a.stage, t = it.target();
      const n = s.npc;
      return { id: a.tpl.id, i: a.i, kind: s.kind, text: s.sub || s.text, t, phase: s.phase, needCar: !!(s.kind === 'pickup' && a.tpl.id === 'skjuts'), npcWith: n ? g.isWithOve(n) : null, inCar: !!g.playerCar, timer: +a.timer.toFixed(0), spots: s.spots?.length, si: s.i };
    });
    if (!s) return false;
    console.log('[t] errand', JSON.stringify(s));
    const t = s.t;
    switch (s.kind) {
      case 'holdAt': {
        await ev((t) => { const g = __game; if (g.playerCar) g.exitCar(true); g.player.teleport(t.x, t.z, g.player.yaw); g.cam.snapNext = true; }, t);
        await frames(4);
        const secs = await ev(() => __interrupt.stage.secs);
        await hold(['KeyE'], secs * 1000 + 600);
        break;
      }
      case 'fetch':
        await ev((t) => { const g = __game; if (g.playerCar) g.exitCar(true); g.player.teleport(t.x, t.z, 0); }, t);
        await frames(6);
        break;
      case 'pickup':
        if (s.needCar) {
          await ev((t) => { const g = __game; if (!g.playerCar) g.enterCar(g.named.saab); const s = g.freeSpot(t.x, t.z, 4, 6); g.playerCar.place(s.x, s.z, Math.atan2(t.x - s.x, t.z - s.z)); g.cam.snapNext = true; }, t);
        } else {
          await ev((t) => { const g = __game; if (g.playerCar) g.exitCar(true); const s = g.freeSpot(t.x, t.z, 1.2, 1.8); g.player.teleport(s.x, s.z, 0); g.cam.snapNext = true; }, t);
        }
        await frames(8);
        break;
      case 'dropoff':
      case 'goto': {
        // Bring the companions along (warps leave walkers behind).
        await ev((t) => {
          const g = __game;
          const s = g.freeSpot(t.x, t.z, 0.5, Math.max(1, (t.r || 3) * 0.5));
          if (g.playerCar) { g.playerCar.place(s.x, s.z, g.playerCar.yaw); }
          else {
            g.player.teleport(s.x, s.z, g.player.yaw);
            for (const [ch, o] of g.companions) if (!ch.car && !o.push) ch.teleport(s.x + 1, s.z + 0.5, 0);
          }
          g.cam.snapNext = true;
        }, t);
        await frames(10);
        break;
      }
      case 'escort':
        if (s.phase === 'find') {
          await ev((t) => { const g = __game; if (g.playerCar) g.exitCar(true); const s = g.freeSpot(t.x, t.z, 1.2, 1.6); g.player.teleport(s.x, s.z, Math.atan2(t.x - s.x, t.z - s.z)); g.cam.snapNext = true; }, t);
          await frames(8);
          await shot('errand_rune_found');
        } else {
          // Push Rune home: warp next to the door (he rolls in front of Ove).
          await ev((t) => { const g = __game; g.player.teleport(t.x + 1.2, t.z + 1.2, Math.atan2(-1.2, -1.2)); g.cam.snapNext = true; }, t);
          await frames(6);
          await shot('errand_rune_push');
          await hold(['KeyW'], 500);
        }
        break;
      case 'catchCat':
        await ev(() => { const g = __game, c = __interrupt.stage.cat; if (g.playerCar) g.exitCar(true); g.player.teleport(c.x + 0.4, c.z, -Math.PI / 2); g.cam.snapNext = true; });
        await frames(3);
        break;
      default:
        await frames(10);
    }
    return true;
  }

  async function solveErrand(id, pics = false) {
    const before = await st();
    let k = 0;
    while (k++ < 25) {
      const go = await solveStep();
      if (!go) break;
      if (pics && k === 1) await shot('errand_' + id + '_0');
    }
    const r = await ev(() => ({ done: __interrupt.done, failed: __interrupt.failed, active: !!__interrupt.active }));
    const after = await st();
    console.log('[t] errand result', id, JSON.stringify({ ...r, dOrdning: +(after.ordning - before.ordning).toFixed(1), dKr: after.kr - before.kr }));
    return r;
  }

  // Run a list of stages from stages.js in the page (a bare-bones mission runner, for tests).
  const runStages = (code) => ev((code) => {
    const g = __game, S = __stages;
    const list = new Function('S', 'return ' + code)(S);
    const m = S.newCtx({});
    let i = 0, st = list[0];
    st.init?.(g, m);
    window.__stRes = 'running'; window.__st = st;
    const fn = (dt) => {
      const r = st.update(g, m, dt);
      if (r === 'done') {
        st.cleanup?.(g, m);
        i++;
        if (i >= list.length) { g.offFrame(fn); window.__stRes = 'done'; S.disposeCtx(g, m); return; }
        st = list[i]; st.init?.(g, m); window.__st = st;
      } else if (r && r.fail) { g.offFrame(fn); window.__stRes = 'fail: ' + r.fail; S.disposeCtx(g, m); }
      g.hudStage = st;
    };
    g.onFrame(fn);
  }, code);

  return {
    // The story's stage kinds that the errands don't use: parkIn (with a trailer, reversing),
    // report, getInCar, goto with a chaser.
    async stages() {
      // parkIn: Patrick's car + trailer, backed into parvanehDrive.
      await runStages("[S.getInCar({ car: 'patrickCar', any: false }), S.parkIn({ box: 'parvanehDrive', car: 'patrickCar', trailer: true, reverse: true, tol: 0.35 })]");
      await frames(5);
      console.log('[t] getInCar', await ev(() => `${window.__st.kind} ${window.__st.sub || window.__st.text}`));
      await ev(() => { const g = __game; g.enterCar(g.named.patrickCar); });
      await frames(5);
      // Drive in nose first: must be refused (reverse only).
      await ev(() => { const g = __game, b = window.__lm('parvanehDrive'), c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); c.place(b.x - fx * 9, b.z - fz * 9, b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
      await frames(5);
      await hold(['KeyW'], 1100);
      await frames(40);
      console.log('[t] parkIn forwards', await ev(() => `${window.__stRes} sub=${window.__st.sub} score=${window.__st.score?.toFixed(2)}`));
      // Now back it in: start ahead of the box, facing along it, and reverse.
      await ev(() => { const g = __game, b = window.__lm('parvanehDrive'), c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); c.place(b.x + fx * 7.5, b.z + fz * 7.5, b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
      await frames(10);
      await shot('stage_parkin_0');
      // A careful reverse: about 1.5 m/s backwards until the car sits in the front half of the box.
      for (let k = 0; k < 160 && (await ev(() => window.__stRes)) === 'running'; k++) {
        const r = await ev(() => {
          const g = __game, b = window.__lm('parvanehDrive'), c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
          const r = (c.x - b.x) * fx + (c.z - b.z) * fz, d = r - 2.3;
          const v = d > 0.05 ? -Math.min(1.6, Math.max(0.35, d * 1.2)) : 0;
          c.vx = fx * v; c.vz = fz * v; c.yaw = b.yaw; c.w = 0;
          return r;
        });
        await frames(2);
        if (k % 20 === 0) console.log('[t] parkIn', await ev(() => `${window.__stRes} sub=${window.__st.sub} score=${window.__st.score?.toFixed(2)} rev=${window.__st.enteredRev} still=${window.__st.stillT?.toFixed(2)}`), r.toFixed(2));
      }
      await shot('stage_parkin_1');
      console.log('[t] parkIn result', await ev(() => window.__stRes));
      // report: 2 forced violations near the garbage room, no smitare.
      await ev(() => __game.exitCar(true));
      await runStages("[S.report({ n: 2, near: 'garbageRoom', smitare: false })]");
      await frames(5);
      const cars = await ev(() => window.__st.cars.map((c) => ({ x: c.x, z: c.z, sm: c.violation.smitare, kind: c.violation.kind })));
      console.log('[t] report spawned', JSON.stringify(cars));
      for (const c of cars) {
        await ev((c) => { const g = __game, s = g.freeSpot(c.x, c.z, 3, 3.5); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.snapNext = true; }, c);
        await frames(5);
        await page.keyboard.down('KeyF'); await sleep(2200); await page.keyboard.up('KeyF');
        await frames(5);
      }
      console.log('[t] report result', await ev(() => window.__stRes));
      // goto with a chaser (the Vita skjortan's Škoda): it hunts the Saab.
      await ev(() => { const g = __game; g.enterCar(g.named.saab); g.playerCar.place(0, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
      await runStages("[S.goto({ to: 'hospital', radius: 10, inCar: true, chaser: { type: 'skoda', who: 'vitskjorta', cruise: 20 } })]");
      await sleep(6000);
      console.log('[t] chaser', await ev(() => { const c = window.__st.chaser, f = __game.focus(); return `${c.kind} ${c.ai.mode} d=${Math.hypot(c.x - f.x, c.z - f.z).toFixed(0)} v=${c.speed.toFixed(1)}`; }));
      await ev(() => { const g = __game, c = window.__st.chaser; g.cam.yaw = Math.atan2(c.x - g.playerCar.x, c.z - g.playerCar.z) + Math.PI; g.cam.snapNext = true; });
      await frames(10);
      await shot('stage_chaser');
      const h = await L('hospital');
      await warp(h.x, h.z, 0);
      await frames(10);
      console.log('[t] goto result', await ev(() => window.__stRes));
    },

    // Two and a half minutes of free roam with the real call scheduler: report what is near,
    // take the calls, do the errands, log the state every ~10 s.
    async freeroam() {
      await fresh('&calls');
      const t0 = Date.now();
      let shots = 0;
      while (Date.now() - t0 < 150000) {
        const s = await ev(() => ({ t: +__game.time.toFixed(0), clock: __game.clockText(), call: !!__interrupt.call, errand: __interrupt.active?.tpl.id || null, next: +__interrupt.nextT.toFixed(0), ordning: +__game.patrol.ordning.toFixed(1), reports: __game.patrol.reports, open: __game.patrol.open.length, kr: __game.coins, fps: null }));
        console.log('[t] freeroam', JSON.stringify(s));
        if (s.errand) { await solveErrand(s.errand); continue; }
        if (s.call) { if (shots++ < 1) await shot('freeroam_call'); await sleep(2000); continue; }
        // Report the nearest violation that is not a smitare.
        await nearestViolation();
        await standByCar();
        await frames(5);
        await page.keyboard.down('KeyF'); await sleep(2100); await page.keyboard.up('KeyF');
        await sleep(1500);
      }
      console.log('[t] fps', await fps());
      console.log('[t] freeroam done', JSON.stringify(await ev(() => ({ errands: __interrupt.done, failed: __interrupt.failed, reports: __game.patrol.reports, log: __game.patrol.log.length, kr: __game.coins }))));
      await shot('freeroam_end');
    },

    async report() {
      const v = await nearestViolation();
      console.log('[t] violation', JSON.stringify(v));
      // Walk up to it: start 7 m out on its driver's side, then W until within ~2.5 m.
      await ev(() => {
        const g = __game, c = window.__v;
        // A direction with a clear straight walk from 7 m out to the car.
        let best = null;
        for (let k = 0; k < 16 && !best; k++) {
          const a = c.yaw + Math.PI / 2 + k * Math.PI / 8, sx = Math.sin(a), sz = Math.cos(a);
          let ok = true;
          for (let t = 7; t >= 2.6 && ok; t -= 0.4) if (!g.spotFree(c.x + sx * t, c.z + sz * t)) ok = false;
          if (ok) best = { x: c.x + sx * 7, z: c.z + sz * 7 };
        }
        best ??= g.freeSpot(c.x, c.z, 6, 8);
        const yaw = Math.atan2(c.x - best.x, c.z - best.z);
        g.player.teleport(best.x, best.z, yaw); g.cam.yaw = yaw + 0.25; g.cam.pitch = 0.16; g.cam.snapNext = true;
      });
      await frames(10);
      await page.keyboard.down('KeyW');
      for (let k = 0; k < 40; k++) { await sleep(100); if (await ev(() => !!__game.patrol.reportable())) break; }
      await page.keyboard.up('KeyW');
      await frames(15);
      await log('before');
      await shot('report_0');
      await page.keyboard.down('KeyF');
      await sleep(1000);
      await log('writing');
      await shot('report_writing');
      await sleep(1300);
      await page.keyboard.up('KeyF');
      await frames(6);
      await log('after', { reported: await ev(() => window.__v.violation.reported), log: await ev(() => __game.patrol.log.length) });
      await shot('report_stamped');
      // Holding F does not start the next one by itself; F again on a reported car does nothing.
      await page.keyboard.down('KeyF'); await sleep(400); await page.keyboard.up('KeyF');
      await log('again', { writing: await ev(() => !!__game.patrol.writing) });
      // In the Saab, slowly past another violation: the window is wound down and it works too.
      await ev(() => {
        const g = __game, P = g.patrol;
        const c = P.forceSpawn(1, { x: g.player.x + 30, z: g.player.z }, { smitare: false })[0] || P.open[0];
        window.__v2 = c;
        g.enterCar(g.named.saab);
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        let x = c.x + fz * 3.2, z = c.z - fx * 3.2;
        if (!g.spotFree(x, z)) { x = c.x - fz * 3.2; z = c.z + fx * 3.2; }
        g.playerCar.place(x, z, c.yaw);
        g.cam.yaw = c.yaw; g.cam.snapNext = true;
      });
      await frames(10);
      await page.keyboard.down('KeyF'); await sleep(2300); await page.keyboard.up('KeyF');
      await frames(4);
      await log('in car', { reported: await ev(() => window.__v2.violation.reported) });
      await shot('report_car');
      // The pause menu's notebook page lists them (pause() is a no-op in ?test, so open it by hand).
      await sleep(2500);
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); document.getElementById('pause').classList.add('show'); hud.renderLog(__game.patrol.log); });
      await frames(10);
      await shot('report_log');
    },

    async pursuit() {
      // A smitare on Solrosvägen, the Saab behind it.
      const info = await ev(() => {
        const g = __game, P = g.patrol;
        const c = P.forceSpawn(1, window.__lm('busStop'), { smitare: true, radius: 120, kinds: ['sidewalk', 'corner', 'busstop', 'crosswalk', 'loading'] })[0];
        window.__s = c;
        g.enterCar(g.named.saab);
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        // In the lane beside it, a little behind.
        const rx = -fz, rz = fx;
        g.playerCar.place(c.x - fx * 6 + rx * 2.6, c.z - fz * 6 + rz * 2.6, c.yaw);
        g.cam.yaw = c.yaw; g.cam.snapNext = true;
        return { plate: c.plate, smitare: c.violation.smitare, kind: c.violation.kind, x: c.x.toFixed(0), z: c.z.toFixed(0) };
      });
      console.log('[t] smitare', JSON.stringify(info));
      await frames(10);
      await shot('pursuit_0');
      await page.keyboard.down('KeyF'); await sleep(300); await page.keyboard.up('KeyF');
      await frames(10);
      await log('flees', { mode: await ev(() => window.__s.ai?.mode) });
      await sleep(2500);
      await shot('pursuit_1');
      // Ram it: every half second put the Saab just behind it, a little faster.
      for (let k = 0; k < 60; k++) {
        const r = await ev(() => {
          const g = __game, P = g.patrol, s = window.__s;
          if (!P.pursuit) return 'over';
          const c = g.playerCar, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
          c.place(s.x - fx * (s.spec.len / 2 + c.spec.len / 2 + 0.9), s.z - fz * (s.spec.len / 2 + c.spec.len / 2 + 0.9), s.yaw);
          c.vx = s.vx + fx * 7; c.vz = s.vz + fz * 7;
          g.cam.snapNext = true;
          return Math.round(P.pursuit.mot);
        });
        if (r === 'over') break;
        if (k % 4 === 0) console.log('[t] motstånd', r);
        if (k === 3) await shot('pursuit_ram');
        await sleep(450);
      }
      await frames(20);
      await log('after', { caught: await ev(() => __game.patrol.log.at(-1)?.caught || false), mode: await ev(() => window.__s.ai?.mode), hazard: await ev(() => window.__s.hazard) });
      await shot('pursuit_tagen');
      await sleep(3500);
      await log('pulled over', { mode: await ev(() => window.__s.ai?.mode), hazard: await ev(() => window.__s.hazard), v: await ev(() => window.__s.speed.toFixed(1)) });
      await shot('pursuit_pulled');
      // A second smitare that gets away: SMET!
      await ev(() => {
        const g = __game, P = g.patrol;
        const c = P.forceSpawn(1, { x: 120, z: 40 }, { smitare: true, radius: 150, kinds: ['sidewalk', 'corner', 'busstop', 'crosswalk', 'loading'] })[0];
        window.__s2 = c;
        g.playerCar.place(c.x + 4, c.z + 4, c.yaw);
        P.startWriting(c);
      });
      await frames(5);
      await ev(() => { const g = __game; g.playerCar.place(-200, 200, 0); g.playerCar.vx = g.playerCar.vz = 0; });
      await sleep(6500);
      await log('far away', { escaped: await ev(() => __game.patrol.log.at(-1)?.escaped || false) });
      await shot('pursuit_smet');
    },

    async interrupt() {
      const v = await nearestViolation();
      console.log('[t] violation', JSON.stringify(v));
      await standByCar();
      await frames(10);
      await page.keyboard.down('KeyF');
      await sleep(700);
      await log('writing');
      await ev(() => __interrupt.force('element'));
      await frames(6);
      await log('call', { call: await ev(() => !!__interrupt.call), nbCancelled: await ev(() => document.getElementById('notebook').className) });
      await shot('interrupt_call');
      await page.keyboard.up('KeyF');
      await sleep(4500);
      await shot('interrupt_talk');
      await until(() => !!__interrupt.active, 30000);
      await log('errand', { panel: await ev(() => document.getElementById('errand').className), reported: await ev(() => window.__v.violation.reported) });
      await frames(10);
      await shot('interrupt_errand');
      const r = await solveErrand('element');
      await frames(10);
      await shot('interrupt_done');
      console.log('[t] interrupt ok', r.done === 1);
    },

    async errands() {
      const ids = ['element', 'forskolan', 'mobilen', 'punktering', 'nyckeln', 'rune', 'skotta', 'katten', 'skjuts'];
      const results = {};
      for (const id of process.env.ERRANDS ? process.env.ERRANDS.split(',') : ids) {
        await ev(() => { const g = __game; if (g.playerCar) g.exitCar(true); const s = window.__lm('oveStart'); g.player.teleport(s.x, s.z, s.yaw); g.player.state = 'normal'; });
        await frames(3);
        const d0 = await ev(() => __interrupt.done);
        await ev((id) => __interrupt.force(id, { quick: true }), id);
        await frames(4);
        const r = await solveErrand(id, true);
        results[id] = r.done > d0 ? 'ok' : 'FAILED';
        await frames(10);
        await shot('errand_' + id + '_done');
      }
      console.log('[t] errands', JSON.stringify(results));
    },

    async collect() {
      const pos = await ev(() => { const g = __game, e = g.emblems[0], p = g.photos[0]; return { e: [e.x, e.y, e.z], p: [p.x, p.y, p.z] }; });
      await standBy(pos.e[0], pos.e[2], 3, 4);
      await frames(10);
      await shot('collect_emblem_0');
      await ev((e) => { const g = __game; g.player.teleport(e[0], e[2], g.player.yaw); }, pos.e);
      await frames(20);
      await shot('collect_emblem_1');
      await standBy(pos.p[0], pos.p[2], 2.5, 3.5);
      await frames(10);
      await shot('collect_photo_0');
      await ev((p) => { const g = __game; g.player.teleport(p[0], p[2], g.player.yaw); }, pos.p);
      await frames(20);
      await shot('collect_photo_1');
      // A can: stand 3 m away, walk over it.
      const kr0 = await ev(() => __game.coins);
      await ev(async () => {
        const { cans } = await import('./src/actors/pickups.js');
        const g = __game, c = cans.find((c) => c.alive && Math.hypot(c.x, c.z) < 60) || cans.find((c) => c.alive);
        window.__can = c;
        g.player.teleport(c.x - 2.5, c.z, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.35; g.cam.snapNext = true;
      });
      await frames(10);
      await shot('collect_can_0');
      await hold(['KeyW'], 1100);
      await frames(5);
      console.log('[t] collect', JSON.stringify(await ev((kr0) => ({ emblems: __game.got.emblems.size, photos: __game.got.photos.size, can: !window.__can.alive, kr: __game.coins - kr0, saved: !!localStorage.getItem('saab-and-run-v1') }), kr0)));
      // Every collectible reachable? Report the pickup height difference for each.
      console.log('[t] spots', JSON.stringify(await ev(() => [...__game.emblems, ...__game.photos].map((c) => `${c.kind[0]}${c.id}:${(c.y - __game.groundAt(c.x, c.z)).toFixed(2)}`))));
    },

    // Offline audio levels (audio._offline): the engine at full throttle (RMS, spectral centroid)
    // against the music, and snow footsteps: their loudness across five "sessions" (a new crunch
    // buffer each) and from step to step.
    async audiolevels() {
      const r = await ev(async () => {
        const { audio } = await import('./src/audio.js');
        const db = (x) => +(10 * Math.log10(x + 1e-12)).toFixed(1);
        const seg = (buf, t0, t1) => { const d = buf.getChannelData(0), sr = buf.sampleRate, a = Math.floor(t0 * sr), b = Math.min(d.length, Math.floor(t1 * sr)); let pk = 0, ss = 0; for (let i = a; i < b; i++) { const v = d[i]; pk = Math.max(pk, Math.abs(v)); ss += v * v; } return { peak: db(pk * pk), rms: db(ss / Math.max(1, b - a)) }; };
        const fft = (re, im) => {
          const n = re.length;
          for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
          for (let len = 2; len <= n; len <<= 1) {
            const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
              let cr = 1, ci = 0;
              for (let k = 0; k < len / 2; k++) {
                const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai;
                const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
              }
            }
          }
        };
        const centroid = (buf, t0, t1) => {
          const d = buf.getChannelData(0), sr = buf.sampleRate, N = 4096;
          let num = 0, den = 0;
          for (let t = t0; t + N / sr < t1; t += 0.2) {
            const a = Math.floor(t * sr), re = new Float64Array(N), im = new Float64Array(N);
            for (let n = 0; n < N; n++) re[n] = d[a + n] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
            fft(re, im);
            for (let k = 1; k < N / 2; k++) { const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); num += m * (k * sr / N); den += m; }
          }
          return Math.round(num / den);
        };
        const was = audio.musicOn;
        const eng = await audio._offline(5, async (a, oc) => {
          for (let t = 0.05; t < 4.95; t += 0.05) { await oc.suspend(t); a.engine(true, 0.9, 1, Math.min(32, 6 + t * 7), 'asphalt'); oc.resume(); }
        });
        const music = await audio._offline(24, async (a, oc, h) => { h.scheduleMusic(0.2, 24); });
        const steps = [];
        for (let session = 0; session < 5; session++) {
          const buf = await audio._offline(12.5, async (a, oc) => { for (let k = 0; k < 30; k++) { await oc.suspend(0.2 + k * 0.4); a.step('snow'); oc.resume(); } });
          const per = []; for (let k = 0; k < 30; k++) per.push(seg(buf, 0.2 + k * 0.4, 0.2 + k * 0.4 + 0.35));
          const peaks = per.map((x) => x.peak).sort((x, y) => x - y), rmss = per.map((x) => x.rms).sort((x, y) => x - y);
          steps.push({ peakMed: peaks[15], peakMin: peaks[0], peakMax: peaks[29], rmsMed: rmss[15], rmsSpread: +(rmss[27] - rmss[2]).toFixed(1) });
        }
        audio.musicOn = was;
        return { engineFull: { ...seg(eng, 2, 4.9), centroid: centroid(eng, 2.5, 4.5) }, music: { ...seg(music, 4, 24), centroid: centroid(music, 6, 12) }, snowSteps: steps };
      });
      console.log('[t] audio', JSON.stringify(r));
    },

    // ---------------------------------------------------------------------------------------
    // Fix round 1 (QA r1 repros, real key presses where it matters).

    // Brisk walk (Shift+W) into the side of the parked Saab: Ove must just stop, never fall.
    async bump() {
      await ev(() => {
        const g = __game, c = g.named.saab, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        // 6 m out from the driver's side (+x local), facing the car.
        let x = c.x + fz * 6, z = c.z - fx * 6;
        if (!g.spotFree(x, z)) { x = c.x - fz * 6; z = c.z + fx * 6; }
        const yaw = Math.atan2(c.x - x, c.z - z);
        g.player.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true;
        window.__downs = 0; window.__prevSt = 'normal';
        g.onFrame(() => { const s = g.player.state; if (s !== window.__prevSt && s === 'flung') window.__downs++; window.__prevSt = s; });
      });
      await frames(5);
      await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
      await sleep(4000);
      await shot('qa1_bump');
      await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
      console.log('[t] bump', JSON.stringify(await ev(() => ({ knockdowns: window.__downs, state: __game.player.state, dToCar: +Math.hypot(__game.player.x - __game.named.saab.x, __game.player.z - __game.named.saab.z).toFixed(2), carMoved: +Math.hypot(__game.named.saab.x - __game.named.saab.home.x, __game.named.saab.z - __game.named.saab.home.z).toFixed(2) }))));
    },

    // A pedestrian lying on Solrosvägen 25 m ahead of a traffic car at 12 m/s: the car stops for
    // the body (no ploughing), and if it touches it, the body goes sideways, not along.
    async plough() {
      const r0 = await ev(() => {
        const g = __game;
        for (const o of g.cars.slice()) if (o.traffic && Math.hypot(o.x + 40, o.z + 40) < 90) g.removeCar(o);
        // (the fixed spawn spot can be taken by a felparkering: any free one then, it is placed anyway)
        const car = g.spawnTrafficCar(() => 0.3, null) || g.spawnTrafficCar(Math.random, null);
        car.place(-80, -40 + 2.75, Math.PI / 2); car.vx = 12; car.vz = 0;
        car.ai = new car.ai.constructor(car, { mode: 'traffic', cruise: 12 });   // a lane path from here
        const ped = g.peds.find((p) => !p.char.invulnerable);
        const c = ped.char;
        c.teleport(-55, -40 + 2.75, 0); c.state = 'down'; c.timer = 6; c.downT = 0;
        ped.idleT = 8;
        window.__pl = { car, c, x0: c.x, z0: c.z, minGap: 99, maxDisp: 0 };
        g.cam.yaw = Math.PI / 2; g.player.teleport(-60, -40 + 9, -Math.PI / 2); g.cam.snapNext = true;
        g.onFrame(() => { const P = window.__pl; P.minGap = Math.min(P.minGap, P.c.x - P.car.x); P.maxDisp = Math.max(P.maxDisp, Math.hypot(P.c.x - P.x0, P.c.z - P.z0)); });
        return { car: car.kind };
      });
      await sleep(3500);
      await shot('qa1_plough');
      console.log('[t] plough', JSON.stringify(await ev(() => { const P = window.__pl; return { carSpeed: +P.car.speed.toFixed(1), gapNow: +(P.c.x - P.car.x).toFixed(1), minGap: +P.minGap.toFixed(1), bodyMoved: +P.maxDisp.toFixed(2), state: P.c.state }; })), JSON.stringify(r0));
      // Now Ove's own car straight into a body at 40 km/h: it must not carry it.
      await ev(() => {
        const g = __game, P = window.__pl;
        g.removeCar(P.car);
        g.enterCar(g.named.saab);
        const car = g.playerCar;
        car.place(-90, -40 + 2.75, Math.PI / 2); car.vx = 11; car.vz = 0;
        P.c.teleport(-80, -40 + 2.75, 0); P.c.state = 'down'; P.c.timer = 6; P.x0 = P.c.x; P.z0 = P.c.z; P.maxDisp = 0; P.car = car;
        g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
      });
      await hold(['KeyW'], 2000);
      await shot('qa1_plough_ove');
      console.log('[t] plough by Ove', JSON.stringify(await ev(() => { const P = window.__pl; return { carKmh: +(P.car.speed * 3.6).toFixed(0), bodyMoved: +P.maxDisp.toFixed(2), bodyLat: +(P.c.z - P.z0).toFixed(2), bodyAlong: +(P.c.x - P.x0).toFixed(2) }; })));
    },

    // A child pedestrian in the lane 30 m ahead of the Saab; Ove holds W: the child is shoved
    // aside, not carried on the bumper. Then Parvaneh (a neighbour) the same way.
    async shove() {
      for (const who of ['kid', 'parvaneh']) {
        await ev((who) => {
          const g = __game;
          for (const o of g.cars.slice()) if (o.traffic && Math.hypot(o.x + 40, o.z + 40) < 90) g.removeCar(o);
          if (!g.playerCar) g.enterCar(g.named.saab);
          const car = g.playerCar;
          car.place(-90, -40 + 2.75, Math.PI / 2);
          let c;
          if (who === 'kid') { const kp = g.peds.find((p) => p.char.invulnerable); c = kp ? kp.char : null; if (kp) kp.idleT = 8; }
          else c = g.npc(who);
          c.teleport(-62, -40 + 2.75, 0);
          c.busy = true;
          window.__sh = { car, c, x0: c.x, maxAlong: 0, ordning: g.patrol.ordning, state: [] };
          g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
          g.onFrame(() => { const P = window.__sh; if (P.c.state !== 'normal') P.state.push(P.c.state); P.maxAlong = Math.max(P.maxAlong, P.c.x - P.x0); });
        }, who);
        await hold(['KeyW'], 4500);
        await shot('qa1_shove_' + who);
        console.log('[t] shove', who, JSON.stringify(await ev(() => { const P = window.__sh, g = __game; const r = { kmh: +(P.car.speed * 3.6).toFixed(0), carriedAlong: +P.maxAlong.toFixed(1), lateral: +(P.c.z - (-40 + 2.75)).toFixed(2), flung: P.state.includes('flung'), dOrdning: +(g.patrol.ordning - P.ordning).toFixed(1) }; P.c.busy = false; return r; })));
        await ev(() => __game.exitCar(true));
      }
    },

    // Camera: the Saab stopped with a roadside tree right behind it; a neighbour right behind
    // Ove at a wall (Anita at runeHouse during 'Lufta elementet'); the Saab in Ove's garage.
    async camtight() {
      const t = await ev(async () => {
        const g = __game, { blocks } = await import('./src/world/collision.js');
        const trees = blocks.filter((b) => b.kind === 'tree' && Math.hypot(b.x, b.z) < 200);
        // A tree with a clear spot for the car 3.4 m in front of it (along x or z).
        for (const b of trees) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = b.x + dx * 3.6, z = b.z + dz * 3.6;
            let ok = true;
            for (let k = 0; k <= 4 && ok; k++) if (!g.spotFree(b.x + dx * (2.2 + k), b.z + dz * (2.2 + k)) || !g.spotFree(b.x + dx * (2.2 + k) + dz * 1, b.z + dz * (2.2 + k) + dx * 1) || !g.spotFree(b.x + dx * (2.2 + k) - dz, b.z + dz * (2.2 + k) - dx)) ok = false;
            if (!ok) continue;
            if (!g.playerCar) g.enterCar(g.named.saab);
            const yaw = Math.atan2(dx, dz);
            g.playerCar.place(x + dx * 1.2, z + dz * 1.2, yaw);
            g.cam.yaw = yaw; g.cam.snapNext = true;
            return { tree: [+b.x.toFixed(1), +b.z.toFixed(1), +b.r.toFixed(2)] };
          }
        }
        return null;
      });
      await frames(20);
      const cs = () => ev(() => { const g = __game, c = g.cam, p = c.cam.position; return { boom: +c.boom.toFixed(2), cam: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] }; });
      console.log('[t] camtree', JSON.stringify(t), JSON.stringify(await cs()));
      await shot('qa1_cam_tree');
      // Lufta elementet with Anita on the spot.
      await ev(() => { const g = __game; g.exitCar(true); g.interrupts.force('element', { quick: true }); });
      await frames(5);
      await ev(() => {
        const g = __game, t = g.interrupts.target(), a = g.npc('anita');
        g.player.teleport(t.x, t.z, 0);
        a.teleport(t.x - Math.sin(g.player.yaw) * 1.0, t.z - Math.cos(g.player.yaw) * 1.0, 0);
        g.cam.yaw = g.player.yaw; g.cam.pitch = 0.18; g.cam.snapNext = true;
      });
      await page.keyboard.down('KeyE'); await sleep(1500);
      await shot('qa1_cam_element');
      // Anita right where the camera is: she must be hidden, not filling the screen from inside.
      await ev(() => { const g = __game, a = g.npc('anita'), p = g.cam.cam.position; a.teleport(p.x + 0.1, p.z, 0); });
      await frames(3);
      await shot('qa1_cam_inhead');
      console.log('[t] camhead', JSON.stringify(await cs()), JSON.stringify(await ev(() => ({ anitaVisible: __game.npc('anita').root.visible, work: __game.player.anim.work, kind: __game.player.anim.workKind }))));
      await sleep(2000); await page.keyboard.up('KeyE');
      await ev(() => __game.interrupts.abort());
      // The Saab nose out in Ove's garage (as on day 7), and backed against a garage wall.
      await ev(() => { const g = __game, b = window.__lm('oveGarageSpot') || window.__lm('saabSpot'); g.enterCar(g.named.saab); g.playerCar.place(b.x, b.z, b.yaw + Math.PI); g.cam.yaw = b.yaw + Math.PI; g.cam.snapNext = true; });
      await frames(20);
      console.log('[t] camgarage out', JSON.stringify(await cs()));
      await shot('qa1_cam_garage_out');
      await ev(() => { const g = __game, b = window.__lm('oveGarageSpot') || window.__lm('saabSpot'); g.playerCar.place(b.x, b.z, b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
      await frames(20);
      console.log('[t] camgarage in', JSON.stringify(await cs()));
      await shot('qa1_cam_garage_in');
      // On foot with a wall right behind: the garbage room and the bike shed.
      for (const l of ['garbageRoom', 'bikeShed']) {
        // Ove with his back to the building, the camera between him and its wall.
        await ev((l) => { const g = __game; if (g.playerCar) g.exitCar(true); const m = window.__lm(l); const s = g.freeSpot(m.x, m.z, 0.6, 1.4); g.player.teleport(s.x, s.z, m.yaw + Math.PI); g.cam.yaw = m.yaw + Math.PI; g.cam.pitch = 0.2; g.cam.snapNext = true; }, l);
        await frames(20);
        console.log('[t] cam', l, JSON.stringify(await cs()));
        await shot('qa1_cam_' + l);
      }
    },

    // The Ordning meter over three minutes of free roam with calls on and nobody reporting,
    // then an errand: the drain rate with 6 open, and during an avbrott.
    async drain() {
      const s0 = await st();
      await sleep(30000);
      const s1 = await st();
      console.log('[t] drain idle', JSON.stringify({ open: s1.open, perSec: +((s0.ordning - s1.ordning) / 30).toFixed(3) }));
      await ev(() => __game.interrupts.force('element', { quick: true }));
      const s2 = await st();
      await sleep(20000);
      const s3 = await st();
      console.log('[t] drain errand', JSON.stringify({ open: s3.open, perSec: +((s2.ordning - s3.ordning) / 20).toFixed(3) }));
      await ev(() => __game.interrupts.abort());
      // Report three in a row: does the open count stay down for a while?
      for (let k = 0; k < 3; k++) {
        await nearestViolation();
        await standByCar();
        await frames(4);
        await hold(['KeyF'], 2300);
        await frames(4);
      }
      const s4 = await st();
      await sleep(20000);
      const s5 = await st();
      console.log('[t] after 3 reports', JSON.stringify({ reports: s4.reports, openRight: s4.open, open20s: s5.open, ordning: s4.ordning, ordning20s: s5.ordning }));
    },

    // The pause menu in a real (non-test) game: P pauses and frees the mouse, Esc/P resume.
    async pausemenu() {
      await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 60000 });
      await page.click('#play');
      await sleep(1500);
      await tap('KeyP');
      await sleep(400);
      const a = await ev(() => ({ paused: __game.paused, shown: document.getElementById('pause').classList.contains('show') }));
      await shot('qa1_pause');
      await tap('KeyP');
      await sleep(300);
      const b = await ev(() => ({ paused: __game.paused }));
      await tap('Escape');
      await sleep(400);
      const c = await ev(() => ({ paused: __game.paused }));
      await tap('Escape');
      await sleep(400);
      const d = await ev(() => ({ paused: __game.paused }));
      await tap('KeyP'); await sleep(400);
      await page.click('#resume');
      await sleep(300);
      const e = await ev(() => ({ paused: __game.paused }));
      console.log('[t] pause', JSON.stringify({ P: a, Presume: b, Esc: c, EscResume: d, click: e }));
    },

    // HUD and errand visuals after fix round 1.
    async uicheck() {
      // A long line from someone at the left edge of the view, and one at the right edge.
      await ev(() => {
        const g = __game, s = window.__lm('oveStart');
        g.player.teleport(s.x, s.z, s.yaw); g.cam.yaw = s.yaw; g.cam.pitch = 0.16; g.cam.snapNext = true;
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
        const a = g.npc('anders'), j = g.npc('jimmy');
        a.busy = j.busy = true;
        // At the very edges of the view (anchors at ndc x ≈ ±0.95).
        a.teleport(s.x + fx * 8.5 - rx * 6.6, s.z + fz * 8.5 - rz * 6.6, s.yaw + Math.PI);
        j.teleport(s.x + fx * 8.5 + rx * 6.6, s.z + fz * 8.5 + rz * 6.6, s.yaw + Math.PI);
        g.say(a, 'Ove! Det är förbjudet att köra bil inom området! Det står i föreningens stadgar, paragraf fyra.', 6);
        g.say(j, 'Tjena Ove! Har du ätit frukost? Jag har gjort pannkakor, massor av pannkakor.', 6);
      });
      await frames(20);
      await shot('ui_bubbles_edge');
      await ev(() => { const g = __game; g.npc('anders').busy = g.npc('jimmy').busy = false; g.placeNpcs(true); });
      // Countdown digit, then a KAOS banner.
      await ev(() => { window.__hud = null; });
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.showBanner('2', '', 'count', 3000); });
      await frames(20);
      await shot('ui_count');
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.showBanner('KAOS I OMRÅDET', 'Anders kallar till extra föreningsmöte · −50 kr', 'chaos', 3000); });
      await frames(25);
      await shot('ui_kaos');
      // A call: the ringing card, then the phone toasts with portraits.
      await ev(() => __game.interrupts.force('mobilen'));
      await sleep(1200);
      await shot('ui_call_ring');
      await sleep(3500);
      await shot('ui_call_talk');
      await ev(() => __game.interrupts.abort());
      // A report: the notebook stamp (KL. 06.xx) and the anm. counter.
      await nearestViolation();
      await standByCar();
      await frames(4);
      await page.keyboard.down('KeyF'); await sleep(2050);
      await shot('ui_stamp');
      await page.keyboard.up('KeyF');
      await sleep(1500);
      // The pause notebook with ticks.
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); const P = __game.patrol; P.log.push({ plate: 'ABC 123', kind: 'busstop', text: 'x', time: '06:12', caught: true }, { plate: 'KLM 44P', kind: 'lawn', text: 'x', time: '06:20', escaped: true }); document.getElementById('pause').classList.add('show'); hud.renderLog(P.log); });
      await frames(10);
      await shot('ui_pauselog');
      await ev(() => document.getElementById('pause').classList.remove('show'));
      // Skotta: the snow heaps, and Ove shovelling.
      await ev(() => __game.interrupts.force('skotta', { quick: true }));
      await frames(3);
      await ev(() => { const g = __game, t = g.interrupts.target(); const yaw = 0.6; g.player.teleport(t.x - Math.sin(yaw) * 1.3, t.z - Math.cos(yaw) * 1.3, yaw); g.cam.yaw = yaw + 0.7; g.cam.pitch = 0.3; g.cam.snapNext = true; });
      await frames(15);
      await shot('ui_skotta_heaps');
      await page.keyboard.down('KeyE'); await sleep(900);
      await shot('ui_skotta_work');
      await page.keyboard.up('KeyE');
      await ev(() => __game.interrupts.abort());
      // The cat in Ove's arms.
      await ev(() => __game.interrupts.force('katten', { quick: true }));
      await frames(3);
      await ev(() => { const g = __game, c = g.interrupts.stage.cat; g.player.teleport(c.x + 0.4, c.z, -Math.PI / 2); });
      await frames(10);
      await ev(() => { const g = __game, p = g.player; g.cam.yaw = p.yaw + Math.PI - 0.5; g.cam.pitch = 0.12; g.cam.snapNext = true; });
      await frames(20);
      console.log('[t] carry', JSON.stringify(await ev(() => ({ carrying: !!__game.carrying, carry: __game.player.anim.carry, push: __game.player.anim.push }))));
      await shot('ui_cat_carry');
      await page.keyboard.down('KeyW'); await sleep(1200);
      await shot('ui_cat_walk');
      await page.keyboard.up('KeyW');
      await ev(() => __game.interrupts.abort());
      // Punktering: the low work pose at the bike shed.
      await ev(() => __game.interrupts.force('punktering', { quick: true }));
      await frames(3);
      await ev(() => { const g = __game, t = g.interrupts.target(); g.player.teleport(t.x, t.z, g.player.yaw); g.cam.yaw = g.player.yaw + 2.2; g.cam.pitch = 0.25; g.cam.snapNext = true; });
      await frames(10);
      await page.keyboard.down('KeyE'); await sleep(1200);
      await shot('ui_punktering_work');
      await page.keyboard.up('KeyE');
    },

        // Portrait lighting: the people area's soft key against the reviewer's, at dialogue size
    // (84x100) and in the call card's round crop (58 px).
    async portraitlight() {
      await ev(async () => {
        const { renderPortrait, PORTRAIT } = await import('./src/game/hud.js');
        const { renderer } = await import('./src/gfx.js');
        const g = __game, keys = ['ove', 'parvaneh', 'patrick', 'anita', 'rune', 'jimmy', 'adrian', 'anders', 'vitskjorta', 'sara'];
        const sets = { A: { keyPos: [-1.3, 0.7, 1.5], fill: 0.7, env: 0.4 }, B: { keyPos: [-1.4, 0.8, 1.3], fill: 0.55, env: 0.5 } };
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;z-index:99;background:#2a3036;padding:10px;display:grid;grid-template-columns:repeat(10,1fr);gap:6px;align-content:start;font:12px sans-serif;color:#ddd';
        const saved = { ...PORTRAIT, keyPos: PORTRAIT.keyPos.slice() };
        for (const [name, L] of Object.entries(sets)) {
          Object.assign(PORTRAIT, L);
          for (const k of keys) {
            const m = k === 'ove' ? g.player.model : g.npc(k).model;
            const url = renderPortrait(renderer, m);
            const d = document.createElement('div');
            d.innerHTML = `<div>${name} ${k}</div><img src="${url}" style="width:84px;height:100px;object-fit:cover;display:block"><span style="display:block;width:58px;height:58px;border-radius:50%;overflow:hidden;margin-top:4px"><img src="${url}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.4286);transform-origin:50% 20%"></span>`;
            box.appendChild(d);
          }
        }
        Object.assign(PORTRAIT, saved);
        document.body.appendChild(box);
      });
      await sleep(500);
      await shot('ui_portraits_ab');
    },

        async patrol() {
      await log('start');
      await sleep(10000);
      await log('after 10 s (drain)');
      // Ove drives on the car-free walkway: Anders shouts, the meter drops 1/s.
      await ev(() => { const g = __game; g.enterCar(g.named.saab); const s = window.__lm('oveStart'); g.playerCar.place(s.x - 6, s.z, s.yaw); g.cam.yaw = s.yaw; g.cam.snapNext = true; });
      const o0 = (await st()).ordning;
      await hold(['KeyW'], 1200);
      await hold(['KeyS'], 900);
      await hold(['KeyW'], 1400);
      await log('car-free', { shouted: await ev(() => __game.patrol.carFreeShoutT > 0), drop: +(o0 - (await st()).ordning).toFixed(1) });
      await shot('patrol_carfree');
      await ev(() => { const g = __game; g.exitCar(true); });
      // KAOS I OMRÅDET.
      await ev(() => { __game.addCoins(80); __game.patrol.addOrdning(-100); });
      await sleep(1200);
      await log('kaos');
      await shot('patrol_kaos');
      await sleep(3000);
      // ORDNING OCH REDA.
      await ev(() => { __game.patrol.addOrdning(100); });
      await sleep(1200);
      await log('reda', { given: await ev(() => __game.patrol.redaGiven) });
      await shot('patrol_reda');
      // Minimap and tags on a drive past the violations around the area.
      await sleep(2500);
      // Stand on the main walkway looking along it: tags over the violations in view.
      await ev(() => { const g = __game, s = window.__lm('oveStart'); g.player.teleport(s.x - 4, s.z, s.yaw); g.cam.yaw = s.yaw; g.cam.pitch = 0.12; g.cam.snapNext = true; });
      await frames(15);
      await shot('patrol_tags');
      await tap('KeyM');
      await frames(12);
      await shot('patrol_bigmap');
    },

    // ------------------------------------------------------------------------------------------
    // Phase 4 (fixer A): the loop's cost and robustness.

    // update / stepWorld / syncAll / updateHud per frame, fixed steps per frame, minor GCs from a
    // trace. Poses: on foot at the start, then the Saab driven by an AI chauffeur on Solrosvägen.
    // GPERF_THROTTLE=n slows the CPU n times (CDP), GPERF_FRAMES=n frames per pose, GPERF_GC=1 traces.
    async gperf() {
      const cdp = await page.target().createCDPSession();
      const rate = +(process.env.GPERF_THROTTLE || 1);
      const N = +(process.env.GPERF_FRAMES || 300);
      await ev(() => {
        const g = __game;
        const P = (window.__gp = { on: false, upd: [], step: [], sync: [], hud: [], frame: [], steps: [], n: 0 });
        const wrap = (name, key) => { const f = g[name].bind(g); g[name] = function (...a) { const t0 = performance.now(); const r = f(...a); if (P.on) { P[key].push(performance.now() - t0); if (key === 'step') P.n++; } return r; }; };
        wrap('stepWorld', 'step'); wrap('syncAll', 'sync'); wrap('updateHud', 'hud');
        const U = g.update.bind(g);
        g.update = function (dt) { const n0 = P.n, t0 = performance.now(); U(dt); if (P.on) { P.upd.push(performance.now() - t0); P.steps.push(P.n - n0); } };
        const L = g.loop.bind(g);
        let last = 0;
        g.loop = function (t) { L(t); if (P.on) P.frame.push(t - last); last = t; };
      });
      const stat = (a) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y), m = a.reduce((x, y) => x + y, 0) / a.length; return `${m.toFixed(2)}/${s[Math.floor(s.length * 0.95)].toFixed(2)}`; };
      const measure = async (label, gc) => {
        await frames(60);
        if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        if (gc) await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8'] });
        await ev(() => { const P = __gp; for (const k of ['upd', 'step', 'sync', 'hud', 'frame', 'steps']) P[k].length = 0; P.on = true; });
        const t0 = Date.now();
        await frames(N);
        const secs = (Date.now() - t0) / 1000;
        const r = await ev(() => { const P = __gp; P.on = false; return { upd: P.upd.slice(), step: P.step.slice(), sync: P.sync.slice(), hud: P.hud.slice(), frame: P.frame.slice(1), steps: P.steps.slice(), cars: __game.cars.length, asleep: __game.cars.filter((c) => c.asleep).length }; });
        let gcs = '';
        if (gc) {
          const buf = await page.tracing.stop();
          const ev2 = JSON.parse(Buffer.from(buf).toString()).traceEvents || [];
          const minor = ev2.filter((e) => (e.name === 'MinorGC' || e.name === 'V8.GC_SCAVENGER') && e.ph === 'X');
          const major = ev2.filter((e) => e.name === 'MajorGC' && e.ph === 'X');
          const ms = minor.reduce((s, e) => s + (e.dur || 0), 0) / 1000;
          gcs = ` minorGC ${(minor.length / secs).toFixed(1)}/s (${(ms / secs).toFixed(2)} ms/s, max ${(Math.max(0, ...minor.map((e) => e.dur || 0)) / 1000).toFixed(2)} ms) majorGC ${major.length}`;
        }
        if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const steps = r.steps.reduce((a, b) => a + b, 0) / Math.max(1, r.steps.length);
        const fpsv = 1000 / (r.frame.reduce((a, b) => a + b, 0) / Math.max(1, r.frame.length));
        console.log(`[t] gperf ${label.padEnd(6)} x${rate} update ${stat(r.upd)} stepWorld ${stat(r.step)} steps/frame ${steps.toFixed(2)} (max ${Math.max(...r.steps)}) syncAll ${stat(r.sync)} hud ${stat(r.hud)} fps ${fpsv.toFixed(1)} cars ${r.cars} asleep ${r.asleep}${gcs}`);
      };
      const s = await L('oveStart');
      await ev((s) => { const g = __game; g.player.teleport(s.x, s.z, s.yaw); g.cam.yaw = s.yaw; g.cam.snapNext = true; }, s);
      await measure('foot', !!process.env.GPERF_GC);
      await ev(async () => {
        const g = __game;
        g.enterCar(g.named.saab);
        const c = g.playerCar; c.place(30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
        const { AIDriver } = await import('./src/actors/drivers.js');
        c.ai = new AIDriver(c, { mode: 'traffic', cruise: 15, avoid: true });
      });
      await measure('drive', !!process.env.GPERF_GC);
      await shot('gperf_drive');
    },

    // Title look-dev: the real title screen (no ?test), the title cards hidden (TCRAW=1) or shown;
    // TC='[{"pos":[x,y,z],"look":[x,y,z],"fov":40}, ...]' overrides the camera (window.__titleCam),
    // TCJS='js' runs first (e.g. to pose Ove). Without TC: the game's own title shot at 2 s and 12 s.
    async titlecam() {
      await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1${process.env.QUERY || ''}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      if (process.env.TCJS) await ev((code) => new Function(code)(), process.env.TCJS);
      if (process.env.TCRAW) await ev(() => { document.getElementById('title').style.visibility = 'hidden'; });
      const list = process.env.TC ? JSON.parse(process.env.TC) : null;
      if (!list) { await sleep(2000); await shot('titlecam_2s'); await sleep(10000); await shot('titlecam_12s'); return; }
      for (let k = 0; k < list.length; k++) {
        await ev((c) => { window.__titleCam = c; }, list[k]);
        await frames(8);
        await shot('titlecam_' + k);
      }
    },

    // Collectibles beyond 60 m aren't drawn (their beams are): main-pass draw calls with the culling
    // and with every emblem / photo forced visible (as before), at the start, on a street and aerial.
    async collcull() {
      const poses = [['start', null], ['street', [30, -40 + 2.75, Math.PI / 2]], ['aerial', 'aerial']];
      const out = {};
      for (const [name, pose] of poses) {
        await ev((pose) => {
          const g = __game, s = window.__lm('oveStart');
          g.aerial = pose === 'aerial';
          if (Array.isArray(pose)) { g.player.teleport(pose[0], pose[1], pose[2]); g.cam.yaw = pose[2]; } else g.player.teleport(s.x, s.z, s.yaw);
          g.cam.snapNext = true;
          for (const c of [...g.emblems, ...g.photos]) delete c.tick;
        }, pose);
        await frames(30);
        const on = await ev(async () => { const a = []; for (let i = 0; i < 10; i++) { await new Promise((r) => requestAnimationFrame(r)); a.push(window.__stats().calls); } return Math.round(a.reduce((x, y) => x + y) / a.length); });
        await ev(() => { for (const c of [...__game.emblems, ...__game.photos]) { c.tick = function (t) { if (!this.alive) return; this.inner.visible = true; this.inner.matrixAutoUpdate = true; this.inner.rotation.y = t * 0.9 + this.ph; }; } });
        await frames(10);
        const off = await ev(async () => { const a = []; for (let i = 0; i < 10; i++) { await new Promise((r) => requestAnimationFrame(r)); a.push(window.__stats().calls); } return Math.round(a.reduce((x, y) => x + y) / a.length); });
        out[name] = { calls: on, unculled: off, saved: off - on };
      }
      await ev(() => { __game.aerial = false; for (const c of [...__game.emblems, ...__game.photos]) delete c.tick; });
      console.log('[t] collcull', JSON.stringify(out));
    },

    // The finale's bouquet: on Sonja's grave (flowersOnGrave, as after the story) and upright as a
    // carried / fetch item, in close-up. BQ_D = camera distance (m).
    async bouquet() {
      const d = +(process.env.BQ_D || 1.1);
      const info = await ev(async (d) => {
        const g = __game, M = await import('./src/game/missions.js'), { Collectible } = await import('./src/actors/pickups.js');
        const k = M.kneelSpot(g);
        g.player.teleport(k.sx + 3, k.sz + 3, 0);
        M.flowersOnGrave(g);
        const f = g.graveFlowers, rx = -k.uz, rz = k.ux;
        const up = new Collectible(g.scene, 'flowers', 'look', k.tx + rx * 0.9, g.groundAt(k.tx, k.tz) + 0.45, k.tz + rz * 0.9);
        up.inner.scale.setScalar(1.7);
        window.__bq = { f, up, k };
        g.cam.update = function () {};
        g.hideNearCamera = function () {};
        const tris = (o) => { let n = 0; o.traverse((m) => { if (m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
        return { tris: tris(f.inner) };
      }, d);
      console.log('[t] bouquet triangles', JSON.stringify(info));
      const views = [['grave', 'f', 0.5, 0.55], ['grave_side', 'f', 1.9, 0.35], ['upright', 'up', 0.3, 0.1], ['upright_top', 'up', 1.2, 0.7]];
      for (const [name, which, ang, el] of views) {
        await ev(({ which, ang, el, d }) => {
          const { f, up, k } = window.__bq, o = which === 'f' ? f : up, cam = __game.cam.cam;
          const p = o.mesh.position, a = Math.atan2(k.ux, k.uz) + Math.PI + ang;
          const tx = p.x, ty = p.y + (which === 'f' ? 0.05 : 0.25), tz = p.z;
          cam.position.set(tx + Math.sin(a) * d * Math.cos(el), ty + d * Math.sin(el), tz + Math.cos(a) * d * Math.cos(el));
          cam.lookAt(tx, ty, tz); cam.fov = 40; cam.updateProjectionMatrix();
        }, { which, ang, el, d });
        await frames(6);
        await shot('bouquet_' + name);
      }
    },

    // Title pose look-dev: TP='[{"turn":-0.8,"ove":[1.5,0.9,0.7],"look":0.5,"t":2}, ...]' calls
    // __game.titlePose(o) on the real title and shoots it at arc time t (TCRAW=1 hides the card).
    // Without TP: the game's own pose at 2 s and 30 s. Prints how far the cars round the Saab were
    // shoved off their spots.
    async titlepose() {
      await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1${process.env.QUERY || ''}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      if (process.env.TCRAW) await ev(() => { document.getElementById('title').style.visibility = 'hidden'; });
      const list = process.env.TP ? JSON.parse(process.env.TP) : [{ t: 2 }, { t: 30 }];
      for (let k = 0; k < list.length; k++) {
        await ev((o) => { const g = __game; if (Object.keys(o).some((q) => q !== 't')) g.titlePose(o); g.time = o.t ?? 2; }, list[k]);
        await frames(40);
        await shot('titlepose_' + k);
        const shoved = await ev(() => { const g = __game, s = g.named.saab; return g.cars.filter((c) => c !== s && c.home && Math.hypot(c.x - s.x, c.z - s.z) < 12).map((c) => +Math.hypot(c.x - c.home.x, c.z - c.home.z).toFixed(2)).filter((d) => d > 0.01); });
        console.log('[t] titlepose', k, JSON.stringify(list[k]), 'shoved', JSON.stringify(shoved));
      }
    },

    // Gamepads that aren't a standard 4-axis pad (a laptop accelerometer, a 3-axis stick) must never
    // give NaN: 0, 1 and 3 axes, non-standard mapping; then a standard pad without analogue triggers
    // drives the Saab with the left stick.
    async gamepad() {
      const setPad = (pad) => ev((pad) => {
        window.__pad = pad ? { connected: true, index: 0, id: 'test', timestamp: 0, mapping: pad.mapping ?? '', axes: pad.axes, buttons: (pad.buttons || []).map((v) => ({ value: v, pressed: v > 0.5 })) } : null;
        navigator.getGamepads = () => [window.__pad];
      }, pad);
      const check = (label) => ev((label) => {
        const g = __game, c = g.cam.cam.position, p = g.player;
        const ok = [g.cam.yaw, g.cam.pitch, c.x, c.y, c.z, p.x, p.z, p.wishX, p.wishZ].every(Number.isFinite);
        const obj = document.querySelector('#objective .obj-text')?.textContent || '';
        return `${label}: finite ${ok} cam [${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}] yaw ${g.cam.yaw.toFixed(2)} pitch ${g.cam.pitch.toFixed(2)} player [${p.x.toFixed(1)}, ${p.z.toFixed(1)}] objective "${obj}" NaN-text ${/NaN/.test(document.getElementById('hud').textContent)}`;
      }, label);
      const cases = [
        ['standard, 0 axes', { mapping: 'standard', axes: [] }],
        ['standard, 1 axis', { mapping: 'standard', axes: [0.6] }],
        ['standard, 3 axes', { mapping: 'standard', axes: [0, 0, 0.5] }],
        ['accelerometer: non-standard, no buttons (ignored)', { axes: [0.1, 0.3, 0.5] }],
        ['non-standard, a button pressed, 3 axes', { axes: [0.4, -0.7, 0.9], buttons: [1, 0, 0, 0] }],
        ['standard, NaN / Infinity axes', { mapping: 'standard', axes: [NaN, 0.5, NaN, Infinity] }],
      ];
      for (const [label, pad] of cases) {
        const y0 = await ev(() => [__game.cam.yaw, __game.player.x, __game.player.z]);
        await setPad(pad);
        await frames(40);
        const y1 = await ev(() => [__game.cam.yaw, __game.player.x, __game.player.z]);
        console.log('[t] gamepad', await check(label), `moved: cam ${Math.abs(y1[0] - y0[0]) > 0.01} ove ${Math.hypot(y1[1] - y0[1], y1[2] - y0[2]) > 0.05}`);
      }
      await shot('p4_gamepad_3axes');
      // a standard pad with no analogue triggers: left stick forward = gas
      await setPad({ mapping: 'standard', axes: [0, -1, 0, 0], buttons: new Array(17).fill(0) });
      await ev(() => { const g = __game; g.enterCar(g.named.saab); const c = g.playerCar; c.place(0, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
      await sleep(2500);
      const v1 = await ev(() => +(__game.playerCar.forwardSpeed * 3.6).toFixed(0));
      await setPad({ mapping: 'standard', axes: [0, 1, 0, 0], buttons: new Array(17).fill(0) });
      await sleep(1500);
      const v2 = await ev(() => +(__game.playerCar.forwardSpeed * 3.6).toFixed(0));
      // once the triggers have moved, they are the pedals and the stick only steers
      await setPad({ mapping: 'standard', axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
      await sleep(1500);
      const v3 = await ev(() => +(__game.playerCar.forwardSpeed * 3.6).toFixed(0));
      console.log('[t] gamepad stick throttle', JSON.stringify({ afterStickForward: v1, afterStickBack: v2, afterRT: v3 }));
      await setPad(null);
    },

    // Corrupt saves: each seed loads into a sane game (a day offered, numbers that are numbers).
    async corruptsave() {
      const seeds = [
        ['mission -1', { mission: -1 }],
        ['mission 2.5', { mission: 2.5 }],
        ['strings', { kr: '12', mission: '3', patrol: { ordning: 'abc', reports: '7', log: 'x' } }],
        ['nulls', { mission: null, kr: null, clock: null, patrol: { ordning: null } }],
        ['huge', { mission: 99, kr: 1e12, clock: 1e9, emblems: [1, '2', 99, -1, null, 2.5], photos: 'abc', unlocked: 'x' }],
        ['array', [1, 2, 3]],
        ['garbage', 'not json at all'],
        ['log junk', { mission: 2, patrol: { ordning: 120, log: [null, 5, { plate: { a: 1 }, kind: 7, text: 'x'.repeat(500), time: [], caught: 'yes' }] } }],
        ['reda', { mission: 1, kr: 736, patrol: { ordning: 100, reports: 9, reda: true } }],
      ];
      for (const [label, seed] of seeds) {
        await page.evaluate((seed) => { localStorage.setItem('saab-and-run-v1', typeof seed === 'string' ? seed : JSON.stringify(seed)); }, seed);
        await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1`, { waitUntil: 'load' });
        await page.waitForFunction('window.__ready === true', { timeout: 90000, polling: 250 });
        await sleep(2500);
        const r = await ev(() => {
          const g = __game, P = g.patrol, m = g.missions;
          return { index: m.index, offered: m.offered?.id || null, kr: g.coins, krType: typeof g.coins, ordning: P.ordning, ordType: typeof P.ordning, reports: P.reports, log: P.log.length, emblems: [...g.got.emblems], clock: g.clockText(), reda: P.redaGiven };
        });
        const ok = Number.isInteger(r.index) && r.index >= 0 && r.index <= 7 && (r.index === 7 || r.offered || r.index > 0) && r.krType === 'number' && r.ordType === 'number' && r.ordning >= 0 && r.ordning <= 100 && Number.isInteger(r.reports);
        console.log('[t] corruptsave', label.padEnd(10), ok ? 'OK ' : 'BAD', JSON.stringify(r));
      }
      await page.evaluate(() => localStorage.removeItem('saab-and-run-v1'));
    },

    // A hidden tab / a lost window focus pauses the real game, the phone stops ringing behind the
    // pause menu and starts again after it, and a hidden tab's sound is suspended.
    async tabhide() {
      await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      await page.click('#play');
      await sleep(1500);
      const st2 = () => ev(async () => { const { audio } = await import('./src/audio.js'); return { paused: __game.paused, menu: document.getElementById('pause').classList.contains('show'), ctx: audio.state, ringing: audio.ringing, call: !!__interrupt.call, callT: __interrupt.call ? +__interrupt.call.t.toFixed(2) : null }; });
      await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(400);
      const a = await st2();
      await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(400);
      const b = await st2();
      await page.click('#resume');
      await sleep(500);
      await ev(() => window.dispatchEvent(new Event('blur')));
      await sleep(300);
      const c = await st2();
      await page.click('#resume');
      await sleep(400);
      // the phone: ringing, then the pause menu
      await ev(() => __interrupt.force('element'));
      await sleep(600);
      const d = await st2();
      await tap('KeyP');
      await sleep(1500);
      const e = await st2();
      await shot('p4_paused_while_ringing');
      await page.click('#resume');
      await sleep(400);
      const f = await st2();
      console.log('[t] tabhide', JSON.stringify({ hidden: a, shown: b, blur: c, ringing: d, pausedRinging: e, resumed: f }));
    },

    // The title screen: a new game (Spela) and a saved one (Fortsätt – Dag N · Veckodag, Nytt spel),
    // the Kontroller toggle, and the start toasts only on a new game.
    async titlecheck() {
      await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      await sleep(1200);
      const t1 = await ev(() => ({ play: document.getElementById('play').textContent, newgame: !document.getElementById('newgame').hidden }));
      // the Saab rolled out for the title must not have shoved a parked car out of its bay
      const shoved = await ev(() => { const g = __game, s = g.named.saab; return g.cars.filter((c) => c !== s && c.home && Math.hypot(c.x - s.x, c.z - s.z) < 12).map((c) => +Math.hypot(c.x - c.home.x, c.z - c.home.z).toFixed(2)); });
      console.log('[t] title neighbours of the rolled-out Saab, metres off their spot', JSON.stringify(shoved));
      await shot('p4_title_new');
      await page.click('#title-ctl');
      await sleep(500);
      await shot('p4_title_controls');
      const t2 = await ev(() => ({ ctl: document.getElementById('title').classList.contains('ctl'), vis: getComputedStyle(document.querySelector('#title .title-controls')).visibility }));
      await page.click('#title-ctl');
      await page.click('#play');
      await sleep(8000);
      const toastsNew = await ev(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent.slice(0, 40)));
      // a save at day 6 (index 5, the day not yet dawned: pending gate)
      await ev(() => localStorage.setItem('saab-and-run-v1', JSON.stringify({ v: 1, mission: 5, gate: true, clock: 840, kr: 512, patrol: { ordning: 64, reports: 23, log: [] } })));
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      await sleep(1200);
      const t3 = await ev(() => ({ play: document.getElementById('play').textContent, newgame: !document.getElementById('newgame').hidden }));
      await shot('p4_title_continue');
      await page.click('#play');
      await sleep(8000);
      const toastsCont = await ev(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent.slice(0, 40)));
      // Nytt spel: two clicks erase the save
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      await page.click('#newgame');
      const t4 = await ev(() => document.getElementById('newgame').textContent);
      await page.click('#newgame');
      await page.waitForFunction('window.__ready === true', { timeout: 90000 });
      await sleep(500);
      const t5 = await ev(() => ({ play: document.getElementById('play').textContent, save: localStorage.getItem('saab-and-run-v1') }));
      console.log('[t] title', JSON.stringify({ fresh: t1, controls: t2, toastsNew, saved: t3, toastsCont, newgameFirstClick: t4, afterNewGame: t5 }));
    },

    // The pause menu's Grafik button: Auto -> Hög -> Låg -> Auto, the label, and the choice kept
    // across a reload (old settings: gfx 'high' ignored, gfx 'low' kept; the URL wins).
    async quality() {
      const load = async (q = '') => { await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1${q}`, { waitUntil: 'load' }); await page.waitForFunction('window.__ready === true', { timeout: 90000 }); };
      const read = () => ev(async () => { const g = await import('./src/gfx.js'); const { hud } = await import('./src/game/hud.js'); hud.syncMenu(); return { q: g.getQuality(), tier: g.qualityInfo().tier, label: document.querySelector('#opt-gfx b').textContent, saved: localStorage.getItem('saab-and-run-settings') }; });
      await ev(() => localStorage.removeItem('saab-and-run-settings'));
      await load();
      const seq = [await read()];
      for (let k = 0; k < 3; k++) { await ev(() => document.getElementById('opt-gfx').click()); seq.push(await read()); }
      await ev(() => document.getElementById('opt-gfx').click());   // -> Hög
      await ev(() => document.getElementById('opt-gfx').click());   // -> Låg
      await load();
      const kept = await read();
      await load('&q=high');
      const url = await read();
      await ev(() => localStorage.setItem('saab-and-run-settings', JSON.stringify({ music: true, sound: true, gfx: 'high' })));
      await load();
      const oldHigh = await read();
      await ev(() => localStorage.setItem('saab-and-run-settings', JSON.stringify({ music: true, sound: true, gfx: 'low' })));
      await load();
      const oldLow = await read();
      await ev(() => { document.getElementById('pause').classList.add('show'); });
      await sleep(300);
      await shot('p4_pause_quality');
      await ev(() => localStorage.removeItem('saab-and-run-settings'));
      console.log('[t] quality', JSON.stringify({ seq: seq.map((r) => `${r.q}/${r.tier} "${r.label}"`), kept, url, oldHigh, oldLow }));
    },

    // Named cars come back; borrowed traffic cars don't pile up; Ove is where his car is.
    async recycle() {
      const r1 = await ev(() => {
        const g = __game, s = g.named.saab;
        g.missions.index = 7;
        s.damage(9999, g);
        // Ove 150 m away from both the wreck and home
        g.player.teleport(s.x + 150, s.z - 20, 0);
        s.deadT = 30;
        return { dead: s.dead };
      });
      await sleep(3000);
      const r2 = await ev(() => { const g = __game, s = g.named.saab; return { dead: s.dead, inWorld: g.cars.includes(s), plate: s.plate, atHome: Math.hypot(s.x - s.home.x, s.z - s.home.z) < 1 }; });
      // borrow a traffic car, leave it, go far away
      const r3 = await ev(() => {
        const g = __game, c = g.cars.find((c) => c.traffic && !c.dead);
        g.player.teleport(c.x + 3, c.z, 0);
        g.enterCar(c);
        const before = g.cars.length;
        g.exitCar(true);
        c.leftAt = g.time - 40;
        g.player.teleport(c.x + 200, c.z, 0);
        window.__bc = c;
        return { wasTraffic: !!c.wasTraffic, cars: before };
      });
      await sleep(3000);
      const r4 = await ev(() => ({ gone: !__game.cars.includes(window.__bc), cars: __game.cars.length, traffic: __game.cars.filter((c) => c.traffic).length }));
      // seated: player.x/z follow the car
      await ev(() => { const g = __game; g.enterCar(g.named.saab); g.playerCar.place(0, -40 + 2.75, Math.PI / 2); });
      await hold(['KeyW'], 2000);
      const r5 = await ev(() => { const g = __game, c = g.playerCar, p = g.player; return { car: [+c.x.toFixed(1), +c.z.toFixed(1)], player: [+p.x.toFixed(1), +p.z.toFixed(1)] }; });
      console.log('[t] recycle', JSON.stringify({ wrecked: r1, saab: r2, borrowed: r3, after: r4, seated: r5 }));
    },

    // Small talk by day: nothing thanks Ove early, no cat before day 4, Adrian's car-buying lines
    // retired after day 5, no "god morgon"; the 'katten' errand only from day 4.
    async smalltalk() {
      const r = await ev(() => {
        const g = __game, m = g.missions, out = {};
        // [pattern, from, to (missions.index; to exclusive), keys (all if absent), gate (true: only with
        // the next day dawned, false: only the evening before, undefined: either)]
        const NEW = ['parvaneh', 'patrick', 'sara', 'nasanin'];
        const bad = [
          [/släpet\. Igen/, 0, 2], [/Katten|katten|Kissen|kattmat/, 0, 4], [/i går/, 0, 3], [/köpa bil|om Audi\?/, 5, 8], [/[Gg]od morgon|frukost|Fin morgon/, 0, 8], [/L-skylt/, 0, 8],
          // before day 1's scene the new family doesn't know Ove (phase 4 round 2)
          [/Ove|saffransris|middag|IT-konsult|snäll inuti/, 0, 1, NEW],
          // Patrick fell on day 2's morning: no ladder and no "Släpet står" once that day has dawned
          [/stege igen|Släpet står/, 1, 2, ['parvaneh', 'patrick'], true], [/stege igen|Släpet står/, 2, 8, ['parvaneh', 'patrick']],
          // Anita's "Tack för i går" (day 3 was hers) only on day 4
          [/Tack för i går/, 3, 4, ['anita'], false], [/Tack för i går/, 4, 5, ['anita'], true], [/Tack för i går/, 5, 8, ['anita']],
        ];
        const gate0 = m.gateOpen;
        for (let day = 0; day <= 7; day++) {
          for (const gate of [true, false]) {
            if (!gate && day === 0) continue;
            m.index = day; m.gateOpen = gate;
            const seen = new Set();
            for (const k of Object.keys(g.npcs)) for (let i = 0; i < 300; i++) for (const l of g.chatterFor(k)) seen.add(`${k}: ${l}`);
            const hits = [];
            for (const l of seen) {
              const k = l.split(':')[0], text = l.slice(k.length + 2);
              for (const [re, from, to, keys, gt] of bad) if (re.test(text) && day >= from && day < to && (!keys || keys.includes(k)) && (gt === undefined || gt === gate)) hits.push(l);
            }
            if (hits.length) out[`${day}${gate ? '' : ' (evening)'}`] = hits;
          }
        }
        m.index = 0; m.gateOpen = gate0;
        const day0 = {};
        for (const k of NEW) day0[k] = g.chatterFor(k).slice();
        return { hits: out, day0 };
      });
      console.log('[t] smalltalk forbidden lines', JSON.stringify(r.hits), verdict('smalltalk', !Object.keys(r.hits).length));
      console.log('[t] smalltalk day 0', JSON.stringify(r.day0));
      // Every errand's availability by day (missions.index 0..7): the day gates (DESIGN 4.3)
      const k = await ev(async () => {
        const { TEMPLATES } = await import('./src/game/interruptions.js');
        const g = __game, out = {};
        for (const t of TEMPLATES) { out[t.id] = ''; for (let day = 0; day <= 7; day++) { g.missions.index = day; out[t.id] += __interrupt.available(t) ? 'x' : '.'; } }
        g.missions.index = 0;
        return out;
      });
      console.log('[t] errands available by day 0..7', JSON.stringify(k));
      // The chat prompt, and the first call of a new game
      const p = await ev(() => { const g = __game, n = g.npc('anita'), s = g.freeSpot(n.x, n.z, 1.4, 1.8); g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z)); return +__interrupt.nextT.toFixed(0); });
      await frames(10);
      console.log('[t] chat prompt', JSON.stringify(await ev(() => document.getElementById('prompt')?.textContent || '')), '| first call of a new game in', p, 's');
    },

    // Phase 4 round 2 checks that need no real title: the clock (14:30 cap, the wrap at midnight, the
    // save), a kick on a sleeping car, Ove walking into Patrick's trailer, Sonja's flowers after the
    // story, the dropped errand, the meter during a mission and KAOS held after it.
    async r2checks() {
      // -- clock
      const c = await ev(async () => {
        const g = __game, out = {};
        g.clockMin = 14 * 60 + 29.8;
        await new Promise((r) => setTimeout(r, 2500));
        out.cap = g.clockText();
        g.clockCap = () => Infinity;
        g.clockMin = 24 * 60 - 0.2;
        await new Promise((r) => setTimeout(r, 2500));
        out.wrap = g.clockText();
        g.save();
        out.saved = JSON.parse(localStorage.getItem('saab-and-run-v1')).clock;
        delete g.clockCap;
        g.missions.index = 7;
        g.clockMin = 16 * 60 + 29.8;
        await new Promise((r) => setTimeout(r, 2500));
        out.afterStory = g.clockText();
        g.missions.index = 0; g.setClock(10, 30);
        return out;
      });
      console.log('[t] clock', JSON.stringify(c), verdict('clock', c.cap === '14:30' && c.wrap.startsWith('00:') && c.saved < 1440 && c.afterStory === '16:30'));
      // -- kick a sleeping parked car
      const k = await ev(async () => {
        const g = __game, p = g.player;
        const car = g.cars.filter((c) => c.asleep && !c.violation && !c.name && !c.trailer).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
        const d = car.spec.wid / 2 + 0.95, x = car.x + lx * d + fx * 1.3, z = car.z + lz * d + fz * 1.3;
        p.teleport(x, z, Math.atan2(-lx, -lz));
        g.kickTyre(car, -lx, -lz);
        const asleep0 = car.asleep;
        let maxRoll = 0;
        for (let i = 0; i < 20; i++) { await new Promise((r) => requestAnimationFrame(r)); maxRoll = Math.max(maxRoll, Math.abs(car._sus.r)); }
        return { asleepAfterKick: asleep0, maxRoll: +maxRoll.toFixed(4), rvLeft: +car._sus.rv.toFixed(3) };
      });
      console.log('[t] kick sleeping car', JSON.stringify(k), verdict('kick', k.maxRoll > 0.005));
      // -- Ove walks into Patrick's trailer from the side
      const t0 = await ev(() => {
        const g = __game, c = g.named.patrickCar, t = c.trailer, p = g.player;
        const lx = Math.cos(t.yaw), lz = -Math.sin(t.yaw);
        let side = 1;
        if (!g.spotFree(t.x + lx * 2.2, t.z + lz * 2.2)) side = -1;
        const x = t.x + lx * 2.2 * side, z = t.z + lz * 2.2 * side, yaw = Math.atan2(t.x - x, t.z - z);
        p.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true;
        return { hx: t.obb.hx, side };
      });
      await hold(['KeyW'], 2500);
      const t1 = await ev(() => { const g = __game, t = g.named.patrickCar.trailer, p = g.player, lx = Math.cos(t.yaw), lz = -Math.sin(t.yaw); return { lat: +((p.x - t.x) * lx + (p.z - t.z) * lz).toFixed(2), r: p.r }; });
      await shot('r2_trailerwalk');
      console.log('[t] trailer walk', JSON.stringify({ ...t0, ...t1 }), verdict('trailer walk', Math.abs(t1.lat) >= t0.hx + t1.r - 0.05, 'OK (outside the box)', 'BAD (inside the trailer)'));
      // -- a carjack: the driver set down by the car walks on from the nearest sidewalk
      const cj0 = await ev(() => {
        const g = __game, c = g.cars.filter((c) => c.traffic && c.driverBust && !c.dead).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
        if (!c) return null;
        c.ai = null; c.vx = c.vz = 0;
        const e = g.exitSpot(c, 1); g.player.teleport(e.x, e.z, 0);
        const before = new Map(g.peds.map((p) => [p, [p.char.x, p.char.z]]));
        g.enterCar(c);
        const ped = g.peds.find((p) => { const b = before.get(p); return Math.hypot(p.char.x - b[0], p.char.z - b[1]) > 5; });
        // Ove drives off a little way (the car stays out of the driver's way)
        g.playerCar.place(c.x + Math.sin(c.yaw) * 14, c.z + Math.cos(c.yaw) * 14, c.yaw);
        window.__cj = ped || null;
        return ped ? { x: ped.char.x, z: ped.char.z, toTarget: +Math.hypot(ped.target[0] - ped.char.x, ped.target[1] - ped.char.z).toFixed(1) } : null;
      });
      await sleep(14000);
      const cj1 = await ev(() => { const g = __game, p = window.__cj; if (g.playerCar) g.exitCar(true); return p ? { x: p.char.x, z: p.char.z, k: p.k, crossing: p.crossing } : null; });
      const walked = cj0 && cj1 ? +Math.hypot(cj1.x - cj0.x, cj1.z - cj0.z).toFixed(1) : null;
      console.log('[t] carjack driver', JSON.stringify({ firstLeg: cj0?.toTarget, walked14s: walked }), verdict('carjack rehome', !cj0 || (cj0.toTarget < 25 && walked > 6)));
      // -- Sonja's flowers after the story (as after a reload: storyWorld at load with index 7)
      const f = await ev(() => { const g = __game; g.missions.index = 7; g.storyWorld(); const a = g.graveFlowers; g.storyWorld(); const same = a === g.graveFlowers; const s = window.__lm('sonjaGrave'); return { flowers: !!a, same, d: a ? +Math.hypot(a.x - s.x, a.z - s.z).toFixed(2) : null }; });
      console.log('[t] grave flowers', JSON.stringify(f), verdict('grave flowers', f.flowers && f.same && f.d < 1.5));
      await ev(() => { __game.missions.index = 0; });
      // -- an errand dropped by a story day: the neighbour says so after the intro
      await ev(() => { const g = __game, s = window.__lm('oveStart'); g.player.teleport(s.x, s.z, s.yaw); __interrupt.force('skotta', { quick: true }); });
      await frames(10);
      await ev(() => __game.missions.begin());
      await until(() => __game.missions.state === 'running', 60000);
      await sleep(2600);
      const dn = await ev(() => ({ text: document.getElementById('hud')?.textContent.match(/[^.!?]*tar det i morgon[^.!?]*/)?.[0] || '', note: __interrupt.dropNote }));
      console.log('[t] dropped errand', JSON.stringify(dn), verdict('dropped errand', !!dn.text && !dn.note));
      // -- during the mission the meter stops at 1; after it, KAOS waits 12 s
      const o = await ev(() => { const g = __game; g.patrol.addOrdning(-100); return +g.patrol.ordning.toFixed(2); });
      await ev(() => __game.missions.abort());
      await frames(5);
      const k0 = await ev(() => { const g = __game; g.patrol.addOrdning(-100); return { t: g.time, hold: g.patrol.eventHold }; });
      await until(() => __game.patrol.lastKaos > 0, 30000).catch(() => {});
      const k1 = await ev(() => ({ kaos: __game.patrol.lastKaos }));
      console.log('[t] kaos hold', JSON.stringify({ ordningDuringMission: o, hold: +k0.hold.toFixed(1), kaosAfter: +(k1.kaos - k0.t).toFixed(1) }), verdict('kaos hold', o >= 1 && k1.kaos - k0.t >= 11.5));
    },

    // A reload in the middle of a day replays only the short intro (RD_INDEX = missions.index, default 3:
    // day 4; a day without a retryIntro plays its whole intro again); a save after the whole story
    // offers "Fortsätt · Fri patrull".
    async reloadday() {
      const idx = +(process.env.RD_INDEX ?? 3);
      await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1&mission=${idx}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000, polling: 250 });
      await ev(() => __game.missions.begin());
      await until(() => __game.missions.state === 'running', 60000);
      const s1 = await ev(() => { __game.save(); return JSON.parse(localStorage.getItem('saab-and-run-v1')); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000, polling: 250 });
      const r = await ev(async () => {
        const g = __game, n = [];
        const D = g.dialog.bind(g);
        g.dialog = (lines) => { n.push(lines.length); return D(lines); };
        const gave = [...g.missions.gaveUp];
        g.missions.begin();
        await new Promise((res) => setTimeout(res, 300));
        g.dialog = D;
        return { index: g.missions.index, gaveUp: gave, introLines: n[0], retryIntro: g.missions.current?.retryIntro?.length ?? null };
      });
      console.log('[t] reload mid-day', JSON.stringify({ saved: { mission: s1.mission, begun: s1.begun }, ...r }), r.retryIntro ? verdict('reload mid-day', r.introLines === r.retryIntro, 'OK (short intro)') : 'this day has no retryIntro (missions.js)');
      await ev(() => localStorage.setItem('saab-and-run-v1', JSON.stringify({ v: 1, mission: 7, kr: 900, patrol: { ordning: 90, reports: 40, log: [] } })));
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 90000, polling: 250 });
      const t = await ev(() => document.getElementById('play').textContent);
      await shot('r2_title_alldone');
      console.log('[t] title after the story', JSON.stringify(t), verdict('title after the story', /Fri patrull/.test(t)));
      await ev(() => localStorage.removeItem('saab-and-run-v1'));
    },

    // The real title (no ?test): Enter / Space / the pad's A start it; not while Kontroller is open, not
    // a click on the scene; Tab walks the buttons. And a continued day-2 morning: Patrick (in hospital)
    // is not at his door, on the title or after Fortsätt.
    async titlekeys() {
      const load = async (q = '?fresh=1') => { await page.goto(`http://127.0.0.1:${PORT}/index.html${q}`, { waitUntil: 'load' }); await page.waitForFunction('window.__ready === true', { timeout: 90000 }); await sleep(400); };
      const started = () => ev(() => __game.started);
      const out = {};
      await load();
      await page.keyboard.press('Tab');
      out.tab = await ev(() => document.activeElement?.id || document.activeElement?.tagName);
      await ev(() => document.activeElement.blur());
      await page.keyboard.press('Enter'); await frames(3);
      out.enter = await started();
      await load();
      await page.click('#title-ctl'); await sleep(200);
      await page.keyboard.press('Space'); await frames(3);
      out.spaceWithControlsOpen = await started();
      await ev(() => { document.getElementById('title').classList.remove('ctl'); document.activeElement.blur(); });
      await page.keyboard.press('Space'); await frames(3);
      out.space = await started();
      await load();
      await ev(() => { window.__pad = { connected: true, index: 0, id: 'test', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) }; navigator.getGamepads = () => [window.__pad]; });
      await frames(3);
      await ev(() => { window.__pad.buttons[0] = { value: 1, pressed: true }; });
      await frames(3);
      out.padA = await started();
      await ev(() => { navigator.getGamepads = () => []; });
      await load();
      await page.mouse.click(900, 300); await frames(3);
      out.clickOnScene = await started();
      // day 2 dawned, saved, reloaded: Patrick hidden on the title and after Fortsätt
      await ev(() => localStorage.setItem('saab-and-run-v1', JSON.stringify({ v: 1, mission: 1, gate: false, clock: 640, kr: 120, patrol: { ordning: 55, reports: 4, log: [] } })));
      await load('');
      const pt = await ev(() => ({ patrick: __game.npc('patrick').state, play: document.getElementById('play').textContent }));
      await sleep(1500);
      const pt2 = await ev(() => __game.npc('patrick').state);
      await page.keyboard.press('Enter');
      await sleep(6000);
      const pt3 = await ev(() => { const g = __game, n = g.npc('patrick'); return { state: n.state, visible: n.root.visible, d: +Math.hypot(n.x - g.player.x, n.z - g.player.z).toFixed(1) }; });
      await ev(() => { const g = __game, d = window.__lm('parvanehHouse'); const yaw = d.yaw + Math.PI; g.player.teleport(d.x + Math.sin(d.yaw) * 5, d.z + Math.cos(d.yaw) * 5, yaw); g.cam.yaw = yaw; g.cam.snapNext = true; });
      await sleep(1500);
      await shot('r2_day2_parvaneh_door');
      const pt4 = await ev(() => __game.npc('patrick').state);
      out.day2 = { title: pt, titleLater: pt2, afterStart: pt3, atTheDoor: pt4 };
      await ev(() => localStorage.removeItem('saab-and-run-v1'));
      const ok = out.tab && out.tab !== 'BODY' && out.enter && !out.spaceWithControlsOpen && out.space && out.padA && !out.clickOnScene && pt.patrick === 'hidden' && pt2 === 'hidden' && pt3.state === 'hidden' && pt4 === 'hidden';
      console.log('[t] titlekeys', JSON.stringify(out), verdict('titlekeys', ok));
    },

    // Phase 4 round 2: game time vs physics below 30 fps. A frame hook busy-waits DIL_MS (48) ms, so
    // the game runs at ~20 fps: g.time, an errand's patience timer and the clock must advance with the
    // fixed steps (stepN / 60), not with the wall clock (they ran up to 1.5x faster than the world).
    async dilation() {
      const busy = +(process.env.DIL_MS || 48);
      const run = (ms) => ev(async (ms) => {
        const g = __game;
        g.interrupts.force('punktering', { quick: true });
        const hook = () => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } };
        if (ms) g.onFrame(hook);
        await new Promise((r) => setTimeout(r, 300));
        const t0 = g.time, s0 = g.stepN, c0 = g.clockMin, e0 = g.interrupts.active?.timer ?? 0, f0 = g.frame, w0 = performance.now();
        await new Promise((r) => setTimeout(r, 4000));
        const r = { gameT: +(g.time - t0).toFixed(2), physT: +((g.stepN - s0) / 60).toFixed(2), errandT: +(e0 - (g.interrupts.active?.timer ?? 0)).toFixed(2), clockMin: +(g.clockMin - c0).toFixed(3), wall: +((performance.now() - w0) / 1000).toFixed(2), fps: +((g.frame - f0) / ((performance.now() - w0) / 1000)).toFixed(1) };
        if (ms) g.offFrame(hook);
        g.interrupts.abort();
        r.ratio = +(r.gameT / Math.max(0.01, r.physT)).toFixed(3);
        return r;
      }, ms);
      const a = await run(0);
      const b = await run(busy);
      console.log('[t] dilation normal', JSON.stringify(a));
      console.log('[t] dilation busy', busy, 'ms', JSON.stringify(b), verdict('dilation', Math.abs(b.ratio - 1) < 0.02, 'OK', 'BAD (game time != physics)'));
    },

    // Programs compiled in game by the errands (perf review: 'nyckeln' compiled 2, 'element' 1: the
    // first errand target's beacon, the fetch item, the work pose's tool). Each template is forced,
    // Ove stands at its target with the item in view and holds E for a second; renderer.info.programs
    // must not grow. EP_IDS=a,b to pick.
    async errandprog() {
      const ids = process.env.EP_IDS ? process.env.EP_IDS.split(',') : ['element', 'forskolan', 'mobilen', 'punktering', 'nyckeln', 'rune', 'skotta', 'katten', 'skjuts'];
      await frames(60);
      const out = {};
      const p00 = await ev(() => window.__stats().programs);
      for (const id of ids) {
        const p0 = await ev(() => window.__stats().programs);
        await ev((id) => { const g = __game, s = window.__lm('oveStart'); if (g.playerCar) g.exitCar(true); g.player.teleport(s.x, s.z, s.yaw); g.player.state = 'normal'; __interrupt.force(id, { quick: true }); }, id);
        await frames(20);
        const kind = await ev(() => { const g = __game, t = __interrupt.target(), st = __interrupt.stage; if (t) { const s = g.freeSpot(t.x, t.z, 1.6, 2.4); const yaw = Math.atan2(t.x - s.x, t.z - s.z); g.player.teleport(s.x, s.z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.25; g.cam.snapNext = true; } return st?.kind; });
        await frames(40);
        if (kind === 'holdAt') { await ev(() => { const g = __game, t = __interrupt.target(); g.player.teleport(t.x, t.z, g.player.yaw); }); await frames(3); await hold(['KeyE'], 1000); }
        await frames(50);
        const p1 = await ev(() => window.__stats().programs);
        out[id] = p1 - p0;
        await ev(() => __interrupt.abort());
        await frames(5);
      }
      const p11 = await ev(() => window.__stats().programs);
      console.log('[t] errandprog programs added', JSON.stringify(out), 'total', p11 - p00, verdict('errandprog', Object.values(out).every((v) => v === 0), 'OK', 'COMPILES'));
    },

    // Two identical tags side by side merge ("2 × ..."); names only close by.
    async tagmerge() {
      await ev(() => {
        const g = __game, s = window.__lm('oveStart');
        const P = g.patrol;
        const cars = P.forceSpawn(2, { x: s.x + 14, z: s.z }, { smitare: false, kinds: ['carfree'], radius: 30 });
        window.__tm = cars.map((c) => [c.x.toFixed(1), c.z.toFixed(1)]);
        g.player.teleport(s.x - 6, s.z, s.yaw); g.cam.yaw = s.yaw; g.cam.pitch = 0.12; g.cam.snapNext = true;
      });
      await frames(20);
      const tags = await ev(() => [...document.querySelectorAll('#tags .tag3d')].filter((e) => e.style.display !== 'none').map((e) => e.textContent));
      await shot('p4_tagmerge');
      console.log('[t] tagmerge', JSON.stringify({ cars: await ev(() => window.__tm), tags }));
    },

    // Forskolan on foot, walked like a player following the arrow: Nasanin follows Ove's trail; the
    // objective must not flip between "Du glömde Nasanin!" and the drop-off text.
    async companion() {
      await ev(() => { __interrupt.force('forskolan', { quick: true }); });
      await frames(5);
      await ev(() => { const g = __game, n = g.npc('nasanin'); const s = g.freeSpot(n.x, n.z, 1.4, 1.8); g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z)); g.cam.snapNext = true; });
      await frames(20);
      const picked = await ev(() => __interrupt.active?.i);
      let flips = 0, last = null, forgot = 0, maxD = 0, k = 0;
      await page.keyboard.down('KeyW');
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        const r = await ev(() => {
          const g = __game, a = __interrupt.active, p = g.player, n = g.npc('nasanin');
          if (!a) return { done: true };
          // a player following the minimap route: the first route point more than 4 m away; pressed
          // against something for 1.5 s: a step to the side
          const B = (window.__bot ||= { t: 0, x: p.x, z: p.z, side: 0 });
          const r = g.route || [];
          let tgt = null;
          for (const q of r) if (Math.hypot(q[0] - p.x, q[1] - p.z) > 4) { tgt = q; break; }
          if (!tgt && r.length) tgt = r[r.length - 1];
          if (B.side > 0) { B.side -= 0.25; g.cam.yaw += 0; }
          else if (tgt) g.cam.yaw = Math.atan2(tgt[0] - p.x, tgt[1] - p.z);
          B.t += 0.25;
          if (B.t > 1.5) { if (Math.hypot(p.x - B.x, p.z - B.z) < 0.5 && B.side <= 0) { g.cam.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; B.side = 1; } B.t = 0; B.x = p.x; B.z = p.z; }
          return { sub: a.stage.sub || '', i: a.i, d: Math.hypot(n.x - p.x, n.z - p.z), with: g.isWithOve(n), p: [+p.x.toFixed(0), +p.z.toFixed(0)] };
        });
        if (r.done) break;
        const f = /glömde/.test(r.sub);
        if (last !== null && f !== last) flips++;
        if (f) forgot++;
        last = f;
        maxD = Math.max(maxD, r.d);
        if (k++ % 20 === 0) console.log('[t] companion', JSON.stringify(r));
        if (k === 60) await shot('p4_companion');
        await sleep(250);
      }
      await page.keyboard.up('KeyW');
      const res = await ev(() => ({ done: __interrupt.done, failed: __interrupt.failed, t: +__game.time.toFixed(0) }));
      console.log('[t] companion result', JSON.stringify({ picked, flips, forgotSamples: forgot, maxDist: +maxD.toFixed(1), ...res }));
    },

    // The banner band (light, no blur) over a bright view, and toasts below the letterbox in a
    // dialogue (they used to slide under its top bar).
    async p4ui() {
      await ev(() => { const g = __game, s = window.__lm('oveStart'); g.player.teleport(s.x, s.z, s.yaw); g.cam.yaw = s.yaw + 0.4; g.cam.pitch = 0.1; g.cam.snapNext = true; });
      await frames(20);
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.showBanner('KLART', 'Elementet klickar · +10 Ordning · +35 kr', 'good', 0, 'Avbrott'); });
      await sleep(900);
      await shot('p4_banner_good');
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.showBanner('Dag 3', 'Onsdagsmorgon', 'mission', 0, 'Ny dag'); });
      await sleep(900);
      await shot('p4_banner_day');
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.hideBanner(); hud.showBanner('KAOS I OMRÅDET', 'Anders kallar till extra föreningsmöte · −50 kr', 'chaos', 0); });
      await sleep(900);
      await shot('p4_banner_chaos');
      await ev(async () => {
        const { hud } = await import('./src/game/hud.js');
        hud.hideBanner();
        hud.letterbox(true);
        __game.radio('anita', 'Det är så varmt hos oss nu, Ove.');
        hud.toast('Ove betalar för det han förstört: 15 kr', 'bad');
        __game.dialog([['parvaneh', 'Ove! Du kom! Patrick har... ja. Du ser ju själv.'], ['ove', 'Hmpf.']]);
      });
      await sleep(1200);
      await shot('p4_letterbox_toasts');
      const r = await ev(() => { const t = document.querySelector('#toasts .toast')?.getBoundingClientRect(), lb = document.querySelector('#letterbox .lb-top').getBoundingClientRect(); return { toastTop: t ? Math.round(t.top) : null, barBottom: Math.round(lb.bottom) }; });
      console.log('[t] p4ui', JSON.stringify(r));
    },

    // 60 traffic cars spawned in view (with a driver bust) and removed through the game's removeCar,
    // every 5th one carjacked first: renderer.info must stay flat (geometries, textures, programs).
    async carcycle() {
      const info = () => ev(() => { const r = window.__stats(); return { geos: r.geos, textures: r.textures, programs: r.programs, cars: r.cars }; });
      await frames(30);
      // one of each kind first, so lazily built shared things (models, plate pages) exist
      await ev(() => { const g = __game, p = g.player; window.__cc0 = []; for (let k = 0; k < 8; k++) { const c = g.spawnTrafficCar(Math.random, null); if (c) { c.place(p.x + 5 + k, p.z + 7, 0.3); window.__cc0.push(c); } } });
      await frames(10);
      await ev(() => { const g = __game; for (const c of window.__cc0) if (g.cars.includes(c)) g.removeCar(c); });
      await frames(10);
      // control: the same time with no cars spawned (the people's far levels and other lazy things
      // are built in idle time and count too)
      const c0 = await info();
      await frames(240);
      const c1 = await info();
      console.log('[t] carcycle control (240 frames, no cars)', 'delta geos', c1.geos - c0.geos, 'textures', c1.textures - c0.textures, 'programs', c1.programs - c0.programs);
      const a = await info();
      const N = +(process.env.CC_N || 60);
      for (let k = 0; k < N; k++) {
        if (k && k % 30 === 0) console.log('[t] carcycle at', k, JSON.stringify(await info()));
        await ev((k) => {
          const g = __game, p = g.player;
          const c = g.spawnTrafficCar(Math.random, null);
          window.__cc = c;
          if (!c) return;
          c.place(p.x + 5 + (k % 3), p.z + 7, 0.3);
          if (k % 5 === 4) { g.enterCar(c); g.exitCar(true); }
        }, k);
        await frames(2);
        await ev(() => { const g = __game, c = window.__cc; if (c && g.cars.includes(c)) g.removeCar(c); window.__cc = null; });
      }
      await frames(10);
      const b = await info();
      console.log('[t] carcycle before', JSON.stringify(a), 'after', N, JSON.stringify(b), 'delta geos', b.geos - a.geos, 'textures', b.textures - a.textures, 'programs', b.programs - a.programs);
    },

    // Phase 4 round 2b: the chase camera under low roofs. The Saab under the bus shelter at
    // Solrosvägen (where pursuit_0 put it: the camera sat right under the roof's edge, the top third
    // of the picture all roof), driving out of it, under the Akut canopy and driving in, in Ove's
    // garage both ways, and on the road past the shelter (unchanged). Per view: roof = share of a
    // 9 x 7 ray grid over the picture meeting an overhang (camBlocks over 1 m wide) within 14 m, top =
    // the same over the top third, near = the top third's rays meeting one within 4 m of the lens,
    // head = headroom (m) under the lowest overhang over the camera (null: none). Under a roof the
    // camera must keep >= 0.9 m headroom and no roof close over the lens (near <= 0.2; a big canopy
    // 1.6 m up may show in the top of the picture: it is architecture, not a lid on the lens).
    async camroof() {
      const view = (label) => ev(async (label) => {
        const { camBlocks } = await import('./src/world/town.js');
        const { THREE, camera } = await import('./src/gfx.js');
        camera.updateMatrixWorld();
        const o = camera.position, rc = new THREE.Raycaster(), box = new THREE.Box3(), hit = new THREE.Vector3();
        const bl = camBlocks.filter((b) => b.x1 - b.x0 > 1 && b.z1 - b.z0 > 1 && b.x1 > o.x - 15 && b.x0 < o.x + 15 && b.z1 > o.z - 15 && b.z0 < o.z + 15);
        let n = 0, h = 0, nt = 0, ht = 0, hn = 0, head = null;
        for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
          rc.setFromCamera(new THREE.Vector2(-0.9 + i * 0.225, -0.9 + j * 0.3), camera);
          let d = 99;
          for (const b of bl) { box.min.set(b.x0, b.bottom, b.z0); box.max.set(b.x1, b.top, b.z1); if (rc.ray.intersectBox(box, hit)) d = Math.min(d, hit.distanceTo(o)); }
          n++; if (d < 14) h++;
          if (j >= 5) { nt++; if (d < 14) ht++; if (d < 4) hn++; }
        }
        for (const b of bl) if (o.x > b.x0 && o.x < b.x1 && o.z > b.z0 && o.z < b.z1 && b.bottom > o.y - 0.05) head = Math.min(head ?? 99, +(b.bottom - o.y).toFixed(2));
        const c = __game.playerCar;
        return { label, roof: +(h / n).toFixed(2), top: +(ht / nt).toFixed(2), near: +(hn / nt).toFixed(2), head, cam: [+o.x.toFixed(1), +o.y.toFixed(1), +o.z.toFixed(1)], boom: +__game.cam.boom.toFixed(2), car: c ? [+c.x.toFixed(1), +c.z.toFixed(1), +c.speed.toFixed(1)] : null };
      }, label);
      const judged = (v) => (v.head == null || v.head >= 0.9) && v.near <= 0.2;
      const check = async (label, under = true) => {
        const v = await view(label);
        console.log('[t] camroof', JSON.stringify(v), under ? verdict('camroof ' + label, judged(v)) : '(reported)');
        return v;
      };
      // The shelter: the overhang nearest the busStop landmark; the Saab under its front half,
      // along it, both ways.
      const sh = await ev(async () => {
        const { camBlocks } = await import('./src/world/town.js');
        const s = window.__lm('busStop');
        let best = null, bd = 1e9;
        for (const b of camBlocks) { const w = b.x1 - b.x0, d = b.z1 - b.z0; if (w < 1.5 || d < 1.5 || w > 6 || d > 6) continue; const dd = Math.hypot((b.x0 + b.x1) / 2 - s.x, (b.z0 + b.z1) / 2 - s.z); if (dd < bd) { bd = dd; best = b; } }
        const along = best.x1 - best.x0 > best.z1 - best.z0;
        // (the front half: towards the road, away from the back glass)
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        return { x: (best.x0 + best.x1) / 2 + fx * 0.35, z: (best.z0 + best.z1) / 2 + fz * 0.35, yaw: along ? Math.PI / 2 : 0, fx, fz, b: [best.x0, best.z0, best.x1, best.z1, best.bottom] };
      });
      console.log('[t] shelter', JSON.stringify(sh));
      const put = (x, z, yaw, v = 0) => ev(({ x, z, yaw, v }) => { const g = __game; if (!g.playerCar) g.enterCar(g.named.saab); const c = g.playerCar; c.place(x, z, yaw); c.vx = Math.sin(yaw) * v; c.vz = Math.cos(yaw) * v; g.cam.yaw = yaw; g.cam.pitch = 0.15; g.cam.snapNext = true; }, { x, z, yaw, v });
      await put(sh.x, sh.z, sh.yaw); await frames(30);
      await check('shelter'); await shot('camroof_shelter');
      await put(sh.x, sh.z, sh.yaw + Math.PI); await frames(30);
      await check('shelter_rev'); await shot('camroof_shelter_rev');
      // Out of it with the throttle: the camera follows out without rising into the roof's edge.
      await put(sh.x, sh.z, sh.yaw); await frames(20);
      let worst = null;
      await page.keyboard.down('KeyW');
      const seq = [];
      for (let k = 0; k < 10; k++) {
        await sleep(160);
        const v = await view('exit ' + k), bad = (u) => (judged(u) ? 0 : 1) + u.near;
        seq.push(`${v.car[0]}:${v.cam[0]}/${v.cam[1]}/${v.near}`);
        if (!worst || bad(v) > bad(worst)) worst = v;
        if (k === 3) await shot('camroof_shelter_exit');
      }
      await page.keyboard.up('KeyW');
      console.log('[t] camroof exit (car x: cam x / y / near)', seq.join(' '));
      console.log('[t] camroof', JSON.stringify(worst), verdict('camroof shelter exit', judged(worst)));
      // The Centrum stop's shelter, driven into from the street (its open front: nose in under the
      // roof until the back screen stops the car), backed out, then backed in from the street (the
      // camera passes the shelter on its way out behind it: at most 3 samples, 0.45 s, under its
      // roof, and the last four clear).
      const sc = await ev(async () => {
        const { camBlocks } = await import('./src/world/town.js');
        const s = window.__lm('busStopCentrum');
        let best = null, bd = 1e9;
        for (const b of camBlocks) { const w = b.x1 - b.x0, d = b.z1 - b.z0; if (w < 1.5 || d < 1.5 || w > 6 || d > 6) continue; const dd = Math.hypot((b.x0 + b.x1) / 2 - s.x, (b.z0 + b.z1) / 2 - s.z); if (dd < bd) { bd = dd; best = b; } }
        return { x: (best.x0 + best.x1) / 2, z: (best.z0 + best.z1) / 2, yaw: s.yaw + Math.PI };
      });
      for (const [key, ms, pre] of [['KeyW', 2200, 'in'], ['KeyS', 1600, ''], ['KeyS', 3000, 'rev']]) {
        const fx = Math.sin(sc.yaw), fz = Math.cos(sc.yaw);
        if (pre === 'in') { await put(sc.x - fx * 11, sc.z - fz * 11, sc.yaw, 5); await frames(3); }
        // (backing in: facing the street, 8 m out)
        if (pre === 'rev') { await put(sc.x - fx * 8, sc.z - fz * 8, sc.yaw + Math.PI, 0); await frames(10); }
        const seq = [], vs = [];
        let w = null;
        await page.keyboard.down(key);
        const t0 = Date.now();
        for (let k = 0; Date.now() - t0 < ms + 1200; k++) {
          if (Date.now() - t0 > ms) await page.keyboard.up(key);
          await sleep(150);
          const v = await view('centrum ' + key + ' ' + k);
          const into = ((v.car[0] - sc.x) * fx + (v.car[1] - sc.z) * fz).toFixed(1);
          seq.push(`${into}:${v.cam[1]}/${v.near}${v.head != null ? '/h' + v.head : ''}`);
          vs.push(judged(v));
          if (!w || (judged(w) && !judged(v)) || (judged(w) === judged(v) && v.near > w.near)) w = v;
          if (k === (pre === 'rev' ? 15 : 9)) await shot('camroof_centrum_' + (pre || 'out'));
        }
        await page.keyboard.up(key);
        if (pre === 'rev') await shot('camroof_centrum_rev_end');
        console.log(`[t] camroof centrum ${pre || 'out'} (car centre past the shelter's middle, m: cam y / near / headroom)`, seq.join(' '));
        const nBad = vs.filter((j) => !j).length, ok = nBad <= 3 && vs.slice(-4).every(Boolean);
        console.log('[t] camroof', JSON.stringify(w), `${nBad} of ${vs.length} under a roof`, verdict('camroof centrum ' + (pre || 'out'), ok));
      }
      // The Akut canopy (day 7's drop-off): standing under it, then driving in from 16 m out.
      const ak = await ev(async () => {
        const { camBlocks } = await import('./src/world/town.js');
        const h = window.__lm('hospitalDrop') || { x: 137, z: -150, yaw: Math.PI / 2 };
        const b = camBlocks.find((b) => h.x > b.x0 && h.x < b.x1 && h.z > b.z0 && h.z < b.z1 && b.x1 - b.x0 > 5);
        return { x: h.x, z: h.z, yaw: h.yaw, b: b ? [b.x0, b.z0, b.x1, b.z1, b.bottom] : null };
      });
      console.log('[t] akut', JSON.stringify(ak));
      await put(ak.x, ak.z, ak.yaw); await frames(30);
      await check('akut', !!ak.b); await shot('camroof_akut');
      await put(ak.x - Math.sin(ak.yaw) * 16, ak.z - Math.cos(ak.yaw) * 16, ak.yaw, 7); await frames(4);
      await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
      await page.keyboard.down('Space'); await sleep(700); await page.keyboard.up('Space');
      await frames(10);
      await check('akut_in', !!ak.b); await shot('camroof_akut_in');
      // Ove's garage (camtight's two views): reported, not judged (a closed garage, walls all round).
      for (const [label, turn] of [['garage_out', Math.PI], ['garage_in', 0]]) {
        await ev((turn) => { const g = __game, b = window.__lm('oveGarageSpot') || window.__lm('saabSpot'); if (!g.playerCar) g.enterCar(g.named.saab); g.playerCar.place(b.x, b.z, b.yaw + turn); g.cam.yaw = b.yaw + turn; g.cam.snapNext = true; }, turn);
        await frames(25);
        await check(label, false); await shot('camroof_' + label);
      }
      // On the road past the shelter (two lanes out): no roof business at all.
      await put(sh.x + sh.fx * 6 - Math.sin(sh.yaw) * 12, sh.z + sh.fz * 6 - Math.cos(sh.yaw) * 12, sh.yaw, 9);
      await frames(4);
      await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
      await check('road', false); await shot('camroof_road');
    },
  };
};
