// The Electron main process cannot be started in this test environment (no Electron binary), so its security-relevant logic is tested
// here against a faithful mock of the `electron` module: the disk bridge (path traversal), the app:// protocol (allow-list), the AI network
// bridge (scheme restriction) and the secret store. The real window is exercised by the CI smoke test (`electron . --smoke-test`).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-data-'));
const USER = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-user-'));
const handlers = new Map(), listeners = new Map();
let fileProtocol = null, loadedUrl = null;
const netRequests = [];

const electron = {
  app: { getAppPath: () => ROOT, getPath: (n) => (n === 'userData' ? USER : os.tmpdir()), getVersion: () => '1.0.0', isPackaged: true, commandLine: { appendSwitch() {} }, disableHardwareAcceleration() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), on() {}, quit() {}, exit() {}, relaunch() {} },
  BrowserWindow: class { constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; } once() {} on() {} loadURL(u) { loadedUrl = u; } static fromWebContents() { return null; } },
  protocol: { registerSchemesAsPrivileged() {}, registerFileProtocol: (scheme, fn) => { fileProtocol = fn; } },
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
  dialog: {}, shell: {}, Menu: { setApplicationMenu() {}, buildFromTemplate: (t) => t },
  session: { defaultSession: { setPermissionRequestHandler() {} } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('enc:' + s), decryptString: (b) => b.toString().replace(/^enc:/, '') },
  net: { request: (o) => { netRequests.push(o); return { setHeader() {}, on() {}, write() {}, end() {} }; } },
};
before(async () => {
  process.env.ASTRA_LAB_DATA = DATA;
  const Module = require('node:module'); const orig = Module._load;
  Module._load = function (req, ...a) { return req === 'electron' ? electron : orig.call(this, req, ...a); };
  require(path.join(ROOT, 'src/main/main.cjs'));
  Module._load = orig;
  await new Promise((r) => setTimeout(r, 100));
});
const call = (ch, ...a) => handlers.get(ch)({ sender: {} }, ...a);

test('main process starts, uses the data folder and opens the app:// page', () => {
  assert.ok(loadedUrl?.startsWith('app://astra/ui/index.html'));
  const p = { }; listeners.get('astra:paths')(p); assert.equal(p.returnValue.data, DATA);
  assert.ok(fs.existsSync(path.join(DATA, 'projects')));
});
test('disk bridge: reads and writes inside the data folder', async () => {
  await call('storage:writeText', 'projects/a/project.json', '{"x":1}');
  assert.equal(await call('storage:readText', 'projects/a/project.json'), '{"x":1}');
  assert.equal(await call('storage:exists', 'projects/a/project.json'), true);
  await call('storage:writeBinary', 'projects/a/bin.dat', new Uint8Array([1, 2, 3]));
  assert.deepEqual([...(await call('storage:readBinary', 'projects/a/bin.dat'))], [1, 2, 3]);
  const ls = await call('storage:list', 'projects'); assert.deepEqual(ls.map((e) => e.name), ['a']);
  await call('storage:remove', 'projects/a'); assert.equal(await call('storage:exists', 'projects/a/project.json'), false);
  assert.ok(!fs.readdirSync(path.join(DATA, 'projects')).some((f) => f.endsWith('.tmp')));
});
test('disk bridge: path traversal, absolute paths and drive letters are rejected', async () => {
  for (const bad of ['../evil.txt', 'projects/../../evil.txt', '/etc/passwd', 'C:\\Windows\\win.ini', 'C:/x', 'a\0b', '..\\x', 'projects/a<b', '']) {
    await assert.rejects(call('storage:writeText', bad, 'x'), undefined, `should reject ${JSON.stringify(bad)}`);
    await assert.rejects(call('storage:readText', bad), undefined, `should reject read ${JSON.stringify(bad)}`);
  }
  await assert.rejects(call('storage:remove', '.'), /data folder/);
  assert.ok(!fs.existsSync(path.join(DATA, '..', 'evil.txt')));
});
test('app:// protocol serves only the allow-listed folders and file types', () => {
  const ask = (url) => { let out; fileProtocol({ url }, (r) => (out = r)); return out; };
  assert.ok(ask('app://astra/ui/index.html').path.endsWith(path.join('ui', 'index.html')));
  assert.ok(ask('app://astra/physics/simulation.js').path.endsWith('simulation.js'));
  assert.equal(ask('app://astra/package.json').statusCode, 403);
  assert.equal(ask('app://astra/tests/ai.test.js').statusCode, 403);
  assert.equal(ask('app://astra/src/main/main.cjs').statusCode, 403);   // .cjs is not a served type
  assert.equal(ask('app://astra/ui/%2e%2e/package.json').statusCode, 403);
  assert.equal(ask('app://astra/../package.json').statusCode, 403);
});
test('AI network bridge: https and localhost only', async () => {
  for (const bad of ['http://example.com/v1', 'file:///etc/passwd', 'ftp://x/y', 'javascript:alert(1)', 'https://', 'not a url']) await assert.rejects(call('ai:fetch', { url: bad, method: 'POST', body: '{}' }), undefined, bad);
  await assert.rejects(call('ai:fetch', { url: 'https://api.example.com', method: 'DELETE' }), /Method/);
  call('ai:fetch', { url: 'https://api.anthropic.com/v1/messages', method: 'POST', headers: { 'x-api-key': 'k' }, body: '{}' }).catch(() => {});
  call('ai:fetch', { url: 'http://localhost:11434/v1/chat/completions', method: 'POST', body: '{}' }).catch(() => {});
  assert.equal(netRequests.length, 2);
});
test('secret store: encrypted file outside the projects folder, removable', async () => {
  assert.equal(await call('secrets:get', 'ai-api-key'), null);
  await call('secrets:set', 'ai-api-key', 'sk-test-123');
  assert.equal(await call('secrets:get', 'ai-api-key'), 'sk-test-123');
  const raw = fs.readFileSync(path.join(USER, 'secrets.bin'), 'utf8'); assert.ok(raw.startsWith('enc:'));
  assert.ok(!fs.existsSync(path.join(DATA, 'secrets.bin')));
  await assert.rejects(call('secrets:set', 'other', 'x'), /Unknown/);
  await call('secrets:set', 'ai-api-key', ''); assert.equal(await call('secrets:get', 'ai-api-key'), null);
});
