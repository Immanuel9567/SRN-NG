// Real DOM render check: boots the server, loads the pages in jsdom, executes their
// scripts against the live API, and asserts on what actually got rendered.
//
//   npm run test:render
//
// The API smoke test proves the endpoints work. This proves the pages use them.

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
const dataDir = mkdtempSync(join(tmpdir(), 'srn-render-'));
process.env.SRN_DATA_DIR = dataDir;

const { JSDOM, VirtualConsole } = await import('jsdom');
const { hashPassword, newId } = await import('../server/auth.js');
const { write } = await import('../server/store.js');

const ADMIN_PASSWORD = 'RenderTest!123';
write('users', [{
  id: newId('usr'), username: 'rootadmin', email: 'root@srn.ng', role: 'admin', vendor: false,
  ...hashPassword(ADMIN_PASSWORD), createdAt: new Date().toISOString(),
}]);
write('events', [{
  id: 'evt_render', title: 'Render Check Race Night', date: '2026-09-01', time: '20:00',
  location: 'Online', type: 'Race Night', description: 'Seeded for the render check.',
  img: 'media/placeholder.png', status: 'upcoming', submittedBy: 'SRN Editorial',
  submittedById: null, createdAt: new Date().toISOString(),
}]);
write('news', [{
  slug: 'render-check-article', featured: false, tag: 'Championship', date: '2026-09-01',
  title: 'Render Check Article', excerpt: 'Seeded excerpt.',
  body: ['First seeded paragraph.', 'Second seeded paragraph.'],
  img: 'media/placeholder.png', readTime: '1 min read', author: 'SRN Editorial',
  createdBy: 'SRN Editorial', createdAt: new Date().toISOString(),
}]);

write('games', [{ id: 'iracing', name: 'Render Check iRacing', shortName: 'iRacing', genre: 'GT',
  img: 'media/placeholder.png', description: 'Seeded for the render check.' }]);
write('members', [{ id: 'mem_render', name: 'Render Driver', rank: 'P1', city: 'Lagos', sim: 'ACC',
  avatar: 'media/placeholder.png', joined: '2025', bio: 'Seeded bio.',
  stats: { races: 42, wins: 7, podiums: 19 },
  activity: [{ date: 'Jul 10, 2026', text: 'Won the render check race.' }] }]);
write('merch', [{ id: 'cap', name: 'Render Cap', category: 'Apparel', price: 12000,
  img: 'media/placeholder.png', description: 'Seeded merch.' }]);
write('rigs', [{ id: 'rig_render', name: 'Render Rig', owner: 'Render Owner', ownerId: null,
  city: 'Abuja', img: 'media/placeholder.png', specs: [{ label: 'Wheel', value: 'DD1' }],
  status: 'approved', createdAt: new Date().toISOString() }]);
write('messages', []);
write('newsletter', []);

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
    if (log.includes('EADDRINUSE')) {
      clearTimeout(timer);
      rej(new Error(`port ${PORT} is already in use; a stale server may be running.\n${log}`));
      return;
    }
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

// Fixed sleeps made these checks flaky once pages started doing more fetches.
// Poll for the actual condition instead, and fail on the real observed state.
async function waitFor(predicate, label, timeout = 8000) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) { console.log(`      (timed out waiting for ${label})`); return false; }
    await sleep(50);
  }
}

// fetch with a per-page cookie jar, so sessions behave like a browser.
function makeFetch(seedCookie) {
  const jar = new Map();
  if (seedCookie) {
    const i = seedCookie.indexOf('=');
    jar.set(seedCookie.slice(0, i).trim(), seedCookie.slice(i + 1).trim());
  }
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, BASE);
    const headers = new Headers(init.headers || {});
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(url, { ...init, headers });
    for (const c of res.headers.getSetCookie?.() || []) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      const key = pair.slice(0, i).trim();
      const val = pair.slice(i + 1).trim();
      if (!val || /Max-Age=0/i.test(c)) jar.delete(key); else jar.set(key, val);
    }
    return res;
  };
}

// Sign in over plain HTTP and hand the session cookie to a page's jar.
// Reloading a jsdom page would re-run beforeParse and drop the jar, so seed it instead.
async function loginCookie(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.headers.getSetCookie()[0].split(';')[0];
}

async function loadPage(path, { cookie } = {}) {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', (e) => {
    // The sandbox has no outbound network, so the Google Fonts <link> always fails here.
    if (/fonts\.googleapis\.com/.test(e.message)) return;
    pageErrors.push(e.message);
  });
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) { window.fetch = makeFetch(cookie); },
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  await sleep(350);
  return { dom, window: dom.window, document: dom.window.document, pageErrors };
}

const fireSubmit = (window, form) => {
  form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
};

try {
  await waitForServer();
  console.log(`server up on ${BASE}\n`);

  // ---- activities.html -----------------------------------------------------
  const act = await loadPage('/activities.html');
  check('activities.html has no page errors', act.pageErrors.length === 0, act.pageErrors.join(' | '));
  const list = act.document.getElementById('activities-list');
  check('activities list rendered from the API', list.textContent.includes('Render Check Race Night'),
    JSON.stringify(list.textContent.slice(0, 120)));
  check('navbar shows SIGN IN when signed out', act.document.querySelector('[data-account-slot]').textContent.includes('SIGN IN'));

  // submitting while signed out must surface the 401, not silently succeed
  act.document.getElementById('toggle-form-btn').click();
  const actForm = act.document.getElementById('activity-form');
  act.document.getElementById('act-title').value = 'Should Fail';
  act.document.getElementById('act-date').value = '2026-10-01';
  act.document.getElementById('act-time').value = '19:00';
  act.document.getElementById('act-location').value = 'Lagos';
  act.document.getElementById('act-type').value = 'Meetup';
  act.document.getElementById('act-desc').value = 'Anonymous submission attempt.';
  fireSubmit(act.window, actForm);
  await waitFor(() => act.document.getElementById('activity-form-status').textContent.trim(), 'event error message');
  check('signed-out event submission shows an error',
    /sign in/i.test(act.document.getElementById('activity-form-status').textContent),
    JSON.stringify(act.document.getElementById('activity-form-status').textContent));

  // ---- sign up through the real form ---------------------------------------
  const acct = await loadPage('/account.html');
  check('account.html has no page errors', acct.pageErrors.length === 0, acct.pageErrors.join(' | '));
  const signup = acct.document.getElementById('signup-form');
  signup.querySelector('[name="username"]').value = 'render_driver';
  signup.querySelector('[name="email"]').value = 'render@srn.ng';
  signup.querySelector('[name="password"]').value = 'Password!1';
  acct.document.getElementById('vendor-toggle').checked = true;
  fireSubmit(acct.window, signup);
  await waitFor(() => acct.document.getElementById('signed-in-title').textContent.includes('render_driver'), 'signup panel');
  check('signup form signs the user in', acct.document.getElementById('signed-in-title').textContent.includes('render_driver'),
    JSON.stringify(acct.document.getElementById('signed-in-title').textContent));
  check('signup form shows the salesperson role', acct.document.getElementById('signed-in-role').textContent === 'SALESPERSON',
    acct.document.getElementById('signed-in-role').textContent);
  check('non-admin does not see the admin panel link',
    acct.document.getElementById('admin-link').style.display === 'none');
  acct.window.close();

  // ---- now submit an event as that signed-in user ---------------------------
  const act2 = await loadPage('/activities.html', {
    cookie: await loginCookie('render@srn.ng', 'Password!1'),
  });
  act2.document.getElementById('toggle-form-btn').click();
  const f2 = act2.document.getElementById('activity-form');
  act2.document.getElementById('act-title').value = 'Signed In Meetup';
  act2.document.getElementById('act-date').value = '2026-10-02';
  act2.document.getElementById('act-time').value = '18:00';
  act2.document.getElementById('act-location').value = 'Abuja';
  act2.document.getElementById('act-type').value = 'Meetup';
  act2.document.getElementById('act-desc').value = 'Submitted while signed in.';
  fireSubmit(act2.window, f2);
  await waitFor(() => /review|admin/i.test(act2.document.getElementById('activity-form-content').textContent), 'pending notice');
  check('signed-in submission reports it is pending review',
    /review|admin/i.test(act2.document.getElementById('activity-form-content').textContent),
    JSON.stringify(act2.document.getElementById('activity-form-content').textContent.slice(0, 120)));
  await sleep(200);
  check('pending event is not added to the public list',
    !act2.document.getElementById('activities-list').textContent.includes('Signed In Meetup'),
    act2.document.getElementById('activities-list').textContent.slice(0, 120));
  act2.window.close();

  // ---- news.html and the article page --------------------------------------
  const news = await loadPage('/news.html');
  check('news.html has no page errors', news.pageErrors.length === 0, news.pageErrors.join(' | '));
  check('news grid rendered from the API', news.document.getElementById('news-grid').textContent.includes('Render Check Article'));
  check('news tag pills built from the data',
    news.document.querySelectorAll('#news-tags button').length >= 2,
    `${news.document.querySelectorAll('#news-tags button').length} pills`);
  news.window.close();

  const article = await loadPage('/news-article.html?slug=render-check-article');
  check('news-article.html has no page errors', article.pageErrors.length === 0, article.pageErrors.join(' | '));
  check('article body paragraphs rendered',
    article.document.getElementById('article-content').textContent.includes('Second seeded paragraph.'));
  check('article sets the document title', /Render Check Article/.test(article.document.title), article.document.title);
  article.window.close();

  const missing = await loadPage('/news-article.html?slug=does-not-exist');
  check('unknown slug shows the not-found state',
    /Article Not Found/i.test(missing.document.getElementById('article-content').textContent));
  missing.window.close();

  // ---- admin.html authorization --------------------------------------------
  const anonAdmin = await loadPage('/admin.html');
  check('admin.html denies anonymous visitors', anonAdmin.document.getElementById('denied').style.display === 'block');
  check('admin body stays hidden for anonymous visitors', anonAdmin.document.getElementById('admin-body').style.display === 'none');
  anonAdmin.window.close();

  const adminPage = await loadPage('/admin.html', {
    cookie: await loginCookie('root@srn.ng', ADMIN_PASSWORD),
  });
  check('admin sees the panel after signing in', adminPage.document.getElementById('admin-body').style.display === 'flex',
    adminPage.document.getElementById('admin-body').style.display);
  check('admin sees the pending event in the queue',
    adminPage.document.getElementById('event-queue').textContent.includes('Signed In Meetup'),
    adminPage.document.getElementById('event-queue').textContent.slice(0, 100));
  check('admin sees the member list', adminPage.document.querySelectorAll('#users-rows tr').length >= 2,
    `${adminPage.document.querySelectorAll('#users-rows tr').length} rows`);

  // approve through the real button
  const approveBtn = [...adminPage.document.querySelectorAll('[data-approve]')][0];
  check('approve button rendered for the pending event', !!approveBtn);
  if (approveBtn) {
    approveBtn.click();
    await waitFor(() => /No events waiting/i.test(adminPage.document.getElementById('event-queue').textContent), 'empty queue');
    check('queue empties after approval',
      /No events waiting/i.test(adminPage.document.getElementById('event-queue').textContent),
      adminPage.document.getElementById('event-queue').textContent.slice(0, 100));
  }
  adminPage.window.close();

  // approved event is now public
  const act3 = await loadPage('/activities.html');
  check('approved event appears on the public page',
    act3.document.getElementById('activities-list').textContent.includes('Signed In Meetup'));
  act3.window.close();

  // ---- the other content pages -------------------------------------------
  const gallery = await loadPage('/gallery.html');
  check('gallery.html has no page errors', gallery.pageErrors.length === 0, gallery.pageErrors.join(' | '));
  check('game grid rendered from the API', gallery.document.getElementById('games-grid').textContent.includes('Render Check iRacing'));
  gallery.window.close();

  const members = await loadPage('/members.html');
  check('members.html has no page errors', members.pageErrors.length === 0, members.pageErrors.join(' | '));
  check('member grid rendered from the API', members.document.getElementById('members-grid').textContent.includes('Render Driver'));
  members.window.close();

  const profile = await loadPage('/member-profile.html?id=mem_render');
  check('member profile rendered from the API', profile.document.getElementById('profile-container').textContent.includes('Render Driver'));
  profile.window.close();

  const shop = await loadPage('/shop.html');
  check('shop.html has no page errors', shop.pageErrors.length === 0, shop.pageErrors.join(' | '));
  check('merch grid rendered from the API', shop.document.getElementById('shop-grid').textContent.includes('Render Cap'));
  check('price formatted in Naira', /\u20A6/.test(shop.document.getElementById('shop-grid').textContent),
    shop.document.getElementById('shop-grid').textContent.slice(0, 80));
  shop.window.close();

  const rigList = await loadPage('/sim-rigs.html');
  check('sim-rigs.html has no page errors', rigList.pageErrors.length === 0, rigList.pageErrors.join(' | '));
  check('rig list rendered from the API', rigList.document.getElementById('rigs-view').textContent.includes('Render Rig'));
  rigList.window.close();

  // ---- home page: three collections plus the newsletter form ---------------
  const home = await loadPage('/index.html');
  check('index.html has no page errors', home.pageErrors.length === 0, home.pageErrors.join(' | '));
  check('home spotlight rendered from the API', home.document.getElementById('spotlight-grid').textContent.includes('Render Driver'));
  check('home news rendered from the API', home.document.getElementById('home-news-grid').textContent.includes('Render Check Article'));
  check('home rigs rendered from the API', home.document.getElementById('home-rigs-grid').textContent.includes('Render Rig'));
  home.document.getElementById('newsletter-email').value = 'home-fan@srn.ng';
  fireSubmit(home.window, home.document.getElementById('newsletter-form'));
  await waitFor(() => home.document.getElementById('newsletter-form-container').textContent.includes("You're in"), 'newsletter confirmation');
  check('newsletter form confirms the subscription',
    home.document.getElementById('newsletter-form-container').textContent.includes("You're in"),
    home.document.getElementById('newsletter-form-container').textContent.slice(0, 80));
  home.window.close();

  // ---- contact page ---------------------------------------------------------
  const contact = await loadPage('/contact.html');
  check('contact.html has no page errors', contact.pageErrors.length === 0, contact.pageErrors.join(' | '));
  contact.document.getElementById('contact-name').value = 'Render Visitor';
  contact.document.getElementById('contact-email').value = 'visitor@srn.ng';
  contact.document.getElementById('contact-message').value = 'Sent from the render check.';
  fireSubmit(contact.window, contact.document.getElementById('contact-form'));
  await waitFor(() => /we have your message/i.test(contact.document.getElementById('contact-form-container').textContent), 'contact confirmation');
  check('contact form confirms delivery',
    /we have your message/i.test(contact.document.getElementById('contact-form-container').textContent),
    contact.document.getElementById('contact-form-container').textContent.slice(0, 100));
  contact.window.close();

  // ---- admin sees the message and the stats ---------------------------------
  const inbox = await loadPage('/admin.html', { cookie: await loginCookie('root@srn.ng', ADMIN_PASSWORD) });
  check('admin stats row populated', inbox.document.querySelectorAll('.srn-stat').length === 7,
    `${inbox.document.querySelectorAll('.srn-stat').length} tiles`);
  check('admin inbox shows the contact message',
    inbox.document.getElementById('inbox-list').textContent.includes('Render Visitor'),
    inbox.document.getElementById('inbox-list').textContent.slice(0, 100));
  check('admin inbox shows the newsletter subscriber',
    inbox.document.getElementById('stats-row').textContent.length > 0);
  inbox.window.close();

  // ---- checkout, as a signed-in buyer ---------------------------------------
  const buy = await loadPage('/shop.html', { cookie: await loginCookie('root@srn.ng', ADMIN_PASSWORD) });
  check('shop has no page errors when signed in', buy.pageErrors.length === 0, buy.pageErrors.join(' | '));
  const addBtn = buy.document.querySelectorAll('.add-cart-btn')[0];
  check('add-to-cart button rendered', !!addBtn);
  addBtn.click();
  await waitFor(() => buy.document.getElementById('cart-bar').style.display === 'block', 'cart bar visible');
  check('cart bar shows the naira total', /\u20A6/.test(buy.document.getElementById('cart-summary').textContent),
    buy.document.getElementById('cart-summary').textContent);
  buy.document.getElementById('checkout-btn').click();
  await waitFor(() => (buy.document.getElementById('srn-toasts')?.textContent || '').length > 0, 'checkout toast');
  check('checkout confirms the order',
    /Order placed/i.test(buy.document.getElementById('srn-toasts').textContent),
    buy.document.getElementById('srn-toasts').textContent.slice(0, 100));
  await waitFor(() => buy.document.getElementById('cart-bar').style.display === 'none', 'cart cleared');
  check('cart empties after checkout', buy.document.getElementById('cart-bar').style.display === 'none');
  buy.window.close();

  // ---- driver profile editor -------------------------------------------------
  const acct2 = await loadPage('/account.html', { cookie: await loginCookie('root@srn.ng', ADMIN_PASSWORD) });
  await waitFor(() => acct2.document.getElementById('member-zone').style.display === 'flex', 'member zone');
  check('signed-in account shows the driver profile editor',
    acct2.document.getElementById('member-zone').style.display === 'flex');
  acct2.document.getElementById('profile-city').value = 'Benin City';
  acct2.document.getElementById('profile-sim').value = 'ACC';
  fireSubmit(acct2.window, acct2.document.getElementById('profile-form'));
  await waitFor(() => acct2.document.getElementById('profile-status').textContent.includes('Profile saved'), 'profile saved');
  check('profile save is confirmed',
    acct2.document.getElementById('profile-status').textContent.includes('Profile saved'),
    acct2.document.getElementById('profile-status').textContent);
  check('saved profile links to its public page',
    /member-profile\.html\?id=mem_/.test(acct2.document.getElementById('profile-link').innerHTML),
    acct2.document.getElementById('profile-link').innerHTML.slice(0, 120));
  acct2.window.close();

  // ---- admin sees the order ---------------------------------------------------
  const orders = await loadPage('/admin.html', { cookie: await loginCookie('root@srn.ng', ADMIN_PASSWORD) });
  await waitFor(() => orders.document.querySelectorAll('.srn-stat').length === 7, 'seven stat tiles');
  check('admin dashboard has seven stat tiles', orders.document.querySelectorAll('.srn-stat').length === 7,
    `${orders.document.querySelectorAll('.srn-stat').length} tiles`);
  await waitFor(() => orders.document.getElementById('orders-queue').textContent.includes('Render Cap'), 'order in queue');
  check('admin sees the placed order',
    orders.document.getElementById('orders-queue').textContent.includes('Render Cap'),
    orders.document.getElementById('orders-queue').textContent.slice(0, 100));
  check('admin sees the order total in naira',
    /\u20A6/.test(orders.document.getElementById('orders-queue').textContent));
  check('listing queue renders', orders.document.getElementById('merch-queue').textContent.length > 0);
  orders.window.close();

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} of ${pass + failures.length} render checks FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${pass} render checks passed.`);
  }
} catch (err) {
  console.error('render check crashed:', err);
  console.error(log);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
