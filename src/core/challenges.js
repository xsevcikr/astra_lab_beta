// Challenges: "missions for students". Each challenge sets up a real launch mission (the same CREATE_MISSION tool the AI and the Mission
// Planner use) and is judged ONLY on numbers measured in a recorded simulation run (runMetrics of src/core/run-analysis.js).
// Nothing here is simulated or invented: a goal passes when the recorded run says so.
//
// Stars: 1 = the mission objective (all tier-1 goals), 2 = + the secondary goals (tier 2), 3 = + the stretch goals (tier 3).
import { runMetrics } from './run-analysis.js';
import { analyzeVehicle, ascentDvRequired } from '../vehicles/analysis.js';
import { findTransferWindows, dateToEpoch } from '../../physics/mission-design.js';

const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '–');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const km = (m) => `${f0(m / 1000)} km`;

/** True when a payload was released in the run (recorded separation "deploy:payload"). */
export const payloadDeployed = (rec) => (rec.result?.summary?.separations ?? []).some((s) => /payload/.test(s.group ?? ''));

/** Difficulty tiers of the whole library: 1 Easy, 2 Medium, 3 Hard, 4 Pro. */
export const DIFFICULTY_NAMES = ['', 'Easy', 'Medium', 'Hard', 'Pro'];

/** Payload mass [kg] of the flown vehicle: from its payload components (real design analysis), else from the vehicle's meta. */
export function payloadOf(rec) {
  const v = rec?.vehicle;
  if (v?.components?.length) { try { const p = analyzeVehicle(v).payloadMass; if (Number.isFinite(p) && p > 0) return p; } catch { /* fall through */ } }
  const p = v?.meta?.payloadMass; return Number.isFinite(p) ? p : NaN;
}
/** Illustrative price of the engines and motors of a design [US$]. Only parts with a catalog `cost` count (tanks, structure and electronics are not priced). NOT real prices. */
export function engineCostOf(rec) {
  const comps = rec?.vehicle?.components; if (!comps?.length) return NaN;
  let c = 0, n = 0; for (const x of comps) if (Number.isFinite(x.cost)) { c += x.cost * (x.count ?? 1); n++; }
  return n ? c : NaN;
}

// ---- reusable goals (each returns {ok, value, target}; value/target are display strings computed from the recorded run)
const G = {
  above: (id, label, key, limit, fmtv) => ({ id, label, test: (m) => ({ ok: Number.isFinite(m[key]) && m[key] >= limit, value: fmtv(m[key]), target: `at least ${fmtv(limit)}` }) }),
  below: (id, label, key, limit, fmtv) => ({ id, label, test: (m) => ({ ok: Number.isFinite(m[key]) && m[key] <= limit, value: fmtv(m[key]), target: `at most ${fmtv(limit)}` }) }),
  orbit: (altitude, label) => ({
    id: 'orbit', label: label ?? `Reach a circular orbit around ${km(altitude)}`,
    test: (m, res) => ({ ok: res.status === 'SUCCESS', value: Number.isFinite(m.finalPeri) ? `${km(m.finalPeri)} × ${km(m.finalApo)}` : String(res.status), target: `orbit at ${km(altitude)} (status SUCCESS)` }),
  }),
  deployed: { id: 'deploy', label: 'Release the payload into orbit', test: (m, res, rec) => ({ ok: payloadDeployed(rec), value: payloadDeployed(rec) ? 'released' : 'not released', target: 'payload released' }) },
  reserve: (frac) => ({ id: `reserve${Math.round(frac * 100)}`, label: `Keep at least ${Math.round(frac * 100)}% of the last stage's propellant`, test: (m) => ({ ok: Number.isFinite(m.lastStageReserveFrac) && m.lastStageReserveFrac >= frac, value: Number.isFinite(m.lastStageReserveFrac) ? `${f1(100 * m.lastStageReserveFrac)}%` : '–', target: `at least ${Math.round(frac * 100)}%` }) }),
};

const SITE = { cape: { lat: 28.573 }, polar: { lat: 65 } };

const tempC = (k) => `${f0(k - 273.15)} °C`;
const kpa = (x) => `${f1(x / 1000)} kPa`;
const gee = (x) => `${f1(x)} g`;
const tonnes = (x) => `${f1(x / 1000)} t`;

// story = one or two short sentences; hint = one plain tip shown by the Hint button (the lesson button sits next to it)
export const CHALLENGES = [
  { id: 'first-steps', title: 'First steps: above 100 km', story: 'Space starts about 100 km up. Fly over that line!', hint: 'Your rocket needs more push than weight. Check thrust-to-weight.', difficulty: 1, lesson: 'L1-2',
    setup: { altitude: 200000 }, constraints: [],
    goals: [
      { tier: 1, ...G.above('space', 'Climb above 100 km (the edge of space)', 'maxAlt', 100000, km) },
      { tier: 2, ...G.orbit(200000) },
      { tier: 3, ...G.below('gentle', 'Keep the peak acceleration at or below 7 g', 'maxG', 7, gee) },
    ] },
  { id: 'sound-barrier', title: 'Break the sound barrier', story: 'Sound travels at Mach 1. Go faster than that, then much faster.', hint: 'Speed comes from burning fuel for a long time. Bigger stages help.', difficulty: 1, lesson: 'L5-4',
    setup: { altitude: 200000 }, constraints: [],
    goals: [
      { tier: 1, ...G.above('mach1', 'Reach Mach 1 (the speed of sound)', 'maxMach', 1, (x) => `Mach ${f1(x)}`) },
      { tier: 2, ...G.above('mach5', 'Reach Mach 5', 'maxMach', 5, (x) => `Mach ${f1(x)}`) },
      { tier: 3, ...G.above('mach10', 'Reach Mach 10', 'maxMach', 10, (x) => `Mach ${f1(x)}`) },
    ] },
  { id: 'strong-liftoff', title: 'Strong liftoff', story: 'A rocket must push harder than it weighs. Lift off with power to spare.', hint: 'Thrust divided by weight is the number to watch. Add engine thrust or cut weight.', difficulty: 1, lesson: 'L3-4',
    setup: { altitude: 200000 }, constraints: [],
    goals: [
      { tier: 1, ...G.above('space', 'Climb above 100 km', 'maxAlt', 100000, km) },
      { tier: 2, ...G.above('twr13', 'Thrust-to-weight at least 1.3 at liftoff', 'liftoffTWR', 1.3, (x) => f1(x)) },
      { tier: 3, ...G.above('twr15', 'Thrust-to-weight at least 1.5', 'liftoffTWR', 1.5, (x) => f1(x)) },
    ] },
  { id: 'reach-orbit', title: 'Reach orbit (200 km)', story: 'Staying up needs sideways speed: about 7.8 km/s. Circle the Earth at 200 km.', hint: 'Orbit is mostly sideways speed. Your rocket needs about 9 km/s of delta-v.', difficulty: 1, lesson: 'L7-1',
    setup: { altitude: 200000 }, constraints: [],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, id: 'circular', label: 'Make the orbit round: high and low point within 10 km', test: (m) => ({ ok: Number.isFinite(m.finalApo) && m.finalApo - m.finalPeri <= 10000, value: Number.isFinite(m.finalApo) ? `${f1((m.finalApo - m.finalPeri) / 1000)} km apart` : '–', target: 'at most 10 km apart' }) },
      { tier: 3, ...G.deployed },
    ] },
  { id: 'station-orbit', title: 'Space-station orbit (400 km)', story: 'The space station circles at about 400 km. Higher costs more fuel.', hint: 'More height needs more delta-v. Add fuel or a better engine.', difficulty: 2, lesson: 'L7-3',
    setup: { altitude: 400000 }, constraints: [],
    goals: [
      { tier: 1, ...G.orbit(400000) },
      { tier: 2, ...G.deployed },
      { tier: 3, ...G.reserve(0.05) },
    ] },
  { id: 'max-q', title: 'Survive Max-Q', story: 'Halfway up, air pushes hardest on the rocket. Keep that push low.', hint: 'Max-Q is fast flight in thick air. Throttle down a little near it.', difficulty: 2, lesson: 'L5-2',
    setup: { altitude: 200000 }, constraints: [{ label: 'Dynamic pressure under 50 kPa' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('q50', 'Keep the peak air pressure below 50 kPa', 'maxQ', 50000, kpa) },
      { tier: 3, ...G.below('q35', 'Keep the peak air pressure below 35 kPa', 'maxQ', 35000, kpa) },
    ] },
  { id: 'gentle-ride', title: 'Gentle ride', story: 'Astronauts and fragile satellites hate hard squeezing. Reach orbit gently.', hint: 'Acceleration grows as fuel burns off. Stage earlier or use less thrust.', difficulty: 2, lesson: 'L3-4',
    setup: { altitude: 200000 }, constraints: [{ label: 'Peak acceleration below 5 g' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('g5', 'Keep the peak acceleration below 5 g', 'maxG', 5, gee) },
      { tier: 3, ...G.below('g4', 'Keep the peak acceleration below 4 g', 'maxG', 4, gee) },
    ] },
  { id: 'lightweight', title: 'Lightweight', story: 'Every kilogram must be lifted by fuel. Reach orbit with a lighter rocket.', hint: 'Mass budgets show where the weight is. Trim what you do not need.', difficulty: 2, lesson: 'L10-2',
    setup: { altitude: 200000 }, constraints: [{ label: 'Lift-off mass under 9 tonnes' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('m9', 'Lift-off mass below 9 tonnes', 'initialMass', 9000, tonnes) },
      { tier: 3, ...G.below('m7', 'Lift-off mass below 7 tonnes', 'initialMass', 7000, tonnes) },
    ] },
  { id: 'efficient', title: 'Efficient', story: 'Good engineers keep a safety margin. Reach orbit with fuel to spare.', hint: 'Staging throws away empty tanks. Better staging leaves more fuel.', difficulty: 2, lesson: 'L3-3',
    setup: { altitude: 200000 }, constraints: [{ label: 'At least 5% fuel left in the last stage' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.reserve(0.05) },
      { tier: 3, ...G.reserve(0.10) },
    ] },
  { id: 'cool-nose', title: 'Keep the nose cool', story: 'Fast flight in air heats the nose. Reach orbit without cooking it.', hint: 'Heat comes from speed in thick air. Climb out of the air sooner.', difficulty: 2, lesson: 'L5-4',
    setup: { altitude: 200000 }, constraints: [{ label: 'Nose under 200 °C' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('nose200', 'Keep the nose below 200 °C', 'maxTempNose', 473.15, tempC) },
      { tier: 3, ...G.below('nose150', 'Keep the nose below 150 °C', 'maxTempNose', 423.15, tempC) },
    ] },
  { id: 'steady-flight', title: 'Steady flight', story: 'A rocket flies best pointing the way it moves. Keep it straight.', hint: 'Angle of attack is how far the nose points off the flight path. Fly a smoother turn.', difficulty: 2, lesson: 'L6-4',
    setup: { altitude: 200000 }, constraints: [{ label: 'Angle of attack under 20°' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('aoa20', 'Keep the angle of attack below 20°', 'maxAoA', 20, (x) => `${f1(x)}°`) },
      { tier: 3, ...G.below('aoa10', 'Keep the angle of attack below 10°', 'maxAoA', 10, (x) => `${f1(x)}°`) },
    ] },
  { id: 'perfect-circle', title: 'Perfect circle (300 km)', story: 'A round orbit is a tidy orbit. Fly a circle at 300 km.', hint: 'Orbit shape is set by the last burn. Stop the engine at the right moment.', difficulty: 2, lesson: 'L7-2',
    setup: { altitude: 300000 }, constraints: [],
    goals: [
      { tier: 1, ...G.orbit(300000) },
      { tier: 2, ...G.below('ecc5', 'Make the orbit nearly round (shape number under 0.005)', 'finalEcc', 0.005, (x) => (Number.isFinite(x) ? x.toFixed(4) : '–')) },
      { tier: 3, ...G.below('ecc1', 'Make it very round (shape number under 0.001)', 'finalEcc', 0.001, (x) => (Number.isFinite(x) ? x.toFixed(4) : '–')) },
    ] },
  { id: 'speedy-orbit', title: 'Speedy orbit', story: 'Reach orbit as fast as you can. A short flight means less gravity loss.', hint: 'Less time fighting gravity saves fuel. Use a strong first stage.', difficulty: 3, lesson: 'L6-3',
    setup: { altitude: 200000 }, constraints: [{ label: 'Orbit in under 9 minutes' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.below('t540', 'Reach orbit in under 9 minutes', 'endTime', 540, (x) => `${f1(x / 60)} min`) },
      { tier: 3, ...G.below('t450', 'Reach orbit in under 7.5 minutes', 'endTime', 450, (x) => `${f1(x / 60)} min`) },
    ] },
  { id: 'heavy-lift', title: 'Heavy lift: 500 kg to 400 km', story: 'A big satellite needs a big rocket. Deliver 500 kg to the station orbit.', hint: 'Rocket equation: a heavier payload needs much more fuel. Scale up the stages.', difficulty: 3, lesson: 'L3-2',
    setup: { altitude: 400000 }, constraints: [{ label: 'Payload of at least 500 kg' }], build: 'Build me a two-stage rocket carrying a 500 kg satellite to a 400 km orbit.',
    goals: [
      { tier: 1, id: 'payload', label: 'Carry a payload of at least 500 kg', test: (m, res, rec) => { const p = rec.vehicle?.meta?.payloadMass; return { ok: Number.isFinite(p) && p >= 499.5, value: Number.isFinite(p) ? `${f0(p)} kg` : '–', target: 'at least 500 kg' }; } },
      { tier: 1, ...G.orbit(400000) },
      { tier: 2, ...G.deployed },
      { tier: 3, ...G.reserve(0.05) },
    ] },
  { id: 'high-flyer', title: 'High flyer: 1,000 km', story: 'Fly far above the station. Your highest point must reach 1,000 km.', hint: 'Going higher costs a lot of delta-v. Watch your fuel budget.', difficulty: 3, lesson: 'L6-1',
    setup: { altitude: 1000000 }, constraints: [],
    goals: [
      { tier: 1, id: 'apo', label: 'Reach a highest point of 1,000 km', test: (m) => ({ ok: Number.isFinite(m.finalApo) && m.finalApo >= 990000, value: km(m.finalApo), target: 'about 1,000 km' }) },
      { tier: 2, ...G.orbit(1000000) },
      { tier: 3, ...G.deployed },
    ] },
  { id: 'polar-pioneer', title: 'Polar pioneer', story: 'Launch from the far north into an orbit over the poles. It sees the whole planet.', hint: 'Launching north makes a tilted orbit. No Earth-spin bonus here.', difficulty: 3, lesson: 'L7-4',
    setup: { altitude: 200000, site: 'polar' }, constraints: [{ label: 'Launch site: far north (65°N)' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, ...G.above('incl', 'Orbit tilted at least 60° to the equator', 'finalIncl', 60, (x) => `${f1(x)}°`) },
      { tier: 3, ...G.deployed },
    ] },
];


// =============================================================================================================================================
// PRO missions: harder, judged from the same measured run data (or, for the transfer budget, from the real design analysis).
// Difficulty 3 = Hard, 4 = Pro. Honest limits (see UNAVAILABLE below): nothing here is faked.
// =============================================================================================================================================
const usd = (x) => (Number.isFinite(x) ? `$${f0(x)}` : '–');
const kms = (x) => (Number.isFinite(x) ? `${f0(x)} m/s` : '–');
const kg = (x) => (Number.isFinite(x) ? `${f0(x)} kg` : '–');
const mps = (x) => (Number.isFinite(x) ? `${f1(x)} m/s` : '–');

/** Delta-v budget of the Mars transfer challenge, from physics/mission-design.js (real ephemeris, Lambert transfer) + the ascent estimate. Computed once. */
let marsMemo = null;
export function marsTransferBudget() {
  if (marsMemo) return marsMemo;
  const ascent = ascentDvRequired('earth', 200000, 28.573).total;
  const wins = findTransferWindows({ startT: dateToEpoch('2026-01-01'), spanDays: 900 });
  if (!wins.length) return (marsMemo = { ascent, departure: NaN, arrival: NaN, total: NaN, windowDate: null });
  const w = wins.reduce((a, b) => (b.dvDeparture < a.dvDeparture ? b : a));
  marsMemo = { ascent, departure: w.dvDeparture, arrival: w.dvArrivalCircular, total: ascent + w.dvDeparture, tofDays: w.tof / 86400, c3: w.c3 };
  return marsMemo;
}
/** Metrics of a design challenge: the static analysis of the vehicle (rocket equation per stage), not a flight. */
function designMetrics(vehicle, ch) {
  const a = analyzeVehicle(vehicle);
  const b = ch.budget ? ch.budget() : null;
  return { dvVacuum: a.dvVacuum, liftoffMass: a.totalMass, payloadKg: a.payloadMass, liftoffTWR: a.liftoffTWR, required: b?.total, ascentDv: b?.ascent, departureDv: b?.departure, arrivalDv: b?.arrival };
}

const lossTest = (frac) => (m) => { const loss = (m.dvGravity ?? NaN) + (m.dvDrag ?? NaN) + (m.dvSteering ?? NaN), f = loss / m.dvIdeal; return { ok: Number.isFinite(f) && f < frac, value: Number.isFinite(f) ? `${f1(100 * f)}% (${f0(loss)} of ${f0(m.dvIdeal)} m/s)` : '–', target: `under ${Math.round(frac * 100)}%` }; };

export const PRO_CHALLENGES = [
  { id: 'moon-soft-landing', title: 'Moon landing: under 5 m/s', story: 'Land a lander on the Moon. A real landing must touch down gently.', hint: 'Burn late and hard, then slow down near the ground. Keep legs ready.', difficulty: 3, lesson: 'L8-4', needs: 'lander',
    setup: { kind: 'landing', body: 'moon' }, constraints: [{ label: 'Touchdown below 5 m/s' }], build: 'Build me a lunar lander that lands on the Moon.',
    goals: [
      { tier: 1, id: 'soft', label: 'Land on the Moon below 5 m/s (down) and 1.5 m/s (sideways)', test: (m, res) => ({ ok: res.status === 'SUCCESS' && Number.isFinite(m.touchdownVertical) && m.touchdownVertical <= 5 && m.touchdownHorizontal <= 1.5, value: Number.isFinite(m.touchdownVertical) ? `${f1(m.touchdownVertical)} m/s down, ${f1(m.touchdownHorizontal)} sideways` : String(res.status), target: 'at most 5 m/s down and 1.5 m/s sideways' }) },
      { tier: 2, ...G.below('v25', 'Touch down below 2.5 m/s', 'touchdownVertical', 2.5, mps) },
      { tier: 3, id: 'gentle', label: 'Touch down below 1 m/s with 5% fuel left', test: (m) => { const left = m.initialPropellant > 0 ? m.finalPropellant / m.initialPropellant : NaN; return { ok: m.touchdownVertical <= 1 && left >= 0.05, value: `${mps(m.touchdownVertical)}, ${Number.isFinite(left) ? f1(100 * left) : '–'}% fuel left`, target: 'at most 1 m/s and at least 5% fuel left' }; } },
    ] },
  { id: 'inclined-orbit', title: 'Tilted orbit: 65 degrees', story: 'Launch from the far north into an orbit tilted exactly 65 degrees.', hint: 'From this site, flying due east makes a 65 degree orbit. Make it round at 300 km.', difficulty: 3, lesson: 'L7-4',
    setup: { altitude: 300000, site: 'polar', inclination: 65 }, constraints: [{ label: 'Launch site: far north (65°N)' }, { label: 'Orbit tilt 65° ± 2°' }],
    goals: [
      { tier: 1, id: 'incl2', label: 'Reach orbit tilted 65° within 2°', test: (m, res) => ({ ok: res.status === 'SUCCESS' && Math.abs(m.finalIncl - 65) <= 2, value: Number.isFinite(m.finalIncl) ? `${f1(m.finalIncl)}°` : String(res.status), target: '65° ± 2°' }) },
      { tier: 2, id: 'incl05', label: 'Hit the tilt within 0.5°', test: (m) => ({ ok: Math.abs(m.finalIncl - 65) <= 0.5, value: Number.isFinite(m.finalIncl) ? `${f1(m.finalIncl)}°` : '–', target: '65° ± 0.5°' }) },
      { tier: 3, ...G.below('ecc2', 'Make the orbit round (shape number under 0.002)', 'finalEcc', 0.002, (x) => (Number.isFinite(x) ? x.toFixed(4) : '–')) },
    ] },
  { id: 'precision-orbit', title: 'Precision orbit: 550 km', story: 'Satellites need an exact height. Put yours at 550 km, not near it.', hint: 'The last burn sets the orbit. Stop the engine within a few seconds of the right moment.', difficulty: 3, lesson: 'L7-3',
    setup: { altitude: 550000 }, constraints: [{ label: 'Both orbit heights within 5 km of 550 km' }],
    goals: [
      { tier: 1, ...G.orbit(550000) },
      { tier: 2, id: 'apsides5', label: 'High and low point both within 5 km of 550 km', test: (m) => ({ ok: Math.abs(m.finalApo - 550000) <= 5000 && Math.abs(m.finalPeri - 550000) <= 5000, value: Number.isFinite(m.finalPeri) ? `${km(m.finalPeri)} × ${km(m.finalApo)}` : '–', target: '550 km ± 5 km' }) },
      { tier: 3, id: 'apsides1', label: 'Both within 1 km and 5% fuel left', test: (m) => ({ ok: Math.abs(m.finalApo - 550000) <= 1000 && Math.abs(m.finalPeri - 550000) <= 1000 && m.lastStageReserveFrac >= 0.05, value: Number.isFinite(m.finalPeri) ? `${km(m.finalPeri)} × ${km(m.finalApo)}` : '–', target: '550 km ± 1 km, 5% fuel left' }) },
    ] },
  { id: 'cheap-orbit', title: 'Cheap ride to orbit', story: 'Money matters. Deliver a satellite for the lowest engine price per kilogram.', hint: 'Engines are priced per part. Fewer, bigger engines and more payload lower the price per kg.', difficulty: 4, lesson: 'L11-1',
    setup: { altitude: 200000 }, constraints: [{ label: 'Payload of at least 200 kg' }, { label: 'Price = engines and motors only (made-up prices)' }],
    goals: [
      { tier: 1, id: 'cost40', label: 'Orbit with 200 kg or more, engines under $40,000 per kg', test: (m, res, rec) => { const p = payloadOf(rec), c = engineCostOf(rec) / p; return { ok: res.status === 'SUCCESS' && p >= 199.5 && c <= 40000, value: `${kg(p)}, ${usd(c)} per kg`, target: 'at least 200 kg and at most $40,000 per kg' }; } },
      { tier: 2, id: 'cost25', label: 'Engines under $25,000 per kg of payload', test: (m, res, rec) => { const p = payloadOf(rec), c = engineCostOf(rec) / p; return { ok: p >= 199.5 && c <= 25000, value: usd(c), target: 'at most $25,000 per kg' }; } },
      { tier: 3, id: 'cost15', label: 'Engines under $15,000 per kg of payload', test: (m, res, rec) => { const p = payloadOf(rec), c = engineCostOf(rec) / p; return { ok: p >= 199.5 && c <= 15000, value: usd(c), target: 'at most $15,000 per kg' }; } },
    ] },
  { id: 'max-payload', title: 'Biggest payload: 25 t rocket', story: 'Your rocket may weigh at most 25 tonnes at liftoff. How much can it put in orbit?', hint: 'Every kilogram of structure you save becomes payload. Stage well.', difficulty: 4, lesson: 'L10-2',
    setup: { altitude: 200000 }, constraints: [{ label: 'Liftoff mass at most 25 tonnes' }],
    goals: [
      { tier: 1, id: 'pay300', label: 'Orbit with 300 kg or more, liftoff mass at most 25 t', test: (m, res, rec) => { const p = payloadOf(rec); return { ok: res.status === 'SUCCESS' && p >= 299.5 && m.initialMass <= 25000, value: `${kg(p)}, ${tonnes(m.initialMass)}`, target: 'at least 300 kg, at most 25 t' }; } },
      { tier: 2, id: 'pay500', label: 'Carry at least 500 kg', test: (m, res, rec) => { const p = payloadOf(rec); return { ok: p >= 499.5 && m.initialMass <= 25000, value: kg(p), target: 'at least 500 kg' }; } },
      { tier: 3, id: 'pay800', label: 'Carry at least 800 kg', test: (m, res, rec) => { const p = payloadOf(rec); return { ok: p >= 799.5 && m.initialMass <= 25000, value: kg(p), target: 'at least 800 kg' }; } },
    ] },
  { id: 'min-mass-orbit', title: 'Smallest rocket to orbit', story: 'Reach orbit with the lightest rocket you can, and still carry a satellite.', hint: 'Use a high-Isp upper stage and drop empty tanks early. Carry only 50 kg.', difficulty: 4, lesson: 'L3-3',
    setup: { altitude: 200000 }, constraints: [{ label: 'Payload of at least 50 kg' }],
    goals: [
      { tier: 1, id: 'm6', label: 'Orbit with 50 kg or more, liftoff mass under 6 tonnes', test: (m, res, rec) => { const p = payloadOf(rec); return { ok: res.status === 'SUCCESS' && p >= 49.5 && m.initialMass < 6000, value: `${tonnes(m.initialMass)}, ${kg(p)}`, target: 'under 6 t with at least 50 kg' }; } },
      { tier: 2, id: 'm5', label: 'Liftoff mass under 5 tonnes', test: (m, res, rec) => ({ ok: payloadOf(rec) >= 49.5 && m.initialMass < 5000, value: tonnes(m.initialMass), target: 'under 5 t' }) },
      { tier: 3, id: 'm4', label: 'Liftoff mass under 4 tonnes', test: (m, res, rec) => ({ ok: payloadOf(rec) >= 49.5 && m.initialMass < 4000, value: tonnes(m.initialMass), target: 'under 4 t' }) },
    ] },
  { id: 'low-loss-ascent', title: 'Low-loss ascent', story: 'Every m/s lost to gravity, air and bad steering is wasted fuel. Fly an efficient climb.', hint: 'Turn over early enough, but not too early. A strong first stage cuts gravity loss.', difficulty: 4, lesson: 'L6-3',
    setup: { altitude: 200000 }, constraints: [{ label: 'Losses under 20% of the engines\' delta-v' }],
    goals: [
      { tier: 1, ...G.orbit(200000) },
      { tier: 2, id: 'loss20', label: 'Lose less than 20% of the delta-v to gravity, air and steering', test: lossTest(0.20) },
      { tier: 3, id: 'loss15', label: 'Lose less than 15%', test: lossTest(0.15) },
    ] },
  { id: 'mars-transfer-budget', title: 'Mars transfer: delta-v budget', story: 'Can your rocket leave Earth for Mars? This checks the delta-v budget only. It does not land on Mars.', hint: 'You need about 13 km/s in total. Use three stages and a high-Isp upper stage.', difficulty: 4, lesson: 'L10-1', design: true, needs: 'rocket',
    budget: marsTransferBudget, setup: { design: true }, constraints: [{ label: 'Budget check only: no Mars landing is simulated' }],
    goals: [
      { tier: 1, id: 'dvfull', label: 'Rocket delta-v covers climbing to orbit plus leaving for Mars', test: (m) => ({ ok: Number.isFinite(m.dvVacuum) && m.dvVacuum >= m.required, value: kms(m.dvVacuum), target: `at least ${kms(m.required)} (${kms(m.ascentDv)} to orbit + ${kms(m.departureDv)} to leave)` }) },
      { tier: 2, id: 'dv10', label: 'Have 10% spare delta-v', test: (m) => ({ ok: m.dvVacuum >= 1.1 * m.required, value: kms(m.dvVacuum), target: `at least ${kms(1.1 * m.required)}` }) },
      { tier: 3, id: 'dv20pay', label: 'Have 20% spare and carry 200 kg or more', test: (m) => ({ ok: m.dvVacuum >= 1.2 * m.required && m.payloadKg >= 199.5, value: `${kms(m.dvVacuum)}, ${kg(m.payloadKg)}`, target: `at least ${kms(1.2 * m.required)} and 200 kg` }) },
    ] },
];

/** Things we deliberately do NOT offer, with the reason (shown on the Challenges screen). */
export const UNAVAILABLE = [
  { id: 'reusable-booster', title: 'Reusable first stage (booster landing)', why: 'The simulator does not fly a stage back after separation. Only the Moon-lander landing is simulated. So there is no honest way to score a booster recovery.' },
  { id: 'sun-synchronous', title: 'Sun-synchronous orbit (about 98 degrees)', why: 'It needs a backwards launch. In our tests the ascent guidance reached about 91 degrees and no stable orbit. The orbit tilt it can hit is the one you get flying east from the launch site.' },
];

export const ALL_CHALLENGES = [...CHALLENGES, ...PRO_CHALLENGES].sort((a, b) => a.difficulty - b.difficulty);   // stable: keeps the written order inside a tier

export const challengeById = (id) => ALL_CHALLENGES.find((c) => c.id === id) ?? null;

/** Does the active vehicle fit the challenge (a lander for the landing, a rocket for the others)? Returns '' when it fits, else a short reason. */
export function vehicleProblem(ch, vehicle) {
  if (!vehicle) return 'You have no vehicle yet.';
  const need = ch.needs ?? (ch.setup?.kind === 'landing' ? 'lander' : 'rocket');
  if (need === 'lander' && vehicle.type !== 'lander') return 'This challenge needs a Moon lander. Ask the AI Helper to build one.';
  if (need === 'rocket' && vehicle.type !== 'rocket') return 'This challenge needs a rocket. Ask the AI Helper to build one.';
  return '';
}

/** Create the challenge's mission in the project through the same validated tool the AI uses. Needs a vehicle. Design challenges need no mission. */
export async function setupChallenge(api, ch) {
  if (typeof ch === 'string') ch = challengeById(ch);
  if (ch.design) return { ok: true, message: 'No mission is needed: this challenge checks your design.' };
  const bad = vehicleProblem(ch, api.project?.vehicle ?? api.ctx?.project?.vehicle ?? null);
  if (bad && bad !== 'You have no vehicle yet.') return { ok: false, message: bad };
  const args = { kind: ch.setup.kind === 'landing' ? 'landing' : 'launch', name: `Challenge: ${ch.title}` };
  if (ch.setup.altitude != null) args.altitude = ch.setup.altitude;
  if (ch.setup.body) args.body = ch.setup.body;
  if (ch.setup.site) args.site = ch.setup.site;
  if (ch.setup.inclination != null) args.inclination = ch.setup.inclination;
  return api.execute('CREATE_MISSION', args);
}

/** Was this run flown on the challenge's mission (same target altitude and launch site, or the same landing body)? */
export function runMatches(ch, record) {
  const obj = record.mission?.objective ?? {};
  if (ch.setup.kind === 'landing') return obj.type === 'landing' && obj.body === ch.setup.body ? { ok: true } : { ok: false, why: `This challenge needs a landing on the ${ch.setup.body === 'moon' ? 'Moon' : ch.setup.body}. Press “Set up this challenge” and launch again.` };
  if (obj.type !== 'orbit' || Math.abs((obj.altitude ?? 0) - ch.setup.altitude) > 0.01 * ch.setup.altitude) return { ok: false, why: `The run was flown to a ${km(obj.altitude ?? 0)} target, but this challenge needs ${km(ch.setup.altitude)}. Press “Set up this challenge” and launch again.` };
  const lat = record.mission?.initial?.lat;
  const want = ch.setup.site ? SITE[ch.setup.site]?.lat : null;
  if (want != null && !(Math.abs((lat ?? 999) - want) < 0.5)) return { ok: false, why: 'The run started from a different launch site. Press “Set up this challenge” and launch again.' };
  return { ok: true };
}

const judge = (ch, m, res, rec) => {
  const goals = ch.goals.map((g) => { let r; try { r = g.test(m, res, rec); } catch (e) { r = { ok: false, value: '–', target: String(e.message) }; } return { id: g.id, label: g.label, tier: g.tier, ok: !!r.ok, value: r.value, target: r.target }; });
  let stars = 0;
  for (const tier of [1, 2, 3]) { const gs = goals.filter((g) => g.tier === tier); if (gs.length && gs.every((g) => g.ok)) stars = tier; else break; }
  return { goals, stars };
};

/**
 * Judge a recorded run. Returns {valid, why?, passed, stars, goals:[{id, label, tier, ok, value, target}], metrics}.
 * telemetry is the run's Telemetry object (or pre-computed metrics through {metrics}).
 */
export function evaluate(ch, record, telemetry, metrics = null) {
  if (typeof ch === 'string') ch = challengeById(ch);
  const match = runMatches(ch, record);
  if (!match.ok) return { valid: false, why: match.why, passed: false, stars: 0, goals: [], metrics: null };
  const m = metrics ?? runMetrics(record, telemetry);
  const { goals, stars } = judge(ch, m, record.result ?? {}, record);
  return { valid: true, passed: stars >= 1, stars, goals, metrics: m };
}

/** Judge a design challenge (delta-v budget) from the vehicle itself. No flight is involved. */
export function evaluateDesign(ch, vehicle) {
  if (typeof ch === 'string') ch = challengeById(ch);
  if (!ch.design) return { valid: false, why: 'This challenge is judged from a flight, not from the design.', passed: false, stars: 0, goals: [], metrics: null };
  const bad = vehicleProblem(ch, vehicle);
  if (bad) return { valid: false, why: bad, passed: false, stars: 0, goals: [], metrics: null };
  const m = designMetrics(vehicle, ch);
  const { goals, stars } = judge(ch, m, {}, { vehicle });
  return { valid: true, passed: stars >= 1, stars, goals, metrics: m, design: true };
}

export const totalStars = (saved = {}) => CHALLENGES.reduce((s, c) => s + (saved[c.id]?.stars ?? 0), 0);
export const maxStars = CHALLENGES.length * 3;
export const proStars = (saved = {}) => PRO_CHALLENGES.reduce((s, c) => s + (saved[c.id]?.stars ?? 0), 0);
export const maxProStars = PRO_CHALLENGES.length * 3;
