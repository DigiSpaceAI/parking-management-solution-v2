import React from 'react';
import {
  Users,
  Sparkles,
  Layers,
  BarChart3,
  FileSpreadsheet,
  Cpu,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity,
  Car,
  UserPlus,
  CheckCheck,
  Home,
  QrCode
} from 'lucide-react';
import { ActiveTabType } from './Header';
import { AppUser, RolePermissionConfig } from '../types';
import { isModulePermitted } from '../utils/rbac';

interface SidebarProps {
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  alertCount: number;
  pendingReqCount: number;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  currentUser?: AppUser | null;
  roles?: RolePermissionConfig[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  alertCount,
  pendingReqCount,
  mobileOpen,
  setMobileOpen,
  currentUser,
  roles = [],
}) => {
  const currentRole = roles.find((r) => r.id === currentUser?.roleId);

  const rawNavItems: {
    id: ActiveTabType;
    label: string;
    icon: any;
    badge: any;
    badgeColor?: string;
    description: string;
  }[] = [
    {
      id: 'HOME',
      label: 'Role Home Dashboard',
      icon: Home,
      badge: 'Home',
      badgeColor: 'bg-indigo-600 text-white font-bold',
      description: 'Role-custom launchpad & sync pipeline',
    },
    {
      id: 'FLOOR_PLAN',
      label: 'Live Parking Status',
      icon: Layers,
      badge: 'Live',
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
      description: 'Real-time slot grid & sensors',
    },
    {
      id: 'REPORTS',
      label: 'Reports',
      icon: FileSpreadsheet,
      badge: null,
      description: 'Downloads, violations, overnight requests & utilisation',
    },
    {
      id: 'MASTER_CONFIG',
      label: 'Master Site Config',
      icon: Building2,
      badge: null,
      description: 'Multi-site setup & billing',
    },
    {
      id: 'USER_MANAGEMENT',
      label: 'User & RBAC',
      icon: Users,
      badge: null,
      badgeColor: 'bg-blue-100 text-blue-700',
      description: 'Access rights & role governance',
    },
    {
      id: 'INVENTORY',
      label: 'Inventory Master',
      icon: FileSpreadsheet,
      badge: null,
      description: '1,080 slot mechanical matrix',
    },
    {
      id: 'MOBILE_APP',
      label: 'ParkFlow Field',
      icon: Smartphone,
      badge: 'App',
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
      description: 'Attendant handheld terminal',
    },
    {
      id: 'VALET_SERVICE',
      label: 'ValetX Suite',
      icon: Sparkles,
      badge: 'VIP',
      badgeColor: 'bg-purple-100 text-purple-700 font-bold',
      description: 'Key dispatch & valet operations',
    },
    {
      id: 'EMPLOYEE_MOBILE_APP',
      label: 'Employee Smart Pass',
      icon: QrCode,
      badge: 'Mobile',
      badgeColor: 'bg-blue-600 text-white font-bold',
      description: 'Domain login & live parking pass',
    },
    {
      id: 'REGISTRATION',
      label: 'Employee Registration',
      icon: UserPlus,
      badge: null,
      badgeColor: 'bg-blue-100 text-blue-700',
      description: 'Vehicle registration portal',
    },
    {
      id: 'APPROVALS',
      label: 'Vehicle Approval Queue',
      icon: ShieldCheck,
      badge: pendingReqCount > 0 ? pendingReqCount : null,
      badgeColor: 'bg-amber-500 text-white font-black',
      description: 'Review & approve vehicle requests',
    },
    {
      id: 'LOGS',
      label: 'Entry / Exit Logs',
      icon: Cpu,
      badge: null,
      description: 'Gate camera OCR movement logs',
    },
    {
      id: 'ANALYTICS',
      label: 'Predictive Analytics',
      icon: BarChart3,
      badge: 'AI',
      badgeColor: 'bg-indigo-100 text-indigo-700 font-bold',
      description: 'Occupancy forecasting & heatmaps',
    },
    {
      id: 'ALERTS',
      label: 'Non-Parked Alerts',
      icon: AlertTriangle,
      badge: alertCount > 0 ? alertCount : null,
      badgeColor: 'bg-rose-500 text-white font-black',
      description: 'Defaulters & unauthorized cars',
    },
    {
      id: 'SECURITY_AUDIT',
      label: 'InfoSec & Privacy Defense',
      icon: Shield,
      badge: 'Secure',
      badgeColor: 'bg-emerald-500 text-white font-bold',
      description: 'Zero-trust, BOLA, PII & HMAC audit',
    },
  ];

  // ONLY display modules permitted by role permissions & user overrides!
  const navItems = rawNavItems.filter((item) =>
    isModulePermitted(currentUser, currentRole, item.id)
  );

  const handleSelect = (id: ActiveTabType) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        style={{ background: '#0f172a', color: '#cbd5e1', fontFamily: "'Barlow', system-ui, sans-serif" }}
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 border-r border-white/10 flex flex-col shrink-0 h-full transition-all duration-300 ease-in-out ${
          collapsed ? 'lg:w-20' : 'lg:w-64'
        } ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header / Brand */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }} className="shrink-0 flex items-center justify-between">
          {(!collapsed || mobileOpen) && (
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 700 }}>ParkFlow</div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.15, marginTop: 2, color: '#ffffff' }}>Navigation</div>
            </div>
          )}

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-auto"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Category Label */}
        {(!collapsed || mobileOpen) && (
          <div style={{ padding: '14px 14px 4px', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
            Navigation Modules
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-sidebar-scrollbar pr-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                title={collapsed && !mobileOpen ? `${item.label} - ${item.description}` : undefined}
                style={{
                  background: isActive ? 'var(--color-accent, #5980a6)' : 'transparent',
                  border: isActive ? '1px solid var(--color-accent-400, #94bce3)' : '1px solid transparent',
                  fontFamily: "'Barlow', system-ui, sans-serif",
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold transition-all duration-150 group relative ${
                  isActive ? 'text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                    }`}
                  />
                  {(!collapsed || mobileOpen) && (
                    <span className="truncate text-left leading-snug">{item.label}</span>
                  )}
                </div>

                {/* Badges */}
                {item.badge !== null && (
                  <span
                    style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}
                    className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ml-2 ${
                      collapsed && !mobileOpen
                        ? 'absolute top-1 right-1 px-1 py-0 text-[8px]'
                        : item.badgeColor || 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom System Status Widget in Sidebar */}
        {(!collapsed || mobileOpen) && (
          <div style={{ margin: '8px', padding: '12px', background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 11 }}>
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif" }} className="text-[10px] uppercase font-bold text-emerald-400 flex items-center space-x-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>System healthy</span>
              </span>
            </div>
            <p className="text-slate-400 leading-tight">
              100% ANPR &amp; sensor uptime. All gate controllers synced.
            </p>
            {/* Current user footer — genuinely new addition, the design's
                sidebar showed who's signed in and their scope; the
                previous version never displayed this at all. */}
            {currentUser && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ffffff' }}>{currentUser.fullName}</div>
                <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: 10, color: '#94a3b8' }}>
                  {currentUser.roleName?.toUpperCase()} · {currentUser.siteScopeType === 'ALL_SITES' ? 'ALL_SITES' : (currentUser.assignedSiteNames?.join(', ') || 'NO SITE')}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
