/**
 * Daily self-reload (03 "7 days without a reload", NFR-4): once a day, at a random minute between
 * 04:00 and 04:30 IST, and only when the screen is Closed or has run for more than 20 hours.
 * A guard against slow leaks in old TV browsers; at most once per IST day.
 */
import { istParts } from './time';

export const RELOAD_KEY = 'pf-tv-reloaded';
export const RELOAD_FROM_MIN = 4 * 60;
export const RELOAD_WINDOW_MIN = 30;
export const RELOAD_MIN_UPTIME_MS = 20 * 60 * 60 * 1000;

/** The minute of day (IST) this page will reload at, picked once per page load. */
export function pickReloadMinute(random: number): number {
  return RELOAD_FROM_MIN + Math.floor(random * RELOAD_WINDOW_MIN);
}

export function shouldReload(opts: { nowMs: number; reloadMinute: number; uptimeMs: number; closed: boolean; lastReloadDay: string | null }): boolean {
  const p = istParts(opts.nowMs);
  if (p.minuteOfDay < opts.reloadMinute || p.minuteOfDay >= RELOAD_FROM_MIN + RELOAD_WINDOW_MIN) return false;
  if (opts.lastReloadDay === p.dayKey) return false;
  return opts.closed || opts.uptimeMs > RELOAD_MIN_UPTIME_MS;
}
