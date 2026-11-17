// 005 B1: the ONE list of slot field values (code + label), shared by the editor, filters, table, CSV import/export,
// Live parking, the server routes, the migration and (after merge) the 003 TV.
// Pure and isomorphic. The 003 TV bundle is built for es2015, so this file uses no ES2016+ runtime APIs
// (no Array.prototype.includes, Object.values / entries / fromEntries, padStart ...). Syntax is down-compiled.

export type SlotField = 'slotType' | 'allocation' | 'height' | 'parkingType' | 'basement' | 'status';

export interface FieldOption { code: string; label: string }
export interface HeightOption extends FieldOption { metres: number }

// AC-01 order
export const SLOT_TYPES: FieldOption[] = [
  { code: 'SUV', label: 'SUV' },
  { code: 'CSUV', label: 'CSUV' },
  { code: 'SEDAN', label: 'Sedan' },
  { code: 'HATCHBACK', label: 'Hatchback' },
  { code: 'TWO_WHEELER', label: 'Two-wheeler' },
  { code: 'EV', label: 'EV' },
];
// NOT_AVAILABLE is legacy: kept in old data, never offered (O-5)
export const ALLOCATIONS: FieldOption[] = [
  { code: 'EMPLOYEE', label: 'Employees' },
  { code: 'TRANSPORT', label: 'Transport' },
  { code: 'VISITOR', label: 'Visitor' },
  { code: 'CAR_POOLING', label: 'Car Pooling' },
  { code: 'VIP', label: 'VIP' },
  { code: 'HANDICAP', label: 'Handicap' },
];
// v1.1: 2.2 m (B3) and 3.0 m (G-VIS) exist on live
export const HEIGHTS: HeightOption[] = [
  { code: '1.8m', label: 'Compact (1.8 m)', metres: 1.8 },
  { code: '2.0m', label: 'Standard (2.0 m)', metres: 2.0 },
  { code: '2.2m', label: '2.2 m', metres: 2.2 },
  { code: '2.5m', label: 'High clearance (2.5 m)', metres: 2.5 },
  { code: '3.0m', label: 'Extra high (3.0 m)', metres: 3.0 },
];
/** heightMetres(h) >= 2.5 is high clearance (3.0 m yes, 2.2 m no). */
export const HIGH_CLEARANCE_M = 2.5;
export const PARKING_TYPES: FieldOption[] = [
  { code: 'GROUND', label: 'Ground' },
  { code: 'PUZZLE', label: 'Puzzle' },
  { code: 'STACK', label: 'Stack' },
];
// Fixed list until O-1 (levels per site)
export const LEVELS: FieldOption[] = [
  { code: 'B1', label: 'Basement B1' },
  { code: 'B2', label: 'Basement B2' },
  { code: 'B3', label: 'Basement B3' },
  { code: 'Ground', label: 'Ground' },
  { code: 'Driveway', label: 'Driveway' },
];
export const SLOT_STATUSES: FieldOption[] = [
  { code: 'VACANT', label: 'Vacant' },
  { code: 'OCCUPIED', label: 'Occupied' },
  { code: 'RESERVED', label: 'Reserved' },
  { code: 'MAINTENANCE', label: 'Maintenance' },
];

const LISTS: { [F in SlotField]: FieldOption[] } = {
  slotType: SLOT_TYPES, allocation: ALLOCATIONS, height: HEIGHTS, parkingType: PARKING_TYPES, basement: LEVELS, status: SLOT_STATUSES,
};

/** Whole-value aliases (compared after trim, upper-case, collapsed spaces). Never substring tests. */
const ALIASES: { [F in SlotField]?: { [key: string]: string } } = {
  slotType: {
    'COMPACT SUV': 'CSUV',
    'TWO WHEELER': 'TWO_WHEELER', 'TWO-WHEELER': 'TWO_WHEELER', '2W': 'TWO_WHEELER',
    'EV CHARGING BAY': 'EV',
    'SUV (HIGH CLEARANCE)': 'SUV',
  },
  allocation: {
    'EMPLOYEES': 'EMPLOYEE',
    'CAR POOLING': 'CAR_POOLING', 'CARPOOLING': 'CAR_POOLING',
    // the PM label map (PRD v1.2)
    'GENERAL EMPLOYEE': 'EMPLOYEE', 'EXECUTIVE & VIP': 'VIP', 'VISITOR / GUEST': 'VISITOR', 'EV CHARGING ONLY': 'EMPLOYEE',
  },
  basement: { 'BASEMENT B1': 'B1', 'BASEMENT B2': 'B2', 'BASEMENT B3': 'B3' },
};

const norm = (raw: unknown): string => String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' ').trim().toUpperCase();

function findOption(field: SlotField, v: unknown): FieldOption | null {
  const list = LISTS[field];
  for (let i = 0; i < list.length; i++) if (list[i].code === v) return list[i];
  return null;
}

/** Exact code (case-sensitive). */
export function isCode(field: SlotField, v: unknown): boolean {
  return findOption(field, v) !== null;
}

/** The label, or "<value> (old)" for a value that is not in the list. Empty stays empty. */
export function labelFor(field: SlotField, v: unknown): string {
  const o = findOption(field, v);
  if (o) return o.label;
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s === '' ? '' : s + ' (old)';
}

/**
 * Height text -> metres: '2.5m' -> 2.5; legacy 'High Clearance (2.5m)' -> 2.5; '2.5 m' / '2.5' / '2m' -> number; anything else NaN.
 * The text must be: optional label words, one number, optional m, optional closing bracket (so 'Puzzle 2-Tier' is NaN).
 */
export function heightMetres(raw: unknown): number {
  const m = /^(?:[A-Z][A-Z ]*)?\(?\s*(\d+(?:\.\d+)?)\s*M?\s*\)?$/.exec(norm(raw));
  return m ? parseFloat(m[1]) : NaN;
}

/** Import / normalise: the code for a code, a label or a known alias (any case, spacing); null when unknown (never guessed). */
export function toCode(field: SlotField, raw: unknown): string | null {
  const key = norm(raw);
  if (key === '') return null;
  if (field === 'height') {
    const metres = heightMetres(raw);
    if (isNaN(metres)) return null;
    for (let i = 0; i < HEIGHTS.length; i++) if (Math.abs(HEIGHTS[i].metres - metres) < 0.001) return HEIGHTS[i].code;
    return null;
  }
  const list = LISTS[field];
  for (let i = 0; i < list.length; i++) {
    if (norm(list[i].code) === key || norm(list[i].label) === key) return list[i].code;
  }
  const alias = ALIASES[field];
  if (alias && Object.prototype.hasOwnProperty.call(alias, key)) return alias[key];
  return null; // includes NOT_AVAILABLE: legacy, never accepted as new input
}

export interface SlotFilters { basement?: string; status?: string; search?: string }
interface SlotLike {
  slotNumber?: string; floorLocation?: string; currentVehicle?: string | null; basement?: string; status?: string;
  slotType?: string; height?: string; parkingType?: string; allocation?: string; lengthM?: number; palletLevel?: number;
}

/** The Inventory table's filter (also used by the CSV export). 'ALL' or empty = no filter. */
export function slotMatchesFilters(slot: SlotLike, f: SlotFilters): boolean {
  if (f.basement && f.basement !== 'ALL' && slot.basement !== f.basement) return false;
  if (f.status && f.status !== 'ALL' && slot.status !== f.status) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hit = (v: unknown) => !!v && String(v).toLowerCase().indexOf(q) !== -1;
    if (!hit(slot.slotNumber) && !hit(slot.floorLocation) && !hit(slot.currentVehicle)) return false;
  }
  return true;
}

export const INVENTORY_CSV_COLUMNS = ['Slot number', 'Level', 'Floor location', 'Vehicle type', 'Height', 'Parking type', 'Allocation', 'Status', 'Current occupant', 'Length (m)', 'Pallet level'];

/** The table's cells = the CSV row (labels; legacy values as "<value> (old)"). */
export function inventoryRow(slot: SlotLike): string[] {
  return [
    slot.slotNumber || '',
    labelFor('basement', slot.basement),
    slot.floorLocation || '',
    labelFor('slotType', slot.slotType),
    labelFor('height', slot.height),
    labelFor('parkingType', slot.parkingType),
    labelFor('allocation', slot.allocation),
    labelFor('status', slot.status),
    slot.currentVehicle ? String(slot.currentVehicle) : '-',
    slot.lengthM === undefined || slot.lengthM === null ? '' : String(slot.lengthM),
    slot.palletLevel === undefined || slot.palletLevel === null ? '' : String(slot.palletLevel),
  ];
}
