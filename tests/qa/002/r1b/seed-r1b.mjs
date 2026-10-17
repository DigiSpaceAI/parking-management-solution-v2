// 002 R1b QA fixtures, on top of tests/qa/browser/seed.mjs (001). Seeds a running server through the API only.
//   node tests/qa/002/r1b/seed-r1b.mjs http://127.0.0.1:4071 qa-out/fixtures.json > qa-out/fixtures-r1b.json
// Adds:
//   site C "QA Site C" (QAC): new, 4 slots, no logs, no employees  -> AC-05 "—" + reason, hasHistory:false
//   site D "QA Big D"  (QAD): 1,080 slots (B1/B2/B3/Ground), 12 puzzle stackers x 4 pallets with palletLevel -> AC-14
//   site A: 60 more employees (AC-12 paging at 25/50), 30 pending registrations (Requests tab paging + bulk)
//   demo requests: 4 stored (one with a formula-looking company for the CSV check), 1 honeypot (must not be stored)
//   users: qa.admind (Site Admin, D), qa.adminc (Site Admin, C)
import { readFileSync } from 'node:fs';
const BASE = (process.argv[2] || 'http://127.0.0.1:4071') + '/api/v1';
const fx = JSON.parse(readFileSync(process.argv[3] || 'qa-out/fixtures.json', 'utf8'));
const PW = 'QaTestPassword#2026';
const MASTER = 'digisolutions.fm@gmail.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mtok;
async function call(method, url, body, site, tok = mtok) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['x-session-token'] = tok;
  if (site) headers['x-site-id'] = site;
  for (let i = 0; i < 25; i++) {
    const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    if (r.status === 429) { await sleep(7000); continue; }
    if (r.status >= 400) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 200)}`);
    return j;
  }
  throw new Error(`${method} ${url} kept getting 429`);
}
const post = (url, body, site, tok) => call('POST', url, body, site, tok);

async function main() {
  mtok = (await post('/auth/login', { identifier: MASTER, password: PW }, null, null)).token;
  const out = { sites: {}, users: {}, demo: [] };
  for (const [k, code, name, n] of [['C', 'QAC', 'QA Site C', 4], ['D', 'QAD', 'QA Big D', 1080]]) {
    await sleep(5);
    out.sites[k] = (await post('/sites/onboard', { siteName: name, siteCode: code, city: k === 'C' ? 'Nagpur' : 'Mumbai', totalSlots: n })).site;
  }
  const A = fx.sites.A.id, C = out.sites.C.id, D = out.sites.D.id;
  await post('/slots/bulk-upload', { slots: Array.from({ length: 4 }, (_, i) => ({ siteId: C, slotNumber: `C-0${i + 1}`, basement: 'Ground',
    floorLocation: 'Ground', slotType: 'SEDAN', height: '2.1m', parkingType: 'FLAT', allocation: 'EMPLOYEE', status: 'VACANT' })) }, C);
  // D: 1,032 flat slots + 12 puzzle stackers x 4 pallets = 1,080
  const rows = [];
  const lv = ['B1', 'B2', 'B3', 'Ground'];
  for (let i = 0; i < 1032; i++) {
    const b = lv[i % 4];
    rows.push({ siteId: D, slotNumber: `${b === 'Ground' ? 'G' : b}-${String(Math.floor(i / 4) + 1).padStart(3, '0')}`, basement: b, floorLocation: b === 'Ground' ? 'Ground' : `Basement ${b.slice(1)}`,
      slotType: i % 9 === 0 ? 'SUV' : 'SEDAN', height: i % 9 === 0 ? '2.5m' : '2.1m', lengthM: i % 9 === 0 ? 5 : 4.8, parkingType: 'FLAT', allocation: 'EMPLOYEE', status: i % 7 === 0 ? 'MAINTENANCE' : 'VACANT' });
  }
  for (let p = 1; p <= 12; p++) for (let l = 1; l <= 4; l++) {
    rows.push({ siteId: D, slotNumber: `B2-P${String(p).padStart(2, '0')}-S${l}`, basement: 'B2', floorLocation: 'Basement 2', puzzleNumber: `B2-P${String(p).padStart(2, '0')}`,
      slotType: 'SEDAN', height: '1.6m', lengthM: 5, palletLevel: l, parkingType: 'PUZZLE', allocation: 'EMPLOYEE', status: 'VACANT' });
  }
  for (let i = 0; i < rows.length; i += 250) await post('/slots/bulk-upload', { slots: rows.slice(i, i + 250) }, D);
  // a few occupied on D (entry with an employee pass)
  for (let n = 1; n <= 3; n++) {
    await post('/employees/save', { employee: { siteId: D, employeeId: `MH01QD-E${n}`, name: `MH01QD Emp ${n}`, email: `mh01qde${n}@qa-corp.in`,
      mobile: '+91 98765433' + n + '0', vehicleNumber: `MH01QD000${n}`, vehicleType: 'SEDAN', status: 'ACTIVE' } }, D);
    await post('/vehicles/entry', { vehicleNumber: `MH01QD000${n}` }, D);
  }
  // A: 60 more employees, 30 pending registrations
  await post('/employees/bulk-upload', { employees: Array.from({ length: 60 }, (_, i) => { const n = i + 10; return { siteId: A, employeeId: `MH12QA-E${n}`, name: `MH12QA Staff ${n}`, email: `mh12qa.s${n}@qa-corp.in`,
    mobile: `+91 98${String(10000000 + n).slice(0, 8)}`, vehicleNumber: `MH12QA${String(1000 + n)}`, vehicleType: 'SEDAN', status: 'ACTIVE' }; }) }, A);
  for (let n = 10; n < 40; n++) {
    await post('/registrations/submit', { siteId: A, name: `MH12QA Applicant ${n}`, email: `mh12qa.r${n}@qa-corp.in`,
      mobile: `+91 90${String(10000000 + n).slice(0, 8)}`, vehicleNumber: `MH12QA${String(2000 + n)}`, employeeId: `MH12QA-R${n}` }, null, null);
  }
  for (const [u, site] of [['admind', D], ['adminc', C]]) {
    const r = await post('/rbac/users', { username: `qa.${u}`, fullName: `QA ${u}`, email: `qa.${u}@qa-parkflows.test`, roleId: 'role-site-manager',
      siteScopeType: 'SPECIFIC_SITES', assignedSiteIds: [site], status: 'ACTIVE', plainPassword: PW });
    out.users[u] = { id: r.user.id, email: r.user.email };
  }
  // demo requests (public POST, no session)
  const demo = (o) => ({ name: 'Asha Rao', company: 'Alphatech', workEmail: 'asha@alphatech.in', phone: '98206 03518', city: 'Pune',
    facilityType: 'Tech campus', preferredContact: 'Email', consent: true, pf_hp_field: '', ...o });
  for (const o of [{}, { name: 'Vikram Shah', company: '=HYPERLINK("http://x")', workEmail: 'vikram@corp.in', city: 'Mumbai', facilityType: 'Mall', preferredContact: 'Phone', slotsApprox: 1200, message: 'Two basements & a <b>puzzle</b> stacker.' },
    { name: 'Neha Iyer', company: 'Iyer Hospitals', workEmail: 'neha@iyerhosp.in', facilityType: 'Hospital' }, { name: 'Delete Me', company: 'Erase Co', workEmail: 'erase@erase.in' }]) {
    out.demo.push(await post('/demo-requests', demo(o), null, null));
  }
  out.demo.push(await post('/demo-requests', demo({ name: 'Bot', company: 'Spam', pf_hp_field: 'http://spam' }), null, null));
  try { await post('/alerts/trigger-cron', {}, D); } catch {}
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
