# Physics audit (ASTRA LAB v1.4.x)

Scope: `physics/*.js`, `src/vehicles/analysis.js`, `src/missions/*.js`. Read in full on 2026-10-01. Companion pages: `PHYSICS.md` (model), `VALIDATION.md` (comparison with real rockets).

## 1. Architecture
`physics/` has no DOM or UI code and is the single source of results. `Simulation` (simulation.js) owns a 13-number state (position, velocity in the main body's inertial frame, attitude quaternion, body rate) and calls, each step: `_chooseDt` -> guidance (guidance.js) -> `_evalForces` (gravity, thrust from `FlightVehicle`, aero from aero.js, atmosphere from atmosphere.js) -> `rk4Step` (integrator.js) -> `_afterStep` (loss accounting, power/thermal/comms in subsystems.js, structure and failure monitors in failures.js) -> `TelemetryRecorder`. A mission is plain data (events with conditions and actions) run by `MissionExecutor` (mission-exec.js). Vehicles are JSON component lists (`vehicle-model.js` computes mass, centre of gravity, inertia). `bodies.js` holds Earth, Moon, Mars, Sun, Keplerian ephemerides and launch sites. `mission-design.js` (new) holds pure calculators (plane change, Lambert, launch windows, delta-v budget).

## 2. How the physics works
* **Integrator:** classical RK4. Fixed step `dt = 0.02 s` while engines burn, in air, or near the ground. In free coast the step is `0.01 sqrt(r^3/mu)`, capped at 2 s (Standard accuracy; 0.5 s High, 10 s Fast). The coast step rule is a heuristic, **not** error-controlled adaptive stepping. Timed events are never stepped over.
* **Atmosphere:** Earth = US Standard Atmosphere 1976 (analytic layers to 86 km, log-interpolated table 86-1000 km). Mars = NASA Glenn curve fit. Air is treated as zero above `height` (Earth 150 km, Mars 120 km), so orbital drag above that is zero.
* **Aerodynamics:** axial coefficient `CA(Mach)` from a 13-point table (ogive nose, power-off), times a nose factor (ogive 1, cone 1.12, flat 2.6, capsule 4.5), x0.88 when the engine is firing (base-pressure effect); normal force `CNalpha sin a cos a + 1.2 (A_plan/S) sin^2 a`; centre of pressure from body and fins. Parachutes add drag area.
* **Gravity vs altitude:** point mass `mu/r^2` (so it falls with height); J2 only when `settings.j2` is true (default **false**).
* **Thrust and Isp vs ambient pressure:** `Isp = Isp_vac - (Isp_vac - Isp_sl) p/p0`, i.e. linear in pressure; `F = mdot Isp g0`. Spool-up, minimum throttle, ignition counts, gimbal range are modelled.
* **Staging:** SEPARATE removes a component group; mass, CG and inertia are recomputed; momentum is conserved; jettisoned parts are flown on their own by `debris.js`.
* **Max-Q and structure:** dynamic pressure is a telemetry channel; failure monitor checks axial load and `q*alpha` against per-component limits.
* **Losses:** gravity, drag and steering loss and the ideal delta-v are integrated every step (`budget`). Closure `ideal - losses = speed gained` holds for powered-all-the-way ascents (tested in `validation.test.js`). Steering loss is measured against the inertial velocity vector, so closed-loop insertion steering counts as steering loss; unpowered coast arcs are not in the budget.
* **Earth rotation:** the pad starts with the co-rotating velocity, the air co-rotates (airspeed uses it), and `launchAzimuth` uses it.
* **Guidance:** `ascent` = vertical rise, kick, gravity turn or flight-path-angle schedule with load relief, optional closed-loop insertion; `pitch_program` (time table), prograde/retrograde/etc., closed-loop powered descent.
* **Delta-v budget:** `analysis.js` gives per-stage vacuum and sea-level rocket-equation delta-v; `ascentDvRequired` uses a fixed 1,500 m/s loss guess (an estimate, not a result).

## 3. Hard-coded values (where)
`constants.js` (G, g0, sigma, AU, solar constant; CODATA/IAU); `bodies.js` (mu, radius, J2, rotation period, orbit elements, surface data, launch sites); `atmosphere.js` (US76 layer table, high-altitude table, Mars curve fit); `aero.js` (CD table, nose factors, crossflow Cd 1.2, Sutton-Graves constants); `propellants.js` (densities, tank mass fractions); `simulation.js` (default dt 0.02, coast caps, attitude bandwidth 1.3 rad/s and damping 0.85); `flight-vehicle.js` (specific heat 900 J/kg/K); `debris.js` (Cd 1.0, separation push 0.6 and 1.5 m/s, tumble rates); `failures.js` (thresholds); `generator.js` (default ascent schedule, delays, fairing at 105 km). Engine and part numbers are in `data/components.js` and are fictional class-typical values.

## 4. Untested (before this audit)
Thrust/Isp vs pressure (only vacuum-like tests), Cd(Mach) table (only constant-Cd drag), max-Q, loss accounting, J2, atmosphere above 50 km, parachutes, aerodynamic heating, pitch-program and gravity-turn guidance (only end-to-end missions), coast step-size convergence, RK4 order. Added now: loss closure and a comparison with published launcher data (`validation.test.js`), mission-design maths (`physics-extra.test.js`).

## 5. Wishlist status (honest)
| Item | Status |
|---|---|
| RK4 with documented fixed dt | **Exists.** Fixed 0.02 s under thrust/in air; coast step is a heuristic, not error-controlled |
| US Standard Atmosphere 1976 | **Exists** (tested to 50 km); above 86 km it is a coarse table |
| Cd(Mach) | **Exists**, generic ogive-body table; not your exact shape |
| g(h) | **Exists** (point mass; J2 optional, off) |
| Thrust and Isp vs pressure | **Approximate** (linear in pressure, no nozzle model) |
| Staging | **Exists**, tested |
| Max-Q | **Exists** (channel + limit check); only compared with Apollo 11 in VALIDATION.md (model is 17% low in altitude) |
| Gravity / drag / steering loss | **Exists**; definition of steering loss noted above |
| Earth rotation | **Exists** |
| Gravity-turn guidance | **Exists** (plus schedule and pitch table) |
| Full delta-v budget | **Added** `deltaVBudget` + page table; the pre-launch estimate is still a rule of thumb |
| Circularisation burns | **Exists** in launch missions; **added** `circularisationDv` |
| Hohmann | **Exists** (`orbital.hohmann`), tested |
| Plane changes | Pure change existed; **added** combined burn and best-split (`planeChangeOptions`) |
| Patched-conic interplanetary | SOI hand-over existed in the simulator; **added** Lambert-based `interplanetaryTransfer` (impulsive) |
| Launch windows (Mars) | **Added** `findTransferWindows`, `hohmannWindows`, synodic period; checked against 2018 and 2020 launches |
| Basic EDL | **Partly exists:** powered landing, Mars air, drag, parachute drag area, heating. Approximate and **not validated** against a real landing |
| Seeded reproducibility | **Exists** (determinism tests; Monte Carlo uses mulberry32) |
