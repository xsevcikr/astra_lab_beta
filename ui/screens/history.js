// Design history: every committed design change is a saved version (automatic). Name versions, compare two, restore one as a NEW step.
import { h, clear, toast, promptDialog } from '../lib/dom.js';
import { panel, emptyState } from '../lib/widgets.js';
import { summarizeState, diffStates, changeSummary } from '../../src/core/history.js';
import { decorateTerms } from '../lib/glossary.js';

const cache = new Map();   // `${historyId}:${n}` -> { sum, change }   (analysis of old snapshots never changes)
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 90) return 'just now'; if (s < 5400) return `${Math.round(s / 60)} min ago`; if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`; return new Date(iso).toLocaleDateString(); };
const num = (x, d = 0, u = '') => (Number.isFinite(x) ? `${Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })}${u}` : '–');
const signed = (x, d = 0) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: d })}` : '');
const short = (x) => (typeof x === 'number' ? String(Number(x.toPrecision(4))) : x ?? '–');
const DEC = { mass: 0, deltaV: 0, twr: 2, payload: 0, parts: 0, stages: 0 };

export default {
  id: 'history', title: 'Design history',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = { pick: [], branches: false, shown: 40, disposed: false };
    const H = () => app.project.history;
    const key = (n) => `${app.project.id}:${n}`;
    function info(rows, i) {
      const e = rows[i], k = key(e.n);
      if (!cache.has(k)) {
        const st = H().stateOf(e.n), prevRow = rows[i - 1], prev = prevRow ? H().stateOf(prevRow.n) : null;
        cache.set(k, { sum: summarizeState(st), change: e.meta?.restoredFrom ? `Copy of v${e.meta.restoredFrom}` : changeSummary(prev, st) });
      }
      return cache.get(k);
    }

    function render() {
      if (S.disposed) return;
      clear(page);
      const hist = H(), all = hist.list({ branches: S.branches }), main = hist.list();
      const cur = main.find((e) => e.current);
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Design history'),
        h('p', null, 'Every change is saved as a version.')),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'hist-name-now', title: 'Give the current design a name so you can find it later', onclick: async () => {
            const c = hist.list().find((e) => e.current); if (!c) return;
            const nm = await promptDialog('Name this version', 'Name', c.name ?? 'My good version'); if (!nm) return;
            hist.name(c.n, nm); app.markDirty(); toast(`Saved version “${nm}”`, 'ok'); render();
          } }, 'Name this version'),
          h('button', { class: 'btn std-only', id: 'hist-branches', onclick: () => { S.branches = !S.branches; render(); } }, S.branches ? 'Hide earlier branches' : 'Show earlier branches'))));
      if (main.length < 2 && !S.branches) {
        page.append(emptyState('Only one version so far', 'Change your rocket and a version appears.', [h('button', { class: 'btn primary', onclick: () => app.navigate('designer') }, 'Build a rocket')]));
        return;
      }
      // compare picker banner
      const [pa, pb] = S.pick;
      page.append(h('div', { class: 'callout info', id: 'hist-hint', style: { margin: '0 0 10px' } },
        pa == null ? 'Tick two versions to compare them.' : pb == null ? `Tick one more version to compare with v${pa}.` : `Comparing v${pa} and v${pb}.`,
        S.pick.length ? h('button', { class: 'btn small', id: 'hist-clear', style: { marginLeft: '10px' }, onclick: () => { S.pick = []; render(); } }, 'Clear') : null));
      if (S.pick.length === 2) page.append(compare(S.pick[0], S.pick[1]));

      // list: newest first
      const rows = all.slice();
      const shown = rows.slice().reverse().slice(0, S.shown);
      const idxOf = (n) => rows.findIndex((r) => r.n === n);
      page.append(panel(`Versions (${main.length})`, h('div', { style: { overflow: 'auto' } }, h('table', { id: 'hist-table' },
        h('thead', null, h('tr', null, ['Compare', 'Version', 'When', 'What changed', 'Mass', 'Delta-v', 'Push/weight', ''].map((t, i) => h('th', { class: i >= 5 && i <= 6 ? 'std-only' : '' }, t)))),
        h('tbody', null, shown.map((e) => {
          const inf = info(rows, idxOf(e.n)), s = inf.sum, picked = S.pick.includes(e.n);
          return h('tr', { class: `${e.current ? 'sel' : ''} ${e.branch ? 'hist-branch' : ''}`, id: `hist-row-${e.n}`, 'data-v': e.n },
            h('td', null, h('input', { type: 'checkbox', id: `hist-cmp-${e.n}`, checked: picked, 'aria-label': `Compare v${e.n}`, onchange: (ev) => {
              if (ev.target.checked) S.pick = [...S.pick, e.n].slice(-2); else S.pick = S.pick.filter((x) => x !== e.n); render(); } })),
            h('td', null, h('span', { class: 'mono' }, `v${e.n}`), ' ', e.name ? h('b', null, e.name) : h('span', null, e.label), e.current ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'NOW') : null, e.branch ? h('span', { class: 'badge', style: { marginLeft: '6px' }, title: 'Saved before you went back and changed something else' }, 'EARLIER BRANCH') : null),
            h('td', { class: 'muted', title: new Date(e.ts).toLocaleString() }, ago(e.ts)),
            h('td', { class: 'muted' }, inf.change),
            h('td', { class: 'num' }, num(s.mass, 0, ' kg')), h('td', { class: 'num std-only' }, num(s.deltaV, 0, ' m/s')), h('td', { class: 'num std-only' }, num(s.twr, 2)),
            h('td', null, h('div', { class: 'row' },
              e.current ? null : h('button', { class: 'btn small', id: `hist-restore-${e.n}`, title: 'Go back to this design. It becomes a new version, so you can undo it.', onclick: () => restore(e) }, 'Restore'),
              e.name ? null : h('button', { class: 'btn small std-only', title: 'Name this version', onclick: async () => { const nm = await promptDialog('Name this version', 'Name', ''); if (nm) { hist.name(e.n, nm); app.markDirty(); render(); } } }, 'Name'))));
        }))))));
      if (rows.length > S.shown) page.append(h('button', { class: 'btn', id: 'hist-more', onclick: () => { S.shown += 60; render(); } }, `Show ${Math.min(60, rows.length - S.shown)} older versions`));
      page.append(h('p', { class: 'muted' }, `Up to ${hist.limit} versions are kept.`, h('span', { class: 'std-only' }, ' Named versions are never removed. Mass, delta-v and push/weight come from the real design check of each saved design.')));
      decorateTerms(page);
    }

    function restore(e) {
      const r = H().restoreAsNew(e.n);
      if (!r) return toast('That version is no longer available.', 'bad');
      if (r.unchanged) return toast('That is already your current design.');
      app.project.applyDesignState(r.state);
      app.session.rememberAliases?.(); app.markDirty(); app.emit('design', 'restore');
      toast(`Restored v${e.n} as a new version. Undo brings back what you had.`, 'ok'); render();
    }

    function compare(na, nb) {
      const A = H().stateOf(na), B = H().stateOf(nb);
      if (!A || !B) return h('div', { class: 'callout warn' }, 'One of these versions is no longer available.');
      const [lo, hi] = na < nb ? [na, nb] : [nb, na];
      const a = lo === na ? A : B, b = lo === na ? B : A;
      const d = diffStates(a, b);
      const part = (p, sign) => h('li', null, h('b', null, sign), ` ${p.count > 1 ? p.count + ' × ' : ''}${p.label}`);
      return panel(`Compare v${lo} → v${hi}`, h('div', { class: 'col', id: 'hist-diff' },
        d.same ? h('div', { class: 'callout info' }, 'These two versions are identical.') : null,
        h('table', null, h('thead', null, h('tr', null, ['', `v${lo}`, `v${hi}`, 'Change'].map((t) => h('th', null, t)))),
          h('tbody', null, d.numbers.map((r) => h('tr', { 'data-key': r.key }, h('td', null, r.label), h('td', { class: 'num' }, num(r.a, DEC[r.key] ?? 0, r.unit ? ` ${r.unit}` : '')), h('td', { class: 'num' }, num(r.b, DEC[r.key] ?? 0, r.unit ? ` ${r.unit}` : '')), h('td', { class: 'num' }, r.delta ? signed(r.delta, DEC[r.key] ?? 0) : '–'))))),
        h('div', { class: 'grid g3' },
          h('div', null, h('b', null, `Added (${d.parts.added.length})`), h('ul', { class: 'hist-list' }, d.parts.added.length ? d.parts.added.map((p) => part(p, '+')) : h('li', { class: 'muted' }, 'none'))),
          h('div', null, h('b', null, `Removed (${d.parts.removed.length})`), h('ul', { class: 'hist-list' }, d.parts.removed.length ? d.parts.removed.map((p) => part(p, '−')) : h('li', { class: 'muted' }, 'none'))),
          h('div', null, h('b', null, `Edited (${d.parts.changed.length})`), h('ul', { class: 'hist-list' }, d.parts.changed.length ? d.parts.changed.map((p) => h('li', null, `${p.label}: `, p.props.map((q) => `${q.prop} ${short(q.a)} → ${short(q.b)}`).join(', '))) : h('li', { class: 'muted' }, 'none')))),
        d.mission.length ? h('ul', { class: 'hist-list' }, d.mission.map((t) => h('li', null, t))) : null,
        h('p', { class: 'muted' }, 'Numbers are from the design check (not a flight). Run a simulation to see how each version really flies.')));
    }

    render();
    const offs = [app.on('design', () => render()), app.on('project', () => render())];
    return () => { S.disposed = true; offs.forEach((f) => f()); };
  },
};
