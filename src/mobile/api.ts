import { getSiteId } from './siteContext';

// The mobile app runs from a different origin than the API once wrapped
// in Capacitor, so every request needs (1) an absolute URL, not a
// relative one, and (2) credentials: 'include' so the session cookie
// actually gets sent cross-origin. Both are easy to silently get wrong,
// so this file centralizes them — every fetch in the mobile app should
// go through apiFetch(), never a bare fetch('/api/...').
//
// Override via a VITE_API_BASE env var (e.g. in a .env.local file, or
// passed at build time) to point at staging/dev without editing this
// file and rebuilding. Falls back to the known-good production URL if
// nothing is set.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  'https://parking-management-solution-v2-git-430896008903.asia-south1.run.app';

const DEFAULT_TIMEOUT_MS = 15000;

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // Without this, a hung connection (dead wifi, backend gone) leaves the
  // UI waiting indefinitely with no feedback — the caller's own loading
  // state never resolves either way. An aborted request still rejects
  // the promise, so existing try/catch blocks handle it the same as any
  // other network failure, just bounded to a sane wait time.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  // Injects the resolved site (see siteContext.ts) as a header on every
  // request, the same centralizing approach as the base URL above —
  // individual call sites never need to remember to pass it themselves.
  const siteId = getSiteId();
  const headers = new Headers(options.headers);
  if (siteId && !headers.has('x-site-id')) {
    headers.set('x-site-id', siteId);
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    signal: options.signal ?? controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}
