/**
 * Display formats for ParkFlows (002 tech design, AC-13). Pure functions, no
 * dependencies, erasable TypeScript only (node:test imports this file directly).
 *
 *   formatDate      25 Sep 2026          (IST calendar date)
 *   formatTime      09:14                (24 h, IST)
 *   formatDateTime  25 Sep 2026, 09:14
 *   formatINR       ₹1,77,000            (Indian digit grouping)
 *   formatNumber    1,080 / 1,00,000     (Indian digit grouping)
 *   formatDuration  7d 22h · 3h 05m · 45m · <1m
 *   formatAgo       12s ago · 2 min ago · 3h ago · then the date
 *   formatPlate     KA 05 MN 1234        (stored without spaces)
 *   enumLabel       ON_HOLD → "On hold"  (never show enum codes)
 *   statusTone      chip colour family for a status value
 *
 * Every date and time is shown in India Standard Time (Asia/Kolkata), whatever
 * the browser's or server's own time zone is.
 */

export const IST = 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar parts of a moment in IST. IST has no daylight saving: UTC+05:30 all year. */
function istParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const shifted = new Date(d.getTime() + 330 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "25 Sep 2026" in IST. Invalid input → "—". */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '—';
  const p = istParts(d);
  return `${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** "09:14" (24-hour) in IST. Invalid input → "—". */
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '—';
  const p = istParts(d);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "25 Sep 2026, 09:14" in IST. */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** Indian digit grouping for the integer part: 1,77,000 · 12,34,56,789. */
function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Above this, toFixed() switches to exponent notation ("1e+21"), which can't be grouped. */
const MAX_GROUPABLE = 1e21;

/** True when `digits` (as printed) is all zeros, e.g. "0" or "0.00": a value that rounds to zero has no sign. */
const isZero = (digits: string) => !/[1-9]/.test(digits);

/**
 * Whole numbers and decimals with Indian grouping: 1080 → "1,080", 100000 → "1,00,000".
 * The sign is decided after rounding, so −0.4 → "0" (not "−0"). Non-finite or ≥ 1e21 → "—".
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_GROUPABLE) return '—';
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [int, frac] = fixed.split('.');
  const negative = value < 0 && !isZero(fixed);
  return `${negative ? '−' : ''}${groupIndian(int)}${frac ? `.${frac}` : ''}`;
}

/**
 * Rupees with Indian grouping: 177000 → "₹1,77,000". Paise are shown only when
 * the amount has them (or `paise: true` forces two decimals): 1499.5 → "₹1,499.50".
 * An amount that rounds to zero has no sign (−0.001 → "₹0").
 */
export function formatINR(value: number, options: { paise?: boolean } = {}): string {
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_GROUPABLE) return '—';
  const hasPaise = Math.round(Math.abs(value) * 100) % 100 !== 0;
  const digits = options.paise || hasPaise ? 2 : 0;
  const n = formatNumber(Math.abs(value), digits);
  return `${value < 0 && !isZero(n) ? '−' : ''}₹${n}`;
}

/**
 * A duration in milliseconds: "7d 22h", "3h 05m", "45m", "<1m".
 * Days and hours for anything a day or longer; hours and minutes under a day.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '<1m';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${pad2(mins)}m`;
  return `${mins}m`;
}

/** "12s ago", "2 min ago", "3h ago"; a day or older → the date. Future times count as "just now". */
export function formatAgo(value: DateInput, now: DateInput = Date.now()): string {
  const d = toDate(value);
  const n = toDate(now);
  if (!d || !n) return '—';
  const s = Math.floor((n.getTime() - d.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return formatDate(d);
}

/**
 * Number plates are stored without spaces and shown with them for reading:
 * "KA05MN1234" → "KA 05 MN 1234", "MH12AB123" → "MH 12 AB 123", BH series
 * "22BH1234AA" → "22 BH 1234 AA". Anything else is returned upper-cased as is.
 */
export function formatPlate(value: string | null | undefined): string {
  if (!value) return '—';
  const raw = value.replace(/[\s-]/g, '').toUpperCase();
  const std = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})?(\d{1,4})$/.exec(raw);
  if (std) return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ');
  const bh = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/.exec(raw);
  if (bh) return `${bh[1]} ${bh[2]} ${bh[3]} ${bh[4]}`;
  return raw;
}

/** Words that keep their capitals when an enum is turned into a label. */
const ACRONYMS: Record<string, string> = { EV: 'EV', SUV: 'SUV', CSUV: 'Compact SUV', ANPR: 'ANPR', VIP: 'VIP', PLC: 'PLC', ID: 'ID', CSV: 'CSV', SMS: 'SMS', OK: 'OK' };

/** Fixed wording for enum values whose plain-words form needs care (AC-13). */
const LABELS: Record<string, string> = {
  TWO_WHEELER: 'Two-wheeler',
  ANPR_AUTO: 'ANPR (automatic)',
  MANUAL: 'Manual',
  RETRIEVED_DELIVERED: 'Delivered',
  RETRIEVAL_REQUESTED: 'Retrieval requested',
  NOT_AVAILABLE: 'Not available',
  VIP_EXECUTIVE: 'VIP executive',
  ALL_SITES: 'All sites',
  SPECIFIC_SITES: 'Specific sites',
  ASSIGNED_SITES_ONLY: 'Assigned sites only',
  DEACTIVATED: 'Deactivated',
  DECOMMISSIONED: 'Decommissioned',
};

/** ON_HOLD → "On hold", OCCUPIED → "Occupied", TWO_WHEELER → "Two-wheeler", EV → "EV". */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const key = value.trim().toUpperCase();
  if (LABELS[key]) return LABELS[key];
  if (ACRONYMS[key]) return ACRONYMS[key];
  const words = key.split(/[_\s-]+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (ACRONYMS[w]) return ACRONYMS[w];
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

export type StatusTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

/** Fixed status colours (design system): Vacant/Approved green, Occupied/Rejected red, Reserved/Pending amber, Maintenance/Inactive grey. */
const TONES: Record<string, StatusTone> = {
  VACANT: 'success', APPROVED: 'success', ACTIVE: 'success', ALLOWED: 'success', COMPLETED: 'success', RETRIEVED_DELIVERED: 'success', PAID: 'success',
  OCCUPIED: 'danger', REJECTED: 'danger', REFUSED: 'danger', REVOKED: 'danger', EXCEPTION: 'danger', DEFAULTER: 'danger', SUSPENDED: 'danger', LOCKED: 'danger',
  RESERVED: 'warning', PENDING: 'warning', ON_HOLD: 'warning', CHECK_NEEDED: 'warning', RETRIEVAL_REQUESTED: 'warning', NEW: 'warning',
  MAINTENANCE: 'neutral', INACTIVE: 'neutral', DEACTIVATED: 'neutral', DECOMMISSIONED: 'neutral', CLOSED: 'neutral', CANCELLED: 'neutral',
  CONTACTED: 'info', PARKED: 'info', RECEIVED: 'info',
};

/** The chip colour family for a status value; unknown values are neutral. */
export function statusTone(value: string | null | undefined): StatusTone {
  return (value && TONES[value.trim().toUpperCase()]) || 'neutral';
}
