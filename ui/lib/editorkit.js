// Helpers for the full Vehicle Designer editor: plain names, icons, picker groups, plain-language labels and issue messages.
// Pure data + small functions (no DOM), so they are easy to test and to reuse.
import { KIND_LABELS } from '../../data/components.js';

/** Plain symbol (never an emoji) and colour per component kind. */
export const KIND_ICON = {
  engine: ['▲', '#e8743b'], rcs: ['≈', '#e8a33b'], fuel_tank: ['▮', '#3fa7d6'], oxidizer_tank: ['◯', '#6a8fe8'], propellant_tank: ['▮', '#3fa7d6'],
  nose_cone: ['◭', '#9aa7b8'], fairing: ['▭', '#9aa7b8'], interstage: ['═', '#8b98aa'], decoupler: ['≠', '#8b98aa'], structural_section: ['▬', '#8b98aa'], fin: ['◣', '#9aa7b8'], heat_shield: ['◖', '#d6594a'],
  avionics: ['◈', '#a77be8'], guidance: ['◎', '#a77be8'], computer: ['▤', '#a77be8'], reaction_wheel: ['◍', '#a77be8'], sensor: ['·', '#a77be8'],
  battery: ['▯', '#e8c93b'], solar_panel: ['▦', '#e8c93b'], antenna: ['Ψ', '#4fc39a'], instrument: ['◉', '#e86fa8'], payload: ['■', '#e86fa8'],
  radiator: ['≋', '#d6594a'], heater: ['∿', '#d6594a'], mli: ['▒', '#d6594a'], landing_legs: ['⋔', '#7fbf5a'], parachute: ['⌒', '#7fbf5a'],
  rover_chassis: ['▰', '#c08a5a'], wheel: ['●', '#c08a5a'], motor: ['*', '#c08a5a'],
};
export const kindIcon = (k) => KIND_ICON[k] ?? ['□', '#8b98aa'];

/** Very short "what is it for" per kind, shown in the parts list ("Fuel tank - holds fuel"). */
export const KIND_SHORT = {
  engine: 'makes the push', rcs: 'small steering jets', fuel_tank: 'holds fuel', oxidizer_tank: 'holds oxygen for burning', propellant_tank: 'holds fuel',
  nose_cone: 'cuts through the air', fairing: 'covers the payload', interstage: 'joins two stages', decoupler: 'drops a stage', structural_section: 'strong body tube', fin: 'keeps it straight', heat_shield: 'stops the heat',
  avionics: 'the flight brain', guidance: 'knows where it points', computer: 'runs the software', reaction_wheel: 'turns it in space', sensor: 'measures things',
  battery: 'stores power', fuel_cell: 'makes power from fuel', solar_panel: 'makes power from light', antenna: 'talks to Earth', instrument: 'science tool', payload: 'the cargo',
  radiator: 'gets rid of heat', heater: 'keeps it warm', mli: 'blanket against heat', landing_legs: 'soft landing', parachute: 'slows the fall',
  rover_chassis: 'the rover body', wheel: 'drives the rover', motor: 'spins the wheels',
};
export const plainKind = (k) => `${KIND_LABELS[k] ?? k} - ${KIND_SHORT[k] ?? ''}`.replace(/ - $/, '');

/** Groups of the visual "Add a part" picker. */
export const PICK_GROUPS = [
  { id: 'go', label: 'Make it go', kinds: ['engine', 'rcs'] },
  { id: 'fuel', label: 'Hold fuel', kinds: ['fuel_tank', 'oxidizer_tank', 'propellant_tank'] },
  { id: 'shape', label: 'Shape and protect', kinds: ['nose_cone', 'fairing', 'interstage', 'decoupler', 'structural_section', 'fin', 'heat_shield', 'radiator', 'heater', 'mli'] },
  { id: 'think', label: 'Think and steer', kinds: ['avionics', 'guidance', 'computer', 'reaction_wheel', 'sensor'] },
  { id: 'power', label: 'Power', kinds: ['battery', 'solar_panel'] },
  { id: 'talk', label: 'Talk', kinds: ['antenna'] },
  { id: 'science', label: 'Science', kinds: ['instrument', 'payload'] },
  { id: 'land', label: 'Land', kinds: ['landing_legs', 'parachute'] },
  { id: 'rover', label: 'Rover', kinds: ['rover_chassis', 'wheel', 'motor'] },
];
export const groupOfKind = (k) => PICK_GROUPS.find((g) => g.kinds.includes(k));

/** Plain labels for the inspector (Beginner and Standard). Advanced keeps the technical label. */
export const PLAIN_LABELS = {
  'Thrust (vacuum)': 'Push in space (thrust)', 'Thrust': 'Push (thrust)', 'Isp (vacuum)': 'Engine efficiency in space (Isp)', 'Isp (sea level)': 'Engine efficiency at sea level (Isp)', 'Isp': 'Engine efficiency (Isp)',
  'Mixture ratio O/F': 'Fuel mix', 'Min throttle': 'Lowest power setting', 'Gimbal range': 'Steering swing', 'Ignitions': 'Times it can start', 'Spool time': 'Time to full power', 'Engine count': 'Number of engines',
  'Electric power (thrusters)': 'Electricity needed', 'Solid propellant (each)': 'Solid fuel (each)', 'Propellant capacity': 'Fuel it can hold', 'Propellant': 'Fuel carried', 'Initial fill': 'How full at launch',
  'Diameter': 'Width (diameter)', 'Mass': 'Weight (mass)', 'Mass (each)': 'Weight each (mass)', 'Dry mass': 'Empty weight', 'Max temperature': 'Heat it can take', 'Axial strength': 'Squeeze strength',
  'Max q·α': 'Sideways air load it can take', 'Normal-force slope': 'Steering grip of the fins', 'Power draw': 'Electricity it uses', 'Power': 'Electricity it uses', 'Max acceleration': 'Shaking it can survive (g)',
  'Pointing accuracy': 'Aiming accuracy', 'Capacity': 'Energy it stores', 'Area': 'Surface area', 'Efficiency': 'How well it works', 'Gain': 'Signal focus (gain)', 'Transmit power': 'Radio power',
  'Frequency': 'Radio frequency', 'Data rate': 'Data speed', 'Setpoint': 'Target temperature', 'Heater power': 'Heater power', 'Effective emissivity factor': 'Heat leak (lower is better)',
  'Max impact speed': 'Toughest landing speed', 'Footprint radius': 'Landing footprint', 'Leg length': 'Leg length', 'Drag area CdA': 'Air-catching size (CdA)', 'Inflation time': 'Time to open',
  'Max deploy q': 'Fastest safe opening (air pressure)', 'Wheelbase': 'Distance between axles', 'Ground clearance': 'Height above ground', 'Wheel count': 'Number of wheels', 'No-load speed': 'Free-spin speed',
  'Stall torque': 'Pulling strength (torque)', 'Torque': 'Turning force (torque)', 'Torque authority': 'Turning strength (torque)', 'Count': 'How many',
};
export const fieldLabel = (label, mode) => (mode === 'advanced' ? label : PLAIN_LABELS[label] ?? label);

/** The 2-4 numbers that matter most per kind (the rest goes under "More settings"). */
export const BASICS = {
  engine: ['thrustVac', 'ispVac', 'gimbal', 'count'], fuel_tank: ['propellantMass', 'diameter', 'fill'], oxidizer_tank: ['propellantMass', 'diameter', 'fill'], propellant_tank: ['propellantMass', 'diameter', 'fill'],
  rcs: ['thrust', 'propellantMass'], nose_cone: ['length', 'diameter', 'mass'], fairing: ['length', 'diameter', 'mass'], interstage: ['length', 'diameter', 'mass', 'strength'],
  structural_section: ['length', 'diameter', 'mass', 'strength'], decoupler: ['length', 'diameter', 'mass'], fin: ['cnAlpha', 'mass'], heat_shield: ['diameter', 'tMax', 'mass'],
  avionics: ['mass', 'powerDraw'], guidance: ['mass', 'powerDraw', 'pointingAccuracyDeg'], computer: ['mass', 'powerDraw'], reaction_wheel: ['torque', 'count'], battery: ['capacityWh', 'mass'],
  solar_panel: ['area', 'efficiency'], antenna: ['gainDbi', 'txPowerW', 'dataRateBps'], instrument: ['mass', 'powerDraw', 'dataRateBps'], payload: ['mass', 'length', 'diameter'],
  sensor: ['powerDraw', 'mass'], radiator: ['area', 'mass'], heater: ['powerDraw', 'setpointK'], mli: ['insulationFactor', 'mass'], landing_legs: ['legLength', 'maxImpactVelocity', 'mass'],
  parachute: ['dragArea', 'deployTime'], rover_chassis: ['mass', 'length', 'width'], wheel: ['count', 'radius'], motor: ['stallTorque', 'noLoadSpeed'],
};

/** First sentence of a long explanation. */
export const firstSentence = (t = '') => { const m = String(t).match(/^.*?[.!?](?=\s|$)/); return (m ? m[0] : String(t)).trim(); };

/** Friendly warning for a value near the allowed limits, or null. `pos` is the place between min and max (log scale when the range is wide). */
export function limitWarning(value, min, max, type = 'vehicle') {
  if (!(Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max)) || max <= min || value <= 0) return null;
  const wide = min > 0 && max / min > 100;
  const pos = wide ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
  if (pos >= 0.93) return [`This is at the very top of the allowed range.`, 'warn'];
  if (pos >= 0.85) return [`This is very large for this ${type}.`, 'warn'];
  if (pos <= 0.03 && wide) return [`This is very small for this ${type}.`, 'warn'];
  return null;
}

/** Rewrites a design-check issue in plain words. Returns {text, addKind?}. */
export function plainIssue(i, v) {
  const c = i.componentId ? v.components.find((x) => x.id === i.componentId) : null;
  const nm = c ? `"${c.name}"` : 'A part';
  switch (i.code) {
    case 'EMPTY': return { text: 'The vehicle is empty. Add some parts.', addKind: 'engine' };
    case 'NO_ENGINE': return { text: 'There is no engine. Nothing will push the vehicle.', addKind: 'engine' };
    case 'NO_FEED': { const p = /burns ([^\s]+)/.exec(i.message)?.[1]; return { text: `${nm} has nothing to burn. Add a tank with ${p ?? 'propellant'}.`, addKind: p === 'LOX' ? 'oxidizer_tank' : 'fuel_tank' }; }
    case 'LOW_TWR': return { text: 'The engines are too weak. The vehicle would stay on the ground.', addKind: 'engine' };
    case 'MARGINAL_TWR': return { text: 'The engines barely lift the vehicle. A little more push is safer.', addKind: 'engine' };
    case 'NO_POWER': return { text: 'Nothing makes electricity. Add a solar panel or a battery.', addKind: 'solar_panel' };
    case 'ORPHAN': return { text: `${nm} is not attached to anything.` };
    case 'DUP_ID': return { text: `${nm} shares its ID with another part.` };
    case 'PAYLOAD_TOO_BIG': return { text: `${nm} is too heavy for its holder.` };
    case 'PAYLOAD_TOO_LONG': return { text: `${nm} is too long to fit inside the cover.` };
    case 'PAYLOAD_TOO_WIDE': return { text: `${nm} is too wide to fit inside the cover.` };
    case 'DIAMETER_STEP': return { text: `${nm} is much wider or thinner than the part next to it.` };
    case 'NO_LEGS': return { text: 'There are no landing legs. A lander needs them to touch down safely.', addKind: 'landing_legs' };
    case 'STAGE_NO_ENGINE': return { text: `${nm} is in a stage that has no engine.`, addKind: 'engine' };
    case 'TANK_UNUSED': return { text: `${nm} feeds no engine. Its fuel is wasted weight.` };
    case 'VAC_ENGINE_SL': return { text: `${nm} is built for space. It works badly near the ground.` };
    case 'ATMOSPHERIC_ENTRY': return { text: 'Flying through air makes heat. A heat shield would protect it.', addKind: 'heat_shield' };
    case 'BAD_PROPELLANT_PAIR': return { text: `${nm} uses two fuels that do not burn together.` };
    default: return { text: i.message };
  }
}

/** The one part that would help most right now. Returns {kind, title, why} or null. */
export function recommendNext(v, issues = []) {
  if (!v) return null;
  const has = (...ks) => v.components.some((c) => ks.includes(c.kind));
  const codes = new Set(issues.map((i) => i.code));
  const r = (kind, why) => ({ kind, title: `${KIND_LABELS[kind] ?? kind}`, why });
  const launcher = ['rocket', 'lander', 'spacecraft', 'probe', 'satellite'].includes(v.type);
  if (v.type === 'rover') {
    if (!has('rover_chassis')) return r('rover_chassis', 'Every rover needs a body first.');
    if (!has('wheel')) return r('wheel', 'A rover needs wheels to move.');
    if (!has('motor')) return r('motor', 'Wheels need a motor to turn them.');
    if (!has('battery', 'solar_panel')) return r('battery', 'A rover needs power for its motors.');
    if (!has('antenna')) return r('antenna', 'Add a radio so you can talk to it.');
    if (!has('instrument', 'sensor')) return r('instrument', 'Add a science tool so the trip is worth it.');
    return null;
  }
  if (!launcher) return null;
  if (!has('engine')) return r('engine', 'Nothing moves without an engine.');
  if (codes.has('NO_FEED') || !has('fuel_tank', 'propellant_tank')) return r(has('oxidizer_tank') || !has('fuel_tank') ? 'fuel_tank' : 'oxidizer_tank', 'Engines need tanks full of fuel to burn.');
  if (!has('oxidizer_tank', 'propellant_tank') && v.components.some((c) => c.kind === 'engine' && (c.propellants ?? []).length > 1)) return r('oxidizer_tank', 'This engine burns fuel and oxygen. It needs both tanks.');
  if (!has('nose_cone', 'fairing') && v.type === 'rocket') return r('fairing', 'A cover protects the payload and cuts through the air.');
  if (!has('avionics', 'guidance', 'computer')) return r('avionics', 'Something must fly it. Add a flight brain.');
  if (codes.has('NO_POWER') || (v.type !== 'rocket' && !has('battery', 'solar_panel'))) return r('solar_panel', 'Your electronics need power.');
  if (v.type !== 'rocket' && !has('antenna')) return r('antenna', 'Add a radio to talk to Earth.');
  if (v.type === 'lander' && !has('landing_legs')) return r('landing_legs', 'A lander needs legs to touch down softly.');
  if (v.type === 'rocket' && !has('fin', 'reaction_wheel', 'guidance')) return r('fin', 'Fins help a rocket fly straight.');
  return null;
}

/** Small "?" help button: one popover with a few short lines (replaces legends and hint paragraphs). Needs no state. */
export function helpPop(lines = [], { title = 'Help', id } = {}) {
  const box = document.createElement('details'); box.className = 'hp-pop'; if (id) box.id = id;
  const sum = document.createElement('summary'); sum.className = 'hp-btn'; sum.textContent = '?'; sum.title = title; sum.setAttribute('aria-label', title);
  const body = document.createElement('div'); body.className = 'hp-body';
  for (const l of lines) { const d = document.createElement('div'); d.textContent = l; body.append(d); }
  box.append(sum, body);
  document.addEventListener('click', (e) => { if (!box.isConnected) return; if (box.open && !box.contains(e.target)) box.open = false; }, true);
  return box;
}
