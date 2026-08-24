import { AppUser, RolePermissionConfig, AppModuleId, ModuleAccessRights, SiteConfig } from '../types';
import { ActiveTabType } from '../components/Header';

// Default rights
export const FULL_ACCESS_RIGHTS: ModuleAccessRights = {
  enabled: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canExport: true,
};

export const READ_ONLY_RIGHTS: ModuleAccessRights = {
  enabled: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: true,
};

export const DISABLED_RIGHTS: ModuleAccessRights = {
  enabled: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: false,
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, ModuleAccessRights>> = {
  'role-master-admin': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: FULL_ACCESS_RIGHTS,
    VALET_SERVICE: FULL_ACCESS_RIGHTS,
    LOGS: FULL_ACCESS_RIGHTS,
    ANALYTICS: FULL_ACCESS_RIGHTS,
    INVENTORY: FULL_ACCESS_RIGHTS,
    MOBILE_APP: FULL_ACCESS_RIGHTS,
    EMPLOYEE_MOBILE_APP: FULL_ACCESS_RIGHTS,
    REGISTRATION: FULL_ACCESS_RIGHTS,
    APPROVALS: FULL_ACCESS_RIGHTS,
    ALERTS: FULL_ACCESS_RIGHTS,
    MASTER_CONFIG: FULL_ACCESS_RIGHTS,
    USER_MANAGEMENT: FULL_ACCESS_RIGHTS,
    SECURITY_AUDIT: FULL_ACCESS_RIGHTS,
  },
  'role-site-manager': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: FULL_ACCESS_RIGHTS,
    VALET_SERVICE: FULL_ACCESS_RIGHTS,
    LOGS: FULL_ACCESS_RIGHTS,
    ANALYTICS: FULL_ACCESS_RIGHTS,
    INVENTORY: FULL_ACCESS_RIGHTS,
    MOBILE_APP: FULL_ACCESS_RIGHTS,
    EMPLOYEE_MOBILE_APP: READ_ONLY_RIGHTS,
    REGISTRATION: FULL_ACCESS_RIGHTS,
    APPROVALS: FULL_ACCESS_RIGHTS,
    ALERTS: FULL_ACCESS_RIGHTS,
    MASTER_CONFIG: DISABLED_RIGHTS,
    USER_MANAGEMENT: DISABLED_RIGHTS,
    SECURITY_AUDIT: READ_ONLY_RIGHTS,
  },
  'role-valet-supervisor': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: READ_ONLY_RIGHTS,
    VALET_SERVICE: FULL_ACCESS_RIGHTS,
    LOGS: READ_ONLY_RIGHTS,
    ANALYTICS: DISABLED_RIGHTS,
    INVENTORY: READ_ONLY_RIGHTS,
    MOBILE_APP: FULL_ACCESS_RIGHTS,
    EMPLOYEE_MOBILE_APP: DISABLED_RIGHTS,
    REGISTRATION: DISABLED_RIGHTS,
    APPROVALS: DISABLED_RIGHTS,
    ALERTS: DISABLED_RIGHTS,
    MASTER_CONFIG: DISABLED_RIGHTS,
    USER_MANAGEMENT: DISABLED_RIGHTS,
    SECURITY_AUDIT: DISABLED_RIGHTS,
  },
  'role-mis-auditor': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: READ_ONLY_RIGHTS,
    VALET_SERVICE: READ_ONLY_RIGHTS,
    LOGS: READ_ONLY_RIGHTS,
    ANALYTICS: READ_ONLY_RIGHTS,
    INVENTORY: READ_ONLY_RIGHTS,
    MOBILE_APP: DISABLED_RIGHTS,
    EMPLOYEE_MOBILE_APP: DISABLED_RIGHTS,
    REGISTRATION: READ_ONLY_RIGHTS,
    APPROVALS: READ_ONLY_RIGHTS,
    ALERTS: READ_ONLY_RIGHTS,
    MASTER_CONFIG: DISABLED_RIGHTS,
    USER_MANAGEMENT: DISABLED_RIGHTS,
    SECURITY_AUDIT: READ_ONLY_RIGHTS,
  },
  'role-gate-attendant': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: READ_ONLY_RIGHTS,
    VALET_SERVICE: DISABLED_RIGHTS,
    LOGS: READ_ONLY_RIGHTS,
    ANALYTICS: DISABLED_RIGHTS,
    INVENTORY: READ_ONLY_RIGHTS,
    MOBILE_APP: FULL_ACCESS_RIGHTS,
    EMPLOYEE_MOBILE_APP: DISABLED_RIGHTS,
    REGISTRATION: DISABLED_RIGHTS,
    APPROVALS: DISABLED_RIGHTS,
    ALERTS: READ_ONLY_RIGHTS,
    MASTER_CONFIG: DISABLED_RIGHTS,
    USER_MANAGEMENT: DISABLED_RIGHTS,
    SECURITY_AUDIT: DISABLED_RIGHTS,
  },
  'role-employee-pass': {
    HOME: FULL_ACCESS_RIGHTS,
    FLOOR_PLAN: DISABLED_RIGHTS,
    VALET_SERVICE: DISABLED_RIGHTS,
    LOGS: DISABLED_RIGHTS,
    ANALYTICS: DISABLED_RIGHTS,
    INVENTORY: DISABLED_RIGHTS,
    MOBILE_APP: DISABLED_RIGHTS,
    EMPLOYEE_MOBILE_APP: FULL_ACCESS_RIGHTS,
    REGISTRATION: FULL_ACCESS_RIGHTS,
    APPROVALS: DISABLED_RIGHTS,
    ALERTS: DISABLED_RIGHTS,
    MASTER_CONFIG: DISABLED_RIGHTS,
    USER_MANAGEMENT: DISABLED_RIGHTS,
    SECURITY_AUDIT: DISABLED_RIGHTS,
  },
};

/**
 * Checks if a specific module / tab is permitted for the active user session.
 */
export function isModulePermitted(
  user: AppUser | null | undefined,
  roleConfig: RolePermissionConfig | undefined,
  tabId: ActiveTabType | AppModuleId | string
): boolean {
  if (!user) return false;
  if (tabId === 'HOME') return true;

  // Check user-level custom override first
  if (user.customModuleOverrides && typeof user.customModuleOverrides[tabId as AppModuleId] === 'boolean') {
    return !!user.customModuleOverrides[tabId as AppModuleId];
  }

  // Check role configuration module permissions
  if (roleConfig && roleConfig.modulePermissions && roleConfig.modulePermissions[tabId as AppModuleId]) {
    return !!roleConfig.modulePermissions[tabId as AppModuleId].enabled;
  }

  // Fallback to default matrix based on roleId or roleName
  const roleKey = user.roleId || '';
  if (DEFAULT_ROLE_PERMISSIONS[roleKey] && DEFAULT_ROLE_PERMISSIONS[roleKey][tabId]) {
    return DEFAULT_ROLE_PERMISSIONS[roleKey][tabId].enabled;
  }

  const roleNameLower = (user.roleName || '').toLowerCase();
  if (roleNameLower.includes('master admin') || roleNameLower.includes('super admin')) {
    return true;
  }
  if (roleNameLower.includes('employee')) {
    return tabId === 'HOME' || tabId === 'EMPLOYEE_MOBILE_APP' || tabId === 'REGISTRATION';
  }
  if (roleNameLower.includes('valet')) {
    return ['HOME', 'VALET_SERVICE', 'FLOOR_PLAN', 'LOGS', 'INVENTORY', 'MOBILE_APP'].includes(tabId);
  }
  if (roleNameLower.includes('attendant') || roleNameLower.includes('gate')) {
    return ['HOME', 'MOBILE_APP', 'FLOOR_PLAN', 'LOGS', 'INVENTORY', 'ALERTS'].includes(tabId);
  }
  if (roleNameLower.includes('auditor') || roleNameLower.includes('mis')) {
    return ['HOME', 'LOGS', 'ANALYTICS', 'FLOOR_PLAN', 'INVENTORY', 'SECURITY_AUDIT', 'APPROVALS', 'REGISTRATION'].includes(tabId);
  }

  return true;
}

/**
 * Gets access rights (canCreate, canEdit, canDelete, canExport) for a module.
 */
export function getModuleRights(
  user: AppUser | null | undefined,
  roleConfig: RolePermissionConfig | undefined,
  tabId: ActiveTabType | AppModuleId | string
): ModuleAccessRights {
  if (!user) return DISABLED_RIGHTS;
  if (tabId === 'HOME') return FULL_ACCESS_RIGHTS;

  const isPermitted = isModulePermitted(user, roleConfig, tabId);
  if (!isPermitted) return DISABLED_RIGHTS;

  if (roleConfig && roleConfig.modulePermissions && roleConfig.modulePermissions[tabId as AppModuleId]) {
    return roleConfig.modulePermissions[tabId as AppModuleId];
  }

  const roleKey = user.roleId || '';
  if (DEFAULT_ROLE_PERMISSIONS[roleKey] && DEFAULT_ROLE_PERMISSIONS[roleKey][tabId]) {
    return DEFAULT_ROLE_PERMISSIONS[roleKey][tabId];
  }

  return isPermitted ? FULL_ACCESS_RIGHTS : DISABLED_RIGHTS;
}

/**
 * Returns all sites that the given user has permission to access.
 */
export function getUserPermittedSites(
  user: AppUser | null | undefined,
  allSites: SiteConfig[]
): SiteConfig[] {
  if (!allSites || allSites.length === 0) return [];
  if (!user) return allSites;

  // Master Admin or users with ALL_SITES scope can access all sites
  if (
    user.siteScopeType === 'ALL_SITES' ||
    user.roleId === 'role-master-admin' ||
    (user.roleName && user.roleName.toLowerCase().includes('master admin'))
  ) {
    return allSites;
  }

  // Filter by assignedSiteIds
  if (user.assignedSiteIds && user.assignedSiteIds.length > 0) {
    const matched = allSites.filter(
      (s) =>
        user.assignedSiteIds.includes(s.id) ||
        user.assignedSiteIds.includes(s.siteCode) ||
        (user.assignedSiteNames && user.assignedSiteNames.includes(s.siteName))
    );
    if (matched.length > 0) return matched;
  }

  // Fallback to first site if assignment is missing
  return allSites.slice(0, 1);
}

/**
 * Checks if a specific site is permitted for the user.
 */
export function isSitePermitted(
  user: AppUser | null | undefined,
  siteId: string
): boolean {
  if (!user) return true;
  if (
    user.siteScopeType === 'ALL_SITES' ||
    user.roleId === 'role-master-admin' ||
    (user.roleName && user.roleName.toLowerCase().includes('master admin'))
  ) {
    return true;
  }

  if (user.assignedSiteIds && user.assignedSiteIds.length > 0) {
    return user.assignedSiteIds.includes(siteId);
  }

  return true;
}

/**
 * Gets the primary assigned site for the active user.
 */
export function getUserPrimarySite(
  user: AppUser | null | undefined,
  allSites: SiteConfig[]
): SiteConfig | null {
  const permitted = getUserPermittedSites(user, allSites);
  return permitted.length > 0 ? permitted[0] : null;
}

