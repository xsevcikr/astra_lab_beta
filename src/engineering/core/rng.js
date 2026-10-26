// Seeded random numbers so every Monte Carlo run is reproducible from its seed.
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => { // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = (mean = 0, sd = 1) => {
    if (spare !== null) { const z = spare; spare = null; return mean + sd * z; }
    let u = 0, v = 0;
    while (u === 0) u = next();
    v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  };
  return {
    next, normal,
    uniform: (a = 0, b = 1) => a + (b - a) * next(),
    triangular(a, c, b) {
      const u = next(), f = (c - a) / (b - a);
      return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    },
    bernoulli: (p) => next() < p,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    fork: () => makeRng(Math.floor(next() * 4294967295)),
    getState: () => ({ s, spare }),
    setState: (st) => { s = st.s >>> 0; spare = st.spare; },
    _isRng: true,
  };
}
