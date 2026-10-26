// Parameter sweeps over a model input or over any vehicle design path.
import { nominalOf } from './uncertainty.js';
import { cloneVehicle, setPath, getPath } from '../vehicle/model.js';

export function sweepModel(model, paramId, from, to, n = 20, { seed = 99 } = {}) {
  const base = nominalOf(model.params);
  return Array.from({ length: n }, (_, i) => {
    const v = from + (to - from) * i / Math.max(1, n - 1);
    const r = model.run({ ...base, [paramId]: v }, seed);
    return { value: v, success: r.success, failureMode: r.failureMode, ...r.metrics };
  });
}

// evaluate(vehicle) -> { success, metrics }
export function sweepVehicle(vehicle, path, from, to, n, evaluate) {
  if (getPath(vehicle, path) === undefined) throw new Error(`vehicle has no parameter ${path}`);
  return Array.from({ length: n }, (_, i) => {
    const v = from + (to - from) * i / Math.max(1, n - 1);
    const veh = setPath(cloneVehicle(vehicle), path, v);
    const r = evaluate(veh);
    return { value: v, success: r.success, failureMode: r.failureMode, ...r.metrics };
  });
}
