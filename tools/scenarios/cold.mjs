// The cold beyond the town (features/avgrunden.md, game/cold.js): no invisible walls, nature out
// there, a cold meter, death by frost, waking up at home.
//   coldlook   screenshots: a forest track from the outer road, the cold's edge, the blizzard deep out,
//              looking back at the town (no HUD; COLDCAM=1 keeps the game's camera and HUD)
//   coldwalk   real keys: Ove walks out a forest track into the cold, dies, wakes, stands at his door
//   colddrive  real keys: the Saab out of town along a track, dies at the wheel, wakes; the Saab is home
//   coldback   real keys: out into the cold and back in: the meter rises, then thaws to nothing
//   coldrate   the meter's rate: 45 s from nothing to dead right at the edge, faster further out
//   coldmission  a day's mission running when he dies: failed, its banner after he wakes, E retries
//   coldwall   the traffic, the pedestrians and a neighbour still stop where the walls stood
//   coldsound  the cold's sounds rendered offline (nothing played): levels, no clipping
// Checks that fail are pushed to the run's errors ('N errors').
export default ({ page, ev, shot, frames, sleep, hold, tap, until, errors }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg) => { if (!ok) fail(msg); else console.log('[t] ok', msg); };
  const cam = (at, look, fov = 55) => ev((at, look, fov) => {
    const g = window.__game;
    g.cam.update = function () {};
    const c = g.cam.cam;
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    if (!window.__coldcam) document.getElementById('hud').style.display = 'none';
  }, at, look, fov);
  const state = () => ev(() => {
    const g = __game, c = window.__cold, p = g.player, f = g.focus();
    return { x: +f.x.toFixed(1), z: +f.z.toFixed(1), y: +f.y.toFixed(2), v: +c.v.toFixed(3), d: +c.d.toFixed(1), zone: +c.zone.toFixed(2), dying: c.dying ? +c.dying.t.toFixed(2) : null, state: p.state, car: g.playerCar?.name || g.playerCar?.kind || null, banner: document.querySelector('#banner.show .banner-main')?.textContent || '', curtain: document.getElementById('curtain').classList.contains('on'), meter: document.getElementById('cold').classList.contains('show'), mission: g.missions.state, inDialog: g.inDialog };
  });
  // Face Ove (or his car) along yaw with the camera behind.
  const face = (yaw) => ev((yaw) => { const g = __game; if (g.playerCar) { const c = g.playerCar; c.place(c.x, c.z, yaw); } else g.player.yaw = yaw; g.cam.yaw = yaw; g.cam.snapNext = true; }, yaw);
  // Wait (real time) until Ove has died and woken up again; logs the meter on the way. -> { tDie, at, woke }
  const ride = async (keys, maxS, label) => {
    const t0 = Date.now();
    let tDie = null, at = null, last = 0, sawBanner = false, sawFrost = 0, sawShiver = 0, this_cold = false, this_top = false;
    for (const k of keys) await page.keyboard.down(k);
    try {
      while ((Date.now() - t0) / 1000 < maxS) {
        await sleep(250);
        const s = await state();
        const extra = await ev(() => ({ frost: +getComputedStyle(document.getElementById('frost')).opacity, shiver: +__game.player.anim.shiver.toFixed(2) }));
        sawFrost = Math.max(sawFrost, extra.frost); sawShiver = Math.max(sawShiver, extra.shiver);
        if ((Date.now() - t0) / 1000 - last > 2.5) { last = (Date.now() - t0) / 1000; console.log(`[t] ${label} ${last.toFixed(1)}s`, JSON.stringify(s), JSON.stringify(extra)); }
        if (s.dying != null && tDie == null) {
          tDie = (Date.now() - t0) / 1000; at = s;
          console.log(`[t] ${label} died after ${tDie.toFixed(1)} s at d = ${s.d}`, JSON.stringify(s));
          for (const k of keys) await page.keyboard.up(k);
          keys = [];
        }
        if (s.v > 0.45 && s.dying == null && !this_cold) { this_cold = true; await shot(`${label}_cold`); }
        if (s.dying != null && s.dying > 1.2 && s.dying < 1.6) await shot(`${label}_frozen`);
        if (s.dying != null && s.dying > 2.6 && s.dying < 3.4 && !this_top) { this_top = true; await shot(`${label}_fallen`); }
        if (s.banner === 'Ove dog av frost' && !sawBanner) { sawBanner = true; await shot(`${label}_dead`); }
        if (tDie != null && s.dying == null && !s.inDialog) return { tDie, at, woke: s, sawBanner, sawFrost, sawShiver };
      }
    } finally { for (const k of keys) await page.keyboard.up(k); }
    return { tDie, at, woke: null, sawBanner, sawFrost, sawShiver };
  };
  const atDoor = async (label, r) => {
    const d = await ev(() => { const g = __game, s = window.__lm('oveStart'), p = g.player; return { d: Math.hypot(p.x - s.x, p.z - s.z), state: p.state, car: !!g.playerCar, curtain: document.getElementById('curtain').classList.contains('on'), v: window.__cold.v, frost: +getComputedStyle(document.getElementById('frost')).opacity, topple: __game.player.topple }; });
    console.log(`[t] ${label} after waking`, JSON.stringify(d));
    check(r.tDie != null, `${label}: Ove died of frost`);
    check(r.sawBanner, `${label}: "Ove dog av frost" was shown`);
    check(r.sawFrost > 0.5, `${label}: frost on the picture (${r.sawFrost})`);
    check(r.woke, `${label}: woke up again`);
    check(d.d < 2.5 && d.state === 'normal' && !d.car && !d.curtain && d.v === 0 && d.frost === 0 && d.topple === 0, `${label}: at his door, on his feet, warm (d ${d.d.toFixed(2)} state ${d.state} curtain ${d.curtain} v ${d.v})`);
    await frames(20);
    await shot(`${label}_door`);
  };
  // A spot on a forest track's mouth: the north one (x = -120), just beyond the outer road.
  const TRACK_N = { x: -120, z: -296, yaw: Math.PI };

  return {
    async coldlook() {
      if (process.env.COLDCAM) await ev(() => { window.__coldcam = true; });
      await ev(() => { const g = __game; g.player.teleport(-118, -300, Math.PI); });
      await frames(30);
      const views = [
        ['track', [-117, 2.0, -276], [-120, 2.5, -380]],
        ['belt', [-90, 2.2, -330], [-90, 4, -450]],
        ['edge', [-120, 3.5, -352], [-120, 6, -470]],
        ['out', [-140, 0, -430], [-140, 0, -560]],
        ['back', [-130, 0, -420], [-120, 0, -250]],
        ['east', [345, 0, -120], [460, 0, -120]],
        ['high', [-200, 60, -520], [-60, 0, -330]],
      ];
      for (const [n, at, look] of views) {
        // (heights over the ground there)
        const g0 = await ev((at) => __game.groundAt(at[0], at[2]), at);
        const gl = await ev((l) => __game.groundAt(l[0], l[2]), look);
        const a = [at[0], at[1] || g0 + 1.8, at[2]], l = [look[0], look[1] || gl + 1.6, look[2]];
        if (n === 'out' || n === 'back') await ev((a) => { __game.player.teleport(a[0], a[2] + 4, 0); }, a);
        await cam(a, l, 55);
        await frames(40);
        await shot('cold_' + n);
      }
      console.log('[t] ground', JSON.stringify(await ev(() => [300, 330, 345, 360, 400, 450, 500, 600].map((z) => +__game.groundAt(-120, -z).toFixed(2)))));
      console.log('[t] stats', JSON.stringify(await ev(() => window.__stats())));
    },

    async coldwalk() {
      // On foot out the north track: W held, Shift (brisk) for the first part, and on into the cold.
      await ev((t) => { const g = __game; g.player.teleport(t.x, t.z, t.yaw); g.cam.yaw = t.yaw; g.cam.pitch = 0.16; g.cam.snapNext = true; }, TRACK_N);
      await frames(10);
      await shot('coldwalk_0');
      const r = await ride(['KeyW', 'ShiftLeft'], 120, 'coldwalk');
      check(r.at && r.at.d > 344 && r.at.d < 460, `coldwalk: died out in the cold (d ${r.at?.d})`);
      check(r.sawShiver > 0.5, `coldwalk: he shivered (${r.sawShiver})`);
      await atDoor('coldwalk', r);
    },

    async colddrive() {
      // The Saab at the north track's mouth, Ove in it, W held: out of town and on.
      await ev((t) => { const g = __game, c = g.named.saab; c.place(t.x, t.z + 8, t.yaw); g.enterCar(c); g.cam.yaw = t.yaw; g.cam.snapNext = true; }, TRACK_N);
      await frames(20);
      await shot('colddrive_0');
      const r = await ride(['KeyW'], 90, 'colddrive');
      check(r.at && r.at.car, `colddrive: died at the wheel (${r.at?.car})`);
      await atDoor('colddrive', r);
      const saab = await ev(() => { const c = __game.named.saab; return { d: Math.hypot(c.x - c.home.x, c.z - c.home.z), dead: c.dead }; });
      check(saab.d < 1 && !saab.dead, `colddrive: the Saab is back home (${saab.d.toFixed(1)} m)`);
    },

    async coldback() {
      await ev((t) => { const g = __game; g.player.teleport(t.x, -330, t.yaw); g.cam.yaw = t.yaw; g.cam.snapNext = true; }, TRACK_N);
      await frames(10);
      // out for ~9 s at a brisk pace...
      await hold(['KeyW', 'ShiftLeft'], 9000);
      const s1 = await state();
      console.log('[t] coldback out', JSON.stringify(s1));
      check(s1.v > 0.08 && s1.meter, `coldback: the meter rose out there (${s1.v})`);
      await shot('coldback_out');
      // ...then turned round and back in (S walks towards the camera: turn the camera instead)
      await face(0);
      await hold(['KeyW', 'ShiftLeft'], 12000);
      const s2 = await state();
      console.log('[t] coldback in', JSON.stringify(s2));
      check(s2.d < 344 && s2.v < s1.v, `coldback: back inside and thawing (${s1.v} -> ${s2.v})`);
      await shot('coldback_in');
      await sleep(Math.ceil(s2.v * 18 + 2) * 1000);
      const s3 = await state();
      check(s3.v === 0 && !s3.meter, `coldback: warm again and the meter gone (${s3.v})`);
      check(s3.dying == null, 'coldback: never died');
    },

    async coldrate() {
      // Standing still right at the edge: the meter's rate over 6 s, x 45 = 1; then 70 and 140 m out.
      const rateAt = async (d) => {
        await ev((d) => { const g = __game; g.player.teleport(-120, -d, Math.PI); window.__cold.v = 0; }, d);
        await frames(5);
        const a = await ev(() => [window.__cold.v, __game.time]);
        await sleep(4000);
        const b = await ev(() => [window.__cold.v, __game.time]);
        return (b[0] - a[0]) / (b[1] - a[1]);
      };
      const r0 = await rateAt(344.5), r70 = await rateAt(414.5), r140 = await rateAt(484.5);
      console.log('[t] coldrate secs to die', (1 / r0).toFixed(1), (1 / r70).toFixed(1), (1 / r140).toFixed(1));
      check(Math.abs(1 / r0 - 45) < 2.5, `coldrate: ~45 s at the edge (${(1 / r0).toFixed(1)})`);
      check(1 / r70 < 14 && 1 / r140 < 7, 'coldrate: faster further out');
      const inside = await rateAt(343);
      check(inside <= 0, 'coldrate: nothing just inside the edge');
      await ev(() => { window.__cold.v = 0; });
    },

    async coldmission() {
      // Day 2 (Sjukhuset) under way, the Saab, the drive: straight out of town instead. Dies, wakes,
      // the banner; E: the day again from its start.
      await ev(() => { const g = __game; g.missions.index = 1; g.missions.gateOpen = true; });
      await ev(() => { const g = __game, n = g.npc(g.missions.offered.giver); g.player.teleport(n.x + Math.sin(n.yaw) * 2, n.z + Math.cos(n.yaw) * 2); });
      await ev(() => __game.missions.begin());
      await until(() => __game.missions.state === 'running', 60000);
      await ev(() => { const g = __game, c = g.named.saab; c.place(-120, -288, Math.PI); g.enterCar(c); g.cam.yaw = Math.PI; g.cam.snapNext = true; });
      await frames(20);
      const r = await ride(['KeyW'], 90, 'coldmission');
      check(r.tDie != null && r.woke, 'coldmission: died and woke');
      const s = await state();
      check(s.mission === 'failed' && s.banner === 'UPPDRAG MISSLYCKADES', `coldmission: the failure shown after waking (${s.mission} / ${s.banner})`);
      await shot('coldmission_failed');
      await sleep(1200);
      await tap('KeyE');
      await until(() => __game.missions.state === 'running', 20000);
      check(true, 'coldmission: E took the day up again');
      await frames(30);
      await shot('coldmission_retry');
    },

    async coldwall() {
      // A traffic car driven straight out of town (its AI's controls held: full throttle, no steering),
      // a pedestrian and a neighbour walking out past the old wall: all stop at it. Ove walks on.
      const r = await ev(async () => {
        const g = __game, { BOUND } = await import('/src/world/layout.js');
        const car = g.cars.find((c) => c.traffic && c.ai && c.driverBust);
        car.place(-120, -296, Math.PI);
        const ai = car.ai;
        ai.update = () => { car.ctrl.throttle = 1; car.ctrl.brake = 0; car.ctrl.steer = 0; car.ctrl.handbrake = false; car.ctrl.park = false; };
        const ped = g.peds[0], pc = ped.char, n = g.npc('anders');
        ped.update = () => { pc.wishX = 0; pc.wishZ = -3; };
        pc.teleport(-125, -300); n.teleport(-115, -300);
        g.walkNpc(n, [{ x: -115, z: -360 }], { speed: 3, stay: true });
        const t0 = g.time, log = [];
        await new Promise((res) => { const fn = () => { if (log.length < 40 && Math.round((g.time - t0) * 4) > log.length) log.push([+car.z.toFixed(1), +pc.z.toFixed(1), +n.z.toFixed(1)]); if (g.time - t0 > 9) { g.offFrame(fn); res(); } }; g.onFrame(fn); });
        return { car: Math.abs(car.z), ped: Math.abs(pc.z), n: Math.abs(n.z), B: BOUND, log: log.filter((_, i) => i % 6 === 0) };
      });
      console.log('[t] coldwall', JSON.stringify(r));
      check(r.car > 306 && r.car <= r.B, `coldwall: the car drove to the old wall and stopped there (${r.car.toFixed(1)})`);
      check(r.ped > 310 && r.ped <= r.B, `coldwall: the pedestrian stopped at it (${r.ped.toFixed(1)})`);
      check(r.n > 310 && r.n <= r.B, `coldwall: Anders stopped at it (${r.n.toFixed(1)})`);
      await ev((t) => { const g = __game; g.player.teleport(t.x - 4, -305, t.yaw); g.cam.yaw = t.yaw; g.cam.snapNext = true; }, TRACK_N);
      await hold(['KeyW'], 5000);
      const p = await state();
      check(p.d > 316, `coldwall: Ove walks on past it (${p.d})`);
      await shot('coldwall');
    },

    // A/B with the cars and the people hidden (their counts vary run to run): draw calls and
    // triangles per pass and renderFrame's CPU at the rendering poses, the outer road looking out and
    // a spot out on the hills. Runs on an old checkout too (copy this file into its tools/scenarios).
    async coldperf() {
      const POSES = {
        start: [[-12.5, 1.7, 4.2], [8, 1.5, 4.0]],
        lot_e: [[-30, 1.7, -22], [30, 1.0, -24]],
        street_long: [[-250, 1.7, -37.25], [250, 1.6, -37.25]],
        centrum: [[-82, 1.7, -78], [-82, 3, -110]],
        drone_nw: [[-45, 28, -45], [0, 0, 0]],
        aerial: [[0, 420, 260], [0, 0, 0], 50],
        ring_out: [[-117, 1.9, -276], [-120, 2.5, -380]],
        ring_in: [[-120, 1.9, -284], [-120, 1.5, -150]],
        hills: [[-130, 9.5, -405], [-130, 12, -560]],
      };
      await ev(() => {
        const g = window.__game;
        for (const c of g.cars) if (c.root) c.root.visible = false;
        g.syncAll = function () {};
        for (const p of g.peds || []) if (p.char?.root) p.char.root.visible = false;
        for (const n of Object.values(g.npcs || {})) if (n.root) n.root.visible = false;
        if (g.player?.root) g.player.root.visible = false;
      });
      const out = {};
      for (const [n, [at, look, fov]] of Object.entries(POSES)) {
        await cam(at, look, fov || 55);
        await frames(40);
        const r = await ev(async () => {
          const gfx = await import('/src/gfx.js'), S = gfx.gfxStats;
          const P = { shadow: [0, 0], ao: [0, 0], main: [0, 0] }, ms = [];
          let k = 0;
          await new Promise((res) => { const tick = () => { for (const p of ['shadow', 'ao', 'main']) { P[p][0] += S.pass[p][0]; P[p][1] += S.pass[p][1]; } ms.push(S.last ?? S.ms); if (++k >= 90) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
          ms.sort((a, b) => a - b);
          return { calls: P.shadow.map((_, i) => 0) && [Math.round(P.shadow[0] / k), Math.round(P.ao[0] / k), Math.round(P.main[0] / k)], tris: [+(P.shadow[1] / k / 1e6).toFixed(3), +(P.ao[1] / k / 1e6).toFixed(3), +(P.main[1] / k / 1e6).toFixed(3)], rf: +ms[Math.floor(ms.length / 2)].toFixed(2) };
        });
        out[n] = r;
        console.log(`[t] coldperf ${n.padEnd(12)} calls sh/ao/main ${r.calls.join('/')}  Mtris ${r.tris.join('/')}  rf p50 ${r.rf} ms`);
      }
      console.log('[t] coldperfjson', JSON.stringify(out));
    },

    async coldsound() {
      const out = await ev(async () => {
        const { audio } = await import('/src/audio.js');
        const { SOUNDS } = await import('/src/game/cold.js');
        const res = {};
        for (const k of Object.keys(SOUNDS)) {
          const buf = await audio._offline(k === 'wind' ? 4 : 2.5, (a) => {
            const w = a.synth((A) => SOUNDS[k](A, 0.9));
            if (k === 'wind') w.set(0.18, 0.9, 1);
          });
          const d = buf.getChannelData(0);
          let peak = 0, sum = 0;
          for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
          res[k] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
        }
        return res;
      });
      console.log('[t] coldsound', JSON.stringify(out));
      for (const [k, v] of Object.entries(out)) check(v.peak > 0.005 && v.peak < 0.6, `coldsound: ${k} audible, not clipping (peak ${v.peak})`);
    },
  };
};
