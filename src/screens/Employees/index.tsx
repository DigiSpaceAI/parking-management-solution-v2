import React, { useMemo, useState } from 'react';
import { Download, Globe, Upload, UserPlus } from 'lucide-react';
import type { Employee, RegistrationRequest } from '../../types';
import { Button, ErrorState, PageHeader, Select, SidePanel, TabPanel, Tabs, TextField, useToast } from '../../design-system/components';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import { DomainsList } from '../shell/DomainsList';
import { RequestsTab } from './RequestsTab';
import { RegisteredTab } from './RegisteredTab';
import { RejectedTab } from './RejectedTab';
import { AddEmployeePanel } from './AddEmployeePanel';
import { ImportCsvModal, employeeTemplateCsv } from './ImportCsvModal';
import { matches, type ModuleRights } from './shared';

export interface EmployeesProps {
  siteId: string;
  /** APPROVALS module rights (Requests tab, approve / reject). */
  approvals: ModuleRights;
  /** REGISTRATION module rights (Registered and Rejected tabs, add, import, domains). */
  registration: ModuleRights;
  /** Tell the shell to refresh its badge counts. */
  onChanged?: () => void;
}

type TabId = 'requests' | 'registered' | 'rejected';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: { success?: boolean; message?: string; errorCode?: string; errors?: unknown } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, data };
}

/**
 * Employees & vehicles (002 F6, UX S4): Registration and Approvals in one place (AC-11).
 * Tabs Requests (APPROVALS) · Registered · Rejected (REGISTRATION); Revoked is not shown
 * (no revoked state exists yet). Search by name, employee ID or plate; department filter.
 * Writes use the 001 endpoints and the write guard; the server checks the same rights.
 */
export const Employees: React.FC<EmployeesProps> = ({ siteId, approvals, registration, onChanged }) => {
  const toast = useToast();
  const site = useSiteContext();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const firstTab: TabId = approvals.view ? 'requests' : 'registered';
  const [tab, setTab] = useState<TabId>(firstTab);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [domainsOpen, setDomainsOpen] = useState(false);

  const refresh = useAutoRefresh(
    async (isCurrent) => {
      const [regs, emps] = await Promise.all([
        fetch('/api/v1/registrations'),
        registration.view ? fetch('/api/v1/employees') : Promise.resolve(null),
      ]);
      if (!regs.ok || (emps && !emps.ok)) return false;
      const r = (await regs.json()) as { requests?: RegistrationRequest[] };
      const e = emps ? ((await emps.json()) as { employees?: Employee[] }) : { employees: [] };
      if (!isCurrent()) return false;
      setRequests(r.requests || []);
      setEmployees(e.employees || []);
      return true;
    },
    [siteId, registration.view]
  );

  const pending = requests.filter((r) => r.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rejected = requests.filter((r) => r.status === 'REJECTED').sort((a, b) => (b.reviewedAt || b.createdAt).localeCompare(a.reviewedAt || a.createdAt));
  const departments = useMemo(
    () => [...new Set([...requests, ...employees].map((x) => x.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [requests, employees]
  );
  const keep = <T extends Employee | RegistrationRequest>(rows: T[]) => rows.filter((r) => matches(r, q) && (dept === 'ALL' || r.department === dept));
  const filtered = !!q.trim() || dept !== 'ALL';
  const clearFilters = () => {
    setQ('');
    setDept('ALL');
  };

  const after = async () => {
    await refresh.refresh();
    onChanged?.();
  };

  const approve = async (ids: string[]) => {
    setBusy(true);
    let ok = 0;
    let lastError: string | null = null;
    for (const id of ids) {
      try {
        const { ok: good, data } = await postJson('/api/v1/registrations/approve', { requestId: id });
        if (good && data.success) ok += 1;
        else lastError = saveErrorMessage(data);
      } catch {
        lastError = COPY_SAVE_ERROR;
      }
    }
    setBusy(false);
    if (ok) toast.show({ tone: 'success', message: `${ok} ${ok === 1 ? 'request' : 'requests'} approved` });
    if (lastError) toast.show({ tone: 'error', message: ok ? `${ids.length - ok} not approved: ${lastError}` : lastError });
    await after();
  };

  const reject = async (ids: string[], reason: string): Promise<boolean> => {
    setBusy(true);
    let ok = 0;
    let lastError: string | null = null;
    for (const id of ids) {
      try {
        const { ok: good, data } = await postJson('/api/v1/registrations/reject', { requestId: id, reason });
        if (good && data.success) ok += 1;
        else lastError = saveErrorMessage(data);
      } catch {
        lastError = COPY_SAVE_ERROR;
      }
    }
    setBusy(false);
    if (ok) toast.show({ tone: 'success', message: `${ok} ${ok === 1 ? 'request' : 'requests'} rejected` });
    if (lastError) toast.show({ tone: 'error', message: lastError });
    await after();
    return ok > 0;
  };

  const save = async (e: Partial<Employee>) => {
    setBusy(true);
    setSaveError(null);
    try {
      const { ok, data } = await postJson('/api/v1/employees/save', { ...e, siteId: e.siteId || siteId });
      if (ok && data.success) {
        toast.show({ tone: 'success', message: editing ? 'Employee updated' : 'Employee added' });
        setPanelOpen(false);
        setEditing(null);
        await after();
      } else setSaveError(saveErrorMessage(data));
    } catch {
      setSaveError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const importRows = async (rows: Partial<Employee>[]) => {
    try {
      const { ok, data } = await postJson('/api/v1/employees/bulk-upload', { employees: rows.map((r) => ({ ...r, siteId })) });
      const errors = Array.isArray(data.errors) ? (data.errors as string[]) : [];
      if (ok && data.success) {
        await after();
        return { ok: true, message: data.message || 'Imported.', errors };
      }
      return { ok: false, message: saveErrorMessage(data), errors };
    } catch {
      return { ok: false, message: COPY_SAVE_ERROR, errors: [] };
    }
  };

  const openAdd = () => {
    setEditing(null);
    setSaveError(null);
    setPanelOpen(true);
  };
  const canAdd = registration.create || registration.edit;
  const siteCodeFor = site.isAllSites ? site.siteCodeFor : undefined;

  const tabs = [
    ...(approvals.view ? [{ id: 'requests', label: 'Requests', count: pending.length }] : []),
    ...(registration.view ? [{ id: 'registered', label: 'Registered' }, { id: 'rejected', label: 'Rejected' }] : []),
  ];
  const current: TabId = tabs.some((t) => t.id === tab) ? tab : firstTab;
  const loading = refresh.loading && !refresh.updatedAt;

  return (
    <>
      <PageHeader
        title="Employees & vehicles"
        description="Review pass requests and manage who can park at this site."
        updatedAt={refresh.updatedAt}
        primary={
          canAdd ? (
            <Button variant="primary" icon={UserPlus} guard onClick={openAdd}>
              Add employee
            </Button>
          ) : undefined
        }
        menu={[
          ...(registration.create ? [{ label: 'Import CSV', icon: Upload, guard: true, onSelect: () => setImportOpen(true) }] : []),
          ...(registration.create ? [{ label: 'Download template', icon: Download, onSelect: () => download('ParkFlows_employees_template.csv', employeeTemplateCsv()) }] : []),
          ...(registration.view ? [{ label: 'Email domains', icon: Globe, onSelect: () => setDomainsOpen(true) }] : []),
        ]}
      />
      {refresh.error && !refresh.updatedAt ? (
        <ErrorState title="Couldn't load employees and requests" onRetry={() => void refresh.refresh()} />
      ) : (
        <div className="pf-card pf-stack">
          <Tabs idBase="emp" label="Employees and requests" tabs={tabs} value={current} onChange={(id) => setTab(id as TabId)} />
          <div className="pf-form-row">
            <TextField label="Search" fieldClassName="pf-grow" placeholder="Name, employee ID or plate" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select
              label="Department"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              options={[{ value: 'ALL', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
            />
          </div>
          <TabPanel idBase="emp" id={current}>
            {current === 'requests' && (
              <RequestsTab
                rows={keep(pending)}
                loading={loading}
                canDecide={approvals.edit}
                busy={busy}
                onApprove={approve}
                onReject={reject}
                siteCodeFor={siteCodeFor}
                filtered={filtered}
                onClearFilters={clearFilters}
              />
            )}
            {current === 'registered' && (
              <RegisteredTab
                rows={keep(employees)}
                loading={loading}
                canEdit={registration.edit}
                onEdit={(e) => {
                  setEditing(e);
                  setSaveError(null);
                  setPanelOpen(true);
                }}
                siteCodeFor={siteCodeFor}
                filtered={filtered}
                onClearFilters={clearFilters}
                onAdd={canAdd ? openAdd : undefined}
              />
            )}
            {current === 'rejected' && <RejectedTab rows={keep(rejected)} loading={loading} siteCodeFor={siteCodeFor} filtered={filtered} onClearFilters={clearFilters} />}
          </TabPanel>
        </div>
      )}

      <AddEmployeePanel open={panelOpen} employee={editing} saving={busy} error={saveError} onClose={() => setPanelOpen(false)} onSave={(e) => void save(e)} />
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} onImport={importRows} />
      <SidePanel open={domainsOpen} onClose={() => setDomainsOpen(false)} title="Email domains">
        <DomainsList canEdit={registration.edit} />
      </SidePanel>
    </>
  );
};
