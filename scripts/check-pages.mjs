// Consistency checks across the hand-written pages.
// Nav and footer are duplicated verbatim in every content page, so they drift silently.
//
//   npm run check:pages

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const CONTENT_PAGES = pages.filter((f) => f !== '404.html');

let bad = 0;
let good = 0;
const check = (label, ok, detail = '') => {
  if (ok) good++;
  else { bad++; console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};

for (const page of CONTENT_PAGES) {
  const html = readFileSync(join(ROOT, page), 'utf8');

  // Desktop navbar slot + mobile drawer slot.
  const slots = (html.match(/data-account-slot/g) || []).length;
  check(`${page}: has 2 account slots (navbar + mobile)`, slots === 2, `found ${slots}`);

  // Script order matters: js/api.js defines SRN before js/app.js calls it.
  const order = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  check(`${page}: script order is data.js, api.js, app.js`,
    order.join(',') === 'js/data.js,js/api.js,js/app.js', order.join(','));

  check(`${page}: has a nav`, /<nav/.test(html));
  check(`${page}: has a footer`, /<footer/.test(html));
  check(`${page}: no link to the deleted README.md`, !/README\.md/.test(html));
}

// Any page that interpolates data into innerHTML must route it through SRN.esc().
for (const page of CONTENT_PAGES) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const script = html.slice(html.indexOf('<script>'));
  // Only pages that interpolate a value into innerHTML need the escaper;
  // a fully static template string does not.
  const interpolates = /innerHTML\s*=?[^;]*\$\{/.test(script) || /\.map\(/.test(script);
  if (interpolates) {
    check(`${page}: imports SRN.esc for escaping`, /const esc = SRN\.esc/.test(script));
  }
}

// 404.html is deliberately bare.
const notFound = readFileSync(join(ROOT, '404.html'), 'utf8');
check('404.html stays script-free', !/<script/.test(notFound));

// Every page must be a build input, and vice versa.
const viteConfig = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
check('vite.config.js derives pages from the filesystem', /readdirSync/.test(viteConfig),
  'hardcoded input lists silently drop new pages');

// The datastore must exist and be well formed, since the repo is the database.
for (const name of ['users', 'events', 'news', 'games', 'members', 'merch', 'rigs', 'messages', 'newsletter']) {
  const file = join(ROOT, 'data', `${name}.json`);
  if (!existsSync(file)) { check(`data/${name}.json exists`, false, 'run npm run seed'); continue; }
  try { JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { check(`data/${name}.json is valid JSON`, false, e.message); }
}

// No plaintext passwords or session tokens may be committed.
const users = JSON.parse(readFileSync(join(ROOT, 'data', 'users.json'), 'utf8'));
for (const u of users) {
  check(`user ${u.username}: has a salted hash, not plaintext`, !!u.salt && !!u.hash && !u.password);
}
check('data/sessions.json is gitignored',
  /data\/sessions\.json/.test(readFileSync(join(ROOT, '.gitignore'), 'utf8')));

console.log(bad ? `\n${bad} of ${good + bad} page check(s) failed across ${pages.length} pages.`
                : `All ${good} page checks passed across ${pages.length} pages.`);
process.exit(bad ? 1 : 0);
