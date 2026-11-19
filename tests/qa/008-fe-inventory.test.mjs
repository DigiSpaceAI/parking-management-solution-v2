// 008 F7 (frontend-dev): Inventory two-wheeler form (built name, zone), Zone column, Set zone, duplicate message. Pure rules + static checks of the form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  usesZoneForm, originOf, zoneInputsOf, setZoneInputs, autoFloorLocation, checkZoneForm, nameTaken, mapZoneSaveError,
  COPY_ZONE_REQUIRED, COPY_NUMBER_DIGITS, COPY_NAME_EXISTS,
} from '../../src/utils/slotZoneForm.ts';
import { inventoryRow, INVENTORY_CSV_COLUMNS, zoneCell } from '../../src/utils/slotFields.ts';
import { zoneOf, buildSlotName } from '../../src/utils/zones.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, '..', '..', p), 'utf8');

test('T-F7 AC-09 the two-wheeler form: new slots, zoned slots and a slot that becomes a two-wheeler; an old unzoned slot keeps the single box', () => {
  assert.equal(usesZoneForm('TWO_WHEELER', null, false), true, 'new slot');
  assert.equal(usesZoneForm('SUV', null, false), false);
  assert.equal(usesZoneForm('', null, false), false, 'no type chosen yet');
  const zoned = originOf({ slotNumber: 'B1-Z1-001', puzzleNumber: 'B1-Z1', slotType: 'TWO_WHEELER' });
  assert.equal(usesZoneForm('TWO_WHEELER', zoned, false), true);
  const old = originOf({ slotNumber: 'B2-2W-01', slotType: 'TWO_WHEELER' });
  assert.equal(usesZoneForm('TWO_WHEELER', old, false), false, 'an unrelated edit never forces a zone');
  assert.equal(usesZoneForm('TWO_WHEELER', old, true), true, 'Set zone');
  const four = originOf({ slotNumber: 'B1-P01-S1', slotType: 'SUV' });
  assert.equal(usesZoneForm('TWO_WHEELER', four, false), true, 'a four-wheeler slot changed to two-wheeler');
  assert.equal(usesZoneForm('SUV', zoned, false), false, 'a two-wheeler slot changed to SUV leaves the zone form');
  assert.equal(originOf({ slotNumber: '' }), null);
});

test('T-F7 the inputs of an existing slot and of "Set zone" (number from the old name, zone never guessed)', () => {
  assert.deepEqual(zoneInputsOf({ slotType: 'TWO_WHEELER', puzzleNumber: 'B1-Z1', slotNumber: 'B1-Z1-007' }), { zone: 'Z1', number: '007' });
  assert.deepEqual(zoneInputsOf({ slotType: 'TWO_WHEELER', slotNumber: 'B2-2W-01' }), { zone: '', number: '' });
  assert.deepEqual(zoneInputsOf({ slotType: 'SUV', puzzleNumber: 'B1-P01', slotNumber: 'B1-P01-S1' }), { zone: '', number: '' });
  assert.deepEqual(setZoneInputs('B2-2W-01'), { zone: '', number: '001' });
  assert.deepEqual(setZoneInputs('B3-2W-101'), { zone: '', number: '101' });
  assert.deepEqual(setZoneInputs('B3-RACK'), { zone: '', number: '' });
  assert.deepEqual(setZoneInputs('B3-2W-0000'), { zone: '', number: '' }, 'out of range is left for the admin');
  assert.equal(autoFloorLocation('B1', 'z1'), 'B1 · Zone Z1');
  assert.equal(autoFloorLocation('B1', ''), '');
});

test('T-F7 the name is built as you type and every message is the UX copy', () => {
  const ok = checkZoneForm('B1', 'z1', '7');
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.built, { puzzleNumber: 'B1-Z1', slotNumber: 'B1-Z1-007' });
  assert.equal(checkZoneForm('Ground', 'Z9', '001').built.slotNumber, 'GROUND-Z9-001', 'the server stores the name upper-case');
  assert.equal(checkZoneForm('B1', '', '1').errors.zone, COPY_ZONE_REQUIRED);
  assert.equal(COPY_ZONE_REQUIRED, 'Zone is required for two-wheeler slots');
  assert.equal(checkZoneForm('B1', 'Z1', '1a').errors.number, COPY_NUMBER_DIGITS);
  assert.equal(COPY_NUMBER_DIGITS, 'Slot number must be digits only');
  assert.match(checkZoneForm('B1', 'Z1', '0').errors.number, /1 to 999/);
  assert.match(checkZoneForm('B1', 'Z1', '1000').errors.number, /1 to 999/);
  assert.match(checkZoneForm('B1', 'Z-1', '1').errors.zone, /no dash/);
  assert.match(checkZoneForm('B1', 'ABCDEFG', '1').errors.zone, /1 to 6/);
  assert.equal(checkZoneForm('B1', 'Z1', '1').built && checkZoneForm('', 'Z1', '1').built, null, 'no level, no name');
  // an untouched empty form says nothing yet but has no name either
  const fresh = checkZoneForm('B1', '', '', {});
  assert.deepEqual(fresh.errors, {}); assert.equal(fresh.built, null);
});

test('T-F7 AC-10 a name already used in the site blocks Save (case-insensitive, the slot being edited excluded)', () => {
  const siteSlots = [{ id: 'a', slotNumber: 'B1-Z1-001' }, { id: 'b', slotNumber: 'B1-Z1-002' }];
  assert.equal(nameTaken('b1-z1-001', siteSlots), true);
  assert.equal(nameTaken('B1-Z1-003', siteSlots), false);
  assert.equal(nameTaken('B1-Z1-001', siteSlots, 'a'), false, 'saving a slot onto its own name is fine');
  assert.equal(COPY_NAME_EXISTS, 'This slot name already exists in this site');
});

test('T-F7 the 409 and the 400s of /slots/save land next to the right input', () => {
  const dup = mapZoneSaveError(409, { errorCode: 'ERR_DUPLICATE_SLOT', field: 'slotNumber', message: 'Slot B1-Z1-001 already exists at this site — edit that slot instead.' });
  assert.deepEqual(dup.zoneErrors, { name: 'This slot name already exists in this site' });
  assert.deepEqual(dup.fieldErrors, {}); assert.equal(dup.banner, null);
  const zone = mapZoneSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'puzzleNumber', message: 'Zone must be "B1-" followed by the zone name, for example B1-Z1.' });
  assert.equal(zone.zoneErrors.zone, 'Zone must be "B1-" followed by the zone name, for example B1-Z1.'); assert.equal(zone.banner, null);
  const no = mapZoneSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'slotNumber', message: 'Slot number must be B1-Z1-001 to B1-Z1-999 for zone B1-Z1.' });
  assert.match(no.zoneErrors.number, /B1-Z1-001 to B1-Z1-999/);
  assert.deepEqual(no.fieldErrors, {});
  const other = mapZoneSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'height', message: 'Height is not one of the list.' });
  assert.deepEqual(other.fieldErrors, { height: 'Height is not one of the list.' });
  assert.deepEqual(other.zoneErrors, {});
  const down = mapZoneSaveError(503, { message: "Couldn't save. Nothing was changed." });
  assert.equal(down.banner, "Couldn't save. Nothing was changed.");
});

test('T-F7 AC-13 the table has a Zone column right after Level: the zone of a zoned two-wheeler slot, blank for four-wheelers and unzoned slots', () => {
  assert.deepEqual(INVENTORY_CSV_COLUMNS.slice(0, 4), ['Slot number', 'Level', 'Zone', 'Floor location']);
  const base = { basement: 'B1', floorLocation: 'x', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' };
  assert.equal(inventoryRow({ ...base, slotNumber: 'B1-Z1-001', slotType: 'TWO_WHEELER', puzzleNumber: 'B1-Z1' })[2], 'Z1');
  assert.equal(inventoryRow({ ...base, slotNumber: 'B2-2W-01', slotType: 'TWO_WHEELER' })[2], '');
  assert.equal(inventoryRow({ ...base, slotNumber: 'B1-P01-S1', slotType: 'SUV', puzzleNumber: 'B1-P01' })[2], '', 'a four-wheeler puzzle number is not a zone');
  assert.equal(inventoryRow({ ...base, slotNumber: 'B1-Z1-001', slotType: 'TWO_WHEELER', puzzleNumber: 'B1-Z1' }).length, INVENTORY_CSV_COLUMNS.length);
});

test('T-F7 the zone in slotFields (no imports, es2015-safe) reads exactly like zoneOf in zones.ts', () => {
  const vals = ['B1-Z1', 'b1-z1', ' B1-Z1 ', 'B1', '', undefined, 'B1-', 'B1-Z-1', 'B1-ABCDEFG', 'B1-Z9', 'Ground-Z2', 'X-Y-Z3', 'B1-z!'];
  for (const slotType of ['TWO_WHEELER', 'SUV', undefined]) for (const puzzleNumber of vals) {
    assert.equal(zoneCell({ slotType, puzzleNumber }), zoneOf({ slotType, puzzleNumber }) ?? '', `${slotType} ${puzzleNumber}`);
  }
  assert.equal(buildSlotName('B1', 'Z1', 5).puzzleNumber, 'B1-Z1');
});

test('T-F7 static: the form builds the name (read-only), sends puzzleNumber, has Set zone and Unzoned, and keeps the 005 single box for old slots', () => {
  const c = src('src/components/InventoryMaster.tsx');
  assert.match(c, /<output\s+id="slot-name"/, 'the slot name is shown, not typed');
  assert.doesNotMatch(c, /<input[^>]*id="slot-name"/);
  assert.match(c, /Zone \*<\/label>/); assert.match(c, /Slot number \*<\/label>/); assert.match(c, /Level \*/);
  assert.match(c, /puzzleNumber: builtName\.puzzleNumber/);
  assert.match(c, /slotNumber: builtName\.slotNumber/);
  assert.match(c, /Set zone/); assert.match(c, /Unzoned/);
  assert.match(c, /handleOpenSlotEditModal\(slot, \{ setZone: true \}\)/);
  assert.match(c, /slot\.slotType === 'TWO_WHEELER' && !cells\[2\]/, 'Set zone only for a two-wheeler slot with no zone');
  assert.match(c, /Slot Identifier Number \*/, 'the single box stays for four-wheeler and old unzoned slots');
  assert.match(c, /disabled=\{slotFormSaving \|\| missingFields\.length > 0 \|\| zoneBlocked\}/);
  assert.match(c, /\{\.\.\.guard\('Put this slot in a zone'\)\}/, 'write-guarded: view-as and All sites stay read-only');
  assert.match(c, /INVENTORY_CSV_COLUMNS\.map\(\(name\)/, 'header = CSV header');
  assert.match(c, /Older log rows keep the old name/);
});
