// 003, security review 07 S3-2: in-memory pairing and screen-limiter state is
// bounded. Random pair secrets get no per-key bucket; every limiter holds at
// most maxKeys buckets (expired first, then the oldest are dropped); a flood
// keeps the server's memory flat; a real pairing still works during it.
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WindowLimiter } from '../../src/server/screenLimits.ts';
import { startServer, client, MASTER_EMAIL } from './support/pf003.mjs';

test('S3-2 unit: a limiter never holds more than maxKeys buckets; expired buckets go first, then the oldest', () => {
  const l = new WindowLimiter(5, 60_000, 100);
  const t0 = 1_000_000;
  for (let i = 0; i < 10_000; i++) l.hit(`k${i}`, t0 + i);
  assert.equal(l.size, 100, 'bounded');
  assert.equal(l.peek('k9999'), 1, 'the newest is kept'); assert.equal(l.peek('k0'), 0, 'the oldest went first');
  const m = new WindowLimiter(5, 60_000, 3);
  m.hit('old', t0); m.hit('live1', t0 + 50_000); m.hit('live2', t0 + 50_000);
  for (let i = 0; i < 4; i++) m.hit('live1', t0 + 50_001);
  m.hit('new', t0 + 61_000); // 'old' has expired by now; the live ones haven't
  assert.equal(m.peek('old'), 0, 'expired bucket dropped');
  assert.equal(m.peek('live1'), 5, 'a live bucket keeps its count'); assert.equal(m.peek('new'), 1);
  assert.equal(m.hit('live1', t0 + 61_001).ok, false, 'its limit still applies');
});

const sel = { levels: ['B1'], areas: [], slotIds: [], vehicleClass: 'ALL' };
const randomSecret = () => crypto.randomBytes(32).toString('base64url');
async function flood(base, n, width = 250) {
  const statuses = {};
  for (let i = 0; i < n; i += width) {
    const rs = await Promise.all(Array.from({ length: Math.min(width, n - i) }, (_, k) => {
      const j = i + k;
      const headers = j % 10 === 0 ? { 'x-pair-secret': 'malformed!' } : { 'x-pair-secret': randomSecret() };
      return fetch(`${base}/screen/pair/status`, { headers }).then((r) => r.status, () => 0);
    }));
    for (const s of rs) statuses[s] = (statuses[s] || 0) + 1;
  }
  return statuses;
}

test('S3-2 API: two floods of 60,000 random pair secrets keep server memory flat, and a real pairing still works during the flood', async () => {
  const srv = await startServer();
  try {
    const c = client(srv);
    await c.login('master', MASTER_EMAIL);
    const site = await c.onboard('MEM', 'Memory site');
    await c.post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'M-1', basement: 'B1', floorLocation: '', slotType: 'SEDAN', height: '2.0m', parkingType: 'GROUND', allocation: 'EMPLOYEE', status: 'VACANT' }] }, { site: site.id });
    const d = (await c.post('master', '/displays', { name: 'Mem', location: '', selection: sel }, { site: site.id })).body.display;
    // Warm up so the baseline includes normal heap growth, then measure.
    await flood(srv.base, 5000);
    const r0 = srv.rssMb();
    const first = await flood(srv.base, 60_000);
    const r1 = srv.rssMb();
    assert.equal((first[200] || 0), 0, 'no random secret is ever "waiting"');
    assert.ok((first[429] || 0) > 50_000, `the unknown-secret cap refuses the flood: ${JSON.stringify(first)}`);
    // A real TV pairs while the unknown-secret bucket is exhausted.
    const start = await c.call(null, 'POST', '/screen/pair/start', { body: {} });
    assert.equal(start.status, 200);
    assert.deepEqual((await c.call(null, 'GET', '/screen/pair/status', { headers: { 'x-pair-secret': start.body.pairSecret } })).body, { state: 'WAITING' }, 'its own bucket, not the flooded one');
    assert.equal((await c.post('master', `/displays/${d.id}/pair`, { code: start.body.code }, { site: site.id })).status, 200);
    const paired = await c.call(null, 'GET', '/screen/pair/status', { headers: { 'x-pair-secret': start.body.pairSecret } });
    assert.equal(paired.body.state, 'PAIRED');
    assert.equal((await c.call(null, 'GET', '/screen/feed', { headers: { 'x-display-token': paired.body.token } })).status, 200, 'the paired TV gets its feed');
    const second = await flood(srv.base, 60_000);
    const r2 = srv.rssMb();
    assert.ok((second[429] || 0) > 50_000);
    if (r0 === null) { console.log('# /proc not available: memory not measured'); return; }
    console.log(`# server RSS MB: before ${r0.toFixed(1)}, after flood 1 ${r1.toFixed(1)}, after flood 2 ${r2.toFixed(1)}`);
    assert.ok(r1 - r0 < 60, `flood 1 grew RSS by ${(r1 - r0).toFixed(1)} MB (was ~1.5 KB a request before S3-2, ~90 MB here)`);
    assert.ok(r2 - r1 < 25, `flood 2 grew RSS by ${(r2 - r1).toFixed(1)} MB: memory stays flat`);
  } finally { srv.stop(); }
});
