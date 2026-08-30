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
| API tests only | `npm run test:api` (133 checks) |
| DOM render tests only | `npm run test:render` (67 checks, uses jsdom) |
| Empty-datastore sweep | `npm run test:empty` (29 checks across 15 pages) |
| Host allowlist only | `npm run test:hostguard` (9 checks) |
| Page consistency only | `npm run check:pages` (86 checks) |
| Inline JS syntax only | `npm run check:inline` (16 blocks) |
| Skills file validation | `npm run check:skills` |

There is no linter and no typechecker configured.

## 6. Verification protocol (mandatory before claiming done)

1. `npm run check` — exits 0. It runs, in order: `check:skills` (60 skills), `check:pages`
   (85 checks), `check:inline` (16 script blocks), `test:api` (102 checks) and `test:render`
   (45 checks).
2. `npm run build` — exits 0 and emits 15 pages.
3. `npm run dev`, load the changed page, confirm the render and that the console shows no new errors.
4. `git diff --stat` shows only intended files, and `data/` is unchanged unless you meant to change it.

A clean build exit proves pages compile. It does **not** prove they render. `npm run test:render`
executes the real page scripts in jsdom against a live server and asserts on the resulting DOM —
use it, because it has caught a navbar bug that the API tests could not see.

## 7. Gotchas

- **`npm run build` warns** `can't be bundled without type="module"` for `js/data.js` and `js/app.js`.
  Pre-existing and expected. Do not add `type="module"`: verified in a VM, `js/data.js` as a classic
  script leaves `typeof MEMBERS === 'object'` in shared scope, but as an ES module it is `undefined`
  with 0 exports, and every page would render empty.
- **Vite serves `js/data.js` at 101,982 bytes although it is 18,367 on disk.** That is an appended
  inline base64 sourcemap, not a transform. The served file has 0 `import`/`export` statements.
- **Nav and footer are duplicated verbatim in all 14 content pages** (not `404.html`, which has no
  nav, footer or scripts). `npm run check:pages` fails if any page drifts on account slots, script
  order, nav or footer.
- **`dist/` is static and has no API.** Pages fall back to `js/data.js` through
  `SRN.withFallback`, so they still render. `account.html` and `admin.html` need the Node server to
  do anything. Deploying `dist/` alone means no accounts.
- **`data/sessions.json` must never be committed.** It holds live session tokens.
- **The first admin password is generated by `npm run seed` and printed once.** It is not stored in
  plaintext. To change it, delete `data/users.json` and re-seed with `SRN_ADMIN_PASSWORD=...`.
- **`npm audit` reports 2 vulnerabilities** (1 moderate, 1 high) in the Vite tooling tree. Known.
- **`media/` holds 15,670,455 bytes** of committed binaries. Prefer the Unsplash URL pattern in
  `IMGS` over adding new large assets.
- **`node_modules` is gitignored and gets wiped between sessions.** `npm run test:render` fails with
  `Cannot find package 'jsdom'` until you run `npm ci`. Do this first.
- **Both test scripts boot a real server on a random port and wait for its stdout banner.** They used
  to poll `fetch()` until anything answered, which silently connected to an orphaned server from a
  previous run and produced false failures. If a check fails mysteriously, look for a stray
  `node server/index.js` process before debugging the app.
- **The nav is at the bottom, so nothing may assume a top bar.** `.page-header` uses
  `padding-top: 5.5rem`; do not restore the old 8rem top offset.
- **Pages must survive an empty datastore.** A fresh deployment has no content, and a crash on an
  empty collection kills the rest of that page's `DOMContentLoaded` handler. Guard every
  `COLLECTION[0]`. `npm run test:empty` loads all 15 pages against empty data and fails on any error.
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
| DELETE | `/api/news/:slug` | admin | |
| GET | `/api/games`, `/api/members`, `/api/merch`, `/api/rigs` | anyone | rigs and merch hide `pending` |
| PATCH | `/api/members/me` | signed in | edits your own linked profile; creates it if missing |
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
- **Mobile drawer.** `.mobile-menu` is `position: absolute; bottom: calc(100% + 0.75rem)` so it
  floats as a rounded sheet **above** the pill. `js/app.js` toggles `.open` and swaps the icon.
- **Clearance.** `body { padding-bottom: 6.5rem }` keeps content out from under the pill. Toasts
  sit at `bottom: 6.5rem` and the shop cart bar at `bottom: 5.5rem` so nothing collides. If you add
  any new fixed bottom element, give it clearance too.
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
- Display font: **Orbitron** (700/800/900) · Body: **Inter** (300-700), both via Google Fonts
- Money is always Naira, via `formatNaira()`.
- Inline SVG icons, never emoji.
- Do not introduce pure `#000000` backgrounds, AI purple gradients, or 3-equal-column card grids.
- Keep Inter as the body font: it is paired with Orbitron by design, so it is not a defect here.

## 12. Instruction precedence

1. Explicit user instruction in the current message.
2. The repo facts in this file.
3. `global_instructions` in `skills/master_skill_compilation.json`.
4. The active skill's `key_rules_summary`.
5. Default assistant behaviour.

## 13. Skill library

60 skills in six categories, all in `skills/master_skill_compilation.json`:

| Category | Count |
| --- | --- |
| `engineering_and_debugging` | 18 |
| `design_and_frontend` | 9 |
| `product_and_marketing` | 9 |
| `workflow_process_and_meta` | 18 |
| `documents_and_data` | 4 |
| `career` | 2 |
| **Total** | **60** |

Skills that do **not** apply here, and why:

- `tailwind-design-system` — no Tailwind, no React.
- `e2e-testing` — no Playwright or Cypress. `npm run test:render` is the equivalent, using jsdom.
- `test-driven-development` — there is now a real test runner (`npm run check`), so this applies.
- `vercel-security-audit` — no Vercel deployment and no serverless functions.
- `openwork-desktop-sync`, `qwen-code-claw`, `desktop-pet`, `arena-ai-agents` — unrelated to this site.

`design-taste-frontend` takes priority over `tailwind-design-system` for any website work here.
