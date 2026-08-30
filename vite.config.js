import { readdirSync } from 'node:fs';
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

export default defineConfig({
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
