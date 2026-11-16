// 006 (INC-1) persistence hotfix tests, T-1..T-9 (03-tech-design v1.0).
// Every server runs against the fake Firestore (tests/qa/support/fakeFirestore.mjs),
// which now behaves like the real one for undefined values and records commits.
// Restarting = a new process that reloads everything from the same fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { REPO, MASTER_EMAIL, PW, sleep, startServer, client, slot, persistentServer } from './support/pf006.mjs';

const { FakeFirestore } = await import(pathToFileURL(path.join(REPO, 'tests', 'qa', 'support', 'fakeFirestore.mjs')).href);
const SETTLE = 700; // targeted saves are asynchronous until the reply gate (B5) lands; give them time

const fullSlot = (num, extra = {}) => slot(num, { height: '2.0m', ...extra });

// Put a prepared document into the fake's data file between two runs.
function seedDoc(fx, collection, doc) {
  const data = fx.read();
  data[collection] = [...(data[collection] || []).filter((d) => d.id !== doc.id), doc];
  writeFileSync(fx.dataFile, JSON.stringify(data));
}

test('T-1 [D1, AC-01] the fake rejects undefined like Firestore; a vacated/edited slot is stored and has no stale vehicle', async () => {
  // (a) the fake itself behaves like real Firestore
  const f = new FakeFirestore();
  const b = f.batch();
  assert.throws(() => b.set(f.collection('slots').doc('x'), { id: 'x', currentVehicle: undefined }), /Cannot use "undefined"/);
  f.settings({ ignoreUndefinedProperties: true });
  const b2 = f.batch(); b2.set(f.collection('slots').doc('x'), { id: 'x', currentVehicle: undefined, n: 1 }); await b2.commit();
  assert.deepEqual(f.data.get('slots').get('x'), { id: 'x', n: 1 });

  // (b) the app, with the client setting applied, and (c) with it NOT applied (the app cleans records itself)
  for (const env of [{}, { FAKE_IGNORE_SETTINGS: '1' }]) {
    const fx = await persistentServer(env);
    try {
      const c = fx.c;
      const site = await c.onboard('T1' + (env.FAKE_IGNORE_SETTINGS ? 'B' : 'A'), 'T1 site');
      const up = await c.post('master', '/slots/bulk-upload', { slots: [fullSlot('T1-01', { puzzleNumber: 'P-9' }), fullSlot('T1-02')] }, { site: site.id });
      assert.ok(up.body.success, JSON.stringify(up.body));
      // a vehicle takes a slot (currentVehicle set) ...
      const entry = await c.post('master', '/vehicles/entry', { vehicleNumber: 'KA01AB1234', vehicleType: 'SEDAN', entryType: 'MANUAL' }, { site: site.id });
      assert.ok(entry.body.success, JSON.stringify(entry.body));
      const taken = entry.body.slot;
      await sleep(SETTLE);
      assert.equal(fx.doc('slots', taken.id).currentVehicle, 'KA01AB1234');
      // ... then the Site Admin vacates and edits it (old code sent currentVehicle: undefined)
      const save = await c.post('master', '/slots/save', { slot: { id: taken.id, slotNumber: taken.slotNumber, status: 'VACANT', floorLocation: 'Level 2 moved', puzzleNumber: '' } }, { site: site.id });
      assert.equal(save.status, 200, JSON.stringify(save.body));
      await sleep(SETTLE);
      const stored = fx.doc('slots', taken.id);
      assert.equal(stored.floorLocation, 'Level 2 moved', 'the edit reached Firestore (the whole batch was rejected before)');
      assert.equal(stored.status, 'VACANT');
      assert.ok(!('currentVehicle' in stored), 'a vacated slot keeps no stale vehicle (full replace, not merge)');
      assert.ok(!('puzzleNumber' in stored), 'a cleared field is cleared in Firestore too');
      assert.ok(!/Cannot use "undefined"|Targeted sync failed/.test(fx.srv.getLog()), 'no rejected batch in the log');
    } finally { fx.stop(); }
  }
});
