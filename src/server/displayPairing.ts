// 003 B5: pairing a TV that shows a code (03-tech-design v1.2 "Pairing").
// In memory only (max-instances=1, K4). The TV gets a 6-character code to show
// and a 256-bit pair secret it keeps; only hashes of both are held here. A
// signed-in admin binds the code to a display of their own site; the new
// credential then waits here until the TV collects it once, or 10 min pass.
import { newPairCode, hashSecret, newDisplayToken, TOKEN_FORMAT } from './displayToken';

let PAIR_TTL_MS = 10 * 60 * 1000;
export let PAIR_MAX_PENDING = 200;

interface Pending {
  codeHash: string;
  secretHash: string;
  expiresAt: number;
  screenAgent: string; // the pairing screen's user-agent, <= 120 chars (03 gap 5); no IP
  boundDisplayId?: string;
  token?: string; // set at bind, handed to the TV once, then the entry is deleted
}
const byCode = new Map<string, Pending>(); // insertion order = age (oldest first)
const bySecret = new Map<string, Pending>();

function drop(p: Pending) {
  byCode.delete(p.codeHash);
  bySecret.delete(p.secretHash);
}
function purge(now: number) {
  for (const p of byCode.values()) if (p.expiresAt <= now) drop(p);
}

export function startPairing(userAgent: unknown, now = Date.now()): { code: string; pairSecret: string; expiresIn: number } {
  purge(now);
  while (byCode.size >= PAIR_MAX_PENDING) {
    const oldest = byCode.values().next().value as Pending; // the oldest expire first
    drop(oldest);
  }
  let code = newPairCode();
  while (byCode.has(hashSecret(code))) code = newPairCode();
  const pairSecret = newDisplayToken();
  const p: Pending = {
    codeHash: hashSecret(code),
    secretHash: hashSecret(pairSecret),
    expiresAt: now + PAIR_TTL_MS,
    screenAgent: typeof userAgent === 'string' ? userAgent.slice(0, 120) : '',
  };
  byCode.set(p.codeHash, p);
  bySecret.set(p.secretHash, p);
  return { code, pairSecret, expiresIn: Math.round(PAIR_TTL_MS / 1000) };
}

/**
 * 07 S3-2: does this pair secret belong to a pending (unexpired) pairing?
 * Malformed secrets are refused without hashing. Used to pick the limiter
 * bucket BEFORE pairingStatus(), so random secrets never get their own.
 */
export function isPendingSecret(secret: unknown, now = Date.now()): string | null {
  if (typeof secret !== 'string' || !TOKEN_FORMAT.test(secret)) return null;
  const h = hashSecret(secret);
  const p = bySecret.get(h);
  return p && p.expiresAt > now ? h : null;
}

/** null = expired, used or unknown (410). A delivered token deletes the entry. */
export function pairingStatus(secret: unknown, now = Date.now()): { state: 'WAITING' } | { state: 'PAIRED'; token: string } | null {
  if (typeof secret !== 'string' || secret.length === 0 || secret.length > 100) return null;
  const p = bySecret.get(hashSecret(secret));
  if (!p) return null;
  if (p.expiresAt <= now) { drop(p); return null; }
  if (!p.token) return { state: 'WAITING' };
  const token = p.token;
  drop(p); // delivered once
  return { state: 'PAIRED', token };
}

/**
 * Finds a code that is waiting (not expired, not yet bound). Returns a binder
 * that issues the credential, or null for any wrong, used or expired code
 * (the caller answers one generic message).
 */
export function findWaitingCode(code: string, now = Date.now()): { screenAgent: string; bind: (displayId: string, token: string) => void } | null {
  const p = byCode.get(hashSecret(code));
  if (!p || p.expiresAt <= now || p.boundDisplayId) return null;
  return {
    screenAgent: p.screenAgent,
    bind: (displayId, token) => { p.boundDisplayId = displayId; p.token = token; },
  };
}

export const pendingPairings = () => byCode.size;

// TEST SEAM ONLY: the cold-start harness calls this from PAIR_TTL_MS /
// PAIR_MAX_PENDING; nothing in the app does, and there is no env var here.
export function __setPairingForTests(o: { ttlMs?: number; maxPending?: number }) {
  if (o.ttlMs) PAIR_TTL_MS = o.ttlMs;
  if (o.maxPending) PAIR_MAX_PENDING = o.maxPending;
}
