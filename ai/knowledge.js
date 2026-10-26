// Educational notes with the equations ASTRA LAB actually uses. Each entry states which part of the simulator applies it.
// These are general physics facts (not simulation results); the AI labels them as such.
export const CONCEPTS = [
  { id: 'rocket-equation', match: /rocket equation|tsiolkovsky|delta[- ]?v\b|dv budget/, title: 'Delta-v and the Tsiolkovsky rocket equation',
    equation: 'Δv = Isp · g0 · ln(m0 / mf)',
    text: 'The velocity change a rocket can produce depends only on its exhaust velocity (Isp·g0) and the ratio of initial to final mass. Every extra m/s costs exponentially more propellant, which is why rockets are staged: dropping empty tanks improves the mass ratio of the rest. ASTRA LAB computes the ideal Δv per stage from this equation (Vehicle Designer, Engineering Analysis) and separately logs gravity, drag and steering losses during a flight.' },
  { id: 'isp', match: /\bisp\b|specific impulse/, title: 'Specific impulse (Isp)',
    equation: 'F = mdot · Isp · g0',
    text: 'Isp is thrust per unit weight-flow of propellant, in seconds. Higher Isp means less propellant per unit of Δv. Isp depends on ambient pressure: engines optimised for vacuum lose much of their Isp at sea level, so ASTRA LAB interpolates between the sea-level and vacuum Isp with the local atmospheric pressure.' },
  { id: 'twr', match: /thrust[- ]to[- ]weight|\btwr\b/, title: 'Thrust-to-weight ratio',
    equation: 'TWR = F / (m · g)',
    text: 'A rocket can only lift off when TWR > 1 at the surface. Too low a TWR wastes Δv fighting gravity (gravity loss); too high increases structural load and acceleration. Launchers are typically designed for a liftoff TWR of 1.2 to 1.6.' },
  { id: 'maxq', match: /max[- ]?q|dynamic pressure/, title: 'Dynamic pressure and Max-Q',
    equation: 'q = ½ ρ v²',
    text: 'Aerodynamic loading is proportional to dynamic pressure. During ascent, speed rises while air density falls, so q peaks (Max-Q) typically about a minute after launch. The structural limit in ASTRA LAB is checked against q·α (dynamic pressure times angle of attack) for the exposed parts of the vehicle.' },
  { id: 'gravity-loss', match: /gravity (loss|turn)|steering loss|drag loss|losses/, title: 'Gravity, drag and steering losses',
    equation: 'Δv_ideal = Δv_orbit + Δv_gravity + Δv_drag + Δv_steering',
    text: 'The engines deliver more Δv than the final orbit speed because part is lost while climbing against gravity (∫ g sinγ dt), fighting air drag, and thrusting off-axis when steering. ASTRA LAB integrates all four during the flight and shows them in the Telemetry and Engineering Analysis screens. A typical launch to low Earth orbit loses roughly 1.3 to 1.8 km/s.' },
  { id: 'orbit', match: /\borbit\b|apoapsis|periapsis|eccentricity|kepler|vis[- ]viva/, title: 'Orbits, apoapsis and periapsis',
    equation: 'v² = μ (2/r − 1/a),   T = 2π √(a³/μ)',
    text: 'An orbit is described by its semi-major axis a and eccentricity e; periapsis and apoapsis are the closest and farthest points. To circularise at apoapsis a prograde burn of Δv = √(μ/ra) − √(μ (2/ra − 1/a)) raises the periapsis. ASTRA LAB reports osculating elements from the simulated state vector in every telemetry sample.' },
  { id: 'hohmann', match: /hohmann|transfer orbit/, title: 'Hohmann transfer',
    equation: 'Δv1 = √(μ/r1)(√(2r2/(r1+r2)) − 1),   Δv2 = √(μ/r2)(1 − √(2r1/(r1+r2)))',
    text: 'The most propellant-efficient two-burn transfer between coplanar circular orbits. The default launch mission uses the same idea: the upper stage burns until the apoapsis reaches the target altitude, coasts to apoapsis and performs a circularisation burn.' },
  { id: 'staging', match: /staging|stage separation|multi[- ]?stage/, title: 'Staging',
    equation: 'Δv_total = Σ Isp_i · g0 · ln(m0_i / mf_i)',
    text: 'Discarding empty tanks and engines raises the mass ratio of the remaining stages. In ASTRA LAB a SEPARATE event removes the stage and its mounted components, conserves the momentum of the remaining vehicle and updates mass, centre of gravity and inertia from the component list.' },
  { id: 'escape', match: /escape velocity|escape speed/, title: 'Escape velocity',
    equation: 'v_esc = √(2 μ / r)',
    text: 'The speed needed to leave a body\'s gravity well with zero excess speed. Earth 11.19 km/s at the surface, Moon 2.38 km/s, Mars 5.03 km/s. ASTRA LAB uses patched-conic spheres of influence to hand the vehicle from one body to the next.' },
  { id: 'drag', match: /\bdrag\b|mach\b|aerodynamic/, title: 'Aerodynamic drag',
    equation: 'D = ½ ρ v² Cd A',
    text: 'The drag coefficient rises sharply near Mach 1 (wave drag) and depends on the nose shape. ASTRA LAB uses an axial force coefficient table versus Mach number scaled by a nose-shape factor, a normal-force coefficient with a centre of pressure for angle-of-attack effects, and the selected atmosphere model (US Standard Atmosphere 1976 for Earth, a Mars reference atmosphere).' },
  { id: 'link', match: /link budget|friis|antenna|communication/, title: 'Communication link budget',
    equation: 'P_rx = P_tx · G_tx · G_rx · (λ / 4πd)²',
    text: 'The received power falls with the square of distance. ASTRA LAB evaluates the Friis equation between the vehicle antenna and the ground station every step and reports the link margin in dB; the link closes when the margin is positive.' },
  { id: 'integrator', match: /rk4|integrator|runge/, title: 'Numerical integration (RK4)',
    equation: 'y(t+h) = y + h/6 (k1 + 2k2 + 2k3 + k4)',
    text: 'The equations of motion (position, velocity, attitude quaternion, body rates) are integrated with the classical fourth-order Runge-Kutta method with a fixed step (0.02 s while thrusting or in the atmosphere; longer steps while coasting in vacuum). It is deterministic: the same inputs always give bit-identical results.' },
];

export function conceptFor(text) {
  const t = String(text).toLowerCase();
  return CONCEPTS.find((c) => c.match.test(t)) ?? null;
}
