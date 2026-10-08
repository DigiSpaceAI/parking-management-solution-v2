// QA tests for the 2 Oct cold-start hotfix (deab529, c30a947): 06-test-report.md "Hotfix test (2 Oct)".
// Closes code-review gap H-2 and re-checks the cold-start regression list against the
// fake "production" Firestore in tests/qa/support (no real Firestore is ever touched).
// Runner: node:test, no dependencies. Run: npm run test:qa
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = path.join(REPO, 'tests', 'qa', 'support', 'coldstart-harness.mjs');
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
const PW = 'QaHotfixPassword#2026';
const SEED_COLLECTIONS = ['appRoles', 'appUsers', 'whitelistedDomains'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const baseEnv = (extra) => ({ ...process.env, PF_REPO: REPO, NODE_ENV: 'production', SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
  K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'q'.repeat(64), BOOTSTRAP_ADMIN_PASSWORD: PW, ...extra });

async function runHarness(mode, extraEnv = {}) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-qa-hf-'));
  const proc = spawn(TSX, [HARNESS, mode], { cwd: workDir, env: baseEnv(extraEnv), stdio: 'pipe' });
  let out = ''; proc.stdout.on('data', (d) => (out += d)); proc.stderr.on('data', (d) => (out += d));
  await new Promise((r) => proc.on('exit', r));
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  const line = out.split('\n').find((l) => l.startsWith('REPORT '));
  assert.ok(line, `harness ${mode} report missing:\n` + out.slice(-2000));
  return { r: JSON.parse(line.slice(7)), log: out };
}

// ---------------- H-2 (a) failed load -> 503 -> retry -> ready, never a seed write ----------------
test('HF-01 [H-2a] failed first load: not ready and 0 writes; after the retry ready with production data and still no seed writes', async () => {
  const { r, log } = await runHarness('retry', { FAKE_FAIL_READS: '1' });
  assert.equal(r.afterFailure.readFailures, 1, 'the fake must have failed the first load');
  assert.equal(r.afterFailure.ready, false, 'store went ready on the boot seed after a failed load');
  assert.equal(r.afterFailure.writes, 0, 'something was written to Firestore after a failed load');
  assert.match(log, /retrying in 10s/, 'retry not scheduled');
  assert.equal(r.atReady.ready, true, `not ready after the retry (waited ${r.readyAfterMs} ms)`);
  assert.deepEqual(r.atReady.seedWrites, [], 'seed records written once ready: ' + JSON.stringify(r.atReady.seedWrites));
  assert.equal(r.atReady.writes, 0, 'unexpected writes between the load and the first real change');
  assert.equal(r.loaded.siteManager.modulePermissions.ALERTS.canEdit, false, 'production role overwritten');
  assert.deepEqual(r.loaded.domains, ['parkflows.in'], 'company.com came back');
  assert.equal(r.loaded.master.fullName, 'Prod Master (edited)', 'bootstrap Master reset');
  assert.deepEqual(r.loaded.storeSites, ['site-alpha'], 'the in-memory store is not the loaded production data');
});

test('HF-02 [H-2a] server during a failed load: /api/v1/* 503 ERR_STARTING, /health 200 ready:false, 0 writes; after the retry it serves production data', async () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-qa-hf-'));
  const port = 5100 + Math.floor(Math.random() * 80);
  const reportPort = port + 100;
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(TSX, [HARNESS, 'server'], { cwd: workDir, stdio: 'pipe',
    env: baseEnv({ PORT: String(port), FAKE_FAIL_READS: '1', FAKE_REPORT_PORT: String(reportPort) }) });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  const report = async () => (await fetch(`http://127.0.0.1:${reportPort}/report`)).json();
  try {
    let health;
    for (let i = 0; i < 80 && !health; i++) { try { const h = await fetch(base + '/api/v1/health'); if (h.ok) health = await h.json(); } catch {} if (!health) await sleep(250); }
    assert.ok(health, 'server did not listen:\n' + log.slice(-1500));
    for (let i = 0; i < 40 && (await report()).readFailures < 1; i++) await sleep(250);
    assert.equal((await report()).readFailures, 1, 'first load did not fail');
    assert.equal((await (await fetch(base + '/api/v1/health')).json()).ready, false, '/health must say ready:false while failed');
    for (const [method, url] of [['GET', '/api/v1/slots?siteId=site-alpha'], ['POST', '/api/v1/auth/login'], ['GET', '/api/v1/domains?siteId=site-alpha'], ['GET', '/api/v1/my-sites']]) {
      const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ identifier: 'digisolutions.fm@gmail.com', password: PW }) : undefined });
      assert.equal(r.status, 503, `${method} ${url} during failed load`);
      assert.equal((await r.json()).errorCode, 'ERR_STARTING', url);
      assert.equal(r.headers.get('retry-after'), '5', `${url} Retry-After`);
    }
    await sleep(3500); // past the full-sync debounce: still nothing written
    assert.deepEqual((await report()).writes, [], 'writes during a failed load');
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) { await sleep(250); ready = (await (await fetch(base + '/api/v1/health')).json()).ready; }
    assert.ok(ready, 'never became ready after the retry:\n' + log.slice(-1500));
    const dom = await fetch(base + '/api/v1/domains?siteId=site-alpha');
    assert.equal(dom.status, 200);
    assert.deepEqual((await dom.json()).domains.map((d) => d.domain), ['parkflows.in'], 'production domains served');
    assert.equal((await fetch(base + '/api/v1/slots?siteId=site-alpha')).status, 401, 'normal auth answer once ready');
    await sleep(3500);
    const seeded = (await report()).writes.filter((w) => SEED_COLLECTIONS.includes(w.collection));
    assert.deepEqual(seeded, [], 'seed writes after the retry: ' + JSON.stringify(seeded));
  } finally { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} }
});

// ---------------- H-2 (b) writes after ready still reach Firestore ----------------
test('HF-03 [H-2b] after the load a targeted saveDB and a full sync both reach Firestore (syncs are not silently disabled)', async () => {
  const { r } = await runHarness('retry', { FAKE_FAIL_READS: '0' });
  assert.equal(r.atReady.ready, true);
  assert.ok(r.afterReadyTargeted >= 1, 'targeted saveDB after ready wrote nothing');
  assert.equal(r.storedDescription, 'QA write after ready', 'targeted write content not in Firestore');
  assert.ok(r.afterReadyFull > 0, 'debounced full sync after ready wrote nothing');
  assert.equal(r.storedSiteName, 'Alphatech (QA full sync)', 'full sync content not in Firestore');
});

// ---------------- Regression: cold start against "production" data ----------------
for (const delay of ['0', '5000']) {
  test(`HF-04 [regression, load ${delay} ms] changed default role, removed company.com and edited Master survive a cold start`, async () => {
    const { r } = await runHarness('store', { FAKE_LOAD_DELAY_MS: delay });
    assert.equal(r.writesBeforeLoad, 0, 'writes before the load');
    assert.deepEqual(r.writes.filter((w) => SEED_COLLECTIONS.includes(w.collection)), [], 'seed records written');
    assert.equal(r.siteManager.modulePermissions.ALERTS.canEdit, false, 'role-site-manager ALERTS edit came back on');
    assert.equal(r.siteManager.description, 'changed in prod');
    assert.ok(!r.domains.some((d) => d.domain === 'company.com'), 'company.com came back');
    assert.equal(r.master.fullName, 'Prod Master (edited)', 'bootstrap Master fields reset');
    assert.equal(r.ready, true);
  });
}

test('HF-05 [regression] an EMPTY Firestore is still seeded (default roles, bootstrap Master)', async () => {
  const { r } = await runHarness('store', { EMPTY_FIRESTORE: '1' });
  assert.equal(r.writesBeforeLoad, 0);
  const roles = r.writes.filter((w) => w.collection === 'appRoles').map((w) => w.id);
  assert.ok(roles.includes('role-site-manager') && roles.includes('role-master-admin'), 'default roles seeded: ' + JSON.stringify(roles));
  assert.ok(r.writes.some((w) => w.collection === 'appUsers' && w.id === 'usr-digi-master'), 'bootstrap Master seeded');
  assert.equal(r.ready, true);
});
