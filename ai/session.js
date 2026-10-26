// AiSession: one conversation between the user and the AI aerospace engineer, bound to a project.
// It owns the pending design proposal (approve / edit / cancel), the memory of what was simulated last, the tool log and the
// conversation history that is saved with the project. The "brain" is either the offline engineer (always available, no key needed)
// or an optional online model (ai/llm.js) that can only act through the same structured tools.
import { Project } from '../src/core/project.js';
import { ToolAPI, ToolContext } from './toolapi.js';
import { Plan, previewPlan, applyPlan } from './plan.js';
import { OfflineEngineer } from './engineer.js';
import { detectIntent } from './nlu.js';

let msgCounter = 0;
const now = () => new Date().toISOString();

export class AiSession {
  /**
   * @param {object} o
   * @param {Project} [o.project]
   * @param {object}  [o.storage]      storage adapter (Node folder, Electron IPC or memory); needed for SAVE / LOAD
   * @param {function}[o.emit]         progress events {type:'sim-progress'|'tuning'|'experiment-progress'|'plan'|...}
   * @param {object}  [o.llm]          optional online provider (see ai/llm.js); when absent or failing the offline engineer answers
   */
  constructor({ project = null, storage = null, emit = () => {}, llm = null, settings = {} } = {}) {
    this.ctx = new ToolContext({ project: project ?? new Project('AI project'), storage, emit: (e) => this.emit(e), onProjectReplaced: (p) => this._projectReplaced(p), settings });
    this.api = new ToolAPI(this.ctx);
    this.emit = emit;
    this.llm = llm;
    this.pending = null;          // {plan, preview, then, auto}
    this.clarify = null;          // {req, id}: the request that waits for the answer to one clarifying question
    this.lastRunId = null;        // run the user is probably talking about
    this.baselineRunId = null;    // run before the last applied design change (for comparisons)
    this.fixAttempts = 0;
    this.autoBudget = 0;          // iterations the user pre-authorised ("keep trying until it works")
    this.engineer = new OfflineEngineer(this);
    this.turnCalls = [];          // tool calls made during the current turn (shown to the user)
  }
  get project() { return this.ctx.project; }
  _projectReplaced(p) { this.pending = null; this.clarify = null; this.lastRunId = null; this.baselineRunId = null; this.fixAttempts = 0; this.onProjectReplaced?.(p); }

  // ---------------------------------------------------------------- tools (logged)
  /** Run a tool through the validated tool interface and log it for the transcript. */
  async tool(name, args = {}) {
    const r = await this.api.execute(name, args);
    this.turnCalls.push({ tool: name, args, ok: r.ok, message: r.message });
    return r;
  }
  /** Tool call that is not shown to the user (internal investigation such as the fix planner's what-if flights). */
  quiet(name, args = {}) { return this.api.execute(name, args); }

  // ---------------------------------------------------------------- plans
  async propose(plan, { then = null, note = '' } = {}) {
    const preview = await previewPlan(this, plan);
    this.pending = { plan, preview, then, note };
    this.emit({ type: 'plan', planId: plan.id });
    return this.pending;
  }
  planView() {
    const p = this.pending; if (!p) return null;
    return { id: p.plan.id, title: p.plan.title, kind: p.plan.kind, rationale: p.plan.rationale, expected: p.plan.expected, ok: p.preview.ok,
      steps: p.preview.steps.map((s) => ({ tool: s.tool, args: s.args, why: s.why, ok: s.ok, message: s.message })),
      before: p.preview.before, after: p.preview.summary, issues: p.preview.issues };
  }
  /** Apply the pending plan for real (one undo step). */
  async applyPending() {
    const p = this.pending; if (!p) return { ok: false, error: 'There is no proposal waiting for approval.' };
    if (!p.preview.ok) return { ok: false, error: 'The proposal has a step that fails in the preview; edit or cancel it.' };
    const r = await applyPlan(this, p.plan);
    this.pending = null;
    if (r.ok) {
      this.project.aiHistory.push({ role: 'system', ts: now(), text: `Applied: ${p.plan.title}`, approval: { plan: p.plan.id, calls: p.plan.calls.map((c) => ({ tool: c.tool, args: c.args })) } });
      this.rememberAliases();
      this.baselineRunId = this.lastRunId;
    }
    return { ...r, plan: p.plan, then: p.then };
  }
  cancelPending() {
    const p = this.pending; if (!p) return false;
    p.plan.status = 'cancelled'; this.pending = null;
    this.project.aiHistory.push({ role: 'system', ts: now(), text: `Cancelled: ${p.plan.title}` });
    return true;
  }
  /** Replace the calls of the pending plan (UI: user removed a step or edited a value) and re-preview. */
  async editPendingCalls(calls) {
    const p = this.pending; if (!p) throw new Error('No proposal is waiting.');
    const plan = new Plan({ title: p.plan.title, rationale: p.plan.rationale + ' (edited by you)', calls, kind: p.plan.kind, builder: p.plan.builder, expected: null });
    return this.propose(plan, { then: p.then });
  }

  /** "the second stage", "the probe", ... -> ids, so later instructions can refer to them. */
  rememberAliases() {
    const v = this.project.vehicle; if (!v) return;
    const P = this.project;
    for (const s of v.stages ?? []) {
      if (/^stage\d+$/.test(s.id)) {
        const ord = { 1: ['first stage', 'stage 1', 'booster', 'lower stage'], 2: ['second stage', 'stage 2', 'upper stage'], 3: ['third stage', 'stage 3'] }[s.order] ?? [];
        for (const a of ord) P.remember(a, s.id);
      }
    }
    if (v.components.some((c) => c.group === 'fairing')) P.remember('fairing', 'fairing');
    if (v.components.some((c) => c.group === 'payload')) { P.remember('payload', 'payload'); P.remember('probe', 'payload'); }
    P.remember('the rocket', v.id); P.remember('my vehicle', v.id);
  }

  // ---------------------------------------------------------------- conversation
  /** Send one user message. Returns the assistant reply {id, text, plan, calls, ...}. Never throws. */
  async send(text) {
    text = String(text ?? '').trim().slice(0, 4000);
    this.turnCalls = [];
    const P = this.project;
    P.aiHistory.push({ role: 'user', ts: now(), text });
    let reply, llmNote = '';
    try {
      // approvals and undo are handled locally and deterministically, never by a model
      const local = ['approve', 'cancel', 'undo', 'redo', 'versions', 'stop'].includes(detectIntent(text, { hasPending: !!this.pending }));
      if (this.llm?.enabled && !local) {
        try { reply = await this.llm.respond(this, text); }
        catch (e) { this.emit({ type: 'llm-error', message: e.message }); this.llm.lastError = e.message; reply = null; llmNote = `_(The online AI is unavailable: ${String(e.message).slice(0, 160)}. The built-in offline engineer answered instead.)_\n\n`; }
      }
      reply ??= await this.engineer.respond(text);
      if (llmNote) reply.text = llmNote + reply.text;
    } catch (e) {
      reply = { text: `Something went wrong while handling that (${e.message}). Nothing was changed by this step; the design and the recorded runs are intact.` };
    }
    const out = {
      id: `m${++msgCounter}`, role: 'assistant', ts: now(), text: reply.text, plain: reply.plain ?? null, short: reply.short ?? null, understood: reply.understood ?? null, question: reply.question ?? null, plan: this.planView(), calls: [...this.turnCalls], run: reply.run ?? null, compare: reply.compare ?? null, links: reply.links ?? [], suggestions: reply.suggestions ?? [],
      offline: !(this.llm?.enabled && reply.viaLlm),
    };
    P.aiHistory.push({ role: 'assistant', ts: out.ts, text: out.text, plain: out.plain ?? undefined, short: out.short ?? undefined, toolCalls: out.calls.map((c) => ({ tool: c.tool, args: c.args, ok: c.ok })), plan: out.plan ? out.plan.id : undefined });
    if (P.aiHistory.length > 1000) P.aiHistory.splice(0, P.aiHistory.length - 1000);
    this.ctx.aiHistory = P.aiHistory;
    return out;
  }
  async approve() { return this.send('yes, apply it'); }
  async cancel() { return this.send('cancel'); }

  undo() { const l = this.project.undo(); this.pending = null; this.clarify = null; return l; }
  redo() { const l = this.project.redo(); this.pending = null; return l; }
  versions() { return this.project.history.list(); }
  restoreVersion(n) { const l = this.project.restoreVersion(n); this.pending = null; return l; }
}
