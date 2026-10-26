// Share dialog (2.0): save the active design as a file, copy a link or a code, or open a design someone shared.
import { h, modal, toast } from './dom.js';
import { saveFile, pickFile } from './widgets.js';
import { designLink, designFileText, designFileName, readDesign, importDesign } from '../../src/core/share.js';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try { const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }); ta.value = text; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}

/** Show a shared design and ask before adding it to the project. */
export async function confirmImport(app, input) {
  let d;
  try { d = await readDesign(input); } catch (e) { toast(`Could not open the design: ${e.message}`, 'bad', 8000); return null; }
  return new Promise((resolve) => {
    const parts = d.vehicle.components.length;
    modal({ title: 'Open a shared design', body: h('div', { class: 'col', id: 'share-confirm' },
      h('p', null, h('b', null, d.vehicle.name ?? 'Shared design'), ` · ${d.vehicle.type ?? 'vehicle'} · ${parts} parts${d.mission ? ' · with its mission' : ''}`),
      d.author ? h('p', { class: 'muted' }, `From: ${d.author}`) : null,
      d.note ? h('div', { class: 'callout info' }, d.note) : null,
      h('p', { class: 'muted' }, 'It is added as a new design. Your own designs stay as they are.')),
    buttons: [{ label: 'Cancel', onClick: () => resolve(null) }, { label: 'Add it to my project', primary: true, onClick: () => {
      const v = importDesign(app.project, d); app.commit?.('Open shared design'); app.markDirty?.(); app.emit?.('design', 'shared');
      toast(`Added "${v.name}". Press Test it or Launch to see if it works.`, 'ok', 7000); app.navigate('designer'); resolve(v);
    } }] });
  });
}

export async function openShareDialog(app) {
  const v = app.project.vehicle, m = app.project.mission;
  const note = h('input', { type: 'text', class: 'input', id: 'share-note', placeholder: 'A message for the person you send it to (optional)', maxlength: 300, style: { width: '100%' } });
  const out = h('textarea', { class: 'input share-out', id: 'share-out', readonly: true, rows: 3, style: { width: '100%' } });
  const paste = h('textarea', { class: 'input', id: 'share-in', rows: 3, placeholder: 'Paste a link (astralab://design/...) or a code here', style: { width: '100%' } });
  let link = '';
  const makeLink = async () => { link = await designLink(v, m, { note: note.value }); out.value = link; return link; };
  const send = v ? h('div', { class: 'col' },
    h('h4', null, `Send "${v.name}"`), note,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', id: 'share-copy', onclick: async () => { await makeLink(); toast(await copyText(link) ? 'Link copied. Paste it into a message or e-mail.' : 'Select the link below and copy it.', 'ok'); } }, 'Copy link'),
      h('button', { class: 'btn', id: 'share-file', onclick: () => saveFile(app, designFileName(v), designFileText(v, m, { note: note.value }), 'application/json') }, 'Save as file')),
    out, h('p', { class: 'muted' }, 'The link opens ASTRA LAB on a computer where it is installed. Chat apps that do not make it clickable: the receiver pastes it below.'))
    : h('p', { class: 'muted' }, 'Build or load a design first, then you can share it.');
  const receive = h('div', { class: 'col' }, h('h4', null, 'Open a design someone sent you'), paste,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', id: 'share-open', onclick: async () => { const r = await confirmImport(app, paste.value); if (r) dlg.close(); } }, 'Open'),
      h('button', { class: 'btn', id: 'share-open-file', onclick: async () => { const f = await pickFile('.json'); if (!f) return; const r = await confirmImport(app, f.text); if (r) dlg.close(); } }, 'Open a design file…')));
  const dlg = modal({ title: 'Share designs', body: h('div', { class: 'share-grid' }, send, receive), wide: true, buttons: [{ label: 'Close' }] });
  if (v) makeLink().catch(() => {});
  return dlg;
}

/** Links that arrive while the app runs (astralab://design/... clicked in another program). */
export function installShareLinks(app) {
  const b = app.bridge ?? globalThis.astra;
  if (!b?.onShareLink) return;
  b.onShareLink((link) => confirmImport(app, link));
  b.pendingShareLink?.().then((link) => { if (link) confirmImport(app, link); }).catch(() => {});
}
