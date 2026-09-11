// Verifies reverse-proxy client addressing, which decides whether the login rate
// limiter separates clients or collapses them into one shared bucket.
//
//   node scripts/check-proxy-trust.mjs
//
// Part 1 tests pickClientAddress directly: no server, no ports, deterministic.
// Part 2 boots the real server with SRN_TRUST_PROXY=1 and confirms a spoofed
// X-Forwarded-For cannot widen the limiter, because that is the property that
// actually protects the login endpoint.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 5900 + Math.floor(Math.random() * 90);

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

// ---- part 1: the pure picker ----------------------------------------------
const { pickClientAddress } = await import('../server/ratelimit.js');

const SOCKET = '127.0.0.1';

// No proxy configured: XFF must be ignored, or a client rotates it and walks past the limit.
check(
  'trustedHops=0 ignores X-Forwarded-For',
  pickClientAddress(SOCKET, '1.2.3.4', 0) === SOCKET,
  pickClientAddress(SOCKET, '1.2.3.4', 0),
);
check(
  'trustedHops=0 ignores a forged multi-entry chain',
  pickClientAddress(SOCKET, '1.2.3.4, 5.6.7.8, 9.9.9.9', 0) === SOCKET,
);

// One proxy: it appended the real client address, so the rightmost entry wins.
check(
  'trustedHops=1 takes the rightmost entry',
  pickClientAddress(SOCKET, '203.0.113.7', 1) === '203.0.113.7',
  pickClientAddress(SOCKET, '203.0.113.7', 1),
);
check(
  'trustedHops=2 takes the entry left of the proxies',
  pickClientAddress(SOCKET, '203.0.113.7, 172.16.0.1', 2) === '203.0.113.7',
  pickClientAddress(SOCKET, '203.0.113.7, 172.16.0.1', 2),
);

// The security-critical case: the client prepends junk, the proxy appends the truth.
// Only the truth may be used, otherwise adding a random prefix mints a fresh bucket.
check(
  'a client-supplied prefix cannot displace the real address',
  pickClientAddress(SOCKET, '9.9.9.9, 203.0.113.7', 1) === '203.0.113.7',
  pickClientAddress(SOCKET, '9.9.9.9, 203.0.113.7', 1),
);
check(
  'two different forged prefixes still resolve to one address',
  pickClientAddress(SOCKET, '9.9.9.9, 203.0.113.7', 1)
    === pickClientAddress(SOCKET, '8.8.8.8, 203.0.113.7', 1),
);
check(
  'whitespace in the chain is tolerated',
  pickClientAddress(SOCKET, '  203.0.113.7 ,  172.16.0.1 ', 2) === '203.0.113.7',
  pickClientAddress(SOCKET, '  203.0.113.7 ,  172.16.0.1 ', 2),
);
// A chain shorter than the configured hop count did not traverse our proxies.
check(
  'a short chain falls back to the socket address',
  pickClientAddress(SOCKET, '203.0.113.7', 3) === SOCKET,
);
check('a missing header falls back to the socket address',
  pickClientAddress(SOCKET, undefined, 1) === SOCKET);
check('an empty header falls back to the socket address',
  pickClientAddress(SOCKET, '', 1) === SOCKET);

// ---- part 2: the live limiter ---------------------------------------------
const dataDir = mkdtempSync(join(tmpdir(), 'srn-proxy-'));
const uploadDir = mkdtempSync(join(tmpdir(), 'srn-proxy-up-'));
const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    SRN_DATA_DIR: dataDir,
    SRN_UPLOAD_DIR: uploadDir,
    SRN_TRUST_PROXY: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const banner = `SRN-NG server on http://0.0.0.0:${PORT}`;
const ready = await new Promise((res) => {
  let log = '';
  const t = setTimeout(() => res(false), 10000);
  server.stdout.on('data', (d) => {
    log += d;
    if (log.includes(banner)) {
      clearTimeout(t);
      res(true);
    }
  });
});
check('server boots with SRN_TRUST_PROXY=1', ready, 'no banner');

if (ready) {
  // A failed login is enough to consume limiter budget, and returns 401 until the
  // window is exhausted. Uses a raw socket because node's fetch refuses to set Host,
  // and we need a custom X-Forwarded-For.
  const attempt = (xff) => new Promise((res) => {
    const payload = JSON.stringify({ email: 'nobody@srn.ng', password: 'WrongPassword!1' });
    const req = request({
      host: '127.0.0.1',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Forwarded-For': xff,
      },
    }, (r) => {
      r.resume();
      r.on('end', () => res(r.statusCode));
    });
    req.on('error', () => res(0));
    req.end(payload);
  });

  // Exhaust the window for one client.
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push(await attempt('203.0.113.10'));
  check('one client is throttled after the limit', statuses.includes(429), statuses.join(','));

  // Rotating the forged prefix must not reset the bucket: same true client.
  const afterForged = [];
  for (let i = 0; i < 3; i++) afterForged.push(await attempt(`${i + 1}.${i + 2}.${i + 3}.${i + 4}, 203.0.113.10`));
  check('a forged prefix does not reset the throttle', afterForged.every((s) => s === 429), afterForged.join(','));

  // A genuinely different client is unaffected.
  const other = await attempt('198.51.100.5');
  check('a different client is still served', other === 401, String(other));
}

server.kill();
rmSync(dataDir, { recursive: true, force: true });
rmSync(uploadDir, { recursive: true, force: true });

console.log(`\n${passed} of ${passed + failed} proxy-trust checks passed.`);
process.exit(failed ? 1 : 0);
