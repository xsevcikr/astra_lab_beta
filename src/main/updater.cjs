'use strict';
// ASTRA LAB 2.3 - updates for the installed Windows app.
//
// OFF by default and silent: nothing leaves the computer unless the user types an update address in Settings > Updates. The address
// must be https (or "github:owner/repo" for GitHub releases). Nothing is downloaded without a click and the app only restarts when asked.
// The check, the download and the install are done by `electron-updater` (loaded only when needed; if it is missing the Updates panel says so
// and nothing else changes). Updates work in the installed app only (not "npm start", not the portable build).
//
// Honest limit: the installer is not code-signed, so the update is only as trustworthy as the address it comes from. Use an https address
// that you control (see documentation/UPDATES.md). The pure helpers below are unit-tested (tests/v23.test.js).
const path = require('node:path');
const fs = require('node:fs');

/** A usable feed from what the user typed: {provider:'generic', url} or {provider:'github', owner, repo}; null when it is not safe. */
function parseFeed(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const gh = /^github:([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(s);
  if (gh) return { provider: 'github', owner: gh[1], repo: gh[2] };
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    u.hash = ''; u.search = '';
    return { provider: 'generic', url: u.toString().endsWith('/') ? u.toString() : `${u.toString()}/` };
  } catch { return null; }
}
/** "2.4.0" > "2.3.0"? Plain numeric comparison of the first three parts; a pre-release tag counts as lower. */
function isNewer(candidate, current) {
  const p = (v) => { const [core, pre] = String(v).replace(/^v/, '').split('-'); const n = core.split('.').map((x) => parseInt(x, 10) || 0); while (n.length < 3) n.push(0); return { n, pre: !!pre }; };
  const a = p(candidate), b = p(current);
  for (let i = 0; i < 3; i++) if (a.n[i] !== b.n[i]) return a.n[i] > b.n[i];
  return !a.pre && b.pre;
}

function createUpdater({ app, ipcMain, getWindow, dataDir, log = () => {}, load = () => require('electron-updater') }) {
  const file = () => path.join(dataDir(), 'update-settings.json');
  let cfg = { feed: '', autoCheck: false };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { /* first run */ }
  const S = { state: 'idle', version: null, progress: 0, message: '', current: app.getVersion?.() ?? '', feed: cfg.feed, autoCheck: !!cfg.autoCheck, notes: '' };
  let au = null;
  const push = () => { try { getWindow()?.webContents?.send('update:event', { ...S }); } catch { /* window closed */ } };
  const set = (patch) => { Object.assign(S, patch); push(); return { ...S }; };
  const saveCfg = () => { try { fs.writeFileSync(file(), JSON.stringify({ feed: S.feed, autoCheck: S.autoCheck }, null, 1)); } catch (e) { log('warn', 'could not save the update settings', String(e)); } };
  const unavailable = () => {
    if (!app.isPackaged && !process.env.ASTRA_UPDATE_DEV) return 'Updates work in the installed app (Windows installer). This copy is running from source.';
    if (process.env.PORTABLE_EXECUTABLE_DIR) return 'The portable version cannot update itself. Download the new portable file instead.';
    return null;
  };
  function engine() {
    if (au) return au;
    const mod = load(); au = mod.autoUpdater;
    au.autoDownload = false; au.autoInstallOnAppQuit = false; au.allowPrerelease = false; au.allowDowngrade = false;
    au.logger = { info: (m) => log('info', `updater: ${m}`), warn: (m) => log('warn', `updater: ${m}`), error: (m) => log('error', `updater: ${m}`), debug() {} };
    au.on('checking-for-update', () => set({ state: 'checking', message: 'Looking for a new version…' }));
    au.on('update-available', (i) => set({ state: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.slice(0, 2000) : '', message: `Version ${i.version} is available.` }));
    au.on('update-not-available', () => set({ state: 'none', message: `You have the newest version (${S.current}).` }));
    au.on('download-progress', (p) => set({ state: 'downloading', progress: Math.round(p.percent ?? 0), message: `Downloading… ${Math.round(p.percent ?? 0)} %` }));
    au.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, progress: 100, message: `Version ${i.version} is ready. Restart ASTRA LAB to install it.` }));
    au.on('error', (e) => set({ state: 'error', message: `The update did not work: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}` }));
    return au;
  }
  function apply() { const f = parseFeed(S.feed); if (!f) throw new Error('The update address is not valid. Use an https address or github:owner/repo.'); engine().setFeedURL(f); }
  async function check() {
    const why = unavailable(); if (why) return set({ state: 'unavailable', message: why });
    if (!S.feed) return set({ state: 'idle', message: 'No update address is set. Type one in Settings > Updates first.' });
    try { apply(); await engine().checkForUpdates(); } catch (e) { set({ state: 'error', message: `The update check did not work: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}` }); }
    return { ...S };
  }
  function register() {
    ipcMain.handle('update:get', () => ({ ...S, ...(unavailable() ? { state: 'unavailable', message: unavailable() } : {}) }));
    ipcMain.handle('update:set', (_e, v) => {
      const feed = String(v?.feed ?? '').trim().slice(0, 300);
      if (feed && !parseFeed(feed)) return set({ state: 'error', message: 'The update address is not valid. Use an https address (for example https://example.org/astra-lab/) or github:owner/repo.' });
      S.feed = feed; S.autoCheck = !!v?.autoCheck; saveCfg();
      return set({ state: unavailable() ? 'unavailable' : 'idle', message: unavailable() ?? (feed ? 'Saved.' : 'Updates are off.') });
    });
    ipcMain.handle('update:check', () => check());
    ipcMain.handle('update:download', async () => { if (S.state !== 'available') return { ...S }; try { await engine().downloadUpdate(); } catch (e) { set({ state: 'error', message: `The download did not work: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}` }); } return { ...S }; });
    ipcMain.handle('update:install', () => { if (S.state === 'ready') setImmediate(() => { try { engine().quitAndInstall(false, true); } catch (e) { set({ state: 'error', message: String(e?.message ?? e) }); } }); return { ...S }; });
    if (S.autoCheck && S.feed && !unavailable()) setTimeout(() => { check().catch(() => {}); }, 20000);   // 20 s after start, in the background
  }
  return { register, check, state: () => ({ ...S }) };
}
module.exports = { createUpdater, parseFeed, isNewer };
