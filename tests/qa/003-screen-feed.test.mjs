// 003 Live Parking Display: the TV feed (B3) and the public screen surface (B4).
// 03-tech-design v1.2 "The feed", NFR-5, "Outside the session gate".
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, twoSites, seededServer, deepKeys, sleep, MASTER_EMAIL } from './support/pf003.mjs';

let srv; let c; let F;
const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const tokenOf = (link) => /#k=([A-Za-z0-9_-]{43})$/.exec(link)[1];
async function mkDisplay(selection, extra = {}, who = 'adminA', site) {
  const r = await c.post(who, '/displays', { name: 'TV', location: 'Main entrance', selection, ...extra }, { site: site || F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { id: r.body.display.id, token: tokenOf(r.body.link) };
}
const feed = (token, q = '', headers = {}) => c.call(null, 'GET', `/screen/feed${q}`, { headers: { ...(token ? { 'x-display-token': token } : {}), ...headers } });

before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F = await twoSites(c, 'feed');
  // Statuses: one real entry (plate + log + entry time), one Reserved, one Maintenance.
  const e = await c.post('master', '/vehicles/entry', { vehicleNumber: 'MH12AB1234', targetSlotNumber: 'A-B1-P03', remarks: 'Visitor Priya Sharma 9820012345' }, { site: F.A.id });
  assert.ok(e.body.success, JSON.stringify(e.body));
  for (const [code, status] of [['A-B1-G02', 'RESERVED'], ['A-B2-G02', 'MAINTENANCE']]) {
    const r = await c.post('master', '/slots/update-status', { slotId: F.slotsA[code].id, newStatus: status }, { site: F.A.id });
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
  const len = await c.post('master', '/slots/save', { slot: { ...F.slotsA['A-B1-P01'], lengthM: 5.2, palletLevel: 2 } }, { site: F.A.id });
  assert.equal(len.status, 200, JSON.stringify(len.body));
});
after(() => srv?.stop());

// ------------------------------------------------------------------ B3
const ALLOWED = new Set(['v', 'serverTime', 'state', 'place', 'siteName', 'hours', 'mode', 'on', 'off', 'pageSeconds', 'counts', 'free', 'total', 'groups', 'label',
  'override', 'message', 'forcedFull', 'slots', 'code', 'level', 'area', 'type', 'ev', 'parkingType', 'puzzleNumber', 'palletLevel', 'status', 'heightM', 'lengthM', 'plate', 'pinned']); // + override.message's id, text, mode, endsAt (003-overrides)

test('B3 NFR-5: the feed carries only allow-listed keys; plate only on Occupied; no ids, people, times or free text', async () => {
  const d = await mkDisplay(sel({ levels: ['B1', 'B2'] }));
  const r = await feed(d.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  for (const k of deepKeys(r.body)) assert.ok(ALLOWED.has(k), `key "${k}" is not on the NFR-5 allow-list`);
  for (const k of ['id', 'siteId', 'inSince', 'entryTime', 'exitTime', 'name', 'mobile', 'phone', 'employeeId', 'employeeName', 'floorLocation', 'cameraNumber', 'allocation', 'createdBy', 'currentVehicle'])
    assert.ok(!deepKeys(r.body).has(k), `forbidden key ${k}`);
  for (const s of r.body.slots) assert.equal('plate' in s, s.status === 'OCCUPIED', `${s.code}: plate only when occupied`);
  assert.equal(r.body.slots.find((s) => s.code === 'A-B1-P03').plate, 'MH12AB1234');
  const text = r.text;
  for (const leak of ['near lift', 'Priya', '9820012345', F.A.id, F.slotsA['A-B1-P01'].id, 'feedadmina', 'contact']) assert.ok(!text.includes(leak), `leaked ${leak}`);
  const logs = (await c.get('master', '/logs', { site: F.A.id })).body.logs || [];
  const entry = logs.find((l) => l.vehicleNumber === 'MH12AB1234');
  if (entry) assert.ok(!text.includes(entry.entryTime), 'no entry time');
  assert.equal(r.body.place, 'Main entrance'); assert.equal(r.body.siteName, 'feed Site A');
  assert.deepEqual(r.body.override, { message: null, forcedFull: null });
  const p01 = r.body.slots.find((s) => s.code === 'A-B1-P01');
  assert.deepEqual(p01, { code: 'A-B1-P01', level: 'B1', area: 'B1 · Puzzles', type: 'SEDAN', ev: false, parkingType: 'PUZZLE', puzzleNumber: 'P01', palletLevel: 2, status: 'VACANT', heightM: 2, lengthM: 5.2 });
});

test('B3 AC-07/AC-11: Vacant first, then Occupied, Reserved, Maintenance, each by code; vacant EV counts free, Reserved does not', async () => {
  const d = await mkDisplay(sel({ levels: ['B1', 'B2'] }));
  const r = (await feed(d.token)).body;
  assert.equal(r.state, 'OPEN');
  assert.deepEqual(r.slots.map((s) => `${s.status[0]}:${s.code}`), [
    'V:A-B1-G01', 'V:A-B1-P01', 'V:A-B1-P02', 'V:A-B2-G01', 'V:A-B2-W01', 'O:A-B1-P03', 'R:A-B1-G02', 'M:A-B2-G02']);
  assert.equal(r.slots.find((s) => s.code === 'A-B1-P02').ev, true);
  assert.deepEqual(r.counts, { free: 5, total: 8, groups: [{ label: 'B1', free: 3, total: 5 }, { label: 'B2', free: 2, total: 3 }] });
  const area = (await feed((await mkDisplay(sel({ levels: ['B1'], areas: [{ level: 'B2', parkingType: 'GROUND' }], vehicleClass: '4W' }))).token)).body;
  assert.deepEqual(area.counts.groups, [{ label: 'B1', free: 3, total: 5 }, { label: 'B2 · Open bays', free: 1, total: 2 }], 'area group; 2W excluded by 4W');
  const single = (await feed((await mkDisplay(sel({ areas: [{ level: 'B1', parkingType: 'PUZZLE' }], slotIds: [F.slotsA['A-B2-G01'].id] }))).token)).body;
  assert.deepEqual(single.counts.groups, [{ label: 'B1 · Puzzles', free: 2, total: 3 }, { label: 'B2', free: 1, total: 1 }], 'a single slot counts under its level');
  const twoW = (await feed((await mkDisplay(sel({ levels: ['B2'], vehicleClass: '2W' }))).token)).body;
  assert.deepEqual(twoW.slots.map((s) => s.code), ['A-B2-W01']);
});

test('B3 unchanged answers, v changes on a slot change, and the change is visible within 5 s', async () => {
  const d = await mkDisplay(sel({ slotIds: [F.slotsA['A-B1-P01'].id, F.slotsA['A-B1-G01'].id] }));
  const first = (await feed(d.token)).body;
  const same = await feed(d.token, `?v=${first.v}`);
  assert.deepEqual(Object.keys(same.body).sort(), ['serverTime', 'state', 'unchanged', 'v']);
  assert.equal(same.body.unchanged, true); assert.equal(same.body.v, first.v);
  assert.ok(same.text.length < 160, `unchanged reply is small (${same.text.length} bytes)`);
  const t0 = Date.now();
  const e = await c.post('master', '/vehicles/entry', { vehicleNumber: 'KA05MN4321', targetSlotNumber: 'A-B1-G01' }, { site: F.A.id });
  assert.ok(e.body.success, JSON.stringify(e.body));
  let seen = null;
  while (Date.now() - t0 < 5000) {
    const r = await feed(d.token, `?v=${first.v}`);
    if (!r.body.unchanged) { seen = r.body; break; }
    await sleep(200);
  }
  assert.ok(seen, 'change visible within 5 s'); assert.notEqual(seen.v, first.v);
  assert.equal(seen.slots.find((s) => s.code === 'A-B1-G01').status, 'OCCUPIED');
  assert.deepEqual(seen.slots.map((s) => s.code), ['A-B1-P01', 'A-B1-G01'], 'the occupied slot moves behind the vacant one');
  assert.equal(seen.counts.free, 1);
  const x = await c.post('master', '/vehicles/exit', { vehicleNumberOrSlot: 'KA05MN4321' }, { site: F.A.id });
  assert.ok(x.body.success, JSON.stringify(x.body));
});

test('B3 AC-21: deleted slots drop out; none left -> EMPTY, and the console flags it', async () => {
  const add = await c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-TMP-1', basement: 'B3', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'STACK', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: F.A.id });
  assert.ok(add.body.success);
  const tmp = (await c.slots(F.A.id)).find((s) => s.slotNumber === 'A-TMP-1');
  const d = await mkDisplay(sel({ slotIds: [tmp.id] }));
  assert.equal((await feed(d.token)).body.state, 'OPEN');
  const del = await c.post('master', '/slots/delete', { slotId: tmp.id }, { site: F.A.id });
  assert.ok(del.body.success, JSON.stringify(del.body));
  await sleep(1100);
  const r = (await feed(d.token)).body;
  assert.equal(r.state, 'EMPTY'); assert.ok(!('slots' in r)); assert.deepEqual(r.counts, { free: 0, total: 0, groups: [] });
  const row = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.equal(row.missingSlots, 1); assert.equal(row.slotCount, 0);
});

test('B3 AC-22: display hours in IST: closed -> CLOSED with no slots; overnight windows', async () => {
  const istMin = () => Math.floor((((Date.now() + 330 * 60000) % 86400000) + 86400000) % 86400000 / 60000);
  const hm = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const m = istMin();
  const cases = [
    [{ mode: 'DAILY', on: hm(m + 60), off: hm(m + 120) }, 'CLOSED'], // later today
    [{ mode: 'DAILY', on: hm(m + 60), off: hm(m - 60) }, 'CLOSED'], // overnight, not now
    [{ mode: 'DAILY', on: hm(m - 60), off: hm(m - 120) }, 'OPEN'], // overnight, now inside
    [{ mode: 'DAILY', on: hm(m - 60), off: hm(m + 60) }, 'OPEN'],
    [{ mode: 'ALWAYS' }, 'OPEN'],
  ];
  for (const [hours, state] of cases) {
    const d = await mkDisplay(sel({ levels: ['B1'] }), { hours });
    const r = (await feed(d.token)).body;
    assert.equal(r.state, state, JSON.stringify(hours));
    assert.deepEqual(r.hours, hours, 'the TV gets the hours (gap 4)');
    if (state === 'CLOSED') { assert.ok(!('slots' in r)); assert.equal(r.counts.total, 0); }
  }
});

test('B3 credential: unknown/missing -> 401, replaced and switched-off -> 410, the new link works; DISPLAY_CONNECTED once', async () => {
  for (const t of [undefined, '', 'short', 'x'.repeat(43), 'A'.repeat(42) + '!']) {
    const r = await feed(t);
    assert.equal(r.status, 401, `token ${t}`); assert.equal(r.body.errorCode, 'ERR_SCREEN_TOKEN');
    assert.equal(r.body.message, "This display link isn't valid. Ask your site admin.");
  }
  const d = await mkDisplay(sel({ levels: ['B1'] }));
  assert.equal((await feed(d.token)).status, 200);
  await feed(d.token);
  const t2 = tokenOf((await c.post('adminA', `/displays/${d.id}/replace`, {}, { site: F.A.id })).body.link);
  const old = await feed(d.token);
  assert.equal(old.status, 410); assert.equal(old.body.errorCode, 'ERR_SCREEN_OFF');
  assert.equal((await feed(t2)).status, 200, 'the new link works');
  await c.post('adminA', `/displays/${d.id}/switch-off`, {}, { site: F.A.id });
  for (const t of [d.token, t2]) assert.equal((await feed(t)).status, 410, 'every link of a switched-off display -> 410');
  const connected = (await c.audit('DISPLAY_CONNECTED')).filter((l) => l.targetResource === `display/${d.id}`);
  assert.equal(connected.length, 2, 'once per credential (create, replace), not per poll');
  for (const l of connected) { assert.equal(l.ipAddress, 'redacted'); assert.ok(!('userAgent' in l)); assert.equal(l.siteId, F.A.id); }
});

test('B3 AC-05: the credential reads one feed only: no session, no other site, no parameters that matter', async () => {
  const d = await mkDisplay(sel({ slotIds: [F.slotsA['A-B1-P01'].id] }));
  const base = (await feed(d.token)).body;
  for (const [q, h] of [['?siteId=' + F.B.id, {}], ['', { 'x-site-id': F.B.id }], ['?displayId=x&slotIds=' + F.slotsB['B-B1-P01'].id, {}]]) {
    const r = (await feed(d.token, q, h)).body;
    assert.deepEqual(r.slots, base.slots, `ignored: ${q} ${JSON.stringify(h)}`);
  }
  for (const [m, url] of [['GET', '/displays'], ['GET', '/slots'], ['GET', '/auth/me'], ['POST', '/displays']]) {
    assert.equal((await c.call(null, m, url, { site: F.A.id, headers: { 'x-display-token': d.token } })).status, 401, `${m} ${url} with x-display-token`);
    assert.equal((await c.call(null, m, url, { site: F.A.id, headers: { 'x-session-token': d.token } })).status, 401, `${m} ${url} with the token as a session`);
  }
});

test('B3 AC-17: a poll sets last seen (online); the preview returns the feed and never moves last seen', async () => {
  const d = await mkDisplay(sel({ levels: ['B1'] }));
  const row0 = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.equal(row0.online, false); assert.equal(row0.lastSeenAt, null);
  const pv0 = await c.get('adminA', `/displays/${d.id}/preview`, { site: F.A.id });
  assert.equal(pv0.status, 200); assert.equal(pv0.body.state, 'OPEN');
  assert.equal((await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id).lastSeenAt, null, 'preview: not seen');
  await feed(d.token);
  const row1 = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.equal(row1.online, true); assert.ok(row1.lastSeenAt);
  await sleep(1100);
  await c.get('adminA', `/displays/${d.id}/preview`, { site: F.A.id });
  assert.equal((await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id).lastSeenAt, row1.lastSeenAt, 'preview did not move last seen');
  assert.equal((await c.get('adminB', `/displays/${d.id}/preview`, { site: F.B.id })).status, 403);
  assert.equal((await c.get('attA', `/displays/${d.id}/preview`, { site: F.A.id })).status, 403);
});

test('B3 last seen is persisted (targeted) on the first poll, not on every poll', async () => {
  const fx = await seededServer(() => {});
  try {
    const site = await fx.c.onboard('FEEDLS', 'Last seen site');
    await fx.c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'L-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const r = await fx.c.post('master', '/displays', { name: 'LS', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
    const tok = tokenOf(r.body.link);
    const poll = () => fx.c.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': tok } });
    assert.equal((await poll()).status, 200);
    await sleep(1500); // due displays are written together, at most once a second
    const first = fx.readData().displays.find((x) => x.id === r.body.display.id).lastSeenAt;
    assert.ok(first, 'persisted on the first poll');
    await sleep(1100); await poll(); await sleep(1500);
    assert.equal(fx.readData().displays.find((x) => x.id === r.body.display.id).lastSeenAt, first, 'not re-written within 10 min');
  } finally { fx.stop(); }
});

// ------------------------------------------------------------------ B4
test('B4 R1B-S1 style: only GET /api/v1/screen/feed (and its trailing slash) is public; every other spelling or method is gated', async () => {
  const d = await mkDisplay(sel({ levels: ['B1'] }));
  const h = { 'x-display-token': d.token };
  assert.equal((await c.call(null, 'GET', '/displays', { site: F.A.id })).status, 401, '/api/v1/displays with no session');
  const slash = await c.call(null, 'GET', '/screen/feed/', { headers: h });
  assert.equal(slash.status, 200, 'trailing slash = canonical path'); assert.equal(slash.body.state, 'OPEN');
  for (const url of ['/API/V1/screen/feed', '/api/v1/Screen/feed', '/api/v1/screen/FEED', '//api/v1/screen/feed', '/api//v1/screen/feed']) {
    const r = await c.call(null, 'GET', url, { headers: h, absolute: true });
    assert.notEqual(r.status, 200, `${url} must not serve the feed`);
    assert.ok(!r.text.includes('"slots"') && !r.text.includes('"counts"'), `${url} leaked feed data`);
  }
  for (const [m, url] of [['POST', '/screen/feed'], ['PUT', '/screen/feed'], ['DELETE', '/screen/feed'], ['GET', '/screen/feedx'], ['GET', '/screen/'], ['GET', '/screen'],
    ['GET', '/screen/pair/start'], ['POST', '/screen/pair/status'], ['GET', '/screen/pair'], ['GET', '/screen/feed/extra']]) {
    const r = await c.call(null, m, url, { headers: h });
    assert.equal(r.status, 401, `${m} ${url} -> ${r.status}`); assert.equal(r.body.errorCode, 'ERR_SESSION_EXPIRED');
  }
});

test('B4 the 41st poll in a minute from one credential -> 429, one redacted audit row; other displays unaffected', async () => {
  const d = await mkDisplay(sel({ levels: ['B1'] }));
  const other = await mkDisplay(sel({ levels: ['B2'] }));
  for (let i = 1; i <= 40; i++) assert.equal((await feed(d.token)).status, 200, `poll ${i}`);
  const r41 = await feed(d.token);
  assert.equal(r41.status, 429); assert.equal(r41.body.errorCode, 'ERR_RATE_LIMITED'); assert.ok(Number(r41.headers.get('retry-after')) >= 1);
  for (let i = 0; i < 5; i++) assert.equal((await feed(d.token)).status, 429);
  assert.equal((await feed(other.token)).status, 200, 'its own bucket per credential');
  const rows = (await c.audit('RATE_LIMIT_EXCEEDED')).filter((l) => l.details.includes(d.id));
  assert.equal(rows.length, 1, 'one row per bucket and window, not one per refusal');
  const row = rows[0];
  assert.equal(row.ipAddress, 'redacted'); assert.ok(!('userAgent' in row)); assert.equal(row.actor, 'anonymous');
  assert.equal(row.targetResource, '/api/v1/screen/feed'); assert.equal(row.siteId, F.A.id);
  assert.ok(!JSON.stringify(row).includes(d.token));
});

test('B4 100 TVs x 20 polls skip the global /api/ limiter (and logins still work); garbage after them does not touch valid TVs', async () => {
  const s = await startServer();
  try {
    const cl = client(s);
    await cl.login('master', MASTER_EMAIL);
    const site = await cl.onboard('LOADT', 'Load site');
    await cl.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'L-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const tokens = [];
    for (let i = 0; i < 100; i++) {
      const r = await cl.post('master', '/displays', { name: `TV ${i}`, location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id });
      tokens.push(tokenOf(r.body.link));
    }
    const statuses = {};
    for (let round = 0; round < 20; round++) {
      const rs = await Promise.all(tokens.map((t) => cl.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': t } })));
      for (const r of rs) statuses[r.status] = (statuses[r.status] || 0) + 1;
    }
    assert.deepEqual(statuses, { 200: 2000 }, '2,000 polls in well under a minute: none refused (the global limiter is 600/min)');
    const login = await cl.call(null, 'POST', '/auth/login', { body: { identifier: MASTER_EMAIL, password: 'Display003Password#2026' } });
    assert.equal(login.status, 200, 'a login is still not 429');
    // 03 v1.3 (R1-1): unknown tokens have their own buckets; they never make a valid TV 429.
    const junk = await Promise.all(Array.from({ length: 1000 }, () => cl.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': 'Z'.repeat(43) } })));
    assert.ok(junk.every((r) => r.status === 401 || r.status === 429));
    assert.equal((await cl.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': tokens[0] } })).status, 200, 'a valid TV after the garbage');
    assert.equal((await cl.get('master', '/displays', { site: site.id })).status, 200, 'console unaffected');
  } finally { s.stop(); }
});

test('B4 cold start: screen routes answer 503 ERR_STARTING until the store is loaded', async () => {
  const s = await startServer({ fake: true, waitReady: false, env: { FAKE_LOAD_DELAY_MS: '8000' } });
  try {
    const cl = client(s);
    assert.equal((await cl.get(null, '/health')).body.ready, false);
    for (const [m, url] of [['GET', '/screen/feed'], ['POST', '/screen/pair/start'], ['GET', '/screen/pair/status'], ['GET', '/SCREEN/FEED'], ['GET', '/screen/feed/']]) {
      const r = await cl.call(null, m, url, { headers: { 'x-display-token': 'A'.repeat(43), 'x-pair-secret': 'B'.repeat(43) } });
      assert.equal(r.status, 503, `${m} ${url}`); assert.equal(r.body.errorCode, 'ERR_STARTING');
    }
  } finally { s.stop(); }
});
