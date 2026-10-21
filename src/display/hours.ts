/**
 * Display hours (US-14, AC-22; 03 "Display hours in IST"). The server decides while it can be
 * reached (feed state CLOSED); the TV uses the same rule on its server-offset clock when it can't.
 */
import type { DisplayHours } from './types';
import { hhmmToMinutes, istParts } from './time';

/** ALWAYS, or DAILY on/off in IST; off < on = overnight (e.g. 18:00–02:00). on == off is never stored. */
export function isOpenAt(hours: DisplayHours | null | undefined, nowMs: number): boolean {
  if (!hours || hours.mode !== 'DAILY') return true;
  const on = hhmmToMinutes(hours.on);
  const off = hhmmToMinutes(hours.off);
  if (on === null || off === null || on === off) return true;
  const m = istParts(nowMs).minuteOfDay;
  return on < off ? m >= on && m < off : m >= on || m < off;
}

/** "07:00" for "Closed — opens at 07:00"; null for ALWAYS. */
export function opensAt(hours: DisplayHours | null | undefined): string | null {
  return hours && hours.mode === 'DAILY' ? hours.on : null;
}

/** "07:00–23:00" for "Display hours 07:00–23:00"; null for ALWAYS. */
export function hoursLabel(hours: DisplayHours | null | undefined): string | null {
  return hours && hours.mode === 'DAILY' ? hours.on + '–' + hours.off : null;
}
