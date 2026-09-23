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
 * Call resolveSiteContext() once, right after login (see ParkFlowsApp.tsx)
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

export async function resolveSiteContext(user: AppUser, apiFetchFn: (path: string) => Promise<Response>): Promise<void> {
  try {
    const res = await apiFetchFn('/api/v1/my-sites');
    if (!res.ok) return;
    const data = await res.json();
    const sites = Array.isArray(data?.sites) ? data.sites : [];
    const primary = getUserPrimarySite(user, sites);
    if (primary) {
      setSiteId(primary.id);
      // Real, visible confirmation of which site an attendant is
      // working in matters — flagged directly by testing: with no site
      // name shown anywhere in the app, there was no way to actually
      // confirm which site a shift was scoped to just by looking at the
      // screen, even though the underlying data was correctly scoped.
      currentSiteName = primary.siteName || null;
    }
  } catch {
    // Non-fatal — requests simply fall back to the platform default site
    // if this fails, same as before this fix existed at all.
  }
}
