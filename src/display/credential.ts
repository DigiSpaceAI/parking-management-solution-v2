/**
 * The display credential (03 "TV credential"): from the link's fragment (`#k=<token>`) first, then
 * localStorage, so a reload or restart starts polling at once (AC-16). With neither, the TV pairs.
 * The token only ever goes into the `x-display-token` header; it is never put in a URL.
 */
import type { Store } from './env';

export const TOKEN_KEY = 'pf-tv-token';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** `#k=abc` / `#k=abc&x=1` → "abc"; anything else → null. */
export function tokenFromHash(hash: string): string | null {
  const h = (hash || '').replace(/^#/, '');
  const parts = h.split('&');
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq > 0 && parts[i].slice(0, eq) === 'k') {
      let v = parts[i].slice(eq + 1);
      try {
        v = decodeURIComponent(v);
      } catch (e) {
        return null;
      }
      return TOKEN_RE.test(v) ? v : null;
    }
  }
  return null;
}

/** The link's token wins (and is remembered); otherwise the remembered one. */
export function readCredential(hash: string, store: Store): string | null {
  const fromLink = tokenFromHash(hash);
  if (fromLink) {
    store.set(TOKEN_KEY, fromLink);
    return fromLink;
  }
  const kept = store.get(TOKEN_KEY);
  return kept && TOKEN_RE.test(kept) ? kept : null;
}

/** Short, stable, non-secret tag of a token (for keying the override cache to this display, 03 v1.2). */
export function tokenTag(token: string): string {
  // djb2 over the token: not a secret, only "is this the same credential as before".
  let h = 5381;
  for (let i = 0; i < token.length; i++) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
