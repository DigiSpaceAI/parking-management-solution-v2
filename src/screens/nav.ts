/**
 * The console's grouped navigation (002 tech design "Navigation & page template", AC-07).
 * Module ids are unchanged, so 001 permissions keep working; visibility uses the same
 * canOpenTab rule as the routes.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Building2, ClipboardList, FileText, Home, LayoutGrid, ListOrdered, QrCode,
  ShieldCheck, Smartphone, Sparkles, TriangleAlert, UserPlus, Users, Warehouse,
} from 'lucide-react';
import type { AppModuleId } from '../types';

export type NavGroupId = 'Operations' | 'People' | 'Setup';

export interface NavEntry {
  id: AppModuleId;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
}

/** In display order, per group. */
export const NAV_ENTRIES: NavEntry[] = [
  { id: 'HOME', label: 'Home', icon: Home, group: 'Operations' },
  { id: 'FLOOR_PLAN', label: 'Live parking', icon: LayoutGrid, group: 'Operations' },
  { id: 'LOGS', label: 'Entry/exit log', icon: ListOrdered, group: 'Operations' },
  { id: 'ALERTS', label: 'Alerts', icon: TriangleAlert, group: 'Operations' },
  { id: 'REPORTS', label: 'Reports', icon: FileText, group: 'Operations' },
  { id: 'ANALYTICS', label: 'Predictive analytics', icon: BarChart3, group: 'Operations' },
  { id: 'VALET_SERVICE', label: 'Valet', icon: Sparkles, group: 'Operations' },
  { id: 'MOBILE_APP', label: 'ParkFlows Field', icon: Smartphone, group: 'Operations' },
  { id: 'EMPLOYEE_MOBILE_APP', label: 'Employee Smart Pass', icon: QrCode, group: 'Operations' },
  { id: 'REGISTRATION', label: 'Employee registration', icon: UserPlus, group: 'People' },
  { id: 'APPROVALS', label: 'Pass approvals', icon: ClipboardList, group: 'People' },
  { id: 'USER_MANAGEMENT', label: 'Users & roles', icon: Users, group: 'People' },
  { id: 'INVENTORY', label: 'Inventory', icon: Warehouse, group: 'Setup' },
  { id: 'MASTER_CONFIG', label: 'Sites', icon: Building2, group: 'Setup' },
  { id: 'SECURITY_AUDIT', label: 'Audit log', icon: ShieldCheck, group: 'Setup' },
];

export const NAV_GROUPS: NavGroupId[] = ['Operations', 'People', 'Setup'];
