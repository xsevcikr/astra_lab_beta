// Line-icon system for ASTRA LAB: one consistent style (24x24 grid, stroke follows the text colour, 1.75 width).
// icon('rocket', { size: 20 }) returns an inline <svg> element. Unknown names give a plain dot.
const P = {
  // navigation (also used by the sidebar)
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  academy: '<path d="M3 9l9-4 9 4-9 4-9-4z"/><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5"/>',
  ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  designer: '<path d="M12 2.5c3 2.4 4.5 5.6 4.5 9.2L12 16.5l-4.5-4.8C7.5 8.1 9 4.9 12 2.5z"/><circle cx="12" cy="9" r="1.6"/><path d="M7.5 14l-3 3.5 3.5-.5M16.5 14l3 3.5-3.5-.5"/>',
  simulation: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  challenges: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  analysis: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  planner: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  control: '<circle cx="12" cy="12" r="3"/><path d="M5.5 18.5a9 9 0 0 1 0-13M18.5 5.5a9 9 0 0 1 0 13"/>',
  telemetry: '<path d="M3 12h3l2.5-6 4 12 3-9 1.5 3H21"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l2.5 1.5"/>',
  experiments: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 19l-5.5-9.5v-6"/><path d="M7.5 15h9"/>',
  requirements: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  failure: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.1"/>',
  trade: '<path d="M12 4v16M6 20h12M5 8h14"/><path d="M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
  projects: '<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  teacher: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  testbench: '<path d="M9 3.5h6M10 3.5v6L4.8 18.2A1.5 1.5 0 0 0 6.1 20.5h11.8a1.5 1.5 0 0 0 1.3-2.3L14 9.5v-6"/><path d="M8.5 14.5h7"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>',
  validation: '<path d="M12 3l7.5 3v5.5c0 4.5-3 7.8-7.5 9.5-4.5-1.7-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  // vehicles
  rocket: '<path d="M12 2.5c3 2.4 4.5 5.6 4.5 9.2L12 16.5l-4.5-4.8C7.5 8.1 9 4.9 12 2.5z"/><circle cx="12" cy="9" r="1.6"/><path d="M7.5 14l-3 3.5 3.5-.5M16.5 14l3 3.5-3.5-.5"/><path d="M10 19.5c.6 1 1.2 1.6 2 2.2.8-.6 1.4-1.2 2-2.2"/>',
  probe: '<rect x="9" y="8" width="6" height="8" rx="1.5"/><path d="M12 8V4.5M10.5 4.5h3"/><path d="M9 11H3.5M15 11h5.5M3.5 9v4M20.5 9v4"/><path d="M10.5 16l-1.5 4M13.5 16l1.5 4"/>',
  satellite: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 12H6M14.5 12H18M3 9.5h3v5H3zM18 9.5h3v5h-3z"/><path d="M12 9.5V6.5M12 14.5v3"/>',
  lander: '<path d="M8 6h8l2 6H6z"/><path d="M7 12l-3 8M17 12l3 8M2.5 20h3M18.5 20h3"/><path d="M10 12v3h4v-3"/>',
  rover: '<path d="M6 11h12l2 4H4z"/><path d="M9 11V7h6v4M12 7V4"/><circle cx="7" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  // places
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  mars: '<circle cx="12" cy="12" r="8.5"/><path d="M6.5 10c2-1 3.5 0 5.5-.5s3-1.5 5.5-.5M7 15c2 .8 4-.3 6 .2s3 .3 4-.5"/>',
  earth: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-3 3-3 14 0 17M12 3.5c3 3 3 14 0 17"/>',
  // parts
  engine: '<path d="M8 3.5h8v5H8z"/><path d="M8 8.5L5.5 17h13L16 8.5"/><path d="M9 20.5c1-.8 2-.8 3 0s2 .8 3 0"/>',
  tank: '<rect x="7" y="3.5" width="10" height="17" rx="4"/><path d="M7 9h10M7 15h10"/>',
  fin: '<path d="M7 4v16h2c4 0 7-3 9-8-3 1-5 .5-7-2.5V4z"/>',
  wings: '<path d="M12 4v16M12 9L3 13v2l9-2.5M12 9l9 4v2l-9-2.5"/>',
  parachute: '<path d="M3.5 11a8.5 8.5 0 0 1 17 0c-1.2-1.4-2.6-1.4-4.2 0-1.5-1.4-2.9-1.4-4.3 0-1.4-1.4-2.8-1.4-4.3 0-1.6-1.4-3-1.4-4.2 0z"/><path d="M4 11.5l8 8M20 11.500l-8 8M12 11v8.5"/><rect x="10.5" y="19.5" width="3" height="2" rx=".5"/>',
  antenna: '<path d="M12 12v8.500M8.5 20.500h7"/><path d="M8.5 8.500a5 5 0 0 1 7 0M6 6a8.5 8.5 0 0 1 12 0"/><circle cx="12" cy="11" r="1.2"/>',
  solar: '<path d="M4 8h16l-2 9H6z"/><path d="M9.3 8L8.5 17M14.7 8l.8 9M5 12.500h14"/><path d="M12 17v3.500M9 20.500h6"/>',
  battery: '<rect x="3.5" y="7.5" width="15" height="9" rx="2"/><path d="M21 10.500v3M7 10.500v3M10.5 10.500v3"/>',
  // learning and tools
  book: '<path d="M4 5.500A1.5 1.5 0 0 1 5.5 4H12v15H5.500A1.5 1.5 0 0 0 4 20.500z"/><path d="M20 5.500A1.5 1.5 0 0 0 18.5 4H12v15h6.500a1.5 1.5 0 0 1 1.5 1.500z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.500A3 3 0 0 0 8 10.500M16 6h3v1.500a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  play: '<path d="M7 4.500v15l12-7.500z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="M5 12.500l4.5 4.500L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.500M12 17.500v.100"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.500v.100"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.500a2.5 2.5 0 1 1 3.5 2.300c-.7.4-1 .9-1 1.700M12 17v.100"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.500h9a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15 7l4.5 4.500L15 16"/><path d="M19 11.500h-9a5 5 0 0 0 0 10h2"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.500L21 21"/>',
  sparkle: '<path d="M12 3l1.8 4.700L18.5 9.500l-4.7 1.800L12 16l-1.8-4.700L5.5 9.500l4.7-1.800z"/><path d="M18.5 15l.800 2 2 .800-2 .800-.800 2-.800-2-2-.800 2-.800z"/>',
  gauge: '<path d="M4 17a8.5 8.5 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5.700 2.5 1.5 2.500C10 9 10.5 5.5 12 3z"/>',
  fuel: '<path d="M12 3.500c3.5 4 5.5 6.8 5.5 9.500a5.5 5.5 0 0 1-11 0c0-2.7 2-5.5 5.5-9.500z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.500V12l3 2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M6 21V4M6 4.500h11l-2 4 2 4H6"/>',
  tools: '<path d="M14.5 6.500a4 4 0 0 0 4.8 4.800L12 18.600a2.1 2.1 0 0 1-3-3z"/><path d="M5 8l3-3 3 3-3 3z"/>',
  layers: '<path d="M12 3.500l9 5-9 5-9-5z"/><path d="M3 12.500l9 5 9-5M3 16.500l9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  star: '<path d="M12 3.500l2.6 5.3 5.8.800-4.2 4.1 1 5.800L12 16.800l-5.2 2.7 1-5.800L3.6 9.600l5.8-.800z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.5"/>',
  sound: '<path d="M4 9.500h3.500L12 5.500v13L7.5 14.500H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.500 4.500 4.500 0 0 1 17.500 18z"/>',
  orbit: '<circle cx="12" cy="12" r="2.500"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)"/>',
  split: '<path d="M12 3v7M12 10l-5 5v6M12 10l5 5v6"/>',
  nose: '<path d="M12 3c3 3 4.500 7 4.500 12h-9C7.500 10 9 6 12 3z"/><path d="M7.500 19h9"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.500-5.800"/><path d="M20 4v4.500h-4.500"/>',
  box: '<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.500 8.500l-2 5-5 2 2-5z"/>',
  landing: '<path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 20h14"/>',
  mute: '<path d="M4 9.500h3.500L12 5.500v13L7.500 14.500H4z"/><path d="M16 9.500l5 5M21 9.500l-5 5"/>',
  ruler: '<rect x="2.500" y="8" width="19" height="8" rx="1.500"/><path d="M6.500 8v3M10.500 8v4M14.500 8v3M18.500 8v4"/>',
  globe: '<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c-3 3-3 14 0 17M12 3.500c3 3 3 14 0 17"/>',
  sliders: '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  print: '<path d="M7 9V4h10v5M7 17H4.500V9h15v8H17"/><path d="M7 14h10v6H7z"/>',
  keyboard: '<rect x="2.500" y="6" width="19" height="12" rx="2"/><path d="M6 10h.1M10 10h.1M14 10h.1M18 10h.1M7 14h10"/>',
  edit: '<path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z"/>',
  car: '<path d="M6 11h12l2 4H4z"/><circle cx="8" cy="17.500" r="2"/><circle cx="16" cy="17.500" r="2"/>',
  history2: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.600L7 7M17 17l1.4 1.400M5.6 18.400L7 17M17 7l1.4-1.4"/>',
};
// Aliases so callers can use friendly names.
const ALIAS = { sparkle: 'sparkle', wings: 'wings', 'ai-sparkle': 'sparkle', stats: 'chart', good: 'check', bad: 'cross', cube: 'layers', capsule: 'satellite', sounding: 'rocket', launcher: 'rocket', spacecraft: 'satellite', ok: 'check' };
/** Row of 'max' stars, the first n filled (SVG, no text glyphs). */
export function starsEl(n, max = 3, size = 16) {
  const el = document.createElement('span'); el.className = 'stars-row'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${n} of ${max} stars`);
  for (let i = 0; i < max; i++) { const s = icon('star', { size, cls: i < n ? 'fill' : 'dim' }); el.append(s); }
  return el;
}
export const ICON_NAMES = Object.keys(P);
export const NAV_ICON_PATHS = P;
export function hasIcon(name) { return !!P[ALIAS[name] ?? name]; }
/** Markup string, for innerHTML use. */
export function iconSvg(name, { size = 20, cls = '' } = {}) {
  const d = P[ALIAS[name] ?? name] ?? '<circle cx="12" cy="12" r="2"/>';
  return `<svg class="ico-svg ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
/** DOM element (a span wrapping the svg, so it works with h() children). */
export function icon(name, opts = {}) {
  const el = document.createElement('span');
  el.className = 'ico-wrap'; el.style.display = 'inline-flex'; el.style.verticalAlign = 'middle';
  el.innerHTML = iconSvg(name, opts);
  return el;
}
export default icon;
