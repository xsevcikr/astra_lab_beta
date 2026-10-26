// "Assumptions and limits" card. Every line below is taken from the physics code (file named in the tooltip), so the card
// says only what the simulator really does. Embed with:  parent.append(assumptionsPanel('ascent'))
// kinds: 'ascent' | 'orbit' | 'landing' | 'rover' | 'montecarlo' | 'transfer'
import { h } from './dom.js';

/** Items shown for each kind: `inc` = modelled, `ign` = ignored or approximated. [text, source file] */
export const ASSUMPTIONS = {
  ascent: {
    title: 'Launch: what is in the model',
    inc: [
      ['Rocket equation from real engine thrust, Isp and mass flow; thrust and Isp change with air pressure (straight-line blend between sea-level and vacuum Isp)', 'physics/propulsion.js, simulation.js'],
      ['Gravity pulling toward the planet centre (point mass, falls with height); J2 flattening only if switched on (off by default)', 'physics/simulation.js'],
      ['Air from the US Standard Atmosphere 1976 (layers to 86 km, tables above); the air turns with the Earth', 'physics/atmosphere.js'],
      ['Drag that changes with Mach number (table for a nose-cone body), sideways force when the rocket flies at an angle', 'physics/aero.js'],
      ['Staging (mass, centre of gravity and inertia are recomputed), fairing release, throttle limits, engine spool-up, gimbal steering', 'physics/flight-vehicle.js'],
      ['Earth rotation: the launch site starts moving east at up to 465 m/s; the launch azimuth uses it', 'physics/bodies.js, guidance.js'],
      ['Max-Q and the load on the structure (dynamic pressure times angle of attack)', 'physics/failures.js'],
      ['Loss accounting: gravity, drag and steering loss are added up during the flight', 'physics/simulation.js'],
      ['RK4 integration, fixed step 0.02 s while engines burn or in the air; same inputs always give the same result', 'physics/integrator.js'],
    ],
    ign: [
      ['Wind, weather and day-to-day air changes: none', 'no wind model'],
      ['Real guidance software and navigation errors: the simulator uses its own pitch programme and closed-loop steering', 'physics/guidance.js'],
      ['Engine throttle history, start-up and shut-down transients, tail-off thrust', 'physics/simulation.js'],
      ['Fuel sloshing, tank pressure, boil-off and body bending', 'not modelled'],
      ['Drag of your exact shape: the drag table is generic (ogive nose); fins and boat-tail details are approximated', 'physics/aero.js'],
      ['Earth is a sphere (equatorial radius); the oblate shape only enters through optional J2', 'physics/bodies.js'],
      ['Stage separation forces are tiny and ignored; separated parts are flown on their own afterwards', 'physics/debris.js'],
      ['Ascent steering loss is defined against the inertial velocity vector, so closed-loop insertion steering counts as "steering loss"', 'physics/simulation.js'],
    ],
  },
  orbit: {
    title: 'Orbits: what is in the model',
    inc: [
      ['Gravity of the main body for the whole flight; J2 flattening optional', 'physics/simulation.js'],
      ['Finite-length burns with real engine thrust (not instant speed jumps)', 'physics/simulation.js'],
      ['Orbit elements, periods and apsides computed from the state (two-body formulas)', 'physics/orbital.js'],
      ['Hand-over between bodies at the edge of their sphere of influence (Laplace radius)', 'physics/bodies.js'],
      ['Sunlight and Earth-shadow (eclipse) for power and heat', 'physics/subsystems.js'],
    ],
    ign: [
      ['Pull of the Moon and Sun on an Earth orbit (third-body perturbations): none', 'not modelled'],
      ['Air drag above 150 km (Earth) is zero: low orbits do not decay in the model', 'physics/bodies.js'],
      ['Sunlight pressure, magnetic field and gravity-field detail beyond J2: none', 'not modelled'],
      ['Between burns the time step grows (up to 2 s in Standard accuracy), which is accurate for smooth orbits but is not a precision orbit propagator', 'physics/simulation.js'],
    ],
  },
  landing: {
    title: 'Landing: what is in the model',
    inc: [
      ['Powered descent guidance that closes the loop on the real position and velocity', 'physics/guidance.js'],
      ['Thrust limits, minimum throttle, engine spool time and fuel burned during the descent', 'physics/simulation.js'],
      ['Ground contact, touchdown speed and tilt limits from the leg rating, tip-over', 'physics/simulation.js'],
      ['Mars air (NASA Glenn curve fit) with drag, parachute drag area and heating of the nose (Sutton-Graves)', 'physics/atmosphere.js, aero.js'],
    ],
    ign: [
      ['The ground is made-up terrain (repeatable noise), not a real map', 'physics/terrain.js'],
      ['No engine-plume dust or crater effects, no hazard detection, no fuel slosh', 'not modelled'],
      ['Parachute opening is simple (drag area that grows); no shock load detail or canopy dynamics', 'physics/flight-vehicle.js'],
      ['Entry, descent and landing is not validated against a real mission (Mars landers are not in the validation page)', 'documentation/AUDIT.md'],
    ],
  },
  rover: {
    title: 'Rover: what is in the model',
    inc: [
      ['Motor torque and speed limits with a power cap', 'physics/rover.js'],
      ['Wheel grip (friction plus soil cohesion), rolling resistance, slope pull, slip, rollover margin', 'physics/rover.js'],
      ['Battery use, solar charging with sun angle, heat balance', 'physics/subsystems.js'],
      ['Gravity and soil of the chosen world', 'physics/bodies.js'],
    ],
    ign: [
      ['Wheels sinking into soft soil (no detailed soil model)', 'not modelled'],
      ['Rocks and craters smaller than the terrain detail; the ground is repeatable made-up terrain', 'physics/terrain.js'],
      ['Suspension motion and steering geometry', 'not modelled'],
      ['Dust on the panels and wear', 'not modelled'],
    ],
  },
  montecarlo: {
    title: 'Monte Carlo: what is in the model',
    inc: [
      ['Many complete flights; every run is a full simulation', 'src/core/montecarlo.js'],
      ['Random changes to thrust, Isp, propellant loaded and structure mass (typical default spreads, you can change them)', 'src/core/montecarlo.js'],
      ['A seeded random generator: the same seed gives the same study', 'src/core/montecarlo.js'],
      ['Success chance with a 95% confidence range (Wilson interval); which input matters most (correlation)', 'src/core/montecarlo.js'],
    ],
    ign: [
      ['Wind, air density changes, guidance errors and sensor noise are NOT varied', 'not modelled'],
      ['The spreads are typical numbers, not measured for your real hardware', 'src/core/montecarlo.js'],
      ['Correlation shows association, not proof of cause', 'src/core/montecarlo.js'],
      ['A small number of runs gives a wide confidence range', 'src/core/montecarlo.js'],
    ],
  },
  transfer: {
    title: 'Transfers: what is in the model',
    inc: [
      ['Two-body maths: Hohmann transfers, plane changes, circularisation burns, escape and capture burns', 'physics/orbital.js, mission-design.js'],
      ['Planet positions from fixed Keplerian ellipses (Earth, Moon, Mars)', 'physics/bodies.js'],
      ['Lambert solutions between real planet positions (patched conics) and launch windows from the lowest departure energy', 'physics/mission-design.js'],
      ['Departure and arrival burns from circular parking orbits', 'physics/mission-design.js'],
    ],
    ign: [
      ['Instant burns in the calculators (the flight simulator uses finite burns)', 'physics/mission-design.js'],
      ['Planet pulls on each other, the Moon moving the Earth, and gravity assists: none', 'not modelled'],
      ['Low-thrust (ion) spiral transfers are not planned by the calculators', 'not modelled'],
      ['Arrival capture is into a circular orbit; an elliptical capture needs less fuel', 'physics/mission-design.js'],
      ['Only Earth, Moon and Mars are in the ephemeris; no other planets', 'physics/bodies.js'],
    ],
  },
};

/** A collapsible card: "Included" and "Ignored or approximated". `open` expands it at first. */
export function assumptionsPanel(kind, { open = false } = {}) {
  const A = ASSUMPTIONS[kind];
  if (!A) return h('div');
  const list = (items) => h('ul', { class: 'asm-list' }, items.map(([text, src]) => h('li', { title: src ? `Source in the code: ${src}` : null }, text)));
  return h('details', { class: 'asm-card', id: `asm-${kind}`, open: open || null },
    h('summary', null, h('span', { class: 'asm-ico' }, 'i'), ' ', A.title, h('span', { class: 'muted asm-hint' }, ' (included, ignored)')),
    h('div', { class: 'asm-cols' },
      h('div', { class: 'asm-col asm-inc' }, h('h4', null, 'Included'), list(A.inc)),
      h('div', { class: 'asm-col asm-ign' }, h('h4', null, 'Ignored or approximated'), list(A.ign))));
}
