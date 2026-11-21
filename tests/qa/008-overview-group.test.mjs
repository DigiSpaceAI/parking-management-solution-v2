// 008 B2 API tests (backend-dev): GET /api/v1/overview?group=4W|2W (tech design 008, tasks 2 and tests list).
// Server in local demo mode (Firestore off) with a prepared data/pms_store.json. No dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, client, slot, MASTER_EMAIL } from './support/pf006.mjs';

const IST = 330 * 60 * 1000;
const now = Date.now();
const today = now + IST - (((now + IST) % 86400000) + 86400000) % 86400000 - IST; // IST day start
const inToday = (ms) => Math.max(today, Math.min(ms, now - 1000));
const iso = (ms) => new Date(ms).toISOString();
const isToday = (t) => !!t && new Date(t).getTime() >= today && new Date(t).getTime() < today + 86400000;
const hourOf = (t) => new Date(new Date(t).getTime() + IST).getUTCHours();

const site = (id, code) => ({ id, siteCode: code, siteName: `Site ${code}`, city: 'Pune', address: 'Addr', contactPerson: 'P', contactEmail: 'p@x.in',
  contactPhone: '+91 98200 00000', totalSlots: 4, basementLevels: 1, hasPuzzleParking: true, hasEVCharging: false, status: 'ACTIVE',
  pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 },
  onboardedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const sl = (id, siteId, num, status, extra = {}) => ({ id, siteId, ...slot(num, { status }), height: '2.0m', ...extra });
const two = { slotType: 'TWO_WHEELER' };
const lg = (id, siteId, slotId, slotNumber, entryTime, extra = {}) => ({ id, siteId, vehicleNumber: `MH12AB${id.slice(-4).padStart(4, '0')}`, employeeName: 'Guest',
  department: 'Visitor', slotId, slotNumber, basement: 'B1', entryTime, exitTime: null, durationMinutes: null, entryType: 'MANUAL', status: 'ACTIVE', remarks: '', ...extra });

const SLOTS = [
  sl('f1', 's-one', 'B1-F-01', 'OCCUPIED'), sl('f2', 's-one', 'B1-F-02', 'VACANT'), sl('f3', 's-one', 'G-F-01', 'VACANT', { basement: 'Ground' }),
  sl('f4', 's-one', 'D-F-01', 'OCCUPIED', { basement: 'Driveway' }),
  sl('w1', 's-one', 'B1-Z1-001', 'VACANT', { ...two, puzzleNumber: 'B1-Z1' }), sl('w2', 's-one', 'B1-Z1-002', 'OCCUPIED', { ...two, puzzleNumber: 'B1-Z1' }),
  sl('w5', 's-one', 'B1-Z1-003', 'MAINTENANCE', { ...two, puzzleNumber: 'B1-Z1' }), sl('w3', 's-one', 'B1-Z2-001', 'VACANT', { ...two, puzzleNumber: 'B1-Z2' }),
  sl('w4', 's-one', 'B2-2W-01', 'OCCUPIED', { ...two, basement: 'Driveway' }), // old style name, no zone: Unzoned, never a made-up "2W" zone
  sl('t1', 's-two', 'T-2W-01', 'OCCUPIED', two), sl('t2', 's-two', 'T-4W-01', 'VACANT'), sl('u1', 's-three', 'U-4W-01', 'VACANT'),
];
const recent = iso(inToday(now - 3600_000)), old = iso(now - 13 * 3600_000);
const LOGS = [
  lg('log-0001', 's-one', 'f1', 'B1-F-01', recent),
  lg('log-0002', 's-one', 'w2', 'B1-Z1-002', recent),
  lg('log-0003', 's-one', 'w1', 'B1-Z1-001', iso(inToday(today + 1800_000)), { status: 'COMPLETED', exitTime: iso(now - 500) }),
  lg('log-0004', 's-one', 'gone', 'NO-SUCH', recent),                       // no slot found = 4W
  lg('log-0005', 's-one', 'gone', 'b1-z2-001', recent),                     // slotId gone, found by slot number (any case) = 2W
  lg('log-0006', 's-one', 'w4', 'B2-2W-01', old),                           // 2W, parked over 12 h
  lg('log-0007', 's-one', 'f2', 'B1-F-02', old),                            // 4W, parked over 12 h
  lg('log-0008', 's-one', 't1', 'ELSEWHERE', recent),                       // slotId of ANOTHER site's 2W slot: not looked up, = 4W
  lg('log-0009', 's-two', 't1', 'T-2W-01', recent),                         // site two: never counted at site one
  lg('log-0010', 's-two', 't1', 'T-2W-01', old),
];
const REQS = [
  { id: 'rq-1', siteId: 's-one', name: 'P1', email: 'p1@x.in', vehicleNumber: 'MH12AB0101', status: 'PENDING', createdAt: iso(now - 3.5 * 86400000) },
  { id: 'rq-2', siteId: 's-one', name: 'P2', email: 'p2@x.in', vehicleNumber: 'MH12AB0102', status: 'PENDING', createdAt: iso(now - 86400000) },
  { id: 'rq-4', siteId: 's-two', name: 'P4', email: 'p4@x.in', vehicleNumber: 'MH12AB0104', status: 'PENDING', createdAt: iso(now - 30 * 86400000) },
];
const ALERTS = [{ id: 'al-1', siteId: 's-one', vehicleNumber: 'MH12AB0200' }, { id: 'al-2', siteId: 's-two', vehicleNumber: 'MH12AB0201' }];

let srv; let c;
before(async () => {
  srv = await startServer({ prepare: (dir) => { mkdirSync(path.join(dir, 'data')); writeFileSync(path.join(dir, 'data', 'pms_store.json'),
    JSON.stringify({ sites: [site('s-one', 'ONE'), site('s-two', 'TWO'), site('s-three', 'THR')], slots: SLOTS, logs: LOGS, registrationRequests: REQS, alerts: ALERTS })); } });
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
});
after(() => srv?.stop());
const ov = async (q = '', siteId = 's-one') => c.get('master', `/overview${q}`, { site: siteId });

test('T-2 [AC-05] groups: 4W + 2W = all, from the one snapshot, and each group view equals its entry in groups', async () => {
  const all = (await ov()).body, four = (await ov('?group=4W')).body, twoW = (await ov('?group=2W')).body;
  assert.deepEqual(all.groups, { '4W': { occupied: 2, free: 2, total: 4 }, '2W': { occupied: 2, free: 2, total: 5 } });
  assert.deepEqual([all.occupied, all.free, all.total], [4, 4, 9], 'no group = all slots');
  for (const k of ['occupied', 'free', 'total']) assert.equal(all.groups['4W'][k] + all.groups['2W'][k], all[k], k);
  assert.deepEqual(four.groups, all.groups); assert.deepEqual(twoW.groups, all.groups);
  for (const [g, o] of [['4W', four], ['2W', twoW]]) {
    assert.equal(o.group, g);
    assert.deepEqual({ occupied: o.occupied, free: o.free, total: o.total }, all.groups[g], `${g} numbers = groups.${g}`);
    assert.equal(o.byLevel.reduce((n, r) => n + r.total, 0), o.total, `${g} levels add up`);
    assert.equal(o.byLevel.reduce((n, r) => n + r.occupied, 0), o.occupied);
  }
  // another site's slots are never counted (site two has 1 occupied 2W + 1 vacant 4W)
  assert.deepEqual((await ov('?group=2W', 's-two')).body.groups, { '4W': { occupied: 0, free: 1, total: 1 }, '2W': { occupied: 1, free: 0, total: 1 } });
});

test('T-2 [AC-04] a group view lists its levels un-clubbed (Ground and Driveway apart), in the shared order', async () => {
  assert.deepEqual((await ov('?group=4W')).body.byLevel, [{ level: 'B1', occupied: 1, total: 2 }, { level: 'Ground', occupied: 0, total: 1 }, { level: 'Driveway', occupied: 1, total: 1 }]);
  assert.deepEqual((await ov('?group=2W')).body.byLevel, [{ level: 'B1', occupied: 1, total: 4 }, { level: 'Driveway', occupied: 1, total: 1 }]);
});

test('T-2 [AC-02] entries, exits, hours, parked over 12 h and latest follow the group; a log with no slot is 4W; other sites never count', async () => {
  const all = (await ov()).body, four = (await ov('?group=4W')).body, twoW = (await ov('?group=2W')).body;
  const mine = LOGS.filter((l) => l.siteId === 's-one');
  const want = (ids) => { const L = mine.filter((l) => ids.includes(l.id)); const h = new Array(24).fill(0); L.forEach((l) => { if (isToday(l.entryTime)) h[hourOf(l.entryTime)]++; });
    return { entries: L.filter((l) => isToday(l.entryTime)).length, exits: L.filter((l) => isToday(l.exitTime)).length, hours: h,
      over12: L.filter((l) => l.status === 'ACTIVE' && new Date(l.entryTime).getTime() < now - 12 * 3600_000).length }; };
  const w4 = want(['log-0001', 'log-0004', 'log-0007', 'log-0008']); // 0004 no slot, 0008 slotId of another site's slot
  const w2 = want(['log-0002', 'log-0003', 'log-0005', 'log-0006']); // 0005 found by slot number, any case
  for (const [name, o, w] of [['4W', four, w4], ['2W', twoW, w2]]) {
    assert.equal(o.entriesToday, w.entries, `${name} entries`); assert.equal(o.exitsToday, w.exits, `${name} exits`);
    assert.deepEqual(o.entriesByHour, w.hours, `${name} hours`); assert.equal(o.parkedOver12h, w.over12, `${name} over 12 h`);
  }
  assert.equal(w4.exits + w2.exits, 1); assert.equal(twoW.exitsToday, 1, 'the exit is a 2W slot');
  assert.equal(four.entriesToday + twoW.entriesToday, all.entriesToday, 'entries add up');
  assert.equal(four.exitsToday + twoW.exitsToday, all.exitsToday);
  assert.equal(four.parkedOver12h + twoW.parkedOver12h, all.parkedOver12h);
  all.entriesByHour.forEach((n, h) => assert.equal(four.entriesByHour[h] + twoW.entriesByHour[h], n, `hour ${h}`));
  assert.ok(four.latest.length === 4 && twoW.latest.length === 4);
  assert.ok(twoW.latest.every((l) => ['B1-Z1-002', 'B1-Z1-001', 'b1-z2-001', 'B2-2W-01'].includes(l.slotNumber)), 'latest are 2W entries: ' + JSON.stringify(twoW.latest.map((l) => l.slotNumber)));
  assert.ok(four.latest.every((l) => ['B1-F-01', 'NO-SUCH', 'B1-F-02', 'ELSEWHERE'].includes(l.slotNumber)), 'latest are 4W entries');
  for (const o of [all, four, twoW]) assert.ok(o.latest.every((l) => l.slotNumber !== 'T-2W-01'), 'no log from site two');
  assert.equal(twoW.hasHistory, true);
});

test('T-2 pending requests, their age and non-parked alerts stay on 4W (0 / null on 2W); no group = unchanged', async () => {
  const all = (await ov()).body, four = (await ov('?group=4W')).body, twoW = (await ov('?group=2W')).body;
  for (const o of [all, four]) { assert.equal(o.pendingRequests, 2); assert.equal(o.oldestPendingDays, 3); assert.equal(o.nonParkedAlerts, 1); }
  assert.equal(twoW.pendingRequests, 0); assert.equal(twoW.oldestPendingDays, null); assert.equal(twoW.nonParkedAlerts, 0);
});

test('T-2 [AC-09/12] zones only for group=2W: one pallet per level + zone, Unzoned per level, counts from the same slots', async () => {
  const twoW = (await ov('?group=2W')).body;
  assert.deepEqual(twoW.zones, [
    { level: 'B1', zone: 'Z1', id: 'B1-Z1', free: 1, total: 3 },
    { level: 'B1', zone: 'Z2', id: 'B1-Z2', free: 1, total: 1 },
    { level: 'Driveway', zone: null, id: 'Driveway-unzoned', free: 0, total: 1 },
  ]);
  assert.equal(twoW.zones.reduce((n, z) => n + z.total, 0), twoW.total, 'pallets cover every 2W slot');
  assert.equal(twoW.zones.reduce((n, z) => n + z.free, 0), twoW.free);
  assert.ok(!twoW.zones.some((z) => z.zone === '2W'), 'B2-2W-01 never makes a zone "2W"');
  assert.equal('zones' in (await ov('?group=4W')).body, false); assert.equal('zones' in (await ov()).body, false);
});

test('T-2 no group = the old response: same fields, Driveway clubbed into Ground, no group echo; groups is only added', async () => {
  const all = (await ov()).body;
  assert.deepEqual(all.byLevel, [{ level: 'B1', occupied: 2, total: 6 }, { level: 'Ground', occupied: 2, total: 3 }], 'old clubbed rows');
  assert.equal('group' in all, false);
  assert.deepEqual(Object.keys(all).filter((k) => !['groups'].includes(k)).sort(), ['siteId', 'asOf', 'timezone', 'occupied', 'total', 'free', 'byLevel', 'entriesToday', 'exitsToday',
    'entriesByHour', 'pendingRequests', 'oldestPendingDays', 'parkedOver12h', 'nonParkedAlerts', 'latest', 'hasHistory'].sort());
  assert.equal(all.entriesToday, LOGS.filter((l) => l.siteId === 's-one' && isToday(l.entryTime)).length, 'all of this site\'s logs, none of site two');
});

test('T-2 a bad group is a 400 ERR_VALIDATION (field group), nothing computed; site rules unchanged', async () => {
  for (const q of ['?group=ALL', '?group=4w', '?group=2w', '?group=', '?group=3W', '?group=4W,2W', '?group=4W&group=2W', '?group=%27']) {
    const r = await ov(q);
    assert.equal(r.status, 400, `${q}: ${r.text}`);
    assert.equal(r.body.errorCode, 'ERR_VALIDATION'); assert.equal(r.body.field, 'group'); assert.deepEqual(r.body.allowed, ['4W', '2W']);
  }
  assert.equal((await c.get('master', '/overview?group=2W')).body.errorCode, 'ERR_SITE_REQUIRED', 'site is still required');
  assert.equal((await c.get('master', '/overview?group=2W&siteId=ALL')).body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
});

test('T-2 [AC-08] a site with no 2W slots: groups.2W is 0/0/0 and the 2W view is empty, not an error', async () => {
  const r = await ov('?group=2W', 's-three');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.groups, { '4W': { occupied: 0, free: 1, total: 1 }, '2W': { occupied: 0, free: 0, total: 0 } });
  assert.deepEqual([r.body.total, r.body.occupied, r.body.free, r.body.entriesToday, r.body.exitsToday], [0, 0, 0, 0, 0]);
  assert.deepEqual(r.body.byLevel, []); assert.deepEqual(r.body.zones, []); assert.equal(r.body.entriesByHour.length, 24);
  assert.equal(r.body.hasHistory, false);
});
