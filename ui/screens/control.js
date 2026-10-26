// Mission Control: live, real-time (or faster / slower) simulation with 3D views, HUD, manual commands and live failure alerts.
import { h, clear, toast, fmt, fmtTime } from '../lib/dom.js';
import { panel, select, sceneStage, loop, statusBadge, emptyState } from '../lib/widgets.js';
import { Chart } from '../lib/charts.js';
import { launchIntro, rumbleFollow, stopRumbleNow } from '../lib/fx.js';
import { makeCockpit } from '../lib/cockpit.js';
import { makeHud, makeSimpleHud, removedAt, DebrisSet, installViewTools } from '../lib/flightdraw.js';
import { keyMoments, plainTime } from '../../src/core/plain-metrics.js';
import { APOLLO_MOMENTS } from '../../src/missions/apollo.js';
import { SPEEDS } from '../../src/core/recording.js';
import { validateVehicle } from '../../src/vehicles/analysis.js';
import { launchGate } from '../lib/missing.js';
import { cleanColumn } from '../../src/core/numfmt.js';
import { launchChecklist } from '../../src/core/needs.js';
import { syncMission, orbitWindow } from '../../src/core/consistency.js';

export default {
  id: 'control', title: 'Mission Control', fill: true,
  mount(root, app, params) {
    const layout = h('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0, 1fr) 320px' } });
    const main = h('div', { style: { display: 'grid', gridTemplateRows: '1fr auto auto auto', minHeight: 0 } });
    const side = h('div', { class: 'side', style: { padding: '0' } });
    layout.append(main, side); root.append(layout);
    const stage = sceneStage(app, { mode: 'chase' }); const view = stage.view;
    const hud = makeHud(); hud.el.classList.add('std-only'); stage.overlay.append(hud.el);
    const sHud = makeSimpleHud(); stage.overlay.append(sHud.el);
    const cockpit = makeCockpit(); stage.overlay.append(cockpit.el);
    const alerts = h('div', { class: 'hud-right' }); stage.overlay.append(alerts);
    const banner = h('div', { class: 'callout', style: { position: 'absolute', left: '50%', top: '50px', transform: 'translateX(-50%)', display: 'none', fontSize: '14px' } }); stage.overlay.append(banner);
    const slow = h('div', { class: 'callout warn mif-live-slow', id: 'live-slow', style: { display: 'none' } });
    stage.overlay.append(slow);
    const ribbon = h('div', { class: 'phase-ribbon', id: 'phase-ribbon' });
    const flightCallout = h('div', { class: 'flight-callout', id: 'flight-callout', style: { display: 'none' } }); stage.overlay.append(flightCallout);
    const bar = h('div', { class: 'control-bar' });
    const chartRow = h('div', { class: 'grid g2 std-only chart-row', style: { padding: '6px 10px', background: 'var(--panel-2)' } });
    const cAlt = h('canvas', { class: 'chart', style: { height: '128px' } }), cSpd = h('canvas', { class: 'chart', style: { height: '128px' } });
    chartRow.append(cAlt, cSpd);
    main.append(h('div', { style: { minHeight: 0, position: 'relative' } }, stage.el), chartRow, ribbon, bar);
    stage.el.style.height = '100%';
    const offViewTools = installViewTools({ overlay: stage.overlay, layout, hud: hud.el, cockpit: cockpit.el });
    const chA = new Chart(cAlt, { clean: true, title: 'Height', xLabel: '', dot: true, fill: true, yTicks: 3, xTicks: 5 }), chS = new Chart(cSpd, { clean: true, title: 'Speed', xLabel: '', dot: true, fill: true, yTicks: 3, xTicks: 5 });

    let live = app.live && !app.live.finished ? app.live : app.live;
    let shownVehicle = null, lastEvents = 0, lastUi = 0, lastChart = 0;
    const debris = new DebrisSet();

    async function start() {
      try {
        // vehicle and goal must belong together: pick (or, when nothing is named as missing, make) a goal that suits the vehicle
        const flagged = launchChecklist(app.project, {}).blocking.some((n) => n.id === 'mission-mismatch');
        const sm = await syncMission(app, { create: !flagged }); if (sm.changed) toast(sm.message, sm.ok ? 'ok' : 'warn', 5000);
        const v = app.project.vehicle;
        if (!launchGate(app, { onReady: start })) return; // explains what is missing and where to fix it
        // Live Flight flies the launch path that is saved in the mission (a tuned one if Launch it or Fix it found it); a failed flight offers "Fix it".
        live = app.startLive(); { const lv = live; lv.paused = true; launchIntro(stage.overlay).then(() => { if (live === lv) { lv.paused = false; buildBar(); } }); }
        banner.style.display = 'none'; debris.clear(); shownVehicle = null; lastEvents = 0; momentSig = ''; clear(momentsBox); buildSide(); buildBar();
      } catch (e) { toast(e.message, 'bad', 8000); }
    }


    // ---------------------------------------------------------------- flight phase ribbon + callouts
    // Phases are built from the mission's own events and completed by REAL sim events (sim.events) and the recorded dynamic pressure.
    const GROUP = (g) => (/^stage(\d+)$/.test(g ?? '') ? `Stage ${/^stage(\d+)$/.exec(g)[1]}` : (g ?? 'stage'));
    const TEXT = {
      liftoff: ['Liftoff!', 'Engines beat gravity. Up it goes.', 'L3-4'],
      maxq: ['Max-Q', 'The air squeezes the rocket most here.', 'L5-2'],
      separation: (n) => [`${n} done`, 'The empty stage drops off.', 'L3-3'],
      ignition: (n) => [`${n} burn`, 'The next engine lights.', 'L3-3'],
      fairing: ['Nose cover off', 'Not needed in thin air.', 'L5-1'],
      cutoff: ['Engine off', 'It coasts now.', 'L6-1'],
      burn: ['Orbit burn', 'A short push makes the orbit round.', 'L7-3'],
      orbit: ['Orbit reached!', 'It falls around Earth and misses it.', 'L7-1'],
      deploy: ['Payload released', 'The payload leaves the rocket.', 'L8-1'],
      land: ['Powered descent', 'The engine slows it for a soft landing.', 'L8-4'],
      generic: (n) => [n, 'A mission step just happened.', 'L10-3'],
      end: ['Mission end', 'The flight is over. See what happened.', 'L10-3'],
    };
    let phases = [], maxQ = { v: 0, t: 0, idx: 0 }, phaseScan = 0, phaseVehicle = null;
    function buildPhases(sim) {
      const mis = sim.mission, evs = mis.events ?? [], pad = mis.initial?.type === 'pad';
      const atm = !!sim.primary?.atmosphereModel?.hasAtmosphere;
      const P = [{ id: 'start', label: pad ? 'Pre-launch' : 'Start', done: true, t: 0, kind: 'start', info: ['Ready', 'All set.', 'L10-3'] }];
      if (mis.meta?.generator === 'apolloMission') {   // the Apollo mission has its own named timeline
        P.push({ id: 'liftoff', label: 'Liftoff', match: { kind: 'LIFTOFF' }, info: TEXT.liftoff }, { id: 'maxq', label: 'Max-Q', derived: 'maxq', info: TEXT.maxq });
        const short = { sep1: 'Stage 1 off', sep2: 'Stage 2 off', cutoff: 'Orbit', tli: 'Trans-lunar burn', transp: 'Docking', loi1: 'Lunar orbit', undock: 'Lander off', land: 'Descent', touchdown: 'Touchdown', liftoff: 'Lunar liftoff', ascCut: 'Orbit again', dock: 'Docked', tei: 'Trans-Earth burn', entry: 'Home' };
        for (const [id, lab] of Object.entries(short)) if (evs.some((e) => e.id === id)) P.push({ id, label: lab, match: { kind: 'EVENT', event: id }, info: [APOLLO_MOMENTS[id][0], APOLLO_MOMENTS[id][1], id === 'land' || id === 'touchdown' ? 'L8-4' : 'L7-3'] });
        P.push({ id: 'end', label: 'Mission end', derived: 'end', info: TEXT.end });
        return P;
      }
      if (pad) P.push({ id: 'liftoff', label: 'Liftoff', match: { kind: 'LIFTOFF' }, info: TEXT.liftoff });
      if (pad && atm) P.push({ id: 'maxq', label: 'Max-Q', derived: 'maxq', info: TEXT.maxq });
      let firstIgnite = pad, lastCut = -1;
      for (const ev of evs) {
        const a = ev.action ?? {}, m = { kind: 'EVENT', event: ev.id };
        if (a.type === 'IGNITE') { if (firstIgnite) { firstIgnite = false; continue; } const n = GROUP(a.group); P.push({ id: ev.id, label: `${n} burn`, match: m, info: TEXT.ignition(n) }); }
        else if (a.type === 'SEPARATE') { if (a.group === 'fairing') P.push({ id: ev.id, label: 'Nose off', match: m, info: TEXT.fairing }); else { const n = GROUP(a.group); P.push({ id: ev.id, label: `${n} done`, match: m, info: TEXT.separation(n) }); } }
        else if (a.type === 'SHUTDOWN') { P.push({ id: ev.id, label: 'Engine off', match: m, info: TEXT.cutoff }); lastCut = P.length; }
        else if (a.type === 'BURN') { P.push({ id: ev.id, label: /circular/i.test(ev.name ?? '') ? 'Orbit burn' : 'Burn', match: m, info: /circular/i.test(ev.name ?? '') ? TEXT.burn : [ev.name ?? 'Engine burn', 'The engine fires to change speed.', 'L7-3'] }); lastCut = P.length; }
        else if (a.type === 'DEPLOY_PAYLOAD') P.push({ id: ev.id, label: 'Payload out', match: m, info: TEXT.deploy });
        else if (a.type === 'LAND') P.push({ id: ev.id, label: 'Descent', match: m, info: TEXT.land });
      }
      if (mis.objective?.type === 'orbit') { const orbit = { id: 'orbit', label: 'Orbit', derived: 'orbit', info: TEXT.orbit }; if (lastCut > 0) P.splice(lastCut, 0, orbit); else P.push(orbit); }
      // generic fallback (rovers, probes, unusual missions): show the mission's own named events
      if (P.length < 4) for (const ev of evs) { if (P.some((p) => p.id === ev.id)) continue; const nm = String(ev.name ?? ev.id); P.push({ id: ev.id, label: nm.length > 22 ? nm.slice(0, 21) + '…' : nm, match: { kind: 'EVENT', event: ev.id }, info: TEXT.generic(nm) }); }
      P.push({ id: 'end', label: 'Mission end', derived: 'end', info: TEXT.end });
      return P;
    }
    function orbitReached(sim) {
      const o = sim.mission.objective ?? {}, n = sim.now;
      if (o.type !== 'orbit' || !Number.isFinite(n?.peri)) return false;
      const w = orbitWindow(o); // the same window the physics judges (src/core/orbit-goal.js)
      return n.peri >= w.minPeri && n.apo <= w.maxApo && n.ecc < 1;
    }
    let calloutTimer = null;
    function showCallout(info) {
      const [title, text, lesson] = info;
      clear(flightCallout).append(h('div', { class: 'fc-title' }, title), h('div', { class: 'fc-text std-only' }, text), h('button', { class: 'btn small', id: 'fc-what', title: text, onclick: () => app.navigate('academy', { lesson }) }, app.settings.mode === 'beginner' ? '?' : 'Learn more'));
      flightCallout.style.display = 'block'; flightCallout.classList.remove('pop'); void flightCallout.offsetWidth; flightCallout.classList.add('pop');
      clearTimeout(calloutTimer); calloutTimer = setTimeout(() => { flightCallout.style.display = 'none'; }, 7000);
    }
    function updatePhases(sim, quiet = false) {
      if (phaseVehicle !== sim) { phaseVehicle = sim; phases = buildPhases(sim); phaseScan = 0; maxQ = { v: 0, t: 0, idx: 0 }; quiet = true; flightCallout.style.display = 'none'; }
      const fresh = [];
      const done = (p, t) => { if (p.done) return; p.done = true; p.t = t; if (!quiet) fresh.push(p); };
      // recorded dynamic pressure: Max-Q is passed once q has fallen well below its recorded peak
      const tel = sim.telemetry, n = tel.count;
      if (n > maxQ.idx) { const q = tel.column('q'), tt = tel.column('t'); for (let i = maxQ.idx; i < n; i++) if (q[i] > maxQ.v) { maxQ.v = q[i]; maxQ.t = tt[i]; } maxQ.idx = n; const cur = q[n - 1]; const mq = phases.find((p) => p.derived === 'maxq'); if (mq && !mq.done && maxQ.v > 2000 && cur < 0.9 * maxQ.v) done(mq, maxQ.t); }
      for (; phaseScan < sim.events.length; phaseScan++) {
        const e = sim.events[phaseScan];
        for (const p of phases) { if (p.done || !p.match || e.kind !== p.match.kind) continue; if (p.match.event && e.data?.event !== p.match.event) continue; done(p, e.t); }
      }
      const orb = phases.find((p) => p.derived === 'orbit'); if (orb && !orb.done && orbitReached(sim)) done(orb, sim.t);
      const end = phases.find((p) => p.derived === 'end'); if (end && !end.done && sim.finished) done(end, sim.t);
      let cur = 0; phases.forEach((p, i) => { if (p.done) cur = i; });
      clear(ribbon).append(h('span', { class: 'pr-title std-only' }, 'Flight phase'), phases.map((p, i) => h('span', { class: `pr-chip ${p.done ? (i === cur ? 'current' : 'done') : ''}`, 'data-phase': p.id, title: p.info?.[1] ?? '' }, p.label)));
      { const c = ribbon.querySelector('.current'); if (c) ribbon.scrollLeft = Math.max(0, c.offsetLeft - ribbon.clientWidth / 2 + c.clientWidth / 2); }
      // several events in one frame (fast time): announce the most important one (a separation beats the next ignition)
      const weight = (p) => (/done$|off$/.test(p.label) ? 2 : /burn$/.test(p.label) && p.match ? 0 : 1);
      const pick = fresh.filter((p) => p.id !== 'start' && p.id !== 'end').sort((a, b) => weight(a) - weight(b)).pop();
      if (pick) showCallout(pick.info);
    }

    // ---------------------------------------------------------------- bottom bar
    function buildBar() {
      clear(bar);
      const running = live && !live.finished;
      const speedBtns = h('span', { class: 'fd-speeds', id: 'live-speeds' }, h('span', { class: 'muted' }, 'Faster'), (((app.project.mission?.maxTime ?? 0) > 86400) ? [1, 10, 100, 1000, 10000] : [1, 5, 20]).map((sp) => h('button', { class: `btn ${live?.speed === sp ? 'active' : ''}`, 'data-speed': sp, title: `${sp} s of flight per second`, onclick: () => { if (live) live.setSpeed(sp); buildBar(); } }, `${sp}×`)));
      bar.append(
        h('button', { class: 'btn primary', id: 'live-start', onclick: start, disabled: running }, live ? 'Restart' : 'Start'),
        h('button', { class: 'btn', id: 'live-pause', disabled: !running, onclick: () => { live.paused = !live.paused; buildBar(); } }, live?.paused ? 'Resume' : 'Pause'),
        h('button', { class: 'btn std-only', id: 'live-step', title: 'Pause first, then advance the flight one second at a time', disabled: !running, onclick: () => { live.paused = true; live.step(1); buildBar(); frame(0, performance.now()); } }, 'Step 1 s'),
        h('button', { class: 'btn danger', disabled: !running, onclick: () => live.stop() }, 'Stop'),
        speedBtns,
        select([...new Set([...SPEEDS.filter((s) => s <= 10000), live?.speed ?? 1])].sort((x, y) => x - y).map((s) => [s, `${s}×`]), live?.speed ?? 1, (x) => { if (live) live.setSpeed(+x); buildBar(); }, { id: 'live-speed', title: 'More speeds', class: 'input std-only' }),
        h('span', { id: 'live-rtf', class: 'muted mono' }, ''),
        h('span', { style: { flex: 1 } }),
        live?.finished ? [h('button', { class: 'btn primary', onclick: () => app.navigate('analysis') }, app.settings.mode === 'beginner' ? 'See report' : 'Analysis'), h('button', { class: 'btn', onclick: () => app.navigate('replay') }, 'Replay')] : null);
    }

    // ---------------------------------------------------------------- side: commands + log + failures
    const cmdBox = h('div', { class: 'form adv-only' }), momentsBox = h('div', { class: 'fd-feed', id: 'fd-feed' }, h('div', { class: 'muted' }, 'Moments show up here.')), logBox = h('div', { class: 'std-only', style: { padding: '0 14px 12px', fontSize: '12.5px' } }), failBox = h('div', { style: { padding: '0 14px 8px', display: 'grid', gap: '6px' } });
    function buildSide() {
      clear(side);
      side.append(panelHead('Key moments'), momentsBox, panelHead('Manual commands', 'adv-only'), cmdBox, panelHead('Problems', ''), failBox, panelHead('Event log', 'std-only'), logBox);
      clear(cmdBox);
      const v = live?.sim.vehicleDef ?? app.project.vehicle;
      if (!v) { cmdBox.append(h('p', { class: 'muted' }, 'No vehicle.')); return; }
      const running = live && !live.finished;
      const groups = [...new Set(v.components.map((c) => c.group).filter(Boolean))];
      const engineGroups = [...new Set(v.components.filter((c) => c.kind === 'engine').map((c) => c.group))];
      const send = (a, label) => { if (!running) return toast('Start the flight first.', 'bad'); live.command(a); toast(`Command sent: ${label}`); };
      cmdBox.append(h('div', { class: 'note info' }, 'Commands are recorded, so the run can be repeated. Mission events keep running.'));
      for (const g of engineGroups) cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, g), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'IGNITE', group: g }, `ignite ${g}`) }, 'Ignite'), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'SHUTDOWN', group: g }, `shut down ${g}`) }, 'Shut down'), /^stage\d+$/.test(g) ? h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'SEPARATE', group: g }, `separate ${g}`) }, 'Separate') : null));
      if (groups.includes('fairing')) cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'fairing'), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'SEPARATE', group: 'fairing' }, 'jettison fairing') }, 'Jettison')));
      if (groups.includes('payload')) cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'payload'), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'DEPLOY_PAYLOAD', group: 'payload' }, 'deploy payload') }, 'Deploy payload'), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'DEPLOY', target: 'all' }, 'deploy appendages') }, 'Deploy panels')));
      if (groups.includes('rover')) cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'rover'), h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'DEPLOY_ROVER', group: 'rover' }, 'deploy rover') }, 'Deploy rover')));
      const thr = h('input', { type: 'range', min: 0, max: 100, value: 100, class: 'scrub', style: { width: '140px' }, disabled: !running });
      const thrLbl = h('span', { class: 'muted' }, '100%');
      thr.addEventListener('input', () => (thrLbl.textContent = `${thr.value}%`)); thr.addEventListener('change', () => send({ type: 'THROTTLE', value: thr.value / 100 }, `throttle ${thr.value}%`));
      cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'throttle'), thr, thrLbl));
      const gsel = select(['prograde', 'retrograde', 'sun_point', 'earth_point', 'hold', 'radial', 'nadir'], 'prograde');
      cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'attitude'), gsel, h('button', { class: 'btn small', disabled: !running, onclick: () => send({ type: 'SET_GUIDANCE', mode: gsel.value }, `guidance ${gsel.value}`) }, 'Set')));
      cmdBox.append(h('div', { class: 'row' }, h('span', { style: { width: '62px' } }, 'mission'), h('button', { class: 'btn small danger', disabled: !running, onclick: () => send({ type: 'END_MISSION', status: 'ABORTED' }, 'abort mission') }, 'Abort mission')));
    }
    const panelHead = (t, cls = '') => h('div', { class: `panel-head ${cls}`, style: { borderTop: '1px solid var(--line)' } }, h('h3', null, t));

    // ---------------------------------------------------------------- per-frame
    function frame(dt, now) {
      if (!view) return;
      if (live) {
        const wasRunning = !live.finished;
        live.advance(dt);
        if (wasRunning && live.finished) { buildBar(); buildSide(); showResult(); }
        if (shownVehicle !== live.sim.vehicleDef) { view.setVehicle(live.sim.vehicleDef); shownVehicle = live.sim.vehicleDef; }
        const sim = live.sim, f = sim.now;
        if (!f || f.x === undefined) return;
        view.drawFlight({ frame: f, removed: sim.fv.removedGroups, bodyId: sim.primary.id, time: (sim.env.epoch ?? 0) + sim.t, site: { lat: sim.env.site?.lat ?? 0, lon: sim.env.site?.lon ?? 0 }, traj: { tel: sim.telemetry, idx: sim.telemetry.count - 1 }, thrustRef: live.thrustRef, flame: true, debris: debris.sync(sim.separations).forView(sim.t), orbit: { mu: sim.primary.mu }, cgX: sim.fv.mp.cg, choreo: sim.choreo ? { id: sim.choreo.id, p: Math.max(0, Math.min(1, (sim.t - sim.choreo.t0) / sim.choreo.duration)) } : null, deployed: sim.fv.deployed, chute: Math.max(0, ...(sim.fv.parachutes ?? []).map((p) => p.inflation || 0)), chuteCdA: (sim.fv.parachutes ?? []).reduce((a, p) => a + (p.inflation || 0) * (sim.fv.byId.get(p.id)?.dragArea ?? 0), 0) }, now);
        cockpit.update(f, { events: sim.events.map((e) => ({ t: e.t, label: String(e.message ?? '').slice(0, 44) })), total: Math.max(600, Math.ceil(f.t / 60) * 60 * 1.2), fuelFrac: (() => { const p0 = sim.telemetry.column('propMass')[0]; return p0 > 0 ? f.propMass / p0 : NaN; })() });
        rumbleFollow(f, !live.paused && !live.finished);
        if (now - lastUi > 120) { lastUi = now; hud.update(f); uiUpdate(sim); }
        if (now - lastChart > 600) { lastChart = now; charts(sim); }
      } else { view.drawFlight({ frame: null }, now); }
    }
    // Is the computer too slow to fly in real time? Measured over about 1.5 s of wall time: simulated seconds gained / seconds we should have gained.
    let rtfRef = null;
    function checkSlow(sim) {
      const nowW = performance.now();
      if (!live || live.paused || live.finished || document.hidden || (app.project.mission?.maxTime ?? 0) > 86400) { rtfRef = null; slow.style.display = 'none'; return; }   // long missions slow themselves down (LiveRun.perfCap)
      if (!rtfRef || rtfRef.live !== live || rtfRef.speed !== live.speed) { rtfRef = { live, speed: live.speed, w: nowW, t: sim.t, bad: 0 }; return; }
      const dw = nowW - rtfRef.w; if (dw < 1500) return;
      if (dw > 6000) { rtfRef = { live, speed: live.speed, w: nowW, t: sim.t, bad: 0 }; return; }
      const rtf = (sim.t - rtfRef.t) / ((dw / 1000) * live.speed);
      rtfRef.w = nowW; rtfRef.t = sim.t; rtfRef.bad = rtf < 0.8 ? rtfRef.bad + 1 : 0;
      if (rtfRef.bad >= 2 && live.speed < 20) {
        clear(slow).append(h('b', null, 'Your computer is slow. Press 20x or Run fast.'),
          h('button', { class: 'btn small primary', id: 'live-slow-20', onclick: () => { live.setSpeed(20); slow.style.display = 'none'; buildBar(); } }, '20x'),
          h('button', { class: 'btn small', id: 'live-slow-fast', onclick: runFastInstead }, 'Run fast'));
        slow.style.display = 'flex';
      } else if (rtf >= 0.9 || live.speed >= 20) slow.style.display = 'none';
    }
    async function runFastInstead() {
      slow.style.display = 'none';
      if (live && !live.finished) live.dispose();
      live = null; app.live = null; buildBar();
      toast('Flying it fast instead...', 'info', 4000);
      const r = await app.runFast({ tune: app.project.mission?.guidance?.mode === 'ascent' });
      if (!r.ok) toast(r.message, 'bad', 8000);
      app.navigate('simulation');
    }
    function uiUpdate(sim) {
      checkSlow(sim);
      const rtf = document.getElementById('live-rtf'); if (rtf) rtf.textContent = live.paused ? 'paused' : live.finished ? 'finished' : live.note || (live.effectiveSpeed !== live.speed ? `Running at ${fmt(live.effectiveSpeed, 0)}×` : '');
      updatePhases(sim);
      { const cur = phases.filter((p) => p.done).pop(); const p0 = sim.telemetry.column('propMass')[0]; sHud.update(sim.now, cur ? FRIENDLY(cur.label) : '', p0 > 0 ? sim.now.propMass / p0 : NaN, sim.activeFuel()); }
      momentsUpdate(sim);
      if (sim.events.length !== lastEvents) {
        lastEvents = sim.events.length; clear(logBox);
        for (const e of sim.events.slice(-40).reverse()) logBox.append(h('div', { style: { padding: '2px 0', borderBottom: '1px solid var(--line)' } }, h('span', { class: 'mono muted' }, fmtTime(e.t) + ' '), e.message));
      }
      clear(failBox);
      const recs = [...sim.monitor.records.values()];
      if (!recs.length) failBox.append(h('div', { class: 'callout ok' }, 'No problems.'));
      for (const r of recs.slice(-5)) failBox.append(h('div', { class: 'callout bad' }, h('b', null, `${r.title} `), `(T+${fmt(r.t, 0)} s)`, h('div', { class: 'muted std-only' }, r.primaryCause ?? '')));
      clear(alerts);
      for (const r of recs.slice(-2)) alerts.append(h('div', { class: 'callout bad' }, r.title));
    }
    const FRIENDLY = (l) => ({ 'Pre-launch': 'Ready', Orbit: 'In orbit!', 'Mission end': 'Done' }[l] ?? l);
    let momentSig = '';
    function momentsUpdate(sim) {
      const ms = keyMoments(sim.events, sim.telemetry, { moments: sim.mission.meta?.generator === 'apolloMission' ? APOLLO_MOMENTS : null, objective: sim.mission.objective, failures: [...sim.monitor.records.values()].map((r) => ({ t: r.t, title: r.title })) });
      const sig = ms.map((m) => m.label).join('|'); if (sig === momentSig) return; momentSig = sig;
      clear(momentsBox);
      if (!ms.length) momentsBox.append(h('div', { class: 'muted' }, 'Moments show up here.'));
      for (const m of ms.slice().reverse()) momentsBox.append(h('div', { class: `fd-feed-item ${m.kind}`, title: m.text }, h('b', null, `T+${plainTime(m.t)}`), h('span', null, m.label)));
    }
    function charts(sim) {
      const tel = sim.telemetry; if (tel.count < 3) return;
      const t = tel.column('t');
      chA.setData(t, [{ id: 'alt', label: 'Height', unit: 'm', values: cleanColumn(tel.column('alt')) }]); chS.setData(t, [{ id: 'surfSpeed', label: 'Speed over ground', unit: 'km/h', values: cleanColumn(tel.column('surfSpeed'), 0.005, 3.6) }]);
    }
    function showResult() {
      const r = live.sim.result;
      banner.style.display = 'block'; banner.className = `callout ${r.status === 'SUCCESS' ? 'ok' : 'bad'}`; clear(banner).append(statusBadge(r.status), app.settings.mode === 'beginner' ? ' ' : ` ${r.reason}  `, h('button', { class: 'btn small', onclick: () => app.navigate('analysis') }, 'Analysis'), ' ', h('button', { class: 'btn small', onclick: () => app.navigate('replay') }, 'Replay'), r.status === 'SUCCESS' ? null : [' ', h('button', { class: 'btn small primary', id: 'live-fix', title: 'Changes the rocket and flies it again', onclick: () => app.navigate('simulation') }, 'Fix it')]);
      toast(`Done: ${r.status}. ${r.reason}`, r.status === 'SUCCESS' ? 'ok' : 'bad', 8000);
    }

    buildSide(); buildBar();
    if (!live && params?.autostart) start();
    else if (live?.finished) showResult();
    if (live) updatePhases(live.sim, true);
    else clear(ribbon).append(h('span', { class: 'pr-title' }, 'Flight phase'), h('span', { class: 'muted' }, 'Press Start.'));
    const stop = loop(frame, app.settings.maxFps);
    const off = app.on('design', () => { if (!live || live.finished) buildSide(); });
    return () => { stop(); off(); offViewTools(); stopRumbleNow(); clearTimeout(calloutTimer); };
  },
};
