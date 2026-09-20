import React, { useState } from 'react';
import { MasterAdminSites } from './MasterAdminSites';
import { MasterAdminBilling } from './MasterAdminBilling';

/**
 * Replaces MasterConfigModule.tsx with the redesigned pages, wrapped in
 * the same internal sub-tab pattern the original used — same
 * activeTab === 'MASTER_CONFIG' slot in App.tsx, same onRefresh prop,
 * so the swap is a minimal, contained change there. Whitelisted Domains
 * is folded into MasterAdminSites (a design choice from the brief, not
 * a functional change) rather than its own tab here.
 *
 * Relocation Logs removed from this page per explicit request — it's
 * been moved to (merged into) the Entry/Exit Logs page instead, as a
 * sub-tab there, since it's conceptually the same category of data
 * (a movement/audit trail) rather than a site-configuration concern.
 */

type SubTab = 'SITES' | 'BILLING';

interface MasterConfigModuleProps {
  onRefresh: () => void;
}

export const MasterConfigModule: React.FC<MasterConfigModuleProps> = ({ onRefresh }) => {
  const [tab, setTab] = useState<SubTab>('SITES');

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
        {tabBtn('SITES', 'Sites & Tenants')}
        {tabBtn('BILLING', 'Billing & Plans')}
      </div>
      {tab === 'SITES' && <MasterAdminSites />}
      {tab === 'BILLING' && <MasterAdminBilling />}
    </div>
  );
};
