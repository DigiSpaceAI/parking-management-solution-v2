/**
 * Polling rules (03 "Update mechanism", "Stale rules"), as pure functions so they can be tested.
 *
 * - every 3 s ± 300 ms while open; every 30 s while closed;
 * - 503 / 429 / network error / timeout: retry at 3 s, doubling, capped at 15 s, so the TV
 *   recovers within a minute of the server coming back (AC-16);
 * - 401 (link not valid) and 410 (switched off): stop polling.
 */

export const POLL_MS = 3000;
export const POLL_JITTER_MS = 300;
export const CLOSED_POLL_MS = 30000;
export const BACKOFF_MAX_MS = 15000;
export const REQUEST_TIMEOUT_MS = 10000;

/** No update for this long: "Updating… last updated HH:mm" (AC-15). */
export const STALE_MS = 30000;
/** No update for this long: slot list hidden, "Live status unavailable" (AC-15). */
export const UNAVAILABLE_MS = 120000;

export type PollOutcome =
  | { kind: 'ok'; closed: boolean }
  | { kind: 'retry' } // 503, 429, network error, timeout, unreadable body
  | { kind: 'stop'; reason: 'INVALID' | 'OFF' }; // 401, 410

/** HTTP status → outcome. `closed` comes from the body of a 200. */
export function outcomeOf(status: number, closed: boolean): PollOutcome {
  if (status === 200) return { kind: 'ok', closed: closed };
  if (status === 401) return { kind: 'stop', reason: 'INVALID' };
  if (status === 410) return { kind: 'stop', reason: 'OFF' };
  return { kind: 'retry' };
}

/**
 * Delay before the next poll, or null to stop. `failures` = consecutive retry outcomes, this one
 * included. `random` in [0, 1).
 */
export function nextDelayMs(outcome: PollOutcome, failures: number, random: number): number | null {
  if (outcome.kind === 'stop') return null;
  if (outcome.kind === 'ok') {
    if (outcome.closed) return CLOSED_POLL_MS;
    return Math.round(POLL_MS - POLL_JITTER_MS + random * 2 * POLL_JITTER_MS);
  }
  const n = Math.max(1, failures);
  return Math.min(BACKOFF_MAX_MS, POLL_MS * Math.pow(2, n - 1));
}

export type Freshness = 'LIVE' | 'STALE' | 'UNAVAILABLE';

/** Age of the last good response (monotonic ms) → what the TV may show. No response yet = UNAVAILABLE only after 120 s of trying. */
export function freshness(ageMs: number): Freshness {
  if (ageMs > UNAVAILABLE_MS) return 'UNAVAILABLE';
  if (ageMs > STALE_MS) return 'STALE';
  return 'LIVE';
}
