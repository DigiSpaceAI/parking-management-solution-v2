// 003 + 006 merge: display writes (create, update, pair, retire, delete) reach Firestore by id
// (persistIds) and a failed save is rolled back and answered 503. Runs against the fake
// Firestore (tests/qa/support/fakeFirestore.mjs); a restart is a new process on the same fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { sleep, persistentServer, slot, addSlots } from './support/pf006.mjs';

const sel = (o = {}) => ({ levels: ['B1'], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const mk = (c, site, extra = {}) => c.post('master', '/displays', { name: 'Entrance TV', location: 'Main entrance', selection: sel(), ...extra }, { site });
const list = async (c, site) => (await c.get('master', '/displays', { site })).body.displays;
const putDoc = (fx, collection, doc) => {
  const data = fx.read();
  data[collection] = [...(data[collection] || []).filter((d) => d.id !== doc.id), doc];
  writeFileSync(fx.dataFile, JSON.stringify(data));
};

test('003-persistence: create, update, pair and retire reach Firestore by id and survive a restart', async () => {
  const fx = await persistentServer();
  try {
    let c = fx.c;
    const site = await c.onboard('P3A', 'P3 site A');
    await addSlots(c, site.id, [slot('P3A-01'), slot('P3A-02')]);
    const a = (await mk(c, site.id)).body.display;
    const b = (await mk(c, site.id, { name: 'Exit TV' })).body.display;
    assert.ok(a?.id && b?.id);
    assert.equal(fx.doc('displays', a.id).name, 'Entrance TV', 'create is stored');
    const hash0 = fx.doc('displays', a.id).tokenHash;
    assert.ok(hash0, 'the credential hash (never the token) is stored');

    const up = await c.post('master', `/displays/${a.id}`, { name: 'Entrance TV (left)' }, { site: site.id });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(fx.doc('displays', a.id).name, 'Entrance TV (left)', 'update is stored');

    const start = await (await fetch(`${fx.srv.base}/screen/pair/start`, { method: 'POST' })).json();
    const pr = await c.post('master', `/displays/${a.id}/pair`, { code: start.code }, { site: site.id });
    assert.equal(pr.status, 200, JSON.stringify(pr.body));
    const paired = fx.doc('displays', a.id);
    assert.ok(paired.pairedAt, 'pairing is stored');
    assert.notEqual(paired.tokenHash, hash0, 'the new credential replaced the old one');

    const off = await c.post('master', `/displays/${b.id}/switch-off`, {}, { site: site.id });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(fx.doc('displays', b.id).status, 'SWITCHED_OFF', 'retire is stored');
    assert.equal(fx.doc('displays', b.id).tokenHash, null);

    // restart: a new process loads everything back from the same "Firestore"
    ({ c } = await fx.restart());
    const rows = await list(c, site.id);
    const ra = rows.find((d) => d.id === a.id); const rb = rows.find((d) => d.id === b.id);
    assert.equal(ra?.name, 'Entrance TV (left)');
    assert.equal(rb?.status, 'SWITCHED_OFF');
    assert.equal(fx.doc('displays', a.id).tokenHash, paired.tokenHash, 'nothing rewritten or reset by the restart');
  } finally { fx.stop(); }
});

test('003-persistence: a failed display save is rolled back and answered 503 (create, update, pair, retire)', async () => {
  const fx = await persistentServer();
  try {
    let { c } = fx;
    const site = await c.onboard('P3B', 'P3 site B');
    await addSlots(c, site.id, [slot('P3B-01'), slot('P3B-02')]);
    const a = (await mk(c, site.id)).body.display;
    const before = fx.doc('displays', a.id);

    // create
    await fx.srv.fail('displays');
    const cr = await mk(c, site.id, { name: 'Never stored' });
    assert.equal(cr.status, 503, JSON.stringify(cr.body));
    assert.equal(cr.body.errorCode, 'ERR_PERSIST_FAILED');
    assert.ok(!(await list(c, site.id)).some((d) => d.name === 'Never stored'), 'the unsaved display is gone from memory');
    assert.equal(fx.ids('displays').length, 1, 'and was never stored');

    // update
    await fx.srv.fail('displays');
    const up = await c.post('master', `/displays/${a.id}`, { name: 'Changed' }, { site: site.id });
    assert.equal(up.status, 503, JSON.stringify(up.body));
    assert.equal((await list(c, site.id)).find((d) => d.id === a.id).name, 'Entrance TV', 'rolled back to what is stored');
    assert.equal(fx.doc('displays', a.id).name, 'Entrance TV');

    // pair
    const start = await (await fetch(`${fx.srv.base}/screen/pair/start`, { method: 'POST' })).json();
    await fx.srv.fail('displays');
    const pr = await c.post('master', `/displays/${a.id}/pair`, { code: start.code }, { site: site.id });
    assert.equal(pr.status, 503, JSON.stringify(pr.body));
    assert.equal(fx.doc('displays', a.id).tokenHash, before.tokenHash, 'the stored credential is unchanged');

    // retire
    await fx.srv.fail('displays');
    const off = await c.post('master', `/displays/${a.id}/switch-off`, {}, { site: site.id });
    assert.equal(off.status, 503, JSON.stringify(off.body));
    assert.equal((await list(c, site.id)).find((d) => d.id === a.id).status, 'ACTIVE', 'still active after the failed retire');

    // and the same writes work once Firestore is back
    const ok = await c.post('master', `/displays/${a.id}`, { name: 'Saved' }, { site: site.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    ({ c } = await fx.restart());
    assert.equal((await list(c, site.id)).find((d) => d.id === a.id).name, 'Saved');
  } finally { fx.stop(); }
});

test('003-persistence: the 30-day message delete goes by id; a failed save brings the message back', async () => {
  const fx = await persistentServer();
  try {
    let { c } = fx;
    const site = await c.onboard('P3C', 'P3 site C');
    const old = new Date(Date.now() - 45 * 86400000).toISOString();
    putDoc(fx, 'displayMessages', { id: 'dmsg-0123456789abcdef', siteId: site.id, text: 'Old', mode: 'BANNER', target: { all: true }, clearedFor: [],
      endsAt: old, createdAt: old, createdBy: 'x', endedAt: old, endedBy: 'x', endReason: 'EXPIRED' });
    ({ c } = await fx.restart());
    const body = { text: 'Hello', mode: 'BANNER', target: { all: true } };

    await fx.srv.fail('displayMessages', 2); // the delete and the new message are two writes, both by id
    const bad = await c.post('master', '/displays/messages', body, { site: site.id });
    assert.equal(bad.status, 503, JSON.stringify(bad.body));
    assert.ok(fx.doc('displayMessages', 'dmsg-0123456789abcdef'), 'the old message is still stored after the failed save');

    const good = await c.post('master', '/displays/messages', body, { site: site.id });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    await sleep(100);
    assert.equal(fx.doc('displayMessages', 'dmsg-0123456789abcdef'), undefined, 'deleted from Firestore by id');
    assert.ok(fx.doc('displayMessages', good.body.message.id), 'the new message is stored');
  } finally { fx.stop(); }
});

test('003 + 005: a HATCHBACK slot has its own summary column and the cells add up to the row and the total', async () => {
  const { pathToFileURL } = await import('node:url');
  const { default: path } = await import('node:path');
  const { REPO } = await import('./support/pf006.mjs');
  const { countSlots, SUMMARY_TYPES } = await import(pathToFileURL(path.join(REPO, 'src/utils/slotCounts.ts')).href);
  assert.ok(SUMMARY_TYPES.includes('HATCHBACK'));
  const s = (slotType, status = 'VACANT') => ({ slotType, status, basement: 'B1' });
  const c = countSlots([s('SEDAN'), s('HATCHBACK'), s('HATCHBACK', 'OCCUPIED'), s('TWO_WHEELER')]);
  assert.ok(c.types.includes('HATCHBACK'));
  const row = c.rows[0];
  assert.deepEqual(row.byType.HATCHBACK, { free: 1, total: 2 });
  assert.equal(c.types.reduce((n, t) => n + row.byType[t].total, 0), row.total, 'columns add up to the row');
  assert.equal(c.types.reduce((n, t) => n + c.byType[t].free, 0), c.free, 'and to the total');
});
