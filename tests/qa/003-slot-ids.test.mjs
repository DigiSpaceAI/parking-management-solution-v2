// 003 code review R1-2: new slot ids are server-made random UUIDs (slot save
// and bulk upload). slot-<ms>-<0..999> collided within one bulk upload, so a
// display, hide or pin could cover two slots and one slot was lost on restart.
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { seededServer, sleep } from './support/pf003.mjs';

const UUID_ID = /^slot-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const row = (i) => ({ slotNumber: `U-${String(i).padStart(4, '0')}`, basement: ['B1', 'B2', 'B3', 'Ground'][i % 4], floorLocation: 'Level 1 near lift', slotType: 'SEDAN',
  height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' });

test('R1-2: one bulk upload of 400 rows gives 400 unique ids, which survive a restart; existing ids are not changed', async () => {
  const legacy = { id: 'slot-1700000000000-42', slotNumber: 'OLD-1', basement: 'B1', floorLocation: 'Level 1 near lift', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' };
  const fx = await seededServer(() => {});
  try {
    const site = await fx.c.onboard('UUID', 'Unique ids site');
    const up = await fx.c.post('master', '/slots/bulk-upload', { slots: Array.from({ length: 400 }, (_, i) => row(i)) }, { site: site.id });
    assert.ok(up.body.success, JSON.stringify(up.body).slice(0, 300));
    const slots = (await fx.c.slots(site.id)).filter((s) => s.slotNumber.startsWith('U-'));
    assert.equal(slots.length, 400);
    const ids = slots.map((s) => s.id);
    assert.equal(new Set(ids).size, 400, 'every id unique');
    for (const id of ids) assert.match(id, UUID_ID);
    // A client-made id for a NEW slot is not used.
    const made = await fx.c.post('master', '/slots/save', { slot: { ...row(9999), id: 'slot-chosen-by-client' } }, { site: site.id });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.match(made.body.slot.id, UUID_ID, 'a new slot never takes the client id');
    await sleep(3500); // past the onboarding's debounced full sync and the targeted slot syncs
    fx.srv.stop();
    // Add a slot with an old-style id, as stored before the fix.
    const data = fx.readData();
    data.slots.push({ ...legacy, siteId: site.id });
    writeFileSync(fx.dataFile, JSON.stringify(data));
    const { srv: s2, c: c2 } = await fx.restart();
    try {
      const after = await c2.slots(site.id);
      const afterIds = new Set(after.filter((s) => s.slotNumber.startsWith('U-') && s.slotNumber !== 'U-9999').map((s) => s.id));
      assert.equal(afterIds.size, 400, 'all 400 slots are back after the restart');
      assert.deepEqual([...afterIds].sort(), [...ids].sort(), 'with the same ids');
      const old = after.find((s) => s.slotNumber === 'OLD-1');
      assert.equal(old?.id, legacy.id, 'an existing old-style id is kept');
      const edit = await c2.post('master', '/slots/save', { slot: { ...old, floorLocation: 'Edited' } }, { site: site.id });
      assert.equal(edit.status, 200, JSON.stringify(edit.body));
      assert.equal(edit.body.slot.id, legacy.id, 'editing an existing slot keeps its id');
      assert.equal((await c2.slots(site.id)).filter((s) => s.slotNumber === 'OLD-1').length, 1);
    } finally { s2.stop(); }
  } finally { fx.stop(); }
});
