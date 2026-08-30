// JSON file persistence for the SRN-NG repo-backed datastore.
// Data lives in <repo>/data/*.json and is committed to the repo, per project decision.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
