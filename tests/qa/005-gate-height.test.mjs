// 005 T-12 (AC-08): the gate's SUV rule reads height through heightMetres (3.0 m yes, 2.2 m no, legacy label ok);
// EV, two-wheeler, allocation and level fallbacks are unchanged. Store-level, via the 005 harness (fake Firestore).
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
const slot = (id, extra = {}) => ({ id, siteId: 'site-a', slotNumber: id.toUpperCase(), basement: 'B2', floorLocation: 'L1', slotType: 'CSUV',
  parkingType: 'GROUND', height: '2.0m', allocation: 'VISITOR', status: 'VACANT', ...extra });

async function finds(slots, actions) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-005g-'));
  const seedFile = path.join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify({ slots, appUsers: [master], sites: [{ id: 'site-a', siteCode: 'A', siteName: 'A', status: 'ACTIVE' }] }));
  const env = { ...process.env, PF_REPO: REPO, NODE_ENV: 'production', SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '', K_SERVICE: '', SITE_SCOPE_MODE: '',
    AUDIT_HMAC_SECRET: 'q'.repeat(64), BOOTSTRAP_ADMIN_PASSWORD: 'Hotfix005Password#2026', FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '',
    SEED_FILE: seedFile, ACTIONS: actions.join(',') };
  const proc = spawn(TSX, [HARNESS, 'store'], { cwd: dir, env, stdio: 'pipe' });
  let out = ''; proc.stdout.on('data', (d) => (out += d)); proc.stderr.on('data', (d) => (out += d));
  await new Promise((r) => proc.on('exit', r));
  rmSync(dir, { recursive: true, force: true });
  const line = out.split('\n').find((l) => l.startsWith('REPORT '));
  assert.ok(line, out.slice(-1500));
  return JSON.parse(line.slice(7)).finds;
}

test('T-12 [AC-08] SUV gets 2.5m, 3.0m or a legacy 2.5m label, never a 2.2m slot by height; other picks unchanged', async () => {
  const slots = [
    slot('a-22', { height: '2.2m', basement: 'B1', allocation: 'VISITOR' }),
    slot('b-30', { height: '3.0m', basement: 'B3' }),
    slot('c-25', { height: '2.5m', basement: 'B3' }),
    slot('d-leg', { height: 'High Clearance (2.5m)', basement: 'B3' }),
    slot('e-ev', { slotType: 'EV', basement: 'B3' }),
    slot('f-tw', { slotType: 'TWO_WHEELER', basement: 'B3' }),
    slot('g-emp', { allocation: 'EMPLOYEE', basement: 'B3' }),
  ];
  const r = await finds(slots, [
    'find:SUV:site-a:',                                  // first height >= 2.5 in order: b-30 (3.0), never a-22 (2.2)
    'find:SUV:site-a:b-30',                              // then c-25
    'find:SUV:site-a:b-30+c-25',                         // then the legacy label
    'find:SUV:site-a:b-30+c-25+d-leg',                   // none by height -> falls to allocation EMPLOYEE (g-emp), not 2.2 m a-22
    'find:EV:site-a:',                                   // EV slot
    'find:TWO_WHEELER:site-a:',                          // two-wheeler slot
    'find:SEDAN:site-a:g-emp',                           // no employee slot left -> level fallback B1 first: a-22
  ]);
  assert.deepEqual(r, ['b-30', 'c-25', 'd-leg', 'g-emp', 'e-ev', 'f-tw', 'a-22']);
});
