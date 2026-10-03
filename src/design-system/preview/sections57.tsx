import React, { useState } from 'react';
import { LayoutGrid, List, Check, X, MoreHorizontal, Building2 } from 'lucide-react';
import {
  Button, IconButton, Card, KpiCard, Tabs, TabPanel, SegmentedControl, LevelButtons, Pagination,
  Table, BulkBar, Modal, SidePanel, SlotCard, SlotRow, OccupancyBar, BarChart, StatusChip, Select,
  TextField, EmptyState, PlateText, type Column,
} from '../components';
import { Section, Labeled } from './sections14';
import { formatDate, formatTime } from '../../utils/format';

/** Sections for components 5–7 (002 T5). Example values only. */
export const CardsSection: React.FC = () => (
  <Section title="Cards and KPIs">
    <div className="pf-preview-grid">
      <KpiCard label="Occupied now" value="412 / 1,080" meta="38% full" />
      <KpiCard label="Entries today" emptyReason="No vehicles logged today" />
      <KpiCard label="Pending pass requests" loading />
      <Card title="Card title" actions={<Button size="sm">Action</Button>}>
        <p className="pf-state-text">Card body text on a white card with a hairline border.</p>
      </Card>
    </div>
  </Section>
);

export const NavigationSection: React.FC = () => {
  const [tab, setTab] = useState('requests');
  const [view, setView] = useState('slots');
  const [layout, setLayout] = useState('cards');
  const [level, setLevel] = useState('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  return (
    <Section title="Tabs, view switchers, levels and pagination">
      <Tabs
        idBase="pv-tabs" label="Request status" value={tab} onChange={setTab}
        tabs={[{ id: 'requests', label: 'Requests', count: 3 }, { id: 'registered', label: 'Registered', count: 148 }, { id: 'rejected', label: 'Rejected' }, { id: 'later', label: 'Disabled', disabled: true }]}
      />
      <TabPanel idBase="pv-tabs" id={tab}>
        <p className="pf-state-text">Panel for “{tab}”.</p>
      </TabPanel>
      <Labeled label="Segmented controls">
        <SegmentedControl idBase="pv-view" label="View" value={view} onChange={setView}
          options={[{ id: 'slots', label: 'Live parking slots', count: 1080 }, { id: 'puzzle', label: 'Puzzle wise status', count: 24 }]} />
        <TabPanel idBase="pv-view" id={view}><p className="pf-state-text">Showing “{view}”.</p></TabPanel>
        <SegmentedControl idBase="pv-layout" label="Layout" value={layout} onChange={setLayout} hasPanels={false}
          options={[{ id: 'cards', label: 'Cards', icon: LayoutGrid }, { id: 'list', label: 'List', icon: List }]} />
      </Labeled>
      <LevelButtons label="Level" value={level} onChange={setLevel}
        levels={[{ id: 'all', label: 'All parking', free: 407, total: 1080 }, { id: 'b1', label: 'Basement B1', free: 120, total: 360 }, { id: 'b2', label: 'Basement B2', free: 98, total: 360 }, { id: 'g', label: 'Ground / driveway', free: 189, total: 360 }]} />
      <Pagination page={page} pageSize={size} total={1080} onPage={setPage} pageSizes={[12, 20, 36, 60]} onPageSize={(s) => { setSize(s); setPage(1); }} noun="slots" />
      <Pagination page={1} pageSize={25} total={0} onPage={() => undefined} noun="requests" />
    </Section>
  );
};

interface Req { id: string; name: string; empId: string; dept: string; email: string; plate: string; waitingDays: number; status: string; createdAt: string }
const REQS: Req[] = [
  { id: 'r1', name: 'Rahul Sharma', empId: 'E-1042', dept: 'Finance', email: 'rahul.s@alphatech.in', plate: 'KA05MN1234', waitingDays: 3, status: 'PENDING', createdAt: '2026-09-30T04:10:00Z' },
  { id: 'r2', name: 'Priya Nair', empId: 'E-0877', dept: 'Engineering', email: 'priya.n@alphatech.in', plate: 'MH12AB4321', waitingDays: 1, status: 'PENDING', createdAt: '2026-10-02T05:30:00Z' },
  { id: 'r3', name: 'Arjun Mehta', empId: 'E-1310', dept: 'Facilities', email: 'arjun.m@alphatech.in', plate: 'KA51Z9988', waitingDays: 0, status: 'APPROVED', createdAt: '2026-10-03T03:00:00Z' },
];

export const TableSection: React.FC = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set(['r1']));
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'waiting', dir: 'desc' });
  const [panel, setPanel] = useState<Req | null>(null);
  const [modal, setModal] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [loading, setLoading] = useState(false);
  const rows = [...REQS].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * (sort.key === 'name' ? a.name.localeCompare(b.name) : a.waitingDays - b.waitingDays));
  const columns: Column<Req>[] = [
    { key: 'name', header: 'Employee', sortable: true, render: (r) => <span className="pf-stack"><strong>{r.name}</strong><span className="pf-field-help">{r.empId} · {r.dept}</span></span> },
    { key: 'email', header: 'Email', kind: 'secondary', render: (r) => r.email },
    { key: 'vehicle', header: 'Vehicle', render: (r) => <PlateText plate={r.plate} /> },
    { key: 'waiting', header: 'Waiting', sortable: true, kind: 'num', render: (r) => (r.waitingDays >= 2 ? <StatusChip status="PENDING" label={`${r.waitingDays} days`} /> : `${r.waitingDays} d`) },
    { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'received', header: 'Received', kind: 'secondary', render: (r) => `${formatDate(r.createdAt)}, ${formatTime(r.createdAt)}` },
  ];
  return (
    <Section title="Table, bulk bar, modal and side panel">
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="primary" size="sm" icon={Check} guard>Approve {selected.size}</Button>
        <Button variant="secondary" size="sm" icon={X} onClick={() => setModal(true)}>Reject</Button>
      </BulkBar>
      <Table<Req>
        caption="Pending pass requests (example)" columns={columns} rows={rows} rowKey={(r) => r.id} rowLabel={(r) => r.name}
        selected={selected} onSelectedChange={setSelected} sort={sort}
        onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
        onRowClick={setPanel} rowMenu={(r) => <IconButton icon={MoreHorizontal} label={`More actions for ${r.name}`} />}
      />
      <Labeled label="Loading and empty">
        <Button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>Show loading rows</Button>
      </Labeled>
      <Table<Req> caption="Loading example" columns={columns.slice(0, 4)} rows={loading ? [] : []} rowKey={(r) => r.id} loading={loading}
        empty={<EmptyState title="No pending requests for Alphatech Pune" text="New pass requests appear here." />} />
      <Modal open={modal} onClose={() => { setModal(false); setReasonError(''); }} title={`Reject ${selected.size || 1} request${selected.size > 1 ? 's' : ''}?`}
        footer={<>
          <Button onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { if (!reason) { setReasonError('Choose a reason. The employee needs to know why.'); return; } setModal(false); }}>Reject</Button>
        </>}>
        <p>The employee sees the reason in the app.</p>
        <Select label="Reason" required placeholder="Choose a reason" value={reason} error={reasonError || undefined} onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
          options={[{ value: 'domain', label: 'Email domain isn’t allowed' }, { value: 'vehicle', label: 'Vehicle details don’t match' }, { value: 'other', label: 'Other' }]} />
      </Modal>
      <SidePanel open={!!panel} onClose={() => setPanel(null)} title={panel?.name} subtitle={panel ? <StatusChip status={panel.status} /> : null}
        footer={<><Button variant="primary" guard>Approve</Button><Button onClick={() => setModal(true)}>Reject</Button></>}>
        {panel && (
          <dl className="pf-dl">
            <dt>Employee ID</dt><dd>{panel.empId}</dd>
            <dt>Department</dt><dd>{panel.dept}</dd>
            <dt>Email</dt><dd>{panel.email}</dd>
            <dt>Received</dt><dd>{formatDate(panel.createdAt)}</dd>
          </dl>
        )}
        <TextField label="Note" help="Only admins see this." />
      </SidePanel>
    </Section>
  );
};

export const SlotsSection: React.FC = () => (
  <Section title="Slot cards, list rows, occupancy and chart">
    <div className="pf-slot-grid">
      <SlotCard code="B1-042" status="OCCUPIED" decode="Basement B1 · Bay 42" slotType="SUV" plate="KA05MN1234" inSince="2026-10-03T03:44:00Z" heightM={2.5} lengthM={5} onOpen={() => undefined} onMarkExit={() => undefined} />
      <SlotCard code="B1-043" status="VACANT" decode="Basement B1 · Bay 43" slotType="SEDAN" ev heightM={2.1} onOpen={() => undefined} />
      <SlotCard code="B2-P03-S2" status="RESERVED" decode="Puzzle 03 · Pallet 2" slotType="SEDAN" level={2} onOpen={() => undefined} />
      <SlotCard code="G-014" status="MAINTENANCE" decode="Ground · Bay 14" slotType="TWO_WHEELER" onOpen={() => undefined} />
      <SlotCard code="B1-050" status="OCCUPIED" decode="Basement B1 · Bay 50" slotType="SEDAN" plate="MH12AB4321" heightM={2.1} lengthM={4.8} onOpen={() => undefined} onMarkExit={() => undefined} />
    </div>
    <span className="pf-preview-label">Compact pallet variant (puzzle view)</span>
    <div className="pf-slot-grid">
        <SlotCard compact code="B2-P03-S3" status="VACANT" decode="Puzzle 03 · Pallet 3" slotType="SEDAN" level={3} heightM={1.6} lengthM={5} />
        <SlotCard compact code="B2-P03-S2" status="OCCUPIED" decode="Puzzle 03 · Pallet 2" slotType="SEDAN" level={2} plate="KA51Z9988" inSince="2026-10-03T02:05:00Z" heightM={1.6} lengthM={5} onMarkExit={() => undefined} />
    </div>
    <div className="pf-table-wrap">
      <table className="pf-table">
        <caption className="pf-sr-only">Slots (list view example)</caption>
        <thead><tr>{['Status', 'Slot', 'Type', 'Height', 'Length', 'Vehicle'].map((h) => <th key={h} scope="col" className={h === 'Height' || h === 'Length' ? 'is-num' : undefined}>{h}</th>)}<th scope="col"><span className="pf-sr-only">Actions</span></th></tr></thead>
        <tbody>
          <SlotRow code="B1-042" status="OCCUPIED" slotType="SUV" plate="KA05MN1234" inSince="2026-10-03T03:44:00Z" heightM={2.5} lengthM={5} onOpen={() => undefined} onMarkExit={() => undefined} />
          <SlotRow code="B1-043" status="VACANT" slotType="SEDAN" ev heightM={2.1} onOpen={() => undefined} />
        </tbody>
      </table>
    </div>
    <div className="pf-preview-grid">
      <Card title="Occupancy">
        <div className="pf-stack">
          <OccupancyBar occupied={412} total={1080} />
          <OccupancyBar occupied={351} total={360} />
          <OccupancyBar occupied={0} total={0} />
        </div>
      </Card>
      <Card title="Entries by hour (example)">
        <BarChart title="Entries by hour today (example data)" valueName="Entries" labels={['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18']} values={[4, 18, 42, 31, 12, 9, 15, 11, 8, 6, 3, 1]} />
      </Card>
      <Card title="Site">
        <EmptyState icon={Building2} title="No slots yet for this site" text="Add slots one by one or upload a CSV." actions={<Button variant="primary">Upload CSV</Button>} />
      </Card>
    </div>
  </Section>
);
