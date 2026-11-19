// 008 F8: pure logic of "Bulk add two-wheeler slots" (AC-11): Level + Zone + From..To make B1-Z1-001 .. B1-Z1-040.
// The server repeats every check; `createOnly: true` makes a name that already exists a row error that is never updated.
import { buildSlotName, padSlotNo, SLOT_NO_MAX, SLOT_NO_MIN, ZONE_PATTERN } from './zones.ts';
import { autoFloorLocation, COPY_NUMBER_DIGITS, COPY_NUMBER_RANGE, COPY_ZONE_FORMAT } from './slotZoneForm.ts';

export const COPY_FROM_AFTER_TO = 'From must not be greater than To';
export const COPY_BULK_NAMES_EXIST = 'These slot names already exist in this site. Change the zone or the numbers.';

export interface BulkPlan {
  errors: { zone?: string; from?: string; to?: string };
  /** Built names in order, empty until Level, Zone, From and To are all valid. */
  names: string[];
  puzzleNumber: string | null;
  count: number;
  first: string | null;
  last: string | null;
  /** Names of `names` that exist already (compared upper-case); Confirm stays blocked while there is one. */
  clashes: string[];
  ready: boolean;
}

const numberError = (v: string): string | undefined => {
  const t = v.trim();
  if (t === '') return undefined;
  if (!/^\d+$/.test(t)) return COPY_NUMBER_DIGITS;
  return padSlotNo(t) === null ? COPY_NUMBER_RANGE : undefined;
};

/** Check the form and expand it. Errors are reported only for what was typed; `ready` needs everything valid and no clash. */
export function planBulkAdd(level: string, zone: string, from: string, to: string, existingNames: string[]): BulkPlan {
  const z = zone.trim().toUpperCase();
  const errors: BulkPlan['errors'] = {};
  if (z !== '' && !ZONE_PATTERN.test(z)) errors.zone = COPY_ZONE_FORMAT;
  const fe = numberError(from); if (fe) errors.from = fe;
  const te = numberError(to); if (te) errors.to = te;
  const a = Number(from.trim()), b = Number(to.trim());
  if (!errors.from && !errors.to && from.trim() !== '' && to.trim() !== '' && a > b) errors.to = COPY_FROM_AFTER_TO;
  const complete = level !== '' && z !== '' && from.trim() !== '' && to.trim() !== '';
  const none: BulkPlan = { errors, names: [], puzzleNumber: null, count: 0, first: null, last: null, clashes: [], ready: false };
  if (!complete || errors.zone || errors.from || errors.to || a < SLOT_NO_MIN || b > SLOT_NO_MAX) return none;
  const names: string[] = [];
  let puzzleNumber: string | null = null;
  for (let n = a; n <= b; n++) {
    const built = buildSlotName(level, z, n);
    if (!built) return none;
    puzzleNumber = built.puzzleNumber;
    names.push(built.slotNumber);
  }
  const have: { [name: string]: boolean } = {};
  for (let i = 0; i < existingNames.length; i++) have[String(existingNames[i] || '').trim().toUpperCase()] = true;
  const clashes = names.filter((n) => have[n]);
  return { errors, names, puzzleNumber, count: names.length, first: names[0], last: names[names.length - 1], clashes, ready: clashes.length === 0 };
}

export interface BulkCommon { basement: string; height: string; parkingType: string; allocation: string }
/** The rows sent in ONE request: codes for every list field, floor location "B1 · Zone Z1", status Vacant. */
export function bulkAddRows(plan: BulkPlan, common: BulkCommon, zone: string, siteId: string): { [key: string]: string }[] {
  const floor = autoFloorLocation(common.basement, zone);
  return plan.names.map((slotNumber) => ({
    slotNumber, basement: common.basement, floorLocation: floor, slotType: 'TWO_WHEELER', height: common.height, parkingType: common.parkingType,
    allocation: common.allocation, status: 'VACANT', puzzleNumber: plan.puzzleNumber as string, siteId,
  }));
}

export interface BulkOutcomeRow { slotNumber: string; result: string; errors: string[] }
export interface BulkOutcome { rows: BulkOutcomeRow[]; added: number; refused: number }
/** The server's per-row answer, mapped to the names sent (row i of the answer = name i). A name with no answer reads "pending". */
export function bulkOutcome(names: string[], serverRows: { row: number; result: string; errors?: string[] }[]): BulkOutcome {
  const byRow: { [row: number]: { result: string; errors: string[] } } = {};
  for (let i = 0; i < serverRows.length; i++) byRow[serverRows[i].row] = { result: serverRows[i].result, errors: (serverRows[i].errors || []).slice() };
  const rows = names.map((slotNumber, i) => {
    const r = byRow[i + 1];
    return { slotNumber, result: r ? r.result : 'pending', errors: r ? r.errors : [] };
  });
  return { rows, added: rows.filter((r) => r.result === 'added').length, refused: rows.filter((r) => r.result !== 'added').length };
}
