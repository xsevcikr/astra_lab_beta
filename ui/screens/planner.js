// Mission Planner: mission list, objective, guidance, environment, and the event timeline (conditions -> actions) with an editor.
import { parseSounding, describeSounding } from '../../src/core/sounding.js';
import { icon } from '../lib/icons.js';
import { h, clear, toast, modal, fmt, confirmDialog } from '../lib/dom.js';
import { panel, kv, select, numberInput, stat, emptyState, statusBadge, pickFile } from '../lib/widgets.js';
import { parseOPM } from '../../src/core/ccsds.js';
import { LAUNCH_SITES, listBodies } from '../../physics/bodies.js';
import { CONDITION_TYPES, ACTION_TYPES } from '../../physics/mission-exec.js';
import { gloss } from '../lib/glossary.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const KM = new Set(['altitude', 'radarAltitude', 'apoapsis', 'periapsis']);
const UNIT = { altitude: 'km', radarAltitude: 'km', apoapsis: 'km', periapsis: 'km', speed: 'm/s', surfaceSpeed: 'm/s', verticalSpeed: 'm/s', mach: '', dynamicPressure: 'Pa', gload: 'g', eccentricity: '', inclination: '°', timeToApoapsis: 's', timeToPeriapsis: 's', mass: 'kg', twr: '', acceleration: 'm/s²', missionTime: 's' };
const VALUE_TYPES = Object.keys(UNIT);

export function describeCond(c, mission) {
  if (!c) return '–';
  switch (c.type) {
    case 'time': return `at T+${c.value} s`;
    case 'always': return 'immediately';
    case 'event': return `${c.delay ? c.delay + ' s after ' : 'when '}“${mission?.events.find((e) => e.id === c.id)?.name ?? c.id}” ${c.delay ? '' : 'is done'}`;
    case 'propellant': return `propellant of ${c.group ?? 'vehicle'} ${c.op ?? '<='} ${(100 * (c.value ?? 0)).toFixed(1)} %`;
    case 'enginesOut': return `engines of ${c.group ?? 'vehicle'} are out`;
    case 'all': return c.conditions.map((x) => describeCond(x, mission)).join(' AND ');
    case 'any': return c.conditions.map((x) => describeCond(x, mission)).join(' OR ');
    case 'inSunlight': return 'in sunlight'; case 'linkClosed': return 'ground link closed'; case 'landed': return 'after landing'; case 'inOrbit': return 'in orbit';
    default: if (VALUE_TYPES.includes(c.type)) { const km = KM.has(c.type); return `${c.type} ${c.op ?? '>='} ${km ? fmt(c.value / 1000, 1) + ' km' : c.value + (UNIT[c.type] ? ' ' + UNIT[c.type] : '')}`; } return JSON.stringify(c);
  }
}
export function describeAction(a) {
  if (!a) return '–';
  const g = a.group ? ` ${a.group}` : '';
  switch (a.type) {
    case 'IGNITE': return `Ignite${g}`; case 'SHUTDOWN': return `Shut down${g}`; case 'THROTTLE': return `Throttle${g} to ${(100 * (a.value ?? 1)).toFixed(0)} %`;
    case 'SEPARATE': return `Separate${g}`; case 'DEPLOY_PAYLOAD': return `Deploy payload${g}`; case 'DEPLOY': return `Deploy ${a.target ?? a.group ?? 'all'}`;
    case 'SET_GUIDANCE': return `Guidance: ${a.mode}`; case 'BURN': return `Burn${g} ${a.direction ?? ''} Δv ${typeof a.dv === 'number' ? fmt(a.dv, 0) + ' m/s' : a.dv}`;
    case 'LAND': return `Powered landing${g}`; case 'DRIVE': return `Drive ${a.distance} m at heading ${a.heading}°`; case 'MEASURE': return `Measure (${a.instrument ?? 'all'}) ${a.duration ?? ''} s`;
    case 'TRANSMIT': return `Transmit ${a.duration ?? 60} s`; case 'END_MISSION': return `End mission (${a.status ?? 'ended'})`; case 'LOG': return `Note: ${a.message}`;
    default: return a.type + (a.group ? ` ${a.group}` : '');
  }
}

// Where-to-go choices for beginners (the altitude is the target orbit; the mission generator does the rest).
export const DESTINATIONS = [
  { km: 100, emoji: 'cloud', title: 'Touch space', sub: '100 km - the edge of space' },
  { km: 200, emoji: 'earth', title: 'Low Earth orbit', sub: '200 km - circle the Earth' },
  { km: 400, emoji: 'satellite', title: 'Space-station height', sub: '400 km - where crews live' },
  { km: 1000, emoji: 'orbit', title: 'High orbit', sub: '1,000 km - far above, needs a strong rocket' },
];
/** Plain-language mission steps derived from the real mission events. */
export function plainSteps(m) {
  const stageNo = (g) => (/^stage(\d+)$/.exec(g ?? '') ?? [])[1];
  return m.events.map((e, i) => {
    const a = e.action ?? {}, g = a.group, n = stageNo(g);
    switch (a.type) {
      case 'IGNITE': return ['flame', i === 0 || n === '1' ? `Liftoff! ${n ? `Stage ${n}` : 'The'} engines fire.` : `${n ? `Stage ${n}` : 'Next stage'} engines start.`];
      case 'SEPARATE': return g === 'fairing' ? ['nose', 'The nose cover falls away.'] : ['split', `${n ? `Stage ${n}` : 'The empty stage'} drops away.`];
      case 'SHUTDOWN': return ['stop', `${n ? `Stage ${n}` : 'The'} engines switch off. The rocket coasts.`];
      case 'BURN': return ['refresh', a.dv === 'circularize' ? 'A short burn makes the orbit round.' : 'A burn changes the orbit.'];
      case 'DEPLOY_PAYLOAD': return ['box', 'The payload is released.'];
      case 'DEPLOY': return ['sun', 'Solar panels unfold.'];
      case 'SET_GUIDANCE': return ['compass', a.mode === 'sun_point' ? 'Panels turn to the Sun.' : 'The craft turns.'];
      case 'LAND': return ['landing', 'The engine slows it for landing.'];
      case 'DRIVE': return ['car', `The rover drives ${Math.round(a.distance ?? 0)} m.`];
      case 'MEASURE': return ['experiments', 'Instruments take measurements.'];
      case 'TRANSMIT': return ['antenna', 'Data is sent home.'];
      case 'END_MISSION': return ['flag', 'The mission ends.'];
      default: return ['more', e.name];
    }
  });
}

export default {
  id: 'planner', title: 'Mission Planner',
  mount(root, app) {
    const S = { sel: null };
    const page = h('div', { class: 'page' }); root.append(page);
    const P = () => app.project;
    const commit = (l) => { app.commit(l, { silent: true }); render(); };

    function render() {
      clear(page);
      const p = P(), m = p.mission, v = p.vehicle;
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Mission Planner'), h('p', { class: 'std-only' }, 'A mission is a timeline of events: when something happens (condition) and what happens (action). The simulator decides what actually results.'), h('p', { class: 'beginner-only' }, 'Choose where to fly.')),
        p.missionList().length ? h('span', { class: 'std-only' }, select(p.missionList().map((x) => [x.id, x.name]), p.activeMission, (id) => { p.activeMission = id; S.sel = null; commit('Select mission'); })) : null,
        h('button', { class: 'btn primary std-only', disabled: !v, title: v ? '' : 'Create a vehicle first', onclick: newMissionDialog }, '＋ New mission…'),
        h('button', { class: 'btn std-only', disabled: !m || !v, onclick: () => app.navigate('simulation') }, '▶ Simulate')));
      if (v) page.append(beginnerPlanner(p, m, v));
      if (!m) { page.append(h('div', { class: 'std-only' }, panel(null, emptyState('No mission yet', v ? 'Create a mission for the active vehicle. The planner builds a complete, executable timeline that you can then edit.' : 'Create a vehicle in the Vehicle Designer first.', [h('button', { class: 'btn primary', disabled: !v, onclick: newMissionDialog }, '＋ New mission…')])))); return; }
      const obj = m.objective ?? {};
      page.append(h('div', { class: 'grid g4 std-only' },
        stat('Objective', obj.type ?? '–', obj.type === 'orbit' ? `circular ${fmt((obj.altitude ?? 0) / 1000, 0)} km orbit around ${obj.body}` : obj.type === 'traverse' ? `${fmt(obj.distance, 0)} m` : obj.body ?? ''),
        stat('Vehicle', m.vehicleName ?? v?.name ?? '–', v ? v.type : ''), stat('Events', String(m.events.length), `${m.faults?.length ?? 0} injected fault(s)`), stat('Time limit', `${fmt(m.maxTime, 0)} s`, 'the simulation stops here')));
      // left: description + parameters
      const left = h('div', { class: 'col' });
      left.append(panel('Mission', h('div', { class: 'col' },
        h('label', { class: 'field' }, 'Name', h('input', { class: 'input', type: 'text', value: m.name, onchange: (e) => { m.name = e.target.value.slice(0, 100); commit('Rename mission'); } })),
        h('p', { class: 'muted' }, m.description ?? ''),
        obj.type === 'orbit' ? h('label', { class: 'field' }, 'Target orbit altitude', numberInput({ value: (obj.altitude ?? 200000) / 1000, min: 120, max: 2000, unit: 'km', onchange: async (x) => { const r = await app.api.execute('MODIFY_MISSION', { altitude: x * 1000 }); if (!r.ok) toast(r.message, 'bad'); commit('Change target altitude'); } })) : null,
        h('label', { class: 'field' }, 'Maximum mission time', numberInput({ value: m.maxTime, min: 10, max: 1000000, unit: 's', onchange: (x) => { m.maxTime = x; commit('Change time limit'); } })),
        m.guidance?.mode === 'ascent' ? guidanceEditor(m) : h('div', { class: 'muted' }, `Guidance mode: ${m.guidance?.mode ?? 'none'}`))));
      left.append(panel('Environment', envEditor(m)));
      // main: timeline
      const rows = m.events.map((e, i) => h('tr', { class: `clickable ${S.sel === e.id ? 'sel' : ''}`, onclick: () => { S.sel = e.id; render(); }, ondblclick: () => editEvent(e) },
        h('td', { class: 'num' }, i + 1), h('td', null, h('b', null, e.name), h('div', { class: 'muted mono', style: { fontSize: '11px' } }, e.id)), h('td', null, describeCond(e.condition, m)), h('td', null, describeAction(e.action))));
      const selEv = m.events.find((e) => e.id === S.sel);
      const timeline = panel('Event timeline', h('div', null,
        h('div', { style: { maxHeight: '52vh', overflow: 'auto' } }, m.events.length ? h('table', null, h('thead', null, h('tr', null, ['#', 'Event', 'When (condition)', 'What (action)'].map((t) => h('th', null, t)))), h('tbody', null, rows)) : emptyState('No events', 'Add an event to give the vehicle something to do.')),
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn small', onclick: () => editEvent(null) }, 'Add event'),
          h('button', { class: 'btn small', disabled: !selEv, onclick: () => editEvent(selEv) }, 'Edit'),
          h('button', { class: 'btn small', disabled: !selEv, onclick: () => move(selEv, -1) }, '↑'), h('button', { class: 'btn small', disabled: !selEv, onclick: () => move(selEv, 1) }, '↓'),
          h('button', { class: 'btn small danger', disabled: !selEv, onclick: async () => { const r = await app.api.execute('MODIFY_MISSION', { operations: [{ op: 'remove_event', id: selEv.id }] }); if (!r.ok) return toast(r.message, 'bad'); S.sel = null; commit(`Remove event ${selEv.name}`); } }, 'Remove'),
          h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Double-click a row to edit. The order in this list does not decide when events fire; the conditions do.'))));
      const faults = panel('Injected faults (for testing failure detection)', faultEditor(m));
      page.append(h('div', { class: 'grid std-only', style: { gridTemplateColumns: '360px 1fr', alignItems: 'start' } }, left, h('div', { class: 'col' }, timeline, faults)));
    }

    // ---------------------------------------------------------------- beginner view: choose a destination, read the steps, launch
    function beginnerPlanner(p, m, v) {
      const box = h('div', { class: 'beginner-only planner-simple', id: 'planner-simple' });
      const isLauncher = v.type === 'rocket';
      const cur = m?.objective?.type === 'orbit' ? Math.round((m.objective.altitude ?? 0) / 1000) : null;
      if (isLauncher) {
        const go = async (km) => {
          const canEdit = m && m.objective?.type === 'orbit' && v.type === 'rocket';
          const autoName = canEdit && /^Launch to [\d.]+ km orbit$/.test(m.name) ? `Launch to ${km} km orbit` : undefined;
          const r = canEdit ? await app.api.execute('MODIFY_MISSION', { altitude: km * 1000, name: autoName }) : await app.api.execute('CREATE_MISSION', { kind: 'launch', altitude: km * 1000 });
          if (!r.ok) return toast(r.message, 'bad', 7000);
          S.sel = null; commit(`Destination: ${km} km`);
        };
        box.append(h('h2', { class: 'planner-q' }, 'Where do you want to go?'),
          h('div', { class: 'dest-row' }, DESTINATIONS.map((d) => h('button', { class: `dest-card ${cur === d.km ? 'sel' : ''}`, id: `dest-${d.km}`, 'data-km': d.km, 'aria-pressed': cur === d.km, onclick: () => go(d.km) },
            h('span', { class: 'big' }, icon(d.emoji, { size: 40 })), h('b', null, d.title), h('span', { class: 'muted' }, d.sub), cur === d.km ? h('span', { class: 'dest-tick' }, 'Chosen') : null))),
          null);
      } else if (!m) {
        box.append(h('h2', { class: 'planner-q' }, 'What should it do?'), h('button', { class: 'btn primary big', id: 'planner-create', onclick: newMissionDialog }, 'Plan a mission'));
      }
      if (m) {
        const steps = plainSteps(m);
        box.append(h('div', { class: 'panel planner-steps' }, h('div', { class: 'panel-body' },
          h('h3', null, cur ? ['Flight plan to ', gloss('orbit', `${cur.toLocaleString('en-US')} km orbit`)] : 'Flight plan'),
          h('div', { class: 'step-icons', 'aria-hidden': 'true' }, steps.map(([ico]) => h('span', null, icon(ico, { size: 24 })))),
          h('details', { class: 'more step-more' }, h('summary', null, `Show the ${steps.length} steps`),
            h('ol', { class: 'step-list', id: 'mission-steps' }, steps.map(([ico, t]) => h('li', null, h('span', { class: 'step-ico' }, icon(ico, { size: 20 })), h('span', null, t))))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary big', id: 'planner-launch', onclick: () => app.navigate('simulation') }, icon('rocket', { size: 20 }), ' Launch it')))));
      }
      return box;
    }

    function guidanceEditor(m) {
      const sch = m.guidance.params.schedule ?? { hF: 100e3, n: 0.45 };
      return h('div', { class: 'col' }, h('h3', null, 'Ascent pitch programme'),
        h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Flight-path angle falls from vertical to horizontal over the “turn altitude”. The exponent shapes the curve. The AI engineer can also try several programmes automatically.'),
        h('label', { class: 'field' }, 'Turn altitude (hF)', numberInput({ value: sch.hF / 1000, min: 30, max: 400, unit: 'km', onchange: (x) => { m.guidance.params.schedule = { ...sch, hF: x * 1000 }; commit('Change pitch programme'); } })),
        h('label', { class: 'field' }, 'Exponent (n)', numberInput({ value: sch.n, min: 0.1, max: 2, step: 0.05, onchange: (x) => { m.guidance.params.schedule = { ...sch, n: x }; commit('Change pitch programme'); } })),
        h('label', { class: 'field' }, 'Launch azimuth', numberInput({ value: +(m.guidance.params.azimuth ?? 90).toFixed(2), min: 0, max: 360, unit: '°', onchange: (x) => { m.guidance.params.azimuth = x; commit('Change azimuth'); } })));
    }
    function envEditor(m) {
      const env = P().environment; const body = env.body;
      const sites = LAUNCH_SITES.filter((s) => s.body === body);
      const cur = LAUNCH_SITES.find((s) => Math.abs(s.lat - env.site.lat) < 0.01 && Math.abs(s.lon - env.site.lon) < 0.01)?.id ?? 'custom';
      return h('div', { class: 'col' },
        h('label', { class: 'field' }, 'Central body (home)', select(listBodies().filter((b) => ['earth', 'moon', 'mars'].includes(b.id)).map((b) => [b.id, b.name ?? b.id]), body, (x) => { env.body = x; const s = LAUNCH_SITES.find((q) => q.body === x); if (s) env.site = { lat: s.lat, lon: s.lon, name: s.name }; commit('Change environment body'); })),
        m.initial?.type === 'pad' ? h('label', { class: 'field' }, 'Launch site', select([...sites.map((s) => [s.id, s.name]), ['custom', 'Custom coordinates']], cur, (x) => { const s = LAUNCH_SITES.find((q) => q.id === x); if (s) { env.site = { lat: s.lat, lon: s.lon, name: s.name }; m.initial.lat = s.lat; m.initial.lon = s.lon; if (m.environment) m.environment.site = { lat: s.lat, lon: s.lon }; commit('Change launch site'); } })) : null,
        h('div', { class: 'row' }, h('label', { class: 'field' }, 'Latitude', numberInput({ value: +env.site.lat.toFixed(3), min: -89, max: 89, unit: '°', width: '90px', onchange: (x) => { env.site.lat = x; if (m.initial?.type === 'pad') m.initial.lat = x; if (m.environment?.site) m.environment.site.lat = x; commit('Change latitude'); } })),
          h('label', { class: 'field' }, 'Longitude', numberInput({ value: +env.site.lon.toFixed(3), min: -180, max: 180, unit: '°', width: '90px', onchange: (x) => { env.site.lon = x; if (m.initial?.type === 'pad') m.initial.lon = x; if (m.environment?.site) m.environment.site.lon = x; commit('Change longitude'); } }))),
        h('label', { class: 'field' }, 'Terrain seed', numberInput({ value: env.terrainSeed ?? 1, min: 0, max: 99999, step: 1, onchange: (x) => { env.terrainSeed = Math.round(x); commit('Change terrain seed'); } })),
        h('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'Sites are labelled Real (Cape Canaveral, Kourou) or Fictional (generic sites). Atmosphere models: Earth, Mars (simplified standard models).'),
        weatherEditor(env),
        h('div', { class: 'col', id: 'opm-editor', style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)' } },
          h('b', null, 'Start from a published orbit (CCSDS OPM file)'),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Open an Orbit Parameter Message from other space software: the flight then starts in that orbit at that time instead of on the pad. Only the position and velocity are used.'),
          h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'opm-import', onclick: importOpm }, 'Open an OPM file…'))));
    }
    async function importSounding() {
      try {
        const f = await pickFile('.txt,.csv,.html'); if (!f) return;
        const snd = parseSounding(f.text); P().environment.sounding = snd; commit('Load a weather balloon sounding');
        toast(`Real weather loaded. ${describeSounding(snd)}`, 'ok', 9000);
      } catch (e) { toast(`Could not use the file: ${e.message}`, 'bad', 9000); }
    }
    async function importOpm() {
      try {
        const f = await pickFile('.opm,.txt'); if (!f) return;
        const o = parseOPM(f.text), m = P().mission; if (!m) { toast('Create or open a mission first.', 'bad'); return; }
        const body = ({ EARTH: 'earth', MOON: 'moon', MARS: 'mars' })[o.center]; if (!body) throw new Error(`The central body ${o.center} is not available here (Earth, Moon and Mars are).`);
        P().environment.body = body; P().environment.epoch = o.epoch; m.initial = { type: 'state', r: o.r, v: o.v, body, attitude: 'prograde' };
        commit('Start from an OPM state'); toast(`The flight now starts from ${o.object}'s state at a distance of ${Math.round(Math.hypot(...o.r) / 1000)} km from the centre of ${body}.`, 'ok', 9000);
      } catch (e) { toast(`Could not use the file: ${e.message}`, 'bad', 9000); }
    }
    // 2.1: weather and precise gravity for every flight of this project (all off by default)
    function weatherEditor(env) {
      env.wind ??= { speed: 0, fromDeg: 270, gustFraction: 0.25, seed: 1 };
      const w = env.wind, st = P().settings;
      return h('div', { class: 'col', id: 'weather-editor', style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)' } },
        h('b', null, 'Weather and gravity'),
        h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Off by default. The wind is strongest about 12 km up (a jet stream) and has gusts; the same seed always gives the same wind. Results with weather on are labelled in the run record.'),
        h('div', { class: 'row', id: 'wind-presets' }, h('span', { class: 'muted' }, 'Quick weather:'),
          ...[['Calm', { speed: 0, turnDeg: 0, shearSpeed: 0 }], ['Breezy day', { speed: 12, turnDeg: 20, shearSpeed: 0, gustFraction: 0.2 }], ['Jet stream', { speed: 45, turnDeg: 40, shearSpeed: 0, gustFraction: 0.25 }], ['Wind shear layer', { speed: 30, turnDeg: 30, shearAlt: 9000, shearSpeed: 25, gustFraction: 0.3 }], ['Storm', { speed: 70, turnDeg: 60, shearAlt: 6000, shearSpeed: 20, gustFraction: 0.5 }]]
            .map(([nm, v]) => h('button', { class: 'btn', onclick: () => { Object.assign(w, { turnDeg: 0, shearAlt: 0, shearSpeed: 0 }, v); commit('Weather: ' + nm); } }, nm))),
        h('div', { class: 'row' },
          h('label', { class: 'field' }, 'Wind speed', numberInput({ value: w.speed ?? 0, min: 0, max: 120, step: 1, unit: 'm/s', width: '90px', onchange: (x) => { w.speed = Math.max(0, x); commit('Change wind speed'); } })),
          h('label', { class: 'field' }, 'Wind from', numberInput({ value: w.fromDeg ?? 270, min: 0, max: 360, step: 5, unit: '° (compass)', width: '90px', onchange: (x) => { w.fromDeg = ((x % 360) + 360) % 360; commit('Change wind direction'); } })),
          h('label', { class: 'field' }, 'Gusts', numberInput({ value: Math.round((w.gustFraction ?? 0.25) * 100), min: 0, max: 100, step: 5, unit: '%', width: '80px', onchange: (x) => { w.gustFraction = Math.max(0, Math.min(1, x / 100)); commit('Change gusts'); } })),
          h('label', { class: 'field' }, 'Wind turns by', numberInput({ value: w.turnDeg ?? 0, min: -90, max: 90, step: 5, unit: '° by 12 km', width: '90px', onchange: (x) => { w.turnDeg = x; commit('Change wind turning'); } })),
          h('label', { class: 'field' }, 'Shear layer', numberInput({ value: w.shearSpeed ?? 0, min: 0, max: 60, step: 5, unit: 'm/s extra', width: '90px', onchange: (x) => { w.shearSpeed = Math.max(0, x); w.shearAlt ||= 9000; commit('Change shear layer'); } })),
          h('label', { class: 'field' }, 'Wind seed', numberInput({ value: w.seed ?? 1, min: 1, max: 999999, step: 1, width: '90px', onchange: (x) => { w.seed = Math.max(1, Math.round(x)); commit('Change wind seed'); } }))),
        h('div', { class: 'col', id: 'sounding-editor' },
          h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Real launch-day weather: load a weather-balloon sounding (University of Wyoming "Text: List" or a CSV with height_m, temp_c, wind_ms, from_deg). It replaces the standard atmosphere and the simple wind for every flight of this project.'),
          h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'sounding-import', onclick: importSounding }, 'Load a sounding file…'),
            env.sounding ? h('button', { class: 'btn small', id: 'sounding-clear', onclick: () => { delete env.sounding; commit('Remove the sounding'); } }, 'Remove it') : null),
          env.sounding ? h('div', { id: 'sounding-info', style: { fontSize: '12.5px' } }, describeSounding(env.sounding)) : null),
        h('div', { class: 'row' },
          h('label', { class: 'field' }, 'Air density', numberInput({ value: Math.round((env.densityScale ?? 1) * 100), min: 50, max: 150, step: 1, unit: '% of standard', width: '90px', onchange: (x) => { env.densityScale = Math.max(0.5, Math.min(1.5, x / 100)); commit('Change air density'); } })),
          h('label', { class: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } }, h('input', { type: 'checkbox', id: 'env-tropical', checked: env.atmosphereProfile === 'tropical', onchange: (e) => { if (e.target.checked) env.atmosphereProfile = 'tropical'; else delete env.atmosphereProfile; commit('Change air profile'); } }), h('span', null, 'Warm tropical day (Florida summer air instead of the standard atmosphere; Earth only)')),
          h('label', { class: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } }, h('input', { type: 'checkbox', id: 'env-j2', checked: !!st.j2, onchange: (e) => { st.j2 = e.target.checked; commit('Change precise gravity'); } }), h('span', null, 'Precise gravity (the planet\'s equatorial bulge, J2)')),
          h('label', { class: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } }, h('input', { type: 'checkbox', id: 'env-slosh', checked: !!st.slosh, onchange: (e) => { st.slosh = e.target.checked; commit('Change fuel slosh'); } }), h('span', null, 'Fuel slosh (liquid moving in partly empty tanks)')),
          h('label', { class: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } }, h('input', { type: 'checkbox', id: 'env-slosh2', checked: !!st.slosh2, onchange: (e) => { st.slosh2 = e.target.checked; if (e.target.checked) st.slosh = true; commit('Change second slosh mode'); } }), h('span', null, 'Second slosh mode (higher frequency, small mass; turns the first one on too)')),
          h('label', { class: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' } }, h('input', { type: 'checkbox', id: 'env-flex', checked: !!st.flex, onchange: (e) => { st.flex = e.target.checked; commit('Change structure bending'); } }), h('span', null, 'Bending of the rocket body (first bending mode)'))));
    }
    function faultEditor(m) {
      m.faults ??= [];
      const rows = m.faults.map((f, i) => h('tr', null, h('td', null, f.type), h('td', null, f.group ?? f.engine ?? '–'), h('td', { class: 'num' }, describeCond(f.condition ?? { type: 'time', value: f.time ?? 0 }, m)), h('td', null, h('button', { class: 'btn small danger', onclick: () => { m.faults.splice(i, 1); commit('Remove fault'); } }, 'Remove'))));
      const f = { type: 'engine_failure', group: 'stage1', time: 60 };
      const groups = P().vehicle ? [...new Set(P().vehicle.components.filter((c) => c.kind === 'engine').map((c) => c.group))] : ['stage1'];
      return h('div', { class: 'col' }, m.faults.length ? h('table', null, h('thead', null, h('tr', null, ['Fault', 'Target', 'When', ''].map((t) => h('th', null, t)))), h('tbody', null, rows)) : h('p', { class: 'muted' }, 'No faults. Injected faults let you check that the failure detection finds the real cause.'),
        h('div', { class: 'row' }, select([['engine_failure', 'Engine failure'], ['thrust_degrade', 'Thrust degradation'], ['power_failure', 'Power failure'], ['comm_failure', 'Communication failure'], ['guidance_failure', 'Guidance failure'], ['battery_drain', 'Battery drain']], f.type, (x) => (f.type = x)),
          select(groups.map((g) => [g, g]), f.group, (x) => (f.group = x)), h('span', null, 'at T+'), numberInput({ value: 60, min: 0, max: 100000, unit: 's', width: '80px', onchange: (x) => (f.time = x) }),
          h('button', { class: 'btn small', onclick: () => { const o = { type: f.type, condition: { type: 'time', value: f.time } }; if (['engine_failure', 'thrust_degrade'].includes(f.type)) o.group = f.group; if (f.type === 'thrust_degrade') o.factor = 0.7; m.faults.push(o); commit(`Add fault ${f.type}`); } }, '＋ Add fault')));
    }
    function move(e, d) { const m = P().mission; const i = m.events.findIndex((x) => x.id === e.id); const j = i + d; if (j < 0 || j >= m.events.length) return; [m.events[i], m.events[j]] = [m.events[j], m.events[i]]; commit('Reorder events'); }

    // ---------------------------------------------------------------- dialogs
    function newMissionDialog() {
      const v = P().vehicle; if (!v) return;
      const kinds = v.type === 'rocket' ? [['launch', 'Launch to orbit']] : v.type === 'lander' ? [['landing', 'Powered landing']] : v.type === 'rover' ? [['rover', 'Rover traverse']] : [['orbit_raise', 'Orbit raise (Hohmann)'], ['probe_operations', 'Probe operations (deploy, measure, transmit)']];
      const o = { kind: kinds[0][0], altitude: 200, distance: 200, name: '' };
      const extra = h('div', { class: 'col' });
      const fill = () => { clear(extra); if (o.kind === 'launch' || o.kind === 'orbit_raise') extra.append(h('label', { class: 'field' }, 'Target altitude', numberInput({ value: o.altitude, min: 120, max: 2000, unit: 'km', onchange: (x) => (o.altitude = x) }))); if (o.kind === 'rover') extra.append(h('label', { class: 'field' }, 'Traverse distance', numberInput({ value: 200, min: 5, max: 5000, unit: 'm', onchange: (x) => (o.distance = x) }))); };
      fill();
      modal({ title: 'New mission', body: h('div', { class: 'col' }, h('p', { class: 'muted' }, `For vehicle “${v.name}”. The planner generates a complete timeline that you can edit.`), h('label', { class: 'field' }, 'Mission type', select(kinds, o.kind, (x) => { o.kind = x; fill(); })), h('label', { class: 'field' }, 'Name (optional)', h('input', { class: 'input', type: 'text', oninput: (e) => (o.name = e.target.value) })), extra),
        buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: async () => { const r = await app.api.execute('CREATE_MISSION', { kind: o.kind, altitude: o.kind === 'launch' || o.kind === 'orbit_raise' ? o.altitude * 1000 : undefined, distance: o.kind === 'rover' ? o.distance : undefined, name: o.name || undefined }); if (!r.ok) { toast(r.message, 'bad', 7000); return false; } S.sel = null; commit('New mission'); toast(r.message, 'ok'); return true; } }] });
    }

    function editEvent(e) {
      const m = P().mission; const isNew = !e;
      const ev = e ? clone(e) : { id: `ev${m.events.length + 1}_${Math.random().toString(36).slice(2, 5)}`, name: 'New event', condition: { type: 'time', value: 10 }, action: { type: 'LOG', message: 'Note' }, status: 'pending' };
      const c = ev.condition, a = ev.action;
      const groups = P().vehicle ? [...new Set(P().vehicle.components.map((x) => x.group).filter(Boolean))] : [];
      const condBox = h('div', { class: 'col' }), actBox = h('div', { class: 'col' });
      const condTypes = CONDITION_TYPES.filter((t) => !['all', 'any'].includes(t));
      const simple = !['all', 'any'].includes(c.type);
      const row = (label, control) => h('label', { class: 'field' }, label, control);
      function drawCond() {
        clear(condBox);
        if (!simple) { condBox.append(h('div', { class: 'note info' }, `Compound condition: ${describeCond(c, m)}`), h('textarea', { class: 'input', rows: 5, value: JSON.stringify(c, null, 1), onchange: (x) => { try { const j = JSON.parse(x.target.value); Object.keys(c).forEach((k) => delete c[k]); Object.assign(c, j); } catch { toast('Invalid JSON', 'bad'); } } })); return; }
        condBox.append(row('Trigger', select(condTypes.map((t) => [t, t]), c.type, (x) => { const keep = x; Object.keys(c).forEach((k) => delete c[k]); c.type = keep; if (VALUE_TYPES.includes(keep)) { c.op = '>='; c.value = 0; } if (keep === 'time') c.value = 0; if (keep === 'propellant') { c.op = '<='; c.value = 0.01; c.group = groups[0]; } if (keep === 'event') c.id = m.events[0]?.id; drawCond(); })));
        if (c.type === 'time') condBox.append(row('Mission time', numberInput({ value: c.value ?? 0, unit: 's', onchange: (x) => (c.value = x) })));
        else if (c.type === 'event') condBox.append(row('After event', select(m.events.filter((x) => x.id !== ev.id).map((x) => [x.id, x.name]), c.id, (x) => (c.id = x))), row('Delay', numberInput({ value: c.delay ?? 0, min: 0, unit: 's', onchange: (x) => (c.delay = x) })));
        else if (c.type === 'propellant') condBox.append(row('Stage / group', select(groups, c.group, (x) => (c.group = x))), row('Operator', select(['<=', '>='], c.op, (x) => (c.op = x))), row('Remaining fraction', numberInput({ value: c.value, min: 0, max: 1, step: 0.001, onchange: (x) => (c.value = x) })));
        else if (c.type === 'enginesOut') condBox.append(row('Stage / group', select(groups, c.group, (x) => (c.group = x))));
        else if (VALUE_TYPES.includes(c.type)) { const km = KM.has(c.type); condBox.append(row('Operator', select(['>=', '<=', '>', '<'], c.op ?? '>=', (x) => (c.op = x))), row(`Value ${UNIT[c.type] ? '(' + UNIT[c.type] + ')' : ''}`, numberInput({ value: km ? c.value / 1000 : c.value, onchange: (x) => (c.value = km ? x * 1000 : x) })), c.type === 'timeToApoapsis' ? h('div', { class: 'muted', style: { fontSize: '12px' } }, 'The value may also be “halfBurn” (edit as JSON in the Advanced box below).') : null); }
      }
      function drawAct() {
        clear(actBox);
        actBox.append(row('Action', select(ACTION_TYPES.map((t) => [t, t]), a.type, (x) => { Object.keys(a).forEach((k) => delete a[k]); a.type = x; if (['IGNITE', 'SHUTDOWN', 'SEPARATE'].includes(x)) a.group = groups[0]; if (x === 'THROTTLE') a.value = 1; if (x === 'DEPLOY_PAYLOAD') a.group = 'payload'; if (x === 'DEPLOY') a.target = 'all'; if (x === 'SET_GUIDANCE') a.mode = 'prograde'; if (x === 'MEASURE') { a.instrument = 'all'; a.duration = 60; } if (x === 'TRANSMIT') a.duration = 60; if (x === 'DRIVE') { a.heading = 90; a.distance = 50; a.speed = 0.5; } if (x === 'LOG') a.message = 'Note'; if (x === 'BURN') { a.group = groups[0]; a.direction = 'prograde'; a.dv = 100; } drawAct(); })));
        if (['IGNITE', 'SHUTDOWN', 'SEPARATE', 'THROTTLE', 'BURN', 'LAND'].includes(a.type)) actBox.append(row('Stage / group', select(groups.length ? groups : ['stage1'], a.group, (x) => (a.group = x))));
        if (a.type === 'DEPLOY_PAYLOAD') actBox.append(row('Payload group', select(groups.length ? groups : ['payload'], a.group ?? 'payload', (x) => (a.group = x))));
        if (a.type === 'THROTTLE') actBox.append(row('Throttle', numberInput({ value: a.value ?? 1, min: 0, max: 1, step: 0.05, onchange: (x) => (a.value = x) })));
        if (a.type === 'IGNITE') actBox.append(row('Throttle', numberInput({ value: a.throttle ?? 1, min: 0, max: 1, step: 0.05, onchange: (x) => (a.throttle = x) })));
        if (a.type === 'DEPLOY') actBox.append(row('Target', select(['all', 'solar_panel', 'antenna', 'landing_legs', 'parachute'], a.target ?? 'all', (x) => (a.target = x))));
        if (a.type === 'SET_GUIDANCE') actBox.append(row('Mode', select(['prograde', 'retrograde', 'sun_point', 'earth_point', 'radial', 'nadir', 'hold', 'ascent', 'none'], a.mode, (x) => (a.mode = x))));
        if (a.type === 'BURN') actBox.append(row('Direction', select(['prograde', 'retrograde', 'radial_in', 'radial_out', 'normal', 'anti_normal'], a.direction ?? 'prograde', (x) => (a.direction = x))), row('Δv (m/s, or “circularize”)', h('input', { class: 'input', type: 'text', value: a.dv, onchange: (x) => { const t = x.target.value.trim(); a.dv = Number.isFinite(parseFloat(t)) ? parseFloat(t) : t; } })));
        if (['MEASURE', 'TRANSMIT'].includes(a.type)) actBox.append(row('Duration', numberInput({ value: a.duration ?? 60, min: 1, unit: 's', onchange: (x) => (a.duration = x) })));
        if (a.type === 'DRIVE') actBox.append(row('Heading', numberInput({ value: a.heading ?? 90, min: 0, max: 360, unit: '°', onchange: (x) => (a.heading = x) })), row('Distance', numberInput({ value: a.distance ?? 50, min: 1, unit: 'm', onchange: (x) => (a.distance = x) })), row('Speed', numberInput({ value: a.speed ?? 0.5, min: 0.01, max: 5, unit: 'm/s', onchange: (x) => (a.speed = x) })));
        if (a.type === 'LOG') actBox.append(row('Message', h('input', { class: 'input', type: 'text', value: a.message ?? '', onchange: (x) => (a.message = x.target.value.slice(0, 200)) })));
      }
      drawCond(); drawAct();
      modal({ wide: true, title: isNew ? 'Add event' : `Edit event: ${e.name}`, body: h('div', { class: 'col' }, row('Event name', h('input', { class: 'input', type: 'text', value: ev.name, onchange: (x) => (ev.name = x.target.value.slice(0, 100)) })), h('div', { class: 'grid g2' }, h('div', { class: 'col' }, h('h3', null, 'When'), condBox), h('div', { class: 'col' }, h('h3', null, 'What happens'), actBox))),
        buttons: [{ label: 'Cancel' }, { label: isNew ? 'Add' : 'Save', primary: true, onClick: () => {
          if (c.type === 'event' && !c.id) { toast('Choose the event to wait for', 'bad'); return false; }
          if (isNew) m.events.push(ev); else { const i = m.events.findIndex((x) => x.id === e.id); m.events[i] = { ...m.events[i], name: ev.name, condition: ev.condition, action: ev.action, status: 'pending' }; }
          S.sel = ev.id; commit(isNew ? `Add event ${ev.name}` : `Edit event ${ev.name}`); return true;
        } }] });
    }

    render();
    const off = app.on('design', () => render());
    return () => off();
  },
};
