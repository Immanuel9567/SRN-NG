// Persistence integration test: one data directory contains the SQLite database
// and rig photos, and both survive a full server restart.
import { createServer } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = mkdtempSync(join(tmpdir(), 'srn-persistent-bucket-'));
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const value = probe.address().port;
    probe.close(() => resolve(value));
  });
});
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: String(port),
  HOST: '127.0.0.1',
  SRN_DATA_DIR: dataDir,
  SRN_ADMIN_EMAIL: 'bucket-admin@srn.ng',
  SRN_ADMIN_USERNAME: 'bucketadmin',
  SRN_ADMIN_PASSWORD: 'TestAdmin123',
};
delete env.SRN_UPLOAD_DIR;

let child;
let log = '';
let passed = 0;
const failed = [];
const check = (label, ok) => {
  if (ok) { passed++; console.log(`PASS  ${label}`); }
  else { failed.push(label); console.log(`FAIL  ${label}`); }
};

async function boot() {
  log = '';
  child = spawn(process.execPath, [join(ROOT, 'server/index.js')], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const banner = `SRN-NG server on http://127.0.0.1:${port}`;
  const started = Date.now();
  while (!log.includes(banner)) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${log}`);
    if (Date.now() - started > 10000) throw new Error(`Server startup timed out.\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1500).unref();
  });
}

async function call(path, method = 'GET', body, cookie = '') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

try {
  await boot();
  const signup = await call('/api/auth/signup', 'POST', {
    username: 'bucketdriver', email: 'bucketdriver@example.test', password: 'BucketTest123',
  });
  check('test user registers into persistent datastore', signup.status === 201 && signup.data.user?.email === 'bucketdriver@example.test');

  const event = await call('/api/events', 'POST', {
    title: 'Bucket Test Track Day', date: 'Oct 1, 2026', time: '6:00 PM WAT',
    location: 'Port Harcourt', type: 'Track Day', description: 'Persistence test activity.',
  }, signup.cookie);
  check('activity submission is accepted and stored', event.status === 201 && event.data.event?.status === 'pending');

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l6sAAAAASUVORK5CYII=';
  const rig = await call('/api/rigs', 'POST', {
    name: 'Bucket Test Rig', owner: 'bucketdriver', city: 'Port Harcourt', photo: png,
  }, signup.cookie);
  check('rig photo is attached as a saved file', rig.status === 201 && /^media\/uploads\/up-.*\.png$/.test(rig.data.rig?.img || ''));
  const photoFile = join(dataDir, 'uploads', rig.data.rig?.img?.split('/').at(-1) || 'missing.png');
  check('photo file is stored inside the same persistent data bucket', existsSync(photoFile));

  await stop();
  await boot();
  const adminLogin = await call('/api/auth/login', 'POST', {
    email: 'bucket-admin@srn.ng', password: 'TestAdmin123',
  });
  const adminCookie = adminLogin.cookie;
  const users = await call('/api/users', 'GET', undefined, adminCookie);
  check('test user remains after server restart', users.status === 200 && users.data.users?.some((user) => user.email === 'bucketdriver@example.test'));

  const events = await call('/api/events?scope=all', 'GET', undefined, adminCookie);
  check('submitted activity remains after server restart', events.status === 200 && events.data.events?.some((item) => item.title === 'Bucket Test Track Day'));

  const rigs = await call('/api/rigs?scope=all', 'GET', undefined, adminCookie);
  const savedRig = rigs.data.rigs?.find((item) => item.name === 'Bucket Test Rig');
  check('rig record and photo path remain after server restart', rigs.status === 200 && !!savedRig?.img);
  if (savedRig?.img) {
    const image = await fetch(`${base}/${savedRig.img}`);
    const bytes = Buffer.from(await image.arrayBuffer());
    check('uploaded photo is served from the same data bucket after restart', image.status === 200 && image.headers.get('content-type') === 'image/png' && bytes.length > 0);
  } else {
    check('uploaded photo is served from the same data bucket after restart', false);
  }

  const backupRoot = mkdtempSync(join(tmpdir(), 'srn-bucket-backup-'));
  execFileSync(process.execPath, [join(ROOT, 'scripts/backup-data.mjs')], {
    cwd: ROOT,
    env: { ...env, SRN_BACKUP_DIR: backupRoot },
    stdio: 'pipe',
  });
  const backup = join(backupRoot, readdirSync(backupRoot)[0] || 'missing');
  check('backup captures the SQLite database and uploaded-photo directory',
    existsSync(join(backup, 'srn.db')) && existsSync(join(backup, 'uploads', photoFile.split('/').at(-1))));
  rmSync(backupRoot, { recursive: true, force: true });
} catch (error) {
  failed.push('test runner completed');
  console.error(error.stack || error);
} finally {
  await stop();
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} persistence checks passed; ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;
