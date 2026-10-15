// Tracks in the snow (feature snöspår, game/tracks.js): footprints where people walk on snow, ruts
// where wheels roll on it, none on asphalt or paving, gone at a new day.
//   snospar      checks with real keys: Ove walks across a lawn (a print per step, under his feet,
//                alternating, on snow only), runs, jumps; drives the Saab over the field (four ruts
//                along the wheels' paths, none on the road), reverses, slides; a new day clears all
//   sposlook     close-ups: prints and ruts in the low sun, from the chase camera and from above
//   sposmore     the special cases: up and over the hoppbacke, a trailer, the snow tractor, Rune's
//                wheelchair rolling free, Ove out in the cold beyond the town
//   sposperf     what they cost (QUERY='&gputime'): draw calls, renderFrame and GPU time with every
//                ring full, the tracks shown and hidden in turn; tracks.update's own time
// Env: SHOTS=0 skips the screenshots of `snospar`.
export default ({ page, ev, shot, frames, sleep, hold, tap, until, errors }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg) => { if (!ok) fail(msg); else console.log('[t] ok', msg); };
  const SHOTS = process.env.SHOTS !== '0';
  const stats = () => ev(() => __tracks.stats());
  // A free spot on snow with `len` m of open snow ahead along yaw (searched round (x, z)).
  const snowRun = (x, z, len, yaw0 = 0) => ev(async ({ x, z, len, yaw0 }) => {
    const { surfaceAt } = await import('./src/world/surface.js');
    const { groundAt, groundInfo, segmentBlocked } = await import('./src/world/collision.js');
    const g = __game;
    const ok = (px, pz) => surfaceAt(px, pz) === 'snow' && (groundAt(px, pz, 0.3, 0.45), !groundInfo.block) && g.spotFree(px, pz);
    for (let r = 0; r < 60; r += 1.5) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
        for (const dy of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const yaw = yaw0 + dy, fx = Math.sin(yaw), fz = Math.cos(yaw);
          let good = true;
          for (let s = 0; s <= len && good; s += 0.5) good = ok(px + fx * s, pz + fz * s) && ok(px + fx * s + fz * 0.8, pz + fz * s - fx * 0.8) && ok(px + fx * s - fz * 0.8, pz + fz * s + fx * 0.8);
          if (good && segmentBlocked(px, pz, px + fx * len, pz + fz * len, 0.6) < 0) return { x: px, z: pz, yaw };
        }
      }
    }
    return null;
  }, { x, z, len, yaw0 });
  const onFoot = (s) => ev((s) => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    g.player.teleport(s.x, s.z, s.yaw);
    g.cam.yaw = s.yaw; g.cam.pitch = 0.25; g.cam.snapNext = true;
  }, s);
  // A camera of our own: at `at`, looking at `look` (world).
  const camAt = (at, look, fov = 50) => ev(({ at, look, fov }) => {
    const g = __game, cam = g.cam.cam;
    g.cam.update = function () {};
    cam.position.set(...at); cam.lookAt(...look); cam.fov = fov; cam.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
  }, { at, look, fov });
  const camFree = () => ev(() => { const g = __game; delete g.cam.update; document.getElementById('hud').style.display = ''; g.cam.snapNext = true; });

  return {
    async snospar() {
      await frames(20);
      // ------------------------------------------------------------------ on foot
      const lm = await ev(() => window.__lm('oveStart'));
      const s = await snowRun(lm.x, lm.z, 9);
      check(!!s, 'a lawn near Ove\'s start with 9 m of snow ahead: ' + JSON.stringify(s));
      if (!s) return;
      await onFoot(s);
      await frames(10);
      const st0 = await stats();
      await hold(['KeyW'], 2200);
      await frames(20);
      const w = await ev((s) => {
        const g = __game, p = g.player, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        const list = __tracks.feetList(0);
        const walked = (p.x - s.x) * fx + (p.z - s.z) * fz;
        // each print: how far along the way and how far off the line Ove walked
        const pr = list.map((f) => ({ along: (f.x - s.x) * fx + (f.z - s.z) * fz, off: (f.x - s.x) * fz - (f.z - s.z) * fx, side: f.side, yawErr: Math.abs(Math.atan2(Math.sin(f.yaw - s.yaw), Math.cos(f.yaw - s.yaw))), L: f.L, W: f.W, depth: f.depth, style: f.style, y: f.y }));
        return { walked, n: list.length, pr, speed: p.speed };
      }, s);
      console.log('[t] walk', JSON.stringify({ walked: w.walked.toFixed(2), n: w.n, first: w.pr.slice(0, 4) }));
      const steps = w.walked / 0.9;
      check(w.n >= steps * 0.7 && w.n <= steps * 1.4 + 2, `about a print per step: ${w.n} prints over ${w.walked.toFixed(1)} m`);
      check(w.pr.every((f) => Math.abs(f.off) < 0.35), 'every print within 0.35 m of the line walked: ' + w.pr.map((f) => f.off.toFixed(2)).join(' '));
      check(w.pr.every((f) => f.yawErr < 0.35), 'every print pointing the way he walked');
      let alt = 0;
      for (let i = 1; i < w.pr.length; i++) if (w.pr[i].side !== w.pr[i - 1].side) alt++;
      check(alt >= w.pr.length - 2, `left and right in turn (${alt} changes in ${w.pr.length})`);
      // left prints on the left of the line (the left foot is +X, the left of the way)
      const lefts = w.pr.filter((f) => f.side > 0), rights = w.pr.filter((f) => f.side < 0);
      const mean = (a) => a.reduce((s, f) => s + f.off, 0) / Math.max(1, a.length);
      check(lefts.length && rights.length && mean(lefts) > mean(rights), `left feet left of the right ones (${mean(lefts).toFixed(3)} vs ${mean(rights).toFixed(3)})`);
      const sp = w.pr.slice(1).map((f, i) => f.along - w.pr[i].along);
      check(sp.every((d) => d > 0.3 && d < 1.3), 'steps 0.3-1.3 m apart: ' + sp.map((d) => d.toFixed(2)).join(' '));
      check(w.pr.every((f) => f.depth > 0.02 && f.L > 0.22 && f.W > 0.08), 'prints the size of a boot');
      if (SHOTS) {
        const p = await ev(() => ({ x: __game.player.x, z: __game.player.z, yaw: __game.player.yaw }));
        const bx = p.x - Math.sin(p.yaw) * 4.5, bz = p.z - Math.cos(p.yaw) * 4.5;
        // from the side, low, and from above
        await camAt([bx + Math.cos(p.yaw) * 3.2, 1.7, bz - Math.sin(p.yaw) * 3.2], [bx, 0.15, bz], 45);
        await frames(6); await shot('spar_walk_side');
        await camAt([bx - Math.sin(p.yaw) * 3, 2.4, bz - Math.cos(p.yaw) * 3], [bx + Math.sin(p.yaw) * 1, 0.15, bz + Math.cos(p.yaw) * 1], 45);
        await frames(6); await shot('spar_walk_back');
        await camFree();
      }
      // running: longer steps, still one print per step
      const s2 = await snowRun(lm.x + 20, lm.z, 12, Math.PI / 2);
      if (s2) {
        await onFoot(s2); await frames(10);
        const n0 = (await stats()).made.feet[0];
        await hold(['ShiftLeft', 'KeyW'], 2000);
        await frames(10);
        const r = await ev(({ s, n0 }) => {
          const g = __game, p = g.player, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
          return { walked: (p.x - s.x) * fx + (p.z - s.z) * fz, made: __tracks.stats().made.feet[0] - n0 };
        }, { s: s2, n0 });
        console.log('[t] run', JSON.stringify(r));
        check(r.made >= r.walked / 1.8 * 0.6 && r.made <= r.walked / 1.2 + 2, `running: ${r.made} prints over ${r.walked.toFixed(1)} m`);
      }
      // a jump on the spot: both feet where he lands
      {
        const n0 = (await stats()).made.feet[0];
        await tap('Space');
        await sleep(1600);
        const n1 = (await stats()).made.feet[0];
        check(n1 - n0 >= 2, `a jump lands on both feet (${n1 - n0} prints)`);
      }
      // nothing on paving or asphalt: a walk along Ove's street
      {
        const a = await ev(() => { const L = window.__lm('busStop'); return { x: L.x - 6, z: L.z + 1.2, yaw: Math.PI / 2 }; });
        await onFoot(a); await frames(10);
        const n0 = (await stats()).made.feet[0];
        const surf0 = await ev(async (a) => (await import('./src/world/surface.js')).surfaceAt(a.x, a.z), a);
        await hold(['KeyW'], 1500);
        const n1 = (await stats()).made.feet[0];
        console.log('[t] street', surf0, n1 - n0);
        if (surf0 !== 'snow') check(n1 === n0, `no prints on ${surf0} (${n1 - n0})`);
      }
      // a neighbour walking across the snow leaves her prints too (the others' ring), smaller than Ove's
      {
        const s3 = await snowRun(lm.x - 10, lm.z + 6, 8, 0);
        if (s3) {
          const r1 = await ev((s3) => {
            const g = __game, n = g.npcs.parvaneh, fx = Math.sin(s3.yaw), fz = Math.cos(s3.yaw);
            n.state = 'normal'; n.root.visible = true;
            n.teleport(s3.x, s3.z, s3.yaw);
            g.walkNpc(n, [{ x: s3.x + fx * 7, z: s3.z + fz * 7 }], { speed: 1.4, stay: true, yaw: s3.yaw });
            g.player.teleport(s3.x - fx * 2 + fz * 2, s3.z - fz * 2 - fx * 2, s3.yaw);
            return __tracks.stats().made.feet[1];
          }, s3);
          await sleep(4500);
          const pr = await ev(({ s3, r1 }) => {
            const fx = Math.sin(s3.yaw), fz = Math.cos(s3.yaw), n = __game.npcs.parvaneh;
            const list = __tracks.feetList(1).slice(-(__tracks.stats().made.feet[1] - r1));
            const mine = list.filter((f) => Math.abs((f.x - s3.x) * fz - (f.z - s3.z) * fx) < 0.4);
            n.busy = false; n.walkStay = false;
            return { n: mine.length, L: mine[0]?.L, walked: Math.hypot(n.x - s3.x, n.z - s3.z) };
          }, { s3, r1 });
          console.log('[t] parvaneh', JSON.stringify(pr));
          check(pr.n >= 4 && pr.L < 0.29, `Parvaneh's prints across the lawn (${pr.n} over ${pr.walked.toFixed(1)} m, ${pr.L?.toFixed(3)} m long)`);
        }
      }
      // ------------------------------------------------------------------ the Saab on the field
      const f = await ev(() => window.__lm('field'));
      const fs = await snowRun(f.x, f.z - 14, 26, 0);
      check(!!fs, 'the field with 26 m of snow: ' + JSON.stringify(fs));
      if (fs) {
        await ev((fs) => { const g = __game, c = g.named.saab; if (g.playerCar) g.exitCar(true); c.place(fs.x, fs.z, fs.yaw); g.enterCar(c); g.cam.yaw = fs.yaw; g.cam.snapNext = true; }, fs);
        await frames(20);
        const r0 = (await stats()).made.ruts[0];
        await hold(['KeyW'], 2600);
        await hold(['KeyS'], 1500);
        await frames(10);
        const d = await ev(({ fs, r0 }) => {
          const g = __game, c = g.playerCar, segs = __tracks.rutList(0);
          const fx = Math.sin(fs.yaw), fz = Math.cos(fs.yaw);
          const lat = segs.map((sg) => ((sg.x0 + sg.x1) / 2 - fs.x) * fz - ((sg.z0 + sg.z1) / 2 - fs.z) * fx);
          const len = segs.reduce((s, sg) => s + Math.hypot(sg.x1 - sg.x0, sg.z1 - sg.z0), 0);
          const wheels = c.wheels.map((w) => w.x);
          return { made: __tracks.stats().made.ruts[0] - r0, n: segs.length, len, moved: Math.hypot(c.x - fs.x, c.z - fs.z), lat, wheels, kmh: c.speed * 3.6 };
        }, { fs, r0 });
        const lats = [...new Set(d.lat.map((l) => Math.round(l * 10) / 10))].sort((a, b) => a - b);
        console.log('[t] drive', JSON.stringify({ made: d.made, n: d.n, len: d.len.toFixed(1), moved: d.moved.toFixed(1), lats, wheels: d.wheels }));
        check(d.len > d.moved * 3, `ruts along the way of four wheels (${d.len.toFixed(1)} m of rut for ${d.moved.toFixed(1)} m driven)`);
        const wx = d.wheels.map(Math.abs).reduce((a, b) => Math.max(a, b), 0);
        check(d.lat.every((l) => Math.abs(Math.abs(l) - wx) < 0.25), `every rut under a wheel (|x| ${wx.toFixed(2)})`);
        check(d.lat.some((l) => l > 0) && d.lat.some((l) => l < 0), 'ruts on both sides');
        if (SHOTS) {
          const c = await ev(() => ({ x: __game.playerCar.x, z: __game.playerCar.z, yaw: __game.playerCar.yaw }));
          await camAt([c.x - Math.sin(c.yaw) * 4 + Math.cos(c.yaw) * 3, 2.2, c.z - Math.cos(c.yaw) * 4 - Math.sin(c.yaw) * 3], [c.x + Math.sin(c.yaw) * 5, 0.15, c.z + Math.cos(c.yaw) * 5], 50);
          await frames(6); await shot('spar_drive_ruts');
          await camFree();
        }
        // a slide: the handbrake in a turn smears the ruts wider
        await hold(['KeyW'], 1500);
        await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.keyboard.down('Space');
        await sleep(900);
        await page.keyboard.up('Space'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
        await hold(['KeyS'], 1200);
        await frames(10);
        const sm = await ev(() => { const s = __tracks.rutList(0); return { maxHw: Math.max(...s.map((x) => x.hw)), minHw: Math.min(...s.map((x) => x.hw)) }; });
        console.log('[t] slide', JSON.stringify(sm));
        check(sm.maxHw > sm.minHw + 0.02, `a slide smears the ruts wider (half width ${sm.minHw.toFixed(3)} .. ${sm.maxHw.toFixed(3)})`);
        if (SHOTS) {
          const c = await ev(() => ({ x: __game.playerCar.x, z: __game.playerCar.z, yaw: __game.playerCar.yaw }));
          await camAt([c.x + 2, 9, c.z + 2], [c.x, 0.15, c.z], 60);
          await frames(6); await shot('spar_drive_top');
          await camFree();
        }
        // off the field onto the road: no ruts on the asphalt
        const road = await ev(async () => {
          const { isRoad } = await import('./src/world/layout.js');
          const segs = __tracks.rutList(0).concat(__tracks.rutList(1));
          return segs.filter((s) => isRoad((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)).length;
        });
        check(road === 0, `no rut on a road (${road})`);
        await ev(() => __game.exitCar(true));
      }
      // ------------------------------------------------------------------ a new day
      const before = await stats();
      await ev(() => { const m = __game.missions; m.state = 'idle'; m.gateOpen = false; m.gating = false; m.updateGate(0); });
      const after = await stats();
      console.log('[t] new day', JSON.stringify({ before, after }));
      check(before.feet[0] > 0 && after.feet[0] === 0 && after.ruts[0] === 0 && after.feet[1] === 0 && after.ruts[1] === 0, 'a new day clears every track');
      // and new ones are made again afterwards
      if (s) {
        await onFoot(s); await frames(5);
        await hold(['KeyW'], 1200);
        const again = await stats();
        check(again.feet[0] > 0, `prints again after the dawn (${again.feet[0]})`);
      }
      console.log('[t] people', JSON.stringify((await stats()).made));
    },

    async sposlook() {
      await frames(20);
      const lm = await ev(() => window.__lm('oveStart'));
      const s = await snowRun(lm.x, lm.z, 9);
      await onFoot(s);
      await frames(10);
      await hold(['KeyW'], 2000);
      await hold(['KeyA', 'KeyW'], 800);
      await hold(['KeyW'], 900);
      await frames(10);
      const p = await ev(() => ({ x: __game.player.x, z: __game.player.z, yaw: __game.player.yaw }));
      // the game's own camera behind him
      await shot('sposlook_chase');
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), mx = s.x + fx * 3, mz = s.z + fz * 3;
      const views = [
        ['close', [mx + fz * 1.2, 0.9, mz - fx * 1.2], [mx, 0.15, mz], 40],
        ['sun', [mx - 1.6, 1.3, mz + 1.6], [mx, 0.15, mz], 45],
        ['against', [mx + 1.8, 1.2, mz - 1.8], [mx, 0.15, mz], 45],
        ['top', [mx + 0.01, 2.2, mz + 0.01], [mx, 0.15, mz], 50],
      ];
      for (const [n, at, look, fov] of views) { await camAt(at, look, fov); await frames(6); await shot('sposlook_' + n); }
      await camFree();
      // in the sun: a walk across the field, a turn, and a jump
      const f = await ev(() => window.__lm('field'));
      const ws = await snowRun(f.x - 8, f.z - 6, 10, Math.PI);
      await onFoot(ws);
      await frames(10);
      await hold(['KeyW'], 1500);
      await hold(['KeyD', 'KeyW'], 700);
      await hold(['KeyW'], 800);
      await tap('Space');
      await sleep(1500);
      {
        const fx = Math.sin(ws.yaw), fz = Math.cos(ws.yaw), mx = ws.x + fx * 2.5, mz = ws.z + fz * 2.5;
        for (const [n, at, look, fov] of [
          ['fclose', [mx + fz * 1.3, 1.0, mz - fx * 1.3], [mx, 0.15, mz], 40],
          ['fsun', [mx - 1.8, 1.4, mz + 1.8], [mx, 0.15, mz], 45],
          ['fagainst', [mx + 1.9, 1.3, mz - 1.9], [mx, 0.15, mz], 45],
          ['ftop', [mx + 0.01, 2.0, mz + 0.01], [mx, 0.15, mz], 55],
        ]) { await camAt(at, look, fov); await frames(6); await shot('sposlook_' + n); }
        await camFree();
        await frames(10);
        await shot('sposlook_fchase');
      }
      // the Saab on the field
      const fs = await snowRun(f.x, f.z - 14, 26, 0);
      await ev((fs) => { const g = __game, c = g.named.saab; c.place(fs.x, fs.z, fs.yaw); g.enterCar(c); g.cam.yaw = fs.yaw; g.cam.snapNext = true; }, fs);
      await frames(20);
      await hold(['KeyW'], 2200);
      await hold(['KeyW', 'KeyA'], 900);
      await hold(['KeyS'], 1300);
      await frames(20);
      await shot('sposlook_carchase');
      const c = await ev(() => ({ x: __game.playerCar.x, z: __game.playerCar.z, yaw: __game.playerCar.yaw }));
      const bx = c.x - Math.sin(c.yaw) * 5, bz = c.z - Math.cos(c.yaw) * 5;
      for (const [n, at, look, fov] of [
        ['rutclose', [bx + Math.cos(c.yaw) * 2.2, 1.0, bz - Math.sin(c.yaw) * 2.2], [bx, 0.15, bz], 45],
        ['rutsun', [bx - 2, 1.5, bz + 2], [bx, 0.15, bz], 50],
        ['rutfar', [bx - Math.sin(c.yaw) * 14, 3, bz - Math.cos(c.yaw) * 14], [c.x, 0.15, c.z], 45],
      ]) { await camAt(at, look, fov); await frames(6); await shot('sposlook_' + n); }
      await camFree();
    },

    // The special cases: ruts up and over the hoppbacke (none in the air), a trailer's, Rune's
    // wheelchair, the snow tractor's, Ove out in the cold (prints on the hills' ground, filling in).
    async sposmore() {
      await frames(20);
      const view = async (name, at, look, fov = 50) => { await camAt(at, look, fov); await frames(6); await shot('sposmore_' + name); await camFree(); };
      // ---- the hoppbacke
      const h = await ev(async () => {
        const { JUMP_HILLS } = await import('./src/world/snowhill.js');
        const g = __game, H = JUMP_HILLS[0], c = g.named.saab;
        if (g.playerCar) g.exitCar(true);
        const u0 = -(H.end + 14), yaw = Math.atan2(H.fx, H.fz);
        c.place(H.x + H.fx * u0, H.z + H.fz * u0, yaw);
        g.enterCar(c); g.cam.yaw = yaw; g.cam.snapNext = true;
        window.__H = H; window.__air = 0;
        g.hooks.push(() => { const c = g.playerCar; if (c?.flight) window.__air++; });
        return { x: H.x, z: H.z, fx: H.fx, fz: H.fz, top: H.top, end: H.end, r0: __tracks.stats().made.ruts[0] };
      });
      await frames(10);
      await hold(['KeyW'], 3800);
      await hold(['KeyS'], 1200);
      await frames(20);
      const hr = await ev((h) => {
        const segs = __tracks.rutList(0).slice(-(__tracks.stats().made.ruts[0] - h.r0));
        const up = segs.filter((s) => s.y > 0.6);
        // no segment longer than a few metres (none spanning the flight)
        const long = segs.filter((s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > 1.2).length;
        return { n: segs.length, up: up.length, top: Math.max(...segs.map((s) => s.y)), long, air: window.__air };
      }, h);
      console.log('[t] hill', JSON.stringify(hr));
      check(hr.up > 8 && hr.top > 1, `ruts up the hoppbacke (${hr.up} segments over 0.6 m, highest ${hr.top.toFixed(2)})`);
      check(hr.long === 0, `no rut across a flight (${hr.long} segments over 1.2 m; ${hr.air} frames in the air)`);
      await view('hill', [h.x + h.fz * 5 - h.fx * 1, 6.5, h.z - h.fx * 5 - h.fz * 1], [h.x - h.fx * 6, 1.8, h.z - h.fz * 6], 55);
      await view('hilltop', [h.x - h.fx * 2 + 0.01, 8, h.z - h.fz * 2], [h.x - h.fx * 2, 3, h.z - h.fz * 2], 70);
      // ---- a trailer on the field
      const f = await ev(() => window.__lm('field'));
      const ts = await snowRun(f.x + 12, f.z - 14, 22, 0);
      await ev((ts) => { const g = __game, c = g.named.patrickCar; if (g.playerCar) g.exitCar(true); c.place(ts.x, ts.z, ts.yaw); g.enterCar(c); g.cam.yaw = ts.yaw; g.cam.snapNext = true; window.__r0 = __tracks.stats().made.ruts[0]; }, ts);
      await frames(20);
      await hold(['KeyW'], 1800);
      await hold(['KeyW', 'KeyA'], 1200);
      await hold(['KeyS'], 1300);
      await frames(10);
      const tr = await ev(() => {
        const c = __game.playerCar, T = c.trailer;
        const segs = __tracks.rutList(0).slice(-(__tracks.stats().made.ruts[0] - window.__r0));
        // segments under the trailer's wheels now (within 0.6 m of either)
        const wx = [-1, 1].map((s) => [T.x + s * 0.83 * Math.cos(T.yaw), T.z - s * 0.83 * Math.sin(T.yaw)]);
        const near = segs.filter((s) => wx.some(([x, z]) => Math.hypot(s.x1 - x, s.z1 - z) < 0.6)).length;
        return { n: segs.length, near, trailer: !!T, x: c.x, z: c.z, yaw: c.yaw, tx: T.x, tz: T.z };
      });
      console.log('[t] trailer', JSON.stringify(tr));
      check(tr.trailer && tr.near >= 2, `ruts behind the trailer's wheels (${tr.near})`);
      await view('trailer', [tr.tx + 3, 8, tr.tz + 3], [(tr.x + tr.tx) / 2, 0.15, (tr.z + tr.tz) / 2], 60);
      await ev(() => __game.exitCar(true));
      // ---- the snow tractor
      const ks = await snowRun(f.x - 14, f.z - 14, 16, 0);
      await ev((ks) => { const g = __game, c = g.named.tractor; c.place(ks.x, ks.z, ks.yaw); g.player.teleport(ks.x + 1.5, ks.z, ks.yaw); g.enterCar(c); g.cam.yaw = ks.yaw; g.cam.snapNext = true; window.__r0 = __tracks.stats().made.ruts[0]; }, ks);
      await frames(20);
      await hold(['KeyW'], 2500);
      await hold(['KeyW', 'KeyD'], 900);
      await frames(10);
      const kr = await ev(() => { const c = __game.playerCar; return { kind: c.kind, n: __tracks.stats().made.ruts[0] - window.__r0, x: c.x, z: c.z, yaw: c.yaw }; });
      console.log('[t] tractor', JSON.stringify(kr));
      check(kr.kind === 'tractor' && kr.n > 10, `the tractor's ruts (${kr.n})`);
      await view('tractor', [kr.x - Math.sin(kr.yaw) * 7 + Math.cos(kr.yaw) * 2.5, 2.6, kr.z - Math.cos(kr.yaw) * 7 - Math.sin(kr.yaw) * 2.5], [kr.x - Math.sin(kr.yaw) * 2, 0.15, kr.z - Math.cos(kr.yaw) * 2], 50);
      await ev(() => __game.exitCar(true));
      // ---- Rune's wheelchair let go of on the field
      const rs = await snowRun(f.x + 4, f.z - 4, 8, Math.PI / 2);
      const rr0 = await ev((rs) => {
        const g = __game, n = g.npcs.rune;
        n.teleport(rs.x, rs.z, rs.yaw);
        g.player.teleport(rs.x - Math.sin(rs.yaw) * 1.2, rs.z - Math.cos(rs.yaw) * 1.2, rs.yaw);
        g.cam.yaw = rs.yaw; g.cam.snapNext = true;
        n.busy = true;
        g.rune.roll(n, 2.2);
        return __tracks.stats().made.ruts[1];
      }, rs);
      await sleep(1800);
      const rr = await ev((rr0) => { const n = __game.npcs.rune; n.busy = false; return { n: __tracks.stats().made.ruts[1] - rr0, x: n.x, z: n.z, yaw: n.yaw }; }, rr0);
      console.log('[t] rune', JSON.stringify(rr));
      check(rr.n >= 8, `Rune's wheelchair leaves ruts (${rr.n})`);
      await view('rune', [rr.x - Math.sin(rr.yaw) * 3.5 + Math.cos(rr.yaw) * 1.5, 1.8, rr.z - Math.cos(rr.yaw) * 3.5 - Math.sin(rr.yaw) * 1.5], [rr.x - Math.sin(rr.yaw) * 1.5, 0.15, rr.z - Math.cos(rr.yaw) * 1.5], 50);
      // ---- out in the cold: prints on the hills' ground beyond the town, filling in in the blizzard
      const cs = await ev(async () => {
        const { COLD } = await import('./src/world/layout.js');
        const g = __game, x = -112, z = -(COLD + 40);
        g.player.teleport(x, z, Math.PI);
        g.cam.yaw = Math.PI; g.cam.snapNext = true;
        return { x, z, f0: __tracks.stats().made.feet[0] };
      });
      await frames(30);
      await hold(['KeyW'], 2500);
      await frames(10);
      const cr = await ev((cs) => {
        const g = __game, p = g.player, list = __tracks.feetList(0).slice(-(__tracks.stats().made.feet[0] - cs.f0));
        return { n: list.length, dy: Math.max(...list.map((f) => Math.abs(f.y - g.groundAt(f.x, f.z)))), fill: Math.min(...list.map((f) => f.rate)), px: p.x, pz: p.z, yaw: p.yaw, y: p.y };
      }, cs);
      console.log('[t] cold', JSON.stringify(cr));
      check(cr.n >= 3, `prints out beyond the town (${cr.n})`);
      check(cr.dy < 0.05, `on the ground there (off by ${cr.dy.toFixed(3)} m at most)`);
      check(cr.fill > 0, `filling in with blown snow (${(cr.fill * 100).toFixed(2)} %/s)`);
      await view('cold', [cr.px - Math.sin(cr.yaw) * 5 + Math.cos(cr.yaw) * 1.5, cr.y + 2.0, cr.pz - Math.cos(cr.yaw) * 5 - Math.sin(cr.yaw) * 1.5], [cr.px - Math.sin(cr.yaw) * 1.5, cr.y, cr.pz - Math.cos(cr.yaw) * 1.5], 50);
    },

    // Run with QUERY='&gputime'. The field filled with every print and rut the rings hold, seen from a
    // chase camera's height and from above: the frame's CPU (renderFrame) and GPU time with the tracks
    // drawn and hidden, alternating, and the draw calls.
    async sposperf() {
      await frames(30);
      const f = await ev(() => window.__lm('field'));
      const st = await ev((f) => __tracks.debugFill(f.x, f.z - 14, 35), f);
      console.log('[t] filled', JSON.stringify(st));
      const measure = (on) => ev(async (on) => {
        const gfx = await import('/src/gfx.js');
        const S = gfx.gfxStats, M = __tracks.meshes();
        M.feet.visible = M.ruts.visible = on;
        await new Promise((r) => setTimeout(r, 400));
        S.gpuHist = [];
        const rf = [], f0 = window.__frame;
        await new Promise((res) => { const tick = () => { rf.push(S.ms); if (window.__frame - f0 >= 120) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
        const mean = (a) => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3) : null;
        return { calls: S.calls, rf: mean(rf), gpu: mean(S.gpuHist || []), n: (S.gpuHist || []).length };
      }, on);
      for (const [name, at, look, fov] of [
        ['chase', [f.x - 30, 3.2, f.z - 14], [f.x + 10, 0.2, f.z - 14], 60],
        ['above', [f.x, 25, f.z - 30], [f.x, 0, f.z - 14], 60],
      ]) {
        await camAt(at, look, fov);
        await frames(30);
        const res = { on: [], off: [] };
        for (let k = 0; k < 3; k++) { res.on.push(await measure(true)); res.off.push(await measure(false)); }
        const avg = (a, key) => +(a.reduce((s, v) => s + (v[key] ?? 0), 0) / a.length).toFixed(3);
        console.log(`[t] perf ${name}: calls ${res.on[0].calls} vs ${res.off[0].calls}, renderFrame ${avg(res.on, 'rf')} vs ${avg(res.off, 'rf')} ms, gpu ${avg(res.on, 'gpu')} vs ${avg(res.off, 'gpu')} ms (${res.on[0].n} samples)`);
        await ev(() => { const M = __tracks.meshes(); M.feet.visible = M.ruts.visible = true; });
        await frames(5);
        await shot('sposperf_' + name);
      }
      await camFree();
      // the per-frame update itself, with every ring full (a car and Ove moving on snow)
      const u = await ev(() => {
        const g = __game, t0 = performance.now();
        for (let i = 0; i < 200; i++) __tracks.update(g, 1 / 60);
        return (performance.now() - t0) / 200;
      });
      console.log('[t] update', u.toFixed(4), 'ms per frame');
    },
  };
};
