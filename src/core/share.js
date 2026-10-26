// Share designs (2.0). A design (vehicle + its mission) travels as
//   * a file:  <name>.astra-design.json   (plain JSON, format 'astra.design/1')
//   * a link:  astralab://design/<code>   (the same JSON, gzip-compressed and base64url-encoded; opens ASTRA LAB when installed)
//   * a code:  the <code> part alone, for chat apps that do not make custom links clickable.
// Decoding never trusts the input: size limits, format check, and a light shape check before anything reaches the project.
import { gzip, gunzip } from './compress.js';

export const DESIGN_FORMAT = 'astra.design/1';
export const LINK_PREFIX = 'astralab://design/';
const MAX_JSON = 4 * 1024 * 1024, MAX_CODE = 2 * 1024 * 1024;

const b64url = (bytes) => {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (str) => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
};

/** The JSON document for a design. `note` is an optional message from the sender. */
export function designDocument(vehicle, mission = null, { note = '', author = '' } = {}) {
  if (!vehicle?.components?.length) throw new Error('There is no design to share yet');
  return { format: DESIGN_FORMAT, created: new Date().toISOString(), app: 'ASTRA LAB', author: String(author).slice(0, 80), note: String(note).slice(0, 500), vehicle, mission };
}
export const designFileText = (vehicle, mission, opts) => JSON.stringify(designDocument(vehicle, mission, opts), null, 1);
export const designFileName = (vehicle) => `${String(vehicle?.name ?? 'design').replace(/[^\w.-]+/g, '_').slice(0, 60)}.astra-design.json`;

export async function designCode(vehicle, mission, opts) {
  const json = JSON.stringify(designDocument(vehicle, mission, opts));
  return b64url(await gzip(new TextEncoder().encode(json)));
}
export async function designLink(vehicle, mission, opts) { return LINK_PREFIX + await designCode(vehicle, mission, opts); }

/** Check a parsed document and return {vehicle, mission, note, author}. Throws a plain-language error. */
export function checkDesign(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('This is not an ASTRA LAB design');
  if (doc.format === 'astra.bundle/1') throw new Error('This is a whole project bundle: open it in Projects > Import bundle');
  if (doc.format !== DESIGN_FORMAT) throw new Error('This is not an ASTRA LAB design (unknown format)');
  const v = doc.vehicle;
  if (!v || typeof v !== 'object' || !Array.isArray(v.components) || !v.components.length) throw new Error('The design has no parts');
  if (v.components.length > 2000) throw new Error('The design has too many parts');
  for (const c of v.components) if (!c || typeof c !== 'object' || typeof (c.kind ?? c.catalogId) !== 'string') throw new Error('The design has a broken part');
  if (doc.mission != null && (typeof doc.mission !== 'object' || !Array.isArray(doc.mission.events ?? []))) throw new Error('The design has a broken mission');
  return { vehicle: v, mission: doc.mission ?? null, note: String(doc.note ?? ''), author: String(doc.author ?? '') };
}

/** Read a design from a file text, a link or a bare code. */
export async function readDesign(input) {
  let s = String(input ?? '').trim();
  if (!s) throw new Error('Paste a link or a code first');
  if (s.startsWith('{')) { if (s.length > MAX_JSON) throw new Error('The file is too large'); let doc; try { doc = JSON.parse(s); } catch { throw new Error('The file is not valid JSON'); } return checkDesign(doc); }
  const at = s.indexOf('design/'); if (s.startsWith('astralab:')) s = at >= 0 ? s.slice(at + 7) : s.replace(/^astralab:\/*/, '');
  s = s.replace(/[\s"'<>]/g, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('That does not look like a design link or code');
  if (s.length > MAX_CODE) throw new Error('The code is too long');
  let text;
  try { const raw = await gunzip(unb64url(s)); if (raw.length > MAX_JSON) throw new Error('big'); text = new TextDecoder().decode(raw); }
  catch { throw new Error('The code is damaged or incomplete (was it copied completely?)'); }
  let doc; try { doc = JSON.parse(text); } catch { throw new Error('The code is damaged'); }
  return checkDesign(doc);
}

/** Put a shared design into a project as new, active vehicle (+ mission). Fresh ids so it never overwrites the user's own designs. */
export function importDesign(project, design) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const v = clone(design.vehicle); const m = design.mission ? clone(design.mission) : null;
  const rid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  v.id = rid('veh'); v.name = /\(shared\)$/.test(v.name ?? '') ? v.name : `${v.name ?? 'Shared design'} (shared)`;
  v.meta = { ...(v.meta ?? {}), sharedNote: design.note || undefined, sharedBy: design.author || undefined };
  project.setVehicle(v, { activate: true });
  if (m) { m.id = rid('mis'); m.vehicleName = v.name; project.setMission(m, { activate: true }); }
  return v;
}
