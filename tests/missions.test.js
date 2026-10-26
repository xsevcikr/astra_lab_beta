// Integration tests: whole missions flown by the real simulator (no scripted results).
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe, buildLander, buildRover } from '../src/vehicles/builders.js';
import { landerMission, roverMission } from '../src/missions/generator.js';
import { designVerifiedLauncher, runToEnd } from '../src/missions/tuner.js';

test('two-stage launcher puts a 100 kg probe into a 200 km orbit', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  assert.ok(r.ok, 'orbit reached: ' + r.sim.result.reason);
  const o = r.sim.result.summary.finalOrbit;
  assert.ok(o.peri > 180e3 && o.apo < 260e3, `orbit ${o.peri}/${o.apo}`);
});

test('lunar powered descent lands softly within the leg rating', () => {
  const v = buildLander({ body: 'moon', payloadMass: 150 });
  const sim = runToEnd(v, landerMission(v, { body: 'moon' }), { wallMs: 120000 });
  assert.equal(sim.result.status, 'SUCCESS', sim.result.reason);
  const td = sim.result.summary.touchdown;
  assert.ok(td.vVert <= 3.5 && td.vHoriz <= 1.5);
});

test('an under-fuelled lander is detected as a failure with a cause', () => {
  const v = buildLander({ body: 'moon', payloadMass: 150 });
  for (const c of v.components) if (c.propellantMass) c.propellantMass *= 0.35;
  const sim = runToEnd(v, landerMission(v, { body: 'moon' }), { wallMs: 120000 });
  assert.equal(sim.result.status, 'FAILURE');
  assert.ok(sim.result.failures.length >= 1);
});

test('lander deploys a rover which drives on its own', () => {
  const v = buildLander({ body: 'moon', carryRover: buildRover({ mass: 120 }) });
  const m = landerMission(v, { body: 'moon', roverDelay: 60 });
  m.objective = { type: 'traverse', distance: 40, body: 'moon' };
  m.events.push({ id: 'drv', name: 'Drive', condition: { type: 'event', id: 'rover', delay: 5 }, action: { type: 'DRIVE', heading: 90, distance: 50, speed: 0.5 }, status: 'pending' });
  const sim = runToEnd(v, m, { wallMs: 180000 });
  assert.equal(sim.result.status, 'SUCCESS', sim.result.reason);
});

test('rover traverse on Mars consumes energy and completes', () => {
  const v = buildRover({ mass: 150 });
  const sim = runToEnd(v, roverMission(v, { body: 'mars', distance: 150 }), { wallMs: 60000 });
  assert.equal(sim.result.status, 'SUCCESS', sim.result.reason);
});

test('simulation is deterministic', () => {
  const v = buildRover({ mass: 100 });
  const a = runToEnd(v, roverMission(v, { body: 'moon', distance: 60 }));
  const b = runToEnd(v, roverMission(v, { body: 'moon', distance: 60 }));
  assert.equal(a.result.endTime, b.result.endTime);
  assert.equal(JSON.stringify(a.result.summary), JSON.stringify(b.result.summary));
});
