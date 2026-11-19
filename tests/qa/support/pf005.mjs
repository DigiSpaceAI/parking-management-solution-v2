// 005 hotfix harness (backend-dev): boots the store or server.ts against the fake Firestore, run with tsx from a temp cwd.
//   store  -> initDB + bootstrapFirestore, then ACTIONS (comma list: fullsync, delete-slot:<id>, delete-site:<id>), then a JSON REPORT line.
//   server -> boots server.ts (the test talks to it over HTTP; FAKE_REPORT_PORT serves GET /report with the fake's writes).
//   local  -> local demo mode (no project id, no K_SERVICE), no Firestore: initDB only, reports the slot count.
//             With DEMO_GUARD=1 it calls generate1080Inventory directly and reports whether it threw (K_SERVICE is set by the test).
// (the audit log and the _meta timestamp doc are bookkeeping, not records: not counted)
// Env: SEED_FILE (initial Firestore JSON), FAKE_DATA_FILE (persist + restart on the same "Firestore"),
//      MARK_UNAVAILABLE=1 (the Firestore client is gone), NO_PROJECT=1 (no project id), FAKE_FAIL_READS=n.
import path from 'node:path';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FakeFirestore } from './fakeFirestore.mjs';

const REPO = process.env.PF_REPO;
const mode = process.argv[2];
if (mode !== 'local' && process.env.NO_PROJECT !== '1') process.env.FIREBASE_PROJECT_ID = 'fake-project';
const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataFile = process.env.FAKE_DATA_FILE || null;
const seed = dataFile && existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf-8'))
  : process.env.SEED_FILE ? JSON.parse(readFileSync(process.env.SEED_FILE, 'utf-8')) : {};
const fake = new FakeFirestore(seed, { persistFile: dataFile, failReads: Number(process.env.FAKE_FAIL_READS || 0) });
// FAKE_FAIL_COMMITS="appRoles:1" arms commit failures before the store loads (full-sync isolation test)
for (const part of (process.env.FAKE_FAIL_COMMITS || '').split(',').filter(Boolean)) {
  const [col, n] = part.split(':'); fake.failCommit(Number(n || 1), col);
}
const idsOf = () => Object.fromEntries([...fake.data].filter(([c]) => c !== 'securityAuditLogs' && c !== '_meta').map(([c, m]) => [c, [...m.keys()]]));
const before = idsOf();
if (mode !== 'local') {
  const client = await imp('src/server/firestoreClient.ts');
  client.__setFirestoreDbForTests(fake);
  if (process.env.MARK_UNAVAILABLE === '1') client.markFirestoreUnavailable('test: Firestore unavailable');
}
const storeWrites = () => fake.writes.filter((w) => w.collection !== 'securityAuditLogs' && w.collection !== '_meta');

if (mode === 'local' && process.env.DEMO_GUARD === '1') { // calls the demo-data builder directly: report whether it threw
  const db = await imp('src/server/db.ts');
  try { const s = db.__generate1080InventoryForTests(); console.log('REPORT ' + JSON.stringify({ threw: false, slots: s.slots.length })); }
  catch (e) { console.log('REPORT ' + JSON.stringify({ threw: true, message: String(e && e.message) })); }
  process.exit(0);
} else if (mode === 'local') {
  const db = await imp('src/server/db.ts');
  db.initDB();
  console.log('REPORT ' + JSON.stringify({ storeSlots: db.getStore().slots.length, ready: db.isStoreReady() }));
  process.exit(0);
} else if (mode === 'store') {
  const db = await imp('src/server/db.ts');
  db.initDB();
  await db.bootstrapFirestore();
  let rolesSeen = [];
  const migrations = [];
  const finds = [];
  for (const a of (process.env.ACTIONS || '').split(',').filter(Boolean)) {
    if (a === 'fullsync') db.saveDB();
    else if (a.startsWith('delete-slot:')) db.deleteSlot(a.slice(12), true);
    else if (a.startsWith('delete-site:')) db.deleteSite(a.slice(12));
    else if (a === 'migrate-dry' || a === 'migrate-apply') { const before = storeWrites().length; const r = await db.migrateSlotFields(a === 'migrate-apply'); migrations.push({ slotsChanged: r.slotsChanged, ids: r.changedSlotIds, writes: storeWrites().slice(before) }); }
    else if (a.startsWith('find:')) { // find:<TYPE>:<site>:<ids to mark OCCUPIED, joined by +>  (in memory only)
      const [, type, site, occ] = a.split(':');
      db.getStore().slots.forEach((x) => { x.status = (occ || '').split('+').includes(x.id) ? 'OCCUPIED' : 'VACANT'; });
      const f = db.findBestSlot(type, '2.0m', 'EMPLOYEE', site); finds.push(f ? f.id : null);
    }
    else if (a === 'roles') rolesSeen = db.getAppRoles().map((r) => r.id);
  }
  await sleep(4500); // > the 3 s full-sync debounce
  const after = idsOf();
  const newDocs = {};
  for (const [c, ids] of Object.entries(after)) {
    const had = new Set(before[c] || []);
    const added = ids.filter((id) => !had.has(id));
    if (added.length) newDocs[c] = added;
  }
  const st = db.getStore();
  console.log('REPORT ' + JSON.stringify({
    ready: db.isStoreReady(), writes: storeWrites(), newDocs,
    counts: Object.fromEntries(Object.entries(after).map(([c, ids]) => [c, ids.length])),
    store: { slots: st.slots.length, sites: st.sites.length, appRoles: st.appRoles.length, appUsers: st.appUsers.length, domains: st.whitelistedDomains.length },
    roleIds: rolesSeen, migrations, finds, slotIds: st.slots.map((s) => s.id), siteIds: db.getSites().map((s) => s.id), prevented: db.__seedingPreventedForTests(),
  }));
  process.exit(0);
} else {
  if (process.env.FAKE_REPORT_PORT) {
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ writes: storeWrites(), newDocs: Object.entries(idsOf()).flatMap(([c, ids]) => ids.filter((id) => !(before[c] || []).includes(id)).map((id) => `${c}/${id}`)) }));
    }).listen(Number(process.env.FAKE_REPORT_PORT), '127.0.0.1');
  }
  await imp('server.ts');
}
