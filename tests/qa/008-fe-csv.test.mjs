// 008 F9 (frontend-dev): the Zone column in the Inventory CSV (AC-13): export = table, import preview rules, header map, round trip on the real routes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, client, MASTER_EMAIL } from './support/pf006.mjs';
import { previewSlotCsv, sendableRows, mergeServerRows, sampleCsv, TEMPLATE_HELP, IMPORT_ORDER } from '../../src/utils/slotCsv.ts';
import { INVENTORY_CSV_COLUMNS, inventoryRow } from '../../src/utils/slotFields.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, '..', '..', p), 'utf8');
const HEAD = 'Slot number,Level,Zone,Floor location,Vehicle type,Height,Parking type,Allocation,Status';
const OLD_HEAD = 'Slot number,Level,Floor location,Vehicle type,Height,Parking type,Allocation,Status';
const csv = (...lines) => [HEAD, ...lines].join('\n');

test('T-F9 the Zone column sits right after Level in the header, the row and the help text', () => {
  assert.deepEqual(INVENTORY_CSV_COLUMNS.slice(0, 4), ['Slot number', 'Level', 'Zone', 'Floor location']);
  assert.equal(INVENTORY_CSV_COLUMNS.length, 12);
  assert.match(TEMPLATE_HELP, /Zone \(optional, two-wheeler slots only/);
  assert.deepEqual(IMPORT_ORDER, ['slotNumber', 'basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation', 'status', 'lengthM', 'palletLevel'], 'a file without a header keeps the old order');
});

test('T-F9 a Zone cell on a two-wheeler row sets puzzleNumber "{Level}-{Zone}" when the slot number agrees', () => {
  const [r] = previewSlotCsv(csv('B1-Z1-007,Basement B1,z1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant'), []);
  assert.equal(r.action, 'add', JSON.stringify(r.errors));
  assert.equal(r.slot.puzzleNumber, 'B1-Z1');
  assert.equal(r.slot.slotNumber, 'B1-Z1-007');
  const [g] = previewSlotCsv(csv('ground-z9-001,Ground,Z9,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant'), []);
  assert.equal(g.action, 'add', JSON.stringify(g.errors)); assert.equal(g.slot.puzzleNumber, 'GROUND-Z9');
});

test('T-F9 a blank Zone changes nothing: no puzzleNumber is sent (old files, unzoned slots, four-wheelers)', () => {
  const rows = previewSlotCsv(csv('B2-2W-01,B2,,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant', 'B1-P01-S1,B1,,North,SUV,2.0m,Puzzle,Employees,Vacant'), []);
  assert.deepEqual(rows.map((r) => r.action), ['add', 'add']);
  assert.ok(rows.every((r) => !('puzzleNumber' in r.slot)));
  const old = previewSlotCsv(`${OLD_HEAD}\nB2-2W-01,B2,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant`, []);
  assert.equal(old[0].action, 'add', 'a file from before 008 (no Zone column) still imports');
  assert.ok(!('puzzleNumber' in old[0].slot));
});

test('T-F9 row errors: Zone on a four-wheeler, a bad zone name, a number that does not agree, a level that does not agree', () => {
  const rows = previewSlotCsv(csv(
    'B1-Z1-001,B1,Z1,Rack,SUV,2.0m,Ground,Employees,Vacant',
    'B1-Z1-001,B1,Z-1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
    'B1-Z1-001,B1,ABCDEFG,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
    'B1-Z2-001,B1,Z1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
    'B1-Z1-1000,B1,Z1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
    'B1-Z1-1,B1,Z1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
    'B2-Z1-001,B1,Z1,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant',
  ), []);
  assert.deepEqual(rows.map((r) => r.action), Array(7).fill('error'));
  assert.match(rows[0].errors[0], /Zone "Z1" is for two-wheeler slots only\. Clear the Zone cell, or set Vehicle type to Two-wheeler\./);
  assert.match(rows[1].errors[0], /Zone "Z-1" must be 1 to 6 capital letters or digits, with no dash/);
  assert.match(rows[2].errors[0], /Zone "ABCDEFG"/);
  assert.match(rows[3].errors[0], /Slot number must be B1-Z1-001 to B1-Z1-999 for zone B1-Z1\./);
  assert.match(rows[4].errors[0], /Slot number must be B1-Z1-001 to B1-Z1-999/);
  assert.match(rows[5].errors[0], /Slot number must be B1-Z1-001 to B1-Z1-999/);
  assert.match(rows[6].errors[0], /Slot number must be B1-Z1-001 to B1-Z1-999/);
  assert.ok(rows.every((r) => r.slot === undefined), 'an error row is never sent');
});

test('T-F9 the Zone check never repeats a Level or Vehicle type error', () => {
  const [r] = previewSlotCsv(csv('B1-Z1-001,B1,Z1,Rack,Truck,2.0m,Ground,Employees,Vacant'), []);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /Vehicle type "Truck" is not one of/);
});

test('T-F9 the sample CSV has the Zone column, a zoned two-wheeler row, and previews clean', () => {
  const lines = sampleCsv().split('\n');
  assert.match(lines[0], /,PalletLevel,Zone$/);
  const rows = previewSlotCsv(sampleCsv(), []);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.action === 'add'), JSON.stringify(rows.map((r) => r.errors)));
  assert.equal(rows[3].slot.puzzleNumber, 'B3-Z1');
  assert.ok(rows.slice(0, 3).every((r) => !('puzzleNumber' in r.slot)));
});

test('T-F9 static: the import preview table shows the zone', () => {
  const c = src('src/components/InventoryMaster.tsx');
  assert.match(c, /<th className="p-2">Zone<\/th>/);
  assert.match(c, /p\.slot\?\.puzzleNumber \? p\.slot\.puzzleNumber\.split\('-'\)\.pop\(\)/);
});

let srv; let c; let A;
before(async () => { srv = await startServer(); c = client(srv); await c.login('master', MASTER_EMAIL); A = await c.onboard('FCS', 'FE CSV Zone'); });
after(() => srv?.stop());

test('T-F9 AC-13 round trip on the real routes: the sample imports; the export carries Zone; the export imports back without changing a zone', async () => {
  const first = previewSlotCsv(sampleCsv(), await c.slots(A.id));
  const up = await c.post('master', '/slots/bulk-upload', { slots: sendableRows(first).map((p) => ({ ...p.slot, siteId: A.id })) }, { site: A.id });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.deepEqual(mergeServerRows(first, up.body.result.rows).map((r) => r.result), ['added', 'added', 'added', 'added'], JSON.stringify(up.body.result));
  // an old unzoned two-wheeler slot and a zoned one made by the form
  const mk = (n, extra) => c.post('master', '/slots/save', { slot: { slotNumber: n, basement: 'B2', floorLocation: 'Rack', slotType: 'TWO_WHEELER', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', ...extra } }, { site: A.id });
  assert.equal((await mk('B2-2W-01', {})).status, 200);
  assert.equal((await mk('B2-Z4-002', { puzzleNumber: 'B2-Z4' })).status, 200);

  const exp = await c.get('master', '/export/reports?type=slots', { site: A.id });
  assert.equal(exp.status, 200);
  const lines = exp.text.trim().split('\n');
  assert.equal(lines[0], INVENTORY_CSV_COLUMNS.map((n) => `"${n}"`).join(','));
  const cell = (num) => { const l = lines.find((x) => x.startsWith(`"${num}"`)); return l.split('","')[2]; };
  assert.equal(cell('B3-Z1-101'), 'Z1'); assert.equal(cell('B2-Z4-002'), 'Z4'); assert.equal(cell('B2-2W-01'), ''); assert.equal(cell('B1-P01-S1'), '');
  // export = table: the same row text
  const slots = await c.slots(A.id);
  const z = slots.find((s) => s.slotNumber === 'B2-Z4-002');
  assert.equal(inventoryRow(z)[2], 'Z4');

  const snapshot = () => c.slots(A.id).then((a) => JSON.stringify(a.map((s) => [s.slotNumber, s.puzzleNumber ?? null, s.basement, s.slotType]).sort()));
  const beforeState = await snapshot();
  const back = previewSlotCsv(exp.text, slots);
  assert.ok(back.every((r) => r.action === 'update'), JSON.stringify(back.map((r) => [r.slotNumber, r.action, r.errors])));
  const zonedBack = back.find((r) => r.slotNumber === 'B2-Z4-002');
  assert.equal(zonedBack.slot.puzzleNumber, 'B2-Z4');
  assert.ok(!('puzzleNumber' in back.find((r) => r.slotNumber === 'B2-2W-01').slot), 'the unzoned slot stays unzoned');
  const up2 = await c.post('master', '/slots/bulk-upload', { slots: sendableRows(back).map((p) => ({ ...p.slot, siteId: A.id })) }, { site: A.id });
  assert.equal(up2.status, 200, JSON.stringify(up2.body));
  assert.ok(up2.body.result.rows.every((r) => r.result === 'updated'), JSON.stringify(up2.body.result));
  assert.equal(await snapshot(), beforeState, 'importing the export changes no zone and no name');

  // a blank Zone on a zoned slot changes nothing
  const blank = previewSlotCsv(csv('B2-Z4-002,B2,,Rack,Two-wheeler,2.0m,Ground,Employees,Vacant'), slots);
  assert.equal(blank[0].action, 'update');
  await c.post('master', '/slots/bulk-upload', { slots: [{ ...blank[0].slot, siteId: A.id }] }, { site: A.id });
  assert.equal((await c.slots(A.id)).find((s) => s.slotNumber === 'B2-Z4-002').puzzleNumber, 'B2-Z4');
});
