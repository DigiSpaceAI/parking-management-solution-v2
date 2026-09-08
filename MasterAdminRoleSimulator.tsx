import React, { useEffect, useState, useCallback } from 'react';

/**
 * Master Admin — Role View Simulator
 *
 * Another gap found while replacing UserManagementModule.tsx. Lets a
 * Master Admin switch the app's active context to another user, to test
 * how navigation/permissions look from their seat. The onSelectUser
 * callback must flow up to App.tsx's setCurrentUser exactly as the
 * original did — this genuinely changes the live session context, not
 * just a preview render.
 */

interface AppUserRow {
  id: string;
  fullName: string;
  roleName: string;
  siteScopeType: 'ALL_SITES' | 'SPECIFIC_SITES';
  assignedSiteNames?: string[];
}

interface MasterAdminRoleSimulatorProps {
  onSelectUser: (user: AppUserRow) => void;
}

export const MasterAdminRoleSimulator: React.FC<MasterAdminRoleSimulatorProps> = ({ onSelectUser }) => {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchedMessage, setSwitchedMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/rbac/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchTo = (u: AppUserRow) => {
    onSelectUser(u);
    setSwitchedMessage(`Switched active context to: ${u.fullName} (${u.roleName}). Navigation and permissions updated.`);
  };

  if (loading) return <div style={{ padding: 20, color: '#64748b' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24, color: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'rgba(168,85,247,.15)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,.3)' }}>
          SIMULATION CONSOLE
        </span>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, margin: '10px 0 4px' }}>Role View & Permission Testing Simulator</h3>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Select any user account to test how ParkFlow dynamically adjusts UI navigation tabs and permissions.</p>
      </div>

      {switchedMessage && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)', color: '#d8b4fe', fontSize: 12, marginBottom: 14 }}>
          {switchedMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ padding: 14, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{u.fullName}</span>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, fontWeight: 700, padding: '2px 7px', background: 'rgba(168,85,247,.15)', color: '#d8b4fe', borderRadius: 4 }}>
                  {u.roleName}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                Site mapping: {u.siteScopeType === 'ALL_SITES' ? 'All sites' : (u.assignedSiteNames || []).join(', ') || '—'}
              </div>
            </div>
            <button
              onClick={() => switchTo(u)}
              style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#9333ea', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              Switch profile
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
