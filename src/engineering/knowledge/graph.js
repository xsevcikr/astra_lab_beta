// Engineering knowledge graph: Mission -> Vehicle -> Subsystem -> Component -> Physics model -> Requirement ->
// Test -> Telemetry -> Failure. Built from the project data so every link is real, not hand-drawn.
import { METRIC_SOURCES } from '../requirements/requirements.js';
const PHYSICS = { propulsion: 'Rocket equation, engine balance', gnc: 'Kalman navigation, E-guidance, attitude dynamics', avionics: 'Flight computer state machine', power: 'Energy balance, battery model', thermal: 'Lumped thermal network, Sutton-Graves heating', comms: 'Friis link budget, light time', structures: 'Shell buckling, beam bending', eclss: 'Consumables mass balance', recovery: 'Parachute drag, terminal velocity' };

export function buildKnowledgeGraph({ mission = 'Lunar mission', vehicles = [], requirements = [], tests = [], fmea = [], timeline = null }) {
  const nodes = new Map(), edges = [];
  const node = (id, type, label, data = {}) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, ...data }); return id; };
  const link = (a, b, rel) => edges.push({ from: a, to: b, rel });
  const m = node('mission', 'mission', mission);
  for (const v of vehicles) {
    const vid = node(`veh:${v.id}`, 'vehicle', v.name); link(m, vid, 'uses');
    for (const c of v.components || []) {
      const sid = node(`sub:${v.id}:${c.subsystem}`, 'subsystem', `${v.name} ${c.subsystem}`); link(vid, sid, 'has');
      const cid = node(`comp:${c.id}`, 'component', c.name, { vehicle: v.name }); link(sid, cid, 'contains');
      const pid = node(`phys:${c.subsystem}`, 'physics', PHYSICS[c.subsystem] || 'Generic model'); link(cid, pid, 'modelled by');
    }
  }
  for (const r of requirements) {
    const rid = node(`req:${r.id}`, 'requirement', `${r.id}: ${r.text}`);
    link(m, rid, 'must satisfy');
    for (const c of r.components) { if (nodes.has(`comp:${c}`)) link(rid, `comp:${c}`, 'allocated to'); }
    const src = METRIC_SOURCES[r.metric];
    if (src) for (const ch of src.telemetry) { const tid = node(`tlm:${ch}`, 'telemetry', ch); link(rid, tid, 'verified by'); }
  }
  for (const t of tests) { const tid = node(`test:${t.id}`, 'test', t.name, { status: t.status }); for (const r of t.requirements || []) if (nodes.has(`req:${r}`)) link(tid, `req:${r}`, 'verifies'); }
  for (const f of fmea.slice(0, 40)) { const fid = node(`fail:${f.componentId}:${f.failureMode}`, 'failure', `${f.component}: ${f.failureMode}`, { risk: f.risk }); if (nodes.has(`comp:${f.componentId}`)) link(`comp:${f.componentId}`, fid, 'can fail by'); }
  if (timeline) for (const e of timeline.events.filter((x) => x.severity === 'critical')) { const eid = node(`evt:${e.id}`, 'failure', e.text, { t: e.t }); link(m, eid, 'experienced'); if (e.component && nodes.has(`comp:${e.component}`)) link(`comp:${e.component}`, eid, 'caused'); }
  return { nodes: [...nodes.values()], edges };
}
// Everything connected to a node within `depth` hops (for "click any object to see how it connects").
export function neighbourhood(graph, id, depth = 2) {
  const seen = new Set([id]); let frontier = [id];
  for (let d = 0; d < depth; d++) { const next = []; for (const e of graph.edges) for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) if (frontier.includes(a) && !seen.has(b)) { seen.add(b); next.push(b); } frontier = next; }
  return { nodes: graph.nodes.filter((n) => seen.has(n.id)), edges: graph.edges.filter((e) => seen.has(e.from) && seen.has(e.to)) };
}
