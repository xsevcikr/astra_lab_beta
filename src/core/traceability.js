// Requirements traceability (2.9): mission need -> requirements -> the parts of the vehicle each one is allocated to -> how it is verified
// -> the evidence (which recorded run, which telemetry channel, at what time) -> status, plus coverage gaps, change impact between two
// runs and exchange files (CSV, Markdown, ReqIF 1.2 for DOORS / Polarion / Jama / Capella).
//
// The requirements themselves are the checklist of src/core/requirements.js (defaults + the user's limits + custom ones); nothing here
// invents a verdict: every status comes from evaluateRequirements on a recorded run.
import { requirementText, CUSTOM_METRICS } from './requirements.js';

/** NASA SE Handbook verification methods. Simulated flights count as Test (T); values computed from the design count as Analysis (A). */
export const METHODS = { T: 'Test (simulated flight)', A: 'Analysis', I: 'Inspection', D: 'Demonstration' };

const k = (c) => String(c.kind ?? '');
const has = (f) => (c) => c[f] != null;
/** Per metric: subsystem, verification method, the parts it is allocated to, and the "shall" sentence. */
export const TRACE_RULES = {
  status: { subsystem: 'System', method: 'T', parts: () => false, whole: true, shall: () => 'The mission shall reach its goal.', why: 'the whole vehicle' },
  orbit: { subsystem: 'GNC', method: 'T', parts: (c) => /guidance|avionics|computer|engine/.test(k(c)), shall: (r) => `The final orbit shall be ${requirementText(r)}.`, why: 'guidance and the engines it steers' },
  twr: { subsystem: 'Propulsion', method: 'T', parts: (c) => k(c) === 'engine', shall: (r) => `Liftoff thrust-to-weight shall be ${requirementText(r)}.`, why: 'engines (thrust) against the stack weight' },
  maxQ: { subsystem: 'Structures', method: 'T', parts: (c) => c.maxQ != null && c.mount !== 'internal', shall: (r) => `Peak dynamic pressure shall be ${requirementText(r)}.`, why: 'exposed parts with a dynamic-pressure rating' },
  structRatio: { subsystem: 'Structures', method: 'T', parts: (c) => c.maxQAlpha != null || c.maxAccelG != null || c.maxQ != null, shall: (r) => `Peak structural load shall be ${requirementText(r)} (share of the limit).`, why: 'parts with a load rating' },
  maxG: { subsystem: 'Structures', method: 'T', parts: has('maxAccelG'), shall: (r) => `Peak acceleration shall be ${requirementText(r)}.`, why: 'parts with a g rating' },
  payload: { subsystem: 'System', method: 'T', parts: (c) => k(c) === 'payload' || c.group === 'payload', shall: (r) => `The delivered payload shall be ${requirementText(r)}.`, why: 'payload parts' },
  dvMargin: { subsystem: 'Propulsion', method: 'A', parts: (c) => /engine|tank/.test(k(c)), shall: (r) => `The delta-v margin at the end of the flight shall be ${requirementText(r)}.`, why: 'engines (Isp) and tanks (propellant)' },
  thermRatio: { subsystem: 'Thermal', method: 'T', parts: (c) => c.tMax != null || c.tMin != null || /heater|mli|radiator|heat_shield/.test(k(c)), shall: (r) => `Every part temperature shall stay inside its range (ratio ${requirementText(r)}).`, why: 'parts with a temperature range and the thermal hardware' },
  maxTemp: { subsystem: 'Thermal', method: 'T', parts: (c) => /nose|heat_shield|fairing/.test(k(c)), shall: (r) => `Peak nose temperature shall be ${requirementText(r)}.`, why: 'nose, fairing and heat shield' },
  landingV: { subsystem: 'GNC', method: 'T', parts: (c) => /landing_legs|engine|guidance|parachute/.test(k(c)), shall: (r) => `Touchdown vertical speed shall be ${requirementText(r)}.`, why: 'legs, descent engine, guidance, parachutes' },
  landingH: { subsystem: 'GNC', method: 'T', parts: (c) => /landing_legs|guidance|rcs/.test(k(c)), shall: (r) => `Touchdown sideways speed shall be ${requirementText(r)}.`, why: 'legs, guidance and RCS' },
  slip: { subsystem: 'Mobility', method: 'T', parts: (c) => /wheel|rover_chassis|motor/.test(k(c)), shall: (r) => `Wheel slip shall be ${requirementText(r)}.`, why: 'wheels, motors and chassis' },
  distance: { subsystem: 'Mobility', method: 'T', parts: (c) => /wheel|rover_chassis|motor|battery|solar_panel/.test(k(c)), shall: (r) => `The rover shall drive ${requirementText(r)}.`, why: 'mobility and power' },
  battery: { subsystem: 'Power', method: 'T', parts: (c) => /battery|solar_panel|fuel_cell/.test(k(c)), shall: (r) => `Battery charge shall stay ${requirementText(r)}.`, why: 'batteries and power sources' },
};

const reqId = (r) => `REQ-${String(r.id).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
const MISSION_ID = 'MN-1';
function missionNeed(record) {
  const o = record?.mission?.objective ?? {}, name = record?.mission?.name ?? 'the mission';
  const goal = o.type === 'orbit' ? `deliver its payload to a ${Math.round((o.altitude ?? 0) / 1000)} km orbit` : o.type === 'landing' ? `land safely${o.body ? ` on the ${o.body}` : ''}` : o.type === 'traverse' ? `drive ${Math.round(o.distance ?? 0)} m` : 'meet its objective';
  return { id: MISSION_ID, level: 1, text: `${record?.vehicle?.name ?? 'The vehicle'} shall ${goal} (${name}).`, source: 'Mission objective in the Planner' };
}

/**
 * Build the trace for one run. reqs = the requirement list (requirementsFor), rows = evaluateRequirements(...) for this run,
 * record = the run record, history = optional [{runId, name, created, fingerprint, rows}] for other runs of the same vehicle.
 */
export function buildTrace({ reqs, rows, record, history = [] }) {
  const comps = record?.vehicle?.components ?? [];
  const need = missionNeed(record);
  const items = reqs.map((r) => {
    const rule = TRACE_RULES[r.metric] ?? { subsystem: 'System', method: 'T', parts: () => false, shall: (x) => `${x.label} shall be ${requirementText(x)}.`, why: '' };
    const row = rows.find((x) => x.id === r.id);
    let method = rule.method;
    if (r.metric === 'twr' && row && /from the design/.test(row.valueText ?? '')) method = 'A';
    const allocated = comps.filter((c) => { try { return rule.parts(c); } catch { return false; } }).map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
    const verdict = row?.verdict ?? 'N/A';
    const status = r.enabled === false ? 'WAIVED' : verdict === 'PASS' ? 'VERIFIED' : verdict === 'FAIL' ? 'FAILED' : 'NOT VERIFIED';
    const hist = history.map((h) => ({ runId: h.runId, name: h.name, created: h.created, verdict: h.rows.find((x) => x.id === r.id)?.verdict ?? 'N/A' }));
    return {
      id: reqId(r), key: r.id, parent: MISSION_ID, level: 2, text: rule.shall(r), label: r.label, subsystem: rule.subsystem, method, methodName: METHODS[method],
      source: r.auto ? 'ASTRA LAB default (editable)' : 'Added by the user', limit: requirementText(r), allocated, wholeVehicle: !!rule.whole, allocationRule: rule.why,
      evidence: row && (verdict === 'PASS' || verdict === 'FAIL') ? { runId: record?.id ?? null, runName: record?.name ?? null, measured: row.valueText, margin: row.marginText, channel: row.evidence?.channel ?? null, t: row.evidence?.t ?? null } : null,
      verdict, status, history: hist,
    };
  });
  const traced = new Set(items.flatMap((i) => i.allocated.map((a) => a.id)));
  const orphans = comps.filter((c) => !traced.has(c.id)).map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const active = items.filter((i) => i.status !== 'WAIVED');
  return {
    need, items,
    configuration: { runId: record?.id ?? null, runName: record?.name ?? null, created: record?.created ?? null, vehicle: record?.vehicle?.name ?? null, inputsFingerprint: record?.fingerprint?.inputs ?? null, resultsFingerprint: record?.fingerprint?.results ?? null },
    coverage: {
      requirements: active.length, verified: active.filter((i) => i.status === 'VERIFIED').length, failed: active.filter((i) => i.status === 'FAILED').length,
      notVerified: active.filter((i) => i.status === 'NOT VERIFIED').map((i) => i.id), waived: items.length - active.length,
      unallocated: active.filter((i) => !i.allocated.length && !i.wholeVehicle).map((i) => i.id),
      components: comps.length, componentsTraced: comps.length - orphans.length, orphans,
      byMethod: Object.fromEntries(Object.keys(METHODS).map((m) => [m, active.filter((i) => i.method === m).length])),
      bySubsystem: active.reduce((acc, i) => { (acc[i.subsystem] ??= { total: 0, verified: 0 }).total++; if (i.status === 'VERIFIED') acc[i.subsystem].verified++; return acc; }, {}),
    },
  };
}

// ------------------------------------------------------------------------------------------------ change impact
const stable = (o) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))));
/**
 * Which requirements must be checked again after going from run A's inputs to run B's: parts added, removed or changed, and mission or
 * environment changes. Returns {changes: [{what, id?, name?, detail}], retest: [{id, reason}], unaffected: [id]}.
 */
export function changeImpact(recordA, recordB, reqs) {
  const ca = new Map((recordA?.vehicle?.components ?? []).map((c) => [c.id, c])), cb = new Map((recordB?.vehicle?.components ?? []).map((c) => [c.id, c]));
  const changes = [], changed = [];
  for (const [id, c] of cb) {
    const old = ca.get(id);
    if (!old) { changes.push({ what: 'part added', id, name: c.name }); changed.push(c); }
    else if (stable(old) !== stable(c)) {
      const fields = [...new Set([...Object.keys(old), ...Object.keys(c)])].filter((f) => JSON.stringify(old[f]) !== JSON.stringify(c[f]));
      changes.push({ what: 'part changed', id, name: c.name, detail: fields.slice(0, 6).join(', ') }); changed.push(c);
    }
  }
  for (const [id, c] of ca) if (!cb.has(id)) { changes.push({ what: 'part removed', id, name: c.name }); changed.push(c); }
  if (JSON.stringify(recordA?.vehicle?.stages ?? []) !== JSON.stringify(recordB?.vehicle?.stages ?? [])) changes.push({ what: 'staging changed' });
  const missionChanged = JSON.stringify(recordA?.mission?.objective ?? null) !== JSON.stringify(recordB?.mission?.objective ?? null) || JSON.stringify(recordA?.mission?.guidance ?? null) !== JSON.stringify(recordB?.mission?.guidance ?? null);
  const envChanged = JSON.stringify(recordA?.environment ?? null) !== JSON.stringify(recordB?.environment ?? null);
  if (missionChanged) changes.push({ what: 'mission changed', detail: 'objective or guidance' });
  if (envChanged) changes.push({ what: 'environment changed', detail: 'site, weather, epoch or body' });
  const staging = changes.some((c) => c.what === 'staging changed');
  const retest = [], unaffected = [];
  for (const r of reqs) {
    const rule = TRACE_RULES[r.metric]; const id = reqId(r);
    const hit = rule ? changed.filter((c) => { try { return rule.parts(c); } catch { return false; } }) : [];
    let reason = null;
    if (r.metric === 'status' && changes.length) reason = 'system-level requirement: any change';
    else if (hit.length) reason = `allocated to changed part${hit.length > 1 ? 's' : ''} ${hit.slice(0, 3).map((c) => c.name).join(', ')}${hit.length > 3 ? ` and ${hit.length - 3} more` : ''}`;
    else if (changed.some((c) => c.mass !== undefined) && ['twr', 'dvMargin', 'payload', 'orbit', 'maxG'].includes(r.metric) && changed.length) reason = 'depends on the total mass, which changed';
    else if (staging && ['dvMargin', 'orbit', 'maxG', 'structRatio'].includes(r.metric)) reason = 'staging changed';
    else if (missionChanged && ['orbit', 'payload', 'dvMargin', 'distance', 'landingV', 'landingH'].includes(r.metric)) reason = 'mission objective or guidance changed';
    else if (envChanged && ['maxQ', 'structRatio', 'thermRatio', 'maxTemp', 'orbit', 'twr', 'battery'].includes(r.metric)) reason = 'environment changed';
    if (reason) retest.push({ id, key: r.id, reason }); else unaffected.push(id);
  }
  return { changes, retest, unaffected };
}

// ------------------------------------------------------------------------------------------------ exchange files
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };
/** Requirements traceability matrix as CSV (one row per requirement). */
export function traceToCSV(trace) {
  const head = ['ID', 'Parent', 'Requirement', 'Subsystem', 'Verification method', 'Allocated to', 'Status', 'Measured', 'Margin', 'Evidence run', 'Evidence channel', 'Evidence time [s]', 'Runs passed', 'Runs failed', 'Source'];
  const L = [head.join(',')];
  L.push([trace.need.id, '', trace.need.text, 'System', '', '', '', '', '', '', '', '', '', '', trace.need.source].map(csvCell).join(','));
  for (const i of trace.items) {
    L.push([i.id, i.parent, i.text, i.subsystem, i.methodName, (i.wholeVehicle ? 'whole vehicle' : i.allocated.map((a) => a.name).join('; ')), i.status, i.evidence?.measured ?? '', i.evidence?.margin ?? '', i.evidence?.runName ?? '', i.evidence?.channel ?? '', i.evidence?.t != null ? i.evidence.t.toFixed(1) : '',
      i.history.filter((h) => h.verdict === 'PASS').length, i.history.filter((h) => h.verdict === 'FAIL').length, i.source].map(csvCell).join(','));
  }
  return `${L.join('\r\n')}\r\n`;
}
/** The same as Markdown (for a design review document). */
export function traceToMarkdown(trace) {
  const c = trace.coverage, e = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const L = [`# Requirements traceability: ${e(trace.configuration.vehicle)}`, '',
    `Run: ${e(trace.configuration.runName)} (${e(trace.configuration.runId)})${trace.configuration.inputsFingerprint ? `, input fingerprint \`${trace.configuration.inputsFingerprint}\`` : ''}.`, '',
    `**${trace.need.id}** ${e(trace.need.text)}`, '',
    `Coverage: ${c.verified} of ${c.requirements} verified, ${c.failed} failed, ${c.notVerified.length} not verified, ${c.waived} waived. ${c.componentsTraced} of ${c.components} parts trace to a requirement.`, '',
    '| ID | Requirement | Subsystem | Method | Allocated to | Status | Evidence |', '|---|---|---|---|---|---|---|'];
  for (const i of trace.items) L.push(`| ${i.id} | ${e(i.text)} | ${i.subsystem} | ${i.method} | ${e(i.wholeVehicle ? 'whole vehicle' : i.allocated.map((a) => a.name).join(', ') || '-')} | ${i.status} | ${e(i.evidence ? `${i.evidence.measured}${i.evidence.channel ? ` (${i.evidence.channel} at T+${Math.round(i.evidence.t ?? 0)} s)` : ''}` : '-')} |`);
  if (c.orphans.length) L.push('', `Parts with no requirement: ${c.orphans.map((o) => e(o.name)).join(', ')}.`);
  return `${L.join('\n')}\n`;
}

const xa = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * ReqIF 1.2 (OMG) export: one SPEC-OBJECT per requirement with ID, text, subsystem, method, allocation and status attributes, and a
 * specification tree mission need -> requirements. Opens in IBM DOORS Next, Polarion, Jama, Capella and the Eclipse ReqIF Studio.
 */
export function traceToReqIF(trace, { now = new Date().toISOString(), tool = 'ASTRA LAB' } = {}) {
  const uid = (s) => `_${String(s).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const attrs = ['ID', 'Text', 'Subsystem', 'Method', 'AllocatedTo', 'Status', 'Evidence'];
  const objs = [{ id: trace.need.id, vals: [trace.need.id, trace.need.text, 'System', '', '', '', ''] }, ...trace.items.map((i) => ({ id: i.id, vals: [i.id, i.text, i.subsystem, i.methodName, i.wholeVehicle ? 'whole vehicle' : i.allocated.map((a) => a.name).join('; '), i.status, i.evidence ? `${i.evidence.measured} (run ${i.evidence.runName ?? i.evidence.runId})` : ''] }))];
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">',
    `  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="${uid(`hdr-${trace.configuration.runId ?? 'run'}`)}"><CREATION-TIME>${xa(now)}</CREATION-TIME><REQ-IF-TOOL-ID>${xa(tool)}</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>${xa(tool)}</SOURCE-TOOL-ID><TITLE>${xa(`Requirements: ${trace.configuration.vehicle ?? ''}`)}</TITLE></REQ-IF-HEADER></THE-HEADER>`,
    '  <CORE-CONTENT><REQ-IF-CONTENT>',
    `    <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="_dt_string" LAST-CHANGE="${xa(now)}" LONG-NAME="String" MAX-LENGTH="4000"/></DATATYPES>`,
    `    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="_type_req" LAST-CHANGE="${xa(now)}" LONG-NAME="Requirement"><SPEC-ATTRIBUTES>`,
    ...attrs.map((a) => `      <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="_attr_${a}" LAST-CHANGE="${xa(now)}" LONG-NAME="${a === 'Text' ? 'ReqIF.Text' : a === 'ID' ? 'ReqIF.ForeignID' : a}"><TYPE><DATATYPE-DEFINITION-STRING-REF>_dt_string</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>`),
    `    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE><SPECIFICATION-TYPE IDENTIFIER="_type_spec" LAST-CHANGE="${xa(now)}" LONG-NAME="Requirements specification"/></SPEC-TYPES>`,
    '    <SPEC-OBJECTS>'];
  for (const o of objs) {
    L.push(`      <SPEC-OBJECT IDENTIFIER="${uid(o.id)}" LAST-CHANGE="${xa(now)}" LONG-NAME="${xa(o.id)}"><TYPE><SPEC-OBJECT-TYPE-REF>_type_req</SPEC-OBJECT-TYPE-REF></TYPE><VALUES>`);
    attrs.forEach((a, j) => L.push(`        <ATTRIBUTE-VALUE-STRING THE-VALUE="${xa(o.vals[j])}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>_attr_${a}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`));
    L.push('      </VALUES></SPEC-OBJECT>');
  }
  L.push('    </SPEC-OBJECTS>', '    <SPECIFICATIONS>',
    `      <SPECIFICATION IDENTIFIER="_spec_1" LAST-CHANGE="${xa(now)}" LONG-NAME="${xa(`Requirements: ${trace.configuration.vehicle ?? ''}`)}"><TYPE><SPECIFICATION-TYPE-REF>_type_spec</SPECIFICATION-TYPE-REF></TYPE><CHILDREN>`,
    `        <SPEC-HIERARCHY IDENTIFIER="_h_${uid(trace.need.id).slice(1)}" LAST-CHANGE="${xa(now)}"><OBJECT><SPEC-OBJECT-REF>${uid(trace.need.id)}</SPEC-OBJECT-REF></OBJECT><CHILDREN>`,
    ...trace.items.map((i) => `          <SPEC-HIERARCHY IDENTIFIER="_h_${uid(i.id).slice(1)}" LAST-CHANGE="${xa(now)}"><OBJECT><SPEC-OBJECT-REF>${uid(i.id)}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>`),
    '        </CHILDREN></SPEC-HIERARCHY>', '      </CHILDREN></SPECIFICATION>', '    </SPECIFICATIONS>', '  </REQ-IF-CONTENT></CORE-CONTENT>', '</REQ-IF>');
  return `${L.join('\n')}\n`;
}

// ------------------------------------------------------------------------------------------------ import
function splitCsvLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map((s) => s.trim());
}
/**
 * Requirements from a spreadsheet (CSV with a header row; comma or semicolon). Columns (case-insensitive): id, metric, op ('<=', '>=',
 * 'at most', 'at least'), limit (in the unit the app shows: kPa, g, kg, K, m/s, m, %), label, enabled. A row whose id matches a default
 * requirement changes that requirement's limit; other rows must name a metric from CUSTOM_METRICS and become custom requirements.
 * Returns {overrides: {id: {limit, enabled?}}, custom: [...], skipped: [{line, reason}]}.
 */
export function parseRequirementsCSV(text, defaults = []) {
  const lines = String(text ?? '').replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('The file needs a header row and at least one requirement.');
  if (lines.length > 2000) throw new Error('Too many rows (2000 at most).');
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (name) => head.indexOf(name);
  if (col('limit') < 0 || (col('id') < 0 && col('metric') < 0)) throw new Error('The header must have a "limit" column and an "id" or "metric" column.');
  const byId = new Map(defaults.map((d) => [String(d.id).toLowerCase(), d]));
  const overrides = {}, custom = [], skipped = [];
  lines.slice(1).forEach((ln, n) => {
    const c = splitCsvLine(ln, sep), get = (name) => (col(name) >= 0 ? c[col(name)] : '');
    const lim = parseFloat(String(get('limit')).replace(',', '.'));
    if (!Number.isFinite(lim)) { skipped.push({ line: n + 2, reason: 'no number in "limit"' }); return; }
    const en = String(get('enabled')).toLowerCase(); const enabled = en === '' ? undefined : !/^(0|no|false|off)$/.test(en);
    const id = String(get('id')).replace(/^REQ-/i, '').toLowerCase();
    const def = byId.get(id);
    if (def) {
      const scale = def.scale ?? 1;
      overrides[def.id] = def.op === 'range' ? { tol: lim / 100 } : { limit: lim / scale };
      if (enabled !== undefined) overrides[def.id].enabled = enabled;
      return;
    }
    const metric = get('metric'); const m = CUSTOM_METRICS[metric];
    if (!m) { skipped.push({ line: n + 2, reason: `unknown metric "${metric || id}" (use ${Object.keys(CUSTOM_METRICS).join(', ')})` }); return; }
    const opRaw = String(get('op')).toLowerCase(); const op = /<|most|max|below/.test(opRaw) ? '<=' : />|least|min|above/.test(opRaw) ? '>=' : m.op;
    custom.push({ id: `c${(id || metric).replace(/[^\w-]/g, '').slice(0, 20)}${n}`, metric, op, limit: lim / m.scale, label: get('label') || m.label, ...(enabled === false ? { enabled: false } : {}) });
  });
  return { overrides, custom, skipped };
}
