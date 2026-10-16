// The playgrounds' swings (features/implemented/gungorna_saknar_linor.md). Run:
//   PORT=88xx node tools/shot.mjs <name>
//   gunga      27 checks with real E presses at the swing in Ove's area: the prompt, pushes that build
//              it up, never hit while he pushes, hits (fallNext true: a ragdoll; false: a step back),
//              40 hits by chance (~30 % falls), walking into a seat, at it from the side, the Saab
//              through the pair. Screens gung_take, gung_push, gung_high, gung_fall_*, gung_bump.
//   gungfilm   film strips (the game paused per frame): a push, a second push, a fall.
//   gunglook   close-ups: the preschool's swing (ropes) and the one in Ove's area (chains), at rest
//              and swinging (th set by hand), from the side and from behind. Screens gung_*.png.
export default (H) => {
  const { page, ev, frames, sleep, errors, OUT } = H;
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const ok = (c, what, ...a) => { if (c) log('ok', what); else bad(what, ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))); return !!c; };
  const snap = async (name) => { await frames(3); await page.screenshot({ path: `${OUT}/${name}.png` }); log('saved', name); };

  // The seats: [{ i, x, z, y, L, kind, yaw, ox, oz, ax, az }]
  const seats = () => ev(async () => {
    const { swings } = await import('./src/world/swings.js');
    return swings.map((s, i) => ({ i, x: s.x, z: s.z, y: s.y, L: s.L, kind: s.kind, yaw: s.yaw, ox: s.ox, oz: s.oz, ax: s.ax, az: s.az }));
  });
  // The camera by hand (the rig frozen until free()), the HUD hidden.
  const camAt = (at, look, fov = 50) => ev(({ at, look, fov }) => {
    const g = __game, c = g.cam;
    c._upd ||= c.update;
    c.update = function () {};
    c.cam.position.set(...at); c.cam.lookAt(...look); c.cam.fov = fov; c.cam.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
  }, { at, look, fov });
  const free = () => ev(() => { const c = __game.cam; if (c._upd) c.update = c._upd; document.getElementById('hud').style.display = ''; c.snapNext = true; });
  const setSeat = (i, th, w = 0) => ev(async ({ i, th, w }) => {
    const { swings } = await import('./src/world/swings.js');
    const s = swings[i];
    s.set(th, w);
    if (w) __game.gunga.wake(s);
  }, { i, th, w });
  const nearest = (list, x, z) => list.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];

  // A view of seat s: `side` m out along the beam (0: from behind, across it), `back` m across it,
  // the camera at height h, looking at the beam's middle at height lh.
  const view = (s, side, back, h = 1.5, lh = 1.2) => {
    const at = [s.x + s.ax * side + s.ox * back, h, s.z + s.az * side + s.oz * back];
    return camAt(at, [s.x, lh, s.z], 50);
  };

  // The seats as window.__sw (the module's own list), and the one in Ove's area by the 'playground'
  // landmark (chains) with its neighbour in the pair.
  const prep = () => ev(async () => {
    const { swings } = await import('./src/world/swings.js');
    window.__sw = swings;
    const pg = window.__lm('playground'), d = (s) => Math.hypot(s.x - pg.x, s.z - pg.z);
    const i = swings.indexOf(swings.slice().sort((a, b) => d(a) - d(b))[0]), s = swings[i];
    const j = swings.findIndex((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 2);
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    for (const c of g.cars.slice()) if (c.traffic) g.removeCar(c);
    g.patrol.pause?.(true);
    return { i, j };
  });
  const st = (i) => ev((i) => {
    const s = __sw[i], g = __game, p = g.player, gu = g.gunga, [a, o] = s.local(p.x, p.z);
    return { th: +s.th.toFixed(3), w: +s.w.toFixed(3), amp: +s.amplitude().toFixed(3), op: gu.op?.phase || null, stats: { ...gu.stats }, ps: p.state, rag: !!p.rag, a: +a.toFixed(3), o: +o.toFixed(3), y: +p.y.toFixed(3), it: g.nearestInteractable()?.type || null, prompt: document.getElementById('prompt')?.textContent || '' };
  }, i);
  // Ove standing `o` m out across the beam from seat i's hooks (and `a` along it), facing the seat
  // (turn: + rad more), the camera behind him; the seat still, its hit cool-down over.
  const standAt = (i, o, a = 0, turn = 0) => ev(({ i, o, a, turn }) => {
    const s = __sw[i], g = __game, p = g.player;
    if (g.playerCar) g.exitCar(true);
    g.gunga.endOp?.();
    const x = s.x + s.ox * o + s.ax * a, z = s.z + s.oz * o + s.az * a;
    const yaw = Math.atan2(-Math.sign(o || 1) * s.ox, -Math.sign(o || 1) * s.oz) + turn;
    p.teleport(x, z, yaw);
    g.cam.yaw = yaw; g.cam.pitch = 0.25; g.cam.snapNext = true;
    s.cd = 0;
  }, { i, o, a, turn });
  // The camera at seat i's side, away from its pair (along the beam: the swing's plane face on), or
  // (quarter) behind Ove's shoulder at 45°.
  const side = (i, back = 0.3, quarter = false) => ev(({ i, back, quarter }) => {
    const s = __sw[i], t = __sw.find((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 2), out = t && s.local(t.x, t.z)[0] > 0 ? -1 : 1;
    const [a, o, h] = quarter ? [out * 2.1, 2.6, 1.75] : [out * 3.8, back + 0.4, 1.6];
    return { at: [s.x + s.ax * a + s.ox * o, h, s.z + s.az * a + s.oz * o], look: [s.x + s.ox * back, 0.9, s.z + s.oz * back] };
  }, { i, back, quarter }).then((v) => camAt(v.at, v.look, quarter ? 45 : 50));
  // The game paused (rendering on) the frame the push reaches `phase`: a screenshot that doesn't
  // cost game time. thaw() lets it go on.
  const freezeOn = (phase) => ev((phase) => { const g = __game, h = () => { if (g.gunga.op?.phase === phase) { g.paused = true; g.offFrame(h); } }; g.onFrame(h); }, phase);
  const thaw = () => ev(() => { __game.paused = false; });
  const frozen = (ms = 2000) => page.waitForFunction('window.__game.paused === true', { timeout: ms, polling: 16 }).then(() => true, () => false);
  const lastPush = () => ev(() => [...__game.gunga.log].reverse().find((e) => e.ev === 'push')?.amp ?? 0);
  // Wait (game time) until fn(state) holds, at most ms of real time; the last state.
  const waitFor = async (i, fn, ms = 4000) => {
    const t0 = Date.now();
    let s = await st(i);
    while (!fn(s) && Date.now() - t0 < ms) { await frames(2); s = await st(i); }
    return s;
  };

  return {
    // Real E presses at the swing in Ove's area: the prompt, a push from rest (~34°), three more at
    // the top of each backswing (each higher, the last ≥ 57°, never past SWING.max), never hit while
    // he pushes; then left alone it hits him: knocked over (fallNext = true: a ragdoll, down, up again
    // on his feet), knocked back (fallNext = false: on his feet, a step back, the seat bounces off);
    // 40 hits by chance (about 30 % falls); walking into a still seat pushes it ahead of him (no
    // hit); from the side it is in his way; the Saab driven through the pair sends both flying.
    // Screens: gung_push, gung_high, gung_fall (a film strip), gung_bump.
    async gunga() {
      const { i, j } = await prep();
      const sw = await seats();
      log('seat', i, 'pair', j, sw[i].kind);
      // --- the prompt
      await standAt(i, 0.62);
      await frames(10);
      let s = await st(i);
      ok(s.it === 'swing' && /Knuffa gungan/.test(s.prompt), 'E offered behind the seat: "Knuffa gungan"', s);
      await standAt(i, 0.62, 0, Math.PI);
      await frames(5);
      s = await st(i);
      ok(s.it !== 'swing', 'not with his back to it', s);
      await standAt(i, 2.3);
      await frames(5);
      s = await st(i);
      ok(s.it !== 'swing', 'not from 2.3 m off with the seat still', s);
      await standAt(i, 0.62, 0.7);
      await frames(5);
      s = await st(i);
      ok(s.it !== 'swing', 'not from beside it', s);
      // --- a push from rest, with E
      await standAt(i, 0.62);
      await frames(8);
      await side(i, 0.3, true);
      await freezeOn('take');
      await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
      if (ok(await frozen(), 'E: he takes the lines')) { await frames(4); await page.screenshot({ path: `${OUT}/gung_take.png` }); }
      await freezeOn('shove');
      await thaw();
      if (await frozen()) { await frames(4); await page.screenshot({ path: `${OUT}/gung_push.png` }); }
      await thaw();
      s = await waitFor(i, (s) => s.op === null, 2000);
      ok(s.stats.pushes === 1, 'E: one push', s.stats);
      const a1 = await lastPush();
      ok(a1 > 0.45 && a1 < 0.75, 'from rest it swings out ~34°', a1);
      await side(i);
      ok(s.o > 0.35 && s.o < 0.66, 'he stepped in to it, no further', s.o);
      // --- three more, each at the top of its backswing (E pressed as it starts back to him)
      let amp = a1;
      for (let k = 0; k < 3; k++) {
        // (moving back towards him: w > 0 since he stands at +o)
        s = await waitFor(i, (s) => s.w > 0.2 && s.th < -0.15, 4000);
        await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
        s = await waitFor(i, (s) => s.stats.pushes === k + 2 && s.op === null, 4000);
        const an = await lastPush();
        ok(s.stats.pushes === k + 2 && an > amp + 0.08, `push ${k + 2}: higher (${(amp * 57.3).toFixed(0)}° -> ${(an * 57.3).toFixed(0)}°)`, s);
        amp = an;
      }
      ok(amp >= 0.95 && amp <= 1.2501, 'after four pushes ≥ 55°, at most 72°', amp);
      ok(s.stats.hits === 0, 'never hit while he pushes', s.stats);
      s = await waitFor(i, (s) => s.th < -0.9, 4000);
      await page.screenshot({ path: `${OUT}/gung_high.png` });
      s = await st(i);
      // --- left alone it comes back and knocks him over
      await ev(() => { __game.gunga.fallNext = true; });
      const h0 = s.stats.hits;
      s = await waitFor(i, (s) => s.stats.hits > h0, 4000);
      ok(s.stats.hits === h0 + 1, 'left alone, it hits him', s.stats);
      ok(s.stats.falls === 1 && s.rag && (s.ps === 'flung' || s.ps === 'down'), 'fallNext: over he goes (a ragdoll)', s);
      const film = [];
      for (let k = 0; k < 14; k++) { const f = `${OUT}/gung_fall_${String(k).padStart(2, '0')}.png`; await page.screenshot({ path: f }); film.push(f); await sleep(110); }
      s = await waitFor(i, (s) => s.ps === 'normal', 9000);
      ok(s.ps === 'normal', 'up on his feet again', s);
      const gy = await ev(() => { const p = __game.player; return +(p.y - __game.groundAt(p.x, p.z)).toFixed(3); });
      ok(Math.abs(gy) < 0.05, 'on the ground, not in it', gy);
      // --- knocked back: on his feet, a step back, the seat bounces off him
      await standAt(i, 0.62);
      await ev((i) => { const g = __game; g.gunga.fallNext = false; __sw[i].set(-0.9, 0); g.gunga.wake(__sw[i]); }, i);
      const b0 = await st(i);
      s = await waitFor(i, (s) => s.stats.hits > b0.stats.hits, 4000);
      await frames(2);
      await page.screenshot({ path: `${OUT}/gung_bump.png` });
      await frames(10);
      s = await st(i);
      ok(s.stats.hits === b0.stats.hits + 1 && s.ps === 'normal' && s.stats.falls === b0.stats.falls, 'fallNext false: still on his feet', s);
      ok(s.o > 0.62 + 0.05, 'knocked back a little', s.o);
      ok(s.w < 0, 'the seat bounced off him', s.w);
      // --- by chance: 40 hits
      await ev(() => { __game.gunga.fallNext = null; });
      let falls = 0, hits = 0;
      for (let k = 0; k < 40; k++) {
        await standAt(i, 0.62);
        await ev((i) => { __sw[i].set(-0.9, 0); __game.gunga.wake(__sw[i]); }, i);
        const a0 = await st(i);
        s = await waitFor(i, (s) => s.stats.hits > a0.stats.hits, 3000);
        if (s.stats.hits === a0.stats.hits) continue;
        hits++;
        if (s.stats.falls > a0.stats.falls) falls++;
      }
      log('chance', falls, 'of', hits, 'hits knocked him over');
      ok(hits === 40 && falls >= 4 && falls <= 22, 'about 30 % of hits knock him over', { hits, falls });
      await standAt(i, 2.5);
      await ev((i) => { __sw[i].set(0, 0); }, i);
      await free();
      // --- walking into a still seat pushes it ahead of him
      await standAt(i, 2.0);
      await ev(() => { __game.gunga.fallNext = false; });
      await frames(5);
      const w0 = await st(i);
      await page.keyboard.down('KeyW');
      let thMin = 0;
      for (let k = 0; k < 12; k++) { await sleep(70); const q = await st(i); thMin = Math.min(thMin, q.th); }
      const w1 = await st(i);
      await page.keyboard.up('KeyW');
      log('walked through', JSON.stringify({ from: w0.o, to: w1.o, thMin }));
      ok(thMin < -0.4, 'walking into it pushes the seat ahead of him', thMin);
      ok(w1.stats.hits === w0.stats.hits, 'no hit while he walks into it', w1.stats);
      ok(w1.o < 0, 'and he gets by', w1.o);
      await frames(90);
      // --- from the side it is in his way
      const pair = await ev(({ i, j }) => __sw[i].local(__sw[j].x, __sw[j].z)[0], { i, j });
      const out = pair > 0 ? -1 : 1;
      await ev((i) => __sw[i].set(0, 0), i);
      await ev(({ i, out }) => {
        const s = __sw[i], g = __game, p = g.player, x = s.x + s.ax * out * 1.15, z = s.z + s.az * out * 1.15, yaw = Math.atan2(-out * s.ax, -out * s.az);
        p.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.snapNext = true;
      }, { i, out });
      await frames(5);
      await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
      await frames(5);
      s = await st(i);
      const minA = await ev((i) => 0.225 + __game.player.r * 0.8 - 0.06, i);
      ok(s.a * out > minA, 'walking at it from the side: he stops at it', { a: s.a, minA });
      ok(Math.abs(s.th) < 0.05, 'and it stays still', s.th);
      // --- the Saab through the pair
      const car = await ev(({ i, j }) => {
        const g = __game, s = __sw[i], t = __sw[j], c = g.named.saab;
        const mx = (s.x + t.x) / 2, mz = (s.z + t.z) / 2;
        s.set(0, 0); t.set(0, 0);
        if (g.playerCar) g.exitCar(true);
        g.player.teleport(c.x + 3, c.z);
        g.enterCar(c);
        const yaw = Math.atan2(s.ox, s.oz);
        // (in Ove's area a garden fence is 6 m behind the swing and a hedge 2 m in front: a short run-up)
        c.place(mx - s.ox * 3.9, mz - s.oz * 3.9, yaw);
        g.cam.yaw = yaw; g.cam.snapNext = true;
        return { cars: g.gunga.stats.cars };
      }, { i, j });
      await frames(20);
      await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
      await frames(5);
      const ca = await st(i), cb = await st(j);
      const cp = await ev(({ i }) => { const c = __game.playerCar, s = __sw[i]; return { name: c?.name, at: c && s.local(c.x, c.z).map((v) => +v.toFixed(2)), speed: +(c?.speed || 0).toFixed(2) }; }, { i });
      log('car', JSON.stringify({ a: ca.amp, b: cb.amp, cars: ca.stats.cars, cp }));
      ok(ca.stats.cars >= car.cars + 2 && ca.stats.cars <= car.cars + 8 && ca.amp > 0.3 && cb.amp > 0.3, 'the Saab through the pair sends both seats flying', { a: ca.amp, b: cb.amp, cars: ca.stats.cars });
      await ev(() => { const g = __game; g.playerCar.ctrl.brake = 1; });
      log('stats', JSON.stringify(ca.stats));
      log('film', film.length);
    },

    // Film strips (the game paused for each frame taken: no game time lost to a screenshot): a push
    // from rest seen from in front of Ove, two pushes in time, and a hit that knocks him over (from
    // the side). gungfilm_push.png, gungfilm_again.png, gungfilm_fall.png (FILM=dir keeps the frames).
    async gungfilm() {
      const { i } = await prep();
      const fdir = process.env.FILM || `${OUT}/gungfilm`;
      (await import('fs')).mkdirSync(fdir, { recursive: true });
      // every `every` frames while cond() holds in the page (or for `after` frames after it held), at
      // most `max` frames
      const film = async (tag, cond, every, max, after = 0) => {
        await ev(({ cond, every, after }) => {
          const g = __game, f = new Function('g', 'return ' + cond);
          let n = 0, seen = false, tail = after;
          window.__filmDone = false;
          const h = () => {
            const on = f(g);
            if (on) seen = true; else if (seen && --tail < 0) { window.__filmDone = true; g.offFrame(h); return; }
            if (seen && n++ % every === 0) g.paused = true;
          };
          window.__filmHook = h;
          g.onFrame(h);
        }, { cond, every, after });
        const shots = [];
        for (let k = 0; k < max; k++) {
          const got = await page.waitForFunction('window.__game.paused === true || window.__filmDone === true', { timeout: 8000, polling: 16 }).then(() => true, () => false);
          if (!got || (await ev(() => window.__filmDone && !__game.paused))) break;
          await frames(1).catch(() => {});
          const f = `${fdir}/${tag}_${String(k).padStart(2, '0')}.png`;
          await page.screenshot({ path: f });
          shots.push(f);
          await thaw();
        }
        await ev(() => { __game.offFrame(window.__filmHook); __game.paused = false; });
        return shots;
      };
      const strip = async (name, shots) => {
        if (!shots.length) return bad('no frames for', name);
        const { execFileSync } = await import('child_process');
        execFileSync('montage', [...shots, '-tile', '4x', '-geometry', '480x270+2+2', `${OUT}/${name}.png`]);
        log('saved', name, shots.length, 'frames');
      };
      // in front of Ove across the swing (the seat between him and the camera): his hands on the lines
      const front = () => ev((i) => {
        const s = __sw[i], t = __sw.find((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 2), out = t && s.local(t.x, t.z)[0] > 0 ? -1 : 1;
        return { at: [s.x + s.ax * out * 0.7 - s.ox * 2.5, 1.45, s.z + s.az * out * 0.7 - s.oz * 2.5], look: [s.x + s.ox * 0.4, 1.0, s.z + s.oz * 0.4] };
      }, i).then((v) => camAt(v.at, v.look, 50));
      await standAt(i, 0.62);
      await frames(10);
      await front();
      await frames(5);
      const pushCond = "!!g.gunga.op || (g.player.anim.work && g.player.anim.workKind === 'door')";
      const fp = film('push', pushCond, 3, 24, 20);
      await sleep(100);
      await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
      const sp = await fp;
      // a second push as it comes back (E as it starts back: he holds his hands out for it)
      let s = await waitFor(i, (s) => s.w > 0.2 && s.th < -0.15, 4000);
      const fa = film('again', pushCond, 3, 24, 20);
      await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
      const sa = await fa;
      // left alone, the next time it comes back: over he goes (from as it starts back to him)
      await ev(() => { __game.gunga.fallNext = true; });
      await side(i);
      const h0 = (await st(i)).stats.hits;
      const sf = await film('fall', `g.gunga.stats.hits > ${h0} || (window.__sw[${i}].w > 0.3 && window.__sw[${i}].th > -0.6)`, 4, 28, 0);
      s = await st(i);
      ok(s.stats.hits === h0 + 1 && s.stats.falls >= 1, 'filmed a hit that knocked him over', s.stats);
      await strip('gungfilm_push', sp);
      await strip('gungfilm_again', sa);
      await strip('gungfilm_fall', sf);
      await free();
    },

    async gunglook() {
      const list = await seats();
      log('seats', list.length, JSON.stringify(list.map((s) => [s.kind, +s.x.toFixed(1), +s.z.toFixed(1), +s.L.toFixed(2)])));
      ok(list.length >= 20, 'every playground has its seats', list.length);
      const pg = await ev(() => window.__lm('playground'));
      const chain = nearest(list.filter((s) => s.kind === 'chain'), pg.x, pg.z);
      const rope = list.find((s) => s.kind === 'rope');
      // Ove out of the way
      await ev(({ x, z }) => { const g = __game; g.player.teleport(x, z, 0); }, { x: chain.x + chain.ox * 6 + chain.ax * 3, z: chain.z + chain.oz * 6 + chain.az * 3 });
      for (const [s, tag] of [[rope, 'rope'], [chain, 'chain']]) {
        const pair = list.filter((o) => o.kind === s.kind && Math.hypot(o.x - s.x, o.z - s.z) < 2.5);
        const mid = { ...s, x: pair.reduce((a, o) => a + o.x, 0) / pair.length, z: pair.reduce((a, o) => a + o.z, 0) / pair.length };
        await ev(({ x, z }) => __game.player.teleport(x, z, 0), { x: mid.x + mid.ox * 7 + mid.ax * 4, z: mid.z + mid.oz * 7 + mid.az * 4 });
        await view(mid, 0.3, 4.2, 1.4, 1.1);
        await frames(20);
        await snap(`gung_${tag}_rest`);
        await view(mid, 3.6, 0.6, 1.3, 1.1);
        await snap(`gung_${tag}_side`);
        for (const o of pair) await setSeat(o.i, 0.85 * (o.i % 2 ? 1 : -1));
        await snap(`gung_${tag}_swing_side`);
        await view(mid, 0.4, 3.4, 1.5, 1.1);
        await snap(`gung_${tag}_swing_back`);
        // close: the seat and the lines' ends
        for (const o of pair) await setSeat(o.i, 0);
        await camAt([s.x + s.ax * 0.9 + s.ox * 1.2, 1.15, s.z + s.az * 0.9 + s.oz * 1.2], [s.x, 0.9, s.z], 45);
        await snap(`gung_${tag}_close`);
        await camAt([s.x + s.ax * 0.5 + s.ox * 0.8, 1.6, s.z + s.az * 0.5 + s.oz * 0.8], [s.x, s.y, s.z], 45);
        await snap(`gung_${tag}_hooks`);
      }
      await free();
    },
  };
};
