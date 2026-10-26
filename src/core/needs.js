// "What is still missing?" Pure, headless checks that turn every reason a simulation cannot (or should not) start into a plain item:
// what is wrong, why it matters, where to fix it, and - when a safe automatic fix exists - the exact tool call that applies it.
// Nothing is simulated here: the items come from validateVehicle, analyzeVehicle, the mission definition and the catalog.
// Fixes go through the same tool API the AI uses (ai/toolapi.js), so they are validated, undoable and identical to what the AI would do.
import { validateVehicle, analyzeVehicle, stageOrder } from '../vehicles/analysis.js';
import { ascentDvNeeded } from './readiness.js';
import { modifyComponent } from '../vehicles/vehicle.js';
import { byCatalogId } from '../../data/components.js';
import { thrustFix, engineFix, tankSteps, toolFix, stageName, analyse, fixForIssue, decouplerFix, runEdit, NO_FIX } from './autofix.js';

const TANK_KINDS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
const isTank = (c) => TANK_KINDS.includes(c.kind);
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const clone = (x) => JSON.parse(JSON.stringify(x));
const round1 = (x) => Math.round(x * 10) / 10;

/** The checklist groups, in the order they are shown. */
export const CHECK_LABELS = {
  vehicle: 'You have a rocket',
  build: 'Engines and fuel tanks',
  thrust: 'Strong enough to lift off',
  dv: 'Enough fuel to get there',
  payload: 'Something to carry',
  mission: 'A goal (mission)',
  comms: 'Can talk to Earth',
  other: 'The design is valid',
  running: 'Nothing else is running',
};
const GROUP_ORDER = Object.keys(CHECK_LABELS);

/** Mission kind that suits a vehicle type (argument of CREATE_MISSION). */
export function missionKindFor(type) {
  return { rocket: 'launch', lander: 'landing', rover: 'rover', spacecraft: 'orbit_raise', satellite: 'orbit_raise', probe: 'probe_operations' }[type] ?? 'launch';
}
const VEHICLE_WORD = { rocket: 'rocket', lander: 'lander', rover: 'rover', probe: 'probe', satellite: 'satellite', spacecraft: 'spacecraft' };

/** Which vehicle type a mission needs, or null when it is open to any. */
export function missionNeedsType(m) {
  if (!m) return null;
  if (m.guidance?.mode === 'ascent' && m.initial?.type === 'pad') return 'rocket';
  if (m.objective?.type === 'landing') return 'lander';
  if (m.objective?.type === 'traverse') return 'rover';
  return null;
}

const SCREEN_WHERE = { designer: 'Rocket Builder', planner: 'Mission Planner', simulation: 'Launch', control: 'Mission Control' };
const KIND_WORD = { engine: 'Engine', fuel_tank: 'Fuel tank', payload: 'Payload', avionics: 'Computer', battery: 'Battery', antenna: 'Antenna' };
const whereOf = (v, o) => { const p = o.show?.params ?? {}; return [SCREEN_WHERE[o.show?.screen] ?? 'Rocket Builder', p.stage && v ? stageName(v, p.stage) : null, p.addKind ? KIND_WORD[p.addKind] ?? p.addKind : null].filter(Boolean).join(' > '); };
const show = (screen, params = {}) => ({ screen, params });


/** Apply the same change MODIFY_STAGE makes (propellant x factor, engine count) to a copy, to test a fix before offering it. */
function withPropellantScale(v, stageIds, factor) {
  const c = clone(v);
  for (const t of c.components) if (stageIds.includes(t.group) && isTank(t)) modifyComponent(c, t.id, { propellantMass: Math.max(1, round1(t.propellantMass * factor)) });
  return c;
}

/** Smallest "add N % fuel" that closes a delta-v gap, found by really re-analysing the changed design. */
function fuelFix(v, body, need, stages) {
  const withProp = stages.filter((s) => v.components.some((c) => c.group === s.id && isTank(c)));
  const tries = [...withProp.slice().reverse().map((s) => [s.id]), ...(withProp.length > 1 ? [withProp.map((s) => s.id)] : [])];
  for (const ids of tries) {
    for (let pct = 5; pct <= 300; pct += 5) {
      const a = analyse(withPropellantScale(v, ids, 1 + pct / 100), body);
      if (a && a.dvEstimate >= need * 1.03 && a.liftoffTWR >= 1.0) return { ids, pct };
    }
  }
  return null;
}

const navFix = (label, screen, params = {}) => ({ label, kind: 'navigate', screen, params });

/**
 * @param project a Project (vehicle, mission, environment)
 * @param {{body?:string, running?:boolean}} opts
 * @returns {{id:string, group:string, severity:'block'|'warn', title:string, why:string, where:string, show:{screen,params}, fix:object|null, componentId?:string, stageId?:string}[]}
 */
export function launchNeeds(project, { body = null, running = false } = {}) {
  const out = [];
  const v = project?.vehicle ?? null, m = project?.mission ?? null;
  const bodyId = body ?? v?.meta?.body ?? project?.environment?.body ?? 'earth';
  const add = (o) => { if (!out.some((x) => x.id === o.id)) out.push({ fix: null, ...o, where: o.where ?? whereOf(v, o) }); };

  // ---------------------------------------------------------------- running
  if (running) add({ id: 'running', group: 'running', severity: 'block', title: 'A flight is already running', why: 'Only one flight at a time.', show: show('control'), fix: toolFix('Stop it', { tool: 'STOP_SIMULATION', args: {} }, { noCommit: true }) });

  // ---------------------------------------------------------------- vehicle
  const emptyVehicle = v && !v.components?.length;
  if (!v || emptyVehicle) {
    const alt = m?.objective?.altitude ?? 200000;
    add({ id: 'no-vehicle', group: 'vehicle', severity: 'block', title: v ? 'Your rocket is empty' : 'You need a rocket', why: 'There is nothing to fly yet.', show: show('designer', { full: false, note: 'Start with a starter rocket.' }),
      fix: toolFix('Build me a starter rocket', { tool: 'CREATE_VEHICLE', args: { type: 'rocket', auto: true, payloadMass: 100, targetAltitude: alt, name: 'Starter rocket' } }) });
  }

  // ---------------------------------------------------------------- mission
  if (!m) {
    add({ id: 'no-mission', group: 'mission', severity: 'block', title: 'You need a mission', why: 'It says where to go.', show: show('planner'),
      fix: v && !emptyVehicle ? toolFix('Plan a mission for me', { tool: 'CREATE_MISSION', args: { kind: missionKindFor(v.type), ...(v.type === 'rocket' ? { altitude: v.meta?.targetAltitude ?? 200000 } : {}) } }) : navFix('Open the planner', 'planner') });
  } else if (v && !emptyVehicle) {
    const need = missionNeedsType(m);
    if (need && need !== v.type) {
      add({ id: 'mission-mismatch', group: 'mission', severity: 'block', title: 'Mission does not suit this vehicle', why: `This goal needs a ${VEHICLE_WORD[need]}. You have a ${VEHICLE_WORD[v.type] ?? v.type}.`, show: show('planner'),
        fix: toolFix(`Make a ${VEHICLE_WORD[v.type] ?? v.type} mission`, { tool: 'CREATE_MISSION', args: { kind: missionKindFor(v.type), ...(v.type === 'rocket' ? { altitude: v.meta?.targetAltitude ?? 200000 } : {}) } }) });
    }
  }

  if (v && !emptyVehicle) {
    const issues = (() => { try { return validateVehicle(v, { body: bodyId }); } catch { return []; } })();
    const hasCode = (c) => issues.filter((i) => i.code === c);
    const stages = v.type === 'rocket' ? stageOrder(v) : [];
    const eng = (g) => v.components.filter((c) => c.kind === 'engine' && c.group === g);
    const handled = new Set(['NO_ENGINE', 'STAGE_NO_ENGINE', 'NO_FEED', 'LOW_TWR', 'MARGINAL_TWR', 'NO_GUIDANCE', 'NO_POWER', 'EXPOSED_PAYLOAD', 'PANELS_STOWED', 'DISH_POINTING', 'EMPTY', 'ATMOSPHERIC_ENTRY']);

    // ---- engines and tanks (rocket stages)
    if (v.type === 'rocket' || v.type === 'lander') {
      const engines = v.components.filter((c) => c.kind === 'engine');
      if (!engines.length && !stages.length) {
        add({ id: 'no-engine', group: 'build', severity: 'block', title: 'Your rocket has no engine', why: 'Engines make the push.', show: show('designer', { full: true, addKind: 'engine', note: 'Add an engine to lift off.' }),
          fix: v.type === 'rocket' ? toolFix('Add a first stage with an engine', { tool: 'CREATE_STAGE', args: { engine: 'eng-al500', engineCount: 1, propellantMass: 40000, order: 1 } }) : fixForIssue(v, { code: 'NO_ENGINE' }, { body: bodyId }) });
      }
      stages.forEach((s, i) => {
        const es = eng(s.id), tanks = v.components.filter((c) => c.group === s.id && isTank(c) && (c.propellantMass ?? 0) > 0);
        const nm = stageName(v, s.id);
        const passenger = !es.length && !tanks.length && v.components.some((c) => c.group === s.id) && !v.components.some((c) => c.group === s.id && (c.kind === 'engine' || isTank(c)));   // cargo that rides along (a rover on a lander): no engine needed
        if (passenger) return;
        if (!es.length) {
          const pick = engineFix(v, bodyId, s, i);
          add({ id: `stage-no-engine:${s.id}`, group: 'build', severity: 'block', stageId: s.id, title: `${nm} has no engine`, why: 'It cannot push without one.', show: show('designer', { full: true, stage: s.id, addKind: 'engine', note: `${nm} needs an engine.` }),
            fix: pick ? toolFix(`Add ${pick.n > 1 ? pick.n + ' × ' : 'an '}${pick.e.name.replace(/ \(.*\)/, '')}`, { tool: 'ADD_COMPONENT', args: { catalogId: pick.e.catalogId, group: s.id, mount: 'stack', count: pick.n } }, { place: { group: s.id, where: 'start' } }) : null });
        } else if (!tanks.length && es.some((e) => !e.solid)) {
          const e = es.find((x) => !x.solid);
          const steps = tankSteps(v, e, s.id);
          add({ id: `stage-no-tank:${s.id}`, group: 'build', severity: 'block', stageId: s.id, componentId: e.id, title: `${nm} has no fuel tank`, why: 'The engine needs fuel.', show: show('designer', { full: true, stage: s.id, select: e.id, addKind: 'fuel_tank', note: `${nm} needs fuel tanks.` }),
            fix: steps.length ? toolFix('Add the fuel tanks', steps, { place: { group: s.id, where: 'end' } }) : null });
        } else {
          // one tank present but the other propellant is missing (for example fuel without oxidizer)
          for (const i2 of hasCode('NO_FEED').filter((x) => es.some((e) => e.id === x.componentId))) {
            const e = es.find((x) => x.id === i2.componentId); const steps = tankSteps(v, e, s.id);
            if (!out.some((o) => o.id === `stage-no-tank:${s.id}`)) add({ id: `stage-no-tank:${s.id}`, group: 'build', severity: 'block', stageId: s.id, componentId: e.id, title: `${nm} is missing a tank`, why: `It burns ${e.propellants.join(' and ')}. One tank is missing.`, show: show('designer', { full: true, stage: s.id, select: e.id, addKind: 'fuel_tank', note: `${nm} needs another tank.` }),
              fix: steps.length ? toolFix('Add the missing tank', steps, { place: { group: s.id, where: 'end' } }) : null });
          }
        }
      });
      // a NO_FEED on an engine outside the listed stages (for example a lander): plain item without a fix
      for (const i2 of hasCode('NO_FEED')) {
        const e = v.components.find((c) => c.id === i2.componentId);
        if (!e || out.some((o) => o.group === 'build' && o.stageId === e.group)) continue;
        add({ id: `feed:${e.id}`, group: 'build', severity: 'block', componentId: e.id, title: `${e.name.replace(/ \(.*\)/, '').slice(0, 28)} has no fuel`, why: 'Its engine has no tank with the right fuel.', show: show('designer', { full: true, select: e.id, addKind: 'fuel_tank', note: 'This engine needs a matching tank.' }) });
      }
    }

    // ---- thrust and delta-v
    const a = (v.type === 'rocket' && v.components.some((c) => c.kind === 'engine')) ? analyse(v, bodyId) : null;
    if (a && stages.length && eng(stages[0].id).length) {
      const s1 = stages[0].id;
      if (a.liftoffTWR < 1) {
        const f = thrustFix(v, bodyId, s1);
        add({ id: 'low-twr', group: 'thrust', severity: 'block', stageId: s1, title: 'The rocket is too heavy to lift', why: `Push is ${a.liftoffTWR.toFixed(2)} times weight. It needs over 1.`, show: show('designer', { full: true, stage: s1, note: 'Add thrust: more engines or a bigger engine.' }),
          fix: f ? toolFix(`Use ${f.count} engines in ${stageName(v, s1)}`, { tool: 'MODIFY_STAGE', args: { stage: s1, engineCount: f.count } }) : fixForIssue(v, { code: 'LOW_TWR' }, { body: bodyId }) });
      } else if (a.liftoffTWR < 1.2) {
        const f = thrustFix(v, bodyId, s1);
        add({ id: 'marginal-twr', group: 'thrust', severity: 'warn', stageId: s1, title: 'Lift-off push is very weak', why: `Push is only ${a.liftoffTWR.toFixed(2)} times weight. Aim for 1.3.`, show: show('designer', { full: true, stage: s1, note: 'More thrust gives a stronger lift-off.' }),
          fix: f ? toolFix(`Use ${f.count} engines in ${stageName(v, s1)}`, { tool: 'MODIFY_STAGE', args: { stage: s1, engineCount: f.count } }) : fixForIssue(v, { code: 'LOW_TWR' }, { body: bodyId }) });
      }
      const launches = m && m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit';
      if (launches) {
        let need = 0; try { need = ascentDvNeeded(bodyId, m.objective.altitude ?? 200000, Math.abs(m.initial.lat ?? 28.5)); } catch { need = 0; }
        if (need > 0 && a.dvEstimate < need) {
          const short = need - a.dvEstimate;
          const f = fuelFix(v, bodyId, need, stages);
          const who = f ? (f.ids.length > 1 ? 'all stages' : stageName(v, f.ids[0])) : null;
          add({ id: 'low-dv', group: 'dv', severity: 'warn', title: 'Not enough fuel to reach orbit', why: `Short by about ${f0(short)} m/s of speed.`, stageId: f?.ids[f.ids.length - 1], show: show('designer', { full: true, stage: f?.ids[f.ids.length - 1] ?? stages[stages.length - 1].id, note: `Add fuel: about ${f0(short)} m/s is missing.` }),
            fix: f ? toolFix(`Add ${f.pct}% fuel to ${who}`, f.ids.map((id) => ({ tool: 'MODIFY_STAGE', args: { stage: id, propellantScale: 1 + f.pct / 100 } }))) : null, meta: { need, have: a.dvEstimate, short } });
        }
      }
    }

    // ---- payload (rocket)
    if (v.type === 'rocket' && v.components.some((c) => c.kind === 'engine') && !v.components.some((c) => c.group === 'payload')) {
      add({ id: 'no-payload', group: 'payload', severity: 'warn', title: 'Nothing to carry', why: 'It will fly, but carries nothing.', show: show('designer', { full: true, addKind: 'payload', note: 'Add a payload to the nose.' }),
        fix: toolFix('Add a 100 kg probe', { tool: 'ADD_PAYLOAD', args: { mass: 100 } }) });
    }

    // ---- guidance and power
    if (hasCode('NO_GUIDANCE').length && v.type === 'rocket') {
      const top = stages.length ? stages[stages.length - 1].id : 'main';
      add({ id: 'no-guidance', group: 'other', severity: 'warn', title: 'No flight computer', why: 'Nothing can steer.', show: show('designer', { full: true, stage: top, addKind: 'avionics', note: 'Add a flight computer.' }),
        fix: toolFix('Add a flight computer', { tool: 'ADD_COMPONENT', args: { catalogId: 'avionics-flight', group: top, mount: 'stack' } }) });
    }
    for (const i2 of hasCode('NO_POWER')) {
      const av = v.components.find((c) => ['avionics', 'guidance', 'computer'].includes(c.kind) && c.powerDraw);
      add({ id: 'no-power', group: 'other', severity: 'block', componentId: av?.id, title: 'No battery for the computer', why: 'The computer needs power.', show: show('designer', { full: true, select: av?.id, addKind: 'battery', note: 'Add a battery.' }),
        fix: toolFix('Add a battery', { tool: 'ADD_COMPONENT', args: { catalogId: 'battery-500', group: av?.group ?? 'payload', mount: 'stack' } }) });
      void i2; break;
    }

    // ---- rover parts: add only what is missing (never replace the student's rover)
    if (v.type === 'rover') {
      const miss = issues.filter((i) => /^ROVER_NO_/.test(i.code));
      if (miss.length) {
        const steps = miss.flatMap((i) => fixForIssue(v, i, { body: bodyId })?.steps ?? []);
        add({ id: 'rover-parts', group: 'build', severity: 'block', title: 'The rover is missing parts', why: miss.map((i) => i.message.replace(/^A rover needs /, '').replace(/\.$/, '')).join(', ') + '.', show: show('designer', { full: true, note: 'A rover needs a chassis, wheels, motors and a battery.' }),
          fix: steps.length ? toolFix(`Add the missing part${steps.length > 1 ? 's' : ''}`, steps) : toolFix('Build a starter rover', { tool: 'CREATE_ROVER', args: {} }) });
      }
    }

    // ---- rocket payload in the open: add a fairing
    if (v.type === 'rocket' && hasCode('EXPOSED_PAYLOAD').length) {
      add({ id: 'no-fairing', group: 'other', severity: 'warn', title: 'The payload has no fairing', why: 'Wind and heat would hit it.', show: show('designer', { full: true, addKind: 'fairing', note: 'Add a fairing around the payload.' }),
        fix: fixForIssue(v, { code: 'EXPOSED_PAYLOAD' }, { body: bodyId }) });
    }

    // ---- stages that fall away need a separation ring (decoupler / interstage)
    if (v.type === 'rocket' && stages.length > 1) {
      stages.slice(0, -1).forEach((s) => {
        if (v.components.some((c) => c.group === s.id && ['decoupler', 'interstage'].includes(c.kind))) return;
        if (!v.components.some((c) => c.group === s.id)) return;
        add({ id: `stage-no-decoupler:${s.id}`, group: 'build', severity: 'warn', stageId: s.id, title: `${stageName(v, s.id)} has no separation ring`, why: 'It lets the used stage drop off.', show: show('designer', { full: true, stage: s.id, addKind: 'decoupler', note: 'Add a decoupler to this stage.' }), fix: decouplerFix(v, s.id) });
      });
    }

    // ---- probes, satellites, spacecraft: power and radio
    if (['probe', 'satellite', 'spacecraft'].includes(v.type)) {
      const g0 = v.components[0]?.group ?? 'main';
      if (!v.components.some((c) => c.kind === 'battery' || c.kind === 'solar_panel')) {
        add({ id: 'no-power-source', group: 'other', severity: 'block', title: `The ${VEHICLE_WORD[v.type]} has no power`, why: 'Add a battery or solar panel.', show: show('designer', { full: true, addKind: 'battery', note: 'Add a battery or solar panel.' }),
          fix: toolFix('Add a battery and a solar panel', [{ tool: 'ADD_COMPONENT', args: { catalogId: 'battery-100', group: g0, mount: 'stack' } }, { tool: 'ADD_COMPONENT', args: { catalogId: 'solar-1', group: g0, mount: 'radial' } }]) });
      }
      if (!v.components.some((c) => c.kind === 'antenna')) {
        add({ id: 'no-antenna', group: 'comms', severity: 'warn', title: `The ${VEHICLE_WORD[v.type]} has no antenna`, why: 'It cannot call Earth.', show: show('designer', { full: true, addKind: 'antenna', note: 'Add an antenna to talk to Earth.' }),
          fix: toolFix('Add an antenna', { tool: 'ADD_COMPONENT', args: { catalogId: 'ant-omni', group: g0, mount: 'radial' } }) });
      }
    }

    // ---- every other validator error / warning, in plain words
    const PLAIN = {
      DUP_ID: ['Two parts share one name', 'Each part needs its own id.'],
      NO_PROPELLANT_DEF: ['An engine has no fuel set', 'Choose what the engine burns.'],
      PAYLOAD_TOO_LONG: ['The payload is too long', 'It does not fit in the nose.'],
      PAYLOAD_TOO_BIG: ['The payload is too big', 'It does not fit in the nose.'],
      PAYLOAD_TOO_WIDE: ['The payload is too wide', 'It is too wide for the nose.'],
      ORPHAN: ['A part is attached to nothing', 'The part it holds on to is gone.'],
      TANK_UNUSED: ['A tank that no engine uses', 'Its fuel is never burned.'],
      BAD_PROPELLANT_PAIR: ['These fuels do not burn together', 'Engines need fuel and oxygen.'],
      VAC_ENGINE_SL: ['A space engine at the bottom', 'It is weak in thick air.'],
      DIAMETER_STEP: ['Two parts differ a lot in width', 'A big step adds drag.'],
      NO_LEGS: ['The lander has no legs', 'It may tip over.'],
    };
    for (const i2 of issues) {
      if (handled.has(i2.code) || /^ROVER_NO_/.test(i2.code) || i2.severity === 'info') continue;
      if (i2.severity === 'warning' && !['NO_LEGS', 'TANK_UNUSED', 'BAD_PROPELLANT_PAIR', 'VAC_ENGINE_SL', 'DIAMETER_STEP'].includes(i2.code)) continue;
      const [title, why] = PLAIN[i2.code] ?? ['A design problem needs fixing', 'Open the editor.'];
      const c = i2.componentId ? v.components.find((x) => x.id === i2.componentId) : null;
      add({ id: `issue:${i2.code}:${i2.componentId ?? ''}`, group: 'other', severity: i2.severity === 'error' ? 'block' : 'warn', componentId: i2.componentId, title, why: PLAIN[i2.code] ? why : (i2.message.length > 90 ? why : i2.message),
        show: show('designer', { full: true, select: i2.componentId, stage: c?.group, note: title + '.' }),
        fix: fixForIssue(v, i2, { body: bodyId }) });
    }
    // EMPTY handled by no-vehicle; nothing else
  }

  // ---------------------------------------------------------------- comms (mission asks for a link to the ground)
  if (m?.objective?.requireComms) {
    if (v && !v.components.some((c) => c.kind === 'antenna')) {
      add({ id: 'no-antenna', group: 'comms', severity: 'block', title: 'The probe has no antenna', why: 'This goal sends data home.', show: show('designer', { full: true, addKind: 'antenna', note: 'Add an antenna to talk to Earth.' }),
        fix: toolFix('Add an antenna', { tool: 'ADD_COMPONENT', args: { catalogId: 'ant-omni', group: v.components.find((c) => c.kind === 'battery')?.group ?? v.components[0]?.group ?? 'main', mount: 'radial' } }) });
    }
    if (!project?.environment?.groundStation) {
      add({ id: 'no-station', group: 'comms', severity: 'block', title: 'No ground station on Earth', why: 'Data needs a dish on the ground.', show: show('planner'), fix: navFix('Open the planner', 'planner') });
    }
  }

  // stable order: group order, then blocking first
  return out.sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || (x.severity === y.severity ? 0 : x.severity === 'block' ? -1 : 1));
}

/**
 * The checklist the panel shows: one line per thing that must be right, green when it is, plus the needs behind every red / amber line.
 * @returns {{needs:object[], blocking:object[], checks:{id,label,status:'ok'|'warn'|'block'|'wait'}[], ready:number, total:number}}
 */
export function launchChecklist(project, opts = {}) {
  const needs = launchNeeds(project, opts);
  const v = project?.vehicle ?? null, m = project?.mission ?? null;
  const hasV = !!(v && v.components?.length);
  const launches = !!(m && m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit');
  const present = new Set(['vehicle', 'build', 'thrust', 'mission']);
  if (launches) present.add('dv');
  if (!v || v.type === 'rocket') present.add('payload');
  if (m?.objective?.requireComms) present.add('comms');
  if (v && v.type !== 'rocket') present.delete('thrust');
  for (const n of needs) present.add(n.group);
  const checks = GROUP_ORDER.filter((g) => present.has(g)).map((g) => {
    const items = needs.filter((n) => n.group === g);
    let status = items.some((n) => n.severity === 'block') ? 'block' : items.length ? 'warn' : 'ok';
    if (!items.length && !hasV && ['build', 'thrust', 'dv', 'payload'].includes(g)) status = 'wait';
    const label = g === 'vehicle' && v && v.type !== 'rocket' ? `You have a ${VEHICLE_WORD[v.type] ?? 'vehicle'}` : CHECK_LABELS[g];
    return { id: g, label, status };
  });
  return { needs, blocking: needs.filter((n) => n.severity === 'block'), checks, ready: checks.filter((c) => c.status === 'ok').length, total: checks.length };
}

/**
 * Apply a need's fix through the same validated tool API the AI uses. Stops at the first step that fails.
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function applyNeedFix(api, fix) {
  if (!fix || fix.kind !== 'tool') return { ok: false, message: 'There is no automatic fix for this.' };
  for (const st of fix.steps ?? [{ tool: fix.tool, args: fix.args }]) {
    if (st.edit) { try { runEdit(api.vehicle(st.vehicle), st); } catch (e) { return { ok: false, message: e.message }; } continue; }
    const r = await api.execute(st.tool, st.args);
    if (!r.ok) return { ok: false, message: r.message };
  }
  return { ok: true, message: `Done: ${fix.label}.` };
}

/** Replay / analysis / telemetry need a recorded flight. Returns [] when one is selected and exists. */
export function runNeeds(project, selectedRun = null) {
  const runs = project?.runs ?? [];
  if (runs.length && (!selectedRun || runs.some((r) => r.id === selectedRun))) return [];
  return [{ id: 'no-run', group: 'running', severity: 'block', title: 'No flight to look at yet', why: 'Fly once, then come back.', where: 'Launch', show: show('simulation'), fix: navFix('Go to Launch', 'simulation') }];
}

export { byCatalogId, NO_FIX };
