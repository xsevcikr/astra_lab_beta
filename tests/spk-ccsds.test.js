// 2.9: trajectory exchange. Binary SPICE SPK kernels (checked against kernels and states written by NASA/NAIF CSPICE N0067 through
// SpiceyPy, see scripts/make-spk-fixtures.py), CCSDS OEM with several segments / covariance / XML (checked against files written by the
// independent Python "oem" library), OPM Keplerian elements, OMM mean elements and time-system conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSpk, stateRelative, writeSpk13, coverage, sampleSpk, isSpk } from '../src/core/spk.js';
import {
  parseEphemeris, parseOEM, parseOEMXml, writeOEM, writeOEMXml, exportOEM, exportOPM, parseOPM, parseOMM, parseOrbitState, convertTime, taiMinusUtc,
  isoOf, parseTime, elementsToState, stateToElements, parseEphemerisBytes, exportSpk, samplesOf, compareEphemeris, fileTimeToEpoch,
} from '../src/core/ccsds.js';

const fx = (p) => new URL(`./fixtures/${p}`, import.meta.url);

test('SPK: every segment type CSPICE wrote (2, 3, 8, 9, 12, 13 and a chained Moon orbiter) matches CSPICE to 1e-9 km', () => {
  const spk = readSpk(readFileSync(fx('spk/cspice-mixed.bsp')));
  assert.deepEqual([...new Set(spk.segments.map((s) => s.type))].sort((a, b) => a - b), [2, 3, 8, 9, 12, 13]);
  const exp = JSON.parse(readFileSync(fx('spk/cspice-mixed.expected.json'), 'utf8'));
  for (const [tgt, rows] of Object.entries(exp)) {
    for (const r of rows) {
      const got = stateRelative(spk, +tgt, 399, r[0]);
      assert.ok(got, `body ${tgt} at ${r[0]}`);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(got.state[k] - r[k + 1]) < 1e-9, `body ${tgt} pos ${k}: ${got.state[k]} vs ${r[k + 1]}`);
      for (let k = 3; k < 6; k++) assert.ok(Math.abs(got.state[k] - r[k + 1]) < 1e-11, `body ${tgt} vel ${k}: ${got.state[k]} vs ${r[k + 1]}`);
    }
  }
  // chaining: the orbiter relative to the Moon plus the Moon relative to the Earth
  const t = exp['-907'][2][0]; const a = stateRelative(spk, -907, 301, t).state, b = stateRelative(spk, 301, 399, t).state, c = stateRelative(spk, -907, 399, t).state;
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(a[k] + b[k] - c[k]) < 1e-9);
  // and the reverse direction
  const rev = stateRelative(spk, 399, -907, t).state; for (let k = 0; k < 6; k++) assert.ok(Math.abs(rev[k] + c[k]) < 1e-9);
});

test('SPK: outside the coverage there is no state, and coverage lists each body once', () => {
  const spk = readSpk(readFileSync(fx('spk/cspice-mixed.bsp')));
  assert.equal(stateRelative(spk, -905, 399, 0), null);
  const cov = coverage(spk); assert.equal(cov.length, 8); assert.ok(cov.every((c) => c.supported));
  assert.ok(isSpk(readFileSync(fx('spk/cspice-mixed.bsp')))); assert.ok(!isSpk(new TextEncoder().encode('CCSDS_OEM_VERS = 2.0'.padEnd(2000))));
  assert.throws(() => readSpk(new Uint8Array(100)), /too short/);
  assert.throws(() => readSpk(new TextEncoder().encode('hello'.padEnd(2048))), /not an SPK/);
});

// consistent = true: z moves at exactly its stated speed (the first test files used z = 1000 m per step with uneven steps on purpose)
function circularOrbit(n = 333, dt = 30, consistent = false) {
  const mu = 3.986004418e14, a = 7.0e6, w = Math.sqrt(mu / a ** 3), out = [];
  for (let i = 0; i < n; i++) { const t = 7e8 + i * dt + (i % 3) * 2; const th = w * (t - 7e8); out.push({ t, r: [a * Math.cos(th), a * Math.sin(th), consistent ? (1000 / dt) * (t - 7e8) : 1000 * i], v: [-a * w * Math.sin(th), a * w * Math.cos(th), 1000 / dt] }); }
  return out;
}

test('SPK writer: type 13 round trip reproduces the states at the nodes and the motion between them (CSPICE reads these files too)', () => {
  const S = circularOrbit();
  const u8 = writeSpk13(S, { target: -777, comment: 'Written by ASTRA LAB test\nline two' });
  const back = readSpk(u8);
  assert.equal(back.comment, 'Written by ASTRA LAB test\nline two');
  assert.equal(back.segments.length, 1); assert.equal(back.segments[0].type, 13); assert.equal(back.segments[0].target, -777);
  for (const i of [0, 50, 101, 200, 332]) { const st = stateRelative(back, -777, 399, S[i].t).state; for (let k = 0; k < 3; k++) assert.ok(Math.abs(st[k] * 1e3 - S[i].r[k]) < 1e-6); }
  // between nodes: compare with the exact circle (window 8 Hermite on 30 s steps is far below a millimetre)
  const mu = 3.986004418e14, a = 7.0e6, w = Math.sqrt(mu / a ** 3);
  for (const t of [7e8 + 15.5, 7e8 + 5000.25]) { const th = w * (t - 7e8); const st = stateRelative(back, -777, 399, t).state; assert.ok(Math.abs(st[0] * 1e3 - a * Math.cos(th)) < 1e-3, `${st[0] * 1e3 - a * Math.cos(th)}`); }
  // values CSPICE N0067 returned for this exact file (spkgeo), to 1e-9 km
  const cspice = [[700000015.5, 6999.02284154998, 116.95838346073414, 1.2319343631451836], [700005000.25, 4390.2124860792555, -5452.158685059873, 166.58163883489098]];
  for (const r of cspice) { const st = stateRelative(back, -777, 399, r[0]).state; for (let k = 0; k < 3; k++) assert.ok(Math.abs(st[k] - r[k + 1]) < 1e-8); }
  assert.throws(() => writeSpk13([S[1], S[0]]), /increase/);
});

test('SPK sampling: a kernel becomes an ephemeris the flight comparison can use', async () => {
  const S = circularOrbit(120, 60);
  const u8 = writeSpk13(S, { target: -5 });
  const smp = sampleSpk(readSpk(u8), { step: 10 });
  assert.equal(smp.target, -5); assert.equal(smp.center, 399); assert.ok(smp.samples.length > 500);
  const eph = await parseEphemerisBytes(u8, { step: 10 });
  assert.equal(eph.kind, 'spk'); assert.equal(eph.timeSystem, 'TDB');
  // TDB file times become mission-epoch (UTC) times: 69.18 s earlier in 2022
  assert.ok(Math.abs((S[0].t - eph.samples[0].t) - 69.184) < 0.01, `${S[0].t - eph.samples[0].t}`);
});

test('OEM: files written by the independent Python "oem" library (KVN and XML) read the same: 2 segments, 9 states, 1 covariance', () => {
  for (const [file, kind] of [['ccsds/python-oem-lib.oem', 'oem'], ['ccsds/python-oem-lib.xml', 'oem-xml']]) {
    const e = parseEphemeris(readFileSync(fx(file), 'utf8'));
    assert.equal(e.kind, kind); assert.equal(e.segments.length, 2); assert.equal(e.samples.length, 9); assert.equal(e.covariance.length, 1);
    assert.equal(e.covariance[0].frame, 'RTN'); assert.equal(e.covariance[0].cov.length, 21); assert.ok(Math.abs(e.covariance[0].cov[20] - 2.1e-5) < 1e-15);
    assert.deepEqual(e.samples[1].r, [7000001, 1000, -5000]);
    assert.equal(isoOf(e.samples[0].t), '2025-05-08T18:13:20');
  }
});

test('OEM: write and read back, KVN and XML, with accelerations, covariance and a TDB segment', () => {
  const mk = (t0, n) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 60.25, r: [7e6 + i, 1e3 * i, -5e3], v: [1, 7500 + i * 0.01, 2], a: [-8.1, 0.001 * i, 0] }));
  const cov = Array.from({ length: 21 }, (_, k) => (k + 1) * 1e-6);
  const segs = [{ object: 'SAT A', center: 'EARTH', frame: 'EME2000', timeSystem: 'UTC', samples: mk(8e8, 5), covariance: [{ t: 8e8 + 60.25, frame: 'RTN', cov }] },
    { object: 'SAT A', center: 'EARTH', frame: 'EME2000', timeSystem: 'TDB', samples: mk(8e8 + 301.25, 4) }];
  for (const text of [writeOEM(segs), writeOEMXml(segs)]) {
    const e = parseEphemeris(text);
    assert.equal(e.segments.length, 2); assert.equal(e.segments[1].timeSystem, 'TDB'); assert.equal(e.samples.length, 9);
    for (let i = 0; i < 9; i++) assert.ok(Math.abs(e.samples[i].t - [...segs[0].samples, ...segs[1].samples][i].t) < 2e-6, `time ${i}`);
    assert.ok(Math.abs(e.samples[2].r[0] - 7000002) < 1e-3);
    assert.deepEqual(e.covariance[0].cov.map((x) => +x.toPrecision(6)), cov.map((x) => +x.toPrecision(6)));
  }
  assert.ok(writeOEM(segs).includes('TIME_SYSTEM = TDB'));
  assert.throws(() => parseOEM('CCSDS_OEM_VERS = 2.0\nMETA_START\nOBJECT_NAME = X\nCENTER_NAME = EARTH\nREF_FRAME = EME2000\nTIME_SYSTEM = MARS_LOCAL\nMETA_STOP\n'), /not supported/);
  assert.throws(() => parseOEMXml('<!DOCTYPE x [<!ENTITY a "b">]><oem></oem>'), /DOCTYPE/);
});

test('OEM export of a recorded flight compares with itself to zero, in UTC and in TDB', () => {
  const S = circularOrbit(200, 10, true).map((s) => ({ ...s, t: s.t - 7e8 }));
  const cols = { t: S.map((s) => s.t), x: S.map((s) => s.r[0]), y: S.map((s) => s.r[1]), z: S.map((s) => s.r[2]), vx: S.map((s) => s.v[0]), vy: S.map((s) => s.v[1]), vz: S.map((s) => s.v[2]) };
  const tel = { count: S.length, column: (k) => cols[k] };
  const rec = { name: 'test', vehicleName: 'Probe', environment: { epoch: 8.1e8, body: 'earth' } };
  for (const timeSystem of ['UTC', 'TDB', 'GPS']) for (const format of ['kvn', 'xml']) {
    const ref = parseEphemeris(exportOEM(rec, tel, { timeSystem, format }));
    const cmp = compareEphemeris(samplesOf(tel), 8.1e8, ref);
    assert.ok(cmp && cmp.maxPosErrM < 0.01, `${timeSystem}/${format}: ${cmp?.maxPosErrM}`);
  }
});

test('SPK export of a recorded flight: the kernel places the vehicle where the flight was', async () => {
  const S = circularOrbit(200, 10, true).map((s) => ({ ...s, t: s.t - 7e8 }));
  const cols = { t: S.map((s) => s.t), x: S.map((s) => s.r[0]), y: S.map((s) => s.r[1]), z: S.map((s) => s.r[2]), vx: S.map((s) => s.v[0]), vy: S.map((s) => s.v[1]), vz: S.map((s) => s.v[2]) };
  const tel = { count: S.length, column: (k) => cols[k] };
  const rec = { id: 'run-1', vehicleName: 'Probe', environment: { epoch: 8.1e8, body: 'earth' } };
  const u8 = await exportSpk(rec, tel);
  const spk = readSpk(u8); assert.equal(spk.segments[0].center, 399); assert.match(spk.comment, /ASTRA LAB trajectory of Probe/);
  const ref = await parseEphemerisBytes(u8, { step: 5 });
  const cmp = compareEphemeris(samplesOf(tel), 8.1e8, ref);
  assert.ok(cmp.maxPosErrM < 0.01, `${cmp.maxPosErrM}`);
});

test('time systems: leap seconds, TT, TDB and GPS offsets', () => {
  const utc = parseTime('2026-01-01T00:00:00');
  assert.equal(taiMinusUtc(utc), 37); assert.equal(taiMinusUtc(parseTime('2016-06-01T00:00:00')), 36); assert.equal(taiMinusUtc(parseTime('1990-06-01T00:00:00')), 25);
  assert.ok(Math.abs(convertTime(utc, 'UTC', 'TT') - utc - 69.184) < 1e-6);
  assert.ok(Math.abs(convertTime(utc, 'UTC', 'GPS') - utc - 18) < 1e-6);
  assert.ok(Math.abs(convertTime(utc, 'UTC', 'TDB') - utc - 69.184) < 0.002);
  for (const ts of ['TAI', 'TT', 'TDB', 'GPS', 'UT1']) assert.ok(Math.abs(convertTime(convertTime(utc, 'UTC', ts), ts, 'UTC') - utc) < 1e-6, ts);
  assert.equal(convertTime(5, 'TDT', 'TT'), 5); assert.throws(() => convertTime(0, 'TCB', 'UTC'), /not supported/);
  assert.equal(isoOf(0.25), '2000-01-01T12:00:00.25'); assert.equal(isoOf(-0.000001), '2000-01-01T11:59:59.999999'); assert.equal(parseTime(isoOf(123.456789)), 123.456789);
});

test('Keplerian elements: state -> elements -> state round trip, and OPM written with elements reads from the elements alone', () => {
  const gm = 398600.4418;
  const el = { a: 7200, e: 0.012, i: 51.6, raan: 120, argp: 45, nu: 30 };
  const { r, v } = elementsToState(el, gm);
  const back = stateToElements(r, v, gm);
  for (const k of ['a', 'e', 'i', 'raan', 'argp', 'nu']) assert.ok(Math.abs(back[k] - el[k]) < 1e-7, `${k} ${back[k]}`);
  const state = { epoch: 7e8, r: r.map((x) => x * 1000), v: v.map((x) => x * 1000), mass: 1200 };
  const text = exportOPM({ vehicleName: 'Sat', environment: { body: 'earth' } }, state);
  assert.match(text, /SEMI_MAJOR_AXIS = 7200\.0000/);
  const onlyElements = text.split('\n').filter((l) => !/^[XYZ](_DOT)? =/.test(l)).join('\n');
  const o = parseOPM(onlyElements);
  assert.ok(o.elements); assert.equal(o.mass, 1200);
  for (let k = 0; k < 3; k++) { assert.ok(Math.abs(o.r[k] - state.r[k]) < 1e-2); assert.ok(Math.abs(o.v[k] - state.v[k]) < 1e-5); }
  // the mean anomaly form
  const m = elementsToState({ ...el, nu: undefined, M: 0 }, gm); assert.ok(Math.abs(Math.hypot(...m.r) - el.a * (1 - el.e)) < 1e-6);
});

test('OMM: CelesTrak JSON, KVN and XML give the same start state for a station-like orbit', () => {
  const json = JSON.stringify([{ OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2026-11-01T12:00:00.000000', MEAN_MOTION: 15.5, ECCENTRICITY: 0.0005, INCLINATION: 51.64, RA_OF_ASC_NODE: 200, ARG_OF_PERICENTER: 90, MEAN_ANOMALY: 10, NORAD_CAT_ID: 25544 }]);
  const kvn = ['CCSDS_OMM_VERS = 2.0', 'OBJECT_NAME = ISS (ZARYA)', 'CENTER_NAME = EARTH', 'REF_FRAME = TEME', 'TIME_SYSTEM = UTC', 'MEAN_ELEMENT_THEORY = SGP4', 'EPOCH = 2026-11-01T12:00:00.000000', 'MEAN_MOTION = 15.5 [rev/day]', 'ECCENTRICITY = 0.0005', 'INCLINATION = 51.64 [deg]', 'RA_OF_ASC_NODE = 200 [deg]', 'ARG_OF_PERICENTER = 90 [deg]', 'MEAN_ANOMALY = 10 [deg]'].join('\n');
  const xml = '<?xml version="1.0"?><omm id="CCSDS_OMM_VERS" version="2.0"><body><segment><metadata><OBJECT_NAME>ISS (ZARYA)</OBJECT_NAME><CENTER_NAME>EARTH</CENTER_NAME><REF_FRAME>TEME</REF_FRAME><TIME_SYSTEM>UTC</TIME_SYSTEM></metadata><data><meanElements><EPOCH>2026-11-01T12:00:00.000000</EPOCH><MEAN_MOTION>15.5</MEAN_MOTION><ECCENTRICITY>0.0005</ECCENTRICITY><INCLINATION>51.64</INCLINATION><RA_OF_ASC_NODE>200</RA_OF_ASC_NODE><ARG_OF_PERICENTER>90</ARG_OF_PERICENTER><MEAN_ANOMALY>10</MEAN_ANOMALY></meanElements></data></segment></body></omm>';
  const a = parseOMM(json), b = parseOrbitState(kvn), c = parseOrbitState(xml);
  assert.equal(a.kind, 'omm'); assert.equal(b.kind, 'omm'); assert.equal(c.kind, 'omm'); assert.equal(a.noradId, '25544');
  for (const o of [b, c]) for (let k = 0; k < 3; k++) assert.ok(Math.abs(o.r[k] - a.r[k]) < 1e-3);
  const alt = Math.hypot(...a.r) / 1000 - 6378.137; assert.ok(alt > 380 && alt < 440, `${alt}`);
  assert.equal(a.epoch, fileTimeToEpoch(parseTime('2026-11-01T12:00:00'), 'UTC'));
});
