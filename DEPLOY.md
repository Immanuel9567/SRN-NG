# Deploying SRN-NG

The dev preview inside the build sandbox is not a host: the sandbox suspends
every process between working sessions, so the site "dies" no matter what
server runs it. To use the site for real, run it somewhere that stays up.
Three options, easiest first.

## 1. GitHub Pages (already live, zero server)

The `gh-pages` branch holds the static site: every page, the full offline
fallback, nothing to install. GitHub serves it continuously.

- URL: `https://immanuel9567.github.io/SRN-NG/`
- Accounts work, but live **only in the browser that created them** (the
  browser-local datastore). There is no server, so there is no shared
  database and no admin role.
- Content shown is `js/data.js` plus whatever the visitor posts locally.
- Refresh it after changes: the `gh-pages` branch is regenerated from
  `main` (see `scripts/deploy-pages.mjs`).

## 2. Render / Railway (the real always-on server)

This is the option that makes `admin@srn.ng` and shared accounts work.

Render: dashboard > "New +" > "Blueprint" > pick this repo. `render.yaml`
does the rest. Railway: "New project" > "Deploy from GitHub repo" > pick
`Immanuel9567/SRN-NG`; the `Procfile` start command is picked up
automatically.

Then:

1. Set env var `SRN_ADMIN_PASSWORD` to the admin password you want (the
   server creates `admin@srn.ng` on first boot from an empty database).
2. For data that survives redeploys, add a persistent volume mounted at
   `/data` (Render: paid disk; Railway: volume in the service settings).
   The SQLite file (`srn.db`) and uploaded images then live there.
3. Open the deployed URL, sign in, done.

Free tiers exist on both. Render's free plan sleeps when idle and wakes on
the next request (tens of seconds); Railway's trial credit is time-limited.
The database on a free plan without a volume is wiped on redeploy - keep
backups (`scp`/download `data/srn.db`) if that matters.

## 3. Your own box (VPS, home server)

```
git clone https://github.com/Immanuel9567/SRN-NG && cd SRN-NG
npm install
SRN_ADMIN_PASSWORD=... npm run seed
npm start            # node server/index.js, port 5173
```

Put nginx/caddy in front for TLS if you expose it publicly. The host guard
(`SRN_ALLOWED_HOSTS`) is documented in AGENTS.md.

## What runs where

| Piece | Pages | Render/Railway | Own box |
|---|---|---|---|
| Browsing events/news | yes (seed data) | live SQLite | live SQLite |
| Sign up / sign in | per-browser only | shared accounts | shared accounts |
| Admin views | no | yes | yes |
| Data survives sleep | yes | needs volume | yes |
