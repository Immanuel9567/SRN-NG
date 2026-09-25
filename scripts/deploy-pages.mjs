// Regenerates the gh-pages branch (the static site, no server) from the
// current checkout and force-pushes it. GitHub Pages serves it continuously;
// the app runs there on its browser-local datastore.
//
//   npm run deploy:pages
//
// What ships: every root HTML page, css/, js/, vendor/, media/, 404.html and
// .nojekyll. What never ships: server/, scripts/, data/, skills/, tests,
// node_modules and package files - a static host needs none of it, and the
// datastore must never leave the machine that owns it.

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const site = [...pages, 'css', 'js', 'vendor', 'media', 'favicon.ico']
  .filter((f) => existsSync(join(ROOT, f)));

const stage = mkdtempSync(join(tmpdir(), 'srn-pages-'));
try {
  for (const item of site) cpSync(join(ROOT, item), join(stage, item), { recursive: true });
  writeFileSync(join(stage, '.nojekyll'), '');

  const name = execSync('git config user.name', { cwd: ROOT, encoding: 'utf8' }).trim();
  const email = execSync('git config user.email', { cwd: ROOT, encoding: 'utf8' }).trim();
  const run = (cmd) => execSync(cmd, { cwd: stage, stdio: 'pipe' });
  run('git init -q -b gh-pages');
  run('git add -A');
  run(`git -c user.name='${name}' -c user.email='${email}' commit -qm "Static site regenerated from main (npm run deploy:pages)"`);
  // The remote URL (with credentials) is read at push time and lives only in
  // this temp repo's config, which is deleted below.
  const url = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
  run(`git push -q -f ${url} gh-pages`);
  console.log(`gh-pages regenerated: ${pages.length} pages + css/js/vendor/media`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
