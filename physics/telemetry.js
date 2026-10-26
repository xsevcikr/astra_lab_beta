// Columnar telemetry storage with bounded memory (in-place decimation) and interpolation for replay.
import { qSlerp } from './vec.js';

/** id, label, unit, group. All values are SI in storage; UI converts units. */
export const CHANNELS = [
  ['t', 'Mission time', 's', 'time'],
  ['alt', 'Altitude', 'm', 'kinematics'], ['radarAlt', 'Radar altitude', 'm', 'kinematics'],
  ['speed', 'Orbital speed', 'm/s', 'kinematics'], ['surfSpeed', 'Airspeed', 'm/s', 'kinematics'],
  ['vSpeed', 'Vertical speed', 'm/s', 'kinematics'], ['hSpeed', 'Horizontal speed', 'm/s', 'kinematics'],
  ['accel', 'Acceleration (proper)', 'm/s2', 'kinematics'], ['gload', 'G-load', 'g', 'kinematics'],
  ['mass', 'Mass', 'kg', 'mass'], ['propMass', 'Propellant', 'kg', 'mass'], ['propFrac', 'Propellant fraction', '', 'mass'],
  ['thrust', 'Thrust', 'N', 'propulsion'], ['twr', 'Thrust / weight', '', 'propulsion'], ['throttle', 'Throttle', '', 'propulsion'],
  ['gimbal', 'Gimbal angle', 'deg', 'propulsion'],
  ['mach', 'Mach number', '', 'aero'], ['q', 'Dynamic pressure', 'Pa', 'aero'], ['aoa', 'Angle of attack', 'deg', 'aero'],
  ['drag', 'Drag', 'N', 'aero'], ['lift', 'Lift (normal force)', 'N', 'aero'], ['rho', 'Air density', 'kg/m3', 'aero'],
  ['apo', 'Apoapsis altitude', 'm', 'orbit'], ['peri', 'Periapsis altitude', 'm', 'orbit'], ['ecc', 'Eccentricity', '', 'orbit'],
  ['incl', 'Inclination', 'deg', 'orbit'], ['sma', 'Semi-major axis', 'm', 'orbit'], ['period', 'Orbital period', 's', 'orbit'],
  ['energy', 'Specific orbital energy', 'J/kg', 'orbit'], ['hmom', 'Specific angular momentum', 'm2/s', 'orbit'],
  ['tempLead', 'Nose skin temperature', 'K', 'thermal'], ['tempBody', 'Body temperature', 'K', 'thermal'], ['heatFlux', 'Stagnation heat flux', 'W/m2', 'thermal'],
  ['powerGen', 'Power generation', 'W', 'power'], ['powerUse', 'Power consumption', 'W', 'power'], ['battery', 'Battery energy', 'Wh', 'power'], ['batteryFrac', 'Battery charge', '', 'power'],
  ['commMargin', 'Link margin', 'dB', 'comms'], ['commLink', 'Link closed', '', 'comms'], ['commRange', 'Range to ground', 'm', 'comms'], ['data', 'Data stored', 'bit', 'comms'],
  ['lat', 'Latitude', 'deg', 'position'], ['lon', 'Longitude', 'deg', 'position'], ['downrange', 'Downrange distance', 'm', 'position'],
  ['x', 'Position X', 'm', 'position'], ['y', 'Position Y', 'm', 'position'], ['z', 'Position Z', 'm', 'position'],
  ['vx', 'Velocity X', 'm/s', 'position'], ['vy', 'Velocity Y', 'm/s', 'position'], ['vz', 'Velocity Z', 'm/s', 'position'],
  ['qw', 'Attitude qw', '', 'orientation'], ['qx', 'Attitude qx', '', 'orientation'], ['qy', 'Attitude qy', '', 'orientation'], ['qz', 'Attitude qz', '', 'orientation'],
  ['wx', 'Body rate X', 'rad/s', 'orientation'], ['wy', 'Body rate Y', 'rad/s', 'orientation'], ['wz', 'Body rate Z', 'rad/s', 'orientation'],
  ['attErr', 'Attitude error', 'deg', 'orientation'], ['pitch', 'Pitch above horizon', 'deg', 'orientation'],
  ['dvIdeal', 'Delta-v delivered', 'm/s', 'budget'], ['dvGrav', 'Gravity loss', 'm/s', 'budget'], ['dvDrag', 'Drag loss', 'm/s', 'budget'], ['dvSteer', 'Steering loss', 'm/s', 'budget'],
  ['structRatio', 'Structural load ratio', '', 'structure'], ['thermRatio', 'Thermal limit ratio', '', 'thermal'],
  ['stage', 'Stages separated', '', 'events'], ['primary', 'Primary body index', '', 'events'],
  ['groundSpeed', 'Ground speed (rover)', 'm/s', 'rover'], ['odometer', 'Distance driven', 'm', 'rover'], ['slip', 'Wheel slip', '', 'rover'], ['terrainSlope', 'Terrain slope along path', 'deg', 'rover'],
  ['sloshN', 'Slosh force on the tanks', 'N', 'structure'], ['flexAmp', 'Bending of the structure (tail sideways)', 'm', 'structure'], ['bank', 'Bank angle (lifting entry)', 'deg', 'aero'],
  ['sideSlope', 'Side slope', 'deg', 'rover'], ['heading', 'Heading', 'deg', 'rover'], ['drivePower', 'Drive power', 'W', 'rover'], ['tipMargin', 'Rollover margin', '', 'rover'], ['sunElev', 'Sun elevation', 'deg', 'environment'], ['surfTemp', 'Surface temperature', 'K', 'environment'],
];
export const CHANNEL_INDEX = Object.fromEntries(CHANNELS.map((c, i) => [c[0], i]));
export const CHANNEL_META = Object.fromEntries(CHANNELS.map((c) => [c[0], { id: c[0], label: c[1], unit: c[2], group: c[3] }]));
const N = CHANNELS.length;

export class TelemetryRecorder {
  constructor({ maxSamples = 20000 } = {}) {
    this.maxSamples = maxSamples;
    this.cap = 1024;
    this.cols = CHANNELS.map(() => new Float64Array(this.cap));
    this.count = 0;
    this.lastT = -Infinity;
    this.decimation = 1; // how many times the store has been halved
  }
  _grow() {
    this.cap *= 2;
    this.cols = this.cols.map((a) => { const b = new Float64Array(this.cap); b.set(a); return b; });
  }
  /** Append a sample. `values` is an object keyed by channel id. */
  push(values, force = false) {
    if (this.count >= this.cap) this._grow();
    const i = this.count;
    for (let c = 0; c < N; c++) {
      const v = values[CHANNELS[c][0]];
      this.cols[c][i] = v === undefined || v === null || Number.isNaN(v) ? 0 : v;
    }
    this.count++;
    this.lastT = values.t;
    if (this.count >= this.maxSamples) this._decimate();
  }
  _decimate() {
    const keep = Math.ceil(this.count / 2);
    for (const col of this.cols) for (let i = 0; i < keep; i++) col[i] = col[Math.min(i * 2, this.count - 1)];
    // always retain the very last sample
    const lastIdx = this.count - 1;
    for (const col of this.cols) col[keep - 1] = col[lastIdx];
    this.count = keep; this.decimation++;
  }
  get minInterval() { return this.decimation; }
  column(id) { return this.cols[CHANNEL_INDEX[id]].subarray(0, this.count); }
  times() { return this.column('t'); }
  row(i) {
    const o = {};
    for (let c = 0; c < N; c++) o[CHANNELS[c][0]] = this.cols[c][i];
    return o;
  }
  /** Binary search index of last sample with t <= time. */
  indexAt(time) {
    const t = this.cols[0];
    let lo = 0, hi = this.count - 1;
    if (hi < 0) return -1;
    if (time <= t[0]) return 0;
    if (time >= t[hi]) return hi;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= time) lo = mid; else hi = mid; }
    return lo;
  }
  /** Interpolated state at an arbitrary time (linear; quaternion slerp). */
  sample(time) {
    if (this.count === 0) return null;
    const i = this.indexAt(time);
    if (i >= this.count - 1) return this.row(this.count - 1);
    const a = this.row(i), b = this.row(i + 1);
    const f = (time - a.t) / Math.max(b.t - a.t, 1e-12);
    const o = {};
    for (const [id] of CHANNELS) o[id] = a[id] + (b[id] - a[id]) * f;
    const qs = qSlerp([a.qw, a.qx, a.qy, a.qz], [b.qw, b.qx, b.qy, b.qz], f);
    o.qw = qs[0]; o.qx = qs[1]; o.qy = qs[2]; o.qz = qs[3];
    for (const k of ['stage', 'primary', 'commLink']) o[k] = a[k];
    o.t = time;
    return o;
  }
  /** Export JSON-serialisable columns (regular arrays), optionally with only certain channels. */
  toColumns(ids) {
    const out = {};
    for (const [id] of CHANNELS) if (!ids || ids.includes(id)) out[id] = Array.from(this.column(id));
    return out;
  }
  /** Compact binary (Float32) blob: header JSON + columns. Suitable for gzip. */
  toBinary() {
    const header = JSON.stringify({ magic: 'ASTRA-TLM', version: 1, count: this.count, channels: CHANNELS.map((c) => c[0]), decimation: this.decimation });
    const hb = new TextEncoder().encode(header);
    const pad = (4 - ((4 + hb.length) % 4)) % 4;
    const bytes = new Uint8Array(4 + hb.length + pad + this.count * N * 8);
    new DataView(bytes.buffer).setUint32(0, hb.length + pad, true);
    bytes.set(hb, 4);
    for (let i = 0; i < pad; i++) bytes[4 + hb.length + i] = 32;
    const f64 = new Float64Array(bytes.buffer, 4 + hb.length + pad, this.count * N);
    for (let c = 0; c < N; c++) f64.set(this.cols[c].subarray(0, this.count), c * this.count);
    return bytes;
  }
  static fromBinary(bytes) {
    const hl = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + hl)));
    if (header.magic !== 'ASTRA-TLM') throw new Error('Not an ASTRA telemetry file');
    const rec = new TelemetryRecorder({ maxSamples: Math.max(header.count + 1, 20000) });
    rec.cap = Math.max(header.count, 1024);
    rec.cols = CHANNELS.map(() => new Float64Array(rec.cap));
    const off = bytes.byteOffset + 4 + hl;
    const f64 = new Float64Array(bytes.buffer.slice(off, off + header.count * header.channels.length * 8));
    header.channels.forEach((id, c) => { const idx = CHANNEL_INDEX[id]; if (idx !== undefined) rec.cols[idx].set(f64.subarray(c * header.count, (c + 1) * header.count)); });
    rec.count = header.count; rec.decimation = header.decimation ?? 1;
    rec.lastT = header.count ? rec.cols[0][header.count - 1] : -Infinity;
    return rec;
  }
  toCSV(ids) {
    const use = (ids && ids.length ? ids : CHANNELS.map((c) => c[0]));
    const lines = [use.map((id) => `${id} [${CHANNEL_META[id].unit}]`).join(',')];
    for (let i = 0; i < this.count; i++) lines.push(use.map((id) => { const v = this.cols[CHANNEL_INDEX[id]][i]; return Number.isInteger(v) ? v : v.toPrecision(9); }).join(','));
    return lines.join('\n');
  }
}
