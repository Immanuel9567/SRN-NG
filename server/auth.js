// Password hashing, session tokens and cookie handling.
// Uses only node:crypto, so the accounts system adds no npm dependencies.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const ROLES = ['admin', 'salesperson', 'user'];
export const DEFAULT_ROLE = 'user';
export const VENDOR_ROLE = 'salesperson';
export const SESSION_COOKIE = 'srn_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Secure cookies are required the moment the site is served over HTTPS, and a
// Secure cookie is simply dropped by the browser over plain http. So this is
// opt-in: `npm run dev` on http://localhost keeps working untouched, and every
// real deployment sets SRN_SECURE_COOKIES=1.
export const SECURE_COOKIES = process.env.SRN_SECURE_COOKIES === '1';

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (SECURE_COOKIES) parts.push('Secure');
  return parts.join('; ');
}

export function clearedCookie() {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (SECURE_COOKIES) parts.push('Secure');
  return parts.join('; ');
}

// Strip credential material before a user record is ever sent to the browser.
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    vendor: user.vendor,
    interests: user.interests || [],
    createdAt: user.createdAt,
  };
}
