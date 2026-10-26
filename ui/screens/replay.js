// Replay: play / pause / restart / scrub / 0.1x .. 100x over a recorded run, with 3D view, HUD, synchronised graphs and event list.
import { h, clear, toast, fmt, fmtTime } from '../lib/dom.js';
import { select, sceneStage, loop, statusBadge } from '../lib/widgets.js';
import { Chart } from '../lib/charts.js';
import { makeCockpit } from '../lib/cockpit.js';
import { makeHud, makeSimpleHud, removedAt, thrustRefOf, DebrisSet, installViewTools } from '../lib/flightdraw.js';
import { keyMoments, plainTime } from '../../src/core/plain-metrics.js';
import { Replay, SPEEDS, verifyReproducible } from '../../src/core/recording.js';
import { listBodies } from '../../physics/bodies.js';
import { computeMassProperties } from '../../physics/vehicle-model.js';
import { runSelect, currentRunId, noRunHint } from '../lib/runpick.js';
import { CHANNEL_META } from '../../physics/telemetry.js';
import { plainOf } from '../lib/channel-plain.js';
import { cleanColumn } from '../../src/core/numfmt.js';

export default {
  id: 'replay', title: 'Replay', fill: true,
  mount(root, app, params) {
    let offTools = null;
    const S = { runId: currentRunId(app, params), rp: null, record: null, tel: null, model: null };
    const wrap = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 300px', height: '100%', minHeight: 0 } });
    root.append(wrap);
    let stop = null, disposed = false, lastUi = 0, lastVehicle = null, cg0 = null, chartsEl = [];

    async function open(id) {
      S.runId = id; S.rp = null; S.record = null; S.tel = null;
      if (id) {
        try {
          const r = await app.getRun(id); S.record = r.record; S.tel = r.telemetry;
          S.rp = new Replay({ telemetry: r.telemetry, events: r.record.events ?? [], result: r.record.result });
          app.selectedRun = id;
          try { cg0 = computeMassProperties(r.record.vehicle).cg; } catch { cg0 = null; }
        } catch (e) { toast(`Cannot open it: ${e.message}`, 'bad', 8000); }
      }
      if (!disposed) build();
    }

    function build() {
      stop?.(); stop = null; clear(wrap); chartsEl = [];
      if (!S.rp) {
        wrap.style.gridTemplateColumns = '1fr';
        wrap.append(h('div', { style: { padding: '30px' } }, h('div', { class: 'row', style: { marginBottom: '12px' } }, h('h2', null, 'Replay'), app.project.runs.length ? runSelect(app, S.runId, open) : null), noRunHint(app)));
        return;
      }
      wrap.style.gridTemplateColumns = '1fr 300px';
      const { rp, record, tel } = S;
      const main = h('div', { style: { display: 'grid', gridTemplateRows: '1fr auto auto', minHeight: 0 } });
      const side = h('div', { class: 'side' });
      wrap.append(main, side);
      const stage = sceneStage(app, { mode: 'chase' }); const view = stage.view;
      stage.el.style.height = '100%';
      const hud = makeHud(); hud.el.classList.add('std-only'); stage.overlay.append(hud.el);
      const cockpit = makeCockpit(); stage.overlay.append(cockpit.el);
      const sHud = makeSimpleHud(); stage.overlay.append(sHud.el);
      const moments = keyMoments(record.events ?? [], tel, { objective: record.mission?.objective, failures: record.result?.failures ?? [], status: record.result?.status });
      const fuel0 = tel.column('propMass')[0];
      const res = record.result ?? {};
      const verdict = h('div', { class: `callout ${res.status === 'SUCCESS' ? 'ok' : 'bad'}`, style: { position: 'absolute', right: '10px', top: '46px', maxWidth: '300px' } }, statusBadge(res.status), h('span', { class: 'std-only' }, ' ', res.reason ?? ''));
      const evPop = h('div', { class: 'hud-right', style: { top: '92px' } });
      stage.overlay.append(verdict, evPop);
      offTools?.(); offTools = installViewTools({ overlay: stage.overlay, layout: wrap, hud: hud.el, cockpit: cockpit.el });
      // ---- graphs
      const cA = h('canvas', { class: 'chart', style: { height: '124px' } }), cB = h('canvas', { class: 'chart', style: { height: '124px' } });
      const chartRow = h('div', { class: 'grid g2 chart-row', style: { padding: '6px 10px 0', background: 'var(--panel-2)' } }, cA, cB);
      const t = tel.column('t');
      const markers = rp.markers().map((m) => ({ t: m.t })).concat((res.failures ?? []).map((f) => ({ t: f.t, color: 'rgba(255,92,106,.7)' })));
      const chA = new Chart(cA, { clean: true, title: '', xLabel: '', yTicks: 3, xTicks: 5, fill: true }), chB = new Chart(cB, { clean: true, title: '', xLabel: '', yTicks: 3, xTicks: 5 });
      const isRover = (record.vehicle.type ?? '') === 'rover';
      const simple = app.settings.mode === 'beginner';
      const defsA = isRover ? [['odometer'], ['groundSpeed', 'slip']] : [['alt'], simple ? ['speed'] : ['speed', 'vSpeed']];
      const mk = (ids) => ids.map((id) => (simple && id === 'speed' ? { id, label: 'Speed over ground', unit: 'km/h', values: cleanColumn(tel.column('surfSpeed'), 0.005, 3.6) } : { id, label: id === 'speed' ? 'Speed in space (inertial)' : plainOf(id, CHANNEL_META[id].label).name, unit: CHANNEL_META[id].unit, values: cleanColumn(tel.column(id)) }));
      chA.setData(t, mk(defsA[0]), markers); chB.setData(t, mk(defsA[1]), markers); chA.showMarkers = chB.showMarkers = true; chA.draw(); chB.draw();
      for (const c of [chA, chB]) c.onSeek = (x) => { rp.seek(x); };
      chartsEl = [chA, chB];
      // ---- controls
      const scrub = h('input', { type: 'range', class: 'scrub', min: 0, max: 1000, value: 0, id: 'rp-scrub', style: { flex: 1, minWidth: '160px', width: 'auto' } });
      scrub.addEventListener('input', () => rp.seekFraction(scrub.value / 1000));
      const playBtn = h('button', { class: 'btn primary', id: 'rp-play', onclick: () => { rp.toggle(); sync(); } }, 'Play');
      const timeLbl = h('span', { class: 'mono', id: 'rp-time', style: { minWidth: '150px' } }, '');
      const spd = select([...new Set([...SPEEDS, rp.speed])].sort((x, y) => x - y).map((v) => [v, `${v}×`]), rp.speed, (x) => { rp.setSpeed(+x); syncSpeed(); }, { id: 'rp-speed', title: 'More speeds', class: 'input std-only' });
      const speedBtns = h('span', { class: 'fd-speeds' }, [1, 5, 20].map((v) => h('button', { class: 'btn', 'data-speed': v, onclick: () => { rp.setSpeed(v); spd.value = String(v); syncSpeed(); } }, `${v}×`)));
      const syncSpeed = () => speedBtns.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === rp.speed));
      const loopCb = h('input', { type: 'checkbox', onchange: (e) => (rp.loop = e.target.checked) });
      const bar = h('div', { class: 'control-bar' },
        playBtn, h('button', { class: 'btn', id: 'rp-restart', onclick: () => { rp.restart(); sync(); } }, 'Restart'),
        h('button', { class: 'btn small std-only', title: 'Back 5 s', onclick: () => rp.seek(rp.t - 5) }, '−5 s'), h('button', { class: 'btn small std-only', title: 'Forward 5 s', onclick: () => rp.seek(rp.t + 5) }, '+5 s'),
        h('span', { class: 'muted' }, 'Faster'), speedBtns, spd, h('label', { class: 'row std-only', style: { gap: '4px' } }, loopCb, h('span', { class: 'muted' }, 'loop')),
        timeLbl, scrub);
      syncSpeed();
      // scrub-bar markers
      const markBar = h('div', { style: { position: 'relative', height: '8px', margin: '0 12px', background: 'var(--panel-2)' } });
      for (const m of rp.markers()) markBar.append(h('div', { title: `${fmtTime(m.t)} ${moments.find((x) => Math.abs(x.t - m.t) < 1.5)?.label ?? m.label}`, style: { position: 'absolute', left: `${((m.t - rp.t0) / Math.max(rp.duration - rp.t0, 1e-9)) * 100}%`, top: 0, width: '2px', height: '8px', background: '#7f958c' } }));
      for (const f of res.failures ?? []) markBar.append(h('div', { title: `${fmtTime(f.t)} ${f.title}`, style: { position: 'absolute', left: `${((f.t - rp.t0) / Math.max(rp.duration - rp.t0, 1e-9)) * 100}%`, top: 0, width: '3px', height: '8px', background: 'var(--bad)' } }));
      main.append(h('div', { style: { minHeight: 0, position: 'relative' } }, stage.el), h('div', null, chartRow, markBar), bar);
      // ---- side: events + failures
      const evBox = h('div', { style: { padding: '0 0 12px' } });
      const momBox = h('div', { class: 'fd-rp-list', id: 'rp-moments' }, moments.length ? moments.map((m) => h('div', { class: 'tree' }, h('div', { class: `item ${m.kind === 'problem' ? 'bad' : ''}`, style: { paddingLeft: '14px' }, title: m.text, onclick: () => rp.seek(m.t) }, h('span', { class: 'mono muted' }, plainTime(m.t)), h('span', null, m.label)))) : h('div', { class: 'muted', style: { padding: '4px 14px' } }, 'No big moments.'));
      side.append(h('div', { class: 'panel-head' }, h('h3', null, 'This flight')), h('div', { style: { padding: '8px 14px 0' } }, Object.assign(runSelect(app, S.runId, open), { style: 'width:100%;max-width:100%' })), h('div', { style: { padding: '8px 14px', fontSize: '12.5px' } }, h('b', null, record.name), h('div', { class: 'muted std-only' }, `${record.vehicle.name} · ${record.mission.name}`), h('div', { class: 'muted std-only' }, `${tel.count.toLocaleString()} samples · ${fmt(rp.duration, 0)} s`), h('div', { class: 'muted mono std-only', id: 'rp-fp', style: { fontSize: '11px', wordBreak: 'break-all' }, title: 'Fingerprint of the vehicle, mission, weather and settings. The same inputs always give the same fingerprint.' }, record.fingerprint ? `inputs ${record.fingerprint.inputs} · results ${record.fingerprint.results}` : 'no fingerprint (older run)'), h('button', { class: 'btn small std-only', id: 'rp-verify', style: { marginTop: '6px', marginRight: '6px' }, title: 'Fly this run again from its recorded inputs and check that every sample is identical', onclick: (e) => { e.target.disabled = true; e.target.textContent = 'Re-running…'; setTimeout(() => { let r; try { r = verifyReproducible(record, tel); } catch (er) { r = { ok: false, reason: er.message }; } e.target.disabled = false; e.target.textContent = 'Re-run and verify'; toast(r.ok ? 'Verified: the re-run is identical, sample for sample.' : `Not identical: ${r.reason}`, r.ok ? 'ok' : 'bad', 8000); }, 60); } }, 'Re-run and verify'), h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => app.navigate('analysis', { runId: S.runId }) }, app.settings.mode === 'beginner' ? 'Report card' : 'Open analysis')),
        h('div', { class: 'panel-head' }, h('h3', null, 'Key moments')), momBox,
        (res.failures ?? []).length ? h('div', null, h('div', { class: 'panel-head' }, h('h3', null, 'Problems')), h('div', { style: { padding: '6px 14px', display: 'grid', gap: '6px' } }, res.failures.map((f) => h('div', { class: 'callout bad', style: { cursor: 'pointer' }, onclick: () => rp.seek(f.t - 1) }, h('b', null, f.title), ` ${fmtTime(f.t)}`, h('div', { class: 'muted std-only' }, f.primaryCause ?? ''))))) : null,
        h('div', { class: 'std-only' }, h('div', { class: 'panel-head' }, h('h3', null, 'All events')), evBox));
      for (const e of record.events ?? []) if (e.kind !== 'EVENT_DONE' || /complete|reached/i.test(e.message)) evBox.append(h('div', { class: 'tree' }, h('div', { class: 'item', style: { paddingLeft: '14px' }, onclick: () => rp.seek(e.t) }, h('span', { class: 'mono muted' }, fmtTime(e.t)), h('span', null, e.message))));

      const sync = () => { playBtn.textContent = rp.playing ? 'Pause' : 'Play'; };
      const bodyAt = (idx) => listBodies()[idx]?.id ?? record.environment?.body ?? 'earth';
      const thrustRef = thrustRefOf(record.vehicle);
      const seps = record.result?.summary?.separations ?? [];
      const debris = new DebrisSet().sync(seps);
      let lastEvIdx = -1;
      const ckEvents = moments.map((m) => ({ t: m.t, label: m.label, bad: m.kind === 'problem' }));
      stop = loop((dt, now) => {
        rp.tick(dt);
        if (!rp.playing && playBtn.textContent === 'Pause') sync();
        const f = rp.frame();
        if (view) {
          if (lastVehicle !== record.vehicle) { view.setVehicle(record.vehicle); lastVehicle = record.vehicle; }
          view.drawFlight({ frame: f, removed: removedAt(record.vehicle, seps, rp.t), bodyId: bodyAt(Math.round(f.primary)), time: (record.environment?.epoch ?? 0) + rp.t, site: { lat: record.environment?.site?.lat ?? 0, lon: record.environment?.site?.lon ?? 0 }, traj: { tel, idx: tel.indexAt(rp.t) }, thrustRef, flame: true, debris: debris.forView(rp.t), orbit: { mu: (listBodies()[Math.round(f.primary)] ?? {}).mu }, cgX: cg0 ?? undefined }, now);
        }
        cockpit.update(f, { events: ckEvents, total: rp.duration, fuelFrac: fuel0 > 0 ? f.propMass / fuel0 : NaN });
        if (now - lastUi > 80) {
          lastUi = now; hud.update(f); { const cur = moments.filter((m) => m.t <= rp.t).pop(); sHud.update(f, cur ? cur.label : 'Ready', fuel0 > 0 ? f.propMass / fuel0 : NaN); } timeLbl.textContent = `${fmtTime(rp.t)} / ${fmtTime(rp.duration)}`;
          if (document.activeElement !== scrub) scrub.value = Math.round(rp.fraction * 1000);
          for (const c of chartsEl) c.setCursor(rp.t);
          // most recent event popup
          const evs = rp.eventsUpTo(); const last = evs.filter((e) => e.kind !== 'EVENT_DONE').pop();
          const idx = last ? evs.indexOf(last) : -1;
          if (idx !== lastEvIdx) { lastEvIdx = idx; clear(evPop); if (last && rp.t - last.t < 6) evPop.append(h('div', { class: 'callout std-only' }, last.message), h('div', { class: 'callout beginner-only' }, moments.find((m) => Math.abs(m.t - last.t) < 1.5)?.label ?? last.message)); }
          else if (last && rp.t - last.t >= 6 && evPop.firstChild) clear(evPop);
        }
      }, app.settings.maxFps);
      sync();
    }
    open(S.runId);
    const off = app.on('run-deleted', () => open(currentRunId(app, {})));
    const onKey = (e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return; if (e.code === 'Space' && S.rp) { e.preventDefault(); S.rp.toggle(); } };
    window.addEventListener('keydown', onKey);
    // expose for automated tests
    window.__replay = () => S.rp;
    return () => { disposed = true; stop?.(); off(); offTools?.(); window.removeEventListener('keydown', onKey); delete window.__replay; };
  },
};
