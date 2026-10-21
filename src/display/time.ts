/**
 * Time on the TV (03 "Display hours in IST", "Stale rules").
 *
 * - IST is formatted by hand (fixed +05:30): no Intl `timeZone` on Chromium 53, and the TV's own
 *   clock and time zone are never trusted.
 * - "Now" is the server time from the last good response plus the monotonic time since then
 *   (`performance.now()`), so a TV clock change can't move the stale timers or the hours.
 * ES2015 only: no padStart, no Object.values/entries, no Intl options.
 */

export const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export interface IstParts {
  year: number;
  month: number; // 0-11
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Minutes since IST midnight. */
  minuteOfDay: number;
  /** "2026-10-21", the IST calendar day. */
  dayKey: string;
}

export function istParts(ms: number): IstParts {
  const d = new Date(ms + IST_OFFSET_MS);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours,
    minutes,
    seconds: d.getUTCSeconds(),
    minuteOfDay: hours * 60 + minutes,
    dayKey: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
  };
}

/** "09:14" (IST, 24-hour). */
export function fmtTime(ms: number): string {
  const p = istParts(ms);
  return pad2(p.hours) + ':' + pad2(p.minutes);
}

/** "09:14:32" (IST, 24-hour). */
export function fmtTimeSeconds(ms: number): string {
  const p = istParts(ms);
  return pad2(p.hours) + ':' + pad2(p.minutes) + ':' + pad2(p.seconds);
}

/** "21 Oct" (IST). */
export function fmtDayMonth(ms: number): string {
  const p = istParts(ms);
  return p.day + ' ' + MONTHS[p.month];
}

/** An override's end for "Until …" (03 O-1): "14:00" today (IST), "21 Oct, 14:00" on another day; '' with no end. */
export function untilText(endsAt: string | null, nowMs: number): string {
  const end = parseIso(endsAt);
  if (end === null) return '';
  return istParts(end).dayKey === istParts(nowMs).dayKey ? fmtTime(end) : fmtDayMonth(end) + ', ' + fmtTime(end);
}

/** ISO → ms, or null. */
export function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return isFinite(ms) ? ms : null;
}

/** "HH:mm" → minutes since midnight, or null. */
export function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * Server-offset monotonic clock. `sync` at every good response; `now` is then the server's time
 * as it is now, from the monotonic clock only. Before the first sync it falls back to Date.now().
 */
export class ServerClock {
  private serverMs: number | null = null;
  private atMono = 0;

  sync(serverTimeIso: string, monoNow: number): void {
    const ms = parseIso(serverTimeIso);
    if (ms === null) return;
    this.serverMs = ms;
    this.atMono = monoNow;
  }

  synced(): boolean {
    return this.serverMs !== null;
  }

  now(monoNow: number, wallNow: number): number {
    return this.serverMs === null ? wallNow : this.serverMs + (monoNow - this.atMono);
  }
}
