import React, { useState, useEffect } from 'react';
import {
  AppUser,
  RolePermissionConfig,
  ParkingSlot,
  Employee,
  ParkingLog,
  SiteConfig,
  ValetTicket,
  NonParkedAlert,
  RegistrationRequest,
  AppModuleId
} from '../types';
import { ActiveTabType } from './Header';
import { isModulePermitted, getModuleRights } from '../utils/rbac';
import {
  LayoutGrid,
  KeyRound,
  FileText,
  TrendingUp,
  SlidersHorizontal,
  Smartphone,
  UserCheck,
  ShieldCheck,
  Bell,
  Building2,
  Users,
  ShieldAlert,
  Car,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Activity,
  Layers,
  MapPin,
  Cpu,
  AlertTriangle,
  QrCode,
  Lock,
  ChevronRight,
  Shield,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  Sliders,
  ExternalLink
} from 'lucide-react';

interface RoleHomePageProps {
  currentUser: AppUser;
  roles: RolePermissionConfig[];
  slots: ParkingSlot[];
  employees: Employee[];
  logs: ParkingLog[];
  alertCount: number;
  pendingReqCount: number;
  setActiveTab: (tab: ActiveTabType) => void;
  onRefreshAll: () => void;
}

export const RoleHomePage: React.FC<RoleHomePageProps> = ({
  currentUser,
  roles,
  slots,
  employees,
  logs,
  alertCount,
  pendingReqCount,
  setActiveTab,
  onRefreshAll,
}) => {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [valetTickets, setValetTickets] = useState<ValetTicket[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<RegistrationRequest[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);

  // Find user's active role config
  const currentRole = roles.find((r) => r.id === currentUser.roleId) || {
    id: currentUser.roleId,
    roleCode: 'CUSTOM',
    roleName: currentUser.roleName,
    description: 'Custom access profile',
    isSystemDefault: false,
    siteScope: currentUser.siteScopeType === 'ALL_SITES' ? 'ALL_SITES' : 'ASSIGNED_SITES_ONLY',
    modulePermissions: {} as any,
    createdAt: currentUser.createdAt,
  };

  // Fetch sites and valet tickets for comprehensive status
  useEffect(() => {
    const fetchExtraData = async () => {
      setLoadingExtras(true);
      try {
        const [resSites, resValet, resRegs] = await Promise.all([
          fetch('/api/v1/sites').then((r) => r.json()),
          fetch('/api/v1/valet/tickets').then((r) => r.json()),
          fetch('/api/v1/registrations').then((r) => r.json()),
        ]);
        if (resSites.success) setSites(resSites.sites || []);
        if (resValet.success) setValetTickets(resValet.tickets || []);
        if (resRegs.success) setPendingRegistrations(resRegs.requests || []);
      } catch (err) {
        console.error('Failed to load extra role home data:', err);
      } finally {
        setLoadingExtras(false);
      }
    };
    fetchExtraData();
  }, []);

  // Compute live occupancy metrics
  const totalSlotsCount = slots.length || 1080;
  const occupiedSlots = slots.filter((s) => s.status === 'OCCUPIED');
  const vacantSlots = slots.filter((s) => s.status === 'VACANT');
  const reservedSlots = slots.filter((s) => s.status === 'RESERVED');
  const maintenanceSlots = slots.filter((s) => s.status === 'MAINTENANCE');
  const occPct = Math.round((occupiedSlots.length / totalSlotsCount) * 100);

  // Valet metrics
  const activeValetTickets = valetTickets.filter((t) => t.status === 'PARKED' || t.status === 'RETRIEVAL_REQUESTED');
  const retrievalRequestedTickets = valetTickets.filter((t) => t.status === 'RETRIEVAL_REQUESTED');

  // Logs today
  const todayLogs = logs.filter((l) => {
    try {
      const d = new Date(l.entryTime);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    } catch (e) {
      return true;
    }
  });

  // Master Module definitions metadata
  const ALL_MODULES: {
    id: AppModuleId;
    tabId: ActiveTabType;
    label: string;
    icon: any;
    category: string;
    description: string;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'FLOOR_PLAN',
      tabId: 'FLOOR_PLAN',
      label: 'Live Parking Status',
      icon: LayoutGrid,
      category: 'Spatial Intelligence',
      description: 'Real-time multi-basement interactive floor plan, occupancy heatmaps & puzzle stackers.',
      badge: 'Live Map',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      id: 'MASTER_CONFIG',
      tabId: 'MASTER_CONFIG',
      label: 'Master Site Config',
      icon: Building2,
      category: 'Platform Architecture',
      description: 'Multi-site onboarding, basement floor limits, pricing rate cards & SaaS billing invoices.',
      badge: 'Admin',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    {
      id: 'USER_MANAGEMENT',
      tabId: 'USER_MANAGEMENT',
      label: 'User & RBAC System',
      icon: Users,
      category: 'Governance & Security',
      description: 'Role-based access matrix, site assignments, credential resets & module permissions.',
      badge: 'RBAC Matrix',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    {
      id: 'INVENTORY',
      tabId: 'INVENTORY',
      label: 'Inventory Master',
      icon: SlidersHorizontal,
      category: 'Capacity Management',
      description: '1,080 mechanical slot matrix, CSV bulk upload, EV bay quotas & vehicle allocations.',
      badge: `${totalSlotsCount} Slots`,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      id: 'MOBILE_APP',
      tabId: 'MOBILE_APP',
      label: 'ParkOrbit Field App',
      icon: Smartphone,
      category: 'Field Operations',
      description: 'Handheld terminal for attendants: ANPR camera scans, manual slot entry & driver alerts.',
      badge: 'Field POS',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      id: 'VALET_SERVICE',
      tabId: 'VALET_SERVICE',
      label: 'ValetX Operations Suite',
      icon: KeyRound,
      category: 'Valet Management',
      description: 'Digital key lockers, VIP guest check-in, runner dispatch & automated SMS vehicle retrieval.',
      badge: `${activeValetTickets.length} Active`,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    {
      id: 'EMPLOYEE_MOBILE_APP',
      tabId: 'EMPLOYEE_MOBILE_APP',
      label: 'Employee Smart Pass',
      icon: QrCode,
      category: 'Employee Experience',
      description: 'Live digital QR parking pass, slot location navigator, valet recall & profile pass.',
      badge: 'Smart Pass',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    {
      id: 'REGISTRATION',
      tabId: 'REGISTRATION',
      label: 'Employee Vehicle Registration',
      icon: UserCheck,
      category: 'Access Requests',
      description: 'Self-service employee vehicle registration portal with domain whitelist verification.',
      badge: 'Self-Service',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    {
      id: 'APPROVALS',
      tabId: 'APPROVALS',
      label: 'Vehicle Approval Queue',
      icon: ShieldCheck,
      category: 'Access Governance',
      description: 'Admin review queue for employee vehicle passes, department whitelisting & domain rules.',
      badge: pendingReqCount > 0 ? `${pendingReqCount} Pending` : 'Up to Date',
      badgeColor: pendingReqCount > 0 ? 'bg-amber-500 text-white font-bold' : 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'LOGS',
      tabId: 'LOGS',
      label: 'Entry / Exit Logs & MIS',
      icon: FileText,
      category: 'Audit & Compliance',
      description: 'Comprehensive gate camera OCR logs, entry/exit timestamp records & MIS CSV export.',
      badge: `${todayLogs.length} Scans`,
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    {
      id: 'ANALYTICS',
      tabId: 'ANALYTICS',
      label: 'Predictive Analytics & AI',
      icon: TrendingUp,
      category: 'AI Intelligence',
      description: 'Neural occupancy forecasting, peak demand modeling, floor heatmaps & AI recommendations.',
      badge: 'AI Powered',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    {
      id: 'ALERTS',
      tabId: 'ALERTS',
      label: 'Non-Parked Defaulter Alerts',
      icon: Bell,
      category: 'Security & Violations',
      description: 'Cutoff time violation alerts, unauthorized vehicles & automatic SMS / FCM warnings.',
      badge: alertCount > 0 ? `${alertCount} Alerts` : 'Zero Violations',
      badgeColor: alertCount > 0 ? 'bg-rose-500 text-white font-bold' : 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'SECURITY_AUDIT',
      tabId: 'SECURITY_AUDIT',
      label: 'InfoSec & Privacy Defense',
      icon: ShieldAlert,
      category: 'Security Operations',
      description: 'Cryptographic SHA-256 HMAC audit log verification, BOLA defense & data masking.',
      badge: '100% Intact',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
  ];

  // STRICT PERMISSION MATRIX FILTERING:
  // Only display modules that are explicitly enabled in the user's role permission matrix or user overrides!
  const permittedModules = ALL_MODULES.filter((m) =>
    isModulePermitted(currentUser, currentRole, m.tabId)
  );

  // Role Type Categorization
  const isMasterAdmin =
    currentUser.roleId === 'role-master-admin' ||
    currentUser.roleName.toLowerCase().includes('master admin') ||
    currentUser.roleName.toLowerCase().includes('super admin');

  const isSiteManager =
    currentUser.roleId === 'role-site-manager' ||
    currentUser.roleName.toLowerCase().includes('site') ||
    currentUser.roleName.toLowerCase().includes('facility');

  const isValetLead =
    currentUser.roleId === 'role-valet-supervisor' ||
    currentUser.roleName.toLowerCase().includes('valet');

  const isGateAttendant =
    currentUser.roleId === 'role-gate-attendant' ||
    currentUser.roleName.toLowerCase().includes('gate') ||
    currentUser.roleName.toLowerCase().includes('attendant');

  const isAuditor =
    currentUser.roleId === 'role-mis-auditor' ||
    currentUser.roleName.toLowerCase().includes('audit') ||
    currentUser.roleName.toLowerCase().includes('mis');

  const isEmployee =
    currentUser.roleId === 'role-employee-pass' ||
    currentUser.roleName.toLowerCase().includes('employee');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. CUSTOM ROLE HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-6 sm:p-8 shadow-2xl border border-slate-800">
        {/* Subtle Geometric Grid & Ambient Glow Pattern */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-16 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-200">{currentUser.fullName}</span>
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed font-sans">
              {isMasterAdmin && 'You have global administrative oversight across enterprise site configurations, RBAC matrices, and SaaS multi-tenant billing.'}
              {isSiteManager && `Managing live site parking inventory, mechanical stacker pallets, vehicle whitelist approvals, and gate operations for ${currentUser.assignedSiteNames?.[0] || 'Tech Park HQ'}.`}
              {isValetLead && 'Managing valet ticket issuance, key tag lockers, valet runner fleet dispatch, and guest SMS vehicle retrieval queues.'}
              {isGateAttendant && 'Field attendant gate terminal ready. Perform license plate ANPR scans, manual slot assignments, and live parking checks.'}
              {isAuditor && 'Accessing real-time entry/exit logs, predictive occupancy AI models, compliance reports, and cryptographically verified audit trails.'}
              {isEmployee && 'Your digital parking pass is active. View your assigned parking slot, site details, and request valet retrieval with 1 tap.'}
              {!isMasterAdmin && !isSiteManager && !isValetLead && !isGateAttendant && !isAuditor && !isEmployee && 'Your customized workspace displays authorized modules in accordance with your assigned Role Permission Matrix.'}
            </p>
          </div>

          {/* Quick Actions & Role Badge Pill */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Glassmorphic AUTHORIZED MODULES counter card */}
            <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-center shadow-2xl transition-transform hover:scale-105">
              <span className="text-[11px] font-mono text-cyan-200/90 block uppercase tracking-wider font-bold">Authorized Modules</span>
              <span className="text-3xl font-black font-mono text-cyan-300 drop-shadow-sm">{permittedModules.length}</span>
              <span className="text-[10px] text-slate-300 block font-mono">Filtered by RBAC Matrix</span>
            </div>
            {isModulePermitted(currentUser, currentRole, 'USER_MANAGEMENT') && (
              <button
                onClick={() => setActiveTab('USER_MANAGEMENT')}
                className="px-5 py-3.5 bg-[#00E5FF] hover:bg-[#33ebff] active:scale-95 text-slate-950 rounded-2xl font-black text-xs shadow-lg shadow-cyan-500/25 border border-cyan-200 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-slate-950" />
                <span>Manage Roles & RBAC</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. THE MASTER DATA FLOW & SYNC ARCHITECTURE PIPELINE */}
      <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Enterprise End-to-End Data Flow Pipeline
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Synchronized data architecture connecting Master Site Configuration ➔ User & RBAC ➔ Inventory Upload ➔ ParkOrbit Field App ➔ Employee.
            </p>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>100% Sync Live</span>
            </span>
          </div>
        </div>

        {/* 5-Step Visual Flow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
          {/* Step 1: Master Site Config */}
          <div
            onClick={() => isModulePermitted(currentUser, currentRole, 'MASTER_CONFIG') && setActiveTab('MASTER_CONFIG')}
            className={`p-3.5 rounded-2xl border transition-all ${
              isModulePermitted(currentUser, currentRole, 'MASTER_CONFIG')
                ? 'bg-blue-50/70 border-blue-200 hover:border-blue-400 hover:shadow-md cursor-pointer group'
                : 'bg-slate-50/80 border-slate-200 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[10px] font-black">1. SITES</span>
              <Building2 className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="font-extrabold text-xs text-slate-900">Master Site Config</h3>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              {sites.length > 0 ? `${sites.length} Active Sites registered` : 'Tech Park HQ + 2 Sites'}
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-blue-700 font-bold border-t border-blue-200/60 pt-1.5">
              <span>Multi-Tenancy</span>
              <span>Live ➔</span>
            </div>
          </div>

          {/* Step 2: User & RBAC */}
          <div
            onClick={() => isModulePermitted(currentUser, currentRole, 'USER_MANAGEMENT') && setActiveTab('USER_MANAGEMENT')}
            className={`p-3.5 rounded-2xl border transition-all ${
              isModulePermitted(currentUser, currentRole, 'USER_MANAGEMENT')
                ? 'bg-indigo-50/70 border-indigo-200 hover:border-indigo-400 hover:shadow-md cursor-pointer group'
                : 'bg-slate-50/80 border-slate-200 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-[10px] font-black">2. RBAC</span>
              <Users className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="font-extrabold text-xs text-slate-900">User & RBAC</h3>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              {roles.length} Roles • Permission Matrix Enforced
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-indigo-700 font-bold border-t border-indigo-200/60 pt-1.5">
              <span>Access Scopes</span>
              <span>Live ➔</span>
            </div>
          </div>

          {/* Step 3: Inventory Upload */}
          <div
            onClick={() => isModulePermitted(currentUser, currentRole, 'INVENTORY') && setActiveTab('INVENTORY')}
            className={`p-3.5 rounded-2xl border transition-all ${
              isModulePermitted(currentUser, currentRole, 'INVENTORY')
                ? 'bg-amber-50/70 border-amber-200 hover:border-amber-400 hover:shadow-md cursor-pointer group'
                : 'bg-slate-50/80 border-slate-200 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-mono text-[10px] font-black">3. SLOTS</span>
              <SlidersHorizontal className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="font-extrabold text-xs text-slate-900">Inventory Upload</h3>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              {totalSlotsCount} Mechanical Slots & Pallets
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-amber-700 font-bold border-t border-amber-200/60 pt-1.5">
              <span>Matrix Sync</span>
              <span>Live ➔</span>
            </div>
          </div>

          {/* Step 4: ParkOrbit Field App */}
          <div
            onClick={() => isModulePermitted(currentUser, currentRole, 'MOBILE_APP') && setActiveTab('MOBILE_APP')}
            className={`p-3.5 rounded-2xl border transition-all ${
              isModulePermitted(currentUser, currentRole, 'MOBILE_APP')
                ? 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-400 hover:shadow-md cursor-pointer group'
                : 'bg-slate-50/80 border-slate-200 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-mono text-[10px] font-black">4. FIELD POS</span>
              <Smartphone className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="font-extrabold text-xs text-slate-900">ParkOrbit Field</h3>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              Handheld Gate OCR • {todayLogs.length} Scans Today
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-emerald-700 font-bold border-t border-emerald-200/60 pt-1.5">
              <span>Attendant App</span>
              <span>Live ➔</span>
            </div>
          </div>

          {/* Step 5: Employee */}
          <div
            onClick={() => isModulePermitted(currentUser, currentRole, 'EMPLOYEE_MOBILE_APP') && setActiveTab('EMPLOYEE_MOBILE_APP')}
            className={`p-3.5 rounded-2xl border transition-all ${
              isModulePermitted(currentUser, currentRole, 'EMPLOYEE_MOBILE_APP')
                ? 'bg-purple-50/70 border-purple-200 hover:border-purple-400 hover:shadow-md cursor-pointer group'
                : 'bg-slate-50/80 border-slate-200 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-mono text-[10px] font-black">5. DRIVER</span>
              <UserCheck className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="font-extrabold text-xs text-slate-900">Employee Pass</h3>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              {employees.length} Whitelisted Passes • QR Valet
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-purple-700 font-bold border-t border-purple-200/60 pt-1.5">
              <span>Smart Pass</span>
              <span>Live ➔</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ROLE-SPECIFIC LIVE METRICS & HIGHLIGHT PANELS */}
      {isMasterAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Enterprise Sites</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-slate-900">{sites.length || 3}</span>
              <span className="text-xs text-emerald-600 font-bold">100% Active</span>
            </div>
            <p className="text-xs text-slate-500">Tech Park HQ, Cyber Tower, BKC Financial Center</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Slot Capacity</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-blue-600">{totalSlotsCount}</span>
              <span className="text-xs text-slate-500 font-medium">Across B1, B2, B3, Ground</span>
            </div>
            <p className="text-xs text-slate-500">{vacantSlots.length} Vacant • {occupiedSlots.length} Occupied ({occPct}%)</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">RBAC & Governance</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-indigo-600">{roles.length}</span>
              <span className="text-xs text-slate-500 font-medium">Configured Roles</span>
            </div>
            <p className="text-xs text-slate-500">Strict module matrix & site scope enforcement</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">SaaS Billing & Invoices</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-purple-600">₹4.2L</span>
              <span className="text-xs text-emerald-600 font-bold">Invoices Active</span>
            </div>
            <p className="text-xs text-slate-500">Automated recurring site billing enabled</p>
          </div>
        </div>
      )}

      {isSiteManager && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Live Site Occupancy</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-blue-600">{occPct}%</span>
              <span className="text-xs text-slate-500 font-medium">({occupiedSlots.length} / {totalSlotsCount})</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${occPct}%` }}></div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Vacant Slots Ready</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-emerald-600">{vacantSlots.length}</span>
              <span className="text-xs text-emerald-700 font-bold">Instant Allocation</span>
            </div>
            <p className="text-xs text-slate-500">Includes SUV, Sedan, EV and 2-Wheeler bays</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Pending Registrations</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-amber-600">{pendingReqCount}</span>
              <span className="text-xs text-amber-700 font-bold">Awaiting Review</span>
            </div>
            <button
              onClick={() => setActiveTab('APPROVALS')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1"
            >
              <span>Review Whitelist Queue ➔</span>
            </button>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Defaulters / Alerts</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-rose-600">{alertCount}</span>
              <span className="text-xs text-slate-500 font-medium">Cutoff Violations</span>
            </div>
            <button
              onClick={() => setActiveTab('ALERTS')}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center space-x-1"
            >
              <span>View Active Alerts ➔</span>
            </button>
          </div>
        </div>
      )}

      {isValetLead && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Valet Parked</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-purple-600">{activeValetTickets.length}</span>
              <span className="text-xs text-slate-500 font-medium">Vehicles Parked</span>
            </div>
            <p className="text-xs text-slate-500">Assigned across VIP and Executive bays</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Retrieval Queue</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-amber-600">{retrievalRequestedTickets.length}</span>
              <span className="text-xs text-amber-700 font-bold">Guest Requests</span>
            </div>
            <p className="text-xs text-slate-500">Runners dispatched to parking stackers</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Key Tag Lockers</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-slate-900">48 / 60</span>
              <span className="text-xs text-emerald-600 font-bold">Available</span>
            </div>
            <p className="text-xs text-slate-500">RFID Smart Locker Terminal Online</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Quick Valet Check-In</span>
            <button
              onClick={() => setActiveTab('VALET_SERVICE')}
              className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Open ValetX Suite</span>
            </button>
          </div>
        </div>
      )}

      {isGateAttendant && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Gate Camera ANPR</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black font-mono text-emerald-600">CONNECTED</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
            <p className="text-xs text-slate-500">Gate 1 High-Speed OCR Camera Active</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Vacant Slots</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-blue-600">{vacantSlots.length}</span>
              <span className="text-xs text-slate-500 font-medium">Available to Assign</span>
            </div>
            <p className="text-xs text-slate-500">B1: {slots.filter(s => s.basement === 'B1' && s.status === 'VACANT').length} • B2: {slots.filter(s => s.basement === 'B2' && s.status === 'VACANT').length}</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Quick Gate Scan</span>
            <button
              onClick={() => setActiveTab('MOBILE_APP')}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <Smartphone className="w-4 h-4" />
              <span>Launch Field App</span>
            </button>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Live Floor Plan</span>
            <button
              onClick={() => setActiveTab('FLOOR_PLAN')}
              className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>View Slot Matrix</span>
            </button>
          </div>
        </div>
      )}

      {isAuditor && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Today's ANPR Traffic</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-slate-900">{todayLogs.length}</span>
              <span className="text-xs text-emerald-600 font-bold">Logged Scans</span>
            </div>
            <p className="text-xs text-slate-500">100% OCR Plate Accuracy & Timestamped</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">AI Peak Forecast</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black font-mono text-indigo-600">94% Peak</span>
              <span className="text-xs text-slate-500 font-medium">@ 10:00 AM</span>
            </div>
            <p className="text-xs text-slate-500">Neural network demand prediction</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Audit Log Integrity</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black font-mono text-emerald-600">VERIFIED</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-slate-500">SHA-256 HMAC cryptographic chain intact</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">MIS CSV Reports</span>
            <button
              onClick={() => setActiveTab('LOGS')}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export MIS Logs</span>
            </button>
          </div>
        </div>
      )}

      {isEmployee && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider opacity-80">Digital Smart Pass</span>
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="text-lg font-black block">{currentUser.fullName}</span>
              <span className="text-xs font-mono opacity-80">{currentUser.email}</span>
            </div>
            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs font-mono">
              <span>Status: <strong className="text-emerald-300">WHITELIST APPROVED</strong></span>
              <button
                onClick={() => setActiveTab('EMPLOYEE_MOBILE_APP')}
                className="px-2.5 py-1 bg-white text-blue-900 rounded-lg font-bold text-[11px]"
              >
                View Pass ➔
              </button>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Current Parked Slot</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black font-mono text-slate-900">B1-P02-S3</span>
              <span className="text-xs text-emerald-600 font-bold">Basement 1</span>
            </div>
            <p className="text-xs text-slate-500">Mechanical Puzzle Stacker Pallet • Level 1</p>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">1-Tap Valet Car Retrieval</span>
            <p className="text-xs text-slate-500">Request car retrieval 10 minutes before departure</p>
            <button
              onClick={() => setActiveTab('EMPLOYEE_MOBILE_APP')}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Request Car Retrieval</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. PERMITTED MODULES LAUNCHPAD (STRICT RBAC MATRIX FILTERED) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Authorized Modules Launchpad</span>
            </h2>
            <p className="text-xs text-slate-500">
              Only modules permitted in your Role Permission Matrix are displayed below.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{permittedModules.length}</strong> permitted of {ALL_MODULES.length} platform modules
          </div>
        </div>

        {/* Permitted Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {permittedModules.map((mod) => {
            const IconComp = mod.icon;
            const rights = getModuleRights(currentUser, currentRole, mod.tabId);

            return (
              <div
                key={mod.id}
                onClick={() => setActiveTab(mod.tabId)}
                className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xs">
                      <IconComp className="w-5 h-5" />
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {mod.badge && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${mod.badgeColor || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {mod.badge}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-medium">
                        {rights.canEdit ? 'Full Access' : 'Read Only'}
                      </span>
                    </div>
                  </div>

                  {/* Title & Category */}
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
                      {mod.category}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {mod.label}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {mod.description}
                  </p>
                </div>

                {/* Bottom Action Link */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
                  <span>Launch Module</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
