// Projects: local project files (JSON), open / new / save / delete, import & export, vehicles and missions of the project, version history.
import { h, clear, toast, confirmDialog, promptDialog } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { panel, saveFile, pickFile, dataBadge, emptyState } from '../lib/widgets.js';

const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso ?? ''; } };

export default {
  id: 'projects', title: 'Projects',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    let disposed = false;

    async function render() {
      const P = app.project; let list = [];
      try { list = await app.listProjects(); } catch (e) { toast(`Cannot read the project folder: ${e.message}`, 'bad'); }
      if (disposed) return;
      clear(page);
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Projects'), h('p', { class: 'std-only' }, `Projects are stored as plain JSON files in your ASTRA LAB data folder (${app.storageNote}). A project holds vehicles, missions, recorded simulations, experiments and the AI conversation.`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'proj-new', onclick: async () => { const n = await promptDialog('New project', 'Project name', 'New project'); if (n) { await app.newProject(n); toast(`Created “${n}”`, 'ok'); app.navigate('home'); } } }, '+ New project'),
          h('button', { class: 'btn std-only', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const p = app.importBundleText(f.text); toast(`Imported “${p.name}”`, 'ok'); app.navigate('designer'); } catch (e) { toast(`Import failed: ${e.message}`, 'bad', 8000); } } }, 'Import bundle…'))));

      // current project
      const nameIn = h('input', { class: 'input', id: 'proj-name-in', value: P.name, style: { width: '260px' } });
      const descIn = h('textarea', { class: 'input std-only', rows: 2, placeholder: 'Description (optional)' }, P.description ?? '');
      page.append(panel(app.settings.mode === 'beginner' ? 'My project' : 'Current project', h('div', { class: 'col' },
        h('div', { class: 'row' }, h('label', { class: 'field' }, 'Name', nameIn),
          h('button', { class: 'btn', style: { alignSelf: 'end' }, onclick: async () => { const n = nameIn.value.trim(); if (!n) return; const old = P.dir; P.name = n; P.description = descIn.value; if (old) { P.dir = null; } app.markDirty(); await app.save(); if (old && old !== P.dir) { try { await app.storage.remove(old); } catch { /* ignore */ } } render(); } }, app.settings.mode === 'beginner' ? 'Save name' : 'Rename & save')),
        descIn,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'proj-save', onclick: async () => { P.description = descIn.value; await app.save(); render(); } }, app.settings.mode === 'beginner' ? 'Save' : 'Save now'),
          h('button', { class: 'btn std-only', onclick: () => saveFile(app, `${P.name.replace(/[^\w.-]+/g, '_')}.astra-bundle.json`, app.exportBundle(), 'application/json') }, 'Export bundle (vehicles + missions)'),
          h('span', { class: 'muted std-only' }, `${Object.keys(P.vehicles).length} vehicle(s) · ${Object.keys(P.missions).length} mission(s) · ${P.runs.length} run(s) · last saved: ${P.dir ? 'in ' + P.dir : 'not yet'} · autosave ${app.settings.autosave ? 'on' : 'off'}`)))));

      // all projects
      page.append(panel(`Saved projects (${list.length})`, list.length ? h('table', null, h('thead', null, h('tr', null, ['Name', 'Modified', 'Vehicles', 'Runs', ''].map((t, i) => h('th', { class: i >= 1 && i <= 3 ? 'std-only' : '' }, t)))),
        h('tbody', null, list.map((p) => h('tr', { class: p.dir === P.dir ? 'sel' : '' }, h('td', null, h('b', null, p.name), p.dir === P.dir ? h('span', { class: 'muted' }, '  (open)') : null, h('div', { class: 'muted mono std-only', style: { fontSize: '11px' } }, p.dir)), h('td', { class: 'std-only' }, when(p.modified)), h('td', { class: 'num std-only' }, String(p.vehicles)), h('td', { class: 'num std-only' }, String(p.runs)),
          h('td', null, h('div', { class: 'row' }, p.dir === P.dir ? null : h('button', { class: 'btn small', onclick: async () => { try { await app.openProject(p.dir); toast(`Opened “${p.name}”`, 'ok'); app.navigate('home'); } catch (e) { toast(`Could not open: ${e.message}`, 'bad', 8000); } } }, 'Open'),
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Delete project', `Delete “${p.name}” and all its recorded simulations from disk? This cannot be undone.`)) { await app.deleteProject(p.dir); render(); } } }, 'Delete'))))))) : emptyState('Nothing saved yet', app.settings.mode === 'beginner' ? 'Your work saves by itself.' : 'Your work is saved automatically a few seconds after each change, or press Ctrl+S.')));

      // vehicles + missions
      const veh = P.vehicleList(), mis = P.missionList();
      page.append(h('div', { class: 'grid g2 std-only' },
        panel('Vehicles in this project', veh.length ? h('table', null, h('tbody', null, veh.map((v) => h('tr', null, h('td', null, h('b', null, v.name), h('span', { class: 'muted' }, `  ${v.type}`), v.active ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'ACTIVE') : null),
          h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, v.active ? null : h('button', { class: 'btn small', onclick: () => { P.activeVehicle = v.id; app.commit(`Activated ${v.name}`); render(); } }, 'Make active'),
            h('button', { class: 'btn small', onclick: () => { const c = JSON.parse(JSON.stringify(P.vehicles[v.id])); c.id = undefined; c.name = `${v.name} (copy)`; P.setVehicle(c, { activate: true }); app.commit(`Duplicated ${v.name}`); render(); } }, 'Duplicate'),
            h('button', { class: 'btn small', onclick: () => app.navigate('designer') }, 'Edit'),
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Remove vehicle', `Remove “${v.name}” from the project? (You can undo this.)`)) { P.removeVehicle(v.id); app.commit(`Removed ${v.name}`); render(); } } }, icon('cross', { size: 14 })))))))) : emptyState('No vehicle yet', 'Build your first rocket.', [h('button', { class: 'btn primary', onclick: () => app.navigate('designer') }, 'Build a rocket')], icon('rocket', { size: 32 }))),
        panel('Missions in this project', mis.length ? h('table', null, h('tbody', null, mis.map((m) => h('tr', null, h('td', null, h('b', null, m.name), h('span', { class: 'muted' }, `  ${m.objective ?? ''}`), m.active ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'ACTIVE') : null),
          h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, m.active ? null : h('button', { class: 'btn small', onclick: () => { P.activeMission = m.id; app.commit(`Activated ${m.name}`); render(); } }, 'Make active'),
            h('button', { class: 'btn small', onclick: () => app.navigate('planner') }, 'Edit'),
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Remove mission', `Remove “${m.name}” from the project? (You can undo this.)`)) { P.removeMission(m.id); app.commit(`Removed ${m.name}`); render(); } } }, icon('cross', { size: 14 })))))))) : emptyState('No mission yet', 'A mission says where the rocket goes.', [h('button', { class: 'btn primary', onclick: () => app.navigate('planner') }, 'Plan a mission')], icon('target', { size: 32 })))));

      // version history: the full list, compare and restore live on the Design history screen
      const vers = app.session.versions();
      page.append(h('div', { class: 'std-only' }, panel(`Version history (${vers.length})`, h('div', { class: 'row' },
        h('span', { class: 'grow muted' }, 'Every design change (yours or the AI engineer’s) is a version. Compare two versions or restore one; a restore never deletes anything.'),
        h('button', { class: 'btn primary', id: 'proj-history', onclick: () => app.navigate('history') }, 'Open design history')))));
    }
    render();
    const offs = [app.on('project', render), app.on('design', () => render()), app.on('save-state', (s) => { if (s === 'saved') render(); })];
    return () => { disposed = true; offs.forEach((f) => f()); };
  },
};
