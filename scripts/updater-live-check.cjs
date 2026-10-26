// Live check of the update path against a LOCAL mock server (needs `npm install` first):  node scripts/updater-live-check.cjs [--tamper]
// It runs the REAL electron-updater (latest.yml parsing, version comparison, download, sha512 check) with Electron stubbed out and a plain
// Node HTTP executor, through ASTRA LAB's own wrapper (src/main/updater.cjs). It does NOT test: the Windows installer, the restart,
// code signing, Electron's own network stack, or a real server on the internet. --tamper serves a modified installer: the update must be refused.
process.env.LOCALAPPDATA = require('os').tmpdir(); process.env.APPDATA = require('os').tmpdir();
const Module = require('module'); const http = require('http'); const crypto = require('crypto'); const fs = require('fs'); const path = require('path'); const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
const electronStub = { app: { getVersion: () => '2.3.0', isPackaged: true, getAppPath: () => tmp, getPath: () => tmp, name: 'astra-lab', on() {}, whenReady: () => Promise.resolve(), quit() {} }, autoUpdater: {}, BrowserWindow: { getAllWindows: () => [] }, dialog: {}, net: {}, session: {} };
const orig = Module._resolveFilename; Module._resolveFilename = function (r, ...a) { return r === 'electron' ? 'electron-stub' : orig.call(this, r, ...a); };
require.cache['electron-stub'] = { id: 'electron-stub', filename: 'electron-stub', loaded: true, exports: electronStub };
Object.defineProperty(process, 'platform', { value: 'win32' });
process.resourcesPath = tmp; fs.writeFileSync(path.join(tmp, 'app-update.yml'), 'provider: generic\nurl: https://updates.invalid/astra-lab/\nupdaterCacheDirName: astra-lab-updater\n');
const installer = Buffer.alloc(300000, 7); fs.writeFileSync(path.join(tmp, 'ASTRA-LAB-Setup-9.9.9.exe'), installer);
const sha = crypto.createHash('sha512').update(installer).digest('base64');
const yml = `version: 9.9.9\nfiles:\n  - url: ASTRA-LAB-Setup-9.9.9.exe\n    sha512: ${sha}\n    size: ${installer.length}\npath: ASTRA-LAB-Setup-9.9.9.exe\nsha512: ${sha}\nreleaseDate: '2026-10-24T00:00:00.000Z'\n`;
const TAMPER = process.argv.includes('--tamper');
const hits = [];
const srv = http.createServer((q, s) => { hits.push(q.url); if (q.url.includes('latest.yml')) { s.setHeader('content-type', 'text/yaml'); s.end(yml); } else if (q.url.includes('.exe')) { const body = Buffer.from(installer); if (TAMPER) body[10] = 99; s.setHeader('content-length', body.length); s.end(body); } else { s.statusCode = 404; s.end('no'); } });
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port; const { createUpdater } = require('../src/main/updater.cjs');
  const events = []; const handlers = new Map();
  process.env.ASTRA_UPDATE_DEV = '1';
  const u = createUpdater({ app: electronStub.app, ipcMain: { handle: (n, f) => handlers.set(n, f) }, getWindow: () => ({ webContents: { send: (c, s) => events.push(s.state) } }), dataDir: () => tmp, load: () => require('electron-updater') });
  u.register();
  // the real wrapper only accepts https: feed a local http address the same way the wrapper would (setFeedURL with a generic provider)
  const au = require('electron-updater').autoUpdater;
  const { HttpExecutor } = require('builder-util-runtime');
  class NodeExec extends HttpExecutor { createRequest(options, callback) { const req = http.request(options, callback); return req; }
    download(url, destination, options) { return new Promise((res, rej) => { const u = new URL(url.toString()); http.get(u, (r) => { const total = +r.headers['content-length'] || 0; let got = 0; const out = fs.createWriteStream(destination); r.on('data', (b) => { got += b.length; options?.onProgress?.({ total, delta: b.length, transferred: got, percent: total ? got / total * 100 : 0, bytesPerSecond: 0 }); }); if (options?.sha512) { const dt = new (require('builder-util-runtime').DigestTransform)(options.sha512, 'sha512', 'base64'); dt.on('error', rej); r.pipe(dt).pipe(out); } else r.pipe(out); out.on('finish', () => res(destination)); out.on('error', rej); }).on('error', rej); }); } }
  au.httpExecutor = new NodeExec();
  const orig = au.setFeedURL.bind(au); au.setFeedURL = () => orig({ provider: 'generic', url: `http://127.0.0.1:${port}/` });
  handlers.get('update:set')({}, { feed: 'https://updates.example.com/astra/' });
  const c = await handlers.get('update:check')({});
  console.log('check ->', c.state, c.version, c.message);
  const d = await handlers.get('update:download')({});
  console.log('download ->', d.state, d.message);
  console.log('events', [...new Set(events)].join(','), 'requests', hits.join(' '));
  srv.close(); process.exit(0);
});
