// Mission risk dashboard: separate risk categories computed from margins, each with the evidence that drives it.
// No single blended score: each category stands on its own with its trend and explanation.
const level = (m, warn, crit) => (m === null || m === undefined || !Number.isFinite(m) ? 'UNKNOWN' : m < crit ? 'HIGH' : m < warn ? 'ELEVATED' : 'LOW');

export function riskDashboard(metrics = {}, extra = {}) {
  const pct = (x) => (x === undefined ? null : x * 100);
  const cats = [
    { id: 'propellant', label: 'Propellant margin', value: pct(Math.min(metrics['landing.propellantMarginFrac'] ?? Infinity, metrics['tei.propReserveFrac'] ?? Infinity)), unit: '%', warn: 8, crit: 3, why: 'Smallest of descent propellant at touchdown and service-module reserve after TEI.' },
    { id: 'thermal', label: 'Thermal margin', value: pct(metrics['entry.ablatorMarginFrac']), unit: '% ablator left', warn: 40, crit: 15, why: 'Heat-shield ablator remaining after entry.' },
    { id: 'structural', label: 'Structural margin', value: metrics['launch.minStructuralMargin'] !== undefined ? metrics['launch.minStructuralMargin'] * 100 : null, unit: '% margin of safety', warn: 25, crit: 0, why: 'Minimum margin of safety on launch structure at the 1.4 ultimate factor.' },
    { id: 'power', label: 'Power margin', value: pct(metrics['surface.minBatterySoc']), unit: '% minimum charge', warn: 40, crit: 20, why: 'Lowest battery state of charge during surface operations.' },
    { id: 'comms', label: 'Communication margin', value: metrics['comms.minLinkMarginDb'], unit: 'dB', warn: 6, crit: 3, why: 'Worst Earth link margin over coast and surface phases.' },
    { id: 'navigation', label: 'Navigation uncertainty', value: metrics['landing.error'] !== undefined ? 1000 - metrics['landing.error'] : null, unit: 'm inside 1 km box', warn: 500, crit: 100, why: 'Landing error against the 1 km requirement.' },
    { id: 'crew', label: 'Crew loads', value: metrics['crew.maxG'] !== undefined ? 10 - metrics['crew.maxG'] : null, unit: 'g below 10 g', warn: 2, crit: 0.5, why: 'Peak sustained acceleration over all phases.' },
    { id: 'landing', label: 'Landing risk', value: metrics['landing.touchdownVz'] !== undefined ? 3 - metrics['landing.touchdownVz'] : null, unit: 'm/s below 3 m/s', warn: 1, crit: 0.3, why: 'Touchdown vertical speed against the gear limit.' },
    { id: 'engine', label: 'Engine health', value: extra.engineHealth ?? null, unit: '% rated thrust', warn: 97, crit: 90, why: 'Measured thrust relative to rating from the test stand or flight data.' },
  ];
  for (const c of cats) c.level = level(c.value, c.warn, c.crit);
  if (extra.mc) {
    const p = extra.mc.successProbability;
    cats.push({ id: 'mission', label: 'Mission success probability', value: p.p * 100, unit: `% (95% CI ${(p.lo * 100).toFixed(1)}-${(p.hi * 100).toFixed(1)})`, warn: 97, crit: 90, why: `Monte Carlo over ${extra.mc.runs} runs; top failure mode: ${Object.entries(extra.mc.failureModes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none'}.`, level: level(p.lo * 100, 97, 90) });
  }
  return cats;
}

// Trend between two dashboards: explains which categories changed and by how much.
export function riskTrend(before, after) {
  return after.map((c) => { const b = before.find((x) => x.id === c.id); return { id: c.id, label: c.label, from: b?.value ?? null, to: c.value, levelFrom: b?.level, levelTo: c.level, change: b && c.value !== null && b.value !== null ? c.value - b.value : null }; }).filter((x) => x.change !== null && Math.abs(x.change) > 1e-6);
}
