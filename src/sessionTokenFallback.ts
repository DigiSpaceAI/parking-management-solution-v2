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

import {
  getActiveSiteId,
  getViewAsId,
  isSameOriginApiCall,
  SESSION_ENDED_EVENT,
  type SessionEndedDetail,
} from './utils/withSite';

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

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Call once, early (from main.tsx), before any other app code runs.
 * Wraps the global fetch so every request — no matter which of the 70+
 * existing call sites made it — automatically carries:
 *  - the fallback session header, when a token is stored;
 *  - on same-origin `/api/v1/*` calls only, the active site (`x-site-id`)
 *    and the Role View Simulator target (`x-view-as`) from the client site
 *    context (001 design F1). A value the caller set explicitly (header or
 *    `?siteId=` in the URL) is never overridden.
 * It also turns a server "session is over" answer into a
 * `parkflows:session-ended` event so the console can send the user back to
 * sign-in and return them to the same page and site afterwards (F6).
 */
export function installSessionTokenFallback(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApi = isSameOriginApiCall(rawUrl);
    const token = getSessionToken();
    const siteId = isApi ? getActiveSiteId() : null;
    const viewAsId = isApi ? getViewAsId() : null;

    let response: Response;
    if (!token && !siteId && !viewAsId) {
      response = await originalFetch(input, init);
    } else {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (token && !headers.has('x-session-token')) {
        headers.set('x-session-token', token);
      }
      // `?siteId=` wins on the server; don't send a conflicting header.
      if (siteId && !headers.has('x-site-id') && !/[?&]siteId=/.test(rawUrl)) {
        headers.set('x-site-id', siteId);
      }
      if (viewAsId && !headers.has('x-view-as')) {
        headers.set('x-view-as', viewAsId);
      }
      response = await originalFetch(input, { ...init, headers });
    }

    if (isApi && (response.status === 401 || response.status === 403) && !isSignInCall(rawUrl)) {
      notifyIfSessionEnded(response);
    }
    return response;
  };
}

// Sign-in and password screens handle their own 401/403 answers.
function isSignInCall(rawUrl: string): boolean {
  return /\/api\/v1\/auth\/(login|set-password|logout)/.test(rawUrl);
}

function notifyIfSessionEnded(response: Response): void {
  response
    .clone()
    .json()
    .then((body: { errorCode?: string } | null) => {
      const code = body?.errorCode;
      if (code === 'ERR_SESSION_EXPIRED' || code === 'ERR_ACCOUNT_INACTIVE') {
        const detail: SessionEndedDetail = { reason: code };
        window.dispatchEvent(new CustomEvent<SessionEndedDetail>(SESSION_ENDED_EVENT, { detail }));
      }
    })
    .catch(() => {
      /* not JSON: not a session answer */
    });
}
