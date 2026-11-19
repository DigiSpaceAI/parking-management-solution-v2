import { isFirestoreConfigured } from './firestoreClient';

// 005 Part B (AC-16..AC-20): one named guard for "may this process create demo data?".
// Live = running on Cloud Run (K_SERVICE), or any Firestore project configured.
// No new env vars: it reads K_SERVICE and the existing project ids.
export const isLiveMode = (): boolean => !!process.env.K_SERVICE || isFirestoreConfigured();

/** The ONLY mode in which demo data (generate1080Inventory, demo users/sites/domains) may be created. */
export const isLocalDemoMode = (): boolean => !isLiveMode();

/** First line of every demo-data builder: a mistake fails loudly instead of writing demo records on live. */
export function assertLocalDemoMode(): void {
  if (!isLocalDemoMode()) throw new Error('demo data on live');
}
