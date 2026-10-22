/**
 * Displays console API (03 v1.2 "Console routes"). Every call goes through the global fetch
 * wrapper, which adds the session, x-site-id and x-view-as; the server decides access
 * (DISPLAYS:view / canCreate / canEdit, resolveSite, refused under view-as).
 *
 * These shapes follow 03. The backend (B1) owns them in src/types.ts; until then they live here.
 */
import type { ParkingType, SlotType } from '../../types';
import type { DisplayFeed, DisplayHours } from '../../display/types';

export type VehicleClass = 'ALL' | '4W' | '2W';

export interface DisplayArea {
  level: string;
  parkingType: ParkingType;
}

export interface DisplaySelection {
  levels: string[];
  areas: DisplayArea[];
  slotIds: string[];
  vehicleClass: VehicleClass;
}

/** 03 v1.2: GET /displays `override` summary (console only; `by` is the admin's name). */
export interface DisplayOverrideSummary {
  message?: { id: string; mode: 'BANNER' | 'FULL'; text: string; by: string; until: string | null };
  forcedFull?: { by: string; until: string | null };
  hidden: number;
  pinned: number;
}

export interface DisplayRow {
  id: string;
  siteId: string;
  name: string;
  location: string;
  selection: DisplaySelection;
  selectionSummary: string;
  slotCount: number;
  /** Single slots chosen earlier that no longer exist (AC-21). */
  missingSlots: number;
  freeNow: number;
  pageSeconds: number;
  hours: DisplayHours;
  status: 'ACTIVE' | 'SWITCHED_OFF';
  /** A screen has connected at least once with the current credential. */
  setUp: boolean;
  /** Seen in the last 120 s (AC-17). */
  online: boolean;
  lastSeenAt?: string;
  pairedAt?: string;
  screenAgent?: string;
  /** US-17 (03 v1.2); absent on a backend without B9. */
  slotRules?: { hidden: string[]; pinned: string[] };
  override?: DisplayOverrideSummary | null;
}

export interface DisplayOptions {
  levels: { level: string; slots: number }[];
  areas: { level: string; parkingType: ParkingType; label: string; slots: number }[];
  slots: { id: string; code: string; level: string; area: string; puzzleNumber?: string; type: SlotType }[];
}

export interface DisplayInput {
  name: string;
  location: string;
  selection: DisplaySelection;
  pageSeconds: number;
  hours: DisplayHours;
}

/** 03 v1.2 DisplayMessage, as the console lists it (GET /displays/messages). */
export interface DisplayMessage {
  id: string;
  siteId: string;
  text: string;
  mode: 'BANNER' | 'FULL';
  target: { all: true } | { displayIds: string[] };
  clearedFor: string[];
  endsAt: string | null;
  createdAt: string;
  createdBy: string;
  endedAt?: string;
  endReason?: 'CLEARED' | 'EXPIRED' | 'REPLACED';
  /** Resolved display ids it is shown on now. */
  appliesTo?: string[];
}

export interface MessageInput {
  text: string;
  mode: 'BANNER' | 'FULL';
  target: { all: true } | { displayIds: string[] };
  /** ISO with an explicit +05:30 offset (the IST wall time picked), or null = "when I clear it". */
  endsAt: string | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { success?: boolean; message?: string; errorCode?: string; errors?: Record<string, string> };
}

async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {} as ApiResult<T>['data'];
  try {
    data = await res.json();
  } catch {
    /* empty or not JSON */
  }
  return { ok: res.ok && data.success !== false, status: res.status, data };
}

const enc = encodeURIComponent;

export const displaysApi = {
  list: () => call<{ displays?: DisplayRow[] }>('GET', '/api/v1/displays'),
  options: () => call<DisplayOptions>('GET', '/api/v1/displays/options'),
  preview: (id: string) => call<DisplayFeed>('GET', `/api/v1/displays/${enc(id)}/preview`),
  create: (input: DisplayInput) => call<{ display?: DisplayRow; link?: string }>('POST', '/api/v1/displays', input),
  update: (id: string, input: DisplayInput) => call<{ display?: DisplayRow }>('POST', `/api/v1/displays/${enc(id)}`, input),
  pair: (id: string, code: string) => call<object>('POST', `/api/v1/displays/${enc(id)}/pair`, { code }),
  replace: (id: string) => call<{ link?: string }>('POST', `/api/v1/displays/${enc(id)}/replace`),
  switchOff: (id: string) => call<{ display?: DisplayRow }>('POST', `/api/v1/displays/${enc(id)}/switch-off`),
  // 03 v1.2 overrides (US-15, US-16)
  messages: () => call<{ messages?: DisplayMessage[] }>('GET', '/api/v1/displays/messages'),
  createMessage: (input: MessageInput) => call<{ message?: DisplayMessage; appliesTo?: string[] }>('POST', '/api/v1/displays/messages', input),
  /** No ids = clear it everywhere; ids = clear it on these displays only (per-row Clear, C8). */
  clearMessage: (id: string, displayIds?: string[]) =>
    call<{ message?: DisplayMessage }>('POST', `/api/v1/displays/messages/${enc(id)}/clear`, displayIds ? { displayIds } : {}),
  forceFull: (id: string, endsAt: string | null) => call<{ display?: DisplayRow }>('POST', `/api/v1/displays/${enc(id)}/force-full`, { endsAt }),
  clearForceFull: (id: string) => call<{ display?: DisplayRow }>('POST', `/api/v1/displays/${enc(id)}/force-full/clear`),
  // 03 v1.2 US-17 (separable, B9): the whole new lists.
  slotRules: (id: string, rules: { hidden: string[]; pinned: string[] }) => call<{ display?: DisplayRow }>('POST', `/api/v1/displays/${enc(id)}/slot-rules`, rules),
};

/** The IST wall time picked in the console as an ISO string with its +05:30 offset (03 v1.2 "End times are IST"). */
export function istIso(date: string, time: string): string {
  return `${date}T${time}:00+05:30`;
}

/** The next `n` IST calendar days as { value: 'YYYY-MM-DD', label: 'Today, 21 Oct 2026' }. */
export function istDays(n: number, now = Date.now()): { value: string; label: string }[] {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now + 330 * 60000 + i * 86400000);
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    out.push({ value, label: `${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[d.getUTCDay()]}, ${date}` });
  }
  return out;
}

/** "Always on" / "07:00–23:00". */
export function hoursText(h: DisplayHours): string {
  return h.mode === 'DAILY' ? `${h.on}–${h.off}` : 'Always on';
}

/** The display's state for the Status column and panel (UX C1/C6). */
export type DisplayState = 'ONLINE' | 'OFFLINE' | 'NOT_SET_UP' | 'SWITCHED_OFF';
export function displayState(d: DisplayRow): DisplayState {
  if (d.status === 'SWITCHED_OFF') return 'SWITCHED_OFF';
  if (d.online) return 'ONLINE';
  if (!d.setUp && !d.lastSeenAt) return 'NOT_SET_UP';
  return 'OFFLINE';
}

/** Short address a TV opens to pair (UX C5). parkflows.in/tv needs the approved marketing redirect (03 gap 2, D1). */
export const TV_SHORT_ADDRESS = 'parkflows.in/tv';
