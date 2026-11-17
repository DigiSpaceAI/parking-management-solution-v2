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
