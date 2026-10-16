// The city bus is not a car (features/implemented/bussen_ar_inte_en_bil.md): its passengers, what
// they say while Ove drives it, and what the HUD calls it. Run:
//   PORT=88xx node tools/shot.mjs <name>
//   busslook   close-ups of a busload (game/buss.js: seated busts, merged): both sides, through a
//              window, inside from the front and the back, far (hidden with the LOD); the draw calls
//              they cost. Screens buss_*.png.
//   buss       real keys: the prompt beside a bus ("Låna bussen"; a car's still "Låna bilen", the
//              sopbil's "Låna sopbilen"), E takes it (the driver out, a grown-up: CARJACK_BUS), one of
//              them asks where the driver went, a parked car rammed, a wall, a passer-by knocked
//              over, their remarks now and then, the tant at a bus stop ("Jag ska av här!") and
//              driven past it ("Du körde förbi min hållplats!"), Ove's answers, the stage texts'
//              noun, E out and in (no second "where's the driver"), the passengers baked one a frame
//              (the ms it costs), a wrecked bus (gone from it), a removed one (disposed).
// Failed checks are pushed to the run's errors ('N errors').
export default ({ page, ev, shot, frames, sleep, errors }) => {
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const ok = (c, what, ...a) => { if (c) log('ok', what); else bad(what, ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))); return !!c; };

  // Real keys, held: `want` the set down now (the rest let go).
  const down = new Set();
  const keys = async (want) => {
    for (const k of [...down]) if (!want.includes(k)) { await page.keyboard.up(k); down.delete(k); }
    for (const k of want) if (!down.has(k)) { await page.keyboard.down(k); down.add(k); }
  };
  const press = async (k) => { await page.keyboard.down(k); await frames(3); await page.keyboard.up(k); await frames(2); };
  const car = () => ev(() => { const c = __game.playerCar; return c && { kind: c.kind, x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, sp: c.speed }; });
  // Drive through the points ([x, z]) with W and A / D by the heading error (S brakes for a sharp turn).
  const drive = async (pts, { maxMs = 30000, reach = 3, slowTurn = 0.6, until } = {}) => {
    let i = 0;
    const t0 = Date.now();
    while (i < pts.length && Date.now() - t0 < maxMs) {
      if (until && await ev(until)) break;
      const s = await car();
      if (!s) break;
      const [tx, tz] = pts[i];
      if (Math.hypot(tx - s.x, tz - s.z) < reach) { i++; continue; }
      let err = Math.atan2(tx - s.x, tz - s.z) - s.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      const k = [];
      if (Math.abs(err) > slowTurn && s.v > 5) k.push('KeyS'); else k.push('KeyW');
      if (err < -0.05) k.push('KeyD'); else if (err > 0.05) k.push('KeyA');
      await keys(k);
      await sleep(50);
    }
    await keys([]);
    return i >= pts.length;
  };
  const brake = async (ms = 2500) => { await keys(['KeyS']); await sleep(ms); await keys([]); };

  // The road past the Solrosvägen bus stop (it runs along x; heading +x the stop is on the right):
  // { c (the road's z), lane (the right lane's z heading +x), a (the stop along x), stop (its landmark) }
  const road = () => ev(async () => {
    const { BUS_STOPS } = await import('/src/world/streets.js');
    const { LANE } = await import('/src/world/layout.js');
    const b = BUS_STOPS.find((s) => s.lm === 'busStop');
    return { c: b.c, lane: b.c + LANE, a: b.a, stop: window.__lm('busStop') };
  });
  // A bus like spawnTrafficCar's (a seated driver bust, its passengers boarded), at x, z, yaw; ai:
  // driving its traffic route, else standing with the engine on. Any other bus is taken away first.
  const spawnBus = (o) => ev(async (o) => {
    const g = __game;
    const { Car } = await import('/src/actors/car.js');
    const { randomPed } = await import('/src/actors/models.js');
    const { AIDriver } = await import('/src/actors/drivers.js');
    for (const c of g.cars.slice()) if (c.kind === 'bus') g.removeCar(c);
    const car = new Car('bus');
    car.place(o.x, o.z, o.yaw);
    car.traffic = true;
    g.addBust(randomPed(), car);
    if (o.ai) car.ai = new AIDriver(car, { mode: 'traffic', cruise: 9 }); else car.ctrl.park = true;
    let s = o.seed || 7;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    g.buss.board(car, r, o.now ?? true);
    g.addCar(car);
    window.__bus = car;
    const R = car.riders;
    return { n: R.list.length, tant: R.list.filter((p) => p.tant).length, old: R.list.filter((p) => p.old).length, kids: R.list.filter((p) => p.def.age < 13).length, mesh: !!R.mesh, ages: R.list.map((p) => p.def.sex + p.def.age) };
  }, o);
  // A point in the bus's frame (x = its left, z = forward, y up) in the world.
  const local = (lx, y, lz) => ev(([lx, y, lz]) => {
    const t = window.__bus, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    return [t.x + fz * lx + fx * lz, t.y + y, t.z - fx * lx + fz * lz];
  }, [lx, y, lz]);
  // The camera by hand (the rig frozen until free()), the HUD hidden.
  const camAt = (at, look, fov = 45) => ev(([at, look, fov]) => {
    const g = __game, c = g.cam;
    c._upd ||= c.update;
    c.update = function () {};
    g._hnc ||= g.hideNearCamera;
    g.hideNearCamera = function () {};
    c.cam.position.set(...at); c.cam.lookAt(...look); c.cam.fov = fov; c.cam.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
  }, [at, look, fov]);
  const free = () => ev(() => { const g = __game, c = g.cam; if (c._upd) c.update = c._upd; if (g._hnc) g.hideNearCamera = g._hnc; document.getElementById('hud').style.display = ''; c.snapNext = true; });
  const views = async (list) => {
    for (const [name, at, look, fov] of list) {
      await camAt(await local(...at), await local(...look), fov);
      await frames(8);
      await shot('buss_' + name);
    }
  };
  // Clear the stage: no traffic, Ove on foot, the patrol and the calls quiet.
  const prep = () => ev(() => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    for (const c of g.cars.slice()) if (c.traffic) g.removeCar(c);
    g.patrol.pause?.(true);
  });
  const blog = () => ev(() => __game.buss.log.map((l) => ({ ...l })));
  // (a timeout is not an error here: the check after it says what was missing)
  const waitFor = async (fn, ms) => { try { await page.waitForFunction(fn, { timeout: ms, polling: 100 }); } catch (e) { /* checked below */ } };
  const prompt = () => ev(() => document.getElementById('prompt')?.textContent || '');
  const bubbles = () => ev(() => [...document.querySelectorAll('.bubble')].map((b) => b.textContent));

  return {
    async busslook() {
      await frames(20);
      await prep();
      const rd = await road();
      const info = await spawnBus({ x: rd.a - 40, z: rd.lane, yaw: Math.PI / 2, seed: +(process.env.SEED || 7) });
      log('bus', JSON.stringify(info));
      ok(info.n >= 5 && info.n <= 9, 'a busload of 5-9', info.n);
      ok(info.tant === 1, 'one tant among them', info);
      ok(info.kids === 0, 'no children', info);
      ok(info.mesh, 'baked at once while loading (now)');
      const geo = await ev(() => { const m = __game.buss && window.__bus.riders.mesh; return { groups: m.geometry.groups.length, mats: Array.isArray(m.material) ? m.material.length : 1, surfs: m.geometry.userData.surfaces, verts: m.geometry.attributes.position.count, tris: m.geometry.index.count / 3, parent: m.parent === window.__bus.tilt }; });
      log('mesh', JSON.stringify(geo));
      ok(geo.groups === geo.surfs.length && geo.groups <= 3, 'one mesh, a group per surface', geo);
      ok(geo.parent, 'in the bus\'s tilt frame');
      await ev(() => { const g = __game, b = window.__bus; g.player.teleport(b.x - 14, b.z - 9, 0); });
      await views([
        ['left', [8, 2.0, 0], [0, 1.5, 0], 50],
        ['right', [-8, 2.0, -0.5], [0, 1.5, -0.5], 50],
        ['window', [2.6, 2.0, -1.2], [0.6, 1.6, -1.4], 50],
        ['window2', [-2.6, 2.0, -3.4], [-0.6, 1.6, -3.4], 50],
        ['front', [0.4, 2.3, 9], [0, 1.6, 2], 40],
        ['inside', [0, 2.3, 4.6], [0, 1.4, -3], 70],
        ['insideback', [0, 2.4, -5.4], [0, 1.3, 2], 70],
      ]);
      // what they cost: the same view with them and without
      await camAt(await local(10, 3, 6), await local(0, 1.4, 0), 50);
      await frames(10);
      const withR = await ev(() => window.__stats().calls);
      // (out of the bus: car.syncView sets its visible every frame)
      await ev(() => { const b = window.__bus; b.tilt.remove(b.riders.mesh); });
      await frames(10);
      const without = await ev(() => window.__stats().calls);
      await ev(() => { const b = window.__bus; b.tilt.add(b.riders.mesh); });
      log('calls with / without the passengers', withR, without);
      ok(withR - without >= 2 && withR - without <= 4, 'a busload costs a driver\'s draw calls (two a pass, not in the shadow pass)', withR - without);
      // far: hidden behind the LOD body's opaque glass
      await camAt(await local(-30, 30, 60), await local(0, 1.4, 0), 12);
      await frames(10);
      const far = await ev(() => ({ lod: window.__bus.lod, vis: window.__bus.riders.mesh.visible }));
      ok(far.lod && !far.vis, 'hidden with the far LOD', far);
      await shot('buss_far');
      await free();
    },

    async buss() {
      await frames(20);
      await prep();
      const rd = await road();
      log('road', JSON.stringify(rd));
      const L = await ev(async () => { const S = await import('/src/game/script.js'); return { CARJACK_BUS: S.CARJACK_BUS, CARJACK: S.CARJACK, BUS_ABOARD: S.BUS_ABOARD, BUS_HIT: S.BUS_HIT, BUS_HIT_OLD: S.BUS_HIT_OLD, BUS_RIDE: S.BUS_RIDE, BUS_OLD: S.BUS_OLD, BUS_REPLY: S.BUS_REPLY, OVE_BUS_HIT: S.OVE_BUS_HIT }; });
      const hitLines = (kind) => [...(kind === 'car' ? [...L.BUS_HIT.car, ...L.BUS_HIT.any] : L.BUS_HIT[kind]), ...L.BUS_HIT_OLD];

      // --- the prompt beside a bus, a car and the sopbil (each with a driver)
      const x0 = rd.a - 110;
      const info = await spawnBus({ x: x0, z: rd.lane, yaw: Math.PI / 2 });
      log('bus', JSON.stringify(info));
      const others = await ev(async ({ x, z }) => {
        const g = __game;
        const { Car } = await import('/src/actors/car.js');
        const { randomPed } = await import('/src/actors/models.js');
        const out = [];
        for (const [type, dx] of [['volvo240', -24], ['garbage', -40]]) {
          const c = new Car(type);
          c.place(x + dx, z, Math.PI / 2);
          c.traffic = true;
          g.addBust(randomPed(), c);
          c.ctrl.park = true;
          g.addCar(c);
          out.push(type);
        }
        window.__others = g.cars.filter((c) => out.includes(c.kind) && c.traffic && Math.abs(c.z - z) < 1);
        return out;
      }, { x: x0, z: rd.lane });
      const promptAt = async (which) => {
        await ev((which) => {
          const g = __game, c = which === 'bus' ? window.__bus : window.__others.find((o) => o.kind === which);
          const e = g.exitSpot(c, 1);
          g.player.teleport(e.x, e.z, Math.atan2(c.x - e.x, c.z - e.z));
          g.cam.snapNext = true;
        }, which);
        await frames(12);
        return prompt();
      };
      for (const [which, want] of [['bus', 'Låna bussen'], ['volvo240', 'Låna bilen'], ['garbage', 'Låna sopbilen']]) {
        const p = await promptAt(which);
        ok(p.includes(want), `the prompt beside the ${which} says "${want}"`, p);
      }
      await ev(() => { for (const c of window.__others) __game.removeCar(c); });
      const pb = await promptAt('bus');
      await shot('buss_prompt');

      // --- E: in at the wheel; the driver out, a grown-up, with a bus's line
      await ev(() => { __game.buss.rand = () => 0.01; });
      await press('KeyE');
      await frames(10);
      const inBus = await ev(() => { const g = __game, b = window.__bus; return { inBus: g.playerCar === b, the: b.the, peds: g.peds.map((p) => p.char).filter((c) => Math.hypot(c.x - b.x, c.z - b.z) < 9).map((c) => c.def.age) }; });
      ok(inBus.inBus, 'E took the bus', pb);
      ok(inBus.peds.length && inBus.peds.every((a) => a >= 19), 'its driver out beside it, a grown-up', inBus.peds);
      const b0 = await bubbles();
      ok(b0.some((t) => L.CARJACK_BUS.includes(t)) && !b0.some((t) => L.CARJACK.includes(t)), 'the driver: "my bus", not "my car"', b0);
      // the stage texts: "Kliv ur bussen."
      const sub = await ev(() => { const g = __game, s = __stages.goto({ to: { x: 0, z: 0 }, onFoot: true }), m = __stages.newCtx(); s.init(g, m); s.update(g, m, 1 / 60); return s.sub; });
      ok(sub === 'Kliv ur bussen.', 'a stage asks him out of "bussen"', sub);
      await waitFor(() => __game.buss.log.some((l) => l.kind === 'aboard'), 4000);
      const ab = (await blog()).find((l) => l.kind === 'aboard');
      ok(ab && L.BUS_ABOARD.includes(ab.text), 'one of them asks where the driver went', ab);
      const voiceOk = await ev(() => {
        const g = __game, R = window.__bus.riders.list, P = __voice.manifest?._pool;
        return g.buss.log.filter((l) => l.who !== 'ove').map((l) => {
          const p = R.find((r) => r.at === l.at || (r.at[0] === l.at?.[0] && r.at[2] === l.at?.[2]));
          const band = p.def.age < 35 ? 'young' : p.def.age < 65 ? 'mid' : 'old';
          return { who: l.who, want: `${p.def.sex}_${band}`, ok: !P || (P[`${p.def.sex}_${band}`] || []).includes(l.who) };
        });
      });
      ok(voiceOk.length && voiceOk.every((v) => v.ok), 'said in the speaker\'s own pool voice (sex, age)', voiceOk);
      await waitFor(() => __game.buss.log.some((l) => l.kind === 'ove'), 5000);
      const ans = (await blog()).find((l) => l.kind === 'ove');
      ok(ans && ans.text === L.BUS_REPLY[ab?.text], 'Ove answers it', ans);
      await shot('buss_aboard');
      // (their own remarks wait until they are tested: none in the middle of the hits)
      await ev(() => { __game.buss.rideT = 1e9; });

      // --- a parked car rammed with W
      await ev(async ({ x, z }) => {
        const g = __game;
        const { Car } = await import('/src/actors/car.js');
        const c = new Car('volvo240', { engineOn: false });
        c.place(x + 42, z, Math.PI / 2);
        g.addCar(c);
        window.__victim = c;
      }, { x: x0, z: rd.lane });
      await drive([[x0 + 60, rd.lane]], { maxMs: 25000, until: () => (__game.buss.stats.kinds.car || 0) > 0 || window.__victim.speed > 1 });
      await sleep(1500);
      await brake(2500);
      let lg = await blog();
      const cars = lg.filter((l) => l.kind === 'car');
      log('car lines', JSON.stringify(cars.map((l) => l.text)));
      ok(cars.length >= 1 && cars.every((l) => hitLines('car').includes(l.text)), 'ramming a car: they say so', cars);
      ok(cars.length >= 2, 'a hard one: two of them', cars.length);
      await shot('buss_hit');
      await ev(() => __game.removeCar(window.__victim));

      // --- a wall (the impact as car.js reports one against a block)
      await sleep(4200);
      await ev(() => { const g = __game, b = g.playerCar; g.onCarImpact(b, null, 7, b.x, b.z); });
      await frames(5);
      lg = await blog();
      const anyL = lg.filter((l) => l.kind === 'any');
      ok(anyL.length >= 1 && anyL.every((l) => hitLines('any').includes(l.text)), 'into a wall: they say so', anyL);
      const hit2 = await ev(() => __game.buss.stats.kinds.any || 0);
      await ev(() => { const g = __game, b = g.playerCar; g.onCarImpact(b, null, 7, b.x, b.z); });
      ok(await ev(() => __game.buss.stats.kinds.any || 0) === hit2, 'not again at once (hitGap)');

      // --- a passer-by knocked over with W (standing still in the lane, no step aside)
      const ped = await ev(() => {
        const g = __game, b = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        const p = g.peds.find((p) => (p.char.def.age ?? 30) >= 19 && p.char.state === 'normal' && Math.hypot(p.char.x - b.x, p.char.z - b.z) > 30);
        p.char.teleport(b.x + fx * 22, b.z + fz * 22, b.yaw + Math.PI);
        p.idleT = 999; p.panicT = 999;
        window.__ped = p;
        return { x: p.char.x, z: p.char.z };
      });
      await sleep(4200);
      await drive([[ped.x + 25, rd.lane]], { maxMs: 20000, until: () => (__game.buss.stats.kinds.person || 0) > 0 || window.__ped.char.state !== 'normal' });
      await sleep(800);
      await brake(3000);
      lg = await blog();
      const pers = lg.filter((l) => l.kind === 'person');
      ok(pers.length >= 1 && pers.every((l) => hitLines('person').includes(l.text)), 'a passer-by knocked over: they say so', pers, await ev(() => window.__ped.char.state));
      ok(!lg.some((l) => l.kind === 'ove' && L.OVE_BUS_HIT.includes(l.text) && l.t > (pers[0]?.t ?? 1e9) - 0.1 && l.t < (pers[0]?.t ?? 0) + 3), 'Ove says nothing to that');

      // --- their own remarks: the tant wants off at random, an old one's, anyone's
      for (const [r, want] of [[0.01, 'off'], [0.01, 'ride'], [0.5, 'ride']]) {
        await ev(({ r, first }) => { const g = __game; g.buss.rand = () => r; g.buss.rideT = g.time; if (first) g.buss.offT = -99; }, { r, first: want === 'off' });
        await frames(3);
        const l = (await blog()).at(-1);
        log('remark', JSON.stringify(l));
        ok(l.kind === want, `a remark of theirs (${want})`, l);
      }
      lg = await blog();
      ok(lg.some((l) => l.kind === 'off' && l.tant && l.text === L.BUS_OLD.off), '"Jag ska av här!" from the tant');
      ok(lg.some((l) => l.kind === 'ride' && l.old && L.BUS_OLD.ride.includes(l.text)), 'an old one\'s remark');
      ok(lg.some((l) => l.kind === 'ride' && L.BUS_RIDE.includes(l.text)), 'anyone\'s remark');
      await ev(() => { __game.buss.rand = () => 0.01; __game.buss.rideT = 1e9; });

      // --- the bus stop: up to it (she wants off), past it without stopping (she says so)
      const stopRun = async (stopAt) => {
        await ev(({ x, z }) => { const g = __game, b = g.playerCar; b.place(x, z, Math.PI / 2); g.cam.snapNext = true; g.buss.offT = -99; b.riders.wanted = null; b.riders.near = null; }, { x: rd.a - 75, z: rd.lane });
        await frames(10);
        if (stopAt) {
          await drive([[rd.a - 4, rd.lane]], { maxMs: 30000, reach: 2.5 });
          await brake(3500);
          await sleep(500);
        }
        await drive([[rd.a + 70, rd.lane]], { maxMs: 40000, reach: 4 });
        await sleep(1200);
      };
      const t1 = await ev(() => __game.time);
      await stopRun(false);
      lg = (await blog()).filter((l) => l.t > t1);
      log('past the stop', JSON.stringify(lg.map((l) => [l.kind, l.text])));
      ok(lg.some((l) => l.kind === 'off' && l.tant), 'coming up to the bus stop the tant wants off');
      ok(lg.some((l) => l.kind === 'missed' && l.tant && l.text === L.BUS_OLD.missed), 'driven past it: "Du körde förbi min hållplats!"');
      await shot('buss_stop');
      const t2 = await ev(() => __game.time);
      await stopRun(true);
      lg = (await blog()).filter((l) => l.t > t2);
      log('stopped at the stop', JSON.stringify(lg.map((l) => [l.kind, l.text])));
      ok(lg.some((l) => l.kind === 'off'), 'coming up to it again: she wants off');
      ok(!lg.some((l) => l.kind === 'missed'), 'stopped at it: no complaint (and nobody gets off)');
      ok(await ev(() => window.__bus.riders.list.length) === info.n, 'nobody got off', info.n);

      // --- E out and in again: no second "where's the driver"
      await brake(2000);
      await press('KeyE');
      await frames(10);
      ok(await ev(() => !__game.playerCar), 'E out');
      const nAb = await ev(() => __game.buss.stats.kinds.aboard || 0);
      await ev(() => { const g = __game, b = window.__bus, e = g.exitSpot(b, 1); g.player.teleport(e.x, e.z, 0); });
      await frames(5);
      ok((await prompt()).includes('Kliv in'), 'beside it again (no driver now): "Kliv in"', await prompt());
      await press('KeyE');
      await sleep(2500);
      ok(await ev(() => __game.playerCar === window.__bus), 'E in again');
      ok(await ev(() => __game.buss.stats.kinds.aboard || 0) === nAb, 'no second "where\'s the driver"');

      // --- the bubble over the roof where the speaker sits, the chase camera
      await ev(() => { const g = __game; g.buss.rand = () => 0.99; g.buss.talk(g.playerCar, 'off'); });
      await frames(20);
      await shot('buss_bubble');
      const bub = await bubbles();
      ok(bub.includes(L.BUS_OLD.off), 'the bubble is up', bub);

      // --- the passengers of a new bus are baked a frame or so at a time
      const bake = await ev(async () => {
        const g = __game;
        const { Car } = await import('/src/actors/car.js');
        const c = new Car('bus');
        c.place(g.player.x + 400, g.player.z, 0);
        c.traffic = true;
        g.buss.board(c, Math.random, false);
        g.addCar(c);
        window.__bus2 = c;
        return { n: c.riders.list.length, parts: c.riders.parts.length, mesh: !!c.riders.mesh };
      });
      await frames(1);
      const b1 = await ev(() => ({ parts: window.__bus2.riders.parts.length, mesh: !!window.__bus2.riders.mesh }));
      await frames(14);
      const b2 = await ev(() => ({ mesh: !!window.__bus2.riders.mesh }));
      const ms = await ev(async () => {
        const { bakeBust } = await import('/src/actors/models.js');
        const { randomPed } = await import('/src/actors/models.js');
        const t = [];
        for (let k = 0; k < 6; k++) { const d = randomPed(); const t0 = performance.now(); const gg = bakeBust(d, { driving: false }); t.push(performance.now() - t0); gg.dispose(); }
        return t.map((x) => +x.toFixed(1));
      });
      log('bake', JSON.stringify({ bake, b1, b2, ms }));
      ok(!bake.mesh && b1.parts >= 1 && b1.parts < bake.n && !b1.mesh, 'not all at once', b1);
      ok(b2.mesh, 'all of them in it a few frames later', b2);

      // --- removed: its mesh disposed; wrecked with Ove in it: they are gone from it
      const disp = await ev(() => {
        const g = __game, c = window.__bus2, geo = c.riders.mesh.geometry;
        let gone = false;
        const d0 = geo.dispose.bind(geo);
        geo.dispose = () => { gone = true; d0(); };
        g.removeCar(c);
        return { gone, riders: c.riders };
      });
      ok(disp.gone && disp.riders === null, 'a removed bus disposes its passengers', disp);
      await ev(() => { const g = __game; g.playerCar.damage(1e6, g); });
      await frames(5);
      const wreck = await ev(() => ({ riders: window.__bus.riders, out: !__game.playerCar, banner: document.getElementById('banner')?.textContent || '' }));
      ok(wreck.riders === null && wreck.out, 'wrecked: out, and nobody left in it', wreck);
      ok(/Bussen är förstörd/.test(wreck.banner), 'KVADDAD: "Bussen är förstörd"', wreck.banner);
      log('stats', JSON.stringify(await ev(() => __game.buss.stats)));
      // With the voices (QUERY='&voice'): every line of theirs and Ove's answers said as a clip.
      const vs = await ev(() => {
        const v = __voice;
        if (!v.enabled) return null;
        const said = new Set(__game.buss.log.map((l) => l.text));
        const recs = v.log.filter((r) => said.has(r.text));
        return { n: recs.length, clips: recs.filter((r) => r.clip).length, noClip: recs.filter((r) => !r.clip).map((r) => [r.who, r.text]), dropped: recs.filter((r) => r.dropped).length, cut: recs.filter((r) => r.cut > 0.05).map((r) => [r.who, r.text, +r.cut.toFixed(2)]), unknown: v.unknown.slice(), modes: [...new Set(recs.map((r) => r.mode))] };
      });
      if (vs) {
        log('voice', JSON.stringify(vs));
        ok(vs.n > 10 && !vs.noClip.length, 'their lines and Ove\'s answers said as clips', vs.noClip);
        ok(!vs.unknown.length, 'nothing said that is not in script.js', vs.unknown);
      }
    },
  };
};
