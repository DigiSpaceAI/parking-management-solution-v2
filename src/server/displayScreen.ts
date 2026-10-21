// 003 B3: what a screen sees, with the caches and last-seen bookkeeping
// (03 "Update mechanism", "Online / last seen"). In memory only, which is
// safe at max-instances=1 (risk K4).
import { LiveDisplay, DisplayFeed, ParkingSlot } from '../types';
import { getStore, getDisplaysVersion, getSlotsVersion, getSiteName, persistDisplayLastSeen, DEFAULT_SITE_ID } from './db';
import { selectedSlots, buildFeed, ONLINE_WINDOW_MS } from './displayFeed';

const FEED_CACHE_MS = 1000; // TVs that reconnect together share one build; can't push freshness past 5 s
const LAST_SEEN_PERSIST_MS = 10 * 60 * 1000;

// ---- selection cache: the Set of selected slot ids, rebuilt only when a
// display or the slots change (every slot write goes through saveDB, which
// bumps the slots version). Statuses are always read live.
const selectionCache = new Map<string, { key: string; ids: Set<string> }>();
let storeSlotsRef: unknown = null;
let storeEpoch = 0;
function cacheKey(): string {
  const slots = getStore().slots;
  if (slots !== storeSlotsRef) { storeSlotsRef = slots; storeEpoch++; }
  return `${storeEpoch}|${getDisplaysVersion()}|${getSlotsVersion()}`;
}
function selectedIds(display: LiveDisplay, key: string): Set<string> {
  const hit = selectionCache.get(display.id);
  if (hit && hit.key === key) return hit.ids;
  const siteSlots = getStore().slots.filter((s) => (s.siteId || DEFAULT_SITE_ID) === display.siteId);
  const ids = new Set(selectedSlots(display, siteSlots).map((s) => s.id));
  selectionCache.set(display.id, { key, ids });
  return ids;
}

// ---- overrides and slot rules: filled in by B7 (messages), B8 (forced full)
// and B9 (hide/pin). Registered here so the feed builder stays one function.
export type OverrideResolver = (display: LiveDisplay, nowMs: number) => DisplayFeed['override'];
let resolveOverride: OverrideResolver = () => ({ message: null, forcedFull: null });
export function setOverrideResolver(fn: OverrideResolver) { resolveOverride = fn; }

// ---- 1 s feed cache per display, keyed on the store version too, and
// dropped by every override write (invalidateFeeds) so a change shows on the
// next poll.
const feedCache = new Map<string, { atMs: number; key: string; feed: Omit<DisplayFeed, 'serverTime'> }>();
export function invalidateFeeds(displayIds?: string[]) {
  if (!displayIds) feedCache.clear();
  else for (const id of displayIds) feedCache.delete(id);
}

export function displayFeedFor(display: LiveDisplay, nowMs = Date.now()): DisplayFeed {
  const key = cacheKey();
  const hit = feedCache.get(display.id);
  if (hit && hit.key === key && nowMs - hit.atMs < FEED_CACHE_MS) return { ...hit.feed, serverTime: new Date(nowMs).toISOString() };
  const ids = selectedIds(display, key);
  const rules = display.slotRules;
  const hidden = new Set(rules?.hidden || []);
  const pinned = new Set(rules?.pinned || []);
  const slots: ParkingSlot[] = [];
  for (const s of getStore().slots) if (ids.has(s.id) && !hidden.has(s.id)) slots.push(s);
  const feed = buildFeed({ display, slots, pinned, siteName: getSiteName(display.siteId), override: resolveOverride(display, nowMs), nowMs });
  feedCache.set(display.id, { atMs: nowMs, key, feed });
  return { ...feed, serverTime: new Date(nowMs).toISOString() };
}

// ---- last seen: every successful feed poll (never the preview). Persisted at
// most every 10 min, and on the first poll after being offline.
const seen = new Map<string, number>();
const persistedAt = new Map<string, number>();
export function markSeen(display: LiveDisplay, nowMs = Date.now()) {
  const prev = seen.get(display.id) ?? (display.lastSeenAt ? Date.parse(display.lastSeenAt) : undefined);
  seen.set(display.id, nowMs);
  const wasOffline = prev === undefined || nowMs - prev > ONLINE_WINDOW_MS;
  const last = persistedAt.get(display.id);
  if (wasOffline || last === undefined || nowMs - last >= LAST_SEEN_PERSIST_MS) {
    persistedAt.set(display.id, nowMs);
    persistDisplayLastSeen(display, new Date(nowMs).toISOString());
  }
}
export function lastSeenIso(display: LiveDisplay): string | undefined {
  const m = seen.get(display.id);
  return m !== undefined ? new Date(m).toISOString() : display.lastSeenAt;
}
