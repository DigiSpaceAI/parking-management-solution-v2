/**
 * The write-guard seam for design-system components (002 tech design: "Button
 * takes a guard prop that applies the 001 write guard").
 *
 * 001's guard lives in src/utils/withSite.ts (useWriteGuard), which is on the
 * 001 branch but not on `main` yet. R1-pre is built from `main` and must not
 * touch 001 files, so this file is the one place that will import it.
 *
 * AFTER REBASING ONTO `main` WITH 001 MERGED, replace everything below with:
 *
 *   export { useWriteGuard as useGuard } from '../utils/withSite';
 *   export type { WriteGuardProps as GuardProps } from '../utils/withSite';
 *
 * Until then the guard allows every action (there is no All-sites mode or
 * view-as on `main`), and the types below mirror 001's exactly.
 */

/** Same shape as 001's WriteGuardProps. */
export interface GuardProps {
  disabled?: boolean;
  title?: string;
  'aria-disabled'?: boolean;
  'data-write-guard': '';
}

export type GuardFn = (title?: string, opts?: { perSiteRead?: boolean }) => GuardProps;

/** R1-pre stand-in for 001's useWriteGuard: every action allowed. */
export function useGuard(): GuardFn {
  return (title) => ({ title, 'data-write-guard': '' });
}
