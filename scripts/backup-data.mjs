// Create a consistent SQLite snapshot plus the photos referenced by that database.
// Usage: npm run backup:data [destination-root]
import Database from 'better-sqlite3';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(process.env.SRN_DATA_DIR || join(ROOT, 'data'));
const backupRoot = resolve(process.argv[2] || process.env.SRN_BACKUP_DIR || join(ROOT, 'backups'));
const dbFile = join(dataDir, 'srn.db');
const uploadsDir = resolve(process.env.SRN_UPLOAD_DIR || join(dataDir, 'uploads'));

if (!existsSync(dbFile)) {
  console.error(`No SRN database found at ${dbFile}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = join(backupRoot, `srn-${stamp}`);
mkdirSync(destination, { recursive: true });

const db = new Database(dbFile, { readonly: true, fileMustExist: true });
try {
  await db.backup(join(destination, 'srn.db'));
} finally {
  db.close();
}

const uploads = join(destination, 'uploads');
mkdirSync(uploads, { recursive: true });
if (existsSync(uploadsDir)) cpSync(uploadsDir, uploads, { recursive: true });

const files = readdirSync(uploads).filter((name) => !name.startsWith('.'));
writeFileSync(join(destination, 'manifest.json'), JSON.stringify({
  format: 1,
  createdAt: new Date().toISOString(),
  database: 'srn.db',
  uploads: files.length,
}, null, 2) + '\n');

console.log(`SRN backup written: ${destination}`);
console.log(`  SQLite database: ${join(destination, 'srn.db')}`);
console.log(`  uploaded photos: ${files.length}`);
