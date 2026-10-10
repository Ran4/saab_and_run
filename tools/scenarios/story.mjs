// The story (phase 3b): the seven days of DESIGN.md section 5.
//   story   plays all seven missions with debug warps; must end with '#7 idle' and 'no errors'.
//           FROM=n starts at day n+1 (?mission=n).
//   m1      day 1 with REAL key presses for the hard part: Ove walks up to Patrick's car (W, E),
//           drives car + trailer past the box (W A D) and backs it into parvanehDrive (S A D, B to
//           look back) - no warps or velocity pokes while driving; the rest of the day as in 'story'.
//   m2..m7  one day each, with warps (a fresh game at ?mission=n-1).
//   gate    normal play (&gate): after day 1, day 2 is offered once Ove has filed two more reports.
//   aftermath  what the story leaves in the world (a game at day 7) and the flowers on the grave.
//   Every outro (story, m1..m7): each speaker must stand within 4 m of Ove with no wall between.
//   No warps where it matters (fix round 1):
//   m7chase day 7's chaser, nobody touching it: Ove's Saab parked on Solrosvägen ~100 m off, the
//           Škoda must close to < 40 m by itself within 25 s (CHASER_AWAY=1: spawned 70-140 m off,
//           facing away from Ove - it goes round the block, up to ~470 m: within 35 s).
//   m5race  day 5's race driven with keys only (W/A/S/D, a lane-following bot that brakes for the
//           corners); must win. RACE_VMAX=22 caps it at ~80 km/h (a careful driver).
//   m4cat   day 4's cat with keys: walk up (it bolts), stride after it with Shift for 6 s (it must
//           not be caught in the first 5 s), then stand still: it comes to Ove.
// Screenshots: out/story_*.png (key moments), out/m1_*.png, out/m5r_*.png, out/m7c_*.png, out/m4c_*.png.

export default ({ page, ev, shot, frames, sleep, tap, until, L, fresh, errors }) => {
  const state = () => ev(() => { const m = __game.missions; return `#${m.index} ${m.state} stage ${m.stageI ?? '-'} ${m.stage?.kind || ''} ${m.stage?.sub || m.stage?.text || ''}`; });
  const log = async (...a) => console.log('[t]', ...a);
  const stageAt = async (n, timeout = 30000) => {
    try { await until((n) => { const m = __game.missions; return (m.state === 'running' && m.stageI >= n) || m.state === 'outro' || m.state === 'idle'; }, timeout, n); }
    catch (e) { await log('stuck waiting for stage', n, await state()); throw e; }
  };
  // A failed check: logged and counted as an error (the run ends 'N errors').
  const bad = async (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  // The outro that is about to play: every speaker by Ove (< 4 m) with nothing between them (no
  // collider taller than 0.6 m above the lower of their two spots on the line between them).
  const outroCheck = async (day) => {
    try { await until(() => __game.missions.outroOn, 30000); } catch (e) { await bad(`day ${day}: no outro`); return; }
    await frames(4);
    const r = await ev(async () => {
      const { segmentBlocked, queryBlocks, contains } = await import('./src/world/collision.js');
      const g = __game, p = g.player;
      // (what is in the way, if anything: block kinds along the line)
      const yl = (n) => Math.min(g.groundAt(p.x, p.z), g.groundAt(n.x, n.z)) + 0.6;
      const what = (n) => { const out = new Set(); for (const b of queryBlocks(Math.min(p.x, n.x), Math.min(p.z, n.z), Math.max(p.x, n.x), Math.max(p.z, n.z), [])) { if (b.kind === 'prop' || b.top < yl(n)) continue; for (let k = 0; k <= 20; k++) if (contains(b, p.x + (n.x - p.x) * k / 20, p.z + (n.z - p.z) * k / 20)) { out.add(`${b.kind}@${b.top.toFixed(2)}`); break; } } return [...out].join(','); };
      return g.missions.outroCast.map((n) => ({ key: n.key, d: +Math.hypot(n.x - p.x, n.z - p.z).toFixed(2), wall: segmentBlocked(p.x, p.z, n.x, n.z, yl(n)) >= 0, shown: n.root.visible && n.state === 'normal', what: what(n), ove: [+p.x.toFixed(1), +p.z.toFixed(1)], at: [+n.x.toFixed(1), +n.z.toFixed(1)] }));
    });
    await log(`outro day ${day}`, JSON.stringify(r));
    for (const c of r) if (!(c.d < 4 && !c.wall && c.shown)) await bad(`day ${day} outro: ${c.key} d=${c.d} wall=${c.wall} shown=${c.shown}`);
    // OUTRO_SHOTS=1: a screenshot of every line (out/outro<day>_<k>.png).
    if (process.env.OUTRO_SHOTS) {
      let last = '', k = 0;
      while (await ev(() => __game.missions.state === 'outro') && k < 12) {
        const t = await ev(() => `${document.querySelector('#dialog .dlg-name')?.textContent}|${(document.querySelector('#dialog .dlg-text')?.textContent || '').slice(0, 12)}`);
        if (t !== last && t.split('|')[1].length >= 12) { last = t; await sleep(300); await shot(`outro${day}_${k++}`); }
        await sleep(120);
      }
    }
  };
  const failCheck = async () => { if (await ev(() => __game.missions.state === 'failed')) { await log('FAILED', await ev(() => document.querySelector('#banner .banner-sub')?.textContent)); throw new Error('mission failed'); } };

  // Walk up to the day's giver and press E (retrying: the giver may have been re-placed a frame ago).
  const startMission = async () => {
    await until(() => !!__game.missions.offered, 20000);
    for (let attempt = 0; attempt < 6; attempt++) {
      await ev(() => {
        const g = __game;
        if (g.playerCar) g.exitCar(true);
        g.player.state = 'normal';
        const n = g.npc(g.missions.offered.giver);
        const s = g.freeSpot(n.x, n.z, 1.0, 1.8);
        g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z));
        g.cam.yaw = g.player.yaw + 0.5; g.cam.snapNext = true;
      });
      await frames(4);
      if (attempt < 5) await tap('KeyE');
      else { await log('falling back to missions.begin()'); await ev(() => __game.missions.begin()); }
      try { await until(() => __game.missions.state !== 'idle', 3000); break; }
      catch (e) { await log('E missed, attempt', attempt, await ev(() => { const g = __game, n = g.npc(g.missions.offered.giver), it = g.nearestInteractable(); return `near=${it?.type} d=${Math.hypot(n.x - g.player.x, n.z - g.player.z).toFixed(2)}`; })); }
    }
    await sleep(1200);
    await shot(`story_d${await ev(() => __game.missions.index + 1)}_intro`);
    await until(() => __game.missions.state === 'running', 60000);
    await log('started', await state());
  };
  const waitIdle = async (idx) => {
    try { await until((i) => __game.missions.state === 'idle' && __game.missions.index === i, 120000, idx); }
    catch (e) { await log('stuck at', await state()); throw e; }
    await log('done ->', await state(), 'kr', await ev(() => __game.coins));
  };
  const enter = (name) => ev((name) => { const g = __game; if (g.playerCar && g.playerCar.name !== name) g.exitCar(true); if (!g.playerCar) g.enterCar(g.ensureNamedCar(name)); }, name);
  // Put Ove's car at a place (facing `yaw`, default unchanged).
  const carAt = (x, z, yaw) => ev(({ x, z, yaw }) => { const g = __game, c = g.playerCar; c.place(x, z, yaw ?? c.yaw); g.cam.yaw = c.yaw; g.cam.snapNext = true; }, { x, z, yaw });
  const onFootAt = (x, z, rMin = 0, rMax = 0) => ev(({ x, z, rMin, rMax }) => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    g.player.state = 'normal';
    const s = rMax > 0 ? g.freeSpot(x, z, rMin, rMax) : { x, z };
    g.player.teleport(s.x, s.z, Math.atan2(x - s.x, z - s.z) || g.player.yaw);
    g.cam.yaw = g.player.yaw; g.cam.snapNext = true;
  }, { x, z, rMin, rMax });
  const target = () => ev(() => __game.missions.target());
  // A goto's goal itself (its target() may be a guide point on the way: the Akut driveway).
  const gotoDest = () => ev(() => { const g = __game, d = g.missions.stage.dest(g); return { x: d.x, z: d.z }; });
  const stage = (fn) => ev(new Function('return (' + fn + ')(__game.missions.stage, __game)'));

  // A car pickup: stop beside them and they get in.
  const pickupByCar = async () => {
    if (!(await ev(() => __game.missions.stage?.kind === 'pickup'))) return;   // already aboard (they waited close by)
    const t = await target();
    await ev((t) => { const g = __game, s = g.freeSpot(t.x, t.z, 4, 6); g.playerCar.place(s.x, s.z, Math.atan2(t.x - s.x, t.z - s.z)); g.cam.yaw = g.playerCar.yaw; g.cam.snapNext = true; }, t);
    await frames(10);
  };
  // Report every violation the report stage spawned: stand by each, hold F.
  const reportAll = async () => {
    await until(() => !__interrupt.call, 20000);
    for (let k = 0; k < 8; k++) {
      const c = await ev(() => { const s = __game.missions.stage; if (!s || s.kind !== 'report') return null; const c = s.open()[0]; return c ? { x: c.x, z: c.z } : null; });
      if (!c) break;
      await ev((c) => { const g = __game; if (g.playerCar) g.exitCar(true); const s = g.freeSpot(c.x, c.z, 3, 3.6); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.yaw = g.player.yaw + 0.4; g.cam.snapNext = true; }, c);
      await frames(5);
      await page.keyboard.down('KeyF'); await sleep(1100);
      if (k === 0) await shot('story_report');
      await sleep(1100); await page.keyboard.up('KeyF');
      await frames(5);
    }
  };
  // Back a car (and its trailer) into the parkIn box like the 'stages' test does: start ahead of
  // it, facing along it, and move it backwards until its centre is `along` m ahead of the box's.
  const reverseInto = async (along) => {
    await ev(() => { const g = __game, b = g.missions.stage.b, c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); c.place(b.x + fx * (b.l / 2 + c.spec.len / 2 + 0.6), b.z + fz * (b.l / 2 + c.spec.len / 2 + 0.6), b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
    await frames(10);
    for (let k = 0; k < 220; k++) {
      if (!(await ev(() => __game.missions.stage?.kind === 'parkIn'))) break;
      await ev((along) => {
        const g = __game, b = g.missions.stage.b, c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        const r = (c.x - b.x) * fx + (c.z - b.z) * fz, d = r - along;
        const v = d > 0.05 ? -Math.min(1.6, Math.max(0.35, d * 1.2)) : 0;
        c.vx = fx * v; c.vz = fz * v; c.yaw = b.yaw; c.w = 0;
      }, along);
      await frames(2);
    }
  };
  // Into a box nose first: a warp straight into it.
  const parkWarp = async () => {
    await ev(() => { const g = __game, b = g.missions.stage.b, c = g.playerCar; c.place(b.x, b.z, b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
    await frames(5);
  };

  // ------------------------------------------------------------------------------------------
  // The seven days, played with warps.

  const D = [];
  D[1] = async (keys = false) => {
    await startMission();
    if (keys) await trailerByKeys();
    else {
      await enter('patrickCar');
      await stageAt(1);
      await sleep(600);
      await shot('story_d1_trailer');
      await reverseInto(2.0);
    }
    await stageAt(2);
    await log('parked', await state());
    await reportAll();
    await stageAt(3);
    await enter('saab');
    await stageAt(4);
    await parkWarp();
    await until(() => __game.missions.state !== 'running', 15000);
    await outroCheck(1);
    await sleep(800);
    await shot('story_d1_outro');
    await waitIdle(1);
  };
  D[2] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await log('passenger aboard', await ev(() => __game.npc('parvaneh').car === __game.playerCar));
    await sleep(3000);
    await shot('story_d2_drive');
    const h = await gotoDest();
    await carAt(h.x, h.z);
    await stageAt(4);
    await parkWarp();
    await outroCheck(2);
    await sleep(800);
    await shot('story_d2_outro');
    await waitIdle(2);
  };
  D[3] = async () => {
    await startMission();
    const t = await target();
    await onFootAt(t.x, t.z);
    await stageAt(1);
    await log('carrying', await ev(() => __game.missions.m?.data.carrying));
    await reportAll();
    await stageAt(2);
    const s = await target();
    await onFootAt(s.x, s.z);
    await frames(4);
    await page.keyboard.down('KeyE'); await sleep(1500);
    await shot('story_d3_element');
    await sleep(800); await page.keyboard.up('KeyE');
    await outroCheck(3);
    await sleep(800);
    await shot('story_d3_outro');
    await waitIdle(3);
  };
  D[4] = async () => {
    await startMission();
    const c = await ev(() => { const c = __game.missions.stage.cat; return { x: c.x, z: c.z }; });
    // A look at the cat sitting in the snow first, then catch it.
    await onFootAt(c.x, c.z, 7, 8);
    await ev(() => { __game.cam.yaw += 0.45; __game.cam.pitch = 0.12; });
    await frames(30);
    await shot('story_d4_cat');
    await ev(() => { const g = __game, c = g.missions.stage.cat; g.player.teleport(c.x + 0.4, c.z, -Math.PI / 2); g.cam.snapNext = true; });
    await stageAt(1);
    const h = await L('oveHouse');
    await onFootAt(h.x, h.z);
    await outroCheck(4);
    await sleep(800);
    await shot('story_d4_outro');
    await waitIdle(4);
  };
  D[5] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await sleep(1500);
    await shot('story_d5_start');
    await until(() => __game.missions.stage?.countdown <= 0, 15000);
    await sleep(2500);
    await shot('story_d5_race');
    for (let k = 0; k < 8; k++) {
      const r = await ev(() => { const g = __game, s = g.missions.stage; if (!s || s.kind !== 'race') return 'gone'; const c = s.cps[s.pi], n = s.cps[s.pi + 1] || c; if (c) g.playerCar.place(c.x, c.z, Math.atan2(n.x - c.x, n.z - c.z) || g.playerCar.yaw); return s.pi; });
      if (r === 'gone') break;
      await frames(6);
    }
    await failCheck();
    await outroCheck(5);
    await sleep(800);
    await shot('story_d5_outro');
    await sleep(5000);
    await shot('story_d5_outro_saab');
    await waitIdle(5);
  };
  D[6] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await sleep(2500);
    // Get on its bumper for a look, then wear it down.
    await ev(() => { const g = __game, c = g.missions.stage.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); g.playerCar.place(c.x - fx * 9, c.z - fz * 9, c.yaw); g.cam.yaw = c.yaw; g.cam.snapNext = true; });
    await sleep(700);
    await shot('story_d6_chase');
    await log('target', await stage('(s) => `ork ${s.ork.toFixed(0)} t ${s.t.toFixed(0)}`'));
    await ev(() => { __game.missions.stage.ork = 0; });
    await stageAt(2, 20000);
    const n = await ev(() => { const n = __game.npc('vitskjorta'); return { x: n.x, z: n.z }; });
    await onFootAt(n.x, n.z, 2, 3);
    await sleep(2500);
    await shot('story_d6_talk');
    await stageAt(3, 40000);
    const t = await target();
    await onFootAt(t.x, t.z);
    await stageAt(4);
    const r = await L('runeHouse');
    await onFootAt(r.x, r.z);
    await outroCheck(6);
    await sleep(800);
    await shot('story_d6_outro');
    await waitIdle(6);
  };
  D[7] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    // The chase: wait for the white Škoda, let it catch Ove once (STOPPAD), then on to the hospital.
    await sleep(3000);
    await ev(() => { const g = __game, c = g.missions.stage.chaser, pc = g.playerCar; const fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw); c.place(pc.x - fx * 9, pc.z - fz * 9, pc.yaw); g.cam.yaw = pc.yaw + Math.PI * 0.85; g.cam.snapNext = true; });
    await sleep(900);
    await shot('story_d7_chaser');
    await until(() => __game.missions.stage?.stunT > 0, 12000).then(() => log('stopped by the chaser (STOPPAD)')).catch(() => log('the chaser never caught up'));
    await sleep(400);
    await shot('story_d7_stopped');
    await sleep(5000);
    await log('during the drive', await state(), 'calls', await stage('(s) => s.callI'), 'kr', await ev(() => __game.coins));
    await shot('story_d7_call');
    const h = await gotoDest();
    await carAt(h.x, h.z);
    await stageAt(4);
    await sleep(4300);
    await shot('story_d7_later');
    await stageAt(5);
    await log('after the time skip', await state(), 'clock', await ev(() => __game.clockText()));
    await sleep(4500);
    await log('Patrick calls', await ev(() => !!__interrupt.call));
    await shot('story_d7_patrick');
    const t = await target();
    await onFootAt(t.x, t.z);
    await stageAt(6);
    const s = await target();
    await onFootAt(s.x, s.z);
    await frames(4);
    await page.keyboard.down('KeyE'); await sleep(1600);
    await shot('story_d7_grave');
    await sleep(2000); await page.keyboard.up('KeyE');
    await until(() => __game.missions.state === 'outro', 20000);
    await sleep(7000);
    await shot('story_d7_outro');
    await waitIdle(7);
    await sleep(1500);
    await shot('story_end');
  };

  // ------------------------------------------------------------------------------------------
  // Day 1's trailer with the keyboard only.

  const BOX = {};
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const read = () => ev(() => {
    const g = __game, c = g.playerCar, t = c?.trailer, m = g.missions, s = m.stage;
    return c && t ? { x: c.x, z: c.z, yaw: c.yaw, vf: c.forwardSpeed, sp: c.speed, len: c.spec.len, tx: t.x, tz: t.z, tyaw: t.yaw, jack: !!t.jackknifed, stageI: m.stageI, state: m.state, sub: s?.sub || '', score: +(s?.score || 0).toFixed(2), rev: s?.enteredRev, still: s?.stillT || 0 }
      : { foot: true, stageI: m.stageI, state: m.state };
  });
  // Hold the keys a step function asks for (re-asked every ~50 ms) until it says 'done'.
  const drive = async (label, step, maxMs) => {
    const held = new Set();
    const t0 = Date.now();
    let st, n = 0;
    while (Date.now() - t0 < maxMs) {
      st = await read();
      if (st.foot) break;
      const want = step(st);
      if (want === 'done') break;
      for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (n++ % 20 === 0) await log(label, JSON.stringify({ x: +st.x.toFixed(2), z: +st.z.toFixed(2), yaw: +st.yaw.toFixed(3), phi: +wrap(st.yaw - st.tyaw).toFixed(3), tz: +st.tz.toFixed(2), vf: +st.vf.toFixed(2), keys: want.join('+'), sub: st.sub, score: st.score }));
      await sleep(30);
    }
    for (const k of held) await page.keyboard.up(k);
    return st;
  };

  async function trailerByKeys() {
    Object.assign(BOX, await L('parvanehDrive'));
    const fx = Math.sin(BOX.yaw), fz = Math.cos(BOX.yaw);       // a car parked right faces +f (east)
    const along = (x, z) => (x - BOX.x) * fx + (z - BOX.z) * fz;
    const lat = (x, z) => (x - BOX.x) * -fz + (z - BOX.z) * fx;  // + = to the right of the line
    // 1. From the walkway a few metres from Patrick's car: walk to it (camera aimed at it, W), E.
    await ev(() => { const g = __game, c = g.named.patrickCar, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); const x = c.x + fx * 6, z = 3.8; g.player.teleport(x, z, Math.atan2(c.x - x, c.z - z)); g.cam.yaw = g.player.yaw; g.cam.snapNext = true; });
    await frames(10);
    await shot('m1_0_walk');
    for (let k = 0; k < 120; k++) {
      const near = await ev(() => { const g = __game, c = g.named.patrickCar, p = g.player; g.cam.yaw = Math.atan2(c.x - p.x, c.z - p.z); const it = g.nearestInteractable(); return it?.type === 'car' && it.car === c; });
      if (near) break;
      await page.keyboard.down('KeyW'); await sleep(50);
    }
    await page.keyboard.up('KeyW');
    await frames(6);
    await tap('KeyE');
    await frames(10);
    await log('in Patrick\'s car:', await ev(() => __game.playerCar?.name), await state());
    if (!(await ev(() => __game.playerCar?.name === 'patrickCar'))) throw new Error('not in Patrick\'s car');
    await until(() => __game.missions.stageI >= 1, 5000);
    // 2. Forward along the walkway past the box until car and trailer are straight on its line.
    // Right of the line (lat > 0) the car must point left of +f (higher yaw); D lowers the yaw.
    const forward = (minAlong) => drive('forward', (st) => {
      const e = lat(st.x, st.z), yawStar = BOX.yaw + clamp(0.35 * e, -0.3, 0.3);
      const de = wrap(st.yaw - yawStar), phi = wrap(st.yaw - st.tyaw), a = along(st.x, st.z);
      if ((a > minAlong && Math.abs(phi) < 0.05 && Math.abs(e) < 0.3) || a > minAlong + 3) return 'done';
      const keys = [];
      if (st.vf < 2.4) keys.push('KeyW');
      if (de > 0.025) keys.push('KeyD'); else if (de < -0.025) keys.push('KeyA');
      return keys;
    }, 25000);
    await forward(9.2);
    await drive('stop', (st) => (st.vf < 0.35 ? 'done' : ['KeyS']), 4000);
    await sleep(600);
    await shot('m1_1_ahead');
    await log('ahead of the box:', await state());
    // 3. Back in. Outer loop: the trailer should head back onto the line (backing, it moves
    // against its own heading, so a trailer right of the line needs a lower yaw); inner loop: the
    // articulation phi = car yaw - trailer yaw that turns it so (backing, the trailer's yaw changes
    // by -v sin(phi) / L); keys: D raises the car's yaw while reversing, A lowers it.
    const stopAt = BOX.l / 2 - 0.4;   // the car's front this far ahead of the box centre
    let shotMid = false;
    const back = () => drive('reverse', (st) => {
      if (st.state !== 'running' || st.stageI !== 1) return 'done';
      const front = along(st.x, st.z) + st.len / 2;
      if (front <= stopAt) return 'done';
      const eT = lat(st.tx, st.tz);
      const thStar = BOX.yaw - clamp(0.45 * eT, -0.3, 0.3);
      const phi = wrap(st.yaw - st.tyaw);
      const phiStar = clamp(-1.6 * wrap(thStar - st.tyaw), -0.35, 0.35);
      const keys = ['KeyB'];
      if (-st.vf < 1.25) keys.push('KeyS');
      if (phi > phiStar + 0.02) keys.push('KeyA'); else if (phi < phiStar - 0.02) keys.push('KeyD');
      if (!shotMid && front < BOX.l / 2 + 1.5) { shotMid = true; shot('m1_2_reversing').catch(() => {}); }
      return keys;
    }, 30000);
    for (let attempt = 0; attempt < 3; attempt++) {
      await back();
      await drive('brake', (st) => (st.vf > -0.12 ? 'done' : ['KeyW']), 3000);
      await sleep(200);
      await shot('m1_3_parked');
      try { await until(() => __game.missions.stageI >= 2 || __game.missions.state !== 'running', 4000); break; }
      catch (e) {
        await log('not accepted yet', JSON.stringify(await read()));
        await forward(8.5);
        await drive('stop', (s) => (s.vf < 0.35 ? 'done' : ['KeyS']), 4000);
        await sleep(400);
      }
    }
    await log('trailer by keys:', await state());
    if (!(await ev(() => __game.missions.stageI >= 2 || __game.missions.state !== 'running'))) throw new Error('trailer parking not accepted');
  }

  const sc = {
    async story() {
      const from = +(process.env.FROM || 0);
      if (from) await fresh(`&mission=${from}`);
      for (let n = from + 1; n <= 7; n++) {
        await D[n]();
        await failCheck();
      }
      await log('story finished', await state(), 'kr', await ev(() => __game.coins), 'renderFrame ms', await ev(() => window.__stats().cpuMs));
    },
    async m1() { await D[1](true); },
    // Normal play (no ?test gate bypass): after day 1 the next day waits until Ove has filed two
    // more reports (or 75 s of free roam have passed), then 'Dag 2' dawns.
    async gate() {
      await fresh('&gate');
      await D[1]();
      await log('after day 1', JSON.stringify(await ev(() => ({ offered: !!__game.missions.offered, gateOpen: __game.missions.gateOpen, reports: __game.patrol.reports }))));
      for (let k = 0; k < 2; k++) {
        const c = await ev(() => { const g = __game, P = g.patrol, p = g.player; let best = null, bd = 1e9; for (const c of P.open) { if (c.violation.smitare) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } best ??= P.forceSpawn(1, { x: p.x, z: p.z }, { smitare: false })[0]; return { x: best.x, z: best.z }; });
        await ev((c) => { const g = __game, s = g.freeSpot(c.x, c.z, 3, 3.6); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.snapNext = true; }, c);
        await frames(5);
        await page.keyboard.down('KeyF'); await sleep(2200); await page.keyboard.up('KeyF');
        await frames(5);
        await log('free-roam report', k + 1, 'offered', await ev(() => !!__game.missions.offered));
      }
      await until(() => !!__game.missions.offered, 10000);
      await sleep(600);
      await log('day 2 offered', await ev(() => `${__game.missions.offered.title} clock ${__game.clockText()}`));
      await shot('gate_newday');
    },
    // What the story leaves in the world (a game loaded at day 7): Patrick's cast, the cat by
    // Ove's door, Adrian's Saab in the lot; then day 7's flowers on Sonja's grave.
    async aftermath() {
      await fresh('&mission=6');
      const look = async (name, x, z, back, yawOff = 0) => {
        await ev(({ x, z, back, yawOff }) => { const g = __game, s = g.freeSpot(x, z, back, back + 0.8); const yaw = Math.atan2(x - s.x, z - s.z); g.player.teleport(s.x, s.z, yaw); g.cam.yaw = yaw + yawOff; g.cam.pitch = 0.22; g.cam.snapNext = true; }, { x, z, back, yawOff });
        await frames(30);
        await shot(name);
      };
      // Framed like a dialogue: the camera at eye height beside Ove and the thing.
      const frame = async (name, pt) => {
        await ev((pt) => { const g = __game; g.cinematic({ x: pt.x, y: pt.y, z: pt.z, height: 0.6 }, g.player); }, pt);
        await frames(40);
        await shot(name);
        await ev(() => __game.endCinematic());
      };
      const cat = await ev(async () => { const { queryBlocks, groundAt } = await import('./src/world/collision.js'); const p = __game.homeCat.root.position; const bl = queryBlocks(p.x - 0.6, p.z - 0.6, p.x + 0.6, p.z + 0.6, []).map((b) => `${b.kind}:${b.top.toFixed(2)}`); return { x: p.x, y: p.y, z: p.z, ground: groundAt(p.x, p.z, 2, 0.6).toFixed(2), bl }; });
      await log('cat', JSON.stringify(cat));
      await look('after_cat', cat.x, cat.z, 2.6, 0.5);
      await frame('after_cat2', cat);
      const a = await ev(() => { const c = __game.named.adrianSaab; return { x: c.x, z: c.z }; });
      await look('after_adriansaab', a.x, a.z, 5.5, 0.3);
      const p = await ev(() => { const n = __game.npc('patrick'); return { x: n.x, z: n.z, cast: n.def.cast }; });
      await log('patrick cast', p.cast);
      await look('after_patrick', p.x, p.z, 2.4, 0.4);
      const fl = await ev(async () => { const M = await import('./src/game/missions.js'); M.flowersOnGrave(__game); const f = __game.graveFlowers; return { x: f.x, y: f.y, z: f.z }; });
      await log('flowers', JSON.stringify(fl));
      await look('after_grave', fl.x, fl.z, 1.8, 0.5);
      await frame('after_grave2', { ...fl, y: await ev((fl) => __game.groundAt(fl.x, fl.z), fl) });
    },
  };

  // ------------------------------------------------------------------------------------------
  // Fix round 1: checks with no warps where it matters.

  // Day 7 up to the chase (warps to the Saab and to Parvaneh), then hands off.
  const day7Chase = async () => {
    await fresh('&mission=6');
    if (process.env.CHASER_AWAY) await ev(() => { window.__chaserAway = true; });
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
  };
  // Keys held by a step function every ~40 ms (like m1's drive), with the car state.
  const carState = () => ev(() => {
    const g = __game, c = g.playerCar, s = g.missions.stage;
    return c ? { x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, sp: c.speed, state: g.missions.state, kind: s?.kind, phase: s?.phase, pi: s?.pi, oi: s?.oi, gap: s?.gap, ox: s?.opp?.x, oz: s?.opp?.z, ov: s?.opp?.speed, t: g.time } : { foot: true, state: g.missions.state, t: g.time };
  });
  const keysLoop = async (label, step, maxMs, every = 25) => {
    const held = new Set(), t0 = Date.now();
    let st, n = 0;
    while (Date.now() - t0 < maxMs) {
      st = await carState();
      const want = step(st);
      if (want === 'done') break;
      for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (n++ % every === 0) await log(label, JSON.stringify({ x: +(st.x ?? 0).toFixed(1), z: +(st.z ?? 0).toFixed(1), kmh: Math.round((st.v || 0) * 3.6), keys: want.join('+'), pi: st.pi, oi: st.oi, gap: st.gap == null ? null : Math.round(st.gap), opp: st.ox == null ? null : [Math.round(st.ox), Math.round(st.oz), Math.round((st.ov || 0) * 3.6)] }));
      await sleep(30);
    }
    for (const k of held) await page.keyboard.up(k);
    return st;
  };

  // Day 2 / 7: Parvaneh walks from her door to the lot entrance on her own (Ove stands still).
  sc.lotwalk = async () => {
    await fresh('&mission=1');
    await startMission();
    const t0 = await ev(() => __game.time);
    await ev(() => { const g = __game, c = g.named.saab; g.player.teleport(c.x + 2.2, c.z, 0); });
    let arrived = null;
    for (let k = 0; k < 60; k++) {
      const r = await ev(() => { const g = __game, n = g.npc('parvaneh'); return { x: n.x, z: n.z, walking: !!n.walkTo, t: g.time }; });
      if (k % 6 === 0) await log('parvaneh', `t ${(r.t - t0).toFixed(1)} at (${r.x.toFixed(1)}, ${r.z.toFixed(1)})${r.walking ? ' walking' : ''}`);
      if (k === 12) await shot('lotwalk_1');
      if (!r.walking && Math.hypot(r.x + 27, r.z + 22.6) < 1.5) { arrived = r.t - t0; break; }
      await sleep(700);
    }
    await log('Parvaneh at the lot entrance after', arrived?.toFixed(1), 's');
    if (arrived == null) await bad('lotwalk: Parvaneh never got to the lot entrance');
    await shot('lotwalk_2');
  };

  // Day 2's last stretch with keys: from the x = 120 street, follow the guide (missions.target(),
  // which leads through the Akut driveway) to the drop-off under the canopy.
  sc.hospdrive = async () => {
    await fresh('&mission=1');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await carAt(117.25, -120, Math.PI);
    await frames(10);
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const t0 = await ev(() => __game.time);
    let n = 0;
    const res = await (async () => {
      for (let k = 0; k < 900; k++) {
        const st = await ev(() => { const g = __game, c = g.playerCar, t = g.missions.target(), s = g.missions.stage; return { x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, kind: s?.kind, tx: t?.x, tz: t?.z, t: g.time }; });
        if (st.kind !== 'goto') return st;
        if (st.t - t0 > 30) return null;
        const e = wrap(Math.atan2(st.tx - st.x, st.tz - st.z) - st.yaw), d = Math.hypot(st.tx - st.x, st.tz - st.z);
        const vt = Math.abs(e) > 0.6 ? 3.5 : Math.min(10, 2 + d * 0.4);
        const keys = [];
        if (st.v < vt - 0.3) keys.push('KeyW'); else if (st.v > vt + 0.8) keys.push('KeyS');
        if (e < -0.04) keys.push('KeyD'); else if (e > 0.04) keys.push('KeyA');
        for (const kk of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) { if (keys.includes(kk)) await page.keyboard.down(kk); else await page.keyboard.up(kk); }
        if (n++ % 25 === 0) await log('hosp', `(${st.x.toFixed(1)}, ${st.z.toFixed(1)}) -> (${st.tx.toFixed(1)}, ${st.tz.toFixed(1)}) ${Math.round(st.v * 3.6)} km/h ${keys.join('+')}`);
        if (n === 60) await shot('hosp_1');
        await sleep(30);
      }
      return null;
    })();
    for (const kk of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(kk);
    await log('hospital reached:', res ? `${res.kind} after ${(res.t - t0).toFixed(1)} s` : 'no');
    await shot('hosp_2');
    if (!res) await bad('hospdrive: the guide did not lead the Saab to the drop-off in 30 s');
  };

  // Fail, retry, give up (fix round 1): a lost race retries on the grid with Adrian aboard; the
  // failed banner waits (no silent give-up); Q gives up, and taking the day up again gets the short
  // intro; a failed drive sends Parvaneh home instead of leaving her on the street.
  sc.retry = async () => {
    await fresh('&mission=4');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await until(() => __game.missions.stage?.phase === 'race', 15000);
    await sleep(1500);
    await ev(() => __game.missions.fail('Anders kom först. (test)'));
    await sleep(800);
    const a1 = await ev(() => { const g = __game, n = g.npc('adrian'), h = window.__lm('adrianSpot'); return { car: !!n.car, dHome: Math.hypot(n.x - h.x, n.z - h.z) }; });
    await log('failed: Adrian', JSON.stringify(a1));
    if (a1.car || a1.dHome > 6) await bad('retry: Adrian was left by the car after the fail');
    await sleep(16000);
    const st = await ev(() => __game.missions.state);
    await log('16 s after the fail:', st);
    if (st !== 'failed') await bad(`retry: the failed state gave up by itself (${st})`);
    await shot('retry_0_failed');
    await tap('KeyE');
    await until(() => __game.missions.state === 'running', 5000);
    await until(() => __game.missions.stage?.phase === 'count', 8000).catch(() => {});
    const r = await ev(() => { const g = __game, m = g.missions, n = g.npc('adrian'); return { stageI: m.stageI, kind: m.stage?.kind, phase: m.stage?.phase, adrianAboard: n.car === g.playerCar && !!g.playerCar }; });
    await log('after E:', JSON.stringify(r));
    await shot('retry_1_grid');
    if (r.kind !== 'race' || !r.adrianAboard) await bad(`retry: not back on the grid with Adrian (${JSON.stringify(r)})`);
    // Give up, then take the day up again: the short intro.
    await until(() => __game.missions.stage?.phase === 'race', 10000);
    await ev(() => __game.missions.fail('test'));
    await sleep(1200);
    await tap('KeyQ');
    await until(() => __game.missions.state === 'idle', 5000);
    await ev(() => { window.__lines = []; const el = document.querySelector('#dialog .dlg-text'); new MutationObserver(() => { const t = el.textContent; const L = window.__lines; if (t.length > 6 && !L.some((x) => t.startsWith(x.slice(0, 6)) || x.startsWith(t.slice(0, 6)))) L.push(t); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    await startMission();
    const lines = await ev(() => window.__lines.length);
    await log('intro after giving up:', lines, 'lines');
    if (lines > 3) await bad(`retry: the whole intro again after giving up (${lines} lines)`);
    // Day 7: a failed drive sends Parvaneh home.
    await fresh('&mission=6');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await sleep(1000);
    await ev(() => __game.missions.fail('För sent. (test)'));
    await sleep(800);
    const p = await ev(() => { const g = __game, n = g.npc('parvaneh'), h = window.__lm('parvanehHouse'); return { car: !!n.car, dHome: Math.hypot(n.x - h.x, n.z - h.z) }; });
    await log('day 7 failed: Parvaneh', JSON.stringify(p));
    if (p.car || p.dHome > 6) await bad('retry: Parvaneh was left on the street after the fail');
  };

  sc.m7chase = async () => {
    await day7Chase();
    // Ove's Saab parked on Solrosvägen, ~100 m from where the Škoda waits; nobody touches the Škoda.
    await carAt(60, -42.75, -Math.PI / 2);
    await ev(() => { const c = __game.playerCar; c.vx = c.vz = 0; });
    const t0 = await ev(() => __game.time), LIMIT = process.env.CHASER_AWAY ? 35 : 25;
    let best = Infinity, at = null, first = null;
    for (let k = 0; k < 80; k++) {
      const r = await ev(() => { const g = __game, s = g.missions.stage, c = s?.chaser, p = g.playerCar; return c && p ? { d: Math.hypot(c.x - p.x, c.z - p.z), t: g.time, kmh: c.speed * 3.6, x: c.x, z: c.z, stun: s.stunT > 0 } : null; });
      if (!r) break;
      if (r.d < best) { best = r.d; at = r.t - t0; }
      if (r.d < 40 && first == null) first = r.t - t0;
      if (k % 4 === 0) await log('chaser', `t ${(r.t - t0).toFixed(1)} d ${r.d.toFixed(0)} m, ${r.kmh.toFixed(0)} km/h at (${r.x.toFixed(0)}, ${r.z.toFixed(0)})${r.stun ? ' STOPPAD' : ''}`);
      if (k === 20) await shot('m7c_chase');
      if (r.t - t0 > LIMIT + 1) break;
      await sleep(500);
    }
    await log('chaser closest', best.toFixed(1), 'm at', at?.toFixed(1), 's; under 40 m after', first?.toFixed(1), 's');
    await log('pacing after', LIMIT, 's: calls', await ev(() => __game.missions.stage?.callI), 'of 5, radio lines', await ev(() => __game.missions.stage?.radioI), 'of 3');
    if (first == null || first > LIMIT) await bad(`m7chase: the chaser never came within 40 m in ${LIMIT} s (closest ${best.toFixed(0)} m)`);
    await shot('m7c_end');
  };

  // Day 5's race with keys: a lane-following bot (pure pursuit on the right-hand lane through the
  // three corners, full throttle on the straights up to RACE_VMAX, braking for each corner).
  sc.m5race = async () => {
    await fresh('&mission=4');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await until(() => __game.missions.stage?.phase === 'count', 15000);
    await shot('m5r_grid');
    const LANEW = 2.75, VMAX = +(process.env.RACE_VMAX || 36);
    const cps = await ev(() => __game.missions.stage.cps.map((c) => ({ x: c.x, z: c.z })));
    const start = await carState();
    // Right-hand lane corner points: each node offset by both legs' right-hand side.
    const nodes = [{ x: start.x, z: start.z }, ...cps];
    const right = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); return { x: -dz / l, z: dx / l }; };
    const pts = [{ x: start.x, z: start.z }];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i], r1 = right(a, b);
      if (i < nodes.length - 1) { const r2 = right(b, nodes[i + 1]); pts.push({ x: b.x + (r1.x + r2.x) * LANEW, z: b.z + (r1.z + r2.z) * LANEW, corner: true }); }
      else pts.push({ x: b.x, z: b.z });   // (the finish is in the lane already)
    }
    // Corner speed: right turns are tight, left ones wider.
    for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1]; const cr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x); pts[i].vc = cr > 0 ? 7.5 : 9; }
    await log('race route', JSON.stringify(pts.map((p) => [Math.round(p.x), Math.round(p.z), p.vc || 0])));
    await until(() => __game.missions.stage?.phase === 'race', 10000);
    const t0 = await ev(() => __game.time);
    let seg = 1;
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const fin = cps[cps.length - 1];
    let lastOpp = null;
    const st = await keysLoop('race', (st) => {
      if (st.foot || st.kind !== 'race') { if (lastOpp) console.log('[t] Anders', Math.round(Math.hypot(lastOpp.x - fin.x, lastOpp.z - fin.z)), 'm from the finish as Ove crossed'); return 'done'; }
      if (st.ox != null) lastOpp = { x: st.ox, z: st.oz };
      // Advance along the polyline: next corner reached (within 9 m) or passed.
      while (seg < pts.length - 1) {
        const a = pts[seg - 1], b = pts[seg], ab = Math.hypot(b.x - a.x, b.z - a.z);
        const along = ((st.x - a.x) * (b.x - a.x) + (st.z - a.z) * (b.z - a.z)) / ab;
        if (along > ab - 6) seg++; else break;
      }
      const a = pts[seg - 1], b = pts[seg], ab = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / ab, uz = (b.z - a.z) / ab;
      const along = (st.x - a.x) * ux + (st.z - a.z) * uz;
      const look = 7 + Math.abs(st.v) * 0.45;
      let tx, tz;
      if (along + look < ab || seg === pts.length - 1) { const t = Math.min(ab, along + look); tx = a.x + ux * t; tz = a.z + uz * t; }
      else { const c = pts[seg + 1], bc = Math.hypot(c.x - b.x, c.z - b.z), rest = along + look - ab; tx = b.x + (c.x - b.x) / bc * Math.min(bc, rest); tz = b.z + (c.z - b.z) / bc * Math.min(bc, rest); }
      // Speed: full on the straight, braking (~6.5 m/s²) for the next corner.
      let vt = VMAX;
      if (b.vc) { const d = Math.hypot(b.x - st.x, b.z - st.z); vt = Math.min(vt, Math.sqrt(b.vc * b.vc + 2 * 6 * Math.max(0, d - 11))); }
      const keys = [];
      if (st.v < vt - 0.4) keys.push('KeyW'); else if (st.v > vt + 1.2) keys.push('KeyS');
      const e = wrap(Math.atan2(tx - st.x, tz - st.z) - st.yaw);
      if (e < -0.025) keys.push('KeyD'); else if (e > 0.025) keys.push('KeyA');
      return keys;
    }, 70000);
    const res = await ev(() => { const g = __game, m = g.missions, a = g.named.andersAudi, f = m.stage?.cps?.at(-1) || window.__lm?.('dealerLot'); return { state: m.state, index: m.index, sub: document.querySelector('#banner .banner-sub')?.textContent || '', anders: a && f ? Math.round(Math.hypot(a.x - f.x, a.z - f.z)) : null }; });
    const secs = (await ev(() => __game.time)) - t0;
    await log('race result', JSON.stringify(res), 'after', secs.toFixed(1), 's, last gap', st.gap == null ? '-' : Math.round(st.gap));
    await shot('m5r_end');
    if (res.state === 'failed' || (res.index === 4 && res.state === 'running')) await bad(`m5race: not won (${res.state} ${res.sub})`);
    else await log('RACE WON');
  };

  // Day 4's cat with keys.
  sc.m4cat = async () => {
    await fresh('&mission=3');
    await startMission();
    const cat = () => ev(() => { const s = __game.missions.stage, c = s?.cat, p = __game.player; return c ? { x: c.x, z: c.z, mode: s.mode, d: Math.hypot(c.x - p.x, c.z - p.z), kind: s.kind, px: p.x, pz: p.z, pv: Math.hypot(p.vx, p.vz) } : { kind: s?.kind || __game.missions.state }; });
    // (CAT_TRACE=1: every 0.25 s game time, where Ove and the cat are)
    if (process.env.CAT_TRACE) await ev(() => { let t = 0; __game.onFrame((dt) => { t += dt; if (t < 0.25) return; t = 0; const s = __game.missions.stage, c = s?.cat, p = __game.player; if (c) console.log('[t] trace', `ove (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) v ${Math.hypot(p.vx, p.vz).toFixed(1)} cat (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) ${s.mode} d ${Math.hypot(c.x - p.x, c.z - p.z).toFixed(1)} still ${s.stillT.toFixed(1)}`); }); });
    // 12-14 m from the cat with a clear line to it (on the footpath, not behind a hedge), facing it.
    await ev(async () => {
      const { segmentBlocked } = await import('./src/world/collision.js');
      const g = __game, c = g.missions.stage.cat;
      let best = null;
      for (let k = 0; k < 200 && !best; k++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 2, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        if (g.spotFree(x, z) && Math.abs(g.groundAt(x, z) - c.y) < 0.3 && segmentBlocked(x, z, c.x, c.z, c.y + 0.45) < 0) best = { x, z };
      }
      best ??= g.freeSpot(c.x, c.z, 12, 14);
      const yaw = Math.atan2(c.x - best.x, c.z - best.z);
      g.player.teleport(best.x, best.z, yaw); g.cam.yaw = yaw; g.cam.snapNext = true;
    });
    await frames(10);
    await shot('m4c_0');
    const aim = () => ev(() => { const g = __game, c = g.missions.stage?.cat, p = g.player; if (c) g.cam.yaw = Math.atan2(c.x - p.x, c.z - p.z); });
    // 1. Walk up (W): it bolts.
    let boltD = null;
    for (let k = 0; k < 120; k++) {
      await aim(); await page.keyboard.down('KeyW'); await sleep(50);
      const c = await cat();
      if (c.kind !== 'catchCat') break;
      if (c.mode === 'run') { boltD = c.d; break; }
    }
    await page.keyboard.up('KeyW');
    await log('cat bolted with Ove', boltD?.toFixed(1), 'm away');
    // 2. Stride after it (W + Shift) for 6 s.
    const t0 = Date.now();
    let caught = null, c0T = null, lastMode = null;
    await page.keyboard.down('ShiftLeft');
    while (Date.now() - t0 < 6000) {
      await aim(); await page.keyboard.down('KeyW'); await sleep(60);
      const c = await cat();
      if (c.kind !== 'catchCat') { caught = (Date.now() - t0) / 1000; break; }
      lastMode = c.mode;
      if (Date.now() - (c0T ?? 0) > 500) { c0T = Date.now(); await log('chase', `cat ${c.mode} ${c.d.toFixed(1)} m at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`); }
    }
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    await shot('m4c_1_chase');
    const after = await cat();
    await log('after 6 s of striding:', caught != null ? `caught after ${caught.toFixed(1)} s` : `not caught, ${after.d?.toFixed(1)} m, ${after.mode}`);
    // (Ove wedged on the bike shed stands still: if the cat came to him, that's patience, not a chase)
    if (caught != null && caught < 5 && lastMode !== 'come') await bad(`m4cat: caught after only ${caught.toFixed(1)} s of chasing (${lastMode})`);
    // 3. Stand still: it comes.
    if (caught == null) {
      // Once it has settled: Ove 6-7.5 m from it with a clear line (the bot can't path round the
      // bike shed), then nothing - no keys - until it comes to him.
      await until(() => ['rest', 'sit', 'wander'].includes(__game.missions.stage?.mode) || __game.missions.stage?.kind !== 'catchCat', 15000).catch(() => {});
      await ev(async () => {
        const { segmentBlocked } = await import('./src/world/collision.js');
        const { isRoad } = await import('./src/world/layout.js');
        const g = __game, c = g.missions.stage?.cat;
        if (!c) return;
        let best = null;
        for (let k = 0; k < 300 && !best; k++) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 1.5, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
          if (g.spotFree(x, z) && !isRoad(x, z) && Math.abs(g.groundAt(x, z) - c.y) < 0.3 && segmentBlocked(x, z, c.x, c.z, c.y + 0.45, '') < 0) best = { x, z };
        }
        if (!best) return;
        const yaw = Math.atan2(c.x - best.x, c.z - best.z);
        g.player.teleport(best.x, best.z, yaw); g.player.vx = g.player.vz = 0; g.cam.yaw = yaw; g.cam.snapNext = true;
      });
      await log('standing still', JSON.stringify(await cat()));
      const t1 = Date.now();
      let came = null;
      while (Date.now() - t1 < 20000) {
        const c = await cat();
        if (c.kind !== 'catchCat') { came = (Date.now() - t1) / 1000; break; }
        if (c.mode === 'come' && !(await ev(() => window.__shotCome))) { await ev(() => { window.__shotCome = true; }); await log('it comes', JSON.stringify(c)); await shot('m4c_2_comes'); }
        await sleep(150);
      }
      await log('standing still:', came != null ? `it came and was caught after ${came.toFixed(1)} s` : 'it never came');
      if (came == null) await bad('m4cat: the cat never came to Ove standing still');
    }
    await shot('m4c_3_carry');
  };
  for (let n = 2; n <= 7; n++) sc['m' + n] = async () => { await fresh(`&mission=${n - 1}`); await D[n](); };
  return sc;
};
