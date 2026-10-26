# Validation against real rockets

The Validation screen flies three real vehicles and compares the simulator with published numbers. Every published value, its source URL and the way it was read are recorded in `data/validation-vehicles.js`. Nothing here is invented. Where a value is estimated or derived, the data file says so.

## Sources
- Saturn V (Apollo 11): NASA Apollo 11 Press Kit, https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_PressKit.pdf ; Apollo 11 Launch Vehicle Flight Evaluation, https://www.ibiblio.org/apollo/Documents/lvfea-AS506-Apollo11.pdf ; Wikipedia pages for S-IC, S-II, S-IVB, F-1, J-2.
- Falcon 9 Full Thrust: Wikipedia (Falcon 9, Falcon 9 Full Thrust, Merlin); Spaceflight Now Starlink timeline (Max-Q 1:12, MECO 2:32, stage 2 ignition 2:43); CRS-4 press kit (context only).
- Electron: Rocket Lab Electron Payload User Guide 7.0; Wikipedia Rocket Lab Electron. Electron stage dry masses (950 kg and 250 kg) are estimates, and the first-stage propellant is derived from the published liftoff mass. The Mahia launch-site coordinates are approximate and unverified.

## Tolerance bands
- Input and build numbers (mass, thrust): within 5%. They come straight from the same sources, so a bigger gap means a build error.
- Flight results (times, altitudes, speeds, orbit): within 10%. The simulator is a point-mass model with a generic or fitted pitch programme, and published values differ between sources by a few percent.
- Rows with no band are shown for context and are never graded.

## Pitch programmes (labelled as tuned)
Saturn V flies a fitted pitch table for the S-IC phase (0 to 165 s) and closed-loop steering to orbit from the S-II on (2.3; before that it used the generic ascent). Atlas V uses a fitted table for its first 230 s and closed-loop steering from the Centaur. Falcon 9 and Electron use a time-tagged pitch table fitted by `scripts/validation-fit.mjs` so the vehicle reaches the published orbit. These tables are not published data. The Falcon 9 table only works near its 22.8 t payload, so a maximum-payload search is not offered.

## Results
Run `node scripts/validation-report.mjs <saturn-v|falcon-9|electron|atlas-v-551|ariane-5-eca|new-shepard>` to regenerate the tables.


### Saturn V (Apollo 11)

Result: SUCCESS - Mission objective achieved. Orbit 182.7 km x 185.1 km. 16 of 16 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Liftoff mass | 2,941,221 kg | 2,865,078 kg | -2.6% | +/-5% | pass |
| Liftoff thrust (sea level) | 34.50 MN | 33.63 MN | -2.5% | +/-5% | pass |
| Max-Q time | 81.0 s | 83.3 s | +2.9% | +/-10% | pass |
| Max-Q altitude | 13.2 km | 13.2 km | -0.5% | +/-10% | pass |
| Speed at Max-Q (space-fixed) | 804 m/s | 814 m/s | +1.3% | +/-10% | pass |
| S-IC outboard engine cutoff time | 160.8 s | 163.8 s | +1.9% | +/-10% | pass |
| S-IC cutoff altitude | 66.3 km | 68.4 km | +3.0% | +/-10% | pass |
| S-IC cutoff speed (space-fixed) | 2,753 m/s | 2,732 m/s | -0.8% | +/-10% | pass |
| S-II cutoff time | 551.4 s | 581.8 s | +5.5% | +/-10% | pass |
| S-II cutoff altitude | 185.9 km | 185.1 km | -0.4% | +/-10% | pass |
| S-II cutoff speed (space-fixed) | 6,933 m/s | 6,584 m/s | -5.0% | +/-10% | pass |
| S-II burn time | 388.2 s | 415.5 s | +7.0% | +/-10% | pass |
| S-IVB first-burn cutoff time (orbit insertion) | 700.1 s | 767.4 s | +9.6% | +/-10% | pass |
| Speed at S-IVB cutoff (space-fixed) | 7,791 m/s | 7,792 m/s | +0.0% | +/-10% | pass |
| Parking orbit perigee altitude | 183.8 km | 182.7 km | -0.6% | +/-10% | pass |
| Parking orbit apogee altitude | 186.5 km | 185.1 km | -0.8% | +/-10% | pass |

### Falcon 9 Full Thrust (v1.2)

Result: SUCCESS - Mission objective achieved. Orbit 199.0 km x 217.7 km. 8 of 8 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Liftoff mass (model without payload) | 549,000 kg | 546,301 kg | -0.5% | +/-5% | pass |
| Liftoff thrust (sea level) | 7.61 MN | 7.61 MN | +0.0% | +/-5% | pass |
| Vehicle height | 70 m | 75 m | +8.1% | +/-10% | pass |
| First-stage burn time | 162.0 s | 149.8 s | -7.5% | +/-10% | pass |
| Second-stage burn time | 397.0 s | 365.8 s | -7.9% | +/-10% | pass |
| Max-Q time | 72.0 s | 77.0 s | +7.0% | +/-10% | pass |
| MECO time | 152.0 s | 148.4 s | -2.4% | +/-10% | pass |
| Second-stage ignition time | 163.0 s | 159.4 s | -2.2% | +/-10% | pass |
| MECO altitude (context only) | 80.0 km | 59.5 km | -25.7% | - | context |
| MECO speed in Mach (context only) | 10.0  | 8.5  | -14.7% | - | context |

### Rocket Lab Electron

Result: SUCCESS - Objective achieved. Orbit 496.8 km x 500.1 km. 4 of 8 graded rows within their band, 4 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Liftoff mass | 13,000 kg | 13,001 kg | +0.0% | +/-5% | pass |
| Liftoff thrust (sea level) | 224.3 kN | 224.4 kN | +0.1% | +/-5% | pass |
| Stage 1 engine cutoff time | 155.0 s | 129.4 s | -16.5% | +/-10% | **FAIL** |
| Stage 2 ignition time | 184.0 s | 158.4 s | -13.9% | +/-10% | **FAIL** |
| Stage 2 ignition altitude | 126.0 km | 110.9 km | -12.0% | +/-10% | **FAIL** |
| Stage 2 engine cutoff time | 535.0 s | 408.8 s | -23.6% | +/-10% | **FAIL** |
| Orbit altitude reached (lowest point) | 500.0 km | 496.8 km | -0.6% | +/-10% | pass |
| Orbit altitude reached (highest point) | 500.0 km | 500.1 km | +0.0% | +/-10% | pass |
| Inclination for a Sun-synchronous orbit (computed, context only) | 97.4 deg | 98.0 deg | +0.6% | - | context |

### New in 2.3, 2.4 and 2.5: more launchers (Soyuz-2.1a in 2.4; Vega and PSLV-XL in 2.5)
These three come with fewer published numbers than the first three (the cited pages give masses, thrust, burn times and payload but almost no trajectory timeline), so most rows check the build and the burn times. Every miss is listed.

### Atlas V 551

Result: FAILURE - Time limit reached. Orbit 182.4 km x 427.2 km. 3 of 3 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Common Core Booster burn time | 253.0 s | 252.9 s | -0.0% | +/-10% | pass |
| Solid booster (AJ-60A) burn time | 94.0 s | 93.6 s | -0.4% | +/-10% | pass |
| Reaches low Earth orbit with the published 551 payload (1 = yes) | 1.0  | 1.0  | +0.0% | +/-1% | pass |
| Liftoff mass (context only) | 590,000 kg | 565,775 kg | -4.1% | - | context |

### Ariane 5 ECA

Result: SUCCESS - Objective achieved. Orbit 197.1 km x 200.0 km. 3 of 3 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Solid booster burn time | 140.0 s | 139.5 s | -0.4% | +/-10% | pass |
| Core stage (EPC) burn time | 540.0 s | 518.1 s | -4.1% | +/-10% | pass |
| Reaches a 200 km parking orbit with the published GTO payload (1 = yes) | 1.0  | 1.0  | +0.0% | +/-1% | pass |
| Liftoff mass (context only) | 777,000 kg | 763,681 kg | -1.7% | - | context |

### Soyuz-2.1a

Result: SUCCESS - Objective achieved. Orbit 238.3 km x 240.4 km. 4 of 4 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Strap-on booster burn time | 118.0 s | 117.5 s | -0.4% | +/-10% | pass |
| Core stage (Block A) burn time | 286.0 s | 284.5 s | -0.5% | +/-10% | pass |
| Third stage (Block I) burn time | 250.0 s | 271.3 s | +8.5% | +/-10% | pass |
| Reaches a 240 km orbit with the published payload (1 = yes) | 1.0  | 1.0  | +0.0% | +/-1% | pass |
| Liftoff mass (context only) | 312,000 kg | 310,683 kg | -0.4% | - | context |

### Vega

Result: FAILURE - Propulsion exhausted; objective not achieved. Orbit 388.1 km x 1,068.4 km. 3 of 4 graded rows within their band, 1 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| First stage (P80) burn time | 107.0 s | 110.1 s | +2.9% | +/-10% | pass |
| Second stage (Zefiro 23) burn time | 71.6 s | 77.6 s | +8.4% | +/-10% | pass |
| Third stage (Zefiro 9) burn time | 117.0 s | 117.0 s | -0.0% | +/-10% | pass |
| Reaches a 700 km polar orbit with the published payload (1 = yes) | 1.0  | 0.0  | -100.0% | +/-1% | **FAIL** |
| Liftoff mass (context only) | 137,000 kg | 138,888 kg | +1.4% | - | context |

### PSLV-XL

Result: FAILURE - Propulsion exhausted; objective not achieved. Orbit 197.0 km x 281.8 km. 4 of 4 graded rows within their band, 0 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Strap-on (PSOM-XL) burn time | 70.0 s | 69.7 s | -0.4% | +/-10% | pass |
| First stage (S139) burn time | 110.0 s | 109.8 s | -0.2% | +/-10% | pass |
| Second stage (Vikas) burn time | 151.0 s | 150.6 s | -0.3% | +/-10% | pass |
| Reaches a 200 km orbit with the published payload (1 = yes) | 1.0  | 1.0  | +0.0% | +/-1% | pass |
| Liftoff mass (context only) | 320,000 kg | 322,903 kg | +0.9% | - | context |

### Blue Origin New Shepard

Result: FAILURE - Time limit reached. Orbit -6,368.7 km x 7.2 km. 4 of 5 graded rows within their band, 1 outside.

| What | Published | Simulated | Error | Band | Result |
|---|---|---|---|---|---|
| Launch mass | 35,000 kg | 35,001 kg | +0.0% | +/-5% | pass |
| Liftoff thrust (sea level) | 490.0 kN | 491.0 kN | +0.2% | +/-5% | pass |
| Main engine cutoff (burn time) | 141.0 s | 139.8 s | -0.9% | +/-10% | pass |
| Apogee (above the Karman line) | 106.0 km | 109.4 km | +3.2% | +/-10% | pass |
| Maximum ascent speed | 991 m/s | 1,303 m/s | +31.5% | +/-10% | **FAIL** |

## Real missions (new in 2.0)
Open **Validation > Does it match real missions?** or run `node --test tests/mission-validation.test.js tests/apollo.test.js`. The code is in `src/core/mission-validation.js`; each row carries its source and link.

### Orbits and escape speeds: 8 of 8 pass
| What | Published | Simulated | Error |
|---|---|---|---|
| ISS orbit time at 420 km | 92.9 min | 93.0 min | +0.08% |
| Geostationary height | 35,786 km | 35,786 km | 0.00% |
| Escape speed, Earth | 11.186 km/s | 11.180 km/s | -0.05% |
| Escape speed, Mars | 5.027 km/s | 5.027 km/s | 0.00% |
| Escape speed, Moon | 2.38 km/s | 2.376 km/s | -0.18% |
| Moon orbit period | 27.32 d | 27.28 d | -0.14% |
| 300 km to GEO delta-v | 3.89 km/s | 3.893 km/s | +0.07% |
| Earth to Mars trip vs Curiosity cruise | 254 d | 258.9 d | +1.9% (band 10%) |

### Curiosity (MSL) landing on Mars: 1 of 2 graded rows pass
| What | Published | Simulated | Error | Result |
|---|---|---|---|---|
| Parachute opens, time after entry | 259.2 s | 263.5 s | +1.7% | pass |
| Touchdown, time after entry | 431.6 s | 388.3 s | -10.0% | **FAIL** (just outside the 10% band) |
| Height at parachute (context) | about 10 km | 9.5 km | -5% | context |
| Speed at parachute (context) | about 470 m/s | 428 m/s | -9% | context |

Version 2.0 added the heat-shield jettison (385 kg, 20 s after the chute) and starts powered descent at 1.6 km. The remaining 43 s gap is the real descent's divert manoeuvre and the sky-crane phase (a slow 0.75 m/s lowering), which the model does not fly. The test keeps this row honest: it must stay within 15%.

### Apollo 11 timeline: 9 of 9 pass (band 10%)
Source: Apollo 11 Mission Report (MSC-00171).
| Event | Published | Simulated | Error |
|---|---|---|---|
| TLI cutoff | 2:50:03 | 2:50:53 | +0.5% |
| LOI-1 cutoff | 75:55:48 | 74:40:36 | -1.7% |
| LOI-1 burn size | 889 m/s (2,917 ft/s) | 881 m/s | -0.9% |
| Lunar landing | 102:45:40 | 103:10:24 | +0.4% |
| Docking | 128:03:00 | 124:30:37 | -2.8% |
| TEI burn size | 1,000.8 m/s (3,283.6 ft/s) | 995.5 m/s | -0.5% |
| Entry interface | 195:03:06 | 192:09:02 | -1.5% |

The 1.9 trip home planned the fastest return (a 1,400 m/s TEI). 2.0 plans the published 59.9 h coast instead (`planTransEarth` takes `tofTarget`), so the burn size now follows from the physics and matches the report.

### Orbit drift from the Earth's shape (J2): 2 of 2 pass (new in 2.1)
A satellite is flown for one day in the main simulator with **precise gravity** on, and the turning of its orbit plane is measured from the telemetry (`src/core/mission-validation.js`, case `precession`).
| What | Published | Simulated | Error |
|---|---|---|---|
| Sun-synchronous orbit (700 km, 98.2 deg): plane turns with the Sun | +0.9856 deg/day (one turn per year) | +0.9851 deg/day | -0.06% |
| Space station orbit (420 km, 51.6 deg): plane turns backwards | about -5.0 deg/day | -4.97 deg/day | -0.7% |

This check found a real error: in 1.9 and 2.0 the precise-gravity (J2) term was divided by one extra factor of the orbit radius, so it was about seven orders of magnitude too weak and did nothing. The setting was off by default, so no earlier result changed. It is fixed in 2.1, and the check above now guards it.

### Weather (new in 2.1)
Wind, gusts and the air density can be set per project (Mission Planner, Environment). They are off by default, so every earlier result is unchanged. There is no published flight to compare a wind model with, so it is tested for behaviour instead (`tests/v21.test.js`): no wind gives the same result as before, the same seed gives the same flight, another seed another one, a denser air gives a higher dynamic pressure, and the wind vector points the way its compass direction says. Wind makes a rocket a lot more likely to break (the model checks bending load from the angle of attack), as it does for real sounding rockets and launch windows. The wind profile is a simple jet stream (20% at the ground, strongest at 12 km, gone by 26 km), not a measured one.

## Honest disagreements
- Saturn V Max-Q altitude was 16% low (11.0 vs 13.2 km) in 2.3 and no pitch table, thrust or drag change moved it. The cause (found in 2.4) was the atmosphere: Max-Q sits where the air thins as fast as the speed grows, and the standard atmosphere puts that at 11 km. A warm Florida summer day (AFGL tropical atmosphere, selectable in a flight as `environment.atmosphereProfile: 'tropical'`) puts it at 13 km. The Saturn V validation flight uses that day; the pitch table was refitted for it. The real launch-day sounding is not in the sources used, so the tropical profile is a stand-in, not that day's data.
- Vega: the three solid stages burn for their published times, but the published 1,430 kg does NOT reach a 700 km polar orbit in this model (the flight ends at about 388 x 1,068 km). The AVUM pushes with 2.45 kN and the real flight uses two burns with a long coast; a one-burn flight and a fitted two-burn flight both failed.
- PSLV-XL: all four graded rows pass and the low point reaches 197 km, but the single-burn flight ends at about 197 x 282 km (the real PS4 burns twice). Stage empty masses except the first-stage case are estimates.
- New Shepard: the apogee now matches (+3%) because the average throttle after 16 s (91.5 %) was tuned to it; that value is not published. The top speed is still about 31% high (1,303 m/s against 991 m/s).
- Saturn V S-II and S-IVB burn longer than published (+7%) because the model's thrust and the staging order differ in detail; the final speed still matches.
- Falcon 9 height was 13.7% over the published 70 m in 1.9. Version 2.0 corrects the fairing (9.1 m cylinder plus the nose, the published 13.1 m includes the nose) and refits the pitch table, so all 8 rows now pass (+8.1% height).
- Electron burns end 16 to 24% early. The model uses constant thrust and a fitted pitch table, and the stage masses are estimates, so the burn times are not reproduced. The orbit is reached anyway.
- Curiosity touches down 43 s early (see above): no divert manoeuvre and no sky-crane phase.

- Atlas V: since 2.4 the RD-180 throttles back (to 82% after 115 s) so the core burns for the published 253 s; the throttle value is tuned, not published. The single-burn flight reaches the 185 km low point but its high point overshoots (about 182 x 427 km), because the real Centaur burns twice; the simulator therefore grades the flight FAILURE even though all three rows pass.
- Ariane 5 ECA: both burn times are within 4% but the payload row is only the necessary condition (200 km orbit, not GTO), and the solid-booster Isp is assumed.
- New Shepard (older note, see above): the page does not give Isp, propellant or dry mass, so they were assumed or derived; the 2.5 throttle tuning is what makes the apogee match.

## Where the model is simplified
Point-mass gravity (J2 off by default), spherical Earth, US 1976 atmosphere, drag from a Mach-based table, constant engine thrust and Isp with a linear pressure correction, no wind, no structural flex, no engine throttling (only the Saturn S-IC centre-engine cutoff is modelled, since 2.3), instantaneous staging with a fixed delay. Each vehicle card on the page lists its own extra simplifications.

## How to refit a pitch table
`STEP=4 node scripts/validation-fit.mjs falcon-9 30` (coordinate descent, minimises orbit error), then paste the printed FINAL table into `flight.pitch` in the data file.
