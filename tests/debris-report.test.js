// Impact prediction for jettisoned stages in the mission report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { buildRunRecord } from '../src/core/project.js';
import { debrisReport } from '../src/core/run-analysis.js';
import { buildReport, reportToHTML, reportToPDF, debrisRows } from '../src/core/report.js';

test('the report lists where the spent stage and the fairing come down, and what stays in orbit', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  assert.ok(r.ok);
  const record = buildRunRecord(r.sim);
  const d = debrisReport(record);
  const s1 = d.find((x) => x.group === 'stage1'), fair = d.find((x) => x.group === 'fairing'), up = d.find((x) => x.group.startsWith('deploy:'));
  assert.ok(s1?.impact && s1.impact.after > 300 && s1.impact.after < 3000, 'stage 1 impact time');
  assert.ok(s1.impact.lat > 20 && s1.impact.lat < 45, `Florida launch heading east: lat ${s1.impact.lat}`);
  assert.ok(s1.impact.lon > -80 && s1.impact.lon < -30, `downrange over the Atlantic: lon ${s1.impact.lon}`);
  assert.ok(s1.impact.downrangeKm > 300 && s1.impact.downrangeKm < 4000, `downrange ${s1.impact.downrangeKm} km`);
  assert.ok(s1.impact.speed > 5 && s1.impact.speed < 120, `impact speed relative to the ground (terminal velocity): ${s1.impact.speed}`);
  assert.ok(fair?.impact, 'fairing comes down');
  assert.ok(up && (up.orbit || up.impact), 'upper stage: orbit or reentry');
  if (up.orbit) assert.ok(up.orbit.periAlt > 150e3 && up.orbit.apoAlt < 260e3, JSON.stringify(up.orbit));
  const rep = buildReport(record, r.sim.telemetry);
  assert.ok(rep.debris.length >= 3);
  assert.match(reportToHTML(rep), /predicted impact points/);
  assert.ok(debrisRows(rep).every((row) => row.length === 4));
  assert.ok(reportToPDF(rep).length > 5000);
});
