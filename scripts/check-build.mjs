// Verifies the production build is actually runnable.
//
// The built pages reference classic scripts that Vite does not bundle. If they are not
// copied into dist/, a static deployment loads no JavaScript at all: the hamburger has
// no handler and no page content renders. This check fails in that case.
//
//   npm run test:build

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DIST = resolve(ROOT, 'dist');

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};

// Build fresh so this never passes on a stale dist/.
if (existsSync(DIST)) execSync('rm -rf dist', { cwd: ROOT, stdio: 'ignore' });
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });

check('dist/ exists after build', existsSync(DIST));

const pages = readdirSync(DIST).filter((f) => f.endsWith('.html'));
check('every source page was built', pages.length === readdirSync(ROOT).filter((f) => f.endsWith('.html')).length,
  `${pages.length} built`);

const external = (ref) => /^(https?:)?\/\//.test(ref) || ref.startsWith('data:');

for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const refs = [
    ...[...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]),
  ].filter((r) => !external(r));

  const missing = refs.filter((ref) => {
    const target = ref.replace(/^\.\//, '').split('?')[0];
    return !existsSync(join(DIST, target));
  });

  check(`${page}: all ${refs.length} local asset references resolve`, missing.length === 0,
    missing.join(', '));
}

// The copied scripts must be byte-identical to the source, not stale leftovers.
for (const file of ['js/app.js', 'js/api.js', 'js/data.js']) {
  const src = join(ROOT, file);
  const out = join(DIST, file);
  if (!existsSync(out)) { check(`dist/${file} exists`, false, 'Vite did not copy it'); continue; }
  check(`dist/${file} matches the source`,
    readFileSync(src, 'utf8') === readFileSync(out, 'utf8')
    && statSync(src).size === statSync(out).size);
}

// Without JavaScript the whole site is inert, so assert the handlers are really there.
const appJs = readFileSync(join(DIST, 'js', 'app.js'), 'utf8');
check('built app.js contains the mobile menu handler', /mobileMenu\.classList\.toggle\('open'\)/.test(appJs));
check('built app.js wires the navbar on load', /initNavbar\(\)/.test(appJs));

console.log('');
if (failures.length) {
  console.error(`${failures.length} of ${pass + failures.length} build checks FAILED`);
  process.exit(1);
}
console.log(`All ${pass} build checks passed across ${pages.length} pages.`);
