// UI-owned scenarios (phase 4, round 2). Run: PORT=88xx node tools/shot.mjs <name>
//   uiportraits  every cast portrait at full size, at the dialogue sizes (84x100 letterbox, 96x114
//                card) and in the round crops (58 px call card, 38 px toast), plus numbers measured on
//                the linear (HDR) render: the face's key-to-shadow ratio (p90 / p10 of luminance in a
//                box over cheeks, nose and mouth), the rim (brightest 3 % of the head's right edge over
//                the face median) and the time per portrait. PL='{"key":4.8,...}' overrides PORTRAIT
//                (a JSON object, or {"name": {...}, ...} for several sets side by side), PLDBG=1 draws
//                the sample boxes.
//   uitoasts     hud.clearToasts(cls), and toasts / the report ticket held back while the letterbox,
//                the curtain or a scene (game.inDialog) is up; what was queued shows afterwards.
//   uiabort      the pause menu's "Avbryt dagens uppdrag" in a real (non-test) game: hidden in free
//                roam, shown while day 1 runs, two clicks -> idle, unpaused, day 1 given up.
//   uifavicon    a non-test load must request no /favicon.ico (no 404 in the console).
export default ({ page, ev, shot, frames, sleep, tap, until, fresh, errors, PORT, OUT }) => {
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };

  // Loads the game without ?test (the pause menu only works there) with dialogue auto-advancing.
  const realGame = async () => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?fresh=1`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
    await page.click('#play');
    await sleep(1200);
  };

  return {
    async uiportraits() {
      const sets = process.env.PL ? JSON.parse(process.env.PL) : null;
      const multi = sets && Object.values(sets).every((v) => v && typeof v === 'object' && !Array.isArray(v));
      const list = !sets ? [['current', {}]] : multi ? Object.entries(sets) : [['custom', sets]];
      for (const [name, L] of list) {
        const r = await ev(async ({ L, dbg }) => {
          const { renderPortrait, PORTRAIT, hud } = await import('./src/game/hud.js');
          const { renderer } = await import('./src/gfx.js');
          const g = __game;
          const keys = Object.keys(hud.portraits).filter((k) => k === 'ove' || g.npc(k));
          const saved = JSON.parse(JSON.stringify(PORTRAIT));
          Object.assign(PORTRAIT, L);
          // Capture the float render (linear, before tone mapping) for the measurements.
          let px = null;
          const orig = renderer.readRenderTargetPixels;
          renderer.readRenderTargetPixels = function (rt, x, y, w, h, buf) { orig.call(this, rt, x, y, w, h, buf); px = buf; };
          const S = 256, lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          const out = [], urls = {};
          // Shader warm-up (the first portrait compiles programs): not timed.
          renderPortrait(renderer, g.player.model);
          for (const k of keys) {
            const m = k === 'ove' ? g.player.model : g.npc(k).model;
            const t0 = performance.now();
            urls[k] = renderPortrait(renderer, m);
            const ms = performance.now() - t0;
            // Face box (image rows from the top; GL rows are bottom-up): under the eye line (40 %)
            // down to the mouth, over the head's middle.
            const face = [];
            for (let y = 112; y < 150; y++) for (let x = 104; x < 156; x++) {
              const i = ((S - 1 - y) * S + x) * 4;
              if (px[i + 3] > 0.99) face.push(lum(i));
            }
            face.sort((a, b) => a - b);
            const q = (p) => face[Math.min(face.length - 1, Math.floor(p * face.length))] || 0;
            // Rim: per row (hair to shoulder), the rightmost 4 covered pixels.
            const edge = [];
            for (let y = 50; y < 240; y += 2) {
              let xr = -1;
              for (let x = S - 1; x > 128; x--) { const i = ((S - 1 - y) * S + x) * 4; if (px[i + 3] > 0.99) { xr = x; break; } }
              for (let x = xr; x > xr - 4 && x > 128; x--) { const i = ((S - 1 - y) * S + x) * 4; edge.push(lum(i)); }
            }
            edge.sort((a, b) => b - a);
            const rim = edge.slice(0, Math.max(1, Math.round(edge.length * 0.03))).reduce((a, b) => a + b, 0) / Math.max(1, Math.round(edge.length * 0.03));
            out.push({ k, ms: +ms.toFixed(1), ratio: +(q(0.9) / Math.max(1e-4, q(0.1))).toFixed(2), med: +q(0.5).toFixed(3), p90: +q(0.9).toFixed(3), rim: +(rim / Math.max(1e-4, q(0.5))).toFixed(2), n: face.length });
          }
          renderer.readRenderTargetPixels = orig;
          Object.assign(PORTRAIT, saved);
          // The sheet: full frame, the letterbox dialogue (84x100) and card (96x114) crops, the call
          // card's round crop (58) and the toast's (38), all with the game's own CSS crops.
          const box = document.createElement('div');
          box.id = 'pt-sheet';
          box.style.cssText = 'position:fixed;inset:0;z-index:99;background:#20252b;padding:8px 10px;display:grid;grid-template-columns:repeat(6,1fr);gap:8px 10px;align-content:start;font:12px sans-serif;color:#ccd';
          for (const k of keys) {
            const d = document.createElement('div');
            const b = dbg ? '<i style="position:absolute;left:' + (104 / 256 * 150) + 'px;top:' + (112 / 256 * 150) + 'px;width:' + (52 / 256 * 150) + 'px;height:' + (38 / 256 * 150) + 'px;outline:1px solid #f0f"></i>' : '';
            d.innerHTML = `<div>${k}</div><div style="position:relative;width:150px;height:150px"><img src="${urls[k]}" style="width:150px;height:150px;display:block">${b}</div>
              <div style="display:flex;gap:6px;align-items:flex-end;margin-top:5px">
                <img src="${urls[k]}" style="width:84px;height:100px;object-fit:cover;display:block;box-shadow:0 0 0 1px rgba(255,255,255,.22)">
                <div style="display:flex;flex-direction:column;gap:5px;align-items:center">
                  <span style="display:block;width:58px;height:58px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 1.5px rgba(255,255,255,.75)"><img src="${urls[k]}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.4286);transform-origin:50% 20%;display:block"></span>
                  <span style="display:block;width:38px;height:38px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 1.5px rgba(255,255,255,.7)"><img src="${urls[k]}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.6667);transform-origin:50% 20%;display:block"></span>
                </div>
              </div>`;
            box.appendChild(d);
          }
          document.getElementById('pt-sheet')?.remove();
          document.body.appendChild(box);
          // Four at their native 256 px, for detail.
          const big = document.createElement('div');
          big.id = 'pt-big';
          big.style.cssText = 'position:fixed;inset:0;z-index:100;background:#20252b;padding:10px;display:flex;gap:10px;align-items:flex-start;visibility:hidden';
          for (const k of ['ove', 'parvaneh', 'anita', 'patrick']) if (urls[k]) big.insertAdjacentHTML('beforeend', `<img src="${urls[k]}" style="width:256px;height:256px">`);
          document.body.appendChild(big);
          return out;
        }, { L, dbg: !!process.env.PLDBG });
        for (const o of r) log('portrait', name, JSON.stringify(o));
        const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
        log('portraits', name, JSON.stringify({ ratioMedian: med(r.map((o) => o.ratio)), ratioMin: Math.min(...r.map((o) => o.ratio)), ratioMax: Math.max(...r.map((o) => o.ratio)), rimMedian: med(r.map((o) => o.rim)), msMedian: med(r.map((o) => o.ms)), msMax: Math.max(...r.map((o) => o.ms)) }));
        await sleep(400);
        await shot('ui_portraits_' + name);
        await ev(() => { document.getElementById('pt-big').style.visibility = 'visible'; });
        await sleep(200);
        await page.screenshot({ path: `${OUT}/ui_portraits_${name}_big.png`, clip: { x: 0, y: 0, width: 1074, height: 276 } });
        await ev(() => document.getElementById('pt-big')?.remove());
      }
      // The dialogue box as the game shows it (letterbox), with the new portrait.
      await ev(async () => {
        document.getElementById('pt-sheet')?.remove();
        document.getElementById('pt-big')?.remove();
        const { hud } = await import('./src/game/hud.js');
        hud.letterbox(true);
        const d = hud.dialog;
        d.classList.add('show');
        d.querySelector('img').src = hud.portraits.parvaneh;
        d.querySelector('.dlg-name').textContent = 'Parvaneh';
        d.querySelector('.dlg-text').textContent = 'Ove! Kan du lära mig köra bil? Jag har teori på torsdag.';
      });
      await sleep(900);
      await shot('ui_portraits_dialog');
      // The call card and a phone toast (out of the letterbox: toasts wait while it is down).
      await ev(async () => {
        const { hud } = await import('./src/game/hud.js');
        hud.letterbox(false); hud.dialog.classList.remove('show');
        hud.incomingCall('jimmy', 'Jimmy', 'Radhus 9');
        hud.phone('anita', 'Anita', 'Rune har somnat i stolen igen. Kan du titta förbi?');
      });
      await sleep(900);
      await shot('ui_portraits_call');
      await ev(async () => { const { hud } = await import('./src/game/hud.js'); hud.endCall(); });
    },

    async uitoasts() {
      const H = async (fn, ...a) => ev(fn, ...a);
      const st = () => ev(async () => {
        const { hud } = await import('./src/game/hud.js');
        const live = [...hud.toastsEl.children].filter((t) => !t.classList.contains('out'));
        return { cine: document.getElementById('hud').classList.contains('cine'), live: live.map((t) => t.textContent.trim().slice(0, 40)), queued: (hud._toastQ || []).length, nbOpacity: getComputedStyle(document.getElementById('notebook')).opacity, toastsOpacity: getComputedStyle(hud.toastsEl).opacity };
      });
      const expect = (label, ok, o) => { log(label, ok ? 'ok' : 'FAIL', JSON.stringify(o)); if (!ok) bad(label, JSON.stringify(o)); };
      // 1. clearToasts('phone') fades only the phone toasts.
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.phone('jimmy', 'Jimmy', 'Jag har glömt min mobil på torget.'); hud.toast('Felparkerade bilar i området.', '', 9000); hud.clearToasts('phone'); });
      await sleep(800);
      let o = await st();
      expect('clearToasts(phone)', o.live.length === 1 && /Felparkerade/.test(o.live[0]), o);
      // 2. The letterbox: what is on screen fades, new toasts wait, the ticket hides.
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.notebook.show({ plate: 'ABC 123', kind: 'lawn', place: 'Gångvägen', time: '06:42' }); });
      await sleep(600);
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.letterbox(true); hud.toast('<b>Patrick</b> vill dig något <span class="bang">!</span> Leta efter markeringen.'); hud.toast('Ove betalar för det han förstört: 22 kr', 'bad'); });
      await sleep(800);
      o = await st();
      expect('letterbox holds', o.cine && o.live.length === 0 && o.queued === 2 && +o.nbOpacity < 0.05 && +o.toastsOpacity < 0.05, o);
      await shot('ui_cine_letterbox');
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.letterbox(false); hud.notebook.hide(); });
      await sleep(1500);
      o = await st();
      expect('after letterbox', !o.cine && o.live.length === 2 && o.queued === 0, o);
      await shot('ui_cine_after');
      // 3. The curtain (a time skip) hides a report ticket that is still up.
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.clearToasts(); hud.notebook.show({ plate: 'PBK 347', kind: 'lawn', place: 'Gångvägen, radhusområdet', time: '10:36' }); hud.notebook.done(); });
      await sleep(300);
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.curtain(true, 'Ove går in och luftar elementen. Ett i taget.'); hud.toast('Tom krok.', '', 4000); });
      await sleep(900);
      o = await st();
      expect('curtain holds', o.cine && o.live.length === 0 && o.queued === 1 && +o.nbOpacity < 0.05, o);
      await shot('ui_cine_curtain');
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.curtain(false); });
      await sleep(1300);
      o = await st();
      expect('after curtain', !o.cine && o.live.length === 1, o);
      // 4. A held shot without letterbox (game.inDialog, e.g. UPPDRAG KLART).
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.clearToasts(); __game.inDialog = true; });
      await frames(3);
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.toast('Dagen är slut.', '', 4000); });
      await sleep(300);
      o = await st();
      expect('held shot holds', o.cine && o.live.length === 0 && o.queued === 1, o);
      await H(() => { __game.inDialog = false; });
      await sleep(1200);
      o = await st();
      expect('after held shot', !o.cine && o.live.length === 1, o);
      await H(async () => { const { hud } = await import('./src/game/hud.js'); hud.clearToasts(); });
      await sleep(700);
      // 5. The real case: a phone call going on when the day's intro starts (play review d5_intro_0).
      await H(() => __game.interrupts.force('mobilen'));
      await sleep(5500);
      o = await st();
      log('call toasts before the intro', JSON.stringify(o));
      await H(() => {
        const g = __game, n = g.npc(g.missions.offered.giver);
        const s = g.freeSpot(n.x, n.z, 1.0, 1.8);
        g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z));
        g.missions.begin();
      });
      await sleep(1500);
      o = await st();
      expect('intro: no call toasts', o.cine && o.live.length === 0, o);
      await shot('ui_cine_intro');
      try { await until(() => __game.missions.state === 'running', 60000); } catch (e) { bad('intro never ended'); }
      await sleep(1500);
      o = await st();
      log('after the intro', JSON.stringify(o));
      if (o.cine) bad('cine still on after the intro', JSON.stringify(o));
      await shot('ui_cine_running');
    },

    async uiabort() {
      await realGame();
      await ev(() => { __game.autoDialog = true; });
      const st = () => ev(() => { const g = __game, b = document.getElementById('opt-abort'); return { paused: g.paused, menu: document.getElementById('pause').classList.contains('show'), state: g.missions.state, day: g.missions.index + 1, btn: b.hidden ? 'hidden' : b.textContent, gaveUp: [...g.missions.gaveUp], offered: g.missions.offered?.giver || null }; });
      const expect = (label, ok, o) => { log(label, ok ? 'ok' : 'FAIL', JSON.stringify(o)); if (!ok) bad(label, JSON.stringify(o)); };
      await tap('KeyP'); await sleep(400);
      let o = await st();
      expect('free roam: no abort button', o.paused && o.btn === 'hidden', o);
      await shot('ui_pause_free');
      await tap('KeyP'); await sleep(400);
      // Day 1 (Patrick): begin, let the intro run.
      await ev(() => {
        const g = __game, n = g.npc(g.missions.offered.giver);
        const s = g.freeSpot(n.x, n.z, 1.0, 1.8);
        g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z));
        g.missions.begin();
      });
      await tap('KeyP'); await sleep(400);
      o = await st();
      expect('intro: no abort button', o.state !== 'running' ? o.btn === 'hidden' || !o.paused : true, o);
      if (o.paused) { await tap('KeyP'); await sleep(400); }
      await until(() => __game.missions.state === 'running', 60000);
      await sleep(1500);
      await tap('KeyP'); await sleep(400);
      o = await st();
      expect('running: abort button', o.paused && o.btn === 'Avbryt dagens uppdrag', o);
      await shot('ui_pause_mission');
      await page.click('#opt-abort'); await sleep(200);
      o = await st();
      expect('first click asks', o.paused && o.state === 'running' && o.btn === 'Säker? Klicka igen', o);
      await shot('ui_pause_confirm');
      // It falls back after 3.5 s.
      await sleep(3800);
      o = await st();
      expect('confirm times out', o.btn === 'Avbryt dagens uppdrag' && o.state === 'running', o);
      await page.click('#opt-abort'); await sleep(200);
      await page.click('#opt-abort'); await sleep(600);
      o = await st();
      expect('aborted and unpaused', !o.paused && !o.menu && o.state === 'idle' && o.gaveUp.includes(1) && o.offered === 'patrick', o);
      const toasts = await ev(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent.trim()));
      log('toasts', JSON.stringify(toasts));
      if (!toasts.some((t) => /väntar|står kvar/.test(t))) bad('no "väntar fortfarande" toast', JSON.stringify(toasts));
      await shot('ui_after_abort');
      // The menu again: hidden in free roam once more.
      await tap('KeyP'); await sleep(400);
      o = await st();
      expect('idle again: no abort button', o.paused && o.btn === 'hidden', o);
      await tap('KeyP'); await sleep(300);
      // The day can be taken up again (the short retry intro).
      await ev(() => { const g = __game, n = g.npc(g.missions.offered.giver); const s = g.freeSpot(n.x, n.z, 1.0, 1.8); g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z)); g.missions.begin(); });
      try { await until(() => __game.missions.state === 'running', 60000); log('day 1 taken up again', JSON.stringify(await st())); } catch (e) { bad('day 1 did not start again'); }
      // The same with a gamepad only (a mocked standard pad): Start, down to the button, A twice.
      await ev(() => {
        window.__pad = { connected: true, mapping: 'standard', index: 0, id: 'mock pad', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
        Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad], configurable: true });
      });
      const padTap = async (i) => {
        await ev((i) => { const b = window.__pad.buttons[i]; b.pressed = true; b.value = 1; }, i); await frames(3);
        await ev((i) => { const b = window.__pad.buttons[i]; b.pressed = false; b.value = 0; }, i); await frames(3);
      };
      await sleep(400);
      await padTap(9); await sleep(400);
      o = await st();
      expect('pad: Start pauses', o.paused && o.btn === 'Avbryt dagens uppdrag', o);
      for (let k = 0; k < 12; k++) {
        if (await ev(() => document.activeElement?.id === 'opt-abort')) break;
        await padTap(13);
      }
      const foc = await ev(() => document.activeElement?.id);
      expect('pad: focus on the abort button', foc === 'opt-abort', { foc });
      await shot('ui_pause_pad');
      await padTap(0); await sleep(150);
      o = await st();
      expect('pad: A asks', o.paused && o.btn === 'Säker? Klicka igen', o);
      await padTap(0); await sleep(600);
      o = await st();
      expect('pad: aborted and unpaused', !o.paused && !o.menu && o.state === 'idle', o);
      const jumped = await ev(() => __game.player.y - __game.groundAt(__game.player.x, __game.player.z));
      log('pad: height over ground after the resume', jumped.toFixed(2));
    },

    async uifavicon() {
      const seen = [];
      const onResp = (r) => { const u = r.url(); if (/favicon/.test(u) || r.status() >= 400) seen.push(`${r.status()} ${u}`); };
      page.on('response', onResp);
      // Twice, the second time with no parameters at all (that is when the play review saw the 404s).
      for (const q of ['?fresh=1', '']) {
        await page.goto(`http://127.0.0.1:${PORT}/${process.env.FAVPAGE || 'index.html'}${q}`, { waitUntil: 'load' });
        try { await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 }); }
        catch (e) { bad(`load '${q}' never became ready:`, await ev(() => document.getElementById('loading')?.textContent)); return; }
        await sleep(2500);
      }
      page.off('response', onResp);
      log('favicon/4xx requests', JSON.stringify(seen));
      if (seen.length) bad('requests', JSON.stringify(seen));
      const href = await ev(() => document.querySelector('link[rel=icon]')?.href || '');
      log('icon', href.slice(0, 40));
      await ev((href) => {
        const d = document.createElement('div');
        d.id = 'fav-sheet';
        d.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#fff;padding:12px;display:flex;gap:14px;align-items:center';
        for (const s of [16, 32, 64, 128]) d.insertAdjacentHTML('beforeend', `<img src="${href}" style="width:${s}px;height:${s}px">`);
        document.body.appendChild(d);
      }, href);
      await sleep(300);
      await page.screenshot({ path: `${OUT}/ui_favicon.png`, clip: { x: 0, y: 0, width: 300, height: 160 } });
      // The title's controls table (the Q row's longer text must stay on one line).
      await ev(() => { document.getElementById('fav-sheet')?.remove(); document.getElementById('title-ctl').click(); });
      await sleep(600);
      const q = await ev(() => { const r = [...document.querySelectorAll('#title .controls tr')].pop(); const tb = document.querySelector('#title .title-controls').getBoundingClientRect(), rr = r.getBoundingClientRect(); return { rowH: Math.round(rr.height), right: Math.round(rr.right), boxRight: Math.round(tb.right) }; });
      log('Q row', JSON.stringify(q));
      if (q.right > q.boxRight + 1) bad('Q row overflows the controls box', JSON.stringify(q));
      await shot('ui_title_controls');
    },
  };
};
