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
  check(`${page}: uses the full footer grid`, /class="footer-grid"/.test(html));
  check(`${page}: drawer sits outside nav`, html.indexOf('class="mobile-menu"') > html.indexOf('</nav>'));
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
    check(`${page}: drawer offers SIGN UP`, /class="mobile-menu"[\s\S]*SIGN UP/.test(html));
    {
      const actions = html.match(/<div class="navbar-actions">[\s\S]*?<\/div>/);
      check(`${page}: large navbar has no SIGN UP`, actions && !/SIGN UP/.test(actions[0]));
    }
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
    check(`${page}: sticky header has the SRN logo`, /class="subhead-logo"/.test(html) && html.includes('media/logo.png'));
    check(`${page}: sub-header has a theme switcher`, /class="theme-switch"/.test(html));
    check(`${page}: offers light, dark and device themes`,
      /data-theme="light"/.test(html) && /data-theme="dark"/.test(html) && /data-theme="auto"/.test(html));
    check(`${page}: loads js/theme.js`, /<script src="js\/theme\.js"><\/script>/.test(html));
    check(`${page}: sets the theme before first paint`,
      /localStorage\.getItem\('srn-theme'\)/.test(html));
    check(`${page}: header has an admin entry`, /data-admin-entry/.test(html));
    check(`${page}: header has a notification bell`, /data-notify-open/.test(html));
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

  const landing = readFileSync(join(ROOT, 'about.html'), 'utf8');
  check('hero marketing badge removed', !/Nigeria's Premier Sim Racing Community/.test(landing));
  check('hero headline is glassy', /class="glass-text"[^>]*>YOUR SPEED\./.test(landing));
  check('no large headline is left flat green',
    !/clamp\((1\.8|2\.4|3\.5)rem[^)]*\)[^>]*color: var\(--accent-green\)/.test(landing));
  check('landing page is about.html', /id="hero-video"/.test(landing));
  const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('home is a signed-in FYP', /id="fyp"/.test(home) && /id="spotlight-grid"/.test(home));
}

// ---- every hardcoded dark surface must have a light-theme bridge ------------
// Inline styles set both white text and dark backgrounds. Bridging only one side
// is what made light mode unreadable, so audit both against the stylesheet.
{
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  const lightBridges = css
    .split('\n')
    .filter((l) => l.includes('[data-theme="light"]'))
    .join('\n')
    .toLowerCase();

  const surfaces = new Set();
  const texts = new Set();

  // Pull every colour literal out of a background declaration, including ones
  // nested inside linear-gradient(...), and flag the dark, opaque ones.
  const isDark = (value) => {
    let r, g, b, a = 1;
    const hex = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(value);
    const rgb = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(value);
    if (hex) [r, g, b] = [hex[1], hex[2], hex[3]].map((h) => parseInt(h, 16));
    else if (rgb) { [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number); if (rgb[4] !== undefined) a = Number(rgb[4]); }
    else return false;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.3 && a > 0.3;
  };

  for (const page of pages) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/style="([^"]*)"/g)) {
      for (const decl of m[1].matchAll(/background(?:-color)?:\s*([^;"]+)/g)) {
        for (const colour of decl[1].matchAll(/#[0-9A-Fa-f]{6}\b|rgba?\([^)]*\)/g)) {
          const value = colour[0].replace(/\s+/g, ' ');
          if (isDark(value)) surfaces.add(value);
        }
      }
      for (const c of m[1].matchAll(/color:\s*(#F{6}|#FFF)\b/gi)) texts.add(c[1].toUpperCase());
    }
  }
  check('audit found hardcoded dark surfaces', surfaces.size > 0, `found ${surfaces.size}`);

  for (const value of surfaces) {
    const needle = value.toLowerCase().replace(/\s+/g, ' ');
    check(`light theme bridges dark surface ${value}`, lightBridges.includes(needle),
      'no [data-theme="light"] rule covers it');
  }
  for (const value of texts) {
    check(`light theme bridges ${value} text`, lightBridges.includes(value.toLowerCase()),
      'no [data-theme="light"] rule covers it');
  }
  check('audited at least one hardcoded surface', surfaces.size > 0, `found ${surfaces.size}`);
}

// ---- topics, games and the brand mark --------------------------------------
{
  const activities = readFileSync(join(ROOT, 'activities.html'), 'utf8');
  check('activities has a game filter row', /id="game-filters"/.test(activities));
  check('activities filters by the selected game', /currentGame === 'all'/.test(activities));
  check('activity form has a topic selector', /id="act-game"/.test(activities));
  check('topic selector offers General', />Topic: General</.test(activities));
  check('submission sends the topic', /game: document\.getElementById\('act-game'\)\.value/.test(activities));

  const account = readFileSync(join(ROOT, 'account.html'), 'utf8');
  check('signup has a topic picker step', /id="interests-panel"/.test(account) && /id="interests-chips"/.test(account));
  check('signup routes through the topic picker', /await showInterestsStep\(res\.user\)/.test(account));
  check('topics stay editable after signup', /id="member-interests"/.test(account));
  check('account can edit socials', /id="socials-form"/.test(account));
  check('account can edit games played', /id="games-played"/.test(account));
  check('account shows a friend list', /id="friend-list"/.test(account));

  const admin = readFileSync(join(ROOT, 'admin.html'), 'utf8');
  check('admin can manage supported games', /id="game-form"/.test(admin) && /id="games-list"/.test(admin));
  check('admin games section can remove a game', /data-game-delete/.test(admin));

  // The logo hardcodes a white fill, which disappears on the light glass pill.
  for (const page of CONTENT_PAGES) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    check(`${page}: brand mark has no hardcoded white fill`, !/fill="#FFFFFF"/i.test(html));
  }
}

// ---- nav home button and about imagery -------------------------------------
{
  for (const page of CONTENT_PAGES) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    check(`${page}: navbar has a Home link`,
      /<a href="index\.html" class="nav-link">Home<\/a>/.test(html));
    check(`${page}: drawer has a Home link`,
      /<a href="index\.html" class="mobile-nav-link">Home<\/a>/.test(html));
  }

  const about = readFileSync(join(ROOT, 'about.html'), 'utf8');
  for (const img of ['who-we-are', 'what-we-believe', 'what-we-do', 'our-vision']) {
    check(`about.html uses media/${img}.png`, about.includes(`media/${img}.png`));
  }
  check('about.html uses the brand logo', about.includes('media/logo.png'));
  check('about.html has a join CTA', about.includes('media/join-banner.png'));

  // Every local image referenced by the about page must exist on disk.
  for (const m of about.matchAll(/src="(media\/[^"]+)"/g)) {
    check(`about image exists: ${m[1]}`, existsSync(join(ROOT, m[1])));
  }
}

// ---- hero uses the splash video -------------------------------------------
{
  const index = readFileSync(join(ROOT, 'about.html'), 'utf8');
  check('hero uses media/splash.mp4', /<video[^>]*src="media\/splash\.mp4"/.test(index));
  check('hero video is muted, looped and playsinline',
    /<video[^>]*autoplay[^>]*muted[^>]*loop[^>]*playsinline/.test(index) ||
    /<video[^>]*[^>]*muted/.test(index));
  check('hero video has a poster fallback', /poster=/.test(index));
  check('hero video respects reduced motion', /prefers-reduced-motion: reduce/.test(index));
  check('splash.mp4 exists on disk', existsSync(join(ROOT, 'media', 'splash.mp4')));
}

// 404.html is deliberately bare.
const notFound = readFileSync(join(ROOT, '404.html'), 'utf8');
check('404.html stays script-free', !/<script/.test(notFound));

// Every page must be a build input, and vice versa.
const viteConfig = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
check('vite.config.js derives pages from the filesystem', /readdirSync/.test(viteConfig),
  'hardcoded input lists silently drop new pages');

// The datastore must exist and be well formed, since the repo is the database.
for (const name of ['users', 'events', 'news', 'games', 'members', 'merch', 'rigs', 'messages', 'newsletter', 'friends', 'notifications']) {
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
