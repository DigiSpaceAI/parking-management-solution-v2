// 002 B2: Indian Standard Time helpers for every server-side aggregation
// (03 gap 7: "today" and hour buckets are IST, not server time; Cloud Run runs
// in UTC). Asia/Kolkata is UTC+05:30 all year (India has no daylight saving),
// so IST wall-clock parts are the UTC parts of the instant shifted by +330 min.
export const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

const toMs = (t: string | number | Date): number => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : new Date(t).getTime());

/** Hour of day (0-23) in IST. */
export function istHour(t: string | number | Date): number {
  return new Date(toMs(t) + IST_OFFSET_MS).getUTCHours();
}

/** IST calendar day as 'YYYY-MM-DD'. */
export function istDayKey(t: string | number | Date): string {
  return new Date(toMs(t) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC epoch ms of IST midnight that starts the IST day containing t. */
export function istDayStartMs(t: string | number | Date): number {
  const shifted = toMs(t) + IST_OFFSET_MS;
  return shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS;
}
