// Plain-language numbers for students: everything here is computed from a REAL run (telemetry columns + recorded events + result).
// Nothing is invented: if a number is not in the data, the field is null and the screen leaves it out.
import { runMetrics } from './run-analysis.js';
import { orbitWindow } from './orbit-goal.js';

export const SOUND_SPEED = 343;        // m/s at sea level (fixed physical constant, used only for the "times the speed of sound" comparison)
export const ORBIT_SPEED_KMH = 28000;  // about 7.8 km/s: speed needed to circle the Earth low down

const grp = (n) => (Math.round(n) || 0).toLocaleString('en-US'); // `|| 0`: never "-0"
const dec = (n, d = 1) => (Number(n.toFixed(d)) || 0).toLocaleString('en-US', { maximumFractionDigits: d });
const num = (v) => Number.isFinite(v);

/** "2 min 9 s" style time. */
export function plainTime(s) {
  if (!num(s)) return '–';
  const t = Math.max(0, Math.round(s)); const m = Math.floor(t / 60), r = t % 60;
  if (t < 60) return `${t} s`;
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  const hh = Math.floor(m / 60); return `${hh} h ${m % 60} min`;
}

/** speed in m/s -> {value, unit, text} using km/h (or mph) */
export function plainSpeed(ms, imperial = false) {
  const v = imperial ? ms * 2.23694 : ms * 3.6; const unit = imperial ? 'mph' : 'km/h';
  return { value: v, unit, text: `${grp(v)} ${unit}` };
}
/** length in metres -> {value, unit, text}; small values in m / ft, large in km / miles */
export function plainLength(m, imperial = false) {
  if (imperial) { const mi = m / 1609.344; return mi >= 2 ? { value: mi, unit: 'mi', text: `${dec(mi, mi < 20 ? 1 : 0)} mi` } : { value: m * 3.28084, unit: 'ft', text: `${grp(m * 3.28084)} ft` }; }
  return m >= 5000 ? { value: m / 1000, unit: 'km', text: `${dec(m / 1000, m < 20000 ? 1 : 0)} km` } : { value: m, unit: 'm', text: `${grp(m)} m` };
}
export const plainTemp = (k, imperial = false) => { const c = k - 273.15; return imperial ? { value: c * 1.8 + 32, unit: '°F', text: `${grp(c * 1.8 + 32)} °F` } : { value: c, unit: '°C', text: `${grp(c)} °C` }; };

/** Human comparisons: each one only restates the measured number next to something familiar. */
export function compareSpeed(ms) {
  if (!num(ms) || ms < 0.5) return 'Standing still';
  if (ms < 2) return 'A slow walk';
  if (ms < 8) return 'Like a bike';
  if (ms < 40) return 'Like a car on a road';
  if (ms < 120) return 'Like a fast train';
  if (ms < 250) return 'Like a jet airliner';
  const mach = ms / SOUND_SPEED;
  if (mach < 1) return 'Almost the speed of sound';
  const s = `${dec(mach, mach < 10 ? 1 : 0)} times the speed of sound`;
  return ms >= 7800 ? `${s}. Orbit speed!` : s;
}
export function compareHeight(m) {
  if (!num(m) || m < 5) return 'On the ground';
  if (m < 330) return 'Lower than the Eiffel Tower';
  if (m < 8849) return `${dec(m / 330, 0)} times the Eiffel Tower`;
  if (m < 100000) return `${dec(m / 8849, 1)} times Mount Everest`;
  if (m < 380000) return 'In space (above 100 km)';
  return `${dec(m / 408000, 1)} times the space station height`;
}
export function compareG(g) {
  if (!num(g)) return '';
  if (g < 0.1) return 'Weightless. The engine is off';
  if (g < 1.2) return 'About like standing on the ground';
  if (g < 2.5) return `${dec(g, 1)} times your normal weight`;
  if (g < 5) return 'Like a roller coaster';
  return 'More than a roller coaster';
}
export function compareTemp(k) {
  const c = k - 273.15;
  if (!num(c)) return '';
  if (c < 40) return 'Not hot at all';
  if (c < 100) return 'Cooler than boiling water';
  if (c < 250) return 'Hotter than boiling water';
  if (c < 450) return 'Hotter than a kitchen oven';
  if (c < 660) return 'Hotter than a pizza oven';
  return 'Hot enough to melt aluminium';
}
export function compareFuel(frac) {
  if (!num(frac)) return '';
  if (frac > 0.75) return 'Almost a full tank';
  if (frac > 0.4) return 'About half a tank';
  if (frac > 0.1) return 'Running low';
  return 'Almost empty';
}

// ------------------------------------------------------------------------------------------------ key moments
const stageNo = (msg) => /stage\s*(\d+)/i.exec(msg ?? '')?.[1];
/** First time in telemetry that the orbit goal is met (objective type "orbit"), else null. */
export function orbitTime(tel, objective) {
  if (!tel || !tel.count || objective?.type !== 'orbit') return null;
  const w = orbitWindow(objective); // same window as the physics check and the screens
  const t = tel.column('t'), peri = tel.column('peri'), apo = tel.column('apo'), ecc = tel.column('ecc');
  for (let i = 0; i < tel.count; i++) if (peri[i] >= w.minPeri && apo[i] <= w.maxApo && ecc[i] < 1 && ecc[i] > 0) return t[i];
  return null;
}
/** Time of maximum dynamic pressure, but only once it is really behind us (q fell below 90 % of its peak). */
export function maxQTime(tel) {
  if (!tel || tel.count < 3) return null;
  const q = tel.column('q'), t = tel.column('t'); let pk = 0, pi = 0;
  for (let i = 0; i < tel.count; i++) if (q[i] > pk) { pk = q[i]; pi = i; }
  if (pk < 2000 || q[tel.count - 1] > 0.9 * pk) return null;
  return t[pi];
}
/**
 * The big moments of a flight, from REAL events (and from the telemetry for Max-Q and orbit).
 * @returns [{t, label, kind, text}] sorted by time. `kind`: liftoff | maxq | sep | engine | burn | orbit | payload | end | problem
 */
export function keyMoments(events, tel, { objective = null, failures = [], status = null, moments = null } = {}) {
  const out = []; const seen = new Set();
  const add = (t, kind, label, text) => { const k = `${kind}|${label}`; if (seen.has(k)) return; seen.add(k); out.push({ t, kind, label, text }); };
  if (moments) {   // a mission with its own timeline (Apollo): moments are mission events by id, in the order they happened
    for (const e of events ?? []) {
      const m = (e.kind === 'EVENT' || e.kind === 'EVENT_DONE') && moments[e.data?.event];
      if (m) add(e.t, 'burn', m[0], m[1]);
      else if (e.kind === 'LIFTOFF') add(e.t, 'liftoff', e.t > 600 ? 'Lunar liftoff' : 'Liftoff!', e.t > 600 ? moments.liftoff[1] : 'The rocket left the ground.');
      else if (e.kind === 'LANDED') add(e.t, 'burn', 'Touchdown', moments.touchdown?.[1] ?? 'Landed.');
      else if (e.kind === 'MISSION_SUCCESS') add(e.t, 'end', 'Mission done!', 'The goal was reached.');
    }
    const mq = maxQTime(tel); if (mq != null) add(mq, 'maxq', 'Max-Q', 'The air pressed hardest on the rocket here.');
    for (const f of failures ?? []) if (f && num(f.t)) add(f.t, 'problem', `Problem: ${f.title ?? f.code ?? 'failure'}`, f.primaryCause ?? '');
    return out.sort((a, b) => a.t - b.t);
  }
  let lift = null; for (const e of events ?? []) if (e.kind === 'LIFTOFF') lift = e.t;
  for (const e of events ?? []) {
    const a = e.data?.action;
    if (e.kind === 'LIFTOFF') add(e.t, 'liftoff', 'Liftoff!', 'The rocket left the ground.');
    else if (e.kind === 'EVENT' && a === 'SEPARATE') {
      if (/fairing/i.test(e.message)) add(e.t, 'sep', 'Nose cover off', 'The nose cover is not needed in space, so it was dropped.');
      else if (/deploy|payload/i.test(e.message) && !stageNo(e.message)) continue;
      else { const n = stageNo(e.message); add(e.t, 'sep', n ? `Stage ${n} done` : 'Stage done', 'An empty part was dropped to make the rocket lighter.'); }
    } else if (e.kind === 'EVENT' && a === 'IGNITE') { if (e.t > (lift ?? 0.01)) { const n = stageNo(e.message); add(e.t, 'engine', n ? `Stage ${n} burn` : 'Engine on', 'A new engine started.'); } }
    else if (e.kind === 'EVENT' && a === 'SHUTDOWN') add(e.t, 'engine', 'Engine off', 'The engine stopped. The rocket now coasts.');
    else if (e.kind === 'EVENT' && a === 'BURN') add(e.t, 'burn', /circular/i.test(e.message) ? 'Orbit burn' : 'Engine burn', /circular/i.test(e.message) ? 'A short push made the orbit round.' : 'The engine pushed to change speed.');
    else if (e.kind === 'EVENT' && a === 'DEPLOY_PAYLOAD') add(e.t, 'payload', 'Payload out', 'The satellite or probe left the rocket.');
    else if (e.kind === 'MISSION_SUCCESS') add(e.t, 'end', 'Mission done!', 'The goal was reached.');
  }
  const mq = maxQTime(tel); if (mq != null) add(mq, 'maxq', 'Max-Q', 'The air pressed hardest on the rocket here.');
  const ot = orbitTime(tel, objective); if (ot != null) add(ot, 'orbit', 'In orbit!', 'The rocket now circles the planet without falling down.');
  for (const f of failures ?? []) if (f && num(f.t)) add(f.t, 'problem', `Problem: ${f.title ?? f.code ?? 'failure'}`, f.primaryCause ?? '');
  if (status && status !== 'SUCCESS' && !out.some((m) => m.kind === 'end') && events?.length) { const last = events[events.length - 1]; add(last.t, 'end', 'Mission ended', 'The flight stopped before the goal was reached.'); }
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------------------------------------ flight report card
/** Goals that are measured from the run itself. A rating exists only when at least 3 of them can be measured. */
export function measuredGoals(m, res) {
  const goals = [];
  const ok = res.status === 'SUCCESS';
  goals.push({ id: 'goal', label: 'Reached the mission goal', ok, detail: ok ? 'Yes' : (res.reason ?? 'No') });
  if (!ok && res.status === 'ABORTED') goals[0].detail = res.reason ?? 'The flight was stopped before the goal';
  const nf = (res.failures ?? []).length;
  goals.push({ id: 'intact', label: 'Nothing broke', ok: nf === 0, detail: nf === 0 ? 'No problem found' : `${nf} problem${nf > 1 ? 's' : ''} found` });
  if (num(m.maxG)) goals.push({ id: 'gentle', label: 'Pushed under 6 g', ok: m.maxG <= 6, detail: `Strongest push ${dec(m.maxG, 1)} g` });
  if (num(m.maxStructRatio) && m.maxStructRatio > 0) goals.push({ id: 'strong', label: 'Strong enough', ok: m.maxStructRatio < 0.9, detail: `${grp(m.maxStructRatio * 100)}% of the strength limit used` });
  if (num(m.maxThermRatio) && m.maxThermRatio > 0) goals.push({ id: 'cool', label: 'Cool enough', ok: m.maxThermRatio < 0.9, detail: `${grp(m.maxThermRatio * 100)}% of the heat limit used` });
  if (num(m.lastStageReserveFrac)) goals.push({ id: 'fuel', label: 'Fuel to spare', ok: m.lastStageReserveFrac >= 0.03, detail: `${dec(m.lastStageReserveFrac * 100, 1)}% of the last stage fuel left` });
  return goals;
}
/** Letter -> stars. Stars and letter always come from the SAME score, so they can never disagree. */
export const GRADE_TABLE = [{ min: 0.9, letter: 'A', stars: 5 }, { min: 0.75, letter: 'B', stars: 4 }, { min: 0.6, letter: 'C', stars: 3 }, { min: 0.4, letter: 'D', stars: 2 }, { min: -1, letter: 'F', stars: 1 }];
/** Best score a flight can get when its main goal (goals[0]) was missed: a rocket that did not do its job tops out at a D. */
export const FAILED_MAIN_GOAL_CAP = 0.5;
/**
 * One rating from the list of measured goals. Needs at least 3 goals, else null.
 * @returns {{score, stars, letter, passed, total, failed:{id,label,detail}[], capped:boolean, reason:string}}
 */
export function ratingFromGoals(goals) {
  if (!goals || goals.length < 3) return null;
  const passed = goals.filter((g) => g.ok).length, f = passed / goals.length;
  const mainOk = !!goals[0].ok;
  const score = mainOk ? f : Math.min(f, FAILED_MAIN_GOAL_CAP);
  const row = GRADE_TABLE.find((r) => score >= r.min - 1e-9) ?? GRADE_TABLE[GRADE_TABLE.length - 1];
  const failed = goals.filter((g) => !g.ok).map((g) => ({ id: g.id, label: g.label, detail: g.detail }));
  const capped = !mainOk && f > FAILED_MAIN_GOAL_CAP;
  const reason = !failed.length ? 'Every goal was met.'
    : `${passed} of ${goals.length} goals met. Missed: ${failed.map((g) => g.label.toLowerCase()).join('; ')}.${capped ? ' The main goal was missed, so the grade stops at D.' : ''}`;
  return { score, stars: row.stars, letter: row.letter, passed, total: goals.length, failed, capped, reason };
}

/** "What happened" in short sentences. Only facts from the run. */
export function storyOf(record, m, moments) {
  const res = record.result ?? {}, out = [];
  const lift = moments.find((x) => x.kind === 'liftoff');
  if (lift) out.push(`It lifted off after ${dec(lift.t, 1)} seconds.`);
  for (const mm of moments) {
    if (mm.kind === 'maxq') out.push(`Around ${plainTime(mm.t)} the air pressed hardest on the rocket (Max-Q).`);
    else if (mm.kind === 'sep') out.push(`${/nose cover/i.test(mm.label) ? 'The nose cover' : mm.label.replace(' separation', '')} was dropped at ${plainTime(mm.t)}.`);
    else if (mm.kind === 'orbit') out.push(`It reached orbit at ${plainTime(mm.t)}.`);
    else if (mm.kind === 'payload') out.push(`The payload was released at ${plainTime(mm.t)}.`);
  }
  if (num(m.maxAlt) && m.maxAlt > 1000) out.push(`The highest point was ${plainLength(m.maxAlt).text}.`);
  if (res.status === 'SUCCESS') out.push('The mission goal was reached.');
  else { const f = (res.failures ?? []).find((x) => x.rootCause) ?? (res.failures ?? [])[0]; out.push(f ? `It went wrong: ${f.title}.` : `The mission did not succeed.`); }
  return out.slice(0, 7);
}

/**
 * The flight report card of a finished run.
 * @param record the run record (record.result, record.events, record.mission, record.vehicle)
 * @param tel    telemetry with .count and .column(id)
 */
export function reportCard(record, tel, { imperial = false } = {}) {
  const res = record.result ?? {}; const m = runMetrics(record, tel);
  const tiles = [];
  if (tel?.count) {
    if (num(m.maxSpeed)) tiles.push({ id: 'speed', label: 'Top speed', value: plainSpeed(m.maxSpeed, imperial).text, compare: compareSpeed(m.maxSpeed), machTimes: m.maxSpeed / SOUND_SPEED });
    if (num(m.maxAlt)) tiles.push({ id: 'height', label: 'Highest point', value: plainLength(m.maxAlt, imperial).text, compare: compareHeight(m.maxAlt) });
    if (num(m.maxG)) tiles.push({ id: 'g', label: 'Strongest push', value: `${dec(m.maxG, 1)} g`, compare: compareG(m.maxG) });
    if (num(m.initialPropellant) && m.initialPropellant > 0) tiles.push({ id: 'fuel', label: 'Fuel used', value: `${grp(Math.max(0, Math.min(1, m.propellantUsed / m.initialPropellant)) * 100)}%`, compare: `${grp(m.propellantUsed)} of ${grp(m.initialPropellant)} kg` });
    tiles.push({ id: 'time', label: 'Flight time', value: plainTime(m.endTime), compare: '' });
  }
  const moments = keyMoments(record.events, tel, { objective: record.mission?.objective, failures: res.failures, status: res.status });
  const goals = measuredGoals(m, res);
  const rating = tel?.count ? ratingFromGoals(goals) : null;
  const ok = res.status === 'SUCCESS';
  return { ok, status: res.status, headline: ok ? 'Mission success!' : res.status === 'ABORTED' ? 'The mission was stopped.' : 'The mission did not succeed.', tiles, moments, story: storyOf(record, m, moments), goals, rating, metrics: m };
}

// ------------------------------------------------------------------------------------------------ dashboard cards (Flight data screen)
const last = (tel, id) => { const c = tel.column(id); return c[tel.count - 1]; };
const peakOf = (tel, id) => { const c = tel.column(id); let p = -Infinity; for (let i = 0; i < tel.count; i++) if (c[i] > p) p = c[i]; return p; };
const pct = (v) => `${grp(Math.max(0, v) * 100)}%`;

/**
 * Six big cards for the Flight data screen, from a telemetry store.
 * mode 'live': values now. mode 'run': peak or final values of a finished run.
 * Every card: {id, title, icon, big, unit, compare, meaning, sub, status, series:[{id,label,unit,scale?}], note}
 */
export function dashboardCards(tel, { mode = 'run', rover = false, imperial = false } = {}) {
  if (!tel || !tel.count) return [];
  const live = mode === 'live';
  if (rover) return roverCards(tel, { live, imperial });
  // Speed relative to the ground (0 on the pad at T+0). The speed in space (inertial) is shown underneath.
  let hasSurf = true; try { tel.column('surfSpeed'); } catch { hasSurf = false; }
  const speedV = live ? last(tel, hasSurf ? 'surfSpeed' : 'speed') : peakOf(tel, 'speed');
  const inertialV = live ? last(tel, 'speed') : null;
  const altV = live ? last(tel, 'alt') : peakOf(tel, 'alt');
  const gV = live ? last(tel, 'gload') : peakOf(tel, 'gload');
  const p0 = tel.column('propMass')[0], pL = last(tel, 'propMass'); const fuelFrac = p0 > 0 ? pL / p0 : null;
  const temp = live ? last(tel, 'tempLead') : peakOf(tel, 'tempLead');
  const qV = live ? last(tel, 'q') : peakOf(tel, 'q');
  const thermR = live ? last(tel, 'thermRatio') : peakOf(tel, 'thermRatio'), structR = live ? last(tel, 'structRatio') : peakOf(tel, 'structRatio');
  const ecc = last(tel, 'ecc'), peri = last(tel, 'peri'), apo = last(tel, 'apo'), period = last(tel, 'period');
  const inOrbit = num(ecc) && ecc >= 0 && ecc < 1 && peri > 0 && apo > 0;
  const sp = plainSpeed(speedV, imperial), al = plainLength(altV, imperial), tp = plainTemp(temp, imperial);
  const cards = [];
  cards.push({ id: 'speed', title: live ? 'Speed' : 'Top speed', icon: 'gauge', big: grp(sp.value), unit: sp.unit, compare: compareSpeed(speedV), meaning: live ? `Speed over the ground. Orbit needs ${grp(ORBIT_SPEED_KMH)} km/h.` : `Fastest speed. Orbit needs ${grp(ORBIT_SPEED_KMH)} km/h.`, sub: live && num(inertialV) ? `Speed in space (inertial): ${plainSpeed(inertialV, imperial).text}` : null, series: [{ id: live && hasSurf ? 'surfSpeed' : 'speed', label: live ? 'Speed over ground' : 'Speed', unit: sp.unit, scaleBy: imperial ? 2.23694 : 3.6 }], status: '' });
  cards.push({ id: 'height', title: live ? 'Height' : 'Highest point', icon: 'rocket', big: al.unit === 'km' || al.unit === 'mi' ? dec(al.value, al.value < 100 ? 1 : 0) : grp(al.value), unit: al.unit, compare: compareHeight(altV), meaning: 'Distance above the ground. Space starts at 100 km.', series: [{ id: 'alt', label: 'Height' }], status: '' });
  const thrustNow = last(tel, 'thrust'), thr = last(tel, 'throttle');
  cards.push({ id: 'push', title: live ? 'Engine push' : 'Strongest push', icon: 'flame', big: dec(gV, 1), unit: 'g', compare: compareG(gV), meaning: 'How hard you are pressed into your seat. 1 g is normal.', sub: live && num(thrustNow) ? `Engine: ${thrustNow > 0 ? grp(thrustNow / 1000) + ' kN' : 'off'}${num(thr) && thrustNow > 0 ? `, throttle ${pct(thr)}` : ''}` : null, series: [{ id: 'gload', label: 'Push' }], status: gV > 6 ? 'bad' : gV > 4.5 ? 'warn' : '' });
  if (fuelFrac != null) cards.push({ id: 'fuel', title: 'Fuel left', icon: 'fuel', big: grp(Math.max(0, Math.min(1, fuelFrac)) * 100), unit: '%', compare: compareFuel(fuelFrac), meaning: 'No fuel, no push.', sub: `${grp(pL)} kg left of ${grp(p0)} kg`, series: [{ id: 'propMass', label: 'Fuel left', unit: '%', scaleBy: 100 / p0 }], status: fuelFrac < 0.05 ? 'warn' : '' });
  const hot = Math.max(thermR || 0, structR || 0);
  cards.push({ id: 'heat', title: 'Heat', icon: 'sun', big: grp(tp.value), unit: tp.unit, compare: `${live ? 'Nose now. ' : 'Hottest nose. '}${compareTemp(temp)}`, meaning: 'Fast air heats the nose.', sub: `Air pressure ${dec(qV / 1000, 1)} kPa · limits used: heat ${pct(thermR || 0)}, strength ${pct(structR || 0)}`, series: [{ id: 'tempLead', label: 'Nose heat' }, { id: 'q', label: 'Air pressure' }], status: hot >= 1 ? 'bad' : hot >= 0.7 ? 'warn' : 'ok' });
  const lowPt = plainLength(Math.max(0, peri), imperial), hiPt = plainLength(Math.max(0, apo), imperial);
  cards.push(inOrbit
    ? { id: 'orbit', title: 'Orbit', icon: 'earth', big: lowPt.unit === 'm' || lowPt.unit === 'ft' ? grp(lowPt.value) : dec(lowPt.value, 0), unit: lowPt.unit, compare: `Lowest point. One lap: ${plainTime(period)}.`, meaning: 'In orbit it keeps falling around the planet.', sub: `Highest point ${hiPt.text}`, series: [{ id: 'apo', label: 'Highest point', clampMin: 0 }, { id: 'peri', label: 'Lowest point', clampMin: 0 }], status: 'ok' }
    : { id: 'orbit', title: 'Orbit', icon: 'earth', big: 'Not yet', unit: '', compare: apo > 0 ? `It would reach ${hiPt.text}, then fall back.` : 'Not fast sideways yet.', meaning: 'To orbit, go sideways fast, not just up.', sub: null, series: [{ id: 'apo', label: 'Highest point', clampMin: 0 }, { id: 'peri', label: 'Lowest point', clampMin: 0 }], status: '' });
  return cards;
}
function roverCards(tel, { live, imperial }) {
  const g = (id) => (live ? last(tel, id) : peakOf(tel, id));
  const sp = g('groundSpeed'), od = last(tel, 'odometer'), bat = last(tel, 'batteryFrac'), slip = g('slip'), slope = g('terrainSlope'), pw = g('drivePower');
  const spd = plainSpeed(sp, imperial), dist = plainLength(od, imperial);
  return [
    { id: 'rspeed', title: live ? 'Speed' : 'Top speed', icon: 'gauge', big: dec(spd.value, 1), unit: spd.unit, compare: sp * 3.6 < 3 ? 'Slower than walking (5 km/h)' : sp * 3.6 < 6 ? 'About a walking pace (5 km/h)' : sp * 3.6 < 25 ? 'Like a bike' : 'Faster than a bike', meaning: 'How fast it drives.', series: [{ id: 'groundSpeed', label: 'Speed', unit: spd.unit, scaleBy: imperial ? 2.23694 : 3.6 }] },
    { id: 'rdist', title: 'Distance driven', icon: 'flag', big: dec(dist.value, dist.value < 100 ? 1 : 0), unit: dist.unit, compare: od > 0 ? `${grp(od / 100)} football pitches` : 'Not moved yet', meaning: 'How far it has driven.', series: [{ id: 'odometer', label: 'Distance' }] },
    { id: 'rbat', title: 'Battery', icon: 'battery', big: grp((bat || 0) * 100), unit: '%', compare: compareFuel(bat), meaning: 'Energy left to drive.', series: [{ id: 'batteryFrac', label: 'Battery', unit: '%', scaleBy: 100 }], status: bat < 0.15 ? 'warn' : '' },
    { id: 'rslope', title: 'Hill steepness', icon: 'warning', big: dec(slope, 0), unit: '°', compare: slope < 5 ? 'Almost flat' : slope < 15 ? 'A gentle hill' : slope < 25 ? 'A steep hill' : 'Very steep!', meaning: 'Steep ground can tip it.', series: [{ id: 'terrainSlope', label: 'Slope' }], status: slope > 25 ? 'warn' : '' },
    { id: 'rslip', title: 'Wheel slipping', icon: 'info', big: grp((slip || 0) * 100), unit: '%', compare: slip < 0.1 ? 'Wheels grip well' : slip < 0.3 ? 'Some slipping' : 'Lots of slipping', meaning: 'Slipping wastes energy.', series: [{ id: 'slip', label: 'Slip', unit: '%', scaleBy: 100 }], status: slip > 0.3 ? 'warn' : '' },
    { id: 'rpow', title: 'Motor power', icon: 'telemetry', big: grp(pw || 0), unit: 'W', compare: pw < 100 ? 'Less than a bright light bulb' : pw < 1500 ? 'Like a kitchen appliance' : 'Like a powerful kettle or more', meaning: 'Power used to turn the wheels.', series: [{ id: 'drivePower', label: 'Power' }] },
  ];
}

// ------------------------------------------------------------------------------------------------ "What if?" takeaways
/**
 * One short sentence set from the real cases of a sweep.
 * @param cases [{x, y, status}] one per real simulation (y may be null)
 * @param opts {baseX, xText(x) -> "30% more fuel", metricName, fmtY(y), higherIsBetter?, goalWord}
 */
export function whatIfTakeaway(cases, { baseX, xText, metricName, fmtY, goalWord = 'reached the goal', short = false }) {
  const pts = cases.filter((c) => num(c.x) && num(c.y)).sort((a, b) => a.x - b.x);
  const total = cases.length, okN = cases.filter((c) => c.status === 'SUCCESS').length;
  const out = [];
  if (pts.length >= 2) {
    const lo = pts[0], hi = pts[pts.length - 1];
    const base = pts.reduce((b, c) => (Math.abs(c.x - baseX) < Math.abs(b.x - baseX) ? c : b), pts[0]);
    if (Math.abs(hi.y - lo.y) < Math.abs(hi.y) * 0.005 + 1e-9) out.push(short ? `${metricName[0].toUpperCase()}${metricName.slice(1)} stays about ${fmtY(base.y)}.` : `It hardly changes your ${metricName}: about ${fmtY(base.y)} every time.`);
    else {
      const dir = hi.y > lo.y ? 'goes up' : 'goes down';
      if (short) out.push(`${metricName[0].toUpperCase()}${metricName.slice(1)} ${dir}: ${fmtY(lo.y)} to ${fmtY(hi.y)}.`);
      else out.push(`Your ${metricName} ${dir}: ${fmtY(lo.y)} with ${xText(lo.x)}, ${fmtY(hi.y)} with ${xText(hi.x)}.`);
      if (!short && base !== lo && base !== hi) out.push(`Today’s design gives ${fmtY(base.y)}.`);
    }
  } else out.push('Not enough results to say what changes.');
  out.push(total ? `${okN} of ${total} test flights ${goalWord}.` : '');
  return out.filter(Boolean).join(' ');
}
