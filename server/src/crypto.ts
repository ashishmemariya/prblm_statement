import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password material lives in its own module so the seed can hash credentials at
 * build time without importing the request-scoped auth layer (which would pull
 * the store into a cycle).
 */
const KEYLEN = 64;

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const useSalt = salt ?? randomBytes(16).toString('hex');
  const hash = scryptSync(password, useSalt, KEYLEN).toString('hex');
  return { salt: useSalt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
