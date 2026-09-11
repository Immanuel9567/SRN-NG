// Filesystem locations, split out so store.js and db.js can both use them
// without importing each other.
//
// DATA_DIR holds the SQLite database in normal operation. It is overridable so
// the tests run against a throwaway directory instead of the working tree.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = process.env.SRN_DATA_DIR
  ? resolve(process.env.SRN_DATA_DIR)
  : join(ROOT, 'data');

// Uploaded images live under media/uploads/ so the static server can serve them
// without opening up the rest of data/. The public path stays media/uploads/...
// regardless; only the physical location moves.
export const UPLOAD_DIR = process.env.SRN_UPLOAD_DIR
  ? resolve(process.env.SRN_UPLOAD_DIR)
  : join(ROOT, 'media', 'uploads');

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
