import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Master Admin — Audit Log page
 *
 * DATA SOURCING: confirmed real, and something I directly reviewed and
 * fixed earlier tonight — GET /api/v1/security/audit-logs and POST
 * /api/v1/security/verify-audit-chain (verifyAuditTrailIntegrity),
 * matching the SecurityAuditLog type exactly (id, timestamp, action,
 * actor, actorRole, ipAddress, targetResource, status, integrityHash).
 * "Export CSV" isn't wired to a real endpoint — no confirmed CSV-export
 * route exists for this specific data, so it's a plain client-side
 * export of what's currently loaded rather than a server round-trip.
 */

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  targetResource: string;
  ipAddress: string;
  status: 'SUCCESS' | 'BLOCKED_UNAUTHORIZED' | 'RATE_LIMITED' | 'VALIDATION_FAILED';
  integrityHash: string;
}

const statusPillStyle = (status: string) => {
  if (status === 'SUCCESS') return { bg: '#e7f8f0', bd: '#a7e3c8', fg: '#065f46' };
  if (status === 'RATE_LIMITED') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e' };
  return { bg: '#fdeaee', bd: '#f7b6c2', fg: '#be123c' }; // BLOCKED_UNAUTHORIZED, VALIDATION_FAILED
};

export const MasterAdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; totalChecked: number; tamperedCount: number; details: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/security/audit-logs?limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return logs.filter((l) => {
      if (resultFilter !== 'All' && l.status !== resultFilter) return false;
      if (q && !l.actor.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !l.targetResource.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, filter, resultFilter]);

  const verifyIntegrity = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/v1/security/verify-audit-chain', { method: 'POST' });
      const data = await res.json();
      if (data.success) setVerifyResult(data.verification);
    } finally {
      setVerifying(false);
    }
  };

  const exportCsv = () => {
    const header = 'Timestamp,Actor,Role,Action,Resource,IP,Status,Integrity Hash\n';
    const rows = filtered
      .map((l) => [l.timestamp, l.actor, l.actorRole, l.action, l.targetResource, l.ipAddress, l.status, l.integrityHash].map((v) => `"${v}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Filter</label>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Actor, action or resource"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Result</label>
          <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}>
            <option>All</option><option>SUCCESS</option><option>BLOCKED_UNAUTHORIZED</option><option>RATE_LIMITED</option><option>VALIDATION_FAILED</option>
          </select>
        </div>
        <button onClick={exportCsv} style={{ padding: '9px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Export CSV
        </button>
        <button
          onClick={verifyIntegrity}
          disabled={verifying}
          style={{ padding: '9px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#eef1f6', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: verifying ? 0.6 : 1 }}
        >
          {verifying ? 'Verifying…' : 'Verify integrity'}
        </button>
      </div>

      {verifyResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          border: `1px solid ${verifyResult.verified ? '#a7e3c8' : '#f7b6c2'}`,
          background: verifyResult.verified ? '#e7f8f0' : '#fdeaee',
          color: verifyResult.verified ? '#065f46' : '#be123c', fontSize: 13,
        }}>
          {verifyResult.verified ? '✓ Verified' : '✗ Tampering detected'} — {verifyResult.totalChecked} entries checked, {verifyResult.tamperedCount} tampered. {verifyResult.details}
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e6ee', borderRadius: 8 }}>
        <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Timestamp', 'Actor', 'Action', 'Resource', 'IP', 'Result', 'Integrity'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No entries match your filters.</td></tr>
            ) : (
              filtered.map((l) => {
                const st = statusPillStyle(l.status);
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{l.timestamp}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {l.actor}
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.actorRole}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{l.action}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{l.targetResource}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{l.ipAddress}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, padding: '3px 9px', background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#94a3b8' }}>
                      {l.integrityHash?.slice(0, 12)}…
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
