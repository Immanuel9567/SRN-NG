# AGENTS.md

**Read this file first. It is the entry point for every coding agent working in this repository.**

Agent configuration lives in [`skills/master_skill_compilation.json`](skills/master_skill_compilation.json).
That file holds the 60-skill library, the global instructions, and a machine-readable `repo_context`
block describing this codebase. Read this file, then load **one** skill from that library that matches
the task.

---

## 1. What this repository is

**SRN-NG is the SIM Racing Nigeria website: a multi-page static frontend plus a small Node accounts
API.** There is no frontend framework. The repo is also its own database: content is stored as
committed JSON in `data/`.

**There is no `README.md`.** It was deleted because it described a React + TypeScript + Tailwind v4
stack with a `src/` tree and React Router, none of which has ever existed in this checkout. Do not
recreate it: **`AGENTS.md` is the canonical documentation for this repository.**

If you were handed an outside description of this project claiming React, TypeScript, Tailwind,
`src/`, or client-side routes like `/gallery`, it is wrong. The real routes are plain `.html` hrefs:
`gallery.html`, `news-article.html?slug=...`. Verified against the working tree.

## 2. Stack

**Frontend** — 15 root-level `.html` pages, hand-written.

- `css/style.css` — the only stylesheet (549 lines). Design tokens live in its `:root` block.
- `js/data.js` — mock collections (506 lines): `IMGS` (6 keys), `GAMES` (4), `ACTIVITIES` (6),
  `NEWS` (8), `MEMBERS` (8), `MERCH` (7), `RIGS` (6), plus `getArticle`, `getMember`, `getRig`,
  `formatNaira`. Now a **fallback** for pages that have moved to the API.
- `js/api.js` — the API client. Exposes the global `SRN`, including `SRN.esc()` for HTML escaping.
- `js/app.js` — shared behaviour: `initNavbar()`, `initActivePageLinks()`, and
  `SRN.renderAccountState()`.
- **No ES modules.** Not one `type="module"` in the repo. The `js/` files are classic scripts whose
  top-level `const` declarations are visible to later scripts on the same page, but are **not**
  properties of `window`. `window.SRN` is `undefined` from outside the page; do not test it that way.

**Backend** — `server/`, plain `node:http`. Zero runtime dependencies.

- `server/index.js` — serves the static site *and* `/api/*` from one origin, so browser code uses
  relative URLs only. No CORS, no proxy. Blocks `/data`, `/server`, `/scripts`, `/skills`,
  `/node_modules`, `/.git`.
- `server/api.js` — the routes.
- `server/auth.js` — `scrypt` password hashing, session tokens, cookie handling.
- `server/store.js` — atomic JSON read/write. `SRN_DATA_DIR` overrides the location (used by tests).

**Datastore** — `data/`, committed to the repo.

Ten committed collections: `users`, `events`, `news`, `games`, `members`, `merch`, `rigs`,
`messages`, `newsletter`, `orders`. `sessions.json` is gitignored because it holds live tokens.
`npm run seed` populates them from `js/data.js` and creates the empty inbox files.
- **There are zero runtime dependencies.** `vite ^8.0.0` and `jsdom ^30` are both devDependencies:
  a build tool and the test DOM respectively. The server runs on Node's standard library alone.

## 3. Accounts and roles

Three roles, assigned as tags:

| Role | How it is assigned | Can do |
| --- | --- | --- |
| `user` | Default for every signup | Submit events and rigs, which go to `pending`; buy merch |
| `salesperson` | The vendor toggle at signup | Everything a user can, plus list merchandise for sale |
| `admin` | **Only** by another admin | Publish and delete news, approve or reject events, change any role |

Signup fields are exactly: **username, email, password, vendor toggle**. Vendor on → `salesperson`,
otherwise `user`. Signup can never mint an admin, even if the request body contains `role: "admin"`.

Invariants that are covered by tests, so do not break them:

- Passwords are `scrypt`-hashed with a per-user salt. No plaintext, ever.
- Salt and hash never leave the server; `publicUser()` strips them.
- Unknown email and wrong password both return the same 401.
- Sessions are `HttpOnly`, `SameSite=Lax`, 7-day cookies.
- Role changes take effect on already-signed-in sessions immediately.
- The last remaining admin cannot be demoted (409).
- `data/` and `server/` are not servable as static files.

### 3.1 Offline accounts (no server present)

A static deployment has no `/api`, and signup used to die there with `Request failed (404)`.
`js/api.js` now probes `/api/auth/me` once per page load: if the response is not JSON, the origin is
a plain file host and every account call runs against a **browser-local datastore** in
`localStorage` under the key `srn.local.v1` instead.

- Covered offline: signup, sign-in, sign-out, session, interests, driver profile (avatar is kept as
  a data URL), event submission, RSVP, rig and merch listings, orders, newsletter, contact form.
- The fallback also catches a server that dies mid-session: the API answers every route with JSON,
  so an HTTP error without a JSON body came from the hosting proxy, not the API, and account calls
  fall through to the local store instead of showing a raw status.
- Not covered offline: everything admin (`SRN.users`, role changes, news, moderation queues,
  `?scope=all`) and friends/notifications, which need other people. Those reject with
  *"This needs the SRN server."* rather than pretending to work.
- Same rules as the server: username/email/password validation, duplicate checks, vendor toggle →
  `salesperson`, and signup can never mint an admin.
- Passwords are digested (WebCrypto SHA-256, or a non-cryptographic fallback on plain `http`), never
  stored in plaintext — but this is browser storage, not a security boundary.
- **It is a stopgap, not multi-user hosting.** Local accounts exist in one browser only. Run
  `npm run dev` (or host `server/`) for shared, real accounts written to `data/users.json`.
- `account.html` shows an "offline" notice when this mode is active; `SRN.offline()` returns a
  promise for that flag.
- `npm run test:offline` boots a dumb static file server with no API and asserts all of the above.

## 4. Folder structure

```
.
├── AGENTS.md              <- you are here; agent entry point
├── *.html                 <- 15 pages: the 13 original, plus account.html and admin.html
├── css/style.css          <- single stylesheet; :root design tokens
├── js/data.js             <- mock collections, now a fallback source
├── js/api.js              <- SRN client + SRN.esc() escaper
├── js/app.js              <- navbar, active links, account state
├── server/                <- node:http API and static server (not servable over HTTP)
├── data/                  <- THE DATABASE. Committed JSON. sessions.json is gitignored.
├── scripts/               <- seed + all check and test runners
├── skills/                <- agent skills; master_skill_compilation.json
├── media/                 <- 9 committed binaries, 15,670,455 bytes (splash.mp4 is 5.9 MB of it)
├── vite.config.js         <- page inputs derived from the filesystem; no manual list
├── package.json           <- scripts listed in section 5
└── dist/                  <- build output, gitignored
```

## 5. Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| **Run the app** | `npm run dev` (Node server on `0.0.0.0:5173`, serves pages **and** `/api`) |
| Static-only dev server | `npm run dev:static` (Vite; no API, pages fall back to mock data) |
| Build | `npm run build` (emits all 15 pages to `dist/`) |
| Seed the datastore | `npm run seed` (idempotent; `-- --force` reseeds content) |
| Rotate the admin password | `npm run reset-admin -- admin@srn.ng` |
| **Run every check** | `npm run check` |
| API tests only | `npm run test:api` (198 checks) |
| Server-loss fallback | `npm run test:serverloss` (6 checks; signup survives the server dying mid-session) |
| DOM render tests only | `npm run test:render` (84 checks, uses jsdom) |
| Empty-datastore sweep | `npm run test:empty` (29 checks across 15 pages) |
| Offline accounts (no API) | `npm run test:offline` (17 checks against a plain static host) |
| Build output integrity | `npm run test:build` (22 checks; rebuilds `dist/` first) |
| Host allowlist only | `npm run test:hostguard` (9 checks) |
| Page consistency only | `npm run check:pages` (307 checks) |
| Inline JS syntax only | `npm run check:inline` (16 blocks) |
| Skills file validation | `npm run check:skills` |

There is no linter and no typechecker configured.

## 6. Verification protocol (mandatory before claiming done)

1. `npm run check` — exits 0. A `precheck` hook installs missing dependencies first, then it runs
   `check:skills` (62), `check:pages` (335), `check:inline` (33 blocks), `test:api` (161),
   `test:render` (84), `test:hostguard` (9), `test:empty` (29), `test:offline` (17) and
   `test:build` (22).
2. `npm run build` — exits 0 and emits 15 pages.
3. `npm run dev`, load the changed page, confirm the render and that the console shows no new errors.
4. `git diff --stat` shows only intended files, and `data/` is unchanged unless you meant to change it.

A clean build exit proves pages compile. It does **not** prove they render. `npm run test:render`
executes the real page scripts in jsdom against a live server and asserts on the resulting DOM —
use it, because it has caught a navbar bug that the API tests could not see.

## 7. Gotchas

- **`npm run build` warns** `can't be bundled without type="module"` for the page scripts. **That
  warning is not harmless.** Because the scripts are classic, Vite neither bundles nor copies them,
  so `dist/` used to ship with no `js/` at all: a static deployment loaded zero JavaScript, the
  hamburger had no handler, and no page rendered. `vite.config.js` now has a `copyStaticAssets`
  plugin that copies `js/` and `media/` into `dist/`, and `npm run test:build` fails if any built
  page references a file missing from `dist/`. Do not remove either.
- **Still do not add `type="module"`** to the page scripts: verified in a VM, `js/data.js` as a
  classic script leaves `typeof MEMBERS === 'object'` in shared scope, but as an ES module it is
  `undefined` with 0 exports, and every page would render empty.
- **Vite serves `js/data.js` at 101,982 bytes although it is 18,367 on disk.** That is an appended
  inline base64 sourcemap, not a transform. The served file has 0 `import`/`export` statements.
- **Nav and footer are duplicated verbatim in all 14 content pages** (not `404.html`, which has no
  nav, footer or scripts). `npm run check:pages` fails if any page drifts on account slots, script
  order, nav or footer.
- **`dist/` is static and has no API.** Pages fall back to `js/data.js`, so they still render, and
  accounts fall back to the browser-local datastore described in section 3.1. `admin.html` still
  needs the Node server: moderation is server-only.
- **`data/sessions.json` must never be committed.** It holds live session tokens.
- **The first admin password is generated by `npm run seed` and printed once.** It is not stored in
  plaintext. To change it, delete `data/users.json` and re-seed with `SRN_ADMIN_PASSWORD=...`.
- **`npm audit` reports 2 vulnerabilities** (1 moderate, 1 high) in the Vite tooling tree. Known.
- **`media/` holds 15,670,455 bytes** of committed binaries. Prefer the Unsplash URL pattern in
  `IMGS` over adding new large assets.
- **`node_modules` is gitignored and gets wiped between sessions.** `npm run check` has a `precheck`
  hook (`scripts/ensure-deps.mjs`) that detects missing `jsdom`/`vite` and runs `npm ci` for you.
  Running the individual `test:*` scripts directly still fails until deps are installed.
- **The sandbox can also reset the local branch ref** back to an old commit while leaving the
  working tree intact. Check `git rev-parse HEAD` against `git ls-remote origin <branch>` before
  committing; recover with `git reset --mixed origin/<branch>`, which moves the pointer without
  touching your files.
- **Both test scripts boot a real server on a random port and wait for its stdout banner.** They used
  to poll `fetch()` until anything answered, which silently connected to an orphaned server from a
  previous run and produced false failures. If a check fails mysteriously, look for a stray
  `node server/index.js` process before debugging the app.
- **The nav is at the bottom, so nothing may assume a top bar.** `.page-header` uses
  `padding-top: 3.5rem`; do not inflate it back towards the old 8rem.
- **Pages must survive an empty datastore.** A fresh deployment has no content, and a crash on an
  empty collection kills the rest of that page's `DOMContentLoaded` handler. Guard every
  `COLLECTION[0]`. `npm run test:empty` loads all 15 pages against empty data and fails on any error.
- **`matchMedia` is not implemented in jsdom.** Theme code must guard for it, and the test harness
  polyfills it so the switcher is testable.
- **`innerText` is not implemented in jsdom.** Assigning it does nothing under test and silently
  leaves `textContent` empty. Use `textContent`. Every such assignment in this repo has been converted.
- **Node's `fetch` ignores a `Host` header override**, so it cannot test the host allowlist.
  `npm run test:hostguard` uses `node:http` instead.
- **Always escape user-supplied content.** Pages now use `SRN.esc()` because events and news are
  user-authored. Any new template literal that injects data must escape it.

## 8. API surface

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | anyone | username, email, password, vendor |
| POST | `/api/auth/login` | anyone | email, password |
| POST | `/api/auth/logout` | signed in | clears the cookie |
| GET | `/api/auth/me` | anyone | 401 when signed out |
| GET | `/api/users` | admin | no password material |
| PATCH | `/api/users/:id/role` | admin | last-admin guard |
| GET | `/api/events` | anyone | hides `pending`; `?scope=all` for admin |
| POST | `/api/events` | signed in | admin posts go live, others go `pending` |
| PATCH | `/api/events/:id/status` | admin | `upcoming`, `past`, `pending`, `rejected` |
| POST | `/api/events/:id/rsvp` | signed in | toggle; returns `{attending, count}` |
| GET | `/api/news` | anyone | |
| POST | `/api/news` | admin | slug generated and de-duplicated |
| DELETE | `/api/news/:slug` | admin | also deletes the article's comments |
| GET | `/api/news/:slug/comments` | anyone | 404 for an unknown slug |
| POST | `/api/news/:slug/comments` | signed in | `{ text }` up to 600 chars; rate limited; notifies the author |
| GET | `/api/news/:slug/reactions` | anyone | counts per kind plus the caller's active kinds |
| POST | `/api/news/:slug/reactions` | signed in | toggles `{ kind }` of flag/fire/love/trophy; one per kind |
| GET | `/api/news/trending` | anyone | top four articles ranked by total reactions |
| GET | `/api/comments` | admin | newest 50 comments across all articles |
| DELETE | `/api/comments/:id` | admin | removes one comment from the pit wall |
| GET | `/api/games`, `/api/members`, `/api/merch`, `/api/rigs` | anyone | rigs and merch hide `pending` |
| PATCH | `/api/members/me` | signed in | city, sim, bio, avatar, socials, gamesPlayed; creates the profile if missing |
| GET | `/api/friends` | signed in | friends, incoming, outgoing |
| POST | `/api/friends` | signed in | `{ memberId }` sends a request |
| POST | `/api/friends/:id/accept` | signed in | accept an incoming request |
| DELETE | `/api/friends/:id` | signed in | unfriend or decline |
| GET | `/api/notifications` | signed in | the caller's notification centre |
| PATCH | `/api/notifications/:id/read` | signed in | marks one notification read |
| PATCH | `/api/auth/interests` | signed in | sets your topic list; unknown game ids are 400 |
| POST | `/api/games` | admin | adds a supported game |
| DELETE | `/api/games/:id` | admin | removes a supported game |
| POST | `/api/merch` | salesperson, admin | others get 403; price validated |
| PATCH | `/api/merch/:id/status` | admin | `approved`, `pending`, `rejected` |
| POST | `/api/orders` | signed in | **totals priced server-side from the catalogue** |
| GET | `/api/orders` | signed in | own orders; `?scope=all` for admin |
| PATCH | `/api/orders/:id/status` | admin | `new`, `fulfilled`, `cancelled` |
| GET | `/api/members/:id`, `/api/rigs/:id` | anyone | 404 for unknown or pending |
| POST | `/api/rigs` | signed in | admin publishes, others go `pending` |
| PATCH | `/api/rigs/:id/status` | admin | `approved`, `pending`, `rejected` |
| POST | `/api/newsletter` | anyone | email; 409 if already subscribed |
| POST | `/api/messages` | anyone | contact form; returns `{ok, id, message}` |
| GET | `/api/inbox` | admin | messages, subscribers, and a stats block |
| PATCH | `/api/messages/:id/read` | admin | marks a message read |

## 9. Security posture

- **Passwords.** `scrypt` with a per-user 16-byte salt, compared with `timingSafeEqual`. No plaintext.
- **Sessions.** 32 random bytes, `HttpOnly`, `SameSite=Lax`, 7-day TTL, expired ones swept on write.
- **Rate limiting.** `server/ratelimit.js` caps login and signup at 10 attempts per 15 minutes per
  socket address, returning 429 with `Retry-After`. It runs **before** body parsing, so a
  malformed body to a throttled endpoint answers 429, not 400. `X-Forwarded-For` is deliberately
  ignored: a client could rotate it to walk past the limit. Put the real IP in at a trusted proxy.
- **Host allowlist.** Set `SRN_ALLOWED_HOSTS` (comma separated, `.example.com` matches subdomains)
  to reject any other `Host` with 421. Unset means allow everything, which is what the sandbox
  preview needs. Set it in production.
- **Prices are never trusted from the client.** `POST /api/orders` re-prices every line from
  `data/merch.json`.
- **Role checks live on the server.** Hiding a button in the UI is not authorization.
- **Still absent:** CSRF tokens (mitigated only by `SameSite=Lax`), email verification, password
  reset, and any audit log.

## 10. UI components and design system

All in `css/style.css`, so a change lands on every page at once.

- **Floating pill navbar.** Fixed to the **bottom centre**, not the top: `bottom: 1rem`,
  `left: 50%`, `transform: translateX(-50%)`, `width: calc(100% - 2rem)` so it never touches a
  screen edge, `max-width: 68rem`, `border-radius: 9999px`. Frosted glass via
  `backdrop-filter: blur(20px) saturate(180%)` with a green-to-orange hairline
  (`.navbar::after`) that fades in on scroll. Always set `-webkit-backdrop-filter` alongside
  `backdrop-filter`; the `@supports not` block falls back to a solid pill.
- **Mobile drawer.** `.mobile-menu` is `position: fixed` at `bottom: 5.5rem` and lives **outside**
  `<nav>` in the DOM. That is deliberate: an ancestor with `backdrop-filter` becomes the backdrop
  root, so a drawer nested inside the navbar could only blur the navbar, never the page behind it.
  Do not move it back inside `<nav>`. It is centred with `left/right/max-width/margin: auto` rather
  than `transform`, so `transform` stays free for the pop animation.
- **Sticky sub-header.** Every content page opens with `.sticky-subhead` (`position: sticky; top: 0`)
  holding the back link (`.subhead-back`) and the theme switcher. On `sim-rigs.html` the back link is
  hidden by an inline script unless `?id=` is present.
- **Theme switcher.** `js/theme.js` reads `srn-theme` from localStorage (`light` | `dark` | `auto`,
  default `auto`) and sets `data-theme` on `<html>`. "Auto" is resolved in JS via `matchMedia`, so the
  stylesheet only defines two states. Each page also carries an inline pre-paint script in `<head>`
  to avoid a palette flash. `matchMedia` is guarded everywhere: jsdom does not implement it.
- **Clearance.** `body { padding-bottom: 6.5rem }` keeps content out from under the pill. Toasts
  sit at `bottom: 6.5rem` and the shop cart bar at `bottom: 5.5rem` so nothing collides. If you add
  any new fixed bottom element, give it clearance too.
- **Hero video.** The index hero background is `media/splash.mp4` in a muted, looped,
  `playsinline` `<video>` behind the two scrims, with an Unsplash image as `poster`. An inline
  script pauses it (seeking to 0) when `prefers-reduced-motion: reduce` matches. `play()` is
  wrapped in a safe helper so the hero never throws where media playback is unavailable.
  `.hero-video` in `css/style.css` sizes it `object-fit: cover` at `opacity: 0.45`.

- **Nav Home.** Every content page's `.navbar-links` and `.mobile-menu` open with a `Home` link to
  `index.html`, ahead of Gallery. The brand logo also links home.

- **About page imagery.** `about.html` shows `media/who-we-are.png`, `media/what-we-believe.png`,
  `media/what-we-do.png` and `media/our-vision.png` as a four-card section, `media/logo.png` in the
  header and `media/join-banner.png` in a closing join CTA. `media/terms-banner.png` is currently
  unused (there is no terms page). `check:pages` asserts each referenced about image exists on disk.

- **Auth entry points.** There is no "Join Now" anywhere. Signed-out visitors get **SIGN UP**
  (primary) and **SIGN IN** (outline) in the navbar and the drawer. `account.html` is one card with
  a `.srn-segmented` toggle that alternates which fields are visible; both `#signup-form` and
  `#login-form` stay in the DOM, and `?mode=signin` deep-links to sign-in.
- **Toasts.** `SRN.toast(message, 'success' | 'error' | 'info')` appends to `#srn-toasts`, which is
  created on demand with `role="status"` and `aria-live="polite"`.
- **Skeletons.** `SRN.skeleton(count, height)` emits `.srn-skeleton` shimmer blocks for loading states.
- **`.srn-stat` / `.srn-stats`** — the admin stat tiles.
- **`:focus-visible`** gives every interactive element a green outline.
- **`prefers-reduced-motion`** disables all animation and transitions.
- **Escaping is mandatory.** Every page that interpolates into `innerHTML` declares
  `const esc = SRN.esc` and routes user content through it. `npm run check:pages` fails otherwise.

## 11. Brand and style

Dark theme only. There is no light mode and no theme toggle.

- Backgrounds: `#08080C` / `#0A0A10` / cards `#0E0E14`
- Primary accent: electric green `#00E676` · Secondary: orange `#FF6B1A`
- **Roboto** (300/400/500/700/900) is the site font for both `--font-sans` and `--font-display`.
  Orbitron is still loaded but is used only by the inline logo SVG mark.
- Money is always Naira, via `formatNaira()`.
- Inline SVG icons, never emoji.
- Do not introduce pure `#000000` backgrounds, AI purple gradients, or 3-equal-column card grids.
- Large headlines use `.glass-text` rather than flat `color: var(--accent-green)`. It clips a
  white-to-green gradient to the glyphs with `-webkit-text-fill-color: transparent`, and has an
  `@supports not (background-clip: text)` fallback to solid green.
- Frosted panels use `.glass-panel`; the navbar and drawer share the same
  `rgba(255,255,255,0.1) -> rgba(255,255,255,0.04)` gradient at `blur(24px) saturate(200%)`.

## 12. Themes and uploads

**Themes.** `[data-theme="light"]` in `css/style.css` overrides the palette variables. Glass surfaces,
the switcher, `.srn-segmented` and `.glass-text` each have light-mode variants.

**Content on imagery.** Add `class="on-media"` to any container that sits over a photo or video.
In light mode it redefines `--text-white`, `--text-primary`, `--text-muted` and `--text-dim` back to
their dark-theme values, and every descendant inherits them. The hero uses this, so its headline
stays white over the video in both themes.

**Light surfaces need shadows.** `.card`, `.card-alt`, `.srn-stat`, `.btn`, `.input-field`,
`.srn-toast`, `.glass-text`, `.sticky-subhead` and `.page-header` all have `[data-theme="light"]`
shadow variants; without them the light theme reads as flat.

Known debt: pages still hardcode colours in inline `style` attributes. `[data-theme="light"]
[style*=...]` bridges cover the dark surfaces and the white text **as a pair** — bridging only the
text is what made light mode unreadable, because dark text landed on a dark chip. `npm run
check:pages` audits every hardcoded dark colour in every inline style and fails if no light rule
covers it, so this cannot silently regress. The real fix is still converting those inline styles to
classes; `.cart-bar`, `.hero-scrim` and `.hero-scrim-fade` have already been moved over.

**Rig photo uploads.** `POST /api/rigs` accepts a `photo` field as a `data:` URL. `saveUpload()` in
`server/store.js` validates the MIME type (PNG/JPEG/WebP), enforces a 2 MB cap, and writes to
`media/uploads/` so the static server can serve it. The request body limit is 4 MB because base64
inflates by roughly a third. `media/uploads/` is gitignored. `SRN_UPLOAD_DIR` redirects it, which is
how the tests avoid writing into the working tree.

**Heights.** The navbar pill uses `padding: 0.625rem` vertically and `.sticky-subhead` uses
`min-height: 3.25rem` with `padding: 0.625rem`. Both were `0.5rem` / `3rem` and read as too thin.

**Inputs.** `.input-field` uses `var(--bg-dark)`, `var(--border-light)` and `var(--text-primary)`.
It used to hardcode `background: #08080C`, which is why the search bars stayed black in light mode.

## 13. Topics and supported games

`data/games.json` is the list of supported games, and **only admins can change it** (`POST` and
`DELETE /api/games`). Everything else derives from it:

- **Registration is two steps.** After `POST /api/auth/signup` the account page shows the topic
  picker (`#interests-panel`) instead of the signed-in panel. Saving calls
  `PATCH /api/auth/interests`, which validates every id against the games list and de-duplicates.
  Topics stay editable later from the "Your topics" card.
- **Events carry a topic.** `POST /api/events` takes `game`: a supported game id, or `general`.
  An unrecognised id falls back to `general` rather than failing the submission.
- **Activities filter by game.** `#game-filters` renders All games / General / each supported game,
  and `#act-game` is the topic dropdown on the submission form.

**Admin route status codes.** Use `adminError(actor)`: 401 when unauthenticated, 403 when signed in
but not an admin. Returning 403 to an anonymous caller leaks that the route exists and is
admin-gated. Do not hand-roll `json(403, ...)` for admin guards.

**Brand mark.** The logo SVG uses `fill="currentColor"` for "SIM RACING" and
`fill="var(--accent-green)"` for "NIGERIA", with the anchor setting `color: var(--text-white)`.
It used to hardcode `fill="#FFFFFF"`, which vanished on the light glass pill. `check:pages` fails
if any page reintroduces a hardcoded white fill.

## 14. Instruction precedence

1. Explicit user instruction in the current message.
2. The repo facts in this file.
3. `global_instructions` in `skills/master_skill_compilation.json`.
4. The active skill's `key_rules_summary`.
5. Default assistant behaviour.

## 15. Skill library

62 skills in six categories, all in `skills/master_skill_compilation.json`:

| Category | Count |
| --- | --- |
| `engineering_and_debugging` | 18 |
| `design_and_frontend` | 9 |
| `product_and_marketing` | 9 |
| `workflow_process_and_meta` | 20 |
| `documents_and_data` | 4 |
| `career` | 2 |
| **Total** | **62** |

Compulsory before any new modification: skill `read-entire-tree` (list the whole working tree). Prose and UI copy: skill `no-ai-slop` is always on.

Skills that do **not** apply here, and why:

- `tailwind-design-system` — no Tailwind, no React.
- `e2e-testing` — no Playwright or Cypress. `npm run test:render` is the equivalent, using jsdom.
- `test-driven-development` — there is now a real test runner (`npm run check`), so this applies.
- `vercel-security-audit` — no Vercel deployment and no serverless functions.
- `openwork-desktop-sync`, `qwen-code-claw`, `desktop-pet`, `arena-ai-agents` — unrelated to this site.

`design-taste-frontend` takes priority over `tailwind-design-system` for any website work here.
