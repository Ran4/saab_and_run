// World-area scenarios (owned by the world agent). Loaded by tools/shot.mjs.
//   validate  - checks the whole DESIGN §6 contract in the page (spots, zones, landmarks, boxes,
//               collectibles, pedLoops, car sweeps along mission routes, verge trees at junctions)
//   wperf     - fps + __stats() at fixed camera poses (start, lot, centrum, hospital, street, aerial)
//   wviews    - screenshots from fixed camera poses (WVIEWS=name1,name2 to pick a subset)
//   meshstats - triangles / draw groups per world mesh
//   atlas     - dumps the sign atlas pages to out/atlas_*.png
//   wsaab     - (phase 4 r2b) Ove's Saab from the chase camera in sun / shade: its paint must read blue
//   wsign     - (phase 4 r2b) Bilhallen's welcome sign: no mullion between the forecourt and its text
export default ({ page, ev, shot, frames, sleep, fps, tap, OUT }) => {
  // Freeze the camera rig and place the camera ourselves (no gameplay camera, no HUD).
  const cam = (at, look, fov = 55) => ev((at, look, fov) => {
    const g = window.__game;
    g.cam.update = function () {};
    const c = g.cam.cam;
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
    // (the title card may still be fading out in the first seconds of a test run)
    const t = document.getElementById('title'); if (t) t.style.display = 'none';
  }, at, look, fov);

  // Named camera poses: [at, look, fov?]
  const VIEWS = {
    start: [[-12.5, 1.7, 4.2], [8, 1.5, 4.0]],
    walk_e: [[-14, 1.7, 3.8], [30, 2.5, 3.8]],
    walk_w: [[14, 1.7, 3.8], [-30, 2.5, 3.8]],
    ovehouse: [[-6.5, 1.7, 0.5], [-6.0, 2.6, 9.0]],
    rune: [[5.0, 1.7, 0.5], [5.9, 2.0, 9.0]],
    jimmy25: [[0, 1.7, 3.8], [11.3, 2.5, -1.0]],
    jimmy: [[9.0, 1.7, 4.5], [11.3, 2.2, -2.0]],
    anders: [[-24.5, 1.7, 4.5], [-27.5, 2.6, -2.0]],
    ove25: [[-30, 1.7, 4.0], [-6, 2.0, 8.5]],
    lot_w: [[30, 1.7, -24], [-30, 1.0, -22]],
    lot_e: [[-30, 1.7, -22], [30, 1.0, -24]],
    garages: [[2, 1.7, -27], [10, 1.6, -19]],
    ovegarage: [[5.0, 1.7, -24], [5.0, 1.2, -14]],
    drone_nw: [[-45, 28, -45], [0, 0, 0]],
    drone_se: [[45, 26, 45], [0, 0, 0]],
    drone_low: [[-30, 9, -38], [5, 0, 5]],
    backgardens: [[-14, 8, 40], [-14, 1.0, 18]],
    lotpile: [[22, 1.6, -20], [29.2, 1.0, -23], 45],
    streetsign: [[46.5, 1.7, 52], [47.2, 2.4, 47.2], 40],
    junction: [[47, 1.6, 47], [40, 1.0, 40]],
    street: [[47, 1.7, 10], [47, 3, -80]],
    street_trees: [[-34.5, 1.7, 30], [-34.5, 5, -60]],
    birch40: [[-34.5, 1.7, 75], [-34.5, 7, 35]],
    birch80: [[-34.5, 1.7, 115], [-34.5, 7, 35]],
    birch150: [[-34.5, 1.7, 185], [-34.5, 7, 35]],
    antisun: [[-80, 1.7, 30], [-34.5, 7, 0]],
    hedge_near: [[-28.0, 1.5, 33.5], [-20.0, 0.8, 30.6]],
    villa_hedge: [[-80, 1.6, -36.5], [-60, 0.8, -32]],
    centrum: [[-82, 1.7, -78], [-82, 3, -110]],
    centrum_lot: [[-110, 1.7, -60], [-60, 0.5, -76]],
    centrum_drone: [[-50, 35, -40], [-80, 0, -90]],
    hospital: [[160, 1.7, -150], [166, 2.5, -175]],
    hospital_entr: [[166, 1.7, -156], [166, 2.0, -170]],
    hospital_drone: [[200, 40, -110], [160, 0, -160]],
    kommun: [[80, 1.7, -50], [80, 3, -75]],
    church: [[-270, 1.7, 150], [-250, 6, 158]],
    church_wall: [[-262, 1.2, 186], [-240, 0.6, 191]],
    sonja: [[-233.8, 1.6, 215.2], [-233.8, 0.7, 218.6]],
    sonja_far: [[-236, 1.8, 213.3], [-233.8, 0.8, 218.6]],
    cemetery_gate: [[-242, 1.7, 203], [-240, 1.4, 210]],
    cemetery_wide: [[-226, 1.7, 203], [-245, 1.0, 230]],
    kiosk: [[-247.5, 1.7, 203.5], [-247.5, 1.9, 208.5]],
    gas: [[-215, 1.7, -40], [-250, 2.0, -15]],
    gas_drone: [[-200, 45, -60], [-240, 0, -15]],
    dealer: [[232.8, 1.7, 60], [240, 2, 81]],
    dealer_drone: [[200, 40, 40], [240, 0, 80]],
    park: [[60, 1.7, -20], [100, 1.5, 0]],
    field: [[0, 1.7, -205], [0, 1.0, -240]],
    preschool: [[-74, 1.7, -112], [-74, 2.5, -140]],
    edge_n: [[0, 1.7, -292], [0, 4, -330]],
    edge_e: [[292, 1.7, 0], [330, 4, 0]],
    spruce_near: [[-292, 1.7, -100], [-305, 5, -100]],
    aerial: [[0, 420, 260], [0, 0, 0], 50],
    hills_n: [[0, 60, 120], [0, 20, -500], 55],
    // (round 6) the final review's world issues: the first frame's hedge end, hedges at 3-8 m in
    // sun and shade, Parvaneh's star and snowman, a porch lamp, Ove's garage light, the garage row's
    // lamps, the cemetery gate, a centrum planter, bare crowns against the sky
    r6_hedge_end: [[-8.5, 1.6, 5.2], [-5.2, 0.6, 7.0]],
    r6_hedge_row: [[-9.5, 1.6, 3.6], [-13.0, 0.7, 0.6]],
    r6_hedge_sun: [[-12.6, 1.6, 4.0], [-15.0, 0.7, 7.0]],
    r6_hedge_8m: [[-23.0, 1.7, 3.8], [-15.0, 0.6, 7.0]],
    r6_star: [[-5.0, 1.7, 3.5], [-6.6, 1.8, -1.5]],
    r6_porch: [[-26.4, 1.65, 1.8], [-27.6, 1.9, -1.5]],
    r6_garage: [[5.3, 1.6, -19.8], [5.3, 2.0, -14.5]],
    r6_garagerow: [[9.0, 1.7, -27.0], [9.0, 1.9, -19.0]],
    r6_gate: [[-241.6, 1.6, 205.0], [-240.0, 1.1, 210.5]],
    r6_gate_in: [[-238.0, 1.6, 214.5], [-240.0, 1.1, 209.0]],
    r6_planter: [[-81.5, 1.6, -70.5], [-80.0, 0.5, -74.0]],
    r6_sky: [[-34.5, 1.7, 30], [-34.5, 9, 8]],
    r6_limes: [[-236.5, 1.7, 206], [-240, 8, 236]],
    r6_planter_near: [[-79.0, 1.5, -72.2], [-80.0, 0.45, -74.0], 50],
    r6_snowman: [[-7.3, 1.3, 1.6], [-8.1, 0.8, -0.9], 50],
    r6_gate_near: [[-238.6, 1.5, 207.0], [-240.6, 1.0, 209.7], 55],
    r6_thuja_sun: [[-226.0, 1.6, 207.6], [-232.0, 0.9, 209.3], 55],
    r6_thuja_end: [[-235.0, 1.6, 206.2], [-236.6, 0.9, 209.4], 55],
    r6_green_end: [[-15.6, 1.5, 3.2], [-13.9, 0.6, 0.6], 55],
    // (phase 4 r2) granris on Sonja's grave, the thuja and Parvaneh's hedge, a garden spruce at eye
    // level / against the light, Jimmy's reindeer, Ove's door plate, the Saab in the shade
    p4_kneel: [[-234.6, 1.15, 216.4], [-233.7, 0.25, 218.3], 50],
    p4_thuja: [[-226.0, 1.6, 207.6], [-232.0, 0.9, 209.3], 55],
    p4_parvhedge: [[-8.6, 1.5, 2.6], [-6.2, 0.7, 0.4], 50],
    p4_spruce: [[2.5, 1.6, 26.0], [7, 3.2, 29.3], 55],
    p4_spruce_contra: [[-1.6, 1.7, 40.8], [7, 4, 29.3], 50],
    p4_reindeer: [[9.6, 1.4, 2.6], [11.6, 0.8, -1.9], 50],
    p4_plate: [[-5.9, 1.5, 6.4], [-6.1, 1.45, 8.2], 30],
    p4_saab: [[3.5, 1.4, -27.5], [6.8, 0.8, -23.1], 45],
    // (phase 4 r2b) the garden spruce's top third against the light and in sun, Bilhallen's welcome
    // sign through the glass front (wsign checks it from 15 viewpoints)
    r2b_spruce_top: [[1.5, 4.5, 38], [7, 6, 29.3], 40],
    r2b_spruce_sun: [[14.5, 4, 19.5], [7, 5.5, 29.3], 45],
    r2b_sign: [[212, 1.7, 79.4], [236.3, 3.4, 79.4], 40],
  };

  const viewShot = async (name, prefix = 'w_') => {
    const v = VIEWS[name];
    await cam(v[0], v[1], v[2]);
    await frames(14);
    await shot(prefix + name);
  };

  return {
    // (round 5) the follow camera round Rune's ramp (railings, a walkway lamp): Ove where the rune
    // errand leaves him, the camera's yaw swept round; shots + where the boom ended.
    async wcam() {
      const yaws = (process.env.WYAWS || '0.8,1.6,2.4,3.14,-2.4,-1.6,-0.8,0').split(',').map(Number);
      for (const [n, px, pz] of [['rune', 7.1, 6.9], ['ramp', 5.9, 7.6], ['lamp', 3.9, 5.6]]) {
        for (const yaw of yaws) {
          const r = await ev(({ px, pz, yaw }) => {
            const g = __game;
            if (g.playerCar) g.exitCar(true);
            g.player.teleport(px, pz, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.manualT = 5; g.cam.snapNext = true;
            return true;
          }, { px, pz, yaw });
          await frames(8);
          const c = await ev(() => { const p = __game.cam.cam.position; return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +__game.cam.boom.toFixed(2)]; });
          console.log('[t] wcam', n, yaw, JSON.stringify(c));
          if (!process.env.WNOSHOT) await shot(`wcam_${n}_${String(yaw).replace('-', 'm')}`);
        }
      }
      // a dialogue framing (cam.frame) of Ove and someone at Rune's ramp, as when he brings Rune home
      for (const [n, a, b] of [['cine1', [7.1, 6.9], [5.9, 5.7]], ['cine2', [6.6, 5.4], [5.9, 7.2]], ['cine3', [4.4, 5.6], [5.9, 5.7]]]) {
        const c = await ev(({ a, b }) => {
          const g = __game;
          g.player.teleport(a[0], a[1], 0);
          g.cam.frame({ x: a[0], y: 0.15, z: a[1], height: 1.75 }, { x: b[0], y: 0.15, z: b[1], height: 1.3 });
          g.cam.pos.copy(g.cam.cine.pos); g.cam.look.copy(g.cam.cine.look);
          const p = g.cam.cine.pos;
          return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
        }, { a, b });
        await frames(8);
        console.log('[t] wcam', n, JSON.stringify(c));
        if (!process.env.WNOSHOT) await shot(`wcam_${n}`);
        await ev(() => __game.cam.release());
      }
    },

    // (round 6) look-dev probe: WEVAL = a JS expression evaluated in the page (may be async; its
    // JSON result is printed), WSHOTS = JSON [{ name, at: [x,y,z], look: [x,y,z], fov?, eval? }]
    // camera shots (out/wp_<name>.png).
    async wprobe() {
      if (process.env.WEVAL) console.log('[t] eval', JSON.stringify(await ev((src) => (0, eval)(src), process.env.WEVAL)));
      for (const s of JSON.parse(process.env.WSHOTS || '[]')) {
        if (s.eval) console.log('[t] eval', JSON.stringify(await ev((src) => (0, eval)(src), s.eval)));
        if (s.at) await cam(s.at, s.look, s.fov || 55);
        await frames(s.frames || 14);
        await shot('wp_' + s.name);
      }
    },

    // (phase 4 r2b) Ove's Saab from the gameplay chase camera, Ove at the wheel, on a street: in full
    // sun with the sun behind the camera (rear lit), driving into the sun (the rear in its own shade),
    // the sun from the side, and in a building's shadow (the low sun's long shadows cover much of
    // every street). Spots are found by marching towards the sun through the collision footprints
    // (trees by their crowns). WSAAB_COLS = hex paint colours to compare (the material's colour is
    // swapped live; default: the one the town gives it). Shots out/wsaab_<pose>_<hex>.png. Checks: out
    // of the sun the rear panel reads blue, in the sun the flank stays a saturated (not pastel) blue;
    // the last line is '[t] wsaab ok' or FAIL.
    async wsaab() {
      const cols = (process.env.WSAAB_COLS || '').split(',').filter(Boolean);
      const setup = await ev(async () => {
        const g = window.__game, c = g.named.saab;
        const C = await import('/src/world/collision.js');
        const s = g.freeSpot(c.x + 2, c.z, 0, 1); g.player.teleport(s.x, s.z, 0);
        const sun = (await import('/src/gfx.js')).LIGHTING.sunDir;
        const hl = Math.hypot(sun.x, sun.z), away = Math.atan2(-sun.x, -sun.z), out = [];
        // 1 = a building / wall between the point (at height h) and the sun, 2 = a tree crown only, 0 = sun
        const shadeAt = (x, z, h) => {
          let tree = false;
          for (let d = 0.5; d < 70; d += 0.5) {
            const px = x + sun.x / hl * d, pz = z + sun.z / hl * d, y = h + sun.y / hl * d;
            C.queryBlocks(px - 7, pz - 7, px + 7, pz + 7, out);
            for (const b of out) {
              if (b.kind === 'bound') continue;
              if (b.kind === 'tree') { if (b.crownR && Math.hypot(px - b.x, pz - b.z) < b.crownR && y > b.crownBottom && y < b.crownTop) tree = true; continue; }
              if (C.contains(b, px, pz) && C.topAt(b, px, pz) > y) return 1;
            }
          }
          return tree ? 2 : 0;
        };
        // the whole car (5 points along it, sill and roof height) in sun (want 0) / in a building's shadow (1)
        const all = (x, z, yaw, want) => [-2.2, -1.1, 0, 1.1, 2.2].every((t) => [0.5, 1.3].every((h) => shadeAt(x + Math.sin(yaw) * t, z + Math.cos(yaw) * t, h) === want));
        const spots = [];
        for (let i = -3; i <= 2; i++) for (let t = -196; t <= 196; t += 4) for (const lane of [2.75, -2.75]) {
          if (Math.abs(((t % 80) + 80) % 80 - 40) < 14) continue;   // not near a junction
          const r = 40 + i * 80 + lane;
          spots.push({ x: r, z: t, yaw: lane < 0 ? 0 : Math.PI }, { x: t, z: r, yaw: lane < 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
        const find = (yawOf, want) => { for (const p of spots) { const yaw = yawOf(p); if (g.spotFree(p.x, p.z) && all(p.x, p.z, yaw, want)) return { x: p.x, z: p.z, yaw }; } return null; };
        return {
          sun: [sun.x, sun.y, sun.z],
          spots: { sunback: find(() => away, 0), contra: find(() => away + Math.PI, 0), side: find(() => away + Math.PI / 2, 0), shade: find((p) => p.yaw, 1) },
        };
      });
      console.log('[t] wsaab spots', JSON.stringify(setup.spots));
      await frames(5);
      await tap('KeyE');
      await frames(10);
      await ev(() => { document.getElementById('hud').style.display = 'none'; });
      // '0x2c5596' = metallic (the Saab's paint), '0x2c5596s' = the same colour as solid paint (look-dev)
      const setPaint = (h) => ev((h) => {
        const c = window.__game.named.saab, solid = h.endsWith('s');
        for (const b of [c.body, c.bodyLod]) {
          const m = b?.userData.surfaceMats?.paint;
          if (m) { m.color.set(parseInt(h, 16)); m.metalness = solid ? 0 : 0.3; m.roughness = solid ? 0.4 : 0.45; }
        }
      }, h);
      // Mean sRGB of a w x h pixel box round the screen point of a point given in the Saab body's own
      // frame as fractions of its bounding box (fx, fy, fz: 0..1 from min to max; the rear is z = 0):
      // the screenshot is decoded in the page.
      const sample = async (fx, fy, fz, w = 24, h = 6) => {
        const p = await ev(([fx, fy, fz]) => {
          const c = window.__game.named.saab, b = c.body, g = b.geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          const bb = g.boundingBox, V = c.root.position.constructor;
          const v = new V(bb.min.x + fx * (bb.max.x - bb.min.x), bb.min.y + fy * (bb.max.y - bb.min.y), bb.min.z + fz * (bb.max.z - bb.min.z));
          b.updateMatrixWorld(true);
          v.applyMatrix4(b.matrixWorld).project(window.__game.cam.cam);
          return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
        }, [fx, fy, fz]);
        const b64 = await page.screenshot({ clip: { x: Math.round(p[0] - w / 2), y: Math.round(p[1] - h / 2), width: w, height: h }, encoding: 'base64' });
        const rgb = await ev(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
          const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, cv.width, cv.height).data; let r = 0, g = 0, bl = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
          const n = d.length / 4; return [r / n, g / n, bl / n].map(Math.round);
        }, b64);
        return { at: p.map(Math.round), rgb };
      };
      const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return [l, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))]; };
      const poses = Object.entries(setup.spots).filter(([, p]) => p), fails = [];
      for (const col of cols.length ? cols : [null]) {
        if (col) await setPaint(col);
        const tag = col ? col.replace('0x', '') : 'cur';
        for (const [n, { x, z, yaw }] of poses) {
          await ev(({ x, z, yaw }) => { const g = window.__game, c = g.playerCar; c.place(x, z, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true; }, { x, z, yaw });
          await frames(40);
          await shot(`wsaab_${n}_${tag}`);
          // the rear panel above the lamps; out of the sun it must read blue, above the grade's black crush
          // (0x34506e: 18,27,49 in the shade; 0x2c5596: 25,35,75)
          const lid = await sample(0.5, 0.62, 0.0), [R, , B] = lid.rgb;
          const okP = n === 'sunback' || (B >= 62 && B - R >= 35);
          if (!okP) fails.push(`${n} ${tag}`);
          console.log('[t] wsaab', n, tag, 'rear panel', JSON.stringify(lid), okP ? 'ok' : 'FAIL (near-black in the shade)');
        }
      }
      // parked: its sunlit flank from 7 m on the sun's side (as on the title: must not read pastel), and
      // in its bay in the lot (in the shade of the buildings across the street)
      const sb = setup.spots.sunback;
      await ev(() => { const g = window.__game; g.exitCar(true); g.player.teleport(g.player.x + 30, g.player.z, 0); });
      for (const col of cols.length ? cols : [null]) {
        if (col) await setPaint(col);
        const tag = col ? col.replace('0x', '') : 'cur';
        if (sb) {
          const yaw = Math.atan2(-setup.sun[0], -setup.sun[2]) + Math.PI / 2 + 0.5;
          await ev(({ x, z, yaw }) => window.__game.named.saab.place(x, z, yaw), { x: sb.x, z: sb.z, yaw });
          const a = Math.atan2(setup.sun[0], setup.sun[2]) + 0.35;
          await cam([sb.x + Math.sin(a) * 7, 1.5, sb.z + Math.cos(a) * 7], [sb.x, 0.7, sb.z], 45);
          await frames(14);
          await shot(`wsaab_flank_${tag}`);
          // the sunlit flank must stay a saturated mid blue, not pastel (0x2c5596: 87,145,206)
          // (front and rear door: the brighter one, should a lamp post's shadow cross the other)
          const f1 = await sample(0.5, 0.45, 0.27), f2 = await sample(0.5, 0.45, 0.73);
          const fl = hsl(f1.rgb)[0] > hsl(f2.rgb)[0] ? f1 : f2, [L, S] = hsl(fl.rgb), okF = S >= 0.4 && L <= 0.65;
          if (!okF) fails.push(`flank ${tag}`);
          console.log('[t] wsaab flank', tag, JSON.stringify(fl), 'L', L.toFixed(2), 'S', S.toFixed(2), okF ? 'ok' : 'FAIL (pastel in the sun)');
        }
        const m = await ev(() => { const m = window.__lm('saabSpot'); window.__game.named.saab.place(m.x, m.z, m.yaw); return m; });
        await cam([m.x + 5.5, 1.5, m.z - 5.5], [m.x, 0.7, m.z], 50);
        await frames(14);
        await shot(`wsaab_lot_${tag}`);
      }
      console.log('[t] wsaab', poses.length < 4 ? 'FAIL (a spot was not found)' : fails.length ? 'FAIL ' + fails.join(', ') : 'ok');
    },

    // (phase 4 r2b) Bilhallen's welcome sign (places.js dealerBlock: it hangs 0.3 m inside the glass,
    // centred in one bay): from 15 viewpoints on the forecourt and the street (0 / +-30 / +-45 degrees
    // off the glass's normal, 6 / 15 / 30 m away, eye height) rays to 10 points on its text must not
    // hit the showroom's glass-front frame (the mullions: every triangle of the static batches within
    // 0.6 m of the glass plane). Shots out/wsign_*.png; prints '[t] wsign ok' or FAIL.
    async wsign() {
      const views = await ev(async () => {
        const { THREE } = await import('/src/gfx.js');
        const m = window.__lm('dealer'), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
        // dealerBlock's frame from its 'dealer' mark (local -1, -7.2); the glass front is local z = -4
        const ox = m.x - (-1 * c + -7.2 * s), oz = m.z - (1 * s + -7.2 * c), CURB = 0.15, GZ = -4;
        const W = (lx, y, lz) => new THREE.Vector3(ox + lx * c + lz * s, y, oz - lx * s + lz * c);
        const L = (v) => { const dx = v.x - ox, dz = v.z - oz; return [c * dx - s * dz, s * dx + c * dz]; };
        const tris = [], v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        window.__game.player.root.parent.traverse((o) => {
          if (!o.isMesh || !/^(batch:|block)/.test(o.name || '')) return;
          o.updateMatrixWorld(true);
          const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
          for (let t = 0; t < n; t += 3) {
            for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(P, I ? I.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
            const cy = (v[0].y + v[1].y + v[2].y) / 3;
            if (cy < CURB || cy > CURB + 6.5) continue;
            const [lx, lz] = L(new THREE.Vector3((v[0].x + v[1].x + v[2].x) / 3, 0, (v[0].z + v[1].z + v[2].z) / 3));
            if (Math.abs(lz - GZ) < 0.6 && lx > -14.6 && lx < 12.6) for (const q of v) tris.push(q.x, q.y, q.z);
          }
        });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
        const front = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const rc = new THREE.Raycaster(), out = [];
        const sx = -14 + 4.5 * 3.25, sy = CURB + 3.475, sz = GZ + 0.295;   // the sign's face
        for (const deg of [0, 30, -30, 45, -45]) for (const D of [6, 15, 30]) {
          const a = deg * Math.PI / 180, eye = W(sx + Math.sin(a) * D, CURB + 1.6, sz - Math.cos(a) * D);
          let hit = 0;
          for (const u of [-1, -0.5, 0, 0.5, 1]) for (const vv of [-0.2, 0.2]) {
            const p = W(sx + u * 1.0, sy + vv, sz), d = p.clone().sub(eye), len = d.length();
            rc.set(eye, d.normalize()); rc.far = len - 0.02;
            if (rc.intersectObject(front, false).length) hit++;
          }
          out.push({ deg, D, hit, eye: [eye.x, eye.y, eye.z].map((q) => +q.toFixed(2)), look: [W(sx, sy, sz).x, sy, W(sx, sy, sz).z].map((q) => +q.toFixed(2)) });
        }
        return { frontTris: tris.length / 9, out };
      });
      let bad = 0;
      for (const o of views.out) { if (o.hit) bad++; console.log('[t] wsign', `${o.deg}deg ${o.D}m`, o.hit ? `FAIL ${o.hit}/10 rays cut by the glass front` : 'clear'); }
      for (const o of views.out.filter((o) => o.D === 15)) { await cam(o.eye, o.look, 40); await frames(14); await shot(`wsign_${o.deg}`); }
      console.log('[t] wsign', views.frontTris < 50 ? 'FAIL (the glass front was not found)' : bad ? `FAIL ${bad} viewpoints` : 'ok', `(front ${views.frontTris} tris)`);
    },

    async wviews() {
      const pick = process.env.WVIEWS ? process.env.WVIEWS.split(',') : Object.keys(VIEWS);
      for (const n of pick) { if (!VIEWS[n]) { console.log('unknown view', n); continue; } await viewShot(n); }
    },

    // (phase 4 r2) The static world only, for pixel diffs before / after a change that must not change
    // the image (the atlas crop, the props batches): the game paused (no traffic, no walkers moving),
    // every car and character hidden, the camera frozen. Shots out/ws_<view>.png (WVIEWS= a subset).
    async wsame() {
      await ev(() => {
        const g = window.__game;
        g.paused = true;
        for (const c of g.cars) if (c.root) c.root.visible = false;
        for (const p of g.peds || []) if (p.char?.root) p.char.root.visible = false;
        for (const n of Object.values(g.npcs || {})) if (n.root) n.root.visible = false;
        if (g.player?.root) g.player.root.visible = false;
      });
      const pick = process.env.WVIEWS ? process.env.WVIEWS.split(',') : ['start', 'ove25', 'lot_e', 'drone_nw', 'centrum', 'r6_planter_near', 'sonja', 'cemetery_wide', 'hospital', 'gas', 'street_trees', 'park', 'aerial'];
      for (const n of pick) {
        const v = VIEWS[n];
        await cam(v[0], v[1], v[2]);
        await frames(16);
        await shot('ws_' + n);
      }
    },

    // (phase 4 r2) Draw calls / triangles per pass at a few poses and the render CPU per frame
    // (median of 4 x 40 frames), and an interleaved A/B of the props hidden / shown (their cost).
    // WPOSES= a subset.
    async wcalls() {
      const poses = (process.env.WPOSES || 'start,lot_e,street,centrum,drone_nw,aerial').split(',');
      const propRe = /^props(:|$)/;
      const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      for (const n of poses) {
        await cam(...VIEWS[n]);
        await frames(20);
        const row = await ev(async (src) => {
          const G = await import('/src/gfx.js');
          const re = new RegExp(src), sc = window.__game.player.root.parent;
          const props = []; sc.traverse((o) => { if (re.test(o.name || '')) props.push(o); });
          const wait = (k) => new Promise((res) => { const f0 = window.__frame; const t = () => (window.__frame >= f0 + k ? res() : requestAnimationFrame(t)); t(); });
          // (per-frame pass numbers summed: the far shadow cascade is drawn every 2nd frame)
          const acc = () => ({ main: [0, 0], ao: [0, 0], shadow: [0, 0], n: 0 });
          const sample = async (ms, P) => { for (let i = 0; i < 40; i++) { await wait(1); ms.push(G.gfxStats.last); const q = G.gfxStats.pass; for (const k of ['main', 'ao', 'shadow']) { P[k][0] += q[k][0]; P[k][1] += q[k][1]; } P.n++; } };
          const on = [], off = [], pOn = acc(), pOff = acc();
          for (let k = 0; k < 4; k++) {
            for (const o of props) o.visible = true; await wait(3); await sample(on, pOn);
            for (const o of props) o.visible = false; await wait(3); await sample(off, pOff);
          }
          for (const o of props) o.visible = true;
          for (const P of [pOn, pOff]) for (const k of ['main', 'ao', 'shadow']) P[k] = P[k].map((v) => Math.round(v / P.n));
          return { props: props.length, pOn, pOff, on, off };
        }, propRe.source);
        const c = (p) => `${p.main[0]}/${p.ao[0]}/${p.shadow[0]}`;
        console.log('[t] calls', n.padEnd(10), 'propMeshes', row.props, 'main/ao/shadow', c(row.pOn), 'propsHidden', c(row.pOff),
          'propCalls', row.pOn.main[0] + row.pOn.ao[0] + row.pOn.shadow[0] - row.pOff.main[0] - row.pOff.ao[0] - row.pOff.shadow[0],
          'propTris', ((row.pOn.main[1] + row.pOn.ao[1] + row.pOn.shadow[1] - row.pOff.main[1] - row.pOff.ao[1] - row.pOff.shadow[1]) / 1e6).toFixed(3) + 'M',
          'cpu', med(row.on).toFixed(2), 'cpuPropsHidden', med(row.off).toFixed(2));
      }
    },

    // (phase 4 r2) The baked props (props.js bakeProps): a prop near Ove's walkway is kicked (the J key,
    // as a player would), must break (not alive, collider dead, its index ranges degenerate) and, once
    // its timer runs out with Ove > 70 m away, respawn with its indices restored. Shots wpr_*.png.
    async wprops() {
      const pick = await ev(() => {
        const g = window.__game, P = window.__props;
        const ps = P.filter((p) => p.alive && ['trashcan', 'mailbox', 'kicksled', 'papperskorg', 'bench', 'box', 'snowman'].includes(p.type) && Math.hypot(p.x + 5, p.z - 4) < 45);
        for (const p of ps) for (let a = 0; a < 8; a++) {
          const yaw = a * Math.PI / 4, d = (p.def.r || Math.max(p.def.w, p.def.d) / 2) + 0.65;
          const x = p.x - Math.sin(yaw) * d, z = p.z - Math.cos(yaw) * d;
          if (g.spotFree(x, z)) return { i: P.indexOf(p), type: p.type, x, z, yaw, px: p.x, pz: p.z, batched: !!p.ranges };
        }
        return null;
      });
      console.log('[t] wprops target', JSON.stringify(pick));
      if (!pick) { console.log('[t] wprops FAIL no target'); return; }
      const camAt = [pick.px - Math.sin(pick.yaw) * 4 + Math.cos(pick.yaw) * 1.5, 1.7, pick.pz - Math.cos(pick.yaw) * 4 - Math.sin(pick.yaw) * 1.5];
      const snap = () => ev((i) => { const p = window.__props[i]; return p.ranges ? p.ranges.map(([e, s, n]) => Array.from(e.I.subarray(s, s + n))) : null; }, pick.i);
      const before = await snap();
      await ev(({ x, z, yaw }) => { const g = window.__game; g.player.teleport(x, z, yaw); }, pick);
      await cam(camAt, [pick.px, 0.6, pick.pz], 50);
      await frames(10);
      await shot('wpr_0_before');
      await ev(({ yaw }) => { window.__game.player.yaw = yaw; }, pick);
      await tap('KeyJ');
      await frames(40);
      let st = await ev((i) => { const p = window.__props[i]; return { alive: p.alive, dead: !!p.block.dead, degenerate: p.ranges ? p.ranges.every(([e, s, n]) => { const v = e.I[s]; for (let k = s; k < s + n; k++) if (e.I[k] !== v) return false; return true; }) : null }; }, pick.i);
      console.log('[t] wprops after kick', JSON.stringify(st));
      if (st.alive) {
        await ev((i) => window.__game.breakProp(window.__props[i], 1, 0, 'kick'), pick.i);
        st = await ev((i) => { const p = window.__props[i]; return { alive: p.alive, dead: !!p.block.dead }; }, pick.i);
        console.log('[t] wprops the key did not land; breakProp directly', JSON.stringify(st));
      }
      await frames(30);
      await shot('wpr_1_broken');
      // respawn: Ove far away, timer out
      await ev((i) => { const g = window.__game, p = window.__props[i]; p.respawn = 0; g.player.teleport(p.x + 90, p.z, 0); }, pick.i);
      await frames(20);
      const after = await snap();
      st = await ev((i) => { const p = window.__props[i]; return { alive: p.alive, dead: !!p.block.dead }; }, pick.i);
      const same = JSON.stringify(after) === JSON.stringify(before);
      console.log('[t] wprops respawned', JSON.stringify(st), 'indices restored', same);
      await shot('wpr_2_respawned');
      console.log('[t] wprops', !st.alive || st.dead || (pick.batched && !same) ? 'FAIL' : 'ok');
    },

    // (phase 4 r2) What the sign / card atlas pages hold on the GPU: per page its texture size and
    // memory (RGBA8 + mips), and the size of the canvas still held.
    async wvram() {
      const r = await ev(async () => {
        const s = await import('/src/world/signs.js');
        const pages = s.signPages(), out = [];
        let total = 0, canv = 0;
        for (const [k, list] of Object.entries(pages)) list.forEach((p, i) => {
          const img = p.tex?.image, h = p.texH ?? 2048;
          const mb = (2048 * h * 4 * 4 / 3) / 1048576;
          total += mb; canv += (p.canvas.width * p.canvas.height + (img && img !== p.canvas ? img.width * img.height : 0)) * 4 / 1048576;
          out.push(`${k}${i}: 2048x${h} ${mb.toFixed(1)} MB, canvas ${p.canvas.width}x${p.canvas.height}, img ${img?.width}x${img?.height}, faces ${p.faces.length}, quads ${p.quads.length}`);
        });
        return { pages: out, totalMB: +total.toFixed(1), canvasMB: +canv.toFixed(1) };
      });
      for (const l of r.pages) console.log('[t] page', l);
      // (phase 4 r2: 213 MB of pages and 160 MB of canvases before the crop)
      console.log('[t] atlasMB', r.totalMB, 'canvasMB', r.canvasMB, r.totalMB < 140 && r.canvasMB < 1 ? 'ok' : 'FAIL');
    },

    async wperf() {
      const out = {};
      out.build = await ev(async () => { const t = await import('/src/world/town.js'); return t.townStats; });
      for (const n of ['start', 'lot_e', 'centrum', 'hospital', 'street_trees', 'drone_nw', 'aerial']) {
        await cam(...VIEWS[n]);
        await frames(30);
        const f = await fps();
        const s = await ev(() => window.__stats());
        out[n] = { fps: +f, ...s };
        console.log('[t] perf', n, 'fps', f, JSON.stringify(s));
      }
      console.log('[t] perfjson', JSON.stringify(out));
    },

    // Triangles drawn per frame (all passes) by mesh category at the wperf poses: each category is
    // hidden in turn and the drop in __stats().tris is its share.
    async wtris() {
      const cats = { blocks: /^block/, ground: /^ground/, forestbelt: /^forestbelt/, silhouettes: /^silhouettes/, signs: /^signs:/, props: /^props:|^cans/, roads: /^roads|^hills/, cars: /^(Mesh|wheels)/, people: /^SkinnedMesh/ };
      const poses = (process.env.WPOSES || 'start,lot_e,centrum,street_trees,drone_nw,aerial').split(',');
      for (const n of poses) {
        await cam(...VIEWS[n]);
        await frames(20);
        const all = await ev(() => window.__stats().tris);
        const row = { all: +(all / 1e6).toFixed(2) };
        for (const [k, re] of Object.entries(cats)) {
          await ev((src) => { const re = new RegExp(src); window.__hid = []; window.__game.player.root.parent.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && re.test(o.name || o.type) && o.visible) { o.visible = false; window.__hid.push(o); } }); }, re.source);
          await frames(4);
          const t = await ev(() => window.__stats().tris);
          await ev(() => { for (const o of window.__hid) o.visible = true; });
          row[k] = +((all - t) / 1e6).toFixed(2);
        }
        await frames(4);
        console.log('[t] tris', n.padEnd(13), JSON.stringify(row));
      }
    },

    async meshstats() {
      const r = await ev(() => {
        const g = window.__game;
        const sc = g.player.root.parent;
        const rows = [];
        sc.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry; if (!geo) return;
          const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          rows.push({ name: o.name || o.type, tris: Math.round(tris), groups: Array.isArray(o.material) ? o.material.length : 1 });
        });
        const by = {};
        for (const q of rows) { const k = q.name.replace(/\d+/g, '#'); by[k] ??= { n: 0, tris: 0, groups: 0 }; by[k].n++; by[k].tris += q.tris; by[k].groups += q.groups; }
        return Object.entries(by).sort((a, b) => b[1].tris - a[1].tris).slice(0, 40);
      });
      for (const [k, v] of r) console.log('[t] mesh', k.padEnd(28), 'n', v.n, 'tris', v.tris, 'groups', v.groups);
      console.log('[t] trees', JSON.stringify(await ev(async () => (await import('/src/world/kit.js')).treeStats)));
      console.log('[t] snow', JSON.stringify(await ev(async () => (await import('/src/world/kit.js')).snowStats)));
      console.log('[t] signs', JSON.stringify(await ev(async () => (await import('/src/world/signs.js')).signStats())));
    },

    async atlas() {
      const n = await ev(async () => {
        const s = await import('/src/world/signs.js');
        const pages = s.signPages();
        window.__atlas = [];
        for (const k of Object.keys(pages)) pages[k].forEach((p, i) => window.__atlas.push([k + i, s.signPageImage(p).toDataURL('image/png')]));
        return window.__atlas.length;
      });
      const fs = await import('fs');
      for (let i = 0; i < n; i++) {
        const [name, url] = await ev((i) => window.__atlas[i], i);
        fs.writeFileSync(`${OUT}/atlas_${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
        console.log('saved atlas', name);
      }
    },

    async validate() {
      const res = await ev(async () => {
        const L = await import('/src/world/layout.js');
        const Cm = await import('/src/world/collision.js');
        const T = await import('/src/world/town.js');
        const { CURB, RHW, HALF, P, landmarks, isCarFree, carFreeZones, baseGround } = L;
        const probs = [];
        const P_ = (m) => { if (probs.length < 400) probs.push(m); };
        const tmp = [];
        const f1 = (v) => v.toFixed(1);
        // Distance from the nearest road centre line along each axis (inside the grid).
        const offAxis = (v) => { const m = (((v + HALF) % P) + P) % P; return Math.min(m, P - m); };
        // Does an OBB (centre, yaw, w across, l along) overlap a solid taller than ground + step?
        // Sampled on a 0.2 m grid (+ the edges). Returns the first offending block or null.
        const obbHit = (x, z, yaw, w, l, step, skip) => {
          const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
          const R = Math.hypot(w, l) / 2 + 0.1;
          Cm.queryBlocks(x - R, z - R, x + R, z + R, tmp);
          const list = tmp.filter((b) => !skip || !skip(b));
          const nw = Math.max(2, Math.ceil(w / 0.2)), nl = Math.max(2, Math.ceil(l / 0.2));
          for (let i = 0; i <= nw; i++) for (let j = 0; j <= nl; j++) {
            const a = -w / 2 + (w * i) / nw, b = -l / 2 + (l * j) / nl;
            const px = x + rx * a + fx * b, pz = z + rz * a + fz * b;
            const g = baseGround(px, pz);
            for (const bl of list) {
              if (!Cm.contains(bl, px, pz)) continue;
              if (Cm.topAt(bl, px, pz) > g + step) return bl;
            }
          }
          return null;
        };
        const cars = T.parkedCars;
        const carHit = (x, z, yaw, w, l, self, skip) => {
          for (const c of cars) {
            if (c === self || (skip && skip(c))) continue;
            const dx = c.x - x, dz = c.z - z;
            if (dx * dx + dz * dz > 36) continue;
            // OBB vs OBB (SAT, car 1.9 x 4.7).
            const A = { x, z, f: [Math.sin(yaw), Math.cos(yaw)], hw: w / 2, hl: l / 2 }, B = { x: c.x, z: c.z, f: [Math.sin(c.yaw), Math.cos(c.yaw)], hw: 0.95, hl: 2.35 };
            const axes = [A.f, [A.f[1], -A.f[0]], B.f, [B.f[1], -B.f[0]]];
            let sep = false;
            for (const [ax, az] of axes) {
              const pr = (o) => o.hl * Math.abs(ax * o.f[0] + az * o.f[1]) + o.hw * Math.abs(ax * o.f[1] - az * o.f[0]);
              if (Math.abs(dx * ax + dz * az) > pr(A) + pr(B)) { sep = true; break; }
            }
            if (!sep) return c;
          }
          return null;
        };
        const obbOverlap = (ax, az, ay, ahw, ahl, bx, bz, by, bhw, bhl) => {
          const A = { f: [Math.sin(ay), Math.cos(ay)], hw: ahw, hl: ahl }, B = { f: [Math.sin(by), Math.cos(by)], hw: bhw, hl: bhl };
          const dx = bx - ax, dz = bz - az;
          for (const [qx, qz] of [A.f, [A.f[1], -A.f[0]], B.f, [B.f[1], -B.f[0]]]) {
            const pr = (o) => o.hl * Math.abs(qx * o.f[0] + qz * o.f[1]) + o.hw * Math.abs(qx * o.f[1] - qz * o.f[0]);
            if (Math.abs(dx * qx + dz * qz) > pr(A) + pr(B)) return false;
          }
          return true;
        };
        const desc = (b) => b ? `${b.kind}@${f1(b.x ?? (b.minX + b.maxX) / 2)},${f1(b.z ?? (b.minZ + b.maxZ) / 2)} top ${b.top.toFixed(2)}` : '';

        // ---- violation spots
        const V = T.violationSpots;
        const kinds = {};
        let vOk = 0;
        V.forEach((v, i) => {
          kinds[v.kind] = (kinds[v.kind] || 0) + 1;
          let bad = false;
          const hb = obbHit(v.x, v.z, v.yaw, 1.9, 4.8, 0.6);
          if (hb) { P_(`spot ${i} ${v.kind}/${v.where} (${f1(v.x)},${f1(v.z)}) solid ${desc(hb)}`); bad = true; }
          const hc = carHit(v.x, v.z, v.yaw, 1.9, 4.8);
          if (hc) { P_(`spot ${i} ${v.kind} (${f1(v.x)},${f1(v.z)}) overlaps parked ${hc.type} ${hc.name || ''}`); bad = true; }
          const g = Cm.groundAt(v.x, v.z, 0.2, 0.6);
          if (g > CURB + 0.06) { P_(`spot ${i} ${v.kind} not at ground level (${g.toFixed(2)})`); bad = true; }
          const inGrid = Math.abs(v.x) < HALF + RHW && Math.abs(v.z) < HALF + RHW;
          const d = inGrid ? Math.min(offAxis(v.x), offAxis(v.z)) : 99;
          if (d < 5.5) { P_(`spot ${i} ${v.kind} only ${d.toFixed(2)} m from a road centre line`); bad = true; }
          if (v.kind === 'carfree' && !isCarFree(v.x, v.z)) { P_(`carfree spot ${i} not in a carFreeZone`); bad = true; }
          for (let k = 0; k < i; k++) { const u = V[k]; if (Math.hypot(u.x - v.x, u.z - v.z) < 5.3 && obbOverlap(u.x, u.z, u.yaw, 0.95, 2.4, v.x, v.z, v.yaw, 0.95, 2.4)) { P_(`spots ${k} and ${i} overlap`); bad = true; } }
          if (!bad) vOk++;
        });
        // carFree must not cover lots / streets
        for (const n of ['parking', 'guestParking', 'saabSpot', 'busStop']) { const m = landmarks[n]; if (m && isCarFree(m.x, m.z)) P_(`landmark ${n} is inside a carFreeZone`); }

        // ---- landmarks (people stand there) and boxes (cars park there)
        const req = ['oveHouse', 'oveStart', 'oveGarage', 'parvanehHouse', 'runeHouse', 'jimmyHouse', 'andersHouse', 'adrianSpot', 'bikeShed', 'garbageRoom', 'parking', 'guestParking', 'hospital', 'preschool', 'centrum', 'dealer', 'church', 'cemetery', 'sonjaGrave', 'kommun', 'gas', 'park', 'field', 'busStop', 'dealerFinish', 'graveFlowers'];
        for (const n of req) if (!landmarks[n]) P_(`missing landmark ${n}`);
        const BOXES = ['oveGarageSpot', 'parvanehDrive', 'hospitalSpot', 'saabSpot', 'adrianBay', 'hospitalDrop'];
        for (const n of BOXES) if (!landmarks[n] || !landmarks[n].w || !landmarks[n].l) P_(`box ${n} missing or without w/l`);
        // (round 5) the flowers' spot: on Sonja's plinth, in reach in front of the standing spot
        { const f = landmarks.graveFlowers, s = landmarks.sonjaGrave;
          if (f && s) { const d = Math.hypot(f.x - s.x, f.z - s.z), ahead = (f.x - s.x) * Math.sin(s.yaw) + (f.z - s.z) * Math.cos(s.yaw);
            if (!(d > 1.0 && d < 1.7 && ahead > 1.0 && f.y > CURB && f.y < 0.5)) P_(`graveFlowers not on the plinth in front of sonjaGrave (d ${d.toFixed(2)}, y ${f.y})`); } }
        // dealerFinish: on the street (asphalt, in a lane) in front of Bilhallen's driveway
        { const f = landmarks.dealerFinish, d = landmarks.dealerLot;
          if (f && d && (Math.abs(f.z - d.z) > 3 || offAxis(f.x) > RHW - 1 || Math.abs(f.x - d.x) > 16)) P_('dealerFinish not on the street in front of the driveway'); }
        let lmN = 0;
        for (const [n, m] of Object.entries(landmarks)) {
          if (m.w || m.y !== undefined) continue;
          lmN++;
          // free: a 0.35 m circle hits nothing taller than a step
          Cm.queryBlocks(m.x - 1, m.z - 1, m.x + 1, m.z + 1, tmp);
          const g0 = baseGround(m.x, m.z);
          const o = {};
          for (const b of tmp) if (Cm.topAt(b, m.x, m.z) > g0 + 0.45 && Cm.circleVsBlock(m.x, m.z, 0.35, b, o)) { P_(`landmark ${n} (${f1(m.x)},${f1(m.z)}) blocked by ${desc(b)}`); break; }
          const g = Cm.groundAt(m.x, m.z, 0.2, 0.6);
          if (g > CURB + 0.06) P_(`landmark ${n} not at ground level (floor ${g.toFixed(2)} ${Cm.groundInfo.block?.kind})`);
        }
        for (const n of BOXES) {
          const m = landmarks[n]; if (!m) continue;
          const hb = obbHit(m.x, m.z, m.yaw, m.w, m.l, 0.6);
          if (hb) P_(`box ${n} overlaps ${desc(hb)}`);
          const hc = carHit(m.x, m.z, m.yaw, m.w, m.l, cars.find((c) => c.name === 'saab' && n === 'saabSpot'));
          if (hc && !(n === 'saabSpot' && hc.name === 'saab')) P_(`box ${n} overlaps parked ${hc.type} ${hc.name || ''}`);
        }
        // named cars
        const named = {};
        for (const c of cars) if (c.name) named[c.name] = c;
        const want = { saab: 'saab900', patrickCar: null, runeVolvo: 'volvo240', andersAudi: 'audi' };
        for (const [k, t] of Object.entries(want)) { if (!named[k]) P_(`named car ${k} missing`); else if (t && named[k].type !== t) P_(`named car ${k} is ${named[k].type}`); }
        if (named.patrickCar && !named.patrickCar.trailer) P_('patrickCar without trailer');
        if (named.saab && landmarks.saabSpot && Math.hypot(named.saab.x - landmarks.saabSpot.x, named.saab.z - landmarks.saabSpot.z) > 0.3) P_('saab not on saabSpot');
        // parked cars must not sit in solids either
        cars.forEach((c, i) => { const hb = obbHit(c.x, c.z, c.yaw, 1.8, 4.5, 0.6, (b) => b.kind === 'glass'); if (hb && !c.indoor) P_(`parked car ${i} ${c.type} ${c.name || ''} (${f1(c.x)},${f1(c.z)}) in ${desc(hb)}`); });

        // ---- collectibles: a free standing point within 1.2 m on ground or a low climbable floor
        const CLIMB = new Set(['step', 'stand', 'mound', 'bench', 'deck', 'platform', 'sandbox', 'island']);
        const coll = [...T.collectibleSpots.emblems.map((p) => ['emblem', p]), ...T.collectibleSpots.photos.map((p) => ['photo', p])];
        if (T.collectibleSpots.emblems.length !== 7 || T.collectibleSpots.photos.length !== 7) P_('need 7 + 7 collectibles');
        coll.forEach(([k, [x, y, z]], i) => {
          let ok = false;
          for (let rr = 0; rr <= 1.2 && !ok; rr += 0.2) for (let a = 0; a < 16 && !ok; a++) {
            const px = x + Math.cos(a / 16 * 6.283) * rr, pz = z + Math.sin(a / 16 * 6.283) * rr;
            const fl = Cm.groundAt(px, pz, y, 0);
            const blk = Cm.groundInfo.block;
            if (fl > CURB + 0.06 && !(blk && CLIMB.has(blk.kind))) continue;
            if (y - fl > 1.9 || y - fl < 0.1) continue;
            Cm.queryBlocks(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5, tmp);
            const o = {};
            if (tmp.some((b) => Cm.topAt(b, px, pz) > fl + 0.45 && Cm.circleVsBlock(px, pz, 0.3, b, o))) continue;
            ok = true;
          }
          if (!ok) P_(`${k} ${i} at (${f1(x)},${y.toFixed(2)},${f1(z)}) not reachable`);
        });
        // ---- litter
        const lit = T.litterSpots;
        if (lit.length < 110) P_(`only ${lit.length} litter spots`);
        // ---- pedLoops
        let pedHits = 0;
        for (const loop of T.pedLoops) {
          if (loop.pts.length !== 4) P_('pedLoop without 4 points');
          for (let k = 0; k < 4; k++) {
            const [ax, az] = loop.pts[k], [bx, bz] = loop.pts[(k + 1) % 4];
            const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
            for (let q = 0; q <= n; q++) {
              const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n;
              Cm.queryBlocks(x - 0.5, z - 0.5, x + 0.5, z + 0.5, tmp);
              const o = {};
              const hit = tmp.find((b) => Cm.topAt(b, x, z) > CURB + 0.45 && Cm.circleVsBlock(x, z, 0.35, b, o));
              if (hit) { pedHits++; if (pedHits < 12) P_(`pedLoop ${loop.i},${loop.j} hits ${desc(hit)} at (${f1(x)},${f1(z)})`); }
            }
          }
        }
        // ---- car sweeps along mission routes (polylines; OBB 1.9 x 4.6, cars step 0.6)
        const skipCar = (c) => c.name === 'saab' || c.name === 'patrickCar';
        const sweep = (name, pts, tail = 0) => {
          let bad = 0;
          for (let k = 0; k < pts.length - 1; k++) {
            const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L_ = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
            for (let t = 0; t <= L_; t += 0.5) {
              const x = ax + (bx - ax) * t / L_, z = az + (bz - az) * t / L_;
              const hb = obbHit(x, z, yaw, 1.9, 4.6, 0.6);
              const hc = hb ? null : carHit(x, z, yaw, 1.9, 4.6, null, skipCar);
              if (hb || hc) { if (bad++ < 2) P_(`route ${name} blocked at (${f1(x)},${f1(z)}) by ${hb ? desc(hb) : 'parked ' + hc.type + ' ' + (hc.name || '') + ' @' + f1(hc.x) + ',' + f1(hc.z)}`); }
            }
          }
          if (tail) { const [ax, az] = pts[pts.length - 2], [bx, bz] = pts[pts.length - 1], yaw = Math.atan2(bx - ax, bz - az); const hb = obbHit(bx - Math.sin(yaw) * tail / 2, bz - Math.cos(yaw) * tail / 2, yaw, 2.0, tail, 0.6); if (hb) P_(`route ${name} tail blocked by ${desc(hb)}`); }
          return bad;
        };
        const lmv = (n) => [landmarks[n].x, landmarks[n].z];
        const routes = {
          saabOut: [lmv('saabSpot'), [6.8, -22.7], [-33, -22.75], [-37, -22.75]],
          garageIn: [[5.1, -23.5], [5.1, -21.5], lmv('oveGarageSpot')],
          patrick: [[-37, -22.7], [0, -22.7], [0, 3.8], [-14, 3.8]],
          hospital: [[118, -151.7], [171.3, -151.7], lmv('hospitalSpot')],
          hospitalCanopy: [[118, -151.7], [146, -151.7], [146, -163], [143.4, -166.6]],
          // (round 5) the Akut driveway from the west street, and the same spot from the car park
          hospitalDrop: [[118, -158.7], [141.6, -158.7], lmv('hospitalDrop')],
          hospitalDrop2: [[118, -151.7], [142.7, -151.7], lmv('hospitalDrop')],
          adrianBay: [[-37, -22.75], [lmv('adrianBay')[0], -22.75], lmv('adrianBay')],
          dealerFinish: [[202.75, 114], lmv('dealerFinish'), [202.75, 46]],
          dealer: [[202.75, 81], lmv('dealer')],
          preschool: [[-92, -122.75], [-92, -131]],
          preschool2: [[-80, -122.75], [-80, -131]],
          gas: [[-197.25, 0], [-222, 0], [-224, -12], [-246.5, -21.5]],
          gasNorth: [[-230, -42.75], [-230, -20]],
        };
        const rres = {};
        for (const [n, pts] of Object.entries(routes)) rres[n] = sweep(n, pts, n === 'patrick' ? 9.5 : 0) ? 'BLOCKED' : 'clear';
        // ---- verge trees near junctions (cars swinging wide / pulling over get trapped)
        // (round 5) every colliding tree carries its crown for the camera; camBlocks are sane boxes
        let crowns = 0, trees = 0;
        for (const b of Cm.blocks) {
          if (b.kind !== 'tree') continue;
          trees++;
          if (!(b.crownR > b.r && b.crownR < 9 && b.crownBottom >= 0 && b.crownBottom < b.crownTop && b.crownTop < 30)) { if (trees - crowns < 4) P_(`tree at (${f1(b.x)},${f1(b.z)}) without a sane crown (${b.crownR}, ${b.crownBottom}, ${b.crownTop})`); continue; }
          crowns++;
        }
        const badCam = T.camBlocks.filter((c) => !(c.x1 > c.x0 && c.z1 > c.z0 && c.top > c.bottom)).length;
        if (badCam) P_(`${badCam} camBlocks are not boxes`);
        let vt = 0;
        for (const b of Cm.blocks) {
          if (b.kind !== 'tree' || Math.abs(b.x) > HALF + 1 || Math.abs(b.z) > HALF + 1) continue;
          const ox = offAxis(b.x), oz = offAxis(b.z);
          if ((ox < 7.5 && oz < 20) || (oz < 7.5 && ox < 20)) { vt++; if (vt < 6) P_(`verge tree near a junction at (${f1(b.x)},${f1(b.z)})`); }
        }
        return { problems: probs, nProblems: probs.length, violationSpots: V.length, ok: vOk, kinds, carFreeZones: carFreeZones.length, landmarks: Object.keys(landmarks).length, people: lmN, litter: lit.length, pedHits, routes: rres, parkedCars: cars.length, vergeTreesNearJunctions: vt, trees, treeCrowns: crowns, camBlocks: T.camBlocks.length };
      });
      for (const p of res.problems) console.log('[t] PROBLEM', p);
      delete res.problems;
      console.log('[t] validate', JSON.stringify(res));
    },
  };
};
