// Communications: RF link budget (PHYSICS: Friis free-space loss, noise power), line of sight against bodies,
// light-time delay, packet loss vs margin (APPROXIMATION), command/data queues, ground station network.
import { C, K_BOLTZ, DEG } from '../core/constants.js';
import { sub, norm, dot, scale, add } from '../core/vec.js';
import { getBody } from '../core/bodies.js';

export const db = (x) => 10 * Math.log10(x);
export const dishGainDb = (diameter, freq, efficiency = 0.55) => db(efficiency * (Math.PI * diameter * freq / C) ** 2);
export const fsplDb = (distance, freq) => 20 * Math.log10(4 * Math.PI * distance * freq / C);
export const lightTime = (distance) => distance / C;

// tx: { powerW, gainDb, lossesDb, pointingErrorDeg, beamwidthDeg }, rx: { gainDb, systemNoiseTempK }
export function linkBudget(tx, rx, distance, freq, dataRate, requiredEbN0 = 2.5) {
  const pointingLoss = tx.beamwidthDeg ? 12 * ((tx.pointingErrorDeg || 0) / tx.beamwidthDeg) ** 2 : 0;
  const eirp = db(tx.powerW) + tx.gainDb - (tx.lossesDb || 0) - pointingLoss;
  const fspl = fsplDb(distance, freq);
  const gt = rx.gainDb - db(rx.systemNoiseTempK);
  const cn0 = eirp - fspl + gt - db(K_BOLTZ);
  const ebn0 = cn0 - db(dataRate);
  const margin = ebn0 - requiredEbN0;
  const maxRate = 10 ** ((cn0 - requiredEbN0 - 3) / 10); // rate that leaves a 3 dB margin
  return { eirp, fspl, gt, cn0, ebn0, margin, pointingLoss, maxRate, packetLoss: packetLossFromMargin(margin), delay: lightTime(distance) };
}
export function packetLossFromMargin(m) { return 1 / (1 + Math.exp(2.5 * (m + 0.5))); }

// Is the straight segment a->b clear of a sphere (center c, radius r)?
export function segmentClear(a, b, c, r) {
  const d = sub(b, a), f = sub(a, c);
  const t = Math.max(0, Math.min(1, -dot(f, d) / dot(d, d)));
  return norm(add(f, scale(d, t))) > r;
}

export const DEFAULT_GROUND_STATIONS = [
  { id: 'gds', name: 'Goldstone', lat: 35.43, lon: -116.89, dish: 34, freq: 8.4e9, systemNoiseTempK: 30, availability: 0.9, trackingAccuracy: 1, deepSpace: true },
  { id: 'mad', name: 'Madrid', lat: 40.43, lon: -4.25, dish: 34, freq: 8.4e9, systemNoiseTempK: 30, availability: 0.9, trackingAccuracy: 1, deepSpace: true },
  { id: 'cbr', name: 'Canberra', lat: -35.40, lon: 148.98, dish: 34, freq: 8.4e9, systemNoiseTempK: 30, availability: 0.9, trackingAccuracy: 1, deepSpace: true },
  { id: 'ksc', name: 'Cape Canaveral', lat: 28.52, lon: -80.65, dish: 9, freq: 2.2e9, systemNoiseTempK: 150, availability: 0.98, trackingAccuracy: 5 },
  { id: 'kir', name: 'Kiruna', lat: 67.86, lon: 20.96, dish: 13, freq: 2.2e9, systemNoiseTempK: 120, availability: 0.95, trackingAccuracy: 5 },
];

// Earth-fixed station to inertial (equatorial frame, rotation angle theta = omega*t + theta0)
export function stationPosition(st, t, bodyId = 'earth', theta0 = 0) {
  const b = getBody(bodyId);
  const lon = st.lon * DEG + b.rotationRate * t + theta0, lat = st.lat * DEG, r = b.radius + (st.alt || 0);
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}
export function elevationDeg(stPos, scPos) {
  const los = sub(scPos, stPos);
  return Math.asin(dot(los, stPos) / (norm(los) * norm(stPos))) / DEG;
}

// Network access: for each station, is the spacecraft visible above the mask and clear of occulting bodies?
// occulters: [{center, radius}] in the same frame (e.g. Moon when the spacecraft is behind it).
export function networkAccess(stations, scPos, t, { bodyId = 'earth', theta0 = 0, mask = 10, occulters = [], tx, dataRate = 1e4 } = {}) {
  return stations.map((st) => {
    const p = stationPosition(st, t, bodyId, theta0);
    const el = elevationDeg(p, scPos);
    const blocked = occulters.some((o) => !segmentClear(p, scPos, o.center, o.radius));
    const dist = norm(sub(scPos, p));
    const visible = el >= mask && !blocked && dist <= (st.maxRange ?? Infinity);
    const link = visible && tx ? linkBudget(tx, { gainDb: dishGainDb(st.dish, st.freq), systemNoiseTempK: st.systemNoiseTempK }, dist, st.freq, dataRate) : null;
    return { id: st.id, name: st.name, elevation: el, distance: dist, visible, blocked, link };
  });
}

// Command and telemetry link with light-time delay and packet loss. Nothing reaches the spacecraft early.
export class DelayedLink {
  constructor(rng) { this.rng = rng; this.uplink = []; this.downlink = []; this.stats = { sent: 0, delivered: 0, lost: 0 }; }
  send(dir, t, payload, delay, packetLoss = 0) {
    this.stats.sent++;
    if (this.rng && this.rng.next() < packetLoss) { this.stats.lost++; return null; }
    const msg = { sentAt: t, arrivesAt: t + delay, payload };
    this[dir].push(msg);
    return msg;
  }
  receive(dir, t) {
    const due = this[dir].filter((m) => m.arrivesAt <= t);
    this[dir] = this[dir].filter((m) => m.arrivesAt > t);
    this.stats.delivered += due.length;
    return due;
  }
}

// Onboard data storage: generation fills the recorder, downlink drains it when a link is available.
export function dataQueueStep(q, dt, { generationBps, downlinkBps, linkUp }) {
  q.bits = Math.max(0, Math.min(q.capacityBits, q.bits + generationBps * dt - (linkUp ? downlinkBps * dt : 0)));
  if (q.bits >= q.capacityBits) q.overflowBits = (q.overflowBits || 0) + generationBps * dt;
  return q;
}
