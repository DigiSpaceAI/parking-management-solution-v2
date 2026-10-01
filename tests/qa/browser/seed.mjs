// QA browser-check fixtures (step 6, 001-parkflows-platform-v1). Not part of `npm run test:qa`.
// Seeds a running server (in-memory store, Firestore off) through the public API only.
// Usage: node tests/qa/browser/seed.mjs http://127.0.0.1:3950 > fixtures.json
// Accounts (password QaTestPassword#2026): master (bootstrap Master Admin), qa.admina (Site Admin A),
// qa.multiab (Site Admin A+B, non-Master), qa.atta (Attendant A), qa.nosite (no site), qa.uma (non-Master
// custom role with USER_MANAGEMENT at A, for M-2 UI / m-5), qa.nositeatt (Attendant with no site, for M1).
const BASE = (process.argv[2] || 'http://127.0.0.1:3950') + '/api/v1';
const PW = process.env.QA_PW || 'QaTestPassword#2026';
const MASTER = 'digisolutions.fm@gmail.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = {};
const FULL = { enabled: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };

async function call(who, method, url, body, site) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers['x-session-token'] = tok[who];
  if (site) headers['x-site-id'] = site;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (r.status >= 400) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 200)}`);
  return j;
}
const post = (who, url, body, site) => call(who, 'POST', url, body, site);
const login = async (id) => (await post(null, '/auth/login', { identifier: id, password: PW })).token;

async function main() {
  tok.master = await login(MASTER);
  const out = { sites: {}, users: {} };
  for (const [k, code, name] of [['A', 'QAA', 'QA Site A'], ['B', 'QAB', 'QA Site B']]) {
    await sleep(5);
    out.sites[k] = (await post('master', '/sites/onboard', { siteName: name, siteCode: code, city: 'Pune', totalSlots: 6 })).site;
  }
  const A = out.sites.A.id, B = out.sites.B.id;
  for (const [site, pfx] of [[A, 'A'], [B, 'B']]) {
    await post('master', '/slots/bulk-upload', { slots: Array.from({ length: 6 }, (_, i) => ({ siteId: site, slotNumber: `${pfx}-0${i + 1}`,
      basement: 'B1', floorLocation: 'Level 1', slotType: 'SEDAN', height: '2.0m', parkingType: 'FLAT', allocation: 'EMPLOYEE', status: 'VACANT' })) }, site);
  }
  const role = (await post('master', '/rbac/roles', { roleName: 'QA Site HR', roleCode: 'QA_HR', modulePermissions: { HOME: FULL, USER_MANAGEMENT: FULL } })).role;
  const users = [['admina', 'role-site-manager', [A]], ['multiab', 'role-site-manager', [A, B]], ['atta', 'role-gate-attendant', [A]],
    ['nosite', 'role-site-manager', []], ['uma', role.id, [A]], ['nositeatt', 'role-gate-attendant', []]];
  for (const [u, roleId, sites] of users) {
    await sleep(5);
    const r = await post('master', '/rbac/users', { username: `qa.${u}`, fullName: `QA ${u}`, email: `qa.${u}@qa-parkflows.test`,
      roleId, siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: sites, status: 'ACTIVE', plainPassword: PW });
    out.users[u] = { id: r.user.id, email: r.user.email };
    tok[u] = await login(r.user.email);
  }
  // A records carry plate prefix MH12QA, B records MH14QB, so a stale row is visible by text alone.
  for (const [site, pfx, att] of [[A, 'MH12QA', 'atta'], [B, 'MH14QB', null]]) {
    for (const n of [1, 2]) {
      await post('master', '/employees/save', { employee: { siteId: site, employeeId: `${pfx}-E${n}`, name: `${pfx} Emp ${n}`,
        email: `${pfx.toLowerCase()}e${n}@qa-corp.in`, mobile: '+91 98765432' + n + '0', vehicleNumber: `${pfx}000${n}`, vehicleType: 'SEDAN', status: 'ACTIVE' } }, site);
      await post(att || 'master', '/vehicles/entry', { vehicleNumber: `${pfx}000${n}` }, site);
    }
    await post(att || 'master', '/slots/change', { vehicleNumberOrSlot: `${pfx}0001`, newSlotNumber: `${pfx === 'MH12QA' ? 'A' : 'B'}-03`, reason: 'qa seed', attendantName: 'QA' }, site);
    await post('master', '/valet/checkin', { vehicleNumber: `${pfx}V001`, guestName: `${pfx} Guest`, guestPhone: '+91 9111111' + (pfx === 'MH12QA' ? '111' : '222') }, site);
    await post('master', '/domains/add', { domain: `${pfx.toLowerCase()}-only.in` }, site);
  }
  await post('master', '/domains/add', { domain: 'qa-corp.in' });
  for (const [site, pfx] of [[A, 'MH12QA'], [B, 'MH14QB']]) {
    await post(null, '/registrations/submit', { siteId: site, name: `${pfx} Applicant`, email: `${pfx.toLowerCase()}r1@qa-corp.in`,
      mobile: '+91 9000000031', vehicleNumber: `${pfx}R001`, employeeId: `${pfx}-R1` });
  }
  try { await post('master', '/alerts/trigger-cron', {}, A); await post('master', '/alerts/trigger-cron', {}, B); } catch (e) { out.alertsNote = String(e.message).slice(0, 120); }
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
