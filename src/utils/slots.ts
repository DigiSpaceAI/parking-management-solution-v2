/**
 * Slot helpers for Live parking (002 tech design "Live parking", gap 4).
 * One rule each, so cards, list rows, the puzzle view and the modal agree.
 */
import type { ParkingSlot, SlotStatus } from '../types';

/** /slots adds these to each slot (002 B1/B2); they are API extras, not stored fields. */
export interface LiveSlot extends ParkingSlot {
  heightM?: number;
  /** ISO entry time of the open log, for OCCUPIED slots. */
  inSince?: string;
}

/**
 * Level within a puzzle stacker (1 = ground). The stored `palletLevel` when there is one;
 * otherwise the trailing `-S<n>` of the slot number (`B1-P03-S2` → 2); otherwise null.
 */
export function palletLevelOf(slot: Pick<ParkingSlot, 'palletLevel' | 'slotNumber'>): number | null {
  if (typeof slot.palletLevel === 'number' && slot.palletLevel >= 1) return slot.palletLevel;
  const m = /-S(\d+)$/i.exec(slot.slotNumber || '');
  return m ? Number(m[1]) : null;
}

/** The stacker a puzzle slot belongs to: `puzzleNumber`, or the slot number without its `-S<n>`. */
export function puzzleIdOf(slot: Pick<ParkingSlot, 'puzzleNumber' | 'slotNumber'>): string {
  return slot.puzzleNumber || (slot.slotNumber || '').replace(/-S\d+$/i, '');
}

export function isPuzzle(slot: Pick<ParkingSlot, 'parkingType'>): boolean {
  return slot.parkingType === 'PUZZLE';
}

/** Height in metres: the API's `heightM`, else parsed from the stored text ("2.0m"); null when unknown. */
export function heightOf(slot: Pick<LiveSlot, 'heightM' | 'height'>): number | null {
  if (typeof slot.heightM === 'number' && slot.heightM > 0) return slot.heightM;
  const n = parseFloat(String(slot.height ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The line that explains a slot code: "Puzzle 03 · Pallet 1", "Ground · Bay 14", "Stack · Bay 2". */
export function decodeSlot(slot: Pick<ParkingSlot, 'parkingType' | 'puzzleNumber' | 'slotNumber' | 'palletLevel' | 'floorLocation'>): string {
  if (isPuzzle(slot)) {
    const pid = puzzleIdOf(slot);
    const p = /P(\d+)$/i.exec(pid);
    const level = palletLevelOf(slot);
    return [`Puzzle ${p ? p[1] : pid}`, level ? `Pallet ${level}` : null].filter(Boolean).join(' · ');
  }
  const kind = slot.parkingType === 'STACK' ? 'Stack' : 'Ground';
  const bay = /(\d+)$/.exec(slot.slotNumber || '');
  return bay ? `${kind} · Bay ${Number(bay[1])}` : [kind, slot.floorLocation].filter(Boolean).join(' · ');
}

/** Vacant first, then reserved, maintenance, occupied; then slot code in natural order. */
const STATUS_ORDER: Record<SlotStatus, number> = { VACANT: 0, RESERVED: 1, MAINTENANCE: 2, OCCUPIED: 3 };
export function compareSlots(a: ParkingSlot, b: ParkingSlot): number {
  const d = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
  return d || a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true });
}

/** Pallets top level first; unknown levels last, by slot code. */
export function compareTopFirst(a: ParkingSlot, b: ParkingSlot): number {
  const la = palletLevelOf(a);
  const lb = palletLevelOf(b);
  if (la !== null && lb !== null && la !== lb) return lb - la;
  if (la === null && lb !== null) return 1;
  if (lb === null && la !== null) return -1;
  return a.slotNumber.localeCompare(b.slotNumber, undefined, { numeric: true });
}

/** Level groups for the level buttons (from the /slots summary). */
export type LevelId = 'ALL' | 'B1' | 'B2' | 'B3' | 'Ground';
export function slotInLevel(slot: Pick<ParkingSlot, 'basement'>, level: LevelId): boolean {
  if (level === 'ALL') return true;
  if (level === 'Ground') return slot.basement === 'Ground' || slot.basement === 'Driveway';
  return slot.basement === level;
}
