'use strict';
// Preload: the only bridge between the UI and the computer. contextIsolation is on, the UI has no Node access.
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const paths = ipcRenderer.sendSync('astra:paths');
contextBridge.exposeInMainWorld('astra', {
  version: paths.version, platform: paths.platform, electron: paths.electron,
  paths: { data: paths.data, log: paths.log },
  storage: {
    exists: (p) => inv('storage:exists', p), readText: (p) => inv('storage:readText', p), readBinary: (p) => inv('storage:readBinary', p),
    writeText: (p, t) => inv('storage:writeText', p, t), writeBinary: (p, b) => inv('storage:writeBinary', p, b), remove: (p) => inv('storage:remove', p), list: (d) => inv('storage:list', d),
  },
  secrets: { get: (n) => inv('secrets:get', n), set: (n, v) => inv('secrets:set', n, v) },
  aiFetch: (req) => inv('ai:fetch', req),
  saveFile: (name, bytes) => inv('file:save', name, bytes),
  openFile: (accept) => inv('file:open', accept),
  printHtml: (html) => inv('print:html', html),
  openDataFolder: () => inv('app:openDataFolder'),
  pendingShareLink: () => inv('share:pending'),
  onShareLink: (fn) => ipcRenderer.on('share:link', (_e, link) => fn(String(link))),
  updates: { get: () => inv('update:get'), set: (v) => inv('update:set', v), check: () => inv('update:check'), download: () => inv('update:download'), install: () => inv('update:install'), onEvent: (fn) => ipcRenderer.on('update:event', (_e, s) => fn(s)) },
  log: (level, msg, extra) => ipcRenderer.send('astra:log', level, msg, extra),
});
