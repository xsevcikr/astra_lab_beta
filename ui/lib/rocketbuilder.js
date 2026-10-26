// Beginner "Rocket Builder": one simple panel that replaces the component tree + inspector of the Vehicle Designer.
// It edits the design only through the same tools the AI engineer uses (MODIFY_STAGE, ADD_PAYLOAD), so everything stays consistent.
import { h, clear, toast } from './dom.js';
import { COMPONENT_INFO } from '../../data/academy/index.js';
import { ENGINES } from '../../data/components.js';
import { vehicleSummary } from '../../ai/toolapi.js';
import { validateVehicle } from '../../src/vehicles/analysis.js';
import { issueRows } from './missing.js';
import { icon } from './icons.js';
import { kindIcon, firstSentence, helpPop } from './editorkit.js';
import { findComponent, removeComponent, modifyComponent, totalMass } from '../../src/vehicles/vehicle.js';
import { buildProbe, embedPayload, addUpperSection } from '../../src/vehicles/builders.js';
import { missionDvNeed, ascentDvNeeded } from '../../src/core/readiness.js';
import { designSignature } from '../../src/core/makeitfly.js';
import { analyzeVehicle } from '../../src/vehicles/analysis.js';

export const ORBIT_DV = 9400;             // m/s, rough speed budget for a low Earth orbit including losses
const TANKS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
const n0 = (x) => Math.round(x).toLocaleString('en-US');

/** Most acceleration (in g) the weakest part of the rocket is rated for, or null when no part says. */
function partGLimit(v) { const g = v.components.map((c) => c.maxAccelG).filter((x) => Number.isFinite(x) && x > 0 && x < 1e6); return g.length ? Math.min(...g) : null; }

/**
 * Plain-language "Will it fly?" answers. Pure function of the vehicle and the active mission: used by the panel and by tests.
 * These are CHECKS on paper (a prediction). Only a flight proves that the rocket works.
 */
export function flyChecks(v, body = v.meta?.body ?? 'earth', mission = null) {
  const sum = vehicleSummary(v, body);
  const errors = validateVehicle(v, { body }).filter((i) => i.severity === 'error');
  const twr = sum.liftoffTWR, dv = sum.dvEstimate;
  // what the speed has to be depends on the goal: a short hop up needs far less than an orbit
  let need = missionDvNeed(mission, v, body);
  if (need.kind === 'none') need = { kind: 'orbit', dv: v.meta?.targetAltitude ? ascentDvNeeded(body, v.meta.targetAltitude) : ORBIT_DV, label: 'Orbit' };
  const lift = twr < 1 ? ['bad', `No. Push is only ${twr.toFixed(2)} times the weight. It stays on the pad.`]
    : twr < 1.2 ? ['warn', `Barely. Push is ${twr.toFixed(2)} times the weight. Add a bit more.`]
      : ['ok', `Yes. Push is ${twr.toFixed(2)} times the weight.`];
  const goal = need.kind === 'height' ? `${need.label} needs about ${n0(need.dv)} (estimate).` : `${need.label === 'Orbit' ? 'Orbit' : need.label} needs about ${n0(need.dv)}.`;
  const ratio = Number.isFinite(dv) ? dv / need.dv : NaN;
  const speed = !Number.isFinite(dv) ? ['warn', 'Not known yet. Add an engine and fuel.']
    : ratio >= 1.02 ? ['ok', `Yes. It can gain ${n0(dv)} m/s. ${goal}`]
      : ratio >= 0.95 ? ['warn', `Nearly. It can gain ${n0(dv)} m/s. ${goal} Add a little fuel.`]
        : ['bad', `No. It can gain only ${n0(dv)} m/s. ${goal} Add fuel or a stage.`];
  // "Built well?": mistakes in the build, and thrust so strong that parts may break (real part limits when the parts state them)
  let an = null; try { an = analyzeVehicle(v, { body }); } catch { /* keep null */ }
  const gLim = partGLimit(v), gEnd = an ? Math.max(0, ...an.stages.map((s) => s.twrEnd).filter(Number.isFinite)) : 0;
  const weakTop = an ? an.stages.slice(1).find((s) => s.engines > 0 && s.twrVacStart < 0.6) : null;
  let strong;
  if (errors.length) strong = ['bad', `Not yet. ${errors[0].message}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`];
  else if (twr > 3.5) strong = ['bad', `It pushes ${twr.toFixed(1)} times its weight. That can break it. Use fewer engines.`];
  else if (gLim && gEnd > gLim) strong = ['warn', `The push at the end is ${gEnd.toFixed(0)} g. A part is made for ${gLim.toFixed(0)} g.`];
  else if (twr > 2.5) strong = ['warn', `It pushes hard: ${twr.toFixed(1)} times its weight. It may break.`];
  else if (weakTop) strong = ['warn', 'The top stage is weak. It may not keep climbing.'];
  else strong = ['ok', 'Yes. No build mistakes found.'];
  const items = [
    { id: 'lift', q: 'Lifts off?', lesson: 'L3-4', short: 'it cannot lift off. Add engine push.', state: lift[0], text: lift[1] },
    { id: 'speed', q: 'Fast enough?', lesson: 'L3-2', short: need.kind === 'height' ? 'it is too slow to get that high. Add fuel.' : 'it is too slow for orbit. Add fuel or a stage.', state: speed[0], text: speed[1] },
    { id: 'strong', q: 'Built well?', lesson: null, short: strong[1].startsWith('Not yet') ? 'something is built wrong. See the list.' : 'it may break. Push less hard.', state: strong[0], text: strong[1] },
  ];
  const worst = items.find((i) => i.state === 'bad') ?? items.find((i) => i.state === 'warn');
  const overall = !worst ? ['ok', 'Looks ready. Test fly it to be sure.']
    : worst.state === 'bad' ? ['bad', `Not ready: ${worst.short}`]
      : ['warn', 'Close. One thing is on the edge.'];
  return { sum, items, overall, errors, need };
}

/**
 * Replace the payload of a rocket by a probe of `kg` kilograms (the same building blocks as the ADD_PAYLOAD tool; the vehicle is
 * restored untouched if anything fails).
 */
export function setPayloadMass(v, kg) {
  const snap = JSON.parse(JSON.stringify(v));
  try {
    const probe = buildProbe({ mass: kg });
    const bus = probe.components.find((c) => c.kind === 'payload' && c.mount === 'stack') ?? probe.components[0];
    const len = bus.length ?? 0.8;
    v.meta ??= {}; v.meta.cfg ??= {};
    let fairing = v.components.find((c) => c.kind === 'fairing');
    if (!fairing) { addUpperSection(v, { diameter: v.meta.cfg.D, payloadLength: len }); fairing = v.components.find((c) => c.kind === 'fairing'); }
    else if ((fairing.length ?? 0) < len + 0.3) modifyComponent(v, fairing.id, { length: Math.round((len + 0.4) * 100) / 100 });
    let old; while ((old = v.components.find((c) => c.group === 'payload'))) removeComponent(v, old.id);
    embedPayload(v, probe, { fairingId: fairing.id });
    v.meta.payloadMass = Math.round(totalMass(probe) * 1000) / 1000;
  } catch (e) { v.components = snap.components; v.meta = snap.meta; v.stages = snap.stages; throw e; }
}

/** Friendly engine name: Small / Medium / Large / Huge by thrust. */
export function engineClass(e) {
  const kn = e.thrustVac / 1000;
  return kn < 60 ? 'Small' : kn < 300 ? 'Medium' : kn < 1000 ? 'Large' : 'Huge';
}
export function engineLabel(e) {
  const kn = e.thrustVac / 1000;
  return `${engineClass(e)} engine${e.vacuumOptimised ? ' for space' : ''} - ${kn < 10 ? kn.toFixed(1) : Math.round(kn)} kN`;
}
const enginesLike = (cur) => ENGINES.filter((e) => !e.solid && e.thrustVac > 100 && [...e.propellants].sort().join() === [...(cur.propellants ?? [])].sort().join()).sort((a, b) => a.thrustVac - b.thrustVac);

function stageTitle(i, n) {
  if (n === 1) return ['Stage 1', 'Does all the lifting'];
  if (i === 0) return ['Stage 1', 'Lifts off the ground'];
  if (i === 1) return ['Stage 2', n === 2 ? 'Goes on to orbit' : 'Pushes higher'];
  return [`Stage ${i + 1}`, 'Last push'];
}
export const light = (state) => h('span', { class: `light ${state}`, title: { ok: 'Good', warn: 'Careful', bad: 'Problem' }[state] }, { ok: icon('check', { size: 14 }), warn: '!', bad: icon('cross', { size: 14 }) }[state]);

/**
 * ctx: { app, S, view, vehicle(), commit(label), onDesignChanged(rebuild), renderAll(), newMenu(), openFull(id?) }
 * returns render(container)
 */
export function createSimplePanel(ctx) {
  const { app, S } = ctx;
  S.fuelBase ??= {};

  async function run(tool, args, label) {
    let r;
    try { r = await app.api.execute(tool, args); } catch (e) { toast(e.message, 'bad'); return false; }
    if (!r.ok) { toast(r.message, 'bad', 7000); ctx.renderAll(); return false; }
    ctx.commit(label); ctx.onDesignChanged(true); return true;
  }

  function slider(id, { min, max, step, value, onInput, onChange }) {
    const el = h('input', { type: 'range', id, class: 'simple-range', min, max, step, value });
    el.addEventListener('input', () => onInput?.(+el.value));
    el.addEventListener('change', () => onChange?.(+el.value));
    return el;
  }

  function nameRow(v) {
    const P = app.project, list = P.vehicleList();
    const inp = h('input', { class: 'input simple-name', id: 'simple-name', type: 'text', value: v?.name ?? '', 'aria-label': 'Name of your rocket', onchange: (e) => { if (!v) return; v.name = e.target.value.trim().slice(0, 80) || v.name; ctx.commit('Rename vehicle'); ctx.renderAll(); } });
    const pick = list.length > 1 ? h('select', { class: 'input', id: 'simple-vehicle', title: 'Switch to another rocket', onchange: (e) => { P.activeVehicle = e.target.value; S.sel = null; app.commit('Select vehicle', { silent: true }); ctx.onDesignChanged(true); } }, list.map((x) => h('option', { value: x.id, selected: x.id === P.activeVehicle }, `${x.name} (${x.type})`))) : null;
    return h('div', { class: 'simple-block' }, h('label', { class: 'simple-label', for: 'simple-name' }, v ? 'Name' : 'Your rocket'), v ? inp : null, pick);
  }

  // ---- honest test flights: the checks are a prediction, only a real flight proves it. The result is tied to this exact design.
  const sigNow = (v) => designSignature(v, app.project.mission);
  const flyState = (v) => { const t = S.flyTest; return t && (t.busy || t.sig === sigNow(v)) ? t : null; };
  function paintFly() {
    const t = S.flyTest; if (!t?.busy) return;
    const msg = document.getElementById('fly-test-msg'), bar = document.getElementById('fly-test-bar');
    if (msg) msg.textContent = t.text; if (bar) bar.style.width = `${Math.round(100 * (t.pct ?? 0.4))}%`;
  }
  async function doTest() {
    const v = ctx.vehicle(); if (!v || S.flyTest?.busy) return;
    if (!app.project.mission) { toast('Pick where to go first.', 'info'); app.navigate('planner'); return; }
    S.flyTest = { sig: sigNow(v), busy: 'test', text: 'Flying it for real...', pct: 0.4 }; ctx.renderAll();
    const r = await app.testFly();
    S.flyTest = { sig: sigNow(ctx.vehicle() ?? v), result: r.ok ? { ok: true, text: r.text } : { ok: false, text: `Failed: ${r.cause}`, cause: r.cause } }; ctx.renderAll(); revealTest();
  }
  async function doFix() {
    const v = ctx.vehicle(); if (!v || S.flyTest?.busy) return;
    S.flyTest = { sig: sigNow(v), busy: 'fix', text: 'Test flight 1', pct: 0.03 }; ctx.renderAll();
    const r = await app.makeItFly({ onProgress: (p) => { if (S.flyTest?.busy) { S.flyTest.text = p.text; S.flyTest.pct = p.pct; paintFly(); } } });
    S.flyTest = { sig: sigNow(ctx.vehicle() ?? v), result: r.ok ? { ok: true, text: 'Fixed: it flies now', detail: r.summary } : { ok: false, text: r.stopped ? 'Stopped' : `Failed: ${r.cause || r.summary}`, cause: r.cause, detail: r.summary, nofix: true } };
    toast(r.ok ? 'Your rocket flew.' : r.stopped ? 'Stopped.' : 'Still not working.', r.ok ? 'ok' : 'warn', 5000); ctx.renderAll(); revealTest();
  }
  const revealTest = () => setTimeout(() => document.getElementById('fly-test')?.scrollIntoView({ block: 'nearest' }), 60);
  function stopFly() { app.stopFix(); app.api.execute('STOP_SIMULATION'); }

  function verdictBlock(fc, t) {
    const done = t?.result;
    const state = done ? (done.ok ? 'ok' : 'bad') : fc.overall[0];
    const text = done ? (done.ok ? 'Test flight worked.' : 'Test flight failed.') : fc.overall[1];
    return h('div', { class: `simple-verdict ${state}`, id: 'fly-verdict', 'data-state': state }, light(state), h('div', null, h('b', null, 'Will it fly?'), h('div', { id: 'fly-verdict-text', class: 'simple-hint' }, text)));
  }

  function testRow(t) {
    const row = h('div', { class: 'fly-test', id: 'fly-test' });
    if (t?.busy) {
      row.append(h('div', { class: 'fly-test-busy' }, h('div', { class: 'progress' }, h('div', { id: 'fly-test-bar', style: { width: `${Math.round(100 * (t.pct ?? 0.4))}%` } })), h('div', { class: 'row' }, h('span', { id: 'fly-test-msg', class: 'simple-hint grow' }, t.text), h('button', { class: 'btn small', id: 'fly-test-stop', onclick: stopFly }, 'Stop'))));
    } else if (t?.result) {
      const r = t.result;
      row.dataset.state = r.ok ? 'ok' : 'bad';
      row.append(h('div', { class: 'fly-test-row', id: 'fly-test-result', 'data-state': r.ok ? 'ok' : 'bad' }, light(r.ok ? 'ok' : 'bad'), h('div', null, h('b', null, r.text), r.detail ? h('div', { class: 'simple-hint' }, r.detail) : null)));
      if (!r.ok && !r.nofix) row.append(h('button', { class: 'btn primary big', id: 'fly-fix', onclick: doFix }, 'Fix it and fly again'));
      else if (!r.ok) row.append(h('button', { class: 'btn small', id: 'fly-test-btn', onclick: doTest }, 'Test fly again'));
    } else {
      row.dataset.state = 'untested';
      row.append(h('div', { class: 'fly-test-row', id: 'fly-untested', 'data-state': 'untested' }, h('span', { class: 'light unk', title: 'Not flown yet' }, '?'), h('div', { class: 'grow' }, h('b', null, 'Not test flown yet'))), h('button', { class: 'btn small', id: 'fly-test-btn', title: 'Fly the rocket once, fast, to see if it really works', onclick: doTest }, 'Test fly'));
    }
    return row;
  }

  function payloadBlock(v, fc) {
    const cur = Math.max(0, fc.sum.payloadMass || 0);
    const num = h('input', { class: 'input num', id: 'payload-kg', type: 'number', min: 1, max: 20000, step: 'any', value: +cur.toFixed(1) });
    const apply = async (kg) => { if (!Number.isFinite(kg) || kg < 1) { toast('Payload must be at least 1 kg.', 'bad'); ctx.renderAll(); return; } try { setPayloadMass(v, kg); } catch (e) { toast(e.message, 'bad', 7000); ctx.renderAll(); return; } ctx.commit(`Set payload to ${Math.round(kg)} kg`); ctx.onDesignChanged(true); };
    num.addEventListener('change', () => apply(parseFloat(num.value)));
    const sl = slider('payload-slider', { min: 5, max: Math.max(1000, Math.ceil(cur * 1.5 / 100) * 100), step: 5, value: Math.min(cur, 1e9), onInput: (x) => { num.value = x; }, onChange: apply });
    return h('div', { class: 'simple-card', title: 'Payload: what your rocket carries into space. A heavier payload needs a stronger rocket.' }, h('div', { class: 'simple-card-title' }, 'Payload', h('span', { class: 'simple-hint' }, ' what you carry')),
      h('div', { class: 'simple-row' }, num, h('span', { class: 'unit' }, 'kg')), sl);
  }

  function stageCard(v, st, i, n) {
    const engs = v.components.filter((c) => c.group === st.id && c.kind === 'engine');
    const eng = engs[0];
    const tanks = v.components.filter((c) => c.group === st.id && TANKS.includes(c.kind));
    const prop = tanks.reduce((s, c) => s + (c.propellantMass ?? 0), 0);
    const [t1, t2] = stageTitle(i, n);
    const card = h('div', { class: 'simple-card', 'data-stage': st.id }, h('div', { class: 'simple-card-title' }, t1, h('span', { class: 'simple-hint' }, ` ${t2}`)));
    if (eng) {
      const opts = enginesLike(eng); if (!opts.some((o) => o.catalogId === eng.catalogId) && eng.catalogId) { const b = ENGINES.find((e) => e.catalogId === eng.catalogId); if (b) opts.push(b); }
      const tip = (COMPONENT_INFO.engine?.oneLine ?? '');
      const sel = h('select', { class: 'input', id: `engine-select-${st.id}`, title: tip, 'aria-label': `Engine of ${st.name}`, onchange: (e) => run('MODIFY_STAGE', { stage: st.id, engine: e.target.value }, `Change engine of ${st.name}`) },
        opts.map((o) => h('option', { value: o.catalogId, selected: o.catalogId === eng.catalogId, title: `${tip} ${o.description ?? ''}` }, engineLabel(o))));
      const cnt = Math.max(1, eng.count ?? 1);
      const step = (d) => { const c = Math.min(19, Math.max(1, cnt + d)); if (c !== cnt) run('MODIFY_STAGE', { stage: st.id, engineCount: c }, `${st.name}: ${c} engine${c > 1 ? 's' : ''}`); };
      card.append(h('div', { class: 'simple-row' }, h('span', { class: 'simple-label' }, 'Engine'), sel),
        h('div', { class: 'simple-row' }, h('span', { class: 'simple-label', title: 'More engines push harder, but they also weigh more.' }, 'Engines'),
          h('button', { class: 'btn small step', id: `engine-minus-${st.id}`, disabled: cnt <= 1, 'aria-label': 'One engine fewer', onclick: () => step(-1) }, '−'),
          h('span', { class: 'step-val', id: `engine-count-${st.id}` }, cnt),
          h('button', { class: 'btn small step', id: `engine-plus-${st.id}`, disabled: cnt >= 19, 'aria-label': 'One engine more', onclick: () => step(1) }, '+')));
    } else card.append(h('div', { class: 'simple-hint' }, 'No engine here.'));
    if (tanks.length && prop > 0) {
      const key = `${v.id}:${st.id}`;
      let base = S.fuelBase[key];
      if (!base || prop < base * 0.49 || prop > base * 2.01) base = S.fuelBase[key] = prop;   // a new reference after outside changes
      const pct = Math.round(100 * prop / base);
      const val = h('span', { class: 'step-val wide', id: `fuel-kg-${st.id}` }, `${n0(prop)} kg`);
      card.append(h('div', { class: 'simple-row' }, h('span', { class: 'simple-label', title: 'Fuel plus oxidizer. More fuel gives more speed, but a heavier rocket.' }, 'Fuel'), val, h('span', { class: 'simple-hint grow' }, `${pct}%`)),
        slider(`fuel-slider-${st.id}`, { min: 50, max: 200, step: 5, value: pct,
          onInput: (x) => { val.textContent = `${n0(base * x / 100)} kg`; },
          onChange: (x) => { const target = base * x / 100; if (Math.abs(target - prop) > 0.5) run('MODIFY_STAGE', { stage: st.id, propellantMass: target }, `${st.name}: fuel ${Math.round(target)} kg`); } }));
    } else if (eng) card.append(h('div', { class: 'simple-hint' }, 'No fuel tank here.'));
    return card;
  }

  function checklist(fc, t) {
    return h('div', { class: 'simple-card', id: 'fly-checks' }, h('div', { class: 'simple-card-title' }, 'Will it fly?', helpPop(['Push beats weight: it lifts off.', 'Enough speed: it reaches the goal.', 'More in the Academy.'])),
      fc.items.map((it) => h('div', { class: 'check-row', id: `check-${it.id}`, 'data-state': it.state, title: it.text }, light(it.state), h('div', null, h('b', null, it.q), h('div', { class: 'simple-hint' }, it.text)))),
      h('div', { class: 'simple-hint', id: 'fly-green-note' }, 'Green means the checks pass. Only a flight proves it.'),
      testRow(t));
  }

  function partCard(v) {
    const c = S.sel ? findComponent(v, S.sel) : null; if (!c) return null;
    const info = COMPONENT_INFO[c.kind];
    return h('div', { class: 'simple-card part-card-simple', id: 'simple-part' },
      h('div', { class: 'simple-card-title' }, 'What is this?', h('button', { class: 'icon-btn close-x', title: 'Close', 'aria-label': 'Close', onclick: () => { S.sel = null; ctx.renderAll(); } }, '×')),
      h('div', null, h('b', null, c.name), ' ', info ? h('span', { class: 'simple-hint' }, `(${info.name})`) : null),
      h('div', { class: 'simple-hint' }, info ? (info.oneLine ?? firstSentence(info.whatItDoes)) : (c.description ?? 'A part of your rocket.')),
      h('div', { class: 'row' },
        info ? h('button', { class: 'btn small', id: 'simple-learn-part', onclick: () => app.navigate('academy', { component: c.kind }) }, 'Learn more') : null,
        h('button', { class: 'btn small', id: 'simple-edit-part', onclick: () => ctx.openFull(c.id) }, 'Edit')));
  }

  function partsList(v) {
    const rows = v.components.filter((c) => c.kind !== 'wheel' || true).slice(0, 60).map((c) => h('div', { class: `part-row ${S.sel === c.id ? 'sel' : ''}`, 'data-id': c.id, onclick: () => { S.sel = c.id; ctx.renderAll(); } }, h('span', { class: 'ed-ico sm', style: { background: kindIcon(c.kind)[1] } }, kindIcon(c.kind)[0]), h('span', { class: 'grow' }, c.name), h('span', { class: 'simple-hint' }, COMPONENT_INFO[c.kind]?.name ?? c.kind)));
    return h('div', { class: 'simple-card' }, h('div', { class: 'simple-card-title' }, 'Parts', h('span', { class: 'simple-hint' }, ' tap one')), h('div', { class: 'part-rows' }, rows));
  }

  return function render(panel) {
    clear(panel);
    const v = ctx.vehicle();
    const body = h('div', { class: 'simple-body' }), foot = h('div', { class: 'simple-foot' });
    panel.append(h('div', { class: 'simple-head' }, h('h2', null, v && v.type !== 'rocket' ? `Your ${v.type}` : 'Your rocket'), h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'ed-share', title: 'Send this design to someone, or open one you got', onclick: () => import('./sharedialog.js').then((m) => m.openShareDialog(app)) }, 'Share'), h('button', { class: 'btn small', id: 'simple-new', title: 'Start another vehicle', onclick: ctx.newMenu }, '+ New'))), body, foot);
    panel.id = 'simple-panel';
    if (!v) {
      body.append(h('div', { class: 'simple-card' }, h('div', { class: 'simple-card-title' }, 'Nothing here yet'), h('div', { class: 'simple-hint' }, 'Let the AI build one, or start your own.')));
      foot.append(h('button', { class: 'btn primary big', id: 'simple-make', onclick: () => app.navigate('ai', { prefill: 'Build me a two-stage rocket carrying a 100 kg space probe.', send: true }) }, 'Make me a rocket'), h('button', { class: 'btn', onclick: ctx.newMenu }, '+ New'));
      return;
    }
    let fc;
    try { fc = flyChecks(v, v.meta?.body ?? 'earth', app.project.mission); } catch (e) { body.append(h('div', { class: 'callout warn' }, `Checks not available: ${e.message}`)); return; }
    const isRocket = v.type === 'rocket';
    const ft = isRocket ? flyState(v) : null;
    let verdict = isRocket ? verdictBlock(fc, ft) : null;
    panel.dataset.totalMass = String(fc.sum.totalMass); panel.dataset.dv = String(fc.sum.dvVacuum); panel.dataset.twr = String(fc.sum.liftoffTWR); panel.dataset.payload = String(fc.sum.payloadMass);
    body.append(nameRow(v), partCard(v));
    { const rows = issueRows(app, v, { onDone: () => ctx.onDesignChanged(true) }); if (rows.length) body.append(h('div', { class: 'simple-card simple-fixes', id: 'simple-fixes' }, h('div', { class: 'simple-card-title' }, 'Fix these'), rows)); }
    if (isRocket) {
      body.append(payloadBlock(v, fc));
      const stages = v.stages.filter((s) => v.components.some((c) => c.group === s.id && c.kind === 'engine'));
      stages.forEach((st, i) => body.append(stageCard(v, st, i, stages.length)));
      body.append(checklist(fc, ft));
    } else {
      const strong = fc.items.find((i) => i.id === 'strong');
      verdict = h('div', { class: `simple-verdict ${strong.state}`, id: 'fly-verdict', 'data-state': strong.state }, light(strong.state), h('div', null, h('b', null, 'Built well?'), h('div', { id: 'fly-verdict-text' }, strong.text)));
      body.append(partsList(v),
        h('div', { class: 'simple-hint' }, 'Sizes and parts: open the full editor.'));
    }
    const payloadKg = Math.round(fc.sum.payloadMass || 100);
    foot.append(verdict,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big grow', id: 'simple-launch', onclick: () => { if (!app.project.mission) { toast('Pick where to go first.', 'info'); app.navigate('planner'); } else app.navigate('simulation'); } }, isRocket ? 'Launch it' : 'Test it'),
        h('button', { class: 'btn', id: 'simple-make', title: 'Let the AI design a rocket for you', onclick: () => app.navigate('ai', { prefill: `Build me a two-stage rocket carrying a ${payloadKg} kg space probe.`, send: true }) }, 'Auto-build')),
      h('button', { class: 'btn small', id: 'open-full-editor', onclick: () => ctx.openFull() }, 'Full editor'));
  };
}
