// Lightweight canvas charts (no libraries, cheap on old hardware). Charts only draw the numbers they are given.
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const PALETTE = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];
export const seriesColor = (i) => css(PALETTE[i % PALETTE.length], '#3ddc84');

export function fmt(v, digits = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  return Number(v.toPrecision(digits + (a >= 1000 ? 2 : a >= 100 ? 1 : 0))).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
  return out;
}

function setup(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 600, h = canvas.clientHeight || 260;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.font = '11px ui-monospace, Consolas, monospace';
  return { g, w, h };
}

// Line chart. opts: { series: [{ name, x, y, unit, dashed }], xLabel, yLabel, cursor, markers: [{x,label}], hlines: [{y,label,color}], yMin, yMax }
export function lineChart(canvas, opts) {
  canvas._chart = opts;
  const draw = (hover) => {
    const { g, w, h } = setup(canvas);
    const m = { l: 62, r: 14, t: 18, b: 34 };
    const S = opts.series.filter((s) => s.x?.length);
    const grid = css('--grid', '#222'), text = css('--muted', '#888');
    if (!S.length) { g.fillStyle = text; g.fillText(opts.empty || 'No data yet. Run the simulation.', m.l, h / 2); return; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of S) for (let i = 0; i < s.x.length; i++) { const yv = s.y[i]; if (!Number.isFinite(yv) || !Number.isFinite(s.x[i])) continue; x0 = Math.min(x0, s.x[i]); x1 = Math.max(x1, s.x[i]); y0 = Math.min(y0, yv); y1 = Math.max(y1, yv); }
    for (const l of opts.hlines || []) { y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); }
    if (opts.yMin !== undefined) y0 = opts.yMin; if (opts.yMax !== undefined) y1 = opts.yMax;
    if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; } else { const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad; }
    if (x1 - x0 < 1e-12) x1 = x0 + 1;
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (w - m.l - m.r), Y = (v) => h - m.b - (v - y0) / (y1 - y0) * (h - m.t - m.b);
    g.strokeStyle = grid; g.fillStyle = text; g.lineWidth = 1;
    for (const t of niceTicks(y0, y1)) { const y = Y(t); g.beginPath(); g.moveTo(m.l, y); g.lineTo(w - m.r, y); g.stroke(); g.fillText(fmt(t), 4, y + 4); }
    for (const t of niceTicks(x0, x1, 7)) { const x = X(t); g.beginPath(); g.moveTo(x, m.t); g.lineTo(x, h - m.b); g.stroke(); g.fillText(fmt(t), x - 12, h - m.b + 14); }
    if (opts.xLabel) g.fillText(opts.xLabel, w - m.r - g.measureText(opts.xLabel).width, h - 4);
    if (opts.yLabel) g.fillText(opts.yLabel, m.l + 4, 12);
    for (const l of opts.hlines || []) { g.strokeStyle = l.color || css('--warn', '#e0a030'); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(m.l, Y(l.y)); g.lineTo(w - m.r, Y(l.y)); g.stroke(); g.setLineDash([]); g.fillStyle = g.strokeStyle; if (l.label) g.fillText(l.label, w - m.r - g.measureText(l.label).width - 2, Y(l.y) - 4); }
    for (const mk of opts.markers || []) { if (mk.x < x0 || mk.x > x1) continue; g.strokeStyle = mk.color || css('--muted', '#888'); g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(mk.x), m.t); g.lineTo(X(mk.x), h - m.b); g.stroke(); g.globalAlpha = 1; }
    S.forEach((s, si) => {
      g.strokeStyle = s.color || seriesColor(si); g.lineWidth = 1.6; g.setLineDash(s.dashed ? [6, 4] : []);
      g.beginPath(); let pen = false;
      const stride = Math.max(1, Math.floor(s.x.length / (w * 2)));
      for (let i = 0; i < s.x.length; i += stride) { const yv = s.y[i]; if (!Number.isFinite(yv)) { pen = false; continue; } const px = X(s.x[i]), py = Y(yv); if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; } }
      g.stroke(); g.setLineDash([]);
    });
    if (S.length > 1 || S[0].name) { let lx = m.l + 6; S.forEach((s, si) => { g.fillStyle = s.color || seriesColor(si); g.fillRect(lx, m.t + 2, 10, 3); g.fillStyle = text; const label = `${s.name}${s.unit ? ` [${s.unit}]` : ''}`; g.fillText(label, lx + 14, m.t + 7); lx += g.measureText(label).width + 28; }); }
    const cur = hover ?? opts.cursor;
    if (cur !== undefined && cur !== null && cur >= x0 && cur <= x1) {
      g.strokeStyle = css('--accent', '#3ddc84'); g.beginPath(); g.moveTo(X(cur), m.t); g.lineTo(X(cur), h - m.b); g.stroke();
      const lines = [`${opts.xLabel || 'x'} = ${fmt(cur)}`];
      S.forEach((s) => { let best = 0, bd = Infinity; for (let i = 0; i < s.x.length; i++) { const d = Math.abs(s.x[i] - cur); if (d < bd) { bd = d; best = i; } } lines.push(`${s.name || 'y'} = ${fmt(s.y[best])}${s.unit ? ' ' + s.unit : ''}`); });
      const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 12, bx = Math.min(X(cur) + 8, w - bw - 4);
      g.fillStyle = css('--panel2', '#111'); g.globalAlpha = 0.92; g.fillRect(bx, m.t + 14, bw, lines.length * 14 + 6); g.globalAlpha = 1;
      g.fillStyle = css('--text', '#ddd'); lines.forEach((l, i) => g.fillText(l, bx + 6, m.t + 28 + i * 14));
    }
    canvas._toX = (px) => x0 + (px - m.l) / (w - m.l - m.r) * (x1 - x0);
  };
  if (!canvas._hoverBound) {
    canvas._hoverBound = true;
    canvas.addEventListener('mousemove', (ev) => { const c = canvas._chartDraw; if (c && canvas._toX) c(canvas._toX(ev.offsetX)); });
    canvas.addEventListener('mouseleave', () => canvas._chartDraw?.());
    canvas.addEventListener('click', (ev) => { if (canvas._toX && canvas._chart?.onPick) canvas._chart.onPick(canvas._toX(ev.offsetX)); });
  }
  canvas._chartDraw = draw;
  draw();
}

// Vertical bars (histograms, counts). opts: { labels, values, unit, highlight }
export function barChart(canvas, { labels, values, unit = '', colorFor }) {
  const { g, w, h } = setup(canvas);
  const m = { l: 50, r: 10, t: 12, b: 40 }, max = Math.max(1e-12, ...values.map(Math.abs));
  const bw = (w - m.l - m.r) / Math.max(1, values.length);
  g.fillStyle = css('--muted', '#888');
  for (const t of niceTicks(0, max, 4)) { const y = h - m.b - t / max * (h - m.t - m.b); g.fillText(fmt(t), 4, y + 4); g.strokeStyle = css('--grid', '#222'); g.beginPath(); g.moveTo(m.l, y); g.lineTo(w - m.r, y); g.stroke(); }
  values.forEach((v, i) => {
    const bh = Math.abs(v) / max * (h - m.t - m.b);
    g.fillStyle = colorFor ? colorFor(i) : css('--accent', '#3ddc84'); g.globalAlpha = 0.85; g.fillRect(m.l + i * bw + 1, h - m.b - bh, Math.max(1, bw - 2), bh); g.globalAlpha = 1;
    if (values.length <= 16 || i % Math.ceil(values.length / 10) === 0) { g.fillStyle = css('--muted', '#888'); g.fillText(String(labels[i]).slice(0, 10), m.l + i * bw, h - m.b + 14); }
  });
  if (unit) { g.fillStyle = css('--muted', '#888'); g.fillText(unit, w - m.r - g.measureText(unit).width, h - 6); }
}

// Tornado chart: rows sorted by swing, low and high bars around the nominal value.
export function tornadoChart(canvas, { rows, nominal, unit = '' }) {
  const { g, w, h } = setup(canvas);
  const m = { l: 170, r: 20, t: 12, b: 26 }, rh = Math.min(24, (h - m.t - m.b) / Math.max(1, rows.length));
  let lo = nominal, hi = nominal; for (const r of rows) { lo = Math.min(lo, r.valueLow, r.valueHigh); hi = Math.max(hi, r.valueLow, r.valueHigh); }
  if (hi - lo < 1e-12) hi = lo + 1;
  const X = (v) => m.l + (v - lo) / (hi - lo) * (w - m.l - m.r);
  rows.forEach((r, i) => {
    const y = m.t + i * rh;
    g.fillStyle = css('--text', '#ddd'); g.fillText(r.label.slice(0, 24), 6, y + rh * 0.65);
    for (const [v, ok, c] of [[r.valueLow, r.successLow, '--c2'], [r.valueHigh, r.successHigh, '--c1']]) {
      if (!Number.isFinite(v)) continue;
      g.fillStyle = ok === false ? css('--bad', '#e5484d') : css(c, '#3ddc84'); g.globalAlpha = 0.85;
      g.fillRect(Math.min(X(v), X(nominal)), y + 3, Math.max(1, Math.abs(X(v) - X(nominal))), rh - 6); g.globalAlpha = 1;
    }
  });
  g.strokeStyle = css('--text', '#ddd'); g.beginPath(); g.moveTo(X(nominal), m.t); g.lineTo(X(nominal), h - m.b); g.stroke();
  g.fillStyle = css('--muted', '#888'); g.fillText(`${fmt(lo)}`, m.l, h - 8); g.fillText(`${fmt(hi)} ${unit}`, w - m.r - 80, h - 8); g.fillText(`nominal ${fmt(nominal)}`, X(nominal) + 4, h - 8);
}

// Scatter plot. opts: { points: [{x,y,ok}], xLabel, yLabel }
export function scatterChart(canvas, { points, xLabel = '', yLabel = '' }) {
  const { g, w, h } = setup(canvas);
  const m = { l: 62, r: 14, t: 16, b: 32 };
  const xs = points.map((p) => p.x).filter(Number.isFinite), ys = points.map((p) => p.y).filter(Number.isFinite);
  if (!xs.length) return;
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < 1e-12) x1 = x0 + 1; if (y1 - y0 < 1e-12) y1 = y0 + 1;
  const X = (v) => m.l + (v - x0) / (x1 - x0) * (w - m.l - m.r), Y = (v) => h - m.b - (v - y0) / (y1 - y0) * (h - m.t - m.b);
  g.fillStyle = css('--muted', '#888'); g.strokeStyle = css('--grid', '#222');
  for (const t of niceTicks(y0, y1)) { g.beginPath(); g.moveTo(m.l, Y(t)); g.lineTo(w - m.r, Y(t)); g.stroke(); g.fillText(fmt(t), 4, Y(t) + 4); }
  for (const t of niceTicks(x0, x1, 6)) g.fillText(fmt(t), X(t) - 10, h - m.b + 14);
  g.fillText(xLabel, w - m.r - g.measureText(xLabel).width, h - 4); g.fillText(yLabel, m.l + 4, 11);
  for (const p of points) { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; g.fillStyle = p.ok === false ? css('--bad', '#e5484d') : css('--accent', '#3ddc84'); g.beginPath(); g.arc(X(p.x), Y(p.y), 2.6, 0, 7); g.fill(); }
}
