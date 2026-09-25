// End-to-end smoke test for the accounts + content API.
//
//   npm run test:api
//
// Boots server/index.js on a throwaway port against a temporary SRN_DATA_DIR,
// exercises every route including the authorization failures, then tears down.
// Exits non-zero if any assertion fails, so it can gate a commit.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
// Random port: a leftover server from a killed run must not be mistaken for ours.
const PORT = 5100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'srn-data-'));

// store.js resolves DATA_DIR at import time, so the env var must be set BEFORE the
// dynamic imports below. A static import here would write into the repo's real data/.
process.env.SRN_DATA_DIR = dataDir;
const uploadDir = mkdtempSync(join(tmpdir(), 'srn-uploads-'));
process.env.SRN_UPLOAD_DIR = uploadDir;
const { hashPassword, newId } = await import('../server/auth.js');
const { write } = await import('../server/store.js');

// ---- seed a throwaway datastore -------------------------------------------
const ADMIN_PASSWORD = 'TestAdmin!123';
write('users', [{
  id: newId('usr'), username: 'rootadmin', email: 'root@srn.ng', role: 'admin', vendor: false,
  ...hashPassword(ADMIN_PASSWORD), createdAt: new Date().toISOString(),
}]);
write('events', [{ id: 'evt_seed', title: 'Seeded Race Night', date: 'Jul 17, 2026', time: '8:00 PM WAT',
  location: 'Online', type: 'Race Night', description: 'Seed', img: 'media/placeholder.png',
  status: 'upcoming', submittedBy: 'SRN Editorial', submittedById: null, createdAt: new Date().toISOString() }]);
write('news', [{ slug: 'seeded-article', featured: false, tag: 'Championship', date: '2026-07-10',
  title: 'Seeded Article', excerpt: 'Seed', body: ['Seed paragraph.'], img: 'media/placeholder.png',
  readTime: '1 min read', author: 'SRN Editorial', createdBy: 'SRN Editorial', createdAt: new Date().toISOString() }]);

write('games', [{ id: 'iracing', name: 'iRacing', shortName: 'iRacing', genre: 'GT & Endurance',
  img: 'media/placeholder.png', description: 'Seeded game.' }]);
write('members', [{ id: 'mem_1', name: 'Seeded Driver', rank: 'P1', city: 'Lagos', sim: 'ACC',
  avatar: 'media/placeholder.png', joined: '2025' }]);
write('merch', [{ id: 'cap', name: 'SRN Cap', category: 'Apparel', price: 12000,
  img: 'media/placeholder.png', description: 'Seeded merch.' }]);
write('rigs', [{ id: 'rig_seed', name: 'Seeded Rig', owner: 'Seed Owner', ownerId: null, city: 'Abuja',
  img: 'media/placeholder.png', specs: [{ label: 'Wheel', value: 'G923' }], status: 'approved',
  createdAt: new Date().toISOString() }]);
write('messages', []);
write('newsletter', []);
write('friends', []);
write('notifications', []);

// ---- boot the server -------------------------------------------------------
const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SRN_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

// Wait for THIS process's banner. Polling fetch() instead would silently succeed
// against an orphaned server from a previous run, which caused false failures.
const waitForServer = () => new Promise((res, rej) => {
  const banner = `SRN-NG server on http://0.0.0.0:${PORT}`;
  const timer = setTimeout(() => rej(new Error(`server did not start.\n${serverLog}`)), 10000);
  const poll = () => {
    if (serverLog.includes('EADDRINUSE')) {
      clearTimeout(timer);
      rej(new Error(`port ${PORT} is already in use; a stale server may be running.\n${serverLog}`));
      return;
    }
    if (serverLog.includes(banner)) { clearTimeout(timer); res(); return; }
    setTimeout(poll, 50);
  };
  poll();
});

// ---- tiny assertion + cookie-jar helpers -----------------------------------
let pass = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
}

function jar() { return { cookie: '' }; }
async function call(j, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (j.cookie) headers.Cookie = j.cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) j.cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, data, res };
}

// ---- the tests -------------------------------------------------------------
try {
  await waitForServer();
  console.log(`server up on ${BASE}\n`);

  const anon = jar();
  const user = jar();
  const vendor = jar();
  const admin = jar();

  // static + path traversal
  const home = await fetch(`${BASE}/`);
  check('GET / serves the site', home.status === 200 && (await home.text()).includes('SIM RACING'));
  const traversal = await fetch(`${BASE}/data/users.json`);
  check('GET /data/users.json blocked', traversal.status === 403, `got ${traversal.status}`);
  const traversal2 = await fetch(`${BASE}/../data/users.json`);
  check('GET /../data/users.json blocked', traversal2.status === 403, `got ${traversal2.status}`);
  const serverSrc = await fetch(`${BASE}/server/api.js`);
  check('GET /server/api.js blocked', serverSrc.status === 403, `got ${serverSrc.status}`);
  const missing = await fetch(`${BASE}/nope.html`);
  check('unknown page falls back to 404.html', missing.status === 404);
  const pretty = await fetch(`${BASE}/gallery`);
  check('extensionless /gallery serves gallery.html', pretty.status === 200 && (await pretty.text()).includes('SIM RACING'));

  // auth: unauthenticated
  check('GET /api/auth/me when signed out is 401', (await call(anon, 'GET', '/api/auth/me')).status === 401);

  // signup: default role is user
  const s1 = await call(user, 'POST', '/api/auth/signup', { username: 'driver_one', email: 'driver@srn.ng', password: 'Password!1', vendor: false });
  check('signup creates account', s1.status === 201, JSON.stringify(s1.data));
  check('signup default role is "user"', s1.data?.user?.role === 'user', `got ${s1.data?.user?.role}`);
  check('signup sets a session cookie', user.cookie.startsWith('srn_session='), user.cookie);
  check('signup response never leaks the password hash', !JSON.stringify(s1.data).includes('hash') && !JSON.stringify(s1.data).includes('salt'));

  // signup: vendor toggle -> salesperson
  const s2 = await call(vendor, 'POST', '/api/auth/signup', { username: 'wheel_shop', email: 'shop@srn.ng', password: 'Password!1', vendor: true });
  check('vendor toggle assigns "salesperson"', s2.data?.user?.role === 'salesperson', `got ${s2.data?.user?.role}`);
  check('vendor flag persisted', s2.data?.user?.vendor === true);

  // signup can never mint an admin
  const s3 = await call(jar(), 'POST', '/api/auth/signup', { username: 'sneaky', email: 'sneaky@srn.ng', password: 'Password!1', role: 'admin', vendor: false });
  check('signup ignores a role field in the body', s3.data?.user?.role === 'user', `got ${s3.data?.user?.role}`);

  // signup validation
  check('duplicate username rejected 409', (await call(jar(), 'POST', '/api/auth/signup', { username: 'driver_one', email: 'other@srn.ng', password: 'Password!1' })).status === 409);
  check('duplicate email rejected 409', (await call(jar(), 'POST', '/api/auth/signup', { username: 'other_name', email: 'driver@srn.ng', password: 'Password!1' })).status === 409);
  check('invalid email rejected 400', (await call(jar(), 'POST', '/api/auth/signup', { username: 'bademail', email: 'not-an-email', password: 'Password!1' })).status === 400);
  check('short password rejected 400', (await call(jar(), 'POST', '/api/auth/signup', { username: 'shortpw', email: 'short@srn.ng', password: 'abc' })).status === 400);
  check('bad username rejected 400', (await call(jar(), 'POST', '/api/auth/signup', { username: 'x', email: 'x@srn.ng', password: 'Password!1' })).status === 400);

  // login
  check('login with wrong password is 401', (await call(jar(), 'POST', '/api/auth/login', { email: 'driver@srn.ng', password: 'wrong' })).status === 401);
  check('unknown email is 401', (await call(jar(), 'POST', '/api/auth/login', { email: 'nobody@srn.ng', password: 'Password!1' })).status === 401);
  const goodLogin = await call(jar(), 'POST', '/api/auth/login', { email: 'driver@srn.ng', password: 'Password!1' });
  check('login with correct password is 200', goodLogin.status === 200, JSON.stringify(goodLogin.data));
  check('session survives /api/auth/me', (await call(user, 'GET', '/api/auth/me')).data?.user?.username === 'driver_one');

  // events
  const pubEvents = await call(anon, 'GET', '/api/events');
  check('public events list returns approved events', pubEvents.data?.events?.length === 1, `got ${pubEvents.data?.events?.length}`);
  const anonPost = await call(anon, 'POST', '/api/events', { title: 'Nope' });
  check('anonymous cannot submit an event', anonPost.status === 401);
  const userEvent = await call(user, 'POST', '/api/events', { title: 'Lagos Time Attack', date: 'Aug 30, 2026', time: '7:00 PM WAT', location: 'Lagos', type: 'Race Night', description: 'Community time attack.' });
  check('signed-in user can submit an event', userEvent.status === 201, JSON.stringify(userEvent.data));
  check('user submission is pending, not auto-published', userEvent.data?.event?.status === 'pending', `got ${userEvent.data?.event?.status}`);
  check('user submission records who submitted it', userEvent.data?.event?.submittedBy === 'driver_one');
  check('incomplete event rejected 400', (await call(user, 'POST', '/api/events', { title: 'Only a title' })).status === 400);
  const afterPending = await call(anon, 'GET', '/api/events');
  check('pending event hidden from the public list', afterPending.data?.events?.length === 1, `got ${afterPending.data?.events?.length}`);
  check('non-admin cannot read scope=all', (await call(user, 'GET', '/api/events?scope=all')).data?.events?.length === 1);

  // news: admin only
  const userNews = await call(user, 'POST', '/api/news', { title: 'Hacked', tag: 'News', excerpt: 'x', body: 'x' });
  check('non-admin cannot publish news', userNews.status === 403, `got ${userNews.status}`);
  check('salesperson cannot publish news', (await call(vendor, 'POST', '/api/news', { title: 'Hacked', tag: 'News', excerpt: 'x', body: 'x' })).status === 403);
  check('non-admin cannot list users', (await call(user, 'GET', '/api/users')).status === 403);
  check('non-admin cannot change roles', (await call(user, 'PATCH', '/api/users/anything/role', { role: 'admin' })).status === 403);

  // admin
  const adminLogin = await call(admin, 'POST', '/api/auth/login', { email: 'root@srn.ng', password: ADMIN_PASSWORD });
  check('admin can log in', adminLogin.status === 200 && adminLogin.data?.user?.role === 'admin');
  const list = await call(admin, 'GET', '/api/users');
  check('admin can list users', list.status === 200 && list.data.users.length === 4, `got ${list.data?.users?.length}`);
  check('user list contains no password material', !JSON.stringify(list.data).includes('"hash"') && !JSON.stringify(list.data).includes('"salt"'));

  const target = list.data.users.find((u) => u.username === 'driver_one');
  const rootId = list.data.users.find((u) => u.username === 'rootadmin').id;

  // Last-admin guard, tested while rootadmin is genuinely the only admin.
  check('cannot demote the last admin (409)', (await call(admin, 'PATCH', `/api/users/${rootId}/role`, { role: 'user' })).status === 409);

  const promote = await call(admin, 'PATCH', `/api/users/${target.id}/role`, { role: 'salesperson' });
  check('admin can promote a user to salesperson', promote.data?.user?.role === 'salesperson', JSON.stringify(promote.data));
  const promoteAdmin = await call(admin, 'PATCH', `/api/users/${target.id}/role`, { role: 'admin' });
  check('admin can promote a user to admin', promoteAdmin.data?.user?.role === 'admin');
  check('invalid role rejected 400', (await call(admin, 'PATCH', `/api/users/${target.id}/role`, { role: 'superuser' })).status === 400);

  // With a second admin in place, demoting rootadmin is allowed.
  const demoteRoot = await call(admin, 'PATCH', `/api/users/${rootId}/role`, { role: 'user' });
  check('demoting an admin while another admin exists is allowed', demoteRoot.status === 200, JSON.stringify(demoteRoot.data));
  check('demoted admin loses access immediately', (await call(admin, 'GET', '/api/users')).status === 403);

  // Reuse the same jar: logging in as the remaining admin replaces its session cookie.
  const switchAdmin = await call(admin, 'POST', '/api/auth/login', { email: 'driver@srn.ng', password: 'Password!1' });
  check('promoted user can sign in as admin', switchAdmin.data?.user?.role === 'admin', JSON.stringify(switchAdmin.data));
  const nowAdmins = (await call(admin, 'GET', '/api/users')).data.users.filter((u) => u.role === 'admin');
  check('exactly one admin remains', nowAdmins.length === 1, `got ${nowAdmins.length}`);
  check('sole admin cannot demote itself', (await call(admin, 'PATCH', `/api/users/${target.id}/role`, { role: 'user' })).status === 409);
  // Roles are read from the datastore per request, so a promotion takes effect on a session
  // that is already signed in. Assert it rather than discovering it by accident later.
  check('promotion applies to an already-signed-in session', (await call(user, 'GET', '/api/auth/me')).data?.user?.role === 'admin');

  // admin moderation + publishing
  const allEvents = await call(admin, 'GET', '/api/events?scope=all');
  check('admin sees pending events with scope=all', allEvents.data.events.length === 2, `got ${allEvents.data.events.length}`);
  const pending = allEvents.data.events.find((e) => e.status === 'pending');
  const approve = await call(admin, 'PATCH', `/api/events/${pending.id}/status`, { status: 'upcoming' });
  check('admin can approve an event', approve.data?.event?.status === 'upcoming');
  check('approved event now public', (await call(anon, 'GET', '/api/events')).data.events.length === 2);
  check('invalid event status rejected 400', (await call(admin, 'PATCH', `/api/events/${pending.id}/status`, { status: 'banana' })).status === 400);

  const published = await call(admin, 'POST', '/api/news', { title: 'SRN Announces Season Opener', tag: 'Championship', excerpt: 'The season starts here.', body: 'First paragraph.\n\nSecond paragraph.' });
  check('admin can publish news', published.status === 201, JSON.stringify(published.data));
  check('news slug generated from title', published.data?.article?.slug === 'srn-announces-season-opener', `got ${published.data?.article?.slug}`);
  check('news body split into paragraphs', published.data?.article?.body?.length === 2, `got ${published.data?.article?.body?.length}`);
  check('news author defaults to the acting admin username', published.data?.article?.author === 'driver_one', `got ${published.data?.article?.author}`);
  check('readTime computed', /min read/.test(published.data?.article?.readTime || ''));
  check('admin news appears publicly', (await call(anon, 'GET', '/api/news')).data.articles.length === 2);
  const dupe = await call(admin, 'POST', '/api/news', { title: 'SRN Announces Season Opener', tag: 'Championship', excerpt: 'x', body: 'y' });
  check('duplicate title gets a unique slug', dupe.data?.article?.slug === 'srn-announces-season-opener-2', `got ${dupe.data?.article?.slug}`);
  check('news missing fields rejected 400', (await call(admin, 'POST', '/api/news', { title: 'Only title' })).status === 400);
  check('admin can delete an article', (await call(admin, 'DELETE', `/api/news/${dupe.data.article.slug}`)).status === 200);
  // seeded(1) + published(1) + dupe(1) = 3, minus the deleted dupe = 2
  const afterDelete = await call(anon, 'GET', '/api/news');
  check('deleted article is gone (3 -> 2 remain)', afterDelete.data.articles.length === 2, `got ${afterDelete.data.articles.length}`);
  // NB: the 'user' jar was promoted to admin earlier, so it is no longer a non-admin.
  check('salesperson cannot delete an article', (await call(vendor, 'DELETE', '/api/news/seeded-article')).status === 403);
  check('article a non-admin tried to delete is still there',
    (await call(anon, 'GET', '/api/news')).data.articles.some((a) => a.slug === 'seeded-article'));

  // admin-submitted events publish immediately
  const adminEvent = await call(admin, 'POST', '/api/events', { title: 'Admin Meetup', date: 'Sep 5, 2026', time: '2:00 PM WAT', location: 'Abuja', type: 'Meetup', description: 'Admin posted.' });
  check('admin event publishes immediately', adminEvent.data?.event?.status === 'upcoming', `got ${adminEvent.data?.event?.status}`);

  // logout
  const out = await call(user, 'POST', '/api/auth/logout');
  check('logout returns 200', out.status === 200);
  check('session dead after logout', (await call(user, 'GET', '/api/auth/me')).status === 401);

  // ---- public read-only collections --------------------------------------
  check('GET /api/games', (await call(anon, 'GET', '/api/games')).data?.games?.length === 1);
  check('GET /api/members includes the seeded profile',
    (await call(anon, 'GET', '/api/members')).data?.members?.some((m) => m.id === 'mem_1'));
  check('GET /api/members/:id', (await call(anon, 'GET', '/api/members/mem_1')).data?.member?.name === 'Seeded Driver');
  check('GET /api/members/:id unknown is 404', (await call(anon, 'GET', '/api/members/nope')).status === 404);
  check('GET /api/merch', (await call(anon, 'GET', '/api/merch')).data?.merch?.length === 1);
  check('GET /api/rigs hides pending', (await call(anon, 'GET', '/api/rigs')).data?.rigs?.length === 1);

  // ---- newsletter ---------------------------------------------------------
  check('newsletter subscribe 201', (await call(anon, 'POST', '/api/newsletter', { email: 'fan@srn.ng' })).status === 201);
  check('duplicate subscribe 409', (await call(anon, 'POST', '/api/newsletter', { email: 'fan@srn.ng' })).status === 409);
  check('invalid subscribe email 400', (await call(anon, 'POST', '/api/newsletter', { email: 'nope' })).status === 400);
  check('newsletter email is lowercased and stored',
    (await call(admin, 'GET', '/api/inbox')).data?.subscribers?.some((x) => x.email === 'fan@srn.ng'));

  // ---- contact messages ---------------------------------------------------
  check('message missing fields 400', (await call(anon, 'POST', '/api/messages', { name: 'x' })).status === 400);
  check('message invalid email 400', (await call(anon, 'POST', '/api/messages', { name: 'A', email: 'bad', message: 'hi' })).status === 400);
  const msg = await call(anon, 'POST', '/api/messages', { name: 'Tunde', email: 'tunde@srn.ng', message: 'How do I join a race night?' });
  check('message accepted 201', msg.status === 201, JSON.stringify(msg.data));
  check('non-admin cannot read the inbox', (await call(vendor, 'GET', '/api/inbox')).status === 403);
  const inbox = await call(admin, 'GET', '/api/inbox');
  check('admin inbox lists the message', inbox.data?.messages?.length === 1);
  check('inbox stats are computed', inbox.data?.stats?.messages === 1 && inbox.data?.stats?.unread === 1
    && inbox.data?.stats?.subscribers === 1 && inbox.data?.stats?.members === 4, JSON.stringify(inbox.data?.stats));
  check('message response carries the created id', typeof msg.data?.id === 'string' && msg.data.id.startsWith('msg_'), JSON.stringify(msg.data));
  check('mark message read', (await call(admin, 'PATCH', `/api/messages/${msg.data.id}/read`)).status === 200);
  check('unread drops to zero', (await call(admin, 'GET', '/api/inbox')).data.stats.unread === 0);
  check('marking an unknown message 404', (await call(admin, 'PATCH', '/api/messages/nope/read')).status === 404);

  // ---- comments: the pit wall ---------------------------------------------
  // The logout block above cleared the user jar, so sign driver_one back in first.
  check('re-login for the comment section is 200',
    (await call(user, 'POST', '/api/auth/login', { email: 'driver@srn.ng', password: 'Password!1' })).status === 200);
  check('comments on an article start empty',
    (await call(anon, 'GET', '/api/news/seeded-article/comments')).data?.comments?.length === 0);
  check('anonymous cannot post a comment', (await call(anon, 'POST', '/api/news/seeded-article/comments', { text: 'hi' })).status === 401);
  check('comment on an unknown article is 404',
    (await call(user, 'POST', '/api/news/nope/comments', { text: 'hi' })).status === 404);
  const c1 = await call(user, 'POST', '/api/news/seeded-article/comments', { text: 'Great race report. See you at the next meet!' });
  check('signed-in driver posts a comment 201', c1.status === 201 && c1.data?.comment?.username === 'driver_one', JSON.stringify(c1.data));
  check('whitespace-only comment is 400', (await call(user, 'POST', '/api/news/seeded-article/comments', { text: '   ' })).status === 400);
  const longComment = await call(user, 'POST', '/api/news/seeded-article/comments', { text: 'v'.repeat(2000) });
  check('oversized comment is capped at 600 chars', longComment.status === 201 && longComment.data?.comment?.text.length === 600);
  const listed = await call(anon, 'GET', '/api/news/seeded-article/comments');
  check('comments are publicly listed with the author name', listed.data?.comments?.length === 2 &&
    listed.data.comments.some((c) => c.text === 'Great race report. See you at the next meet!'));
  check('comment list never leaks password material', !JSON.stringify(listed.data).includes('hash') && !JSON.stringify(listed.data).includes('salt'));

  // ---- reactions ------------------------------------------------------------
  check('reactions on an unknown article are 404', (await call(anon, 'GET', '/api/news/nope/reactions')).status === 404);
  check('anonymous cannot react', (await call(anon, 'POST', '/api/news/seeded-article/reactions', { kind: 'fire' })).status === 401);
  check('unknown reaction kind is 400', (await call(user, 'POST', '/api/news/seeded-article/reactions', { kind: 'sparkles' })).status === 400);
  const r1 = await call(user, 'POST', '/api/news/seeded-article/reactions', { kind: 'fire' });
  check('driver reacts to an article', r1.status === 200 && r1.data?.active === true && r1.data?.counts?.fire === 1, JSON.stringify(r1.data));
  const r2 = await call(user, 'POST', '/api/news/seeded-article/reactions', { kind: 'fire' });
  check('reacting twice untoggles', r2.status === 200 && r2.data?.active === false && r2.data?.counts?.fire === 0);
  await call(user, 'POST', '/api/news/seeded-article/reactions', { kind: 'flag' });
  await call(vendor, 'POST', '/api/news/seeded-article/reactions', { kind: 'flag' });
  const rview = await call(anon, 'GET', '/api/news/seeded-article/reactions');
  check('reaction counts are public and per kind', rview.data?.counts?.flag === 2 && rview.data?.counts?.fire === 0, JSON.stringify(rview.data));
  check('anonymous reaction view has no mine list', Array.isArray(rview.data?.mine) && rview.data.mine.length === 0);
  const rmine = await call(user, 'GET', '/api/news/seeded-article/reactions');
  check('signed-in driver sees their own reactions', rmine.data?.mine?.length === 1 && rmine.data.mine[0] === 'flag');

  // ---- trending --------------------------------------------------------------
  // Seeded article carries 2 reactions from the block above; give the published
  // article one and the ranking must follow the totals.
  await call(vendor, 'POST', '/api/news/srn-announces-season-opener/reactions', { kind: 'fire' });
  const trend = await call(anon, 'GET', '/api/news/trending');
  check('trending is public', trend.status === 200 && Array.isArray(trend.data?.articles));
  check('trending ranks by reaction totals', trend.data?.articles?.[0]?.slug === 'seeded-article' &&
    trend.data?.articles?.[0]?.reactions === 2 &&
    trend.data?.articles?.some((a) => a.slug === 'srn-announces-season-opener' && a.reactions === 1),
    JSON.stringify(trend.data?.articles?.map((a) => [a.slug, a.reactions])));
  check('trending returns at most four articles', trend.data?.articles?.length <= 4);

  // ---- comment moderation ----------------------------------------------------
  check('non-admin cannot list every comment', (await call(vendor, 'GET', '/api/comments')).status === 403);
  const modList = await call(admin, 'GET', '/api/comments');
  check('admin can list recent comments', modList.status === 200 && modList.data?.comments?.length >= 2, JSON.stringify(modList.data?.comments?.length));
  const victim = modList.data.comments[0];
  check('non-admin cannot delete a comment', (await call(vendor, 'DELETE', `/api/comments/${victim.id}`)).status === 403);
  check('deleting an unknown comment is 404', (await call(admin, 'DELETE', '/api/comments/cmt_nope')).status === 404);
  check('admin deletes a comment', (await call(admin, 'DELETE', `/api/comments/${victim.id}`)).status === 200);
  const afterMod = await call(anon, 'GET', `/api/news/${victim.slug}/comments`);
  check('deleted comment is gone from the public pit wall',
    !afterMod.data?.comments?.some((c) => c.id === victim.id));

  // ---- comment notifications ------------------------------------------------
  // The published article belongs to driver_one, so a comment from the vendor
  // account must notify the admin jar, and the author's own comment must not.
  await call(vendor, 'POST', '/api/news/srn-announces-season-opener/comments', { text: 'Buzzing for this one.' });
  const authorNotes = await call(admin, 'GET', '/api/notifications');
  check('article author is notified of a new comment',
    authorNotes.data?.notifications?.some((n) => n.type === 'comment' && n.text.includes('wheel_shop') && n.href.includes('srn-announces-season-opener')),
    JSON.stringify(authorNotes.data));
  const unreadBefore = authorNotes.data?.unread ?? 0;
  await call(admin, 'POST', '/api/news/srn-announces-season-opener/comments', { text: 'My own thread, my own comment.' });
  const authorNotes2 = await call(admin, 'GET', '/api/notifications');
  check('commenting on your own article does not notify you', authorNotes2.data?.unread === unreadBefore);

  // ---- rigs ---------------------------------------------------------------
  check('anonymous cannot submit a rig', (await call(anon, 'POST', '/api/rigs', { name: 'x', owner: 'y' })).status === 401);
  const vendorJar = jar();
  await call(vendorJar, 'POST', '/api/auth/login', { email: 'shop@srn.ng', password: 'Password!1' });
  const rig = await call(vendorJar, 'POST', '/api/rigs', {
    name: 'Vendor GT Rig', owner: 'Wheel Shop', city: 'Lagos',
    specs: [{ label: 'Wheel', value: 'DD1' }, { label: 'Pedals', value: 'HP' }], notes: 'Available for sale.',
  });
  check('signed-in user can submit a rig', rig.status === 201, JSON.stringify(rig.data));
  check('rig submission is pending', rig.data?.rig?.status === 'pending', `got ${rig.data?.rig?.status}`);
  check('rig keeps the spec sheet', rig.data?.rig?.specs?.length === 2);
  check('pending rig hidden from public list', (await call(anon, 'GET', '/api/rigs')).data.rigs.length === 1);
  check('rig missing fields 400', (await call(vendorJar, 'POST', '/api/rigs', { name: 'only a name' })).status === 400);
  check('non-admin cannot approve a rig', (await call(vendorJar, 'PATCH', `/api/rigs/${rig.data.rig.id}/status`, { status: 'approved' })).status === 403);
  check('admin approves the rig', (await call(admin, 'PATCH', `/api/rigs/${rig.data.rig.id}/status`, { status: 'approved' })).data?.rig?.status === 'approved');
  check('approved rig is now public', (await call(anon, 'GET', '/api/rigs')).data.rigs.length === 2);
  check('invalid rig status 400', (await call(admin, 'PATCH', `/api/rigs/${rig.data.rig.id}/status`, { status: 'banana' })).status === 400);

  // ---- RSVP ---------------------------------------------------------------
  check('anonymous cannot RSVP', (await call(anon, 'POST', '/api/events/evt_seed/rsvp')).status === 401);
  const rsvp1 = await call(vendorJar, 'POST', '/api/events/evt_seed/rsvp');
  check('RSVP joins', rsvp1.data?.attending === true && rsvp1.data?.count === 1, JSON.stringify(rsvp1.data));
  const rsvp2 = await call(vendorJar, 'POST', '/api/events/evt_seed/rsvp');
  check('RSVP again leaves (toggle)', rsvp2.data?.attending === false && rsvp2.data?.count === 0);
  check('RSVP on unknown event 404', (await call(vendorJar, 'POST', '/api/events/nope/rsvp')).status === 404);

  // ---- driver profiles ----------------------------------------------------
  const allMembers = (await call(anon, 'GET', '/api/members')).data.members;
  check('signup auto-created a linked driver profile',
    allMembers.some((m) => m.userId && m.name === 'wheel_shop'),
    JSON.stringify(allMembers.map((m) => m.name)));
  const vendorProfile = allMembers.find((m) => m.name === 'wheel_shop');
  check('anonymous cannot edit a profile', (await call(anon, 'PATCH', '/api/members/me', { city: 'X' })).status === 401);
  const edited = await call(vendor, 'PATCH', '/api/members/me', { city: 'Lagos', sim: 'ACC', bio: 'Sells wheels.' });
  check('signed-in user can edit their own profile',
    edited.data?.member?.city === 'Lagos' && edited.data?.member?.sim === 'ACC', JSON.stringify(edited.data));
  check('profile edit targets the caller only', edited.data?.member?.userId === vendorProfile.userId);
  const socials = await call(vendor, 'PATCH', '/api/members/me', {
    socials: { x: '@wheels', instagram: 'https://instagram.com/wheels' },
    gamesPlayed: ['iracing'],
  });
  check('profile stores socials and games played',
    socials.data?.member?.socials?.x === '@wheels' && socials.data?.member?.gamesPlayed?.[0] === 'iracing',
    JSON.stringify(socials.data?.member));
  check('javascript social URLs are dropped',
    (await call(vendor, 'PATCH', '/api/members/me', { socials: { x: 'javascript:alert(1)' } })).data?.member?.socials?.x !== 'javascript:alert(1)');
  check('friend request to a profile without an account is 404',
    (await call(vendor, 'POST', '/api/friends', { memberId: 'mem_1' })).status === 404);
  check('anonymous cannot list friends', (await call(anon, 'GET', '/api/friends')).status === 401);
  check('anonymous cannot list notifications', (await call(anon, 'GET', '/api/notifications')).status === 401);

  // ---- merch listings (salesperson power) ----------------------------------
  check('anonymous cannot list merch', (await call(anon, 'POST', '/api/merch', { name: 'x', category: 'y', price: 1 })).status === 401);
  // NB: the 'user' jar was promoted to admin earlier, so it is not a plain user here.
  const plainJar = jar();
  const plain = await call(plainJar, 'POST', '/api/auth/signup', { username: 'plain_racer', email: 'plain@srn.ng', password: 'Password!1', vendor: false });
  check('control account is a plain user', plain.data?.user?.role === 'user', `got ${plain.data?.user?.role}`);
  const plainMember = (await call(anon, 'GET', '/api/members')).data.members.find((m) => m.userId === plain.data.user.id);
  const asked = await call(vendor, 'POST', '/api/friends', { memberId: plainMember.id });
  check('friend request is created', asked.status === 201, JSON.stringify(asked.data));
  const notes = await call(plainJar, 'GET', '/api/notifications');
  check('friend request creates a notification', notes.data?.unread >= 1, JSON.stringify(notes.data));
  const accepted = await call(plainJar, 'POST', `/api/friends/${asked.data.friend.id}/accept`);
  check('friend request can be accepted', accepted.status === 200 && accepted.data?.friend?.status === 'accepted');
  check('both sides see the friendship',
    (await call(vendor, 'GET', '/api/friends')).data.friends.length === 1);
  check('a plain user cannot list merch', (await call(plainJar, 'POST', '/api/merch', { name: 'x', category: 'y', price: 1 })).status === 403);
  const listing = await call(vendor, 'POST', '/api/merch', { name: 'DD1 Wheelbase', category: 'Wheels', price: 850000, description: 'Used once.' });
  check('salesperson can list merch', listing.status === 201, JSON.stringify(listing.data));
  check('listing is pending approval', listing.data?.item?.status === 'pending', `got ${listing.data?.item?.status}`);
  check('pending listing hidden from the shop',
    !(await call(anon, 'GET', '/api/merch')).data.merch.some((m) => m.name === 'DD1 Wheelbase'));
  check('negative price rejected 400', (await call(vendor, 'POST', '/api/merch', { name: 'x', category: 'y', price: -5 })).status === 400);
  check('non-numeric price rejected 400', (await call(vendor, 'POST', '/api/merch', { name: 'x', category: 'y', price: 'free' })).status === 400);
  check('non-admin cannot approve a listing',
    (await call(vendor, 'PATCH', `/api/merch/${listing.data.item.id}/status`, { status: 'approved' })).status === 403);
  check('admin approves the listing',
    (await call(admin, 'PATCH', `/api/merch/${listing.data.item.id}/status`, { status: 'approved' })).data?.item?.status === 'approved');
  check('approved listing appears in the shop',
    (await call(anon, 'GET', '/api/merch')).data.merch.some((m) => m.name === 'DD1 Wheelbase'));

  // ---- orders --------------------------------------------------------------
  check('anonymous cannot order', (await call(anon, 'POST', '/api/orders', { items: [{ id: 'cap', qty: 1 }] })).status === 401);
  check('empty cart rejected 400', (await call(vendor, 'POST', '/api/orders', { items: [] })).status === 400);
  check('unknown item rejected 400', (await call(vendor, 'POST', '/api/orders', { items: [{ id: 'nope', qty: 1 }] })).status === 400);
  check('bad quantity rejected 400', (await call(vendor, 'POST', '/api/orders', { items: [{ id: 'cap', qty: 0 }] })).status === 400);

  // The client sends a fake price; the server must price from the catalogue instead.
  const order = await call(vendor, 'POST', '/api/orders', { items: [{ id: 'cap', qty: 2, price: 1 }] });
  check('order accepted', order.status === 201, JSON.stringify(order.data));
  check('order total is priced server-side, not from the request',
    order.data?.order?.total === 24000, `got ${order.data?.order?.total}, expected 2 x 12000`);
  check('order line items carry the catalogue price', order.data?.order?.items?.[0]?.price === 12000);
  check('order starts as new', order.data?.order?.status === 'new');
  check('buyer sees their own order', (await call(vendor, 'GET', '/api/orders')).data?.orders?.length === 1);
  check('buyer cannot list every order', (await call(vendor, 'GET', '/api/orders?scope=all')).data.orders.length === 1);
  check('admin sees all orders', (await call(admin, 'GET', '/api/orders?scope=all')).data.orders.length === 1);
  check('non-admin cannot change order status',
    (await call(vendor, 'PATCH', `/api/orders/${order.data.order.id}/status`, { status: 'fulfilled' })).status === 403);
  check('admin fulfils the order',
    (await call(admin, 'PATCH', `/api/orders/${order.data.order.id}/status`, { status: 'fulfilled' })).data?.order?.status === 'fulfilled');
  check('invalid order status 400',
    (await call(admin, 'PATCH', `/api/orders/${order.data.order.id}/status`, { status: 'shipped' })).status === 400);

  // ---- rig photo attachment ------------------------------------------------
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const withPhoto = await call(vendor, 'POST', '/api/rigs', {
    name: 'Photo Rig', owner: 'Wheel Shop',
    photo: `data:image/png;base64,${PNG_1PX}`,
  });
  check('rig with a photo is accepted', withPhoto.status === 201, JSON.stringify(withPhoto.data));
  check('photo is stored and referenced by path',
    /^media\/uploads\/up-[\w-]+\.png$/.test(withPhoto.data?.rig?.img || ''),
    `img=${withPhoto.data?.rig?.img}`);
  check('a bad data URL is rejected 400',
    (await call(vendor, 'POST', '/api/rigs', { name: 'x', owner: 'y', photo: 'data:text/plain;base64,aGk=' })).status === 400);
  check('a non-image data URL is rejected 400',
    (await call(vendor, 'POST', '/api/rigs', { name: 'x', owner: 'y', photo: 'not a data url' })).status === 400);
  const tooBig = 'A'.repeat(3 * 1024 * 1024);
  const big = await call(vendor, 'POST', '/api/rigs', { name: 'x', owner: 'y', photo: `data:image/png;base64,${tooBig}` });
  check('an oversized photo is rejected', big.status === 400 || big.status === 413, `got ${big.status}`);

  // ---- supported games: admin-managed -------------------------------------
  check('a plain user cannot add a supported game',
    (await call(plainJar, 'POST', '/api/games', { name: 'Rogue Title' })).status === 403);
  check('anonymous cannot add a supported game',
    (await call(anon, 'POST', '/api/games', { name: 'Rogue Title' })).status === 401);
  check('game without a name is rejected 400',
    (await call(admin, 'POST', '/api/games', { genre: 'GT' })).status === 400);
  const newGame = await call(admin, 'POST', '/api/games', { name: 'Le Mans Ultimate', shortName: 'LMU', genre: 'Endurance' });
  check('admin can add a supported game', newGame.status === 201, JSON.stringify(newGame.data));
  check('new game gets an id and defaults', newGame.data?.game?.id?.startsWith('game_')
    && newGame.data?.game?.genre === 'Endurance');
  check('shortName falls back to the full name',
    (await call(admin, 'POST', '/api/games', { name: 'BeamNG' })).data?.game?.shortName === 'BeamNG');
  check('duplicate game name is rejected 409',
    (await call(admin, 'POST', '/api/games', { name: 'le mans ultimate' })).status === 409);
  check('new game is publicly listed',
    (await call(anon, 'GET', '/api/games')).data.games.some((g) => g.id === newGame.data.game.id));

  // ---- interests -----------------------------------------------------------
  check('signup starts with no interests', plain.data?.user?.interests?.length === 0,
    JSON.stringify(plain.data?.user?.interests));
  check('anonymous cannot set interests',
    (await call(anon, 'PATCH', '/api/auth/interests', { interests: [newGame.data.game.id] })).status === 401);
  check('unknown game id is rejected 400',
    (await call(plainJar, 'PATCH', '/api/auth/interests', { interests: ['game_nope'] })).status === 400);
  check('too many interests is rejected 400',
    (await call(plainJar, 'PATCH', '/api/auth/interests', { interests: Array.from({ length: 21 }, (_, i) => `game_${i}`) })).status === 400);
  const saved = await call(plainJar, 'PATCH', '/api/auth/interests', { interests: [newGame.data.game.id, newGame.data.game.id] });
  check('interests are saved', saved.data?.interests?.length === 1, JSON.stringify(saved.data));
  check('duplicate interests are de-duplicated', saved.data?.interests?.length === 1);
  check('interests come back on /api/auth/me',
    (await call(plainJar, 'GET', '/api/auth/me')).data.user.interests.length === 1);

  // ---- event topics ---------------------------------------------------------
  const generalEvent = await call(plainJar, 'POST', '/api/events', {
    title: 'General Meet', date: '2026-11-01', time: '18:00', location: 'Lagos',
    type: 'Meetup', description: 'No specific game.',
  });
  check('event with no topic defaults to general', generalEvent.data?.event?.game === 'general',
    `got ${generalEvent.data?.event?.game}`);
  const topicEvent = await call(plainJar, 'POST', '/api/events', {
    title: 'LMU Endurance', date: '2026-11-02', time: '19:00', location: 'Online',
    type: 'Race Night', description: 'LMU only.', game: newGame.data.game.id,
  });
  check('event can be posted to a specific topic', topicEvent.data?.event?.game === newGame.data.game.id);
  const badTopic = await call(plainJar, 'POST', '/api/events', {
    title: 'Bad Topic', date: '2026-11-03', time: '20:00', location: 'Online',
    type: 'Meetup', description: 'Unknown game.', game: 'game_does_not_exist',
  });
  check('an unknown topic falls back to general rather than failing',
    badTopic.data?.event?.game === 'general', `got ${badTopic.data?.event?.game}`);

  // ---- removing a supported game ---------------------------------------------
  check('a plain user cannot remove a supported game',
    (await call(plainJar, 'DELETE', `/api/games/${newGame.data.game.id}`)).status === 403);
  check('removing an unknown game is 404', (await call(admin, 'DELETE', '/api/games/game_nope')).status === 404);
  check('admin can remove a supported game',
    (await call(admin, 'DELETE', `/api/games/${newGame.data.game.id}`)).status === 200);
  check('removed game is no longer listed',
    !(await call(anon, 'GET', '/api/games')).data.games.some((g) => g.id === newGame.data.game.id));

  // ---- rate limiting (last: it exhausts a bucket shared with the tests above) --
  let loginBlockedAt = null;
  for (let i = 0; i < 25; i++) {
    const r = await call(jar(), 'POST', '/api/auth/login', { email: 'nobody@srn.ng', password: 'wrong' });
    if (r.status === 429) { loginBlockedAt = i + 1; break; }
  }
  check('login is rate limited', loginBlockedAt !== null && loginBlockedAt <= 15,
    loginBlockedAt ? `blocked on attempt ${loginBlockedAt}` : 'never blocked in 25 attempts');

  let signupBlockedAt = null;
  for (let i = 0; i < 25; i++) {
    const r = await call(jar(), 'POST', '/api/auth/signup', { username: `spam_${i}`, email: `spam${i}@srn.ng`, password: 'Password!1' });
    if (r.status === 429) { signupBlockedAt = i + 1; break; }
  }
  check('signup is rate limited', signupBlockedAt !== null && signupBlockedAt <= 15,
    signupBlockedAt ? `blocked on attempt ${signupBlockedAt}` : 'never blocked in 25 attempts');

  // unknown route
  check('unknown API route is 404 JSON', (await call(anon, 'GET', '/api/nope')).status === 404);
  // Uses /api/messages, not /api/auth/signup: the auth endpoints are rate limited and
  // the burst above has already exhausted that bucket. Rate limiting runs before body
  // parsing, which is deliberate, so signup would answer 429 here.
  check('malformed JSON body is 400', (await (async () => {
    const res = await fetch(`${BASE}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    return { status: res.status };
  })()).status === 400);

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} of ${pass + failures.length} checks FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${pass} checks passed.`);
  }
} catch (err) {
  console.error('smoke test crashed:', err);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(uploadDir, { recursive: true, force: true });
}
