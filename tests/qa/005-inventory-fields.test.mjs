// 005 B2/B3/B4/B5 API tests (backend-dev): validated slot save, unique numbers, CSV import, export, migration, gate height.
// T-3..T-12 in docs/features/005-inventory-fields-hotfix/03-tech-design.md. Server on local demo mode (Firestore off).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, client, slot, MASTER_EMAIL, sleep } from './support/pf006.mjs';

const full = (num, extra = {}) => ({ ...slot(num), height: '2.0m', ...extra });
const legacy = (id, num, extra = {}) => ({ id, siteId: 'site-1', slotNumber: num, basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN',
  parkingType: 'PUZZLE', height: 'Standard (2.0m)', allocation: 'NOT_AVAILABLE', status: 'VACANT', ...extra });
// Slots the server loads from its local data file at start: legacy values, and one duplicated number at site-1.
const LOCAL_SLOTS = [
  legacy('legacy-1', 'LEG-01'), legacy('legacy-2', 'LEG-02', { allocation: 'General Employee' }),
  legacy('mig-a', 'MIG-01', { slotType: 'Compact SUV', allocation: 'Car Pooling', parkingType: 'Puzzle', height: 'High Clearance (2.5m)' }),
  legacy('mig-b', 'MIG-02', { slotType: 'EV', allocation: 'VIP', parkingType: 'GROUND', height: '3.0m' }),
  legacy('mig-c', 'MIG-03', { slotType: 'Truck', allocation: 'NOT_AVAILABLE', parkingType: 'STACK', height: '2.2m' }),
  legacy('mig-d', 'MIG-04', { slotType: 'SEDAN', allocation: 'EMPLOYEE', parkingType: 'PUZZLE', height: '1.9 metres' }),
  legacy('mig-e', 'MIG-05', { siteId: 'site-mig', allocation: 'Car Pooling', slotType: 'CSUV', parkingType: 'PUZZLE', height: '2.0m' }),
  legacy('dup-a', 'DUP-01', { allocation: 'EMPLOYEE', height: '2.0m' }), legacy('dup-b', 'DUP-01', { allocation: 'EMPLOYEE', height: '2.0m' }),
];

let srv; let c; let A; let B;
before(async () => {
  srv = await startServer({ prepare: (dir) => { mkdirSync(path.join(dir, 'data')); writeFileSync(path.join(dir, 'data', 'pms_store.json'), JSON.stringify({ slots: LOCAL_SLOTS })); } });
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  A = await c.onboard('IFA', 'Inventory Site A');
  B = await c.onboard('IFB', 'Inventory Site B');
});
after(() => srv?.stop());
const save = (s, body, who = 'master') => c.post(who, '/slots/save', { slot: body }, { site: s.id ?? s });
const count = async (s) => (await c.slots(s.id ?? s)).length;

test('T-3 [AC-03/04] every new code is stored exactly; a bad value is a 400 with the field and the allowed codes, nothing saved', async () => {
  const cases = [{ slotType: 'HATCHBACK' }, { slotType: 'CSUV' }, { slotType: 'TWO_WHEELER' }, { allocation: 'CAR_POOLING' }, { allocation: 'HANDICAP' },
    { height: '2.2m' }, { height: '3.0m' }, { parkingType: 'STACK' }, { basement: 'Driveway' }];
  for (const [i, extra] of cases.entries()) {
    const r = await save(A, full(`T3-${i}`, extra));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [k, v] = Object.entries(extra)[0];
    assert.equal(r.body.slot[k], v);
    assert.equal((await c.slots(A.id)).find((s) => s.slotNumber === `T3-${i}`)[k], v, 're-read equals');
    assert.match(r.body.slot.id, /^slot-/, 'server-made id');
  }
  const before = await count(A);
  for (const [field, bad] of [['slotType', 'Truck'], ['allocation', 'NOT_AVAILABLE'], ['height', '2.4m'], ['parkingType', 'FLAT'], ['basement', 'B9'], ['status', 'GONE']]) {
    const r = await save(A, full('T3-BAD', { [field]: bad }));
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.errorCode, 'ERR_VALIDATION');
    assert.equal(r.body.field, field);
    assert.ok(Array.isArray(r.body.allowed) && r.body.allowed.length >= 3);
    assert.match(r.body.message, /must be one of/);
  }
  assert.equal(await count(A), before, 'nothing saved by a refused request');
  // an old client sending labels is normalised, not refused
  const old = await save(A, full('T3-OLD', { height: 'Standard (2.0m)', allocation: 'General Employee', slotType: 'Compact SUV' }));
  assert.equal(old.status, 200, JSON.stringify(old.body));
  assert.deepEqual([old.body.slot.height, old.body.slot.allocation, old.body.slot.slotType], ['2.0m', 'EMPLOYEE', 'CSUV']);
  // D-4: SLOT_SAVED audit with the slot number and the changed field names only
  const aud = (await c.audit('SLOT_SAVED')).filter((l) => l.siteId === A.id && l.details.includes('T3-OLD'));
  assert.equal(aud.length, 1);
  assert.match(aud[0].details, /created/);
  const edit = await save(A, { id: old.body.slot.id, slotNumber: 'T3-OLD', floorLocation: 'Moved lift lobby', allocation: 'VIP' });
  assert.equal(edit.status, 200);
  const aud2 = (await c.audit('SLOT_SAVED')).find((l) => l.details.includes('updated') && l.details.includes('T3-OLD'));
  assert.match(aud2.details, /changed: floorLocation, allocation/);
  assert.ok(!/Moved lift lobby|VIP/.test(aud2.details), 'no values in the audit entry');
});

test('T-4 [AC-02] a slot holding NOT_AVAILABLE / General Employee / Standard (2.0m): an unrelated edit keeps the old values; a changed field is validated', async () => {
  const id = 'legacy-1';
  const r = await save('site-1', { id, slotNumber: 'LEG-01', floorLocation: 'Level 9 new floor', allocation: 'NOT_AVAILABLE', height: 'Standard (2.0m)', slotType: 'SEDAN', parkingType: 'PUZZLE', basement: 'B1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.slot.floorLocation, 'Level 9 new floor');
  assert.equal(r.body.slot.allocation, 'NOT_AVAILABLE');
  assert.equal(r.body.slot.height, 'Standard (2.0m)');
  const r2 = await save('site-1', { id: 'legacy-2', slotNumber: 'LEG-02', floorLocation: 'Level 9 again' }); // fields left out: kept
  assert.equal(r2.body.slot.allocation, 'General Employee');
  const r3 = await save('site-1', { id, slotNumber: 'LEG-01', allocation: 'VIP' });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.slot.allocation, 'VIP');
  assert.equal(r3.body.slot.height, 'Standard (2.0m)', 'the other legacy value is untouched');
  const bad = await save('site-1', { id, slotNumber: 'LEG-01', allocation: 'NOT_AVAILABLE' }); // changing back to a legacy value is a change: refused
  assert.equal(bad.status, 400);
});

test('T-5 [AC-11/12/14] a used number is a 409 (any case or spaces, even with the old form\'s id); other site is fine; rename onto a used number is a 409; no defaults', async () => {
  const first = await save(A, full('B1-P01-S01'));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const n = await count(A);
  for (const dup of [{ slotNumber: 'B1-P01-S01' }, { slotNumber: '  b1-p01-s01 ' }, { id: 'b1-p01-s01', slotNumber: 'b1-p01-s01' }]) {
    const r = await save(A, full('X', dup));
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.errorCode, 'ERR_DUPLICATE_SLOT');
    assert.equal(r.body.message, 'Slot B1-P01-S01 already exists at this site — edit that slot instead.');
  }
  assert.equal(await count(A), n, 'slot count unchanged');
  const other = await save(B, full('B1-P01-S01'));
  assert.equal(other.status, 200, 'the same number at another site is allowed');
  const second = await save(A, full('B1-P01-S02'));
  const ren = await save(A, { id: second.body.slot.id, slotNumber: 'b1-p01-s01' });
  assert.equal(ren.status, 409, JSON.stringify(ren.body));
  assert.equal((await c.slots(A.id)).find((s) => s.id === second.body.slot.id).slotNumber, 'B1-P01-S02');
  const ok = await save(A, { id: second.body.slot.id, slotNumber: 'B1-P01-S03' });
  assert.equal(ok.status, 200, 'a rename to a free number works');
  // the number-only create of an old client: the id is the lower-case number and never becomes the slot id
  const made = await save(A, full('B1-P01-S09', { id: 'b1-p01-s09' }));
  assert.equal(made.status, 200);
  assert.notEqual(made.body.slot.id, 'b1-p01-s09');
  // no defaults: every field is required on create
  for (const f of ['basement', 'floorLocation', 'slotType', 'height', 'parkingType', 'allocation']) {
    const body = full(`NOREQ-${f}`); delete body[f];
    const r = await save(A, body);
    assert.equal(r.status, 400, `${f}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.field, f);
  }
  assert.ok(!(await c.slots(A.id)).some((s) => /^NOREQ/.test(s.slotNumber)), 'nothing was created with defaults');
});

test('T-5b [AC-11/12] a Master moving a slot to another site is checked against the target site: a used number there is a 409 and nothing is saved; a free number works', async () => {
  const a1 = await save(A, full('MOVE-01'));
  const a2 = await save(A, full('MOVE-02'));
  const b1 = await save(B, full('MOVE-01'));
  for (const r of [a1, a2, b1]) assert.equal(r.status, 200, JSON.stringify(r.body));
  const nA = await count(A); const nB = await count(B);
  const clash = await save(A, { id: a1.body.slot.id, slotNumber: 'MOVE-01', siteId: B.id }); // Master, body siteId = target
  assert.equal(clash.status, 409, JSON.stringify(clash.body));
  assert.equal(clash.body.errorCode, 'ERR_DUPLICATE_SLOT');
  assert.equal(clash.body.message, 'Slot MOVE-01 already exists at this site — edit that slot instead.');
  assert.equal(await count(A), nA, 'site A unchanged');
  assert.equal(await count(B), nB, 'site B unchanged');
  assert.equal((await c.slots(A.id)).find((s) => s.id === a1.body.slot.id)?.siteId, A.id, 'the slot stayed at its site');
  assert.equal((await c.slots(B.id)).filter((s) => s.slotNumber === 'MOVE-01').length, 1, 'site B holds one MOVE-01');
  const moved = await save(A, { id: a2.body.slot.id, slotNumber: 'MOVE-02', siteId: B.id }); // free at B
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.slot.siteId, B.id);
  assert.equal(await count(A), nA - 1);
  assert.equal(await count(B), nB + 1);
  // a plain edit that keeps number and site is not blocked by the check
  const edit = await save(B, { id: b1.body.slot.id, slotNumber: 'MOVE-01', floorLocation: 'Level 2 east' });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
});

test('T-6 [AC-15] startup logs the duplicate count (no numbers, ids or plates) and deletes nothing', async () => {
  const line = srv.getLog().split('\n').find((l) => l.includes('[slots] duplicate slot numbers'));
  assert.ok(line, 'no duplicate log line:\n' + srv.getLog().slice(-1500));
  assert.match(line, /duplicate slot numbers: 1 number\(s\) at 1 site\(s\)\. Delete the extra slots in Inventory\./);
  assert.ok(!/DUP-01|dup-a|dup-b/.test(line), 'the line must hold counts only');
  const dups = (await c.slots('site-1')).filter((s) => s.slotNumber === 'DUP-01');
  assert.equal(dups.length, 2, 'nothing merged or deleted');
  // editing another field of a slot that is already a duplicate still works (only a number change is checked)
  const r = await save('site-1', { id: 'dup-a', slotNumber: 'DUP-01', floorLocation: 'edited' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

// ------------------------------------------------------------------ B3: CSV import and export
test('T-7 [AC-05/13] bulk upload: labels map to codes; unknown values are row errors naming field and value; in-file repeats and existing numbers never make a second slot', async () => {
  const label = { slotNumber: 'imp-1', basement: 'b1', floorLocation: 'Lobby', slotType: 'Compact SUV', height: 'High clearance (2.5 m)', parkingType: 'puzzle', allocation: 'Car Pooling' };
  const bad = { ...label, slotNumber: 'IMP-2', slotType: 'Truck' };
  const r1 = await c.post('master', '/slots/bulk-upload', { slots: [label, bad, { ...label, slotNumber: 'IMP-3' }, { ...label, slotNumber: 'imp-3' }] }, { site: A.id });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const res = r1.body.result;
  assert.equal(res.added, 1);
  assert.deepEqual(res.rows.map((x) => [x.row, x.slotNumber, x.result]), [[1, 'IMP-1', 'added'], [2, 'IMP-2', 'error'], [3, 'IMP-3', 'error'], [4, 'IMP-3', 'error']]);
  assert.match(res.rows[1].errors[0], /Vehicle type must be one of.*\(got "Truck"\)/);
  assert.match(res.rows[2].errors[0], /Slot number repeated in this file \(rows 3, 4\)/);
  const slots = await c.slots(A.id);
  const imp1 = slots.find((s) => s.slotNumber === 'IMP-1');
  assert.deepEqual([imp1.slotType, imp1.height, imp1.parkingType, imp1.allocation, imp1.basement], ['CSUV', '2.5m', 'PUZZLE', 'CAR_POOLING', 'B1']);
  assert.ok(!slots.some((s) => s.slotNumber === 'IMP-2' || s.slotNumber === 'IMP-3'), 'refused rows saved nothing');
  // an existing number updates that slot (row.id ignored), and never creates a second one
  const n = slots.length;
  const r2 = await c.post('master', '/slots/bulk-upload', { slots: [{ ...label, slotNumber: 'IMP-1', id: 'no-such-id', floorLocation: 'Moved', allocation: 'VIP' }] }, { site: A.id });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.deepEqual(r2.body.result.rows.map((x) => x.result), ['updated']);
  const after = await c.slots(A.id);
  assert.equal(after.length, n);
  assert.equal(after.find((s) => s.slotNumber === 'IMP-1').allocation, 'VIP');
  assert.equal(after.find((s) => s.slotNumber === 'IMP-1').id, imp1.id, 'same slot, same id');
});

test('T-9 [AC-06] export = the table: its columns, labels, filters, order, IST file name, formula guard', async () => {
  await save(B, full('EXP-1', { basement: 'B2', floorLocation: '=SUM(A1)', slotType: 'EV', allocation: 'HANDICAP', height: '3.0m' }));
  await save(B, full('EXP-2', { basement: 'B2', status: 'MAINTENANCE' }));
  await save(B, full('EXP-3', { basement: 'B1' }));
  const get = (qs) => c.get('master', `/export/reports?type=slots${qs}`, { site: B.id });
  const all = await get('');
  assert.equal(all.status, 200);
  assert.match(all.headers.get('content-disposition'), /filename="inventory_IFB_\d{4}-\d{2}-\d{2}_\d{4}\.csv"/);
  const lines = all.text.trim().split('\n');
  const cols = '"Slot number","Level","Floor location","Vehicle type","Height","Parking type","Allocation","Status","Current occupant","Length (m)","Pallet level"';
  assert.equal(lines[0], cols);
  const slotsB = await c.slots(B.id);
  assert.equal(lines.length - 1, slotsB.length);
  const f = await get('&basement=B2&status=ALL&search=exp');
  const fl = f.text.trim().split('\n').slice(1);
  assert.equal(fl.length, 2, 'the table filter: level B2 and the search text');
  assert.ok(fl[0].startsWith('"EXP-1"') && fl[1].startsWith('"EXP-2"') || fl[0].startsWith('"EXP-2"'), 'only the filtered rows');
  const row1 = f.text.split('\n').find((l) => l.startsWith('"EXP-1"'));
  assert.ok(row1.includes('"\'=SUM(A1)"'), 'formula guard: ' + row1);
  assert.equal(row1, '"EXP-1","Basement B2","\'=SUM(A1)","EV","Extra high (3.0 m)","Ground","Handicap","Vacant","-","",""', 'labels, the dash for no occupant, empty length and pallet');
  const none = await get('&status=OCCUPIED');
  assert.equal(none.text.trim().split('\n').length, 1, 'header only when nothing matches');
  assert.equal((await c.get('master', '/export/reports?type=slots', { site: B.id })).headers.get('content-type').split(';')[0], 'text/csv');
});

test('T-7b [AC-13] bulk upload: a row with an empty slot number is an error row "Slot number is required." in rows and errors; the other rows still save', async () => {
  const ok = { slotNumber: 'EMP-1', basement: 'B1', floorLocation: 'Lobby', slotType: 'SEDAN', height: '2.0m', parkingType: 'PUZZLE', allocation: 'EMPLOYEE' };
  const n = await count(A);
  const r = await c.post('master', '/slots/bulk-upload', { slots: [{ ...ok, slotNumber: '' }, ok, { ...ok, slotNumber: '   ' }, { ...ok, slotNumber: undefined }] }, { site: A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const res = r.body.result;
  assert.deepEqual(res.rows.map((x) => [x.row, x.result]), [[1, 'error'], [2, 'added'], [3, 'error'], [4, 'error']], 'every input row has a result row');
  for (const i of [0, 2, 3]) assert.deepEqual(res.rows[i].errors, ['Slot number is required.']);
  assert.deepEqual(res.errors, ['Row 1: Slot number is required.', 'Row 3: Slot number is required.', 'Row 4: Slot number is required.']);
  assert.equal(res.added, 1);
  assert.equal(await count(A), n + 1, 'only the valid row was saved');
});

test('T-8 [AC-09] permissions and site scope unchanged on save, bulk and export', async () => {
  const att = await c.mkUser('attI', 'role-gate-attendant', [A.id], 'if');
  const adm = await c.mkUser('admI', 'role-site-manager', [A.id], 'if');
  assert.equal((await save(A, full('PERM-1'), 'attI')).status, 403, 'attendant cannot save');
  assert.equal((await c.post('attI', '/slots/bulk-upload', { slots: [full('PERM-2')] }, { site: A.id })).status, 403);
  assert.equal((await save(B, full('PERM-3'), 'admI')).status, 403, 'a Site Admin cannot write another site');
  assert.equal((await c.get('admI', '/export/reports?type=slots', { site: B.id })).status, 403);
  assert.equal((await save(A, full('PERM-4'), 'admI')).status, 200);
  assert.equal((await c.get('admI', '/export/reports?type=slots', { site: A.id })).status, 200);
  assert.ok(att && adm);
});

// ------------------------------------------------------------------ B4: one-time migration
test('T-10 [AC-07] migration: Master only; dry run changes nothing; apply maps by whole value; NOT_AVAILABLE/unknown untouched and listed; counts-only audit; second apply is a no-op', async () => {
  const sm = await c.mkUser('migSM', 'role-site-manager', [A.id], 'mg');
  assert.equal((await c.post('migSM', '/admin/migrate-slot-fields', { apply: true })).status, 403, 'non-Master refused');
  const get = async () => (await c.slots('site-1')).reduce((m, s) => ({ ...m, [s.id]: s }), {});
  const before = await get();
  const dry = await c.post('master', '/admin/migrate-slot-fields', {});
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.apply, false);
  assert.deepEqual(await get(), before, 'a dry run changes nothing');
  const other = dry.body.sites.find((x) => x.siteId === 'site-mig');
  assert.deepEqual([other.changed.allocation, other.slotsChanged], [1, 1], 'a second site is covered');
  assert.deepEqual(dry.body.changedSlotIds.filter((i) => i.startsWith('mig-')).sort(), ['mig-a', 'mig-e'], 'only slots with a label change');
  const s1 = dry.body.sites.find((x) => x.siteId === 'site-1');
  const un = (f, v) => s1.untouched.find((u) => u.field === f && u.value === v);
  assert.deepEqual(un('slotType', 'Truck').slotIds, ['mig-c']);
  assert.ok(un('allocation', 'NOT_AVAILABLE') && un('height', '1.9 metres'), 'unknown and NOT_AVAILABLE are listed');
  assert.ok(!JSON.stringify(dry.body).match(/plate|occupant/i), 'no plates or occupants');
  const ap = await c.post('master', '/admin/migrate-slot-fields', { apply: true });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  const after = await get();
  assert.deepEqual([after['mig-a'].slotType, after['mig-a'].allocation, after['mig-a'].parkingType, after['mig-a'].height], ['CSUV', 'CAR_POOLING', 'PUZZLE', '2.5m']);
  assert.deepEqual([after['mig-b'].allocation, after['mig-b'].height], ['VIP', '3.0m'], 'codes stay');
  assert.deepEqual([after['mig-c'].slotType, after['mig-c'].allocation, after['mig-c'].height], ['Truck', 'NOT_AVAILABLE', '2.2m'], 'unknown and NOT_AVAILABLE untouched');
  assert.equal(after['mig-d'].height, '1.9 metres');
  const again = await c.post('master', '/admin/migrate-slot-fields', { apply: true });
  assert.equal(again.body.slotsChanged, 0, 'second apply changes nothing');
  const logs = (await c.get('master', '/security/audit-logs?limit=1000')).body;
  const entries = logs.logs.filter((l) => l.action === 'SLOT_FIELDS_MIGRATED');
  assert.ok(entries.length >= 2, 'a per-site entry and a run summary');
  assert.ok(entries.every((l) => !/MIG-0|plate|occupant/i.test(JSON.stringify(l.details))), 'counts only');
  assert.ok(sm);
});
