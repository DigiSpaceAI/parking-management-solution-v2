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
};

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
