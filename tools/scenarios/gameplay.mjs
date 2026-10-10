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

export default ({ page, ev, shot, frames, sleep, hold, tap, until, warp, L, standBy, fresh, fps, PORT }) => {
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
        const car = g.spawnTrafficCar(() => 0.3, null);
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
  };
};
