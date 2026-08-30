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
  check(`${page}: script order is data.js, api.js, theme.js, app.js`,
    order.join(',') === 'js/data.js,js/api.js,js/theme.js,js/app.js', order.join(','));

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

// Design invariants the nav is specified against: a bottom-centre pill, and a drawer
// that matches it. These are easy to break with a careless CSS edit.
{
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  const navBlock = css.match(/\.navbar \{([^}]*)\}/)?.[1] || '';
  check('navbar is fixed to the bottom', /position: fixed/.test(navBlock) && /bottom: 1rem/.test(navBlock));
  check('navbar is centred and inset from the screen edge',
    /left: 50%/.test(navBlock) && /transform: translateX\(-50%\)/.test(navBlock)
    && /width: calc\(100% - 2rem\)/.test(navBlock));
  check('navbar is a rounded pill', /border-radius: 9999px/.test(navBlock));
  check('navbar is glassy', /backdrop-filter: blur\(/.test(navBlock)
    && /-webkit-backdrop-filter/.test(navBlock));
  check('navbar has a solid fallback where blur is unsupported',
    /@supports not \(\(backdrop-filter/.test(css));

  const drawer = css.match(/\.mobile-menu \{([^}]*)\}/)?.[1] || '';
  // The drawer must sit outside <nav>: a backdrop-filter ancestor becomes the
  // backdrop root, which would stop the sheet from blurring the page behind it.
  check('drawer is fixed, not nested in the navbar', /position: fixed/.test(drawer));
  check('drawer sits above the pill', /bottom: 5\.5rem/.test(drawer));
  check('drawer has rounded corners', /border-radius: 1\.75rem/.test(drawer));
  check('drawer blurs the background', /backdrop-filter: blur\(28px\)/.test(drawer));
  check('page content clears the floating nav', /body \{[^}]*padding-bottom: 6\.5rem/.test(css));
}

// ---- the auth entry points and the type/glass system -----------------------
{
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');

  for (const page of CONTENT_PAGES) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    check(`${page}: no leftover JOIN NOW`, !/JOIN NOW/.test(html));
    check(`${page}: offers SIGN UP`, />SIGN UP</.test(html));
    check(`${page}: offers SIGN IN`, />SIGN IN</.test(html));
  }

  check('Roboto is loaded', /family=Roboto/.test(css));
  check('Inter is no longer the site font', !/family=Inter/.test(css));
  check('body font is Roboto', /--font-sans: 'Roboto'/.test(css));
  check('display font is Roboto', /--font-display: 'Roboto'/.test(css));

  check('.glass-text exists', /\.glass-text \{/.test(css));
  check('.glass-text falls back where background-clip:text is unsupported',
    /@supports not \(\(-webkit-background-clip: text\)/.test(css));

  const navBlock = css.match(/\.navbar \{([^}]*)\}/)?.[1] || '';
  check('navbar panel uses the light glass recipe', /rgba\(255, 255, 255, 0\.1\) 0%/.test(navBlock));
  const drawer = css.match(/\.mobile-menu \{([^}]*)\}/)?.[1] || '';
  check('drawer panel uses the light glass recipe', /rgba\(255, 255, 255, 0\.1[0-9]?\) 0%/.test(drawer));

  const account = readFileSync(join(ROOT, 'account.html'), 'utf8');
  check('account page has a mode toggle', /id="auth-mode"/.test(account) && /srn-segmented/.test(account));
  check('account page keeps both forms for alternating fields',
    /id="signup-form"/.test(account) && /id="login-form"/.test(account));

  // ---- sticky sub-header, theme switcher and the rig photo field ----------
  check('.sticky-subhead is sticky', /\.sticky-subhead \{[^}]*position: sticky/.test(css));
  check('a light theme is defined', /\[data-theme="light"\] \{/.test(css));
  check('theme switcher styles exist', /\.theme-switch \{/.test(css));

  for (const page of CONTENT_PAGES) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    check(`${page}: has a sticky sub-header`, /class="sticky-subhead"/.test(html));
    check(`${page}: sub-header has a theme switcher`, /class="theme-switch"/.test(html));
    check(`${page}: offers light, dark and device themes`,
      /data-theme="light"/.test(html) && /data-theme="dark"/.test(html) && /data-theme="auto"/.test(html));
    check(`${page}: loads js/theme.js`, /<script src="js\/theme\.js"><\/script>/.test(html));
    check(`${page}: sets the theme before first paint`,
      /localStorage\.getItem\('srn-theme'\)/.test(html));
  }

  const backPages = { 'news-article.html': 'news.html', 'member-profile.html': 'members.html', 'sim-rigs.html': 'sim-rigs.html' };
  for (const [page, target] of Object.entries(backPages)) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    check(`${page}: back link lives in the sticky sub-header`,
      new RegExp(`class="subhead-back" href="${target.replace('.', '\\.')}"`).test(html));
  }

  const rigPage = readFileSync(join(ROOT, 'sim-rigs.html'), 'utf8');
  check('rig form has a photo file input',
    /<input type="file" id="rig-photo"[^>]*accept="image\//.test(rigPage));

  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('hero marketing badge removed', !/Nigeria's Premier Sim Racing Community/.test(index));
  check('hero headline is glassy', /class="glass-text"[^>]*>YOUR SPEED\./.test(index));
  check('no large headline is left flat green',
    !/clamp\((1\.8|2\.4|3\.5)rem[^)]*\)[^>]*color: var\(--accent-green\)/.test(index));
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
