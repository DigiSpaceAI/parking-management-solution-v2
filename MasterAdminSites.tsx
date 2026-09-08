import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Master Admin — Sites & Tenants page
 *
 * Converted from the Claude Design export (ParkFlows_Master_Admin.html),
 * one of the 6 sections confirmed to map to real backend capability —
 * see the design-review conversation for the full breakdown of what was
 * scoped in versus deferred (Security & auth, Feature flags,
 * Integrations, Notifications routing, Branding, and Localization were
 * all deferred as genuinely new capability with no backend support).
 *
 * DATA SOURCING:
 * - Site list, onboarding, status, pricing: confirmed real —
 *   GET /api/v1/sites, POST /api/v1/sites/onboard, POST
 *   /api/v1/sites/status, POST /api/v1/sites/pricing (all seen directly
 *   in server.ts during tonight's work)
 * - Whitelisted domains: confirmed real — matches the existing
 *   addWhitelistedDomain/removeWhitelistedDomain functions, consolidated
 *   here into the Sites page rather than as its own separate top-level
 *   section (a reasonable design choice, not a functional change)
 * - "Global slot defaults" (standard/tall/high-roof heights, allocation
 *   classes) — NOT confirmed to exist as a configurable, saved setting.
 *   These height categories are used throughout the app (see the
 *   Employee Vehicle screen's bay-allocation preview), but as fixed
 *   values in code, not something an admin currently edits and persists.
 *   Rendered here as informational/read-only rather than an editable
 *   form that would silently do nothing on submit.
 */

interface Site {
  id: string;
  siteName: string;
  siteCode: string;
  city?: string;
  status: string;
  totalSlots?: number;
  levels?: string;
  pricing?: {
    hourlyRate?: number;
    monthlyPassRate?: number;
    currency?: string;
  };
}

interface WhitelistedDomain {
  id: string;
  domain: string;
  active: boolean;
}

const statusPillStyle = (status: string) => {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return { bg: '#e7f8f0', bd: '#a7e3c8', fg: '#065f46' };
  if (s === 'ON_HOLD' || s === 'SUSPENDED') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e' };
  if (s === 'ONBOARDING' || s === 'PENDING') return { bg: '#eef6ff', bd: '#bfdbfe', fg: '#1e40af' };
  return { bg: '#f1f5f9', bd: '#cbd5e1', fg: '#475569' };
};

export const MasterAdminSites: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [domains, setDomains] = useState<WhitelistedDomain[]>([]);
  const [search, setSearch] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [domainBusy, setDomainBusy] = useState(false);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/sites');
      if (!res.ok) return;
      const data = await res.json();
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/domains');
      if (!res.ok) return;
      const data = await res.json();
      setDomains(Array.isArray(data?.domains) ? data.domains : []);
    } catch {
      // Non-fatal — the domains panel just shows empty if this fails.
    }
  }, []);

  useEffect(() => {
    loadSites();
    loadDomains();
  }, [loadSites, loadDomains]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.siteCode.toLowerCase().includes(q) ||
        s.siteName.toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q)
    );
  }, [sites, search]);

  const addDomain = async () => {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    setDomainBusy(true);
    try {
      const res = await fetch('/api/v1/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d }),
      });
      if (res.ok) {
        setNewDomain('');
        loadDomains();
      }
    } finally {
      setDomainBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Search facilities</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Site code, city or contact"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}
          />
        </div>
        <button style={{ padding: '9px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Import CSV
        </button>
        <button style={{ padding: '9px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Onboard site
        </button>
      </div>

      <div style={{ border: '1px solid #e2e6ee', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Site', 'City', 'Slots', 'Levels', 'Hourly', 'Monthly pass', 'Status'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', borderBottom: '1px solid #e2e6ee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No sites match your search.</td></tr>
            ) : (
              filtered.map((s) => {
                const st = statusPillStyle(s.status);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#1d4ed8' }}>{s.siteCode}</div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14 }}>{s.siteName}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{s.city || '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{s.totalSlots ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{s.levels || '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {s.pricing?.hourlyRate != null ? `${s.pricing.currency || '₹'}${s.pricing.hourlyRate}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {s.pricing?.monthlyPassRate != null ? `${s.pricing.currency || '₹'}${s.pricing.monthlyPassRate}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, padding: '3px 9px', background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <section style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18 }}>
          <h5 style={{ margin: 0, fontSize: 15 }}>Global slot defaults</h5>
          <div style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 12px' }}>
            Read-only for now — these are fixed values used throughout the app (e.g. the Employee Vehicle bay-allocation preview), not yet an editable, saved setting.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { k: 'Standard height', v: '2.0m' },
              { k: 'Tall height', v: '2.4m' },
              { k: 'High-roof height', v: '2.8m' },
              { k: 'Allocation classes', v: '6 active' },
            ].map((f) => (
              <div key={f.k}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{f.k}</div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, marginTop: 3 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18 }}>
          <h5 style={{ margin: 0, fontSize: 15 }}>Whitelisted corporate domains</h5>
          <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px' }}>Employees may self-register a pass only from these domains.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {domains.length === 0 ? (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>No domains added yet.</span>
            ) : (
              domains.map((d) => (
                <span
                  key={d.id}
                  style={{
                    fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, padding: '4px 10px', borderRadius: 6,
                    background: d.active ? '#eef6ff' : '#f1f5f9', color: d.active ? '#1e40af' : '#64748b',
                    border: `1px solid ${d.active ? '#bfdbfe' : '#cbd5e1'}`,
                  }}
                >
                  {d.domain}{!d.active ? ' — inactive' : ''}
                </span>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="add-domain.com"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}
            />
            <button
              onClick={addDomain}
              disabled={domainBusy || !newDomain.trim()}
              style={{ padding: '8px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: domainBusy ? 0.6 : 1 }}
            >
              {domainBusy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
