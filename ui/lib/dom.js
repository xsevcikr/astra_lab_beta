// Tiny DOM helpers (no framework): element builder, formatting, toasts and modal dialogs.
// Element.append is made tolerant: null / undefined / false are skipped (instead of printing "null") and arrays are flattened, like in h().
if (typeof Element !== 'undefined' && !Element.prototype.__astraAppend) {
  const nativeAppend = Element.prototype.append;
  Element.prototype.append = function append(...c) { return nativeAppend.apply(this, c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); };
  Element.prototype.__astraAppend = true;
}
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c.nodeType ? c : document.createTextNode(String(c))); };
  children.forEach(add);
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(el) { if (el.replaceChildren) el.replaceChildren(); else while (el.firstChild) el.removeChild(el.firstChild); return el; }   // replaceChildren cannot throw when a blur handler re-renders while the focused field is being removed
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (x, d = 1) => (Number.isFinite(x) ? (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : Number(x).toFixed(d)) : '–'); // never "-0.0"
export const fmtTime = (s) => { if (!Number.isFinite(s)) return '–'; const sign = s < 0 ? '-' : '+'; s = Math.abs(s); const m = Math.floor(s / 60), sec = s - m * 60; return `T${sign}${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`; };

let toastHost;
export function toast(msg, kind = 'info', ms = 4200) {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts' }));
  const t = toastHost.appendChild(h('div', { class: `toast ${kind}` }, msg));
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

/** Modal dialog. Returns {close, body}. `buttons`: [{label, primary, onClick}] */
export function modal({ title, body, buttons = [], wide = false }) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title });
  const close = () => back.remove();
  box.append(h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, '×')));
  const bodyEl = h('div', { class: 'modal-body' }, body);
  box.append(bodyEl);
  if (buttons.length) box.append(h('div', { class: 'modal-foot' }, buttons.map((b) => h('button', { class: `btn ${b.primary ? 'primary' : ''}`, onclick: async () => { const r = await b.onClick?.(close); if (r !== false) close(); } }, b.label))));
  back.append(box); back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, body: bodyEl };
}
export const confirmDialog = (title, text) => new Promise((res) => modal({ title, body: h('p', null, text), buttons: [{ label: 'Cancel', onClick: () => res(false) }, { label: 'OK', primary: true, onClick: () => res(true) }] }));
export const promptDialog = (title, label, value = '') => new Promise((res) => {
  const inp = h('input', { type: 'text', value, class: 'input', style: { width: '100%' } });
  const m = modal({ title, body: h('label', null, label, h('div', { style: { marginTop: '8px' } }, inp)), buttons: [{ label: 'Cancel', onClick: () => res(null) }, { label: 'OK', primary: true, onClick: () => res(inp.value.trim() || null) }] });
  setTimeout(() => inp.focus(), 30);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { res(inp.value.trim() || null); m.close(); } });
});

/** Minimal markdown for AI replies: **bold**, `code`, _italic_, lists, tables, paragraphs. Output is escaped first, so no HTML injection. */
export function mdToHtml(src) {
  const lines = String(src ?? '').split('\n');
  const out = []; let list = false, table = null;
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, '$1<i>$2</i>');
  const flush = () => { if (list) { out.push('</ul>'); list = false; } if (table) { out.push(`<table class="md"><thead><tr>${table.head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); table = null; } };
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!table) { flush(); table = { head: cells, rows: [] }; } else table.rows.push(cells);
      continue;
    }
    if (/^\s*[-•]\s+/.test(line)) { if (table) flush(); if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.replace(/^\s*[-•]\s+/, ''))}</li>`); continue; }
    flush();
    if (!line.trim()) { out.push('<div class="gap"></div>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}

/** Pointer position inside an element in the element's own CSS pixels. Correct even when the interface is scaled with CSS zoom (text size setting). */
export function localPoint(el, e) {
  const r = el.getBoundingClientRect(); const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k };
}
