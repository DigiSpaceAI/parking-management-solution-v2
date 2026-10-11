import React, { useMemo, useState } from 'react';
import type { SlotStatus, VehicleType } from '../../types';
import { Card, ErrorState, LevelButtons, PageHeader, Select, Skeleton, SegmentedControl, TabPanel, TextField, useToast } from '../../design-system/components';
import { formatNumber } from '../../utils/format';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { COPY_SAVE_ERROR, saveErrorMessage, useSiteContext } from '../../utils/withSite';
import { compareSlots, isPuzzle, puzzleIdOf, slotInLevel, type LevelId, type LiveSlot } from '../../utils/slots';
import { SlotsView, type Layout } from './SlotsView';
import { PuzzleView, type PuzzleModule } from './PuzzleView';
import { SlotModal } from './SlotModal';

interface SlotsResponse {
  slots?: LiveSlot[];
  summary?: {
    total: number;
    b1: { total: number; free: number };
    b2: { total: number; free: number };
    b3: { total: number; free: number };
    ground: { total: number; free: number };
  };
}

const LAYOUT_KEY = 'parkflows.liveParking.layout';
function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}
function saveLayout(l: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, l);
  } catch {
    /* per-viewer convenience only */
  }
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'VACANT', label: 'Vacant only' },
  { value: 'OCCUPIED', label: 'Occupied only' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];
const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All slot types' },
  { value: 'EV', label: 'EV charging bay' },
  { value: 'SUV', label: 'SUV' },
  { value: 'CSUV', label: 'Compact SUV' },
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'TWO_WHEELER', label: 'Two-wheeler bay' },
];

export interface LiveParkingProps {
  /** The chosen site or 'ALL' (read-only list with a site tag on each slot). */
  siteId: string;
  /** Tell the shell to refresh its badge counts after an entry or exit. */
  onChanged?: () => void;
}

/**
 * Live parking (002 F5, UX S3, AC-14): paged slot cards or a list, the puzzle wise view,
 * level buttons, search/status/type filters, five summary figures and the slot modal.
 * Data from GET /slots (B1/B2 extras: heightM, lengthM, palletLevel, inSince), refreshed
 * every 15 s and straight after the user's own action. Entry and exit live only here (AC-11).
 */
export const LiveParking: React.FC<LiveParkingProps> = ({ siteId, onChanged }) => {
  const toast = useToast();
  const site = useSiteContext();
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [view, setView] = useState<'slots' | 'puzzle'>('slots');
  const [level, setLevel] = useState<LevelId>('ALL');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [puzzlePage, setPuzzlePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useAutoRefresh(
    async (isCurrent) => {
      const res = await fetch('/api/v1/slots');
      if (!res.ok) return false;
      const body = (await res.json()) as SlotsResponse;
      if (!isCurrent()) return false;
      setData(body);
      return true;
    },
    [siteId]
  );

  const slots = data?.slots ?? [];
  const levelSlots = useMemo(() => slots.filter((s) => slotInLevel(s, level)), [slots, level]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const compact = needle.replace(/[^a-z0-9]/g, '');
    return levelSlots
      .filter((s) => {
        if (status !== 'ALL' && s.status !== status) return false;
        if (type !== 'ALL' && s.slotType !== type) return false;
        if (!needle) return true;
        return (
          s.slotNumber.toLowerCase().includes(needle) ||
          (s.floorLocation || '').toLowerCase().includes(needle) ||
          (!!compact && !!s.currentVehicle && s.currentVehicle.toLowerCase().replace(/[^a-z0-9*]/g, '').includes(compact))
        );
      })
      .sort(compareSlots);
  }, [levelSlots, q, status, type]);

  const modules: PuzzleModule[] = useMemo(() => {
    const map = new Map<string, PuzzleModule>();
    for (const s of levelSlots.filter(isPuzzle)) {
      const id = puzzleIdOf(s);
      const key = `${s.siteId ?? ''}|${id}`;
      if (!map.has(key)) map.set(key, { id, basement: s.basement, siteId: s.siteId, pallets: [] });
      map.get(key)!.pallets.push(s);
    }
    const matches = new Set(filtered.map((s) => s.id));
    return [...map.values()]
      .filter((m) => m.pallets.some((p) => matches.has(p.id)))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [levelSlots, filtered]);

  const sum = {
    total: levelSlots.length,
    vacant: levelSlots.filter((s) => s.status === 'VACANT').length,
    occupied: levelSlots.filter((s) => s.status === 'OCCUPIED').length,
    reserved: levelSlots.filter((s) => s.status === 'RESERVED').length,
    maintenance: levelSlots.filter((s) => s.status === 'MAINTENANCE').length,
  };
  const summary = data?.summary;
  const levels = summary
    ? [
        { id: 'ALL', label: 'All parking', free: slots.filter((s) => s.status === 'VACANT').length, total: summary.total },
        { id: 'B1', label: 'Basement B1', ...summary.b1 },
        { id: 'B2', label: 'Basement B2', ...summary.b2 },
        { id: 'B3', label: 'Basement B3', ...summary.b3 },
        { id: 'Ground', label: 'Ground / driveway', ...summary.ground },
      ].filter((l) => l.id === 'ALL' || l.total > 0)
    : [];

  // Any filter change goes back to page 1 (AC-14).
  const resetPages = () => {
    setPage(1);
    setPuzzlePage(1);
  };
  const clearFilters = () => {
    setQ('');
    setStatus('ALL');
    setType('ALL');
    setLevel('ALL');
    resetPages();
  };
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    saveLayout(l);
  };

  // ---- Actions (write-guarded in the UI; the server refuses them in All sites / view-as too) ----
  const act = async (url: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data: { success?: boolean; message?: string; errorCode?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (res.ok && data.success) {
        toast.show({ tone: 'success', message: done });
        setSelectedId(null);
        await refresh.refresh();
        onChanged?.();
      } else {
        toast.show({ tone: 'error', message: saveErrorMessage(data) });
      }
    } catch {
      toast.show({ tone: 'error', message: COPY_SAVE_ERROR });
    } finally {
      setBusy(false);
    }
  };
  const markExit = (s: LiveSlot) => act('/api/v1/vehicles/exit', { vehicleNumberOrSlot: s.slotNumber }, `Exit recorded. Slot ${s.slotNumber} is free.`);
  const recordEntry = (s: LiveSlot, plate: string, vehicleType: VehicleType) =>
    act('/api/v1/vehicles/entry', { vehicleNumber: plate, vehicleType, entryType: 'MANUAL', targetSlotNumber: s.slotNumber }, `Entry recorded in slot ${s.slotNumber}.`);
  const setSlotStatus = (s: LiveSlot, to: SlotStatus) =>
    act('/api/v1/slots/update-status', { slotId: s.id, newStatus: to }, `Slot ${s.slotNumber} is now ${to === 'VACANT' ? 'vacant' : to === 'RESERVED' ? 'reserved' : 'under maintenance'}.`);

  const selected = selectedId ? slots.find((s) => s.id === selectedId) ?? null : null;
  const siteCodeFor = site.isAllSites ? site.siteCodeFor : undefined;
  const loading = refresh.loading && !data;

  const header = (
    <PageHeader
      title="Live parking"
      description="Click a slot to see details, record an entry or exit, or change its status."
      updatedAt={refresh.updatedAt}
      primary={
        <SegmentedControl
          idBase="lp-view"
          label="View"
          value={view}
          onChange={(id) => setView(id as 'slots' | 'puzzle')}
          options={[
            { id: 'slots', label: 'Live parking slots', count: filtered.length },
            { id: 'puzzle', label: 'Puzzle wise status', count: modules.length },
          ]}
        />
      }
    />
  );

  if (refresh.error && !data) {
    return (
      <>
        {header}
        <ErrorState title="Couldn't load the slots" onRetry={() => void refresh.refresh()} />
      </>
    );
  }

  return (
    <>
      {header}
      <Card className="pf-lp-filters">
        {loading ? (
          <Skeleton variant="block" />
        ) : (
          <LevelButtons
            label="Level"
            levels={levels}
            value={level}
            onChange={(id) => {
              setLevel(id as LevelId);
              resetPages();
            }}
          />
        )}
        <div className="pf-form-row">
          <TextField
            label="Search"
            fieldClassName="pf-grow"
            placeholder="Slot (B1-P01), plate (MH12) or location"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPages();
            }}
          />
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              resetPages();
            }}
          />
          <Select
            label="Slot type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              resetPages();
            }}
          />
        </div>
        <dl className="pf-sumfigs" aria-label="Summary for this level">
          <div className="pf-sumfig">
            <dt>Level capacity</dt>
            <dd>{loading ? '—' : formatNumber(sum.total)}</dd>
          </div>
          <div className="pf-sumfig pf-sumfig--vacant">
            <dt>Vacant</dt>
            <dd>{loading ? '—' : formatNumber(sum.vacant)}</dd>
          </div>
          <div className="pf-sumfig pf-sumfig--occupied">
            <dt>Occupied</dt>
            <dd>{loading ? '—' : formatNumber(sum.occupied)}</dd>
          </div>
          <div className="pf-sumfig pf-sumfig--reserved">
            <dt>Reserved</dt>
            <dd>{loading ? '—' : formatNumber(sum.reserved)}</dd>
          </div>
          <div className="pf-sumfig pf-sumfig--maintenance">
            <dt>Under maintenance</dt>
            <dd>{loading ? '—' : formatNumber(sum.maintenance)}</dd>
          </div>
        </dl>
      </Card>

      <TabPanel idBase="lp-view" id={view}>
        {loading ? (
          <Card>
            <div className="pf-slot-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} variant="block" />
              ))}
            </div>
          </Card>
        ) : view === 'slots' ? (
          <SlotsView
            slots={filtered}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            layout={layout}
            onLayout={setLayout}
            onOpen={(s) => setSelectedId(s.id)}
            onMarkExit={markExit}
            onClearFilters={clearFilters}
            siteCodeFor={siteCodeFor}
          />
        ) : (
          <PuzzleView
            modules={modules}
            page={puzzlePage}
            onPage={setPuzzlePage}
            onOpen={(s) => setSelectedId(s.id)}
            onMarkExit={markExit}
            onClearFilters={clearFilters}
            siteCodeFor={siteCodeFor}
          />
        )}
      </TabPanel>

      <SlotModal
        slot={selected}
        siteCode={siteCodeFor ? siteCodeFor(selected?.siteId) : undefined}
        busy={busy}
        onClose={() => setSelectedId(null)}
        onExit={markExit}
        onEntry={recordEntry}
        onStatus={setSlotStatus}
      />
    </>
  );
};
