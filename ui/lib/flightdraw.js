// Helpers shared by Mission Control (live) and Replay: presence of components, HUD, draw state.
import { h, fmt, fmtTime } from './dom.js';
import { show, showKm, showAlt, showSpeed, state as unitState, detailMode } from './units.js';
import { formatSpeed, formatAltitude, formatNumber, snap } from '../../src/core/numfmt.js';
import { plainSpeed, plainLength } from '../../src/core/plain-metrics.js';
import { DebrisTrack } from '../../physics/debris.js';

/** Groups that have been removed from the vehicle at time t, from the recorded separations. */
export function removedAt(vehicle, separations, t) {
  const removed = new Set();
  const groups = [...new Set(vehicle.components.map((c) => c.group ?? '__none__'))];
  for (const s of separations ?? []) {
    if (s.t > t + 1e-9) continue;
    if (String(s.group).startsWith('deploy:')) { const keep = s.group.slice(7); for (const g of groups) if (g !== keep) removed.add(g); }
    else removed.add(s.group);
  }
  return removed;
}
export function thrustRefOf(vehicle) {
  const first = vehicle.stages?.[0]?.id;
  let t = 0; for (const c of vehicle.components) if (c.kind === 'engine' && (!first || c.group === first)) t += (c.thrustVac ?? 0) * (c.count ?? 1);
  return t || 1e5;
}

export function makeHud() {
  const cells = {};
  const el = h('div', { class: 'hud' });
  const defs = [['t', 'Mission time'], ['alt', 'Height'], ['air', 'Speed over ground'], ['speed', 'Speed in space (inertial)'], ['vs', 'Vertical speed'], ['mach', 'Mach'], ['q', 'Dyn. pressure'], ['g', 'Acceleration'], ['thrust', 'Thrust'], ['mass', 'Mass'], ['prop', 'Propellant'], ['thr', 'Throttle'], ['apo', 'Apoapsis'], ['peri', 'Periapsis'], ['pitch', 'Pitch'], ['stage', 'Stages off']];
  const BASIC = new Set(['t', 'alt', 'air', 'stage', 'prop']);
  const TIPS = { air: 'Speed relative to the launch pad and the ground below. It is 0 at T+0.', speed: 'Speed relative to the centre of the planet, not turning with it. The pad already moves with the planet’s spin, so this is not 0 at T+0.' }; // the rest is shown from Standard level up
  for (const [k, label] of defs) { const b = h('b', null, '–'); cells[k] = b; el.append(h('div', { class: BASIC.has(k) ? '' : 'std-only', 'data-k': k, title: TIPS[k] ?? '' }, h('span', null, label), b)); }
  const update = (f) => {
    if (!f) return;
    cells.t.textContent = fmtTime(f.t); cells.air.textContent = show(f.surfSpeed, 'm/s', 0); cells.thr.textContent = `${fmt(100 * (f.throttle ?? 0), 0)} %`; cells.pitch.textContent = `${fmt(f.pitch, 1)}°`; cells.stage.textContent = String(Math.round(f.stage ?? 0)); cells.alt.textContent = showAlt(f.alt); cells.speed.textContent = show(f.speed, 'm/s', 0); cells.vs.textContent = show(f.vSpeed, 'm/s', 0);
    cells.mach.textContent = fmt(snap(f.mach, 0.005), 2); cells.q.textContent = show(f.q, 'Pa', 0); cells.g.textContent = `${fmt(snap(f.gload, 0.005), 2)} g`; cells.thrust.textContent = show(f.thrust, 'N', 0);
    cells.mass.textContent = show(f.mass, 'kg', 0); cells.prop.textContent = show(f.propMass, 'kg', 0);
    cells.apo.textContent = Number.isFinite(f.apo) ? showKm(f.apo, 1) : 'escape'; cells.peri.textContent = Number.isFinite(f.peri) ? (f.peri < 0 ? 'underground' : showKm(f.peri, 1)) : '–';
  };
  return { el, update };
}

/**
 * View tools for the flight screens (2.0): "Cinema" gives the 3D view the whole screen (charts and side panel hidden, F or Esc toggles),
 * "Data" folds the telemetry HUD into one short broadcast strip. Both are remembered on this computer.
 */
export function installViewTools({ overlay, layout, hud, cockpit, onChange }) {
  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
  let cinema = get('astra.cinema', '0') === '1', compact = get('astra.hudCompact', '0') === '1', cockpitOn = get('astra.cockpit', '1') === '1';
  const bK = h('button', { class: 'vt-btn', id: 'view-cockpit', title: 'Cockpit instruments: dials, horizon, clock and event ribbon' });
  const bC = h('button', { class: 'vt-btn', id: 'view-cinema', title: 'Big 3D view: hide charts and side panel (F)' });
  const bD = h('button', { class: 'vt-btn', id: 'view-data', title: 'Show fewer or more flight numbers' });
  const apply = () => {
    layout.classList.toggle('cinema', cinema); hud?.classList.toggle('compact', compact || cinema);
    bC.textContent = cinema ? '⤡ Exit cinema' : '⤢ Cinema'; bC.classList.toggle('on', cinema);
    bD.textContent = compact || cinema ? 'More data' : 'Less data'; bD.disabled = cinema;
    layout.classList.toggle('cockpit-on', cockpitOn); if (cockpit) cockpit.hidden = !cockpitOn; bK.textContent = cockpitOn ? '◉ Cockpit' : '○ Cockpit'; bK.classList.toggle('on', cockpitOn);
    onChange?.(); window.dispatchEvent(new Event('resize'));
  };
  bC.onclick = () => { cinema = !cinema; set('astra.cinema', cinema ? '1' : '0'); apply(); };
  bK.onclick = () => { cockpitOn = !cockpitOn; set('astra.cockpit', cockpitOn ? '1' : '0'); apply(); };
  bD.onclick = () => { compact = !compact; set('astra.hudCompact', compact ? '1' : '0'); apply(); };
  const key = (e) => { if (e.target?.closest?.('input, textarea, select')) return; if (e.key === 'f' || e.key === 'F' || (e.key === 'Escape' && cinema)) { bC.click(); } };
  window.addEventListener('keydown', key);
  overlay.append(h('div', { class: 'view-tools' }, ...(cockpit ? [bK] : []), bD, bC));
  apply();
  return () => window.removeEventListener('keydown', key);
}

/** The tracks of all jettisoned hardware of a run (live or recorded). Tracks are built lazily and cached. */
export class DebrisSet {
  constructor() { this.tracks = new Map(); }
  sync(separations) {
    for (const sp of separations ?? []) {
      if (!sp.debris) continue;
      const key = `${sp.debris.id}@${sp.debris.t0}`;
      if (!this.tracks.has(key)) this.tracks.set(key, new DebrisTrack(sp.debris));
      if (sp.reattachedAt != null) this.tracks.get(key).reattachedAt = sp.reattachedAt;   // docked again: drawn as part of the vehicle
    }
    return this;
  }
  clear() { this.tracks.clear(); }
  /** state passed to the 3D view: tracks and the mission time to evaluate them at */
  forView(t) { return { tracks: [...this.tracks.values()], t }; }
}

/**
 * The simple HUD for Beginners: speed, height, fuel, push (g) and flight phase. Big numbers, few words.
 * update(frame, phaseLabel, fuelFrac, active)   active = { label, frac, pushG, burning } from Simulation.activeFuel(): the stage or vehicle that is burning or next to burn
 */
export function makeSimpleHud() {
  const mk = (label) => { const v = h('span', { class: 'fd-hud-v' }, '–'); return { v, cell: h('div', { class: 'fd-hud-cell' }, h('div', { class: 'fd-hud-l' }, label), v) }; };
  const speed = mk('Speed'), height = mk('Height'), fuel = mk('Fuel'), gee = mk('Push'), phase = mk('Now');
  const bar = h('i'); fuel.cell.append(h('div', { class: 'fd-fuel-bar' }, bar));
  phase.cell.classList.add('fd-hud-phase');
  const el = h('div', { class: 'fd-hud beginner-only', id: 'fd-hud' }, speed.cell, height.cell, fuel.cell, gee.cell, phase.cell);
  const fuelLabel = fuel.cell.querySelector('.fd-hud-l'), pushLabel = gee.cell.querySelector('.fd-hud-l');
  const unitSpan = (txt, u) => { const s = h('span'); s.append(txt, h('small', null, u)); return s; };
  const update = (f, phaseLabel, fuelFrac, active = null) => {
    if (!f) return; const imp = unitState.system === 'imperial';
    // Speed relative to the ground (0 at T+0). The speed in space (inertial) is in the Standard / Advanced panel.
    const sp = plainSpeed(snap(f.surfSpeed ?? f.speed, 0.005), imp), al = plainLength(snap(Number.isFinite(f.radarAlt) && f.radarAlt < 6e4 ? Math.max(0, f.radarAlt) : f.alt, 0.01), imp);
    speed.v.replaceChildren(unitSpan(formatNumber(sp.value, { digits: 0, mode: 'beginner' }), sp.unit));
    height.v.replaceChildren(unitSpan(al.text.split(' ')[0], al.unit));
    gee.v.replaceChildren(unitSpan(formatNumber(Math.round(snap(f.gload ?? 0, 0.05) * 10) / 10, { digits: 1, mode: 'beginner' }).replace(/^0$/, '0.0'), 'g'));
    if (Number.isFinite(fuelFrac)) { const pc = Math.round(Math.max(0, Math.min(1, fuelFrac)) * 100); fuel.v.replaceChildren(unitSpan(String(pc), '%')); bar.style.width = `${pc}%`; bar.style.background = pc < 10 ? 'var(--bad)' : pc < 25 ? 'var(--warn)' : 'var(--ok)'; }
    if (active) {   // per stage and per vehicle: the readouts follow the stage or spacecraft that is active
      const pc = Number.isFinite(active.frac) ? Math.round(Math.max(0, Math.min(1, active.frac)) * 100) : 0;
      fuelLabel.textContent = `Fuel: ${active.label}`; fuel.v.replaceChildren(unitSpan(String(pc), '%')); bar.style.width = `${pc}%`; bar.style.background = pc < 5 ? 'var(--bad)' : pc < 15 ? 'var(--warn)' : 'var(--ok)';
      pushLabel.textContent = active.burning ? 'Push now' : `Push ready: ${active.label}`;
      gee.v.replaceChildren(unitSpan(formatNumber(Math.round((active.burning ? (f.gload ?? 0) : active.pushG) * 10) / 10, { digits: 1, mode: 'beginner' }).replace(/^0$/, '0.0'), 'g'));
    } else { fuelLabel.textContent = 'Fuel'; pushLabel.textContent = 'Push'; }
    phase.v.textContent = phaseLabel ?? '';
  };
  return { el, update };
}
