// Content that belongs to one detail level (Student formulas, Engineer budgets / sensitivity / plots, Expert raw data / physics options / Monte Carlo).
// Everything here only PRESENTS numbers that the physics engine and the static analysis computed. Switching the level never changes a result.
import { h, clear, fmt, toast } from './dom.js';
import { panel as panel0, saveFile, term } from './widgets.js';
import { show, showAlt, showSpeed, showKm, state as unitState } from './units.js';
import { fixed } from '../../src/core/numfmt.js';
import { analyzeVehicle, ascentDvRequired } from '../../src/vehicles/analysis.js';
import { getBody } from '../../physics/bodies.js';
import { G0 } from '../../physics/constants.js';
import { deltaVBudget } from '../../physics/mission-design.js';
import { applyParameter } from '../../src/core/experiments.js';
import { runSimulation } from '../../src/core/runner.js';
import { buildRunRecord } from '../../src/core/project.js';
import { runMetrics } from '../../src/core/run-analysis.js';
import { runMonteCarlo, analyzeMonteCarlo, monteCarloToCSV } from '../../src/core/montecarlo.js';
import { CHANNELS } from '../../physics/telemetry.js';
import { drawScatter } from './charts.js';
import { t } from '../../src/core/i18n.js';

/** panel() with an optional id */
const panel = (title, body, { cls = '', id = null, actions = null } = {}) => { const el = panel0(title, body, { cls, actions }); if (id) el.id = id; return el; };
const num = (x, d = 0) => fixed(x, d);
const sci = (x, unit) => { const e = Math.floor(Math.log10(Math.abs(x))); return `${(x / 10 ** e).toFixed(3)} × 10${String(e).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).replace('-', '⁻')} ${unit}`; };
const card = (title, ...body) => h('div', { class: 'lv-card' }, h('b', null, title), ...body);
const line = (...c) => h('div', { class: 'lv-formula' }, ...c);
const note = (x) => h('div', { class: 'lv-note' }, x);
const imp = () => unitState.system === 'imperial';
const g0Text = () => (imp() ? `${(G0 * 3.28084).toFixed(2)} ft/s²` : `${G0.toFixed(3)} m/s²`);
const mText = (kg) => show(kg, 'kg', 0);
const dvText = (v) => show(v, 'm/s', 0);

// ------------------------------------------------------------------------------------------------ Student: formulas with your own numbers
/** Rocket equation per stage, thrust-to-weight and orbital speed, with the design's real numbers plugged in. */
export function studentFormulas(app, v, { targetAltitude } = {}) {
  const body = v.meta?.body ?? app.project.environment?.body ?? 'earth';
  let an; try { an = analyzeVehicle(v, { body }); } catch { return null; }
  const B = getBody(body);
  const stages = an.stages.filter((s) => s.propellant > 0 && s.ispVac > 0);
  const cards = [];
  stages.slice(0, 3).forEach((s) => {
    const ratio = s.ignitionMass / s.burnoutMass;
    cards.push(card(`${t('lv.rocketeq', 'Rocket equation')}: ${s.name}`,
      line(h('b', null, 'Δv = Isp · g₀ · ln(m₀ / m_f)')),
      line(`Δv = ${num(s.ispVac)} s × ${g0Text()} × ln(${mText(s.ignitionMass)} / ${mText(s.burnoutMass)})`),
      line(`Δv = ${num(s.ispVac)} s × ${g0Text()} × ln(${fmt(ratio, 2)}) = `, h('b', null, dvText(s.dvVac))),
      note(t('lv.rocketeq.note', 'In vacuum. Isp in seconds, masses in {u}, result in speed units.', { u: imp() ? 'lb' : 'kg' }))));
  });
  if (stages.length > 3) cards.push(note(t('lv.more.stages', '{n} more stages follow the same formula.', { n: stages.length - 3 })));
  if (stages.length > 1) cards.push(card(t('lv.sum', 'Total of all stages'), line(stages.map((s) => dvText(s.dvVac)).join(' + '), ' = ', h('b', null, dvText(an.dvVacuum)))));
  const s1 = an.stages[0];
  if (v.type === 'rocket' && s1) {
    const F = s1.thrustSl || s1.thrustVac, W = s1.ignitionMass * B.gravity;
    cards.push(card(t('lv.twr', 'Thrust-to-weight at liftoff'),
      line(h('b', null, 'TWR = F / (m · g)')),
      line(`TWR = ${show(F, 'N', 0)} / (${mText(s1.ignitionMass)} × ${imp() ? (B.gravity * 3.28084).toFixed(2) + ' ft/s²' : B.gravity.toFixed(3) + ' m/s²'}) = `, h('b', null, `${fmt(F / W, 2)} (${t('lv.ratio', 'a ratio, no unit')})`)),
      note(F / W >= 1 ? t('lv.twr.ok', 'Above 1: the push is bigger than the weight, so it lifts off.') : t('lv.twr.bad', 'Below 1: the push is smaller than the weight, so it stays on the pad.'))));
    const alt = targetAltitude ?? v.meta?.targetAltitude ?? app.project.mission?.objective?.altitude ?? 200000;
    const r = B.radius + alt, vc = Math.sqrt(B.mu / r);
    cards.push(card(t('lv.orbitspeed', 'Orbital speed'),
      line(h('b', null, 'v = √(μ / r)')),
      line(`μ = ${sci(B.mu, 'm³/s²')}, r = R + h = ${showKm(B.radius)} + ${showKm(alt)} = ${showKm(r)}`),
      line(`v = √(μ / r) = `, h('b', null, showSpeed(vc, false)), ` (${showSpeed(vc, true)})`),
      note(t('lv.orbitspeed.note', 'This is the sideways speed that makes {name} orbit {alt} high.', { name: B.name ?? body, alt: showAlt(alt) }))));
  }
  if (!cards.length) return null;
  return h('div', { class: 'lv-formulas stu-only', id: 'lv-formulas' }, h('h3', null, t('lv.formulas', 'Formulas with your numbers')), h('div', { class: 'grid g2' }, cards));
}

/** Formulas computed from the numbers measured in one flight (Student level on the Analysis screen). */
export function runFormulas(record, tel, m) {
  const cards = [];
  const col = (id) => tel.column(id);
  const n = tel.count; if (!n) return null;
  if (Number.isFinite(m.maxQ) && m.maxQ > 0) {
    let iq = 0; const q = col('q'); for (let i = 0; i < n; i++) if (q[i] > q[iq]) iq = i;
    const rho = col('rho')[iq], sp = col('surfSpeed')[iq];
    if (rho > 0 && sp > 0) cards.push(card(t('lv.maxq', 'Max-Q: the air pushes hardest'),
      line(h('b', null, 'q = ½ · ρ · v²')),
      line(`q = ½ × ${imp() ? num(rho * 0.062428, 4) + ' lb/ft³' : num(rho, 3) + ' kg/m³'} × (${showSpeed(sp, false)})² = `, h('b', null, show(0.5 * rho * sp * sp, 'Pa', 0))),
      note(`${t('lv.measured', 'Measured in the flight')}: ${show(m.maxQ, 'Pa', 0)}  (T+${fmt(m.tMaxQ, 0)} s)`)));
  }
  if (Number.isFinite(m.maxG) && m.maxG > 0) {
    const a = m.maxG * G0;
    cards.push(card(t('lv.gload', 'Peak G-load'), line(h('b', null, 'G = a / g₀')), line(`G = ${show(a, 'm/s2', 1)} / ${g0Text()} = `, h('b', null, `${fmt(m.maxG, 2)} g`)),
      note(t('lv.gload.note', '1 g is the weight you feel standing on Earth.'))));
  }
  if (Number.isFinite(m.initialMass) && Number.isFinite(m.maxThrust) && m.liftoffTWR != null) {
    cards.push(card(t('lv.twr.flight', 'Thrust-to-weight in the flight'), line(h('b', null, 'TWR = F / (m · g)')), line(`${show(m.maxThrust, 'N', 0)} peak push, ${mText(m.initialMass)} at liftoff`), line(h('b', null, `TWR ≈ ${fmt(m.liftoffTWR, 2)}`), ` (${t('lv.ratio', 'a ratio, no unit')})`)));
  }
  if (Number.isFinite(m.finalPeri) && Number.isFinite(m.finalApo)) {
    const body = getBody(record.mission?.environment?.body ?? record.environment?.body ?? 'earth');
    const a = body.radius + (m.finalPeri + m.finalApo) / 2, vc = Math.sqrt(body.mu / a);
    cards.push(card(t('lv.finalorbit', 'Speed of the final orbit'), line(h('b', null, 'v = √(μ / a)')), line(`a = ${showKm(a)}  →  v = `, h('b', null, showSpeed(vc, false)), ` (${showSpeed(vc, true)})`), note(t('lv.finalorbit.note', 'a is the average radius of the orbit.'))));
  }
  if (!cards.length) return null;
  return h('div', { class: 'stu-only', id: 'lv-run-formulas' }, h('h3', null, t('lv.formulas.run', 'Formulas with this flight’s numbers')), h('div', { class: 'grid g2' }, cards));
}

// ------------------------------------------------------------------------------------------------ Engineer
/** Per-stage mass fractions, mass ratios, thrust-to-weight and the delta-v budget of the design (all from the static analysis). */
export function engineerDesign(app, v, { targetAltitude } = {}) {
  const body = v.meta?.body ?? app.project.environment?.body ?? 'earth';
  let an; try { an = analyzeVehicle(v, { body }); } catch { return null; }
  const st = an.stages.filter((s) => s.propellant > 0 || s.engines > 0);
  const rows = st.map((s) => h('tr', null,
    h('td', null, s.name), h('td', { class: 'num' }, mText(s.ignitionMass)), h('td', { class: 'num' }, mText(s.burnoutMass)),
    h('td', { class: 'num' }, `${fmt((100 * s.propellant) / s.ignitionMass, 1)} %`), h('td', { class: 'num' }, `${fmt(s.ignitionMass / s.burnoutMass, 2)} : 1`),
    h('td', { class: 'num' }, `${num(s.ispVac)} s`), h('td', { class: 'num' }, fmt(s.twrStart, 2)), h('td', { class: 'num' }, fmt(s.twrEnd, 2)), h('td', { class: 'num' }, dvText(s.dvVac))));
  const table = h('table', { class: 'lv-table', id: 'lv-stage-table' }, h('thead', null, h('tr', null,
    h('th', null, t('lv.stage', 'Stage')), h('th', { class: 'num' }, t('lv.m0', 'Start mass')), h('th', { class: 'num' }, t('lv.mf', 'Empty mass')), h('th', { class: 'num' }, term('propellant', t('lv.massfrac', 'Propellant fraction'))),
    h('th', { class: 'num' }, term('mass ratio', t('lv.massratio', 'Mass ratio'))), h('th', { class: 'num' }, 'Isp'), h('th', { class: 'num' }, term('TWR', 'T/W') + ' ' + t('lv.start', 'start')), h('th', { class: 'num' }, 'T/W ' + t('lv.end', 'end')), h('th', { class: 'num' }, 'Δv (vac)'))), h('tbody', null, rows));
  const out = [panel(t('lv.stagetable', 'Stages: mass fractions and thrust-to-weight'), h('div', { style: { overflowX: 'auto' } }, table))];
  if (v.type === 'rocket') {
    const alt = targetAltitude ?? v.meta?.targetAltitude ?? app.project.mission?.objective?.altitude ?? 200000;
    let req = null; try { req = ascentDvRequired(body, alt, Math.abs(app.project.environment?.site?.lat ?? 28.5)); } catch { req = null; }
    if (req) {
      const rowsB = [
        [t('lv.b.circ', 'Circular orbit speed at {alt}', { alt: showAlt(alt) }), req.vCircular, '+'],
        [t('lv.b.rot', 'Free speed from the planet’s rotation'), -req.vRotation, '−'],
        [t('lv.b.loss', 'Gravity, drag and steering losses (typical estimate)'), req.losses, '+'],
        [t('lv.b.req', 'Needed (estimate)'), req.total, '='],
        [t('lv.b.have', 'Your design: launch estimate'), an.dvEstimate, ''],
        [t('lv.b.margin', 'Margin'), an.dvEstimate - req.total, '='],
      ];
      out.push(panel(t('lv.budget', 'Delta-v budget of the design'), h('div', { class: 'col' },
        h('table', { class: 'lv-table', id: 'lv-dv-budget' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'Δv'))), h('tbody', null, rowsB.map(([l, val, sg]) => h('tr', { class: sg === '=' ? 'lv-sum' : '' }, h('td', null, `${sg ? sg + ' ' : ''}${l}`), h('td', { class: 'num' }, dvText(val)))))),
        note(t('lv.budget.note', 'The losses are a typical estimate. A real flight shows the true split in the Analysis screen.')))));
    }
  }
  return h('div', { class: 'col eng-only', id: 'lv-engineer' }, out);
}

const SENS = [
  { id: 'isp', label: 'Isp (engine efficiency)', apply: (inp, f) => { applyParameter(inp, 'vehicle.kind[engine].ispVac', f, 'scale'); applyParameter(inp, 'vehicle.kind[engine].ispSl', f, 'scale'); } },
  { id: 'thrust', label: 'Thrust', apply: (inp, f) => applyParameter(inp, 'vehicle.kind[engine].thrustVac', f, 'scale') },
  { id: 'dry', label: 'Dry mass (structure, not payload)', apply: (inp, f) => { for (const k of new Set(inp.vehicle.components.map((c) => c.kind))) { if (['payload', 'engine'].includes(k)) continue; try { applyParameter(inp, `vehicle.kind[${k}].mass`, f, 'scale'); } catch { /* kind without mass */ } } } },
  { id: 'prop', label: 'Propellant loaded', apply: (inp, f) => { for (const k of ['fuel_tank', 'oxidizer_tank', 'propellant_tank']) { try { applyParameter(inp, `vehicle.kind[${k}].propellantMass`, f, 'scale'); } catch { /* no such tank */ } } } },
];
const clone = (o) => JSON.parse(JSON.stringify(o));
/** Delta-v effect of +/-10 % on each parameter: static analysis (instant) and, on request, full real flights (apogee / max altitude). */
export function sensitivityPanel(app) {
  const P = app.project, v = P.vehicle;
  const S = { busy: false, flights: null, progress: null };
  const body = v.meta?.body ?? P.environment?.body ?? 'earth';
  const dvOf = (veh) => { try { return analyzeVehicle(veh, { body }).dvVacuum; } catch { return NaN; } };
  const base = dvOf(v);
  const data = SENS.map((p) => {
    const r = { p };
    for (const [key, f] of [['lo', 0.9], ['hi', 1.1]]) { const inp = { vehicle: clone(v) }; try { p.apply(inp, f); r[key] = dvOf(inp.vehicle); } catch { r[key] = NaN; } }
    return r;
  });
  const box = h('div', { class: 'col' });
  const rel = (x, b) => (Number.isFinite(x) && b > 0 ? `${x >= b ? '+' : ''}${fmt(((x - b) / b) * 100, 1)} %` : '–');
  async function runFlights() {
    const m = P.mission; if (!m) { toast(t('lv.sens.nomission', 'There is no mission to fly yet.'), 'warn'); return; }
    if (app.api.ctx.running) { toast(t('lv.sens.busy', 'A flight is already running.'), 'warn'); return; }
    S.busy = true; S.flights = null; S.progress = 'base'; draw();
    const settings = { accuracy: P.settings.accuracy, dt: P.settings.dt, recordMax: P.settings.recordMax };
    const fly = async (apply, f) => {
      const inp = clone({ vehicle: v, mission: m, environment: P.environment, settings }); if (apply) apply(inp, f);
      const sim = await runSimulation(inp, { shouldStop: () => !S.busy });
      const mm = runMetrics(buildRunRecord(sim), sim.telemetry);
      const orbit = m.objective?.type === 'orbit' && Number.isFinite(mm.finalPeri) && mm.finalPeri > 0;
      return { alt: mm.maxAlt, status: sim.result.status, text: orbit ? `${showKm(mm.finalPeri)} × ${showKm(mm.finalApo)}` : showKm(mm.maxAlt), orbit };
    };
    try {
      const out = { base: await fly(null, 1) };
      for (const p of SENS) { out[p.id] = {}; for (const [key, f] of [['lo', 0.9], ['hi', 1.1]]) { S.progress = `${p.label} ${f > 1 ? '+' : '−'}10 %`; draw(); out[p.id][key] = await fly(p.apply, f); } }
      S.flights = out;
    } catch (e) { toast(`${t('lv.sens.fail', 'The sensitivity flights could not run')}: ${e.message}`, 'bad', 8000); }
    S.busy = false; S.progress = null; draw();
  }
  function draw() {
    clear(box);
    const F = S.flights;
    const cell = (r, key) => {
      const dv = `${dvText(r[key])} (${rel(r[key], base)})`;
      if (!F) return dv;
      const f = F[r.p.id][key]; return `${dv}  |  ${f.text}${f.orbit ? '' : ` (${rel(f.alt, F.base.alt)})`} ${f.status === 'SUCCESS' ? 'OK' : 'no'}`;
    };
    box.append(
      h('table', { class: 'lv-table', id: 'lv-sens-table' }, h('thead', null, h('tr', null, h('th', null, t('lv.sens.param', 'Parameter')), h('th', null, '−10 %'), h('th', null, '+10 %'))),
        h('tbody', null, data.map((r) => h('tr', { 'data-param': r.p.id }, h('td', null, r.p.label), h('td', { class: 'num' }, cell(r, 'lo')), h('td', { class: 'num' }, cell(r, 'hi')))))),
      note(F ? t('lv.sens.legend.flights', 'Each cell: Δv (vacuum, static analysis) | result of a full real flight (final orbit, or highest point). OK = mission goal met.') : `${t('lv.sens.legend', 'Δv (vacuum) from the rocket equation. Baseline')}: ${dvText(base)}.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', id: 'lv-sens-run', disabled: S.busy, onclick: runFlights }, S.busy ? `${t('lv.sens.running', 'Flying')}: ${S.progress}…` : t('lv.sens.run', 'Fly all 9 cases (real simulations)')),
        S.busy ? h('button', { class: 'btn danger', onclick: () => { S.busy = false; } }, '■ ' + t('btn.stop', 'Stop')) : null));
  }
  draw();
  return panel(t('lv.sens', 'Sensitivity: ±10 % on each input'), box);
}

/** Altitude against downrange distance, from the recorded telemetry (Engineer+). */
export function trajectoryPanel(tel) {
  const c = h('canvas', { id: 'lv-traj', style: { width: '100%', height: '220px', display: 'block', border: '1px solid var(--line)', borderRadius: '6px' } });
  setTimeout(() => {
    const n = tel.count; if (!n) return;
    const alt = tel.column('alt'), dr = tel.column('downrange'), k = imp() ? 0.000621371 : 0.001, step = Math.max(1, Math.floor(n / 400));
    const pts = []; for (let i = 0; i < n; i += step) pts.push({ x: dr[i] * k, y: alt[i] * k }); pts.push({ x: dr[n - 1] * k, y: alt[n - 1] * k });
    drawScatter(c, pts, { xLabel: `${t('lv.downrange', 'downrange')} [${imp() ? 'mi' : 'km'}]`, yLabel: `${t('lv.altitude', 'altitude')} [${imp() ? 'mi' : 'km'}]`, line: true });
  }, 30);
  return panel(t('lv.trajectory', 'Trajectory: altitude against downrange'), c, { cls: 'eng-only' });
}

/** The flight's delta-v budget as a table with percentages (Engineer+). */
export function runBudgetPanel(m, tel) {
  if (!(m.dvIdeal > 0)) return null;
  const sp = tel.column('speed'), n = tel.count;
  const b = deltaVBudget({ ideal: m.dvIdeal, gravity: m.dvGravity ?? 0, drag: m.dvDrag ?? 0, steering: m.dvSteering ?? 0 }, sp[0], sp[n - 1]);
  const pct = (x) => `${fmt((100 * x) / m.dvIdeal, 1)} %`;
  const rows = b.rows.map((r) => h('tr', { class: r.sign === '=' ? 'lv-sum' : '' }, h('td', null, `${r.sign.trim() ? r.sign + ' ' : ''}${r.label}`), h('td', { class: 'num' }, show(r.value, 'm/s', 0)), h('td', { class: 'num' }, ['ideal', 'gravity', 'drag', 'steering', 'useful'].includes(r.id) ? pct(r.value) : '')));
  return panel(t('lv.runbudget', 'Delta-v budget of this flight'), h('div', { class: 'col' },
    h('table', { class: 'lv-table', id: 'lv-run-budget' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'Δv'), h('th', { class: 'num' }, t('lv.ofideal', 'of ideal')))), h('tbody', null, rows)),
    note(`${t('lv.residual', 'Closing error of the integration')}: ${show(b.residual, 'm/s', 1)}.`)), { cls: 'eng-only' });
}

// ------------------------------------------------------------------------------------------------ Expert
/** The physics options the simulator really reads: project.settings.{dt, accuracy, recordMax} and environment.{terrainSeed, epoch}. */
export const PHYSICS_PARAMS = [
  { key: 'dt', where: 'settings', label: 'Time step dt', unit: 's', min: 0.001, max: 0.1, step: 0.001, read: 'physics/simulation.js: base RK4 step while thrusting or in the atmosphere' },
  { key: 'accuracy', where: 'settings', label: 'Coast accuracy', unit: '', options: [['fast', 'fast: coast step ≤ 10 s'], ['standard', 'standard: ≤ 2 s'], ['high', 'high: ≤ 0.5 s']], read: 'physics/simulation.js: coastCap, step cap far from a planet' },
  { key: 'recordMax', where: 'settings', label: 'Telemetry samples kept', unit: 'samples', min: 1000, max: 200000, step: 1000, read: 'physics/telemetry.js: maximum samples before in-place decimation' },
  { key: 'terrainSeed', where: 'environment', label: 'Terrain seed', unit: '', min: 0, max: 99999, step: 1, read: 'physics/terrain: random hills of the surface (rovers, landers)' },
  { key: 'epoch', where: 'environment', label: 'Start epoch (J2000 seconds)', unit: 's', min: -1e10, max: 1e10, step: 3600, read: 'physics/simulation.js: start time for the Sun and planet positions' },
];
export function physicsOptionsPanel(app) {
  const P = app.project;
  const get = (p) => (p.where === 'settings' ? P.settings[p.key] : P.environment?.[p.key] ?? (p.key === 'terrainSeed' ? 1 : 0));
  const set = (p, val) => { if (p.where === 'settings') P.settings[p.key] = val; else { P.environment ??= {}; P.environment[p.key] = val; } app.markDirty(); };
  const rows = PHYSICS_PARAMS.map((p) => {
    const cur = get(p);
    const ctl = p.options
      ? h('select', { class: 'input', style: { width: '210px' }, id: `phys-${p.key}`, onchange: (e) => { set(p, e.target.value); if (p.key === 'accuracy') { app.settings.accuracy = e.target.value; app.saveSettings(); } } }, p.options.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)))
      : h('input', { class: 'input num', id: `phys-${p.key}`, type: 'number', min: p.min, max: p.max, step: p.step, value: cur, style: { width: '110px' }, onchange: (e) => { let x = parseFloat(e.target.value); if (!Number.isFinite(x)) { e.target.value = get(p); return; } x = Math.max(p.min, Math.min(p.max, x)); e.target.value = x; set(p, x); } });
    return h('div', { class: 'lv-param' }, h('label', { for: `phys-${p.key}` }, p.label, p.unit ? ` [${p.unit}]` : ''), ctl, h('code', null, p.read));
  });
  return panel(t('lv.physics', 'Physics options (Expert)'), h('div', { class: 'col' },
    ...rows,
    note(t('lv.physics.note', 'These are the only options the simulator reads. The integrator is always RK4 and there is no drag-coefficient scale to edit. The values are saved in the project, so they stay the same when you change the detail level. A different value gives a different (still deterministic) result.'))), { cls: 'exp-only', id: 'lv-physics' });
}

function csvOf(tel, ids) { return tel.toCSV(ids); }
/** Raw telemetry: pick channels, see raw SI numbers sample by sample, export everything as CSV or JSON. */
export function rawTelemetryPanel(app, tel, name = 'flight') {
  const S = { ids: ['t', 'alt', 'speed', 'mass', 'thrust', 'q', 'gload'], from: 0, rows: 40 };
  const box = h('div', { class: 'col' });
  const base = String(name).replace(/[^\w.-]+/g, '_');
  function draw() {
    clear(box);
    const n = tel.count; S.from = Math.max(0, Math.min(S.from, Math.max(0, n - S.rows)));
    const cols = S.ids.map((id) => ({ id, meta: CHANNELS.find((c) => c[0] === id), data: tel.column(id) }));
    const sel = h('select', { class: 'input', multiple: true, size: 6, id: 'raw-channels', style: { minWidth: '210px' }, onchange: (e) => { S.ids = [...e.target.selectedOptions].map((o) => o.value); if (!S.ids.includes('t')) S.ids.unshift('t'); draw(); } }, CHANNELS.map(([id, label, unit]) => h('option', { value: id, selected: S.ids.includes(id) }, `${id} — ${label}${unit ? ` [${unit}]` : ''}`)));
    box.append(
      h('div', { class: 'lv-row' }, sel,
        h('div', { class: 'col' },
          h('label', { class: 'field' }, `${t('lv.raw.from', 'First sample')} (0 – ${Math.max(0, n - 1)})`, h('input', { class: 'input num', id: 'raw-from', type: 'number', min: 0, max: Math.max(0, n - 1), value: S.from, style: { width: '110px' }, onchange: (e) => { S.from = parseInt(e.target.value, 10) || 0; draw(); } })),
          h('div', { class: 'lv-row' },
            h('button', { class: 'btn small', onclick: () => { S.from -= S.rows; draw(); } }, '◀'), h('button', { class: 'btn small', onclick: () => { S.from += S.rows; draw(); } }, '▶'),
            h('button', { class: 'btn', id: 'raw-csv', onclick: () => saveFile(app, `${base}-telemetry-all.csv`, csvOf(tel), 'text/csv') }, 'CSV (all channels)'),
            h('button', { class: 'btn', id: 'raw-json', onclick: () => saveFile(app, `${base}-telemetry-all.json`, JSON.stringify({ schema: 'astra.telemetry.columns/1', count: n, units: 'SI', columns: tel.toColumns() }), 'application/json') }, 'JSON (all channels)')))),
      h('div', { style: { overflow: 'auto', maxHeight: '300px' } }, h('table', { class: 'lv-table', id: 'raw-table' }, h('thead', null, h('tr', null, cols.map((c) => h('th', { class: 'num', title: c.meta?.[1] }, `${c.id}${c.meta?.[2] ? ` [${c.meta[2]}]` : ''}`)))),
        h('tbody', null, Array.from({ length: Math.min(S.rows, n - S.from) }, (_, k) => h('tr', null, cols.map((c) => h('td', { class: 'num' }, Number(c.data[S.from + k]).toPrecision(8).replace(/\.?0+$/, ''))))))),
      ), note(`${t('lv.raw.note', 'Raw values in SI units, exactly as recorded.')} ${n.toLocaleString('en-US')} ${t('lv.raw.samples', 'samples')}.`));
  }
  draw();
  return panel(t('lv.raw', 'Raw telemetry (Expert)'), box, { cls: 'exp-only', id: 'lv-raw' });
}

/** A compact Monte Carlo: fly the design N times with seeded random dispersions (real simulations). */
export function monteCarloPanel(app) {
  const P = app.project; const S = { runs: 20, seed: 1, busy: false, res: null, progress: null };
  const box = h('div', { class: 'col' });
  async function go() {
    if (!P.vehicle || !P.mission) return;
    if (app.api.ctx.running) { toast(t('lv.sens.busy', 'A flight is already running.'), 'warn'); return; }
    S.busy = true; S.res = null; draw();
    try {
      const mc = await runMonteCarlo({ runs: S.runs, seed: S.seed }, clone({ vehicle: P.vehicle, mission: P.mission, environment: P.environment, settings: { accuracy: P.settings.accuracy, dt: P.settings.dt, recordMax: P.settings.recordMax } }),
        { shouldStop: () => !S.busy, onProgress: (p) => { S.progress = p; const el = box.querySelector('#mc2-prog'); if (el) el.textContent = `${p.done} / ${p.total}`; } });
      S.res = { mc, an: analyzeMonteCarlo(mc.rows, mc.factors) };
    } catch (e) { toast(`Monte Carlo: ${e.message}`, 'bad', 8000); }
    S.busy = false; draw();
  }
  function draw() {
    clear(box);
    box.append(h('div', { class: 'lv-row' },
      h('label', { class: 'field' }, t('lv.mc.runs', 'Runs'), h('input', { class: 'input num', id: 'mc2-runs', type: 'number', min: 5, max: 200, value: S.runs, style: { width: '80px' }, onchange: (e) => (S.runs = Math.max(5, Math.min(200, parseInt(e.target.value, 10) || 20))) })),
      h('label', { class: 'field' }, t('lv.mc.seed', 'Random seed'), h('input', { class: 'input num', id: 'mc2-seed', type: 'number', value: S.seed, style: { width: '80px' }, onchange: (e) => (S.seed = parseInt(e.target.value, 10) || 1) })),
      h('button', { class: 'btn primary', id: 'mc2-run', disabled: S.busy, onclick: go }, S.busy ? t('lv.mc.running', 'Running…') : 'Monte Carlo'),
      S.busy ? [h('span', { id: 'mc2-prog', class: 'muted' }, ''), h('button', { class: 'btn danger', onclick: () => { S.busy = false; } }, '■')] : null));
    if (S.res) {
      const { mc, an } = S.res;
      box.append(h('div', { class: 'callout ' + (an.successRate > 0.9 ? 'ok' : an.successRate > 0.5 ? 'warn' : 'bad') }, an.verdict),
        h('div', { class: 'lv-note' }, `${t('lv.mc.rate', 'Success')}: ${an.success} / ${an.valid} (${fmt(100 * an.successRate, 0)} %), 95 % CI ${fmt(100 * an.ci95[0], 0)}–${fmt(100 * an.ci95[1], 0)} %`),
        h('div', { class: 'row' }, h('button', { class: 'btn', id: 'mc2-csv', onclick: () => saveFile(app, 'montecarlo.csv', monteCarloToCSV(mc), 'text/csv') }, 'CSV'), h('button', { class: 'btn', onclick: () => saveFile(app, 'montecarlo.json', JSON.stringify(mc), 'application/json') }, 'JSON')));
    }
  }
  draw();
  return panel(t('lv.mc', 'Monte Carlo (Expert)'), box, { cls: 'exp-only', id: 'lv-mc' });
}

/** Everything that changes between the levels is presentation: this returns the numbers the equality test compares. */
export function resultFingerprint(m) {
  return ['status', 'endTime', 'maxAlt', 'maxSpeed', 'maxQ', 'maxG', 'finalPeri', 'finalApo', 'dvIdeal', 'propellantUsed', 'finalMass'].map((k) => `${k}=${m[k]}`).join('|');
}
