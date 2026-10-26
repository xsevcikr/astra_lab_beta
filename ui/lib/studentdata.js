// Friendly number formatting and small visual pieces for the student-facing flight data (report card, flight explorer, replay).
// No physics here: values come from src/core/studentreport.js and the recorded telemetry.
import { h } from './dom.js';
import { state as unitState } from './units.js';

const fin = Number.isFinite;
const group = (n) => Math.round(n).toLocaleString('en-US');
const imp = () => unitState.system === 'imperial';

/** 200 km / 5.5 km / 300 m (imperial: mi / ft). */
export function fmtAlt(m) {
  if (!fin(m)) return '–';
  if (imp()) { const mi = m / 1609.344; return Math.abs(mi) >= 1 ? `${mi >= 100 ? group(mi) : mi.toFixed(1)} mi` : `${group(m * 3.28084)} ft`; }
  const km = m / 1000; return Math.abs(km) >= 100 ? `${group(km)} km` : Math.abs(km) >= 1 ? `${km.toFixed(1)} km` : `${group(m)} m`;
}
/** Distance for long ranges (always km / mi). */
export function fmtDist(m) {
  if (!fin(m)) return '–';
  if (imp()) return `${group(m / 1609.344)} mi`;
  return Math.abs(m) >= 100000 ? `${group(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`;
}
/** 28,000 km/h (imperial: mph). Large values are rounded to two significant figures of hundreds. */
export function fmtSpeed(ms) {
  if (!fin(ms)) return '–';
  const v = imp() ? ms * 2.23694 : ms * 3.6, u = imp() ? 'mph' : 'km/h';
  return `${Math.abs(v) >= 2000 ? group(Math.round(v / 10) * 10) : group(v)} ${u}`;
}
export const fmtG = (g) => (fin(g) ? `${g.toFixed(1)} g` : '–');
export const fmtPct = (p, d) => (fin(p) ? `${p.toFixed(d ?? (p < 10 && p > 0 ? 1 : 0))} %` : '–');
export function fmtMass(kg) { if (!fin(kg)) return '–'; return imp() ? `${group(kg * 2.20462)} lb` : `${group(kg)} kg`; }
export function fmtForce(n) { if (!fin(n)) return '–'; if (imp()) { const l = n * 0.224809; return l >= 10000 ? `${group(l / 1000)} klbf` : `${group(l)} lbf`; } return Math.abs(n) >= 10000 ? `${group(n / 1000)} kN` : `${group(n)} N`; }
export function fmtPressure(pa) { if (!fin(pa)) return '–'; return imp() ? `${(pa * 0.000145038).toFixed(2)} psi` : Math.abs(pa) >= 1000 ? `${(pa / 1000).toFixed(1)} kPa` : `${Math.round(pa)} Pa`; }
export function fmtTemp(k) { if (!fin(k)) return '–'; return imp() ? `${Math.round((k - 273.15) * 1.8 + 32)} °F` : `${Math.round(k - 273.15)} °C`; }
/** 8 min 2 s / 41 s / 1 h 05 min */
export function fmtDur(s) {
  if (!fin(s)) return '–'; s = Math.max(0, s);
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60), sec = Math.round(s - 60 * m);
  if (m < 60) return sec === 60 ? `${m + 1} min` : sec ? `${m} min ${sec} s` : `${m} min`;
  const hh = Math.floor(m / 60); return `${hh} h ${String(m % 60).padStart(2, '0')} min`;
}
/** T+0:41 */
export const fmtClock = (s) => { if (!fin(s)) return '–'; const m = Math.floor(Math.abs(s) / 60), sec = Math.floor(Math.abs(s) - 60 * m); return `T+${m}:${String(sec).padStart(2, '0')}`; };
/** One formatted value for a tile kind. */
export function fmtKind(kind, v) {
  switch (kind) {
    case 'altitude': return fmtAlt(v); case 'speed': return fmtSpeed(v); case 'g': return fmtG(v); case 'time': return fmtDur(v); case 'percent': return fmtPct(v);
    case 'ratio': return fin(v) ? `${v.toFixed(1)}x` : '–'; case 'distance': return fmtDist(v); default: return fin(v) ? String(v) : '–';
  }
}

// ---------------------------------------------------------------- pieces
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** Tiny line chart (SVG). `t`/`v`: series; `setCursor(time)` moves the marker. */
export function sparkline({ t, v, w = 150, hgt = 28, color = '#2bd9a0' }) {
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'spark', preserveAspectRatio: 'none' });
  const ok = t.length > 1 && v.some(fin);
  let t0 = t[0], t1 = t[t.length - 1], lo = Infinity, hi = -Infinity;
  for (const x of v) if (fin(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
  if (!(hi - lo > 1e-12)) { lo -= 1; hi += 1; }
  const X = (tt) => ((tt - t0) / Math.max(t1 - t0, 1e-9)) * (w - 2) + 1, Y = (x) => hgt - 3 - ((x - lo) / (hi - lo)) * (hgt - 6);
  if (ok) el.append(svg('polyline', { points: t.map((tt, i) => (fin(v[i]) ? `${X(tt).toFixed(1)},${Y(v[i]).toFixed(1)}` : null)).filter(Boolean).join(' '), fill: 'none', stroke: color, 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke' }));
  const cur = svg('line', { x1: 0, x2: 0, y1: 0, y2: hgt, stroke: '#fff', 'stroke-width': '1.2', 'vector-effect': 'non-scaling-stroke', opacity: '0.9' });
  const dot = svg('circle', { r: '2.6', cx: 0, cy: 0, fill: color, stroke: '#fff', 'stroke-width': '1' }); dot.style.display = 'none';
  el.append(cur, dot);
  return {
    el,
    setCursor(time) {
      if (!ok) return; const x = X(Math.min(t1, Math.max(t0, time))); cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      // value under the cursor
      let lo2 = 0, hi2 = t.length - 1; while (hi2 - lo2 > 1) { const m = (lo2 + hi2) >> 1; if (t[m] <= time) lo2 = m; else hi2 = m; }
      const f = (Math.min(t1, Math.max(t0, time)) - t[lo2]) / Math.max(t[hi2] - t[lo2], 1e-12), y = v[lo2] + (v[hi2] - v[lo2]) * Math.min(1, Math.max(0, f));
      if (fin(y)) { dot.setAttribute('cx', x); dot.setAttribute('cy', Y(y)); dot.style.display = ''; } else dot.style.display = 'none';
    },
  };
}

/** Big friendly tile: icon, plain name, large value, one line of meaning. */
export function bigTile({ icon, name, value, meaning, cls = '' }) {
  return h('div', { class: `bt ${cls}` }, h('div', { class: 'bt-top' }, h('span', { class: 'bt-ico' }, icon), h('span', { class: 'bt-name' }, name)), h('div', { class: 'bt-val' }, value), meaning ? h('div', { class: 'bt-sub' }, meaning) : null);
}

/** Horizontal bars for the speed budget. items: [{label, pct, valueText, caption, color}] */
export function barRows(items) {
  return h('div', { class: 'brs' }, items.map((it) => h('div', { class: 'br' },
    h('div', { class: 'br-head' }, h('b', null, it.label), h('span', { class: 'br-val' }, it.valueText)),
    h('div', { class: 'br-track' }, h('div', { class: 'br-fill', style: { width: `${Math.max(1.5, Math.min(100, it.pct))}%`, background: it.color } })),
    h('div', { class: 'br-cap' }, it.caption))));
}

/** Score ring (SVG) with the number in the middle. */
export function scoreRing(score, { size = 120 } = {}) {
  const r = 50, c = 2 * Math.PI * r, color = score >= 75 ? 'var(--ok)' : score >= 45 ? 'var(--warn)' : 'var(--bad)';
  const el = svg('svg', { viewBox: '0 0 120 120', width: size, height: size, class: 'ring' });
  el.append(svg('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: 'var(--panel-3)', 'stroke-width': 11 }));
  const arc = svg('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: color, 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-dasharray': `${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`, transform: 'rotate(-90 60 60)' });
  el.append(arc);
  const tx = svg('text', { x: 60, y: 66, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 700, fill: 'currentColor' }); tx.textContent = String(score); el.append(tx);
  const sm = svg('text', { x: 60, y: 84, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted)' }); sm.textContent = 'out of 100'; el.append(sm);
  return el;
}

/** Mini map of the ground track (plain equirectangular projection fitted to the track, graticule, start and end). */
export function drawGroundTrack(canvas, track, { cursorT = null } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, hh = canvas.clientHeight; if (!w || !hh || !track) return;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(hh * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a100e'; g.fillRect(0, 0, w, hh);
  // unwrap the longitude so a track crossing ±180° stays continuous
  const pts = []; let prev = null, off = 0;
  for (const p of track.points) { let lon = p.lon + off; if (prev != null) { while (lon - prev > 180) { lon -= 360; off -= 360; } while (prev - lon > 180) { lon += 360; off += 360; } } pts.push({ ...p, lon }); prev = lon; }
  let la0 = Math.min(...pts.map((p) => p.lat)), la1 = Math.max(...pts.map((p) => p.lat)), lo0 = Math.min(...pts.map((p) => p.lon)), lo1 = Math.max(...pts.map((p) => p.lon));
  const pad = 12, mLat = Math.max(2, (la1 - la0) * 0.15), mLon = Math.max(2, (lo1 - lo0) * 0.1);
  la0 -= mLat; la1 += mLat; lo0 -= mLon; lo1 += mLon;
  const k = Math.min((w - 2 * pad) / (lo1 - lo0), (hh - 2 * pad) / (la1 - la0)); // px per degree, same in both axes
  const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
  const X = (lon) => w / 2 + (lon - cx) * k, Y = (lat) => hh / 2 - (lat - cy) * k;
  g.strokeStyle = '#1b2823'; g.lineWidth = 1; g.fillStyle = '#7f958c'; g.font = '10px "Segoe UI", system-ui, sans-serif';
  const step = (la1 - la0) > 60 || (lo1 - lo0) > 120 ? 30 : (la1 - la0) > 20 || (lo1 - lo0) > 40 ? 10 : 5;
  for (let lat = Math.ceil(la0 / step) * step; lat <= la1; lat += step) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(w, Y(lat)); g.stroke(); g.textAlign = 'left'; g.fillText(`${lat}°`, 3, Y(lat) - 2); }
  for (let lon = Math.ceil(lo0 / step) * step; lon <= lo1; lon += step) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), hh); g.stroke(); const wl = ((lon + 540) % 360) - 180; g.textAlign = 'center'; g.fillText(`${wl}°`, X(lon), hh - 3); }
  g.strokeStyle = '#2bd9a0'; g.lineWidth = 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.lon), Y(p.lat)) : g.moveTo(X(p.lon), Y(p.lat)))); g.stroke();
  const dot = (p, col, label) => { g.fillStyle = col; g.beginPath(); g.arc(X(p.lon), Y(p.lat), 4.5, 0, 7); g.fill(); g.fillStyle = '#e3efe9'; g.textAlign = 'left'; g.fillText(label, X(p.lon) + 7, Y(p.lat) - 6); };
  dot(pts[0], '#84e060', 'Start'); dot(pts[pts.length - 1], '#ffb84a', 'End');
  if (cursorT != null) { let best = pts[0]; for (const p of pts) if (Math.abs(p.t - cursorT) < Math.abs(best.t - cursorT)) best = p; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X(best.lon), Y(best.lat), 6.5, 0, 7); g.stroke(); }
}

/** Icon badges over a Chart at event times (the Chart draws the dashed lines). `marks`: [{t, icon, label}]. Call update() after the chart redraws. */
export function attachMarks(wrap, chart, marks) {
  const layer = h('div', { class: 'cm-layer' }); wrap.append(layer);
  const badges = marks.map((m) => { const b = h('span', { class: 'cm', title: `${m.label}` }, m.icon); layer.append(b); return { b, m }; });
  function update() {
    let P; try { P = chart._plot(); } catch { return; }
    const [xa, xb] = chart._xr(); const wpx = chart.canvas.clientWidth; if (!wpx) return;
    let lastX = -99;
    for (const { b, m } of badges) {
      const x = P.x0 + ((m.t - xa) / Math.max(xb - xa, 1e-9)) * (P.x1 - P.x0);
      const visible = x >= P.x0 && x <= P.x1 && x - lastX > 15;
      b.style.display = visible ? '' : 'none';
      if (visible) { b.style.left = `${x}px`; lastX = x; }
    }
  }
  return { update, layer };
}
