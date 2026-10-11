// The voices (features/implemented/a_fully_voiced_game.md, 6.5). Run: PORT=88xx node tools/shot.mjs <name>
//   voice   a made-up manifest (out/voicetest/: tones of known length, a lip curve with closures,
//           a clip that is missing): a dialogue line waits for its clip (and autoDialog 0.4 s
//           more); a bubble never talks over a main line; radio queues behind the dialogue and its
//           toast stays up while it is said; the same speaker waits for himself; a clip that won't
//           load is mumbled (murmurs, no error); the jaw follows the clip and shuts on m/b/p; the
//           music ducks under speech; the voices off = the old murmur, no queue.
//   vcut    days 1-4 with the voices on (the real manifest) at a human pace (each line is read
//           0.5-0.8 s after it has been said), then a failed day and its retry; measures what the
//           sibling project measured: clips cut off (> 0.25 s unsaid; goal < 5 %), two voices at
//           once (> 0.3 s; goal 0), fail lines cut (goal 0), radio toasts gone before their clip
//           (goal 0), and lines said that aren't in script.js (goal 0).
//   vstory  the whole story with the voices on (FROM=n works): `story` + the vcut numbers.
//   vpool   the passers-by's pool voices (the real manifest): sex, age band, the same voice every
//           time, children murmur, drivers, windows, the neighbours' shared lines; a clip for each.
//   music   the score: the patrol's cue on day 1, an errand's loop, back to the patrol.
import fs from 'node:fs';
import path from 'node:path';

export default (H) => {
  const { page, ev, frames, sleep, until, errors, PORT, ROOT } = H;
  const log = (...a) => console.log('[t]', ...a);
  const bad = (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  const load = async (q) => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test=1&fresh=1${q}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 120000, polling: 250 });
    await page.waitForFunction('window.__voice && window.__voice.manifest', { timeout: 30000, polling: 100 });
    await frames(10);
  };

  // A mono 16-bit wav: a voice-ish tone (150 Hz + harmonics) with an envelope, `secs` long.
  const wav = (file, secs, gaps = []) => {
    const sr = 22050, n = Math.floor(sr * secs), b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      const t = i / sr, gap = gaps.some(([a, z]) => t >= a && t < z);
      const v = gap ? 0 : 0.3 * Math.min(1, t / 0.03, (secs - t) / 0.05) * (Math.sin(2 * Math.PI * 150 * t) + 0.5 * Math.sin(2 * Math.PI * 300 * t) + 0.3 * Math.sin(2 * Math.PI * 450 * t));
      b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 2);
    }
    fs.writeFileSync(file, b);
  };
  // The vcut numbers from voice.log (and the radio toasts' times).
  const measure = async (label) => {
    const r = await ev(() => {
      const L = window.__voice.log.filter((r) => r.t0 != null);
      const asked = window.__voice.log.length, dropped = window.__voice.log.filter((r) => r.dropped).length;
      const cut = L.filter((r) => r.cut > 0.25);
      let overlap = 0; const pairs = [];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], o = Math.min(a.t1 ?? 1e9, b.t1 ?? 1e9) - Math.max(a.t0, b.t0);
        if (o > 0.3) { overlap++; pairs.push(`${a.who}:${a.text.slice(0, 20)} / ${b.who}:${b.text.slice(0, 20)}`); }
      }
      const fails = L.filter((r) => r.tag === 'fail'), failCut = fails.filter((r) => r.cut > 0.25);
      const radio = L.filter((r) => r.toastEnd != null), toastGone = radio.filter((r) => r.t1 != null && r.toastEnd < r.t1 - 0.05);
      const outside = L.filter((r) => r.slot === 'bubble'), outsideCut = outside.filter((r) => r.cut > 0.25);
      return { asked, played: L.length, dropped, clips: L.filter((r) => r.clip).length, cut: cut.length, cutList: cut.slice(0, 12).map((r) => `${r.who} "${r.text.slice(0, 30)}" ${r.cut.toFixed(2)}s`), bubbles: outside.length, bubblesCut: outsideCut.length, overlap, pairs: pairs.slice(0, 6), fails: fails.length, failCut: failCut.length, radio: radio.length, toastGone: toastGone.length, unknown: window.__voice.unknown.slice(0, 10) };
    });
    const pct = r.played ? (100 * r.cut / r.played).toFixed(1) : '0';
    log(`${label}: ${r.asked} lines asked, ${r.played} said (${r.clips} clips), ${r.dropped} dropped; cut off ${r.cut} (${pct} %), bubbles cut ${r.bubblesCut} of ${r.bubbles}; two at once ${r.overlap}; fail lines cut ${r.failCut} of ${r.fails}; radio toasts gone early ${r.toastGone} of ${r.radio}; not in script.js ${r.unknown.length}`);
    if (r.cutList.length) log('cut:', r.cutList.join(' | '));
    if (r.pairs.length) log('overlaps:', r.pairs.join(' | '));
    if (r.played && r.cut / r.played >= 0.05) bad(`${label}: ${pct} % of the lines cut off (goal < 5 %)`);
    if (r.overlap) bad(`${label}: two voices at once ${r.overlap} times`);
    if (r.failCut) bad(`${label}: ${r.failCut} fail lines cut`);
    if (r.toastGone) bad(`${label}: ${r.toastGone} radio toasts gone before their line was said`);
    for (const u of r.unknown) bad(`${label}: said but not in script.js: ${u.who} "${u.text}"`);
    return r;
  };
  // A human reader: once a dialogue line has been said, E after 0.5-0.8 s (autoDialog off).
  const reader = () => ev(() => {
    const g = __game;
    g.autoDialog = false;
    let wait = null;
    g.onFrame(() => {
      const V = window.__voice, dlg = document.getElementById('dialog');
      if (!dlg?.classList.contains('show') || V.playing.main) { wait = null; return; }
      if (wait == null) wait = performance.now() + 500 + Math.random() * 300;
      if (performance.now() > wait) { wait = null; setTimeout(() => { g.input._press('Enter'); requestAnimationFrame(() => requestAnimationFrame(() => g.input._release('Enter'))); }, 0); }
    });
  });

  return {
    async voice() {
      const dir = path.join(ROOT, 'out/voicetest');
      fs.mkdirSync(dir, { recursive: true });
      wav(path.join(dir, 'a.wav'), 1.5, [[0.6, 0.75]]);
      wav(path.join(dir, 'b.wav'), 1.0);
      wav(path.join(dir, 'c.wav'), 2.0);
      // (a clip that is there but won't decode: no 404 in the console, the same fallback)
      fs.writeFileSync(path.join(dir, 'broken.mp3'), Buffer.from('not an mp3 at all'.repeat(40)));
      // The lip curve: open, shut for frames 18-22 (a "p"), open again.
      const lip = 'z'.repeat(18) + '0'.repeat(5) + 'z'.repeat(22);
      const m = {
        ove: { 'Flytta på dig.': { f: '../../out/voicetest/a.wav', d: 1.5, t: [...'Flytta på dig.'].map((_, i) => Math.round(i * 100 / 10)), lip } },
        patrick: { 'Hur svårt kan det vara att backa ett släp?': { f: '../../out/voicetest/c.wav', d: 2.0, lip: 'z'.repeat(60) }, 'Vänster... nej. Höger. Eller?': { f: '../../out/voicetest/b.wav', d: 1.0, lip: 'z'.repeat(30) } },
        parvaneh: { 'Patrick, älskling. Andas.': { f: '../../out/voicetest/broken.mp3', d: 1.2 } },
        _tempo: { ove: 12, patrick: 13, parvaneh: 13 }, _fps: 30,
      };
      fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(m));
      await load('&voice&voicemanifest=out/voicetest/index.json');
      // 1. A dialogue line waits for its clip (+0.4 s).
      const d1 = await ev(async () => { const g = __game, t0 = performance.now(); await g.dialog([['ove', 'Flytta på dig.'], ['patrick', 'Vänster... nej. Höger. Eller?']]); return (performance.now() - t0) / 1000; });
      log('dialogue of 1.5 s + 1.0 s clips took', d1.toFixed(2), 's');
      if (d1 < 2.5 + 0.6) bad(`a dialogue line didn't wait for its clip (${d1.toFixed(2)} s)`);
      // 2. A bubble during a main line waits (or is dropped); radio queues behind the dialogue.
      const d2 = await ev(async () => {
        const g = __game, V = window.__voice, n = g.npc('patrick');
        V.log.length = 0;
        const p = g.dialog([['patrick', 'Hur svårt kan det vara att backa ett släp?']]);
        await new Promise((ok) => setTimeout(ok, 300));
        g.say(n, 'Vänster... nej. Höger. Eller?', 1.5);
        g.radio('ove', 'Flytta på dig.');
        await p;
        await V.waitQuiet(0.2, 8);
        return V.log.map((r) => ({ who: r.who, slot: r.slot, t0: r.t0, t1: r.t1, dropped: r.dropped, toastEnd: r.toastEnd, cut: r.cut }));
      });
      const main = d2.find((r) => r.slot === 'main' && r.who === 'patrick');
      if (main.t1 - main.t0 < 1.9) bad(`the dialogue line was cut off after ${(main.t1 - main.t0).toFixed(2)} s of 2.0`);
      for (const r of d2.filter((r) => r !== main)) {
        if (r.t0 != null && r.t0 < main.t1 - 0.05) bad(`${r.who}'s ${r.slot} line started over the dialogue (${(main.t1 - r.t0).toFixed(2)} s)`);
        if (r.toastEnd != null && r.t1 != null && r.toastEnd < r.t1) bad('a radio toast went before its line was said');
      }
      log('bubble and radio during dialogue:', JSON.stringify(d2.map((r) => `${r.who}/${r.slot} ${r.dropped ? 'dropped' : (r.t0 - main.t0).toFixed(2) + 's'}`)));
      // 3. The same speaker waits for himself: two bubbles from Patrick in a row.
      const d3 = await ev(async () => {
        const g = __game, V = window.__voice, n = g.npc('patrick');
        V.log.length = 0;
        g.say(n, 'Hur svårt kan det vara att backa ett släp?', 2);
        await new Promise((ok) => setTimeout(ok, 400));
        g.say(n, 'Vänster... nej. Höger. Eller?', 2);
        await V.waitQuiet(0.2, 8);
        return V.log.map((r) => ({ t0: r.t0, t1: r.t1, dropped: r.dropped }));
      });
      if (d3[1] && !d3[1].dropped && d3[1].t0 < d3[0].t1 - 0.05) bad('the same speaker talked over himself');
      log('same speaker twice:', JSON.stringify(d3.map((r) => (r.dropped ? 'dropped' : `${r.t0.toFixed(2)}-${r.t1.toFixed(2)}`))));
      // 4. A clip that won't load is mumbled.
      const d4 = await ev(async () => {
        const g = __game, V = window.__voice, A = (await import('./src/audio.js')).audio;
        let talks = 0; const orig = A.talk; A.talk = (...a) => { talks++; return orig.apply(A, a); };
        V.log.length = 0;
        await g.dialog([['parvaneh', 'Patrick, älskling. Andas.']]);
        A.talk = orig;
        return { talks, failed: [...V.failed], rec: V.log[0] };
      });
      log('missing clip:', JSON.stringify(d4));
      if (!d4.failed.length || !d4.talks) bad('a clip that would not load was not mumbled');
      // 5. The jaw follows the clip and shuts on the "p" (frames 18-22 of the lip curve).
      const d5 = await ev(async () => {
        const g = __game, V = window.__voice;
        const u = V.play('ove', 'Flytta på dig.', { slot: 'bubble', mode: 'world', at: g.player, ch: g.player });
        const out = [];
        await new Promise((ok) => { const f = () => { if (u.state === 'done') return ok(); if (u.t0 != null) out.push([+(V.now() - u.t0).toFixed(3), g.player.anim.mouth, g.player.anim.talk, +g.player.model.jaw.rotation.x.toFixed(4)]); requestAnimationFrame(f); }; f(); });
        return out;
      });
      const open = d5.filter(([t, m]) => t > 0.1 && t < 0.5 && m > 0.8).length, shut = d5.filter(([t, m]) => t > 0.62 && t < 0.72 && m === 0).length;
      const jaws = d5.filter(([t]) => t > 0.1 && t < 1.3).map((x) => x[3]);
      log(`jaw: ${d5.length} samples, open ${open}, shut on the p ${shut}, jaw ${Math.min(...jaws).toFixed(3)}..${Math.max(...jaws).toFixed(3)}, talk ${d5.filter((x) => x[2]).length}`);
      if (!open || !shut) bad('the mouth did not follow the lip curve');
      if (Math.max(...jaws) - Math.min(...jaws) < 0.02) bad('the jaw did not move with the voice');
      // 6. The music ducks under speech.
      const d6 = await ev(async () => {
        const A = (await import('./src/audio.js')).audio, V = window.__voice, g = __game;
        const before = A.duckLevel;
        g.say(g.player, 'Flytta på dig.', 1.5);
        await new Promise((ok) => setTimeout(ok, 500));
        const during = A.duckLevel;
        await V.waitQuiet(0.2, 6);
        await new Promise((ok) => setTimeout(ok, 1500));
        return { before, during, after: A.duckLevel };
      });
      log('music duck', JSON.stringify(d6));
      if (!(d6.during < 0.6 && d6.after > 0.9)) bad('the music did not duck under speech');
      // 7. Voices off: play() is null and a radio line shows its toast at once (no queue).
      const d7 = await ev(async () => { const V = window.__voice; V.setEnabled(false); const u = V.play('ove', 'Flytta på dig.', {}); V.setEnabled(true); return u === null; });
      if (!d7) bad('voices off still played');
      fs.rmSync(dir, { recursive: true, force: true });
    },

    // The score: the patrol's playlist on day 1 (the cold cue), an errand's loop, a smitare's
    // chase, back; and the voices duck it.
    async music() {
      await load('');
      const cue = (want, ms = 9000) => until((w) => (window.__musicCue?.() || null) === w, ms, want).then(() => true, () => false);
      await ev(async () => { const A = (await import('./src/audio.js')).audio; window.__musicCue = () => A.musicCue; window.__musicState = () => A.musicState; });
      const s0 = await ev(() => window.__musicState());
      const r1 = await cue('patrull-kall');
      log('roam:', s0, r1 ? 'patrull-kall plays' : 'no patrol cue: ' + (await ev(() => window.__musicCue())));
      if (!r1) bad('the patrol cue did not start on day 1');
      await ev(() => __interrupt.force('element', { quick: true }));
      const r2 = await cue('vardag');
      log('errand:', r2 ? 'vardag plays' : 'no errand cue: ' + (await ev(() => window.__musicCue())));
      if (!r2) bad('the errand cue did not start');
      await ev(() => __interrupt.abort());
      const r3 = await cue('patrull-kall');
      if (!r3) bad('back to the patrol cue after the errand: ' + (await ev(() => window.__musicCue())));
      // The levels: the patrol cue, the generative piano and a voice clip, as they leave their buses.
      const lv = await ev(async () => {
        const A = (await import('./src/audio.js')).audio, V = window.__voice, g = __game;
        const sample = async (n = 6) => { const r = []; for (let k = 0; k < n; k++) { await new Promise((ok) => setTimeout(ok, 400)); r.push(A.levels()); } return r; };
        const mx = (r, k) => Math.max(...r.map((x) => x[k]));
        A.music('roam', { day: 1 });
        const cue = await sample();
        A.music('memory');
        await new Promise((ok) => setTimeout(ok, 4000));
        const piano = await sample();
        V.setEnabled(true);
        const u = V.play('ove', 'Det är förbjudet att köra bil inom området.', { slot: 'main', mode: 'dialog', now: true });
        const talk = await sample(5);
        u?.stop();
        A.music('roam', { day: 1 });
        return { cue: mx(cue, 'music'), piano: mx(piano, 'music'), voice: mx(talk, 'voice'), musicUnderVoice: mx(talk, 'music'), sfx: mx(cue, 'sfx') };
      });
      log('levels (peak of 0.7 s RMS windows, dBFS):', JSON.stringify(lv));
      const loops = await ev(async () => { const m = await (await fetch('assets/music/index.json')).json(); return Object.entries(m).filter(([, v]) => v.loop).map(([k, v]) => `${k} ${v.loop[0]}-${v.loop[1].toFixed(2)}`); });
      log('loops:', loops.join(', '));
    },

    async vcut() {
      const story = (await import('./story.mjs')).default(H);
      // (story's own reloads keep the voices on)
      process.env.QUERY = (process.env.QUERY || '') + '&voice';
      await load('&voice');
      await reader();
      process.env.TO ||= '4';
      try { await story.story(); } catch (e) { bad('vcut: story failed: ' + e.message); }
      const a = await measure('days 1-' + process.env.TO);
      // A failed day and its retry (story's retry scenario), measured on its own.
      await load('&voice');
      await reader();
      try { await story.retry(); } catch (e) { bad('vcut: retry failed: ' + e.message); }
      const b = await measure('fail + retry');
      void a; void b;
    },

    // The passers-by's pool (index.json _pool): each person gets a voice of their sex and age band
    // from their own seed (the same one every time), children murmur, a car speaks with its bust's
    // voice, a window with a mid or old one, and every line that person can say has a clip in it.
    async vpool() {
      await load('&voice');
      const r = await ev(async () => {
        const g = __game, V = window.__voice, S = await import('./src/game/script.js');
        const P = V.manifest._pool || {}, M = V.manifest, out = { bad: [], tally: {}, n: 0, kids: 0, cars: 0, windows: 0, said: 0 };
        const band = (age) => (age < 35 ? 'young' : age < 65 ? 'mid' : 'old');
        const lacks = (key, list) => list.filter((t) => !M[key]?.[t]);
        const adult = [...S.OUCH, ...S.GETUP, ...S.CARJACK, ...S.KICKED, ...S.SHOVED, ...S.PANIC, ...S.HONK_SIDEWALK, ...S.HONK_CARFREE];
        const drive = [...S.FLEE_LINES, ...S.CAUGHT_LINES, ...Object.values(S.HONK_BACK).flat(), ...S.SAAB_GREET, ...S.HONK_SMITARE];
        const person = (def, key, what) => {
          const age = def.age ?? 30;
          if (def.kind === 'kid' || age < 13) { out.kids++; if (key !== 'ped_kid') out.bad.push(`${what}: a child (${age}) got ${key}`); return; }
          const want = `${def.sex === 'f' ? 'f' : 'm'}_${band(age)}`;
          if (!P[want]?.includes(key)) out.bad.push(`${what}: ${def.sex} ${age} got ${key}, not one of ${want}`);
          out.tally[key] = (out.tally[key] || 0) + 1;
          const need = what === 'car' ? drive : [...adult, ...(age < 19 ? S.HONK_TEEN : age >= 65 ? S.HONK_OLD : [...S.HONK_SCARED, ...S.HONK_HEARD])];
          const miss = lacks(key, need);
          if (miss.length) out.bad.push(`${key} (${what}, ${age}) has no clip for ${miss.length}: ${miss.slice(0, 3).join(' | ')}`);
        };
        for (const p of g.peds) {
          const k = V.voiceFor(p.char);
          if (V.voiceFor(p.char) !== k) out.bad.push('a passer-by changed voice');
          person(p.char.def, k, 'ped'); out.n++;
        }
        for (const c of g.cars) {
          const def = c.driverBust?.userData?.def;
          if (!def || c.driver) continue;
          const k = V.voiceFor(c);
          if (def.name === 'ped') { person(def, k, 'car'); out.cars++; }
        }
        // a window: a point on a house wall (horn.js nearHouse)
        for (const w of [{ x: 10, y: 2.2, z: 40, height: 1 }, { x: -60, y: 2.2, z: 5, height: 1 }, { x: 33, y: 2.2, z: -70, height: 1 }]) {
          const k = V.voiceFor(w); out.windows++;
          if (![...(P.f_mid || []), ...(P.m_mid || []), ...(P.f_old || []), ...(P.m_old || [])].includes(k)) out.bad.push(`a window got ${k}`);
          const miss = lacks(k, S.HONK_WINDOW);
          if (miss.length) out.bad.push(`${k} (window) has no clip for ${miss.join(' | ')}`);
        }
        // the neighbours: their shared lines (SHOVED, KICKED_NEIGHBOUR; COMING for those who wait)
        for (const k of ['patrick', 'parvaneh', 'jimmy', 'adrian', 'anita', 'anders', 'vitskjorta']) {
          const miss = lacks(k, [...S.SHOVED, ...S.KICKED_NEIGHBOUR]);
          if (miss.length) out.bad.push(`${k} has no clip for ${miss.join(' | ')}`);
        }
        for (const k of ['parvaneh', 'adrian', 'jimmy']) { const miss = lacks(k, S.COMING); if (miss.length) out.bad.push(`${k} has no clip for ${miss.join(' | ')}`); }
        // said out loud: a passer-by's line is a clip (not a murmur)
        V.log.length = 0;
        const grown = g.peds.find((p) => p.char.def.kind !== 'kid' && (p.char.def.age ?? 30) >= 19 && (p.char.def.age ?? 30) < 65);
        if (grown) { g.say(grown.char, S.OUCH[1], 1.8); await V.waitQuiet(0.3, 6); out.said = V.log.filter((x) => x.clip && x.t0 != null).length; out.saidWho = V.log[0]?.who; }
        return out;
      });
      log(`pool: ${r.n} passers-by (${r.kids} children murmur), ${r.cars} traffic drivers, ${r.windows} windows; voices used: ${JSON.stringify(r.tally)}; a passer-by's OUCH said as a clip: ${r.said} (${r.saidWho})`);
      for (const b of r.bad.slice(0, 20)) bad(b);
      if (!r.said) bad('a passer-by\'s line was not said with a clip');
      if (Object.keys(r.tally).length < 6) bad(`only ${Object.keys(r.tally).length} pool voices in use`);
    },

    async vstory() {
      const story = (await import('./story.mjs')).default(H);
      process.env.QUERY = (process.env.QUERY || '') + '&voice';
      if (!process.env.FROM) await load('&voice');   // (with FROM, story reloads at that day itself)
      try { await story.story(); } catch (e) { bad('vstory: ' + e.message); }
      await measure('story');
    },
  };
};
