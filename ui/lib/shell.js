// App-wide helpers: Ctrl+K command palette, "?" help overlay, optional sound effects and the "I looked at my results" tick.
import { h, clear } from './dom.js';
import { setSoundEnabled, playSound } from './sound.js';
import { startTour } from './tour.js';
import { createVehicleDialog } from './create.js';
import { t } from '../../src/core/i18n.js';
import { LEVELS, LEVEL_NAMES } from '../../src/core/levels.js';
import { openProgress } from './progress.js';
import { icon, hasIcon } from './icons.js';

export const HELP_TIPS = [
  ['academy', 'Learn first', 'Short lessons in the Academy.'],
  ['designer', 'Build a rocket', 'Pick parts. Green means OK.'],
  ['simulation', 'Launch it', 'Press Launch to fly it.'],
  ['analysis', 'Learn from flights', 'See why it worked or failed.'],
  ['ai', 'Ask the AI Helper', 'Ask anything. Short answers.'],
  ['keyboard', 'Shortcuts', 'Ctrl+K search. ? help. Ctrl+Z undo.'],
];
const typingNow = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
let layer = null;
const closeLayer = () => { layer?.remove(); layer = null; };

export function openHelp(app) {
  closeLayer();
  layer = h('div', { class: 'sh-back', id: 'help-overlay', onmousedown: (e) => { if (e.target === layer) closeLayer(); } },
    h('div', { class: 'sh-box', role: 'dialog', 'aria-label': t('top.help', 'Help') },
      h('div', { class: 'sh-head' }, h('h3', null, t('help.title', 'Quick help')), h('button', { class: 'icon-btn', onclick: closeLayer, 'aria-label': 'Close' }, '×')),
      h('div', { class: 'sh-tips' }, HELP_TIPS.map(([ico, ti, x], i) => h('div', { class: 'sh-tipcard' }, h('span', { class: 'sh-tip-ico' }, icon(ico, { size: 22 })), h('div', null, h('b', null, t(`help.tip${i}.t`, ti)), h('div', { class: 'muted' }, t(`help.tip${i}.x`, x)))))),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => { closeLayer(); startTour(app, { force: true }); } }, t('set.tour', 'Show the quick tour')), h('button', { class: 'btn primary', onclick: closeLayer }, t('help.gotit', 'Got it')))));
  document.body.append(layer);
}

export function openPalette(app, screens) {
  closeLayer();
  const B = app.settings.mode === 'beginner';
  const go = (id) => () => app.navigate(id);
  const cmds = [
    ...screens.map(([id, label, , plain]) => ({ ico: id, text: `${t('pal.goto', 'Go to')} ${B ? t(`nav.${id}.plain`, plain) : t(`nav.${id}.full`, label)}`, run: go(id) })),
    { ico: 'rocket', text: t('home.s2.b', 'Build a rocket'), run: () => createVehicleDialog(app, 'rocket', { then: () => app.navigate('designer') }) },
    { ico: 'play', text: t('pal.launch', 'Launch my rocket'), run: go('simulation') },
    { ico: 'ai', text: t('pal.askai', 'Ask the AI Helper…'), run: go('ai') },
    { ico: 'chart', text: t('set.progress', 'My progress'), run: () => openProgress(app) },
    { ico: 'help', text: t('top.help', 'Help'), run: () => openHelp(app) },
    { ico: app.settings.sound ? 'mute' : 'sound', text: app.settings.sound ? 'Turn sound off' : 'Turn sound on', run: () => app.setSetting('sound', !app.settings.sound) },
    { ico: 'compass', text: 'Show the quick tour', run: () => startTour(app, { force: true }) },
    ...LEVELS.map((m) => ({ ico: 'sliders', text: `${t('top.detail', 'Detail')}: ${t(`level.${m}`, LEVEL_NAMES[m])}`, run: () => app.setSetting('mode', m) })),
    { ico: 'ruler', text: t('top.units', 'Units') + ': ' + (app.settings.units === 'imperial' ? t('top.metric', 'Metric') : t('top.imperial', 'Imperial')), run: () => app.setSetting('units', app.settings.units === 'imperial' ? 'metric' : 'imperial') },
    { ico: 'globe', text: app.settings.lang === 'cs' ? 'Language: English' : 'Jazyk: Čeština', run: () => app.setSetting('lang', app.settings.lang === 'cs' ? 'en' : 'cs') },
  ];
  const input = h('input', { class: 'input', id: 'palette-input', placeholder: t('pal.placeholder', 'Type to search: "go to…", "build a rocket", or a question for the AI'), autocomplete: 'off', style: { width: '100%' } });
  const list = h('div', { class: 'sh-list', id: 'palette-list' });
  let shown = [], sel = 0;
  const paint = () => {
    const q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    shown = cmds.filter((c) => words.every((w) => c.text.toLowerCase().includes(w))).slice(0, 8);
    if (q.length > 2 && !shown.length) shown = [];
    if (q) shown.push({ ico: 'ai', text: `Ask the AI: “${input.value.trim()}”`, run: () => app.navigate('ai', { prefill: input.value.trim(), send: true }) });
    sel = Math.min(sel, shown.length - 1); if (sel < 0) sel = 0;
    clear(list).append(...shown.map((c, i) => h('button', { class: `sh-item ${i === sel ? 'sel' : ''}`, onmouseenter: () => { sel = i; mark(); }, onclick: () => pick(i) }, h('span', { class: 'sh-ico' }, hasIcon(c.ico) ? icon(c.ico, { size: 18 }) : c.ico), h('span', null, c.text))));
  };
  const mark = () => [...list.children].forEach((el, i) => el.classList.toggle('sel', i === sel));
  const pick = (i) => { const c = shown[i]; closeLayer(); c?.run(); };
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  layer = h('div', { class: 'sh-back top', id: 'palette', onmousedown: (e) => { if (e.target === layer) closeLayer(); } }, h('div', { class: 'sh-box palette', role: 'dialog', 'aria-label': 'Command palette' }, input, list, h('div', { class: 'muted sh-foot' }, '↑ ↓ to choose · Enter to go · Esc to close')));
  document.body.append(layer); paint(); input.focus();
}

/** Install the global keys, sound effects and result tracking. Call once after the app object exists. */
export function installShell(app, screens) {
  setSoundEnabled(!!app.settings.sound);
  app.on('settings', (k) => { if (k === 'sound') { setSoundEnabled(!!app.settings.sound); playSound('click'); } });
  app.on('run-finished', async (rec) => { try { const r = app.project.runs.find((x) => x.id === rec?.id) ?? app.project.runs[app.project.runs.length - 1]; playSound(r?.status === 'SUCCESS' ? 'success' : 'fail'); } catch { /* sound is optional */ } });
  app.on('live-start', () => playSound('liftoff'));
  app.on('navigate', () => { if (app.screenId === 'analysis' && app.project.runs.length && !app.settings.resultsSeen) { app.settings.resultsSeen = true; app.saveSettings(); } });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layer) { closeLayer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); layer?.id === 'palette' ? closeLayer() : openPalette(app, screens); }
    else if (e.key === '?' && !typingNow() && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openHelp(app); }
  });
}
