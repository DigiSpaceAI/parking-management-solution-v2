// QA tests for hotfix 005 Part B (AC-16..AC-21): the server never creates data by itself on live.
// backend-dev tests T-13..T-17 (docs/features/005-inventory-fields-hotfix/03-tech-design.md). No real Firestore is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = path.join(REPO, 'tests', 'qa', 'support', 'pf005.mjs');
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
const PW = 'Hotfix005Password#2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const baseEnv = (extra = {}) => ({ ...process.env, PF_REPO: REPO, NODE_ENV: 'production', SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
  K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'q'.repeat(64), BOOTSTRAP_ADMIN_PASSWORD: PW,
  FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', ...extra });
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

const master = (id = 'usr-digi-master') => ({ id, username: 'digisolutions', fullName: 'Prod Master', email: 'digisolutions.fm@gmail.com',
  roleId: 'role-master-admin', roleName: 'Platform Master Admin', status: 'ACTIVE', siteScopeType: 'ALL_SITES', assignedSiteIds: [] });
const slots = (n) => Array.from({ length: n }, (_, i) => ({ id: `slot-${i + 1}`, slotNumber: `B1-P01-S${String(i + 1).padStart(2, '0')}`, siteId: 'site-a', status: 'VACANT' }));
const sites = (...ids) => ids.map((id) => ({ id, siteCode: id.toUpperCase(), siteName: id, status: 'ACTIVE' }));

function tmpWork(localFile) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-005-'));
  if (localFile !== undefined) { mkdirSync(path.join(dir, 'data')); writeFileSync(path.join(dir, 'data', 'pms_store.json'), localFile); }
  return dir;
}
async function run(mode, { env = {}, seed, localFile } = {}) {
  const dir = tmpWork(localFile);
  const extra = { ...env };
  if (seed !== undefined) { const f = path.join(dir, 'seed.json'); writeFileSync(f, JSON.stringify(seed)); extra.SEED_FILE = f; }
  const proc = spawn(TSX, [HARNESS, mode], { cwd: dir, env: baseEnv(extra), stdio: 'pipe' });
  let out = ''; proc.stdout.on('data', (d) => (out += d)); proc.stderr.on('data', (d) => (out += d));
  await new Promise((r) => proc.on('exit', r));
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  const line = out.split('\n').find((l) => l.startsWith('REPORT '));
  assert.ok(line, `harness ${mode} report missing:\n` + out.slice(-2000));
  return { r: JSON.parse(line.slice(7)), log: out };
}
async function startServer({ env = {}, localFile } = {}) {
  const dir = tmpWork(localFile);
  const port = await freePort(); const reportPort = await freePort();
  const proc = spawn(TSX, [HARNESS, 'server'], { cwd: dir, env: baseEnv({ PORT: String(port), FAKE_REPORT_PORT: String(reportPort), ...env }), stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}/api/v1`;
  let health;
  for (let i = 0; i < 120 && !health; i++) { try { const h = await fetch(base + '/health'); if (h.ok) health = await h.json(); } catch {} if (!health) await sleep(250); }
  assert.ok(health, 'server did not listen:\n' + log.slice(-1500));
  return { base, getLog: () => log, report: async () => (await fetch(`http://127.0.0.1:${reportPort}/report`)).json(),
    stop: () => { proc.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

// ---- T-13 (AC-16, AC-17) live, non-empty store with < 1,080 slots, empty invoices, a local file present ----
test('T-13 [AC-16/17] live: 1,000 slots, empty invoices and a local data file -> 0 new documents, the file is ignored, counts logged', async () => {
  const seed = { slots: slots(1000), sites: sites('site-a'), appUsers: [master()] };
  const { r, log } = await run('store', { seed, env: { ACTIONS: 'fullsync' }, localFile: JSON.stringify({ slots: slots(3), invoices: [{ id: 'inv-x' }], employees: [{ id: 'e-x' }] }) });
  assert.equal(r.ready, true);
  assert.deepEqual(r.newDocs, {}, 'new documents appeared: ' + JSON.stringify(r.newDocs));
  assert.equal(r.store.slots, 1000, 'slot count changed (a top-up or the local file leaked in)');
  assert.equal(r.counts.slots, 1000);
  assert.ok(!r.counts.invoices && !r.counts.employees, 'invoices/employees were created');
  assert.match(log, /data\/pms_store\.json found and ignored on live/);
  assert.match(log, /\[startup\] mode=live store=firestore counts: .*slots=1000 .*invoices=0 /);
  assert.match(log, /seeding prevented: local-file-ignored/);
  assert.ok(!/pms_store|"slotNumber"|usr-digi/.test(log.split('\n').filter((l) => l.startsWith('[startup] mode=')).join('\n')), 'the counts line must hold numbers only');
});

// ---- T-14 (AC-18) live, a broken environment: not ready, 503, 0 writes, no demo store ----
test('T-14a [AC-18] live + corrupt local file + Firestore client unavailable -> 503 ERR_STARTING, /health ready:false, 0 writes, no demo store', async () => {
  const s = await startServer({ localFile: '{ this is not json', env: { MARK_UNAVAILABLE: '1' } });
  try {
    assert.equal((await (await fetch(s.base + '/health')).json()).ready, false);
    for (const url of ['/slots?siteId=site-a', '/my-sites']) {
      const res = await fetch(s.base + url);
      assert.equal(res.status, 503, url);
      assert.equal((await res.json()).errorCode, 'ERR_STARTING', url);
    }
    await sleep(3500);
    const rep = await s.report();
    assert.deepEqual(rep.writes, [], 'writes: ' + JSON.stringify(rep.writes));
    assert.match(s.getLog(), /\[firestore\]\[CRITICAL\] live mode but Firestore unavailable/);
    assert.ok(!/Initializing fresh 1,080|initializing in-memory/i.test(s.getLog()), 'a demo store was built:\n' + s.getLog().slice(-1500));
  } finally { s.stop(); }
});

test('T-14b [AC-18, D-7] Cloud Run (K_SERVICE) without a project id -> 503, never a demo store', async () => {
  const s = await startServer({ env: { NO_PROJECT: '1', K_SERVICE: 'parkflows' } });
  try {
    assert.equal((await (await fetch(s.base + '/health')).json()).ready, false);
    const res = await fetch(s.base + '/slots?siteId=site-a');
    assert.equal(res.status, 503);
    assert.equal((await res.json()).errorCode, 'ERR_STARTING');
    await sleep(3500);
    assert.deepEqual((await s.report()).writes, []);
    assert.ok(!/Initializing fresh 1,080/.test(s.getLog()));
  } finally { s.stop(); }
});

test('T-14c [AC-18] a failed first load on live with a local file present stays not-ready with 0 writes (H-2 retained)', async () => {
  const s = await startServer({ localFile: JSON.stringify({ slots: slots(3) }), env: { FAKE_FAIL_READS: '1', SEED_FILE: '' } });
  try {
    assert.equal((await (await fetch(s.base + '/health')).json()).ready, false);
    assert.equal((await fetch(s.base + '/slots?siteId=site-a')).status, 503);
    await sleep(3500);
    assert.deepEqual((await s.report()).writes, []);
    assert.match(s.getLog(), /NOT reseeding/);
  } finally { s.stop(); }
});

// ---- T-15 (AC-16, AC-19) live, an EMPTY Firestore: the bootstrap Master only ----
test('T-15 [AC-16/19, D-9] live + empty Firestore -> exactly one write (appUsers/usr-digi-master); no roles, no dom-1, no sites; SEED_DEMO_USERS=true changes nothing', async () => {
  for (const demo of ['false', 'true']) {
    const { r, log } = await run('store', { env: { SEED_DEMO_USERS: demo, ACTIONS: 'fullsync' } });
    assert.equal(r.ready, true);
    assert.deepEqual(r.writes.filter((w) => !w.deleted).map((w) => `${w.collection}/${w.id}`).filter((x, i, a) => a.indexOf(x) === i), ['appUsers/usr-digi-master'], `SEED_DEMO_USERS=${demo}`);
    assert.deepEqual(Object.fromEntries(Object.entries(r.counts).filter(([, n]) => n > 0)), { appUsers: 1 }, 'collections created: ' + JSON.stringify(r.counts));
    assert.equal(r.store.appRoles, 0, 'default roles were put into the store');
    assert.match(log, /bootstrap Master created \(no Master Admin found\)/);
  }
});

// ---- T-16 (AC-17) deletes stand across a restart; no Master re-created while another Master exists ----
test('T-16 [AC-17] a deleted slot stays deleted after a restart (same Firestore); a deleted site stays deleted and getSites adds nothing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-005-fs-'));
  const data = path.join(dir, 'firestore.json');
  const seed = { slots: slots(5), sites: sites('site-a', 'site-b', 'site-c'), appUsers: [master()] };
  try {
    const a = await run('store', { seed, env: { FAKE_DATA_FILE: data, ACTIONS: 'delete-slot:slot-3,delete-site:site-b,delete-site:site-c' } });
    assert.equal(a.r.store.slots, 4);
    const b = await run('store', { env: { FAKE_DATA_FILE: data } }); // restart: a new process on the same "Firestore"
    assert.equal(b.r.store.slots, 4, 'the deleted slot came back');
    assert.ok(!b.r.slotIds.includes('slot-3'));
    assert.deepEqual(b.r.siteIds, ['site-a'], 'deleted sites came back');
    assert.deepEqual(b.r.newDocs, {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('T-16b [D-6] a renamed Master Admin exists -> no usr-digi-master is created', async () => {
  const { r, log } = await run('store', { seed: { slots: slots(2), sites: sites('site-a'), appUsers: [master('usr-renamed')] } });
  assert.deepEqual(r.newDocs, {});
  assert.equal(r.store.appUsers, 1);
  assert.ok(!/bootstrap Master created/.test(log));
});

// ---- T-17 (D-8) local demo mode: the "< 1,080" top-up is gone there too ----
test('T-17 [D-8, AC-17] local demo mode: a local store with 1,000 slots stays at 1,000', async () => {
  const { r } = await run('local', { localFile: JSON.stringify({ slots: slots(1000) }) });
  assert.equal(r.ready, true);
  assert.equal(r.storeSlots, 1000);
});
