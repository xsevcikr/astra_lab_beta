// AI Aerospace Engineer: chat that builds, tests, diagnoses and improves vehicles only through the same tools the UI uses.
// Every design change is shown as a proposal first (approve / edit / cancel) and is one undo step.
import { h, clear, toast, fmt, mdToHtml, modal, esc } from '../lib/dom.js';
import { atLeast } from '../../src/core/levels.js';
import { statusBadge, saveFile } from '../lib/widgets.js';
import { icon } from '../lib/icons.js';

const num = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('en', { maximumFractionDigits: d }) : '–');
function expectedText(e) {
  if (typeof e === 'string') return e;
  const bits = [];
  if (e.dvRequired != null) bits.push(`about ${num(e.dvRequired)} m/s of delta-v are needed`);
  if (e.newDesignDv != null) bits.push(`design delta-v ${num(e.newDesignDv)} m/s${e.margin ? ` (margin ×${num(e.margin, 3)})` : ''}`);
  for (const [k, v] of Object.entries(e)) if (!['dvRequired', 'newDesignDv', 'margin'].includes(k)) bits.push(`${k}: ${typeof v === 'number' ? num(v, 2) : v}`);
  return bits.join('; ');
}
/** Design summary of the previewed result (computed by the sizing model, not by a simulation). */
function summaryView(a, before) {
  const rows = [['Total mass', `${num(a.totalMass)} kg`, before?.totalMass != null ? `${num(before.totalMass)} kg` : ''], ['Dry mass', `${num(a.dryMass)} kg`, before?.dryMass != null ? `${num(before.dryMass)} kg` : ''], ['Propellant', `${num(a.propellantMass)} kg`, before?.propellantMass != null ? `${num(before.propellantMass)} kg` : ''], ['Payload', `${num(a.payloadMass)} kg`, ''],
    ['Length × diameter', `${num(a.length, 1)} × ${num(a.diameter, 2)} m`, ''], ['Liftoff thrust/weight', num(a.liftoffTWR, 2), before?.liftoffTWR != null ? num(before.liftoffTWR, 2) : ''], ['Delta-v (vacuum, sizing estimate)', `${num(a.dvVacuum)} m/s`, before?.dvVacuum != null ? `${num(before.dvVacuum)} m/s` : '']].filter((r) => r[1] && !/^–/.test(r[1]));
  const hasBefore = !!before;
  return h('div', { style: { padding: '0 12px 8px' } }, h('div', { class: 'muted', style: { fontSize: '11.5px', margin: '4px 0' } }, 'RESULT OF THE PREVIEW (design estimates from the sizing model, not a simulation)'),
    h('table', { style: { fontSize: '12.5px' } }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'After'), hasBefore ? h('th', { class: 'num' }, 'Before') : null)), h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r[0]), h('td', { class: 'num' }, r[1]), hasBefore ? h('td', { class: 'num muted' }, r[2]) : null)))),
    a.stages?.length ? h('table', { style: { fontSize: '12.5px', marginTop: '6px' } }, h('thead', null, h('tr', null, ['Stage', 'Ignition mass', 'Propellant', 'Vac. thrust', 'Δv (vac)', 'Burn time', 'T/W start'].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
      h('tbody', null, a.stages.map((st) => h('tr', null, h('td', null, st.name), h('td', { class: 'num' }, `${num(st.ignitionMass)} kg`), h('td', { class: 'num' }, `${num(st.propellant)} kg`), h('td', { class: 'num' }, `${num(st.thrustVac / 1000, 1)} kN`), h('td', { class: 'num' }, `${num(st.dvVac)} m/s`), h('td', { class: 'num' }, `${num(st.burnTime)} s`), h('td', { class: 'num' }, num(st.twrStart, 2)))))) : null);
}
const STARTERS = ['Build me a two-stage rocket carrying a 100 kg space probe.', 'Test it.', 'Why did it fail?', 'Fix it.', 'Build me a rover for Mars', 'help'];
const CHIP_LABEL = { 'Build me a two-stage rocket carrying a 100 kg space probe.': 'Build a rocket', 'Build me a rover for Mars': 'Build a rover', 'Test it.': 'Test it', 'Fix it.': 'Fix it', help: 'Help' };

export default {
  id: 'ai', title: 'AI Engineer', fill: true,
  mount(root, app, params) {
    const S = { busy: false, progress: null };
    const layout = h('div', { class: 'ai-layout', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 270px', height: '100%', minHeight: 0 } });
    const chat = h('div', { class: 'chat' });
    const log = h('div', { class: 'chat-log', id: 'chat-log' });
    const side = h('div', { class: 'side std-only' });
    const input = h('textarea', { class: 'input', id: 'chat-text', rows: 2, placeholder: app.settings.mode === 'beginner' ? 'Ask me anything…' : 'Ask the engineer… e.g. “Build me a two-stage rocket carrying a 100 kg space probe.”  (Enter to send, Shift+Enter for a new line)' });
    const sendBtn = h('button', { class: 'btn primary', id: 'chat-send', onclick: () => send() }, 'Send');
    const chips = h('div', { class: 'suggestions', id: 'chat-chips' });
    chat.append(log, h('div', { class: 'chat-input' }, chips, h('div', { class: 'row' }, input, sendBtn)));
    layout.append(chat, side); root.append(layout);

    // ------------------------------------------------------------------ message rendering
    // Beginner: the build steps and numbers sit behind one click; the buttons stay visible.
    function detailWrap(nodes) {
      const real = nodes.filter(Boolean);
      if (app.settings.mode !== 'beginner') return real;
      return h('details', { class: 'more', style: { padding: '4px 12px' } }, h('summary', null, 'Steps and numbers'), real);
    }
    function planCard(m) {
      const p = m.plan; if (!p) return null;
      const live = app.session.pending?.plan.id === p.id;
      const box = h('div', { class: 'plan', 'data-plan': p.id },
        h('div', { class: 'plan-head' }, icon('layers', { size: 16 }), h('span', { style: { flex: 1 } }, p.title), h('span', { class: `badge ${live ? '' : 'muted'}` }, live ? 'Your turn' : 'closed')),
        detailWrap([        h('div', { style: { padding: '8px 12px' } },
          p.rationale ? h('p', { class: 'muted', style: { margin: '0 0 6px' } }, p.rationale) : null,
          p.expected ? h('p', { style: { margin: '0 0 6px' } }, h('b', null, 'Expected: '), expectedText(p.expected), h('span', { class: 'muted' }, ' (a prediction, not a result — it is verified by re-running the simulation)')) : null),
        h('ol', null, p.steps.map((s) => h('li', { class: s.ok ? '' : 'bad', title: s.message }, h('code', null, s.tool), ' ', s.why || '', s.ok ? '' : ` - failed: ${s.message}`))),
        p.after ? summaryView(p.after, p.before) : null,
        p.issues?.length ? h('div', { style: { padding: '0 12px 8px' } }, p.issues.slice(0, 5).map((i) => h('div', { class: i.severity === 'error' ? 'bad' : 'warn', style: { fontSize: '12.5px' } }, `${i.severity === 'error' ? 'Fix:' : '!'} ${i.message}`))) : null]),
        live ? h('div', { class: 'plan-foot' },
          h('button', { class: 'btn primary', 'data-action': 'approve', disabled: !p.ok || S.busy, onclick: () => send('yes, apply it') }, [icon('check', { size: 15 }), ' Approve']),
          h('button', { class: 'btn', disabled: S.busy, onclick: () => editPlan() }, 'Edit'),
          h('button', { class: 'btn danger', disabled: S.busy, onclick: () => send('cancel') }, 'Cancel'),
          !p.ok ? h('span', { class: 'bad' }, 'A step fails. Edit or cancel.') : h('span', { class: 'muted std-only' }, 'Nothing changes until you approve. Undo reverses it.')) : null);
      return box;
    }
    function callsView(m) {
      if (!m.calls?.length) return null;
      return h('details', { class: 'calls' }, h('summary', null, `${m.calls.length} tool call${m.calls.length > 1 ? 's' : ''} used`), h('div', null, m.calls.map((c) => h('div', null, h('code', null, c.tool), ' ', c.ok ? 'ok' : 'failed', h('span', { class: 'muted' }, ' ' + JSON.stringify(c.args ?? {}).slice(0, 160))))));
    }
    function runButtons(m) {
      if (!m.run) return null;
      return h('div', { class: 'row', style: { marginTop: '6px' } }, statusBadge(m.run.status),
        h('button', { class: 'btn small', onclick: () => app.navigate('analysis', { runId: m.run.id }) }, 'Analysis'), h('button', { class: 'btn small', onclick: () => app.navigate('replay', { runId: m.run.id }) }, 'Replay'), h('button', { class: 'btn small', onclick: () => app.navigate('telemetry', { runId: m.run.id }) }, 'Telemetry'));
    }
    function linkButtons(m) {
      if (!m.links?.length) return null;
      return h('div', { class: 'row', style: { marginTop: '8px' } }, m.links.map((l) => h('button', { class: 'btn small primary', 'data-link': l.screen, onclick: () => app.navigate(l.screen, l.params) }, l.label)));
    }
    // "I understood" card: what the engineer took from the request. Every row says who it came from.
    const TAGS = { you: ['You said', 'aiu-you'], assumed: ['My guess', 'aiu-guess'], auto: ['My design', 'aiu-auto'] };
    function understoodCard(m) {
      const u = m.understood; if (!u) return null;
      const live = app.session.pending?.plan.id === m.plan?.id;
      return h('div', { class: 'aiu-card', 'data-understood': '1' },
        h('div', { class: 'aiu-head' }, h('b', null, 'I understood')),
        h('div', { class: 'aiu-rows' }, u.rows.map((r) => h('div', { class: 'aiu-row' },
          h('span', { class: 'aiu-label' }, r.label),
          h('span', { class: 'aiu-value' }, r.value, r.note ? h('span', { class: 'aiu-note' }, ` · ${r.note}`) : null),
          h('span', { class: `aiu-tag ${(TAGS[r.tag] ?? TAGS.auto)[1]}` }, (TAGS[r.tag] ?? TAGS.auto)[0]),
          live && r.edit ? h('button', { class: 'btn small', title: 'Change this', onclick: () => { input.value = r.edit; input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }, 'Edit') : h('span')))),
        u.limits?.length ? h('div', { class: 'aiu-limits' }, u.limits.map((l) => h('div', null, 'Note: ', l))) : null,
        live ? h('div', { class: 'aiu-foot' }, 'Right? Press Approve, or tell me what to change.') : null);
    }
    function questionChips(m) {
      if (!m.question) return null;
      const last = [...app.chat].reverse().find((x) => x.role === 'assistant');
      return h('div', { class: 'aiu-chips', 'data-question': m.question.id }, m.question.chips.map((c) => h('button', { class: 'chip', disabled: S.busy || last !== m, onclick: () => send(c) }, c)));
    }
    function msgEl(m) {
      if (m.role === 'user') return h('div', { class: 'msg user' }, m.text);
      // Short answers first (the `short` field of the engineer's reply); the long text stays one click away. Advanced mode shows everything.
      if (m.short && !atLeast(app.settings.mode, 'engineer')) {
        const showShort = !m.understood;
        const more = !m.question ? h('details', { class: 'more' }, h('summary', null, 'More'), h('div', { html: mdToHtml(m.text) })) : null;
        return h('div', { class: 'msg assistant', 'data-id': m.id }, h('div', { class: 'who' }, m.offline === false ? 'ASTRA engineer · online model' : 'ASTRA engineer'), showShort ? h('div', { class: 'aiu-short', html: mdToHtml(m.short) }) : null, understoodCard(m), questionChips(m), planCard(m), runButtons(m), linkButtons(m), more, callsView(m));
      }
      // Beginner mode: show the answer's headline and first explanation, keep the long list of numbers one click away.
      const paras = String(m.text).split(/\n{2,}/);
      const long = app.settings.mode === 'beginner' && paras.length > 3 && m.text.length > 700;
      const body = long
        ? h('div', null, h('div', { html: mdToHtml(paras.slice(0, 2).join('\n\n')) }), h('details', { class: 'more' }, h('summary', null, 'More'), h('div', { html: mdToHtml(paras.slice(2).join('\n\n')) })))
        : h('div', { html: mdToHtml(m.text) });
      return h('div', { class: 'msg assistant', 'data-id': m.id }, h('div', { class: 'who' }, m.offline === false ? 'ASTRA engineer · online model' : 'ASTRA engineer'), body, understoodCard(m), questionChips(m), planCard(m), runButtons(m), linkButtons(m), callsView(m));
    }
    function renderAll() {
      clear(log);
      if (!app.chat.length) log.append(welcome());
      for (const m of app.chat) log.append(msgEl(m));
      if (S.busy) log.append(h('div', { class: 'typing', id: 'typing' }, progressText()));
      log.scrollTop = log.scrollHeight;
      renderChips(); renderSide();
    }
    const progressText = () => { const p = S.progress; if (!p) return 'The engineer is working… (real simulations can take up to a minute)'; if (p.tuning) return `Testing ascent programme ${p.tuning.tried} of up to ${p.tuning.of}…`; if (p.exp) return `Experiment: case ${p.exp.done} of ${p.exp.total}…`; if (p.t != null) return `Simulating… T+${fmt(p.t, 0)} s, altitude ${fmt((p.alt ?? 0) / 1000, 1)} km`; return 'The engineer is working…'; };
    function welcome() {
      if (app.settings.mode === 'beginner') {
        return h('div', { class: 'msg assistant' }, h('div', { class: 'who' }, 'AI Helper'),
          h('p', null, 'Hi! Tell me what to build and I will design it.'),
          h('p', { class: 'muted' }, 'I show my plan first. You decide.'));
      }
      return h('div', { class: 'msg assistant' }, h('div', { class: 'who' }, 'ASTRA engineer'),
        h('p', null, 'I am the built-in aerospace engineer of ASTRA LAB. I design, test, diagnose and improve vehicles by calling the same physics engine and the same tools you use in the other screens. I never invent results: every number comes from a real simulation or a calculation, and anything that is only an estimate is labelled as such.'),
        h('p', null, 'The complete loop to try: ', h('b', null, '“Build me a two-stage rocket carrying a 100 kg space probe.”'), ' → approve → ', h('b', null, '“Test it.”'), ' → ', h('b', null, '“Why did it fail?”'), ' → ', h('b', null, '“Fix it.”')),
        h('p', { class: 'muted' }, 'Changes are always shown as a proposal first. You approve, edit or cancel. Type “help” for everything I can do.'));
    }
    function renderChips() {
      clear(chips);
      const last = [...app.chat].reverse().find((m) => m.role === 'assistant');
      const sug = (last?.question ? [] : last?.suggestions?.length ? last.suggestions : app.chat.length ? [] : STARTERS).slice(0, 6);
      for (const s of sug) chips.append(h('button', { class: 'chip', disabled: S.busy, title: s, onclick: () => send(s) }, app.settings.mode === 'beginner' ? (CHIP_LABEL[s] ?? s) : s));
    }
    function renderSide() {
      clear(side);
      const P = app.project;
      const vers = app.session.versions().slice().reverse();
      side.append(h('div', { class: 'panel-head' }, h('h3', null, 'AI engineer')),
        h('div', { style: { padding: '8px 14px', fontSize: '12.5px', display: 'grid', gap: '4px' } },
          h('div', null, app.session.llm?.enabled ? `Online model: ${app.settings.ai.model}` : 'Built-in offline engineer'),
          h('div', { class: 'muted' }, app.session.llm?.enabled ? 'Free-form requests go to the model, which can only act through the tools. Your API key is never stored in project files.' : 'Works fully offline with rules and the real physics engine. Optionally connect an online model in Settings for free-form conversation.'),
          h('button', { class: 'btn small', onclick: () => app.navigate('settings') }, 'AI settings')),
        h('div', { class: 'panel-head' }, h('h3', null, 'Design history')),
        h('div', { class: 'row', style: { padding: '8px 14px' } }, h('button', { class: 'btn small', id: 'ai-undo', onclick: () => { app.undo(); renderAll(); } }, 'Undo'), h('button', { class: 'btn small', onclick: () => { app.redo(); renderAll(); } }, 'Redo')),
        h('div', { style: { padding: '0 0 10px', maxHeight: '260px', overflow: 'auto' } }, h('div', { class: 'tree' }, vers.slice(0, 40).map((v) => h('div', { class: `item ${v.current ? 'sel' : ''}`, style: { paddingLeft: '14px' }, title: 'Restore this version', onclick: () => { if (v.current) return; const l = app.session.restoreVersion(v.n); app.markDirty(); app.emit('design', 'restore'); toast(`Restored: ${l}`); renderAll(); } }, h('span', { class: 'mono muted' }, `v${v.n}`), h('span', null, v.label))))),
        h('div', { class: 'panel-head' }, h('h3', null, 'Project memory')),
        h('div', { style: { padding: '8px 14px', fontSize: '12px', color: 'var(--muted)' } }, `Vehicle: ${P.vehicle?.name ?? 'none'}`, h('br'), `Mission: ${P.mission?.name ?? 'none'}`, h('br'), `${P.runs.length} recorded run(s). The engineer remembers this project’s designs, runs and your instructions (“the second stage”, “the probe”).`),
        h('div', { class: 'row', style: { padding: '0 14px 12px' } }, h('button', { class: 'btn small', onclick: () => saveFile(app, `${P.name.replace(/[^\w.-]+/g, '_')}-ai-conversation.txt`, app.chat.map((m) => `${m.role === 'user' ? 'YOU' : 'ENGINEER'}: ${m.text}`).join('\n\n'), 'text/plain') }, 'Export conversation'), h('button', { class: 'btn small', onclick: () => { P.aiHistory.length = 0; app.chat = []; app.markDirty(); renderAll(); } }, 'Clear chat')));
    }

    // ------------------------------------------------------------------ actions
    async function send(text) {
      text = (text ?? input.value).trim(); if (!text || S.busy) return;
      input.value = ''; S.busy = true; S.progress = null; sendBtn.disabled = true;
      const p = app.ask(text);      // pushes the user message synchronously
      renderAll();
      try { await p; } catch (e) { toast(`The engineer failed: ${e.message}`, 'bad', 8000); }
      S.busy = false; S.progress = null; sendBtn.disabled = false; renderAll(); input.focus();
    }
    function editPlan() {
      const pend = app.session.pending; if (!pend) return;
      const rows = pend.plan.calls.map((c, i) => ({ i, on: true, tool: c.tool, why: c.why, args: h('textarea', { class: 'input mono', rows: Math.min(8, JSON.stringify(c.args, null, 1).split('\n').length + 1), style: { width: '100%' } }, JSON.stringify(c.args, null, 1)), cb: h('input', { type: 'checkbox', checked: true }) }));
      const body = h('div', { class: 'col' }, h('p', { class: 'muted' }, 'Untick a step to drop it, or edit its arguments (JSON). The edited proposal is previewed again before anything is applied.'),
        rows.map((r) => h('div', { class: 'panel', style: { padding: '8px 10px' } }, h('label', { class: 'row' }, r.cb, h('b', null, r.tool), h('span', { class: 'muted' }, r.why || '')), r.args)));
      modal({ title: 'Edit proposal', wide: true, body, buttons: [{ label: 'Cancel' }, { label: 'Preview edited proposal', primary: true, onClick: async () => {
        try {
          const calls = rows.filter((r) => r.cb.checked).map((r) => ({ tool: r.tool, args: JSON.parse(r.args.value), why: r.why }));
          if (!calls.length) { toast('Nothing left to apply. Use Cancel to discard the proposal.', 'bad'); return false; }
          await app.session.editPendingCalls(calls);
          app.chat.push({ id: `e${Date.now()}`, role: 'assistant', text: 'I re-checked the proposal after your edit. Nothing has been applied yet.', plan: app.session.planView(), calls: [], suggestions: ['Yes, apply it', 'Cancel'], offline: true });
          renderAll();
        } catch (e) { toast(`Cannot use that edit: ${e.message}`, 'bad', 8000); return false; }
      } }] });
    }

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const offs = [
      app.on('sim-event', (e) => {
        if (!S.busy) return;
        if (e.type === 'sim-progress') S.progress = { ...S.progress, t: e.t, alt: e.alt };
        else if (e.type === 'tuning') S.progress = { ...S.progress, tuning: { tried: e.tried, of: e.of } };
        else if (e.type === 'experiment-progress') S.progress = { ...S.progress, exp: { done: e.done, total: e.total } };
        else return;
        const t = document.getElementById('typing'); if (t) t.textContent = progressText();
      }),
      app.on('project', () => renderAll()),
    ];
    renderAll();
    if (params?.prefill) { input.value = params.prefill; input.focus(); if (params.send) send(); }
    return () => offs.forEach((f) => f());
  },
};
