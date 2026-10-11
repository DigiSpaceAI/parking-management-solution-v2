// Backend API tests — feature 002 UI redesign, R1b tasks B1–B6
// (docs/features/002-ui-redesign/03-tech-design.md v1.2, task table). Owner: backend-dev.
// B6 tests are named after PRD 01 AC-32a–d.
// Runner: node:test + global fetch, no dependencies. Run: npm run test:qa
// Each server is server.ts via tsx in a throw-away dir with Firestore disabled,
// or (for the IST / cold-start / Firestore-delete cases) the 001 cold-start
// harness against an in-memory fake Firestore (tests/qa/support).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.PF_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_EMAIL = 'digisolutions.fm@gmail.com';
const PW = 'R1bBackendPassword#2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
const BASE_ENV = { NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: PW, SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '',
  K_SERVICE: '', SITE_SCOPE_MODE: '', AUDIT_HMAC_SECRET: 'r1b'.repeat(22) };

// Boots server.ts (plain) or the cold-start harness (fake Firestore) and waits
// until /health reports ready.
async function startServer({ fake = false, env = {} } = {}) {
  const port = 5000 + Math.floor(Math.random() * 900);
  const workDir = mkdtempSync(path.join(tmpdir(), 'pf-r1b-'));
  const fullEnv = { ...process.env, ...BASE_ENV, PORT: String(port), PF_REPO: REPO,
    FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '', GCLOUD_PROJECT: '', ...env };
  const args = fake ? [path.join(REPO, 'tests', 'qa', 'support', 'coldstart-harness.mjs'), 'server'] : [path.join(REPO, 'server.ts')];
  const proc = spawn(TSX, args, { cwd: workDir, env: fullEnv, stdio: 'pipe' });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  let exited = null; proc.on('exit', (c) => (exited = c));
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 240; i++) {
    if (exited !== null) break;
    try { const h = await fetch(base + '/health'); if (h.ok && (await h.json()).ready !== false) break; } catch {}
    await sleep(250);
  }
  if (exited !== null) throw new Error('server exited:\n' + log.slice(-2000));
  return { base, proc, workDir, getLog: () => log,
    stop: () => { proc.kill(); try { rmSync(workDir, { recursive: true, force: true }); } catch {} } };
}

function client(srv) {
  const tok = {};
  async function call(who, method, url, { body, site, headers: extra, raw } = {}) {
    const headers = { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(extra || {}) };
    if (who) headers['x-session-token'] = tok[who] || who;
    if (site) headers['x-site-id'] = site;
    const res = await fetch(srv.base + url, { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }
  const c = {
    tok, call,
    get: (who, url, o) => call(who, 'GET', url, o),
    post: (who, url, body, o = {}) => call(who, 'POST', url, { ...o, body }),
    async login(key, identifier, password = PW) {
      const r = await call(null, 'POST', '/auth/login', { body: { identifier, password } });
      assert.equal(r.status, 200, `login ${identifier}: ${JSON.stringify(r.body)}`);
      tok[key] = r.body.token;
    },
    async mkUser(key, roleId, sites) {
      await sleep(5);
      const email = `r1b.${key.toLowerCase()}@r1b-parkflows.test`;
      const r = await call('master', 'POST', '/rbac/users', { body: {
        username: `r1b.${key.toLowerCase()}`, fullName: `R1b ${key}`, email, roleId,
        siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW } });
      assert.ok(r.body.success, `create user ${key}: ${JSON.stringify(r.body)}`);
      await c.login(key, email);
      return r.body.user;
    },
    async onboard(code, name) {
      await sleep(5);
      const r = await call('master', 'POST', '/sites/onboard', { body: { siteName: name, siteCode: code, city: 'Pune', totalSlots: 4,
        pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 } } });
      assert.ok(r.body.success, JSON.stringify(r.body));
      return r.body.site;
    },
    async audit(action) {
      const r = await call('master', 'GET', '/security/audit-logs?limit=1000');
      return r.body.logs.filter((l) => l.action === action);
    },
  };
  return c;
}

const slot = (num, extra = {}) => ({ slotNumber: num, basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', height: 'Standard (2.0m)',
  parkingType: 'PUZZLE', allocation: 'EMPLOYEE', status: 'VACANT', ...extra });

// ------------------------------------------------------------------ shared server (Firestore off)
let srv; let c; const F = {};
before(async () => {
  srv = await startServer();
  c = client(srv);
  await c.login('master', MASTER_EMAIL);
  F.A = await c.onboard('RBA', 'R1b Site A');
  F.B = await c.onboard('RBB', 'R1b Site B');
  for (const [s, p] of [[F.A, 'A'], [F.B, 'B']]) {
    const r = await c.post('master', '/slots/bulk-upload', { slots: [slot(`${p}-01`), slot(`${p}-02`), slot(`${p}-03`), slot(`${p}-04`, { basement: 'Ground', parkingType: 'FLAT' })] }, { site: s.id });
    assert.ok(r.body.success, JSON.stringify(r.body));
  }
  F.adminA = await c.mkUser('adminA', 'role-site-manager', [F.A.id]);
  F.attA = await c.mkUser('attA', 'role-gate-attendant', [F.A.id]);
});
after(() => srv?.stop());
const slotsAt = async (siteId) => (await c.get('master', '/slots', { site: siteId })).body.slots;

// ------------------------------------------------------------------ B1
test('B1 valid length and pallet level are saved; /slots adds heightM, lengthM, palletLevel', async () => {
  const r = await c.post('adminA', '/slots/save', { slot: slot('A-L1', { lengthM: '5.0 m', palletLevel: 2, height: '2.5m' }) }, { site: F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.slot.lengthM, 5); assert.equal(r.body.slot.palletLevel, 2);
  for (const v of [5, '5', '5.0', '5.0m', '5.0 m']) {
    const u = await c.post('adminA', '/slots/save', { slot: { id: r.body.slot.id, slotNumber: 'A-L1', lengthM: v } }, { site: F.A.id });
    assert.equal(u.body.slot.lengthM, 5, `lengthM ${JSON.stringify(v)}`);
  }
  const got = (await slotsAt(F.A.id)).find((s) => s.slotNumber === 'A-L1');
  assert.equal(got.heightM, 2.5); assert.equal(got.lengthM, 5); assert.equal(got.palletLevel, 2);
  const legacy = (await slotsAt(F.A.id)).find((s) => s.slotNumber === 'A-01');
  assert.equal(legacy.heightM, 2, '"Standard (2.0m)" parses to 2');
  assert.ok(!('lengthM' in legacy) && !('palletLevel' in legacy), 'old slots have neither field');
  const cleared = await c.post('adminA', '/slots/save', { slot: { id: r.body.slot.id, slotNumber: 'A-L1', lengthM: '', palletLevel: null } }, { site: F.A.id });
  assert.ok(!('lengthM' in cleared.body.slot) && !('palletLevel' in cleared.body.slot), 'empty / null clears');
});

test('B1 invalid length or pallet level -> 400 with a field message, nothing saved', async () => {
  const cases = [
    [{ lengthM: 'abc' }, 'lengthM', 'Length must be a number of metres.'],
    [{ lengthM: '5 ft' }, 'lengthM', 'Length must be a number of metres.'],
    [{ lengthM: 0 }, 'lengthM', 'Length must be more than 0 and at most 20 metres.'],
    [{ lengthM: 20.5 }, 'lengthM', 'Length must be more than 0 and at most 20 metres.'],
    [{ palletLevel: 0 }, 'palletLevel', 'Pallet level must be a whole number from 1 to 10.'],
    [{ palletLevel: 11 }, 'palletLevel', 'Pallet level must be a whole number from 1 to 10.'],
    [{ palletLevel: 2.5 }, 'palletLevel', 'Pallet level must be a whole number from 1 to 10.'],
    [{ palletLevel: 'two' }, 'palletLevel', 'Pallet level must be a whole number from 1 to 10.'],
  ];
  for (const [extra, field, msg] of cases) {
    const r = await c.post('adminA', '/slots/save', { slot: slot('A-BAD', extra) }, { site: F.A.id });
    assert.equal(r.status, 400, JSON.stringify(extra)); assert.equal(r.body.errors[field], msg);
  }
  assert.ok(!(await slotsAt(F.A.id)).some((s) => s.slotNumber === 'A-BAD'), 'nothing saved');
});

test('B1 bulk upload: bad rows are reported per row and skipped; old 8-column rows unchanged', async () => {
  const rows = [slot('A-BU1'), slot('A-BU2', { lengthM: '4.8m', palletLevel: '3' }), slot('A-BU3', { lengthM: 'long' }), slot('A-BU4', { palletLevel: 12 })];
  const r = await c.post('adminA', '/slots/bulk-upload', { slots: rows }, { site: F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.added, 2);
  assert.deepEqual(r.body.result.errors, [
    'Row 3 (A-BU3): Length must be a number of metres.',
    'Row 4 (A-BU4): Pallet level must be a whole number from 1 to 10.',
  ]);
  const all = await slotsAt(F.A.id);
  const bu1 = all.find((s) => s.slotNumber === 'A-BU1');
  assert.ok(bu1 && !('lengthM' in bu1), 'an old 8-column row imports exactly as before');
  assert.equal(all.find((s) => s.slotNumber === 'A-BU2').lengthM, 4.8);
  assert.ok(!all.some((s) => s.slotNumber === 'A-BU3' || s.slotNumber === 'A-BU4'));
});

test('B1 mass assignment: a slot save can no longer set fields the form never sends', async () => {
  const base = (await slotsAt(F.A.id)).find((s) => s.slotNumber === 'A-02');
  const r = await c.post('adminA', '/slots/save', { slot: { id: base.id, slotNumber: 'A-02', status: 'OCCUPIED',
    currentVehicle: 'MH12ZZ0001', cameraNumber: 'FAKE-CAM', updatedAt: '1999-01-01T00:00:00.000Z', inSince: 'x', heightM: 99 } }, { site: F.A.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await slotsAt(F.A.id)).find((s) => s.id === base.id);
  assert.equal(after.status, 'OCCUPIED', 'listed field still works');
  assert.ok(!after.currentVehicle, 'currentVehicle not settable without an entry');
  assert.ok(!('cameraNumber' in after), 'cameraNumber not settable');
  assert.notEqual(after.updatedAt, '1999-01-01T00:00:00.000Z');
  assert.equal(after.heightM, 2, 'heightM is computed, not stored from the body');
  const made = await c.post('adminA', '/slots/save', { slot: slot('A-NEW', { currentVehicle: 'MH12ZZ0002', cameraNumber: 'C9' }) }, { site: F.A.id });
  assert.ok(!made.body.slot.currentVehicle && !('cameraNumber' in made.body.slot), 'same on create');
  await c.post('adminA', '/slots/update-status', { slotId: base.id, newStatus: 'VACANT' }, { site: F.A.id });
});

// ------------------------------------------------------------------ seeded "Firestore" servers
// Boots once on an empty fake Firestore (seeds the default roles + bootstrap
// Master into FAKE_DATA_FILE), lets `mutate(data)` add hand-made records with
// exact timestamps, then restarts on that file so the API serves them.
async function seededServer(mutate, env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-r1b-fs-'));
  const dataFile = path.join(dir, 'firestore.json');
  const boot = await startServer({ fake: true, env: { EMPTY_FIRESTORE: '1', FAKE_DATA_FILE: dataFile } });
  boot.stop();
  assert.ok(existsSync(dataFile), 'seed file written');
  const data = JSON.parse(readFileSync(dataFile, 'utf-8'));
  mutate(data);
  writeFileSync(dataFile, JSON.stringify(data));
  const s = await startServer({ fake: true, env: { FAKE_DATA_FILE: dataFile, ...env } });
  const cl = client(s);
  await cl.login('master', MASTER_EMAIL);
  return { srv: s, c: cl, dataFile, readData: () => JSON.parse(readFileSync(dataFile, 'utf-8')),
    restart: async () => { s.stop(); const s2 = await startServer({ fake: true, env: { FAKE_DATA_FILE: dataFile, ...env } }); const c2 = client(s2); await c2.login('master', MASTER_EMAIL); return { srv: s2, c: c2 }; },
    stop: () => { s.stop(); try { rmSync(dir, { recursive: true, force: true }); } catch {} } };
}
const mkSite = (id, code, name) => ({ id, siteCode: code, siteName: name, city: 'Pune', address: 'Addr', contactPerson: 'P', contactEmail: 'p@x.in',
  contactPhone: '+91 98200 00000', totalSlots: 4, basementLevels: 1, hasPuzzleParking: true, hasEVCharging: false, status: 'ACTIVE',
  pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2500, currency: 'INR', taxPercentage: 18 },
  onboardedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const mkSlot = (id, siteId, num, status = 'VACANT', extra = {}) => ({ id, siteId, ...slot(num, { status }), ...extra });
const mkLog = (id, siteId, slotId, slotNumber, entryTime, extra = {}) => ({ id, siteId, vehicleNumber: `MH12AB${id.slice(-4).padStart(4, '0')}`,
  employeeName: 'Guest Visitor', department: 'Visitor', slotId, slotNumber, basement: 'B1', entryTime, exitTime: null, durationMinutes: null,
  entryType: 'MANUAL', status: 'ACTIVE', remarks: '', ...extra });

// ------------------------------------------------------------------ B2
test('B2 inSince: an occupied slot gets its ACTIVE log time; no join across sites; hours bucketed in IST', async () => {
  const T1 = '2026-10-09T04:15:00.000Z';
  const fx = await seededServer((d) => {
    d.sites = [mkSite('s-one', 'ONE', 'Site One'), mkSite('s-two', 'TWO', 'Site Two')];
    d.slots = [mkSlot('one-1', 's-one', 'ONE-01', 'OCCUPIED', { currentVehicle: 'MH12AB0001' }),
      mkSlot('one-2', 's-one', 'ONE-02', 'OCCUPIED', { currentVehicle: 'MH12AB0002' }), mkSlot('one-3', 's-one', 'ONE-03')];
    d.logs = [
      mkLog('log-0001', 's-one', 'one-1', 'ONE-01', T1),
      // ACTIVE log at site TWO that (wrongly) names site ONE's slot: must not join.
      mkLog('log-0002', 's-two', 'one-2', 'ONE-02', '2026-10-09T05:00:00.000Z'),
      // Completed entries at 03:30Z (= 09:00 IST) and 20:00Z (= 01:30 IST next day).
      mkLog('log-0003', 's-one', 'one-3', 'ONE-03', '2026-10-10T03:30:00.000Z', { status: 'COMPLETED', exitTime: '2026-10-10T05:00:00.000Z' }),
      mkLog('log-0004', 's-one', 'one-3', 'ONE-03', '2026-10-10T20:00:00.000Z', { status: 'COMPLETED', exitTime: '2026-10-10T21:00:00.000Z' }),
    ];
  });
  try {
    const slots = (await fx.c.get('master', '/slots', { site: 's-one' })).body.slots;
    assert.equal(slots.find((s) => s.id === 'one-1').inSince, T1);
    assert.ok(!('inSince' in slots.find((s) => s.id === 'one-2')), 'a log at another site never lends its time');
    assert.ok(!('inSince' in slots.find((s) => s.id === 'one-3')), 'vacant slots have no inSince');
    const all = (await fx.c.get('master', '/slots?siteId=ALL')).body.slots;
    assert.ok(!('inSince' in all.find((s) => s.id === 'one-2')), 'not even in All sites mode');
    const peak = (await fx.c.get('master', '/reports/peak-hours?from=2026-10-10T00:00:00.000Z&to=2026-10-11T00:00:00.000Z', { site: 's-one' })).body.hours;
    assert.deepEqual(peak.filter((h) => h.avgEntries > 0).map((h) => h.hour), [1, 9], 'IST hours, not UTC (would be 3 and 20)');
  } finally { fx.stop(); }
});

// ------------------------------------------------------------------ B3
const IST = 330 * 60 * 1000;
const istStart = (ms) => ms + IST - (((ms + IST) % 86400000) + 86400000) % 86400000 - IST;
const istHourOf = (iso) => new Date(new Date(iso).getTime() + IST).getUTCHours();

test('B3 /overview: site required, foreign site 403, ALL refused, FLOOR_PLAN view needed', async () => {
  const none = await c.get('master', '/overview');
  assert.equal(none.status, 400); assert.equal(none.body.errorCode, 'ERR_SITE_REQUIRED');
  const all = await c.get('master', '/overview?siteId=ALL');
  assert.equal(all.status, 400); assert.equal(all.body.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  const foreign = await c.get('adminA', `/overview?siteId=${F.B.id}`);
  assert.equal(foreign.status, 403); assert.equal(foreign.body.errorCode, 'ERR_SITE_FORBIDDEN');
  const ok = await c.get('adminA', '/overview', { site: F.A.id });
  assert.equal(ok.status, 200); assert.equal(ok.body.siteId, F.A.id); assert.equal(ok.body.timezone, 'Asia/Kolkata');
});

test('B3 /overview: a brand-new site has hasHistory:false and real zero counts', async () => {
  const r = await c.get('master', '/overview', { site: F.B.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.hasHistory, false);
  assert.equal(r.body.entriesToday, 0); assert.equal(r.body.exitsToday, 0);
  assert.deepEqual(r.body.latest, []); assert.equal(r.body.oldestPendingDays, null);
  assert.equal(r.body.total, 4); assert.equal(r.body.entriesByHour.length, 24);
});

test('B3 /overview: counts match seeded logs, today and hours in IST, other sites ignored, plates masked by role', async () => {
  const now = Date.now();
  const today = istStart(now);
  const inToday = (ms) => Math.max(today, Math.min(ms, now - 1000));
  const t = {
    activeToday: new Date(inToday(today + 60 * 60 * 1000)).toISOString(),
    doneIn: new Date(inToday(today + 30 * 60 * 1000)).toISOString(),
    doneOut: new Date(now - 500).toISOString(),
    old: new Date(now - 13 * 3600 * 1000).toISOString(),
    yesterday: new Date(today - 20 * 3600 * 1000).toISOString(),
    yesterdayOut: new Date(today - 19 * 3600 * 1000).toISOString(),
  };
  const fx = await seededServer((d) => {
    d.sites = [mkSite('s-one', 'ONE', 'Site One'), mkSite('s-two', 'TWO', 'Site Two')];
    d.slots = [mkSlot('o1', 's-one', 'ONE-01', 'OCCUPIED'), mkSlot('o2', 's-one', 'ONE-02', 'OCCUPIED'), mkSlot('o3', 's-one', 'ONE-03'),
      mkSlot('o4', 's-one', 'ONE-G1', 'VACANT', { basement: 'Ground' }), mkSlot('o5', 's-one', 'ONE-D1', 'MAINTENANCE', { basement: 'Driveway' }),
      mkSlot('t1', 's-two', 'TWO-01', 'OCCUPIED')];
    d.logs = [
      mkLog('log-1001', 's-one', 'o1', 'ONE-01', t.activeToday),
      mkLog('log-1002', 's-one', 'o3', 'ONE-03', t.doneIn, { status: 'COMPLETED', exitTime: t.doneOut }),
      mkLog('log-1003', 's-one', 'o2', 'ONE-02', t.old),
      mkLog('log-1004', 's-one', 'o3', 'ONE-03', t.yesterday, { status: 'COMPLETED', exitTime: t.yesterdayOut }),
      mkLog('log-1005', 's-one', 'o3', 'ONE-03', t.yesterday, { status: 'COMPLETED', exitTime: t.yesterdayOut }),
      mkLog('log-2001', 's-two', 't1', 'TWO-01', t.activeToday),
    ];
    d.registrationRequests = [
      { id: 'rq-1', siteId: 's-one', name: 'P1', email: 'p1@x.in', vehicleNumber: 'MH12AB0101', status: 'PENDING', createdAt: new Date(now - 3.5 * 86400000).toISOString() },
      { id: 'rq-2', siteId: 's-one', name: 'P2', email: 'p2@x.in', vehicleNumber: 'MH12AB0102', status: 'PENDING', createdAt: new Date(now - 86400000).toISOString() },
      { id: 'rq-3', siteId: 's-one', name: 'P3', email: 'p3@x.in', vehicleNumber: 'MH12AB0103', status: 'APPROVED', createdAt: new Date(now - 9 * 86400000).toISOString() },
      { id: 'rq-4', siteId: 's-two', name: 'P4', email: 'p4@x.in', vehicleNumber: 'MH12AB0104', status: 'PENDING', createdAt: new Date(now - 30 * 86400000).toISOString() },
    ];
    d.alerts = [{ id: 'al-1', siteId: 's-one', vehicleNumber: 'MH12AB0200' }, { id: 'al-2', siteId: 's-two', vehicleNumber: 'MH12AB0201' }];
  });
  try {
    const r = await fx.c.get('master', '/overview', { site: 's-one' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const o = r.body;
    const entries = [t.activeToday, t.doneIn, t.old].filter((x) => new Date(x).getTime() >= today);
    assert.equal(o.entriesToday, entries.length);
    assert.equal(o.exitsToday, 1);
    const hours = new Array(24).fill(0); for (const e of entries) hours[istHourOf(e)]++;
    assert.deepEqual(o.entriesByHour, hours, 'IST hour buckets');
    assert.equal(o.occupied, 2); assert.equal(o.total, 5); assert.equal(o.free, 2);
    assert.deepEqual(o.byLevel, [{ level: 'B1', occupied: 2, total: 3 }, { level: 'Ground', occupied: 0, total: 2 }], 'Driveway folds into Ground');
    assert.equal(o.pendingRequests, 2); assert.equal(o.oldestPendingDays, 3);
    assert.equal(o.parkedOver12h, 1); assert.equal(o.nonParkedAlerts, 1);
    assert.equal(o.hasHistory, true);
    assert.equal(o.latest.length, 4);
    assert.equal(o.latest[0].slotNumber, 'ONE-03', 'newest event first (the exit just now)');
    assert.ok(o.latest.every((l) => l.vehicleNumber !== 'MH12AB2001'), 'no log from site two');
    await fx.c.mkUser('auditOne', 'role-mis-auditor', ['s-one']);
    const masked = await fx.c.get('auditOne', '/overview', { site: 's-one' });
    assert.equal(masked.status, 200);
    assert.ok(masked.body.latest.every((l) => !/^MH12AB\d{4}$/.test(l.vehicleNumber)), 'plates masked for a role without plate access: ' + JSON.stringify(masked.body.latest.map((l) => l.vehicleNumber)));
    await fx.c.mkUser('gateOne', 'role-gate-attendant', ['s-one']);
    const plain = await fx.c.get('gateOne', '/overview', { site: 's-one' });
    assert.ok(plain.body.latest.some((l) => /^MH12AB\d{4}$/.test(l.vehicleNumber)), 'gate attendant sees plates (as /logs)');
  } finally { fx.stop(); }
});
