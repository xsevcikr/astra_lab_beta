// Small inline SVG diagrams used by the Aerospace Academy (theme-aware via CSS variables).
const C = { line: '#8da399', text: '#e3efe9', blue: '#2bd9a0', green: '#84e060', red: '#ff5c6a', amber: '#ffb84a', violet: '#c07cff', body: '#cfe0d8', dark: '#0f2f27' };
const svg = (inner, vb = '0 0 420 210') => `<svg viewBox="${vb}" role="img" xmlns="http://www.w3.org/2000/svg" class="diagram-svg"><defs>
<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>${inner}</svg>`;
const T = (x, y, s, col = C.text, anchor = 'middle', size = 12) => `<text x="${x}" y="${y}" fill="${col}" font-size="${size}" text-anchor="${anchor}" font-family="Segoe UI, Arial, sans-serif">${s}</text>`;
const arrow = (x1, y1, x2, y2, col) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="3" marker-end="url(#ah)"/>`;
const rocket = (cx, top, w, h, opt = {}) => `<path d="M${cx} ${top} q${w / 2} ${h * 0.2} ${w / 2} ${h * 0.35} v${h * 0.55} h${-w} v${-h * 0.55} q0 ${-h * 0.15} ${w / 2} ${-h * 0.35}z" fill="${opt.fill ?? C.body}" stroke="${C.line}"/>
<path d="M${cx - w / 2} ${top + h * 0.85} l${-w * 0.35} ${h * 0.15} v${-h * 0.02}z M${cx + w / 2} ${top + h * 0.85} l${w * 0.35} ${h * 0.15} v${-h * 0.02}z" fill="${C.line}"/>${opt.flame ? `<path d="M${cx - w * 0.25} ${top + h} l${w * 0.25} ${h * 0.35} l${w * 0.25} ${-h * 0.35}z" fill="${C.amber}"/>` : ''}`;

export const DIAGRAMS = {
  'forces-flight': () => svg(`${rocket(210, 30, 40, 120, { flame: true })}${arrow(210, 200, 210, 160, C.green)}${T(250, 190, 'Thrust (engine pushes up)', C.green, 'start')}
${arrow(210, 95, 210, 140, C.red).replace('y2="140"', 'y2="150"')}${T(80, 130, 'Weight (gravity pulls down)', C.red)}${arrow(295, 60, 295, 100, C.amber)}${T(340, 118, 'Drag (air resists)', C.amber)}${T(210, 16, 'A rocket in the air feels three main forces')}`),
  newton3: () => svg(`${rocket(210, 20, 44, 110)}<path d="M195 140 l15 45 l15 -45z" fill="${C.amber}"/>${arrow(210, 130, 210, 190, C.amber)}${arrow(150, 100, 150, 40, C.green)}
${T(300, 175, 'Rocket throws gas DOWN (action)', C.amber, 'start')}${T(75, 74, 'Gas pushes the rocket UP', C.green)}${T(75, 90, '(reaction)', C.green)}`),
  'rocket-anatomy': () => svg(`${rocket(150, 14, 60, 170)}<line x1="182" y1="35" x2="270" y2="35" stroke="${C.line}"/>${T(275, 39, 'Nose cone / payload fairing', C.text, 'start')}
<line x1="182" y1="80" x2="270" y2="80" stroke="${C.line}"/>${T(275, 84, 'Payload (satellite or probe)', C.text, 'start')}<line x1="182" y1="110" x2="270" y2="110" stroke="${C.line}"/>${T(275, 114, 'Propellant tanks (fuel + oxidizer)', C.text, 'start')}
<line x1="182" y1="140" x2="270" y2="140" stroke="${C.line}"/>${T(275, 144, 'Avionics (the “brain”)', C.text, 'start')}<line x1="182" y1="178" x2="270" y2="178" stroke="${C.line}"/>${T(275, 182, 'Engine and fins', C.text, 'start')}`),
  staging: () => svg(`${rocket(70, 30, 34, 100, { flame: true })}${T(70, 190, '1. Both stages burn', C.text)}${rocket(200, 20, 30, 60)}${rocket(200, 100, 34, 60, { flame: true })}${T(200, 190, '2. Empty stage drops away', C.text)}
${rocket(330, 40, 30, 60, { flame: true })}${T(330, 190, '3. Lighter rocket keeps going', C.text)}${T(210, 14, 'Staging: throw away weight you no longer need')}`),
  atmosphere: () => svg(`<rect x="40" y="150" width="340" height="40" fill="#15463f"/><rect x="40" y="120" width="340" height="30" fill="#1c4a3d"/><rect x="40" y="85" width="340" height="35" fill="#14332f"/><rect x="40" y="45" width="340" height="40" fill="#0d2420"/><rect x="40" y="15" width="340" height="30" fill="#070e0c"/>
${T(210, 175, 'Troposphere · 0–12 km · weather and most air')}${T(210, 139, 'Stratosphere · 12–50 km')}${T(210, 106, 'Mesosphere · 50–85 km')}${T(210, 69, 'Thermosphere · 85 km and up')}${T(210, 34, 'Space (Kármán line ≈ 100 km)', C.amber)}`),
  'gravity-turn': () => svg(`<path d="M60 190 C 60 120, 90 60, 200 40 S 360 30, 390 32" fill="none" stroke="${C.green}" stroke-width="3"/><rect x="20" y="190" width="380" height="12" fill="#1c4a3d"/>${T(70, 180, 'Liftoff: straight up', C.text, 'start')}${T(120, 90, 'Tilts gradually', C.text, 'start')}${T(300, 60, 'Nearly sideways: builds orbital speed', C.text, 'middle')}${T(210, 16, 'Gravity turn: go up first, then bend toward sideways')}`),
  orbit: () => svg(`<circle cx="210" cy="105" r="34" fill="#1c4a3d" stroke="${C.blue}"/><ellipse cx="240" cy="105" rx="150" ry="75" fill="none" stroke="${C.green}" stroke-width="2"/><circle cx="390" cy="105" r="6" fill="${C.amber}"/><circle cx="90" cy="105" r="6" fill="${C.violet}"/>
${T(390, 130, 'Apoapsis (highest)', C.amber, 'end')}${T(90, 130, 'Periapsis (lowest)', C.violet, 'start')}${T(210, 110, 'Planet')}${T(210, 18, 'An orbit is an ellipse; the planet sits at one focus')}`),
  hohmann: () => svg(`<circle cx="210" cy="105" r="14" fill="#1c4a3d" stroke="${C.blue}"/><circle cx="210" cy="105" r="45" fill="none" stroke="${C.line}"/><circle cx="210" cy="105" r="90" fill="none" stroke="${C.line}"/><ellipse cx="232" cy="105" rx="112" ry="67" fill="none" stroke="${C.green}" stroke-width="2" stroke-dasharray="5 4"/>
<circle cx="255" cy="105" r="5" fill="${C.amber}"/><circle cx="120" cy="105" r="5" fill="${C.amber}"/>${T(275, 100, 'Burn 1', C.amber, 'start')}${T(112, 92, 'Burn 2', C.amber, 'end')}${T(210, 18, 'Hohmann transfer: two engine burns to move to a bigger orbit')}`),
  stability: () => svg(`${rocket(210, 20, 44, 150)}<circle cx="210" cy="85" r="7" fill="${C.green}"/><circle cx="210" cy="125" r="7" fill="${C.red}"/>${T(255, 89, 'CG — centre of gravity (balance point)', C.green, 'start')}${T(255, 129, 'CP — centre of pressure (where air pushes)', C.red, 'start')}${T(210, 200, 'Stable rocket: CP sits below (behind) CG', C.text)}`),
  'gnc-loop': () => svg(`<rect x="20" y="80" width="90" height="46" rx="8" fill="${C.dark}" stroke="${C.blue}"/><rect x="165" y="80" width="90" height="46" rx="8" fill="${C.dark}" stroke="${C.green}"/><rect x="310" y="80" width="90" height="46" rx="8" fill="${C.dark}" stroke="${C.amber}"/>
${T(65, 107, 'Sensors')}${T(210, 107, 'Computer')}${T(355, 107, 'Actuators')}${arrow(110, 103, 165, 103, C.line)}${arrow(255, 103, 310, 103, C.line)}<path d="M355 126 V170 H65 V128" fill="none" stroke="${C.line}" stroke-width="2" marker-end="url(#ah)"/>
${T(210, 190, 'The vehicle moves → sensors measure it → repeat many times per second')}${T(65, 70, 'measure', C.line)}${T(210, 70, 'decide', C.line)}${T(355, 70, 'act (steer)', C.line)}`),
  'rocket-eq': () => svg(`<rect x="70" y="30" width="80" height="140" fill="${C.body}" stroke="${C.line}"/><rect x="70" y="30" width="80" height="100" fill="${C.amber}" opacity=".8"/><rect x="270" y="130" width="80" height="40" fill="${C.body}" stroke="${C.line}"/>
${T(110, 190, 'Start: fuel + dry mass (m₀)')}${T(310, 190, 'End: dry mass only (m₁)')}${T(110, 85, 'FUEL', '#222')}${arrow(160, 100, 260, 100, C.green)}${T(210, 90, 'burn', C.green)}${T(210, 16, 'Δv = Isp × g₀ × ln(m₀ / m₁)')}`),
  'thrust-drag': () => svg(`${rocket(120, 25, 40, 120, { flame: true })}${arrow(120, 190, 120, 150, C.green)}${arrow(120, 60, 120, 112, C.red).replace(/y2="112"/, 'y2="120"')}${T(140, 195, 'Thrust', C.green, 'start')}${T(150, 130, 'Weight', C.red, 'start')}
${T(300, 70, 'Thrust ÷ weight (TWR)', C.text)}${T(300, 100, 'TWR < 1: stays on the pad', C.red)}${T(300, 125, 'TWR = 1: hovers', C.amber)}${T(300, 150, 'TWR > 1: lifts off', C.green)}`),
};

// ---- more pictures for the plain-words lessons (analogies first, numbers second)
const box = (x, y, w, h, label, col = C.blue, txt = C.text) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${C.dark}" stroke="${col}" stroke-width="2"/>${T(x + w / 2, y + h / 2 + 4, label, txt, 'middle', 12)}`;
Object.assign(DIAGRAMS, {
  'weight-mass': () => svg(`${T(210, 18, 'Same stuff, same mass. Different weight.', C.text, 'middle', 13)}
<circle cx="105" cy="105" r="34" fill="#1c4a3d" stroke="${C.blue}"/>${T(105, 109, 'Earth', C.text)}<rect x="88" y="52" width="34" height="26" rx="4" fill="${C.amber}"/>${T(105, 70, '60 kg', '#222')}${arrow(105, 80, 105, 66, C.red).replace('marker-end="url(#ah)"', '')}
${T(105, 170, 'Weight: 590 N', C.red)}${T(105, 188, '(gravity pulls hard)', C.line, 'middle', 11)}
<circle cx="315" cy="105" r="18" fill="#33463f" stroke="${C.line}"/>${T(315, 109, 'Moon', C.text, 'middle', 10)}<rect x="298" y="68" width="34" height="26" rx="4" fill="${C.amber}"/>${T(315, 86, '60 kg', '#222')}
${T(315, 170, 'Weight: 98 N', C.green)}${T(315, 188, '(gravity pulls gently)', C.line, 'middle', 11)}`),
  nozzle: () => svg(`<path d="M20 70 L130 85 L170 85 L400 30 L400 180 L170 125 L130 125 L20 140 Z" fill="${C.dark}" stroke="${C.blue}" stroke-width="2"/>
<path d="M150 85 v40" stroke="${C.amber}" stroke-dasharray="4 3"/>${T(60, 112, 'Hot, slow gas', C.red)}${T(150, 72, 'Throat (Mach 1)', C.amber)}${T(315, 112, 'Fast gas, cooler', C.green)}${arrow(180, 105, 270, 105, C.green)}
${T(210, 16, 'The bell turns heat into speed', C.text, 'middle', 13)}${T(210, 200, 'Faster gas out = more push on the rocket', C.line, 'middle', 11)}`),
  'drag-maxq': () => svg(`<line x1="40" y1="170" x2="390" y2="170" stroke="${C.line}"/><line x1="40" y1="170" x2="40" y2="30" stroke="${C.line}"/>
<path d="M40 170 C 100 165, 130 60, 190 50 S 280 140, 385 168" fill="none" stroke="${C.amber}" stroke-width="3"/><circle cx="190" cy="50" r="6" fill="${C.red}"/>
${T(190, 38, 'Max-Q: the air pushes hardest', C.red)}${T(80, 190, 'Liftoff', C.text)}${T(330, 190, 'Thin air, high up', C.text)}${T(20, 100, 'Push', C.text, 'middle', 11)}
${T(120, 120, 'Faster, but air still thick', C.line, 'start', 11)}${T(260, 90, 'Faster, but air thin', C.line, 'start', 11)}`),
  'reaction-wheel': () => svg(`<rect x="130" y="55" width="160" height="100" rx="10" fill="${C.dark}" stroke="${C.blue}" stroke-width="2"/><circle cx="210" cy="105" r="28" fill="none" stroke="${C.green}" stroke-width="4"/>
<path d="M210 77 a28 28 0 0 1 24 14" fill="none" stroke="${C.green}" stroke-width="4" marker-end="url(#ah)"/>${T(210, 109, 'wheel', C.text)}
<path d="M110 105 a100 70 0 0 0 0.1 0" fill="none"/><path d="M95 70 a50 50 0 0 0 0 70" fill="none" stroke="${C.amber}" stroke-width="3" marker-end="url(#ah)"/>
${T(60, 108, 'Satellite', C.amber)}${T(60, 124, 'turns this way', C.amber)}${T(210, 30, 'Wheel spins one way, satellite turns the other', C.text, 'middle', 13)}${T(210, 185, 'No fuel needed. Only electricity.', C.line, 'middle', 11)}`),
  feedback: () => svg(`${box(20, 80, 80, 46, 'Target')}${box(140, 80, 90, 46, 'Controller', C.green)}${box(270, 80, 90, 46, 'Rocket', C.amber)}
${arrow(100, 103, 140, 103, C.line)}${arrow(230, 103, 270, 103, C.line)}<path d="M315 126 V165 H60 V128" fill="none" stroke="${C.violet}" stroke-width="3" marker-end="url(#ah)"/>
${T(60, 70, 'minus', C.line, 'middle', 11)}${T(185, 70, 'push', C.line, 'middle', 11)}${T(210, 185, 'Measure → compare with target → push to shrink the error', C.violet, 'middle', 12)}${T(210, 18, 'Like adjusting a shower', C.text, 'middle', 13)}`),
  'dv-budget': () => svg(`${[['To orbit', 9.4, C.blue], ['To the Moon', 3.1, C.green], ['Brake', 0.9, C.amber], ['Land', 1.9, C.red]].map(([n, v, c], i, a) => { const x = 30 + a.slice(0, i).reduce((s, q) => s + q[1] * 27, 0); return `<rect x="${x}" y="90" width="${v * 27}" height="40" fill="${c}" opacity=".85"/>${T(x + (v * 27) / 2, 80, n, C.text, 'middle', 11)}${T(x + (v * 27) / 2, 115, v + '', '#111', 'middle', 12)}`; }).join('')}
${T(210, 18, 'Delta-v budget: add up every step (km/s)', C.text, 'middle', 13)}${T(210, 165, 'Total about 15.3 km/s, plus 5 to 15% margin', C.line, 'middle', 12)}`),
  'solar-distance': () => svg(`<circle cx="40" cy="105" r="24" fill="${C.amber}"/>${T(40, 145, 'Sun', C.text)}
${[['Earth', 120, '1361 W', 1], ['Mars', 230, '590 W', 0.6], ['Jupiter', 360, '50 W', 0.18]].map(([n, x, w, f]) => `<circle cx="${x}" cy="105" r="${8 + 4 * f}" fill="#1c4a3d" stroke="${C.blue}"/>${T(x, 140, n, C.text)}${T(x, 156, w + ' per m²', C.green, 'middle', 11)}<rect x="${x - 12}" y="${60 - 30 * f}" width="24" height="${12 + 30 * f}" fill="${C.green}" opacity=".7"/>`).join('')}
${T(210, 18, 'Farther from the Sun means less power', C.text, 'middle', 13)}${T(210, 195, 'Twice as far = four times less sunlight', C.line, 'middle', 11)}`),
  'signal-delay': () => svg(`<circle cx="50" cy="105" r="22" fill="#1c4a3d" stroke="${C.blue}"/>${T(50, 109, 'Earth', C.text, 'middle', 11)}<circle cx="150" cy="105" r="10" fill="#33463f" stroke="${C.line}"/>${T(150, 135, 'Moon', C.text, 'middle', 11)}<circle cx="370" cy="105" r="14" fill="#7a3d2c" stroke="${C.red}"/>${T(370, 140, 'Mars', C.text, 'middle', 11)}
${arrow(75, 100, 140, 100, C.green)}${T(110, 85, '1.3 s', C.green, 'middle', 12)}${arrow(75, 112, 350, 112, C.amber)}${T(215, 160, '3 to 22 minutes', C.amber, 'middle', 12)}
${T(210, 18, 'Radio is fast, but space is big', C.text, 'middle', 13)}${T(210, 195, 'So a rover must drive itself', C.line, 'middle', 11)}`),
  backups: () => svg(`${T(105, 24, 'Series: all must work', C.text, 'middle', 12)}${box(20, 50, 50, 36, 'A')}${box(95, 50, 50, 36, 'B')}${box(170, 50, 50, 36, 'C')}${T(120, 112, '0.95 × 0.95 × 0.95 = 0.86', C.red, 'middle', 11)}
${T(315, 24, 'Parallel: one is enough', C.text, 'middle', 12)}${box(260, 45, 50, 30, 'A', C.green)}${box(260, 85, 50, 30, 'B', C.green)}${T(315, 150, '1 − 0.05 × 0.05 = 0.9975', C.green, 'middle', 11)}
${T(210, 188, 'Backups only help if they cannot fail for the same reason.', C.line, 'middle', 11)}`),
  edl: () => svg(`${[['1 Entry', 'Blunt capsule, shield', C.red], ['2 Parachute', 'Opens at supersonic speed', C.amber], ['3 Rockets', 'Slow the final drop', C.green], ['4 Touchdown', 'Soft landing', C.blue]].map(([a, b, c], i) => `<rect x="${12 + i * 100}" y="${40 + i * 25}" width="92" height="52" rx="8" fill="${C.dark}" stroke="${c}" stroke-width="2"/>${T(58 + i * 100, 62 + i * 25, a, c, 'middle', 12)}${T(58 + i * 100, 80 + i * 25, b, C.text, 'middle', 9)}`).join('')}
${T(210, 18, 'Mars landing in about 7 minutes', C.text, 'middle', 13)}${T(210, 195, 'No one on Earth can steer it. It lands itself.', C.line, 'middle', 11)}`),
});

export const diagram = (id) => DIAGRAMS[id]?.() ?? null;
