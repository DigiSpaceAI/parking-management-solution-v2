import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Master Admin — Billing page
 *
 * The design's "Billing & plans" combined two ideas: subscription plan
 * cards (planRows — Basic/Pro/Enterprise-style tiers assigned per site)
 * and an invoice ledger (invoiceRows). Only the invoice part is real —
 * GET /api/v1/invoices, POST /api/v1/invoices/generate,
 * POST /api/v1/invoices/status, matching generateSiteInvoice /
 * updateInvoiceStatus directly. The real SitePricing model (hourly
 * rate, daily max, monthly pass rate, tax %) is a parking-fee structure
 * already editable from the Sites page — it's not a SaaS subscription
 * tier assigned to a site, which is what the plan cards described. The
 * plan-tier concept is genuinely new and deliberately left out here
 * rather than shown as cards that don't connect to anything real.
 */

interface Invoice {
  id: string;
  invoiceNumber: string;
  siteName: string;
  billingPeriod: string;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  dueDate: string;
  status: string;
  currency?: string;
}

const statusPillStyle = (status: string) => {
  const s = status.toUpperCase();
  if (s === 'PAID') return { bg: '#e7f8f0', bd: '#a7e3c8', fg: '#065f46' };
  if (s === 'OVERDUE') return { bg: '#fdeaee', bd: '#f7b6c2', fg: '#be123c' };
  if (s === 'PENDING' || s === 'SENT') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e' };
  return { bg: '#f1f5f9', bd: '#cbd5e1', fg: '#475569' };
};

export const MasterAdminBilling: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/v1/invoices');
      if (!res.ok) {
        setLoadError(res.status === 429 ? "Too many requests right now — wait a moment and it'll refresh automatically." : 'Could not load invoices. Try refreshing the page.');
        return;
      }
      const data = await res.json();
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const totalDue = invoices.filter((i) => i.status.toUpperCase() !== 'PAID').reduce((sum, i) => sum + i.totalAmount, 0);
    const overdueCount = invoices.filter((i) => i.status.toUpperCase() === 'OVERDUE').length;
    return { totalDue, overdueCount, count: invoices.length };
  }, [invoices]);

  const markPaid = async (id: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/v1/invoices/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id, status: 'PAID' }),
      });
      if (res.ok) load();
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      {loadError && (
        <div style={{ padding: '10px 14px', border: '1px solid #f7b6c2', background: '#fdeaee', color: '#be123c', borderRadius: 8, fontSize: 12.5, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{loadError}</span>
          <button onClick={load} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#be123c', textDecoration: 'underline', flexShrink: 0 }}>Retry</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Outstanding', value: `₹${totals.totalDue.toLocaleString('en-IN')}` },
          { label: 'Overdue invoices', value: String(totals.overdueCount) },
          { label: 'Total invoices', value: String(totals.count) },
        ].map((s) => (
          <div key={s.label} style={{ border: '1px solid #e2e6ee', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{s.label}</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #e2e6ee', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Invoice', 'Site', 'Period', 'Base', 'Tax', 'Total', 'Due', 'Status', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No invoices yet.</td></tr>
            ) : (
              invoices.map((v) => {
                const st = statusPillStyle(v.status);
                const currency = v.currency || '₹';
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{v.invoiceNumber}</td>
                    <td style={{ padding: '10px 14px' }}>{v.siteName}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{v.billingPeriod}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{currency}{v.baseAmount.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{currency}{v.taxAmount.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700 }}>{currency}{v.totalAmount.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{v.dueDate}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, padding: '3px 9px', background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                        {v.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {v.status.toUpperCase() !== 'PAID' && (
                        <button
                          onClick={() => markPaid(v.id)}
                          disabled={updatingId === v.id}
                          style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #cbd3e0', borderRadius: 6, background: '#fff', cursor: 'pointer', opacity: updatingId === v.id ? 0.6 : 1 }}
                        >
                          {updatingId === v.id ? 'Updating…' : 'Mark paid'}
                        </button>
                      )}
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
