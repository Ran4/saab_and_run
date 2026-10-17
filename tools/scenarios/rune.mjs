// Rune's errand made a sandbox (features/implemented/roligare_runeuppdrag.md, game/rune.js,
// stages.js escort), and his death for good, anywhere (features/implemented/rune_ar_permadod.md).
//   runeroll    real keys: E takes hold of the wheelchair, Shift+W, E lets go in the stride: he rolls
//               on (> 8 m) and stops; walking and letting go: under 1.5 m; E takes hold again
//   runekick    real keys: J kicks the chair from behind (it rolls on forwards), from in front
//               (backwards); the errand's panel shows his cold, no timer
//   runecar     a car at speed into him: dead (tipped onto his side), the banner, no E / Q: the errand
//               over at once, saved; Anita grieves already (a sob near her, her hand over her eyes),
//               and phones (she wasn't there); then (revived by hand, tests only) Ove's own Saab,
//               driven at him with real keys: "Ove körde över Rune."; the thresholds: anybody's car
//               at 1.5 m/s kills him, Ove's at 1.2 m/s only shoves him, a chair rolled into a passing
//               car's flank dies
//   runetraffic real keys: Rune kicked off the pavement into the street (no errand), a traffic car
//               with its own AI comes along and does not brake for him (obstacleAhead never sees
//               him; a passer-by in his place it does, and his body), and runs him over
//   runehome    day 1's trailer: at home by his door (no errand), Ove backs a car with a trailer
//               into him with real keys (S, walking pace): "Ove backade över Rune."; Anita, beside
//               him, cries out (no call); saved: a reload keeps him dead
//   runecold    the cold: ~1/300 a second in town, much quicker out past the forest (pushed out there
//               with real keys); dead of cold (slumped), the errand over at once (no E / Q), the body
//               gone once Ove is off, saved: a reload keeps him dead (no errand needs him, Anita's
//               small talk is grief)
//   runewidow   ?runedead: Rune nowhere, Anita at her door (shots: rune_widow_*), her sobs, her chatter,
//               the horn at her, no errand of Rune's or Anita's that needs him. (The story without him:
//               QUERY='&runedead' node tools/shot.mjs story luft.)
//   runelook    close-ups, no checks: dead of cold in his chair, tipped over by a car, Anita grieving
//               (rune_look_*.png)
// Failed checks are pushed to the run's errors ('N errors').
export default ({ page, ev, shot, frames, sleep, hold, tap, until, fresh, errors, PORT }) => {
  const fail = (msg) => { console.log('CHECK FAILED', msg); errors.push('check: ' + msg); };
  const check = (ok, msg, info) => { if (!ok) fail(msg + (info !== undefined ? ' ' + JSON.stringify(info) : '')); else console.log('[t] ok', msg, info !== undefined ? JSON.stringify(info) : ''); };

  // The errand, quick (no call), with Rune put down on a clear stretch: Solrosvägen's centre line
  // (z = -40), heading east, the traffic near it stopped; Ove `back` m behind him, the camera behind Ove.
  const setup = (o = {}) => ev((o) => {
    const g = __game, I = __interrupt;
    if (g.playerCar) g.exitCar(true);
    for (const c of g.cars) if (c.ai && Math.abs(c.z + 40) < 60 && Math.abs(c.x - o.x) < 160) { c.ai = null; c.vx = c.vz = 0; c.ctrl.throttle = 0; c.ctrl.park = true; }
    I.force('rune', { quick: true });
    const n = g.npc('rune');
    n.teleport(o.x, o.z, o.yaw);
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    g.player.teleport(o.x - fx * o.back, o.z - fz * o.back, o.yaw);
    g.player.state = 'normal';
    g.cam.yaw = o.yaw; g.cam.pitch = 0.22; g.cam.snapNext = true;
  }, { x: -20, z: -40, yaw: Math.PI / 2, back: 1.6, ...o });
  const rune = () => ev(() => {
    const g = __game, n = g.npc('rune'), st = __interrupt.stage;
    return { x: +n.x.toFixed(2), z: +n.z.toFixed(2), yaw: +n.yaw.toFixed(2), state: n.state, held: !!g.companions.get(n)?.push, roll: n.roll ? +n.roll.v.toFixed(2) : 0, dead: n.dead?.cause || null, topple: +n.topple.toFixed(2), cold: st?.cold != null ? +st.cold.toFixed(4) : null, phase: st?.phase, text: st ? st.sub || st.text : null, active: !!__interrupt.active, runeDead: g.runeDead, visible: n.root.visible, saved: JSON.parse(localStorage.getItem('saab-and-run-v1') || '{}').rune, news: g.rune.news ? { ...g.rune.news } : null };
  });
  const prompt = () => ev(() => document.getElementById('prompt')?.textContent || '');
  const banner = () => ev(() => ({ main: document.querySelector('#banner .banner-main')?.textContent, sub: document.querySelector('#banner .banner-sub')?.textContent, kicker: document.querySelector('#banner .banner-kicker')?.textContent, show: document.getElementById('banner').classList.contains('show') }));
  const toasts = () => ev(() => document.getElementById('toasts')?.textContent || '');
  const bubbles = () => ev(() => [...document.querySelectorAll('#bubbles .bubble')].map((b) => b.textContent));
  // (tests only: the game never brings him back) alive, at (x, z), no errand
  // (busy: not taken home meanwhile)
  const revive = (x, z, yaw = Math.PI / 2) => ev(({ x, z, yaw }) => { const g = __game, n = g.npc('rune'); g.rune.revive(n); n.teleport(x, z, yaw); n.busy = true; n.walkTo = null; }, { x, z, yaw });
  const settle = async (ms = 9000) => { const t0 = Date.now(); let r; do { await frames(6); r = await rune(); } while (r.roll > 0 && Date.now() - t0 < ms); return r; };
  const grab = async () => { await tap('KeyE'); await frames(3); return (await rune()).held; };

  // The camera held still (look-dev): from `from` at `to` ([x, y, z]), fov.
  const still = (from, to, fov = 40) => ev(async ({ from, to, fov }) => {
    const { camera } = await import('./src/gfx.js');
    const g = __game;
    g.cam.update = function () {};
    camera.position.set(...from); camera.lookAt(...to); camera.fov = fov; camera.updateProjectionMatrix();
  }, { from, to, fov });
  // A shot of `who` from `d` m in front of them, `side` rad round to their left, at height `h`.
  const portrait = async (who, d = 2.2, side = 0.5, h = 1.1, lookH = 0.9, fov = 40) => {
    const p = await ev(({ who, d, side }) => { const n = __game.npc(who), a = n.yaw + side; return { x: n.x + Math.sin(a) * d, z: n.z + Math.cos(a) * d, nx: n.x, nz: n.z, y: n.y }; }, { who, d, side });
    await still([p.x, p.y + h, p.z], [p.nx, p.y + lookH, p.nz], fov);
  };

  return {
    // Close-ups (no checks): Rune dead of cold in his chair, tipped over by a car, Anita grieving.
    async runelook() {
      await setup({ x: -20, z: -32, back: 5 });
      await frames(10);
      await ev(() => { const g = __game; g.rune.kill(g.npc('rune'), 'cold'); g.player.teleport(-20, -26, 0); });
      await frames(90);
      await ev(() => { document.getElementById('hud').style.visibility = 'hidden'; });
      await portrait('rune', 2.3, 0.5, 1.25, 0.95, 30);
      await frames(6);
      await shot('rune_look_cold');
      await portrait('rune', 2.4, 2.2, 1.2, 0.7);
      await frames(6);
      await shot('rune_look_cold_side');
      await ev(() => { const g = __game, n = g.npc('rune'); n.dead.side = 1; n.dead.t = 0; });
      await frames(60);
      await portrait('rune', 3.0, 0.9, 1.3, 0.3, 45);
      await frames(6);
      await shot('rune_look_tipped');
      await ev(() => { const g = __game, an = g.npc('anita'); g.player.teleport(an.x + Math.sin(an.yaw) * 5, an.z + Math.cos(an.yaw) * 5, an.yaw + Math.PI); });
      await frames(90);
      await portrait('anita', 1.9, 0.35, 1.5, 1.35);
      await frames(6);
      await shot('rune_look_grief');
      await portrait('anita', 2.1, 1.1, 1.5, 1.4, 30);
      await frames(6);
      await shot('rune_look_grief_side');
      await ev(() => { localStorage.removeItem('saab-and-run-v1'); });
    },

    async runeroll() {
      await setup();
      await frames(20);
      const p0 = await prompt();
      check(/Ta tag i rullstolen/.test(p0), 'near him: "E Ta tag i rullstolen"', p0);
      check(await grab(), 'E takes hold of the wheelchair');
      check(/Släpp rullstolen/.test(await prompt()), 'held: "E Släpp rullstolen"', await prompt());
      // Striding (Shift + W) for a second and a half, and E in the stride.
      await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
      await sleep(1500);
      const a = await rune();
      await tap('KeyE');
      await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
      await frames(10);
      const b = await rune();
      check(!b.held && b.roll > 2.5, 'let go in the stride: rolling on', b);
      await shot('rune_roll_1');
      const c = await settle();
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      check(d > 8 && d < 26, `rolled on ${d.toFixed(1)} m and stopped`, c);
      check(/Ta tag i Runes rullstol igen|rullar/.test(c.text), 'the objective: take hold again', c.text);
      await shot('rune_roll_2');
      // Walking (W only), then E: hardly rolls at all.
      await ev(() => { const g = __game, n = g.npc('rune'); g.player.teleport(n.x - Math.sin(n.yaw) * 1.6, n.z - Math.cos(n.yaw) * 1.6, n.yaw); g.cam.yaw = n.yaw; g.cam.snapNext = true; });
      await frames(6);
      check(await grab(), 'E takes hold again');
      await page.keyboard.down('KeyW'); await sleep(1200);
      const e = await rune();
      await tap('KeyE'); await page.keyboard.up('KeyW');
      const f = await settle();
      const d2 = Math.hypot(f.x - e.x, f.z - e.z);
      check(d2 < 1.6, `let go walking: ${d2.toFixed(2)} m on`, f);
      // Pushed home with E held: the errand is done.
      await ev(() => { const g = __game, n = g.npc('rune'); g.player.teleport(n.x - Math.sin(n.yaw) * 1.6, n.z - Math.cos(n.yaw) * 1.6, n.yaw); });
      await frames(4);
      check(await grab(), 'E takes hold again (to go home)');
      await ev(() => { const g = __game, t = window.__lm('runeHouse'); g.player.teleport(t.x + 1.2, t.z + 1.2, Math.atan2(-1.2, -1.2)); g.cam.snapNext = true; });
      await hold(['KeyW'], 500);
      await frames(20);
      const r = await ev(() => ({ done: __interrupt.done, active: !!__interrupt.active }));
      check(r.done >= 1 && !r.active, 'pushed home: done', r);
    },

    async runekick() {
      await setup({ back: 0.9 });
      await frames(20);
      const panel = await ev(() => { const e = document.getElementById('errand'); return { cls: e.className, timer: e.querySelector('.er-timer').textContent, label: e.querySelector('.er-label').textContent }; });
      check(/cold/.test(panel.cls) && /36,\d°/.test(panel.timer), 'the panel: his cold, not a timer', panel);
      const a = await rune();
      check(Math.abs(a.yaw - Math.PI / 2) < 0.05, 'on his errand he does not turn to face Ove', a);
      await tap('KeyJ');
      await frames(30);
      const b = await rune();
      check(b.roll > 1, 'kicked from behind: rolling', b);
      await shot('rune_kick_1');
      const c = await settle();
      const fwd = (c.x - a.x) * Math.sin(a.yaw) + (c.z - a.z) * Math.cos(a.yaw);
      check(fwd > 4, `rolled ${fwd.toFixed(1)} m forwards`, c);
      // From in front: backwards (away from the boot).
      await ev(() => { const g = __game, n = g.npc('rune'); g.player.teleport(n.x + Math.sin(n.yaw) * 0.9, n.z + Math.cos(n.yaw) * 0.9, n.yaw + Math.PI); });
      await frames(6);
      const d = await rune();
      await tap('KeyJ');
      const e = await settle();
      const back = (e.x - d.x) * Math.sin(d.yaw) + (e.z - d.z) * Math.cos(d.yaw);
      check(back < -3, `kicked from in front: ${back.toFixed(1)} m backwards`, e);
      // Kicked out of the errand too (at home): he rolls, and is never hurt.
      await ev(() => __interrupt.abort());
      await frames(5);
    },

    async runecar() {
      await setup({ back: 6 });
      await frames(20);
      const failed0 = await ev(() => __interrupt.failed);
      // A car (nobody's) at 13 m/s, straight at him from the west.
      await ev(async () => {
        const { Car } = await import('./src/actors/car.js');
        const g = __game, n = g.npc('rune');
        const c = new Car('volvo240', { color: 0x6a7d8c });
        c.place(n.x - 30, n.z, Math.PI / 2);
        g.addCar(c); window.__rc = c;
        g.player.teleport(n.x + 3, n.z + 6, Math.PI); g.cam.yaw = -Math.PI / 2 - 0.4; g.cam.pitch = 0.2; g.cam.snapNext = true;
        window.__rcGo = true;
        const push = () => { if (window.__rcGo && !c.dead) { const v = 13; if (c.speed < v) { c.vx = v; c.vz = 0; c.wake?.(); } requestAnimationFrame(push); } };
        push();
      });
      try { await until(() => !!__game.npc('rune').dead, 8000); } catch (e) { /* checked below */ }
      await ev(() => { window.__rcGo = false; });
      await frames(40);
      const a = await rune();
      check(a.dead === 'car' && a.runeDead, 'a car at speed: Rune is dead', a);
      check(Math.abs(a.topple) > 1.2, 'his chair tipped onto its side', a);
      await shot('rune_car_dead');
      const ban = await banner();
      check(ban.show && /RUNE ÄR DÖD/i.test(ban.main) && /påkörd/.test(ban.sub) && ban.kicker === 'Avbrott', 'the banner: RUNE ÄR DÖD, påkörd', ban);
      // For good: no E / Q, the errand over at once (one failed), saved dead the moment he died.
      check(!a.active && a.saved === 0 && (await ev(() => __interrupt.failed)) === failed0 + 1, 'the errand is over, failed; saved dead', a);
      await sleep(1000);
      const pr = await prompt();
      check(!/Försök igen|Ge upp/.test(pr), 'no "E Försök igen · Q Ge upp"', pr);
      check(!(await ev(() => __game.failWait)), 'Ove is not held');
      // Anita, already: her hand over her eyes, a sob as Ove stands by her; she wasn't there, so she
      // phones (once nobody talks).
      check(a.news && !a.news.seen, 'Anita did not see it (far from home)', a.news);
      await ev(() => { const g = __game, an = g.npc('anita'); g.rune.sobT = 0; const yaw = an.yaw + Math.PI; g.player.teleport(an.x + Math.sin(an.yaw) * 4, an.z + Math.cos(an.yaw) * 4, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.12; g.cam.snapNext = true; });
      await sleep(3500);
      const an = await ev(() => { const a = __game.npc('anita'); return { grief: a.anim.grief, w: +a.model.w.grief.toFixed(2) }; });
      check(an.grief && an.w > 0.5, 'Anita grieves already', an);
      await shot('rune_car_anita');
      try { await until(() => !__game.rune.news, 12000); } catch (e) { /* checked below */ }
      await frames(10);
      const t = await toasts();
      check(/Anita är ensam nu/.test(t) && /De har hittat Rune/.test(t), 'the news, and Anita phones', t);
      const ab = await ev(async () => { const { TEMPLATES } = await import('./src/game/interruptions.js'); return __interrupt.available(TEMPLATES.find((t) => t.id === 'rune')); });
      check(!ab, 'his errand is never offered again');
      await ev(() => { const c = window.__rc; if (c) __game.removeCar(c); window.__rc = null; });
      // (revived by hand: tests only) Ove's own Saab at him, real keys (W, straight on).
      await revive(-20, -40);
      await ev(() => {
        const g = __game, s = g.named.saab;
        g.player.teleport(s.x + 2, s.z, 0); g.enterCar(s);
        s.place(-20 - 32, -40, Math.PI / 2); g.cam.yaw = Math.PI / 2; g.cam.snapNext = true;
      });
      await frames(10);
      await page.keyboard.down('KeyW');
      try { await until(() => !!__game.npc('rune').dead, 9000); } catch (e) { /* checked below */ }
      await page.keyboard.up('KeyW');
      await hold(['KeyS'], 900);
      await frames(30);
      const c = await rune();
      const b2 = await banner();
      check(c.dead === 'ove' && /Ove körde över Rune/.test(b2.sub) && b2.kicker === '', 'his own Saab, no errand: "Ove körde över Rune."', { c, b2 });
      await shot('rune_car_saab');
      // The thresholds, by hand: anybody's car closing at 1.5 m/s kills him; Ove's at 1.2 m/s shoves
      // him aside, at 2.2 m/s kills him; a chair rolled into the flank of a car going by at 4 m/s.
      const slow = async (o) => {
        await revive(-20, -40, o.yaw ?? Math.PI / 2);
        await ev(async (o) => {
          const { Car } = await import('./src/actors/car.js');
          const g = __game, n = g.npc('rune');
          if (g.playerCar) g.exitCar(true);
          g.player.teleport(n.x, n.z + 8, Math.PI);
          const c = o.ove ? g.named.saab : new Car('volvo240', { color: 0x8a5a3c });
          c.place(o.x, o.z, o.cyaw);
          if (!o.ove) g.addCar(c);
          window.__sc = c; window.__scGo = true;
          if (o.ove) g.enterCar(c);
          if (o.roll) g.rune.roll(n, o.roll);
          const push = () => { if (window.__scGo) { c.vx = Math.sin(o.cyaw) * o.v; c.vz = Math.cos(o.cyaw) * o.v; c.wake?.(); requestAnimationFrame(push); } };
          push();
        }, o);
        await sleep(o.ms ?? 4000);
        const r = await rune();
        await ev((o) => { window.__scGo = false; const g = __game; if (g.playerCar) g.exitCar(true); if (!o.ove && window.__sc) g.removeCar(window.__sc); window.__sc = null; }, o);
        await frames(5);
        return r;
      };
      const s1 = await slow({ x: -20 - 8, z: -40, cyaw: Math.PI / 2, v: 1.5 });
      check(s1.dead === 'car', "anybody's car at 1.5 m/s kills him", s1);
      const s2 = await slow({ x: -20 - 8, z: -40, cyaw: Math.PI / 2, v: 1.2, ove: true });
      check(!s2.dead, "Ove's at 1.2 m/s only shoves him", s2);
      const s3 = await slow({ x: -20 - 8, z: -40, cyaw: Math.PI / 2, v: 2.2, ove: true });
      check(s3.dead === 'ove', "Ove's at 2.2 m/s kills him", s3);
      // (a car going by 2.4 m south of him, westwards (+x) at 4 m/s, alongside him as he rolls south
      // into its flank)
      const s4 = await slow({ x: -21, z: -42.4, cyaw: Math.PI / 2, v: 4, yaw: Math.PI, roll: 2.5, ms: 3500 });
      check(s4.dead === 'car', "rolled into a passing car's flank: dead", s4);
      await revive(-20, -40);
      await ev(() => { __game.rune.news = null; __game.npc('rune').busy = false; localStorage.removeItem('saab-and-run-v1'); });
      await frames(5);
    },

    // Kicked into the street (no errand), and the traffic's own AI drives on.
    async runetraffic() {
      await frames(20);
      const o = await ev(async () => {
        const { laneAim } = await import('./src/actors/drivers.js');
        const { isRoad } = await import('./src/world/layout.js');
        const g = __game, n = g.npc('rune');
        // Solrosvägen (z = -40), the lane going +x; the pavement beside it.
        const L = laneAim(-20, -40, 1, 0, 0);
        const side = Math.sign(L.z + 40) || 1;
        let pz = L.z;
        while (isRoad(-20, pz) && Math.abs(pz - L.z) < 12) pz += side * 0.25;
        // (2 m up on the pavement: a kick rolls him ~6 m, to about the lane's middle)
        pz += side * 2.0;
        // (the street to themselves: no other traffic along it)
        for (const c of g.cars.slice()) if (c.ai && Math.abs(c.z + 40) < 30 && Math.abs(c.x + 20) < 200) { if (c.traffic && !c.name) g.removeCar(c); else { c.ai = null; c.vx = c.vz = 0; c.ctrl.throttle = 0; c.ctrl.park = true; } }
        // facing the street, Ove behind him
        const yaw = Math.atan2(0, L.z - pz);
        n.teleport(-20, pz, yaw);
        n.homeX = undefined;
        g.player.teleport(-20 - Math.sin(yaw) * 0.9, pz - Math.cos(yaw) * 0.9, yaw);
        g.cam.yaw = yaw; g.cam.pitch = 0.2; g.cam.snapNext = true;
        return { laneZ: L.z, pz, yaw };
      });
      console.log('[t] runetraffic', JSON.stringify(o));
      await frames(10);
      await shot('rune_traffic_0');
      // J: off the pavement into the street.
      await tap('KeyJ');
      const r0 = await settle();
      const off = Math.abs(r0.z - o.laneZ);
      check(!r0.dead && off < 1.8, `kicked into the street: ${off.toFixed(2)} m from the lane's middle`, r0);
      // A traffic car with its own AI, 70 m behind him in that lane, coming along it.
      await ev(async ({ laneZ }) => {
        const { Car } = await import('./src/actors/car.js');
        const { AIDriver } = await import('./src/actors/drivers.js');
        const g = __game, n = g.npc('rune');
        const c = new Car('volvo240', { color: 0x4a6a3c });
        c.place(n.x - 70, laneZ, Math.PI / 2);
        c.traffic = true;
        g.addCar(c);
        c.ai = new AIDriver(c, { mode: 'traffic', cruise: 12 });
        window.__tc = c; window.__tcLog = [];
        const p = g.player;
        p.teleport(n.x + 7, n.z + (n.z > laneZ ? 6 : -6), -Math.PI / 2); g.cam.yaw = -Math.PI / 2 - 0.5 * Math.sign(n.z - laneZ || 1); g.cam.pitch = 0.18; g.cam.snapNext = true;
        const log = () => { if (!window.__tc) return; const seen = g.obstacleAhead(c, 60); window.__tcLog.push({ d: +(n.x - c.x).toFixed(1), v: +c.speed.toFixed(2), seen: seen ? +seen.dist.toFixed(1) : null, dead: !!n.dead }); if (!n.dead) requestAnimationFrame(log); };
        log();
      }, o);
      try { await until(() => !!__game.npc('rune').dead, 20000); } catch (e) { /* checked below */ }
      await frames(2);
      await shot('rune_traffic_hit');
      const lg = await ev(() => window.__tcLog);
      const far = lg.find((e) => e.d <= 30) || {}, hitE = lg[lg.length - 1] || {};
      console.log('[t] runetraffic: 30 m before', JSON.stringify(far), 'at the hit', JSON.stringify(hitE), 'seen', lg.filter((e) => e.seen != null).length, '/', lg.length);
      const r = await rune();
      check(r.dead === 'car', 'the traffic ran him over', r);
      check(lg.every((e) => e.seen == null || e.dead), 'the car never saw him (obstacleAhead)', lg.filter((e) => e.seen != null).slice(0, 3));
      check(far.v > 6 && hitE.v > far.v * 0.8, `it did not brake: ${far.v} m/s 30 m before, ${hitE.v} at him`);
      await frames(30);
      await shot('rune_traffic_after');
      // His body it sees, and a passer-by (Anita, put where he lies) too.
      const seen = await ev(() => {
        const g = __game, c = window.__tc, n = g.npc('rune'), an = g.npc('anita');
        c.ai = null; c.place(n.x - 25, n.z, Math.PI / 2); c.vx = c.vz = 0;
        const body = !!g.obstacleAhead(c, 40);
        const ax = an.x, az = an.z, ay = an.yaw;
        n.state = 'hidden';
        an.teleport(n.x, n.z, 0);
        const ped = !!g.obstacleAhead(c, 40);
        an.teleport(ax, az, ay);
        n.state = 'frozen';
        g.removeCar(c); window.__tc = null;
        return { body, ped };
      });
      check(seen.body && seen.ped, 'his body, and anybody else in his place, it does see', seen);
      await ev(() => { localStorage.removeItem('saab-and-run-v1'); });
    },

    // Day 1's example: Ove backs a car with a trailer into him, at home (no errand), at walking pace.
    async runehome() {
      await frames(20);
      const o = await ev(async () => {
        const { Car } = await import('./src/actors/car.js');
        const g = __game, n = g.npc('rune');
        // On the walkway in front of his door (it runs along x), 10 m on, facing away from him: the
        // trailer towards him, its middle 0.4 m out from his. (No drift in its coupling: backed
        // straight, it stays straight - a jackknifed one only nudges him with the car's bumper.)
        const yaw = Math.PI / 2;
        const c = new Car('volvo240', { color: 0x7a2a22, trailer: true });
        g.addCar(c);
        c.place(n.x + 10, n.z - 0.4, yaw);
        const t = c.trailer;
        if (t) t.drift = 0;
        g.player.teleport(c.x + 2, c.z, 0); g.enterCar(c);
        g.cam.yaw = yaw + Math.PI; g.cam.pitch = 0.25; g.cam.snapNext = true;
        window.__hc = c;
        return { rune: [n.x, n.z, n.yaw], car: [c.x, c.z], trailer: t ? [+t.x.toFixed(2), +t.z.toFixed(2)] : null };
      });
      console.log('[t] runehome', JSON.stringify(o));
      check(!!o.trailer, 'the car has a trailer', o);
      await frames(10);
      await shot('rune_home_0');
      await ev(() => { window.__hv = 0; const c = window.__hc, n = __game.npc('rune'); const f = () => { if (!n.dead && window.__hc) { window.__hv = Math.max(window.__hv, c.speed); requestAnimationFrame(f); } }; f(); });
      await page.keyboard.down('KeyS');
      try { await until(() => !!__game.npc('rune').dead, 12000); } catch (e) { /* checked below */ }
      await page.keyboard.up('KeyS');
      await frames(5);
      await shot('rune_home_hit');
      const r = await rune();
      const v = await ev(() => window.__hv);
      const b = await banner();
      check(r.dead === 'oveBack' && v < 2.4, `backed into at ${v.toFixed(2)} m/s: dead`, r);
      check(/RUNE ÄR DÖD/.test(b.main) && /Ove backade över Rune/.test(b.sub) && b.kicker === '', 'the banner: "Ove backade över Rune."', b);
      check(r.saved === 0 && !r.active, 'saved dead at once, no errand', r);
      check(r.news?.seen, 'Anita was there to see it', r.news);
      let cry = null;
      for (let k = 0; k < 30 && !cry; k++) { await sleep(200); cry = (await bubbles()).find((t) => /^Rune\.\.\./.test(t)) || null; }
      check(!!cry, 'Anita cries out', cry);
      await ev(() => { const g = __game, an = g.npc('anita'); g.exitCar(true); const yaw = an.yaw + Math.PI; g.player.teleport(an.x + Math.sin(an.yaw) * 3.4 + 1.5, an.z + Math.cos(an.yaw) * 3.4, yaw); g.cam.yaw = yaw - 0.4; g.cam.pitch = 0.15; g.cam.snapNext = true; });
      await frames(20);
      await shot('rune_home_anita');
      await sleep(6000);
      const t = await toasts();
      check(/Anita är ensam nu/.test(t) && !/De har hittat Rune/.test(t), 'the news, and no call (she saw it)', t);
      // Saved: a reload (not fresh) keeps him dead.
      await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
      await frames(30);
      const rl = await ev(() => { const g = __game, n = g.npc('rune'); return { runeDead: g.runeDead, state: n.state, visible: n.root.visible }; });
      check(rl.runeDead && rl.state === 'hidden' && !rl.visible, 'reloaded: still dead, nowhere', rl);
      await ev(() => { localStorage.removeItem('saab-and-run-v1'); });
      await fresh();
    },

    async runecold() {
      await setup();
      await frames(10);
      const a = await rune();
      await sleep(3000);
      const b = await rune();
      const rate = (b.cold - a.cold) / 3;
      check(rate > 1 / 300 * 0.6 && rate < 1 / 300 * 1.6, `in town ${(rate * 300).toFixed(2)} x 1/300 a second`, { a: a.cold, b: b.cold });
      // Out past the forest on the southern track (x = -120), pushed with real keys.
      check(await grab(), 'E takes hold');
      await ev(async () => {
        const { COLD } = await import('./src/world/layout.js');
        const g = __game, z = -(COLD + 12);
        g.player.teleport(-120, z, Math.PI); g.cam.yaw = Math.PI; g.cam.snapNext = true;
      });
      await hold(['KeyW'], 1500);
      const c = await rune();
      await sleep(2000);
      const d = await rune();
      const out = (d.cold - c.cold) / 2;
      check(c.held && out > rate * 5, `out there ${(out / rate).toFixed(1)} x quicker`, { c, d });
      const panel = await ev(() => { const e = document.getElementById('errand'); return { cls: e.className, label: e.querySelector('.er-label').textContent }; });
      check(/Här ute/.test(panel.label), 'the panel says so', panel);
      await shot('rune_cold_out');
      try { await until(() => !!__game.npc('rune').dead, 60000); } catch (e) { /* checked below */ }
      await frames(90);
      const e = await rune();
      check(e.dead === 'coldOut' && e.runeDead, 'dead of cold beyond the forest', e);
      const ban = await ev(() => document.querySelector('#banner .banner-sub')?.textContent);
      check(/frös ihjäl bortom skogen/.test(ban), 'the banner', ban);
      await ev(() => { const g = __game, n = g.npc('rune'); const yaw = n.yaw + Math.PI * 0.8; g.player.teleport(n.x - Math.sin(yaw) * 3, n.z - Math.cos(yaw) * 3, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.15; g.cam.snapNext = true; });
      await frames(20);
      await shot('rune_cold_dead');
      // Dead for good at once: no E / Q, the errand over, saved. The body goes once Ove is off.
      await sleep(900);
      const f = await rune();
      check(!f.active && f.runeDead && f.saved === 0 && !/Försök igen/.test(await prompt()), 'dead for good: the errand over, saved, no E / Q', f);
      await ev(() => { const g = __game, s = window.__lm('oveStart'); g.player.teleport(s.x, s.z, s.yaw); g.cam.snapNext = true; });
      await frames(20);
      const h = await rune();
      check(h.state === 'hidden' && !h.visible, 'the body is gone once Ove is off', h);
      const av = await ev(async () => { const { TEMPLATES } = await import('./src/game/interruptions.js'); return Object.fromEntries(TEMPLATES.map((t) => [t.id, __interrupt.available(t)])); });
      check(!av.rune && !av.skotta && !av.element, 'no errand that needs Rune', av);
      // Saved: a reload (not fresh) keeps him dead.
      await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1`, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
      await frames(30);
      const r = await ev(() => { const g = __game, n = g.npc('rune'); return { runeDead: g.runeDead, state: n.state, visible: n.root.visible, chat: g.chatterFor('anita') }; });
      check(r.runeDead && r.state === 'hidden' && !r.visible, 'reloaded: still dead, nowhere', r);
      check(r.chat.includes('Det är så tyst hemma nu, Ove.'), "Anita's small talk is grief", r.chat);
      // (leave no dead Rune in this browser's save for the scenarios after this one)
      await ev(() => { localStorage.removeItem('saab-and-run-v1'); });
      await fresh();
    },

    async runewidow() {
      await fresh('&runedead');
      await frames(30);
      const r = await ev(() => { const g = __game, n = g.npc('rune'); return { runeDead: g.runeDead, state: n.state, visible: n.root.visible, chat: g.chatterFor('anita') }; });
      check(r.runeDead && r.state === 'hidden' && !r.visible, 'Rune nowhere', r);
      check(r.chat.every((l) => !/Rune sov|Saab/.test(l)), 'Anita: no line about Rune alive', r.chat);
      const av = await ev(async () => { const { TEMPLATES } = await import('./src/game/interruptions.js'); return Object.fromEntries(TEMPLATES.map((t) => [t.id, __interrupt.available(t)])); });
      check(!av.rune && !av.skotta && !av.element && av.mobilen, 'no errand of his (or about him)', av);
      // At her door, from the walkway: her hand over her eyes; then she sobs as Ove stands there.
      await ev(() => { const g = __game, an = g.npc('anita'), yaw = an.yaw + Math.PI; g.rune.sobT = 1.2; g.player.teleport(an.x + Math.sin(an.yaw) * 3.2, an.z + Math.cos(an.yaw) * 3.2, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.08; g.cam.snapNext = true; });
      await sleep(1200);
      await shot('rune_widow_door');
      let sob = null;
      for (let k = 0; k < 30 && !sob; k++) { await sleep(200); sob = await ev(() => [...document.querySelectorAll('#bubbles .bubble')].map((b) => b.textContent).find(Boolean) || null); }
      check(!!sob, 'she sobs as Ove stands by', sob);
      await shot('rune_widow_sob');
      // The horn at her: a widow's line.
      const horn = await ev(async () => { const { WIDOW } = await import('./src/game/script.js'); const g = __game, an = g.npc('anita'); return WIDOW.honk.includes(g.horn.lineFor(an, { front: false }, { kind: 'saab900' })); });
      check(horn, 'the horn at her: a widow\'s line');
    },
  };
};
