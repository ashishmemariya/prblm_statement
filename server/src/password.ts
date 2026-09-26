import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/**
 * Password hashing lives in its own leaf module so that `seed.ts` can hash the
 * demo credentials at seed time without importing `auth.ts` — which imports
 * `store.ts`, which calls `buildSeed()`. Keeping this dependency-free breaks that
 * import cycle instead of working around the resulting temporal-dead-zone error.
 */
export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const useSalt = salt ?? randomBytes(16).toString('hex');
  const hash = scryptSync(password, useSalt, SCRYPT_KEYLEN).toString('hex');
  return { salt: useSalt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
