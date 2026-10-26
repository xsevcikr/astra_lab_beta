// Small canvas chart component: several series against time (or any x), two y-axes, event markers, cursor, hover read-out, click to seek.
import { localPoint } from './dom.js';
import { CHANNEL_META } from '../../physics/telemetry.js';
import { state as unitState, detailMode } from './units.js';
import { formatNumber } from '../../src/core/numfmt.js';

const COLORS = ['#2bd9a0', '#ff7a45', '#84e060', '#c07cff', '#ffd23f', '#3fd0d0', '#ff6b9d', '#a8bdb3'];
export const seriesColor = (i) => COLORS[i % COLORS.length];

/** Display conversion for an SI channel unit given its data range: returns {f, unit}. */
export function displaySpec(unit, maxAbs = 0) {
  const imp = unitState.system === 'imperial';
  switch (unit) {
    case 'm': return imp ? (maxAbs > 8000 ? { f: (x) => x / 1609.344, unit: 'mi' } : { f: (x) => x * 3.28084, unit: 'ft' }) : (maxAbs > 20000 ? { f: (x) => x / 1000, unit: 'km' } : { f: (x) => x, unit: 'm' });
    case 'm/s': return imp ? { f: (x) => x * 3.28084, unit: 'ft/s' } : { f: (x) => x, unit: 'm/s' };
    case 'm/s2': return imp ? { f: (x) => x * 3.28084, unit: 'ft/s²' } : { f: (x) => x, unit: 'm/s²' };
    case 'kg': return imp ? { f: (x) => x * 2.20462, unit: 'lb' } : { f: (x) => x, unit: 'kg' };
    case 'N': return imp ? { f: (x) => x * 0.224809 / (maxAbs > 20000 ? 1000 : 1), unit: maxAbs > 20000 ? 'klbf' : 'lbf' } : (maxAbs > 5000 ? { f: (x) => x / 1000, unit: 'kN' } : { f: (x) => x, unit: 'N' });
    case 'Pa': return imp ? { f: (x) => x * 0.000145038, unit: 'psi' } : (maxAbs > 5000 ? { f: (x) => x / 1000, unit: 'kPa' } : { f: (x) => x, unit: 'Pa' });
    case 'K': return imp ? { f: (x) => (x - 273.15) * 1.8 + 32, unit: '°F' } : { f: (x) => x - 273.15, unit: '°C' };
    case 'W/m2': return maxAbs > 5000 ? { f: (x) => x / 1000, unit: 'kW/m²' } : { f: (x) => x, unit: 'W/m²' };
    case 'bit': return maxAbs > 8e6 ? { f: (x) => x / 8e6, unit: 'MB' } : { f: (x) => x / 8000, unit: 'kB' };
    case 'J/kg': return { f: (x) => x / 1e6, unit: 'MJ/kg' };
    case 'm2/s': return { f: (x) => x / 1e6, unit: 'km²/s·10⁻⁶ ×10⁶' };
    default: return { f: (x) => x, unit };
  }
}

const niceTicks = (lo, hi, n = 5) => {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
};
/** Axis / legend number: the shared formatter (commas, no float noise); scientific notation only at the Expert level. */
export const fmtTick = (v) => {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v), d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  const s = formatNumber(v, { digits: d, mode: detailMode() });
  return s.includes('.') && !/[a-z]/i.test(s) ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

export class Chart {
  /** @param canvas HTMLCanvasElement (CSS size decides the drawing size) */
  constructor(canvas, { title = '', xLabel = 't [s]', clean = false, fill = false, dot = false, yTicks = 4, xTicks = 5 } = {}) {
    // clean: big readable axes, no frame, soft area fill, fewer ticks (used by the beginner-friendly screens)
    this.canvas = canvas; this.title = title; this.xLabel = clean && xLabel === 't [s]' ? 'time (seconds)' : xLabel;
    this.clean = clean; this.fill = fill; this.dot = dot; this.yTicks = yTicks; this.xTicks = xTicks;
    this.t = []; this.series = []; this.markers = []; this.cursor = null; this.hover = null; this.xRange = null;
    canvas.addEventListener('pointermove', (e) => { this.hover = this._xAt(localPoint(canvas, e).x); this.draw(); });
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('click', (e) => { const x = this._xAt(localPoint(canvas, e).x); if (x != null) this.onSeek?.(x); });
    this.pad = clean ? { l: 52, r: 14, t: title ? 22 : 10, b: xLabel === '' ? 22 : 34 } : { l: 58, r: 12, t: 24, b: 24 };
  }
  /** series: [{id,label,unit,values (Float64Array/Array, SI), color?}] */
  setData(t, series, markers = []) {
    this.t = t; this.markers = markers;
    if (this.clean) this.pad.t = series.length > 1 || this.title ? 24 : 10;
    const units = [...new Set(series.map((s) => s.unit))];
    this.series = series.map((s, i) => {
      let mx = 0; const v = s.values; const step = Math.max(1, Math.floor(v.length / 4000));
      for (let k = 0; k < v.length; k += step) { const a = Math.abs(v[k]); if (a > mx && Number.isFinite(a)) mx = a; }
      const spec = displaySpec(s.unit, mx);
      const axis = units.indexOf(s.unit) === 0 ? 0 : units.indexOf(s.unit) === 1 ? 1 : 2;
      return { ...s, color: s.color ?? seriesColor(i), spec, axis };
    });
    this.draw();
  }
  setCursor(t) { this.cursor = t; this.draw(); }
  _plot() { const w = this.canvas.clientWidth, h = this.canvas.clientHeight; return { w, h, x0: this.pad.l, x1: w - this.pad.r - (this.series.some((s) => s.axis === 1) ? 46 : 0), y0: this.pad.t, y1: h - this.pad.b }; }
  _xAt(px) { const P = this._plot(); const [a, b] = this._xr(); if (px < P.x0 || px > P.x1) return null; return a + ((px - P.x0) / (P.x1 - P.x0)) * (b - a); }
  _xr() { if (this.xRange) return this.xRange; const t = this.t; return t.length ? [t[0], t[t.length - 1] > t[0] ? t[t.length - 1] : t[0] + 1] : [0, 1]; }
  _sample(s, x) { // linear interpolation of a series at x
    const t = this.t; if (!t.length) return NaN;
    let lo = 0, hi = t.length - 1; if (x <= t[0]) return s.values[0]; if (x >= t[hi]) return s.values[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
    const f = (x - t[lo]) / Math.max(t[hi] - t[lo], 1e-12); return s.values[lo] + (s.values[hi] - s.values[lo]) * f;
  }
  draw() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--panel-2').trim() || '#0a100e', grid = css.getPropertyValue('--grid').trim() || '#1b2823', fg = css.getPropertyValue('--muted').trim() || '#9bb0a7';
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const P = this._plot(); const [xa, xb] = this._xr();
    const X = (x) => P.x0 + ((x - xa) / (xb - xa)) * (P.x1 - P.x0);
    const FS = this.clean ? 12.5 : 11; g.font = `${FS}px "Segoe UI", system-ui, sans-serif`; g.textBaseline = 'middle';
    // y ranges per axis
    const ranges = [null, null, null];
    for (const s of this.series) {
      let lo = Infinity, hi = -Infinity; const v = s.values;
      // only the visible x-range
      for (let i = 0; i < v.length; i++) { if (this.t[i] < xa || this.t[i] > xb) continue; const y = s.spec.f(v[i]); if (Number.isFinite(y)) { if (y < lo) lo = y; if (y > hi) hi = y; } }
      if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
      s._lo = lo; s._hi = hi;
      const r = ranges[s.axis] ?? [Infinity, -Infinity]; r[0] = Math.min(r[0], lo); r[1] = Math.max(r[1], hi); ranges[s.axis] = r;
    }
    for (const r of ranges) if (r) { if (r[1] - r[0] < 1e-9) { r[0] -= 0.5; r[1] += 0.5; } const m = (r[1] - r[0]) * 0.05; r[0] -= m; r[1] += m; }
    const Y = (ax, y) => { const r = ranges[ax] ?? [0, 1]; return P.y1 - ((y - r[0]) / (r[1] - r[0])) * (P.y1 - P.y0); };
    // grid + axes
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = fg;
    const r0 = ranges[0] ?? [0, 1];
    g.textAlign = 'right';
    for (const v of niceTicks(r0[0], r0[1], this.clean ? this.yTicks : 5)) { const y = Math.round(Y(0, v)) + 0.5; g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.fillText(fmtTick(v), P.x0 - 6, y); }
    if (ranges[1]) { g.textAlign = 'left'; for (const v of niceTicks(ranges[1][0], ranges[1][1], 4)) { const y = Y(1, v); g.fillText(fmtTick(v), P.x1 + 6, y); } }
    g.textAlign = 'center';
    for (const v of niceTicks(xa, xb, this.clean ? this.xTicks : 6)) { const x = Math.round(X(v)) + 0.5; if (!this.clean) { g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); } g.fillText(fmtTick(v), x, P.y1 + (this.clean ? 14 : 12)); }
    if (this.clean) { g.strokeStyle = '#33463f'; g.beginPath(); g.moveTo(P.x0 + 0.5, P.y0); g.lineTo(P.x0 + 0.5, P.y1 + 0.5); g.lineTo(P.x1, P.y1 + 0.5); g.stroke(); } else { g.strokeStyle = '#33463f'; g.strokeRect(P.x0 + 0.5, P.y0 + 0.5, P.x1 - P.x0, P.y1 - P.y0); }
    // markers
    g.save(); g.beginPath(); g.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0); g.clip();
    for (const m of (this.clean && !this.showMarkers ? [] : this.markers)) { if (m.t < xa || m.t > xb) continue; const x = Math.round(X(m.t)) + 0.5; g.strokeStyle = m.color ?? 'rgba(255,255,255,0.28)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); g.setLineDash([]); }
    // series with min/max decimation per pixel column
    const t = this.t;
    for (const s of this.series) {
      const ax = Math.min(s.axis, 1); const norm = s.axis === 2;
      g.strokeStyle = s.color; g.lineWidth = this.clean ? 2.4 : 1.6; g.lineJoin = 'round'; g.beginPath();
      const px = Math.max(1, Math.floor(P.x1 - P.x0));
      if (t.length > px * 3) {
        const buckets = new Array(px).fill(null);
        for (let i = 0; i < t.length; i++) { if (t[i] < xa || t[i] > xb) continue; const b = Math.min(px - 1, Math.floor(((t[i] - xa) / (xb - xa)) * px)); const y = s.spec.f(s.values[i]); if (!Number.isFinite(y)) continue; const e = buckets[b]; if (!e) buckets[b] = { lo: y, hi: y, first: y, last: y }; else { if (y < e.lo) e.lo = y; if (y > e.hi) e.hi = y; e.last = y; } }
        let started = false;
        buckets.forEach((e, b) => { if (!e) return; const x = P.x0 + b + 0.5; const yy = (v) => (norm ? P.y1 - ((v - s._lo) / (s._hi - s._lo || 1)) * (P.y1 - P.y0) : Y(ax, v)); const seq = e.first <= e.last ? [e.first, e.lo, e.hi, e.last] : [e.first, e.hi, e.lo, e.last]; for (const v of seq) { if (!started) { g.moveTo(x, yy(v)); started = true; } else g.lineTo(x, yy(v)); } });
      } else {
        let started = false;
        for (let i = 0; i < t.length; i++) { const y = s.spec.f(s.values[i]); if (!Number.isFinite(y)) continue; const x = X(t[i]); const yy = norm ? P.y1 - ((y - s._lo) / (s._hi - s._lo || 1)) * (P.y1 - P.y0) : Y(ax, y); if (!started) { g.moveTo(x, yy); started = true; } else g.lineTo(x, yy); }
      }
      g.stroke();
      if (this.fill && this.series.length === 1 && t.length > 1) { g.save(); g.lineTo(X(Math.min(xb, t[t.length - 1])), P.y1); g.lineTo(X(Math.max(xa, t[0])), P.y1); g.closePath(); g.globalAlpha = 0.14; g.fillStyle = s.color; g.fill(); g.restore(); }
      if (this.dot && t.length) { const li = t.length - 1; const y = s.spec.f(s.values[li]); if (Number.isFinite(y) && t[li] >= xa && t[li] <= xb) { const yy = norm ? P.y1 - ((y - s._lo) / (s._hi - s._lo || 1)) * (P.y1 - P.y0) : Y(ax, y); g.fillStyle = s.color; g.beginPath(); g.arc(X(t[li]), yy, 4.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); } }
    }
    // cursor
    if (this.cursor != null && this.cursor >= xa && this.cursor <= xb) { const x = Math.round(X(this.cursor)) + 0.5; g.strokeStyle = '#ffffff'; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); g.globalAlpha = 1; }
    if (this.hover != null) { const x = Math.round(X(this.hover)) + 0.5; g.strokeStyle = '#9bb0a7'; g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); }
    g.restore();
    // legend (values at cursor / hover)
    const at = this.hover ?? this.cursor;
    g.textAlign = 'left'; let lx = P.x0 + 6;
    g.fillStyle = '#cfe0d8'; g.font = `bold ${FS}px "Segoe UI", system-ui, sans-serif`; if (this.title) { g.fillText(this.title, lx, 11); lx += g.measureText(this.title).width + 14; }
    g.font = `${FS}px "Segoe UI", system-ui, sans-serif`;
    for (const s of this.series) {
      if (this.clean && this.series.length === 1 && at == null) break;
      const val = at != null ? s.spec.f(this._sample(s, at)) : null;
      const label = this.clean ? `${s.label ?? s.id}${val != null && Number.isFinite(val) ? ` ${fmtTick(val)} ${s.spec.unit}` : ''}` : `${s.label ?? s.id} [${s.spec.unit}]${val != null && Number.isFinite(val) ? ' = ' + fmtTick(val) : ''}`;
      g.fillStyle = s.color; g.fillRect(lx, 6, 9, 9); g.fillStyle = '#cfe0d8'; g.fillText(label, lx + 13, 11); lx += g.measureText(label).width + 30;
      if (lx > w - 80) break;
    }
    g.fillStyle = fg; g.textAlign = 'right'; g.fillText(this.xLabel, w - 6, h - 8);
  }
}

/** Bar chart of labelled values (delta-v budget etc.) */
export function drawBars(canvas, items, { unit = '', title = '' } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a100e'; g.fillRect(0, 0, w, h); g.font = '12px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'middle';
  const mx = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9); const rowH = Math.min(30, (h - 28) / Math.max(items.length, 1));
  g.fillStyle = '#cfe0d8'; g.fillText(title, 8, 12);
  items.forEach((it, i) => {
    const y = 26 + i * rowH; const bw = ((w - 200) * Math.abs(it.value)) / mx;
    g.fillStyle = '#9bb0a7'; g.textAlign = 'right'; g.fillText(it.label, 132, y + rowH / 2 - 2);
    g.fillStyle = it.color ?? seriesColor(i); g.fillRect(140, y + 2, Math.max(bw, 1), rowH - 8);
    g.fillStyle = '#cfe0d8'; g.textAlign = 'left'; g.fillText(`${fmtTick(it.value)} ${unit}`, 146 + bw, y + rowH / 2 - 2);
  });
}

/** Scatter / line plot for experiment results. points: [{x,y,color?,label?}]. clean: big readable axes, horizontal grid only. */
export function drawScatter(canvas, points, { xLabel = '', yLabel = '', line = false, clean = false } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a100e'; g.fillRect(0, 0, w, h); g.font = `${clean ? 12.5 : 11}px "Segoe UI", system-ui, sans-serif`;
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)); if (!pts.length) { g.fillStyle = '#9bb0a7'; g.fillText('No numeric data to plot', 12, 20); return; }
  let xl = Math.min(...pts.map((p) => p.x)), xh = Math.max(...pts.map((p) => p.x)), yl = Math.min(...pts.map((p) => p.y)), yh = Math.max(...pts.map((p) => p.y));
  if (xh - xl < 1e-12) { xl -= 1; xh += 1; } if (yh - yl < 1e-12) { yl -= 1; yh += 1; }
  if (clean) { const m = (yh - yl) * 0.12; yl -= m; yh += m; }
  const P = clean ? { l: 56, r: 16, t: yLabel ? 24 : 12, b: xLabel ? 40 : 24 } : { l: 62, r: 14, t: 14, b: 32 };
  const X = (x) => P.l + ((x - xl) / (xh - xl)) * (w - P.l - P.r), Y = (y) => h - P.b - ((y - yl) / (yh - yl)) * (h - P.t - P.b);
  g.strokeStyle = '#1b2823'; g.fillStyle = '#9bb0a7'; g.textBaseline = 'middle';
  g.textAlign = 'right'; for (const v of niceTicks(yl, yh, clean ? 4 : 5)) { const y = Y(v); g.beginPath(); g.moveTo(P.l, y); g.lineTo(w - P.r, y); g.stroke(); g.fillText(fmtTick(v), P.l - 6, y); }
  g.textAlign = 'center'; for (const v of niceTicks(xl, xh, clean ? 4 : 5)) { const x = X(v); if (!clean) { g.beginPath(); g.moveTo(x, P.t); g.lineTo(x, h - P.b); g.stroke(); } g.fillText(fmtTick(v), x, h - P.b + 13); }
  if (clean) { g.textAlign = 'center'; g.fillText(xLabel, (P.l + w - P.r) / 2, h - 9); g.textAlign = 'left'; g.fillStyle = '#cfe0d8'; g.fillText(yLabel, P.l, 10); }
  else { g.fillText(xLabel, w / 2, h - 6); g.save(); g.translate(12, h / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore(); }
  if (line) { g.strokeStyle = clean ? '#7f958c' : '#2bd9a0'; g.lineWidth = clean ? 2 : 1; g.beginPath(); pts.slice().sort((a, b) => a.x - b.x).forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke(); g.lineWidth = 1; }
  for (const p of pts) { g.fillStyle = p.color ?? '#2bd9a0'; g.beginPath(); g.arc(X(p.x), Y(p.y), clean ? 6 : 4.5, 0, Math.PI * 2); g.fill(); if (clean) { g.strokeStyle = '#0a100e'; g.lineWidth = 1.5; g.stroke(); } }
}
export { CHANNEL_META };
