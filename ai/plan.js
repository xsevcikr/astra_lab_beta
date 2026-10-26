// Design plans: a list of structured tool calls that the AI proposes. Nothing changes until the user approves.
// Preview = dry run of every call on a throw-away copy of the project, so the user sees the real resulting numbers first.
import { Project } from '../src/core/project.js';
import { ToolAPI, ToolContext, vehicleSummary } from './toolapi.js';
import { TOOL_BY_NAME } from './toolspec.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
let planCounter = 0;

export class Plan {
  constructor({ title, rationale = '', calls, kind = 'design', builder = null, expected = null }) {
    this.id = `plan${++planCounter}`;
    this.title = title; this.rationale = rationale; this.kind = kind;
    this.calls = calls.map((c) => ({ tool: c.tool, args: clone(c.args ?? {}), why: c.why ?? '' }));
    this.builder = builder;          // {kind, spec}: lets a natural-language edit regenerate the calls
    this.expected = expected;        // what the AI expects (never presented as a result)
    this.status = 'pending';         // pending | applied | cancelled | failed
    this.created = new Date().toISOString();
  }
}

export function cloneProjectForPreview(project) {
  const p = new Project(project.name);
  p.applyDesignState(project.designState());
  p.settings = clone(project.settings);
  p.memory = clone(project.memory);
  return p;
}

/** Dry run. Returns {ok, steps:[{tool, args, why, ok, message}], summary (of the resulting active vehicle), before, issues}. */
export async function previewPlan(session, plan) {
  const clonedProject = cloneProjectForPreview(session.project);
  const ctx = new ToolContext({ project: clonedProject, storage: null });
  const api = new ToolAPI(ctx);
  const before = session.project.vehicle ? safeSummary(session.project.vehicle) : null;
  const steps = [];
  let allOk = true;
  for (const c of plan.calls) {
    if (!TOOL_BY_NAME[c.tool]?.mutates) { steps.push({ ...c, ok: false, message: `${c.tool} is not a design-changing tool and cannot be part of a plan.` }); allOk = false; break; }
    const r = await api.execute(c.tool, c.args);
    steps.push({ tool: c.tool, args: c.args, why: c.why, ok: r.ok, message: r.message });
    if (!r.ok) { allOk = false; break; }
  }
  const v = clonedProject.vehicle;
  let summary = null, issues = [];
  if (v) { summary = safeSummary(v); try { issues = api.issues(v).map((i) => ({ severity: i.severity, code: i.code, message: i.message })); } catch { /* ignore */ } }
  return { planId: plan.id, ok: allOk, steps, summary, before, issues, mission: clonedProject.mission ? { name: clonedProject.mission.name, objective: clonedProject.mission.objective, events: clonedProject.mission.events.length } : null };
}
const safeSummary = (v) => { try { return vehicleSummary(v); } catch { return { name: v.name, type: v.type }; } };

/** Apply for real, as one undo step. If any call fails the whole design state is rolled back. */
export async function applyPlan(session, plan) {
  const P = session.project;
  const backup = P.designState();
  const results = [];
  for (const c of plan.calls) {
    const r = await session.api.execute(c.tool, c.args);
    results.push({ tool: c.tool, ok: r.ok, message: r.message, data: r.data });
    if (!r.ok) { P.applyDesignState(backup); plan.status = 'failed'; return { ok: false, results, error: `Step ${c.tool} failed: ${r.message}. Nothing was changed.` }; }
  }
  P.commit(plan.title, { plan: plan.id });
  plan.status = 'applied';
  return { ok: true, results };
}
