import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AppUser, SiteConfig, SiteSummaryRow } from '../../types';
import {
  Banner, Button, EmptyState, ErrorState, KpiCard, Modal, OccupancyBar, PageHeader, Pagination, Select, SiteTag, StatusChip, Table, TextField, useToast,
  type Column,
} from '../../design-system/components';
import { formatAgo, formatNumber } from '../../utils/format';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import { SitePanel } from './SitePanel';

export interface SitesProps {
  /** Start viewing the console as one of a site's admins (001 view-as). */
  onViewAs?: (user: AppUser) => void;
}

const PAGE_SIZES = [25, 50];

/**
 * Master Sites (002 F7, UX S5, AC-10 landing): KPIs and the table from GET /sites/summary
 * (B4), details from GET /sites, a side panel with Edit site (POST /sites/update, B5),
 * Change status and View as site admin. Add site uses POST /sites/onboard.
 */
export const Sites: React.FC<SitesProps> = ({ onViewAs }) => {
  const toast = useToast();
  const ctx = useSiteContext();
  const [rows, setRows] = useState<SiteSummaryRow[]>([]);
  const [details, setDetails] = useState<SiteConfig[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ siteName: '', city: '', siteCode: '' });
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useAutoRefresh(async (isCurrent) => {
    const [s, d] = await Promise.all([fetch('/api/v1/sites/summary'), fetch('/api/v1/sites')]);
    if (!s.ok) return false;
    const summary = (await s.json()) as SiteSummaryRow[];
    const full = d.ok ? ((await d.json()) as { sites?: SiteConfig[] }).sites || [] : [];
    if (!isCurrent()) return false;
    setRows(Array.isArray(summary) ? summary : []);
    setDetails(full);
    return true;
  }, []);

  const shownRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (status === 'ALL' || r.status === status) && (!needle || [r.siteName, r.siteCode, r.city].some((v) => (v || '').toLowerCase().includes(needle))))
      .sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [rows, q, status]);
  const pages = Math.max(1, Math.ceil(shownRows.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = shownRows.slice((current - 1) * pageSize, current * pageSize);

  const active = rows.filter((r) => r.status === 'ACTIVE');
  const onHold = rows.filter((r) => r.status === 'ON_HOLD').length;
  const occ = active.reduce((n, r) => n + r.occupied, 0);
  const cap = active.reduce((n, r) => n + r.total, 0);
  const pending = rows.reduce((n, r) => n + r.pendingRequests, 0);
  const loading = refresh.loading && !refresh.updatedAt;
  const now = Date.now();

  const columns: Column<SiteSummaryRow>[] = [
    {
      key: 'site',
      header: 'Site',
      render: (r) => (
        <span className="pf-stack pf-stack--tight">
          <strong>{r.siteName}</strong>
          <span className="pf-cell-sub">
            {r.city || '—'}
            <span className="pf-col-mid-inline">
              <SiteTag code={r.siteCode} />
            </span>
          </span>
        </span>
      ),
    },
    { key: 'code', header: 'Code', width: 'wide', render: (r) => <SiteTag code={r.siteCode} /> },
    {
      key: 'occ',
      header: 'Occupied now',
      render: (r) =>
        r.status === 'ON_HOLD' ? <span className="pf-occ-label">— site on hold</span> : <OccupancyBar occupied={r.occupied} total={r.total} />,
    },
    { key: 'pending', header: 'Pending', kind: 'num', render: (r) => formatNumber(r.pendingRequests) },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'last', header: 'Last activity', width: 'wide', kind: 'secondary', render: (r) => (r.lastActivityAt ? formatAgo(r.lastActivityAt, now) : '—') },
  ];

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!add.siteName.trim()) next.siteName = 'Enter the site name.';
    if (!add.city.trim()) next.city = 'Enter the city.';
    setAddErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setAddError(null);
    try {
      const res = await fetch('/api/v1/sites/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: add.siteName.trim(), city: add.city.trim(), siteCode: add.siteCode.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; errorCode?: string };
      if (res.ok && data.success) {
        setAddOpen(false);
        setAdd({ siteName: '', city: '', siteCode: '' });
        toast.show({ tone: 'success', message: 'Site added' });
        await refresh.refresh();
      } else setAddError(saveErrorMessage(data));
    } catch {
      setAddError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const openRow = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Sites"
        description="Every customer site on ParkFlows. Click a site to see details or change it."
        updatedAt={refresh.updatedAt}
        primary={
          <Button variant="primary" icon={Plus} disabled={ctx.isViewAs} onClick={() => { setAddErrors({}); setAddError(null); setAddOpen(true); }}>
            Add site
          </Button>
        }
      />
      {refresh.error && !refresh.updatedAt ? (
        <ErrorState title="Couldn't load the sites" onRetry={() => void refresh.refresh()} />
      ) : (
        <>
          <div className="pf-kpis">
            <KpiCard label="Sites" loading={loading} value={formatNumber(rows.length)} meta={`${formatNumber(active.length)} active · ${formatNumber(onHold)} on hold`} />
            <KpiCard
              label="Occupied now, all sites"
              loading={loading}
              value={cap ? `${formatNumber(occ)} / ${formatNumber(cap)}` : undefined}
              emptyReason="No slots set up yet"
              meta="active sites only"
            />
            <KpiCard label="Pending pass requests" loading={loading} value={formatNumber(pending)} meta="across all sites" />
          </div>
          <div className="pf-card pf-stack">
            <div className="pf-form-row">
              <TextField label="Search sites" fieldClassName="pf-grow" placeholder="Name, code or city" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              <Select
                label="Status"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'All statuses' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'ON_HOLD', label: 'On hold' },
                  { value: 'DEACTIVATED', label: 'Deactivated' },
                ]}
              />
            </div>
            <Table
              caption="Sites"
              columns={columns}
              rows={pageRows}
              rowKey={(r) => r.id}
              loading={loading}
              onRowClick={(r) => setOpenId(r.id)}
              empty={
                rows.length ? (
                  <EmptyState title="No sites match these filters" actions={<Button onClick={() => { setQ(''); setStatus('ALL'); }}>Clear filters</Button>} />
                ) : (
                  <EmptyState title="No sites yet" text="Add the first customer site to get started." />
                )
              }
            />
            {shownRows.length > 0 && (
              <Pagination page={current} pageSize={pageSize} total={shownRows.length} onPage={setPage} pageSizes={PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="sites" />
            )}
          </div>
        </>
      )}

      <SitePanel
        row={openRow}
        site={details.find((d) => d.id === openId) ?? null}
        readOnly={ctx.isViewAs}
        onClose={() => setOpenId(null)}
        onSaved={(m) => {
          toast.show({ tone: 'success', message: m });
          void refresh.refresh();
        }}
        onViewAs={onViewAs}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add site"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" form="pf-add-site" variant="primary" loading={busy} loadingLabel="Adding…">
              Add site
            </Button>
          </>
        }
      >
        <form id="pf-add-site" className="pf-stack" onSubmit={submitAdd} noValidate>
          {addError && <Banner tone="danger">{addError}</Banner>}
          <TextField label="Site name" required value={add.siteName} error={addErrors.siteName} onChange={(e) => setAdd((a) => ({ ...a, siteName: e.target.value }))} />
          <TextField label="City" required value={add.city} error={addErrors.city} onChange={(e) => setAdd((a) => ({ ...a, city: e.target.value }))} />
          <TextField label="Site code" mono help="Short code shown on every record, e.g. ALP. Leave it empty to get a numbered code (SITE-123)." value={add.siteCode} maxLength={10} onChange={(e) => setAdd((a) => ({ ...a, siteCode: e.target.value }))} />
        </form>
      </Modal>
    </>
  );
};
