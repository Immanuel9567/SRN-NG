// Rotates the admin password without touching any other account.
//
//   npm run reset-admin -- admin@srn.ng
//   SRN_ADMIN_PASSWORD='...' npm run reset-admin -- admin@srn.ng
//
// With no SRN_ADMIN_PASSWORD it generates one and prints it once.

import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/auth.js';
import { read, write } from '../server/store.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
const users = read('users', []);
const admins = users.filter((u) => u.role === 'admin');

if (!admins.length) {
  console.error('No admin account exists. Run `npm run seed` first.');
  process.exit(1);
}

const target = email ? admins.find((u) => u.email === email) : admins[0];
if (!target) {
  console.error(`No admin with email "${email}". Admins on file: ${admins.map((u) => u.email).join(', ')}`);
  process.exit(1);
}

const generated = randomBytes(9).toString('base64url');
const password = process.env.SRN_ADMIN_PASSWORD || generated;
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const { salt, hash } = hashPassword(password);
target.salt = salt;
target.hash = hash;
target.passwordChangedAt = new Date().toISOString();
write('users', users);

// Existing sessions stay valid; they are bound to the user id, not the password.
console.log(`Rotated the password for admin "${target.username}" <${target.email}>.`);
if (!process.env.SRN_ADMIN_PASSWORD) {
  console.log('');
  console.log('  new password (printed once, only a hash is stored):');
  console.log(`  ${password}`);
  console.log('');
  console.log('  Re-run with SRN_ADMIN_PASSWORD=... to choose your own.');
}
