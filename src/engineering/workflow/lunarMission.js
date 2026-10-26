// End-to-end Apollo-style lunar mission, run phase by phase from the physics:
// launch (time-domain ascent) -> parking orbit -> TLI -> translunar coast -> LOI -> powered descent (time-domain)
// -> surface operations (power/thermal/consumables/comms) -> lunar ascent (time-domain) -> rendezvous and docking
// (time-domain) -> TEI -> transearth coast -> entry and splashdown (time-domain).
// Impulsive burns use the rocket equation on the propellant actually left in each vehicle; transfers use patched
// conics (APPROXIMATION, typically within a few percent of n-body values for Earth-Moon trips).
import { getBody, soiRadius } from '../core/bodies.js';
import { G0 } from '../core/constants.js';
import { visViva, circularSpeed, period } from '../core/orbit.js';
import { makeRng } from '../core/rng.js';
import { MODEL } from '../core/provenance.js';
import { stageIspVac } from '../vehicle/model.js';
import { AscentSim, tuneAscent } from '../flight/ascent.js';
import { DescentSim } from '../flight/descent.js';
import { RendezvousSim } from '../flight/rendezvous.js';
import { EntrySim, ENTRY_VEHICLES } from '../flight/entry.js';
import { FlightRecorder } from '../flight/recorder.js';
import { Timeline } from '../flight/timeline.js';
import { PowerSystem } from '../power/eps.js';
import { defaultSpacecraftNetwork } from '../thermal/thermal.js';
import { linkBudget, dishGainDb } from '../comms/comms.js';
import { DigitalTwin } from '../vehicle/twin.js';
import { loadVehicle } from '../vehicle/library.js';

const kick = new Map(); // cache of pre-flight targeting per launcher configuration

export function defaultLunarArchitecture() {
  return { launcher: loadVehicle('heavy-lunar'), csm: loadVehicle('crew-capsule'), lm: loadVehicle('lunar-lander'), parkingAlt: 185e3, lunarOrbitAlt: 110e3, surfaceHours: 21.6, crew: 3, surfaceCrew: 2, terrain: { type: 'mare', seed: 11 }, sampleMass: 22, seed: 1 };
}

// Patched-conic Earth -> Moon departure and arrival (Hohmann-like free transfer to lunar distance)
export function translunar(parkAlt, lunarOrbitAlt) {
  const E = getBody('earth'), M = getBody('moon');
  const rp = E.radius + parkAlt, ra = M.sma;
  const a = (rp + ra) / 2;
  const vPark = circularSpeed(E.mu, rp), vPeri = visViva(E.mu, rp, a);
  const vApo = visViva(E.mu, ra, a), vMoon = circularSpeed(E.mu, M.sma);
  const vInf = Math.abs(vMoon - vApo);
  const rl = M.radius + lunarOrbitAlt;
  const loi = Math.sqrt(vInf * vInf + 2 * M.mu / rl) - circularSpeed(M.mu, rl);
  return { tli: vPeri - vPark, loi, vInf, transferTime: period(E.mu, a) / 2 * (1 - soiRadius('moon') / M.sma * 0.5), a };
}
export function transearth(lunarOrbitAlt, entryAlt = 121920, vacuumPerigeeAlt = 40e3) {
  const E = getBody('earth'), M = getBody('moon');
  const ra = M.sma, rp = E.radius + vacuumPerigeeAlt, a = (ra + rp) / 2;
  const vApo = visViva(E.mu, ra, a), vMoon = circularSpeed(E.mu, M.sma), vInf = vMoon - vApo;
  const rl = M.radius + lunarOrbitAlt;
  const tei = Math.sqrt(vInf * vInf + 2 * M.mu / rl) - circularSpeed(M.mu, rl);
  const rE = E.radius + entryAlt;
  const vEntry = visViva(E.mu, rE, a);
  const h = Math.sqrt(E.mu * a * (1 - ((ra - rp) / (ra + rp)) ** 2));
  const gamma = -Math.acos(Math.min(1, h / (rE * vEntry))) * 180 / Math.PI;
  return { tei, vInf, entrySpeed: vEntry, entryGammaDeg: gamma, transferTime: period(E.mu, a) / 2 };
}

// Impulsive burn from a vehicle's own tanks. Finite-burn loss factor is an APPROXIMATION.
function burn(name, { mass, prop, isp, dv, lossFrac = 0.01 }) {
  const need = dv * (1 + lossFrac);
  const propNeeded = mass * (1 - Math.exp(-need / (isp * G0)));
  const dvAvailable = isp * G0 * Math.log(mass / (mass - prop));
  const ok = propNeeded <= prop;
  return { name, dvRequired: need, dvAvailable, propNeeded, propRemaining: Math.max(0, prop - propNeeded), massAfter: mass - Math.min(prop, propNeeded), success: ok, dvMargin: dvAvailable - need, model: MODEL.APPROXIMATION };
}

// Coast phase with subsystem models stepping at coarse resolution.
function coastSubsystems({ hours, dt = 120, power, thermal, distanceFn, sunCos = 0.6, eclipseFn = () => false, tx, rxDish = 26, rxTemp = 100, freq = 2.2875e9, rate = 51200, rec, t0, label }) {
  let minSoc = 1, minMargin = Infinity, maxDelay = 0, worstThermal = 'NORMAL';
  const order = ['NORMAL', 'COLD', 'HOT', 'CRITICAL', 'FAILURE'];
  const steps = Math.ceil(hours * 3600 / dt);
  for (let k = 0; k <= steps; k++) {
    const t = k * dt, ecl = eclipseFn(t);
    const p = power.step(dt, { t: t0 + t, sunCos, inEclipse: ecl });
    const th = thermal.step(dt, { inEclipse: ecl, sinkTemp: 3 });
    const d = distanceFn(t);
    const link = linkBudget(tx, { gainDb: dishGainDb(rxDish, freq), systemNoiseTempK: rxTemp }, d, freq, rate);
    minSoc = Math.min(minSoc, p.soc); minMargin = Math.min(minMargin, link.margin); maxDelay = Math.max(maxDelay, link.delay);
    for (const n of th) if (order.indexOf(n.status) > order.indexOf(worstThermal)) worstThermal = n.status;
    if (rec && k % Math.max(1, Math.round(1800 / dt)) === 0) rec.record(t0 + t, { phase: label, batterySoc: p.soc, powerGeneration: p.generation, powerDemand: p.demand, avionicsTemp: thermal.node('avionics').T, linkMargin: link.margin, commDelay: link.delay, distanceFromEarth: d }, true);
  }
  return { minSoc, minLinkMargin: minMargin, maxDelay, worstThermal, thermal: thermal.status(), powerEvents: power.events };
}

export function runLunarMission(arch = defaultLunarArchitecture(), opts = {}) {
  const rng = makeRng(arch.seed ?? 1);
  const failures = opts.failures || {};
  const disp = opts.dispersions || {};
  const tl = new Timeline();
  const rec = new FlightRecorder({ vehicle: 'mission', run: opts.runName || 'lunar-mission', sampleInterval: 0 });
  for (const [k, u] of Object.entries({ altitude: 'm', speed: 'm/s', accelerationG: 'g', propellant: 'kg', batterySoc: '-', powerGeneration: 'W', powerDemand: 'W', avionicsTemp: 'K', linkMargin: 'dB', commDelay: 's', distanceFromEarth: 'm', heatShieldTemp: 'K', phase: '-' })) rec.define(k, u);
  const twins = { launcher: new DigitalTwin(arch.launcher), csm: new DigitalTwin(arch.csm), lm: new DigitalTwin(arch.lm) };
  const phases = [];
  let met = 0, stop = false;
  const phase = (name, data) => { phases.push({ name, met, ...data }); tl.add(met, data.success ? 'phase-complete' : 'phase-failed', `${name}: ${data.text || (data.success ? 'complete' : 'failed')}`, { severity: data.success ? 'info' : 'critical' }); if (!data.success) stop = true; return data; };
  const copyRecorder = (r, offset, label, map = {}) => { for (let i = 0; i < r.t.length; i++) { const f = { phase: label }; for (const [from, to] of Object.entries(map)) if (r.channels.has(from)) f[to] = r.channels.get(from).values[i]; rec.record(offset + r.t[i], f, true); } for (const e of r.events) tl.add(offset + e.t, e.type, `${label}: ${e.text}`, { severity: e.type === 'failure' ? 'critical' : 'info' }); };

  const csmMass = () => arch.csm.stages[0].dryMass + csmProp + arch.csm.payload.mass;
  const lmMass = () => arch.lm.stages.reduce((a, s) => a + s.dryMass + s.propMass, 0);
  let csmProp = arch.csm.stages[0].propMass;
  arch.launcher.payload.mass = csmMass() + lmMass();

  // 1. LAUNCH
  const key = JSON.stringify([arch.launcher.stages, arch.launcher.payload.mass, arch.parkingAlt]);
  if (!kick.has(key)) kick.set(key, tuneAscent(arch.launcher, { targetAlt: arch.parkingAlt }).kickDeg);
  const asc = new AscentSim(arch.launcher, { targetAlt: arch.parkingAlt, kickDeg: kick.get(key), sampleInterval: 2, failures: failures.launch, dispersions: disp.launch, env: disp.launchEnv }).run();
  copyRecorder(asc.recorder, met, 'launch', { altitude: 'altitude', speed: 'speed', accelerationG: 'accelerationG', propellant: 'propellant' });
  phase('Launch', { success: asc.success, text: asc.text, metrics: { maxG: asc.maxG, maxQ: asc.maxQ.q, minStructuralMargin: asc.minStructuralMargin, propellantRemaining: asc.propellantRemaining }, model: asc.model, detail: asc });
  twins.launcher.ingest('ascent-sim', asc.time, { missionPhase: 'parking-orbit', mass: asc.finalMass, propellant: asc.propellantRemaining, structure: { minMargin: asc.minStructuralMargin } });
  met += asc.time;
  if (stop) return finish();

  // 2. PARKING ORBIT + TLI on the third stage
  const tr = translunar(arch.parkingAlt, arch.lunarOrbitAlt);
  const parkTime = 1.5 * period(getBody('earth').mu, getBody('earth').radius + arch.parkingAlt);
  met += parkTime;
  const s3 = arch.launcher.stages[arch.launcher.stages.length - 1];
  const tli = burn('TLI', { mass: s3.dryMass + asc.propellantRemaining + arch.launcher.payload.mass, prop: asc.propellantRemaining * (disp.tliPropScale ?? 1), isp: stageIspVac(s3), dv: tr.tli, lossFrac: 0.012 });
  phase('Trans-lunar injection', { success: tli.success, text: tli.success ? `${tr.tli.toFixed(0)} m/s, ${tli.dvMargin.toFixed(0)} m/s spare in the third stage` : `Third stage short by ${(-tli.dvMargin).toFixed(0)} m/s`, metrics: tli, model: MODEL.APPROXIMATION });
  met += 350;
  if (stop) return finish();

  // 3. TRANSLUNAR COAST (CSM subsystems)
  const csmPower = new PowerSystem({ ...arch.csm.systems.power, initialSoc: 1 });
  if (failures.csmPower) csmPower.inject(failures.csmPower.fault, failures.csmPower);
  const csmThermal = defaultSpacecraftNetwork(arch.csm.systems.thermal);
  const tx = { powerW: arch.csm.systems.comms.txPowerW, gainDb: arch.csm.systems.comms.antennaGainDb, lossesDb: arch.csm.systems.comms.lossesDb };
  const R = getBody('earth').radius, Dm = getBody('moon').sma;
  const tlc = coastSubsystems({ hours: tr.transferTime / 3600, power: csmPower, thermal: csmThermal, tx, distanceFn: (t) => R + arch.parkingAlt + (Dm - R) * Math.min(1, Math.pow(t / tr.transferTime, 0.6)), rec, t0: met, label: 'translunar-coast' });
  const mcc1 = Math.abs(rng.normal(0, 6)) * (disp.navScale ?? 1);
  const mccBurn = burn('MCC', { mass: csmMass() + lmMass(), prop: csmProp, isp: arch.csm.stages[0].engines[0].ispVac, dv: mcc1, lossFrac: 0 });
  csmProp = mccBurn.propRemaining;
  phase('Translunar coast', { success: tlc.minSoc > 0.2 && tlc.worstThermal !== 'FAILURE', text: `${(tr.transferTime / 3600).toFixed(1)} h, mid-course correction ${mcc1.toFixed(1)} m/s, minimum battery ${(tlc.minSoc * 100).toFixed(0)}%, worst thermal ${tlc.worstThermal}`, metrics: { ...tlc, mcc: mcc1 }, model: MODEL.APPROXIMATION });
  twins.csm.ingest('coast-subsystems', met + tr.transferTime, { missionPhase: 'lunar-arrival', battery: { soc: csmPower.soc, capacityWh: csmPower.capacityWh }, power: csmPower.last, temperature: Object.fromEntries(tlc.thermal.map((n) => [n.id, n.T])), communications: { minMarginDb: tlc.minLinkMargin, delayS: tlc.maxDelay } });
  met += tr.transferTime;
  if (stop) return finish();

  // 4. LOI with the service propulsion system pushing CSM + LM
  const loi = burn('LOI', { mass: csmMass() + lmMass(), prop: csmProp, isp: arch.csm.stages[0].engines[0].ispVac * (disp.spsIspScale ?? 1), dv: tr.loi, lossFrac: 0.01 });
  csmProp = loi.propRemaining;
  phase('Lunar orbit insertion', { success: loi.success, text: loi.success ? `${tr.loi.toFixed(0)} m/s, ${loi.propRemaining.toFixed(0)} kg service-module propellant left` : `Service module short by ${(-loi.dvMargin).toFixed(0)} m/s`, metrics: loi, model: MODEL.APPROXIMATION });
  met += 2 * period(getBody('moon').mu, getBody('moon').radius + arch.lunarOrbitAlt);
  if (stop) return finish();

  // 5. POWERED DESCENT (time domain)
  const lm = JSON.parse(JSON.stringify(arch.lm));
  const doi = burn('DOI', { mass: lmMass(), prop: lm.stages[0].propMass, isp: lm.stages[0].engines[0].ispVac, dv: 21.5, lossFrac: 0 });
  lm.stages[0].propMass = doi.propRemaining;
  const des = new DescentSim(lm, { orbitAlt: arch.lunarOrbitAlt, seed: (arch.seed ?? 1) * 31 + 1, terrain: arch.terrain, sampleInterval: 2, failures: failures.descent, dispersions: disp.descent }).run();
  copyRecorder(des.recorder, met, 'powered-descent', { altitude: 'altitude', horizontalSpeed: 'speed', accelerationG: 'accelerationG', propellant: 'propellant' });
  phase('Powered descent and landing', { success: des.success, text: des.text, metrics: { touchdown: des.touchdown, landingError: des.landingError, propellantRemaining: des.propellantRemaining, propellantMarginFrac: des.propellantMarginFrac, maxG: des.maxG }, model: des.model, detail: des });
  twins.lm.ingest('descent-sim', des.time, { missionPhase: des.success ? 'surface' : 'lost', propellant: des.propellantRemaining });
  met += des.time;
  if (stop) return finish();

  // 6. SURFACE OPERATIONS: LM power, thermal, consumables, comms with Earth
  const lmPower = new PowerSystem({ batteryWh: 58000, fuelCellW: 0, loads: [{ id: 'eclss', name: 'Life support', power: 450, priority: 1 }, { id: 'gnc', name: 'Guidance (standby)', power: 250, priority: 1 }, { id: 'comm', name: 'S-band', power: 120, priority: 2 }, { id: 'heat', name: 'Heaters', power: 150, priority: 2 }, { id: 'sci', name: 'Experiments', power: 180, priority: 3 }], ...(failures.lmPower ? {} : {}) });
  if (failures.lmPower) lmPower.inject(failures.lmPower.fault, failures.lmPower);
  const lmThermal = defaultSpacecraftNetwork({ radiatorArea: 3 });
  const surf = coastSubsystems({ hours: arch.surfaceHours, dt: 60, power: lmPower, thermal: lmThermal, sunCos: 0, tx: { powerW: 20, gainDb: 20, lossesDb: 3 }, distanceFn: () => Dm - getBody('moon').radius, rec, t0: met, label: 'surface' });
  const o2Used = 0.84 * arch.surfaceCrew * arch.surfaceHours / 24 * 1.25; // 25% for EVA losses
  const o2Avail = 48;
  phase('Surface operations', { success: surf.minSoc > 0.1 && o2Used < o2Avail && surf.worstThermal !== 'FAILURE', text: `${arch.surfaceHours.toFixed(1)} h, battery minimum ${(surf.minSoc * 100).toFixed(0)}%, oxygen ${o2Used.toFixed(1)} of ${o2Avail} kg, ${arch.sampleMass} kg of samples`, metrics: { ...surf, o2Used, o2Avail }, model: MODEL.APPROXIMATION });
  twins.lm.ingest('surface-subsystems', des.time + arch.surfaceHours * 3600, { missionPhase: 'surface-ascent', battery: { soc: lmPower.soc }, power: lmPower.last, communications: { minMarginDb: surf.minLinkMargin, delayS: surf.maxDelay } });
  met += arch.surfaceHours * 3600;
  if (stop) return finish();

  // 7. LUNAR ASCENT (time domain): ascent stage alone, samples as payload
  const ascVeh = { id: 'lm-ascent', name: 'LM ascent stage', version: lm.version, payload: { mass: arch.sampleMass }, aero: { cd0: 0, diameter: 4.3, length: 3 }, stages: [JSON.parse(JSON.stringify(lm.stages[1]))] };
  const lasc = new AscentSim(ascVeh, { body: 'moon', targetAlt: arch.lunarOrbitAlt * 0.55, kickSpeed: 10, kickDeg: 30, kickDuration: 8, pitchRateLimit: 10 * Math.PI / 180, launchLatDeg: 0.7, sampleInterval: 2, subsystems: false, minPeriapsis: 10000, failures: failures.lunarAscent, dispersions: disp.lunarAscent }).run();
  copyRecorder(lasc.recorder, met, 'lunar-ascent', { altitude: 'altitude', speed: 'speed', accelerationG: 'accelerationG', propellant: 'propellant' });
  phase('Lunar ascent', { success: lasc.success, text: lasc.text, metrics: { orbit: lasc.orbit, propellantRemaining: lasc.propellantRemaining, maxG: lasc.maxG }, model: lasc.model, detail: lasc });
  met += lasc.time;
  if (stop) return finish();

  // 8. RENDEZVOUS AND DOCKING (time domain, relative frame of the CSM)
  const M = getBody('moon'), rT = M.radius + arch.lunarOrbitAlt, rC = M.radius + (lasc.orbit.periapsisAlt + lasc.orbit.apoapsisAlt) / 2;
  const n = Math.sqrt(M.mu / rT ** 3);
  const dx = rC - rT;
  const rdv = new RendezvousSim({ body: 'moon', targetAlt: arch.lunarOrbitAlt, initial: [dx, -40000 + rng.normal(0, 3000), rng.normal(0, 300), 0, -1.5 * n * dx, 0], chaserMass: ascVeh.stages[0].dryMass + lasc.propellantRemaining + arch.sampleMass, rcsProp: 280 + lasc.propellantRemaining * 0.3, seed: (arch.seed ?? 1) * 7, sampleInterval: 10, navSd: 20 * (disp.navScale ?? 1) }).run();
  copyRecorder(rdv.recorder, met, 'rendezvous', {});
  phase('Rendezvous and docking', { success: rdv.success, text: rdv.text, metrics: { dvUsed: rdv.dvUsed, rcsMarginFrac: rdv.rcsMarginFrac, docking: rdv.docking }, model: rdv.model, detail: rdv });
  met += rdv.time + 7200;
  if (stop) return finish();

  // 9. TEI with the CSM alone (LM jettisoned), plus samples
  const te = transearth(arch.lunarOrbitAlt);
  arch.csm.payload.mass += arch.sampleMass;
  const tei = burn('TEI', { mass: csmMass(), prop: csmProp, isp: arch.csm.stages[0].engines[0].ispVac * (disp.spsIspScale ?? 1), dv: te.tei, lossFrac: 0.01 });
  csmProp = tei.propRemaining;
  phase('Trans-Earth injection', { success: tei.success, text: tei.success ? `${te.tei.toFixed(0)} m/s, ${tei.propRemaining.toFixed(0)} kg left (${(tei.propRemaining / arch.csm.stages[0].propMass * 100).toFixed(1)}% reserve)` : `Service module short by ${(-tei.dvMargin).toFixed(0)} m/s: crew cannot return`, metrics: tei, model: MODEL.APPROXIMATION });
  met += 300;
  if (stop) return finish();

  // 10. TRANSEARTH COAST
  const tec = coastSubsystems({ hours: te.transferTime / 3600, power: csmPower, thermal: csmThermal, tx, distanceFn: (t) => Dm - (Dm - R) * Math.pow(t / te.transferTime, 1.6), rec, t0: met, label: 'transearth-coast' });
  const gammaErr = rng.normal(0, 0.15) * (disp.navScale ?? 1) + (disp.entryGammaBias ?? 0);
  phase('Transearth coast', { success: tec.minSoc > 0.2 && tec.worstThermal !== 'FAILURE', text: `${(te.transferTime / 3600).toFixed(1)} h, entry angle error after final correction ${gammaErr.toFixed(2)} deg`, metrics: tec, model: MODEL.APPROXIMATION });
  met += te.transferTime;
  if (stop) return finish();

  // 11. ENTRY AND SPLASHDOWN (time domain)
  const cm = { ...ENTRY_VEHICLES['crew-capsule'], mass: arch.csm.payload.mass };
  const ent = new EntrySim(cm, { entrySpeed: te.entrySpeed, gammaDeg: -6.5 + gammaErr, sampleInterval: 2, dispersions: disp.entry }).run();
  copyRecorder(ent.recorder, met, 'entry', { altitude: 'altitude', speed: 'speed', accelerationG: 'accelerationG', heatShieldTemp: 'heatShieldTemp' });
  phase('Entry and splashdown', { success: ent.success, text: ent.text, metrics: { maxG: ent.maxG, maxHeatFlux: ent.maxHeatFlux, ablatorMarginFrac: ent.ablatorMarginFrac, touchdown: ent.touchdown }, model: ent.model, detail: ent });
  met += ent.time;
  return finish();

  function finish() {
    const ok = !stop;
    tl.add(met, 'end', ok ? 'Mission complete: crew recovered' : `Mission ended: ${phases[phases.length - 1].name} failed`, { severity: ok ? 'info' : 'critical' });
    const get = (n) => phases.find((p) => p.name === n);
    const metrics = {
      'mission.success': ok ? 1 : 0,
      'mission.duration': met,
      'launch.maxG': get('Launch')?.metrics.maxG, 'launch.minStructuralMargin': get('Launch')?.metrics.minStructuralMargin,
      'tli.dvMargin': get('Trans-lunar injection')?.metrics.dvMargin,
      'loi.dvMargin': get('Lunar orbit insertion')?.metrics.dvMargin,
      'landing.touchdownVz': get('Powered descent and landing')?.metrics.touchdown?.vz, 'landing.touchdownVh': get('Powered descent and landing')?.metrics.touchdown?.vh,
      'landing.error': get('Powered descent and landing')?.metrics.landingError, 'landing.propellantMarginFrac': get('Powered descent and landing')?.metrics.propellantMarginFrac,
      'surface.minBatterySoc': get('Surface operations')?.metrics.minSoc, 'surface.o2Margin': get('Surface operations') ? 1 - get('Surface operations').metrics.o2Used / get('Surface operations').metrics.o2Avail : undefined,
      'rendezvous.rcsMarginFrac': get('Rendezvous and docking')?.metrics.rcsMarginFrac,
      'tei.propReserveFrac': get('Trans-Earth injection') ? get('Trans-Earth injection').metrics.propRemaining / arch.csm.stages[0].propMass : undefined,
      'entry.maxG': get('Entry and splashdown')?.metrics.maxG, 'entry.ablatorMarginFrac': get('Entry and splashdown')?.metrics.ablatorMarginFrac,
      'comms.minLinkMarginDb': Math.min(...[get('Translunar coast'), get('Surface operations'), get('Transearth coast')].filter(Boolean).map((p) => p.metrics.minLinkMargin)),
      'crew.maxG': Math.max(...[get('Launch'), get('Powered descent and landing'), get('Lunar ascent'), get('Entry and splashdown')].filter(Boolean).map((p) => p.metrics.maxG || 0)),
    };
    for (const k of Object.keys(metrics)) if (metrics[k] === undefined || !Number.isFinite(metrics[k])) delete metrics[k];
    return { success: ok, phases, metrics, timeline: tl, recorder: rec, twins, met, failedPhase: ok ? null : phases[phases.length - 1].name };
  }
}
