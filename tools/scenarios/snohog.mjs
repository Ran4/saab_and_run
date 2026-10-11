// The hoppbacke in the park (feature snöhög: world/snowhill.js, car.js HOPP, trailer.js, game/hoppbacke.js).
//   snohogsim   the car physics stepped by hand over the real hill (deterministic: no frame timing),
//               every make and a trailer, both ways, from a crawl to flat out: where each one takes
//               off and comes down, how long it flies, how hard it lands, that it is upright and
//               driving on after, and never under the snow
//   snohog      real keys (a feedback controller on W / A / D / S holding the hill's axis): several
//               cars at several speeds, both ways, one towing a trailer; screenshots at the takeoff,
//               in the air and at the landing (snohog_<run>_*.png); after each: on its wheels, level,
//               driving on, the flight logged and judged (game.hopp.log), what was said
//               RUNS=a,b picks runs by name; FILM=1 keeps every 2nd frame of each flight; DEBUG=1 logs
//               the camera against the car
//   snohogsound the jump's sounds rendered offline (nothing played): levels against a crash and a thud
//   snohogwalk  real keys: Ove walks the hill end to end (up a face, over the table, down the other),
//               then straight across it over a flank, and jumps on the table: always on the snow's
//               surface (never under it, never floating), up at the table's height on the way
// Checks that fail are pushed to the run's errors ('N errors').
export default ({ page, ev, shot, frames, sleep, hold, tap, until, errors }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg) => { if (!ok) fail(msg); else console.log('[t] ok', msg); };

  // One run with real keys. o: { type, trailer, dir (+1 from the street, -1 from across the park),
  // v (the speed to hold on the flat; 0 = flat out), run (m of run-up before the hill's foot) }.
  const drive = async (label, o) => {
    await ev(async (o) => {
      const { Car } = await import('./src/actors/car.js');
      const { JUMP_HILLS } = await import('./src/world/snowhill.js');
      const g = __game, H = (window.__H = JUMP_HILLS[0]);
      if (g.playerCar) g.exitCar(true);
      if (window.__hcar) { g.removeCar(window.__hcar); window.__hcar = null; }
      const u0 = -o.dir * (H.end + o.run), yaw = Math.atan2(H.fx * o.dir, H.fz * o.dir);
      const c = new Car(o.type, { trailer: o.trailer ? {} : undefined });
      c.place(H.x + H.fx * u0, H.z + H.fz * u0, yaw);
      g.addCar(c); window.__hcar = c;
      g.player.teleport(c.x - Math.cos(yaw) * 2, c.z + Math.sin(yaw) * 2, yaw);
      g.enterCar(c);
      g.cam.yaw = yaw; g.cam.snapNext = true;
      g.hopp.rand = () => 0;          // every reaction comes true
      window.__dbg = o.debug;
      g.hopp.oveT = g.hopp.rideT = g.hopp.watchT = g.hopp.seenT = -1e9;
      window.__hlog = g.hopp.log.length; window.__hst = { ...g.hopp.stats };
    }, { ...o, debug: !!process.env.DEBUG });
    // FILM=1: every 2nd frame from the takeoff to 0.6 s after the landing, grabbed in the page right
    // after it is drawn (snohog_<run>_film<nn>.jpg)
    if (process.env.FILM) await ev(async () => {
      const { renderer } = await import('./src/gfx.js');
      const g = __game, cold = g.cold;
      window.__film = []; let after = 0, n = 0;
      cold.__ar ||= cold.afterRender.bind(cold);
      cold.afterRender = () => {
        cold.__ar();
        const c = g.playerCar;
        if (c?.flight) after = 0.6; else if (after > 0) after -= 1 / 60; else return;
        if (n++ % 2 === 0 && window.__film.length < 90) window.__film.push(renderer.domElement.toDataURL('image/jpeg', 0.75));
      };
    });
    await frames(10);
    const held = new Set();
    const key = async (k, on) => { if (on && !held.has(k)) { await page.keyboard.down(k); held.add(k); } else if (!on && held.has(k)) { await page.keyboard.up(k); held.delete(k); } };
    const t0 = Date.now();
    let took = null, mid = false, landed = null, after = null, last = null, maxW = 0;
    try {
      while (Date.now() - t0 < 30000) {
        const s = await ev((dir) => {
          const c = __game.playerCar, H = window.__H, A = Math.atan2(H.fx * dir, H.fz * dir);
          const wr = (c.x - H.x) * -Math.cos(A) + (c.z - H.z) * Math.sin(A);   // to the right of the axis
          const yerr = Math.atan2(Math.sin(c.yaw - A), Math.cos(c.yaw - A));
          const cam = __game.cam;
          return { u: H.along(c.x, c.z) * dir, wr, yerr, v: c.speed, air: c.air, ft: c.flight ? c.flight.t : null, log: __game.hopp.log.length - window.__hlog, y: c.y,
            cam: window.__dbg ? { d: +Math.hypot(cam.pos.x - c.x, cam.pos.z - c.z).toFixed(1), dy: +(cam.pos.y - c.y).toFixed(1), boom: +cam.boom.toFixed(1), airK: +(cam.airK || 0).toFixed(2), tr: c.trailer ? [c.trailer.air, +c.trailer.ay.toFixed(2), +c.trailer.avy.toFixed(1), +c.trailer.pitch.toFixed(2), c.trailer.bounces] : null } : null };
        }, o.dir);
        last = s;
        if (process.env.DEBUG && (s.air || s.u > -16)) console.log('[t] cam', label, s.u.toFixed(1), s.air ? 'air' : 'gnd', JSON.stringify(s.cam));
        maxW = Math.max(maxW, Math.abs(s.wr));
        if (!s.air) {
          // steer for a point on the axis 9 m ahead (+ yaw = left: A)
          const err = Math.atan2(s.wr, 9) - s.yerr;
          await key('KeyA', err > 0.025); await key('KeyD', err < -0.025);
          const climbing = s.u > -14.3 && s.u < -3.6;
          const brake = s.u > 10 && landed;
          await key('KeyW', !brake && (climbing || !o.v || s.v < o.v - 0.25));
          await key('KeyS', !!brake && s.v > 1);
        } else { await key('KeyA', false); await key('KeyD', false); }
        if (s.air && s.ft != null && !took) { took = s; await shot(`snohog_${label}_1takeoff`); }
        if (s.air && s.ft > 0.45 && !mid) { mid = true; await shot(`snohog_${label}_2air`); }
        if (!landed && s.log > 0 && !s.air) { landed = s; await shot(`snohog_${label}_3land`); }
        if (landed && !after && Date.now() - t0 > 0 && s.v < 1.5) break;
        await sleep(30);
      }
    } finally { for (const k of [...held]) await key(k, false); }
    await frames(30);
    if (process.env.FILM) {
      const film = await ev(() => { const f = window.__film; window.__film = []; return f; });
      const fs = await import('fs');
      film.forEach((d, i) => fs.writeFileSync(`${process.env.OUT || 'out'}/snohog_${label}_film${String(i).padStart(2, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
      console.log('[t] film', film.length, 'frames');
    }
    const r = await ev(() => {
      const g = __game, c = g.playerCar, H = window.__H, st = {};
      for (const k in g.hopp.stats) st[k] = g.hopp.stats[k] - (window.__hst[k] || 0);
      return { log: g.hopp.log.slice(window.__hlog), car: { air: c.air, y: +c.y.toFixed(2), ground: +g.groundAt(c.x, c.z).toFixed(2), pitch: +c.tilt.rotation.x.toFixed(2), roll: +c.tilt.rotation.z.toFixed(2), hp: +c.hp.toFixed(0), hp0: c.spec.hp, u: +H.along(c.x, c.z).toFixed(1) }, trailer: c.trailer ? { air: c.trailer.air, pitch: +c.trailer.pitch.toFixed(2), y: +c.trailer.ay.toFixed(2) } : null, stats: st, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).slice(-2) };
    });
    console.log(`[t] ${label}`, JSON.stringify(r), 'maxOffAxis', maxW.toFixed(2));
    const tag = `${label} (${o.type}${o.trailer ? '+släp' : ''} ${o.v || 'flat out'} m/s ${o.dir > 0 ? 'från gatan' : 'från parken'})`;
    check(r.log.length >= 1, `${tag}: flew (${r.log.map((l) => `${l.air}s ${l.dist}m impact ${l.impact} ${l.cls}`).join(', ')})`);
    check(!r.car.air && Math.abs(r.car.y - r.car.ground) < 0.05, `${tag}: on the ground after`);
    check(Math.abs(r.car.pitch) < 0.08 && Math.abs(r.car.roll) < 0.08, `${tag}: on its wheels, level (pitch ${r.car.pitch}, roll ${r.car.roll})`);
    check(r.car.hp0 - r.car.hp < 12, `${tag}: no real damage (${r.car.hp0 - r.car.hp} hp)`);
    if (r.trailer) check(!r.trailer.air && Math.abs(r.trailer.pitch) < 0.1, `${tag}: the trailer down and level (${JSON.stringify(r.trailer)})`);
    return r;
  };

  return {
    async snohog() {
      const runs = [
        ['saab13', { type: 'saab900', dir: -1, v: 13.5, run: 30 }],
        ['saabslow', { type: 'saab900', dir: 1, v: 0, run: 14 }],
        ['volvo12', { type: 'volvo240', dir: -1, v: 12, run: 30 }],
        ['audiflat', { type: 'audi', dir: -1, v: 0, run: 30 }],
        ['van14', { type: 'van', dir: -1, v: 14, run: 30 }],
        ['slap', { type: 'volvo740', trailer: true, dir: -1, v: 12.5, run: 30 }],
      ];
      const pickRuns = process.env.RUNS ? process.env.RUNS.split(',') : null;
      const all = [];
      for (const [label, o] of runs) if (!pickRuns || pickRuns.includes(label)) all.push([label, await drive(label, o)]);
      const st = await ev(() => __game.hopp.stats);
      console.log('[t] hopp stats', JSON.stringify(st));
      const good = all.filter(([l, r]) => r.log.some((f) => f.cls === 'soft' || f.cls === 'good') && r.log.some((f) => f.air > 0.8));
      if (!pickRuns) check(good.length >= 2, `at least two runs fly 0.8 s and land well (${good.map(([l]) => l).join(', ')})`);
    },

    async snohogwalk() {
      const walk = async (label, from, yaw, keys, ms, jumpAt = null) => {
        await ev(async ({ from, yaw }) => {
          const { JUMP_HILLS } = await import('./src/world/snowhill.js');
          const g = __game, H = (window.__H = JUMP_HILLS[0]);
          if (g.playerCar) g.exitCar(true);
          const x = H.x + H.fx * from[0] + H.rx * from[1], z = H.z + H.fz * from[0] + H.rz * from[1];
          g.player.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.25; g.cam.snapNext = true;
          window.__wlog = { n: 0, under: 0, float: 0, maxY: 0, worst: 0 };
          // every frame: Ove against the snow under him
          g.hooks = g.hooks.filter((h) => !h.__walk);
          const h = () => {
            const p = g.player, top = H.at(p.x, p.z), L = window.__wlog;
            if (top < 0) return;
            L.n++; L.maxY = Math.max(L.maxY, p.y);
            const d = p.y - top;
            if (d < -0.05) L.under++;
            if (p.onGround && d > 0.08) L.float++;
            if (p.onGround) L.worst = Math.max(L.worst, Math.abs(d));
          };
          h.__walk = true; g.hooks.push(h);
        }, { from, yaw });
        await frames(10);
        for (const k of keys) await page.keyboard.down(k);
        const t0 = Date.now();
        let jumped = false;
        while (Date.now() - t0 < ms) {
          await sleep(60);
          if (jumpAt && !jumped) {
            const u = await ev(() => { const p = __game.player; return window.__H.along(p.x, p.z); });
            if (Math.abs(u - jumpAt) < 0.8) { jumped = true; await tap('Space'); await shot(`snohog_walk_${label}_jump`); }
          }
          if (Date.now() - t0 > ms / 2 && Date.now() - t0 < ms / 2 + 100) await shot(`snohog_walk_${label}`);
        }
        for (const k of keys) await page.keyboard.up(k);
        await frames(20);
        const r = await ev(() => { const g = __game, p = g.player, H = window.__H; g.hooks = g.hooks.filter((h) => !h.__walk); return { ...window.__wlog, u: +H.along(p.x, p.z).toFixed(1), w: +H.across(p.x, p.z).toFixed(1), y: +p.y.toFixed(2), state: p.state }; });
        console.log(`[t] walk ${label}`, JSON.stringify(r));
        check(r.n > 30 && r.under === 0, `walk ${label}: never under the snow (${r.under} of ${r.n} frames)`);
        check(r.float < 3 && r.worst < 0.12, `walk ${label}: feet on it (floating ${r.float} frames, worst ${r.worst.toFixed(2)} m)`);
        return r;
      };
      const H = await ev(async () => { const { JUMP_HILLS } = await import('./src/world/snowhill.js'); const H = JUMP_HILLS[0]; return { end: H.end, top: H.top, yaw: Math.atan2(H.fx, H.fz), ryaw: Math.atan2(H.rx, H.rz) }; });
      // end to end, brisk (shift): up a face, over the table (a jump on it), down the other
      const a = await walk('length', [-H.end - 2, 0.3], H.yaw, ['KeyW', 'ShiftLeft'], 9500, -1.0);
      check(a.maxY > H.top - 0.15, `walk length: up on the table (max y ${a.maxY.toFixed(2)}, table ${H.top.toFixed(2)})`);
      check(a.u > H.end - 1, `walk length: over it and down the far side (at u ${a.u})`);
      // straight across, at a walk, over a flank and the table's middle
      const b = await walk('across', [1.5, -12], H.ryaw, ['KeyW'], 8500);
      check(b.maxY > H.top - 0.2 && b.w > 8, `walk across: over the top and down the far flank (max y ${b.maxY.toFixed(2)}, at w ${b.w})`);
    },

    async snohogsound() {
      const out = await ev(async () => {
        const { audio } = await import('/src/audio.js');
        const S = {
          takeoff: (a) => a.hoppTakeoff(1), wind: (a) => a.hoppWind(1.2, 1), land3: (a) => a.hoppLand(3, 1), land7: (a) => a.hoppLand(7, 1),
          land11: (a) => a.hoppLand(11, 1), land14: (a) => a.hoppLand(14, 1), clank: (a) => a.trailerClank(6, 1), crash: (a) => a.crash(1), thud: (a) => a.thud(),
        };
        const res = {};
        for (const [k, f] of Object.entries(S)) {
          const buf = await audio._offline(2, (a) => f(a));
          const d = buf.getChannelData(0);
          let peak = 0, sum = 0;
          for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
          res[k] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
        }
        return res;
      });
      console.log('[t] snohogsound', JSON.stringify(out));
      for (const [k, v] of Object.entries(out)) check(v.peak > 0.005 && v.peak < 0.7, `snohogsound: ${k} audible, not clipping (peak ${v.peak})`);
      check(out.land14.rms > out.land3.rms * 1.5, 'snohogsound: a hard landing is louder than a soft one');
    },

    async snohogsim() {
      const r = await ev(async () => {
        const { Car } = await import('./src/actors/car.js');
        const { JUMP_HILLS } = await import('./src/world/snowhill.js');
        const H = JUMP_HILLS[0];
        const flights = [], takeoffs = [];
        const stub = { cars: [], onCarImpact() {}, onCarLanded() {}, breakProp() {}, onCarDestroyed() {}, onHonk() {}, onCarTakeoff(c) { takeoffs.push(c.x); }, onCarFlight(c, f) { flights.push({ ...f, hp: c.hp }); }, onTrailerBounce(t, i) { bounces.push(+i.toFixed(1)); } };
        const bounces = [];
        const out = [];
        // dir +1: from the west (the street) eastwards; -1: from the east (the park)
        const run = (type, v, dir, trailer) => {
          const c = new Car(type, { trailer: trailer ? {} : undefined });
          const u0 = -dir * (H.end + 14);
          c.place(H.x + H.fx * u0, H.z + H.fz * u0, Math.atan2(H.fx * dir, H.fz * dir));
          c.driver = {}; c.ctrl.park = false; stub.playerCar = c;
          c.vx = Math.sin(c.yaw) * v; c.vz = Math.cos(c.yaw) * v;
          flights.length = 0; takeoffs.length = 0; bounces.length = 0;
          let under = 0, maxPitch = 0, vEdge = null, tr = { maxPitch: 0, under: 0, bounces: 0 }, hp0 = c.hp, settle = 0;
          const dt = 1 / 60;
          for (let i = 0; i < 60 * 9; i++) {
            const u = H.along(c.x, c.z) * dir;
            // hold the speed up to the hill's foot (as a driver would), then the throttle to the edge
            const climbing = u > -H.end && u < -H.edge + 0.5;
            const want = u < -H.end ? v : 99;
            Object.assign(c.ctrl, { throttle: !settle && (climbing || c.speed < want - 0.2) ? 1 : 0, brake: settle ? 1 : 0, steer: 0, handbrake: false });
            if (u > -H.end && c.speed > v + 0.4 && !climbing) c.ctrl.throttle = 0;
            c.step(dt, stub); c.sync(dt);
            if (vEdge == null && c.air) vEdge = +c.speed.toFixed(1);
            const top = H.at(c.x, c.z);
            if (top > -1 && c.y < top - 0.05) under++;
            maxPitch = Math.max(maxPitch, Math.abs(c.tilt.rotation.x));
            if (c.trailer) {
              const t = c.trailer, tt = H.at(t.x, t.z);
              tr.maxPitch = Math.max(tr.maxPitch, Math.abs(t.pitch));
              if (tt > -1 && t.ay < tt - 0.05) tr.under++;
              if (!Number.isFinite(t.ay) || !Number.isFinite(t.pitch)) tr.nan = true;
              if (t.air) tr.airT = (tr.airT || 0) + dt;
            }
            // (past the hill and down: a second to settle, then stop - short of the street on the
            // west side: Ove's block's hedges are no part of it; braking, as a driver would)
            if (H.along(c.x, c.z) * dir > H.end + 10 && !c.air && ++settle > 60) break;
          }
          const f = flights[0];
          out.push({ type, v, dir, trailer: !!trailer, vEdge, flights: flights.length,
            air: f ? +f.t.toFixed(2) : 0, dist: f ? +f.dist.toFixed(1) : 0, apex: f ? +(f.apex - f.y0).toFixed(2) : 0, impact: f ? +f.impact.toFixed(1) : 0,
            land: f ? +(H.along(f.x, f.z) * dir).toFixed(1) : null, onHill: f?.onHill ?? null, all: flights.map((g) => [+(H.along(g.x0, g.z0) * dir).toFixed(1), +g.t.toFixed(2), +g.impact.toFixed(1)]),
            under, maxPitch: +maxPitch.toFixed(2), after: { air: c.air, y: +c.y.toFixed(2), speed: +c.speed.toFixed(1), pitch: +c.tilt.rotation.x.toFixed(2), roll: +c.tilt.rotation.z.toFixed(2), hp: +(hp0 - (flights.length ? Math.min(...flights.map((g) => g.hp)) : c.hp)).toFixed(1), past: +(H.along(c.x, c.z) * dir).toFixed(1), yawErr: +Math.abs(Math.atan2(Math.sin(c.yaw - Math.atan2(H.fx * dir, H.fz * dir)), Math.cos(c.yaw - Math.atan2(H.fx * dir, H.fz * dir)))).toFixed(2) },
            tr: c.trailer ? { maxPitch: +tr.maxPitch.toFixed(2), under: tr.under, nan: !!tr.nan, y: +c.trailer.ay.toFixed(2), air: c.trailer.air, airT: +(tr.airT || 0).toFixed(2), bounces: [...bounces] } : null });
          c.dispose?.();
        };
        for (const type of ['saab900', 'volvo240', 'audi', 'van']) for (const v of [5, 8, 11, 13, 15, 18, 22]) for (const dir of [1, -1]) run(type, v, dir, false);
        for (const v of [6, 9, 12, 15]) for (const dir of [1, -1]) run('volvo740', v, dir, true);
        return out;
      });
      for (const o of r) console.log('[t] sim', JSON.stringify(o));
      // checks
      for (const o of r) {
        const tag = `${o.type}${o.trailer ? '+släp' : ''} ${o.v} m/s ${o.dir > 0 ? 'från gatan' : 'från parken'}`;
        if (o.under > 2) fail(`${tag}: under the snow ${o.under} steps`);
        if (o.after.air) fail(`${tag}: still in the air at the end`);
        if (Math.abs(o.after.roll) > 0.08 || Math.abs(o.after.pitch) > 0.1) fail(`${tag}: not level after (pitch ${o.after.pitch}, roll ${o.after.roll})`);
        if (o.after.past < 16 && o.v >= 8) fail(`${tag}: did not get over the hill (at ${o.after.past})`);
        if (o.after.yawErr > 0.15) fail(`${tag}: turned ${o.after.yawErr} rad`);
        if (o.tr && (o.tr.nan || o.tr.under > 2)) fail(`${tag}: trailer ${JSON.stringify(o.tr)}`);
        if (o.v >= 11 && !o.flights) fail(`${tag}: never flew`);
      }
      const sweet = r.filter((o) => !o.trailer && o.v >= 11 && o.v <= 15);
      console.log('[t] sweet spot landings', JSON.stringify(sweet.map((o) => [o.type, o.v, o.dir, o.air, o.impact])));
      check(sweet.filter((o) => o.impact < 8.5).length >= sweet.length * 0.5, 'half the 11-15 m/s jumps land softly or well');
      check(r.every((o) => o.after.hp < 15), 'no jump costs more than 15 hp');
    },
  };
};
