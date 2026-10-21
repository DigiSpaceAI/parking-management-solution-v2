// 003 Live Parking Display, console API (03-tech-design v1.2, B1 + B2). Owner: backend-dev.
// Runner: node:test + global fetch, no dependencies (npm run test:qa).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, client, twoSites, seededServer, MASTER_EMAIL } from './support/pf003.mjs';
import { newDisplayToken, hashSecret, TOKEN_FORMAT, newPairCode, normalizePairCode, PAIR_ALPHABET, displayLink } from '../../src/server/displayToken.ts';

let srv; let c; let F;
before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F = await twoSites(c, 'dsp');
});
after(() => srv?.stop());

const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const create = (who, site, body) => c.post(who, '/displays', { name: 'Entrance TV', location: 'Main entrance', selection: sel({ levels: ['B1'] }), ...body }, { site });
const NO_SECRETS = /tokenHash|retiredTokenHashes|"token"|pairSecret|pairCode|#k=/;

// ------------------------------------------------------------------ B1
test('B1 AC-01/02: a Site Admin creates and edits a display at Site A; it is listed only there', async () => {
  const r = await create('adminA', F.A.id, { selection: sel({ levels: ['B1'], areas: [{ level: 'B2', parkingType: 'GROUND' }], vehicleClass: '4W' }), pageSeconds: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.display;
  assert.equal(d.siteId, F.A.id); assert.equal(d.pageSeconds, 10); assert.deepEqual(d.hours, { mode: 'ALWAYS' });
  assert.equal(d.slotCount, 7, 'B1 (5) + B2 open bays 4W (2); the B2 two-wheeler is excluded');
  assert.equal(d.status, 'ACTIVE'); assert.equal(d.online, false); assert.match(d.selectionSummary, /B1/);
  assert.ok(!NO_SECRETS.test(JSON.stringify(d)), 'no credential data in the row');
  const u = await c.post('adminA', `/displays/${d.id}`, { name: 'Entrance TV (left)', hours: { mode: 'DAILY', on: '07:00', off: '22:30' } }, { site: F.A.id });
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.equal(u.body.display.name, 'Entrance TV (left)'); assert.deepEqual(u.body.display.hours, { mode: 'DAILY', on: '07:00', off: '22:30' });
  assert.equal(u.body.display.location, 'Main entrance', 'fields not sent are kept');
  const listA = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays;
  assert.ok(listA.some((x) => x.id === d.id));
  const listB = (await c.get('adminB', '/displays', { site: F.B.id })).body.displays;
  assert.ok(!listB.some((x) => x.id === d.id), 'no Site A rows for Site B');
  const created = (await c.audit('DISPLAY_CREATED')).find((l) => l.targetResource === `display/${d.id}`);
  const updated = (await c.audit('DISPLAY_UPDATED')).find((l) => l.targetResource === `display/${d.id}`);
  assert.ok(created && updated); assert.equal(created.siteId, F.A.id);
  assert.match(updated.details, /name, hours/);
  for (const l of [created, updated]) { assert.equal(l.ipAddress, 'redacted'); assert.ok(!('userAgent' in l)); assert.ok(!NO_SECRETS.test(JSON.stringify(l))); }
});

test('B1 AC-02: validation; a Site B level, area or slot is refused at Site A; empty selection refused', async () => {
  const bad = [
    [{ name: '' }, 'name'], [{ name: 'x'.repeat(61) }, 'name'], [{ location: 'y'.repeat(81) }, 'location'],
    [{ pageSeconds: 4 }, 'pageSeconds'], [{ pageSeconds: 31 }, 'pageSeconds'], [{ pageSeconds: 7.5 }, 'pageSeconds'],
    [{ hours: { mode: 'DAILY', on: '07:00', off: '07:00' } }, 'hours'], [{ hours: { mode: 'DAILY', on: '7:00', off: '22:00' } }, 'hours'], [{ hours: { mode: 'SOMETIMES' } }, 'hours'],
    [{ selection: sel() }, 'selection'],
    [{ selection: sel({ levels: ['B3'] }) }, 'selection'], // B3 exists only at Site B
    [{ selection: sel({ areas: [{ level: 'B1', parkingType: 'STACK' }] }) }, 'selection'],
    [{ selection: sel({ slotIds: [F.slotsB['B-B1-P01'].id] }) }, 'selection'],
    [{ selection: sel({ slotIds: ['slot-nope'] }) }, 'selection'],
    [{ selection: sel({ levels: ['B1'], vehicleClass: '2W' }) }, 'selection'], // no 2W slots on B1
    [{ selection: sel({ levels: ['B1'], vehicleClass: '3W' }) }, 'selection'],
    [{ selection: { levels: 'B1' } }, 'selection'],
  ];
  const before = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.length;
  for (const [patch, field] of bad) {
    const r = await create('adminA', F.A.id, patch);
    assert.equal(r.status, 400, `${JSON.stringify(patch)}: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.errors[field], `${field} message for ${JSON.stringify(patch)}`);
  }
  assert.equal((await c.get('adminA', '/displays', { site: F.A.id })).body.displays.length, before, 'nothing stored');
  const ok = await create('adminA', F.A.id, { selection: sel({ slotIds: [F.slotsA['A-B2-W01'].id], vehicleClass: '2W' }) });
  assert.equal(ok.status, 200, 'a single 2W slot is a valid selection');
  // A body siteId can't move the display: the site comes from resolveSite().
  const moved = await create('master', F.A.id, { siteId: F.B.id });
  assert.equal(moved.body.display?.siteId, F.A.id);
});

test('B1 AC-18: a Site B admin gets 403 on Site A :id routes and sees no Site A rows', async () => {
  const d = (await create('adminA', F.A.id)).body.display;
  const asB = await c.post('adminB', `/displays/${d.id}`, { name: 'Taken over' }, { site: F.B.id });
  assert.equal(asB.status, 403); assert.equal(asB.body.errorCode, 'ERR_SITE_FORBIDDEN');
  const claimA = await c.get('adminB', '/displays', { site: F.A.id });
  assert.equal(claimA.status, 403, 'a Site B admin cannot ask for Site A');
  const opts = await c.get('adminB', '/displays/options', { site: F.A.id });
  assert.equal(opts.status, 403);
  const denied = (await c.audit('CROSS_SITE_ACCESS_DENIED')).filter((l) => l.actor.includes('dspadminb'));
  assert.ok(denied.length >= 1, 'the refusal is audit-logged');
  assert.equal((await c.get('master', `/displays`, { site: F.A.id })).body.displays.find((x) => x.id === d.id).name, 'Entrance TV', 'unchanged');
});

test('B1 AC-19: Attendant, MIS auditor and a custom role get 403 on every display route', async () => {
  const d = (await create('adminA', F.A.id)).body.display;
  for (const who of ['attA', 'misA', 'customA']) {
    for (const [m, url, body] of [['GET', '/displays'], ['GET', '/displays/options'], ['POST', '/displays', { name: 'x', selection: sel({ levels: ['B1'] }) }], ['POST', `/displays/${d.id}`, { name: 'x' }]]) {
      const r = await c.call(who, m, url, { body, site: F.A.id });
      assert.equal(r.status, 403, `${who} ${m} ${url}: ${JSON.stringify(r.body)}`);
    }
  }
});

test('B1 view-as writes are refused; Master ALL is a read-only list', async () => {
  const d = (await create('adminA', F.A.id)).body.display;
  const va = await c.post('master', `/displays/${d.id}`, { name: 'x' }, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const vaCreate = await create('master', F.A.id, { headers: undefined });
  assert.equal(vaCreate.status, 200);
  const vaList = await c.get('master', '/displays', { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(vaList.status, 200, 'view-as can read');
  const all = await c.get('master', '/displays', { site: 'ALL' });
  assert.equal(all.status, 200);
  const sites = new Set(all.body.displays.map((x) => x.siteId));
  assert.ok(sites.has(F.A.id), 'every site, labelled by site');
  for (const [url, body] of [['/displays', { name: 'x', selection: sel({ levels: ['B1'] }) }], [`/displays/${d.id}`, { name: 'x' }]]) {
    const r = await c.post('master', url, body, { site: 'ALL' });
    assert.equal(r.status, 400, url); assert.equal(r.body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  }
  assert.equal((await c.get('adminA', '/displays', { site: 'ALL' })).status, 400, 'a scoped user cannot list ALL');
  const opts = await c.get('master', '/displays/options', { site: 'ALL' });
  assert.equal(opts.status, 400);
});

test('B1 options list the levels, derived areas and slots of the chosen site only', async () => {
  const r = await c.get('adminA', '/displays/options', { site: F.A.id });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.levels, [{ level: 'B1', slots: 5 }, { level: 'B2', slots: 3 }]);
  assert.deepEqual(r.body.areas.map((a) => a.label), ['B1 · Open bays', 'B1 · Puzzles', 'B2 · Open bays']);
  assert.equal(r.body.slots.length, 8);
  assert.ok(r.body.slots.every((s) => s.code.startsWith('A-')), 'no Site B slot');
  assert.ok(!JSON.stringify(r.body).includes('floorLocation') && !JSON.stringify(r.body).includes('near lift'), 'no free-text location');
});

test('B1 AC-19: roles stored before 003 (no DISPLAYS entry) take the default for their role id', async () => {
  const fx = await seededServer((d) => {
    for (const r of d.appRoles || []) if (r.modulePermissions) delete r.modulePermissions.DISPLAYS;
  });
  try {
    const roles = fx.readData().appRoles;
    assert.ok(roles.length >= 5 && roles.every((r) => !r.modulePermissions?.DISPLAYS), 'fixture: no stored DISPLAYS entries');
    const site = await fx.c.onboard('DSPOLD', 'Old roles site');
    await fx.c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'O-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    await fx.c.mkUser('oldAdmin', 'role-site-manager', [site.id]);
    await fx.c.mkUser('oldGate', 'role-gate-attendant', [site.id]);
    const ok = await fx.c.post('oldAdmin', '/displays', { name: 'Old', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
    assert.equal(ok.status, 200, 'Site Facility Manager default = full: ' + JSON.stringify(ok.body));
    assert.equal((await fx.c.get('oldGate', '/displays', { site: site.id })).status, 403, 'Gate attendant default = off');
    assert.ok(fx.readData().appRoles.every((r) => !r.modulePermissions?.DISPLAYS), 'stored roles are not rewritten');
    assert.ok((fx.readData().displays || []).some((x) => x.id === ok.body.display.id), 'targeted sync wrote the display');
  } finally { fx.stop(); }
});

// ------------------------------------------------------------------ B2
const tokenOf = (link) => { const m = /^https:\/\/admin\.parkflows\.in\/tv#k=([A-Za-z0-9_-]{43})$/.exec(link || ''); assert.ok(m, `link shape: ${link}`); return m[1]; };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

test('B2 unit: 10k tokens are unique 43-char base64url (256 bits); pairing codes avoid 0/O/1/I/L', () => {
  const seen = new Set();
  for (let i = 0; i < 10000; i++) { const t = newDisplayToken(); assert.match(t, TOKEN_FORMAT); seen.add(t); }
  assert.equal(seen.size, 10000);
  assert.equal(Buffer.from(newDisplayToken(), 'base64url').length, 32);
  assert.equal(hashSecret('abc'), sha('abc'));
  assert.equal(PAIR_ALPHABET.length, 31); assert.ok(!/[01OIL]/.test(PAIR_ALPHABET));
  const counts = {};
  for (let i = 0; i < 3000; i++) { const c = newPairCode(); assert.match(c, /^[2-9A-HJKMNP-Z]{6}$/); for (const ch of c) counts[ch] = (counts[ch] || 0) + 1; }
  assert.equal(Object.keys(counts).length, 31, 'every symbol used');
  assert.equal(normalizePairCode(' k7m-4qp '), 'K7M4QP'); assert.equal(normalizePairCode('K7M 4QP'), 'K7M4QP');
  assert.equal(normalizePairCode('K7M4Q0'), null); assert.equal(normalizePairCode('K7M4'), null); assert.equal(normalizePairCode(42), null);
  assert.equal(displayLink('x'.repeat(43)), `https://admin.parkflows.in/tv#k=${'x'.repeat(43)}`);
});

test('B2 create returns the link once; replace gives a new one; switch-off is final; no credential anywhere else', async () => {
  const r = await create('adminA', F.A.id, { name: 'Lobby TV' });
  assert.equal(r.status, 200);
  const t1 = tokenOf(r.body.link);
  const id = r.body.display.id;
  assert.equal(r.body.display.setUp, true);
  const rep = await c.post('adminA', `/displays/${id}/replace`, {}, { site: F.A.id });
  assert.equal(rep.status, 200); const t2 = tokenOf(rep.body.link);
  assert.notEqual(t1, t2);
  const replB = await c.post('adminB', `/displays/${id}/replace`, {}, { site: F.B.id });
  assert.equal(replB.status, 403, 'another site\'s admin cannot replace it');
  const offB = await c.post('adminB', `/displays/${id}/switch-off`, {}, { site: F.B.id });
  assert.equal(offB.status, 403);
  assert.equal((await c.post('attA', `/displays/${id}/replace`, {}, { site: F.A.id })).status, 403, 'Attendant: no DISPLAYS');
  const va = await c.post('master', `/displays/${id}/switch-off`, {}, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const off = await c.post('adminA', `/displays/${id}/switch-off`, {}, { site: F.A.id });
  assert.equal(off.status, 200); assert.equal(off.body.display.status, 'SWITCHED_OFF'); assert.equal(off.body.display.setUp, false);
  for (const [url, body] of [[`/displays/${id}/replace`, {}], [`/displays/${id}/switch-off`, {}], [`/displays/${id}`, { name: 'again' }]]) {
    const again = await c.post('adminA', url, body, { site: F.A.id });
    assert.equal(again.status, 409, url); assert.equal(again.body.errorCode, 'ERR_DISPLAY_SWITCHED_OFF');
  }
  assert.ok((await c.get('adminA', '/displays', { site: F.A.id })).body.displays.some((x) => x.id === id && x.status === 'SWITCHED_OFF'), 'stays listed');
  assert.equal((await c.post('adminA', '/displays/dsp-0000000000000000/replace', {}, { site: F.A.id })).status, 404);
  // Deep scan: neither token nor its hash in the list, options or any audit.
  const everything = JSON.stringify([(await c.get('master', '/displays', { site: 'ALL' })).body, (await c.get('adminA', '/displays/options', { site: F.A.id })).body, await c.audit()]);
  for (const t of [t1, t2]) { assert.ok(!everything.includes(t), 'token leaked'); assert.ok(!everything.includes(sha(t)), 'hash leaked'); }
  for (const a of ['DISPLAY_LINK_REPLACED', 'DISPLAY_SWITCHED_OFF']) {
    const l = (await c.audit(a)).find((x) => x.targetResource === `display/${id}`);
    assert.ok(l, a); assert.equal(l.ipAddress, 'redacted'); assert.equal(l.siteId, F.A.id);
  }
});

test('B2 at rest: only the SHA-256 is stored; replaced hashes are kept as retired for 30 days', async () => {
  const fx = await seededServer(() => {});
  try {
    const site = await fx.c.onboard('DSPREST', 'Rest site');
    await fx.c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'R-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const r = await fx.c.post('master', '/displays', { name: 'Rest', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
    const t1 = tokenOf(r.body.link);
    const t2 = tokenOf((await fx.c.post('master', `/displays/${r.body.display.id}/replace`, {}, { site: site.id })).body.link);
    const raw = JSON.stringify(fx.readData());
    assert.ok(!raw.includes(t1) && !raw.includes(t2), 'no token in "Firestore"');
    const d = fx.readData().displays.find((x) => x.id === r.body.display.id);
    assert.equal(d.tokenHash, sha(t2));
    assert.equal(d.retiredTokenHashes.length, 1); assert.equal(d.retiredTokenHashes[0].hash, sha(t1));
    const keepDays = (Date.parse(d.retiredTokenHashes[0].until) - Date.now()) / 86400000;
    assert.ok(keepDays > 29.9 && keepDays <= 30, `kept ${keepDays} days`);
    assert.equal(d.tokenIssuedBy, MASTER_EMAIL);
  } finally { fx.stop(); }
});
