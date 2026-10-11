/**
 * Hash routes ↔ module ids (002 tech design F2, AC-07/AC-08/AC-10). `#/live-parking` etc.
 * Module ids are unchanged, so 001 permissions (canOpenTab) decide what each role may open;
 * the server still answers 403 on its own (no regression from 001).
 */
import type { LucideIcon } from 'lucide-react';
import {
  Building2, FileText, Gauge, LayoutGrid, ListOrdered, ReceiptIndianRupee, Settings, ShieldCheck, Sparkles,
  TriangleAlert, Users, UserRoundCheck, Warehouse,
} from 'lucide-react';
import type { AppModuleId, AppUser, RolePermissionConfig } from './types';
import { canOpenTab, isMasterAdmin } from './utils/rbac';

export type RouteId =
  | 'overview' | 'live-parking' | 'logs' | 'alerts' | 'reports' | 'predictive' | 'valet'
  | 'employees' | 'users'
  | 'inventory' | 'sites' | 'billing' | 'audit' | 'settings'
  | 'design-system';

export type NavGroupId = 'Operations' | 'People' | 'Setup';

export interface RouteDef {
  id: RouteId;
  /** Page title = nav label (AC-07). */
  title: string;
  /** One line under the H1 (AC-09). */
  description: string;
  /** The 001 module that grants it. `employees` accepts either REGISTRATION or APPROVALS. */
  modules: AppModuleId[];
  /** Master Admin only (the viewer, so view-as a Site Admin sees No access, 001 m-5). */
  masterOnly?: boolean;
  /** Platform page: works with no site chosen (Master's Sites, Billing, Audit log, …). */
  platform?: boolean;
  nav?: { group: NavGroupId; icon: LucideIcon };
}

export const ROUTES: RouteDef[] = [
  { id: 'overview', title: 'Overview', description: "Today at your site: occupancy, entries and what needs your attention.", modules: ['FLOOR_PLAN'], nav: { group: 'Operations', icon: Gauge } },
  { id: 'live-parking', title: 'Live parking', description: 'Every slot at this site, with who is parked where.', modules: ['FLOOR_PLAN'], nav: { group: 'Operations', icon: LayoutGrid } },
  { id: 'logs', title: 'Entry/exit log', description: 'Every recorded entry and exit. Read-only; export to CSV.', modules: ['LOGS'], nav: { group: 'Operations', icon: ListOrdered } },
  { id: 'alerts', title: 'Alerts', description: 'Vehicles that entered but have not been parked in a slot.', modules: ['ALERTS'], nav: { group: 'Operations', icon: TriangleAlert } },
  { id: 'reports', title: 'Reports', description: 'Downloads, violations, overnight requests and utilisation.', modules: ['REPORTS'], nav: { group: 'Operations', icon: FileText } },
  { id: 'predictive', title: 'Predictive analytics', description: 'Sample data — not live. Forecasts will use your site data once it is connected.', modules: ['ANALYTICS'] },
  { id: 'valet', title: 'Valet', description: 'Valet tickets, keys and vehicle retrieval.', modules: ['VALET_SERVICE'], nav: { group: 'Operations', icon: Sparkles } },
  { id: 'employees', title: 'Employees & vehicles', description: 'Review pass requests and manage who can park at this site.', modules: ['REGISTRATION', 'APPROVALS'], nav: { group: 'People', icon: UserRoundCheck } },
  { id: 'users', title: 'Users & roles', description: 'Console users, their roles, module permissions and sites.', modules: ['USER_MANAGEMENT'], nav: { group: 'People', icon: Users } },
  { id: 'inventory', title: 'Inventory', description: 'Slots, levels and sizes. Add slots one by one or upload a CSV.', modules: ['INVENTORY'], nav: { group: 'Setup', icon: Warehouse } },
  { id: 'sites', title: 'Sites', description: 'Every customer site on ParkFlows. Click a site to see details or change it.', modules: ['MASTER_CONFIG'], masterOnly: true, platform: true, nav: { group: 'Setup', icon: Building2 } },
  { id: 'billing', title: 'Billing', description: 'Plans and invoices for each site.', modules: ['MASTER_CONFIG'], masterOnly: true, platform: true, nav: { group: 'Setup', icon: ReceiptIndianRupee } },
  { id: 'audit', title: 'Audit log', description: 'Who did what, when, on which site.', modules: ['SECURITY_AUDIT'], masterOnly: true, platform: true, nav: { group: 'Setup', icon: ShieldCheck } },
  { id: 'settings', title: 'Settings', description: 'Data retention and platform tools.', modules: ['SECURITY_AUDIT'], masterOnly: true, platform: true, nav: { group: 'Setup', icon: Settings } },
  { id: 'design-system', title: 'Design system', description: 'Every ParkFlows component in every state. Example data only.', modules: [], masterOnly: true, platform: true },
];

export const NAV_GROUPS: NavGroupId[] = ['Operations', 'People', 'Setup'];

const BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

export function routeById(id: string | null | undefined): RouteDef | undefined {
  return id ? BY_ID.get(id as RouteId) : undefined;
}

/** `#/live-parking` → 'live-parking'; '' or '#/' → null (the landing page). Unknown ids are returned as-is (→ No access). */
export function parseHash(hash: string): string | null {
  const id = hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return id ? decodeURIComponent(id) : null;
}

export function hrefFor(id: RouteId): string {
  return `#/${id}`;
}

/** Go to a page (adds a history entry, so Back works). */
export function navigate(id: RouteId): void {
  const next = hrefFor(id);
  if (window.location.hash !== next) window.location.hash = next;
}

/** Point the URL at a page without a history entry (landing, redirects). */
export function replaceRoute(id: RouteId): void {
  const url = `${window.location.pathname}${window.location.search}${hrefFor(id)}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** The /design-system preview is for dev and staging only, never the live console. */
export function designSystemAvailable(): boolean {
  return import.meta.env.DEV || window.location.hostname !== 'admin.parkflows.in';
}

/** One rule for nav, routes and links (L-5): the viewer's role decides. */
export function canOpenRoute(viewer: AppUser | null | undefined, role: RolePermissionConfig | undefined, def: RouteDef | undefined): boolean {
  if (!viewer || !def) return false;
  if (def.masterOnly && !isMasterAdmin(viewer)) return false;
  if (def.id === 'design-system') return designSystemAvailable();
  if (!def.modules.length) return true;
  return def.modules.some((m) => canOpenTab(viewer, role, m));
}

/**
 * Landing page (AC-10): the first one the user may open of Sites (Master), Overview (one
 * site chosen), Live parking, Entry/exit log, Reports; else the first page in the nav.
 */
export function landingRoute(
  viewer: AppUser | null | undefined,
  role: RolePermissionConfig | undefined,
  oneSiteChosen: boolean
): RouteId | null {
  const order: RouteId[] = ['sites', 'overview', 'live-parking', 'logs', 'reports'];
  for (const id of order) {
    if (id === 'overview' && !oneSiteChosen) continue;
    if (canOpenRoute(viewer, role, routeById(id))) return id;
  }
  return ROUTES.find((r) => r.nav && canOpenRoute(viewer, role, r))?.id ?? null;
}
