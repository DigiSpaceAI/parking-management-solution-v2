// 008 F8 (frontend-dev): Bulk add two-wheeler slots. Pure plan rules, then the payload the form sends against the real routes
// (zone check, createOnly, per-row answers), the "Set zone" save, and static checks of the modal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, client, MASTER_EMAIL } from './support/pf006.mjs';
import { planBulkAdd, bulkAddRows, bulkOutcome, COPY_FROM_AFTER_TO, COPY_BULK_NAMES_EXIST } from '../../src/utils/bulkAdd.ts';
import { zoneInputsOf, setZoneInputs, checkZoneForm, mapZoneSaveError } from '../../src/utils/slotZoneForm.ts';
import { inventoryRow } from '../../src/utils/slotFields.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, '..', '..', p), 'utf8');
const COMMON = { basement: 'B1', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE' };

test('T-F8 AC-11 Zone, From and To expand to padded names, with the first and last name and the count for the preview', () => {
  const p = planBulkAdd('B1', 'z1', '1', '40', []);
  assert.equal(p.count, 40); assert.equal(p.first, 'B1-Z1-001'); assert.equal(p.last, 'B1-Z1-040');
  assert.equal(p.names[8], 'B1-Z1-009'); assert.equal(p.puzzleNumber, 'B1-Z1'); assert.equal(p.ready, true);
  const one = planBulkAdd('B1', 'Z1', '7', '7', []);
  assert.deepEqual([one.count, one.first, one.last], [1, 'B1-Z1-007', 'B1-Z1-007']);
  assert.equal(planBulkAdd('Ground', 'Z9', '1', '2', []).first, 'GROUND-Z9-001');
  assert.equal(planBulkAdd('B1', 'Z1', '1', '999', []).count, 999);
});

test('T-F8 incomplete or wrong input: no names, the UX messages, and nothing to confirm', () => {
  const empty = planBulkAdd('', '', '', '', []);
  assert.deepEqual([empty.count, empty.ready, empty.errors], [0, false, {}]);
  assert.equal(planBulkAdd('B1', '', '1', '5', []).ready, false, 'no zone');
  assert.equal(planBulkAdd('B1', 'Z1', '1', '', []).ready, false, 'no To');
  assert.equal(planBulkAdd('B1', 'Z1', '5', '3', []).errors.to, COPY_FROM_AFTER_TO);
  assert.equal(planBulkAdd('B1', 'Z1', '5', '3', []).count, 0);
  assert.equal(planBulkAdd('B1', 'Z1', 'a', '3', []).errors.from, 'Slot number must be digits only');
  assert.match(planBulkAdd('B1', 'Z1', '0', '3', []).errors.from, /1 to 999/);
  assert.match(planBulkAdd('B1', 'Z1', '1', '1000', []).errors.to, /1 to 999/);
  assert.match(planBulkAdd('B1', 'Z-1', '1', '3', []).errors.zone, /no dash/);
  assert.equal(planBulkAdd('B1', 'Z-1', '1', '3', []).count, 0);
});

test('T-F8 AC-10 Confirm is blocked while any name already exists in the loaded inventory (any case)', () => {
  const p = planBulkAdd('B1', 'Z1', '1', '5', ['b1-z1-003', 'B1-Z2-001', ' B1-Z1-005 ']);
  assert.deepEqual(p.clashes, ['B1-Z1-003', 'B1-Z1-005']);
  assert.equal(p.ready, false); assert.equal(p.count, 5, 'the preview still shows what would be made');
  assert.equal(planBulkAdd('B1', 'Z1', '6', '9', ['B1-Z1-003']).ready, true);
  assert.match(COPY_BULK_NAMES_EXIST, /already exist/);
});

test('T-F8 the request: one array, built names, zone in puzzleNumber, floor location, codes only, the site', () => {
  const p = planBulkAdd('B1', 'Z1', '1', '3', []);
  const rows = bulkAddRows(p, COMMON, 'Z1', 'site-9');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { slotNumber: 'B1-Z1-001', basement: 'B1', floorLocation: 'B1 · Zone Z1', slotType: 'TWO_WHEELER', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT', puzzleNumber: 'B1-Z1', siteId: 'site-9' });
  assert.ok(rows.every((r) => r.puzzleNumber === 'B1-Z1' && !('id' in r)), 'no client-made id');
});

test('T-F8 the server answer row i belongs to name i; a missing answer reads pending', () => {
  const o = bulkOutcome(['A-1', 'A-2', 'A-3'], [{ row: 1, result: 'added' }, { row: 2, result: 'error', errors: ['Slot A-2 already exists at this site — edit that slot instead.'] }]);
  assert.deepEqual(o.rows.map((r) => r.result), ['added', 'error', 'pending']);
  assert.deepEqual([o.added, o.refused], [1, 2]);
  assert.equal(o.rows[1].errors.length, 1);
});

let srv; let c; let A;
before(async () => { srv = await startServer(); c = client(srv); await c.login('master', MASTER_EMAIL); A = await c.onboard('FBA', 'FE Bulk Add'); });
after(() => srv?.stop());

const sendBulk = (rows, extra = {}) => c.post('master', '/slots/bulk-upload', { slots: rows, createOnly: true, ...extra }, { site: A.id });

test('T-F8 round trip: the rows the form sends pass the server zone check; a second run changes nothing (createOnly)', async () => {
  const plan = planBulkAdd('B1', 'Z1', '1', '5', (await c.slots(A.id)).map((s) => s.slotNumber));
  assert.equal(plan.ready, true);
  const r1 = await sendBulk(bulkAddRows(plan, COMMON, 'Z1', A.id));
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const o1 = bulkOutcome(plan.names, r1.body.result.rows);
  assert.deepEqual([o1.added, o1.refused], [5, 0]);
  const saved = (await c.slots(A.id)).filter((s) => s.slotNumber.startsWith('B1-Z1-'));
  assert.equal(saved.length, 5);
  assert.ok(saved.every((s) => s.puzzleNumber === 'B1-Z1' && s.slotType === 'TWO_WHEELER' && s.status === 'VACANT'));
  // the table row of a saved slot shows its zone, and the form reads the zone and number back
  assert.equal(inventoryRow(saved[0])[2], 'Z1');
  assert.deepEqual(zoneInputsOf(saved.find((s) => s.slotNumber === 'B1-Z1-003')), { zone: 'Z1', number: '003' });
  // a race: the same names again (the browser had not reloaded): every row is a row error, nothing is updated
  const before2 = JSON.stringify((await c.slots(A.id)).map((s) => [s.id, s.slotNumber, s.floorLocation, s.height]).sort());
  const r2 = await sendBulk(bulkAddRows(plan, { ...COMMON, height: '2.5m' }, 'Z1', A.id));
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const o2 = bulkOutcome(plan.names, r2.body.result.rows);
  assert.deepEqual([o2.added, o2.refused], [0, 5]);
  assert.match(o2.rows[0].errors[0], /already exists/);
  assert.equal(JSON.stringify((await c.slots(A.id)).map((s) => [s.id, s.slotNumber, s.floorLocation, s.height]).sort()), before2, 'nothing changed');
  // the next free range after a reload is ready again
  const plan2 = planBulkAdd('B1', 'Z1', '6', '8', (await c.slots(A.id)).map((s) => s.slotNumber));
  assert.equal(plan2.ready, true);
});

test('T-F8 AC-12 Set zone: an old two-wheeler slot is renamed by id to its built name; a taken name is the 409 with the UX copy', async () => {
  const old = await c.post('master', '/slots/save', { slot: { slotNumber: 'B2-2W-01', basement: 'B2', floorLocation: 'East rack', slotType: 'TWO_WHEELER', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE' } }, { site: A.id });
  assert.equal(old.status, 200, JSON.stringify(old.body));
  const oldSlot = (await c.slots(A.id)).find((s) => s.slotNumber === 'B2-2W-01');
  assert.equal(oldSlot.puzzleNumber, undefined, 'nothing was zoned automatically');
  assert.equal(inventoryRow(oldSlot)[2], '', 'the CSV cell is blank; the table says Unzoned');
  const pre = setZoneInputs(oldSlot.slotNumber);
  assert.deepEqual(pre, { zone: '', number: '001' });
  const form = checkZoneForm('B2', 'Z1', pre.number);
  assert.deepEqual(form.built, { puzzleNumber: 'B2-Z1', slotNumber: 'B2-Z1-001' });
  const ok = await c.post('master', '/slots/save', { slot: { ...oldSlot, ...form.built } }, { site: A.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const after1 = await c.slots(A.id);
  assert.equal(after1.filter((s) => s.id === oldSlot.id).length, 1, 'renamed, not copied');
  assert.equal(after1.find((s) => s.id === oldSlot.id).slotNumber, 'B2-Z1-001');
  assert.equal(after1.some((s) => s.slotNumber === 'B2-2W-01'), false);
  // another old slot onto the same built name: 409
  const other = await c.post('master', '/slots/save', { slot: { slotNumber: 'B2-2W-02', basement: 'B2', floorLocation: 'East rack', slotType: 'TWO_WHEELER', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE' } }, { site: A.id });
  assert.equal(other.status, 200);
  const o = (await c.slots(A.id)).find((s) => s.slotNumber === 'B2-2W-02');
  const dup = await c.post('master', '/slots/save', { slot: { ...o, puzzleNumber: 'B2-Z1', slotNumber: 'B2-Z1-001' } }, { site: A.id });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.deepEqual(mapZoneSaveError(dup.status, dup.body).zoneErrors, { name: 'This slot name already exists in this site' });
  // a name and zone that disagree: 400 next to the zone
  const bad = await c.post('master', '/slots/save', { slot: { ...o, puzzleNumber: 'B1-Z1', slotNumber: 'B2-Z1-009' } }, { site: A.id });
  assert.equal(bad.status, 400);
  assert.ok(mapZoneSaveError(bad.status, bad.body).zoneErrors.zone, JSON.stringify(bad.body));
});

test('T-F8 static: the modal sends one createOnly request, is write-guarded, blocks Confirm on a clash and lists each row', () => {
  const comp = src('src/components/InventoryMaster.tsx');
  const modal = comp.slice(comp.indexOf('Bulk add two-wheeler slots */'));
  assert.match(comp, /body: JSON\.stringify\(\{ slots: bulkAddRows\(bulkPlan, bulk, bulk\.zone\.trim\(\)\.toUpperCase\(\), currentSiteId\), createOnly: true \}\)/);
  assert.equal((comp.match(/createOnly: true/g) || []).length, 1);
  assert.match(modal, /\{\.\.\.guard\(\)\}\s+onClick=\{handleConfirmBulkAdd\}/);
  assert.match(modal, /disabled=\{bulkBusy \|\| !bulkPlan\.ready \|\| !bulkListsChosen \|\| !!bulkResult \|\| !!guard\(\)\.disabled\}/);
  assert.match(modal, /Will add \{bulkPlan\.count\}/);
  assert.match(modal, /COPY_BULK_NAMES_EXIST/);
  assert.match(modal, /bulkResult\.rows\.map/);
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(comp, /Bulk add two-wheeler<\/span>/);
});
