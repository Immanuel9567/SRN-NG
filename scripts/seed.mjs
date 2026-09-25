// Seeds the repo-backed datastore: data/events.json, data/news.json and the first admin.
//
//   npm run seed
//   SRN_ADMIN_PASSWORD=... npm run seed     # set the admin password explicitly
//   npm run seed -- --force                 # overwrite events/news from js/data.js
//
// Idempotent: existing users, events and news are preserved unless --force is passed.

import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { hashPassword, newId } from '../server/auth.js';
import { read, write } from '../server/store.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const force = process.argv.includes('--force');

// js/data.js is a classic script (top-level consts are script-scoped, not exported),
// so evaluate it in a VM to read the mock collections.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js', 'data.js'), 'utf8'), sandbox);
const get = (name) => vm.runInContext(name, sandbox);

// ---- events ---------------------------------------------------------------
const eventsFile = join(ROOT, 'data', 'events.json');
if (force || !existsSync(eventsFile)) {
  const events = get('ACTIVITIES').map((a) => ({
    ...a,
    status: a.status || 'upcoming',
    rsvps: a.rsvps || [],
    submittedBy: 'SRN Editorial',
    submittedById: null,
    createdAt: new Date().toISOString(),
  }));
  write('events', events);
  console.log(`events.json: wrote ${events.length} events from js/data.js`);
} else {
  console.log(`events.json: kept existing ${read('events', []).length} events (use --force to reseed)`);
}

// ---- news -----------------------------------------------------------------
const newsFile = join(ROOT, 'data', 'news.json');
if (force || !existsSync(newsFile)) {
  const articles = get('NEWS').map((n) => ({
    ...n,
    createdBy: 'SRN Editorial',
    createdAt: new Date().toISOString(),
  }));
  write('news', articles);
  console.log(`news.json: wrote ${articles.length} articles from js/data.js`);
} else {
  console.log(`news.json: kept existing ${read('news', []).length} articles (use --force to reseed)`);
}

// ---- remaining collections ------------------------------------------------
for (const [file, source, label] of [
  ['games', 'GAMES', 'games'],
  ['members', 'MEMBERS', 'member profiles'],
  ['merch', 'MERCH', 'merch items'],
  ['rigs', 'RIGS', 'rigs'],
]) {
  const target = join(ROOT, 'data', `${file}.json`);
  if (force || !existsSync(target)) {
    // rigs and merch are moderated collections, so seeded rows start approved.
    const rows = get(source).map((r) =>
      (file === 'rigs' || file === 'merch') ? { ...r, status: 'approved' } : r);
    write(file, rows);
    console.log(`${file}.json: wrote ${rows.length} ${label} from js/data.js`);
  } else {
    console.log(`${file}.json: kept existing ${read(file, []).length} ${label} (use --force to reseed)`);
  }
}

// ---- empty inbox collections -----------------------------------------------
for (const name of ['messages', 'newsletter', 'orders', 'friends', 'notifications', 'comments', 'reactions']) {
  const target = join(ROOT, 'data', `${name}.json`);
  if (!existsSync(target)) {
    write(name, []);
    console.log(`${name}.json: created empty`);
  }
}

// ---- first admin ----------------------------------------------------------
const users = read('users', []);
if (users.some((u) => u.role === 'admin')) {
  console.log('users.json: admin already exists, nothing to do');
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
  console.log(`users.json: created admin "${admin.username}" <${admin.email}>`);
  if (!process.env.SRN_ADMIN_PASSWORD) {
    console.log('');
    console.log('  generated admin password (printed once, not stored in plain text):');
    console.log(`  ${password}`);
    console.log('');
    console.log('  Re-run with SRN_ADMIN_PASSWORD=... to choose your own.');
  }
}

// ---- backfill fields added after the initial seed ---------------------------
{
  const users = read('users', []);
  let touched = 0;
  for (const u of users) {
    if (!Array.isArray(u.interests)) { u.interests = []; touched++; }
  }
  if (touched) { write('users', users); console.log(`users.json: added interests to ${touched} account(s)`); }

  const events = read('events', []);
  let eventTouched = 0;
  for (const e of events) {
    if (!e.game) { e.game = 'general'; eventTouched++; }
    if (!Array.isArray(e.rsvps)) { e.rsvps = []; eventTouched++; }
  }
  if (eventTouched) { write('events', events); console.log(`events.json: backfilled ${eventTouched} field(s)`); }

  // Drop driver profiles whose account no longer exists (a deleted user leaves one behind).
  const ids = new Set(users.map((u) => u.id));
  const members = read('members', []);
  const kept = members.filter((m) => !m.userId || ids.has(m.userId));
  if (kept.length !== members.length) {
    write('members', kept);
    console.log(`members.json: removed ${members.length - kept.length} orphan profile(s)`);
  }
}

// ---- guarantee every account has a linked driver profile -------------------
// Accounts created before profiles were auto-created on signup need backfilling.
{
  const allUsers = read('users', []);
  const allMembers = read('members', []);
  let added = 0;
  for (const u of allUsers) {
    if (allMembers.some((m) => m.userId === u.id)) continue;
    allMembers.push({
      id: newId('mem'),
      userId: u.id,
      name: u.username,
      city: '',
      rank: u.role === 'admin' ? 'Series Admin' : 'Unranked',
      sim: '',
      avatar: 'media/placeholder.png',
      joined: String(new Date().getFullYear()),
      bio: '',
      stats: { races: 0, wins: 0, podiums: 0 },
      activity: [],
    });
    added++;
  }
  if (added) {
    write('members', allMembers);
    console.log(`members.json: linked ${added} account(s) to a driver profile`);
  } else {
    console.log(`members.json: all ${allUsers.length} account(s) already linked to a profile`);
  }
}
