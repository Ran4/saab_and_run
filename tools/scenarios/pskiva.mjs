// The p-skiva and the lapplisa (features/implemented/p-skiva.md, game/pskiva.js). Run:
//   PORT=88xx node tools/shot.mjs <name>
//   pskiva       real keys: the Saab driven into a bay of the Livs car park at 12:10 (a feedback
//                controller on W/S), the prompt, G takes the disc out, Q / E turn it (one step, held
//                down: on by itself), G puts it back unchanged, F lays it in the window at 12:30;
//                out, away, a round at 14:00 (fine) and 14:45 (a ticket, the envelope under the wiper);
//                walked back with W: Ove sees it, E takes it (not the car), 300 kr paid, E puts it away,
//                E gets in. Then a ticket written wrong (the plate): the red ring, his line, the call to
//                P-Ordning AB on its own, the 300 kr back. The attendant's own round: none while Ove is
//                near, nor in his first 10 s away, then a ticket. Seated in a ticketed car some other way:
//                the ticket in his hands at once. G outside a bay and in a handicap bay: no disc.
//                Screens: pskiva_bay, pskiva_open, pskiva_1230, pskiva_ticketcar, plapp, plapp_wrong,
//                pskiva_call.
//   pskivarules  the rules, with the attendant called by hand (no keys): the disc right / early / set
//                ahead / missing, 2 h at the Livs, 3 h at the hospital, 10 min at the preschool, outside
//                8-18, overnight, an old disc from the parking before, the bays that need a permit (the
//                loading zone, a handicap bay, residents' bays elsewhere, Ove's own lot: free but its
//                handicap and reserved bays), a right disc read wrong, every error she can make, a car
//                that leaves its bay (no ticket) or is taken away.
//   pskivalook   pictures: the disc at four times and four window sizes, the ticket three ways, the
//                envelope on the windscreen of every car type (pskl_*.png), the new signs.
//   pskivavoice  the call with the voices on (&voice): every line a clip, none cut, never two at once.
export default (H) => {
  const { page, ev, shot, frames, sleep, until, errors, PORT } = H;
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const ok = (c, ...a) => { if (!c) bad(...a); return !!c; };
  const load = async (q = '') => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1${process.env.QUERY || ''}${q}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
    if (q.includes('&voice')) await page.waitForFunction('window.__voice && window.__voice.manifest', { timeout: 30000, polling: 100 });
    await frames(10);
    // (no traffic in the way, no patrol car parked in a bay we want)
    await ev(() => { const g = __game; for (const c of g.cars.slice()) if (c.traffic) g.removeCar(c); g.addCoins(1000); });
  };
  const tap = async (k, n = 2) => { await page.keyboard.down(k); await frames(n); await page.keyboard.up(k); await frames(2); };
  const promptText = () => ev(() => document.getElementById('prompt')?.textContent || '');
  const coins = () => ev(() => __game.coins);
  // A free bay of a lot (id prefix), with a rule filter: { disc: true } | { permit: 'x' } | { free: true }; k: the k-th.
  const bay = (lot, o = {}) => ev(async ({ lot, o }) => {
    const T = await import('./src/world/town.js');
    const g = __game, P = __parking;
    const list = T.parkingBays.filter((b) => b.lot.startsWith(lot) && (o.permit ? P.ruleOf(b)?.permit === o.permit : o.disc ? P.ruleOf(b)?.disc != null : o.free ? !P.ruleOf(b) : true));
    // (a car standing in it: its centre inside the bay; o.clear takes a patrol car or a parked one away)
    const inBay = (b, c) => { const dx = c.x - b.x, dz = c.z - b.z, s = Math.sin(b.yaw), k = Math.cos(b.yaw); return Math.abs(dx * k - dz * s) < b.w / 2 + 0.3 && Math.abs(dx * s + dz * k) < b.l / 2 + 0.5; };
    if (o.clear && list.length) for (const c of g.cars.slice()) if (c !== g.named.saab && !c.name && inBay(list[0], c)) __patrol.remove(c);
    const free = list.filter((b) => !g.cars.some((c) => c !== g.named.saab && inBay(b, c)));
    const b = free[(o.k || 0) % Math.max(1, free.length)];
    return b ? { x: b.x, z: b.z, yaw: b.yaw, w: b.w, l: b.l, lot: b.lot, n: b.n, rule: P.ruleOf(b), count: list.length } : null;
  }, { lot, o });
  // Ove in the Saab, the Saab standing in bay b (clock: [h, m] first).
  const parkIn = (b, o = {}) => ev(({ b, o }) => {
    const g = __game, c = g.named.saab;
    if (g.playerCar && g.playerCar !== c) g.exitCar(true);
    if (o.clock) g.setClock(...o.clock);
    if (!g.playerCar) g.enterCar(c);
    c.place(b.x + Math.sin(b.yaw) * (o.back || 0), b.z + Math.cos(b.yaw) * (o.back || 0), b.yaw + (o.flip ? Math.PI : 0));
    g.cam.yaw = c.yaw; g.cam.snapNext = true;
  }, { b, o });
  const rec = (name = 'saab') => ev((name) => {
    const r = __parking.recs.get(__game.named[name]);
    return r ? { arrive: r.arrive, rule: r.rule, lot: r.lot?.id, n: r.bay.n, discSet: r.discSet, ticket: r.ticket ? { ...r.ticket, rule: undefined } : null, mesh: !!r.mesh, meshIn: r.mesh?.parent === __game.named[name].tilt, next: r.next } : null;
  }, name);
  // Out of the Saab and far off (a round may then come), or near it.
  const outAndAway = (d = 60) => ev((d) => { const g = __game, c = g.named.saab; if (g.playerCar) g.exitCar(true); const s = g.freeSpot(c.x + d, c.z, 0, 6); g.player.teleport(s.x, s.z, 0); }, d);
  const check = (o = {}, name = 'saab') => ev(({ o, name }) => { const t = __parking.check(__game.named[name], o); return t ? { ...t, rule: undefined } : null; }, { o, name });
  const clock = (h, m) => ev(({ h, m }) => __game.setClock(h, m), { h, m });
  // Ove on foot d m from the Saab's driver door, facing it (camera behind him).
  const besideSaab = (d) => ev((d) => {
    const g = __game, c = g.named.saab;
    if (g.playerCar) g.exitCar(true);
    const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
    for (const k of [1, -1, 0.5, -0.5]) {
      const x = c.x + lx * d * k + Math.sin(c.yaw) * (k === 1 || k === -1 ? 0.3 : d * 0.8), z = c.z + lz * d * k + Math.cos(c.yaw) * (k === 1 || k === -1 ? 0.3 : d * 0.8);
      if (!g.spotFree(x, z)) continue;
      const yaw = Math.atan2(c.x - x, c.z - z);
      g.player.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.snapNext = true;
      return true;
    }
    return false;
  }, d);
  const distSaab = () => ev(() => { const g = __game, c = g.named.saab; return Math.hypot(g.player.x - c.x, g.player.z - c.z); });

  // Drive the Saab (Ove in it, placed `back` m behind the bay, nose in) into bay b with W / S.
  async function driveInto(b) {
    await parkIn(b, { back: -6.5 });
    await frames(8);
    let w = false, s = false;
    const set = async (k, on, cur) => { if (on && !cur) await page.keyboard.down(k); if (!on && cur) await page.keyboard.up(k); return on; };
    for (let i = 0; i < 400; i++) {
      const st = await ev((b) => { const c = __game.named.saab, dx = c.x - b.x, dz = c.z - b.z; return { along: dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw), v: c.forwardSpeed }; }, b);
      if (st.along > -0.35 && Math.abs(st.v) < 0.15) break;
      const want = Math.max(0, Math.min(2.6, -st.along * 0.9));
      w = await set('KeyW', st.v < want - 0.25 && st.along < -0.4, w);
      s = await set('KeyS', st.v > want + 0.35 && st.v > 0.3, s);
      await frames(2);
    }
    await set('KeyW', false, w); await set('KeyS', false, s);
    await frames(20);
    return ev((b) => { const c = __game.named.saab, dx = c.x - b.x, dz = c.z - b.z; return { along: +(dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw)).toFixed(2), across: +(dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw)).toFixed(2), v: +c.speed.toFixed(2) }; }, b);
  }

  return {
    async pskiva() {
      await load('&lapp');
      const S = await import('../../src/game/script.js');
      await ev(() => { __parking.rand = () => 0.5; });   // (no error of hers unless asked for)
      // 1. Into a bay at the Livs at 12:10, with the keys.
      const b = await bay('centrum', { disc: true, k: 3 });
      if (!ok(b, 'no free p-skiva bay at the Livs')) return;
      log('bay', JSON.stringify(b));
      await clock(12, 10);
      const end = await driveInto(b);
      log('stopped in the bay', JSON.stringify(end));
      let r = await rec();
      if (!ok(r, 'driven into a bay: no parking began', JSON.stringify(end))) { await parkIn(b, { clock: [12, 10] }); await frames(5); r = await rec(); }
      ok(r && r.rule?.disc === 120 && r.lot === 'centrum', 'the parking has the Livs rule', JSON.stringify(r));
      const arr = r?.arrive ?? 0;
      ok(arr >= 730 && arr <= 731, `arrival at 12:10 (${arr})`);
      await frames(4);
      const p0 = await promptText();
      ok(p0.includes('Ställ in p-skivan') && p0.includes('2 tim'), `the prompt in the bay: "${p0}"`);
      await shot('pskiva_bay');
      // 2. The disc: G, one step, back two, on two; held down; Esc; then 12:30 and F.
      await tap('KeyG');
      await frames(12);
      const o0 = await ev(() => ({ ov: __game.overlay, dial: __parking.open?.dial, show: document.getElementById('pskiva')?.classList.contains('show') }));
      ok(o0.ov === 'pskiva' && o0.show && o0.dial === 0, 'G opens the disc at 12:00', JSON.stringify(o0));
      await sleep(450);
      await shot('pskiva_open');
      await tap('KeyE'); await tap('KeyQ'); await tap('KeyQ'); await tap('KeyE'); await tap('KeyE');
      ok((await ev(() => __parking.open?.dial)) === 30, 'E Q Q E E: 12:30');
      // (in the disc nothing else takes the keys: still in the car, still parked)
      ok(await ev(() => __game.playerCar === __game.named.saab), 'E in the disc does not get Ove out');
      await sleep(400);
      await shot('pskiva_1230');
      await page.keyboard.down('KeyE'); await sleep(1300); await page.keyboard.up('KeyE'); await frames(3);
      const held = await ev(() => __parking.open?.dial);
      ok(held >= 30 + 30 * 4, `E held 1.3 s turns it on by itself (dial ${held})`);
      await tap('KeyG');
      await frames(10);
      const o1 = await ev(() => ({ ov: __game.overlay, p: __game.named.saab.pskiva, paused: __game.paused }));
      ok(!o1.ov && o1.p && !o1.p.on && o1.p.dial === 0 && !o1.paused, 'G puts it back unchanged', JSON.stringify(o1));
      await tap('KeyG'); await frames(6);
      ok((await ev(() => __parking.open?.dial)) === 0, 'taken out again: still at 12:00');
      await tap('KeyE');
      await tap('KeyF');
      await frames(10);
      const set = await ev(() => ({ ov: __game.overlay, set: __parking.stats.set, said: __parking.stats.said.slice(-1)[0], toast: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | ') }));
      ok(!set.ov && set.set?.disc === 750 && set.set?.correct === 750, 'F lays 12:30 in the window, which is right for 12:10', JSON.stringify(set.set));
      ok(set.said === 'Så.' && set.toast.includes('12:30'), `Ove's "Så." and the toast (${set.said} / ${set.toast})`);
      await frames(4);
      const p1 = await promptText();
      ok(p1.includes('P-skiva 12:30'), `the prompt once set: "${p1}"`);
      // 3. Out and away; the rounds by hand: 14:00 fine, 14:45 a ticket.
      await tap('KeyE');
      await frames(5);
      ok(!(await ev(() => __game.playerCar)), 'E: out of the Saab');
      ok((await rec())?.discSet, 'getting out keeps the parking and its disc');
      await outAndAway(60);
      await clock(14, 0);
      ok(!(await check({ misread: false })), 'a round at 14:00 (1 h 30 of 2 h): no ticket');
      await clock(14, 45);
      const tk = await check({ err: null });
      ok(tk?.why === 'overtime' && tk.what.includes('2 tim') && tk.disc === 750 && tk.plate === 'SAB 900', 'a round at 14:45: overtime', JSON.stringify(tk));
      r = await rec();
      ok(r?.mesh && r.meshIn, 'the envelope is under the wiper (on the car body)');
      // a close look at the windscreen
      await ev(() => { const g = __game, c = g.named.saab, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw); g.cam._upd ||= g.cam.update; g.cam.update = () => {}; const cam = g.cam.cam; cam.position.set(c.x + fx * 3.0 + lx * 1.6, c.y + 1.9, c.z + fz * 3.0 + lz * 1.6); cam.lookAt(c.x + fx * 0.8 + lx * 0.3, c.y + 1.0, c.z + fz * 0.8 + lz * 0.3); cam.fov = 40; cam.updateProjectionMatrix(); });
      await frames(8);
      await shot('pskiva_ticketcar');
      await ev(() => { const g = __game; g.cam.update = g.cam._upd; delete g.cam._upd; g.cam.cam.fov = 55; g.cam.cam.updateProjectionMatrix(); });
      // 4. Back to it on foot with W: he sees it; E takes it, not the car.
      await ev(() => {
        const g = __game, c = g.named.saab, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
        // (in the aisle behind it, 15 m along the row: walking back he passes it)
        const bx = c.x - fx * 5.6, bz = c.z - fz * 5.6;
        for (const s of [1, -1]) {
          const x = bx + lx * 15 * s, z = bz + lz * 15 * s;
          if (!g.spotFree(x, z)) continue;
          const yaw = Math.atan2(bx - x, bz - z);
          g.player.teleport(x, z, yaw); g.cam.yaw = yaw; g.cam.snapNext = true;
          return;
        }
      });
      await frames(5);
      await page.keyboard.down('KeyW');
      try { await until(() => { const g = __game, c = g.named.saab; return Math.hypot(g.player.x - c.x, g.player.z - c.z) < 9.5; }, 15000); } catch (e) { bad('never walked up to the Saab'); }
      await page.keyboard.up('KeyW');
      await frames(10);
      const seen = await ev(() => ({ said: __parking.stats.said.slice(-1)[0], toast: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | ') }));
      ok(S.PSKIVA.seen.includes(seen.said) && seen.toast.includes('lapp under torkarbladet'), 'Ove sees the ticket', JSON.stringify(seen));
      await besideSaab(1.6);
      await frames(5);
      const it = await ev(() => __game.nearestInteractable()?.type);
      const p2 = await promptText();
      ok(it === 'ticket' && p2.includes('Ta lappen'), `at the door: E takes the ticket (${it}, "${p2}")`);
      const kr0 = await coins();
      await tap('KeyE');
      await frames(5);
      ok((await ev(() => __game.overlay)) === 'lapp' && !(await ev(() => __game.playerCar)), 'E: the ticket in his hands, not in the car');
      await sleep(1100);
      ok((await coins()) === kr0 - 300, `paid at once: ${kr0} -> ${await coins()}`);
      await sleep(900);
      const paidLine = await ev(() => __parking.stats.said.slice(-1)[0]);
      ok(S.PSKIVA.paid.includes(paidLine), `his line on paying: ${paidLine}`);
      await shot('plapp');
      await tap('KeyE');
      await frames(10);
      ok(!(await ev(() => __game.overlay)) && !(await rec())?.ticket, 'E: in his pocket');
      ok((await ev(() => __game.nearestInteractable()?.type)) === 'car', 'now E gets in');
      await tap('KeyE');
      await frames(5);
      ok(await ev(() => __game.playerCar === __game.named.saab), 'E: in the Saab');
      // 5. A ticket written wrong (the plate): the ring, his line, the call, the money back.
      await outAndAway(60);
      await clock(16, 30);
      const tw = await check({ err: 'plate' });
      ok(tw?.err?.field === 'plate' && tw.plate !== 'SAB 900' && tw.err.real === 'SAB 900', 'a ticket with the plate wrong', JSON.stringify(tw?.plate));
      await besideSaab(1.6);
      await frames(4);
      const kr1 = await coins();
      await tap('KeyE');
      await sleep(2100);
      const wr = await ev(() => ({ wrong: document.getElementById('plapp').classList.contains('wrong'), said: __parking.stats.said.slice(-1)[0] }));
      ok(wr.wrong && wr.said === S.PSKIVA.wrong.plate, 'the red ring and his line', JSON.stringify(wr));
      await shot('plapp_wrong');
      await tap('KeyE');
      try { await until(() => __interrupt.call?.out, 6000); } catch (e) { bad('no call to P-Ordning AB after the wrong ticket'); }
      await sleep(4500);
      const card = await ev(() => ({ k: document.querySelector('#call .call-kicker')?.textContent, n: document.querySelector('#call .call-name')?.textContent }));
      ok(card.n === 'P-Ordning AB', 'the call card', JSON.stringify(card));
      await shot('pskiva_call');
      try { await until(() => !__interrupt.call, 90000); } catch (e) { bad('the call never ended'); }
      await frames(5);
      const after = await ev(() => ({ kr: __game.coins, st: __parking.stats }));
      ok(after.kr === kr1 && after.st.refunded === 300 && after.st.calls === 1, `paid 300 and got them back (${kr1} -> ${after.kr})`, JSON.stringify(after.st));
      // 6. Her own rounds: not while Ove is near, at once when he has gone.
      const b2 = await bay('centrum', { disc: true, k: 8 });
      await parkIn(b2, { clock: [11, 0] });
      await frames(5);
      // (the disc out of the window first: the 12:30 from before would be wrong here, "ahead")
      await ev(() => { const g = __game; g.exitCar(true); g.named.saab.pskiva = null; const r = __parking.recs.get(g.named.saab); r.next = __parking.now(); });
      await besideSaab(8);
      await sleep(1500);
      ok(!(await rec())?.ticket, 'no round while Ove stands 8 m from the car');
      await outAndAway(70);
      await sleep(4000);
      ok(!(await rec())?.ticket, 'not before he has been gone a while (PSK.awaySecs)');
      await sleep(8000);
      const own = (await rec())?.ticket;
      ok(own?.why === 'nodisc', `gone: her round writes "P-skiva saknas" (${own?.why})`);
      // 7. In the car some other way than by E (a scene seats him): he takes the ticket at once.
      await ev(() => { const g = __game, c = g.named.saab; g.enterCar(c); });
      await frames(8);
      ok((await ev(() => __game.overlay)) === 'lapp', 'seated in a ticketed car: the ticket comes into his hands');
      await sleep(1900);
      await tap('KeyE');
      await frames(6);
      // G where no disc is wanted.
      await ev(() => { const g = __game, c = g.named.saab; c.place(-30, -40 + 2.75, Math.PI / 2); });
      await frames(6);
      await tap('KeyG'); await frames(4);
      ok(!(await ev(() => __game.overlay)), 'G on the street: nothing');
      const hb = await bay('sjukhuset', { permit: 'handikapp' });
      await parkIn(hb);
      await frames(6);
      await tap('KeyG'); await frames(4);
      const p3 = await promptText();
      ok(!(await ev(() => __game.overlay)) && p3.includes('Handikapplats'), `G in a handicap bay: nothing ("${p3}")`);
      log('stats', JSON.stringify(await ev(() => __parking.stats)));
    },

    async pskivarules() {
      await load('');
      await ev(() => { __parking.rand = () => 0.5; });
      const T = (h, m) => h * 60 + m;
      // One parking: the Saab in bay b at `at`, the disc at `disc` (or none), Ove out and away.
      const park = async (b, at, disc) => {
        await ev(() => { const g = __game, c = g.named.saab; for (const r of [...__parking.recs.values()]) __parking.drop(r); c.pskiva = null; });
        await parkIn(b, { clock: at });
        await frames(4);
        if (disc != null) await ev((d) => { const g = __game, c = g.named.saab, r = __parking.recs.get(c); c.pskiva = { dial: d % 720, on: true }; r.discSet = true; }, disc);
        await outAndAway(60);
      };
      const at = async (h, m, o = {}) => { await clock(h, m); const t = await check({ err: null, misread: false, ...o }); return t ? t.why : null; };
      const lv = await bay('centrum', { disc: true, k: 5 });
      // the disc right (12:30 for 12:10): two hours to 14:30
      await park(lv, [12, 10], T(12, 30));
      ok((await at(14, 30)) === null, 'right disc: fine at 14:30 (2 h)');
      ok((await at(14, 31)) === 'overtime', 'right disc: overtime at 14:31');
      // early (12:00): out at 14:00
      await park(lv, [12, 10], T(12, 0));
      ok((await at(14, 1)) === 'overtime', 'disc at 12:00 for 12:10: overtime at 14:01');
      // ahead (13:00 for 12:10): caught at 12:20, not at 12:40 (13:00 is the next half hour then), out at 15:00
      await park(lv, [12, 10], T(13, 0));
      ok((await at(12, 20)) === 'ahead', 'disc set ahead: caught at 12:20');
      await park(lv, [12, 10], T(13, 0));
      ok((await at(12, 40)) === null, 'disc set ahead: nothing to see at 12:40');
      ok((await at(15, 1)) === 'overtime', 'disc set ahead: overtime at 15:01');
      // none
      await park(lv, [12, 10], null);
      ok((await at(12, 20)) === 'nodisc', 'no disc: P-skiva saknas');
      // outside 8-18 the time is free
      await park(lv, [18, 10], null);
      ok((await at(19, 30)) === null, 'no disc at 19:30: outside 8-18');
      // overnight: 14:00, then the next day at 10:30 (14:00-18:00 + 8:00-10:30 = 6 h 30)
      await park(lv, [13, 50], T(14, 0));
      await ev(() => __parking.dawn());
      ok((await at(10, 30)) === 'overtime', 'overnight: overtime the next morning');
      await ev(() => { __parking.day = 0; });
      // an old disc: set at the parking before (12:30), not again here at 15:10
      await park(lv, [12, 10], T(12, 30));
      const lv2 = await bay('centrum', { disc: true, k: 9 });
      await ev(() => { const g = __game, c = g.named.saab; for (const r of [...__parking.recs.values()]) __parking.drop(r); });
      await parkIn(lv2, { clock: [15, 10] });
      await frames(4);
      await outAndAway(60);
      ok((await at(15, 20)) === 'overtime', 'the disc from the parking before: overtime');
      // the hospital (3 h), the preschool (10 min), Kommunhuset (2 h)
      const hs = await bay('sjukhuset', { disc: true, k: 4 });
      await park(hs, [12, 10], T(12, 30));
      ok((await at(15, 30)) === null && (await at(15, 31)) === 'overtime', 'hospital: 3 h');
      const ps = await bay('forskolan', { disc: true, k: 2 });
      await park(ps, [12, 10], T(12, 30));
      ok((await at(12, 40)) === null && (await at(12, 41)) === 'overtime', 'preschool: 10 min (from the half hour)');
      const ks = await bay('kommunhuset', { disc: true, k: 1 });
      await park(ks, [11, 5], T(11, 30));
      ok((await at(13, 30)) === null && (await at(13, 31)) === 'overtime', 'Kommunhuset: 2 h');
      // bays that want a permit
      for (const [lot, permit] of [['centrum', 'lastzon'], ['sjukhuset', 'handikapp'], ['boende:', 'boende'], ['boende:', 'handikapp'], ['ove', 'handikapp'], ['ove', 'reserverad']]) {
        const pb = await bay(lot, { permit, clear: lot === 'ove' });
        if (!ok(pb, `a free ${permit} bay in ${lot}`)) continue;
        await park(pb, [12, 0], null);
        ok((await at(12, 15)) === permit, `${lot} ${permit} bay: a ticket`, JSON.stringify(pb));
      }
      // free: a guest bay in another area, a north bay of Ove's own lot (no bay registered there)
      const gb = await bay('boende:', { free: true });
      await ev(() => { const g = __game; for (const r of [...__parking.recs.values()]) __parking.drop(r); });
      await parkIn(gb);
      await frames(4);
      ok(gb && !(await rec()), 'a guest bay: no parking, no rule');
      await ev(() => { const g = __game, c = g.named.saab; for (const r of [...__parking.recs.values()]) __parking.drop(r); const b = window.__lm('adrianBay'); c.place(b.x - 2.7 * 3, b.z, b.yaw); });
      await frames(4);
      ok(!(await rec()), "a resident's bay in Ove's own lot: free");
      // a right disc read wrong (her misread: the first round only)
      await park(lv, [12, 10], T(12, 30));
      await clock(12, 40);
      const mr = await check({ misread: true });
      ok(mr?.why === 'overtime' && mr.err?.field === 'disc' && mr.err.misread && mr.disc < T(12, 30), 'a right disc read wrong: a wrong ticket', JSON.stringify(mr?.err));
      // every error she can make
      for (const err of ['plate', 'make', 'time', 'place', 'disc']) {
        await park(lv, [12, 10], T(12, 0));
        await clock(14, 30);
        const t = await check({ err });
        const fine = t && t.err?.field === err && (err === 'plate' ? t.plate !== 'SAB 900' : err === 'make' ? t.make === 'Volvo' && t.saab : err === 'time' ? t.t < t.arrive : err === 'place' ? t.place !== 'Centrum, Livs parkering' : t.disc < T(12, 0));
        ok(fine, `her error: ${err}`, JSON.stringify(t && { plate: t.plate, make: t.make, t: t.t, arrive: t.arrive, place: t.place, disc: t.disc, err: t.err }));
      }
      // her error rate: rand under PSK.wrong writes one, over it none
      await park(lv, [12, 10], null);
      await ev(() => { __parking.rand = () => 0.1; });
      ok((await check({ misread: false }))?.err, 'rand 0.1: an error on the ticket');
      await park(lv, [12, 10], null);
      await ev(() => { __parking.rand = () => 0.5; });
      ok(!(await check({ misread: false }))?.err, 'rand 0.5: none');
      // a car driven out of its bay: no parking any more; a car taken away: gone too
      await park(lv, [12, 10], null);
      await ev(() => { const g = __game, c = g.named.saab; c.place(c.x + Math.sin(c.yaw) * 9, c.z + Math.cos(c.yaw) * 9, c.yaw); });
      await sleep(500);
      ok(!(await rec()), 'out of the bay: the parking is over');
      const other = await ev(async () => {
        const T = await import('./src/world/town.js');
        const g = __game, P = __parking, b = T.parkingBays.find((b) => b.lot === 'centrum' && P.ruleOf(b)?.disc && !g.cars.some((c) => Math.hypot(c.x - b.x, c.z - b.z) < 3.4));
        const c = g.cars.find((c) => !c.name && !c.traffic && c.kind === 'golf' && Math.hypot(c.x - g.player.x, c.z - g.player.z) > 30);
        if (!b || !c) return null;
        g.enterCar(c); c.place(b.x, b.z, b.yaw);
        return true;
      });
      await frames(4);
      ok(other && (await ev(() => [...__parking.recs.keys()].some((c) => c.kind === 'golf'))), 'a borrowed Golf parked: a parking of its own');
      await ev(() => { const g = __game, c = g.playerCar; g.exitCar(true); g.removeCar(c); });
      await sleep(500);
      ok(!(await ev(() => [...__parking.recs.keys()].some((c) => c.kind === 'golf'))), 'the Golf taken away: its parking gone');
    },

    async pskivalook() {
      await load('&lapp');
      const freeze = () => ev(() => { const g = __game; g.cam._upd ||= g.cam.update; g.cam.update = () => {}; });
      // the disc at four times, at four window sizes
      const lv = await bay('centrum', { disc: true, k: 3 });
      await parkIn(lv, { clock: [12, 10] });
      await frames(5);
      for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 768], [720, 1100]]) {
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
        await frames(6);
        await ev(() => { if (!__game.overlay) __parking.openDisc(); });
        for (const [dial, name] of [[0, '1200'], [30, '1230'], [270, '1630'], [450, '0730']]) {
          await ev(async (d) => { __parking.open.dial = d; const { pskivaUI } = await import('./src/game/pskivaui.js'); pskivaUI.steps = d / 30; pskivaUI.setRot(false); }, dial);
          await sleep(350);
          if (w === 1280 || name === '1630') await shot(`pskl_disc_${name}_${w}x${h}`);
        }
        await ev(() => __parking.cancelDisc());
        await sleep(500);
      }
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await frames(6);
      // the ticket: right, ahead (with the note), wrong (the ring)
      for (const [name, o, clk] of [['right', { err: null }, [14, 45]], ['ahead', { err: null }, [12, 15]], ['wrong', { err: 'make' }, [14, 45]]]) {
        await ev(() => { const g = __game, c = g.named.saab; for (const r of [...__parking.recs.values()]) __parking.drop(r); c.pskiva = null; });
        await parkIn(lv, { clock: [12, 10] });
        await frames(4);
        await ev((name) => { const c = __game.named.saab, r = __parking.recs.get(c); c.pskiva = { dial: name === 'ahead' ? 90 : 30, on: true }; r.discSet = true; }, name);
        await outAndAway(60);
        await clock(...clk);
        await check(o);
        await besideSaab(1.6);
        await frames(3);
        await ev(() => __game.parking.take(__game.named.saab));
        await sleep(2300);
        await shot(`pskl_ticket_${name}`);
        await ev(() => __parking.closeTicket());
        await ev(() => { __parking.calls.length = 0; });
        await sleep(600);
      }
      // the envelope on every car type's windscreen
      await freeze();
      for (const type of ['saab900', 'volvo240', 'volvo740', 'golf', 'kombi', 'audi', 'bmw', 'skoda', 'van', 'taxi', 'tractor']) {
        const ok2 = await ev(async (type) => {
          const g = __game, { Car } = await import('./src/actors/car.js');
          for (const c of g.cars.slice()) if (c.__look) g.removeCar(c);
          const c = new Car(type, { engineOn: false, snow: false });
          c.__look = true;
          c.place(-60, -40 + 2.75, Math.PI / 2);
          g.addCar(c);
          __parking.attach({ car: c });
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
          const cam = g.cam.cam, hgt = c.model.height ?? 1.5;
          cam.position.set(c.x + fx * 3.4 + lx * 1.4, c.y + hgt + 0.7, c.z + fz * 3.4 + lz * 1.4);
          cam.lookAt(c.x + fx * 0.6 + lx * 0.35, c.y + hgt * 0.72, c.z + fz * 0.6 + lz * 0.35);
          cam.fov = 42; cam.updateProjectionMatrix();
          g.player.teleport(-50, -45, 0);
          return true;
        }, type);
        await frames(10);
        if (ok2) await shot(`pskl_env_${type}`);
      }
      // the signs: from 4.5 m in front of each, at eye height
      const lots = await ev(async () => { const T = await import('./src/world/town.js'); const seen = new Set(); return Object.values(T.parkingLots).filter((l) => l.signAt && (!l.id.startsWith('boende:') || (!seen.size && seen.add(1)))).map((l) => ({ id: l.id, at: l.signAt })); });
      for (const l of lots) {
        await ev((a) => { const [x, z, yaw] = a, fx = Math.sin(yaw), fz = Math.cos(yaw), cam = __game.cam.cam; cam.position.set(x + fx * 4.2 + fz * 1.2, 1.75, z + fz * 4.2 - fx * 1.2); cam.lookAt(x, 1.75, z); cam.fov = 45; cam.updateProjectionMatrix(); }, l.at);
        await frames(12);
        await shot(`pskl_sign_${l.id.replace(/[:,]/g, '_')}`);
      }
    },

    async pskivavoice() {
      await load('&lapp&voice');
      await ev(() => { __parking.rand = () => 0.5; __voice.log.length = 0; });
      const lv = await bay('centrum', { disc: true, k: 3 });
      await parkIn(lv, { clock: [12, 10] });
      await frames(5);
      await outAndAway(60);
      await clock(14, 45);
      await check({ err: 'time' });
      await besideSaab(1.6);
      await frames(4);
      await ev(() => __game.parking.take(__game.named.saab));
      await sleep(2600);
      await ev(() => __parking.closeTicket());
      try { await until(() => __interrupt.call?.out, 6000); } catch (e) { bad('no call'); }
      try { await until(() => !__interrupt.call, 120000); } catch (e) { bad('the call never ended'); }
      await sleep(1500);
      const L = await ev(() => __voice.log.map((l) => ({ who: l.who, text: l.text, t0: l.t0, t1: l.t1, dur: l.dur, cut: l.cut, dropped: l.dropped, clip: l.clip })));
      const S = await import('../../src/game/script.js');
      for (const [who, text] of [...S.PSKIVA.call, ['ove', S.PSKIVA.wrong.time]]) {
        const l = L.find((x) => x.who === who && x.text === text);
        // (cut: seconds of it not said; a frame's rounding is not a cut, as in smapratvoice)
        ok(l && l.clip && !(l.cut > 0.25) && !l.dropped, `voiced: ${who} "${text}"`, JSON.stringify(l));
      }
      const said = L.filter((l) => l.t0 != null && !l.dropped).sort((a, b) => a.t0 - b.t0);
      for (let k = 1; k < said.length; k++) if (said[k].t0 < said[k - 1].t1 - 0.05) bad(`two voices at once: ${said[k - 1].who} "${said[k - 1].text}" and ${said[k].who} "${said[k].text}"`);
      ok(!(await ev(() => __voice.unknown.length)), 'no line said that is not in script.js', JSON.stringify(await ev(() => __voice.unknown)));
    },
  };
};
