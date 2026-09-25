// Bootstrap the SRN-NG datastore.
//
//   npm run seed
//
// Fresh deployment: an empty database plus one admin account. There is no
// demo content; events, news, members, merch and rigs are what the community
// actually posts. The database file (data/srn.db) is gitignored runtime state.
//
// The admin password comes from SRN_ADMIN_PASSWORD, or is generated and
// printed once. Idempotent: an existing admin is never touched.

import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
process.env.SRN_DATA_DIR = process.env.SRN_DATA_DIR || join(ROOT, 'data');

const { hashPassword, newId } = await import('../server/auth.js');
const { read, write, DB_PATH } = await import('../server/store.js');

// ---- collections -----------------------------------------------------------
// Users start empty; the admin below is the first row. Sessions is an object
// keyed by token. Everything else the site reads starts as an empty array.
const users = read('users', []);
if (!users.length) write('users', []);
write('sessions', read('sessions', {}));
for (const name of ['events', 'news', 'games', 'members', 'merch', 'rigs',
  'messages', 'newsletter', 'orders', 'friends', 'notifications', 'comments', 'reactions']) {
  if (!read(name, null)) write(name, []);
}

// ---- first admin ------------------------------------------------------------
if (users.some((u) => u.role === 'admin')) {
  console.log('admin: already exists, nothing to do');
} else {
  const generated = randomBytes(9).toString('base64url');
  const password = process.env.SRN_ADMIN_PASSWORD || generated;
  const admin = {
    id: newId('usr'),
    username: process.env.SRN_ADMIN_USERNAME || 'admin',
    email: (process.env.SRN_ADMIN_EMAIL || 'admin@srn.ng').toLowerCase(),
    role: 'admin',
    vendor: false,
    ...hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  write('users', [...users, admin]);
  console.log(`admin: created "${admin.username}" <${admin.email}>`);
  if (!process.env.SRN_ADMIN_PASSWORD) {
    console.log('');
    console.log('  generated admin password (printed once, not stored in plain text):');
    console.log(`  ${password}`);
    console.log('');
    console.log('  Re-run with SRN_ADMIN_PASSWORD=... to choose your own.');
  }
}

console.log(`datastore: ${DB_PATH}`);
