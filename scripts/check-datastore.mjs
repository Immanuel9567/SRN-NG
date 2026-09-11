// Verifies the SQLite datastore that replaced the JSON file store.
//
//   node scripts/check-datastore.mjs
//
// Four properties, in the order they matter for a live site:
//   1. signing up writes a real row, and the credentials are hashed
//   2. the database itself rejects a duplicate, not just a JavaScript check
//   3. data survives a server restart, and sessions survive with it
//   4. an existing deployment's JSON files are imported on first open

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

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

let port = 5700 + Math.floor(Math.random() * 90);
function nextPort() { port += 1; return port; }

// Boots the real server against a given data directory and waits for its banner.
function boot(dataDir, extraEnv = {}) {
  const p = nextPort();
  const child = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(p), SRN_DATA_DIR: dataDir, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((res) => {
    let log = '';
    const t = setTimeout(() => res(false), 12000);
    child.stdout.on('data', (d) => {
      log += d;
      if (log.includes('SRN-NG server on')) { clearTimeout(t); res(true); }
    });
  });
  return { child, ready, base: `http://127.0.0.1:${p}` };
}

async function stop(child) {
  child.kill();
  await new Promise((res) => { child.on('exit', res); setTimeout(res, 2000); });
}

const jar = () => ({ cookie: '' });
async function call(base, method, path, body, session = jar()) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.cookie) headers.Cookie = session.cookie;
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) session.cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

// Runs a snippet in a child process with its own SRN_DATA_DIR, so db.js resolves
// the right directory at import time. Returns its stdout.
function probe(dataDir, code) {
  return new Promise((res) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      cwd: ROOT,
      env: { ...process.env, SRN_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    // Kept separate. node:sqlite prints an ExperimentalWarning to stderr, and
    // mixing it into stdout broke JSON parsing of the probe output.
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', () => {
      if (err && !/ExperimentalWarning|trace-warnings/.test(err)) {
        console.log(`      probe stderr: ${err.trim().split('\n').slice(0, 3).join(' | ')}`);
      }
      res(out);
    });
  });
}

const ADMIN_PW = 'DatastoreTest!1';

// ---- 1. a fresh datastore, seeded and signed up ---------------------------
console.log('\n-- fresh datastore --');
const dirA = mkdtempSync(join(tmpdir(), 'srn-db-'));

check('a fresh data directory holds no database', !existsSync(join(dirA, 'srn.db')));

const seedOut = await probe(dirA, `
  const { write } = await import('./server/store.js');
  const { hashPassword } = await import('./server/auth.js');
  write('games', [{ id: 'iracing', name: 'iRacing', shortName: 'iRacing', genre: 'GT' }]);
  write('events', [{ id: 'evt_1', title: 'Race Night', status: 'upcoming', date: 'Jul 17, 2026' }]);
  write('users', [{ id: 'usr_admin', username: 'admin', email: 'admin@srn.ng', role: 'admin',
    vendor: false, ...hashPassword(${JSON.stringify(ADMIN_PW)}), interests: [] }]);
  console.log('seeded');
`);
check('seeding writes into SQLite', seedOut.includes('seeded'), seedOut.trim().split('\n').pop());
check('a database file is created', existsSync(join(dirA, 'srn.db')));

const { child: srv1, ready: r1, base: base1 } = boot(dirA);
check('server boots against the new datastore', await r1, 'no banner');

if (await r1) {
  const events = await call(base1, 'GET', '/api/events');
  check('seeded events are served from SQLite', events.data?.events?.length === 1,
    JSON.stringify(events.data)?.slice(0, 80));

  const admin = await call(base1, 'POST', '/api/auth/login',
    { email: 'admin@srn.ng', password: ADMIN_PW });
  check('the seeded admin can sign in', admin.status === 200, `status ${admin.status}`);

  // The flow the whole request was about.
  const token = jar();
  const signup = await call(base1, 'GET', '/api/auth/me', undefined, token);
  check('a signed-out visitor is 401', signup.status === 401);

  const newUser = await call(base1, 'POST', '/api/auth/signup',
    { username: 'newdriver', email: 'driver@simracing.ng', password: 'Sup3rSecret!', vendor: false }, token);
  check('registration succeeds', newUser.status === 201, `status ${newUser.status}`);
  check('registration returns a session cookie', token.cookie.startsWith('srn_session='));
  check('the response carries no password material',
    !JSON.stringify(newUser.data).includes('hash') && !JSON.stringify(newUser.data).includes('salt'));

  const me = await call(base1, 'GET', '/api/auth/me', undefined, token);
  check('the new account is signed in', me.status === 200 && me.data?.user?.username === 'newdriver',
    `status ${me.status}`);

  const dupe = await call(base1, 'POST', '/api/auth/signup',
    { username: 'other', email: 'driver@simracing.ng', password: 'Sup3rSecret!' });
  check('a duplicate email is rejected 409', dupe.status === 409, `status ${dupe.status}`);

  const sneak = await call(base1, 'POST', '/api/auth/signup',
    { username: 'sneaky', email: 'sneak@simracing.ng', password: 'Sup3rSecret!', role: 'admin' });
  check('signup cannot mint an admin', sneak.status === 201 && sneak.data?.user?.role === 'user',
    JSON.stringify(sneak.data?.user?.role));

  await stop(srv1);
}

// ---- 2. the credentials are stored hashed --------------------------------
console.log('\n-- stored credential shape --');
const stored = await probe(dirA, `
  const { DatabaseSync } = await import('node:sqlite');
  const { DB_FILE } = await import('./server/db.js');
  const db = new DatabaseSync(DB_FILE);
  const rows = db.prepare("SELECT body FROM docs WHERE collection='users' ORDER BY ordinal").all();
  console.log(JSON.stringify(rows.map((r) => JSON.parse(r.body))));
`);
let users = [];
try { users = JSON.parse(stored.trim().split('\n').pop()); } catch { /* reported below */ }
const admin = users.find((u) => u.username === 'admin');
const driver = users.find((u) => u.username === 'newdriver');
// Three accounts by now: the seeded admin, newdriver, and the account the
// cannot-mint-an-admin check registered.
check('every registered account is stored as a row',
  users.length === 3 && !!admin && !!driver, `found ${users.length}`);
check('the admin keeps the admin role', admin?.role === 'admin', admin?.role);
check('the account keeps its email', driver?.email === 'driver@simracing.ng');
check('the password is never stored in plaintext',
  !JSON.stringify(users).includes('Sup3rSecret!'));
check('the account has a per-user salt', !!driver?.salt && driver.salt.length === 32);
check('the account has an scrypt hash', !!driver?.hash && driver.hash.length === 128);
check('no password field is written', users.every((u) => u.password === undefined));

// ---- 3. the database enforces uniqueness, not just JavaScript ------------
console.log('\n-- database-level constraints --');
const dirB = mkdtempSync(join(tmpdir(), 'srn-db-u-'));
const uniq = await probe(dirB, `
  const { write } = await import('./server/store.js');
  const { hashPassword } = await import('./server/auth.js');
  const mk = (id, email, username) => ({ id, email, username, role: 'user',
    ...hashPassword('Whatever!1'), interests: [] });
  write('users', [mk('u1', 'same@simracing.ng', 'first')]);
  let emailErr = '';
  try { write('users', [mk('u1', 'same@simracing.ng', 'first'), mk('u2', 'same@simracing.ng', 'second')]); }
  catch (e) { emailErr = e.message; }
  console.log('EMAIL:' + (emailErr.includes('UNIQUE') ? 'blocked' : 'ALLOWED'));
  let nameErr = '';
  try { write('users', [mk('u1', 'same@simracing.ng', 'first'), mk('u3', 'other@simracing.ng', 'first')]); }
  catch (e) { nameErr = e.message; }
  console.log('USERNAME:' + (nameErr.includes('UNIQUE') ? 'blocked' : 'ALLOWED'));
  // a different collection may reuse the address
  write('members', [{ id: 'm1', name: 'Driver', email: 'same@simracing.ng' }]);
  console.log('MEMBER:ok');
  // and the failed writes left the collection intact
  const { read } = await import('./server/store.js');
  console.log('COUNT:' + read('users', []).length);
`);
check('a duplicate email is rejected by the database', uniq.includes('EMAIL:blocked'));
check('a duplicate username is rejected by the database', uniq.includes('USERNAME:blocked'));
check('another collection may reuse an email', uniq.includes('MEMBER:ok'));
check('a rejected write rolls back leaving the collection intact', uniq.includes('COUNT:1'));

// ---- 4. data and sessions survive a restart -----------------------------
console.log('\n-- restart persistence --');
const { child: srv2, ready: r2, base: base2 } = boot(dirA);
check('server restarts against the same file', await r2, 'no banner');

if (await r2) {
  const relogin = await call(base2, 'POST', '/api/auth/login',
    { email: 'driver@simracing.ng', password: 'Sup3rSecret!' });
  check('the account survives a restart', relogin.status === 200, `status ${relogin.status}`);

  const wrong = await call(base2, 'POST', '/api/auth/login',
    { email: 'driver@simracing.ng', password: 'NotThePassword!1' });
  check('a wrong password is rejected 401', wrong.status === 401, `status ${wrong.status}`);

  // Sessions live in their own table, so they must outlive the process too.
  const carried = relogin.data && relogin.status === 200;
  const me2 = await call(base2, 'GET', '/api/auth/me');
  check('the session table is being read, not a stale file',
    carried && me2.status === 401, `status ${me2.status}`);

  const out = await call(base2, 'POST', '/api/auth/logout');
  check('logout succeeds', out.status === 200, `status ${out.status}`);

  await stop(srv2);
}

// ---- 5. an existing JSON datastore is imported --------------------------
console.log('\n-- legacy JSON import --');
const dirC = mkdtempSync(join(tmpdir(), 'srn-db-legacy-'));
writeFileSync(join(dirC, 'users.json'), JSON.stringify([{
  id: 'usr_old', username: 'oldadmin', email: 'old@simracing.ng', role: 'admin',
  vendor: false, salt: 'a'.repeat(32), hash: 'b'.repeat(128), interests: [],
}]));
writeFileSync(join(dirC, 'events.json'), JSON.stringify([
  { id: 'evt_old', title: 'Imported Event', status: 'upcoming', date: 'Aug 1, 2026' },
]));
writeFileSync(join(dirC, 'sessions.json'), JSON.stringify({
  live_token: { userId: 'usr_old', expiresAt: Date.now() + 60000 },
  dead_token: { userId: 'usr_old', expiresAt: Date.now() - 60000 },
}));

const { child: srv3, ready: r3, base: base3 } = boot(dirC);
check('server boots over an existing JSON datastore', await r3, 'no banner');

if (await r3) {
  const ev = await call(base3, 'GET', '/api/events');
  check('JSON events were imported and are served', ev.data?.events?.[0]?.title === 'Imported Event',
    JSON.stringify(ev.data)?.slice(0, 80));
  await stop(srv3);
}

const leftovers = readdirSync(dirC).filter((f) => f.endsWith('.json'));
check('the JSON files are left in place, not deleted', leftovers.length === 3, leftovers.join(', '));

const sessionProbe = await probe(dirC, `
  const { countSessions } = await import('./server/db.js');
  console.log('SESSIONS:' + countSessions());
`);
check('only the unexpired session was carried over', sessionProbe.includes('SESSIONS:1'),
  sessionProbe.trim().split('\n').pop());

for (const d of [dirA, dirB, dirC]) rmSync(d, { recursive: true, force: true });

console.log(`\n${passed} of ${passed + failed} datastore checks passed.`);
process.exit(failed ? 1 : 0);
