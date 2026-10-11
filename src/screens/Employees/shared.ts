import type { Employee, RegistrationRequest } from '../../types';

/** Whole days since an ISO time (0 for today). */
export function daysSince(iso: string | undefined, now = Date.now()): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
}

export function waitingText(days: number): string {
  return days < 1 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}

/** Search across name, employee ID and plate (spaces and dashes ignored for plates). */
export function matches(row: Pick<Employee | RegistrationRequest, 'name' | 'employeeId' | 'vehicleNumber'>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const compact = needle.replace(/[^a-z0-9]/g, '');
  return (
    (row.name || '').toLowerCase().includes(needle) ||
    (row.employeeId || '').toLowerCase().includes(needle) ||
    (!!compact && (row.vehicleNumber || '').toLowerCase().replace(/[^a-z0-9*]/g, '').includes(compact))
  );
}

export const TABLE_PAGE_SIZES = [25, 50];

export interface ModuleRights {
  view: boolean;
  create: boolean;
  edit: boolean;
}
