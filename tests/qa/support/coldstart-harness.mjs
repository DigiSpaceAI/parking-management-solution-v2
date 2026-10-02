// Cold-start harness for the 2 Oct hotfix tests (run with tsx, from a temp cwd).
//   store  -> boots the store against a fake "production" Firestore, optionally
//             calls saveDB() before the load finishes, waits past the full-sync
//             debounce, and prints a JSON report of what was written.
//   server -> boots server.ts against the fake with a slow load (FAKE_LOAD_DELAY_MS).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FakeFirestore, productionSeed } from './fakeFirestore.mjs';

const REPO = process.env.PF_REPO;
const mode = process.argv[2];
process.env.FIREBASE_PROJECT_ID = 'fake-project';
const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const fake = new FakeFirestore(process.env.EMPTY_FIRESTORE === '1' ? {} : productionSeed(), { loadDelayMs: Number(process.env.FAKE_LOAD_DELAY_MS || 0) });
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
} else {
  await imp('server.ts');
}
