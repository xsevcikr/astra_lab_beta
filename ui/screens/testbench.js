// Test bench (2.0): "Will it work?" One click flies an example (or your own design) in the real simulator and shows PASS or FAIL
// with one plain sentence why. Flights run in a separate session, so nothing in the project changes until you press "Open it".
import { h, clear, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { EXAMPLES, exampleCard, makeExample, testExample, testDesign } from '../../src/core/testbench.js';
import { openShareDialog } from '../lib/sharedialog.js';

const KINDS = [['all', 'All'], ['rocket', 'Rockets'], ['probe', 'Probes and satellites'], ['lander', 'Landers'], ['rover', 'Rovers']];
const KIND_ICON = { rocket: 'rocket', probe: 'satellite', lander: 'lander', rover: 'rover' };
const CACHE = { results: {}, filter: 'all' };     // verdicts survive switching screens while the app runs

function claimFor(mission) {
  const o = mission?.objective ?? {};
  if (o.type === 'orbit' && o.altitude) return { kind: 'orbit', km: Math.round(o.altitude / 1000) };
  return null;
}

export default {
  id: 'testbench', title: 'Test bench',
  mount(root, app) {
    const page = h('div', { class: 'page tb-page', id: 'tb-page' }); root.append(page);
    const S = { busy: null, stop: false };

    function load(id, then) {
      const { vehicle, mission } = makeExample(id);
      app.project.setVehicle(vehicle, { activate: true });
      if (mission) { mission.vehicleName = vehicle.name; app.project.setMission(mission, { activate: true }); }
      app.commit?.(`Load test bench example ${id}`); app.markDirty?.(); app.emit?.('design', 'loaded');
      toast(`Loaded "${vehicle.name}".`, 'ok'); app.navigate(then);
    }
    async function run(id) {
      if (S.busy) return;
      S.busy = id; render();
      try { CACHE.results[id] = id === '__mine' ? await testDesign({ vehicle: app.project.vehicle, mission: app.project.mission, claim: claimFor(app.project.mission) }, { name: 'My design' }) : await testExample(id); }
      catch (e) { CACHE.results[id] = { pass: false, headline: 'Could not test it', reason: e.message, facts: [] }; }
      S.busy = null; if (!S.stop) render();
    }
    async function runAll() { for (const E of EXAMPLES) { if (S.stop) return; if (CACHE.filter === 'all' || E.kind === CACHE.filter) await run(E.id); } }

    function verdict(r) {
      return h('div', { class: `tb-verdict ${r.pass ? 'pass' : 'fail'}`, role: 'status' },
        h('div', { class: 'tb-big' }, icon(r.pass ? 'check' : 'cross', { size: 22 }), ' ', r.pass ? 'PASS' : 'FAIL'),
        h('div', { class: 'tb-reason' }, r.reason),
        r.facts?.length ? h('div', { class: 'tb-facts' }, r.facts.map(([k, v]) => h('span', { class: 'tb-fact' }, h('small', null, k), h('b', null, v)))) : null,
        r.why && !r.pass ? h('div', { class: 'muted std-only tb-why' }, `Simulator: ${r.why}`) : null);
    }
    function card(id) {
      const c = exampleCard(id), r = CACHE.results[id], busy = S.busy === id;
      return h('article', { class: `tb-card ${c.broken ? 'broken' : ''} ${r ? (r.pass ? 'is-pass' : 'is-fail') : ''}`, id: `tb-${id}`, 'data-kind': c.kind },
        h('div', { class: 'tb-card-head' }, h('span', { class: 'tb-ico' }, icon(KIND_ICON[c.kind] ?? 'rocket', { size: 26 })),
          h('div', { class: 'grow' }, h('b', null, c.title), h('div', { class: 'muted' }, c.blurb),
            c.broken ? h('span', { class: 'chip warn tb-tag', title: c.change }, `Broken on purpose: ${c.change.toLowerCase()}`) : h('span', { class: 'chip tb-tag' }, ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[c.difficulty] ?? ''))),
        h('div', { class: 'tb-goal' }, h('small', null, 'Goal: '), c.goal),
        busy ? h('div', { class: 'tb-run' }, h('span', { class: 'spinner' }), ' Flying it in the simulator…') : r ? verdict(r) : null,
        h('div', { class: 'row tb-actions' },
          h('button', { class: `btn ${r ? '' : 'primary'}`, id: `tb-run-${id}`, disabled: !!S.busy || null, onclick: () => run(id) }, icon('play', { size: 15 }), r ? ' Test again' : ' Test it'),
          h('button', { class: 'btn small', id: `tb-watch-${id}`, title: 'Load it and watch the flight in 3D', onclick: () => load(id, 'control') }, 'Watch it fly'),
          h('button', { class: 'btn small', id: `tb-open-${id}`, title: 'Load it into the builder to change it', onclick: () => load(id, 'designer') }, 'Open it')));
    }
    function mine() {
      const v = app.project.vehicle, r = CACHE.results.__mine, busy = S.busy === '__mine';
      return h('section', { class: 'tb-mine', id: 'tb-mine' },
        h('div', { class: 'grow' }, h('h2', null, v ? `Your design: ${v.name}` : 'Your design'),
          h('p', { class: 'muted' }, v ? 'Fly your own design on its mission and get a verdict.' : 'Build a design or open an example, then test it here.'),
          busy ? h('div', { class: 'tb-run' }, h('span', { class: 'spinner' }), ' Flying it in the simulator…') : r ? verdict(r) : null),
        h('div', { class: 'col tb-mine-actions' },
          h('button', { class: 'btn primary', id: 'tb-run-mine', disabled: !v || !!S.busy || null, onclick: () => run('__mine') }, icon('play', { size: 15 }), ' Test my design'),
          h('button', { class: 'btn', id: 'tb-share', onclick: () => openShareDialog(app) }, icon('share', { size: 15 }), ' Share or open a design')));
    }
    function render() {
      clear(page);
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Will it work?'),
        h('p', null, 'Pick an example and press Test it. It really flies in the simulator, then you get PASS or FAIL and the reason.')),
        h('button', { class: 'btn', id: 'tb-run-all', disabled: !!S.busy || null, onclick: runAll }, 'Test all shown')));
      page.append(mine());
      page.append(h('div', { class: 'tb-filter seg', role: 'tablist' }, KINDS.map(([k, label]) => h('button', { class: `seg-btn ${CACHE.filter === k ? 'on' : ''}`, 'data-filter': k, onclick: () => { CACHE.filter = k; render(); } }, label))));
      page.append(h('div', { class: 'tb-grid' }, EXAMPLES.filter((E) => CACHE.filter === 'all' || E.kind === CACHE.filter).map((E) => card(E.id))));
      page.append(h('p', { class: 'muted tb-foot' }, 'Every verdict comes from a full flight with the same physics as Launch it. The broken examples are real designs with one change, so you can see what failure looks like.'));
    }
    render();
    return () => { S.stop = true; };
  },
};
