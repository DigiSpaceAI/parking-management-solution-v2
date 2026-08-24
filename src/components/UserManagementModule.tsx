import React, { useState, useEffect } from 'react';
import {
  AppUser,
  RolePermissionConfig,
  AppModuleId,
  ModuleAccessRights,
  SiteConfig
} from '../types';
import {
  Users,
  ShieldCheck,
  Building2,
  KeyRound,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  RefreshCw,
  Lock,
  Unlock,
  Sliders,
  Check,
  X,
  MapPin,
  Eye,
  Settings,
  Sparkles,
  LayoutGrid,
  FileText,
  TrendingUp,
  Smartphone,
  UserCheck,
  Bell,
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  AlertCircle
} from 'lucide-react';

const MODULE_DEFINITIONS: { id: AppModuleId; label: string; icon: any; category: string; description: string }[] = [
  { id: 'FLOOR_PLAN', label: 'Live Parking Status & Floor Plan', icon: LayoutGrid, category: 'Spatial Intelligence', description: 'Real-time multi-basement floor map view, slot occupancy, and puzzle stackers.' },
  { id: 'MASTER_CONFIG', label: 'Master Site Config & Multi-Tenancy', icon: Building2, category: 'SaaS Platform Admin', description: 'Multi-site onboarding, pricing rules, rate cards, and SaaS invoice billing.' },
  { id: 'USER_MANAGEMENT', label: 'User Management & RBAC System', icon: Users, category: 'SaaS Platform Admin', description: 'Role permissions matrix, module access toggles, and site-level scope controls.' },
  { id: 'INVENTORY', label: 'Slot Inventory Master Matrix', icon: SlidersHorizontal, category: 'Capacity Management', description: '1,080 slot breakdown, department quotas, and EV station allocation.' },
  { id: 'MOBILE_APP', label: 'ParkOrbit Field App', icon: Smartphone, category: 'Field Tools', description: 'Mobile camera ANPR scan, manual spot allocation, and ticket printer interface.' },
  { id: 'VALET_SERVICE', label: 'ValetX Suite & Key Locker', icon: KeyRound, category: 'Valet Operations', description: 'Guest check-in, key tag locker allocation, runner dispatch, and SMS vehicle retrieval.' },
  { id: 'EMPLOYEE_MOBILE_APP', label: 'Employee Smart Pass & Mobile App', icon: Smartphone, category: 'Employee Experience', description: 'Live digital QR parking pass, slot location navigator, valet recall & profile pass.' },
  { id: 'REGISTRATION', label: 'Employee Vehicle Registration', icon: UserCheck, category: 'Access Requests', description: 'Whitelisted domain verification and employee vehicle registration requests.' },
  { id: 'APPROVALS', label: 'Employee Vehicle Approval', icon: ShieldCheck, category: 'Access Requests', description: 'Parking admin request approval queue, whitelist enforcement, and domain settings.' },
  { id: 'LOGS', label: 'Entry/Exit Logs & MIS Reports', icon: FileText, category: 'Audit & Compliance', description: 'Real-time ANPR scans, manual gates, entry/exit time tracking, and CSV MIS exports.' },
  { id: 'ANALYTICS', label: 'Predictive Analytics & Forecasting', icon: TrendingUp, category: 'AI Intelligence', description: 'AI occupancy forecasting, peak hour prediction, and floor utilization trends.' },
  { id: 'ALERTS', label: 'Non-Parked Exception Alerts', icon: Bell, category: 'Security & Violations', description: 'Cutoff time alerts, FCM notifications, and unauthorized entry enforcement.' },
  { id: 'SECURITY_AUDIT', label: 'InfoSec & Privacy Defense', icon: ShieldAlert, category: 'Security Operations', description: 'Cryptographic SHA-256 HMAC audit log verification, BOLA defense & data masking.' },
];

interface UserManagementModuleProps {
  currentUser?: AppUser | null;
  onSelectSimulatedUser?: (user: AppUser) => void;
  onRefreshAll?: () => void;
}

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({
  currentUser,
  onSelectSimulatedUser,
  onRefreshAll,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RolePermissionConfig[]>([]);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'USERS' | 'ROLES' | 'SITE_MAPPING' | 'SIMULATOR'>('USERS');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');

  // User Modal State
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<Partial<AppUser> | null>(null);
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState<boolean>(false);
  const [siteSearchTerm, setSiteSearchTerm] = useState<string>('');

  // Role Modal State
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<Partial<RolePermissionConfig> | null>(null);

  // In-App Toast & Confirmation States
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resUsers, resRoles, resSites] = await Promise.all([
        fetch('/api/v1/rbac/users').then((r) => r.json()).catch(() => ({})),
        fetch('/api/v1/rbac/roles').then((r) => r.json()).catch(() => ({})),
        fetch('/api/v1/sites').then((r) => r.json()).catch(() => ({})),
      ]);

      if (resUsers?.users) setUsers(resUsers.users);
      else if (resUsers?.success && resUsers.users) setUsers(resUsers.users);

      if (resRoles?.roles) setRoles(resRoles.roles);
      else if (resRoles?.success && resRoles.roles) setRoles(resRoles.roles);

      const loadedSites = resSites?.sites || (Array.isArray(resSites) ? resSites : []);
      if (loadedSites.length > 0) {
        setSites(loadedSites);
      }
    } catch (err) {
      console.error('Failed to load RBAC data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Save User
  const handleSaveUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (
      editingUser.siteScopeType === 'SPECIFIC_SITES' &&
      (!editingUser.assignedSiteIds || editingUser.assignedSiteIds.length === 0)
    ) {
      showToast('error', 'Please select at least one registered site from the dropdown for Specific Assigned Sites.');
      return;
    }

    try {
      const res = await fetch('/api/v1/rbac/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowUserModal(false);
        setEditingUser(null);
        setIsSiteDropdownOpen(false);
        setSiteSearchTerm('');
        fetchData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showToast('error', data.message || 'Failed to save user.');
      }
    } catch (err) {
      console.error('Error saving user:', err);
      showToast('error', 'Error saving user.');
    }
  };

  // Handle Save Role
  const handleSaveRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    try {
      const res = await fetch('/api/v1/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRole),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setShowRoleModal(false);
        setEditingRole(null);
        fetchData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showToast('error', data.message || 'Failed to save role permissions.');
      }
    } catch (err) {
      console.error('Error saving role:', err);
      showToast('error', 'Error saving role permissions.');
    }
  };

  // Handle Module Override Toggle per user
  const handleModuleToggle = async (userId: string, moduleId: AppModuleId, currentVal: boolean) => {
    try {
      const res = await fetch('/api/v1/rbac/users/toggle-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, moduleId, enabled: !currentVal }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
        if (onRefreshAll) onRefreshAll();
      }
    } catch (err) {
      console.error('Error toggling module access:', err);
    }
  };

  // Handle Role Module Permission Toggle
  const handleRoleModulePermissionToggle = (moduleId: AppModuleId, key: keyof ModuleAccessRights) => {
    if (!editingRole || !editingRole.modulePermissions) return;

    const currentRights = editingRole.modulePermissions[moduleId] || {
      enabled: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canExport: false,
    };

    const updatedRights = {
      ...currentRights,
      [key]: !currentRights[key],
    };

    // If enabled set to false, auto disable children
    if (key === 'enabled' && !updatedRights.enabled) {
      updatedRights.canCreate = false;
      updatedRights.canEdit = false;
      updatedRights.canDelete = false;
      updatedRights.canExport = false;
    }

    setEditingRole({
      ...editingRole,
      modulePermissions: {
        ...editingRole.modulePermissions,
        [moduleId]: updatedRights,
      },
    });
  };

  // Delete User
  const handleDeleteUser = (userId: string, name: string) => {
    setUserToDelete({ id: userId, name });
  };

  const [resetTokenResult, setResetTokenResult] = useState<{ userName: string; token: string; message: string } | null>(null);

  const handleGenerateResetToken = async (userId: string, userName: string) => {
    try {
      const res = await fetch('/api/v1/auth/admin/generate-reset-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success) {
        setResetTokenResult({ userName, token: data.token, message: data.message });
      } else {
        showToast('error', data.message || 'Failed to generate reset token.');
      }
    } catch (err) {
      console.error('Failed to generate reset token:', err);
      showToast('error', 'Failed to generate reset token.');
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const { id: userId, name } = userToDelete;
    try {
      const res = await fetch(`/api/v1/rbac/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message || `User '${name}' deleted successfully.`);
        setUserToDelete(null);
        fetchData();
        if (onRefreshAll) onRefreshAll();
      } else {
        showToast('error', data.message || 'Failed to delete user.');
      }
    } catch (err) {
      console.error('Failed to delete user:', err);
      showToast('error', 'Failed to delete user.');
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const fullName = (u.fullName || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const phone = (u.phone || '').toString();
    const designation = (u.designation || '').toLowerCase();

    const matchesQuery =
      !q ||
      fullName.includes(q) ||
      username.includes(q) ||
      email.includes(q) ||
      phone.includes(q) ||
      designation.includes(q);

    const matchesRole =
      roleFilter === 'ALL' ||
      u.roleId === roleFilter ||
      u.roleName === roleFilter ||
      (roleFilter === 'role-master-admin' && (u.roleName?.includes('Master') || u.roleId?.includes('master'))) ||
      (roleFilter === 'role-site-manager' && (u.roleName?.includes('Site') || u.roleId?.includes('site'))) ||
      (roleFilter === 'role-valet-supervisor' && (u.roleName?.includes('Valet') || u.roleId?.includes('valet'))) ||
      (roleFilter === 'role-mis-auditor' && (u.roleName?.includes('Auditor') || u.roleId?.includes('audit') || u.roleId?.includes('mis'))) ||
      (roleFilter === 'role-gate-attendant' && (u.roleName?.includes('Gate') || u.roleName?.includes('Attendant') || u.roleId?.includes('gate') || u.roleId?.includes('attendant')));

    const matchesSite =
      siteFilter === 'ALL' ||
      u.siteScopeType === 'ALL_SITES' ||
      (u.assignedSiteIds && u.assignedSiteIds.includes(siteFilter));

    return matchesQuery && matchesRole && matchesSite;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner - Enterprise RBAC */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 font-mono text-xs font-bold border border-blue-500/30 flex items-center gap-1.5 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                ENTERPRISE RBAC & SITE MAPPING
              </span>
              <span className="text-slate-400 text-xs font-mono">ParkOrbit v4.8</span>
            </div>
            <h2 className="text-2xl font-black font-sans tracking-tight flex items-center gap-2">
              User Management <span className="text-slate-500 font-light">|</span> Role-Based Access Control
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Configure fine-grained module access rights (Floor Plan, ValetX, MIS Logs, Analytics, Site Config) mapped to site-level operational scopes.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700 text-xs font-semibold flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync System</span>
            </button>

            <button
              onClick={() => {
                setEditingUser({
                  fullName: '',
                  username: '',
                  email: '',
                  phone: '',
                  designation: 'Site Operations Lead',
                  roleId: roles[1]?.id || 'role-site-manager',
                  siteScopeType: 'SPECIFIC_SITES',
                  assignedSiteIds: [sites[0]?.id || 'site-1'],
                  status: 'ACTIVE',
                  customModuleOverrides: {},
                });
                setIsSiteDropdownOpen(false);
                setSiteSearchTerm('');
                setShowUserModal(true);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Provision New User</span>
            </button>
          </div>
        </div>

        {/* Quick RBAC Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Total Active Users</span>
            <span className="text-xl font-black text-white">{users.length} Accounted</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Configured System Roles</span>
            <span className="text-xl font-black text-blue-400">{roles.length} Access Roles</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Enterprise Sites Mapped</span>
            <span className="text-xl font-black text-emerald-400">{sites.length} Active Hubs</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Secured Modules</span>
            <span className="text-xl font-black text-purple-400">{MODULE_DEFINITIONS.length} Functional Apps</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200 font-sans text-xs font-bold gap-6">
        <button
          onClick={() => setActiveTab('USERS')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'USERS'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory & Site Scopes ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ROLES')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'ROLES'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Module Permission Matrix ({roles.length} Roles)</span>
        </button>

        <button
          onClick={() => setActiveTab('SITE_MAPPING')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'SITE_MAPPING'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Site-Level User Allocation</span>
        </button>

        <button
          onClick={() => setActiveTab('SIMULATOR')}
          className={`pb-3 border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'SIMULATOR'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Eye className="w-4 h-4 text-purple-600" />
          <span>Role View Simulator</span>
        </button>
      </div>

      {/* TAB 1: USER DIRECTORY & SITE SCOPES */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by full name, username, email, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center space-x-3 text-xs font-semibold text-slate-700">
              <div className="flex items-center space-x-1.5">
                <span>Filter Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 bg-white"
                >
                  <option value="ALL">All Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roleName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span>Site Scope:</span>
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 bg-white"
                >
                  <option value="ALL">All Sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-mono text-[11px] uppercase border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">User Identity</th>
                    <th className="py-3 px-4 font-bold">Assigned Role</th>
                    <th className="py-3 px-4 font-bold">Site Level Mapping</th>
                    <th className="py-3 px-4 font-bold">Module Access Status</th>
                    <th className="py-3 px-4 font-bold">Account Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-xs shadow-sm">
                            {user.fullName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{user.fullName}</span>
                            <span className="text-slate-400 font-mono text-[11px]">@{user.username} • {user.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-mono text-xs font-bold border border-blue-200 inline-block">
                          {user.roleName}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{user.designation}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        {user.siteScopeType === 'ALL_SITES' ? (
                          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 font-mono text-xs font-bold border border-purple-200 inline-flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-purple-600" />
                            ALL ENTERPRISE SITES
                          </span>
                        ) : (
                          <div className="space-y-1">
                            {user.assignedSiteNames?.map((sName, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-medium rounded border border-slate-200 flex items-center gap-1 w-max">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {sName}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1">
                          {MODULE_DEFINITIONS.slice(0, 6).map((mod) => {
                            const userRole = roles.find((r) => r.id === user.roleId);
                            const defaultEnabled = userRole?.modulePermissions?.[mod.id]?.enabled ?? false;
                            const isOverridden = user.customModuleOverrides?.[mod.id];
                            const isEnabled = isOverridden !== undefined ? isOverridden : defaultEnabled;

                            return (
                              <button
                                key={mod.id}
                                title={`${mod.label}: ${isEnabled ? 'ENABLED' : 'DISABLED'}`}
                                onClick={() => handleModuleToggle(user.id, mod.id, isEnabled)}
                                className={`w-6 h-6 rounded flex items-center justify-center transition-transform hover:scale-110 ${
                                  isEnabled
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-slate-100 text-slate-300 border border-slate-200'
                                }`}
                              >
                                {isEnabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            user.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setIsSiteDropdownOpen(false);
                              setSiteSearchTerm('');
                              setShowUserModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100"
                            title="Edit User & Permissions"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleGenerateResetToken(user.id, user.fullName)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-slate-100"
                            title="Generate password reset token"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteUser(user.id, user.fullName)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                            title="Remove User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MODULE PERMISSION MATRIX */}
      {activeTab === 'ROLES' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-sans">Role Permission Matrix & Module Toggles</h3>
                <p className="text-xs text-slate-500">
                  Enable or disable entire functional modules or configure fine-grained Create, Edit, Delete, and MIS Export capabilities per role.
                </p>
              </div>

              <button
                onClick={() => {
                  const defaultPerms: any = {};
                  MODULE_DEFINITIONS.forEach((m) => {
                    defaultPerms[m.id] = { enabled: true, canCreate: true, canEdit: true, canDelete: false, canExport: true };
                  });
                  setEditingRole({
                    roleName: 'Custom Field Specialist',
                    roleCode: 'CUSTOM',
                    description: 'Custom tailored role with custom module access.',
                    isSystemDefault: false,
                    siteScope: 'ASSIGNED_SITES_ONLY',
                    modulePermissions: defaultPerms,
                  });
                  setShowRoleModal(true);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Custom Role</span>
              </button>
            </div>

            {/* Roles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white hover:border-blue-300 transition-all shadow-sm relative"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-sm text-slate-900 font-sans">{role.roleName}</span>
                        {role.isSystemDefault && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 font-mono text-[9px] rounded font-bold uppercase">
                            SYSTEM DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        setEditingRole(role);
                        setShowRoleModal(true);
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg transition-colors"
                      title="Edit Permissions Matrix"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Module Access Summary Badges */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">
                      Module Access Breakdown
                    </span>

                    <div className="flex flex-wrap gap-1.5">
                      {MODULE_DEFINITIONS.map((m) => {
                        const isEnabled = role.modulePermissions?.[m.id]?.enabled;
                        const labelText = m.label || (m.id as string) || '';
                        return (
                          <span
                            key={m.id}
                            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-lg border ${
                              isEnabled
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            {labelText.split(' ')[0] || labelText}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SITE LEVEL USER ALLOCATION */}
      {activeTab === 'SITE_MAPPING' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sites.map((site) => {
            const siteUsers = users.filter(
              (u) => u.siteScopeType === 'ALL_SITES' || (u.assignedSiteIds && u.assignedSiteIds.includes(site.id))
            );

            return (
              <div key={site.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-blue-600 uppercase block">{site.siteCode}</span>
                    <h4 className="font-extrabold text-sm text-slate-900 font-sans">{site.siteName}</h4>
                    <span className="text-xs text-slate-400">{site.city} • {site.totalSlots} Slots</span>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-mono text-xs font-bold rounded-lg">
                    {siteUsers.length} Operators
                  </span>
                </div>

                <div className="space-y-2 font-sans text-xs">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                    Assigned Personnel
                  </span>

                  {siteUsers.map((usr) => (
                    <div key={usr.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block">{usr.fullName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{usr.roleName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-bold">
                        {usr.siteScopeType === 'ALL_SITES' ? 'MASTER SCOPE' : 'SITE SCOPE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: ROLE VIEW SIMULATOR */}
      {activeTab === 'SIMULATOR' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-white max-w-2xl mx-auto space-y-6 shadow-2xl">
          <div className="text-center space-y-1">
            <span className="px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold border border-purple-500/30">
              SIMULATION CONSOLE
            </span>
            <h3 className="text-xl font-black font-sans">Role View & Permission Testing Simulator</h3>
            <p className="text-slate-400 text-xs">
              Select any user account to test how ParkOrbit dynamically adjusts UI navigation tabs and permissions.
            </p>
          </div>

          <div className="space-y-3 font-sans text-xs">
            {users.map((usr) => {
              const roleConfig = roles.find((r) => r.id === usr.roleId);
              return (
                <div
                  key={usr.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between hover:border-purple-500 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{usr.fullName}</span>
                      <span className="px-2 py-0.5 bg-purple-900/60 text-purple-300 font-mono text-[10px] font-bold rounded">
                        {usr.roleName}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs">
                      Site Mapping: {usr.siteScopeType === 'ALL_SITES' ? 'All Sites' : usr.assignedSiteNames?.join(', ')}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (onSelectSimulatedUser) {
                        onSelectSimulatedUser(usr);
                        showToast('success', `Switched active context to: ${usr.fullName} (${usr.roleName}). Top bar permissions updated.`);
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-colors flex items-center space-x-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Switch Profile</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* EDIT/CREATE USER MODAL */}
      {showUserModal && editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser.id ? 'Edit User Credentials & Permissions' : 'Provision New System User'}
                </h3>
              </div>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserSubmit} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editingUser.fullName || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={editingUser.username || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    required
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Job Designation</label>
                  <input
                    type="text"
                    value={editingUser.designation || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, designation: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Assigned Role *</label>
                  <select
                    value={editingUser.roleId || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, roleId: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-blue-600 bg-white"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roleName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">
                    {editingUser.id ? 'Set New Security Password (Leave blank to keep unchanged)' : 'Initial Account Password *'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser.id ? '•••••••••••• (Leave blank to keep existing password)' : 'Enter strong password (min 6 chars)'}
                    value={(editingUser as any).plainPassword || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, plainPassword: e.target.value } as any)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-600 placeholder:text-slate-400"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Passwords are encrypted using PBKDF2 with unique cryptographic salts.
                  </p>
                </div>
              </div>

              {/* Site Level Scope */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 font-bold">Site-Level Access Scope *</label>
                  {editingUser.siteScopeType === 'SPECIFIC_SITES' && (
                    <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      {(editingUser.assignedSiteIds || []).length} of {sites.length} sites assigned
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="siteScope"
                      checked={editingUser.siteScopeType === 'ALL_SITES'}
                      onChange={() => {
                        setEditingUser({ ...editingUser, siteScopeType: 'ALL_SITES' });
                        setIsSiteDropdownOpen(false);
                      }}
                    />
                    <span className="font-semibold text-slate-800">All Enterprise Sites (Master Access)</span>
                  </label>

                  <label className="flex items-center space-x-2 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="siteScope"
                      checked={editingUser.siteScopeType === 'SPECIFIC_SITES'}
                      onChange={() => {
                        setEditingUser({
                          ...editingUser,
                          siteScopeType: 'SPECIFIC_SITES',
                          assignedSiteIds: editingUser.assignedSiteIds && editingUser.assignedSiteIds.length > 0
                            ? editingUser.assignedSiteIds
                            : [sites[0]?.id || 'site-1']
                        });
                      }}
                    />
                    <span className="font-semibold text-slate-800">Specific Assigned Sites Only</span>
                  </label>
                </div>

                {editingUser.siteScopeType === 'SPECIFIC_SITES' && (
                  <div className="space-y-3 pt-1">
                    {/* Dropdown Selector Component */}
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase font-mono mb-1">
                        Select from Registered Sites Dropdown
                      </label>

                      {/* Dropdown Trigger Button */}
                      <button
                        type="button"
                        onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
                        className={`w-full border rounded-xl px-3.5 py-2.5 bg-white text-left flex items-center justify-between shadow-sm transition-all ${
                          isSiteDropdownOpen
                            ? 'border-blue-600 ring-2 ring-blue-500/20'
                            : 'border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 overflow-hidden">
                          <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                          {(!editingUser.assignedSiteIds || editingUser.assignedSiteIds.length === 0) ? (
                            <span className="text-slate-400 font-medium text-xs">
                              Click to choose from all {sites.length} registered sites...
                            </span>
                          ) : (
                            <div className="flex items-center space-x-2 truncate">
                              <span className="font-bold text-slate-900 text-xs">
                                {editingUser.assignedSiteIds.length === 1
                                  ? sites.find(s => s.id === editingUser.assignedSiteIds![0])?.siteName || '1 Site Selected'
                                  : `${editingUser.assignedSiteIds.length} Registered Sites Assigned`}
                              </span>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 font-mono text-[10px] font-bold rounded-full">
                                {editingUser.assignedSiteIds.length} Selected
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                          {isSiteDropdownOpen ? (
                            <ChevronUp className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                      </button>

                      {/* Dropdown Menu Box */}
                      {isSiteDropdownOpen && (
                        <div className="mt-1.5 p-3 bg-white border border-slate-200 rounded-2xl shadow-xl space-y-2.5 z-30 relative animate-in fade-in duration-150">
                          {/* Search and Quick Filters */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="text"
                              value={siteSearchTerm}
                              onChange={(e) => setSiteSearchTerm(e.target.value)}
                              placeholder="Search registered sites by name, code, or city..."
                              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500 focus:bg-white"
                            />
                            {siteSearchTerm && (
                              <button
                                type="button"
                                onClick={() => setSiteSearchTerm('')}
                                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Quick Selection Actions */}
                          <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100">
                            <span className="font-mono text-slate-400 uppercase font-bold text-[10px]">
                              Registered Sites Directory ({sites.length})
                            </span>
                            <div className="flex items-center space-x-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser({
                                    ...editingUser,
                                    assignedSiteIds: sites.map((s) => s.id),
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-700 font-bold hover:underline"
                              >
                                Select All ({sites.length})
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser({
                                    ...editingUser,
                                    assignedSiteIds: [],
                                  });
                                }}
                                className="text-rose-600 hover:text-rose-700 font-bold hover:underline"
                              >
                                Clear All
                              </button>
                            </div>
                          </div>

                          {/* Sites List */}
                          <div className="max-h-52 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {sites
                              .filter((st) => {
                                if (!siteSearchTerm) return true;
                                const q = siteSearchTerm.toLowerCase();
                                return (
                                  st.siteName.toLowerCase().includes(q) ||
                                  st.siteCode.toLowerCase().includes(q) ||
                                  st.city.toLowerCase().includes(q) ||
                                  (st.address && st.address.toLowerCase().includes(q))
                                );
                              })
                              .map((st) => {
                                const isAssigned = (editingUser.assignedSiteIds || []).includes(st.id);
                                return (
                                  <div
                                    key={st.id}
                                    onClick={() => {
                                      const current = editingUser.assignedSiteIds || [];
                                      const updated = isAssigned
                                        ? current.filter((id) => id !== st.id)
                                        : [...current, st.id];
                                      setEditingUser({ ...editingUser, assignedSiteIds: updated });
                                    }}
                                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                                      isAssigned
                                        ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-xs'
                                        : 'bg-slate-50/50 hover:bg-slate-100 border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2.5">
                                      <div className="text-blue-600 shrink-0">
                                        {isAssigned ? (
                                          <CheckSquare className="w-4 h-4 text-blue-600" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-400" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="flex items-center space-x-1.5">
                                          <span className="px-1.5 py-0.2 bg-slate-200 text-slate-800 font-mono text-[10px] font-bold rounded">
                                            {st.siteCode}
                                          </span>
                                          <span className="font-bold text-xs text-slate-900">{st.siteName}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 block">
                                          {st.city} • {st.totalSlots} Slots • {st.status}
                                        </span>
                                      </div>
                                    </div>

                                    {isAssigned && (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded-md shrink-0">
                                        Assigned
                                      </span>
                                    )}
                                  </div>
                                );
                              })}

                            {sites.filter((st) => {
                              if (!siteSearchTerm) return true;
                              const q = siteSearchTerm.toLowerCase();
                              return (
                                st.siteName.toLowerCase().includes(q) ||
                                st.siteCode.toLowerCase().includes(q) ||
                                st.city.toLowerCase().includes(q)
                              );
                            }).length === 0 && (
                              <div className="py-4 text-center text-slate-400 text-xs">
                                No registered sites found matching "{siteSearchTerm}"
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsSiteDropdownOpen(false)}
                            className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-center text-xs transition-colors"
                          >
                            Done Selecting Sites
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Assigned Sites Tags / Chips Preview */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                        Assigned Sites Badges (Click '✕' to remove)
                      </span>

                      {(!editingUser.assignedSiteIds || editingUser.assignedSiteIds.length === 0) ? (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2 text-amber-800 text-xs">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>No specific sites selected. Please select at least one site from the dropdown.</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                          {editingUser.assignedSiteIds.map((sid) => {
                            const siteObj = sites.find((s) => s.id === sid);
                            const name = siteObj ? siteObj.siteName : sid;
                            const code = siteObj ? siteObj.siteCode : sid;
                            return (
                              <span
                                key={sid}
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-slate-300 text-slate-800 rounded-lg text-xs shadow-xs font-medium"
                              >
                                <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                                <span className="font-mono font-bold text-blue-700">{code}:</span>
                                <span className="truncate max-w-[180px]">{name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const current = editingUser.assignedSiteIds || [];
                                    setEditingUser({
                                      ...editingUser,
                                      assignedSiteIds: current.filter((id) => id !== sid),
                                    });
                                  }}
                                  className="text-slate-400 hover:text-rose-600 ml-1 rounded p-0.5 transition-colors"
                                  title={`Remove ${name}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                >
                  Save User Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ROLE PERMISSIONS MATRIX MODAL */}
      {showRoleModal && editingRole && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Configure Permissions Matrix for Role: '{editingRole.roleName}'
                </h3>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoleSubmit} className="space-y-5 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Role Title *</label>
                  <input
                    type="text"
                    required
                    value={editingRole.roleName || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, roleName: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Role Description</label>
                  <input
                    type="text"
                    value={editingRole.description || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Module Toggle Grid */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-900 uppercase font-mono block">
                  Module Enable / Disable Toggles & Action Rights
                </span>

                <div className="space-y-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {MODULE_DEFINITIONS.map((mod) => {
                    const rights = editingRole.modulePermissions?.[mod.id] || {
                      enabled: false,
                      canCreate: false,
                      canEdit: false,
                      canDelete: false,
                      canExport: false,
                    };

                    const IconComp = mod.icon;

                    return (
                      <div key={mod.id} className="p-3 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-3 max-w-sm">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                              rights.enabled ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'
                            }`}
                          >
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{mod.label}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{mod.description}</span>
                          </div>
                        </div>

                        {/* Toggle Switches */}
                        <div className="flex items-center space-x-3 font-mono text-[11px]">
                          <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={rights.enabled}
                              onChange={() => handleRoleModulePermissionToggle(mod.id, 'enabled')}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span>Module Access</span>
                          </label>

                          {rights.enabled && (
                            <>
                              <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={rights.canCreate}
                                  onChange={() => handleRoleModulePermissionToggle(mod.id, 'canCreate')}
                                />
                                <span>Create</span>
                              </label>

                              <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={rights.canEdit}
                                  onChange={() => handleRoleModulePermissionToggle(mod.id, 'canEdit')}
                                />
                                <span>Edit</span>
                              </label>

                              <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={rights.canExport}
                                  onChange={() => handleRoleModulePermissionToggle(mod.id, 'canExport')}
                                />
                                <span>MIS Export</span>
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                >
                  Save Role Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRMATION MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remove User Account</h3>
                <p className="text-xs text-rose-600 font-semibold">Confirm Revocation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove user account <strong className="text-slate-900 font-bold">'{userToDelete.name}'</strong>? Their RBAC credentials, session tokens, and portal access rights will be permanently revoked.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Revoke Access</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTokenResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-amber-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                <KeyRound className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Reset Token Generated</h3>
                <p className="text-xs text-amber-600 font-semibold">For {resetTokenResult.userName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Share this token with {resetTokenResult.userName} directly — in person, over chat, however
              you'd normally reach them. It works only once and expires in 1 hour. Anyone who has this
              token can set that account's password, so send it only to the account owner.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs break-all select-all">
              {resetTokenResult.token}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(resetTokenResult.token);
                  showToast('success', 'Token copied to clipboard.');
                }}
                className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Copy Token
              </button>
              <button
                type="button"
                onClick={() => setResetTokenResult(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in max-w-md">
          <div className={`p-4 rounded-xl border shadow-xl flex items-center space-x-3 ${
            toastMsg.type === 'success' 
              ? 'bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/30' 
              : 'bg-rose-900 text-white border-rose-500/50 shadow-rose-950/30'
          }`}>
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="ml-auto text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
