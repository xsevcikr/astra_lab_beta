// Validation: three real rockets rebuilt from published numbers, flown in the simulator and compared with the published results.
// Nothing here is scripted: the comparison rows come from src/core/validation.js (real simulation + telemetry).
import { h, clear } from '../lib/dom.js';
import { panel } from '../lib/widgets.js';
import { assumptionsPanel } from '../lib/assumptions.js';
import { VALIDATION_VEHICLES, TOLERANCE_NOTE, runValidationFlightAsync, findMaxPayload, summariseRows, compareRows, sunSynchronousInclination } from '../../src/core/validation.js';
import { deltaVBudget } from '../../physics/mission-design.js';
import { MISSION_CASES, runMissionCase } from '../../src/core/mission-validation.js';

const nf = (v, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
// mission elapsed time as in the flight reports (h:mm:ss), e.g. landing 102:45:40
const met = (s) => { const t = Math.round(s); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export function fmtValue(unit, v) {
  if (v == null || !Number.isFinite(v)) return '–';
  switch (unit) {
    case 's': return v >= 60 ? `${nf(v, 1)} s (${clock(v)})` : `${nf(v, 1)} s`;
    case 'm': return Math.abs(v) >= 1000 ? `${nf(v / 1000, 1)} km` : `${nf(v, 0)} m`;
    case 'm/s': return `${nf(v, 0)} m/s`;
    case 'kg': return `${nf(v, 0)} kg`;
    case 'N': return Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 2)} MN` : `${nf(v / 1e3, 1)} kN`;
    case '': return nf(v, 1);
    default: return `${nf(v, 1)} ${unit}`;
  }
}
const pct = (e) => (e == null ? '–' : `${e >= 0 ? '+' : '−'}${Math.abs(e * 100).toFixed(1)}%`);
const GROUPS = [['build', 'Did we build it right?', 'The rocket was built from published numbers. These rows check the build.'], ['trajectory', 'Flight events', 'Times, heights and speeds during the flight.'], ['orbit', 'Orbit reached', ''], ['capability', 'How much can it lift?', '']];
const LIGHT = { pass: ['ok', 'matches'], fail: ['bad', 'off'], context: ['muted', 'for context'], missing: ['muted', 'not measured'] };

// results survive a re-render (switching detail level re-mounts the screen); they are recomputed by pressing the button again
const CACHE = { results: {}, maxPay: {}, missions: {} };

export default {
  id: 'validation', title: 'Validation',
  mount(root, app) {
    const page = h('div', { class: 'page', id: 'val-page' }); root.append(page);
    const S = { results: CACHE.results, running: null, stop: false, maxPay: CACHE.maxPay };
    const alive = () => !S.stop;

    async function fly(id) {
      if (S.running) return;
      S.running = id; S.progress = 0; render();
      try {
        const res = await runValidationFlightAsync(id, { onProgress: (p) => { S.progress = p.t; const el = document.getElementById(`val-prog-${id}`); if (el) el.textContent = `Flying… T+${Math.round(p.t)} s`; }, shouldStop: () => S.stop });
        if (alive()) S.results[id] = res;
      } catch (e) { S.results[id] = { error: e.message }; }
      S.running = null; if (alive()) render();
    }
    async function runAll() { for (const V of VALIDATION_VEHICLES) { if (!alive()) return; await fly(V.id); } }
    async function payload(id) {
      if (S.running) return;
      S.running = id; S.maxPay[id] = { busy: true }; render();
      const r = await findMaxPayload(id, { onProgress: (p) => { const el = document.getElementById(`val-prog-${id}`); if (el) el.textContent = `Test flight ${p.tests} (${nf(p.payload)} kg)…`; }, shouldStop: () => S.stop });
      S.maxPay[id] = r; S.running = null;
      // fold the answer into the table
      const res = S.results[id];
      if (res && r.maxPayload != null) { res.metrics.maxPayload = r.maxPayload; res.rows = compareRows(res.V, res.metrics); }
      if (alive()) render();
    }

    function verdictLine(V, res) {
      const sm = summariseRows(res.rows);
      const bad = res.rows.filter((r) => r.status === 'fail');
      return h('div', { class: 'val-verdict' },
        h('div', { class: 'val-big' }, h('span', { class: sm.fail ? 'warn' : 'ok' }, `${sm.pass} of ${sm.total}`), ' numbers match the real rocket'),
        h('div', { class: 'muted' }, V.flight.suborbital ? `The simulated rocket climbed to ${nf(res.metrics.maxAlt / 1000)} km and reached ${nf(res.metrics.maxSpeed)} m/s through the air (it does not go into orbit).`
          : res.reached ? `The simulated rocket reached the ${nf(V.flight.altitude / 1000)} km orbit (${nf(res.metrics.orbitPeri / 1000)} × ${nf(res.metrics.orbitApo / 1000)} km).`
          : res.metrics.reachedOrbit === 1 ? `The simulated rocket got its low point up to ${nf(res.metrics.peakPeriapsis / 1000)} km (target ${nf(V.flight.altitude / 1000)} km) but did not finish a clean orbit: ${nf(res.metrics.orbitPeri / 1000)} × ${nf(res.metrics.orbitApo / 1000)} km.`
          : `The simulated rocket did NOT reach the ${nf(V.flight.altitude / 1000)} km orbit: ${res.sim.result.reason}.`),
        bad.length ? h('div', { class: 'val-miss' }, h('b', null, 'Misses: '), bad.map((r) => `${r.label} ${pct(r.err)}`).join('; '), '.') : h('div', { class: 'ok' }, 'No misses outside the band.'));
    }

    function table(V, res) {
      const out = [];
      for (const [g, title, sub] of GROUPS) {
        const rows = res.rows.filter((r) => r.group === g);
        if (!rows.length) continue;
        out.push(h('h4', { class: 'val-grp' }, title, sub ? h('span', { class: 'muted std-only' }, ` – ${sub}`) : null));
        out.push(h('div', { class: 'val-scroll' }, h('table', { class: 'val-table' },
          h('thead', null, h('tr', null, h('th', null, 'What'), h('th', null, 'Real'), h('th', null, 'Simulator'), h('th', null, 'Error'), h('th', null, 'Result'), h('th', { class: 'std-only' }, 'Band'), h('th', { class: 'std-only' }, 'Source'))),
          h('tbody', null, rows.map((r) => {
            const [cls, txt] = LIGHT[r.status];
            return h('tr', { class: `val-row ${r.status}`, 'data-row': r.id },
              h('td', null, r.label, r.note ? h('div', { class: 'muted val-note std-only' }, r.note) : null),
              h('td', null, fmtValue(r.unit, r.value)), h('td', null, fmtValue(r.unit, r.sim)), h('td', { class: cls }, pct(r.err)),
              h('td', { class: cls }, txt), h('td', { class: 'std-only muted' }, r.tol == null ? '–' : `±${Math.round(r.tol * 100)}%`),
              h('td', { class: 'std-only' }, h('a', { href: r.url, target: '_blank', rel: 'noopener', title: r.source }, 'source')));
          })))));
      }
      return out;
    }

    function budget(V, res) {
      const m = res.metrics, n = res.sim.telemetry.count, sp = res.sim.telemetry.column('speed');
      const b = deltaVBudget({ ideal: m.dvIdeal, gravity: m.dvGravity, drag: m.dvDrag, steering: m.dvSteering }, sp[0], sp[n - 1]);
      const rows = b.rows.map((r) => h('tr', null, h('td', null, r.label), h('td', { style: { textAlign: 'right' } }, `${r.sign === '-' ? '−' : r.sign === '+' ? '+' : ''}${nf(r.value, 0)} m/s`)));
      rows.push(h('tr', null, h('td', { class: 'muted' }, 'Change while coasting without thrust (not in the losses above)'), h('td', { style: { textAlign: 'right' } }, `${nf(b.gained - b.useful, 0)} m/s`)));
      return h('details', { class: 'more' }, h('summary', null, 'Where did the speed go? (delta-v budget)'),
        h('p', { class: 'muted' }, `Of ${nf(b.rows[0].value, 0)} m/s the engines delivered, ${nf(b.lossFraction * 100, 0)}% was lost to gravity, drag and steering.`),
        h('table', { class: 'val-table' }, h('tbody', null, rows)));
    }

    function vehicleCard(V) {
      const res = S.results[V.id];
      const running = S.running === V.id;
      const head = h('div', { class: 'val-head' },
        h('div', { class: 'grow' }, h('h2', null, V.name), h('div', { class: 'muted' }, V.summary), h('div', { class: 'muted std-only' }, `Built from: ${V.dataSource === 'estimated' ? 'published numbers (some estimated, listed below)' : V.dataSource}.`)),
        h('div', { class: 'val-actions' },
          h('button', { class: 'btn primary', id: `val-run-${V.id}`, disabled: !!S.running || null, onclick: () => fly(V.id) }, res ? 'Fly again' : 'Fly it and compare'),
          running ? h('div', { class: 'muted', id: `val-prog-${V.id}` }, 'Flying…') : null));
      const body = [];
      if (res?.error) body.push(h('div', { class: 'callout bad' }, `Could not run: ${res.error}`));
      if (res && !res.error) {
        body.push(verdictLine(V, res), table(V, res));
        if (false && V.rows.some((r) => r.metric === 'maxPayload')) { // disabled: fitted pitch table is valid only near the nominal payload
          const mp = S.maxPay[V.id];
          body.push(h('div', { class: 'row val-pay' },
            h('button', { class: 'btn', id: `val-pay-${V.id}`, disabled: !!S.running || null, onclick: () => payload(V.id) }, 'Find the biggest payload the simulator can lift'),
            h('span', { class: 'muted', id: mp?.busy ? `val-prog-${V.id}` : null }, mp?.busy ? 'Searching' : mp?.maxPayload != null ? `Biggest payload that still reached orbit: ${nf(mp.maxPayload)} kg (${mp.tests} test flights).` : mp?.note ?? 'Takes about a minute: many full flights.')));
        }
        body.push(h('div', { class: 'muted val-pitch' }, h('b', null, 'Steering: '), V.pitchLabel), budget(V, res));
      }
      const info = h('details', { class: 'more val-info' }, h('summary', null, 'What we assumed and where the model is simplified'),
        h('div', { class: 'asm-cols' },
          h('div', { class: 'asm-col asm-ign' }, h('h4', null, 'Assumed or derived'), h('ul', { class: 'asm-list' }, V.assumptions.map((a) => h('li', null, a)))),
          h('div', { class: 'asm-col asm-ign' }, h('h4', null, 'Where the model is simplified'), h('ul', { class: 'asm-list' }, V.simplified.map((a) => h('li', null, a))))));
      return h('section', { class: 'val-card', id: `val-${V.id}` }, head, body, info);
    }

    // ---- 2.0: real missions (src/core/mission-validation.js)
    async function checkMission(id) {
      if (S.running) return;
      S.running = `m-${id}`; render();
      try {
        const res = await runMissionCase(id, { onProgress: (p) => { const el = document.getElementById(`valm-prog-${id}`); if (el) el.textContent = `Flying… T+${(p.t / 3600).toFixed(0)} h of about ${(p.of / 3600).toFixed(0)} h`; }, shouldStop: () => S.stop });
        if (alive()) CACHE.missions[id] = res;
      } catch (e) { CACHE.missions[id] = { error: e.message }; }
      S.running = null; if (alive()) render();
    }
    function missionCard(C) {
      const res = CACHE.missions[C.id], running = S.running === `m-${C.id}`;
      const head = h('div', { class: 'val-head' },
        h('div', { class: 'grow' }, h('h2', null, C.name), h('div', { class: 'muted' }, C.summary)),
        h('div', { class: 'val-actions' },
          h('button', { class: 'btn primary', id: `valm-run-${C.id}`, disabled: !!S.running || null, onclick: () => checkMission(C.id) }, res ? 'Check again' : C.quick ? 'Check it' : 'Fly it and compare (about a minute)'),
          running ? h('div', { class: 'muted', id: `valm-prog-${C.id}` }, 'Working…') : null));
      const body = [];
      if (res?.error) body.push(h('div', { class: 'callout bad' }, `Could not run: ${res.error}`));
      if (res && !res.error) {
        const sm = res.summary, bad = res.rows.filter((r) => r.status === 'fail');
        body.push(h('div', { class: 'val-verdict' }, h('div', { class: 'val-big' }, h('span', { class: sm.fail ? 'warn' : 'ok' }, `${sm.pass} of ${sm.total}`), ' numbers match the real mission'),
          bad.length ? h('div', { class: 'val-miss' }, h('b', null, 'Misses: '), bad.map((r) => `${r.label} ${pct(r.err)}`).join('; '), '.') : h('div', { class: 'ok' }, 'No misses outside the band.')));
        body.push(h('div', { class: 'val-scroll' }, h('table', { class: 'val-table' },
          h('thead', null, h('tr', null, h('th', null, 'What'), h('th', null, 'Real'), h('th', null, 'Simulator'), h('th', null, 'Error'), h('th', null, 'Result'), h('th', { class: 'std-only' }, 'Band'), h('th', { class: 'std-only' }, 'Source'))),
          h('tbody', null, res.rows.map((r) => { const [cls, txt] = LIGHT[r.status]; const unit = r.unit === 's' && r.value >= 3600 ? 'get' : r.unit; const val = (x) => (x == null ? '–' : unit === 'get' ? met(x) : fmtValue(r.unit, x));
            return h('tr', { class: `val-row ${r.status}`, 'data-row': r.id }, h('td', null, r.label, h('div', { class: 'muted val-note std-only' }, r.source)), h('td', null, val(r.value)), h('td', null, val(r.sim)), h('td', { class: cls }, pct(r.err)), h('td', { class: cls }, txt), h('td', { class: 'std-only muted' }, r.tol == null ? '–' : `±${Math.round(r.tol * 100)}%`), h('td', { class: 'std-only' }, h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'source'))); })))));
      }
      const info = h('details', { class: 'more val-info' }, h('summary', null, 'What goes in, and how it is computed'),
        h('div', { class: 'asm-cols' }, h('div', { class: 'asm-col asm-ign' }, h('h4', null, 'Inputs (not graded)'), h('ul', { class: 'asm-list' }, C.inputs.map((a) => h('li', null, a)))),
          h('div', { class: 'asm-col asm-ign' }, h('h4', null, 'Model'), h('p', null, C.model))));
      return h('section', { class: 'val-card', id: `valm-${C.id}` }, head, body, info);
    }

    function render() {
      clear(page);
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Does it match real rockets?'),
        h('p', null, 'We rebuilt three real rockets. Then we flew them here. Further down: real missions.'),
        h('p', { class: 'muted' }, 'Green: close. Red: the model is off.')),
        h('button', { class: 'btn primary', id: 'val-run-all', disabled: !!S.running || null, onclick: runAll }, 'Fly all three')));
      page.append(h('details', { class: 'more val-tol' }, h('summary', null, 'How we decide "matches"'),
        h('p', null, h('b', null, `±${TOLERANCE_NOTE.input.tol * 100}% for the build: `), TOLERANCE_NOTE.input.why),
        h('p', null, h('b', null, `±${TOLERANCE_NOTE.flight.tol * 100}% for the flight: `), TOLERANCE_NOTE.flight.why),
        h('p', { class: 'muted' }, 'Every real number has a source link. Estimates are labelled.')));
      for (const V of VALIDATION_VEHICLES) page.append(vehicleCard(V));
      page.append(h('div', { class: 'page-head val-missions-head' }, h('div', { class: 'grow' }, h('h1', null, 'Does it match real missions?'),
        h('p', null, 'Orbits, a Mars landing and the whole Apollo 11 flight, compared with NASA numbers.'))));
      for (const C of MISSION_CASES) page.append(missionCard(C));
      page.append(assumptionsPanel('ascent'));
    }
    render();
    return () => { S.stop = true; };
  },
};
