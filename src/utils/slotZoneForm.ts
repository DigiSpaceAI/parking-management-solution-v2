// 008 F7: pure logic of the two-wheeler part of the Inventory slot form (AC-09, AC-10, AC-12).
// Level, Zone and Slot number are typed; the slot name is BUILT ("B1-Z1-001") and never typed. The zone is saved in puzzleNumber ("B1-Z1").
import type { ParkingSlot } from '../types';
import { buildSlotName, padSlotNo, zoneOf, SLOT_NO_MAX, SLOT_NO_MIN, ZONE_PATTERN, type BuiltName } from './zones.ts';
import { mapSaveError, type SaveErrorView } from './slotEditor.ts';

export const COPY_ZONE_REQUIRED = 'Zone is required for two-wheeler slots';
export const COPY_ZONE_FORMAT = 'Zone must be 1 to 6 capital letters or digits, with no dash (for example Z1)';
export const COPY_NUMBER_DIGITS = 'Slot number must be digits only';
export const COPY_NUMBER_RANGE = `Slot number must be ${SLOT_NO_MIN} to ${SLOT_NO_MAX}`;
export const COPY_NAME_EXISTS = 'This slot name already exists in this site';

type FormSlot = Pick<ParkingSlot, 'slotType' | 'puzzleNumber' | 'slotNumber' | 'basement'>;
export interface ZoneFormOrigin { slotType?: string; zoned: boolean }

/** What the slot looked like when the form opened (a new slot has none). */
export const originOf = (slot: Partial<FormSlot> | null): ZoneFormOrigin | null => (slot && 'slotNumber' in slot && slot.slotNumber ? { slotType: slot.slotType, zoned: zoneOf(slot as FormSlot) !== null } : null);

/**
 * Whether the form shows Level / Zone / Slot number / Slot name for this slot.
 * A new two-wheeler slot, a zoned one, a slot that becomes a two-wheeler, and "Set zone" use it. An old unzoned two-wheeler slot
 * keeps today's single Slot number box when edited for something else, so an unrelated edit never forces a zone (and never renames it).
 */
export function usesZoneForm(slotType: unknown, origin: ZoneFormOrigin | null, setZone: boolean): boolean {
  if (slotType !== 'TWO_WHEELER') return false;
  return setZone || origin === null || origin.slotType !== 'TWO_WHEELER' || origin.zoned;
}

/** Zone and number for the inputs of an existing slot: "B1-Z1-007" -> { zone: 'Z1', number: '007' }. An unzoned slot gives an empty zone. */
export function zoneInputsOf(slot: Partial<FormSlot>): { zone: string; number: string } {
  const zone = slot.slotType === 'TWO_WHEELER' ? zoneOf(slot as FormSlot) : null;
  if (zone === null) return { zone: '', number: '' };
  const name = String(slot.slotNumber || '').toUpperCase();
  const prefix = `${String(slot.puzzleNumber).trim().toUpperCase()}-`;
  return { zone, number: name.indexOf(prefix) === 0 ? name.slice(prefix.length) : '' };
}

/** "Set zone": the number is prefilled from the digits at the end of the old name ("B2-2W-01" -> "001"); the zone stays empty (never guessed). */
export function setZoneInputs(slotNumber: string | undefined): { zone: string; number: string } {
  const m = /(\d{1,3})$/.exec(String(slotNumber || '').trim());
  return { zone: '', number: (m && padSlotNo(m[1])) || '' };
}

/** Floor location prefilled for two-wheeler slots (required since 005): "B1 · Zone Z1". */
export const autoFloorLocation = (level: string, zone: string): string => (level && zone ? `${level} · Zone ${zone.trim().toUpperCase()}` : '');

export interface ZoneFormCheck { errors: { level?: string; zone?: string; number?: string }; built: BuiltName | null }
/** Field messages while typing (nothing is shown for an untouched empty field: `touched` says what to report) and the built name when all is valid. */
export function checkZoneForm(level: string, zone: string, number: string, touched: { zone?: boolean; number?: boolean } = { zone: true, number: true }): ZoneFormCheck {
  const errors: ZoneFormCheck['errors'] = {};
  const z = zone.trim().toUpperCase();
  const n = number.trim();
  if (z === '') { if (touched.zone) errors.zone = COPY_ZONE_REQUIRED; }
  else if (!ZONE_PATTERN.test(z)) errors.zone = COPY_ZONE_FORMAT;
  if (n !== '') {
    if (!/^\d+$/.test(n)) errors.number = COPY_NUMBER_DIGITS;
    else if (padSlotNo(n) === null) errors.number = COPY_NUMBER_RANGE;
  } else if (touched.number) errors.number = COPY_NUMBER_DIGITS;
  return { errors, built: !errors.zone && !errors.number && level ? buildSlotName(level, z, n) : null };
}

/** The built name is already used in this site (case-insensitive, the slot being edited excluded). The server repeats this (409). */
export function nameTaken(name: string, siteSlots: { id?: string; slotNumber?: string }[], editingId?: string): boolean {
  const key = name.trim().toUpperCase();
  return siteSlots.some((s) => s.id !== editingId && String(s.slotNumber || '').trim().toUpperCase() === key);
}

/** Where a failed save is shown in the zone form: 409 under the name (with the UX copy), the server's zone and number messages under their inputs. */
export function mapZoneSaveError(status: number, data: unknown): SaveErrorView & { zoneErrors: { zone?: string; number?: string; name?: string } } {
  const d = (data && typeof data === 'object' ? data : {}) as { errorCode?: string; field?: string; message?: string };
  const base = mapSaveError(status, data);
  const zoneErrors: { zone?: string; number?: string; name?: string } = {};
  if (status === 409 || d.errorCode === 'ERR_DUPLICATE_SLOT') { zoneErrors.name = COPY_NAME_EXISTS; delete base.fieldErrors.slotNumber; }
  else if (d.errorCode === 'ERR_VALIDATION' && d.field === 'puzzleNumber') { zoneErrors.zone = d.message || COPY_ZONE_FORMAT; base.banner = null; }
  else if (d.errorCode === 'ERR_VALIDATION' && d.field === 'slotNumber') { zoneErrors.number = d.message || COPY_NUMBER_DIGITS; delete base.fieldErrors.slotNumber; }
  return { ...base, zoneErrors };
}
