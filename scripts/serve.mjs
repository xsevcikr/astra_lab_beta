// Tiny static file server for running ASTRA LAB in a normal browser (development, tests, or "no Electron" fallback).
//   node scripts/serve.mjs [port]      then open http://127.0.0.1:PORT/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };
const ALLOWED = ['ui', 'src', 'physics', 'ai', 'data', 'assets', 'documentation'];

export function startServer(port = 8123, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/index.html') { res.writeHead(302, { location: '/ui/index.html' }); return res.end(); }
    const rel = path.normalize(p).replace(/^[/\\]+/, '');
    const top = rel.split(path.sep)[0];
    const full = path.join(root, rel);
    if (!ALLOWED.includes(top) || !full.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8123);
  startServer(port).then(() => console.log(`ASTRA LAB is running at http://127.0.0.1:${port}/  (Ctrl+C to stop)`));
}
