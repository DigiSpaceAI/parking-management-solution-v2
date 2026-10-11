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

// ------------------------------------------------------------------ B4
test('B4 /sites/summary: Master 200 with one row per site; Site Admin 403; view-as a non-Master 403', async () => {
  const m = await c.get('master', '/sites/summary');
  assert.equal(m.status, 200, JSON.stringify(m.body));
  assert.ok(Array.isArray(m.body), 'SiteSummaryRow[]');
  const a = m.body.find((r) => r.id === F.A.id);
  assert.ok(a, 'site A listed');
  for (const k of ['siteName', 'city', 'siteCode', 'status', 'onboardedAt', 'occupied', 'total', 'pendingRequests', 'lastActivityAt']) assert.ok(k in a, k);
  assert.ok(m.body.some((r) => r.id === F.B.id), 'every site, unscoped');
  const sa = await c.get('adminA', '/sites/summary');
  assert.equal(sa.status, 403); assert.equal(sa.body.errorCode, 'ERR_MASTER_ONLY');
  const va = await c.get('master', '/sites/summary', { headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403, 'view-as a non-Master'); assert.equal(va.body.errorCode, 'ERR_MASTER_ONLY');
});

test('B4 /sites/summary counts and last activity come from the data', async () => {
  const entry = await c.post('attA', '/vehicles/entry', { vehicleNumber: 'MH12AB4401' }, { site: F.A.id });
  assert.equal(entry.status, 200, JSON.stringify(entry.body));
  const rows = (await c.get('master', '/sites/summary')).body;
  const a = rows.find((r) => r.id === F.A.id); const b = rows.find((r) => r.id === F.B.id);
  const aSlots = await slotsAt(F.A.id);
  assert.equal(a.total, aSlots.length); assert.equal(a.occupied, aSlots.filter((s) => s.status === 'OCCUPIED').length);
  assert.ok(a.lastActivityAt && Date.now() - new Date(a.lastActivityAt).getTime() < 60000, 'last activity = the entry just now');
  assert.equal(b.lastActivityAt, null, 'no logs -> null, not a made-up time');
  await c.post('attA', '/vehicles/exit', { vehicleNumberOrSlot: 'MH12AB4401' }, { site: F.A.id });
});

test('B4 /analytics/prediction is labelled sample:true', async () => {
  const r = await c.get('master', '/analytics/prediction', { site: F.A.id });
  assert.equal(r.status, 200); assert.equal(r.body.sample, true);
});

// ------------------------------------------------------------------ B5
test('B5 /sites/update: Master 200 and the fields change; unknown fields ignored; audit has field names only', async () => {
  const before = (await c.get('master', '/sites')).body.sites.find((s) => s.id === F.A.id);
  const r = await c.post('master', '/sites/update', { siteId: F.A.id, siteName: '  R1b Site A Renamed ', city: 'Mumbai', address: 'Plot 7, MIDC',
    contactPerson: 'Asha Rao', contactEmail: 'asha@r1b-site.in', contactPhone: '98206 03518',
    siteCode: 'HACK', status: 'DECOMMISSIONED', pricing: { hourlyRate: 1 }, totalSlots: 9999 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.site;
  assert.equal(s.siteName, 'R1b Site A Renamed'); assert.equal(s.city, 'Mumbai'); assert.equal(s.address, 'Plot 7, MIDC');
  assert.equal(s.contactPerson, 'Asha Rao'); assert.equal(s.contactEmail, 'asha@r1b-site.in'); assert.equal(s.contactPhone, '+91 98206 03518');
  assert.equal(s.siteCode, before.siteCode); assert.equal(s.status, before.status);
  assert.deepEqual(s.pricing, before.pricing); assert.equal(s.totalSlots, before.totalSlots);
  const audit = (await c.audit('SITE_UPDATED')).find((l) => l.siteId === F.A.id);
  assert.ok(audit, 'SITE_UPDATED audit with siteId');
  assert.match(audit.details, /siteName, city, address, contactPerson, contactEmail, contactPhone/);
  for (const v of ['Mumbai', 'Asha Rao', 'asha@r1b-site.in', '98206', 'Plot 7']) assert.ok(!audit.details.includes(v), `audit has no value: ${v}`);
});

test('B5 /sites/update: Site Admin 403; view-as POST 403; bad email/phone/name 400; unknown site 404', async () => {
  const sa = await c.post('adminA', '/sites/update', { siteId: F.A.id, city: 'X' });
  assert.equal(sa.status, 403); assert.equal(sa.body.errorCode, 'ERR_MASTER_ONLY');
  const va = await c.post('master', '/sites/update', { siteId: F.A.id, city: 'X' }, { headers: { 'x-view-as': F.adminA.id } });
  assert.equal(va.status, 403); assert.equal(va.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const cases = [
    [{ contactEmail: 'not-an-email' }, 'contactEmail'], [{ contactPhone: '12345' }, 'contactPhone'], [{ contactPhone: '+44 20 7946 0958' }, 'contactPhone'],
    [{ siteName: '   ' }, 'siteName'], [{ siteName: 'x'.repeat(81) }, 'siteName'], [{ address: 'x'.repeat(201) }, 'address'], [{ city: 42 }, 'city'],
  ];
  for (const [extra, field] of cases) {
    const r = await c.post('master', '/sites/update', { siteId: F.A.id, ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra)); assert.ok(r.body.errors[field], field);
  }
  assert.equal((await c.get('master', '/sites')).body.sites.find((s) => s.id === F.A.id).city, 'Mumbai', 'nothing changed by refused calls');
  const nf = await c.post('master', '/sites/update', { siteId: 'site-nope', city: 'X' });
  assert.equal(nf.status, 404);
});

// ------------------------------------------------------------------ B6 demo requests (PRD AC-32a–d)
const demo = (extra = {}) => ({ name: 'Asha Rao', company: 'Rao Estates', workEmail: 'asha@raoestates.in', phone: '+919820603518',
  city: 'Pune', facilityType: 'Tech campus', slotsApprox: 450, sitesApprox: 2, preferredContact: 'Email',
  message: 'We run two campuses.', consent: true, pf_hp_field: '', ...extra });
let ipSeq = 10;
const nextIp = () => `203.0.113.${ipSeq++}`;
const submit = (cl, body, ip = nextIp(), o = {}) => cl.call(null, 'POST', '/demo-requests', { body, headers: { 'X-Forwarded-For': ip }, ...o });
const DEMO_FIELDS = new Set(['id', 'createdAt', 'name', 'company', 'workEmail', 'phone', 'city', 'facilityType', 'slotsApprox', 'sitesApprox',
  'preferredContact', 'message', 'consentAt', 'source', 'status', 'handledBy', 'handledAt', 'note']);
const demoList = async (cl) => (await cl.get('master', '/demo-requests')).body.requests;

test('AC-32a valid request is stored and nothing is echoed; invalid fields get their own 400 message; honeypot stores nothing', async () => {
  const before = (await demoList(c)).length;
  const ok = await submit(c, demo({ phone: '98206 03518', slotsApprox: '1,200' }));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { success: true }, 'nothing echoed');
  const list = await demoList(c);
  assert.equal(list.length, before + 1);
  const r = list[0];
  assert.equal(r.name, 'Asha Rao'); assert.equal(r.phone, '+919820603518'); assert.equal(r.slotsApprox, 1200);
  assert.equal(r.status, 'NEW'); assert.equal(r.source, 'parkflows.in'); assert.ok(r.consentAt && r.id.startsWith('demo-'));
  assert.ok(!('pf_hp_field' in r) && !('consent' in r));

  const cases = [
    [{ name: 'A' }, 'name', 'Enter your name (2 to 80 characters).'],
    [{ name: 'x'.repeat(81) }, 'name', 'Enter your name (2 to 80 characters).'],
    [{ company: '' }, 'company', 'Enter your company name (2 to 120 characters).'],
    [{ workEmail: 'asha@raoestates' }, 'workEmail', 'Enter a work email, like name@company.com.'],
    [{ phone: '12345' }, 'phone', 'Enter a 10-digit Indian phone number, like 98206 03518.'],
    [{ phone: '+1 415 555 0100' }, 'phone', 'Enter a 10-digit Indian phone number, like 98206 03518.'],
    [{ city: '' }, 'city', 'Enter your city.'],
    [{ city: 'P' }, 'city', 'Enter your city.'],
    [{ facilityType: 'Airport' }, 'facilityType', 'Choose a facility type.'],
    [{ slotsApprox: 0 }, 'slotsApprox', 'Enter a whole number from 1 to 100,000, or leave it empty.'],
    [{ slotsApprox: 100001 }, 'slotsApprox', 'Enter a whole number from 1 to 100,000, or leave it empty.'],
    [{ sitesApprox: 2.5 }, 'sitesApprox', 'Enter a whole number from 1 to 100,000, or leave it empty.'],
    [{ preferredContact: 'Fax' }, 'preferredContact', 'Choose how we should contact you.'],
    [{ message: 'm'.repeat(1001) }, 'message', 'Keep the message to 1,000 characters or fewer.'],
    [{ consent: false }, 'consent', 'Tick the box so we can contact you about the demo.'],
    [{ consent: 'true' }, 'consent', 'Tick the box so we can contact you about the demo.'],
  ];
  for (const [patch, field, msg] of cases) {
    const bad = await submit(c, demo(patch));
    assert.equal(bad.status, 400, `${field}: ${JSON.stringify(bad.body)}`);
    assert.equal(bad.body.errors[field], msg, field);
    assert.deepEqual(Object.keys(bad.body.errors), [field], `${field}: only its own message`);
  }
  const empty = await submit(c, demo({ slotsApprox: null, sitesApprox: undefined, message: undefined }));
  assert.equal(empty.status, 200, 'optional numbers and message may be empty');

  const n = (await demoList(c)).length;
  const hp = await submit(c, demo({ pf_hp_field: 'http://spam.example' }));
  assert.equal(hp.status, 200); assert.deepEqual(hp.body, { success: true });
  assert.equal((await demoList(c)).length, n, 'honeypot: nothing stored');
});

test('AC-32a 6th request in 10 minutes from one IP -> 429', async () => {
  const ip = nextIp();
  for (let i = 0; i < 5; i++) {
    const r = await submit(c, demo({ name: '' }), ip); // invalid ones count too
    assert.equal(r.status, 400, `request ${i + 1}`);
  }
  const sixth = await submit(c, demo(), ip);
  assert.equal(sixth.status, 429); assert.equal(sixth.body.errorCode, 'ERR_RATE_LIMITED');
  assert.equal((await submit(c, demo())).status, 200, 'another IP is not affected');
});

test('AC-32a 31st stored request in an hour overall -> 429', async () => {
  const s = await startServer();
  try {
    const cl = client(s);
    for (let i = 0; i < 30; i++) {
      const r = await submit(cl, demo({ name: `Prospect ${i}` }));
      assert.equal(r.status, 200, `request ${i + 1}: ${JSON.stringify(r.body)}`);
    }
    const r31 = await submit(cl, demo());
    assert.equal(r31.status, 429); assert.equal(r31.body.errorCode, 'ERR_RATE_LIMITED');
    await cl.login('master', MASTER_EMAIL);
    assert.equal((await demoList(cl)).length, 30, 'the 31st was not stored');
  } finally { s.stop(); }
});

test('AC-32c only POST with a JSON body: GET with query fields 405, form post 415, oversize 413; nothing stored', async () => {
  const n = (await demoList(c)).length;
  const q = new URLSearchParams({ ...demo(), consent: 'true' }).toString();
  const g = await c.call(null, 'GET', `/demo-requests?${q}`);
  assert.equal(g.status, 405); assert.equal(g.headers.get('allow'), 'POST');
  const form = await c.call(null, 'POST', '/demo-requests', { raw: q, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': nextIp() } });
  assert.equal(form.status, 415);
  const big = await submit(c, demo({ message: 'x'.repeat(9000) }));
  assert.equal(big.status, 413); assert.ok(!JSON.stringify(big.body).includes('xxxx'), 'nothing echoed');
  const broken = await c.call(null, 'POST', '/demo-requests', { raw: '{"name": "Asha', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() } });
  assert.equal(broken.status, 400); assert.ok(!JSON.stringify(broken.body).includes('Asha'));
  assert.equal((await demoList(c)).length, n, 'nothing stored');
});

test('AC-32d Master-only: non-Master GET/export/status/DELETE 403, view-as DELETE 403; export escapes =cmd; no browser fields stored', async () => {
  assert.equal((await submit(c, demo({ name: '=cmd|calc', company: '+Rao', message: '@SUM(A1)' }))).status, 200);
  const list = await demoList(c);
  for (const r of list) for (const k of Object.keys(r)) assert.ok(DEMO_FIELDS.has(k), `unexpected stored field ${k}`);
  const id = list[0].id;
  for (const [m, url, body] of [['GET', '/demo-requests'], ['GET', '/demo-requests/export'], ['POST', '/demo-requests/status', { id, status: 'CONTACTED' }], ['DELETE', `/demo-requests/${id}`]]) {
    const r = await c.call('adminA', m, url, { body });
    assert.equal(r.status, 403, `${m} ${url}`); assert.equal(r.body.errorCode, 'ERR_MASTER_ONLY', `${m} ${url}`);
  }
  const vaGet = await c.get('master', '/demo-requests', { headers: { 'x-view-as': F.adminA.id } });
  assert.equal(vaGet.status, 403, 'view-as a non-Master: no list');
  const vaDel = await c.call('master', 'DELETE', `/demo-requests/${id}`, { headers: { 'x-view-as': F.adminA.id } });
  assert.equal(vaDel.status, 403); assert.equal(vaDel.body.errorCode, 'ERR_VIEW_AS_READ_ONLY');

  const csv = await c.get('master', '/demo-requests/export');
  assert.equal(csv.status, 200);
  assert.ok(csv.body.includes(`"'=cmd|calc"`) && csv.body.includes(`"'+Rao"`) && csv.body.includes(`"'@SUM(A1)"`), 'formula cells escaped');
  assert.ok(!/(^|,)"=cmd/m.test(csv.body));

  const st = await c.post('master', '/demo-requests/status', { id, status: 'CONTACTED', note: 'Called back' });
  assert.equal(st.status, 200); assert.equal(st.body.request.status, 'CONTACTED'); assert.equal(st.body.request.handledBy, MASTER_EMAIL);
  assert.equal((await c.post('master', '/demo-requests/status', { id, status: 'DONE' })).status, 400);
  assert.equal((await c.post('master', '/demo-requests/status', { id: 'demo-nope', status: 'CLOSED' })).status, 404);
  const upd = (await c.audit('DEMO_REQUEST_UPDATED')).find((l) => l.targetResource === `demo-request/${id}`);
  assert.ok(upd && !JSON.stringify(upd).includes('cmd|calc') && !JSON.stringify(upd).includes('Called back'), 'audit: id + status only');
  assert.equal((await c.get('master', '/demo-requests?status=CONTACTED')).body.requests.every((r) => r.status === 'CONTACTED'), true);
});

test('AC-32b forced store failure -> plain 500; AC-32d delete and 12-month cleanup remove the Firestore document', async () => {
  const now = Date.now();
  const old = new Date(now); old.setMonth(old.getMonth() - 13);
  const recent = new Date(now); recent.setMonth(recent.getMonth() - 11);
  const rec = (id, createdAt) => ({ id, createdAt, name: 'Old Prospect', company: 'Old Co', workEmail: 'old@oldco.in', phone: '+919800000000',
    city: 'Mumbai', facilityType: 'Mall', preferredContact: 'Phone', consentAt: createdAt, source: 'parkflows.in', status: 'NEW' });
  const fx = await seededServer((d) => { d.demoRequests = [rec('demo-old13', old.toISOString()), rec('demo-recent11', recent.toISOString())]; },
    { FAIL_NEXT_DEMO_SAVE: '1' });
  try {
    // 12-month cleanup ran once the store loaded.
    let ids = [];
    for (let i = 0; i < 20; i++) { ids = (await demoList(fx.c)).map((r) => r.id); if (!ids.includes('demo-old13')) break; await sleep(250); }
    assert.ok(!ids.includes('demo-old13'), 'older than 12 months: removed'); assert.ok(ids.includes('demo-recent11'), '11 months: kept');
    await sleep(300);
    assert.ok(!(fx.readData().demoRequests || []).some((r) => r.id === 'demo-old13'), 'Firestore document deleted');
    const exp = await fx.c.audit('DEMO_REQUESTS_EXPIRED');
    assert.equal(exp.length, 1); assert.ok(exp[0].details.startsWith('1 demo request'), exp[0].details);
    assert.ok(!JSON.stringify(exp[0]).includes('Old Prospect'));

    // AC-32b: plain error body, no stack, nothing echoed, nothing stored.
    const fail = await submit(fx.c, demo({ name: 'Forced Failure' }));
    assert.equal(fail.status, 500);
    assert.deepEqual(Object.keys(fail.body).sort(), ['message', 'success']);
    assert.ok(!/Forced Failure|Error|at \//.test(fail.body.message), fail.body.message);
    assert.ok(!(await demoList(fx.c)).some((r) => r.name === 'Forced Failure'));
    assert.equal((await submit(fx.c, demo({ name: 'After Failure' }))).status, 200, 'next request works');
    await sleep(300);
    const stored = (fx.readData().demoRequests || []).find((r) => r.name === 'After Failure');
    assert.ok(stored, 'targeted sync wrote the new document');
    for (const k of Object.keys(stored)) assert.ok(DEMO_FIELDS.has(k), `no IP / user-agent / browser field: ${k}`);

    // AC-32d: Master DELETE -> gone from the list, from Firestore, and after a re-load.
    assert.equal((await fx.c.call('master', 'DELETE', '/demo-requests/demo-nope')).status, 404);
    const del = await fx.c.call('master', 'DELETE', '/demo-requests/demo-recent11');
    assert.equal(del.status, 200); assert.deepEqual(del.body, { success: true });
    assert.ok(!(await demoList(fx.c)).some((r) => r.id === 'demo-recent11'), 'gone from the list');
    await sleep(300);
    assert.ok(!(fx.readData().demoRequests || []).some((r) => r.id === 'demo-recent11'), 'gone from Firestore');
    const a = (await fx.c.audit('DEMO_REQUEST_DELETED')).find((l) => l.targetResource === 'demo-request/demo-recent11');
    assert.ok(a); assert.equal(a.status, 'SUCCESS');
    assert.equal(a.details, `Demo request demo-recent11 deleted on request by ${MASTER_EMAIL}.`);
    for (const v of ['Old Prospect', 'Old Co', 'old@oldco.in', '+919800000000', 'Mumbai']) assert.ok(!JSON.stringify(a).includes(v), `audit has no ${v}`);
    const r2 = await fx.restart();
    try {
      const after = (await demoList(r2.c)).map((r) => r.id);
      assert.ok(!after.includes('demo-recent11') && !after.includes('demo-old13'), 'still gone after a cold start');
    } finally { r2.srv.stop(); }
  } finally { fx.stop(); }
});
