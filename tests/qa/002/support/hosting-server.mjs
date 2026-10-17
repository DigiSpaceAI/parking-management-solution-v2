// QA-only static server that mimics the D1 Firebase Hosting config (docs/features/002-ui-redesign/d1/firebase.json):
// the "headers" blocks (CSP, nosniff, …, /assets/** immutable cache), trailingSlash: true (/demo → 301 /demo/),
// gzip like Hosting, 404 for anything else (no /api rewrite in D1).
//   node tests/qa/002/support/hosting-server.mjs <public dir> <firebase.json> <port> [rewrite-target, e.g. http://127.0.0.1:4071]
// With a rewrite target, the marketing target's "rewrites" (e.g. /api/v1/demo-requests → Cloud Run) are proxied
// there, adding an X-Forwarded-For hop like Hosting does.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
const [dir, cfgPath, port = '4610', target] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')).hosting.find((h) => h.target === 'marketing');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
const glob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$');
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  const rw = (cfg.rewrites || []).find((r) => r.run && r.source === p);
  if (rw && target) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const h = { 'content-type': req.headers['content-type'] || '', 'x-forwarded-for': (req.socket.remoteAddress || '').replace('::ffff:', ''), origin: 'https://parkflows.in' }; // in production the browser's Origin is parkflows.in
    const up = await fetch(target + p + url.search, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const body = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json', ...(up.headers.get('retry-after') ? { 'Retry-After': up.headers.get('retry-after') } : {}) });
    return res.end(body);
  }
  const headers = {};
  for (const h of cfg.headers) if (glob(h.source).test(p) || (h.source === '**')) for (const kv of h.headers) headers[kv.key] = kv.value;
  let file = normalize(join(dir, p));
  if (!file.startsWith(normalize(dir))) { res.writeHead(400); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (cfg.trailingSlash && !p.endsWith('/')) { res.writeHead(301, { ...headers, Location: p + '/' + url.search }); return res.end(); }
    file = join(file, 'index.html');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/html' }); return res.end('Not found');
  }
  let body = readFileSync(file);
  const h = { ...headers, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
  if (/gzip/.test(req.headers['accept-encoding'] || '') && !/\.(png|woff2)$/.test(file)) { body = gzipSync(body); h['Content-Encoding'] = 'gzip'; }
  h['Content-Length'] = body.length;
  res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : body);
}).listen(Number(port), () => console.log(`hosting mimic on ${port} → ${dir}`));
