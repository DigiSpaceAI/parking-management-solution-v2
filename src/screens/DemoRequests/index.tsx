import React, { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { DemoRequest, DemoRequestStatus } from '../../types';
import {
  ActionMenu, Banner, Button, EmptyState, ErrorState, Modal, PageHeader, Pagination, Radio, Select, SidePanel, StatusChip, Table, TextField, useToast,
  type Column,
} from '../../design-system/components';
import { formatDateTime, formatNumber } from '../../utils/format';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext, WRITE_DISABLED_VIEW_AS } from '../../utils/withSite';

export interface DemoRequestsProps {
  /** Tell the shell to refresh the New badge. */
  onChanged?: () => void;
}

const STATUS_LABEL: Record<DemoRequestStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', CLOSED: 'Closed' };
const STATUS_TONE: Record<DemoRequestStatus, 'info' | 'warning' | 'neutral'> = { NEW: 'info', CONTACTED: 'warning', CLOSED: 'neutral' };
const PAGE_SIZES = [25, 50];

/**
 * Demo requests (002 F10, AC-32): requests from the parkflows.in "Book a demo" form, Master
 * only. 7-column table, side panel with every field, status New → Contacted → Closed with a
 * note, CSV export, and Delete request (for when the person asks to be removed, AC-32d).
 * Status changes and Delete need the real Master: they are off while viewing as someone else.
 */
export const DemoRequests: React.FC<DemoRequestsProps> = ({ onChanged }) => {
  const toast = useToast();
  const ctx = useSiteContext();
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | DemoRequestStatus>('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<DemoRequestStatus>('NEW');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const readOnly = ctx.isViewAs;

  const refresh = useAutoRefresh(async (isCurrent) => {
    const res = await fetch('/api/v1/demo-requests');
    if (!res.ok) return false;
    const data = (await res.json()) as { requests?: DemoRequest[] };
    if (!isCurrent()) return false;
    setRows((data.requests || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    return true;
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) => (filter === 'ALL' || r.status === filter) && (!needle || [r.name, r.company, r.city, r.workEmail].some((v) => (v || '').toLowerCase().includes(needle)))
    );
  }, [rows, filter, q]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);
  const open = rows.find((r) => r.id === openId) ?? null;
  const loading = refresh.loading && !refresh.updatedAt;

  const openPanel = (r: DemoRequest) => {
    setOpenId(r.id);
    setNextStatus(r.status);
    setNote(r.note || '');
    setPanelError(null);
  };

  const saveStatus = async () => {
    if (!open) return;
    setBusy(true);
    setPanelError(null);
    try {
      const res = await fetch('/api/v1/demo-requests/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: open.id, status: nextStatus, note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; errorCode?: string };
      if (res.ok && data.success) {
        toast.show({ tone: 'success', message: `Marked ${STATUS_LABEL[nextStatus].toLowerCase()}` });
        await refresh.refresh();
        onChanged?.();
      } else setPanelError(saveErrorMessage(data));
    } catch {
      setPanelError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!open) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/demo-requests/${encodeURIComponent(open.id)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; errorCode?: string };
      if (res.ok && data.success) {
        setConfirmDelete(false);
        setOpenId(null);
        setRows((list) => list.filter((r) => r.id !== open.id));
        toast.show({ tone: 'success', message: 'Request deleted' });
        void refresh.refresh();
        onChanged?.();
      } else setDeleteError(saveErrorMessage(data));
    } catch {
      setDeleteError("Couldn't delete the request. Nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch('/api/v1/demo-requests/export');
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parkflows-demo-requests.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.show({ tone: 'error', message: "Couldn't export the requests. Try again." });
    }
  };

  const columns: Column<DemoRequest>[] = [
    { key: 'received', header: 'Received', kind: 'secondary', render: (r) => formatDateTime(r.createdAt) },
    { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'company', header: 'Company', render: (r) => r.company || '—' },
    { key: 'city', header: 'City', width: 'wide', render: (r) => r.city || '—' },
    { key: 'facility', header: 'Facility', width: 'wide', render: (r) => r.facilityType || '—' },
    { key: 'slots', header: 'Slots', kind: 'num', render: (r) => (typeof r.slotsApprox === 'number' ? formatNumber(r.slotsApprox) : '—') },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.status} label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} /> },
  ];
  const newCount = rows.filter((r) => r.status === 'NEW').length;

  return (
    <>
      <PageHeader
        title="Demo requests"
        description="Requests from the Book a demo form on parkflows.in. Nothing is emailed: check this page at least once a working day."
        updatedAt={refresh.updatedAt}
        primary={
          <Button icon={Download} disabled={!rows.length} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />
      {refresh.error && !refresh.updatedAt ? (
        <ErrorState title="Couldn't load the demo requests" onRetry={() => void refresh.refresh()} />
      ) : (
        <div className="pf-card pf-stack">
          <div className="pf-form-row">
            <TextField label="Search" fieldClassName="pf-grow" placeholder="Name, company, city or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <Select
              label="Status"
              value={filter}
              onChange={(e) => { setFilter(e.target.value as 'ALL' | DemoRequestStatus); setPage(1); }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'NEW', label: `New (${formatNumber(newCount)})` },
                { value: 'CONTACTED', label: 'Contacted' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />
          </div>
          <Table
            caption="Demo requests"
            columns={columns}
            rows={pageRows}
            rowKey={(r) => r.id}
            loading={loading}
            onRowClick={openPanel}
            empty={
              rows.length ? (
                <EmptyState title="No requests match these filters" actions={<Button onClick={() => { setQ(''); setFilter('ALL'); }}>Clear filters</Button>} />
              ) : (
                <EmptyState title="No demo requests yet" text="Requests sent from parkflows.in appear here." />
              )
            }
          />
          {shown.length > 0 && (
            <Pagination page={current} pageSize={pageSize} total={shown.length} onPage={setPage} pageSizes={PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="requests" />
          )}
        </div>
      )}

      <SidePanel
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ''}
        subtitle={open ? <StatusChip status={open.status} label={STATUS_LABEL[open.status]} tone={STATUS_TONE[open.status]} /> : undefined}
        footer={
          open ? (
            <>
              <Button variant="primary" loading={busy} loadingLabel="Saving…" disabled={readOnly || (nextStatus === open.status && note.trim() === (open.note || ''))} title={readOnly ? WRITE_DISABLED_VIEW_AS : undefined} onClick={() => void saveStatus()}>
                Save status
              </Button>
              <ActionMenu
                label={`More actions for ${open.name}`}
                items={[{ label: 'Delete request', icon: Trash2, destructive: true, disabled: readOnly, onSelect: () => { setDeleteError(null); setConfirmDelete(true); } }]}
              />
            </>
          ) : undefined
        }
      >
        {open && (
          <>
            {panelError && <Banner tone="danger">{panelError}</Banner>}
            <dl className="pf-dl">
              <dt>Received</dt>
              <dd>{formatDateTime(open.createdAt)}</dd>
              <dt>Company</dt>
              <dd>{open.company || '—'}</dd>
              <dt>Work email</dt>
              <dd>{open.workEmail ? <a className="pf-link" href={`mailto:${open.workEmail}`}>{open.workEmail}</a> : '—'}</dd>
              <dt>Phone</dt>
              <dd>{open.phone ? <a className="pf-link" href={`tel:${open.phone}`}>{open.phone}</a> : '—'}</dd>
              <dt>Preferred contact</dt>
              <dd>{open.preferredContact}</dd>
              <dt>City</dt>
              <dd>{open.city || '—'}</dd>
              <dt>Facility</dt>
              <dd>{open.facilityType || '—'}</dd>
              <dt>Slots (approx.)</dt>
              <dd>{typeof open.slotsApprox === 'number' ? formatNumber(open.slotsApprox) : '—'}</dd>
              <dt>Sites (approx.)</dt>
              <dd>{typeof open.sitesApprox === 'number' ? formatNumber(open.sitesApprox) : '—'}</dd>
              <dt>Message</dt>
              <dd className="pf-pre">{open.message || '—'}</dd>
              <dt>Consent</dt>
              <dd>{formatDateTime(open.consentAt)}</dd>
              {open.handledBy && (
                <>
                  <dt>Last update</dt>
                  <dd>
                    {open.handledBy}
                    {open.handledAt ? `, ${formatDateTime(open.handledAt)}` : ''}
                  </dd>
                </>
              )}
            </dl>
            <fieldset className="pf-fieldset">
              <legend className="pf-field-label">Status</legend>
              {(['NEW', 'CONTACTED', 'CLOSED'] as DemoRequestStatus[]).map((s) => (
                <Radio key={s} name="demo-status" label={STATUS_LABEL[s]} checked={nextStatus === s} disabled={readOnly} onChange={() => setNextStatus(s)} />
              ))}
            </fieldset>
            <TextField label="Note" help="For your team, e.g. when you called. Up to 1,000 characters." value={note} maxLength={1000} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
      </SidePanel>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this request?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" icon={Trash2} loading={busy} loadingLabel="Deleting…" disabled={readOnly} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <div className="pf-stack">
          <p>This permanently removes {open?.name}'s details from ParkFlows. Use this when the person asks to be removed.</p>
          {deleteError && <ErrorState title="Couldn't delete the request" text={deleteError} />}
        </div>
      </Modal>
    </>
  );
};
