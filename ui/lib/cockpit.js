// Mission-control cockpit overlay (2.6): glass instruments over the 3D view. Two arc dials (speed, height), an artificial horizon
// (pitch), a big T+ clock, a few small readouts and a ribbon of flight events. Pure SVG/HTML, no assets; it replaces the plain HUD while it is on.
// makeCockpit() -> { el, update(frame, { events, total, label, fuelFrac }) }. `events` is [{t, label, bad?}], `total` the time the ribbon spans (s).
import { h, fmtTime } from './dom.js';
import { show, showAlt } from './units.js';

const NS = 'http://www.w3.org/2000/svg';
const A0 = -225, SWEEP = 270, R = 40;
const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
const arc = (f0, f1, r = R) => { const [x0, y0] = pt(A0 + SWEEP * f0, r), [x1, y1] = pt(A0 + SWEEP * f1, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(f1 - f0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const sv = (html, cls, vb = '0 0 100 100') => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', vb); if (cls) s.setAttribute('class', cls); s.innerHTML = html; return s; };

/** scale functions: 0..1 position of the needle */
export const speedFrac = (v) => Math.sqrt(Math.max(0, Math.min(1, Math.abs(v) / 8000)));
export const altFrac = (a) => Math.min(1, Math.log10(1 + Math.max(0, a) / 100) / Math.log10(1 + 4000));

let uid = 0;
function dial(label, ticks) {
  const id = `ck-g-${uid++}`;
  let t = '';
  for (let i = 0; i <= ticks; i++) { const f = i / ticks, big = i % 2 === 0; const [x0, y0] = pt(A0 + SWEEP * f, R + 3), [x1, y1] = pt(A0 + SWEEP * f, R - (big ? 6 : 3)); t += `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="${big ? 'big' : ''}"/>`; }
  const svg = sv(`<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2bd9a0"/><stop offset="1" stop-color="#7fd7ff"/></linearGradient></defs>
    <path class="ck-track" d="${arc(0, 1)}"/><path class="ck-fill" d="${arc(0, 0.001)}" stroke="url(#${id})"/><g class="ck-ticks">${t}</g>
    <line class="ck-needle" x1="50" y1="50" x2="${pt(A0, R - 8)[0].toFixed(2)}" y2="${pt(A0, R - 8)[1].toFixed(2)}"/><circle cx="50" cy="50" r="3.2" class="ck-hub"/>`, 'ck-dial');
  const val = h('b', null, '–'), cap = h('span', null, label);
  const el = h('div', { class: 'ck-dialbox' }, svg, h('div', { class: 'ck-dialread' }, val, cap));
  const fill = svg.querySelector('.ck-fill'), needle = svg.querySelector('.ck-needle');
  let cur = 0;
  return { el, set(frac, text) { cur += (frac - cur) * 0.35; const f = Math.max(0.001, Math.min(1, cur)); fill.setAttribute('d', arc(0, f)); const [x, y] = pt(A0 + SWEEP * f, R - 8); needle.setAttribute('x2', x.toFixed(2)); needle.setAttribute('y2', y.toFixed(2)); val.textContent = text; } };
}

function horizon() {
  let lad = '';
  for (let p = -90; p <= 180; p += 10) { const y = -p * 1.1, w = p % 30 === 0 ? 16 : 8; lad += `<line x1="${50 - w}" y1="${y.toFixed(1)}" x2="${50 + w}" y2="${y.toFixed(1)}"/>` + (p % 30 === 0 && p >= 0 && p <= 90 ? `<text x="${50 + w + 3}" y="${(y + 2.5).toFixed(1)}">${p}</text>` : ''); }
  const svg = sv(`<defs><clipPath id="ck-clip"><circle cx="50" cy="50" r="36"/></clipPath></defs>
    <g clip-path="url(#ck-clip)"><g class="ck-adi" transform="translate(0 50)"><rect x="-40" y="-600" width="180" height="600" class="sky"/><rect x="-40" y="0" width="180" height="600" class="ground"/><line x1="-40" y1="0" x2="140" y2="0" class="hz"/><g class="lad">${lad}</g></g></g>
    <circle cx="50" cy="50" r="36" class="ck-ring"/><path d="M30 50 H44 M56 50 H70 M50 46 V54" class="ck-ref"/><circle cx="50" cy="50" r="1.8" class="ck-hub"/>`, 'ck-adi-svg');
  const val = h('b', null, '–'), cap = h('span', null, 'Pitch');
  const g = svg.querySelector('.ck-adi');
  let cur = 90;
  return { el: h('div', { class: 'ck-dialbox ck-adibox' }, svg, h('div', { class: 'ck-dialread' }, val, cap)), set(p) { cur += (p - cur) * 0.4; g.setAttribute('transform', `translate(0 ${(50 + cur * 1.1).toFixed(2)})`); val.textContent = `${Math.round(p)}°`; } };
}

export function makeCockpit() {
  const spd = dial('Speed', 10), alt = dial('Height', 10), adi = horizon();
  const clock = h('div', { class: 'ck-clock' }, h('span', null, 'Mission time'), h('b', null, 'T+ 00:00'));
  const stat = {}, mini = h('div', { class: 'ck-mini' });
  for (const [k, l] of [['mach', 'Mach'], ['q', 'Q'], ['g', 'Push'], ['thr', 'Throttle']]) { const b = h('b', null, '–'); stat[k] = b; mini.append(h('div', null, h('span', null, l), b)); }
  const fuelBar = h('i'), fuel = h('div', { class: 'ck-fuel', title: 'Propellant left' }, h('span', null, 'Fuel'), h('div', { class: 'ck-fuelbar' }, fuelBar));
  const track = h('div', { class: 'ck-track-ev' }), now = h('i', { class: 'ck-now' }), last = h('div', { class: 'ck-lastev' }, '');
  const ribbon = h('div', { class: 'ck-ribbon' }, last, h('div', { class: 'ck-evline' }, track, now));
  const el = h('div', { class: 'cockpit', id: 'cockpit', 'aria-label': 'Flight instruments' },
    h('div', { class: 'ck-row' }, spd.el, h('div', { class: 'ck-mid' }, clock, mini, fuel), adi.el, alt.el), ribbon);
  let sig = '';
  const update = (f, o = {}) => {
    if (!f) return;
    clock.lastChild.textContent = fmtTime(f.t).replace(/^T([+−-])/, 'T$1 ').replace(/\.\d$/, '');
    spd.set(speedFrac(f.speed ?? 0), show(f.speed ?? 0, 'm/s', 0));
    alt.set(altFrac(f.alt ?? 0), showAlt(f.alt ?? 0));
    adi.set(f.pitch ?? 90);
    stat.mach.textContent = (f.mach ?? 0).toFixed(2); stat.q.textContent = show(f.q ?? 0, 'Pa', 0); stat.g.textContent = `${(f.gload ?? 0).toFixed(1)} g`; stat.thr.textContent = `${Math.round(100 * (f.throttle ?? 0))} %`;
    if (Number.isFinite(o.fuelFrac)) { const pc = Math.max(0, Math.min(1, o.fuelFrac)) * 100; fuelBar.style.width = `${pc}%`; fuelBar.className = pc < 8 ? 'bad' : pc < 20 ? 'warn' : ''; }
    const total = Math.max(o.total ?? 1, f.t, 1), evs = o.events ?? [];
    const s2 = `${evs.length}|${Math.round(total)}`;
    if (s2 !== sig) {
      sig = s2; track.replaceChildren(...evs.map((e) => h('u', { class: e.bad ? 'bad' : '', style: { left: `${Math.min(100, Math.max(0, (e.t / total) * 100))}%` }, title: `${fmtTime(e.t)}  ${e.label}` })));
    }
    now.style.left = `${Math.min(100, Math.max(0, (f.t / total) * 100))}%`;
    const past = evs.filter((e) => e.t <= f.t + 1e-6).pop(); last.textContent = past ? `${fmtTime(past.t)}  ${past.label}` : (o.label ?? '');
  };
  return { el, update };
}
