// ASTRA LAB renderer entry point: storage selection, application object, navigation shell, keyboard shortcuts, error reporting.
import { App } from './lib/app.js';
import { installSky } from './lib/skybg.js';
import { installDecor } from './lib/decor.js';
import { createIpcStorage } from '../src/core/storage.js';
import { createIdbStorage } from './lib/idb-storage.js';
import { h, clear, toast } from './lib/dom.js';
import { statusBadge, select } from './lib/widgets.js';
import { setGlossaryApp } from './lib/glossary.js';
import { startTour } from './lib/tour.js';
import { installShell, openHelp, openPalette } from './lib/shell.js';
import { LEVELS, LEVEL_NAMES, LEVEL_HINTS } from '../src/core/levels.js';
import { iconSvg, hasIcon, icon } from './lib/icons.js';
import { t, LANGS } from '../src/core/i18n.js';
import { installFx, countUp } from './lib/fx.js';
import { installShareLinks } from './lib/sharedialog.js';

const NAV_GROUPS = [
  ['Start', ['home', 'academy', 'ai']],
  ['Design', ['designer', 'testbench', 'planner']],
  ['Fly', ['simulation', 'control', 'challenges']],
  ['Understand', ['analysis', 'telemetry', 'replay', 'failure', 'requirements']],
  ['Study', ['experiments', 'trade', 'engineering', 'validation']],
  ['Project', ['projects', 'history', 'teacher', 'settings']],
];
// [id, expert name, icon, plain name (Beginner mode), shown in Beginner mode without "More tools"]
const SCREENS = [
  ['home', 'Home', 'H', 'Home', true], ['academy', 'Aerospace Academy', 'A', 'Academy', true], ['ai', 'AI Engineer', 'I', 'AI Helper', true],
  ['designer', 'Vehicle Designer', 'B', 'Build a rocket', true], ['testbench', 'Test bench', 'T', 'Will it work?', true], ['simulation', 'Simulation', 'L', 'Launch it', true], ['challenges', 'Challenges', 'C', 'Challenges', true], ['analysis', 'Engineering Analysis', 'W', 'What happened?', true],
  ['planner', 'Mission Planner', 'P', 'Mission plan', false], ['control', 'Mission Control', 'O', 'Live flight', false], ['telemetry', 'Telemetry', 'D', 'Flight data', false], ['replay', 'Replay', 'Y', 'Replay', false],
  ['experiments', 'Experiment Lab', 'E', 'Experiments', false], ['engineering', 'Engineering Workbench', 'Q', 'Engineering', false], ['requirements', 'Mission requirements', 'R', 'Did it meet the rules?', false], ['failure', 'Failure analysis', 'F', 'Why did it fail?', false], ['trade', 'Trade study', 'V', 'Compare designs', false],['projects', 'Projects', 'J', 'My projects', false], ['history', 'Design history', 'H', 'Version history', false], ['teacher', 'Teacher mode', 'T', 'Teacher', false], ['validation', 'Validation', 'K', 'Does it match real rockets?', false], ['settings', 'Settings', 'S', 'Settings', true],
];

// Sidebar icons come from ui/lib/icons.js (one line-icon system for the whole app).
function navIcon(id, fallback) {
  if (!hasIcon(id)) return fallback;
  const el = h('span', { class: 'nav-svg', 'aria-hidden': 'true' }); el.innerHTML = iconSvg(id, { size: 19 }); return el;
}
const modules = {};
async function loadScreen(id) {
  if (!modules[id]) modules[id] = (await import(`./screens/${id}.js`)).default;
  return modules[id];
}

const bridge = globalThis.astra ?? null;
const log = (level, msg, extra) => { try { bridge?.log?.(level, msg, extra); } catch { /* ignore */ } (level === 'error' ? console.error : console.log)(`[astra] ${msg}`, extra ?? ''); };

async function boot() {
  let storage, storageNote = '';
  if (bridge?.storage) storage = createIpcStorage(bridge.storage);
  else { try { storage = await createIdbStorage(); storageNote = 'Browser storage (IndexedDB)'; } catch (e) { const { MemoryStorage } = await import('../src/core/storage.js'); storage = new MemoryStorage(); storageNote = 'Temporary memory only (storage unavailable)'; } }
  const app = new App({ storage, bridge });
  app.log = log; app.storageNote = storageNote || 'Local data folder';
  setGlossaryApp(app);
  window.astraApp = app;    // used by the automated UI tests
  let first;
  try { first = await app.init(); } catch (e) { log('error', 'init failed', String(e)); app.attach(app.freshProject('My first project')); first = { firstRun: true }; toast(app.settings.mode === 'beginner' ? t('msg.newproject', 'Started with a new project.') : `${t('msg.newproject', 'Started with a new project.').replace(/\.$/, '')} (${e.message})`, 'bad', 8000); }
  const nav = document.getElementById('nav'), screenEl = document.getElementById('screen'), top = document.getElementById('topbar'), status = document.getElementById('statusbar');

  // ---- detail level and text size
  const appEl = document.getElementById('app');
  // The text size is the student's choice, but never so big that the window gets cramped: the page is always at least 1000 x 620 "CSS pixels".
  function applyLook() {
    const pref = app.settings.textScale || 1;
    const vw = window.innerWidth || 1366, vh = window.innerHeight || 768;
    const z = Math.round(Math.max(0.8, Math.min(pref, vw / 1000, vh / 620)) * 100) / 100;
    const W = vw / z, H = vh / z;
    document.body.dataset.mode = app.settings.mode || 'beginner';
    appEl.lang = app.settings.lang || 'en';
    appEl.style.zoom = String(z);
    appEl.style.height = `calc(100vh / ${z})`; appEl.style.width = `calc(100vw / ${z})`;
    appEl.dataset.w = W < 900 ? 'xs' : W < 1250 ? 's' : 'l';       // xs: icon-only sidebar, s: compact, l: roomy
    appEl.dataset.h = H < 680 ? 'short' : 'tall';
    appEl.dataset.zoom = String(z);
  }
  applyLook(); installFx(app);
  app.on('settings', (k) => { if (k === 'mode' || k === 'textScale' || k === 'lang') { applyLook(); show(); renderStatus(); } else if (k === 'units') { show(); renderStatus(); } });
  window.addEventListener('resize', applyLook);

  // ---- navigation
  const renderNav = () => {
    clear(nav);
    const beginnerNav = app.settings.mode === 'beginner';
    nav.append(h('div', { class: 'brand' }, h('span', { class: 'logo-mark' }, '◈'), h('span', { class: 'txt' }, 'ASTR', h('em', null, 'A'), ' LAB', h('small', null, beginnerNav ? t('brand.sub.beginner', 'Your rocket lab') : t('brand.sub', 'Aerospace engineering laboratory')))));
    const beginner = app.settings.mode === 'beginner', all = !beginner || app.settings.showAllTools;
    // 2.2: the longer menu is grouped by what you are doing, and every expert name shows its plain meaning underneath
    const GROUPS = beginner ? [[null, SCREENS.map((x) => x[0])]] : NAV_GROUPS;
    const byId = Object.fromEntries(SCREENS.map((x) => [x[0], x]));
    for (const [group, ids] of GROUPS) {
      const items = ids.map((i) => byId[i]).filter((x) => x && (all || x[4]));
      if (!items.length) continue;
      if (group) nav.append(h('div', { class: 'nav-group' }, group));
      for (const [id, label, ico, plain] of items) {
        const name = t(`nav.${id}.${beginner ? 'plain' : 'full'}`, beginner ? plain : label);
        nav.append(h('button', { class: `nav-item ${app.screenId === id ? 'active' : ''}`, 'data-screen': id, title: t(`nav.${id}.full`, label), onclick: () => app.navigate(id) }, h('span', { class: 'ico' }, navIcon(id, ico)), h('span', { class: 'lbl' }, name, !beginner && plain && plain !== label ? h('small', { class: 'sub' }, plain) : null)));
      }
    }
    if (beginner) nav.append(h('button', { class: 'nav-item more', id: 'nav-more', onclick: () => { app.setSetting('showAllTools', !app.settings.showAllTools); renderNav(); } }, h('span', { class: 'ico' }, app.settings.showAllTools ? '▴' : '▾'), h('span', { class: 'lbl' }, app.settings.showAllTools ? t('nav.fewer', 'Fewer tools') : t('nav.more', 'More tools'))));
  };
  let cleanup = null, mountToken = 0;
  async function show() {
    const token = ++mountToken;
    try { cleanup?.(); } catch (e) { log('error', 'screen cleanup failed', String(e)); }
    cleanup = null; clear(screenEl); screenEl.classList.remove('fill');
    renderNav(); renderTop();
    try {
      const mod = await loadScreen(app.screenId);
      if (token !== mountToken) return;
      if (mod.fill) screenEl.classList.add('fill');
      cleanup = (await mod.mount(screenEl, app, app.screenParams)) ?? null;
      setTimeout(() => { for (const el of screenEl.querySelectorAll('.stat-v')) { const m = /^(\d+(?:\.\d+)?)$/.exec(el.textContent.trim()); if (m) countUp(el, +m[1], { digits: (m[1].split('.')[1] ?? '').length }); } }, 60);
    } catch (e) {
      log('error', `screen ${app.screenId} failed`, e?.stack ?? String(e));
      clear(screenEl).append(h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, t('err.screen', 'This screen could not be opened')), h('p', null, String(e?.message ?? e)), h('button', { class: 'btn', onclick: () => app.navigate('home') }, t('err.gohome', 'Go to Home'))));
    }
  }
  app.on('navigate', show);

  // ---- top bar / status bar
  const saveTexts = () => ({
    long: { saved: t('save.saved.long', 'All changes saved'), dirty: t('save.dirty.long', 'Unsaved changes'), saving: t('save.saving', 'Saving…'), error: t('save.error', 'Save failed') },
    short: { saved: t('save.saved', 'Saved'), dirty: t('save.dirty', 'Not saved yet'), saving: t('save.saving', 'Saving…'), error: t('save.error', 'Save failed') },
  });
  const saveLabel = new Proxy({}, { get: (_, k) => saveTexts()[app.settings.mode === 'beginner' ? 'short' : 'long'][k] });
  const SAVE_SHORT = new Proxy({}, { get: (_, k) => saveTexts().short[k] });
  function renderTop() {
    clear(top);
    const cur = SCREENS.find((s) => s[0] === app.screenId);
    const lvl = app.settings.mode, imp = app.settings.units === 'imperial';
    const unitBtn = h('button', { class: 'btn small unit-toggle', id: 'unit-toggle', title: t('top.units.tip', 'Switch between metric (m, km, kg) and imperial (ft, mi, lb)'), 'aria-label': t('top.units', 'Units'), onclick: () => app.setSetting('units', imp ? 'metric' : 'imperial') },
      h('span', { class: imp ? '' : 'on' }, t('top.metric', 'Metric')), h('span', { class: 'sep' }, '/'), h('span', { class: imp ? 'on' : '' }, t('top.imperial', 'Imperial')));
    top.append(
      h('span', { class: 'title' }, (lvl === 'beginner' ? t(`nav.${app.screenId}.plain`, cur?.[3]) : t(`nav.${app.screenId}.full`, cur?.[1])) ?? ''), h('span', { class: 'muted' }, '•'), h('span', { class: 'muted tb-proj', id: 'proj-name' }, app.project.name),
      h('span', { class: 'spacer' }),
      h('label', { class: 'muted level-pick', title: LEVEL_HINTS[lvl] }, h('span', { class: 'tb-lbl' }, t('top.detail', 'Detail') + ' '), select(LEVELS.map((l) => [l, t(`level.${l}`, LEVEL_NAMES[l])]), lvl, (x) => app.setSetting('mode', x), { id: 'mode-pick' })),
      unitBtn,
      h('label', { class: 'muted lang-pick', title: t('top.lang', 'Language') }, select(LANGS, app.settings.lang, (x) => app.setSetting('lang', x), { id: 'lang-pick', 'aria-label': t('top.lang', 'Language') })),
      h('button', { class: 'btn small', id: 'palette-btn', title: t('top.find.tip', 'Find anything (Ctrl+K)'), onclick: () => openPalette(app, SCREENS) }, icon('search', { size: 16 }), h('span', { class: 'tb-lbl' }, ' Ctrl+K')), h('button', { class: 'btn small', id: 'help-btn', title: t('top.help.tip', 'Help (?)'), onclick: () => openHelp(app) }, '?', h('span', { class: 'tb-lbl' }, ' ' + t('top.help', 'Help'))),
      h('button', { class: 'btn small', title: t('top.undo.tip', 'Undo (Ctrl+Z)'), onclick: () => app.undo() }, '↶', h('span', { class: 'tb-lbl' }, ' ' + t('top.undo', 'Undo'))), h('button', { class: 'btn small', title: t('top.redo.tip', 'Redo (Ctrl+Y)'), onclick: () => app.redo() }, '↷', h('span', { class: 'tb-lbl' }, ' ' + t('top.redo', 'Redo'))),
      h('button', { class: 'btn small', title: t('top.save.tip', 'Save (Ctrl+S)'), onclick: () => app.save() }, icon('save', { size: 16 }), h('span', { class: 'tb-lbl' }, ' ' + t('top.save', 'Save'))),
      h('span', { class: 'muted tb-save', id: 'save-state' }, saveLabel[app.saveState] ?? ''),
    );
  }
  function renderStatus() {
    clear(status);
    const P = app.project, v = P.vehicle, m = P.mission;
    const running = app.api.ctx.running;
    if (app.settings.mode === 'beginner') {   // only three short items
      status.append(
        h('span', null, h('span', { class: `dot ${running ? 'busy' : 'ok'}` }), running ? (app.live && !app.live.finished ? `${t('status.flying', 'Flying…')} T+${app.live.sim.t.toFixed(0)} s` : t('status.working', 'Working…')) : t('status.ready', 'Ready')),
        h('span', null, `${t('status.rocket', 'Rocket')}: ${v ? v.name : t('status.none.yet', 'none yet')}`), h('span', { style: { flex: 1 } }), h('span', null, SAVE_SHORT[app.saveState] ?? ''));
      return;
    }
    status.append(
      h('span', null, h('span', { class: `dot ${running ? 'busy' : 'ok'}` }), running ? (app.live && !app.live.finished ? `${t('status.live', 'Live simulation')} T+${app.live.sim.t.toFixed(0)} s` : t('status.simrunning', 'Simulation running…')) : t('status.engine', 'Physics engine ready')),
      h('span', null, `${t('status.vehicle', 'Vehicle')}: ${v ? v.name : t('status.none', 'none')}`), h('span', null, `${t('status.mission', 'Mission')}: ${m ? m.name : t('status.none', 'none')}`),
      h('span', { class: 'sb-opt' }, `${P.runs.length} ${P.runs.length === 1 ? t('status.run', 'run') : t('status.runs', 'runs')}`),
      h('span', { style: { flex: 1 } }),
      h('span', { class: 'sb-opt' }, `AI: ${app.session.llm?.enabled ? 'online (' + app.settings.ai.model + ')' : t('status.ai.offline', 'built-in offline engineer')}`),
      h('span', { class: 'sb-opt' }, app.settings.units === 'imperial' ? t('status.imperial', 'Imperial units') : t('status.metric', 'Metric units')),
      h('span', { class: 'sb-opt' }, app.storageNote),
    );
  }
  app.on('save-state', (s) => { const el = document.getElementById('save-state'); if (el) el.textContent = saveLabel[s] ?? ''; });
  for (const e of ['project', 'design', 'run-finished', 'settings', 'live-start', 'run-deleted']) app.on(e, () => { renderStatus(); const pn = document.getElementById('proj-name'); if (pn) pn.textContent = app.project.name; });
  setInterval(renderStatus, 1000);
  app.on('project', () => show());

  // ---- keyboard
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); app.save(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); app.undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !typing) { e.preventDefault(); app.redo(); }
  });
  window.addEventListener('error', (e) => log('error', 'window error', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log('error', 'unhandled rejection', String(e.reason?.stack ?? e.reason)));
  window.addEventListener('beforeunload', () => { if (app.saveState === 'dirty') app.save({ quiet: true }); });

  installShell(app, SCREENS);
  document.getElementById('boot').remove();
  document.getElementById('app').hidden = false;
  app.navigate('home', { firstRun: first.firstRun });
  try { installShareLinks(app); } catch (e) { log('error', 'share links', String(e)); }
  try { installSky(); } catch (e) { log('error', 'sky', String(e)); }
  try { installDecor(app); } catch (e) { log('error', 'decor', String(e)); }
  renderStatus();
  log('info', 'ASTRA LAB started');
  setTimeout(() => { try { startTour(app); } catch (e) { log('error', 'tour failed', String(e)); } }, 1200);
}
boot().catch((e) => {
  console.error(e);
  document.getElementById('boot').innerHTML = `<div class="boot-logo">ASTRA LAB</div><div class="boot-sub bad">Could not start: ${String(e.message ?? e).replace(/</g, '&lt;')}</div>`;
});
export { statusBadge };
