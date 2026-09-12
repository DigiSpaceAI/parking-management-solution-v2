import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * Site Admin — Live Slots page
 *
 * Converted from the Claude Design export. Scoped deliberately for
 * tonight's session — the design's full page also includes a
 * "publish maintenance notice" workflow (audience-targeted closures
 * pushed to the Employee/Attendant/Valet/Auditor apps) which is a
 * genuinely new backend concept, not confirmed to exist anywhere in
 * this project. Building that properly needs its own scoped session,
 * not a rushed version — see the next-release checklist. What's here
 * is the core, real part: a zone-organized live grid and a slot-detail
 * sidebar, both wired to actual data.
 *
 * DATA SOURCING:
 * - Slot list, status, level/zone grouping: confirmed real, GET
 *   /api/v1/slots — zone grouping reuses the exact puzzleNumber-based
 *   logic already proven in the mobile Attendant app's BasementSummary
 *   (slots with a real puzzleNumber group by that; slots without one
 *   group by their slotNumber prefix instead).
 * - Slot detail sidebar's "recent history": NOT wired here. Needs a
 *   per-slot log-history endpoint — the ParkingLog data exists, but
 *   there's no confirmed endpoint that returns "history for this one
 *   slot" specifically. Shown as an honest empty state.
 * - "Shut down [level]" / "Mark maintenance" / the whole maintenance
 *   closure panel: NOT implemented tonight, see file header above.
 */

interface Slot {
  id: string;
  slotNumber: string;
  basement: string;
  floorLocation: string;
  slotType: string;
  allocation: string;
  status: 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
  currentVehicle?: string | null;
  puzzleNumber?: string;
}

const BASEMENTS = ['B1', 'B2', 'B3', 'Ground'];
const STATUSES = ['All statuses', 'VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];
const ALLOCATIONS = ['All allocations', 'EMPLOYEE', 'TRANSPORT', 'VISITOR', 'VIP', 'HANDICAP'];

const statusStyle = (status: Slot['status']) => {
  if (status === 'OCCUPIED') return { bg: '#fdeaee', bd: '#f7b6c2', fg: '#be123c' };
  if (status === 'RESERVED') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e' };
  if (status === 'MAINTENANCE') return { bg: '#f1f5f9', bd: '#cbd5e1', fg: '#475569' };
  return { bg: '#e7f8f0', bd: '#a7e3c8', fg: '#065f46' }; // VACANT
};

function zoneKeyFor(slot: Slot): string {
  if (slot.puzzleNumber) return slot.puzzleNumber;
  const parts = slot.slotNumber.split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : slot.slotNumber;
}

interface SiteAdminLiveSlotsProps {
  siteId: string;
}

export const SiteAdminLiveSlots: React.FC<SiteAdminLiveSlotsProps> = ({ siteId }) => {
  const [allSlots, setAllSlots] = useState<Slot[]>([]);
  const [level, setLevel] = useState('B1');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [allocationFilter, setAllocationFilter] = useState('All allocations');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/slots?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setAllSlots(Array.isArray(data?.slots) ? data.slots : []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadSlots();
    const interval = setInterval(loadSlots, 8000);
    return () => clearInterval(interval);
  }, [loadSlots]);

  const levelSlots = useMemo(() => allSlots.filter((s) => s.basement === level), [allSlots, level]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return levelSlots.filter((s) => {
      if (statusFilter !== 'All statuses' && s.status !== statusFilter) return false;
      if (allocationFilter !== 'All allocations' && s.allocation !== allocationFilter) return false;
      if (q && !s.slotNumber.toLowerCase().includes(q) && !(s.currentVehicle || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [levelSlots, search, statusFilter, allocationFilter]);

  const zones = useMemo(() => {
    const map = new Map<string, Slot[]>();
    filtered.forEach((s) => {
      const key = zoneKeyFor(s);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).map(([name, cells]) => {
      const occ = cells.filter((c) => c.status === 'OCCUPIED').length;
      return { name, cells, occPct: cells.length ? Math.round((occ / cells.length) * 100) : 0 };
    });
  }, [filtered]);

  const levelTabs = BASEMENTS.map((b) => {
    const slots = allSlots.filter((s) => s.basement === b);
    const occ = slots.filter((s) => s.status === 'OCCUPIED').length;
    return { id: b, pct: slots.length ? Math.round((occ / slots.length) * 100) : 0 };
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#64748b', fontFamily: "'Space Grotesk', sans-serif" }}>
            Live slots
          </div>
          <h2 style={{ fontSize: 30, margin: '2px 0 0' }}>{level === 'Ground' ? 'Ground level' : `Basement ${level.slice(1)}`}</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate or slot number"
            style={{ width: 240, padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={allocationFilter} onChange={(e) => setAllocationFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd3e0', borderRadius: 8, fontSize: 13 }}>
            {ALLOCATIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTop: '1px solid #e2e6ee', borderBottom: '1px solid #e2e6ee', padding: '10px 0', marginBottom: 20 }}>
        <div style={{ display: 'flex' }}>
          {levelTabs.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 16px', fontWeight: 600, fontSize: 14,
                border: '1px solid #e2e6ee', borderRight: 0,
                background: level === l.id ? '#2563eb' : 'transparent', color: level === l.id ? '#fff' : '#334155',
              }}
            >
              {l.id} <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, opacity: 0.7, marginLeft: 8 }}>{l.pct}%</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {(['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'] as const).map((s) => {
            const st = statusStyle(s);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 13, height: 13, background: st.bg, border: `1px solid ${st.bd}` }} />
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, letterSpacing: '.06em' }}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        border: '1px solid #fde68a', background: '#fefce8', borderRadius: 8, padding: '10px 14px', marginBottom: 20,
        fontSize: 12, color: '#854d0e',
      }}>
        Maintenance-closure publishing (shutting down a zone with a notice pushed to the Employee/Attendant/Valet/Auditor apps) isn't built yet — see the next-release checklist. "Mark maintenance" below just isn't wired to anything real tonight.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          {loading ? (
            <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>Loading…</div>
          ) : zones.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b', fontSize: 13, textAlign: 'center', border: '1px solid #e2e6ee', borderRadius: 8 }}>
              No slots match your filters.
            </div>
          ) : (
            zones.map((z) => (
              <section key={z.name} style={{ padding: '16px 18px 18px', border: '1px solid #e2e6ee', borderRadius: 8, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <h3 style={{ fontSize: 18, margin: 0, fontFamily: 'ui-monospace, Menlo, monospace' }}>{z.name}</h3>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#334155' }}>{z.occPct}% occupied</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))', gap: 4 }}>
                  {z.cells.map((c) => {
                    const st = statusStyle(c.status);
                    return (
                      <button
                        key={c.id}
                        title={c.slotNumber}
                        onClick={() => setSelected(c)}
                        style={{
                          all: 'unset', cursor: 'pointer', boxSizing: 'border-box', aspectRatio: '1.35', display: 'grid', placeItems: 'center',
                          fontWeight: 600, fontSize: 10, background: st.bg, color: st.fg, border: `1px solid ${st.bd}`,
                        }}
                      >
                        {c.slotNumber.split('-').pop()}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <aside style={{ position: 'sticky', top: 90, padding: '18px 20px', border: '1px solid #e2e6ee', borderRadius: 8, background: '#fff' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' }}>Slot detail</div>
          {selected ? (
            <>
              <h3 style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, margin: '4px 0 2px' }}>{selected.slotNumber}</h3>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#334155' }}>{selected.floorLocation}</div>
              <div style={{ margin: '12px 0' }}>
                {(() => {
                  const st = statusStyle(selected.status);
                  return (
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', display: 'inline-block', fontSize: 11, letterSpacing: '.08em', padding: '3px 9px', background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>
                      {selected.status}
                    </span>
                  );
                })()}
              </div>
              {[
                { k: 'Vehicle', v: selected.currentVehicle || '—' },
                { k: 'Type', v: selected.slotType },
                { k: 'Allocation', v: selected.allocation },
              ].map((r) => (
                <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid #e2e6ee' }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b' }}>{r.k}</span>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{r.v}</span>
                </div>
              ))}
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', margin: '16px 0 6px' }}>Recent history</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Not available yet — needs a per-slot history endpoint.</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                <button style={{ flex: 1, fontSize: 12, padding: '8px 0', border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Change slot</button>
                <button style={{ flex: 1, fontSize: 12, padding: '8px 0', border: '1px solid #cbd3e0', borderRadius: 6, background: '#eef1f6', color: '#334155', cursor: 'pointer' }}>Mark maintenance</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 10 }}>Tap a slot to see its details.</div>
          )}
        </aside>
      </div>
    </div>
  );
};
