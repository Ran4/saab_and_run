// Cans and fines (features/implemented/burkar_och_straff.md). Run:
//   PORT=88xx node tools/shot.mjs <name>
//   burkar   every second can Ove picks up is +1 Ordning: four cans walked over with W (kr +1 each,
//            the meter +0 / +1 / +0 / +1, the meter's "+1"), the count kept over a reload (37 saved:
//            the 38th is +1, the 39th not), and a can that fills the meter brings ORDNING OCH REDA.
//            Screens: burk_0 (a can ahead), burk_meter (the "+1" by the meter).
//   straff   the fines, five times what they were: props kicked with J (25 + 15 per prop coin, the
//            toast "Ove betalar för det han förstört"; with too little money all he has), a car with a
//            driver rammed to a wreck with W (500 kr självrisk), KAOS I OMRÅDET (−250 kr, all of it
//            under that), day 7's Škoda stopping the Saab (STOPPAD, −100 kr).
//            Screens: straff_kick, straff_wreck, straff_kaos, straff_stoppad.
export default (H) => {
  const { page, ev, shot, frames, sleep, until, fresh, errors, PORT } = H;
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const ok = (c, what, ...a) => { if (c) log('ok', what); else bad(what, ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))); return !!c; };
  // Every toast and banner from here on (window.__toasts, window.__banners).
  const record = () => ev(async () => {
    const { hud } = await import('./src/game/hud.js');
    window.__toasts = []; window.__banners = [];
    if (hud.__rec) return;
    hud.__rec = true;
    const t = hud.toast.bind(hud), b = hud.showBanner.bind(hud);
    hud.toast = (text, ...a) => { window.__toasts.push(String(text).replace(/<[^>]*>/g, '')); return t(text, ...a); };
    hud.showBanner = (main, sub = '', ...a) => { window.__banners.push(`${main} | ${sub}`); return b(main, sub, ...a); };
  });
  const st = () => ev(() => { const g = __game; return { kr: g.coins, cans: g.cans, ordning: g.patrol.ordning }; });
  const setKr = (n) => ev((n) => { const g = __game; g.addCoins(n - g.coins); }, n);
  const clearTraffic = () => ev(() => { const g = __game; for (const c of g.cars.slice()) if (c.traffic) g.removeCar(c); });

  // A can lying in the open with 3 m of clear ground west of it and no other can within 5 m: Ove
  // 2.6 m west of it, facing it. Not one of `skip` (ids).
  const toCan = (skip = []) => ev(async (skip) => {
    const { cans } = await import('./src/actors/pickups.js');
    const g = __game, p = g.player;
    if (g.playerCar) g.exitCar(true);
    const free = (c) => {
      for (let t = 0; t <= 3.2; t += 0.4) for (const w of [-0.45, 0, 0.45]) if (!g.spotFree(c.x - t, c.z + w)) return false;
      return !cans.some((o) => o !== c && o.alive && Math.hypot(o.x - c.x, o.z - c.z) < 5) && Math.abs(c.y - g.groundAt(c.x - 2.6, c.z)) < 0.4;
    };
    const list = cans.filter((c) => c.alive && !skip.includes(c.id)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const c = list.find(free);
    if (!c) return null;
    window.__can = c;
    p.teleport(c.x - 2.6, c.z, Math.PI / 2);
    g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.3; g.cam.snapNext = true;
    return { id: c.id, x: c.x, z: c.z };
  }, skip);
  // Walk (W) until the can is gone, at most 4 s (pic: the meter's "+1" in burk_meter.png).
  const walkOver = async (pic) => {
    await page.keyboard.down('KeyW');
    try { await until(() => !window.__can.alive, 4000); } catch (e) { /* checked by the caller */ }
    await page.keyboard.up('KeyW');
    if (pic) await page.screenshot({ path: `${H.OUT}/burk_meter.png` });
    await frames(3);
    return ev(() => !window.__can.alive);
  };

  return {
    async burkar() {
      await record();
      await clearTraffic();
      // (no drain, no new violations: the meter moves only by the cans)
      await ev(() => { const g = __game; g.patrol.pause(true); g.patrol.ordning = 50; });
      await frames(5);
      const used = [];
      for (let k = 0; k < 4; k++) {
        const c = await toCan(used);
        if (!ok(c, `can ${k + 1}: one found in the open`)) return;
        used.push(c.id);
        await frames(8);
        if (k === 0) await shot('burk_0');
        const a = await st();
        const taken = await walkOver(k === 1);
        const b = await st();
        const even = b.cans % 2 === 0;
        const dO = +(b.ordning - a.ordning).toFixed(3);
        ok(taken && b.cans === a.cans + 1, `can ${k + 1}: walked over, counted`, { taken, a, b });
        ok(b.kr === a.kr + 1, `can ${k + 1}: +1 kr`, { a, b });
        ok(Math.abs(dO - (even ? 1 : 0)) < 1e-6, `can ${k + 1} (#${b.cans}): Ordning ${even ? '+1' : '+0'}`, { dO, a, b });
        if (k === 1) {
          const d = await ev(() => [...document.querySelectorAll('#meter .mt-delta')].map((e) => e.className + ' ' + e.textContent));
          ok(d.some((s) => /pos/.test(s) && /\+1$/.test(s)), 'the meter shows "+1" for the second can', d);
        }
        await sleep(400);
      }
      // A run of them by the game's own pickup (tickCans: Ove standing on each): + every second one.
      const run = await ev(async () => {
        const { cans, tickCans } = await import('./src/actors/pickups.js');
        const g = __game, out = [];
        const list = cans.filter((c) => c.alive).slice(0, 9);
        for (const c of list) {
          const o = g.patrol.ordning, n = g.cans;
          tickCans(0, { x: c.x, y: c.y, z: c.z, r: 0.05 }, g);
          out.push({ n: g.cans - n, count: g.cans, d: +(g.patrol.ordning - o).toFixed(3) });
        }
        return out;
      });
      ok(run.length === 9 && run.every((r) => r.n === 1 && r.d === (r.count % 2 === 0 ? 1 : 0)), 'nine more: +1 Ordning on every even count', run);

      // The count is the saved one: 37 saved, a reload, the 38th is +1, the 39th not.
      await ev(() => { const g = __game; g.cans = 37; g.patrol.ordning = 40; g.save(); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1${process.env.QUERY || ''}`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
      await frames(10);
      await record();
      await clearTraffic();
      await ev(() => { __game.patrol.pause(true); });
      const r0 = await st();
      ok(r0.cans === 37, 'after a reload: 37 cans', r0);
      for (const want of [1, 0]) {
        const c = await toCan();
        if (!ok(c, 'a can after the reload')) return;
        await frames(5);
        const a = await st();
        const taken = await walkOver();
        const b = await st();
        ok(taken && b.cans === a.cans + 1 && Math.abs(b.ordning - a.ordning - want) < 1e-6, `after the reload, can ${b.cans}: Ordning +${want}`, { a, b });
      }

      // A can that fills the meter: ORDNING OCH REDA (the meter's own event, +100 kr; the patrol on).
      await ev(() => { const g = __game, P = g.patrol; P.pause(false); P.redaGiven = false; P.eventHold = 0; P.ordning = 99.6; P.atTop = false; if (g.cans % 2 === 0) g.cans++; window.__banners = []; });
      const c = await toCan();
      if (!ok(c, 'a can for the last point')) return;
      const a = await st();
      const taken = await walkOver();
      await sleep(1200);
      const b = await st(), ban = await ev(() => window.__banners);
      ok(taken && b.ordning >= 99.5 && ban.some((s) => s.startsWith('ORDNING OCH REDA')) && b.kr >= a.kr + 101, 'the can that fills the meter: ORDNING OCH REDA', { a, b, ban });
    },

    async straff() {
      await record();
      await ev(() => { __game.patrol.pause(true); });
      // -- Props kicked (J): 25 + 15 per prop coin (a prop without coins counts 2), up to three kinds.
      const kicks = await ev(() => {
        const g = __game, p = g.player, seen = new Set(), out = [];
        const fine = (q) => 25 + Math.round((q.def.coins || 2) * 15);
        const list = window.__props.filter((q) => q.alive && q.def.r && Math.hypot(q.x - p.x, q.z - p.z) < 260).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        for (const q of list) {
          if (seen.has(fine(q)) || out.length >= 3) continue;
          // a spot 0.75 m + its radius out from it, free and on its level, with no other prop by it
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2, d = q.def.r + 0.75, x = q.x + Math.sin(a) * d, z = q.z + Math.cos(a) * d;
            if (!g.spotFree(x, z) || Math.abs(g.groundAt(x, z) - g.groundAt(q.x, q.z)) > 0.2) continue;
            if (window.__props.some((o) => o !== q && o.alive && Math.hypot(o.x - q.x, o.z - q.z) < 2.2)) break;
            seen.add(fine(q)); out.push({ i: window.__props.indexOf(q), type: q.type, coins: q.def.coins, fine: fine(q), x, z, yaw: Math.atan2(q.x - x, q.z - z) });
            break;
          }
        }
        return out;
      });
      log('props', JSON.stringify(kicks));
      ok(kicks.length >= 2, 'at least two kinds of prop to kick', kicks);
      const kick = async (k, kr) => {
        await setKr(kr);
        await ev((k) => { const g = __game; g.player.teleport(k.x, k.z, k.yaw); g.cam.yaw = k.yaw; g.cam.pitch = 0.25; g.cam.snapNext = true; window.__toasts = []; }, k);
        await frames(12);
        const a = await st();
        await page.keyboard.down('KeyJ'); await frames(2); await page.keyboard.up('KeyJ');
        await frames(30);
        await sleep(1500);
        return { a, b: await st(), alive: await ev((i) => window.__props[i].alive, k.i), toasts: await ev(() => window.__toasts) };
      };
      for (const [n, k] of kicks.entries()) {
        const r = await kick(k, 1000);
        if (n === 0) await shot('straff_kick');
        ok(!r.alive && r.a.kr - r.b.kr === k.fine && r.toasts.some((t) => t === `Ove betalar för det han förstört: ${k.fine} kr`), `kicked a ${k.type} (${k.coins ?? 0} coins): −${k.fine} kr`, r);
        ok(r.a.ordning > r.b.ordning, `kicked a ${k.type}: Ordning down`, r);
      }
      // Too little money: all he has, no more.
      const k0 = await ev(() => {
        const g = __game, p = g.player;
        const q = window.__props.filter((q) => q.alive && q.def.r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        for (const o of q) for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2, d = o.def.r + 0.75, x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d;
          if (!g.spotFree(x, z) || Math.abs(g.groundAt(x, z) - g.groundAt(o.x, o.z)) > 0.2) continue;
          if (window.__props.some((w) => w !== o && w.alive && Math.hypot(w.x - o.x, w.z - o.z) < 2.2)) break;
          return { i: window.__props.indexOf(o), type: o.type, fine: 25 + Math.round((o.def.coins || 2) * 15), x, z, yaw: Math.atan2(o.x - x, o.z - z) };
        }
        return null;
      });
      if (ok(k0, 'a prop for the broke kick')) {
        const r = await kick(k0, 18);
        ok(!r.alive && r.b.kr === 0 && r.toasts.some((t) => t === 'Ove betalar för det han förstört: 18 kr'), `kicked a ${k0.type} with 18 kr: all 18 gone`, r);
      }

      // -- Somebody's car, with its driver, rammed to a wreck (W): 500 kr självrisk.
      await setKr(2000);
      const w = await ev(() => {
        const g = __game, saab = g.named.saab;
        g.enterCar(saab);
        saab.place(-60, -40 + 2.75, Math.PI / 2);
        g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.2; g.cam.snapNext = true;
        for (const p of g.peds) if (Math.hypot(p.char.x + 40, p.char.z + 37) < 40) p.char.teleport(p.char.x, p.char.z + 60);
        // (a passing car, its driver at the wheel (a seated bust); the rest of the traffic out of the way)
        const c = g.cars.find((c) => c.traffic && c.driverBust && !c.dead && !c.violation && !['bus', 'garbage'].includes(c.kind));
        if (!c) return null;
        for (const o of g.cars.slice()) if (o.traffic && o !== c && Math.hypot(o.x + 50, o.z + 40) < 90) g.removeCar(o);
        c.place(-60 + 14, -40 + 2.75, Math.PI / 2);
        c.ai = null; c.ctrl.throttle = 0; c.ctrl.brake = 1; c.ctrl.steer = 0; c.ctrl.park = true;
        c.hp = 3;
        window.__wreck = c; window.__toasts = [];
        return { type: c.kind, driver: !!c.driverBust, ordning: g.patrol.ordning };
      });
      log('wreck target', JSON.stringify(w));
      if (ok(w, 'a car to wreck')) {
        await frames(10);
        const a = await st();
        await page.keyboard.down('KeyW');
        try { await until(() => window.__wreck.dead, 5000); } catch (e) { /* checked below */ }
        await page.keyboard.up('KeyW');
        await sleep(600);
        await shot('straff_wreck');
        const b = await st(), r = await ev(() => ({ dead: window.__wreck.dead, toasts: window.__toasts }));
        ok(r.dead && a.kr - b.kr === 500 && r.toasts.includes('Ove betalar självrisken: 500 kr') && b.ordning < a.ordning - 7, 'a car with its driver wrecked: 500 kr självrisk', { a, b, r, driver: w.driver });
      }
      await ev(() => { const g = __game; if (g.playerCar) g.exitCar(true); });

      // -- KAOS I OMRÅDET: −250 kr; with less, all of it.
      for (const [kr, lost] of [[1000, 250], [120, 120]]) {
        await setKr(kr);
        await ev(() => { const P = __game.patrol; P.pause(false); P.eventHold = 0; P.lastKaos = -999; window.__banners = []; P.addOrdning(-100); });
        try { await until(() => window.__banners.some((s) => s.startsWith('KAOS')), 4000); } catch (e) { /* checked below */ }
        if (kr === 1000) await shot('straff_kaos');
        const b = await st(), ban = await ev(() => window.__banners);
        ok(b.kr === kr - lost && ban.some((s) => s === `KAOS I OMRÅDET | Anders kallar till extra föreningsmöte · −${lost} kr`), `KAOS with ${kr} kr: −${lost} kr`, { b, ban });
        await ev(() => { const P = __game.patrol; P.pause(true); P.ordning = 50; });
        await sleep(300);
      }

      // -- Day 7: the white Škoda stops the Saab (STOPPAD): −100 kr.
      await fresh('&mission=6');
      await record();
      await clearTraffic();
      await ev(() => { const g = __game; g.addCoins(1000 - g.coins); g.enterCar(g.named.saab); g.missions.startMission(2, ['parvaneh']); });
      await frames(10);
      const s0 = await ev(() => { const g = __game, s = g.missions.stage; return { kind: s?.kind, chaser: !!s?.chaser, kr: g.coins }; });
      if (ok(s0.kind === 'goto' && s0.chaser, 'day 7: the drive with the Škoda', s0)) {
        await ev(() => { const g = __game, c = g.missions.stage.chaser, pc = g.playerCar; pc.vx = pc.vz = 0; const fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw); c.place(pc.x - fx * 9, pc.z - fz * 9, pc.yaw); g.cam.yaw = pc.yaw + Math.PI * 0.85; g.cam.snapNext = true; window.__banners = []; });
        try { await until(() => __game.missions.stage?.stunT > 0, 15000); } catch (e) { /* checked below */ }
        await sleep(300);
        await shot('straff_stoppad');
        const b = await st(), ban = await ev(() => window.__banners);
        ok(b.kr === 900 && ban.some((s) => /^STOPPAD \| .* · −100 kr$/.test(s)), 'STOPPAD by the Škoda: −100 kr', { b, ban });
      }
    },
  };
};
