import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guide } from './guide.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
let active = 0;
const limits = new Map();
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/guide') {
      const now = Date.now(), ip = req.socket.remoteAddress;
      for (const [key, value] of limits) if (now - value.time > 60000) limits.delete(key);
      const limit = limits.get(ip) || { time: now, count: 0 };
      if (active >= 4 || limit.count >= 20) { res.writeHead(429).end('Try again later'); return; }
      limit.count++; limits.set(ip, limit); active++;
      try { await guide(req, res); } finally { active--; }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    // Serve only the public build: never .env, source, scripts or dependency files.
    if (pathname !== '/' && pathname !== '/index.html' && !pathname.startsWith('/assets/')) { res.writeHead(404).end(); return; }
    if (pathname.split('/').some(part => part.startsWith('.') || part.includes('\\'))) { res.writeHead(403).end(); return; }
    const path = resolve(root, '.' + pathname);
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const file = pathname === '/' ? resolve(root, 'index.html') : path;
    if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Nebula Core: http://localhost:${port}`));
