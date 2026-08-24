/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ParkingSlot, Employee, ParkingLog, SlotStatus, VehicleType, EntryType, AppUser, RolePermissionConfig, SiteConfig } from './types';
import { Header, ActiveTabType } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RoleHomePage } from './components/RoleHomePage';
import { LiveFloorPlan } from './components/LiveFloorPlan';
import { AnalyticsPredictive } from './components/AnalyticsPredictive';
import { InventoryMaster } from './components/InventoryMaster';
import { ParkingLogs } from './components/ParkingLogs';
import { NonParkedAlerts } from './components/NonParkedAlerts';
import { AttendantMobileApp } from './components/AttendantMobileApp';
import { EmployeeMobileApp } from './components/EmployeeMobileApp';
import { EmployeeRegistration } from './components/EmployeeRegistration';
import { MasterConfigModule } from './components/MasterConfigModule';
import { ValetXModule } from './components/ValetXModule';
import { UserManagementModule } from './components/UserManagementModule';
import { SecurityAuditModule } from './components/SecurityAuditModule';
import { LoginScreen } from './components/LoginScreen';
import { isModulePermitted } from './utils/rbac';
import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

const SESSION_STORAGE_KEY = 'parkorbit_authenticated_user_session_v4';
const LEGACY_SESSION_STORAGE_KEY = 'pm_authenticated_user_session_v4';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTabType>('HOME');
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<ParkingLog[]>([]);
  const [roles, setRoles] = useState<RolePermissionConfig[]>([]);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [currentSiteId, setCurrentSiteId] = useState<string>('ALL');
  const [alertCount, setAlertCount] = useState<number>(0);
  const [pendingReqCount, setPendingReqCount] = useState<number>(0);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // RBAC User Session state
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved user session:', e);
    }
    return null;
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/v1/rbac/users');
      const data = await res.json();
      if (data.success && data.users && data.users.length > 0) {
        setAllUsers(data.users);
        if (currentUser) {
          const freshCurrent = data.users.find((u: AppUser) => u.id === currentUser.id);
          if (freshCurrent) {
            setCurrentUser(freshCurrent);
            try {
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(freshCurrent));
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/v1/rbac/roles');
      const data = await res.json();
      if (data.success && data.roles && data.roles.length > 0) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/v1/sites');
      const data = await res.json();
      const list = data.sites || (Array.isArray(data) ? data : []);
      if (list && list.length > 0) {
        setSites(list);
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  };

  const handleLoginSuccess = (user: AppUser, redirectTab?: string) => {
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
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove session:', e);
    }
    showToast('success', 'You have been signed out successfully.');
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const fetchSlots = async () => {
    try {
      const res = await fetch('/api/v1/slots');
      const data = await res.json();
      setSlots(data.slots || []);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/v1/employees');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/v1/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/v1/alerts/non-parked');
      const data = await res.json();
      setAlertCount(data.totalAlerts || 0);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  const fetchPendingReqs = async () => {
    try {
      const res = await fetch('/api/v1/registrations');
      const data = await res.json();
      setPendingReqCount(data.pendingCount || 0);
    } catch (err) {
      console.error('Error fetching pending registrations:', err);
    }
  };

  const refreshAll = () => {
    fetchSlots();
    fetchEmployees();
    fetchLogs();
    fetchAlerts();
    fetchPendingReqs();
    fetchUsers();
    fetchRoles();
    fetchSites();
  };

  useEffect(() => {
    refreshAll();
  }, []);

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
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Failed to process vehicle entry');
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
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Failed to process vehicle exit');
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
        showToast('error', data.message);
      }
    } catch (err) {
      showToast('error', 'Failed to update slot status');
    }
  };

  const occupiedCount = slots.filter((s) => s.status === 'OCCUPIED').length;

  if (!currentUser) {
    return (
      <LoginScreen
        allUsers={allUsers}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white flex flex-col">
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
        allUsers={allUsers}
        sites={sites}
        currentSiteId={currentSiteId}
        onSelectSite={(siteId) => setCurrentSiteId(siteId)}
        onSelectUser={(u) => handleLoginSuccess(u)}
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
          currentUser={currentUser}
          roles={roles}
        />

        {/* Right Main Panel Displays Selected Module Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 h-full">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'HOME' && (
              <RoleHomePage
                currentUser={currentUser}
                roles={roles}
                slots={slots}
                employees={employees}
                logs={logs}
                alertCount={alertCount}
                pendingReqCount={pendingReqCount}
                setActiveTab={setActiveTab}
                onRefreshAll={refreshAll}
              />
            )}

            {activeTab === 'FLOOR_PLAN' && (
              <LiveFloorPlan
                slots={slots}
                onUpdateSlotStatus={handleUpdateSlotStatus}
                onVehicleEntry={handleVehicleEntry}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'ANALYTICS' && <AnalyticsPredictive />}

            {activeTab === 'INVENTORY' && (
              <InventoryMaster
                slots={slots}
                employees={employees}
                onUpdateSlotStatus={handleUpdateSlotStatus}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
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
              <AttendantMobileApp
                slots={slots}
                employees={employees}
                onVehicleEntry={handleVehicleEntry}
                onVehicleExit={handleVehicleExit}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'EMPLOYEE_MOBILE_APP' && (
              <EmployeeMobileApp
                slots={slots}
                onRefreshAll={refreshAll}
              />
            )}

            {activeTab === 'REGISTRATION' && (
              <EmployeeRegistration mode="REGISTRATION" onRefreshAll={refreshAll} />
            )}

            {activeTab === 'APPROVALS' && (
              <EmployeeRegistration mode="APPROVALS" onRefreshAll={refreshAll} />
            )}

            {activeTab === 'MASTER_CONFIG' && <MasterConfigModule onRefresh={refreshAll} />}

            {activeTab === 'VALET_SERVICE' && <ValetXModule />}

            {activeTab === 'USER_MANAGEMENT' && (
              <UserManagementModule
                currentUser={currentUser}
                onSelectSimulatedUser={(u) => setCurrentUser(u)}
                onRefreshAll={refreshAll}
              />
            )}

            {activeTab === 'SECURITY_AUDIT' && (
              <SecurityAuditModule
                currentUserRole={currentUser?.roleName}
                onRefreshAll={refreshAll}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
