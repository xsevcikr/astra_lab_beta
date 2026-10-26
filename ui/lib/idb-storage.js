// Storage adapter for a plain browser (development server, or when the Electron disk bridge is unavailable): IndexedDB with the same
// interface as the disk storage. Files are stored under their relative path.
import { safePath } from '../../src/core/storage.js';

export async function createIdbStorage(dbName = 'astra-lab') {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  const tx = (mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction('files', mode); const st = t.objectStore('files'); let out;
    Promise.resolve(fn(st)).then((v) => { out = v; }).catch(reject);
    t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = (p) => tx('readonly', (st) => req(st.get(safePath(p))));
  return {
    kind: 'indexeddb',
    async exists(p) { return (await get(p)) !== undefined; },
    async readText(p) { const v = await get(p); if (v === undefined) throw new Error(`File not found: ${p}`); return typeof v === 'string' ? v : new TextDecoder().decode(v); },
    async writeText(p, text) { await tx('readwrite', (st) => req(st.put(String(text), safePath(p)))); },
    async readBinary(p) { const v = await get(p); if (v === undefined) throw new Error(`File not found: ${p}`); return typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v); },
    async writeBinary(p, bytes) { await tx('readwrite', (st) => req(st.put(new Uint8Array(bytes), safePath(p)))); },
    async remove(p) {
      const k = safePath(p);
      await tx('readwrite', async (st) => { const keys = await req(st.getAllKeys()); await Promise.all(keys.filter((x) => x === k || String(x).startsWith(k + '/')).map((x) => req(st.delete(x)))); });
    },
    async list(dir = '') {
      const d = dir ? safePath(dir) + '/' : '';
      const keys = await tx('readonly', (st) => req(st.getAllKeys()));
      const out = new Map();
      for (const key of keys) { const k = String(key); if (!k.startsWith(d)) continue; const rest = k.slice(d.length); const name = rest.split('/')[0]; out.set(name, { name, dir: rest.includes('/') }); }
      return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
