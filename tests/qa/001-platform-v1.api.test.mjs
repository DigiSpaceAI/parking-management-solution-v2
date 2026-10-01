// QA API tests — feature 001-parkflows-platform-v1 (docs/features/001-parkflows-platform-v1/01-prd.md)
// Runner: Node's built-in test runner (node:test) + global fetch — NO new dependencies.
// Run:   npm run test:qa                   (from the repo root, after `bun install --frozen-lockfile`)
// The suite boots server.ts via tsx in a throw-away working dir (in-memory store,
// Firestore env vars blanked => never touches production data) and builds its own
// fixtures — Site A, Site B, Site C, users, slots — through the public API.
// Test names start with the test ID and the AC they cover (see 06-test-report.md).
// A FAILING test here means the acceptance criterion is NOT met.
//
// Site scoping (03-tech-design.md v1.0.1, strict mode = the default): every scoped
// call must name its site. A `?siteId=` in the URL wins; otherwise call() sends the
// `x-site-id` header: by default the caller's own site (SITE[who]), or the `site`
// argument when one is given. Pass NONE to send no site at all (to test the
// 400 ERR_SITE_REQUIRED path). Master Admin has no default site, so every scoped
// Master call names one explicitly ('ALL' for reads). Platform routes (sites,
// rbac, invoices, audit, and domains as Master without a site) send none.
// SITE_SCOPE_MODE=fallback npm run test:qa runs against the legacy kill-switch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
const PW = 'QaTestPassword#2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, workDir;
const tok = {}; // role -> session token
const F = {};   // fixtures

const NONE = Symbol('no-site');
const SITE = {}; // role -> default site id (set in before(); master has none)

async function call(who, method, url, body, site) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers['x-session-token'] = tok[who];
  const s = site === NONE ? undefined : (site ?? SITE[who]);
  if (s) headers['x-site-id'] = s;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const get = (who, url, site) => call(who, 'GET', url, undefined, site);
const post = (who, url, body, site) => call(who, 'POST', url, body, site);
const errCode = (r) => r.body?.errorCode;
const auditLogs = async () => (await get('master', '/security/audit-logs?limit=1000')).body.logs || [];

async function login(identifier, password = PW) {
  const r = await post(null, '/auth/login', { identifier, password });
  assert.equal(r.status, 200, `login ${identifier}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}
async function mkUser(key, roleId, sites) {
  await sleep(5); // user ids are usr-${Date.now()} — avoid same-ms collisions
  const email = `qa.${key.toLowerCase()}@qa-parkflows.test`;
  const r = await post('master', '/rbac/users', {
    username: `qa.${key.toLowerCase()}`, fullName: `QA ${key}`, email, roleId,
    siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW,
  });
  assert.ok(r.body.success, `create user ${key}: ${JSON.stringify(r.body)}`);
  F[key + 'User'] = r.body.user;
  tok[key] = await login(email);
}
async function onboard(code, name) {
  await sleep(5);
  const r = await post('master', '/sites/onboard', { siteName: name, siteCode: code, city: 'Pune', totalSlots: 3,
    pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 } });
  assert.ok(r.body.success, JSON.stringify(r.body));
  return r.body.site;
}
const slotsOf = async (who, site) => (await get(who, `/slots?siteId=${site}`)).body.slots;
const onlySite = (rows, site) => rows.every((r) => (r.siteId || 'site-default') === site);

before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'pf-qa-'));
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(PORT), BOOTSTRAP_ADMIN_PASSWORD: PW,
    SEED_DEMO_USERS: 'false', FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', GEMINI_API_KEY: '',
    K_SERVICE: '', SITE_SCOPE_MODE: process.env.SITE_SCOPE_MODE || '' };
  server = spawn(path.join(REPO, 'node_modules', '.bin', 'tsx'), [path.join(REPO, 'server.ts')], { cwd: workDir, env, stdio: 'pipe' });
  let log = ''; server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch {}
    await sleep(500);
    if (i === 119) throw new Error('server did not start:\n' + log);
  }
  tok.master = await login(MASTER_EMAIL);

  F.A = await onboard('QAA', 'QA Site A');
  F.B = await onboard('QAB', 'QA Site B');
  F.C = await onboard('QAC', 'QA Site C');
  const mkSlots = (site, prefix, n) => Array.from({ length: n }, (_, i) => ({ siteId: site.id, slotNumber: `${prefix}-0${i + 1}`,
    basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', height: '2.0m', parkingType: 'FLAT', allocation: 'EMPLOYEE', status: 'VACANT' }));
  for (const [s, p] of [[F.A, 'A'], [F.B, 'B'], [F.C, 'C']]) {
    const r = await post('master', '/slots/bulk-upload', { slots: mkSlots(s, p, 3) }, s.id);
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
  await mkUser('adminA', 'role-site-manager', [F.A.id]);
  await mkUser('attA', 'role-gate-attendant', [F.A.id]);
  await mkUser('attB', 'role-gate-attendant', [F.B.id]);
  await mkUser('noSite', 'role-site-manager', []);
  Object.assign(SITE, { adminA: F.A.id, attA: F.A.id, attB: F.B.id });

  // Approved passes (active whitelisted employees) at A and B
  const e = async (site, id, plate) => {
    const r = await post('master', '/employees/save', { employee: { siteId: site.id, employeeId: id, name: `QA ${id}`,
      email: `${id.toLowerCase()}@qa-corp.in`, mobile: '+91 9876543210', vehicleNumber: plate, vehicleType: 'SEDAN', status: 'ACTIVE' } }, site.id);
    assert.ok(r.body.success, `employee ${id}: ${JSON.stringify(r.body)}`);
    return r.body.employee;
  };
  F.empA = await e(F.A, 'QAE-A1', 'MH12AB1234');
  F.empB = await e(F.B, 'QAE-B1', 'MH14CD5678');
  // Site B vehicle parked by Site B attendant, then relocated (creates a Site B notification)
  const eb = await post('attB', '/vehicles/entry', { vehicleNumber: 'MH14CD5678', vehicleType: 'SEDAN' });
  assert.ok(eb.body.success, JSON.stringify(eb.body));
  F.bSlot = eb.body.slot;
  const bFree = (await slotsOf('master', F.B.id)).find((s) => s.status === 'VACANT');
  const mv = await post('attB', '/slots/change', { vehicleNumberOrSlot: 'MH14CD5678', newSlotNumber: bFree.slotNumber, reason: 'qa', attendantName: 'QA attB' });
  assert.ok(mv.body.success, JSON.stringify(mv.body));
  F.bSlot = bFree;
  // Platform-wide corporate domain (Master, no site) + one pending registration at Site B
  const pw = await post('master', '/domains/add', { domain: 'qa-corp.in' });
  assert.ok(pw.body.success && !pw.body.domain.siteId, `platform-wide domain: ${JSON.stringify(pw.body)}`);
  F.domPlatform = pw.body.domain;
  const rb = await post(null, '/registrations/submit', { siteId: F.B.id, name: 'QA Reg B', email: 'regb@qa-corp.in',
    mobile: '+91 9000000001', vehicleNumber: 'MH14EF1111', employeeId: 'QAR-B1' });
  assert.ok(rb.body.success, JSON.stringify(rb.body));
  F.regB = rb.body.request;
});

after(() => { server?.kill(); if (workDir) rmSync(workDir, { recursive: true, force: true }); });

// ---------------- Site isolation (AC-02, AC-03, AC-05, AC-06, AC-44) ----------------
const LISTS = [['/slots', 'slots'], ['/employees', 'employees'], ['/logs', 'logs'], ['/alerts/non-parked', 'alerts'],
  ['/registrations', 'requests'], ['/valet/tickets', 'tickets']];

test('ISO-01 [AC-02] Site Admin A: list APIs with site A return only Site A rows', async () => {
  const s = await get('adminA', '/slots');
  assert.ok(s.body.slots.length > 0, 'slots empty');
  for (const [u, key] of LISTS) {
    const r = await get('adminA', u);
    assert.equal(r.status, 200, `${u} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    assert.ok(onlySite(r.body[key], F.A.id), `${u} returned non-Site-A rows`);
  }
});

const FALLBACK = process.env.SITE_SCOPE_MODE === 'fallback';

test('ISO-01b [AC-02] Strict mode: list APIs with no site are refused (400 ERR_SITE_REQUIRED), never defaulted', async (t) => {
  if (FALLBACK) return t.skip('SITE_SCOPE_MODE=fallback restores the legacy default');
  for (const who of ['adminA', 'master']) {
    for (const [u] of LISTS) {
      const r = await get(who, u, NONE);
      assert.equal(r.status, 400, `${who} ${u} -> ${r.status}`);
      assert.equal(errCode(r), 'ERR_SITE_REQUIRED', `${who} ${u} errorCode=${errCode(r)}`);
    }
  }
});

test('ISO-01c [AC-02] "ALL" is Master-only and read-only', async (t) => {
  if (FALLBACK) return t.skip('strict-mode rule');
  const m = await get('master', '/slots', 'ALL');
  assert.equal(m.status, 200);
  assert.ok([F.A.id, F.B.id].every((id) => m.body.slots.some((s) => s.siteId === id)), 'Master ALL should include A and B rows');
  const a = await get('adminA', '/slots', 'ALL');
  assert.ok(a.status === 400 || a.status === 403, `Site Admin ALL -> ${a.status}`);
  const w = await post('master', '/slots/save', { slot: { slotNumber: 'ALL-01' } }, 'ALL');
  assert.equal(w.status, 400, `Master write in ALL -> ${w.status}`);
  assert.equal(errCode(w), 'ERR_SITE_ALL_NOT_ALLOWED');
});

test('ISO-02 [AC-02] Site Admin A: list APIs with siteId=B are refused (403)', async () => {
  for (const u of ['/slots', '/employees', '/logs', '/alerts/non-parked', '/registrations', '/valet/tickets', '/reports/mix']) {
    assert.equal((await get('adminA', `${u}?siteId=${F.B.id}`)).status, 403, u);
  }
});

test('ISO-03 [AC-02] Site Admin A: slot-change notifications contain no Site B records', async () => {
  const r = await get('adminA', '/slots/change-notifications');
  const foreign = r.body.notifications.filter((n) => n.siteId !== F.A.id);
  assert.equal(foreign.length, 0, `leaked: ${foreign.map((n) => `${n.vehicleNumber}@${n.siteId}`).slice(0, 5).join(', ')}`);
});

test('ISO-04 [AC-02] Site Admin A: per-slot report for a Site B slot is refused', async () => {
  const r = await get('adminA', `/reports/slot-daily-vehicles?slotId=${F.bSlot.id}`);
  assert.equal(r.status, 403, `got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
});

test('ISO-05 [AC-02] Site Admin A: security audit log contains no Site B activity', async () => {
  const r = await get('adminA', '/security/audit-logs?limit=1000');
  const txt = JSON.stringify(r.body);
  assert.ok(r.status === 403 || (!txt.includes('QA attB') && !txt.includes(F.B.id)), 'Site Admin A can read audit entries about Site B users/sites');
});

test('ISO-06 [AC-06] Attendant A: plate scan never returns another site\'s employee record', async () => {
  const leaked = new Set();
  for (let i = 0; i < 40; i++) {
    const r = await post('attA', '/vehicles/scan-plate', {});
    const m = r.body.matchedEmployee;
    if (m && (m.siteId || 'site-default') !== F.A.id) leaked.add(`${m.employeeId}@${m.siteId || 'site-default'}`);
  }
  assert.equal(leaked.size, 0, `foreign employee records (with PII) returned: ${[...leaked].slice(0, 5).join(', ')}`);
});

test('ISO-07 [AC-03] Site Admin A: slot save targeting a Site B slot id is refused and B slot unchanged', async () => {
  const target = (await slotsOf('master', F.B.id)).find((s) => s.status === 'VACANT');
  const r = await post('adminA', '/slots/save', { slot: { id: target.id, slotNumber: target.slotNumber, status: 'MAINTENANCE' } });
  const now = (await get('master', '/slots', 'ALL')).body.slots.find((s) => s.id === target.id);
  assert.equal(r.status, 403, `status ${r.status}; Site B slot now siteId=${now?.siteId} status=${now?.status}`);
  assert.equal(now.siteId, F.B.id);
});

test('ISO-08 [AC-03] Site Admin A: delete / status change on a Site B slot is refused', async () => {
  const b1 = (await slotsOf('master', F.B.id)).find((s) => s.siteId === F.B.id && s.status === 'VACANT') || F.bSlot;
  assert.equal((await post('adminA', '/slots/delete', { slotId: b1.id })).status, 403, 'delete');
  assert.equal((await post('adminA', '/slots/update-status', { slotId: b1.id, newStatus: 'MAINTENANCE' })).status, 403, 'update-status');
});

test('ISO-09 [AC-03] Attendant A: exit of a vehicle parked at Site B is refused and B slot stays occupied', async () => {
  const r = await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH14CD5678' });
  const still = (await slotsOf('master', F.B.id)).find((s) => s.currentVehicle === 'MH14CD5678');
  assert.ok(!r.body.success && still, `exit ${r.status} success=${r.body.success}; B vehicle still parked=${!!still}`);
});

test('ISO-10 [AC-03] Attendant A: relocating a Site B vehicle into a Site A slot is refused', async () => {
  if (!(await slotsOf('master', F.B.id)).some((s) => s.currentVehicle === 'MH14CD5678')) await post('attB', '/vehicles/entry', { vehicleNumber: 'MH14CD5678' });
  const r = await post('attA', '/slots/change', { vehicleNumberOrSlot: 'MH14CD5678', newSlotNumber: 'A-03', reason: 'qa', attendantName: 'QA attA' });
  const a3 = (await slotsOf('master', F.A.id)).find((s) => s.slotNumber === 'A-03');
  if (r.body.success) await post('master', '/vehicles/exit', { vehicleNumberOrSlot: 'MH14CD5678' }, F.A.id);
  assert.ok(!r.body.success, `relocation succeeded: Site A slot A-03 now holds Site B vehicle ${a3.currentVehicle}`);
});

test('ISO-11 [AC-03] Site Admin A: approving a Site B registration is refused', async () => {
  assert.equal((await post('adminA', '/registrations/approve', { requestId: F.regB.id })).status, 403);
});

test('ISO-12 [AC-03] Site Admin A: editing a Site B employee by id is refused and record unchanged', async () => {
  const r = await post('adminA', '/employees/save', { employee: { id: F.empB.id, name: 'QA Tampered', vehicleNumber: 'MH14CD5678' } });
  const now = (await get('master', `/employees?siteId=${F.B.id}`)).body.employees.find((e) => e.employeeId === 'QAE-B1');
  assert.equal(r.status, 403, `status ${r.status}; Site B employee now name='${now?.name ?? '(moved out of Site B)'}'`);
});

test('ISO-13 [AC-03] Refused cross-site write attempts are audit-logged', async () => {
  await post('adminA', '/slots/delete', { slotId: F.bSlot.id });
  const hit = (await auditLogs()).find((l) => l.actor === F.adminAUser.email && l.status === 'BLOCKED_UNAUTHORIZED');
  assert.ok(hit, 'no BLOCKED_UNAUTHORIZED audit entry for Site Admin A');
});

test('ISO-14 [AC-05] Site switcher source (/my-sites) offers only assigned sites', async () => {
  assert.deepEqual((await get('adminA', '/my-sites')).body.sites.map((s) => s.id), [F.A.id]);
});

test('ISO-15 [AC-44] User with no assigned site gets no data (no site, or naming a site)', async () => {
  assert.deepEqual((await get('noSite', '/my-sites')).body.sites, [], '/my-sites should be empty');
  for (const [u, key] of LISTS) {
    for (const site of [NONE, F.A.id]) {
      const r = await get('noSite', u, site);
      const rows = r.body?.[key] || [];
      assert.ok([400, 403].includes(r.status) || rows.length === 0, `${u} (site ${String(site)}) -> ${r.status}, ${rows.length} rows`);
    }
  }
});

// ---------------- Role permissions (AC-07, AC-08, AC-10, AC-11) ----------------
test('PERM-01 [AC-07] Site Admin cannot call Master-only APIs (onboard, status, pricing, users, invoices)', async () => {
  const calls = [['/sites/onboard', { siteName: 'X', city: 'Y' }], ['/sites/status', { siteId: F.A.id, status: 'ON_HOLD' }],
    ['/sites/pricing', { siteId: F.A.id, pricing: {} }], ['/rbac/users', { fullName: 'x' }], ['/invoices/generate', { siteId: F.A.id, baseAmount: 1 }]];
  for (const [u, b] of calls) assert.equal((await post('adminA', u, b)).status, 403, u);
});

// PERM-02 rewritten for PRD Addendum C / AC-57 (user decision 28 Sep): a Site Admin manages
// allowed email domains for their OWN site only; Site B's and platform-wide entries are
// out of reach (403); platform-wide entries are Master Admin only. API per 03 v1.0.1 (B13/B14).
const manageRows = async (who, site) => (await get(who, '/domains/manage', site)).body.domains || [];

test('PERM-02a [AC-57] Site Admin A adds a domain for Site A: stored with Site A, audit-logged with siteId', async () => {
  const r = await post('adminA', '/domains/add', { domain: 'qa-a-only.in' });
  assert.equal(r.status, 200, `add -> ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body.domain?.siteId, F.A.id, `stored siteId=${r.body.domain?.siteId}`);
  F.domA = r.body.domain;
  assert.ok((await manageRows('adminA')).some((d) => d.id === F.domA.id), 'not listed in Site A /domains/manage');
  const a = (await auditLogs()).find((l) => l.action === 'DOMAIN_WHITELIST_ADDED' && l.actor === F.adminAUser.email);
  assert.ok(a, 'no DOMAIN_WHITELIST_ADDED audit row');
  assert.equal(a.siteId, F.A.id, `audit siteId=${a.siteId}`);
});

test('PERM-02b [AC-57] A Site A domain applies to Site A registrations only', async () => {
  const atA = await post(null, '/registrations/submit', { siteId: F.A.id, name: 'QA Dom A', email: 'da1@qa-a-only.in',
    mobile: '+91 9000000011', vehicleNumber: 'MH12DA0001', employeeId: 'QAD-A1' });
  assert.equal(atA.status, 200, `Site A registration -> ${atA.status} ${atA.body.message}`);
  const atB = await post(null, '/registrations/submit', { siteId: F.B.id, name: 'QA Dom B', email: 'db1@qa-a-only.in',
    mobile: '+91 9000000012', vehicleNumber: 'MH14DA0002', employeeId: 'QAD-B1' });
  assert.equal(atB.status, 400, `Site B registration with a Site A-only domain -> ${atB.status}`);
  const pubB = (await get(null, `/domains?siteId=${F.B.id}`)).body.domains.map((d) => d.domain);
  assert.ok(!pubB.includes('qa-a-only.in'), 'public /domains for Site B lists the Site A domain');
});

test('PERM-02c [AC-57] Site Admin A cannot add a domain for Site B or platform-wide', async () => {
  const toB = await post('adminA', '/domains/add', { domain: 'qa-a-to-b.in' }, F.B.id);
  assert.equal(toB.status, 403, `add at Site B -> ${toB.status}`);
  for (const site of [NONE, 'ALL']) {
    const r = await post('adminA', '/domains/add', { domain: 'qa-a-platform.in' }, site);
    const label = site === NONE ? 'no site' : 'ALL';
    if (FALLBACK) {
      // Kill-switch: a missing/ALL site falls back to the admin's own site (A), never platform-wide.
      assert.ok(r.status === 200 && r.body.domain?.siteId === F.A.id, `fallback add with ${label} -> ${r.status} ${JSON.stringify(r.body.domain)}`);
      await post('adminA', '/domains/remove', { domainId: r.body.domain.id });
    } else {
      assert.ok([400, 403].includes(r.status), `add with ${label} -> ${r.status} (must not become platform-wide)`);
    }
  }
  const every = await manageRows('master', 'ALL');
  const leaked = every.filter((d) => d.domain === 'qa-a-to-b.in' || (d.domain === 'qa-a-platform.in' && !d.siteId));
  assert.deepEqual(leaked.map((d) => `${d.domain}@${d.siteId ?? 'platform'}`), [], 'a refused add was stored');
});

test('PERM-02d [AC-57] Site Admin A cannot see or remove Site B domains, nor remove platform-wide ones', async () => {
  const b = await post('master', '/domains/add', { domain: 'qa-b-only.in' }, F.B.id);
  assert.ok(b.body.success && b.body.domain.siteId === F.B.id, `setup Site B domain: ${JSON.stringify(b.body)}`);
  F.domB = b.body.domain;
  const mine = await manageRows('adminA');
  assert.deepEqual(mine.filter((d) => d.siteId && d.siteId !== F.A.id).map((d) => d.domain), [], 'Site B rows visible to Site A');
  assert.equal((await get('adminA', '/domains/manage', F.B.id)).status, 403, '/domains/manage?site=B');
  const rmB = await post('adminA', '/domains/remove', { domainId: F.domB.id });
  assert.equal(rmB.status, 403, `remove Site B entry -> ${rmB.status}`);
  assert.equal(errCode(rmB), 'ERR_SITE_FORBIDDEN');
  const rmP = await post('adminA', '/domains/remove', { domainId: F.domPlatform.id });
  assert.equal(rmP.status, 403, `remove platform-wide entry -> ${rmP.status}`);
  assert.equal(errCode(rmP), 'ERR_MASTER_ONLY');
  const every = (await manageRows('master', 'ALL')).map((d) => d.id);
  assert.ok(every.includes(F.domB.id) && every.includes(F.domPlatform.id), 'a refused remove deleted the entry');
});

test('PERM-02e [AC-57] Site Admin A removes their own Site A domain; removal is audit-logged with siteId', async () => {
  const r = await post('adminA', '/domains/remove', { domainId: F.domA.id });
  assert.equal(r.status, 200, `remove own -> ${r.status} ${JSON.stringify(r.body)}`);
  assert.ok(!(await manageRows('adminA')).some((d) => d.id === F.domA.id), 'still listed after remove');
  const a = (await auditLogs()).find((l) => l.action === 'DOMAIN_WHITELIST_REMOVED' && l.actor === F.adminAUser.email);
  assert.ok(a && a.siteId === F.A.id, `audit row: ${JSON.stringify(a)}`);
});

test('PERM-03 [AC-08] Attendant cannot edit inventory, approve passes or export logs', async () => {
  assert.equal((await post('attA', '/slots/save', { slot: { slotNumber: 'A-09' } })).status, 403, 'slots/save');
  assert.equal((await post('attA', '/registrations/approve', { requestId: 'x' })).status, 403, 'approve');
  assert.equal((await get('attA', '/export/reports?type=logs')).status, 403, 'export');
});

test('PERM-04 [AC-11] Module override cannot widen site scope', async () => {
  const r = await post('master', '/rbac/users/toggle-module', { userId: F.adminAUser.id, moduleId: 'MASTER_CONFIG', enabled: true });
  assert.ok(r.body.success, JSON.stringify(r.body));
  assert.equal((await get('adminA', `/slots?siteId=${F.B.id}`)).status, 403);
  await post('master', '/rbac/users/toggle-module', { userId: F.adminAUser.id, moduleId: 'MASTER_CONFIG', enabled: false });
});

// ---------------- Core flows ----------------
test('FLOW-01 [AC-12] Onboarded site is Active and listed', async () => {
  assert.equal(F.A.status, 'ACTIVE');
  assert.ok((await get('master', '/sites')).body.sites.some((s) => s.id === F.A.id));
});

test('FLOW-02 [AC-13] Onboarding rejects missing field and duplicate code', async () => {
  assert.equal((await post('master', '/sites/onboard', { siteName: 'QA NoCity' })).status, 400, 'missing city');
  assert.equal((await post('master', '/sites/onboard', { siteName: 'QA Dup', siteCode: 'QAA', city: 'Pune' })).status, 400, 'dup code');
});

test('FLOW-03 [AC-13] Onboarding rejects negative / non-numeric capacity and rate', async () => {
  const r1 = await post('master', '/sites/onboard', { siteName: 'QA Neg', siteCode: 'QANEG', city: 'Pune', totalSlots: -5 });
  const r2 = await post('master', '/sites/onboard', { siteName: 'QA NaN', siteCode: 'QANAN', city: 'Pune', totalSlots: 'abc',
    pricing: { hourlyRate: -10, dailyMaxRate: 0, monthlyPassRate: 0, currency: 'INR', taxPercentage: 18 } });
  assert.ok(r1.status === 400 && r2.status === 400, `negative capacity -> ${r1.status}, NaN capacity + negative rate -> ${r2.status}`);
});

test('FLOW-04 [AC-14] Entry blocked at an On-Hold site; exit still allowed', async () => {
  const e = await post('master', `/vehicles/entry?siteId=${F.C.id}`, { vehicleNumber: 'MH12QA0001' });
  assert.ok(e.body.success, 'setup entry at C');
  await post('master', '/sites/status', { siteId: F.C.id, status: 'ON_HOLD', holdReason: 'qa' });
  const blocked = await post('master', `/vehicles/entry?siteId=${F.C.id}`, { vehicleNumber: 'MH12QA0002' });
  const exit = await post('master', `/vehicles/exit?siteId=${F.C.id}`, { vehicleNumberOrSlot: 'MH12QA0001' });
  if (blocked.body.success) await post('master', `/vehicles/exit?siteId=${F.C.id}`, { vehicleNumberOrSlot: 'MH12QA0002' });
  assert.ok(exit.body.success, 'exit at on-hold site should work');
  assert.equal(blocked.body.success, false, `entry at ON_HOLD site accepted: ${blocked.body.message}`);
});

test('FLOW-05 [AC-16] Slot re-upload skips existing slot numbers (no overwrite) and reports created/skipped/failed', async () => {
  const r = await post('adminA', '/slots/bulk-upload', { slots: [
    { slotNumber: 'A-01', basement: 'B3', floorLocation: 'OVERWRITTEN', slotType: 'SEDAN' },
    { slotNumber: 'A-10', basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN' }] });
  const a1 = (await slotsOf('adminA', F.A.id)).find((s) => s.slotNumber === 'A-01');
  const res = r.body.result || {};
  assert.equal(a1.floorLocation, 'Level 1', `existing slot overwritten -> floorLocation='${a1.floorLocation}'`);
  assert.ok('skipped' in res && 'failed' in res, `summary lacks skipped/failed: ${JSON.stringify(res)}`);
});

test('FLOW-06 [AC-17] Slot upload with bad rows lists each invalid row with reason', async () => {
  const r = await post('adminA', '/slots/bulk-upload', { slots: [
    { basement: 'B1', slotType: 'SEDAN' }, { slotNumber: 'A-11', slotType: 'SPACESHIP' }, { slotNumber: 'A-12', slotType: 'SEDAN' }] });
  const unknownType = (await slotsOf('adminA', F.A.id)).find((s) => s.slotNumber === 'A-11');
  assert.ok(Array.isArray(r.body.result?.errors || r.body.errors) && !unknownType,
    `no per-row errors returned; slot with unknown type imported=${!!unknownType}; body=${JSON.stringify(r.body).slice(0, 160)}`);
});

test('FLOW-07 [AC-19] Approved plate at its own site gets a vacant slot of that site, marked Occupied', async () => {
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'MH12AB1234' });
  assert.ok(r.body.success, JSON.stringify(r.body));
  assert.equal(r.body.slot.siteId, F.A.id);
  const s = (await slotsOf('adminA', F.A.id)).find((x) => x.id === r.body.slot.id);
  assert.equal(s.status, 'OCCUPIED');
  F.aSlot = s;
});

test('FLOW-08 [AC-21] Duplicate entry of a parked plate is refused and shows existing slot', async () => {
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'MH12AB1234' });
  assert.equal(r.body.success, false);
  assert.equal(r.body.slot?.id, F.aSlot.id);
});

test('FLOW-09 [AC-20] Plate with no pass is told "not authorised"; no slot occupied', async () => {
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'KA01ZZ9999' });
  if (r.body.success) await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'KA01ZZ9999' });
  assert.equal(r.body.success, false, `unregistered plate admitted into ${r.body.slot?.slotNumber}`);
});

test('FLOW-10 [AC-20] Plate whose pass is at another site is refused', async () => {
  const setup = await post('master', '/employees/save', { employee: { siteId: F.B.id, employeeId: 'QAE-B2', name: 'QA B2', email: 'b2@qa-corp.in',
    mobile: '+91 9876500000', vehicleNumber: 'MH14GH2222', vehicleType: 'SEDAN', status: 'ACTIVE' } }, F.B.id);
  assert.ok(setup.body.success, `setup: ${JSON.stringify(setup.body)}`);
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'MH14GH2222' });
  if (r.body.success) await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH14GH2222' });
  assert.equal(r.body.success, false, `Site B pass admitted at Site A into ${r.body.slot?.slotNumber}`);
});

test('FLOW-11 [AC-22] No vacant slot of required vehicle type -> "full" and nothing written', async () => {
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'MH12TW0001', vehicleType: 'TWO_WHEELER' });
  if (r.body.success) await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12TW0001' });
  assert.equal(r.body.success, false, `two-wheeler put in ${r.body.slot?.slotType} slot ${r.body.slot?.slotNumber}`);
});

test('FLOW-12 [AC-23] Non-Indian plate strings are rejected', async () => {
  const accepted = [];
  for (const p of ['ABCD', '12345678', 'XX99']) {
    const r = await post('attA', '/vehicles/entry', { vehicleNumber: p });
    if (r.body.success) { accepted.push(p); await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: p }); }
  }
  assert.equal((await post('attA', '/vehicles/entry', { vehicleNumber: '@@!!' })).status, 400, 'symbols');
  assert.deepEqual(accepted, [], `accepted as valid plates: ${accepted.join(', ')}`);
});

test('FLOW-13 [AC-36] Relocation within site keeps plate and is logged', async () => {
  const target = (await slotsOf('adminA', F.A.id)).find((s) => s.status === 'VACANT');
  const r = await post('attA', '/slots/change', { vehicleNumberOrSlot: 'MH12AB1234', newSlotNumber: target.slotNumber, reason: 'qa', attendantName: 'QA attA' });
  assert.ok(r.body.success, JSON.stringify(r.body));
  const slots = await slotsOf('adminA', F.A.id);
  assert.equal(slots.find((s) => s.id === F.aSlot.id).status, 'VACANT');
  assert.equal(slots.find((s) => s.id === target.id).currentVehicle, 'MH12AB1234');
  const n = (await get('adminA', '/slots/change-notifications')).body.notifications.find((x) => x.newSlotNumber === target.slotNumber);
  assert.ok(n, 'relocation not logged');
  F.aSlot = target;
});

test('FLOW-14 [AC-24] Exit records exit time, duration and amount due (paid site); slot freed', async () => {
  const r = await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12AB1234' });
  assert.ok(r.body.success, JSON.stringify(r.body));
  assert.ok(r.body.log?.exitTime && r.body.log?.durationMinutes >= 1, 'exit time/duration');
  assert.equal((await slotsOf('adminA', F.A.id)).find((s) => s.id === F.aSlot.id).status, 'VACANT');
  const amount = r.body.amountDue ?? r.body.log?.amountDue ?? r.body.log?.amount;
  assert.ok(amount !== undefined, 'no amount due returned for a site with hourly pricing');
});

test('FLOW-15 [AC-25] Exit of a plate not parked on site is refused', async () => {
  const r = await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12NOTHERE1' });
  assert.equal(r.body.success, false);
  assert.match(r.body.message, /no active|not found/i);
});

test('FLOW-16 [AC-26] Registration with whitelisted domain creates a Pending request for the chosen site', async () => {
  const r = await post(null, '/registrations/submit', { siteId: F.A.id, name: 'QA Reg A', email: 'rega@qa-corp.in',
    mobile: '+91 9000000002', vehicleNumber: 'MH12RA1001', employeeId: 'QAR-A1' });
  assert.ok(r.body.success, JSON.stringify(r.body));
  assert.equal(r.body.request.status, 'PENDING');
  assert.equal(r.body.request.siteId, F.A.id);
  F.regA = r.body.request;
});

test('FLOW-17 [AC-27] Registration refused for bad domain and duplicate active plate', async () => {
  assert.equal((await post(null, '/registrations/submit', { siteId: F.A.id, name: 'x', email: 'x@gmail.com', vehicleNumber: 'MH12ZZ0001' })).status, 400, 'domain');
  assert.equal((await post(null, '/registrations/submit', { siteId: F.A.id, name: 'x', email: 'y@qa-corp.in', vehicleNumber: 'MH12AB1234' })).status, 400, 'dup plate');
});

test('FLOW-18 [AC-27] Registration refused for malformed phone or plate', async () => {
  const p = await post(null, '/registrations/submit', { siteId: F.A.id, name: 'x', email: 'p1@qa-corp.in', mobile: 'not-a-phone', vehicleNumber: 'MH12PP0001' });
  const v = await post(null, '/registrations/submit', { siteId: F.A.id, name: 'x', email: 'p2@qa-corp.in', mobile: '+91 9000000003', vehicleNumber: '!!??' });
  assert.ok(p.status === 400 && v.status === 400, `bad phone -> ${p.status}, bad plate -> ${v.status}`);
});

test('FLOW-19 [AC-28] Approval creates the pass at the request\'s site and is audit-logged', async () => {
  const r = await post('adminA', '/registrations/approve', { requestId: F.regA.id });
  assert.ok(r.body.success, JSON.stringify(r.body));
  const logs = await auditLogs();
  const audited = logs.some((l) => /REGISTRATION|APPROV/i.test(l.action) && String(l.details).includes('MH12RA1001'));
  assert.equal(r.body.employee.siteId, F.A.id, `pass created at '${r.body.employee.siteId}' instead of Site A`);
  assert.ok(audited, 'approval not audit-logged');
});

test('FLOW-20 [AC-29] Rejection without a reason is blocked', async () => {
  const s = await post(null, '/registrations/submit', { siteId: F.A.id, name: 'QA Rej', email: 'rej@qa-corp.in', mobile: '+91 9000000004', vehicleNumber: 'MH12RJ0001' });
  const r = await post('adminA', '/registrations/reject', { requestId: s.body.request.id });
  assert.equal(r.status, 400, `rejected with default reason: ${r.body.message}`);
});

test('FLOW-21 [AC-30] Revoked (inactive) pass is refused at the gate', async () => {
  const setup = await post('master', '/employees/save', { employee: { id: F.empA.id, siteId: F.A.id, employeeId: 'QAE-A1', name: 'QA QAE-A1', vehicleNumber: 'MH12AB1234', status: 'INACTIVE' } }, F.A.id);
  assert.ok(setup.body.success, `setup: ${JSON.stringify(setup.body)}`);
  const r = await post('attA', '/vehicles/entry', { vehicleNumber: 'MH12AB1234' });
  if (r.body.success) await post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12AB1234' });
  assert.equal(r.body.success, false, 'inactive pass admitted');
});

test('FLOW-22 [AC-32] Log export honours plate filter and site scope', async () => {
  const r = await get('adminA', `/export/reports?type=logs&search=MH12AB1234`);
  assert.equal(r.status, 200);
  const rows = String(r.body).trim().split('\n').slice(1);
  const off = rows.find((l) => !l.includes('MH12AB1234'));
  assert.ok(rows.length > 0 && !off, `export ignored the plate filter: ${rows.length} rows, e.g. ${off?.slice(0, 60)}`);
});

test('FLOW-23 [AC-35] Invoice can be generated and marked Paid', async () => {
  const g = await post('master', '/invoices/generate', { siteId: F.A.id, billingPeriod: 'Sep 2026', baseAmount: 10000 });
  assert.ok(g.body.success);
  assert.equal(g.body.invoice.totalAmount, 11800);
  const p = await post('master', '/invoices/status', { invoiceId: g.body.invoice.id, status: 'PAID' });
  assert.ok(p.body.success, JSON.stringify(p.body));
});

test('FLOW-24 [AC-37] Gate entry/exit writes an audit entry with site', async () => {
  const logs = await auditLogs();
  const gate = logs.filter((l) => /VEHICLE_ENTRY|VEHICLE_EXIT|GATE_/i.test(l.action) && l.status === 'SUCCESS');
  assert.ok(gate.length > 0, 'no audit entries for successful vehicle entry/exit');
  assert.ok(gate.every((l) => 'siteId' in l), 'audit entries carry no site');
});

test('FLOW-25 [AC-39] Valet: retrieval request from Site A cannot hit a Site B ticket', async () => {
  const t = await post('master', `/valet/checkin`, { siteId: F.B.id, vehicleNumber: 'MH14VV7777', guestName: 'QA Guest', guestPhone: '+91 9111111111' }, F.B.id);
  assert.ok(t.body.success, JSON.stringify(t.body));
  const r = await post('adminA', '/valet/request-retrieval', { query: '9111111111' });
  assert.equal(r.body.success, false, `Site A user changed Site B ticket ${r.body.ticket?.ticketNumber} to ${r.body.ticket?.status}`);
});

test('FLOW-26 [AC-39] Valet: transitions are timestamped', async () => {
  const t = (await post('adminA', '/valet/checkin', { vehicleNumber: 'MH12VV1001', guestName: 'QA G', guestPhone: '+91 9222222222' })).body.ticket;
  assert.equal(t.siteId, F.A.id);
  assert.ok(t.receivedAt && t.parkedAt);
  const r1 = await post('adminA', '/valet/status', { ticketId: t.id, status: 'RETRIEVAL_REQUESTED' });
  const r2 = await post('adminA', '/valet/status', { ticketId: t.id, status: 'RETRIEVED_DELIVERED' });
  assert.ok(r1.body.ticket.retrievalRequestedAt && r2.body.ticket.deliveredAt);
});

test('FLOW-27 [AC-39] Valet: invalid status value is rejected', async () => {
  const t = (await post('adminA', '/valet/checkin', { vehicleNumber: 'MH12VV1002', guestName: 'QA G2', guestPhone: '+91 9333333333' })).body.ticket;
  const r = await post('adminA', '/valet/status', { ticketId: t.id, status: 'BANANA' });
  assert.equal(r.body.success, false, `ticket status set to ${r.body.ticket?.status}`);
});

test('FLOW-28 [AC-40] Overnight request decision stores reviewer', async () => {
  const s = await post('adminA', '/reports/overnight-requests', { vehicleNumber: 'MH12ON0001', requestedBy: 'QA', nights: 1, reason: 'qa' });
  assert.ok(s.body.success, JSON.stringify(s.body));
  const r = await post('adminA', '/reports/overnight-requests/review', { requestId: s.body.request.id, decision: 'APPROVED' });
  assert.ok(r.body.success && r.body.request.reviewedBy === 'QA adminA', JSON.stringify(r.body));
});

test('FLOW-29 [AC-10] Suspended user: existing session rejected on next request and sign-in refused', async () => {
  const r = await post('master', '/rbac/users', { id: F.attBUser.id, status: 'SUSPENDED' });
  assert.ok(r.body.success, JSON.stringify(r.body));
  assert.equal((await get('attB', '/slots')).status, 403, 'existing session');
  const l = await post(null, '/auth/login', { identifier: F.attBUser.email, password: PW });
  assert.notEqual(l.status, 200, 'sign-in');
});

// The public registration route allows 10 requests/min per client; earlier tests use most of it,
// so these late tests wait out a 429 instead of failing on it.
async function submitReg(body) {
  for (let i = 0; i < 6; i++) {
    const r = await post(null, '/registrations/submit', body);
    if (r.status !== 429) return r;
    await sleep(15000);
  }
  throw new Error('registration submit still rate-limited after 90 s');
}

// ---------------- Late fixes, acceptance level (step 6; backend unit cases are in 001-backend) ----------------
test('LATE-01 [AC-27/B17] A registration pending at Site B does not block the same plate/email at Site A', async () => {
  const b = await submitReg({ siteId: F.B.id, name: 'QA Late B', email: 'late1@qa-corp.in',
    mobile: '+91 9000000021', vehicleNumber: 'MH14LT0001', employeeId: 'QAL-1' });
  assert.equal(b.status, 200, `Site B -> ${b.status} ${b.body.message}`);
  const a = await submitReg({ siteId: F.A.id, name: 'QA Late A', email: 'late1@qa-corp.in',
    mobile: '+91 9000000021', vehicleNumber: 'MH14LT0001', employeeId: 'QAL-1' });
  assert.equal(a.status, 200, `Site A blocked by Site B pending: ${a.status} ${a.body.message}`);
  const again = await submitReg({ siteId: F.A.id, name: 'QA Late A2', email: 'late1@qa-corp.in',
    mobile: '+91 9000000021', vehicleNumber: 'MH14LT0001' });
  assert.equal(again.status, 400, 'same-site pending duplicate must still be refused');
  assert.ok(!/QAL-1|QA Late|site-/.test(again.body.message), `message discloses data: ${again.body.message}`);
});

test('LATE-02 [AC-48/B17] An active pass at Site A does not block registering for Site B; each admin sees only their own request', async () => {
  // MH12RA1001 / rega@qa-corp.in was approved at Site A in FLOW-19.
  const b = await submitReg({ siteId: F.B.id, name: 'QA Reg A', email: 'rega@qa-corp.in',
    mobile: '+91 9000000002', vehicleNumber: 'MH12RA1001', employeeId: 'QAR-A1' });
  assert.equal(b.status, 200, `Site B -> ${b.status} ${b.body.message}`);
  assert.equal(b.body.request.siteId, F.B.id);
  const emps = (await get('adminA', '/employees')).body.employees;
  assert.ok(emps.some((e) => e.employeeId === 'QAR-A1' && e.status === 'ACTIVE'), 'Site A pass changed');
  const reqsA = (await get('adminA', '/registrations')).body.requests;
  assert.ok(!reqsA.some((r) => r.id === b.body.request.id), 'Site A admin sees the Site B request');
});

test('LATE-03 [AC-57/C-1] Public /domains needs a site and returns names only', async () => {
  const none = await get(null, '/domains');
  assert.equal(none.status, 400); assert.equal(errCode(none), 'ERR_SITE_REQUIRED');
  assert.equal((await get(null, '/domains?siteId=ALL')).status, 400, 'ALL');
  const a = await get(null, `/domains?siteId=${F.A.id}`);
  assert.equal(a.status, 200);
  assert.ok(a.body.domains.every((d) => Object.keys(d).join() === 'domain'), `extra fields: ${JSON.stringify(a.body.domains[0])}`);
  const names = a.body.domains.map((d) => d.domain);
  assert.ok(names.includes('qa-corp.in'), 'platform-wide domain missing');
  assert.ok(!names.includes('qa-b-only.in'), 'Site B domain listed for Site A');
});
