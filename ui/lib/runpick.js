// Run selector shared by the Telemetry, Replay, Analysis screens.
import { h } from './dom.js';
import { select } from './widgets.js';
import { pickRunId } from '../../src/core/consistency.js';
import { t } from '../../src/core/i18n.js';

/** A <select> listing the recorded runs of the current project (newest first). */
export function runSelect(app, value, onchange, { none = null } = {}) {
  const runs = app.runList();
  const opts = runs.map((r) => [r.id, `${r.name} — ${r.status ?? '?'}`]);
  if (none) opts.unshift(['', none]);
  return select(opts, value ?? '', (x) => onchange(x), { style: { maxWidth: '360px' } });
}
/** The run that should be shown: explicit param, else the selected run, else the newest flight of the active vehicle (see consistency.js). */
export function currentRunId(app, params) {
  const ids = app.project.runs.map((r) => r.id);
  const want = params?.runId && ids.includes(params.runId) ? params.runId : app.selectedRun;
  return pickRunId(app.project, want);
}
export const noRunHint = (app) => h('div', { class: 'empty', id: 'no-run-hint' }, h('div', { class: 'empty-title' }, t('empty.noflight', 'No flight yet - Launch a rocket')), h('p', null, t('empty.noflight.sub', 'Every flight is recorded automatically and appears here.')),
  h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', id: 'launch-it-btn', onclick: () => app.navigate('simulation') }, '▶ ' + t('btn.launchit', 'Launch It')), h('button', { class: 'btn', onclick: () => app.navigate('home') }, t('btn.demo.load', 'Load the demo project'))));
