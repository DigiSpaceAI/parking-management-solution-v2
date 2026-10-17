// QA R1B-S1 (hotfix/r1b-s1 and feature/002-r1b): every spelling of a protected API path is refused without a
// session; signed-in calls, site scoping and the Android app's lower-case /api/v1 calls still work.
// Runs against a RUNNING, SEEDED server (tests/qa/browser/seed.mjs), raw paths sent exactly as written.
//   QA_BASE_URL=http://127.0.0.1:4081 QA_FIXTURES=<fixtures.json> [QA_R1B=1] node --test tests/qa/002/r1b/r1bs1-paths.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const BASE = new URL(process.env.QA_BASE_URL || 'http://127.0.0.1:4081');
const fx = JSON.parse(readFileSync(process.env.QA_FIXTURES, 'utf8'));
const R1B = !!process.env.QA_R1B;
const PW = 'QaTestPassword#2026';
const MASTER = 'digisolutions.fm@gmail.com';

/** Raw HTTP request: the path is sent byte-for-byte (fetch/URL would normalise it). */
function raw(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const r = http.request({ host: BASE.hostname, port: BASE.port, method, path, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j; try { j = JSON.parse(b); } catch { j = b; } resolve({ status: res.statusCode, json: j, text: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(email) {
  for (let i = 0; i < 10; i++) {
    const r = await raw('POST', '/api/v1/auth/login', { body: { identifier: email, password: PW } });
    if (r.status === 429) { await sleep(6000); continue; }
    assert.equal(r.status, 200, `login ${email}: ${r.status} ${r.text.slice(0, 120)}`);
    return r.json.token;
  }
  throw new Error('login kept getting 429');
}

/** Spellings of a canonical lower-case path /api/v1/<rest>. */
function spellings(p) {
  const rest = p.replace(/^\/api\/v1\//, '');
  const segs = rest.split('/');
  const last = segs.length - 1;
  const lastUp = [...segs.slice(0, last), segs[last].toUpperCase()].join('/');
  const firstCap = [segs[0][0].toUpperCase() + segs[0].slice(1), ...segs.slice(1)].join('/');
  return {
    upper: p.toUpperCase(),
    'API/V1': `/API/V1/${rest}`, 'Api/V1': `/Api/V1/${rest}`, 'api/V1': `/api/V1/${rest}`, 'API/v1': `/API/v1/${rest}`,
    'last segment upper': `/api/v1/${lastUp}`, 'first segment capitalised': `/api/v1/${firstCap}`,
    'trailing /': `${p}/`, 'trailing //': `${p}//`, 'upper + trailing /': `${p.toUpperCase()}/`,
    'leading //': `/${p}`, '/api//v1': `/api//v1/${rest}`, '/v1//': `/api/v1//${rest}`,
    'doubled inner /': `/api/v1/${segs.join('//')}`, 'mixed + //': `/Api//V1/${rest}/`,
  };
}

// Protected routes (001 + R1b). Unknown-on-this-build routes are still behind the gate (401 before routing).
const ROUTES = [
  ['GET', '/api/v1/rbac/roles'], ['GET', '/api/v1/rbac/users'], ['GET', '/api/v1/security/audit-logs'], ['GET', '/api/v1/employees'],
  ['GET', '/api/v1/employees/profile?email=qa.admina@qa-parkflows.test'], ['GET', '/api/v1/slots'], ['GET', '/api/v1/logs'],
  ['GET', '/api/v1/registrations'], ['GET', '/api/v1/sites'], ['GET', '/api/v1/my-sites'], ['GET', '/api/v1/auth/me'],
  ['GET', '/api/v1/alerts/non-parked'], ['GET', '/api/v1/invoices'], ['POST', '/api/v1/vehicles/entry'], ['POST', '/api/v1/slots/save'],
  ['POST', '/api/v1/alerts/trigger-cron'], ['POST', '/api/v1/rbac/users'], ['POST', '/api/v1/sites/onboard'],
  ...(R1B ? [['GET', '/api/v1/overview'], ['GET', '/api/v1/sites/summary'], ['POST', '/api/v1/sites/update'], ['GET', '/api/v1/demo-requests/export'],
    ['POST', '/api/v1/demo-requests/status'], ['DELETE', '/api/v1/demo-requests/demo-x']] : []),
];

test('R1B-S1-01 no session: canonical spelling of every protected route → 401', async () => {
  const bad = [];
  for (const [m, p] of ROUTES) {
    const r = await raw(m, p, { body: m === 'GET' || m === 'DELETE' ? undefined : {} });
    if (r.status !== 401) bad.push(`${m} ${p} → ${r.status}`);
  }
  assert.deepEqual(bad, []);
});

test('R1B-S1-02 no session: upper-case, mixed-case, trailing-slash and double-slash spellings → 401, never data or 500', async () => {
  const bad = []; let n = 0; const seen = {};
  for (const [m, p0] of ROUTES) {
    const [p, q] = p0.split('?');
    for (const [kind, s] of Object.entries(spellings(p))) {
      const path = s + (q ? `?${q}` : '');
      const r = await raw(m, path, { body: m === 'GET' || m === 'DELETE' ? undefined : {} });
      n++; seen[r.status] = (seen[r.status] || 0) + 1;
      if (r.status !== 401) bad.push(`${m} ${path} [${kind}] → ${r.status} ${r.text.slice(0, 60)}`);
    }
  }
  console.log(`# R1B-S1-02: ${n} requests, statuses ${JSON.stringify(seen)}`);
  assert.deepEqual(bad, []);
});

test('R1B-S1-03 no session: the 15 Oct repro spellings → 401 ERR_SESSION_EXPIRED (were 200/500)', async () => {
  for (const p of ['/API/V1/rbac/roles', '/Api/V1/rbac/roles', '/api/v1/rbac/ROLES', '/api/v1/rbac/roles/', '//api/v1/rbac/roles', '/api//v1/rbac/roles',
    '/API/V1/employees/profile?email=qa.admina@qa-parkflows.test', '/API/V1/sites', '/API/V1/my-sites']) {
    const r = await raw('GET', p);
    assert.equal(r.status, 401, `${p} → ${r.status} ${r.text.slice(0, 80)}`);
    assert.equal(r.json.errorCode, 'ERR_SESSION_EXPIRED', p);
  }
});

test('R1B-S1-04 public paths still work: health and login (canonical + trailing slash); wrong password still 401', async () => {
  assert.equal((await raw('GET', '/api/v1/health')).status, 200);
  assert.equal((await raw('GET', '/api/v1/health/')).status, 200);
  const l1 = await raw('POST', '/api/v1/auth/login', { body: { identifier: MASTER, password: PW } });
  assert.equal(l1.status, 200); assert.ok(l1.json.token);
  const l2 = await raw('POST', '/api/v1/auth/login/', { body: { identifier: MASTER, password: PW } });
  assert.equal(l2.status, 200, 'trailing-slash login');
  const bad = await raw('POST', '/api/v1/auth/login', { body: { identifier: MASTER, password: 'wrong-Password#1' } });
  assert.equal(bad.status, 401, 'wrong password still 401');
});

test('R1B-S1-05 signed in: canonical calls work; spelling variants are still site-scoped (Site Admin A cannot read B)', async () => {
  const t = await login(fx.users.admina.email);
  const h = (site) => ({ 'x-session-token': t, ...(site ? { 'x-site-id': site } : {}) });
  const A = fx.sites.A.id, B = fx.sites.B.id;
  assert.equal((await raw('GET', '/api/v1/slots', { headers: h(A) })).status, 200);
  assert.equal((await raw('GET', '/api/v1/slots/', { headers: h(A) })).status, 200, 'trailing slash routes and is gated like the canonical path');
  for (const p of ['/api/v1/slots', '/api/v1/slots/', '/api//v1/slots', '/API/V1/slots']) {
    const r = await raw('GET', p, { headers: h(B) });
    assert.ok([403, 404].includes(r.status), `${p} as Site Admin A on site B → ${r.status}`);
    assert.ok(!(r.json?.slots || []).length, `${p}: no slot data`);
  }
  for (const p of ['/api/v1/rbac/users/', '/api/v1/security/audit-logs/', '/api/v1/security/audit-logs']) {
    assert.equal((await raw('GET', p, { headers: h(A) })).status, 403, `${p} Site Admin`);
  }
});

test('R1B-S1-06 Android/attendant app contract: lower-case /api/v1 calls with token, Bearer and cookie; CORS preflight from capacitor://localhost', async () => {
  const t = await login(fx.users.atta.email);
  const A = fx.sites.A.id;
  for (const auth of [{ 'x-session-token': t }, { Authorization: `Bearer ${t}` }, { Cookie: `__session=${t}` }]) {
    const h = { ...auth, 'x-site-id': A };
    assert.equal((await raw('GET', '/api/v1/auth/me', { headers: h })).status, 200, `me ${Object.keys(auth)[0]}`);
    assert.equal((await raw('GET', '/api/v1/my-sites', { headers: h })).status, 200, `my-sites ${Object.keys(auth)[0]}`);
    assert.equal((await raw('GET', '/api/v1/slots?basement=ALL&status=ALL', { headers: h })).status, 200, `slots ${Object.keys(auth)[0]}`);
  }
  const h = { 'x-session-token': t, 'x-site-id': A };
  const emp = await raw('GET', '/api/v1/employees', { headers: h });
  assert.equal(emp.status, 200);
  const pre = await raw('OPTIONS', '/api/v1/slots', { headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-site-id,x-session-token,content-type' } });
  assert.ok([200, 204].includes(pre.status), `preflight ${pre.status}`);
  const plate = 'MH12QA0001';
  const en = await raw('POST', '/api/v1/vehicles/entry', { headers: h, body: { vehicleNumber: plate } });
  const ex = await raw('POST', '/api/v1/vehicles/exit', { headers: h, body: { vehicleNumber: plate } });
  assert.ok(en.status < 500 && en.status !== 401 && en.status !== 404, `entry ${en.status} ${en.text.slice(0, 80)}`);
  assert.ok(ex.status < 500 && ex.status !== 401 && ex.status !== 404, `exit ${ex.status} ${ex.text.slice(0, 80)}`);
  assert.equal((await raw('POST', '/api/v1/auth/logout', { headers: h })).status, 200);
  assert.equal((await raw('GET', '/api/v1/auth/me', { headers: h })).status, 401, 'token dead after logout');
});
