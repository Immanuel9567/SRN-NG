// SQLite persistence for the SRN-NG datastore.
//
// One file: <DATA_DIR>/srn.db. The database is runtime state and is
// gitignored; it is never committed. Collections keep their in-memory shape
// (arrays of objects, sessions as an object) stored as JSON documents in a
// single table, so every caller keeps the read/write/update API unchanged.
//
// Driver: better-sqlite3. node:sqlite needs Node 22+; this project runs on
// Node 20. better-sqlite3 is synchronous, which matches the store's API.

import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so the smoke tests can run against a throwaway directory.
export const DATA_DIR = process.env.SRN_DATA_DIR
  ? resolve(process.env.SRN_DATA_DIR)
  : join(ROOT, 'data');

mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, 'srn.db');

const db = new Database(DB_PATH);
// WAL keeps a reader (status pages, future replicas) from blocking writes.
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS collections (name TEXT PRIMARY KEY, json TEXT NOT NULL)');

const getStmt = db.prepare('SELECT json FROM collections WHERE name = ?');
const setStmt = db.prepare(
  'INSERT INTO collections (name, json) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json'
);

function keyFor(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Refusing to open collection "${name}"`);
  return name;
}

export function read(name, fallback) {
  const row = getStmt.get(keyFor(name));
  if (!row) return fallback;
  try {
    return JSON.parse(row.json);
  } catch (err) {
    throw new Error(`Collection "${name}" is corrupt and could not be parsed: ${err.message}`);
  }
}

// SQLite gives atomicity per statement; the whole collection goes in one row,
// so a crash mid-write cannot leave a truncated document behind.
export function write(name, value) {
  setStmt.run(keyFor(name), JSON.stringify(value));
  return value;
}

export function update(name, fallback, mutate) {
  const next = mutate(read(name, fallback));
  write(name, next);
  return next;
}

// Uploaded images live under media/uploads/ so the static server can serve them
// without opening up the datastore.
// Overridable so the tests never write into the working tree. The public path
// stays media/uploads/... regardless; only the physical location moves.
export const UPLOAD_DIR = process.env.SRN_UPLOAD_DIR
  ? resolve(process.env.SRN_UPLOAD_DIR)
  : join(ROOT, 'media', 'uploads');
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Accepts a data URL, validates it, and returns the public path. Throws with a
// status so the caller can answer 400 rather than 500.
export function saveUpload(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!match) {
    throw Object.assign(new Error('Photo must be a PNG, JPEG or WebP image.'), { status: 400 });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw Object.assign(new Error('That image file is empty.'), { status: 400 });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error('Photo must be under 2 MB.'), { status: 400 });
  }
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `up-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${EXT_BY_MIME[match[1]]}`;
  writeFileSync(join(UPLOAD_DIR, name), buffer);
  return `media/uploads/${name}`;
}
