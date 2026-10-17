import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { RegistrationRequest } from '../../types';
import {
  ActionMenu, BulkBar, Button, EmptyState, IdText, Modal, Pagination, PlateText, Radio, SidePanel, SiteTag, StatusChip, Table, TextField,
  type Column,
} from '../../design-system/components';
import { enumLabel, formatDateTime } from '../../utils/format';
import { daysSince, waitingText, TABLE_PAGE_SIZES } from './shared';

export interface RequestsTabProps {
  rows: RegistrationRequest[]; // pending, filtered
  loading: boolean;
  canDecide: boolean;
  busy: boolean;
  onApprove: (ids: string[]) => Promise<void>;
  onReject: (ids: string[], reason: string) => Promise<boolean>;
  siteCodeFor?: (siteId: string | undefined) => string;
  filtered: boolean;
  onClearFilters: () => void;
}

const REASONS = [
  "Not on the company's employee list",
  "Vehicle number doesn't match the RC",
  'Already has 2 vehicles on a pass',
];

/** Requests (UX S4): bulk approve/reject, reject needs a reason, row click opens the request. */
export const RequestsTab: React.FC<RequestsTabProps> = ({ rows, loading, canDecide, busy, onApprove, onReject, siteCodeFor, filtered, onClearFilters }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [open, setOpen] = useState<RegistrationRequest | null>(null);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const shown = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize]);
  const live = new Set(rows.map((r) => r.id));
  const sel = new Set([...selected].filter((id) => live.has(id)));

  const startReject = (ids: string[]) => {
    setReason('');
    setOther('');
    setReasonError(null);
    setRejecting(ids);
  };
  const confirmReject = async () => {
    const text = reason === 'Other' ? other.trim() : reason;
    if (!text) {
      setReasonError('Choose a reason. The employee needs to know why.');
      return;
    }
    if (await onReject(rejecting!, text)) {
      setSelected(new Set());
      setRejecting(null);
      setOpen(null);
    }
  };
  const approve = async (ids: string[]) => {
    await onApprove(ids);
    setSelected(new Set());
    setOpen(null);
  };

  const columns: Column<RegistrationRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <span className="pf-stack pf-stack--tight">
          <strong>{r.name}</strong>
          <span className="pf-cell-sub">
            {r.employeeId ? <IdText>{r.employeeId}</IdText> : null} {r.department && `· ${r.department}`} {siteCodeFor && <SiteTag code={siteCodeFor(r.siteId)} />}
          </span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', width: 'wide', kind: 'secondary', render: (r) => r.email || '—' },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (r) => (
        <span className="pf-stack pf-stack--tight">
          <PlateText plate={r.vehicleNumber} />
          <span className="pf-cell-sub">{enumLabel(r.vehicleType)}</span>
        </span>
      ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      width: 'wide',
      render: (r) => {
        const d = daysSince(r.createdAt);
        return d >= 2 ? <StatusChip status="PENDING" label={waitingText(d)} tone="warning" /> : <span>{waitingText(d)}</span>;
      },
    },
    { key: 'status', header: 'Status', width: 'wide', render: () => <StatusChip status="PENDING" /> },
    {
      key: 'statusMid',
      header: 'Status',
      width: 'mid',
      render: (r) => {
        const d = daysSince(r.createdAt);
        return <StatusChip status="PENDING" label={`Pending · ${waitingText(d).toLowerCase()}`} tone="warning" />;
      },
    },
  ];

  const rowMenu = (r: RegistrationRequest) => (
    <span className="pf-row-actions">
      <Button size="sm" variant="primary" icon={Check} guard disabled={!canDecide || busy} onClick={() => void approve([r.id])} aria-label={`Approve ${r.name}`}>
        Approve
      </Button>
      <span className="pf-col-wide-inline">
        <Button size="sm" icon={X} guard disabled={!canDecide || busy} onClick={() => startReject([r.id])} aria-label={`Reject ${r.name}`}>
          Reject
        </Button>
      </span>
      <span className="pf-col-mid-inline">
        <ActionMenu label={`More actions for ${r.name}`} items={[{ label: 'Reject…', icon: X, guard: true, disabled: !canDecide || busy, onSelect: () => startReject([r.id]) }]} />
      </span>
    </span>
  );

  return (
    <div className="pf-stack">
      {canDecide && (
        <BulkBar count={sel.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" variant="primary" icon={Check} guard disabled={busy} onClick={() => void approve([...sel])}>
            Approve {sel.size}
          </Button>
          <Button size="sm" icon={X} guard disabled={busy} onClick={() => startReject([...sel])}>
            Reject
          </Button>
        </BulkBar>
      )}
      <Table
        caption="Pending pass requests"
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        loading={loading}
        selected={canDecide ? sel : undefined}
        onSelectedChange={canDecide ? setSelected : undefined}
        onRowClick={(r) => setOpen(r)}
        rowMenu={canDecide ? rowMenu : undefined}
        empty={
          filtered ? (
            <EmptyState title="No requests match these filters" actions={<Button onClick={onClearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No pending requests at this site" text="New pass requests from employees appear here." />
          )
        }
      />
      {rows.length > 0 && (
        <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} pageSizes={TABLE_PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="requests" />
      )}

      <SidePanel
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ''}
        subtitle={open ? <StatusChip status="PENDING" /> : undefined}
        footer={
          open && canDecide ? (
            <>
              <Button variant="primary" icon={Check} guard loading={busy} loadingLabel="Approving…" onClick={() => void approve([open.id])}>
                Approve
              </Button>
              <Button icon={X} guard disabled={busy} onClick={() => startReject([open.id])}>
                Reject
              </Button>
            </>
          ) : undefined
        }
      >
        {open && (
          <dl className="pf-dl">
            <dt>Employee ID</dt>
            <dd>{open.employeeId ? <IdText>{open.employeeId}</IdText> : '—'}</dd>
            <dt>Department</dt>
            <dd>{open.department || '—'}</dd>
            <dt>Designation</dt>
            <dd>{open.designation || '—'}</dd>
            <dt>Email</dt>
            <dd>{open.email || '—'}</dd>
            <dt>Mobile</dt>
            <dd>{open.mobile || '—'}</dd>
            <dt>Vehicle</dt>
            <dd>
              <PlateText plate={open.vehicleNumber} /> · {enumLabel(open.vehicleType)}
              {open.vehicleBrand ? ` · ${open.vehicleBrand}` : ''}
            </dd>
            <dt>Requested</dt>
            <dd>
              {formatDateTime(open.createdAt)} ({waitingText(daysSince(open.createdAt)).toLowerCase()})
            </dd>
            <dt>Source</dt>
            <dd>{open.registrationType === 'PARKING_ADMIN' ? 'Added by a site admin' : 'Employee request'}</dd>
          </dl>
        )}
      </SidePanel>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting && rejecting.length > 1 ? `Reject ${rejecting.length} requests?` : 'Reject this request?'}
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" guard loading={busy} loadingLabel="Rejecting…" onClick={() => void confirmReject()}>
              Reject
            </Button>
          </>
        }
      >
        <div className="pf-stack">
          <p>The employee will see your reason in the app and can send a new request.</p>
          <fieldset className="pf-fieldset" aria-describedby={reasonError ? 'reject-reason-error' : undefined}>
            <legend className="pf-field-label">
              Reason<span className="pf-req" aria-hidden="true">*</span>
            </legend>
            {[...REASONS, 'Other'].map((r) => (
              <Radio key={r} name="reject-reason" label={r} checked={reason === r} invalid={!!reasonError} onChange={() => { setReason(r); setReasonError(null); }} />
            ))}
            {reasonError && (
              <p className="pf-field-error" id="reject-reason-error" role="alert">
                {reasonError}
              </p>
            )}
          </fieldset>
          {reason === 'Other' && <TextField label="Reason in your words" required value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} />}
        </div>
      </Modal>
    </div>
  );
};
