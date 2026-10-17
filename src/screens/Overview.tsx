import React, { useState } from 'react';
import type { OverviewToday } from '../types';
import {
  BarChart, Card, EmptyState, ErrorState, KpiCard, OccupancyBar, PageHeader, PlateText, Skeleton, SlotCode, StatusChip, Table,
  type Column,
} from '../design-system/components';
import { formatDayDate, formatNumber, formatTime, istHour } from '../utils/format';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { hrefFor, type RouteId } from '../routes';

export interface OverviewProps {
  /** One site (never 'ALL': /overview refuses it). */
  siteId: string;
  /** Whether the viewer may open a page; links to other pages show only then (L-5). */
  canOpen: (id: RouteId) => boolean;
}

type GateRow = OverviewToday['latest'][number];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** The hours to chart: from 06:00 (or the first entry, if earlier) to now (or the last entry, if later). */
function hourWindow(byHour: number[], nowHour: number): number[] {
  const first = byHour.findIndex((n) => n > 0);
  const last = byHour.length - 1 - [...byHour].reverse().findIndex((n) => n > 0);
  const from = Math.min(6, first >= 0 ? first : 6);
  const to = Math.max(nowHour, first >= 0 ? last : nowHour);
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
}

/**
 * Site Admin Overview (002 F4, UX S2): today at the chosen site from one call,
 * GET /api/v1/overview (B3). Every figure comes from that response (AC-04); with
 * no data a KPI shows "—" and a reason (AC-05). Refreshes every 15 s (AC-11).
 */
export const Overview: React.FC<OverviewProps> = ({ siteId, canOpen }) => {
  const [data, setData] = useState<OverviewToday | null>(null);
  const refresh = useAutoRefresh(
    async (isCurrent) => {
      const res = await fetch('/api/v1/overview');
      if (!res.ok) return false;
      const body = (await res.json()) as OverviewToday;
      if (!isCurrent()) return false;
      setData(body);
      return true;
    },
    [siteId]
  );
  const loading = refresh.loading && !data;
  const failed = refresh.error && !data;
  const today = formatDayDate(data?.asOf ?? Date.now());
  const link = (id: RouteId) => (canOpen(id) ? hrefFor(id) : undefined);

  const header = (
    <PageHeader
      title="Overview"
      description={`Today · ${today}`}
      updatedAt={refresh.updatedAt}
      primary={
        canOpen('live-parking') ? (
          <a className="pf-btn pf-btn--primary" href={hrefFor('live-parking')}>
            Open live parking
          </a>
        ) : undefined
      }
    />
  );

  if (failed) {
    return (
      <>
        {header}
        <ErrorState title="Couldn't load today's overview" onRetry={() => void refresh.refresh()} />
      </>
    );
  }

  const d = data;
  const noHistory = !!d && !d.hasHistory;
  const noSlots = !!d && d.total === 0;

  // ---- KPIs (each a link to the page behind it) ----
  const kpis = (
    <div className="pf-kpis">
      <KpiCard
        label="Occupied now"
        loading={loading}
        href={link('live-parking')}
        value={d && !noSlots ? `${formatNumber(d.occupied)} / ${formatNumber(d.total)}` : undefined}
        emptyReason="No slots set up yet"
        meta={d ? `${pct(d.occupied, d.total)}% full · ${formatNumber(d.free)} free` : undefined}
      />
      <KpiCard
        label="Entries today"
        loading={loading}
        href={link('logs')}
        value={d && !noHistory ? formatNumber(d.entriesToday) : undefined}
        emptyReason="No vehicles logged yet"
        meta={d ? `since 00:00 · ${plural(d.exitsToday, 'exit', 'exits')}` : undefined}
      />
      <KpiCard
        label="Pending pass requests"
        loading={loading}
        href={link('employees')}
        value={d ? formatNumber(d.pendingRequests) : undefined}
        meta={d ? (d.oldestPendingDays !== null && d.pendingRequests > 0 ? (d.oldestPendingDays < 1 ? 'oldest waiting under a day' : `oldest waiting ${plural(d.oldestPendingDays, 'day', 'days')}`) : 'none waiting') : undefined}
      />
      <KpiCard
        label="Open alerts"
        loading={loading}
        href={link('alerts')}
        value={d && !noHistory ? formatNumber(d.nonParkedAlerts) : undefined}
        emptyReason="No vehicles logged yet"
        meta={d ? `${plural(d.parkedOver12h, 'vehicle', 'vehicles')} parked over 12 hours` : undefined}
      />
    </div>
  );

  // ---- Occupancy by level ----
  const levels = (
    <Card
      title="Occupancy by level"
      actions={
        canOpen('live-parking') ? (
          <a className="pf-link" href={hrefFor('live-parking')}>
            View live parking
          </a>
        ) : undefined
      }
    >
      {loading ? (
        <div className="pf-stack">
          <Skeleton width="90%" />
          <Skeleton width="80%" />
          <Skeleton width="85%" />
        </div>
      ) : !d || d.byLevel.length === 0 ? (
        <EmptyState title="No slots set up yet" text={canOpen('inventory') ? 'Add slots in Inventory to see occupancy by level.' : undefined} />
      ) : (
        <ul className="pf-levels">
          {d.byLevel.map((l) => (
            <li key={l.level}>
              <span className="pf-levels-name">{l.level}</span>
              <OccupancyBar occupied={l.occupied} total={l.total} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  // ---- Needs your attention ----
  const attention: { key: string; status: string; label: string; text: string; href?: string; go: string }[] = d
    ? [
        ...(d.pendingRequests > 0
          ? [{ key: 'pending', status: 'PENDING', label: 'Pending', text: `${plural(d.pendingRequests, 'pass request', 'pass requests')} waiting for review`, href: link('employees'), go: 'Review' }]
          : []),
        ...(d.parkedOver12h > 0
          ? [{ key: 'overstay', status: 'OCCUPIED', label: 'Overstay', text: `${plural(d.parkedOver12h, 'vehicle', 'vehicles')} parked over 12 hours`, href: link('live-parking'), go: 'View' }]
          : []),
        ...(d.nonParkedAlerts > 0
          ? [{ key: 'alerts', status: 'RESERVED', label: 'Alert', text: `${plural(d.nonParkedAlerts, 'vehicle', 'vehicles')} entered but not parked`, href: link('alerts'), go: 'View' }]
          : []),
      ]
    : [];
  const attentionCard = (
    <Card title="Needs your attention">
      {loading ? (
        <div className="pf-stack">
          <Skeleton width="85%" />
          <Skeleton width="70%" />
        </div>
      ) : attention.length === 0 ? (
        <EmptyState title="Nothing needs your attention right now" />
      ) : (
        <ul className="pf-attn">
          {attention.map((a) => {
            const body = (
              <>
                <StatusChip status={a.status} label={a.label} />
                <span>{a.text}</span>
                {a.href && <span className="pf-attn-go">{a.go}</span>}
              </>
            );
            return (
              <li key={a.key}>
                {a.href ? (
                  <a className="pf-attn-row" href={a.href}>
                    {body}
                  </a>
                ) : (
                  <div className="pf-attn-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  // ---- Entries by hour (IST) ----
  const nowHour = istHour(d?.asOf ?? Date.now()) ?? 0;
  const hours = d ? hourWindow(d.entriesByHour, nowHour) : [];
  const anyEntries = !!d && d.entriesByHour.some((n) => n > 0);
  const chart = (
    <Card title="Entries by hour today" actions={<span className="pf-card-note">from the gate log</span>}>
      {loading ? (
        <Skeleton variant="block" />
      ) : !anyEntries ? (
        <EmptyState title="No entries yet today" text={noHistory ? 'Entries appear here once vehicles are logged at the gate.' : undefined} />
      ) : (
        <BarChart
          values={hours.map((h) => d!.entriesByHour[h] ?? 0)}
          labels={hours.map((h) => String(h).padStart(2, '0'))}
          title="Entries per hour today, IST (hour of day)"
          valueName="Entries"
        />
      )}
    </Card>
  );

  // ---- Latest at the gate ----
  const columns: Column<GateRow>[] = [
    { key: 'plate', header: 'Plate', render: (r) => <PlateText plate={r.vehicleNumber} /> },
    {
      key: 'event',
      header: 'Event',
      render: (r) => <StatusChip status={r.exitTime ? 'EXIT' : 'ENTRY'} label={r.exitTime ? 'Exit' : 'Entry'} tone={r.exitTime ? 'neutral' : 'info'} />,
    },
    { key: 'slot', header: 'Slot', render: (r) => (r.slotNumber ? <SlotCode code={r.slotNumber} /> : '—') },
    { key: 'time', header: 'Time', kind: 'secondary', render: (r) => formatTime(r.exitTime ?? r.entryTime) },
  ];
  const latest = (
    <Card
      title="Latest at the gate"
      actions={
        canOpen('logs') ? (
          <a className="pf-link" href={hrefFor('logs')}>
            View full log
          </a>
        ) : undefined
      }
    >
      <Table
        caption="Latest entries and exits at the gate"
        columns={columns}
        rows={(d?.latest ?? []).slice(0, 4)}
        rowKey={(r) => `${r.vehicleNumber}-${r.entryTime}-${r.exitTime ?? ''}`}
        loading={loading}
        empty={<EmptyState title="No vehicles logged today" />}
      />
    </Card>
  );

  return (
    <>
      {header}
      {kpis}
      <div className="pf-cards-2">
        {levels}
        {attentionCard}
      </div>
      <div className="pf-cards-2">
        {chart}
        {latest}
      </div>
    </>
  );
};
