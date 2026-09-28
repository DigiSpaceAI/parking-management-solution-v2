/**
 * Absolute API base for the web console. Relative '/api/...' paths cannot
 * work inside the Capacitor APK (the page origin is https://localhost, where
 * no server runs). The web dashboard is served by the same host as the API.
 * Override at build time with VITE_API_BASE_URL (e.g. a local server).
 *
 * Shared by LoginScreen (absolute sign-in URL) and the fetch wrapper, which
 * sends the session token only to this origin and the page's own (m-7).
 */
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://parking-management-solution-v2-git-430896008903.asia-south1.run.app'
).replace(/\/$/, '');

/** True for the page's own origin and the API_BASE origin: the only places the session token may go. */
export function isTrustedApiOrigin(rawUrl: string): boolean {
  try {
    const origin = new URL(rawUrl, window.location.origin).origin;
    return origin === window.location.origin || origin === new URL(API_BASE).origin;
  } catch {
    return false;
  }
}
