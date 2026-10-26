// Aerospace Academy: 11 levels of lessons (key idea, short text, pictures, labs, quizzes), build guides, a parts guide and a glossary.
import { t } from '../../src/core/i18n.js';
import { h, clear, toast } from '../lib/dom.js';
import { panel } from '../lib/widgets.js';
import { LEVELS, COMPONENT_INFO, allLessons, findLesson } from '../../data/academy/index.js';
import { GUIDES, guideById } from '../../data/academy/guides.js';
import { GLOSSARY, glossaryLetter } from '../../data/academy/glossary.js';
import { KIND_LABELS, CATALOG } from '../../data/components.js';
import { diagram } from '../lib/diagrams.js';
import { annotate, decorateTerms } from '../lib/glossary.js';
import { runAction, checkStep, undoLast, tryThisNow } from '../lib/guideactions.js';
import { tryNowFor } from '../../data/academy/tryit.js';
import { icon } from '../lib/icons.js';
const ic = (n, size = 18) => icon(n, { size });

const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
/** Deterministic shuffle so the right answer is not always in the same place. Returns [{text, ok}] */
export function shuffledOptions(q) {
  const items = q.options.map((text, i) => ({ text, ok: i === q.answer }));
  let seed = hash(q.q); const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
/** First sentence is the simple one; the rest is detail, shown lighter. */
const splitDef = (d) => { const m = /^(.+?[.!?])(\s+)(.+)$/s.exec(d); return m ? [h('b', { class: 'ac-def1' }, m[1]), ' ', h('span', { class: 'muted' }, m[3])] : [h('b', { class: 'ac-def1' }, d)]; };
const fmtNum = (x, d = 0) => (Number.isFinite(x) ? (Math.abs(x) >= 1e6 || (Math.abs(x) < 0.01 && x !== 0) ? x.toExponential(2) : x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 })) : '–');

export default {
  id: 'academy', title: 'Aerospace Academy',
  mount(root, app, params = {}) {
    const st = app.settings.academy ?? (app.settings.academy = { done: {}, quiz: {}, seen: null });
    st.guides ??= {};
    const S = { view: viewFromParams(params), q: '', pq: '', gq: '', group: '', letter: '' };
    const page = h('div', { class: 'page academy' }); root.append(page);
    const save = () => app.saveSettings();
    const total = allLessons().length, doneCount = () => Object.values(st.done).filter(Boolean).length;
    const go = (view) => { S.view = view; render(); root.scrollTop = 0; };
    const learnBtn = (label, view, cls = 'btn') => h('button', { class: cls, onclick: () => go(view) }, label);
    const catalogCount = (kind) => CATALOG.filter((c) => c.kind === kind).length;

    function viewFromParams(p) {
      if (p.lesson) return { t: 'lesson', id: p.lesson };
      if (p.component) return { t: 'part', kind: p.component };
      if (p.guide) return { t: 'guide', id: p.guide };
      if (p.view === 'parts') return { t: 'parts' };
      if (p.view === 'guides') return { t: 'guides' };
      if (p.view === 'glossary' || p.term) return { t: 'glossary', term: p.term };
      return { t: 'home' };
    }

    function crumbs(...items) {
      return h('div', { class: 'crumbs' }, learnBtn('Academy', { t: 'home' }, 'linklike'), ...items.flatMap((i) => [h('span', { class: 'muted' }, ' › '), i]));
    }
    /** The four sections of the Academy as a tab row. */
    function tabsRow(active) {
      const T = [['home', t('acad.lessons', 'Lessons'), 'academy-tab-lessons'], ['guides', t('acad.guides', 'Guides'), 'academy-tab-guides'], ['parts', t('acad.parts', 'Parts'), 'academy-parts'], ['glossary', t('acad.glossary', 'Words'), 'academy-tab-glossary']];
      return h('div', { class: 'gd-tabs ac-tabs', role: 'tablist' }, T.map(([t, label, id]) => h('button', { class: `gd-tab ${active === t ? 'on' : ''}`, id, role: 'tab', 'aria-selected': String(active === t), onclick: () => go({ t }) }, label)));
    }
    const head = (title, text, extra) => h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, title), text ? h('p', null, text) : null), extra ?? null);

    // ------------------------------------------------------------------------------------------ home (lessons)
    function home() {
      const next = allLessons().find((l) => !st.done[l.id]);
      const q = S.q.trim().toLowerCase();
      page.append(head('Academy', 'Learn about space in small steps.',
        h('div', { class: 'stat' }, h('div', { class: 'stat-l' }, 'Done'), h('div', { class: 'stat-v' }, `${doneCount()} / ${total}`), h('div', { class: 'stat-s' }, 'lessons'))));
      page.append(tabsRow('home'));
      const search = h('input', { class: 'input', id: 'academy-search', placeholder: 'Search, e.g. thrust', value: S.q, style: { width: '100%', maxWidth: '520px' } });
      search.addEventListener('input', () => { S.q = search.value; const pos = search.selectionStart; render(); const el = page.querySelector('#academy-search'); el?.focus(); el?.setSelectionRange(pos, pos); });
      const last = st.lastGuide && guideById(st.lastGuide);
      page.append(h('div', { class: 'row' }, search,
        next ? h('button', { class: 'btn primary big', id: 'academy-continue', onclick: () => go({ t: 'lesson', id: next.id }) }, doneCount() ? `Continue: ${next.title}` : `Start: ${next.title}`) : h('span', { class: 'ok' }, 'All lessons done!'),
        last && guideProgress(last).done < last.steps.length ? h('button', { class: 'btn', id: 'academy-continue-guide', onclick: () => go({ t: 'guide', id: last.id }) }, `Continue: ${last.title.replace(/^How to /, '')}`) : null));
      if (q) {
        const ls = allLessons().filter((l) => `${l.title} ${l.tagline} ${l.definition}`.toLowerCase().includes(q));
        const ps = Object.entries(COMPONENT_INFO).filter(([k, c]) => `${c.name} ${c.oneLine} ${c.whatItDoes}`.toLowerCase().includes(q));
        const gs = GUIDES.filter((g) => `${g.title} ${g.goal}`.toLowerCase().includes(q));
        const ts = GLOSSARY.filter((e) => `${e.term} ${e.aka.join(' ')} ${e.def}`.toLowerCase().includes(q)).slice(0, 8);
        const row = (onclick, a, b) => h('button', { class: 'lesson-row', onclick }, h('b', null, a), h('span', { class: 'muted' }, b));
        page.append(panel(`Search results for “${S.q}”`, h('div', { class: 'col' },
          ls.length ? ls.map((l) => row(() => go({ t: 'lesson', id: l.id }), l.title, ` — Level ${l.level.n}: ${l.tagline}`)) : h('p', { class: 'muted' }, 'No lessons match.'),
          gs.map((g) => row(() => go({ t: 'guide', id: g.id }), g.title, ' — build guide')),
          ps.map(([k, c]) => row(() => go({ t: 'part', kind: k }), c.name, ` — part: ${c.oneLine}`)),
          ts.map((e) => row(() => go({ t: 'glossary', term: e.term }), e.term, ` — ${e.def}`)))));
        return;
      }
      page.append(h('div', { class: 'grid g3 ac-levels' }, LEVELS.map((L) => {
        const d = L.lessons.filter((l) => st.done[l.id]).length;
        return h('section', { class: 'panel level-card ac-level', 'data-level': L.id }, h('div', { class: 'panel-body' },
          h('div', { class: 'ac-level-h' }, h('span', { class: 'level-ico' }, ic(L.icon, 26)), h('div', null, h('div', { class: 'muted ac-lv' }, `Level ${L.n}`), h('h2', null, L.title))),
          h('p', { class: 'muted std-only' }, L.blurb),
          h('div', { class: 'ac-prog' }, h('div', { class: 'progress small grow' }, h('div', { style: { width: `${(d / L.lessons.length) * 100}%` } })), h('span', { class: 'muted' }, `${d}/${L.lessons.length}`)),
          h('div', { class: 'ac-lessons' }, L.lessons.map((l) => h('button', { class: `lesson-row ac-lesson ${st.done[l.id] ? 'done' : ''}`, 'data-lesson': l.id, onclick: () => go({ t: 'lesson', id: l.id }) },
            h('span', { class: 'ac-dot' }, st.done[l.id] ? ic('check', 14) : null), h('span', { class: 'ac-lt' }, l.title), h('span', { class: 'muted std-only' }, `${l.minutes} min`))))));
      })));
    }

    // ------------------------------------------------------------------------------------------ build guides
    const stepDone = (g, s) => !!(checkStep(app.project, s) || st.guides[g.id]?.[s.id]);
    function guideProgress(g) { const done = g.steps.filter((s) => stepDone(g, s)).length; return { done, total: g.steps.length }; }
    function guides() {
      page.append(head('Guides', 'Pick a vehicle. Build it step by step.'));
      page.append(tabsRow('guides'));
      page.append(h('div', { class: 'grid g3 gd-grid' }, GUIDES.map((g) => {
        const pr = guideProgress(g);
        return h('button', { class: 'panel gd-card', 'data-guide': g.id, onclick: () => go({ t: 'guide', id: g.id }) }, h('div', { class: 'panel-body' },
          h('div', { class: 'gd-card-ico' }, ic(g.icon, 28)), h('h2', null, g.title.replace(/^How to /, '').replace(/^./, (c) => c.toUpperCase())), h('p', { class: 'muted std-only' }, g.goal),
          h('div', { class: 'gd-meta' }, h('span', { class: `chip gd-diff gd-${g.difficulty.toLowerCase()}` }, g.difficulty), h('span', { class: 'muted' }, `${g.steps.length} steps, ${g.minutes} min`)),
          h('div', { class: 'progress small' }, h('div', { style: { width: `${(pr.done / pr.total) * 100}%` } }))));
      })));
    }
    function guide(id) {
      const g = guideById(id); if (!g) { go({ t: 'guides' }); return; }
      st.lastGuide = g.id; save();
      const pr = guideProgress(g);
      const firstOpen = g.steps.find((s) => !stepDone(g, s));
      page.append(crumbs(learnBtn('Guides', { t: 'guides' }, 'linklike'), h('b', null, g.title)));
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, g.title), h('p', null, g.goal),
        h('div', { class: 'gd-meta' }, h('span', { class: `chip gd-diff gd-${g.difficulty.toLowerCase()}` }, g.difficulty), h('span', { class: 'muted' }, `${g.steps.length} steps, about ${g.minutes} min`))),
        h('div', { class: 'stat' }, h('div', { class: 'stat-l' }, 'Done'), h('div', { class: 'stat-v', id: 'gd-progress' }, `${pr.done} / ${pr.total}`), h('div', { class: 'stat-s' }, 'steps'))));
      const bar = h('div', { class: 'row gd-bar' },
        g.example ? h('button', { class: 'btn', id: 'gd-example', title: g.exampleNote ?? '', onclick: async () => { try { await runAction({ example: g.example }, ctx()); toast('Finished example loaded. You can undo it.', 'ok'); render(); } catch (e) { toast(e.message, 'bad', 6000); } } }, 'Load the finished one') : null,
        h('button', { class: 'btn', id: 'gd-undo', onclick: async () => { const r = await undoLast(app); toast(r.ok ? r.message : 'Nothing to undo.', r.ok ? 'ok' : 'info'); render(); } }, 'Undo'),
        h('button', { class: 'btn', id: 'gd-reset', onclick: () => { st.guides[g.id] = {}; save(); render(); } }, 'Reset'));
      page.append(bar);
      if (g.example && g.exampleNote) page.append(h('p', { class: 'muted gd-note' }, `Finished example: ${g.exampleNote}`));
      const seen = new Set();
      page.append(h('ol', { class: 'gd-steps' }, g.steps.map((s, i) => {
        const done = stepDone(g, s); const cur = s === firstOpen;
        const info = (s.kinds ?? []).filter((k) => COMPONENT_INFO[k]).map((k) => {
          const c = COMPONENT_INFO[k];
          return h('li', null, h('span', { class: 'gd-ico' }, ic(c.icon ?? 'tools', 16)), h('b', null, `${c.name}: `), c.oneLine, ' ', h('button', { class: 'linklike', onclick: () => go({ t: 'part', kind: k }) }, 'Learn more'));
        });
        const a = s.action;
        const btn = h('button', { class: `btn ${cur && !done ? 'primary' : ''}`, 'data-step': s.id, onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          try {
            await runAction(a, ctx());
            if (a.tool || a.fn) { toast(`Done: ${a.label}. You can undo it.`, 'ok'); if (!s.check) { (st.guides[g.id] ??= {})[s.id] = true; save(); } }
            if (!a.go && !a.ai && !a.lesson) render();
          } catch (e) { b.disabled = false; toast(e.message, 'bad', 7000); }
        } }, a.label);
        return h('li', { class: `gd-step ${done ? 'done' : ''} ${cur ? 'cur' : ''}`, 'data-step-id': s.id },
          h('div', { class: 'gd-num' }, done ? ic('check', 16) : String(i + 1)),
          h('div', { class: 'gd-body' },
            h('div', { class: 'gd-do' }, annotate(s.do, seen)),
            s.what ? h('div', { class: 'gd-what' }, h('b', null, 'What it does: '), annotate(s.what, seen)) : null,
            info.length ? h('div', { class: 'gd-what' }, !s.what ? h('b', null, 'Parts: ') : null, h('ul', { class: 'gd-parts' }, info)) : null,
            h('div', { class: 'row gd-act' }, btn, !s.check ? h('button', { class: 'linklike', onclick: () => { const m = (st.guides[g.id] ??= {}); m[s.id] = !m[s.id]; save(); render(); } }, done ? 'Not done' : 'Mark done') : null)));
      })));
      if (pr.done === pr.total) page.append(h('div', { class: 'callout ok' }, 'Guide finished! Now change one number and fly again.'));
    }
    const ctx = () => ({ app, openLesson: (id) => go({ t: 'lesson', id }) });

    // ------------------------------------------------------------------------------------------ glossary
    function glossary() {
      page.append(head('Words', `${GLOSSARY.length} space words, explained simply.`));
      page.append(tabsRow('glossary'));
      const sel = S.view.term && !S.gq ? S.view.term : null;
      const search = h('input', { class: 'input', id: 'glossary-search', placeholder: 'Find a word', value: S.gq, style: { width: '100%', maxWidth: '420px' } });
      search.addEventListener('input', () => { S.gq = search.value; S.letter = ''; S.view = { t: 'glossary' }; const pos = search.selectionStart; render(); const el = page.querySelector('#glossary-search'); el?.focus(); el?.setSelectionRange(pos, pos); });
      const letters = [...new Set(GLOSSARY.map(glossaryLetter))].sort();
      page.append(h('div', { class: 'row' }, search), h('div', { class: 'gd-letters' }, letters.map((L) => h('button', { class: `gd-letter ${S.letter === L ? 'on' : ''}`, onclick: () => { S.letter = S.letter === L ? '' : L; S.gq = ''; S.view = { t: 'glossary' }; render(); } }, L))));
      const q = S.gq.trim().toLowerCase();
      let list = GLOSSARY.filter((e) => (!S.letter || glossaryLetter(e) === S.letter) && (!q || `${e.term} ${e.aka.join(' ')} ${e.def}`.toLowerCase().includes(q)));
      if (sel) list = [...list.filter((e) => e.term === sel), ...list.filter((e) => e.term !== sel)];
      page.append(h('div', { class: 'gd-gloss', id: 'glossary-list' }, list.length ? list.map((e) => h('div', { class: `gd-term ${e.term === sel ? 'sel' : ''}`, 'data-term': e.term },
        h('div', { class: 'gd-term-h' }, h('b', null, e.term), e.aka.length ? h('span', { class: 'muted' }, ` also: ${e.aka.slice(0, 3).join(', ')}`) : null),
        h('div', null, ...splitDef(e.def)), e.lesson && findLesson(e.lesson) ? h('button', { class: 'linklike', onclick: () => go({ t: 'lesson', id: e.lesson }) }, `Lesson: ${findLesson(e.lesson).title}`) : null)) : h('p', { class: 'muted' }, 'No word matches.')));
    }

    // ------------------------------------------------------------------------------------------ lesson
    function lab(l) {
      const L = l.lab; const vals = {}; L.inputs.forEach((i) => (vals[i.id] = i.value));
      const out = h('div', { class: 'lab-out' });
      const draw = () => { clear(out); let res = []; try { res = L.compute({ ...vals }); } catch { res = []; } for (const r of res) out.append(h('div', { class: 'stat' }, h('div', { class: 'stat-l' }, r.label), h('div', { class: 'stat-v' }, `${fmtNum(r.value, r.digits ?? 0)} ${r.unit ?? ''}`))); };
      const inputs = L.inputs.map((i) => {
        const num = h('input', { class: 'input num', type: 'number', value: i.value, min: i.min, max: i.max, step: i.step ?? 'any', style: { width: '110px' } });
        // wide ranges (for example 1 kg to 1,000,000 kg) use a logarithmic slider so that small values stay easy to set
        const log = i.min > 0 && i.max / i.min >= 100;
        const toPos = (v) => (log ? (Math.log(v) - Math.log(i.min)) / (Math.log(i.max) - Math.log(i.min)) : (v - i.min) / (i.max - i.min)) * 1000;
        const fromPos = (p) => { const f = p / 1000; let v = log ? Math.exp(Math.log(i.min) + f * (Math.log(i.max) - Math.log(i.min))) : i.min + f * (i.max - i.min); const st = +i.step || 0; if (st) v = Math.round(v / st) * st; if (log) v = +v.toPrecision(3); return Math.min(i.max, Math.max(i.min, v)); };
        const range = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: toPos(i.value), class: 'range' });
        const set = (v) => { v = Math.min(i.max, Math.max(i.min, v)); if (Number.isFinite(v)) { vals[i.id] = v; draw(); } };
        range.addEventListener('input', () => { const v = fromPos(+range.value); num.value = v; set(v); });
        num.addEventListener('input', () => { const v = +num.value; if (Number.isFinite(v) && v >= i.min && v <= i.max) range.value = toPos(v); set(v); });
        return h('label', { class: 'field' }, `${i.label}${i.unit ? ` (${i.unit})` : ''}`, h('div', { class: 'row' }, range, num));
      });
      draw();
      return panel(`Lab: ${L.title}`, h('div', { class: 'col' }, h('p', null, L.intro), h('div', { class: 'grid g2' }, inputs), out, L.note ? h('p', { class: 'muted std-only' }, `Notice: ${L.note}`) : null), { cls: 'lab' });
    }
    function quiz(l) {
      const box = h('div', { class: 'col' });
      let right = 0, answered = 0;
      const result = h('div', { class: 'quiz-result' });
      l.quiz.forEach((q, qi) => {
        const opts = shuffledOptions(q); const fb = h('div', { class: 'quiz-fb' });
        const btns = opts.map((o) => h('button', { class: 'quiz-opt', onclick: () => {
          if (btns.some((b) => b.disabled)) return;
          btns.forEach((b, i) => { b.disabled = true; if (opts[i].ok) b.classList.add('right'); });
          if (o.ok) right++; else btns[opts.indexOf(o)].classList.add('wrong');
          fb.textContent = `${o.ok ? 'Correct. ' : 'Not quite. '}${q.why}`; fb.className = `quiz-fb ${o.ok ? 'ok' : 'bad'}`;
          answered++;
          if (answered === l.quiz.length) {
            const best = Math.max(st.quiz[l.id]?.best ?? 0, right); st.quiz[l.id] = { best, total: l.quiz.length };
            if (right >= 2) st.done[l.id] = true; save();
            result.textContent = `${right} of ${l.quiz.length} right. ${right >= 2 ? 'Lesson done.' : 'Read the lesson again and retry.'}`;
            result.className = `quiz-result ${right >= 2 ? 'ok' : 'warn'}`;
          }
        } }, o.text));
        box.append(h('div', { class: 'quiz-q' }, h('b', null, `${qi + 1}. ${q.q}`), h('div', { class: 'col', style: { gap: '6px', margin: '8px 0' } }, btns), fb));
      });
      box.append(result);
      return panel('Quiz', box);
    }
    function lesson(id) {
      const l = findLesson(id); if (!l) { go({ t: 'home' }); return; }
      const flat = allLessons(); const idx = flat.findIndex((x) => x.id === id); const prev = flat[idx - 1], next = flat[idx + 1];
      const expert = app.settings.mode === 'advanced' || app.settings.mode === 'expert';
      const seen = new Set();   // every glossary word is dotted only once per lesson
      const T = (text, max) => annotate(text, seen, max);
      page.append(crumbs(h('span', null, `Level ${l.level.n}`), h('b', null, l.title)));
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, l.title), h('p', null, l.tagline), h('span', { class: 'muted' }, `${l.minutes} min · Lesson ${idx + 1} of ${flat.length}`))));
      const body = h('div', { class: 'lesson' });
      body.append(h('div', { class: 'gd-key', id: 'key-idea' }, h('div', { class: 'gd-key-h' }, 'Key idea'), h('div', { class: 'gd-key-t' }, l.keyIdea)));
      const dg = l.diagram && diagram(l.diagram);
      body.append(h('div', { class: `ac-top ${dg ? 'has-pic' : ''}` }, h('div', { class: 'prose ac-chunks' }, l.explain.map((p) => h('p', null, T(p)))), dg ? h('div', { class: 'diagram', html: dg }) : null));
      const tn = tryNowFor(l.id);
      if (tn) body.append(h('div', { class: 'tn-box', id: 'try-now-box' }, h('button', { class: 'btn primary big tn-btn', id: 'try-now', 'data-lesson': l.id, onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        try { await tryThisNow(app, tn); } catch (e) { b.disabled = false; toast(`Could not set this up: ${e.message}`, 'bad', 7000); }
      } }, [ic('play', 16), ` Try this now: ${tn.label}`]), h('span', { class: 'muted tn-tip std-only' }, tn.tip, ' You can undo it.')));
      body.append(h('details', { class: 'more', id: 'lesson-more', open: expert },
        h('summary', null, 'More'),
        h('div', { class: 'callout info big-def' }, h('b', null, 'In one sentence: '), T(l.definition)),
        h('div', { class: 'callout ok' }, h('b', null, 'Why it matters: '), T(l.why))));
      body.append(h('div', { class: 'std-only' }, panel('Key ideas', h('ul', { class: 'ideas' }, l.keyIdeas.map((k) => h('li', null, k))))));
      if (l.deep) {
        body.append(h('details', { class: 'more std-only', id: 'go-deeper', open: expert }, h('summary', null, 'Go deeper'),
          h('div', { class: 'prose' }, h('p', null, h('b', null, 'Definition. '), l.deep.definition), l.deep.explain.map((p) => h('p', null, p)), h('p', null, h('b', null, 'Why it matters. '), l.deep.why))));
      }
      if (l.equations?.length) {
        const eqs = h('div', { class: 'col' }, l.equations.map((e) => h('div', { class: 'equation' }, h('div', { class: 'eq-title' }, e.name), h('div', { class: 'eq-formula' }, e.formula),
          e.meaning ? h('p', null, e.meaning) : null, h('table', { class: 'vars' }, h('tbody', null, e.vars.map(([s, n, u]) => h('tr', null, h('td', { class: 'mono' }, s), h('td', null, n), h('td', { class: 'muted' }, u || ''))))))));
        body.append(h('details', { class: 'more', open: expert }, h('summary', null, 'Show the math'), eqs));
      }
      body.append(h('details', { class: 'more std-only' }, h('summary', null, 'Example'), panel(`Example: ${l.example.title}`, h('div', { class: 'example' }, l.example.text.split('\n').map((t) => h('p', null, t))))));
      if (l.lab) body.append(lab(l));
      {
        const hasVehicle = !!app.project.vehicle;
        const related = GUIDES.filter((g) => (g.needs ?? []).some((k) => `${l.title} ${l.definition} ${l.tagline}`.toLowerCase().includes((KIND_LABELS[k] ?? k).toLowerCase().split(' ')[0]))).slice(0, 2);
        body.append(panel('Keep exploring', h('div', { class: 'col' },
          h('div', { class: 'row' },
            hasVehicle ? h('button', { class: 'btn primary', id: 'sim-live', onclick: () => app.navigate('control', { autostart: true }) }, 'Watch my rocket fly') : h('button', { class: 'btn primary', id: 'sim-build', onclick: () => app.navigate('ai', { prefill: 'Build me a two-stage rocket carrying a 100 kg space probe.', send: true }) }, 'Let the AI build a rocket'),
            h('button', { class: 'btn std-only', onclick: () => app.navigate(l.sim?.screen && l.sim.screen !== 'analysis' ? l.sim.screen : 'designer') }, l.sim?.screen === 'simulation' ? 'Open launch' : 'Open builder'),
            h('button', { class: 'btn', id: 'sim-ask', onclick: () => app.navigate('ai', { prefill: `Teach me about ${l.title}`, send: true }) }, 'Ask the AI'),
            related.map((g) => h('button', { class: 'btn std-only', onclick: () => go({ t: 'guide', id: g.id }) }, g.title))),
          l.sim?.ask ? h('details', { class: 'more std-only' }, h('summary', null, 'Challenge ideas for the AI Helper'), h('p', { class: 'muted' }, 'The helper understands designing, launching, explaining failures and comparing runs. Free-form requests may need rewording.'), h('button', { class: 'chip', onclick: () => app.navigate('ai', { prefill: l.sim.ask }) }, l.sim.ask)) : null)));
      }
      body.append(h('div', { class: 'std-only' }, panel('Common mistakes', h('ul', { class: 'ideas' }, l.mistakes.map((m) => h('li', null, T(m, 2)))))));
      body.append(h('div', { class: 'callout std-only' }, h('b', null, 'Summary: '), l.recap));
      body.append(quiz(l));
      body.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        prev ? h('button', { class: 'btn', onclick: () => go({ t: 'lesson', id: prev.id }) }, 'Back') : h('span'),
        h('button', { class: 'btn', id: 'mark-done', onclick: () => { st.done[l.id] = !st.done[l.id]; save(); render(); } }, st.done[l.id] ? 'Finished' : 'Mark as finished'),
        next ? h('button', { class: 'btn primary big', id: 'next-lesson', onclick: () => go({ t: 'lesson', id: next.id }) }, `Next: ${next.title}`) : h('span')));
      page.append(body);
    }

    // ------------------------------------------------------------------------------------------ parts guide
    function parts() {
      page.append(head('Parts', 'What every part does.'));
      page.append(tabsRow('parts'));
      const groups = [...new Set(Object.values(COMPONENT_INFO).map((c) => c.group))];
      const search = h('input', { class: 'input', id: 'parts-search', placeholder: 'Search parts', value: S.pq, style: { width: '100%', maxWidth: '420px' } });
      search.addEventListener('input', () => { S.pq = search.value; const pos = search.selectionStart; render(); const el = page.querySelector('#parts-search'); el?.focus(); el?.setSelectionRange(pos, pos); });
      page.append(h('div', { class: 'row' }, search, h('div', { class: 'gd-chips' }, [['', 'All'], ...groups.map((g) => [g, g])].map(([g, label]) => h('button', { class: `chip ${S.group === g ? 'on' : ''}`, onclick: () => { S.group = g; render(); } }, label)))));
      const q = S.pq.trim().toLowerCase();
      const shown = Object.entries(COMPONENT_INFO).filter(([k, c]) => (!S.group || c.group === S.group) && (!q || `${c.name} ${c.oneLine} ${c.whatItDoes} ${KIND_LABELS[k] ?? ''}`.toLowerCase().includes(q)));
      const by = {}; for (const [k, c] of shown) (by[c.group] ??= []).push([k, c]);
      if (!shown.length) page.append(h('p', { class: 'muted' }, 'No part matches.'));
      for (const [g, items] of Object.entries(by)) {
        page.append(h('h3', { style: { margin: '14px 0 6px' } }, g), h('div', { class: 'grid g3' }, items.map(([k, c]) => h('button', { class: 'part-card', 'data-kind': k, onclick: () => go({ t: 'part', kind: k }) },
          h('span', { class: 'big' }, ic(c.icon ?? 'tools', 26)), h('b', null, c.name), h('span', { class: 'muted gd-two' }, c.oneLine),
          h('span', { class: 'gd-more' }, 'Learn more')))));
      }
    }
    function part(kind) {
      const c = COMPONENT_INFO[kind]; if (!c) { go({ t: 'parts' }); return; }
      const seen = new Set();
      page.append(crumbs(learnBtn('Parts', { t: 'parts' }, 'linklike'), h('b', null, c.name)));
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, c.name), h('p', null, c.oneLine), h('span', { class: 'muted' }, `${c.group}, ${catalogCount(kind)} ready-made versions`)),
        h('button', { class: 'btn primary', onclick: () => app.navigate('ai', { prefill: `Teach me about the ${c.name.toLowerCase()}`, send: true }) }, 'Ask the AI'),
        h('button', { class: 'btn', onclick: () => app.navigate('designer') }, 'Open builder')));
      const b = h('div', { class: 'lesson' });
      b.append(h('div', { class: 'callout info big-def' }, h('b', null, 'What it does: '), annotate(c.whatItDoes, seen)));
      b.append(h('div', { class: 'callout' }, h('b', null, 'Try it: '), c.tryIt));
      const more = h('details', { class: 'more', id: 'part-more', open: app.settings.mode === 'advanced' }, h('summary', null, 'More'));
      if (c.detail) more.append(h('p', null, annotate(c.detail, seen)));
      more.append(h('div', { class: 'callout ok' }, h('b', null, 'Why it matters: '), annotate(c.whyItMatters, seen)));
      more.append(panel('How it works', h('div', { class: 'prose' }, c.howItWorks.map((p) => h('p', null, annotate(p, seen))))));
      more.append(h('div', { class: 'grid g2' }, panel('Good', h('ul', { class: 'ideas' }, c.advantages.map((x) => h('li', null, x)))), panel('Limits', h('ul', { class: 'ideas' }, c.limitations.map((x) => h('li', null, x))))));
      if (c.params?.length) more.append(panel('The numbers you can change', h('table', { class: 'vars' }, h('tbody', null, c.params.map(([key, label, why]) => h('tr', null, h('td', null, h('b', null, label)), h('td', null, why)))))));
      more.append(h('p', null, h('b', null, 'In real life: '), c.realWorld));
      b.append(more);
      const gs = GUIDES.filter((g) => g.needs?.includes(kind) || g.steps.some((s) => s.kinds?.includes(kind)));
      if (gs.length) b.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Used in guides:'), gs.map((g) => h('button', { class: 'chip', onclick: () => go({ t: 'guide', id: g.id }) }, g.title.replace(/^How to /, '')))));
      if (c.related?.length) b.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Related parts:'), c.related.filter((r) => COMPONENT_INFO[r]).map((r) => h('button', { class: 'chip', onclick: () => go({ t: 'part', kind: r }) }, COMPONENT_INFO[r].name))));
      const rel = allLessons().filter((l) => `${l.title} ${l.definition}`.toLowerCase().includes((KIND_LABELS[kind] ?? c.name).toLowerCase().split(' ')[0])).slice(0, 3);
      if (rel.length) b.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Related lessons:'), rel.map((l) => h('button', { class: 'chip', onclick: () => go({ t: 'lesson', id: l.id }) }, l.title))));
      page.append(b);
    }

    function render() {
      clear(page);
      const v = S.view;
      if (v.t === 'lesson') lesson(v.id); else if (v.t === 'parts') parts(); else if (v.t === 'part') part(v.kind);
      else if (v.t === 'guides') guides(); else if (v.t === 'guide') guide(v.id); else if (v.t === 'glossary') glossary(); else home();
      if (v.t === 'lesson' || v.t === 'part' || v.t === 'guide') decorateTerms(page, { max: 16 });   // dotted tooltips on jargon that the lesson text did not mark itself
    }
    const off = app.on?.('guide-progress', () => { if (S.view.t === 'guide') render(); });
    render();
    return () => { if (typeof off === 'function') off(); };
  },
};
