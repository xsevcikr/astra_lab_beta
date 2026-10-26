// One source of truth for "does the active vehicle, the active mission and the selected flight belong together?"
// Pure functions work on a Project; syncMission() changes the project (through the same tool API the AI uses) and re-checks the result.
import { missionNeedsType, missionKindFor, launchChecklist } from './needs.js';

const WORD = { rocket: 'rocket', lander: 'lander', rover: 'rover', probe: 'probe', satellite: 'satellite', spacecraft: 'spacecraft' };
export const vehicleWord = (type) => WORD[type] ?? type ?? 'vehicle';

/** True when the mission can be flown by this vehicle type. A mission that is open to any vehicle always matches. */
export function missionSuits(vehicle, mission) {
  if (!vehicle || !mission) return false;
  const need = missionNeedsType(mission);
  if (need) return need === vehicle.type;
  // an open mission (probe operations, orbit raising...) is for spacecraft, never for a launcher, lander or rover
  return !['rocket', 'lander', 'rover'].includes(vehicle.type);
}

/** {need, have} when the active mission is for another kind of vehicle, else null. */
export function mismatchOf(project) {
  const v = project?.vehicle, m = project?.mission;
  if (!v || !m || !v.components?.length) return null;
  return missionSuits(v, m) ? null : { need: missionNeedsType(m) ?? 'spacecraft', have: v.type };
}

/** Existing missions that suit the active vehicle, best first (made for this vehicle, then closest target altitude). */
export function suitableMissions(project) {
  const v = project?.vehicle; if (!v) return [];
  const want = v.meta?.targetAltitude;
  const score = (m) => (m.vehicleName === v.name ? 0 : 1) * 1e9 + (want && m.objective?.altitude ? Math.abs(m.objective.altitude - want) : 0);
  return Object.values(project.missions ?? {}).filter((m) => missionSuits(v, m)).sort((a, b) => score(a) - score(b));
}

/** Is a recorded run (a row of app.runList()) a flight of the active vehicle? Compared by name, as the run list stores. */
export const runIsCurrent = (project, runMeta) => !!(runMeta && project?.vehicle && runMeta.vehicle === project.vehicle.name);

/** The run the screens should show: the selected one if it exists, else the newest flight of the active vehicle, else the newest. */
export function pickRunId(project, selected) {
  const runs = project?.runs ?? [];
  if (selected && runs.some((r) => r.id === selected)) return selected;
  const mine = [...runs].reverse().find((r) => runIsCurrent(project, r));
  return (mine ?? runs[runs.length - 1])?.id ?? null;
}

/** Arguments for CREATE_MISSION that suit the active vehicle (the same target altitude the vehicle was sized for). */
export function newMissionArgs(vehicle) {
  const kind = missionKindFor(vehicle?.type);
  return { kind, ...(kind === 'launch' ? { altitude: vehicle?.meta?.targetAltitude ?? 200000 } : {}) };
}

/**
 * Make the active mission suit the active vehicle.
 *  1. already fine: nothing changes
 *  2. another existing mission suits: it becomes the active one
 *  3. otherwise a new one is created when `create` is true (else `needsCreate` tells the caller to offer a button)
 * The outcome is verified by running the launch checklist again: ok is true only when the "mission" group has no blocker left.
 * @returns {Promise<{changed:boolean, ok:boolean, needsCreate?:boolean, message:string, mission?:object}>}
 */
export async function syncMission(app, { create = true } = {}) {
  const P = app.project, v = P.vehicle;
  if (!v || !v.components?.length) return { changed: false, ok: true, message: '' };
  const clean = () => missionSuits(P.vehicle, P.mission) && !launchChecklist(P, {}).blocking.some((n) => n.group === 'mission');
  if (P.mission && missionSuits(v, P.mission)) return { changed: false, ok: true, message: '' };
  const hit = suitableMissions(P)[0];
  if (hit) {
    P.activeMission = hit.id; app.commit(`Goal: ${hit.name}`);
    return { changed: true, ok: clean(), message: `Goal switched to “${hit.name}”, which suits your ${vehicleWord(v.type)}.`, mission: hit };
  }
  if (!create) return { changed: false, ok: false, needsCreate: true, message: `No goal suits your ${vehicleWord(v.type)} yet.` };
  const r = await app.api.execute('CREATE_MISSION', newMissionArgs(v));
  if (!r.ok) return { changed: false, ok: false, message: r.message ?? 'Could not make a goal.' };
  app.commit(`New goal for the ${vehicleWord(v.type)}`);
  return { changed: true, ok: clean(), message: `New goal made for your ${vehicleWord(v.type)}: “${P.mission?.name}”.`, mission: P.mission };
}

export { orbitWindow, orbitTargetText, orbitResultText } from './orbit-goal.js';
