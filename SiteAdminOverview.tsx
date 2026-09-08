import React, { useEffect, useMemo, useState } from 'react';

/**
 * Site Admin — Overview page
 *
 * Converted from the Claude Design export (ParkFlows_Site_Admin.html).
 * Faithfully reproduces both view modes (Metrics / Action queue toggle),
 * the occupancy gauge, and the sparkline — all as real SVG, not the
 * design tool's templating layer.
 *
 * DATA SOURCING — read this before wiring up further:
 * - Slot counts (total/occupied/vacant/occPct): confirmed real, GET /api/v1/slots
 * - occupancyAlertThresholdPct: confirmed real site setting (SiteConfig)
 * - hasValetService: confirmed real site setting (SiteConfig)
 * - "Not parked by cutoff" alerts: confirmed real (NonParkedAlert type, existing feature)
 * - "Unauthorized vehicle" and "Overstay" alert types shown in the design:
 *   NOT confirmed to exist in the backend as of this project's last verified
 *   state. Built here against a clean AlertItem interface so wiring them up
 *   is a drop-in once/if the backend supports them — but don't assume
 *   they're live without checking server.ts and db.ts directly first.
 * - "On shift now" (which staff are currently active): not confirmed to
 *   exist as a backend concept. Stubbed with a TODO — needs either a real
 *   session-activity endpoint or a defined "shift" concept before this can
 *   be real data rather than a placeholder.
 * - Today's stats (entries/exits/slot changes/unmatched plates): entries
 *   and exits are derivable from today's ParkingLog records (confirmed
 *   data exists); "unmatched plates" specifically maps to entries with no
 *   matchedEmployee — needs confirming the API surfaces that distinction.
 */

interface SlotSummary {
  total: number;
  occupied: number;
  vacant: number;
  occPct: number;
}

type AlertSeverity = 3 | 2 | 1 | 0; // 3=critical, 2=warning, 1=standard, 0=resolved
type AlertState = 'NEEDS ACTION' | 'RESOLVED';

interface AlertItem {
  id: string;
  kind: string;
  title: string;
  meta: string;
  age: string;
  sev: AlertSeverity;
  action: string;
  state: AlertState;
}

interface ShiftEntry {
  name: string;
  role: string;
  stat: string;
}

interface TodayStat {
  label: string;
  value: string;
}

const severityStyle = (sev: AlertSeverity) => {
  if (sev === 3) return { dot: '#c0392f', fg: '#4a1206' };
  if (sev === 2) return { dot: '#e79b2f', fg: '#4a2d05' };
  if (sev === 1) return { dot: 'var(--color-accent-500)', fg: '#ffffff' };
  return { dot: 'var(--color-neutral-300)', fg: 'var(--color-neutral-700)' };
};

/** Threshold-banded arc gauge — green/amber/red bands up to occPct, with a
 * tick mark at the configured alert threshold. Ported directly from the
 * design's SVG construction logic. */
function OccupancyGauge({ occPct, threshold, size = 104 }: { occPct: number; threshold: number; size?: number }) {
  const r = 44;
  const c = Math.PI * r;
  const arc = 'M 8 56 A 44 44 0 0 1 96 56';
  const bands = [
    { to: 60, color: '#3f8b57' },
    { to: 85, color: '#e79b2f' },
    { to: 100, color: '#c0392f' },
  ];
  let from = 0;
  const segments = bands.map((b) => {
    const lo = from;
    const hi = Math.min(b.to, occPct);
    from = b.to;
    if (hi <= lo) return null;
    return { color: b.color, dash: (c * (hi - lo)) / 100, offset: (-c * lo) / 100 };
  });

  return (
    <svg width={size} height={size * (62 / 104)} viewBox="0 0 104 62">
      <path d={arc} stroke="var(--color-neutral-300)" strokeWidth={9} fill="none" />
      {segments.map(
        (s, i) =>
          s && (
            <path
              key={i}
              d={arc}
              stroke={s.color}
              strokeWidth={9}
              fill="none"
              strokeDasharray={`${s.dash} ${c}`}
              strokeDashoffset={s.offset}
            />
          )
      )}
      <path d={arc} stroke="var(--color-text)" strokeWidth={9} fill="none" strokeDasharray={`2 ${c}`} strokeDashoffset={(-c * threshold) / 100} />
    </svg>
  );
}

/** Hourly entries sparkline. Real data should replace samplePoints with an
 * actual hourly entry-count series for today (needs a backend aggregation
 * — the raw ParkingLog data supports this, but no endpoint currently
 * returns it pre-bucketed by hour, as far as this project's last verified
 * state shows). */
function Sparkline({ points }: { points: number[] }) {
  const sx = (i: number) => 4 + i * (232 / (points.length - 1));
  const sy = (v: number) => 52 - (v / 100) * 40;
  const line = points.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
  const last = points.length - 1;

  return (
    <svg viewBox="0 0 240 62" preserveAspectRatio="none" style={{ width: '100%', height: 62, display: 'block', overflow: 'visible' }}>
      <polygon points={`${line} ${sx(last)},54 ${sx(0)},54`} fill="var(--color-accent-100)" />
      <polyline points={line} stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <circle cx={sx(last)} cy={sy(points[last])} r={3} fill="#ffffff" stroke="var(--color-accent)" strokeWidth={2} />
      <line x1={0} y1={54} x2={240} y2={54} stroke="var(--color-divider)" />
    </svg>
  );
}

interface SiteAdminOverviewProps {
  siteId: string;
  onNavigate: (screen: 'alerts' | 'slots' | 'staff' | 'employees') => void;
}

export const SiteAdminOverview: React.FC<SiteAdminOverviewProps> = ({ siteId, onNavigate }) => {
  const [layout, setLayout] = useState<'A' | 'B'>('A');
  const [slots, setSlots] = useState<SlotSummary>({ total: 0, occupied: 0, vacant: 0, occPct: 0 });
  const [threshold, setThreshold] = useState(85);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [today] = useState<TodayStat[]>([
    // TODO: replace with real today's-activity aggregation once confirmed available.
    { label: 'Entries', value: '—' },
    { label: 'Exits', value: '—' },
    { label: 'Slot changes', value: '—' },
    { label: 'Unmatched plates', value: '—' },
  ]);
  const [onShift] = useState<ShiftEntry[]>([]); // TODO: needs a real "on shift" backend concept
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Confirmed real: slot counts.
        const slotsRes = await fetch(`/api/v1/slots?siteId=${encodeURIComponent(siteId)}`);
        const slotsData = await slotsRes.json();
        const list = Array.isArray(slotsData?.slots) ? slotsData.slots : [];
        const total = list.length;
        const occupied = list.filter((s: any) => s.status === 'OCCUPIED').length;
        if (!cancelled) {
          setSlots({ total, occupied, vacant: total - occupied, occPct: total ? Math.round((occupied / total) * 100) : 0 });
        }

        // Confirmed real: not-parked-by-cutoff alerts. Other alert kinds
        // shown in the design (unauthorized vehicle, overstay) aren't
        // wired here — see the file header note on why.
        const alertsRes = await fetch(`/api/v1/alerts/non-parked?siteId=${encodeURIComponent(siteId)}`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          const mapped: AlertItem[] = (alertsData?.alerts || []).map((a: any) => ({
            id: a.id,
            kind: 'NOT PARKED BY CUTOFF',
            title: `${a.employeeName} not parked by ${a.cutoffTime}`,
            meta: `${a.vehicleNumber} · ${a.department}`,
            age: a.notifiedAt || 'just now',
            sev: 2,
            action: 'Review',
            state: a.status === 'RESOLVED' ? 'RESOLVED' : 'NEEDS ACTION',
          }));
          if (!cancelled) setAlerts(mapped);
        }

        // Confirmed real: registration approval queue.
        const regRes = await fetch(`/api/v1/registrations?siteId=${encodeURIComponent(siteId)}&status=PENDING`);
        if (regRes.ok) {
          const regData = await regRes.json();
          if (!cancelled) setPendingApprovalsCount((regData?.requests || []).length);
        }
      } catch (err) {
        console.error('Failed to load Overview data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const openAlerts = useMemo(() => alerts.filter((a) => a.state === 'NEEDS ACTION'), [alerts]);
  const actionCount = openAlerts.length + pendingApprovalsCount;

  const figures = [
    { label: 'Alerts needing action', value: String(openAlerts.length), sub: '', cta: 'Open inbox', onClick: () => onNavigate('alerts') },
    { label: 'Pending approvals', value: String(pendingApprovalsCount), sub: '', cta: 'Review queue', onClick: () => onNavigate('employees') },
    { label: 'On shift now', value: String(onShift.length), sub: '', cta: 'See roster', onClick: () => onNavigate('staff') },
  ];

  // Placeholder hourly series — replace once a real aggregation exists.
  const sparkPoints = [22, 38, 61, 74, 81, 77, 72, 68, 63, 58, 44, 30];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-heading)' }}>
            Overview
          </div>
          <h2 style={{ fontSize: 30, margin: '2px 0 0' }}>
            {loading ? 'Loading…' : `Good morning. ${actionCount} thing${actionCount === 1 ? '' : 's'} need you.`}
          </h2>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
            View
          </span>
          <div style={{ display: 'flex', padding: 3, background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-md)' }}>
            <button
              onClick={() => setLayout('A')}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 16px', borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13,
                background: layout === 'A' ? '#ffffff' : 'transparent',
                color: layout === 'A' ? 'var(--color-accent-800)' : 'var(--color-neutral-600)',
                boxShadow: layout === 'A' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              Metrics
            </button>
            <button
              onClick={() => setLayout('B')}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 16px', borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13,
                background: layout === 'B' ? '#ffffff' : 'transparent',
                color: layout === 'B' ? 'var(--color-accent-800)' : 'var(--color-neutral-600)',
                boxShadow: layout === 'B' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              Action queue
            </button>
          </div>
        </div>
      </div>

      {layout === 'A' ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr 1fr', gap: 16, marginBottom: 22, alignItems: 'stretch' }}>
            <button className="rowlink blueprint" onClick={() => onNavigate('slots')} style={cardBtnStyle}>
              <div style={{ flex: 'none' }}>
                <OccupancyGauge occPct={slots.occPct} threshold={threshold} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div style={eyebrowStyle}>Live occupancy</div>
                <div className="mono" style={{ fontFamily: 'var(--font-heading)', fontSize: 40, lineHeight: 1.05, margin: '6px 0 0' }}>
                  {slots.occPct}%
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>
                  {slots.occupied} occupied · {slots.vacant} vacant
                </div>
                <div style={ctaStyle}>Open site map →</div>
              </div>
            </button>

            {figures.map((f) => (
              <button key={f.label} className="rowlink blueprint" onClick={f.onClick} style={{ ...cardBtnStyle, flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={eyebrowStyle}>{f.label}</div>
                <div>
                  <div className="mono" style={{ fontFamily: 'var(--font-heading)', fontSize: 40, lineHeight: 1.05 }}>{f.value}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{f.sub}</div>
                </div>
                <div style={ctaStyle}>{f.cta} →</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22 }}>
            <section className="blueprint" style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 19, margin: 0 }}>Needs action now</h3>
                <a href="#alerts" onClick={(e) => { e.preventDefault(); onNavigate('alerts'); }} style={linkStyle}>
                  Open alerts inbox →
                </a>
              </div>
              {openAlerts.slice(0, 4).map((a) => {
                const st = severityStyle(a.sev);
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 0', borderTop: '1px solid var(--color-divider)' }}>
                    <div style={{ flex: 'none', width: 8, height: 34, borderRadius: 2, background: st.dot }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{a.title}</div>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{a.meta}</div>
                    </div>
                    <div className="mono" style={{ flex: 'none', fontSize: 11.5, color: 'var(--color-neutral-600)', textAlign: 'right', minWidth: 56 }}>{a.age}</div>
                    <button className="btn btn-secondary" style={{ flex: 'none', fontSize: 12.5, padding: '6px 14px', marginLeft: 6 }}>{a.action}</button>
                  </div>
                );
              })}
              {!loading && openAlerts.length === 0 && (
                <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--color-neutral-600)' }}>Nothing needs attention right now.</div>
              )}
            </section>

            <div style={{ display: 'grid', gap: 22, alignContent: 'start' }}>
              <section className="blueprint" style={panelStyle}>
                <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>Today so far</h3>
                {today.map((t) => (
                  <div key={t.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--color-divider)' }}>
                    <span style={{ fontSize: 13 }}>{t.label}</span>
                    <span className="mono" style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>{t.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, paddingBottom: 2 }}>
                  <Sparkline points={sparkPoints} />
                  <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-neutral-600)', marginTop: 6 }}>
                    <span>06:00</span><span>entries per hour</span><span>now</span>
                  </div>
                </div>
              </section>

              <section className="blueprint" style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 19, margin: 0 }}>On shift</h3>
                </div>
                {onShift.length === 0 ? (
                  <div style={{ padding: '10px 0', fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
                    Shift tracking isn't wired up yet — see the TODO in this file.
                  </div>
                ) : (
                  onShift.map((p) => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--color-divider)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', flex: 'none' }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                      <span className="tag tag-neutral" style={{ fontSize: 10 }}>{p.role}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-600)', width: 52, textAlign: 'right' }}>{p.stat}</span>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 26, alignItems: 'start' }}>
          <section>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
              <h3 style={{ fontSize: 22, margin: 0 }}>Action queue</h3>
              <span className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>sorted by urgency · {actionCount} open</span>
            </div>
            {openAlerts.map((a, i) => {
              const st = severityStyle(a.sev);
              return (
                <div key={a.id} className="blueprint" style={{ padding: '15px 18px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div className="mono" style={{ flex: 'none', width: 34, height: 34, borderRadius: 3, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, background: st.dot, color: st.fg }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{a.title}</span>
                      <span className="tag tag-outline" style={{ fontSize: 10 }}>{a.kind}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 2 }}>{a.meta}</div>
                  </div>
                  <div className="mono" style={{ flex: 'none', fontSize: 11.5, color: 'var(--color-neutral-600)', minWidth: 60, textAlign: 'right' }}>{a.age}</div>
                  <div style={{ flex: 'none', display: 'flex', gap: 8, marginLeft: 6 }}>
                    <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }}>{a.action}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 10px', color: 'var(--color-neutral-600)' }}>Snooze</button>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14 }}>
              <a href="#alerts" onClick={(e) => { e.preventDefault(); onNavigate('alerts'); }} style={linkStyle}>
                See resolved and historical alerts →
              </a>
            </div>
          </section>

          <aside style={{ display: 'grid', gap: 18, alignContent: 'start', position: 'sticky', top: 90 }}>
            <div className="blueprint" style={{ padding: '18px 20px', textAlign: 'center' }}>
              <div style={eyebrowStyle}>Live occupancy</div>
              <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0 2px' }}>
                <OccupancyGauge occPct={slots.occPct} threshold={threshold} />
              </div>
              <div className="mono" style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1 }}>{slots.occPct}%</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                {slots.occupied} / {slots.total} slots · {slots.vacant} vacant
              </div>
              <button className="btn btn-secondary btn-block" style={{ marginTop: 12, fontSize: 12 }} onClick={() => onNavigate('slots')}>
                Open site map
              </button>
            </div>
            <div className="blueprint" style={panelStyle}>
              <h4 style={{ fontSize: 17, margin: '0 0 8px' }}>Today so far</h4>
              {today.map((t) => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--color-divider)' }}>
                  <span style={{ fontSize: 13 }}>{t.label}</span>
                  <span className="mono" style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>{t.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <Sparkline points={sparkPoints} />
                <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-neutral-600)', marginTop: 6 }}>
                  <span>06:00</span><span>entries per hour</span><span>now</span>
                </div>
              </div>
            </div>
            <div className="blueprint" style={panelStyle}>
              <h4 style={{ fontSize: 17, margin: '0 0 8px' }}>On shift now</h4>
              {onShift.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>Not wired up yet.</div>
              ) : (
                onShift.map((p) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--color-divider)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                    <span className="tag tag-neutral" style={{ fontSize: 10 }}>{p.role}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

const cardBtnStyle: React.CSSProperties = {
  appearance: 'none', margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left',
  padding: 20, display: 'flex', alignItems: 'center', gap: 18, minHeight: 156, boxSizing: 'border-box',
  background: '#ffffff', border: '1px solid #e3e6e9', borderRadius: 6,
  boxShadow: '0 1px 2px rgba(20, 30, 40, 0.05), 0 1px 1px rgba(20, 30, 40, 0.03)',
};
const eyebrowStyle: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-neutral-600)',
  fontFamily: 'var(--font-heading)', fontWeight: 600,
};
const ctaStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'var(--color-accent-700)', marginTop: 8,
};
const panelStyle: React.CSSProperties = { padding: '18px 20px' };
const linkStyle: React.CSSProperties = { fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 600, textDecoration: 'none', color: 'var(--color-accent-700)' };
