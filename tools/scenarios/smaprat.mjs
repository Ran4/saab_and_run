// Small talk answered (features/implemented/smaprat.md). Run: PORT=88xx node tools/shot.mjs <name>
//   smaprat       real E presses. Days 0, 2, 4 and 6 (&mission=n): Ove beside every neighbour who is
//                 out (not the day's giver: E is the day's dialogue there), E, the bubbles read back:
//                 their line first, then one of its answers (whose tag holds that day), then the rest of
//                 the exchange in order; a silence is no bubble from Ove but a nod / a shake. Then, with
//                 the line chosen (pickChatter stubbed; the answers are script.js's): the saffransris and
//                 the insexnyckel exchanges, Rune's "..." (a nod), Vita skjortan's "Tills vidare" (a
//                 shake), Parvaneh's "Andas." (nothing); four E in a row = "Nu har vi pratat." and no E
//                 prompt (and none of their own small talk) for 20 s; 40 E on Rune before day 3 and after
//                 it (no line twice in a row; before, none of the last two); a neighbour talking by
//                 themselves with Ove 3 m off (he answers ~35 % of the time, without turning) and 5 m off
//                 (never); the exchange broken off by walking off and by getting into the Saab.
//                 Close-ups: smaprat_nod.png, smaprat_shake.png (and _still: the same camera, no gesture),
//                 smaprat_chat.png (an exchange's two bubbles).
//   smapratvoice  the same exchanges with the voices on (&voice, the real manifest): every line a clip,
//                 none cut, never two voices at once, each line of an exchange starting at least 0.4 s
//                 after the one before has been said (0.45 s in main.js tickChat).
import path from 'node:path';

export default (H) => {
  const { page, ev, shot, frames, until, errors, PORT, ROOT } = H;
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const load = async (q) => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1${process.env.QUERY || ''}${q}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
    if (q.includes('&voice')) await page.waitForFunction('window.__voice && window.__voice.manifest', { timeout: 30000, polling: 100 });
    await frames(10);
    // Every bubble said (g.say), with who and when; nobody chats by themselves unless a check wants it.
    await ev(() => {
      const g = __game, say = g.say.bind(g);
      window.__said = [];
      // (the neighbours and Ove only: a passer-by's "Oj!" is not part of anybody's small talk)
      g.say = (target, text, secs, o) => { const who = target === g.player ? 'ove' : g.npcs[target.key] === target ? target.key : null; if (who) window.__said.push({ who, text, t: +g.time.toFixed(2) }); return say(target, text, secs, o); };
      g.chatGlobalT = 1e9;
    });
  };
  // Ove on foot beside a neighbour, at a spot from which E would talk to them (nearestInteractable).
  const besides = (key, r = 1.5) => ev(({ key, r }) => {
    const g = __game, n = g.npc(key), p = g.player;
    if (g.playerCar) g.exitCar(true);
    for (const rr of [r, r - 0.3, r + 0.4, 1.0]) {
      for (let k = 0; k < 16; k++) {
        const a = n.yaw + (k * Math.PI * 2) / 16, x = n.x + Math.sin(a) * rr, z = n.z + Math.cos(a) * rr;
        if (!g.spotFree(x, z)) continue;
        p.teleport(x, z, Math.atan2(n.x - x, n.z - z));
        const it = g.nearestInteractable();
        if (it?.type === 'chat' && it.who === n) { g.cam.yaw = p.yaw + 0.5; g.cam.snapNext = true; return true; }
      }
    }
    return false;
  }, { key, r });
  // What a neighbour may say now (either list), and the answers to a line whose tags hold today.
  const options = (key, line) => ev(async ({ key, line }) => {
    const S = await import('./src/game/script.js');
    const g = __game, m = g.missions;
    const pool = S.CHATTER_REPLY[key]?.[line] || [];
    const answers = pool.filter((a) => typeof a === 'string' || !a[1] || S.whenOk(a[1], m)).map((a) => (typeof a === 'string' ? { text: a, then: [] } : { text: a[0], then: a[2] || [] }));
    return { lines: g.chatterFor(key, true).slice(), answers, spare: S.CHATTER_SPARE };
  }, { key, line });
  // E on a neighbour (Ove already beside them), and what was said until the exchange was over.
  const exchange = async (key, { stub } = {}) => {
    await ev(({ key, stub }) => {
      const g = __game, n = g.npc(key);
      window.__said.length = 0;
      n.chatCD = 0; n.chatEs = []; n.chatLock = 0; g.chatX = null;
      window.__g0 = g.player.anim.gestureAt;
      if (stub) { g.__pick ||= g.pickChatter; g.pickChatter = () => stub; } else if (g.__pick) { g.pickChatter = g.__pick; delete g.__pick; }
    }, { key, stub: stub || null });
    await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
    await until(() => window.__said.length > 0, 8000).catch(() => {});
    await until(() => !__game.chatX, 20000).catch(() => {});
    await frames(3);
    return ev(() => { const a = __game.player.anim; return { said: window.__said.slice(), gesture: a.gestureAt !== window.__g0 ? a.gesture : null }; });
  };
  // Check one exchange against script.js: their line, an answer to it, the rest in order.
  const SILENT = { rune: 'nod', vitskjorta: 'shake', anita: 'nod' };
  const check = async (label, key, r) => {
    const [first, ...rest] = r.said;
    if (!first || first.who !== key) { bad(`${label}: ${key} said nothing first (${JSON.stringify(r.said)})`); return null; }
    const o = await options(key, first.text);
    if (!o.lines.includes(first.text) && !label.includes('stub')) bad(`${label}: ${key} said "${first.text}", not one of their lines today`);
    if (!o.answers.length) { bad(`${label}: no answer for ${key} "${first.text}" today (the spare would be used)`); return null; }
    const reply = rest[0];
    let a;
    if (!reply) {
      a = o.answers.find((x) => x.text === '');
      if (!a) { bad(`${label}: Ove said nothing to ${key} "${first.text}" (expected one of ${o.answers.map((x) => x.text).join(' / ')})`); return null; }
      const g = SILENT[key] || null;
      if (r.gesture !== g) bad(`${label}: silence to ${key} "${first.text}" gave gesture ${r.gesture}, expected ${g}`);
      return { line: first.text, answer: '', gesture: r.gesture };
    }
    a = o.answers.find((x) => x.text === reply.text);
    if (reply.who !== 'ove' || !a) { bad(`${label}: after ${key} "${first.text}" came ${reply.who} "${reply.text}" (expected one of ${o.answers.map((x) => x.text || '(silence)').join(' / ')})`); return null; }
    const then = rest.slice(1).map((s) => [s.who, s.text]);
    if (JSON.stringify(then) !== JSON.stringify(a.then)) bad(`${label}: the exchange after "${reply.text}" went ${JSON.stringify(then)}, expected ${JSON.stringify(a.then)}`);
    // (without the voices: 2 s after their line, then 1.6 s a line)
    for (let k = 1; k < r.said.length; k++) {
      const gap = r.said[k].t - r.said[k - 1].t, want = k === 1 ? 2 : 1.6;
      if (!label.includes('voice') && (gap < want - 0.1 || gap > want + 0.6)) bad(`${label}: line ${k} came ${gap.toFixed(2)} s after the one before (expected ${want})`);
    }
    return { line: first.text, answer: reply.text, then: then.length };
  };
  const promptText = () => ev(() => document.getElementById('prompt')?.textContent || '');
  const gtime = () => ev(() => __game.time);
  const waitGame = async (s) => { const t0 = await gtime(); await until((t) => __game.time >= t, 120000, t0 + s); };

  return {
    async smaprat() {
      // 1. Every neighbour who is out, on days 0, 2, 4 and 6.
      for (const day of [0, 2, 4, 6]) {
        await load(`&mission=${day}`);
        const keys = await ev(() => { const g = __game, giver = g.missions.offered?.giver; return Object.keys(g.npcs).filter((k) => { const n = g.npcs[k]; return k !== giver && n.state === 'normal' && !n.car && !g.companions.has(n); }); });
        const row = [];
        for (const key of keys) {
          if (!(await besides(key))) { log(`day ${day}: no spot by ${key} that E would talk to (skipped)`); continue; }
          await frames(3);
          const r = await exchange(key);
          const c = await check(`day ${day} ${key}`, key, r);
          if (c) row.push(`${key}: "${c.line}" -> ${c.answer ? `"${c.answer}"` : `(${c.gesture || 'nothing'})`}${c.then ? ` +${c.then}` : ''}`);
        }
        log(`day ${day}:`, row.join(' | '));
      }

      // 2. The exchanges that go on, the silences (day 4: index 4, Vita skjortan out).
      await load('&mission=4');
      const S = await import(path.join(ROOT, 'src/game/script.js'));
      const saffran = Object.keys(S.CHATTER_REPLY.parvaneh).find((l) => l.includes('saffransris'));
      const insex = Object.keys(S.CHATTER_REPLY.patrick).find((l) => l.includes('insexnyckel'));
      const forced = [['parvaneh', saffran, 'Jag har mat.'], ['patrick', insex], ['rune', '...'], ['vitskjorta', 'Ha en bra dag. Tills vidare.'], ['parvaneh', 'Patrick, älskling. Andas.']];
      for (const [key, line, want] of forced) {
        if (!(await besides(key))) { bad(`no spot by ${key}`); continue; }
        let c = null;
        // (an answer picked among several: E again until it is the one with the exchange, at most 12 times)
        for (let k = 0; k < 12; k++) {
          const r = await exchange(key, { stub: line });
          c = await check(`stub ${key}`, key, r);
          if (!want || c?.answer === want) break;
        }
        log(`${key} "${line}" -> ${c ? (c.answer ? `"${c.answer}"${c.then ? ` and ${c.then} more` : ''}` : `(${c.gesture || 'nothing'})`) : 'FAILED'}`);
        if (want && c?.answer !== want) bad(`${key}: never answered "${want}" in 12 tries`);
        if (line.includes('saffransris') && c?.then !== 2) bad('the saffransris exchange did not go on for two lines');
        if (line.includes('insexnyckel') && c?.then !== 1) bad("Patrick's \"Det finns... storlekar?\" did not come");
      }
      await ev(() => { const g = __game; if (g.__pick) { g.pickChatter = g.__pick; delete g.__pick; } });

      // Close-ups: an exchange's two bubbles, the nod, the shake (and the same camera, still).
      const closeUp = () => ev(async () => {
        const { camera } = await import('./src/gfx.js');
        const g = __game, p = g.player, a = p.yaw + 0.55;
        g.cam.update = function () {};
        camera.position.set(p.x + Math.sin(a) * 2.2, p.y + 1.75, p.z + Math.cos(a) * 2.2);
        camera.lookAt(p.x, p.y + 1.55, p.z); camera.fov = 22; camera.updateProjectionMatrix();
      });
      const free = () => ev(() => { const g = __game; delete g.cam.update; g.cam.snapNext = true; });
      const gesture = async (key, line, name, at) => {
        await besides(key, 1.8);
        await frames(3);
        await ev(({ key, line }) => { const g = __game, n = g.npc(key); window.__said.length = 0; n.chatCD = 0; n.chatEs = []; n.chatLock = 0; g.chatX = null; window.__g0 = g.player.anim.gestureAt; g.__pick ||= g.pickChatter; g.pickChatter = () => line; }, { key, line });
        await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
        await until(() => window.__said.length > 0, 8000).catch(() => {});
        await closeUp();
        await frames(4);
        await shot(name + '_still');
        await until((at) => { const a = __game.player.anim; return a.gestureAt !== window.__g0 && a.t - a.gestureAt >= at; }, 10000, at).catch(() => {});
        await page.screenshot({ path: path.join(H.OUT, name + '.png') });
        console.log('saved', name);
        const r = await ev(() => { const a = __game.player.anim; return { gesture: a.gesture, u: +(a.t - a.gestureAt).toFixed(2), said: window.__said.map((s) => `${s.who}: ${s.text}`) }; });
        log(`${name}: ${r.gesture} at ${r.u} s; said ${JSON.stringify(r.said)}`);
        await free();
        await until(() => !__game.chatX, 8000).catch(() => {});
        await ev(() => { const g = __game; g.pickChatter = g.__pick; delete g.__pick; });
      };
      await gesture('rune', '...', 'smaprat_nod', 0.22);
      await gesture('vitskjorta', 'Ha en bra dag. Tills vidare.', 'smaprat_shake', 0.55);
      // (the two bubbles: the camera behind Ove, the neighbour in front)
      {
        await besides('anders', 2.2);
        await ev(() => { const g = __game, p = g.player; g.cam.yaw = p.yaw + 0.35; g.cam.pitch = 0.12; g.cam.snapNext = true; window.__said.length = 0; const n = g.npc('anders'); n.chatCD = 0; n.chatEs = []; n.chatLock = 0; });
        await frames(10);
        await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
        await until(() => window.__said.some((s) => s.who === 'ove'), 8000).catch(() => {});
        await frames(12);
        await shot('smaprat_chat');
        await until(() => !__game.chatX, 8000).catch(() => {});
      }

      // 3. Four E in a row: "Nu har vi pratat.", then 20 s without them.
      {
        const key = 'anita';
        await besides(key);
        await frames(3);
        await ev((key) => { const n = __game.npc(key); n.chatEs = []; n.chatLock = 0; }, key);
        const lines = [];
        for (let k = 0; k < 4; k++) {
          await ev((key) => { const g = __game, n = g.npc(key); window.__said.length = 0; n.chatCD = 0; window.__g0 = g.player.anim.gestureAt; }, key);
          await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
          await until(() => window.__said.length > 0, 8000).catch(() => {});
          await until(() => !__game.chatX, 20000).catch(() => {});
          await frames(3);
          lines.push(await ev(() => window.__said.map((s) => `${s.who}: ${s.text}`)));
          // (the next E once the prompt is back, as a player would)
          if (k < 3) await until(() => !!document.getElementById('prompt')?.textContent.includes('Småprata'), 8000).catch(() => {});
        }
        log('four E on Anita:', JSON.stringify(lines));
        if (JSON.stringify(lines[3]) !== JSON.stringify([`ove: ${S.CHATTER_ENOUGH}`])) bad(`the fourth E gave ${JSON.stringify(lines[3])}, not only "${S.CHATTER_ENOUGH}"`);
        for (let k = 0; k < 3; k++) if (!lines[k][0]?.startsWith(key)) bad(`E number ${k + 1} on ${key} gave ${JSON.stringify(lines[k])}`);
        // her own small talk is let loose meanwhile; neither it nor the E prompt may come for 20 s
        const t0 = await gtime();
        await ev((key) => { const g = __game; g.chatGlobalT = 0; g.npc(key).chatT = 0; window.__said.length = 0; }, key);
        const seen = [];
        for (const at of [1, 8, 14, 19.3]) {
          await until((t) => __game.time >= t, 120000, t0 + at);
          const s = await ev((key) => { const g = __game, it = g.nearestInteractable(), n = g.npc(key); return { it: it?.type === 'chat' ? it.who.key : it?.type || null, prompt: document.getElementById('prompt')?.textContent || '', d: +Math.hypot(n.x - g.player.x, n.z - g.player.z).toFixed(1) }; }, key);
          seen.push(`${at}s: ${s.it} "${s.prompt}" (${s.d} m from her)`);
          if (s.it === key || s.prompt.includes('Småprata med Anita')) bad(`${at} s after "${S.CHATTER_ENOUGH}" E would talk to ${key} again`);
        }
        const own = await ev((key) => window.__said.filter((s) => s.who === key).map((s) => s.text), key);
        if (own.length) bad(`${key} talked by herself within 20 s: ${JSON.stringify(own)}`);
        await until((t) => __game.time >= t, 120000, t0 + 21);
        await ev(() => { __game.chatGlobalT = 1e9; });
        // (Rune beside her may be nearer: stand where she is the one E would talk to)
        if (!(await besides(key))) bad(`21 s after "${S.CHATTER_ENOUGH}" no spot from which E talks to ${key}`);
        await frames(5);
        const back = await promptText();
        log('the 20 s after:', seen.join(' | '), '| at 21 s:', JSON.stringify(back));
        if (!back.includes('Småprata med Anita')) bad(`no E prompt for Anita 21 s after "${S.CHATTER_ENOUGH}": "${back}"`);
      }

      // 4. 40 E on Rune, before day 3 (four lines: none of the last two again) and after it.
      for (const day of [0, 4]) {
        if (day === 0) await load('&mission=0');
        else await load('&mission=4');
        if (!(await besides('rune'))) { bad(`day ${day}: no spot by Rune`); continue; }
        await frames(3);
        const got = [];
        for (let k = 0; k < 40; k++) {
          await ev(() => { const g = __game, n = g.npc('rune'); window.__said.length = 0; n.chatCD = 0; n.chatEs = []; n.chatLock = 0; g.chatX = null; });
          await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
          await until(() => window.__said.some((s) => s.who === 'rune'), 8000).catch(() => {});
          got.push(await ev(() => window.__said.find((s) => s.who === 'rune')?.text ?? null));
        }
        let twice = 0, within2 = 0;
        for (let k = 1; k < got.length; k++) { if (got[k] === got[k - 1]) twice++; if (k > 1 && got[k] === got[k - 2]) within2++; }
        const counts = {}; for (const l of got) counts[l] = (counts[l] || 0) + 1;
        log(`day ${day}: 40 E on Rune: ${JSON.stringify(counts)}; twice in a row ${twice}; again after one ${within2}`);
        if (got.includes(null)) bad(`day ${day}: Rune said nothing to an E`);
        if (twice) bad(`day ${day}: Rune said the same line twice in a row ${twice} times`);
        if (day === 0 && within2) bad(`day 0: Rune repeated one of his last two lines ${within2} times`);
      }

      // 5. A neighbour talking by themselves (day 4; one with only spoken answers, 8 m or more from the
      // day's giver: nobody chats near the giver): Ove 3 m off answers now and then without turning; 5 m
      // off never.
      const talker = await ev(() => { const g = __game, gv = g.npc(g.missions.offered?.giver); return ['anders', 'anita', 'jimmy', 'adrian', 'sara'].find((k) => { const n = g.npc(k); return n && n.state === 'normal' && !n.car && k !== g.missions.offered?.giver && (!gv || Math.hypot(n.x - gv.x, n.z - gv.z) > 8); }); });
      log('talking by himself:', talker);
      for (const [r, n, key] of [[3, 30, talker], [5, 12, talker]]) {
        await ev(({ key, r }) => {
          const g = __game, n = g.npc(key), p = g.player;
          for (let k = 0; k < 24; k++) { const a = (k * Math.PI * 2) / 24, x = n.x + Math.sin(a) * r, z = n.z + Math.cos(a) * r; if (g.spotFree(x, z)) { p.teleport(x, z, a + 1.2); break; } }
          g.cam.yaw = p.yaw; g.cam.snapNext = true;
        }, { key, r });
        await frames(5);
        let answered = 0, spoke = 0, wrong = [], turned = 0;
        const dists = [];
        for (let k = 0; k < n; k++) {
          const yaw0 = await ev((key) => { const g = __game, n = g.npc(key); window.__said.length = 0; g.chatX = null; g.chatGlobalT = 0; for (const k in g.npcs) g.npcs[k].chatT = 1e9; n.chatT = 0; return g.player.yaw; }, key);
          await until((key) => window.__said.some((s) => s.who === key), 8000, key).catch(() => {});
          await ev(() => { __game.chatGlobalT = 1e9; });
          await until(() => !__game.chatX, 8000).catch(() => {});
          await frames(2);
          const s = await ev((key) => { const g = __game, n = g.npc(key); return { said: window.__said.slice(), yaw: g.player.yaw, d: Math.hypot(n.x - g.player.x, n.z - g.player.z) }; }, key);
          const first = s.said.find((x) => x.who === key), reply = s.said.find((x) => x.who === 'ove');
          if (Math.abs(s.yaw - yaw0) > 0.01) turned++;
          dists.push(s.d);
          if (first) spoke++;
          if (!reply || !first) continue;
          answered++;
          const o = await options(key, first.text);
          if (!o.answers.some((a) => a.text === reply.text)) wrong.push(`"${first.text}" -> "${reply.text}"`);
          if (s.said.length > 2) wrong.push(`an exchange went on: ${JSON.stringify(s.said)}`);
        }
        log(`Ove ${r} m from ${key} talking by himself: ${spoke} lines of ${n} tries, answered ${answered}; turned ${turned}; wrong ${wrong.length}; distance ${Math.min(...dists).toFixed(1)}-${Math.max(...dists).toFixed(1)} m`);
        if (spoke < n * 0.8) bad(`${key} talked by himself only ${spoke} times of ${n}`);
        if (r < 4 && (answered < spoke * 0.12 || answered > spoke * 0.65)) bad(`at ${r} m Ove answered ${answered} of ${spoke} (35 % expected)`);
        if (r > 4 && answered) bad(`at ${r} m Ove answered ${answered} times`);
        if (turned) bad(`Ove turned ${turned} times answering a neighbour who began`);
        for (const w of wrong) bad(`self-started small talk: ${w}`);
      }

      // 6. Broken off: Ove walks off (8 m) / gets into the Saab before he has answered.
      for (const how of ['walk', 'car']) {
        await besides('anders');
        await frames(3);
        await ev(() => { const g = __game, n = g.npc('anders'); window.__said.length = 0; n.chatCD = 0; n.chatEs = []; n.chatLock = 0; g.chatX = null; });
        await page.keyboard.down('KeyE'); await frames(2); await page.keyboard.up('KeyE');
        await until(() => window.__said.length > 0, 8000).catch(() => {});
        await ev((how) => {
          const g = __game, n = g.npc('anders'), p = g.player;
          if (how === 'car') { const c = g.named.saab; c.place(p.x + 3, p.z, 0); g.enterCar(c); }
          else { const s = g.freeSpot(n.x + 8, n.z, 0, 2); p.teleport(s.x, s.z, p.yaw); }
        }, how);
        await waitGame(4);
        const s = await ev(() => ({ said: window.__said.map((s) => `${s.who}: ${s.text}`), x: !!__game.chatX }));
        log(`broken off (${how}):`, JSON.stringify(s));
        if (s.said.some((l) => l.startsWith('ove'))) bad(`Ove answered after the exchange was broken off (${how})`);
        if (s.x) bad(`the exchange still runs after ${how}`);
        await ev(() => { const g = __game; if (g.playerCar) g.exitCar(true); });
      }
    },

    async smapratvoice() {
      await load('&voice&mission=2');
      const S = await import(path.join(ROOT, 'src/game/script.js'));
      await ev(() => { window.__voice.log.length = 0; });
      const saffran = Object.keys(S.CHATTER_REPLY.parvaneh).find((l) => l.includes('saffransris'));
      const insex = Object.keys(S.CHATTER_REPLY.patrick).find((l) => l.includes('insexnyckel'));
      const runs = [['parvaneh', saffran, 'Jag har mat.'], ['patrick', insex], ['sara'], ['jimmy'], ['anders'], ['anita'], ['rune', 'Volvo.'], ['adrian']];
      const done = [];
      for (const [key, line, want] of runs) {
        const out = await ev((key) => { const g = __game, n = g.npc(key); return n && n.state === 'normal' && !n.car && g.missions.offered?.giver !== key; }, key);
        if (!out || !(await besides(key))) { log(`${key}: not out today / no spot (skipped)`); continue; }
        await frames(3);
        for (let k = 0; k < 12; k++) {
          await until(() => window.__voice.quiet(), 10000).catch(() => {});
          await ev(() => { window.__mark = window.__voice.log.length; });
          const r = await exchange(key, { stub: line });
          await until(() => window.__voice.quiet(), 10000).catch(() => {});
          const recs = await ev(() => window.__voice.log.slice(window.__mark).map((r) => ({ who: r.who, text: r.text, t0: r.t0, t1: r.t1, cut: r.cut, clip: r.clip, dropped: r.dropped })));
          const c = await check(`voice ${key}`, key, r);
          if (want && c?.answer !== want) continue;
          done.push({ key, recs });
          // each line of the exchange: a clip, said whole, after the one before had been said
          for (let i = 0; i < recs.length; i++) {
            const a = recs[i];
            if (!a.clip) bad(`voice: ${a.who} "${a.text}" has no clip`);
            if (a.dropped || a.t0 == null) bad(`voice: ${a.who} "${a.text}" was never said`);
            else if (a.cut > 0.25) bad(`voice: ${a.who} "${a.text}" cut ${a.cut.toFixed(2)} s short`);
            if (i && a.t0 != null && recs[i - 1].t1 != null && a.t0 - recs[i - 1].t1 < 0.4) bad(`voice: "${a.text}" began ${(a.t0 - recs[i - 1].t1).toFixed(2)} s after "${recs[i - 1].text}" ended`);
          }
          log(`voice ${key}: ${recs.map((a, i) => `${a.who} "${a.text}" ${a.t1 != null ? (a.t1 - a.t0).toFixed(2) : '-'} s${i ? ` (+${(a.t0 - recs[i - 1].t1).toFixed(2)})` : ''}`).join(' | ')}`);
          break;
        }
        if (want && !done.some((d) => d.key === key)) bad(`voice: ${key} never answered "${want}"`);
      }
      // never two voices at once, over the whole run
      const r = await ev(() => {
        const L = window.__voice.log.filter((r) => r.t0 != null);
        let n = 0; const pairs = [];
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const o = Math.min(L[i].t1 ?? 1e9, L[j].t1 ?? 1e9) - Math.max(L[i].t0, L[j].t0); if (o > 0.02) { n++; pairs.push(`${L[i].text} / ${L[j].text}`); } }
        return { said: L.length, overlap: n, pairs, unknown: window.__voice.unknown.slice(0, 5) };
      });
      log(`voice: ${r.said} lines said in ${done.length} exchanges; two at once ${r.overlap}`, r.pairs.slice(0, 4).join(' | '));
      if (r.overlap) bad(`voice: two voices at once ${r.overlap} times`);
      for (const u of r.unknown) bad(`voice: said but not in script.js: ${u.who} "${u.text}"`);
    },
  };
};
