// Server-loss regression: the account forms must survive the server dying
// mid-session, including the case where the hosting proxy answers the dead
// upstream with its own 404 page.
//
//   npm run test:serverloss
//
// The reported failure: a driver loaded account.html while the server was up
// (so the one-shot API probe passed), the server went away, and the proxy
// answered the signup POST with a bare HTML 404. js/api.js surfaced
// "Request failed (404)" instead of falling back to the browser-local
// datastore. The contract now: an error response WITHOUT a JSON body never
// came from the API, so account calls fall through to the local store; JSON
// errors keep surfacing as-is.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 5100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'srn-serverloss-'));
process.env.SRN_DATA_DIR = dataDir;
process.env.SRN_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'srn-serverloss-uploads-'));

const { JSDOM, VirtualConsole } = await import('jsdom');

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SRN_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

const waitForServer = () => new Promise((res, rej) => {
  const banner = `SRN-NG server on http://0.0.0.0:${PORT}`;
  const timer = setTimeout(() => rej(new Error(`server did not start.\n${log}`)), 10000);
  const poll = () => {
    if (log.includes('EADDRINUSE')) { clearTimeout(timer); rej(new Error(`port ${PORT} in use.\n${log}`)); return; }
    if (log.includes(banner)) { clearTimeout(timer); res(); return; }
    setTimeout(poll, 50);
  };
  poll();
});

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, label, timeout = 8000) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) { console.log(`      (timed out waiting for ${label})`); return false; }
    await sleep(50);
  }
}

// The proxy that answers for the dead server: every /api request gets the
// platform's HTML 404, exactly what a browser sees when the upstream is gone.
const proxy404 = (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, BASE);
  if (url.pathname.startsWith('/api/')) {
    return Promise.resolve(new Response('<html>404 not found</html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
  }
  return fetch(url, init);
};

const submitSignup = (window, username, email) => {
  window.document.getElementById('su-username').value = username;
  window.document.getElementById('su-email').value = email;
  window.document.getElementById('signup-password').value = 'Passw0rd!';
  window.document.getElementById('signup-form')
    .dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
};

try {
  await waitForServer();
  console.log(`server up on ${BASE}\n`);

  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', (e) => {
    if (/fonts\.googleapis\.com/.test(e.message)) return;
    pageErrors.push(e.message);
  });
  const dom = await JSDOM.fromURL(`${BASE}/account.html`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      }));
      window.fetch = (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, BASE);
        return fetch(url, init);
      };
    },
  });
  const window = dom.window;
  await new Promise((r) => window.addEventListener('load', r));
  await sleep(350);

  // 1. Real server, real signup: the happy path works before anything dies.
  const form = window.document.getElementById('signup-form');
  const msg = form.querySelector('[data-form-message]');
  submitSignup(window, 'loss_test_a', 'loss_a@srn.ng');
  check('signup against the live server succeeds',
    await waitFor(() => msg.textContent.includes('Account created'), 'live signup'),
    msg.textContent);

  // 2. A real API error (duplicate username, JSON 409) surfaces as-is.
  msg.textContent = '';
  submitSignup(window, 'loss_test_a', 'loss_a@srn.ng');
  check('a real API error still surfaces as-is',
    await waitFor(() => msg.textContent.includes('already taken'), 'duplicate signup'),
    msg.textContent);

  // 2. Kill the server; the proxy now answers every /api call with a bare 404.
  server.kill('SIGKILL');
  await sleep(200);
  window.fetch = proxy404;

  // 3. Signup again. The old code surfaced "Request failed (404)"; the fix
  //    falls through to the browser-local datastore.
  msg.textContent = '';
  submitSignup(window, 'loss_test_b', 'loss_b@srn.ng');
  check('signup survives a proxy 404 for the dead server',
    await waitFor(() => msg.textContent.trim() !== '', 'fallback signup'),
    msg.textContent);
  check('the failure signature from the report is gone',
    !msg.textContent.includes('Request failed (404)'), msg.textContent);

  let stored = {};
  const hasFallbackUser = () => {
    try { stored = JSON.parse(window.localStorage.getItem('srn.local.v1') || '{}'); } catch { /* ignore */ }
    return JSON.stringify(stored).includes('loss_test_b');
  };
  check('the fallback account landed in the local datastore', await waitFor(hasFallbackUser, 'local write'),
    Object.keys(stored).join(','));

  check('no page errors during the whole loss cycle', pageErrors.length === 0, pageErrors.join(' | '));

  window.close();
} catch (err) {
  failures.push(`harness: ${err.message}`);
  console.log(`FAIL  harness -- ${err.message}\n${log.slice(-800)}`);
} finally {
  server.kill('SIGKILL');
}

console.log('');
if (failures.length) {
  console.log(`${failures.length} of ${pass + failures.length} checks FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`All ${pass} server-loss checks passed.`);
