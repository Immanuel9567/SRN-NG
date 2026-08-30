// Verifies the optional Host-header allowlist in server/index.js.
// Needs its own server booted with SRN_ALLOWED_HOSTS set.
//
//   npm run test:hostguard

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 5100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'srn-hostguard-'));

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    SRN_DATA_DIR: dataDir,
    SRN_ALLOWED_HOSTS: 'srn.test, .e2b.app',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

try {
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`server did not start.\n${log}`)), 10000);
    const poll = () => {
      if (log.includes('EADDRINUSE')) { clearTimeout(timer); rej(new Error(`port ${PORT} in use.\n${log}`)); return; }
      if (log.includes(`SRN-NG server on http://0.0.0.0:${PORT}`)) { clearTimeout(timer); res(); return; }
      setTimeout(poll, 50);
    };
    poll();
  });

  // node:http, not fetch: undici silently ignores a Host header override, so every
  // request would arrive as 127.0.0.1 and be rejected regardless of the allowlist.
  const { request } = await import('node:http');
  const get = (host, path = '/') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, headers: { Host: host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });

  const exact = await get('srn.test');
  check('exact allowed host is served', exact === 200, `got ${exact}`);
  check('allowed host with a port is served', await get('srn.test:5173') === 200);
  check('allowed subdomain is served', await get('sandbox-abc.e2b.app') === 200);
  check('the apex of a dot rule is served', await get('e2b.app') === 200);
  check('unrelated host is rejected 421', await get('evil.example.com') === 421, `got ${await get('evil.example.com')}`);
  check('suffix lookalike is rejected 421', await get('notsrn.test') === 421, `got ${await get('notsrn.test')}`);
  check('subdomain lookalike is rejected 421', await get('evile2b.app') === 421, `got ${await get('evile2b.app')}`);
  check('API is guarded too', await get('evil.example.com', '/api/auth/me') === 421);
  check('localhost is rejected when an allowlist is set', await get(`127.0.0.1:${PORT}`) === 421);

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} of ${pass + failures.length} host guard checks FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`All ${pass} host guard checks passed.`);
  }
} catch (err) {
  console.error('host guard check crashed:', err);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
