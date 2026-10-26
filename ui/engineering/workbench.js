// ASTRA LAB Engineering Workbench: workspace shell, command palette, themes, save/load.
// Mount standalone (workbench.html) or inside the main app as a screen (ui/screens/engineering.js).
import { h, btn, state, onChange, renderFooter, toast, download, E } from './ui.js';
import { missionControl, engineeringLoop, flyMission } from './ws-mission.js';
import { vehicleWorkspace, propulsionWorkspace, gncWorkspace, sensorsWorkspace, simulationWorkspace } from './ws-design.js';
import { monteCarloWorkspace, sensitivityWorkspace, tradeWorkspace } from './ws-analysis.js';
import { requirementsWorkspace, reliabilityWorkspace, vvWorkspace, reportsWorkspace } from './ws-quality.js';
import { subsystemsWorkspace, worldWorkspace, aiWorkspace, academyWorkspace } from './ws-other.js';

const WORKSPACES = [
  ['Mission', [
    ['loop', 'LP', 'Engineering loop', engineeringLoop],
    ['mission', 'MC', 'Mission Control', missionControl],
    ['sim', 'FS', 'Flight simulations', simulationWorkspace],
  ]],
  ['Design', [
    ['vehicle', 'VH', 'Vehicle and versions', vehicleWorkspace],
    ['propulsion', 'PR', 'Test stand and wind tunnel', propulsionWorkspace],
    ['gnc', 'GN', 'GNC and PID', gncWorkspace],
    ['sensors', 'SN', 'Sensors', sensorsWorkspace],
    ['subsystems', 'EP', 'Power, thermal, comms', subsystemsWorkspace],
    ['world', 'OR', 'Orbits and world', worldWorkspace],
  ]],
  ['Analysis', [
    ['montecarlo', 'MCA', 'Monte Carlo', monteCarloWorkspace],
    ['sensitivity', 'SA', 'Sensitivity and sweeps', sensitivityWorkspace],
    ['trade', 'TS', 'Trades and experiments', tradeWorkspace],
  ]],
  ['Quality', [
    ['requirements', 'RQ', 'Requirements', requirementsWorkspace],
    ['reliability', 'RL', 'Reliability and risk', reliabilityWorkspace],
    ['vv', 'VV', 'V&V benchmarks', vvWorkspace],
    ['reports', 'RP', 'Reports', reportsWorkspace],
  ]],
  ['Team', [
    ['ai', 'AI', 'AI Mission Director', aiWorkspace],
    ['academy', 'AC', 'Academy and challenges', academyWorkspace],
  ]],
];
const ALL = WORKSPACES.flatMap(([, list]) => list);

function themeGet() { try { return localStorage.getItem('astra-eng-theme') || 'dark'; } catch { return 'dark'; } }
function themeSet(t) { state.ui.theme = t; document.documentElement.dataset.theme = t; try { localStorage.setItem('astra-eng-theme', t); } catch { /* storage unavailable */ } }

export function mountWorkbench(container, { embedded = false } = {}) {
  themeSet(themeGet());
  const nav = h('nav'), main = h('main', { id: 'eng-main' });
  const navigate = (id, ctx = {}) => {
    const ws = ALL.find((w) => w[0] === id) || ALL[1];
    state.ui.workspace = ws[0];
    for (const b of nav.querySelectorAll('button[data-ws]')) b.classList.toggle('on', b.dataset.ws === ws[0]);
    main.scrollTop = 0;
    try { ws[3](main, ctx, navigate); } catch (e) { console.error(e); main.replaceChildren(h('div', { class: 'verdict bad' }, `This workspace failed to open: ${e.message}`)); }
  };
  for (const [sect, list] of WORKSPACES) {
    nav.append(h('div', { class: 'sect' }, sect));
    for (const [id, ic, label] of list) nav.append(h('button', { 'data-ws': id, onclick: () => navigate(id) }, h('span', { class: 'ic' }, ic), label));
  }

  const fileInput = h('input', { type: 'file', accept: '.json,.astra', style: { display: 'none' }, onchange: async (e) => { const f = e.target.files[0]; if (f) await openProject(await f.text()); e.target.value = ''; } });
  const saveProject = () => {
    const P = state.project;
    const text = E.saveProject({ ...P, monteCarlo: P.lastMC ? [P.lastMC] : [], experiments: P.lastLoop ? [{ kind: 'engineering-loop', log: P.lastLoop.log }] : [], ui: { workspace: state.ui.workspace } });
    download(`${P.name.replace(/[^\w-]+/g, '-')}.astra.json`, text, 'application/json'); toast('Project saved (vehicles, versions, telemetry, results, AI conversation).');
  };
  const openProject = async (text) => {
    try {
      const p = E.loadProject(text, { rngFactory: E.makeRng });
      Object.assign(state.project, { name: p.name, objective: p.objective, vehicles: p.vehicles, versions: E.VersionStore.fromJSON(p.versions || []), requirements: p.requirements?.length ? p.requirements : E.LUNAR_REQUIREMENTS,
        lastMission: p.lastMission, lastMC: p.monteCarlo?.[0] || null, aiConversations: p.aiConversations || [], testResults: p.testResults || [] });
      toast(`Opened ${p.name}`); renderFooter(); navigate(p.ui?.workspace || 'mission');
    } catch (e) { toast(`Could not open: ${e.message}`, 6000); }
  };

  // command palette (Ctrl+K)
  const actions = () => [
    ...ALL.map(([id, , label]) => ({ label: `Go to ${label}`, hint: 'workspace', run: () => navigate(id) })),
    { label: 'Fly lunar mission', hint: 'simulation', run: async () => { await flyMission(); navigate('mission'); } },
    { label: 'Run engineering loop', hint: 'workflow', run: () => navigate('loop') },
    { label: 'Run V&V benchmarks', hint: 'verification', run: () => navigate('vv') },
    { label: 'Generate report', hint: 'report', run: () => navigate('reports') },
    { label: 'Toggle dark / light theme', hint: 'view', run: () => themeSet(state.ui.theme === 'dark' ? 'light' : 'dark') },
    { label: 'Save project', hint: 'file  Ctrl+S', run: saveProject },
    { label: 'Open project', hint: 'file  Ctrl+O', run: () => fileInput.click() },
    ...E.LESSONS.map((l) => ({ label: `Lesson: ${l.title}`, hint: 'academy', run: () => navigate('academy') })),
    ...E.LUNAR_REQUIREMENTS.map((r) => ({ label: `${r.id}: ${r.text}`, hint: 'requirement', run: () => navigate('requirements') })),
  ];
  const pInput = h('input', { type: 'text', placeholder: 'Type a command, workspace, lesson or requirement…' });
  const pList = h('div', { class: 'list' });
  const palette = h('div', { class: 'palette', onclick: (e) => { if (e.target === palette) closePalette(); } }, h('div', { class: 'box' }, pInput, pList));
  let sel = 0, matches = [];
  const renderPalette = () => {
    const q = pInput.value.toLowerCase().trim();
    matches = actions().filter((a) => !q || q.split(/\s+/).every((w) => a.label.toLowerCase().includes(w))).slice(0, 40);
    sel = Math.min(sel, Math.max(0, matches.length - 1));
    pList.replaceChildren(...matches.map((a, i) => h('div', { class: `item ${i === sel ? 'sel' : ''}`, onclick: () => { closePalette(); a.run(); } }, a.label, h('small', {}, a.hint))));
  };
  const openPalette = () => { palette.classList.add('on'); pInput.value = ''; sel = 0; renderPalette(); pInput.focus(); };
  const closePalette = () => palette.classList.remove('on');
  pInput.oninput = () => { sel = 0; renderPalette(); };
  pInput.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(matches.length - 1, sel + 1); renderPalette(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === 'Enter') { const a = matches[sel]; closePalette(); a?.run(); }
    else if (e.key === 'Escape') closePalette();
  };
  const onKey = (e) => {
    if (!container.isConnected) return document.removeEventListener('keydown', onKey);
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); palette.classList.contains('on') ? closePalette() : openPalette(); }
    else if ((e.ctrlKey || e.metaKey) && k === 's' && !embedded) { e.preventDefault(); saveProject(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'o' && !embedded) { e.preventDefault(); fileInput.click(); }
  };
  document.addEventListener('keydown', onKey);

  const header = h('header', {},
    h('span', { class: 'brand' }, 'ASTRA LAB', h('small', {}, 'Engineering Workbench')),
    h('span', { class: 'muted' }, state.project.name),
    h('span', { class: 'spacer' }),
    btn('Search  Ctrl+K', openPalette), btn('Open', () => fileInput.click()), btn('Save', saveProject),
    btn('Theme', () => themeSet(state.ui.theme === 'dark' ? 'light' : 'dark')), fileInput);
  const busy = h('div', { class: 'busy', id: 'busy' }, h('div', { class: 'lbl' }, 'Running'), h('div', { class: 'bar' }, h('i')));
  const app = h('div', { class: 'app', style: embedded ? { height: '100%' } : null }, header, nav, main, h('footer', { id: 'foot' }), busy, palette);
  container.replaceChildren(app);
  renderFooter();
  onChange(renderFooter);
  navigate(state.ui.workspace);
  window.astraWorkbench = { state, navigate, E };   // used by the automated UI test
  return () => document.removeEventListener('keydown', onKey);
}
