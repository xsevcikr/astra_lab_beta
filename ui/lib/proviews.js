// Small canvas drawings shared by the professional screens (requirements evidence, failure timeline, Monte Carlo, trade study).
// Colours match the dark theme used by ui/lib/charts.js.
const BG = '#0a100e', GRID = '#1b2823', TXT = '#9bb0a7', BRIGHT = '#cfe0d8';
const FONT = '11px "Segoe UI", system-ui, sans-serif';
function prep(canvas, minH = 120) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 600, h = canvas.clientHeight || minH;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = BG; g.fillRect(0, 0, w, h); g.font = FONT;
  return { g, w, h };
}
const num = (v) => (Math.abs(v) >= 1e4 ? v.toExponential(1) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

/** One telemetry channel against time with a marked moment and an optional limit line. */
export function drawEvidence(canvas, { t, y, label = '', unit = '', mark = null, limit = null, color = '#2bd9a0', extra = null }) {
  const { g, w, h } = prep(canvas, 150); const L = 52, R = 10, T = 18, B = 22, pw = w - L - R, ph = h - T - B;
  let lo = Infinity, hi = -Infinity;
  const take = (arr) => { for (const v of arr) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
  take(y); if (extra) take(extra.y); if (limit && Number.isFinite(limit.value)) take([limit.value]);
  if (!Number.isFinite(lo)) { g.fillStyle = TXT; g.fillText('no data', 10, 20); return; }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const pad = 0.06 * (hi - lo); lo -= pad; hi += pad;
  const t0 = t[0], t1 = t[t.length - 1] > t[0] ? t[t.length - 1] : t[0] + 1;
  const X = (v) => L + ((v - t0) / (t1 - t0)) * pw, Y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
  g.strokeStyle = GRID; g.fillStyle = TXT; g.textAlign = 'right'; g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(L + pw, Y(v)); g.stroke(); g.fillText(num(v), L - 5, Y(v) + 3); }
  g.textAlign = 'center'; for (let k = 0; k <= 5; k++) { const v = t0 + ((t1 - t0) * k) / 5; g.fillText(v.toFixed(0), X(v), h - 8); }
  const line = (arr, col) => { g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); let started = false; for (let i = 0; i < t.length; i++) { if (!Number.isFinite(arr[i])) continue; const px = X(t[i]), py = Y(arr[i]); if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py); } g.stroke(); };
  line(y, color); if (extra) line(extra.y, '#ff7a45');
  if (limit && Number.isFinite(limit.value)) { g.strokeStyle = '#ff5c6a'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, Y(limit.value)); g.lineTo(L + pw, Y(limit.value)); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff5c6a'; g.textAlign = 'right'; g.fillText(limit.label ?? 'limit', L + pw - 4, Y(limit.value) - 4); }
  if (mark && Number.isFinite(mark.t)) { const x = X(Math.min(t1, Math.max(t0, mark.t))); g.strokeStyle = '#ffb84a'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffb84a'; g.textAlign = x > L + pw - 90 ? 'right' : 'left'; g.fillText(mark.label ?? `T+${mark.t.toFixed(0)} s`, x + (x > L + pw - 90 ? -4 : 4), T + 10); }
  g.fillStyle = BRIGHT; g.textAlign = 'left'; g.fillText(`${label}${unit ? ` [${unit}]` : ''}  vs time [s]`, L, 11);
}

/** Histogram with success (green) and failure (red) stacked. hist = histogramBins() output. */
export function drawHistogram(canvas, hist, label) {
  const { g, w, h } = prep(canvas, 190);
  if (!hist) { g.fillStyle = TXT; g.fillText('no data', 10, 20); return; }
  const L = 40, R = 10, T = 12, B = 36, pw = w - L - R, ph = h - T - B, bw = pw / hist.bins;
  const mx = Math.max(1, ...hist.ok.map((v, i) => v + hist.bad[i]));
  g.strokeStyle = '#26352f'; g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(L + pw, T + ph); g.stroke();
  for (let i = 0; i < hist.bins; i++) {
    const ho = (hist.ok[i] / mx) * ph, hb = (hist.bad[i] / mx) * ph, x = L + i * bw + 1;
    g.fillStyle = '#84e060'; g.fillRect(x, T + ph - ho, bw - 2, ho); g.fillStyle = '#ff5c6a'; g.fillRect(x, T + ph - ho - hb, bw - 2, hb);
  }
  g.fillStyle = TXT; g.textAlign = 'center'; for (let i = 0; i <= 4; i++) g.fillText(num(hist.lo + ((hist.hi - hist.lo) * i) / 4), L + (pw * i) / 4, h - 20);
  g.fillText(label, L + pw / 2, h - 5); g.textAlign = 'right'; g.fillText(String(mx), L - 5, T + 8); g.fillText('0', L - 5, T + ph);
}

/** Tornado: bars from low to high result around the mean, one row per input. items = tornado() output. */
export function drawTornado(canvas, items, label) {
  const { g, w, h } = prep(canvas, 160);
  const rows = items.filter((x) => x.low != null);
  if (!rows.length) { g.fillStyle = TXT; g.fillText('not enough runs', 10, 20); return; }
  const center = (rows[0].low + rows[0].high) / 2; const labW = 150, T = 18, rowH = Math.min(26, (h - T - 22) / rows.length);
  const span = Math.max(1e-12, ...rows.map((r) => Math.max(Math.abs(r.low - center), Math.abs(r.high - center))));
  const xm = labW + (w - labW - 12) / 2, sc = ((w - labW - 12) / 2) / span;
  g.fillStyle = BRIGHT; g.textAlign = 'left'; g.fillText(label, 8, 11);
  rows.forEach((r, i) => {
    const y = T + i * rowH; const a = xm + (r.low - center) * sc, b = xm + (r.high - center) * sc;
    g.fillStyle = TXT; g.textAlign = 'left'; g.fillText(r.factor, 8, y + rowH / 2 + 3);
    g.fillStyle = '#ff9a55'; g.fillRect(Math.min(a, b), y + 3, Math.max(1, Math.abs(b - a)), rowH - 7);
  });
  g.strokeStyle = BRIGHT; g.beginPath(); g.moveTo(xm, T); g.lineTo(xm, T + rows.length * rowH); g.stroke();
  g.fillStyle = TXT; g.textAlign = 'center'; g.fillText(`mean ${num(center)}`, xm, T + rows.length * rowH + 13);
}

export const riskColor = (r) => (r < 0.5 ? '#84e060' : r < 0.8 ? '#ffb84a' : '#ff5c6a');
/** Trade study: payload (up) against cost (right); colour = risk; hollow grey = dominated; red cross = did not reach the goal. */
export function drawTrade(canvas, entries, { costLabel = 'Hardware cost [M US$, illustrative]' } = {}) {
  const { g, w, h } = prep(canvas, 250); const L = 52, R = 24, T = 18, B = 34, pw = w - L - R, ph = h - T - B;
  const xs = entries.map((e) => e.cost / 1e6), ys = entries.map((e) => (e.feasible ? e.payload : e.designPayload));
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; } if (y1 - y0 < 1e-9) { y0 -= 10; y1 += 10; }
  const px = (x1 - x0) * 0.2, py = (y1 - y0) * 0.25; x0 -= px; x1 += px; y0 = Math.max(0, y0 - py); y1 += py;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * pw, Y = (v) => T + ph - ((v - y0) / (y1 - y0)) * ph;
  g.strokeStyle = GRID; g.fillStyle = TXT; g.textAlign = 'right';
  for (let k = 0; k <= 4; k++) { const v = y0 + ((y1 - y0) * k) / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(L + pw, Y(v)); g.stroke(); g.fillText(num(v), L - 5, Y(v) + 3); }
  g.textAlign = 'center'; for (let k = 0; k <= 4; k++) { const v = x0 + ((x1 - x0) * k) / 4; g.fillText(v.toFixed(2), X(v), T + ph + 14); }
  g.fillText(costLabel, L + pw / 2, h - 5); g.save(); g.translate(12, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText('Payload [kg]', 0, 0); g.restore();
  const placed = [];
  entries.forEach((e, i) => {
    const x = X(xs[i]), y = Y(ys[i]); const r = 9;
    let ly = y - r; while (placed.some((q) => Math.abs(q.y - ly) < 13 && Math.abs(q.x - x) < 150)) ly += 13; placed.push({ x, y: ly });
    if (!e.feasible) { g.strokeStyle = '#ff5c6a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
    else if (e.dominated) { g.strokeStyle = '#8da399'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.setLineDash([]); }
    else { g.fillStyle = riskColor(e.mc ? e.mc.p : e.riskMargin); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    g.fillStyle = BRIGHT; g.textAlign = x > L + pw - 80 ? 'right' : 'left'; g.fillText(e.label.slice(0, 26), x + (x > L + pw - 80 ? -r - 4 : r + 4), ly);
  });
  g.lineWidth = 1;
}
