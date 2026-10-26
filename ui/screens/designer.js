// Vehicle Designer: component tree, 3D editor (7 camera modes), inspector, live mass / delta-v analysis with design checks.
import { THRUST_SHAPES, THRUST_SHAPE_IDS } from '../../physics/thrust-curves.js';
import { h, clear, toast, modal, fmt, confirmDialog, promptDialog, localPoint } from '../lib/dom.js';
import { panel, kv, select, numberInput, dataBadge, sceneStage, loop, stat, equation, emptyState, term } from '../lib/widgets.js';
import { CAMERA_MODES } from '../lib/scene.js';
import { createVehicleDialog, VEHICLE_KINDS } from '../lib/create.js';
import { icon } from '../lib/icons.js';
import { show, editFactor, conv } from '../lib/units.js';
import { atLeast } from '../../src/core/levels.js';
import { studentFormulas, engineerDesign, sensitivityPanel, physicsOptionsPanel } from '../lib/levelkit.js';
import { COMPONENT_INFO } from '../../data/academy/index.js';
import { CATALOG, CATEGORIES, KIND_FIELDS, KIND_LABELS, byCatalogId } from '../../data/components.js';
import { vehicleSummary } from '../../ai/toolapi.js';
import { validateVehicle, analyzeVehicle } from '../../src/vehicles/analysis.js';
import { computeMassProperties } from '../../physics/vehicle-model.js';
import { addComponent, modifyComponent, findComponent, cloneVehicle, totalMass } from '../../src/vehicles/vehicle.js';
import { G0 } from '../../physics/constants.js';
import { computeLayout } from '../../physics/vehicle-model.js';
import { editCaps, setLength, setDiameter, slide } from '../lib/dragedit.js';
import { createSimplePanel, ORBIT_DV, flyChecks, light } from '../lib/rocketbuilder.js';
import { fixButton } from '../lib/missing.js';
import { NO_FIX } from '../../src/core/autofix.js';
import { kindIcon, KIND_SHORT, plainKind, PICK_GROUPS, groupOfKind, fieldLabel, BASICS, firstSentence, limitWarning, plainIssue, recommendNext, helpPop } from '../lib/editorkit.js';

// Beginner mode shows the simple Rocket Builder until the user opens the full editor (remembered while the app runs).
let fullEditor = false;
// Friendlier names for the add-part catalog groups.
const FRIENDLY_CATEGORIES = { propulsion: 'Engines and fuel', structure: 'Body and shell', avionics: 'Brains and steering', power: 'Power', comms: 'Radio', science: 'Payload and science', thermal: 'Heat control', landing: 'Landing', rover: 'Rover parts' };

export default {
  id: 'designer', title: 'Vehicle Designer', fill: true,
  mount(root, app, params) {
    if (app.settings.mode !== 'beginner') fullEditor = false;
    const S = { sel: null, cgOn: true, addCat: 'propulsion', addItem: null, dirty: true, collapsed: new Set(), hiStage: null, addStage: null, keys: false, scroll: false, filter: '', find: '', map: {}, moreOpen: false, ranges: {}, showNumbers: false };
    const isSimple = () => app.settings.mode === 'beginner' && !fullEditor;
    const layout = h('div', { class: 'split ed-grid-full' });
    const left = h('div', { class: 'side left' }), center = h('div', { style: { display: 'grid', gridTemplateRows: '1fr auto', minHeight: 0 } }), right = h('div', { class: 'side' });
    layout.append(left, center, right); root.append(layout);
    const stage = sceneStage(app, { mode: 'free', modes: CAMERA_MODES.filter((m) => ['free', 'side', 'top'].includes(m.id)) });
    const stageBox = h('div', { class: 'holo', style: { minHeight: 0, position: 'relative' } }, stage.el, h('div', { class: 'holo-sweep' }), h('div', { class: 'holo-tag' }, 'Hologram: building…')); stage.el.style.height = '100%';
    // 2.6: while you change the rocket it shows as a blue hologram with a scan line; a moment later the real model "snaps in"
    let holoT = 0; const holo = (ms = 1300) => { stageBox.classList.add('building'); clearTimeout(holoT); holoT = setTimeout(() => stageBox.classList.remove('building'), ms); };
    holo(900);
    const noteEl = h('div', { class: 'ed-note', id: 'ed-note', style: { display: 'none' } });
    const strip = h('div', { class: 'analysis-strip', style: { maxHeight: '36vh', overflow: 'auto', borderTop: '1px solid var(--line)', background: 'var(--panel)' } });
    stageBox.append(noteEl); center.append(stageBox, strip);
    const view = stage.view;
    const vehicle = () => app.project.vehicle;

    // ---------------------------------------------------------------- rendering of the 3D view
    let needs = true;
    const dirty = () => { needs = true; };
    if (view) {
      view.showGrid = true; view.flightMode = false;
      view.onChange = dirty; view.onPick = (id) => { S.sel = id; renderAll(); }; view.onHover = (id) => { if (view.hover !== id) { view.hover = id; dirty(); } };
      const ro = new ResizeObserver(dirty); ro.observe(stage.el);
      var stop = loop((dt, now) => {
        if (!needs && view.mode !== 'orbit') return; needs = false;
        const v = vehicle(); let cgX = null;
        try { if (v && !view.model?.isRover) cgX = computeMassProperties(v).cg; } catch { /* ignore */ }
        view.selected = S.sel;
        view.drawDesign(now, { showCG: S.cgOn && cgX != null, cgX });
        placeHandles();
      }, app.settings.maxFps);
    }
    function setVehicleInView() {
      const v = vehicle();
      if (view) { view.setVehicle(v); view.selected = S.sel; dirty(); }
    }

    // ---------------------------------------------------------------- mouse editing (handles on the selected part)
    // Drag the selected part to slide it along the vehicle (it swaps places with its neighbour inside the same stage), drag the
    // round handles to change its length or diameter. The change is applied live and stored as ONE undo step when the mouse is released.
    const hLen = h('div', { class: 'edit-handle', id: 'handle-length', title: 'Drag: longer or shorter', style: { display: 'none' } }, '↕');
    const hDia = h('div', { class: 'edit-handle', id: 'handle-diameter', title: 'Drag: wider or thinner', style: { display: 'none' } }, '↔');
    const editTip = h('div', { class: 'edit-tip', style: { display: 'none' } });
    if (view) stage.overlay.append(hLen, hDia, editTip);
    if (view) {
      const vb = (label, title, fn, id) => h('button', { class: 'chip view-btn', id, title, onclick: fn }, label);
      stage.overlay.append(h('div', { class: 'view-tools' },
        vb('Fit', 'Zoom so the whole rocket fits', () => view.fitDesign(), 'view-fit'),
        vb('Reset', 'Back to the first angle and zoom', () => view.fitDesign(true), 'view-reset'),
        vb('Focus', 'Zoom in on the selected part (click a part first)', () => { if (!S.sel || !view.focusPart(S.sel)) toast('Click a part first.', 'info'); }, 'view-focus'),
        vb('+', 'Zoom in', () => view.zoomBy(0.8), 'view-in'), vb('−', 'Zoom out', () => view.zoomBy(1.25), 'view-out'),
        helpPop(['Drag: turn the rocket.', 'Right-drag: move it.', 'Wheel: zoom.'], { title: 'How to move the view' })));
    }
    let gesture = null;
    const partBox = () => {
      const v = vehicle(); const c = v && S.sel ? findComponent(v, S.sel) : null; if (!c) return null;
      const lay = computeLayout(v); const pl = lay.placements.get(c.id); if (!pl) return null;
      return { v, c, lay, pl, caps: editCaps(v, c) };
    };
    const px = (p) => view.projectDesign(p);
    // pixels per metre along a vehicle axis at point p (vector on the screen)
    const axisPx = (p, dir) => { const a = px(p), b = px([p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]]); return a && b ? [b.x - a.x, b.y - a.y] : null; };
    function lateralAxis(pl) {
      const at = [pl.xc, 0, 0]; const y = axisPx(at, [0, 1, 0]), z = axisPx(at, [0, 0, 1]);
      const ly = y ? Math.hypot(...y) : 0, lz = z ? Math.hypot(...z) : 0;
      return ly >= lz ? { dir: [0, 1, 0], len: ly } : { dir: [0, 0, 1], len: lz };
    }
    function placeHandles() {
      const b = partBox();
      if (isSimple()) { hLen.style.display = hDia.style.display = editTip.style.display = 'none'; return; }
      const showTip = !!b && b.caps.move;
      editTip.style.display = showTip ? 'block' : 'none';
      if (!b || gesture?.kind === 'move') { hLen.style.display = hDia.style.display = 'none'; if (b && showTip) editTip.textContent = 'Let go to drop it here'; return; }
      editTip.textContent = 'Drag to move' + (b.caps.length || b.caps.diameter ? '. Round dots resize.' : '.');
      const top = b.caps.length ? px([b.pl.x1, 0, 0]) : null;
      hLen.style.display = top ? 'flex' : 'none'; if (top) { hLen.style.left = `${top.x - 11}px`; hLen.style.top = `${top.y - 11}px`; }
      const lat = lateralAxis(b.pl); const side = b.caps.diameter && lat.len > 0.5 ? px([b.pl.xc, lat.dir[1] * b.pl.r, lat.dir[2] * b.pl.r]) : null;
      hDia.style.display = side ? 'flex' : 'none'; if (side) { hDia.style.left = `${side.x - 11}px`; hDia.style.top = `${side.y - 11}px`; }
    }
    function begin(kind, e, extra = {}) {
      const b = partBox(); if (!b) return false;
      const u = kind === 'diameter' ? (() => { const l = lateralAxis(b.pl); return { u: axisPx([b.pl.xc, l.dir[1] * b.pl.r, l.dir[2] * b.pl.r], l.dir) }; })() : { u: axisPx([kind === 'length' ? b.pl.x1 : b.pl.xc, 0, 0], [1, 0, 0]) };
      if (!u.u || Math.hypot(...u.u) < 0.3) { toast('Turn the view so you can see it, then try again.', 'bad'); return false; }
      gesture = { k: localPoint(view.canvas, e).k, kind, id: b.c.id, name: b.c.name, u: u.u, x0: e.clientX, y0: e.clientY, len0: b.c.length, dia0: b.c.diameter, base: JSON.stringify(vehicle()), pending: 0, moved: 0, box0: true, ...extra };
      return true;
    }
    function drag(e) {
      if (!gesture) return;
      const v = vehicle(); const g = gesture;
      const total = (((e.clientX - g.x0) * g.u[0] + (e.clientY - g.y0) * g.u[1]) / g.k) / (g.u[0] ** 2 + g.u[1] ** 2);
      try {
        if (g.kind === 'length') { const L = setLength(v, g.id, (g.len0 ?? 0) + total); editTip.textContent = `Length ${show(L, 'm', 2)}`; }
        else if (g.kind === 'diameter') { const D = setDiameter(v, g.id, (g.dia0 ?? 0) + 2 * total); editTip.textContent = `Diameter ${show(D, 'm', 2)}`; }
        else if (g.kind === 'move') {
          const inc = total - g.moved; g.moved = total; g.pending += inc;
          const r = slide(v, g.id, g.pending, computeLayout(v)); g.pending = r.remainder ?? 0;
          if (r.blocked && !g.warned) { g.warned = true; toast(r.blocked, 'warn', 5000); }
          if (r.swapped) { g.moved = total; }
        }
      } catch (err) { toast(err.message, 'bad'); }
      setVehicleInView(); renderStrip();
    }
    function finish() {
      const g = gesture; gesture = null; if (!g) return;
      const v = vehicle(); const changed = JSON.stringify(v) !== g.base;
      if (changed) { commit(g.kind === 'move' ? `Move ${g.name}` : `Resize ${g.name} ${g.kind}`); onDesignChanged(true); } else renderAll();
      dirty();
    }
    for (const [el, kind] of [[hLen, 'length'], [hDia, 'diameter']]) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (begin(kind, e)) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } } });
      el.addEventListener('pointermove', (e) => { if (gesture?.kind === kind) drag(e); });
      el.addEventListener('pointerup', (e) => { if (gesture?.kind === kind) finish(); });
      el.addEventListener('pointercancel', () => finish());
    }
    if (view) view.dragHook = {
      start: (id, e) => { if (isSimple()) return false; const b = partBox(); if (!b || id !== S.sel || !b.caps.move || e.shiftKey) return false; return begin('move', e); },
      move: (e) => drag(e), end: () => finish(),
    };

    // ---------------------------------------------------------------- left: vehicle + tools + parts tree
    const mode = () => app.settings.mode;
    const n0 = (x) => Math.round(x).toLocaleString('en-US');
    function stageLabel(v, g, massG) {
      const st = v.stages.find((s) => s.id === g);
      const m = show(massG, 'kg', 0);
      if (st) { const pos = v.stages.length > 1 ? (st.order === Math.min(...v.stages.map((s) => s.order)) ? ' (bottom)' : st.order === Math.max(...v.stages.map((s) => s.order)) ? ' (top)' : '') : ''; return `${st.name}${pos} - ${m}`; }
      const names = { fairing: 'Nose cover', payload: 'Payload (the cargo)', other: 'Other parts' };
      return `${names[g] ?? g.charAt(0).toUpperCase() + g.slice(1)} - ${m}`;
    }
    const toolBtn = (id, ico, label, title, fn, disabled = false) => h('button', { class: 'ed-tb', id, title, 'aria-label': title, disabled, onclick: fn }, h('span', { class: 'ed-tb-i' }, ico), h('span', { class: 'ed-tb-l' }, label));
    async function removeSelected() {
      const c = S.sel && vehicle() ? findComponent(vehicle(), S.sel) : null; if (!c) return toast('Click a part first, then delete it.', 'info');
      const r = await app.api.execute('REMOVE_COMPONENT', { id: c.id });
      if (r.ok) { S.sel = null; commit(`Remove ${c.name}`); onDesignChanged(true); toast(`Removed ${c.name}. You can undo this.`, 'ok'); } else toast(r.message, 'bad');
    }
    function duplicateSelected() {
      const v = vehicle(); const c = S.sel && v ? findComponent(v, S.sel) : null; if (!c) return toast('Click a part first, then copy it.', 'info');
      try {
        const spec = JSON.parse(JSON.stringify(c)); delete spec.id; spec.name = `${c.name} (copy)`;
        const n = addComponent(v, spec, { after: c.id });
        S.sel = n.id; commit(`Copy ${c.name}`); onDesignChanged(true); toast(`Copied ${c.name}.`, 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    }
    function selectPart(id, { focus = true } = {}) {
      S.sel = id; S.scroll = true; renderAll();
      if (focus && view) setTimeout(() => view.focusPart(id), 30);
    }
    function renderLeft() {
      clear(left);
      const P = app.project, v = vehicle();
      const vsel = select(P.vehicleList().map((x) => [x.id, `${x.name} (${x.type})`]), P.activeVehicle, (id) => { P.activeVehicle = id; S.sel = null; app.commit('Select vehicle', { silent: true }); onDesignChanged(true); });
      vsel.style.width = '100%';
      if (mode() === 'beginner') left.append(h('div', { class: 'form ed-tight' }, h('button', { class: 'btn primary', id: 'back-simple', onclick: () => { fullEditor = false; renderAll(); } }, '← Simple builder')));
      left.append(h('div', { class: 'form ed-tight' },
        P.vehicleList().length ? vsel : h('p', { class: 'muted' }, 'No vehicle yet.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', title: 'Start a new vehicle', onclick: newMenu }, '+ New'),
          h('button', { class: 'btn small', id: 'ed-share', title: 'Send this design to someone, or open one you got', onclick: () => import('../lib/sharedialog.js').then((m) => m.openShareDialog(app)) }, 'Share'),
          h('details', { class: 'ed-veh-opts' }, h('summary', { class: 'btn small', title: 'Rename, copy or delete' }, '⋯'),
            h('div', { class: 'ed-pop' },
              h('button', { class: 'btn small', disabled: !v, onclick: async () => { const nm = await promptDialog('Rename vehicle', 'Name', v.name); if (nm) { v.name = nm; commit('Rename vehicle'); } } }, 'Rename'),
              h('button', { class: 'btn small', disabled: !v, onclick: () => { const c = cloneVehicle(v); c.id = undefined; c.name = `${v.name} (copy)`; P.setVehicle(c, { activate: true }); commit('Duplicate vehicle'); onDesignChanged(true); } }, 'Copy'),
              h('button', { class: 'btn small danger', disabled: !v, onclick: async () => { if (await confirmDialog('Delete vehicle', `Delete “${v.name}”? You can undo this.`)) { P.removeVehicle(v.id); S.sel = null; commit('Delete vehicle'); onDesignChanged(true); } } }, 'Delete vehicle'))))));
      if (!v) { left.append(h('div', { class: 'empty' }, 'Make a vehicle to start.')); return; }
      // tools: undo / redo / copy / delete; keyboard hints live behind "?"
      const hasSel = !!(S.sel && findComponent(v, S.sel));
      left.append(h('div', { class: 'ed-tools' },
        toolBtn('ed-undo', '↶', 'Undo', 'Undo the last change (Ctrl+Z)', () => app.undo()),
        toolBtn('ed-redo', '↷', 'Redo', 'Redo the change you undid (Ctrl+Y)', () => app.redo()),
        toolBtn('ed-dup', '⧉', 'Copy', 'Copy the selected part', duplicateSelected, !hasSel),
        toolBtn('ed-del', '×', 'Delete', 'Delete the selected part (you can undo it)', removeSelected, !hasSel),
        toolBtn('ed-help', '?', 'Help', 'Mouse and keyboard tips', () => { S.keys = !S.keys; renderLeft(); })),
        S.keys ? h('div', { class: 'ed-keys', id: 'ed-keys' }, h('div', null, 'Drag: turn.'), h('div', null, 'Right-drag: move.'), h('div', null, 'Wheel: zoom.'),
          h('div', null, 'Drag a chosen part: slide it.'), h('div', null, h('kbd', null, 'Ctrl+Z'), ' undo  ', h('kbd', null, 'Ctrl+Y'), ' redo')) : null);
      // "Add a part" + recommendation
      const issues = (() => { try { return validateVehicle(v, { body: v.meta?.body ?? 'earth' }); } catch { return []; } })();
      const rec = recommendNext(v, issues);
      const addRow = h('div', { class: 'form ed-tight' },
        h('button', { class: 'btn primary ed-add-big', id: 'add-part', title: 'Pick a part from the list', onclick: () => openPicker() }, '+ Add a part'),
        rec ? h('div', { class: 'ed-rec', id: 'ed-rec' }, h('span', { class: 'ed-rec-i' }, kindIcon(rec.kind)[0]),
          h('div', { class: 'ed-rec-t' }, h('b', null, `Next: ${rec.title}`), h('div', { class: 'muted' }, rec.why)),
          h('button', { class: 'btn small', id: 'ed-rec-add', onclick: () => openPicker({ kind: rec.kind }) }, 'Pick')) : null);
      left.append(addRow);
      { // the first problem with a one-click fix, always visible in the left column
        const bodyId = v.meta?.body ?? 'earth';
        const first = issues.filter((i) => i.severity !== 'info').map((i) => [i, fixButton(app, v, i, () => onDesignChanged(true), { body: bodyId })]).find((x) => x[1]);
        if (first) left.append(h('div', { class: 'ed-fixrec', id: 'ed-fixrec' }, h('b', null, 'Fix this'), h('div', { class: 'muted' }, plainIssue(first[0], v).text), first[1]));
      }
      // parts tree
      const groups = new Map();
      for (const c of v.components) { const g = c.group ?? 'other'; (groups.get(g) ?? groups.set(g, []).get(g)).push(c); }
      const order = [...v.stages.map((s) => s.id), 'fairing', 'payload', ...[...groups.keys()].filter((g) => !v.stages.some((s) => s.id === g) && !['fairing', 'payload'].includes(g))];
      const ul = h('ul', { class: 'tree ed-tree' });
      for (const g of [...new Set(order)]) {
        const items = groups.get(g); if (!items) continue;
        const massG = items.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1) + (c.propellantMass ?? 0) * (c.fill ?? 1) * (['fuel_tank', 'oxidizer_tank', 'propellant_tank'].includes(c.kind) ? 1 : 0), 0);
        const closed = S.collapsed.has(g);
        ul.append(h('li', null, h('div', { class: `grp ed-grp ${S.hiStage === g ? 'hi' : ''}`, 'data-stage': g, role: 'button', tabindex: 0, title: closed ? 'Show the parts of this group' : 'Hide the parts of this group', onclick: () => { closed ? S.collapsed.delete(g) : S.collapsed.add(g); renderLeft(); } },
          h('span', { class: 'ed-chev' }, closed ? '▸' : '▾'), h('span', { class: 'ed-grp-t' }, stageLabel(v, g, massG)), h('span', { class: 'ed-grp-n' }, String(items.length)))));
        if (closed) continue;
        for (const c of items) {
          const [ico, col] = kindIcon(c.kind);
          ul.append(h('li', null, h('div', { class: `item ed-item ${S.sel === c.id ? 'sel' : ''}`, 'data-id': c.id, 'data-kind': c.kind, title: c.description ?? '', onclick: () => selectPart(c.id) },
            h('span', { class: 'ed-ico', style: { background: col } }, ico),
            h('span', { class: 'ed-item-t' }, h('span', { class: 'ed-item-n' }, c.name), h('span', { class: 'ed-item-k' }, plainKind(c.kind))))));
        }
      }
      left.append(h('div', { class: 'ed-treewrap' }, ul));
      if (v.type === 'rocket') left.append(h('div', { class: 'form ed-tight' }, h('button', { class: 'btn small', title: 'Adds a whole stage with engines and tanks', onclick: addStageDialog }, '+ Add a stage')));
    }
    function newMenu() {
      modal({ title: 'New vehicle', body: h('div', { class: 'col' }, h('div', { class: 'create-row', style: { gridTemplateColumns: 'repeat(3,1fr)' } }, VEHICLE_KINDS.map(([k, label, ico, hint]) => h('button', { class: 'create-btn', onclick: (e) => { e.target.closest('.modal-back').remove(); createVehicleDialog(app, k, { then: () => onDesignChanged(true) }); } }, h('span', { class: 'big' }, icon(ico, { size: 30 })), h('b', null, label), h('span', { class: 'muted', style: { fontSize: '11.5px' } }, hint)))),
        h('button', { class: 'btn', onclick: async (e) => { e.target.closest('.modal-back').remove(); const r = await app.api.execute('CREATE_VEHICLE', { type: 'rocket', name: 'Blank rocket' }); if (r.ok) { commit('New blank rocket'); onDesignChanged(true); } else toast(r.message, 'bad'); } }, 'Blank rocket')) });
    }

    // ---------------------------------------------------------------- the visual "Add a part" picker
    async function addPart(catalogId) {
      const v = vehicle(); if (!v) { toast('Make a vehicle first.', 'bad'); return false; }
      const it = byCatalogId(catalogId); if (!it) return false;
      const selC = S.sel ? findComponent(v, S.sel) : null;
      const args = { catalogId: it.catalogId };
      if (selC) { args.group = selC.group; if (it.mount === 'internal' || ['payload', 'instrument', 'battery', 'avionics', 'guidance', 'computer', 'reaction_wheel', 'sensor'].includes(it.kind)) { const container = ['fairing', 'payload'].includes(selC.kind) || selC.parent === undefined && selC.mount === 'stack' ? selC : findComponent(v, selC.parent); if (container && (container.kind === 'fairing' || container.kind === 'payload' || container.kind === 'structural_section')) args.parent = container.id; } }
      else if (S.addStage && v.stages.some((s) => s.id === S.addStage)) args.group = S.addStage;
      const r = await app.api.execute('ADD_COMPONENT', args);
      if (!r.ok) { toast(r.message, 'bad', 7000); return false; }
      S.sel = r.data.componentId; S.scroll = true; commit(`Add ${it.name}`); onDesignChanged(true); toast(`Added ${it.name}.`, 'ok');
      if (view) setTimeout(() => view.focusPart(S.sel), 30);
      return true;
    }
    function openPicker(opts = {}) {
      const v = vehicle(); if (!v) return toast('Make a vehicle first.', 'bad');
      const rec = recommendNext(v, (() => { try { return validateVehicle(v, { body: v.meta?.body ?? 'earth' }); } catch { return []; } })());
      const st = { group: opts.kind ? (groupOfKind(opts.kind)?.id ?? 'go') : (groupOfKind(rec?.kind)?.id ?? 'go'), kind: opts.kind ?? null, q: '' };
      const body = h('div', { class: 'ed-picker', id: 'ed-picker' });
      const m = modal({ title: 'Add a part', body, wide: true, buttons: v.type === 'rocket' ? [{ label: 'Add a stage…', onClick: () => { setTimeout(addStageDialog, 0); return true; } }, { label: 'Close' }] : [{ label: 'Close' }] });
      const mkCard = (it) => {
        const pl = it.plain ?? {}; const [ico, col] = kindIcon(it.kind);
        return h('button', { class: `ed-card ${rec && rec.kind === it.kind ? 'rec' : ''}`, 'data-catalog': it.catalogId, 'data-kind': it.kind, title: `Add ${it.name}`, onclick: async () => { if (await addPart(it.catalogId)) m.close(); } },
          h('span', { class: 'ed-card-h' }, h('span', { class: 'ed-ico big', style: { background: col } }, ico), h('b', null, it.name)),
          it.description ? h('span', { class: 'ed-card-d' }, it.description) : null,
          pl.best_for ? h('span', { class: 'ed-card-p good' }, pl.best_for) : null,
          pl.trade_off ? h('span', { class: 'ed-card-p std-only' }, pl.trade_off) : null);
      };
      const render = () => {
        clear(body);
        const q = st.q.trim().toLowerCase();
        const chips = h('div', { class: 'ed-chips' }, PICK_GROUPS.map((g) => h('button', { class: `chip ${!q && !st.kind && st.group === g.id ? 'active' : ''}`, 'data-group': g.id, onclick: () => { st.group = g.id; st.kind = null; st.q = ''; render(); } }, g.label)));
        const search = h('input', { class: 'input', id: 'ed-picker-search', type: 'search', placeholder: 'Search…', value: st.q, oninput: (e) => { st.q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); document.getElementById('ed-picker-search')?.focus(); }, 160); } });
        body.append(h('div', { class: 'ed-picker-top' }, chips, search));
        let list, title;
        if (q) { list = CATALOG.filter((c) => `${c.name} ${c.description ?? ''} ${KIND_LABELS[c.kind] ?? ''} ${KIND_SHORT[c.kind] ?? ''} ${c.plain?.best_for ?? ''}`.toLowerCase().includes(q)); title = `Results for “${st.q.trim()}”`; }
        else if (st.kind) { list = CATALOG.filter((c) => c.kind === st.kind); title = `${KIND_LABELS[st.kind] ?? st.kind} parts`; }
        else { const g = PICK_GROUPS.find((x) => x.id === st.group); list = CATALOG.filter((c) => g.kinds.includes(c.kind)); title = g.label; }
        if (st.kind && !q) body.append(h('div', { class: 'callout info ed-filter' }, `Only: ${KIND_LABELS[st.kind] ?? st.kind}. `, h('a', { href: '#', id: 'ed-show-all', onclick: (e) => { e.preventDefault(); st.kind = null; render(); } }, 'Show all parts')));
        const blurb = PICK_GROUPS.find((x) => x.id === st.group)?.kinds;
        const byKind = new Map(); for (const it of list) (byKind.get(it.kind) ?? byKind.set(it.kind, []).get(it.kind)).push(it);
        const wrap = h('div', { class: 'ed-cards-wrap' });
        if (!list.length) wrap.append(h('p', { class: 'muted' }, 'Nothing found.'));
        for (const [k, its] of [...byKind].sort((a, b) => (blurb ? blurb.indexOf(a[0]) - blurb.indexOf(b[0]) : 0))) {
          wrap.append(h('h4', { class: 'ed-kind-h' }, `${KIND_LABELS[k] ?? k}`, h('span', { class: 'muted std-only' }, ` ${KIND_SHORT[k] ?? ''}`)), h('div', { class: 'ed-cards' }, its.slice(0, 80).map(mkCard)));
        }
        body.append(h('div', { class: 'ed-picker-title' }, title), wrap);
      };
      render();
    }
    function addStageDialog() {
      const v = vehicle(); if (!v) return;
      const engines = CATALOG.filter((c) => c.kind === 'engine' && !c.solid && c.propellants.includes('LOX'));
      const st = { engine: engines.find((e) => e.catalogId === 'eng-al100')?.catalogId ?? engines[0].catalogId, count: 1, prop: 2000 };
      modal({ title: 'Add a stage', body: h('div', { class: 'col' },
        h('label', { class: 'field' }, 'Engine', select(engines.map((e) => [e.catalogId, e.name]), st.engine, (x) => (st.engine = x))),
        h('label', { class: 'field' }, 'How many engines', numberInput({ value: 1, min: 1, max: 19, step: 1, onchange: (x) => (st.count = Math.round(x)) })),
        h('label', { class: 'field' }, 'Fuel', numberInput({ value: 2000, min: 10, max: 5e6, unit: 'kg', onchange: (x) => (st.prop = x) })),
        h('p', { class: 'muted' }, 'It goes on top. Tanks are sized for you.')),
      buttons: [{ label: 'Cancel' }, { label: 'Add stage', primary: true, onClick: async () => { const r = await app.api.execute('CREATE_STAGE', { engine: st.engine, engineCount: st.count, propellantMass: st.prop }); if (!r.ok) { toast(r.message, 'bad', 7000); return false; } commit('Add stage'); onDesignChanged(true); toast(r.message, 'ok'); return true; } }] });
    }

    // ---------------------------------------------------------------- right: inspector
    const BIG = 1e9;
    function renderRight() {
      clear(right);
      const v = vehicle();
      if (!v) return;
      const c = S.sel ? findComponent(v, S.sel) : null;
      if (!c) {
        right.append(h('div', { class: 'form' }, h('h3', null, v.name),
          h('div', { class: 'ed-empty' }, h('b', null, 'Pick a part'), h('div', { class: 'muted' }, 'Click it in the picture or the list.')),
          mode() === 'beginner' ? null : h('label', { class: 'field' }, 'Notes about this vehicle', h('textarea', { class: 'input', rows: 3, value: v.description ?? '', onchange: (e) => { v.description = e.target.value; commit('Edit description'); } })),
          h('div', { class: 'note info adv-only' }, 'Data labels: ', dataBadge('real'), ' ', dataBadge('estimated'), ' ', dataBadge('user'), ' ', dataBadge('fictional'), h('br'), 'Built-in parts are ', dataBadge('fictional'), ' generic parts, not real products. Parts you edit become ', dataBadge('user'), '.')));
        return;
      }
      const adv = atLeast(mode(), 'engineer');
      const info = COMPONENT_INFO[c.kind];
      const fields = (KIND_FIELDS[c.kind] ?? []).filter((f) => c[f[0]] !== undefined);
      const basicKeys = BASICS[c.kind] ?? fields.slice(0, 3).map((f) => f[0]);
      const basics = fields.filter((f) => basicKeys.includes(f[0])).sort((a, b) => basicKeys.indexOf(a[0]) - basicKeys.indexOf(b[0]));
      const more = fields.filter((f) => !basics.includes(f));
      const [ico, col] = kindIcon(c.kind);
      const why = (key) => COMPONENT_INFO[c.kind]?.params?.find((p) => p[0] === key)?.[2];

      function fieldRow([key, label, unit, min, max, step], withSlider) {
        const ef = editFactor(unit);
        const lo = min * ef.f, hi = max * ef.f, val = c[key] * ef.f;
        const apply = (x, final) => {
          try { modifyComponent(v, c.id, { [key]: x / ef.f }); c.dataSource = 'user'; } catch (e) { toast(e.message, 'bad'); return false; }
          if (final) { commit(`Edit ${c.name}: ${label}`); onDesignChanged(false); } else { setVehicleInView(); renderStrip(); }
          return true;
        };
        const input = numberInput({ value: +val.toPrecision(7), min: lo, max: hi, step: step * ef.f, unit: ef.unit, width: '95px', onchange: (x) => apply(x, true) });
        const tip = why(key);
        let slider = null, warn = null;
        if (withSlider && Number.isFinite(val) && hi > lo) {
          const wide = lo > 0 && hi / lo > 100 && val > 0;
          const rk = `${c.id}.${key}`;
          let rg = S.ranges[rk];
          if (!rg) { rg = wide ? [Math.max(lo, val / 8), Math.min(hi, val * 8)] : [lo, hi]; if (!(rg[1] > rg[0])) rg = [lo, hi]; S.ranges[rk] = rg; }
          const toVal = (p) => { let x = wide ? rg[0] * (rg[1] / rg[0]) ** (p / 1000) : rg[0] + (rg[1] - rg[0]) * (p / 1000); if (step * ef.f >= 1) x = Math.round(x); else if (wide) x = +x.toPrecision(3); else x = Math.round(x / (step * ef.f)) * step * ef.f; return Math.min(hi, Math.max(lo, x)); };
          const toPos = (x) => Math.round(1000 * (wide ? Math.log(Math.max(x, rg[0]) / rg[0]) / Math.log(rg[1] / rg[0]) : (x - rg[0]) / (rg[1] - rg[0])));
          slider = h('input', { type: 'range', class: 'ed-slider', min: 0, max: 1000, step: 1, value: Math.min(1000, Math.max(0, toPos(val))), 'aria-label': label,
            oninput: (e) => { const x = toVal(+e.target.value); input.value = +x.toPrecision(7); apply(x, false); },
            onchange: (e) => { const x = toVal(+e.target.value); apply(x, true); } });
          const w = limitWarning(val, lo, hi, v.type === 'rover' ? 'rover' : v.type);
          if (w) warn = h('div', { class: 'ed-warn' }, w[0]);
        }
        return h('div', { class: 'ed-field', 'data-key': key, title: adv ? (tip ?? '') : '' },
          h('div', { class: 'rowf' }, h('label', null, fieldLabel(label, atLeast(mode(), 'engineer') ? 'advanced' : mode())), input), slider,
          tip && !adv ? h('div', { class: 'muted param-why ed-why' }, firstSentence(tip)) : null, warn);
      }

      const form = h('div', { class: 'form ed-insp' },
        h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('div', { class: 'ed-insp-h' }, h('span', { class: 'ed-ico big', style: { background: col } }, ico), h('div', null, h('h3', null, KIND_LABELS[c.kind] ?? c.kind), h('div', { class: 'muted ed-sub' }, KIND_SHORT[c.kind] ?? ''))), dataBadge(c.dataSource)),
        info ? h('div', { class: 'callout info what-is' }, h('b', null, 'What is this? '), adv ? info.whatItDoes : (mode() === 'beginner' ? info.oneLine : info.whatItDoes),
          h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small', id: 'learn-part', onclick: () => app.navigate('academy', { component: c.kind }) }, 'Learn more'), h('button', { class: 'btn small', onclick: () => view?.focusPart(c.id) }, 'Focus'))) : null,
        h('label', { class: 'field' }, 'Name', h('input', { class: 'input', type: 'text', value: c.name, onchange: (e) => { c.name = e.target.value.slice(0, 80); c.dataSource = 'user'; commit('Rename part'); renderLeft(); } })),
        basics.length ? h('div', { class: 'ed-sec-h' }, 'Main numbers') : null,
        basics.map((f) => fieldRow(f, true)));
      // More settings (collapsed)
      const moreBody = [];
      if (c.description) moreBody.push(h('div', { class: 'muted', style: { fontSize: '12px' } }, c.description));
      for (const f of more) moreBody.push(fieldRow(f, false));
      if (c.kind === 'engine' && c.solid) moreBody.push(h('label', { class: 'field', title: 'How the push of a solid motor changes while it burns. The same fuel is burned either way, so the total push stays the same.' }, 'Thrust shape',
        h('select', { class: 'input', id: 'ed-thrust-shape', onchange: (e) => { if (e.target.value === 'flat') delete c.thrustShape; else c.thrustShape = e.target.value; c.dataSource = 'user'; commit('Change thrust shape'); } },
          THRUST_SHAPE_IDS.map((id) => h('option', { value: id, selected: (c.thrustShape ?? 'flat') === id }, THRUST_SHAPES[id].label)))));
      if (c.kind === 'engine' && c.propellants) moreBody.push(h('div', { class: 'muted', style: { fontSize: '12px' } }, `Burns: ${c.propellants.join(' + ')}`));
      if (['fuel_tank', 'oxidizer_tank', 'propellant_tank'].includes(c.kind)) moreBody.push(h('div', { class: 'muted', style: { fontSize: '12px' } }, `Holds ${c.propellant} · length ${show(c.length, 'm', 2)} · empty weight ${show(c.mass, 'kg', 1)}`));
      if (adv) moreBody.push(h('div', { class: 'muted mono', style: { fontSize: '11px' } }, `id ${c.id} · group ${c.group ?? '–'} · mount ${c.mount}${c.parent ? ` · parent ${c.parent}` : ''}`));
      if (moreBody.length) form.append(h('details', { class: 'ed-more', id: 'ed-more', open: S.moreOpen || adv, ontoggle: (e) => { S.moreOpen = e.target.open; } }, h('summary', null, 'More'), h('div', { class: 'ed-more-body' }, moreBody)));
      form.append(h('div', { class: 'row' },
        h('button', { class: 'btn small danger', id: 'remove-part', title: 'Delete this part (you can undo it)', onclick: removeSelected }, 'Remove'),
        h('button', { class: 'btn small', onclick: () => { S.sel = null; renderAll(); } }, 'Done')));
      right.append(form);
    }

    // ---------------------------------------------------------------- bottom: analysis
    function renderStrip() {
      clear(strip);
      if (isSimple()) return;
      const v = vehicle(); if (!v) { strip.append(emptyState('No vehicle', 'Press + New.')); return; }
      let sum, an, issues = [], fc = null;
      const body = v.meta?.body ?? 'earth';
      try { sum = vehicleSummary(v, body); an = analyzeVehicle(v, { body }); issues = validateVehicle(v, { body }); } catch (e) { strip.append(h('div', { class: 'note' }, `Analysis not available: ${e.message}`)); return; }
      const isRocket = v.type === 'rocket';
      if (isRocket) { try { fc = flyChecks(v, body, app.project.mission); } catch { fc = null; } }
      const adv = atLeast(mode(), 'engineer');
      const shown = issues.filter((i) => i.severity !== 'info');
      const st = an.stages.filter((s) => s.propellant > 0 || s.engines > 0);
      const numbers = adv || S.showNumbers;
      if (!adv) {
        const twr = sum.liftoffTWR, dv = sum.dvVacuum;
        const fuelPct = sum.totalMass > 0 ? Math.round(100 * sum.propellantMass / sum.totalMass) : 0;
        const stu = atLeast(mode(), 'student');
        strip.append(h('div', { class: 'ed-cards4', id: 'ed-stats' },
          stat('Weight', show(sum.totalMass, 'kg', 0), `${fuelPct}% fuel`),
          isRocket ? stat('Push', `${fmt(twr, 1)}×`, twr < 1 ? 'Too weak' : twr < 1.2 ? 'Barely' : 'Strong enough', twr < 1 ? 'bad' : twr < 1.2 ? 'warn' : 'ok') : stat('Parts', String(sum.components), 'on board'),
          stat(stu ? term('delta-v', 'Speed (delta-v)') : 'Speed', Number.isFinite(dv) ? `${n0(dv)} m/s` : '–', Number.isFinite(dv) ? (isRocket ? `Needs: ${n0(fc?.need?.dv ?? ORBIT_DV)}` : `${n0(dv * 3.6)} km/h more`) : 'Needs engine and fuel', isRocket && Number.isFinite(dv) ? (dv >= ORBIT_DV ? 'ok' : dv >= ORBIT_DV * 0.9 ? 'warn' : 'bad') : ''),
          stat(isRocket ? 'Height' : 'Size', isRocket ? show(sum.length, 'm', 1) : `${show(sum.length, 'm', 1)} long`, `${show(sum.diameter, 'm', 2)} wide`)));
        if (fc) strip.append(h('div', { class: 'ed-lights', id: 'ed-lights' }, fc.items.map((it) => h('div', { class: 'ed-lightcard', id: `ed-check-${it.id}`, 'data-state': it.state, title: it.text }, light(it.state), h('div', null, h('b', null, it.q), h('div', { class: 'muted' }, firstSentence(it.text)))))));
        strip.append(h('div', { class: 'ed-numbtn' }, h('button', { class: 'btn small', id: 'show-numbers', 'aria-expanded': String(!!S.showNumbers), onclick: () => { S.showNumbers = !S.showNumbers; renderStrip(); } }, S.showNumbers ? 'Hide' : `More${shown.length ? ` (${shown.length})` : ''}`)));
      } else {
        strip.append(h('div', { class: 'grid g4', style: { padding: '10px 12px 4px' } },
          stat('Total mass', show(sum.totalMass, 'kg', 0), `dry ${show(sum.dryMass, 'kg', 0)} · propellant ${show(sum.propellantMass, 'kg', 0)}`),
          stat(isRocket ? term('TWR', 'Liftoff thrust / weight') : term('delta-v', 'Δv capability'), isRocket ? `${fmt(sum.liftoffTWR, 2)} ×` : show(sum.dvVacuum, 'm/s', 0), isRocket ? (sum.liftoffTWR < 1 ? 'cannot lift off' : sum.liftoffTWR < 1.2 ? 'marginal' : 'ok') : 'vacuum, rocket equation', isRocket ? (sum.liftoffTWR < 1 ? 'bad' : sum.liftoffTWR < 1.2 ? 'warn' : 'ok') : ''),
          stat(term('delta-v', 'Δv (vacuum, sum of stages)'), show(sum.dvVacuum, 'm/s', 0), `estimate for launch ≈ ${show(sum.dvEstimate, 'm/s', 0)}`),
          stat('Size', `${show(sum.length, 'm', 1)} × ${show(sum.diameter, 'm', 2)}`, `${sum.components} components`)));
      }
      const addLevels = () => {
      try {   // detail levels: Student formulas with this design's numbers, Engineer ratios + budget + sensitivity, Expert physics options (presentation only)
        const lvBox = h('div', { class: 'col', style: { padding: '0 12px 12px' } });
        const lv = mode();
        if (atLeast(lv, 'student')) { const sf = studentFormulas(app, v); if (sf) lvBox.append(sf); }
        if (atLeast(lv, 'engineer')) { const ed = engineerDesign(app, v); if (ed) lvBox.append(ed); if (app.project.mission && isRocket) lvBox.append(h('div', { class: 'eng-only' }, sensitivityPanel(app))); }
        if (atLeast(lv, 'expert')) lvBox.append(physicsOptionsPanel(app));
        if (lvBox.childNodes.length) strip.append(lvBox);
      } catch (e) { console.warn('level panels', e); }
      };
      if (!numbers) { addLevels(); return; }
      const stTable = st.length ? h('table', { class: 'ed-table', style: { margin: '6px 12px' } }, h('thead', null, h('tr', null, ['Stage', 'Engines', 'Ignition mass', 'Propellant', 'Thrust (vac)', 'Burn time', 'Δv (vac)', 'T/W'].map((t) => h('th', { class: t === 'Stage' ? '' : 'num' }, t)))),
        h('tbody', null, st.map((s) => h('tr', null, h('td', null, s.name), h('td', { class: 'num' }, s.engines), h('td', { class: 'num' }, show(s.ignitionMass, 'kg', 0)), h('td', { class: 'num' }, show(s.propellant, 'kg', 0)), h('td', { class: 'num' }, show(s.thrustVac, 'N', 0)), h('td', { class: 'num' }, `${fmt(s.burnTime, 0)} s`), h('td', { class: 'num' }, show(s.dvVac, 'm/s', 0)), h('td', { class: 'num' }, fmt(s.twrStart, 2)))))) : null;
      const row = (i) => {
        const p = adv ? { text: i.message } : plainIssue(i, v);
        const btn = i.componentId && findComponent(v, i.componentId) ? h('button', { class: 'btn small', 'data-show': i.componentId, onclick: () => selectPart(i.componentId) }, 'Show')
          : p.addKind ? h('button', { class: 'btn small', 'data-add': p.addKind, onclick: () => openPicker({ kind: p.addKind }) }, 'Add') : null;
        const fixb = fixButton(app, v, i, () => onDesignChanged(true), { body });
        const nofix = !fixb && NO_FIX[i.code] ? h('div', { class: 'muted ed-nofix' }, NO_FIX[i.code]) : null;
        return h('div', { class: `callout ed-issue ${i.severity === 'error' ? 'bad' : 'warn'}`, 'data-code': i.code }, h('div', { class: 'ed-issue-body' }, h('span', { class: 'ed-issue-t' }, `${i.severity === 'error' ? 'Fix:' : 'Note:'} ${adv && i.code ? `[${i.code}] ` : ''}${p.text}`), nofix), h('div', { class: 'ed-issue-btns' }, btn, fixb));
      };
      const iss = h('div', { class: 'ed-issues', style: { padding: '4px 12px 10px', display: 'grid', gap: '4px' } }, shown.length ? shown.map(row) : [h('div', { class: 'callout ok' }, adv ? 'No design errors or warnings found by the static checks. (Only a simulation shows whether the vehicle works.)' : 'No mistakes found. Only a flight shows if it works.')]);
      strip.append(stTable, iss);
      addLevels();
      if (app.settings.educational && st.length) {
        strip.append(h('div', { class: 'std-only', style: { padding: '0 12px 12px' } }, h('h3', null, 'The rocket equation'),
          st.slice(0, 3).map((s) => equation(`${s.name}: Tsiolkovsky`, 'Δv = Isp · g₀ · ln(m₀ / m_f)', `Isp ≈ ${fmt(s.thrustVac > 0 ? (s.dvVac / (G0 * Math.log(s.ignitionMass / Math.max(s.ignitionMass - s.propellant, 1)))) : 0, 0)} s, m₀ = ${fmt(s.ignitionMass, 0)} kg, m_f = ${fmt(s.ignitionMass - s.propellant, 0)} kg → Δv = ${fmt(s.dvVac, 0)} m/s`)),
          equation('Liftoff condition', 'T / (m · g) > 1', `${fmt(sum.liftoffTWR, 2)} ${sum.liftoffTWR > 1 ? '> 1: the rocket can lift off' : '< 1: the rocket stays on the pad'}`)));
      }
    }

    // ---------------------------------------------------------------- glue
    function commit(label) { app.commit(label, { silent: true }); }
    function onDesignChanged(rebuildMesh) { if (S.sel && !(vehicle() && findComponent(vehicle(), S.sel))) S.sel = null; if (rebuildMesh) setVehicleInView(); else if (view) { setVehicleInView(); } renderAll(false); }
    const simple = createSimplePanel({ app, S, view, vehicle, commit, onDesignChanged, renderAll: () => renderAll(), newMenu, openFull: (id) => { if (id) S.sel = id; fullEditor = true; renderAll(); } });
    function applyLayout() {
      const sm = isSimple();
      layout.classList.toggle('ed-grid-simple', sm); layout.classList.toggle('ed-grid-full', !sm);
      left.style.display = sm ? 'none' : ''; strip.style.display = sm ? 'none' : '';
      layout.classList.toggle('simple-mode', sm); right.classList.toggle('simple-side', sm);
      if (!sm) right.removeAttribute('id');
    }
    function renderAll(rebuild = false) {
      applyLayout();
      const keep = left.scrollTop;
      if (isSimple()) { clear(left); simple(right); } else { renderLeft(); renderRight(); left.scrollTop = keep; }
      if (S.scroll && !isSimple()) { S.scroll = false; left.querySelector('.item.sel')?.scrollIntoView({ block: 'center' }); }
      renderStrip(); dirty(); if (rebuild) setVehicleInView();
    }
    const off = app.on('design', () => { holo(); setVehicleInView(); S.sel = S.sel && vehicle() && findComponent(vehicle(), S.sel) ? S.sel : null; renderAll(); });
    setVehicleInView(); renderAll();

    // ---------------------------------------------------------------- deep link: app.navigate('designer', { full, select, stage, addKind, note })
    let hiTimer = null;
    const dl = params ?? {};
    if (dl.full || dl.select || dl.stage || dl.addKind) { if (app.settings.mode === 'beginner') fullEditor = true; }
    if (!isSimple() || dl.select || dl.stage || dl.addKind || dl.note) {
      const v0 = vehicle();
      if (dl.select && v0 && findComponent(v0, dl.select)) { S.sel = dl.select; S.scroll = true; }
      if (dl.stage && v0) { S.addStage = dl.stage; S.hiStage = dl.stage; S.collapsed.delete(dl.stage); clearTimeout(hiTimer); hiTimer = setTimeout(() => { S.hiStage = null; if (!isSimple()) renderLeft(); }, 8000); }
      if (dl.note) showNote(String(dl.note).slice(0, 240));
      renderAll();
      if (S.sel && view) setTimeout(() => view.focusPart(S.sel), 120);
      if (dl.stage && !dl.select) setTimeout(() => left.querySelector('.ed-grp.hi')?.scrollIntoView({ block: 'center' }), 50);
      if (dl.addKind) setTimeout(() => openPicker({ kind: String(dl.addKind) }), 60);
    }
    function showNote(text) {
      clear(noteEl); noteEl.style.display = '';
      noteEl.append(h('span', { class: 'ed-note-t' }, text), h('button', { class: 'ed-note-x', id: 'ed-note-x', title: 'Close', 'aria-label': 'Close this note', onclick: () => { noteEl.style.display = 'none'; } }, '×'));
    }
    return () => { off(); stop?.(); clearTimeout(hiTimer); clearTimeout(holoT); if (view) { view.onChange = view.onPick = view.onHover = view.dragHook = null; view.hover = null; } };
  },
};
