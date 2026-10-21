import { formatAgo } from '../../utils/format';
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
