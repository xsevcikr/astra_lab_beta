# ASTRA LAB 2.4

## Weather
- Wind now turns with height (Settings in the Planner: "Wind turns by", up to 90 degrees by 12 km) and can have one thin shear layer ("Shear layer", extra m/s at a chosen height).
- Quick weather buttons: Calm, Breezy day, Jet stream, Wind shear layer, Storm.
- Both are off unless used, so older results do not change. Test: `tests/v21.test.js`.

## Graphics
- Earth uses a real 4096 x 2048 NASA colour map at high quality (2048 at medium), a sharper relief and ocean mask, and a **real satellite cloud map** instead of generated clouds. The older maps stay as the fallback. Sources: `assets/textures/SOURCES.md`.
- Tank skins get long weathering streaks. This is a small change; the rocket models were already detailed.

## Physics fixes (round 2)
- **Saturn V Max-Q altitude fixed** (was 16% low, now -0.5%). Pitch tables, thrust and drag changes did not move it: the standard atmosphere puts Max-Q at 11 km whatever the path. The flight needs a warm Florida day. New `environment.atmosphereProfile: 'tropical'` (AFGL tropical atmosphere) and a "Warm tropical day" switch in the Planner. All 16 Saturn V rows pass now (Max-Q time +2.9%, speed +1.3%).
- **Atlas V core burn fixed** (was -10.4%, now -0.0%): the RD-180 throttles back to 82% after 115 s (tuned). All 3 graded rows pass. The single-burn flight still overshoots its apogee (about 182 x 427 km), so the simulator still grades the flight FAILURE.

## New real mission
- **Soyuz-2.1a** (Baikonur, 51.6 degrees, 240 km, 7,430 kg): booster burn -0.4%, core burn -0.5%, third stage +8.5%, orbit reached (238 x 240 km); liftoff mass -0.4%. Source: the Soyuz-2 Wikipedia page, numbers quoted in `data/validation-vehicles.js`.

## Not done in this version
- New Shepard (apogee +59%): no new fit; its engine and mass numbers are not published.
- Only one new mission (Soyuz-2.1a).
- Mars, Moon and the other planets still use their older maps (no better free source found offline).
- The Windows installer, the updater on Windows and a real GitHub run are still untested. They need a GitHub repo.
