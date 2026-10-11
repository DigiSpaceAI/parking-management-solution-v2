/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { ParkingSlot, ParkingLog, SlotStatus, VehicleType, EntryType, AppUser, RolePermissionConfig, SiteConfig } from './types';
import { clearSessionToken } from './sessionTokenFallback';
import { AppShell } from './screens/AppShell';
import { useToast, ErrorState, EmptyState, PageHeader, type NavGroup } from './design-system/components';
import { useAutoRefresh } from './utils/useAutoRefresh';
import { LiveParking } from './screens/LiveParking';
import { Overview } from './screens/Overview';
import { SiteAdminReports } from './components/SiteAdminReports';
import { AnalyticsPredictive } from './components/AnalyticsPredictive';
import { InventoryMaster } from './components/InventoryMaster';
import { ParkingLogs } from './components/ParkingLogs';
import { NonParkedAlerts } from './components/NonParkedAlerts';
// The design-system preview is loaded only when a Master opens #/design-system (dev/staging).
const DesignSystemPreview = lazy(() => import('./design-system/preview/DesignSystemPreview'));
import { Employees } from './screens/Employees';
import { MasterAdminSites } from './components/MasterAdminSites';
import { MasterAdminBilling } from './components/MasterAdminBilling';
import { ValetXModule } from './components/ValetXModule';
import { UserManagementModule } from './components/UserManagementModule';
import { MasterAdminAudit } from './components/MasterAdminAudit';
import { MasterAdminData } from './components/MasterAdminData';
import { Login } from './screens/Login';
import { isMasterAdmin, getModuleRights, canOpenTab } from './utils/rbac';
import {
  ALL_SITES,
  SiteContext,
  buildSiteContextValue,
  getGeneration,
  getActiveSiteId,
  isCurrentGeneration,
  bumpGeneration,
  setActiveSiteId,
  resetSiteStore,
  rememberSite,
  recallSite,
  rememberReturnTo,
  takeReturnTo,
  setViewAsId,
  rememberViewAs,
  recallViewAs,
  saveErrorMessage,
  COPY_SAVE_ERROR,
  COPY_SESSION_ENDED,
  COPY_SUSPENDED,
  SESSION_ENDED_EVENT,
  type SessionEndedDetail,
} from './utils/withSite';
import { ChooseSitePrompt, NoAccessPage, NoSitePage, PageSkeleton } from './screens/shell/States';
import { ROUTES, NAV_GROUPS, canOpenRoute, hrefFor, landingRoute, parseHash, replaceRoute, routeById, type RouteId } from './routes';

const SESSION_STORAGE_KEY = 'parkflow_authenticated_user_session_v4';
const LEGACY_SESSION_STORAGE_KEY = 'parkorbit_authenticated_user_session_v4';
const LEGACY_SESSION_STORAGE_KEY_V3 = 'pm_authenticated_user_session_v4';

// Employee sign-in (LoginScreen) opens the Employee app preview only; it has
// no console session, so no site resolution or admin list calls (05 Minor).
// Real Employee login is Phase 2 (P2-7).
const isEmployeeUser = (u: AppUser | null) => u?.roleId === 'role-employee-pass';

/** Where the console is in resolving the user's site (001 design F2). */
type SitePhase = 'resolving' | 'ready' | 'no-site' | 'error';

interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

async function getJson<T>(url: string): Promise<ApiResult<T>> {
  const res = await fetch(url);
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export default function App() {
  // The page, from the URL hash (#/live-parking); null = the user's landing page (AC-10).
  const [route, setRoute] = useState<string | null>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  /** Back to the landing page (no history entry). */
  const goLanding = () => {
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(window.history.state, '', url);
    setRoute(null);
  };
  const goRoute = (id: string | null) => {
    if (id && routeById(id)) replaceRoute(id as RouteId);
    else goLanding();
  };
  // False until /rbac/roles has answered (the landing page depends on the role's modules).
  const [rolesReady, setRolesReady] = useState<boolean>(false);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [logs, setLogs] = useState<ParkingLog[]>([]);
  const [roles, setRoles] = useState<RolePermissionConfig[]>([]);
  // Sites the signed-in user may choose from (/my-sites; already scoped by the server).
  const [sites, setSites] = useState<SiteConfig[]>([]);
  // null = no site chosen yet: nothing site-scoped is fetched (strict siteId, AC-02).
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(null);
  const [sitePhase, setSitePhase] = useState<SitePhase>('resolving');
  // True from a site switch until that site's lists arrive (L-2 skeletons).
  const [listsLoading, setListsLoading] = useState<boolean>(false);
  const currentSiteIdRef = useRef<string | null>(null);
  // A site list failed to load (network / server error): error card + Try again (L-6).
  const [listError, setListError] = useState<boolean>(false);
  // Shown on the sign-in screen after the server ended the session (AC-45, AC-10).
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  // Role View Simulator (AC-55): a Master Admin viewing the console as this
  // user. Server-enforced and read-only (x-view-as, sent by the fetch wrapper).
  const [viewAsUser, setViewAsUser] = useState<AppUser | null>(null);
  // False until a view-as remembered from before a reload has been checked.
  const [viewAsChecked, setViewAsChecked] = useState<boolean>(() => !recallViewAs());
  // The Master Admin's own page and site, restored by Exit view.
  const beforeViewAs = useRef<{ tab: string | null; siteId: string | null } | null>(null);
  // Bumped by "Try again" when the site list couldn't load.
  const [siteResolveAttempt, setSiteResolveAttempt] = useState<number>(0);
  const [alertCount, setAlertCount] = useState<number>(0);
  const [pendingReqCount, setPendingReqCount] = useState<number>(0);

  // RBAC User Session state
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved =
        localStorage.getItem(SESSION_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_SESSION_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_SESSION_STORAGE_KEY_V3);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved user session:', e);
    }
    return null;
  });

  const toast = useToast();

  // Real, confirmed bug fixed here: currentUser above is restored
  // directly from localStorage with zero server-side verification —
  // meaning a stale cached session (e.g. from before a backend
  // restart, since sessions are stored in-memory only and a restart
  // invalidates all of them) silently renders the authenticated shell
  // while every actual API call then fails, with nothing telling the
  // user why or bouncing them back to login. Confirmed live: a normal
  // browser tab kept failing to load users with no clear reason, while
  // a fresh tab (no stale localStorage) worked immediately — that's
  // exactly this bug. This verifies the restored session against the
  // server once, on mount, and silently clears it on failure so the
  // login screen renders correctly instead of a broken "logged in"
  // shell. Runs only when there was a cached session to verify in the
  // first place — a fresh, unauthenticated load has nothing to check.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (!res.ok && !cancelled) {
          setCurrentUser(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
          localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
          localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY_V3);
          clearSessionToken();
        }
      } catch {
        // Network failure here isn't itself proof the session is
        // invalid — leave the cached state alone rather than log
        // someone out just because one verification request failed to
        // reach the server.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refreshes the signed-in user's own record. /auth/me always answers for
  // the real account (the server ignores view-as on /auth/*). Results from an
  // older session generation are dropped, so a slow response can never sign
  // the previous user back in after a sign-out (05 Major).
  const fetchCurrentUser = async () => {
    const generation = getGeneration();
    try {
      const { ok, body } = await getJson<{ success: boolean; user?: AppUser }>('/api/v1/auth/me');
      if (!ok || !body?.user || !isCurrentGeneration(generation)) return;
      const fresh = body.user;
      setCurrentUser((prev) => {
        if (!prev || prev.id !== fresh.id) return prev;
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fresh));
        } catch (e) {}
        return fresh;
      });
    } catch (err) {
      console.error('Failed to refresh the signed-in user:', err);
    }
  };

  const fetchRoles = async () => {
    const generation = getGeneration();
    try {
      const { body } = await getJson<{ success: boolean; roles?: RolePermissionConfig[] }>('/api/v1/rbac/roles');
      if (!isCurrentGeneration(generation)) return;
      if (body?.success && body.roles && body.roles.length > 0) {
        setRoles(body.roles);
      }
      setRolesReady(true);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
      if (isCurrentGeneration(generation)) setRolesReady(true);
    }
  };

  // The page in the URL (a deep link) is kept through sign-in.
  const handleLoginSuccess = (user: AppUser) => {
    setLoginNotice(null);
    setCurrentUser(user);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to persist session:', e);
    }

    showToast('success', `Signed in as ${user.fullName} (${user.roleName})`);
    // Data loads from the effect keyed on the user's id (site resolution),
    // not from this closure, so it always runs with the new session.
  };

  const clearSession = (opts: { notice?: string }) => {
    // Invalidate every request still in flight before clearing state, so
    // none of them can write the previous user's data back (05 Major).
    resetSiteStore();
    // Ask the server to destroy the session too (it accepts cookie, bearer
    // or x-session-token). Fire-and-forget: signing out locally never waits.
    fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    setLoginNotice(opts.notice ?? null);
    setListError(false);
    rememberViewAs(null);
    setViewAsUser(null);
    setViewAsChecked(true);
    beforeViewAs.current = null;
    setCurrentUser(null);
    // Drop the previous user's data and site context so the next person
    // to sign in never sees it, even briefly.
    setSlots([]);
    setLogs([]);
    setRoles([]);
    setRolesReady(false);
    setSites([]);
    setAlertCount(0);
    setPendingReqCount(0);
    setCurrentSiteId(null);
    currentSiteIdRef.current = null;
    setSitePhase('resolving');
    setListsLoading(false);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove session:', e);
    }
    clearSessionToken();
    if (!opts.notice) showToast('success', 'You have been signed out successfully.');
  };

  const handleLogout = () => clearSession({});

  const showToast = (type: 'success' | 'error', message: string) => {
    toast.show({ tone: type, message });
  };

  // Site-scoped lists. The fetch wrapper adds x-site-id for the active site.
  // Each result is applied only if no site switch, view-as change or
  // sign-out happened while it was in flight.
  const loadSiteLists = async (isCurrent: () => boolean): Promise<boolean> => {
    // Only what the open page needs (NFR-3): the badge counts always, the slot list
    // for the R1.1 pages that take it as a prop, the log list for the log page.
    const skip = <T,>(): Promise<ApiResult<T>> => Promise.resolve({ ok: true, status: 200, body: null });
    const page = routeRef.current;
    const [slotsRes, logsRes, alertsRes, regsRes] = await Promise.allSettled([
      page === 'inventory' ? getJson<{ slots?: ParkingSlot[] }>('/api/v1/slots') : skip<{ slots?: ParkingSlot[] }>(),
      page === 'logs' ? getJson<{ logs?: ParkingLog[] }>('/api/v1/logs') : skip<{ logs?: ParkingLog[] }>(),
      getJson<{ totalAlerts?: number }>('/api/v1/alerts/non-parked'),
      getJson<{ pendingCount?: number }>('/api/v1/registrations'),
    ]);
    if (!isCurrent()) return false;

    const value = <T,>(r: PromiseSettledResult<ApiResult<T>>): T | null =>
      r.status === 'fulfilled' && r.value.ok ? r.value.body : null;
    const all = [slotsRes, logsRes, alertsRes, regsRes];
    // 403 for a module the role lacks is normal (that list stays empty); a
    // network failure or a server error is not.
    const failed = all.some((r) => r.status === 'rejected' || r.value.status >= 500);
    const siteForbidden = all.some(
      (r) =>
        r.status === 'fulfilled' &&
        (r.value.body as { errorCode?: string } | null)?.errorCode === 'ERR_SITE_FORBIDDEN'
    );
    if (siteForbidden) {
      // The site is no longer one of the user's (assignment changed): resolve again.
      setSiteResolveAttempt((n) => n + 1);
      return false;
    }
    setListError(failed);
    if (failed && !listsLoading && slots.length + logs.length > 0) {
      // Keep the last good rows (shown greyed out under the error card).
      setListsLoading(false);
      return false;
    }

    setSlots(value(slotsRes)?.slots || []);
    setLogs(value(logsRes)?.logs || []);
    setAlertCount(value(alertsRes)?.totalAlerts || 0);
    setPendingReqCount(value(regsRes)?.pendingCount || 0);
    setListsLoading(false);
    return !failed;
  };

  // One refresh mechanism (AC-11): the chosen site's lists load now and every 15 s
  // while the tab is visible ("Updated Xs ago"); a site switch starts over.
  const listsActive = !!currentUser && !!currentSiteId && !isEmployeeUser(currentUser);
  const routeRef = useRef<string | null>(route);
  routeRef.current = route;
  // The page decides which lists load, so a page change loads afresh.
  const listsKey = route === 'inventory' ? 'slots' : route === 'logs' ? 'logs' : 'counts';
  const lists = useAutoRefresh(loadSiteLists, [currentUser?.id, currentSiteId, viewAsUser?.id, listsKey], { enabled: listsActive });

  const refreshAll = () => {
    if (!currentUser || isEmployeeUser(currentUser)) return;
    fetchCurrentUser();
    fetchRoles();
    if (currentSiteId) void lists.refresh();
  };

  // Switches the active site: invalidate in-flight requests, clear the old
  // site's lists straight away and show skeletons until the new ones arrive
  // (L-2, AC-04). Data loads from the effect below.
  const selectSite = useCallback(
    (siteId: string | null) => {
      // Re-selecting the active site is a no-op (nothing would reload the lists).
      if (siteId === getActiveSiteId() && siteId === currentSiteIdRef.current) return;
      setActiveSiteId(siteId);
      currentSiteIdRef.current = siteId;
      setCurrentSiteId(siteId);
      setSlots([]);
        setLogs([]);
      setAlertCount(0);
      setPendingReqCount(0);
      setListsLoading(!!siteId);
      if (siteId && currentUser && !viewAsIdRef.current) rememberSite(currentUser.id, siteId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.id]
  );

  const viewAsIdRef = useRef<string | null>(null);
  viewAsIdRef.current = viewAsUser?.id ?? null;

  // Start viewing as another user (Master Admin only; the server checks too).
  const startViewAs = (target: AppUser) => {
    if (!isMasterAdmin(currentUser) || target.id === currentUser?.id) return;
    if (!viewAsUser) beforeViewAs.current = { tab: route, siteId: currentSiteId };
    selectSite(null);
    setViewAsId(target.id);
    rememberViewAs(target.id);
    setViewAsUser(target);
    goLanding();
  };

  // Exit view: back to the Master Admin's own profile, page and site in one click.
  const exitViewAs = () => {
    const back = beforeViewAs.current;
    beforeViewAs.current = null;
    selectSite(null);
    setViewAsId(null);
    rememberViewAs(null);
    setViewAsUser(null);
    restoreAfterViewAs.current = back;
    goRoute(back?.tab ?? null);
  };
  const restoreAfterViewAs = useRef<{ tab: string | null; siteId: string | null } | null>(null);

  // After a reload, pick the remembered view-as back up, but only for a
  // Master Admin and only if that user still exists (validated server-side).
  useEffect(() => {
    if (viewAsChecked || !currentUser) return;
    const targetId = recallViewAs();
    if (!targetId || !isMasterAdmin(currentUser) || isEmployeeUser(currentUser)) {
      rememberViewAs(null);
      setViewAsChecked(true);
      return;
    }
    (async () => {
      try {
        const { ok, body } = await getJson<{ users?: AppUser[] }>('/api/v1/rbac/users');
        const target = ok ? body?.users?.find((u) => u.id === targetId) : undefined;
        if (target) {
          setViewAsId(target.id);
          setViewAsUser(target);
        } else {
          rememberViewAs(null);
          showToast('error', "Couldn't start the view. Try again.");
        }
      } catch {
        rememberViewAs(null);
        showToast('error', "Couldn't start the view. Try again.");
      } finally {
        setViewAsChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, viewAsChecked]);

  // Resolve the user's permitted sites once per signed-in user (AC-44, AC-47):
  //  0 sites        → S-0 "No site assigned" (a Master Admin can still choose All sites)
  //  1 site         → selected automatically
  //  2+ or Master   → the remembered site if still permitted, else "Choose a site"
  useEffect(() => {
    if (!currentUser || isEmployeeUser(currentUser) || !viewAsChecked) return;
    const userId = currentUser.id;
    // Under view-as the server answers /my-sites for the viewed user.
    const viewing = viewAsUser;
    const master = isMasterAdmin(viewing ?? currentUser);
    const generation = bumpGeneration();
    setSitePhase('resolving');
    fetchRoles();
    (async () => {
      try {
        const { ok, status, body } = await getJson<{ sites?: SiteConfig[] }>('/api/v1/my-sites');
        if (!isCurrentGeneration(generation)) return;
        if (!ok && viewing && status === 404) {
          // The viewed user no longer exists.
          showToast('error', "Couldn't start the view. Try again.");
          exitViewAs();
          return;
        }
        if (!ok) {
          setSitePhase('error');
          return;
        }
        const permitted = body?.sites || [];
        setSites(permitted);
        if (permitted.length === 0 && !master) {
          selectSite(null);
          setSitePhase('no-site');
          return;
        }
        if (viewing) {
          // View-as: the viewed user's only site, else let the Master Admin choose.
          selectSite(permitted.length === 1 && !master ? permitted[0].id : null);
          setSitePhase('ready');
          return;
        }
        // After a session ended, return to the same page and site (AC-47);
        // after Exit view, to the Master Admin's own site.
        const back = takeReturnTo();
        const returnTo = back && back.userId === userId ? back : null;
        const afterView = restoreAfterViewAs.current;
        restoreAfterViewAs.current = null;
        const remembered = returnTo?.siteId || afterView?.siteId || recallSite(userId);
        let next: string | null = null;
        if (!master && permitted.length === 1) next = permitted[0].id;
        else if (remembered === ALL_SITES && master) next = ALL_SITES;
        else if (remembered && permitted.some((s) => s.id === remembered)) next = remembered;
        // An unpermitted tab shows S-NA, so restoring it is safe.
        if (returnTo) goRoute(returnTo.tab);
        selectSite(next);
        setSitePhase('ready');
      } catch {
        if (isCurrentGeneration(generation)) setSitePhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, siteResolveAttempt, viewAsChecked, viewAsUser?.id]);

  // The server ended the session (expired, or the account was suspended):
  // remember where the user was, send them to sign-in with a notice, and
  // bring them back to the same page and site afterwards (AC-45, AC-47, AC-10).
  const latestNav = useRef<{ tab: string | null; siteId: string | null; userId: string | null }>({
    tab: null,
    siteId: null,
    userId: null,
  });
  latestNav.current = { tab: route, siteId: currentSiteId, userId: currentUser?.id ?? null };
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;
  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const { reason } = (event as CustomEvent<SessionEndedDetail>).detail;
      const nav = latestNav.current;
      if (!nav.userId) return; // already signed out
      rememberReturnTo({ tab: nav.tab ?? '', siteId: nav.siteId, userId: nav.userId });
      latestNav.current = { ...nav, userId: null };
      clearSessionRef.current({ notice: reason === 'ERR_ACCOUNT_INACTIVE' ? COPY_SUSPENDED : COPY_SESSION_ENDED });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  // Same role check used in the bolaIdentityGuard security fix, kept
  // consistent — a real Site Admin, matched by roleId first (stable)
  // with roleName as a fallback (matches the display name shown
  // throughout the UI).
  // Under view-as, the console renders as the viewed user (modules, sites, home).
  const uiUser = viewAsUser ?? currentUser;
  const isSiteAdmin =
    uiUser?.roleId === 'role-site-manager' || uiUser?.roleName === 'Site Facility Manager';

  const handleVehicleEntry = async (
    vehicleNumber: string,
    vehicleType?: VehicleType,
    entryType: EntryType = 'MANUAL',
    targetSlotNumber?: string
  ) => {
    try {
      const res = await fetch('/api/v1/vehicles/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumber, vehicleType, entryType, targetSlotNumber }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        refreshAll();
      } else {
        showToast('error', saveErrorMessage(data));
      }
    } catch {
      showToast('error', COPY_SAVE_ERROR);
    }
  };

  const handleVehicleExit = async (vehicleNumberOrSlot: string) => {
    try {
      const res = await fetch('/api/v1/vehicles/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumberOrSlot }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        refreshAll();
      } else {
        showToast('error', saveErrorMessage(data));
      }
    } catch {
      showToast('error', COPY_SAVE_ERROR);
    }
  };

  const handleUpdateSlotStatus = async (slotId: string, newStatus: SlotStatus) => {
    try {
      const res = await fetch('/api/v1/slots/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        refreshAll();
      } else {
        showToast('error', saveErrorMessage(data));
      }
    } catch {
      showToast('error', COPY_SAVE_ERROR);
    }
  };

  if (!currentUser) {
    return (
      <Login notice={loginNotice} onLoginSuccess={handleLoginSuccess} />
    );
  }

  // The Employee app preview has no console session (see isEmployeeUser).
  const needsSite = !isEmployeeUser(currentUser);

  if (needsSite && sitePhase === 'no-site' && !viewAsUser) {
    return <NoSitePage onSignOut={handleLogout} />;
  }

  const viewer = uiUser ?? currentUser;
  const baseSiteContext = buildSiteContextValue(currentSiteId, sites, !!viewAsUser, isMasterAdmin(viewer));
  // The Employee app preview has no site context; its own flows stay writable.
  const siteContextValue = needsSite
    ? baseSiteContext
    : { ...baseSiteContext, canWrite: true, writeDisabledReason: null };
  const currentRole = roles.find((r) => r.id === viewer.roleId);
  const canManageDomains = getModuleRights(viewer, currentRole, 'REGISTRATION').canEdit;

  const viewSiteLabel = siteContextValue.isAllSites
    ? 'All sites'
    : siteContextValue.activeSite?.siteName || 'No site chosen';
  const isMasterViewer = isMasterAdmin(viewer);
  const oneSite = !!currentSiteId && currentSiteId !== ALL_SITES;
  const landing = landingRoute(viewer, currentRole, oneSite);
  const def = routeById(route);
  const allowed = !!def && canOpenRoute(viewer, currentRole, def);
  // Platform pages (Master's Sites, Billing, Audit log, Settings) need no site chosen.
  const platformPage = allowed && !!def?.platform;
  const currentId = route ?? landing;

  // siteId is the chosen site or 'ALL'. A page the role can't open (deep link,
  // stale link, role changed) or an unknown one shows "No access" inside the
  // shell (L-5, AC-08); the server enforces the same rules.
  const renderRoute = (siteId: string) => {
    if (!def || !allowed) {
      const home = landing ? routeById(landing) : undefined;
      return <NoAccessPage homeHref={home ? hrefFor(home.id) : null} homeLabel={home?.title ?? null} />;
    }
    // R1.1 screens get the page template's header now (AC-09); their insides are restyled in R1.1.
    const wrap = (body: React.ReactNode, extra?: { updatedAt?: number | null; primary?: React.ReactNode }) => (
      <>
        <PageHeader title={def.title} description={def.description} updatedAt={extra?.updatedAt} primary={extra?.primary} />
        {body}
      </>
    );
    const listsPending = lists.loading && !lists.updatedAt;
    switch (def.id) {
      case 'overview':
        return siteId === ALL_SITES
          ? wrap(<EmptyState title="Choose one site to see its overview" text="The overview covers one site at a time. Pick a site from the switcher in the top bar." />)
          : <Overview siteId={siteId} canOpen={(id) => canOpenRoute(viewer, currentRole, routeById(id))} />;
      case 'live-parking':
        return <LiveParking siteId={siteId} onChanged={() => void lists.refresh()} />;
      case 'logs':
        return wrap(
          listsPending ? <PageSkeleton /> : <ParkingLogs logs={logs} onVehicleEntry={handleVehicleEntry} onVehicleExit={handleVehicleExit} onRefresh={refreshAll} />,
          { updatedAt: lists.updatedAt }
        );
      case 'alerts':
        return wrap(<NonParkedAlerts onRefresh={refreshAll} />);
      case 'reports': {
        const predictive = routeById('predictive');
        const primary = canOpenRoute(viewer, currentRole, predictive) ? (
          <a className="pf-link" href={hrefFor('predictive')}>
            Predictive analytics (sample data)
          </a>
        ) : undefined;
        return wrap(
          siteId !== ALL_SITES ? <SiteAdminReports siteId={siteId} /> : <EmptyState title="Choose one site to see its reports" text="Reports cover one site at a time. Pick a site from the switcher in the top bar." />,
          { primary }
        );
      }
      case 'predictive':
        return wrap(<AnalyticsPredictive />);
      case 'valet':
        return wrap(<ValetXModule />);
      case 'employees': {
        // One route for Registration and Approvals (AC-11); each tab and action follows its own module's rights.
        const rights = (m: string) => {
          const r = getModuleRights(viewer, currentRole, m);
          return { view: userCanOpenModule(m), create: r.canCreate, edit: r.canEdit };
        };
        return <Employees siteId={siteId} approvals={rights('APPROVALS')} registration={rights('REGISTRATION')} onChanged={() => void lists.refresh()} />;
      }
      case 'users':
        return wrap(<UserManagementModule currentUser={currentUser} isMaster={isMasterViewer} onSelectSimulatedUser={(u) => startViewAs(u)} onRefreshAll={refreshAll} />);
      case 'inventory':
        return wrap(
          listsPending ? <PageSkeleton /> : (
            <InventoryMaster slots={slots} onUpdateSlotStatus={handleUpdateSlotStatus} onVehicleExit={handleVehicleExit} onRefresh={refreshAll} currentSiteId={siteId} />
          ),
          { updatedAt: lists.updatedAt }
        );
      case 'sites':
        return wrap(<MasterAdminSites />);
      case 'billing':
        return wrap(<MasterAdminBilling />);
      case 'audit':
        return wrap(<MasterAdminAudit />);
      case 'settings':
        return wrap(<MasterAdminData />);
      case 'design-system':
        return (
          <Suspense fallback={<PageSkeleton />}>
            <DesignSystemPreview />
          </Suspense>
        );
      default:
        return null;
    }
  };
  const userCanOpenModule = (m: string) => canOpenTab(viewer, currentRole, m);

  const landingReady = rolesReady && (sitePhase === 'ready' || sitePhase === 'no-site');

  // Grouped nav (AC-07): only the pages this role may open; counts only.
  const counts: Partial<Record<RouteId, { count: number; label: string; alert?: boolean }>> = {
    employees: { count: pendingReqCount, label: 'pending requests' },
    alerts: { count: alertCount, label: 'open alerts', alert: true },
  };
  const navGroups: NavGroup[] = NAV_GROUPS.map((group) => ({
    label: group,
    items: ROUTES.filter((r) => r.nav?.group === group && canOpenRoute(viewer, currentRole, r)).map((r) => ({
      id: r.id,
      label: r.title,
      icon: r.nav!.icon,
      href: hrefFor(r.id),
      count: counts[r.id]?.count,
      countLabel: counts[r.id]?.label,
      alert: counts[r.id]?.alert,
    })),
  }));
  const attention = [
    ...(canOpenRoute(viewer, currentRole, routeById('employees')) ? [{ label: 'Pending pass requests', count: pendingReqCount, href: hrefFor('employees') }] : []),
    ...(canOpenRoute(viewer, currentRole, routeById('alerts')) ? [{ label: 'Open alerts', count: alertCount, href: hrefFor('alerts') }] : []),
  ];

  const needsSiteForPage = needsSite && !platformPage;

  return (
    <SiteContext.Provider value={siteContextValue}>
      <AppShell
        user={currentUser}
        viewAs={viewAsUser}
        viewSiteLabel={viewSiteLabel}
        onExitViewAs={exitViewAs}
        sites={sites}
        siteId={currentSiteId}
        allowAllSites={isMasterViewer}
        onSelectSite={(siteId) => selectSite(siteId)}
        nav={navGroups}
        current={currentId}
        homeHref={landing ? hrefFor(landing) : '#'}
        attention={attention}
        onSignOut={handleLogout}
      >
        <RouteKeeper route={route} landing={landing} ready={landingReady} />
        {!needsSiteForPage ? (
          sitePhase === 'resolving' && needsSite ? <PageSkeleton /> : <div key={`platform-${viewAsUser?.id ?? ''}`} className="pf-stack">{renderRoute(currentSiteId ?? '')}</div>
        ) : sitePhase === 'resolving' || (route === null && !landingReady) ? (
          <PageSkeleton />
        ) : sitePhase === 'error' ? (
          <ErrorState title="Couldn't load your sites" text="Try again in a moment." onRetry={() => setSiteResolveAttempt((n) => n + 1)} />
        ) : sitePhase === 'no-site' ? (
          // Only reachable while viewing as a user with no site.
          <NoSitePage />
        ) : !currentSiteId ? (
          <ChooseSitePrompt sites={sites} allowAllSites={isMasterViewer} onChoose={selectSite} />
        ) : listsLoading ? (
          <PageSkeleton />
        ) : (
          // Keyed by site: pages that fetch their own data remount on a
          // switch, so they drop the old site's rows and load afresh (L-2).
          // The current site is shown only in the switcher (AC-23).
          <div key={currentSiteId} className="pf-stack">
            {listError && <ErrorState title="Couldn't refresh this site's data" text="What you see may be out of date." onRetry={() => void lists.refresh()} />}
            {/* Stale rows under an error are greyed out, never shown as current (§4). */}
            <div className={listError ? 'pf-stale pf-stack' : 'pf-stack'} aria-busy={listError || undefined}>
              {renderRoute(currentSiteId)}
            </div>
          </div>
        )}
      </AppShell>
    </SiteContext.Provider>
  );
}

/**
 * Route side effects that must not sit after App's early returns (hooks rule):
 * put the landing page in the URL once it is known (AC-10), and move focus to the
 * new page's H1 after navigation for keyboard and screen-reader users.
 */
function RouteKeeper({ route, landing, ready }: { route: string | null; landing: RouteId | null; ready: boolean }) {
  useEffect(() => {
    if (route === null && ready && landing) replaceRoute(landing);
  }, [route, ready, landing]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => (document.querySelector('[data-page-title]') as HTMLElement | null)?.focus(), 0);
    return () => clearTimeout(t);
  }, [route]);
  return null;
}
