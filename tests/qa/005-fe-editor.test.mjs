// 005 F1 (frontend-dev): the Inventory slot editor. Pure logic (src/utils/slotEditor.ts) plus a round trip against the real
// /slots/save, plus static checks on the component. node:test, no extra dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, client, MASTER_EMAIL } from './support/pf006.mjs';
import { emptyNewSlot, selectModel, missingRequired, buildSavePayload, mapSaveError } from '../../src/utils/slotEditor.ts';
import { SLOT_TYPES, ALLOCATIONS, HEIGHTS, PARKING_TYPES, LEVELS, SLOT_STATUSES, optionsFor } from '../../src/utils/slotFields.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, '..', '..', p), 'utf8');
const DIMS = { lengthM: '', palletLevel: '' };

test('F1 every select offers exactly the slotFields list (codes and labels), nothing else', () => {
  for (const [field, list] of [['slotType', SLOT_TYPES], ['allocation', ALLOCATIONS], ['height', HEIGHTS], ['parkingType', PARKING_TYPES], ['basement', LEVELS], ['status', SLOT_STATUSES]]) {
    const m = selectModel(field, list[1].code);
    assert.deepEqual(m.options.map((o) => [o.value, o.label]), list.map((o) => [o.code, o.label]), field);
    assert.equal(m.value, list[1].code);
  }
  assert.deepEqual(selectModel('slotType', 'SEDAN').options.map((o) => o.value), ['SUV', 'CSUV', 'SEDAN', 'HATCHBACK', 'TWO_WHEELER', 'EV'], 'AC-01 order');
  assert.ok(selectModel('allocation', 'EMPLOYEE').options.every((o) => o.value !== 'NOT_AVAILABLE'), 'NOT_AVAILABLE is never offered');
});

test('F1 a legacy value is the first option, selected, labelled old; it never falls back to the first entry (AC-02)', () => {
  for (const [field, old] of [['allocation', 'NOT_AVAILABLE'], ['allocation', 'General Employee'], ['height', 'Standard (2.0m)'], ['slotType', 'Compact SUV']]) {
    const m = selectModel(field, old);
    assert.equal(m.value, old);
    assert.deepEqual(m.options[0], { value: old, label: `${old} (old — choose a new one)` });
    assert.equal(m.options.length, optionsFor(field).length + 1, 'the list plus the old option');
  }
  // saving without touching it sends the same value: the payload keeps it as is
  const slot = { id: 'slot-1', slotNumber: 'B1-P01-S01', basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', height: 'Standard (2.0m)', parkingType: 'PUZZLE', allocation: 'NOT_AVAILABLE', status: 'VACANT' };
  const p = buildSavePayload({ ...slot, floorLocation: 'Level 2' }, DIMS);
  assert.equal(p.allocation, 'NOT_AVAILABLE'); assert.equal(p.height, 'Standard (2.0m)'); assert.equal(p.id, 'slot-1');
});

test('F1 the Add form starts empty and Save needs every required field (AC-14)', () => {
  const s = emptyNewSlot();
  for (const f of ['slotNumber', 'basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation']) assert.equal(s[f], '', f);
  assert.equal(s.status, 'VACANT');
  assert.equal(selectModel('height', s.height).options[0].disabled, true, 'placeholder is disabled');
  assert.equal(selectModel('height', s.height).value, '');
  assert.deepEqual(missingRequired(s, true).length, 7);
  const filled = { ...s, slotNumber: 'X-1', basement: 'B1', floorLocation: 'Lvl', slotType: 'EV', height: '2.0m', parkingType: 'GROUND', allocation: 'VIP' };
  assert.deepEqual(missingRequired(filled, true), []);
  assert.deepEqual(missingRequired({ ...filled, height: '  ' }, true), ['height']);
  assert.deepEqual(missingRequired({ id: 'slot-1' }, false), [], 'an existing slot is never blocked client-side');
});

test('F1 a new slot never sends an id; an empty field is left out; the number is trimmed and upper-cased', () => {
  const p = buildSavePayload({ ...emptyNewSlot(), id: undefined, slotNumber: ' b1-p01-s01 ', basement: 'B1', height: '' }, { lengthM: ' 5.0 ', palletLevel: '' });
  assert.equal('id' in p, false);
  assert.equal(p.slotNumber, 'B1-P01-S01');
  assert.equal('height' in p, false);
  assert.equal(p.lengthM, '5.0'); assert.equal(p.palletLevel, null);
  assert.equal(p.status, 'VACANT');
});

test('F1 server errors land next to the right field', () => {
  assert.deepEqual(mapSaveError(409, { success: false, errorCode: 'ERR_DUPLICATE_SLOT', message: 'Slot B1-P01-S01 already exists at this site — edit that slot instead.' }),
    { fieldErrors: { slotNumber: 'Slot B1-P01-S01 already exists at this site — edit that slot instead.' }, dimErrors: {}, banner: null });
  const v = mapSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'height', allowed: ['1.8m'], message: 'Height must be one of: 1.8m' });
  assert.deepEqual(v.fieldErrors, { height: 'Height must be one of: 1.8m' }); assert.equal(v.banner, null);
  assert.deepEqual(mapSaveError(400, { message: 'Length must be more than 0.', errors: { lengthM: 'Length must be more than 0.' } }).dimErrors, { lengthM: 'Length must be more than 0.' });
  assert.equal(mapSaveError(500, { message: 'Failed to save slot record' }).banner, 'Failed to save slot record');
  assert.equal(mapSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'nope', message: 'x' }).banner, 'x', 'an unknown field falls to the banner');
  assert.equal(mapSaveError(0, null).banner, 'Failed to save slot');
});

let srv; let c; let A;
before(async () => { srv = await startServer(); c = client(srv); await c.login('master', MASTER_EMAIL); A = await c.onboard('FEA', 'FE Site A'); });
after(() => srv?.stop());

test('F1 round trip: the editor payload creates a server-id slot; a repeat is a 409 shown at Slot number; a bad value is a 400 at its field', async () => {
  const form = { ...emptyNewSlot(), slotNumber: ' fe-01 ', basement: 'B2', floorLocation: 'North', slotType: 'HATCHBACK', height: '2.2m', parkingType: 'PUZZLE', allocation: 'CAR_POOLING' };
  const body = buildSavePayload(form, DIMS);
  const ok = await c.post('master', '/slots/save', { slot: body, ...body }, { site: A.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.slot.id, /^slot-/);
  assert.deepEqual([ok.body.slot.slotType, ok.body.slot.allocation, ok.body.slot.height, ok.body.slot.slotNumber], ['HATCHBACK', 'CAR_POOLING', '2.2m', 'FE-01']);
  const dup = await c.post('master', '/slots/save', { slot: body, ...body }, { site: A.id });
  assert.equal(dup.status, 409);
  const v = mapSaveError(dup.status, dup.body);
  assert.match(v.fieldErrors.slotNumber, /already exists/); assert.equal(v.banner, null);
  const badBody = buildSavePayload({ ...form, slotNumber: 'FE-02', height: '2.4m' }, DIMS);
  const bad = await c.post('master', '/slots/save', { slot: badBody, ...badBody }, { site: A.id });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(mapSaveError(bad.status, bad.body).fieldErrors), ['height']);
  // editing the old slot back (id present) works and does not make a second slot
  const edit = buildSavePayload({ ...ok.body.slot, floorLocation: 'South' }, DIMS);
  const e = await c.post('master', '/slots/save', { slot: edit, ...edit }, { site: A.id });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal((await c.slots(A.id)).filter((s) => s.slotNumber === 'FE-01').length, 1);
});

test('F1 static: the editor keeps no list of its own and sends no client-made id', () => {
  const comp = src('src/components/InventoryMaster.tsx');
  for (const word of ['General Employee', 'Executive & VIP', 'Standard (2.0m)', 'High Clearance (2.5m)', 'EV Charging Bay', 'Visitor / Guest']) {
    assert.ok(comp.indexOf(`>${word}<`) === -1 && comp.indexOf(`value="${word}"`) === -1, `no option for ${word}`);
  }
  const editor = comp.slice(comp.indexOf('Single Slot Edit / Add Modal */'), comp.indexOf('Bulk Upload Slots Inventory Modal */'));
  assert.ok(editor.length > 1000, 'editor block found');
  assert.doesNotMatch(editor, /<option/, 'the editor writes no option by hand: FieldSelect builds them from slotFields');
  assert.doesNotMatch(comp, /toLowerCase\(\)\.replace\(\/\[\^a-z0-9_-\]\/g/, 'no id made from the slot number');
  assert.doesNotMatch(comp, /Math\.random\(\)/, 'no random slot number');
  assert.match(comp, /disabled=\{slotFormSaving \|\| missingFields\.length > 0 \|\| zoneBlocked\}/);
});

test('F1 round 2 (finding 3): a server 400 for Floor location is shown next to the Floor location input', () => {
  const v = mapSaveError(400, { errorCode: 'ERR_VALIDATION', field: 'floorLocation', message: 'Floor location is required.' });
  assert.deepEqual(v.fieldErrors, { floorLocation: 'Floor location is required.' });
  assert.equal(v.banner, null, 'not lost in the banner');
  const comp = src('src/components/InventoryMaster.tsx');
  const floor = comp.slice(comp.indexOf('id="slot-floor"'), comp.indexOf('id="slot-type"'));
  assert.match(floor, /fieldErrors\.floorLocation && <p id="slot-floor-error" role="alert"/, 'the message is rendered after the input, as for the slot number');
  assert.match(floor, /aria-describedby=\{fieldErrors\.floorLocation \? 'slot-floor-error' : undefined\}/);
  assert.match(floor, /aria-invalid=\{fieldErrors\.floorLocation \? true : undefined\}/);
});
