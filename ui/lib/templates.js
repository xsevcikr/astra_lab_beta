// "Ready-made rockets" picker: one click loads a finished design (and its mission) into the project.
import { h, modal, toast } from './dom.js';
import { icon } from './icons.js';
import { TEMPLATES } from '../../data/templates.js';

export async function openTemplatePicker(app) {
  const DIFF = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  let m;
  const cards = TEMPLATES.map((t) => h('button', {
    class: 'tpl-card', id: `tpl-${t.id}`, title: `Load: ${t.title}`,
    onclick: async () => {
      try {
        const v = await t.build(app);
        app.emit?.('design');
        m?.close?.();
        toast(`Loaded "${v.name}".`, 'ok');
        app.navigate('designer');
      } catch (e) { toast(`Could not load it: ${e.message}`, 'bad'); }
    },
  }, h('div', { class: 'tpl-ico' }, icon(t.emoji ?? 'rocket', { size: 28 })), h('b', null, t.title), h('div', { class: 'muted' }, t.blurb), h('span', { class: 'chip' }, DIFF[t.difficulty] ?? '')));
  m = modal({ title: 'Ready-made rockets', body: h('div', { class: 'col' }, h('p', { class: 'muted' }, 'Pick one. Change anything later.'), h('div', { class: 'tpl-grid' }, cards)), wide: true, buttons: [{ label: 'Close' }] });
}
