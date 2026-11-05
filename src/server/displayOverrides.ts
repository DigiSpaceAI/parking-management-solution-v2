// 003 B7/B8: admin overrides (03-tech-design v1.2 "Admin overrides").
// Messages (US-15) are site-level records; forced full (US-16) sits on the
// display. Both expire on read (no timer): the first read that sees an end
// time passed records it and writes one audit entry. Every write drops the
// affected feeds' 1 s cache, so the next poll carries the change (<= 5 s).
import crypto from 'node:crypto';
import { DisplayMessage, LiveDisplay } from '../types';
import { getDisplays, getDisplayMessages, addDisplayMessage, saveDisplayMessages, pruneDisplayMessages, saveDisplay } from './db';
import { logSecurityEvent } from './security';
import { setOverrideResolver, invalidateFeeds } from './displayScreen';
// 07 S3-5: the hidden-character check lives in textSafety.ts (shared with the
// display location, S3-11); re-exported for server.ts.
import { hasHiddenFormatChars } from './textSafety';
export { hasHiddenFormatChars };

const MIN_AHEAD_MS = 60 * 1000;
const MAX_AHEAD_MS = 31 * 24 * 60 * 60 * 1000;
const IST_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?\+05:30$/;

// ---------------------------------------------------------------- validation
/** Plain text, control characters and line breaks removed, 1-140 chars; null if not text. */
export function cleanMessageText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
}


/**
 * End time picked in the console as an IST wall time with an explicit
 * +05:30 offset; stored as the instant. null = "when I clear it".
 */
export function parseEndsAt(raw: unknown, nowMs = Date.now()): { value?: string | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  if (typeof raw !== 'string' || !IST_ISO.test(raw) || Number.isNaN(Date.parse(raw))) return { error: 'Pick an end date and time in IST.' };
  const ms = Date.parse(raw);
  if (ms <= nowMs + MIN_AHEAD_MS) return { error: 'Pick an end time later than now.' };
  if (ms > nowMs + MAX_AHEAD_MS) return { error: 'Pick an end time within 31 days.' };
  return { value: new Date(ms).toISOString() };
}

// ---------------------------------------------------------------- messages
const activeDisplays = (siteId: string) => getDisplays(siteId).filter((d) => d.status === 'ACTIVE');
const targets = (m: DisplayMessage, displayId: string) =>
  ('all' in m.target ? true : m.target.displayIds.includes(displayId)) && !(m.clearedFor || []).includes(displayId);
export const isMessageActive = (m: DisplayMessage, nowMs: number) => !m.endedAt && (m.endsAt === null || Date.parse(m.endsAt) > nowMs);

/** The message a display shows: the newest active one that targets it and isn't cleared for it. */
export function messageFor(display: Pick<LiveDisplay, 'id' | 'siteId'>, nowMs: number): DisplayMessage | null {
  let best: DisplayMessage | null = null;
  for (const m of getDisplayMessages(display.siteId)) {
    if (!isMessageActive(m, nowMs) || !targets(m, display.id)) continue;
    if (!best || m.createdAt > best.createdAt || (m.createdAt === best.createdAt && m.id > best.id)) best = m;
  }
  return best;
}

/** Display ids (active displays of the site) on which `m` is what shows now. */
export function appliesTo(m: DisplayMessage, nowMs: number): string[] {
  if (!isMessageActive(m, nowMs)) return [];
  return activeDisplays(m.siteId).filter((d) => messageFor(d, nowMs)?.id === m.id).map((d) => d.id);
}

function auditSystem(action: string, siteId: string, target: string, details: string) {
  logSecurityEvent({ action, actor: 'SYSTEM', actorRole: 'SYSTEM', redactClient: true, targetResource: target, status: 'SUCCESS', details, siteId });
}

/** Lazy expiry: records the end of every message whose end time has passed (once). */
export function expireMessages(siteId: string, nowMs = Date.now()): number {
  const ended: DisplayMessage[] = [];
  for (const m of getDisplayMessages(siteId)) {
    if (!m.endedAt && m.endsAt !== null && Date.parse(m.endsAt) <= nowMs) {
      m.endedAt = m.endsAt;
      m.endReason = 'EXPIRED';
      ended.push(m);
    }
  }
  if (ended.length === 0) return 0;
  saveDisplayMessages(ended.map((m) => m.id));
  for (const m of ended) auditSystem('DISPLAY_MESSAGE_EXPIRED', siteId, `display-message/${m.id}`, `Display message ${m.id} ended at its end time.`);
  invalidateFeeds(getDisplays(siteId).map((d) => d.id));
  return ended.length;
}

export interface NewMessage { text: string; mode: 'BANNER' | 'FULL'; target: DisplayMessage['target']; endsAt: string | null }

/**
 * Creates a message. On every display it shares with an older active
 * message, the new one replaces the old one (for that display only); an
 * older message that then applies nowhere ends with REPLACED.
 */
export function createMessage(siteId: string, input: NewMessage, actor: string, nowMs = Date.now()): { message: DisplayMessage; replaced: DisplayMessage[] } {
  expireMessages(siteId, nowMs);
  const now = new Date(nowMs).toISOString();
  const message: DisplayMessage = {
    id: `dmsg-${crypto.randomBytes(8).toString('hex')}`,
    siteId,
    text: input.text,
    mode: input.mode,
    target: input.target,
    clearedFor: [],
    endsAt: input.endsAt,
    createdAt: now,
    createdBy: actor,
  };
  const changed: string[] = [message.id];
  const replaced: DisplayMessage[] = [];
  const shown = activeDisplays(siteId);
  for (const old of getDisplayMessages(siteId)) {
    if (!isMessageActive(old, nowMs)) continue;
    const shared = shown.filter((d) => targets(old, d.id) && targets(message, d.id)).map((d) => d.id);
    if (shared.length === 0) continue;
    old.clearedFor = Array.from(new Set([...(old.clearedFor || []), ...shared]));
    changed.push(old.id);
    if (!shown.some((d) => targets(old, d.id))) {
      old.endedAt = now;
      old.endedBy = actor;
      old.endReason = 'REPLACED';
      replaced.push(old);
    }
  }
  addDisplayMessage(message);
  saveDisplayMessages(changed);
  pruneDisplayMessages(siteId, nowMs);
  invalidateFeeds(shown.map((d) => d.id));
  return { message, replaced };
}

/** Clears a message everywhere, or on some displays (it ends when it applies nowhere). */
export function clearMessage(m: DisplayMessage, displayIds: string[] | null, actor: string, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString();
  if (!m.endedAt) {
    if (displayIds) m.clearedFor = Array.from(new Set([...(m.clearedFor || []), ...displayIds]));
    if (!displayIds || !activeDisplays(m.siteId).some((d) => targets(m, d.id))) {
      m.endedAt = now;
      m.endedBy = actor;
      m.endReason = 'CLEARED';
    }
    saveDisplayMessages([m.id]);
    pruneDisplayMessages(m.siteId, nowMs);
  }
  invalidateFeeds(getDisplays(m.siteId).map((d) => d.id));
}

// ---------------------------------------------------------------- forced full (B8, US-16)
/** Lazy expiry of forced full; true when it ended now (one audit, targeted write). */
export function expireForcedFull(display: LiveDisplay, nowMs = Date.now()): boolean {
  const f = display.forcedFull;
  if (!f || f.endsAt === null || Date.parse(f.endsAt) > nowMs) return false;
  display.forcedFull = null;
  saveDisplay(display);
  auditSystem('DISPLAY_FORCED_FULL_EXPIRED', display.siteId, `display/${display.id}`, `Display ${display.id}: forced "Parking full" ended at its end time.`);
  invalidateFeeds([display.id]);
  return true;
}

export function setForcedFull(display: LiveDisplay, endsAt: string | null, actor: string, nowMs = Date.now()) {
  display.forcedFull = { setAt: new Date(nowMs).toISOString(), setBy: actor, endsAt };
  display.updatedAt = display.forcedFull.setAt;
  display.updatedBy = actor;
  saveDisplay(display);
  invalidateFeeds([display.id]);
}

export function clearForcedFull(display: LiveDisplay, actor: string, nowMs = Date.now()): boolean {
  if (!display.forcedFull) return false;
  display.forcedFull = null;
  display.updatedAt = new Date(nowMs).toISOString();
  display.updatedBy = actor;
  saveDisplay(display);
  invalidateFeeds([display.id]);
  return true;
}

/**
 * The console's "Override active" summary for one display (C8, AC-29).
 * `by` is the admin's name: console only, never in the feed.
 */
export function overrideSummary(display: LiveDisplay, nameOf: (email: string) => string, nowMs = Date.now()) {
  expireMessages(display.siteId, nowMs);
  expireForcedFull(display, nowMs);
  const m = display.status === 'ACTIVE' ? messageFor(display, nowMs) : null;
  const f = display.forcedFull;
  const hidden = display.slotRules?.hidden.length || 0;
  const pinned = display.slotRules?.pinned.length || 0;
  if (!m && !f && hidden === 0 && pinned === 0) return null;
  return {
    ...(m ? { message: { id: m.id, mode: m.mode, text: m.text, by: nameOf(m.createdBy), until: m.endsAt } } : {}),
    ...(f ? { forcedFull: { by: nameOf(f.setBy), until: f.endsAt } } : {}),
    hidden,
    pinned,
  };
}

// ---------------------------------------------------------------- the feed hook
setOverrideResolver((display, nowMs) => {
  expireMessages(display.siteId, nowMs);
  expireForcedFull(display, nowMs);
  const m = messageFor(display, nowMs);
  return {
    message: m ? { id: m.id, text: m.text, mode: m.mode, endsAt: m.endsAt } : null,
    forcedFull: display.forcedFull ? { endsAt: display.forcedFull.endsAt } : null,
  };
});
