// 005 B1 unit tests T-1, T-2 (src/utils/slotFields.ts). node:test, no dependencies (Node strips the types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCode, isCode, labelFor, heightMetres, HIGH_CLEARANCE_M, SLOT_TYPES, ALLOCATIONS, HEIGHTS, slotMatchesFilters, inventoryRow, INVENTORY_CSV_COLUMNS } from '../../src/utils/slotFields.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

test('T-1 every code and label maps to its code, any case and spacing', () => {
  for (const [field, list] of [['slotType', SLOT_TYPES], ['allocation', ALLOCATIONS], ['height', HEIGHTS]]) {
    for (const o of list) {
      assert.equal(toCode(field, o.code), o.code, `${field} code ${o.code}`);
      assert.equal(toCode(field, o.label), o.code, `${field} label ${o.label}`);
      assert.equal(toCode(field, '  ' + o.label.toLowerCase().replace(/ /g, '   ') + ' '), o.code, `${field} messy ${o.label}`);
      assert.ok(isCode(field, o.code));
    }
  }
  assert.deepEqual(SLOT_TYPES.map((o) => o.code), ['SUV', 'CSUV', 'SEDAN', 'HATCHBACK', 'TWO_WHEELER', 'EV'], 'AC-01 order');
  const cases = [
    ['slotType', 'csuv', 'CSUV'], ['slotType', 'Compact SUV', 'CSUV'], ['slotType', 'SUV (High Clearance)', 'SUV'],
    ['slotType', 'Two Wheeler', 'TWO_WHEELER'], ['slotType', '2W', 'TWO_WHEELER'], ['slotType', 'EV Charging Bay', 'EV'],
    ['allocation', 'Car Pooling', 'CAR_POOLING'], ['allocation', 'carpooling', 'CAR_POOLING'], ['allocation', 'Employees', 'EMPLOYEE'],
    ['allocation', 'General Employee', 'EMPLOYEE'], ['allocation', 'Executive & VIP', 'VIP'], ['allocation', 'Visitor / Guest', 'VISITOR'],
    ['allocation', 'EV Charging Only', 'EMPLOYEE'],
    ['height', 'High clearance (2.5 m)', '2.5m'], ['height', '2.5M', '2.5m'], ['height', 'High Clearance (2.5m)', '2.5m'],
    ['height', 'Standard (2.0m)', '2.0m'], ['height', '2m', '2.0m'], ['height', '2.2 m', '2.2m'], ['height', 'Extra high (3.0 m)', '3.0m'],
    ['height', '3m', '3.0m'], ['height', 'Compact (1.8m)', '1.8m'],
    ['basement', 'b2', 'B2'], ['basement', 'GROUND', 'Ground'], ['parkingType', 'puzzle', 'PUZZLE'], ['status', 'maintenance', 'MAINTENANCE'],
  ];
  for (const [f, raw, want] of cases) assert.equal(toCode(f, raw), want, `${f}: ${raw}`);
});

test('T-1 unknown values are null, never guessed', () => {
  for (const [f, raw] of [['height', '2.4m'], ['height', 'Puzzle 2-Tier'], ['parkingType', 'Puzzle 2-Tier'], ['allocation', 'NOT_AVAILABLE'],
    ['slotType', 'Truck'], ['slotType', 'SUVX'], ['slotType', ''], ['slotType', undefined], ['basement', 'B4']]) {
    assert.equal(toCode(f, raw), null, `${f}: ${raw}`);
  }
  assert.equal(isCode('allocation', 'NOT_AVAILABLE'), false);
});

test('T-1 heightMetres and the high-clearance line (3.0 m yes, 2.2 m no)', () => {
  assert.equal(heightMetres('2.5m'), 2.5);
  assert.equal(heightMetres('High Clearance (2.5m)'), 2.5);
  assert.equal(heightMetres('2.5 m'), 2.5);
  assert.equal(heightMetres('2.5'), 2.5);
  assert.ok(Number.isNaN(heightMetres('tall')));
  assert.ok(Number.isNaN(heightMetres(undefined)));
  assert.ok(heightMetres('3.0m') >= HIGH_CLEARANCE_M);
  assert.ok(heightMetres('2.2m') < HIGH_CLEARANCE_M);
});

test('T-1 labelFor shows the label, or "<value> (old)" for a value outside the list', () => {
  assert.equal(labelFor('slotType', 'TWO_WHEELER'), 'Two-wheeler');
  assert.equal(labelFor('height', '2.5m'), 'High clearance (2.5 m)');
  assert.equal(labelFor('allocation', 'NOT_AVAILABLE'), 'NOT_AVAILABLE (old)');
  assert.equal(labelFor('allocation', 'General Employee'), 'General Employee (old)');
  assert.equal(labelFor('height', ''), '');
});

test('the table filter and the CSV row share one definition', () => {
  const slot = { slotNumber: 'B1-P01-S01', floorLocation: 'Basement 1', basement: 'B1', status: 'OCCUPIED', currentVehicle: 'KA01AB1234', slotType: 'CSUV', height: '2.5m', parkingType: 'PUZZLE', allocation: 'CAR_POOLING', lengthM: 5.2, palletLevel: 2 };
  assert.ok(slotMatchesFilters(slot, {}));
  assert.ok(slotMatchesFilters(slot, { basement: 'ALL', status: 'ALL', search: 'ka01' }));
  assert.ok(!slotMatchesFilters(slot, { basement: 'B2' }));
  assert.ok(!slotMatchesFilters(slot, { status: 'VACANT' }));
  assert.ok(!slotMatchesFilters(slot, { search: 'zzz' }));
  const row = inventoryRow(slot);
  assert.equal(row.length, INVENTORY_CSV_COLUMNS.length);
  assert.deepEqual(row, ['B1-P01-S01', 'Basement B1', 'Basement 1', 'CSUV', 'High clearance (2.5 m)', 'Puzzle', 'Car Pooling', 'Occupied', 'KA01AB1234', '5.2', '2']);
  assert.equal(inventoryRow({ slotNumber: 'X', slotType: 'Truck' })[3], 'Truck (old)');
  assert.equal(inventoryRow({ slotNumber: 'X' })[8], '-');
});

test('T-2 the module avoids ES2016+ runtime APIs (the 003 TV bundle is es2015)', () => {
  const src = readFileSync(path.join(here, '..', '..', 'src', 'utils', 'slotFields.ts'), 'utf-8').replace(/\/\/.*$/gm, '');
  for (const bad of [/\.includes\(/, /Object\.(values|entries|fromEntries)\b/, /\.padStart\(|\.padEnd\(/, /\.flat\(|\.flatMap\(/, /\.at\(/]) {
    assert.ok(!bad.test(src), `forbidden API ${bad}`);
  }
});
