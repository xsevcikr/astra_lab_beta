# ASTRA LAB 2.7: fixes from the engineering audit

This release answers the audit of 2026-11-06 (the "ASTRA LAB engineering audit" document). Each item says what was wrong, what changed, and where.

## Fixed
| Audit finding | Change | Where |
|---|---|---|
| Earth's equator and orbit were the same plane (no seasons) | The root frame is now the J2000 ecliptic. Each body has its own spin-axis frame from its IAU pole; the Earth is tilted 23.44 deg. Sun direction, eclipses, solar power and heating now follow the real seasons. | `physics/bodies.js` (`frame`, `fromRoot`, `toRoot`, `convertFrame`), `physics/simulation.js` |
| The Moon's 5.145 deg inclination was measured from the Earth's equator | The Moon's elements are referred to the ecliptic, so its orbit is 18 to 29 deg from the equator. The node regresses (18.6 years) and the perigee advances. Mean anomaly at J2000 corrected to 134.963 deg. | `physics/bodies.js` |
| No Earth orientation, GMST 0 at J2000 | Earth rotation angle at J2000 is 280.46 deg, so ground tracks and exported files match the real sky. | `physics/bodies.js` `rotationAngle` |
| Sphere-of-influence jumps mixed up axes | State, attitude and held pointing directions are converted between the axes of the two bodies. | `physics/simulation.js` `_soiTransitions`, `_reframeAttitude` |
| Drag ended at 150 km; coast ignored drag | Drag is computed to 1000 km (`dragHeight`), also in the long coast steps (Cd 2.2 on the end-on area). The 150 km limit still decides what counts as a stable orbit. | `physics/atmosphere.js`, `physics/bodies.js`, `physics/simulation.js` |
| Engineering screen had a second, wrong upper atmosphere | It now uses the main US76 table above 86 km (it was 13 orders of magnitude too thin at 400 km). Mars gas constant 191.8 -> 188.92. | `src/engineering/core/atmosphere.js` |
| No aerodynamic pitch damping | Added the moment -1/2 rho V S CNalpha arm^2 w about the centre of gravity. | `physics/simulation.js` `_evalForces` |
| Precise gravity was J2 only; no third body | New J3 and J4 (checked against the gradient of the potential) and a switch `thirdBody` for the Sun and Moon (Earth) or Sun and Earth (Moon). | `physics/gravity.js`, `settings.thirdBody` |
| Validation counted typed-in numbers and fitted flights as predictions | The Validation screen now shows computed numbers apart from build checks, says when a pitch programme was fitted to the same flight, shows a failed flight in red and shows context rows that miss by more than 15 %. | `src/core/validation.js` `splitSummary`, `ui/screens/validation.js` |

## Changed because of the new geometry
* The Moon rockets and the Apollo plan were found again for the real Moon plane (`data/moon-plans.js`, `data/apollo-plans.js`). The Apollo launch now looks 60 days ahead (was 29) and prefers a trip of about 73 h; the trip home is planned for 70 h (about 1,050 m/s) because the 59.9 h trip needs 1,150 m/s at that date.
* `documentation/VALIDATION.md` and `data/validation-summary.js` were regenerated.

## Tried and reverted
* Moving the centre of pressure of the body from mid-length to the nose (Barrowman). It made Falcon 9 and Soyuz crash in validation, and real tall launchers have their centre of pressure near mid-length (Saturn V about 0.48 L). Kept at 0.5 L; a per-vehicle aero database is still needed.

## Not done yet (still on the roadmap)
UTC/TT/TDB time scales and precession-nutation, JPL DE440 ephemerides, spherical-harmonic gravity beyond J4, solar radiation pressure, NRLMSISE-00, Powered Explicit Guidance, sensor and Kalman-filter models, radiative entry heating and ablation, multi-node thermal, optimisation, and the credibility framework (NASA-STD-7009A).
