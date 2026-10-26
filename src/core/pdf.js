// Minimal dependency-free PDF writer (text, lines, rectangles, polylines) so that reports can be exported completely offline.
// Fonts: the standard PDF Helvetica / Helvetica-Bold (WinAnsi). Page size A4 portrait, units are points (1/72 inch).

const W = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584 };
for (let d = 0; d <= 9; d++) W[String(d)] = 556;

const TRANSLIT = { 'Δ': 'd', 'δ': 'd', 'α': 'a', 'β': 'b', 'γ': 'g', 'θ': 'th', 'λ': 'lambda', 'μ': 'µ', 'ρ': 'rho', 'σ': 'sigma', 'π': 'pi', 'ω': 'w', 'Ω': 'Ohm', '≥': '>=', '≤': '<=', '≈': '~', '→': '->', '←': '<-', '·': '·', '—': '-', '–': '-', '−': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '√': 'sqrt', '∫': 'int', '×': '×', '²': '²', '³': '³', '°': '°', '±': '±', '•': '•', '\u2713': 'OK', '\u2717': 'X', 'ˆ': '^', 'ṁ': 'mdot', 'q̇': 'q', '̇': '', '⁻': '-', '¹': '1', 'ₒ': 'o', '₀': '0', '₁': '1', '₂': '2', 'ₑ': 'e', 'ᵥ': 'v', '⁰': '0' };
const WIN_ANSI = { '°': 0xb0, '×': 0xd7, '²': 0xb2, '³': 0xb3, 'µ': 0xb5, '±': 0xb1, '•': 0x95, '·': 0xb7 };

function clean(str) {
  let out = '';
  for (const ch of String(str).replace(/Δv/g, 'delta-v').replace(/Δ/g, 'delta ')) {
    const c = TRANSLIT[ch] ?? ch;
    for (const x of c) { const code = x.codePointAt(0); out += code < 127 || WIN_ANSI[x] ? x : (code < 256 ? x : '?'); }
  }
  return out;
}
export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of clean(str)) w += (W[ch] ?? (ch === '°' || ch === '×' || ch === '²' || ch === 'µ' || ch === '±' ? 500 : 556)) * (bold ? 1.04 : 1);
  return (w * size) / 1000;
}
function esc(str) {
  let out = '';
  for (const ch of clean(str)) {
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (WIN_ANSI[ch]) out += '\\' + WIN_ANSI[ch].toString(8).padStart(3, '0');
    else out += ch;
  }
  return out;
}
const num = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (c) => c.map((x) => num(x)).join(' ');

export class PdfDoc {
  constructor({ width = 595.28, height = 841.89, margin = 44, title = 'ASTRA LAB report', author = 'ASTRA LAB', footer = null } = {}) {
    this.footer = footer;
    this.w = width; this.h = height; this.margin = margin; this.title = title; this.author = author;
    this.pages = []; this.newPage();
  }
  newPage() { this.page = []; this.pages.push(this.page); this.y = this.h - this.margin; return this.page; }
  get contentWidth() { return this.w - 2 * this.margin; }
  ensure(space) { if (this.y - space < this.margin + 18) { this.newPage(); return true; } return false; }
  raw(op) { this.page.push(op); }
  text(x, y, str, { size = 10, bold = false, color = [0.1, 0.1, 0.12] } = {}) {
    this.raw(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td (${esc(str)}) Tj ET`);
  }
  line(x1, y1, x2, y2, { width = 0.6, color = [0.6, 0.6, 0.65], dash = null } = {}) {
    this.raw(`${dash ? `[${dash.join(' ')}] 0 d ` : ''}${num(width)} w ${rgb(color)} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S${dash ? ' [] 0 d' : ''}`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, width = 0.6 } = {}) {
    let op = '';
    if (fill) op += `${rgb(fill)} rg `; if (stroke) op += `${rgb(stroke)} RG ${num(width)} w `;
    op += `${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`;
    this.raw(op);
  }
  polyline(points, { width = 1, color = [0.1, 0.4, 0.9] } = {}) {
    if (points.length < 2) return;
    let op = `${num(width)} w ${rgb(color)} RG 1 j 1 J ${num(points[0][0])} ${num(points[0][1])} m`;
    for (let i = 1; i < points.length; i++) op += ` ${num(points[i][0])} ${num(points[i][1])} l`;
    this.raw(op + ' S');
  }
  /** Wrapped paragraph; advances the cursor. */
  paragraph(str, { size = 10, bold = false, color, indent = 0, gap = 3, width } = {}) {
    const maxW = (width ?? this.contentWidth) - indent;
    const words = clean(str).split(/\s+/); let line = '';
    const lh = size * 1.32;
    const flush = () => { this.ensure(lh); this.y -= lh; this.text(this.margin + indent, this.y, line, { size, bold, color }); line = ''; };
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (textWidth(test, size, bold) > maxW && line) { flush(); line = wd; } else line = test;
    }
    if (line) flush();
    this.y -= gap;
  }
  heading(str, level = 1) {
    const size = level === 1 ? 15 : level === 2 ? 12 : 10.5;
    this.ensure(size * 3);
    this.y -= size * (level === 1 ? 0.9 : 0.6);
    this.paragraph(str, { size, bold: true, color: level === 1 ? [0.05, 0.2, 0.5] : [0.1, 0.1, 0.15], gap: level === 1 ? 4 : 2 });
    if (level === 1) { this.line(this.margin, this.y + 2, this.w - this.margin, this.y + 2, { color: [0.05, 0.2, 0.5], width: 0.8 }); this.y -= 4; }
  }
  /** Table with column widths (fractions). rows: array of arrays of strings. */
  table(header, rows, widths, { size = 9, colors = null, boldCols = [] } = {}) {
    const cw = this.contentWidth;
    const xs = []; let acc = this.margin; for (const f of widths) { xs.push(acc); acc += f * cw; }
    const rowH = size * 1.55;
    let rowNo = -1;
    const draw = (cells, bold, fill) => {
      const rn = rowNo++;
      // wrap cells
      const wrapped = cells.map((c, i) => {
        const maxW = widths[i] * cw - 8; const words = clean(c).split(/\s+/); const lines = []; let line = '';
        for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (textWidth(test, size, bold) > maxW && line) { lines.push(line); line = wd; } else line = test; }
        lines.push(line); return lines;
      });
      const h = Math.max(...wrapped.map((l) => l.length)) * size * 1.25 + 5;
      this.ensure(h + 2);
      if (fill) this.rect(this.margin, this.y - h, cw, h, { fill });
      wrapped.forEach((lines, i) => lines.forEach((ln, k) => this.text(xs[i] + 4, this.y - size * 1.05 - k * size * 1.25 - 1, ln, { size, bold: bold || boldCols.includes(i), color: rn >= 0 && colors ? colors(cells[i], i, rn) ?? undefined : undefined })));
      this.y -= h;
      this.line(this.margin, this.y, this.margin + cw, this.y, { color: [0.85, 0.85, 0.88], width: 0.4 });
    };
    if (header) draw(header, true, [0.9, 0.93, 0.98]);
    rows.forEach((r, i) => draw(r, false, i % 2 ? [0.975, 0.975, 0.985] : null));
    this.y -= 6; void rowH;
  }
  /** Line chart. series: [{label, values, color}], t: shared x values. */
  chart({ title, t, series, unit = '', height = 120, width, markers = [], limit = null }) {
    const cw = width ?? this.contentWidth, h = height;
    this.ensure(h + 30);
    this.y -= 12; this.text(this.margin, this.y, `${title}${unit ? ` [${unit}]` : ''}`, { size: 9.5, bold: true });
    const x0 = this.margin + 44, x1 = this.margin + cw - 6, yTop = this.y - 8, yBot = yTop - h;
    this.rect(x0, yBot, x1 - x0, h, { stroke: [0.7, 0.7, 0.75], width: 0.5 });
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi = lo + 1; }
    if (limit && Number.isFinite(limit.value)) { lo = Math.min(lo, limit.value); hi = Math.max(hi, limit.value); }
    const pad = 0.05 * (hi - lo); lo -= pad; hi += pad;
    const tMin = t[0], tMax = t[t.length - 1] > t[0] ? t[t.length - 1] : t[0] + 1;
    for (let k = 0; k <= 4; k++) {
      const yy = yBot + (k / 4) * h; const val = lo + (k / 4) * (hi - lo);
      this.line(x0, yy, x1, yy, { color: [0.9, 0.9, 0.93], width: 0.3 });
      this.text(this.margin, yy - 3, Math.abs(val) >= 1000 ? val.toExponential(1) : Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(2), { size: 7, color: [0.4, 0.4, 0.45] });
    }
    for (let k = 0; k <= 5; k++) { const xx = x0 + (k / 5) * (x1 - x0); this.text(xx - 8, yBot - 9, ((tMin + (k / 5) * (tMax - tMin))).toFixed(0), { size: 7, color: [0.4, 0.4, 0.45] }); }
    const palette = [[0.1, 0.4, 0.9], [0.9, 0.35, 0.1], [0.1, 0.65, 0.35], [0.6, 0.2, 0.7]];
    series.forEach((s, i) => {
      const pts = t.map((tt, j) => [x0 + ((tt - tMin) / (tMax - tMin)) * (x1 - x0), yBot + ((s.values[j] - lo) / (hi - lo)) * h]).filter((p) => Number.isFinite(p[1]));
      this.polyline(pts, { color: s.color ?? palette[i % palette.length], width: 1 });
      if (series.length > 1) this.text(x0 + 6 + i * 90, yTop - 9, s.label, { size: 7.5, color: s.color ?? palette[i % palette.length] });
    });
    if (limit && Number.isFinite(limit.value)) {
      const yy = yBot + ((limit.value - lo) / (hi - lo)) * h;
      this.line(x0, yy, x1, yy, { color: [0.8, 0.1, 0.1], width: 0.8, dash: [4, 3] });
      this.text(x1 - 4 - textWidth(limit.label ?? 'limit', 7), yy + 2, limit.label ?? 'limit', { size: 7, color: [0.8, 0.1, 0.1] });
    }
    const lastEnd = [-1e9, -1e9, -1e9];       // labels are written in three rows and only when there is room, so they never overlap
    [...markers].sort((a, b) => a.t - b.t).forEach((mk) => {
      if (!(mk.t >= tMin && mk.t <= tMax)) return;
      const xx = x0 + ((mk.t - tMin) / (tMax - tMin)) * (x1 - x0);
      this.line(xx, yBot, xx, yTop, { color: mk.color ?? [0.45, 0.45, 0.5], width: 0.6, dash: [2, 2] });
      if (!mk.label) return;
      const w = textWidth(mk.label, 6.5), row = lastEnd.findIndex((e) => xx + 2 > e + 3);
      if (row < 0 || xx + 2 + w > x1) return;
      lastEnd[row] = xx + 2 + w;
      this.text(xx + 2, yBot + 3 + row * 8, mk.label, { size: 6.5, color: mk.color ?? [0.35, 0.35, 0.4] });
    });
    this.text(x1 - 60, yBot - 18, 'time [s]', { size: 7, color: [0.4, 0.4, 0.45] });
    this.y = yBot - 26;
  }
  /** Horizontal bar chart. items: [{label, value, color, text?}] */
  bars({ title, items, unit = '', width, barH = 13 }) {
    const cw = width ?? this.contentWidth; const labW = 120, h = items.length * (barH + 4) + 8;
    this.ensure(h + 26); this.y -= 12; this.text(this.margin, this.y, `${title}${unit ? ` [${unit}]` : ''}`, { size: 9.5, bold: true });
    const x0 = this.margin + labW, maxV = Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));
    let y = this.y - 6;
    for (const it of items) {
      y -= barH + 4; this.text(this.margin, y + 3.5, it.label, { size: 8 });
      const w = (Math.abs(it.value) / maxV) * (cw - labW - 70);
      this.rect(x0, y, Math.max(0.5, w), barH, { fill: it.color ?? [0.1, 0.4, 0.9] });
      this.text(x0 + w + 4, y + 3.5, it.text ?? `${Math.abs(it.value) >= 100 ? it.value.toFixed(0) : it.value.toFixed(2)}`, { size: 8, color: [0.25, 0.25, 0.3] });
    }
    this.y = y - 8;
  }
  /** Histogram with stacked success (green) and failure (red) counts. h: {lo, hi, bins, ok[], bad[]} */
  histogram({ title, hist, label, height = 100, width }) {
    const cw = width ?? this.contentWidth; this.ensure(height + 36);
    this.y -= 12; this.text(this.margin, this.y, title, { size: 9.5, bold: true });
    const x0 = this.margin + 30, x1 = this.margin + cw - 6, yTop = this.y - 8, yBot = yTop - height;
    const mx = Math.max(1, ...hist.ok.map((v, i) => v + hist.bad[i])); const bw = (x1 - x0) / hist.bins;
    this.line(x0, yBot, x1, yBot, { color: [0.5, 0.5, 0.55] }); this.line(x0, yBot, x0, yTop, { color: [0.5, 0.5, 0.55] });
    for (let i = 0; i < hist.bins; i++) {
      const ho = (hist.ok[i] / mx) * height, hb = (hist.bad[i] / mx) * height;
      if (ho > 0) this.rect(x0 + i * bw + 0.5, yBot, bw - 1, ho, { fill: [0.27, 0.72, 0.45] });
      if (hb > 0) this.rect(x0 + i * bw + 0.5, yBot + ho, bw - 1, hb, { fill: [0.9, 0.3, 0.35] });
    }
    for (let k = 0; k <= 4; k++) { const v = hist.lo + ((hist.hi - hist.lo) * k) / 4; this.text(x0 + (k / 4) * (x1 - x0) - 10, yBot - 9, Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), { size: 7, color: [0.4, 0.4, 0.45] }); }
    this.text(this.margin, yTop - 6, String(mx), { size: 7, color: [0.4, 0.4, 0.45] }); this.text(this.margin + 8, yBot - 1, '0', { size: 7, color: [0.4, 0.4, 0.45] });
    this.text(x0 + 4, yBot - 18, `${label}  (green = success, red = failure)`, { size: 7.5, color: [0.3, 0.3, 0.35] });
    this.y = yBot - 26;
  }
  /** Tornado chart: items [{label, low, high}] around `center`. */
  tornado({ title, items, center, unit = '', width }) {
    const cw = width ?? this.contentWidth, labW = 130, rowH = 15; this.ensure(items.length * rowH + 40);
    this.y -= 12; this.text(this.margin, this.y, `${title}${unit ? ` [${unit}]` : ''}`, { size: 9.5, bold: true });
    const x0 = this.margin + labW, x1 = this.margin + cw - 10;
    const span = Math.max(1e-9, ...items.map((i) => Math.max(Math.abs(i.low - center), Math.abs(i.high - center))));
    const xm = (x0 + x1) / 2; const sc = (x1 - x0) / 2 / span;
    let y = this.y - 6;
    for (const it of items) {
      y -= rowH; this.text(this.margin, y + 3.5, it.label, { size: 8 });
      const a = xm + (it.low - center) * sc, b = xm + (it.high - center) * sc;
      this.rect(Math.min(a, b), y, Math.max(0.6, Math.abs(b - a)), rowH - 4, { fill: [0.9, 0.5, 0.2] });
    }
    this.line(xm, y - 2, xm, this.y - 4, { color: [0.2, 0.2, 0.25], width: 0.8 });
    this.text(xm - 20, y - 11, `mean ${Math.abs(center) >= 100 ? center.toFixed(0) : center.toFixed(2)}`, { size: 7, color: [0.3, 0.3, 0.35] });
    this.y = y - 18;
  }
  /** Finish and return the PDF bytes (Uint8Array). Page numbers and footer are added here. */
  build() {
    const enc = (s) => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out; };
    const objs = [];   // strings
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(''), pagesObj = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const infoObj = add(`<< /Title (${esc(this.title)}) /Author (${esc(this.author)}) /Producer (ASTRA LAB) >>`);
    const kids = [];
    this.pages.forEach((ops, i) => {
      const footer = `BT /F1 8 Tf 0.45 0.45 0.5 rg ${num(this.margin)} 24 Td (${esc(this.footer ?? this.title)}) Tj ET BT /F1 8 Tf 0.45 0.45 0.5 rg ${num(this.w - this.margin - 40)} 24 Td (Page ${i + 1} of ${this.pages.length}) Tj ET`;
      const content = ops.join('\n') + '\n' + footer;
      const cObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(this.w)} ${num(this.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cObj} 0 R >>`));
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%âãÏÓ\n'; const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return enc(out);
  }
}
