'use strict';
// ASTRA LAB - Electron main process.
// Responsibilities (and nothing else): create the window, serve the app files through a private app:// protocol, give the renderer a
// small, validated bridge to the disk (projects folder only), to the OS secret store (API key) and to the network (AI requests only),
// and write a log file. All engineering logic runs in the renderer / Node-free modules (physics, ai, src/core).
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, safeStorage, net, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;

const APP_ROOT = app.getAppPath();
const SERVED_DIRS = ['ui', 'src', 'physics', 'ai', 'data', 'assets', 'documentation'];
const SMOKE = process.argv.includes('--smoke-test');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/plain' };

// ------------------------------------------------------------------------------------------------------------------ paths
let DATA_DIR, LOG_FILE, USER_DIR;
function initPaths() {
  USER_DIR = app.getPath('userData');
  const custom = process.env.ASTRA_LAB_DATA;                       // optional override (portable use, tests)
  DATA_DIR = custom ? path.resolve(custom) : path.join(app.getPath('documents'), 'ASTRA-LAB');
  fs.mkdirSync(path.join(DATA_DIR, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'exports'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  LOG_FILE = path.join(DATA_DIR, 'logs', 'astra-lab.log');
}
function log(level, msg, extra) {
  try {
    const line = `${new Date().toISOString()} [${level}] ${msg}${extra ? ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}\n`;
    if (LOG_FILE) {
      try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch { /* no file yet */ }
      fs.appendFileSync(LOG_FILE, line);
    }
    if (!app.isPackaged || SMOKE) process.stdout.write(line);
  } catch { /* logging must never crash the app */ }
}
process.on('uncaughtException', (e) => log('error', 'uncaughtException', String(e?.stack ?? e)));
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection', String(e?.stack ?? e)));

// ------------------------------------------------------------------------------------------------------------------ graphics
// Old laptops: allow the GPU even if it is on Chromium's block list, and fall back to software rendering when the GPU process keeps crashing.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const SOFT_FLAG = () => path.join(app.getPath('userData'), 'software-rendering.flag');
if (process.env.ASTRA_LAB_SOFTWARE_RENDER === '1' || (() => { try { return fs.existsSync(path.join(app.getPath('userData'), 'software-rendering.flag')); } catch { return false; } })()) app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// ------------------------------------------------------------------------------------------------------------------ safe file access
/** Same rules as src/core/storage.js safePath; checked again here because the renderer is not trusted with the disk. */
function resolveInData(rel) {
  if (typeof rel !== 'string' || !rel.length || rel.length > 400) throw new Error('Invalid path');
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm) || norm.includes('\0')) throw new Error('Path not allowed');
  const parts = norm.split('/').filter((x) => x && x !== '.');
  if (parts.some((x) => x === '..' || /[<>:"|?*]/.test(x))) throw new Error('Path not allowed');
  const full = path.resolve(DATA_DIR, ...parts);
  if (full !== DATA_DIR && !full.startsWith(DATA_DIR + path.sep)) throw new Error('Path escapes the data folder');
  return full;
}
async function atomicWrite(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}
const MAX_FILE = 400 * 1024 * 1024;
function registerIpc() {
  ipcMain.on('astra:paths', (e) => { e.returnValue = { data: DATA_DIR, log: LOG_FILE, platform: process.platform, version: app.getVersion(), electron: process.versions.electron }; });
  ipcMain.handle('storage:exists', async (_e, p) => { try { await fsp.access(resolveInData(p)); return true; } catch { return false; } });
  ipcMain.handle('storage:readText', async (_e, p) => fsp.readFile(resolveInData(p), 'utf8'));
  ipcMain.handle('storage:readBinary', async (_e, p) => new Uint8Array(await fsp.readFile(resolveInData(p))));
  ipcMain.handle('storage:writeText', async (_e, p, t) => { if (typeof t !== 'string' || t.length > MAX_FILE) throw new Error('Invalid data'); await atomicWrite(resolveInData(p), t); });
  ipcMain.handle('storage:writeBinary', async (_e, p, b) => { const buf = Buffer.from(b); if (buf.length > MAX_FILE) throw new Error('File too large'); await atomicWrite(resolveInData(p), buf); });
  ipcMain.handle('storage:remove', async (_e, p) => { const f = resolveInData(p); if (f === DATA_DIR) throw new Error('Refusing to delete the data folder'); await fsp.rm(f, { recursive: true, force: true }); });
  ipcMain.handle('storage:list', async (_e, d) => {
    try { const ents = await fsp.readdir(d ? resolveInData(d) : DATA_DIR, { withFileTypes: true }); return ents.filter((x) => !x.name.endsWith('.tmp')).map((x) => ({ name: x.name, dir: x.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; }
  });

  // ---- API key: encrypted with the operating system (Windows DPAPI) and kept outside the projects folder
  const secretFile = () => path.join(USER_DIR, 'secrets.bin');
  ipcMain.handle('secrets:get', async (_e, name) => {
    if (name !== 'ai-api-key') return null;
    try { const buf = await fsp.readFile(secretFile()); if (!safeStorage.isEncryptionAvailable()) return null; return safeStorage.decryptString(buf); } catch { return null; }
  });
  ipcMain.handle('secrets:set', async (_e, name, value) => {
    if (name !== 'ai-api-key') throw new Error('Unknown secret');
    if (!value) { await fsp.rm(secretFile(), { force: true }); return true; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The operating system secret store is not available, so the key cannot be stored safely.');
    await atomicWrite(secretFile(), safeStorage.encryptString(String(value)));
    return true;
  });

  // ---- network access for the online AI model only: https anywhere, plain http only to this computer
  ipcMain.handle('ai:fetch', (_e, req) => new Promise((resolve, reject) => {
    try {
      const u = new URL(String(req?.url));
      const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
      if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) throw new Error('Only https:// addresses (or http://localhost) are allowed for the AI service.');
      const method = String(req.method ?? 'POST').toUpperCase(); if (!['POST', 'GET'].includes(method)) throw new Error('Method not allowed');
      const r = net.request({ method, url: u.toString(), redirect: 'manual' });
      for (const [k, v] of Object.entries(req.headers ?? {})) if (typeof v === 'string' && !/^(host|content-length|connection|cookie)$/i.test(k)) r.setHeader(k, v);
      const timer = setTimeout(() => { r.abort(); reject(new Error('The AI service did not answer in time.')); }, 120000);
      timer.unref?.();
      r.on('redirect', (status, m, url) => { try { const nu = new URL(url); const ok = nu.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(nu.hostname); if (ok) r.followRedirect(); else { r.abort(); reject(new Error('Blocked a redirect to an unsafe address.')); } } catch { r.abort(); reject(new Error('Bad redirect')); } });
      r.on('response', (res) => {
        const chunks = []; let size = 0;
        res.on('data', (c) => { size += c.length; if (size > 20 * 1024 * 1024) { r.abort(); clearTimeout(timer); reject(new Error('Response too large')); } else chunks.push(c); });
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }); });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      r.on('error', (e) => { clearTimeout(timer); reject(new Error(`Network error: ${e.message}`)); });
      if (req.body != null && method !== 'GET') r.write(String(req.body));
      r.end();
    } catch (e) { reject(e); }
  }));

  // ---- export files (reports, CSV): the user always chooses the place
  ipcMain.handle('file:save', async (e, name, bytes) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const base = path.basename(String(name ?? 'export.txt')).replace(/[<>:"/\\|?*\0]/g, '_') || 'export.txt';
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(DATA_DIR, 'exports', base) });
    if (r.canceled || !r.filePath) return null;
    await atomicWrite(r.filePath, Buffer.from(bytes));
    return { path: r.filePath };
  });
  ipcMain.handle('file:open', async (e, accept) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'ASTRA LAB files', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const st = await fsp.stat(r.filePaths[0]); if (st.size > 200 * 1024 * 1024) throw new Error('File too large');
    return { name: path.basename(r.filePaths[0]), text: await fsp.readFile(r.filePaths[0], 'utf8') };
  });
  ipcMain.handle('print:html', async (_e, html) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`);
    w.webContents.print({ printBackground: true }, () => w.destroy());
    return true;
  });
  ipcMain.handle('app:openDataFolder', async () => { await shell.openPath(DATA_DIR); return DATA_DIR; });
  ipcMain.on('astra:log', (_e, level, msg, extra) => log(['info', 'warn', 'error'].includes(level) ? level : 'info', `[renderer] ${String(msg).slice(0, 2000)}`, extra == null ? undefined : String(extra).slice(0, 4000)));
}

// ------------------------------------------------------------------------------------------------------------------ window
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, show: false, backgroundColor: '#080d15', title: 'ASTRA LAB',
    icon: path.join(APP_ROOT, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: true },
  });
  mainWindow.once('ready-to-show', () => { if (!SMOKE) mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://astra/')) { e.preventDefault(); } });
  mainWindow.webContents.on('render-process-gone', (_e, d) => { log('error', 'renderer gone', d); if (!SMOKE) { dialog.showErrorBox('ASTRA LAB', 'The display process stopped unexpectedly. Your projects are saved automatically; the window will reload now.'); mainWindow.reload(); } });
  mainWindow.webContents.on('console-message', (_e, level, message, line, src) => { if (level >= 2 || SMOKE) log(level >= 2 ? 'error' : 'info', `[console] ${message}`, `${src}:${line}`); });
  mainWindow.loadURL('app://astra/ui/index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const t = [
    { label: 'File', submenu: [{ label: 'Open data folder', click: () => shell.openPath(DATA_DIR) }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [{ label: 'User guide (documentation folder)', click: () => shell.openPath(path.join(APP_ROOT, 'documentation')).catch(() => {}) }, { label: 'Open log file', click: () => shell.openPath(LOG_FILE) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

// ------------------------------------------------------------------------------------------------------------------ shared design links (2.0)
// astralab://design/<code> opens ASTRA LAB with a shared design. The link is only handed to the renderer as text; the renderer decodes and
// checks it (src/core/share.js) and asks the user before adding it to the project.
let pendingShareLink = null;
const shareLinkIn = (argv) => (argv ?? []).find((a) => typeof a === 'string' && a.startsWith('astralab://') && a.length < 3e6) ?? null;
function deliverShareLink(link) {
  if (!link) return;
  pendingShareLink = link;
  try { mainWindow?.webContents?.send?.('share:link', link); } catch { /* window not ready: the renderer asks for it at start */ }
}
pendingShareLink = shareLinkIn(process.argv);
try { if (!SMOKE) app.setAsDefaultProtocolClient?.('astralab'); } catch { /* not fatal */ }
app.on('open-url', (e, url) => { e.preventDefault?.(); deliverShareLink(url); });
ipcMain.handle('share:pending', () => { const l = pendingShareLink; pendingShareLink = null; return l; });

if (!app.requestSingleInstanceLock() && !SMOKE) { app.quit(); } else {
  app.on('second-instance', (_e, argv) => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } deliverShareLink(shareLinkIn(argv)); });
  app.whenReady().then(async () => {
    initPaths(); log('info', `ASTRA LAB ${app.getVersion()} starting (Electron ${process.versions.electron}, ${process.platform} ${process.arch})`, { data: DATA_DIR });
    // app:// protocol: maps to the application folder, only allow-listed directories, no path traversal
    protocol.registerFileProtocol('app', (request, cb) => {
      try {
        const u = new URL(request.url); let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        if (!rel) rel = 'ui/index.html';
        const top = rel.split('/')[0];
        const full = path.resolve(APP_ROOT, rel);
        if (!SERVED_DIRS.includes(top) || !full.startsWith(APP_ROOT + path.sep)) return cb({ statusCode: 403 });
        if (!MIME[path.extname(full).toLowerCase()]) return cb({ statusCode: 403 });
        cb({ path: full, mimeType: MIME[path.extname(full).toLowerCase()] });
      } catch (e) { log('error', 'protocol failure', String(e)); cb({ statusCode: 404 }); }
    });
    // no permission prompts of any kind, no external requests from the UI
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    registerIpc(); buildMenu(); createWindow();
    try { if (!SMOKE) require('./updater.cjs').createUpdater({ app, ipcMain, getWindow: () => mainWindow, dataDir: () => DATA_DIR, log }).register(); } catch (e) { log('warn', 'updates are not available', String(e)); }
    if (SMOKE) runSmokeTest();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('child-process-gone', (_e, d) => {
    if (d.type === 'GPU' && d.reason !== 'clean-exit') {
      log('error', 'GPU process gone', d);
      try { if (!fs.existsSync(SOFT_FLAG())) { fs.writeFileSync(SOFT_FLAG(), 'The graphics driver crashed; ASTRA LAB uses software rendering. Delete this file to try the GPU again.\n'); log('warn', 'switching to software rendering and restarting'); app.relaunch(); app.exit(0); } } catch { /* ignore */ }
    }
  });
}

// ------------------------------------------------------------------------------------------------------------------ smoke test (CI)
async function runSmokeTest() {
  const wc = () => mainWindow?.webContents;
  const fail = (m) => { log('error', `SMOKE FAILED: ${m}`); process.stdout.write(`SMOKE FAILED: ${m}\n`); app.exit(1); };
  setTimeout(() => fail('timeout'), 120000);
  try {
    for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 500)); try { if (await wc().executeJavaScript('!!window.astraApp && !!document.querySelector("#app:not([hidden])")')) break; } catch { /* page not ready */ } if (i === 119) return fail('UI did not start'); }
    const reply = await wc().executeJavaScript('window.astraApp.ask("Build me a two-stage rocket carrying a 100 kg space probe.").then(r => ({ hasPlan: !!r.plan, ok: r.plan?.ok }))');
    if (!reply.hasPlan || !reply.ok) return fail('AI did not produce a valid plan');
    await wc().executeJavaScript('window.astraApp.ask("yes, apply it")');
    const run = await wc().executeJavaScript('window.astraApp.ask("Test it.").then(() => window.astraApp.project.runs.map(r => r.status))');
    if (!run.length) return fail('no simulation was recorded');
    const saved = await wc().executeJavaScript('window.astraApp.save({quiet:true}).then(r => r.ok)');
    if (!saved) return fail('project could not be saved to disk');
    const gl = await wc().executeJavaScript('(() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); })()');
    process.stdout.write(`SMOKE OK runs=${JSON.stringify(run)} webgl=${gl} data=${DATA_DIR}\n`);
    app.exit(0);
  } catch (e) { fail(String(e?.message ?? e)); }
}
