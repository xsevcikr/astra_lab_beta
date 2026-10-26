// Pre-launch engineering validation for an Apollo-style (lunar orbit rendezvous) mission.
// Every verdict comes from numbers computed here (rocket equation, patched-conic budgets, the entry integrator). Nothing is assumed to pass.
import { G0 } from '../physics/constants.js';
import { getBody } from '../physics/bodies.js';
import { circularSpeed } from '../physics/orbital.js';
import { planetInfo, landingSite } from './planets.js';
import { stackStats, burnStack, propForDv, dvOf, transferToMoon, hyperbolicBurn, earthEntrySpeed, poweredDescentDv, poweredAscentDv, atmosphericAscentDv } from './dv.js';
import { flyEntry, entryCorridor } from './entry.js';

export const PASS = 'PASS', WARNING = 'WARNING', FAIL = 'FAIL';
const km = (m) => `${(m / 1000).toFixed(2)} km/s`;
const t = (kg) => `${(kg / 1000).toFixed(1)} t`;
const ordinal = { [PASS]: 0, [WARNING]: 1, [FAIL]: 2 };

/** Launcher stages fire bottom-first; effective Isp of a stage that also burns in the atmosphere is the mean of sea-level and vacuum Isp. */
const ascentStages = (stages) => stages.map((s) => ({ ...s, ispVac: s.ispSl ? (s.ispSl + s.ispVac) / 2 : s.ispVac }));

function check(id, title, status, value, required, why, fix) {
  return { id, title, status, value, required, why, fix: fix ?? null };
}
function margin(have, need) { return need > 0 ? (have - need) / need : 1; }
/** PASS if have >= need*(1+goodMargin), WARNING if have >= need, FAIL otherwise. */
function grade(have, need, goodMargin = 0.05) { return have >= need * (1 + goodMargin) ? PASS : have >= need ? WARNING : FAIL; }

/** Budgets and capabilities for an architecture. Returns everything validate() judges, so the UI can also draw the dv chart. */
export function analyzeArchitecture(arch) {
  const A = arch, M = A.mission, E = getBody('earth'), Mo = getBody('moon');
  const crewMass = (A.crewMass ?? 100) * A.crew;
  const cm = A.cm, sm = A.sm, lm = A.lm;
  const lmMass = lm.descent.dry + lm.descent.prop + lm.ascent.dry + lm.ascent.prop + crewMass * (lm.crewLanding / A.crew) + lm.cargo + lm.science + lm.rover;
  const cmMass = cm.mass + crewMass * (1 - lm.crewLanding / A.crew) * 0; // crew mass is carried inside cm.mass for the CM; LM crew counted in LM
  const smMass = sm.dry + sm.prop;
  const spacecraftMass = A.adapter.mass + cm.mass + smMass + lmMass;

  // ---- launcher
  const asc = ascentStages(A.launcher.stages);
  const launch = stackStats(A.launcher.stages, spacecraftMass);
  const ascentStats = stackStats(asc, spacecraftMass);
  const ascentNeed = atmosphericAscentDv('earth', M.parkAlt, M.launchLatDeg);
  const toOrbit = burnStack(asc, spacecraftMass, ascentNeed.total);
  const tliTransfer = transferToMoon({ parkAlt: M.parkAlt });
  // propellant left after orbit insertion, expressed in vacuum terms for the stages that remain
  const remStages = toOrbit.stages.map((s) => ({ ...s, ispVac: A.launcher.stages.find((x) => x.name === s.name).ispVac }));
  const afterOrbit = remStages.length ? stackStats(remStages, spacecraftMass) : { totalDv: 0, totalMass: spacecraftMass };

  // ---- translunar and lunar orbit (service module carries the CM and the LM)
  const rLunar = Mo.radius + M.lunarAlt;
  const loi = hyperbolicBurn(Mo.mu, rLunar, tliTransfer.vInfMoon);
  const tei = hyperbolicBurn(Mo.mu, rLunar, tliTransfer.vInfMoon);
  const mcc = 40, orbitOps = 60, mccReturn = 30; // m/s reserves: midcourse, plane/phasing trim, return midcourse
  const m0Sm = cm.mass + smMass + lmMass;
  const loiProp = propForDv(sm.isp, m0Sm, loi + mcc);
  const propAfterLoi = sm.prop - loiProp;
  const mTei = cm.mass + sm.dry + Math.max(propAfterLoi, 0);
  const teiNeed = tei + orbitOps + mccReturn;
  const smDvAfterLoi = dvOf(sm.isp, mTei, cm.mass + sm.dry);
  const smDvTotal = dvOf(sm.isp, m0Sm, cm.mass + sm.dry + lmMass * 0 + lmMass); // dv with the LM along (before separation)

  // ---- lunar module
  const lmDescentTwr = lm.descent.thrust / (lmMass * Mo.gravity);
  const desc = poweredDescentDv({ orbitAlt: M.lunarAlt, twr: lmDescentTwr });
  const lmDescentDv = dvOf(lm.descent.isp, lmMass, lmMass - lm.descent.prop);
  const mLandedAscent = lm.ascent.dry + lm.ascent.prop + crewMass * (lm.crewLanding / A.crew) + lm.samples;
  const mAtLanding = lmMass - lm.descent.prop; // landing mass if descent propellant is fully used (conservative for hover)
  const hoverThrottleMin = lm.descent.thrust * lm.descent.throttleMin;
  const ascTwr = lm.ascent.thrust / (mLandedAscent * Mo.gravity);
  const ascBudget = poweredAscentDv({ twr: ascTwr });
  const ascDv = dvOf(lm.ascent.isp, mLandedAscent, mLandedAscent - lm.ascent.prop);
  const rendezvousReserve = 80;

  // ---- earth return
  const site = landingSite('moon', M.landingSite);
  const vEI = earthEntrySpeed();
  const entryVeh = { mass: cm.mass, cd: cm.cd, area: cm.area, ld: cm.ld, noseRadius: cm.noseRadius };
  const limits = { maxG: cm.maxG, maxHeatLoad: cm.heatShield.areaDensity * cm.heatShield.effectiveHeat / 1.3, maxHeatFlux: cm.heatShield.maxHeatFlux };
  const corridor = entryCorridor({ v: vEI, vehicle: entryVeh, limits });
  const flight = flyEntry({ v: vEI, gammaDeg: -M.entryAngleDeg, vehicle: entryVeh, bank: 'up', sample: 5 });

  const pc = cm.parachutes;
  const mainsSplash = (n) => Math.sqrt((2 * cm.mass * 9.80665) / (1.225 * pc.mainCd * pc.mainArea * n));

  const days = M.days ?? (2 * tliTransfer.tof / 86400 + M.surfaceDays + 1.5);
  return {
    masses: { spacecraft: spacecraftMass, lm: lmMass, sm: smMass, cm: cm.mass, launch: launch.totalMass, crew: crewMass },
    launcher: { stats: launch, ascentStats, ascentNeed, toOrbit, afterOrbit, tli: tliTransfer.tli, tliTransfer },
    sm: { loi, tei, loiProp, propAfterLoi, teiNeed, smDvAfterLoi, smDvTotal, mcc, orbitOps, mccReturn, m0Sm, mTei },
    lm: { lmMass, lmDescentTwr, desc, lmDescentDv, mAtLanding, hoverThrottleMin, ascTwr, ascBudget, ascDv, rendezvousReserve, mLandedAscent, site },
    entry: { vEI, corridor, flight, limits, mainsSplash, days },
  };
}

/** Run every pre-launch check. Returns {status, canReachMoon, canReturn, checks[], analysis, summary}. */
export function validateLunarMission(arch) {
  const a = analyzeArchitecture(arch);
  const A = arch, M = A.mission, cm = A.cm, sm = A.sm, lm = A.lm, checks = [];
  const L = a.launcher, S = a.sm, LM = a.lm, EN = a.entry;

  // 1 liftoff thrust
  const st1 = A.launcher.stages[0];
  const liftTwr = (st1.thrustSl ?? st1.thrustVac) / (a.masses.launch * G0);
  checks.push(check('liftoff', 'Liftoff thrust', liftTwr >= 1.2 ? PASS : liftTwr >= 1.0 ? WARNING : FAIL, `thrust/weight ${liftTwr.toFixed(2)}`, '>= 1.2',
    liftTwr < 1 ? `The first stage pushes ${(liftTwr).toFixed(2)} times its weight. It can not leave the pad.` : liftTwr < 1.2 ? 'It can lift off but climbs slowly and wastes delta-v fighting gravity.' : 'Enough thrust to climb away from the pad.',
    liftTwr < 1.2 ? 'Add engines or thrust to stage 1, or reduce the mass above it.' : null));

  // 2 reaching orbit
  const orbitShort = L.toOrbit.shortfall;
  checks.push(check('orbit', 'Reach Earth orbit', orbitShort > 0 ? FAIL : grade(L.ascentStats.totalDv, L.ascentNeed.total, 0.02), `${km(L.ascentStats.totalDv)} available / ${km(L.ascentNeed.total)} needed (gravity, drag, steering included)`, 'available >= needed',
    orbitShort > 0 ? `The rocket runs out of delta-v ${km(orbitShort)} before orbital speed. The mission fails during launch.` : 'The stack can reach orbit with the stated losses.',
    orbitShort > 0 ? 'Add propellant to the booster or upper stage, improve Isp, or reduce spacecraft mass.' : null));

  // 3 crew g-load
  const lastBoost = L.stats.stages.reduce((m, s, i) => Math.max(m, s.twrEnd * (A.launcher.stages[i].endThrustFrac ?? 1)), 0);
  checks.push(check('gload', 'Launch acceleration', lastBoost <= 4.5 ? PASS : lastBoost <= 6 ? WARNING : FAIL, `peak ${lastBoost.toFixed(1)} g at stage burnout`, '<= 4.5 g (crew)',
    lastBoost > 6 ? 'The crew would be exposed to more than 6 g for long. Reduce thrust or throttle down.' : lastBoost > 4.5 ? 'High but survivable for trained crew; throttle down late in the burn.' : 'Within crew limits.', lastBoost > 4.5 ? 'Shut down centre engines near burnout.' : null));

  // 4 TLI
  const tliHave = L.afterOrbit.totalDv, tliNeed = L.tli;
  const tliStatus = L.toOrbit.shortfall > 0 ? FAIL : grade(tliHave, tliNeed, 0.02);
  checks.push(check('tli', 'Trans-Lunar Injection', tliStatus, `${km(Math.max(tliHave, 0))} left after orbit / ${km(tliNeed)} needed`, 'left >= needed',
    L.toOrbit.shortfall > 0 ? 'The rocket never reaches orbit, so TLI can not start.' : tliHave < tliNeed ? `After reaching orbit the stack can add only ${km(tliHave)}. It is short by ${km(tliNeed - tliHave)}, so the spacecraft would not reach the Moon's distance.` : 'The translunar stage can push the spacecraft onto a path to the Moon.',
    tliHave < tliNeed ? `Add about ${t(propForDv(A.launcher.stages.at(-1).ispVac, a.masses.spacecraft + A.launcher.stages.at(-1).dry + A.launcher.stages.at(-1).prop, tliNeed - tliHave))} of propellant to the last stage (or cut payload mass).` : null));
  const tliRestart = (A.launcher.stages.at(-1).restarts ?? 0) >= 1;
  checks.push(check('tli-restart', 'Engine restart in orbit', tliRestart ? PASS : FAIL, `${A.launcher.stages.at(-1).restarts ?? 0} restarts available`, '>= 1',
    tliRestart ? 'The last stage can fire again after orbit insertion.' : 'The same engine fires once to reach orbit and again for TLI. Without restart there is no TLI burn.', tliRestart ? null : 'Choose an engine with restart capability for the last stage.'));

  // 5 lunar orbit insertion
  const loiOk = S.propAfterLoi >= 0;
  checks.push(check('loi', 'Lunar Orbit Insertion', !loiOk ? FAIL : PASS, `${km(S.loi + S.mcc)} needed, uses ${t(Math.max(S.loiProp, 0))} of ${t(sm.prop)} propellant`, 'service engine has enough propellant',
    !loiOk ? 'The service module runs dry during the capture burn. The spacecraft would fly past the Moon.' : `The service engine slows the spacecraft by ${km(S.loi)} so the Moon can capture it.`,
    !loiOk ? 'Add service module propellant or reduce the lunar module mass.' : null));

  // 6 trans-Earth injection
  const teiHave = S.smDvAfterLoi, teiStatus = !loiOk ? FAIL : grade(teiHave, S.teiNeed, 0.05);
  checks.push(check('tei', 'Trans-Earth Injection', teiStatus, `${km(Math.max(teiHave, 0))} available / ${km(S.teiNeed)} needed`, 'available >= needed',
    !loiOk ? 'Not enough propellant even to arrive.' : teiHave < S.teiNeed ? `After lunar orbit insertion the service module can add only ${km(teiHave)}. The crew could not leave the Moon.` : 'The service module can fire out of lunar orbit toward Earth after the lunar module is gone.',
    teiHave < S.teiNeed ? 'Add service module propellant. This burn is the one with no backup.' : null));

  // 7 lunar module descent
  const descStatus = grade(LM.lmDescentDv, LM.desc.total * 1.03 + 0, 0.0);
  checks.push(check('descent', 'Lunar descent and landing', LM.lmDescentTwr < 1.2 ? FAIL : descStatus, `${km(LM.lmDescentDv)} available / ${km(LM.desc.total)} needed (includes ${Math.round(LM.desc.gravityLoss)} m/s gravity loss, thrust/weight ${LM.lmDescentTwr.toFixed(2)})`, 'available >= needed',
    LM.lmDescentTwr < 1.2 ? 'The descent engine is too weak to brake the lander in time.' : LM.lmDescentDv < LM.desc.total ? `The lander runs out of propellant ${km(LM.desc.total - LM.lmDescentDv)} short of a landing, so it hits the surface.` : 'The descent stage can brake from orbit and land.',
    LM.lmDescentDv < LM.desc.total ? 'Add descent propellant or thrust.' : null));
  const canHover = LM.hoverThrottleMin <= LM.mAtLanding * getBody('moon').gravity;
  checks.push(check('hover', 'Throttle down to hover', canHover ? PASS : FAIL, `lowest thrust ${(LM.hoverThrottleMin / 1000).toFixed(1)} kN / lander weight ${(LM.mAtLanding * getBody('moon').gravity / 1000).toFixed(1)} kN`, 'lowest thrust <= weight',
    canHover ? 'The engine can throttle low enough to hover and touch down gently.' : 'Even at minimum throttle the engine pushes harder than the lander weighs, so it can not hover and set down softly.', canHover ? null : 'Use an engine with a deeper throttle range.'));

  // 8 landing site
  const slopeOk = LM.site.slopeDeg <= (getBody('moon').hazards?.maxSafeSlopeDeg ?? 12);
  const legTol = lm.landingGear?.maxSlopeDeg ?? 12;
  checks.push(check('site', 'Landing site', LM.site.slopeDeg <= legTol * 0.6 ? PASS : LM.site.slopeDeg <= legTol ? WARNING : FAIL, `${LM.site.name}: slope ${LM.site.slopeDeg}°, roughness ${LM.site.roughness}`, `slope <= ${legTol}°`,
    slopeOk ? 'The landing legs can handle this terrain, but rougher sites need a pilot to steer away from boulders.' : 'The slope is steeper than the lander can safely stand on.', slopeOk ? null : 'Pick a flatter site or fit longer legs.'));

  // 9 surface stay
  const surfHours = M.surfaceDays * 24;
  checks.push(check('surface', 'Surface stay', lm.surfaceHoursCapacity >= surfHours ? PASS : FAIL, `${lm.surfaceHoursCapacity} h of power and air / ${surfHours} h planned`, 'capacity >= plan',
    lm.surfaceHoursCapacity >= surfHours ? 'Batteries and consumables last the planned stay.' : 'The lander runs out of power or air before the planned liftoff.', lm.surfaceHoursCapacity >= surfHours ? null : 'Add batteries and consumables, or shorten the stay.'));

  // 10 ascent
  const ascShort = LM.ascDv < LM.ascBudget.total;
  checks.push(check('ascent', 'Lunar ascent', LM.ascTwr < 1.2 ? FAIL : ascShort ? FAIL : grade(LM.ascDv, LM.ascBudget.total + LM.rendezvousReserve, 0.0), `${km(LM.ascDv)} available / ${km(LM.ascBudget.total)} needed (thrust/weight ${LM.ascTwr.toFixed(2)})`, 'available >= needed',
    LM.ascTwr < 1.2 ? 'The ascent engine can barely lift the ascent stage off the surface.' : ascShort ? `The ascent stage is ${km(LM.ascBudget.total - LM.ascDv)} short of orbital speed and falls back.` : 'The ascent stage can reach lunar orbit.',
    ascShort ? 'Add ascent propellant, or leave samples or cargo behind.' : null));
  const spare = LM.ascDv - LM.ascBudget.total;
  checks.push(check('rendezvous', 'Rendezvous and docking reserve', spare >= 80 ? PASS : spare >= 30 ? WARNING : FAIL, `${Math.round(spare)} m/s left after reaching orbit`, '>= 80 m/s',
    spare >= 80 ? 'Enough propellant to match orbits and dock.' : spare >= 30 ? 'Very tight. A missed approach would leave no second try.' : 'No propellant left to meet the command module.', spare >= 80 ? null : 'Add ascent propellant.'));

  // 11 entry
  const ang = M.entryAngleDeg, c = EN.corridor, fl = EN.flight;
  const inCorr = c.shallow != null && c.steep != null && ang >= c.shallow && ang <= c.steep;
  const edge = inCorr ? Math.min(ang - c.shallow, c.steep - ang) : -1;
  checks.push(check('corridor', 'Earth entry corridor', !inCorr ? FAIL : edge >= 0.5 ? PASS : WARNING, `entry ${ang}° inside corridor ${c.shallow?.toFixed(1)}° to ${c.steep?.toFixed(1)}°`, 'entry angle inside corridor',
    !inCorr ? (ang < (c.shallow ?? 0) ? 'Too shallow: the capsule skips off the atmosphere and is lost back to space.' : 'Too steep: the crew is crushed by deceleration or the heat shield burns through.') : 'The capsule is captured by the atmosphere and survives.', !inCorr ? 'Adjust the trans-Earth burn to change the entry angle.' : null));
  checks.push(check('heatshield', 'Heat shield', fl.heatLoad * 1.3 <= cm.heatShield.areaDensity * cm.heatShield.effectiveHeat && fl.peakHeatFlux <= cm.heatShield.maxHeatFlux ? PASS : fl.heatLoad <= cm.heatShield.areaDensity * cm.heatShield.effectiveHeat ? WARNING : FAIL,
    `heat load ${(fl.heatLoad / 1e6).toFixed(0)} MJ/m² / shield capacity ${(cm.heatShield.areaDensity * cm.heatShield.effectiveHeat / 1e6).toFixed(0)} MJ/m², peak ${(fl.peakHeatFlux / 1e6).toFixed(1)} MW/m²`, 'load x 1.3 <= capacity',
    fl.heatLoad > cm.heatShield.areaDensity * cm.heatShield.effectiveHeat ? 'The ablative layer is used up before the capsule slows down.' : 'The ablative layer survives the entry with margin.', 'Thicken the heat shield or enter at a shallower angle.'));
  checks.push(check('entry-g', 'Entry deceleration', fl.peakG <= cm.maxG * 0.8 ? PASS : fl.peakG <= cm.maxG ? WARNING : FAIL, `peak ${fl.peakG.toFixed(1)} g`, `<= ${cm.maxG} g`, fl.peakG > cm.maxG ? 'The crew experiences more deceleration than they can survive.' : 'Within crew limits.', fl.peakG > cm.maxG ? 'Enter at a shallower angle.' : null));

  // 12 parachutes
  const pc = cm.parachutes;
  const v3 = EN.mainsSplash(pc.mains), v2 = EN.mainsSplash(Math.max(pc.mains - 1, 1));
  checks.push(check('chutes', 'Parachutes', v3 <= 10 && v2 <= 12.5 && pc.mains >= 2 ? PASS : v3 <= 10 ? WARNING : FAIL, `splashdown ${v3.toFixed(1)} m/s (${v2.toFixed(1)} m/s if one main fails)`, '<= 10 m/s, <= 12.5 m/s with one failed',
    v3 > 10 ? 'The parachutes are too small. The capsule hits the water too fast for the crew.' : v2 > 12.5 ? 'It works, but one failed parachute would be dangerous.' : 'The capsule lands softly and survives a single parachute failure.', v3 > 10 ? 'Add or enlarge the main parachutes.' : null));
  const qOk = fl.qEnd <= pc.maxDrogueQ;
  checks.push(check('drogue', 'Parachute deployment pressure', qOk ? PASS : FAIL, `${(fl.qEnd / 1000).toFixed(1)} kPa at ${pc.drogueDeployAlt} m`, `<= ${(pc.maxDrogueQ / 1000).toFixed(0)} kPa`, qOk ? 'The capsule has slowed enough for the drogue chutes to open safely.' : 'The capsule is still too fast. The drogue chutes would tear off.', qOk ? null : 'Deploy lower or use stronger drogues.'));

  // 13 crew and life support
  const needDays = EN.days;
  checks.push(check('seats', 'Crew seats', cm.seats >= A.crew && lm.seats >= lm.crewLanding ? PASS : FAIL, `${cm.seats} seats in the command module, ${lm.seats} in the lander for ${A.crew} crew`, 'enough seats', 'Every crew member needs a seat in the right spacecraft.', null));
  checks.push(check('life', 'Life support', cm.crewDaysSupport >= needDays * A.crew ? PASS : FAIL, `${cm.crewDaysSupport} crew-days / ${(needDays * A.crew).toFixed(0)} needed`, 'capacity >= need', 'Air, water and power for the whole trip.', 'Add consumables.'));

  const worst = checks.reduce((m, x) => Math.max(m, ordinal[x.status]), 0);
  const status = [PASS, WARNING, FAIL][worst];
  const failed = checks.filter((x) => x.status === FAIL);
  const canReachMoon = ['liftoff', 'orbit', 'tli', 'tli-restart', 'loi'].every((id) => checks.find((x) => x.id === id).status !== FAIL);
  const canReturn = canReachMoon && ['descent', 'hover', 'ascent', 'rendezvous', 'tei', 'corridor', 'heatshield', 'entry-g', 'chutes', 'drogue'].every((id) => checks.find((x) => x.id === id).status !== FAIL);
  const summary = canReturn
    ? `This design can complete the mission on paper. ${checks.filter((x) => x.status === WARNING).length} warnings.`
    : canReachMoon ? `The rocket can reach the Moon, but the mission fails later: ${failed.map((f) => f.title).join(', ')}.`
      : `This rocket can not send this spacecraft to the Moon: ${failed.map((f) => f.title).join(', ')}.`;
  return { status, canReachMoon, canReturn, summary, checks, analysis: a };
}
