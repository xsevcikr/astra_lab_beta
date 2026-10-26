// Request understanding: table-driven tests of the extraction function (what the user said) and of the interpretation (ask / build / say what is
// not supported). No simulation is run here; the conversation tests at the bottom only look at the first reply of the AI engineer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequest, interpretRequest, mergeRequest, hasContent, LIMITS } from '../ai/intent.js';
import { detectIntent } from '../ai/nlu.js';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';

// [phrase, what must be extracted (only the listed fields are compared)]
const EXTRACT = [
  ['Build a rocket with a rover to Mars', { payloadType: 'rover', launcher: true, destination: 'mars', mass: null }],
  ['Build me a two-stage rocket carrying a 100 kg space probe.', { payloadType: 'probe', launcher: true, mass: 100, stages: 2, destination: null }],
  ['I want a rocket that puts a 500 kg satellite into LEO', { payloadType: 'satellite', launcher: true, mass: 500, destination: 'leo' }],
  ['Launch a 2 tonne satellite to GEO', { payloadType: 'satellite', launcher: true, launcherImplied: true, mass: 2000, destination: 'geo' }],
  ['launch a crew capsule to the ISS', { payloadType: 'capsule', launcher: true, destination: 'iss' }],
  ['Build a rover for the Moon', { payloadType: 'rover', launcher: null, destination: 'moon' }],
  ['Build a lander for the Moon carrying a 120 kg rover', { payloadType: 'lander', alsoRover: true, roverMass: 120, destination: 'moon', mass: null }],
  ['Build a Mars lander', { payloadType: 'lander', destination: 'mars' }],
  ['Build a small satellite', { payloadType: 'satellite', launcher: null, mass: null }],
  ['a 250 kg cubesat', { payloadType: 'satellite', mass: 250 }],
  ['Send a probe to Mars', { payloadType: 'probe', launcher: true, launcherImplied: true, destination: 'mars' }],
  ['Send a 50 kg sonda to the Moon', { payloadType: 'probe', mass: 50, destination: 'moon' }],
  ['rocket with a 220 lb probe', { payloadType: 'probe', mass: 99.79032140000001 }],
  ['rocket for a 1,200 kg satellite', { payloadType: 'satellite', mass: 1200 }],
  ['a rocket with a 3 t payload to orbit', { mass: 3000, destination: 'orbit', launcher: true }],
  ['Put a 100 kg probe in a 400 km orbit', { payloadType: 'probe', altitude: 400000, mass: 100 }],
  ['rocket to 800 km altitude with a satellite', { altitude: 800000, payloadType: 'satellite' }],
  ['satellite on a rocket, orbit at 250 miles', { altitude: 250 * 1609.344 }],
  ['I need a single stage rocket for a 20 kg probe', { stages: 1, mass: 20, payloadType: 'probe' }],
  ['three stage rocket with a rover', { stages: 3, payloadType: 'rover' }],
  ['a 2-stage rocket for a probe', { stages: 2 }],
  ['Build a cheap reusable rocket for a 100 kg satellite', { cheap: true, reusable: true, mass: 100, payloadType: 'satellite' }],
  ['a rocket that lands back on the barge, payload 100 kg', { reusable: true, mass: 100 }],
  ['Build a rocket for a 200 kg rover to the Moon by 2030', { year: 2030, destination: 'moon', mass: 200, payloadType: 'rover' }],
  ['launch a satellite in 2028 for under $5 million', { year: 2028, budget: { amount: 5e6, text: '$5 million' }, payloadType: 'satellite' }],
  ['a 2000 kg satellite on a rocket', { mass: 2000, year: null }],
  ['a rocket weighing 5 tonnes carrying a 100 kg probe', { launcherMass: 5000, mass: 100, payloadType: 'probe' }],
  ['a 100 kg rover without a rocket for Mars', { launcher: false, payloadType: 'rover', destination: 'mars', mass: 100 }],
  ['Just a Moon rover', { launcher: false, payloadType: 'rover', destination: 'moon' }],
  ['A Mars rover only', { launcher: false, destination: 'mars' }],
  ['Launch it to LEO (200 km)', { destination: 'leo', altitude: 200000, payloadType: null, launcher: null }],
  ['Use 1500 kg', { mass: 1500 }],
  ['rover that drives 2 km on the Moon', { distance: 2000, altitude: null, destination: 'moon' }],
  ['rover to drive 500 m', { distance: 500 }],
  ['a satellite with 800 m/s of delta-v', { dv: 800, payloadType: 'satellite' }],
  ['a probe to orbit the Moon', { destination: 'moon', around: true, payloadType: 'probe' }],
  ['a rocket with a probe to Venus', { destination: 'other', farName: 'venus' }],
  ['a rocket for a satellite in a sun-synchronous orbit', { destination: 'orbit' }],
  ['suborbital sounding rocket with a 10 kg payload', { suborbital: true, mass: 10 }],
  ['a rocket with a satellite and a rover', { ambiguousPayload: ['satellite', 'rover'] }],
  ['Build a rocket', { payloadType: null, launcher: true }],
  ['Cohete con una sonda', { launcher: null }],
  ['more margin please', { margin: 1 }],
  ['make the payload 200 kg', { mass: 200, payloadType: null }],
  ['orbit at 400 km', { altitude: 400000, destination: 'orbit' }],
  ['a 300 g cubesat rocket payload', { mass: 0.3, payloadType: 'satellite' }],
  ['why did it fail', { payloadType: null, launcher: null, mass: null }],
];

test('extractRequest: table of phrases (payload, mass, destination, orbit, stages, reusable, budget, date)', () => {
  assert.ok(EXTRACT.length >= 40, `${EXTRACT.length} phrases`);
  for (const [phrase, want] of EXTRACT) {
    const got = extractRequest(phrase);
    for (const [k, v] of Object.entries(want)) {
      if (typeof v === 'number' && v !== 0) assert.ok(Math.abs(got[k] - v) < 1e-6 * Math.max(1, Math.abs(v)), `"${phrase}": ${k} = ${JSON.stringify(got[k])}, wanted ${v}`);
      else assert.deepEqual(got[k], v, `"${phrase}": ${k} = ${JSON.stringify(got[k])}, wanted ${JSON.stringify(v)}`);
    }
  }
});

// [phrase, expected decision]: {ask: id} | {build: kind, ...checks}
const DECIDE = [
  ['Build a rocket with a rover to Mars', { ask: 'far-destination', chip: /LEO/, chipsHave: [/Just a Mars rover/] }],
  ['Build a rocket with a probe to the Moon', { ask: 'far-destination' }],
  ['Launch a satellite to GEO', { ask: 'far-destination', chipsHave: [/1000 km/] }],
  ['Send a rover to Mars', { ask: 'far-destination' }],
  ['Build a rocket', { ask: 'payload' }],
  ['Build me a rocket for 100 kg', { ask: 'payload' }],
  ['Build a rocket with a satellite and a rover', { ask: 'which-payload' }],
  ['Build a rover', { ask: 'body' }],
  ['Build a lander', { ask: 'body' }],
  ['Launch a crew capsule to the ISS', { ask: 'capsule' }],
  ['Build a rocket for a lander on the Moon', { ask: 'lander-launch' }],
  ['Launch a 3 tonne satellite to LEO', { ask: 'too-heavy' }],
  ['Build me a two-stage rocket carrying a 100 kg space probe.', { build: 'rocket', mass: 100, altitude: 200000, assumed: ['Destination'] }],
  ['Build a rocket with a rover', { build: 'rocket', payloadKind: 'rover', mass: 150, assumed: ['Payload', 'Destination'] }],
  ['Launch a 400 kg satellite to 600 km', { build: 'rocket', mass: 400, altitude: 600000, kind2: 'satellite' }],
  ['Put a 100 kg probe into the ISS orbit', { build: 'rocket', altitude: 420000, limit: /rendezvous/ }],
  ['rocket with a 20 kg probe to a 50 km orbit', { build: 'rocket', altitude: LIMITS.minOrbit, limit: /too low/ }],
  ['rocket with a satellite at 3000 km', { build: 'rocket', altitude: LIMITS.maxOrbit, limit: /above my limit/ }],
  ['single stage rocket with a 50 kg probe', { build: 'rocket', limit: /One stage cannot/ }],
  ['four stage rocket with a probe', { build: 'rocket', limit: /third can be added/ }],
  ['Build a cheap reusable rocket for a 100 kg satellite', { build: 'rocket', limit: /Reusable rockets are not simulated/, limit2: /Cheap/ }],
  ['rocket for a probe in 2031', { build: 'rocket', limit: /Date 2031/ }],
  ['a rocket for a 2 kg cubesat', { build: 'rocket', mass: LIMITS.launcherMinPayload, limit: /below my minimum/ }],
  ['rocket weighing 4 tonnes with a 100 kg probe', { build: 'rocket', limit: /cannot be set/ }],
  ['rocket with a 1000 kg crew capsule', { build: 'rocket', limit: /mass-only stand-in/ }],
  ['Build a rover for the Moon', { build: 'rover', mass: 150, assumed: ['Mass', 'Drive'] }],
  ['Build a 300 kg rover for Mars that drives 1 km', { build: 'rover', mass: 300, distance: 1000, body: 'mars' }],
  ['Build a lander for the Moon carrying a 120 kg rover', { build: 'lander', roverMass: 120 }],
  ['Build a Mars lander', { build: 'lander', limit: /not fully supported/ }],
  ['Build a small satellite', { build: 'satellite', assumed: ['Dry mass', 'Delta-v'] }],
  ['Build a probe', { build: 'probe', mass: 100, assumed: ['Mass'] }],
  ['Build a probe for Mars', { build: 'probe', limit: /not simulated/ }],
  ['Build a crew capsule', { build: 'spacecraft', limit: /Crew, life support/ }],
  ['Build a spacecraft with 900 m/s delta-v', { build: 'spacecraft' }],
];

test('interpretRequest: asks ONE question or builds, flags assumptions and never hides a limit', () => {
  assert.ok(DECIDE.length >= 30);
  for (const [phrase, want] of DECIDE) {
    const d = interpretRequest(extractRequest(phrase));
    if (want.ask) {
      assert.ok(d.ask, `"${phrase}" should ask, got ${JSON.stringify(d).slice(0, 200)}`);
      assert.equal(d.ask.id, want.ask, phrase);
      assert.ok(d.ask.chips.length >= 2 && d.ask.chips.length <= 4, `${phrase}: chips ${d.ask.chips}`);
      assert.ok(d.ask.question.length < 100, 'the question is short');
      for (const rx of want.chipsHave ?? []) assert.ok(d.ask.chips.some((c) => rx.test(c)), `${phrase}: chips ${d.ask.chips}`);
      assert.ok(!d.build, 'nothing is built while a question is open');
      continue;
    }
    assert.ok(d.build, `"${phrase}" should build, got ${JSON.stringify(d).slice(0, 300)}`);
    assert.equal(d.build.kind, want.build, phrase);
    const sp = d.build.spec;
    if (want.mass != null) assert.equal(sp.payloadMass ?? sp.mass, want.mass, phrase);
    if (want.altitude != null) assert.equal(sp.altitude, want.altitude, phrase);
    if (want.payloadKind) assert.equal(sp.payloadKind, want.payloadKind, phrase);
    if (want.kind2) assert.equal(sp.payloadKind, want.kind2, phrase);
    if (want.distance != null) assert.equal(sp.distance, want.distance, phrase);
    if (want.body) assert.equal(sp.body, want.body, phrase);
    if (want.roverMass != null) assert.equal(sp.withRoverMass, want.roverMass, phrase);
    if (want.limit) assert.ok(d.limits.some((l) => want.limit.test(l)), `${phrase}: limits ${JSON.stringify(d.limits)}`);
    if (want.limit2) assert.ok(d.limits.some((l) => want.limit2.test(l)), `${phrase}: limits ${JSON.stringify(d.limits)}`);
    for (const lab of want.assumed ?? []) assert.equal(d.rows.find((r) => r.label === lab)?.tag, 'assumed', `${phrase}: "${lab}" must be flagged as an assumption; rows ${JSON.stringify(d.rows)}`);
    // every row says who it came from
    for (const r of d.rows) assert.ok(['you', 'assumed', 'auto'].includes(r.tag), phrase);
  }
});

test('answers and edits merge into the saved request; moving to Earth orbit remembers what was left out', () => {
  let r = extractRequest('Build a rocket with a rover to Mars');
  assert.equal(interpretRequest(r).ask.id, 'far-destination');
  let m = mergeRequest(r, extractRequest('Launch it to LEO (200 km)'));
  let d = interpretRequest(m);
  assert.equal(d.build.kind, 'rocket'); assert.equal(d.build.spec.payloadKind, 'rover'); assert.equal(d.build.spec.altitude, 200000);
  assert.ok(d.limits.some((l) => /Mars/.test(l) && /not simulated/.test(l)), 'the Mars part is said to be left out');
  assert.ok(d.rows.some((r2) => /wanted Mars/.test(r2.note ?? '')));
  m = mergeRequest(r, extractRequest('Just a Mars rover'));
  d = interpretRequest(m);
  assert.equal(d.build.kind, 'rover'); assert.equal(d.build.spec.body, 'mars');
  m = mergeRequest(r, extractRequest('A Moon rover only'));
  assert.equal(interpretRequest(m).build.spec.body, 'moon');
  // payload question -> chip -> mass question is not asked again, the stated mass is kept
  r = extractRequest('Build me a rocket for 300 kg');
  assert.equal(interpretRequest(r).ask.id, 'payload');
  d = interpretRequest(mergeRequest(r, extractRequest('A space probe')));
  assert.equal(d.build.spec.payloadMass, 300);
  // margin edits add up
  assert.equal(mergeRequest({ margin: 1 }, extractRequest('even more margin')).margin, 2);
  assert.ok(hasContent(extractRequest('Mars')) && !hasContent(extractRequest('what is delta-v')));
});

test('launch / send phrases are new missions, "launch it" still means test', () => {
  assert.equal(detectIntent('Launch a 200 kg satellite to 400 km'), 'build');
  assert.equal(detectIntent('Send a rover to Mars'), 'build');
  assert.equal(detectIntent('launch it'), 'test');
  assert.equal(detectIntent('Launch the rocket'), 'test');
  assert.equal(detectIntent('I want to go to Mars'), 'build');
});

// ---------------------------------------------------------------------------------------------------------------
test('BUG: "Build a rocket with a rover to Mars" asks ONE question, never builds a 100 kg probe, and says what is supported', async () => {
  const S = new AiSession({ storage: new MemoryStorage() });
  const r1 = await S.send('Build a rocket with a rover to Mars');
  assert.ok(r1.question && !r1.plan, 'a question, no proposal');
  assert.equal(S.pending, null);
  assert.equal(S.project.vehicle, null);
  assert.ok(r1.suggestions.length >= 2);
  assert.match(r1.text, /not simulated/);
  assert.ok(!/100 kg/.test(r1.text), 'no invented probe');
  assert.ok(r1.short && r1.short.split(/\s+/).length < 70, 'short reply');
  // the answer builds the launcher + ROVER (not a probe) and shows the interpretation
  const r2 = await S.send('Launch it to LEO (200 km)');
  assert.ok(r2.plan && r2.plan.ok && r2.understood, 'proposal with an interpretation card');
  assert.equal(r2.plan.steps[0].tool, 'CREATE_ROVER');
  assert.ok(r2.understood.rows.some((x) => x.label === 'Payload' && /rover/.test(x.value) && x.tag === 'assumed' && /assumed 150 kg/.test(x.note)), JSON.stringify(r2.understood.rows));
  assert.ok(r2.understood.limits.some((l) => /Mars/.test(l)));
  assert.match(r2.text, /I understood: payload = rover \(mass assumed 150 kg/);
  assert.equal(S.project.vehicle, null, 'nothing applied before approval');
  // an edit of the assumption goes through the same card
  const r3 = await S.send('make the payload 200 kg');
  assert.ok(r3.understood.rows.find((x) => x.label === 'Payload').value.includes('200 kg'));
  assert.equal(r3.understood.rows.find((x) => x.label === 'Payload').tag, 'you');
  await S.send('yes');
  const v = S.project.vehicle;
  assert.equal(v.type, 'rocket');
  assert.ok(Math.abs(v.meta.payloadMass - 200) < 1, `payload ${v.meta.payloadMass}`);
  assert.ok(v.components.some((c) => c.group === 'payload' && c.kind === 'wheel' || c.group === 'payload' && /wheel/i.test(c.name ?? '')), 'the rover (wheels) is inside the fairing');
});

test('conversation: other answers, cancel, unrelated messages and the ADD_PAYLOAD replace bug', async () => {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.send('Build a rocket');
  const q = await S.send('A satellite');
  assert.ok(q.plan, 'payload answer builds');
  await S.send('cancel');
  assert.equal(S.pending, null);
  const a = await S.send('Launch a crew capsule to the ISS');
  assert.equal(a.question.id, 'capsule');
  const b = await S.send('A 1000 kg capsule stand-in');
  assert.ok(b.plan && b.understood.limits.some((l) => /stand-in/.test(l)) && b.understood.limits.some((l) => /rendezvous/.test(l)));
  await S.send('cancel');
  // unrelated message after a question clears it
  await S.send('Build a rover');
  const h = await S.send('what is delta-v?');
  assert.ok(!h.question && !h.plan);
  assert.equal(S.clarify, null);
  // ADD_PAYLOAD twice on the same rocket (used to fail with "No component cpu1")
  const T = new AiSession({ storage: new MemoryStorage() });
  await T.send('Build me a two-stage rocket carrying a 100 kg space probe.'); await T.send('yes');
  const rocket = Object.values(T.project.vehicles).find((v) => v.type === 'rocket');
  assert.equal((await T.tool('CREATE_PROBE', { name: 'Space probe', mass: 200 })).ok, true);
  const r1 = await T.tool('ADD_PAYLOAD', { vehicle: rocket.id, payloadVehicle: 'Space probe' });
  assert.equal(r1.ok, true, r1.message);
  const r2 = await T.tool('ADD_PAYLOAD', { vehicle: rocket.id, mass: 150 });
  assert.equal(r2.ok, true, r2.message);
  assert.ok(Math.abs(rocket.meta.payloadMass - 150) < 1);
  // no vehicle given while a probe is active: the newest rocket is used
  await T.tool('CREATE_PROBE', { name: 'Space probe', mass: 80 });
  const r3 = await T.tool('ADD_PAYLOAD', { payloadVehicle: 'Space probe' });
  assert.equal(r3.ok, true, r3.message);
});
