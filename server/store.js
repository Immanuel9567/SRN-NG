// JSON file persistence for the SRN-NG repo-backed datastore.
// Data lives in <repo>/data/*.json and is committed to the repo, per project decision.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so the smoke tests can run against a throwaway directory.
export const DATA_DIR = process.env.SRN_DATA_DIR
  ? resolve(process.env.SRN_DATA_DIR)
  : join(ROOT, 'data');

function pathFor(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Refusing to open collection "${name}"`);
  return join(DATA_DIR, `${name}.json`);
}

export function read(name, fallback) {
  const file = pathFor(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is corrupt and could not be parsed: ${err.message}`);
  }
}

// Write via a temp file + rename so a crash mid-write cannot truncate the collection.
export function write(name, value) {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = pathFor(name);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
  return value;
}

export function update(name, fallback, mutate) {
  const next = mutate(read(name, fallback));
  write(name, next);
  return next;
}

// Uploaded images live under media/uploads/ so the static server can serve them
// without opening up the rest of data/.
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
