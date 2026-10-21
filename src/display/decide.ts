/**
 * What the TV shows when several states apply at once (PRD AC-28; UX "Precedence"; 03 v1.2
 * "Precedence on the TV"). A pure function: tested on its own, and the console preview runs the
 * same code (it is the TV page), so the preview shows exactly what the TV shows (AC-29).
 *
 * Main view, first match wins:
 *   1 switched off / link not valid   2 full-screen message   3 closed (display hours)
 *   4 no slots selected   5 live status unavailable (> 120 s; under forced full: the forced-full
 *   look with the cards hidden)   6 forced Parking full   7 live slots
 * Overlays: the banner message on 5–7 (03 O-2: also over "unavailable"), and the stale banner
 * (> 30 s) on 6–7.
 */
import type { FeedMessage } from './types';
import { STALE_MS, UNAVAILABLE_MS } from './poll';
import { parseIso } from './time';

export type DecidedView =
  | 'PAIRING'
  | 'OFF'
  | 'INVALID'
  | 'TAKEOVER'
  | 'CLOSED'
  | 'EMPTY'
  | 'UNAVAILABLE'
  | 'FORCED_FULL'
  | 'STARTING'
  | 'LIVE';

export interface DecideInput {
  credential: 'NONE' | 'OK' | 'INVALID' | 'OFF';
  /** Server-offset now (ms). */
  now: number;
  /** Closed by display hours (the server's answer while current, the TV's own rule after). */
  closed: boolean;
  /** Monotonic ms since the last good response (since start when there was none). */
  lastOkAgeMs: number;
  /** null = no feed received yet. */
  feedState: 'OPEN' | 'CLOSED' | 'EMPTY' | null;
  /** The cached message and forced full (kept until their end time, even with no connection). */
  message: FeedMessage | null;
  forcedFull: { endsAt: string | null } | null;
}

export interface Decision {
  view: DecidedView;
  /** BANNER message to show as the teal strip, or null. */
  banner: FeedMessage | null;
  /** The FULL message (view TAKEOVER), or null. */
  takeover: FeedMessage | null;
  /** "Updating… last updated HH:mm" (no update for 30 s). */
  staleBanner: boolean;
  /** Forced full after 2 minutes without an update: the forced-full header stays, the cards go. */
  cardsHidden: boolean;
}

/** An override with no end time, or one that ends in the future, is in force. */
export function isActive(item: { endsAt: string | null } | null | undefined, now: number): boolean {
  if (!item) return false;
  if (item.endsAt === null || item.endsAt === undefined) return true;
  const end = parseIso(item.endsAt);
  return end === null ? true : end > now;
}

export function decideScreen(i: DecideInput): Decision {
  const d: Decision = { view: 'LIVE', banner: null, takeover: null, staleBanner: false, cardsHidden: false };
  const msg = isActive(i.message, i.now) ? i.message : null;
  const forced = isActive(i.forcedFull, i.now);
  const unavailable = i.lastOkAgeMs > UNAVAILABLE_MS;
  const stale = i.lastOkAgeMs > STALE_MS;

  if (i.credential === 'OFF') return set(d, 'OFF');
  if (i.credential === 'INVALID') return set(d, 'INVALID');
  if (i.credential === 'NONE') return set(d, 'PAIRING');
  if (msg && msg.mode === 'FULL') {
    d.takeover = msg;
    return set(d, 'TAKEOVER');
  }
  if (i.closed) return set(d, 'CLOSED');
  if (i.feedState === 'EMPTY') return set(d, 'EMPTY');
  const banner = msg && msg.mode === 'BANNER' ? msg : null;
  if (unavailable) {
    d.banner = banner;
    if (forced) {
      d.cardsHidden = true;
      return set(d, 'FORCED_FULL');
    }
    return set(d, 'UNAVAILABLE');
  }
  if (forced) {
    d.banner = banner;
    d.staleBanner = stale;
    return set(d, 'FORCED_FULL');
  }
  // No data yet (just started, or a CLOSED feed and the hours have just opened): wait for it.
  if (i.feedState === null || i.feedState === 'CLOSED') {
    d.banner = banner;
    return set(d, 'STARTING');
  }
  d.banner = banner;
  d.staleBanner = stale;
  return set(d, 'LIVE');
}

function set(d: Decision, view: DecidedView): Decision {
  d.view = view;
  return d;
}
