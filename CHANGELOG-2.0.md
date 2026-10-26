# ASTRA LAB 2.0: changelog (from 1.9.1)

## Checked against real missions
- New real-mission checks (Validation > *Does it match real missions?*, `src/core/mission-validation.js`), each row with its source:
  - Orbits and escape speeds: 8 of 8 within band (ISS period, GEO height, Earth/Mars/Moon escape speed, Moon period, LEO to GEO delta-v, Earth to Mars trip vs Curiosity).
  - Apollo 11 against the Mission Report: 7 of 7 within 10% (TLI, LOI-1 time and size, landing, docking, TEI size, entry interface).
  - Curiosity EDL: parachute time within 2%; touchdown 10% early (43 s), shown as a FAIL and explained.
- Falcon 9: fairing length corrected (the published 13.1 m includes the nose) and pitch table refitted. Now 8 of 8 rows pass (was 7 of 8).
- Apollo trip home: TEI is planned for the published 59.9 h coast instead of the fastest return. TEI is now 995.5 m/s (published 1,000.8, was about 1,400).
- Mars lander: heat-shield jettison (385 kg, 20 s after the chute), powered descent from 1.6 km.
- Fixed: a stale "SUCCESS" banner from the previous flight showed at the start of a new live flight.

## Will it work? (Test bench)
- New screen with 11 one-click examples: rockets, probes, landers and a rover, three of them broken on purpose (overloaded, half-fuelled, low on fuel).
- Each test flies the real simulator in a throw-away session and gives PASS or FAIL, one plain sentence why, and the key numbers. *Test my design* checks your own design.

## Share designs
- Share dialog in the builder, on Home and on the Test bench: copy an `astralab://design/...` link, copy a code, save or open an `.astra-design.json` file.
- The installer registers `astralab://`, so clicking a link opens the app. Every import asks first and is added as a new design. Damaged or oversized input is rejected with a plain message.

## Graphics
- Real NASA imagery: Earth day (Blue Marble), night lights (Black Marble), ocean glint, relief; Moon colour and relief (LRO). Sources in `assets/textures/SOURCES.md`.
- Filmic colour (ACES curve), light film grain and lens fringing at high quality.
- Director camera: shots chosen by flight phase, cutting like a launch broadcast.
- Exhaust by propellant: kerosene, hydrogen, methane, solid, hypergolic, cold gas.
- Orbit map opens on the vehicle's side of the planet. Ground camera no longer shakes.
- Cinema view (F key), compact glass HUD (*Less data*), new icons.

## Automated tests
- `.github/workflows/tests.yml`: unit tests on Ubuntu (Node 18, 22) and Windows (Node 18), plus the UI suite in headless Chromium, on every push and pull request.
- New suites: `tests/mission-validation.test.js`, `tests/testbench.test.js`, `tests/share.test.js`, `tests/ui-v2.mjs`, plus Apollo validation in `tests/apollo.test.js`. Engineering baseline regenerated.
- `npm run test:all` runs everything. The UI runner now fails in CI if Playwright is missing.

## Known limits
See `documentation/KNOWN-LIMITATIONS.md` ("Added in 2.0") and `documentation/VALIDATION.md` ("Honest disagreements").
