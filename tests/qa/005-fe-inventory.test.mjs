// 005 F2 (frontend-dev): Inventory table = CSV, filters, CSV import preview and results, export link.
// src/utils/slotCsv.ts + slotFields.ts, a round trip against the real routes, and static checks on the component.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, client, slot, MASTER_EMAIL } from './support/pf006.mjs';
import { previewSlotCsv, sendableRows, mergeServerRows, sampleCsv, inventoryExportUrl, splitCsvLine } from '../../src/utils/slotCsv.ts';
import { inventoryRow, slotMatchesFilters, compareInventory, INVENTORY_CSV_COLUMNS, toCode } from '../../src/utils/slotFields.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, '..', '..', p), 'utf8');
const HEAD = 'Slot number,Level,Floor location,Vehicle type,Height,Parking type,Allocation,Status';

test('F2 preview maps labels and codes, any case, to codes (AC-05)', () => {
  const rows = previewSlotCsv(`${HEAD}
b1-p01-s01,basement b1,North Wing,Compact SUV,High clearance (2.5 m),puzzle,Car Pooling,vacant
B2-1,B2,South,csuv,2.2 m,GROUND,employees,Maintenance
B3-1,Ground,East,Two wheeler,Extra high (3.0 m),Stack,VIP,`, []);
  assert.deepEqual(rows.map((r) => r.action), ['add', 'add', 'add']);
  assert.deepEqual(rows[0].slot, { slotNumber: 'B1-P01-S01', basement: 'B1', floorLocation: 'North Wing', slotType: 'CSUV', height: '2.5m', parkingType: 'PUZZLE', allocation: 'CAR_POOLING', status: 'VACANT' });
  assert.equal(rows[1].slot.slotType, 'CSUV', 'CSUV is never read as SUV');
  assert.equal(rows[1].slot.height, '2.2m'); assert.equal(rows[1].slot.allocation, 'EMPLOYEE'); assert.equal(rows[1].slot.status, 'MAINTENANCE');
  assert.equal(rows[2].slot.height, '3.0m'); assert.equal('status' in rows[2].slot, false, 'empty status: the server defaults it');
});

test('F2 unknown values are errors naming the column and value; nothing is guessed; the row is not sent', () => {
  const rows = previewSlotCsv(`${HEAD}
X-1,B1,Floor,Truck,2.4m,Puzzle 2-Tier,NOT_AVAILABLE,Vacant
X-2,B9,Floor,SUV,2.0m,GROUND,VIP,Vacant
X-3,B1,,SUV,2.0m,GROUND,VIP,Vacant`, []);
  assert.deepEqual(rows.map((r) => r.action), ['error', 'error', 'error']);
  assert.match(rows[0].errors.join('|'), /Vehicle type "Truck"/); assert.match(rows[0].errors.join('|'), /Height "2\.4m"/);
  assert.match(rows[0].errors.join('|'), /Parking type "Puzzle 2-Tier"/); assert.match(rows[0].errors.join('|'), /Allocation "NOT_AVAILABLE"/);
  assert.match(rows[1].errors.join('|'), /Level "B9"/);
  assert.deepEqual(rows[2].errors, ['Floor location is required.']);
  assert.equal(sendableRows(rows).length, 0);
  assert.equal(rows[0].slot, undefined);
});

test('F2 a number repeated in the file is an error on every occurrence; an existing number is an update (AC-13)', () => {
  const rows = previewSlotCsv(`${HEAD}
D-1,B1,F,SUV,2.0m,GROUND,VIP,Vacant
d-1 ,B1,F,SUV,2.0m,GROUND,VIP,Vacant
E-1,B1,F,SUV,2.0m,GROUND,VIP,Vacant
N-1,B1,F,SUV,2.0m,GROUND,VIP,Vacant`, [{ slotNumber: 'e-1' }]);
  assert.deepEqual(rows.map((r) => r.action), ['error', 'error', 'update', 'add']);
  assert.match(rows[0].errors[0], /repeated in this file \(rows 1, 2\)/); assert.match(rows[1].errors[0], /rows 1, 2/);
  assert.deepEqual(sendableRows(rows).map((r) => r.slotNumber), ['E-1', 'N-1']);
});

test('F2 a file without a header uses the template order; a floor text "Level 1" is not a header; quotes are honoured', () => {
  const rows = previewSlotCsv('B1-P01-S1,B1,"Level 1, North",SEDAN,2.0m,PUZZLE,EMPLOYEE,Vacant,5.0,2', []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slot, { slotNumber: 'B1-P01-S1', basement: 'B1', floorLocation: 'Level 1, North', slotType: 'SEDAN', height: '2.0m', parkingType: 'PUZZLE', allocation: 'EMPLOYEE', status: 'VACANT', lengthM: '5.0', palletLevel: '2' });
  assert.deepEqual(splitCsvLine('a,"b ""c"", d",e'), ['a', 'b "c", d', 'e']);
  // the export's own header (incl. Current occupant) imports back
  const back = previewSlotCsv(`"${INVENTORY_CSV_COLUMNS.join('","')}"\n"EXP-1","Basement B2","North","EV","Extra high (3.0 m)","Ground","Handicap","Vacant","-","5.5","1"`, []);
  assert.equal(back[0].action, 'add', JSON.stringify(back[0]));
  assert.deepEqual(back[0].slot, { slotNumber: 'EXP-1', basement: 'B2', floorLocation: 'North', slotType: 'EV', height: '3.0m', parkingType: 'GROUND', allocation: 'HANDICAP', status: 'VACANT', lengthM: '5.5', palletLevel: '1' });
});

test('F2 the sample CSV uses codes from slotFields and previews without errors', () => {
  const rows = previewSlotCsv(sampleCsv(), []);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.action === 'add'), JSON.stringify(rows.map((r) => r.errors)));
  for (const line of sampleCsv().split('\n').slice(1)) {
    const c = line.split(',');
    assert.equal(toCode('slotType', c[3]), c[3]); assert.equal(toCode('height', c[4]), c[4]); assert.equal(toCode('allocation', c[6]), c[6]);
  }
});

test('F2 export link carries the table filters; ALL and empty are left out', () => {
  assert.equal(inventoryExportUrl('site-1', { basement: 'B2', status: 'ALL', search: 'exp 1' }, 'tok'),
    '/api/v1/export/reports?type=slots&siteId=site-1&basement=B2&search=exp%201&token=tok');
  assert.equal(inventoryExportUrl('site-1', { basement: 'ALL', status: 'VACANT', search: '' }), '/api/v1/export/reports?type=slots&siteId=site-1&status=VACANT');
});

test('F2 legacy values read "<value> (old)" in the table cells', () => {
  const row = inventoryRow({ slotNumber: 'L-1', basement: 'B1', floorLocation: 'F', slotType: 'Compact SUV', height: 'Standard (2.0m)', parkingType: 'PUZZLE', allocation: 'NOT_AVAILABLE', status: 'VACANT', currentVehicle: null });
  assert.deepEqual(row, ['L-1', 'Basement B1', 'F', 'Compact SUV (old)', 'Standard (2.0m) (old)', 'Puzzle', 'NOT_AVAILABLE (old)', 'Vacant', '-', '', '']);
});

let srv; let c; let A;
before(async () => { srv = await startServer(); c = client(srv); await c.login('master', MASTER_EMAIL); A = await c.onboard('FEB', 'FE Site B'); });
after(() => srv?.stop());

test('F2 round trip: upload from the preview, server rows renumbered to preview rows; the export equals the table rows (table = CSV)', async () => {
  const text = `${HEAD}
U-1,B1,Floor 1,Compact SUV,High clearance (2.5 m),Puzzle,Car Pooling,Vacant
U-2,B2,Floor 2,Truck,2.0m,GROUND,VIP,Vacant
U-3,B2,Floor 3,Hatchback,2.2 m,GROUND,Visitor,Maintenance
U-3,B2,Floor 3,Hatchback,2.2 m,GROUND,Visitor,Maintenance
U-4,Driveway,Gate,EV,Extra high (3.0 m),Stack,Handicap,Vacant`;
  const preview = previewSlotCsv(text, await c.slots(A.id));
  assert.deepEqual(preview.map((p) => p.action), ['add', 'error', 'error', 'error', 'add']);
  const sent = sendableRows(preview);
  const up = await c.post('master', '/slots/bulk-upload', { slots: sent.map((p) => ({ ...p.slot, siteId: A.id })) }, { site: A.id });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const merged = mergeServerRows(preview, up.body.result.rows);
  assert.deepEqual(merged.map((m) => m.result), ['added', 'error', 'error', 'error', 'added']);
  assert.equal(merged[4].row, 5, 'the server answered its 2nd row; shown as the file row 5');
  // a second upload of U-1: an update, not a second slot
  const again = previewSlotCsv(text.split('\n').slice(0, 2).join('\n'), await c.slots(A.id));
  assert.equal(again[0].action, 'update');
  const up2 = await c.post('master', '/slots/bulk-upload', { slots: sendableRows(again).map((p) => ({ ...p.slot, siteId: A.id })) }, { site: A.id });
  assert.equal(up2.body.result.rows[0].result, 'updated');
  assert.equal((await c.slots(A.id)).filter((s) => s.slotNumber === 'U-1').length, 1);

  // table = CSV: the rows the table would show for a filter are exactly the exported rows, in the same order
  await c.post('master', '/slots/save', { slot: slot('U-5', { height: '2.0m', basement: 'B2', status: 'OCCUPIED' }) }, { site: A.id });
  const all = await c.slots(A.id);
  for (const f of [{ basement: 'ALL', status: 'ALL', search: '' }, { basement: 'B2', status: 'ALL', search: '' }, { basement: 'ALL', status: 'VACANT', search: 'u-' }, { basement: 'Driveway', status: 'ALL', search: 'gate' }]) {
    const table = all.filter((s) => slotMatchesFilters(s, f)).sort(compareInventory).map((s) => inventoryRow(s));
    const url = inventoryExportUrl(A.id, f).replace('/api/v1', '');
    const csv = await c.get('master', url, { site: A.id });
    assert.equal(csv.status, 200);
    const lines = csv.text.trim().split('\n');
    assert.equal(lines[0], INVENTORY_CSV_COLUMNS.map((n) => `"${n}"`).join(','));
    const exported = lines.slice(1).map((l) => splitCsvLine(l));
    assert.deepEqual(exported, table, `filters ${JSON.stringify(f)}`);
  }
});

test('F2 static: the table and filters come from slotFields; nothing is listed twice in the component', () => {
  const comp = src('src/components/InventoryMaster.tsx');
  assert.doesNotMatch(comp, /<option value="(?!ALL")/, 'the only option written by hand is "All": every other one is built from slotFields');
  assert.match(comp, /INVENTORY_CSV_COLUMNS\.map/);
  assert.match(comp, /inventoryRow\(slot\)/);
  assert.match(comp, /slotMatchesFilters\(s, tableFilters\)\)\.sort\(compareInventory\)/);
  assert.match(comp, /optionsFor\('basement'\)/); assert.match(comp, /optionsFor\('status'\)/);
  assert.doesNotMatch(comp, /rawType\.includes|General Employee|Executive & VIP|Puzzle 2-Tier/, 'no string-matching import of types');
  assert.doesNotMatch(comp, /'VACANT', 'OCCUPIED'/, 'no status list');
  const csvSrc = src('src/utils/slotCsv.ts');
  assert.doesNotMatch(csvSrc, /'SEDAN'|'EMPLOYEE'|'PUZZLE'|'2\.0m'/, 'slotCsv keeps no list of values (sample uses slotFields by index)');
});

test('F2 round 2 (finding 5): Download CSV shows only for a viewer with ANALYTICS:canExport', () => {
  const comp = src('src/components/InventoryMaster.tsx');
  assert.match(comp, /canExport\?: boolean;/);
  assert.match(comp, /canExport = false,/, 'no right is the default: the button stays hidden');
  const at = comp.indexOf('onClick={handleDownloadCsv}');
  assert.ok(at > 0, 'button found');
  assert.match(comp.slice(comp.lastIndexOf('\n', at - 40) - 60, at), /\{canExport && \(\s*<button\s*$/, 'the button is inside {canExport && (...)}');
  const app = src('src/App.tsx');
  assert.match(app, /<InventoryMaster [^>]*canExport=\{getModuleRights\(viewer, currentRole, 'ANALYTICS'\)\.canExport\}/, 'App passes the export right of the module the route checks');
});

test('F2 round 2 (finding 5): the export right the console reads is the one the route checks (ANALYTICS)', () => {
  assert.match(src('server.ts'), /app\.get\('\/api\/v1\/export\/reports', requirePermission\('ANALYTICS', 'canExport'\)/);
  assert.match(inventoryExportUrl('S1', {}), /^\/api\/v1\/export\/reports\?type=slots/);
});
