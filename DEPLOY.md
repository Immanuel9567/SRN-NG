# Deploy the SRN account server

SRN requires a Node server and persistent storage for shared accounts and admin access. GitHub Pages is not a supported production deployment. The sandbox preview is temporary, not production hosting.

## External hosting

Connect this repository to a Node-capable host such as Render or Railway.

- Install: `npm ci`
- Start: `npm start`
- Set `SRN_ADMIN_PASSWORD` through the host's secret settings before first boot.
- Mount persistent storage and set `SRN_DATA_DIR` to that mount's writable directory.
- Configure persistent upload storage with `SRN_UPLOAD_DIR` as appropriate.
- Choose a plan with persistent storage and no idle suspension if continuous availability is required. Hosting can incur charges; obtain approval before provisioning.

The server serves both the website and `/api` on the same origin. Use its URL for login, not the former GitHub Pages URL. A fresh database creates `admin@srn.ng`. Existing database passwords are not changed by setting the initial seed password.

## Local development

```
npm ci
npm run dev
```

## Verification after deployment

Verify signup, signout, signin, admin access, and persistence after restart before calling the deployment complete. Browser-local fallback accounts are not shared server accounts and do not automatically migrate.
