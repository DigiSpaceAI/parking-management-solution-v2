import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Employee } from '../../types';
import { Button, EmptyState, IdText, Pagination, PlateText, SidePanel, SiteTag, StatusChip, Table, type Column } from '../../design-system/components';
import { enumLabel, formatDate, formatDateTime } from '../../utils/format';
import { TABLE_PAGE_SIZES } from './shared';

export interface RegisteredTabProps {
  rows: Employee[];
  loading: boolean;
  canEdit: boolean;
  onEdit: (e: Employee) => void;
  siteCodeFor?: (siteId: string | undefined) => string;
  filtered: boolean;
  onClearFilters: () => void;
  onAdd?: () => void;
}

/** Registered employees with a pass (Employee whitelist). Row click opens the record; Edit in the panel. */
export const RegisteredTab: React.FC<RegisteredTabProps> = ({ rows, loading, canEdit, onEdit, siteCodeFor, filtered, onClearFilters, onAdd }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState<Employee | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const shown = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize]);
  const statusOf = (e: Employee) => e.status || (e.isActive ? 'ACTIVE' : 'INACTIVE');

  const columns: Column<Employee>[] = [
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
          <span className="pf-cell-sub">{[enumLabel(r.vehicleType), r.vehicleBrand].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={statusOf(r)} tone={statusOf(r) === 'DEFAULTER' ? 'danger' : undefined} /> },
    { key: 'added', header: 'Added', width: 'wide', kind: 'secondary', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div className="pf-stack">
      <Table
        caption="Registered employees"
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={(r) => setOpen(r)}
        empty={
          filtered ? (
            <EmptyState title="No employees match these filters" actions={<Button onClick={onClearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState
              title="No registered employees at this site yet"
              text="Approved requests and employees you add appear here."
              actions={onAdd ? <Button variant="primary" guard onClick={onAdd}>Add employee</Button> : undefined}
            />
          )
        }
      />
      {rows.length > 0 && (
        <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} pageSizes={TABLE_PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="employees" />
      )}
      <SidePanel
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ''}
        subtitle={open ? <StatusChip status={statusOf(open)} /> : undefined}
        footer={
          open && canEdit ? (
            <Button
              icon={Pencil}
              guard
              onClick={() => {
                const e = open;
                setOpen(null);
                onEdit(e);
              }}
            >
              Edit employee
            </Button>
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
            <dt>Added</dt>
            <dd>{formatDateTime(open.createdAt)}</dd>
            <dt>Source</dt>
            <dd>{open.registrationType === 'EMPLOYEE_SELF' ? 'Employee request' : 'Added by a site admin'}</dd>
          </dl>
        )}
      </SidePanel>
    </div>
  );
};
