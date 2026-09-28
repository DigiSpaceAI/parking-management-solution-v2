// Backend API tests — feature 001-parkflows-platform-v1, Phase 1 backend tasks B1–B11
// (docs/features/001-parkflows-platform-v1/03-tech-design.md). Owner: backend-dev.
// QA's acceptance suite is 001-platform-v1.api.test.mjs; this file covers the
// server behaviour each backend task promises (its "Done-when").
// Runner: node:test + global fetch, no dependencies. Run: npm run test:qa
// Boots server.ts via tsx in a throw-away dir with Firestore disabled, so it
// never touches real data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
const PW = 'BackendTestPassword#2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(extraEnv = {}) {
  const port = 4000 + Math.floor(Math.random() * 900);
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-be-'));
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), BOOTSTRAP_ADMIN_PASSWORD: PW,
    SEED_DEMO_USERS: 'false', FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', GEMINI_API_KEY: '',
    K_SERVICE: '', SITE_SCOPE_MODE: '', ...extraEnv };
  const proc = spawn(path.join(REPO, 'node_modules', '.bin', 'tsx'), [path.join(REPO, 'server.ts')], { cwd: workDir, env, stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  let exited = null; proc.on('exit', (c) => (exited = c));
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 120; i++) {
    if (exited !== null) break;
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    await sleep(500);
  }
  return { base, proc, workDir, getLog: () => log, exitCode: () => exited,
    stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
}

let srv;
const tok = {};
const F = {};

async function call(who, method, url, { body, site, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (who) headers['x-session-token'] = typeof who === 'string' && tok[who] ? tok[who] : who;
  if (site) headers['x-site-id'] = site;
  const res = await fetch(srv.base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const get = (who, url, opts) => call(who, 'GET', url, opts);
const post = (who, url, body, opts = {}) => call(who, 'POST', url, { ...opts, body });

async function login(identifier, password = PW) {
  const r = await post(null, '/auth/login', { identifier, password });
  assert.equal(r.status, 200, `login ${identifier}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}
async function mkUser(key, roleId, sites, extra = {}) {
  await sleep(5);
  const email = `be.${key.toLowerCase()}@be-parkflows.test`;
  const r = await post('master', '/rbac/users', {
    username: `be.${key.toLowerCase()}`, fullName: `BE ${key}`, email, roleId,
    siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW, ...extra,
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
const mkSlots = (site, prefix, n) => Array.from({ length: n }, (_, i) => ({ siteId: site.id, slotNumber: `${prefix}-0${i + 1}`,
  basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', height: '2.0m', parkingType: 'FLAT', allocation: 'EMPLOYEE', status: 'VACANT' }));
const onlySite = (rows, siteId) => rows.length > 0 && rows.every((r) => (r.siteId || 'site-default') === siteId);
async function auditEntries(action) {
  const r = await get('master', '/security/audit-logs?limit=1000');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.logs.filter((l) => l.action === action);
}

before(async () => {
  srv = await startServer();
  tok.master = await login(MASTER_EMAIL);
  F.A = await onboard('BEA', 'BE Site A');
  F.B = await onboard('BEB', 'BE Site B');
  for (const [s, p] of [[F.A, 'A'], [F.B, 'B']]) {
    const r = await post('master', '/slots/bulk-upload', { slots: mkSlots(s, p, 3) }, { site: s.id });
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
  await mkUser('adminA', 'role-site-manager', [F.A.id]);
  await mkUser('adminAB', 'role-site-manager', [F.A.id, F.B.id]);
  await mkUser('attA', 'role-gate-attendant', [F.A.id]);
  await mkUser('attB', 'role-gate-attendant', [F.B.id]);
});
after(() => srv?.stop());

// ---------------------------------------------------------------- B1 / B2
test('B1 strict: list without a site -> 400 ERR_SITE_REQUIRED (Master and Site Admin)', async () => {
  for (const who of ['master', 'adminA']) {
    const r = await get(who, '/slots');
    assert.equal(r.status, 400, `${who}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.errorCode, 'ERR_SITE_REQUIRED');
  }
});

test('B1 strict: ALL is Master-only, and lists only', async () => {
  const m = await get('master', '/slots?siteId=ALL');
  assert.equal(m.status, 200);
  const sites = new Set(m.body.slots.map((s) => s.siteId));
  assert.ok(sites.has(F.A.id) && sites.has(F.B.id), 'ALL returns every site with siteId on each row');
  const a = await get('adminAB', '/slots?siteId=ALL');
  assert.equal(a.status, 400); assert.equal(a.body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  const rep = await get('master', '/reports/mix?siteId=ALL');
  assert.equal(rep.status, 400); assert.equal(rep.body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
});

test('B1 strict: foreign site -> 403 ERR_SITE_FORBIDDEN and a CROSS_SITE_ACCESS_DENIED audit row with siteId', async () => {
  const r = await get('adminA', `/slots?siteId=${F.B.id}`);
  assert.equal(r.status, 403); assert.equal(r.body.errorCode, 'ERR_SITE_FORBIDDEN');
  const rows = await auditEntries('CROSS_SITE_ACCESS_DENIED');
  assert.ok(rows.some((l) => l.siteId === F.B.id && l.actor === F.adminAUser.email), 'audit row carries the target siteId');
});

test('B1 strict: site code is normalised to the site id; header and query both work (query wins)', async () => {
  const byCode = await get('adminA', '/slots', { site: 'BEA' });
  assert.equal(byCode.status, 200); assert.ok(onlySite(byCode.body.slots, F.A.id));
  const both = await get('adminAB', `/slots?siteId=${F.B.id}`, { site: F.A.id });
  assert.equal(both.status, 200); assert.ok(onlySite(both.body.slots, F.B.id), '?siteId= wins over x-site-id');
  const unknown = await get('master', '/slots?siteId=no-such-site');
  assert.equal(unknown.status, 403);
});

test('B1 fallback: SITE_SCOPE_MODE=fallback restores the legacy first-site behaviour', async () => {
  const fb = await startServer({ SITE_SCOPE_MODE: 'fallback' });
  try {
    const t = (await (await fetch(fb.base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: MASTER_EMAIL, password: PW }) })).json()).token;
    const r = await fetch(fb.base + '/slots', { headers: { 'x-session-token': t } });
    assert.equal(r.status, 200, 'no site -> legacy: every site for a Master Admin');
    const rep = await fetch(fb.base + '/reports/mix', { headers: { 'x-session-token': t } });
    assert.equal(rep.status, 200, 'reports fall back to the default site');
  } finally { fb.stop(); }
});

test('B2 every scoped list/report route requires a site (400 without one)', async () => {
  const routes = ['/slots', '/employees', '/logs', '/alerts/non-parked', '/registrations', '/valet/tickets',
    '/slots/change-notifications', '/invoices', '/export/reports', '/reports/mix', '/reports/violations',
    '/reports/utilization', '/reports/occupancy-trend', '/reports/peak-hours', '/reports/overnight-requests',
    '/analytics/prediction'];
  for (const url of routes) {
    const r = await get('master', url);
    assert.equal(r.status, 400, `${url}: ${JSON.stringify(r.body).slice(0, 200)}`);
    assert.equal(r.body.errorCode, 'ERR_SITE_REQUIRED', url);
  }
  const ai = await post('master', '/ai/recommend', { prompt: 'x' });
  assert.equal(ai.status, 400, '/ai/recommend');
});

test('B2 lists return only the selected site; Site Admin A never sees Site B rows', async () => {
  for (const url of ['/slots', '/employees', '/logs', '/alerts/non-parked', '/registrations', '/valet/tickets']) {
    const r = await get('adminA', url, { site: F.A.id });
    assert.equal(r.status, 200, url);
    const rows = r.body.slots || r.body.employees || r.body.logs || r.body.alerts || r.body.requests || r.body.tickets || [];
    assert.ok(rows.every((x) => (x.siteId || 'site-default') === F.A.id), `${url} leaked another site`);
  }
});

test('B2/H1 /logs ignores maskPII & userRole query params; masking follows the server-side role', async () => {
  const r = await get('attA', '/logs?maskPII=false&userRole=MASTER_ADMIN', { site: F.A.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.piiMasked, true, 'attendant stays masked whatever the query says');
  const m = await get('master', '/logs', { site: F.A.id });
  assert.equal(m.body.piiMasked, false);
});

test('B2/H6 change-notifications need FLOOR_PLAN or MOBILE_APP view and are site-scoped', async () => {
  const r = await get('attA', '/slots/change-notifications', { site: F.A.id });
  assert.equal(r.status, 200);
  assert.ok(r.body.notifications.every((n) => (n.siteId || 'site-default') === F.A.id));
  const f = await get('attA', `/slots/change-notifications?siteId=${F.B.id}`);
  assert.equal(f.status, 403);
});

test('B2/L2 slot-daily-vehicles refuses a slot of another site', async () => {
  const bSlot = (await get('master', '/slots', { site: F.B.id })).body.slots[0];
  const r = await get('adminAB', `/reports/slot-daily-vehicles?slotId=${bSlot.id}`, { site: F.A.id });
  assert.equal(r.status, 403);
  const ok = await get('adminAB', `/reports/slot-daily-vehicles?slotId=${bSlot.id}`, { site: F.B.id });
  assert.equal(ok.status, 200);
});

test('B2 prediction is computed from the selected site only', async () => {
  const r = await get('master', '/analytics/prediction', { site: F.A.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.totalSlots, 3, 'Site A has 3 slots');
});

// ---------------------------------------------------------------- B3
const slotsAt = async (siteId) => (await get('master', '/slots', { site: siteId })).body.slots;

test('B3/H4 slot save by id of another site -> 403, record unchanged, audit-logged', async () => {
  const bSlot = (await slotsAt(F.B.id))[0];
  const r = await post('adminAB', '/slots/save', { slot: { id: bSlot.id, slotNumber: bSlot.slotNumber, siteId: F.A.id, status: 'MAINTENANCE' } }, { site: F.A.id });
  assert.equal(r.status, 403, JSON.stringify(r.body)); assert.equal(r.body.errorCode, 'ERR_SITE_FORBIDDEN');
  const after = (await slotsAt(F.B.id)).find((s) => s.id === bSlot.id);
  assert.equal(after.status, bSlot.status); assert.equal(after.siteId, F.B.id);
  assert.ok((await auditEntries('CROSS_SITE_ACCESS_DENIED')).some((l) => l.siteId === F.B.id && l.targetResource.includes('/slots/save')));
});

test('B3/H4 non-Master cannot move a record with body siteId; Master can and it is audit-logged', async () => {
  const mk = await post('master', '/slots/save', { slot: { slotNumber: 'B-MOVE-1', basement: 'B1', floorLocation: 'L1', slotType: 'SEDAN' } }, { site: F.B.id });
  assert.equal(mk.status, 200); assert.equal(mk.body.slot.siteId, F.B.id, 'create takes the resolved site');
  const id = mk.body.slot.id;
  const na = await post('adminAB', '/slots/save', { slot: { id, slotNumber: 'B-MOVE-1', siteId: F.A.id } }, { site: F.B.id });
  assert.equal(na.status, 200); assert.equal(na.body.slot.siteId, F.B.id, 'non-Master: stored site wins');
  const m = await post('master', '/slots/save', { slot: { id, slotNumber: 'B-MOVE-1', siteId: F.A.id } }, { site: F.B.id });
  assert.equal(m.status, 200); assert.equal(m.body.slot.siteId, F.A.id, 'Master may move');
  assert.ok((await auditEntries('RECORD_SITE_MOVED')).some((l) => l.targetResource === `slot/${id}` && l.siteId === F.A.id));
  await post('master', '/slots/delete', { slotId: id }, { site: F.A.id });
});

test('B3 create in a site other than the selected one is refused', async () => {
  const r = await post('adminAB', '/slots/save', { slot: { slotNumber: 'X-1', siteId: F.B.id } }, { site: F.A.id });
  assert.equal(r.status, 403);
});

test('B3/H4 bulk upload: one foreign row rejects the whole batch and nothing is written', async () => {
  const bSlot = (await slotsAt(F.B.id))[0];
  const before = (await slotsAt(F.A.id)).length;
  const byId = await post('adminAB', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-NEW-1' }, { id: bSlot.id, slotNumber: bSlot.slotNumber }] }, { site: F.A.id });
  assert.equal(byId.status, 403, JSON.stringify(byId.body));
  const bySite = await post('adminAB', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-NEW-1' }, { slotNumber: 'A-NEW-2', siteId: F.B.id }] }, { site: F.A.id });
  assert.equal(bySite.status, 403);
  assert.equal((await slotsAt(F.A.id)).length, before, 'no row of a refused batch was written');
  const noSite = await post('master', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-NEW-1' }] });
  assert.equal(noSite.status, 400);
  const ok = await post('adminAB', '/slots/bulk-upload', { slots: [{ slotNumber: 'A-NEW-1' }] }, { site: F.A.id });
  assert.equal(ok.status, 200);
  assert.ok((await slotsAt(F.A.id)).some((s) => s.slotNumber === 'A-NEW-1'), 'rows without siteId get the selected site');
});

test('B3/H4 employee save by id of another site -> 403 and record unchanged', async () => {
  const e = await post('master', '/employees/save', { employee: { name: 'B Emp', employeeId: 'BE-B-1', email: 'b.emp@be-b.test', vehicleNumber: 'MH12AB1001' } }, { site: F.B.id });
  assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(e.body.employee.siteId, F.B.id);
  F.empB = e.body.employee;
  const r = await post('adminAB', '/employees/save', { employee: { id: F.empB.id, name: 'Hijacked', vehicleNumber: 'MH12AB1001' } }, { site: F.A.id });
  assert.equal(r.status, 403);
  const bulk = await post('adminAB', '/employees/bulk-upload', { employees: [{ id: F.empB.id, name: 'Hijacked', vehicleNumber: 'MH12AB1001' }] }, { site: F.A.id });
  assert.equal(bulk.status, 403);
  const list = (await get('master', '/employees', { site: F.B.id })).body.employees;
  assert.equal(list.find((x) => x.id === F.empB.id).name, 'B Emp');
});

test('B3/L3 update-status validates the status and checks the slot site; delete checks the site', async () => {
  const aSlot = (await slotsAt(F.A.id))[0];
  const bad = await post('adminA', '/slots/update-status', { slotId: aSlot.id, newStatus: 'HACKED' }, { site: F.A.id });
  assert.equal(bad.status, 400);
  const bSlot = (await slotsAt(F.B.id))[0];
  const foreign = await post('adminAB', '/slots/update-status', { slotId: bSlot.id, newStatus: 'MAINTENANCE' }, { site: F.A.id });
  assert.equal(foreign.status, 403);
  const byNumber = await post('adminAB', '/slots/update-status', { slotId: bSlot.slotNumber, newStatus: 'MAINTENANCE' }, { site: F.A.id });
  assert.equal(byNumber.status, 404, 'slot number is looked up within the selected site only');
  const del = await post('adminAB', '/slots/delete', { slotId: bSlot.id }, { site: F.A.id });
  assert.equal(del.status, 403);
  assert.ok((await slotsAt(F.B.id)).some((s) => s.id === bSlot.id && s.status === bSlot.status));
});

test('B3 approve / reject / registration bulk of another site -> 403', async () => {
  const sub = await post(null, '/registrations/submit', { name: 'Reg B', email: 'reg.b@company.com', vehicleNumber: 'MH12AB2002', siteId: F.B.id });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  F.regB = sub.body.request;
  assert.equal((await post('adminAB', '/registrations/approve', { requestId: F.regB.id }, { site: F.A.id })).status, 403);
  assert.equal((await post('adminAB', '/registrations/reject', { requestId: F.regB.id, reason: 'x' }, { site: F.A.id })).status, 403);
  const bulk = await post('adminAB', '/registrations/bulk-upload', { requests: [{ name: 'Overwrite', email: 'reg.b@company.com', vehicleNumber: 'MH12AB2002' }] }, { site: F.A.id });
  assert.equal(bulk.status, 403, 'a row matching another site\'s request by email/plate is refused');
});

test('B3 valet: status and retrieval never touch another site\'s ticket', async () => {
  const t = await post('master', '/valet/checkin', { vehicleNumber: 'MH12AB3003', guestName: 'Guest B', guestPhone: '9800011111', keyTagNumber: 'K-777' }, { site: F.B.id });
  assert.ok(t.body.success, JSON.stringify(t.body)); assert.equal(t.body.ticket.siteId, F.B.id);
  const st = await post('adminAB', '/valet/status', { ticketId: t.body.ticket.id, status: 'PARKED' }, { site: F.A.id });
  assert.equal(st.status, 403);
  const rr = await post('adminAB', '/valet/request-retrieval', { query: 'K-777' }, { site: F.A.id });
  assert.equal(rr.body.success, false, 'site A query finds no site B ticket');
  const tickets = (await get('master', '/valet/tickets', { site: F.B.id })).body.tickets;
  assert.notEqual(tickets.find((x) => x.id === t.body.ticket.id).status, 'RETRIEVAL_REQUESTED');
});
