// Request understanding for "build" requests: WHAT is wanted (payload type and mass, destination, orbit, stages, reusable, budget, date)
// and what ASTRA LAB can honestly do about it. Two steps, both pure functions (no project, no simulation):
//   extractRequest(text)   -> the facts the user stated, nothing else (null = not stated)
//   interpretRequest(req)  -> either ONE clarifying question (with answer chips) or a build specification, the rows of the
//                             "I understood" card (each row says whether the user stated it or it is an assumption) and the list of
//                             things that are not supported. It never silently changes the mission: every substitution is shown.
import { norm, quantities, stageCount } from './nlu.js';

// ---------------------------------------------------------------------------------------------------------------
// limits of the automatic designers (they must match ai/design.js and src/vehicles/builders.js)
// ---------------------------------------------------------------------------------------------------------------
export const LIMITS = { launcherMaxPayload: 1500, launcherMinPayload: 5, minOrbit: 100000, maxOrbit: 1000000, defaultOrbit: 200000, issOrbit: 420000 };
export const DEFAULTS = { probe: 100, satellite: 250, rover: 150, landerPayload: 150, landerRover: 120, landerRoverPayload: 100, spacecraft: 400, cubesat: 5, roverDistance: 200 };

const PAYLOAD_RX = [
  ['rover', /\b(rovers?|buggy|crawler)\b/],
  ['lander', /\b(landers?|landing craft)\b/],
  ['capsule', /\b(capsules?|crew(ed)?|astronauts?|manned|humans?|people|passengers?|dragon)\b/],
  ['satellite', /\b(satellites?|cubesats?|smallsats?|sats?|comsat)\b/],
  ['probe', /\b(probes?|sondas?|sondes?|explorer|space probe)\b/],
  ['spacecraft', /\b(spacecraft|space craft|spaceship|space ship|orbiter)\b/],
];
const ROCKET_RX = /\b(rockets?|launchers?|launch vehicles?|boosters?|carrier)\b/;
const NO_ROCKET_RX = /\b(no|without|not a|skip the|forget the|instead of)\s+(a |an |the )?(rocket|launcher|launch vehicle|booster)\b/;
const ALONE_RX = /\b(only|just|alone|by itself|on its own|standalone)\b/;
const LAUNCH_VERB_RX = /\b(put(ting)?\b.{0,40}\b(in|into|to|on)\b.{0,20}\b(orbit|space|leo|geo|iss|station)|launch(es|ed|ing)?|send(ing)?|put(ting)? (it |them )?(in|into|on)|place|deliver(ing)?|lift(ing)?|carry(ing)? (it )?to|fly(ing)? (it )?to)\b/;

const DEST_RX = [
  ['iss', /\b(iss|international space station|space station)\b/],
  ['geo', /\b(geo|geostationary|geosynchronous|geo[- ]?transfer|gto)\b/],
  ['moon', /\b(moon|lunar|luna|the moon)\b/],
  ['mars', /\b(mars|martian|red planet)\b/],
  ['leo', /\b(leo|low earth orbit|low orbit|low-earth orbit)\b/],
  ['orbit', /\b(sun[- ]?synchronous|sso|polar orbit|polar)\b/],
  ['other', /\b(venus|mercury|jupiter|saturn|uranus|neptune|pluto|europa|titan|ceres|asteroids?|comet|deep space|interplanetary|the sun|solar system|another planet)\b/],
  ['orbit', /\b(orbit|orbital|into space|to space)\b/],
];
const OTHER_NAME = /\b(venus|mercury|jupiter|saturn|uranus|neptune|pluto|europa|titan|ceres|asteroids?|comet|deep space|interplanetary|the sun|solar system|another planet)\b/;

const MILES = 1609.344;
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1, single: 1, double: 2, twin: 2, triple: 3 };

const prep = (text) => norm(text).replace(/,(\d{3})/g, '$1');

/** Everything the user said about masses: [{kg, raw, bound}] where `bound` is the thing the mass belongs to ('rover', 'launcher', ...) or null. */
function massMentions(s) {
  const out = [];
  const types = 'rovers?|landers?|probes?|sondas?|sondes?|satellites?|cubesats?|capsules?|spacecraft|payload|cargo|rockets?|launchers?|launch vehicles?|boosters?|vehicle|craft';
  const canon = (w) => (/^rover/.test(w) ? 'rover' : /^lander/.test(w) ? 'lander' : /^(probe|sonda|sonde)/.test(w) ? 'probe' : /^(satellite|cubesat)/.test(w) ? 'satellite' : /^capsule/.test(w) ? 'capsule' : /^(rocket|launch|booster)/.test(w) ? 'launcher' : /^(payload|cargo)/.test(w) ? 'payload' : /^(spacecraft|vehicle|craft)/.test(w) ? 'spacecraft' : null);
  for (const q of quantities(s)) {
    if (!['kg', 't', 'lb'].includes(q.unit) && !(q.unit === 'g' && (/gram/.test(q.raw) || q.value >= 50))) continue;
    const after = s.slice(q.index + q.raw.length);
    const before = s.slice(0, q.index);
    let bound = null;
    const a = new RegExp(`^\\s*(?:[a-z-]+\\s+){0,2}?(${types})\\b`).exec(after);
    if (a) bound = canon(a[1]);
    else {
      const b = new RegExp(`(${types})\\s+(?:of|weighing|weighs|massing|with a mass of|at|is|=|:)\\s*(?:about |around |roughly |approximately )?$`).exec(before);
      if (b) bound = canon(b[1]);
    }
    // "carrying 2 tonnes" / "payload 2 t" without a type word belongs to the payload
    out.push({ kg: q.si, raw: q.raw, bound });
  }
  return out;
}

/** Target orbit altitude in metres if the user gave a number; null otherwise. */
function altitudeOf(s) {
  const re = /(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|miles?|mi)\b/g; let m;
  const cands = [];
  while ((m = re.exec(s))) cands.push({ m: Number(m[1]) * (/^(mi)/.test(m[2]) ? MILES : 1000), idx: m.index, len: m[0].length });
  for (const c of cands) {
    const win = s.slice(Math.max(0, c.idx - 28), c.idx + c.len + 28);
    const toKm = c.m >= 80000 && /\b(to|at|into|reach(ing)?|up to)\s*$/.test(s.slice(Math.max(0, c.idx - 10), c.idx));
    if ((toKm || /\b(orbit|orbital|altitude|apogee|apoapsis|circular|high|up to|height|leo|reach)\b/.test(win)) && !/\b(drive|drives|driving|travel|travels|traverse|roam|distance|range|cover|covers)\b/.test(s.slice(Math.max(0, c.idx - 22), c.idx))) return c.m;
  }
  const mm = /(\d{5,7})\s*m\b/.exec(s); if (mm && Number(mm[1]) >= 80000 && /orbit|altitude|apogee/.test(s)) return Number(mm[1]);
  return null;
}

function distanceOf(s) {
  const m = /\b(drive|drives|driving|travel|travels|traverse|traverses|roam|roams|explore|explores|cover|covers|go|goes|distance of|range of)\s+(?:up to |about |around |at least |over )?(\d+(?:\.\d+)?)\s*(m|km|meters?|metres?|kilometers?|kilometres?)\b/.exec(s);
  if (!m) return null;
  return Number(m[2]) * (/^km|kilo/.test(m[3]) ? 1000 : 1);
}

/** The facts stated in a request. Pure function; every field is null when the user did not say it. */
export function extractRequest(text) {
  const s = prep(text);
  const req = { payloadType: null, alsoRover: false, mass: null, roverMass: null, launcherMass: null, massRaw: null, launcher: null, launcherImplied: false, destination: null, around: false, farName: null, altitude: null, altitudeWord: null, stages: null, reusable: null, cheap: null, budget: null, year: null, distance: null, dv: null, suborbital: false, margin: 0, goal: null };

  // payload types in the order they are mentioned; "rocket" words are not payloads
  const hits = PAYLOAD_RX.map(([k, rx]) => { const m = rx.exec(s); return m ? { k, i: m.index } : null; }).filter(Boolean).sort((a, b) => a.i - b.i);
  const kinds = hits.map((h) => h.k);
  if (kinds.includes('lander') && kinds.includes('rover')) { req.payloadType = 'lander'; req.alsoRover = true; }
  else if (kinds.length) {
    // a spacecraft/orbiter word next to a more specific word is just a description ("a probe spacecraft")
    const specific = kinds.filter((k) => k !== 'spacecraft');
    const distinct = [...new Set(specific.length ? specific : kinds)];
    req.payloadType = distinct[0];
    if (distinct.length > 1) req.ambiguousPayload = distinct;
  }

  // launcher: asked for explicitly, or implied by "launch" / "send ... to"
  if (NO_ROCKET_RX.test(s)) req.launcher = false;
  else if (ROCKET_RX.test(s)) req.launcher = true;
  else if (ALONE_RX.test(s) && req.payloadType) req.launcher = false;
  else if (LAUNCH_VERB_RX.test(s) && req.payloadType) { req.launcher = true; req.launcherImplied = true; }

  // destination
  for (const [k, rx] of DEST_RX) {
    if (rx.test(s)) { req.destination = k; break; }
  }
  if (req.destination === 'other') req.farName = (OTHER_NAME.exec(s) ?? [])[1] ?? 'deep space';
  if (/\b(orbit(ing)?|orbiter|flyby|fly by|around)\b.{0,12}\b(the )?(moon|mars|lunar|martian)\b|\b(lunar|martian|moon|mars)[- ]orbit\b/.test(s)) req.around = true;

  // numbers
  const ms = massMentions(s);
  const launcherM = ms.find((x) => x.bound === 'launcher');
  if (launcherM) req.launcherMass = launcherM.kg;
  const rest = ms.filter((x) => x.bound !== 'launcher');
  if (req.alsoRover) {
    const r = rest.find((x) => x.bound === 'rover'); if (r) { req.roverMass = r.kg; req.massRaw = r.raw; }
    const l = rest.find((x) => x.bound !== 'rover'); if (l) req.mass = l.kg;
  } else if (rest.length) {
    const own = rest.find((x) => x.bound === req.payloadType) ?? rest.find((x) => x.bound === 'payload') ?? rest.find((x) => x.bound == null) ?? rest[0];
    req.mass = own.kg; req.massRaw = own.raw;
  }
  req.altitude = altitudeOf(s);
  if (req.altitude != null) req.altitudeWord = 'stated';
  if (req.altitude == null && req.destination === 'leo') { req.altitude = null; }
  req.distance = distanceOf(s);
  const dv = /(\d+(?:\.\d+)?)\s*(m\/s|km\/s)/.exec(s); if (dv) req.dv = Number(dv[1]) * (dv[2] === 'km/s' ? 1000 : 1);

  const st = stageCount(s);
  if (st != null) req.stages = st;
  else if (/\b(sst0|ssto|single[- ]stage)\b/.test(s)) req.stages = 1;
  else if (/\b(multi[- ]?stage|multiple stages)\b/.test(s)) req.stages = null;
  if (/\b(suborbital|sub-orbital|sounding rocket)\b/.test(s)) req.suborbital = true;

  if (/\b(reusabl\w*|re-usabl\w*|reuse|re-use|land(s|ing)? (back|itself|on (a|the) (barge|pad|drone ship))|recover(able|y)?( of)? (the )?(booster|first stage|rocket)|vertical landing booster)\b/.test(s)) req.reusable = true;
  if (/\b(cheap|cheaper|cheapest|low[- ]cost|inexpensive|affordable|economical|budget|on a budget|minimal cost|lowest cost)\b/.test(s)) req.cheap = true;
  const money = /(?:[$€£]\s*(\d[\d.]*)\s*(million|billion|thousand|bn|k|m|b)?|(\d[\d.]*)\s*(million|billion|thousand|bn|k|m)?\s*(?:dollars|usd|euros?|eur|pounds sterling|gbp))/.exec(s);
  if (money) { const n = Number(money[1] ?? money[3]); const u = money[2] ?? money[4] ?? ''; req.budget = { amount: n * (/^(k|thousand)$/.test(u) ? 1e3 : /^(m|million)$/.test(u) ? 1e6 : /^(b|bn|billion)$/.test(u) ? 1e9 : 1), text: money[0].trim() }; }
  const NOT_UNIT = '(?!\\s*(?:kg|kgs|km|m|t|tonnes?|tons?|lbs?|pounds?|s|seconds?|m\\/s|kilo\\w*|metres?|meters?|n|kn|g))';
  const yr = new RegExp(`\\b(?:by|in|before|until|during|around|launch(?:ing)? in)\\s+(?:the year |year )?(19[5-9]\\d|20\\d\\d|21\\d\\d)\\b${NOT_UNIT}`).exec(s) ?? new RegExp(`\\b(20[2-9]\\d)\\b${NOT_UNIT}`).exec(s);
  if (yr) req.year = Number(yr[1]);

  if (/\b(more|extra|bigger|large|generous|safe|safety) (delta-?v |dv )?margin|more margin\b/.test(s)) req.margin = 1;
  if (/\b(less|smaller|thin|minimal) margin\b/.test(s)) req.margin = -1;
  return req;
}

/** Is there anything in the extraction (used to decide whether a short reply answers the last question)? */
export function hasContent(req) {
  return !!(req.payloadType || req.mass != null || req.roverMass != null || req.destination || req.altitude != null || req.stages != null || req.launcher != null || req.reusable || req.cheap || req.margin || req.distance != null || req.budget || req.year);
}

/** Merge a newer extraction on top of an older request (answers and edits override what was there before). */
export function mergeRequest(base = {}, patch = {}) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'margin') { out.margin = (base.margin ?? 0) + (v ?? 0); continue; }
    if (k === 'launcher') { if (v !== null) out.launcher = v; continue; }
    if (v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) continue;
    if (k === 'alsoRover' || k === 'launcherImplied' || k === 'suborbital') { out[k] = v; continue; }
    out[k] = v;
  }
  if (patch.payloadType && !patch.ambiguousPayload) delete out.ambiguousPayload;
  if (patch.payloadType && patch.payloadType !== 'lander' && !patch.alsoRover) out.alsoRover = patch.alsoRover ?? false;
  // the launcher was chosen explicitly: it is no longer just implied
  if (patch.launcher != null) out.launcherImplied = !!patch.launcherImplied;
  // the user moved to a place we can reach: remember the original wish so the card can say what was left out
  const FAR = ['moon', 'mars', 'geo', 'other'];
  if (patch.destination && base.destination && FAR.includes(base.destination) && !FAR.includes(patch.destination) && base.launcher !== false) out.goal = base.destination === 'other' ? (base.farName ?? 'deep space') : base.destination;
  if (patch.destination && FAR.includes(patch.destination)) out.goal = null;
  if (patch.altitude != null && patch.destination == null && ['moon', 'mars', 'geo', 'other'].includes(base.destination) && base.launcher !== false) { out.destination = 'leo'; out.goal = base.destination === 'other' ? (base.farName ?? 'deep space') : base.destination; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// interpretation
// ---------------------------------------------------------------------------------------------------------------
const NAMES = { rover: 'rover', lander: 'lander', probe: 'space probe', satellite: 'satellite', capsule: 'crew capsule', spacecraft: 'spacecraft' };
const BODY = { moon: 'the Moon', mars: 'Mars', geo: 'geostationary orbit', other: 'deep space', leo: 'low Earth orbit', iss: 'the space station', orbit: 'Earth orbit' };
const kg = (x) => `${Math.round(x * 10) / 10 === Math.round(x) ? Math.round(x) : Math.round(x * 10) / 10} kg`;
const km = (m) => `${Math.round(m / 100) / 10} km`.replace(/\.0 km$/, ' km');
const farLabel = (req) => (req.destination === 'other' ? req.farName ?? 'deep space' : BODY[req.destination]);

const ask = (id, question, context, chips) => ({ ask: { id, question, context, chips } });

/**
 * Decide what to do with a request.
 * Returns {ask:{id, question, context[], chips[]}} or {build:{kind, spec}, rows[], limits[], goal, title} or {none:true} when nothing buildable was asked.
 * rows: [{label, value, note, tag:'you'|'assumed'|'auto', edit}] ('auto' = my design choice, not a guess about your wish) shown on the "I understood" card.
 */
export function interpretRequest(req) {
  const rows = []; const limits = [];
  const row = (label, value, tag, edit = null, note = null) => rows.push({ label, value, tag, edit, note });
  const T = (given, shown) => (given ? 'you' : 'assumed');
  const dest = req.destination;
  const far = ['moon', 'mars', 'geo', 'other'].includes(dest);
  const launcher = req.launcher === true;

  if (!req.payloadType && req.launcher == null) return { none: true };
  if (req.ambiguousPayload?.length > 1) {
    const names = req.ambiguousPayload.map((k) => NAMES[k]);
    return ask('which-payload', 'Which one is the payload?', [`You named ${names.join(' and ')}.`, 'I build one thing at a time.'], names.map((n) => `A ${n}`));
  }

  // ---- time / money / reuse: never modelled, always said out loud
  const common = () => {
    if (req.reusable) limits.push('Reusable rockets are not simulated. The rocket will be single-use.');
    if (req.cheap || req.budget) limits.push(`${req.budget ? `Budget ${req.budget.text}: ` : 'Cheap: '}I cannot design to a price. The cost shown is only illustrative.`);
    if (req.year) limits.push(`Date ${req.year}: launch dates and planet windows are not modelled.`);
    if (req.around) limits.push('Orbiting the Moon or Mars is not simulated. Only Earth orbit is.');
    if (req.suborbital) limits.push('Sub-orbital flights are not a mission type. The lowest orbit I fly is 100 km.');
  };

  // =============================================================== ROCKET + PAYLOAD
  if (launcher) {
    if (!req.payloadType) {
      const mk = (w) => `A ${w}`;
      return ask('payload', 'What should the rocket carry?', ['I can launch a probe, satellite or rover into Earth orbit.', ...(req.mass != null ? [`I will use your ${kg(req.mass)}.`] : [])], [mk('space probe'), mk('satellite'), mk('rover')]);
    }
    const pt = req.payloadType;
    if (pt === 'lander') return ask('lander-launch', 'A lander on a rocket is not supported yet. What now?', ['I can build the lander alone, or a rocket with a probe, satellite or rover.'], [`Just a ${dest === 'mars' ? 'Mars' : 'Moon'} lander`, 'A rocket with a rover', 'A rocket with a space probe']);
    if (far) {
      const where = farLabel(req);
      const chips = ['Launch it to LEO (200 km)'];
      const ctx = [`I can fly to Earth orbit, up to ${km(LIMITS.maxOrbit)}. That is a real simulation.`, `The trip to ${where} is not simulated${dest === 'mars' ? ' (no Mars landing either)' : ''}.`];
      if (dest === 'geo') chips.push('Launch it to 1000 km orbit');
      if (['moon', 'mars'].includes(dest) && pt === 'rover') { chips.push(`Just a ${dest === 'moon' ? 'Moon' : 'Mars'} rover`); chips.push(dest === 'mars' ? 'A Moon rover only' : 'A Mars rover only'); }
      else if (['moon', 'mars'].includes(dest) && ['probe', 'satellite', 'spacecraft'].includes(pt)) chips.push(`Just the ${NAMES[pt]}`);
      chips.push('Cancel');
      return ask('far-destination', `${where.replace(/^./, (c) => c.toUpperCase())} is out of reach for my rocket. Which part should I build?`, ctx, chips);
    }
    if (pt === 'capsule' && (req.mass == null || req.mass > LIMITS.launcherMaxPayload)) {
      return ask('capsule', 'Crew capsules are not supported. Use a stand-in?', ['Crew and life support are not modelled.', `My launcher carries up to ${LIMITS.launcherMaxPayload} kg.`], ['A 1000 kg capsule stand-in', 'A 100 kg space probe', 'Cancel']);
    }
    if (req.mass != null && req.mass > LIMITS.launcherMaxPayload) {
      return ask('too-heavy', `${kg(req.mass)} is more than my launcher designer can size. Which mass?`, [`The limit is ${LIMITS.launcherMaxPayload} kg.`], [`Use ${LIMITS.launcherMaxPayload} kg`, 'Use 500 kg', 'Use 100 kg']);
    }
    // ---- everything needed is known or can be assumed and flagged
    const payloadKind = pt === 'spacecraft' ? 'probe' : pt;
    let mass = req.mass; const massGiven = mass != null;
    if (!massGiven) mass = pt === 'rover' ? DEFAULTS.rover : DEFAULTS.probe;
    if (mass < LIMITS.launcherMinPayload) { limits.push(`${kg(mass)} is below my minimum. I used ${LIMITS.launcherMinPayload} kg.`); mass = LIMITS.launcherMinPayload; }
    let altitude = req.altitude; let altGiven = altitude != null;
    if (dest === 'iss' && !altGiven) { altitude = LIMITS.issOrbit; limits.push('Space station: I fly to about 420 km. No rendezvous, no docking, no 51.6 degree tilt.'); }
    if (altitude == null) altitude = LIMITS.defaultOrbit;
    if (altitude < LIMITS.minOrbit) { limits.push(`${km(altitude)} is too low for an orbit. I used ${km(LIMITS.minOrbit)}.`); altitude = LIMITS.minOrbit; altGiven = false; }
    if (altitude > LIMITS.maxOrbit) { limits.push(`${km(altitude)} is above my limit. I used ${km(LIMITS.maxOrbit)}.`); altitude = LIMITS.maxOrbit; }
    common();
    if (req.stages === 1) limits.push('One stage cannot reach orbit with these engines. I build two stages.');
    if (req.stages >= 3) limits.push('I size two stages automatically. A third can be added by hand.');
    if (req.launcherMass != null) limits.push(`The rocket's own mass (${kg(req.launcherMass)}) cannot be set. I size it from the payload.`);
    if (pt === 'capsule') limits.push('Crew and life support are not modelled. This is a mass-only stand-in.');
    if (pt === 'spacecraft') limits.push('A generic spacecraft is built as a probe-type payload.');
    if (req.goal) limits.push(`${req.goal === 'mars' ? 'Mars' : req.goal === 'moon' ? 'The Moon' : req.goal === 'geo' ? 'Geostationary orbit' : 'Deep space'}: only the Earth-orbit part is built and flown. The rest is not simulated.`);
    row('Payload', massGiven ? `${NAMES[pt]}, ${kg(mass)}` : NAMES[pt], 'you', 'Make the payload 200 kg', massGiven ? null : `mass assumed ${kg(mass)}`);
    if (!massGiven) rows[rows.length - 1].tag = 'assumed';
    const goalName = req.goal ? (req.goal === 'mars' ? 'Mars' : req.goal === 'moon' ? 'the Moon' : req.goal === 'geo' ? 'geostationary orbit' : 'deep space') : null;
    row('Destination', `Earth orbit, ${km(altitude)}`, altGiven ? 'you' : 'assumed', 'Orbit at 400 km', goalName ? `you wanted ${goalName}: not simulated` : (dest === 'iss' ? 'about the space station height' : altGiven ? null : 'orbit height assumed'));
    row('Rocket', '2 stages', req.stages === 2 ? 'you' : 'auto', null, req.launcherImplied && req.stages !== 2 ? 'rocket added because you said launch' : req.stages === 2 ? null : 'sized by me from the payload');
    const spec = { payloadMass: mass, payloadKind, altitude, stages: 2 };
    const m = req.margin ?? 0;
    if (m) { spec.dvMargin = Math.max(1.0, Math.round((1.05 + 0.05 * m) * 1000) / 1000); row('Safety margin', `${Math.round((spec.dvMargin - 1) * 100)}%`, 'you', null); }
    return { build: { kind: 'rocket', spec }, rows, limits, goal: req.goal, payloadMassAssumed: !massGiven };
  }

  // =============================================================== SINGLE VEHICLES (no rocket)
  const pt = req.payloadType;
  if (!pt) return { none: true };
  common();
  if (pt === 'rover') {
    if (!['moon', 'mars'].includes(dest)) return ask('body', 'Which world should the rover drive on?', ['The Moon is fully supported.', 'Mars has its own gravity and terrain.'], ['The Moon', 'Mars']);
    const given = req.mass != null; const mass = given ? req.mass : DEFAULTS.rover;
    const distGiven = req.distance != null; const distance = Math.min(Math.max(req.distance ?? DEFAULTS.roverDistance, 20), 20000);
    row('Vehicle', 'Rover, no rocket', 'you', null);
    row('Destination', dest === 'mars' ? 'Mars surface' : 'Moon surface', 'you', 'Make it a Moon rover');
    row('Mass', kg(mass), given ? 'you' : 'assumed', 'Make the rover 200 kg');
    row('Drive', `${Math.round(distance)} m`, distGiven ? 'you' : 'assumed', 'Drive 500 m');
    limits.push('The rover starts on the ground. The trip there is not simulated.');
    return { build: { kind: 'rover', spec: { mass, body: dest, distance } }, rows, limits };
  }
  if (pt === 'lander') {
    if (!['moon', 'mars'].includes(dest)) return ask('body', 'Which world should it land on?', ['The Moon: powered landing is fully simulated.', 'Mars: no atmosphere entry or parachutes.'], ['The Moon', 'Mars']);
    const withRover = !!req.alsoRover;
    const roverMass = withRover ? (req.roverMass ?? DEFAULTS.landerRover) : null;
    const payload = withRover ? DEFAULTS.landerRoverPayload : (req.mass ?? DEFAULTS.landerPayload);
    row('Vehicle', `${dest === 'mars' ? 'Mars' : 'Moon'} lander${withRover ? ' + rover' : ''}`, 'you', null);
    if (withRover) { row('Rover mass', kg(roverMass), req.roverMass != null ? 'you' : 'assumed', 'Make the rover 150 kg'); row('Lander cargo bay', kg(payload), 'assumed', null); }
    else row('Cargo', kg(payload), req.mass != null ? 'you' : 'assumed', 'Make the payload 200 kg');
    if (dest === 'mars') limits.push('Mars landing is not fully supported: no atmosphere entry or parachutes are simulated. The powered descent can be built and analysed.');
    limits.push('The lander starts in orbit. The trip there is not simulated.');
    return { build: { kind: 'lander', spec: { payloadMass: payload, body: dest, withRoverMass: roverMass } }, rows, limits };
  }
  if (pt === 'probe') {
    const given = req.mass != null; const mass = given ? req.mass : DEFAULTS.probe;
    row('Vehicle', 'Space probe, no rocket', 'you', null);
    row('Mass', kg(mass), given ? 'you' : 'assumed', 'Make the payload 200 kg');
    if (['moon', 'mars', 'other'].includes(dest)) limits.push(`The trip to ${farLabel(req)} is not simulated. The probe is tested in Earth orbit (power, heat, radio).`);
    return { build: { kind: 'probe', spec: { mass, destination: dest === 'moon' ? 'moon' : 'mars' } }, rows, limits };
  }
  // satellite, capsule, generic spacecraft
  const isSat = pt === 'satellite';
  const defMass = isSat ? DEFAULTS.satellite : DEFAULTS.spacecraft;
  const given = req.mass != null; const mass = given ? req.mass : defMass;
  const dvGiven = req.dv != null; const dv = req.dv ?? (isSat ? 300 : 1800);
  row('Vehicle', `${pt === 'capsule' ? 'Capsule stand-in (uncrewed spacecraft)' : isSat ? 'Satellite' : 'Spacecraft'}, no rocket`, 'you', null);
  row('Dry mass', kg(mass), given ? 'you' : 'assumed', 'Make it 400 kg');
  row('Delta-v', `${Math.round(dv)} m/s`, dvGiven ? 'you' : 'assumed', null);
  if (pt === 'capsule') limits.push('Crew, life support and re-entry are not modelled. It is an uncrewed spacecraft.');
  if (['moon', 'mars', 'geo', 'other'].includes(dest)) limits.push(`The trip to ${farLabel(req)} is not simulated. The mission is an Earth-orbit raise.`);
  return { build: { kind: isSat ? 'satellite' : 'spacecraft', spec: { type: isSat ? 'satellite' : 'spacecraft', dv: dvGiven ? dv : null, mass: given ? mass : null } }, rows, limits };
}

/** The one-line "I understood: ..." sentence for the transcript. */
export function understoodSentence(rows) {
  return 'I understood: ' + rows.map((r) => `${r.label.toLowerCase()} = ${r.value}${r.note ? ` (${r.note}${r.tag === 'assumed' && !/assum/.test(r.note) ? ', assumption' : ''})` : r.tag === 'assumed' ? ' (assumption)' : ''}`).join(', ') + '.';
}
