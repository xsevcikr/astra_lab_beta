// Storage adapters. The application talks to a tiny async interface so that the same code runs
//   - in Node (tests, headless experiments):      NodeStorage(rootDir)
//   - in the Electron renderer (real app):         IpcStorage(window.astra.storage)   (main process does the disk access)
//   - in a plain browser / for unit tests:         MemoryStorage()
// Paths are always forward-slash relative paths inside the ASTRA LAB data folder. Path traversal ("..", absolute paths, drive
// letters) is rejected here and again in the Electron main process, so a project file can never reach outside the data folder.

export function safePath(p) {
  if (typeof p !== 'string' || !p.length) throw new Error('Invalid path');
  const norm = p.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm) || norm.includes('\0')) throw new Error(`Path not allowed: ${p}`);
  const parts = norm.split('/').filter((x) => x && x !== '.');
  if (parts.some((x) => x === '..')) throw new Error(`Path not allowed: ${p}`);
  if (parts.some((x) => /[<>:"|?*]/.test(x))) throw new Error(`Path contains characters that are not allowed: ${p}`);
  return parts.join('/');
}
export const slug = (s) => String(s ?? 'untitled').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';

export class MemoryStorage {
  constructor() { this.files = new Map(); this.kind = 'memory'; }
  async exists(p) { return this.files.has(safePath(p)); }
  async readText(p) { const v = this.files.get(safePath(p)); if (v === undefined) throw new Error(`File not found: ${p}`); return typeof v === 'string' ? v : new TextDecoder().decode(v); }
  async writeText(p, text) { this.files.set(safePath(p), String(text)); }
  async readBinary(p) { const v = this.files.get(safePath(p)); if (v === undefined) throw new Error(`File not found: ${p}`); return typeof v === 'string' ? new TextEncoder().encode(v) : v; }
  async writeBinary(p, bytes) { this.files.set(safePath(p), new Uint8Array(bytes)); }
  async remove(p) { const k = safePath(p); for (const key of [...this.files.keys()]) if (key === k || key.startsWith(k + '/')) this.files.delete(key); }
  async list(dir = '') {
    const d = dir ? safePath(dir) + '/' : '';
    const out = new Map();
    for (const key of this.files.keys()) {
      if (!key.startsWith(d)) continue;
      const rest = key.slice(d.length); const name = rest.split('/')[0];
      out.set(name, { name, dir: rest.includes('/') });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** Node.js file-system storage rooted at `root`. Imported lazily so that the renderer never needs `fs`. */
export async function createNodeStorage(root) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const abs = (p) => {
    const rel = safePath(p);
    const full = path.resolve(root, rel);
    if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Path escapes the data folder: ${p}`);
    return full;
  };
  return {
    kind: 'node', root,
    async exists(p) { try { await fs.access(abs(p)); return true; } catch { return false; } },
    async readText(p) { return fs.readFile(abs(p), 'utf8'); },
    async writeText(p, text) { const f = abs(p); await fs.mkdir(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; await fs.writeFile(tmp, String(text), 'utf8'); await fs.rename(tmp, f); },
    async readBinary(p) { return new Uint8Array(await fs.readFile(abs(p))); },
    async writeBinary(p, bytes) { const f = abs(p); await fs.mkdir(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; await fs.writeFile(tmp, bytes); await fs.rename(tmp, f); },
    async remove(p) { await fs.rm(abs(p), { recursive: true, force: true }); },
    async list(dir = '') {
      try { const ents = await fs.readdir(dir ? abs(dir) : path.resolve(root), { withFileTypes: true }); return ents.map((e) => ({ name: e.name, dir: e.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; }
    },
  };
}

/** Adapter for the Electron renderer: `bridge` is window.astra.storage exposed by preload.cjs (IPC to the main process). */
export function createIpcStorage(bridge) {
  return {
    kind: 'ipc',
    exists: (p) => bridge.exists(safePath(p)),
    readText: (p) => bridge.readText(safePath(p)),
    writeText: (p, t) => bridge.writeText(safePath(p), String(t)),
    readBinary: async (p) => new Uint8Array(await bridge.readBinary(safePath(p))),
    writeBinary: (p, b) => bridge.writeBinary(safePath(p), b),
    remove: (p) => bridge.remove(safePath(p)),
    list: (d = '') => bridge.list(d ? safePath(d) : ''),
  };
}

export async function readJson(storage, p, fallback = undefined) {
  try { return JSON.parse(await storage.readText(p)); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
export const writeJson = (storage, p, obj, pretty = true) => storage.writeText(p, JSON.stringify(obj, null, pretty ? 1 : 0));
