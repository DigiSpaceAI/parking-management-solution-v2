import React, { useEffect, useState, useCallback } from 'react';

/**
 * Master Admin — Site-Level User Allocation
 *
 * A gap found while replacing UserManagementModule.tsx — this was one
 * of its 4 tabs, not part of the 13-section design brief. Shows, per
 * site, which users have access there. Purely a different view of data
 * already wired up elsewhere (GET /api/v1/rbac/users, GET /api/v1/sites)
 * — no new backend capability needed.
 */

interface Site {
  id: string;
  siteCode: string;
  siteName: string;
  city?: string;
  totalSlots?: number;
}

interface AppUserRow {
  id: string;
  fullName: string;
  roleName: string;
  siteScopeType: 'ALL_SITES' | 'SPECIFIC_SITES';
  assignedSiteIds?: string[];
}

export const MasterAdminSiteAllocation: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sitesRes, usersRes] = await Promise.all([fetch('/api/v1/sites'), fetch('/api/v1/rbac/users')]);
      if (sitesRes.ok) {
        const d = await sitesRes.json();
        setSites(Array.isArray(d?.sites) ? d.sites : []);
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(Array.isArray(d?.users) ? d.users : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div style={{ padding: 20, color: '#64748b' }}>Loading…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {sites.map((site) => {
        const siteUsers = users.filter((u) => u.siteScopeType === 'ALL_SITES' || (u.assignedSiteIds || []).includes(site.id));
        return (
          <section key={site.id} style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #f1f5f9', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, color: '#1d4ed8' }}>{site.siteCode}</div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700 }}>{site.siteName}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{site.city} · {site.totalSlots ?? '—'} slots</div>
              </div>
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: 700, padding: '3px 9px', background: '#e7f8f0', color: '#065f46', border: '1px solid #a7e3c8', borderRadius: 6 }}>
                {siteUsers.length}
              </span>
            </div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8', marginBottom: 8 }}>Assigned personnel</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {siteUsers.length === 0 ? (
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>No one assigned yet.</div>
              ) : (
                siteUsers.map((u) => (
                  <div key={u.id} style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{u.fullName}</div>
                      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, color: '#94a3b8' }}>{u.roleName}</div>
                    </div>
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9.5, fontWeight: 700, padding: '2px 6px', background: '#faf5ff', color: '#7e22ce', borderRadius: 4 }}>
                      {u.siteScopeType === 'ALL_SITES' ? 'MASTER SCOPE' : 'SITE SCOPE'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
