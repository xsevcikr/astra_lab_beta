// Ready-made vehicles ("templates") that a student can load with one click and then study, change and fly.
// Every template is built by the real builders of src/vehicles/builders.js (the same ones the AI helper uses), comes with a
// matching mission, and validates without errors. A template only states a goal (`claim`) when tests/guides.test.js has flown
// it in the real simulator and the goal was met. Nothing here is a prediction.
import { newVehicle, addComponent } from '../src/vehicles/vehicle.js';
import { addLauncherStage, addUpperSection, embedPayload, buildProbe, buildSpacecraft, buildLander, buildRover } from '../src/vehicles/builders.js';
import { launchMission, landerMission, roverMission, probeOperationsMission } from '../src/missions/generator.js';
import { buildMoonRocket, MOON_VARIANTS } from '../src/vehicles/moonship.js';
import { moonMissionFromPlan } from '../src/missions/moon.js';
import { MOON_PLANS } from './moon-plans.js';
import { buildApolloStack, buildApolloCapsule } from '../src/vehicles/apollo.js';
import { apolloMissionFromPlan, apolloReturnMission } from '../src/missions/apollo.js';
import { APOLLO_PLANS } from './apollo-plans.js';

// ------------------------------------------------------------------------------------------------ launchers
/** Sounding rocket: ONE stage, straight up, no orbit. The mission goal is simply "go above 100 km". */
function makeSounding() {
  const D = 0.6;
  const v = newVehicle({ name: 'Sounding rocket', type: 'rocket', description: 'One stage, one engine: flies straight up above the edge of space.', dataSource: 'user' });
  v.meta = { role: 'launcher', body: 'earth', cfg: { D }, targetAltitude: 100000, payloadMass: 300 };
  addLauncherStage(v, { order: 1, engine: 'eng-al25s', engineCount: 1, propellantMass: 600, diameter: D, name: 'Rocket' });
  const up = addUpperSection(v, { diameter: D, payloadLength: 0.7 });
  const fairing = up.find((c) => c.kind === 'fairing');
  addComponent(v, { catalogId: 'payload-dummy', name: 'Science experiment', group: 'payload', parent: fairing.id, mount: 'internal', mass: 300, length: 0.6, diameter: 0.4 });
  const m = launchMission(v, { altitude: 100000, kickAngle: 1, name: 'Fly above 100 km' });
  m.description = 'Lift off, burn the engine and climb above 100 km (the edge of space). The flight ends once the altitude goal is met.';
  m.objective = { type: 'suborbital', altitude: 100000 };
  m.events = m.events.filter((e) => !['cutoff', 'circ', 'deploy', 'appendages', 'sunpoint'].includes(e.id));
  return { vehicle: v, mission: m };
}

/** Two-stage kerolox launcher with a probe payload, sized like the AI helper sizes it (numbers found by designLauncher, then frozen here so loading is instant). */
function makeLauncher({ name, description, payloadMass, altitude, D, e1, n1, p1, e2, n2, p2, schedule, payloadName }) {
  const payload = buildProbe({ name: payloadName, mass: payloadMass });
  const bus = payload.components.find((c) => c.kind === 'payload' && c.mount === 'stack') ?? payload.components[0];
  const payloadLength = bus.length ?? 0.8;
  const v = newVehicle({ name, type: 'rocket', description, dataSource: 'user' });
  v.meta = { cfg: { D, payloadLength } };
  addLauncherStage(v, { order: 1, engine: e1, engineCount: n1, propellantMass: p1, diameter: D });
  addLauncherStage(v, { order: 2, engine: e2, engineCount: n2, propellantMass: p2, diameter: D });
  const up = addUpperSection(v, { diameter: D, payloadLength });
  embedPayload(v, payload, { fairingId: up.find((c) => c.kind === 'fairing').id });
  v.meta = { role: 'launcher', body: 'earth', cfg: { D, payloadLength, e1, n1, e2, n2, p1, p2 }, targetAltitude: altitude, latitude: 28.573, restartableUpper: true, payloadMass, payloadName };
  const m = launchMission(v, { altitude, ...(schedule ? { schedule } : {}), name: `Launch to ${altitude / 1000} km orbit` });
  return { vehicle: v, mission: m };
}

/** The Moon rocket (ASTRA LAB 1.8). The launch epoch and burn times come from data/moon-plans.js (found once by the planner, re-checked by tests/moonrocket.test.js), so loading is instant. */
function makeMoonRocket(id) {
  const vehicle = buildMoonRocket(MOON_VARIANTS[id]);
  const mission = moonMissionFromPlan(vehicle, MOON_PLANS[id], { name: id === 'moon-rocket-module' ? 'Land a lunar module on the Moon' : 'Land a rover on the Moon' });
  return { vehicle, mission };
}

/** The Apollo 11-style Moon rocket (ASTRA LAB 1.9): Saturn V stack, lunar module in its adapter, landing, liftoff, rendezvous, docking and the way home. Plan: data/apollo-plans.js. */
function makeApollo() {
  const vehicle = buildApolloStack();
  return { vehicle, mission: apolloMissionFromPlan(vehicle, APOLLO_PLANS.default) };
}

/** The Apollo command module alone, at the top of the atmosphere (2.3): lifting entry, parachutes, splashdown in about 16 simulated minutes. */
function makeApolloReturn() {
  const vehicle = buildApolloCapsule();
  return { vehicle, mission: apolloReturnMission(vehicle) };
}

// ------------------------------------------------------------------------------------------------ spacecraft
function makeProbe() {
  const v = buildProbe({ name: 'Space probe', mass: 100, destination: 'mars' });
  const bus = v.components.find((c) => c.kind === 'payload' && c.mount === 'stack');
  // the stock probe runs its battery too warm in full sunlight: one extra radiator keeps it inside its limits
  addComponent(v, { catalogId: 'thermal-radiator', group: 'payload', mount: 'radial', parent: bus.id, area: 1.5, name: 'Extra radiator' });
  const m = probeOperationsMission(v, { inclination: 40, altitude: 500000, name: 'Probe operations in orbit' });
  m.initial.raan = 180;   // an orbit that passes over the ground station, so the downlink can happen
  return { vehicle: v, mission: m };
}
function makeSatellite() {
  const v = buildSpacecraft({ name: 'Satellite', dryMass: 250, dv: 300, panelArea: 4 });
  v.type = 'satellite';
  v.description = 'A small satellite with solar panels, batteries, radio and a camera.';
  const bus = v.components.find((c) => c.kind === 'structural_section');
  addComponent(v, { catalogId: 'thermal-radiator', group: 'main', mount: 'radial', parent: bus.id, area: 3, name: 'Extra radiator' });
  const m = probeOperationsMission(v, { inclination: 40, altitude: 500000, name: 'Satellite operations in orbit' });
  m.initial.raan = 180;
  return { vehicle: v, mission: m };
}
function makeLander() {
  const v = buildLander({ name: 'Moon lander', body: 'moon', payloadMass: 150 });
  return { vehicle: v, mission: landerMission(v) };
}
function makeLanderRover() {
  const rover = buildRover({ name: 'Rover', mass: 120 });
  const v = buildLander({ name: 'Moon lander with rover', body: 'moon', carryRover: rover });
  return { vehicle: v, mission: landerMission(v, { name: 'Moon landing and rover deployment' }) };
}
function makeRover() {
  const v = buildRover({ name: 'Rover', mass: 150 });
  return { vehicle: v, mission: roverMission(v, { body: 'moon', distance: 200, name: 'Moon rover drive (200 m)' }) };
}

// ------------------------------------------------------------------------------------------------ catalogue
/**
 * id, title, emoji, blurb (<= 14 words), type (vehicle type), difficulty,
 * make() -> {vehicle, mission} (pure, no app needed), build(app) -> puts it into app.project,
 * claim (optional): what tests/guides.test.js has verified in the real simulator for the attached mission.
 */
const DEFS = [
  { id: 'sounding-rocket', title: 'Sounding rocket', emoji: 'rocket', blurb: 'One stage, one engine. Flies straight up past the edge of space.', type: 'rocket', difficulty: 'easy',
    make: makeSounding, claim: { kind: 'altitude', minKm: 100 }, learn: ['engine', 'fuel_tank', 'oxidizer_tank', 'fairing', 'avionics'] },
  { id: 'small-launcher', title: 'Small satellite launcher', emoji: 'satellite', blurb: 'Two stages that put a 100 kg probe into a 200 km orbit.', type: 'rocket', difficulty: 'medium',
    make: () => makeLauncher({ name: 'Small launcher (100 kg)', description: 'Two-stage kerolox launcher for a 100 kg probe, 200 km orbit.', payloadMass: 100, altitude: 200000, payloadName: 'Space probe', D: 1.19, e1: 'eng-al25s', n1: 6, p1: 6741, e2: 'eng-al25v', n2: 1, p2: 1578 }),
    claim: { kind: 'orbit', km: 200 }, learn: ['engine', 'interstage', 'fairing', 'payload'] },
  { id: 'medium-launcher', title: 'Medium launcher', emoji: 'rocket', blurb: 'A bigger two-stage rocket that carries 500 kg to a 400 km orbit.', type: 'rocket', difficulty: 'hard',
    make: () => makeLauncher({ name: 'Medium launcher (500 kg)', description: 'Two-stage kerolox launcher for a 500 kg payload, 400 km orbit.', payloadMass: 500, altitude: 400000, payloadName: 'Satellite payload', D: 1.65, e1: 'eng-al100', n1: 4, p1: 16128, e2: 'eng-al25v', n2: 2, p2: 3916, schedule: { hF: 100000, n: 0.65 } }),
    claim: { kind: 'orbit', km: 400 }, learn: ['engine', 'interstage', 'fairing', 'payload'] },
  { id: 'space-probe', title: 'Space probe', emoji: 'probe', blurb: 'A 100 kg probe with camera, spectrometer, solar panels and antennas.', type: 'probe', difficulty: 'easy',
    make: makeProbe, claim: { kind: 'survive' }, learn: ['instrument', 'solar_panel', 'antenna', 'battery', 'radiator'] },
  { id: 'satellite', title: 'Satellite', emoji: 'satellite', blurb: 'A small satellite that opens its solar panels and talks to Earth.', type: 'satellite', difficulty: 'easy',
    make: makeSatellite, claim: { kind: 'survive' }, learn: ['solar_panel', 'antenna', 'reaction_wheel', 'battery', 'radiator'] },
  { id: 'moon-lander', title: 'Moon lander', emoji: 'moon', blurb: 'Fires its engine to slow down and land softly on four legs.', type: 'lander', difficulty: 'medium',
    make: makeLander, claim: { kind: 'landing' }, learn: ['engine', 'landing_legs', 'guidance', 'rcs'] },
  { id: 'lander-with-rover', title: 'Moon lander with rover', emoji: 'lander', blurb: 'A lander that carries a small rover and drops it on the Moon.', type: 'lander', difficulty: 'hard',
    make: makeLanderRover, claim: { kind: 'landing' }, learn: ['engine', 'landing_legs', 'rover_chassis', 'wheel'] },
  { id: 'moon-rocket-apollo', title: 'Apollo 11 Moon rocket', emoji: 'moon', blurb: 'A Saturn V-style rocket that lands a lunar module, lifts off, docks and heads home.', type: 'rocket', difficulty: 'hard',
    make: makeApollo, claim: { kind: 'splashdown' }, learn: ['engine', 'interstage', 'fairing', 'landing_legs', 'rcs'] },
  { id: 'apollo-return', title: 'Apollo: coming home', emoji: 'earth', blurb: 'The capsule comes home from the Moon: fiery entry, parachutes, splashdown.', type: 'spacecraft', difficulty: 'medium',
    make: makeApolloReturn, noGuide: true, claim: { kind: 'splashdown' }, learn: ['heat_shield', 'parachute', 'rcs'] },
  { id: 'moon-rocket-rover', title: 'Moon rocket (rover)', emoji: 'moon', blurb: 'Three stages, a service module and a lander that puts a rover on the Moon.', type: 'rocket', difficulty: 'hard',
    make: () => makeMoonRocket('moon-rocket-rover'), claim: { kind: 'landing' }, learn: ['engine', 'interstage', 'fairing', 'landing_legs', 'rover_chassis'] },
  { id: 'moon-rocket-module', title: 'Moon rocket (lunar module)', emoji: 'moon', blurb: 'Three stages, a service module and a lunar module landing on the Moon, like Apollo.', type: 'rocket', difficulty: 'hard',
    make: () => makeMoonRocket('moon-rocket-module'), claim: { kind: 'landing' }, learn: ['engine', 'interstage', 'fairing', 'landing_legs', 'rcs'] },
  { id: 'rover', title: 'Rover', emoji: 'rover', blurb: 'Six wheels, a battery and a solar panel. Drives 200 m on the Moon.', type: 'rover', difficulty: 'easy',
    make: makeRover, claim: { kind: 'traverse', meters: 200 }, learn: ['rover_chassis', 'wheel', 'motor', 'solar_panel', 'battery'] },
];

/** Put the vehicle (and its mission) into an app's project and make both active. Returns the vehicle. */
function instantiate(def, app) {
  const { vehicle, mission } = def.make();
  const P = app.project;
  P.setVehicle(vehicle, { activate: true });
  if (mission) { mission.vehicleName = vehicle.name; P.setMission(mission, { activate: true }); }
  return vehicle;
}

export const TEMPLATES = DEFS.map((d) => ({ ...d, ask: null, build: async (app) => instantiate(d, app) }));
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
export const templateById = (id) => TEMPLATE_BY_ID[id] ?? null;
