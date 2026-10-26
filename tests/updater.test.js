// The update module (src/main/updater.cjs) driven through its IPC handlers with a stand-in for electron-updater.
// Honest limit: the real electron-updater network/install path (Windows installer, signature, restart) is NOT exercised here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { createUpdater } = require('../src/main/updater.cjs');

function rig({ packaged = true, behaviour = 'update' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-upd-'));
  const handlers = new Map(), sent = [];
  const au = new EventEmitter(); au.feeds = []; au.installed = 0;
  au.setFeedURL = (f) => au.feeds.push(f);
  au.checkForUpdates = async () => {
    au.emit('checking-for-update');
    if (behaviour === 'error') { au.emit('error', new Error('getaddrinfo ENOTFOUND updates.example.com\n at somewhere')); return; }
    if (behaviour === 'none') { au.emit('update-not-available', {}); return; }
    au.emit('update-available', { version: '9.9.9', releaseNotes: 'New things' });
  };
  au.downloadUpdate = async () => { au.emit('download-progress', { percent: 40 }); au.emit('update-downloaded', { version: '9.9.9' }); };
  au.quitAndInstall = () => { au.installed++; };
  const u = createUpdater({ app: { getVersion: () => '2.3.0', isPackaged: packaged }, ipcMain: { handle: (n, f) => handlers.set(n, f) }, getWindow: () => ({ webContents: { send: (c, s) => sent.push(s) } }), dataDir: () => dir, load: () => ({ autoUpdater: au }) });
  u.register();
  const call = (n, v) => handlers.get(n)({}, v);
  return { u, au, call, sent, dir };
}

test('updates are unavailable from source, and nothing is checked', async () => {
  const r = rig({ packaged: false });
  assert.equal((await r.call('update:get')).state, 'unavailable');
  assert.equal((await r.call('update:check')).state, 'unavailable');
  assert.equal(r.au.feeds.length, 0);
});

test('a bad address is refused; a good one is saved and survives a restart', async () => {
  const r = rig();
  assert.equal((await r.call('update:set', { feed: 'http://example.com/x' })).state, 'error');
  assert.equal((await r.call('update:set', { feed: 'https://updates.example.com/astra', autoCheck: true })).message, 'Saved.');
  const saved = JSON.parse(fs.readFileSync(path.join(r.dir, 'update-settings.json'), 'utf8'));
  assert.equal(saved.feed, 'https://updates.example.com/astra'); assert.equal(saved.autoCheck, true);
});

test('check without an address says so; with one it finds a new version, downloads it and only installs when asked', async () => {
  const r = rig();
  assert.match((await r.call('update:check')).message, /No update address/);
  await r.call('update:set', { feed: 'github:rob/astra-lab' });
  const c = await r.call('update:check');
  assert.equal(c.state, 'available'); assert.equal(c.version, '9.9.9');
  assert.deepEqual(r.au.feeds[0], { provider: 'github', owner: 'rob', repo: 'astra-lab' });
  assert.equal(r.au.autoDownload, false); assert.equal(r.au.autoInstallOnAppQuit, false);
  assert.equal((await r.call('update:download')).state, 'ready');
  assert.equal(r.au.installed, 0, 'nothing installs by itself');
  await r.call('update:install'); await new Promise((res) => setImmediate(res));
  assert.equal(r.au.installed, 1);
  assert.ok(r.sent.some((s) => s.state === 'downloading'), 'progress reached the window');
});

test('no download before an update was found; network errors become one plain line', async () => {
  const r = rig({ behaviour: 'error' });
  await r.call('update:set', { feed: 'https://updates.example.com/a/' });
  assert.equal((await r.call('update:download')).state, 'idle');
  const c = await r.call('update:check');
  assert.equal(c.state, 'error'); assert.ok(!/\n/.test(c.message) && c.message.length < 260);
  const n = rig({ behaviour: 'none' }); await n.call('update:set', { feed: 'https://updates.example.com/a/' });
  assert.equal((await n.call('update:check')).state, 'none');
});
