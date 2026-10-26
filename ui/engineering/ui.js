// Shared UI helpers and project state for the Engineering Workbench.
import * as E from '../../src/engineering/index.js';
import { JOBS } from './jobs.js';
import { fmt } from './charts.js';
export { fmt };

// ---------- DOM ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
export const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`, onclick }, label);
export const canvas = (cls = '') => h('canvas', { class: cls });

// Provenance chip: every number shown must say which kind of model produced it.
const MODEL_TEXT = { physics: 'physics', approximation: 'approx', simplification: 'simplified', visual: 'visual only' };
export function modelTag(m, note) {
  const id = typeof m === 'object' && m ? m.model : m;
  if (!id) return h('span', { class: 'tag visual', title: 'No model information' }, 'unlabelled');
  return h('span', { class: `tag ${id}`, title: note || (typeof m === 'object' ? m.note : '') || '' }, MODEL_TEXT[id] || id);
}
export const status = (s) => h('span', { class: `st ${s}` }, s);
export function kpi(label, value, unit = '', model, note) {
  return h('div', { class: 'kpi' }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, fmt(value), h('span', { class: 'u' }, unit)), model ? h('div', { class: 'src' }, modelTag(model, note)) : null);
}
// table(columns, rows): column = [header, accessor(row) -> value|Node, opts{num}]
export function table(cols, rows, { onRow } = {}) {
  return h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c[0])))),
    h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null },
      cols.map((c) => { const v = c[1](r); return h('td', { class: c[2]?.num ? 'num' : '' }, v instanceof Node ? v : typeof v === 'number' ? fmt(v) : v ?? '—'); })))));
}
export function field(label, input) { return h('label', { class: 'f' }, label, input); }
export function num(value, onchange, { step = 'any', min, max, width } = {}) {
  return h('input', { type: 'number', value, step, min, max, style: width ? { width } : null, onchange: (e) => onchange(parseFloat(e.target.value)) });
}
export function select(options, value, onchange) {
  return h('select', { onchange: (e) => onchange(e.target.value) }, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === value }, l); }));
}
export function toast(text, ms = 2600) { const t = h('div', { class: 'toast' }, text); document.body.append(t); setTimeout(() => t.remove(), ms); }
export function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove();
}

// ---------- jobs (Web Worker with inline fallback) ----------
let worker = null, workerBroken = false, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; if (data.progress) return p.progress?.(data.progress); pending.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve(data.result); };
    worker.onerror = (e) => { e.preventDefault?.(); workerBroken = true; worker = null; for (const [id, p] of pending) { pending.delete(id); p.retry(); } };
  } catch { workerBroken = true; worker = null; }
  return worker;
}
const busyEl = () => document.getElementById('busy');
export async function runJob(job, args = {}, label = job) {
  const b = busyEl(); b.classList.add('on'); b.querySelector('.lbl').textContent = `Running: ${label}`; b.querySelector('.bar i').style.width = '0%';
  const progress = (p) => { if (p.total) b.querySelector('.bar i').style.width = `${(100 * p.done / p.total).toFixed(0)}%`; if (p.step) b.querySelector('.lbl').textContent = `${label}: ${p.step}`; };
  const inline = async () => { await new Promise((r) => setTimeout(r, 30)); return JOBS[job](structuredClone(args), progress); };
  const t0 = performance.now();
  try {
    const w = getWorker();
    const result = w ? await new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, progress, retry: () => inline().then(resolve, reject) }); w.postMessage({ id, job, args }); }) : await inline();
    state.perf.lastJob = { job, ms: performance.now() - t0, where: w ? 'worker' : 'main thread' }; renderFooter();
    return result;
  } finally { b.classList.remove('on'); }
}

// ---------- rebuild engine objects from plain job data ----------
export function revive(x) {
  if (x === null || typeof x !== 'object') return x;
  if (x.__recorder) return E.FlightRecorder.fromJSON(x.__recorder);
  if (x.__timeline) { const t = new E.Timeline(); t.events = x.__timeline; return t; }
  if (x.__twin) return x.__twin;
  if (x.__versions) return E.VersionStore.fromJSON(x.__versions);
  if (Array.isArray(x)) return x.map(revive);
  const o = {}; for (const [k, v] of Object.entries(x)) o[k] = revive(v); return o;
}

// ---------- project state ----------
export const state = {
  project: {
    name: 'Lunar mission', objective: 'Land crew on the Moon and return them safely to Earth.',
    vehicles: Object.fromEntries(Object.keys(E.LIBRARY).map((id) => [id, E.loadVehicle(id)])),
    versions: new E.VersionStore(), requirements: E.LUNAR_REQUIREMENTS,
    lastMission: null, lastMC: null, lastLoop: null, aiConversations: [], testResults: [], notes: '',
  },
  ui: { workspace: 'mission', theme: 'dark' },
  perf: { lastJob: null, fps: 0 },
  listeners: new Set(),
};
for (const v of Object.values(state.project.vehicles)) state.project.versions.commit(v, 'Library baseline', { author: 'library' });
export const onChange = (fn) => state.listeners.add(fn);
export const changed = () => { for (const fn of state.listeners) fn(); };

export function renderFooter() {
  const f = document.getElementById('foot'); if (!f) return;
  const p = state.project, j = state.perf.lastJob;
  f.replaceChildren(
    h('span', {}, `Project: ${p.name}`),
    h('span', {}, `Last mission: ${p.lastMission ? (p.lastMission.success ? 'success' : `failed in ${p.lastMission.failedPhase}`) : 'not flown'}`),
    h('span', {}, j ? `Last job: ${j.job} ${j.ms.toFixed(0)} ms (${j.where})` : 'No jobs yet'),
    h('span', { style: { flex: 1 } }),
    h('span', {}, 'Models: '), modelTag('physics', 'Governing equations integrated numerically'), modelTag('approximation', 'Engineering correlation or reduced-order model'), modelTag('simplification', 'Known simplification, see note'), modelTag('visual', 'Display only, never used for results'));
}

export { E };
