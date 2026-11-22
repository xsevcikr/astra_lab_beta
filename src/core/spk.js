// Binary SPICE ephemeris kernels (SPK, a DAF file) without the SPICE toolkit (2.9).
//
// Reads:  SPK segment types 2 and 3 (Chebyshev, used by JPL DE planetary ephemerides), 8 and 12 (equally spaced Lagrange / Hermite)
//         and 9 and 13 (unequally spaced Lagrange / Hermite, used by most spacecraft trajectory kernels), little- or big-endian.
//         Segments are chained through their centres, so "Moon relative to Earth" works from a DE kernel that stores the Moon and
//         the Earth relative to the Earth-Moon barycentre.
// Writes: one type 13 segment (Hermite, positions and velocities at the recorded times), little-endian, with a comment area that
//         says what wrote it. The file opens in CSPICE / SpiceyPy / GMAT / Cosmographia like any SPK.
//
// Units: SPK stores km, km/s and TDB seconds past J2000 ("ET"). This module returns the same units; callers convert.
// Checked against CSPICE N0067 (SpiceyPy): tests/spk.test.js reads kernels CSPICE wrote, and CSPICE read the kernels written here.

export const NAIF_BODY = { 0: 'SOLAR SYSTEM BARYCENTER', 3: 'EARTH BARYCENTER', 4: 'MARS BARYCENTER', 10: 'SUN', 199: 'MERCURY', 299: 'VENUS', 301: 'MOON', 399: 'EARTH', 499: 'MARS' };
export const NAIF_ID = { earth: 399, moon: 301, mars: 499, sun: 10, emb: 3, ssb: 0 };
export const NAIF_FRAME = { 1: 'J2000', 17: 'ECLIPJ2000' };
const RECORD = 1024;
const FTPSTR = [70, 84, 80, 83, 84, 82, 58, 13, 58, 10, 58, 13, 10, 58, 13, 0, 58, 129, 58, 16, 206, 58, 69, 78, 68, 70, 84, 80]; // "FTPSTR:\r:\n:\r\n:\r\0:\x81:\x10\xce:ENDFTP"
export const SUPPORTED_TYPES = [2, 3, 8, 9, 12, 13];

const ascii = (u8, off, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[off + i]); return s; };
function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('An SPK file must be read as bytes, not text.');
}

/** True when the bytes start like a DAF/SPK file. */
export function isSpk(input) {
  try { const u8 = toBytes(input); return u8.length >= RECORD && /^DAF\/SPK |^NAIF\/DAF/.test(ascii(u8, 0, 8)); } catch { return false; }
}

/**
 * Parse an SPK file. Returns {comment, idword, littleEndian, segments:[{name, target, center, frame, type, start, stop, ...}]}
 * where start/stop are TDB seconds past J2000. Each segment can be evaluated with stateOfSegment(seg, et).
 */
export function readSpk(input) {
  const u8 = toBytes(input);
  if (u8.length < RECORD) throw new Error('The file is too short to be an SPK kernel.');
  const idword = ascii(u8, 0, 8);
  if (!/^DAF\/SPK |^NAIF\/DAF/.test(idword)) throw new Error(`This is not an SPK kernel (it starts with "${idword.trim()}"; DAF/SPK expected).`);
  const fmt = ascii(u8, 88, 8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let le = fmt === 'LTL-IEEE' ? true : fmt === 'BIG-IEEE' ? false : null;
  if (le === null) le = dv.getInt32(8, true) === 2; // very old files have no format word: guess from ND
  const ND = dv.getInt32(8, le), NI = dv.getInt32(12, le), FWARD = dv.getInt32(76, le);
  if (ND !== 2 || NI !== 6) throw new Error(`Unexpected DAF layout (ND=${ND}, NI=${NI}); an SPK has ND=2, NI=6.`);
  if (FTPSTR.some((b, i) => u8[699 + i] !== b) && fmt !== '        ' && u8[699] !== 0) throw new Error('The file was damaged in transfer (FTP check failed): copy it again in binary mode.');
  const dbl = (addr) => dv.getFloat64((addr - 1) * 8, le); // DAF addresses count 8-byte words from 1
  const SS = ND + Math.floor((NI + 1) / 2), NC = 8 * SS;
  // comment area: records 2 .. FWARD-1
  let comment = '';
  if (FWARD > 2) { const raw = ascii(u8, RECORD, (FWARD - 2) * RECORD); const eot = raw.indexOf('\u0004'); comment = (eot >= 0 ? raw.slice(0, eot) : raw).replace(/\0/g, '\n').replace(/\n+$/, ''); }
  const segments = []; let rec = FWARD, guard = 0;
  while (rec > 0 && guard++ < 100000) {
    const base = (rec - 1) * RECORD; if (base + RECORD > u8.length) throw new Error('The SPK summary chain points past the end of the file (truncated file?).');
    const next = dv.getFloat64(base, le), nsum = dv.getFloat64(base + 16, le);
    for (let k = 0; k < nsum; k++) {
      const off = base + 24 + k * SS * 8;
      const start = dv.getFloat64(off, le), stop = dv.getFloat64(off + 8, le);
      const ints = []; for (let j = 0; j < NI; j++) ints.push(dv.getInt32(off + 16 + 4 * j, le));
      const name = ascii(u8, base + RECORD + k * NC, NC).replace(/\0/g, ' ').trim();
      const [target, center, frame, type, begin, end] = ints;
      if (end * 8 > u8.length) throw new Error(`Segment "${name}" points past the end of the file (truncated file?).`);
      segments.push(prepareSegment({ name, target, center, frame, type, start, stop, begin, end }, dbl));
    }
    rec = next;
  }
  return { idword, littleEndian: le, comment, segments };
}

function prepareSegment(s, dbl) {
  const seg = { ...s, targetName: NAIF_BODY[s.target] ?? String(s.target), centerName: NAIF_BODY[s.center] ?? String(s.center), frameName: NAIF_FRAME[s.frame] ?? `frame ${s.frame}`, supported: SUPPORTED_TYPES.includes(s.type) };
  if (!seg.supported) return seg;
  const { begin, end } = s;
  const word = (i) => dbl(begin + i); // 0-based inside the segment
  const len = end - begin + 1;
  if (s.type === 2 || s.type === 3) {
    const init = dbl(end - 3), intlen = dbl(end - 2), rsize = dbl(end - 1), n = dbl(end);
    const ncomp = s.type === 2 ? 3 : 6;
    seg.cheb = { init, intlen, rsize, n, ncoef: (rsize - 2) / ncomp, ncomp, word };
  } else if (s.type === 8 || s.type === 12) {
    const start = dbl(end - 3), step = dbl(end - 2), w = dbl(end - 1), n = dbl(end);
    seg.equal = { start, step, window: w + 1, n, word };
  } else {
    const w = dbl(end - 1), n = dbl(end);
    const ndir = Math.floor((n - 1) / 100);
    if (6 * n + n + ndir + 2 !== len) throw new Error(`Segment "${s.name}" (type ${s.type}) has an inconsistent size.`);
    const epochs = new Float64Array(n); for (let i = 0; i < n; i++) epochs[i] = word(6 * n + i);
    seg.unequal = { window: w + 1, n, epochs, word };
  }
  return seg;
}

// ------------------------------------------------------------------------------------------------ evaluation
/** Chebyshev series value and derivative (Clenshaw), x in [-1, 1]. */
function chebyshev(c, off, n, x) {
  let b1 = 0, b2 = 0, d1 = 0, d2 = 0;
  for (let k = n - 1; k >= 1; k--) { const b0 = 2 * x * b1 - b2 + c(off + k); const dd = 2 * x * d1 - d2 + 2 * b1; b2 = b1; b1 = b0; d2 = d1; d1 = dd; }
  return [x * b1 - b2 + c(off), x * d1 - d2 + b1];
}
function lagrange(xs, ys, x) {
  const n = xs.length; let sum = 0;
  for (let i = 0; i < n; i++) { let l = 1; for (let j = 0; j < n; j++) if (j !== i) l *= (x - xs[j]) / (xs[i] - xs[j]); sum += l * ys[i]; }
  return sum;
}
/** Hermite interpolation through (x_i, f_i, f'_i): returns [f(x), f'(x)] (Newton divided differences on doubled nodes). */
function hermite(xs, f, df, x) {
  const n = xs.length, m = 2 * n, z = new Float64Array(m), q = new Float64Array(m);
  for (let i = 0; i < n; i++) { z[2 * i] = z[2 * i + 1] = xs[i]; q[2 * i] = q[2 * i + 1] = f[i]; }
  const coef = new Float64Array(m); coef[0] = q[0];
  const col = Float64Array.from(q);
  for (let j = 1; j < m; j++) {
    for (let i = m - 1; i >= j; i--) {
      const dz = z[i] - z[i - j];
      col[i] = dz === 0 ? df[i >> 1] : (col[i] - col[i - 1]) / dz;
    }
    coef[j] = col[j];
  }
  let p = coef[m - 1], dp = 0;
  for (let k = m - 2; k >= 0; k--) { dp = dp * (x - z[k]) + p; p = p * (x - z[k]) + coef[k]; }
  return [p, dp];
}
function windowStart(epochs, n, size, t) {
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (epochs[mid] <= t) lo = mid; else hi = mid; }
  let first;
  if (size % 2 === 0) first = lo - size / 2 + 1;
  else { const near = (hi < n && Math.abs(epochs[hi] - t) < Math.abs(t - epochs[lo])) ? hi : lo; first = near - (size - 1) / 2; }
  return Math.max(0, Math.min(n - size, first));
}

/** State [x, y, z, vx, vy, vz] (km, km/s) of a segment's target relative to its centre at TDB seconds past J2000 `et`; null outside its span. */
export function stateOfSegment(seg, et) {
  if (!seg.supported || et < seg.start || et > seg.stop) return null;
  if (seg.cheb) {
    const { init, intlen, rsize, n, ncoef, ncomp, word } = seg.cheb;
    let i = Math.floor((et - init) / intlen); if (i >= n) i = n - 1; if (i < 0) i = 0;
    const o = i * rsize, mid = word(o), rad = word(o + 1), x = (et - mid) / rad;
    const out = new Array(6);
    for (let k = 0; k < 3; k++) { const [p, dp] = chebyshev(word, o + 2 + k * ncoef, ncoef, x); out[k] = p; if (ncomp === 3) out[k + 3] = dp / rad; }
    if (ncomp === 6) for (let k = 0; k < 3; k++) out[k + 3] = chebyshev(word, o + 2 + (k + 3) * ncoef, ncoef, x)[0];
    return out;
  }
  const hermiteType = seg.type === 12 || seg.type === 13;
  let n, size, epochAt, word;
  if (seg.equal) { ({ n, word } = seg.equal); size = seg.equal.window; epochAt = (i) => seg.equal.start + i * seg.equal.step; }
  else { ({ n, word } = seg.unequal); size = seg.unequal.window; epochAt = (i) => seg.unequal.epochs[i]; }
  size = Math.min(size, n);
  let first;
  if (seg.equal) { const near = (et - seg.equal.start) / seg.equal.step; first = size % 2 === 0 ? Math.floor(near) - size / 2 + 1 : Math.round(near) - (size - 1) / 2; first = Math.max(0, Math.min(n - size, first)); }
  else first = windowStart(seg.unequal.epochs, n, size, et);
  const xs = [], st = [];
  for (let i = first; i < first + size; i++) { xs.push(epochAt(i)); const s = []; for (let k = 0; k < 6; k++) s.push(word(6 * i + k)); st.push(s); }
  const out = new Array(6);
  if (hermiteType) {
    for (let k = 0; k < 3; k++) { const [p, dp] = hermite(xs, st.map((s) => s[k]), st.map((s) => s[k + 3]), et); out[k] = p; out[k + 3] = dp; }
  } else for (let k = 0; k < 6; k++) out[k] = lagrange(xs, st.map((s) => s[k]), et);
  return out;
}

/**
 * State of `target` relative to `center` (NAIF ids) at `et`, chaining segments through common centres. Later segments in the file take
 * priority, as in SPICE. Returns {state, frame} or null when the kernel cannot connect the two bodies at that time. All chained
 * segments must be in the same frame.
 */
export function stateRelative(spk, target, center, et) {
  const chainTo = (body, seen) => {
    // list of [body, state-of-body-relative-to-root] going up the tree, using the highest-priority segment covering et
    const out = [{ body, state: [0, 0, 0, 0, 0, 0], frame: null }];
    let cur = body, acc = [0, 0, 0, 0, 0, 0], frame = null;
    while (true) {
      let seg = null;
      for (let i = spk.segments.length - 1; i >= 0; i--) { const s = spk.segments[i]; if (s.target === cur && s.supported && et >= s.start && et <= s.stop) { seg = s; break; } }
      if (!seg || seen.has(cur)) break;
      seen.add(cur);
      const st = stateOfSegment(seg, et); if (!st) break;
      if (frame != null && seg.frame !== frame) throw new Error(`The kernel mixes frames (${NAIF_FRAME[frame] ?? frame} and ${NAIF_FRAME[seg.frame] ?? seg.frame}); frame rotation is not supported.`);
      frame = seg.frame;
      acc = acc.map((v, k) => v + st[k]); cur = seg.center;
      out.push({ body: cur, state: acc, frame });
    }
    return out;
  };
  if (target === center) return { state: [0, 0, 0, 0, 0, 0], frame: 1 };
  const a = chainTo(target, new Set()), b = chainTo(center, new Set());
  for (const na of a) {
    const nb = b.find((x) => x.body === na.body);
    if (nb) {
      // target wrt node = na.state ; center wrt node = nb.state
      if (na.frame != null && nb.frame != null && na.frame !== nb.frame) throw new Error('The kernel stores the two bodies in different frames; frame rotation is not supported.');
      return { state: na.state.map((v, k) => v - nb.state[k]), frame: na.frame ?? nb.frame ?? 1 };
    }
  }
  return null;
}

/** Bodies in a kernel and the time each one is covered: [{target, center, name, start, stop, types:[..]}] merged per (target, center). */
export function coverage(spk) {
  const m = new Map();
  for (const s of spk.segments) {
    const k = `${s.target}/${s.center}`, c = m.get(k);
    if (!c) m.set(k, { target: s.target, center: s.center, name: s.targetName, centerName: s.centerName, frame: s.frameName, start: s.start, stop: s.stop, types: [s.type], supported: s.supported });
    else { c.start = Math.min(c.start, s.start); c.stop = Math.max(c.stop, s.stop); if (!c.types.includes(s.type)) c.types.push(s.type); c.supported = c.supported && s.supported; }
  }
  return [...m.values()];
}

/**
 * Samples of `target` relative to `center` every `step` seconds over [from, to] (TDB s past J2000; defaults: the target's whole
 * coverage), in metres and m/s like the rest of ASTRA LAB: [{t, r, v}].
 */
export function sampleSpk(spk, { target, center, from, to, step, maxSamples = 20000 } = {}) {
  const cov = coverage(spk);
  if (target == null) { const sc = cov.find((c) => c.target < 0) ?? cov[0]; if (!sc) throw new Error('The kernel has no segments.'); target = sc.target; center ??= sc.center; }
  const own = cov.filter((c) => c.target === target);
  if (!own.length) throw new Error(`The kernel has no data for body ${target}.`);
  center ??= own[0].center;
  from ??= Math.min(...own.map((c) => c.start)); to ??= Math.max(...own.map((c) => c.stop));
  if (!(to > from)) throw new Error('Empty time span.');
  step ??= Math.max((to - from) / 2000, 1e-3);
  if ((to - from) / step > maxSamples) step = (to - from) / maxSamples;
  const out = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const tt = Math.min(t, to);
    const r = stateRelative(spk, target, center, tt);
    if (r) out.push({ t: tt, r: [r.state[0] * 1e3, r.state[1] * 1e3, r.state[2] * 1e3], v: [r.state[3] * 1e3, r.state[4] * 1e3, r.state[5] * 1e3] });
  }
  if (out.length < 2) throw new Error(`The kernel cannot place body ${target} relative to body ${center} over that time.`);
  return { target, center, samples: out };
}

// ------------------------------------------------------------------------------------------------ writer
/**
 * Write a type 13 (Hermite, unequal steps) SPK. samples = [{t: TDB s past J2000, r: [m], v: [m/s]}] with increasing t.
 * Options: target (NAIF id, default -999 = an unregistered spacecraft), center (default 399 Earth), frame (default 1 = J2000),
 * window (even, 2..26, default 8), name (segment name, 40 chars), comment (text stored in the comment area).
 */
export function writeSpk13(samples, { target = -999, center = 399, frame = 1, window = 8, name = 'ASTRA LAB TRAJECTORY', comment = '' } = {}) {
  const n = samples.length;
  if (n < 2) throw new Error('At least two states are needed to write an SPK.');
  for (let i = 1; i < n; i++) if (!(samples[i].t > samples[i - 1].t)) throw new Error(`The times must increase (sample ${i}).`);
  let w = Math.min(window, n % 2 === 0 ? n : n - 1); if (w % 2) w -= 1; w = Math.max(2, Math.min(26, w));
  const ndir = Math.floor((n - 1) / 100);
  const data = new Float64Array(6 * n + n + ndir + 2);
  samples.forEach((s, i) => { for (let k = 0; k < 3; k++) { data[6 * i + k] = s.r[k] / 1e3; data[6 * i + 3 + k] = s.v[k] / 1e3; } data[6 * n + i] = s.t; });
  for (let d = 1; d <= ndir; d++) data[7 * n + d - 1] = samples[d * 100 - 1].t;
  data[7 * n + ndir] = w - 1; data[7 * n + ndir + 1] = n;
  // comment records (lines end in NUL, the area ends in EOT)
  const text = (comment ? `${comment}\n` : '').replace(/\r/g, '').replace(/[^\x20-\x7e\n]/g, '?');
  const cbytes = text.length ? Array.from(text, (ch) => (ch === '\n' ? 0 : ch.charCodeAt(0))).concat([4]) : [];
  const ncom = Math.ceil(cbytes.length / 1000); // SPICE uses 1000 characters per comment record
  const summaryRec = 2 + ncom, nameRec = summaryRec + 1, dataRec = nameRec + 1;
  const begin = (dataRec - 1) * 128 + 1, end = begin + data.length - 1;
  const totalRecs = dataRec - 1 + Math.ceil(data.length / 128);
  const buf = new ArrayBuffer(totalRecs * RECORD), u8 = new Uint8Array(buf), dv = new DataView(buf);
  const put = (off, s) => { for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i); };
  // file record
  put(0, 'DAF/SPK ');
  dv.setInt32(8, 2, true); dv.setInt32(12, 6, true);
  put(16, 'ASTRA LAB'.padEnd(60, ' '));
  dv.setInt32(76, summaryRec, true); dv.setInt32(80, summaryRec, true); dv.setInt32(84, end + 1, true);
  put(88, 'LTL-IEEE');
  FTPSTR.forEach((b, i) => { u8[699 + i] = b; });
  // comments
  for (let i = 0; i < cbytes.length; i++) u8[RECORD + Math.floor(i / 1000) * RECORD + (i % 1000)] = cbytes[i];
  // summary record: NEXT, PREV, NSUM, then the summary (2 doubles + 6 ints)
  const sb = (summaryRec - 1) * RECORD;
  dv.setFloat64(sb, 0, true); dv.setFloat64(sb + 8, 0, true); dv.setFloat64(sb + 16, 1, true);
  dv.setFloat64(sb + 24, samples[0].t, true); dv.setFloat64(sb + 32, samples[n - 1].t, true);
  [target, center, frame, 13, begin, end].forEach((v, j) => dv.setInt32(sb + 40 + 4 * j, v, true));
  // name record
  put((nameRec - 1) * RECORD, String(name).replace(/[^\x20-\x7e]/g, '_').slice(0, 40).padEnd(40, ' '));
  // data
  const db = (dataRec - 1) * RECORD; for (let i = 0; i < data.length; i++) dv.setFloat64(db + 8 * i, data[i], true);
  return u8;
}
