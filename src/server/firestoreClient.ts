import admin from 'firebase-admin';

// Firestore is optional-at-boot: if it isn't configured yet (no project ID,
// no credentials), the app should still run on local JSON storage rather
// than crash. `getFirestoreDb()` returns null in that case, and every
// call site checks for null before touching Firestore.

let firestoreDb: admin.firestore.Firestore | null = null;
let initAttempted = false;
let initError: string | null = null;

function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    undefined
  );
}

// Synchronous, connection-independent check: does this environment have a
// Firestore project ID configured at all? This is deliberately different
// from "is Firestore currently reachable" — a project ID being present
// but the connection failing this run (network blip, bad credentials,
// permission issue) is a very different situation from Firestore never
// having been set up (e.g. local dev). Callers use this to decide whether
// it's safe to silently fall back to fresh/demo data: safe when Firestore
// was never configured, dangerous when it was configured but temporarily
// unreachable, since a real site's data could be mistaken for "empty" and
// silently overwritten with placeholder content.
export function isFirestoreConfigured(): boolean {
  return !!resolveProjectId();
}

export function getFirestoreDb(): admin.firestore.Firestore | null {
  if (initAttempted) return firestoreDb;
  initAttempted = true;

  const projectId = resolveProjectId();

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    }
    firestoreDb = admin.firestore();
    console.log(
      `[firestore] Connected${projectId ? ` (project: ${projectId})` : ''}.`
    );
  } catch (err: any) {
    initError = err?.message || String(err);
    firestoreDb = null;
    console.warn(
      '[firestore] Not available, falling back to local JSON storage only. ' +
        `Reason: ${initError}`
    );
    console.warn(
      '[firestore] To enable: set FIREBASE_PROJECT_ID (or run on Cloud Run/Cloud ' +
        'Functions where it is set automatically) and make sure the service ' +
        'account has the "Cloud Datastore User" role, and that Firestore ' +
        '(Native mode) is created for the project in the Firebase console.'
    );
  }

  return firestoreDb;
}

export function getFirestoreInitError(): string | null {
  return initError;
}

// Called when a Firestore operation fails in a way that indicates it will
// never succeed this run (bad/missing project ID or credentials). Stops
// further attempts so one misconfiguration doesn't spam the logs with a
// full stack trace on every single save.
export function markFirestoreUnavailable(reason: string) {
  if (firestoreDb !== null) {
    console.warn(`[firestore] Disabling further Firestore calls this run: ${reason}`);
  }
  firestoreDb = null;
  initAttempted = true;
  initError = reason;
}
