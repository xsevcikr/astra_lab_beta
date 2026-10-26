// "Create vehicle" dialogs: use the same design plans as the AI engineer, applied as one undo step.
import { h, clear, modal, toast } from './dom.js';
import { numberInput, select } from './widgets.js';
import { rocketBuildPlan, probeBuildPlan, roverBuildPlan, landerBuildPlan, spacecraftBuildPlan } from '../../ai/design.js';
import { applyPlan } from '../../ai/plan.js';

export const VEHICLE_KINDS = [
  ['rocket', 'ROCKET', 'rocket', 'Launches a payload'],
  ['spacecraft', 'SPACECRAFT', 'satellite', 'Flies in orbit'],
  ['probe', 'PROBE', 'probe', 'Small, with instruments'],
  ['rover', 'ROVER', 'rover', 'Drives on the ground'],
  ['lander', 'LANDER', 'lander', 'Lands on the Moon'],
];

export function createVehicleDialog(app, kind, { then } = {}) {
  const v = { name: '', mass: 100, altitude: 200, margin: 1.05, body: 'moon', dv: 1800 };
  const rows = [];
  const field = (label, control, hint) => h('label', { class: 'field' }, label, control, hint ? h('span', { class: 'muted' }, hint) : null);
  const name = h('input', { class: 'input', type: 'text', placeholder: 'Leave empty for a name' });
  rows.push(field('Name', name));
  if (kind === 'rocket') {
    rows.push(field('Payload', numberInput({ value: 100, min: 1, max: 1500, unit: 'kg', onchange: (x) => (v.mass = x) })));
    rows.push(field('Orbit height', numberInput({ value: 200, min: 150, max: 1500, unit: 'km', onchange: (x) => (v.altitude = x) })));
    rows.push(h('div', { class: 'std-only' }, field('Safety margin on Δv', numberInput({ value: 1.05, min: 1.0, max: 1.5, step: 0.01, onchange: (x) => (v.margin = x) }), 'An estimate. Only a flight shows if it works.')));
  } else if (kind === 'probe') rows.push(field('Probe weight', numberInput({ value: 100, min: 5, max: 3000, unit: 'kg', onchange: (x) => (v.mass = x) })));
  else if (kind === 'rover') rows.push(field('Rover weight', numberInput({ value: 150, min: 10, max: 2000, unit: 'kg', onchange: (x) => (v.mass = x) })), field('Surface', select([['moon', 'Moon'], ['mars', 'Mars']], 'moon', (x) => (v.body = x))));
  else if (kind === 'lander') rows.push(field('Payload mass', numberInput({ value: 150, min: 10, max: 3000, unit: 'kg', onchange: (x) => (v.mass = x) })), field('Landing body', select([['moon', 'Moon']], 'moon', (x) => (v.body = x)), 'Mars landings are not modelled yet.'));
  else rows.push(field('Empty weight', numberInput({ value: 400, min: 20, max: 20000, unit: 'kg', onchange: (x) => (v.mass = x) })), field('Speed budget (Δv)', numberInput({ value: 1800, min: 50, max: 8000, unit: 'm/s', onchange: (x) => (v.dv = x) })));
  const info = h('div', { class: 'note info' }, 'Generic parts. Change anything in the designer.');
  modal({
    title: `New ${kind}`, body: h('div', { class: 'col' }, rows, info),
    buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: async () => {
      let plan;
      const nm = name.value.trim() || undefined;
      try {
        if (kind === 'rocket') plan = rocketBuildPlan({ payloadMass: v.mass, altitude: v.altitude * 1000, dvMargin: v.margin, name: nm });
        else if (kind === 'probe') plan = probeBuildPlan({ mass: v.mass, name: nm ?? 'Space probe' });
        else if (kind === 'rover') plan = roverBuildPlan({ mass: v.mass, name: nm ?? 'Rover', body: v.body });
        else if (kind === 'lander') plan = landerBuildPlan({ payloadMass: v.mass, name: nm ?? 'Lander', body: v.body });
        else plan = spacecraftBuildPlan({ type: 'spacecraft', dv: v.dv, mass: v.mass, name: nm });
        const r = await applyPlan(app.session, plan);
        if (!r.ok) { toast(r.error, 'bad', 9000); return false; }
        app.session.rememberAliases(); app.markDirty(); app.emit('design', 'created');
        if (kind === 'rocket' && app.project.mission) testFlyDialog(app, () => then?.(app.project.vehicle));
        else { toast(`Created ${app.project.vehicle.name}. Launch it to test.`, 'ok', 6000); then?.(app.project.vehicle); }
      } catch (e) { toast(`Could not create it: ${e.message}`, 'bad', 9000); return false; }
      return true;
    } }],
  });
}

/**
 * A new rocket is flown once for real. If it does not work, "Fix it and fly again" (src/core/makeitfly.js) improves it until it does.
 * "Skip" stops at once and keeps the rocket as it was made. `done()` is called exactly once (to open the builder).
 */
export function testFlyDialog(app, done) {
  let ended = false;
  const bar = h('div', { id: 'tf-bar', style: { width: '3%' } }), msg = h('div', { id: 'tf-msg', class: 'muted' }, 'Test flight 1');
  const foot = h('div', { class: 'row' });
  const body = h('div', { class: 'col mif-test-modal', id: 'tf-body' }, h('div', { class: 'progress', id: 'tf-progress' }, bar), msg, foot);
  const m = modal({ title: 'Test flying your rocket...', body, buttons: [] });
  const end = () => { if (ended) return; ended = true; clearInterval(watch); m.close(); done(); };
  foot.append(h('button', { class: 'btn', id: 'tf-skip', onclick: () => { app.stopFix(); app.api.execute('STOP_SIMULATION'); toast('Skipped the test flight.', 'info', 3000); end(); } }, 'Skip'));
  const watch = setInterval(() => { if (!body.isConnected) { app.stopFix(); end(); } }, 300);   // closed with the x: same as Skip
  app.makeItFly({ onProgress: (p) => { if (ended) return; bar.style.width = `${Math.round(100 * p.pct)}%`; msg.textContent = p.text; } }).then((r) => {
    if (ended) return;
    clearInterval(watch);
    clear(body).append(h('div', { class: 'callout ' + (r.ok ? 'ok' : 'warn'), id: 'tf-result' }, r.summary),
      h('div', { class: 'row' }, h('button', { class: 'btn primary big', id: 'tf-open', onclick: end }, 'Open the builder')));
  });
  return m;
}
