// Car-area scenarios (owned by the cars area). Run through the slot wrapper with your own port:
//   PORT=8803 ../browserslot node tools/shot.mjs physics trailer carflee carcost pullover seating
// physics / trailer simulate a car off-screen (far outside the town, on asphalt) with the real
// modules, step by step, so the numbers don't depend on frame timing; the others play in town.
export default ({ page, ev, shot, frames, sleep, hold, tap, fps, OUT, errors = [] }) => {
  // A stand-alone car far from town (no solids out there) driven by fixed controls.
  const SIM = `
    const { Car, PLAYER } = await import('./src/actors/car.js');
    const { fx } = await import('./src/game/fx.js');
    const surf = fx.surfaceAt;
    fx.surfaceAt = (x, z) => (Math.abs(x) > 1500 ? 'asphalt' : surf ? surf(x, z) : 'asphalt');
    const stub = { cars: [], onCarImpact() {}, onCarLanded() {}, breakProp() {}, onCarDestroyed() {}, onHonk() {} };
    const mk = (type, opts = {}) => { const c = new Car(type, opts); c.place(2000, opts.z0 ?? 0, Math.PI / 2); c.driver = {}; c.ctrl.park = false; stub.playerCar = c; return c; };
    const run = (c, sec, ctl, each) => { const dt = 1 / 60; for (let i = 0; i < sec * 60; i++) { Object.assign(c.ctrl, typeof ctl === 'function' ? ctl(i * dt) : ctl); c.step(dt, stub); each?.(i * dt); } };
    const kmh = (c) => c.forwardSpeed * 3.6;
  `;
  // Draw-call instrumentation (round 4): counts renderBufferDirect calls per pass (the AO pre-pass,
  // the shadow cascades rendered inside it, the main pass, post) and per category (car = anything
  // under a car root, the instanced LOD batches, the wheel pools, plates; other = the rest).
  const instrument = () => ev(async () => {
    if (window.__dc) return;
    const { renderer, scene } = await import('./src/gfx.js');
    const R = renderer, D = (window.__dc = { on: false, phase: 0, inScene: false, cam: null, n: {}, parts: {}, frames: 0 });
    const isCar = (o) => { if (o.name && (o.name.startsWith('wheels:') || o.name.startsWith('carlod:') || o.name.startsWith('plates:'))) return true; for (let p = o; p; p = p.parent) if (p.userData?.isCar) return true; return false; };
    const rbd = R.renderBufferDirect.bind(R);
    R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
      // count real draws only (an instanced mesh with count 0 draws nothing)
      if (D.on && !(object.isInstancedMesh && object.count === 0)) {
        const pass = !D.inScene ? 'post' : camera !== D.cam ? 'shadow' : D.phase === 1 && D.ao ? 'ao' : 'main';
        const car = isCar(object);
        const k = pass + ':' + (car ? 'car' : 'other');
        D.n[k] = (D.n[k] || 0) + 1;
        // main-pass car calls by part (car:body, car:plate, carlod:..., wheels:..., bust = anything else in a car)
        if (car && pass === 'main') { const part = object.name?.startsWith('car:') ? object.name : object.name?.startsWith('carlod:cap') ? 'lodcap' : object.name?.startsWith('carlod') ? 'lodbatch' : object.name?.startsWith('wheels') ? 'wheels' : 'seated'; D.parts[part] = (D.parts[part] || 0) + 1; }
      }
      return rbd(camera, sc, geometry, material, object, group);
    };
    const rr = R.render.bind(R);
    R.render = function (s, c) { const top = s === scene; if (top) { D.phase++; D.cam = c; D.inScene = true; } try { return rr(s, c); } finally { if (top) D.inScene = false; } };
    const reset = R.info.reset.bind(R.info);
    R.info.reset = function () { if (D.on) D.frames++; D.ao = D.phase >= 2; D.phase = 0; return reset(); };
    // tag car roots (the Car constructor sets userData.isCar from round 4 on; older code doesn't)
    for (const c of __game?.cars || []) c.root.userData.isCar = true;
  });
  const passCalls = async (n = 40) => {
    await ev(() => { for (const c of __game?.cars || []) c.root.userData.isCar = true; const D = window.__dc; D.n = {}; D.parts = {}; D.frames = 0; D.on = true; });
    await frames(n);
    return ev(() => { const D = window.__dc; D.on = false; const f = Math.max(1, D.frames - 1), o = {}; for (const [k, v] of Object.entries(D.n)) o[k] = +(v / f).toFixed(1); const car = ['ao', 'shadow', 'main'].map((p) => o[p + ':car'] || 0); o.carTotal = +car.reduce((a, b) => a + b, 0).toFixed(1); o.allTotal = +Object.values(o).reduce((a, b) => a + b, 0).toFixed(1) - o.carTotal; o.allTotal = +(o.allTotal + o.carTotal).toFixed(1); o.mainCarParts = Object.fromEntries(Object.entries(D.parts).map(([k, v]) => [k, +(v / f).toFixed(1)])); return o; });
  };
  // Pure car CPU: car.sync / car.step over every car 120 times in one go (performance.now() is
  // coarse, so time the whole batch), plus the game's own stepWorld / syncAll per frame.
  const carCpu = () => ev(async () => {
    const g = __game, N = 120, cars = g.cars.filter((c) => c.root.visible);
    let t = performance.now();
    for (let k = 0; k < N; k++) for (const c of cars) c.sync(1 / 60);
    const sync = (performance.now() - t) / N;
    // step a copy of the state? step only cars without AI (parked, the bulk) - moving cars would coast
    const still = g.cars.filter((c) => !c.ai && !c.driver);
    t = performance.now();
    for (let k = 0; k < N; k++) for (const c of still) c.step(1 / 60, g);
    const stepParked = (performance.now() - t) / N;
    let pairs = performance.now();
    const { collideCars } = await import('./src/actors/car.js');
    const all = g.cars;
    for (let k = 0; k < N; k++) for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) collideCars(all[i], all[j], g);
    pairs = (performance.now() - pairs) / N;
    const asleep = g.cars.filter((c) => c.asleep).length;
    const cs = (await import('./src/actors/car.js')).carStats?.(200);
    return { inst: cs && `${cs.instanced} in ${cs.batches} batches, rewrite ${cs.writeMs} ms`, cars: g.cars.length, synced: cars.length, syncMs: +sync.toFixed(3), parked: still.length, stepParkedMs: +stepParked.toFixed(3), collidePairsMs: +pairs.toFixed(3), asleep, lod: g.cars.filter((c) => c.lod).length };
  });
  const loopCpu = (n = 180) => ev((n) => new Promise((res) => {
    const g = __game, sw = g.stepWorld, sa = g.syncAll;
    let a = 0, b = 0, f = 0;
    g.stepWorld = function (h) { const t = performance.now(); sw.call(this, h); a += performance.now() - t; };
    g.syncAll = function (dt, ti) { const t = performance.now(); sa.call(this, dt, ti); b += performance.now() - t; };
    const f0 = window.__frame;
    const tick = () => { if (window.__frame - f0 >= n) { g.stepWorld = sw; g.syncAll = sa; const k = window.__frame - f0; res({ stepWorldMs: +(a / k).toFixed(3), syncAllMs: +(b / k).toFixed(3) }); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
  const memStats = () => ev(async () => { const { renderer } = await import('./src/gfx.js'); const i = renderer.info; return { geos: i.memory.geometries, tex: i.memory.textures, programs: i.programs?.length, cars: __game.cars.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null }; });
  const fail = (msg) => { console.log('[t] FAIL', msg); errors.push(msg); };
  return {
    // Phase 4 round 2: every wheel style's tyre must face outwards (three's LatheGeometry faces out only
    // for an ascending profile; the tyre used to be built inside out). For each rubber triangle of the
    // tread and the outer sidewalls (centroid radius > 0.85 of the tyre's), the winding normal must point
    // away from the wheel's centre; and the rim's outer face (everything else beyond x 0.2: the lathed
    // rings, spoke windows, nuts) must face the outer side (+x) by far more area than it faces back.
    async wheelfaces() {
      const r = await ev(async () => {
        const { wheelGeometry } = await import('./src/actors/carmodels.js');
        const out = {};
        for (const st of ['saab3', 'alloy5', 'alloy7', 'sport', 'steel', 'van', 'truck', 'lod']) {
          const geo = wheelGeometry(st), pos = geo.attributes.position, idx = geo.index, surfs = geo.userData.surfaces;
          let ok = 0, bad = 0, rimPos = 0, rimNeg = 0;
          const P = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
          for (const gr of geo.groups) {
            const surf = surfs[gr.materialIndex];
            for (let t = gr.start; t < gr.start + gr.count; t += 3) {
              const a = P(idx ? idx.getX(t) : t), b = P(idx ? idx.getX(t + 1) : t + 1), c = P(idx ? idx.getX(t + 2) : t + 2);
              const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
              const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
              const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
              const rr = Math.hypot(m[1], m[2]);
              if (Math.hypot(...n) < 1e-9) continue;
              if (surf === 'rubber') {
                if (rr < 0.85) continue;
                if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0) ok++; else bad++;
              } else if (m[0] > 0.2) {
                // (n is the un-normalised cross product: its x is twice the area projected on the wheel's plane)
                if (n[0] > 0) rimPos += n[0]; else rimNeg -= n[0];
              }
            }
          }
          const k = rimPos / Math.max(1e-9, rimNeg);
          // (the far 'lod' wheel's rim is two closed discs: as much area faces back as out)
          out[st] = { tyre: bad ? bad + '/' + (ok + bad) + ' inward' : 'out (' + ok + ')', rim: st === 'lod' ? 'ok (closed discs)' : (k > 2 ? 'ok' : 'backwards') + ' (+x/-x area ' + (k > 1e3 ? 'all +x' : k.toFixed(1)) + ')' };
        }
        return out;
      });
      console.log('[t] wheelfaces', JSON.stringify(r));
      for (const [st, o] of Object.entries(r)) if (!o.tyre.startsWith('out') || !o.rim.startsWith('ok')) fail('wheelfaces ' + st + ' ' + JSON.stringify(o));
    },
    // Phase 4 round 2 (the code review): a parked car towing a trailer must not fall asleep (its trailer
    // collides with other cars only inside the car's step). Patrick's kombi + trailer on an open street,
    // left 2 s to settle, then the Saab driven into the trailer from 6 m behind with W held for 1.8 s: it
    // must stop at contact (centre to centre ~3.6 m), not inside the trailer. Then a kick on a sleeping
    // parked car's tyre: it must wake and rock on its springs.
    async trailersleep() {
      const setup = await ev(async () => {
        const g = __game, L = await import('./src/world/layout.js');
        if (g.playerCar) g.exitCar(true);
        const p = g.named.patrickCar, s = g.named.saab;
        if (!p || !p.trailer) return { err: 'no patrickCar with a trailer' };
        const x = L.rc(4) + L.LANE, z = L.rc(3) + 40;
        for (const o of [...g.cars]) if (o !== p && o !== s && Math.hypot(o.x - x, o.z - z) < 70) g.removeCar(o);
        p.place(x, z, 0);
        s.place(x, p.trailer.z - 3.6 - 6, 0);
        g.player.teleport(x + 4, z - 14, 0);
        g.cam.snapNext = true;
        window.__ts = { x, z };
        return { x, z };
      });
      if (setup.err) { fail('trailersleep: ' + setup.err); return; }
      await frames(120);
      const before = await ev(() => { const p = __game.named.patrickCar; return { asleep: p.asleep, trailerZ: +p.trailer.z.toFixed(2) }; });
      await ev(() => { const g = __game, s = g.named.saab; g.enterCar(s); s.place(s.x, s.z, 0); g.cam.snapNext = true; });
      await frames(10);
      await hold(['KeyW'], 1800);
      await frames(60);
      const r = await ev(() => { const g = __game, s = g.named.saab, t = g.named.patrickCar.trailer; return { saabZ: +s.z.toFixed(2), trailerZ: +t.z.toFixed(2), gap: +(t.z - s.z).toFixed(2), saabLen: s.spec.len, trailerLen: t.len }; });
      console.log('[t] trailersleep', JSON.stringify({ patrickAsleepAfter2s: before.asleep, ...r }));
      await shot('cars_trailersleep');
      if (before.asleep) fail('trailersleep: Patrick\'s car (with its trailer) fell asleep');
      if (r.gap < 3.3) fail('trailersleep: the Saab ended ' + r.gap + ' m from the trailer centre (contact ~3.6)');
      // the kick: a sleeping parked car (not the player's), Ove beside it
      const k = await ev(async () => {
        const g = __game;
        if (g.playerCar) g.exitCar(true);
        const c = g.cars.find((c) => c.asleep && !c.trailer && !c.name && c.kind !== 'bus' && c.kind !== 'garbage');
        if (!c) return { err: 'no sleeping car' };
        const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);   // the car's left (+X local): kick towards its side
        g.player.teleport(c.x + fx * 1.6, c.z + fz * 1.6, Math.atan2(-fx, -fz));
        const was = c.asleep;
        g.kickTyre(c, -fx, -fz);
        window.__kc = { c, max: 0 };
        return { kind: c.kind, wasAsleep: was };
      });
      if (k.err) { fail('kick: ' + k.err); return; }
      for (let i = 0; i < 30; i++) { await frames(1); await ev(() => { const o = window.__kc; o.max = Math.max(o.max, Math.abs(o.c.roll)); }); }
      const kr = await ev(() => { const o = window.__kc; return { maxRoll: +o.max.toFixed(4), asleepNow: o.c.asleep }; });
      console.log('[t] kick', JSON.stringify({ ...k, ...kr }));
      if (kr.maxRoll < 0.01) fail('kick: a kicked sleeping car did not rock (max roll ' + kr.maxRoll + ')');
    },
    // Phase 4 round 2: GPU time of a frame full of dirty cars (the road-grime shader): the big car park
    // from a fixed spot and Solrosvägen-like street views, median / min of gfxStats.gpuMs over 120 frames.
    // Run with QUERY='&gputime' (and EXCLUSIVE=1 on the slot wrapper).
    async grimegpu() {
      await frames(60);
      const sample = () => ev(() => new Promise((res) => { const g = (window.__gfx || {}); const a = []; const f0 = window.__frame; const tick = async () => { const { gfxStats } = await import('./src/gfx.js'); a.push(gfxStats.gpuMs); if (window.__frame - f0 >= 120) { a.sort((x, y) => x - y); res({ median: +a[a.length >> 1].toFixed(2), min: +a[0].toFixed(2), n: a.length }); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
      await ev(() => { const g = __game, p = window.__lm('parking'); let s = null; for (let k = 0; k < 16 && !s; k++) { const a = k * 0.39, x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12; if (g.spotFree(x, z)) s = { x, z }; } s ||= g.freeSpot(p.x, p.z, 4, 12); g.player.teleport(s.x, s.z, Math.atan2(p.x - s.x, p.z - s.z)); g.cam.yaw = g.player.yaw; g.cam.snapNext = true; });
      await frames(60);
      const lot = await sample();
      await shot('cars_grimegpu_lot');
      await ev(() => { const g = __game, c = g.named.saab; g.enterCar(c); c.place(-30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
      await frames(60);
      const street = await sample();
      console.log('[t] grimegpu', JSON.stringify({ lot, street }));
    },
    // Round 4 (perf): draw calls per pass for cars vs the rest, car CPU, renderFrame ms, fps, at the
    // start view, on Solrosvägen in the Saab (chase cam), at the big car park and from above.
    async carperf() {
      await instrument();
      await frames(60);
      const pose = async (name) => {
        await frames(30);
        const dc = await passCalls();
        const cpu = await carCpu();
        const loop = await loopCpu();
        const s = await ev(() => { const s = window.__stats(); return { calls: s.calls, aoCalls: s.aoCalls, tris: +(s.tris / 1e6).toFixed(2), renderMs: s.cpuMs }; });
        console.log('[t] carperf', name, JSON.stringify({ ...s, ...dc }), JSON.stringify({ ...cpu, ...loop }), 'fps', await fps());
      };
      await pose('start');
      await shot('carperf_start');
      await ev(() => { const g = __game, c = g.named.saab; g.enterCar(c); c.place(-30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; });
      await frames(20);
      await pose('street');
      await shot('carperf_street');
      // (a fixed spot 12 m off the car park's centre, the first free one round it)
      await ev(() => { const g = __game, p = window.__lm('parking'); g.exitCar(true); let s = null; for (let k = 0; k < 16 && !s; k++) { const a = k * 0.39, x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12; if (g.spotFree(x, z)) s = { x, z }; } s ||= g.freeSpot(p.x, p.z, 4, 12); g.player.teleport(s.x, s.z, Math.atan2(p.x - s.x, p.z - s.z)); g.cam.yaw = g.player.yaw; g.cam.snapNext = true; });
      await frames(20);
      await pose('lot');
      await shot('carperf_lot');
      await ev(() => { __game.aerial = true; });
      await frames(10);
      await pose('aerial');
      await shot('carperf_aerial');
      await ev(() => { __game.aerial = false; });
    },
    // Round 4: the instanced far bodies against the per-car ones, same frame: a long lens on the big car
    // park and down Solrosvägen from ~60-150 m, and from above (cars_lodab_<view>_inst / _single.png).
    async lodab() {
      await frames(60);
      const views = [['lot', 'parking', 70, 12, 22], ['street', null, 0, 0, 0], ['aerial', null, 0, 0, 0]];
      for (const [name, lmk, d, h, fov] of views) {
        await ev(([name, lmk, d, h, fov]) => {
          const g = __game, cam = g.cam.cam;
          g.cam.update = function () {};
          g.hideHud = true; document.getElementById('hud').style.display = 'none';
          if (name === 'aerial') { g.aerial = true; return; }
          g.aerial = false;
          if (lmk) { const p = window.__lm(lmk); cam.position.set(p.x - d * 0.7, h, p.z - d * 0.7); cam.lookAt(p.x, 0.8, p.z); cam.fov = fov; }
          else { cam.position.set(-150, 2.2, -37.25); cam.lookAt(0, 1.0, -37.25); cam.fov = 18; }
          cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        }, [name, lmk, d, h, fov]);
        await frames(30);
        for (const inst of [true, false]) {
          await ev(async (inst) => { const { setCarPerf } = await import('./src/actors/car.js'); setCarPerf({ instLod: inst }); }, inst);
          await frames(8);
          await shot(`cars_lodab_${name}_${inst ? 'inst' : 'single'}`);
        }
        await ev(async () => { const { setCarPerf } = await import('./src/actors/car.js'); setCarPerf({ instLod: true }); });
      }
    },
    // Round 4: exhaust at idle: Ove's Saab idling on Solrosvägen seen from the chase camera (no puffs
    // within 9 m behind the tailpipe), from the side at 5 m and from 12 m behind (puffs), and a car
    // idling ahead at a junction seen from the Saab's chase camera. Counts the puffs fx gets per view.
    async exhaust() {
      await ev(async () => {
        const g = __game, c = g.named.saab, { fx } = await import('./src/game/fx.js');
        g.enterCar(c); c.place(-30, -40 + 2.75, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
        for (const o of [...g.cars]) if (o !== c && o.traffic && Math.hypot(o.x + 10, o.z + 37) < 60) g.removeCar(o);
        const ex = fx.exhaust;
        window.__puffs = 0;
        fx.exhaust = function (...a) { window.__puffs++; return ex.apply(this, a); };
      });
      await frames(30);
      const count = async (name, setup) => {
        if (setup) await ev(setup);
        await ev(() => { window.__puffs = 0; });
        await sleep(3000);
        const n = await ev(() => window.__puffs);
        await shot('cars_exhaust_' + name);
        console.log('[t] exhaust', name, 'puffs in 3 s', n);
      };
      await count('chase');
      await count('side', () => { const g = __game, cam = g.cam.cam, c = g.playerCar; g.cam.update = function () {}; cam.position.set(c.x - 1.5, 1.2, c.z + 5); cam.lookAt(c.x - 1.8, 0.5, c.z); cam.fov = 50; cam.updateProjectionMatrix(); });
      await count('behind12', () => { const g = __game, cam = g.cam.cam, c = g.playerCar; cam.position.set(c.x - 12, 1.7, c.z + 1.2); cam.lookAt(c.x, 0.6, c.z); cam.fov = 45; cam.updateProjectionMatrix(); });
    },
    // Round 4: 60 cars spawned in view and removed (+ car.dispose() when it exists); renderer
    // geometries / textures / programs before and after (after a warm-up of every type). CARLEAK=bust
    // also seats a bust (main.js's addBust: people's buildBust) in each.
    async carleak() {
      const cycle = (k, bust) => ev(async ([k, bust]) => {
        const g = __game, { Car } = await import('./src/actors/car.js'), { MODEL_KEYS } = await import('./src/actors/carmodels.js'), { randomPed } = await import('./src/actors/models.js');
        const p = g.player, kind = MODEL_KEYS[k % MODEL_KEYS.length];
        const c = new Car(kind, { snow: k % 3 === 0 });
        c.place(p.x + Math.sin(p.yaw) * 9, p.z + Math.cos(p.yaw) * 9, p.yaw + 1.2);
        if (bust) g.addBust(randomPed(Math.random), c);
        c.hazard = k % 2 === 0; c.braking = 1;
        g.addCar(c);
        window.__lc = c;
      }, [k, bust]);
      const drop = () => ev(() => { const c = window.__lc; __game.removeCar(c); c.dispose?.(); });
      const bust = process.env.CARLEAK === 'bust';
      for (let k = 0; k < 24; k++) { await cycle(k, bust); await frames(3); await drop(); await frames(1); }
      await frames(10);
      const a = await memStats();
      for (let k = 0; k < 60; k++) { await cycle(k * 7 + 3, bust); await frames(3); await drop(); await frames(1); }
      await frames(10);
      const b = await memStats();
      console.log('[t] carleak', bust ? '(with busts)' : '', 'before', JSON.stringify(a), 'after 60', JSON.stringify(b), 'dispose', await ev(() => typeof window.__lc.dispose));
    },
    // Round 4: the first entry into Ove's Saab: frame times and the programs / geometries the renderer
    // creates in that moment (listed).
    async carentry() {
      // CE=near: walk up to the Saab first (teleport beside it, 90 frames); default: straight from the
      // start view (enterCar from wherever Ove stands, as a warp or a test would)
      // WARM=1: run car.js's warmCars first, as the loader would
      // AUTO=1: wait for the cars' own fallback warm-up (2 s after the first frame) instead
      if (process.env.AUTO) await ev(() => { const g = __game, L = g.loop; window.__wt = []; g.loop = function (t) { const s = performance.now(); L.call(this, t); window.__wt.push(+(performance.now() - s).toFixed(1)); }; });
      if (process.env.AUTO) { for (let k = 0; k < 40; k++) { const w = await ev(async () => (await import('./src/actors/car.js')).carStats().warm); if (w) { const wt = await ev(() => { const a = window.__wt; delete __game.loop; return { n: a.length, max: Math.max(...a), over20: a.filter((x) => x > 20).length }; }); console.log('[t] carentry auto warm-up', JSON.stringify(w), 'frames meanwhile', JSON.stringify(wt)); break; } await sleep(250); } }
      if (process.env.WARM) console.log('[t] carentry warmCars', JSON.stringify(await ev(async () => { const { warmCars } = await import('./src/actors/car.js'); const { renderer, scene, camera } = await import('./src/gfx.js'); return warmCars(renderer, scene, camera); })));
      if (process.env.CE === 'near') await ev(() => { const g = __game, c = g.named.saab; const s = g.freeSpot(c.x + 2, c.z, 0, 1); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.yaw = g.player.yaw; g.cam.snapNext = true; });
      await frames(90);
      const snap = () => ev(async () => {
        const { renderer, scene } = await import('./src/gfx.js');
        const geos = new Map();
        scene.traverse((o) => { const gg = o.geometry; if (gg && gg._listeners?.dispose?.length) { let p = o, path = []; while (p && p !== scene) { path.push(p.name || p.type); p = p.parent; } geos.set(gg.uuid, path.reverse().slice(0, 4).join('/')); } });
        return { geos: [...geos.entries()], programs: (renderer.info.programs || []).map((p) => p.id + ':' + p.name + '|' + p.cacheKey.slice(0, 90)), n: renderer.info.memory.geometries };
      });
      const a = await snap();
      await ev(() => { const g = __game, L = g.loop; window.__lt = []; g.loop = function (t) { const s = performance.now(); L.call(this, t); window.__lt.push(+(performance.now() - s).toFixed(1)); }; });
      if (process.env.CE === 'near') await tap('KeyE');
      else await ev(() => { const g = __game; g.enterCar(g.named.saab); g.cam.snapNext = true; });
      await frames(40);
      const b = await snap();
      const lt = await ev(() => window.__lt.slice(0, 12));
      const A = new Set(a.geos.map((x) => x[0])), newG = b.geos.filter((x) => !A.has(x[0]));
      const P = new Set(a.programs), newP = b.programs.filter((x) => !P.has(x));
      const byPath = {}; for (const [, p] of newG) byPath[p] = (byPath[p] || 0) + 1;
      // who uses the new programs
      const users = await ev(async (ids) => {
        const { renderer, scene } = await import('./src/gfx.js'), out = {};
        scene.traverse((o) => { for (const m of [].concat(o.material || [])) { const pr = renderer.properties.get(m)?.currentProgram; if (pr && ids.includes(pr.id)) (out[pr.id] ||= new Set()).add((o.name || o.type) + '<' + (o.parent?.name || o.parent?.type || '') + ':' + m.type); } });
        return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].slice(0, 4)]));
      }, newP.map((x) => +x.split(':')[0]));
      console.log('[t] carentry in car', await ev(() => !!__game.playerCar), 'frame ms', lt.join(' '), '| geometries', a.n, '->', b.n, '| programs', a.programs.length, '->', b.programs.length);
      console.log('[t] carentry new programs', JSON.stringify(newP), 'used by', JSON.stringify(users));
      console.log('[t] carentry new geometries by object', JSON.stringify(Object.entries(byPath).sort((x, y) => y[1] - x[1]).slice(0, 25)));
    },
    // 0-100 km/h, top speed, braking 100-0, a full-lock turn and a handbrake turn at 60 km/h.
    async physics() {
      const r = await ev(new Function(`return (async () => { ${SIM}
        const c = mk('saab900');
        let t100 = null, t = 0; const per = [];
        run(c, 40, { throttle: 1, brake: 0, steer: 0 }, (tt) => { t = tt; if (t100 === null && kmh(c) >= 100) t100 = tt; if (Math.abs(tt - Math.round(tt)) < 1 / 120 && tt < 8.5) per.push(kmh(c).toFixed(0)); });
        const top = kmh(c);
        // brake from 100
        const b = mk('saab900'); b.vx = 27.78; b.vz = 0; const x0 = b.x;
        let brake100 = null;
        run(b, 8, { throttle: 0, brake: 1, steer: 0 }, () => { if (brake100 === null && b.forwardSpeed < 0.3) brake100 = b.x - x0; });
        // full lock at 60 km/h (keyboard steering), then the handbrake
        const f = mk('saab900'); f.vx = 16.67;
        let skid = 0, w = 0; run(f, 1.2, { throttle: 0.4, brake: 0, steer: 1 }, () => { skid = Math.max(skid, f.skidAmt); w = Math.max(w, Math.abs(f.w)); });
        const h = mk('saab900'); h.vx = 16.67;
        let hskid = 0; run(h, 1.2, { throttle: 0, brake: 0, steer: 1, handbrake: true }, () => { hskid = Math.max(hskid, h.skidAmt); });
        fx.surfaceAt = surf;
        return { t100: t100 && t100.toFixed(1), perSecond: per.join('/'), top: top.toFixed(0), brake100: brake100.toFixed(0), fullLock60: { skid: skid.toFixed(2), yawRate: w.toFixed(2), kmhAfter: kmh(f).toFixed(0) }, handbrake60: hskid.toFixed(2) };
      })()`));
      console.log('[t] physics', JSON.stringify(r));
    },
    // Steering at speed (feature roligare_bilkorning): per type and speed, a held key (the yaw rate
    // and sideways g it settles at, how long it takes to get there, the slip angle) and a 0.25 s tap
    // (the heading it changes, how long the car keeps turning after the key is let go).
    async handling() {
      const r = await ev(new Function(`return (async () => { ${SIM}
        const slipOf = (c) => { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); return Math.atan2(c.vx * -fz + c.vz * fx, c.vx * fx + c.vz * fz); };
        const out = {};
        for (const type of (window.__htypes || ['saab900', 'golf', 'audi', 'volvo240', 'bmw'])) {
          const row = {};
          for (const kmh0 of [60, 100, 125]) {
            const v0 = kmh0 / 3.6;
            const keep = (c) => ({ throttle: c.forwardSpeed < v0 ? 0.7 : 0, brake: 0 });
            const h = mk(type); h.vx = v0;
            let t63 = null, ws = [], slip = 0;
            run(h, 2.5, (t) => ({ ...keep(h), steer: 1 }), (t) => { ws.push(Math.abs(h.w)); slip = Math.max(slip, Math.abs(slipOf(h))); });
            const wSt = ws.slice(-30).reduce((a, b) => a + b, 0) / 30;
            t63 = ws.findIndex((w) => w > wSt * 0.63) / 60;
            const k = mk(type); k.vx = v0; const y0 = k.yaw;
            let settle = null;
            run(k, 2, (t) => ({ ...keep(k), steer: t < 0.25 ? 1 : 0 }), (t) => { if (t > 0.25 && settle === null && Math.abs(k.w) < 0.02) settle = t - 0.25; });
            row[kmh0] = { yaw: +wSt.toFixed(3), g: +(wSt * v0 / 9.81).toFixed(2), t63: +t63.toFixed(2), slipDeg: +(slip * 57.3).toFixed(1), tapDeg: +(-(k.yaw - y0) * 57.3).toFixed(1), settle: settle === null ? '>1.75' : +settle.toFixed(2) };
          }
          out[type] = row;
        }
        fx.surfaceAt = surf;
        return out;
      })()`));
      for (const [k, v] of Object.entries(r)) console.log('[t] handling', k, JSON.stringify(v));
    },
    // Slides (feature roligare_bilkorning), simulated off-screen like physics: per type, a handbrake
    // flick at 50 km/h and then full throttle, no steering (how long the slide holds after the
    // handbrake is let go); the same caught by a counter-steering bot holding ~30° (keyboard: full
    // lock or nothing); a handbrake flick at 100 km/h let go of; a donut from a standstill.
    async drift() {
      if (process.env.DSNOW) await ev(() => { window.__dsnow = true; });
      const r = await ev(new Function(`return (async () => { ${SIM}
        const slipOf = (c) => { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); return Math.atan2(c.vx * -fz + c.vz * fx, c.vx * fx + c.vz * fz); };
        const snow = !!window.__dsnow;
        if (snow) fx.surfaceAt = (x, z) => (Math.abs(x) > 1500 ? 'snow' : surf ? surf(x, z) : 'snow');
        const deg = (a) => +(a * 57.3).toFixed(0);
        const out = {};
        for (const type of (window.__dtypes || ['volvo240', 'bmw', 'saab900', 'golf', 'audi'])) {
          const row = {};
          // a flick, then full throttle and hands off
          for (const thr of [1, 0]) {
            const c = mk(type); c.vx = 50 / 3.6; const y0 = c.yaw;
            let atRel = 0, held = 0, maxS = 0;
            run(c, 4.4, (t) => (t < 0.4 ? { throttle: 0, brake: 0, steer: 1, handbrake: true } : { throttle: thr, brake: 0, steer: 0, handbrake: false }), (t) => {
              const s = Math.abs(slipOf(c));
              if (t < 0.4) atRel = s; else { if (s > 10 / 57.3 && c.speed > 2) held += 1 / 60; maxS = Math.max(maxS, s); }
            });
            row[thr ? 'flickThrottle' : 'flickCoast'] = { slipAtRelease: deg(atRel), heldSec: +held.toFixed(2), maxSlip: deg(maxS), turned: deg(-(c.yaw - y0)), kmh: +(c.speed * 3.6).toFixed(0) };
          }
          // the counter-steering bot (keys: full lock or nothing), full throttle (and coasting)
          for (const thr of [1, 0.4]) {
            const c = mk(type); c.vx = 50 / 3.6; const y0 = c.yaw;
            let held = 0, sum = 0, n = 0, path0 = Math.atan2(c.vx, c.vz);
            run(c, 4.4, (t) => {
              if (t < 0.4) return { throttle: 0, brake: 0, steer: 1, handbrake: true };
              const sl = slipOf(c), sg = Math.sign(sl) || -1, err = 0.52 - Math.abs(sl);
              const into = err > 0.08 ? 1 : err < -0.08 ? -1 : 0;
              return { throttle: thr, brake: 0, steer: -into * sg, handbrake: false };
            }, (t) => { if (t >= 0.4) { const s = Math.abs(slipOf(c)); if (s > 15 / 57.3 && c.speed > 2) held += 1 / 60; sum += s; n++; } });
            row[thr === 1 ? 'botThrottle' : 'botPart'] = { heldSec: +held.toFixed(2), meanSlip: deg(sum / n), turned: deg(-(c.yaw - y0)), pathTurned: deg(-(Math.atan2(c.vx, c.vz) - path0)), kmh: +(c.speed * 3.6).toFixed(0), drift: +(c.drift ?? 0).toFixed(2) };
          }
          // what a player does at a junction: D held, a 0.4 s tap of Space, W + D for 1.2 s, then only W
          {
            const c = mk(type); c.vx = 50 / 3.6; const y0 = c.yaw, p0 = Math.atan2(c.vx, c.vz);
            let maxS = 0, atEnd = 0;
            run(c, 3.6, (t) => (t < 0.4 ? { throttle: 0, brake: 0, steer: 1, handbrake: true } : t < 1.6 ? { throttle: 1, brake: 0, steer: 1, handbrake: false } : { throttle: 1, brake: 0, steer: 0, handbrake: false }), (t) => { maxS = Math.max(maxS, Math.abs(slipOf(c))); if (Math.abs(t - 1.6) < 0.01) atEnd = slipOf(c); });
            row.junction = { maxSlip: deg(maxS), slipWhenDLetGo: deg(atEnd), endSlip: deg(slipOf(c)), turned: deg(-(c.yaw - y0)), pathTurned: deg(-(Math.atan2(c.vx, c.vz) - p0)), kmh: +(c.speed * 3.6).toFixed(0) };
          }
          // the same, caught: after the 1.2 s of W + D, counter-steer (full lock) until it is straight
          {
            const c = mk(type); c.vx = 50 / 3.6; const y0 = c.yaw;
            let tStraight = null;
            run(c, 3.6, (t) => {
              if (t < 0.4) return { throttle: 0, brake: 0, steer: 1, handbrake: true };
              if (t < 1.6) return { throttle: 1, brake: 0, steer: 1, handbrake: false };
              const sl = slipOf(c);
              if (tStraight === null && Math.abs(sl) < 5 / 57.3) tStraight = t - 1.6;
              return { throttle: 1, brake: 0, steer: tStraight === null ? Math.sign(sl) : 0, handbrake: false };
            });
            row.caught = { secToStraight: tStraight === null ? 'never' : +tStraight.toFixed(2), turned: deg(-(c.yaw - y0)), endSlip: deg(slipOf(c)), kmh: +(c.speed * 3.6).toFixed(0), drift: +(c.drift ?? 0).toFixed(2) };
          }
          // 100 km/h: a short flick, then nothing
          {
            const c = mk(type); c.vx = 100 / 3.6; const y0 = c.yaw;
            let maxS = 0;
            run(c, 4, (t) => (t < 0.25 ? { throttle: 0, brake: 0, steer: 1, handbrake: true } : { throttle: 0, brake: 0, steer: 0, handbrake: false }), () => { maxS = Math.max(maxS, Math.abs(slipOf(c))); });
            row.flick100 = { maxSlip: deg(maxS), turned: deg(-(c.yaw - y0)), kmh: +(c.speed * 3.6).toFixed(0) };
          }
          // a donut from a standstill (Space + W + D), 4 s, then the handbrake let go of for 1.5 s
          {
            const c = mk(type); const x0 = c.x, z0 = c.z, y0 = c.yaw;
            let far = 0;
            run(c, 4, { throttle: 1, brake: 0, steer: 1, handbrake: true }, () => { far = Math.max(far, Math.hypot(c.x - x0, c.z - z0)); });
            const spun = -(c.yaw - y0);
            run(c, 1.5, { throttle: 1, brake: 0, steer: 1, handbrake: false });
            row.donut = { turns: +(spun / 6.283).toFixed(2), maxFromStart: +far.toFixed(1), after: { kmh: +(c.speed * 3.6).toFixed(0), slip: deg(slipOf(c)) } };
          }
          out[type] = row;
        }
        fx.surfaceAt = surf;
        return out;
      })()`));
      for (const [k, v] of Object.entries(r)) console.log('[t] drift', k, JSON.stringify(v));
    },
    // In town with real keys (feature roligare_bilkorning): a Volvo 240 (TYPE=saab900 etc. for
    // another) eastbound on Solrosvägen at ~45 km/h, a Space + A flick into the junction at x = 40
    // (the wide left turn), W with A / D holding the slide at 30-45° until the car travels down the
    // cross street, D to catch it (counter-steer) and away; then a donut
    // (Space + W + D) in the junction. Checks: the slide holds >= 0.6 s after Space is let go, the
    // car leaves the junction down the cross street (-z), the donut turns, Ove comments on both.
    async driftshot() {
      const type = process.env.TYPE || 'volvo240';
      const fail = (m) => { console.log('[t] FAIL', m); errors.push('driftshot: ' + m); };
      await ev((type) => {
        const g = __game;
        for (const o of [...g.cars]) if (!o.name && Math.hypot(o.x - 40, o.z + 40) < 90) g.removeCar(o);
        return import('./src/actors/car.js').then(({ Car }) => {
          const c = g.addCar(new Car(type, { color: 0x7a1e1e }));
          c.place(-25, -40 + 2.75, Math.PI / 2);
          g.enterCar(c);
          g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
          window.__dlog = [];
        });
      }, type);
      await frames(20);
      const st = () => ev(() => { const c = __game.playerCar; return { x: +c.x.toFixed(1), z: +c.z.toFixed(1), kmh: +(c.speed * 3.6).toFixed(0), yaw: +c.yaw.toFixed(2), slip: +((c.slip || 0) * 57.3).toFixed(0), drift: +(c.drift || 0).toFixed(2), skid: +c.skidAmt.toFixed(2) }; });
      // a sampler running every frame (the slide's timeline), and what Ove says
      await ev(() => { const g = __game, S = g.say; window.__said = []; g.say = function (t, text, secs) { if (t === g.player) window.__said.push(text); return S.call(this, t, text, secs); }; });
      await ev(() => { const g = __game, L = g.loop; g.loop = function (t) { L.call(this, t); const c = g.playerCar; if (c) window.__dlog.push([performance.now(), c.drift || 0, c.slip || 0, c.x, c.z, c.yaw]); }; });
      // ~45 km/h towards the junction at x = 40, then (a left turn, the wide one: up the cross street
      // towards -z) Space + A at x ~ 24
      let w = false;
      for (let k = 0; k < 600; k++) {
        const s = await st();
        if (s.x > 23) break;
        const want = s.kmh < 45;
        if (want !== w) { if (want) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW'); w = want; }
        await frames(1);
      }
      if (w) await page.keyboard.up('KeyW');
      console.log('[t] drift entry', JSON.stringify(await st()));
      await page.keyboard.down('KeyA'); await page.keyboard.down('Space');
      await sleep(330);
      await page.keyboard.up('Space');
      const tRel = await ev(() => performance.now());
      console.log('[t] drift Space let go', JSON.stringify(await st()));
      // W (in a front-driven car: off the throttle, which pulls it straight - lifting holds the slide),
      // holding the slide at ~30-45° (A into it, D to catch it) until the car travels down the cross
      // street (-z: the path's yaw = yaw - slip ~ pi), then W and D until it is straight
      const fwd = await ev(() => __game.playerCar.spec.drive === 'fwd');
      if (!fwd) await page.keyboard.down('KeyW');
      let shotTaken = false, keys = '';
      const setKeys = async (k) => { if (k === keys) return; if (keys) await page.keyboard.up(keys); if (k) await page.keyboard.down(k); keys = k; };
      for (let k = 0; k < 300; k++) {
        const s = await st(), sl = s.slip / 57.3;
        if (!shotTaken && Math.abs(s.slip) > 25) { await page.screenshot({ path: OUT + '/driftshot_1_sideways.png' }); shotTaken = true; console.log('[t] drift sideways', JSON.stringify(s)); }
        if (s.yaw - sl > Math.PI - 0.3) break;
        await setKeys(sl < 0.5 ? 'KeyA' : sl > 0.8 ? 'KeyD' : '');
        await frames(1);
      }
      if (fwd) await page.keyboard.down('KeyW');
      await setKeys('KeyD');
      console.log('[t] drift counter-steer from', JSON.stringify(await st()));
      for (let k = 0; k < 120; k++) { const s = await st(); if (Math.abs(s.slip) < 6) break; await frames(1); }
      await setKeys('');
      console.log('[t] drift caught', JSON.stringify(await st()));
      await shot('driftshot_2_caught');
      // away down the cross street, keeping the heading (-z: yaw = pi)
      const t1 = Date.now() + 1300;
      while (Date.now() < t1) { const s = await st(); await setKeys(s.yaw < Math.PI - 0.06 ? 'KeyA' : s.yaw > Math.PI + 0.06 ? 'KeyD' : ''); await frames(1); }
      await setKeys('');
      await page.keyboard.up('KeyW');
      const end = await st();
      console.log('[t] drift away', JSON.stringify(end));
      await shot('driftshot_3_away');
      const tl = await ev((tRel) => { const a = window.__dlog; let held = 0, maxSlip = 0; for (let i = 1; i < a.length; i++) if (a[i][0] > tRel) { if (a[i][1] > 0.5 && Math.abs(a[i][2]) > 0.26) held += (a[i][0] - a[i - 1][0]) / 1000; maxSlip = Math.max(maxSlip, Math.abs(a[i][2])); } return { heldAfterSpace: +held.toFixed(2), maxSlip: +(maxSlip * 57.3).toFixed(0) }; }, tRel);
      console.log('[t] drift timeline', JSON.stringify(tl));
      if (tl.heldAfterSpace < 0.6) fail('the slide held only ' + tl.heldAfterSpace + ' s after Space was let go');
      if (!(Math.abs(end.x - 40) < 7.5 && end.z < -50)) fail('did not leave the junction down the cross street: ' + JSON.stringify(end));
      const said = await ev(() => window.__said.splice(0));
      console.log('[t] Ove after the slide:', JSON.stringify(said));
      if (!said.length) fail('Ove said nothing after a ' + tl.heldAfterSpace + ' s slide');
      // a donut in the middle of the (emptied) junction
      await ev(() => { const g = __game, c = g.playerCar; for (const o of [...g.cars]) if (o !== c && !o.name && Math.hypot(o.x - 40, o.z + 40) < 30) g.removeCar(o); c.place(40, -40, 0); g.cam.yaw = 0; g.cam.snapNext = true; window.__dlog = []; g.slideSaidAt = -1e9; });
      await frames(20);
      const y0 = (await st()).yaw;
      await page.keyboard.down('Space'); await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
      await sleep(1800);
      await shot('driftshot_4_donut');
      await sleep(1200);
      for (const k of ['Space', 'KeyW', 'KeyD']) await page.keyboard.up(k);
      const turned = await ev(() => { const a = window.__dlog; let t = 0; for (let i = 1; i < a.length; i++) { let d = a[i][5] - a[i - 1][5]; d = Math.atan2(Math.sin(d), Math.cos(d)); t += d; } return t; });
      console.log('[t] donut turned', (-turned / 6.283).toFixed(2), 'turns in 3 s', JSON.stringify(await st()));
      if (Math.abs(turned) < 3) fail('the donut turned only ' + (turned * 57.3).toFixed(0) + '°');
      await frames(30);
      const said2 = await ev(() => window.__said.splice(0));
      console.log('[t] Ove after the donut:', JSON.stringify(said2));
      if (!said2.length) fail('Ove said nothing after the donut');
      await shot('driftshot_5_marks');
      await ev(() => { delete __game.loop; });
    },
    // Reversing with a släpkärra: speed cap, straight-line drift, a steering tap, the reversing light.
    async trailer() {
      const r = await ev(new Function(`return (async () => { ${SIM}
        const c = mk('volvo740', { trailer: true });
        let vmin = 0, flips = 0, last = null, rel = 0;
        run(c, 8, { throttle: 0, brake: 1, steer: 0 }, () => { vmin = Math.min(vmin, c.forwardSpeed); if (last !== null && c.reversing !== last) flips++; last = c.reversing; });
        rel = Math.abs(((c.yaw - c.trailer.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        // a 0.4 s steering tap while backing: time until the jackknife limit
        const d = mk('volvo740', { trailer: true, z0: 30 });
        run(d, 3, { throttle: 0, brake: 1, steer: 0 });
        let tj = null;
        run(d, 6, (t) => ({ throttle: 0, brake: 1, steer: t < 0.4 ? 1 : 0 }), (t) => { if (tj === null && d.trailer.jackknifed) tj = t; });
        // forward again: it straightens
        run(d, 6, { throttle: 0.5, brake: 0, steer: 0 });
        const relAfter = Math.abs(((d.yaw - d.trailer.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        fx.surfaceAt = surf;
        return { revMax: (-vmin).toFixed(2), reversingLightFlips: flips, straightDriftDeg: (rel * 57.3).toFixed(1) + ' after 8 s', tapToJackknife: tj === null ? 'none in 6 s' : tj.toFixed(1) + ' s', relAfterForwardDeg: (relAfter * 57.3).toFixed(1) };
      })()`));
      console.log('[t] trailer', JSON.stringify(r));
      // and a look at it in town
      await ev(() => { const g = __game, c = g.named.patrickCar; if (c) { g.enterCar(c); } });
      await frames(10);
      await hold(['KeyS'], 2500);
      await shot('cars_trailer_rev');
    },
    // Three fleeing cars, 30 s each from different spots: stuck spells (< 2 m in 4 s) and damage.
    async carflee() {
      for (let run = 0; run < 3; run++) {
        await ev(async (run) => {
          const g = __game, { Car } = await import('./src/actors/car.js'), { AIDriver } = await import('./src/actors/drivers.js');
          const L = await import('./src/world/layout.js');
          const n = [9, 27, 40][run], x = L.nodeX(n), z = L.nodeZ(n);
          g.player.teleport(x + 8, z + 8, 0);
          const c = new Car(['audi', 'bmw', 'golf'][run]);
          c.place(x + L.LANE, z + 14, 0);
          g.addBust({ ...(await import('./src/actors/models.js')).randomPed(Math.random) }, c);
          c.ai = new AIDriver(c, { mode: 'flee', cruise: 20, avoid: true, target: () => ({ x: g.player.x, z: g.player.z }) });
          g.addCar(c);
          window.__flee = c; window.__fleeLog = [];
        }, run);
        let stuck = 0, last = null;
        const hp0 = await ev(() => __flee.hp);
        for (let k = 0; k < 30; k++) {
          await sleep(1000);
          const p = await ev(() => ({ x: __flee.x, z: __flee.z, v: __flee.speed, hp: __flee.hp }));
          if (k % 4 === 0) { if (last && Math.hypot(p.x - last.x, p.z - last.z) < 2) { stuck++; console.log('[t] flee', run, 'stuck at', p.x.toFixed(0), p.z.toFixed(0)); } last = p; }
          if (k === 12 && run === 0) await shot('cars_flee');
        }
        const r = await ev(() => ({ x: __flee.x.toFixed(0), z: __flee.z.toFixed(0), v: __flee.speed.toFixed(1), hp: __flee.hp.toFixed(0) }));
        console.log('[t] flee run', run, 'stuck windows', stuck, 'hp', hp0, '->', r.hp, 'end', JSON.stringify(r));
        await ev(() => __game.removeCar(__flee));
      }
    },
    // A real pursuit with no teleports (round 3): a smitare from a street violation spot on its own flee
    // AI (the first run at the spot by the hospital where round 2's smitare wedged off-road for 15 s),
    // chased by a Saab on the chase AI; the player stands by the chaser (the camera and the AI's
    // 'nobody sees it' rule follow it). Logs stuck windows (< 2 m in 4 s) and seconds off the asphalt
    // for both cars and the gap; then the smitare pulls over (TAGEN) from wherever it is.
    // RP=n runs (default 3), RPT=seconds (30).
    async realpursuit() {
      const runs = +(process.env.RP || 3), secs = +(process.env.RPT || 30);
      for (let run = 0; run < runs; run++) {
        const info = await ev(async (run) => {
          const g = __game, { Car } = await import('./src/actors/car.js'), { AIDriver, laneAim } = await import('./src/actors/drivers.js');
          const L = await import('./src/world/layout.js'), { randomPed } = await import('./src/actors/models.js');
          if (g.playerCar) g.exitCar(true);
          const street = g.patrol.spots.filter((s) => s.onStreet && s.where !== 'ove');
          let s;
          if (run === 0) s = street.reduce((b, q) => (Math.hypot(q.x - 114, q.z + 210) < Math.hypot(b.x - 114, b.z + 210) ? q : b));
          else s = street[(run * 7919 + 13) % street.length];
          for (const o of [...g.cars]) if ((o.traffic || o.violation) && Math.hypot(o.x - s.x, o.z - s.z) < 25) g.removeCar(o);
          const sm = new Car(['golf', 'bmw', 'audi'][run % 3]);
          sm.place(s.x, s.z, s.yaw);
          g.addBust(randomPed(Math.random), sm);
          g.addCar(sm);
          // the chaser on the nearest lane 18 m back, facing the smitare
          const a = laneAim(s.x, s.z, Math.sin(s.yaw), Math.cos(s.yaw), -18);
          const ch = new Car('saab900', { color: 0x1d2c4a });
          ch.place(a.x, a.z, Math.atan2(s.x - a.x, s.z - a.z));
          g.addBust(randomPed(Math.random), ch);
          g.addCar(ch);
          sm.ai = new AIDriver(sm, { mode: 'flee', cruise: 20, avoid: true, target: () => ({ x: ch.x, z: ch.z, vx: ch.vx, vz: ch.vz }) });
          ch.ai = new AIDriver(ch, { mode: 'chase', cruise: 22, aggressive: true, avoid: false, target: () => ({ x: sm.x, z: sm.z, vx: sm.vx, vz: sm.vz }) });
          g.player.teleport(ch.x + 3, ch.z + 3, 0);
          window.__rp = { sm, ch };
          return { spot: [s.x.toFixed(0), s.z.toFixed(0), s.kind], onRoad: L.isRoad(s.x, s.z) };
        }, run);
        console.log('[t] rp', run, 'start', JSON.stringify(info));
        let last = null, lastC = null, stuck = 0, stuckC = 0, offS = 0, offC = 0, gapMax = 0;
        for (let k = 0; k < secs; k++) {
          await sleep(1000);
          const p = await ev(async () => {
            const L = await import('./src/world/layout.js'), { sm, ch } = window.__rp, g = __game;
            g.player.teleport(ch.x - Math.sin(ch.yaw) * 6, ch.z - Math.cos(ch.yaw) * 6, ch.yaw);
            g.cam.yaw = ch.yaw;
            return { x: sm.x, z: sm.z, v: sm.speed, on: L.isRoad(sm.x, sm.z), cx: ch.x, cz: ch.z, con: L.isRoad(ch.x, ch.z), gap: Math.hypot(sm.x - ch.x, sm.z - ch.z) };
          });
          if (!p.on) { offS++; if (process.env.RPDBG) console.log('[t] rp smitare off', JSON.stringify(await ev(() => { const a = window.__rp.sm.ai; const q = a.path?.pts[a.path.idx]; return { x: a.car.x.toFixed(1), z: a.car.z.toFixed(1), yaw: a.car.yaw.toFixed(2), v: a.car.speed.toFixed(1), rej: !!a.rejoining, offT: +(a.offT || 0).toFixed(1), back: +(a.backT || 0).toFixed(1), rev: +(a.reverseT || 0).toFixed(1), swerve: +(a.swerveT || 0).toFixed(1), q: q && [q.x.toFixed(0), q.z.toFixed(0)], idx: a.path?.idx, n: a.path?.pts.length }; }))); }
          if (!p.con) { offC++; if (process.env.RPDBG) console.log('[t] rp chaser off', JSON.stringify(await ev(() => { const a = window.__rp.ch.ai; return { x: a.car.x.toFixed(1), z: a.car.z.toFixed(1), v: a.car.speed.toFixed(1), rej: !!a.rejoining, back: +(a.backT || 0).toFixed(1), rev: +(a.reverseT || 0).toFixed(1), idx: a.path?.idx, n: a.path?.pts.length, gap: Math.hypot(a.car.x - window.__rp.sm.x, a.car.z - window.__rp.sm.z).toFixed(0) }; }))); }
          gapMax = Math.max(gapMax, p.gap);
          if (k % 4 === 3) {
            if (last && Math.hypot(p.x - last.x, p.z - last.z) < 2) { stuck++; console.log('[t] rp', run, 'smitare stuck at', p.x.toFixed(0), p.z.toFixed(0)); }
            if (lastC && Math.hypot(p.cx - lastC.x, p.cz - lastC.z) < 2) { stuckC++; console.log('[t] rp', run, 'chaser stuck at', p.cx.toFixed(0), p.cz.toFixed(0)); }
            last = { x: p.x, z: p.z }; lastC = { x: p.cx, z: p.cz };
          }
          if (k === 4 || k === 12) await shot(`rp${run}_t${k}`);
        }
        const end = await ev(() => { const { sm, ch } = window.__rp; return { x: sm.x.toFixed(0), z: sm.z.toFixed(0), v: sm.speed.toFixed(1), hp: sm.hp.toFixed(0), chHp: ch.hp.toFixed(0) }; });
        console.log('[t] rp', run, 'smitare stuck windows', stuck, 'off-road s', offS, '| chaser stuck', stuckC, 'off-road s', offC, '| max gap', gapMax.toFixed(0), '| end', JSON.stringify(end));
        await ev(() => { const { sm, ch } = window.__rp; ch.ai = null; ch.ctrl.throttle = 0; ch.ctrl.brake = 1; window.__poDone = false; sm.ai.pullOver(() => { window.__poDone = true; }); });
        let tDone = null;
        for (let k = 0; k < 16; k++) { await sleep(500); if (tDone === null && await ev(() => window.__poDone)) tDone = (k + 1) * 0.5; }
        const po = await ev(async () => { const L = await import('./src/world/layout.js'), { groundAt } = await import('./src/world/collision.js'); const { sm } = window.__rp; return { mode: sm.ai.mode, v: sm.speed.toFixed(2), hazard: sm.hazard, onRoad: L.isRoad(sm.x, sm.z), ground: groundAt(sm.x, sm.z, sm.y + 0.3, 0.6).toFixed(2), pitch: sm.groundPitch.toFixed(3), inLane: !!sm.ai.po?.inLane }; });
        console.log('[t] rp', run, 'pullover done after', tDone, 's', JSON.stringify(po));
        await ev(() => { const { sm } = window.__rp, g = __game; g.player.teleport(sm.x - Math.sin(sm.yaw) * 8, sm.z - Math.cos(sm.yaw) * 8, sm.yaw); g.cam.yaw = sm.yaw; g.cam.snapNext = true; });
        await frames(20);
        await shot(`rp${run}_end`);
        await ev(() => { const { sm, ch } = window.__rp; __game.removeCar(sm); __game.removeCar(ch); });
      }
    },
    // The chase AI closing in by itself (no warps): Ove's Saab parked on Solrosvägen, a white Škoda on
    // the chase AI (cruise 24, the story's rubber band) spawned ~150 m away - behind on the same street
    // facing away, on the same street facing Ove, on a parallel street facing away. It must get within
    // 40 m within 25 s.
    async chasecheck() {
      const cases = [['same street, facing away', 0, -150, Math.PI], ['same street, facing him', 0, -150, 0], ['parallel street, facing away', -80, -119, Math.PI]];
      for (const [name, dx, dz, yaw] of cases) {
        await ev(async ([dx, dz, yaw]) => {
          const g = __game, L = await import('./src/world/layout.js'), { Car } = await import('./src/actors/car.js'), { AIDriver } = await import('./src/actors/drivers.js');
          const saab = g.named.saab;
          if (g.playerCar !== saab) g.enterCar(saab);
          saab.place(L.rc(3) - L.LANE, 9, 0); saab.vx = saab.vz = 0;
          if (window.__cc) g.removeCar(window.__cc);
          const c = new Car('skoda', { color: 0xd2d2d0, solid: true });
          const cx = L.rc(3) + dx + (yaw === Math.PI ? L.LANE : -L.LANE), cz = 9 + dz;
          c.place(cx, cz, yaw);
          for (const o of [...g.cars]) if (o.traffic && (Math.hypot(o.x - cx, o.z - cz) < 20 || Math.hypot(o.x - saab.x, o.z - saab.z) < 20)) g.removeCar(o);
          g.addCar(c);
          c.driverBust = true;
          c.ai = new AIDriver(c, { mode: 'chase', target: () => ({ x: saab.x, z: saab.z, vx: saab.vx, vz: saab.vz }), cruise: 24, aggressive: true, avoid: false, rubber: () => (Math.hypot(c.x - saab.x, c.z - saab.z) > 80 ? 1.3 : 1) });
          window.__cc = c;
        }, [dx, dz, yaw]);
        let t40 = null, minD = 1e9;
        const track = [];
        for (let k = 1; k <= 25; k++) {
          await sleep(1000);
          const d = await ev(() => { const c = window.__cc, s = __game.named.saab; return Math.hypot(c.x - s.x, c.z - s.z); });
          if (process.env.CCDBG && k % 2 === 0) console.log('[t] cc', k, JSON.stringify(await ev(async () => { const L = await import('./src/world/layout.js'); const c = window.__cc, a = c.ai, p = a.path; return { x: c.x.toFixed(0), z: c.z.toFixed(0), yaw: c.yaw.toFixed(2), v: c.speed.toFixed(1), nodes: p?.nodes.map((n) => L.nodeX(n) + ',' + L.nodeZ(n)).join(' '), idx: p?.idx, n: p?.pts.length, q: p && p.pts[p.idx] && [p.pts[p.idx].x.toFixed(0), p.pts[p.idx].z.toFixed(0), p.pts[p.idx].turn || 0], rev: +(a.reverseT || 0).toFixed(1), rej: !!a.rejoining, thr: c.ctrl.throttle.toFixed(2), brk: c.ctrl.brake.toFixed(2), t: [a.target().x.toFixed(0), a.target().z.toFixed(0)], cn: a.chaseNode !== undefined ? L.nodeX(a.chaseNode) + ',' + L.nodeZ(a.chaseNode) : null, end: p?.endPoint }; })));
          minD = Math.min(minD, d);
          if (k % 5 === 0) track.push(d.toFixed(0));
          if (t40 === null && d < 40) t40 = k;
        }
        console.log('[t] chasecheck', name, '| within 40 m after', t40 === null ? 'never (25 s)' : t40 + ' s', '| closest', minD.toFixed(0), 'm | every 5 s', track.join(' '));
      }
      await shot('cars_chasecheck');
    },
    // What the cars cost: stats with every car shown vs hidden, at the start view and from above.
    async carcost() {
      await frames(30);
      const stat = async () => { await frames(40); return ev(() => { const s = window.__stats(); return { calls: s.calls, aoCalls: s.aoCalls, tris: s.tris, cpuMs: s.cpuMs }; }); };
      const both = async () => {
        const a = await stat();
        // (main.js sets root.visible every frame, so take the cars out of the scene instead)
        await ev(() => { for (const c of __game.cars) c.root.parent?.remove(c.root); });
        const b = await stat();
        await ev(async () => { const { scene } = await import('./src/gfx.js'); for (const c of __game.cars) scene.add(c.root); });
        return { with: a, without: b };
      };
      console.log('[t] carcost cars', await ev(() => __game.cars.length), 'start view', JSON.stringify(await both()), 'fps', await fps());
      await ev(() => { __game.aerial = true; });
      console.log('[t] carcost aerial', JSON.stringify(await both()), 'fps', await fps());
      await shot('cars_aerial');
      await ev(() => { __game.aerial = false; });
      const m = await ev(async () => { const { carModel, MODEL_KEYS } = await import('./src/actors/carmodels.js'); return MODEL_KEYS.map((k) => `${k} ${carModel(k).tris | 0}/${carModel(k).lodTris | 0}`).join(', '); });
      console.log('[t] tris per car (near/LOD):', m);
      // main-pass draw calls of one near car: body surfaces + glass groups + lamps + plate (+ glow
      // while a brake / indicator lamp is lit, + snow cap when parked under snow)
      const dc = await ev(async () => {
        const { Car } = await import('./src/actors/car.js'), { MODEL_KEYS } = await import('./src/actors/carmodels.js');
        const n = (m) => (Array.isArray(m) ? m.length : 1);
        return MODEL_KEYS.map((k) => { const c = new Car(k); return `${k} ${n(c.body.material) + (c.glass ? n(c.glass.material) : 0) + (c.lights ? 1 : 0) + 1}`; }).join(', ');
      });
      console.log('[t] draw calls per near car:', dc);
    },
    // A traffic car pulls over (indicator, kerb, hazards).
    async pullover() {
      await sleep(5000);   // let the traffic get going
      const t0 = Date.now();
      const r = await ev(() => {
        const g = __game, p = g.player;
        let best = null, bd = 1e9;
        for (const c of g.cars) if (c.traffic && c.ai && !c.dead && c.speed > 2 && c.kind !== 'bus') { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
        if (!best) return null;
        window.__po = best; window.__poDone = false;
        best.ai.pullOver(() => { window.__poDone = true; });
        return best.type;
      });
      if (!r) { console.log('[t] pullover: no moving traffic car'); return; }
      await ev(() => { const g = __game, c = __po; g.player.teleport(c.x + Math.sin(c.yaw) * 22, c.z + Math.cos(c.yaw) * 22, c.yaw + Math.PI); g.cam.snapNext = true; });
      try { await page.waitForFunction(() => window.__poDone, { timeout: 20000, polling: 100 }); } catch (e) { /* reported below */ }
      console.log('[t] pullover', r, 'done', await ev(() => window.__poDone), 'after', ((Date.now() - t0) / 1000).toFixed(1), 's hazard', await ev(() => __po.hazard), 'v', await ev(() => __po.speed.toFixed(2)));
      await ev(() => { const g = __game, c = __po; g.player.teleport(c.x - Math.sin(c.yaw) * 9 + Math.cos(c.yaw) * 3, c.z - Math.cos(c.yaw) * 9 - Math.sin(c.yaw) * 3, c.yaw); g.cam.yaw = c.yaw + Math.PI; g.cam.snapNext = true; });
      await frames(20);
      await shot('cars_pullover');
    },
    // Ove in his Saab from the chase cam, and a few other types with drivers seated at seatLocal.
    // Ove's Saab parked at a kerb in town, seen from fixed cameras (front 3/4, side, rear 3/4, chase
    // height): for the paint (a dark car's lower door must not be brighter than its upper door) and the
    // tail. Prints the screen positions of an upper- and a lower-door point for sampling.
    async saabtown() {
      await ev(async () => {
        const g = __game, L = await import('./src/world/layout.js');
        if (g.playerCar) g.exitCar(true);
        const c = g.named.saab;
        const x = L.rc(4) - (L.RHW - 1.15), z = L.rc(3) + 22;
        c.place(x, z, 0); c.vx = c.vz = 0;
        g.player.teleport(x - 9, z - 4, 0);
        // keep traffic out of the frame
        for (const o of [...g.cars]) if (o !== c && o.traffic && Math.hypot(o.x - x, o.z - z) < 70) g.removeCar(o);
        g.cam.update = function () {};
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
        window.__town = { x, z };
      });
      const views = [['f34', [3.6, 1.45, 5.6], [0, 0.72, 0.3], 50], ['side', [7.0, 1.0, 0.1], [0, 0.7, 0.1], 46], ['r34', [3.4, 1.55, -6.0], [0, 0.72, -0.4], 50], ['rear', [0.6, 1.9, -8.6], [0, 0.8, 0], 46]];
      for (const [name, at, look, fov] of views) {
        const pts = await ev(async ([at, look, fov]) => {
          const g = __game, { THREE } = await import('./src/gfx.js'), t = window.__town, c = g.named.saab, cam = g.cam.cam;
          cam.position.set(t.x + at[0], at[1], t.z + at[2]); cam.lookAt(t.x + look[0], look[1], t.z + look[2]); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
          const f = c.model.P._fn, out = {};
          for (const [k, y, zz] of [['upper', 0.8, 0.15], ['lower', 0.56, 0.15], ['upperR', 0.8, -0.75], ['lowerR', 0.56, -0.75]]) {
            const v = new THREE.Vector3(f.sideX(zz, y) + 0.003, y, zz);
            c.tilt.updateWorldMatrix(true, false); v.applyMatrix4(c.tilt.matrixWorld); v.project(cam);
            out[k] = [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)];
          }
          return out;
        }, [at, look, fov]);
        await frames(14);
        await shot('cars_town_' + name);
        console.log('[t] town', name, JSON.stringify(pts));
      }
    },
    async seating() {
      await ev(async () => {
        const g = __game, L = await import('./src/world/layout.js');
        const c = g.named.saab || g.cars.find((c) => c.kind === 'saab900');
        g.enterCar(c);
        const a = L.nearestNode(c.x, c.z), b = L.neighbors(a)[0], dx = L.nodeX(b) - L.nodeX(a), dz = L.nodeZ(b) - L.nodeZ(a), l = Math.hypot(dx, dz);
        c.place(L.nodeX(a) + dx / l * 12 - dz / l * L.LANE, L.nodeZ(a) + dz / l * 12 + dx / l * L.LANE, Math.atan2(dx, dz));
        g.cam.snapNext = true;
      });
      await frames(10);
      await hold(['KeyW'], 1800);
      await shot('cars_saab_chase');
      await hold(['KeyW', 'KeyA'], 900);
      await shot('cars_saab_chase2');
      const info = await ev(() => { const g = __game, c = g.playerCar; return { type: c.kind, kmh: (c.speed * 3.6).toFixed(0), lights: Array.from(c.lightMat.userData.ch).map((v) => v.toFixed(1)).join(' ') }; });
      console.log('[t] seating', JSON.stringify(info));
    },
  };
};
