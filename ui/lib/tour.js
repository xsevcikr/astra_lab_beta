// First-run guided tour (Beginner mode only): five short tooltips that point at the sidebar items. Shown once (settings.tourDone).
// It never blocks the page: only the small card takes clicks, so the app stays usable and automated tests are not affected.
import { h } from './dom.js';

const STEPS = [
  { screen: 'academy', title: 'Academy', text: 'Start here. Short lessons.' },
  { screen: 'designer', title: 'Build a rocket', text: 'Pick parts. See it in 3D.' },
  { screen: 'simulation', title: 'Launch it', text: 'Press the big button.' },
  { screen: 'challenges', title: 'Challenges', text: 'Small missions. Win stars.' },
  { screen: 'analysis', title: 'What happened?', text: 'See why it worked.' },
];
let active = null;

/** Start the tour. `force` ignores "already seen" (used by the Settings button). Returns true when it started. */
export function startTour(app, { force = false } = {}) {
  if (active) return false;
  if (!force && app.settings.mode !== 'beginner') return false;
  if (!force && app.settings.tourDone) return false;
  if (!force && typeof navigator !== 'undefined' && navigator.webdriver && !/[?&]tour=1/.test(location.search)) return false;   // automated browsers: only when asked
  let i = 0;
  const spot = h('div', { class: 'tour-spot', id: 'tour-spot' });
  const card = h('div', { class: 'tour-card', id: 'tour-card', role: 'dialog', 'aria-label': 'Quick tour' });
  document.body.append(spot, card);
  const finish = (done) => {
    off.forEach((f) => f()); window.removeEventListener('resize', place);
    spot.remove(); card.remove(); active = null;
    if (done) app.setSetting('tourDone', true);
  };
  const off = [app.on('settings', (k) => { if (k === 'mode' && app.settings.mode !== 'beginner' && !force) finish(false); }), app.on('navigate', () => setTimeout(place, 80))];
  function place() {
    if (!active) return;
    const st = STEPS[i], t = document.querySelector(`.nav-item[data-screen="${st.screen}"]`);
    const r = t?.getBoundingClientRect();
    if (r && r.width) {
      Object.assign(spot.style, { left: `${r.left - 4}px`, top: `${r.top - 3}px`, width: `${r.width + 8}px`, height: `${r.height + 6}px`, display: 'block' });
      card.style.left = `${Math.min(window.innerWidth - 316, r.right + 16)}px`; card.style.top = `${Math.max(8, Math.min(window.innerHeight - card.offsetHeight - 8, r.top - 10))}px`;
    } else { spot.style.display = 'none'; card.style.left = '240px'; card.style.top = '80px'; }
  }
  function render() {
    const st = STEPS[i], last = i === STEPS.length - 1;
    card.replaceChildren(h('h3', null, st.title), h('p', null, st.text),
      h('div', { class: 'row' }, h('span', { class: 'tour-count' }, `${i + 1} of ${STEPS.length}`), h('span', { class: 'row' },
        last ? null : h('button', { class: 'btn small', id: 'tour-skip', onclick: () => finish(true) }, 'Skip'),
        h('button', { class: 'btn small primary', id: 'tour-next', onclick: () => { if (last) finish(true); else { i += 1; render(); } } }, last ? 'Got it' : 'Next'))));
    place();
  }
  active = { finish };
  window.addEventListener('resize', place);
  render();
  return true;
}
export const tourActive = () => !!active;
