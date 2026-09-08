import React, { useState } from 'react';
import { MasterAdminAudit } from './MasterAdminAudit';
import { MasterAdminData } from './MasterAdminData';

/**
 * Replaces SecurityAuditModule.tsx. The original had no sub-tabs — just
 * the audit log itself, confirmed by checking for any before building
 * this. Data & Retention is a genuinely new addition here (the first
 * real UI for the already-built, already-deployed clearHistoricalRecords
 * backend feature, which never had a live UI until now), not something
 * being moved from elsewhere. Same activeTab === 'SECURITY_AUDIT' slot
 * and prop signature in App.tsx.
 */

type SubTab = 'AUDIT' | 'DATA';

interface SecurityAuditModuleProps {
  currentUserRole?: string;
  onRefreshAll: () => void;
}

export const SecurityAuditModule: React.FC<SecurityAuditModuleProps> = () => {
  const [tab, setTab] = useState<SubTab>('AUDIT');

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
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e6ee', marginBottom: 20 }}>
        {tabBtn('AUDIT', 'Audit Log')}
        {tabBtn('DATA', 'Data & Retention')}
      </div>
      {tab === 'AUDIT' && <MasterAdminAudit />}
      {tab === 'DATA' && <MasterAdminData />}
    </div>
  );
};
