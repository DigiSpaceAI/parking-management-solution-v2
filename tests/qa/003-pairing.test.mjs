// 003 Live Parking Display: pairing (B5; 03-tech-design v1.2 "Pairing", "Abuse limits").
// The TV shows the code, the admin types it. Owner: backend-dev. node:test, no dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, client, twoSites, sleep, MASTER_EMAIL } from './support/pf003.mjs';

const sel = (o = {}) => ({ levels: [], areas: [], slotIds: [], vehicleClass: 'ALL', ...o });
const tokenOf = (link) => /#k=([A-Za-z0-9_-]{43})$/.exec(link)[1];
const UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36 ' + 'x'.repeat(80);

let srv; let c; let F;
before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F = await twoSites(c, 'pair');
});
after(() => srv?.stop());

const start = (cl = c, ua = UA) => cl.call(null, 'POST', '/screen/pair/start', { body: {}, headers: { 'User-Agent': ua } });
const status = (secret, cl = c) => cl.call(null, 'GET', '/screen/pair/status', { headers: { 'x-pair-secret': secret } });
const bind = (who, id, code, site = F.A.id, cl = c) => cl.post(who, `/displays/${id}/pair`, { code }, { site });
async function mkDisplay(cl = c, site = F.A.id, who = 'adminA') {
  const r = await cl.post(who, '/displays', { name: 'Pair TV', location: 'Ramp', selection: sel({ levels: ['B1'] }) }, { site });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { id: r.body.display.id, token: tokenOf(r.body.link) };
}

test('B5 full flow: start -> WAITING -> admin types the code -> PAIRED token once -> the feed works; the old link retires', async () => {
  const d = await mkDisplay();
  const s = await start();
  assert.equal(s.status, 200);
  assert.match(s.body.code, /^[2-9A-HJKMNP-Z]{6}$/); assert.match(s.body.pairSecret, /^[A-Za-z0-9_-]{43}$/); assert.equal(s.body.expiresIn, 600);
  assert.deepEqual(Object.keys(s.body).sort(), ['code', 'expiresIn', 'pairSecret']);
  assert.deepEqual((await status(s.body.pairSecret)).body, { state: 'WAITING' });
  const typed = `${s.body.code.slice(0, 3).toLowerCase()} ${s.body.code.slice(3)}`; // "k7m 4qp"
  const b = await bind('adminA', d.id, typed);
  assert.equal(b.status, 200, JSON.stringify(b.body)); assert.deepEqual(b.body, { success: true });
  const paired = await status(s.body.pairSecret);
  assert.equal(paired.body.state, 'PAIRED'); assert.match(paired.body.token, /^[A-Za-z0-9_-]{43}$/);
  const again = await status(s.body.pairSecret);
  assert.equal(again.status, 410, 'delivered once'); assert.equal(again.body.errorCode, 'ERR_PAIR_EXPIRED');
  const f = await c.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': paired.body.token } });
  assert.equal(f.status, 200); assert.equal(f.body.place, 'Ramp');
  const old = await c.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': d.token } });
  assert.equal(old.status, 410, 'pairing retires the previous credential');
  const row = (await c.get('adminA', '/displays', { site: F.A.id })).body.displays.find((x) => x.id === d.id);
  assert.ok(row.pairedAt); assert.equal(row.screenAgent, UA.slice(0, 120)); assert.equal(row.screenAgent.length, 120);
  const audit = (await c.audit('DISPLAY_PAIRED')).find((l) => l.targetResource === `display/${d.id}`);
  assert.ok(audit); assert.equal(audit.siteId, F.A.id); assert.equal(audit.ipAddress, 'redacted');
  const text = JSON.stringify(await c.audit());
  for (const secret of [s.body.code, s.body.pairSecret, paired.body.token, crypto.createHash('sha256').update(paired.body.token).digest('hex'), 'Tizen'])
    assert.ok(!text.includes(secret), `audit contains ${secret.slice(0, 12)}...`);
});

test('B5 a code works once; wrong, used and other-site binds get one generic 400; Site B and roles without DISPLAYS are refused', async () => {
  const d = await mkDisplay();
  const d2 = await mkDisplay();
  const s = await start();
  assert.equal((await bind('adminA', d.id, s.body.code)).status, 200);
  const twice = await bind('adminA', d2.id, s.body.code);
  assert.equal(twice.status, 400, 'the second use of a code'); assert.match(twice.body.message, /doesn't match a screen waiting to pair/);
  for (const code of ['', 'ABC', 'K7M4Q0', '222222', 42, null]) {
    const r = await bind('adminA', d2.id, code);
    assert.equal(r.status, 400, `code ${code}`); assert.equal(r.body.message, twice.body.message, 'one generic message');
  }
  const s2 = await start();
  const dB = await mkDisplay(c, F.B.id, 'adminB');
  assert.equal((await bind('adminA', dB.id, s2.body.code)).status, 403, 'a Site A admin cannot bind to a Site B display');
  assert.equal((await bind('adminB', d.id, s2.body.code, F.B.id)).status, 403, 'a Site B admin cannot bind to Site A');
  assert.equal((await bind('attA', d.id, s2.body.code)).status, 403, 'Attendant');
  const va = await c.post('master', `/displays/${d.id}/pair`, { code: s2.body.code }, { site: F.A.id, headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  assert.deepEqual((await status(s2.body.pairSecret)).body, { state: 'WAITING' }, 'refused binds leave the code waiting');
  await c.post('adminA', `/displays/${d2.id}/switch-off`, {}, { site: F.A.id });
  assert.equal((await bind('adminA', d2.id, s2.body.code)).status, 409, 'switched off');
  assert.equal((await status('nope')).status, 410); assert.equal((await status('')).status, 410);
});

test('B5 the 11th console try in 10 minutes -> 429 (per user)', async () => {
  const d = await mkDisplay();
  // adminA has used some tries in earlier tests; a fresh user starts at 0.
  await c.mkUser('pairer', 'role-site-manager', [F.A.id], 'p');
  for (let i = 1; i <= 10; i++) assert.equal((await bind('pairer', d.id, 'ZZZZZZ')).status, 400, `try ${i}`);
  const r = await bind('pairer', d.id, (await start()).body.code);
  assert.equal(r.status, 429, 'the 11th try, even with a right code'); assert.equal(r.body.errorCode, 'ERR_RATE_LIMITED');
  assert.equal((await bind('adminA', d.id, 'ZZZZZZ')).status, 400, 'another user is unaffected');
});

test('B5 the 21st pair/start in a minute -> 429; 41 status polls on one secret -> 429; one redacted row each', async () => {
  const s = await startServer();
  try {
    const cl = client(s);
    await cl.login('master', MASTER_EMAIL);
    const first = await start(cl);
    for (let i = 2; i <= 20; i++) assert.equal((await start(cl)).status, 200, `start ${i}`);
    const r21 = await start(cl);
    assert.equal(r21.status, 429); assert.equal(r21.body.errorCode, 'ERR_RATE_LIMITED');
    for (let i = 1; i <= 40; i++) assert.equal((await status(first.body.pairSecret, cl)).status, 200, `status ${i}`);
    assert.equal((await status(first.body.pairSecret, cl)).status, 429);
    const rows = (await cl.audit('RATE_LIMIT_EXCEEDED')).filter((l) => l.targetResource.startsWith('/api/v1/screen/pair'));
    assert.equal(rows.length, 2, 'one per bucket');
    for (const l of rows) { assert.equal(l.ipAddress, 'redacted'); assert.ok(!('userAgent' in l)); assert.ok(!JSON.stringify(l).includes(first.body.pairSecret)); }
  } finally { s.stop(); }
});

test('B5 an expired code -> 410 for the TV and 400 for the admin; the 201st pending pairing drops the oldest', async () => {
  const s = await startServer({ fake: true, env: { EMPTY_FIRESTORE: '1', PAIR_TTL_MS: '1500', PAIR_START_PER_MIN: '1000' } });
  try {
    const cl = client(s);
    await cl.login('master', MASTER_EMAIL);
    const site = await cl.onboard('PAIRX', 'Pair expiry site');
    await cl.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'X-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const d = (await cl.post('master', '/displays', { name: 'X', location: '', selection: sel({ levels: ['B1'] }) }, { site: site.id })).body.display;
    const p = await start(cl);
    assert.equal(p.body.expiresIn, 2);
    await sleep(1700);
    const st = await status(p.body.pairSecret, cl);
    assert.equal(st.status, 410); assert.equal(st.body.errorCode, 'ERR_PAIR_EXPIRED');
    const late = await cl.post('master', `/displays/${d.id}/pair`, { code: p.body.code }, { site: site.id });
    assert.equal(late.status, 400, 'an expired code is not accepted');
  } finally { s.stop(); }
  const s2 = await startServer({ fake: true, env: { EMPTY_FIRESTORE: '1', PAIR_START_PER_MIN: '1000' } });
  try {
    const cl = client(s2);
    const all = [];
    for (let i = 0; i < 201; i++) { const r = await start(cl); assert.equal(r.status, 200); all.push(r.body); }
    assert.equal((await status(all[0].pairSecret, cl)).status, 410, 'the oldest was dropped');
    assert.equal((await status(all[1].pairSecret, cl)).status, 200, 'the second-oldest is still waiting');
    assert.equal((await status(all[200].pairSecret, cl)).status, 200, 'the newest is waiting');
  } finally { s2.stop(); }
});
