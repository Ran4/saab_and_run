// The story (phase 3b): the seven days of DESIGN.md section 5.
//   story   plays all seven missions with debug warps; must end with '#7 idle' and 'no errors'.
//           FROM=n starts at day n+1 (?mission=n).
//   m1      day 1 with REAL key presses for the hard part: Ove walks up to Patrick's car (W, E),
//           drives car + trailer past the box (W A D) and backs it into parvanehDrive (S A D, B to
//           look back) - no warps or velocity pokes while driving; the rest of the day as in 'story'.
//   m2..m7  one day each, with warps (a fresh game at ?mission=n-1).
//   gate    normal play (&gate): after day 1, day 2 is offered once Ove has filed two more reports.
//   aftermath  what the story leaves in the world (a game at day 7) and the flowers on the grave.
//   Every outro (story, m1..m7): each speaker must stand within 4 m of Ove with no wall between.
//   No warps where it matters (fix round 1):
//   m7chase day 7's chaser, nobody touching it: Ove's Saab parked on Solrosvägen ~100 m off, the
//           Škoda must close to < 40 m by itself within 25 s (CHASER_AWAY=1: spawned 70-140 m off,
//           facing away from Ove - it goes round the block, up to ~470 m: within 35 s).
//   m5race  day 5's race driven with keys only (W/A/S/D, a lane-following bot that brakes for the
//           corners); must win. RACE_VMAX=22 caps it at ~80 km/h (a careful driver).
//   m4cat   day 4's cat with keys: walk up (it bolts), stride after it with Shift for 6 s (it must
//           not be caught in the first 5 s), then stand still: it comes to Ove.
//   Phase 4: every intro / outro / UPPDRAG KLART shot (story, m1..m7) is checked as rendered (cineCheck:
//           both speakers' heads in the picture and unblocked, nothing within 1.5 m of the lens) and saved
//           (out/intro<d>_<k>, outro<d>_<k>, klart<d>).
//   intros  each day's intro walked up to from three sides (FROM/TO days); m6chase day 6 from the
//           garages with keys (must stop the Škoda); gate (rewritten: no new day during an errand,
//           Patrick gone at dawn on day 2, 10:30); smitintro (a smitare chase ends quietly at an intro);
//           camtight2 (the on-foot camera swings off the garage doors).
// Screenshots: out/story_*.png (key moments), out/m1_*.png, out/m5r_*.png, out/m7c_*.png, out/m4c_*.png, out/m6c_*.png.

export default ({ page, ev, shot, frames, sleep, tap, until, L, fresh, errors }) => {
  const state = () => ev(() => { const m = __game.missions; return `#${m.index} ${m.state} stage ${m.stageI ?? '-'} ${m.stage?.kind || ''} ${m.stage?.sub || m.stage?.text || ''}`; });
  const log = async (...a) => console.log('[t]', ...a);
  const stageAt = async (n, timeout = 30000) => {
    try { await until((n) => { const m = __game.missions; return (m.state === 'running' && m.stageI >= n) || m.state === 'outro' || m.state === 'idle'; }, timeout, n); }
    catch (e) { await log('stuck waiting for stage', n, await state()); throw e; }
  };
  // A failed check: logged and counted as an error (the run ends 'N errors').
  const bad = async (...a) => { console.log('[t] CHECK FAILED', ...a); errors.push('check failed: ' + a.join(' ')); };
  // The outro that is about to play: every speaker by Ove (< 4 m) with nothing between them (no
  // collider taller than 0.6 m above the lower of their two spots on the line between them).
  const outroCheck = async (day) => {
    // (UPPDRAG KLART's held shot first)
    try { await until(() => __game.missions.state === 'outro', 30000); } catch (e) { await bad(`day ${day}: no outro`); return; }
    await sleep(500);
    await cineCheck(`klart day ${day}`);
    await shot(`klart${day}`);
    try { await until(() => __game.missions.outroOn, 30000); } catch (e) { await bad(`day ${day}: no outro`); return; }
    await frames(4);
    const r = await ev(async () => {
      const { segmentBlocked, queryBlocks, contains } = await import('./src/world/collision.js');
      const g = __game, p = g.player;
      // (what is in the way, if anything: block kinds along the line)
      const yl = (n) => Math.min(g.groundAt(p.x, p.z), g.groundAt(n.x, n.z)) + 0.6;
      const what = (n) => { const out = new Set(); for (const b of queryBlocks(Math.min(p.x, n.x), Math.min(p.z, n.z), Math.max(p.x, n.x), Math.max(p.z, n.z), [])) { if (b.kind === 'prop' || b.top < yl(n)) continue; for (let k = 0; k <= 20; k++) if (contains(b, p.x + (n.x - p.x) * k / 20, p.z + (n.z - p.z) * k / 20)) { out.add(`${b.kind}@${b.top.toFixed(2)}`); break; } } return [...out].join(','); };
      return g.missions.outroCast.map((n) => ({ key: n.key, d: +Math.hypot(n.x - p.x, n.z - p.z).toFixed(2), wall: segmentBlocked(p.x, p.z, n.x, n.z, yl(n)) >= 0, shown: n.root.visible && n.state === 'normal', what: what(n), ove: [+p.x.toFixed(1), +p.z.toFixed(1)], at: [+n.x.toFixed(1), +n.z.toFixed(1)] }));
    });
    await log(`outro day ${day}`, JSON.stringify(r));
    for (const c of r) if (!(c.d < 4 && !c.wall && c.shown)) await bad(`day ${day} outro: ${c.key} d=${c.d} wall=${c.wall} shown=${c.shown}`);
    // Every shot of the outro: both speakers' heads in view, nothing at the lens (out/outro<day>_<k>.png).
    await sceneWatch('outro', day);
  };
  // A dialogue / cutscene shot as rendered (phase 4): rays from the camera through the letterboxed
  // picture find the nearest thing in the first 1.5 m (must be nothing), and a ray to each subject's
  // head (the model's head bone; a point subject's top) must reach it unblocked and land between
  // the letterbox bars. Uses the real scene meshes (alpha-blended cards and light beams skipped).
  const cineCheck = async (label) => {
    const r = await ev(async () => {
      const { THREE, scene, camera } = await import('./src/gfx.js');
      const g = __game, subs = g.cam.cineSubjects || [];
      camera.updateMatrixWorld();
      const cp = camera.position, meshes = [];
      scene.traverseVisible((o) => {
        if (!(o.isMesh) || o.isPoints || !o.geometry) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && m.transparent && (m.depthWrite === false || m.blending !== THREE.NormalBlending)) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
        if (!o.isInstancedMesh && c.distanceTo(cp) - o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > 40) return;
        meshes.push(o);
      });
      const rc = new THREE.Raycaster();
      const nameOf = (o) => { let n = o; while (n && !n.name) n = n.parent; return (n?.name || o.type).slice(0, 24); };
      let near = Infinity, nearWhat = '';
      for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
        rc.setFromCamera(new THREE.Vector2(-0.88 + i * (1.76 / 6), -0.5 + j * 0.5), camera);
        rc.near = 0.05; rc.far = 1.5;
        const h = rc.intersectObjects(meshes, false)[0];
        if (h && h.distance < near) { near = h.distance; nearWhat = nameOf(h.object); }
      }
      const inside = (o, root) => { for (let n = o; n; n = n.parent) if (n === root) return true; return false; };
      const heads = subs.map((s) => {
        const ref = s.ref, head = new THREE.Vector3();
        if (ref?.model?.head) ref.model.head.getWorldPosition(head); else head.set(s.x, s.y + s.height * 0.9, s.z);
        const v = head.clone().project(camera);
        const inFrame = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.64;
        const dir = head.clone().sub(cp), d = dir.length();
        rc.set(cp.clone(), dir.normalize()); rc.near = 0.05; rc.far = d;
        const root = ref?.root || ref?.car?.root;
        const hit = rc.intersectObjects(meshes, false).find((h) => h.distance < d - 0.3 && !(root && inside(h.object, root)));
        return { who: ref?.key || ref?.name || 'point', inFrame, blocked: hit ? `${nameOf(hit.object)}@${hit.distance.toFixed(1)}` : null, d: +d.toFixed(1) };
      });
      return { info: g.cam.cineInfo, near: near === Infinity ? 99 : +near.toFixed(2), nearWhat, heads, cam: [+cp.x.toFixed(1), +cp.y.toFixed(1), +cp.z.toFixed(1)] };
    });
    await log(`shot ${label}`, JSON.stringify(r));
    const n = (r.heads || []).length;
    // (UPPDRAG KLART at speed - the race's finish line - keeps the chase camera)
    if (!n && label.startsWith('klart')) return r;
    // the first two subjects are the speakers: both must show; extras are nice to have
    for (const [i, h] of (r.heads || []).entries()) if (i < 2 && (!h.inFrame || h.blocked)) await bad(`${label}: ${h.who}'s head ${!h.inFrame ? 'out of the picture' : 'hidden by ' + h.blocked}`);
    if (r.near < 1.5) await bad(`${label}: ${r.nearWhat} ${r.near} m from the lens`);
    if (!n) await bad(`${label}: no shot`);
    return r;
  };
  // While an intro / outro plays: every new shot is checked and saved (out/<kind><day>_<k>.png).
  const sceneWatch = async (kind, day) => {
    const flag = kind === 'intro' ? 'introOn' : 'outroOn';
    try { await until((f) => __game.missions[f], 20000, flag); } catch (e) { await bad(`day ${day}: no ${kind}`); return; }
    let last = null, k = 0;
    for (let i = 0; i < 400 && k < 8; i++) {
      const on = await ev((f) => __game.missions[f], flag);
      if (!on) break;
      const pos = await ev(() => { const c = __game.cam.cine; return c ? `${c.pos.x.toFixed(2)},${c.pos.y.toFixed(2)},${c.pos.z.toFixed(2)}` : null; });
      if (pos && pos !== last) {
        last = pos;
        await sleep(250);
        await cineCheck(`${kind} day ${day} #${k}`);
        await shot(`${kind}${day}_${k++}`);
      }
      await sleep(100);
    }
  };
  const failCheck = async () => { if (await ev(() => __game.missions.state === 'failed')) { await log('FAILED', await ev(() => document.querySelector('#banner .banner-sub')?.textContent)); throw new Error('mission failed'); } };

  // Walk up to the day's giver and press E (retrying: the giver may have been re-placed a frame ago).
  const startMission = async () => {
    await until(() => !!__game.missions.offered, 20000);
    for (let attempt = 0; attempt < 6; attempt++) {
      await ev(() => {
        const g = __game;
        if (g.playerCar) g.exitCar(true);
        g.player.state = 'normal';
        const n = g.npc(g.missions.offered.giver);
        const s = g.freeSpot(n.x, n.z, 1.0, 1.8);
        g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z));
        g.cam.yaw = g.player.yaw + 0.5; g.cam.snapNext = true;
      });
      await frames(4);
      if (attempt < 5) await tap('KeyE');
      else { await log('falling back to missions.begin()'); await ev(() => __game.missions.begin()); }
      try { await until(() => __game.missions.state !== 'idle', 3000); break; }
      catch (e) { await log('E missed, attempt', attempt, await ev(() => { const g = __game, n = g.npc(g.missions.offered.giver), it = g.nearestInteractable(); return `near=${it?.type} d=${Math.hypot(n.x - g.player.x, n.z - g.player.z).toFixed(2)}`; })); }
    }
    const day = await ev(() => __game.missions.index + 1);
    await sceneWatch('intro', day);
    await until(() => __game.missions.state === 'running', 60000);
    await log('started', await state());
  };
  const waitIdle = async (idx) => {
    try { await until((i) => __game.missions.state === 'idle' && __game.missions.index === i, 120000, idx); }
    catch (e) { await log('stuck at', await state()); throw e; }
    await log('done ->', await state(), 'kr', await ev(() => __game.coins));
  };
  const enter = (name) => ev((name) => { const g = __game; if (g.playerCar && g.playerCar.name !== name) g.exitCar(true); if (!g.playerCar) g.enterCar(g.ensureNamedCar(name)); }, name);
  // Put Ove's car at a place (facing `yaw`, default unchanged).
  const carAt = (x, z, yaw) => ev(({ x, z, yaw }) => { const g = __game, c = g.playerCar; c.place(x, z, yaw ?? c.yaw); g.cam.yaw = c.yaw; g.cam.snapNext = true; }, { x, z, yaw });
  const onFootAt = (x, z, rMin = 0, rMax = 0) => ev(({ x, z, rMin, rMax }) => {
    const g = __game;
    if (g.playerCar) g.exitCar(true);
    g.player.state = 'normal';
    const s = rMax > 0 ? g.freeSpot(x, z, rMin, rMax) : { x, z };
    g.player.teleport(s.x, s.z, Math.atan2(x - s.x, z - s.z) || g.player.yaw);
    g.cam.yaw = g.player.yaw; g.cam.snapNext = true;
  }, { x, z, rMin, rMax });
  const target = () => ev(() => __game.missions.target());
  // A goto's goal itself (its target() may be a guide point on the way: the Akut driveway).
  const gotoDest = () => ev(() => { const g = __game, d = g.missions.stage.dest(g); return { x: d.x, z: d.z }; });
  const stage = (fn) => ev(new Function('return (' + fn + ')(__game.missions.stage, __game)'));

  // A car pickup: stop beside them and they get in.
  const pickupByCar = async () => {
    if (!(await ev(() => __game.missions.stage?.kind === 'pickup'))) return;   // already aboard (they waited close by)
    const t = await target();
    await ev((t) => { const g = __game, s = g.freeSpot(t.x, t.z, 4, 6); g.playerCar.place(s.x, s.z, Math.atan2(t.x - s.x, t.z - s.z)); g.cam.yaw = g.playerCar.yaw; g.cam.snapNext = true; }, t);
    await frames(10);
  };
  // Report every violation the report stage spawned: stand by each, hold F.
  const reportAll = async () => {
    await until(() => !__interrupt.call, 20000);
    for (let k = 0; k < 8; k++) {
      const c = await ev(() => { const s = __game.missions.stage; if (!s || s.kind !== 'report') return null; const c = s.open()[0]; return c ? { x: c.x, z: c.z } : null; });
      if (!c) break;
      await ev((c) => { const g = __game; if (g.playerCar) g.exitCar(true); const s = g.freeSpot(c.x, c.z, 3, 3.6); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.yaw = g.player.yaw + 0.4; g.cam.snapNext = true; }, c);
      await frames(5);
      await page.keyboard.down('KeyF'); await sleep(1100);
      if (k === 0) await shot('story_report');
      await sleep(1100); await page.keyboard.up('KeyF');
      await frames(5);
    }
  };
  // Back a car (and its trailer) into the parkIn box like the 'stages' test does: start ahead of
  // it, facing along it, and move it backwards until its centre is `along` m ahead of the box's.
  const reverseInto = async (along) => {
    await ev(() => { const g = __game, b = g.missions.stage.b, c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); c.place(b.x + fx * (b.l / 2 + c.spec.len / 2 + 0.6), b.z + fz * (b.l / 2 + c.spec.len / 2 + 0.6), b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
    await frames(10);
    for (let k = 0; k < 220; k++) {
      if (!(await ev(() => __game.missions.stage?.kind === 'parkIn'))) break;
      await ev((along) => {
        const g = __game, b = g.missions.stage.b, c = g.playerCar, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        const r = (c.x - b.x) * fx + (c.z - b.z) * fz, d = r - along;
        const v = d > 0.05 ? -Math.min(1.6, Math.max(0.35, d * 1.2)) : 0;
        c.vx = fx * v; c.vz = fz * v; c.yaw = b.yaw; c.w = 0;
      }, along);
      await frames(2);
    }
  };
  // Into a box nose first: a warp straight into it.
  const parkWarp = async () => {
    await ev(() => { const g = __game, b = g.missions.stage.b, c = g.playerCar; c.place(b.x, b.z, b.yaw); g.cam.yaw = b.yaw; g.cam.snapNext = true; });
    await frames(5);
  };

  // ------------------------------------------------------------------------------------------
  // The seven days, played with warps.

  const D = [];
  D[1] = async (keys = false) => {
    await startMission();
    if (keys) await trailerByKeys();
    else {
      await enter('patrickCar');
      await stageAt(1);
      await sleep(600);
      await shot('story_d1_trailer');
      await reverseInto(2.0);
    }
    await stageAt(2);
    await log('parked', await state());
    await reportAll();
    await stageAt(3);
    await enter('saab');
    await stageAt(4);
    await parkWarp();
    await until(() => __game.missions.state !== 'running', 15000);
    await outroCheck(1);
    await sleep(800);
    await shot('story_d1_outro');
    await waitIdle(1);
  };
  D[2] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await log('passenger aboard', await ev(() => __game.npc('parvaneh').car === __game.playerCar));
    await sleep(3000);
    await shot('story_d2_drive');
    const h = await gotoDest();
    await carAt(h.x, h.z);
    await stageAt(4);
    await parkWarp();
    await outroCheck(2);
    await sleep(800);
    await shot('story_d2_outro');
    await waitIdle(2);
  };
  D[3] = async () => {
    await startMission();
    // The empty hook in the garage (hold E), then the key in Rune's Volvo.
    const t = await target();
    await onFootAt(t.x, t.z);
    await frames(4);
    await page.keyboard.down('KeyE'); await sleep(1900); await page.keyboard.up('KeyE');
    await stageAt(1);
    const v = await target();
    await onFootAt(v.x, v.z, 0.5, 1.0);
    await stageAt(2);
    await log('carrying', await ev(() => __game.missions.m?.data.carrying));
    await reportAll();
    await stageAt(3);
    const s = await target();
    await onFootAt(s.x, s.z);
    await frames(4);
    await page.keyboard.down('KeyE'); await sleep(1500);
    await shot('story_d3_element');
    await sleep(800); await page.keyboard.up('KeyE');
    await outroCheck(3);
    await sleep(800);
    await shot('story_d3_outro');
    await waitIdle(3);
  };
  D[4] = async () => {
    await startMission();
    const c = await ev(() => { const c = __game.missions.stage.cat; return { x: c.x, z: c.z }; });
    // A look at the cat sitting in the snow first, then catch it.
    await onFootAt(c.x, c.z, 7, 8);
    await ev(() => { __game.cam.yaw += 0.45; __game.cam.pitch = 0.12; });
    await frames(30);
    await shot('story_d4_cat');
    await ev(() => { const g = __game, c = g.missions.stage.cat; g.player.teleport(c.x + 0.4, c.z, -Math.PI / 2); g.cam.snapNext = true; });
    await stageAt(1);
    const h = await L('oveHouse');
    await onFootAt(h.x, h.z);
    await outroCheck(4);
    await sleep(800);
    await shot('story_d4_outro');
    await waitIdle(4);
  };
  D[5] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await sleep(1500);
    await shot('story_d5_start');
    await until(() => __game.missions.stage?.countdown <= 0, 15000);
    await sleep(2500);
    await shot('story_d5_race');
    for (let k = 0; k < 8; k++) {
      const r = await ev(() => { const g = __game, s = g.missions.stage; if (!s || s.kind !== 'race') return 'gone'; const c = s.cps[s.pi], n = s.cps[s.pi + 1] || c; if (c) g.playerCar.place(c.x, c.z, Math.atan2(n.x - c.x, n.z - c.z) || g.playerCar.yaw); return s.pi; });
      if (r === 'gone') break;
      await frames(6);
    }
    await failCheck();
    await outroCheck(5);
    await sleep(800);
    await shot('story_d5_outro');
    await sleep(5000);
    await shot('story_d5_outro_saab');
    await waitIdle(5);
  };
  D[6] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await sleep(2500);
    // Get on its bumper for a look, then wear it down.
    await ev(() => { const g = __game, c = g.missions.stage.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); g.playerCar.place(c.x - fx * 9, c.z - fz * 9, c.yaw); g.cam.yaw = c.yaw; g.cam.snapNext = true; });
    await sleep(700);
    await shot('story_d6_chase');
    await log('target', await stage('(s) => `ork ${s.ork.toFixed(0)} t ${s.t.toFixed(0)}`'));
    await ev(() => { __game.missions.stage.ork = 0; });
    await stageAt(2, 20000);
    const n = await ev(() => { const n = __game.npc('vitskjorta'); return { x: n.x, z: n.z }; });
    await onFootAt(n.x, n.z, 2, 3);
    await sleep(2500);
    await shot('story_d6_talk');
    await stageAt(3, 40000);
    const t = await target();
    await onFootAt(t.x, t.z);
    await stageAt(4);
    const r = await L('runeHouse');
    await onFootAt(r.x, r.z);
    await outroCheck(6);
    await sleep(800);
    await shot('story_d6_outro');
    await waitIdle(6);
  };
  D[7] = async () => {
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    // The chase: wait for the white Škoda, let it catch Ove once (STOPPAD), then on to the hospital.
    await sleep(3000);
    await ev(() => { const g = __game, c = g.missions.stage.chaser, pc = g.playerCar; const fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw); c.place(pc.x - fx * 9, pc.z - fz * 9, pc.yaw); g.cam.yaw = pc.yaw + Math.PI * 0.85; g.cam.snapNext = true; });
    await sleep(900);
    await shot('story_d7_chaser');
    await until(() => __game.missions.stage?.stunT > 0, 12000).then(() => log('stopped by the chaser (STOPPAD)')).catch(() => log('the chaser never caught up'));
    await sleep(400);
    await shot('story_d7_stopped');
    await sleep(5000);
    await log('during the drive', await state(), 'calls', await stage('(s) => s.callI'), 'kr', await ev(() => __game.coins));
    await shot('story_d7_call');
    const h = await gotoDest();
    await carAt(h.x, h.z);
    await stageAt(4);
    await sleep(4300);
    await shot('story_d7_later');
    await stageAt(5);
    await log('after the time skip', await state(), 'clock', await ev(() => __game.clockText()));
    await sleep(4500);
    await log('Patrick calls', await ev(() => !!__interrupt.call));
    await shot('story_d7_patrick');
    const t = await target();
    await onFootAt(t.x, t.z);
    await stageAt(6);
    const s = await target();
    await onFootAt(s.x, s.z);
    await frames(4);
    await tap('KeyE');
    await sleep(600);
    await shot('story_d7_kneel');
    await sleep(1000);
    await shot('story_d7_grave');
    await outroCheck(7);
    await waitIdle(7);
    await sleep(1200);
    await cineCheck('end banner');
    await shot('story_end');
  };

  // ------------------------------------------------------------------------------------------
  // Day 1's trailer with the keyboard only.

  const BOX = {};
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const read = () => ev(() => {
    const g = __game, c = g.playerCar, t = c?.trailer, m = g.missions, s = m.stage;
    return c && t ? { x: c.x, z: c.z, yaw: c.yaw, vf: c.forwardSpeed, sp: c.speed, len: c.spec.len, tx: t.x, tz: t.z, tyaw: t.yaw, jack: !!t.jackknifed, stageI: m.stageI, state: m.state, sub: s?.sub || '', score: +(s?.score || 0).toFixed(2), rev: s?.enteredRev, still: s?.stillT || 0 }
      : { foot: true, stageI: m.stageI, state: m.state };
  });
  // Hold the keys a step function asks for (re-asked every ~50 ms) until it says 'done'.
  const drive = async (label, step, maxMs) => {
    const held = new Set();
    const t0 = Date.now();
    let st, n = 0;
    while (Date.now() - t0 < maxMs) {
      st = await read();
      if (st.foot) break;
      const want = step(st);
      if (want === 'done') break;
      for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (n++ % 20 === 0) await log(label, JSON.stringify({ x: +st.x.toFixed(2), z: +st.z.toFixed(2), yaw: +st.yaw.toFixed(3), phi: +wrap(st.yaw - st.tyaw).toFixed(3), tz: +st.tz.toFixed(2), vf: +st.vf.toFixed(2), keys: want.join('+'), sub: st.sub, score: st.score }));
      await sleep(30);
    }
    for (const k of held) await page.keyboard.up(k);
    return st;
  };

  async function trailerByKeys() {
    Object.assign(BOX, await L('parvanehDrive'));
    const fx = Math.sin(BOX.yaw), fz = Math.cos(BOX.yaw);       // a car parked right faces +f (east)
    const along = (x, z) => (x - BOX.x) * fx + (z - BOX.z) * fz;
    const lat = (x, z) => (x - BOX.x) * -fz + (z - BOX.z) * fx;  // + = to the right of the line
    // 1. From the walkway a few metres from Patrick's car: walk to it (camera aimed at it, W), E.
    await ev(() => { const g = __game, c = g.named.patrickCar, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); const x = c.x + fx * 6, z = 3.8; g.player.teleport(x, z, Math.atan2(c.x - x, c.z - z)); g.cam.yaw = g.player.yaw; g.cam.snapNext = true; });
    await frames(10);
    await shot('m1_0_walk');
    for (let k = 0; k < 120; k++) {
      const near = await ev(() => { const g = __game, c = g.named.patrickCar, p = g.player; g.cam.yaw = Math.atan2(c.x - p.x, c.z - p.z); const it = g.nearestInteractable(); return it?.type === 'car' && it.car === c; });
      if (near) break;
      await page.keyboard.down('KeyW'); await sleep(50);
    }
    await page.keyboard.up('KeyW');
    await frames(6);
    await tap('KeyE');
    await frames(10);
    await log('in Patrick\'s car:', await ev(() => __game.playerCar?.name), await state());
    if (!(await ev(() => __game.playerCar?.name === 'patrickCar'))) throw new Error('not in Patrick\'s car');
    await until(() => __game.missions.stageI >= 1, 5000);
    // 2. Forward along the walkway past the box until car and trailer are straight on its line.
    // Right of the line (lat > 0) the car must point left of +f (higher yaw); D lowers the yaw.
    const forward = (minAlong) => drive('forward', (st) => {
      const e = lat(st.x, st.z), yawStar = BOX.yaw + clamp(0.35 * e, -0.3, 0.3);
      const de = wrap(st.yaw - yawStar), phi = wrap(st.yaw - st.tyaw), a = along(st.x, st.z);
      if ((a > minAlong && Math.abs(phi) < 0.05 && Math.abs(e) < 0.3) || a > minAlong + 3) return 'done';
      const keys = [];
      if (st.vf < 2.4) keys.push('KeyW');
      if (de > 0.025) keys.push('KeyD'); else if (de < -0.025) keys.push('KeyA');
      return keys;
    }, 25000);
    await forward(9.2);
    await drive('stop', (st) => (st.vf < 0.35 ? 'done' : ['KeyS']), 4000);
    await sleep(600);
    await shot('m1_1_ahead');
    await log('ahead of the box:', await state());
    // 3. Back in. Outer loop: the trailer should head back onto the line (backing, it moves
    // against its own heading, so a trailer right of the line needs a lower yaw); inner loop: the
    // articulation phi = car yaw - trailer yaw that turns it so (backing, the trailer's yaw changes
    // by -v sin(phi) / L); keys: D raises the car's yaw while reversing, A lowers it.
    const stopAt = BOX.l / 2 - 0.4;   // the car's front this far ahead of the box centre
    let shotMid = false;
    const back = () => drive('reverse', (st) => {
      if (st.state !== 'running' || st.stageI !== 1) return 'done';
      const front = along(st.x, st.z) + st.len / 2;
      if (front <= stopAt) return 'done';
      const eT = lat(st.tx, st.tz);
      const thStar = BOX.yaw - clamp(0.45 * eT, -0.3, 0.3);
      const phi = wrap(st.yaw - st.tyaw);
      const phiStar = clamp(-1.6 * wrap(thStar - st.tyaw), -0.35, 0.35);
      const keys = ['KeyB'];
      if (-st.vf < 1.25) keys.push('KeyS');
      if (phi > phiStar + 0.02) keys.push('KeyA'); else if (phi < phiStar - 0.02) keys.push('KeyD');
      if (!shotMid && front < BOX.l / 2 + 1.5) { shotMid = true; shot('m1_2_reversing').catch(() => {}); }
      return keys;
    }, 30000);
    for (let attempt = 0; attempt < 3; attempt++) {
      await back();
      await drive('brake', (st) => (st.vf > -0.12 ? 'done' : ['KeyW']), 3000);
      await sleep(200);
      await shot('m1_3_parked');
      try { await until(() => __game.missions.stageI >= 2 || __game.missions.state !== 'running', 4000); break; }
      catch (e) {
        await log('not accepted yet', JSON.stringify(await read()));
        await forward(8.5);
        await drive('stop', (s) => (s.vf < 0.35 ? 'done' : ['KeyS']), 4000);
        await sleep(400);
      }
    }
    await log('trailer by keys:', await state());
    if (!(await ev(() => __game.missions.stageI >= 2 || __game.missions.state !== 'running'))) throw new Error('trailer parking not accepted');
  }

  const sc = {
    async story() {
      const from = +(process.env.FROM || 0);
      if (from) await fresh(`&mission=${from}`);
      for (let n = from + 1; n <= 7; n++) {
        await D[n]();
        await failCheck();
      }
      await log('story finished', await state(), 'kr', await ev(() => __game.coins), 'renderFrame ms', await ev(() => window.__stats().cpuMs));
    },
    async m1() { await D[1](true); },
    // Normal play (no ?test gate bypass): after day 1 the next day waits until Ove has filed two
    // more reports (or 75 s of free roam have passed), then 'Dag 2' dawns.
    async gate() {
      await fresh('&gate');
      await D[1]();
      await log('after day 1', JSON.stringify(await ev(() => ({ offered: !!__game.missions.offered, gateOpen: __game.missions.gateOpen, reports: __game.patrol.reports, clock: __game.clockText() }))));
      // An errand comes in at once; three reports are filed meanwhile. The new day must not dawn
      // while the errand runs (it used to, with Ove carrying Sara's cat).
      await ev(() => __interrupt.force('element', { quick: true }));
      for (let k = 0; k < 3; k++) {
        const c = await ev(() => { const g = __game, P = g.patrol, p = g.player; let best = null, bd = 1e9; for (const c of P.open) { if (c.violation.smitare) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } best ??= P.forceSpawn(1, { x: p.x, z: p.z }, { smitare: false })[0]; return { x: best.x, z: best.z }; });
        await ev((c) => { const g = __game, s = g.freeSpot(c.x, c.z, 3, 3.6); g.player.teleport(s.x, s.z, Math.atan2(c.x - s.x, c.z - s.z)); g.cam.snapNext = true; }, c);
        await frames(5);
        await page.keyboard.down('KeyF'); await sleep(2200); await page.keyboard.up('KeyF');
        await frames(5);
      }
      await sleep(38000);
      const mid = await ev(() => ({ offered: !!__game.missions.offered, errand: !!__interrupt.active, reports: __game.patrol.reports, idle: +(__game.missions.gate?.idle || 0).toFixed(1) }));
      await log('3 reports + 38 s with an errand on', JSON.stringify(mid));
      if (mid.offered) await bad('gate: a new day dawned in the middle of an errand');
      // Do the errand (the radiator at Rune's), then the day may dawn.
      const r = await L('runeHouse');
      await onFootAt(r.x, r.z);
      await frames(4);
      await page.keyboard.down('KeyE'); await sleep(3600); await page.keyboard.up('KeyE');
      await log('errand done', await ev(() => !__interrupt.active));
      // Somewhere near Parvaneh's door when the day dawns: Patrick (in hospital on day 2) must be
      // gone at once, not standing at his door.
      const pv = await L('parvanehHouse');
      await onFootAt(pv.x, pv.z, 6, 8);
      try { await until(() => !!__game.missions.offered, 60000); } catch (e) { await bad('gate: day 2 never dawned'); return; }
      await frames(3);
      const d2 = await ev(() => { const g = __game, n = g.npc('patrick'); return { title: g.missions.offered.title, clock: g.clockText(), patrick: n.state, visible: n.root.visible, banner: document.querySelector('#banner .banner-sub')?.textContent, idle: +(g.missions.gate?.idle || 0).toFixed(1) }; });
      await log('day 2 offered', JSON.stringify(d2));
      if (d2.patrick !== 'hidden' || d2.visible) await bad(`gate: Patrick stands at his door on the morning he is in hospital (${d2.patrick})`);
      if (d2.clock !== '10:30') await bad(`gate: the new day starts at ${d2.clock}`);
      await shot('gate_newday');
    },
    // Each day's intro, walked up to from three sides (no teleport next to the giver): the first
    // shot of every intro must show both speakers' heads with nothing at the lens.
    async intros() {
      const from = +(process.env.FROM || 0), to = +(process.env.TO || 7);
      for (let day = from + 1; day <= to; day++) {
        for (const k of [0, 1, 2]) {
          await fresh(`&mission=${day - 1}`);
          await until(() => !!__game.missions.offered, 20000);
          // Out on the walkway in front of the giver: straight out from their door (side 0), or
          // along the walkway from either side (1, 2), then up to them.
          await ev(async () => { const { segmentBlocked } = await import('./src/world/collision.js'); window.__seg = segmentBlocked; });
          const at = await ev((k) => {
            const g = __game, def = g.missions.offered, n = g.npc(def.giver), L = window.__lm(def.at), yaw = L.yaw ?? 0;
            const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx, sd = k === 1 ? 1 : -1;
            // (straight out: from 3.2 m, just in reach - further out there are fences across the
            // walkway at some doors, and Rune's wheelchair in front of Anita)
            const st = k === 0 ? { x: n.x + fx * 3.2, z: n.z + fz * 3.2 } : { x: n.x + fx * 2.4 + rx * 5 * sd, z: n.z + fz * 2.4 + rz * 5 * sd };
            const s = g.spotFree(st.x, st.z) ? st : g.freeSpot(st.x, st.z, 0.3, 1.5);
            window.__walkWp = k === 0 ? [] : [{ x: n.x + fx * 2.2 + rx * 0.9 * sd, z: n.z + fz * 2.2 + rz * 0.9 * sd }];
            const a = Math.atan2(n.x - s.x, n.z - s.z);
            g.player.teleport(s.x, s.z, a); g.cam.yaw = a; g.cam.snapNext = true;
            return [s.x.toFixed(1), s.z.toFixed(1)];
          }, k);
          await frames(5);
          // Walk (W, the camera turned to the next point) until "Prata med" shows, then E.
          for (let i = 0; i < 120; i++) {
            const ok = await ev(() => {
              const g = __game, n = g.npc(g.missions.offered.giver), p = g.player, W = window.__walkWp;
              if (W.length && Math.hypot(W[0].x - p.x, W[0].z - p.z) < 0.6) W.shift();
              const t = W[0] || n;
              g.cam.yaw = Math.atan2(t.x - p.x, t.z - p.z);
              return !W.length && g.nearestInteractable()?.type === 'talk';
            });
            if (ok) break;
            await page.keyboard.down('KeyW'); await sleep(50);
          }
          await page.keyboard.up('KeyW');
          await frames(3);
          await tap('KeyE');
          try { await until(() => __game.missions.introOn, 4000); } catch (e) { await bad(`intros: day ${day} from side ${k}: E did not start the intro`); continue; }
          await sleep(400);
          await cineCheck(`intro day ${day} side ${k} (from ${at})`);
          await shot(`intros_d${day}_${k}`);
        }
      }
    },
    // What the story leaves in the world (a game loaded at day 7): Patrick's cast, the cat by
    // Ove's door, Adrian's Saab in the lot; then day 7's flowers on Sonja's grave.
    async aftermath() {
      await fresh('&mission=6');
      const look = async (name, x, z, back, yawOff = 0) => {
        await ev(({ x, z, back, yawOff }) => { const g = __game, s = g.freeSpot(x, z, back, back + 0.8); const yaw = Math.atan2(x - s.x, z - s.z); g.player.teleport(s.x, s.z, yaw); g.cam.yaw = yaw + yawOff; g.cam.pitch = 0.22; g.cam.snapNext = true; }, { x, z, back, yawOff });
        await frames(30);
        await shot(name);
      };
      // Framed like a dialogue: the camera at eye height beside Ove and the thing.
      const frame = async (name, pt) => {
        await ev((pt) => { const g = __game; g.cinematic({ x: pt.x, y: pt.y, z: pt.z, height: 0.6 }, g.player); }, pt);
        await frames(40);
        await shot(name);
        await ev(() => __game.endCinematic());
      };
      const cat = await ev(async () => { const { queryBlocks, groundAt } = await import('./src/world/collision.js'); const p = __game.homeCat.root.position; const bl = queryBlocks(p.x - 0.6, p.z - 0.6, p.x + 0.6, p.z + 0.6, []).map((b) => `${b.kind}:${b.top.toFixed(2)}`); return { x: p.x, y: p.y, z: p.z, ground: groundAt(p.x, p.z, 2, 0.6).toFixed(2), bl }; });
      await log('cat', JSON.stringify(cat));
      await look('after_cat', cat.x, cat.z, 2.6, 0.5);
      await frame('after_cat2', cat);
      const a = await ev(() => { const c = __game.named.adrianSaab; return { x: c.x, z: c.z }; });
      await look('after_adriansaab', a.x, a.z, 5.5, 0.3);
      const p = await ev(() => { const n = __game.npc('patrick'); return { x: n.x, z: n.z, cast: n.def.cast }; });
      await log('patrick cast', p.cast);
      await look('after_patrick', p.x, p.z, 2.4, 0.4);
      const fl = await ev(async () => { const M = await import('./src/game/missions.js'); M.flowersOnGrave(__game); const f = __game.graveFlowers; return { x: f.x, y: f.y, z: f.z }; });
      await log('flowers', JSON.stringify(fl));
      await look('after_grave', fl.x, fl.z, 1.8, 0.5);
      await frame('after_grave2', { ...fl, y: await ev((fl) => __game.groundAt(fl.x, fl.z), fl) });
    },
  };

  // ------------------------------------------------------------------------------------------
  // Fix round 1: checks with no warps where it matters.

  // Day 7 up to the chase (warps to the Saab and to Parvaneh), then hands off.
  const day7Chase = async () => {
    await fresh('&mission=6');
    if (process.env.CHASER_AWAY) await ev(() => { window.__chaserAway = true; });
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
  };
  // Keys held by a step function every ~40 ms (like m1's drive), with the car state.
  const carState = () => ev(() => {
    const g = __game, c = g.playerCar, s = g.missions.stage;
    return c ? { x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, sp: c.speed, state: g.missions.state, kind: s?.kind, phase: s?.phase, pi: s?.pi, oi: s?.oi, gap: s?.gap, ox: s?.opp?.x, oz: s?.opp?.z, ov: s?.opp?.speed, t: g.time } : { foot: true, state: g.missions.state, t: g.time };
  });
  const keysLoop = async (label, step, maxMs, every = 25) => {
    const held = new Set(), t0 = Date.now();
    let st, n = 0;
    while (Date.now() - t0 < maxMs) {
      st = await carState();
      const want = step(st);
      if (want === 'done') break;
      for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (n++ % every === 0) await log(label, JSON.stringify({ x: +(st.x ?? 0).toFixed(1), z: +(st.z ?? 0).toFixed(1), kmh: Math.round((st.v || 0) * 3.6), keys: want.join('+'), pi: st.pi, oi: st.oi, gap: st.gap == null ? null : Math.round(st.gap), opp: st.ox == null ? null : [Math.round(st.ox), Math.round(st.oz), Math.round((st.ov || 0) * 3.6)] }));
      await sleep(30);
    }
    for (const k of held) await page.keyboard.up(k);
    return st;
  };

  // Day 2 / 7: Parvaneh walks from her door to the lot entrance on her own (Ove stands still).
  sc.lotwalk = async () => {
    await fresh('&mission=1');
    await startMission();
    const t0 = await ev(() => __game.time);
    await ev(() => { const g = __game, c = g.named.saab; g.player.teleport(c.x + 2.2, c.z, 0); });
    let arrived = null;
    for (let k = 0; k < 60; k++) {
      const r = await ev(() => { const g = __game, n = g.npc('parvaneh'); return { x: n.x, z: n.z, walking: !!n.walkTo, t: g.time }; });
      if (k % 6 === 0) await log('parvaneh', `t ${(r.t - t0).toFixed(1)} at (${r.x.toFixed(1)}, ${r.z.toFixed(1)})${r.walking ? ' walking' : ''}`);
      if (k === 12) await shot('lotwalk_1');
      if (!r.walking && Math.hypot(r.x + 27, r.z + 22.6) < 1.5) { arrived = r.t - t0; break; }
      await sleep(700);
    }
    await log('Parvaneh at the lot entrance after', arrived?.toFixed(1), 's');
    if (arrived == null) await bad('lotwalk: Parvaneh never got to the lot entrance');
    await shot('lotwalk_2');
  };

  // Day 2's last stretch with keys: from the x = 120 street, follow the guide (missions.target(),
  // which leads through the Akut driveway) to the drop-off under the canopy.
  sc.hospdrive = async () => {
    await fresh('&mission=1');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await carAt(117.25, -120, Math.PI);
    await frames(10);
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const t0 = await ev(() => __game.time);
    let n = 0;
    const res = await (async () => {
      for (let k = 0; k < 900; k++) {
        const st = await ev(() => { const g = __game, c = g.playerCar, t = g.missions.target(), s = g.missions.stage; return { x: c.x, z: c.z, yaw: c.yaw, v: c.forwardSpeed, kind: s?.kind, tx: t?.x, tz: t?.z, t: g.time }; });
        if (st.kind !== 'goto') return st;
        if (st.t - t0 > 30) return null;
        const e = wrap(Math.atan2(st.tx - st.x, st.tz - st.z) - st.yaw), d = Math.hypot(st.tx - st.x, st.tz - st.z);
        const vt = Math.abs(e) > 0.6 ? 3.5 : Math.min(10, 2 + d * 0.4);
        const keys = [];
        if (st.v < vt - 0.3) keys.push('KeyW'); else if (st.v > vt + 0.8) keys.push('KeyS');
        if (e < -0.04) keys.push('KeyD'); else if (e > 0.04) keys.push('KeyA');
        for (const kk of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) { if (keys.includes(kk)) await page.keyboard.down(kk); else await page.keyboard.up(kk); }
        if (n++ % 25 === 0) await log('hosp', `(${st.x.toFixed(1)}, ${st.z.toFixed(1)}) -> (${st.tx.toFixed(1)}, ${st.tz.toFixed(1)}) ${Math.round(st.v * 3.6)} km/h ${keys.join('+')}`);
        if (n === 60) await shot('hosp_1');
        await sleep(30);
      }
      return null;
    })();
    for (const kk of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(kk);
    await log('hospital reached:', res ? `${res.kind} after ${(res.t - t0).toFixed(1)} s` : 'no');
    await shot('hosp_2');
    if (!res) await bad('hospdrive: the guide did not lead the Saab to the drop-off in 30 s');
  };

  // Fail, retry, give up (fix round 1): a lost race retries on the grid with Adrian aboard; the
  // failed banner waits (no silent give-up); Q gives up, and taking the day up again gets the short
  // intro; a failed drive sends Parvaneh home instead of leaving her on the street.
  sc.retry = async () => {
    await fresh('&mission=4');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await until(() => __game.missions.stage?.phase === 'race', 15000);
    await sleep(1500);
    await ev(() => __game.missions.fail('Anders kom först. (test)'));
    await sleep(800);
    const a1 = await ev(() => { const g = __game, n = g.npc('adrian'), h = window.__lm('adrianSpot'); return { car: !!n.car, dHome: Math.hypot(n.x - h.x, n.z - h.z) }; });
    await log('failed: Adrian', JSON.stringify(a1));
    if (a1.car || a1.dHome > 6) await bad('retry: Adrian was left by the car after the fail');
    await sleep(16000);
    const st = await ev(() => __game.missions.state);
    await log('16 s after the fail:', st);
    if (st !== 'failed') await bad(`retry: the failed state gave up by itself (${st})`);
    await shot('retry_0_failed');
    await tap('KeyE');
    await until(() => __game.missions.state === 'running', 5000);
    await until(() => __game.missions.stage?.phase === 'count', 8000).catch(() => {});
    const r = await ev(() => { const g = __game, m = g.missions, n = g.npc('adrian'); return { stageI: m.stageI, kind: m.stage?.kind, phase: m.stage?.phase, adrianAboard: n.car === g.playerCar && !!g.playerCar }; });
    await log('after E:', JSON.stringify(r));
    await shot('retry_1_grid');
    if (r.kind !== 'race' || !r.adrianAboard) await bad(`retry: not back on the grid with Adrian (${JSON.stringify(r)})`);
    // Give up, then take the day up again: the short intro.
    await until(() => __game.missions.stage?.phase === 'race', 10000);
    await ev(() => __game.missions.fail('test'));
    await sleep(1200);
    await tap('KeyQ');
    await until(() => __game.missions.state === 'idle', 5000);
    await ev(() => { window.__lines = []; const el = document.querySelector('#dialog .dlg-text'); new MutationObserver(() => { const t = el.textContent; const L = window.__lines; if (t.length > 6 && !L.some((x) => t.startsWith(x.slice(0, 6)) || x.startsWith(t.slice(0, 6)))) L.push(t); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    await startMission();
    const lines = await ev(() => window.__lines.length);
    await log('intro after giving up:', lines, 'lines');
    if (lines > 3) await bad(`retry: the whole intro again after giving up (${lines} lines)`);
    // Day 7: a failed drive sends Parvaneh home.
    await fresh('&mission=6');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await sleep(1000);
    await ev(() => __game.missions.fail('För sent. (test)'));
    await sleep(800);
    const p = await ev(() => { const g = __game, n = g.npc('parvaneh'), h = window.__lm('parvanehHouse'); return { car: !!n.car, dHome: Math.hypot(n.x - h.x, n.z - h.z) }; });
    await log('day 7 failed: Parvaneh', JSON.stringify(p));
    if (p.car || p.dHome > 6) await bad('retry: Parvaneh was left on the street after the fail');
  };

  sc.m7chase = async () => {
    await day7Chase();
    // Ove's Saab parked on Solrosvägen, ~100 m from where the Škoda waits; nobody touches the Škoda.
    await carAt(60, -42.75, -Math.PI / 2);
    await ev(() => { const c = __game.playerCar; c.vx = c.vz = 0; });
    const t0 = await ev(() => __game.time), LIMIT = process.env.CHASER_AWAY ? 35 : 25;
    let best = Infinity, at = null, first = null;
    for (let k = 0; k < 80; k++) {
      const r = await ev(() => { const g = __game, s = g.missions.stage, c = s?.chaser, p = g.playerCar; return c && p ? { d: Math.hypot(c.x - p.x, c.z - p.z), t: g.time, kmh: c.speed * 3.6, x: c.x, z: c.z, stun: s.stunT > 0 } : null; });
      if (!r) break;
      if (r.d < best) { best = r.d; at = r.t - t0; }
      if (r.d < 40 && first == null) first = r.t - t0;
      if (k % 4 === 0) await log('chaser', `t ${(r.t - t0).toFixed(1)} d ${r.d.toFixed(0)} m, ${r.kmh.toFixed(0)} km/h at (${r.x.toFixed(0)}, ${r.z.toFixed(0)})${r.stun ? ' STOPPAD' : ''}`);
      if (k === 20) await shot('m7c_chase');
      if (r.t - t0 > LIMIT + 1) break;
      await sleep(500);
    }
    await log('chaser closest', best.toFixed(1), 'm at', at?.toFixed(1), 's; under 40 m after', first?.toFixed(1), 's');
    await log('pacing after', LIMIT, 's: calls', await ev(() => __game.missions.stage?.callI), 'of 5, radio lines', await ev(() => __game.missions.stage?.radioI), 'of 3');
    if (first == null || first > LIMIT) await bad(`m7chase: the chaser never came within 40 m in ${LIMIT} s (closest ${best.toFixed(0)} m)`);
    await shot('m7c_end');
  };

  // Day 5's race with keys: a lane-following bot (pure pursuit on the right-hand lane through the
  // three corners, full throttle on the straights up to RACE_VMAX, braking for each corner).
  sc.m5race = async () => {
    await fresh('&mission=4');
    await startMission();
    await enter('saab');
    await stageAt(1);
    await pickupByCar();
    await stageAt(2);
    await until(() => __game.missions.stage?.phase === 'count', 15000);
    await shot('m5r_grid');
    const LANEW = 2.75, VMAX = +(process.env.RACE_VMAX || 36);
    const cps = await ev(() => __game.missions.stage.cps.map((c) => ({ x: c.x, z: c.z })));
    const start = await carState();
    // Right-hand lane corner points: each node offset by both legs' right-hand side.
    const nodes = [{ x: start.x, z: start.z }, ...cps];
    const right = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); return { x: -dz / l, z: dx / l }; };
    const pts = [{ x: start.x, z: start.z }];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i], r1 = right(a, b);
      if (i < nodes.length - 1) { const r2 = right(b, nodes[i + 1]); pts.push({ x: b.x + (r1.x + r2.x) * LANEW, z: b.z + (r1.z + r2.z) * LANEW, corner: true }); }
      else pts.push({ x: b.x, z: b.z });   // (the finish is in the lane already)
    }
    // Corner speed: right turns are tight, left ones wider.
    for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1]; const cr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x); pts[i].vc = cr > 0 ? 7.5 : 9; }
    await log('race route', JSON.stringify(pts.map((p) => [Math.round(p.x), Math.round(p.z), p.vc || 0])));
    await until(() => __game.missions.stage?.phase === 'race', 10000);
    const t0 = await ev(() => __game.time);
    let seg = 1;
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const fin = cps[cps.length - 1];
    let lastOpp = null;
    const st = await keysLoop('race', (st) => {
      if (st.foot || st.kind !== 'race') { if (lastOpp) console.log('[t] Anders', Math.round(Math.hypot(lastOpp.x - fin.x, lastOpp.z - fin.z)), 'm from the finish as Ove crossed'); return 'done'; }
      if (st.ox != null) lastOpp = { x: st.ox, z: st.oz };
      // Advance along the polyline: next corner reached (within 9 m) or passed.
      while (seg < pts.length - 1) {
        const a = pts[seg - 1], b = pts[seg], ab = Math.hypot(b.x - a.x, b.z - a.z);
        const along = ((st.x - a.x) * (b.x - a.x) + (st.z - a.z) * (b.z - a.z)) / ab;
        if (along > ab - 6) seg++; else break;
      }
      const a = pts[seg - 1], b = pts[seg], ab = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / ab, uz = (b.z - a.z) / ab;
      const along = (st.x - a.x) * ux + (st.z - a.z) * uz;
      const look = 7 + Math.abs(st.v) * 0.45;
      let tx, tz;
      if (along + look < ab || seg === pts.length - 1) { const t = Math.min(ab, along + look); tx = a.x + ux * t; tz = a.z + uz * t; }
      else { const c = pts[seg + 1], bc = Math.hypot(c.x - b.x, c.z - b.z), rest = along + look - ab; tx = b.x + (c.x - b.x) / bc * Math.min(bc, rest); tz = b.z + (c.z - b.z) / bc * Math.min(bc, rest); }
      // Speed: full on the straight, braking (~6.5 m/s²) for the next corner.
      let vt = VMAX;
      if (b.vc) { const d = Math.hypot(b.x - st.x, b.z - st.z); vt = Math.min(vt, Math.sqrt(b.vc * b.vc + 2 * 6 * Math.max(0, d - 11))); }
      const keys = [];
      if (st.v < vt - 0.4) keys.push('KeyW'); else if (st.v > vt + 1.2) keys.push('KeyS');
      const e = wrap(Math.atan2(tx - st.x, tz - st.z) - st.yaw);
      if (e < -0.025) keys.push('KeyD'); else if (e > 0.025) keys.push('KeyA');
      return keys;
    }, 70000);
    const res = await ev(() => { const g = __game, m = g.missions, a = g.named.andersAudi, f = m.stage?.cps?.at(-1) || window.__lm?.('dealerLot'); return { state: m.state, index: m.index, sub: document.querySelector('#banner .banner-sub')?.textContent || '', anders: a && f ? Math.round(Math.hypot(a.x - f.x, a.z - f.z)) : null }; });
    const secs = (await ev(() => __game.time)) - t0;
    await log('race result', JSON.stringify(res), 'after', secs.toFixed(1), 's, last gap', st.gap == null ? '-' : Math.round(st.gap));
    await shot('m5r_end');
    if (res.state === 'failed' || (res.index === 4 && res.state === 'running')) await bad(`m5race: not won (${res.state} ${res.sub})`);
    else await log('RACE WON');
  };

  // Day 4's cat with keys.
  sc.m4cat = async () => {
    await fresh('&mission=3');
    await startMission();
    const cat = () => ev(() => { const s = __game.missions.stage, c = s?.cat, p = __game.player; return c ? { x: c.x, z: c.z, mode: s.mode, d: Math.hypot(c.x - p.x, c.z - p.z), kind: s.kind, px: p.x, pz: p.z, pv: Math.hypot(p.vx, p.vz) } : { kind: s?.kind || __game.missions.state }; });
    // (CAT_TRACE=1: every 0.25 s game time, where Ove and the cat are)
    if (process.env.CAT_TRACE) await ev(() => { let t = 0; __game.onFrame((dt) => { t += dt; if (t < 0.25) return; t = 0; const s = __game.missions.stage, c = s?.cat, p = __game.player; if (c) console.log('[t] trace', `ove (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) v ${Math.hypot(p.vx, p.vz).toFixed(1)} cat (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) ${s.mode} d ${Math.hypot(c.x - p.x, c.z - p.z).toFixed(1)} still ${s.stillT.toFixed(1)}`); }); });
    // 12-14 m from the cat with a clear line to it (on the footpath, not behind a hedge), facing it.
    await ev(async () => {
      const { segmentBlocked } = await import('./src/world/collision.js');
      const g = __game, c = g.missions.stage.cat;
      let best = null;
      for (let k = 0; k < 200 && !best; k++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 2, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        if (g.spotFree(x, z) && Math.abs(g.groundAt(x, z) - c.y) < 0.3 && segmentBlocked(x, z, c.x, c.z, c.y + 0.45) < 0) best = { x, z };
      }
      best ??= g.freeSpot(c.x, c.z, 12, 14);
      const yaw = Math.atan2(c.x - best.x, c.z - best.z);
      g.player.teleport(best.x, best.z, yaw); g.cam.yaw = yaw; g.cam.snapNext = true;
    });
    await frames(10);
    await shot('m4c_0');
    const aim = () => ev(() => { const g = __game, c = g.missions.stage?.cat, p = g.player; if (c) g.cam.yaw = Math.atan2(c.x - p.x, c.z - p.z); });
    // 1. Walk up (W): it bolts.
    let boltD = null;
    for (let k = 0; k < 120; k++) {
      await aim(); await page.keyboard.down('KeyW'); await sleep(50);
      const c = await cat();
      if (c.kind !== 'catchCat') break;
      if (c.mode === 'run') { boltD = c.d; break; }
    }
    await page.keyboard.up('KeyW');
    await log('cat bolted with Ove', boltD?.toFixed(1), 'm away');
    // 2. Stride after it (W + Shift) for 6 s.
    const t0 = Date.now();
    let caught = null, c0T = null, lastMode = null;
    await page.keyboard.down('ShiftLeft');
    while (Date.now() - t0 < 6000) {
      await aim(); await page.keyboard.down('KeyW'); await sleep(60);
      const c = await cat();
      if (c.kind !== 'catchCat') { caught = (Date.now() - t0) / 1000; break; }
      lastMode = c.mode;
      if (Date.now() - (c0T ?? 0) > 500) { c0T = Date.now(); await log('chase', `cat ${c.mode} ${c.d.toFixed(1)} m at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`); }
    }
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    await shot('m4c_1_chase');
    const after = await cat();
    await log('after 6 s of striding:', caught != null ? `caught after ${caught.toFixed(1)} s` : `not caught, ${after.d?.toFixed(1)} m, ${after.mode}`);
    // (Ove wedged on the bike shed stands still: if the cat came to him, that's patience, not a chase)
    if (caught != null && caught < 5 && lastMode !== 'come') await bad(`m4cat: caught after only ${caught.toFixed(1)} s of chasing (${lastMode})`);
    // 3. Stand still: it comes.
    if (caught == null) {
      // Once it has settled: Ove 6-7.5 m from it with a clear line (the bot can't path round the
      // bike shed), then nothing - no keys - until it comes to him.
      await until(() => ['rest', 'sit', 'wander'].includes(__game.missions.stage?.mode) || __game.missions.stage?.kind !== 'catchCat', 15000).catch(() => {});
      await ev(async () => {
        const { segmentBlocked } = await import('./src/world/collision.js');
        const { isRoad } = await import('./src/world/layout.js');
        const g = __game, c = g.missions.stage?.cat;
        if (!c) return;
        let best = null;
        for (let k = 0; k < 300 && !best; k++) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 1.5, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
          if (g.spotFree(x, z) && !isRoad(x, z) && Math.abs(g.groundAt(x, z) - c.y) < 0.3 && segmentBlocked(x, z, c.x, c.z, c.y + 0.45, '') < 0) best = { x, z };
        }
        if (!best) return;
        const yaw = Math.atan2(c.x - best.x, c.z - best.z);
        g.player.teleport(best.x, best.z, yaw); g.player.vx = g.player.vz = 0; g.cam.yaw = yaw; g.cam.snapNext = true;
      });
      await log('standing still', JSON.stringify(await cat()));
      const t1 = Date.now();
      let came = null;
      while (Date.now() - t1 < 20000) {
        const c = await cat();
        if (c.kind !== 'catchCat') { came = (Date.now() - t1) / 1000; break; }
        if (c.mode === 'come' && !(await ev(() => window.__shotCome))) { await ev(() => { window.__shotCome = true; }); await log('it comes', JSON.stringify(c)); await shot('m4c_2_comes'); }
        await sleep(150);
      }
      await log('standing still:', came != null ? `it came and was caught after ${came.toFixed(1)} s` : 'it never came');
      if (came == null) await bad('m4cat: the cat never came to Ove standing still');
    }
    await shot('m4c_3_carry');
  };
  // Day 6 with keys, from the start: Ove gets into the Saab where it stands by the garages (no warp
  // behind the Škoda), drives out of the lot and has to stop Vita skjortan (bump him, stay on his
  // bumper). A bot: waypoints out of the lot, then the road route to the Škoda (layout's routeAim,
  // like the guide arrow), straight at it once it is close and on the same street. Must catch it.
  sc.m6chase = async () => {
    await fresh('&mission=5');
    await startMission();
    await ev(() => { const g = __game, c = g.named.saab, e = g.exitSpot(c, 1); g.player.teleport(e.x, e.z, Math.atan2(c.x - e.x, c.z - e.z)); g.cam.yaw = c.yaw; g.cam.snapNext = true; });
    await frames(5);
    await tap('KeyE');
    try { await until(() => __game.missions.stage?.kind === 'destroy', 6000); } catch (e) { await bad('m6chase: never got into the Saab'); return; }
    const st0 = await ev(() => { const g = __game, s = g.missions.stage, c = g.playerCar; return { saab: [+c.x.toFixed(1), +c.z.toFixed(1), +c.yaw.toFixed(2)], skoda: [+s.car.x.toFixed(1), +s.car.z.toFixed(1)], waiting: s.waitT > 0, d: +Math.hypot(s.car.x - c.x, s.car.z - c.z).toFixed(0) }; });
    await log('day 6 start', JSON.stringify(st0));
    await shot('m6c_0');
    // The bot's brain runs in the page: out of the lot by waypoints (the Saab stands nose out, the
    // aisle runs west to the lot entrance), then a lane path to the Škoda (the AI's own LanePath over
    // the shortest node route, re-planned every second) with a lookahead, slowing for turns; within
    // ~30 m and roughly ahead: straight at it, a little faster than it (bumps). Stuck: back up.
    await ev(() => { window.__bot = { wp: [{ x: -6, z: -23.2 }, { x: -28, z: -23.2 }, { x: -38.5, z: -22.5 }], plan: null, planT: 0, stuckT: 0, revT: 0 }; });
    let n = 0, res = null, woke = null, closest = 1e9;
    const t0 = await ev(() => __game.time);
    const held = new Set();
    for (let k = 0; k < 5000; k++) {
      const st = await ev(async () => {
        const L = await import('./src/world/layout.js'), D = await import('./src/actors/drivers.js');
        const g = __game, c = g.playerCar, m = g.missions, s = m.stage, B = window.__bot;
        if (!c || s?.kind !== 'destroy') return { kind: s?.kind || m.state, t: g.time };
        const q = s.car, d = Math.hypot(q.x - c.x, q.z - c.z), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), v = c.forwardSpeed;
        let tx, tz, vt;
        if (B.wp.length) {
          if (Math.hypot(B.wp[0].x - c.x, B.wp[0].z - c.z) < 3.5) B.wp.shift();
          const w = B.wp[0] || { x: c.x + fx * 10, z: c.z + fz * 10 };
          tx = w.x; tz = w.z; vt = 7;
        } else {
          const ahead = ((q.x - c.x) * fx + (q.z - c.z) * fz) / (d || 1);
          // (straight at it only along asphalt: across a corner it drove into yards)
          const roadLine = L.isRoad(c.x, c.z) && [0.25, 0.5, 0.75, 1].every((t) => L.isRoad(c.x + (q.x - c.x) * t, c.z + (q.z - c.z) * t));
          if (d < 30 && ahead > 0.5 && roadLine) { tx = q.x + q.vx * 0.35; tz = q.z + q.vz * 0.35; vt = Math.max(9, q.speed + (d > 9 ? 7 : 3)); }
          else {
            B.planT -= 1;
            if (!B.plan || B.planT <= 0) {
              const [a, b] = D.startNodes(c), goal = L.nearestNode(q.x, q.z);
              const rest = b === goal ? [] : L.findPath(b, goal).slice(1);
              B.plan = new D.LanePath([a, b, ...rest], { endPoint: [q.x, q.z] });
              B.plan.ensure(60);
              B.planT = 30;
            }
            const P = B.plan, pts = P.pts;
            while (P.idx < pts.length - 1) { const p0 = pts[P.idx], dx = p0.x - c.x, dz = p0.z - c.z; if (dx * dx + dz * dz < 16 || dx * fx + dz * fz < 0) P.idx++; else break; }
            const look = 4.2 + Math.abs(v) * 0.38;
            let tp = pts[Math.min(P.idx, pts.length - 1)];
            for (let i = P.idx; i < pts.length; i++) { tp = pts[i]; if (Math.hypot(pts[i].x - c.x, pts[i].z - c.z) > look) break; }
            // near a turn: aim at its first point (a long lookahead cuts the corner over the kerb)
            for (let i = P.idx; i < pts.length && i < P.idx + 10; i++) if (pts[i].turn) { if (Math.hypot(pts[i].x - c.x, pts[i].z - c.z) > 6) tp = Math.hypot(tp.x - c.x, tp.z - c.z) < Math.hypot(pts[i].x - c.x, pts[i].z - c.z) ? tp : pts[i]; break; }
            tx = tp.x; tz = tp.z; vt = 30;
            for (let i = P.idx; i < pts.length && i < P.idx + 14; i++) if (pts[i].turn && Math.hypot(pts[i].x - c.x, pts[i].z - c.z) < 12 + v * v / 9) { vt = 8.5; break; }
          }
        }
        // stuck against something: back up a moment, steering the other way
        if (B.revT > 0) { B.revT -= 1; return { kind: s.kind, rev: true, e: 0, v, vt: -4, x: c.x, z: c.z, qx: q.x, qz: q.z, qv: q.speed, d, waiting: s.waitT > 0, ork: s.ork, farT: s.farT, t: g.time }; }
        if (Math.abs(v) < 0.8 && vt > 3 && !(s.waitT > 0 && !B.wp.length)) B.stuckT += 1; else B.stuckT = 0;
        if (B.stuckT > 45) {
          B.stuckT = 0; B.revT = 35; B.plan = null;
          const near = g.cars.filter((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 7).map((o) => `${o.kind}@${o.x.toFixed(1)},${o.z.toFixed(1)}${o.violation ? ' viol' : ''}`);
          console.log('[t] m6 stuck at', c.x.toFixed(1), c.z.toFixed(1), 'yaw', c.yaw.toFixed(2), 'cars', near.join(' '));
        }
        let e = Math.atan2(tx - c.x, tz - c.z) - c.yaw;
        while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        if (Math.abs(e) > 0.6) vt = Math.min(vt, 8);
        return { kind: s.kind, e, v, vt, x: c.x, z: c.z, qx: q.x, qz: q.z, qv: q.speed, d, waiting: s.waitT > 0, ork: s.ork, farT: s.farT, t: g.time };
      });
      if (st.kind !== 'destroy') { res = st; break; }
      if (st.t - t0 > 170) break;
      if (!st.waiting && woke == null) { woke = st.t - t0; await log('the Škoda sets off after', woke.toFixed(1), 's'); }
      closest = Math.min(closest, st.d);
      const keys = [];
      if (st.rev) { keys.push('KeyS'); }
      else {
        if (st.v < st.vt - 0.4) keys.push('KeyW'); else if (st.v > st.vt + 1.5) keys.push('KeyS');
        if (st.e < -0.04) keys.push('KeyD'); else if (st.e > 0.04) keys.push('KeyA');
      }
      for (const kk of [...held]) if (!keys.includes(kk)) { await page.keyboard.up(kk); held.delete(kk); }
      for (const kk of keys) if (!held.has(kk)) { await page.keyboard.down(kk); held.add(kk); }
      if (n++ % 25 === 0) await log('m6', `t ${(st.t - t0).toFixed(1)} saab (${st.x.toFixed(0)}, ${st.z.toFixed(0)}) ${Math.round(st.v * 3.6)} km/h, skoda (${st.qx.toFixed(0)}, ${st.qz.toFixed(0)}) ${Math.round(st.qv * 3.6)} km/h, d ${st.d.toFixed(0)} m, ork ${st.ork.toFixed(0)}${st.waiting ? ' waiting' : ''}${st.farT > 0 ? ` far ${st.farT.toFixed(1)}` : ''}${st.rev ? ' REV' : ''}`);
      if (n === 150) await shot('m6c_1');
      await sleep(30);
    }
    for (const kk of held) await page.keyboard.up(kk);
    const end = await ev(() => ({ state: __game.missions.state, kind: __game.missions.stage?.kind, sub: document.querySelector('#banner .banner-sub')?.textContent || '' }));
    await log('m6chase result', JSON.stringify(end), 'after', res ? (res.t - t0).toFixed(1) : '-', 's, closest', closest.toFixed(0), 'm');
    await shot('m6c_2');
    if (end.state === 'failed' || end.kind === 'destroy' || !res) await bad(`m6chase: the Škoda was not stopped (${end.state} ${end.kind} ${end.sub})`);
    else await log('SKODA STOPPED');
  };
  // Continuity (phase 4): a smitare chase going on when Ove starts the day's mission ends quietly
  // (no SMET! over the intro, no Ordning lost, nothing in the log); a phone call never rings as he
  // walks up to the giver, nor the moment an outro ends.
  sc.smitintro = async () => {
    await fresh('&calls');
    await until(() => !!__game.missions.offered, 20000);
    const r0 = await ev(() => {
      const g = __game, P = g.patrol, n = g.npc(g.missions.offered.giver);
      // a smitare on a street spot outside Ove's area, then its flight
      const c = P.forceSpawn(1, { x: -60, z: -40 }, { smitare: true, radius: 40 })[0];
      if (!c?.violation?.smitare) return { err: 'no smitare spot' };
      P.startWriting(c);
      const s = g.freeSpot(n.x, n.z, 1.4, 2);
      g.player.teleport(s.x, s.z, Math.atan2(n.x - s.x, n.z - s.z));
      return { pursuit: !!P.pursuit, ordning: +P.ordning.toFixed(1), log: P.log.length };
    });
    await log('smitare fleeing', JSON.stringify(r0));
    if (r0.err) { await bad('smitintro: ' + r0.err); return; }
    await sleep(800);
    await ev(() => __game.missions.begin());
    await sleep(14000);
    const r1 = await ev(() => { const P = __game.patrol; return { pursuit: !!P.pursuit, panel: document.querySelector('.pursuit, #pursuit')?.classList.contains('show') || false, ordning: +P.ordning.toFixed(1), log: P.log.length, escaped: P.log.filter((e) => e.escaped).length, banner: document.querySelector('#banner .banner-title, #banner h1')?.textContent || '' }; });
    await log('14 s into the intro', JSON.stringify(r1));
    if (r1.pursuit || r1.escaped || r1.ordning < r0.ordning - 0.5) await bad(`smitintro: the chase went on into the intro (${JSON.stringify(r1)})`);
    // The next call after the day: not as the outro ends.
    const nt = await ev(() => __interrupt.nextT);
    await log('next call in', nt.toFixed(0), 's (while the mission runs)');
    if (nt < 39) await bad(`smitintro: a call is due ${nt.toFixed(0)} s after the mission`);
  };
  // The on-foot camera backed into the garage row (view_parking): it swings to the open side.
  sc.camtight2 = async () => {
    // Ove a step in front of the garage doors, facing along the row, the camera swung round
    // behind him into the garages (boom at its shortest, the wall filling the screen).
    const p = await L('parking');
    await ev((p) => { const g = __game; g.player.teleport(p.x, -20.6, Math.PI / 2); g.cam.yaw = Math.PI / 2 + 1.0; g.cam.pitch = 0.18; g.cam.snapNext = true; }, p);
    await frames(10);
    const b0 = await ev(() => ({ boom: +__game.cam.boom.toFixed(2), yaw: +__game.cam.yaw.toFixed(2) }));
    await shot('camtight2_0');
    await sleep(4000);
    const b1 = await ev(() => ({ boom: +__game.cam.boom.toFixed(2), yaw: +__game.cam.yaw.toFixed(2) }));
    await log('garage row: boom', JSON.stringify(b0), '-> after 4 s', JSON.stringify(b1));
    await shot('camtight2_1');
    if (b1.boom < 1.5) await bad(`camtight2: the camera stayed on the wall (boom ${b1.boom})`);
  };
  for (let n = 2; n <= 7; n++) sc['m' + n] = async () => { await fresh(`&mission=${n - 1}`); await D[n](); };
  return sc;
};
