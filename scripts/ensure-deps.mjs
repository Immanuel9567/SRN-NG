// npm run check fails with a confusing "Cannot find package 'jsdom'" whenever
// node_modules is missing, which happens on any fresh sandbox session because it
// is gitignored. Detect that up front and install instead.

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'noop.js'));

const needed = ['jsdom', 'vite'];
const missing = needed.filter((name) => {
  try { require.resolve(`${name}/package.json`); return false; }
  catch { return true; }
});

if (!missing.length) {
  console.log(`dependencies present: ${needed.join(', ')}`);
  process.exit(0);
}

console.log(`missing ${missing.join(', ')}; running npm ci (node_modules is gitignored and gets wiped)`);
execSync('npm ci', { cwd: ROOT, stdio: 'inherit' });

const stillMissing = needed.filter((name) => {
  try { require.resolve(`${name}/package.json`); return false; }
  catch { return true; }
});
if (stillMissing.length) {
  console.error(`npm ci did not install: ${stillMissing.join(', ')}`);
  process.exit(1);
}
console.log('dependencies installed');
