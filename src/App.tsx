/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { ParkingSlot, Employee, ParkingLog, SlotStatus, VehicleType, EntryType, AppUser, RolePermissionConfig, SiteConfig } from './types';
import { clearSessionToken } from './sessionTokenFallback';
import { Header, ActiveTabType } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RoleHomePage } from './components/RoleHomePage';
import { LiveFloorPlan } from './components/LiveFloorPlan';
import { SiteAdminOverview } from './components/SiteAdminOverview';
import { SiteAdminReports } from './components/SiteAdminReports';
import { AnalyticsPredictive } from './components/AnalyticsPredictive';
import { InventoryMaster } from './components/InventoryMaster';
import { ParkingLogs } from './components/ParkingLogs';
import { NonParkedAlerts } from './components/NonParkedAlerts';
// Lazy-loaded rather than bundled upfront — these two files alone are
// nearly 4,000 lines (the stale, pre-ML-Kit mobile source, kept here
// only as an in-admin preview feature), and bundling them into every
// page load was the direct cause of the "chunks larger than 500 kB"
// warning on every single build. Now only loaded the first time someone
// actually clicks into the Mobile App or Employee Mobile App preview
// tabs, not before.
const AttendantMobileApp = lazy(() =>
  import('./components/AttendantMobileApp').then((m) => ({ default: m.AttendantMobileApp }))
);
const EmployeeMobileApp = lazy(() =>
  import('./components/EmployeeMobileApp').then((m) => ({ default: m.EmployeeMobileApp }))
);
import { EmployeeRegistration } from './components/EmployeeRegistration';
import { MasterConfigModule } from './components/MasterConfigModule';
import { ValetXModule } from './components/ValetXModule';
import { UserManagementModule } from './components/UserManagementModule';
import { SecurityAuditModule } from './components/SecurityAuditModule';
import { LoginScreen } from './components/LoginScreen';
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
import { ChooseSite } from './components/ChooseSite';
import { NoSiteAssigned } from './components/NoSiteAssigned';
import { ListSkeleton } from './components/ListSkeleton';
import { NoAccess } from './components/NoAccess';
import { ErrorCard } from './components/ErrorCard';
import { ViewAsBanner } from './components/ViewAsBanner';
import { CheckCircle2, AlertCircle } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<ActiveTabType>('HOME');
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
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
  const beforeViewAs = useRef<{ tab: ActiveTabType; siteId: string | null } | null>(null);
  // Bumped by "Try again" when the site list couldn't load.
  const [siteResolveAttempt, setSiteResolveAttempt] = useState<number>(0);
  const [alertCount, setAlertCount] = useState<number>(0);
  const [pendingReqCount, setPendingReqCount] = useState<number>(0);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

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

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const handleLoginSuccess = (user: AppUser, redirectTab?: string) => {
    setLoginNotice(null);
    setCurrentUser(user);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to persist session:', e);
    }

    if (redirectTab) {
      setActiveTab(redirectTab as ActiveTabType);
    } else {
      // Default to the tailored Role Home Page for every role!
      setActiveTab('HOME');
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
    setEmployees([]);
    setLogs([]);
    setRoles([]);
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
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Site-scoped lists. The fetch wrapper adds x-site-id for the active site.
  // Each result is applied only if no site switch, view-as change or
  // sign-out happened while it was in flight.
  const loadSiteLists = async () => {
    const generation = getGeneration();
    const [slotsRes, employeesRes, logsRes, alertsRes, regsRes] = await Promise.allSettled([
      getJson<{ slots?: ParkingSlot[] }>('/api/v1/slots'),
      getJson<{ employees?: Employee[] }>('/api/v1/employees'),
      getJson<{ logs?: ParkingLog[] }>('/api/v1/logs'),
      getJson<{ totalAlerts?: number }>('/api/v1/alerts/non-parked'),
      getJson<{ pendingCount?: number }>('/api/v1/registrations'),
    ]);
    if (!isCurrentGeneration(generation)) return;

    const value = <T,>(r: PromiseSettledResult<ApiResult<T>>): T | null =>
      r.status === 'fulfilled' && r.value.ok ? r.value.body : null;
    const all = [slotsRes, employeesRes, logsRes, alertsRes, regsRes];
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
      return;
    }
    setListError(failed);
    if (failed && !listsLoading && slots.length + employees.length + logs.length > 0) {
      // Keep the last good rows (shown greyed out under the error card).
      setListsLoading(false);
      return;
    }

    setSlots(value(slotsRes)?.slots || []);
    setEmployees(value(employeesRes)?.employees || []);
    setLogs(value(logsRes)?.logs || []);
    setAlertCount(value(alertsRes)?.totalAlerts || 0);
    setPendingReqCount(value(regsRes)?.pendingCount || 0);
    setListsLoading(false);
  };

  const refreshAll = () => {
    if (!currentUser || isEmployeeUser(currentUser)) return;
    fetchCurrentUser();
    fetchRoles();
    if (currentSiteId) loadSiteLists();
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
      setEmployees([]);
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
    if (!viewAsUser) beforeViewAs.current = { tab: activeTab, siteId: currentSiteId };
    selectSite(null);
    setViewAsId(target.id);
    rememberViewAs(target.id);
    setViewAsUser(target);
    setActiveTab('HOME');
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
    setActiveTab(back?.tab ?? 'HOME');
  };
  const restoreAfterViewAs = useRef<{ tab: ActiveTabType; siteId: string | null } | null>(null);

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
        if (returnTo) setActiveTab(returnTo.tab as ActiveTabType);
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
  const latestNav = useRef<{ tab: ActiveTabType; siteId: string | null; userId: string | null }>({
    tab: 'HOME',
    siteId: null,
    userId: null,
  });
  latestNav.current = { tab: activeTab, siteId: currentSiteId, userId: currentUser?.id ?? null };
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;
  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const { reason } = (event as CustomEvent<SessionEndedDetail>).detail;
      const nav = latestNav.current;
      if (!nav.userId) return; // already signed out
      rememberReturnTo({ tab: nav.tab, siteId: nav.siteId, userId: nav.userId });
      latestNav.current = { ...nav, userId: null };
      clearSessionRef.current({ notice: reason === 'ERR_ACCOUNT_INACTIVE' ? COPY_SUSPENDED : COPY_SESSION_ENDED });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  // Load the chosen site's lists whenever the site changes.
  useEffect(() => {
    if (!currentUser || !currentSiteId || isEmployeeUser(currentUser)) return;
    loadSiteLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentSiteId, viewAsUser?.id]);

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

  const occupiedCount = slots.filter((s) => s.status === 'OCCUPIED').length;

  if (!currentUser) {
    return (
      <LoginScreen
        notice={loginNotice}
        allUsers={[]}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // The Employee app preview has no console session (see isEmployeeUser).
  const needsSite = !isEmployeeUser(currentUser);

  if (needsSite && sitePhase === 'no-site' && !viewAsUser) {
    return <NoSiteAssigned onSignOut={handleLogout} />;
  }

  const viewer = uiUser ?? currentUser;
  const baseSiteContext = buildSiteContextValue(currentSiteId, sites, !!viewAsUser, isMasterAdmin(viewer));
  // The Employee app preview has no site context; its own flows stay writable.
  const siteContextValue = needsSite
    ? baseSiteContext
    : { ...baseSiteContext, canWrite: true, writeDisabledReason: null };
  const currentRole = roles.find((r) => r.id === viewer.roleId);
  const canManageDomains = getModuleRights(viewer, currentRole, 'REGISTRATION').canEdit;

  const userCanOpen = (tab: ActiveTabType) => canOpenTab(viewer, currentRole, tab);
  const viewSiteLabel = siteContextValue.isAllSites
    ? 'All sites'
    : siteContextValue.activeSite?.siteName || 'No site chosen';

  // siteId is the chosen site or 'ALL' (never empty for console users).
  // A page the role can't open (deep link, stale tab, role changed) shows
  // S-NA instead of its content (L-5, AC-07). The server enforces it too.
  const renderActiveTab = (siteId: string) =>
    !userCanOpen(activeTab) ? (
      <NoAccess onGoHome={() => setActiveTab('HOME')} />
    ) : (
    <>
            {activeTab === 'HOME' && (
              isSiteAdmin && siteId !== ALL_SITES ? (
                <SiteAdminOverview
                  siteId={siteId}
                  onNavigate={(screen) => {
                    const map: Record<string, ActiveTabType> = {
                      alerts: 'ALERTS',
                      slots: 'FLOOR_PLAN',
                      staff: 'INVENTORY',
                      employees: 'INVENTORY',
                    };
                    setActiveTab(map[screen] || 'HOME');
                  }}
                />
              ) : (
                <RoleHomePage
                  currentUser={viewer}
                  roles={roles}
                  slots={slots}
                  employees={employees}
                  logs={logs}
                  alertCount={alertCount}
                  pendingReqCount={pendingReqCount}
                  setActiveTab={setActiveTab}
                  onRefreshAll={refreshAll}
                />
              )
            )}

            {activeTab === 'FLOOR_PLAN' && (
              // Per explicit request: Site Admin uses the exact same
              // Live Parking Status UI as Master Admin — previously
              // routed to a separate, differently-designed
              // SiteAdminLiveSlots component here. The underlying
              // `slots` prop is already correctly scoped to the current
              // site, so this shows only the right site's data while
              // looking identical to Master Admin's view — the same
              // component, not a lookalike rebuild.
              <LiveFloorPlan
                slots={slots}
                onUpdateSlotStatus={handleUpdateSlotStatus}
                onVehicleEntry={handleVehicleEntry}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'ANALYTICS' && <AnalyticsPredictive />}

            {activeTab === 'REPORTS' && (
              siteId !== ALL_SITES ? (
                <SiteAdminReports siteId={siteId} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Select a specific site (top right) to view its reports.
                </div>
              )
            )}

            {activeTab === 'INVENTORY' && (
              <InventoryMaster
                slots={slots}
                onUpdateSlotStatus={handleUpdateSlotStatus}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
                currentSiteId={siteId}
              />
            )}

            {activeTab === 'LOGS' && (
              <ParkingLogs
                logs={logs}
                onVehicleEntry={handleVehicleEntry}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'ALERTS' && <NonParkedAlerts onRefresh={refreshAll} />}

            {activeTab === 'MOBILE_APP' && (
              <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">Loading mobile app preview…</div>}>
                <AttendantMobileApp
                  slots={slots}
                  employees={employees}
                  onVehicleEntry={handleVehicleEntry}
                  onVehicleExit={handleVehicleExit}
                  onRefresh={refreshAll}
                />
              </Suspense>
            )}

            {activeTab === 'EMPLOYEE_MOBILE_APP' && (
              <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">Loading employee app preview…</div>}>
                <EmployeeMobileApp
                  slots={slots}
                  onRefreshAll={refreshAll}
                />
              </Suspense>
            )}

            {activeTab === 'REGISTRATION' && (
              <EmployeeRegistration
                mode="REGISTRATION"
                onRefreshAll={refreshAll}
                currentSiteId={siteId}
                canManageDomains={canManageDomains}
              />
            )}

            {activeTab === 'APPROVALS' && (
              <EmployeeRegistration
                mode="APPROVALS"
                onRefreshAll={refreshAll}
                currentSiteId={siteId}
                canManageDomains={canManageDomains}
              />
            )}

            {activeTab === 'MASTER_CONFIG' && <MasterConfigModule onRefresh={refreshAll} />}

            {activeTab === 'VALET_SERVICE' && <ValetXModule />}

            {activeTab === 'USER_MANAGEMENT' && (
              <UserManagementModule
                currentUser={currentUser}
                isMaster={isMasterAdmin(currentUser)}
                onSelectSimulatedUser={(u) => startViewAs(u)}
                onRefreshAll={refreshAll}
              />
            )}

            {activeTab === 'SECURITY_AUDIT' && (
              <SecurityAuditModule
                currentUserRole={currentUser?.roleName}
                onRefreshAll={refreshAll}
              />
            )}
    </>
  );

  return (
    <SiteContext.Provider value={siteContextValue}>
    <div className="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white flex flex-col">
      {viewAsUser && (
        <ViewAsBanner
          userName={viewAsUser.fullName}
          roleName={viewAsUser.roleName}
          siteLabel={viewSiteLabel}
          onExit={exitViewAs}
        />
      )}

      {/* Top Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        occupiedCount={occupiedCount}
        totalSlots={slots.length}
        alertCount={alertCount}
        pendingReqCount={pendingReqCount}
        onRefresh={refreshAll}
        currentUser={currentUser}
        sites={sites}
        currentSiteId={currentSiteId ?? undefined}
        onSelectSite={(siteId) => selectSite(siteId)}
        allowAllSites={isMasterAdmin(viewer)}
        canOpenTab={userCanOpen}
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        onLogout={handleLogout}
      />

      {/* Floating Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-xl border text-xs font-mono font-bold flex items-center space-x-3 transition-all ${
            notification.type === 'success'
              ? 'bg-white border-emerald-300 text-emerald-800 shadow-emerald-100'
              : 'bg-white border-rose-300 text-rose-800 shadow-rose-100'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Body Layout: Left Navigation Sidebar + Right Main Panel */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          alertCount={alertCount}
          pendingReqCount={pendingReqCount}
          mobileOpen={mobileSidebarOpen}
          setMobileOpen={setMobileSidebarOpen}
          currentUser={viewer}
          roles={roles}
        />

        {/* Right Main Panel Displays Selected Module Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 h-full">
          <div className="max-w-7xl mx-auto">
            {!needsSite ? (
              renderActiveTab('')
            ) : sitePhase === 'resolving' ? (
              <ListSkeleton />
            ) : sitePhase === 'error' ? (
              <div role="alert" className="max-w-md mx-auto mt-12 bg-white border border-rose-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-slate-800">Couldn't load your sites</p>
                <button
                  type="button"
                  onClick={() => setSiteResolveAttempt((n) => n + 1)}
                  className="mt-4 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  Try again
                </button>
              </div>
            ) : sitePhase === 'no-site' ? (
              // Only reachable while viewing as a user with no site.
              <NoSiteAssigned embedded onSignOut={handleLogout} />
            ) : !currentSiteId ? (
              <ChooseSite sites={sites} allowAllSites={isMasterAdmin(viewer)} onChoose={selectSite} />
            ) : listsLoading ? (
              <ListSkeleton />
            ) : (
              // Keyed by site: pages that fetch their own data remount on a
              // switch, so they drop the old site's rows and load afresh (L-2).
              <div key={currentSiteId}>
                <p
                  className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"
                  style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}
                >
                  {siteContextValue.isAllSites
                    ? `All sites · ${sites.length} sites`
                    : siteContextValue.activeSite?.siteName || currentSiteId}
                  {siteContextValue.isAllSites && (
                    <span className="ml-2 normal-case tracking-normal font-semibold text-slate-600">
                      · Select one site to make changes
                    </span>
                  )}
                </p>
                {listError && <ErrorCard onRetry={() => loadSiteLists()} />}
                {/* Stale rows under an error are greyed out, never shown as current (§4). */}
                <div className={listError ? 'opacity-50' : undefined} aria-busy={listError || undefined}>
                  {renderActiveTab(currentSiteId)}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
    </SiteContext.Provider>
  );
}
