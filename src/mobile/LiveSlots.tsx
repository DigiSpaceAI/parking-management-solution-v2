import React, { useState, useMemo, useEffect } from 'react';
import type { ParkingSlot, SlotStatus } from '../types';
import { apiFetch } from './api';

interface LiveSlotsProps {
  slots: ParkingSlot[];
  onRefresh: () => void;
  onOpenManualForSlot: (slotNumber: string) => void;
  initialLevelFilter?: string | null;
}

const C = {
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', borderStrong: '#cbd3e0', panel: '#eef1f6',
  vacantBg: '#e7f8f0', vacantBd: '#a7e3c8', vacantFg: '#065f46',
  occupiedBg: '#fdeaee', occupiedBd: '#f7b6c2', occupiedFg: '#be123c',
  reservedBg: '#fef3c7', reservedBd: '#fde68a', reservedFg: '#92400e',
  maintBg: '#f1f5f9', maintBd: '#cbd5e1', maintFg: '#475569',
  primary: '#2563eb', danger: '#f43f5e',
};

const statusStyle: Record<SlotStatus, { bg: string; bd: string; fg: string }> = {
  VACANT: { bg: C.vacantBg, bd: C.vacantBd, fg: C.vacantFg },
  OCCUPIED: { bg: C.occupiedBg, bd: C.occupiedBd, fg: C.occupiedFg },
  RESERVED: { bg: C.reservedBg, bd: C.reservedBd, fg: C.reservedFg },
  MAINTENANCE: { bg: C.maintBg, bd: C.maintBd, fg: C.maintFg },
};

export const LiveSlots: React.FC<LiveSlotsProps> = ({ slots, onRefresh, onOpenManualForSlot, initialLevelFilter }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SlotStatus | 'ALL'>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>(initialLevelFilter || 'ALL');
  const [isGridView, setIsGridView] = useState(true);
  const [sheetSlot, setSheetSlot] = useState<ParkingSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Picks up a level filter set by navigating here from the Levels page
  // (tapping a level's header) — only applies it when it actually changes,
  // so it doesn't fight the attendant's own filter choices afterward.
  useEffect(() => {
    if (initialLevelFilter) setLevelFilter(initialLevelFilter);
  }, [initialLevelFilter]);

  // The sheet previously held a frozen snapshot of whichever slot was
  // tapped — if another attendant released or changed that exact slot
  // while this sheet was open (slots refresh every 4s), the sheet kept
  // showing stale data (old vehicle, old status) until manually closed.
  // Re-sync it to the latest matching record on every slots update, and
  // close it automatically if the slot's no longer OCCUPIED — someone
  // else already actioned it, so there's nothing left to release.
  useEffect(() => {
    if (!sheetSlot) return;
    const latest = slots.find((s) => s.id === sheetSlot.id);
    if (!latest || latest.status !== 'OCCUPIED') {
      setSheetSlot(null);
      setSheetError(null);
    } else if (latest !== sheetSlot) {
      setSheetSlot(latest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const closeSheet = () => {
    setSheetSlot(null);
    setSheetError(null);
  };

  const releaseSlot = async () => {
    if (!sheetSlot) return;
    setBusy(true);
    setSheetError(null);
    try {
      const res = await apiFetch('/api/v1/vehicles/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumberOrSlot: sheetSlot.slotNumber }),
      });
      const data = await res.json();
      if (data.success) {
        closeSheet();
        onRefresh();
      } else {
        setSheetError(data.message || 'Could not release this slot.');
      }
    } catch {
      setSheetError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  // Tapping a VACANT slot opens the full Manual Entry modal (with real
  // registry lookup), pre-filled with that slot — matches the design.
  // Tapping an OCCUPIED slot opens the lightweight local release sheet,
  // since releasing doesn't need any of the manual-entry machinery.
  const slotTap = (s: ParkingSlot) => {
    if (s.status === 'VACANT') {
      onOpenManualForSlot(s.slotNumber);
    } else if (s.status === 'OCCUPIED') {
      setSheetSlot(s);
    }
  };

  const levels = useMemo(() => Array.from(new Set(slots.map((s) => s.basement))).sort(), [slots]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return slots.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (levelFilter !== 'ALL' && s.basement !== levelFilter) return false;
      if (q && !s.slotNumber.toLowerCase().includes(q) && !(s.currentVehicle || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [slots, search, statusFilter, levelFilter]);

  const statusFilters: { key: SlotStatus | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'VACANT', label: 'Vacant' },
    { key: 'OCCUPIED', label: 'Occupied' },
    { key: 'RESERVED', label: 'Reserved' },
  ];

  return (
    <div>
      <div style={{ margin: '0 16px', display: 'flex', alignItems: 'center', gap: 9, padding: '0 13px', height: 48, borderRadius: 13, background: '#fff', border: `1px solid ${C.border}` }}>
        <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.faint}`, flex: 'none' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search slot or plate"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.inkSoft, fontWeight: 500, fontSize: 13.5 }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ border: 'none', background: C.border, color: C.label, width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>×</button>
        )}
      </div>

      <div style={{ margin: '11px 0 0', padding: '0 16px', display: 'flex', gap: 7, overflowX: 'auto' }}>
        {statusFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            style={{
              flex: 'none', height: 38, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
              background: statusFilter === f.key ? '#2563eb' : '#fff',
              border: `1px solid ${statusFilter === f.key ? '#2563eb' : C.borderStrong}`,
              color: statusFilter === f.key ? '#fff' : C.label,
              fontWeight: 700, fontSize: 12,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ margin: '9px 0 0', padding: '0 16px', display: 'flex', gap: 7, alignItems: 'center' }}>
        <button onClick={() => setLevelFilter('ALL')} style={{ flex: 'none', height: 36, padding: '0 13px', borderRadius: 9, cursor: 'pointer', background: levelFilter === 'ALL' ? C.panel : '#fff', border: `1px solid ${C.borderStrong}`, color: C.label, fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5 }}>All</button>
        {levels.map((lv) => (
          <button key={lv} onClick={() => setLevelFilter(lv)} style={{ flex: 'none', height: 36, padding: '0 13px', borderRadius: 9, cursor: 'pointer', background: levelFilter === lv ? C.panel : '#fff', border: `1px solid ${C.borderStrong}`, color: C.label, fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5 }}>{lv}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setIsGridView((v) => !v)} style={{ height: 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', background: C.panel, border: `1px solid ${C.borderStrong}`, color: C.label, fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}>
          {isGridView ? 'Plan view' : 'Grid view'}
        </button>
      </div>

      <div style={{ margin: '12px 16px 0', fontFamily: 'monospace', fontWeight: 500, fontSize: 10.5, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>
        {filtered.length} slot{filtered.length === 1 ? '' : 's'}
        {isGridView && filtered.length > 60 ? ` · showing first 60` : ''}
      </div>

      {filtered.length === 0 && (
        <div style={{ margin: '9px 16px 0', padding: '26px 16px', borderRadius: 14, background: '#fff', border: `1px solid ${C.border}`, textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.label }}>No slots match your filters</div>
          <div style={{ marginTop: 5, fontWeight: 500, fontSize: 11.5, color: C.muted }}>Try clearing the search or switching status/level.</div>
        </div>
      )}

      {isGridView ? (
        <div style={{ margin: '9px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {filtered.map((s) => {
            const st = statusStyle[s.status];
            return (
              <button
                key={s.id}
                onClick={() => slotTap(s)}
                style={{ padding: '11px 9px', borderRadius: 11, background: st.bg, border: `1px solid ${st.bd}`, minHeight: 62, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: st.fg }}>{s.slotNumber}</div>
                <div style={{ marginTop: 6, fontWeight: 500, fontSize: 9.5, color: C.muted }}>{s.currentVehicle || s.status}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ margin: '9px 16px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {levels
            .filter((lv) => levelFilter === 'ALL' || lv === levelFilter)
            .map((lv) => {
              const levelSlots = filtered.filter((s) => s.basement === lv);
              if (levelSlots.length === 0) return null;
              return (
                <div key={lv} style={{ padding: 11, borderRadius: 13, background: '#fff', border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, color: C.label }}>{lv}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, color: C.faint }}>{levelSlots.length} slots</span>
                  </div>
                  <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
                    {levelSlots.map((s) => {
                      const st = statusStyle[s.status];
                      return (
                        <button
                          key={s.id}
                          title={s.slotNumber}
                          onClick={() => slotTap(s)}
                          style={{ height: 34, borderRadius: 7, background: st.bg, border: `1px solid ${st.bd}`, color: st.fg, fontFamily: 'monospace', fontWeight: 700, fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                        >
                          {s.slotNumber.split('-').pop()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {sheetSlot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(15,23,42,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '18px 16px 20px', boxShadow: '0 18px 44px rgba(15,23,42,.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 20, color: C.ink }}>{sheetSlot.slotNumber}</div>
                <div style={{ marginTop: 7, fontWeight: 500, fontSize: 12.5, color: C.muted }}>{sheetSlot.currentVehicle || 'Vehicle'} · occupied</div>
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 8, background: statusStyle.OCCUPIED.bg, border: `1px solid ${statusStyle.OCCUPIED.bd}`, fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: statusStyle.OCCUPIED.fg }}>
                OCCUPIED
              </div>
            </div>

            {sheetError && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#fdeaee', border: '1px solid #f7b6c2', fontWeight: 600, fontSize: 12, color: '#be123c' }}>{sheetError}</div>
            )}

            <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <button onClick={closeSheet} style={{ height: 54, borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Close
              </button>
              <button onClick={releaseSlot} disabled={busy} style={{ height: 54, borderRadius: 12, border: 'none', background: busy ? C.borderStrong : C.danger, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Releasing…' : 'Release slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
