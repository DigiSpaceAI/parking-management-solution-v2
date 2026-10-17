// Production hotfix R1B-S1 (002 07-security-review, 17 Oct): the sign-in gate
// and the cold-start guard must decide the same way for every spelling of a
// path that Express could route (case, trailing slash, repeated slashes).
// Owner: backend-dev. Runner: node:test + global fetch, no dependencies.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
const PW = 'R1bS1HotfixPassword#2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot({ harness = false, env = {}, waitReady = true } = {}) {
  const port = 5200 + Math.floor(Math.random() * 700);
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-r1bs1-'));
  const fullEnv = { ...process.env, NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
    K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 's1'.repeat(32), PORT: String(port), PF_REPO: REPO,
    FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', ...env };
  const args = harness ? [path.join(REPO, 'tests', 'qa', 'support', 'coldstart-harness.mjs'), 'server'] : [path.join(REPO, 'server.ts')];
  const proc = spawn(TSX, args, { cwd: workDir, env: fullEnv, stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  let exited = null; proc.on('exit', (c) => (exited = c));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    if (exited !== null) break;
    try { const h = await fetch(base + '/api/v1/health'); if (h.ok && (!waitReady || (await h.json()).ready !== false)) break; } catch {}
    await sleep(250);
  }
  if (exited !== null) throw new Error('server exited:\n' + log.slice(-2000));
  return { base, getLog: () => log, stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
}
const call = async (srv, method, url, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'x-session-token': token } : {}) };
  const r = await fetch(srv.base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
};

// Every non-canonical spelling of protected routes.
const PROTECTED = [
  ['GET', '/api/v1/rbac/roles'],
  ['GET', '/api/v1/employees/profile?email=a@b.c'],
  ['GET', '/api/v1/sites'],
  ['GET', '/api/v1/my-sites'],
  ['POST', '/api/v1/auth/logout'],
];
const variants = (u) => {
  const [p, q = ''] = u.split('?'); const qs = q ? `?${q}` : '';
  return [
    ['upper case', p.toUpperCase() + qs],
    ['mixed case', p.replace('/api/v1/', '/Api/V1/').replace(/\/([a-z])([a-z-]*)$/, (_, a, b) => `/${a.toUpperCase()}${b}`) + qs],
    ['upper prefix only', p.replace('/api/v1/', '/API/V1/') + qs],
    ['trailing slash', p + '/' + qs],
    ['upper + trailing slash', p.toUpperCase() + '/' + qs],
    ['double slash at the start', '/' + p + qs],
    ['double slash inside', p.replace('/api/', '/api//') + qs],
    ['double slash before the route', p.replace('/v1/', '/v1//') + qs],
  ];
};

let srv; let token;
before(async () => {
  srv = await boot();
  const r = await call(srv, 'POST', '/api/v1/auth/login', { body: { identifier: MASTER_EMAIL, password: PW } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); token = r.body.token;
});
after(() => srv?.stop());

test('R1B-S1 protected routes: upper, mixed case, trailing-slash and double-slash variants are 401 without a session', async () => {
  for (const [method, url] of PROTECTED) {
    assert.equal((await call(srv, method, url)).status, 401, `canonical ${method} ${url}`);
    for (const [kind, v] of variants(url)) {
      const r = await call(srv, method, v);
      assert.equal(r.status, 401, `${kind}: ${method} ${v} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      assert.equal(r.body.errorCode, 'ERR_SESSION_EXPIRED', `${kind}: ${v}`);
    }
  }
});

test('R1B-S1 a signed-in caller cannot use a non-canonical case to reach a handler; canonical paths still work', async () => {
  const ok = await call(srv, 'GET', '/api/v1/rbac/roles', { token });
  assert.equal(ok.status, 200); assert.ok(Array.isArray(ok.body.roles ?? ok.body), 'roles served on the canonical path');
  for (const v of ['/API/V1/rbac/roles', '/api/v1/RBAC/roles', '/Api/V1/Rbac/Roles']) {
    const r = await call(srv, 'GET', v, { token });
    assert.notEqual(r.status, 200, `${v} must not route (case-sensitive routing)`);
    assert.ok(!JSON.stringify(r.body).includes('modulePermissions'), `${v} leaked the role matrix`);
  }
  // Trailing slash keeps working for a signed-in caller (gated like the canonical path).
  assert.equal((await call(srv, 'GET', '/api/v1/rbac/roles/', { token })).status, 200);
});

test('R1B-S1 public routes still work (including a trailing slash); public upper-case paths do not route', async () => {
  const h = await call(srv, 'GET', '/api/v1/health');
  assert.equal(h.status, 200); assert.equal(h.body.ready, true);
  assert.equal((await call(srv, 'GET', '/api/v1/health/')).status, 200);
  const dom = await call(srv, 'GET', '/api/v1/domains');
  assert.equal(dom.status, 400, 'public domain list reaches its handler with no session (it asks for a site)');
  assert.equal(dom.body.errorCode, 'ERR_SITE_REQUIRED');
  for (const url of ['/api/v1/auth/login', '/api/v1/auth/login/', '/login']) {
    const r = await call(srv, 'POST', url, { body: { identifier: MASTER_EMAIL, password: PW } });
    assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.body)}`); assert.ok(r.body.token, url);
  }
  const bad = await call(srv, 'POST', '/api/v1/auth/login', { body: { identifier: MASTER_EMAIL, password: 'wrong' } });
  assert.equal(bad.status, 401, 'public login still answers normally');
  const upper = await call(srv, 'POST', '/API/V1/AUTH/LOGIN', { body: { identifier: MASTER_EMAIL, password: PW } });
  assert.notEqual(upper.status, 200, 'upper-case public path does not reach the login handler'); assert.ok(!upper.body?.token);
});

test('R1B-S1 cold start: non-canonical spellings get 503 ERR_STARTING like the canonical path', async () => {
  const s = await boot({ harness: true, waitReady: false, env: { FAKE_LOAD_DELAY_MS: '8000' } });
  try {
    assert.equal((await call(s, 'GET', '/api/v1/health')).body.ready, false, 'still loading');
    for (const url of ['/api/v1/rbac/roles', '/API/V1/rbac/roles', '/Api/v1/Rbac/Roles', '//api/v1/rbac/roles', '/api/v1/rbac/roles/', '/LOGIN', '/api//v1/my-sites']) {
      const r = await call(s, 'GET', url);
      assert.equal(r.status, 503, `${url} during cold start -> ${r.status}`);
      assert.equal(r.body.errorCode, 'ERR_STARTING', url);
    }
    assert.equal((await call(s, 'GET', '/API/V1/HEALTH')).status !== 503, true, 'health spelled differently is not blocked either');
  } finally { s.stop(); }
});
