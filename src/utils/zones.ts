// 008 B1: zones of two-wheeler slots. The zone lives in the existing
// `puzzleNumber` ("B1-Z1" = Level-Zone) and the slot name is "{puzzleNumber}-NNN"
// ("B1-Z1-001"). Rule: puzzleNumber = slot name minus its last dash segment.
// A 2W slot with NO puzzleNumber is "Unzoned" (one pallet per level). A zone is
// never guessed from an old name (B2-2W-01 gives no zone): no automatic data.
// Pure and dependency-free; counts come from the one shared countSlots.
import type { ParkingSlot, OverviewZone } from '../types';
import { countSlots } from './slotCounts.ts';
import { inGroup } from './vehicleGroup.ts';

export const ZONE_PATTERN = /^[A-Z0-9]{1,6}$/;
export const SLOT_NO_MIN = 1;
export const SLOT_NO_MAX = 999;
export const UNZONED_KEY = 'unzoned'; // lower case: can never equal a real (upper-case) zone

const hasText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Zone of a 2W slot = last segment of its puzzleNumber; null = Unzoned (also for any non-2W slot). */
export function zoneOf(s: Pick<ParkingSlot, 'slotType' | 'puzzleNumber'>): string | null {
  if (s.slotType !== 'TWO_WHEELER' || !hasText(s.puzzleNumber)) return null;
  const parts = s.puzzleNumber.trim().toUpperCase().split('-');
  const zone = parts.length > 1 ? parts[parts.length - 1] : '';
  return ZONE_PATTERN.test(zone) ? zone : null;
}

/** Slot number part: 1..999 as digits, padded to 3 ("7" -> "007"). null when not a whole number in range. */
export function padSlotNo(n: number | string): string | null {
  const t = String(n).trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const v = Number(t);
  return v >= SLOT_NO_MIN && v <= SLOT_NO_MAX ? String(v).padStart(3, '0') : null;
}

export interface BuiltName { puzzleNumber: string; slotNumber: string }
/** Builds "B1-Z1" and "B1-Z1-001". The zone is upper-cased; null when zone or number is invalid. */
export function buildSlotName(level: string, zone: string, n: number | string): BuiltName | null {
  const lv = String(level || '').trim().toUpperCase();
  const z = String(zone || '').trim().toUpperCase();
  const no = padSlotNo(n);
  if (!lv || lv.includes('-') || !ZONE_PATTERN.test(z) || no === null) return null;
  return { puzzleNumber: `${lv}-${z}`, slotNumber: `${lv}-${z}-${no}` };
}

export type ZoneNameCheck = { ok: true } | { ok: false; field: 'puzzleNumber' | 'slotNumber'; message: string };
/**
 * Name and zone must agree: puzzleNumber = "{Level}-{ZONE}" (level case-insensitive, zone upper-case,
 * no dash) and slotNumber = "{puzzleNumber}-NNN" (NNN = 001..999).
 */
export function checkZoneName(slot: { basement: string; puzzleNumber: string; slotNumber: string }): ZoneNameCheck {
  const level = String(slot.basement || '').trim().toUpperCase();
  const puzzle = String(slot.puzzleNumber || '').trim();
  const bad = (field: 'puzzleNumber' | 'slotNumber', message: string): ZoneNameCheck => ({ ok: false, field, message });
  const m = /^([^-]+)-([^-]*)$/.exec(puzzle);
  if (!m || m[1].toUpperCase() !== level) return bad('puzzleNumber', `Zone must be "${level}-" followed by the zone name, for example ${level}-Z1.`);
  if (!ZONE_PATTERN.test(m[2])) return bad('puzzleNumber', 'Zone name must be 1 to 6 capital letters or digits, with no dash (for example Z1).');
  const expectPrefix = `${level}-${m[2]}-`;
  const num = String(slot.slotNumber || '').trim().toUpperCase();
  if (!num.startsWith(expectPrefix) || padSlotNo(num.slice(expectPrefix.length)) !== num.slice(expectPrefix.length)) {
    return bad('slotNumber', `Slot number must be ${expectPrefix}001 to ${expectPrefix}999 for zone ${level}-${m[2]}.`);
  }
  return { ok: true };
}

/**
 * One pallet per level + zone for the 2W slots of `slots` (other types are ignored); 2W slots without a zone
 * make an "Unzoned" pallet (zone null) per level. Order: levels as countSlots orders them, zones by name,
 * Unzoned last. free/total come from countSlots (free = Vacant), the only counter.
 */
export function zonesOf<S extends Pick<ParkingSlot, 'status' | 'slotType' | 'basement' | 'puzzleNumber'>>(slots: S[]): OverviewZone[] {
  const two = slots.filter((s) => inGroup(s, '2W'));
  const out: OverviewZone[] = [];
  for (const row of countSlots(two).rows) {
    const inLevel = two.filter((s) => s.basement === row.level);
    const byZone = new Map<string | null, S[]>();
    for (const s of inLevel) {
      const z = zoneOf(s);
      byZone.set(z, [...(byZone.get(z) || []), s]);
    }
    const keys = [...byZone.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0));
    for (const z of keys) {
      const c = countSlots(byZone.get(z)!);
      out.push({ level: row.level, zone: z, id: `${row.level}-${z === null ? UNZONED_KEY : z}`, free: c.free, total: c.total });
    }
  }
  return out;
}
