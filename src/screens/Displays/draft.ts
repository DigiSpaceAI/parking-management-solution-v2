/**
 * The editor's live preview (UX C4: "the preview updates as you go") for a selection that isn't
 * saved yet. Built in the console from the site's slots (GET /api/v1/slots, already site-scoped)
 * with the 03 feed rules: union of levels / areas / single slots, filtered by vehicle type;
 * Vacant → Occupied → Reserved → Maintenance, each by slot code (pinned first, US-17); counts
 * per selected level or area. Preview only: the TV's feed is always built by the server.
 * A saved display's panel uses GET /displays/:id/preview instead.
 */
import type { ParkingSlot, SlotStatus } from '../../types';
import type { LiveSlot } from '../../utils/slots';
import { heightOf } from '../../utils/slots';
import type { DisplayFeed, DisplayHours, FeedSlot } from '../../display/types';
import type { DisplaySelection } from './api';

const ORDER: Record<SlotStatus, number> = { VACANT: 0, OCCUPIED: 1, RESERVED: 2, MAINTENANCE: 3 };
const LEVELS: ParkingSlot['basement'][] = ['B1', 'B2', 'B3', 'Ground', 'Driveway'];
const AREA_WORD: Record<string, string> = { PUZZLE: 'Puzzles', STACK: 'Stackers', GROUND: 'Open bays' };

export function levelLabel(level: string): string {
  return /^B\d$/.test(level) ? `Basement ${level}` : level;
}
export function areaLabel(level: string, parkingType: string): string {
  return `${level} · ${AREA_WORD[parkingType] || parkingType}`;
}

export function inSelection(slot: Pick<ParkingSlot, 'id' | 'basement' | 'parkingType' | 'slotType'>, sel: DisplaySelection): boolean {
  const picked =
    sel.levels.includes(slot.basement) || sel.areas.some((a) => a.level === slot.basement && a.parkingType === slot.parkingType) || sel.slotIds.includes(slot.id);
  if (!picked) return false;
  if (sel.vehicleClass === '2W') return slot.slotType === 'TWO_WHEELER';
  if (sel.vehicleClass === '4W') return slot.slotType !== 'TWO_WHEELER';
  return true;
}

export function selectedSlots<T extends LiveSlot>(slots: T[], sel: DisplaySelection, hidden: string[] = []): T[] {
  return slots.filter((s) => inSelection(s, sel) && !hidden.includes(s.id));
}

export function isEmptySelection(sel: DisplaySelection): boolean {
  return !sel.levels.length && !sel.areas.length && !sel.slotIds.length;
}

export function draftFeed(input: {
  slots: LiveSlot[];
  selection: DisplaySelection;
  place: string;
  siteName?: string;
  hours: DisplayHours;
  pageSeconds: number;
  hidden?: string[];
  pinned?: string[];
  now?: number;
}): DisplayFeed {
  const pinned = new Set(input.pinned || []);
  const chosen = selectedSlots(input.slots, input.selection, input.hidden).sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0) ||
      a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true })
  );
  const groups: { key: string; label: string; free: number; total: number }[] = [];
  for (const l of LEVELS) {
    if (input.selection.levels.includes(l)) groups.push({ key: `L${l}`, label: levelLabel(l), free: 0, total: 0 });
    for (const a of input.selection.areas.filter((x) => x.level === l)) groups.push({ key: `A${l}${a.parkingType}`, label: areaLabel(l, a.parkingType), free: 0, total: 0 });
  }
  for (const s of chosen) {
    let g = groups.find((x) => x.key === `L${s.basement}`) || groups.find((x) => x.key === `A${s.basement}${s.parkingType}`);
    if (!g) {
      g = { key: `L${s.basement}`, label: levelLabel(s.basement), free: 0, total: 0 };
      groups.push(g);
    }
    g.total += 1;
    if (s.status === 'VACANT') g.free += 1;
  }
  const feedSlots: FeedSlot[] = chosen.map((s) => {
    const f: FeedSlot = {
      code: s.slotNumber,
      level: s.basement,
      area: areaLabel(s.basement, s.parkingType),
      type: s.slotType,
      ev: s.slotType === 'EV',
      parkingType: s.parkingType,
      status: s.status,
    };
    if (s.puzzleNumber) f.puzzleNumber = s.puzzleNumber;
    if (typeof s.palletLevel === 'number') f.palletLevel = s.palletLevel;
    const h = heightOf(s);
    if (h !== null) f.heightM = h;
    if (typeof s.lengthM === 'number' && s.lengthM > 0) f.lengthM = s.lengthM;
    if (s.status === 'OCCUPIED' && s.currentVehicle) f.plate = s.currentVehicle;
    if (pinned.has(s.id)) f.pinned = true;
    return f;
  });
  const now = input.now ?? Date.now();
  const base = {
    v: 'draft',
    serverTime: new Date(now).toISOString(),
    place: input.place,
    siteName: input.siteName,
    hours: input.hours,
    pageSeconds: input.pageSeconds,
    override: { message: null, forcedFull: null },
  };
  if (!feedSlots.length) return { ...base, state: 'EMPTY', counts: { free: 0, total: 0, groups: [] } };
  return {
    ...base,
    state: 'OPEN', // the preview always shows the slots, even outside display hours, so the selection can be checked
    counts: { free: feedSlots.filter((s) => s.status === 'VACANT').length, total: feedSlots.length, groups: groups.filter((g) => g.total > 0).map(({ label, free, total }) => ({ label, free, total })) },
    slots: feedSlots,
  };
}
