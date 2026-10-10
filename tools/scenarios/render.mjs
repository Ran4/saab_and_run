// Rendering-area scenarios (owned by the rendering agent). Loaded by tools/shot.mjs.
//   rperf   - per-pose CPU (loop/update/renderFrame), GPU timer, draw calls per pass, triangles
//             (RPOSES=a,b  RQ=high|low|auto  RFRAMES=n; add QUERY='&gputime' for the GPU timer)
//   rload   - load time, first-frame compile, programs, JS-side geometry bytes, ArrayBuffer backing
//   rshots  - A/B stills from fixed poses with the world frozen (RTAG=name -> out/r_<tag>_<pose>.png;
//             RSTATIC=1 also hides cars and people so only the static world is compared)
//   rauto   - the automatic quality: what tier/scale it picks (RTHROTTLE=n slows the CPU n x)
export default ({ page, ev, shot, frames, sleep, OUT }) => {
  const POSES = {
    start: [[-12.5, 1.7, 4.2], [8, 1.5, 4.0]],
    lot_e: [[-30, 1.7, -22], [30, 1.0, -24]],
    street_long: [[-250, 1.7, -37.25], [250, 1.6, -37.25]],
    centrum: [[-82, 1.7, -78], [-82, 3, -110]],
    hospital: [[160, 1.7, -150], [166, 2.5, -175]],
    drone_nw: [[-45, 28, -45], [0, 0, 0]],
    aerial: [[0, 420, 260], [0, 0, 0], 50],
    snow_close: [[-20, 1.2, 12], [-14, 0.2, 18]],
    street_trees: [[-34.5, 1.7, 30], [-34.5, 5, -60]],
    centrum_lot: [[-110, 1.7, -60], [-60, 0.5, -76]],
  };
  const cam = (at, look, fov = 55) => ev((at, look, fov) => {
    const g = window.__game;
    g.cam.update = function () {};
    const c = g.cam.cam;
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
  }, at, look, fov);
  const setQ = (q) => ev(async (q) => { const g = await import('/src/gfx.js'); g.setQuality(q); }, q);
  const stat = (a) => {
    if (!a.length) return { mean: 0, p50: 0, p95: 0, max: 0 };
    const s = [...a].sort((x, y) => x - y), m = a.reduce((x, y) => x + y, 0) / a.length;
    return { mean: +m.toFixed(2), p50: +s[Math.floor(s.length * 0.5)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) };
  };

  return {
    async rperf() {
      const poses = (process.env.RPOSES || 'start,lot_e,street_long,centrum,hospital,drone_nw,aerial').split(',');
      if (process.env.RQ) await setQ(process.env.RQ);
      // instrument the loop: loop / update / renderFrame / frame interval
      await ev(() => {
        const g = window.__game;
        window.__pf = { loop: [], upd: [], rf: [], gap: [], last: 0, on: false };
        const L = g.loop.bind(g), U = g.update.bind(g);
        g.update = function (dt) { const t0 = performance.now(); U(dt); if (__pf.on) __pf.upd.push(performance.now() - t0); };
        g.loop = function (t) {
          const t0 = performance.now();
          L(t);
          if (__pf.on) { __pf.loop.push(performance.now() - t0); __pf.gap.push(t - __pf.last); }
          __pf.last = t;
        };
      });
      const N = +(process.env.RFRAMES || 180);
      const out = {};
      for (const n of poses) {
        await cam(...POSES[n]);
        await frames(45);
        const r = await ev(async (N) => {
          const gfx = await import('/src/gfx.js');
          const S = gfx.gfxStats;
          __pf.loop.length = __pf.upd.length = __pf.gap.length = __pf.rf.length = 0;
          S.gpuHist = [];
          const P = { shadow: [0, 0], ao: [0, 0], main: [0, 0] };
          __pf.on = true;
          const f0 = window.__frame;
          let k = 0;
          await new Promise((res) => {
            const tick = () => {
              __pf.rf.push(S.last);
              for (const p of ['shadow', 'ao', 'main']) { P[p][0] += S.pass[p][0]; P[p][1] += S.pass[p][1]; }
              k++;
              if (window.__frame - f0 >= N) res(); else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          __pf.on = false;
          for (const p of ['shadow', 'ao', 'main']) { P[p][0] = Math.round(P[p][0] / k); P[p][1] = +(P[p][1] / k / 1e6).toFixed(2); }
          const gh = (S.gpuHist || []).slice();
          return { cpu: S.cpu, loop: __pf.loop.slice(), upd: __pf.upd.slice(), rf: __pf.rf.slice(), gap: __pf.gap.slice(), gpu: gh, P, calls: S.calls, tris: S.tris, programs: gfx.renderer.info.programs.length, q: gfx.getQuality(), info: gfx.qualityInfo ? gfx.qualityInfo() : null };
        }, N);
        const row = { cpu: Object.fromEntries(Object.entries(r.cpu).map(([k, v]) => [k, +v.toFixed(2)])), q: r.q, calls: r.calls, tris: +(r.tris / 1e6).toFixed(2), pass: r.P, loop: stat(r.loop), update: stat(r.upd), render: stat(r.rf), gap: stat(r.gap), gpu: stat(r.gpu), programs: r.programs, info: r.info };
        out[n] = row;
        console.log(`[t] perf ${n.padEnd(12)} q ${r.q} calls ${r.calls} [sh ${r.P.shadow[0]} ao ${r.P.ao[0]} main ${r.P.main[0]}] tris ${row.tris}M [sh ${r.P.shadow[1]} ao ${r.P.ao[1]} main ${r.P.main[1]}] loop ${row.loop.mean}/${row.loop.p95} upd ${row.update.mean} rf ${row.render.mean}/${row.render.p95} gap ${row.gap.mean}/${row.gap.p95} gpu ${row.gpu.mean}/${row.gpu.p95} progs ${r.programs} cpu ${JSON.stringify(row.cpu)}${r.info ? ' ' + JSON.stringify(r.info) : ''}`);
      }
      console.log('[t] perfjson', JSON.stringify(out));
    },

    async rload() {
      // the first frame after ready, programs, and memory
      const r = await ev(async () => {
        const gfx = await import('/src/gfx.js');
        await new Promise((res) => { const w = () => (gfx.gfxStats.frames > 3 ? res() : setTimeout(w, 50)); w(); });
        const nav = performance.getEntriesByType('navigation')[0];
        const town = (await import('/src/world/town.js')).townStats;
        return { town: { buildMs: town.buildMs, batchMs: town.batchMs, meshes: town.meshes }, first: gfx.gfxStats.first, now: +performance.now().toFixed(0), dcl: nav ? +nav.domContentLoadedEventEnd.toFixed(0) : 0, programs: gfx.renderer.info.programs.length, geos: gfx.renderer.info.memory.geometries, textures: gfx.renderer.info.memory.textures, load: window.__loadTimes || null };
      });
      await frames(120);
      const r2 = await ev(async () => {
        const gfx = await import('/src/gfx.js');
        const seen = new Set();
        let attr = 0, idx = 0, freed = 0, verts = 0;
        const byName = {};
        gfx.scene.traverse((o) => {
          const g = o.geometry;
          if (!g || seen.has(g)) return;
          seen.add(g);
          let b = 0;
          for (const a of Object.values(g.attributes)) { if (a.array) b += a.array.byteLength; else freed++; }
          if (g.index?.array) idx += g.index.array.byteLength;
          attr += b;
          verts += g.attributes.position?.count || 0;
          const k = (o.name || o.type).replace(/\d+/g, '#').split(':')[0];
          byName[k] = (byName[k] || 0) + b + (g.index?.array?.byteLength || 0);
        });
        const top = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, +(v / 1e6).toFixed(1)]);
        return { attrMB: +(attr / 1e6).toFixed(1), idxMB: +(idx / 1e6).toFixed(1), freedAttrs: freed, verts, top, programs: gfx.renderer.info.programs.length, geos: gfx.renderer.info.memory.geometries };
      });
      const cdp = await page.target().createCDPSession();
      const h = await cdp.send('Runtime.getHeapUsage');
      console.log('[t] load', JSON.stringify(r));
      console.log('[t] mem', JSON.stringify(r2), 'heapMB', (h.usedSize / 1e6).toFixed(0), 'backingMB', ((h.backingStorageSize || 0) / 1e6).toFixed(0), 'embedderMB', ((h.embedderHeapUsedSize || 0) / 1e6).toFixed(0));
    },

    async rshots() {
      const tag = process.env.RTAG || 'x';
      const poses = (process.env.RPOSES || 'start,lot_e,street_long,centrum,drone_nw,aerial,snow_close').split(',');
      if (process.env.RQ) await setQ(process.env.RQ);
      // freeze the world (no traffic, no walking) so two runs can be compared
      await frames(10);
      await ev((st) => {
        const g = window.__game;
        g.update = function () {};
        if (st) { for (const c of g.cars) c.root && (c.root.visible = false); g.player.root.visible = false; for (const p of g.peds) p.char.root.visible = false; for (const n of Object.values(g.npcs)) n.root.visible = false; }
      }, !!process.env.RSTATIC);
      for (const n of poses) {
        await cam(...POSES[n]);
        await frames(20);
        await shot(`r_${tag}_${n}`);
      }
    },

    // ad-hoc: RJS = async function body run in the page (gfx is imported as `gfx`), then a shot at RPOSES
    async reval() {
      await frames(10);
      await ev(() => { window.__game.update = function () {}; });
      const r = await ev(async (code) => { const gfx = await import('/src/gfx.js'); return await (new Function('gfx', `return (async () => { ${code} })()`))(gfx); }, process.env.RJS || 'return 0');
      console.log('[t] reval', JSON.stringify(r));
      for (const n of (process.env.RPOSES || '').split(',').filter(Boolean)) { await cam(...POSES[n]); await frames(20); await shot(`r_${process.env.RTAG || 'eval'}_${n}`); }
    },

    // particles: snowfall, pickup glints, exhaust (live world, camera frozen at a pose)
    async rfx() {
      const fxm = '/src/game/fx.js';
      await cam([-12.5, 1.7, 4.2], [8, 1.5, 4.0]);
      await ev(async (m) => { const { fx } = await import(m); fx.snowfall(true, 0.75); fx.snowAmount = 0.75; }, fxm);
      await frames(40);
      console.log('[t] snow', JSON.stringify(await ev(async () => { const gfx = await import('/src/gfx.js'); let o = null; gfx.scene.traverse((m) => { if (m.geometry && m.geometry.attributes.box) o = m; }); const u = o.material.uniforms; return { vis: o.visible, cam: u.uCam.value.toArray().map((v) => +v.toFixed(1)), n: u.uCount.value, px: u.uPx.value, res: u.uRes.value.toArray(), t: +u.uTime.value.toFixed(1) }; })));
      await shot('rfx_snow');
      await cam([-6, 1.4, 4.2], [-3, 1.0, 4.2], 45);
      await ev(async (m) => { const { fx } = await import(m); fx.snowfall(false); fx.snowAmount = 0; fx.sparkle(-3, 1.0, 4.2, 0xfff1d0, 16); }, fxm);
      await frames(6);
      await shot('rfx_sparkle');
      // exhaust: a puff every 0.1 s (car.js' rate when pulling away) from a point 7 m in front of the camera
      await cam([-12.5, 1.3, 4.2], [-5, 0.5, 4.2], 50);
      await ev(async (m) => { const { fx } = await import(m); window.__ex = setInterval(() => fx.exhaust(-5.5, 0.35, 4.2, -1.0, 0), 100); }, fxm);
      await sleep(2200);
      await shot('rfx_exhaust');
      await ev(async (m) => { const { fx } = await import(m); clearInterval(window.__ex); window.__ex = setInterval(() => fx.exhaust(-5.5, 0.35, 4.2, -0.3, 0, { alpha: 0.6, size: 0.8 }), 450); }, fxm);
      await sleep(3000);
      await shot('rfx_exhaust_idle');
      await ev(() => clearInterval(window.__ex));
    },

    async rauto() {
      const thr = +(process.env.RTHROTTLE || 0);
      const cdp = await page.target().createCDPSession();
      if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
      for (let k = 0; k < 8; k++) {
        await sleep(1500);
        console.log('[t] auto', k, JSON.stringify(await ev(async () => { const g = await import('/src/gfx.js'); return { q: g.getQuality(), info: g.qualityInfo ? g.qualityInfo() : null, ms: +g.gfxStats.ms.toFixed(2) }; })));
      }
      if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    },
  };
};
