// Settings: units, display / performance, physics accuracy, educational mode, data labels, autosave, AI configuration, about.
import { h, clear, toast } from '../lib/dom.js';
import { panel, select, kv, dataBadge, DATA_LABELS, moreBox, helpTip } from '../lib/widgets.js';
import { openHelp } from '../lib/shell.js';
import { openProgress } from '../lib/progress.js';
import { startTour } from '../lib/tour.js';
import { LEVELS, LEVEL_NAMES, LEVEL_HINTS } from '../../src/core/levels.js';
import { t, LANGS } from '../../src/core/i18n.js';

export const APP_VERSION = '2.6.1';

/** Updates (2.3): off until an update address is typed; the installed Windows app checks it, asks before downloading and before restarting. */
function updatesPanel(app) {
  const U = app.bridge?.updates;
  const status = h('div', { id: 'upd-status', class: 'muted' }, U ? '' : 'Updates are available in the installed Windows app.');
  const feed = h('input', { class: 'input', id: 'upd-feed', type: 'text', placeholder: 'https://example.org/astra-lab/   or   github:owner/repo', style: { width: '100%', maxWidth: '460px' } });
  const auto = h('input', { type: 'checkbox', id: 'upd-auto' });
  const bCheck = h('button', { class: 'btn', id: 'upd-check', disabled: !U }, 'Check now'), bDl = h('button', { class: 'btn primary', id: 'upd-download', hidden: true }, 'Download the update'), bInst = h('button', { class: 'btn primary', id: 'upd-install', hidden: true }, 'Restart and install');
  const bar = h('div', { class: 'progress', hidden: true }, h('div'));
  const show = (st) => {
    if (!st) return;
    if (document.activeElement !== feed) feed.value = st.feed ?? '';
    auto.checked = !!st.autoCheck;
    status.textContent = `${st.message || ''}${st.current ? ` (this is version ${st.current})` : ''}`.trim();
    bDl.hidden = st.state !== 'available'; bInst.hidden = st.state !== 'ready';
    bar.hidden = st.state !== 'downloading'; bar.firstChild.style.width = `${st.progress ?? 0}%`;
    bCheck.disabled = ['checking', 'downloading'].includes(st.state) || st.state === 'unavailable';
  };
  if (U) {
    U.get().then(show).catch(() => {}); U.onEvent?.(show);
    const save = () => U.set({ feed: feed.value, autoCheck: auto.checked }).then(show);
    feed.addEventListener('change', save); auto.addEventListener('change', save);
    bCheck.onclick = async () => { await save(); show(await U.check()); }; bDl.onclick = () => U.download().then(show); bInst.onclick = () => U.install().then(show);
  } else { feed.disabled = true; auto.disabled = true; }
  return h('div', { class: 'std-only', id: 'updates-panel' }, panel('Updates', h('div', { class: 'col' },
    h('div', { class: 'note info' }, 'Updates are off until you type an address. Then the installed app can look for a new version on that address, only when you press Check now (or every start, if you tick the box). Nothing is downloaded or installed without a click. Nothing else in ASTRA LAB uses the internet except the optional online AI.'),
    h('label', { class: 'field' }, 'Update address', feed), h('label', { class: 'row' }, auto, 'Look for updates 20 seconds after the app starts'),
    h('div', { class: 'row' }, bCheck, bDl, bInst), bar, status)));
}

export default {
  id: 'settings', title: 'Settings',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    let keyState = null;

    async function render() {
      keyState = await app.hasApiKey();
      clear(page);
      const st = app.settings, a = st.ai, B = st.mode === 'beginner';
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, t('nav.settings.full', 'Settings')), h('p', null, t('set.autosaved', 'Changes are saved automatically.')))));
      const row = (label, control, help, cls = '') => h('div', { class: `rowf ${cls}`, style: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px', alignItems: 'start', padding: '6px 0' } }, h('div', null, h('div', null, label), help ? h('div', { class: 'muted std-only', style: { fontSize: '12px' } }, help) : null), control);
      const cb = (key, label) => h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!st[key], onchange: (e) => { app.setSetting(key, e.target.checked); if (key === 'educational') app.project.settings.educationalMode = e.target.checked; } }), label);

      page.append(panel(B ? t('set.display', 'Display') : t('set.detail.title', 'How much detail do you want?'), h('div', null,
        row(t('set.detail', 'Detail level'), select(LEVELS.map((l) => [l, B ? t(`level.${l}`, LEVEL_NAMES[l]) : `${t(`level.${l}`, LEVEL_NAMES[l])}: ${t(`level.${l}.hint`, LEVEL_HINTS[l])}`]), st.mode, (x) => app.setSetting('mode', x), { id: 'set-mode' }), t('set.detail.help', 'You can change this any time. It only changes what is shown. The simulation gives exactly the same results at every level.')),
        row(t('set.lang', 'Language'), h('div', { class: 'col' }, select(LANGS, st.lang, (x) => app.setSetting('lang', x), { id: 'set-lang' }), h('div', { class: 'muted std-only', id: 'set-lang-note', style: { fontSize: '12px' } }, t('set.lang.note', 'The menus, buttons, Home, Settings and Help are translated. Lessons, the glossary, AI answers and reports are English only.'))), null),
        row(t('set.textsize', 'Text size'), select([[1, t('set.text.normal', 'Normal')], [1.15, t('set.text.large', 'Large (recommended)')], [1.3, t('set.text.xl', 'Extra large')]], st.textScale, (x) => app.setSetting('textScale', +x), { id: 'set-text' }), t('set.textsize.help', 'Bigger or smaller text. On a small window it shrinks by itself so nothing is cut off.')))));
      page.append(panel(B ? t('set.units.title', 'Units') : t('set.general', 'General'), h('div', null,
        row(t('set.units', 'Units'), select([['metric', t('set.units.metric', 'Metric (m, km, kg, N, °C)')], ['imperial', t('set.units.imperial', 'Imperial (ft, mi, lb, lbf, °F)')]], st.units, (x) => app.setSetting('units', x), { id: 'set-units' }), t('set.units.help', 'The simulation always computes in SI units. This only changes how values are displayed and entered.')),
        row(t('set.edu', 'Educational mode'), cb('educational', t('set.edu.cb', 'Show the governing equations next to the numbers')), t('set.edu.help', 'Adds the equation (for example the rocket equation Δv = Isp·g₀·ln(m₀/m₁)) with the actual values substituted.'), 'std-only'),
        row(t('set.labels', 'Data labels'), cb('dataLabels', t('set.labels.cb', 'Show Real / Estimated / User-created / Fictional badges')), null, 'std-only'),
        h('div', { class: 'row std-only', style: { gap: '10px', paddingLeft: '272px' } }, Object.keys(DATA_LABELS).map((k) => h('span', { title: DATA_LABELS[k].tip }, dataBadge(k)))),
        row(t('set.autosave', 'Autosave'), cb('autosave', t('set.autosave.cb', 'Save the project a few seconds after every change')), null, 'std-only'))));

      page.append(panel(B ? 'Look' : 'Look and motion', h('div', { class: 'col' },
        row('Colour look', select([['space', 'Deep space (dark)'], ['daylight', 'Daylight (light)'], ['contrast', 'High contrast']], st.look ?? 'space', (x) => app.setSetting('look', x), { id: 'set-look' }), 'Dark is best for the 3D views. Daylight is easier in a bright room. High contrast has white outlines.'),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', id: 'set-fx', checked: st.fx !== false, onchange: (e) => app.setSetting('fx', e.target.checked) }), 'Animations (screen glide, moving stars, T-minus countdown)'))));
      page.append(panel(B ? t('set.sound.b', 'Sound and help') : t('set.sound', 'Sound, help and tour'), h('div', { class: 'col' },
        h('label', { class: 'row' }, h('input', { type: 'checkbox', id: 'set-sound', checked: !!st.sound, onchange: (e) => app.setSetting('sound', e.target.checked) }), t('set.sound.play', 'Play small sound effects'), helpTip('Short beeps for liftoff and results. Off by default.')),
        h('div', { class: 'row' }, h('button', { class: 'btn', id: 'set-help', onclick: () => openHelp(app) }, t('set.quickhelp', 'Quick help')), h('button', { class: 'btn', id: 'set-progress', onclick: () => openProgress(app) }, t('set.progress', 'My progress')), h('button', { class: 'btn', id: 'tour-again', onclick: () => startTour(app, { force: true }) }, t('set.tour', 'Show the quick tour'))))));
      page.append(panel(B ? t('set.3d', '3D view') : t('set.perf', 'Performance and display'), h('div', null,
        row(t('set.quality', '3D quality'), select([['low', t('set.q.low', 'Low (old laptops)')], ['medium', t('set.q.med', 'Medium')], ['high', t('set.q.high', 'High')]], st.quality, (x) => { app.setSetting('quality', x); toast(t('set.restart', 'Applies after you restart the app.')); }, { id: 'set-quality' }), t('set.quality.help', 'Visual only. Never changes the physics result.')),
        row(t('set.fps', 'Maximum frame rate'), select([[20, '20 fps'], [30, '30 fps'], [60, '60 fps']], st.maxFps, (x) => app.setSetting('maxFps', +x), { id: 'set-fps' }), t('set.fps.help', 'A lower frame rate saves battery and CPU on slow computers. Simulation results are identical.'), 'std-only'),
        row(t('set.accuracy', 'Physics accuracy'), select([['fast', t('set.acc.fast', 'Fast (coarser steps while coasting)')], ['standard', t('set.acc.std', 'Standard')], ['high', t('set.acc.high', 'High (finest coast steps)')]], st.accuracy, (x) => app.setSetting('accuracy', x)), t('set.accuracy.help', 'Only the coasting time step far from a planet changes. Powered flight and atmospheric flight always use the fine RK4 step. Every setting is deterministic.'), 'std-only'))));

      // ---- AI
      const enabled = h('input', { type: 'checkbox', id: 'ai-enabled', checked: !!a.enabled });
      const fmtSel = select([['anthropic', 'Anthropic Messages API'], ['openai', 'OpenAI-compatible (also local servers)']], a.format, () => {}, { id: 'ai-format' });
      const base = h('input', { class: 'input', id: 'ai-base', value: a.baseUrl, style: { width: '100%' }, placeholder: 'https://api.anthropic.com' });
      const model = h('input', { class: 'input', id: 'ai-model', value: a.model, style: { width: '100%' }, placeholder: 'model name from your provider' });
      const key = h('input', { class: 'input', id: 'ai-key', type: 'password', autocomplete: 'off', placeholder: keyState ? '•••••••• (a key is stored — type to replace)' : 'paste your API key', style: { width: '100%' } });
      fmtSel.addEventListener('change', () => { if (fmtSel.value === 'openai' && base.value.includes('anthropic')) base.value = 'https://api.openai.com'; if (fmtSel.value === 'anthropic' && !base.value.includes('anthropic')) base.value = 'https://api.anthropic.com'; });
      const status = h('div', { class: 'muted', id: 'ai-status' }, '');
      const saveAi = async () => {
        try {
          if (key.value.trim()) { const r = await app.setApiKey(key.value.trim()); key.value = ''; toast(r.stored === 'os' ? 'API key stored in the operating system’s protected storage.' : 'API key kept in memory for this session only (it is never written to disk in the browser version).', 'ok', 6000); }
          app.setAi({ enabled: enabled.checked, format: fmtSel.value, baseUrl: base.value.trim(), model: model.value.trim() });
          render();
        } catch (e) { toast(`Could not store the key: ${e.message}`, 'bad', 8000); }
      };
      const test = async () => {
        await saveAi(); status.textContent = 'Testing…';
        const llm = app.makeLlm(); if (!llm) { document.getElementById('ai-status').textContent = 'Enable the online model and enter the address and model name first.'; return; }
        try { const k = await app.getApiKey(); const r = await llm.call('You are a connection test. Reply with the single word OK.', [{ role: 'user', content: 'ping' }], k); document.getElementById('ai-status').innerHTML = '<span class="ok">Connected: the service answered.</span>'; }
        catch (e) { document.getElementById('ai-status').innerHTML = ''; document.getElementById('ai-status').append(h('span', { class: 'bad' }, `Failed: ${e.message}`)); }
      };
      page.append(h('div', { class: 'std-only' }, panel(t('set.ai', 'AI engineer'), h('div', null,
        h('div', { class: 'note info', style: { marginBottom: '10px' } }, t('set.ai.note', 'The built-in offline engineer works without any setup or internet connection. Optionally you can connect an online language model for free-form conversation. The model can only act through the same validated tools, its proposals need your approval, and it can never edit files, run programs or change physics results.') + ' ' + t('set.ai.en', '(AI answers are in English only.)')),
        row(t('set.ai.use', 'Use an online model'), h('label', { class: 'row' }, enabled, t('set.ai.enabled', 'Enabled')), null),
        row(t('set.ai.type', 'Service type'), fmtSel, null), row(t('set.ai.addr', 'Service address'), base, t('set.ai.addr.help', 'Must be https:// (or http://localhost for a local server).')), row(t('set.ai.model', 'Model name'), model, null),
        row(t('set.ai.key', 'API key'), h('div', { class: 'col' }, key, h('span', { class: 'muted', style: { fontSize: '12px' } }, app.bridge?.secrets ? 'Stored encrypted by the operating system (Windows DPAPI) and never written into project files.' : 'Browser version: kept in memory for this session only.')), null),
        h('div', { class: 'row', style: { paddingLeft: '272px' } }, h('button', { class: 'btn primary', id: 'ai-save', onclick: saveAi }, t('top.save', 'Save')), h('button', { class: 'btn', id: 'ai-test', onclick: test }, t('set.ai.test', 'Save & test connection')), h('button', { class: 'btn danger', onclick: async () => { await app.setApiKey(''); toast(t('set.ai.removed', 'API key removed')); render(); } }, t('set.ai.remove', 'Remove stored key'))),
        h('div', { style: { paddingLeft: '272px', marginTop: '6px' } }, status)))));

      page.append(updatesPanel(app));
      page.append(h('div', { class: 'col' }, h('div', { class: 'beginner-only' }, moreBox('More', kv([['Application', `ASTRA LAB ${APP_VERSION}`], ['Saved in', app.storageNote]]), h('p', { class: 'muted' }, t('set.wantall', 'Want every number? Switch the detail level to Engineer or Expert above.'))))), h('div', { class: 'std-only' }, panel(t('set.about', 'Data and about'), h('div', { class: 'col' },
        kv([[t('set.app', 'Application'), `ASTRA LAB ${APP_VERSION}`], [t('set.engine', 'Physics engine'), 'astra-physics 1.0 (RK4, deterministic)'], [t('set.storage', 'Storage'), app.storageNote], [t('set.folder', 'Projects folder'), app.bridge?.paths?.data ?? t('set.browserstorage', '(browser storage)')], [t('set.log', 'Log file'), app.bridge?.paths?.log ?? t('set.console', '(browser console)')]]),
        app.bridge?.openDataFolder ? h('div', null, h('button', { class: 'btn', id: 'open-data', onclick: () => app.bridge.openDataFolder() }, t('set.opendata', 'Open data folder'))) : null,
        h('div', { class: 'muted' }, t('set.keys', 'Keyboard: Ctrl+S save · Ctrl+Z undo · Ctrl+Y redo · Space play/pause in Replay.')),
        h('div', { class: 'muted' }, 'ASTRA LAB is a simplified engineering laboratory. Results show what the documented model predicts for the inputs you give; they are not flight-certification results. Component data labelled “fictional”, “estimated” or “user-created” are not real product specifications.')))));
    }
    render();
  },
};
