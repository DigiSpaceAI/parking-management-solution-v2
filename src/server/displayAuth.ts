// 003 B2: the per-display TV credential (03-tech-design v1.2 "TV credential").
// Only SHA-256 hashes are stored. An in-memory index hash -> display is
// rebuilt when a display is written or the store is reloaded.
// Replace, pair and switch-off move the live hash to retiredTokenHashes: it
// answers "switched off" (410) for 30 days, then it is unknown (401).
import { LiveDisplay } from '../types';
import { getStore, getDisplaysVersion, saveDisplay } from './db';
import { newDisplayToken, hashSecret, TOKEN_FORMAT } from './displayToken';

export const RETIRED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

type IndexEntry = { displayId: string; live: boolean; until?: number };
let index = new Map<string, IndexEntry>();
let indexKey: { version: number; list: unknown } | null = null;

function currentIndex(): Map<string, IndexEntry> {
  const list = getStore().displays || [];
  const version = getDisplaysVersion();
  if (!indexKey || indexKey.version !== version || indexKey.list !== list) {
    const next = new Map<string, IndexEntry>();
    for (const d of list) {
      for (const r of d.retiredTokenHashes || []) next.set(r.hash, { displayId: d.id, live: false, until: Date.parse(r.until) });
      if (d.tokenHash && d.status === 'ACTIVE') next.set(d.tokenHash, { displayId: d.id, live: true });
    }
    index = next;
    indexKey = { version, list };
  }
  return index;
}

export type ScreenAuth =
  | { kind: 'OK'; display: LiveDisplay; hash: string }
  | { kind: 'OFF'; hash: string } // replaced or switched off (410)
  | { kind: 'UNKNOWN' }; // missing, malformed or never issued (401)

/** Resolves the x-display-token header. Never throws, never logs the token. */
export function resolveScreenToken(raw: unknown, now = Date.now()): ScreenAuth {
  if (typeof raw !== 'string' || !TOKEN_FORMAT.test(raw)) return { kind: 'UNKNOWN' };
  const hash = hashSecret(raw);
  const entry = currentIndex().get(hash);
  if (!entry) return { kind: 'UNKNOWN' };
  if (!entry.live) return entry.until !== undefined && entry.until > now ? { kind: 'OFF', hash } : { kind: 'UNKNOWN' };
  const display = (getStore().displays || []).find((d) => d.id === entry.displayId);
  if (!display || display.status !== 'ACTIVE' || display.tokenHash !== hash) return { kind: 'OFF', hash };
  return { kind: 'OK', display, hash };
}

function retireLive(display: LiveDisplay, now: number) {
  const keep = (display.retiredTokenHashes || []).filter((r) => Date.parse(r.until) > now);
  if (display.tokenHash) keep.push({ hash: display.tokenHash, until: new Date(now + RETIRED_KEEP_MS).toISOString() });
  display.retiredTokenHashes = keep;
}

// Displays whose first poll on a new credential should write DISPLAY_CONNECTED.
const awaitingFirstPoll = new Set<string>();
export const takeFirstPoll = (displayId: string): boolean => awaitingFirstPoll.delete(displayId);

/**
 * Issues a new credential (create, replace, pair). The previous one retires.
 * Returns the token, which the caller hands out once and never stores.
 */
export function issueDisplayToken(display: LiveDisplay, actor: string, now = Date.now()): string {
  const token = newDisplayToken();
  retireLive(display, now);
  display.tokenHash = hashSecret(token);
  display.tokenIssuedAt = new Date(now).toISOString();
  display.tokenIssuedBy = actor;
  display.updatedAt = display.tokenIssuedAt;
  display.updatedBy = actor;
  awaitingFirstPoll.add(display.id);
  saveDisplay(display);
  return token;
}

/** Final (03 gap 6): the credential retires, the display stays listed. */
export function switchOffDisplay(display: LiveDisplay, actor: string, now = Date.now()) {
  retireLive(display, now);
  display.tokenHash = null;
  display.status = 'SWITCHED_OFF';
  display.updatedAt = new Date(now).toISOString();
  display.updatedBy = actor;
  awaitingFirstPoll.delete(display.id);
  saveDisplay(display);
}
