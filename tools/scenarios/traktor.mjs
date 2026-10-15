// The association's snow tractor, drivable (features/implemented/snotraktor.md).
//   traktorlook   close-ups of the parked tractor (six views round it, a wide one of the lot), Ove
//                 at the wheel (through the side glass and the windscreen), its far LOD body
//   traktor       real keys: Ove walks up, E gets him in (one seat: Parvaneh can't come along), out
//                 of the bay backwards, along the aisle and the street at full throttle (the speed
//                 cap), onto the car-free walkway (no Ordning lost there, the prompt says why), over
//                 the snowy lawn (the blade's spray), the horn, the beacon, E out (his lower legs
//                 are there all along: the cab has a floor, nothing of him below it in sight)
// Failed checks are console errors ('N errors' at the end).
export default ({ page, ev, shot, frames, sleep, tap, errors }) => {
  const fail = (msg) => ev((m) => console.error('traktor: ' + m), msg);
  const check = (label, ok, info) => { console.log('[t] traktor', label, ok ? 'OK' : 'BAD', info === undefined ? '' : JSON.stringify(info)); if (!ok) errors.push('traktor ' + label); return ok; };
  // Real keys, held: `want` the set down now (the rest let go).
  const down = new Set();
  const keys = async (want) => {
    for (const k of [...down]) if (!want.includes(k)) { await page.keyboard.up(k); down.delete(k); }
    for (const k of want) if (!down.has(k)) { await page.keyboard.down(k); down.add(k); }
  };
  const car = () => ev(() => { const c = __game.playerCar; return c && { kind: c.kind, x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, kmh: Math.abs(c.forwardSpeed) * 3.6 }; });
  // Drive through the points ([x, z]) with W and A / D by the heading error (bang-bang, like a
  // player on the keyboard; S brakes for a sharp turn). Returns the highest speed seen (km/h).
  const drive = async (pts, { maxMs = 40000, reach = 3, slowTurn = 0.6 } = {}) => {
    let i = 0, top = 0;
    const t0 = Date.now();
    while (i < pts.length && Date.now() - t0 < maxMs) {
      const s = await car();
      if (!s) break;
      top = Math.max(top, s.kmh);
      const [tx, tz] = pts[i];
      if (Math.hypot(tx - s.x, tz - s.z) < reach) { i++; continue; }
      let err = Math.atan2(tx - s.x, tz - s.z) - s.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      const k = [];
      if (Math.abs(err) > slowTurn && s.v > 5) k.push('KeyS'); else k.push('KeyW');
      // (positive steer, D, turns right: the yaw falls)
      if (err < -0.05) k.push('KeyD'); else if (err > 0.05) k.push('KeyA');
      await keys(k);
      await sleep(50);
    }
    await keys([]);
    return { reached: i >= pts.length, top: +top.toFixed(1) };
  };
  // Freeze the camera rig and put the camera at (at) looking at (look), world coordinates.
  const camAt = (at, look, fov = 40) => ev(([at, look, fov]) => {
    const g = __game, c = g.cam.cam;
    g.cam.update = function () {};
    g.hideNearCamera = function () {};
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    g.hideHud = true; const h = document.getElementById('hud'); if (h) h.style.display = 'none';
  }, [at, look, fov]);
  // A point in the tractor's frame (x = its left, z = forward, y up) in the world.
  const local = (lx, y, lz) => ev(([lx, y, lz]) => {
    const t = __game.named.tractor, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    return [t.x + fz * lx + fx * lz, t.y + y, t.z - fx * lx + fz * lz];
  }, [lx, y, lz]);
  // A straight 20 m of open snowy lawn (heading +x, 1.2 m clear either side): { x, z } or null.
  const findLawn = () => ev(async () => {
    const { fx } = await import('/src/game/fx.js');
    const g = __game;
    // (round the field and the park first, then anywhere in town)
    const starts = [];
    for (const n of ['field', 'park']) { const m = window.__lm(n); if (m) for (let dx = -24; dx <= 24; dx += 4) for (let dz = -24; dz <= 24; dz += 4) starts.push([m.x + dx, m.z + dz]); }
    for (let x0 = -280; x0 <= 280; x0 += 6) for (let z0 = -280; z0 <= 280; z0 += 6) starts.push([x0, z0]);
    for (const [x0, z0] of starts) {
      let ok = true;
      for (let d = -3; d <= 18 && ok; d += 1) for (const o of [-1.2, 0, 1.2]) { const x = x0 + d, z = z0 + o; if (fx.surfaceAt(x, z) !== 'snow' || !g.spotFree(x, z) || g.groundAt(x, z) > 0.4) ok = false; }
      if (ok) return { x: x0, z: z0 };
    }
    return null;
  });
  const views = async (prefix, list) => {
    for (const [name, at, look, fov] of list) {
      await camAt(await local(...at), await local(...look), fov);
      await frames(8);
      await shot(prefix + name);
    }
  };

  return {
    async traktorlook() {
      await frames(20);
      const info = await ev(() => {
        const t = __game.named.tractor;
        if (!t) return null;
        return { x: +t.x.toFixed(2), z: +t.z.toFixed(2), yaw: +t.yaw.toFixed(2), kind: t.kind, len: t.spec.len, wid: t.spec.wid, h: t.height, tris: Math.round(t.model.tris), lodTris: Math.round(t.model.lodTris), plate: t.plate };
      });
      console.log('[t] tractor', JSON.stringify(info));
      if (!info) { await fail('no named tractor'); return; }
      await views('trk_', [
        ['fl', [3.2, 1.6, 4.2], [0, 1.0, 0.2], 45],
        ['fr', [-3.4, 1.9, 3.6], [0, 1.0, 0.2], 45],
        ['left', [5.2, 1.4, 0.2], [0, 1.1, 0.2], 45],
        ['right', [-5.2, 1.6, -0.4], [0, 1.1, 0.0], 45],
        ['rear', [-1.6, 1.8, -5.6], [0, 1.0, 0.0], 45],
        ['rl', [3.4, 2.6, -4.2], [0, 1.0, 0.0], 45],
        ['high', [4.5, 6.5, 2.5], [0, 0.6, 0.3], 45],
        ['wide', [9, 3.2, 14], [0, 1.0, 0.0], 50],
        ['blade', [1.2, 0.9, 4.0], [0, 0.4, 2.0], 45],
      ]);
      // Ove at the wheel
      await ev(() => { const g = __game, t = g.named.tractor; g.player.teleport(t.x + Math.cos(t.yaw) * 1.6, t.z - Math.sin(t.yaw) * 1.6, t.yaw); g.enterCar(t); });
      await frames(20);
      await views('trk_ove_', [
        ['side', [2.6, 1.9, -0.6], [0, 1.5, -0.6], 40],
        ['front', [0.6, 2.0, 3.6], [0, 1.5, -0.6], 40],
        ['door', [1.6, 2.4, 0.4], [0, 1.0, -0.4], 45],
      ]);
      // far: the LOD body (beyond 46 m)
      await views('trk_far_', [['lod', [-25, 32, 45], [0, 1.0, 0], 9]]);
    },

    // The blade's spray on a snowy lawn: the chase camera, then side views (the side it throws to,
    // ahead and behind) at full throttle; PLOG_KMH= a lower speed held instead (S taps).
    async traktorplog() {
      await frames(20);
      const lawn = await findLawn();
      console.log('[t] lawn', JSON.stringify(lawn));
      if (!lawn) { await fail('no snowy lawn'); return; }
      await ev(async (lawn) => {
        const { fx } = await import('/src/game/fx.js');
        const g = __game, t = g.named.tractor;
        g.player.teleport(t.x + 3, t.z); g.enterCar(t);
        t.place(lawn.x - 3, lawn.z, Math.PI / 2);
        g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
        window.__pw = 0; const p = fx.powder; fx.powder = function (...a) { window.__pw++; return p.apply(this, a); };
      }, lawn);
      await frames(10);
      await keys(['KeyW']);
      await sleep(1500);
      await shot('trk_plog_chase');
      for (const [n, at, look] of [['side', [-5.5, 1.3, 4.5], [-0.5, 0.9, 1.0]], ['ahead', [-2.5, 1.0, 9], [-1.0, 0.8, 1.5]], ['behind', [-6, 2.2, -3], [-1.5, 0.6, 2.0]], ['above', [-4, 6, 6], [-1.5, 0.3, 2.0]]]) {
        await camAt(await local(...at), await local(...look), 50);
        await sleep(300);
        await shot('trk_plog_' + n);
      }
      await keys([]);
      console.log('[t] plog', JSON.stringify(await ev(() => ({ puffs: window.__pw, kmh: +(__game.playerCar.forwardSpeed * 3.6).toFixed(1) }))));
    },

    async traktor() {
      await frames(20);
      // what the sound and the effects are asked for, from here on
      await ev(async () => {
        const { audio } = await import('/src/audio.js');
        const { fx } = await import('/src/game/fx.js');
        const R = window.__trk = { engine: null, horn: [], powder: 0 };
        const e = audio.engine, h = audio.horn, p = fx.powder;
        audio.engine = function (on, ...a) { if (on) R.engine = a[4] ?? null; return e.call(this, on, ...a); };
        audio.horn = function (on, kind) { if (on) R.horn.push(kind); return h.call(this, on, kind); };
        fx.powder = function (...a) { R.powder++; return p.apply(this, a); };
      });
      // 1. On foot by the cab's door (its left), Parvaneh along with him: the prompt, E (a real key).
      const at = await ev(() => {
        const g = __game, t = g.named.tractor, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
        const x = t.x + fz * 1.7 - fx * 0.6, z = t.z - fx * 1.7 - fz * 0.6, yaw = Math.atan2(t.x - x, t.z - z);
        g.player.teleport(x, z, yaw);
        g.cam.yaw = yaw; g.cam.snapNext = true;
        const pv = g.npc('parvaneh');
        pv.teleport(x + fz * 1.2, z - fx * 1.2, yaw);
        g.addCompanion(pv);
        return { x: +x.toFixed(2), z: +z.toFixed(2), tractor: [+t.x.toFixed(2), +t.z.toFixed(2), +t.yaw.toFixed(2)] };
      });
      await frames(15);
      let s = await ev(() => ({ it: __game.nearestInteractable()?.car?.kind || null, prompt: document.getElementById('prompt')?.textContent || '' }));
      check('the tractor is in reach, E to get in', s.it === 'tractor' && /Kliv in/.test(s.prompt), { ...at, ...s });
      await shot('trk_1_before');
      await tap('KeyE');
      await frames(30);
      s = await ev(() => {
        const g = __game, t = g.named.tractor, pv = g.npc('parvaneh');
        return { inCar: g.playerCar?.kind || null, driver: t.driver === g.player, pvCar: pv.car?.kind || null, passengers: t.passengers.length, free: g.freeSeat(t), toast: [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | '), speedo: document.querySelector('.sp-name')?.textContent || '', shins: g.player.model.shins.map((x) => x.scale.x) };
      });
      check('E: Ove at the wheel', s.inCar === 'tractor' && s.driver, s);
      check('one seat: Parvaneh stays outside', !s.pvCar && s.passengers === 0 && s.free === null, s);
      check('the speedo names it', s.speedo === 'Föreningens traktor', s.speedo);
      check('the first time: whose it is', /snöröjningstraktor/.test(s.toast), s.toast);
      check('his lower legs stay in the cab', s.shins.every((v) => v === 1), s.shins);
      await ev(() => { const g = __game; g.releaseNpc(g.npc('parvaneh')); });
      // nothing of him below the cab's floor (car frame), the highest point under the headliner
      const body = await ev(async () => {
        const THREE = await import('three');
        const g = __game, t = g.playerCar, p = g.player;
        p.sync(0); p.root.updateMatrixWorld(true); t.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(t.tilt.matrixWorld).invert(), m = p.model.mesh, pos = m.geometry.attributes.position, v = new THREE.Vector3();
        m.skeleton.update();
        let lo = 9, hi = -9, front = -9;
        for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(inv); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); front = Math.max(front, v.z); }
        return { floor: t.model.floor, lowest: +lo.toFixed(3), crown: +hi.toFixed(3), front: +front.toFixed(3) };
      });
      check('his feet on the floor, his head under the roof', body.lowest > body.floor - 0.01 && body.lowest < body.floor + 0.08 && body.crown < 2.25, body);
      // 2. Out of the bay (nose out): right, along the aisle to the lot's entrance, onto the street,
      // south at full throttle (the cap: 40 km/h).
      await shot('trk_2_seated');
      let r = await drive([[25.2, -24.6], [12, -24.4], [-12, -24.4], [-27, -24.0], [-31.5, -22.8], [-37.5, -24.5], [-38.4, -30]], { maxMs: 45000, reach: 2.5 });
      s = await car();
      check('out of the bay and the lot by the keys', r.reached, { ...r, at: s && [+s.x.toFixed(1), +s.z.toFixed(1)] });
      await shot('trk_3_street');
      r = await drive([[-38.4, -112]], { maxMs: 25000, reach: 4 });
      s = await car();
      check('full throttle on the street: 35-40.5 km/h at most', r.top >= 35 && r.top <= 40.5, { ...r, at: s && [+s.x.toFixed(1), +s.z.toFixed(1)] });
      await keys(['KeyS']); await sleep(2500); await keys([]);
      // 3. The horn and the beacon.
      await ev(() => { window.__bc = 0; const g = __game; g.onFrame?.(() => { const c = g.playerCar; if (c?.lightMat) window.__bc = Math.max(window.__bc, c.lightMat.userData.ch[8] || 0); }); });
      await keys(['KeyT']); await sleep(500); await keys([]);
      await sleep(800);
      s = await ev(() => ({ horn: window.__trk.horn.slice(-3), engine: window.__trk.engine, beacon: window.__bc }));
      check('its own horn and engine', s.horn.includes('tractor') && s.engine === 'tractor', s);
      check('the beacon flashes', s.beacon > 1, s.beacon);
      // 4. The car-free walkway: no Ordning lost in the tractor, the prompt says why (the Saab on the
      // same stretch, the same time, as the yardstick).
      const lane = await ev(async () => {
        const { isCarFree } = await import('/src/world/layout.js');
        const g = __game;
        for (const [x0, z0, yaw] of [[-3, 5.0, Math.PI / 2], [22, 5.0, -Math.PI / 2], [0, -6, 0], [0, 8, 0], [-26, 4.6, Math.PI / 2]]) {
          const fx = Math.sin(yaw), fz = Math.cos(yaw);
          let ok = true;
          for (let d = -3; d <= 14; d += 1) { const x = x0 + fx * d, z = z0 + fz * d; if (!isCarFree(x, z) || !g.spotFree(x, z) || !g.spotFree(x + fz * 1.1, z - fx * 1.1) || !g.spotFree(x - fz * 1.1, z + fx * 1.1)) { ok = false; break; } }
          if (ok) return { x: x0, z: z0, yaw };
        }
        return null;
      });
      if (!check('a free stretch of walkway', !!lane, lane)) return;
      // (the game time spent moving in the car-free area: the headless frame rate may run the game
      // slower than the clock)
      await ev(async () => { const { isCarFree } = await import('/src/world/layout.js'); const g = __game; window.__cf = 0; g.onFrame((dt) => { const c = g.playerCar; if (c && c.speed > 0.6 && isCarFree(c.x, c.z)) window.__cf += dt; }); });
      const walk = async (kind) => {
        await ev(([lane, kind]) => {
          const g = __game, P = g.patrol;
          window.__cf = 0;
          const c = kind === 'tractor' ? g.named.tractor : g.named.saab;
          if (g.playerCar !== c) { if (g.playerCar) g.exitCar(true); g.player.teleport(c.x + 3, c.z); g.enterCar(c); }
          c.place(lane.x, lane.z, lane.yaw); c.ctrl.park = false;
          g.cam.yaw = lane.yaw; g.cam.snapNext = true;
          P.ordning = 50;
        }, [lane, kind]);
        await frames(5);
        const o0 = await ev(() => __game.patrol.ordning);
        await keys(['KeyW']); await sleep(1800);
        const prompt = await ev(() => document.getElementById('prompt')?.textContent || '');
        await keys(['KeyS']); await sleep(900); await keys([]);
        const o1 = await ev(() => __game.patrol.ordning);
        return { kind, d: +(o1 - o0).toFixed(2), inZone: +(await ev(() => window.__cf)).toFixed(2), prompt };
      };
      const wt = await walk('tractor');
      await shot('trk_4_walkway');
      const ws = await walk('saab900');
      // (both lose what the open violations drain; the Saab 1 a second on top, while it moves there)
      check('on the walkway: no Ordning lost in the tractor (the Saab loses ~1/s)', wt.inZone > 1 && ws.inZone > 1 && wt.d - ws.d > 0.8 * ws.inZone && /Snöröjning/.test(wt.prompt) && /Bilfritt/.test(ws.prompt), { tractor: wt, saab: ws });
      // 5. Over the snow: the blade's spray (a lawn beside the block, by the keys).
      const lawn = await findLawn();
      if (check('a free snowy lawn', !!lawn, lawn)) {
        await ev((lawn) => { const g = __game; if (g.playerCar !== g.named.tractor) { g.exitCar(true); g.player.teleport(g.named.tractor.x + 3, g.named.tractor.z); g.enterCar(g.named.tractor); } const c = g.playerCar; c.place(lawn.x, lawn.z, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true; window.__trk.powder = 0; }, lawn);
        await frames(5);
        await keys(['KeyW']); await sleep(1700);
        await shot('trk_5_plough');
        // from the side it throws the snow to (the right), a little ahead
        await camAt(await local(-5.5, 1.3, 4.5), await local(-0.5, 0.9, 1.0), 50);
        await sleep(450);
        await shot('trk_5_plough_side');
        await ev(() => { const g = __game; delete g.cam.update; g.hideHud = false; document.getElementById('hud').style.display = ''; g.cam.snapNext = true; });
        s = await ev(async () => {
          const { fx } = await import('/src/game/fx.js');
          const c = __game.playerCar, b = c.model.blade, fx_ = Math.sin(c.yaw), fz = Math.cos(c.yaw), px = c.x + fz * b.x + fx_ * b.z, pz = c.z - fx_ * b.x + fz * b.z;
          return { powder: window.__trk.powder, onSnow: c.onSnow, kmh: +(c.forwardSpeed * 3.6).toFixed(1), blade: fx.surfaceAt(px, pz), at: [+c.x.toFixed(1), +c.z.toFixed(1)] };
        });
        await keys(['KeyS']); await sleep(900); await keys([]);
        check('the blade throws the snow aside', s.powder >= 20, s);
      }
      // 6. E out: on his feet beside it, the lower legs there.
      await frames(20);
      await tap('KeyE');
      await frames(10);
      s = await ev(() => { const g = __game, t = g.named.tractor; return { inCar: !!g.playerCar, state: g.player.state, d: +Math.hypot(g.player.x - t.x, g.player.z - t.z).toFixed(2), shins: g.player.model.shins.map((x) => x.scale.x) }; });
      check('E: out again, on his feet', !s.inCar && s.state === 'normal' && s.d < 4 && s.shins.every((v) => v === 1), s);
      await shot('trk_6_out');
    },
  };
};
