// Navigation filters. A linear Kalman filter for position/velocity per axis, driven by accelerometer input and
// corrected by position-type measurements (GNSS, radar altimeter, ground tracking). PHYSICS of the estimator;
// the error models feeding it come from the sensor module.
export class KalmanPV {
  constructor({ pos = 0, vel = 0, posSd = 100, velSd = 5, accelNoiseSd = 0.05 } = {}) {
    this.x = [pos, vel];
    this.P = [[posSd * posSd, 0], [0, velSd * velSd]];
    this.q = accelNoiseSd * accelNoiseSd;
    this.nis = [];
  }
  predict(accel, dt) {
    const [p, v] = this.x;
    this.x = [p + v * dt + 0.5 * accel * dt * dt, v + accel * dt];
    const [[a, b], [c, d]] = this.P, q = this.q;
    // P = F P F' + G q G', F = [[1,dt],[0,1]], G = [dt^2/2, dt]
    const a2 = a + dt * (b + c) + dt * dt * d, b2 = b + dt * d, c2 = c + dt * d, d2 = d;
    this.P = [[a2 + q * dt ** 4 / 4, b2 + q * dt ** 3 / 2], [c2 + q * dt ** 3 / 2, d2 + q * dt * dt]];
  }
  // H = [1, 0] for position, [0, 1] for velocity measurements
  update(z, sd, which = 'pos', gate = 5) {
    const i = which === 'pos' ? 0 : 1;
    const S = this.P[i][i] + sd * sd;
    const r = z - this.x[i];
    const nis = r * r / S;
    if (Math.sqrt(nis) > gate) return { accepted: false, residual: r, nis }; // innovation gate rejects outliers
    const K = [this.P[0][i] / S, this.P[1][i] / S];
    this.x = [this.x[0] + K[0] * r, this.x[1] + K[1] * r];
    const P = this.P;
    this.P = [[P[0][0] - K[0] * P[i][0], P[0][1] - K[0] * P[i][1]], [P[1][0] - K[1] * P[i][0], P[1][1] - K[1] * P[i][1]]];
    this.nis.push(nis);
    return { accepted: true, residual: r, nis };
  }
  get sigma() { return [Math.sqrt(this.P[0][0]), Math.sqrt(this.P[1][1])]; }
}

// Navigation sources and their typical availability (used by the GNC lab to explain what works where).
export const NAV_SOURCES = {
  gnss: { name: 'GNSS', bodies: ['earth'], maxAltitude: 3.0e7, posSd: 3, note: 'Only near Earth; signals from the GNSS constellation.' },
  inertial: { name: 'Inertial (IMU)', bodies: ['*'], note: 'Always available; error grows with time from bias and drift.' },
  starTracker: { name: 'Star tracker', bodies: ['*'], note: 'Attitude only; blinded by the Sun or a bright limb.' },
  radarAltimeter: { name: 'Radar altimeter', bodies: ['*'], maxAltitude: 15000, note: 'Altitude above local terrain, below ~15 km.' },
  landingRadar: { name: 'Landing radar (velocimeter)', bodies: ['*'], maxAltitude: 8000, note: 'Three-axis velocity relative to the surface.' },
  opticalNav: { name: 'Optical navigation', bodies: ['*'], note: 'Position from landmarks or limb images; seconds of latency.' },
  groundTracking: { name: 'Ground tracking (range/Doppler)', bodies: ['*'], note: 'Needs line of sight to a ground station; light-time delayed.' },
  celestial: { name: 'Celestial navigation', bodies: ['*'], note: 'Star-horizon sightings; slow, kilometre-level accuracy.' },
};

// Demonstration: inertial-only vs inertial + aiding on a 1-D trajectory with a given accelerometer error model.
export function navigationExperiment({ duration = 600, dt = 0.1, accelBias = 0.002, accelNoise = 0.02, aid = 'gnss', aidSd = 3, aidRate = 1, seed = 11, trueAccel = (t) => 0.5 * Math.sin(t / 60) } = {}, rngFactory) {
  const rng = rngFactory ? rngFactory(seed) : null;
  const normal = rng ? rng.normal : ((s = seed) => () => { s = (s * 16807) % 2147483647; return ((s / 2147483647) - 0.5) * 3.4641; })();
  let p = 0, v = 0, pIns = 0, vIns = 0;
  const kf = new KalmanPV({ posSd: 10, velSd: 1, accelNoiseSd: accelNoise + accelBias });
  const out = { t: [], truePos: [], insError: [], kfError: [], kf3Sigma: [] };
  let nextAid = 0;
  for (let t = 0; t <= duration; t += dt) {
    const a = trueAccel(t);
    const meas = a + accelBias + (rng ? rng.normal(0, accelNoise) : normal() * accelNoise);
    p += v * dt + 0.5 * a * dt * dt; v += a * dt;
    pIns += vIns * dt + 0.5 * meas * dt * dt; vIns += meas * dt;
    kf.predict(meas, dt);
    if (aid !== 'none' && t >= nextAid) { nextAid += 1 / aidRate; kf.update(p + (rng ? rng.normal(0, aidSd) : normal() * aidSd), aidSd); }
    out.t.push(t); out.truePos.push(p); out.insError.push(pIns - p); out.kfError.push(kf.x[0] - p); out.kf3Sigma.push(3 * kf.sigma[0]);
  }
  return out;
}
