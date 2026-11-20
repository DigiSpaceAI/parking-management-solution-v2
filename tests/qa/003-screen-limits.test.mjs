// 003 B4b (03-tech-design v1.3, code review R1-1): missing, malformed and
// unknown display tokens have their own limiter buckets (30/min per client
// key, 600/min total), so garbage can never make a valid TV get 429.
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, sleep, MASTER_EMAIL } from './support/pf003.mjs';

const sel = { levels: ['B1'], areas: [], slotIds: [], vehicleClass: 'ALL' };
const HOP = '198.51.100.7'; // inside the test Hosting range
const CLOUD = { K_SERVICE: 'parkflows-test', DEMO_HOSTING_EGRESS_CIDRS: '198.51.100.0/24' };

async function setup(env = {}) {
  const srv = await startServer({ fake: true, env: { EMPTY_FIRESTORE: '1', ...env } }) // 005/006: Cloud Run mode is live mode, so it needs the fake Firestore;
  const c = client(srv);
  await c.login('master', MASTER_EMAIL);
  const site = await c.onboard('LIM', 'Limits site');
  await c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'L-1', basement: 'B1', floorLocation: 'Level 1 near lift', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
  const mk = async () => {
    const r = await c.post('master', '/displays', { name: 'TV', location: '', selection: sel }, { site: site.id });
    return { id: r.body.display.id, token: /#k=(.+)$/.exec(r.body.link)[1] };
  };
  const poll = (token, xff, extra = {}) => c.call(null, 'GET', '/screen/feed', { headers: { ...(token !== undefined ? { 'x-display-token': token } : {}), ...(xff ? { 'X-Forwarded-For': xff } : {}), ...extra } });
  return { srv, c, site, mk, poll };
}
const burst = async (n, fn, width = 200) => {
  const out = [];
  for (let i = 0; i < n; i += width) out.push(...(await Promise.all(Array.from({ length: Math.min(width, n - i) }, (_, k) => fn(i + k)))));
  return out;
};
const tally = (rs) => rs.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});

test('B4b 1 (R1-1 repro): 3,100 garbage-token requests in a burst, then a valid TV gets 200, and its next 20 polls too', async () => {
  const x = await setup();
  try {
    const tv = await x.mk();
    const t0 = Date.now();
    const garbage = await burst(3100, (i) => x.poll(i % 3 === 0 ? undefined : i % 3 === 1 ? 'garbage' : 'G'.repeat(43)));
    const t = tally(garbage);
    assert.equal((t[401] || 0) + (t[429] || 0), 3100, JSON.stringify(t));
    assert.ok(Date.now() - t0 < 30000, 'a burst');
    assert.equal((await x.poll(tv.token)).status, 200, 'the valid TV right after the flood');
    for (let i = 0; i < 20; i++) assert.equal((await x.poll(tv.token)).status, 200, `poll ${i + 1}`);
  } finally { x.srv.stop(); }
});

test('B4b 2 classes: malformed and well-formed unknown tokens count only in the unknown buckets; a retired token gets 410 and counts only in the known ones', async () => {
  const x = await setup();
  try {
    const tv = await x.mk();
    const old = tv.token;
    const fresh = /#k=(.+)$/.exec((await x.c.post('master', `/displays/${tv.id}/replace`, {}, { site: x.site.id })).body.link)[1];
    // Off Cloud Run every caller here is one client (the socket): its 31st unknown request is refused.
    const unknown = await burst(31, (i) => x.poll(i % 2 ? 'short!' : 'W'.repeat(43)), 1);
    assert.deepEqual(tally(unknown.slice(0, 30)), { 401: 30 });
    assert.equal(unknown[30].status, 429, '31st unknown from one client');
    assert.equal((await x.poll(undefined)).status, 429, 'a missing token is in the same (unknown) bucket');
    // The known buckets are untouched: the retired token still gets its 410, the live one its 200.
    assert.equal((await x.poll(old)).status, 410); assert.equal((await x.poll(fresh)).status, 200);
    // A retired token counts in the known per-credential bucket: its 41st poll is 429, while the live one is fine.
    for (let i = 2; i <= 40; i++) assert.equal((await x.poll(old)).status, 410, `retired poll ${i}`);
    assert.equal((await x.poll(old)).status, 429, '41st retired poll');
    assert.equal((await x.poll(fresh)).status, 200);
  } finally { x.srv.stop(); }
});

test('B4b 3 per client (Cloud Run + Hosting range): A is refused at 31, B is not; forged leading hops stay in A; direct callers are keyed on the edge hop', async () => {
  const x = await setup(CLOUD);
  try {
    const A = (forged = '') => `${forged ? forged + ', ' : ''}203.0.113.10, ${HOP}`;
    for (let i = 1; i <= 30; i++) assert.equal((await x.poll('bad', A(`10.0.0.${i}`))).status, 401, `A ${i} (forged leading hop ${i})`);
    assert.equal((await x.poll('bad', A('10.9.9.9'))).status, 429, "A's 31st, even with yet another forged hop");
    assert.equal((await x.poll('bad', `203.0.113.11, ${HOP}`)).status, 401, 'B is a different client: 401, not 429');
    // Direct calls (edge hop not Hosting): the edge hop is the key, whatever is to its left.
    for (let i = 1; i <= 30; i++) assert.equal((await x.poll('bad', `1.1.1.${i}, 192.0.2.50`)).status, 401, `direct ${i}`);
    assert.equal((await x.poll('bad', '9.9.9.9, 192.0.2.50')).status, 429, 'the same edge hop = the same client');
    assert.equal((await x.poll('bad', '192.0.2.51')).status, 401, 'another edge hop = another client');
    const tv = await x.mk();
    assert.equal((await x.poll(tv.token, '192.0.2.50')).status, 200, 'a valid TV is never in these buckets, and a non-Hosting call is not refused');
  } finally { x.srv.stop(); }
});

test('B4b 4 total: 601 unknown requests from rotating clients -> 429 from then on, while a valid TV still gets 200', async () => {
  const x = await setup(CLOUD);
  try {
    const tv = await x.mk();
    const rs = await burst(601, (i) => x.poll('bad', `203.0.${100 + Math.floor(i / 250)}.${(i % 250) + 1}, ${HOP}`), 100);
    const t = tally(rs);
    assert.equal(t[401], 600, JSON.stringify(t)); assert.equal(t[429], 1);
    assert.equal((await x.poll('bad', `203.0.120.1, ${HOP}`)).status, 429, 'a brand-new client: the total is used up');
    assert.equal((await x.poll(tv.token, `203.0.120.2, ${HOP}`)).status, 200, 'the valid TV is unaffected');
  } finally { x.srv.stop(); }
});

test('B4b 5 audit under a 5,000-request flood: one RATE_LIMIT_EXCEEDED per key per window and one SCREEN_UNKNOWN_TOKEN_FLOOD per minute; no IP, UA or token', async () => {
  const x = await setup(CLOUD);
  try {
    const ua = 'FloodBot/1.0';
    await burst(5000, (i) => x.poll(i % 2 ? 'bad' : 'B'.repeat(43), `203.0.${110 + (i % 3)}.${(i % 200) + 1}, ${HOP}`, { 'User-Agent': ua }), 250);
    const rows = (await x.c.audit('RATE_LIMIT_EXCEEDED')).filter((l) => l.targetResource === '/api/v1/screen/feed');
    assert.ok(rows.length >= 1, 'the flood is visible');
    assert.ok(rows.length <= 1 + 600, `at most one per key per window (${rows.length})`);
    assert.equal(rows.filter((l) => /^Screen limit exceeded \(unknown\)\.$/.test(l.details)).length, rows.length, 'the key shows only as "unknown"');
    assert.equal((await x.c.audit('SCREEN_UNKNOWN_TOKEN_FLOOD')).length, 0, 'not before the minute is over');
    await sleep(61500); // the flood report covers a whole minute
    const flood = await x.c.audit('SCREEN_UNKNOWN_TOKEN_FLOOD');
    assert.equal(flood.length, 1, 'one per minute');
    assert.match(flood[0].details, /^\d+ feed request\(s\) with a missing or unknown display token refused in the last minute\.$/);
    assert.ok(Number(flood[0].details.split(' ')[0]) >= 4000, flood[0].details);
    for (const l of [...rows, ...flood]) {
      assert.equal(l.ipAddress, 'redacted'); assert.ok(!('userAgent' in l));
      const t = JSON.stringify(l);
      assert.ok(!t.includes('203.0.11') && !t.includes(HOP) && !t.includes(ua) && !t.includes('BBBBBBBB'), t);
    }
  } finally { x.srv.stop(); }
});

test('B4b 6 no regression: the demo route still refuses non-Hosting calls (requireHosting: true)', async () => {
  const x = await setup(CLOUD);
  try {
    const r = await x.c.call(null, 'POST', '/demo-requests', { body: { name: 'A' }, headers: { 'X-Forwarded-For': '203.0.113.5, 192.0.2.50' } });
    assert.equal(r.status, 403); assert.equal(r.body.errorCode, 'ERR_VIA_HOSTING_ONLY');
    const ok = await x.c.call(null, 'POST', '/demo-requests', { body: { pf_hp_field: 'bot' }, headers: { 'X-Forwarded-For': `203.0.113.5, ${HOP}` } });
    assert.equal(ok.status, 200, 'through Hosting it is accepted (honeypot)');
  } finally { x.srv.stop(); }
});

test('R2-1 / S3-9: 3,100 requests on one live link and on one retired link, then a different valid TV still gets 200', async () => {
  const x = await setup();
  try {
    const flooded = await x.mk();
    const other = await x.mk();
    const replaced = await x.mk();
    const retired = replaced.token;
    assert.equal((await x.c.post("master", `/displays/${replaced.id}/replace`, {}, { site: x.site.id })).status, 200);
    const live = tally(await burst(3100, () => x.poll(flooded.token)));
    assert.equal(live[200], 40, `the live link gets its own 40: ${JSON.stringify(live)}`);
    assert.equal(live[429], 3060);
    assert.equal((await x.poll(other.token)).status, 200, 'a different valid TV after the live-link flood');
    const old = tally(await burst(3100, () => x.poll(retired)));
    assert.equal(old[410], 40, `the retired link gets its own 40 answers: ${JSON.stringify(old)}`);
    assert.equal(old[429], 3060);
    assert.equal((await x.poll(other.token)).status, 200, 'a different valid TV after the retired-link flood');
    for (let i = 0; i < 20; i++) assert.equal((await x.poll(other.token)).status, 200, `and its next polls (${i + 1})`);
  } finally { x.srv.stop(); }
});
