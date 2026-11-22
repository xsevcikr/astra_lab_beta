# Time scales and ephemerides

## The simulator epoch

Every body position, and the `epoch` stored in a project's environment, is **TDB seconds after J2000.0**
(2000-01-01 12:00:00 TDB, JD 2451545.0). Older projects stored the same number without naming a scale; they load unchanged, so
an epoch of 0 is still J2000.0. To get the epoch of a calendar date use `utcToEpoch('1969-07-16T13:32:00Z')`
(physics/time.js); to show an epoch as a date use `epochToUtcIso(t)`.

## Time scales (physics/time.js)

| Scale | How it is computed | Accuracy |
| --- | --- | --- |
| UTC | from TAI with the IERS leap-second table (10 s in 1972 ... 37 s since 2017-01-01) and the 1961-1971 rubber-second formulas of USNO `tai-utc.dat`. Before 1961 UTC is taken as UT1. Leap seconds (`23:59:60`) parse and print. | exact |
| TAI | reference scale | exact |
| TT | TAI + 32.184 s | exact |
| TDB | TT + periodic terms of Fairhead & Bretagnon (USNO Circular 179, eq. 2.6), max 1.7 ms | ~10 µs |
| GPS | TAI − 19 s | exact |
| UT1 | TT − ΔT, ΔT from a yearly table (1961-2026), held constant after 2026; or UTC + DUT1 after `setDut1(x)` | ~0.1 s (table), exact with DUT1 |

`convertTime(t, from, to)` converts between any two scales; `t` counts seconds after 2000-01-01T12:00:00 on that scale's own clock
(for UTC like Unix time, without leap seconds inside). New leap seconds can be added with `addLeapSecond('YYYY-MM-DD', taiMinusUtc)`.

Earth rotation: `earthRotationAngle(t)` is the IAU 2000 Earth rotation angle of UT1; `gmst(t)` the IAU 2006 Greenwich mean sidereal
time. `rotationAngle('earth', t)` in physics/bodies.js uses the ERA, so launch-site longitudes line up with the real Earth at the
real date (before, the ~69 s TT−UT1 difference left the Earth 0.29° mis-rotated).

## Ephemerides (physics/ephemeris.js)

Positions of the Earth, Moon and Mars come from **JPL DE440** (Park et al. 2021, AJ 161:105). The bundled file
`physics/ephemeris-data.js` (1.6 MB, no network needed) is a Chebyshev fit of the official short-span kernel `de440s.bsp`, made by
`scripts/build-ephemeris.py`:

| Series | DE440 bodies | Interval, degree | Max error vs DE440 |
| --- | --- | --- | --- |
| moon (geocentric) | 301 − 399 | 16 d, 15 | 36 m |
| emb (heliocentric) | 3 − 10 | 64 d, 10 | 89 m |
| mars | 4 − 10 | 128 d, 10 | 0.6 km |
| venus | 2 − 10 | 128 d, 11 | 2.6 km |
| jupiter, saturn | 5, 6 − 10 | 512 d, 19 | 4.8 km |

The Earth is EMB − Moon/(1 + EMRAT), exactly as in DE440. Coverage is 1950-01-01 to 2100-01-01 TDB. Axes are the J2000 mean
ecliptic (ICRF rotated by the IAU 2006 obliquity 84381.448″), which is the app's root frame. Velocities are the derivative of the
fitted polynomials.

Outside 1950-2100, or after `setEphemerisModel('kepler')`, physics/bodies.js uses the old mean Kepler elements and uniform Earth
rotation (useful only to reproduce runs from 2.8 and earlier). These were badly off: compared with DE440 the Kepler Moon was
6,500 km away at J2000 and on the far side of its orbit by 2005, and Mars was 0.3 million km off by 2026.

### Checks

* `tests/time-ephemeris.test.js` compares the fit with 43 exact DE440 states stored in `tests/fixtures/de440-checkpoints.json`
  (written by the same script straight from the kernel), and checks leap seconds, TAI−UTC in 1969, TDB−TT, UT1, ERA, GMST,
  the noon Sun over Greenwich (equation of time) and the 2025-01-16 Mars opposition.
* The kernel was verified by its published size and MD5 and cross-checked against the independent DE421 (Moon within 10 m,
  Earth-Moon barycentre within 0.25 km, Mars within 1.4 km over 1969-2044).

### Rebuilding the data

```
pip install numpy jplephem
python3 scripts/build-ephemeris.py /path/to/de440s.bsp
```
The script refuses any file whose size or MD5 differs from the official kernel and fails if a fit tolerance is missed.

## Not done yet

* Precession, nutation and polar motion (the Earth's axes are the J2000 equator, EME2000).
* Light time and aberration (positions are geometric).
* Official IAU prime meridians for the Moon and Mars.
