// 005 F2: the Inventory CSV import preview (AC-05, AC-13) and the export link (AC-06). Pure.
// Every list, label and code comes from slotFields.ts. The server repeats every check (/slots/bulk-upload).
import { toCode, INVENTORY_CSV_COLUMNS, optionsFor, SLOT_FIELD_NAMES } from './slotFields.ts';
import type { SlotField } from './slotFields.ts';

type Key = 'slotNumber' | 'basement' | 'floorLocation' | 'slotType' | 'height' | 'parkingType' | 'allocation' | 'status' | 'lengthM' | 'palletLevel';
const LIST_KEYS: { key: Key; field: SlotField; name: string }[] = [
  { key: 'basement', field: 'basement', name: SLOT_FIELD_NAMES.basement },
  { key: 'slotType', field: 'slotType', name: SLOT_FIELD_NAMES.slotType },
  { key: 'height', field: 'height', name: SLOT_FIELD_NAMES.height },
  { key: 'parkingType', field: 'parkingType', name: SLOT_FIELD_NAMES.parkingType },
  { key: 'allocation', field: 'allocation', name: SLOT_FIELD_NAMES.allocation },
  { key: 'status', field: 'status', name: SLOT_FIELD_NAMES.status },
];
const REQUIRED: { key: Key; name: string }[] = [
  { key: 'slotNumber', name: 'Slot number' }, { key: 'basement', name: SLOT_FIELD_NAMES.basement }, { key: 'floorLocation', name: 'Floor location' },
  { key: 'slotType', name: SLOT_FIELD_NAMES.slotType }, { key: 'height', name: SLOT_FIELD_NAMES.height }, { key: 'parkingType', name: SLOT_FIELD_NAMES.parkingType }, { key: 'allocation', name: SLOT_FIELD_NAMES.allocation },
];

/** Column order of a file without a header row (the template order). */
export const IMPORT_ORDER: Key[] = ['slotNumber', 'basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation', 'status', 'lengthM', 'palletLevel'];
// The export's own columns (INVENTORY_CSV_COLUMNS), so a downloaded file imports back; 'Current occupant' is ignored.
const EXPORT_KEYS: (Key | null)[] = ['slotNumber', 'basement', null /* Zone: read from task 9 */, 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation', 'status', null, 'lengthM', 'palletLevel'];
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_KEYS: { [name: string]: Key | null } = {};
INVENTORY_CSV_COLUMNS.forEach((name, i) => { HEADER_KEYS[squash(name)] = EXPORT_KEYS[i]; });
// older template names
['slotnumber:slotNumber', 'basement:basement', 'floorlocation:floorLocation', 'location:floorLocation', 'slottype:slotType', 'type:slotType',
  'parkingtype:parkingType', 'mechanism:parkingType', 'lengthm:lengthM', 'palletlevel:palletLevel'].forEach((p) => { const a = p.split(':'); HEADER_KEYS[a[0]] = a[1] as Key; });

/** One CSV line -> cells. Handles "quoted, cells" and "" inside quotes. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export type PreviewAction = 'add' | 'update' | 'error';
export interface PreviewRow {
  /** 1-based data row (the header row is not counted) */
  row: number;
  slotNumber: string;
  action: PreviewAction;
  errors: string[];
  /** the row as the server expects it: codes for every list field. Present for add / update rows. */
  slot?: { [key: string]: string };
}
const numKey = (n: string): string => n.trim().toUpperCase();

/**
 * Preview of a pasted / uploaded CSV before anything is sent.
 * - codes OR labels, any case, through toCode; an unknown value is an error naming the column and the value (never guessed);
 * - a slot number repeated in the file: every occurrence is an error, none is sent;
 * - a number that already exists at the site is an "update", otherwise an "add".
 * `existing` is the slot list of the site being uploaded to.
 */
export function previewSlotCsv(text: string, existing: { slotNumber?: string }[]): PreviewRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  // A header row is a first line whose cells name the columns (a floor text like "Level 1 Stacker" is not a header).
  const named = splitCsvLine(lines[0]).map((h) => (Object.prototype.hasOwnProperty.call(HEADER_KEYS, squash(h)) ? HEADER_KEYS[squash(h)] : null));
  const hasHeader = named.indexOf('slotNumber') !== -1;
  const order: (Key | null)[] = hasHeader ? named : IMPORT_ORDER;
  const known: { [num: string]: boolean } = {};
  for (let i = 0; i < existing.length; i++) if (existing[i].slotNumber) known[numKey(existing[i].slotNumber as string)] = true;

  const rows: PreviewRow[] = [];
  const seen: { [num: string]: number[] } = {};
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get: { [k: string]: string } = {};
    for (let c = 0; c < order.length; c++) { const k = order[c]; if (k && cells[c] !== undefined && cells[c] !== '') get[k] = cells[c]; }
    const row = rows.length + 1;
    const errors: string[] = [];
    const slot: { [key: string]: string } = {};
    for (let r = 0; r < REQUIRED.length; r++) if (!get[REQUIRED[r].key]) errors.push(`${REQUIRED[r].name} is required.`);
    for (let l = 0; l < LIST_KEYS.length; l++) {
      const raw = get[LIST_KEYS[l].key];
      if (!raw) continue;
      const code = toCode(LIST_KEYS[l].field, raw);
      if (code === null) {
        const allowed = optionsFor(LIST_KEYS[l].field).map((o) => o.label).join(', ');
        errors.push(`${LIST_KEYS[l].name} "${raw}" is not one of: ${allowed}.`);
      } else slot[LIST_KEYS[l].key] = code;
    }
    const num = get.slotNumber ? numKey(get.slotNumber) : '';
    if (num) { slot.slotNumber = num; (seen[num] = seen[num] || []).push(row); }
    if (get.floorLocation) slot.floorLocation = get.floorLocation;
    if (get.lengthM) slot.lengthM = get.lengthM;
    if (get.palletLevel) slot.palletLevel = get.palletLevel;
    rows.push({ row, slotNumber: num, action: errors.length ? 'error' : (known[num] ? 'update' : 'add'), errors, slot: errors.length ? undefined : slot });
  }
  for (let i = 0; i < rows.length; i++) {
    const same = seen[rows[i].slotNumber];
    if (rows[i].slotNumber && same && same.length > 1) {
      rows[i].action = 'error'; rows[i].slot = undefined;
      rows[i].errors.push(`Slot number repeated in this file (rows ${same.join(', ')}).`);
    }
  }
  return rows;
}

/** The rows that can be sent. `rows[i]` of the server's answer is the i-th of these, so `sentRows` maps it back to the preview row. */
export function sendableRows(preview: PreviewRow[]): PreviewRow[] {
  return preview.filter((p) => p.action !== 'error');
}

export interface ServerRowResult { row: number; slotNumber?: string; result: string; errors?: string[] }
/** The server's per-row results, renumbered to the preview's row numbers. Rows never sent keep their preview errors. */
export function mergeServerRows(preview: PreviewRow[], server: ServerRowResult[]): { row: number; slotNumber: string; result: string; errors: string[] }[] {
  const sent = sendableRows(preview);
  const out = preview.map((p) => ({ row: p.row, slotNumber: p.slotNumber, result: p.action === 'error' ? 'error' : 'pending', errors: p.errors.slice() }));
  for (let i = 0; i < server.length; i++) {
    const target = sent[server[i].row - 1];
    if (!target) continue;
    const o = out[target.row - 1];
    o.result = server[i].result; o.errors = (server[i].errors || []).slice();
  }
  return out;
}

/** Template CSV. Header names are the template's; values are codes taken from slotFields. */
export function sampleCsv(): string {
  const c = (field: SlotField, i: number): string => optionsFor(field)[i].code;
  const head = 'SlotNumber,Basement,FloorLocation,SlotType,Height,ParkingType,Allocation,Status,LengthM,PalletLevel';
  const line = (num: string, level: number, floor: string, type: number, height: number, park: number, alloc: number, len: string, pallet: string) =>
    [num, c('basement', level), floor, c('slotType', type), c('height', height), c('parkingType', park), c('allocation', alloc), c('status', 0), len, pallet].join(',');
  return [head,
    line('B1-P01-S1', 0, 'North Wing Level 1 Stacker', 2, 1, 1, 0, '5.0', '1'),
    line('B1-P01-S2', 0, 'North Wing Level 2 Stacker', 0, 3, 1, 4, '5.2', '2'),
    line('B2-EV-001', 1, 'South Bay EV Charging Station', 5, 1, 0, 0, '5.5', ''),
    line('B3-2W-101', 2, 'East Bay Two Wheeler Rack', 4, 0, 0, 0, '2.2', ''),
  ].join('\n');
}

/** Header names of the template, for the help text. */
export const TEMPLATE_HELP = 'SlotNumber, Basement, FloorLocation, SlotType, Height, ParkingType, Allocation, Status, LengthM (optional), PalletLevel (optional)';

/** The Inventory "Download CSV" link: the same route as Reports, with the table's filters. */
export function inventoryExportUrl(siteId: string, f: { basement?: string; status?: string; search?: string }, token?: string | null): string {
  let url = `/api/v1/export/reports?type=slots&siteId=${encodeURIComponent(siteId)}`;
  if (f.basement && f.basement !== 'ALL') url += `&basement=${encodeURIComponent(f.basement)}`;
  if (f.status && f.status !== 'ALL') url += `&status=${encodeURIComponent(f.status)}`;
  if (f.search) url += `&search=${encodeURIComponent(f.search)}`;
  if (token) url += `&token=${encodeURIComponent(token)}`;
  return url;
}
