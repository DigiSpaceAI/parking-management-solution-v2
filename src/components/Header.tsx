import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  RefreshCw,
  Power,
  User,
  Settings,
  Clock,
  Menu,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Users,
  ChevronDown,
  Lock,
  LogOut,
  Sparkles,
  Zap,
  Radio,
  Building2,
  MapPin,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { AppUser, SiteConfig } from '../types';
import { getUserPermittedSites } from '../utils/rbac';

export type ActiveTabType =
  | 'HOME'
  | 'FLOOR_PLAN'
  | 'ANALYTICS'
  | 'INVENTORY'
  | 'LOGS'
  | 'ALERTS'
  | 'MOBILE_APP'
  | 'EMPLOYEE_MOBILE_APP'
  | 'REGISTRATION'
  | 'APPROVALS'
  | 'MASTER_CONFIG'
  | 'VALET_SERVICE'
  | 'USER_MANAGEMENT'
  | 'SECURITY_AUDIT';

interface HeaderProps {
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  occupiedCount: number;
  totalSlots: number;
  alertCount: number;
  pendingReqCount?: number;
  onRefresh: () => void;
  currentUser?: AppUser | null;
  allUsers?: AppUser[];
  onSelectUser?: (user: AppUser) => void;
  onToggleMobileSidebar?: () => void;
  onLogout?: () => void;
  sites?: SiteConfig[];
  currentSiteId?: string;
  onSelectSite?: (siteId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  occupiedCount,
  totalSlots,
  alertCount,
  pendingReqCount = 0,
  onRefresh,
  currentUser,
  allUsers = [],
  onSelectUser,
  onToggleMobileSidebar,
  onLogout,
  sites = [],
  currentSiteId,
  onSelectSite,
}) => {
  const [showPowerMenu, setShowPowerMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSiteMenu, setShowSiteMenu] = useState(false);
  const [powerMode, setPowerMode] = useState<'NORMAL' | 'MAINTENANCE' | 'HIGH_DEMAND'>('NORMAL');

  // DOM Refs for outside click handling
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const siteMenuRef = useRef<HTMLDivElement>(null);
  const powerMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);

  // Outside click and Escape key listeners for dropdown menus
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (siteMenuRef.current && !siteMenuRef.current.contains(target)) {
        setShowSiteMenu(false);
      }
      if (powerMenuRef.current && !powerMenuRef.current.contains(target)) {
        setShowPowerMenu(false);
      }
      if (notificationsMenuRef.current && !notificationsMenuRef.current.contains(target)) {
        setShowNotificationsMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfileMenu(false);
        setShowSiteMenu(false);
        setShowPowerMenu(false);
        setShowNotificationsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const occPct = totalSlots > 0 ? Math.round((occupiedCount / totalSlots) * 100) : 0;
  const vacantCount = totalSlots - occupiedCount;
  const totalNotifications = alertCount + pendingReqCount;

  // Calculate permitted sites for the current authenticated user
  const permittedSites = React.useMemo(() => {
    return getUserPermittedSites(currentUser, sites);
  }, [currentUser, sites]);

  const activeSite = React.useMemo(() => {
    if (!currentSiteId || currentSiteId === 'ALL') return null;
    return sites.find((s) => s.id === currentSiteId || s.siteCode === currentSiteId) || permittedSites[0] || null;
  }, [currentSiteId, sites, permittedSites]);

  // Format last login time cleanly
  const formattedLastLogin = React.useMemo(() => {
    if (currentUser?.lastLoginAt) {
      try {
        const d = new Date(currentUser.lastLoginAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
        }
      } catch (e) {
        // fallback
      }
    }
    return 'Today, 08:30 AM';
  }, [currentUser]);

  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-30 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* LEFT: Mobile Menu Button & ParkOrbit Branding */}
          <div className="flex items-center space-x-3 shrink-0">
            {onToggleMobileSidebar && (
              <button
                onClick={onToggleMobileSidebar}
                className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden border border-slate-200"
                title="Toggle Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* ParkOrbit Logo */}
            <div
              onClick={() => setActiveTab('HOME')}
              className="flex items-center space-x-3.5 cursor-pointer group hover:opacity-95 transition-opacity"
              title="Go to Role Home Dashboard"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/20 text-white font-bold text-lg font-mono group-hover:scale-105 transition-transform shrink-0">
                PO
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 font-sans group-hover:text-blue-600 transition-colors leading-none">
                    ParkOrbit
                  </span>
                  <span
                    className="hidden sm:inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-mono font-bold uppercase leading-tight cursor-help"
                    title={`Build deployed: ${new Date(__BUILD_TIMESTAMP__).toLocaleString()}`}
                  >
                    v4.2 Enterprise
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-sans hidden md:block mt-1 leading-normal font-normal">
                  Centrally Managed Smart Parking & Mobility Infrastructure
                </p>
              </div>
            </div>
          </div>

          {/* CENTER-LEFT: Active Site Scope & Context Switcher */}
          <div className="hidden lg:flex items-center space-x-2" ref={siteMenuRef}>
            <div className="relative">
              <button
                onClick={() => {
                  if (permittedSites.length > 1 || currentUser?.siteScopeType === 'ALL_SITES') {
                    setShowSiteMenu(!showSiteMenu);
                    setShowPowerMenu(false);
                    setShowNotificationsMenu(false);
                    setShowProfileMenu(false);
                  }
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  permittedSites.length > 1 || currentUser?.siteScopeType === 'ALL_SITES'
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800 cursor-pointer shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 cursor-default'
                }`}
                title={
                  currentUser?.siteScopeType === 'ALL_SITES'
                    ? 'Master Scope: Switch Active Enterprise Site Context'
                    : `Assigned Site Scope (${permittedSites.length} sites)`
                }
              >
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-slate-900 leading-tight max-w-[150px] truncate">
                      {activeSite ? activeSite.siteName : 'All Enterprise Sites'}
                    </span>
                    {activeSite && (
                      <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 font-mono font-bold text-[9px] rounded border border-blue-200">
                        {activeSite.siteCode}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {currentUser?.siteScopeType === 'ALL_SITES'
                      ? 'Master Multi-Site Scope'
                      : `${permittedSites.length} Assigned Site${permittedSites.length > 1 ? 's' : ''}`}
                  </span>
                </div>
                {(permittedSites.length > 1 || currentUser?.siteScopeType === 'ALL_SITES') && (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                )}
              </button>

              {/* Site Selection Popover */}
              {showSiteMenu && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2.5 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                  <div className="px-2 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
                    <span className="font-bold text-slate-900 font-mono text-[10px] uppercase tracking-wider">
                      Switch Active Site Context
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">
                      {currentUser?.siteScopeType === 'ALL_SITES' ? 'Global Access' : 'Assigned Only'}
                    </span>
                  </div>

                  {currentUser?.siteScopeType === 'ALL_SITES' && (
                    <button
                      onClick={() => {
                        if (onSelectSite) onSelectSite('ALL');
                        setShowSiteMenu(false);
                      }}
                      className={`w-full p-2 rounded-xl text-left flex items-center space-x-2.5 transition-colors mb-1 ${
                        !currentSiteId || currentSiteId === 'ALL'
                          ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Globe className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="font-bold block text-xs">All Enterprise Sites (Overview)</span>
                        <span className="text-[10px] text-slate-400 block font-mono">Consolidated enterprise view</span>
                      </div>
                    </button>
                  )}

                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {permittedSites.map((s) => {
                      const isSelected = activeSite?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (onSelectSite) onSelectSite(s.id);
                            setShowSiteMenu(false);
                          }}
                          className={`w-full p-2 rounded-xl text-left flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                              : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                            <div className="truncate">
                              <span className="font-bold block text-xs truncate">{s.siteName}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {s.siteCode} • {s.city} • {s.totalSlots} Slots
                              </span>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Welcome Banner & Last Login Timestamp */}
          <div className="hidden md:flex flex-col items-center justify-center text-center px-4 py-1.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-inner max-w-xs lg:max-w-md">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-bold text-slate-900 text-sm tracking-tight truncate">
                Welcome! <span className="text-blue-600 font-extrabold">{currentUser?.fullName || 'Administrator'}</span>
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono mt-0.5">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Last login: <strong className="text-slate-700">{formattedLastLogin}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-600 font-bold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span>Session Active</span>
              </span>
            </div>
          </div>

          {/* RIGHT: System Utilities (Power Status, Notifications, User Profile) */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
            
            {/* 1. Quick Refresh Button */}
            <button
              onClick={onRefresh}
              className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 cursor-pointer shrink-0"
              title="Refresh System Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* 2. System Utilities: Power / Actions Status Icon */}
            <div className="relative shrink-0 flex items-center" ref={powerMenuRef}>
              <button
                onClick={() => {
                  setShowPowerMenu(!showPowerMenu);
                  setShowNotificationsMenu(false);
                  setShowProfileMenu(false);
                }}
                className={`h-10 px-3 rounded-xl border transition-all flex items-center space-x-1.5 text-xs font-bold cursor-pointer ${
                  powerMode === 'NORMAL'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : powerMode === 'HIGH_DEMAND'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
                title="System Utilities & Power Status"
              >
                <Power className="w-4 h-4" />
                <span className="hidden xl:inline text-[11px] font-mono uppercase">{powerMode}</span>
              </button>

              {/* Power / System Status Dropdown */}
              {showPowerMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Power & Facility Status</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      100% ONLINE
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 mb-3">
                    Select power profile for site gate controllers, mechanical puzzle stackers, and camera OCR nodes.
                  </p>

                  <div className="space-y-1.5 font-mono">
                    <button
                      onClick={() => {
                        setPowerMode('NORMAL');
                        setShowPowerMenu(false);
                      }}
                      className={`w-full p-2 rounded-xl text-left font-bold flex items-center justify-between border ${
                        powerMode === 'NORMAL' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="block text-xs">Standard Auto Mode</span>
                        <span className="text-[10px] font-normal text-slate-500 block">Balanced grid allocation</span>
                      </div>
                      {powerMode === 'NORMAL' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </button>

                    <button
                      onClick={() => {
                        setPowerMode('HIGH_DEMAND');
                        setShowPowerMenu(false);
                      }}
                      className={`w-full p-2 rounded-xl text-left font-bold flex items-center justify-between border ${
                        powerMode === 'HIGH_DEMAND' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="block text-xs">Peak High-Demand Boost</span>
                        <span className="text-[10px] font-normal text-slate-500 block">Fast key dispatch & stackers</span>
                      </div>
                      {powerMode === 'HIGH_DEMAND' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                    </button>

                    <button
                      onClick={() => {
                        setPowerMode('MAINTENANCE');
                        setShowPowerMenu(false);
                      }}
                      className={`w-full p-2 rounded-xl text-left font-bold flex items-center justify-between border ${
                        powerMode === 'MAINTENANCE' ? 'bg-rose-50 border-rose-300 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="block text-xs">Facility Maintenance Lockdown</span>
                        <span className="text-[10px] font-normal text-slate-500 block">Manual entry override</span>
                      </div>
                      {powerMode === 'MAINTENANCE' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. System Utilities: Notifications (Bell Icon with Counter) */}
            <div className="relative shrink-0 flex items-center" ref={notificationsMenuRef}>
              <button
                onClick={() => {
                  setShowNotificationsMenu(!showNotificationsMenu);
                  setShowPowerMenu(false);
                  setShowProfileMenu(false);
                }}
                className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all relative cursor-pointer ${
                  totalNotifications > 0
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
                title="System Notifications & Alerts"
              >
                <Bell className="w-4 h-4" />
                {totalNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-600 text-white font-mono font-black text-[10px] rounded-full border-2 border-white animate-bounce leading-none">
                    {totalNotifications}
                  </span>
                )}
              </button>

              {/* Notifications Menu Popover */}
              {showNotificationsMenu && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
                      <Bell className="w-3.5 h-3.5 text-blue-600" />
                      <span>Notifications Center ({totalNotifications})</span>
                    </span>
                    <button
                      onClick={() => setShowNotificationsMenu(false)}
                      className="text-slate-400 hover:text-slate-600 text-[10px] font-bold cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  {totalNotifications === 0 ? (
                    <div className="py-6 text-center text-slate-500 font-mono text-[11px]">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                      <span>No active alerts or pending approvals. System running smoothly!</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {alertCount > 0 && (
                        <div
                          onClick={() => {
                            setActiveTab('ALERTS');
                            setShowNotificationsMenu(false);
                          }}
                          className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100 transition-colors flex items-start space-x-2"
                        >
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-rose-900 block text-[11px]">
                              {alertCount} Non-Parked Vehicles Alert
                            </span>
                            <span className="text-[10px] text-rose-700 block">
                              Vehicles exceeded cutoff time without parking slot allocation.
                            </span>
                          </div>
                        </div>
                      )}

                      {pendingReqCount > 0 && (
                        <div
                          onClick={() => {
                            setActiveTab('REGISTRATION');
                            setShowNotificationsMenu(false);
                          }}
                          className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors flex items-start space-x-2"
                        >
                          <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-900 block text-[11px]">
                              {pendingReqCount} Employee Approvals Pending
                            </span>
                            <span className="text-[10px] text-amber-700 block">
                              New vehicle registration requests await HR approval.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. System Utilities: User Profile & Settings */}
            <div className="relative shrink-0 flex items-center" ref={profileMenuRef}>
              {currentUser && (
                <button
                  onClick={() => {
                    setShowProfileMenu(!showProfileMenu);
                    setShowPowerMenu(false);
                    setShowNotificationsMenu(false);
                  }}
                  className="h-10 bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 rounded-xl px-3 flex items-center space-x-2.5 shadow-sm transition-colors cursor-pointer"
                  title="Logged-in User Profile"
                >
                  <div className="w-6 h-6 rounded-lg bg-blue-600 font-mono font-bold flex items-center justify-center text-xs text-white shadow-sm shrink-0">
                    {currentUser.fullName.charAt(0)}
                  </div>
                  <div className="text-left hidden sm:block">
                    <span className="font-bold text-slate-100 block text-[11px] leading-tight truncate max-w-[110px]">
                      {currentUser.fullName}
                    </span>
                    <span className="text-[9px] font-mono text-cyan-300 block leading-tight truncate max-w-[110px]">
                      {currentUser.roleName}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}

              {/* Profile & Settings Dropdown - Logged In User Profile Only */}
              {showProfileMenu && currentUser && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 z-50 text-xs animate-in fade-in slide-in-from-top-2">
                  {/* User Identity Card */}
                  <div className="p-3.5 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-xl mb-3 shadow-md border border-slate-800">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-blue-600 font-bold flex items-center justify-center text-base font-mono text-white shadow-inner shrink-0">
                        {currentUser.fullName.charAt(0)}
                      </div>
                      <div className="overflow-hidden flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white block text-sm leading-tight truncate">{currentUser.fullName}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                            {currentUser.status || 'ACTIVE'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-blue-300 block truncate">{currentUser.email}</span>
                        <span className="text-[10px] text-slate-400 font-mono block truncate">@{currentUser.username} {currentUser.phone ? `• ${currentUser.phone}` : ''}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-slate-800/80 pt-2.5">
                      <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Role</span>
                        <strong className="text-blue-300 block truncate font-bold text-[11px]">{currentUser.roleName}</strong>
                      </div>
                      <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Designation</span>
                        <strong className="text-slate-200 block truncate font-bold text-[11px]">{currentUser.designation || 'Enterprise Staff'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Sites Summary */}
                  <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Assigned Site Scope</span>
                      </span>
                      <span className="text-[9px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {currentUser.siteScopeType === 'ALL_SITES' ? 'ALL SITES' : `${permittedSites.length} SITES`}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-0.5">
                      {currentUser.siteScopeType === 'ALL_SITES' ? (
                        <div className="text-[11px] text-slate-700 font-semibold flex items-center space-x-2 bg-white p-2 rounded-lg border border-slate-200">
                          <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <span className="block font-bold text-slate-800">Master Multi-Site Access</span>
                            <span className="text-[10px] text-slate-400 font-mono block">All {sites.length} enterprise parking facilities</span>
                          </div>
                        </div>
                      ) : (
                        permittedSites.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-[11px] text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200">
                            <div className="flex items-center space-x-1.5 truncate">
                              <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="font-semibold text-slate-800 truncate">{s.siteName}</span>
                            </div>
                            <span className="font-mono text-[9px] text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0 ml-1">
                              {s.siteCode}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Account Session Info */}
                  <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-mono text-slate-500 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>User ID:</span>
                      <span className="font-bold text-slate-700">{currentUser.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Sign In:</span>
                      <span className="font-bold text-slate-700">{formattedLastLogin}</span>
                    </div>
                  </div>

                  {/* Actions (Sign Out / Home) */}
                  <div className="space-y-1 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setActiveTab('HOME');
                        setShowProfileMenu(false);
                      }}
                      className="w-full p-2 rounded-xl text-left hover:bg-slate-100 flex items-center space-x-2 text-slate-700 font-semibold text-xs transition"
                    >
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Role Home Launchpad</span>
                    </button>

                    {onLogout && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onLogout();
                        }}
                        className="w-full p-2 rounded-xl text-left hover:bg-rose-50 text-rose-600 flex items-center space-x-2 font-bold text-xs transition"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        <span>Sign Out of Session</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
