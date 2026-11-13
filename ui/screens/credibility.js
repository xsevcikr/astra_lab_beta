// Credibility: how far can the simulator be trusted? Error bars on both sides, predictions apart from calibration, every failure shown.
// The numbers come from src/core/credibility.js. On opening, the page shows the stored results of scripts/update-credibility.mjs
// (data/credibility-results.js, many dispersed flights per rocket); "Fly again" recomputes one rocket live with fewer dispersed flights.
import { h, clear, esc } from '../lib/dom.js';
import { buildReport, dispersionStudy, ROLES, LEVELS, SIM_DISPERSIONS, fmtRel, fmtZ, Z_CONSISTENT, Z_TENSION } from '../../src/core/credibility.js';
import { CREDIBILITY_RESULTS } from '../../data/credibility-results.js';
import { fmtValue } from './validation.js';

const VERDICT = {
  consistent: { cls: 'ok', icon: '✓', label: 'Inside error bars', short: 'consistent' },
  tension: { cls: 'warn', icon: '!', label: 'In tension', short: 'tension' },
  inconsistent: { cls: 'bad', icon: '✕', label: 'Model error', short: 'inconsistent' },
  missing: { cls: 'muted', icon: '–', label: 'Not measured', short: 'missing' },
};
const SPAN = 0.35;   // the error-bar chart shows -35 % .. +35 %; anything further is clamped with an arrow

// live results survive re-mounts (switching detail level re-mounts the screen)
const LIVE = { studies: {}, note: {} };

const STYLE = `
.cred-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--sp-3); margin: var(--sp-3) 0 var(--sp-4); }
.cred-tile { background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--sp-3) var(--sp-4); }
.cred-tile .v { font-size: var(--fs-3xl); font-weight: var(--fw-bold); color: var(--text-strong); font-variant-numeric: tabular-nums; line-height: 1.1; }
.cred-tile .l { color: var(--muted); font-size: var(--fs-sm); margin-top: 4px; }
.cred-tile.ok .v { color: var(--ok); } .cred-tile.bad .v { color: var(--bad); } .cred-tile.warn .v { color: var(--warn); }
.cred-fails { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.cred-fails li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bad-tint); border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent); }
.cred-fails li.robustness { background: var(--warn-tint); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.cred-fails .ic { font-weight: var(--fw-bold); color: var(--bad); text-align: center; } .cred-fails li.robustness .ic { color: var(--warn); }
.cred-factors { display: grid; gap: 8px; }
.cred-factor { display: grid; grid-template-columns: 180px 150px 1fr; gap: var(--sp-3); align-items: start; padding: 8px 0; border-bottom: 1px solid var(--line); }
.cred-factor:last-child { border-bottom: 0; }
.cred-meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; height: 10px; margin-top: 5px; }
.cred-meter i { border-radius: 3px; background: var(--panel-3); }
.cred-meter i.on { background: var(--accent); }
.cred-factor .lvl { font-size: var(--fs-xs); color: var(--muted); margin-top: 4px; }
.cred-factor .next { color: var(--muted); font-size: var(--fs-sm); margin-top: 4px; }
.cred-case { margin-top: var(--sp-4); }
.cred-case-head { display: flex; gap: var(--sp-3); align-items: flex-start; flex-wrap: wrap; }
.cred-case-head .grow { flex: 1 1 300px; }
.cred-chip { display: inline-flex; gap: 6px; align-items: center; padding: 2px 9px; border-radius: var(--pill); font-size: var(--fs-xs); font-weight: var(--fw-medium); border: 1px solid var(--line); color: var(--text); background: var(--panel-2); }
.cred-chip.ok { background: var(--ok-tint); } .cred-chip.bad { background: var(--bad-tint); } .cred-chip.warn { background: var(--warn-tint); }
.cred-chip b { font-weight: var(--fw-bold); } .cred-chip.ok b { color: var(--ok); } .cred-chip.bad b { color: var(--bad); } .cred-chip.warn b { color: var(--warn); }
.cred-plot { width: 100%; overflow-x: auto; margin-top: var(--sp-2); }
.cred-plot svg { display: block; width: 100%; min-width: 640px; height: auto; font-family: var(--font); }
.cred-plot .lab { fill: var(--text); font-size: 12px; } .cred-plot .sub { fill: var(--muted); font-size: 10.5px; }
.cred-plot .axis { stroke: var(--line-strong); stroke-width: 1; } .cred-plot .grid { stroke: var(--line); stroke-width: 1; }
.cred-plot .tick { fill: var(--muted); font-size: 10.5px; }
.cred-plot .pub { fill: var(--muted); opacity: .28; } .cred-plot .zero { stroke: var(--muted); stroke-width: 1.5; }
.cred-plot .whisk { stroke-width: 2; stroke-linecap: round; } .cred-plot .pt { stroke: var(--panel-solid); stroke-width: 2; }
.cred-plot .ok { stroke: var(--ok); fill: var(--ok); } .cred-plot .warn { stroke: var(--warn); fill: var(--warn); } .cred-plot .bad { stroke: var(--bad); fill: var(--bad); } .cred-plot .muted { stroke: var(--subtle); fill: var(--subtle); }
.cred-plot .vt { font-size: 11.5px; } .cred-plot text.ok, .cred-plot text.warn, .cred-plot text.bad, .cred-plot text.muted { stroke: none; }
.cred-plot .vt.ok, .cred-plot .vt.warn, .cred-plot .vt.bad, .cred-plot .vt.muted { fill: var(--text); }
.cred-plot .hit { fill: transparent; } .cred-plot .hit:hover { fill: var(--accent-tint); }
.cred-legend { display: flex; flex-wrap: wrap; gap: var(--sp-4); color: var(--muted); font-size: var(--fs-sm); margin-top: 6px; }
.cred-legend span { display: inline-flex; gap: 6px; align-items: center; }
.cred-legend i { display: inline-block; width: 18px; height: 8px; border-radius: 2px; }
.cred-filter { display: inline-flex; gap: 4px; }
.cred-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cred-use { margin: var(--sp-3) 0; }
@media (max-width: 900px) { .cred-factor { grid-template-columns: 1fr; } }
`;
function installStyle() {
  if (document.getElementById('cred-style')) return;
  document.head.append(h('style', { id: 'cred-style' }, STYLE));
}

const val = (unit, v) => (unit === 's' && v >= 3600 ? `${(v / 3600).toFixed(2)} h` : fmtValue(unit, v));
const pm = (unit, v, s) => (v == null ? '–' : s == null ? val(unit, v) : `${val(unit, v)} ± ${val(unit, s)}`);
const relOf = (r, s) => (s == null || !r.published ? null : s / Math.abs(r.published));
const clampX = (x) => Math.max(-SPAN, Math.min(SPAN, x));

/** Forest plot of one case: x = (simulated - published) / published. Grey band = published ±2 sigma, coloured whisker = simulator ±2 sigma. */
function errorBarPlot(rows) {
  const W = 900, L = 300, R = 150, rowH = 30, top = 26, plotW = W - L - R;
  const H = top + rows.length * rowH + 12;
  const X = (x) => L + ((clampX(x) + SPAN) / (2 * SPAN)) * plotW;
  const parts = [];
  for (const t of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) {
    parts.push(`<line class="${t === 0 ? 'zero' : 'grid'}" x1="${X(t)}" x2="${X(t)}" y1="${top - 6}" y2="${H - 8}"/>`);
    parts.push(`<text class="tick" x="${X(t)}" y="${top - 12}" text-anchor="middle">${t === 0 ? 'real' : `${t > 0 ? '+' : '−'}${Math.abs(t * 100)} %`}</text>`);
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2, V = VERDICT[r.verdict] ?? VERDICT.missing;
    const tip = `${r.label}\nReal: ${r.binary ? 'yes' : pm(r.unit, r.published, r.sigmaPub)}\nSimulator: ${r.binary ? `${r.sim ? 'yes' : 'no'}, in ${Math.round((r.p ?? 0) * 100)} % of dispersed flights` : pm(r.unit, r.sim, r.sigmaSim)}\n${r.binary ? '' : `Difference ${fmtRel(r.rel)}, ${fmtZ(r.z)}\n`}${ROLES[r.role]?.label ?? r.role}: ${ROLES[r.role]?.why ?? ''}`;
    parts.push(`<g data-row="${esc(r.id)}"><title>${esc(tip)}</title><rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}"/>`);
    const label = r.label.length > 46 ? `${r.label.slice(0, 45)}…` : r.label;
    parts.push(`<text class="lab" x="${L - 12}" y="${y - 1}" text-anchor="end">${esc(label)}</text>`);
    parts.push(`<text class="sub" x="${L - 12}" y="${y + 11}" text-anchor="end">${esc(ROLES[r.role]?.label ?? r.role)}${r.kind === 'context' ? ' · context' : ''}</text>`);
    if (r.binary) {
      const cx = X(r.sim === 1 ? 0 : -SPAN);
      parts.push(`<circle class="pt ${V.cls}" cx="${cx}" cy="${y}" r="5"/>`);
      parts.push(`<text class="sub" x="${cx + 10}" y="${y + 4}">reached orbit in ${Math.round((r.p ?? 0) * 100)} % of dispersed flights</text>`);
    } else {
      const sp = relOf(r, r.sigmaPub);
      if (sp != null) parts.push(`<rect class="pub" x="${X(-2 * sp)}" y="${y - 7}" width="${Math.max(2, X(2 * sp) - X(-2 * sp))}" height="14" rx="3"/>`);
      if (r.rel != null) {
        const ss = relOf(r, r.sigmaSim);
        if (ss != null && ss > 0) parts.push(`<line class="whisk ${V.cls}" x1="${X(r.rel - 2 * ss)}" x2="${X(r.rel + 2 * ss)}" y1="${y}" y2="${y}"/>`);
        const out = Math.abs(r.rel) > SPAN, cx = X(r.rel);
        parts.push(out ? `<path class="pt ${V.cls}" d="M${cx + (r.rel > 0 ? 7 : -7)},${y} L${cx},${y - 6} L${cx},${y + 6} Z"/>` : `<circle class="pt ${V.cls}" cx="${cx}" cy="${y}" r="5"/>`);
      }
    }
    parts.push(`<text class="vt ${V.cls}" x="${W - R + 12}" y="${y + 4}">${V.icon} ${esc(r.binary ? V.short : `${fmtRel(r.rel)} · ${r.verdict === 'missing' ? 'missing' : V.short}`)}</text></g>`);
  });
  return h('div', { class: 'cred-plot', html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Error bars: simulator against the real flight">${parts.join('')}</svg>` });
}

function rowsTable(rows) {
  return h('div', { class: 'val-scroll' }, h('table', { class: 'val-table cred-table' },
    h('thead', null, h('tr', null, ['What', 'Role', 'Real ± 1σ', 'Simulator ± 1σ', 'Error', 'z', 'Verdict', 'Old ±band', 'Source'].map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => {
      const V = VERDICT[r.verdict] ?? VERDICT.missing;
      return h('tr', { 'data-row': r.id },
        h('td', null, r.label, r.basis ? h('div', { class: 'muted val-note' }, r.basis) : null),
        h('td', null, ROLES[r.role]?.label ?? r.role),
        h('td', { class: 'num' }, r.binary ? 'yes' : pm(r.unit, r.published, r.sigmaPub)),
        h('td', { class: 'num' }, r.binary ? `${r.sim == null ? '–' : r.sim ? 'yes' : 'no'} (${Math.round((r.p ?? 0) * 100)} % of dispersed)` : pm(r.unit, r.sim, r.sigmaSim)),
        h('td', { class: 'num' }, r.binary ? '–' : fmtRel(r.rel)),
        h('td', { class: 'num' }, r.z == null || Number.isNaN(r.z) ? '–' : Math.abs(r.z) > 50 ? '> 50' : r.z.toFixed(1)),
        h('td', { class: V.cls }, `${V.icon} ${V.label}${r.kind === 'context' ? ' (context)' : ''}`),
        h('td', { class: r.bandStatus === 'fail' ? 'bad' : 'muted' }, r.band == null ? '–' : `${r.bandStatus === 'pass' ? 'pass' : r.bandStatus} ±${Math.round(r.band * 100)}%`),
        h('td', null, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener', title: r.source }, 'source') : '–'));
    }))));
}

export default {
  id: 'credibility', title: 'Credibility',
  mount(root, app) {
    installStyle();
    const page = h('div', { class: 'page', id: 'cred-page' }); root.append(page);
    const S = { running: null, stop: false, filter: 'evidence', progress: '' };

    function report() {
      const studies = CREDIBILITY_RESULTS.studies.map((s) => LIVE.studies[s.id] ?? s);
      return buildReport({ studies, missions: CREDIBILITY_RESULTS.missions, evidence: CREDIBILITY_RESULTS.evidence });
    }
    async function flyAgain(id) {
      if (S.running) return;
      S.running = id; render();
      try {
        const s = await dispersionStudy(id, { n: 8, seed: Date.now() % 100000, async: true, shouldStop: () => S.stop,
          onProgress: (p) => { const el = document.getElementById(`cred-prog-${id}`); if (el) el.textContent = `Dispersed flight ${p.i} of ${p.n}…`; } });
        if (!S.stop) { LIVE.studies[id] = s; LIVE.note[id] = `Flown just now: nominal + ${s.n} dispersed flights (fewer than the stored ${CREDIBILITY_RESULTS.n}, so the simulator error bars are rougher).`; }
      } catch (e) { LIVE.note[id] = `Could not fly: ${e.message}`; }
      S.running = null; if (!S.stop) render();
    }

    function tiles(H) {
      const p = H.predictions;
      return h('div', { class: 'cred-tiles', 'data-testid': 'cred-tiles' },
        h('div', { class: `cred-tile ${p.consistent === p.total ? 'ok' : 'warn'}`, id: 'cred-headline' }, h('div', { class: 'v' }, `${p.consistent} of ${p.total}`), h('div', { class: 'l' }, 'independent predictions inside the error bars')),
        h('div', { class: 'cred-tile warn' }, h('div', { class: 'v' }, String(p.tension)), h('div', { class: 'l' }, `in tension (${Z_CONSISTENT}–${Z_TENSION} σ)`)),
        h('div', { class: `cred-tile ${p.inconsistent ? 'bad' : 'ok'}` }, h('div', { class: 'v' }, String(p.inconsistent)), h('div', { class: 'l' }, `model errors (more than ${Z_TENSION} σ)`)),
        h('div', { class: `cred-tile ${H.flights.ok === H.flights.total ? 'ok' : 'bad'}` }, h('div', { class: 'v' }, `${H.flights.ok} of ${H.flights.total}`), h('div', { class: 'l' }, 'rocket flights succeed')),
        h('div', { class: 'cred-tile' }, h('div', { class: 'v' }, `${H.band.pass} of ${H.band.total}`), h('div', { class: 'l' }, 'rows the old ±10 % band calls a match (looks better than the evidence)')));
    }

    function failures(H) {
      if (!H.failures.length) return h('div', { class: 'callout ok' }, h('b', null, 'No failures. '), 'Every flight succeeded and every prediction is inside its error bars.');
      return h('ul', { class: 'cred-fails', id: 'cred-failures' }, H.failures.map((f) => h('li', { class: f.severity, 'data-case': f.caseId },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, f.severity === 'robustness' ? '!' : '✕'),
        h('div', null, h('b', null, `${f.caseName}: `), f.what, '.', h('span', { class: 'muted' }, f.severity === 'robustness' ? ' (robustness)' : f.severity === 'failure' ? ' (flight failed)' : ' (prediction)')))));
    }

    function factors(C) {
      return h('div', null,
        h('div', { class: 'cred-factors', id: 'cred-factors' }, C.factors.map((f) => h('div', { class: 'cred-factor', 'data-factor': f.id },
          h('div', null, h('b', null, f.name)),
          h('div', null, h('div', { class: 'cred-meter', role: 'img', 'aria-label': `Level ${f.level} of 4` }, [1, 2, 3, 4].map((k) => h('i', { class: k <= f.level ? 'on' : '' }))), h('div', { class: 'lvl' }, LEVELS[f.level])),
          h('div', null, f.why, h('div', { class: 'next' }, h('b', null, 'To raise it: '), f.next))))),
        h('div', { class: 'callout warn cred-use', id: 'cred-use' }, h('b', null, 'What it is good for: '), C.use),
        h('p', { class: 'muted' }, 'The eight factors are those of NASA-STD-7009A (Standard for Models and Simulations). The levels here are simplified and SELF-ASSESSED with fixed rules from the evidence on this page; this is not an official NASA assessment.'));
    }

    function caseCard(c) {
      const shown = S.filter === 'evidence' ? c.rows.filter((r) => r.evidence || (r.role === 'prediction' && r.kind === 'context')) : c.rows;
      const chips = [];
      if (c.kind === 'vehicle') {
        chips.push(h('span', { class: `cred-chip ${c.outcome.ok ? 'ok' : 'bad'}`, 'data-testid': 'cred-outcome' }, h('b', null, c.outcome.ok ? '✓' : '✕'), c.outcome.ok ? 'Nominal flight succeeds' : 'Nominal flight FAILS'));
        const D = c.dispersed;
        chips.push(h('span', { class: `cred-chip ${D.rate >= 0.8 ? 'ok' : D.rate >= 0.5 ? 'warn' : 'bad'}` }, h('b', null, `${D.ok}/${D.n}`), 'dispersed flights succeed', c.suborbital ? null : h('span', { class: 'muted' }, ` · ${D.inOrbit}/${D.n} get into orbit`)));
        if (c.fitted) chips.push(h('span', { class: 'cred-chip warn' }, h('b', null, '!'), 'Pitch table fitted to this flight'));
      } else chips.push(h('span', { class: 'cred-chip' }, 'Not dispersed: no simulator error bar'));
      const ev = c.rows.filter((r) => r.evidence && r.verdict !== 'missing');
      const live = LIVE.note[c.id];
      return h('section', { class: 'val-card cred-case', id: `cred-${c.id}` },
        h('div', { class: 'cred-case-head' },
          h('div', { class: 'grow' }, h('h2', null, c.name), h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: '6px' } }, chips),
            !c.outcome.ok && c.outcome.reason ? h('div', { class: 'bad', style: { marginTop: '6px' } }, c.kind === 'vehicle' ? `Why it failed: ${c.outcome.reason}.` : c.outcome.reason) : null,
            live ? h('div', { class: 'muted', style: { marginTop: '4px' } }, live) : null),
          c.kind === 'vehicle' ? h('div', { class: 'val-actions' },
            h('button', { class: 'btn', id: `cred-run-${c.id}`, disabled: !!S.running || null, onclick: () => flyAgain(c.id) }, 'Fly again (8 dispersed)'),
            S.running === c.id ? h('div', { class: 'muted', id: `cred-prog-${c.id}` }, 'Flying…') : null) : null),
        h('div', { class: 'muted', style: { marginTop: '6px' } }, ev.length ? `${ev.filter((r) => r.verdict === 'consistent').length} of ${ev.length} predictions inside the error bars.` : 'No independent prediction in this case: every row is calibration, a target, the plan or a build check.'),
        shown.length ? errorBarPlot(shown) : h('p', { class: 'muted' }, 'Nothing to plot with this filter. Choose "All rows" above to see the calibration and build rows.'),
        h('details', { class: 'more' }, h('summary', null, `All ${c.rows.length} rows as a table`), rowsTable(c.rows)));
    }

    function render() {
      clear(page);
      const rep = report(), H = rep.headline;
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' },
        h('h1', null, 'How far can you trust the simulator?'),
        h('p', null, 'Real flights against the simulator, with error bars on both sides. Only real predictions count; tuned numbers and failures are shown, not hidden.'),
        h('p', { class: 'muted' }, `Stored results from ${CREDIBILITY_RESULTS.generated}: every rocket flown once as published and ${CREDIBILITY_RESULTS.n} more times with dispersed inputs.`))));
      page.append(tiles(H));
      page.append(h('section', { class: 'val-card' }, h('h2', null, `Failures and weak spots (${H.failures.length})`), failures(H)));
      page.append(h('section', { class: 'val-card' }, h('h2', null, 'Credibility scores'), factors(rep.credibility)));
      page.append(h('div', { class: 'page-head val-missions-head' }, h('div', { class: 'grow' }, h('h1', null, 'Every comparison'),
        h('p', { class: 'muted' }, 'Grey band: the real number ± 2σ. Dot and line: the simulator ± 2σ from the dispersed flights. Hover a row for the numbers.')),
        h('div', { class: 'cred-filter', role: 'group', 'aria-label': 'Which rows' },
          h('button', { class: `btn ${S.filter === 'evidence' ? 'primary' : ''}`, id: 'cred-filter-evidence', onclick: () => { S.filter = 'evidence'; render(); } }, 'Predictions only'),
          h('button', { class: `btn ${S.filter === 'all' ? 'primary' : ''}`, id: 'cred-filter-all', onclick: () => { S.filter = 'all'; render(); } }, 'All rows'))));
      page.append(h('div', { class: 'cred-legend' },
        h('span', null, h('i', { style: { background: 'var(--muted)', opacity: 0.35 } }), 'Real ± 2σ'),
        ...['consistent', 'tension', 'inconsistent'].map((k) => h('span', null, h('i', { style: { background: `var(--${VERDICT[k].cls})`, height: '3px' } }), `${VERDICT[k].icon} ${VERDICT[k].label}`))));
      for (const c of rep.cases) page.append(caseCard(c));
      page.append(h('details', { class: 'more val-info' }, h('summary', null, 'How this is computed'),
        h('p', null, 'z = (simulator − real) / √(σ_sim² + σ_real²). |z| ≤ 2: inside the error bars. 2 to 3: tension. Above 3: the model has an error the listed uncertainties cannot explain (a model-form error).'),
        h('h4', null, 'What each row can prove'), h('ul', null, Object.values(ROLES).map((r) => h('li', null, h('b', null, `${r.label}: `), r.why, r.evidence ? ' Counts as evidence.' : ''))),
        h('h4', null, 'Simulator inputs dispersed (1σ)'), h('ul', null, SIM_DISPERSIONS.map((d) => h('li', null, h('b', null, `${d.label}: ${(d.sigma * 100).toFixed(1)} %. `), d.basis))),
        h('p', { class: 'muted' }, 'Error bars of the real numbers and the role of every row: data/validation-uncertainty.js. Full tables: documentation/CREDIBILITY.md.')));
      page.append(h('p', null, h('button', { class: 'btn', id: 'cred-to-validation', onclick: () => app.navigate('validation') }, 'Open the Validation screen (fly each rocket and see its full flight)')));
    }
    render();
    return () => { S.stop = true; };
  },
};
