import { cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Every .html file at the repo root is a page. Deriving the list means a new page
// is picked up automatically instead of being silently omitted from the build.
const pages = Object.fromEntries(
  readdirSync(here)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), resolve(here, f)]),
);

// The page scripts are classic scripts, not ES modules, so Vite neither bundles nor
// copies them; it only prints "can't be bundled without type="module"". Without this
// the built pages reference js/app.js that does not exist in dist/, and no JavaScript
// runs at all on a static deployment.
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const out = resolve(here, 'dist');
      for (const dir of ['js', 'media']) {
        const src = resolve(here, dir);
        if (existsSync(src)) cpSync(src, resolve(out, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyStaticAssets()],
  // Vite's host guard blocks non-localhost origins by default, which breaks
  // container/proxy previews. Allow e2b.app subdomains; keep everything else blocked.
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
  },
  build: {
    rollupOptions: {
      input: pages,
    },
  },
});
