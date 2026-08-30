// SRN-NG dev/preview server: serves the static site and the /api routes from one
// origin, so browser code only ever uses relative URLs (no CORS, no proxy).
//
//   npm run dev   ->  http://0.0.0.0:5173

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { handleApi } from './api.js';
import { parseCookies } from './auth.js';
import { ROOT } from './store.js';

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

// Optional Host-header allowlist. Unset means allow anything, which is what the
// sandbox preview needs; set it in any real deployment. Entries may be exact
// hosts or a leading-dot suffix match, e.g. ".example.com".
const ALLOWED_HOSTS = (process.env.SRN_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function hostAllowed(hostHeader) {
  if (!ALLOWED_HOSTS.length) return true;
  const host = String(hostHeader || '').toLowerCase().replace(/:\d+$/, '');
  return ALLOWED_HOSTS.some((rule) =>
    rule.startsWith('.') ? host.endsWith(rule) || host === rule.slice(1) : host === rule);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Never serve anything outside the repo root, and never serve the datastore or server code.
const BLOCKED_PREFIXES = ['data', 'server', 'node_modules', 'scripts', 'skills', '.git'];

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  if (relative.split(sep).some((part) => BLOCKED_PREFIXES.includes(part))) return null;
  const full = resolve(join(ROOT, relative));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

function sendStatic(res, file) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(file).pipe(res);
}

function sendNotFound(res) {
  const notFound = join(ROOT, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  createReadStream(notFound).on('error', () => res.end('Not found')).pipe(res);
}

function resolvePage(pathname) {
  let file = safeStaticPath(pathname === '/' ? '/index.html' : pathname);
  if (!file) return { forbidden: true };
  if (existsSync(file) && statSync(file).isFile()) return { file };
  // Extensionless hrefs (/gallery, /account) used to 404 even though gallery.html exists.
  if (!extname(pathname)) {
    const html = safeStaticPath(`${pathname === '/' ? '/index' : pathname}.html`);
    if (html && existsSync(html) && statSync(html).isFile()) return { file: html };
  }
  return { missing: true };
}

const server = createServer(async (req, res) => {
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Misdirected Request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const cookies = parseCookies(req.headers.cookie);

  if (url.pathname.startsWith('/api/')) {
    const { status, body, headers } = await handleApi(req, res, url, cookies);
    res.writeHead(status, headers);
    res.end(body === undefined ? '' : JSON.stringify(body));
    return;
  }

  const resolved = resolvePage(url.pathname);
  if (resolved.forbidden) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (resolved.missing) {
    sendNotFound(res);
    return;
  }
  sendStatic(res, resolved.file);
});

server.listen(PORT, HOST, () => {
  console.log(`SRN-NG server on http://${HOST}:${PORT}`);
  console.log(`  static root : ${ROOT}`);
  console.log(`  api         : /api/auth/*, /api/users/*, /api/events, /api/news, /api/orders, /api/merch`);
  console.log(`  host check  : ${ALLOWED_HOSTS.length ? ALLOWED_HOSTS.join(', ') : 'DISABLED (set SRN_ALLOWED_HOSTS in production)'}`);
});
