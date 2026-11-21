// 008 B1 unit tests (backend-dev): src/utils/vehicleGroup.ts, zones.ts, slotCounts.ts (003, carried unchanged).
// node:test, no dependencies (Node strips the types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, inGroup, isVehicleGroup } from '../../src/utils/vehicleGroup.ts';
import { zoneOf, zonesOf, buildSlotName, checkZoneName, padSlotNo } from '../../src/utils/zones.ts';
import { countSlots } from '../../src/utils/slotCounts.ts';

const s = (basement, slotType, status = 'VACANT', puzzleNumber) => ({ basement, slotType, status, ...(puzzleNumber ? { puzzleNumber } : {}) });
const MIX = [
  s('B1', 'SEDAN'), s('B1', 'SUV', 'OCCUPIED'), s('B1', 'EV'), s('B2', 'HATCHBACK', 'MAINTENANCE'), s('Ground', 'CSUV'), s('Driveway', 'SEDAN', 'OCCUPIED'),
  s('B1', 'TWO_WHEELER', 'VACANT', 'B1-Z1'), s('B1', 'TWO_WHEELER', 'OCCUPIED', 'B1-Z1'), s('B1', 'TWO_WHEELER', 'VACANT', 'B1-Z2'),
  s('B1', 'TWO_WHEELER'), s('B2', 'TWO_WHEELER', 'VACANT', 'B2-Z1'), s('Ground', 'TWO_WHEELER', 'OCCUPIED'),
  { basement: 'B3', status: 'VACANT' }, // no slot type = 4W
];

test('T-1 groupOf: two-wheeler is 2W, everything else (and a missing or old type) is 4W', () => {
  assert.equal(groupOf('TWO_WHEELER'), '2W');
  for (const t of ['SEDAN', 'SUV', 'CSUV', 'HATCHBACK', 'EV', undefined, null, '', 'Truck', 'Two Wheeler']) assert.equal(groupOf(t), '4W', String(t));
  assert.ok(isVehicleGroup('4W') && isVehicleGroup('2W'));
  for (const v of ['4w', '2w', 'ALL', '', undefined, null, 4]) assert.equal(isVehicleGroup(v), false, String(v));
});

test('T-1 4W + 2W = all: total, free and occupied add up through the one countSlots', () => {
  const four = MIX.filter((x) => inGroup(x, '4W')), two = MIX.filter((x) => inGroup(x, '2W'));
  assert.equal(four.length + two.length, MIX.length);
  assert.equal(two.length, 6);
  const occ = { isFree: (x) => x.status === 'OCCUPIED' };
  for (const [name, opts] of [['free', undefined], ['occupied', occ]]) {
    assert.equal(countSlots(four, opts).free + countSlots(two, opts).free, countSlots(MIX, opts).free, name);
  }
  assert.equal(countSlots(four).total + countSlots(two).total, countSlots(MIX).total);
  // per level too
  const rows = (g) => Object.fromEntries(countSlots(g).rows.map((r) => [r.level, r.total]));
  for (const r of countSlots(MIX).rows) assert.equal((rows(four)[r.level] || 0) + (rows(two)[r.level] || 0), r.total, r.level);
});

test('T-1 zoneOf: only 2W slots with a puzzleNumber have a zone; an old name never gives one', () => {
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', puzzleNumber: 'B1-Z1' }), 'Z1');
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', puzzleNumber: ' b2-z9 ' }), 'Z9');
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER' }), null);
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', puzzleNumber: '   ' }), null);
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', puzzleNumber: 'ZONE' }), null, 'no dash, no zone');
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', puzzleNumber: 'B1-TOOLONGZ' }), null);
  assert.equal(zoneOf({ slotType: 'SEDAN', puzzleNumber: 'B1-P01' }), null, '4W puzzle numbers are not zones');
  // AC-12: B2-2W-01 (an old 2W name) is never turned into a made-up zone "2W"
  assert.equal(zoneOf({ slotType: 'TWO_WHEELER', slotNumber: 'B2-2W-01' }), null);
});

test('T-1 zonesOf: one pallet per level + zone, Unzoned per level, 4W ignored, counts from countSlots', () => {
  const z = zonesOf(MIX);
  assert.deepEqual(z, [
    { level: 'B1', zone: 'Z1', id: 'B1-Z1', free: 1, total: 2 },
    { level: 'B1', zone: 'Z2', id: 'B1-Z2', free: 1, total: 1 },
    { level: 'B1', zone: null, id: 'B1-unzoned', free: 1, total: 1 },
    { level: 'B2', zone: 'Z1', id: 'B2-Z1', free: 1, total: 1 },
    { level: 'Ground', zone: null, id: 'Ground-unzoned', free: 0, total: 1 },
  ]);
  assert.equal(z.reduce((n, p) => n + p.total, 0), 6, 'pallets cover every 2W slot exactly once');
  assert.deepEqual(zonesOf(MIX.filter((x) => inGroup(x, '4W'))), [], 'no 2W slots, no pallets');
  assert.deepEqual(zonesOf([]), []);
});

test('T-1 buildSlotName: level + zone + number -> B1-Z1 / B1-Z1-007, padded, zone upper-cased', () => {
  assert.deepEqual(buildSlotName('B1', 'Z1', 7), { puzzleNumber: 'B1-Z1', slotNumber: 'B1-Z1-007' });
  assert.deepEqual(buildSlotName('B1', 'z1', '40'), { puzzleNumber: 'B1-Z1', slotNumber: 'B1-Z1-040' });
  assert.deepEqual(buildSlotName('Ground', 'A', 999), { puzzleNumber: 'GROUND-A', slotNumber: 'GROUND-A-999' });
  assert.equal(padSlotNo('1'), '001');
  for (const n of [0, '0', 1000, '1000', -1, '1.5', '', 'x', '١']) assert.equal(buildSlotName('B1', 'Z1', n), null, `number ${n}`);
  for (const z of ['', 'Z-1', 'Z 1', 'TOOLONG7', 'Z$']) assert.equal(buildSlotName('B1', z, 1), null, `zone ${z}`);
  assert.equal(buildSlotName('', 'Z1', 1), null);
});

test('T-1 checkZoneName: name and zone must agree', () => {
  const ok = (o) => checkZoneName({ basement: 'B1', puzzleNumber: 'B1-Z1', slotNumber: 'B1-Z1-001', ...o });
  assert.deepEqual(ok({}), { ok: true });
  assert.deepEqual(ok({ slotNumber: 'b1-z1-999' }), { ok: true }, 'slot number is compared upper-cased');
  assert.deepEqual(checkZoneName({ basement: 'Ground', puzzleNumber: 'GROUND-Z1', slotNumber: 'GROUND-Z1-010' }), { ok: true });
  assert.deepEqual(checkZoneName({ basement: 'Ground', puzzleNumber: 'Ground-Z1', slotNumber: 'GROUND-Z1-010' }), { ok: true }, 'level case-insensitive');
  const field = (o) => { const r = ok(o); assert.equal(r.ok, false, JSON.stringify(o)); assert.ok(r.message); return r.field; };
  assert.equal(field({ puzzleNumber: 'B2-Z1', slotNumber: 'B2-Z1-001' }), 'puzzleNumber', 'level differs');
  assert.equal(field({ puzzleNumber: 'B1' }), 'puzzleNumber', 'no zone');
  assert.equal(field({ puzzleNumber: 'B1-' }), 'puzzleNumber', 'empty zone');
  assert.equal(field({ puzzleNumber: 'B1-Z-1', slotNumber: 'B1-Z-1-001' }), 'puzzleNumber', 'dash in zone');
  assert.equal(field({ puzzleNumber: 'B1-z1', slotNumber: 'B1-z1-001' }), 'puzzleNumber', 'lower-case zone');
  assert.equal(field({ puzzleNumber: 'B1-TOOLONG7', slotNumber: 'B1-TOOLONG7-001' }), 'puzzleNumber');
  assert.equal(field({ slotNumber: 'B1-Z2-001' }), 'slotNumber', 'name from another zone');
  assert.equal(field({ slotNumber: 'B1-Z1-000' }), 'slotNumber');
  assert.equal(field({ slotNumber: 'B1-Z1-1000' }), 'slotNumber');
  assert.equal(field({ slotNumber: 'B1-Z1-01' }), 'slotNumber', 'not padded to 3');
  assert.equal(field({ slotNumber: 'B1-Z1-001-9' }), 'slotNumber');
  assert.equal(field({ slotNumber: 'B1-Z1' }), 'slotNumber');
  assert.equal(field({ slotNumber: 'B2-2W-01' }), 'slotNumber', 'old style name');
});
