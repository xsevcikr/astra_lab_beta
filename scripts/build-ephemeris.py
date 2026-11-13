#!/usr/bin/env python3
"""Build physics/ephemeris-data.js: a compact, offline Chebyshev fit of the JPL DE440 ephemeris.

Usage (one-off, by a maintainer; the app itself never needs Python or the network):
    pip install numpy jplephem
    python3 scripts/build-ephemeris.py /path/to/de440s.bsp

de440s.bsp is the official JPL short-span DE440 kernel (1849-2150), from
https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
(32,726,016 bytes, MD5 3917ee56769db332790c751e2168843d). This script checks the size and MD5 before using it.

What is written
  * Time argument: TDB seconds after J2000.0 (JD 2451545.0 TDB), the simulator's epoch.
  * Frame: the J2000 mean ecliptic and equinox (the app's root frame): ICRF/EME2000 vectors rotated about x by the
    IAU 2006 obliquity 84381.448 arcsec.
  * Series (all positions in metres, velocities come from the derivative of the polynomial):
        moon     geocentric Moon                  (DE440: 301 - 399)  16-day intervals, degree 15, stored as Int32 metres
        emb      heliocentric Earth-Moon bary.    (3 - 10)            64-day intervals, degree 10, Float64
        mars     heliocentric Mars barycentre     (4 - 10)
        venus    heliocentric Venus barycentre    (2 - 10)
        jupiter  heliocentric Jupiter barycentre  (5 - 10)
        saturn   heliocentric Saturn barycentre   (6 - 10)
    Earth itself is EMB - moon / (1 + EMRAT), exactly how DE440 places it.
  * Coverage: 1950-01-01 to 2100-01-01 TDB.
  * Every series is checked against the kernel at 60 points in each of ~200 intervals; the worst error is written next
    to the data (maxErrorM) and the script fails if a tolerance is missed.
It also writes tests/fixtures/de440-checkpoints.json: exact DE440 states at fixed epochs, used by the tests.
"""
import base64, hashlib, json, os, sys
import numpy as np
from numpy.polynomial import chebyshev as C
from jplephem.spk import SPK

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J2000 = 2451545.0
JD0, JD1 = 2433282.5, 2488069.5            # 1950-01-01 .. 2100-01-01 (TDB)
EMRAT = 81.3005682214972154                  # DE440 Earth/Moon mass ratio
EPS = np.radians(84381.448 / 3600)           # IAU 2006 obliquity of the ecliptic at J2000
ROT = np.array([[1, 0, 0], [0, np.cos(EPS), np.sin(EPS)], [0, -np.sin(EPS), np.cos(EPS)]])   # equatorial -> ecliptic

SERIES = [  # name, target, centre, interval [days], degree, storage, tolerance [m]
    ('moon', 301, 399, 16, 15, 'i32', 60),
    ('emb', 3, 10, 64, 10, 'f64', 150),
    ('mars', 4, 10, 128, 10, 'f64', 1000),
    ('venus', 2, 10, 128, 11, 'f64', 5000),
    ('jupiter', 5, 10, 512, 19, 'f64', 5000),
    ('saturn', 6, 10, 512, 19, 'f64', 5000),
]


def check_kernel(path):
    size = os.path.getsize(path)
    md5 = hashlib.md5(open(path, 'rb').read()).hexdigest()
    if size != 32726016 or md5 != '3917ee56769db332790c751e2168843d':
        sys.exit(f'{path} is not the official de440s.bsp (size {size}, md5 {md5})')
    return md5


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    md5 = check_kernel(sys.argv[1])
    k = SPK.open(sys.argv[1])

    def ssb(body, jd):                       # km, ICRF, relative to the solar-system barycentre
        if body in (301, 399):
            return k[3, body].compute(jd) + k[0, 3].compute(jd)
        return k[0, body].compute(jd)

    def state(target, centre, jd):           # metres, ecliptic
        return ROT @ (ssb(target, jd) - ssb(centre, jd)) * 1000.0

    out = {}
    for name, target, centre, L, N, store, tol in SERIES:
        edges = np.arange(JD0, JD1 - 1e-9, L)
        nodes = np.cos(np.pi * (np.arange(N + 1) + 0.5) / (N + 1))
        coefs = np.zeros((len(edges), 3, N + 1))
        for j, a in enumerate(edges):
            p = state(target, centre, a + (nodes + 1) / 2 * L)
            for c in range(3):
                coefs[j, c] = C.chebfit(nodes, p[c], N)
        if store == 'i32':
            coefs = np.round(coefs)
            assert np.abs(coefs).max() < 2 ** 31
        # verify against the kernel
        worst = 0.0
        x = np.linspace(-1, 1, 60)
        for j in range(0, len(edges), max(1, len(edges) // 200)):
            q = state(target, centre, edges[j] + (x + 1) / 2 * L)
            e = np.sqrt(sum((C.chebval(x, coefs[j, c]) - q[c]) ** 2 for c in range(3))).max()
            worst = max(worst, e)
        if worst > tol:
            sys.exit(f'{name}: fit error {worst:.1f} m > {tol} m')
        raw = coefs.astype('<i4' if store == 'i32' else '<f8').tobytes()
        out[name] = {
            'target': target, 'centre': centre, 't0': (JD0 - J2000) * 86400.0, 'interval': L * 86400.0, 'degree': N,
            'count': len(edges), 'type': store, 'maxErrorM': round(worst, 1), 'data': base64.b64encode(raw).decode('ascii'),
        }
        print(f'{name:8s} {len(edges):5d} x {L:4d} d, degree {N:2d}, {store}, {len(raw) / 1024:7.1f} KiB, max error {worst:8.1f} m')

    meta = {
        'source': 'JPL DE440 (de440s.bsp, MD5 ' + md5 + '), Park et al. 2021, AJ 161:105, doi:10.3847/1538-3881/abd414',
        'timeScale': 'TDB seconds after J2000.0', 'frame': 'J2000 mean ecliptic and equinox (ICRF rotated by 84381.448")',
        'units': 'm', 'emrat': EMRAT, 'start': (JD0 - J2000) * 86400.0, 'stop': (JD1 - J2000) * 86400.0,
        'startIso': '1950-01-01T00:00:00 TDB', 'stopIso': '2100-01-01T00:00:00 TDB',
    }
    js = ['// GENERATED by scripts/build-ephemeris.py from the JPL DE440 kernel de440s.bsp. Do not edit by hand.',
          '// Chebyshev coefficients (base64, little endian) per interval and axis; read by physics/ephemeris.js.',
          'export const EPHEMERIS_META = ' + json.dumps(meta) + ';',
          'export const EPHEMERIS_SERIES = {']
    for name, s in out.items():
        js.append(f'  {name}: ' + json.dumps(s) + ',')
    js.append('};')
    open(os.path.join(ROOT, 'physics', 'ephemeris-data.js'), 'w').write('\n'.join(js) + '\n')

    # exact checkpoints for the tests (independent of the fit)
    rng = np.random.default_rng(440)
    jds = sorted(set([2440419.0639, J2000, 2460676.5]) | set(np.round(rng.uniform(JD0 + 1, JD1 - 1, 40), 4)))
    pts = []
    for jd in jds:
        row = {'tdb': (jd - J2000) * 86400.0}
        for name, target, centre, *_ in SERIES:
            def pv(tg, ce):
                if tg in (301, 399):
                    pa, va = k[3, tg].compute_and_differentiate(jd); pb, vb = k[0, 3].compute_and_differentiate(jd)
                    pa, va = pa + pb, va + vb
                else:
                    pa, va = k[0, tg].compute_and_differentiate(jd)
                if ce in (301, 399):
                    pc, vc = k[3, ce].compute_and_differentiate(jd); pd, vd = k[0, 3].compute_and_differentiate(jd)
                    pc, vc = pc + pd, vc + vd
                else:
                    pc, vc = k[0, ce].compute_and_differentiate(jd)
                return ROT @ (pa - pc) * 1000.0, ROT @ (va - vc) * 1000.0 / 86400.0
            p, v = pv(target, centre)
            row[name] = {'r': [round(float(c), 1) for c in p], 'v': [round(float(c), 5) for c in v]}
        p, v = pv(399, 10)
        row['earth'] = {'r': [round(float(c), 1) for c in p], 'v': [round(float(c), 5) for c in v]}
        pts.append(row)
    os.makedirs(os.path.join(ROOT, 'tests', 'fixtures'), exist_ok=True)
    json.dump({'source': meta['source'], 'frame': meta['frame'], 'timeScale': meta['timeScale'], 'points': pts},
              open(os.path.join(ROOT, 'tests', 'fixtures', 'de440-checkpoints.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
