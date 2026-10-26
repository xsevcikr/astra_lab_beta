// Sharing designs (2.0): file, link and code round trips, and refusal of damaged or foreign input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designLink, designCode, designFileText, readDesign, importDesign, LINK_PREFIX } from '../src/core/share.js';
import { TEMPLATE_BY_ID } from '../data/templates.js';
import { Project } from '../src/core/project.js';

const { vehicle, mission } = TEMPLATE_BY_ID['small-launcher'].make();

test('a design survives file, link and code round trips unchanged', async () => {
  const link = await designLink(vehicle, mission, { note: 'Try this one' });
  assert.ok(link.startsWith(LINK_PREFIX));
  for (const input of [link, link.slice(LINK_PREFIX.length), designFileText(vehicle, mission), `  ${link}\n`]) {
    const d = await readDesign(input);
    assert.deepEqual(d.vehicle.components, vehicle.components);
    assert.equal(d.mission.objective.altitude, mission.objective.altitude);
  }
  assert.equal((await readDesign(link)).note, 'Try this one');
  assert.ok((await designCode(vehicle, mission)).length < 20000, 'a launcher fits in a chat message');
});

test('damaged, empty or foreign input is refused with a plain reason', async () => {
  const code = await designCode(vehicle, mission);
  await assert.rejects(readDesign(code.slice(0, code.length / 2)), /damaged|incomplete/);
  await assert.rejects(readDesign(''), /Paste/);
  await assert.rejects(readDesign('hello world!'), /does not look/);
  await assert.rejects(readDesign('{"format":"astra.bundle/1"}'), /bundle/);
  await assert.rejects(readDesign('{"format":"astra.design/1","vehicle":{"components":[]}}'), /no parts/);
});

test('importing gives the shared design new ids and makes it active, without touching existing designs', async () => {
  const P = new Project('Mine');
  P.setVehicle(JSON.parse(JSON.stringify(vehicle)), { activate: true });
  const before = Object.keys(P.vehicles).length;
  const v = importDesign(P, await readDesign(await designLink(vehicle, mission)));
  assert.equal(Object.keys(P.vehicles).length, before + 1);
  assert.notEqual(v.id, vehicle.id);
  assert.match(v.name, /\(shared\)$/);
  assert.equal(P.activeVehicle, v.id);
});
