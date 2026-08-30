// Loads every page against a completely empty datastore and asserts none of them
// throw. A fresh deployment has no content, and a page that crashes on an empty
// collection takes its whole DOMContentLoaded handler down with it.
//
//   npm run test:empty

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 5100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'srn-empty-'));
process.env.SRN_DATA_DIR = dataDir;

const { JSDOM, VirtualConsole } = await import('jsdom');
const { write } = await import('../server/store.js');

// Every collection empty. This is what `npm run seed` has not yet produced.
for (const name of ['users', 'events', 'news', 'games', 'members', 'merch', 'rigs',
  'messages', 'newsletter', 'orders']) write(name, []);

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SRN_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};

try {
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`server did not start.\n${log}`)), 10000);
    const poll = () => {
      if (log.includes('EADDRINUSE')) { clearTimeout(timer); rej(new Error(`port ${PORT} in use.\n${log}`)); return; }
      if (log.includes(`SRN-NG server on http://0.0.0.0:${PORT}`)) { clearTimeout(timer); res(); return; }
      setTimeout(poll, 50);
    };
    poll();
  });

  const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => {
      // No outbound network in the sandbox, so the Google Fonts link always fails.
      if (/fonts\.googleapis\.com/.test(e.message)) return;
      errors.push(e.message);
    });

    const dom = await JSDOM.fromURL(`${BASE}/${page}`, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(w) {
      // jsdom has no media playback; stub play/pause so the hero video is testable.
      if (w.HTMLMediaElement && w.HTMLMediaElement.prototype) {
        w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
        w.HTMLMediaElement.prototype.pause = function () {};
      }
      // jsdom has no matchMedia; the theme code guards for it, but the switcher
      // needs a working one to be testable at all.
      w.matchMedia = w.matchMedia || ((query) => ({
        matches: false, media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      }));
      w.fetch = (i, init = {}) => fetch(new URL(typeof i === 'string' ? i : i.url, BASE), init); },
    });
    await new Promise((r) => dom.window.addEventListener('load', r));
    await new Promise((r) => setTimeout(r, 350));

    check(`${page} renders with no errors on empty data`, errors.length === 0, errors.join(' | '));

    // Every page except 404 must still have a working mobile nav.
    if (page !== '404.html') {
      const hasToggle = !!dom.window.document.querySelector('.mobile-toggle');
      const hasDrawer = !!dom.window.document.querySelector('.mobile-menu');
      check(`${page} still has its mobile nav`, hasToggle && hasDrawer,
        `toggle=${hasToggle} drawer=${hasDrawer}`);
    }
    dom.window.close();
  }

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} of ${pass + failures.length} empty-state checks FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`All ${pass} empty-state checks passed across ${pages.length} pages.`);
  }
} catch (err) {
  console.error('empty-state check crashed:', err);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
