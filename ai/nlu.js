// Offline natural-language understanding for the AI aerospace engineer: intent detection and entity extraction.
// It is deliberately transparent (keyword / pattern based, no hidden model) so that its behaviour is predictable and testable.

const NUMBER_WORDS = { zero: 0, one: 1, a: 1, an: 1, single: 1, two: 2, double: 2, twin: 2, three: 3, triple: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, fifty: 50, hundred: 100, thousand: 1000, half: 0.5 };
export const norm = (t) => String(t ?? '').toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
const wordToNum = (w) => (w in NUMBER_WORDS ? NUMBER_WORDS[w] : /^\d+(\.\d+)?$/.test(w) ? Number(w) : null);

const UNITS = [
  ['kg', /^(kg|kgs|kilogram|kilograms|kilo|kilos)$/, 1], ['t', /^(t|tonne|tonnes|ton|tons|metric)$/, 1000], ['g', /^(g|gram|grams)$/, 0.001],
  ['km', /^(km|kilometer|kilometers|kilometre|kilometres)$/, 1000], ['m', /^(m|meter|meters|metre|metres)$/, 1],
  ['m/s', /^(m\/s|mps)$/, 1], ['km/s', /^(km\/s)$/, 1000], ['s', /^(s|sec|secs|second|seconds)$/, 1], ['min', /^(min|mins|minute|minutes)$/, 60], ['h', /^(h|hr|hrs|hour|hours)$/, 3600],
  ['%', /^(%|percent|per cent)$/, 1], ['kn', /^(kn|kilonewton|kilonewtons)$/, 1000], ['n', /^(n|newton|newtons)$/, 1], ['deg', /^(deg|degree|degrees|°)$/, 1],
  ['g0', /^(g|gee|gees)$/, 1], ['lb', /^(lb|lbs|pound|pounds)$/, 0.45359237],
];

/** All "number unit" quantities in the text: [{value, unit, si, index}]. */
export function quantities(text) {
  const t = String(text).toLowerCase().replace(/,(\d{3})/g, '$1');
  const out = [];
  const re = /(-?\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|kilos?|lbs?|pounds?|tonnes?|tons?|km\/s|m\/s|km|kilometers?|kilometres?|meters?|metres?|percent|per cent|%|kn|kilonewtons?|newtons?|deg|degrees?|°|min|mins|minutes?|hours?|hrs?|h|seconds?|secs?|sec|s|g|t|m|n)(?![a-z])/g;
  let m;
  while ((m = re.exec(t))) {
    const value = Number(m[1]); const u = m[2];
    const def = UNITS.find(([, rx]) => rx.test(u));
    if (!def) continue;
    out.push({ value, unit: def[0], si: def[0] === '%' ? value / 100 : def[0] === 'deg' ? value : value * def[2], index: m.index, raw: m[0] });
  }
  return out;
}
export const firstQuantity = (text, units) => quantities(text).find((q) => units.includes(q.unit)) ?? null;

export const VEHICLE_WORDS = [
  ['rocket', /\b(rocket|launcher|launch vehicle|booster|carrier)\b/], ['probe', /\b(probe|probes|sonda|sondas|space probe)\b/], ['rover', /\b(rover|rovers)\b/],
  ['lander', /\b(lander|landers)\b/], ['satellite', /\b(satellite|satellites|cubesat)\b/], ['spacecraft', /\b(spacecraft|space craft|capsule|orbiter|space ship|spaceship)\b/],
];
export function vehicleTypes(text) { const t = norm(text); return VEHICLE_WORDS.filter(([, rx]) => rx.test(t)).map(([k]) => k); }

export function stageCount(text) {
  const t = norm(text);
  const m = /\b(\w+)[- ]stages?\b/.exec(t) ?? /\b(\d+)\s*stages?\b/.exec(t);
  if (m) { const n = wordToNum(m[1]); if (n != null && n >= 1 && n <= 6) return n; }
  if (/\bsingle[- ]stage|sstO\b/.test(t)) return 1;
  return null;
}
export const bodyOf = (text) => { const t = norm(text); if (/\bmoon|lunar|luna\b/.test(t)) return 'moon'; if (/\bmars|martian\b/.test(t)) return 'mars'; if (/\bearth|orbit\b/.test(t)) return 'earth'; return null; };

/** Target orbit altitude in metres from phrases such as "200 km orbit", "orbit at 400 km", "LEO". */
export function orbitAltitude(text) {
  const t = norm(text);
  const q = quantities(t).filter((x) => x.unit === 'km' || (x.unit === 'm' && x.value >= 80000));
  const m = /\b(orbit|orbital|altitude|apogee|circular)\b/.exec(t);
  if (q.length) {
    if (m) { // prefer the quantity nearest to the word orbit / altitude
      const near = q.map((x) => ({ x, d: Math.abs(x.index - m.index) })).sort((a, b) => a.d - b.d)[0].x;
      if (near.si >= 80000) return near.si;
    }
    const big = q.find((x) => x.si >= 80000); if (big && /orbit|altitude|high/.test(t)) return big.si;
  }
  if (/\b(leo|low earth orbit|low orbit)\b/.test(t)) return 200000;
  if (/\bgeo|geostationary|geosynchronous\b/.test(t)) return 35786000;
  return null;
}

export function payloadMass(text) {
  const t = norm(text);
  // "carrying a 100 kg probe", "payload of 250 kg", "100 kg payload"
  const qs = quantities(t).filter((q) => ['kg', 't', 'g', 'lb'].includes(q.unit));
  if (!qs.length) return null;
  const pay = /\b(carry|carrying|carries|with|payload|holding|delivering|deliver|launch|launching|lift|lifting|for)\b/.exec(t);
  if (pay) { const after = qs.filter((q) => q.index >= pay.index).sort((a, b) => a.index - b.index)[0]; if (after) return after.si; }
  return qs[0].si;
}

/** Component / group references ("the second stage", "upper stage", "the fairing"). */
export function stageRef(text) {
  const t = norm(text);
  const ord = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };
  let m = /\b(first|second|third|fourth|1st|2nd|3rd|4th)[- ]stage\b/.exec(t); if (m) return { stage: ord[m[1]] };
  m = /\bstage\s*(\d)\b/.exec(t); if (m) return { stage: Number(m[1]) };
  if (/\b(upper|top|last|final) stage\b/.test(t)) return { stage: 'upper' };
  if (/\b(lower|bottom|booster) stage\b|\bbooster\b/.test(t)) return { stage: 1 };
  return null;
}

// -------------------------------------------------------------------------------------------------------------
// intents
// -------------------------------------------------------------------------------------------------------------
const has = (t, ...rx) => rx.some((r) => r.test(t));
export function detectIntent(text, { hasPending = false } = {}) {
  const t = norm(text);
  const out = [];
  const add = (intent, score) => out.push({ intent, score });
  if (hasPending) {
    if (has(t, /^(yes|yep|yeah|ok|okay|sure|approve|approved|go ahead|do it|apply|confirm|looks good|proceed|accept|go|yes please|please do)\b/)) add('approve', 100);
    if (has(t, /^(no|nope|cancel|discard|never mind|nevermind|stop|abort|reject|don'?t|do not)\b/)) add('cancel', 100);
  }
  if (has(t, /^(undo)\b|\bundo (that|the last|it)\b/)) add('undo', 90);
  if (has(t, /^(redo)\b/)) add('redo', 90);
  if (has(t, /\b(version history|versions|history of changes|show history)\b/)) add('versions', 80);
  if (has(t, /\bwhy\b.*\b(fail|failed|crash|crashed|explode|exploded|wrong|break|broke|not work|didn'?t work|lose|lost|die|died|burn|burned|unsuccessful)/, /\bwhat (went wrong|happened|failed|is wrong)\b/, /\b(explain|analy[sz]e|diagnose)\b.*\b(fail|crash|result|run|flight|mission|simulation|it)\b/, /\broot cause\b/, /\bwhat caused\b/)) add('explain', 90);
  if (has(t, /^(fix|repair|correct|solve)\b/, /\b(fix|repair|solve|correct|make)\b.*\b(it|this|that|the problem|the issue|failure)\b.*\b(work|fly|reach|orbit|land|succeed|pass)?/) && !has(t, /\bfix\b.*\b(price|bug in the app)\b/)) add('fix', 75);
  if (has(t, /\b(improve|optimi[sz]e|redesign|iterate|keep trying|until it works|make it better|make it work)\b/)) add('fix', 80);
  if (has(t, /\b(compare|comparison|versus|vs\.?|difference between|before and after|how does it compare|better than)\b/)) add('compare', 80);
  if (has(t, /\bmonte[- ]?carlo\b/, /\b(dispersion|dispersed|statistical) (analysis|study|runs?|test)\b/, /\b(probability|chance|likelihood) (of|that).*\b(success|work|reach|fail)/, /\bhow (reliable|robust)\b/, /\breliability (study|analysis)\b/, /\brun (it )?\d+ times\b/, /\bwith (random|uncertain|varying) (thrust|parameters|performance|inputs)\b/)) add('montecarlo', 88);
  if (has(t, /\b(sweep|parameter study|experiment|parametric|vary|try (different|several|various|masses|values)|what if|for (different|several) (masses|payloads|values)|from .* to .* in steps)\b/)) add('experiment', 78);
  if (has(t, /^(test|simulate|run|fly|launch|try|check)\b/, /\b(test|simulate|fly|run) (it|this|that|the|my|a)\b/, /\bsee if it (works|flies|reaches|lands)\b/, /\b(does|will) it (work|fly|reach|land|make it)\b/, /\blet'?s (test|fly|see)\b/, /\bstart (the )?simulation\b/)) add('test', 85);
  if (has(t, /^(stop|halt|abort) (the )?(simulation|run|sim)\b/)) add('stop', 95);
  if (has(t, /\b(build|make|create|design|construct|give me|i (want|need)|generate|set up|assemble)\b/) && vehicleTypes(t).length) add('build', 70);
  // "launch a 200 kg satellite", "send a rover to Mars", "I want to go to Mars": a new mission, not a test of the current vehicle
  if (has(t, /^(launch|send|put|lift|deliver)\b/) && vehicleTypes(t).length && has(t, /\b(a|an|some|\d+)\b/) && !has(t, /\b(it|this|that|the (rocket|vehicle|probe|rover|lander|satellite))\b/)) add('build', 92);
  if (has(t, /\b(mission|trip|journey|go|fly|travel|get) (to|into) (the )?(moon|mars|iss|space|orbit)\b/, /\bi want (to )?(go|fly|travel|launch)\b/)) add('build', 60);
  if (has(t, /\b(save|store)\b.*\b(project|work|it)?\b/) && !has(t, /\bsave (me|us)\b/)) add('save', 70);
  if (has(t, /\b(load|open|restore)\b.*\bproject\b/, /\blist (my )?projects\b/, /\bshow (my )?projects\b/)) add('load', 75);
  if (has(t, /\b(increase|decrease|reduce|raise|lower|add|remove|delete|change|set|swap|replace|make .* (bigger|larger|smaller|lighter|heavier|longer|shorter)|use|more|less|another|extra|double|halve|rename|call)\b/)) add('modify', 50);
  if (has(t, /\b(what is|what'?s|how much|how many|show|tell me|list|status|describe|summary|summari[sz]e|how (fast|high|hot|long)|max|maximum|peak|report)\b/)) add('info', 40);
  if (has(t, /\b(what is|what are|explain|define|how does|how do|what does|why is|teach)\b.*\b(delta[- ]?v|rocket equation|tsiolkovsky|isp|specific impulse|max[- ]?q|dynamic pressure|thrust[- ]to[- ]weight|twr|orbit|apoapsis|periapsis|hohmann|staging|gravity turn|mach|drag|escape velocity|eccentricity|kepler|friis|link budget|rk4|integrator|gravity loss)/)) add('concept', 85);
  if (has(t, /\b(report|pdf|csv|export)\b/)) add('export', 70);
  if (has(t, /^help me\b/, /\bwhat (can|should|do) i (do|try)\b/, /\bwhat('?s| is| are)? (the )?next(?! stage)\b/, /\bwhat now\b/, /\bwhat do i do\b/, /\b(what|anything)('?s| is| am i| are we)? (still )?(missing|left|needed|lacking)\b/, /\bwhat am i missing\b/, /^(i'?m|i am) (stuck|lost)\b/, /\bwhere (do|should) i (start|begin)\b/)) add('next', 92);
  if (has(t, /^(help|what can you do|how do i|commands|capabilities)\b/, /\bwhat can you\b/)) add('help', 60);
  if (has(t, /^(hi|hello|hey|good (morning|afternoon|evening))\b/)) add('greeting', 30);
  out.sort((a, b) => b.score - a.score);
  return out.length ? out[0].intent : 'unknown';
}

/** Parse a "sweep" request into experiment parameters. Returns {parameter, values|from/to/steps, label} or null. */
export function parseSweep(text) {
  const t = norm(text);
  const range = /\bfrom\s+(-?\d+(?:\.\d+)?)\s*(kg|%|km|percent|m\/s)?\s*(?:to|-|until)\s*(-?\d+(?:\.\d+)?)\s*(kg|%|km|percent|m\/s)?/.exec(t);
  const steps = /\b(?:in|with)\s+(\d+)\s+steps?\b/.exec(t) ?? /\b(\d+)\s+(?:values|points|cases|steps)\b/.exec(t);
  let from = null, to = null, unit = null;
  if (range) { from = Number(range[1]); to = Number(range[3]); unit = range[4] ?? range[2] ?? null; }
  const nSteps = steps ? Math.min(Number(steps[1]), 15) : 5;
  const what = /\bpayload\b/.test(t) ? 'payload' : /\b(second|upper|2nd) stage\b.*\b(propellant|fuel)|\b(propellant|fuel)\b.*\b(second|upper|2nd) stage\b/.test(t) ? 'stage2prop' : /\b(first|1st|lower) stage\b.*\b(propellant|fuel)|\b(propellant|fuel)\b.*\b(first|1st) stage\b/.test(t) ? 'stage1prop' : /\b(orbit|altitude)\b/.test(t) ? 'altitude' : /\b(pitch|trajectory|schedule|profile)\b/.test(t) ? 'pitch' : /\bpropellant|fuel\b/.test(t) ? 'stage2prop' : null;
  if (!what) return null;
  const list = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:kg|%|km|percent)?/g)].map((m) => Number(m[1]));
  return { what, from, to, unit, steps: nSteps, list: !range ? list : [] };
}
