import React, { useState } from 'react';
import type { RegistrationRequest } from '../../types';
import { Button, EmptyState, IdText, Pagination, PlateText, SidePanel, SiteTag, StatusChip, Table, type Column } from '../../design-system/components';
import { enumLabel, formatDate, formatDateTime } from '../../utils/format';
import { TABLE_PAGE_SIZES } from './shared';

export interface RejectedTabProps {
  rows: RegistrationRequest[];
  loading: boolean;
  siteCodeFor?: (siteId: string | undefined) => string;
  filtered: boolean;
  onClearFilters: () => void;
}

/** Rejected requests with the reason the employee was given. */
export const RejectedTab: React.FC<RejectedTabProps> = ({ rows, loading, siteCodeFor, filtered, onClearFilters }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState<RegistrationRequest | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * pageSize, current * pageSize);
  const columns: Column<RegistrationRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <span className="pf-stack pf-stack--tight">
          <strong>{r.name}</strong>
          <span className="pf-cell-sub">
            {r.employeeId ? <IdText>{r.employeeId}</IdText> : null} {siteCodeFor && <SiteTag code={siteCodeFor(r.siteId)} />}
          </span>
        </span>
      ),
    },
    { key: 'vehicle', header: 'Vehicle', render: (r) => <PlateText plate={r.vehicleNumber} /> },
    { key: 'reason', header: 'Reason', render: (r) => r.rejectionReason || '—' },
    { key: 'when', header: 'Rejected', kind: 'secondary', render: (r) => formatDate(r.reviewedAt || r.updatedAt || r.createdAt) },
  ];
  return (
    <div className="pf-stack">
      <Table
        caption="Rejected requests"
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={(r) => setOpen(r)}
        empty={
          filtered ? (
            <EmptyState title="No requests match these filters" actions={<Button onClick={onClearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No rejected requests" />
          )
        }
      />
      {rows.length > 0 && (
        <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} pageSizes={TABLE_PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="requests" />
      )}
      <SidePanel open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? <StatusChip status="REJECTED" /> : undefined}>
        {open && (
          <dl className="pf-dl">
            <dt>Reason</dt>
            <dd>{open.rejectionReason || '—'}</dd>
            <dt>Rejected</dt>
            <dd>{formatDateTime(open.reviewedAt || open.updatedAt || open.createdAt)}</dd>
            <dt>Email</dt>
            <dd>{open.email || '—'}</dd>
            <dt>Vehicle</dt>
            <dd>
              <PlateText plate={open.vehicleNumber} /> · {enumLabel(open.vehicleType)}
            </dd>
            <dt>Requested</dt>
            <dd>{formatDateTime(open.createdAt)}</dd>
          </dl>
        )}
      </SidePanel>
    </div>
  );
};
