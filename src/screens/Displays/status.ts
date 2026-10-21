import { formatAgo } from '../../utils/format';
import { untilText } from '../../display/time';
import type { DisplayOverrideSummary } from './api';
import { displayState, type DisplayRow } from './api';

export const STATE_CHIP: Record<ReturnType<typeof displayState>, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  ONLINE: { label: 'Online', tone: 'success' },
  OFFLINE: { label: 'Offline', tone: 'danger' },
  NOT_SET_UP: { label: 'Not set up', tone: 'neutral' },
  SWITCHED_OFF: { label: 'Switched off', tone: 'neutral' },
};

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
