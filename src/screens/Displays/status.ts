import { formatAgo, formatNumber } from '../../utils/format';
import { areaLabel } from './draft';
import { untilText } from '../../display/time';
import type { DisplayOverrideSummary } from './api';
import { displayState, type DisplayRow } from './api';

export const STATE_CHIP: Record<ReturnType<typeof displayState>, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  ONLINE: { label: 'Online', tone: 'success' },
  OFFLINE: { label: 'Offline', tone: 'danger' },
  NOT_SET_UP: { label: 'Not set up', tone: 'neutral' },
  SWITCHED_OFF: { label: 'Switched off', tone: 'neutral' },
};

/**
 * The "Shows" summary (UX C1): "B1, B2 · 4-wheelers · 120 slots", "B1 · Puzzles, 3 single slots ·
 * 40 slots". Built here from the selection and slot count, so the words follow the UX
 * ("4-wheelers", not "4W").
 */
export function selectionText(d: Pick<DisplayRow, 'selection' | 'slotCount'>): string {
  const sel = d.selection;
  const what = [...sel.levels, ...sel.areas.map((a) => areaLabel(a.level, a.parkingType))];
  if (sel.slotIds.length) what.push(`${formatNumber(sel.slotIds.length)} single ${sel.slotIds.length === 1 ? 'slot' : 'slots'}`);
  const parts = [what.join(', ')];
  if (sel.vehicleClass === '4W') parts.push('4-wheelers');
  if (sel.vehicleClass === '2W') parts.push('2-wheelers');
  parts.push(`${formatNumber(d.slotCount)} ${d.slotCount === 1 ? 'slot' : 'slots'}`);
  return parts.join(' · ');
}

/** "seen 3s ago" / "last seen 18 min ago" / "no screen yet" / "link switched off". */
export function seenText(d: DisplayRow, now: number): string {
  const st = displayState(d);
  if (st === 'SWITCHED_OFF') return 'link switched off';
  if (st === 'NOT_SET_UP') return 'no screen yet';
  if (!d.lastSeenAt) return 'not seen yet';
  return st === 'ONLINE' ? `seen ${formatAgo(d.lastSeenAt, now)}` : `last seen ${formatAgo(d.lastSeenAt, now)}`;
}

/** "until 14:00" / "until 22 Oct, 09:00" / "until cleared" (IST, UX C8). */
export function untilLabel(until: string | null | undefined, now: number): string {
  const t = until ? untilText(until, now) : '';
  return t ? `until ${t}` : 'until cleared';
}

/** True when a message or forced full is on (the "Override active" badge, AC-29). Hide/pin counts alone are not. */
export function hasOverride(o: DisplayOverrideSummary | null | undefined): o is DisplayOverrideSummary {
  return !!o && (!!o.message || !!o.forcedFull);
}

/** The "what · who · until" lines of the Override column and the panel (UX C8). */
export function overrideLines(o: DisplayOverrideSummary, now: number): string[] {
  const lines: string[] = [];
  if (o.message) lines.push(`${o.message.mode === 'FULL' ? 'Full-screen message' : 'Banner message'} · ${o.message.by} · ${untilLabel(o.message.until, now)}`);
  if (o.forcedFull) lines.push(`Forced Parking full · ${o.forcedFull.by} · ${untilLabel(o.forcedFull.until, now)}`);
  return lines;
}
