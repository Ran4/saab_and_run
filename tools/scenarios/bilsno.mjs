// Snow on cars (feature sno_pa_bilar): a snowed-in parked car driven away sheds its snow.
export default ({ page, ev, shot, frames, sleep, hold, tap, until, errors }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg) => { if (!ok) fail(msg); else console.log('[t] ok', msg); };
  // A snowed-in parked car of `type` put on Solrosvägen's eastbound lane (or at x, z, yaw), Ove at
  // the wheel (E), the chase camera behind it.
  const takeCar = (o = {}) => ev(async (o) => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    // (dark paint unless LIGHT: the snow reads against it)
    const lum = (c) => c._paintLin.r * 0.2 + c._paintLin.g * 0.7 + c._paintLin.b * 0.1;
    const ok = (c) => c.snowy && !c.dead && !c.locked && !c.snowFx && (!o.type || c.kind === o.type);
    let c = g.cars.find((c) => ok(c) && (o.light ? lum(c) > 0.3 : lum(c) < 0.08)) || g.cars.find(ok);
    if (!c) return null;
    c.place(o.x ?? -60, o.z ?? -40 + 2.75, o.yaw ?? Math.PI / 2);
    g.player.teleport(c.x - Math.cos(c.yaw) * 2.2, c.z + Math.sin(c.yaw) * 2.2, c.yaw);
    g.cam.yaw = c.yaw; g.cam.snapNext = true;
    window.__sc = c;
    return { kind: c.kind, x: c.x, z: c.z };
  }, o);
  const snowState = () => ev(async () => {
    const { carSnowStats } = await import('./src/actors/carsnow.js');
    const c = window.__sc;
    return { kmh: +(c.speed * 3.6).toFixed(0), fx: c.snowFx ? c.snowFx.stats() : null, snowy: c.snowy, cap: !!c.snowCap, lumps: carSnowStats() };
  });
  return {
    async bilsnodrive() {
      const r = await takeCar({ type: process.env.TYPE || 'volvo240' });
      console.log('[t] took', JSON.stringify(r));
      await frames(10);
      await shot('bilsno_d0');
      await tap('KeyE');
      await frames(10);
      console.log('[t] in', JSON.stringify(await snowState()));
      await sleep(900);
      await shot('bilsno_d1wipe');
      await sleep(1500);
      await shot('bilsno_d2wipe');
      console.log('[t] wiped', JSON.stringify(await snowState()));
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 8; i++) {
        await sleep(700);
        await shot('bilsno_d3go' + i);
        console.log('[t] go', i, JSON.stringify(await snowState()));
      }
      await page.keyboard.up('KeyW');
      await hold(['KeyS'], 1500);
      await shot('bilsno_d4brake');
      console.log('[t] braked', JSON.stringify(await snowState()));
      await sleep(1000);
      console.log('[t] end', JSON.stringify(await snowState()));
    },
    // Close-ups: the wipers from the front, then the snow left after a short drive from four sides,
    // and what lies on the road behind.
    async bilsnolook() {
      const cam = (o) => ev((o) => {
        const g = __game, c = window.__sc, cam = g.cam.cam;
        g.cam.update = function () {};
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx;
        const P = (f, r, y) => [c.x + fx * f + rx * r, c.y + y, c.z + fz * f + rz * r];
        cam.position.set(...P(o.at[0], o.at[1], o.at[2]));
        const L = o.look ? P(o.look[0], o.look[1], o.look[2]) : [c.x, c.y + 1.1, c.z];
        cam.lookAt(...L); cam.fov = o.fov || 40; cam.updateProjectionMatrix();
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
      }, o);
      const free = () => ev(() => { const g = __game; delete g.cam.update; g.hideHud = false; document.getElementById('hud').style.display = ''; });
      await takeCar({ type: process.env.TYPE || 'volvo240' });
      await frames(5);
      await tap('KeyE');
      await cam({ at: [5.5, 1.2, 2.2], look: [0.6, 0, 1.0], fov: 38 });
      for (let i = 0; i < 4; i++) { await sleep(450); await shot('bilsno_l0wipe' + i); }
      await sleep(2500);
      await shot('bilsno_l1wiped');
      await free();
      await hold(['KeyW'], +(process.env.GO || 4200));
      await hold(['KeyS'], 2600);
      await frames(30);
      console.log('[t] after', JSON.stringify(await snowState()));
      const views = [['back', [-4.5, -2.2, 2.4]], ['side', [0.3, -4.6, 2.2]], ['front', [4.6, 2.4, 2.3]], ['top', [-1.5, -1.0, 4.2]]];
      for (const [n, at] of views) { await cam({ at, look: [0, 0, 1.0] }); await frames(8); await shot('bilsno_l2' + n); }
      // the road behind it
      await cam({ at: [-6, -3.5, 2.2], look: [-24, 0, 0], fov: 50 });
      await frames(8);
      await shot('bilsno_l3road');
      console.log('[t] lumps', JSON.stringify(await snowState()));
    },
    // A snowed-in car pulling away flat out past a camera at the roadside (frames every ~80 ms).
    async bilsnopass() {
      await takeCar({ type: process.env.TYPE || 'volvo240', x: -100 });
      await frames(5);
      await tap('KeyE');
      await sleep(2600);
      const at = +(process.env.AT || 60);
      await ev((at) => {
        const g = __game, c = window.__sc, cam = g.cam.cam;
        g.cam.update = function () {};
        cam.position.set(-100 + at, c.y + 1.4, c.z - 5.2);
        cam.lookAt(-100 + at - 9, c.y + 0.8, c.z + 1); cam.fov = 50; cam.updateProjectionMatrix();
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
      }, at);
      await page.keyboard.down('KeyW');
      let n = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 14000 && n < 40) {
        const x = await ev(() => window.__sc.x);
        if (x > -100 + at - 30 && x < -100 + at + 25) { await page.screenshot({ path: `${process.env.OUT || 'out'}/bilsno_pass${String(n).padStart(2, '0')}.png` }); n++; }
        else if (x >= -100 + at + 25) break;
        else await sleep(40);
      }
      await page.keyboard.up('KeyW');
      console.log('[t] pass', n, JSON.stringify(await snowState()));
    },
    // The cost: the same flat-out drive (real keys) in a snowed-in car and in the same model without
    // snow; the frame loop / update / render times, the snow's own step and tick per frame, and that
    // no shader program is compiled while it sheds (the warm-up has them all).
    async bilsnoperf() {
      await ev(async () => {
        const g = window.__game;
        window.__pf = { loop: [], upd: [], rf: [], on: false };
        const L = g.loop.bind(g), U = g.update.bind(g);
        g.update = function (dt) { const t0 = performance.now(); U(dt); if (__pf.on) __pf.upd.push(performance.now() - t0); };
        g.loop = function (t) { const t0 = performance.now(); L(t); if (__pf.on) __pf.loop.push(performance.now() - t0); };
        const { CarSnow } = await import('./src/actors/carsnow.js');
        const st = CarSnow.prototype.step;
        window.__stepMs = 0;
        CarSnow.prototype.step = function (dt) { const t0 = performance.now(); st.call(this, dt); window.__stepMs += performance.now() - t0; };
      });
      const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), n: a.length }; };
      const run = async (snow) => {
        await ev(async (snow) => {
          const g = __game, { Car } = await import('./src/actors/car.js');
          if (g.playerCar) g.exitCar(true);
          if (window.__pc) { g.removeCar(window.__pc); window.__pc = null; }
          const c = new Car('volvo240', { snow, color: 0x1a1c1e, solid: true, engineOn: false });
          c.place(-100, -40 + 2.75, Math.PI / 2);
          g.addCar(c);
          window.__pc = window.__sc = c;
          g.player.teleport(c.x - 2.2 * Math.cos(c.yaw), c.z + 2.2 * Math.sin(c.yaw), c.yaw);
          g.enterCar(c);
          g.cam.yaw = c.yaw; g.cam.snapNext = true;
        }, snow);
        await frames(30);
        const p0 = await ev(async () => { const gfx = await import('/src/gfx.js'); return gfx.renderer.info.programs.length; });
        await ev(async () => { const { carSnowStats } = await import('./src/actors/carsnow.js'); const s = carSnowStats(); window.__t0 = [s.tickMs, s.ticks, window.__stepMs]; __pf.loop.length = __pf.upd.length = __pf.rf.length = 0; __pf.on = true; });
        await hold(['KeyW'], 7000);
        await hold(['KeyS'], 1500);
        const r = await ev(async () => {
          __pf.on = false;
          const gfx = await import('/src/gfx.js'), { carSnowStats } = await import('./src/actors/carsnow.js');
          const s = carSnowStats(), n = __pf.loop.length;
          return { loop: __pf.loop.slice(), upd: __pf.upd.slice(), programs: gfx.renderer.info.programs.length, tickMs: (s.tickMs - window.__t0[0]) / Math.max(1, s.ticks - window.__t0[1]), stepMs: (window.__stepMs - window.__t0[2]) / Math.max(1, n), lumps: s, left: window.__sc.snowFx?.stats() ?? 'gone', calls: gfx.renderer.info.render.calls };
        });
        const row = { loop: stat(r.loop), update: stat(r.upd), snowStepPerFrame: +r.stepMs.toFixed(4), snowTickPerFrame: +r.tickMs.toFixed(4), newPrograms: r.programs - p0, left: r.left };
        console.log(`[t] perf ${snow ? 'snow  ' : 'nosnow'}`, JSON.stringify(row), 'lumps made', r.lumps.made);
        return row;
      };
      const R = { snow: [], nosnow: [] };
      for (let i = 0; i < +(process.env.RUNS || 2); i++) { R.snow.push(await run(true)); R.nosnow.push(await run(false)); }
      const m = (a, k) => +(a.reduce((x, y) => x + y[k].mean, 0) / a.length).toFixed(2);
      console.log('[t] perf mean loop snow', m(R.snow, 'loop'), 'nosnow', m(R.nosnow, 'loop'), '| update snow', m(R.snow, 'update'), 'nosnow', m(R.nosnow, 'update'));
      check(R.snow.every((r) => r.newPrograms === 0), 'no shader compiled while the snow goes (' + R.snow.map((r) => r.newPrograms) + ')');
      check(R.snow.every((r) => r.snowStepPerFrame + r.snowTickPerFrame < 0.25), 'the snow costs < 0.25 ms of CPU a frame (' + R.snow.map((r) => (r.snowStepPerFrame + r.snowTickPerFrame).toFixed(3)) + ')');
    },
    // The shedding stepped by hand (no rendering, no lumps): a snowed-in car accelerating at the
    // player's rate to a steady speed and holding it, every model, N cars each; what is left of the
    // snow (area share) after 5, 15, 30, 60 s and how much went at the pull-away. Then a hard stop
    // from 50 km/h and a 0.8 g turn. Prints the table; checks the broad shape.
    async bilsnosim() {
      const r = await ev(async (N) => {
        const { Car } = await import('./src/actors/car.js');
        const out = {};
        const mk = (type) => { const c = new Car(type, { snow: true, engineOn: true }); c.x = 5000; c.z = 5000; c.driver = {}; return c; };
        const area = (c) => c.snowFx ? c.snowFx.stats().area : 0;
        const drive = (c, prof, T) => {
          const dt = 1 / 60, res = {};
          let v = Math.hypot(c.vx, c.vz), t = 0;
          c.stepSnow(dt);
          for (; t < T; t += dt) {
            const want = prof(t);
            v = want > v ? Math.min(want, v + 4.6 * dt * (1 - (v / 38.75) ** 2)) : Math.max(want, v - 9.8 * dt);
            c.vx = 0; c.vz = v; c.yaw = 0;
            c.stepSnow(dt);
            for (const k of [3, 5, 15, 30, 60]) if (Math.abs(t - k) < dt / 2) res[k] = +area(c).toFixed(2);
          }
          return res;
        };
        for (const kmh of [30, 50, 70, 90]) {
          const acc = {};
          for (const type of ['volvo240', 'saab900', 'golf', 'audi', 'kombi', 'van']) for (let n = 0; n < N; n++) {
            const c = mk(type);
            const r = drive(c, () => kmh / 3.6, 61);
            for (const k in r) acc[k] = (acc[k] || 0) + r[k];
            c.dispose();
          }
          for (const k in acc) acc[k] = +(acc[k] / (6 * N)).toFixed(2);
          out[kmh] = acc;
        }
        // a hard stop from 50 (after 6 s at 50) and a turn
        const stop = { before: 0, after: 0 }, turn = { before: 0, after: 0 };
        for (let n = 0; n < N * 6; n++) {
          const c = mk(['volvo240', 'saab900', 'golf', 'audi', 'kombi', 'van'][n % 6]);
          drive(c, () => 50 / 3.6, 6);
          stop.before += area(c);
          drive(c, (t) => 0, 2.5);
          stop.after += area(c);
          c.dispose();
          const d = mk(['volvo240', 'saab900', 'golf', 'audi', 'kombi', 'van'][n % 6]);
          drive(d, () => 50 / 3.6, 6);
          turn.before += area(d);
          // 0.8 g sideways for 2 s
          const dt = 1 / 60;
          for (let t = 0; t < 2; t += dt) { const w = 7.8 / 13.9; d.yaw += w * dt; d.vx = Math.sin(d.yaw) * 13.9; d.vz = Math.cos(d.yaw) * 13.9; d.stepSnow(dt); }
          turn.after += area(d);
          d.dispose();
        }
        for (const o of [stop, turn]) { o.before = +(o.before / (N * 6)).toFixed(2); o.after = +(o.after / (N * 6)).toFixed(2); }
        return { speeds: out, stop, turn };
      }, +(process.env.N || 6));
      for (const [k, v] of Object.entries(r.speeds)) console.log(`[t] sim ${k} km/h: left after`, JSON.stringify(v));
      console.log('[t] sim hard stop from 50:', JSON.stringify(r.stop), ' 0.8 g turn at 50:', JSON.stringify(r.turn));
      const S = r.speeds;
      check(S[30][60] > 0.75, `at 30 km/h most of it stays (${S[30][60]} left after a minute)`);
      check(S[30][3] < 0.995, `pulling away loosens a little (${S[30][3]} left after 3 s)`);
      check(S[90][60] < 0.1, `at 90 km/h it is gone within a minute (${S[90][60]} left)`);
      check(S[30][30] > S[50][30] && S[50][30] > S[70][30] && S[70][30] > S[90][30], `the faster, the more goes (${[30, 50, 70, 90].map((k) => S[k][30])} after 30 s)`);
      check(r.stop.after < r.stop.before - 0.05 && r.stop.after > 0.3, `a hard stop throws some of it forwards (${r.stop.before} -> ${r.stop.after})`);
      check(r.turn.after < r.turn.before - 0.04, `a hard turn throws some of it off (${r.turn.before} -> ${r.turn.after})`);
    },

    // In the game: a parked snowy car rammed by the Saab (real keys) sheds some of its snow; a
    // shedding car far away is drawn on its own (its cap with what is left); once all of its snow is
    // gone it is an ordinary car again (no cap, shared materials, instanced far away).
    async bilsnochecks() {
      // 1. the ram
      const hit = await ev(() => {
        const g = __game;
        const t = g.cars.find((c) => c.snowy && !c.snowFx && !c.dead && Math.abs(c.x + 9.4) < 0.5 && Math.abs(c.z + 28.4) < 0.5) || g.cars.find((c) => c.snowy && !c.snowFx && !c.dead && c.home);
        window.__hit = t;
        const s = g.named.saab, yaw = t.yaw + Math.PI;   // nose to nose
        g.enterCar(s);
        s.place(t.x - Math.sin(yaw) * 16, t.z - Math.cos(yaw) * 16, yaw);
        g.cam.yaw = yaw; g.cam.snapNext = true;
        return { kind: t.kind, x: t.x, z: t.z, yaw: t.yaw };
      });
      console.log('[t] target', JSON.stringify(hit));
      await frames(10);
      await page.keyboard.down('KeyW');
      try { await until(() => window.__hit.snowFx || window.__hit.lastHitT, 9000); } catch (e) { /* checked below */ }
      await page.keyboard.up('KeyW');
      await hold(['KeyS'], 600);
      await sleep(1500);
      await shot('bilsno_c1ram');
      const r1 = await ev(async () => { const { carSnowStats } = await import('./src/actors/carsnow.js'); const t = window.__hit; return { fx: t.snowFx?.stats() ?? null, kmh: +(__game.named.saab.speed * 3.6).toFixed(0), lumps: carSnowStats().made }; });
      console.log('[t] rammed', JSON.stringify(r1));
      check(r1.fx && r1.fx.left < r1.fx.slabs, `a rammed parked car sheds some of its snow (${r1.fx ? r1.fx.slabs - r1.fx.left : 'no'} slabs)`);
      // 2. far away (a metallic one: its own frost materials must not compile anything either)
      await takeCar({ type: 'golf' });
      const p0 = await ev(async () => { const c = window.__sc; c.solid = false; const gfx = await import('/src/gfx.js'); return gfx.renderer.info.programs.length; });
      await tap('KeyE');
      await hold(['KeyW'], 2500);
      const p1 = await ev(async () => { const gfx = await import('/src/gfx.js'); return { n: gfx.renderer.info.programs.length, fx: !!window.__sc.snowFx }; });
      check(p1.fx && p1.n === p0, `no shader compiled when a car starts to shed (${p0} -> ${p1.n} programs)`);
      await hold(['KeyS'], 1500);
      const far = await ev(() => {
        const g = __game, c = window.__sc;
        g.exitCar(true);
        g.player.teleport(c.x - 70, c.z - 6, Math.PI / 2);
        g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
        return !!c.snowFx;
      });
      await frames(20);
      const r2 = await ev(() => { const c = window.__sc; return { shedding: !!c.snowFx, lod: c.lod, inst: c._inst, capLod: !!c.snowCapLod?.visible, ownCap: c.snowCapLod?.material?.name, bodyLod: c.bodyLod.visible }; });
      console.log('[t] far', far, JSON.stringify(r2));
      check(r2.shedding && r2.lod && !r2.inst && r2.capLod && r2.ownCap === 'carsnow:cap' && r2.bodyLod, `far away a shedding car is drawn on its own with what is left (${JSON.stringify(r2)})`);
      // 3. all gone
      await ev(() => { const c = window.__sc, S = c.snowFx; S.film = 0; for (let i = 0; i < S.alive.length; i++) if (S.alive[i]) S.detach(i, false, true); c.wake(); c.vx = 0.5; });
      await frames(10);
      const r3 = await ev(() => {
        const c = window.__sc, mats = [].concat(c.body.material, c.bodyLod.material);
        return { snowy: c.snowy, fx: !!c.snowFx, cap: !!c.snowCap || !!c.snowCapLod, own: mats.some((m) => m.userData.frostOwn), snowMat: mats.some((m) => m.defines?.TRI_SNOW), inTilt: c.tilt.children.some((o) => /snowCap/.test(o.name)) };
      });
      await frames(40);
      const r4 = await ev(() => { const c = window.__sc; return { lod: c.lod, inst: c._inst }; });
      console.log('[t] gone', JSON.stringify(r3), JSON.stringify(r4));
      check(!r3.snowy && !r3.fx && !r3.cap && !r3.own && !r3.snowMat && !r3.inTilt, `with all of its snow gone it is a clean car (${JSON.stringify(r3)})`);
      check(r4.lod && r4.inst, `... instanced far away again (${JSON.stringify(r4)})`);
    },
    // A snowed-in car over the hoppbacke (real keys, steering for the hill's axis like snohog): the
    // snow floats off while it flies and the landing shakes more loose.
    async bilsnohopp() {
      await ev(async () => {
        const { Car } = await import('./src/actors/car.js');
        const { JUMP_HILLS } = await import('./src/world/snowhill.js');
        const g = __game, H = (window.__H = JUMP_HILLS[0]), dir = -1;
        if (g.playerCar) g.exitCar(true);
        const u0 = -dir * (H.end + 30), yaw = Math.atan2(H.fx * dir, H.fz * dir);
        const c = new Car('volvo240', { snow: true, color: 0x22262a, solid: true, engineOn: false });
        c.place(H.x + H.fx * u0, H.z + H.fz * u0, yaw);
        g.addCar(c);
        window.__sc = c;
        g.player.teleport(c.x - Math.cos(yaw) * 2, c.z + Math.sin(yaw) * 2, yaw);
        g.enterCar(c);
        g.cam.yaw = yaw; g.cam.snapNext = true;
        g.hopp.rand = () => 1;
      });
      await sleep(2500);
      const held = new Set();
      const key = async (k, on) => { if (on && !held.has(k)) { await page.keyboard.down(k); held.add(k); } else if (!on && held.has(k)) { await page.keyboard.up(k); held.delete(k); } };
      let took = null, landed = false, n = 0, before = null;
      const t0 = Date.now();
      try {
        while (Date.now() - t0 < 25000) {
          const s = await ev(() => {
            const c = window.__sc, H = window.__H, A = Math.atan2(-H.fx, -H.fz);
            const wr = (c.x - H.x) * -Math.cos(A) + (c.z - H.z) * Math.sin(A);
            const yerr = Math.atan2(Math.sin(c.yaw - A), Math.cos(c.yaw - A));
            return { u: -H.along(c.x, c.z), wr, yerr, v: c.speed, air: c.air, fx: c.snowFx?.stats() };
          });
          if (!s.air) {
            const err = Math.atan2(s.wr, 9) - s.yerr;
            await key('KeyA', err > 0.025); await key('KeyD', err < -0.025);
            await key('KeyW', !landed && (s.u > -14.3 && s.u < -3.6 || s.v < 13.5));
            await key('KeyS', landed && s.v > 1);
          } else { await key('KeyA', false); await key('KeyD', false); }
          if (process.env.DEBUG && (took || s.u > -16)) console.log('[t] dbg', JSON.stringify(await ev(() => { const c = window.__sc, S = c.snowFx; return { air: c.air, v: +c.speed.toFixed(1), vy: +c.vy.toFixed(1), left: S?.left, ax: +S?.ax.toFixed(1), ay: +S?.ay.toFixed(1), az: +S?.az.toFixed(1), sh: +S?.shake.toFixed(2), hv: +c._sus.hv.toFixed(2) }; })));
          if (s.air && !took) { took = s; before = s.fx; }
          if (took && n < 10 && (s.air || n < 6)) { await shot('bilsno_hopp' + n); n++; }
          if (took && !s.air) landed = true;
          if (landed && s.v < 1.5) break;
          await sleep(30);
        }
      } finally { for (const k of [...held]) await key(k, false); }
      await sleep(800);
      const after = await snowState();
      console.log('[t] hopp before', JSON.stringify(before), 'after', JSON.stringify(after));
      check(took && before && after.fx && after.fx.left < before.left, `snow comes off over the jump (${before?.left} -> ${after.fx?.left} slabs)`);
    },
    async bilsnogeo() {
      const r = await ev(async () => {
        const { carModel, snowCapGeometry, MODEL_KEYS } = await import('./src/actors/carmodels.js');
        const out = {};
        for (const k of MODEL_KEYS) {
          const m = carModel(k), cg = snowCapGeometry(m.body, m.glass), cl = snowCapGeometry(m.lod, null);
          if (!cg) { out[k] = null; continue; }
          cg.computeBoundingBox();
          const b = cg.boundingBox;
          out[k] = { tris: cg.index ? cg.index.count / 3 : cg.attributes.position.count / 3, verts: cg.attributes.position.count, lodTris: cl ? (cl.index ? cl.index.count / 3 : 0) : 0, attrs: Object.keys(cg.attributes), surf: cg.userData.surfaces, box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)), len: m.len, wid: m.wid };
        }
        return out;
      });
      for (const [k, v] of Object.entries(r)) console.log('[t]', k, JSON.stringify(v));
    },
    async bilsnoexplore() {
      const r = await ev(() => {
        const g = __game, p = g.player;
        const snowy = g.cars.filter((c) => c.snowy && !c.dead);
        snowy.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        window.__sc = snowy;
        return { n: snowy.length, total: g.cars.length, kinds: [...new Set(snowy.map((c) => c.kind))], first: snowy.slice(0, 5).map((c) => [c.kind, +c.x.toFixed(1), +c.z.toFixed(1), +c.yaw.toFixed(2), c.locked]) };
      });
      console.log('[t] snowy', JSON.stringify(r));
      for (let i = 0; i < 3; i++) {
        await ev((i) => {
          const g = __game, c = window.__sc[i];
          g.cam.update = function () {};
          const cam = g.cam.cam, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
          cam.position.set(c.x - fx * 5 + fz * 2.5, c.y + 3.0, c.z - fz * 5 - fx * 2.5);
          cam.lookAt(c.x, c.y + 0.9, c.z); cam.fov = 50; cam.updateProjectionMatrix();
          g.hideHud = true; document.getElementById('hud').style.display = 'none';
        }, i);
        await frames(15);
        await shot('bilsno_explore' + i);
      }
    },
  };
};
