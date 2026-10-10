// Car-area scenarios (owned by the cars area). Run through the slot wrapper with your own port:
//   PORT=8803 ../browserslot node tools/shot.mjs physics trailer carflee carcost pullover seating
// physics / trailer simulate a car off-screen (far outside the town, on asphalt) with the real
// modules, step by step, so the numbers don't depend on frame timing; the others play in town.
export default ({ page, ev, shot, frames, sleep, hold, tap, fps, OUT }) => {
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
  return {
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
