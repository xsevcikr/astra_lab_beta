// Atmospheric entry integrator (planar, point mass with lift and drag, any body with an atmosphere).
//   dv/dt = -D/m - (mu/r^2) sin(g)           dh/dt = v sin(g)
//   dg/dt = (L/m)/v + (v/r - mu/(r^2 v)) cos(g)     ds/dt = v cos(g) R/r
// Heating: Sutton-Graves stagnation-point convective flux q = k sqrt(rho/Rn) v^3, integrated into a heat load [J/m^2].
// Not modelled (documented limits): radiative heating (matters above ~10 km/s for large vehicles), planet rotation, bank reversals.
import { getBody } from '../physics/bodies.js';
import { rk4Step, makeRk4Work } from '../physics/integrator.js';
import { G0 } from '../physics/constants.js';

/** Vehicle description: mass [kg], area [m^2], cd, ld (lift/drag), noseRadius [m]. */
export function ballisticCoefficient(c) { return c.mass / (c.cd * c.area); }

/**
 * Fly an entry. opts: {body, v, gammaDeg (negative = descending), alt (start altitude), vehicle, bank: 'up'|'down'|'ballistic',
 * stopAlt, dt, maxTime, sample}.
 */
export function flyEntry({ body = 'earth', v, gammaDeg, alt, vehicle, bank = 'up', stopAlt = 7300, dt = 0.1, maxTime = 20000, sample = 0 }) {
  const B = getBody(body);
  const atm = B.atmosphereModel;
  const R = B.radius, mu = B.mu;
  const k = B.heatingK ?? 1.7e-4;
  const startAlt = alt ?? B.entryInterface ?? atm.height;
  const m = vehicle.mass, cdA = vehicle.cd * vehicle.area, ld = vehicle.ld ?? 0, Rn = vehicle.noseRadius ?? 1;
  const liftSign = bank === 'up' ? 1 : bank === 'down' ? -1 : 0;
  // y = [r, v, gamma, s, heatLoad]
  const y = Float64Array.from([R + startAlt, v, (gammaDeg * Math.PI) / 180, 0, 0]);
  const work = makeRk4Work(5);
  const f = (t, s, d) => {
    const r = s[0], vv = Math.max(s[1], 1), g = s[2];
    const h = r - R;
    const rho = h < atm.height ? atm.query(Math.max(h, 0)).rho : 0;
    const D = 0.5 * rho * vv * vv * cdA, L = ld * D * liftSign;
    const grav = mu / (r * r);
    d[0] = vv * Math.sin(g);
    d[1] = -D / m - grav * Math.sin(g);
    d[2] = (L / m) / vv + (vv / r - grav / vv) * Math.cos(g);
    d[3] = vv * Math.cos(g) * R / r;
    d[4] = k * Math.sqrt(rho / Rn) * vv * vv * vv;
  };
  const res = { skipCount: 0, skipped: false, impacted: false, completed: false, peakG: 0, peakHeatFlux: 0, heatLoad: 0, minAlt: Infinity, tPeakG: 0, timeline: [] };
  const top = B.entryInterface ?? atm.height;
  let t = 0, dived = false, nextSample = 0, above = true;
  while (t < maxTime) {
    // coarse steps while the vehicle is above the sensible atmosphere, fine steps inside it
    const step = y[0] - R > top * 1.1 ? Math.max(dt, 2) : dt;
    rk4Step(f, t, y, step, work); t += step;
    const h = y[0] - R, vv = y[1];
    const rho = h < atm.height ? atm.query(Math.max(h, 0)).rho : 0;
    const D = 0.5 * rho * vv * vv * cdA;
    const gLoad = (D * Math.sqrt(1 + (ld * liftSign) ** 2)) / (m * G0);
    const q = k * Math.sqrt(rho / Rn) * vv ** 3;
    if (gLoad > res.peakG) { res.peakG = gLoad; res.tPeakG = t; }
    if (q > res.peakHeatFlux) res.peakHeatFlux = q;
    res.minAlt = Math.min(res.minAlt, h);
    if (sample && t >= nextSample) { res.timeline.push({ t, alt: h, v: vv, g: gLoad, q, heatLoad: y[4], gamma: (y[2] * 180) / Math.PI, range: y[3] }); nextSample += sample; }
    if (h < top * 0.9) dived = true;
    // leaving the atmosphere: a bound orbit comes back for a second pass (skip entry), an unbound one is lost
    if (dived && h > top && y[2] > 0 && above === false) {
      res.skipCount++; above = true;
      if (y[1] * y[1] / 2 - mu / y[0] >= 0) { res.skipped = true; break; }
    }
    if (h < top * 0.9) above = false;
    if (h <= 0) { res.impacted = true; break; }
    if (h <= stopAlt && y[2] < 0) { res.completed = true; break; }
  }
  if (!res.completed && !res.impacted && !res.skipped && y[0] - R > top) res.skipped = true; // never came back inside maxTime
  res.heatLoad = y[4]; res.time = t; res.altEnd = y[0] - R; res.vEnd = y[1]; res.range = y[3];
  const rhoEnd = atm.query(Math.max(res.altEnd, 0)).rho;
  res.qEnd = 0.5 * rhoEnd * res.vEnd ** 2; // dynamic pressure at the stop altitude (parachute deployment check)
  return res;
}

/**
 * Entry corridor: shallowest angle that does not skip out (flown lift-down, the best available control) and the steepest
 * angle that keeps peak g and heat load inside limits (flown lift-up is not assumed: the steep limit uses `bank`).
 * Angles are returned as positive "degrees below the horizon".
 */
export function entryCorridor({ body = 'earth', v, vehicle, limits, alt, scan = { from: 2, to: 16, step: 0.1 }, bankSteep = 'up' }) {
  let shallow = null, steep = null;
  for (let a = scan.from; a <= scan.to + 1e-9; a += scan.step) {
    const sh = flyEntry({ body, v, gammaDeg: -a, alt, vehicle, bank: 'down' });
    if (!sh.skipped) { shallow = a; break; }
  }
  for (let a = scan.to; a >= scan.from - 1e-9; a -= scan.step) {
    const r = flyEntry({ body, v, gammaDeg: -a, alt, vehicle, bank: bankSteep });
    if (!r.skipped && !r.impacted && r.peakG <= limits.maxG && r.heatLoad <= limits.maxHeatLoad && r.peakHeatFlux <= (limits.maxHeatFlux ?? Infinity)) { steep = a; break; }
  }
  return { shallow, steep, width: shallow != null && steep != null ? steep - shallow : null };
}
