// The cold beyond the town (features/avgrunden.md, game/cold.js): no invisible walls, nature out
// there, a cold meter, death by frost, waking up at home.
//   coldlook   screenshots: a forest track from the outer road, the cold's edge, the blizzard deep out,
//              looking back at the town (no HUD; COLDCAM=1 keeps the game's camera and HUD)
//   coldwalk   real keys: Ove walks out a forest track into the cold, dies, wakes, stands at his door;
//              the pace measured on the way (s to die at the edge / 70 m / 140 m, the time in the
//              cold, when each warning came), and the old pace run over the same path (features/
//              avgrunden2.md: 2.5 times slower)
//   colddrive  real keys: the Saab out of town along a track, dies at the wheel, wakes; the Saab is
//              home; the pace measured as in coldwalk
//   coldback   real keys: out into the cold until Ove thinks of Sonja (the toast), then straight back:
//              heeding it he makes it in alive, and thaws to nothing (WARN=0.62: the old threshold)
//   coldrate   the meter's rate standing still: 112.5 s from nothing to dead right at the edge, 28 s
//              70 m out, 12.5 s 140 m out
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

  // The pace, measured on a real-key ride: every update of the meter is recorded in the page (game
  // time, dt, d, v; the first time each of the cold's sounds plays; the Sonja toast). Each frame adds
  // rate(d) x dt, so the rate where Ove was is read off frame by frame, as s from nothing to dead
  // there: at the edge, 70 m and 140 m out (the numbers of features/avgrunden2.md). The same path is
  // run through the old pace too (45 s at the edge, the toast at 0.62, the blizzard at its worst at
  // COLD + 170): the before and after of one ride.
  const paceStart = () => ev(() => {
    const g = __game, c = window.__cold, P = Object.getPrototypeOf(c);
    const R = (window.__coldrec = { f: [], sfx: {}, toast: null, died: null });
    c.update = function (dt) {
      P.update.call(this, dt);
      if (R.died != null) return;
      R.f.push([g.time, dt, this.d, this.v]);
      if (this.warned && R.toast == null) R.toast = g.time;
      if (this.dying) R.died = g.time;
    };
    c.sfx = function (k, a) { if (R.died == null && R.sfx[k] == null) R.sfx[k] = g.time; return P.sfx.call(this, k, a); };
  });
  const OLD = { edgeSecs: 45, warn: 0.62, whiteout: 170 };
  const pace = async (label) => {
    const { R, K, B } = await ev(async () => {
      const c = window.__cold;
      delete c.update; delete c.sfx;
      const { COLDK } = await import('/src/game/cold.js'), { BOUND } = await import('/src/world/layout.js');
      return { R: window.__coldrec, K: { ...COLDK }, B: BOUND };
    });
    const f = R.f, i0 = f.findIndex((e) => e[2] > K.start);
    if (i0 < 1 || R.died == null) { fail(`${label}: no ride into the cold to measure`); return null; }
    const sst = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    // s from nothing to dead where he was: [m beyond the edge, s], one per frame out there
    const secs = [];
    for (let i = i0; i < f.length - 1; i++) { const dv = f[i][3] - f[i - 1][3]; if (dv > 0) secs.push([f[i][2] - K.start, f[i][1] / dv]); }
    const secsAt = (D) => {
      if (D <= secs[0][0]) return { s: secs[0][1], at: secs[0][0] };
      for (let k = 1; k < secs.length; k++) if (secs[k][0] >= D) {
        const [d0, s0] = secs[k - 1], [d1, s1] = secs[k], u = d1 > d0 ? (D - d0) / (d1 - d0) : 0;
        return { s: s0 + (s1 - s0) * u, at: D };
      }
      return null;
    };
    // when each warning first came, for a pace: v(i) the meter, warn the toast, white the blizzard's end
    const warnings = (vAt, warn, white, until) => {
      const first = {}, mark = (k, t) => { if (first[k] == null) first[k] = t; };
      for (let i = i0; i < until; i++) {
        const v = vAt(i), t = f[i][0], d = f[i][2];
        if (sst(0.04, 1, v) * 1.05 > 0.15) mark('frost', t);
        if (sst(0.06, 0.55, v) > 0.35) mark('shiver', t);
        if (v > warn) mark('toast', t);
        if (v > 0.72) mark('heart', t);
        if (v >= 0.75) mark('vänd om', t);
        if (sst(B - 26, white, d) > 0.5) mark('blizzard', t);
      }
      return first;
    };
    const iDie = f.length - 1, tIn = f[i0 - 1][0], tDie = R.died;
    // the old pace over the same path (until its own death)
    const vOld = [];
    let vo = 0, iDieOld = null;
    for (let i = 0; i < f.length; i++) {
      if (i >= i0 && iDieOld == null) { vo += (1 / OLD.edgeSecs) * (1 + Math.max(0, f[i][2] - K.start) / K.scale) ** 2 * f[i][1]; if (vo >= 1) { vo = 1; iDieOld = i; } }
      vOld.push(i < i0 ? 0 : vo);
    }
    if (iDieOld == null) { fail(`${label}: the old pace would not have killed him on this path`); return null; }
    const now = warnings((i) => f[i][3], K.warn, K.whiteout, iDie + 1);
    const old = warnings((i) => vOld[i], OLD.warn, K.start + OLD.whiteout, iDieOld + 1);
    const tDieOld = f[iDieOld][0];
    const res = {
      inCold: +(tDie - tIn).toFixed(1), inColdOld: +(tDieOld - tIn).toFixed(1),
      beyond: +(f[iDie][2] - K.start).toFixed(0), beyondOld: +(f[iDieOld][2] - K.start).toFixed(0),
      edge: secsAt(0), at70: secsAt(70), at140: secsAt(140),
      lead: Object.fromEntries(Object.keys({ ...now, ...old }).map((k) => [k, [now[k] != null ? +(tDie - now[k]).toFixed(1) : null, old[k] != null ? +(tDieOld - old[k]).toFixed(1) : null]])),
      zoneAtDeath: [+sst(B - 26, K.whiteout, f[iDie][2]).toFixed(2), +sst(B - 26, K.start + OLD.whiteout, f[iDieOld][2]).toFixed(2)],
      sounds: Object.fromEntries(Object.entries(R.sfx).map(([k, t]) => [k, +(tDie - t).toFixed(1)])),
      toast: R.toast != null ? +(tDie - R.toast).toFixed(1) : null,
    };
    const S = (x) => (x ? `${x.s.toFixed(1)} s${x.at > 0.5 && x.at !== 70 && x.at !== 140 ? ` (at +${x.at.toFixed(1)} m)` : ''}` : '-');
    console.log(`[t] ${label} pace: ${res.inCold} s in the cold, dead ${res.beyond} m beyond the edge (the old pace on the same path: ${res.inColdOld} s, ${res.beyondOld} m)`);
    console.log(`[t] ${label} s to die from nothing where he was: edge ${S(res.edge)}, 70 m ${S(res.at70)}, 140 m ${S(res.at140)}`);
    console.log(`[t] ${label} warnings, s before death [now, old pace]: ${Object.entries(res.lead).map(([k, [a, b]]) => `${k} ${a ?? '-'} / ${b ?? '-'}`).join(', ')}; blizzard at death ${res.zoneAtDeath.join(' / ')}`);
    console.log(`[t] ${label} sounds first heard, s before death: ${JSON.stringify(res.sounds)}; the toast ${res.toast}`);
    console.log(`[t] ${label} pacejson`, JSON.stringify(res));
    check(res.edge && Math.abs(res.edge.s - 112.5) < 4, `${label}: ~112 s to die at the edge (${S(res.edge)})`);
    check(res.at70 && Math.abs(res.at70.s - 112.5 / 4) < 1, `${label}: ~28 s 70 m out (${S(res.at70)})`);
    check(res.at140 && Math.abs(res.at140.s - 112.5 / 9) < 0.6, `${label}: ~12.5 s 140 m out (${S(res.at140)})`);
    check(res.inCold > res.inColdOld * 1.4, `${label}: much longer in the cold than at the old pace (${res.inCold} s, was ${res.inColdOld} s)`);
    // (the meter's warnings follow it: the toast and the heart came when the meter said)
    check(res.toast != null && Math.abs(res.toast - res.lead.toast[0]) < 0.1, `${label}: the Sonja toast at ${K.warn} (${res.toast} s before)`);
    check(res.sounds.heart != null && Math.abs(res.sounds.heart - res.lead.heart[0]) < 0.1, `${label}: the heart from 0.72 (${res.sounds.heart} s before)`);
    return res;
  };

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
      await paceStart();
      const r = await ride(['KeyW', 'ShiftLeft'], 150, 'coldwalk');
      const p = await pace('coldwalk');
      check(r.at && r.at.d > 460 && r.at.d < 540, `coldwalk: died out in the cold (d ${r.at?.d})`);
      check(r.sawShiver > 0.5, `coldwalk: he shivered (${r.sawShiver})`);
      if (p) {
        check(p.inCold > 20 && p.inCold < 32, `coldwalk: ~25 s in the cold, brisk walking straight out (${p.inCold} s)`);
        // (walking on, the warnings come earlier by less than 2.5 times: the meter rises faster the
        // further out he gets; the toast moved to before half, so it comes twice as early)
        const later = Object.entries(p.lead).filter(([k, [a, b]]) => !(a >= b * (k === 'toast' ? 1.8 : 1.25)));
        check(!later.length, `coldwalk: every warning earlier than at the old pace (${Object.entries(p.lead).map(([k, [a, b]]) => `${k} ${a} s, was ${b}`).join('; ')})`);
      }
      await atDoor('coldwalk', r);
    },

    async colddrive() {
      // The Saab at the north track's mouth, Ove in it, W held: out of town and on.
      await ev((t) => { const g = __game, c = g.named.saab; c.place(t.x, t.z + 8, t.yaw); g.enterCar(c); g.cam.yaw = t.yaw; g.cam.snapNext = true; }, TRACK_N);
      await frames(20);
      await shot('colddrive_0');
      await paceStart();
      const r = await ride(['KeyW'], 90, 'colddrive');
      const p = await pace('colddrive');
      check(r.at && r.at.car, `colddrive: died at the wheel (${r.at?.car})`);
      if (p) check(p.inCold > 8 && p.inCold < 15, `colddrive: ~10 s in the cold, flat out (${p.inCold} s)`);
      await atDoor('colddrive', r);
      const saab = await ev(() => { const c = __game.named.saab; return { d: Math.hypot(c.x - c.home.x, c.z - c.home.z), dead: c.dead }; });
      check(saab.d < 1 && !saab.dead, `colddrive: the Saab is back home (${saab.d.toFixed(1)} m)`);
    },

    async coldback() {
      if (process.env.WARN) await ev((w) => import('/src/game/cold.js').then((m) => { m.COLDK.warn = w; }), +process.env.WARN);
      const K = await ev(() => import('/src/game/cold.js').then((m) => ({ ...m.COLDK })));
      await ev((t) => { const g = __game; g.player.teleport(t.x, -330, t.yaw); g.cam.yaw = t.yaw; g.cam.snapNext = true; }, TRACK_N);
      await frames(10);
      // out at a brisk pace until Ove thinks of Sonja (the toast: she would have told him to turn)...
      const keys = ['KeyW', 'ShiftLeft'];
      for (const k of keys) await page.keyboard.down(k);
      try { await until(() => window.__cold.warned || window.__cold.dying, 120000); } finally { for (const k of keys) await page.keyboard.up(k); }
      const s1 = await state();
      console.log('[t] coldback out', JSON.stringify(s1));
      check(s1.dying == null && s1.v > K.warn && s1.meter, `coldback: the meter rose to the toast out there (${s1.v} at ${(s1.d - K.start).toFixed(0)} m)`);
      await shot('coldback_out');
      // ...then turned round and straight back in (S walks towards the camera: turn the camera instead)
      await face(0);
      let peak = s1.v, s2 = s1;
      for (const k of keys) await page.keyboard.down(k);
      try {
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
          await sleep(100);
          s2 = await state();
          peak = Math.max(peak, s2.v);
          if (s2.dying != null || s2.d < K.start - 4) break;
        }
      } finally { for (const k of keys) await page.keyboard.up(k); }
      console.log('[t] coldback in', JSON.stringify(s2), 'peak', peak);
      check(s2.dying == null && s2.d < K.start && s2.v <= peak, `coldback: heeding the toast, he made it back in alive (the meter peaked at ${peak})`);
      await shot('coldback_in');
      await sleep(Math.ceil(s2.v * K.thaw + 2) * 1000);
      const s3 = await state();
      check(s3.v === 0 && !s3.meter, `coldback: warm again and the meter gone (${s3.v})`);
      check(s3.dying == null && (await ev(() => window.__cold.deaths)) === 0, 'coldback: never died');
    },

    async coldrate() {
      // Standing still right at the edge: the meter's rate over 4 s, x 112.5 = 1; then 70 and 140 m out.
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
      check(Math.abs(1 / r0 - 112.5) < 4, `coldrate: ~112 s at the edge (${(1 / r0).toFixed(1)})`);
      check(Math.abs(1 / r70 - 112.5 / 4) < 1 && Math.abs(1 / r140 - 112.5 / 9) < 0.6, `coldrate: faster further out: ~28 s 70 m out, ~12.5 s 140 m out (${(1 / r70).toFixed(1)}, ${(1 / r140).toFixed(1)})`);
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

    // The waking scene, beat by beat (held with __wake.pauseAt for a screenshot each), then on to the
    // end: at his door. WAKECAT=1: on day 5 (the cat lives at Ove's: it sits on the bed). WAKELINE=n:
    // that line of WAKE.
    async coldbed() {
      if (process.env.WAKECAT) await ev(() => { const g = __game; g.missions.index = 4; g.storyWorld(); });
      // straight to the death where he stands, out at the cold's edge
      await ev(() => { const g = __game; g.player.teleport(-120, -350, Math.PI); g.cam.yaw = Math.PI; g.cam.snapNext = true; });
      await frames(10);
      if (process.env.WAKELINE) await ev((n) => import('/src/game/script.js').then((m) => { window.__wakeLine = m.WAKE[n]; }), +process.env.WAKELINE);
      await ev(() => { window.__cold.v = 1; });
      await until(() => window.__wake && window.__wake.built, 30000);
      if (process.env.WAKELINE) await ev(() => { window.__wake.line = window.__wakeLine; });
      const beats = [[0.9, 'room'], [2.6, 'asleep'], [3.15, 'gasp'], [4.2, 'across'], [6.2, 'line']];
      for (const [t, n] of beats) {
        await ev((t) => { window.__wake.pauseAt = t; }, t);
        await until((t) => window.__wake && window.__wake.t >= t - 1e-3, 30000, t);
        await frames(12);
        await shot('wake_' + n);
      }
      const info = await ev(() => ({ line: window.__wake.line, ms: window.__wake.buildMs, cat: !!window.__wake.cat, oveShown: __game.player.root.visible, offstage: __game.player.offstage, pane: window.__lm && (async () => 0)() && null }));
      console.log('[t] coldbed', JSON.stringify(info));
      check(!info.oveShown && info.offstage, 'coldbed: the real Ove off the stage during the scene');
      await ev(() => { window.__wake.pauseAt = null; });
      const t0 = Date.now();
      await until(() => !window.__cold.dying, 40000);
      const secs = (Date.now() - t0) / 1000;
      const d = await ev(async () => {
        const g = __game, s = window.__lm('oveStart'), p = g.player, { interiors } = await import('/src/world/data.js');
        return { d: Math.hypot(p.x - s.x, p.z - s.z), shown: p.root.visible, offstage: !!p.offstage, pane: interiors.ove.paneMesh?.visible, set: !!g.scene.getObjectByName('interior:ove'), letterbox: document.getElementById('letterbox').classList.contains('on'), curtain: document.getElementById('curtain').classList.contains('on'), dialog: document.getElementById('dialog').classList.contains('show'), inDialog: g.inDialog, cine: !!g.cam.cine };
      });
      console.log('[t] coldbed after', secs.toFixed(1), 's', JSON.stringify(d));
      check(d.d < 2.5 && d.shown && !d.offstage && d.pane === true && !d.set && !d.letterbox && !d.curtain && !d.dialog && !d.inDialog && !d.cine, 'coldbed: out at his door, nothing of the scene left');
      await frames(20);
      await shot('wake_door');
      // never the same line twice running
      const rep = await ev(async () => { const { pickWake } = await import('/src/game/waking.js'); let prev = null, same = 0; const seen = new Set(); for (let i = 0; i < 200; i++) { const l = pickWake(); if (l === prev) same++; prev = l; seen.add(l); } return { same, seen: seen.size }; });
      check(rep.same === 0 && rep.seen === 5, `coldbed: 200 wakings, never the same line twice running, all five used (${JSON.stringify(rep)})`);
    },

    // Skipping the waking scene: Space a second into it, out at the door within ~2.5 s.
    async coldbedskip() {
      await ev(() => { const g = __game; g.player.teleport(-120, -350, Math.PI); window.__cold.v = 1; });
      await until(() => window.__wake && window.__wake.t > 1.6, 30000);
      const t0 = Date.now();
      await tap('Space');
      await until(() => !window.__cold.dying, 20000);
      const secs = (Date.now() - t0) / 1000;
      const d = await ev(() => ({ inDialog: __game.inDialog, dialog: document.getElementById('dialog').classList.contains('show'), set: !!__game.scene.getObjectByName('interior:ove') }));
      console.log('[t] coldbedskip out after', secs.toFixed(1), 's', JSON.stringify(d));
      check(secs < 3 && !d.set, `coldbedskip: out ${secs.toFixed(1)} s after the skip`);
      await sleep(800);
      const d2 = await ev(() => ({ dialog: document.getElementById('dialog').classList.contains('show') }));
      check(!d2.dialog, 'coldbedskip: no dialogue box left over');
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
