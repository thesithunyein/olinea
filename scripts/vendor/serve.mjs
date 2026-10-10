/*
 * Minimal static server for local verification of the console. Not part of the site.
 * Run: node scripts/vendor/serve.mjs [port]
 *
 * It applies the headers vercel.json declares, so a page tested here is tested under the policy it
 * will actually be served with — a CSP is only worth writing if it is exercised before a deploy.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const port = Number(process.argv[2] ?? 4171);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* vercel.json's `source` values are path patterns; the two shapes used here are "/(.*)" and any
   literal prefix, which is all this needs to reproduce the same headers. */
const rules = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers;
const headersFor = (pathname) => Object.fromEntries(
  rules
    .filter((r) => r.source === '/(.*)' || pathname.startsWith(r.source.replace(/\(\?.*\)$/, '').replace(/\/$/, '')))
    .flatMap((r) => r.headers)
    .map((h) => [h.key, h.value]),
);

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  try {
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const body = readFileSync(file);
    res.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
      ...headersFor(url.pathname),
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + url.pathname);
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
