// 003 v1.5 (AC-42, S-3): the ONE way to count free slots, shared by the TV
// feed (server), Live parking, the Displays editor and the console preview.
// Pure and dependency-free (types only). "Free" = Vacant unless the caller
// passes isFree (003b passes "Vacant and its level isn't closed").
import type { ParkingSlot, SlotType } from '../types';

export const SUMMARY_TYPES: SlotType[] = ['SEDAN', 'SUV', 'CSUV', 'TWO_WHEELER', 'EV'];
export const LEVEL_ORDER: ParkingSlot['basement'][] = ['B1', 'B2', 'B3', 'Ground', 'Driveway'];

export type SlotLike = Pick<ParkingSlot, 'status' | 'slotType' | 'basement'>;
export const isVacant = (s: Pick<ParkingSlot, 'status'>): boolean => s.status === 'VACANT';

export interface CountCell { free: number; total: number }
export interface SlotCountRow { level: string; byType: Partial<Record<SlotType, CountCell>>; free: number; total: number }
export interface SlotCounts {
  types: SlotType[];                                   // SUMMARY_TYPES present in the input, in that order
  rows: SlotCountRow[];                                // LEVEL_ORDER, then any other level by name
  byType: Partial<Record<SlotType, CountCell>>;        // the Total row
  free: number;
  total: number;
}

const levelRank = (level: string): number => {
  const i = LEVEL_ORDER.indexOf(level as ParkingSlot['basement']);
  return i === -1 ? LEVEL_ORDER.length : i;
};

export function countSlots<S extends SlotLike>(slots: S[], opts: { isFree?: (s: S) => boolean } = {}): SlotCounts {
  const isFree = opts.isFree || isVacant;
  const rows = new Map<string, SlotCountRow>();
  const byType: Partial<Record<SlotType, CountCell>> = {};
  let free = 0;
  for (const s of slots) {
    const f = isFree(s) ? 1 : 0;
    free += f;
    let row = rows.get(s.basement);
    if (!row) {
      row = { level: s.basement, byType: {}, free: 0, total: 0 };
      rows.set(s.basement, row);
    }
    row.total++;
    row.free += f;
    const cell = row.byType[s.slotType] || (row.byType[s.slotType] = { free: 0, total: 0 });
    cell.total++;
    cell.free += f;
    const t = byType[s.slotType] || (byType[s.slotType] = { free: 0, total: 0 });
    t.total++;
    t.free += f;
  }
  return {
    types: SUMMARY_TYPES.filter((t) => byType[t]),
    rows: [...rows.values()].sort((a, b) => levelRank(a.level) - levelRank(b.level) || (a.level < b.level ? -1 : a.level > b.level ? 1 : 0)),
    byType,
    free,
    total: slots.length,
  };
}
