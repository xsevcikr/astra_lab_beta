// The structured tool interface between the AI engineer and ASTRA LAB.
// The AI (offline planner or an online model) can do NOTHING except call these tools. There is no shell, no arbitrary file access,
// no package installation and no network tool. `mutates` tools change the design and go through the approve / edit / cancel preview.

const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const VEHICLE = str('Vehicle id or name (default: the active vehicle).');
const MISSION = str('Mission id or name (default: the active mission).');
const RUN = str('Simulation run id, "last" (default) or "previous".');

export const TOOLS = [
  { name: 'CREATE_VEHICLE', mutates: true, description: 'Create a new vehicle. type rocket creates an empty launcher skeleton (add stages with CREATE_STAGE); the other types create a complete, sized vehicle from the parametric builders. With auto:true a rocket is fully sized for payloadMass and targetAltitude by the rocket equation.',
    parameters: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['rocket', 'spacecraft', 'satellite', 'probe', 'lander', 'rover'] }, name: str('Vehicle name'), diameter: num('Rocket body diameter [m]', { minimum: 0.2, maximum: 12 }), auto: { type: 'boolean', description: 'Size the whole rocket automatically (rocket only).' }, payloadMass: num('Payload mass [kg] (auto rocket, probe, lander)', { minimum: 1, maximum: 100000 }), targetAltitude: num('Target circular orbit altitude [m] (auto rocket)', { minimum: 80000, maximum: 2000000 }), body: { type: 'string', enum: ['earth', 'moon', 'mars'] }, dvMargin: num('Multiplier on the required delta-v used for sizing (default 1.0)', { minimum: 0.8, maximum: 2 }), dv: num('Delta-v [m/s] for spacecraft / satellite', { minimum: 10, maximum: 20000 }), mass: num('Total mass [kg] for probe / rover', { minimum: 5, maximum: 20000 }) } } },
  { name: 'ADD_COMPONENT', mutates: true, description: 'Add a component from the catalog (catalogId) or a custom component (kind + properties) to a vehicle.',
    parameters: { type: 'object', properties: { vehicle: VEHICLE, catalogId: str('Catalog id, e.g. eng-al100'), kind: str('Component kind if not from the catalog'), group: str('Stage / group id, e.g. stage2, payload'), parent: str('Parent component id (for mounted / internal parts)'), mount: { type: 'string', enum: ['stack', 'internal', 'radial', 'body'] }, count: num('Number of identical units', { minimum: 1, maximum: 100 }), properties: { type: 'object', description: 'Property overrides (mass, length, diameter, thrustVac, ...)' } } } },
  { name: 'REMOVE_COMPONENT', mutates: true, description: 'Remove a component (and the parts mounted on it) from a vehicle.',
    parameters: { type: 'object', required: ['id'], properties: { vehicle: VEHICLE, id: str('Component id') } } },
  { name: 'MODIFY_COMPONENT', mutates: true, description: 'Change properties of a component (mass, length, diameter, thrust, propellantMass, ...). Tank geometry and mass are recomputed when propellantMass or diameter change.',
    parameters: { type: 'object', required: ['id', 'changes'], properties: { vehicle: VEHICLE, id: str('Component id'), changes: { type: 'object', description: 'Property -> new value' } } } },
  { name: 'CREATE_STAGE', mutates: true, description: 'Add a launcher stage (engine cluster + fuel and oxidizer tanks, sized for the given propellant mass) to a rocket.',
    parameters: { type: 'object', required: ['engine', 'propellantMass'], properties: { vehicle: VEHICLE, order: num('Stage number (1 = first stage). Default: next.', { minimum: 1, maximum: 6 }), name: str('Stage name'), engine: str('Engine catalog id, e.g. eng-al500'), engineCount: num('Number of engines', { minimum: 1, maximum: 33 }), propellantMass: num('Propellant mass in the stage [kg]', { minimum: 1, maximum: 5e6 }), diameter: num('Stage diameter [m]', { minimum: 0.2, maximum: 12 }) } } },
  { name: 'MODIFY_STAGE', mutates: true, description: 'Change a stage: total propellant (propellantMass or propellantScale factor), engine type / count, or name.',
    parameters: { type: 'object', required: ['stage'], properties: { vehicle: VEHICLE, stage: str('Stage id (stage2), number (2) or name'), propellantMass: num('New total propellant [kg]', { minimum: 1, maximum: 5e6 }), propellantScale: num('Multiply the propellant by this factor', { minimum: 0.05, maximum: 10 }), engine: str('New engine catalog id'), engineCount: num('Number of engines', { minimum: 1, maximum: 33 }), name: str('New name') } } },
  { name: 'ADD_PAYLOAD', mutates: true, description: 'Put a payload into a vehicle: a probe / satellite vehicle (payloadVehicle) into a rocket fairing, or a plain payload mass (mass). Adds the avionics / fairing section if the rocket does not have one yet.',
    parameters: { type: 'object', properties: { vehicle: VEHICLE, payloadVehicle: str('Id or name of a payload vehicle (e.g. from CREATE_PROBE)'), mass: num('Plain payload mass [kg] if no payload vehicle', { minimum: 1, maximum: 100000 }), name: str('Payload name'), serviceModule: str('Moon rocket: id or name of the service module (goes below the lander)'), lander: str('Moon rocket: id or name of the lander or lunar module (goes on top of the service module)') } } },
  { name: 'CREATE_PROBE', mutates: true, description: 'Create a space probe of the given total mass (bus, batteries, solar panels, antennas, instruments, small thruster). Optionally place it in a rocket.',
    parameters: { type: 'object', required: ['mass'], properties: { name: str('Probe name'), mass: num('Total probe mass [kg]', { minimum: 5, maximum: 5000 }), destination: { type: 'string', enum: ['moon', 'mars', 'earth', 'sun'] }, intoVehicle: VEHICLE } } },
  { name: 'CREATE_ROVER', mutates: true, description: 'Create a wheeled surface rover (chassis, wheels, motors, battery, solar panel, radio, instruments).',
    parameters: { type: 'object', properties: { name: str('Rover name'), mass: num('Total mass [kg]', { minimum: 10, maximum: 5000 }), wheels: num('Number of wheels', { minimum: 4, maximum: 8 }), batteryWh: num('Battery capacity [Wh]', { minimum: 100, maximum: 20000 }), panelArea: num('Solar panel area [m2]', { minimum: 0.2, maximum: 30 }) } } },
  { name: 'CREATE_LANDER', mutates: true, description: 'Create a powered lander for the Moon (or Mars, see limitations). Can carry a rover that is deployed after touchdown.',
    parameters: { type: 'object', properties: { name: str('Lander name'), body: { type: 'string', enum: ['moon', 'mars'] }, payloadMass: num('Payload mass [kg]', { minimum: 1, maximum: 5000 }), carryRover: str('Id or name of a rover vehicle to carry'), descentDv: num('Delta-v budget for deorbit + descent [m/s]', { minimum: 100, maximum: 6000 }), forMoonRocket: { type: 'boolean', description: 'Build the variant that rides on a Moon rocket: stronger attitude control, and (with cabinMass) a lunar module with a crew-cabin mass' }, cabinMass: num('Lunar module crew-cabin mass [kg] (mass only; crew and life support are not simulated)', { minimum: 100, maximum: 3000 }) } } },
  { name: 'CREATE_MISSION', mutates: true, description: 'Create a complete mission (event timeline) for a vehicle. kind: launch (to a circular orbit, deploys the payload), landing, rover (traverse), orbit_raise, probe_operations, moon (Apollo-style: launch, parking orbit, trans-lunar burn, course corrections, lunar orbit, landing; needs a Moon rocket made with CREATE_STAGE x3, CREATE_SERVICE_MODULE, CREATE_LANDER forMoonRocket and ADD_PAYLOAD serviceModule + lander).',
    parameters: { type: 'object', required: ['kind'], properties: { vehicle: VEHICLE, kind: { type: 'string', enum: ['launch', 'landing', 'rover', 'orbit_raise', 'probe_operations', 'moon', 'apollo'] }, name: str('Mission name'), altitude: num('Target orbit altitude [m]', { minimum: 80000, maximum: 2000000 }), inclination: num('Orbit inclination [deg]', { minimum: 0, maximum: 180 }), body: { type: 'string', enum: ['earth', 'moon', 'mars'] }, site: str('Launch site id: cape, kourou, equator, polar'), distance: num('Rover traverse distance [m]', { minimum: 1, maximum: 100000 }), options: { type: 'object', description: 'Extra generator options' } } } },
  { name: 'MODIFY_MISSION', mutates: true, description: 'Edit the mission: rename, change the objective altitude, max duration, pitch programme (schedule), or add / edit / remove timeline events.',
    parameters: { type: 'object', properties: { mission: MISSION, name: str('New name'), altitude: num('New target altitude [m]'), maxTime: num('Maximum mission time [s]', { minimum: 10, maximum: 1e7 }), schedule: { type: 'object', description: 'Ascent pitch programme {hF: altitude at horizontal [m], n: shape exponent}' }, operations: { type: 'array', description: 'List of {op:"add_event"|"edit_event"|"remove_event", id?, event?, changes?}', items: { type: 'object' } } } } },
  { name: 'RUN_SIMULATION', mutates: false, heavy: true, description: 'Run the physics simulation of a vehicle on a mission. The result is real: integrated with RK4 from the vehicle and mission definitions. tune:true additionally flies several candidate ascent pitch programmes and keeps the best one flown.',
    parameters: { type: 'object', properties: { vehicle: VEHICLE, mission: MISSION, name: str('Run name'), tune: { type: 'boolean', description: 'Search the ascent pitch programme by flying candidates' }, maxWallSeconds: num('Wall-clock limit [s]', { minimum: 1, maximum: 600 }) } } },
  { name: 'STOP_SIMULATION', mutates: false, description: 'Stop the simulation that is currently running.', parameters: { type: 'object', properties: {} } },
  { name: 'READ_TELEMETRY', mutates: false, description: 'Read recorded telemetry of a run: values at a time, statistics (max / min / final / mean) or a downsampled series.',
    parameters: { type: 'object', required: ['channels'], properties: { run: RUN, channels: { type: 'array', items: { type: 'string' }, description: 'Channel ids, e.g. alt, speed, q, mass, thrust' }, at: num('Time [s] for a single interpolated sample'), from: num('Start time [s]'), to: num('End time [s]'), points: num('Number of series points', { minimum: 2, maximum: 200 }), stat: { type: 'string', enum: ['max', 'min', 'final', 'mean', 'series', 'at'] } } } },
  { name: 'ANALYZE_RESULTS', mutates: false, description: 'Engineering analysis of a run: metrics, findings, detected failures (CONFIRMED / LIKELY / POSSIBLE) with cause, evidence and solutions, and the mission timeline. Everything comes from the recorded run.',
    parameters: { type: 'object', properties: { run: RUN } } },
  { name: 'COMPARE_SIMULATIONS', mutates: false, description: 'Compare two runs metric by metric (default: the previous and the last run).',
    parameters: { type: 'object', properties: { a: str('First run id / "previous"'), b: str('Second run id / "last"') } } },
  { name: 'SAVE_PROJECT', mutates: false, description: 'Save the project (vehicles, missions, environment, runs, AI history) to the ASTRA LAB data folder.', parameters: { type: 'object', properties: { name: str('Project name (default: current)') } } },
  { name: 'LOAD_PROJECT', mutates: false, description: 'Load a project from the ASTRA LAB data folder by name.', parameters: { type: 'object', required: ['name'], properties: { name: str('Project name') } } },
  { name: 'CREATE_EXPERIMENT', mutates: false, heavy: true, description: 'Run a parameter sweep: every combination of the given parameter values is a real simulation. Paths look like vehicle.components[fuel2].propellantMass or vehicle.group[stage2].propellantScale.',
    parameters: { type: 'object', required: ['parameters'], properties: { name: str('Experiment name'), vehicle: VEHICLE, mission: MISSION, parameters: { type: 'array', items: { type: 'object' }, description: 'Each {path, values:[...]} or {path, from, to, steps, mode?}' }, objective: { type: 'object', description: '{metric, goal:"min"|"max", requireSuccess?}' } } } },
  // read-only helpers (not counted among the 20 core tools)
  { name: 'RUN_MONTE_CARLO', mutates: false, heavy: true, aux: true, description: 'Reliability study: fly the design many times with randomly dispersed inputs (engine thrust, Isp, propellant loaded, structural mass) and report the probability of success with a 95 % confidence interval, the spread of results and which input matters most. Every run is a real simulation; the seed makes it reproducible.',
    parameters: { type: 'object', properties: { name: str('Study name'), vehicle: VEHICLE, mission: MISSION, runs: num('Number of simulations (1..500, default 30)', { minimum: 1, maximum: 500 }), seed: num('Random seed (default 1)'), factors: { type: 'array', items: { type: 'object' }, description: 'Optional custom dispersions [{name, sigma (relative 1 sigma), dist?:"normal"|"uniform", targets:[{path, mode?}]}]. Default: thrust 1.5 %, Isp 1 %, propellant 0.5 %, structural mass 3 %.' }, correlations: { type: 'array', items: { type: 'object' }, description: 'Optional linked inputs [{a: factor name, b: factor name, rho: -0.99..0.99}], for example a hot engine with more thrust AND more Isp: {a:"Engine thrust", b:"Engine Isp", rho:0.6}.' } } } },
  { name: 'DESCRIBE_VEHICLE', mutates: false, aux: true, description: 'Static analysis of a vehicle: mass breakdown, delta-v per stage, thrust-to-weight, dimensions and design warnings.', parameters: { type: 'object', properties: { vehicle: VEHICLE } } },
  { name: 'LIST_CATALOG', mutates: false, aux: true, description: 'List catalog components (optionally by kind: engine, fuel_tank, solar_panel, ...) with their key properties.', parameters: { type: 'object', properties: { kind: str('Component kind filter') } } },
  { name: 'CREATE_SERVICE_MODULE', mutates: true, aux: true, description: 'Create the service module of a Moon rocket: main engine and storable propellant, solar arrays, radiators, batteries and radios. It makes the course corrections and brakes the ship into lunar orbit. Propellant is sized for dv with the lander on top.',
    parameters: { type: 'object', properties: { name: str('Service module name'), lander: str('Id or name of the lander it will carry (sets the mass on top)'), carryMass: num('Mass on top [kg] if no lander is named', { minimum: 100, maximum: 20000 }), dv: num('Delta-v budget [m/s] for two course corrections and lunar orbit braking', { minimum: 500, maximum: 3000 }) } } },
  { name: 'CREATE_APOLLO_ROCKET', mutates: true, aux: true, description: 'Create the Apollo-style Moon rocket: a Saturn V-class three-stage stack (S-IC, S-II, S-IVB, about 110 m tall) carrying a launch escape tower, a command/service module and a lunar module inside a conical adapter. Real-sized, estimated numbers; the crew is mass only.',
    parameters: { type: 'object', properties: { name: str('Rocket name') } } },
  { name: 'UNDO', mutates: false, aux: true, description: 'Undo the last design change.', parameters: { type: 'object', properties: {} } },
  { name: 'REDO', mutates: false, aux: true, description: 'Redo an undone design change.', parameters: { type: 'object', properties: {} } },
];

export const TOOL_BY_NAME = Object.assign(Object.create(null), Object.fromEntries(TOOLS.map((t) => [t.name, t])));   // null prototype: names like __proto__ or constructor are never tools
export const CORE_TOOL_NAMES = TOOLS.filter((t) => !t.aux).map((t) => t.name);

/** Minimal JSON-schema validator (type, enum, min/max, required, properties, items). Returns a list of error strings. */
export function validateArgs(schema, value, path = 'args') {
  const errs = [];
  if (!schema) return errs;
  const t = schema.type;
  if (t === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return [`${path} must be an object`];
    for (const r of schema.required ?? []) if (value[r] === undefined || value[r] === null) errs.push(`${path}.${r} is required`);
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') { errs.push(`${path}.${k} is not allowed`); continue; }
      const sub = schema.properties?.[k];
      if (sub) errs.push(...validateArgs(sub, v, `${path}.${k}`));
    }
  } else if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path} must be a finite number`];
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path} must be <= ${schema.maximum}`);
    if (t === 'integer' && !Number.isInteger(value)) errs.push(`${path} must be an integer`);
  } else if (t === 'string') {
    if (typeof value !== 'string') return [`${path} must be a string`];
    if (value.length > 2000) errs.push(`${path} is too long`);
    if (schema.enum && !schema.enum.includes(value)) errs.push(`${path} must be one of ${schema.enum.join(', ')}`);
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') errs.push(`${path} must be true or false`);
  } else if (t === 'array') {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    if (value.length > 500) errs.push(`${path} has too many items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validateArgs(schema.items, v, `${path}[${i}]`)));
  }
  return errs;
}

/** Tool definitions in the shape expected by LLM function-calling APIs. */
export const toolsForLlm = (format = 'anthropic') => TOOLS.map((t) => (format === 'anthropic'
  ? { name: t.name, description: t.description, input_schema: t.parameters }
  : { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
