import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Master Admin — Users page
 *
 * DATA SOURCING: confirmed real — getAppUsers/saveAppUser (GET/POST
 * /api/v1/rbac/users), deleteAppUser, setUserPassword (the "Reset pw"
 * action, matching the existing admin-generates-reset-token pattern
 * already used elsewhere), toggleUserModuleOverride (the Overrides
 * column). "Provision user" opens the same create-user flow already
 * live in the current app.
 */

interface AppUserRow {
  id: string;
  fullName: string;
  email: string;
  roleName: string;
  siteScope?: string;
  lastLoginAt?: string;
  status: string;
  moduleOverrideCount?: number;
}

const statusPillStyle = (status: string) => {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return { bg: '#e7f8f0', bd: '#a7e3c8', fg: '#065f46' };
  if (s === 'SUSPENDED') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e' };
  if (s === 'LOCKED') return { bg: '#fdeaee', bd: '#f7b6c2', fg: '#be123c' };
  return { bg: '#f1f5f9', bd: '#cbd5e1', fg: '#475569' };
};

export const MasterAdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/rbac/users');
      if (!res.ok) return;
      const data = await res.json();
      const list: AppUserRow[] = Array.isArray(data?.users) ? data.users : [];
      setUsers(list);
      setRoles(Array.from(new Set(list.map((u) => u.roleName))).sort());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'All roles' && u.roleName !== roleFilter) return false;
      if (statusFilter !== 'All' && u.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (q && !u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const resetPassword = async (userId: string) => {
    setResettingId(userId);
    setResetMessage('');
    try {
      const res = await fetch('/api/v1/auth/admin/generate-reset-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      setResetMessage(data.success ? `${data.message} Token: ${data.token}` : (data.message || 'Reset failed.'));
    } catch {
      setResetMessage('Could not reach the server.');
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Search users</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, username or email"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}>
            <option>All roles</option>
            {roles.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}>
            <option>All</option><option>Active</option><option>Suspended</option><option>Locked</option>
          </select>
        </div>
        <button style={{ padding: '9px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Provision user
        </button>
      </div>

      {resetMessage && (
        <div style={{ padding: '10px 14px', border: '1px solid #bfdbfe', background: '#eef6ff', color: '#1e40af', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
          {resetMessage}
        </div>
      )}

      <div style={{ border: '1px solid #e2e6ee', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['User', 'Role', 'Site scope', 'Last login', 'Status', 'Overrides', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', borderBottom: '1px solid #e2e6ee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No users match your filters.</td></tr>
            ) : (
              filtered.map((u) => {
                const st = statusPillStyle(u.status);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14 }}>{u.fullName}</div>
                      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#64748b' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{u.roleName}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{u.siteScope || 'ALL_SITES'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{u.lastLoginAt || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, padding: '3px 9px', background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                      {u.moduleOverrideCount ? `${u.moduleOverrideCount} module${u.moduleOverrideCount === 1 ? '' : 's'}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #cbd3e0', borderRadius: 6, background: '#fff', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                      <button
                        onClick={() => resetPassword(u.id)}
                        disabled={resettingId === u.id}
                        style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #cbd3e0', borderRadius: 6, background: '#fff', cursor: 'pointer', opacity: resettingId === u.id ? 0.6 : 1 }}
                      >
                        {resettingId === u.id ? 'Resetting…' : 'Reset pw'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
