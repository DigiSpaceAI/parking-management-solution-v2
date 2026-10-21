// 003 B2/B5: TV credentials and pairing codes (03-tech-design v1.2 "TV credential",
// "Pairing"). Pure functions over node:crypto only, so they are unit-tested
// directly. Nothing here stores anything.
import crypto from 'node:crypto';

/** 32 random bytes, base64url: 43 characters, 256 bits (NFR-5 "unguessable"). */
export function newDisplayToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** What is stored and indexed instead of a token or secret: SHA-256, hex. */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** 31 characters: digits 2-9 and A-Z without I, L and O (no 0/O/1/I/L). */
export const PAIR_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A 6-character pairing code (31^6 ~ 8.9e8), uniform (rejection sampling). */
export function newPairCode(): string {
  let code = '';
  while (code.length < 6) {
    const b = crypto.randomBytes(8);
    for (const x of b) {
      if (x < 248 && code.length < 6) code += PAIR_ALPHABET[x % 31]; // 248 = 8 * 31
    }
  }
  return code;
}

/** What an admin typed ("k7m 4qp", "K7M-4QP") -> "K7M4QP", or null if it can't be a code. */
export function normalizePairCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const c = input.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== 6) return null;
  for (const ch of c) if (!PAIR_ALPHABET.includes(ch)) return null;
  return c;
}

export const displayLink = (token: string): string => `https://admin.parkflows.in/tv#k=${token}`;
