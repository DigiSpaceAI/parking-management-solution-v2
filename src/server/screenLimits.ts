// 003 B4/B5: the screen routes' own rate limits (03 "Rate limits for the public
// routes", "Abuse limits"). Fixed windows, in memory (max-instances=1, K4),
// separate key spaces from 001's ip:/u: limiter and 002's demo: keys.
// Constants, no env vars.
export class WindowLimiter {
  private buckets = new Map<string, { count: number; resetAt: number; logged: boolean }>();
  constructor(readonly max: number, readonly windowMs: number) {
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) if (now >= b.resetAt) this.buckets.delete(k);
    }, Math.max(windowMs, 10_000));
    sweep.unref();
  }
  /**
   * Counts one request for `key`. `firstRefusal` is true only for the first
   * refusal in a window, so a flood writes one audit row, not thousands.
   */
  hit(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number; firstRefusal: boolean } {
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + this.windowMs, logged: false };
      this.buckets.set(key, b);
    }
    b.count++;
    if (b.count <= this.max) return { ok: true, retryAfterSec: 0, firstRefusal: false };
    const firstRefusal = !b.logged;
    b.logged = true;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)), firstRefusal };
  }
  /** Current count for a key (tests and diagnostics). */
  peek(key: string): number {
    return this.buckets.get(key)?.count || 0;
  }
}

export const FEED_PER_CREDENTIAL = new WindowLimiter(40, 60_000); // normal is 20/min
export const FEED_ALL_SCREENS = new WindowLimiter(3000, 60_000); // ~150 TVs together

// B5 pairing limits (03 "Abuse limits").
export const PAIR_START_ALL = new WindowLimiter(20, 60_000); // platform-wide
export const PAIR_STATUS_PER_SECRET = new WindowLimiter(40, 60_000);
export const PAIR_BIND_PER_USER = new WindowLimiter(10, 10 * 60_000);

// TEST SEAM ONLY (harness PAIR_START_PER_MIN): raise the start limit so the
// 200-pending cap can be exercised. Nothing in the app calls it.
export function __setPairStartLimitForTests(max: number) {
  (PAIR_START_ALL as unknown as { max: number }).max = max;
}

// B7-B9: override writes, per user (03 "Write limit": a stuck button can't flood the audit).
export const OVERRIDE_WRITES_PER_USER = new WindowLimiter(30, 60_000);
