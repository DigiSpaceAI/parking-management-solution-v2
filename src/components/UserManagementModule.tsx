import React, { useState } from 'react';
import { MasterAdminUsers } from './MasterAdminUsers';
import { MasterAdminRoles } from './MasterAdminRoles';
import { MasterAdminSiteAllocation } from './MasterAdminSiteAllocation';
import { MasterAdminRoleSimulator } from './MasterAdminRoleSimulator';

/**
 * Replaces UserManagementModule.tsx — same 4 sections as the original
 * (User Directory, Module Permission Matrix, Site-Level User Allocation,
 * Role View Simulator), same activeTab === 'USER_MANAGEMENT' slot and
 * prop signature in App.tsx, so the swap there is minimal.
 */

type SubTab = 'USERS' | 'ROLES' | 'ALLOCATION' | 'SIMULATOR';

interface UserManagementModuleProps {
  currentUser: any;
  onSelectSimulatedUser: (user: any) => void;
  onRefreshAll: () => void;
}

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({ onSelectSimulatedUser }) => {
  const [tab, setTab] = useState<SubTab>('USERS');

  const tabBtn = (key: SubTab, label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: '9px 16px', border: 'none', borderBottom: `2px solid ${tab === key ? '#2563eb' : 'transparent'}`,
        background: 'transparent', color: tab === key ? '#2563eb' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e6ee', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabBtn('USERS', 'User Directory & Site Scopes')}
        {tabBtn('ROLES', 'Module Permission Matrix')}
        {tabBtn('ALLOCATION', 'Site-Level User Allocation')}
        {tabBtn('SIMULATOR', 'Role View Simulator')}
      </div>
      {tab === 'USERS' && <MasterAdminUsers />}
      {tab === 'ROLES' && <MasterAdminRoles />}
      {tab === 'ALLOCATION' && <MasterAdminSiteAllocation />}
      {tab === 'SIMULATOR' && <MasterAdminRoleSimulator onSelectUser={onSelectSimulatedUser} />}
    </div>
  );
};
