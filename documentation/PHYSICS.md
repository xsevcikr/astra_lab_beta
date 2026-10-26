# Physics model

The authoritative physics lives in `physics/` and is completely independent of rendering. The same engine runs in the desktop app, in the headless demo, in the AI engineer's tool calls, in experiments and in the automated tests. Rendering only *reads* the results.

## Numerical method

* State vector (13): position **r**, velocity **v** in the primary body's inertial frame, attitude quaternion **q** (body→inertial), body angular rate **ω**.
* Integrator: classical **4th-order Runge–Kutta** with a fixed step (default 0.02 s) during powered flight, in atmosphere and near the ground. Far from any surface and without thrust the step grows with the orbital time scale (`dt ≈ 0.01·√(r³/μ)`, capped by the *Physics accuracy* setting *Fast / Standard / High*). Timed mission events are never stepped over.
* Mass changes are prescribed linearly over each step from the engines' mass flow (`ṁ = F / (Isp·g₀)`).
* **Deterministic**: identical vehicle, mission, environment, settings and commands give bit-identical telemetry (tested). Performance and 3D quality settings never change results; only the coasting step cap of the accuracy setting differs, and each setting is itself deterministic.
* Live (real-time) runs and fast runs use the same engine. Manual commands during a live run are recorded with their simulation time, so a recording can be re-simulated exactly (`resimulate`, `verifyReproducible`).

## Forces and torques

| Effect | Model |
|---|---|
| Gravity | Point mass `−μ r / |r|³` for Sun, Earth, Moon, Mars; optional **J₂** oblateness (setting `j2`, off by default). |
| Thrust | `F = ṁ·Isp·g₀ + (p_e − p_a)·A_e`, implemented as Isp interpolated linearly with ambient pressure between the sea-level and vacuum values of the engine; minimum throttle and throttle command, spool time, a limited number of ignitions (restartable engines only), gimbal range. |
| Mass | Sum of component masses plus propellant in each tank; **centre of gravity and inertia tensor** recomputed every step from the remaining components (staging, fairing and payload release change them). |
| Atmosphere | Earth: **U.S. Standard Atmosphere 1976** (layers to 86 km, tabulated above). Mars: NASA Glenn curve fit. Moon: vacuum. |
| Drag / lift | Axial force coefficient tabulated against Mach (wave + skin-friction drag of an ogive-nosed cylinder), normal force `CN(α) = CNα sin α cos α + η·Cdc·(A_plan/S) sin²α` (linear + cross-flow), centre of pressure from body and fin contributions (Barrowman-style). Parachutes add drag area. |
| Attitude control | Thrust-vector (gimbal) torque, reaction wheels and RCS with a PD law whose gains follow a bandwidth/damping design; loss of the guidance package or actuator is a failure, not a special case. |
| Guidance | Ascent pitch programme (`gamma(h)` from vertical to horizontal over turn altitude `hF` with exponent `n`), prograde/retrograde/radial/nadir/sun/Earth pointing, powered-descent guidance, hold. |
| Aerodynamic heating | Stagnation-point convective flux (**Sutton–Graves**): `q̇ = k √(ρ/Rn) v³`; skin temperature from a lumped-capacitance energy balance with radiation. |
| Structure | Axial load ratio from the mass above each stack element times proper acceleration against its strength; bending from `q·α` against the limit. Ratio ≥ 1 is a structural failure. |
| Power / thermal / comms | Solar generation with cylindrical-shadow eclipses and panel deployment; battery energy; radiator/heater/MLI thermal balance (`Q_in = εσAT⁴`); link budget with antenna gain, range and ground-station elevation. |
| Rover | DC-motor torque–speed with power cap, Coulomb traction with cohesion, rolling resistance, slope gravity, slip, rollover margin, battery use; procedural deterministic terrain. |
| Landing | Contact detection against terrain, touchdown speed/tilt limits from the leg rating, tip-over; a deployed rover lands with the lander. |
| Orbits | State ↔ elements, universal-variable Kepler propagation, patched-conic **sphere-of-influence** transitions (Laplace radii), Keplerian ephemerides for Earth, Moon, Mars. |

## Validation (all in `tests/physics.test.js` and `tests/missions.test.js`)

* Surface gravity of Earth, Moon and Mars equals `GM/R²`; simulated acceleration equals `GM/r²`.
* Free fall from rest in vacuum matches the exact radial Kepler solution.
* Constant thrust in gravity-free space reproduces the **Tsiolkovsky rocket equation** `Δv = Isp·g₀·ln(m₀/m₁)`.
* Propellant depletion stops the engine and leaves exactly the dry mass.
* Falling body with drag follows `v = v_t·tanh(g t / v_t)` with terminal speed `v_t = √(2mg/(ρ C_d A))`.
* Circular orbit: period, radius, energy and angular momentum are conserved. Elliptical orbit: matches the analytic Kepler propagator; period `2π√(a³/μ)`.
* Textbook LEO→GEO **Hohmann** transfer values; U.S. Standard Atmosphere 1976 and Mars reference values.
* Staging conserves momentum and removes exactly the stage mass; mass/CG are sums over components; SOI radii match published values.
* Jettisoned hardware: energy conservation, closed orbit, ballistic-coefficient dependence, terminal-velocity impact speed. Monte Carlo statistics: seeded generator, Wilson interval, percentiles and correlation against textbook values.
* End-to-end missions: two-stage launcher puts a 100 kg probe into a 200 km orbit; lunar powered descent lands within the leg rating; under-fuelled lander is diagnosed; lander deploys a rover which drives; Mars rover traverse; determinism.

## Jettisoned hardware (debris)

At every stage separation, fairing jettison and payload release the simulator records the state of the discarded hardware: position of its own centre of mass, velocity, attitude, mass (structure plus remaining propellant) and a mean tumbling cross-section (surface area / 4, Cauchy). `physics/debris.js` then flies each piece on its own with RK4: point-mass gravity of the primary body plus drag `a = -½ ρ (C_d A / m) |v_rel| v_rel` in the rotating atmosphere (U.S. Standard Atmosphere 1976 for Earth), `C_d = 1.0`. The tracks do not influence the vehicle. Assumptions (nominal, not measured): separation spring 0.6 m/s aft for stages, 1.5 m/s sideways for the fairing, residual tumbling rates 0.03 / 0.10 / 0.06 rad/s, no winds, no lift, spherical ground. The momentum given to the vehicle by the separation spring (well below 1 m/s) is neglected. Validation (`tests/debris.test.js`, `tests/debris-report.test.js`): orbital energy conserved to better than 1e-6 over an orbit, orbit closes after one period, decay depends on the ballistic coefficient, and the impact speed of the spent first stage equals its terminal velocity `√(2mg/(ρ C_d A))` (33 m/s for the sample launcher).

## Monte Carlo dispersion analysis

`src/core/montecarlo.js`. Each run applies random multiplicative factors (`1 + σ z`, z standard normal truncated at 3σ, or uniform) to groups of inputs and flies a complete simulation. The generator is seeded (mulberry32), so a study is reproducible. Success probability uses the Wilson 95 % interval; sensitivities are Pearson correlations between each factor and the outcome (association, not proof of cause). Defaults: thrust 1.5 %, Isp 1 %, propellant loaded 0.5 %, structural mass 3 % (typical values, adjustable). Not modelled: winds, atmospheric density variations, guidance errors, sensor noise.

## Mission-design calculators (`physics/mission-design.js`)

Pure functions, used by the Validation page and available to the AI and planner. Impulsive burns and patched conics; planets on fixed Keplerian ellipses from `bodies.js`.

* `combinedBurnDv`, `planeChangeOptions`: one burn that changes speed and turns the velocity vector, `dv = sqrt(v1^2 + v2^2 - 2 v1 v2 cos(di))`; the best split of a plane change between the two Hohmann burns (golden-section search).
* `circularisationDv`, `rotationBenefit`, `sunSynchronousInclination` (J2 nodal precession equals the Earth's motion about the Sun).
* `deltaVBudget`: turns the simulator's integrated ideal delta-v and gravity, drag and steering losses into a table that must add up (`ideal - losses = speed gained` for a burn that is powered all the way; coast arcs are shown as a separate line).
* `synodicPeriod`, `hohmannPhaseAngle`, `lambert` (universal variables), `interplanetaryTransfer` (departure and arrival v-infinity from the real planet positions, burns from circular parking orbits), `findTransferWindows` (scan of the lowest departure C3, i.e. a porkchop plot) and `hohmannWindows` (phase-angle rule). Tested against the textbook Earth-Mars numbers (synodic period 779.9 d, phase angle 44.3 deg, v-infinity 2.94 and 2.65 km/s, 258.8 d) and against the 2018 and 2020 launch windows (`tests/physics-extra.test.js`).
* Not supported: gravity assists, low-thrust spirals, finite-burn losses in the calculators, planets other than Earth, Moon and Mars. There is no dedicated Mars entry-descent-landing model beyond the simulator's general air, drag, parachute and heating physics, which has not been validated against a real landing.

## Comparison with real rockets

`documentation/VALIDATION.md` and the Validation page fly simplified models of Saturn V (Apollo 11), Falcon 9 Full Thrust and Electron and compare them with published numbers, with the error and the tolerance used. `documentation/AUDIT.md` lists what exists, what is approximate and what is untested.

## Reference frames and units

* SI units internally (m, s, kg, N, K, rad). The UI converts for display (metric default, imperial optional).
* Each body has an inertial frame with +Z along its spin axis. The Earth–Sun orbital plane is the reference plane (obliquity ignored).
* Vehicle body frame: +X runs from the engines toward the nose. A rover uses X = terrain normal (up), Y = right, Z = forward.
