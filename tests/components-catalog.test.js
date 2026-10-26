// Catalog sanity: every part has a description and plain-words line, sane numbers, unique ids; new kinds are documented; enough new parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, KIND_LABELS, KIND_FIELDS, CATEGORIES, NEW_ENGINES, NEW_TANKS, NEW_STRUCTURE_PARTS, NEW_OTHER, NEW_ROVER, byCatalogId } from '../data/components.js';
import { COMPONENT_INFO } from '../data/academy/index.js';

test('catalog: unique ids, known kinds, description and plain-words lines', () => {
  const ids = new Set();
  for (const c of CATALOG) {
    assert.ok(c.catalogId && !ids.has(c.catalogId), `duplicate or missing id ${c.catalogId}`); ids.add(c.catalogId);
    assert.ok(KIND_LABELS[c.kind], `${c.catalogId}: unknown kind ${c.kind}`);
    assert.ok(String(c.name).length >= 3, c.catalogId);
    assert.ok(String(c.description ?? '').length >= 10, `${c.catalogId}: description`);
    assert.ok(c.plain?.best_for?.length >= 8 && c.plain?.trade_off?.length >= 8, `${c.catalogId}: plain`);
    assert.ok(c.plain.best_for.length <= 90 && c.plain.trade_off.length <= 90, `${c.catalogId}: plain too long`);
    assert.equal(byCatalogId(c.catalogId), c);
  }
});
test('catalog: numbers are finite and sensible', () => {
  for (const c of CATALOG) {
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${c.catalogId}.${k}`);
    if (c.kind !== 'wheel' && c.kind !== 'heater' && c.kind !== 'mli') assert.ok(c.mass > 0, `${c.catalogId}: mass`);
    for (const k of ['length', 'diameter', 'cost']) if (c[k] != null) assert.ok(c[k] >= 0, `${c.catalogId}.${k}`);
    if (c.kind === 'engine') {
      assert.ok(c.thrustVac > 0 && c.ispVac >= 50 && c.ispVac <= 5000, `${c.catalogId}: thrust/isp`);
      assert.ok(c.ispSl > 0 && c.ispSl <= c.ispVac + 1e-9, `${c.catalogId}: sea-level Isp above vacuum Isp`);
      assert.ok(c.propellants?.length >= 1 && c.ignitions >= 1 && c.minThrottle >= 0 && c.minThrottle <= 1, c.catalogId);
      assert.ok(c.thrustVac / (c.mass * 9.80665) < 400, `${c.catalogId}: engine thrust-to-weight is unrealistic`);
    }
    if (['fuel_tank', 'oxidizer_tank', 'propellant_tank'].includes(c.kind)) assert.ok(c.propellantMass > 0 && c.diameter > 0 && c.length > 0 && c.mass < c.propellantMass * 3, c.catalogId);
    if (c.kind === 'solar_panel') assert.ok(c.area > 0 && c.efficiency > 0 && c.efficiency < 0.5, c.catalogId);
    if (c.kind === 'battery') assert.ok(c.capacityWh > 0, c.catalogId);
  }
});
test('catalog: every kind has a label, inspector fields, a category and a full Academy entry', () => {
  const inCat = new Set(CATEGORIES.flatMap((x) => x.kinds));
  for (const k of Object.keys(KIND_LABELS)) {
    assert.ok(KIND_FIELDS[k], `KIND_FIELDS ${k}`);
    assert.ok(inCat.has(k), `CATEGORIES ${k}`);
    const e = COMPONENT_INFO[k]; assert.ok(e, `COMPONENT_INFO ${k}`);
    for (const f of ['name', 'group']) assert.ok(String(e[f] ?? '').length > 2, `${k}.${f}`);
    for (const f of ['oneLine', 'whatItDoes', 'whyItMatters', 'realWorld', 'tryIt']) assert.ok(String(e[f] ?? '').length > 10, `${k}.${f}`);
    for (const f of ['howItWorks', 'advantages', 'limitations']) assert.ok(e[f]?.length >= 1, `${k}.${f}`);
  }
  for (const c of CATALOG) assert.ok(Object.keys(KIND_LABELS).includes(c.kind));
  for (const k of new Set(CATALOG.map((c) => c.kind))) assert.ok(CATALOG.some((c) => c.kind === k));
});
test('catalog: at least 45 genuinely new parts, all distinct from the earlier ones', () => {
  const news = [...NEW_ENGINES, ...NEW_TANKS, ...NEW_STRUCTURE_PARTS, ...NEW_OTHER, ...NEW_ROVER];
  assert.ok(news.length >= 45, `only ${news.length} new parts`);
  const olds = CATALOG.filter((c) => !news.includes(c));
  assert.ok(olds.length >= 150);
  const oldNames = new Set(olds.map((c) => c.name.toLowerCase()));
  for (const n of news) assert.ok(!oldNames.has(n.name.toLowerCase()), `${n.catalogId} repeats an older name`);
  assert.ok(new Set(news.map((n) => n.kind)).size >= 15, 'new parts should cover many kinds');
});
