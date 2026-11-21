// 008 B3 API tests (backend-dev): the 2W zone/name check in POST /slots/save, and createOnly on /slots/bulk-upload.
// Local demo mode for the rule tests; the fake Firestore for the 450-row persistence test (006 T-2 / T-9 style).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, client, slot, persistentServer, MASTER_EMAIL } from './support/pf006.mjs';

const full = (num, extra = {}) => ({ ...slot(num), height: '2.0m', ...extra });
const two = (num, extra = {}) => full(num, { slotType: 'TWO_WHEELER', ...extra });
const zoned = (level, zone, n, extra = {}) => { const p = `${level}-${zone}`; return two(`${p}-${String(n).padStart(3, '0')}`, { basement: level, puzzleNumber: p, floorLocation: `${level} · Zone ${zone}`, ...extra }); };
const legacy = (id, num, extra = {}) => ({ id, siteId: 'site-1', slotNumber: num, basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', parkingType: 'GROUND',
  height: '2.0m', allocation: 'EMPLOYEE', status: 'VACANT', ...extra });
// What an existing site holds today: 2W slots with no zone, and one 2W slot whose puzzleNumber is an old free-text value.
const LOCAL_SLOTS = [legacy('old-2w', 'B2-2W-01', { slotType: 'TWO_WHEELER', basement: 'B2' }),
  legacy('old-2w-p', 'B1-2W-07', { slotType: 'TWO_WHEELER', puzzleNumber: 'P-9' })];

let srv; let c; let A; let B;
before(async () => {
  srv = await startServer({ prepare: (dir) => { mkdirSync(path.join(dir, 'data')); writeFileSync(path.join(dir, 'data', 'pms_store.json'), JSON.stringify({ slots: LOCAL_SLOTS })); } });
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  A = await c.onboard('ZNA', 'Zone Site A');
  B = await c.onboard('ZNB', 'Zone Site B');
});
after(() => srv?.stop());
const save = (s, body) => c.post('master', '/slots/save', { slot: body }, { site: s.id ?? s });
const bulk = (s, rows, extra = {}) => c.post('master', '/slots/bulk-upload', { slots: rows, ...extra }, { site: s.id ?? s });
const find = async (s, num) => (await c.slots(s.id ?? s)).find((x) => x.slotNumber === num);

test('T-3 [AC-09] a zoned 2W slot saves with the built name; the zone is stored in puzzleNumber, upper-case; level case does not matter', async () => {
  const r = await save(A, zoned('B1', 'Z1', 1));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.slot.puzzleNumber, 'B1-Z1'); assert.equal(r.body.slot.slotNumber, 'B1-Z1-001'); assert.equal(r.body.slot.slotType, 'TWO_WHEELER');
  assert.equal((await save(A, zoned('B1', 'Z1', 999))).status, 200);
  assert.equal((await save(A, zoned('B1', 'A2B3C4', 12))).status, 200, '6 characters is the longest zone');
  const g = await save(A, { ...zoned('Ground', 'Z1', 1), puzzleNumber: 'Ground-Z1' }); // slot number is upper-cased by the route; so is the stored zone
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.deepEqual([g.body.slot.puzzleNumber, g.body.slot.slotNumber, g.body.slot.basement], ['GROUND-Z1', 'GROUND-Z1-001', 'Ground']);
  assert.equal((await save(A, { ...zoned('Driveway', 'D', 3), slotNumber: 'driveway-d-003' })).status, 200);
  assert.equal((await find(A, 'B1-Z1-001')).puzzleNumber, 'B1-Z1', 're-read equals');
});

test('T-3 [AC-10] the built name is covered by the 409 rule (case-insensitive, per site)', async () => {
  const r = await save(A, zoned('B1', 'Z1', 1));
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.errorCode, 'ERR_DUPLICATE_SLOT'); assert.equal(r.body.field, 'slotNumber');
  assert.equal((await save(A, { ...zoned('B1', 'Z1', 1), slotNumber: 'b1-z1-001' })).status, 409);
  assert.equal((await c.slots(A.id)).filter((x) => x.slotNumber === 'B1-Z1-001').length, 1, 'still one');
  const other = await save(B, zoned('B1', 'Z1', 1)); // another site may use the same name
  assert.equal(other.status, 200, JSON.stringify(other.body));
  // the number of an existing 4W slot is taken too
  await save(A, full('B1-Z3-001'));
  assert.equal((await save(A, zoned('B1', 'Z3', 1))).status, 409);
});

test('T-3 a zone that does not agree with level or name is a 400 naming the field; nothing is saved', async () => {
  const before = (await c.slots(A.id)).length;
  const bad = [
    ['puzzleNumber', { puzzleNumber: 'B2-Z1' }, 'level differs from the slot level'],
    ['puzzleNumber', { puzzleNumber: 'B1' }, 'no zone'],
    ['puzzleNumber', { puzzleNumber: 'B1-' }, 'empty zone'],
    ['puzzleNumber', { puzzleNumber: 'B1-Z-1', slotNumber: 'B1-Z-1-001' }, 'dash in the zone'],
    ['puzzleNumber', { puzzleNumber: 'B1-z1' }, 'lower-case zone'],
    ['puzzleNumber', { puzzleNumber: 'B1-ABCDEFG', slotNumber: 'B1-ABCDEFG-001' }, 'zone longer than 6'],
    ['puzzleNumber', { puzzleNumber: 'B1 Z1' }, 'space'],
    ['slotNumber', { slotNumber: 'B1-Z2-001' }, 'name from another zone'],
    ['slotNumber', { slotNumber: 'B1-Z1-000' }, 'number 0'],
    ['slotNumber', { slotNumber: 'B1-Z1-1000' }, 'number 1000'],
    ['slotNumber', { slotNumber: 'B1-Z1-01' }, 'not padded to 3'],
    ['slotNumber', { slotNumber: 'B1-Z1-ABC' }, 'not digits'],
    ['slotNumber', { slotNumber: 'B1-Z1' }, 'no number'],
    ['slotNumber', { slotNumber: 'B2-2W-01' }, 'old style name with a zone'],
  ];
  for (const [field, over, why] of bad) {
    const r = await save(A, zoned('B1', 'Z1', 50, over));
    assert.equal(r.status, 400, `${why}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.errorCode, 'ERR_VALIDATION', why); assert.equal(r.body.field, field, why);
    assert.ok(r.body.message && !/undefined|\[object/.test(r.body.message), why);
  }
  assert.equal((await c.slots(A.id)).length, before, 'nothing saved by a refused request');
  // a 400 comes before the 409: a wrong zone on a name that exists is still a 400
  assert.equal((await save(A, zoned('B1', 'Z1', 1, { puzzleNumber: 'B2-Z1' }))).status, 400);
});

test('T-3 [AC-12] legacy 2W saves are unchanged: no puzzleNumber, an old name, an old free-text puzzleNumber, and 4W puzzle numbers', async () => {
  const a = await save(A, two('B2-2W-01', { basement: 'B2' }));
  assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.body.slot.puzzleNumber, undefined, 'no zone is made up from the name');
  const free = await save(A, full('B1-P01-S1', { puzzleNumber: 'B1-P01' })); // 4W: a free-text puzzleNumber as before
  assert.equal(free.status, 200); assert.equal(free.body.slot.puzzleNumber, 'B1-P01');
  // existing site-1 slots seeded with the old values
  const s1 = (await c.slots('site-1')).reduce((m, x) => ({ ...m, [x.id]: x }), {});
  assert.ok(s1['old-2w'] && s1['old-2w-p'], 'seeded slots are loaded');
  const e1 = await save('site-1', { id: 'old-2w', slotNumber: 'B2-2W-01', floorLocation: 'edited floor' });
  assert.equal(e1.status, 200, JSON.stringify(e1.body)); assert.equal(e1.body.slot.puzzleNumber, undefined);
  // the editor re-sends the stored old puzzleNumber with an unrelated edit: allowed, kept as it is
  const e2 = await save('site-1', { id: 'old-2w-p', slotNumber: 'B1-2W-07', basement: 'B1', slotType: 'TWO_WHEELER', puzzleNumber: 'P-9', floorLocation: 'edited again' });
  assert.equal(e2.status, 200, JSON.stringify(e2.body)); assert.equal(e2.body.slot.puzzleNumber, 'P-9'); assert.equal(e2.body.slot.floorLocation, 'edited again');
  // but changing the zone, the number or the level of it is checked
  assert.equal((await save('site-1', { id: 'old-2w-p', slotNumber: 'B1-2W-07', puzzleNumber: 'P-8' })).status, 400, 'a new zone must agree with the name');
  assert.equal((await save('site-1', { id: 'old-2w-p', slotNumber: 'B1-2W-08', puzzleNumber: 'P-9' })).status, 400, 'a rename of a zoned slot is checked');
  // clearing a zone is allowed (no puzzleNumber = Unzoned)
  const clr = await save('site-1', { id: 'old-2w-p', slotNumber: 'B1-2W-07', puzzleNumber: '' });
  assert.equal(clr.status, 200, JSON.stringify(clr.body)); assert.equal(clr.body.slot.puzzleNumber, undefined);
});

test('T-3 [AC-12] "Set zone": PUT by id renames an Unzoned 2W slot to the built name; one slot, nothing automatic; a clash is 409', async () => {
  const made = await save(A, two('B1-2W-05'));
  assert.equal(made.status, 200);
  const id = made.body.slot.id;
  const set = await save(A, { id, slotNumber: 'B1-Z9-005', puzzleNumber: 'B1-Z9', basement: 'B1', slotType: 'TWO_WHEELER', floorLocation: 'B1 · Zone Z9' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.deepEqual([set.body.slot.id, set.body.slot.slotNumber, set.body.slot.puzzleNumber], [id, 'B1-Z9-005', 'B1-Z9'], 'same slot, new name');
  assert.ok(!(await find(A, 'B1-2W-05')), 'old name is gone (no second slot)');
  const untouched = await find(A, 'B2-2W-01');
  assert.equal(untouched.puzzleNumber, undefined, 'other unzoned slots are not changed');
  const clash = await save(A, { id: untouched.id, slotNumber: 'B1-Z9-005', puzzleNumber: 'B1-Z9', basement: 'B1', slotType: 'TWO_WHEELER' });
  assert.equal(clash.status, 409, JSON.stringify(clash.body));
  assert.equal((await find(A, 'B2-2W-01')).id, untouched.id, 'the refused one is unchanged');
  // turning a 4W slot with an old puzzleNumber into a 2W slot is a change of type: checked
  const four = await save(A, full('B1-4W-77', { puzzleNumber: 'P-77' }));
  assert.equal(four.status, 200);
  const toTwo = await save(A, { id: four.body.slot.id, slotNumber: 'B1-4W-77', slotType: 'TWO_WHEELER', puzzleNumber: 'P-77' });
  assert.equal(toTwo.status, 400, JSON.stringify(toTwo.body)); assert.equal(toTwo.body.field, 'puzzleNumber');
});

test('T-3 [AC-11] bulk createOnly: an existing name is a row error and is never updated; new rows are added; no update happens', async () => {
  await save(A, zoned('B1', 'K1', 1, { floorLocation: 'original floor' }));
  const rows = [zoned('B1', 'K1', 1, { floorLocation: 'OVERWRITTEN' }), zoned('B1', 'K1', 2), zoned('B1', 'K1', 3), zoned('B1', 'K1', 3)];
  const r = await bulk(A, rows, { createOnly: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const res = r.body.result;
  assert.deepEqual([res.added, res.updated], [1, 0], 'one new row; nothing updated');
  const byRow = Object.fromEntries(res.rows.map((x) => [x.row, x]));
  assert.equal(byRow[1].result, 'error'); assert.match(byRow[1].errors[0], /already exists at this site/);
  assert.equal(byRow[2].result, 'added');
  assert.equal(byRow[3].result, 'error'); assert.match(byRow[3].errors[0], /repeated in this file/); assert.equal(byRow[4].result, 'error');
  assert.equal((await find(A, 'B1-K1-001')).floorLocation, 'original floor', 'the existing slot was not touched');
  assert.ok(await find(A, 'B1-K1-002')); assert.ok(!(await find(A, 'B1-K1-003')), 'a name repeated in the file is saved by no row');
  // control: without createOnly the same existing name is updated by number (005 CSV import, unchanged)
  const up = await bulk(A, [zoned('B1', 'K1', 1, { floorLocation: 'updated by import' })]);
  assert.deepEqual([up.body.result.added, up.body.result.updated], [0, 1]);
  assert.equal((await find(A, 'B1-K1-001')).floorLocation, 'updated by import');
  // createOnly:false is the same as absent
  const off = await bulk(A, [zoned('B1', 'K1', 1, { floorLocation: 'again' })], { createOnly: false });
  assert.equal(off.body.result.updated, 1);
});

test('T-3 bulk createOnly: only a real boolean is accepted; a zone that does not agree is a row error; sites are separate', async () => {
  const before = (await c.slots(A.id)).length;
  for (const v of ['true', 1, 'yes', null, {}]) {
    const r = await bulk(A, [zoned('B1', 'K2', 1)], { createOnly: v });
    assert.equal(r.status, 400, `createOnly ${JSON.stringify(v)}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.errorCode, 'ERR_VALIDATION'); assert.equal(r.body.field, 'createOnly');
  }
  assert.equal((await c.slots(A.id)).length, before, 'nothing saved by a refused request');
  const r = await bulk(A, [zoned('B1', 'K2', 1, { puzzleNumber: 'B2-K2' }), zoned('B1', 'K2', 2)], { createOnly: true });
  assert.equal(r.body.result.rows[0].result, 'error'); assert.match(r.body.result.rows[0].errors[0], /^Zone must be "B1-"/);
  assert.equal(r.body.result.rows[1].result, 'added');
  // site B has B1-Z1-001 (made above); a createOnly add at site A of the same name is not a clash at B, and B is untouched
  const bz = await find(B, 'B1-Z1-001');
  const other = await bulk(B, [zoned('B1', 'K3', 1)], { createOnly: true });
  assert.equal(other.body.result.added, 1);
  assert.equal((await find(B, 'B1-Z1-001')).id, bz.id);
  assert.ok(!(await find(A, 'B1-K3-001')), 'the row went to the caller\'s site only');
  const foreign = await bulk(A, [zoned('B1', 'K4', 1, { siteId: B.id })], { createOnly: true });
  assert.ok(foreign.status >= 400 || !(await find(B, 'B1-K4-001')), 'a row siteId for another site is still refused (stampBulkRows)');
});

test('T-9 [AC-11] a 450-row zoned bulk add is saved in batches of at most 400, answered after the save, and survives a restart', async () => {
  const fx = await persistentServer();
  try {
    let cc = fx.c;
    const site = await cc.onboard('Z9', 'Zone persist');
    const rows = Array.from({ length: 450 }, (_, i) => zoned('B1', 'Z1', i + 1));
    const before = (await fx.srv.report()).commits.length;
    const up = await cc.post('master', '/slots/bulk-upload', { slots: rows, createOnly: true }, { site: site.id });
    assert.equal(up.status, 200, JSON.stringify(up.body).slice(0, 300));
    assert.deepEqual([up.body.result.added, up.body.result.updated, up.body.result.errors.length], [450, 0, 0]);
    const slotCommits = (await fx.srv.report()).commits.slice(before).filter((cm) => cm.collections.includes('slots'));
    assert.ok(slotCommits.length >= 2 && slotCommits.every((cm) => cm.ops <= 400), `batches: ${slotCommits.map((x) => x.ops)}`);
    assert.equal(slotCommits.reduce((n, cm) => n + cm.ops, 0), 450, 'every new slot written once');
    assert.equal((await fx.srv.counters()).untargetedAfterReady, 0, 'targeted saves only');
    // a clash with the whole range is 450 row errors, nothing written, nothing changed
    const again = await cc.post('master', '/slots/bulk-upload', { slots: rows, createOnly: true }, { site: site.id });
    assert.deepEqual([again.body.result.added, again.body.result.errors.length], [0, 450]);
    ({ c: cc } = await fx.restart());
    const after = await cc.slots(site.id);
    assert.equal(after.length, 450);
    const s = after.find((x) => x.slotNumber === 'B1-Z1-450');
    assert.deepEqual([s.puzzleNumber, s.slotType, s.siteId], ['B1-Z1', 'TWO_WHEELER', site.id]);
  } finally { fx.stop(); }
});

test('T-9 a bulk add that cannot be saved is answered 503 and leaves no rows in memory (006 D5)', async () => {
  const fx = await persistentServer();
  try {
    const cc = fx.c;
    const site = await cc.onboard('Z8', 'Zone failure');
    await fx.srv.fail('slots', 1);
    const up = await cc.post('master', '/slots/bulk-upload', { slots: [zoned('B1', 'Z1', 1), zoned('B1', 'Z1', 2)], createOnly: true }, { site: site.id });
    assert.equal(up.status, 503, JSON.stringify(up.body)); assert.equal(up.body.errorCode, 'ERR_PERSIST_FAILED');
    assert.equal((await cc.slots(site.id)).length, 0, 'rolled back');
    const ok = await cc.post('master', '/slots/bulk-upload', { slots: [zoned('B1', 'Z1', 1), zoned('B1', 'Z1', 2)], createOnly: true }, { site: site.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.result.added, 2, 'the retry works');
  } finally { fx.stop(); }
});
