// Shared UI building blocks for the screens.
import { h, fmt, toast } from './dom.js';
import { SceneView, CAMERA_MODES } from './scene.js';
import { gloss } from './glossary.js';

export const DATA_LABELS = {
  real: { label: 'Real', tip: 'Based on published data of a real product or place.' },
  estimated: { label: 'Estimated', tip: 'An engineering estimate; not an official specification.' },
  user: { label: 'User-created', tip: 'Created or edited by you.' },
  fictional: { label: 'Fictional', tip: 'A generic, invented component. Not a real product.' },
};
export const dataBadge = (src, on = true) => (on === false ? null : h('span', { class: `badge data-${src ?? 'user'}`, title: (DATA_LABELS[src] ?? DATA_LABELS.user).tip }, (DATA_LABELS[src] ?? DATA_LABELS.user).label));
export const statusBadge = (s) => h('span', { class: `badge status-${String(s ?? '').toLowerCase()}` }, s ?? '–');
export const confBadge = (c) => h('span', { class: `badge conf-${String(c ?? '').toLowerCase()}` }, c ?? '');

export function panel(title, body, { actions = null, cls = '' } = {}) {
  return h('section', { class: `panel ${cls}` }, title || actions ? h('header', { class: 'panel-head' }, h('h3', null, title ?? ''), actions ? h('div', { class: 'panel-actions' }, actions) : null) : null, h('div', { class: 'panel-body' }, body));
}
export const kv = (rows) => h('dl', { class: 'kv' }, rows.filter(Boolean).map(([k, v, tip]) => [h('dt', { title: tip }, k), h('dd', null, v)]));
export const stat = (label, value, sub, cls = '') => h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-l' }, label), h('div', { class: 'stat-v' }, value), sub ? h('div', { class: 'stat-s' }, sub) : null);

export function select(options, value, onchange, attrs = {}) {
  const el = h('select', { class: 'input', ...attrs }, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, l); }));
  if (onchange) el.addEventListener('change', () => onchange(el.value));
  return el;
}
export function numberInput({ value, min, max, step = 'any', onchange, unit = '', width = '110px' }) {
  const inp = h('input', { class: 'input num', type: 'number', value: Number.isFinite(value) ? value : '', min, max, step, style: { width } });
  inp.addEventListener('change', () => { let v = parseFloat(inp.value); if (!Number.isFinite(v)) { inp.value = value; return; } if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v); inp.value = v; onchange?.(v); });
  return unit ? h('span', { class: 'with-unit' }, inp, h('span', { class: 'unit' }, unit)) : inp;
}
export function tabs(items, active, onchange) {
  const el = h('div', { class: 'tabs' }, items.map(([id, label]) => h('button', { class: `tab ${id === active ? 'active' : ''}`, onclick: () => { onchange(id); } }, label)));
  return el;
}
export function emptyState(title, text, actions = [], icon = null) {
  return h('div', { class: 'empty' }, icon ? h('div', { class: 'empty-ico' }, icon) : null, h('div', { class: 'empty-title' }, title), h('p', null, text), h('div', { class: 'row' }, actions));
}

/** requestAnimationFrame loop limited to `maxFps`; returns a stop function. */
export function loop(fn, maxFps = 60) {
  let raf = 0, last = performance.now(), alive = true;
  const minDt = 1000 / Math.max(5, maxFps);
  const tick = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = now - last; if (dt < minDt - 1) return;
    last = now;
    try { fn(dt / 1000, now); } catch (e) { console.error(e); }
  };
  raf = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

/** One shared WebGL canvas for the whole application (browsers limit the number of GL contexts). */
export function sharedScene(app) {
  if (!app._scene) {
    const canvas = h('canvas', { class: 'gl-canvas', tabindex: 0 });
    try { app._scene = new SceneView(canvas, { antialias: app.settings.quality === 'high', quality: app.settings.quality }); app._sceneError = null; }
    catch (e) { app._scene = null; app._sceneError = e.message; app._sceneCanvas = canvas; }
  }
  return app._scene;
}
/** Create the 3D stage element: canvas + camera mode buttons + overlay slot. Returns {el, view, overlay, setMode, error}. */
export function sceneStage(app, { modes = CAMERA_MODES, mode = 'free', hint = true } = {}) {
  const view = sharedScene(app);
  const wrap = h('div', { class: 'stage' });
  const overlay = h('div', { class: 'stage-overlay' });
  const bar = h('div', { class: 'camera-bar' });
  if (!view) {
    wrap.append(h('div', { class: 'stage-error' }, h('b', null, '3D view unavailable'), h('p', null, app._sceneError ?? 'WebGL could not be started.'), h('p', { class: 'muted' }, 'All numbers, graphs and reports still work. Try updating the graphics driver, or turn off "hardware acceleration off" in your system.')));
    return { el: wrap, view: null, overlay, setMode() {}, error: app._sceneError };
  }
  view.setMode(mode);
  const hintEl = h('span', { class: 'camera-hint' }, CAMERA_MODES.find((m) => m.id === mode)?.hint ?? '');
  const btns = modes.map((m) => h('button', { class: `chip ${m.id === mode ? 'active' : ''}`, title: m.hint, 'data-mode': m.id, onclick: () => setMode(m.id) }, m.label));
  function setMode(id) {
    view.setMode(id); view.cam.zoom = 1; if (!view.flightMode) view.fitDesign?.();
    btns.forEach((b) => b.classList.toggle('active', b.dataset.mode === id));
    hintEl.textContent = CAMERA_MODES.find((m) => m.id === id)?.hint ?? '';
    view.onChange?.();
  }
  bar.append(...btns, hint ? hintEl : null);
  wrap.append(view.canvas, bar, overlay);
  return { el: wrap, view, overlay, setMode, error: null };
}

/** Download text / binary as a file (browser) or through the Electron save dialog when available. */
export async function saveFile(app, name, data, mime = 'application/octet-stream') {
  try {
    if (app.bridge?.saveFile) { const r = await app.bridge.saveFile(name, data instanceof Uint8Array ? data : new TextEncoder().encode(data)); if (r?.path) { toast(`Saved ${r.path}`, 'ok'); return r.path; } return null; }
    const blob = new Blob([data], { type: mime }); const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Downloaded ${name}`, 'ok'); return name;
  } catch (e) { toast(`Could not save ${name}: ${e.message}`, 'bad'); return null; }
}
export function pickFile(accept = '.json') {
  if (globalThis.astra?.openFile) return globalThis.astra.openFile(accept);
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); resolve(f ? { name: f.name, text: await f.text() } : null); });
    document.body.append(inp); inp.click();
  });
}
export const badgeRow = (...b) => h('span', { class: 'badge-row' }, b);
export const equation = (title, formula, values) => h('div', { class: 'equation' }, h('div', { class: 'eq-title' }, title), h('div', { class: 'eq-formula' }, formula), values ? h('div', { class: 'eq-values' }, values) : null);
export { h, fmt, toast };

/** Small "?" bubble with a one-sentence explanation (hover, focus or tap). */
export function helpTip(text) {
  const tip = h('span', { class: 'sh-tip', tabindex: 0, role: 'note', 'aria-label': text, 'data-tip': text }, '?');
  return tip;
}
/** A closed "More" box that hides advanced content: <details> with a plain summary. */
export function moreBox(title = 'More', ...children) {
  return h('details', { class: 'sh-more' }, h('summary', null, title), h('div', { class: 'sh-more-body' }, children));
}

/** A jargon word with a dotted underline and a plain-words tooltip (and a click popover with a lesson link) from the Academy glossary: term('delta-v'), term('TWR', 'thrust-to-weight'). */
export function term(name, label) { return gloss(name, label); }
