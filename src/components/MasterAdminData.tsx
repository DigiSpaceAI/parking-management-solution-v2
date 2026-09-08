import React, { useState } from 'react';

/**
 * Master Admin — Data & Retention page
 *
 * This section needed more judgment than the others — the design's
 * "Retention windows" (auto-expiring data after N months), several of
 * its "Privacy controls" toggles, and its specific danger-zone actions
 * ("Purge plate images", "Decommission site", "Revoke all sessions")
 * don't map to anything real:
 * - No configurable, saved retention-period settings exist anywhere —
 *   data doesn't auto-expire on a timer today.
 * - PII masking IS real, but as fixed role-based logic (a hardcoded
 *   FULL_PII_ROLES set in server.ts), not a persisted admin toggle —
 *   there's no setting to flip, so it's shown here as informational,
 *   not an interactive control that would silently do nothing on click.
 * - "Purge plate images," "decommission site" (distinct from the
 *   already-real deleteSite), and "revoke all sessions" have no
 *   matching endpoints anywhere.
 *
 * What IS real and genuinely deployed: the clearHistoricalRecords
 * feature (Parking Logs, Slot Change Notifications, Valet Tickets,
 * Security Audit Log — each independently selectable, with an optional
 * "older than" date). That's what powers the danger zone below, in
 * place of the design's non-functional named buttons — real capability
 * standing in for placeholder ones, not a literal re-skin of the design.
 */

const CLEANUP_COLLECTIONS = [
  { key: 'logs', label: 'Parking Logs', hint: 'Only completed (already exited) entries.' },
  { key: 'slotChangeNotifications', label: 'Slot Change Notifications', hint: 'Relocation/change history.' },
  { key: 'valetTickets', label: 'Valet Tickets', hint: 'Only delivered or cancelled tickets.' },
  { key: 'securityAuditLogs', label: 'Security Audit Log', hint: 'The tamper-evident admin action trail itself.' },
] as const;

export const MasterAdminData: React.FC = () => {
  const [selected, setSelected] = useState<string[]>([]);
  const [olderThan, setOlderThan] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const toggle = (key: string) => setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/v1/admin/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: selected, olderThan: olderThan || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.cleared);
        setConfirming(false);
        setSelected([]);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <section style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18 }}>
          <h5 style={{ margin: 0, fontSize: 15 }}>Retention windows</h5>
          <div style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 12px' }}>
            Informational only — none of these are currently configurable, saved settings. Data doesn't auto-expire on a timer today; clearing old records is a manual, on-demand action (see below).
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { k: 'Entry / exit logs', v: 'Not time-limited' },
              { k: 'Valet tickets', v: 'Not time-limited' },
              { k: 'Security audit trail', v: 'Not time-limited' },
              { k: 'Backup snapshots', v: 'Managed by Cloud Run / Firestore, not this app' },
            ].map((f) => (
              <div key={f.k}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{f.k}</div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, marginTop: 3 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 18 }}>
          <h5 style={{ margin: 0, fontSize: 15 }}>Privacy controls</h5>
          <div style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 12px' }}>
            PII masking is real and always active for roles outside the privileged set below — shown here as status, not a toggle, since it isn't a saved setting.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13 }}>PII masking (email, phone)</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Unmasked only for: Platform Master Admin, Site Facility Manager, MIS Auditor. All other roles see masked data automatically.
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ border: '1px solid #f7b6c2', borderRadius: 8, padding: 18 }}>
        <h5 style={{ margin: 0, fontSize: 15 }}>Destructive operations</h5>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 14px' }}>
          Clears historical records from selected collections, optionally only those older than a chosen date. Only completed/terminal records are ever eligible — an active parking session or in-progress valet ticket is never touched, no matter how old.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          {CLEANUP_COLLECTIONS.map((c) => (
            <label
              key={c.key}
              style={{
                display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid #e2e6ee', borderRadius: 8, cursor: 'pointer',
                background: selected.includes(c.key) ? '#eef6ff' : '#fff',
              }}
            >
              <input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{c.hint}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Only older than (optional)</label>
            <input type="date" value={olderThan} onChange={(e) => setOlderThan(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <button
            onClick={() => setConfirming(true)}
            disabled={selected.length === 0}
            style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: selected.length === 0 ? 'default' : 'pointer', opacity: selected.length === 0 ? 0.5 : 1 }}
          >
            Clear selected data
          </button>
        </div>

        {result && (
          <div style={{ padding: '12px 16px', border: '1px solid #a7e3c8', background: '#e7f8f0', borderRadius: 8, fontSize: 12.5, color: '#065f46' }}>
            {Object.entries(result).map(([k, v]) => `${CLEANUP_COLLECTIONS.find((c) => c.key === k)?.label || k}: ${v} cleared`).join(' · ')}
          </div>
        )}
      </section>

      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%' }}>
            <h4 style={{ margin: 0, fontSize: 16 }}>Confirm data cleanup</h4>
            <p style={{ fontSize: 13, color: '#475569', margin: '10px 0 18px' }}>
              This permanently deletes {selected.map((k) => CLEANUP_COLLECTIONS.find((c) => c.key === k)?.label).join(', ')}
              {olderThan ? ` older than ${olderThan}` : ' — all eligible records, regardless of age'}. This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirming(false)} disabled={running} style={{ padding: '8px 16px', border: '1px solid #cbd3e0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={run} disabled={running} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: running ? 0.6 : 1 }}>
                {running ? 'Clearing…' : 'Confirm clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
