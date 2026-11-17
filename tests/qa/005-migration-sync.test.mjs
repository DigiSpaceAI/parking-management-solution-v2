// 005 T-11 (AC-07): applying the slot field migration writes ONLY the changed slot ids (one targeted sync), never a full sync.
// Uses the fake Firestore through the 005 harness (store mode). No real Firestore is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = path.join(REPO, 'tests', 'qa', 'support', 'pf005.mjs');
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
const master = { id: 'usr-digi-master', username: 'digisolutions', fullName: 'Prod Master', email: 'digisolutions.fm@gmail.com',
  roleId: 'role-master-admin', roleName: 'Platform Master Admin', status: 'ACTIVE', siteScopeType: 'ALL_SITES', assignedSiteIds: [] };
const slot = (id, extra = {}) => ({ id, siteId: 'site-a', slotNumber: id.toUpperCase(), basement: 'B1', floorLocation: 'L1', slotType: 'CSUV',
  parkingType: 'PUZZLE', height: '2.0m', allocation: 'EMPLOYEE', status: 'VACANT', ...extra });

test('T-11 [AC-07] apply performs one targeted write of only the changed slots; a dry run and a second apply write nothing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-005m-'));
  const seedFile = path.join(dir, 'seed.json');
  const slots = [slot('s1', { allocation: 'Car Pooling' }), slot('s2'), slot('s3', { height: 'Standard (2.0m)' }), slot('s4', { slotType: 'Truck' })];
  writeFileSync(seedFile, JSON.stringify({ slots, appUsers: [master], sites: [{ id: 'site-a', siteCode: 'A', siteName: 'A', status: 'ACTIVE' }] }));
  const env = { ...process.env, PF_REPO: REPO, NODE_ENV: 'production', SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '', K_SERVICE: '', SITE_SCOPE_MODE: '',
    AUDIT_HMAC_SECRET: 'q'.repeat(64), BOOTSTRAP_ADMIN_PASSWORD: 'Hotfix005Password#2026', FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '',
    SEED_FILE: seedFile, ACTIONS: 'migrate-dry,migrate-apply,migrate-apply' };
  const proc = spawn(TSX, [HARNESS, 'store'], { cwd: dir, env, stdio: 'pipe' });
  let out = ''; proc.stdout.on('data', (d) => (out += d)); proc.stderr.on('data', (d) => (out += d));
  await new Promise((r) => proc.on('exit', r));
  rmSync(dir, { recursive: true, force: true });
  const line = out.split('\n').find((l) => l.startsWith('REPORT '));
  assert.ok(line, out.slice(-1500));
  const { migrations, writes } = JSON.parse(line.slice(7));
  const [dry, apply, again] = migrations;
  assert.deepEqual([dry.slotsChanged, dry.writes.length], [2, 0], 'dry run: reports 2, writes nothing');
  assert.deepEqual(apply.ids.sort(), ['s1', 's3']);
  assert.deepEqual(apply.writes.map((w) => `${w.collection}/${w.id}`).sort(), ['slots/s1', 'slots/s3'], 'only the changed ids, nothing else, no full sync');
  assert.deepEqual([again.slotsChanged, again.writes.length], [0, 0], 'second apply: no change, no writes');
  assert.equal(writes.filter((w) => w.collection === 'slots').length, 2);
});
