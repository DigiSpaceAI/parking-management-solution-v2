// 003 Live Parking Display: what a display covers, and (B3) the TV feed.
// Pure functions over the in-memory store. 03-tech-design v1.2 "The feed",
// "Zones" (areas = level + parking type, no free-text matching).
import { LiveDisplay, ParkingSlot, ParkingType } from '../types';

export const ONLINE_WINDOW_MS = 120 * 1000; // AC-17: offline = not seen for 2 minutes

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
  const byCode = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  return {
    levels: [...levels.entries()].sort((a, b) => levelRank(a[0]) - levelRank(b[0])).map(([level, slots]) => ({ level, slots })),
    areas: [...areas.values()].sort((a, b) => levelRank(a.level) - levelRank(b.level) || byCode(a.label, b.label)),
    slots: [...siteSlots]
      .sort((a, b) => byCode(a.slotNumber, b.slotNumber))
      .map((s) => ({ id: s.id, code: s.slotNumber, level: s.basement, area: areaLabel(s.basement, s.parkingType), puzzleNumber: s.puzzleNumber, type: s.slotType })),
  };
}
