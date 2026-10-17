/**
 * The one refresh mechanism (002 AC-11, tech design "useAutoRefresh"): load now, then
 * every 15 s while the tab is visible; pause while it is hidden and load straight away
 * when it comes back if the data is older than the interval. Exposes `updatedAt` for
 * "Updated Xs ago". After the user's own action, call `refresh()` to load at once.
 *
 * Stale responses are dropped with 001's generation check: `load(isCurrent)` must call
 * `isCurrent()` after every await and before it applies anything. isCurrent() is false
 * once the site, the view-as user or the session changed (withSite generation), once the
 * deps changed or the component unmounted, and once a newer load of this hook started.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { getGeneration, isCurrentGeneration } from './withSite';

export const AUTO_REFRESH_MS = 15000;

export interface AutoRefreshState {
  /** Time (ms) of the last successful load, or null before the first one. */
  updatedAt: number | null;
  /** True until the first load for the current deps has finished. */
  loading: boolean;
  /** The last load failed (network or server error). */
  error: boolean;
  /** Load again now. Resolves when that load has finished. */
  refresh: () => Promise<void>;
}

export interface AutoRefreshOptions {
  intervalMs?: number;
  /** false: don't load at all (e.g. no site chosen yet). */
  enabled?: boolean;
}

export function useAutoRefresh(
  load: (isCurrent: () => boolean) => Promise<boolean>,
  deps: DependencyList,
  { intervalMs = AUTO_REFRESH_MS, enabled = true }: AutoRefreshOptions = {}
): AutoRefreshState {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useRef(0); // latest load started
  const epoch = useRef(0); // bumped when deps change or on unmount
  const inFlight = useRef(false);
  const lastAttempt = useRef(0);

  const doLoad = useCallback(async () => {
    const myRun = ++run.current;
    const myEpoch = epoch.current;
    const generation = getGeneration();
    const isCurrent = () => myRun === run.current && myEpoch === epoch.current && isCurrentGeneration(generation);
    inFlight.current = true;
    lastAttempt.current = Date.now();
    let ok = false;
    try {
      ok = await loadRef.current(isCurrent);
    } catch {
      ok = false;
    } finally {
      if (myRun === run.current) inFlight.current = false;
    }
    if (!isCurrent()) return;
    setError(!ok);
    if (ok) setUpdatedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    epoch.current += 1;
    setUpdatedAt(null);
    setError(false);
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void doLoad();
    const tick = () => {
      if (document.visibilityState !== 'visible' || inFlight.current) return;
      void doLoad();
    };
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !inFlight.current && Date.now() - lastAttempt.current >= intervalMs) void doLoad();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      epoch.current += 1;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);

  return { updatedAt, loading, error, refresh: doLoad };
}
