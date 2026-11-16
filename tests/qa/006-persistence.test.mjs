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

test('T-2 [D2, AC-02] a 1,080-row slot upload is written in batches of at most 400 and all 1,080 documents are stored', async () => {
  const fx = await persistentServer();
  try {
    const c = fx.c;
    const site = await c.onboard('T2', 'T2 site');
    const before = (await fx.srv.report()).commits.length;
    const rows = Array.from({ length: 1080 }, (_, i) => fullSlot(`T2-${String(i + 1).padStart(4, '0')}`));
    const up = await c.post('master', '/slots/bulk-upload', { slots: rows }, { site: site.id });
    assert.ok(up.body.success, JSON.stringify(up.body).slice(0, 300));
    assert.equal(up.body.result.added, 1080);
    await sleep(SETTLE);
    const slotCommits = (await fx.srv.report()).commits.slice(before).filter((cm) => cm.collections.includes('slots'));
    assert.equal(slotCommits.length, 3, JSON.stringify(slotCommits));
    assert.ok(slotCommits.every((cm) => cm.ops <= 400), 'each batch is <= 400 writes');
    assert.equal(slotCommits.reduce((n, cm) => n + cm.ops, 0), 1080);
    const stored = fx.ids('slots');
    assert.equal(stored.length, 1080, 'all rows stored (ids unique within the upload)');
    assert.equal(new Set(stored).size, 1080);
    assert.equal((await c.slots(site.id)).length, 1080);
  } finally { fx.stop(); }
});

const SITE_DOC = (id, code) => ({ id, siteCode: code, siteName: `${code} site`, city: 'Pune', status: 'ACTIVE', totalSlots: 2,
  pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 }, onboardedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const SLOT_DOC = (id, siteId, num) => ({ id, siteId, slotNumber: num, basement: 'B1', floorLocation: 'L1', slotType: 'SEDAN', parkingType: 'GROUND',
  height: '2.0m', allocation: 'VISITOR', status: 'VACANT', updatedAt: '2026-09-01T00:00:00.000Z' });
const NOLEFT = (fx, coll, id) => assert.equal(fx.doc(coll, id), undefined, `${coll}/${id} must be gone from Firestore`);

test('T-3 [D3, AC-05] deleted slot, site, user, role, domain and cleared alert are deleted in Firestore and stay deleted after a restart', async () => {
  const fx = await persistentServer();
  try {
    seedDoc(fx, 'sites', SITE_DOC('site-t3', 'T3'));
    seedDoc(fx, 'sites', SITE_DOC('site-t3k', 'T3K'));
    seedDoc(fx, 'slots', SLOT_DOC('slot-t3-del', 'site-t3k', 'T3-DEL'));
    seedDoc(fx, 'slots', SLOT_DOC('slot-t3-free', 'site-t3k', 'T3-FREE'));
    seedDoc(fx, 'appUsers', { id: 'usr-t3', username: 'usr.t3', fullName: 'T3 User', email: 'usr.t3@d6-parkflows.test', roleId: 'role-site-manager', roleName: 'Site Facility Manager', siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: ['site-t3k'], status: 'ACTIVE', createdAt: '2026-09-01T00:00:00.000Z' });
    seedDoc(fx, 'appRoles', { id: 'role-t3', roleCode: 'CUSTOM', roleName: 'T3 role', description: 'x', isSystemDefault: false, siteScope: 'ASSIGNED_SITES_ONLY', modulePermissions: {}, createdAt: '2026-09-01T00:00:00.000Z' });
    seedDoc(fx, 'whitelistedDomains', { id: 'dom-t3', domain: 't3.example', addedBy: 'Master', createdAt: '2026-09-01T00:00:00.000Z', isActive: true });
    seedDoc(fx, 'alerts', { id: 'alert-t3', siteId: 'site-t3k', employeeId: 'E-T3', employeeName: 'T3 Person', department: 'Ops', vehicleNumber: 'KA01AB1234', vehicleType: 'SEDAN', mobile: '+91 90000 00000', cutoffTime: '10:30 AM', status: 'NOTIFIED_FCM' });
    let { c } = await fx.restart();
    for (const [coll, id] of [['sites', 'site-t3'], ['slots', 'slot-t3-del'], ['appUsers', 'usr-t3'], ['appRoles', 'role-t3'], ['whitelistedDomains', 'dom-t3'], ['alerts', 'alert-t3']]) {
      assert.ok(fx.doc(coll, id), `${coll}/${id} seeded and loaded`);
    }
    const ok = (r, what) => assert.ok(r.body.success !== false && r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await c.post('master', '/slots/delete', { slotId: 'slot-t3-del' }, { site: 'site-t3k' }), 'slot delete');
    ok(await c.post('master', '/sites/delete', { siteId: 'site-t3' }), 'site delete');
    ok(await c.call('master', 'DELETE', '/rbac/users/usr-t3'), 'user delete');
    ok(await c.call('master', 'DELETE', '/rbac/roles/role-t3'), 'role delete');
    ok(await c.post('master', '/domains/remove', { domainId: 'dom-t3' }), 'domain remove');
    // an entry for the plate that was flagged clears its alert
    const entry = await c.post('master', '/vehicles/entry', { vehicleNumber: 'KA01AB1234', vehicleType: 'SEDAN', entryType: 'MANUAL' }, { site: 'site-t3k' });
    assert.ok(entry.body.success, JSON.stringify(entry.body));
    await sleep(SETTLE);
    for (const [coll, id] of [['sites', 'site-t3'], ['slots', 'slot-t3-del'], ['appUsers', 'usr-t3'], ['appRoles', 'role-t3'], ['whitelistedDomains', 'dom-t3'], ['alerts', 'alert-t3']]) NOLEFT(fx, coll, id);
    assert.ok(fx.doc('slots', 'slot-t3-free') || fx.doc('slots', entry.body.slot.id), 'the other slot is untouched');
    // restart: reload everything from Firestore; nothing comes back
    ({ c } = await fx.restart());
    assert.ok(!(await c.get('master', '/sites')).body.sites.some((x) => x.id === 'site-t3'), 'site stays deleted');
    assert.ok(!(await c.slots('site-t3k')).some((x) => x.id === 'slot-t3-del'), 'slot stays deleted');
    assert.ok(!(await c.get('master', '/rbac/users')).body.users.some((x) => x.id === 'usr-t3'), 'user stays deleted');
    assert.ok(!(await c.get('master', '/rbac/roles')).body.roles.some((x) => x.id === 'role-t3'), 'role stays deleted');
    assert.ok(!fx.read().alerts?.some((x) => x.id === 'alert-t3'));
  } finally { fx.stop(); }
});

test('T-4 [D4, AC-03] every admin write is stored by its own targeted save, with no full sync', async () => {
  const fx = await persistentServer();
  try {
    const c = fx.c;
    const before = await fx.srv.counters();
    const site = await c.onboard('T4', 'T4 site');
    await sleep(SETTLE);
    assert.ok(fx.doc('sites', site.id), 'site stored');
    const st = await c.post('master', '/sites/status', { siteId: site.id, status: 'ACTIVE' });
    assert.ok(st.status < 300, JSON.stringify(st.body));
    const pr = await c.post('master', '/sites/pricing', { siteId: site.id, pricing: { hourlyRate: 77, dailyMaxRate: 400, monthlyPassRate: 3000, currency: 'INR', taxPercentage: 18 } });
    assert.ok(pr.status < 300, JSON.stringify(pr.body));
    const user = await c.call('master', 'POST', '/rbac/users', { body: { username: 't4.user', fullName: 'T4 User', email: 't4.user@d6-parkflows.test', roleId: 'role-site-manager', siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: [site.id], status: 'ACTIVE', plainPassword: 'Hotfix006Password#2026' } });
    assert.ok(user.status < 300, JSON.stringify(user.body));
    const role = await c.call('master', 'POST', '/rbac/roles', { body: { roleName: 'T4 role', description: 'x', siteScope: 'ASSIGNED_SITES_ONLY', modulePermissions: {} } });
    assert.ok(role.status < 300, JSON.stringify(role.body));
    const dom = await c.post('master', '/domains/add', { domain: 't4.example' });
    assert.ok(dom.status < 300, JSON.stringify(dom.body));
    const inv = await c.post('master', '/invoices/generate', { siteId: site.id, billingPeriod: '2026-10', baseAmount: 1000, notes: 't4' });
    assert.ok(inv.status < 300, JSON.stringify(inv.body));
    await sleep(SETTLE);
    assert.equal(fx.doc('sites', site.id).pricing.hourlyRate, 77, 'pricing change stored');
    assert.ok(fx.ids('appUsers').some((id) => fx.doc('appUsers', id).username === 't4.user'), 'user stored');
    assert.ok(fx.ids('appRoles').some((id) => fx.doc('appRoles', id).roleName === 'T4 role'), 'role stored');
    assert.ok(fx.ids('whitelistedDomains').some((id) => fx.doc('whitelistedDomains', id).domain === 't4.example'), 'domain stored');
    assert.ok(fx.ids('invoices').length >= 1, 'invoice stored');
    const after = await fx.srv.counters();
    assert.equal(after.untargetedAfterReady - (before.untargetedAfterReady || 0), 0, 'no untargeted saveDB() after ready: ' + after.lastUntargetedCaller);
    assert.ok(!/untargeted saveDB/.test(fx.srv.getLog()));
  } finally { fx.stop(); }
});

test('T-5 [D4, AC-06] the full sync writes each collection on its own; one failing collection no longer stops the rest', async () => {
  const fx = await persistentServer({ FAKE_FAIL_COMMITS: 'appRoles:1' });
  try {
    await sleep(SETTLE);
    const log = fx.srv.getLog();
    const lines = log.split('\n').filter((l) => l.includes('"event":"PERSIST_FAILED"'));
    assert.equal(lines.length, 1, 'one PERSIST_FAILED line for the one failed collection:\n' + log.slice(-1500));
    const j = JSON.parse(lines[0].slice(lines[0].indexOf('{')));
    assert.equal(j.collection, 'appRoles');
    assert.equal(j.scope, 'full-sync');
    assert.ok(fx.ids('appUsers').length >= 1, 'users were still written after roles failed');
    assert.equal(fx.ids('appRoles').length, 0, 'the failed collection is the only one missing');
  } finally { fx.stop(); }
});

const persistLines = (log) => log.split('\n').filter((l) => l.includes('"event":"PERSIST_FAILED"')).map((l) => JSON.parse(l.slice(l.indexOf('{'))));

test('T-6 [D5, AC-04/07] a write that cannot be saved answers 503, is rolled back, and is logged with ids only', async () => {
  const fx = await persistentServer();
  try {
    const c = fx.c;
    const site = await c.onboard('T6', 'T6 Secret Site Name');
    const up = await c.post('master', '/slots/bulk-upload', { slots: [fullSlot('T6-01'), fullSlot('T6-02')] }, { site: site.id });
    assert.ok(up.body.success, JSON.stringify(up.body));
    const [s1, s2] = await c.slots(site.id);
    // (a) edit fails: 503, memory shows the old values, Firestore unchanged
    await fx.srv.fail('slots', 1);
    const edit = await c.post('master', '/slots/save', { slot: { id: s1.id, slotNumber: s1.slotNumber, floorLocation: 'T6 changed floor' } }, { site: site.id });
    assert.equal(edit.status, 503, JSON.stringify(edit.body));
    assert.equal(edit.body.success, false);
    assert.equal(edit.body.errorCode, 'ERR_PERSIST_FAILED');
    assert.equal(edit.body.message, "Couldn't save — try again.");
    assert.equal((await c.slots(site.id)).find((x) => x.id === s1.id).floorLocation, s1.floorLocation, 'old value is back');
    assert.equal(fx.doc('slots', s1.id).floorLocation, s1.floorLocation);
    // (b) a new site that cannot be stored is not kept in memory
    await fx.srv.fail('sites', 1);
    const on = await c.call('master', 'POST', '/sites/onboard', { body: { siteName: 'T6 Ghost', siteCode: 'T6G', city: 'Pune', totalSlots: 2,
      pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 } } });
    assert.equal(on.status, 503, JSON.stringify(on.body));
    assert.ok(!(await c.get('master', '/sites')).body.sites.some((x) => x.siteCode === 'T6G'), 'failed create is not in memory');
    // (c) a failed delete brings the slot back
    await fx.srv.fail('slots', 1);
    const del = await c.post('master', '/slots/delete', { slotId: s2.id }, { site: site.id });
    assert.equal(del.status, 503, JSON.stringify(del.body));
    assert.ok((await c.slots(site.id)).some((x) => x.id === s2.id), 'slot is back');
    assert.ok(fx.doc('slots', s2.id), 'still stored');
    // the log: one PERSIST_FAILED per failure, ids and route, no personal or business text
    const lines = persistLines(fx.srv.getLog());
    assert.ok(lines.length >= 3, `expected 3 PERSIST_FAILED lines, got ${lines.length}`);
    for (const l of lines) {
      assert.equal(l.scope, 'request');
      assert.equal(l.rolledBack, true);
      assert.ok(/^\/api\/v1\//.test(l.route) && !l.route.includes('?'), l.route);
    }
    assert.ok(lines.some((l) => l.collection === 'slots' && l.ids.includes(s1.id)));
    const raw = fx.srv.getLog();
    assert.ok(!/T6 Secret Site Name|T6 changed floor|T6 Ghost/.test(raw.split('\n').filter((l) => l.includes('PERSIST_FAILED')).join('\n')), 'no names in the failure lines');
    // a retry succeeds and is stored
    const ok = await c.post('master', '/slots/save', { slot: { id: s1.id, slotNumber: s1.slotNumber, floorLocation: 'T6 changed floor' } }, { site: site.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(fx.doc('slots', s1.id).floorLocation, 'T6 changed floor');
  } finally { fx.stop(); }
});

test('T-7 [D5, AC-04] if the write fails and the refresh read fails too, the API holds at ERR_STARTING until the store is reloaded', async () => {
  const fx = await persistentServer();
  try {
    const c = fx.c;
    const site = await c.onboard('T7', 'T7 site');
    const up = await c.post('master', '/slots/bulk-upload', { slots: [fullSlot('T7-01')] }, { site: site.id });
    assert.ok(up.body.success, JSON.stringify(up.body));
    const [s1] = await c.slots(site.id);
    await fx.srv.fail('slots', 1);
    await fx.srv.failGetAll(1);
    const edit = await c.post('master', '/slots/save', { slot: { id: s1.id, slotNumber: s1.slotNumber, floorLocation: 'T7 unsaved' } }, { site: site.id });
    assert.equal(edit.status, 503);
    assert.equal(edit.body.errorCode, 'ERR_STARTING');
    const during = await c.get('master', '/sites');
    assert.equal(during.status, 503);
    assert.equal(during.body.errorCode, 'ERR_STARTING');
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) { await sleep(500); try { ready = (await (await fetch(fx.srv.origin + '/api/v1/health')).json()).ready === true; } catch {} }
    assert.ok(ready, 'the bootstrap retry reloaded the store');
    const after = await c.slots(site.id);
    assert.equal(after.find((x) => x.id === s1.id).floorLocation, s1.floorLocation, 'the unsaved change is gone');
    const l = persistLines(fx.srv.getLog());
    assert.ok(l.some((x) => x.rolledBack === false), 'logged as not rolled back');
  } finally { fx.stop(); }
});

test('T-8 [AC-08] the drift check logs only when Firestore and memory disagree, after a re-check', async () => {
  const fx = await persistentServer({ FAKE_DRIFT_MS: '1500,300' });
  try {
    const c = fx.c;
    const site = await c.onboard('T8', 'T8 site');
    const up = await c.post('master', '/slots/bulk-upload', { slots: [fullSlot('T8-01'), fullSlot('T8-02')] }, { site: site.id });
    assert.ok(up.body.success, JSON.stringify(up.body));
    await sleep(4500); // a few checks while everything is in step
    const drift = (log) => log.split('\n').filter((l) => l.includes('"event":"PERSIST_DRIFT"')).map((l) => JSON.parse(l.slice(l.indexOf('{'))));
    assert.deepEqual(drift(fx.srv.getLog()), [], 'no drift logged while in step');
    const [s1] = await c.slots(site.id);
    await fx.srv.dropDoc('slots', s1.id); // Firestore loses a document behind the server's back
    await sleep(4000);
    const d = drift(fx.srv.getLog());
    assert.ok(d.length >= 1, 'drift logged');
    assert.equal(d[0].collection, 'slots');
    assert.equal(d[0].severity, 'WARNING');
    assert.equal(d[0].memory - d[0].firestore, 1);
    assert.ok(drift(fx.srv.getLog()).every((x) => x.collection === 'slots'), 'only the collection that differs');
  } finally { fx.stop(); }
});
