// 003 B3: what a screen sees, with the caches and last-seen bookkeeping
// (03 "Update mechanism", "Online / last seen"). In memory only, which is
// safe at max-instances=1 (risk K4).
import { LiveDisplay, DisplayFeed, ParkingSlot } from '../types';
import { getStore, getDisplaysVersion, getSlotSetVersion, getSiteName, persistDisplaysLastSeen, DEFAULT_SITE_ID } from './db';
import { selectedSlots, buildFeed, feedResponseJson, sortByCode, ONLINE_WINDOW_MS } from './displayFeed';

const FEED_CACHE_MS = 1000; // TVs that reconnect together share one build; can't push freshness past 5 s
const LAST_SEEN_PERSIST_MS = 10 * 60 * 1000;

// ---- selection cache: the display's selected slot objects, rebuilt only when
// a display or the set of slots changes (slot save / migration bump the slot-set
// version; a delete or a store reload replaces the slots array). Entries, exits
// and status changes mutate those same objects in place, so statuses are read
// live on every build.
const selectionCache = new Map<string, { key: string; slots: ParkingSlot[] }>();
let storeSlotsRef: unknown = null;
let storeEpoch = 0;
function cacheKey(): string {
  const slots = getStore().slots;
  if (slots !== storeSlotsRef) { storeSlotsRef = slots; storeEpoch++; }
  return `${storeEpoch}|${getDisplaysVersion()}|${getSlotSetVersion()}`;
}
function selectedObjects(display: LiveDisplay, key: string): ParkingSlot[] {
  const hit = selectionCache.get(display.id);
  if (hit && hit.key === key) return hit.slots;
  const siteSlots = getStore().slots.filter((s) => (s.siteId || DEFAULT_SITE_ID) === display.siteId);
  const slots = sortByCode(selectedSlots(display, siteSlots)); // sorted once per membership change
  selectionCache.set(display.id, { key, slots });
  return slots;
}

// ---- overrides and slot rules: filled in by B7 (messages), B8 (forced full)
// and B9 (hide/pin). Registered here so the feed builder stays one function.
export type OverrideResolver = (display: LiveDisplay, nowMs: number) => DisplayFeed['override'];
let resolveOverride: OverrideResolver = () => ({ message: null, forcedFull: null });
export function setOverrideResolver(fn: OverrideResolver) { resolveOverride = fn; }

// ---- 1 s feed cache per display, keyed on the store version too, and
// dropped by every override write (invalidateFeeds) so a change shows on the
// next poll.
const feedCache = new Map<string, { atMs: number; key: string; feed: Omit<DisplayFeed, 'serverTime'>; json: string }>();
export function invalidateFeeds(displayIds?: string[]) {
  if (!displayIds) feedCache.clear();
  else for (const id of displayIds) feedCache.delete(id);
}

function cachedFeed(display: LiveDisplay, nowMs: number) {
  const key = cacheKey();
  const hit = feedCache.get(display.id);
  if (hit && hit.key === key && nowMs - hit.atMs < FEED_CACHE_MS) return hit;
  const rules = display.slotRules;
  const hidden = new Set(rules?.hidden || []);
  const pinned = new Set(rules?.pinned || []);
  const slots = selectedObjects(display, key).filter((s) => !hidden.has(s.id));
  const { feed, json } = buildFeed({ display, slots, pinned, siteName: getSiteName(display.siteId), override: resolveOverride(display, nowMs), nowMs });
  const entry = { atMs: nowMs, key, feed, json };
  feedCache.set(display.id, entry);
  return entry;
}

/** The feed as an object (console preview, tests). */
export function displayFeedFor(display: LiveDisplay, nowMs = Date.now()): DisplayFeed {
  return { ...cachedFeed(display, nowMs).feed, serverTime: new Date(nowMs).toISOString() };
}

/** What GET /screen/feed sends: the serialised feed, or the small "unchanged" answer. */
export function screenFeedResponse(display: LiveDisplay, lastV: unknown, nowMs = Date.now()): { v: string; state: string; body: string } {
  const c = cachedFeed(display, nowMs);
  const serverTime = new Date(nowMs).toISOString();
  if (typeof lastV === 'string' && lastV === c.feed.v) {
    return { v: c.feed.v, state: c.feed.state, body: JSON.stringify({ unchanged: true, v: c.feed.v, serverTime, state: c.feed.state }) };
  }
  return { v: c.feed.v, state: c.feed.state, body: feedResponseJson(c.feed.v, serverTime, c.json) };
}

// ---- last seen: every successful feed poll (never the preview). Persisted at
// most every 10 min, and on the first poll after being offline; due displays
// are written together, in one targeted save, at most once a second.
const LAST_SEEN_FLUSH_MS = 1000;
const seen = new Map<string, number>();
const persistedAt = new Map<string, number>();
const due = new Map<string, { display: LiveDisplay; iso: string }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function flushLastSeen() {
  flushTimer = null;
  const batch = [...due.values()];
  due.clear();
  persistDisplaysLastSeen(batch);
}
export function markSeen(display: LiveDisplay, nowMs = Date.now()) {
  const prev = seen.get(display.id) ?? (display.lastSeenAt ? Date.parse(display.lastSeenAt) : undefined);
  seen.set(display.id, nowMs);
  const wasOffline = prev === undefined || nowMs - prev > ONLINE_WINDOW_MS;
  const last = persistedAt.get(display.id);
  if (wasOffline || last === undefined || nowMs - last >= LAST_SEEN_PERSIST_MS) {
    persistedAt.set(display.id, nowMs);
    due.set(display.id, { display, iso: new Date(nowMs).toISOString() });
    if (!flushTimer) { flushTimer = setTimeout(flushLastSeen, LAST_SEEN_FLUSH_MS); flushTimer.unref?.(); }
  }
}
export function lastSeenIso(display: LiveDisplay): string | undefined {
  const m = seen.get(display.id);
  return m !== undefined ? new Date(m).toISOString() : display.lastSeenAt;
}
