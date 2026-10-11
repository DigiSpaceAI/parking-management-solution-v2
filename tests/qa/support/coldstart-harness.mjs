// Cold-start harness for the 2 Oct hotfix tests (run with tsx, from a temp cwd).
//   store  -> boots the store against a fake "production" Firestore, optionally
//             calls saveDB() before the load finishes, waits past the full-sync
//             debounce, and prints a JSON report of what was written.
//   server -> boots server.ts against the fake with a slow load (FAKE_LOAD_DELAY_MS).
//             FAKE_REPORT_PORT=<port> also serves GET /report with the fake's writes.
//   retry  -> (QA, H-2) the first load fails (FAKE_FAIL_READS), the store must stay
//             not-ready with no writes, then go ready on the retry; after ready a
//             targeted and a full sync must still reach Firestore.
// FAKE_FAIL_READS=n makes the first n store reads throw DEADLINE_EXCEEDED.
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { FakeFirestore, productionSeed } from './fakeFirestore.mjs';

const REPO = process.env.PF_REPO;
const mode = process.argv[2];
process.env.FIREBASE_PROJECT_ID = 'fake-project';
const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const fake = new FakeFirestore(process.env.EMPTY_FIRESTORE === '1' ? {} : productionSeed(), {
  loadDelayMs: Number(process.env.FAKE_LOAD_DELAY_MS || 0),
  failReads: Number(process.env.FAKE_FAIL_READS || 0),
});
const client = await imp('src/server/firestoreClient.ts');
client.__setFirestoreDbForTests(fake);

if (mode === 'store') {
  const db = await imp('src/server/db.ts');
  db.initDB();
  if (process.env.SAVE_BEFORE_LOAD === '1') db.saveDB();
  // Store-sync writes only: the security module's append-only audit entry
  // (SYSTEM_STARTUP_SECURITY_INIT) is not a store sync.
  const storeWrites = () => fake.writes.filter((w) => w.collection !== 'securityAuditLogs');
  await new Promise((r) => setTimeout(r, 3500)); // let any pre-load debounced sync fire
  const writesBeforeLoad = storeWrites().length;
  await db.bootstrapFirestore();
  await new Promise((r) => setTimeout(r, 4000)); // > FULL_SYNC_DEBOUNCE_MS (3 s)
  const doc = (c, id) => fake.data.get(c)?.get(id) || null;
  console.log('REPORT ' + JSON.stringify({
    writesBeforeLoad,
    writes: storeWrites(),
    siteManager: doc('appRoles', 'role-site-manager'),
    master: doc('appUsers', 'usr-digi-master'),
    domains: [...(fake.data.get('whitelistedDomains') || new Map()).values()],
    ready: typeof db.isStoreReady === 'function' ? db.isStoreReady() : null,
  }));
  process.exit(0);
} else if (mode === 'retry') {
  const db = await imp('src/server/db.ts');
  const storeWrites = () => fake.writes.filter((w) => w.collection !== 'securityAuditLogs');
  const seedWrites = () => storeWrites().filter((w) => ['appRoles', 'appUsers', 'whitelistedDomains'].includes(w.collection));
  db.initDB();
  await db.bootstrapFirestore(); // first attempt: the load fails, a retry is scheduled
  await new Promise((r) => setTimeout(r, 4000)); // > full-sync debounce: nothing may fire
  const afterFailure = { ready: db.isStoreReady(), readFailures: fake.readFailures, writes: storeWrites().length };
  const t0 = Date.now();
  while (!db.isStoreReady() && Date.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 200));
  const readyAfterMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 4000));
  const atReady = { ready: db.isStoreReady(), writes: storeWrites().length, seedWrites: seedWrites() };
  const doc = (c, id) => fake.data.get(c)?.get(id) || null;
  const loaded = {
    siteManager: doc('appRoles', 'role-site-manager'),
    master: doc('appUsers', 'usr-digi-master'),
    domains: [...(fake.data.get('whitelistedDomains') || new Map()).values()].map((d) => d.domain),
    storeSites: db.getStore().sites.map((x) => x.id),
  };
  // H-2 (b): a write after ready must still reach Firestore.
  const n0 = fake.writes.length;
  const role = db.getStore().appRoles.find((r) => r.id === 'role-site-manager');
  role.description = 'QA write after ready';
  db.saveDB([{ collection: 'appRoles', ids: ['role-site-manager'] }]);
  await new Promise((r) => setTimeout(r, 1500));
  const targeted = fake.writes.slice(n0).filter((w) => w.collection === 'appRoles' && w.id === 'role-site-manager');
  const n1 = fake.writes.length;
  db.getStore().sites[0].siteName = 'Alphatech (QA full sync)';
  db.saveDB();
  await new Promise((r) => setTimeout(r, 4500)); // > 3 s debounce
  const full = fake.writes.slice(n1).filter((w) => w.collection !== 'securityAuditLogs');
  console.log('REPORT ' + JSON.stringify({
    afterFailure, readyAfterMs, atReady, loaded,
    afterReadyTargeted: targeted.length, storedDescription: doc('appRoles', 'role-site-manager')?.description,
    afterReadyFull: full.length, storedSiteName: doc('sites', 'site-alpha')?.siteName,
  }));
  process.exit(0);
} else {
  if (process.env.FAKE_REPORT_PORT) {
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ readFailures: fake.readFailures, writes: fake.writes.filter((w) => w.collection !== 'securityAuditLogs') }));
    }).listen(Number(process.env.FAKE_REPORT_PORT), '127.0.0.1');
  }
  await imp('server.ts');
}
