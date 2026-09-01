// Offline accounts check: serves the site as a *static* deployment (no /api at all)
// and proves the account system still works against the browser-local datastore.
//
//   npm run test:offline
//
// This is the GitHub-Pages / `dist/` case. Before the local fallback existed, signup
// on a static host failed with "Request failed (404)" and nobody could create an
// account, so this check exists to keep that from coming back.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 5900 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;

const { JSDOM, VirtualConsole } = await import('jsdom');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
};

// A dumb file server: exactly what a static host is. /api/* is not special here,
// so it 404s with an HTML body, which is how the client detects "no server".
const server = createServer((req, res) => {
  const pathname = new URL(req.url, BASE).pathname;
  const relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname))
    .replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const full = resolve(join(ROOT, relative));
  const inside = full === ROOT || full.startsWith(ROOT + sep);
  if (!inside || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>404</title>Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream' });
  createReadStream(full).pipe(res);
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, label, timeout = 8000) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) { console.log(`      (timed out waiting for ${label})`); return false; }
    await sleep(50);
  }
}

// localStorage does not survive a jsdom instance, so the "reload" cases seed the
// previous page's storage before the scripts run.
async function loadPage(path, storage = {}) {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', (e) => {
    if (/fonts\.googleapis\.com/.test(e.message)) return;
    pageErrors.push(e.message);
  });
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (window.HTMLMediaElement?.prototype) {
        window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
        window.HTMLMediaElement.prototype.pause = function () {};
      }
      window.matchMedia = window.matchMedia || ((query) => ({
        matches: false, media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      }));
      // jsdom ships no fetch. Point it at the static server, absolute URLs and all.
      window.fetch = (input, init) => fetch(new URL(typeof input === 'string' ? input : input.url, BASE), init);
      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  await sleep(300);
  return { dom, window: dom.window, document: dom.window.document, pageErrors };
}

const snapshot = (window) => {
  const out = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    out[key] = window.localStorage.getItem(key);
  }
  return out;
};

const fireSubmit = (window, form) =>
  form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));

try {
  // ---- signup with no API --------------------------------------------------
  const page = await loadPage('/account.html');
  check('account.html has no page errors without an API', page.pageErrors.length === 0, page.pageErrors.join(' | '));
  check('offline notice is shown', page.document.getElementById('offline-note').style.display === 'block');
  check('role explainer copy is gone',
    !page.document.body.textContent.includes('Cannot be self-assigned'));

  const form = page.document.getElementById('signup-form');
  form.querySelector('[name="username"]').value = 'offlinedriver';
  form.querySelector('[name="email"]').value = 'offline@srn.ng';
  form.querySelector('[name="password"]').value = 'OfflinePass1';
  page.document.getElementById('signup-password')
    .dispatchEvent(new page.window.Event('input', { bubbles: true }));
  fireSubmit(page.window, form);

  await waitFor(() => form.querySelector('[data-form-message]').textContent.trim(), 'signup result');
  check('signup succeeds with no server',
    form.querySelector('[data-form-message]').textContent.includes('Account created'),
    JSON.stringify(form.querySelector('[data-form-message]').textContent));

  const stored = JSON.parse(page.window.localStorage.getItem('srn.local.v1') || '{}');
  check('the account is persisted locally', (stored.users || []).length === 1,
    JSON.stringify(stored.users || []));
  check('the local account defaults to the user role', stored.users?.[0]?.role === 'user');
  check('a driver profile is created alongside it', (stored.members || []).length === 1);
  check('the password is never stored in plaintext',
    !JSON.stringify(stored).includes('OfflinePass1'));
  check('the stored password is a digest',
    /^(s256|fnv):/.test(stored.users?.[0]?.hash || ''), stored.users?.[0]?.hash);

  await waitFor(() => page.document.querySelector('[data-account-slot]').textContent.includes('offlinedriver'),
    'navbar username');
  check('navbar shows the new account',
    page.document.querySelector('[data-account-slot]').textContent.includes('offlinedriver'));

  const state = snapshot(page.window);

  // ---- the session survives a reload --------------------------------------
  const back = await loadPage('/account.html', state);
  await waitFor(() => back.document.getElementById('signed-in-panel').style.display === 'block',
    'signed-in panel');
  check('the session survives a page load',
    back.document.getElementById('signed-in-title').textContent.includes('offlinedriver'),
    JSON.stringify(back.document.getElementById('signed-in-title').textContent));

  // ---- a wrong password is still rejected ---------------------------------
  const wrong = await loadPage('/account.html');
  const loginForm = wrong.document.getElementById('login-form');
  loginForm.querySelector('[name="email"]').value = 'offline@srn.ng';
  loginForm.querySelector('[name="password"]').value = 'not-the-password';
  // Fresh browser: no accounts at all, so this must fail rather than let anyone in.
  fireSubmit(wrong.window, loginForm);
  await waitFor(() => loginForm.querySelector('[data-form-message]').textContent.trim(), 'login result');
  check('a bad sign-in is rejected offline',
    /incorrect/i.test(loginForm.querySelector('[data-form-message]').textContent),
    JSON.stringify(loginForm.querySelector('[data-form-message]').textContent));

  // ---- taking part in an activity -----------------------------------------
  const acts = await loadPage('/activities.html', state);
  check('activities.html has no page errors without an API', acts.pageErrors.length === 0, acts.pageErrors.join(' | '));
  await waitFor(() => acts.document.querySelector('.rsvp-btn'), 'rsvp buttons');
  const rsvp = acts.document.querySelector('.rsvp-btn');
  check('RSVP buttons render for the signed-in local account', !!rsvp);
  rsvp?.click();
  await waitFor(() => acts.document.querySelector('.rsvp-btn')?.textContent.includes("YOU'RE IN"), 'rsvp state');
  check('RSVP is recorded offline',
    !!acts.document.querySelector('.rsvp-btn')?.textContent.includes("YOU'RE IN"),
    JSON.stringify(acts.document.querySelector('.rsvp-btn')?.textContent.trim()));

  // ---- submitting an activity ---------------------------------------------
  acts.document.getElementById('toggle-form-btn').click();
  acts.document.getElementById('act-title').value = 'Offline Test Race Night';
  acts.document.getElementById('act-date').value = '2026-12-01';
  acts.document.getElementById('act-time').value = '20:00';
  acts.document.getElementById('act-location').value = 'Online';
  acts.document.getElementById('act-type').value = 'Race Night';
  acts.document.getElementById('act-desc').value = 'Submitted with no server running.';
  fireSubmit(acts.window, acts.document.getElementById('activity-form'));
  await waitFor(() => acts.document.getElementById('activities-list').textContent.includes('Offline Test Race Night'),
    'submitted event');
  check('an event submitted offline shows up in the list',
    acts.document.getElementById('activities-list').textContent.includes('Offline Test Race Night'));

  // ---- admin tools stay server-only ---------------------------------------
  const admin = await loadPage('/admin.html', state);
  check('a local account is not an admin',
    admin.document.getElementById('denied').style.display === 'block');
} finally {
  server.close();
}

console.log('');
if (failures.length) {
  console.log(`${failures.length} offline-account check(s) failed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`All ${pass} offline-account checks passed with no API present.`);
