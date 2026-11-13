# ASTRA LAB physics update: heating, flight control, pogo, two-burn Centaur

The items that CHANGELOG-2.5 and the 2026-11 audit listed as "not done". Every new model except the Centaur flight is behind a switch in
Planner > Weather and gravity and is OFF by default, so earlier flights, Apollo plans and validation results do not change.

## Added
- **Entry heating** (`physics/heating.js`, switch "Detailed heating"). Shock-layer radiation (Tauber-Sutton) on top of the Sutton-Graves
  convective heating, heat load, radiative-equilibrium wall temperature and heat-shield ablation. An 11 km/s capsule entry now shows about
  3 MW/m² convective plus 3 MW/m² radiative and a heat load of about 4 x 10^8 J/m² (Apollo: similar), with 1 to 2 cm of recession. With the
  switch on, a too-thin ablative shield burns through (failure HEAT_SHIELD_BURNTHROUGH) and the radiation also heats the nose node.
- **Fin heating.** Swept-cylinder leading edges with a lumped edge temperature per fin set. With the switch on, an edge above its limit is
  the failure FIN_OVERHEAT (default limit 700 K, a titanium edge; set the fin's tMax for aluminium).
- **Pogo** (`physics/pogo.js`, switch "Pogo"). Structure and feed line as two coupled oscillators. Saturn V with no suppressor starts to
  shake at about 150 s at 5 to 7 Hz, close to what happened on Apollo 6; `pogoSuppressor: true` on the engines removes it.
- **Flight computer** (`physics/gnc.js`, switch "Real flight computer"). Sampled PID with an integral term, IMU drift, a gimbal servo with
  lag and rate limit, and the pitch-loop gain and phase margins through the flight (warning below 30 degrees).
- **Two-burn Centaur.** Atlas V 551 flies explicit guidance into a 160 x 185 km parking orbit, coasts once around the Earth and circularises:
  about 182 x 193 km and graded SUCCESS (before: 182 x 427 km, FAILURE). The explicit insertion law is opt-in (`explicit: true`) for any
  closed-loop insertion.
- Telemetry: radiative heat flux, heat load, fin edge temperature, heat-shield recession, pogo g level, gimbal servo lag.
  The flight summary has `heating`, `pogo` and `gnc` blocks.

## Not changed
- The centre-of-pressure model (the Barrowman change that crashed Falcon 9 and Soyuz stays reverted).
- Windows build files.

## Tests
`tests/v29-physics.test.js` (11 tests) and the Atlas V test in `tests/validation.test.js`.

## Limits
Heating correlations are good to about a factor of 2. Pogo reports the shaking but does not feed it back into the trajectory. The flight
computer navigates attitude only; guidance still reads the true position and velocity. PSLV-XL and Vega still fly one upper-stage burn.
