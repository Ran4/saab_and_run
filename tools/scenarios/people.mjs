// People scenarios (owned by the people area): close-ups of the characters in the real game.
//   PORT=88xx ../browserslot node tools/shot.mjs people pplsmash peopledrive
// people:      fps + stats, the player's face (front, 3/4), on the phone, writing; four neighbours and
//              a pedestrian close up; the HUD portraits (renderPortrait) of the cast, rendered in-game.
// pplsmash:    a pedestrian hit by the Saab: flung, lying, getting up.
// peopledrive: the player seated in the Saab seen through the windscreen, a traffic driver (bust).
// pplkneel:    Ove kneels at Sonja's grave (st.kneel) and lays the flowers.
// pplperf:     what the people cost per frame (tris, calls, levels of detail) at fixed poses
//              (QUERY='&farevery=1' for steady shadow numbers: the far cascade every frame).
// pplanim:     the animation level of detail A/B (character.js ANIM_LOD) with its checks.
// pplcine:     a dialogue shot keeps its speakers and near extras at level 0 (the mid LOD's check).
// seatlegs:    every car model with people seated in it, low views: nothing of them below the cushion
//              in sight (the folded lower legs; in the snow tractor's cab, below its floor), and the
//              legs back on getting out.
export default ({ page, ev, shot, frames, fps }) => {
  // Freeze the camera rig and aim the camera (world coordinates); hide the HUD.
  const camAt = (at, look, fov = 35) => ev(([at, look, fov]) => {
    const g = __game;
    g.cam.update = function () {};
    const c = g.cam.cam;
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    g.hideHud = true;
    const h = document.getElementById('hud'); if (h) h.style.display = 'none';
  }, [at, look, fov]);
  // A camera on a character's face: d metres out along `ang` (0 = straight in front, + = its left).
  const faceCam = (who, d = 0.85, ang = 0, fov = 30) => ev(([who, d, ang, fov]) => {
    const g = __game;
    // (main.js hides anyone within arm's reach of the lens outside cinematics: not for close-ups)
    g.hideNearCamera = function () {};
    for (const ch of g._camHidden || []) if (ch.state !== 'hidden' && !ch.car) ch.root.visible = true;
    const c = who === 'player' ? g.player : who === 'ped' ? window.__ped : g.npc(who);
    c.sync(0);
    c.root.updateMatrixWorld(true);
    const e = c.model.head.matrixWorld.elements, hx = e[12], hy = e[13], hz = e[14];
    const a = c.yaw + ang, fx = Math.sin(a), fz = Math.cos(a);
    const cam = g.cam.cam;
    g.cam.update = function () {};
    cam.position.set(hx + fx * d, hy + 0.02, hz + fz * d); cam.lookAt(hx, hy - 0.02, hz); cam.fov = fov; cam.updateProjectionMatrix();
    g.hideHud = true;
    const h = document.getElementById('hud'); if (h) h.style.display = 'none';
    return [hx, hy, hz].map((v) => +v.toFixed(2));
  }, [who, d, ang, fov]);

  // Fixed camera poses (the same as world.mjs' wperf / the p4 perf review's) for pplperf.
  const POSES = {
    start: [[-12.5, 1.7, 4.2], [8, 1.5, 4.0]],
    lot_e: [[-30, 1.7, -22], [30, 1.0, -24]],
    street_trees: [[-34.5, 1.7, 30], [-34.5, 5, -60]],
    centrum: [[-82, 1.7, -78], [-82, 3, -110]],
    drone_nw: [[-45, 28, -45], [0, 0, 0]],
    aerial: [[0, 420, 260], [0, 0, 0], 50],
  };
  // Everyone (Ove, the neighbours, the pedestrians) out of the scene and back: the drop in
  // __stats() is what the people cost.
  const peopleOut = () => ev(() => {
    const g = __game;
    window.__pplOut = [g.player, ...Object.values(g.npcs), ...g.peds.map((p) => p.char)].map((c) => [c.root, c.root.parent]).filter(([, p]) => p);
    for (const [r, p] of window.__pplOut) p.remove(r);
  });
  const peopleIn = () => ev(() => { for (const [r, p] of window.__pplOut) p.add(r); });

  // A/B timing of the animation level of detail (character.js ANIM_LOD): interleaved windows with it
  // off and on; per frame: Character.sync (all people), the scene's matrix update, game.update and
  // renderFrame's CPU time; and how many people are posed every 1st / 2nd / 4th frame.
  const animAB = async (name, win = 90, rounds = 3) => {
    await ev(async () => {
      if (window.__abInst) return;
      const { Character } = await import('/src/actors/character.js');
      const { scene, gfxStats } = await import('/src/gfx.js');
      const g = __game, acc = window.__abAcc = { sync: 0, mat: 0, upd: 0, rf: 0, n: 0 };
      const os = Character.prototype.sync;
      Character.prototype.sync = function (dt) { const t0 = performance.now(); os.call(this, dt); acc.sync += performance.now() - t0; };
      const om = scene.updateMatrixWorld;
      scene.updateMatrixWorld = function (f) { const t0 = performance.now(); om.call(this, f); acc.mat += performance.now() - t0; };
      const ou = g.update;
      g.update = function (dt) { const t0 = performance.now(); ou.call(this, dt); acc.upd += performance.now() - t0; acc.rf += gfxStats.last || 0; acc.n++; };
      window.__abInst = true;
    });
    const run = async (on) => {
      await ev(async (on) => { const { ANIM_LOD } = await import('/src/actors/character.js'); ANIM_LOD.on = on; }, on);
      await frames(10);
      await ev(() => { const a = window.__abAcc; a.sync = a.mat = a.upd = a.rf = a.n = 0; });
      await frames(win);
      return ev(() => {
        const a = window.__abAcc, g = __game, n = Math.max(1, a.n), every = {};
        let skip = 0, err = 0, ove = g.player.lodEvery;
        for (const c of [g.player, ...Object.values(g.npcs), ...g.peds.map((p) => p.char)]) {
          if (!c.root.parent) continue;
          every[c.lodEvery] = (every[c.lodEvery] || 0) + 1;
          if (c.root._skipFrom) skip++;
          // where it is drawn (its last matrix update) against where it is
          if (c.root.parent.isScene) { const e = c.root.matrixWorld.elements; err = Math.max(err, Math.hypot(e[12] - c.x, e[13] - c.y, e[14] - c.z)); }
        }
        return { sync: a.sync / n, mat: a.mat / n, upd: a.upd / n, rf: a.rf / n, every, skip, err, ove };
      });
    };
    const A = [], B = [];
    for (let r = 0; r < rounds; r++) {
      if (r % 2) { B.push(await run(true)); A.push(await run(false)); } else { A.push(await run(false)); B.push(await run(true)); }
    }
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const row = {};
    for (const k of ['sync', 'mat', 'upd', 'rf']) row[k] = [+med(A.map((x) => x[k])).toFixed(3), +med(B.map((x) => x[k])).toFixed(3), +med(A.map((x, i) => B[i][k] - x[k])).toFixed(3)];
    const L = B[B.length - 1];
    console.log('[t] pplanim', name.padEnd(13), JSON.stringify({ ...row, everyOn: L.every, skipped: L.skip, maxErr: +Math.max(...B.map((x) => x.err)).toFixed(3) }), ' [off, on, d]');
    // checks: Ove is posed every frame; nobody is drawn more than 25 cm from where they are
    if (B.some((x) => x.ove !== 1)) await ev(() => console.error('pplanim: Ove was not posed every frame'));
    if (B.some((x) => x.err > 0.25)) await ev((e) => console.error('pplanim: a person drawn ' + e + ' m from their position'), Math.max(...B.map((x) => x.err)));
    return row;
  };

  return {
    // A dialogue shot keeps its speakers (and the extras within ~8 m) at level 0 with their hair cards:
    // Ove at Parvaneh's, a cinematic with Patrick and Sara as extras (the mid level begins at 6 m of
    // the game's 55-degree lens; the 42-degree dialogue lens sees them closer). Checks: every subject
    // within 8 m of the lens at level 0, the speakers posed every frame. Failures are console errors.
    async pplcine() {
      await frames(20);
      const r = await ev(() => {
        const g = __game, pv = g.npc('parvaneh'), p = g.player;
        const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw);
        p.teleport(pv.x + fx * 1.4, pv.z + fz * 1.4, pv.yaw + Math.PI);
        g.cinematic(pv, p, { extras: [g.npc('patrick'), g.npc('sara')].filter(Boolean) });
        return { at: [+p.x.toFixed(1), +p.z.toFixed(1)] };
      });
      console.log('[t] cine', JSON.stringify(r));
      await frames(60);
      const res = await ev(() => {
        const g = __game, cam = g.cam.cam.position, out = [];
        for (const [k, c] of [['ove', g.player], ['parvaneh', g.npc('parvaneh')], ['patrick', g.npc('patrick')], ['sara', g.npc('sara')]]) {
          if (!c) continue;
          const d = Math.hypot(c.x - cam.x, c.z - cam.z);
          out.push({ k, d: +d.toFixed(1), level: c.model.lodNode.getCurrentLevel(), cards: !!c.model.cardMesh, every: c.lodEvery, fov: +g.cam.cam.fov.toFixed(0) });
        }
        return out;
      });
      console.log('[t] cine levels', JSON.stringify(res));
      for (const q of res) if (q.d < 8 && q.level !== 0) await ev((q) => console.error('pplcine: ' + q.k + ' at ' + q.d + ' m is at level ' + q.level + ' in a dialogue shot'), q);
      for (const q of res.slice(0, 2)) if (q.every !== 1) await ev((q) => console.error('pplcine: speaker ' + q.k + ' posed every ' + q.every + ' frames'), q);
      await shot('ppl_cine');
      await ev(() => __game.endCinematic());
    },

    // The animation level of detail, A/B (off -> on) at fixed poses and in the Saab: ms per frame of
    // Character.sync (all people), the scene's matrix update, game.update and renderFrame
    // (PPOSES=start,lot_e picks poses; WIN=frames per window, ROUNDS=windows per side).
    async pplanim() {
      await frames(30);
      const names = (process.env.PPOSES || 'start,lot_e,street_trees,drone_nw').split(',');
      const win = +(process.env.WIN || 90), rounds = +(process.env.ROUNDS || 3);
      const sum = { sync: [0, 0], mat: [0, 0], upd: [0, 0] };
      const add = (r) => { for (const k in sum) { sum[k][0] += r[k][0]; sum[k][1] += r[k][1]; } };
      for (const n of names) {
        const [at, look, fov] = POSES[n];
        await camAt(at, look, fov || 55);
        await frames(20);
        add(await animAB(n, win, rounds));
      }
      // in the Saab at the start, the chase camera behind it
      await ev(() => { const g = __game; delete g.cam.update; const car = g.named.saab || g.cars.find((c) => !c.traffic); g.enterCar(car); });
      await frames(40);
      add(await animAB('saab', win, rounds));
      console.log('[t] pplanim sum', JSON.stringify(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, [+v[0].toFixed(2), +v[1].toFixed(2)]]))), ' [off, on]');
    },

    // Triangles and draw calls the people cost per frame (all passes) at fixed poses, plus how many
    // of them are at which level of detail (PPOSES=start,aerial picks poses).
    async pplperf() {
      await frames(30);
      const names = (process.env.PPOSES || Object.keys(POSES).join(',')).split(',');
      const tot = { tris: 0, calls: 0, pTris: 0, pCalls: 0 };
      for (const n of names) {
        const [at, look, fov] = POSES[n];
        await camAt(at, look, fov || 55);
        await frames(20);
        const f = +(await fps());
        const avg = async (k) => {
          const a = { tris: 0, calls: 0, aoCalls: 0, cpuMs: 0, shT: 0, aoT: 0, mT: 0 };
          for (let i = 0; i < k; i++) {
            await frames(1);
            const s = await ev(async () => { const { gfxStats } = await import('/src/gfx.js'); const P = gfxStats.pass; return { ...window.__stats(), shT: P.shadow[1], aoT: P.ao[1], mT: P.main[1] }; });
            for (const q in a) a[q] += s[q] / k;
          }
          return a;
        };
        const s1 = await avg(+(process.env.AVG || 30));
        const lods = await ev(() => {
          const g = __game, cnt = {};
          for (const c of [g.player, ...Object.values(g.npcs), ...g.peds.map((p) => p.char)]) {
            if (!c.root.visible || !c.root.parent) continue;
            let k = 'none';
            for (const l of c.model.lodNode?.levels || []) { const o = l.object; if (o.visible) k = (o.userData.lodName || 'l' + (c.model.lod ?? '?')) + (o.castShadow ? '' : '-noshadow') + (o.children.some((q) => q.userData.lodName === 'cards') ? '+cards' : ''); }
            cnt[k] = (cnt[k] || 0) + 1;
          }
          return cnt;
        });
        await peopleOut();
        const s0 = await avg(+(process.env.AVG || 30));
        await peopleIn();
        const M = (v) => +(v / 1e6).toFixed(3);
        const row = { fps: f, calls: Math.round(s1.calls), tris: +(s1.tris / 1e6).toFixed(2), cpuMs: +s1.cpuMs.toFixed(1), peopleCalls: Math.round(s1.calls - s0.calls), peopleTris: M(s1.tris - s0.tris), pass: [M(s1.shT - s0.shT), M(s1.aoT - s0.aoT), M(s1.mT - s0.mT)], lods };
        tot.tris += s1.tris; tot.calls += s1.calls; tot.pTris += s1.tris - s0.tris; tot.pCalls += s1.calls - s0.calls;
        console.log('[t] pplperf', n.padEnd(13), JSON.stringify(row));
      }
      console.log('[t] pplperf sum', JSON.stringify({ tris: +(tot.tris / 1e6).toFixed(2), calls: Math.round(tot.calls), peopleTris: +(tot.pTris / 1e6).toFixed(2), peopleCalls: Math.round(tot.pCalls) }));
    },

    // Ove kneels at Sonja's grave (st.kneel, the automatic sequence): going down with the flowers,
    // laying them on the spruce twigs, resting; the flowers' point (kneelPoint) logged against where
    // they are meant to land. The root goes 0.42 m (x the model's scale) behind that point.
    async pplkneel() {
      await frames(20);
      const r = await ev(async () => {
        const g = __game, s = __lm('sonjaGrave'), gf = __lm('graveFlowers');
        // the stone's front: from the sonjaGrave mark (1.55 m in front of the stone) towards the stone
        const fx = gf.x - s.x, fz = gf.z - s.z, L = Math.hypot(fx, fz), ux = fx / L, uz = fz / L;
        const yaw = Math.atan2(ux, uz);
        // the flowers on the twigs in front of the stone, ~0.85 m from its face
        const tx = s.x + ux * 0.62, tz = s.z + uz * 0.62, k = g.player.model.D.k;
        g.player.teleport(tx - ux * 0.42 * k, tz - uz * 0.42 * k, yaw);
        g.player.anim.kneel = true;
        window.__kneelT = { tx, tz, ux, uz, yaw };
        return { yaw: +yaw.toFixed(2), at: [+g.player.x.toFixed(2), +g.player.z.toFixed(2)], target: [+tx.toFixed(2), +tz.toFixed(2)] };
      });
      console.log('[t] kneel', JSON.stringify(r));
      const cam = (side, back, up, look) => ev(([side, back, up, look]) => {
        const g = __game, p = g.player, K = window.__kneelT;
        const sx = K.uz, sz = -K.ux;
        g.cam.update = function () {};
        const c = g.cam.cam;
        c.position.set(p.x + sx * side - K.ux * back, p.y + up, p.z + sz * side - K.uz * back);
        c.lookAt(p.x + K.ux * look, p.y + 0.55, p.z + K.uz * look); c.fov = 45; c.updateProjectionMatrix();
        g.hideHud = true; const h = document.getElementById('hud'); if (h) h.style.display = 'none';
      }, [side, back, up, look]);
      const kp = () => ev(async () => {
        const { kneelPoint } = await import('/src/actors/models.js');
        const g = __game, p = g.player; p.root.updateMatrixWorld(true);
        const v = kneelPoint(p.model); const K = window.__kneelT;
        return { kneelPoint: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], target: [+K.tx.toFixed(2), +K.tz.toFixed(2)], ground: +p.y.toFixed(2) };
      });
      await cam(2.2, 0.2, 1.0, 0.4); await frames(15); await shot('ppl_kneel_0');
      await frames(55); console.log('[t] kneel lay', JSON.stringify(await kp())); await shot('ppl_kneel_1');
      await frames(140); console.log('[t] kneel rest', JSON.stringify(await kp())); await shot('ppl_kneel_2');
      await cam(0.75, -0.85, 0.95, 0); await frames(6); await shot('ppl_kneel_3');
      await ev(() => { __game.player.anim.kneel = false; });
      await frames(40); await shot('ppl_kneel_up');
    },

    async people() {
      await frames(30);
      console.log('[t] fps ~', await fps());
      console.log('[t] stats', JSON.stringify(await ev(() => window.__stats())));
      // the player, face and poses (in the world's light)
      await faceCam('player', 0.85, 0.15); await frames(6); await shot('ppl_ove_face');
      await faceCam('player', 0.95, 0.9); await frames(4); await shot('ppl_ove_34');
      // (main.js sets anim.phone / anim.write every frame: drive them the way it does)
      await ev(() => { __game.interrupts.onPhone = true; });
      await frames(30);
      await faceCam('player', 1.3, -1.25, 38); await frames(4); await shot('ppl_ove_phone');
      await ev(() => { __game.interrupts.onPhone = false; __game.pose = 'write'; __game.poseT = 99; });
      await frames(30);
      await faceCam('player', 1.2, -0.5, 40); await frames(4); await shot('ppl_ove_write');
      await ev(() => { __game.poseT = 0; });
      // the cat in Ove's arms, the way main.js carries it (setCarrying -> anim.carry, carryPoint, hold)
      await ev(async () => {
        const { buildCat } = await import('/src/actors/models.js');
        const g = __game, c = buildCat(); g.scene.add(c.root); window.__pcat = c; g.setCarrying(c);
      });
      await frames(40);
      await faceCam('player', 1.5, 0.7, 40); await frames(4); await shot('ppl_ove_carry');
      await faceCam('player', 0.9, 0.35, 40); await frames(4); await shot('ppl_ove_carry_close');
      await ev(() => { const g = __game; g.setCarrying(null); g.scene.remove(window.__pcat.root); });
      // hold-E jobs, the way stages.holdAt poses him (pose 'work' + its kind)
      for (const [kind, ang] of [['shovel', 1.2], ['low', 1.3], ['wall', 0.9]]) {
        await ev((kind) => { const g = __game; g.pose = 'work'; g.poseKind = kind; g.poseT = 99; }, kind);
        await frames(30);
        await faceCam('player', 2.2, ang, 50); await frames(4); await shot('ppl_ove_work_' + kind);
      }
      await ev(() => { __game.poseT = 0; });
      // neighbours and a pedestrian
      for (const k of ['parvaneh', 'anita', 'rune', 'jimmy', 'sara']) {
        console.log('[t] face', k, JSON.stringify(await faceCam(k, 0.9, 0.25)));
        await frames(4);
        await shot('ppl_' + k);
      }
      await ev(() => {
        const g = __game, p = g.player;
        let best = null, bd = 1e9;
        for (const q of g.peds) { const c = q.char; const d = Math.hypot(c.x - p.x, c.z - p.z); if (c.state === 'normal' && d < bd) { bd = d; best = c; } }
        window.__ped = best;
      });
      await faceCam('ped', 1.1, 0.3, 34); await frames(4); await shot('ppl_ped');
      // the HUD portraits, rendered here with the game's renderer
      await ev(async () => {
        const { renderPortrait } = await import('/src/game/hud.js');
        const { renderer } = await import('/src/gfx.js');
        const g = __game;
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;z-index:99;background:#3a4048;display:flex;flex-wrap:wrap;gap:8px;padding:12px;align-content:flex-start';
        const list = [['Ove', g.player], ...['parvaneh', 'patrick', 'jimmy', 'adrian', 'anita', 'rune', 'anders', 'sara'].map((k) => [k, g.npc(k)]).filter(([, c]) => c)];
        for (const [n, c] of list) {
          const url = renderPortrait(renderer, c.model);
          box.insertAdjacentHTML('beforeend', `<figure style="margin:0;text-align:center;color:#ddd;font:14px sans-serif"><img src="${url}" style="width:220px;height:220px;border-radius:6px;display:block">${n}</figure>`);
        }
        document.body.appendChild(box);
      });
      await frames(4);
      await shot('ppl_portraits');
    },

    // A pedestrian steps in front of the Saab: the fall (flung), lying, getting up (shot.mjs' own smash
    // still looks for the old world's birchWagon).
    async pplsmash() {
      const r = await ev(() => {
        const g = __game, car = g.named.saab || g.cars.find((c) => !c.traffic);
        g.enterCar(car);
        // an open street lane (the road centre lines run along z at x = 40 + k * 80), heading +z
        let x = 40 + 2.75, z = -30;
        for (const k of [0, -1, 1, -2, 2]) { const xx = 40 + k * 80 + 2.75; if (!g.spotFree || g.spotFree(xx, z)) { x = xx; break; } }
        car.place(x, z, 0);
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        let best = null;
        for (const q of g.peds) if (q.char.state === 'normal') { best = q; break; }
        const ped = best.char;
        ped.teleport(car.x + fx * 11, car.z + fz * 11);
        best.idleT = 8;
        window.__ped = ped;
        return { car: car.spec?.name, ped: ped.def.age + ' ' + ped.def.coat?.type };
      });
      console.log('[t] smash', JSON.stringify(r));
      const follow = () => ev(() => {
        const g = __game, p = window.__ped, c = g.playerCar;
        const cam = g.cam.cam; g.cam.update = function () {};
        const sx = Math.cos(c.yaw), sz = -Math.sin(c.yaw);
        cam.position.set(p.x + sx * 4.5, 1.6, p.z + sz * 4.5); cam.lookAt(p.x, 0.6, p.z);
        cam.fov = 45; cam.updateProjectionMatrix();
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
        return p.state;
      });
      await page.keyboard.down('KeyW');
      let st = 'normal';
      for (let i = 0; i < 80 && st === 'normal'; i++) {
        await frames(2); st = await ev(() => window.__ped.state);
        if (i % 20 === 0) console.log('[t] drive', JSON.stringify(await ev(() => { const c = __game.playerCar, p = window.__ped; return { v: +c.speed.toFixed(1), d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(1), drv: __game.player.state }; })));
      }
      await page.keyboard.up('KeyW');
      await ev(() => { const c = __game.playerCar; c.vx = c.vz = 0; });
      console.log('[t] ped state', st);
      await frames(6); console.log('[t]', await follow()); await shot('ppl_smash_flung');
      for (let i = 0; i < 60 && (await ev(() => window.__ped.state)) !== 'down'; i++) await frames(3);
      await frames(20); console.log('[t]', await follow()); await shot('ppl_smash_down');
      for (let i = 0; i < 120 && (await ev(() => window.__ped.timer)) > 0.7; i++) await frames(3);
      console.log('[t]', await follow()); await shot('ppl_smash_getup');
      await frames(60); console.log('[t]', await follow()); await shot('ppl_smash_up');
    },

    async peopledrive() {
      const info = await ev(() => {
        const g = __game;
        const car = g.named.saab || g.named.birchWagon || g.cars.find((c) => !c.traffic);
        g.enterCar(car);
        return { car: car.spec?.name, x: car.x.toFixed(1), z: car.z.toFixed(1) };
      });
      console.log('[t] car', JSON.stringify(info));
      await frames(40);
      // through the windscreen at the driver
      await ev(() => {
        const g = __game, c = g.playerCar, p = g.player;
        c.root.updateMatrixWorld(true); p.root.updateMatrixWorld(true);
        const e = p.model.head.matrixWorld.elements;
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        const cam = g.cam.cam; g.cam.update = function () {};
        cam.position.set(e[12] + fx * 2.2 - fz * 0.5, e[13] + 0.25, e[14] + fz * 2.2 + fx * 0.5); cam.lookAt(e[12], e[13] - 0.25, e[14]);
        cam.fov = 40; cam.updateProjectionMatrix();
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
      });
      await frames(4);
      await shot('ppl_drive_windscreen');
      // a traffic driver: the nearest car with a bust, from beside its front wheel
      const t = await ev(() => {
        const g = __game, p = g.playerCar;
        let best = null, bd = 1e9;
        for (const c of g.cars) if (c.driverBust && c !== p) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
        if (!best) return null;
        best.root.updateMatrixWorld(true);
        const b = best.driverBust; const e = b.matrixWorld.elements;
        const fx = Math.sin(best.yaw), fz = Math.cos(best.yaw);
        const cam = g.cam.cam;
        cam.position.set(e[12] + fx * 2.0 + fz * 1.6, e[13] + 0.75, e[14] + fz * 2.0 - fx * 1.6); cam.lookAt(e[12], e[13] + 0.55, e[14]);
        cam.fov = 40; cam.updateProjectionMatrix();
        return { d: bd.toFixed(1), type: best.spec?.name };
      });
      console.log('[t] bust car', JSON.stringify(t));
      await frames(4);
      await shot('ppl_drive_bust');
    },

    // The legs of people sitting in cars (features/implemented/ben_i_marken_vid_bilkorning.md): every
    // car model in turn on the same empty street, a traffic bust at the wheel and neighbours beside and
    // behind it (Ove at the wheel of the Saab, Rune in the Volvo 240), seen low from both sides and
    // from the front and rear corners (ppl_seat_<model>_<view>.png: L = the driver's side, Lg / Rg at
    // the road).
    // Check: nothing of a seated person below the seat cushion can be seen from any of those views (a
    // ray from each such vertex to the lens meets the car's body; the wheels, drawn apart, don't
    // count); the lowest point of each is logged against the cushion. Failures are console errors.
    async seatlegs() {
      await frames(20);
      const start = await ev(() => {
        const g = __game;
        // an empty street: traffic out and none coming back, the camera ours
        g.recycleTraffic = function () {};
        for (const c of g.cars.slice()) if (c.traffic) g.removeCar(c);
        g.hideNearCamera = function () {};
        g.cam.update = function () {};
        g.hideHud = true; document.getElementById('hud').style.display = 'none';
        // a straight stretch of a north-south street (centre lines at x = 40 + k * 80), on its centre
        // line (room for a lens on either side), away from the parked cars
        let best = null;
        for (const k of [0, -1, 1, -2, 2]) for (const z of [-30, 30, -110, 110]) {
          const x = 40 + k * 80;
          if (best) break;
          let ok = true;
          for (const c of g.cars) if (Math.abs(c.x - x) < 12 && Math.abs(c.z - z) < 18) ok = false;
          if (ok && g.spotFree(x, z)) best = { x, z };
        }
        window.__seatAt = best;
        return best;
      });
      console.log('[t] seat street', JSON.stringify(start));
      const CARS = [
        { type: 'volvo240', fp: 'parvaneh', rl: 'rune', rr: 'nasanin' },
        { type: 'volvo740', fp: 'parvaneh', rl: 'jimmy', rr: 'sara' },
        { type: 'audi', drv: 'anders', fp: 'parvaneh', rl: 'jimmy' },
        { type: 'bmw', fp: 'parvaneh', rl: 'patrick' },
        { type: 'skoda', drv: 'patrick', fp: 'parvaneh', rl: 'jimmy' },
        { type: 'golf', fp: 'parvaneh', rl: 'anita' },
        { type: 'kombi', fp: 'parvaneh', rl: 'jimmy' },
        { type: 'taxi', fp: 'parvaneh', rl: 'adrian' },
        { type: 'van', fp: 'parvaneh' },
        { type: 'bus', fp: 'parvaneh' },
        { type: 'garbage', fp: 'parvaneh' },
        // (the snow tractor: one seat, a cab with a floor - the lower legs stay, nothing below the floor)
        { type: 'tractor', drv: 'ove' },
        { type: 'saab900', drv: 'ove', fp: 'parvaneh' },
      ];
      const fails = [];
      for (const cfg of CARS) {
        await ev(async (cfg) => {
          const g = __game, at = window.__seatAt;
          const { Car } = await import('/src/actors/car.js');
          const { randomPed } = await import('/src/actors/models.js');
          if (window.__seatCar) {
            if (g.playerCar === window.__seatCar) { g.exitCar(true); g.player.teleport(at.x + 20, at.z - 25); }
            g.removeCar(window.__seatCar);
            window.__seatCar = null;
          }
          const car = new Car(cfg.type, { engineOn: false });
          const len = car.spec.len;
          car.place(at.x, at.z + Math.max(0, len - 5) * 0.3, 0);
          g.addCar(car);
          window.__seatCar = car;
          if (cfg.drv === 'ove') g.enterCar(car);
          else if (cfg.drv) g.seat(g.npc(cfg.drv), car, 1);
          else g.addBust(randomPed(() => 0.37), car);
          const sides = { fp: -1, rl: 2, rr: -2 };
          for (const k of ['fp', 'rl', 'rr']) if (cfg[k] && (Math.abs(sides[k]) < 2 || car.model.rear)) g.seat(g.npc(cfg[k]), car, sides[k]);
          car.ctrl.park = true;
        }, cfg);
        await frames(30);
        // low views round the car (forward = +z, the driver's side = +x): both sides at knee height
        // and at the road (Lg, Rg: under the sills), the front-left and rear-right corners
        const VIEWS = [['L', 1, 0, 3.5, 0.45], ['R', -1, 0, 3.5, 0.45], ['FL', 0.75, 0.75, 4.5, 0.6], ['RR', -0.75, -0.75, 4.5, 0.6], ['Lg', 1, 0, 3, 0.12], ['Rg', -1, 0, 3, 0.12]];
        const cams = await ev((VIEWS) => {
          const car = window.__seatCar, s = car.spec;
          const out = [];
          for (const [name, lx, lz, d, h] of VIEWS) {
            const k = d + Math.max(s.wid, s.len * Math.hypot(lz, 0)) / 2;
            out.push({ name, pos: [car.x + lx * k, car.y + h, car.z + lz * (k + (lz ? s.len * 0.25 : 0))], look: [car.x, car.y + 0.5, car.z] });
          }
          return out;
        }, VIEWS);
        // the check: the vertices of everyone seated that lie below the cushion, rays to each lens
        const chk = await ev(async (cams) => {
          const THREE = await import('three');
          const g = __game, car = window.__seatCar;
          car.root.updateMatrixWorld(true);
          const occl = [car.body, car.snowCap].filter(Boolean);
          const inv = new THREE.Matrix4().copy(car.tilt.matrixWorld).invert();
          const people = [];
          if (car.driverBust) people.push({ who: 'bust', mesh: car.driverBust.children[0], skinned: false });
          // (a vertex wholly on bones scaled away - the folded shins, Rune's wheelchair - is drawn as
          // nothing: degenerate triangles)
          const gone = (m) => { const r = m.matrixWorld.determinant(); return m.skeleton.bones.map((b) => Math.abs(b.matrixWorld.determinant() / r) < 1e-6); };
          for (const p of [car.driver, ...car.passengers]) if (p) { p.sync(0); p.root.updateMatrixWorld(true); people.push({ who: p.key || 'ove', mesh: p.model.mesh, skinned: true }); }
          const rc = new THREE.Raycaster(), v = new THREE.Vector3(), l = new THREE.Vector3(), dir = new THREE.Vector3(), cp = new THREE.Vector3();
          const res = [];
          for (const P of people) {
            const m = P.mesh, pos = m.geometry.attributes.position;
            if (P.skinned) m.skeleton.update();
            const G = P.skinned ? gone(m) : null, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
            let minY = 1e9;
            const low = [], lim = car.model.legRoom ? car.model.floor : car.model.seat[1];
            for (let i = 0; i < pos.count; i++) {
              if (G) { let w = 0; for (let k = 0; k < 4; k++) if (G[si.getComponent(i, k)]) w += sw.getComponent(i, k); if (w > 0.999) continue; }
              if (P.skinned) m.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
              v.applyMatrix4(m.matrixWorld);
              l.copy(v).applyMatrix4(inv);
              minY = Math.min(minY, l.y);
              if (l.y < lim - 0.005) low.push(v.clone());
            }
            const vis = {};
            for (const c of cams) {
              cp.set(...c.pos);
              let n = 0;
              // (from the lens to the vertex: the body's faces are one-sided, seen from outside)
              for (let i = 0; i < low.length; i += 2) {
                dir.copy(low[i]).sub(cp);
                const d = dir.length(); dir.normalize();
                rc.set(cp, dir); rc.near = 0; rc.far = d - 0.003;
                if (!rc.intersectObjects(occl, false).length) n++;
              }
              vis[c.name] = n;
            }
            res.push({ who: P.who, below: +(minY - lim).toFixed(2), low: low.length, vis });
          }
          return res;
        }, cams);
        console.log('[t] seat', cfg.type.padEnd(9), JSON.stringify(chk));
        for (const q of chk) if (Object.values(q.vis).some((n) => n > 0)) fails.push('below the seat and in sight: ' + cfg.type + ' ' + q.who + ' ' + JSON.stringify(q.vis));
        const names = [];
        for (const c of cams) {
          await ev((c) => { const cam = __game.cam.cam; cam.position.set(...c.pos); cam.lookAt(...c.look); cam.fov = 40; cam.updateProjectionMatrix(); }, c);
          await frames(3);
          const n = 'ppl_seat_' + cfg.type + '_' + c.name;
          await shot(n);
          names.push(n);
        }
        console.log('[t] seatshots', JSON.stringify({ type: cfg.type, names }));
      }
      // out again: the lower legs are back on the first frame (posed at once, whatever the animation
      // level of detail), for Ove and for someone getting out 150 m from the lens (posed every 4th)
      const back = await ev(async () => {
        const g = __game, car = window.__seatCar, pv = g.npc('parvaneh'), an = g.npc('anita');
        const cam = g.cam.cam;
        g.seat(an, car, 2);
        cam.position.set(car.x + 150, car.y + 2, car.z); cam.lookAt(car.x + 200, car.y + 2, car.z);
        for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
        const stride = an.lodEvery;
        g.exitCar(true); g.unseat(pv); g.unseat(an);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return { stride, ...Object.fromEntries([['ove', g.player], ['parvaneh', pv], ['anita', an]].map(([k, c]) => [k, c.model.shins.map((s) => s.scale.x)])) };
      });
      console.log('[t] seat out', JSON.stringify(back));
      for (const k of ['ove', 'parvaneh', 'anita']) if (back[k].some((s) => s !== 1)) fails.push(k + ' got out without the lower legs');
      for (const f of fails) await ev((f) => console.error('seatlegs: ' + f), f);
      console.log('[t] seatlegs', fails.length ? fails.length + ' failed' : 'all hidden');
    },
  };
};
