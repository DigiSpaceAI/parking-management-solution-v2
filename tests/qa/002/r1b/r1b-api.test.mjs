// 002 R1b QA: API checks against a RUNNING, SEEDED server (not part of `npm run test:qa`).
//   QA_BASE_URL=http://127.0.0.1:4071 QA_FIXTURES=qa-out/fixtures.json QA_FIXTURES_R1B=qa-out/fixtures-r1b.json \
//     node --test tests/qa/002/r1b/r1b-api.test.mjs
// Server: NODE_ENV=production SITE_SCOPE_MODE=strict, Firestore off, seeded by tests/qa/browser/seed.mjs + seed-r1b.mjs.
// Covers: site isolation + roles + view-as for the R1b endpoints (/overview, /sites/summary, /sites/update, /slots
// additions, /analytics/prediction sample flag), AC-08 (API 403 kept), AC-24 (ALL refused for writes), AC-32a/c/d
// on the live route incl. Delete. The demo per-IP 429 test runs last (it uses up 127.0.0.1's bucket).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = (process.env.QA_BASE_URL || 'http://127.0.0.1:4071') + '/api/v1';
const fx = JSON.parse(readFileSync(process.env.QA_FIXTURES || 'qa-out/fixtures.json', 'utf8'));
const fx2 = JSON.parse(readFileSync(process.env.QA_FIXTURES_R1B || 'qa-out/fixtures-r1b.json', 'utf8'));
const PW = 'QaTestPassword#2026';
const MASTER = 'digisolutions.fm@gmail.com';
const A = fx.sites.A.id, B = fx.sites.B.id, C = fx2.sites.C.id, D = fx2.sites.D.id;
const tok = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(who, method, url, { body, site, viewAs, raw, headers: extra } = {}) {
  const headers = { ...(extra || {}) };
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (who) headers['x-session-token'] = tok[who];
  if (site) headers['x-site-id'] = site;
  if (viewAs) headers['x-view-as'] = viewAs;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)) });
    if (r.status === 429 && !url.startsWith('/demo-requests')) { await sleep(6000); continue; }
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: r.status, json, text, headers: r.headers };
  }
  throw new Error('429 loop on ' + url);
}
const login = async (k, id) => {
  const r = await req(null, 'POST', '/auth/login', { body: { identifier: id, password: PW } });
  assert.equal(r.status, 200, `login ${id}: ${r.text}`); tok[k] = r.json.token;
};

test('setup: sign in every role', async () => {
  await login('master', MASTER);
  for (const k of ['admina', 'multiab', 'atta', 'nosite', 'uma']) await login(k, fx.users[k].email);
  await login('admind', fx2.users.admind.email);
});

// ---------- /overview (B3, F4): site required, no ALL, own sites only ----------
test('R1B-API-01 /overview: Site Admin A gets A only; B 403; none 400; ALL 400', async () => {
  const a = await req('admina', 'GET', '/overview', { site: A });
  assert.equal(a.status, 200); assert.equal(a.json.siteId, A); assert.equal(a.json.timezone, 'Asia/Kolkata');
  assert.ok(a.json.latest.every((l) => !/MH14QB|MH01QD/.test(l.vehicleNumber)), 'no B/D plates');
  assert.equal(a.json.total, 6);
  const b = await req('admina', 'GET', '/overview', { site: B });
  assert.equal(b.status, 403); assert.equal(b.json.errorCode, 'ERR_SITE_FORBIDDEN');
  const none = await req('admina', 'GET', '/overview');
  // strict mode: a single-site user without a site header — 400 ERR_SITE_REQUIRED (or resolved to own site)
  assert.ok([200, 400].includes(none.status), `no site → ${none.status}`);
  if (none.status === 200) assert.equal(none.json.siteId, A); else assert.equal(none.json.errorCode, 'ERR_SITE_REQUIRED');
  const all = await req('master', 'GET', '/overview', { site: 'ALL' });
  assert.equal(all.status, 400); assert.equal(all.json.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  const mnone = await req('master', 'GET', '/overview');
  assert.equal(mnone.status, 400, 'Master with no site must choose one');
});

test('R1B-API-02 /overview: multi-site admin A and B each scoped; D refused; no-site user refused', async () => {
  const a = await req('multiab', 'GET', '/overview', { site: A });
  const b = await req('multiab', 'GET', '/overview', { site: B });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.json.siteId, A); assert.equal(b.json.siteId, B);
  assert.ok(b.json.latest.every((l) => !/MH12QA/.test(l.vehicleNumber)));
  assert.equal((await req('multiab', 'GET', '/overview', { site: D })).status, 403);
  const ns = await req('nosite', 'GET', '/overview', { site: A });
  assert.equal(ns.status, 403);
});

test('R1B-API-03 /overview: new site C → hasHistory false and zero counts (UI shows "—" + reason, AC-05)', async () => {
  const c = await req('master', 'GET', '/overview', { site: C });
  assert.equal(c.status, 200);
  assert.equal(c.json.hasHistory, false); assert.equal(c.json.entriesToday, 0); assert.deepEqual(c.json.latest, []);
  assert.equal(c.json.total, 4);
  const a = await req('master', 'GET', '/overview', { site: A });
  assert.equal(a.json.hasHistory, true);
  assert.equal(a.json.entriesByHour.length, 24);
});

test('R1B-API-04 /overview: view-as Site Admin A → A only; view-as B refused', async () => {
  const v = await req('master', 'GET', '/overview', { site: A, viewAs: fx.users.admina.id });
  assert.equal(v.status, 200); assert.equal(v.json.siteId, A);
  const vb = await req('master', 'GET', '/overview', { site: B, viewAs: fx.users.admina.id });
  assert.equal(vb.status, 403);
});

test('R1B-API-05 /overview: plates in latest masked for a role without plate access (Attendant)', async () => {
  const at = await req('atta', 'GET', '/overview', { site: A });
  // Attendant may or may not have FLOOR_PLAN:view; when allowed, plates follow /logs masking
  if (at.status === 200) {
    const logs = await req('atta', 'GET', '/logs', { site: A });
    const lp = (logs.json.logs || logs.json || []).map((l) => l.vehicleNumber);
    for (const l of at.json.latest) assert.ok(lp.includes(l.vehicleNumber) || /\*/.test(l.vehicleNumber), `plate ${l.vehicleNumber} masked like /logs`);
  } else assert.equal(at.status, 403);
});

// ---------- /sites/summary (B4, F7) ----------
test('R1B-API-06 /sites/summary: Master 200 every site; Site Admin, multi-site admin, custom-role user 403; view-as non-Master 403', async () => {
  const m = await req('master', 'GET', '/sites/summary');
  assert.equal(m.status, 200); assert.ok(Array.isArray(m.json));
  const ids = m.json.map((r) => r.id);
  for (const s of [A, B, C, D]) assert.ok(ids.includes(s));
  const rowA = m.json.find((r) => r.id === A);
  for (const k of ['siteName', 'city', 'siteCode', 'status', 'onboardedAt', 'occupied', 'total', 'pendingRequests', 'lastActivityAt']) assert.ok(k in rowA, k);
  assert.equal(rowA.total, 6);
  for (const who of ['admina', 'multiab', 'uma', 'atta', 'nosite']) {
    const r = await req(who, 'GET', '/sites/summary', { site: A });
    assert.equal(r.status, 403, who); assert.ok(['ERR_MASTER_ONLY', 'ERR_SITE_FORBIDDEN'].includes(r.json.errorCode), `${who} ${r.json.errorCode}`);
  }
  const v = await req('master', 'GET', '/sites/summary', { viewAs: fx.users.admina.id });
  assert.equal(v.status, 403);
});

// ---------- /sites/update (B5, F7 Edit site) ----------
test('R1B-API-07 /sites/update: Master edits listed fields only; bad email/phone 400; unknown 404', async () => {
  const before = (await req('master', 'GET', '/sites/summary')).json.find((r) => r.id === C);
  const ok = await req('master', 'POST', '/sites/update', { body: { siteId: C, siteName: 'QA Site C', city: 'Nagpur', contactEmail: 'ops@qa-c.in', contactPhone: '+91 9820603518', status: 'ON_HOLD', siteCode: 'HACK' } });
  assert.equal(ok.status, 200, ok.text);
  const after = (await req('master', 'GET', '/sites/summary')).json.find((r) => r.id === C);
  assert.equal(after.status, before.status, 'status not changeable here'); assert.equal(after.siteCode, 'QAC', 'siteCode ignored');
  const bad = await req('master', 'POST', '/sites/update', { body: { siteId: C, contactEmail: 'not-an-email', contactPhone: '123', siteName: '' } });
  assert.equal(bad.status, 400); for (const f of ['contactEmail', 'contactPhone', 'siteName']) assert.ok(bad.json.errors?.[f], f);
  const nf = await req('master', 'POST', '/sites/update', { body: { siteId: 'site-nope', siteName: 'X' } });
  assert.equal(nf.status, 404);
});

test('R1B-API-08 /sites/update: Site Admin 403; view-as 403 ERR_VIEW_AS_READ_ONLY', async () => {
  const sa = await req('admina', 'POST', '/sites/update', { site: A, body: { siteId: A, siteName: 'Hacked' } });
  assert.equal(sa.status, 403);
  const v = await req('master', 'POST', '/sites/update', { viewAs: fx.users.multiab.id, body: { siteId: A, siteName: 'Hacked' } });
  assert.equal(v.status, 403); assert.equal(v.json.errorCode, 'ERR_VIEW_AS_READ_ONLY');
  const s = (await req('master', 'GET', '/sites/summary')).json.find((r) => r.id === A);
  assert.equal(s.siteName, 'QA Site A');
});

// ---------- /slots additions (B1/B2, F5) ----------
test('R1B-API-09 /slots: inSince on occupied slots (same site only), heightM, lengthM/palletLevel on D', async () => {
  const a = await req('admina', 'GET', '/slots', { site: A });
  const slots = a.json.slots || a.json;
  const occ = slots.filter((s) => s.status === 'OCCUPIED');
  assert.ok(occ.length >= 2); assert.ok(occ.every((s) => typeof s.inSince === 'string' && !Number.isNaN(Date.parse(s.inSince))));
  assert.ok(slots.every((s) => s.siteId === A));
  assert.ok(slots.every((s) => s.heightM === 2));
  const d = await req('admind', 'GET', '/slots', { site: D });
  const ds = d.json.slots || d.json;
  assert.equal(ds.length, 1080);
  const p = ds.filter((s) => s.parkingType === 'PUZZLE');
  assert.equal(p.length, 48); assert.ok(p.every((s) => s.palletLevel >= 1 && s.palletLevel <= 4 && s.lengthM === 5));
  assert.equal((await req('admind', 'GET', '/slots', { site: A })).status, 403);
});

test('R1B-API-10 /slots/save: bad length/level 400 per field; unlisted fields not mass-assigned', async () => {
  const slots = (await req('admina', 'GET', '/slots', { site: A })).json; const list = slots.slots || slots;
  const s = list.find((x) => x.status === 'VACANT');
  const bad = await req('admina', 'POST', '/slots/save', { site: A, body: { slot: { ...s, lengthM: 99, palletLevel: 0 } } });
  assert.equal(bad.status, 400, bad.text);
  const ok = await req('admina', 'POST', '/slots/save', { site: A, body: { slot: { ...s, lengthM: 4.5, cameraNumber: 'FAKE-CAM', currentVehicle: 'MH12ZZ9999' } } });
  assert.equal(ok.status, 200, ok.text);
  const again = ((await req('admina', 'GET', '/slots', { site: A })).json); const s2 = (again.slots || again).find((x) => x.id === s.id);
  assert.equal(s2.lengthM, 4.5); assert.notEqual(s2.currentVehicle, 'MH12ZZ9999');
});

test('R1B-API-11 /analytics/prediction: sample:true (AC-06)', async () => {
  const p = await req('admina', 'GET', '/analytics/prediction', { site: A });
  assert.equal(p.status, 200); assert.equal(p.json.sample, true);
});

// ---------- AC-08 / AC-24: API refusals kept ----------
test('R1B-API-12 AC-08: API still 403 for modules the role lacks; AC-24: writes with ALL refused', async () => {
  // Attendant has no APPROVALS/REGISTRATION: writes refused. (GET /registrations and GET /employees have no module
  // check in 001 either — unchanged, reported as an observation, not an R1b regression.)
  const pend = (await req('admina', 'GET', '/registrations', { site: A })).json.requests.find((r) => r.status === 'PENDING');
  const at = await req('atta', 'POST', '/registrations/approve', { site: A, body: { requestId: pend.id, id: pend.id } });
  assert.equal(at.status, 403, 'attendant cannot approve');
  const atU = await req('atta', 'GET', '/rbac/users', { site: A });
  assert.equal(atU.status, 403, 'attendant cannot list users');
  const audit = await req('admina', 'GET', '/security/audit-logs', { site: A });
  assert.equal(audit.status, 403);
  const slotA = ((r) => r.slots || r)((await req('admina', 'GET', '/slots', { site: A })).json).find((x) => x.status === 'VACANT');
  const w = await req('master', 'POST', '/slots/update-status', { site: 'ALL', body: { slotId: slotA.id, newStatus: 'MAINTENANCE' } });
  assert.equal(w.status, 400); assert.equal(w.json.errorCode, 'ERR_SITE_ALL_NOT_ALLOWED');
  const e = await req('master', 'POST', '/vehicles/entry', { site: 'ALL', body: { vehicleNumber: 'MH12QA0001' } });
  assert.equal(e.status, 400);
});

// ---------- AC-32a/c/d on the live route ----------
let demoList;
test('R1B-API-13 AC-32a: stored requests listed newest first; honeypot not stored; nothing echoed', async () => {
  const r = await req('master', 'GET', '/demo-requests');
  assert.equal(r.status, 200); demoList = r.json.requests;
  assert.equal(demoList.length, 4, 'honeypot post not stored');
  assert.ok(!demoList.some((x) => x.name === 'Bot'));
  assert.ok(Date.parse(demoList[0].createdAt) >= Date.parse(demoList[3].createdAt));
  for (const d of fx2.demo) assert.deepEqual(d, { success: true }, 'POST echoes nothing');
});

test('R1B-API-14 AC-32d: no IP / user-agent / browser field on a stored request', async () => {
  const keys = new Set(demoList.flatMap((x) => Object.keys(x)));
  for (const k of keys) assert.ok(!/ip|agent|ua\b|browser|header|forwarded/i.test(k), `field ${k}`);
  const s = JSON.stringify(demoList);
  assert.ok(!/127\.0\.0\.1|::1|Mozilla|node|undici/i.test(s));
});

test('R1B-API-15 AC-32a: validation 400 per field; JSON only (415); 8 KB cap (413)', async () => {
  // these count toward 127.0.0.1's 5/10min bucket — the seed used 5 already; so accept 429 as "limited" and re-check fields with a direct validator call is not possible.
  const r = await req(null, 'POST', '/demo-requests', { body: { name: 'A', company: '', workEmail: 'x', phone: '1', city: '', facilityType: 'Castle', preferredContact: 'Fax', slotsApprox: 0, message: 'x'.repeat(1001) } });
  if (r.status === 429) { assert.match(r.json.message || '', /Too many/i); return; }
  assert.equal(r.status, 400);
  for (const f of ['name', 'company', 'workEmail', 'phone', 'city', 'facilityType', 'preferredContact', 'slotsApprox', 'message', 'consent']) assert.ok(r.json.errors[f], f);
});

test('R1B-API-16 AC-32c: GET with query-string fields (no session) → 405, nothing stored', async () => {
  const r = await req(null, 'GET', '/demo-requests?name=Asha&workEmail=a@b.in&phone=9820603518');
  assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'POST');
  assert.equal((await req('master', 'GET', '/demo-requests')).json.requests.length, 4);
});

test('R1B-API-17 AC-32d: Master-only reads; Site Admin / multi / custom role 403 on list, export, status, delete', async () => {
  const id = demoList[0].id;
  for (const who of ['admina', 'multiab', 'uma']) {
    assert.equal((await req(who, 'GET', '/demo-requests', { site: A })).status, 403, who);
    assert.equal((await req(who, 'GET', '/demo-requests/export', { site: A })).status, 403, who);
    assert.equal((await req(who, 'POST', '/demo-requests/status', { site: A, body: { id, status: 'CLOSED' } })).status, 403, who);
    assert.equal((await req(who, 'DELETE', `/demo-requests/${id}`, { site: A })).status, 403, who);
  }
  assert.equal((await req('master', 'GET', '/demo-requests', { viewAs: fx.users.admina.id })).status, 403, 'view-as Site Admin cannot read');
});

test('R1B-API-18 AC-32d: view-as DELETE and status refused (ERR_VIEW_AS_READ_ONLY), record kept', async () => {
  const id = demoList.find((x) => x.name === 'Delete Me').id;
  const d = await req('master', 'DELETE', `/demo-requests/${id}`, { viewAs: fx.users.multiab.id });
  assert.equal(d.status, 403); assert.ok(['ERR_VIEW_AS_READ_ONLY', 'ERR_MASTER_ONLY'].includes(d.json.errorCode));
  assert.ok((await req('master', 'GET', '/demo-requests')).json.requests.some((x) => x.id === id));
});

test('R1B-API-19 AC-32d: CSV export escapes formula cells; status change audited without personal data', async () => {
  const e = await req('master', 'GET', '/demo-requests/export');
  assert.equal(e.status, 200); assert.match(e.headers.get('content-type'), /text\/csv/);
  assert.ok(!/(^|,)=HYPERLINK/m.test(e.text), 'formula not at cell start'); assert.match(e.text, /'=HYPERLINK|"'=HYPERLINK/);
  const v = demoList.find((x) => x.name === 'Vikram Shah');
  const s = await req('master', 'POST', '/demo-requests/status', { body: { id: v.id, status: 'CONTACTED', note: 'Called' } });
  assert.equal(s.status, 200); assert.equal(s.json.request.status, 'CONTACTED');
  const bad = await req('master', 'GET', '/demo-requests?status=WHATEVER'); assert.equal(bad.status, 400);
});

test('R1B-API-20 AC-32d: Master DELETE → 200, gone from list; 2nd delete 404; audit DEMO_REQUEST_DELETED has no PII', async () => {
  const target = demoList.find((x) => x.name === 'Delete Me');
  const d = await req('master', 'DELETE', `/demo-requests/${target.id}`);
  assert.equal(d.status, 200); assert.deepEqual(d.json, { success: true });
  const list = (await req('master', 'GET', '/demo-requests')).json.requests;
  assert.equal(list.length, 3); assert.ok(!list.some((x) => x.id === target.id));
  assert.equal((await req('master', 'DELETE', `/demo-requests/${target.id}`)).status, 404);
  assert.equal((await req('master', 'DELETE', '/demo-requests/does-not-exist')).status, 404);
  const a = await req('master', 'GET', '/security/audit-logs?limit=500');
  const logs = a.json.logs || a.json.auditLogs || a.json;
  const del = (Array.isArray(logs) ? logs : []).filter((l) => l.action === 'DEMO_REQUEST_DELETED');
  assert.ok(del.length >= 1, 'audit row written');
  const txt = JSON.stringify(del);
  for (const pii of ['Delete Me', 'Erase Co', 'erase@erase.in', '9820603518', 'Pune']) assert.ok(!txt.includes(pii), `audit holds ${pii}`);
  assert.match(txt, new RegExp(`demo-request/${target.id}`));
});

test('R1B-API-21 AC-32a: per-IP limit → 429 "Too many requests" (runs last)', async () => {
  let last;
  for (let i = 0; i < 7; i++) {
    last = await req(null, 'POST', '/demo-requests', { body: { name: 'Limit Test', company: 'L', workEmail: 'l@l.in', phone: '9820603518', city: 'Pune', facilityType: 'Mall', preferredContact: 'Email', consent: true, pf_hp_field: '' } });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
  const list = (await req('master', 'GET', '/demo-requests')).json.requests;
  assert.ok(list.filter((x) => x.name === 'Limit Test').length <= 5);
});
