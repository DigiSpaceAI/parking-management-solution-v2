/**
 * The override cache (03 v1.2 "Takeover visible until its end time when polling fails", AC-28).
 * The last overrides the server sent are kept in memory and in localStorage, tagged with the
 * display's credential, so a message or forced full stays on screen until its end time even if
 * updates stop or the TV reloads with no network. A successful poll always replaces it; a 401/410
 * wipes it. It holds only public text and end times.
 */
import type { Store } from './env';
import type { FeedOverride } from './types';

export const OVERRIDE_KEY = 'pf-tv-override';
export const NO_OVERRIDE: FeedOverride = { message: null, forcedFull: null };

export function loadOverride(store: Store, tag: string): FeedOverride {
  const raw = store.get(OVERRIDE_KEY);
  if (!raw) return NO_OVERRIDE;
  try {
    const v = JSON.parse(raw) as { tag?: string; message?: FeedOverride['message']; forcedFull?: FeedOverride['forcedFull'] };
    if (!v || v.tag !== tag) return NO_OVERRIDE; // another display's cache: ignored
    return { message: v.message || null, forcedFull: v.forcedFull || null };
  } catch (e) {
    return NO_OVERRIDE;
  }
}

export function saveOverride(store: Store, tag: string, o: FeedOverride): void {
  if (!o.message && !o.forcedFull) store.remove(OVERRIDE_KEY);
  else store.set(OVERRIDE_KEY, JSON.stringify({ tag: tag, message: o.message, forcedFull: o.forcedFull }));
}

export function clearOverride(store: Store): void {
  store.remove(OVERRIDE_KEY);
}
