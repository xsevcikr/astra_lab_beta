# ASTRA LAB 2.1: changelog (from 2.0)

## Mistakes found and fixed
- **Precise gravity (J2) did nothing.** The Earth's equatorial-bulge term was divided by one extra factor of the orbit radius, so it was about ten million times too weak (1.9 and 2.0). It was off by default, so earlier results did not change. Fixed in both places it is computed (`physics/simulation.js`). A new real-world check guards it: a satellite flown for a day drifts 0.9851 deg/day in a Sun-synchronous orbit (required: 0.9856) and -4.97 deg/day like the space station (about -5.0).
- **A timing-sensitive test** (`tests/makeitfly.test.js`) failed when the whole suite ran at once on a busy computer. It now has a safe upper limit and no longer depends on a quiet machine.
- **Screen redraw safety:** clearing a screen can no longer throw if a field loses focus at the same moment it is redrawn (`ui/lib/dom.js`).
- **Version strings** (installer name, settings, build notes) now say 2.1.0.

## For scientists and engineers
- **Weather:** wind (speed, compass direction, gusts, seed) and air density, set in Mission Planner > Environment. Jet-stream profile (20% at the ground, strongest at 12 km, none above 26 km). Off by default; the same seed always gives the same flight.
- **Reliability studies with weather:** the Monte Carlo study can disperse wind (random speed, random direction) and air density next to thrust, Isp, propellant and mass. It now allows up to 500 flights.
- **Precise gravity checkbox** (J2) in the same place, saved with the project and used by live flights, simulations, replays and studies.
- **Repeatable runs:** every run has an input fingerprint and a result fingerprint, and records the gravity model and weather it used. **Replay > Re-run and verify** flies the run again from its recorded inputs and checks every sample. The PDF mission report lists all of it.
- **Your own tools:** *Python script* and *MATLAB script* buttons (Engineering Analysis > Report) save a loader that plots the telemetry CSV.
- **More real-mission checks:** *Orbit drift from the Earth's shape (J2)*: 2 of 2 pass. Apollo 11 times are shown as h:mm:ss like the Mission Report.

## For presenting
- `PRESENTATION-GUIDE.md`: a 10-minute demo script, what to prepare, what to say about the misses, and what to do if something goes wrong.
- Screenshots of the new screens in `documentation/screenshots-2.0/`.

## Tests
- New: `tests/v21.test.js` (8 tests: weather, density, wind direction, fingerprints, J2 orbit drift, Monte Carlo with weather, scripts) and `tests/ui-v21.mjs` (16 browser checks). Added to `npm test` and `npm run test:ui`, and so to the GitHub workflow.
- A sweep of every screen in Beginner, Standard and Advanced mode with four different designs (264 screen visits) found no errors.
- Orbit conservation was checked over two days: energy drift 2e-13 (standard) and 5e-10 (fast).

## Known limits
See `documentation/KNOWN-LIMITATIONS.md` ("Added in 2.1"). Not done yet: engines with a thrust-versus-time curve, propellant slosh, structural flex, SPICE or CCSDS file import, more real flights (Ariane 5, Atlas V), and the Saturn V Max-Q miss.
