import type { AppUser } from '../types';
import { getUserPrimarySite } from '../utils/rbac';

/**
 * Site context for the attendant mobile app. The backend now actually
 * enforces the x-site-id header set here (see resolveRequestSiteId in
 * src/server/security.ts) on the slots list and every vehicle
 * entry/exit — previously the header was sent but nothing on the server
 * read it, so every attendant transacted against one shared global slot
 * pool regardless of which real site they were assigned to.
 *
 * Call resolveSiteContext() right after login (see ParkFlowsApp.tsx)
 * — it fetches the sites this attendant is actually permitted to see
 * (GET /api/v1/my-sites — a permission-light endpoint, unlike
 * /api/v1/sites which requires the MASTER_CONFIG module an attendant
 * never has, and would 403 for them) and picks their primary assigned
 * site. getSiteId() is then read by apiFetch() to inject the header on
 * every subsequent request, the same centralizing pattern apiFetch
 * already uses for the base URL and timeout handling.
 */

let currentSiteId: string | null = null;
let currentSiteName: string | null = null;

export function getSiteId(): string | null {
  return currentSiteId;
}

export function getSiteName(): string | null {
  return currentSiteName;
}

export function setSiteId(siteId: string | null): void {
  currentSiteId = siteId;
}

export function clearSiteContext(): void {
  currentSiteId = null;
  currentSiteName = null;
}

/**
 * Outcome of resolving the attendant's site (001 design M1).
 * - `ok`: a site was chosen; apiFetch() now sends it as x-site-id.
 * - `no-site`: /my-sites answered, but this user has no permitted site.
 * - `error`: /my-sites failed (network, timeout, 5xx, bad JSON).
 * - `session-expired`: /my-sites returned 401; the caller should go back
 *   to sign-in rather than offer Try again.
 * Anything other than `ok` leaves the site context cleared. The server
 * rejects site-scoped calls without a site (strict mode, 400 "Choose a
 * site first."), so the app must not let the attendant reach the gate.
 */
export type SiteResolveResult =
  | { status: 'ok'; siteId: string; siteName: string | null }
  | { status: 'no-site' }
  | { status: 'error' }
  | { status: 'session-expired' };

export async function resolveSiteContext(
  user: AppUser,
  apiFetchFn: (path: string) => Promise<Response>
): Promise<SiteResolveResult> {
  clearSiteContext();
  try {
    const res = await apiFetchFn('/api/v1/my-sites');
    if (res.status === 401) return { status: 'session-expired' };
    if (!res.ok) return { status: 'error' };
    const data = await res.json();
    const sites = Array.isArray(data?.sites) ? data.sites : [];
    const primary = getUserPrimarySite(user, sites);
    if (!primary || !primary.id) return { status: 'no-site' };
    setSiteId(primary.id);
    // Shown in the header so the attendant can confirm which site the
    // shift is scoped to.
    currentSiteName = primary.siteName || null;
    return { status: 'ok', siteId: primary.id, siteName: currentSiteName };
  } catch {
    // Network failure, timeout (apiFetch aborts after 15 s) or bad JSON.
    // No fallback site: the caller shows the blocking screen.
    clearSiteContext();
    return { status: 'error' };
  }
}
