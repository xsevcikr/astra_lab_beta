# Writes small SPK kernels with CSPICE (SpiceyPy) and the states CSPICE evaluates from them, as test fixtures for src/core/spk.js.
import spiceypy as sp, numpy as np, json, os, sys
out = sys.argv[1]
rng = np.random.default_rng(7)
mu = 398600.4418
def kepler_states(t0, n, dt, a=7000.0):
    ts = t0 + np.arange(n) * dt
    w = np.sqrt(mu / a**3)
    S = []
    for t in ts:
        th = w * (t - t0)
        r = np.array([a*np.cos(th), a*np.sin(th)*np.cos(0.9), a*np.sin(th)*np.sin(0.9)])
        v = np.array([-a*w*np.sin(th), a*w*np.cos(th)*np.cos(0.9), a*w*np.cos(th)*np.sin(0.9)])
        S.append(np.concatenate([r, v]))
    return ts, np.array(S)
expect = {}
path = os.path.join(out, 'cspice-mixed.bsp')
if os.path.exists(path): os.remove(path)
h = sp.spkopn(path, 'ASTRA TEST', 200)
t0 = 8.0e8
ts, S = kepler_states(t0, 250, 60.0)  # >100 epochs so the epoch directory is used
sp.spkw13(h, -901, 399, 'J2000', ts[0], ts[-1], 'T13 HERMITE', 7, len(ts), S, ts)   # degree 7 -> window 4
sp.spkw09(h, -902, 399, 'J2000', ts[0], ts[-1], 'T09 LAGRANGE', 7, len(ts), S, ts)  # degree 7 -> window 8
sp.spkw08(h, -903, 399, 'J2000', ts[0], ts[-1], 'T08 LAGRANGE EQ', 5, len(ts), S, ts[0], 60.0)
sp.spkw12(h, -904, 399, 'J2000', ts[0], ts[-1], 'T12 HERMITE EQ', 5, len(ts), S, ts[0], 60.0)
# Chebyshev: type 2 (position) and 3 (pos+vel), random but smooth coefficients, 4 records of 1000 s
deg = 9; n = 4; intlen = 1000.0; init = t0
c2 = []; c3 = []
for i in range(n):
    c = rng.normal(size=(3, deg + 1)) / (1 + np.arange(deg + 1))**2 * 1000
    c2.extend(c.flatten())
    c6 = rng.normal(size=(6, deg + 1)) / (1 + np.arange(deg + 1))**2 * 1000
    c3.extend(c6.flatten())
sp.spkw02(h, -905, 399, 'J2000', init, init + n*intlen, 'T02 CHEB', intlen, n, deg, np.array(c2), init)
sp.spkw03(h, -906, 399, 'J2000', init, init + n*intlen, 'T03 CHEB', intlen, n, deg, np.array(c3), init)
# a chain: body -907 relative to 301 (Moon), Moon relative to 399 (type 9)
sp.spkw09(h, 301, 399, 'J2000', ts[0], ts[-1], 'MOON', 5, len(ts), S * 3, ts)
sp.spkw09(h, -907, 301, 'J2000', ts[0], ts[-1], 'LUNAR ORBITER', 5, len(ts), S * 0.3, ts)
sp.spkcls(h)
sp.furnsh(path)
pts = list(np.linspace(t0 + 1, t0 + 3990, 9)) + [t0 + 7777.7, t0 + 120.0, ts[-1] - 0.5]
for tgt in [-901, -902, -903, -904, -905, -906, -907]:
    rows = []
    for et in pts:
        if tgt in (-905, -906) and et > init + n*intlen: continue
        st, _ = sp.spkgeo(tgt, et, 'J2000', 399)
        rows.append([float(et)] + [float(x) for x in st])
    expect[str(tgt)] = rows
json.dump(expect, open(os.path.join(out, 'cspice-mixed.expected.json'), 'w'), indent=0)
print('ok', os.path.getsize(path))
