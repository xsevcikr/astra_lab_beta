// "My progress": what the student has done (lessons, challenges, flights). A short summary that can be printed or saved as a web page.
import { h, modal } from './dom.js';
import { icon, starsEl } from './icons.js';
import { saveFile } from './widgets.js';
import { allLessons } from '../../data/academy/index.js';
import { CHALLENGES, totalStars, maxStars } from '../../src/core/challenges.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = (n) => `${n}/3`;

/** Plain data for the report (no DOM). Everything comes from saved lessons, challenge stars and recorded runs. */
export function progressData(app) {
  const done = app.settings.academy?.done ?? {};
  let lessons = []; try { lessons = allLessons(); } catch { /* none */ }
  const finished = lessons.filter((l) => done[l.id]);
  const saved = app.settings.challenges ?? {};
  const runs = app.project.runs ?? [];
  return {
    project: app.project.name, date: new Date().toLocaleDateString(),
    lessons: { done: finished.length, total: lessons.length, titles: finished.map((l) => l.title) },
    stars: { got: totalStars(saved), max: maxStars },
    challenges: CHALLENGES.map((c) => ({ title: c.title, stars: saved[c.id]?.stars ?? 0 })),
    flights: { total: runs.length, ok: runs.filter((r) => r.status === 'SUCCESS').length, failed: runs.filter((r) => r.status === 'FAILURE').length },
  };
}
export function progressHtml(d) {
  return `<!doctype html><meta charset="utf-8"><title>My ASTRA LAB progress</title><style>body{font:16px system-ui,sans-serif;max-width:640px;margin:30px auto;color:#111}h1{font-size:26px}h2{font-size:18px;margin-top:22px}li{margin:3px 0}.s{color:#d99a00;letter-spacing:2px}</style>
<h1>My ASTRA LAB progress</h1><p>Project: <b>${esc(d.project)}</b> · ${esc(d.date)}</p>
<h2>Lessons</h2><p>${d.lessons.done} of ${d.lessons.total} finished.</p><ul>${d.lessons.titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<h2>Challenges: ${d.stars.got} of ${d.stars.max} stars</h2><ul>${d.challenges.map((c) => `<li><span class="s">${stars(c.stars)}</span> ${esc(c.title)}</li>`).join('')}</ul>
<h2>Flights</h2><p>${d.flights.total} flights: ${d.flights.ok} worked, ${d.flights.failed} failed. Engineers learn from both.</p>`;
}
export function openProgress(app) {
  const d = progressData(app);
  const body = h('div', { class: 'sh-print-root col' },
    h('div', { class: 'sh-prog-grid' },
      h('div', { class: 'sh-prog-tile' }, h('b', null, `${d.lessons.done} / ${d.lessons.total}`), h('span', null, 'lessons finished')),
      h('div', { class: 'sh-prog-tile' }, h('b', null, icon('star', { size: 18 }), ` ${d.stars.got} / ${d.stars.max}`), h('span', null, 'challenge stars')),
      h('div', { class: 'sh-prog-tile' }, h('b', null, `${d.flights.ok} / ${d.flights.total}`), h('span', null, 'flights that worked'))),
    h('div', { class: 'sh-prog-list' }, d.challenges.map((c) => h('div', { class: 'sh-prog-row' }, h('span', { class: 'ch-stars' }, starsEl(c.stars)), h('span', null, c.title)))));
  modal({ title: 'My progress', body, wide: true, buttons: [
    { label: 'Print', onClick: () => { document.body.classList.add('sh-printing'); setTimeout(() => { window.print(); document.body.classList.remove('sh-printing'); }, 50); return false; } },
    { label: 'Save as web page', onClick: () => { saveFile(app, 'my-progress.html', progressHtml(d), 'text/html'); return false; } },
    { label: 'Close', primary: true }] });
}
