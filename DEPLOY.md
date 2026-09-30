# Local SRN-NG data bucket

SRN runs as a local Node server. The website and `/api` share one origin; accounts, activities, profiles and other collections persist in SQLite. Rig and profile photos are saved on disk beside the database.

## Data files

The default bucket is the ignored `data/` directory in this repository:

- `data/srn.db` — SQLite database.
- `data/uploads/` — uploaded PNG, JPEG and WebP photos.

Both paths are gitignored. They stay in the checked-out repo folder but are not committed or pushed. Do not put account data, passwords or uploaded user photos in a Git branch.

## Run locally

```sh
npm ci
npm start
```

Open `http://localhost:5173`. `npm start` runs the Node server; `npm run dev:static` is static-only and does not provide shared accounts or admin functions.

To put the bucket somewhere else on the same machine, set `SRN_DATA_DIR` before starting. Photos go to `<SRN_DATA_DIR>/uploads/` automatically unless `SRN_UPLOAD_DIR` is explicitly set.

## Back up and restore

Create a consistent database-and-photos snapshot:

```sh
npm run backup:data
```

It writes an ignored `backups/srn-<timestamp>/` directory. Set `SRN_BACKUP_DIR` or pass a destination path to store it elsewhere. Copy backups outside the repository for safekeeping. To restore, stop the server, copy the snapshot's `srn.db` and `uploads/` into `data/`, then restart.

## Verify persistence

```sh
npm run test:persistence
```

The integration test registers a test user, submits an activity and rig photo, restarts the server, then confirms all records and the photo remain available. It uses a disposable test bucket and does not alter `data/srn.db`.
