// Prints the validation tables as Markdown (used to write documentation/VALIDATION.md). Usage: node scripts/validation-report.mjs [vehicle-id]
import { VALIDATION_VEHICLES, runValidationFlight, summariseRows } from '../src/core/validation.js';

const nf = (v, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
function fmt(unit, v) {
  if (v == null || !Number.isFinite(v)) return '-';
  if (unit === 's') return `${nf(v, 1)} s`;
  if (unit === 'm') return Math.abs(v) >= 1000 ? `${nf(v / 1000, 1)} km` : `${nf(v)} m`;
  if (unit === 'N') return Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 2)} MN` : `${nf(v / 1e3, 1)} kN`;
  if (unit === 'kg') return `${nf(v)} kg`;
  if (unit === 'm/s') return `${nf(v)} m/s`;
  return `${nf(v, 1)} ${unit}`;
}
const only = process.argv[2];
for (const V of VALIDATION_VEHICLES) {
  if (only && V.id !== only) continue;
  const r = runValidationFlight(V.id);
  const s = summariseRows(r.rows);
  console.log(`\n### ${V.name}\n`);
  console.log(`Result: ${r.sim.result.status} - ${r.sim.result.reason}. Orbit ${fmt('m', r.metrics.orbitPeri)} x ${fmt('m', r.metrics.orbitApo)}. ${s.pass} of ${s.total} graded rows within their band, ${s.fail} outside.\n`);
  console.log('| What | Published | Simulated | Error | Band | Result |\n|---|---|---|---|---|---|');
  for (const x of r.rows) {
    const err = x.err == null ? '-' : `${x.err >= 0 ? '+' : ''}${(x.err * 100).toFixed(1)}%`;
    console.log(`| ${x.label} | ${fmt(x.unit, x.value)} | ${fmt(x.unit, x.sim)} | ${err} | ${x.tol == null ? '-' : '+/-' + Math.round(x.tol * 100) + '%'} | ${x.status === 'pass' ? 'pass' : x.status === 'fail' ? '**FAIL**' : x.status} |`);
  }
}
