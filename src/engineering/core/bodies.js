// Celestial body data (public IAU/JPL values, rounded). Extend with registerBody().
import { AU } from './constants.js';

const BODIES = new Map();
export function registerBody(b) {
  for (const k of ['id', 'mu', 'radius']) if (b[k] === undefined) throw new Error(`body missing ${k}`);
  BODIES.set(b.id, Object.freeze({ rotationRate: 0, atmosphere: null, parent: null, sma: 0, ...b }));
  return BODIES.get(b.id);
}
export function getBody(id) {
  const b = BODIES.get(id);
  if (!b) throw new Error(`unknown body "${id}"`);
  return b;
}
export const listBodies = () => [...BODIES.values()];

registerBody({ id: 'sun', name: 'Sun', mu: 1.32712440018e20, radius: 6.957e8 });
registerBody({ id: 'earth', name: 'Earth', mu: 3.986004418e14, radius: 6378137, rotationRate: 7.2921159e-5, atmosphere: 'earth', parent: 'sun', sma: 1.0 * AU, j2: 1.08263e-3, surfaceGravity: 9.80665 });
registerBody({ id: 'moon', name: 'Moon', mu: 4.9028e12, radius: 1737400, rotationRate: 2.6617e-6, parent: 'earth', sma: 3.844e8, surfaceGravity: 1.62 });
registerBody({ id: 'mars', name: 'Mars', mu: 4.282837e13, radius: 3389500, rotationRate: 7.088218e-5, atmosphere: 'mars', parent: 'sun', sma: 1.523679 * AU, surfaceGravity: 3.721 });

// Sphere of influence radius (Laplace), used for patched conics.
export function soiRadius(id) {
  const b = getBody(id);
  if (!b.parent) return Infinity;
  return b.sma * Math.pow(b.mu / getBody(b.parent).mu, 0.4);
}
