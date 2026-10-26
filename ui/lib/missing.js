// "What is missing?" card and launch gate. All content comes from src/core/needs.js (real checks, real fixes).
// "Fix it for me" runs the same validated tools the AI helper uses, then commits one undo step; nothing is faked.
import { h, clear, toast, modal } from './dom.js';
import { icon } from './icons.js';
import { launchChecklist, applyNeedFix } from '../../src/core/needs.js';
import { fixForIssue, NO_FIX } from '../../src/core/autofix.js';
import { validateVehicle } from '../../src/vehicles/analysis.js';

const TICK = { ok: 'OK', warn: '!', block: 'X', wait: '…' };

/** Go to the place where the problem is fixed (Rocket Builder deep link, with a highlighted note). */
export function showMeWhere(app, n) {
  const s = n.show ?? { screen: 'designer', params: {} };
  app.navigate(s.screen, s.screen === 'designer' ? { full: true, ...s.params } : { ...s.params });
}

/** Apply one need's fix. Returns {ok, message}. The change is one undo step ("Undo" in the top bar). */
export async function fixNeed(app, n) {
  const fx = n.fix;
  if (!fx) return { ok: false, message: 'No quick fix for this one.' };
  if (fx.kind === 'navigate') { app.navigate(fx.screen, fx.params ?? {}); return { ok: true, message: '', navigated: true }; }
  if (fx.tool === 'STOP_SIMULATION') { app.stopLive?.(); const r = await app.api.execute('STOP_SIMULATION', {}); return { ok: true, message: r.message ?? 'Stopped.' }; }
  const r = await applyNeedFix(app.api, fx);
  if (r.ok) { app.commit(`Fix: ${fx.label}`); }
  return r;
}

/**
 * Compact checklist card.
 * @param opts {running?:boolean, onChange?:(summary)=>void, onNavigate?:()=>void, onReady?:()=>void, readyLabel?:string, title?:string}
 */
export function needsPanel(app, opts = {}) {
  const root = h('div', { class: 'need-card', id: 'need-card' });
  const running = () => opts.running ?? !!(app.api?.ctx?.running);
  async function fixOne(n, btn) {
    btn.disabled = true;
    const r = await fixNeed(app, n);
    if (r.navigated) { opts.onNavigate?.(); return; }
    if (!r.ok) toast(r.message || 'That did not work. Try "Show me".', 'bad', 6000); else toast(r.message, 'ok', 3500);
    draw(); opts.onChange?.(summary());
  }
  async function fixAll() {
    for (let guard = 0; guard < 8; guard++) {
      const n = launchChecklist(app.project, { running: running() }).needs.find((x) => x.severity === 'block' && x.fix?.kind === 'tool');
      if (!n) break;
      const r = await fixNeed(app, n);
      if (!r.ok) { toast(r.message, 'bad', 6000); break; }
    }
    draw(); opts.onChange?.(summary());
  }
  const summary = () => launchChecklist(app.project, { running: running() });
  function draw() {
    const c = summary();
    const blocks = c.blocking.length;
    const fixable = c.needs.filter((n) => n.severity === 'block' && n.fix?.kind === 'tool');
    clear(root);
    root.className = `need-card ${blocks ? 'bad' : c.needs.length ? 'warn' : 'ok'}`;
    root.append(h('div', { class: 'need-head' },
      h('b', { id: 'need-title' }, opts.title ?? (blocks ? (blocks === 1 ? '1 thing missing' : `${blocks} things missing`) : c.needs.length ? 'Ready, with a tip' : 'All ready!')),
      h('span', { class: 'need-count muted' }, `${c.ready}/${c.total} OK`)));
    root.append(h('ul', { class: 'need-checks' }, c.checks.map((k) => h('li', { class: `need-check ${k.status}`, 'data-check': k.id }, h('span', { class: 'need-tick' }, TICK[k.status]), h('span', null, k.label)))));
    if (c.needs.length) {
      root.append(h('div', { class: 'need-list' }, c.needs.map((n) => h('div', { class: `need-item ${n.severity}`, 'data-need': n.id },
        h('span', { class: `need-ico ${n.severity}` }, icon(n.severity === 'block' ? 'warning' : 'info', { size: 20 })),
        h('div', { class: 'need-txt' },
          h('b', { class: 'need-t' }, n.title),
          h('div', { class: 'need-why' }, n.why),
          h('div', { class: 'need-where muted' }, 'Where: ', n.where)),
        h('div', { class: 'need-btns' },
          h('button', { class: 'btn small need-show', onclick: () => { showMeWhere(app, n); opts.onNavigate?.(); } }, 'Show me'),
          n.fix ? h('button', { class: 'btn small primary need-fix', title: n.fix.label, onclick: (e) => fixOne(n, e.currentTarget) }, n.fix.kind === 'navigate' ? n.fix.label : `Fix: ${n.fix.label}`.slice(0, 44)) : null)))));
      if (fixable.length > 1) root.append(h('div', { class: 'need-foot' }, h('button', { class: 'btn primary', id: 'need-fix-all', onclick: fixAll }, 'Fix everything for me'), h('span', { class: 'muted' }, 'You can undo.')));
    }
    if (!blocks && opts.onReady) root.append(h('div', { class: 'need-foot' }, h('button', { class: 'btn primary big', id: 'need-go', onclick: () => opts.onReady() }, opts.readyLabel ?? 'Launch now')));
  }
  draw();
  return root;
}

/**
 * Call before Run / Launch. Returns true when nothing blocks (go ahead). Otherwise opens the panel in a dialog and returns false.
 * With opts.inlineSelector (a panel already on screen) it is scrolled to and flashed instead of opening a dialog.
 * With opts.onReady the dialog offers "Launch now" once everything is fixed.
 */
export function launchGate(app, opts = {}) {
  const c = launchChecklist(app.project, { running: opts.running ?? !!(app.api?.ctx?.running) });
  if (!c.blocking.length) return true;
  const inline = opts.inlineSelector ? document.querySelector(opts.inlineSelector) : null;
  if (inline) { inline.scrollIntoView({ block: 'center', behavior: 'smooth' }); inline.classList.remove('need-pulse'); void inline.offsetWidth; inline.classList.add('need-pulse'); return false; }
  let m;
  const card = needsPanel(app, { ...opts, title: undefined, onNavigate: () => m?.close(), onReady: opts.onReady ? () => { m?.close(); opts.onReady(); } : null, readyLabel: opts.readyLabel });
  m = modal({ title: 'Not ready to launch yet', body: h('div', { class: 'need-modal' }, h('p', { class: 'need-lead' }, 'Fix these first.'), card), buttons: [{ label: 'Close' }] });
  return false;
}

/** Apply a fix (from fixForIssue / a need) as ONE undo step, say what happened, then call onDone so the screen re-validates. */
export async function runFix(app, fix, onDone) {
  const r = await applyNeedFix(app.api, fix);
  if (r.ok) { app.commit(`Fix: ${fix.label}`); toast(`Done: ${fix.label}. You can undo.`, 'ok', 3500); } else toast(r.message || 'That did not work. Try the editor.', 'bad', 6000);
  onDone?.(r);
  return r;
}

/** A "Fix it" button for one validator issue (null when there is no safe fix). */
export function fixButton(app, vehicle, issue, onDone, { body = null, cls = 'btn small primary' } = {}) {
  const fx = fixForIssue(vehicle, issue, { body });
  if (!fx) return null;
  return h('button', { class: `${cls} ed-fixbtn`, 'data-fix': issue.code, title: fx.label, onclick: (e) => { e.currentTarget.disabled = true; runFix(app, fx, onDone); } }, `Fix: ${fx.label}`.slice(0, 48));
}

/**
 * The design problems of a vehicle as short rows, each with a one-click fix when a safe one exists (otherwise the honest reason).
 * @param opts {onDone?:()=>void, body?:string, plain?:(issue, vehicle)=>{text}, adv?:boolean, showInfo?:boolean, onShow?:(issue)=>Node|null}
 */
export function issueRows(app, v, opts = {}) {
  let issues = [];
  try { issues = validateVehicle(v, { body: opts.body ?? v.meta?.body ?? 'earth' }); } catch { /* ignore */ }
  issues = issues.filter((i) => opts.showInfo || i.severity !== 'info');
  return issues.map((i) => {
    const p = opts.plain ? opts.plain(i, v) : { text: i.message };
    const btn = fixButton(app, v, i, opts.onDone, { body: opts.body });
    const why = !btn && NO_FIX[i.code] ? h('div', { class: 'muted ed-nofix' }, NO_FIX[i.code]) : null;
    return h('div', { class: `callout ed-issue ${i.severity === 'error' ? 'bad' : 'warn'}`, 'data-code': i.code },
      h('div', { class: 'ed-issue-body' }, h('span', { class: 'ed-issue-t' }, `${i.severity === 'error' ? 'Fix:' : 'Note:'} ${opts.adv && i.code ? `[${i.code}] ` : ''}${p.text}`), why),
      h('div', { class: 'ed-issue-btns' }, opts.onShow?.(i, p) ?? null, btn));
  });
}
