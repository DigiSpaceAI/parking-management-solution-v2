import React, { useCallback, useEffect, useState } from 'react';

/**
 * Site Admin — Reports page
 *
 * Converted from the Claude Design export (ParkFlows_Site_Admin.html,
 * the REPORTS section). Read this before extending further:
 *
 * - Downloads (CSV): confirmed real, GET /api/v1/export/reports
 *   (pre-existing endpoint, now fixed this session to actually filter
 *   by site — it didn't before).
 * - Registered vs visitor mix: confirmed real, computed from actual
 *   ParkingLog records for the selected range, GET /api/v1/reports/mix.
 * - Overnight violations: confirmed real, computed live from active
 *   logs past the cutoff hour with no matching approved request,
 *   GET /api/v1/reports/violations.
 * - Overnight requests (submit/approve/reject): confirmed real, a
 *   genuinely new entity added this session, GET/POST
 *   /api/v1/reports/overnight-requests(/review).
 * - Slot-wise utilization %: confirmed real, computed from log
 *   entry/exit timestamps clipped to the selected range,
 *   GET /api/v1/reports/utilization.
 * - Occupancy trend and Peak hours: confirmed real, both reconstructed
 *   from actual ParkingLog entry/exit timestamps (not fabricated, and
 *   not dependent on a new snapshot system starting from zero — works
 *   retroactively across the site's entire log history). Occupancy
 *   trend samples each day's logs at every hour to find that day's
 *   peak; peak hours groups real entry timestamps by hour-of-day. See
 *   getOccupancyTrend/getPeakHours in db.ts for the exact reconstruction
 *   logic. GET /api/v1/reports/occupancy-trend and /peak-hours.
 */

interface MixStats {
  registered: number;
  visitor: number;
  total: number;
}

interface Violation {
  vehicleNumber: string;
  slotNumber: string;
  employeeName?: string | null;
  entryTime: string;
  hoursSinceEntry: number;
}

interface OvernightRequest {
  id: string;
  vehicleNumber: string;
  requestedBy: string;
  nights: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

interface SlotUtilization {
  slotNumber: string;
  basement: string;
  occupiedHours: number;
  utilizationPct: number;
}

interface OccupancyDay {
  date: string;
  peakOccupancyPct: number;
  peakOccupiedCount: number;
}

interface PeakHour {
  hour: number;
  avgEntries: number;
}

type RangeKey = '7d' | '30d' | '90d' | 'custom';

interface SiteAdminReportsProps {
  siteId: string;
}

const rangeDays: Record<Exclude<RangeKey, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Occupancy trend — real SVG line chart, reconstructed from actual log
 * data via GET /api/v1/reports/occupancy-trend (see the function's own
 * comment in db.ts for how the reconstruction works). Not a design-tool
 * placeholder — genuine peak-% per day.
 */
const OccupancyTrendChart: React.FC<{ days: OccupancyDay[] }> = ({ days }) => {
  if (days.length === 0) return <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)', padding: '30px 0', textAlign: 'center' }}>No data for this range.</div>;

  const W = 560, H = 160, padL = 30, padB = 20, padT = 10;
  const innerW = W - padL - 10;
  const innerH = H - padT - padB;
  const maxPct = Math.max(...days.map((d) => d.peakOccupancyPct), 10);

  const points = days.map((d, i) => {
    const x = padL + (days.length > 1 ? (i / (days.length - 1)) * innerW : innerW / 2);
    const y = padT + innerH - (d.peakOccupancyPct / maxPct) * innerH;
    return { x, y, d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padT + innerH} L ${points[0].x.toFixed(1)} ${padT + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      {[0, 25, 50, 75, 100].map((pct) => {
        if (pct > maxPct + 10) return null;
        const y = padT + innerH - (pct / maxPct) * innerH;
        return (
          <g key={pct}>
            <line x1={padL} y1={y} x2={W - 10} y2={y} stroke="var(--color-divider, rgba(29,31,32,.16))" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fontFamily="ui-monospace, Menlo, monospace" fill="var(--color-neutral-600, #7a7a7d)">{pct}%</text>
          </g>
        );
      })}
      <path d={areaD} fill="var(--color-accent, #5980a6)" opacity={0.12} />
      <path d={pathD} fill="none" stroke="var(--color-accent, #5980a6)" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--color-accent, #5980a6)">
          <title>{`${p.d.date}: ${p.d.peakOccupancyPct}% (${p.d.peakOccupiedCount} slots)`}</title>
        </circle>
      ))}
      {points.filter((_, i) => i === 0 || i === points.length - 1 || days.length <= 8).map((p, i) => (
        <text key={`lbl-${i}`} x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, Menlo, monospace" fill="var(--color-neutral-600, #7a7a7d)">
          {p.d.date.slice(5)}
        </text>
      ))}
    </svg>
  );
};

/**
 * Peak hours — real SVG bar chart, GET /api/v1/reports/peak-hours.
 * Average entries per hour-of-day, grouped from real log entryTime
 * values, not fabricated forecasting.
 */
const PeakHoursChart: React.FC<{ hours: PeakHour[] }> = ({ hours }) => {
  if (hours.length === 0) return null;
  const W = 560, H = 160, padL = 24, padB = 18, padT = 10;
  const innerW = W - padL - 6;
  const innerH = H - padT - padB;
  const maxVal = Math.max(...hours.map((h) => h.avgEntries), 1);
  const barW = innerW / hours.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      {hours.map((h, i) => {
        const barH = (h.avgEntries / maxVal) * innerH;
        const x = padL + i * barW;
        const y = padT + innerH - barH;
        return (
          <g key={h.hour}>
            <rect x={x + 1} y={y} width={Math.max(barW - 2, 1)} height={barH} fill="var(--color-accent, #5980a6)" opacity={h.avgEntries === maxVal ? 1 : 0.55}>
              <title>{`${h.hour}:00 — ${h.avgEntries} avg entries`}</title>
            </rect>
            {h.hour % 3 === 0 && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fontFamily="ui-monospace, Menlo, monospace" fill="var(--color-neutral-600, #7a7a7d)">
                {h.hour}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const SiteAdminReports: React.FC<SiteAdminReportsProps> = ({ siteId }) => {
  const [range, setRange] = useState<RangeKey>('7d');
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [mix, setMix] = useState<MixStats>({ registered: 0, visitor: 0, total: 0 });
  const [violations, setViolations] = useState<Violation[]>([]);
  const [requests, setRequests] = useState<OvernightRequest[]>([]);
  const [utilization, setUtilization] = useState<SlotUtilization[]>([]);
  const [occupancyTrend, setOccupancyTrend] = useState<OccupancyDay[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [levelFilter, setLevelFilter] = useState('All levels');
  const [sortBy, setSortBy] = useState<'low' | 'high' | 'slot'>('low');
  const [loading, setLoading] = useState(true);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqVehicle, setReqVehicle] = useState('');
  const [reqNights, setReqNights] = useState(1);
  const [reqReason, setReqReason] = useState('');
  const [reqRequestedBy, setReqRequestedBy] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState('');

  const effectiveFrom = range === 'custom' ? new Date(fromDate).toISOString() : new Date(Date.now() - rangeDays[range] * 86400000).toISOString();
  const effectiveTo = range === 'custom' ? new Date(toDate).toISOString() : new Date().toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    const qs = `siteId=${encodeURIComponent(siteId)}&from=${encodeURIComponent(effectiveFrom)}&to=${encodeURIComponent(effectiveTo)}`;
    try {
      const [mixRes, violRes, reqRes, utilRes, trendRes, peakRes] = await Promise.all([
        fetch(`/api/v1/reports/mix?${qs}`),
        fetch(`/api/v1/reports/violations?siteId=${encodeURIComponent(siteId)}`),
        fetch(`/api/v1/reports/overnight-requests?siteId=${encodeURIComponent(siteId)}`),
        fetch(`/api/v1/reports/utilization?${qs}`),
        fetch(`/api/v1/reports/occupancy-trend?${qs}`),
        fetch(`/api/v1/reports/peak-hours?${qs}`),
      ]);
      if (mixRes.ok) setMix(await mixRes.json());
      if (violRes.ok) setViolations((await violRes.json()).violations || []);
      if (reqRes.ok) setRequests((await reqRes.json()).requests || []);
      if (utilRes.ok) setUtilization((await utilRes.json()).slots || []);
      if (trendRes.ok) setOccupancyTrend((await trendRes.json()).days || []);
      if (peakRes.ok) setPeakHours((await peakRes.json()).hours || []);
    } finally {
      setLoading(false);
    }
  }, [siteId, effectiveFrom, effectiveTo]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRequest = async () => {
    if (!reqVehicle.trim() || !reqReason.trim() || !reqRequestedBy.trim()) {
      setReqError('Vehicle number, requested by, and reason are all required.');
      return;
    }
    setReqBusy(true);
    setReqError('');
    try {
      const res = await fetch('/api/v1/reports/overnight-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-site-id': siteId },
        body: JSON.stringify({ vehicleNumber: reqVehicle.trim(), requestedBy: reqRequestedBy.trim(), nights: reqNights, reason: reqReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReqOpen(false);
        setReqVehicle('');
        setReqReason('');
        setReqRequestedBy('');
        setReqNights(1);
        load();
      } else {
        setReqError(data.message || 'Failed to submit request.');
      }
    } catch {
      setReqError('Could not reach the server.');
    } finally {
      setReqBusy(false);
    }
  };

  const reviewRequest = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    await fetch('/api/v1/reports/overnight-requests/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, decision }),
    });
    load();
  };

  const exportCsv = (type: 'slots' | 'logs') => {
    window.open(`/api/v1/export/reports?type=${type}&siteId=${encodeURIComponent(siteId)}`, '_blank');
  };

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');

  let filteredUtilization = levelFilter === 'All levels' ? utilization : utilization.filter((u) => u.basement === levelFilter);
  filteredUtilization = [...filteredUtilization].sort((a, b) => {
    if (sortBy === 'low') return a.utilizationPct - b.utilizationPct;
    if (sortBy === 'high') return b.utilizationPct - a.utilizationPct;
    return a.slotNumber.localeCompare(b.slotNumber);
  });

  const cardStyle: React.CSSProperties = { border: '1px solid var(--color-divider, rgba(29,31,32,.16))', padding: '18px 20px', background: 'var(--color-bg, #f2f2f3)' };
  const headingStyle: React.CSSProperties = { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 19, margin: 0 };
  const monoLabel: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: 'var(--color-neutral-600, #7a7a7d)' };

  return (
    <div style={{ fontFamily: "'Barlow', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--color-neutral-600, #7a7a7d)', fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}>Reports</div>
          <h2 style={{ fontSize: 26, margin: '2px 0 0', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600 }}>
            {range === 'custom' ? `${fromDate} — ${toDate}` : `Last ${rangeDays[range]} days`}
          </h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {(['7d', '30d', '90d', 'custom'] as RangeKey[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 13, border: '1px solid var(--color-divider, rgba(29,31,32,.16))', background: range === r ? 'var(--color-accent, #5980a6)' : 'transparent', color: range === r ? 'var(--color-bg, #f2f2f3)' : 'var(--color-neutral-700, #5d5d60)' }}
              >
                {r === 'custom' ? 'Custom' : `Last ${rangeDays[r as Exclude<RangeKey, 'custom'>]}d`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {range === 'custom' && (
        <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ ...monoLabel, display: 'block', marginBottom: 4 }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ ...monoLabel, display: 'block', marginBottom: 4 }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', fontSize: 13 }} />
          </div>
        </div>
      )}

      {/* Occupancy trend + Peak hours */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 22, marginBottom: 22 }}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={headingStyle}>Occupancy trend</h3>
            <span style={monoLabel}>peak % per day</span>
          </div>
          {loading ? <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)', padding: '30px 0', textAlign: 'center' }}>Loading…</div> : <OccupancyTrendChart days={occupancyTrend} />}
        </section>
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={headingStyle}>Peak hours</h3>
            <span style={monoLabel}>avg entries/hr</span>
          </div>
          {loading ? <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)', padding: '30px 0', textAlign: 'center' }}>Loading…</div> : <PeakHoursChart hours={peakHours} />}
        </section>
      </div>

      {/* Downloads */}
      <section style={{ ...cardStyle, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={headingStyle}>Downloads</h3>
          <span style={monoLabel}>scoped to this site</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ padding: '14px 16px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
            <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 16 }}>Parking logs</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-neutral-700, #5d5d60)', margin: '4px 0 10px' }}>Every entry/exit for this site, all time.</div>
            <button onClick={() => exportCsv('logs')} style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', border: '1px solid var(--color-accent, #5980a6)', color: 'var(--color-accent-700, #416180)', fontSize: 12.5, fontWeight: 600 }}>Download CSV</button>
          </div>
          <div style={{ padding: '14px 16px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
            <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 600, fontSize: 16 }}>Slot inventory</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-neutral-700, #5d5d60)', margin: '4px 0 10px' }}>Current status of every slot at this site.</div>
            <button onClick={() => exportCsv('slots')} style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', border: '1px solid var(--color-accent, #5980a6)', color: 'var(--color-accent-700, #416180)', fontSize: 12.5, fontWeight: 600 }}>Download CSV</button>
          </div>
        </div>
      </section>

      {/* Registered vs Visitor + Violations + Requests */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 22, marginBottom: 26 }}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={headingStyle}>Registered vs visitor</h3>
            <span style={monoLabel}>{mix.total} entries</span>
          </div>
          <div style={{ display: 'flex', gap: 26, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 34, lineHeight: 1 }}>{mix.total ? Math.round((mix.registered / mix.total) * 100) : 0}%</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--color-neutral-600, #7a7a7d)', fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}>Registered</div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{mix.registered} entries</div>
            </div>
            <div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 34, lineHeight: 1 }}>{mix.total ? Math.round((mix.visitor / mix.total) * 100) : 0}%</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--color-neutral-600, #7a7a7d)', fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}>Visitor</div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{mix.visitor} entries</div>
            </div>
          </div>
          <div style={{ display: 'flex', height: 16, border: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
            <div style={{ width: `${mix.total ? (mix.registered / mix.total) * 100 : 0}%`, background: 'var(--color-accent, #5980a6)' }} />
            <div style={{ width: `${mix.total ? (mix.visitor / mix.total) * 100 : 0}%`, background: 'var(--color-neutral-400, #b8b8ba)' }} />
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={headingStyle}>Overnight violations</h3>
            <span style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>{violations.length} open</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--color-neutral-700, #5d5d60)', margin: '0 0 10px', lineHeight: 1.45 }}>Vehicles still on site past 10 PM with no approved overnight request.</p>
          {violations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)', padding: '10px 0' }}>{loading ? 'Loading…' : 'None right now.'}</div>
          ) : (
            violations.map((v) => (
              <div key={v.vehicleNumber} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, fontWeight: 600 }}>{v.vehicleNumber}</div>
                  <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: 'var(--color-neutral-600, #7a7a7d)' }}>{v.employeeName || 'Unmatched'}</div>
                </div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: 'var(--color-neutral-700, #5d5d60)', textAlign: 'right' }}>
                  <div>{v.slotNumber}</div>
                  <div style={{ color: 'var(--color-neutral-600, #7a7a7d)' }}>{v.hoursSinceEntry}h</div>
                </div>
              </div>
            ))
          )}
        </section>

        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={headingStyle}>Overnight requests</h3>
            <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--color-accent-100, #eef6ff)', color: 'var(--color-accent-700, #416180)' }}>{pendingRequests.length} pending</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--color-neutral-700, #5d5d60)', margin: '0 0 10px', lineHeight: 1.45 }}>Approving exempts the vehicle from the overnight check for the nights requested.</p>
          <button onClick={() => setReqOpen(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--color-accent-700, #416180)', fontWeight: 600, marginBottom: 8, display: 'block' }}>+ New request</button>
          {requests.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)', padding: '6px 0' }}>{loading ? 'Loading…' : 'No requests yet.'}</div>
          ) : (
            requests.slice(0, 8).map((q) => (
              <div key={q.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, fontWeight: 600 }}>{q.vehicleNumber}</span>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: 'var(--color-neutral-600, #7a7a7d)' }}>{q.nights}n</span>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, marginLeft: 'auto', color: q.status === 'APPROVED' ? '#065f46' : q.status === 'REJECTED' ? '#be123c' : 'var(--color-neutral-600, #7a7a7d)' }}>{q.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-700, #5d5d60)', marginTop: 1 }}>{q.requestedBy} · {q.reason}</div>
                {q.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <button onClick={() => reviewRequest(q.id, 'APPROVED')} style={{ all: 'unset', cursor: 'pointer', padding: '3px 12px', background: 'var(--color-accent, #5980a6)', color: '#fff', fontSize: 11.5 }}>Approve</button>
                    <button onClick={() => reviewRequest(q.id, 'REJECTED')} style={{ all: 'unset', cursor: 'pointer', padding: '3px 12px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', fontSize: 11.5 }}>Reject</button>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </div>

      {reqOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 400, width: '90%' }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 16, fontFamily: "'Barlow Condensed', system-ui, sans-serif" }}>New overnight request</h4>
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Vehicle number *</label>
            <input value={reqVehicle} onChange={(e) => setReqVehicle(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #cbd3e0', marginBottom: 10 }} />
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Requested by *</label>
            <input value={reqRequestedBy} onChange={(e) => setReqRequestedBy(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #cbd3e0', marginBottom: 10 }} />
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Nights</label>
            <input type="number" min={1} value={reqNights} onChange={(e) => setReqNights(Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #cbd3e0', marginBottom: 10 }} />
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Reason *</label>
            <input value={reqReason} onChange={(e) => setReqReason(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #cbd3e0', marginBottom: 10 }} />
            {reqError && <div style={{ fontSize: 12, color: '#be123c', marginBottom: 10 }}>{reqError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setReqOpen(false)} disabled={reqBusy} style={{ padding: '8px 16px', border: '1px solid #cbd3e0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitRequest} disabled={reqBusy} style={{ padding: '8px 16px', border: 'none', background: 'var(--color-accent, #5980a6)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>{reqBusy ? 'Submitting…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Slot-wise utilization */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 12 }}>
        <div>
          <h3 style={headingStyle}>Slot-wise utilization</h3>
          <div style={{ ...monoLabel, marginTop: 2 }}>share of open hours each slot was occupied · selected range</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', fontSize: 13 }}>
            <option>All levels</option><option>B1</option><option>B2</option><option>B3</option><option>Ground</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ padding: '7px 10px', border: '1px solid var(--color-divider, rgba(29,31,32,.16))', fontSize: 13 }}>
            <option value="low">Sort: lowest utilisation</option>
            <option value="high">Sort: highest utilisation</option>
            <option value="slot">Sort: slot number</option>
          </select>
        </div>
      </div>
      <div style={{ border: '1px solid var(--color-divider, rgba(29,31,32,.16))', maxHeight: 360, overflowY: 'auto' }}>
        {filteredUtilization.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--color-neutral-600, #7a7a7d)' }}>{loading ? 'Loading…' : 'No slots found.'}</div>
        ) : (
          filteredUtilization.map((u) => (
            <div key={u.slotNumber} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderBottom: '1px solid var(--color-divider, rgba(29,31,32,.16))' }}>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 600, width: 110 }}>{u.slotNumber}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--color-neutral-200, #e7e7ea)' }}>
                <div style={{ width: `${Math.min(u.utilizationPct, 100)}%`, height: '100%', background: 'var(--color-accent, #5980a6)' }} />
              </div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, width: 60, textAlign: 'right' }}>{u.utilizationPct}%</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
