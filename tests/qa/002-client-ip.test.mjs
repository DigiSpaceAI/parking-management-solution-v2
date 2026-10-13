// 002 B6b (03 v1.3 "Demo-request client IP behind Firebase Hosting", review
// 05 R1b M-1 and m-3; PRD AC-32a / AC-32d). Owner: backend-dev.
// Unit tests for src/server/clientIp.ts (Node strips the TypeScript types) and
// API tests against server.ts started as on Cloud Run (K_SERVICE set) with
// DEMO_HOSTING_EGRESS_CIDRS. Runner: node:test + global fetch, no dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHostingCidrs, pickDemoClientIp, normalizeHop, clientKey } from '../../src/server/clientIp.ts';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
const PW = 'B6bClientIpPassword#2026';
const HOP = '198.51.100.7'; // inside the configured Hosting range
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ unit: pickDemoClientIp
const { cidrs } = parseHostingCidrs('198.51.100.0/24');
const pick = (xff, onCloudRun = true, hostingCidrs = cidrs, socketIp = '10.1.2.3') => pickDemoClientIp({ xff, socketIp, onCloudRun, hostingCidrs });

test('B6b unit: off Cloud Run, X-Forwarded-For is ignored and the socket address is used', () => {
  assert.deepEqual(pick(undefined, false), { ok: true, key: '10.1.2.3' });
  assert.deepEqual(pick('203.0.113.9, 198.51.100.7', false), { ok: true, key: '10.1.2.3' });
  assert.deepEqual(pick('203.0.113.9', false, cidrs, '::ffff:127.0.0.1'), { ok: true, key: '127.0.0.1' });
});

test('B6b unit: on Cloud Run the hop left of a Hosting edge hop is the visitor; anything else is refused', () => {
  assert.deepEqual(pick('203.0.113.9, 198.51.100.7'), { ok: true, key: '203.0.113.9' });
  assert.deepEqual(pick('1.1.1.1, 9.9.9.9, 203.0.113.9, 198.51.100.7'), { ok: true, key: '203.0.113.9' }, 'forged leading entries are ignored');
  assert.deepEqual(pick('203.0.113.9, 192.0.2.50'), { ok: false, reason: 'not-via-hosting' });
  assert.deepEqual(pick('198.51.100.7'), { ok: false, reason: 'no-client-hop' });
  assert.deepEqual(pick('unknown, 198.51.100.7'), { ok: false, reason: 'no-client-hop' });
  assert.deepEqual(pick('203.0.113.9, not-an-ip'), { ok: false, reason: 'no-edge-hop' });
  assert.deepEqual(pick(undefined), { ok: false, reason: 'no-edge-hop' });
  assert.deepEqual(pick(' , '), { ok: false, reason: 'no-edge-hop' });
  assert.deepEqual(pick('203.0.113.9, 198.51.100.7', true, parseHostingCidrs('').cidrs), { ok: false, reason: 'not-via-hosting' }, 'empty CIDR list');
});

test('B6b unit: normalisation, IPv6 /64 keys and header lines joined in order', () => {
  assert.equal(normalizeHop('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(normalizeHop('203.0.113.9:5123'), '203.0.113.9');
  assert.equal(normalizeHop('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(normalizeHop('unknown'), null);
  assert.deepEqual(pick('::ffff:203.0.113.9, 198.51.100.7'), { ok: true, key: '203.0.113.9' });
  assert.deepEqual(pick('203.0.113.9:5123, 198.51.100.7'), { ok: true, key: '203.0.113.9' });
  const a = pick('2001:db8:1:2:aaaa::1, 198.51.100.7'); const b = pick('2001:db8:1:2:bbbb:cccc:dddd:2, 198.51.100.7');
  const other = pick('2001:db8:1:3::1, 198.51.100.7');
  assert.ok(a.ok && b.ok && other.ok);
  assert.equal(a.key, b.key, 'same /64, same key'); assert.notEqual(a.key, other.key, 'different /64, different key');
  assert.equal(clientKey('2001:db8:1:2::9'), '2001:db8:1:2::/64');
  assert.deepEqual(pick(['1.1.1.1, 203.0.113.9', '198.51.100.7']), { ok: true, key: '203.0.113.9' }, 'two header lines, joined in order');
  assert.deepEqual(pick(['198.51.100.7', '203.0.113.9']), { ok: false, reason: 'not-via-hosting' }, 'order kept');
});

test('B6b unit: CIDR parsing skips bad entries (reported) and supports IPv6 ranges', () => {
  const { cidrs: c, invalid } = parseHostingCidrs(' bogus , 198.51.100.0/24, 10.0.0.0/33, 1.2.3.4/8/9, 2001:db8:ffff::/48, 192.0.2.10 ');
  assert.deepEqual(invalid, ['bogus', '10.0.0.0/33', '1.2.3.4/8/9']);
  assert.equal(c.count, 3);
  assert.deepEqual(pickDemoClientIp({ xff: '203.0.113.9, 198.51.100.200', socketIp: '', onCloudRun: true, hostingCidrs: c }), { ok: true, key: '203.0.113.9' });
  assert.deepEqual(pickDemoClientIp({ xff: '203.0.113.9, 2001:db8:ffff:1::5', socketIp: '', onCloudRun: true, hostingCidrs: c }), { ok: true, key: '203.0.113.9' }, 'IPv6 Hosting hop');
  assert.deepEqual(pickDemoClientIp({ xff: '203.0.113.9, 192.0.2.10', socketIp: '', onCloudRun: true, hostingCidrs: c }), { ok: true, key: '203.0.113.9' }, 'bare address = /32');
  assert.deepEqual(pickDemoClientIp({ xff: '203.0.113.9, 192.0.2.11', socketIp: '', onCloudRun: true, hostingCidrs: c }), { ok: false, reason: 'not-via-hosting' });
});

// ------------------------------------------------------------------ API
async function startServer(env = {}) {
  const port = 5000 + Math.floor(Math.random() * 900);
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-b6b-'));
  const fullEnv = { ...process.env, NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
    SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'b6b'.repeat(22), K_SERVICE: 'parkflows-test',
    DEMO_HOSTING_EGRESS_CIDRS: 'bogus-entry, 198.51.100.0/24, 2001:db8:ffff::/48',
    PORT: String(port), PF_REPO: REPO, FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', ...env };
  const proc = spawn(path.join(REPO, 'node_modules', '.bin', 'tsx'), [path.join(REPO, 'server.ts')], { cwd: workDir, env: fullEnv, stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  let exited = null; proc.on('exit', (code) => (exited = code));
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 240; i++) {
    if (exited !== null) break;
    try { const h = await fetch(base + '/health'); if (h.ok && (await h.json()).ready !== false) break; } catch {}
    await sleep(250);
  }
  if (exited !== null) throw new Error('server exited:\n' + log.slice(-2000));
  const s = { base, getLog: () => log, stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
  s.call = async (method, url, { body, headers = {}, raw, token } = {}) => {
    const h = { ...(raw === undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
    if (token) h['x-session-token'] = token;
    const res = await fetch(base + url, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  s.login = async () => {
    const r = await s.call('POST', '/auth/login', { body: { identifier: MASTER_EMAIL, password: PW } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); s.token = r.body.token;
  };
  s.list = async () => (await s.call('GET', '/demo-requests', { token: s.token })).body.requests;
  s.audit = async (action) => (await s.call('GET', '/security/audit-logs?limit=1000', { token: s.token })).body.logs.filter((l) => l.action === action);
  return s;
}

const demo = (extra = {}) => ({ name: 'Asha Rao', company: 'Rao Estates', workEmail: 'asha@raoestates.in', phone: '+919820603518',
  city: 'Pune', facilityType: 'Tech campus', preferredContact: 'Email', consent: true, pf_hp_field: '', ...extra });
const honeypot = () => demo({ pf_hp_field: 'filled by a bot' });
const post = (s, xff, body = honeypot(), headers = {}) => s.call('POST', '/demo-requests', { body, headers: { ...(xff ? { 'X-Forwarded-For': xff } : {}), ...headers } });
const via = (ip) => `${ip}, ${HOP}`;

let srv;
before(async () => { srv = await startServer(); await srv.login(); });
after(() => srv?.stop());

test('AC-32a M-1: two visitors through the Hosting proxy get separate buckets', async () => {
  for (let i = 1; i <= 5; i++) assert.equal((await post(srv, via('203.0.113.1'))).status, 200, `A post ${i}`);
  const sixth = await post(srv, via('203.0.113.1'));
  assert.equal(sixth.status, 429); assert.equal(sixth.body.errorCode, 'ERR_RATE_LIMITED');
  assert.equal((await post(srv, via('203.0.113.2'))).status, 200, 'visitor B has its own bucket');
  const n = (await srv.list()).length;
  assert.equal((await post(srv, via('203.0.113.2'), demo({ name: 'Visitor B' }))).status, 200);
  assert.equal((await srv.list()).length, n + 1, "B's valid request is stored");
});

test('AC-32a M-1: forged leading X-Forwarded-For entries do not give a new bucket', async () => {
  for (let i = 1; i <= 5; i++) assert.equal((await post(srv, `10.9.9.${i}, 203.0.113.3, ${HOP}`)).status, 200, `post ${i}`);
  assert.equal((await post(srv, `10.9.9.99, 203.0.113.3, ${HOP}`)).status, 429, '6th with yet another forged entry');
  assert.equal((await post(srv, `2001:db8:5:6::1, ${HOP}`)).status, 200);
  for (let i = 2; i <= 5; i++) assert.equal((await post(srv, `2001:db8:5:6::${i}, ${HOP}`)).status, 200, `IPv6 post ${i}`);
  assert.equal((await post(srv, `2001:db8:5:6:ffff::77, ${HOP}`)).status, 429, 'IPv6: the same /64 shares one bucket');
});

test('AC-32a M-1: a request that did not come through Hosting gets 403 ERR_VIA_HOSTING_ONLY and uses no bucket', async () => {
  const n = (await srv.list()).length;
  for (const xff of ['203.0.113.4, 192.0.2.50', '203.0.113.4', HOP, null]) {
    for (let i = 0; i < 3; i++) {
      const r = await post(srv, xff, demo({ name: 'Direct Caller' }));
      assert.equal(r.status, 403, `xff ${xff}`); assert.equal(r.body.errorCode, 'ERR_VIA_HOSTING_ONLY');
      assert.equal(r.body.message, 'Please use the form on parkflows.in.');
    }
  }
  assert.equal((await srv.list()).length, n, 'nothing stored');
  for (let i = 1; i <= 5; i++) assert.equal((await post(srv, via('203.0.113.4'))).status, 200, `bucket unchanged: post ${i}`);
  assert.equal((await post(srv, via('203.0.113.4'))).status, 429);
});

test('AC-32d m-3: demo-route security events carry no IP or user-agent; 001 routes keep both (trust proxy still 1 hop)', async () => {
  const ua = 'QA-Agent/9.9 (b6b)';
  for (let i = 0; i < 6; i++) await post(srv, via('203.0.113.66'), honeypot(), { 'User-Agent': ua });
  await post(srv, '203.0.113.67, 192.0.2.50', honeypot(), { 'User-Agent': ua });
  const limited = (await srv.audit('RATE_LIMIT_EXCEEDED')).filter((l) => l.targetResource === '/api/v1/demo-requests');
  assert.ok(limited.length >= 1, 'a redacted event is still written, so attacks can be counted');
  for (const l of limited) {
    assert.equal(l.ipAddress, 'redacted'); assert.equal(l.actor, 'anonymous'); assert.ok(!('userAgent' in l), JSON.stringify(l));
    const text = JSON.stringify(l);
    assert.ok(!text.includes('203.0.113.66') && !text.includes('QA-Agent') && !text.includes('198.51.100'), text);
  }
  const notVia = await srv.audit('DEMO_REQUEST_NOT_VIA_HOSTING');
  assert.ok(notVia.length >= 1);
  for (const l of notVia) {
    assert.equal(l.ipAddress, 'redacted'); assert.ok(!('userAgent' in l)); assert.equal(l.status, 'BLOCKED_UNAUTHORIZED');
    assert.ok(!/203\.0\.113|192\.0\.2|QA-Agent/.test(JSON.stringify(l)));
  }
  // A 001 route keeps its full audit, and req.ip is still the rightmost hop (trust proxy 1).
  for (let i = 0; i < 11; i++) {
    await srv.call('POST', '/registrations/submit', { body: {}, headers: { 'X-Forwarded-For': 'spoofed, 203.0.113.200', 'User-Agent': ua } });
  }
  const reg = (await srv.audit('RATE_LIMIT_EXCEEDED')).find((l) => l.targetResource.startsWith('/api/v1/registrations/submit'));
  assert.ok(reg, '001 limiter event written');
  assert.equal(reg.ipAddress, '203.0.113.200', 'one trusted hop: the rightmost address, never the spoofed left one');
  assert.equal(reg.userAgent, ua);
  assert.match(readFileSync(path.join(REPO, 'server.ts'), 'utf-8'), /:\s*1;\s*\napp\.set\('trust proxy', TRUST_PROXY_HOPS\);/, 'default stays 1');
});

test('AC-32a M-1 order: 413/415 count toward that visitor only; refused direct posts do not use the 30-per-hour cap', async () => {
  const E = via('203.0.113.70');
  assert.equal((await srv.call('POST', '/demo-requests', { raw: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': E } })).status, 415);
  assert.equal((await srv.call('POST', '/demo-requests', { raw: 'x', headers: { 'Content-Type': 'text/plain', 'X-Forwarded-For': E } })).status, 415);
  assert.equal((await post(srv, E, demo({ message: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await post(srv, E, demo({ message: 'y'.repeat(9000) }))).status, 413);
  assert.equal((await post(srv, E)).status, 200, '5th');
  assert.equal((await post(srv, E)).status, 429, '6th: the 413s and 415s counted');
  assert.equal((await post(srv, via('203.0.113.71'))).status, 200, 'another visitor is unaffected');

  const s = await startServer();
  try {
    await s.login();
    for (let i = 0; i < 35; i++) assert.equal((await post(s, '203.0.113.90, 192.0.2.50', demo())).status, 403);
    for (let i = 0; i < 30; i++) {
      const r = await post(s, via(`203.0.114.${i + 1}`), demo({ name: `Prospect ${i}` }));
      assert.equal(r.status, 200, `stored ${i + 1}: ${JSON.stringify(r.body)}`);
    }
    const r31 = await post(s, via('203.0.114.200'), demo());
    assert.equal(r31.status, 429, '31st stored in the hour'); assert.equal(r31.body.errorCode, 'ERR_RATE_LIMITED');
    assert.equal((await s.list()).length, 30);
  } finally { s.stop(); }
});

test('AC-32a M-1 fails closed: on Cloud Run with no usable DEMO_HOSTING_EGRESS_CIDRS every demo POST is 403', async () => {
  for (const cidrs of ['', 'not-a-cidr, 10.0.0.0/99']) {
    const s = await startServer({ DEMO_HOSTING_EGRESS_CIDRS: cidrs });
    try {
      await s.login();
      for (const xff of [via('203.0.113.80'), '203.0.113.80', null]) {
        const r = await post(s, xff, demo());
        assert.equal(r.status, 403, `cidrs "${cidrs}", xff ${xff}`); assert.equal(r.body.errorCode, 'ERR_VIA_HOSTING_ONLY');
      }
      assert.equal((await s.list()).length, 0);
      assert.match(s.getLog(), /DEMO_HOSTING_EGRESS_CIDRS is not set/);
      if (cidrs) assert.match(s.getLog(), /ignored 2 invalid entries: not-a-cidr, 10\.0\.0\.0\/99/);
    } finally { s.stop(); }
  }
  assert.match(srv.getLog(), /ignored 1 invalid entry: bogus-entry/, 'a bad entry is warned about; the others still count');
});

test('B6b off Cloud Run (local dev): X-Forwarded-For is ignored, so rotating it cannot dodge the limit', async () => {
  const s = await startServer({ K_SERVICE: '', DEMO_HOSTING_EGRESS_CIDRS: '' });
  try {
    for (let i = 1; i <= 5; i++) assert.equal((await post(s, via(`203.0.113.${100 + i}`))).status, 200, `post ${i}`);
    assert.equal((await post(s, via('203.0.113.150'))).status, 429);
  } finally { s.stop(); }
});
