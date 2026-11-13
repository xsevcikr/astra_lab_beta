// Transfer-burn optimisers (impulsive, patched-conic level, same assumptions as physics/mission-design.js).
//
//   optimiseOrbitTransfer ... circular orbit -> circular orbit with an inclination change: Hohmann with the best split of the
//                             plane change between the two burns, against a bi-elliptic transfer whose intermediate apoapsis and
//                             three-way plane-change split are optimised (plane changes are cheap far from the planet).
//   optimiseInterplanetary .. departure date and flight time that minimise departure C3, departure delta-v or total delta-v:
//                             a porkchop grid of Lambert solutions on the ephemeris, refined by Nelder-Mead from the best cells.
import { getBody } from '../../physics/bodies.js';
import { circularSpeed, visViva, hohmann, orbitalPeriod } from '../../physics/orbital.js';
import { combinedBurnDv, planeChangeOptions, interplanetaryTransfer, epochToDate } from '../../physics/mission-design.js';
import { DEG } from '../../physics/constants.js';
import { nelderMead } from './methods.js';

const DAY = 86400;

/** Delta-v of a bi-elliptic transfer r1 -> rb -> r2 with the plane change split x1, x2, x3 [rad] between its three burns. */
export function biellipticDv(mu, r1, r2, rb, x1 = 0, x2 = 0, x3 = 0) {
  const a1 = (r1 + rb) / 2, a2 = (rb + r2) / 2;
  const b1 = combinedBurnDv(circularSpeed(mu, r1), visViva(mu, r1, a1), x1);
  const b2 = combinedBurnDv(visViva(mu, rb, a1), visViva(mu, rb, a2), x2);
  const b3 = combinedBurnDv(visViva(mu, r2, a2), circularSpeed(mu, r2), x3);
  return { dv: b1 + b2 + b3, burns: [b1, b2, b3], tof: orbitalPeriod(mu, a1) / 2 + orbitalPeriod(mu, a2) / 2 };
}

const biNote = (extra) => (extra < 0.5 ? 'A bi-elliptic route gives no saving here (its best form collapses into this Hohmann transfer).' : `A bi-elliptic route would need ${extra.toFixed(0)} m/s more.`);

/**
 * @param body    central body id (default earth)
 * @param alt1    start circular orbit altitude [m]
 * @param alt2    target circular orbit altitude [m]
 * @param dIncDeg inclination change [deg]
 * @param rbMaxFactor largest intermediate apoapsis searched, as a multiple of the larger orbit radius (also capped by the sphere of influence)
 */
export function optimiseOrbitTransfer({ body = 'earth', alt1 = 300e3, alt2 = 35786e3, dIncDeg = 0, rbMaxFactor = 40 } = {}) {
  const B = getBody(body);
  const mu = B.mu, r1 = B.radius + alt1, r2 = B.radius + alt2, dInc = Math.abs(dIncDeg) * DEG;
  const rLo = Math.max(r1, r2);
  const soi = B.soiRadius ?? B.soi ?? Infinity;
  const rHi = Math.max(rLo * 1.0001, Math.min(rLo * rbMaxFactor, 0.9 * soi));
  const P = planeChangeOptions(mu, r1, r2, dInc);
  const H = hohmann(mu, r1, r2);
  // Bi-elliptic: variables log(rb), share of the turn in burn 1, share of the rest in burn 2 (stick breaking keeps the sum = dInc)
  const vars = [{ id: 'logRb', min: Math.log(rLo), max: Math.log(rHi) }, { id: 's1', min: 0, max: 1 }, { id: 's2', min: 0, max: 1 }];
  const split = (x) => { const x1 = dInc * x[1], x2 = (dInc - x1) * x[2]; return [x1, x2, dInc - x1 - x2]; };
  const cost = (x) => biellipticDv(mu, r1, r2, Math.exp(x[0]), ...split(x)).dv;
  // multi-start: the bi-elliptic optimum often sits on the rb bound, so start at both ends and the middle
  let be = null;
  for (const s of [0.05, 0.5, 0.95]) for (const t of [0.05, 0.9]) {
    const r = nelderMead(cost, vars, [vars[0].min + s * (vars[0].max - vars[0].min), 0.05, t], { maxEvaluations: 600, tolX: 1e-9 });
    if (!be || r.f < be.f) be = r;
  }
  const rb = Math.exp(be.x[0]), turns = split(be.x), bi = biellipticDv(mu, r1, r2, rb, ...turns);
  const options = [
    { id: 'separate', label: 'Hohmann, then a separate plane change at the higher orbit', dv: P.separate, tof: H.tof, burns: 3 },
    { id: 'hohmann-first', label: 'Hohmann, whole plane change in the first burn', dv: P.atFirst, tof: H.tof, burns: 2 },
    { id: 'hohmann-second', label: 'Hohmann, whole plane change in the second burn', dv: P.atSecond, tof: H.tof, burns: 2 },
    { id: 'hohmann-split', label: 'Hohmann, plane change split optimally between both burns', dv: P.bestSplit, tof: H.tof, burns: 2, split: [P.bestSplitAngle / DEG, (dInc - P.bestSplitAngle) / DEG] },
    { id: 'bielliptic', label: rb < rLo * 1.005 ? 'Bi-elliptic (its best form is the Hohmann transfer here)' : 'Bi-elliptic, intermediate apoapsis and plane-change split optimised', degenerate: rb < rLo * 1.005, dv: bi.dv, tof: bi.tof, burns: 3, rb, rbAltitude: rb - B.radius, split: turns.map((t) => t / DEG), burnDvs: bi.burns, atBound: rb > rHi * 0.98 },
  ];
  if (dInc === 0) options.splice(0, 3);   // without a plane change the three Hohmann variants are the same transfer
  // a bi-elliptic whose apoapsis collapses onto the target orbit IS the Hohmann transfer: only count it as better when it saves > 0.5 m/s
  const best = options.reduce((a, b) => (b.dv < a.dv - (b.id === 'bielliptic' ? 0.5 : 1e-9) ? b : a));
  const hohBest = options.find((o) => o.id === 'hohmann-split');
  const explain = best.id === 'bielliptic'
    ? `The bi-elliptic transfer saves ${(hohBest.dv - best.dv).toFixed(0)} m/s over the best Hohmann but takes ${(best.tof / 3600).toFixed(1)} h instead of ${(hohBest.tof / 3600).toFixed(1)} h. It climbs to ${((best.rbAltitude) / 1000).toFixed(0)} km, ${dInc > 0 ? 'where the orbit is slow and turning the plane is cheap' : 'so the final braking burns happen where the orbit is slow'}.${best.atBound ? ' The best apoapsis is at the search limit, so going even higher would save a little more.' : ''}${body === 'earth' && best.rb > 3e8 ? ' Above about 300 000 km the Moon disturbs the orbit, so a real mission would need to plan around it.' : ''}`
    : dInc > 0 ? `Splitting the ${dIncDeg.toFixed(1)} deg turn between the two Hohmann burns (${hohBest.split[0].toFixed(2)} deg at the first, ${hohBest.split[1].toFixed(2)} deg at the second) is cheapest. ${biNote(options.find((o) => o.id === 'bielliptic').dv - best.dv)}`
    : `A plain Hohmann transfer is cheapest. Bi-elliptic transfers only win when the radius ratio is above about 11.9 (here it is ${(Math.max(r1, r2) / Math.min(r1, r2)).toFixed(2)}).`;
  return { body, mu, r1, r2, dIncDeg, radiusRatio: Math.max(r1, r2) / Math.min(r1, r2), options, best, explain, searchRange: { rbMin: rLo, rbMax: rHi },
    note: 'Impulsive burns between circular orbits; finite-burn (gravity) losses and the time spent waiting for a node crossing are not included.' };
}

/**
 * Porkchop optimisation of an interplanetary departure.
 * @param cost 'c3' (launch energy), 'departure' (burn from the parking orbit) or 'total' (departure + circular capture)
 * @returns { best (interplanetaryTransfer result + cost), grid: {t0s, tofs, values}, starts, evaluations }
 */
export function optimiseInterplanetary({ from = 'earth', to = 'mars', startT, spanDays = 800, tofMinDays = 90, tofMaxDays = 450, gridDays = 5, cost = 'total', parkFrom = 200e3, parkTo = 300e3, seeds = 4 } = {}) {
  const key = cost === 'c3' ? 'c3' : cost === 'departure' ? 'dvDeparture' : 'dvTotal';
  const evalAt = (t0, tof) => {
    const tr = interplanetaryTransfer({ from, to, t0, tof, parkFrom, parkTo });
    return tr && Number.isFinite(tr[key]) ? tr : null;
  };
  const t0s = [], tofs = [];
  for (let d = 0; d <= spanDays; d += gridDays) t0s.push(startT + d * DAY);
  for (let d = tofMinDays; d <= tofMaxDays; d += gridDays) tofs.push(d * DAY);
  const values = t0s.map((t0) => tofs.map((tof) => { const tr = evalAt(t0, tof); return tr ? tr[key] : null; }));
  let evaluations = t0s.length * tofs.length;
  // seeds: the best cells that are local minima of their 3x3 neighbourhood, at least 60 days apart
  const cells = [];
  for (let i = 0; i < t0s.length; i++) for (let j = 0; j < tofs.length; j++) {
    const v = values[i][j]; if (v == null) continue;
    let isMin = true;
    for (let di = -1; di <= 1 && isMin; di++) for (let dj = -1; dj <= 1; dj++) { const w = values[i + di]?.[j + dj]; if ((di || dj) && w != null && w < v) { isMin = false; break; } }
    if (isMin) cells.push({ i, j, v });
  }
  cells.sort((a, b) => a.v - b.v);
  const starts = [];
  for (const c of cells) { if (starts.length >= seeds) break; if (starts.every((s) => Math.abs(t0s[s.i] - t0s[c.i]) > 60 * DAY)) starts.push(c); }
  const vars = [{ id: 't0', min: startT, max: startT + spanDays * DAY }, { id: 'tof', min: tofMinDays * DAY, max: tofMaxDays * DAY }];
  const f = (x) => { const tr = evalAt(x[0], x[1]); return tr ? tr[key] : 1e12; };
  let best = null;
  const refined = [];
  for (const s of starts) {
    const r = nelderMead(f, vars, [t0s[s.i], tofs[s.j]], { step: (2 * gridDays) / Math.max(spanDays, tofMaxDays - tofMinDays), maxEvaluations: 300, tolX: 1e-7 });
    evaluations += r.evaluations;
    const tr = evalAt(r.x[0], r.x[1]);
    if (!tr) continue;
    const item = { ...tr, cost: tr[key], gridCost: s.v };
    refined.push(item);
    if (!best || item.cost < best.cost) best = item;
  }
  refined.sort((a, b) => a.t0 - b.t0);
  // an optimum on the edge of the date range means the real minimum is probably outside it (the window is passing or still to come)
  const edge = best ? (best.t0 - startT < 1.5 * gridDays * DAY ? 'start' : startT + spanDays * DAY - best.t0 < 1.5 * gridDays * DAY ? 'end' : null) : null;
  if (best) best.atEdge = edge;
  return { from, to, cost, costKey: key, best, windows: refined, grid: { t0s, tofs, values }, evaluations,
    explain: best ? `Best ${cost === 'c3' ? 'launch energy' : cost === 'departure' ? 'departure burn' : 'total delta-v'}: leave ${epochToDate(best.t0).toISOString().slice(0, 10)}, arrive after ${(best.tof / DAY).toFixed(0)} days. Departure C3 ${(best.c3 / 1e6).toFixed(2)} km²/s², departure burn ${best.dvDeparture.toFixed(0)} m/s, capture burn ${best.dvArrivalCircular.toFixed(0)} m/s.${edge === 'start' ? ' This is the very first day searched: the cheapest window has probably just passed, so a later window may be the real choice (look at the other rows or search further ahead).' : edge === 'end' ? ' This is the last day searched: the window is still coming, so search a longer range.' : ''}` : 'No transfer was found in this date range.',
    note: 'Lambert arcs between Keplerian planet positions; impulsive burns from and into circular parking orbits.' };
}
