// @ts-nocheck -- test helper (run with tsx): the same inputs through the frozen
// 9d5596d feed builder and the current one; prints one JSON line (003-summary T1).
import * as now from '../../../../src/server/displayFeed';
import * as old from './displayFeed.9d5596d';

const mk = (n, basement, slotType, status, extra = {}) => ({ id: 'id' + n, siteId: 's', slotNumber: `${basement}-P${n}`, basement, floorLocation: 'L1', slotType,
  parkingType: n % 2 ? 'PUZZLE' : 'GROUND', height: 'Standard (2.0m)', allocation: 'VISITOR', status, currentVehicle: status === 'OCCUPIED' ? `KA01AB${n}` : null, ...extra });
const slots = [mk(1, 'B1', 'SEDAN', 'VACANT', { puzzleNumber: 'P1' }), mk(2, 'B1', 'EV', 'VACANT'), mk(3, 'B1', 'SUV', 'OCCUPIED'), mk(4, 'B2', 'CSUV', 'RESERVED'),
  mk(5, 'B2', 'TWO_WHEELER', 'MAINTENANCE'), mk(6, 'B3', 'SEDAN', 'VACANT', { lengthM: 5.1, palletLevel: 1 }), mk(7, 'Ground', 'SUV', 'OCCUPIED')];
const display = { id: 'd', siteId: 's', name: 'TV', location: 'Gate', selection: { levels: ['B1', 'B2'], areas: [{ level: 'B3', parkingType: 'GROUND' }], slotIds: ['id7'], vehicleClass: 'ALL' },
  pageSeconds: 8, hours: { mode: 'ALWAYS' }, status: 'ACTIVE' };
const none = { message: null, forcedFull: null };
const nowMs = Date.parse('2026-11-09T06:00:00Z'); // 11:30 IST
const cases = [
  { display, slots: now.sortByCode(slots), pinned: new Set(['id6']), override: none },
  { display, slots: now.sortByCode(slots), pinned: new Set(), override: { message: { id: 'm', text: 'Hello', mode: 'BANNER', endsAt: null }, forcedFull: { endsAt: null } } },
  { display: { ...display, hours: { mode: 'DAILY', on: '20:00', off: '21:00' } }, slots: now.sortByCode(slots), pinned: new Set(), override: none },
  { display, slots: [], pinned: new Set(), override: none },
];
console.log(JSON.stringify(cases.map((cs) => {
  const i = { ...cs, siteName: 'Site', nowMs };
  const a = now.buildFeed(i);
  const b = old.buildFeed(i);
  return { state: a.feed.state, same: a.json.replace(',"layout":"SLOT_CARDS"', '') === b.json, hasOne: a.json.split('"layout"').length === 2, vDiffers: a.feed.v !== b.feed.v };
})));
