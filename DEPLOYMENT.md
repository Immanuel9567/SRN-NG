# Deploying SRN-NG

Everything about taking this repository live on `simracing.ng`. Written from a live probe of the
domain and the registry, not from assumptions. Machine facts are as of 11 September 2026.

`AGENTS.md` remains the canonical documentation for the codebase itself. This file covers
infrastructure, DNS, and the deployment runbook.

---

## 1. What is live at simracing.ng right now

**A hosting placeholder, not a website.** There is no site deployed on that vhost.

| Path | Result |
| --- | --- |
| `/` | A single placeholder page: a `<video>` element and the heading "Welcome to SIM Racing NG!" |
| `/index.html`, `/index.php` | 404 |
| `/about.html`, `/gallery.html`, `/news.html`, `/shop.html`, `/members.html`, `/account.html` | 404 |
| `/js/app.js`, `/css/style.css` | 404 |
| `/media/splash.mp4` | 404 |
| `/robots.txt`, `/sitemap.xml` | 404 |
| `/wp-json/` | 404 (no WordPress) |
| `/api/auth/me` | 404 (no API running) |

All 404s are served by **LiteSpeed**, with the stock LiteSpeed body
"The resource requested could not be found on this server!". Only the document root resolves to
anything.

The placeholder text is decisive. `grep -rl "Welcome to SIM Racing"` across this repository returns
nothing, and `git log -S "Welcome to SIM Racing" --all` shows it was never committed in any
revision. It is not an older build of this site, and it is not a crashed install of it. It is the
host's own default page, which some Nigerian shared hosts install on a newly provisioned account.

**Nothing needs migrating or preserving.** That is the good news.

---

## 2. Who controls what

Four providers are involved, which is one more than is healthy and worth consolidating.

| Layer | Provider | Detail |
| --- | --- | --- |
| Registrar | **GO54 Limited** (formerly Whogohost), Ikeja, Lagos | IANA registrar ID 3954, `support@whogohost.com`, +234 700 2233 2233 |
| Nameservers | **Cloudoon** | `ns1.cloudoon.com`, `ns2.cloudoon.net`, `ns3.cloudoon.org` |
| Hosting and mail | **SuperFastHost** | Reverse DNS `rbx111b.superfasthost.cloud`, SPF references `_spf.truehostcloud.com` |
| Network | **OVH** (Roubaix, France) | `178.32.103.89` is in OVH's `178.32.0.0/15` block |

GO54, Whogohost, Truehost, SuperFastHost and Cloudoon are brands within the same Nigerian hosting
grouping, so this is one vendor ecosystem rather than four independent relationships. The practical
consequence is that **the registrar, the DNS zone, and the hosting account are all reachable through
GO54 support**, which is who the owner should contact for anything domain-related.

DNS records observed:

| Name | Type | Value |
| --- | --- | --- |
| `simracing.ng` | A | `178.32.103.89` |
| `www.simracing.ng` | A | `178.32.103.89` (a direct A, not a CNAME) |
| `simracing.ng` | MX | `0 simracing.ng.` |
| `simracing.ng` | TXT (SPF) | `v=spf1 +a +mx include:_spf.truehostcloud.com ~all` |
| `simracing.ng` | NS | the three Cloudoon servers above |

`secureDNS.delegationSigned` is `false`, so DNSSEC is not enabled. Not urgent, but worth turning on
once DNS stops changing.

---

## 3. Two things to handle this month

### 3.1 The domain expires 28 September 2026

The registry shows `simracing.ng` expiring on **2026-09-28**, which is 17 days after the date of
this document. It was registered 2022-09-28 and has one recorded `reinstantiation` event, on
2025-12-02, which is registry language for a domain that had to be restored rather than simply
renewed. That is a domain which has lapsed before.

Two status codes are active, `client transfer prohibited` and `client delete prohibited`, which
blocks transfers away from GO54. That is normal for a domain in good standing but it means a
transfer to a different registrar is not possible until those are lifted.

**Do this first, before any deployment work.** Renew for multiple years, not one. If the domain
lapses, the site, the DNS zone, and any mailboxes on `@simracing.ng` go with it, and a lapsed
`.ng` domain can be re-registered by somebody else.

### 3.2 Mail is routed to that server

The MX record is `0 simracing.ng.`, meaning mail for the domain is delivered to the same host that
serves the website, and SPF authorises `truehostcloud.com` to send on its behalf.

**If the owner uses any `@simracing.ng` email address, repointing the website will break it.**
Before changing any A record, establish whether mailboxes exist on that domain, and if they do,
either keep the MX pointing at the existing provider or migrate the mailboxes deliberately. Website
DNS and mail DNS do not have to move together: the A record can point at a new server while the MX
and SPF stay exactly where they are. That is usually the right answer for a small community site.

---

## 4. The seeded admin address is on a domain nobody owns

`scripts/seed.mjs` defaults the first admin to `admin@srn.ng`. It is overridable through
`SRN_ADMIN_EMAIL`, but the default is what runs if nobody sets it.

**`srn.ng` is not registered.** Querying the `.ng` registry returns `404 No results for query
srn.ng`. The address is therefore unreachable today, and once email-driven flows exist (password
reset, notifications, breach notification to users) it becomes worse than unreachable: whoever
registers `srn.ng` receives mail the site sends to its own administrator, and can send mail that
appears to come from it.

The `srn.ng` string appears 39 times in the repository. Almost all of it is test fixture data in
`scripts/smoke-api.mjs`, `scripts/render-check.mjs` and `scripts/check-offline-accounts.mjs`, where
it is inert. The two places that matter are:

- `scripts/seed.mjs:100` — the default admin email
- `scripts/reset-admin.mjs` — documented examples

Until the default changes, set it explicitly in production:

```
SRN_ADMIN_EMAIL=admin@simracing.ng SRN_ADMIN_PASSWORD='...' npm run seed
```

---

## 5. Where to host

The application imposes three constraints that decide this. All three are already true of the code;
they are not preferences.

1. **A writable persistent directory.** The datastore is a SQLite file at `<SRN_DATA_DIR>/srn.db`,
   and uploaded rig photos go to `SRN_UPLOAD_DIR`. Both must survive a redeploy.
2. **A single long-running process with a local disk.** The login rate limiter is an in-memory
   `Map` in `server/ratelimit.js`, so multiple instances or a platform that suspends idle
   containers silently resets throttling state. SQLite also cannot sit on NFS, which rules out a
   PaaS volume in favour of a local disk.
3. **A host that will run an arbitrary Node process.** Not a static host, not serverless, and not a
   PHP-only shared plan.

### Option A: a small VPS (recommended)

One box, roughly $5 per month, with Caddy in front of the Node server. Full control of the
filesystem, TLS handled automatically, and the `SRN_DATA_DIR` directory lives outside the deploy
tree so a redeploy cannot touch accounts. This is the only option where the guarantees in `AGENTS.md`
3.2 hold exactly as written.

Provider choice matters for one legal reason: **a Nigerian host avoids the cross-border transfer
question entirely** under the NDPA once you pass 200 signups in six months. A European host is fine
and cheaper, but if you cross that threshold you need a transfer mechanism on file. Hetzner is in
Germany, and OVH is already in use at Roubaix, so staying with an EU provider is the cheaper and
better-supported path provided you document the basis later.

The existing SuperFastHost account already sits in an OVH datacenter, so latency is identical
whichever route you take.

### Option B: stay on the existing shared host

cPanel plans with the "Setup Node.js App" feature (Phusion Passenger) can run a long-lived Node
process, so this is technically possible on the account that already exists. It is viable and it
costs nothing extra. The caveats are real though: Passenger imposes its own process lifecycle, you
do not control the Node version, you cannot run Caddy so TLS is whatever the host provides, and
`SRN_DATA_DIR` has to be placed outside `public_html` in the account home directory. Choose this to
save money, not to save effort.

### Option C: static hosting only

`dist/` deploys to any static host and the pages render from `js/data.js`. Accounts then fall back
to the browser-local datastore described in `AGENTS.md` 3.1: no shared accounts, no `admin.html`, no
moderation. Acceptable for a brochure site. Wrong for a community with logins.

---

## 6. Runbook: VPS deployment

Assumes Debian or Ubuntu, a domain already pointing at the server, and a non-root `srn` user.

### 6.1 Prepare the server

```
apt update && apt install -y caddy git
useradd -r -m -d /home/srn -s /usr/sbin/nologin srn
mkdir -p /var/lib/srn/data /var/lib/srn/uploads
chown -R srn:srn /var/lib/srn
```

Install Node 22 from NodeSource. **Pin the minor version** in your notes: `node:sqlite` is still
marked experimental on Node 22 and its API can change between minors.

### 6.2 Deploy the code

```
git clone https://github.com/Immanuel9567/SRN-NG.git /opt/srn-ng
cd /opt/srn-ng
npm ci
```

`npm ci` installs `vite` and `jsdom`, which are devDependencies and not needed at runtime. The
server itself has zero runtime dependencies. You can skip the install entirely and start
`server/index.js` directly if you never want to run the check suite on the box.

### 6.3 Seed the external datastore, once

```
cd /opt/srn-ng
SRN_DATA_DIR=/var/lib/srn/data \
SRN_ADMIN_EMAIL=admin@simracing.ng \
npm run seed
```

With no `SRN_ADMIN_PASSWORD` this prints a generated password exactly once. Capture it. It is not
stored in plain text and cannot be recovered, only rotated with `npm run reset-admin`.

Confirm it worked, since an empty datastore renders an empty site:

```
ls -la /var/lib/srn/data      # expect a single srn.db, roughly 60 KB
```

If that file is only a few kilobytes, content did not seed. You are on a build older than commit
`3e8e542`, where `seed.mjs` checked the repo's fixtures instead of the target directory and
silently skipped everything.

`SRN_DATA_DIR` is resolved when the module loads, so it must be exported in the same environment
that starts the server, not set afterwards.

If you are migrating an existing deployment that stored JSON, do nothing special: the first open
imports `<SRN_DATA_DIR>/*.json` into `srn.db` and leaves the originals in place so you can verify
before deleting them.

### 6.4 systemd unit

`/etc/systemd/system/srn.service`:

```ini
[Unit]
Description=SRN-NG site and API
After=network.target

[Service]
Type=simple
User=srn
WorkingDirectory=/opt/srn-ng
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3

Environment=NODE_ENV=production
# Bind to loopback only. Caddy is the public listener.
Environment=HOST=127.0.0.1
Environment=PORT=5173
Environment=SRN_DATA_DIR=/var/lib/srn/data
Environment=SRN_UPLOAD_DIR=/var/lib/srn/uploads
# Required behind TLS, or the session cookie can travel over plain http.
Environment=SRN_SECURE_COOKIES=1
Environment=SRN_ALLOWED_HOSTS=simracing.ng,www.simracing.ng
# Exactly one reverse proxy sits in front of this service.
Environment=SRN_TRUST_PROXY=1
# node:sqlite prints an ExperimentalWarning and its API may change between minors.
# Pin the Node version you tested on rather than tracking latest.

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/srn

[Install]
WantedBy=multi-user.target
```

```
systemctl daemon-reload && systemctl enable --now srn
systemctl status srn
```

The startup banner echoes the active host allowlist, so `journalctl -u srn -n 20` confirms the
configuration took effect. If it prints `host check : DISABLED`, `SRN_ALLOWED_HOSTS` did not reach
the service.

### 6.5 Caddy

`/etc/caddy/Caddyfile`:

```
simracing.ng, www.simracing.ng {
    encode zstd gzip
    reverse_proxy 127.0.0.1:5173
}
```

```
systemctl reload caddy
```

Caddy obtains and renews Let's Encrypt certificates on its own. Open 80 and 443 in the firewall and
close 5173 to the outside world, since only Caddy should reach the app.

`SRN_TRUST_PROXY=1` is what makes the rate limiter work here. Without it every request arrives from
`127.0.0.1`, all users share one bucket, and ten failed logins from one person locks out login for
everybody for fifteen minutes.

### 6.6 Backups

Everything worth keeping is under `/var/lib/srn`: the database and the uploaded rig photos.
Two files matter.

```bash
/var/lib/srn/data/srn.db        # accounts, sessions, events, news, orders, messages
/var/lib/srn/uploads/           # rig photos
```

Take the database copy with SQLite's own backup, which is safe against a running server and
produces a consistent single file. A plain `cp` of a live WAL database can capture a torn state.

`/usr/local/bin/srn-backup`:

```bash
#!/bin/sh
set -eu
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TMP=/var/backups/srn-$STAMP
mkdir -p "$TMP"

# .backup is the safe way to copy a live database. Drops expired sessions first.
sudo -u srn sqlite3 /var/lib/srn/data/srn.db \
  "DELETE FROM sessions WHERE expires_at <= $(date +%s)000; VACUUM INTO '$TMP/srn.db'"

cp -a /var/lib/srn/uploads "$TMP/uploads"
tar czf "$TMP.tar.gz" -C /var/backups "srn-$STAMP"
age -r "$SRN_BACKUP_PUBKEY" -o "$TMP.tar.gz.age" "$TMP.tar.gz"
rm -rf "$TMP" "$TMP.tar.gz"
find /var/backups -name 'srn-*.age' -mtime +30 -delete
```

If `sqlite3` is not installed, `apt install sqlite3`. You can get the same result from Node with the
`backup()` export in `node:sqlite` if you would rather not add the CLI.

Excluding sessions keeps live tokens out of your backups. Everything else here is personal data:
email addresses, order history, contact messages. Encrypt before it leaves the machine, schedule it
with a systemd timer or cron, ship it offsite, and **restore one backup as a test**. An untested
backup is not a backup.

### 6.7 Cutover

Do this in an order where every step is reversible:

1. Test the new server by IP with a hosts-file entry, before touching DNS.
2. Confirm TLS issues, login works, and a signed-in account survives a page reload.
3. Lower the TTL on the A records to 300 seconds and wait for the old TTL to expire.
4. Repoint the A records for `simracing.ng` and `www.simracing.ng`. **Leave MX and TXT alone.**
5. Verify from a second network, then restore the TTL to 3600.
6. Only once satisfied, cancel or downgrade the old hosting, keeping the registrar relationship.

---

## 7. Post-deploy verification

Run these against the live domain, not against localhost.

| Check | Expected |
| --- | --- |
| `curl -sI https://www.simracing.ng/` | `200`, and a `server: Caddy` header rather than LiteSpeed |
| `curl -sI http://simracing.ng/` | redirect to `https` |
| Login, inspect the cookie | `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=604800` |
| `curl -s -o /dev/null -w '%{http_code}' https://www.simracing.ng/data/srn.db` | `403` |
| `curl -s -o /dev/null -w '%{http_code}' https://www.simracing.ng/server/api.js` | `403` |
| `curl -s -o /dev/null -w '%{http_code}' https://www.simracing.ng/server/db.js` | `403` |
| `curl -s -o /dev/null -w '%{http_code}' https://www.simracing.ng/api/auth/me` | `401` (JSON, not a 404 HTML page) |
| `curl -s -H 'Host: evil.example.com' https://127.0.0.1/` from the server | `421` |
| 11 bad logins from one IP | `429` with a `Retry-After` header |
| The same 11 with a forged `X-Forwarded-For` prefix | still `429` |
| Register an account, reload, confirm still signed in | session persists |
| `ls -la /var/lib/srn/data` | one `srn.db`, roughly 60 KB after seeding |
| Restart the service, sign in again | the account survives (it is in SQLite, not memory) |
| Restore a backup into a scratch directory | seeded content is intact |

The API returning `401` with JSON at `/api/auth/me` is the single clearest signal that the Node
server, rather than a static file host, is answering.

---

## 8. Still outstanding

Tracked here so the gap is not mistaken for done.

- **No privacy notice page.** There is no `privacy.html` and no terms page, while the site collects
  email, username, city, bio, and order history. This is the largest compliance gap.
- **No account deletion or data export endpoint.** Both are NDPA data-subject rights.
- **Password reset does not exist.** The agreed approach is admin-issued one-time tokens. Until it
  ships, a forgotten password means editing `users.json` on the server by hand.
- **scrypt parameters are below the OWASP table.** `N=16384, r=8, p=1` in `server/auth.js` sits
  under all of OWASP's listed configurations. Raising `p` is the cheaper lever; raising `N` costs
  memory per concurrent login. `scryptSync` also blocks the event loop and should become async.
- **No retention policy.** Sessions expire and are swept; nothing else does. The database makes
  this tractable now, since it is one `DELETE` per rule rather than rewriting whole JSON files.
- **`data/` in the repo is empty and stays that way.** If a future change needs a tracked fixture,
  it belongs in `js/data.js`, not as a JSON collection file.
- **No CSRF tokens.** Mitigated by `SameSite=Lax` and the absence of cross-origin requests, and it
  holds only while no state-changing `GET` route is added.
- **`npm audit` reports 2 vulnerabilities** (1 moderate, 1 high) in the Vite tooling tree. Not
  reachable from the running server, which has no runtime dependencies.
- **Dead weight in `media/`.** 15.6 MB total, including a 5.9 MB `splash.mp4` that no page
  references and a `terms-banner.png` that becomes useful once a terms page exists.
