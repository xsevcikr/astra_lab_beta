import { h, clear, modal, toast, fmt, fmtTime } from '../lib/dom.js';
import { t } from '../../src/core/i18n.js';
import { panel, stat, statusBadge, kv, emptyState } from '../lib/widgets.js';
import { createVehicleDialog, VEHICLE_KINDS } from '../lib/create.js';
import { playDemo, DEMO_NAME, DEMO_STEPS } from '../../src/demo.js';
import { allLessons } from '../../data/academy/index.js';
import { factOfTheDay, FACTS } from '../../data/facts.js';
import { openProgress } from '../lib/progress.js';
import { TEMPLATES } from '../../data/templates.js';
import { icon } from '../lib/icons.js';
import { installHomeEarth } from '../lib/homeearth.js';

/** Line icon for a Home tile (kept as an export for older callers). */
export const lineIcon = (name) => icon(({ learn: 'academy', ai: 'ai', build: 'designer', ready: 'layers', guides: 'book', demo: 'play' })[name] ?? name, { size: 28 });
const KIND_ICON = { rocket: 'rocket', spacecraft: 'satellite', probe: 'probe', rover: 'rover', lander: 'lander' };
const isBeginner = (app) => app.settings.mode === 'beginner';
/** Ready-made rockets (module written by another part of the app; the button must never break the Home screen without it). */
async function openTemplates(app) {
  try { const m = await import('../lib/templates.js'); await m.openTemplatePicker(app); }
  catch (e) { toast('Ready-made rockets are not available right now.', 'info'); }
}
/** One line with the learner\'s progress: finished lessons and challenge stars. */
function progressStrip(app) {
  const done = Object.values(app.settings.academy?.done ?? {}).filter(Boolean).length;
  let total = 0; try { total = allLessons().length; } catch { /* keep 0 */ }
  const stars = Object.values(app.settings.challenges ?? {}).reduce((t, c) => t + (Number(c?.stars) || 0), 0);
  return h('div', { class: 'progress-strip', id: 'home-progress' }, h('span', null, icon('academy', { size: 16 }), ' ', t('home.lessons.done', '{n} of {m} lessons finished', { n: done, m: total || '?' })), h('span', null, icon('star', { size: 16 }), ` ${stars} ${stars === 1 ? t('home.star', 'star') : t('home.stars', 'stars')}`), h('button', { class: 'btn small', id: 'my-progress', onclick: () => openProgress(app) }, t('set.progress', 'My progress')));
}


/** The four-step path for a new student, with a tick for every step that is really done. */
export function startSteps(app) {
  const P = app.project, done = Object.values(app.settings.academy?.done ?? {}).some(Boolean);
  const built = !!P.vehicle && (P.vehicle.components?.length ?? 0) > 0, flew = P.runs.length > 0, saw = flew && !!app.settings.resultsSeen;
  const steps = [
    { n: 1, id: 'sh-step-learn', ico: 'academy', title: t('home.s1', 'Learn'), text: t('home.s1.t', 'Short lessons.'), ok: done, btn: t('home.s1.b', 'Open Academy'), go: () => app.navigate('academy') },
    { n: 2, id: 'sh-step-build', ico: 'designer', title: t('home.s2', 'Build'), text: t('home.s2.t', 'Pick parts.'), ok: built, btn: t('home.s2.b', 'Build a rocket'), go: () => (built ? app.navigate('designer') : createVehicleDialog(app, 'rocket', { then: () => app.navigate('designer') })) },
    { n: 3, id: 'sh-step-launch', ico: 'rocket', title: t('home.s3', 'Launch'), text: t('home.s3.t', 'Fly it.'), ok: flew, btn: t('btn.launchit', 'Launch It'), go: () => app.navigate('simulation') },
    { n: 4, id: 'sh-step-results', ico: 'chart', title: t('home.s4', 'See results'), text: t('home.s4.t', 'See why.'), ok: saw, btn: t('nav.analysis.plain', 'What happened?'), go: () => app.navigate('analysis') },
  ];
  const cur = steps.find((x) => !x.ok) ?? null;
  return { steps, cur, count: steps.filter((x) => x.ok).length };
}
function startHere(app) {
  const { steps, cur, count } = startSteps(app);
  return h('section', { class: 'sh-start', id: 'sh-start' },
    h('div', { class: 'sh-start-head' }, h('h2', null, count === 4 ? t('home.alldone', 'All four steps done!') : t('home.start', 'Start here')), h('span', { class: 'muted' }, t('home.ndone', '{n} of 4 done', { n: count }))),
    h('div', { class: 'sh-steps' }, steps.map((x) => h('div', { class: `sh-step ${x.ok ? 'ok' : ''} ${cur === x ? 'cur' : ''}`, id: x.id },
      h('span', { class: 'sh-num' }, x.ok ? icon('check', { size: 16 }) : String(x.n)), h('div', { class: 'sh-step-t' }, h('b', null, icon(x.ico, { size: 16 }), ` ${x.title}`), h('span', { class: 'muted std-only' }, x.text)),
      h('button', { class: `btn small ${cur === x ? 'primary' : ''}`, title: x.text, onclick: x.go }, x.btn)))));
}
/** "Did you know?" card: one true fact per day, with a button for the next one. */
function factCard() {
  let i = FACTS.indexOf(factOfTheDay());
  const txt = h('span', { id: 'sh-fact-text' }, FACTS[i]);
  return h('div', { class: 'sh-fact', id: 'sh-fact' }, h('span', { class: 'sh-fact-ico' }, icon('info', { size: 18 })), h('div', { class: 'grow' }, h('b', null, t('home.dyk', 'Did you know?')), h('div', null, txt)),
    h('button', { class: 'btn small', id: 'sh-fact-next', onclick: () => { i = (i + 1) % FACTS.length; txt.textContent = FACTS[i]; } }, t('home.another', 'Another')));
}

export async function loadDemo(app) {
  const B = isBeginner(app);
  const bar = h('div'), label = h('p', null, 'Preparing…');
  const prog = h('div', { class: 'progress' }, bar); bar.style.width = '2%';
  const m = modal({ title: B ? 'Making the demo' : 'Creating the demo project', body: h('div', { class: 'col' }, h('p', null, B ? 'This takes about a minute.' : 'The AI engineer designs a two-stage rocket for a 100 kg probe and flies it in the real simulator, then an under-fuelled variant that fails. This takes about a minute on an older computer.'), label, prog) });
  try {
    await app.newProject(DEMO_NAME);
    const off = app.on('sim-event', (e) => { if (e.type === 'tuning') label.textContent = `Trying pitch programme ${e.tried} of ${e.of}: ${e.status}`; });
    await playDemo({
      ask: (t) => app.ask(t), approve: () => app.session.approve().then((r) => { app.chat.push(r); return r; }),
      onStep: (s) => { label.textContent = `${s.label} (${s.index + 1}/${s.total})`; bar.style.width = `${Math.round(((s.index + 0.5) / s.total) * 100)}%`; },
    });
    off(); bar.style.width = '100%';
    await app.save({ quiet: true });
    m.close(); toast(B ? 'Demo ready. Ask: “Why did it fail?”' : 'Demo project ready. Open the AI Engineer and ask “Why did it fail?” then “Fix it.”', 'ok', 9000);
    app.navigate('ai');
  } catch (e) { m.close(); toast(`Demo could not be created: ${e.message}`, 'bad', 9000); }
}

export default {
  id: 'home', title: 'Home',
  async mount(root, app, params) {
    const P = app.project;
    const B = isBeginner(app);
    const noVehicle = !P.vehicle;
    const go = () => { app.settings.welcomed = true; app.saveSettings(); };
    const heroBuild = () => { go(); createVehicleDialog(app, 'rocket', { then: () => app.navigate('designer') }); };
    // ---- the cover: the 3D Earth, a name, and big things to click. Nothing else. ----
    const portal = (id, ico, label, sub, onclick, cls = '') => h('button', { class: `portal ${cls}`, id, title: sub, onclick },
      h('span', { class: 'portal-ico' }, icon(ico, { size: 34 })), h('b', null, label), h('span', { class: 'portal-sub' }, sub));
    const canvas = h('canvas', { class: 'home-earth-canvas', 'aria-hidden': 'true' });
    const cssEarth = h('div', { class: 'hero-earth', 'aria-hidden': 'true', hidden: true });
    const cover = h('section', { class: 'home-cover', id: 'home-cover' }, canvas, cssEarth, h('div', { class: 'home-shade', 'aria-hidden': 'true' }), ['r1', 'r2', 'r3', 'r4', 'r5'].map((c) => h('span', { class: `rock ${c}`, 'aria-hidden': 'true' })),
      h('div', { class: 'home-title' },
        h('span', { class: 'home-eyebrow' }, 'ASTRA LAB'),
        h('h1', null, t('home.cover.a', 'Fly to the'), ' ', h('em', null, t('home.cover.b', 'stars')))),
      h('div', { class: 'home-portals', id: 'home-portals' },
        portal('hero-learn', 'academy', t('home.hero.learn', 'Learn'), t('home.p.learn', 'How rockets work'), () => { go(); app.navigate('academy'); }),
        portal('hero-build', 'designer', t('home.hero.build', 'Build'), t('home.p.build', 'Design a rocket'), heroBuild, 'main'),
        portal('hero-demo', 'play', t('home.hero.launch', 'Launch'), t('home.p.launch', 'Watch a flight'), () => loadDemo(app)),
        portal('hero-plan', 'planner', t('home.hero.plan', 'Missions'), t('home.p.plan', 'Moon trips and more'), () => { go(); app.navigate('planner'); }),
        portal('hero-test', 'testbench', t('home.hero.test', 'Will it work?'), t('home.p.test', 'Quick check'), () => { go(); app.navigate('testbench'); }),
        portal('hero-real', 'validation', t('home.hero.real', 'Real missions'), t('home.p.real', 'Apollo, Curiosity'), () => { go(); app.navigate('validation'); }),
        portal('ask-ai', 'ai', t('home.hero.ai', 'Ask AI'), t('home.p.ai', 'Your engineer'), () => { go(); app.navigate('ai', { prefill: 'Build me a two-stage rocket carrying a 100 kg space probe.', send: true }); })),
      h('div', { class: 'home-foot' },
        P.vehicle ? h('button', { class: 'btn primary', id: 'home-continue', onclick: () => app.navigate('designer') }, icon('play', { size: 16 }), ' ', t('home.continue', 'Continue with {n}', { n: P.vehicle.name })) : null,
        h('button', { class: 'btn ghost', id: 'home-scroll', onclick: () => { const d = root.querySelector('#home-more'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, t('home.more', 'Your work and shortcuts'), ' ↓')));
    let earth = null;
    if (typeof window !== 'undefined') {
      try { earth = installHomeEarth(canvas, { quality: app.settings?.quality ?? 'medium' }); } catch { earth = null; }
      if (!earth?.ok) { canvas.hidden = true; cssEarth.hidden = false; }
      canvas.addEventListener('homeearth-failed', () => { canvas.hidden = true; cssEarth.hidden = false; });
    }
    const page = h('div', { class: 'page home-more-body' });
    const more = h('details', { class: 'home-more', id: 'home-more' }, h('summary', null, t('home.more.s', 'Your work, progress and shortcuts')), page);
    const homeRoot = h('div', { class: 'home-root' }, cover, more);
    // ---- everything else, one scroll away ----
    page.append(h('div', { class: 'home-links' },
      h('button', { class: 'btn small', id: 'home-guides', onclick: () => { go(); app.navigate('academy', { view: 'guides' }); } }, icon('book', { size: 15 }), ' Build guides'),
      h('button', { class: 'btn small', id: 'home-template', onclick: () => { go(); openTemplates(app); } }, icon('layers', { size: 15 }), ' Ready-made rockets'),
      h('button', { class: 'btn small', id: 'home-share', onclick: () => { go(); import('../lib/sharedialog.js').then((m) => m.openShareDialog(app)); } }, icon('share', { size: 15 }), ' Open a shared design'),
      VEHICLE_KINDS.map(([k, label, , hint]) => h('button', { class: 'btn small', 'data-kind': k, title: hint, onclick: () => { go(); createVehicleDialog(app, k, { then: () => app.navigate('designer') }); } }, icon(KIND_ICON[k] ?? 'rocket', { size: 15 }), ` New ${k}`))));
    page.append(h('div', { class: 'home-strip', id: 'home-strip' }, h('div', { class: 'home-strip-h' }, t('home.pickvehicle', 'Pick a vehicle')),
      h('div', { class: 'home-strip-row' }, TEMPLATES.map((tp) => h('button', { class: 'home-tile', id: `tile-${tp.id}`, title: tp.blurb, onclick: async () => { try { await tp.build(app); go(); app.navigate('designer'); toast(`Loaded "${tp.title}".`, 'ok'); } catch (e) { toast(`Could not load it: ${e.message}`, 'bad'); } } },
        h('span', { class: 'home-tile-ico' }, icon(tp.emoji ?? 'rocket', { size: 30 })), h('b', null, tp.title), h('span', { class: 'muted' }, ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[tp.difficulty] ?? ''))))));
    page.append(startHere(app));
    const v = P.vehicle, m = P.mission;
    const last = P.runs[P.runs.length - 1];
    if (v) {
      const step = !P.runs.length ? [B ? t('home.n1', 'Your rocket is ready. Launch it!') : t('home.n1.long', 'Your rocket is ready. Next step: launch it and watch what happens.'), t('btn.launchit', 'Launch It'), () => app.navigate('simulation')]
        : last.status === 'SUCCESS' ? [B ? t('home.n2', 'Your last flight worked!') : t('home.n2.long', 'The last flight worked! Ask the AI Helper how to improve it, or learn why it worked in the Academy.'), B ? t('home.n2.b', 'Make it better') : t('home.n2.b2', 'Ask the AI Helper'), () => app.navigate('ai', { prefill: 'How can I improve this design?', send: true })]
        : [B ? t('home.n3', 'Your last flight failed. Find out why!') : t('home.n3.long', 'The last flight failed ({r}). Find out why — that is how engineers learn.', { r: last.reason }), t('home.n3.b', 'Why did it fail?'), () => app.navigate('ai', { prefill: 'Why did it fail?', send: true })];
      page.append(h('div', { class: 'callout info next-step' }, B ? null : h('b', null, t('home.next', 'What to do next') + ': '), step[0], ' ', h('button', { class: 'btn primary', id: 'next-step-btn', onclick: step[2] }, step[1])));
    }
    page.append(progressStrip(app));
    page.append(factCard());
    page.append(h('div', { class: 'grid g4 std-only' },
      stat(t('home.st.vehicle', 'Active vehicle'), v ? v.name : t('status.none', 'none'), v ? `${v.type} · ${v.components.length} ${t('home.components', 'components')}` : t('home.createabove', 'Create one above')),
      stat(t('home.st.mission', 'Active mission'), m ? m.name : t('status.none', 'none'), m ? `${m.events.length} ${t('home.events', 'timeline events')}` : ''),
      stat(t('home.st.runs', 'Simulation runs'), String(P.runs.length), P.runs.length ? `${P.runs.filter((r) => r.status === 'SUCCESS').length} succeeded · ${P.runs.filter((r) => r.status === 'FAILURE').length} failed` : 'none yet'),
      stat(t('home.st.last', 'Last result'), last ? last.status : '–', last ? `${last.reason}` : 'Run a simulation', last ? (last.status === 'SUCCESS' ? 'ok' : 'bad') : ''),
    ));
    const runs = h('div');
    if (!P.runs.length) runs.append(emptyState(t('empty.noflight.short', 'No flight yet'), t('home.noflight.t', 'Launch a rocket to see its results here.'), [h('button', { class: 'btn primary', onclick: () => app.navigate(P.vehicle ? 'simulation' : 'designer') }, P.vehicle ? t('home.launchyours', 'Launch your rocket') : t('home.s2.b', 'Build a rocket'))], icon('rocket', { size: 32 })));
    else runs.append(h('table', null, h('thead', null, h('tr', null, ['Run', 'Vehicle', 'Mission', 'Result', 'Duration'].map((x) => h('th', null, x)))),
      h('tbody', null, app.runList().slice(0, 6).map((r) => h('tr', { class: 'clickable', onclick: () => { app.selectedRun = r.id; app.navigate('analysis'); } }, h('td', null, r.name), h('td', null, r.vehicle), h('td', null, r.mission), h('td', null, statusBadge(r.status)), h('td', { class: 'num' }, fmtTime(r.endTime)))))));
    const projects = h('div', null, h('p', { class: 'muted' }, t('msg.loading', 'Loading…')));
    page.append(h('div', { class: 'grid g2 std-only' },
      panel(t('home.recent', 'Recent simulations'), runs),
      panel(t('home.getstarted', 'Get started'), h('div', { class: 'col' },
        h('div', { class: 'row' }, ...VEHICLE_KINDS.map(([k, label]) => h('button', { class: 'btn small', onclick: () => createVehicleDialog(app, k, { then: () => app.navigate('designer') }) }, `New ${k}`))),
        h('button', { class: 'btn', title: 'Two-stage launcher + 100 kg probe, with a failing variant', onclick: () => loadDemo(app) }, t('btn.demo.load', 'Load the demo project')),
        h('div', { class: 'note info' }, 'Workflow: 1) Vehicle Designer → 2) Mission Planner → 3) Simulation → 4) Engineering Analysis → 5) ask the AI engineer to explain and fix. Every result comes from the physics engine; nothing is invented.'),
        h('h3', { style: { marginTop: '6px' } }, 'Saved projects'), projects))));
    root.append(homeRoot);
    app.listProjects().then((list) => { clear(projects); if (!list.length) projects.append(h('p', { class: 'muted' }, t('home.noprojects', 'No saved projects yet. Your work is saved automatically.'))); for (const p of list.slice(0, 5)) projects.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', null, p.name, h('span', { class: 'muted' }, `  ·  ${p.vehicles} vehicles, ${p.runs} runs`)), h('button', { class: 'btn small', onclick: async () => { await app.openProject(p.dir); } }, t('btn.open', 'Open')))); }).catch(() => {});
    const off = app.on('design', () => {});
    return () => { off(); earth?.stop(); };
  },
};
