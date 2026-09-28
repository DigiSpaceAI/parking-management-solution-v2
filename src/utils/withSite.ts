/**
 * Client site context (001 tech design F1).
 *
 * One place that knows which site the console is acting on, and whether a
 * Master Admin is viewing the console as another user. The global fetch
 * wrapper (sessionTokenFallback.ts) reads this store and attaches
 * `x-site-id` / `x-view-as` to every same-origin `/api/v1/*` call, so the
 * ~70 existing call sites need no edits. The server decides access
 * (resolveSite); this only says which of the caller's sites is wanted.
 *
 * The generation counter guards against stale responses: capture it before
 * an `await`, and drop the result if it changed (site switch, view-as
 * change, sign-in or sign-out happened while the request was in flight).
 */
import { createContext, useContext } from 'react';
import type { SiteConfig } from '../types';

export const ALL_SITES = 'ALL';

/** Fired by the fetch wrapper when the server says the session is over. */
export const SESSION_ENDED_EVENT = 'parkflows:session-ended';
export type SessionEndedReason = 'ERR_SESSION_EXPIRED' | 'ERR_ACCOUNT_INACTIVE';
export interface SessionEndedDetail {
  reason: SessionEndedReason;
}

interface SiteStore {
  siteId: string | null; // null = no site chosen yet
  viewAsId: string | null;
  generation: number;
}

const store: SiteStore = { siteId: null, viewAsId: null, generation: 0 };

export function getActiveSiteId(): string | null {
  return store.siteId;
}

export function getViewAsId(): string | null {
  return store.viewAsId;
}

export function getGeneration(): number {
  return store.generation;
}

/** True when a response started at `generation` may still be applied. */
export function isCurrentGeneration(generation: number): boolean {
  return generation === store.generation;
}

/** Invalidate every request in flight. Returns the new generation. */
export function bumpGeneration(): number {
  store.generation += 1;
  return store.generation;
}

/** Changes the active site and invalidates in-flight requests. */
export function setActiveSiteId(siteId: string | null): void {
  if (store.siteId === siteId) return;
  store.siteId = siteId;
  bumpGeneration();
}

/** Changes the view-as target (Master Admin only) and invalidates in-flight requests. */
export function setViewAsId(userId: string | null): void {
  if (store.viewAsId === userId) return;
  store.viewAsId = userId;
  bumpGeneration();
}

/** Clears everything (sign-out). */
export function resetSiteStore(): void {
  store.siteId = null;
  store.viewAsId = null;
  bumpGeneration();
}

/**
 * Explicit helper for call sites that want the site in the URL (e.g. a
 * download link). Never overrides a siteId already in the URL.
 */
export function withSite(url: string, siteId: string | null = store.siteId): string {
  if (!siteId || /[?&]siteId=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}siteId=${encodeURIComponent(siteId)}`;
}

/** Same-origin `/api/v1/*` check used by the fetch wrapper. */
export function isSameOriginApiCall(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/v1/');
  } catch {
    return false;
  }
}

// ---- Per-viewer conveniences in browser storage (validated on load) ----

const siteKey = (userId: string) => `parkflows.site.${userId}`;
const VIEW_AS_KEY = 'parkflows.viewAs';
const RETURN_TO_KEY = 'parkflows.returnTo';

export function rememberSite(userId: string, siteId: string): void {
  try {
    localStorage.setItem(siteKey(userId), siteId);
  } catch {
    /* storage unavailable: convenience only */
  }
}

export function recallSite(userId: string): string | null {
  try {
    return localStorage.getItem(siteKey(userId));
  } catch {
    return null;
  }
}

export function rememberViewAs(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(VIEW_AS_KEY, userId);
    else localStorage.removeItem(VIEW_AS_KEY);
  } catch {
    /* convenience only */
  }
}

export function recallViewAs(): string | null {
  try {
    return localStorage.getItem(VIEW_AS_KEY);
  } catch {
    return null;
  }
}

export interface ReturnTo {
  tab: string;
  siteId: string | null;
}

/** Where to go back to after the session ended and the user signs in again (AC-47). */
export function rememberReturnTo(value: ReturnTo): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, JSON.stringify(value));
  } catch {
    /* convenience only */
  }
}

export function takeReturnTo(): ReturnTo | null {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReturnTo>;
    return typeof parsed.tab === 'string'
      ? { tab: parsed.tab, siteId: typeof parsed.siteId === 'string' ? parsed.siteId : null }
      : null;
  } catch {
    return null;
  }
}

// ---- React context ----

export interface SiteContextValue {
  /** The chosen site id, 'ALL', or null when nothing is chosen yet. */
  siteId: string | null;
  /** The chosen site's config, when one single site is chosen. */
  activeSite: SiteConfig | null;
  /** The sites the (effective) user may choose from. */
  sites: SiteConfig[];
  isAllSites: boolean;
  /** A Master Admin is viewing the console as another user (read-only). */
  isViewAs: boolean;
  /** Writes are allowed: one site chosen and not viewing as someone else. */
  canWrite: boolean;
  /** Why writes are disabled, for a tooltip; null when canWrite. */
  writeDisabledReason: string | null;
  /** Site code for a record's siteId, for the chip shown in All sites mode. */
  siteCodeFor: (siteId: string | undefined) => string;
}

export const WRITE_DISABLED_ALL_SITES = 'Select one site to make changes';
export const WRITE_DISABLED_VIEW_AS = 'Read-only while viewing as another user';

export function buildSiteContextValue(
  siteId: string | null,
  sites: SiteConfig[],
  isViewAs: boolean
): SiteContextValue {
  const isAllSites = siteId === ALL_SITES;
  const activeSite = siteId && !isAllSites ? sites.find((s) => s.id === siteId) || null : null;
  const writeDisabledReason = isViewAs
    ? WRITE_DISABLED_VIEW_AS
    : !siteId || isAllSites
      ? WRITE_DISABLED_ALL_SITES
      : null;
  const byId = new Map(sites.map((s) => [s.id, s.siteCode]));
  return {
    siteId,
    activeSite,
    sites,
    isAllSites,
    isViewAs,
    canWrite: writeDisabledReason === null,
    writeDisabledReason,
    // Records without a siteId belong to the legacy default site.
    siteCodeFor: (id) => byId.get(id || 'site-default') || (id ? id.toUpperCase() : 'DEFAULT'),
  };
}

export const SiteContext = createContext<SiteContextValue>(buildSiteContextValue(null, [], false));

export function useSiteContext(): SiteContextValue {
  return useContext(SiteContext);
}
