// Single-axis attitude dynamics with real actuator limits: reaction wheel (torque and momentum saturation),
// RCS (thrust pulses, deadband, minimum impulse bit) and engine gimbal (thrust vector control).
// Rigid-body dynamics: PHYSICS. Actuator models: APPROXIMATION.
import { PID } from './pid.js';
import { Sensor } from '../sensors/sensor.js';

export const ACTUATORS = {
  'reaction-wheel': { maxTorque: 0.2, maxMomentum: 20 },
  'rcs': { thrust: 22, arm: 2, minOnTime: 0.014, deadband: 0.002 },
  'gimbal': { thrust: 45000, armToCg: 3, maxDeg: 6, rateDegS: 10 },
  'control-surface': { maxDeg: 20, dynamicPressure: 20000, area: 0.5, arm: 6, clAlpha: 3 },
};

export function attitudeManeuver({ inertia = 500, actuator = 'reaction-wheel', act = {}, gains = { kp: 20, ki: 0, kd: 200 }, targetDeg = 30, duration = 120, dt = 0.01, disturbance = 0, sensorNoise = true, seed = 5, sampleEvery = 0.1 } = {}) {
  const a = { ...ACTUATORS[actuator], ...act };
  const pid = new PID(gains);
  const gyro = new Sensor('gyro', { type: 'gyroscope', ...(sensorNoise ? {} : { noiseSd: 0, bias: 0, driftRate: 0 }) }, seed);
  const st = new Sensor('st', { type: 'starTracker', ...(sensorNoise ? {} : { noiseSd: 0, bias: 0, dropoutProb: 0 }) }, seed + 1);
  let th = 0, w = 0, h = 0, gimbal = 0, propUsed = 0, est = 0, rateMeas = 0, rcsOnTime = 0;
  const target = targetDeg * Math.PI / 180;
  const out = { t: [], angleDeg: [], rateDegS: [], commandTorque: [], appliedTorque: [], wheelMomentum: [], errorDeg: [], estimateErrorDeg: [] };
  let next = 0, saturations = 0, rcsDuty = 0;
  for (let t = 0; t <= duration; t += dt) {
    const g = gyro.update(t, w); if (g?.valid) rateMeas = g.value;
    est += rateMeas * dt; // propagate with gyro
    const s = st.update(t, th); if (s?.valid) est += 0.2 * (s.value - est); // star tracker correction (complementary filter)
    const c = pid.update(target, est, dt, rateMeas);
    let torque = 0;
    if (actuator === 'reaction-wheel') {
      torque = Math.max(-a.maxTorque, Math.min(a.maxTorque, c.out));
      if (Math.abs(h - torque * dt) > a.maxMomentum) { torque = 0; saturations++; }
      h -= torque * dt;
    } else if (actuator === 'rcs') {
      // pulse-width modulation: the on-time fraction matches the commanded torque on average,
      // pulses shorter than the minimum impulse bit are not fired, and a deadband stops chatter
      const err = target - est, maxT = a.thrust * a.arm;
      const inDeadband = Math.abs(err) < a.deadband && Math.abs(rateMeas) < 1e-3;
      if (inDeadband) rcsDuty = 0; else rcsDuty += Math.max(-1, Math.min(1, c.out / maxT)) * dt;
      const want = Math.abs(rcsDuty) >= Math.min(a.minOnTime, dt) ? Math.sign(rcsDuty) : 0;
      rcsDuty -= want * dt;
      torque = want * maxT;
      if (want) { rcsOnTime += dt; propUsed += a.thrust / (220 * 9.80665) * dt; }
    } else if (actuator === 'gimbal') {
      const cmd = Math.max(-a.maxDeg, Math.min(a.maxDeg, c.out / (a.thrust * a.armToCg) * 180 / Math.PI));
      const maxStep = a.rateDegS * dt;
      gimbal += Math.max(-maxStep, Math.min(maxStep, cmd - gimbal));
      torque = a.thrust * a.armToCg * Math.sin(gimbal * Math.PI / 180);
    } else if (actuator === 'control-surface') {
      const defl = Math.max(-a.maxDeg, Math.min(a.maxDeg, c.out / (a.dynamicPressure * a.area * a.arm * a.clAlpha) * 180 / Math.PI));
      torque = a.dynamicPressure * a.area * a.clAlpha * defl * Math.PI / 180 * a.arm;
    }
    const total = torque + disturbance;
    w += total / inertia * dt; th += w * dt;
    if (t >= next) {
      next += sampleEvery;
      out.t.push(t); out.angleDeg.push(th * 180 / Math.PI); out.rateDegS.push(w * 180 / Math.PI);
      out.commandTorque.push(c.out); out.appliedTorque.push(torque); out.wheelMomentum.push(h);
      out.errorDeg.push((target - th) * 180 / Math.PI); out.estimateErrorDeg.push((est - th) * 180 / Math.PI);
    }
  }
  const finalErr = Math.abs(out.errorDeg[out.errorDeg.length - 1]);
  return { series: out, summary: { finalErrorDeg: finalErr, wheelSaturations: saturations, rcsPropellantKg: propUsed, rcsOnTime, maxRateDegS: Math.max(...out.rateDegS.map(Math.abs)), achieved: finalErr < 0.5 } };
}
