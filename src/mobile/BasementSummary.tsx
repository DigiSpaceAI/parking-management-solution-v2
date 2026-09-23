import React, { useMemo, useState } from 'react';
import type { ParkingSlot, SlotStatus } from '../types';
import { apiFetch } from './api';

interface BasementSummaryProps {
  slots: ParkingSlot[];
  onNavigateToSlots: (level: string) => void;
  onOpenManualForSlot: (slotNumber: string) => void;
  onRefresh: () => void;
}

const C = {
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', panel: '#eef1f6',
  danger: '#f43f5e', amber: '#f59e0b', success: '#059669', primary: '#2563eb',
};

const statusDot: Record<SlotStatus, string> = {
  VACANT: '#10b981',
  OCCUPIED: '#f43f5e',
  RESERVED: '#f59e0b',
  MAINTENANCE: '#8b95a6',
};

// A "pallet" is a real grouping in the data (puzzleNumber, e.g. "B1-P01")
// for stacker/puzzle slots. Slots without one (EV bays, VIP bays,
// two-wheeler/sedan flat zones) get grouped by their zone prefix instead,
// so every slot still lands in some card — matches the design's per-group
// card layout without inventing a pallet structure the data doesn't have.
function palletKeyFor(slot: ParkingSlot): string {
  if (slot.puzzleNumber) return slot.puzzleNumber;
  const parts = slot.slotNumber.split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : slot.slotNumber;
}

export const BasementSummary: React.FC<BasementSummaryProps> = ({ slots, onNavigateToSlots, onOpenManualForSlot, onRefresh }) => {
  const [pickPalletKey, setPickPalletKey] = useState<string | null>(null);
  const [releasingCell, setReleasingCell] = useState<ParkingSlot | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const closePick = () => {
    setPickPalletKey(null);
    setReleasingCell(null);
    setReleaseError(null);
  };

  // Same behavior as tapping a slot on the main Slots page: a vacant cell
  // opens the full Manual Entry modal pre-filled with that slot; an
  // occupied cell asks to confirm release, right here, rather than
  // forcing the attendant back out to the Slots page to actually act on
  // what they can already see in this picker.
  const cellTap = (cell: ParkingSlot) => {
    if (cell.status === 'VACANT') {
      closePick();
      onOpenManualForSlot(cell.slotNumber);
    } else if (cell.status === 'OCCUPIED') {
      setReleasingCell(cell);
      setReleaseError(null);
    }
  };

  const confirmRelease = async () => {
    if (!releasingCell) return;
    setReleaseBusy(true);
    setReleaseError(null);
    try {
      const res = await apiFetch('/api/v1/vehicles/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumberOrSlot: releasingCell.slotNumber }),
      });
      const data = await res.json();
      if (data.success) {
        setReleasingCell(null);
        onRefresh();
      } else {
        setReleaseError(data.message || 'Could not release this slot.');
      }
    } catch {
      setReleaseError('Could not reach the server.');
    } finally {
      setReleaseBusy(false);
    }
  };

  const levels = useMemo(() => Array.from(new Set(slots.map((s) => s.basement))).sort(), [slots]);
  const totalVacant = slots.filter((s) => s.status === 'VACANT').length;
  const totalSlots = slots.length || 1;
  const occupancyPct = Math.round(((totalSlots - totalVacant) / totalSlots) * 100);

  const levelData = levels.map((lv) => {
    const lvSlots = slots.filter((s) => s.basement === lv);
    const vacant = lvSlots.filter((s) => s.status === 'VACANT').length;
    const occupied = lvSlots.filter((s) => s.status === 'OCCUPIED').length;
    const reserved = lvSlots.filter((s) => s.status === 'RESERVED').length;
    const total = lvSlots.length || 1;

    const palletMap = new Map<string, ParkingSlot[]>();
    lvSlots.forEach((s) => {
      const key = palletKeyFor(s);
      if (!palletMap.has(key)) palletMap.set(key, []);
      palletMap.get(key)!.push(s);
    });
    const pallets = Array.from(palletMap.entries()).map(([key, cells]) => ({
      key,
      shortLabel: key.split('-').slice(1).join('-') || key,
      free: cells.filter((c) => c.status === 'VACANT').length,
      total: cells.length,
      cells,
    }));

    return {
      id: lv,
      vacant, occupied, reserved,
      total: lvSlots.length,
      occPct: Math.round((occupied / total) * 100),
      resPct: Math.round((reserved / total) * 100),
      pct: Math.round(((occupied + reserved) / total) * 100),
      pallets,
    };
  });

  const pickPallet = pickPalletKey
    ? levelData.flatMap((l) => l.pallets).find((p) => p.key === pickPalletKey)
    : null;

  // Same reasoning as the main Slots page's release sheet: without this,
  // a stale releasingCell snapshot could sit here across a 4s poll while
  // someone else already released it elsewhere.
  React.useEffect(() => {
    if (!releasingCell) return;
    const latest = slots.find((s) => s.id === releasingCell.id);
    if (!latest || latest.status !== 'OCCUPIED') {
      setReleasingCell(null);
      setReleaseError(null);
    } else if (latest !== releasingCell) {
      setReleasingCell(latest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  return (
    <div>
      <div style={{ margin: '0 16px', padding: 15, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Site vacancy</div>
            <div style={{ marginTop: 7, fontWeight: 700, fontSize: 34, color: C.ink, letterSpacing: '-.02em' }}>{totalVacant}</div>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 500, fontSize: 12, lineHeight: 1.5, color: C.muted }}>
            of {slots.length} slots<br />{occupancyPct}% occupied
          </div>
        </div>
      </div>

      <div style={{ margin: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {levelData.map((b) => (
          <div
            key={b.id}
            onClick={() => onNavigateToSlots(b.id)}
            style={{ padding: 15, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}`, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 20, color: C.ink, letterSpacing: '-.01em' }}>{b.id}</span>
              <div style={{ padding: '6px 9px', borderRadius: 8, background: '#e7f8f0', border: '1px solid #a7e3c8', fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: '#065f46' }}>{b.vacant} VACANT</div>
            </div>
            <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: C.panel, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${b.occPct}%`, background: C.danger }} />
              <div style={{ width: `${b.resPct}%`, background: C.amber }} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontWeight: 500, fontSize: 10.5, color: C.muted }}>
              <span>{b.occupied} occupied · {b.reserved} reserved</span>
              <span>{b.pct}%</span>
            </div>

            <div style={{ marginTop: 13, fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', color: C.faint, textTransform: 'uppercase' }}>Pallets</div>
            <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
              {b.pallets.map((p) => (
                <button
                  key={p.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickPalletKey(p.key);
                  }}
                  style={{ padding: 9, border: `1px solid ${C.border}`, borderRadius: 11, background: C.panel, cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10, color: C.label }}>{p.shortLabel}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 9.5, color: p.free === 0 ? '#e11d48' : '#047857' }}>{p.free}/{p.total}</span>
                  </div>
                  <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                    {p.cells.map((c) => (
                      <div key={c.id} style={{ height: 17, borderRadius: 4, background: statusDot[c.status] }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {pickPallet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 21, background: 'rgba(15,23,42,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '18px 16px 20px', boxShadow: '0 18px 44px rgba(15,23,42,.22)' }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: C.ink }}>{pickPallet.key}</div>
            <div style={{ marginTop: 7, fontWeight: 500, fontSize: 12.5, color: C.muted }}>{pickPallet.free} of {pickPallet.total} vacant · tap a cell to manage it</div>
            <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {pickPallet.cells.map((c) => (
                <button
                  key={c.id}
                  onClick={() => cellTap(c)}
                  disabled={c.status !== 'VACANT' && c.status !== 'OCCUPIED'}
                  style={{
                    height: 58, borderRadius: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: c.status === 'VACANT' || c.status === 'OCCUPIED' ? 'pointer' : 'default',
                    background: c.status === 'VACANT' ? '#e7f8f0' : c.status === 'OCCUPIED' ? '#fdeaee' : c.status === 'RESERVED' ? '#fef3c7' : '#f1f5f9',
                    border: `1px solid ${c.status === 'VACANT' ? '#a7e3c8' : c.status === 'OCCUPIED' ? '#f7b6c2' : c.status === 'RESERVED' ? '#fde68a' : '#cbd5e1'}`,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{c.slotNumber.split('-').pop()}</span>
                  <span style={{ fontWeight: 600, fontSize: 9, letterSpacing: '.06em' }}>{c.status}</span>
                </button>
              ))}
            </div>

            {releasingCell && (
              <div style={{ marginTop: 14, padding: '12px 13px', borderRadius: 12, background: '#fdeaee', border: '1px solid #f7b6c2' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#be123c' }}>Release {releasingCell.slotNumber}?</div>
                <div style={{ marginTop: 3, fontWeight: 500, fontSize: 11.5, color: '#9f1239' }}>{releasingCell.currentVehicle || 'Vehicle'} currently parked here</div>
                {releaseError && <div style={{ marginTop: 8, fontWeight: 600, fontSize: 11.5, color: '#be123c' }}>{releaseError}</div>}
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
                  <button onClick={() => setReleasingCell(null)} style={{ height: 42, borderRadius: 10, border: '1px solid #f7b6c2', background: '#fff', color: '#be123c', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={confirmRelease} disabled={releaseBusy} style={{ height: 42, borderRadius: 10, border: 'none', background: releaseBusy ? '#cbd3e0' : C.danger, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: releaseBusy ? 'default' : 'pointer' }}>
                    {releaseBusy ? 'Releasing…' : 'Confirm release'}
                  </button>
                </div>
              </div>
            )}

            <button onClick={closePick} style={{ marginTop: 14, width: '100%', height: 52, borderRadius: 12, border: `1px solid #cbd3e0`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
