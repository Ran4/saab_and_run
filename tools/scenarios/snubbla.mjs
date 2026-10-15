// Ove trips on a landing and tumbles out of moving cars (feature snubbla_vid_hopp: actors/ragdoll.js,
// Character.tumble, main.js stumble / jumpOut).
//   snubbla      real keys: jumps standing, walking and running with the next landing set to trip
//                (__game.stumbleNext), a few with no lever (no trip in tests without &stumble), the
//                odds (1 in 40 with &stumble's chance), into a wall, onto a car's roof (no trip there):
//                each time down (a ragdoll: flung, then lying), never under the ground, never through
//                a wall, up again within a few seconds near where he fell, a line of his when he is up
//   hoppaur      real keys: into a car, W up to 15 / 35 / 60 / 90 km/h, E: out at speed he tumbles along
//                the road (further the faster, never under it, not inside the car), up again; at a
//                crawl (10 km/h) he steps out as before; a car into him: down as a ragdoll too
//   snubblalook  film strips (every 4th frame, in-page grabs): a stumble standing, one walking, one
//                running, a car into him, a jump out of a car at 50 km/h (the chase camera and from the
//                side), close: snubbla_<take>.jpg contact sheets
//                (FILM=dir keeps the frames)
//   snubblaperf  what the ragdoll costs: its step and its pose, ms per call, tumbling and lying
//   snubbladbg   diagnostics: a stumble step by step (the fastest point, the states); DBG=noLimits,...
//                (RAG.dbg) runs it with parts of the solver off, RUN=1 running, ALL=1 every frame
// Checks that fail are pushed to the run's errors ('N errors').
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export default ({ page, ev, shot, frames, sleep, hold, tap, until, errors, OUT }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg, info) => { if (!ok) fail(msg + (info === undefined ? '' : ' ' + JSON.stringify(info))); else console.log('[t] ok', msg, info === undefined ? '' : JSON.stringify(info)); };
  const raf = (fn, arg, timeout = 20000) => page.waitForFunction(fn, { polling: 'raf', timeout }, arg);

  // A watch on Ove's body every frame: his states in turn, the lowest point of the ragdoll and of his
  // bones over the ground under it, inside a wall (a point under a block's top inside its footprint),
  // the head's lowest height, what he said.
  const watch = () => ev(async () => {
    const { groundAt, queryBlocks, contains, topAt } = await import('./src/world/collision.js');
    const g = __game, p = g.player, W = (window.__sw ||= {});
    W.states = []; W.from = null; W.minPt = 9; W.minBone = 9; W.wall = 0; W.headMin = 9; W.said = []; W.nan = 0; W.t0 = g.time; W.inCar = 0;
    if (!W.hooked) {
      W.hooked = true;
      const say = g.say.bind(g);
      g.say = (t, text, ...a) => { if (t === g.player) window.__sw.said.push(text); return say(t, text, ...a); };
      const bl = [], v = g.player.root.position.clone();
      g.onFrame(() => {
        const W = window.__sw, p = g.player, st = p.state + (p.rag ? '+rag' : '');
        if (W.states[W.states.length - 1]?.[0] !== st) W.states.push([st, +(g.time - W.t0).toFixed(2)]);
        if (st === 'flung+rag' && !W.from) W.from = { x: p.x, z: p.z };
        if (!Number.isFinite(p.x + p.y + p.z)) W.nan++;
        const r = p.rag;
        if (!r) return;
        if (!r.frozen) for (let i = 0; i < r.x.length; i++) {
          if (!Number.isFinite(r.x[i] + r.y[i] + r.z[i])) { W.nan++; continue; }
          const gy = groundAt(r.x[i], r.z[i], r.y[i], 0.3);
          W.minPt = Math.min(W.minPt, r.y[i] - r.G.r[i] - gy);
          queryBlocks(r.x[i] - 0.01, r.z[i] - 0.01, r.x[i] + 0.01, r.z[i] + 0.01, bl);
          for (const b of bl) if (b.shape !== 3 && contains(b, r.x[i], r.z[i]) && (b.shape === 2 ? topAt(b, r.x[i], r.z[i]) : b.top) > r.y[i] + 0.35) W.wall++;
          for (const c of g.cars) {
            const o = c.obb; if (!o || Math.abs(c.x - r.x[i]) > 6 || Math.abs(c.z - r.z[i]) > 6) continue;
            const dx = r.x[i] - o.x, dz = r.z[i] - o.z;
            if (Math.abs(dx * o.fx + dz * o.fz) < o.hz - 0.1 && Math.abs(-dx * o.fz + dz * o.fx) < o.hx - 0.1 && r.y[i] < c.y + c.height - 0.2 && r.y[i] > c.y + 0.1) W.inCar++;
          }
        }
        for (const b of p.model.bones.slice(0, 18)) {
          b.getWorldPosition(v);
          const gy = groundAt(v.x, v.z, v.y, 0.3);
          if (v.y - gy < W.minBone) { W.minBone = v.y - gy; W.minAt = [b.name, st, +(p.downT || 0).toFixed(2), +r.t.toFixed(2), p.anim.prone ? 'prone' : 'back', +(p.timer || 0).toFixed(2), r.frozen ? +r.rollT.toFixed(2) : 0]; }
        }
        p.model.headBone.getWorldPosition(v);
        W.headMin = Math.min(W.headMin, v.y - groundAt(v.x, v.z, v.y, 0.3));
      });
    }
    return true;
  });
  const res = () => ev(() => { const W = window.__sw; return { states: W.states, from: W.from, minPt: +W.minPt.toFixed(3), minBone: +W.minBone.toFixed(3), minAt: W.minAt, wall: W.wall, headMin: +W.headMin.toFixed(2), said: W.said.slice(), nan: W.nan, inCar: W.inCar }; });

  // Ove on foot at (x, z) facing yaw, traffic and violations cleared round him, the camera behind.
  const setup = (x = -95, z = -37.25, yaw = Math.PI / 2) => ev(({ x, z, yaw }) => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    for (const c of g.cars.slice()) if ((c.traffic || c.violation) && Math.abs(c.x - x) < 90 && Math.abs(c.z - z) < 60) { if (c.violation) g.patrol.remove(c); else g.removeCar(c); }
    g.player.teleport(x, z, yaw);
    g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true;
    return true;
  }, { x, z, yaw });
  const press = async () => { await page.keyboard.down('Space'); await frames(1); await page.keyboard.up('Space'); };
  const state = () => ev(() => __game.player.state);
  const pos = () => ev(() => { const p = __game.player; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), yaw: +p.yaw.toFixed(2) }; });

  // One jump, keys held as given, the landing set to trip (lever) or not; until he is up (or 9 s).
  const jump = async (label, o = {}) => {
    await setup(o.x, o.z, o.yaw);
    await ev((on) => { __game.stumbleNext = on; }, o.lever !== false);
    await frames(10);
    await watch();
    const p0 = await pos();
    for (const k of o.keys || []) await page.keyboard.down(k);
    if (o.keys?.length) await sleep(o.run ?? 900);
    await press();
    try { await raf(() => __game.player.state !== 'normal' || window.__sw.states.length > 1 && __game.player.onGround && __game.player.landT > 0.3, null, 6000); } catch (e) { /* (no trip) */ }
    for (const k of o.keys || []) await page.keyboard.up(k);
    let up = true;
    try { await raf(() => __game.player.state === 'normal', null, 12000); } catch (e) { up = false; }
    await frames(30);
    const r = await res(), p1 = await pos();
    const tripped = r.states.some((s) => s[0] === 'flung+rag');
    const lay = r.states.find((s) => s[0] === 'down+rag'), stood = r.states.find((s, i) => i > 0 && s[0] === 'normal');
    console.log('[t] snubbla', label, JSON.stringify({ ...r, start: p0, to: p1, moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2) }));
    return { r, p0, p1, tripped, up, lay, stood };
  };

  return {
    async snubbla() {
      await ev(() => { __game.patrol.pause(true); });
      const all = [];
      // 1. standing, walking, running: each trips with the lever
      for (const [label, keys] of [['standing', []], ['walking', ['KeyW']], ['running', ['ShiftLeft', 'KeyW']]]) {
        for (let n = 0; n < 2; n++) {
          const j = await jump(`${label}#${n}`, { keys });
          all.push(j);
          check(j.tripped, `${label}#${n}: he trips (a ragdoll)`);
          check(j.lay && j.lay[1] < 5, `${label}#${n}: lies still within 5 s`, j.lay);
          check(j.up && j.stood && j.stood[1] < 8, `${label}#${n}: up again within 8 s`, j.stood);
          check(j.r.headMin < 0.5, `${label}#${n}: his head goes down to the ground`, j.r.headMin);
          check(j.r.minPt > -0.04, `${label}#${n}: no point of him under the ground`, j.r.minPt);
          check(j.r.minBone > -0.02, `${label}#${n}: no joint under the ground`, j.r.minBone);
          check(!j.r.nan && !j.r.wall, `${label}#${n}: no NaN, nothing in a wall`, { nan: j.r.nan, wall: j.r.wall });
          // (from where he started to go down to where he stood up)
          const f = j.r.from || j.p0, d = Math.hypot(j.p1.x - f.x, j.p1.z - f.z);
          check(d < { standing: 2.5, walking: 4, running: 5.5 }[label], `${label}#${n}: up near where he fell`, +d.toFixed(2));
          // on the move he goes down ahead (+x), not back past where he jumped
          if (label !== 'standing') check(j.p1.x - j.p0.x > 0.3, `${label}#${n}: down ahead of where he jumped`, +(j.p1.x - j.p0.x).toFixed(2));
          if (j.stood) await ev(() => true);
        }
      }
      const said = all.filter((j) => j.r.said.length).length;
      check(said >= 3, 'he says something when he is up (4 in 5)', all.map((j) => j.r.said));
      // 2. no lever, no &stumble: never a trip in tests
      let trips = 0;
      for (let n = 0; n < 6; n++) { const j = await jump(`nolever#${n}`, { lever: false, keys: n % 2 ? ['KeyW'] : [] }); if (j.tripped) trips++; }
      check(trips === 0, 'in tests without the lever he never trips', trips);
      // 3. the odds with the real chance
      const odds = await ev(() => { const g = __game; let n = 0; const N = 40000; for (let i = 0; i < N; i++) if (Math.random() < 1 / 40) n++; return n / N; });
      check(Math.abs(odds - 1 / 40) < 0.004, 'one in forty (the roll)', odds);
      // 4. into a wall: standing a step from a house wall, falling towards it
      const wall = await ev(async () => {
        const { queryBlocks } = await import('./src/world/collision.js');
        // the nearest house wall to Ove's door: a block taller than 2 m
        const g = __game, s = window.__lm('oveHouse'), bl = [];
        queryBlocks(s.x - 20, s.z - 20, s.x + 20, s.z + 20, bl);
        const b = bl.filter((b) => b.shape === 0 && b.top > 2.5 && b.maxX - b.minX > 4).sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - s.x, (a.minZ + a.maxZ) / 2 - s.z) - Math.hypot((b.minX + b.maxX) / 2 - s.x, (b.minZ + b.maxZ) / 2 - s.z))[0];
        if (!b) return null;
        // in front of its face nearest the door, facing it
        const cx = (b.minX + b.maxX) / 2, faces = [[cx, b.minZ - 0.7, 0], [cx, b.maxZ + 0.7, Math.PI]];
        for (const [x, z, yaw] of faces) if (g.spotFree(x, z) && g.groundAt(x, z) < 0.5) return { x, z, yaw };
        return null;
      });
      if (wall) {
        const j = await jump('wall', { x: wall.x, z: wall.z, yaw: wall.yaw, keys: ['KeyW'], run: 300 });
        check(j.tripped && j.up, 'at a wall: trips and is up again', j.r.states);
        check(!j.r.wall, 'at a wall: nothing of him through it', j.r.wall);
      } else fail('no wall found for the wall case');
      // 5. on a car's roof: no trip there (the Saab's roof, jumped on from the bonnet's height)
      const roof = await ev(() => {
        const g = __game, c = g.named.saab;
        g.player.teleport(c.x, c.z, c.yaw);
        g.player.y = c.y + c.height + 0.02; g.player.onGround = true; g.stumbleNext = true;
        return { y: +(c.y + c.height).toFixed(2) };
      });
      await frames(20);
      await watch();
      await press();
      await sleep(1500);
      const rr = await res();
      check(!rr.states.some((s) => s[0] === 'flung+rag'), 'on a car roof he never trips', { roof, states: rr.states });
      await ev(() => { __game.stumbleNext = false; });
    },

    async hoppaur() {
      await ev(() => { __game.patrol.pause(true); });
      // the Saab on Solrosvägen (z = -40), eastbound lane, a long straight ahead
      const run = async (kmh, label) => {
        await ev(() => {
          const g = __game, c = g.named.saab;
          if (g.playerCar) g.exitCar(true);
          for (const o of g.cars.slice()) if ((o.traffic || o.violation) && Math.abs(o.z + 40) < 30) { if (o.violation) g.patrol.remove(o); else g.removeCar(o); }
          g.player.teleport(-100, -37, Math.PI / 2);
          c.place(-110, -40 + 2.75, Math.PI / 2);
          g.enterCar(c);
          g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
          return true;
        });
        await frames(10);
        await page.keyboard.down('KeyW');
        try { await raf((v) => __game.playerCar && __game.playerCar.speed * 3.6 >= v, kmh, 15000); } catch (e) { /* */ }
        await page.keyboard.up('KeyW');
        await watch();
        const c0 = await ev(() => { const c = __game.playerCar; return { x: c.x, z: c.z, kmh: +(c.speed * 3.6).toFixed(1) }; });
        await tap('KeyE');
        await frames(2);
        const st0 = await ev(() => ({ state: __game.player.state, car: !!__game.playerCar }));
        let up = true;
        try { await raf(() => __game.player.state === 'normal' && !__game.player.rag, null, 15000); } catch (e) { up = false; }
        await frames(20);
        const r = await res(), p1 = await pos();
        const car = await ev(() => { const c = __game.named.saab; return { x: +c.x.toFixed(1), kmh: +(c.speed * 3.6).toFixed(1) }; });
        const d = Math.hypot(p1.x - c0.x, p1.z - c0.z);
        console.log('[t] hoppaur', label, JSON.stringify({ c0, st0, ...r, to: p1, d: +d.toFixed(1), car }));
        return { c0, st0, r, up, d, p1 };
      };
      const ds = [];
      for (const kmh of process.env.HIT ? [] : [15, 35, 60, 90]) {
        const j = await run(kmh, kmh + 'kmh');
        check(j.c0.kmh >= kmh - 3, `${kmh} km/h reached`, j.c0.kmh);
        check(!j.st0.car && j.st0.state === 'flung', `${kmh} km/h: out, and tumbling`, j.st0);
        check(j.r.states.some((s) => s[0] === 'down+rag'), `${kmh} km/h: lies still at last`, j.r.states);
        check(j.up, `${kmh} km/h: up again`, j.r.states);
        check(j.r.minPt > -0.05 && j.r.minBone > -0.03, `${kmh} km/h: nothing of him under the road`, { minPt: j.r.minPt, minBone: j.r.minBone });
        check(!j.r.nan && !j.r.wall && !j.r.inCar, `${kmh} km/h: no NaN, not in a wall, not in a car`, { nan: j.r.nan, wall: j.r.wall, inCar: j.r.inCar });
        ds.push(j.d);
      }
      if (ds.length) {
        check(ds[3] > ds[1] && ds[1] > 2, 'the faster, the further he tumbles', ds.map((d) => +d.toFixed(1)));
        check(ds[3] < 90, 'not absurdly far at 90 km/h', +ds[3].toFixed(1));
        // at a crawl: steps out as before
        const slow = await run(10, 'crawl');
        check(slow.st0.state === 'normal' && !slow.st0.car, 'at 10 km/h he steps out (no tumble)', slow.st0);
      }
      // a car into him: a ragdoll too (and up again)
      await setup(-95, -37.25, Math.PI / 2);
      await watch();
      await ev(async () => {
        const { Car } = await import('./src/actors/car.js');
        const g = __game, p = g.player;
        const c = (window.__hitcar = new Car('volvo240'));
        // (a car nobody drives stops at 8 m/s²: close, and fast)
        c.place(p.x - 5.5, p.z, Math.PI / 2);
        g.addCar(c);
        c.vx = 13; c.vz = 0;
        return true;
      });
      let hitUp = true;
      try { await raf(() => window.__sw.states.some((s) => s[0] === 'flung+rag'), null, 5000); await raf(() => __game.player.state === 'normal', null, 15000); } catch (e) { hitUp = false; }
      const rh = await res();
      console.log('[t] hoppaur hit', JSON.stringify(rh));
      check(rh.states.some((s) => s[0] === 'flung+rag') && hitUp, 'a car into him: a ragdoll, up again', rh.states);
      check(rh.minPt > -0.05 && rh.minBone > -0.02 && !rh.nan, 'a car into him: not under the ground', { minPt: rh.minPt, minBone: rh.minBone, nan: rh.nan });
      await ev(() => { if (window.__hitcar) { __game.removeCar(window.__hitcar); window.__hitcar = null; } });
    },

    // The ragdoll's cost: its step (two substeps of the solver, the ground, the walls, the cars) and the
    // pose from it, per frame while it tumbles and while it lies (ms, in the page).
    async snubblaperf() {
      await ev(() => { __game.patrol.pause(true); });
      const out = [];
      for (const keys of [[], ['ShiftLeft', 'KeyW']]) {
        await setup(-95, -37.25, Math.PI / 2);
        await frames(10);
        await ev(async () => {
          const { Ragdoll } = await import('./src/actors/ragdoll.js');
          const T = (window.__rt = { step: [], pose: [], n: 0 });
          if (!Ragdoll.prototype.__timed) {
            Ragdoll.prototype.__timed = true;
            for (const k of ['step', 'pose']) {
              const f = Ragdoll.prototype[k];
              Ragdoll.prototype[k] = function (...a) { const t0 = performance.now(); const r = f.apply(this, a); window.__rt[k].push([this.frozen ? 1 : 0, performance.now() - t0]); return r; };
            }
          }
          __game.stumbleNext = true;
        });
        for (const k of keys) await page.keyboard.down(k);
        if (keys.length) await sleep(900);
        await press();
        try { await raf(() => __game.player.rag, null, 5000); } catch (e) { /* */ }
        for (const k of keys) await page.keyboard.up(k);
        try { await raf(() => !__game.player.rag, null, 15000); } catch (e) { /* */ }
        const r = await ev(() => {
          const T = window.__rt, st = (a, fr) => { const v = a.filter((x) => x[0] === fr).map((x) => x[1]).sort((a, b) => a - b); return v.length ? { n: v.length, mean: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3), p95: +v[Math.floor(v.length * 0.95)].toFixed(3), max: +v[v.length - 1].toFixed(3) } : null; };
          return { step: st(T.step, 0), pose: st(T.pose, 0), poseLying: st(T.pose, 1) };
        });
        console.log('[t] snubblaperf', keys.length ? 'running' : 'standing', JSON.stringify(r));
        out.push(r);
      }
      check(out.every((r) => r.step.mean < 0.5 && r.pose.mean < 0.3), 'the ragdoll costs under 0.5 ms a step and 0.3 ms a pose', out.map((r) => [r.step.mean, r.pose.mean]));
    },

    // (diagnostics: a stumble's ragdoll step by step: speeds, the stillest and fastest point, the states)
    async snubbladbg() {
      await ev(() => { __game.patrol.pause(true); });
      const variants = (process.env.DBG || 'none').split(',');
      for (const dbg of variants) for (const keys of process.env.RUN ? [['ShiftLeft', 'KeyW']] : [[]]) {
        await setup(-95, -37.25, Math.PI / 2);
        await frames(10);
        await ev(async (dbg) => {
          const { RAG } = await import('./src/actors/ragdoll.js');
          RAG.dbg = { [dbg]: true };
          // (the same trip each time: the rolls fixed)
          const g = __game, rnd = Math.random, seq = [0.6, 0.3, 0.5, 0.5, 0.5, 0.5]; let n = 0;
          const st = g.stumble.bind(g);
          g.stumble = (p) => { Math.random = () => seq[n++ % seq.length]; try { return st(p); } finally { Math.random = rnd; n = 0; } };
          g.stumbleNext = true; window.__dl = [];
          if (!window.__dh) { window.__dh = true; g.onFrame(() => { const p = g.player, r = p.rag; if (!r || window.__dl.length > 400) return; let vm = 0, im = -1; for (let i = 0; i < r.x.length; i++) { const v = Math.hypot(r.x[i] - r.px[i], r.y[i] - r.py[i], r.z[i] - r.pz[i]) * 120; if (v > vm) { vm = v; im = i; } } window.__dl.push([p.state[0], +r.t.toFixed(2), +vm.toFixed(2), im, +r.stillT.toFixed(2), +(p.downT || 0).toFixed(2), +(p.timer || 0).toFixed(2), r.frozen ? 1 : 0, +p.y.toFixed(2), r.frozen ? [+r.roll.toFixed(2), +p.yaw.toFixed(2), ...[0, 1, 2, 33, 34, 35, 36, 37, 38].map((i) => +p.model.P[i].toFixed(2)), ...[p.model.P.length - 3, p.model.P.length - 2, p.model.P.length - 1].map((i) => +p.model.P[i].toFixed(2))] : '']); }); }
        }, dbg);
        for (const k of keys) await page.keyboard.down(k);
        if (keys.length) await sleep(900);
        await press();
        try { await raf(() => __game.player.rag, null, 5000); } catch (e) { /* */ }
        for (const k of keys) await page.keyboard.up(k);
        try { await raf(() => !__game.player.rag, null, 15000); } catch (e) { console.log('never up'); }
        const L = await ev(() => window.__dl);
        console.log('[t] dbg', dbg, keys.join('+') || 'standing', L.length, 'frames');
        for (let i = 0; i < L.length; i += process.env.ALL ? 1 : 6) console.log('  ', JSON.stringify(L[i]));
      }
    },

    // Film strips: every 4th frame from the trip until he is up, in-page grabs, into a contact sheet.
    async snubblalook() {
      await ev(() => { __game.patrol.pause(true); });
      const keep = process.env.FILM ? path.resolve(process.env.FILM) : null;
      if (keep) fs.mkdirSync(keep, { recursive: true });
      const film = async (take, start, o = {}) => {
        await ev(async (o) => {
          const { renderer, camera } = await import('./src/gfx.js');
          const g = __game, cold = g.cold;
          window.__film = []; let n = 0;
          cold.__ar ||= cold.afterRender.bind(cold);
          window.__filmOn = true;
          cold.afterRender = () => {
            cold.__ar();
            const p = g.player;
            if (!window.__filmOn) return;
            if (p.rag) window.__filmGo = true;
            if (!window.__filmGo || (!p.rag && window.__filmTail <= 0)) return;
            if (!p.rag) window.__filmTail--;
            if (n++ % (o.every || 4) === 0 && window.__film.length < 72) window.__film.push(renderer.domElement.toDataURL('image/jpeg', 0.8));
          };
          window.__filmTail = 12; window.__filmGo = false;
          // a fixed camera beside where it happens, close (o.cam: [side m, up m, back m])
          if (o.fixed) {
            const p = g.player, [sd, up, bk] = o.cam || [3.2, 1.2, 0];
            g.cam.update = function () {
              const P = g.player, f = window.__camAt ||= { x: P.x, z: P.z, y: P.y };
              f.x += (P.x - f.x) * 0.08; f.z += (P.z - f.z) * 0.08; f.y += (P.y - f.y) * 0.08;
              const yaw = o.yaw ?? p.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
              camera.position.set(f.x + rx * sd - fx * bk, f.y + up, f.z + rz * sd - fz * bk);
              camera.lookAt(f.x, f.y + 0.5, f.z); camera.fov = 40; camera.updateProjectionMatrix();
            };
          }
          return true;
        }, o);
        await start();
        try { await raf(() => !__game.player.rag && window.__filmTail <= 0, null, 20000); } catch (e) { console.log('film timeout', take); }
        const shots = await ev(() => { window.__filmOn = false; delete __game.cam.update; window.__camAt = null; __game.cam.snapNext = true; return window.__film; });
        const dir = keep || fs.mkdtempSync(path.join(OUT, '.film-'));
        const files = shots.map((d, i) => { const f = path.join(dir, `snubbla_${take}_${String(i).padStart(2, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); return f; });
        if (files.length) execFileSync('montage', [...files, '-tile', '8x', '-geometry', '320x180+2+2', path.join(OUT, `snubbla_${take}.jpg`)]);
        if (!keep) fs.rmSync(dir, { recursive: true, force: true });
        console.log('saved', `snubbla_${take}.jpg`, files.length, 'frames');
      };
      const trip = (keys, run = 900) => async () => {
        await ev(() => { __game.stumbleNext = true; });
        for (const k of keys) await page.keyboard.down(k);
        if (keys.length) await sleep(run);
        await press();
        try { await raf(() => __game.player.rag, null, 5000); } catch (e) { /* */ }
        for (const k of keys) await page.keyboard.up(k);
      };
      for (const [take, keys] of [['standing', []], ['walking', ['KeyW']], ['running', ['ShiftLeft', 'KeyW']]]) {
        await setup(-95, -37.25, Math.PI / 2);
        await frames(20);
        await film(take, trip(keys), { fixed: true, cam: [3.4, 1.1, -1.5], yaw: Math.PI / 2 });
      }
      // a car into him (from the side)
      await setup(-95, -37.25, Math.PI / 2);
      await frames(20);
      await film('hit', async () => {
        await ev(async () => {
          const { Car } = await import('./src/actors/car.js');
          const g = __game, p = g.player;
          const c = (window.__hitcar = new Car('volvo240'));
          c.place(p.x - 5.5, p.z, Math.PI / 2);
          g.addCar(c);
          c.vx = 13; c.vz = 0;
        });
      }, { fixed: true, cam: [4.5, 1.2, -1], yaw: Math.PI / 2 });
      await ev(() => { if (window.__hitcar) { __game.removeCar(window.__hitcar); window.__hitcar = null; } });
      // out of the Saab at 50 km/h: the chase camera as it plays
      await ev(() => {
        const g = __game, c = g.named.saab;
        for (const o of g.cars.slice()) if ((o.traffic || o.violation) && Math.abs(o.z + 40) < 30) { if (o.violation) g.patrol.remove(o); else g.removeCar(o); }
        g.player.teleport(-100, -37, Math.PI / 2);
        c.place(-110, -40 + 2.75, Math.PI / 2);
        g.enterCar(c);
        g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
        return true;
      });
      await frames(10);
      await film('car50', async () => {
        await page.keyboard.down('KeyW');
        try { await raf(() => __game.playerCar && __game.playerCar.speed * 3.6 >= 50, null, 15000); } catch (e) { /* */ }
        await page.keyboard.up('KeyW');
        await tap('KeyE');
      }, { every: 5 });
      await film('car50side', async () => {
        await ev(() => { const g = __game, c = g.named.saab; g.player.teleport(-100, -37, Math.PI / 2); c.place(-110, -40 + 2.75, Math.PI / 2); g.enterCar(c); g.cam.snapNext = true; });
        await frames(10);
        await page.keyboard.down('KeyW');
        try { await raf(() => __game.playerCar && __game.playerCar.speed * 3.6 >= 50, null, 15000); } catch (e) { /* */ }
        await page.keyboard.up('KeyW');
        await tap('KeyE');
      }, { every: 4, fixed: true, cam: [6, 1.6, -3], yaw: Math.PI / 2 });
    },
  };
};
