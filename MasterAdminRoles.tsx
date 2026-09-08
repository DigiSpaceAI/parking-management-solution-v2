import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Master Admin — Roles & Permissions page
 *
 * DATA SOURCING: confirmed real — GET/POST /api/v1/rbac/roles
 * (getAppRoles/saveAppRole), matching the RolePermissionConfig shape
 * seen directly in db.ts (id, roleCode, roleName, description,
 * isSystemDefault, siteScope, modulePermissions). The 14-module × 5-right
 * permission matrix matches what's already visible in the current live
 * admin app's "Module Permission Matrix" tab — this is a redesign of
 * something that already works, not new capability.
 */

const MODULES: [string, string][] = [
  ['HOME', 'Role Home Dashboard'], ['FLOOR_PLAN', 'Live Parking Status'], ['MASTER_CONFIG', 'Master Site Config'],
  ['USER_MANAGEMENT', 'User & RBAC'], ['INVENTORY', 'Inventory Master'], ['MOBILE_APP', 'ParkFlow Field'],
  ['VALET_SERVICE', 'ValetX Suite'], ['EMPLOYEE_MOBILE_APP', 'Employee Smart Pass'], ['REGISTRATION', 'Employee Registration'],
  ['APPROVALS', 'Vehicle Approval Queue'], ['LOGS', 'Entry / Exit Logs'], ['ANALYTICS', 'Predictive Analytics'],
  ['ALERTS', 'Non-Parked Alerts'], ['SECURITY_AUDIT', 'InfoSec & Privacy Defense'],
];
const RIGHTS: [string, string][] = [['enabled', 'Enabled'], ['canCreate', 'Create'], ['canEdit', 'Edit'], ['canDelete', 'Delete'], ['canExport', 'Export']];

interface ModuleRights {
  enabled?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

interface AppRole {
  id: string;
  roleCode: string;
  roleName: string;
  description: string;
  isSystemDefault: boolean;
  siteScope: 'ALL_SITES' | 'ASSIGNED_SITES_ONLY';
  modulePermissions: Record<string, ModuleRights>;
}

const PRESET: Record<'F' | 'R' | 'D', ModuleRights> = {
  F: { enabled: true, canCreate: true, canEdit: true, canDelete: true, canExport: true },
  R: { enabled: true, canCreate: false, canEdit: false, canDelete: false, canExport: true },
  D: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
};

export const MasterAdminRoles: React.FC = () => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/rbac/roles');
      if (!res.ok) return;
      const data = await res.json();
      const list: AppRole[] = Array.isArray(data?.roles) ? data.roles : [];
      setRoles(list);
      if (list.length > 0 && !activeRoleId) setActiveRoleId(list[0].id);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeRole = useMemo(() => roles.find((r) => r.id === activeRoleId) || null, [roles, activeRoleId]);
  const locked = !!activeRole?.isSystemDefault && activeRole.roleCode === 'MASTER_ADMIN';

  const grantCount = useMemo(() => {
    if (!activeRole) return 0;
    let n = 0;
    MODULES.forEach(([id]) => RIGHTS.forEach(([k]) => { if (activeRole.modulePermissions[id]?.[k as keyof ModuleRights]) n++; }));
    return n;
  }, [activeRole]);

  const updateCell = (moduleId: string, key: string, value: boolean) => {
    if (!activeRole) return;
    setRoles((prev) =>
      prev.map((r) => {
        if (r.id !== activeRole.id) return r;
        const current = r.modulePermissions[moduleId] || {};
        const next: ModuleRights = { ...current, [key]: value };
        if (key === 'enabled' && !value) Object.assign(next, PRESET.D);
        return { ...r, modulePermissions: { ...r.modulePermissions, [moduleId]: next } };
      })
    );
  };

  const applyPreset = (moduleId: string, preset: 'F' | 'R' | 'D') => {
    if (!activeRole) return;
    setRoles((prev) =>
      prev.map((r) =>
        r.id === activeRole.id
          ? { ...r, modulePermissions: { ...r.modulePermissions, [moduleId]: { ...PRESET[preset] } } }
          : r
      )
    );
  };

  const setSiteScope = (scope: 'ALL_SITES' | 'ASSIGNED_SITES_ONLY') => {
    if (!activeRole) return;
    setRoles((prev) => prev.map((r) => (r.id === activeRole.id ? { ...r, siteScope: scope } : r)));
  };

  const saveRole = async () => {
    if (!activeRole) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/v1/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeRole),
      });
      const data = await res.json();
      setSaveMessage(data.success ? data.message : (data.message || 'Save failed.'));
    } catch {
      setSaveMessage('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: '#64748b' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        {roles.map((r) => {
          const active = r.id === activeRoleId;
          return (
            <button
              key={r.id}
              onClick={() => setActiveRoleId(r.id)}
              style={{
                padding: '8px 14px', border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`, borderRadius: 12,
                background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#334155',
                fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              }}
            >
              {r.roleName}
            </button>
          );
        })}
        <button style={{ marginLeft: 'auto', padding: '8px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Clone role</button>
        <button style={{ padding: '8px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>New custom role</button>
      </div>

      {activeRole && (
        <>
          <div style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#1d4ed8' }}>{activeRole.roleCode}</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22 }}>{activeRole.roleName}{locked ? ' — locked' : ''}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{activeRole.description}</div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Site scope</label>
              <select
                value={activeRole.siteScope}
                onChange={(e) => setSiteScope(e.target.value as 'ALL_SITES' | 'ASSIGNED_SITES_ONLY')}
                disabled={locked}
                style={{ minWidth: 200, padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
              >
                <option value="ALL_SITES">ALL_SITES</option>
                <option value="ASSIGNED_SITES_ONLY">ASSIGNED_SITES_ONLY</option>
              </select>
            </div>
            <div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 26 }}>{grantCount}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>rights granted of {MODULES.length * RIGHTS.length}</div>
            </div>
            <button
              onClick={saveRole}
              disabled={saving || locked}
              style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: locked ? 'default' : 'pointer', opacity: saving || locked ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save role'}
            </button>
          </div>

          {saveMessage && (
            <div style={{ padding: '10px 14px', border: '1px solid #bfdbfe', background: '#eef6ff', color: '#1e40af', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
              {saveMessage}
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid #e2e6ee', borderRadius: 8 }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ width: '40%', padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>Module</th>
                  {RIGHTS.map(([, label]) => (
                    <th key={label} style={{ padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{label}</th>
                  ))}
                  <th style={{ textAlign: 'right', padding: '10px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(([id, label]) => {
                  const rights = activeRole.modulePermissions[id] || {};
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15 }}>{label}</div>
                        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, color: '#94a3b8' }}>{id}</div>
                      </td>
                      {RIGHTS.map(([k]) => (
                        <td key={k} style={{ padding: '10px 14px' }}>
                          <input
                            type="checkbox"
                            checked={!!rights[k as keyof ModuleRights]}
                            disabled={locked || (k !== 'enabled' && !rights.enabled)}
                            onChange={(e) => updateCell(id, k, e.target.checked)}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button disabled={locked} onClick={() => applyPreset(id, 'F')} style={{ fontSize: 12, padding: '3px 8px', border: 'none', background: 'transparent', color: '#2563eb', cursor: locked ? 'default' : 'pointer' }}>Full</button>
                        <button disabled={locked} onClick={() => applyPreset(id, 'R')} style={{ fontSize: 12, padding: '3px 8px', border: 'none', background: 'transparent', color: '#2563eb', cursor: locked ? 'default' : 'pointer' }}>Read</button>
                        <button disabled={locked} onClick={() => applyPreset(id, 'D')} style={{ fontSize: 12, padding: '3px 8px', border: 'none', background: 'transparent', color: '#2563eb', cursor: locked ? 'default' : 'pointer' }}>None</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
