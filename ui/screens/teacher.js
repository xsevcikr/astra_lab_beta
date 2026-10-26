// Teacher mode (offline, no server): make an assignment file from the challenge library, load students' report files, see a class table.
// Students import the assignment in Challenges -> "Import assignment" and export a report file from there.
import { h, clear, toast } from '../lib/dom.js';
import { panel, emptyState, saveFile } from '../lib/widgets.js';
import { ALL_CHALLENGES, DIFFICULTY_NAMES, challengeById } from '../../src/core/challenges.js';
import { createAssignment, exportAssignment, parseAssignment, parseReport, classTable, classCsv, daysLeft, INTEGRITY_NOTE } from '../../src/core/teacher.js';

const stars = (n) => `${n}/3`;
const nice = { maxAlt: ['Highest point', 1e-3, 'km'], finalApo: ['High point', 1e-3, 'km'], finalPeri: ['Low point', 1e-3, 'km'], finalIncl: ['Orbit tilt', 1, '°'], initialMass: ['Liftoff mass', 1e-3, 't'], touchdownVertical: ['Touchdown speed', 1, 'm/s'], payloadKg: ['Payload', 1, 'kg'], maxG: ['Peak g', 1, 'g'], dvVacuum: ['Rocket delta-v', 1, 'm/s'] };
const metricText = (m) => Object.entries(nice).filter(([k]) => Number.isFinite(m?.[k])).slice(0, 4).map(([k, [l, f, u]]) => `${l} ${(m[k] * f).toFixed(f < 1 ? 1 : k === 'finalIncl' || k === 'maxG' || k === 'touchdownVertical' ? 1 : 0)} ${u}`).join(' · ');

/** A printable view of one student's report (also used by Challenges). */
export function reportView(rep) {
  return h('div', { class: 'tch-print-area', id: 'tch-report' },
    h('h2', null, `${rep.student}: ${rep.assignment.title}`), h('div', { class: 'muted' }, `Report made ${new Date(rep.created).toLocaleString()}${rep.assignment.due ? ` · due ${rep.assignment.due}` : ''}`),
    h('table', null, h('thead', null, h('tr', null, ['Challenge', 'Stars', 'Tries', 'Measured numbers (proof)'].map((t) => h('th', null, t)))),
      h('tbody', null, rep.entries.map((e) => h('tr', null, h('td', null, e.title), h('td', null, stars(e.stars)), h('td', { class: 'num' }, String(e.attempts)), h('td', { class: 'muted' }, e.proof ? `${metricText(e.proof.metrics)} · #${e.proof.hash.slice(0, 10)}` : '–'))))),
    h('p', { class: 'muted tch-note' }, INTEGRITY_NOTE));
}

export default {
  id: 'teacher', title: 'Teacher mode',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = (app._teacher ??= { picked: new Set(), reports: [], assignmentId: null, last: null });
    const mine = () => (app.settings.teacherAssignments ??= []);

    function render() {
      clear(page);
      const on = !!app.settings.teacherMode;
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Teacher mode'),
        h('p', null, 'No server needed. You make a file, students open it, they send you a report file back.')),
        h('label', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('input', { type: 'checkbox', id: 'teacher-toggle', checked: on, onchange: (e) => { app.setSetting('teacherMode', e.target.checked); render(); } }), h('b', null, 'I am a teacher'))));
      if (!on) { page.append(emptyState('Teacher tools are off', 'Switch on “I am a teacher” to make assignments and read student reports. Students do not need this.', [])); return; }

      // ---- 1. make an assignment
      const title = h('input', { class: 'input', id: 'tch-title', placeholder: 'For example: Week 3, reach orbit', style: { width: '100%' }, maxlength: 80 });
      const due = h('input', { class: 'input', id: 'tch-due', type: 'date' });
      const notes = h('textarea', { class: 'input', id: 'tch-notes', rows: 2, placeholder: 'Notes for the students (optional)', style: { width: '100%' } });
      const who = h('input', { class: 'input', id: 'tch-teacher', placeholder: 'Your name (optional)', value: app.settings.teacherName ?? '' });
      const groups = [1, 2, 3, 4].map((d) => [d, ALL_CHALLENGES.filter((c) => c.difficulty === d)]).filter(([, l]) => l.length);
      const err = h('div', { class: 'callout warn', id: 'tch-error', hidden: true });
      const make = () => {
        try {
          app.settings.teacherName = who.value; const a = createAssignment({ title: title.value, challengeIds: [...S.picked], due: due.value || null, notes: notes.value, teacher: who.value });
          mine().push(a); S.assignmentId = a.id; app.saveSettings(); err.hidden = true;
          saveFile(app, `${a.title.replace(/[^\w.-]+/g, '_')}.astra-assignment.json`, exportAssignment(a), 'application/json'); render();
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      };
      page.append(panel('1. Make an assignment', h('div', { class: 'col' },
        h('label', { class: 'field' }, 'Title', title), h('div', { class: 'row' }, h('label', { class: 'field' }, 'Due date', due), h('label', { class: 'field' }, 'Your name', who)), h('label', { class: 'field' }, 'Notes', notes),
        h('b', null, 'Pick challenges'),
        groups.map(([d, l]) => h('div', null, h('div', { class: 'muted' }, DIFFICULTY_NAMES[d]), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, l.map((c) => h('label', { class: 'chip', style: { cursor: 'pointer' } }, h('input', { type: 'checkbox', 'data-pick': c.id, checked: S.picked.has(c.id), onchange: (e) => { e.target.checked ? S.picked.add(c.id) : S.picked.delete(c.id); } }), ` ${c.title}`))))),
        err, h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'tch-make', onclick: make }, 'Save assignment file'), h('span', { class: 'muted' }, 'Give the file to your students. They open Challenges → Import assignment.')))));

      // ---- 2. class table
      const asg = mine().find((a) => a.id === S.assignmentId) ?? null;
      const pick = h('select', { class: 'input', id: 'tch-asg', onchange: (e) => { S.assignmentId = e.target.value || null; render(); } }, h('option', { value: '' }, 'All challenges found in the reports'), mine().map((a) => h('option', { value: a.id, selected: a.id === S.assignmentId }, a.title)));
      const addReports = async () => {
        const files = await pickMany(); let added = 0;
        for (const f of files) { const r = parseReport(f.text); if (!r.ok) { toast(`${f.name}: ${r.error}`, 'bad', 6000); continue; } if (!r.intact) toast(`${f.name}: the file was changed after the student saved it.`, 'info', 7000); S.reports.push({ ...r.report, _intact: r.intact }); added++; }
        if (added) toast(`${added} report${added > 1 ? 's' : ''} added`, 'ok'); render();
      };
      page.append(panel('2. Class table', h('div', { class: 'col' },
        h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'tch-add', onclick: addReports }, 'Add student report files…'), pick,
          S.reports.length ? h('button', { class: 'btn small', id: 'tch-clear', onclick: () => { S.reports = []; render(); } }, 'Clear') : null),
        S.reports.length ? classView(S.reports, asg) : emptyState('No reports yet', 'Add the report files your students exported.', []),
        h('div', { class: 'callout info tch-note', id: 'tch-honest' }, h('b', null, 'How it works: '), 'everything stays in files on your computer. Each result has a hash of the measured flight numbers. ', INTEGRITY_NOTE))));

      // ---- 3. my assignment list
      if (mine().length) page.append(panel('Assignments I made', h('table', null, h('tbody', null, mine().map((a) => h('tr', { 'data-asg': a.id }, h('td', null, h('b', null, a.title)), h('td', { class: 'muted' }, `${a.challenges.length} challenge${a.challenges.length > 1 ? 's' : ''}${a.due ? ` · due ${a.due}` : ''}`),
        h('td', null, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => saveFile(app, `${a.title.replace(/[^\w.-]+/g, '_')}.astra-assignment.json`, exportAssignment(a), 'application/json') }, 'Save file again'),
          h('button', { class: 'btn small danger', onclick: () => { app.settings.teacherAssignments = mine().filter((x) => x.id !== a.id); if (S.assignmentId === a.id) S.assignmentId = null; app.saveSettings(); render(); } }, 'Remove')))))))));
    }

    function classView(reports, asg) {
      const t = classTable(reports, asg);
      const flagged = t.rows.reduce((s, r) => s + r.flagged, 0);
      const tbl = h('table', { id: 'tch-table' }, h('thead', null, h('tr', null, h('th', null, 'Student'), t.columns.map((c) => h('th', { title: c.title }, c.title)), h('th', null, 'Total'))),
        h('tbody', null, t.rows.map((r) => h('tr', { 'data-student': r.student }, h('td', null, h('b', null, r.student)),
          t.columns.map((c) => { const x = r.cells[c.id]; return h('td', { class: x.checked === 'bad' ? 'bad' : '', title: x.checked === 'ok' ? 'The proof matches the stars' : x.checked === 'bad' ? 'Stars without a matching proof' : '' }, x.stars ? stars(x.stars) : '–', x.attempts ? h('span', { class: 'muted' }, ` (${x.attempts})`) : null, x.checked === 'ok' ? ' (ok)' : x.checked === 'bad' ? ' (check)' : ''); }),
          h('td', { class: 'num' }, `${r.total}/${r.max}`)))));
      return h('div', { class: 'col tch-print-area' },
        h('div', { class: 'row' }, h('span', { class: 'grow muted' }, `${t.rows.length} student${t.rows.length === 1 ? '' : 's'} · class average ${t.classAverage.toFixed(1)} of ${t.max} stars${flagged ? ` · ${flagged} result${flagged > 1 ? 's' : ''} without a matching proof` : ''}`),
          h('button', { class: 'btn small', id: 'tch-csv', onclick: () => saveFile(app, 'class-table.csv', classCsv(t), 'text/csv') }, 'Save CSV'), h('button', { class: 'btn small', id: 'tch-print', onclick: () => window.print() }, 'Print')),
        h('div', { style: { overflow: 'auto' } }, tbl), h('div', { class: 'muted tch-note' }, 'x/3 = stars, (n) = tries, (ok) = proof matches, (check) = stars without a matching proof.'));
    }

    render();
    return () => { /* state lives on app._teacher */ };
  },
};

function pickMany() {
  if (globalThis.astra?.openFile) return globalThis.astra.openFile('.json').then((f) => (f ? [f] : []));
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: '.json', multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', async () => { const out = []; for (const f of inp.files) out.push({ name: f.name, text: await f.text() }); inp.remove(); resolve(out); });
    document.body.append(inp); inp.click();
  });
}
export { parseAssignment, challengeById };
