// 003 Live Parking Display: what a display covers, and (B3) the TV feed.
// Pure functions over the in-memory store. 03-tech-design v1.2 "The feed",
// "Zones" (areas = level + parking type, no free-text matching).
import crypto from 'node:crypto';
import { LiveDisplay, ParkingSlot, ParkingType, DisplayFeed, FeedSlot, DisplayHours, SlotStatus } from '../types';

export const ONLINE_WINDOW_MS = 120 * 1000; // AC-17: offline = not seen for 2 minutes

// Slot-code order ("B1-P2" before "B1-P10"). One shared collator: a
// localeCompare with options builds a new one per call (B6: 40 ms per sort).
const CODE_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const byCode = (a: string, b: string): number => CODE_COLLATOR.compare(a, b);
export const sortByCode = (slots: ParkingSlot[]): ParkingSlot[] => [...slots].sort((a, b) => byCode(a.slotNumber, b.slotNumber));

export const LEVEL_ORDER: ParkingSlot['basement'][] = ['B1', 'B2', 'B3', 'Ground', 'Driveway'];
const PARKING_TYPE_LABEL: Record<ParkingType, string> = { PUZZLE: 'Puzzles', STACK: 'Stackers', GROUND: 'Open bays' };

export const areaLabel = (level: string, parkingType: ParkingType): string => `${level} · ${PARKING_TYPE_LABEL[parkingType] || parkingType}`;
export const levelRank = (level: string): number => {
  const i = LEVEL_ORDER.indexOf(level as ParkingSlot['basement']);
  return i === -1 ? LEVEL_ORDER.length : i;
};
const vehicleMatches = (slot: ParkingSlot, vehicleClass: LiveDisplay['selection']['vehicleClass']): boolean =>
  vehicleClass === 'ALL' || (vehicleClass === '2W' ? slot.slotType === 'TWO_WHEELER' : slot.slotType !== 'TWO_WHEELER');

/**
 * The slots a display covers right now, from this site's slots only:
 * (selected level OR selected area OR selected id), then the vehicle type.
 * Slots deleted since the display was saved simply drop out (AC-21).
 */
export function selectedSlots(display: Pick<LiveDisplay, 'siteId' | 'selection'>, siteSlots: ParkingSlot[]): ParkingSlot[] {
  const sel = display.selection;
  const levels = new Set<string>(sel.levels || []);
  const areas = new Set<string>((sel.areas || []).map((a) => `${a.level}|${a.parkingType}`));
  const ids = new Set<string>(sel.slotIds || []);
  return siteSlots.filter(
    (s) =>
      (levels.has(s.basement) || areas.has(`${s.basement}|${s.parkingType}`) || ids.has(s.id)) &&
      vehicleMatches(s, sel.vehicleClass || 'ALL')
  );
}

/** Selected slot ids that no longer exist at the site (console flag, AC-21). */
export function missingSlotIds(display: Pick<LiveDisplay, 'selection'>, siteSlots: ParkingSlot[]): string[] {
  const have = new Set(siteSlots.map((s) => s.id));
  return (display.selection.slotIds || []).filter((id) => !have.has(id));
}

/** Short console text, e.g. "B1 · B2 Puzzles · 3 slots · 4W". */
export function selectionSummary(display: Pick<LiveDisplay, 'selection'>): string {
  const sel = display.selection;
  const parts: string[] = [...(sel.levels || [])];
  for (const a of sel.areas || []) parts.push(areaLabel(a.level, a.parkingType));
  const n = (sel.slotIds || []).length;
  if (n > 0) parts.push(`${n} slot${n === 1 ? '' : 's'}`);
  if (sel.vehicleClass && sel.vehicleClass !== 'ALL') parts.push(sel.vehicleClass);
  return parts.join(' · ');
}

/** Editor options for one site (GET /displays/options): levels, derived areas, slots. */
export function displayOptions(siteSlots: ParkingSlot[]) {
  const levels = new Map<string, number>();
  const areas = new Map<string, { level: string; parkingType: ParkingType; label: string; slots: number }>();
  for (const s of siteSlots) {
    levels.set(s.basement, (levels.get(s.basement) || 0) + 1);
    const key = `${s.basement}|${s.parkingType}`;
    const a = areas.get(key) || { level: s.basement, parkingType: s.parkingType, label: areaLabel(s.basement, s.parkingType), slots: 0 };
    a.slots++;
    areas.set(key, a);
  }
  return {
    levels: [...levels.entries()].sort((a, b) => levelRank(a[0]) - levelRank(b[0])).map(([level, slots]) => ({ level, slots })),
    areas: [...areas.values()].sort((a, b) => levelRank(a.level) - levelRank(b.level) || byCode(a.label, b.label)),
    slots: [...siteSlots]
      .sort((a, b) => byCode(a.slotNumber, b.slotNumber))
      .map((s) => ({ id: s.id, code: s.slotNumber, level: s.basement, area: areaLabel(s.basement, s.parkingType), puzzleNumber: s.puzzleNumber, type: s.slotType })),
  };
}

// ==========================================
// B3: the TV feed (03 "The feed", NFR-5). Built from the display record and
// the in-memory store only; the TV can't name a site, display or slot.
// ==========================================
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_ORDER: SlotStatus[] = ['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];

/** Minutes since IST midnight (fixed +05:30; host and TV clocks don't matter). */
export const istMinuteOfDay = (nowMs: number): number => Math.floor((((nowMs + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60000);
const hhmm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Display hours in IST: ALWAYS, or DAILY on..off where off < on is overnight. */
export function isOpenAt(hours: DisplayHours, nowMs: number): boolean {
  if (!hours || hours.mode !== 'DAILY') return true;
  const m = istMinuteOfDay(nowMs);
  const on = hhmm(hours.on);
  const off = hhmm(hours.off);
  return on < off ? m >= on && m < off : m >= on || m < off;
}

/** NFR-5 allow-list: the only slot fields a screen can ever receive. */
export function toFeedSlot(s: ParkingSlot, pinned: boolean): FeedSlot {
  const out: FeedSlot = {
    code: s.slotNumber,
    level: s.basement,
    area: areaLabel(s.basement, s.parkingType),
    type: s.slotType,
    ev: s.slotType === 'EV',
    parkingType: s.parkingType,
    status: s.status,
  };
  if (s.puzzleNumber) out.puzzleNumber = s.puzzleNumber;
  if (typeof s.palletLevel === 'number') out.palletLevel = s.palletLevel;
  const m = String(s.height || '').match(/\d+(?:\.\d+)?/);
  if (m) out.heightM = parseFloat(m[0]);
  if (typeof s.lengthM === 'number') out.lengthM = s.lengthM;
  if (s.status === 'OCCUPIED' && s.currentVehicle) out.plate = String(s.currentVehicle);
  if (pinned) out.pinned = true;
  return out;
}

export interface FeedInputs {
  display: LiveDisplay;
  slots: ParkingSlot[]; // the display's selected slots, SORTED BY CODE (sortByCode), hidden ones removed
  pinned: Set<string>; // slot ids (US-17)
  siteName: string;
  override: DisplayFeed['override'];
  nowMs: number;
}

/**
 * The feed without serverTime; `v` hashes everything else. Also returns the
 * serialised body (without v and serverTime) so a response is built without a
 * second JSON.stringify (feedResponseJson).
 */
export function buildFeed(i: FeedInputs): { feed: Omit<DisplayFeed, 'serverTime'>; json: string } {
  const d = i.display;
  const base = {
    place: d.location || '',
    siteName: i.siteName,
    hours: d.hours,
    pageSeconds: d.pageSeconds,
    override: i.override,
  };
  let body: Omit<DisplayFeed, 'serverTime' | 'v'>;
  if (!isOpenAt(d.hours, i.nowMs)) {
    body = { state: 'CLOSED', ...base, counts: { free: 0, total: 0, groups: [] } };
  } else if (i.slots.length === 0) {
    body = { state: 'EMPTY', ...base, counts: { free: 0, total: 0, groups: [] } };
  } else {
    const levels = new Set<string>(d.selection.levels || []);
    const areas = new Set<string>((d.selection.areas || []).map((a) => `${a.level}|${a.parkingType}`));
    // One header group per selected level or area, in level order. A slot counts
    // in its level's group when that level is selected (or it was picked singly),
    // otherwise in its area's group.
    const groups = new Map<string, { label: string; rank: number; sub: number; free: number; total: number }>();
    for (const s of i.slots) {
      const areaKey = `${s.basement}|${s.parkingType}`;
      const useArea = !levels.has(s.basement) && areas.has(areaKey);
      const key = useArea ? `a:${areaKey}` : `l:${s.basement}`;
      const g = groups.get(key) || { label: useArea ? areaLabel(s.basement, s.parkingType) : s.basement, rank: levelRank(s.basement), sub: useArea ? 1 : 0, free: 0, total: 0 };
      g.total++;
      if (s.status === 'VACANT') g.free++;
      groups.set(key, g);
    }
    // Input is already in code order: bucket by status, pinned first within
    // each status (US-17), keeping code order inside each bucket. O(n).
    const buckets: ParkingSlot[][] = STATUS_ORDER.map(() => []);
    const pinnedBuckets: ParkingSlot[][] = STATUS_ORDER.map(() => []);
    for (const s of i.slots) {
      const k = STATUS_ORDER.indexOf(s.status);
      (i.pinned.has(s.id) ? pinnedBuckets : buckets)[k === -1 ? STATUS_ORDER.length - 1 : k].push(s);
    }
    const sorted: ParkingSlot[] = [];
    STATUS_ORDER.forEach((_, k) => { sorted.push(...pinnedBuckets[k], ...buckets[k]); });
    body = {
      state: 'OPEN',
      ...base,
      counts: {
        free: i.slots.filter((s) => s.status === 'VACANT').length,
        total: i.slots.length,
        groups: [...groups.values()]
          .sort((a, b) => a.rank - b.rank || a.sub - b.sub || byCode(a.label, b.label))
          .map(({ label, free, total }) => ({ label, free, total })),
      },
      slots: sorted.map((s) => toFeedSlot(s, i.pinned.has(s.id))),
    };
  }
  const json = JSON.stringify(body);
  const v = crypto.createHash('sha1').update(json).digest('hex').slice(0, 16);
  return { feed: { v, ...body }, json };
}

/** `{ v, serverTime, ...body }` as a string, from buildFeed's serialised body. */
export const feedResponseJson = (v: string, serverTime: string, json: string): string =>
  `{"v":${JSON.stringify(v)},"serverTime":${JSON.stringify(serverTime)}${json.length > 2 ? ',' + json.slice(1) : '}'}`;
