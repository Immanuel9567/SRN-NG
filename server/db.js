// SQLite persistence for the site datastore.
//
// One file, <DATA_DIR>/srn.db, via node:sqlite, which is part of Node's standard
// library. The zero-runtime-dependency property of this project is preserved.
//
// Two tables:
//   docs     one row per collection entry, body is its JSON. Covers every
//            collection the API treats as an array.
//   sessions keyed by token, expires_at indexed so the sweep is one DELETE.
//
// Collections are written by diffing against what is already stored, so a write
// touches only the rows that actually changed. The previous JSON-file store
// rewrote an entire collection on every call, which meant every login rewrote
// every account.
//
// On first open, any legacy <collection>.json sitting in DATA_DIR is imported and
// the database becomes the source of truth.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './paths.js';

export const DB_FILE = join(DATA_DIR, 'srn.db');

// Every collection the API stores as an array. sessions is separate.
export const ARRAY_COLLECTIONS = [
  'events', 'news', 'games', 'members', 'merch', 'rigs',
  'messages', 'newsletter', 'orders', 'friends', 'notifications', 'users',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  collection TEXT    NOT NULL,
  ordinal    INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  PRIMARY KEY (collection, ordinal)
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
`;

// Uniqueness is enforced by the database, not by a JavaScript check with a race
// window. Expression indexes read the field straight out of the stored JSON and
// are scoped to the collection, so a member profile may reuse an email.
const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS users_email
  ON docs (json_extract(body, '$.email'))    WHERE collection = 'users';
CREATE UNIQUE INDEX IF NOT EXISTS users_username
  ON docs (json_extract(body, '$.username')) WHERE collection = 'users';
`;

let handle = null;
let stmts = null;

function open() {
  const isNew = !existsSync(DB_FILE);
  // data/ is not tracked, so a fresh clone has no such directory.
  mkdirSync(DATA_DIR, { recursive: true });
  handle = new DatabaseSync(DB_FILE);
  // WAL keeps readers from blocking on a writer, and survives a crash mid-write.
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA synchronous = NORMAL');
  handle.exec(SCHEMA);

  stmts = {
    selectCollection: handle.prepare(
      'SELECT ordinal, body FROM docs WHERE collection = ? ORDER BY ordinal',
    ),
    selectOrdinals: handle.prepare(
      'SELECT ordinal, body FROM docs WHERE collection = ?',
    ),
    countCollection: handle.prepare(
      'SELECT COUNT(*) AS n FROM docs WHERE collection = ?',
    ),
    upsertDoc: handle.prepare(
      'INSERT INTO docs (collection, ordinal, body) VALUES (?, ?, ?)\n'
      + '  ON CONFLICT (collection, ordinal) DO UPDATE SET body = excluded.body',
    ),
    deleteDoc: handle.prepare('DELETE FROM docs WHERE collection = ? AND ordinal = ?'),
    deleteFromOrdinal: handle.prepare(
      'DELETE FROM docs WHERE collection = ? AND ordinal >= ?',
    ),
    getSession: handle.prepare(
      'SELECT user_id, expires_at FROM sessions WHERE token = ?',
    ),
    putSession: handle.prepare(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)\n'
      + '  ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id,'
      + ' expires_at = excluded.expires_at',
    ),
    deleteSession: handle.prepare('DELETE FROM sessions WHERE token = ?'),
    sweepSessions: handle.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    countSessions: handle.prepare('SELECT COUNT(*) AS n FROM sessions'),
  };

  // Order matters. The prepared statements above must exist before the import,
  // because the import writes through replaceCollection(), which uses them.
  if (isNew) importLegacyJson();

  // Created after the import so it validates imported data too, and so a
  // pre-existing duplicate fails with an explanation rather than a raw SQLite error.
  try {
    handle.exec(INDEXES);
  } catch (err) {
    throw new Error(
      `Could not add the unique indexes on users: ${err.message}\n`
      + 'The stored accounts contain duplicate emails or usernames. Resolve them, then restart.',
    );
  }

  return handle;
}

function db() {
  return handle || open();
}

function s() {
  db();
  return stmts;
}

// Migration path for an existing deployment: run once, on database creation.
function importLegacyJson() {
  for (const name of ARRAY_COLLECTIONS) {
    const file = join(DATA_DIR, `${name}.json`);
    if (!existsSync(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`${file} is corrupt and could not be parsed: ${err.message}`);
    }
    if (!Array.isArray(parsed)) continue;
    replaceCollection(name, parsed);
    console.log(`srn.db: imported ${parsed.length} rows into "${name}" from ${name}.json`);
  }

  const sessionFile = join(DATA_DIR, 'sessions.json');
  if (existsSync(sessionFile)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(sessionFile, 'utf8'));
    } catch {
      parsed = {};
    }
    const now = Date.now();
    let imported = 0;
    for (const [token, value] of Object.entries(parsed || {})) {
      if (!value || typeof value !== 'object') continue;
      if (Number(value.expiresAt) <= now) continue;   // already dead, do not carry it over
      s().putSession.run(token, String(value.userId), Number(value.expiresAt));
      imported++;
    }
    if (imported) console.log(`srn.db: imported ${imported} live session(s) from sessions.json`);
  }
}

// ---- collections ----------------------------------------------------------

export function selectCollection(name) {
  return s().selectCollection.all(name).map((row) => JSON.parse(row.body));
}

export function countCollection(name) {
  return s().countCollection.get(name).n;
}

// Rows are matched by position. Unchanged rows are left alone, so a write that
// changes one account rewrites one row rather than the whole collection.
export function replaceCollection(name, items) {
  const d = db();
  const before = new Map(s().selectOrdinals.all(name).map((r) => [r.ordinal, r.body]));
  const next = items.map((item) => JSON.stringify(item === undefined ? null : item));

  d.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < next.length; i++) {
      if (before.get(i) === next[i]) continue;
      s().upsertDoc.run(name, i, next[i]);
    }
    if (before.size > next.length) s().deleteFromOrdinal.run(name, next.length);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
  return items.length;
}

export function replaceAll(collections) {
  let written = 0;
  for (const [name, items] of Object.entries(collections)) written += replaceCollection(name, items);
  return written;
}

// ---- sessions -------------------------------------------------------------

export function selectSession(token) {
  const row = s().getSession.get(token);
  if (!row) return null;
  return { userId: row.user_id, expiresAt: row.expires_at };
}

export function upsertSession(token, userId, expiresAt) {
  s().putSession.run(token, userId, expiresAt);
}

export function removeSession(token) {
  return s().deleteSession.run(token).changes > 0;
}

export function sweepSessions(now = Date.now()) {
  return s().sweepSessions.run(now).changes;
}

export function countSessions() {
  return s().countSessions.get().n;
}

export function closeDb() {
  if (handle) {
    handle.close();
    handle = null;
    stmts = null;
  }
}
