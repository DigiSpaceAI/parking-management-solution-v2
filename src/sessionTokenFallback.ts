/**
 * Session token fallback — works around a real, confirmed Firebase
 * Hosting limitation: cookies other than one named exactly `__session`
 * are stripped from responses proxied through a Cloud Run rewrite, and
 * even `__session` itself has documented cases of the Set-Cookie header
 * never reaching the browser at all through this specific combination
 * (Firebase Hosting + Cloud Run). Confirmed directly in this project:
 * DevTools showed zero cookies of any kind for admin.parkflows.in after
 * a successful login.
 *
 * The fix: the login response already includes the session token in its
 * JSON body (`data.token`) — untouched by any cookie-stripping, since
 * it's not a cookie at all. This module stores that token and
 * automatically attaches it as an `x-session-token` header on every
 * outgoing fetch, so authentication works regardless of whether the
 * cookie makes it through. The backend's requireAuth already checks
 * this header (see security.ts) — this was previously unused.
 *
 * Storage tradeoff, worth being explicit about: sessionStorage is used
 * rather than an HttpOnly cookie, which means this token IS readable by
 * JavaScript running on the page — unlike the cookie, which isn't. That
 * matters if there's ever an XSS vulnerability. This is a deliberate
 * tradeoff for a confirmed, real compatibility problem, not a casual
 * downgrade — the cookie remains the primary mechanism wherever it
 * works; this is specifically the fallback for where it doesn't.
 * sessionStorage (not localStorage) is used so the token doesn't
 * outlive the browser tab.
 */

const TOKEN_KEY = 'parkflow_session_token_fallback';

export function storeSessionToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable (private browsing edge cases, etc.) —
    // the cookie-based path still applies wherever it works; this is
    // only a fallback, not the sole mechanism.
  }
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Same reasoning as above — non-fatal either way.
  }
}

function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Call once, early (from main.tsx), before any other app code runs.
 * Wraps the global fetch so every request — no matter which of the 70+
 * existing call sites made it — automatically carries the fallback
 * header when a token is stored, without needing to touch each call
 * site individually.
 */
export function installSessionTokenFallback(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getSessionToken();
    if (!token) return originalFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('x-session-token')) {
      headers.set('x-session-token', token);
    }

    return originalFetch(input, { ...init, headers });
  };
}
