// Collection-level persistence for the SRN-NG datastore.
//
// Storage is SQLite (see db.js). This module keeps the read/write/update shape
// the API and the scripts were written against, so callers did not have to
// change when the JSON files were replaced.
//
//   read(name, [])                    the collection as an array
//   write(name, items)                replace it
//   update(name, [], (list) => ...)   read, mutate, write
//   has(name)                         does it hold any rows
//
// Sessions are not a collection. They are keyed rows in their own table, reached
// through the session helpers below.

// Re-exported so existing importers of store.js keep working.
export { ROOT, DATA_DIR, UPLOAD_DIR, MAX_UPLOAD_BYTES } from './paths.js';

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
// A re-export does not bring the name into local scope, so these are imported as
// well as re-exported.
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from './paths.js';
import {
  countCollection,
  removeSession,
  replaceCollection,
  selectCollection,
  selectSession,
  sweepSessions,
  upsertSession,
} from './db.js';

function requireArray(name, fallback) {
  if (!Array.isArray(fallback)) {
    throw new Error(
      `read("${name}") needs an array fallback. Sessions are not a collection; use getSession().`,
    );
  }
}

export function read(name, fallback) {
  requireArray(name, fallback);
  return selectCollection(name);
}

export function write(name, value) {
  if (!Array.isArray(value)) {
    throw new Error(`write("${name}") needs an array. Use putSession() for sessions.`);
  }
  replaceCollection(name, value);
  return value;
}

export function update(name, fallback, mutate) {
  const next = mutate(read(name, fallback));
  return write(name, next);
}

// True when the collection holds at least one row. Replaces the existsSync()
// checks the seed script used against the old JSON files.
export function has(name) {
  return countCollection(name) > 0;
}

export function count(name) {
  return countCollection(name);
}

// ---- sessions -------------------------------------------------------------

export function getSession(token) {
  return selectSession(token);
}

export function putSession(token, userId, expiresAt) {
  upsertSession(token, userId, expiresAt);
}

export function deleteSession(token) {
  return removeSession(token);
}

export { sweepSessions };

// ---- uploads --------------------------------------------------------------

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
