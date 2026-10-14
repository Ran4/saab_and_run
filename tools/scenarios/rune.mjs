// Rune's errand made a sandbox (features/implemented/roligare_runeuppdrag.md, game/rune.js,
// stages.js escort, interruptions.js retry).
//   runeroll    real keys: E takes hold of the wheelchair, Shift+W, E lets go in the stride: he rolls
//               on (> 8 m) and stops; walking and letting go: under 1.5 m; E takes hold again
//   runekick    real keys: J kicks the chair from behind (it rolls on forwards), from in front
//               (backwards); the errand's panel shows his cold, no timer
//   runecar     a car at speed into him: dead (tipped onto his side), the banner, E / Q; Anita grieves
//               already (a sob near her, her hand over her eyes); E: alive again, the errand again;
//               then Ove's own Saab, driven at him with real keys: "Ove körde över Rune."
//   runecold    the cold: ~1/300 a second in town, much quicker out past the forest (pushed out there
//               with real keys); dead of cold (slumped), Q: given up, the body gone once Ove is off,
//               saved: a reload keeps him dead (no errand needs him, Anita's small talk is grief)
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
    return { x: +n.x.toFixed(2), z: +n.z.toFixed(2), yaw: +n.yaw.toFixed(2), state: n.state, held: !!g.companions.get(n)?.push, roll: n.roll ? +n.roll.v.toFixed(2) : 0, dead: n.dead?.cause || null, topple: +n.topple.toFixed(2), cold: st?.cold != null ? +st.cold.toFixed(4) : null, phase: st?.phase, text: st ? st.sub || st.text : null, active: !!__interrupt.active, retry: !!__interrupt.retry, runeDead: g.runeDead, visible: n.root.visible };
  });
  const prompt = () => ev(() => document.getElementById('prompt')?.textContent || '');
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
      await ev(() => { __interrupt.giveUp(); const g = __game, an = g.npc('anita'); g.player.teleport(an.x + Math.sin(an.yaw) * 5, an.z + Math.cos(an.yaw) * 5, an.yaw + Math.PI); });
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
      const ban = await ev(() => ({ main: document.querySelector('#banner .banner-main')?.textContent, sub: document.querySelector('#banner .banner-sub')?.textContent, show: document.getElementById('banner').classList.contains('show') }));
      check(ban.show && /RUNE ÄR DÖD/i.test(ban.main) && /påkörd/.test(ban.sub), 'the banner: RUNE ÄR DÖD, påkörd', ban);
      await sleep(1000);
      check(/Försök igen/.test(await prompt()) && a.retry, 'E / Q waits', await prompt());
      // Anita, already: her hand over her eyes, a sob as Ove stands by her.
      await ev(() => { const g = __game, an = g.npc('anita'); g.rune.sobT = 0; const yaw = an.yaw + Math.PI; g.player.teleport(an.x + Math.sin(an.yaw) * 4, an.z + Math.cos(an.yaw) * 4, yaw); g.cam.yaw = yaw; g.cam.pitch = 0.12; g.cam.snapNext = true; });
      await sleep(3500);
      const an = await ev(() => { const a = __game.npc('anita'); return { grief: a.anim.grief, w: +a.model.w.grief.toFixed(2), bubbles: [...document.querySelectorAll('#bubbles .bubble')].map((b) => b.textContent) }; });
      check(an.grief && an.w > 0.5, 'Anita grieves already (E / Q not yet chosen)', an);
      await shot('rune_car_anita');
      // E: alive, and lost again.
      await tap('KeyE');
      await frames(10);
      const b = await rune();
      check(!b.dead && !b.runeDead && b.active && b.state === 'normal' && b.phase === 'find' && !b.retry, 'E: tried again, Rune alive and lost again', b);
      await ev(() => { const c = window.__rc; if (c) __game.removeCar(c); window.__rc = null; });
      // Ove's own Saab at him, real keys (W, straight on).
      await ev(() => {
        const g = __game, n = g.npc('rune'), s = g.named.saab;
        n.teleport(-20, -40, Math.PI / 2);
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
      const sub = await ev(() => document.querySelector('#banner .banner-sub')?.textContent);
      check(c.dead === 'ove' && /Ove körde över Rune/.test(sub), 'his own Saab: "Ove körde över Rune."', { c, sub });
      await shot('rune_car_saab');
      await sleep(900);
      await tap('KeyE');
      await frames(10);
      check(!(await rune()).dead, 'E again: alive');
      await ev(() => __interrupt.abort());
      await frames(5);
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
      // Q: given up. He stays dead; the body goes once Ove is off.
      await sleep(900);
      await tap('KeyQ');
      await frames(10);
      const f = await rune();
      check(!f.retry && !f.active && f.runeDead, 'Q: given up, dead for good', f);
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
