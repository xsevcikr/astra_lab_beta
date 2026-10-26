// "Explore Beyond" decoration for every screen except Home (2.3): a slowly floating astronaut and a few drifting rocks behind the panels,
// like the first page's. Visual only: no events, no layout, hidden for reduced motion's movement (it stays still), off with localStorage astra.sky = '0'.
const ASTRONAUT = `<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="">
<defs>
 <linearGradient id="ast-suit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfdff"/><stop offset="1" stop-color="#b9c6dc"/></linearGradient>
 <radialGradient id="ast-visor" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#7fb7ff"/><stop offset=".45" stop-color="#26437c"/><stop offset="1" stop-color="#0b1633"/></radialGradient>
 <linearGradient id="ast-pack" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8794ab"/><stop offset="1" stop-color="#c9d3e4"/></linearGradient>
</defs>
<g stroke="#5d6b86" stroke-width="2" stroke-linejoin="round">
 <rect x="52" y="84" width="96" height="104" rx="30" fill="url(#ast-pack)"/>
 <path d="M66 100 q-34 8 -40 38 q-3 16 12 18 q12 1 14 -12 q3 -14 20 -22z" fill="url(#ast-suit)"/>
 <path d="M134 100 q34 8 40 38 q3 16 -12 18 q-12 1 -14 -12 q-3 -14 -20 -22z" fill="url(#ast-suit)"/>
 <rect x="62" y="96" width="76" height="92" rx="26" fill="url(#ast-suit)"/>
 <rect x="80" y="126" width="40" height="26" rx="6" fill="#dfe6f2"/><circle cx="90" cy="139" r="4" fill="#e0554a"/><circle cx="104" cy="139" r="4" fill="#4a90e0"/><rect x="112" y="135" width="6" height="8" rx="1" fill="#6b7a95"/>
 <path d="M72 184 q-6 36 -2 56 q2 12 16 12 q14 0 12 -12 q-2 -30 4 -56z" fill="url(#ast-suit)"/>
 <path d="M104 184 q6 26 4 56 q-2 12 12 12 q14 0 16 -12 q4 -20 -2 -56z" fill="url(#ast-suit)"/>
 <rect x="68" y="242" width="40" height="14" rx="6" fill="#6b7a95"/><rect x="108" y="242" width="40" height="14" rx="6" fill="#6b7a95"/>
 <circle cx="100" cy="64" r="46" fill="url(#ast-suit)"/>
 <ellipse cx="102" cy="64" rx="33" ry="29" fill="url(#ast-visor)" stroke="#2c3a5c"/>
 <ellipse cx="90" cy="52" rx="11" ry="6" fill="#fff" opacity=".35" stroke="none" transform="rotate(-25 90 52)"/>
</g>
<path d="M74 122 q-30 40 -46 22" stroke="#9fb4d6" stroke-width="3" fill="none" stroke-dasharray="3 5" opacity=".7"/>
</svg>`;

export function installDecor(app, root = document.body) {
  let off = false; try { off = localStorage.getItem('astra.sky') === '0'; } catch { /* storage blocked */ }
  if (off || typeof document === 'undefined') return () => {};
  const layer = document.createElement('div'); layer.id = 'decor'; layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<div class="decor-astro">${ASTRONAUT}</div>` + ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((c) => `<span class="rock ${c}"></span>`).join('');
  root.prepend(layer);
  const sync = (id) => { document.body.dataset.screen = id; };
  sync(app.screenId ?? 'home');
  const off2 = app.on?.('navigate', (e) => sync(e?.id ?? app.screenId));
  return () => { layer.remove(); off2?.(); };
}
