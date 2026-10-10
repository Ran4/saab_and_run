// Rendering-area scenarios (owned by the rendering agent). Loaded by tools/shot.mjs.
//   rperf   - per-pose CPU (loop/update/renderFrame), GPU timer, draw calls per pass, triangles
//             (RPOSES=a,b  RQ=high|low|auto  RFRAMES=n; add QUERY='&gputime' for the GPU timer)
//   rload   - load time, first-frame compile, programs, JS-side geometry bytes, ArrayBuffer backing
//   rshots  - A/B stills from fixed poses with the world frozen (RTAG=name -> out/r_<tag>_<pose>.png;
//             RSTATIC=1 also hides cars and people so only the static world is compared)
//   rauto   - the automatic quality: what tier/scale it picks (RTHROTTLE=n slows the CPU n x)
//   (phase 4 round 2) rprof - CPU profile of a load; rprog - program re-evaluations per frame (must
//   be ~0); rgpu - GPU classes for 'auto'; rautosim - auto quality steps on simulated frame times;
//   rsaab - the hero Saab from the side; rload also checks that the first frame compiles nothing.
//   RPROD=1 (rload, rprof): the real page (title screen, no ?test). Failed checks are console errors.
export default (helpers) => {
  const { page, ev, shot, frames, sleep, fresh, OUT } = helpers;
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
    sun_into: [[-12.5, 1.7, 4.2], [47.5, 10, -75.8]],
    title_side: [[-26, 1.3, 30], [-22, 0.8, 34]],
  };
  const cam = (at, look, fov = 55) => ev((at, look, fov) => {
    const g = window.__game;
    g.cam.update = function () {};
    const c = g.cam.cam;
    c.position.set(...at); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix();
    document.getElementById('hud').style.display = 'none';
  }, at, look, fov);
  // RPROD=1: load the real thing (no ?test: the title screen, no shader error checks, auto quality
  // unless RQ is set) instead of test mode (rload, rprof)
  const load = async () => {
    if (!process.env.RPROD) return fresh();
    await page.goto(`http://127.0.0.1:${helpers.PORT}/index.html?fresh=1${process.env.RQ ? '&q=' + process.env.RQ : ''}${process.env.QUERY || ''}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true && window.__frame > 0', { timeout: 120000, polling: 100 });
  };
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
      // the first frame after ready, programs, and memory. RLOADN=n reloads n times (timings: min /
      // median); each load records its long tasks, its loading-text phases and the rAF gaps.
      const NL = +(process.env.RLOADN || 1);
      await page.evaluateOnNewDocument(() => {
        window.__lt = []; window.__ph = []; window.__gaps = [];
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no longtask */ }
        let last = 0;
        const raf = (t) => { if (last && t - last > 60) window.__gaps.push([Math.round(last), Math.round(t - last)]); last = t; if (!window.__gapsDone) requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
        document.addEventListener('DOMContentLoaded', () => {
          const el = document.getElementById('loading');
          if (!el) return;
          new MutationObserver(() => window.__ph.push([Math.round(performance.now()), el.textContent, el.classList.contains('done') ? 'done' : ''])).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
        });
      });
      const runs = [];
      for (let k = 0; k < NL; k++) {
        await load();
        await frames(60);
        const r0 = await ev(async () => {
          const gfx = await import('/src/gfx.js');
          const town = (await import('/src/world/town.js')).townStats;
          window.__gapsDone = true;
          return { ready: Math.round(window.__readyAt || 0), long: window.__lt.slice(), phases: window.__ph.slice(), gaps: window.__gaps.slice(), first: gfx.gfxStats.first, warm: gfx.warmStats, tt: window.__tt, town: { buildMs: town.buildMs, batchMs: town.batchMs, meshes: town.meshes, steps: town.steps } };
        });
        const maxLong = Math.max(0, ...r0.long.map((l) => l[1]));
        // (precompile covers the scene, the pre-pass kinds and the post chain: the first frame compiles nothing)
        if (r0.first?.newPrograms?.length) await ev((l) => console.error('rload: the first frame compiled programs: ' + l), JSON.stringify(r0.first.newPrograms));
        const done = r0.phases.find((p) => p[2] === 'done');
        console.log(`[t] rload#${k} first ${JSON.stringify(r0.first)} warm ${JSON.stringify(r0.warm)} tt ${JSON.stringify(r0.tt)} town ${JSON.stringify(r0.town)} maxLong ${maxLong} ready ${done ? done[0] : '?'}`);
        console.log(`[t] rload#${k} long ${JSON.stringify(r0.long)} phases ${JSON.stringify(r0.phases.map((p) => [p[0], p[1].slice(0, 14), p[2]]))} gaps ${JSON.stringify(r0.gaps.filter((g) => g[1] > 90))}`);
        runs.push({ first: r0.first?.ms ?? 0, firstMain: r0.first?.main ?? 0, town: r0.town.buildMs, maxLong, ready: done ? done[0] : 0 });
      }
      if (NL > 1) {
        const mm = (k) => { const s = runs.map((r) => r[k]).sort((a, b) => a - b); return `${s[0]} / ${s[s.length >> 1]}`; };
        console.log(`[t] rload summary (min / median of ${NL}): first ${mm('first')} ms (main ${mm('firstMain')}), town ${mm('town')} ms, longest task ${mm('maxLong')} ms, ready ${mm('ready')} ms`);
      }
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

    // CPU profile of a whole load (reload with the profiler on): self time per function and the
    // inclusive time of named functions (RPROF_FN=a,b,c adds names). Sampling 0.2 ms.
    async rprof() {
      const cdp = await page.target().createCDPSession();
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
      await load();
      await frames(30);
      const { profile } = await cdp.send('Profiler.stop');
      const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
      const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const dt = new Map();
      for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
      const self = new Map(), incl = new Map(), within = new Map(), W = process.env.RPROF_WITHIN || '';
      const want = new Set(['buildTown', 'buildTownAsync', 'finalizeSigns', 'buildStreets', 'buildOutskirts', 'batchStatic', 'build', 'mergeGeometries', 'uploadGeometry', 'precompile', 'finishFace', 'renderFrame', 'touchSurfaces', 'makeStatic', 'placeCollectibles', 'oveBlock', 'radhusBlock', 'villaBlock', 'apartmentsBlock', 'centrumBlock', 'hospitalBlock', 'forestBlock', 'parkBlock', 'cemeteryBlock', 'churchBlock', 'fieldBlock', 'dealerBlock', 'gasBlock', 'kommunBlock', 'preschoolBlock', 'finalizeProps', 'warmCars', 'renderPortrait', 'spawnPeds', 'Character', 'Car', 'compileAsync', 'paint', 'add', 'splitBySurface', 'ensurePartAttributes', '(garbage collector)', ...(process.env.RPROF_FN || '').split(',').filter(Boolean)]);
      for (const [id, ms] of dt) {
        const n = nodes.get(id), fn = n.callFrame.functionName || '(anon)';
        const key = `${fn} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
        self.set(key, (self.get(key) || 0) + ms);
        const seen = new Set();
        for (let p = id; p !== undefined; p = parent.get(p)) {
          const f = nodes.get(p).callFrame.functionName;
          if (want.has(f) && !seen.has(f)) { seen.add(f); incl.set(f, (incl.get(f) || 0) + ms); }
        }
        if (W && seen.has(W)) {
          // what X spends its time in: the leaf, plus the first frame below X on the stack
          let below = '', p = id;
          for (; p !== undefined && nodes.get(p).callFrame.functionName !== W; p = parent.get(p)) below = nodes.get(p).callFrame.functionName || '(anon)';
          const k = `${fn} < ${below}`;
          within.set(k, (within.get(k) || 0) + ms);
        }
      }
      const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(0)} ${k}`);
      console.log('[t] rprof incl', JSON.stringify(Object.fromEntries([...incl].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]))));
      console.log('[t] rprof self\n  ' + top.join('\n  '));
      if (W) console.log(`[t] rprof within ${W}\n  ` + [...within].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(0)} ${k}`).join('\n  '));
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

    // program re-evaluations per frame (three calls getParameters + customProgramCacheKey for a
    // material whenever it decides the program may have to change): every material's
    // customProgramCacheKey is wrapped with a counter for RFRAMES (30) frames at each pose in RPOSES
    // (default start, street_long); prints the per-frame total and the materials responsible.
    async rprog() {
      const poses = (process.env.RPOSES || 'start,street_long').split(',');
      const out = {};
      for (const n of poses) {
        await cam(...POSES[n]);
        await frames(30);
        const r = await ev(async (N) => {
          const gfx = await import('/src/gfx.js');
          const mats = new Set();
          const add = (m) => { if (Array.isArray(m)) m.forEach(add); else if (m && m.isMaterial) mats.add(m); };
          gfx.scene.traverse((o) => { add(o.material); add(o.customDepthMaterial); });
          const K = gfx.gfxDebug.kinds();
          [...K.PRE, ...K.DEPTH, ...K.NORMAL].forEach(add);
          const cnt = new Map(), orig = [];
          for (const m of mats) {
            const f = m.customProgramCacheKey;
            orig.push([m, Object.hasOwn(m, 'customProgramCacheKey') ? f : undefined]);
            m.customProgramCacheKey = function () { cnt.set(m, (cnt.get(m) || 0) + 1); return f.call(this); };
          }
          const f0 = window.__frame;
          await new Promise((res) => { const t = () => (window.__frame - f0 >= N ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
          const frames = window.__frame - f0;
          for (const [m, f] of orig) { if (f === undefined) delete m.customProgramCacheKey; else m.customProgramCacheKey = f; }
          const list = [...cnt].map(([m, c]) => [m.name || m.type, +(c / frames).toFixed(2)]).sort((a, b) => b[1] - a[1]);
          return { frames, perFrame: +(list.reduce((a, b) => a + b[1], 0)).toFixed(2), top: list.slice(0, 12) };
        }, +(process.env.RFRAMES || 30));
        out[n] = r;
        console.log(`[t] rprog ${n} re-evaluations/frame ${r.perFrame} over ${r.frames} frames: ${JSON.stringify(r.top)}`);
        if (r.perFrame > 0.5) await ev((m) => console.error(m), `rprog: ${r.perFrame} program re-evaluations per frame at ${n}`);
      }
    },

    // GPU classes for 'auto' (gfx classifyGpu) against sample WEBGL_debug_renderer_info strings
    async rgpu() {
      const SAMPLES = {
        'ANGLE (NVIDIA, NVIDIA GeForce MX450 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/weak',
        'NVIDIA GeForce MX150/PCIe/SSE2': 'low/weak',
        'ANGLE (NVIDIA, NVIDIA GeForce MX550 (0x00001F9F) Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/weak',
        'ANGLE (NVIDIA, NVIDIA Quadro P620 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/weak',
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high/laptop',
        'NVIDIA GeForce GTX 1650 with Max-Q Design/PCIe/SSE2': 'high/laptop',
        'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4070/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 550.120)': 'high/discrete',
        'ANGLE (NVIDIA, NVIDIA Quadro T1000 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high/discrete',
        'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high/discrete',
        'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/integrated',
        'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/integrated',
        'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/integrated',
        'ANGLE (AMD, AMD Radeon 680M Direct3D11 vs_5_0 ps_5_0, D3D11)': 'low/integrated',
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)': 'low/integrated',
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)': 'high/discrete',
        'Mali-G78 MC20': 'low/integrated',
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)': 'low/integrated',
      };
      const r = await ev(async (S) => {
        const gfx = await import('/src/gfx.js');
        return Object.entries(S).map(([s, want]) => { const c = gfx.classifyGpu(s); const got = `${c.tier}/${c.weak ? 'weak' : c.laptop ? 'laptop' : c.discrete ? 'discrete' : c.integrated ? 'integrated' : '?'}`; return [s.slice(0, 60), want, got, got === want]; });
      }, SAMPLES);
      const bad = r.filter((x) => !x[3]);
      for (const x of r) console.log(`[t] rgpu ${x[3] ? 'ok ' : 'BAD'} ${x[2].padEnd(16)} ${x[0]}`);
      if (bad.length) await ev((n) => console.error(`rgpu: ${n} GPU strings classified wrong`), bad.length);
    },

    // the hero Saab from the side (as the art review's art_idle_side): shots + the mean sRGB of the
    // lower door, the upper door and the window band (RTAG names the shots)
    async rsaab() {
      await frames(10);
      await ev(() => { window.__game.update = function () {}; });
      const views = { side: [7.5, 2.6, 0.2], low: [5.5, 1.2, 1.5], rear: [-4, 2, 6] };
      for (const [n, [d, h, a]] of Object.entries(views)) {
        await ev(([d, h, a]) => {
          const g = window.__game, c = g.named.saab, f = [Math.sin(c.yaw), Math.cos(c.yaw)], r = [-Math.cos(c.yaw), Math.sin(c.yaw)];
          g.cam.update = function () {};
          const cam = g.cam.cam;
          cam.position.set(c.x + r[0] * d + f[0] * a, h, c.z + r[1] * d + f[1] * a);
          cam.lookAt(c.x, 0.7, c.z); cam.fov = 45; cam.updateProjectionMatrix();
          document.getElementById('hud').style.display = 'none';
        }, [d, h, a]);
        await frames(20);
        await shot(`r_${process.env.RTAG || 'saab'}_${n}`);
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

    // the story with a memory / renderer log every 5 s (diagnosis of renderer crashes)
    async rstory() {
      const cdp = await page.target().createCDPSession();
      let t0 = Date.now(), alive = true;
      const tick = setInterval(async () => {
        if (!alive) return;
        try {
          const h = await cdp.send('Runtime.getHeapUsage');
          const r = await page.evaluate(async () => {
            const g = window.__game, gfx = await import('/src/gfx.js'), i = gfx.renderer.info;
            const pm = performance.memory || {};
            return { day: g?.missions?.day ?? g?.missions?.idx, st: g?.missions?.state, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs.length, calls: gfx.gfxStats.calls, ms: +gfx.gfxStats.ms.toFixed(1), last: +(gfx.gfxStats.last || 0).toFixed(1), q: gfx.qualityInfo(), jsMB: Math.round((pm.usedJSHeapSize || 0) / 1e6), objs: (() => { let n = 0; gfx.scene.traverse(() => n++); return n; })() };
          });
          console.log(`[mem] t=${((Date.now() - t0) / 1000).toFixed(0)}s heap ${(h.usedSize / 1e6).toFixed(0)}MB backing ${((h.backingStorageSize || 0) / 1e6).toFixed(0)}MB ${JSON.stringify(r)}`);
        } catch (e) { console.log('[mem] err', e.message); }
      }, 5000);
      page.on('error', (e) => console.log('[mem] page error (crash?)', e.message));
      try { await (await import('./story.mjs')).default(helpers).story(); } finally { alive = false; clearInterval(tick); }
    },

    // the automatic quality's steps with simulated frame times (QUERY='&q=auto&dynscale'): a GPU-bound
    // model (time ~ samples and scale^2), and a CPU-bound one (steps do nothing: undone and held)
    async rautosim() {
      const r = await ev(async () => {
        const g = await import('/src/gfx.js'), D = g.gfxDebug;
        const run = (label, base, gpuBound, n = 900) => {
          g.setQuality('auto');
          D.aqSim(true);
          const seq = []; let now = 1e6, prev = '';
          for (let k = 0; k < n; k++) {
            const i = g.qualityInfo();
            const T = gpuBound ? base * (i.msaa >= 4 ? 1 : i.msaa === 2 ? 0.86 : 0.75) * i.scale * i.scale : base;
            now += T; D.aqStep(now);
            const j = g.qualityInfo(), st = `${j.tier}/x${j.msaa}/s${j.scale}`;
            if (st !== prev) { seq.push(`${(now / 1000 - 1000).toFixed(1)}s ${st}`); prev = st; }
          }
          D.aqSim(false);
          return `${label}: ${seq.join(' -> ')}`;
        };
        const out = [run('gpu 20.5 ms', 20.5, true), run('gpu 24 ms', 24, true), run('cpu 19.5 ms', 19.5, false), run('gpu 16 ms', 16, true)];
        g.setQuality('high');
        return out;
      });
      for (const l of r) console.log('[t] rautosim', l);
      // GPU-bound a little over budget: 2x MSAA first, nothing else; CPU-bound: the step is undone;
      // under budget: nothing moves
      const want = [/^gpu 20\.5 ms: 0\.0s high\/x4\/s1 -> [\d.]+s high\/x2\/s1$/, /x2\/s0\.9/, /^cpu 19\.5 ms: .*-> [\d.]+s high\/x4\/s1$/, /^gpu 16 ms: 0\.0s high\/x4\/s1$/];
      const bad = want.map((re, i) => (re.test(r[i]) ? null : r[i])).filter(Boolean);
      if (bad.length) await ev((b) => console.error('rautosim: unexpected steps: ' + b), JSON.stringify(bad));
    },

    async rauto() {
      const thr = +(process.env.RTHROTTLE || 0);
      const cdp = await page.target().createCDPSession();
      if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
      let f0 = await ev(() => window.__frame), t0 = Date.now();
      for (let k = 0; k < +(process.env.RAUTON || 8); k++) {
        await sleep(1500);
        const f1 = await ev(() => window.__frame), t1 = Date.now();
        const r = await ev(async () => { const g = await import('/src/gfx.js'); const i = g.qualityInfo(); return { tier: i.tier, scale: i.scale, msaa: i.msaa, fxaa: i.fxaa, reason: i.reason, cpu: +g.gfxStats.ms.toFixed(2), gpu: +(g.gfxStats.gpuMs || 0).toFixed(2) }; });
        console.log('[t] auto', k, `frame ${((t1 - t0) / Math.max(1, f1 - f0)).toFixed(1)} ms`, JSON.stringify(r));
        f0 = f1; t0 = t1;
      }
      if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    },
  };
};
