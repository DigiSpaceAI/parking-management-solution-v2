// QA API tests — feature 001-parkflows-platform-v1 (docs/features/001-parkflows-platform-v1/01-prd.md)
// Runner: Node's built-in test runner (node:test) + global fetch — NO new dependencies.
// Run:   node --test tests/qa/            (from the repo root, after `npm install`)
// The suite boots server.ts via tsx in a throw-away working dir (in-memory store,
// Firestore env vars blanked => never touches production data) and builds its own
// fixtures — Site A, Site B, Site C, users, slots — through the public API.
// Test names start with the test ID and the AC they cover (see 06-test-report.md).
// A FAILING test here means the acceptance criterion is NOT met.
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

async function call(who, method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers['x-session-token'] = tok[who];
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const get = (who, url) => call(who, 'GET', url);
const post = (who, url, body) => call(who, 'POST', url, body);

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
    SEED_DEMO_USERS: 'false', FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', GEMINI_API_KEY: '' };
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
    const r = await post('master', '/slots/bulk-upload', { slots: mkSlots(s, p, 3) });
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
  await mkUser('adminA', 'role-site-manager', [F.A.id]);
  await mkUser('attA', 'role-gate-attendant', [F.A.id]);
  await mkUser('attB', 'role-gate-attendant', [F.B.id]);
  await mkUser('noSite', 'role-site-manager', []);

  // Approved passes (active whitelisted employees) at A and B
  const e = async (site, id, plate) => (await post('master', '/employees/save', { employee: { siteId: site.id, employeeId: id,
    name: `QA ${id}`, email: `${id.toLowerCase()}@qa-corp.in`, mobile: '+91 9876543210', vehicleNumber: plate, vehicleType: 'SEDAN', status: 'ACTIVE' } })).body.employee;
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
  // Corporate domain + one pending registration at Site B
  await post('master', '/domains/add', { domain: 'qa-corp.in' });
  const rb = await post(null, '/registrations/submit', { siteId: F.B.id, name: 'QA Reg B', email: 'regb@qa-corp.in',
    mobile: '+91 9000000001', vehicleNumber: 'MH14EF1111', employeeId: 'QAR-B1' });
  assert.ok(rb.body.success, JSON.stringify(rb.body));
  F.regB = rb.body.request;
});

after(() => { server?.kill(); if (workDir) rmSync(workDir, { recursive: true, force: true }); });

// ---------------- Site isolation (AC-02, AC-03, AC-05, AC-06, AC-44) ----------------
test('ISO-01 [AC-02] Site Admin A: list APIs without siteId return only Site A rows', async () => {
  const s = await get('adminA', '/slots');
  assert.ok(s.body.slots.length > 0 && onlySite(s.body.slots, F.A.id), 'slots');
  assert.ok(onlySite((await get('adminA', '/employees')).body.employees, F.A.id), 'employees');
  assert.ok(onlySite((await get('adminA', '/logs')).body.logs, F.A.id), 'logs');
  assert.ok(onlySite((await get('adminA', '/alerts/non-parked')).body.alerts, F.A.id), 'alerts');
  assert.ok(onlySite((await get('adminA', '/registrations')).body.requests, F.A.id), 'registrations');
  assert.ok(onlySite((await get('adminA', '/valet/tickets')).body.tickets, F.A.id), 'valet');
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
  const now = (await get('master', '/slots')).body.slots.find((s) => s.id === target.id);
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
  if (r.body.success) await post('master', '/vehicles/exit', { vehicleNumberOrSlot: 'MH14CD5678' });
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
  const logs = (await get('master', '/security/audit-logs?limit=1000')).body.logs;
  const hit = logs.find((l) => l.actor === F.adminAUser.email && l.status === 'BLOCKED_UNAUTHORIZED');
  assert.ok(hit, 'no BLOCKED_UNAUTHORIZED audit entry for Site Admin A');
});

test('ISO-14 [AC-05] Site switcher source (/my-sites) offers only assigned sites', async () => {
  assert.deepEqual((await get('adminA', '/my-sites')).body.sites.map((s) => s.id), [F.A.id]);
});

test('ISO-15 [AC-44] User with no assigned site gets no data', async () => {
  for (const u of ['/slots', '/employees', '/logs', '/registrations']) {
    const r = await get('noSite', u);
    const rows = r.body.slots || r.body.employees || r.body.logs || r.body.requests || [];
    assert.ok(r.status === 403 || rows.length === 0, `${u} returned ${rows.length} rows`);
  }
});

// ---------------- Role permissions (AC-07, AC-08, AC-10, AC-11) ----------------
test('PERM-01 [AC-07] Site Admin cannot call Master-only APIs (onboard, status, pricing, users, invoices)', async () => {
  const calls = [['/sites/onboard', { siteName: 'X', city: 'Y' }], ['/sites/status', { siteId: F.A.id, status: 'ON_HOLD' }],
    ['/sites/pricing', { siteId: F.A.id, pricing: {} }], ['/rbac/users', { fullName: 'x' }], ['/invoices/generate', { siteId: F.A.id, baseAmount: 1 }]];
  for (const [u, b] of calls) assert.equal((await post('adminA', u, b)).status, 403, u);
});

test('PERM-02 [AC-07] Site Admin cannot change the corporate domain whitelist', async () => {
  const r = await post('adminA', '/domains/add', { domain: 'qa-sitea-added.in' });
  assert.equal(r.status, 403, `status ${r.status}: ${r.body.message}`);
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
  await post('master', '/employees/save', { employee: { siteId: F.B.id, employeeId: 'QAE-B2', name: 'QA B2', email: 'b2@qa-corp.in',
    mobile: '+91 9876500000', vehicleNumber: 'MH14GH2222', vehicleType: 'SEDAN', status: 'ACTIVE' } });
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
  const logs = (await get('master', '/security/audit-logs?limit=1000')).body.logs;
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
  await post('master', '/employees/save', { employee: { id: F.empA.id, siteId: F.A.id, employeeId: 'QAE-A1', name: 'QA QAE-A1', vehicleNumber: 'MH12AB1234', status: 'INACTIVE' } });
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
  const logs = (await get('master', '/security/audit-logs?limit=1000')).body.logs;
  const gate = logs.filter((l) => /VEHICLE_ENTRY|VEHICLE_EXIT|GATE_/i.test(l.action) && l.status === 'SUCCESS');
  assert.ok(gate.length > 0, 'no audit entries for successful vehicle entry/exit');
  assert.ok(gate.every((l) => 'siteId' in l), 'audit entries carry no site');
});

test('FLOW-25 [AC-39] Valet: retrieval request from Site A cannot hit a Site B ticket', async () => {
  const t = await post('master', `/valet/checkin`, { siteId: F.B.id, vehicleNumber: 'MH14VV7777', guestName: 'QA Guest', guestPhone: '+91 9111111111' });
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
